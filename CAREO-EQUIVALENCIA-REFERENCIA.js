const fs = require('fs');
const R = '/sessions/gifted-blissful-cori/mnt/conecta-mx';
const html = fs.readFileSync(R + '/index.html', 'utf8');
const kh = fs.readFileSync(R + '/kamehouse.js', 'utf8');
const lib = require(R + '/netlify/functions/_lib/precio-zona.js');

// -- extraer array por balance de corchetes --
function arr(src, decl) {
  const m = src.match(new RegExp(decl.replace(/[[\]]/g, '\\$&')));
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let d = 0, inS = false, sc = '', esc = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (esc) { esc = false; continue; }
    if (inS) { if (ch === '\\') esc = true; else if (ch === sc) inS = false; continue; }
    if (ch === '"' || ch === "'") { inS = true; sc = ch; continue; }
    if (ch === '[') d++; else if (ch === ']') { d--; if (!d) return src.slice(start, i + 1); }
  }
  return null;
}
const HOTEL_STD = eval(arr(html, 'var HOTEL_STD=[') || '[]');
const HOTEL_MTY = eval(arr(html, 'var HOTEL_MTY=[') || '[]');
const HOTEL_CDM = eval(arr(html, 'var HOTEL_CDM=[') || '[]');
const EV = new Function('BANCO_DEFAULT','BANCO_HEY','WA','HOTEL_STD','HOTEL_MTY','HOTEL_CDM',
  'return ' + arr(html, 'var EV=['))({}, {}, '', HOTEL_STD, HOTEL_MTY, HOTEL_CDM);
console.log('EV:', EV.length, 'eventos · HOTEL_MTY:', HOTEL_MTY.length, '· HOTEL_CDM:', HOTEL_CDM.length);

// -- extraer bloque _vtaDias.._vtaCalc de kamehouse.js por balance de llaves --
const ini = kh.indexOf('function _vtaDias');
const decl = kh.indexOf('function _vtaCalc');
let d = 0, fin = -1, started = false;
for (let i = decl; i < kh.length; i++) {
  const ch = kh[i];
  if (ch === '{') { d++; started = true; }
  else if (ch === '}') { d--; if (started && !d) { fin = i + 1; break; } }
}
const bloque = kh.slice(ini, fin);
const mod = new Function('_escCtr', bloque + '\n_vtaHoteles = { mty: MTY, cdm: CDM };\nreturn { _vtaCalc };'
  .replace('MTY', JSON.stringify(HOTEL_MTY)).replace('CDM', JSON.stringify(HOTEL_CDM)));
const { _vtaCalc } = mod(s => s);
console.log('_vtaCalc extraída:', bloque.length, 'chars · usa hoyISO:', /hoyISO/.test(bloque));

// -- careo --
const hoy = lib.hoyMx();
const norm = r => JSON.stringify({ ok: r.ok, motivo: r.motivo || null, total: r.total ?? null, pu: r.precio_unit ?? null, sep: r.separo ?? null });
let combos = 0, diffs = 0, oks = 0, kos = 0; const ejemplos = []; const motivos = {};
for (const ev of EV) {
  const fechas = (Array.isArray(ev.multifecha) && ev.multifecha.length) ? ev.multifecha.map((_, i) => i) : [0];
  for (const fi of fechas) for (const paq of ['plus', 'ride', 'stay', 'cheap']) {
    const zonas = (paq === 'cheap') ? ((ev.multifecha && ev.multifecha[fi] && ev.multifecha[fi].cheapZonas) || ev.cheapZonas || []) : ((ev.multifecha && ev.multifecha[fi] && ev.multifecha[fi].zonas) || ev.zonas || []);
    const zNoms = zonas.length ? zonas.map(z => z.n) : [null];
    for (const zn of zNoms) for (const n of [1, 2, 5]) {
      const opts = { paquete: paq, num_personas: n, zona: zn || undefined, fecha_idx: fi, hoyISO: hoy, hoteles: { mty: HOTEL_MTY, cdm: HOTEL_CDM }, transporte_cost: 0 };
      let a, b;
      try { a = lib._calcularPrecio(ev, opts); } catch (e) { a = { ok: false, motivo: 'EXC lib: ' + e.message }; }
      try { b = _vtaCalc(ev, opts); } catch (e) { b = { ok: false, motivo: 'EXC kh: ' + e.message }; }
      combos++; if (a.ok) oks++; else { kos++; motivos[a.motivo] = (motivos[a.motivo] || 0) + 1; }
      if (norm(a) !== norm(b)) { diffs++; if (ejemplos.length < 8) ejemplos.push({ id: ev.id, fi, paq, zn, n, lib: norm(a), kh: norm(b) }); }
    }
  }
}
console.log('\nCAREO lib vs kamehouse →', combos, 'combos ·', diffs, 'diffs ·', oks, 'ok:true ·', kos, 'ok:false');
console.log('motivos top:', JSON.stringify(Object.entries(motivos).sort((x,y)=>y[1]-x[1]).slice(0,6)));
ejemplos.forEach(e => console.log(JSON.stringify(e)));

// -- casos conocidos (validación del instrumento: deben dar los números de HOY) --
const casos = [
  ['melanie',      'Butaca',              4700],
  ['rosalia',      'Platino',             7200],
  ['tnc',          'Tercer Nivel Central',3800],
  ['pacoamoroso',  'Beyond',              4900],
];
console.log('\nCASOS CONOCIDOS (plus · 1 persona · costoXPersona):');
for (const [id, zona, esperado] of casos) {
  const ev = EV.find(e => e.id === id || String(e.id).startsWith(id));
  if (!ev) { console.log(' ', id, '→ NO ENCONTRADO en EV'); continue; }
  const o = { paquete: 'plus', num_personas: 1, zona, fecha_idx: 0, hoyISO: hoy, hoteles: { mty: HOTEL_MTY, cdm: HOTEL_CDM }, transporte_cost: 0 };
  const a = lib._calcularPrecio(ev, o), b = _vtaCalc(ev, o);
  console.log(' ', id, zona, '→ lib:', a.ok ? (a.precio_unit + ' (sep ' + a.separo + ')') : a.motivo, '· kh:', b.ok ? (b.precio_unit + ' (sep ' + b.separo + ')') : b.motivo, '· esperado:', esperado, (a.ok && a.precio_unit === esperado && b.ok && b.precio_unit === esperado) ? '✓' : '✗');
}
