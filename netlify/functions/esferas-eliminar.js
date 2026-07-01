// =============================================================================
// esferas-eliminar
//
// Esferas del Dragón — borra DEFINITIVAMENTE un registro de esferas_eventos
// (el borrador del evento). NO toca index.html ni las ventas del Portal.
//
// SALVAGUARDA 1: el slug debe EXISTIR en esferas_eventos → si no, 404.
// SALVAGUARDA 2 (clave): solo se puede eliminar un evento DESPUBLICADO. Si
//   publicado=true → 409 (sigue vivo en el sitio; hay que despublicar primero).
//
// Seguridad: corsCheck + verifyAdminAuth(['maestro_roshi']).
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

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
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Origen no permitido' }) };

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ ok: false, error: auth.error }) };

  if (!SB_KEY) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };

  let reqBody;
  try { reqBody = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON inválido' }) }; }

  const slug = (reqBody && typeof reqBody.slug === 'string') ? reqBody.slug.trim().toLowerCase() : '';
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'El slug es requerido' }) };

  try {
    // SALVAGUARDA 1: el slug debe existir en esferas_eventos.
    const chkRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}&select=slug,publicado`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!chkRes.ok) {
      const detail = await chkRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Supabase rechazó la query', detail }) };
    }
    const rows = await chkRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: `'${slug}' no existe en la lista de Esferas` }) };
    }

    // SALVAGUARDA 2 (clave): no borrar eventos publicados (siguen vivos en el sitio).
    if (rows[0].publicado === true) {
      return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Está publicado; despublícalo primero (sigue en el sitio)' }) };
    }

    // DELETE del registro (service_role). Solo esferas_eventos — nada del index ni del Portal.
    const delRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'return=minimal' },
    });
    if (!delRes.ok) {
      const detail = await delRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'El DELETE falló', detail }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, slug }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
