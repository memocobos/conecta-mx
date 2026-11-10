#!/usr/bin/env node
// mide:viaje-ag-1 — [VIAJE-AG-1] «🚌 Viaje agotado · sigue CHEAP» por fecha.
// Palabra de Memo (10-nov, Mon Laferte 16-nov): la PLUS no, la CHEAP sí.
// Mide el árbol de trabajo (sin ancla). Control positivo por construcción:
// la misma ficha SIN la bandera vende PLUS; con ella no — y CHEAP en los dos.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..');
let v = 0, r = 0;
const af = (c, m) => { try { if (c()) { v++; console.log('  ✓ ' + m); } else { r++; console.log('  ✗ ' + m); } } catch (e) { r++; console.log('  ✗ ' + m + ' — ' + e.message); } };

const C = require(path.join(R, 'netlify/functions/_lib/esferas-compile.js'));
const PZ = require(path.join(R, 'netlify/functions/_lib/precio-zona.js'));

console.log('[C] compilador: la bandera sobrevive al parser y sale emitida');
const crudo = JSON.stringify([
  { lbl: '16 Noviembre', ds: '2030-11-16', zonas: [{ n: 'Platinum', p: 5500 }], cheapZonas: [{ n: 'Platinum', p: 3700 }], viajeAg: 1 },
  { lbl: '17 Noviembre', ds: '2030-11-17', zonas: [{ n: 'Platinum', p: 5500 }], cheapZonas: [{ n: 'Platinum', p: 3700 }] },
]);
const mf = C._parseMultifecha(crudo);
af(() => mf[0].viajeAg === 1, 'parseMultifecha conserva viajeAg:1');
af(() => mf[1].viajeAg === 0, 'una fecha sin bandera queda en 0');
const src = fs.readFileSync(path.join(R, 'netlify/functions/_lib/esferas-compile.js'), 'utf8');
af(() => /\(f\.viajeAg \? ',viajeAg:1' : ''\)/.test(src), 'multifechaTexto emite ,viajeAg:1 solo si viene (sin él, byte-igual)');

console.log('[P] servidor: _calcularPrecio cierra el viaje y deja CHEAP');
const ev = (con) => ({ id: 'x', a: 'X', ds: '2030-11-16', v: 'Auditorio Banamex, Mty', st: '', sep: 300, sepCheap: 300, ride: 2700,
  hotel: [{ n: 'Compartida', e: 0 }],
  zonas: [{ n: 'Platinum', p: 5500 }], cheapZonas: [{ n: 'Platinum', p: 3700 }],
  multifecha: [
    Object.assign({ lbl: '16', ds: '2030-11-16', zonas: [{ n: 'Platinum', p: 5500 }], cheapZonas: [{ n: 'Platinum', p: 3700 }] }, con ? { viajeAg: 1 } : {}),
    { lbl: '17', ds: '2030-11-17', zonas: [{ n: 'Platinum', p: 5500 }], cheapZonas: [{ n: 'Platinum', p: 3700 }] },
  ] });
const q = (e, paquete, idx, extra) => PZ._calcularPrecio(e, Object.assign({ paquete, num_personas: 1, fecha_idx: idx, zona: 'Platinum', hotel: 'Compartida', hoyISO: '2030-01-01' }, extra || {}));
af(() => q(ev(false), 'plus', 0).ok === true, 'control: sin bandera, PLUS del 16 se vende');
for (const p of ['plus', 'stay', 'ride']) af(() => { const x = q(ev(true), p, 0); return x.ok === false && /viaje de esta fecha est[aá] agotado/.test(x.motivo); }, `con bandera, ${p.toUpperCase()} del 16 se rehúsa con su motivo`);
af(() => q(ev(true), 'cheap', 0).ok === true, 'con bandera, CHEAP del 16 SÍ se vende');
af(() => q(ev(true), 'plus', 1).ok === true, 'la otra fecha (17) no se toca: PLUS se vende');
af(() => q(ev(true), 'plus', 0, { para_careo: true }).ok === true, 'el careo (para_careo) pasa: es candado de venta');

console.log('[I] index: buildFechaButtons apaga la noche para PLUS y la deja para CHEAP');
const html = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
const i0 = html.indexOf('function buildFechaButtons(){');
let d = 0, j = html.indexOf('{', i0);
for (; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}') { d--; if (!d) break; } }
const fn = html.slice(i0, j + 1);
const corre = (pkg) => {
  const out = {};
  const ctx = { cur: { multifecha: [{ lbl: '16 Noviembre', zonas: [{ n: 'A' }], cheapZonas: [{ n: 'A' }], viajeAg: 1 }, { lbl: '17 Noviembre', zonas: [{ n: 'A' }] }] },
    selPkg: pkg, selFechaIdx: 0, $$: (id) => (out[id] = out[id] || { innerHTML: '' }) };
  vm.createContext(ctx); vm.runInContext(fn + ';buildFechaButtons();', ctx);
  return Object.values(out).map((o) => o.innerHTML).join('');
};
af(() => { const h = corre('plus'); return /16 Noviembre<br><small>Viaje agotado · solo boleto<\/small>/.test(h) && /disabled/.test(h); }, 'PLUS: el 16 sale «Viaje agotado · solo boleto» y deshabilitado');
af(() => !/Viaje agotado/.test(corre('cheap')), 'CHEAP: el 16 no se apaga');
af(() => /viajeAg&&selPkg!=='cheap'\)return null;/.test(html), 'currentZonasToShow no ofrece zonas de viaje en esa noche');
af(() => /cur\.multifecha\[selFechaIdx\]\.viajeAg\)\{\s*var _ph/.test(html), 'calcular() se rehúsa y lo DICE en el placeholder');

console.log('[E] Esferas: el botón escribe la entrada y la preservación no lo revive');
const esf = fs.readFileSync(path.join(R, 'kamehouse-esferas.js'), 'utf8');
const kh = fs.readFileSync(path.join(R, 'kamehouse.js'), 'utf8');
af(() => /esf-mf-viajeag/.test(esf) && /if \(b\._esfViajeAg\) o\.viajeAg = 1;/.test(esf), 'el bloque de fecha tiene el botón y _esfGetMultifecha lo emite');
af(() => /'prox', 'viajeAg'\]\)/.test(kh), 'viajeAg está en MF_ADMINISTRADAS (quitarlo no lo re-inserta del original)');

console.log(`\n${r ? '🔴 ROJO' : '✅ VERDE'} · ${v} en verde · ${r} en rojo`);
process.exit(r ? 1 : 0);
