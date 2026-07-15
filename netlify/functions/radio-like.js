// =============================================================================
// radio-like  (Radio v4 — likes y Top 10 de la semana)
//
// Endpoint de la página /radio. Conexión directa al Supabase del PORTAL con
// service_role (mismo patrón de datos que radio-muro).
//
//   GET  → { top: [...] }   ← RPC radio_top_semana() (Top 10 por likes de la semana)
//   POST { song_id, titulo, artista, art } → inserta en radio_likes · { ok:true }
//          valida: song_id requerido (máx 64); titulo/artista máx 200; art máx 500.
//
// Guard de origen: mismo criterio corregido en #253 — corsCheck bloquea SOLO un
// Origin cross-origin no permitido; el GET same-origin (sin header Origin) pasa,
// y el POST desde /radio (conectareynosa.mx, allowed) también.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

const { corsCheck } = require('./_lib/verify-admin');

const SB_URL     = process.env.PORTAL_SUPABASE_URL;
const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;

const MAX_SONG_ID = 64;
const MAX_META    = 200; // titulo / artista
const MAX_ART     = 500;

exports.handler = async (event) => {
  // Origin CRUDO para distinguir "cross-origin no permitido" de "sin Origin".
  // corsCheck devuelve null en ambos casos; un GET same-origin NO manda header
  // Origin → no debe bloquearse (#253).
  const __rawOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (statusCode, payload) => ({ statusCode, headers, body: JSON.stringify(payload) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }
  // Bloquear SOLO cuando vino un Origin y no está permitido (cross-origin real).
  if (__rawOrigin && !__origin) return json(403, { ok: false, error: 'Origen no permitido' });

  if (!SB_URL || !SB_SERVICE) return json(500, { ok: false, error: 'Portal Supabase no configurado' });

  const sbHeaders = {
    apikey: SB_SERVICE,
    Authorization: 'Bearer ' + SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // ---- GET: Top 10 de la semana (RPC) ----
    if (event.httpMethod === 'GET') {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/radio_top_semana`, {
        method: 'POST',
        headers: sbHeaders,
        body: '{}',
      });
      if (!r.ok) return json(502, { ok: false, error: 'No se pudo leer el top', detail: await r.text() });
      const top = await r.json();
      return json(200, { top: Array.isArray(top) ? top : [] });
    }

    // ---- POST: nuevo like ----
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return json(400, { ok: false, error: 'JSON inválido' }); }

    const song_id = (body && body.song_id != null) ? String(body.song_id).trim() : '';
    const titulo  = (body && body.titulo  != null) ? String(body.titulo).trim()  : '';
    const artista = (body && body.artista != null) ? String(body.artista).trim() : '';
    const art     = (body && body.art     != null) ? String(body.art).trim()     : '';

    if (song_id.length < 1 || song_id.length > MAX_SONG_ID) {
      return json(400, { ok: false, error: `song_id requerido (máx ${MAX_SONG_ID} caracteres)` });
    }
    if (titulo.length > MAX_META || artista.length > MAX_META) {
      return json(400, { ok: false, error: `titulo/artista no pueden pasar de ${MAX_META} caracteres` });
    }
    if (art.length > MAX_ART) {
      return json(400, { ok: false, error: `art no puede pasar de ${MAX_ART} caracteres` });
    }

    const ins = await fetch(`${SB_URL}/rest/v1/radio_likes`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ song_id, titulo, artista, art }),
    });
    if (!ins.ok) return json(502, { ok: false, error: 'No se pudo registrar el like', detail: await ins.text() });
    return json(200, { ok: true });
  } catch (e) {
    return json(502, { ok: false, error: 'Error en radio-like', detail: e.message });
  }
};
