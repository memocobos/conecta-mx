// =============================================================================
// reset-password.js
//
// Reset de contraseña de un usuario de Kamehouse usando service_role + bcrypt.
// Reemplaza el PATCH directo con anon key (texto plano) que hacía kamehouse.html.
// La nueva password viaja por HTTPS, se hashea SERVER-SIDE con bcrypt cost 10
// (mismo cost que migrate-bcrypt.js / auth-login.js) y se guarda como password_hash.
//
// Auth:
//   - JWT Bearer del admin logueado (rol = maestro_roshi o bulma)
//   - CORS check (mismo whitelist que otras admin functions)
//
// Body JSON: { userId: <uuid>, nuevaPassword: <string 8-200> }
// Respuesta : { ok: true }  (NUNCA devuelve el hash ni la password)
//
// Env vars:
//   - SUPABASE_URL_KAMEHOUSE  (fallback SUPABASE_URL)
//   - SUPABASE_SERVICE_KEY_KAMEHOUSE  (fallback SUPABASE_SERVICE_KEY / _ROLE_KEY)
//   - JWT_SECRET
// =============================================================================

const { verifyAdminAuth, corsCheck, corsHeaders } = require('./_lib/verify-admin');
const bcrypt = require('bcryptjs');

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
            || process.env.SUPABASE_SERVICE_KEY
            || process.env.SUPABASE_SERVICE_ROLE_KEY;

const BCRYPT_COST = 10;

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

  const auth = verifyAdminAuth(event, ['maestro_roshi', 'bulma']);
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

  const nuevaPassword = String(body.nuevaPassword || '');
  if (nuevaPassword.length < 8 || nuevaPassword.length > 200) {
    return badRequest(event, 400, 'La contraseña debe tener entre 8 y 200 caracteres');
  }

  // Defensa: no permitir resetear la contraseña de OTRO admin (maestro_roshi/bulma).
  // Resetear la propia sí se permite. (Mismo criterio que admin-eliminar-usuario.)
  const callerId = auth.user.id || auth.user.sub;
  if (userId !== callerId) {
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(userId)}&select=rol,nombre&limit=1`,
        { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
      );
      if (r.ok) {
        const rows = await r.json();
        const target = rows && rows[0];
        if (target && ['maestro_roshi', 'bulma'].includes(target.rol)) {
          return badRequest(event, 403, `No puedes resetear la contraseña de ${target.nombre} (rol protegido)`);
        }
      }
    } catch (e) { /* lookup falló — no bloqueamos por eso, el PATCH igual va */ }
  }

  // Hashear server-side (bcrypt cost 10, igual que auth-login / migrate-bcrypt).
  let hash;
  try {
    hash = await bcrypt.hash(nuevaPassword, BCRYPT_COST);
  } catch (e) {
    console.error('[reset-password] bcrypt error', e.message);
    return badRequest(event, 500, 'Error al procesar la contraseña');
  }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ password_hash: hash }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[reset-password] PATCH failed', r.status, txt);
      return badRequest(event, 502, 'Error actualizando: ' + txt.slice(0, 200));
    }
    return {
      statusCode: 200,
      headers: corsHeaders(event),
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    console.error('[reset-password] network error', e.message);
    return badRequest(event, 502, 'Error de red: ' + e.message);
  }
};
