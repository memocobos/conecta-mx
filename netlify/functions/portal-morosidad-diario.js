// netlify/functions/portal-morosidad-diario.js
// Job (cron en netlify.toml) — los días 17 y 2 de cada mes manda a cada cliente
// del PORTAL con quincenas vencidas un correo ESCALADO según su nivel de morosidad:
//   nivel 1 (1 vencida)  → aviso amable.
//   nivel 2 (2 vencidas) → lugar congelado / en riesgo.
//   nivel 3 (3+ vencidas)→ última advertencia (baja en proceso).
//
// El nivel es DERIVADO del conteo de pagos 'vencido' (Math.min(vencidos,3));
// NO crea estados ni tablas nuevas. Pieza AISLADA: no toca ninguna otra función.
// Solo NOTIFICA — no da de baja ni congela nada (eso lo hace un humano).
//
// Corre a las 14:00 UTC = 8:00 AM hora MX, DESPUÉS de marcar-vencidos-diario
// (08:00 UTC), así los vencidos del corte (17/2) ya están marcados en la BD.
//
// Conexión directa al Supabase del PORTAL con service_role (estilo
// marcar-vencidos-diario). Reusa PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY.
// Envío vía Resend con remitente de cara al cliente (RESEND_FROM_COBRANZA).

const { aplicarModoPrueba } = require('./_lib/correo-guard');
const { apartarAviso, liberarAviso } = require('./_lib/avisos-cobranza');
const { fetchCatalogo } = require('./_lib/catalogo-index');
const { resolverCuentaDeCatalogo, cajaCuentaHtml } = require('./_lib/cuenta-deposito');

const SB_URL = process.env.PORTAL_SUPABASE_URL;
const SB_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
const HEADERS = {
  apikey: SB_KEY,
  Authorization: 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
};

// Remitente de cara al CLIENTE (no el de Kamehouse, que es interno del equipo).
const FROM = process.env.RESEND_FROM_COBRANZA || 'Conecta Reynosa <admin@conectareynosa.mx>';

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...HEADERS, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`SB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// Envío fail-soft: un correo que truene NO aborta el resto. Devuelve true si se
// despachó, false si faltó key/destinatario o el fetch falló.
async function enviarCorreo(to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return false;
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  }).catch((e) => { console.error('[morosidad] Email:', e.message); return null; });
  return !!(r && r.ok);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// "$1,234 MXN" — saldo restante para el cliente.
function fmtMxn(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-MX') + ' MXN';
}

// Envoltura HTML simple (saludo + párrafo + cierre), estilo Conecta Reynosa.
function wrapHtml(nombre, cuerpoHtml) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span> · Cobranza
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">${cuerpoHtml}</div>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Equipo Conecta Reynosa</p>
  </div>
</body></html>`;
}

// Define asunto + cuerpo por nivel. evento y restante ya vienen escapados/formateados.
function correoNivel(nivel, evento, restanteFmt) {
  const ev = `<strong>${escapeHtml(evento)}</strong>`;
  const saldo = `Saldo pendiente: <strong>${restanteFmt}</strong>.`;
  if (nivel === 1) {
    return {
      asunto: `Tu abono de ${evento} está pendiente`,
      cuerpo: `<p style="margin:0 0 14px 0">No hemos recibido tu abono para tu viaje a ${ev}. Para conservar tu lugar, ponte al corriente lo antes posible.</p>
      <p style="margin:0 0 14px 0">${saldo}</p>
      <p style="margin:0">Haz tu pago y envíanos tu comprobante.</p>`,
    };
  }
  if (nivel === 2) {
    return {
      asunto: `⚠️ Tu lugar para ${evento} está en riesgo`,
      cuerpo: `<p style="margin:0 0 14px 0">Tienes <strong>2 pagos pendientes</strong> para ${ev}, por lo que tu lugar quedó <strong>congelado y en riesgo de baja</strong>. Regulariza cuanto antes.</p>
      <p style="margin:0 0 14px 0">${saldo}</p>
      <p style="margin:0">Recuerda que, salvo cancelación del evento, los abonos no son reembolsables. Si necesitas ayuda, contáctanos.</p>`,
    };
  }
  // nivel 3
  return {
    asunto: `🚨 Último aviso: tu lugar para ${evento} será dado de baja`,
    cuerpo: `<p style="margin:0 0 14px 0">Acumulas <strong>3 pagos pendientes</strong> para ${ev}. Tu lugar está <strong>en proceso de baja</strong>.</p>
    <p style="margin:0 0 14px 0">Si deseas conservarlo, <strong>contáctanos HOY</strong>.</p>
    <p style="margin:0">Una vez dado de baja, el lugar se libera y los abonos no son reembolsables (salvo cancelación del evento).</p>`,
  };
}

// Lee pagos por solicitud en lotes (evita URLs gigantes con in.(...) enorme).
// F3-t5: trae cliente_id (dueño de la cuota) para calcular nivel/deuda por persona.
async function leerPagos(solIds) {
  const LOTE = 100;
  const out = [];
  for (let i = 0; i < solIds.length; i += LOTE) {
    const chunk = solIds.slice(i, i + LOTE);
    const rows = await sb(
      `pagos?solicitud_id=in.(${chunk.join(',')})&select=id,solicitud_id,cliente_id,estado,monto,monto_pagado&limit=5000`
    );
    if (Array.isArray(rows)) out.push(...rows);
  }
  return out;
}

// Lee clientes (dueños de las cuotas) por id en lotes, para nombre/correo.
async function leerClientes(cliIds) {
  const LOTE = 100;
  const out = [];
  for (let i = 0; i < cliIds.length; i += LOTE) {
    const chunk = cliIds.slice(i, i + LOTE);
    const rows = await sb(
      `clientes?id=in.(${chunk.join(',')})&select=id,nombre_completo,correo&limit=5000`
    );
    if (Array.isArray(rows)) out.push(...rows);
  }
  return out;
}

exports.handler = async function () {
  console.log('[morosidad] Iniciando:', new Date().toISOString());
  if (!SB_URL || !SB_KEY) {
    console.error('[morosidad] Faltan PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY');
    return { statusCode: 500, body: 'Config faltante' };
  }

  // 1) Solicitudes en_pagos (las pagadas no deben; las pendientes no tienen plan;
  //    las canceladas quedan fuera). cliente_id = titular (fallback de dueño).
  const solicitudes = await sb(
    'solicitudes_tour?estado=eq.en_pagos&select=id,evento_id,evento_nombre,cliente_id,paquete'
  );
  if (!Array.isArray(solicitudes) || !solicitudes.length) {
    console.log('[morosidad] Fin. solicitudes en_pagos:0');
    return { statusCode: 200, body: JSON.stringify({ ok: true, n1: 0, n2: 0, n3: 0, sinCorreo: 0 }) };
  }
  const solMap = {};
  for (const s of solicitudes) if (s && s.id) solMap[s.id] = s;

  // Gancho 2: catálogo (best-effort) para la caja de cuenta por paquete. Caído →
  // catalogo=null → correos SIN caja (idéntico a hoy).
  const catalogo = await fetchCatalogo();

  // 2) Pagos de esas solicitudes (con cliente_id del dueño).
  const ids = solicitudes.map(s => s.id);
  const pagos = await leerPagos(ids);

  // 3) Agregar por (solicitud, DUEÑO de la cuota) (F3-t5): vencidos de esa persona,
  //    su total (suma de SUS cuotas) y su abonado real (COALESCE(monto_pagado,monto)).
  //    En planes viejos el dueño es siempre el titular y la suma de sus cuotas = el
  //    precio_total → nivel/deuda idénticos a hoy.
  const SEP = '|';
  const vencidosSC = {}; // "solId|cid" → conteo vencidas de esa persona
  const totalSC = {};    // "solId|cid" → suma de SUS cuotas (monto)
  const abonadoSC = {};  // "solId|cid" → suma real pagada por esa persona
  const vencidosIds = {}; // [CAP4-1] "solId|cid" → ids de sus cuotas vencidas
  for (const p of pagos) {
    const sol = solMap[p.solicitud_id];
    if (!sol) continue;
    const cid = p.cliente_id || sol.cliente_id; // DUEÑO (fallback titular)
    if (!cid) continue;
    const key = p.solicitud_id + SEP + cid;
    totalSC[key] = (totalSC[key] || 0) + Number(p.monto || 0);
    if (p.estado === 'vencido') {
      vencidosSC[key] = (vencidosSC[key] || 0) + 1;
      if (p.id) (vencidosIds[key] = vencidosIds[key] || []).push(String(p.id));  // [CAP4-1]
    } else if (p.estado === 'pagado') {
      const real = (p.monto_pagado == null) ? p.monto : p.monto_pagado;
      abonadoSC[key] = (abonadoSC[key] || 0) + Number(real || 0);
    }
  }

  // 3b) Datos de los dueños (nombre/correo) por su cliente_id.
  const ownerIds = [...new Set(Object.keys(vencidosSC).map(k => k.split(SEP)[1]))];
  const clientes = ownerIds.length ? await leerClientes(ownerIds) : [];
  const cliMap = {};
  for (const c of clientes) if (c && c.id) cliMap[c.id] = c;

  // 4) Para cada PERSONA con vencidas >= 1, mandarle SU correo del nivel con SU deuda.
  let n1 = 0, n2 = 0, n3 = 0, sinCorreo = 0, fallidos = 0;
  let saltados_por_duplicado = 0, sin_bitacora = 0;                       // [CAP4-1]
  const hoyMX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  for (const key of Object.keys(vencidosSC)) {
    const vencidos = vencidosSC[key] || 0;
    if (vencidos < 1) continue;
    const solId = key.slice(0, key.indexOf(SEP));
    const cid   = key.slice(key.indexOf(SEP) + 1);
    const sol = solMap[solId];
    if (!sol) continue;

    const c = cliMap[cid] || {};
    const correo = c.correo && String(c.correo).trim();
    const nombreFull = c.nombre_completo || 'cliente';
    const nombre = String(nombreFull).trim().split(/\s+/)[0] || 'cliente';
    const evento = sol.evento_nombre || sol.evento_id || 'tu evento';
    const restante = Math.max(0, (totalSC[key] || 0) - (abonadoSC[key] || 0));
    const nivel = Math.min(vencidos, 3);

    if (!correo) {
      sinCorreo++;
      console.warn(`[morosidad] (${solId}/${nombreFull}) nivel ${nivel} SIN correo — saltada.`);
      continue;
    }

    const { asunto, cuerpo } = correoNivel(nivel, evento, fmtMxn(restante));
    const cajaCuenta = cajaCuentaHtml(resolverCuentaDeCatalogo(catalogo, sol.evento_id, sol.paquete));

    // ⏰ CAP4-1 + 🔢 CAP4-2: cupo del día antes de mandar, AHORA POR NIVEL.
    // La llave es (tipo, pago_id, dia, COALESCE(nivel,0)), así que:
    //   · el mismo nivel dos veces el mismo día → duplicado, no sale;
    //   · subir de nivel 1 a 2 el mismo día → cupo distinto, SÍ sale el grave.
    // El pago que llaveamos es el menor de sus cuotas vencidas: determinista
    // dentro de una corrida, y aunque cambiara al subir de nivel el aviso más
    // grave saldría igual (sería otro cupo por partida doble).
    const pagoMarca = (vencidosIds[key] || []).slice().sort()[0] || null;
    const marca = await apartarAviso({
      portalUrl: SB_URL, portalHeaders: HEADERS, tipo: 'morosidad',
      pagoId: pagoMarca, solicitudId: solId, correo, dia: hoyMX, nivel,
    });
    if (!marca.enviar) { saltados_por_duplicado++; continue; }
    if (marca.sinBitacora) sin_bitacora++;

    const ok = await enviarCorreo(correo, asunto, wrapHtml(nombre, cuerpo + cajaCuenta));
    if (!ok) {
      fallidos++;
      // El nivel viaja también al liberar: se borra EXACTAMENTE el cupo que se
      // apartó, sin llevarse por delante la marca de otro nivel del mismo día.
      if (!marca.sinBitacora) await liberarAviso({ portalUrl: SB_URL, portalHeaders: HEADERS, tipo: 'morosidad', pagoId: pagoMarca, dia: hoyMX, nivel });
      continue;
    }
    if (nivel === 1) n1++; else if (nivel === 2) n2++; else n3++;
  }

  console.log(`[morosidad] Fin. nivel1:${n1} nivel2:${n2} nivel3:${n3} sinCorreo:${sinCorreo} fallidos:${fallidos} saltados_por_duplicado:${saltados_por_duplicado} sin_bitacora:${sin_bitacora}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, n1, n2, n3, sinCorreo, fallidos, saltados_por_duplicado, sin_bitacora }) };
};
