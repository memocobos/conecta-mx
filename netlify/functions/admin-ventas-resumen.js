// =============================================================================
// admin-ventas-resumen.js — Acceso server-side a la vista `resumen_eventos` (KH)
//
// Cierra el ÚLTIMO acceso anon de finanzas: kamehouse.html `loadVentas()` ("Mis
// Ventas") leía `resumen_eventos` con la anon key. Esa vista expone
// total_cobrar/cobrado/pendiente/costos/utilidad por evento → no debe ser anon.
// Todo pasa por aquí con service_role + verifyAdminAuth. Mismo patrón de LECTURA
// que admin-reportes.js.
//
// El rol vendedor / "Mis Ventas" como feature AÚN NO está construido, así que
// por ahora esto se gatea a admin (maestro_roshi, bulma). Cuando exista el rol
// vendedor se reabrirá el gate aquí; el mapa de tabs y el rol no se tocan.
//
// Body JSON: { accion:'listar' } → { ok, eventos:[...] }. Otra acción → 400.
//
// Seguridad: Authorization Bearer <JWT> (verifyAdminAuth) + corsCheck. SELECT con
// whitelist explícita COLS (NO select=*). service_role nunca se expone.
//
// Env vars (reusa las de KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE,
//   JWT_SECRET (lo lee verifyAdminAuth).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const ROLES_ADMIN = ['maestro_roshi', 'bulma'];

// Whitelist de columnas que SÍ viajan al navegador (las que el render de "Mis
// Ventas" ya usa). NO select=* — la vista trae finanzas sensibles.
const COLS = [
  'id', 'nombre', 'artista', 'fecha', 'ciudad', 'status', 'total_viajeros',
  'total_cobrar', 'total_cobrado', 'total_pendiente', 'total_costos', 'utilidad_actual',
].join(',');

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

  if (body.accion !== 'listar') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  }

  const auth = verifyAdminAuth(event, ROLES_ADMIN);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const base = `${env.KH_SB_URL}/rest/v1/resumen_eventos`;

  try {
    const r = await fetch(`${base}?select=${COLS}&order=fecha.desc&limit=50`, { headers: sbHeaders });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
    }
    const eventos = await r.json();
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, eventos: Array.isArray(eventos) ? eventos : [] }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-ventas-resumen', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
