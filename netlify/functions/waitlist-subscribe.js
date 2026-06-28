// netlify/functions/waitlist-subscribe.js
// POST body: { evento_id, evento_nombre, nombre, email }
// Inserta en eventos_waitlist. Si el (evento_id, email) ya existe (unique index),
// no falla — devuelve { ok:true, already:true } para que el modal muestre
// "Ya estás en la lista" en vez de error.

const { corsCheck } = require('./_lib/verify-admin');

const SB_URL = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Las respuestas propagan los headers CORS (H) calculados por request, para que
// Access-Control-Allow-Origin salga en todas las salidas (patrón de admin-waitlist).
function ok(H, body)       { return { statusCode: 200,  headers: H, body: JSON.stringify(body) }; }
function bad(H, code, msg) { return { statusCode: code, headers: H, body: JSON.stringify({ ok: false, error: msg }) }; }

exports.handler = async function (event) {
  // Restringe el ORIGEN (no agrega auth: sigue siendo público). La whitelist de
  // verify-admin incluye conectareynosa.mx, www y los previews --conectareynosa.netlify.app,
  // así que la suscripción legítima same-origin no se rompe.
  const __origin = corsCheck(event);
  const H = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (!__origin) return { statusCode: 403, headers: H, body: JSON.stringify({ ok: false, error: 'Origen no permitido' }) };

  if (event.httpMethod !== "POST") return bad(H, 405, "Method not allowed");
  if (!SB_KEY) return bad(H, 500, "SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado");

  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return bad(H, 400, "Invalid JSON"); }

  const evento_id     = String(payload.evento_id     || "").trim().slice(0, 60);
  const evento_nombre = String(payload.evento_nombre || "").trim().slice(0, 200);
  const nombre        = String(payload.nombre        || "").trim().slice(0, 100);
  const email         = String(payload.email         || "").trim().toLowerCase().slice(0, 150);

  if (!evento_id)     return bad(H, 400, "evento_id requerido");
  if (!evento_nombre) return bad(H, 400, "evento_nombre requerido");
  if (!nombre)        return bad(H, 400, "nombre requerido");
  if (!email || !EMAIL_RE.test(email)) return bad(H, 400, "email inválido");

  // PostgREST: header 'Prefer: resolution=ignore-duplicates' hace que el
  // unique index (evento_id, email) descarte el insert duplicado sin fallar.
  const res = await fetch(`${SB_URL}/rest/v1/eventos_waitlist`, {
    method: "POST",
    headers: {
      apikey:        SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer:        "return=representation,resolution=ignore-duplicates",
    },
    body: JSON.stringify({ evento_id, evento_nombre, nombre, email }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("[waitlist-subscribe] SB error:", res.status, detail);
    return bad(H, 502, "Supabase insert failed");
  }

  // Cuando es duplicado, PostgREST devuelve un array vacío.
  const rows = await res.json().catch(() => []);
  const already = !Array.isArray(rows) || rows.length === 0;

  return ok(H, { ok: true, already, new: !already, nombre });
};
