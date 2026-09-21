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

// 🔒 UN ARNÉS QUE SE CAE NO REPORTA. `af()` atrapa lo que truena DENTRO de una
// aserción, pero las líneas de PREPARACIÓN están fuera: una excepción ahí
// tumbaba el archivo entero y los bloques de abajo se quedaban sin ejercitar,
// enseñando solo un stack. Este guardián imprime el marcador SIEMPRE y dice en
// voz alta que la corrida quedó incompleta — así una caída no se puede leer
// como «no había nada más que medir».
let completo = false;
function marcador() {
  console.log('\n──────────────────────────────────────────────');
  if (!completo) {
    console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  }
  console.log((mal === 0 && completo ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
}
process.on('exit', function (codigo) { if (!completo) marcador(); });

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

// ═══ [2] LA REVOLTURA: UNA SOLA, Y LAS RONDAS SON PREFIJOS ══════════════════
const ESC = require(path.join(RAIZ, 'netlify/functions/_lib/sorteo-escalera.js'));

console.log('\n── [2] la revoltura: una sola, y las rondas son prefijos ──');

// 66 ids SINTÉTICOS: el TAMAÑO del padrón real, no sus datos. Un careo
// versionado no carga el padrón de nadie, y la distribución no necesita
// nombres — las FORMAS duras de los nombres se miden aparte, en [4].
const PADRON = [];
for (let i = 1; i <= 66; i++) PADRON.push({ id: 'r' + i, nombre: 'Nombre' + i + ' Apellido' + i, folio: i });

const esc66 = TI.escalonesPara(66);
af(() => JSON.stringify(esc66) === JSON.stringify([24, 12, 6, 3, 1]), 'con 66 la escalera es la completa');

// ── La forma de lo que se guarda ────────────────────────────────────────────
const e1 = ESC.construirEscalera(PADRON, esc66);
af(() => e1 && e1.v === 1, 'la escalera trae versión');
af(() => JSON.stringify(e1.escalones) === JSON.stringify(esc66), 'guarda los escalones que le dieron');
af(() => e1.orden.length === 24,
   '🔒 `orden` guarda SOLO el primer escalón (24), dio ' + (e1.orden && e1.orden.length));
af(() => e1.orden.every((r) => r.id && r.nombre && r.folio),
   'cada entrada de `orden` trae id, nombre (foto del momento) y folio');
af(() => new Set(e1.orden.map((r) => r.id)).size === 24, 'sin repetidos en `orden`');
af(() => e1.orden.every((r) => Object.keys(r).length === 3),
   '🔒 `orden` NO guarda un solo dato de más — lo que no se guarda no se puede filtrar');
af(() => ESC.construirEscalera([], []) === null, 'sin participantes no hay escalera');
af(() => ESC.construirEscalera(PADRON, []) === null, 'sin escalones no hay escalera');

// ── 🔒 CADA RONDA ⊆ LA ANTERIOR, y el ganador en TODAS ─────────────────────
// Sale de la construcción (son prefijos de la misma lista), y se afirma igual:
// una propiedad que sale de la construcción se rompe el día que alguien toca
// la construcción, y entonces nadie se enteraría.
for (let rep = 0; rep < 200; rep++) {
  const e = ESC.construirEscalera(PADRON, esc66);
  const rondas = e.escalones.map((k) => e.orden.slice(0, k).map((r) => r.id));
  const ganador = rondas[rondas.length - 1][0];
  af(() => rondas.every((r, i) => i === 0 || r.every((x) => rondas[i - 1].indexOf(x) !== -1)),
     'una ronda no es subconjunto de la anterior');
  af(() => rondas.every((r) => r.indexOf(ganador) !== -1), 'el ganador falta en alguna ronda');
  af(() => rondas[rondas.length - 1].length === 1, 'la última ronda no tiene exactamente 1');
}

// ── 🔒 DISTRIBUCIÓN: nadie con ventaja por orden de registro ────────────────
function chi2(cuentas, esperado) {
  return cuentas.reduce((s, c) => s + Math.pow(c - esperado, 2) / esperado, 0);
}
const CORRIDAS = 20000;
const ganadas = new Array(66).fill(0);
const enRonda1 = new Array(66).fill(0);
for (let i = 0; i < CORRIDAS; i++) {
  const e = ESC.construirEscalera(PADRON, esc66);
  ganadas[e.orden[0].folio - 1]++;
  e.orden.forEach((r) => { enRonda1[r.folio - 1]++; });
}
const espG = CORRIDAS / 66, x2g = chi2(ganadas, espG);
console.log('    ganar: esperado ' + espG.toFixed(1) + ' · min ' + Math.min.apply(null, ganadas)
          + ' · max ' + Math.max.apply(null, ganadas) + ' · χ² ' + x2g.toFixed(1) + ' (gl 65)');
// χ² con 65 grados de libertad: el crítico a p=0.001 ronda 113. 130 es holgado
// a propósito — esta aserción tiene que cazar un SESGO, no el ruido normal.
af(() => x2g < 130, '🔴 la frecuencia de ganar NO es plana: χ² ' + x2g.toFixed(1) + ' con gl 65');
// Y el sesgo que más importa: el del ORDEN DE REGISTRO.
const pri = ganadas.slice(0, 10).reduce((a, b) => a + b, 0);
const ult = ganadas.slice(-10).reduce((a, b) => a + b, 0);
// 🔒 LA DESVIACIÓN ES LA DE LA DIFERENCIA, no la de un grupo. Mi primer
// umbral usaba σ de UN grupo de 10 y pasaba a 2.9σ — un umbral inventado que
// da verde por poco es la forma en que un arnés se vuelve caprichoso. En una
// multinomial, con A y B disjuntos de 10 celdas cada uno:
//   Var(A−B) = n·pA(1−pA) + n·pB(1−pB) + 2·n·pA·pB
const pAB = 10 / 66;
const sdDif = Math.sqrt(2 * CORRIDAS * pAB * (1 - pAB) + 2 * CORRIDAS * pAB * pAB);
console.log('    primeros 10 en registrarse: ' + pri + ' · últimos 10: ' + ult
          + ' · diferencia ' + Math.abs(pri - ult) + ' · σ(dif) ' + sdDif.toFixed(1)
          + ' → ' + (Math.abs(pri - ult) / sdDif).toFixed(2) + 'σ');
af(() => Math.abs(pri - ult) < 4 * sdDif,
   '🔴 los primeros en registrarse ganan distinto que los últimos: ' + pri + ' vs ' + ult
   + ' (' + (Math.abs(pri - ult) / sdDif).toFixed(2) + 'σ)');
// Aparecer en la ronda 1 también es uniforme: con 66, cada uno sale 24/66.
const x2r = chi2(enRonda1, CORRIDAS * 24 / 66);
af(() => x2r < 130, '🔴 aparecer en la primera ronda NO es uniforme: χ² ' + x2r.toFixed(1));

// ── 🔒 EL CONTROL POSITIVO DE LA DISTRIBUCIÓN ──────────────────────────────
// Sin esto, el verde de arriba no distingue «es uniforme» de «mi χ² está roto».
// Un azar SESGADO a propósito: devuelve casi siempre 0, así que Fisher–Yates
// deja la lista casi como entró y los primeros folios ganan de más.
const azarSesgado = (n) => (Math.random() < 0.85 ? 0 : ESC.alAzar(n));
const gSesgo = new Array(66).fill(0);
for (let i = 0; i < 4000; i++) {
  const e = ESC.construirEscalera(PADRON, esc66, azarSesgado);
  gSesgo[e.orden[0].folio - 1]++;
}
const x2s = chi2(gSesgo, 4000 / 66);
console.log('    control positivo (azar sesgado): χ² ' + x2s.toFixed(1) + ' — DEBE ser enorme');
af(() => x2s > 300, '🔴 CONTROL POSITIVO EN ROJO: el careo NO caza un azar sesgado (χ² ' + x2s.toFixed(1) + ')');

// ── `alAzar` sin sesgo por módulo, y dentro de rango ───────────────────────
af(() => ESC.alAzar(0) === -1, 'alAzar(0) devuelve -1, como el de hoy');
let fuera = 0;
for (let i = 0; i < 5000; i++) { const x = ESC.alAzar(7); if (!(x >= 0 && x < 7)) fuera++; }
af(() => fuera === 0, 'alAzar(7) se salió de rango ' + fuera + ' veces');

// `revolver` no muta la entrada: el padrón que llega es el que se lee después
// para contar, y mutarlo dejaría al llamador con otra lista.
const antes = PADRON.map((r) => r.id).join(',');
ESC.revolver(PADRON);
af(() => PADRON.map((r) => r.id).join(',') === antes, '🔒 revolver() MUTÓ el arreglo que le dieron');
af(() => ESC.revolver([]).length === 0, 'revolver([]) no truena');

// ═══ [3] LA CADENA DE RE-GIROS: 3 → 6 → 12 → 24 → RESTO ═════════════════════
console.log('\n── [3] la cadena de re-giros: 3 → 6 → 12 → 24 → resto ──');

// Una escalera FIJA (sin azar) para poder razonar sobre quién queda: los folios
// 1..24 en ese orden de revoltura, o sea ganador = r1.
const ordenFijo = [];
for (let i = 1; i <= 24; i++) ordenFijo.push({ id: 'r' + i, nombre: 'N' + i + ' A' + i, folio: i });
const RF = { v: 1, escalones: [24, 12, 6, 3, 1], orden: ordenFijo };

// El ganador (r1) no contestó → el pozo son los OTROS DOS de la ronda de 3.
let q = new Set(['r1']);
let pz = ESC.pozoDeReGiro(RF, q, PADRON);
af(() => pz.escalon === 3, 'tras quemar al ganador el escalón debe ser 3, dio ' + pz.escalon);
af(() => pz.pozo.length === 2 && pz.pozo.every((r) => ['r2', 'r3'].indexOf(r.id) !== -1),
   'el pozo debe ser r2 y r3, dio ' + pz.pozo.map((r) => r.id).join(','));

// Esos dos tampoco → los TRES que quedaban de la ronda de 6.
pz = ESC.pozoDeReGiro(RF, new Set(['r1', 'r2', 'r3']), PADRON);
af(() => pz.escalon === 6, 'debe subir al escalón 6, dio ' + pz.escalon);
af(() => pz.pozo.length === 3 && pz.pozo.every((r) => ['r4', 'r5', 'r6'].indexOf(r.id) !== -1),
   'el pozo debe ser r4..r6, dio ' + pz.pozo.map((r) => r.id).join(','));

// Los seis → los SEIS que quedaban de la de 12.
q = new Set(); for (let i = 1; i <= 6; i++) q.add('r' + i);
pz = ESC.pozoDeReGiro(RF, q, PADRON);
af(() => pz.escalon === 12 && pz.pozo.length === 6,
   'debe subir al 12 con 6 en el pozo, dio ' + pz.escalon + '/' + pz.pozo.length);

// Los doce → los DOCE que quedaban de la de 24.
q = new Set(); for (let i = 1; i <= 12; i++) q.add('r' + i);
pz = ESC.pozoDeReGiro(RF, q, PADRON);
af(() => pz.escalon === 24 && pz.pozo.length === 12,
   'debe subir al 24 con 12 en el pozo, dio ' + pz.escalon + '/' + pz.pozo.length);

// Los 24 → el RESTO del padrón vivo (los 42 que nunca salieron en pantalla).
q = new Set(); for (let i = 1; i <= 24; i++) q.add('r' + i);
pz = ESC.pozoDeReGiro(RF, q, PADRON);
af(() => pz.escalon === 0, 'agotada la escalera el escalón es 0 (el resto), dio ' + pz.escalon);
af(() => pz.pozo.length === 42, 'el resto son 42, dio ' + pz.pozo.length);
af(() => pz.pozo.every((r) => !q.has(r.id)), 'el resto no puede traer a un quemado');

// Todos quemados → nadie. El llamador contesta 409, como hoy.
pz = ESC.pozoDeReGiro(RF, new Set(PADRON.map((r) => r.id)), PADRON);
af(() => pz.escalon === null && pz.pozo.length === 0, 'con todos quemados: escalon null y pozo vacío');

// 🔒 EL POZO NUNCA SE SALTA UN ESCALÓN CON GENTE. Si r2 sigue sin quemar, el
// pozo NO puede ser el de 6 — subir de más metería a alguien que la mecánica ya
// había eliminado EN PANTALLA, y eso es cambiar el sorteo a media transmisión.
pz = ESC.pozoDeReGiro(RF, new Set(['r1', 'r3']), PADRON);
af(() => pz.escalon === 3 && pz.pozo.length === 1 && pz.pozo[0].id === 'r2',
   '🔴 con r2 vivo el pozo TIENE que ser el escalón 3 y solo r2, dio escalón ' + pz.escalon
   + ' con ' + pz.pozo.map((r) => r.id).join(','));

// Escalera corta: con [3,1] el primer re-giro ya es el escalón 3, y agotado cae
// directo al resto.
const RC = { v: 1, escalones: [3, 1], orden: ordenFijo.slice(0, 3) };
af(() => ESC.pozoDeReGiro(RC, new Set(['r1']), PADRON).escalon === 3, 'con [3,1] el primer re-giro es escalón 3');
af(() => ESC.pozoDeReGiro(RC, new Set(['r1', 'r2', 'r3']), PADRON).escalon === 0, 'con [3,1] agotado cae al resto');

// Giro directo: con [1] no hay escalones intermedios, todo re-giro es el resto.
const RD = { v: 1, escalones: [1], orden: ordenFijo.slice(0, 1) };
af(() => ESC.pozoDeReGiro(RD, new Set(['r1']), PADRON).escalon === 0, 'con [1] el re-giro es el resto');

// Sin escalera y sin padrón: no truena, contesta «nadie».
af(() => ESC.pozoDeReGiro(null, new Set(), []).escalon === null, 'sin escalera ni padrón: escalon null');
af(() => ESC.pozoDeReGiro(RF, null, PADRON).escalon === 3, 'sin Set de quemados no truena');

completo = true;
marcador();
process.exit(mal ? 1 : 0);
