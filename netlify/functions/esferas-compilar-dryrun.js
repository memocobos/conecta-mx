// =============================================================================
// esferas-compilar-dryrun
//
// Esferas del Dragón, Pieza 2a — el "compilador" en modo DRY-RUN.
//
// Lee esferas_eventos (KH legacy, service_role), baja index.html del repo por
// GitHub API (SOLO GET), y delega TODA la compilación/validación al módulo
// compartido _lib/esferas-compile.js (Pieza 2b). NO ESCRIBE NADA al repo (sin
// PUT). Riesgo cero: el index de producción no se toca.
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

  try {
    // 1. Leer TODAS las Esferas de KH legacy (service_role).
    const sbRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?select=*`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!sbRes.ok) {
      const detail = await sbRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Supabase rechazó la query', detail }) };
    }
    const esferas = await sbRes.json();

    // 2. GET index.html del repo por GitHub API y decodificar (patrón github-publish).
    const fileRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
    });
    const fileData = await fileRes.json();
    if (!fileRes.ok || !fileData.content) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'GitHub no devolvió el archivo', detail: fileData && fileData.message }) };
    }
    const content = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf8');

    // 3. Compilar + validar (lógica compartida; sin escribir nada).
    const { contenidoNuevo, aInsertar, yaEnEv, validacion } = compilarEV({ esferas, indexHtml: content });

    // 4. Preview: primeros ~600 chars del var EV=[ resultante.
    const idxEV = contenidoNuevo.indexOf('var EV=[');
    const preview = idxEV >= 0 ? contenidoNuevo.slice(idxEV, idxEV + 600) : '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        ya_en_ev: yaEnEv,
        a_insertar: aInsertar,
        validacion,
        preview,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
