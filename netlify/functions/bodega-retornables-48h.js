// netlify/functions/bodega-retornables-48h.js
// Job (cron en netlify.toml) — DIARIO. 🗼 TORRE DE KARIN O3: RECORDATORIO 48H de
// piezas RETORNABLES que andan fuera y el evento ya viene encima. Corre 15:00 UTC
// = 9:00 AM hora México.
//
// REGLA SAGRADA: solo NOTIFICA. NO cambia el estado de ninguna salida, no toca
// stock, no aplica strikes, no congela a nadie. La ÚNICA escritura es la marca de
// idempotencia `aviso_48h_at` (bitácora de aviso, NO un cambio de estado) para no
// repetir el mismo recordatorio corrida tras corrida.
//
// Qué busca:
//   1) Eventos del CATÁLOGO (fetchCatalogo — el EV de index.html, no la base)
//      cuya PRIMERA fecha esté a ≤2 días (hoy, mañana o pasado, en hora MX).
//   2) Salidas de bodega en estado 'autorizada' — el estado REAL de "salió y
//      todavía no regresa": el flujo de comparación de la Torre v2 solo la pasa a
//      'cerrada' cuando el cuidador palomea el regreso y el stock vuelve a sumar
//      (admin-reportes → sumarRegresoYCerrar). Mientras siga 'autorizada', el
//      material está en la calle.
//   3) …que traigan al menos una pieza RETORNABLE en su snapshot `detalle`, y que
//      no hayan sido avisadas ya (aviso_48h_at IS NULL).
//
// Manda UN correo resumen al admin (+ a cada cuidador con correo, por separado
// para que un buzón malo no tumbe el resto) listando: pieza, quién se la llevó,
// de qué evento/salida y cuántos días lleva fuera.
//
// El evento_id de una salida puede venir como 'slug' o 'slug#idx' (multifecha);
// el cruce con el catálogo se hace SIEMPRE por el slug base.
//
// Env: SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, RESEND_KEY
//      (|| RESEND_API_KEY). Correo vía correo-guard (respeta CORREOS_MODO).

const { aplicarModoPrueba } = require('./_lib/correo-guard');
let fetchCatalogo = null;
try { ({ fetchCatalogo } = require('./_lib/catalogo-index')); } catch (_) { fetchCatalogo = null; }

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const HEADERS = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };

const FROM = 'Torre de Karin <admin@conectareynosa.mx>';
const ADMIN_TO = 'admin@conectareynosa.mx';
const SITE = process.env.URL || 'https://conectareynosa.mx';
const DIAS_AVISO = 2; // "48 horas": hoy (0), mañana (1) y pasado (2)

// ── helpers PUROS (los prueba el arnés sin red) ──────────────────────────────

// 'slug#2' → 'slug'. El catálogo se llavea SIEMPRE por el slug base.
function slugBase(eventoId) {
  return String(eventoId || '').split('#')[0].trim();
}

// Días naturales entre dos 'YYYY-MM-DD' (b − a). Aritmética en UTC sobre fechas
// planas: sin horas, sin DST que la enrede.
function diasEntre(aISO, bISO) {
  const a = Date.parse(String(aISO).slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(String(bISO).slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

// Slugs del catálogo cuya PRIMERA fecha cae en [hoy, hoy+DIAS]. Un evento que ya
// pasó NO cuenta (el material se reclama por otras vías, no por este aviso).
function eventosCercanos(catalogo, hoyISO, dias = DIAS_AVISO) {
  const out = {};
  if (!catalogo || typeof catalogo !== 'object') return out;
  for (const [slug, ev] of Object.entries(catalogo)) {
    if (!ev) continue;
    const primera = ev.ds || (Array.isArray(ev.multifecha) && ev.multifecha.length ? ev.multifecha[0].ds : null);
    if (!primera) continue;
    const d = diasEntre(hoyISO, primera);
    if (d == null || d < 0 || d > dias) continue;
    out[slug] = { slug, dias: d, ds: String(primera).slice(0, 10), nombre: ev.nombre || slug, venue: ev.venue || null };
  }
  return out;
}

// Piezas RETORNABLES del snapshot congelado de una salida.
function retornablesDe(salida) {
  return (Array.isArray(salida && salida.detalle) ? salida.detalle : [])
    .filter(d => d && d.retornable)
    .map(d => ({ pieza: d.pieza, cantidad: Number(d.cantidad) || 0 }));
}

// ¿Esta salida entra al aviso? Refleja EXACTAMENTE el criterio del query — es la
// defensa en profundidad y, a la vez, la verdad que testea el arnés.
function entraAlAviso(salida, cercanos) {
  if (!salida) return false;
  if (salida.estado !== 'autorizada') return false;              // regresada/cancelada/etc → no
  if (salida.aviso_48h_at != null && String(salida.aviso_48h_at).trim() !== '') return false; // ya avisada → no
  if (!retornablesDe(salida).length) return false;               // solo consumibles → no
  return !!cercanos[slugBase(salida.evento_id)];                 // el evento debe estar encima
}

// Filas del correo: una por pieza retornable de cada salida seleccionada.
function armarFilas(salidas, cercanos, uMap, nowMs) {
  const filas = [];
  for (const s of (Array.isArray(salidas) ? salidas : [])) {
    if (!entraAlAviso(s, cercanos)) continue;
    const ev = cercanos[slugBase(s.evento_id)];
    const u = uMap ? uMap[String(s.solicitante_id || '')] : null;
    const desde = Date.parse(s.autorizada_en || '');
    const diasFuera = Number.isFinite(desde) ? Math.max(0, Math.floor((nowMs - desde) / 86400000)) : null;
    for (const r of retornablesDe(s)) {
      filas.push({
        salida_id: s.id,
        pieza: r.pieza,
        cantidad: r.cantidad,
        quien: (u && u.nombre) ? u.nombre : (s.solicitante_rol || '—'),
        evento_id: s.evento_id,
        evento_nombre: ev ? ev.nombre : slugBase(s.evento_id),
        evento_ds: ev ? ev.ds : null,
        dias_para_evento: ev ? ev.dias : null,
        dias_fuera: diasFuera,
      });
    }
  }
  // Lo más urgente primero: evento más cercano, y dentro, lo que lleva más tiempo fuera.
  filas.sort((a, b) =>
    (a.dias_para_evento - b.dias_para_evento) ||
    ((b.dias_fuera || 0) - (a.dias_fuera || 0)) ||
    String(a.pieza).localeCompare(String(b.pieza)));
  return filas;
}

// ── red ──────────────────────────────────────────────────────────────────────

async function sb(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`KH ${res.status}: ${await res.text()}`);
  return res.json();
}

async function enviarCorreo(to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return false;
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  }).catch((e) => { console.error('[retornables-48h] Email:', e.message); return null; });
  return !!(r && r.ok);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function cuerpoHtml(filas, hoyISO) {
  const tr = filas.map(f => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:13px;color:#fff">
        <b>${f.cantidad}×</b> ${escapeHtml(f.pieza)}
      </td>
      <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:13px;color:#fff">${escapeHtml(f.quien)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:12px;color:rgba(255,255,255,.75)">
        ${escapeHtml(f.evento_nombre)}${f.evento_ds ? `<br><span style="font-size:11px;color:#e8ff4c">${escapeHtml(f.evento_ds)} · ${f.dias_para_evento === 0 ? 'HOY' : f.dias_para_evento === 1 ? 'mañana' : `en ${f.dias_para_evento} días`}</span>` : ''}
      </td>
      <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:13px;text-align:right;color:${(f.dias_fuera || 0) >= 7 ? '#ff283b' : '#e8ff4c'};font-weight:700">
        ${f.dias_fuera == null ? '—' : `${f.dias_fuera} d`}
      </td>
    </tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:640px;background:#0a0a0a;color:#fff">
  <div style="background:#e8ff4c;color:#000;padding:18px;border-bottom:4px solid #ff283b">
    <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Torre de Karin · Bodega</div>
    <div style="font-size:20px;font-weight:900;margin-top:4px">Retornables que siguen fuera y el evento ya viene</div>
  </div>
  <div style="padding:22px">
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px 0">
      Corrida del ${escapeHtml(hoyISO)}. Estas piezas <b>retornables</b> salieron de la bodega y todavía
      no regresan, y su evento arranca en 48 horas o menos.
    </p>
    <table style="border-collapse:collapse;width:100%">
      <tr>
        <th style="text-align:left;padding:6px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);border-bottom:2px solid rgba(255,255,255,.25)">Pieza</th>
        <th style="text-align:left;padding:6px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);border-bottom:2px solid rgba(255,255,255,.25)">Quién la trae</th>
        <th style="text-align:left;padding:6px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);border-bottom:2px solid rgba(255,255,255,.25)">Evento</th>
        <th style="text-align:right;padding:6px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);border-bottom:2px solid rgba(255,255,255,.25)">Fuera</th>
      </tr>
      ${tr}
    </table>
    <p style="margin:18px 0 0 0;font-size:12px;color:rgba(255,255,255,.7)">
      Esto es <b>solo un aviso</b>: no se cambió ningún estado ni se cobró nada. Revisa en
      <a href="${SITE}/kamehouse" style="color:#e8ff4c;text-decoration:none;font-weight:700">Kamehouse → Torre de Karin</a>
      (“Prestado ahorita”) y pídelas de vuelta antes de que salga el camión.
    </p>
  </div>
</div>`;
}

// Marca de idempotencia. Fails-soft por fila: si una falla, se reintenta mañana.
async function marcarAvisadas(ids, nowISO) {
  let marcadas = 0;
  for (const id of ids) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/salidas_bodega?id=eq.${encodeURIComponent(id)}&aviso_48h_at=is.null`, {
        method: 'PATCH',
        headers: { ...HEADERS, Prefer: 'return=minimal' },
        body: JSON.stringify({ aviso_48h_at: nowISO }),
      });
      if (r.ok) marcadas++;
      else console.error('[retornables-48h] marca rechazada', id, r.status);
    } catch (e) { console.error('[retornables-48h] marca falló', id, e.message); }
  }
  return marcadas;
}

exports.handler = async function () {
  console.log('[retornables-48h] Iniciando:', new Date().toISOString());
  if (!SB_URL || !SB_KEY) {
    console.error('[retornables-48h] Faltan SUPABASE_URL_KAMEHOUSE / SUPABASE_SERVICE_KEY_KAMEHOUSE');
    return { statusCode: 500, body: 'Config faltante' };
  }

  const nowMs = Date.now();
  const nowISO = new Date(nowMs).toISOString();
  const hoyMX = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });

  // 1) Catálogo → eventos a ≤2 días. Sin catálogo NO se inventa nada: se sale
  //    en silencio (jamás avisar de un evento que no sabemos cuándo es).
  let catalogo = null;
  try { catalogo = fetchCatalogo ? await fetchCatalogo() : null; }
  catch (e) { console.error('[retornables-48h] catálogo falló:', e.message); }
  if (!catalogo) {
    console.log('[retornables-48h] Fin. Sin catálogo — no se avisa nada.');
    return { statusCode: 200, body: JSON.stringify({ ok: true, sin_catalogo: true, avisadas: 0 }) };
  }
  const cercanos = eventosCercanos(catalogo, hoyMX, DIAS_AVISO);
  if (!Object.keys(cercanos).length) {
    console.log('[retornables-48h] Fin. Ningún evento a ≤2 días.');
    return { statusCode: 200, body: JSON.stringify({ ok: true, eventos_cercanos: 0, avisadas: 0 }) };
  }

  // 2) Salidas AUTORIZADAS sin avisar (el estado real de "anda fuera"). El
  //    cruce fino con el catálogo y lo de retornables se hace con el guard puro.
  let salidas;
  try {
    salidas = await sb('salidas_bodega?estado=eq.autorizada&aviso_48h_at=is.null' +
      '&select=id,evento_id,solicitante_id,solicitante_rol,detalle,estado,autorizada_en,aviso_48h_at&limit=1000');
  } catch (e) {
    console.error('[retornables-48h] query falló:', e.message);
    return { statusCode: 502, body: 'query falló' };
  }

  const seleccionadas = (Array.isArray(salidas) ? salidas : []).filter(s => entraAlAviso(s, cercanos));
  if (!seleccionadas.length) {
    console.log(`[retornables-48h] Fin. eventos=${Object.keys(cercanos).length} salidas=0 (nada fuera)`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, eventos_cercanos: Object.keys(cercanos).length, salidas: 0, avisadas: 0 }) };
  }

  // 3) Nombres de quienes se llevaron el material (best-effort → cae al rol).
  let uMap = {};
  try {
    const ids = [...new Set(seleccionadas.map(s => String(s.solicitante_id || '')).filter(Boolean))];
    if (ids.length) {
      const us = await sb(`usuarios?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,nombre&limit=200`);
      (Array.isArray(us) ? us : []).forEach(u => { uMap[String(u.id)] = u; });
    }
  } catch (e) { console.error('[retornables-48h] usuarios (best-effort):', e.message); }

  const filas = armarFilas(seleccionadas, cercanos, uMap, nowMs);
  const html = cuerpoHtml(filas, hoyMX);
  const asunto = `[Bodega] ${filas.length} pieza${filas.length === 1 ? '' : 's'} retornable${filas.length === 1 ? '' : 's'} sin regresar — evento en 48h`;

  // 4) UN correo al admin + uno por cuidador con correo. Separados a propósito:
  //    un buzón malo NO tumba el resto (fails-soft por destinatario).
  const adminOk = await enviarCorreo(ADMIN_TO, asunto, html);
  let cuidadoresOk = 0, cuidadoresTotal = 0;
  try {
    const cs = await sb('usuarios?rol=eq.mister_popo&select=correo,correo_notif&limit=50');
    const correos = [...new Set((Array.isArray(cs) ? cs : [])
      .map(u => String(u.correo_notif || u.correo || '').trim().toLowerCase())
      .filter(c => c.includes('@') && c !== ADMIN_TO))];
    cuidadoresTotal = correos.length;
    for (const c of correos) {
      const ok = await enviarCorreo(c, asunto, html);
      if (ok) cuidadoresOk++;
    }
  } catch (e) { console.error('[retornables-48h] cuidadores (best-effort):', e.message); }

  // 5) Bitácora de aviso — SOLO si alguien lo recibió. Si no salió ningún correo,
  //    NO se marca: mañana se vuelve a intentar (jamás perder un aviso).
  let avisadas = 0;
  if (adminOk || cuidadoresOk > 0) {
    avisadas = await marcarAvisadas([...new Set(seleccionadas.map(s => s.id))], nowISO);
  } else {
    console.error('[retornables-48h] ningún correo salió — NO se marca, se reintenta mañana');
  }

  console.log(`[retornables-48h] Fin. eventos=${Object.keys(cercanos).length} salidas=${seleccionadas.length} piezas=${filas.length} admin=${adminOk} cuidadores=${cuidadoresOk}/${cuidadoresTotal} marcadas=${avisadas}`);
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      eventos_cercanos: Object.keys(cercanos).length,
      salidas: seleccionadas.length,
      piezas: filas.length,
      correo_admin: adminOk,
      correo_cuidadores: cuidadoresOk,
      avisadas,
    }),
  };
};

// Helpers puros para el arnés (no afectan el runtime del cron).
exports._slugBase = slugBase;
exports._diasEntre = diasEntre;
exports._eventosCercanos = eventosCercanos;
exports._retornablesDe = retornablesDe;
exports._entraAlAviso = entraAlAviso;
exports._armarFilas = armarFilas;
