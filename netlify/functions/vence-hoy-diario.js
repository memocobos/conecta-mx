// netlify/functions/vence-hoy-diario.js
// Job (cron en netlify.toml) — DIARIO. Avisa "tu abono vence HOY" a cada cliente
// del PORTAL que tenga un pago PENDIENTE con fecha_esperada = hoy (hora MX).
//
// Cierra la escalera de cobranza del Portal:
//   - apertura amable ..... portal-recordatorios-diario (días 9/24)
//   - ÚLTIMO día (este) .... vence-hoy-diario           (diario, fecha_esperada=hoy)
//   - vencidos escalado .... portal-morosidad-diario     (días 17/2)
//
// Al filtrar por fecha_esperada EXACTA funciona con cualquier calendario, incluidas
// las fechas recorridas por una posposición.
//
// Anti-doble-correo: si la solicitud ya tiene algún pago 'vencido', se SALTA aquí
// (esa persona ya está en la escalera de morosidad) — mismo criterio que el cron
// amable para saltarse morosos.
//
// Pieza AISLADA: solo NOTIFICA. NO cambia estados (los vencidos los marca
// marcar-vencidos-diario). Corre 14:00 UTC = 8:00 AM hora MX.
//
// Conexión directa al Supabase del PORTAL con service_role (estilo
// portal-recordatorios-diario). Reusa PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY.

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
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  }).catch((e) => { console.error('[vence-hoy] Email:', e.message); return null; });
  return !!(r && r.ok);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// "$1,234 MXN"
function fmtMxn(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-MX') + ' MXN';
}

// Envoltura HTML simple (saludo + cuerpo + cierre), estilo Conecta Reynosa.
function wrapHtml(nombre, cuerpoHtml) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span> · Vence hoy
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">${cuerpoHtml}</div>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Equipo Conecta Reynosa</p>
  </div>
</body></html>`;
}

// Lee pagos por solicitud en lotes (evita URLs gigantes con in.(...) enorme).
async function leerPagosEstado(solIds) {
  const LOTE = 100;
  const out = [];
  for (let i = 0; i < solIds.length; i += LOTE) {
    const chunk = solIds.slice(i, i + LOTE);
    const rows = await sb(
      `pagos?solicitud_id=in.(${chunk.join(',')})&select=solicitud_id,estado&limit=5000`
    );
    if (Array.isArray(rows)) out.push(...rows);
  }
  return out;
}

// Lee solicitudes no canceladas por id en lotes.
async function leerSolicitudes(solIds) {
  const LOTE = 100;
  const out = [];
  for (let i = 0; i < solIds.length; i += LOTE) {
    const chunk = solIds.slice(i, i + LOTE);
    const rows = await sb(
      `solicitudes_tour?id=in.(${chunk.join(',')})&estado=neq.cancelado&select=id,cliente_id,evento_nombre&limit=5000`
    );
    if (Array.isArray(rows)) out.push(...rows);
  }
  return out;
}

// Lee clientes por id en lotes.
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
  console.log('[vence-hoy] Iniciando:', new Date().toISOString());
  if (!SB_URL || !SB_KEY) {
    console.error('[vence-hoy] Faltan PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY');
    return { statusCode: 500, body: 'Config faltante' };
  }

  // 1) HOY en hora MX (el cron corre en UTC). 'en-CA' → 'YYYY-MM-DD'.
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });

  // 2) Pagos PENDIENTES que vencen HOY (por fecha_esperada exacta → cualquier calendario).
  const pagosHoy = await sb(
    `pagos?estado=eq.pendiente&fecha_esperada=eq.${hoy}&select=solicitud_id,monto,numero_pago,concepto&limit=5000`
  );
  if (!Array.isArray(pagosHoy) || !pagosHoy.length) {
    console.log(`[vence-hoy] Fin. hoy=${hoy} pagos que vencen hoy:0`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, hoy, enviados: 0, fallidos: 0 }) };
  }

  // 3) Solicitudes NO canceladas de esos pagos (las canceladas se saltan).
  const solIds = [...new Set(pagosHoy.map(p => p.solicitud_id).filter(Boolean))];
  const solicitudes = await leerSolicitudes(solIds);
  const solMap = {}; // id → { cliente_id, evento_nombre }
  for (const s of solicitudes) if (s && s.id) solMap[s.id] = s;

  // 4) Anti-doble-correo: solicitudes con algún pago 'vencido' → las regaña morosidad.
  const pagosEstado = await leerPagosEstado(Object.keys(solMap));
  const vencidosPor = {};
  for (const p of pagosEstado) {
    if (p.estado === 'vencido') vencidosPor[p.solicitud_id] = (vencidosPor[p.solicitud_id] || 0) + 1;
  }

  // 5) Agrupar por cliente_id (un cliente con 2+ pagos que vencen hoy → un solo
  //    correo con la suma y todos los conceptos).
  const porCliente = {}; // cliente_id → { montoSum, conceptos:[], evento_nombre }
  for (const p of pagosHoy) {
    const sol = solMap[p.solicitud_id];
    if (!sol) continue;                                   // solicitud cancelada / inexistente
    if ((vencidosPor[p.solicitud_id] || 0) >= 1) continue; // ya en morosidad
    const cid = sol.cliente_id;
    if (!cid) continue;
    let acc = porCliente[cid];
    if (!acc) { acc = { montoSum: 0, conceptos: [], evento_nombre: sol.evento_nombre || 'tu evento' }; porCliente[cid] = acc; }
    acc.montoSum += Number(p.monto) || 0;
    acc.conceptos.push(p.concepto || ('Abono ' + p.numero_pago));
  }
  const cliIds = Object.keys(porCliente);
  if (!cliIds.length) {
    console.log(`[vence-hoy] Fin. hoy=${hoy} tras excluir cancelados/morosos: 0 destinatarios`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, hoy, enviados: 0, fallidos: 0 }) };
  }

  // 6) Datos de los clientes; dedup por correo (por si 2 cliente_id comparten correo).
  const clientes = await leerClientes(cliIds);
  const cliMap = {};
  for (const c of clientes) if (c && c.id) cliMap[c.id] = c;

  const destinatarios = {}; // correo → { nombre, montoSum, conceptos:[], evento_nombre }
  let sinCorreo = 0;
  for (const cid of cliIds) {
    const c = cliMap[cid] || {};
    const correo = c.correo && String(c.correo).trim().toLowerCase();
    if (!correo || !correo.includes('@')) { sinCorreo++; continue; }
    const acc = porCliente[cid];
    const nombre = String(c.nombre_completo || 'cliente').trim().split(/\s+/)[0] || 'cliente';
    let d = destinatarios[correo];
    if (!d) { d = { nombre, montoSum: 0, conceptos: [], evento_nombre: acc.evento_nombre }; destinatarios[correo] = d; }
    d.montoSum += acc.montoSum;
    d.conceptos.push(...acc.conceptos);
  }

  // 7) Enviar el aviso "vence hoy".
  const correos = Object.keys(destinatarios);
  const resultados = await Promise.allSettled(correos.map((correo) => {
    const d = destinatarios[correo];
    const evento = d.evento_nombre;
    const monto = fmtMxn(d.montoSum);
    const concepto = d.conceptos.join(' + ');
    const asunto = `⏰ Tu abono vence HOY — ${evento}`;
    const cuerpo = `<p style="margin:0 0 14px 0">Hoy es el <strong>último día</strong> para cubrir tu abono de <strong>${escapeHtml(monto)}</strong> (${escapeHtml(concepto)}) de tu viaje a <strong>${escapeHtml(evento)}</strong>.</p>
    <p style="margin:0 0 14px 0">Después de hoy el pago queda <strong>vencido</strong> y tu lugar entra en riesgo.</p>
    <p style="margin:0">Manda tu comprobante por WhatsApp hoy mismo. — Conecta Reynosa</p>`;
    return enviarCorreo(correo, asunto, wrapHtml(d.nombre, cuerpo));
  }));

  let enviados = 0, fallidos = 0;
  for (const r of resultados) {
    if (r.status === 'fulfilled' && r.value === true) enviados++;
    else fallidos++;
  }

  console.log(`[vence-hoy] Fin. hoy=${hoy} enviados:${enviados} fallidos:${fallidos} sinCorreo:${sinCorreo}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, hoy, enviados, fallidos, sinCorreo }) };
};
