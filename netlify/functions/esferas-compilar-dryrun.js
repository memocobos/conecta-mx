// =============================================================================
// esferas-compilar-dryrun
//
// Esferas del Dragón, Pieza 2a — el "compilador" en modo DRY-RUN.
//
// Lee esferas_eventos (KH legacy, service_role), baja index.html del repo por
// GitHub API (SOLO GET), construye un objeto-evento por cada Esfera cuyo slug
// NO exista en el array EV actual, los inserta EN MEMORIA, y valida que el
// resultado parsea igual que lo hacen el portal y kamehouse.
//
// NO ESCRIBE NADA al repo (sin PUT). Riesgo cero: el index de producción no se
// toca en esta pieza.
//
// Seguridad: corsCheck + verifyAdminAuth(['maestro_roshi']).
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, GITHUB_TOKEN, JWT_SECRET
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'memocobos/conecta-mx';
const FILE = 'index.html';

// Meses abreviados español para fDisplay. (Local al generador — independiente
// del MESES de index.html, que es un objeto por número de mes.)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ── Generador del objeto-evento ───────────────────────────────────────────────

// ESCAPE OBLIGATORIO: '\' → '\\' y "'" → "\'" antes de interpolar en comillas
// simples. Un nombre tipo "Guns N' Roses" NO debe romper el array.
function escStr(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// 'YYYY-MM-DD' → 'D mes YYYY' (día sin cero a la izquierda). null → 'Por confirmar'.
function fDisplay(fecha_inicio) {
  if (!fecha_inicio) return 'Por confirmar';
  const m = String(fecha_inicio).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 'Por confirmar';
  const mes = MESES[parseInt(m[2], 10) - 1];
  if (!mes) return 'Por confirmar';
  return parseInt(m[3], 10) + ' ' + mes + ' ' + m[1];
}

// Byte-exacto: comillas simples, sin espacios extra. banco:BANCO_DEFAULT SIN
// comillas (referencia a variable). cdmx:true, SOLO si ciudad==='CDMX'.
function generarObj(esfera, hoy) {
  const nombre = esfera.nombre || '';
  const status = esfera.status || '';
  const ciudad = esfera.ciudad || '';
  const fi = esfera.fecha_inicio || null;
  const ds = fi ? String(fi).slice(0, 10) : '';
  const cdmx = (ciudad === 'CDMX') ? 'cdmx:true,' : '';
  return "{id:'" + escStr(esfera.slug) +
    "',added:'" + hoy +
    "',c:'azul',img:'" + escStr(nombre) +
    "',a:'" + escStr(nombre) +
    "',f:'" + escStr(fDisplay(fi)) +
    "',ds:'" + escStr(ds) +
    "',v:'',st:'" + escStr(status) +
    "'," + cdmx +
    "inc:[],banco:BANCO_DEFAULT,zonas:[],hotel:[],pagos:[]}";
}

// ── Parsers de validación (idénticos a los consumidores) ──────────────────────

// estilo-kamehouse: regex + balanceo de corchetes ignorando strings + new Function.
function extraerEVKamehouse(content) {
  const m = content.match(/var\s+EV\s*=\s*\[/);
  if (!m) throw new Error('var EV no encontrado');
  const start = m.index + m[0].length - 1;
  let depth = 0, inStr = false, sc = '', esc = false, end = -1;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (ch === '\\') { esc = true; continue; } if (ch === sc) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; sc = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (!depth) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('Array EV sin cerrar');
  const arrText = content.slice(start, end);
  const stubs = 'var BANCO_DEFAULT={},BANCO_HEY={},HOTEL_CDM=[],HOTEL_STD=[];';
  const ev = new Function(stubs + 'return ' + arrText + ';')();
  if (!Array.isArray(ev)) throw new Error('EV no es array');
  return ev;
}

// estilo-portal: bloque WA…_promoActivo ejecutado con un winStub.
function extraerEVPortal(content) {
  const startIdx = content.indexOf("var WA='");
  let endIdx = content.indexOf('var _promoActivo');
  if (endIdx < 0) endIdx = content.indexOf('function $$(');
  if (startIdx < 0 || endIdx < 0) throw new Error('Bloque EV no localizado');
  const block = content.slice(startIdx, endIdx);
  const fn = new Function('window',
    block +
    '\nreturn {EV:EV,HOTEL_STD:HOTEL_STD,HOTEL_CDM:(typeof HOTEL_CDM!=="undefined"?HOTEL_CDM:[]),HOTEL_MTY:(typeof HOTEL_MTY!=="undefined"?HOTEL_MTY:[]),MESES:MESES};'
  );
  const noop = () => {};
  const winStub = {
    STATIC_IMGS: {}, MAPAS: {}, LINEUPS: {},
    addEventListener: noop, removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    location: { pathname: '/', search: '', hash: '' },
    history: { state: null, pushState: noop, replaceState: noop },
  };
  const out = fn(winStub);
  const ev = out.EV || [];
  if (!Array.isArray(ev)) throw new Error('EV no es array');
  return ev;
}

// ── Handler ───────────────────────────────────────────────────────────────────

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
    const cleanContent = fileData.content.replace(/\n/g, '');
    const content = Buffer.from(cleanContent, 'base64').toString('utf8');

    // 3. Ids ya presentes en el EV actual (parser de balanceo de kamehouse).
    const evAntes = extraerEVKamehouse(content);
    const idsAntes = new Set(evAntes.map(e => e && e.id).filter(Boolean));

    // 4. Construir objeto por cada Esfera cuyo slug NO esté en el EV.
    const hoy = new Date().toISOString().slice(0, 10);
    const ya_en_ev = [];
    const a_insertar = [];
    const nuevosSlugs = [];
    for (const esf of (Array.isArray(esferas) ? esferas : [])) {
      if (!esf || !esf.slug) continue;
      if (idsAntes.has(esf.slug)) { ya_en_ev.push(esf.slug); continue; }
      a_insertar.push({ slug: esf.slug, obj: generarObj(esf, hoy) });
      nuevosSlugs.push(esf.slug);
    }

    // 5. Insertar en memoria, una sola vez, justo después del marcador.
    //    Deja intacto `var EV=[` para no romper al Radar.
    let modified = content;
    if (a_insertar.length > 0) {
      const bloque = a_insertar.map(x => x.obj).join(',\n  ');
      modified = content.replace('var EV=[', 'var EV=[\n  ' + bloque + ',');
    }

    // 6. VALIDACIÓN: correr AMBOS parsers sobre el content modificado.
    const validacion = {
      kamehouse_ok: false,
      portal_ok: false,
      ev_antes: evAntes.length,
      ev_despues: null,
      nuevos_encontrados: [],
      error: null,
    };

    let evKame = null;
    try {
      evKame = extraerEVKamehouse(modified);
      const ids = new Set(evKame.map(e => e && e.id).filter(Boolean));
      const faltan = nuevosSlugs.filter(s => !ids.has(s));
      validacion.kamehouse_ok = (faltan.length === 0);
      validacion.ev_despues = evKame.length;
      validacion.nuevos_encontrados = nuevosSlugs.filter(s => ids.has(s));
      if (faltan.length) validacion.error = 'kamehouse: faltan ids ' + faltan.join(', ');
    } catch (e) {
      validacion.kamehouse_ok = false;
      validacion.error = 'kamehouse parser: ' + e.message;
    }

    try {
      const evPortal = extraerEVPortal(modified);
      const idsP = new Set(evPortal.map(e => e && e.id).filter(Boolean));
      const faltanP = nuevosSlugs.filter(s => !idsP.has(s));
      validacion.portal_ok = (faltanP.length === 0);
      if (validacion.ev_despues == null) validacion.ev_despues = evPortal.length;
      if (faltanP.length && !validacion.error) validacion.error = 'portal: faltan ids ' + faltanP.join(', ');
    } catch (e) {
      validacion.portal_ok = false;
      if (!validacion.error) validacion.error = 'portal parser: ' + e.message;
    }

    // 7. Preview: primeros ~600 chars del var EV=[ resultante.
    const idxEV = modified.indexOf('var EV=[');
    const preview = idxEV >= 0 ? modified.slice(idxEV, idxEV + 600) : '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        ya_en_ev,
        a_insertar,
        validacion,
        preview,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
