#!/usr/bin/env node
// [LIBRO-SOLO-1 · 24-oct-2026] DOS COMPRAS DEL LIBRO SON DOS VENTAS — también
// para quien vive SOLO en el libro.
// El caso real: Marian (Stray Kids), 2 filas de $9,600 en Numerología y sin
// fila en la pestaña. `__libroManda` nacía apagada en la entrada creada desde
// el libro, así que la 2ª fila «reemplazaba» a la 1ª como si fuera reflejo de
// pestaña: el careo leía $9,600 con filas:2 y proponía encoger su contrato de
// $19,200 a $9,600. Entra por fundirNumerologia REAL. ⚠️ SIN ANCLA (árbol).
'use strict';
const path = require('path');
const { fundirNumerologia } = require(path.join(__dirname, '..', 'netlify/functions/_lib/numerologia.js'));

let ok = 0, ko = 0;
const af = (c, m) => { try { c = typeof c === 'function' ? c() : c; } catch (e) { c = false; m += ' · EXC: ' + e.message; } if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

const fila = (extra) => Object.assign({ clave: 'marian alejandra mora', nombre: 'Marian Alejandra Mora',
  abonado: 9600, boletos: 1, zona: 'Platino B', costo_publico: 9600, roja: false }, extra || {});
const cheap = new Map([['marian alejandra mora', ['cheap']]]);
const marian = (lista) => lista.find((p) => /marian/i.test(p.nombre));

console.log('[A] SOLO-LIBRO con dos compras: el dinero y el contrato SUMAN');
let m = marian(fundirNumerologia([], [fila(), fila()], cheap));
af(m.abonado === 19200, `abonado $${m.abonado} = las DOS filas (el defecto dejaba $9,600: la 2ª «reemplazaba» a la 1ª)`);
af(m.total === 19200, `total $${m.total} = la suma de los Costo al Publico (el defecto dejaba el de la 1ª y el careo encogía el contrato)`);
af(m.filas === 2 && m.abonado_libro === 19200, 'filas 2 y abonado_libro con la suma — la procedencia dice la verdad');

console.log('[B] en las DOS fuentes nada cambió: la 1ª fila del libro REEMPLAZA el reflejo y la pestaña conserva su total');
m = marian(fundirNumerologia([{ clave: 'marian alejandra mora', nombre: 'Marian Alejandra Mora', abonado: 2000, total: 19200, paquete: 'cheap', filas: 1 }], [fila(), fila()], cheap));
af(m.abonado === 19200 && m.abonado_pestana === 2000, 'abonado = libro ($19,200) y el reflejo de pestaña ($2,000) guardado con nombre');
af(m.total === 19200, 'el total de la PESTAÑA queda INTACTO (ley de CUADRE-FUENTE-1) — aquí no se suma nada');

console.log('[C] el hueco sigue mandando: una fila sin Costo al Publico vuelve el total null');
m = marian(fundirNumerologia([], [fila(), fila({ costo_publico: null })], cheap));
af(m.abonado === 19200 && m.total === null, 'el dinero suma pero el total es null — una suma parcial rotulada de total mentiría');
m = marian(fundirNumerologia([], [fila({ costo_publico: null }), fila()], cheap));
af(m.total === null, 'y en el orden inverso también (la 1ª sin costo no se «cura» con la 2ª)');

console.log('[D] la fila ROJA del libro sigue sin sumar (compra cancelada no es dinero que cobrar)');
m = marian(fundirNumerologia([], [fila(), fila({ roja: true })], cheap));
af(m.abonado === 9600 && m.total === 9600, 'la roja no suma dinero ni contrato: queda la compra viva sola');

console.log((ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
process.exit(ko ? 1 : 0);
