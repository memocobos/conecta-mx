#!/usr/bin/env node
// [TOTAL-BAJA-1 · 21-oct-2026] EL TOTAL DE UNA BAJA ES DE LA BAJA.
// El careo de hoy pisó el total de 4 bajas con la celda «Total» de su pestaña
// (soyluna×2, julionrodep×2: «saldo a favor» falso de hasta $1,500 c/u) — el
// hoyo que PREVENTA-DESCUENTO-1 nombró el 3-oct sin guarda. Esta la mide.
// Entra por carear() REAL con fixture de los DOS lados. ⚠️ SIN ANCLA (árbol).
'use strict';
const path = require('path');
const { carear } = require(path.join(__dirname, '..', 'netlify/functions/_lib/excel-careo.js'));

let ok = 0, ko = 0;
const af = (c, m) => { try { c = typeof c === 'function' ? c() : c; } catch (e) { c = false; m += ' · EXC: ' + e.message; } if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

// La persona del Excel: su fila (roja, cancelada) sigue en la pestaña con
// Total $650 — el dato REAL de David/Jacqueline del 21-oct.
const persona = { clave: 'david sandoval', nombre: 'David Sandoval', abonado: 0, total: 650, filas: 1, zona: 'Barrera', paquete: 'plus', zonas: { Barrera: 1 }, vuelo: null };
// El viajero BAJA en la base: boletos_crudo 0 + zona null, total YA fijado a
// lo cobrado ($2,150, regla CAREO-ZONA-1c). El respaldo `boletos` sube a 1 —
// fiel a leerBase, que es justo por lo que existe boletos_crudo.
const baja = { id: 'v1', nombre: 'David Sandoval', zona: null, paquete: 'plus', abonado: 2150, abonado_previo: 2150, total_contrato: 2150, notas: 'CANCELADA (fila roja del Excel)', boletos: 1, boletos_crudo: 0 };
// El gemelo VIVO (control positivo): misma diferencia, pero con boleto y zona.
const vivo = Object.assign({}, baja, { zona: 'Barrera', boletos: 1, boletos_crudo: 1 });

console.log('[A] la baja: su total NO se propone — se NOMBRA');
let m = carear([persona], [baja], { cdmx: false });
af((m.totales_contrato || []).length === 0, 'totales_contrato queda VACÍO: el careo no vuelve a pisar el saldo-0');
af((m.totales_baja || []).length === 1 && m.totales_baja[0].nombre === 'David Sandoval', 'y la fila sale NOMBRADA en totales_baja (no se calla)');
af(m.totales_baja[0].excel_total === 650 && m.totales_baja[0].sistema_total === 2150, 'con los DOS montos, para poder auditarla');

console.log('[B] control positivo: el VIVO con la misma diferencia SÍ se propone');
m = carear([persona], [vivo], { cdmx: false });
af((m.totales_contrato || []).length === 1 && m.totales_contrato[0].diferencia === 650 - 2150, 'el vivo entra a totales_contrato con su diferencia — la guarda distingue, no apaga el montón');
af((m.totales_baja || []).length === 0, 'y totales_baja queda vacío');

console.log('[C] la forma de la baja es LAS DOS mitades (boletos_crudo 0 Y zona null)');
m = carear([persona], [Object.assign({}, baja, { zona: 'Barrera' })], { cdmx: false });
af((m.totales_contrato || []).length === 1, 'boletos_crudo 0 con ZONA viva no es baja: se propone como siempre');

console.log('[D] TOTAL-BAJA-1b: el montón VIAJA en el plan (planear lo copia)');
// El 22-oct el montón existía en carear() y la pantalla no lo veía: planear no
// lo forwardeaba — un montón que no viaja se lee como «todo cuadra».
const { planear } = require(path.join(__dirname, '..', 'netlify/functions/_lib/excel-aplicar.js'));
const careo = { montones: carear([persona], [baja], { cdmx: false }), personas: [], viajeros: [] };
const plan = planear(careo, {});
af(Array.isArray(plan.totales_baja) && plan.totales_baja.length === 1 && plan.totales_baja[0].nombre === 'David Sandoval',
   'plan.totales_baja trae la fila nombrada — el preview y la pantalla la pueden enseñar');
af((plan.totales || []).length === 0, 'y plan.totales sigue SIN la baja: nombrar no es aplicar');

console.log((ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
process.exit(ko ? 1 : 0);
