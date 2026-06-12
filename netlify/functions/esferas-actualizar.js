// =============================================================================
// esferas-actualizar
//
// Edita una fila de esferas_eventos (Esferas del Dragón). La fila es la fuente
// de verdad del objeto EV; al re-publicar, el compilador (UPSERT) reemplaza el
// objeto en index.html con estos valores.
//
// Body JSON: { slug, ...campos }. El slug es la identidad (PK), NO se edita.
// Whitelist editable EXACTA: { nombre, fecha_inicio, ciudad, tipo, status }.
//
// Seguridad/molde calcado de esferas-crear:
//   - corsCheck + verifyAdminAuth(['maestro_roshi'])
//   - PATCH a esferas_eventos por slug con service_role (bypass RLS)
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

// Whitelist EDITABLE. slug AUSENTE a propósito (identidad / PK, no se edita).
const CAMPOS_EDITABLES = new Set(['nombre', 'titulo', 'fecha_inicio', 'ciudad', 'tipo', 'status', 'venue', 'music', 'fechas_extra']);

// fechas_extra: JSON array de fechas ADICIONALES 'YYYY-MM-DD' (multifecha-ficha).
// Acepta array o string JSON. Saneo: descarta no-fechas, dedupe, ordena. Si no
// queda nada útil → null (limpia/cae a fecha única). Devuelve string JSON o null.
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
function saneFechasExtra(v) {
  let arr = v;
  if (typeof v === 'string') { try { arr = JSON.parse(v); } catch { return null; } }
  if (!Array.isArray(arr)) return null;
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    if (typeof x !== 'string') continue;
    const s = x.slice(0, 10);
    if (!FECHA_RE.test(s)) continue;
    const mo = parseInt(s.slice(5, 7), 10);
    const d = parseInt(s.slice(8, 10), 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  if (!out.length) return null;
  out.sort();
  return JSON.stringify(out);
}
// Status de Esferas (simplificado): Disponible / Próximamente / Últimos / Agotado.
const STATUS_PERMITIDOS = new Set(['', 'proximamente', 'ultimos', 'agotado']);

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

  if (!SB_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const slug = (body && typeof body.slug === 'string') ? body.slug.trim().toLowerCase() : '';
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El slug es requerido' }) };

  // Solo columnas whitelisted. status vacío = '' (A la venta); el resto vacío = null.
  const sane = {};
  for (const [k, v] of Object.entries(body)) {
    if (!CAMPOS_EDITABLES.has(k)) continue;
    if (k === 'fechas_extra') { sane[k] = saneFechasExtra(v); continue; }
    if (v === null || v === '') sane[k] = (k === 'status') ? '' : null;
    else sane[k] = String(v);
  }

  // nombre, si viene, no puede quedar vacío.
  if ('nombre' in sane && !sane.nombre) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'El nombre no puede quedar vacío' }) };
  }
  // status, si viene, debe estar permitido.
  if ('status' in sane && !STATUS_PERMITIDOS.has(sane.status)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Status no permitido' }) };
  }
  if (Object.keys(sane).length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No hay campos editables en el body' }) };
  }

  sane.updated_at = new Date().toISOString();

  try {
    // SALVAGUARDA: el slug debe existir en esferas_eventos.
    const chkRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}&select=slug`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!chkRes.ok) {
      const detail = await chkRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la query', detail }) };
    }
    const existentes = await chkRes.json();
    if (!Array.isArray(existentes) || existentes.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: `No existe un evento con slug '${slug}'` }) };
    }

    // PATCH por slug. return=representation para devolver la fila actualizada.
    const patchRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(sane),
    });
    if (!patchRes.ok) {
      const detail = await patchRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó el update', detail }) };
    }
    const rows = await patchRes.json();
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, evento: (Array.isArray(rows) ? rows[0] : rows) || {} }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error escribiendo a Supabase', detail: e.message }) };
  }
};
