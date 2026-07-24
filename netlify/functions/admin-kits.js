// =============================================================================
// admin-kits.js — Acceso server-side a la tabla `kits_inventario` (KH)
//
// Cierra la exposición a anon: kamehouse.html ya NO lee/escribe `kits_inventario`
// directo con la anon key. Todo pasa por aquí con service_role + verifyAdminAuth.
// Mismo patrón que admin-usuarios/contratos/reportes/tours.
//
// Body JSON: { accion, ... }
//   - 'listar' { }  → array de piezas (order pieza.asc).
//        Roles: maestro_roshi, bulma, mister_popo, coordinador (todos los que ven
//        la pestaña Inventario + el form de Reportes). ⚠️ costo_unitario es SENSIBLE:
//        se OMITE para no-admins (popo/coordi) — espejo del `verCostos` del front.
//   - 'obtener' { id } → una pieza CON costo (form de edición). Roles: write.
//   - 'crear'  { pieza, cantidad, costo_unitario, stock_minimo?, proveedor?,
//        retornable? } → write. (TORRE v2 F1: `retornable` = "siempre vuelve" —
//        bocinas, hieleras… En F2+ las salidas la usan para marcar PRESTADO y la
//        comparación del regreso las exige de vuelta siempre. NO es sensible.)
//   - 'actualizar' { id, patch:{...} } → write. (cubre editar pieza y la baja de
//        stock al aprobar un reporte: patch={cantidad}.)
//   - 'eliminar' { id } → write.
//   Roles write = mister_popo + maestro_roshi + bulma (espejo de puedeEditarKarin).
//
// Seguridad:
//   - Authorization: Bearer <JWT> (verifyAdminAuth) + corsCheck.
//   - SELECT/escritura con whitelist explícita. costo_unitario solo a admins en listar.
//   - El cron check-strikes-diario.js lee kits_inventario con service_role (aparte);
//     el cierre RLS no lo rompe.
//
// Env vars (reusa las de KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE,
//   JWT_SECRET (lo lee verifyAdminAuth).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ROLES_ADMIN = ['maestro_roshi', 'bulma', 'milk'];                          // ven costos
const ROLES_READ  = ['maestro_roshi', 'bulma', 'mister_popo', 'coordinador', 'milk'];
const ROLES_WRITE = ['maestro_roshi', 'bulma', 'mister_popo', 'milk'];           // CRUD inventario

// Acciones válidas → roles permitidos.
const ACCIONES = {
  listar: ROLES_READ,
  obtener: ROLES_WRITE,
  crear: ROLES_WRITE,
  actualizar: ROLES_WRITE,
  eliminar: ROLES_WRITE,
};

// Columnas. costo_unitario es SENSIBLE (se omite a no-admins en listar).
// `retornable` NO es sensible: la ven todos los roles read (la necesitan el
// form de salidas y la vista de prestado de las fases F2+).
const COLS_FULL   = 'id,pieza,cantidad,costo_unitario,stock_minimo,proveedor,retornable';
const COLS_NOCOST = 'id,pieza,cantidad,stock_minimo,proveedor,retornable';

// Campos que el cliente puede setear (crear/actualizar).
const KIT_FIELDS = ['pieza', 'cantidad', 'costo_unitario', 'stock_minimo', 'proveedor', 'retornable'];

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

  const jwtRol = auth.user && auth.user.rol;
  const esAdmin = ROLES_ADMIN.includes(jwtRol);

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const base = `${env.KH_SB_URL}/rest/v1/kits_inventario`;

  try {
    // ── listar ──────────────────────────────────────────────────────────────
    if (accion === 'listar') {
      const cols = esAdmin ? COLS_FULL : COLS_NOCOST; // oculta costo a no-admins
      const r = await fetch(`${base}?select=${cols}&order=pieza.asc`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      const kits = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, kits }) };
    }

    // ── obtener (form de edición — incluye costo) ─────────────────────────────
    if (accion === 'obtener') {
      const id = validId(body.id);
      if (!id) return badId();
      const r = await fetch(`${base}?id=eq.${id}&select=${COLS_FULL}&limit=1`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, kit: rows[0] || null }) };
    }

    // ── crear ─────────────────────────────────────────────────────────────────
    if (accion === 'crear') {
      const fila = buildFila(body);
      if (fila.error) return { statusCode: 400, headers, body: JSON.stringify({ error: fila.error }) };
      if (!fila.value.pieza) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'pieza requerida' }) };
      }
      if (fila.value.cantidad == null || fila.value.costo_unitario == null) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'cantidad y costo_unitario requeridos' }) };
      }
      const r = await fetch(base, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(fila.value),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el insert', detail }) };
      }
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, kit: rows[0] || null }) };
    }

    // ── actualizar (editar pieza · o baja de stock {cantidad}) ─────────────────
    if (accion === 'actualizar') {
      const id = validId(body.id);
      if (!id) return badId();
      const patch = (body.patch && typeof body.patch === 'object') ? body.patch : {};
      const fila = buildFila(patch);
      if (fila.error) return { statusCode: 400, headers, body: JSON.stringify({ error: fila.error }) };
      if (!Object.keys(fila.value).length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nada que actualizar' }) };
      }
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(fila.value),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── eliminar ────────────────────────────────────────────────────────────
    if (accion === 'eliminar') {
      const id = validId(body.id);
      if (!id) return badId();
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
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-kits', detail: e.message }) };
  }

  // ----- helpers de cierre (capturan headers) -----
  function validId(x) { const id = String(x || '').trim(); return UUID_RE.test(id) ? id : null; }
  function badId() { return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) }; }
};

// ----- helpers -----

// Construye una fila/patch con whitelist + validación numérica. Devuelve
// { value } o { error }. Solo incluye las llaves presentes en `src`.
function buildFila(src) {
  const out = {};
  for (const k of KIT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    let v = src[k];
    if (k === 'pieza') {
      v = String(v || '').trim();
      if (!v) return { error: 'pieza vacía' };
      out.pieza = v.slice(0, 200);
    } else if (k === 'proveedor') {
      out.proveedor = (v == null || v === '') ? null : String(v).trim().slice(0, 200);
    } else if (k === 'cantidad' || k === 'stock_minimo') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) return { error: `${k} debe ser entero >= 0` };
      out[k] = n;
    } else if (k === 'costo_unitario') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return { error: 'costo_unitario debe ser número >= 0' };
      out.costo_unitario = n;
    } else if (k === 'retornable') {
      // Coerción tolerante (checkbox del front manda boolean; JSON raro no truena).
      out.retornable = v === true || v === 'true' || v === 1;
    }
  }
  return { value: out };
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
