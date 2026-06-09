// =============================================================================
// admin-rooming.js — Acceso server-side a `rooming_habitaciones` (KH)
//
// Cierra la exposición anon: kamehouse.html ya NO lee/escribe rooming_habitaciones
// con la anon key. Todo pasa por aquí con service_role + verifyAdminAuth.
// Pantalla: Capsule Corp (rol maestro_roshi + bulma). Sin backend/cron que la toque.
//
// Body JSON: { accion, ... }   (Roles: maestro_roshi + bulma)
//   - 'listar' { evento_id } → habitaciones del evento (order orden.asc).
//   - 'crear'  { evento_id, tipo, orden, numero_hab, ocupantes, hotel_nombre,
//                hotel_direccion, incluye_desayuno } → { ok, hab }.
//   - 'actualizar' { id, patch:{...whitelist} } → ok.
//   - 'eliminar' { id } → ok.
//
// Seguridad: verifyAdminAuth + corsCheck. service_role para la query. Whitelist de
// columnas. NUNCA se expone la service key.
//
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const ROLES = ['maestro_roshi', 'bulma'];

const ACCIONES = { listar: ROLES, crear: ROLES, actualizar: ROLES, eliminar: ROLES };

const COLS = 'id,evento_id,tipo,orden,numero_hab,ocupantes,hotel_nombre,hotel_direccion,incluye_desayuno';
// Campos que el cliente puede setear (evento_id solo en crear).
const FIELDS = ['tipo', 'orden', 'numero_hab', 'ocupantes', 'hotel_nombre', 'hotel_direccion', 'incluye_desayuno'];

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
  const base = `${env.KH_SB_URL}/rest/v1/rooming_habitaciones`;

  try {
    if (accion === 'listar') {
      const eventoId = String(body.evento_id || '').trim();
      if (!SLUG_RE.test(eventoId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
      }
      const r = await fetch(`${base}?evento_id=eq.${encodeURIComponent(eventoId)}&select=${COLS}&order=orden.asc`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, habitaciones: await r.json() }) };
    }

    if (accion === 'crear') {
      const eventoId = String(body.evento_id || '').trim();
      if (!SLUG_RE.test(eventoId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
      }
      const fila = buildFila(body);
      fila.evento_id = eventoId;
      const r = await fetch(base, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el insert', detail }) };
      }
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, hab: rows[0] || null }) };
    }

    if (accion === 'actualizar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const patch = (body.patch && typeof body.patch === 'object') ? body.patch : {};
      const fila = buildFila(patch);
      if (!Object.keys(fila).length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nada que actualizar' }) };
      }
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (accion === 'eliminar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el delete', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-rooming', detail: e.message }) };
  }
};

// ----- helpers -----

// Whitelist de campos seteable (tipo/orden/numero_hab/ocupantes/hotel_*/incluye_desayuno).
function buildFila(src) {
  const out = {};
  for (const k of FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    let v = src[k];
    if (k === 'orden') {
      const n = Number(v);
      out.orden = Number.isFinite(n) ? n : 0;
    } else if (k === 'incluye_desayuno') {
      out.incluye_desayuno = !!v;
    } else {
      out[k] = (v == null) ? null : (typeof v === 'string' ? v.slice(0, 4000) : v);
    }
  }
  return out;
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
