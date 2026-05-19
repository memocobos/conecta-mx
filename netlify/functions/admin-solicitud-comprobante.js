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
// Seguridad: lookup en usuarios (Supabase VIEJO). Las URLs firmadas heredan
// el bypass de RLS de service_role solo para acceder al archivo dentro del
// tiempo de vida acotado.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       KH_SUPABASE_URL, KH_SUPABASE_ANON_KEY.
// =============================================================================

const EXPIRES_IN_SECONDS = 60 * 60; // 1 hora — restricción del spec

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-kh-user-id, x-kh-correo',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const admin = await verificarAdminKh(event.headers, env);
  if (admin.error) return { statusCode: admin.status, headers, body: JSON.stringify({ error: admin.error }) };

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
  const KH_SB_URL         = process.env.KH_SUPABASE_URL;
  const KH_SB_ANON        = process.env.KH_SUPABASE_ANON_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE || !KH_SB_URL || !KH_SB_ANON) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY, KH_SUPABASE_URL/ANON_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE, KH_SB_URL, KH_SB_ANON };
}

async function verificarAdminKh(reqHeaders, env) {
  const h = lower(reqHeaders);
  const userId = h['x-kh-user-id'];
  const correo = (h['x-kh-correo'] || '').toLowerCase();
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId) || !correo) {
    return { error: 'Faltan headers x-kh-user-id / x-kh-correo', status: 401 };
  }
  const url = `${env.KH_SB_URL}/rest/v1/usuarios?id=eq.${userId}&correo=eq.${encodeURIComponent(correo)}&activo=eq.true&select=id,correo,rol&limit=1`;
  let arr;
  try {
    const r = await fetch(url, { headers: { apikey: env.KH_SB_ANON, Authorization: `Bearer ${env.KH_SB_ANON}` } });
    if (!r.ok) return { error: 'No se pudo validar admin contra Kamehouse', status: 502 };
    arr = await r.json();
  } catch (e) {
    return { error: 'Error de red validando admin', status: 502 };
  }
  const u = Array.isArray(arr) ? arr[0] : null;
  if (!u) return { error: 'Usuario no encontrado o inactivo', status: 401 };
  if (!['maestro_roshi','bulma'].includes(u.rol)) {
    return { error: 'Rol sin permiso para Solicitudes Portal', status: 403 };
  }
  return { admin: u };
}

function lower(obj) {
  const out = {};
  for (const k in obj || {}) out[k.toLowerCase()] = obj[k];
  return out;
}
