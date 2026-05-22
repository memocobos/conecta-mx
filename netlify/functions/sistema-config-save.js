// =============================================================================
// sistema-config-save
//
// UPSERT a la fila id=1 de sistema_config (single-row table).
// Solo maestro_roshi puede escribir. Cualquier otro rol → 403.
//
// Body JSON: { cuenta_clabe?, cuenta_banco?, cuenta_titular?, mensaje_dia?, mensaje_activo? }
// Campos no whitelisted se ignoran silenciosamente.
//
// Seguridad:
//   - Authorization: Bearer <JWT> firmado por auth-login.js
//   - verifyAdminAuth(event, ['maestro_roshi']) — solo maestro_roshi pasa
//   - UPSERT a Supabase con service_role (bypass RLS)
//
// Env vars:
//   - SUPABASE_SERVICE_KEY_KAMEHOUSE
//   - JWT_SECRET (lo lee verifyAdminAuth)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const CAMPOS_PERMITIDOS = new Set([
  'cuenta_clabe', 'cuenta_banco', 'cuenta_titular',
  'mensaje_dia', 'mensaje_activo',
]);

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

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  if (!SB_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const sane = {};
  for (const [k, v] of Object.entries(body)) {
    if (!CAMPOS_PERMITIDOS.has(k)) continue;
    if (k === 'mensaje_activo') sane[k] = !!v;
    else if (v === null || v === '') sane[k] = null;
    else sane[k] = String(v);
  }

  if (Object.keys(sane).length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No hay campos válidos en el body' }) };
  }

  // UPSERT via PostgREST: POST con Prefer: resolution=merge-duplicates resuelve
  // por el primary key (id). Si la fila id=1 no existe, INSERT; si existe, UPDATE
  // solo las columnas presentes en el body (las demás se preservan).
  try {
    const url = `${SB_URL}/rest/v1/sistema_config`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({ id: 1, ...sane }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó el upsert', detail }) };
    }
    const rows = await r.json();
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, config: rows[0] || {} }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error escribiendo a Supabase', detail: e.message }) };
  }
};
