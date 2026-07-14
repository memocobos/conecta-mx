// =============================================================================
// radio-muro  (Radio v3 — el muro público de mensajes)
//
// Endpoint PÚBLICO de la página /radio. Conexión directa al Supabase del PORTAL
// con service_role (mismo patrón que portal-mis-lugares y demás).
//
//   GET  → { mensajes: [{ nombre, mensaje, creado }] }  (últimos 30 visibles, desc)
//   POST { nombre, mensaje } → inserta y responde { ok: true }
//          (valida nombre 1-30 y mensaje 1-140; si no, 400 { ok:false, error }).
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

const SB_URL     = process.env.PORTAL_SUPABASE_URL;
const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;

const MAX_NOMBRE  = 30;
const MAX_MENSAJE = 140;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  const json = (statusCode, payload) => ({ statusCode, headers, body: JSON.stringify(payload) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (!SB_URL || !SB_SERVICE) return json(500, { ok: false, error: 'Portal Supabase no configurado' });

  const sbHeaders = {
    apikey: SB_SERVICE,
    Authorization: 'Bearer ' + SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // ---- GET: últimos 30 mensajes visibles ----
    if (event.httpMethod === 'GET') {
      const r = await fetch(
        `${SB_URL}/rest/v1/radio_muro?visible=eq.true&select=nombre,mensaje,creado&order=creado.desc&limit=30`,
        { headers: sbHeaders }
      );
      if (!r.ok) return json(502, { ok: false, error: 'No se pudo leer el muro', detail: await r.text() });
      const mensajes = await r.json();
      return json(200, { mensajes: Array.isArray(mensajes) ? mensajes : [] });
    }

    // ---- POST: nuevo mensaje ----
    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); }
      catch { return json(400, { ok: false, error: 'JSON inválido' }); }

      const nombre  = (body && body.nombre  != null) ? String(body.nombre).trim()  : '';
      const mensaje = (body && body.mensaje != null) ? String(body.mensaje).trim() : '';
      if (nombre.length < 1 || nombre.length > MAX_NOMBRE) {
        return json(400, { ok: false, error: `El nombre debe tener entre 1 y ${MAX_NOMBRE} caracteres` });
      }
      if (mensaje.length < 1 || mensaje.length > MAX_MENSAJE) {
        return json(400, { ok: false, error: `El mensaje debe tener entre 1 y ${MAX_MENSAJE} caracteres` });
      }

      const ins = await fetch(`${SB_URL}/rest/v1/radio_muro`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ nombre, mensaje }),
      });
      if (!ins.ok) return json(502, { ok: false, error: 'No se pudo publicar', detail: await ins.text() });
      return json(200, { ok: true });
    }

    return json(405, { ok: false, error: 'Method not allowed' });
  } catch (e) {
    return json(502, { ok: false, error: 'Error en el muro', detail: e.message });
  }
};
