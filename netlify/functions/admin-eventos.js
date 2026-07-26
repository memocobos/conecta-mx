// =============================================================================
// admin-eventos.js — Acceso server-side a `eventos` y `eventos_meta` (KH)
//
// Cierra la exposición a anon: kamehouse.html ya NO lee/escribe estas 2 tablas
// directo con la anon key. Todo pasa por aquí con service_role + verifyAdminAuth.
// Mismo patrón que admin-tours.js / admin-kits.js / admin-rooming.js.
//
//  - `eventos`      = tabla UUID legacy del COTIZADOR/capsule (NO es el catálogo
//                     público; ese es el array EV hardcodeado en index.html).
//  - `eventos_meta` = proyección por slug (identidad del evento: nombre/fechas).
//                     El front SOLO la lee; la escritura es vía eventos-meta-sync.js.
//
// Body JSON: { accion, ... }
//   eventos:
//     - 'listar'     { limit? }        → { ok, eventos:[...] }   · cualquier logueado
//     - 'obtener'    { id }            → { ok, evento }          · cualquier logueado
//     - 'crear'      { datos }         → { ok, evento }          · admin (maestro_roshi/bulma)
//     - 'actualizar' { id, datos }     → { ok }                  · admin
//     - 'eliminar'   { id }            → { ok }                  · admin
//   eventos_meta (lookup por slug, lectura para cualquier logueado):
//     - 'meta_por_slug'  { slug }      → { ok, meta:{nombre}|null }
//     - 'meta_por_slugs' { slugs:[] }  → { ok, metas:[{slug,nombre,fecha,fecha_fin}] }
//
// Seguridad:
//   - Authorization: Bearer <JWT> (verifyAdminAuth) + corsCheck.
//   - Whitelist explícita de columnas (lectura y escritura).
//   - id valida UUID; slug valida charset seguro; lista de slugs acotada.
//   - service_role NUNCA se expone al navegador.
//
// Env vars (reusa KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE,
//   JWT_SECRET (lo lee verifyAdminAuthLive).
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
// Slugs del EV (evento_id), p.ej. 'karolg#2', 'emblema-2026'. Charset acotado.
const SLUG_RE = /^[a-zA-Z0-9_#.-]+$/;
const ROLES_ADMIN = ['maestro_roshi', 'bulma'];
// Milk (auxiliar): crea/edita eventos como Bulma, pero NO los ELIMINA (destructivo).
const ROLES_ADMIN_MILK = ['maestro_roshi', 'bulma', 'milk'];

// Acciones válidas → roles permitidos (null = cualquier rol logueado).
const ACCIONES = {
  listar: null,
  obtener: null,
  crear: ROLES_ADMIN_MILK,
  actualizar: ROLES_ADMIN_MILK,
  eliminar: ROLES_ADMIN,          // eliminar evento = destructivo → milk NO
  meta_por_slug: null,
  meta_por_slugs: null,
};

// Columnas que el cliente puede SETEAR (unión de las dos formas que escribe el
// front: capsule/cotizador clásico + editor CC). Cualquier otra clave se ignora.
const WRITE_COLS = [
  'artista', 'nombre', 'tour', 'fecha', 'fecha_fin', 'ciudad', 'venue', 'tipo',
  'color', 'promotor', 'nota_cliente', 'status', 'banco', 'cdmx',
  'tiene_traslados_internos', 'tiene_transporte_largo', 'promo',
  'ride_only', 'cheap_only', 'list_only', 'separo', 'ride_precio', 'imagen_url',
  'notas', 'incluye', 'zonas_plus', 'zonas_cheap', 'hotel_opciones',
  'pagos_calendario', 'flash_promo',
  // editor CC (botones comentados; se mantienen por si se reactiva)
  'tipo_evento', 'notas_internas', 'zonas_boleto',
];

// Columnas que SÍ viajan al navegador al leer `eventos` (whitelist).
const READ_COLS = ['id', 'created_at'].concat(WRITE_COLS).join(',');

// Proyección de `eventos_meta` por acción (replica EXACTO el select de hoy).
const META_COLS_SINGLE = 'nombre';               // db.get(...&select=nombre)
const META_COLS_LIST = 'slug,nombre,fecha,fecha_fin';

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

  const auth = await verifyAdminAuthLive(event, ACCIONES[accion] || undefined);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const baseEventos = `${env.KH_SB_URL}/rest/v1/eventos`;
  const baseMeta = `${env.KH_SB_URL}/rest/v1/eventos_meta`;

  try {
    // ── eventos: listar ──────────────────────────────────────────────────
    if (accion === 'listar') {
      let limit = parseInt(body.limit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) limit = 200;
      const sp = new URLSearchParams();
      sp.set('select', READ_COLS);
      sp.set('order', 'fecha.desc');
      sp.set('limit', String(limit));
      const r = await fetch(`${baseEventos}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const eventos = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, eventos }) };
    }

    // ── eventos: obtener-por-id ──────────────────────────────────────────
    if (accion === 'obtener') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const sp = new URLSearchParams();
      sp.set('select', READ_COLS);
      sp.set('id', `eq.${id}`);
      sp.set('limit', '1');
      const r = await fetch(`${baseEventos}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, evento: rows[0] || null }) };
    }

    // ── eventos: crear ───────────────────────────────────────────────────
    if (accion === 'crear') {
      const fila = pickCols(body.datos);
      if (!Object.keys(fila).length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'datos vacíos' }) };
      }
      const r = await fetch(baseEventos, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'insert');
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, evento: rows[0] || null }) };
    }

    // ── eventos: actualizar ──────────────────────────────────────────────
    if (accion === 'actualizar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const fila = pickCols(body.datos);
      if (!Object.keys(fila).length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'datos vacíos' }) };
      }
      const r = await fetch(`${baseEventos}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'update');
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── eventos: eliminar ────────────────────────────────────────────────
    if (accion === 'eliminar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const r = await fetch(`${baseEventos}?id=eq.${id}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) return upstream(headers, await r.text(), 'delete');
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── eventos_meta: por slug único ─────────────────────────────────────
    if (accion === 'meta_por_slug') {
      const slug = String(body.slug || '').trim();
      if (!slug || !SLUG_RE.test(slug) || slug.length > 120) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'slug inválido' }) };
      }
      const sp = new URLSearchParams();
      sp.set('select', META_COLS_SINGLE);
      sp.set('slug', `eq.${slug}`);
      sp.set('limit', '1');
      const r = await fetch(`${baseMeta}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, meta: rows[0] || null }) };
    }

    // ── eventos_meta: por lista de slugs ─────────────────────────────────
    if (accion === 'meta_por_slugs') {
      const slugs = Array.isArray(body.slugs) ? body.slugs : [];
      const limpios = [];
      for (const s of slugs) {
        const v = String(s || '').trim();
        if (!v) continue;
        if (!SLUG_RE.test(v) || v.length > 120) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: `slug inválido: ${v}` }) };
        }
        limpios.push(v);
      }
      if (!limpios.length) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, metas: [] }) };
      }
      if (limpios.length > 500) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'demasiados slugs' }) };
      }
      const sp = new URLSearchParams();
      sp.set('select', META_COLS_LIST);
      sp.set('slug', `in.(${limpios.join(',')})`);
      const r = await fetch(`${baseMeta}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const metas = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, metas }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-eventos', detail: e.message }) };
  }
};

// ----- helpers -----

// Solo deja pasar columnas whitelisteadas; ignora cualquier clave extra.
function pickCols(datos) {
  const out = {};
  if (!datos || typeof datos !== 'object') return out;
  for (const k of WRITE_COLS) {
    if (Object.prototype.hasOwnProperty.call(datos, k)) out[k] = datos[k];
  }
  return out;
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
