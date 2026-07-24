// =============================================================================
// admin-solicitud-comprobante
//
// Genera un signed URL del bucket 'comprobantes' del Supabase NUEVO para que
// el admin pueda ver/descargar el comprobante que subió el cliente. La URL
// caduca en 1 hora.
//
// Body JSON: { solicitud_id: uuid }
// Devuelve:  { ok: true, signed_url, expires_in, path, content_type }
//
// Seguridad (Security Phase 2 — migrado a JWT): mismo patrón que
// admin-solicitudes-list. Authorization: Bearer <JWT> validado por
// verifyAdminAuth() en _lib/verify-admin.js. Las URLs firmadas heredan el
// bypass de RLS de service_role solo para acceder al archivo dentro del
// tiempo de vida acotado.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const EXPIRES_IN_SECONDS = 60 * 60; // 1 hora — restricción del spec

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = verifyAdminAuth(event, ['maestro_roshi','bulma','milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const solicitudId = body.solicitud_id;
  if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'solicitud_id inválido' }) };
  }

  // 1) Leer la solicitud para obtener el path del comprobante
  let path;
  try {
    const r = await fetch(
      `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}&select=comprobante_separo_url`,
      { headers: { apikey: env.PORTAL_SB_SERVICE, Authorization: `Bearer ${env.PORTAL_SB_SERVICE}` } }
    );
    const arr = await r.json();
    const s = Array.isArray(arr) ? arr[0] : null;
    if (!s) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
    path = s.comprobante_separo_url;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando solicitud', detail: e.message }) };
  }

  if (!path) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'sin_comprobante', message: 'El cliente no subió comprobante para esta solicitud' }) };
  }

  // 2) Pedir signed URL al endpoint de Storage
  try {
    const r = await fetch(
      `${env.PORTAL_SB_URL}/storage/v1/object/sign/comprobantes/${encodeURI(path)}`,
      {
        method: 'POST',
        headers: {
          apikey: env.PORTAL_SB_SERVICE,
          Authorization: `Bearer ${env.PORTAL_SB_SERVICE}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: EXPIRES_IN_SECONDS }),
      }
    );
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase Storage rechazó la firma', detail }) };
    }
    const data = await r.json();
    // El endpoint regresa { signedURL: "/object/sign/..." } — concatenamos con la URL base.
    const signedPath = data.signedURL || data.signedUrl;
    if (!signedPath) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Storage no regresó signedURL', detail: data }) };
    }
    const fullUrl = signedPath.startsWith('http')
      ? signedPath
      : `${env.PORTAL_SB_URL}/storage/v1${signedPath}`;

    const ext = (path.split('.').pop() || '').toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf'
      : ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : 'application/octet-stream';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        signed_url: fullUrl,
        expires_in: EXPIRES_IN_SECONDS,
        path,
        content_type: contentType,
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error firmando URL', detail: e.message }) };
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
