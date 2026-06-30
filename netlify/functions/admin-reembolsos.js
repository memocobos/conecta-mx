// =============================================================================
// admin-reembolsos.js — Panel de Reembolsos (Cancelar evento — Fase 3a, backend).
//
// Acceso server-side a la tabla `reembolsos` (KH) con service_role +
// verifyAdminAuth. Lista los reembolsos (todos o por evento), guarda los datos
// bancarios que respondió el cliente, y marca/desmarca un reembolso como
// transferido. Solo de maestro_roshi. NO toca el Palacio (eso es la 3c).
//
// Molde calcado de admin-compras.js (ACCIONES por acción).
//
// Body JSON: { accion, ... }
//   - 'listar' { slug? } → { ok, reembolsos:[...], totales:{...} }
//   - 'guardar_datos' { id, datos_bancarios?, notas? } → { ok }
//   - 'marcar_transferido' { id } → { ok }
//   - 'desmarcar' { id } → { ok }
//
// Columnas (ya existen en .sql): id, evento_slug, evento_nombre, cliente_nombre,
//   cliente_correo, monto, estado, datos_bancarios, notas, creado_en, transferido_en.
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const ROLES_PALACIO = ['maestro_roshi']; // el Palacio es solo de maestro_roshi

const ACCIONES = {
  listar: ROLES_PALACIO,
  guardar_datos: ROLES_PALACIO,
  marcar_transferido: ROLES_PALACIO,
  desmarcar: ROLES_PALACIO,
};

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[A-Za-z0-9_.#-]+$/;
const REEMBOLSO_COLS = 'id,evento_slug,evento_nombre,cliente_nombre,cliente_correo,monto,estado,datos_bancarios,notas,creado_en,transferido_en,cuenta,gasto_id';
const DATOS_MAX = 1000;
const NOTAS_MAX = 1000;
// Cuentas válidas a las que se imputa la salida del reembolso (caja del Palacio).
const CUENTAS = ['BBVA', 'Banamex', 'Efectivo'];

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
  const portalHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const base = `${env.KH_SB_URL}/rest/v1/reembolsos`;
  const baseGastos = `${env.PORTAL_SB_URL}/rest/v1/gastos`;

  try {
    // ── listar (todos o por evento) ──────────────────────────────────────
    if (accion === 'listar') {
      const sp = new URLSearchParams();
      sp.set('select', REEMBOLSO_COLS);
      sp.set('order', 'creado_en.desc');
      sp.set('limit', '5000');
      if (body.slug != null && body.slug !== '') {
        const slug = String(body.slug).trim().toLowerCase();
        if (!SLUG_RE.test(slug) || slug.length > 120) return bad(headers, 'slug inválido');
        sp.set('evento_slug', `eq.${slug}`);
      }
      const r = await fetch(`${base}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const reembolsos = await r.json();
      const lista = Array.isArray(reembolsos) ? reembolsos : [];

      const totales = { pendiente_monto: 0, transferido_monto: 0, pendiente_n: 0, transferido_n: 0 };
      for (const x of lista) {
        const monto = Number(x.monto) || 0;
        if (x.estado === 'pendiente') { totales.pendiente_monto += monto; totales.pendiente_n++; }
        else if (x.estado === 'transferido') { totales.transferido_monto += monto; totales.transferido_n++; }
      }
      return ok(headers, { reembolsos: lista, totales });
    }

    // ── guardar_datos (datos bancarios / notas que respondió el cliente) ──
    if (accion === 'guardar_datos') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const patch = {};
      if ('datos_bancarios' in body) patch.datos_bancarios = cleanText(body.datos_bancarios, DATOS_MAX);
      if ('notas' in body) patch.notas = cleanText(body.notas, NOTAS_MAX);
      if (!Object.keys(patch).length) return bad(headers, 'Nada que guardar (datos_bancarios o notas)');
      return await patchReembolso(headers, sbHeaders, base, id, patch);
    }

    // ── marcar_transferido (registra la SALIDA en gastos del Portal) ─────
    if (accion === 'marcar_transferido') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const cuenta = String(body.cuenta || '').trim();
      if (!CUENTAS.includes(cuenta)) return bad(headers, 'cuenta inválida');

      // Leer el reembolso.
      const rGet = await fetch(`${base}?id=eq.${id}&select=evento_slug,evento_nombre,cliente_nombre,monto,estado,gasto_id&limit=1`, { headers: sbHeaders });
      if (!rGet.ok) return upstream(headers, await rGet.text(), 'consulta');
      const rows = await rGet.json();
      const rb = Array.isArray(rows) ? rows[0] : null;
      if (!rb) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Reembolso no encontrado' }) };

      // Idempotencia: ya transferido / ya con gasto → no crear otro.
      if (rb.estado === 'transferido' || rb.gasto_id != null) {
        return ok(headers, { ya: true });
      }

      // Crear la salida en gastos (Portal). Si falla, NO marcamos (queda pendiente).
      const gRes = await fetch(baseGastos, {
        method: 'POST',
        headers: { ...portalHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({
          evento_id: rb.evento_slug,
          concepto: `Reembolso a ${rb.cliente_nombre || 'cliente'}`,
          monto: Number(rb.monto) || 0,
          cuenta,
          categoria: 'Reembolso',
          fecha: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!gRes.ok) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo registrar la salida del reembolso', detail: await gRes.text() }) };
      }
      const gJson = await gRes.json();
      const gastoId = Array.isArray(gJson) ? (gJson[0] && gJson[0].id) : (gJson && gJson.id);

      // Marcar el reembolso. Si falla, ROLLBACK del gasto recién creado.
      const pRes = await fetch(`${base}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ estado: 'transferido', transferido_en: new Date().toISOString(), cuenta, gasto_id: gastoId }),
      });
      if (!pRes.ok) {
        if (gastoId != null) {
          await fetch(`${baseGastos}?id=eq.${encodeURIComponent(gastoId)}`, { method: 'DELETE', headers: portalHeaders }).catch(() => {});
        }
        return upstream(headers, await pRes.text(), 'update');
      }
      return ok(headers, {});
    }

    // ── desmarcar (vuelve a pendiente, borra la salida de gastos) ─────────
    if (accion === 'desmarcar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');

      const rGet = await fetch(`${base}?id=eq.${id}&select=gasto_id&limit=1`, { headers: sbHeaders });
      if (!rGet.ok) return upstream(headers, await rGet.text(), 'consulta');
      const rows = await rGet.json();
      const rb = Array.isArray(rows) ? rows[0] : null;
      if (!rb) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Reembolso no encontrado' }) };

      // Revertir la salida en gastos (si la hay). Un DELETE de un id inexistente
      // devuelve ok, así que esto solo frena ante errores reales.
      if (rb.gasto_id != null) {
        const dRes = await fetch(`${baseGastos}?id=eq.${encodeURIComponent(rb.gasto_id)}`, { method: 'DELETE', headers: portalHeaders });
        if (!dRes.ok) {
          return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo revertir la salida; el reembolso sigue transferido', detail: await dRes.text() }) };
        }
      }

      return await patchReembolso(headers, sbHeaders, base, id, { estado: 'pendiente', transferido_en: null, cuenta: null, gasto_id: null });
    }

    return bad(headers, 'accion inválida');
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-reembolsos', detail: e.message }) };
  }
};

// ----- helpers -----

async function patchReembolso(headers, sbHeaders, base, id, patch) {
  const r = await fetch(`${base}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) return upstream(headers, await r.text(), 'update');
  return ok(headers, {});
}

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
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars Portal (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE, PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
