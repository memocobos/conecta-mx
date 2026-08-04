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
//   fetchCatalogo() → { [slug]: { nombre, venue, ciudad, ds, multifecha:[{idx,lbl,ds,noches}],
//                                 banco } }  o null (BEST-EFFORT).
//   cuentaParaPaquete(ev, paquete) → { nombre, clabe, tarjeta, titular } — MISMA
//                     regla que getBanco() del index: cheap→Banamex (SIEMPRE),
//                     ride/plus/stay→ev.banco||BANCO_DEFAULT (BBVA). Las constantes
//                     se replican aquí.
//
// El transporte solo usa ds/multifecha; los campos extra (nombre/venue/banco) son
// ADITIVOS y no cambian esa forma. Para poder devolver el banco real, el parseo
// SIEMBRA BANCO_DEFAULT/BANCO_HEY con sus valores (en vez de stubearlos a
// undefined como los demás globals).
//
// Cache en memoria del módulo (se comparte mientras la lambda siga tibia). El
// catálogo cambia con cada deploy del index, así que un TTL corto basta.
//
// Env vars: URL / DEPLOY_PRIME_URL (Netlify las setea; fallback a producción).
// =============================================================================

const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://conectareynosa.mx';
const TTL_MS = 10 * 60 * 1000; // 10 min

// Constantes de banco replicadas del index.html (var BANCO_DEFAULT / BANCO_HEY).
// Si cambian allá, actualizar aquí. Se usan tanto para SEMBRAR el parseo del EV
// (así `banco:` resuelve al objeto real) como para cuentaParaPaquete().
const BANCO_DEFAULT = { nombre: 'BBVA Bancomer', tarjeta: '4152 3139 7573 0487', clabe: '012822004639334319', titular: 'Guillermo Alexander Cobos Vizcarra' };
const BANCO_HEY     = { nombre: 'Banamex',        tarjeta: '5206 9403 0472 6407', clabe: '002580702305539377', titular: 'Guillermo Cobos Vizcarra' };

// Devuelve solo los 4 campos que consumen los contratos (sin `link`).
function _cuenta(b) {
  if (!b) return null;
  return { nombre: b.nombre || '', clabe: b.clabe || '', tarjeta: b.tarjeta || '', titular: b.titular || '' };
}

// Ciudad a partir del venue "Auditorio Banamex, MTY" → "MTY". Null si no aplica.
function _ciudadDeVenue(v) {
  const s = String(v || '');
  const i = s.lastIndexOf(',');
  return i >= 0 ? s.slice(i + 1).trim() : null;
}

// MISMA regla que getBanco() del index: cheap→Banamex (SIEMPRE); ride/plus/stay
// siguen el banco del evento → ev.banco||BANCO_DEFAULT (BBVA). `ev` es la entrada
// del catálogo (con .banco ya resuelto) o cualquier objeto con .banco.
// 🔒 AUD-2: `trim()` (un ' cheap ' con espacios caía al banco del evento y el
// cliente depositaba a la cuenta equivocada) y FAIL-LOUD ante un paquete
// desconocido: antes cualquier basura devolvía la cuenta del evento como si
// fuera un paquete válido.
function cuentaParaPaquete(ev, paquete) {
  const p = String(paquete == null ? '' : paquete).trim().toLowerCase();
  if (p === 'cheap') return _cuenta(BANCO_HEY);
  if (p === 'plus' || p === 'ride' || p === 'stay') return _cuenta((ev && ev.banco) || BANCO_DEFAULT);
  throw new Error(`cuentaParaPaquete: paquete desconocido "${paquete}"`);
}

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
        // ADITIVO para contratos: nombre/venue/ciudad/banco. Transporte no los usa.
        nombre: (e.a != null) ? String(e.a) : null,
        fecha:  (e.f != null) ? String(e.f) : null,   // display humano ("13 dic 2026")
        venue:  (e.v != null) ? String(e.v) : null,
        // [GR-8] ADITIVO para waitlist-notify: el estado de venta del evento.
        // Cadena vacía = A LA VENTA; 'proximamente' | 'agotado' | 'ultimos' si no.
        // Se normaliza a '' (nunca null) porque la comparación de la lista de
        // espera es `ev.st === ""` y un null la volvería falsa para siempre.
        st: (e.st != null) ? String(e.st) : '',
        ciudad: _ciudadDeVenue(e.v),
        banco:      _cuenta(e.banco),                 // objeto o null (BANCO_* ya sembrado)
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

// Cache del EV crudo (array de eventos tal cual, con zonas/precios/sep/hotel).
let _cacheRaw = { ts: 0, ev: null };

// Devuelve el array EV CRUDO (los objetos de evento completos, con zonas, precios,
// sep, hotel, etc.) — fuente única para quien necesite los PRECIOS de venta
// (vendedores). Best-effort: NUNCA lanza; null si no se puede leer. Cache propio
// (misma TTL que el catálogo curado).
async function fetchEventosRaw() {
  if (_cacheRaw.ev && (Date.now() - _cacheRaw.ts) < TTL_MS) return _cacheRaw.ev;
  try {
    const ev = await fetchEV();
    if (!Array.isArray(ev)) return null;
    _cacheRaw = { ts: Date.now(), ev };
    return ev;
  } catch (e) {
    return null;
  }
}

// ----- copiado de eventos-meta-sync-cron (mismo approach, sin tocar el cron) -----

// Listas de hotel globales del index (HOTEL_MTY / HOTEL_CDM / HOTEL_STD), que la
// cascada de precio-zona necesita para los eventos sin `hotel:` propio.
let _cacheHoteles = { ts: 0, hoteles: null };

async function fetchEV() {
  const url = `${SITE_URL.replace(/\/$/, '')}/index.html`;
  const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' al leer ' + url);
  const html = await r.text();
  // Aprovechamos la misma descarga para cachear los HOTEL_* globales.
  try { _cacheHoteles = { ts: Date.now(), hoteles: _hotelesDeHtml(html) }; } catch (e) { /* best-effort */ }
  return parseEV(html);
}

// { std, mty, cdm } o {} — best-effort, NUNCA lanza.
async function fetchHotelesGlobales() {
  if (_cacheHoteles.hoteles && (Date.now() - _cacheHoteles.ts) < TTL_MS) return _cacheHoteles.hoteles;
  try {
    await fetchEV();               // llena _cacheHoteles de paso
    return _cacheHoteles.hoteles || {};
  } catch (e) { return {}; }
}

// Extrae el literal `var EV = [ ... ]` por balanceo de corchetes (ignorando
// strings) y lo materializa con new Function. Los globals que el array referencia
// (BANCO_*, HOTEL_*, etc.) se stubbean a `undefined` automáticamente: solo se usan
// como VALORES dentro del literal, nunca para derivar la forma del evento.
// 🔒 AUD-2 — texto CRUDO de la declaración `var NOMBRE=[ ... ];` de index.html,
// por balanceo de corchetes (respetando strings). '' si no existe.
function _declaracionArray(html, nombre) {
  const re = new RegExp('var\\s+' + nombre + '\\s*=\\s*\\[');
  const m = String(html).match(re);
  if (!m) return '';
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
  if (end < 0) return '';
  return 'var ' + nombre + '=' + html.slice(start, end) + ';';
}

// Prelude con las listas de hotel globales tal como están escritas en el index.
function _declaracionesHotel(html) {
  return ['HOTEL_STD', 'HOTEL_MTY', 'HOTEL_CDM']
    .map((n) => _declaracionArray(html, n))
    .filter(Boolean)
    .join('');
}

// Listas de hotel globales YA MATERIALIZADAS (para la cascada de precio-zona
// cuando un evento no trae `hotel:` propio). Best-effort: {} si no se pueden leer.
function _hotelesDeHtml(html) {
  try {
    const decls = _declaracionesHotel(html);
    if (!decls) return {};
    return new Function(decls + 'return {std:typeof HOTEL_STD!=="undefined"?HOTEL_STD:null,mty:typeof HOTEL_MTY!=="undefined"?HOTEL_MTY:null,cdm:typeof HOTEL_CDM!=="undefined"?HOTEL_CDM:null};')();
  } catch (e) { return {}; }
}

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

  // SIEMBRA los bancos con sus valores reales (para que `banco:` resuelva a
  // objetos); el resto de globals se auto-stubbean a undefined.
  //
  // 🔒 AUD-2: los HOTEL_* también se siembran, pero NO con constantes copiadas:
  // se toma el TEXTO de su declaración del mismo index.html. Antes se
  // auto-stubbeaban a `undefined`, así que `ev.hotel` quedaba undefined para
  // todos los eventos que escriben `hotel:HOTEL_CDM` (la mayoría) y el candado
  // de precios no podía resolver el hotel de una venta. Leerlos del archivo
  // evita duplicar datos y evita que se desincronicen para siempre.
  const seed = 'var BANCO_DEFAULT=' + JSON.stringify(BANCO_DEFAULT)
             + ',BANCO_HEY=' + JSON.stringify(BANCO_HEY) + ';'
             + _declaracionesHotel(html);
  const stubs = new Set();
  for (let intento = 0; intento < 60; intento++) {
    const prelude = seed + (stubs.size ? 'var ' + [...stubs].map((s) => s + '=undefined').join(',') + ';' : '');
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

module.exports = {
  fetchCatalogo, cuentaParaPaquete, fetchEventosRaw, fetchHotelesGlobales,
  // Expuestos para el arnés de paridad de constantes (AUD-2).
  _BANCO_DEFAULT: BANCO_DEFAULT,
  _BANCO_HEY: BANCO_HEY,
  _declaracionArray, _hotelesDeHtml, _parseEV: parseEV,
};
