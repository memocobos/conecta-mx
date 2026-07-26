// netlify/functions/waitlist-delete.js
// Borra TODOS los registros de eventos_waitlist y el snapshot para un evento_id.
// Llamado desde kamehouse (Herramientas → Lista de espera → "Eliminar evento").
//
// Necesario porque RLS de eventos_waitlist solo expone INSERT y SELECT al
// anon key — los DELETE deben hacerse con service key desde el server.

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const SB_URL = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

exports.handler = async function (event) {
  const __origin = corsCheck(event);
  const respHeaders = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const ok  = (b)   => ({ statusCode: 200, headers: respHeaders, body: JSON.stringify(b) });
  const bad = (c,m) => ({ statusCode: c,   headers: respHeaders, body: JSON.stringify({ ok:false, error:m }) });

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: respHeaders, body: '' };
  if (event.httpMethod !== "POST") return bad(405, "Method not allowed");
  if (!__origin) return bad(403, "Origen no permitido");

  // DELETE destructivo (eventos_waitlist + snapshot) con service_role — solo admin.
  const auth = await verifyAdminAuthLive(event, ['maestro_roshi','bulma','milk']);
  if (!auth.valid) return bad(auth.status, auth.error);

  if (!SB_KEY) return bad(500, "SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado");

  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return bad(400, "Invalid JSON"); }

  const eventoId = String(payload.evento_id || "").trim();
  if (!eventoId) return bad(400, "evento_id requerido");

  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    Prefer: "return=minimal",
  };
  const params = `evento_id=eq.${encodeURIComponent(eventoId)}`;

  try {
    // Cuenta antes de borrar (para feedback al usuario en kamehouse).
    const cnt = await fetch(`${SB_URL}/rest/v1/eventos_waitlist?${params}&select=id`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: "count=exact" },
    });
    const deleted = parseInt((cnt.headers.get("content-range") || "0/0").split("/")[1] || "0", 10);

    const r1 = await fetch(`${SB_URL}/rest/v1/eventos_waitlist?${params}`,         { method: "DELETE", headers });
    if (!r1.ok) return bad(502, `eventos_waitlist DELETE ${r1.status}: ${await r1.text()}`);

    const r2 = await fetch(`${SB_URL}/rest/v1/eventos_estado_snapshot?${params}`,  { method: "DELETE", headers });
    if (!r2.ok) return bad(502, `eventos_estado_snapshot DELETE ${r2.status}: ${await r2.text()}`);

    return ok({ ok: true, deleted });
  } catch (e) {
    return bad(502, "Supabase error: " + e.message);
  }
};
