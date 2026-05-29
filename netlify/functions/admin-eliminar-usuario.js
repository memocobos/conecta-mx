// =============================================================================
// admin-eliminar-usuario.js
//
// DELETE de un usuario en Kamehouse usando service_role (bypass GRANT).
// Necesaria porque anon ya no tiene DELETE sobre `usuarios` por seguridad.
//
// Auth:
//   - JWT Bearer del admin logueado (rol = maestro_roshi únicamente)
//   - CORS check (mismo whitelist que otras admin functions)
//
// Body JSON: { userId: <uuid> }
// =============================================================================

const { verifyAdminAuth, corsCheck, corsHeaders } = require('./_lib/verify-admin');

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
            || process.env.SUPABASE_SERVICE_KEY
            || process.env.SUPABASE_SERVICE_ROLE_KEY;

function badRequest(event, status, error) {
  return {
    statusCode: status,
    headers: corsHeaders(event),
    body: JSON.stringify({ ok: false, error }),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return badRequest(event, 405, 'Método no permitido');
  }
  if (!corsCheck(event)) {
    return badRequest(event, 403, 'Origen no permitido');
  }
  if (!SB_URL || !SB_KEY) {
    return badRequest(event, 500, 'Supabase no configurado');
  }

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) {
    return badRequest(event, auth.status || 401, auth.error);
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return badRequest(event, 400, 'JSON inválido'); }

  const userId = String(body.userId || '').trim();
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return badRequest(event, 400, 'userId inválido (no es UUID)');
  }

  if (userId === auth.user.id || userId === auth.user.sub) {
    return badRequest(event, 400, 'No puedes eliminarte a ti mismo');
  }

  // Verificar el rol del target — no permitir eliminar a maestro_roshi/bulma
  // (defensa adicional aunque el frontend ya lo bloquea).
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(userId)}&select=rol,nombre&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    );
    if (r.ok) {
      const rows = await r.json();
      const target = rows && rows[0];
      if (target && ['maestro_roshi', 'bulma'].includes(target.rol)) {
        return badRequest(event, 403, `No se puede eliminar a ${target.nombre} (rol protegido)`);
      }
    }
  } catch (e) { /* lookup falló — no bloqueamos por eso, el DELETE igual va */ }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        Prefer: 'return=minimal',
      },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[admin-eliminar-usuario] DELETE failed', r.status, txt);
      return badRequest(event, 502, 'Error eliminando: ' + txt.slice(0, 200));
    }
    return {
      statusCode: 200,
      headers: corsHeaders(event),
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    console.error('[admin-eliminar-usuario] network error', e.message);
    return badRequest(event, 502, 'Error de red: ' + e.message);
  }
};
