#!/usr/bin/env node
/* mide-portal-vivo-1 — PORTAL-VIVO-1 (29-oct-2026)
 * «El portal lo veo muy seco… foto del artista basado en el del index, música,
 *  liga a spotify, la radio más sencilla» — palabra de Memo, 29-oct.
 *   [A] _migHeroHtml: la card migrada gana el HERO de la casa (.tc-hero) —
 *       estática inline si existe, shimmer si no, título ESCAPADO, y el
 *       atributo lleva el slug BASE (un prefijo no es un ancla: palnorte vs
 *       palnorte2026).
 *   [B] _migMediaHtml: ▶ muestra + link Spotify + radio; sin artista → '' y
 *       CERO fetch en el render (la URL firmada de Deezer se pide AL CLIC).
 *   [C] _migFotosUpgrade ejecutada con DOM falso: una petición por evento
 *       base, caché, el hueco deja gradiente (nunca shimmer eterno), y la foto
 *       de `palnorte` NO cae sobre `palnorte2026`.
 *   [D] _migTunes ejecutada: pide a Deezer al clic, pausa la radio POR SU
 *       BOTÓN, toggle restaura, y «sin muestra» se DICE.
 *   [E] El cableado por el HECHO: renderPlanMigrado llama hero+media+upgrade
 *       y el dispatcher despacha tunes/radio (medido sobre código SIN
 *       comentarios — un grep de comentario se caza solo).
 * ⚠️ SIN ANCLA (árbol de trabajo, como mide:plan-pagos-1): no sufre la trampa
 * del commit; sus controles son por construcción. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (e) { ok = false; } const t = typeof m === 'function' ? m() : m; if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };

const PORTAL = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');

function rebana(txt, ancla) {
  const i = txt.indexOf(ancla);
  if (i < 0) throw new Error('ancla no encontrada: ' + ancla);
  let d = 0, k = txt.indexOf('{', i), s = false, sc = '', esc = false;
  for (; k < txt.length; k++) {
    const c = txt[k];
    if (esc) { esc = false; continue; }
    if (s) { if (c === '\\') { esc = true; continue; } if (c === sc) s = false; continue; }
    if (c === '"' || c === "'" || c === '`') { s = true; sc = c; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } }
  }
  return txt.slice(i, k);
}
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Fixtures: catálogo chico con el PAR del prefijo (palnorte / palnorte2026).
const EVFIX = [
  { id: 'frontera', a: 'Grupo Frontera', img: 'Grupo Frontera', staticImg: 'frontera' },
  { id: 'karolg', a: 'Karol G' },
  { id: 'palnorte', a: "Tecate Pa'l Norte 2027", img: 'palnorte-cartel' },
  { id: 'palnorte2026', a: "Pa'l Norte 2026", img: 'palnorte-cartel-viejo' },
  { id: 'sinartista' },
];
const SIFIX = { frontera: 'imgs/frontera.jpg' };

// escapeHtml trae REGEX con comillas adentro (/"/g): para el parser de strings
// de `rebana` esa comilla abre un string que nunca cierra y el balance se come
// el archivo entero (se midió: 210 KB hasta </html>). Como es una función
// plana sin llaves anidadas, se corta por el `\n}` de cierre — y sigue siendo
// LA REAL, no una copia.
function rebanaPlana(txt, ancla) {
  const i = txt.indexOf(ancla);
  if (i < 0) throw new Error('ancla no encontrada: ' + ancla);
  const f = txt.indexOf('\n}', i);
  return txt.slice(i, f + 2);
}

function sandboxBase() {
  const sb = { console, EV: JSON.parse(JSON.stringify(EVFIX)), STATIC_IMGS: SIFIX };
  sb.window = sb;
  vm.createContext(sb);
  [rebanaPlana(PORTAL, 'function escapeHtml'),
   rebana(PORTAL, 'function _evBySlug(eventoId){'),
   rebana(PORTAL, 'function _artStaticDeEv(ev){'),
   rebana(PORTAL, 'function _migHeroHtml(t, titulo) {'),
   rebana(PORTAL, 'function _migMediaHtml(t) {')].forEach((c) => vm.runInContext(c, sb));
  return sb;
}

// ═══ [A] el HERO ═══════════════════════════════════════════════════════════
console.log('[A] _migHeroHtml · la card gana el hero de la casa');
try {
  const sb = sandboxBase();
  const h1 = vm.runInContext('_migHeroHtml({ evento_id: "frontera" }, "Grupo Frontera")', sb);
  af(/class="tc-hero mig-hero"/.test(h1) && !/is-loading/.test(h1), 'con estática: tc-hero (la piel de siempre) SIN shimmer');
  af(h1.indexOf('background-image:url(&quot;imgs/frontera.jpg&quot;)') !== -1, 'la foto estática va INLINE (cero red)');
  af(/data-mig-hero="frontera"/.test(h1), 'el atributo lleva el slug base');
  const h2 = vm.runInContext('_migHeroHtml({ evento_id: "karolg#0" }, "Karol G en Monterrey")', sb);
  af(/is-loading/.test(h2) && h2.indexOf('background-image') === -1, 'sin estática: shimmer (is-loading) y sin fondo inline');
  af(/data-mig-hero="karolg"/.test(h2), 'el #N se pela: data-mig-hero lleva el BASE');
  af(h2.indexOf('Karol G en Monterrey') !== -1, 'el título vive en el hero');
  const hx = vm.runInContext('_migHeroHtml({ evento_id: "karolg" }, "<img src=x onerror=alert(1)>")', sb);
  af(hx.indexOf('<img') === -1 && hx.indexOf('&lt;img') !== -1, 'el título se ESCAPA (XSS no pasa)');
  const hp = vm.runInContext('_migHeroHtml({ evento_id: "palnorte2026" }, "x")', sb);
  af(/data-mig-hero="palnorte2026"/.test(hp), 'palnorte2026 conserva SU base — no se funde con palnorte');
} catch (e) { af(false, '[A] reventó: ' + e.message); }

// ═══ [B] la fila de media ══════════════════════════════════════════════════
console.log('\n[B] _migMediaHtml · muestra + Spotify + radio');
try {
  const sb = sandboxBase();
  const m1 = vm.runInContext('_migMediaHtml({ evento_id: "frontera#1" })', sb);
  af(/data-mig-act="tunes"/.test(m1) && /data-mig-artista="Grupo Frontera"/.test(m1), '▶ con el artista del catálogo (por #N también)');
  af(m1.indexOf('https://open.spotify.com/search/Grupo%20Frontera') !== -1, 'Spotify va por LINK con el artista URL-encodeado (el embed no cabe en el CSP)');
  af(/data-mig-act="radio"/.test(m1), 'y la radio a un toque');
  af(vm.runInContext('_migMediaHtml({ evento_id: "noexiste" })', sb) === '', 'evento sin ficha → NADA (fail-soft, no un botón que no suena)');
  af(vm.runInContext('_migMediaHtml({ evento_id: "sinartista" })', sb) === '', 'ficha sin artista → NADA');
  const cuerpoMedia = sinComentarios(rebana(PORTAL, 'function _migMediaHtml(t) {'));
  af(cuerpoMedia.indexOf('fetch(') === -1, 'el RENDER no pide nada a la red: la URL firmada de Deezer se pide AL CLIC');
} catch (e) { af(false, '[B] reventó: ' + e.message); }

// ═══ [C] el upgrade de fotos ═══════════════════════════════════════════════
console.log('\n[C] _migFotosUpgrade · una petición por evento, y el prefijo no pinta al vecino');
async function bloqueC() {
  const sb = sandboxBase();
  const nodos = [];
  const nodo = (base, loading) => {
    const n = { attrs: { 'data-mig-hero': base }, clases: new Set(loading ? ['is-loading'] : []), style: {},
      classList: { contains(c) { return n.clases.has(c); }, remove(c) { n.clases.delete(c); } } };
    nodos.push(n); return n;
  };
  sb.document = { querySelectorAll: (sel) => {
    const m = sel.match(/\[data-mig-hero="(.+)"\]/);
    return nodos.filter((n) => m && n.attrs['data-mig-hero'] === m[1]);
  } };
  sb.CSS = { escape: (s) => s };
  sb._deezerLlamadas = [];
  vm.runInContext('async function _artDeezerUrl(t){ _deezerLlamadas.push(String(t.evento_id)); '
    + 'return String(t.evento_id).indexOf("karolg") === 0 ? "https://cdn.x/karol.jpg" : null; }', sb);
  vm.runInContext('const _migFotoCache = new Map();', sb);
  vm.runInContext(rebana(PORTAL, 'async function _migFotosUpgrade(tours) {'), sb);

  // Dos viajes del MISMO evento (karolg#0 y #1) + palnorte + el vecino del prefijo.
  nodo('karolg', true); nodo('karolg', true);
  nodo('palnorte', true);
  const vecino = nodo('palnorte2026', true);
  await vm.runInContext('_migFotosUpgrade([{ evento_id: "karolg#0" }, { evento_id: "karolg#1" }, { evento_id: "palnorte" }])', sb);
  const llamadas = vm.runInContext('_deezerLlamadas', sb);
  af(llamadas.length === 2, 'DOS viajes del mismo evento = UNA petición (total 2: karolg y palnorte): ' + llamadas.length);
  af(nodos[0].style.backgroundImage && nodos[1].style.backgroundImage
     && nodos[0].style.backgroundImage.indexOf('karol.jpg') !== -1, 'los dos heroes de karolg quedan con SU foto');
  af(!nodos[0].clases.has('is-loading') && !nodos[2].clases.has('is-loading'),
     'el shimmer se apaga SIEMPRE — con foto y sin ella (palnorte sin url queda en gradiente)');
  af(!nodos[2].style.backgroundImage, 'palnorte sin foto NO inventa fondo');
  af(vecino.clases.has('is-loading') && !vecino.style.backgroundImage,
     'palnorte2026 quedó INTACTO: la foto de palnorte no cae por prefijo');
  // La caché: segunda corrida, cero peticiones nuevas.
  await vm.runInContext('_migFotosUpgrade([{ evento_id: "karolg#0" }])', sb);
  af(vm.runInContext('_deezerLlamadas', sb).length === 2, 'la caché manda: re-pintar no re-pide (siguen 2)');
}

// ═══ [D] la muestra de 30 s ════════════════════════════════════════════════
console.log('\n[D] _migTunes · se pide al clic, pausa la radio por su botón, y el hueco se dice');
async function bloqueD() {
  const sb = { console };
  sb.window = sb;
  vm.createContext(sb);
  sb.setTimeout = (fn) => { sb._timeouts = (sb._timeouts || []).concat(fn); };
  sb.rcpClicks = 0; sb.plays = []; sb.fetches = [];
  let rcpPlaying = true;
  sb.document = {
    getElementById: () => null,
    querySelector: (sel) => (rcpPlaying && sel.indexOf('.rcp.rcp-playing') === 0 ? { click: () => { sb.rcpClicks++; rcpPlaying = false; } } : null),
  };
  let conPreview = true;
  sb.fetch = async (u) => { sb.fetches.push(u); return { json: async () => (conPreview
    ? { data: [{ title: 'Un x100to', title_short: 'Un x100to', preview: 'https://cdn.dzcdn.net/p.mp3' }] }
    : { data: [] }) }; };
  sb.Audio = class {
    constructor() { this.paused = true; this._l = {}; }
    addEventListener(ev, fn) { this._l[ev] = fn; }
    async play() { this.paused = false; sb.plays.push(this.src); }
    pause() { this.paused = true; if (this._l.pause) this._l.pause(); }
  };
  vm.runInContext('let _migAudio = null, _migTunesBtn = null;', sb);
  vm.runInContext(rebana(PORTAL, 'function _migTunesReset(b) {'), sb);
  vm.runInContext(rebana(PORTAL, 'async function _migTunes(btn) {'), sb);
  const btn = (artista) => {
    const b = { attrs: { 'data-mig-artista': artista }, textContent: '▶ Escucha a ' + artista, clases: new Set(), disabled: false };
    b.getAttribute = (k) => b.attrs[k] || null;
    b.setAttribute = (k, v) => { b.attrs[k] = v; };
    b.classList = { add: (c) => b.clases.add(c), remove: (c) => b.clases.delete(c) };
    return b;
  };
  const B = btn('Grupo Frontera');
  sb.__b = B;
  await vm.runInContext('_migTunes(__b)', sb);
  af(sb.fetches.length === 1 && sb.fetches[0].indexOf('type=track') !== -1
     && sb.fetches[0].indexOf(encodeURIComponent('Grupo Frontera')) !== -1,
     'Deezer se pide AL CLIC, por artista y type=track');
  af(sb.plays.length === 1 && sb.plays[0] === 'https://cdn.dzcdn.net/p.mp3', 'y suena EXACTAMENTE el preview que contestó');
  af(sb.rcpClicks === 1, 'la radio sonando se pausó POR SU BOTÓN (1 clic al rcp)');
  af(B.textContent.indexOf('❚❚') === 0 && B.clases.has('is-on'), 'el botón dice que está sonando');
  // Toggle: el mismo botón pausa y el listener restaura el rótulo.
  await vm.runInContext('_migTunes(__b)', sb);
  af(B.textContent === '▶ Escucha a Grupo Frontera' && !B.clases.has('is-on'), 'segundo clic = pausa, y el rótulo vuelve solo');
  // Sin muestra: se DICE.
  conPreview = false;
  const B2 = btn('Artista Mudo');
  sb.__b2 = B2;
  await vm.runInContext('_migTunes(__b2)', sb);
  af(B2.textContent.indexOf('Sin muestra') === 0, 'sin preview el botón lo DICE («Sin muestra»), no se queda mudo');
  af(sb.plays.length === 1, 'y no sonó nada nuevo');
}

// ═══ [E] el cableado, por el hecho ═════════════════════════════════════════
function bloqueE() {
  console.log('\n[E] el cableado: el pintor y el dispatcher de verdad');
  const pintor = sinComentarios(rebana(PORTAL, 'async function renderPlanMigrado(){'));
  af(pintor.indexOf('_migHeroHtml(t, titulo)') !== -1, 'renderPlanMigrado arma la card CON el hero');
  af(pintor.indexOf('_migMediaHtml(t)') !== -1, 'y con la fila de media');
  af(pintor.indexOf('_migFotosUpgrade(j.tours)') !== -1, 'y dispara el upgrade de fotos tras pintar');
  af(pintor.indexOf('"tour-card" style="padding') === -1, 'el padding inline viejo se mudó a .mig-body (el hero corre de borde a borde)');
  const disp = sinComentarios(rebana(PORTAL, "document.addEventListener('click', (ev) => {"));
  af(/act === 'tunes'\) _migTunes\(b\)/.test(disp), 'el dispatcher despacha tunes → _migTunes');
  af(/act === 'radio'/.test(disp) && disp.indexOf("getElementById('rcp-play')") !== -1,
     'y radio → el botón REAL del mini-player (el dueño del toggle)');
  const css = PORTAL.slice(0, PORTAL.indexOf('</style>'));
  af(css.indexOf('.mig-hero{cursor:default}') !== -1, '.mig-hero neutraliza el cursor del acordeón');
  af(css.indexOf('.mig-body{padding') !== -1 && css.indexOf('.mig-chip{') !== -1, 'el CSS de cuerpo y chips existe');
  af(css.indexOf('.tc-hero{\n  position:relative') !== -1 || /\.tc-hero\{\s*position:relative/.test(css),
     'la piel .tc-hero original sigue intacta (se REUSA, no se clonó)');
}

(async () => {
  try { await bloqueC(); } catch (e) { af(false, '[C] reventó: ' + e.message); }
  try { await bloqueD(); } catch (e) { af(false, '[D] reventó: ' + e.message); }
  bloqueE();
  console.log('\n' + (R ? '🔴 ROJO' : (V ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + V + ' en verde, ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();
