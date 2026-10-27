#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * mide-yamcha-ux-1 — YAMCHA-UX-1 · buscador + minimizar por evento (26-oct-2026)
 *
 * Palabra de Memo: «ponme un buscador en Derrota de Yamcha y poder minimizar la
 * lista por evento — tengo natanael y tito, minimizar uno para concentrarme en
 * el otro».
 *
 * ⚠️ SIN ANCLA a propósito: carga del ÁRBOL DE TRABAJO (como mide:baba-ux-2).
 * Las funciones REALES se rebanan de kamehouse-yamcha.js y corren en vm con un
 * DOM falso; el HTML que pintan es lo que se mide.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(RAIZ, 'kamehouse-yamcha.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');

let V = 0, R = 0;
function af(cond, msg) {
  let ok = false;
  try { ok = !!cond; } catch (e) { msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}
function funcionDe(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('══ mide-yamcha-ux-1 · buscador + minimizar por evento ══');

console.log('\n[A] piezas');
const FNS = ['_yamchaSt', '_yamchaNorm', 'yamchaBuscar', 'yamchaToggle', '_yamchaPintar'];
const cuerpos = FNS.map((n) => funcionDe(SRC, n));
af(cuerpos.every(Boolean), 'las 5 funciones se rebanan');
af(/id="yamcha-buscar"[^>]*oninput="yamchaBuscar\(this\.value\)"/.test(HTML), 'el buscador vive en la página y llama a yamchaBuscar');
af(/_yamchaPintar\(\);\s*\}\s*catch/.test(funcionDe(SRC, 'loadYamcha') || ''), 'loadYamcha delega el pintado en _yamchaPintar');

// DOM falso: la lista guarda su innerHTML; querySelector lee data-abierto del HTML pintado.
const lista = { innerHTML: '' };
const document = {
  getElementById: (id) => (id === 'yamcha-lista' ? lista : null),
  querySelector: (sel) => {
    const slug = (sel.match(/data-yamcha-grupo="([^"]+)"/) || [])[1];
    const m = new RegExp('data-yamcha-grupo="' + slug + '" data-abierto="(\\d)"').exec(lista.innerHTML);
    return m ? { dataset: { abierto: m[1] } } : null;
  },
};
const ctx = vm.createContext({
  document, window: {}, String, Number, Array, Set, console,
  CSS: { escape: (s) => s },
  _esfEsc: (s) => String(s == null ? '' : s),
  formatMXN: (n) => '$' + Number(n || 0).toLocaleString('en-US'),
});
cuerpos.forEach((c) => vm.runInContext(c, ctx));
const run = (code) => vm.runInContext(code, ctx);

ctx.window._yamchaRows = [
  { id: '1', evento_slug: 'natanael', evento_nombre: 'Natanael Cano', cliente_nombre: 'Ana López', monto: 5000, estado: 'pendiente' },
  { id: '2', evento_slug: 'natanael', evento_nombre: 'Natanael Cano', cliente_nombre: 'Beto Ruiz', monto: 3000, estado: 'transferido', datos_bancarios: 'Banorte 0721' },
  { id: '3', evento_slug: 'titodoble', evento_nombre: 'Tito Doble P', cliente_nombre: 'Daniela Hernández', monto: 2217, estado: 'transferido' },
  { id: '4', evento_slug: 'titodoble', evento_nombre: 'Tito Doble P', cliente_nombre: 'Leobardo Hernández', monto: 2217, estado: 'transferido' },
];
const abierto = (slug) => (new RegExp('data-yamcha-grupo="' + slug + '" data-abierto="(\\d)"').exec(lista.innerHTML) || [])[1];

console.log('\n[B] al abrir');
run('_yamchaPintar()');
af(abierto('natanael') === '1', 'un evento con pendientes nace ABIERTO');
af(abierto('titodoble') === '0', 'un evento TODO reembolsado nace MINIMIZADO');
af(/✓ Todo reembolsado/.test(lista.innerHTML), 'y lo dice: «✓ Todo reembolsado»');
af(/1 pendiente\(s\) · \$5,000/.test(lista.innerHTML), 'el encabezado de natanael dice cuánto falta: 1 · $5,000');
af(!/Daniela/.test(lista.innerHTML), 'minimizado = su tabla no se pinta');

console.log('\n[C] minimizar y abrir a mano');
run("yamchaToggle('natanael')");
af(abierto('natanael') === '0', 'tocar natanael lo MINIMIZA');
run("yamchaToggle('titodoble')");
af(abierto('titodoble') === '1' && /Daniela/.test(lista.innerHTML), 'tocar tito (auto-minimizado) lo ABRE y pinta a Daniela');
run('_yamchaPintar()');
af(abierto('natanael') === '0' && abierto('titodoble') === '1', '🔒 recargar la lista (como tras marcar transferido) RESPETA lo que elegiste');

console.log('\n[D] buscador');
run("yamchaBuscar('hernandez')");
af(/Daniela/.test(lista.innerHTML) && /Leobardo/.test(lista.innerHTML), 'buscar «hernandez» (sin acento) encuentra a «Hernández»');
af(abierto('natanael') === undefined, 'el evento sin coincidencias se esconde entero');
run("yamchaToggle('titodoble')");
af(abierto('titodoble') === '1', '🔒 buscando, el evento con resultados queda ABIERTO aunque lo hayas minimizado (si no, el resultado se escondería)');
run("yamchaBuscar('banorte')");
af(/Beto Ruiz/.test(lista.innerHTML) && !/Ana López/.test(lista.innerHTML), 'busca también en datos bancarios y filtra filas: Beto sí, Ana no');
af(/Mostrando 1 de 2/.test(lista.innerHTML), 'dice cuántas filas esconde la búsqueda');
af(/1 pendiente\(s\) · \$5,000/.test(lista.innerHTML), '🔒 el encabezado sigue contando TODO el evento (buscar esconde filas, no cambia la deuda)');
run("yamchaBuscar('zzz')");
af(/Nadie coincide/.test(lista.innerHTML), 'sin resultados lo dice, no deja la pantalla en blanco');
run("yamchaBuscar('')");
af(abierto('natanael') === '0' && abierto('titodoble') === '0', 'al borrar la búsqueda vuelve lo que habías minimizado');

console.log('\n══ RESULTADO ══');
if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
process.exit(R ? 1 : 0);
