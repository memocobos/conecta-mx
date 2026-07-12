// netlify/functions/portal-recordatorios-diario.js
// Job (cron en netlify.toml) — los días 9 y 24 de cada mes (apertura de cada
// ventana de pago) manda un recordatorio AMABLE a cada cliente del PORTAL que
// esté AL CORRIENTE (sin pagos vencidos), avisándole el monto de su abono de
// esta quincena.
//
// Complementa a portal-morosidad-diario.js (que regaña a los vencidos los días
// 17 y 2): este es el aviso amable de apertura. Para no mandar el amable y el de
// regaño el mismo mes, las solicitudes con algún pago 'vencido' se SALTAN aquí.
//
// Pieza AISLADA: no toca ninguna otra función. Solo NOTIFICA. No crea estados
// ni tablas. Corre 14:00 UTC = 8:00 AM hora MX.
//
// Conexión directa al Supabase del PORTAL con service_role (estilo
// portal-morosidad-diario). Reusa PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY.

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
  }).catch((e) => { console.error('[recordatorios] Email:', e.message); return null; });
  return !!(r && r.ok);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// "$1,234 MXN" — monto del abono de la quincena.
function fmtMxn(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-MX') + ' MXN';
}

// Envoltura HTML simple (saludo + párrafo + cierre), estilo Conecta Reynosa.
function wrapHtml(nombre, cuerpoHtml) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span> · Recordatorio
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">${cuerpoHtml}</div>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Equipo Conecta Reynosa</p>
  </div>
</body></html>`;
}

// Lee pagos por solicitud en lotes (evita URLs gigantes con in.(...) enorme).
// F3-t5: trae cliente_id (dueño de la cuota) y lugar_id (para saber si el plan
// es por lugar y agregar la nota al titular).
async function leerPagos(solIds) {
  const LOTE = 100;
  const out = [];
  for (let i = 0; i < solIds.length; i += LOTE) {
    const chunk = solIds.slice(i, i + LOTE);
    const rows = await sb(
      `pagos?solicitud_id=in.(${chunk.join(',')})&select=solicitud_id,cliente_id,estado,monto,fecha_esperada,lugar_id&limit=5000`
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
  console.log('[recordatorios] Iniciando:', new Date().toISOString());
  if (!SB_URL || !SB_KEY) {
    console.error('[recordatorios] Faltan PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY');
    return { statusCode: 500, body: 'Config faltante' };
  }

  // 1) Solicitudes en_pagos (las pagadas no deben; las pendientes no tienen plan;
  //    las canceladas quedan fuera). cliente_id = titular (fallback de dueño).
  const solicitudes = await sb(
    'solicitudes_tour?estado=eq.en_pagos&select=id,evento_id,evento_nombre,cliente_id'
  );
  if (!Array.isArray(solicitudes) || !solicitudes.length) {
    console.log('[recordatorios] Fin. solicitudes en_pagos:0');
    return { statusCode: 200, body: JSON.stringify({ ok: true, mandados: 0, sinCorreo: 0, conVencidos: 0, sinPendientes: 0, fallidos: 0 }) };
  }
  const solMap = {};
  for (const s of solicitudes) if (s && s.id) solMap[s.id] = s;

  // 2) Pagos de esas solicitudes (con cliente_id del dueño + fecha + lugar_id).
  const ids = solicitudes.map(s => s.id);
  const pagos = await leerPagos(ids);

  // 3) Por (solicitud, DUEÑO de la cuota) (F3-t5): vencidos + pendientes de ESA
  //    persona. En planes viejos el dueño es siempre el titular → una sola llave
  //    por solicitud = idéntico a hoy. porLugarSol marca los planes por lugar.
  const SEP = '|';
  const vencidosSC = {};   // "solId|cid" → conteo de vencidas de esa persona
  const pendientesSC = {}; // "solId|cid" → [{ monto, fecha }]
  const porLugarSol = {};  // solId → true si alguna cuota trae lugar_id
  for (const p of pagos) {
    const sol = solMap[p.solicitud_id];
    if (!sol) continue;
    if (p.lugar_id != null) porLugarSol[p.solicitud_id] = true;
    const cid = p.cliente_id || sol.cliente_id; // DUEÑO (fallback titular)
    if (!cid) continue;
    const key = p.solicitud_id + SEP + cid;
    if (p.estado === 'vencido') {
      vencidosSC[key] = (vencidosSC[key] || 0) + 1;
    } else if (p.estado === 'pendiente') {
      (pendientesSC[key] = pendientesSC[key] || []).push({ monto: Number(p.monto || 0), fecha: p.fecha_esperada });
    }
  }

  // 3b) Datos de los dueños (nombre/correo) por su cliente_id.
  const ownerIds = [...new Set(Object.keys(pendientesSC).map(k => k.split(SEP)[1]))];
  const clientes = ownerIds.length ? await leerClientes(ownerIds) : [];
  const cliMap = {};
  for (const c of clientes) if (c && c.id) cliMap[c.id] = c;

  // 4) Mandar el amable a cada PERSONA al corriente (sin vencidas suyas) con abono
  //    pendiente. Su abono "de ahora" = sus cuota(s) en la fecha pendiente más
  //    temprana (suma si 2+, p.ej. el titular con lugares sin conectar).
  let mandados = 0, sinCorreo = 0, conVencidos = 0, sinPendientes = 0, fallidos = 0;
  for (const key of Object.keys(pendientesSC)) {
    if ((vencidosSC[key] || 0) >= 1) { conVencidos++; continue; } // a esa persona la regaña morosidad
    const solId = key.slice(0, key.indexOf(SEP));
    const cid   = key.slice(key.indexOf(SEP) + 1);
    const sol = solMap[solId];
    if (!sol) continue;
    const pend = pendientesSC[key];
    let minFecha = null;
    for (const q of pend) { const f = String(q.fecha || ''); if (minFecha === null || f < minFecha) minFecha = f; }
    const montoAbonoNum = pend.reduce((a, q) => a + (String(q.fecha || '') === minFecha ? q.monto : 0), 0);

    const c = cliMap[cid] || {};
    const correo = c.correo && String(c.correo).trim();
    const nombreFull = c.nombre_completo || 'cliente';
    const nombre = String(nombreFull).trim().split(/\s+/)[0] || 'cliente';
    const evento = sol.evento_nombre || sol.evento_id || 'tu evento';
    const montoAbono = fmtMxn(montoAbonoNum);

    if (!correo) {
      sinCorreo++;
      console.warn(`[recordatorios] (${solId}/${nombreFull}) SIN correo — saltada.`);
      continue;
    }

    // Nota SOLO al titular de un plan por lugar: su monto es el SUYO, no el del grupo.
    const esTitular = (cid === sol.cliente_id);
    const notaGrupo = (porLugarSol[solId] && esTitular)
      ? `<p style="margin:0 0 14px 0;font-size:13px;color:rgba(255,255,255,.7)">Este es <strong>tu</strong> abono del viaje; cada acompañante con su cuenta recibe el suyo por separado.</p>`
      : '';

    const asunto = `Es momento de tu abono para ${evento} 🎵`;
    const cuerpo = `<p style="margin:0 0 14px 0">Ya abrió tu ventana de pago para tu viaje a <strong>${escapeHtml(evento)}</strong>. Tu abono de esta quincena es de <strong>${montoAbono}</strong>.</p>
    ${notaGrupo}<p style="margin:0 0 14px 0">Realízalo antes de que cierre para mantener tu lugar al corriente, y envíanos tu comprobante.</p>
    <p style="margin:0">¡Gracias por viajar con Conecta!</p>`;
    const ok = await enviarCorreo(correo, asunto, wrapHtml(nombre, cuerpo));
    if (!ok) { fallidos++; continue; }
    mandados++;
  }

  console.log(`[recordatorios] Fin. mandados:${mandados} sinCorreo:${sinCorreo} conVencidos:${conVencidos} sinPendientes:${sinPendientes} fallidos:${fallidos}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, mandados, sinCorreo, conVencidos, sinPendientes, fallidos }) };
};
