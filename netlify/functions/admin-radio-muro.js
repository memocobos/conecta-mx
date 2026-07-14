// =============================================================================
// admin-radio-muro  (Kaio-sama — admin de Radio Conecta)
//
// El muro público de mensajes (/radio, radio-muro.js). Lo administra el módulo
// Kaio-sama en Kamehouse (solo maestro_roshi): mostrar/ocultar mensajes.
//
//   GET  → { ok:true, mensajes:[...] }  (radio_muro, creado desc, 200)
//   POST { id, visible:bool } → PATCH radio_muro · { ok:true }
//
// Seguridad: mismo patrón que admin-solicitudes-list — Authorization Bearer <JWT>
// validado por verifyAdminAuth(); Supabase PORTAL con service_role (bypass RLS,
// nunca sale al cliente).
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const ID_RE = /^[0-9a-fA-F-]{1,40}$/; // uuid o entero

exports.handler = async (event) => {
  // Origin CRUDO para distinguir "cross-origin no permitido" de "sin Origin".
  // corsCheck devuelve null en ambos casos, pero un GET same-origin (como el de
  // loadRadio en kamehouse) NO manda header Origin → no debe bloquearse; el JWT
  // (verifyAdminAuth) es el candado real. Las admin-* POST-only nunca ven este
  // caso porque un POST same-origin sí manda Origin.
  const __rawOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  // Bloquear SOLO cuando vino un Origin y no está permitido (cross-origin real).
  if (__rawOrigin && !__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: `Bearer ${env.PORTAL_SB_SERVICE}`,
  };

  try {
    // ---- GET: lista completa (últimos 200) ----
    if (event.httpMethod === 'GET') {
      const url = `${env.PORTAL_SB_URL}/rest/v1/radio_muro?select=*&order=creado.desc&limit=200`;
      const r = await fetch(url, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la query', detail }) };
      }
      const mensajes = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, mensajes: Array.isArray(mensajes) ? mensajes : [] }) };
    }

    // ---- POST { id, visible } ----
    let body = {};
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

    const id = (body && body.id != null) ? String(body.id) : '';
    if (!ID_RE.test(id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
    if (typeof body.visible !== 'boolean') return { statusCode: 400, headers, body: JSON.stringify({ error: 'visible debe ser booleano' }) };

    const r = await fetch(`${env.PORTAL_SB_URL}/rest/v1/radio_muro?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ visible: body.visible }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo actualizar', detail }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en radio-muro', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
