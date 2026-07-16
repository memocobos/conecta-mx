// =============================================================================
// _lib/catalogo-index  —  Lectura server-side del catálogo (array EV de index.html)
//
// El catálogo público NO vive en la base: es el array `var EV` de index.html. Una
// function que necesite saber la forma de un evento (fechas, multifecha) tiene que
// leer el index desplegado y parsearlo. Eso ya lo hace `eventos-meta-sync-cron`;
// aquí se REUSA el mismo approach (fetch + balanceo de corchetes + new Function con
// stubs auto-resueltos) exponiéndolo como lib para el resto de functions.
// (El cron NO se toca: sigue con su copia.)
//
//   fetchCatalogo() → { [slug]: { ds, multifecha: [{ idx, lbl, ds, noches }] } }
//                     o null si el fetch/parseo falla (BEST-EFFORT).
//
// Solo se exponen esos campos: quien consuma esto necesita la forma temporal del
// evento, no precios ni zonas.
//
// Cache en memoria del módulo (se comparte mientras la lambda siga tibia). El
// catálogo cambia con cada deploy del index, así que un TTL corto basta.
//
// Env vars: URL / DEPLOY_PRIME_URL (Netlify las setea; fallback a producción).
// =============================================================================

const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://conectareynosa.mx';
const TTL_MS = 10 * 60 * 1000; // 10 min

// Cache a nivel de módulo. `catalogo: null` con ts fresco NO se cachea: un fallo
// no debe condenar a la lambda a 10 min de degradación.
let _cache = { ts: 0, catalogo: null };

// Best-effort: NUNCA lanza. Si no se puede leer el catálogo devuelve null y el
// caller degrada (en transporte: el evento se trata como simple, sin días).
async function fetchCatalogo() {
  if (_cache.catalogo && (Date.now() - _cache.ts) < TTL_MS) return _cache.catalogo;
  try {
    const ev = await fetchEV();
    const catalogo = {};
    for (const e of (ev || [])) {
      if (!e || !e.id || typeof e.id !== 'string') continue;
      catalogo[e.id] = {
        ds: e.ds || null,
        multifecha: Array.isArray(e.multifecha) && e.multifecha.length
          ? e.multifecha.map((m, i) => ({
              idx: i,                                   // el índice ES la posición (slug#idx)
              lbl: (m && m.lbl) ? String(m.lbl) : null,
              ds: (m && m.ds) ? String(m.ds) : null,
              noches: (m && Number.isFinite(Number(m.noches))) ? Number(m.noches) : null,
            }))
          : null,
      };
    }
    _cache = { ts: Date.now(), catalogo };
    return catalogo;
  } catch (e) {
    return null;
  }
}

// ----- copiado de eventos-meta-sync-cron (mismo approach, sin tocar el cron) -----

async function fetchEV() {
  const url = `${SITE_URL.replace(/\/$/, '')}/index.html`;
  const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' al leer ' + url);
  return parseEV(await r.text());
}

// Extrae el literal `var EV = [ ... ]` por balanceo de corchetes (ignorando
// strings) y lo materializa con new Function. Los globals que el array referencia
// (BANCO_*, HOTEL_*, etc.) se stubbean a `undefined` automáticamente: solo se usan
// como VALORES dentro del literal, nunca para derivar la forma del evento.
function parseEV(html) {
  const m = html.match(/var\s+EV\s*=\s*\[/);
  if (!m) throw new Error('var EV no encontrado en index.html');
  const start = m.index + m[0].length - 1;
  let depth = 0, inStr = false, sc = '', esc = false, end = -1;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (ch === '\\') { esc = true; continue; } if (ch === sc) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; sc = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (!depth) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('Array EV sin cerrar');
  const arrText = html.slice(start, end);

  const stubs = new Set();
  for (let intento = 0; intento < 60; intento++) {
    const prelude = stubs.size ? 'var ' + [...stubs].map((s) => s + '=undefined').join(',') + ';' : '';
    try {
      const out = new Function(prelude + 'return ' + arrText + ';')();
      if (!Array.isArray(out)) throw new Error('EV no es array');
      return out;
    } catch (e) {
      const mm = /(\w+) is not defined/.exec(e.message || '');
      if (mm && !stubs.has(mm[1])) { stubs.add(mm[1]); continue; }
      throw e;
    }
  }
  throw new Error('EV: demasiados globals sin resolver');
}

module.exports = { fetchCatalogo };
