// netlify/functions/apartados-vencidos-diario.js
// Job (cron en netlify.toml) — DIARIO. FASE B tuerca final: aviso de APARTADO
// VENCIDO. Corre 14:30 UTC = 8:30 AM MX, después de la ola de correos de las 8.
//
// REGLA SAGRADA: solo NOTIFICA. NO cambia estados de la solicitud — el vencimiento
// ya se evalúa AL LEER (regla del reloj en _lib/disponibilidad); nadie toca la fila.
// La ÚNICA escritura es la marca de idempotencia `hold_avisado_at` (bitácora de
// aviso, no cambio de estado) para no repetir el correo del mismo apartado.
//
// Busca solicitudes `pendiente` SIN comprobante cuyo hold_expira_at venció en las
// últimas 48h (C2-1) y aún no fueron avisadas; por cada una manda UN correo al cliente
// ("venció pero puedes retomarlo subiendo tu comprobante", con link al portal) y
// marca hold_avisado_at. Al final, si hubo vencidos, UN resumen al admin.
//
// Conexión directa al Supabase del PORTAL con service_role (estilo vence-hoy-diario).
// Reusa PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY. Correo vía correo-guard.

const { aplicarModoPrueba } = require('./_lib/correo-guard');

const SB_URL = process.env.PORTAL_SUPABASE_URL;
const SB_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
const HEADERS = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };

const FROM = process.env.RESEND_FROM_COBRANZA || 'Conecta Reynosa <admin@conectareynosa.mx>';
const FROM_ADMIN = 'Portal Conecta <admin@conectareynosa.mx>';
const ADMIN_TO = 'admin@conectareynosa.mx';
const PORTAL_URL = 'https://conectareynosa.mx/portal';
// [C2-1] La ventana de barrido pasa de 24 a 48 h. Con holds de OXXO de 24 h y un
// cron que corre UNA vez al día, un apartado podía vencer justo después del
// barrido y quedar fuera del siguiente por 24 horas exactas — nunca se avisaba.
// 48 h cubre el peor caso (vence 1 minuto después de la corrida) sin repetir
// correos: la idempotencia la da hold_avisado_at, no la ventana.
const VENTANA_MS = 48 * 60 * 60 * 1000;

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`SB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// Envío fail-soft: un correo que truene NO aborta el resto.
async function enviarCorreo(to, subject, html, from) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return false;
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: from || FROM, to, subject, html }),
  }).catch((e) => { console.error('[apartados-vencidos] Email:', e.message); return null; });
  return !!(r && r.ok);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wrapHtml(nombre, cuerpoHtml) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span> · Tu apartado
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">${cuerpoHtml}</div>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Equipo Conecta Reynosa</p>
  </div>
</body></html>`;
}

// PURO (defensa en profundidad + testeable): ¿esta fila es un apartado vencido que
// aún NO se ha avisado, dentro de la ventana de barrido? Refleja EXACTAMENTE el filtro
// del query. No depende de la BD.
function esApartadoVencido(row, nowMs) {
  if (!row) return false;
  if (row.estado !== 'pendiente') return false;                                   // cancelado/en_pagos/pagado → no
  const comp = row.comprobante_separo_url;
  if (comp != null && String(comp).trim() !== '') return false;                   // con comprobante → no
  // [C2-1] SEPARO YA PAGADO → NO. Un OXXO pagado en la hora 22 conserva su
  // hold_expira_at (nadie muta la fila: regla de Fase B) y su
  // comprobante_separo_url en NULL, porque no hubo comprobante que subir. Sin
  // esta línea, el barrido del día siguiente le mandaría "tu apartado venció"
  // a un cliente QUE YA PAGÓ. Es el peor correo que podemos mandar.
  const pag = row.separo_pagado_at;
  if (pag != null && String(pag).trim() !== '') return false;
  const avis = row.hold_avisado_at;
  if (avis != null && String(avis).trim() !== '') return false;                   // ya avisado → no
  const h = row.hold_expira_at;
  if (h == null || String(h).trim() === '') return false;                         // hold NULL → no
  const t = Date.parse(h);
  if (!Number.isFinite(t)) return false;
  return t <= nowMs && t >= (nowMs - VENTANA_MS);                                  // venció dentro de la ventana
}

// Query PostgREST con el mismo criterio (el guard PURO lo re-verifica).
function pathVencidos(nowMs) {
  const nowISO = new Date(nowMs).toISOString();
  const desdeISO = new Date(nowMs - VENTANA_MS).toISOString();
  const sp = new URLSearchParams();
  sp.set('select', 'id,cliente_id,evento_nombre,evento_id,zona,estado,comprobante_separo_url,hold_expira_at,hold_avisado_at,separo_pagado_at,metodo_separo');
  sp.append('estado', 'eq.pendiente');
  sp.append('comprobante_separo_url', 'is.null');
  sp.append('separo_pagado_at', 'is.null');   // [C2-1] el que ya pagó no "vence"
  sp.append('hold_avisado_at', 'is.null');
  sp.append('hold_expira_at', 'not.is.null');
  sp.append('hold_expira_at', `gte.${desdeISO}`);
  sp.append('hold_expira_at', `lte.${nowISO}`);
  sp.set('limit', '5000');
  return `solicitudes_tour?${sp.toString()}`;
}

async function leerClientes(cliIds) {
  const LOTE = 100; const out = [];
  for (let i = 0; i < cliIds.length; i += LOTE) {
    const chunk = cliIds.slice(i, i + LOTE);
    const rows = await sb(`clientes?id=in.(${chunk.join(',')})&select=id,nombre_completo,correo&limit=5000`);
    if (Array.isArray(rows)) out.push(...rows);
  }
  return out;
}

// Marca de idempotencia (bitácora de aviso). Fails-soft: si truena, se re-intentará
// en la próxima corrida mientras siga dentro de la ventana de barrido.
async function marcarAvisado(id, nowISO) {
  try {
    await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({ hold_avisado_at: nowISO }),
    });
    return true;
  } catch (e) { console.error('[apartados-vencidos] marca falló', id, e.message); return false; }
}

exports.handler = async function () {
  console.log('[apartados-vencidos] Iniciando:', new Date().toISOString());
  if (!SB_URL || !SB_KEY) {
    console.error('[apartados-vencidos] Faltan PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY');
    return { statusCode: 500, body: 'Config faltante' };
  }

  const nowMs = Date.now();
  const nowISO = new Date(nowMs).toISOString();

  // 1) Apartados vencidos en la ventana, pendientes, sin comprobante, SIN separo pagado, no avisados.
  let filas;
  try { filas = await sb(pathVencidos(nowMs)); }
  catch (e) { console.error('[apartados-vencidos] query falló:', e.message); return { statusCode: 502, body: 'query falló' }; }

  // Guard PURO (defensa; también es la verdad que testea el arnés).
  const vencidos = (Array.isArray(filas) ? filas : []).filter((r) => esApartadoVencido(r, nowMs));
  if (!vencidos.length) {
    console.log('[apartados-vencidos] Fin. vencidos=0 avisados=0 fallidos=0');
    return { statusCode: 200, body: JSON.stringify({ ok: true, vencidos: 0, avisados: 0, fallidos: 0 }) };
  }

  // 2) Datos de clientes.
  const cliIds = [...new Set(vencidos.map((v) => v.cliente_id).filter(Boolean))];
  const clientes = await leerClientes(cliIds).catch(() => []);
  const cliMap = {}; for (const c of clientes) if (c && c.id) cliMap[c.id] = c;

  // 3) UN correo por apartado (fails-soft por destinatario). Marca solo si se envió.
  const resultados = await Promise.allSettled(vencidos.map(async (row) => {
    const c = cliMap[row.cliente_id] || {};
    const correo = c.correo && String(c.correo).trim().toLowerCase();
    if (!correo || !correo.includes('@')) return { sent: false, sinCorreo: true };
    const nombre = String(c.nombre_completo || 'cliente').trim().split(/\s+/)[0] || 'cliente';
    const evento = row.evento_nombre || 'tu evento';
    const asunto = `Tu apartado de ${evento} venció — aún puedes retomarlo`;
    const cuerpo = `<p style="margin:0 0 14px 0">Tu apartado para <strong>${escapeHtml(evento)}</strong> venció porque no alcanzamos a recibir tu comprobante a tiempo.</p>
    <p style="margin:0 0 14px 0"><strong>Pero si todavía hay lugares, puedes retomarlo</strong> subiendo tu comprobante en tu portal — apenas lo recibamos, tu lugar queda seguro.</p>
    <p style="margin:0 0 20px 0"><a href="${PORTAL_URL}" style="display:inline-block;background:#ff283b;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px">Ir a mi portal →</a></p>
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.6)">Si ya lo subiste o cambiaste de opinión, ignora este mensaje. — Conecta Reynosa</p>`;
    const enviado = await enviarCorreo(correo, asunto, wrapHtml(nombre, cuerpo));
    let marcado = false;
    if (enviado) marcado = await marcarAvisado(row.id, nowISO);
    return { sent: enviado, marcado, evento };
  }));

  let avisados = 0, fallidos = 0, sinCorreo = 0;
  const porEvento = {};
  for (let i = 0; i < resultados.length; i++) {
    const r = resultados[i];
    if (r.status === 'fulfilled' && r.value && r.value.sent) {
      avisados++;
      const ev = r.value.evento || (vencidos[i] && vencidos[i].evento_nombre) || 'tu evento';
      porEvento[ev] = (porEvento[ev] || 0) + 1;
    } else if (r.status === 'fulfilled' && r.value && r.value.sinCorreo) {
      sinCorreo++;
    } else {
      fallidos++;
    }
  }

  // 4) Resumen al admin (un solo correo) si hubo vencidos.
  try {
    const filasHtml = Object.keys(porEvento).sort().map((ev) =>
      `<tr><td style="padding:4px 10px 4px 0">${escapeHtml(ev)}</td><td style="padding:4px 0;text-align:right"><strong>${porEvento[ev]}</strong></td></tr>`).join('');
    const cuerpoAdmin = `<p style="margin:0 0 12px 0">Corrida del ${escapeHtml(new Date(nowMs).toLocaleString('es-MX', { timeZone: 'America/Monterrey', dateStyle: 'medium', timeStyle: 'short' }))}.</p>
    <p style="margin:0 0 12px 0">Apartados vencidos en las últimas 24h: <strong>${vencidos.length}</strong> · avisados: <strong>${avisados}</strong> · sin correo: <strong>${sinCorreo}</strong> · fallidos: <strong>${fallidos}</strong>.</p>
    <table style="border-collapse:collapse;font-size:14px">${filasHtml}</table>
    <p style="margin:16px 0 0 0;font-size:13px;color:rgba(255,255,255,.6)">Solo aviso — ningún estado se cambió. Revisa el stock del evento en el Palacio si quieres liberar/reasignar.</p>`;
    await enviarCorreo(ADMIN_TO, `Apartados vencidos (24h): ${vencidos.length}`, wrapHtml('equipo', cuerpoAdmin), FROM_ADMIN);
  } catch (e) { console.error('[apartados-vencidos] resumen admin falló:', e.message); }

  console.log(`[apartados-vencidos] Fin. vencidos=${vencidos.length} avisados=${avisados} fallidos=${fallidos}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, vencidos: vencidos.length, avisados, fallidos, sinCorreo }) };
};

// Exporto helpers puros para el arnés (no afecta el runtime del cron).
exports.esApartadoVencido = esApartadoVencido;
exports.pathVencidos = pathVencidos;
