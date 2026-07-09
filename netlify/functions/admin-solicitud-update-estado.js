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
// Seguridad (Security Phase 2 — migrado a JWT): mismo patrón que
// admin-solicitudes-list. Authorization: Bearer <JWT> validado por
// verifyAdminAuth() en _lib/verify-admin.js.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { ensureLugares } = require('./_lib/portal-lugares');

const ESTADOS_VALIDOS = ['pendiente','en_pagos','pagado','cancelado'];

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

  const auth = verifyAdminAuth(event, ['maestro_roshi','bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

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

    // Al aprobar (en_pagos) se crean los N lugares de la solicitud. Best-effort:
    // un fallo aquí NO revierte el cambio de estado; solo se reporta. La fila que
    // regresó el PATCH (return=representation) ya trae los campos que necesitamos,
    // así que no hace falta un GET extra.
    const lugaresInfo = {};
    if (nuevoEstado === 'en_pagos') {
      const portalHeaders = {
        apikey: env.PORTAL_SB_SERVICE,
        Authorization: `Bearer ${env.PORTAL_SB_SERVICE}`,
        'Content-Type': 'application/json',
      };
      try {
        const res = await ensureLugares({ portalUrl: env.PORTAL_SB_URL, portalHeaders, solicitud: actualizada });
        lugaresInfo.lugares_creados = res.creados;
      } catch (e) {
        lugaresInfo.lugares_error = e.message;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, solicitud: actualizada, admin: { id: auth.user.id, correo: auth.user.correo }, ...lugaresInfo }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error actualizando solicitud', detail: e.message }) };
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
