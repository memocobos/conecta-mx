// netlify/functions/ventas-limite-cron.js
// (VENDEDORES F4 — cron de expiración del límite de 8 días)
//
// Job DIARIO (schedule en netlify.toml, 14:00 UTC = 8:00 AM MX, slot de cobranza).
// Barre las VENTAS de vendedor (solicitudes_tour con vendedor_id) que siguen
// PENDIENTES y cuyo `vende_limite` ya venció (o vence hoy/mañana), y manda UN
// correo resumen al admin para que Bulma reaccione.
//
// REGLA DE LA CASA: los crons SOLO NOTIFICAN. Este cron JAMÁS escribe estados —
// no cancela nada. La cancelación es un acto MANUAL de Bulma (botón en KameHouse
// que reusa el flujo de cancelación existente y libera inventario). Todos los
// fetches a Supabase son GET; lo único que se POSTea es el correo a Resend.
//
// Correo (uno por corrida, si hay algo que reportar):
//   · VENCIDAS: por venta → vendedor, cliente, evento, zona/paquete, total/separo
//     sellados y días vencida.
//   · POR VENCER (hoy/mañana): sección para reaccionar antes. Nada al cliente ni
//     al vendedor en esta fase.
// Sin ventas → corrida en silencio. aplicarModoPrueba en el único call site.
//
// Molde: contratos-alerta-cron. Mundo PORTAL (solicitudes_tour + clientes) + KH
// (usuarios, solo para el nombre del vendedor, best-effort).
//
// Env: PORTAL_SUPABASE_URL/SERVICE_KEY, SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE,
//      RESEND_KEY, CORREOS_MODO/CORREOS_PRUEBA_DESTINO (correo-guard).

const { aplicarModoPrueba } = require('./_lib/correo-guard');

const SB_URL = process.env.PORTAL_SUPABASE_URL;
const SB_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const FROM_ADMIN = 'Ventas Conecta <admin@conectareynosa.mx>';
const ADMIN_TO   = 'admin@conectareynosa.mx';

// GET-only a Supabase (el cron nunca escribe). Lanza en error real.
async function sbGet(baseUrl, key, path) {
  const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  });
  if (!res.ok) throw new Error(`SB ${res.status}: ${await res.text()}`);
  return res.json();
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtMxn(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-MX'); }

// Hoy en hora MX ('YYYY-MM-DD'), patrón en-CA/Monterrey de los crons de cobranza.
function _hoyMx() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' }); }

// 'YYYY-MM-DD' + N días → 'YYYY-MM-DD'.
function _addDias(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Días enteros a−b.
function _dias(aISO, bISO) {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(aISO || ''));
  const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(bISO || ''));
  if (!m1 || !m2) return null;
  return Math.round((Date.UTC(+m1[1], +m1[2] - 1, +m1[3]) - Date.UTC(+m2[1], +m2[2] - 1, +m2[3])) / 86400000);
}

// ── PURO (sin IO): clasifica ventas PENDIENTES por su vende_limite. ──
// vencida = vende_limite < hoy (dias = hoy − limite, > 0). por-vencer = limite ∈
// {hoy, mañana} (dias = limite − hoy: 0 hoy, 1 mañana).
function _clasificar(ventas, hoyISO) {
  const manana = _addDias(hoyISO, 1);
  const vencidas = [], porVencer = [];
  for (const v of (ventas || [])) {
    const lim = String((v && v.vende_limite) || '').slice(0, 10);
    if (!lim) continue;
    if (lim < hoyISO) vencidas.push({ v, dias: _dias(hoyISO, lim) });
    else if (lim === hoyISO || lim === manana) porVencer.push({ v, dias: _dias(lim, hoyISO) });
  }
  vencidas.sort((a, b) => b.dias - a.dias);   // la más vencida primero
  porVencer.sort((a, b) => a.dias - b.dias);  // hoy antes que mañana
  return { vencidas, porVencer };
}

// Total/separo de una venta: del snapshot sellado si existe, si no las columnas.
function _totales(v) {
  const s = (v && v.precio_sellado && typeof v.precio_sellado === 'object') ? v.precio_sellado : {};
  return {
    total: (s.total != null) ? s.total : v.precio_total,
    separo: (s.separo != null) ? s.separo : v.monto_separo,
  };
}
function _clienteNombre(v) {
  const c = (v && v.clientes) ? (Array.isArray(v.clientes) ? v.clientes[0] : v.clientes) : null;
  return (c && c.nombre_completo) || '—';
}

// ── PURO: correo resumen al admin, o null si no hay nada que reportar. ──
function _correoAdmin(clasif, nombreVend) {
  const { vencidas, porVencer } = clasif;
  if (!vencidas.length && !porVencer.length) return null;
  const vName = (v) => escapeHtml(nombreVend[v.vendedor_id] || (v.vendedor_id ? String(v.vendedor_id).slice(0, 8) : '—'));

  const fila = (item, colDias) => {
    const v = item.v; const t = _totales(v);
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${vName(v)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(_clienteNombre(v))}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(v.evento_nombre || v.evento_id || '')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(v.zona || '')} · ${escapeHtml(v.paquete || '')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${fmtMxn(t.total)} <span style="color:#888">/ sep ${fmtMxn(t.separo)}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${colDias(item)}</td>
    </tr>`;
  };
  const tabla = (titulo, items, colLbl, colDias) => `
    <h3 style="margin:22px 0 6px">${titulo}</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr>
        <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #111">Vendedor</th>
        <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #111">Cliente</th>
        <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #111">Evento</th>
        <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #111">Zona · Paquete</th>
        <th style="padding:6px 10px;text-align:right;border-bottom:2px solid #111">Total / Separo</th>
        <th style="padding:6px 10px;text-align:center;border-bottom:2px solid #111">${colLbl}</th>
      </tr></thead>
      <tbody>${items.map(it => fila(it, colDias)).join('')}</tbody>
    </table>`;

  let bloques = '';
  if (vencidas.length) {
    bloques += tabla(`⛔ Vencidas (${vencidas.length}) — cancélalas si el cliente ya no responde`, vencidas,
      'Días vencida', it => `${it.dias} día${it.dias === 1 ? '' : 's'}`);
  }
  if (porVencer.length) {
    bloques += tabla(`⏳ Por vencer (${porVencer.length}) — reacciona antes`, porVencer,
      'Vence', it => it.dias === 0 ? 'HOY' : 'mañana');
  }

  const subject = `💸 Ventas de vendedor — ${vencidas.length} vencida${vencidas.length === 1 ? '' : 's'}${porVencer.length ? ` · ${porVencer.length} por vencer` : ''}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 6px">💸 Límite de ventas (vendedores)</h2>
      <p style="margin:0 0 4px;font-size:13px;color:#555">Ventas de vendedor aún pendientes al vencer su límite de 8 días. Cancélalas a mano desde KameHouse → Ventas → Mis Ventas (el cron NO cancela nada).</p>
      ${bloques}
      <p style="margin-top:24px;font-size:12px;color:#888">— Cron de límite de ventas</p>
    </div>`;
  return { to: ADMIN_TO, subject, html };
}

// Envío (aplica modo prueba). Fail-soft.
async function enviar(to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return false;
  const mp = aplicarModoPrueba({ to: Array.isArray(to) ? to : [to], subject });
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_ADMIN, to: mp.to, subject: mp.subject, html }),
  }).catch((e) => { console.error('[ventas-limite] Email:', e.message); return null; });
  return !!(r && r.ok);
}

exports.handler = async function () {
  console.log('[ventas-limite] Iniciando:', new Date().toISOString());
  if (!SB_URL || !SB_KEY) {
    console.error('[ventas-limite] Faltan PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY');
    return { statusCode: 500, body: 'Config faltante' };
  }

  const hoyISO = _hoyMx();
  const manana = _addDias(hoyISO, 1);

  // Ventas de vendedor PENDIENTES con vende_limite <= mañana (vencidas + hoy/mañana).
  // GET only — el cron nunca escribe.
  let ventas = [];
  try {
    const sp = 'solicitudes_tour?vendedor_id=not.is.null&estado=eq.pendiente'
      + `&vende_limite=not.is.null&vende_limite=lte.${manana}`
      + '&select=id,evento_id,evento_nombre,zona,paquete,num_personas,precio_total,monto_separo,vende_limite,vendedor_id,precio_sellado,clientes(nombre_completo,correo)&limit=2000';
    ventas = await sbGet(SB_URL, SB_KEY, sp);
  } catch (e) {
    console.error('[ventas-limite] lectura de ventas falló:', e.message);
    return { statusCode: 502, body: 'Error leyendo ventas' };
  }
  ventas = Array.isArray(ventas) ? ventas : [];

  const clasif = _clasificar(ventas, hoyISO);
  if (!clasif.vencidas.length && !clasif.porVencer.length) {
    console.log(`[ventas-limite] Fin. hoy=${hoyISO} vencidas:0 porVencer:0 (silencio)`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, hoy: hoyISO, vencidas: 0, porVencer: 0 }) };
  }

  // Nombre del vendedor (usuarios KH), best-effort. GET only.
  const nombreVend = {};
  const ids = [...new Set(ventas.map(v => v.vendedor_id).filter(Boolean))];
  if (ids.length && KH_URL && KH_KEY) {
    try {
      const rows = await sbGet(KH_URL, KH_KEY, `usuarios?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,nombre`);
      (Array.isArray(rows) ? rows : []).forEach(u => { if (u && u.id) nombreVend[u.id] = u.nombre || null; });
    } catch (e) { console.warn('[ventas-limite] nombres de vendedor:', e.message); }
  }

  const correo = _correoAdmin(clasif, nombreVend);
  let enviado = false;
  if (correo) {
    const res = await Promise.allSettled([enviar(correo.to, correo.subject, correo.html)]);
    enviado = res[0] && res[0].status === 'fulfilled' && res[0].value === true;
  }

  console.log(`[ventas-limite] Fin. hoy=${hoyISO} vencidas:${clasif.vencidas.length} porVencer:${clasif.porVencer.length} correoAdmin:${enviado}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, hoy: hoyISO, vencidas: clasif.vencidas.length, porVencer: clasif.porVencer.length, correoAdmin: enviado }) };
};

// Exports para el arnés (Netlify solo usa exports.handler).
exports._clasificar = _clasificar;
exports._correoAdmin = _correoAdmin;
exports._addDias = _addDias;
exports._dias = _dias;
