#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// mide:plan-fijo-1 — el rol de pagos FIJO desde el separo (PLAN-FIJO-1, 4-nov).
//
// Caso real: Sahid (FR 11-ene, STAY $4,200, separó $300 el 29-oct). El Portal
// recalculaba su plan cada día desde «hoy»: el 3-nov veía 4 pagos de $975 y el
// 4-nov 3 pagos de $1,300. Palabra de Memo: el calendario es FIJO desde el
// separo; un pago no hecho sale VENCIDO y se suma aparte; si cambia el total,
// mismas fechas y nuevo monto en lo que falta.
//
//   [A] el plan de Sahid es el mismo el 3, el 4 y el 20 de noviembre — y el
//       control: el cálculo viejo (planDelViaje desde hoy) SÍ cambia de 4 a 3.
//   [B] lo pagado llena las cuotas EN ORDEN; lo no pagado sale vencido.
//   [C] re-repartir (espejo JS del trigger de la base) — careado contra lo que
//       el trigger REAL contestó en la base (prueba en tabla temporal, 4-nov).
//   [D] la tarjeta del Portal pinta vencido / pagado / «estamos preparando».
//   [E] el cableo: Portal y Capsule leen el rol fijo; nadie arma quincenas desde hoy.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const PF = require(path.join(RAIZ, 'netlify/functions/_lib/plan-fijo.js'));
const PP = require(path.join(RAIZ, 'netlify/functions/_lib/plan-pagos.js'));

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = typeof c === 'function' ? !!c() : !!c; } catch (_) { ok = false; }
  const msg = typeof m === 'function' ? (() => { try { return m(); } catch (e) { return '(msg) ' + e.message; } })() : m;
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } };
const dia = (s) => new Date(s + 'T18:00:00Z'); // mediodía en Reynosa

console.log('[A] el rol de Sahid no se mueve');
const sahid = PF.armarPlanFijo({ separo_fecha: '2026-10-29', separo_monto: 300, total: 4200, paquete: 'stay', ds: '2027-01-11' });
af(!sahid.error && sahid.cuotas.length === 4 && sahid.cuotas.every((c) => c.monto === 975), () => '4 pagos de $975 desde su separo: ' + JSON.stringify(sahid.cuotas.map((c) => c.monto)));
af(sahid.cuotas[0].lbl === '9 al 16 de Noviembre' && sahid.cuotas[3].lbl === '24 Diciembre al 1 de Enero', 'del 9-16 nov al 24 dic-1 ene (las quincenas de siempre)');
const vista = (d, abonado) => PF.estadoPlan(sahid, { total: 4200, abonado: abonado == null ? 300 : abonado, ahora: dia(d) });
const m3 = vista('2026-11-03').cuotas.map((c) => c.monto).join(',');
const m4 = vista('2026-11-04').cuotas.map((c) => c.monto).join(',');
const m20 = vista('2026-11-20').cuotas.map((c) => c.monto).join(',');
af(m3 === '975,975,975,975' && m3 === m4 && m4 === m20, () => 'mismos montos el 3, 4 y 20 de nov: ' + [m3, m4, m20].join(' | '));
// Control positivo: el cálculo VIEJO sí brincaba (el defecto reproducido).
const v3 = PP.planDelViaje({ total: 4200, abonado: 300, ds: '2027-01-11', paquete: 'stay', ahora: dia('2026-11-03') });
const v4 = PP.planDelViaje({ total: 4200, abonado: 300, ds: '2027-01-11', paquete: 'stay', ahora: dia('2026-11-04') });
af(v3.cuotas.length === 4 && v4.cuotas.length === 3 && v4.cuotas[0].monto === 1300, () => 'CONTROL: el cálculo desde hoy SÍ cambiaba 4×$975 → 3×$1,300 (' + v3.cuotas.length + '→' + v4.cuotas.length + ')');

console.log('[B] lo pagado llena en orden; lo no pagado sale vencido');
const b1 = vista('2026-11-17', 300);
af(b1.cuotas[0].estado === 'vencida' && b1.atrasado === 975 && b1.cuotas.slice(1).every((c) => c.monto === 975), () => 'no pagó el 9-16 nov → VENCIDO $975 y los demás siguen en $975: ' + JSON.stringify({ a: b1.atrasado, e: b1.cuotas.map((c) => c.estado) }));
af(b1.proxima && b1.proxima.n === 2 && b1.proxima.monto === 975, 'el próximo pago es el 2 ($975); lo vencido va aparte');
const b2 = vista('2026-11-17', 1275);
af(b2.cuotas[0].estado === 'pagada' && b2.atrasado === 0, 'pagó $975 → pago 1 pagado, sin atraso');
const b3 = vista('2026-11-10', 2000);
af(b3.cuotas[0].estado === 'pagada' && b3.cuotas[1].estado === 'parcial' && b3.cuotas[1].pagado === 725 && b3.proxima.monto === 250, () => 'abonó de más → se aplica al siguiente EN ORDEN (pago 2 lleva $725, le faltan $250): ' + JSON.stringify(b3.proxima));
const b4 = vista('2026-11-10', 4200);
af(b4.estado === 'liquidado', 'pagó todo → liquidado');
const sinT = PF.estadoPlan(sahid, { total: 0, abonado: 300 });
af(sinT.estado === 'sin_total', 'sin total no se inventa nada');

console.log('[C] re-repartir cuando cambia el total (espejo del trigger)');
const fixT = { separo_monto: 300, evento_ds: '2027-01-11', cuotas: [
  { n: 1, lbl: 'A', ini: '2026-11-01', fin: '2026-11-03', monto: 975 }, { n: 2, lbl: 'B', ini: '2026-11-24', fin: '2026-12-01', monto: 975 },
  { n: 3, lbl: 'C', ini: '2026-12-09', fin: '2026-12-16', monto: 975 }, { n: 4, lbl: 'D', ini: '2026-12-24', fin: '2027-01-01', monto: 975 }],
  ventanas: [{ lbl: 'A', ini: '2026-11-01', fin: '2026-11-03' }, { lbl: 'B', ini: '2026-11-24', fin: '2026-12-01' }, { lbl: 'C', ini: '2026-12-09', fin: '2026-12-16' }, { lbl: 'D', ini: '2026-12-24', fin: '2027-01-01' }] };
const rr = PF.rerepartir(fixT, { total: 4600, paquete: 'stay', ahora: dia('2026-11-04') });
// Lo que el trigger REAL contestó en la base (tabla temporal, 4-nov-2026):
// {"montos":[975,1109,1109,1107],"aj":1,"tb":4600}
af(rr.cuotas.map((c) => c.monto).join(',') === '975,1109,1109,1107' && rr.total_base === 4600, () => 'JS = trigger de la base: ' + rr.cuotas.map((c) => c.monto).join(','));
af(rr.cuotas.map((c) => c.ini).join(',') === fixT.cuotas.map((c) => c.ini).join(','), 'MISMAS fechas; solo cambia el monto de las que faltan');
// Preventa: total = separo → cuotas en $0; al elegir paquete se reparte en lo que queda.
const pv = PF.armarPlanFijo({ separo_fecha: '2026-10-14', separo_monto: 300, total: 300, paquete: 'cheap', ds: '2027-03-26' });
af(pv.cuotas.length === 4 && pv.cuotas.every((c) => c.monto === 0) && pv.ventanas.length === 10, 'preventa: 4 cuotas en $0 y las 10 ventanas guardadas');
af(PF.estadoPlan(pv, { total: 300, abonado: 300 }).estado === 'liquidado', 'y se ve liquidada (no «Pago 1 $0»)');
const pv2 = PF.rerepartir(pv, { total: 6300, paquete: 'plus', ahora: dia('2026-12-01') });
af(pv2.cuotas.length > 0 && pv2.cuotas.every((c) => c.ini > '2026-12-01') && pv2.cuotas.reduce((a, c) => a + c.monto, 0) === 6000, () => 'elige PLUS $6,300 el 1-dic → los $6,000 en las ventanas que quedan: ' + pv2.cuotas.length + ' pagos');
const sql = fs.readFileSync(path.join(RAIZ, 'migraciones/PLAN-FIJO-1.sql'), 'utf8');
af(/before update of total_contrato, tipo_paquete/.test(sql) && /America\/Matamoros/.test(sql) && /'monto'\)::numeric, 0\) > 0/.test(sql), 'el trigger vive en la base (lo corren TODOS los escritores), en hora de Reynosa, y salta las cuotas de $0');

console.log('[D] la tarjeta del Portal');
const ph = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
const i0 = ph.indexOf('function _migPagosHtml(t){'), i1 = ph.indexOf('function _migGrupoHtml(t){');
const ctx = { escapeHtml: (s) => String(s == null ? '' : s).replace(/</g, '&lt;') };
vm.createContext(ctx); vm.runInContext(ph.slice(i0, i1), ctx);
const pinta = (plan) => vm.runInContext('_migPagosHtml', ctx)({ viajero_id: 'v1', total: 4200, abonado: 300, abonado_previo: 0, abonos: [], plan, banco: 'bbva' });
const h1 = pinta(b1);
af(/Vencido/.test(h1) && /pagos vencidos/.test(h1) && /\$975/.test(h1), 'pinta el pago VENCIDO y el aviso del atraso');
af(/fijo desde tu separo \(29 oct\)/.test(h1), 'dice que su calendario es fijo desde su separo');
const h2 = pinta(b3);
af(/✓ Pagado/.test(h2) && /abonado \$725/.test(h2), 'pinta lo pagado y lo parcial');
const h3 = pinta({ estado: 'sin_plan_fijo', resta: 3900, cuotas: [] });
af(/Estamos preparando tu calendario/.test(h3) && !/Pago 1/.test(h3), 'sin plan fijo NO inventa calendario: «Estamos preparando…»');

console.log('[E] el cableo');
const sc = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const portalFn = sc('netlify/functions/portal-mi-plan-migrado.js');
af(/PF\.estadoPlan\(v\.plan_pagos/.test(portalFn) && !/planDelViaje\(/.test(portalFn), 'el Portal lee el rol fijo y ya NO arma el plan desde hoy');
const coordi = sc('netlify/functions/admin-coordi-asignaciones.js');
const pv0 = coordi.indexOf("accion === 'plan_viajero'"), pv1 = coordi.indexOf("accion === 'plan_fijar'");
af(pv0 > 0 && pv1 > 0 && /PF\.estadoPlan/.test(coordi.slice(pv0, pv1)) && !/planDelViaje\(/.test(coordi.slice(pv0, pv1)), 'el 🗓 Plan de Capsule lee el MISMO rol fijo');
af(/plan_fijar: ROLES_EDITA_VIAJERO/.test(coordi), 'plan_fijar está en ACCIONES (o el portero lo rechaza)');
const req = sc('netlify/functions/admin-requisiciones.js');
af(/PF\.fijarEnBase/.test(req) && /diaReynosa\(req\.creado_en\)/.test(req), 'al aprobar una requisición el rol nace fijo desde el día de su separo');
const pvj = sc('netlify/functions/portal-viajero.js');
af(/PF\.fijarEnBase/.test(pvj), 'el reparto a acompañantes reparte también el rol (mismas fechas)');

console.log('\n' + (V === 0 ? 'NADA MEDIDO · esto NO es un verde' : (R ? '🔴 ROJO' : '✅ VERDE')) + ' · ' + V + ' en verde, ' + R + ' en rojo');
process.exit(R || !V ? 1 : 0);
