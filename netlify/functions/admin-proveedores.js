// =============================================================================
// admin-proveedores.js — Catálogo de PROVEEDORES del Palacio de Kamisama (KH).
//
// Acceso server-side a la tabla `proveedores` (proyecto KH legacy) con
// service_role + verifyAdminAuth. El Palacio es SOLO de maestro_roshi.
//
// Molde calcado de admin-coordi-asignaciones.js (readEnv KH, router accion,
// sbHeaders, fetch a ${KH_SB_URL}/rest/v1/proveedores).
//
// Body JSON: { accion, ... }
//   - 'listar'  {}            → { ok, proveedores:[{id,nombre,created_at}] }  (orden nombre)
//   - 'crear'   { nombre }    → { ok, proveedor:{...} }
//        nombre: string no vacío, trim, máx 80. Rechaza duplicado
//        case-insensitive ("Ese proveedor ya existe") sin crear.
//
// Whitelist de escritura EXACTA al .sql: SOLO `nombre`.
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const ROLES_PALACIO = ['maestro_roshi']; // el Palacio es solo de maestro_roshi

const ACCIONES = {
  listar: ROLES_PALACIO,
  crear: ROLES_PALACIO,
};

// Columnas que viajan al navegador (existen en el .sql). No nombrar otras.
const PROV_COLS = 'id,nombre,created_at';
const NOMBRE_MAX = 80;

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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const accion = body.accion;
  if (!(accion in ACCIONES)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  }

  const auth = await verifyAdminAuthLive(event, ACCIONES[accion]);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const baseProv = `${env.KH_SB_URL}/rest/v1/proveedores`;

  try {
    // ── proveedores: listar ──────────────────────────────────────────────
    if (accion === 'listar') {
      const sp = new URLSearchParams();
      sp.set('select', PROV_COLS);
      sp.set('order', 'nombre.asc');
      sp.set('limit', '1000');
      const r = await fetch(`${baseProv}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const proveedores = await r.json();
      return ok(headers, { proveedores });
    }

    // ── proveedores: crear ───────────────────────────────────────────────
    if (accion === 'crear') {
      const nombre = (typeof body.nombre === 'string') ? body.nombre.trim() : '';
      if (!nombre) return bad(headers, 'El nombre es obligatorio');
      if (nombre.length > NOMBRE_MAX) return bad(headers, `El nombre no puede pasar de ${NOMBRE_MAX} caracteres`);

      // Duplicado case-insensitive: traemos los nombres y comparamos en código
      // (evita los comodines de ilike y no depende de un índice UNIQUE).
      const rDup = await fetch(`${baseProv}?select=nombre`, { headers: sbHeaders });
      if (!rDup.ok) return upstream(headers, await rDup.text(), 'consulta');
      const existentes = await rDup.json();
      const low = nombre.toLowerCase();
      if (Array.isArray(existentes) && existentes.some((p) => String(p.nombre || '').trim().toLowerCase() === low)) {
        return bad(headers, 'Ese proveedor ya existe');
      }

      const r = await fetch(baseProv, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ nombre }), // whitelist: SOLO nombre
      });
      if (!r.ok) return upstream(headers, await r.text(), 'insert');
      const rows = await r.json();
      return ok(headers, { proveedor: rows[0] || null });
    }

    return bad(headers, 'accion inválida');
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error interno', detail: e.message }) };
  }
};

function ok(headers, extra) {
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...(extra || {}) }) };
}
function bad(headers, error) {
  return { statusCode: 400, headers, body: JSON.stringify({ error }) };
}
function upstream(headers, detail, op) {
  return { statusCode: 502, headers, body: JSON.stringify({ error: `KH rechazó el ${op}`, detail }) };
}

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
