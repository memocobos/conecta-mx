#!/usr/bin/env node
// =============================================================================
// scripts/mide-sorteo-rondas.js — CAREO de SORTEO-RONDAS-1
// =============================================================================
// PARTE A (este archivo, por ahora): lógica pura y handlers REALES sobre el
// árbol vivo. PARTE B (tarea 17): la página SERVIDA en el navegador, con DOS
// COMMITS FIJOS y el control positivo del PR entero.
//
// 🔒 EL RELOJ VA CONGELADO. Todo lo que este careo mide depende del reloj: un
// arnés que lee Date.now() a pelo mide OTRA corrida cada vez que se corre.
//
// 🔒 VA VERSIONADO EN scripts/, NO COMO `CAREO-*`. El .gitignore se come
// `CAREO-*` (y en macOS también `careo-*`), así que un arnés ahí vive en UNA
// máquina, nada lo corre y nada nota su ausencia: ése fue el vigilante de KH-4
// que nunca cazó nada porque NUNCA EXISTIÓ.
// =============================================================================

const path = require('path');
const RAIZ = path.join(__dirname, '..');
let ok = 0, mal = 0; const fallos = [];

// 🔒 Una aserción que TRUENA se cuenta como rojo CON NOMBRE. Un arnés que se
// cae deja las secciones de abajo sin ejercitar y esconde qué candado falló.
const af = (fn, e) => {
  let c = false;
  try { c = (typeof fn === 'function') ? fn() : fn; }
  catch (x) { fallos.push(e + '  → TRONÓ: ' + x.message); mal++; return; }
  if (c) ok++; else { mal++; fallos.push(e); }
};

const TI = require(path.join(RAIZ, 'sorteo-tiempos.js'));

// ═══ [1] LOS TIEMPOS Y LA ESCALERA POR N ════════════════════════════════════
console.log('\n── [1] los tiempos y la escalera por N ──');

// Los diez N del encargo, tal como los pidió Memo.
const ESPERADO = {
  1: [1], 2: [1], 3: [3, 1], 5: [3, 1], 11: [6, 3, 1],
  12: [12, 6, 3, 1], 23: [12, 6, 3, 1], 24: [24, 12, 6, 3, 1],
  25: [24, 12, 6, 3, 1], 300: [24, 12, 6, 3, 1],
};
Object.keys(ESPERADO).forEach((k) => {
  const n = Number(k), esp = ESPERADO[k];
  af(() => JSON.stringify(TI.escalonesPara(n)) === JSON.stringify(esp),
     `escalonesPara(${n}) dio ${JSON.stringify(TI.escalonesPara(n))}, se esperaba ${JSON.stringify(esp)}`);
});
af(() => JSON.stringify(TI.escalonesPara(0)) === '[]', 'escalonesPara(0) debe ser []');

// 🔒 CADA RONDA ES SUBCONJUNTO DE LA ANTERIOR, ya en los TAMAÑOS: estrictamente
// decreciente y terminando en 1. Sin esto una escalera como [6,6,1] pasaría.
[1, 2, 3, 5, 11, 12, 23, 24, 25, 300].forEach((n) => {
  const e = TI.escalonesPara(n);
  af(() => e[e.length - 1] === 1, `escalonesPara(${n}) no termina en 1`);
  af(() => e.every((x, i) => i === 0 || x < e[i - 1]), `escalonesPara(${n}) no es decreciente`);
  af(() => e[0] <= Math.max(n, 1), `escalonesPara(${n}) arranca en ${e[0]}, más que los ${n} que hay`);
});

// Los momentos: los del acta, al milisegundo.
const M24 = TI.momentos([24, 12, 6, 3, 1]);
af(() => JSON.stringify(M24) === JSON.stringify([0, 18700, 46700, 74700, 116700]),
   'momentos([24,12,6,3,1]) dio ' + JSON.stringify(M24));
af(() => JSON.stringify(TI.momentos([1])) === JSON.stringify([2700]),
   'momentos([1]) dio ' + JSON.stringify(TI.momentos([1])) + ' — el caso degenerado NO libera en 0');
af(() => JSON.stringify(TI.momentos([3, 1])) === JSON.stringify([0, 32700]),
   'momentos([3,1]) dio ' + JSON.stringify(TI.momentos([3, 1])));
af(() => JSON.stringify(TI.momentos([6, 3, 1])) === JSON.stringify([0, 18700, 60700]),
   'momentos([6,3,1]) dio ' + JSON.stringify(TI.momentos([6, 3, 1])));
af(() => JSON.stringify(TI.momentos([12, 6, 3, 1])) === JSON.stringify([0, 18700, 46700, 88700]),
   'momentos([12,6,3,1]) dio ' + JSON.stringify(TI.momentos([12, 6, 3, 1])));
af(() => JSON.stringify(TI.momentos([])) === '[]', 'momentos([]) debe ser []');

// El show completo cae entre 2 y 3 minutos: es lo que Memo pidió.
const dur = TI.duracionTotal([24, 12, 6, 3, 1]);
console.log('    duración con escalera de 24: ' + (dur / 1000).toFixed(1) + ' s');
af(() => dur >= 120000 && dur <= 180000, 'la escalera completa dura ' + dur + ' ms, fuera de los 2–3 min');
af(() => TI.duracionTotal([1]) === 17900, 'duracionTotal([1]) dio ' + TI.duracionTotal([1]));
af(() => TI.duracionTotal([]) === 0, 'duracionTotal([]) debe ser 0');

// 🔒 LOS MOMENTOS SON ESTRICTAMENTE CRECIENTES. Dos rondas en el mismo instante
// harían que la página se saltara una.
[[24, 12, 6, 3, 1], [12, 6, 3, 1], [6, 3, 1], [3, 1], [1]].forEach((e) => {
  const m = TI.momentos(e);
  af(() => m.length === e.length, 'momentos(' + e + ') no trae un momento por escalón');
  af(() => m.every((x, i) => i === 0 || x > m[i - 1]), 'momentos(' + e + ') no es creciente');
});

// La liberación se adelanta el margen, y nunca es negativa.
const L24 = TI.liberaciones([24, 12, 6, 3, 1]);
af(() => L24[0] === 0, 'la primera liberación debe ser 0, dio ' + L24[0]);
af(() => L24[4] === 116700 - TI.T.MARGEN_ADELANTO_MS,
   '🔴 el GANADOR se libera en ' + L24[4] + ', se esperaba ' + (116700 - TI.T.MARGEN_ADELANTO_MS));
af(() => L24.every((x) => x >= 0), 'ninguna liberación puede ser negativa');
// Y el ganador NO puede salir al principio: es todo el punto del ajuste (b).
af(() => L24[4] > 100000, '🔴 el ganador se libera en ' + L24[4] + ' ms — eso es un spoiler');

// La forma del objeto: si alguien le quita un campo, el gemelo del navegador
// dejaría de cuadrar y esto lo dice antes.
['V', 'CUENTA_321_MS', 'PRESENTAR_MS', 'RONDA_REDOBLE_MS', 'RONDA_APAGADO_MS',
 'RONDA_REACOMODO_MS', 'RONDA_MS', 'SUSPENSO_MS', 'GIRO_FINAL_MS', 'REVELACION_MS',
 'MARGEN_ADELANTO_MS', 'LATIDO_MS'].forEach((c) => {
  af(() => typeof TI.T[c] === 'number', 'falta la constante ' + c + ' en TIEMPOS.T');
});
af(() => TI.T.RONDA_MS === TI.T.RONDA_REDOBLE_MS + TI.T.RONDA_APAGADO_MS + TI.T.RONDA_REACOMODO_MS,
   'RONDA_MS no es la suma de sus tres partes');

console.log('\n──────────────────────────────────────────────');
console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' en verde, ' + mal + ' en rojo');
fallos.forEach((f) => console.log('  · ' + f));
process.exit(mal ? 1 : 0);
