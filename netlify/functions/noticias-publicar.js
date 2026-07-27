// =============================================================================
// noticias-publicar
//
// TUERCA N1 — el banner azul del index es de Memo.
//
// Reescribe SOLO el arreglo NOTICIAS del bloque de la marquesina en index.html
// y hace PUT al repo; Netlify deploya solo. Gemelo de esferas-publicar: mismo
// candado (corsCheck + verifyAdminAuthLive(['maestro_roshi'])), mismo patrón de
// GitHub API, misma disciplina de no fingir éxito.
//
// La diferencia con esferas-publicar es el CANDADO DE CIRUGÍA: aquí no hay un
// compilador que valide el resultado, así que después de sustituir se comprueba
// que el archivo nuevo sea byte-idéntico al viejo salvo ese bloque. Si cambió
// una coma en cualquier otro lado, 500 y no se escribe.
//
// Body: { noticias: string[], branch?: string }
// Env: GITHUB_TOKEN, JWT_SECRET, SUPABASE_SERVICE_KEY_KAMEHOUSE (vía verify-admin)
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'memocobos/conecta-mx';
const FILE = 'index.html';
const ghHeaders = () => ({ Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' });

// Los topes del brief. Se validan aquí, en el servidor: la UI también avisa,
// pero la UI no es una defensa.
const MAX_NOTICIAS = 10;
const MAX_LARGO = 120;

// El bloque exacto que se reescribe. Ancla en la declaración y en el cierre de
// la misma línea de apertura: si alguien reordena el archivo, no hace match y
// se responde 500 en vez de escribir en el lugar equivocado.
const RE_BLOQUE = /( {2}var NOTICIAS = \[)[\s\S]*?(\n {2}\];)/;

/**
 * Valida la lista y devuelve {ok, error, limpias}.
 * Rechaza markup en vez de escaparlo: la marquesina pinta con textContent, así
 * que un "<b>" no sería peligroso — se vería literal, que es peor para Memo.
 * Mejor decírselo de frente que publicarle basura.
 */
function validar(noticias) {
  if (!Array.isArray(noticias)) return { ok: false, error: 'noticias debe ser un arreglo' };
  if (noticias.length > MAX_NOTICIAS) return { ok: false, error: `Máximo ${MAX_NOTICIAS} noticias (mandaste ${noticias.length})` };
  const limpias = [];
  for (let i = 0; i < noticias.length; i++) {
    const cruda = noticias[i];
    if (typeof cruda !== 'string') return { ok: false, error: `La noticia ${i + 1} no es texto` };
    const t = cruda.trim();
    if (!t) continue;                                   // vacías: se ignoran, no son error
    if (t.length > MAX_LARGO) return { ok: false, error: `La noticia ${i + 1} pasa de ${MAX_LARGO} caracteres (${t.length})` };
    if (/[<>]/.test(t)) return { ok: false, error: `La noticia ${i + 1} trae < o > — el banner es texto plano` };
    if (/&#|&[a-z]+;/i.test(t)) return { ok: false, error: `La noticia ${i + 1} trae entidades HTML — escríbela como texto normal` };
    // Estos tres romperían el arreglo generado, que usa comillas simples.
    if (t.includes('\\')) return { ok: false, error: `La noticia ${i + 1} trae una diagonal invertida` };
    if (/[\r\n\u2028\u2029]/.test(t)) return { ok: false, error: `La noticia ${i + 1} trae un salto de línea` };
    limpias.push(t);
  }
  return { ok: true, limpias };
}

/** Serializa al formato EXACTO que el bloque espera: una por renglón, comillas simples. */
function serializar(limpias) {
  if (!limpias.length) return '';
  return '\n' + limpias.map(t => `    '${t.replace(/'/g, "\\'")}',`).join('\n');
}

exports.handler = async (event) => {
  const origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  if (!origin) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ ok: false, error: auth.error }) };

  if (!GITHUB_TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Falta GITHUB_TOKEN' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Body inválido' }) }; }

  const v = validar(body.noticias);
  if (!v.ok) return { statusCode: 422, headers, body: JSON.stringify({ ok: false, error: v.error }) };

  const branch = typeof body.branch === 'string' && body.branch.trim() ? body.branch.trim() : 'main';

  try {
    // 1 · traer index.html
    const getUrl = `https://api.github.com/repos/${REPO}/contents/${FILE}` + (branch !== 'main' ? `?ref=${encodeURIComponent(branch)}` : '');
    const fileRes = await fetch(getUrl, { headers: ghHeaders() });
    if (!fileRes.ok) return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: `GitHub GET ${fileRes.status}` }) };
    const fileData = await fileRes.json();
    const sha = fileData.sha;
    const viejo = Buffer.from(String(fileData.content).replace(/\n/g, ''), 'base64').toString('utf8');

    // 2 · el bloque tiene que existir, exactamente uno
    const matches = viejo.match(new RegExp(RE_BLOQUE.source, 'g'));
    if (!matches || matches.length !== 1) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: `No encontré el bloque NOTICIAS (${matches ? matches.length : 0} coincidencias) — no escribí nada` }) };
    }

    // 3 · sustituir SOLO ese bloque
    const nuevo = viejo.replace(RE_BLOQUE, (_m, abre, cierra) => abre + serializar(v.limpias) + cierra);

    // 4 · CANDADO DE CIRUGÍA: fuera del bloque, byte por byte igual.
    //     Sin un compilador que valide el resultado, ésta es la red: se le quita
    //     el bloque a los dos y lo demás tiene que ser idéntico.
    const sinBloque = (t) => t.replace(RE_BLOQUE, '$1BLOQUE$2');
    if (sinBloque(viejo) !== sinBloque(nuevo)) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'La sustitución tocó algo fuera del bloque — no escribí nada' }) };
    }
    if (nuevo === viejo) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sin_cambios: true, commit: null, noticias: v.limpias }) };
    }

    // 5 · PUT
    const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
      method: 'PUT',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Noticias del banner: ${v.limpias.length} noticia(s)`,
        content: Buffer.from(nuevo, 'utf8').toString('base64'),
        sha,
        ...(branch !== 'main' ? { branch } : {}),
      }),
    });
    const putData = await putRes.json();
    if (!putRes.ok || !putData.commit) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: putData.message || `GitHub PUT ${putRes.status}` }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, commit: putData.commit.sha.slice(0, 7), noticias: v.limpias, branch }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) };
  }
};

// Para el arnés: se prueban las piezas puras sin levantar el handler.
module.exports._test = { validar, serializar, RE_BLOQUE, MAX_NOTICIAS, MAX_LARGO };
