// =============================================================================
// esferas-despublicar
//
// Esferas del Dragón — el inverso de esferas-publicar. Quita un evento del array
// EV en index.html (PUT a main) y marca publicado=false en esferas_eventos.
//
// SALVAGUARDA: solo despublica slugs que EXISTEN en esferas_eventos (no permite
// tocar eventos legacy ajenos a Esferas → 403).
// CANDADO DURO: solo hace PUT si la validación de AMBOS parsers pasa; si no, 422.
//
// Seguridad: corsCheck + verifyAdminAuth(['maestro_roshi']).
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, GITHUB_TOKEN, JWT_SECRET
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { quitarDelEV } = require('./_lib/esferas-compile');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'memocobos/conecta-mx';
const FILE = 'index.html';

const ghHeaders = () => ({ Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' });

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
  if (!GITHUB_TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'GITHUB_TOKEN no configurado' }) };

  let reqBody;
  try { reqBody = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON inválido' }) }; }

  const slug = (reqBody && typeof reqBody.slug === 'string') ? reqBody.slug.trim().toLowerCase() : '';
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'El slug es requerido' }) };

  try {
    // 1. SALVAGUARDA: el slug debe existir en esferas_eventos.
    const chkRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}&select=slug`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!chkRes.ok) {
      const detail = await chkRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Supabase rechazó la query', detail }) };
    }
    const rows = await chkRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: `'${slug}' no gestionado por Esferas` }) };
    }

    // 2. GET index.html de main CON el sha.
    const fileRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, { headers: ghHeaders() });
    const fileData = await fileRes.json();
    if (!fileRes.ok || !fileData.content) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'GitHub no devolvió el archivo', detail: fileData && fileData.message }) };
    }
    const sha = fileData.sha;
    const content = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf8');

    // 3. Quitar el objeto del EV (balanceo de llaves) + validar con ambos parsers.
    const { contenidoNuevo, encontrado, validacion } = quitarDelEV({ indexHtml: content, slug });

    // 4. No estaba en el index: idempotente, sin PUT. Igual marca publicado=false.
    if (!encontrado) {
      try {
        await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}`, {
          method: 'PATCH',
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ publicado: false }),
        });
      } catch (_) { /* secundario */ }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, slug, encontrado: false, commit: null, validacion }) };
    }

    // 5. CANDADO DURO: sin validación perfecta de AMBOS parsers, NO se escribe.
    if (validacion.kamehouse_ok !== true || validacion.portal_ok !== true || validacion.error) {
      return { statusCode: 422, headers, body: JSON.stringify({ ok: false, slug, encontrado: true, error: 'Validación falló — no se escribió nada', validacion }) };
    }

    // 6. PUT a main.
    const encoded = Buffer.from(contenidoNuevo, 'utf8').toString('base64');
    const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
      method: 'PUT',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Esferas: despublica ${slug}`, content: encoded, sha }),
    });
    const putData = await putRes.json();
    if (!putRes.ok || !putData.commit) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: (putData && putData.message) || 'PUT a GitHub falló', validacion }) };
    }
    const commit = putData.commit.sha.slice(0, 7);

    // 7. PATCH best-effort: publicado=false. Si falla, NO error (el commit ya quedó).
    try {
      await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ publicado: false }),
      });
    } catch (_) { /* secundario */ }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, slug, encontrado: true, commit, validacion }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
