#!/usr/bin/env node
// [CAPSULE-COMP-1 · 20-oct-2026] Pedido de Memo: ver los comprobantes de pago
// desde la lista de viajeros de Capsule. Vigilante vivo del árbol de trabajo
// (como mide:nav-min-1): el servidor ya firmaba la foto (abonos_listar con
// viajero_id → foto_url); esta tuerca es la pantalla que faltaba.
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
const srv = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');

let ok = 0, ko = 0;
const af = (c, m) => { if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

console.log('[A] el botón y su función');
af(/📎 Pagos<\/button>/.test(js), 'la fila de la tabla trae el botón «📎 Pagos»');
af(/onclick="_vjPagosVer\(/.test(js), 'y llama a _vjPagosVer (el onclick existe)');
af(/async function _vjPagosVer\(/.test(js), '_vjPagosVer está declarada');

console.log('[B] le pregunta al dueño, no inventa');
const fn = js.slice(js.indexOf('async function _vjPagosVer'), js.indexOf('function _vjAbonoAbrir'));
af(/khViajeros\.abonosDe\(id\)/.test(fn), 'los abonos salen de khViajeros.abonosDe (la firma la hace el servidor)');
af(!/foto_path/.test(fn), 'la pantalla NO toca foto_path: solo la URL firmada que el servidor manda');
af(/foto_url/.test(fn) && /ver comprobante/.test(fn), 'pinta «ver comprobante» con la foto_url firmada');
af(/sin comprobante/.test(fn), 'y el abono sin foto lo DICE, no lo esconde');
af(/target="_blank"/.test(fn) && /rel="noopener"/.test(fn), 'el link abre en pestaña nueva con noopener');

console.log('[C] el servidor sigue firmando como antes (no se tocó)');
af(/tiene_foto: !!foto_path/.test(srv), 'abonos_listar sigue mandando tiene_foto');
af(/\(viajero_id && foto_path\) \? await _firmarAbono/.test(srv), 'y firma foto_url SOLO cuando se pidió UN viajero');

console.log('[D] las dos caras del renglón plegable no se pisan');
af(/dataset\.modo = 'pagos'/.test(js) && /dataset\.modo = 'abono'/.test(js), 'cada cara marca su modo en el renglón');
af(/tr\.dataset\.modo !== 'pagos'/.test(js), 'el ➕ Abono sobre un renglón en modo pagos CAMBIA de cara (no cierra en falso)');
const cierraTodo = (js.match(/x\.style\.display = 'none'; x\.dataset\.modo = '';/g) || []).length;
af(cierraTodo === 2, 'los DOS caminos limpian el modo al cerrar los demás renglones (' + cierraTodo + ' de 2)');

console.log('[E] control positivo del instrumento');
af(!/📎 PagosQueNoExiste/.test(js), 'el detector distingue (un literal inventado no aparece)');
af(/async function _vjAbonoGuardar\(/.test(js), 'el abono manual (FASE A2) sigue vivo');

console.log((ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
process.exit(ko ? 1 : 0);
