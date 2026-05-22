// =============================================================================
// sistema-config-get
//
// Devuelve la fila id=1 de sistema_config del Supabase de Kamehouse.
// El response se filtra por rol del caller:
//   - maestro_roshi  → todos los campos (incluye cuenta_clabe/banco/titular)
//   - cualquier otro → solo mensaje_dia y mensaje_activo
//
// Si la fila id=1 no existe todavía, devuelve {} para que el frontend
// pueda crearla via sistema-config-save.
//
// Seguridad:
//   - Authorization: Bearer <JWT> firmado por auth-login.js (verifyAdminAuth)
//   - Query a Supabase con service_role (bypass RLS) — service_role no sale al cliente
//
// Env vars:
//   - SUPABASE_SERVICE_KEY_KAMEHOUSE
//   - JWT_SECRET (lo lee verifyAdminAuth)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const CAMPOS_PUBLICOS = ['mensaje_dia', 'mensaje_activo'];
const CAMPOS_MAESTRO  = ['id', 'cuenta_clabe', 'cuenta_banco', 'cuenta_titular', 'mensaje_dia', 'mensaje_activo'];

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

  // Cualquier rol autenticado puede consultar — el filtrado por columna
  // se hace abajo según user.rol.
  const auth = verifyAdminAuth(event);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  if (!SB_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };
  }

  const esMaestro = auth.user.rol === 'maestro_roshi';
  const campos = esMaestro ? CAMPOS_MAESTRO : CAMPOS_PUBLICOS;

  try {
    const url = `${SB_URL}/rest/v1/sistema_config?id=eq.1&select=${campos.join(',')}`;
    const r = await fetch(url, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la query', detail }) };
    }
    const rows = await r.json();
    const cfg = Array.isArray(rows) && rows.length ? rows[0] : {};
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, config: cfg }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando Supabase', detail: e.message }) };
  }
};
