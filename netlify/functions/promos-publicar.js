// =============================================================================
// promos-publicar — [UB-2] Publica `promos_codigos` al `var PROMOS` del
// index.html. Hermano de `esferas-publicar`: mismo flujo, mismo candado duro.
//
// Body: { branch? }  (default 'main'; una rama de prueba se crea sola)
// → { ok, branch, publicados:[...], sin_cambios, commit, validacion }
//
// 🔒 CANDADO DURO: si la validación no sale perfecta, NO SE ESCRIBE. Y aquí la
// validación incluye una comprobación que Esferas no necesita: que PROMOS quede
// DENTRO del rango que `rol.html` recorta (`var WA='` → `var _promoActivo`) y
// que ese rango siga EVALUANDO. Si se rompiera, el rol se quedaría con un
// objeto vacío y contestaría «Código no válido» a todos los códigos sin un solo
// error — es el hoyo que UB-0 midió y ROL-FALLBACK-1 hizo ruidoso.
//
// Un código ARCHIVADO no se publica y TAMPOCO se borra del index: el compilador
// es un UPSERT que nunca borra, así que archivar en la tabla no despublica.
// Quitar un código del sitio es otra tuerca, y tiene que serlo — despublicar un
// código vivo es dinero prometido que deja de valer.
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, GITHUB_TOKEN, JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { compilarPROMOS } = require('./_lib/promos-compile');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'memocobos/conecta-mx';
const FILE = 'index.html';

const ghHeaders = () => ({ Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' });

async function ensureBranch(branch) {
  const ref = await fetch(`https://api.github.com/repos/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: ghHeaders() });
  if (ref.ok) return;
  const mainRef = await fetch(`https://api.github.com/repos/${REPO}/git/ref/heads/main`, { headers: ghHeaders() });
  const main = await mainRef.json();
  if (!mainRef.ok || !main.object) throw new Error('no pude leer main para crear la rama');
  const cr = await fetch(`https://api.github.com/repos/${REPO}/git/refs`, {
    method: 'POST', headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: main.object.sha }),
  });
  if (!cr.ok) throw new Error('no pude crear la rama: ' + (await cr.text()).slice(0, 140));
}

exports.handler = async (event) => {
  const origen = corsCheck(event);
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origen === '' ? '*' : (origen || ''),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (origen === null) return r(403, headers, { ok: false, error: 'Origen no permitido' });
  if (event.httpMethod !== 'POST') return r(405, headers, { ok: false, error: 'Método no permitido' });

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return r(auth.status || 401, headers, { ok: false, error: auth.error });
  if (!SB_KEY) return r(500, headers, { ok: false, error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurada' });
  if (!GITHUB_TOKEN) return r(500, headers, { ok: false, error: 'GITHUB_TOKEN no configurado' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return r(400, headers, { ok: false, error: 'JSON inválido' }); }
  const branch = (typeof body.branch === 'string' && body.branch.trim()) ? body.branch.trim() : 'main';

  try {
    // 1. Todos los códigos.
    const sbRes = await fetch(`${SB_URL}/rest/v1/promos_codigos?select=*`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!sbRes.ok) return r(502, headers, { ok: false, error: 'Supabase rechazó la consulta', detail: (await sbRes.text()).slice(0, 200) });
    const todos = await sbRes.json();
    const archivados = todos.filter(c => c && c.archivado === true).map(c => c.codigo);
    const codigos = todos.filter(c => !(c && c.archivado === true));
    if (!codigos.length) return r(422, headers, { ok: false, error: 'No hay códigos vivos que publicar' });

    if (branch !== 'main') await ensureBranch(branch);

    // 2. El index de esa rama, con su sha.
    const getUrl = `https://api.github.com/repos/${REPO}/contents/${FILE}` + (branch !== 'main' ? `?ref=${encodeURIComponent(branch)}` : '');
    const fileRes = await fetch(getUrl, { headers: ghHeaders() });
    const fileData = await fileRes.json();
    if (!fileRes.ok || !fileData.content) return r(502, headers, { ok: false, error: 'GitHub no devolvió el archivo' });
    const sha = fileData.sha;
    const content = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf8');

    // 3. Compilar.
    let out;
    try { out = compilarPROMOS({ codigos, indexHtml: content }); }
    catch (e) { return r(422, headers, { ok: false, error: 'El compilador se negó: ' + e.message }); }

    // 4. 🔒 CANDADO DURO. Sin validación perfecta no se escribe, y no hay flag
    //    que lo salte.
    if (!out.validacion.ok) {
      return r(422, headers, { ok: false, error: 'Validación falló — no se escribió nada', validacion: out.validacion });
    }
    if (out.sin_cambios) {
      return r(200, headers, { ok: true, branch, sin_cambios: true, publicados: [], archivados, commit: null, validacion: out.validacion });
    }

    // 5. PUT.
    const cods = out.aInsertar.map(x => x.codigo).concat(out.aActualizar.map(x => x.codigo));
    const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
      method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Baba: publica ${cods.length} código(s): ${cods.join(', ')}`,
        content: Buffer.from(out.contenidoNuevo, 'utf8').toString('base64'), sha, branch,
      }),
    });
    const putData = await putRes.json();
    if (!putRes.ok) return r(502, headers, { ok: false, error: 'GitHub rechazó el commit', detail: JSON.stringify(putData).slice(0, 200) });

    return r(200, headers, {
      ok: true, branch, publicados: cods, archivados, sin_cambios: false,
      commit: putData.commit && putData.commit.sha, validacion: out.validacion,
    });
  } catch (e) {
    return r(500, headers, { ok: false, error: e.message });
  }
};

function r(statusCode, headers, obj) { return { statusCode, headers, body: JSON.stringify(obj) }; }
