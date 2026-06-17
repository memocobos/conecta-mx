// =============================================================================
// admin-compras.js — COMPRAS (inventario de boletos en lotes) del Palacio de
// Kamisama (KH). Acceso server-side a la tabla `compras` con service_role +
// verifyAdminAuth. El Palacio es SOLO de maestro_roshi.
//
// Molde calcado de admin-proveedores.js / admin-coordi-asignaciones.js.
//
// Body JSON: { accion, ... }
//   - 'listar'   { evento_id } → { ok, compras:[{id,zona,cantidad,costo_unitario,
//                  proveedor_id,proveedor_nombre,fecha,nota}] }  (orden zona,fecha)
//   - 'crear'    { evento_id, zona, cantidad, costo_unitario, proveedor_id, fecha, nota? }
//                  → { ok, compra:{...} }
//   - 'eliminar' { id } → { ok }
//
// Whitelist de escritura EXACTA al .sql: evento_id, zona, cantidad,
// costo_unitario, proveedor_id, fecha, nota. (id/created_at son automáticos.)
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const ROLES_PALACIO = ['maestro_roshi']; // el Palacio es solo de maestro_roshi

const ACCIONES = {
  listar: ROLES_PALACIO,
  crear: ROLES_PALACIO,
  eliminar: ROLES_PALACIO,
};

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const EVENTO_RE = /^[A-Za-z0-9_.#-]+$/;   // slug del EV (id del array), p.ej. 'fanfest-imagine'
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const COMPRA_COLS = 'id,zona,cantidad,costo_unitario,proveedor_id,fecha,nota';
const ZONA_MAX = 120;
const NOTA_MAX = 500;

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
  const baseCompras = `${env.KH_SB_URL}/rest/v1/compras`;
  const baseProv = `${env.KH_SB_URL}/rest/v1/proveedores`;

  try {
    // ── compras: listar (por evento) ─────────────────────────────────────
    if (accion === 'listar') {
      const evento_id = String(body.evento_id || '').trim();
      if (!evento_id || !EVENTO_RE.test(evento_id) || evento_id.length > 120) {
        return bad(headers, 'evento_id inválido');
      }
      const sp = new URLSearchParams();
      sp.set('select', COMPRA_COLS);
      sp.set('evento_id', `eq.${evento_id}`);
      sp.set('order', 'zona.asc,fecha.asc');
      sp.set('limit', '5000');
      const r = await fetch(`${baseCompras}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const compras = await r.json();

      // Nombre del proveedor: una sola query a proveedores y mapeo en código
      // (robusto, sin depender del embedding de PostgREST).
      const rp = await fetch(`${baseProv}?select=id,nombre`, { headers: sbHeaders });
      const provs = rp.ok ? await rp.json() : [];
      const nombrePorId = {};
      if (Array.isArray(provs)) provs.forEach((p) => { nombrePorId[p.id] = p.nombre; });
      const out = (Array.isArray(compras) ? compras : []).map((c) => ({
        ...c, proveedor_nombre: nombrePorId[c.proveedor_id] || null,
      }));
      return ok(headers, { compras: out });
    }

    // ── compras: crear ───────────────────────────────────────────────────
    if (accion === 'crear') {
      const evento_id = String(body.evento_id || '').trim();
      if (!evento_id || !EVENTO_RE.test(evento_id) || evento_id.length > 120) return bad(headers, 'evento_id inválido');

      const zona = String(body.zona || '').trim();
      if (!zona) return bad(headers, 'La zona es obligatoria');
      if (zona.length > ZONA_MAX) return bad(headers, `La zona no puede pasar de ${ZONA_MAX} caracteres`);

      const cantidad = Number(body.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 0) return bad(headers, 'La cantidad debe ser un entero >= 0');

      const costo_unitario = Number(body.costo_unitario);
      if (!Number.isFinite(costo_unitario) || costo_unitario < 0) return bad(headers, 'El costo unitario debe ser un número >= 0');

      const proveedor_id = String(body.proveedor_id || '').trim();
      if (!UUID_RE.test(proveedor_id)) return bad(headers, 'proveedor_id inválido');

      const fecha = String(body.fecha || '').trim();
      if (!FECHA_RE.test(fecha)) return bad(headers, 'La fecha es obligatoria (YYYY-MM-DD)');

      const nota = cleanText(body.nota, NOTA_MAX);

      // El proveedor debe existir (FK; validamos antes para un error claro).
      const rDup = await fetch(`${baseProv}?id=eq.${proveedor_id}&select=id&limit=1`, { headers: sbHeaders });
      if (!rDup.ok) return upstream(headers, await rDup.text(), 'consulta');
      const existe = await rDup.json();
      if (!Array.isArray(existe) || !existe.length) return bad(headers, 'El proveedor no existe');

      const fila = { evento_id, zona, cantidad, costo_unitario, proveedor_id, fecha, nota };
      const r = await fetch(baseCompras, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'insert');
      const rows = await r.json();
      return ok(headers, { compra: rows[0] || null });
    }

    // ── compras: eliminar ────────────────────────────────────────────────
    if (accion === 'eliminar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const r = await fetch(`${baseCompras}?id=eq.${id}`, {
        method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) return upstream(headers, await r.text(), 'delete');
      return ok(headers, {});
    }

    return bad(headers, 'accion inválida');
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error interno', detail: e.message }) };
  }
};

function cleanText(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}
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
