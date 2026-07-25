// =============================================================================
// admin-deliverables.js — Acceso server-side a la tabla `deliverables_creadoras` (KH)
//
// Cierra la exposición a anon: kamehouse.html ya NO lee/escribe esta tabla con la
// anon key. Todo pasa por aquí con service_role + verifyAdminAuth. Mismo patrón
// que admin-reportes.js / admin-coordi-asignaciones.js.
//
// La tabla es un CHECKLIST de material entregable por asignación (perfil de
// creadora cc), NO archivos. Columnas: id, evento_coordi_id, descripcion, estado
// ('pendiente'|'completado'), completado_at, link_contenido, notas, created_at.
// FK: evento_coordi_id → eventos_coordi(id). El DUEÑO de un deliverable es
// eventos_coordi.coordi_id (NO hay coordi_id en deliverables_creadoras).
//
// Body JSON: { accion, ... }
//   - 'listar'         { evento_coordi_ids:[uuid,...] } → { ok, rows:[...] }
//   - 'obtener'        { id } → { ok, row }            (para prellenar prompts)
//   - 'crear_defaults' { evento_coordi_id, descripciones:[str,...] } → { ok, rows }
//   - 'add_extra'      { evento_coordi_id, descripcion } → { ok, row }
//   - 'toggle'         { id } → { ok, row }   (lee estado actual y lo invierte;
//                       completado_at = ahora si pasa a completado, null si vuelve)
//   - 'editar_link'    { id, link_contenido|null } → { ok }
//   - 'editar_notas'   { id, notas|null } → { ok }
//   - 'borrar'         { id } → { ok }
//
// CANDADO (anti-escalación):
//   - Roles: ['cc','maestro_roshi','bulma']. (NO coordinador.)
//   - cc: SOLO sus propios deliverables — los ligados a una asignación
//     (eventos_coordi) cuyo coordi_id === jwt. Se verifica server-side en TODAS
//     las acciones (no se confía en el front). admin (maestro_roshi/bulma): todo.
//
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE,
//   JWT_SECRET (lo lee verifyAdminAuth).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ROLES_ALL = ['cc', 'maestro_roshi', 'bulma', 'milk'];
const ROLES_ADMIN = ['maestro_roshi', 'bulma'];

const ESTADOS = ['pendiente', 'completado'];
const MAX_DESC = 300;
const MAX_LINK = 1000;
const MAX_NOTAS = 2000;
const MAX_IDS = 200;       // tope de evento_coordi_ids por listar
const MAX_DEFAULTS = 20;   // tope de descripciones por crear_defaults

// Columnas que viajan al navegador (whitelist).
const COLS = 'id,evento_coordi_id,descripcion,estado,completado_at,link_contenido,notas,created_at';

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
  const ACCIONES = ['listar', 'obtener', 'crear_defaults', 'add_extra', 'toggle', 'editar_link', 'editar_notas', 'borrar'];
  if (!ACCIONES.includes(accion)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  }

  // Todas las acciones permiten los mismos roles; el candado fino (cc solo lo
  // suyo) se aplica por código más abajo.
  const auth = verifyAdminAuth(event, ROLES_ALL);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const jwtUserId = auth.user && (auth.user.id || auth.user.sub);
  const jwtRol = auth.user && auth.user.rol;
  if (!jwtUserId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JWT sin id de usuario' }) };
  }
  const esAdmin = ROLES_ADMIN.includes(jwtRol);

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const base = `${env.KH_SB_URL}/rest/v1/deliverables_creadoras`;
  const baseEC = `${env.KH_SB_URL}/rest/v1/eventos_coordi`;

  // ── Helpers de propiedad (anti-escalación) ────────────────────────────────
  // ¿La asignación (eventos_coordi) es de esta cc? admin siempre true.
  async function ecOwned(ecId) {
    if (esAdmin) return { ok: true };
    const r = await fetch(`${baseEC}?id=eq.${ecId}&select=coordi_id&limit=1`, { headers: sbHeaders });
    if (!r.ok) return { error: 'KH rechazó la consulta de asignación', detail: await r.text() };
    const rows = await r.json();
    const row = rows[0];
    if (!row) return { notFound: true };
    return { ok: row.coordi_id === jwtUserId };
  }
  // Devuelve el evento_coordi_id de un deliverable (para resolver su dueño).
  async function delivEc(id) {
    const r = await fetch(`${base}?id=eq.${id}&select=id,evento_coordi_id&limit=1`, { headers: sbHeaders });
    if (!r.ok) return { error: 'KH rechazó la consulta', detail: await r.text() };
    const rows = await r.json();
    return { row: rows[0] || null };
  }
  // Verifica que un deliverable por id sea de la cc (o admin). Devuelve
  // {status,error} listo para retornar si NO autorizado, o {ok:true} si sí.
  async function assertDelivOwned(id) {
    if (esAdmin) return { ok: true };
    const d = await delivEc(id);
    if (d.error) return { status: 502, error: d.error, detail: d.detail };
    if (!d.row) return { status: 404, error: 'Deliverable no encontrado' };
    const owned = await ecOwned(d.row.evento_coordi_id);
    if (owned.error) return { status: 502, error: owned.error, detail: owned.detail };
    if (owned.notFound) return { status: 404, error: 'Asignación no encontrada' };
    if (!owned.ok) return { status: 403, error: 'No puedes tocar deliverables de otra creadora' };
    return { ok: true };
  }

  try {
    // ── listar ────────────────────────────────────────────────────────────
    if (accion === 'listar') {
      let ids = Array.isArray(body.evento_coordi_ids) ? body.evento_coordi_ids : [];
      ids = ids.map(x => String(x || '').trim()).filter(x => UUID_RE.test(x));
      if (!ids.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, rows: [] }) };
      if (ids.length > MAX_IDS) ids = ids.slice(0, MAX_IDS);

      // cc: filtrar a SOLO sus asignaciones (intersección con eventos_coordi suyas).
      if (!esAdmin) {
        const own = await ecOwnedSet(ids);
        if (own.error) return { statusCode: 502, headers, body: JSON.stringify({ error: own.error, detail: own.detail }) };
        ids = ids.filter(id => own.set.has(id));
        if (!ids.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, rows: [] }) };
      }

      const inList = ids.map(id => `"${id}"`).join(',');
      const r = await fetch(`${base}?evento_coordi_id=in.(${inList})&select=${COLS}&order=created_at.asc`, { headers: sbHeaders });
      if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail: await r.text() }) };
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, rows }) };
    }

    // ── obtener ─────────────────────────────────────────────────────────────
    if (accion === 'obtener') {
      const id = validUuid(body.id);
      if (!id) return badId();
      const guard = await assertDelivOwned(id);
      if (!guard.ok) return { statusCode: guard.status, headers, body: JSON.stringify({ error: guard.error, detail: guard.detail }) };
      const r = await fetch(`${base}?id=eq.${id}&select=${COLS}&limit=1`, { headers: sbHeaders });
      if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail: await r.text() }) };
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, row: rows[0] || null }) };
    }

    // ── crear_defaults (auto-popular una asignación vacía) ────────────────────
    if (accion === 'crear_defaults') {
      const ecId = validUuid(body.evento_coordi_id);
      if (!ecId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_coordi_id inválido' }) };
      const owned = await ecOwned(ecId);
      if (owned.error) return { statusCode: 502, headers, body: JSON.stringify({ error: owned.error, detail: owned.detail }) };
      if (owned.notFound) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Asignación no encontrada' }) };
      if (!owned.ok) return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes crear deliverables en otra asignación' }) };

      let descs = Array.isArray(body.descripciones) ? body.descripciones : [];
      descs = descs.map(d => String(d == null ? '' : d).trim()).filter(Boolean).slice(0, MAX_DEFAULTS);
      if (descs.some(d => d.length > MAX_DESC)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'descripción demasiado larga' }) };
      }
      if (!descs.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, rows: [] }) };

      const filas = descs.map(d => ({ evento_coordi_id: ecId, descripcion: d, estado: 'pendiente' }));
      const r = await fetch(`${base}?select=${COLS}`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(filas),
      });
      if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el insert', detail: await r.text() }) };
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, rows }) };
    }

    // ── add_extra (un deliverable suelto) ─────────────────────────────────────
    if (accion === 'add_extra') {
      const ecId = validUuid(body.evento_coordi_id);
      if (!ecId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_coordi_id inválido' }) };
      const owned = await ecOwned(ecId);
      if (owned.error) return { statusCode: 502, headers, body: JSON.stringify({ error: owned.error, detail: owned.detail }) };
      if (owned.notFound) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Asignación no encontrada' }) };
      if (!owned.ok) return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes crear deliverables en otra asignación' }) };

      const descripcion = String(body.descripcion == null ? '' : body.descripcion).trim();
      if (!descripcion) return { statusCode: 400, headers, body: JSON.stringify({ error: 'descripcion requerida' }) };
      if (descripcion.length > MAX_DESC) return { statusCode: 400, headers, body: JSON.stringify({ error: 'descripcion demasiado larga' }) };

      const r = await fetch(`${base}?select=${COLS}`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ evento_coordi_id: ecId, descripcion, estado: 'pendiente' }),
      });
      if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el insert', detail: await r.text() }) };
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, row: rows[0] || null }) };
    }

    // ── toggle (lee estado actual y lo invierte) ──────────────────────────────
    if (accion === 'toggle') {
      const id = validUuid(body.id);
      if (!id) return badId();
      const guard = await assertDelivOwned(id);
      if (!guard.ok) return { statusCode: guard.status, headers, body: JSON.stringify({ error: guard.error, detail: guard.detail }) };
      // Estado actual server-side (no se confía en el front).
      const cur = await fetch(`${base}?id=eq.${id}&select=estado&limit=1`, { headers: sbHeaders });
      if (!cur.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail: await cur.text() }) };
      const curRows = await cur.json();
      if (!curRows[0]) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Deliverable no encontrado' }) };
      const nuevo = curRows[0].estado === 'completado' ? 'pendiente' : 'completado';
      const patch = { estado: nuevo, completado_at: nuevo === 'completado' ? new Date().toISOString() : null };
      const r = await fetch(`${base}?id=eq.${id}&select=${COLS}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail: await r.text() }) };
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, row: rows[0] || null }) };
    }

    // ── editar_link ───────────────────────────────────────────────────────────
    if (accion === 'editar_link') {
      const id = validUuid(body.id);
      if (!id) return badId();
      const guard = await assertDelivOwned(id);
      if (!guard.ok) return { statusCode: guard.status, headers, body: JSON.stringify({ error: guard.error, detail: guard.detail }) };
      let link = body.link_contenido;
      if (link == null || link === '') link = null;
      else {
        link = String(link).trim();
        if (!link) link = null;
        else if (link.length > MAX_LINK) return { statusCode: 400, headers, body: JSON.stringify({ error: 'link demasiado largo' }) };
      }
      return await patchDeliv(id, { link_contenido: link });
    }

    // ── editar_notas ──────────────────────────────────────────────────────────
    if (accion === 'editar_notas') {
      const id = validUuid(body.id);
      if (!id) return badId();
      const guard = await assertDelivOwned(id);
      if (!guard.ok) return { statusCode: guard.status, headers, body: JSON.stringify({ error: guard.error, detail: guard.detail }) };
      let notas = body.notas;
      if (notas == null || notas === '') notas = null;
      else {
        notas = String(notas).trim();
        if (!notas) notas = null;
        else if (notas.length > MAX_NOTAS) return { statusCode: 400, headers, body: JSON.stringify({ error: 'notas demasiado largas' }) };
      }
      return await patchDeliv(id, { notas });
    }

    // ── borrar ────────────────────────────────────────────────────────────────
    if (accion === 'borrar') {
      const id = validUuid(body.id);
      if (!id) return badId();
      const guard = await assertDelivOwned(id);
      if (!guard.ok) return { statusCode: guard.status, headers, body: JSON.stringify({ error: guard.error, detail: guard.detail }) };
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el delete', detail: await r.text() }) };
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-deliverables', detail: e.message }) };
  }

  // ----- helpers de cierre (capturan headers/base/sbHeaders/baseEC/jwt) -----
  function validUuid(x) { const id = String(x || '').trim(); return UUID_RE.test(id) ? id : null; }
  function badId() { return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) }; }

  async function patchDeliv(id, patch) {
    const r = await fetch(`${base}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail: await r.text() }) };
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // Conjunto de evento_coordi_ids (de la lista pedida) que SÍ son de esta cc.
  async function ecOwnedSet(ids) {
    const inList = ids.map(id => `"${id}"`).join(',');
    const r = await fetch(`${baseEC}?id=in.(${inList})&coordi_id=eq.${jwtUserId}&select=id`, { headers: sbHeaders });
    if (!r.ok) return { error: 'KH rechazó la consulta de asignaciones', detail: await r.text() };
    const rows = await r.json();
    return { set: new Set(rows.map(x => x.id)) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
