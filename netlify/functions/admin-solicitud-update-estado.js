// =============================================================================
// admin-solicitud-update-estado
//
// PATCH del estado (y notas_admin opcional) de una solicitud en el Supabase
// NUEVO (conecta-portal). Usado por Kamehouse → Solicitudes Portal → modal
// "Cambiar estado".
//
// Body JSON:
//   { solicitud_id: uuid, nuevo_estado: 'pendiente'|'en_pagos'|'pagado'|'cancelado',
//     notas_admin?: string }
//
// Seguridad: mismo modelo que admin-solicitudes-list (lookup contra usuarios).
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       KH_SUPABASE_URL, KH_SUPABASE_ANON_KEY.
// =============================================================================

const ESTADOS_VALIDOS = ['pendiente','en_pagos','pagado','cancelado'];

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
  const nuevoEstado = body.nuevo_estado;
  const notas = typeof body.notas_admin === 'string' ? body.notas_admin.trim() : '';

  if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'solicitud_id inválido' }) };
  }
  if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'nuevo_estado inválido' }) };
  }
  if (notas.length > 2000) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'notas_admin demasiado largas (máx 2000)' }) };
  }

  const patch = { estado: nuevoEstado };
  // Solo tocamos notas_admin si el admin escribió algo (string vacío equivale a "no cambiar").
  if (notas.length > 0) patch.notas_admin = notas;

  try {
    const url = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: env.PORTAL_SB_SERVICE,
        Authorization: `Bearer ${env.PORTAL_SB_SERVICE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la actualización', detail }) };
    }
    const arr = await r.json();
    const actualizada = Array.isArray(arr) ? arr[0] : null;
    if (!actualizada) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, solicitud: actualizada, admin: { id: admin.admin.id, correo: admin.admin.correo } }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error actualizando solicitud', detail: e.message }) };
  }
};

// ----- helpers (idénticos a admin-solicitudes-list) -----

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
