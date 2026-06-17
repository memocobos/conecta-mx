// =============================================================================
// admin-venues-catalogo.js — Catálogo venue→zonas (SOLO nombres) para precargar
// las zonas en el creador de eventos de Esferas del Dragón.
//
// Acceso server-side a la tabla `venues_catalogo` (proyecto KH legacy) con
// service_role + verifyAdminAuth. Solo maestro_roshi (igual que esferas-crear y
// el resto del Palacio). Molde calcado de admin-proveedores.js.
//
// Body JSON: { accion, ... }
//   - 'listar'   {}                       → { ok, venues:[{venue, zonas}] }  (orden venue)
//   - 'guardar'  { venue, zonas:[nombres] } → { ok, venue }
//        UPSERT por `venue` (on_conflict=venue): si existe, actualiza zonas; no duplica.
//        Nombres: .trim() a cada zona, descarta vacíos y duplicados case-insensitive.
//        El catálogo guarda SOLO nombres de zona — NUNCA precios.
//
// Whitelist de escritura EXACTA al .sql: SOLO `venue`, `zonas`.
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const ROLES_PALACIO = ['maestro_roshi']; // el catálogo es solo de maestro_roshi

const ACCIONES = {
  listar: ROLES_PALACIO,
  guardar: ROLES_PALACIO,
};

// Columnas que viajan al navegador (existen en el .sql). No nombrar otras.
const VEN_COLS = 'venue,zonas';
const VENUE_MAX = 120;
const ZONA_MAX = 80;
const ZONAS_MAX = 100;

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

  const auth = verifyAdminAuth(event, ACCIONES[accion]);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const baseVen = `${env.KH_SB_URL}/rest/v1/venues_catalogo`;

  try {
    // ── venues_catalogo: listar ──────────────────────────────────────────
    if (accion === 'listar') {
      const sp = new URLSearchParams();
      sp.set('select', VEN_COLS);
      sp.set('order', 'venue.asc');
      sp.set('limit', '1000');
      const r = await fetch(`${baseVen}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const venues = await r.json();
      return ok(headers, { venues });
    }

    // ── venues_catalogo: guardar (upsert por venue) ──────────────────────
    if (accion === 'guardar') {
      const venue = (typeof body.venue === 'string') ? body.venue.trim() : '';
      if (!venue) return bad(headers, 'El venue es obligatorio');
      if (venue.length > VENUE_MAX) return bad(headers, `El venue no puede pasar de ${VENUE_MAX} caracteres`);

      // Nombres de zona: trim, descartar vacíos y duplicados case-insensitive
      // (conservando el primer orden visto). SOLO nombres, nunca precios.
      const zonasIn = Array.isArray(body.zonas) ? body.zonas : [];
      const zonas = [];
      const vistos = new Set();
      for (const z of zonasIn) {
        const n = (typeof z === 'string') ? z.trim() : '';
        if (!n || n.length > ZONA_MAX) continue;
        const low = n.toLowerCase();
        if (vistos.has(low)) continue;
        vistos.add(low);
        zonas.push(n);
      }
      if (!zonas.length) return bad(headers, 'No hay zonas válidas para guardar');
      if (zonas.length > ZONAS_MAX) return bad(headers, `Máximo ${ZONAS_MAX} zonas por venue`);

      // UPSERT por venue (unique). on_conflict=venue + merge-duplicates → si el
      // venue existe, actualiza `zonas`; si no, inserta. No duplica.
      const sp = new URLSearchParams();
      sp.set('on_conflict', 'venue');
      const r = await fetch(`${baseVen}?${sp.toString()}`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ venue, zonas }), // whitelist: SOLO venue, zonas
      });
      if (!r.ok) return upstream(headers, await r.text(), 'upsert');
      const rows = await r.json();
      const saved = (Array.isArray(rows) && rows[0]) ? rows[0].venue : venue;
      return ok(headers, { venue: saved });
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
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
