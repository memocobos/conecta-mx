#!/usr/bin/env node
/* ===========================================================================
 * mide-ride-callejon-1 — RIDE-CALLEJON-1 (26-oct-2026)
 *
 * El callejón: fuera de CDMX un RIDE no pide zona; `buildHotelButtons`
 * pre-marca «Compartida» con un clic de verdad → `selHotel` → calcular()… y el
 * reset de placeholder/result de `selPaquete` (y de `selFecha` en multifecha)
 * ESCONDÍA el total. El cliente veía «elige tus opciones» con todo elegido.
 * Medido contra producción por la puerta del cliente: 37 eventos vivos.
 *
 * Este careo rebana `selPaquete` y `selFecha` del index (BASE = HEAD~ del
 * archivo en git, HEAD = árbol de trabajo) y los corre en vm con un DOM falso
 * mínimo cuyo buildHotelButtons CLICA de verdad (llama a selHotel, que llama a
 * calcular), igual que el real. Mide el HECHO: ¿el total queda visible?
 *
 * ⚠️ SIN ANCLA de HEAD a propósito (árbol de trabajo, como mide:req-b1). El
 * BASE sí es un commit (`BASE_SHA`, por defecto el HEAD de git) para traer el
 * control positivo: el callejón TIENE que reproducirse en BASE.
 * ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const BASE_SHA = process.env.BASE_SHA || '89a2a79';

let V = 0, R = 0;
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}

function cortar(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontré ' + nombre);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('sin cierre ' + nombre);
}

function mundo(src, ev) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: { display: '' }, innerHTML: '', textContent: '',
    classList: { add() {}, remove() {} }, querySelectorAll: () => [], setAttribute() {}, querySelector: () => null });
  els['d-result'] = el('d-result'); els['d-result'].style.display = 'none';
  const ctx = {
    cur: ev, selPkg: null, selZ: null, selH: null, selTransporte: null, selFechaIdx: 0, selViaj: 1, selBoleto: null,
    calc: 0,
    $$: el, document: { getElementById: el },
    window: {}, setTimeout: () => {}, getComputedStyle: (e) => e.style,
    isCDMX: (e) => !!e.__cdmx, trackMainEvent() {}, setWizProgress() {}, minP: () => 0,
    _esPreventaCiegas: () => false, txtTransporte: () => 'Transporte', guiaPintar() {}, scrollToTotal() {},
    buildFechaButtons() {}, buildZonaButtons() {}, actualizarMapaBtn() {}, currentZonasToShow: () => [],
    buildTransporteButtons() {}, loadDisponibilidad() {}, dispKey: () => '', evMusicQuery: () => '',
  };
  // calcular real en espíritu: con todo lo necesario, pinta el total.
  ctx.calcular = function () {
    ctx.calc++;
    const hasZona = ctx.selPkg !== 'ride' || (ctx.cur && ctx.cur.forceZona);
    if (hasZona && !ctx.selZ) return;
    if (!ctx.selH) return;
    if (ctx.isCDMX(ctx.cur) && !ctx.selTransporte) return;
    el('d-placeholder').style.display = 'none'; el('d-result').style.display = 'block';
  };
  // buildHotelButtons: pre-marca Compartida con un CLIC (selHotel), como el real.
  ctx.buildHotelButtons = function () {
    ctx.selH = null;
    vm.runInContext("selHotel(null,0,'Compartida')", ctx);
  };
  ctx.selHotel = function (b, e, n) {
    ctx.selH = { n, e }; ctx.selTransporte = null;
    if (ctx.isCDMX(ctx.cur)) { el('w-transport-card').style.display = 'block'; }
    else { el('w-transport-card').style.display = 'none'; ctx.calcular(); }
  };
  vm.createContext(ctx);
  vm.runInContext(cortar(src, 'selPaquete') + '\n' + cortar(src, 'selFecha'), ctx);
  return { ctx, el, visible: () => el('d-result').style.display !== 'none' };
}

const btn = { classList: { add() {}, remove() {} } };
function ride(src, ev, fecha) {
  const m = mundo(src, ev);
  vm.runInContext('selPaquete(__b,"ride")', Object.assign(m.ctx, { __b: btn }));
  if (fecha) vm.runInContext('selFecha(__b,0)', m.ctx);
  return m;
}

const HEAD = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const BASE = execSync('git -C "' + RAIZ + '" show ' + BASE_SHA + ':index.html', { maxBuffer: 64 << 20 }).toString();

const MTY = { id: 'juniorh', v: 'Estadio Mty' };
const MF = { id: 'fuerzaregida', v: 'Arena Monterrey', multifecha: [{ lbl: '11', zonas: [] }, { lbl: '12', zonas: [] }] };
const CDMX = { id: 'edc27', __cdmx: true };
const NOHOTEL_MF = { id: 'x', noHotel: true, multifecha: [{ lbl: 'a' }] };

console.log('══ mide-ride-callejon-1 ══');
console.log('\n[A] control positivo: el callejón SE REPRODUCE en BASE (' + BASE_SHA + ')');
af(!ride(BASE, MTY).visible(), 'BASE · RIDE MTY sin fecha: hotel pre-marcado y total ESCONDIDO');
af(!ride(BASE, MF, true).visible(), 'BASE · RIDE multifecha tras elegir fecha: total ESCONDIDO');

console.log('\n[B] HEAD: el total queda a la vista sin un clic más');
af(ride(HEAD, MTY).visible(), 'HEAD · RIDE MTY sin fecha → total visible');
const mf = ride(HEAD, MF, true);
af(mf.visible() && mf.ctx.selH && mf.ctx.selH.n === 'Compartida', 'HEAD · RIDE multifecha tras fecha → total visible con Compartida');
const mfAntes = ride(HEAD, MF, false);
af(!mfAntes.visible(), 'HEAD · RIDE multifecha ANTES de elegir fecha → sigue pidiendo la fecha (no se salta el paso)');
af(ride(HEAD, NOHOTEL_MF, true).visible(), 'HEAD · RIDE multifecha sin hotel → total visible tras la fecha');

console.log('\n[C] lo que NO debe cambiar');
const c = ride(HEAD, CDMX);
af(!c.visible() && c.el('w-transport-card').style.display === 'block', 'CDMX · RIDE: falta el transporte → total escondido y transporte a la vista');
['plus', 'stay', 'cheap'].forEach((p) => {
  const m = mundo(HEAD, MTY);
  vm.runInContext('selPaquete(__b,"' + p + '")', Object.assign(m.ctx, { __b: btn }));
  af(!m.visible(), p.toUpperCase() + ' MTY: sin zona elegida NO hay total (el paso de zona sigue mandando)');
});
const fz = ride(HEAD, Object.assign({}, MTY, { forceZona: true }));
af(!fz.visible(), 'RIDE con forceZona: sigue pidiendo la zona');

console.log('\n══ RESULTADO ══');
if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
process.exit(R ? 1 : 0);
