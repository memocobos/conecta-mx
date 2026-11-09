#!/usr/bin/env node
/* ===========================================================================
 * mide-req-2027-2 — REQ-2027-2 · la puerta 2027 se abre en Monterrey, POR NOMBRE
 *
 * Palabra de Memo (26-oct-2026): «haremos solo los de Monterrey» → «ábrelos».
 * Dos listas que no pueden divergir: REQUISICION_EVENTOS del index (abre el
 * formulario) y RESERVA_2027 del correo único (manda confirmación + Portal).
 *   [A] las dos listas son la MISMA (index = preventas + RESERVA_2027)
 *   [B] cada evento abierto, contra el catálogo REAL: existe, 2027+, NO CDMX,
 *       a la venta (no agotado/próximamente/pasado)
 *   [C] ningún CDMX 2027 fuera de los abiertos POR NOMBRE quedó abierto
 *   [D] el correo: abierto → sale al aprobar; CDMX 2027 → NO (aunque la fecha
 *       califique); captura manual → NO
 * ⚠️ SIN ANCLA a propósito (árbol de trabajo, como mide:req-2027-1).
 * ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let V = 0, R = 0;
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}

process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
const INDEX_HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
global.fetch = async (url) => {
  const u = String(url);
  const resp = (status, body) => ({ ok: status < 400, status, text: async () => body, json: async () => JSON.parse(body), headers: { get: () => null } });
  if (u.includes('/index.html') || /conectareynosa\.mx\/?$/.test(u)) return resp(200, INDEX_HTML);
  return resp(200, '[]');
};

(async () => {
  console.log('══ mide-req-2027-2 · la puerta 2027 (Monterrey, por nombre) ══');
  const m = INDEX_HTML.match(/var REQUISICION_EVENTOS=(\[[^\]]*\]);/);
  af(!!m, 'premisa: REQUISICION_EVENTOS se encuentra en el index');
  const lista = m ? vm.runInNewContext(m[1]) : [];
  const C = require(path.join(RAIZ, 'netlify/functions/_lib/correo-confirmacion.js'));
  const EV = await require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js')).fetchEventosRaw();
  const { esCDMX } = require(path.join(RAIZ, 'netlify/functions/_lib/precio-zona.js'));
  af(Array.isArray(EV) && EV.length > 50, 'premisa: catálogo REAL leído (' + (EV || []).length + ' eventos)');
  const by = (id) => EV.find((e) => e && e.id === id);

  console.log('\n[A] las dos listas son la misma');
  const esperado = C.EVENTOS_CORREO.concat(C.RESERVA_2027).sort();
  af(JSON.stringify(lista.slice().sort()) === JSON.stringify(esperado),
     'index = EVENTOS_CORREO + RESERVA_2027 (' + lista.length + ' = ' + esperado.length + ')');
  // 9 de REQ-2027-2 (27-oct) + pitbull (2-nov): nació en el catálogo el 28-oct,
  // DESPUÉS de la lista, y es MTY 2027 — la regla de Memo «solo los de Monterrey → ábrelos».
  // [VIVELATINO-VENTA-1 · 7-nov] + vivelatino: el PRIMER CDMX que abre (palabra de
  // Memo: «con formulario»). Su total nace SIN transporte y el vuelo se suma en
  // Capsule (✈️ Vuelo). Es una excepción CON NOMBRE: los demás CDMX siguen fuera.
  // [SEP-300-1 · 9-nov] + los 6 CDMX 2027 restantes (palabra de Memo: «abre cdmx
  // 2027»). La excepción «con nombre» de vivelatino se volvió la regla para
  // todos los CDMX 2027 a la venta; el que queda fuera (ozzfest) es próximamente.
  const CDMX_ABIERTOS = ['vivelatino', 'warning', 'hilary', 'edc27', 'u2', 'louist', 'niall'];
  af(C.RESERVA_2027.length === 17 && C.RESERVA_2027.includes('pitbull') && CDMX_ABIERTOS.every((id) => C.RESERVA_2027.includes(id)),
     'son los 9 que firmó Memo + pitbull (MTY 2027, caso María) + los 7 CDMX 2027 (vivelatino 7-nov · 6 más el 9-nov)');
  af(new Set(lista).size === lista.length, 'sin repetidos');

  console.log('\n[B] cada evento abierto, contra el catálogo real');
  CDMX_ABIERTOS.forEach((id) => {
    const e = by(id);
    // «a la venta» lo decide el PUBLISH de Esferas (el index del árbol puede traerlo aún próximamente)
    af(e && String(e.ds || '') >= '2027-01-01' && esCDMX(e), id + ' existe · 2027 · CDMX abierto por nombre (' + (e ? e.ds + ' st=' + (e.st || '-') : 'NO EXISTE') + ')');
  });
  C.RESERVA_2027.filter((id) => !CDMX_ABIERTOS.includes(id)).forEach((id) => {
    const e = by(id);
    af(e && String(e.ds || '') >= '2027-01-01' && !esCDMX(e) && !e.cheapOnly && !e.rideOnly
       && !['agotado', 'proceso', 'pronto', 'proximamente', 'solo-viaje'].includes(e.st),
       id + ' existe · 2027 · Monterrey · a la venta (' + (e ? e.ds + ' ' + (e.v || '') + ' st=' + (e.st || '-') : 'NO EXISTE') + ')');
  });

  console.log('\n[C] ningún OTRO CDMX 2027 abierto');
  const cdmx27 = EV.filter((e) => e && String(e.ds || '') >= '2027-01-01' && esCDMX(e) && !CDMX_ABIERTOS.includes(e.id));
  af(cdmx27.length > 0, 'control: el catálogo SÍ trae CDMX 2027 (' + cdmx27.map((e) => e.id).join(', ') + ')');
  af(cdmx27.every((e) => !lista.includes(e.id)), 'ninguno (fuera de los abiertos por nombre) está en la lista del index');
  af(CDMX_ABIERTOS.every((id) => lista.includes(id) && C.RESERVA_2027.includes(id)), 'los 7 CDMX abiertos SÍ están en las dos listas');

  console.log('\n[D] el correo único');
  af(await C.correoDebeSalir('juniorh', 'reserva'), 'juniorh al aprobar → SÍ sale');
  af(await C.correoDebeSalir('fuerzaregida#1', 'reserva'), 'fuerzaregida#1 (multifecha) al aprobar → SÍ sale');
  af(await C.correoDebeSalir('juniorh', 'abono'), 'juniorh captura manual → SÍ sale [CORREO-ABONO-2027, palabra de Memo 9-nov: «si manual tmb»]');
  const h = cdmx27[0];
  af(h && !(await C.correoDebeSalir(h.id, 'reserva')), '🔒 CDMX 2027 NO abierto (' + (h && h.id) + ') al aprobar → NO sale aunque su fecha califique');
  af(await C.correoDebeSalir('u2#1', 'reserva'), 'u2#1 (CDMX multifecha, abierto 9-nov) al aprobar → SÍ sale');
  af(await C.correoDebeSalir('louist', 'reserva'), 'louist (CDMX, abierto 9-nov) al aprobar → SÍ sale');
  af(await C.correoDebeSalir('vivelatino#2', 'reserva'), 'vivelatino#2 (2 días) al aprobar → SÍ sale');
  af(await C.correoDebeSalir('palnorte', 'pago'), 'regresión: palnorte sigue saliendo en todo');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();
