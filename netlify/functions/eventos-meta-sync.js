// =============================================================================
// eventos-meta-sync  (U1 — tabla espejo de eventos por SLUG)
//
// Llena/actualiza public.eventos_meta (KH) desde las filas que arma el CLIENTE
// leyendo el EV de index.html (el cliente ya lo parsea bien; la función NO
// parsea el EV). Después los crons consultan esta tabla server-side por slug.
//
// Body JSON: { eventos: [ { slug, nombre, fecha, fecha_fin, tipo, dias } ] }
//
// Seguridad:
//   - Authorization: Bearer <JWT> (verifyAdminAuth, roles maestro_roshi/bulma).
//   - corsCheck. UPSERT con service_role (la tabla tiene RLS sin policies anon).
//   - Solo upsert (merge-duplicates por slug); NO borra filas viejas.
//
// Env vars (reusa las existentes):
//   - SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE
//   - JWT_SECRET (lo lee verifyAdminAuthLive)
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const SLUG_RE = /^[A-Za-z0-9_.\-]+$/;
const TIPOS_VALIDOS = ['concierto', 'festival'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  if (!Array.isArray(body.eventos) || !body.eventos.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'eventos debe ser un array no vacío' }) };
  }

  // Saneo/validación: solo filas con slug válido (sin '#', regex, len<80).
  const limpiaFecha = (v) => (typeof v === 'string' && FECHA_RE.test(v)) ? v : null;
  const filas = [];
  const vistos = new Set();
  for (const e of body.eventos) {
    if (!e || typeof e !== 'object') continue;
    const slug = typeof e.slug === 'string' ? e.slug.trim() : '';
    if (!slug || slug.length >= 80 || slug.includes('#') || !SLUG_RE.test(slug)) continue;
    if (vistos.has(slug)) continue;
    vistos.add(slug);
    const tipo = TIPOS_VALIDOS.includes(e.tipo) ? e.tipo : 'concierto';
    let dias = parseInt(e.dias, 10);
    if (!Number.isFinite(dias) || dias < 1) dias = 1;
    filas.push({
      slug,
      nombre: typeof e.nombre === 'string' ? e.nombre.trim() : slug,
      fecha: limpiaFecha(e.fecha),
      fecha_fin: limpiaFecha(e.fecha_fin),
      tipo,
      dias,
      updated_at: new Date().toISOString(),
    });
  }

  if (!filas.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ningún evento con slug válido' }) };
  }

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };

  try {
    const r = await fetch(`${env.KH_SB_URL}/rest/v1/eventos_meta?on_conflict=slug`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify(filas),
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el upsert', detail }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, upserted: filas.length }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error sincronizando eventos_meta', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_SB_URL     = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
