// =============================================================================
// esferas-crear
//
// Alta de un evento en la tabla esferas_eventos (Esferas del Dragón, Pieza 1).
// PURAMENTE ADITIVO. Solo maestro_roshi puede crear (igual que sistema-config-save).
//
// Body JSON: { slug, nombre, fecha_inicio?, ciudad?, tipo?, status? }
//   - slug se normaliza a lowercase y debe cumplir ^[a-z0-9-]+$
//   - 'publicado' NO se acepta del cliente; queda en su default de DB (false).
//   - Campos fuera de la whitelist se ignoran silenciosamente.
//
// Seguridad / molde idéntico a sistema-config-save:
//   - Authorization: Bearer <JWT>, verifyAdminAuth(event, ['maestro_roshi'])
//   - INSERT vía PostgREST con service_role (bypass RLS) — service_role no sale al cliente
//
// Env vars:
//   - SUPABASE_SERVICE_KEY_KAMEHOUSE
//   - JWT_SECRET (lo lee verifyAdminAuth)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

// Whitelist estricta. 'publicado' deliberadamente AUSENTE: queda en su default DB.
const CAMPOS_PERMITIDOS = new Set([
  'slug', 'nombre', 'fecha_inicio', 'ciudad', 'tipo', 'status',
]);

const SLUG_RE = /^[a-z0-9-]+$/;
const STATUS_PERMITIDOS = new Set(['', 'proximamente', 'por-confirmar', 'ultimos', 'agotado', 'proceso']);

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

  // Solo columnas whitelisted. status vacío = '' (A la venta); el resto vacío = null.
  const sane = {};
  for (const [k, v] of Object.entries(body)) {
    if (!CAMPOS_PERMITIDOS.has(k)) continue;
    if (v === null || v === '') sane[k] = (k === 'status') ? '' : null;
    else sane[k] = String(v);
  }

  // slug: requerido, lowercase, regex estricta.
  const slug = String(sane.slug || '').toLowerCase().trim();
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El slug es requerido' }) };
  if (!SLUG_RE.test(slug)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Slug inválido: solo minúsculas, números y guiones (^[a-z0-9-]+$)' }) };
  }
  sane.slug = slug;

  // nombre: requerido.
  if (!sane.nombre) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El nombre es requerido' }) };

  // status: si no viene, default '' (A la venta). Si viene, debe estar permitido.
  if (sane.status === undefined || sane.status === null) sane.status = '';
  if (!STATUS_PERMITIDOS.has(sane.status)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Status no permitido' }) };
  }

  // INSERT vía PostgREST. return=representation para devolver el row creado.
  try {
    const url = `${SB_URL}/rest/v1/esferas_eventos`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(sane),
    });
    if (!r.ok) {
      const detail = await r.text();
      // 23505 = unique_violation (PK slug duplicado) → 409 con mensaje claro.
      if (r.status === 409 || detail.includes('23505') || /duplicate key/i.test(detail)) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'Ya existe un evento con ese slug' }) };
      }
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó el insert', detail }) };
    }
    const rows = await r.json();
    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, evento: (Array.isArray(rows) ? rows[0] : rows) || {} }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error escribiendo a Supabase', detail: e.message }) };
  }
};
