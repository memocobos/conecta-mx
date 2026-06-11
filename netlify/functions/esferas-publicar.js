// =============================================================================
// esferas-publicar
//
// Esferas del Dragón, Pieza 2b — la ESCRITURA real al index.
//
// Reusa el compilador compartido (_lib/esferas-compile.js) y, SOLO si la
// validación de AMBOS parsers pasa, hace PUT del index.html al repo (patrón
// github-publish). Si la validación falla → 422 y NO escribe (candado duro).
//
// Body opcional: { branch?: string }  (default 'main'). Con un branch != 'main'
// se puede verificar sin tocar main (si la rama no existe, se crea desde main).
//
// Seguridad: corsCheck + verifyAdminAuth(['maestro_roshi']).
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, GITHUB_TOKEN, JWT_SECRET
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { compilarEV } = require('./_lib/esferas-compile');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'memocobos/conecta-mx';
const FILE = 'index.html';

const ghHeaders = () => ({ Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' });

// Asegura que una rama de prueba exista, creándola desde main si falta. NUNCA
// toca main. Devuelve {created:bool}.
async function ensureBranch(branch) {
  const ref = await fetch(`https://api.github.com/repos/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: ghHeaders() });
  if (ref.ok) return { created: false };
  if (ref.status !== 404) {
    const d = await ref.text();
    throw new Error('No se pudo verificar la rama ' + branch + ': ' + d);
  }
  // Crear refs/heads/<branch> apuntando al HEAD de main.
  const mainRef = await fetch(`https://api.github.com/repos/${REPO}/git/ref/heads/main`, { headers: ghHeaders() });
  const mainData = await mainRef.json();
  if (!mainRef.ok || !mainData.object || !mainData.object.sha) {
    throw new Error('No se pudo leer main para crear la rama de prueba');
  }
  const create = await fetch(`https://api.github.com/repos/${REPO}/git/refs`, {
    method: 'POST',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainData.object.sha }),
  });
  if (!create.ok) {
    const d = await create.text();
    throw new Error('No se pudo crear la rama de prueba ' + branch + ': ' + d);
  }
  return { created: true };
}

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

  const branch = (reqBody && typeof reqBody.branch === 'string' && reqBody.branch.trim())
    ? reqBody.branch.trim()
    : 'main';

  try {
    // 1. Leer TODAS las Esferas (service_role).
    const sbRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?select=*`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!sbRes.ok) {
      const detail = await sbRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Supabase rechazó la query', detail }) };
    }
    const esferas = await sbRes.json();

    // 2. Si es rama de prueba, asegurar que exista (sin tocar main).
    if (branch !== 'main') {
      await ensureBranch(branch);
    }

    // 3. GET index.html CON el sha (?ref=<branch> si no es main).
    const getUrl = `https://api.github.com/repos/${REPO}/contents/${FILE}` +
      (branch !== 'main' ? `?ref=${encodeURIComponent(branch)}` : '');
    const fileRes = await fetch(getUrl, { headers: ghHeaders() });
    const fileData = await fileRes.json();
    if (!fileRes.ok || !fileData.content) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'GitHub no devolvió el archivo', detail: fileData && fileData.message }) };
    }
    const sha = fileData.sha;
    const content = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf8');

    // 4. Compilar + validar (lógica compartida).
    const { contenidoNuevo, aInsertar, validacion } = compilarEV({ esferas, indexHtml: content });

    // 5. CANDADO DURO: sin validación perfecta de AMBOS parsers, NO se escribe.
    //    No se omite por ningún flag.
    if (validacion.kamehouse_ok !== true || validacion.portal_ok !== true || validacion.error) {
      return {
        statusCode: 422,
        headers,
        body: JSON.stringify({ ok: false, error: 'Validación falló — no se escribió nada', validacion }),
      };
    }

    // Nada nuevo que publicar: no hace PUT (evita commit vacío).
    if (aInsertar.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, branch, publicados: [], commit: null, validacion, nota: 'Sin eventos nuevos por publicar' }),
      };
    }

    // 6. PUT del contenido compilado.
    const slugs = aInsertar.map(x => x.slug);
    const encoded = Buffer.from(contenidoNuevo, 'utf8').toString('base64');
    const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
      method: 'PUT',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Esferas: publica ${slugs.length} evento(s): ${slugs.join(', ')}`,
        content: encoded,
        sha,
        branch,
      }),
    });
    const putData = await putRes.json();
    if (!putRes.ok || !putData.commit) {
      // sha desactualizado u otro error de GitHub → error claro, sin fingir éxito.
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ ok: false, error: (putData && putData.message) || 'PUT a GitHub falló', validacion }),
      };
    }
    const commit = putData.commit.sha.slice(0, 7);

    // 7. PATCH best-effort publicado=true SOLO en main. Si falla, NO error: el
    //    commit ya quedó. En ramas de prueba NO se marca publicado.
    if (branch === 'main') {
      try {
        const inVal = '(' + slugs.map(s => `"${s}"`).join(',') + ')';
        await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=in.${encodeURIComponent(inVal)}`, {
          method: 'PATCH',
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ publicado: true }),
        });
      } catch (_) { /* el commit ya quedó; el marcado es secundario */ }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, branch, publicados: slugs, commit, validacion }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
