// =============================================================================
// mas-alla-solicitar.js — EL MÁS ALLÁ: la solicitud del evento AGOTADO
// =============================================================================
// [MAS-ALLA-1 · 26-oct-2026] Orden de Memo: cuando un evento está agotado y
// alguien llega (link directo, tarjeta del catálogo o tira del hero — las TRES
// puertas, firmado), el wizard del Más Allá levanta una SOLICITUD: nombre,
// celular, correo, cantidad y paquetes/zonas de interés. Cae a la tabla
// `mas_alla_solicitudes` (acta migraciones/MAS-ALLA-1.sql, YA CORRIDA) y la
// atienden maestro_roshi/bulma/milk desde la pantalla EL MÁS ALLÁ.
//
// 🔒 ESTO NO ES DINERO: una solicitud no crea viajero, no crea abono, no toca
// inventario. Es demanda anotada para ir a BUSCAR boletos. Por eso es un
// endpoint público con validación dura, no una requisición.
//
// POST body: { evento_id, evento_nombre, nombre, celular, correo?, cantidad?,
//              paquetes?: [..], zonas?: [..], sitio_web? (honeypot) }
// → 200 { ok:true, folio }  ·  400/413/429 con el motivo  ·  502 base caída
//
// Guardas (la forma de requisicion-crear / waitlist-subscribe):
//   · corsCheck: solo orígenes del sitio (público, sin auth — como waitlist).
//   · honeypot `sitio_web`: lleno → ÉXITO DE UTILERÍA sin escribir un byte
//     (un bot que ve 200 no insiste; un 4xx lo invita a reintentar).
//   · celular a 10 dígitos EXACTOS (la respuesta es por WhatsApp: sin celular
//     válido la solicitud no sirve de nada). Correo OPCIONAL, en minúsculas.
//   · tope: 3 solicitudes PENDIENTES por celular (global — las atendidas no
//     cuentan, para que quien ya fue atendido pueda volver a pedir).
//   · paquetes/zonas: arrays de strings cortos, tope 12 c/u — son texto de
//     INTERÉS, no llaves de inventario: no se validan contra la ficha a
//     propósito (la ficha de un agotado puede cambiar mañana y la solicitud
//     de ayer sigue diciendo lo que la persona pidió).
// =============================================================================

const { corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PENDIENTES_POR_CEL = 3;

function json(status, headers, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

// Lista de strings cortos y limpios; lo que no sea string se tira.
function listaLimpia(v, maxItems, maxLen) {
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const s = x.trim().slice(0, maxLen);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out.length ? out : null;
}

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!__origin) return json(403, headers, { ok: false, error: 'Origen no permitido' });
  if (event.httpMethod !== 'POST') return json(405, headers, { ok: false, error: 'Method not allowed' });
  if (!SB_KEY) return json(500, headers, { ok: false, error: 'Configuración incompleta' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, headers, { ok: false, error: 'JSON inválido' }); }

  // ── Honeypot: un humano jamás llena este campo (vive oculto). Se contesta
  // ÉXITO DE UTILERÍA sin escribir — la forma de REQ-B1b. ─────────────────────
  if (String(body.sitio_web || '').trim()) {
    return json(200, headers, { ok: true, folio: 'MA-' + Math.random().toString(36).slice(2, 7).toUpperCase() });
  }

  const evento_id = String(body.evento_id || '').trim().slice(0, 60);
  const evento_nombre = String(body.evento_nombre || '').trim().slice(0, 200) || null;
  if (!evento_id) return json(400, headers, { ok: false, error: 'Falta el evento' });

  const nombre = String(body.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (nombre.length < 2) return json(400, headers, { ok: false, error: 'Escribe tu nombre completo' });

  const celular = String(body.celular || '').replace(/\D/g, '');
  if (celular.length !== 10) return json(400, headers, { ok: false, error: 'Tu WhatsApp va a 10 dígitos — ahí te avisamos si conseguimos tus boletos' });

  let correo = String(body.correo || '').trim().toLowerCase().slice(0, 150) || null;
  if (correo && !RE_CORREO.test(correo)) return json(400, headers, { ok: false, error: 'Tu correo no se ve bien — revísalo (o déjalo vacío)' });

  let cantidad = parseInt(body.cantidad, 10);
  if (!Number.isInteger(cantidad) || cantidad < 1) cantidad = 1;
  if (cantidad > 20) return json(400, headers, { ok: false, error: 'Para 20+ boletos escríbenos directo por WhatsApp' });

  const paquetes = listaLimpia(body.paquetes, 12, 40);
  const zonas = listaLimpia(body.zonas, 12, 80);

  const sbH = {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
  };

  // ── Tope: 3 PENDIENTES por celular. Best-effort: el tope caído no frena una
  // solicitud (perder demanda por un tropiezo de red sería peor que un spam). ──
  try {
    const r = await fetch(`${SB_URL}/rest/v1/mas_alla_solicitudes?select=id&celular=eq.${celular}&estado=eq.pendiente&limit=${MAX_PENDIENTES_POR_CEL + 1}`, { headers: sbH });
    const rows = r.ok ? await r.json() : [];
    if (Array.isArray(rows) && rows.length >= MAX_PENDIENTES_POR_CEL) {
      return json(429, headers, { ok: false, error: 'Ya tenemos tus solicitudes anotadas — te escribimos por WhatsApp en cuanto consigamos lugares. No hace falta mandarla otra vez.' });
    }
  } catch (_) { /* best-effort */ }

  // ── INSERT directo (jamás on_conflict — ley de la casa). ────────────────────
  const fila = { evento_id, evento_nombre, nombre, celular, correo, cantidad, paquetes, zonas };
  const r = await fetch(`${SB_URL}/rest/v1/mas_alla_solicitudes`, {
    method: 'POST',
    headers: { ...sbH, Prefer: 'return=representation' },
    body: JSON.stringify(fila),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    console.error('[mas-alla-solicitar] insert rechazado:', detail);
    return json(502, headers, { ok: false, error: 'No pudimos anotar tu solicitud. Inténtalo otra vez o escríbenos por WhatsApp.' });
  }
  const rows = await r.json();
  const id = rows && rows[0] && rows[0].id ? String(rows[0].id) : '';
  return json(200, headers, { ok: true, folio: 'MA-' + id.slice(0, 5).toUpperCase() });
};
