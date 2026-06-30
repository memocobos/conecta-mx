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
const REEMBOLSO_COLS = 'id,evento_slug,evento_nombre,cliente_nombre,cliente_correo,monto,estado,datos_bancarios,notas,creado_en,transferido_en';
const DATOS_MAX = 1000;
const NOTAS_MAX = 1000;

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
  const base = `${env.KH_SB_URL}/rest/v1/reembolsos`;

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

    // ── marcar_transferido ───────────────────────────────────────────────
    if (accion === 'marcar_transferido') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      return await patchReembolso(headers, sbHeaders, base, id, { estado: 'transferido', transferido_en: new Date().toISOString() });
    }

    // ── desmarcar (vuelve a pendiente) ───────────────────────────────────
    if (accion === 'desmarcar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      return await patchReembolso(headers, sbHeaders, base, id, { estado: 'pendiente', transferido_en: null });
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
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
