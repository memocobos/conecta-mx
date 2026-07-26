// =============================================================================
// admin-pago-comprobante
//
// Genera una signed URL del bucket privado 'comprobantes' para que el admin vea/
// descargue el comprobante de UN pago (el que se subió vía
// admin-subir-comprobante-pago). La URL caduca en 1 hora. Gemelo de
// admin-solicitud-comprobante, pero leyendo pagos.comprobante_url por pago_id.
//
// Body JSON: { pago_id: uuid }
// Devuelve:  { ok: true, signed_url, expires_in, path, content_type }
//
// Seguridad: corsCheck + verifyAdminAuth(['maestro_roshi','bulma']).
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY, JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const EXPIRES_IN_SECONDS = 60 * 60; // 1 hora

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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma', 'milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const pagoId = body.pago_id;
  if (!pagoId || !/^[0-9a-f-]{36}$/i.test(pagoId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'pago_id inválido' }) };
  }

  // 1) Leer el pago para obtener el path del comprobante
  let path;
  try {
    const r = await fetch(
      `${env.PORTAL_SB_URL}/rest/v1/pagos?id=eq.${pagoId}&select=comprobante_url`,
      { headers: { apikey: env.PORTAL_SB_SERVICE, Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE } }
    );
    const arr = await r.json();
    const p = Array.isArray(arr) ? arr[0] : null;
    if (!p) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Pago no encontrado' }) };
    path = p.comprobante_url;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando pago', detail: e.message }) };
  }

  if (!path) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'sin_comprobante', message: 'Este pago no tiene comprobante' }) };
  }

  // 2) Pedir signed URL al endpoint de Storage
  try {
    const r = await fetch(
      `${env.PORTAL_SB_URL}/storage/v1/object/sign/comprobantes/${encodeURI(path)}`,
      {
        method: 'POST',
        headers: {
          apikey: env.PORTAL_SB_SERVICE,
          Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
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
    const signedPath = data.signedURL || data.signedUrl;
    if (!signedPath) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Storage no regresó signedURL', detail: data }) };
    }
    const fullUrl = signedPath.startsWith('http')
      ? signedPath
      : `${env.PORTAL_SB_URL}/storage/v1${signedPath}`;

    const fileExt = (path.split('.').pop() || '').toLowerCase();
    const contentType = fileExt === 'pdf' ? 'application/pdf'
      : fileExt === 'png' ? 'image/png'
      : fileExt === 'webp' ? 'image/webp'
      : fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg'
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
