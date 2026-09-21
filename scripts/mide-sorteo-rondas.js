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

// ⚠️ ANTES DE REQUERIR CUALQUIER LIB: `_lib/giveaway` lee las env vars AL
// CARGARSE. Puestas después, `faltaEnv()` detiene al handler ANTES de las
// guardas que este careo quiere medir, y el rojo sería del entorno y no del
// código — seis aserciones en rojo diciendo «no llevó la escalera» cuando lo
// que faltaba era una variable. Ya mordió aquí mismo.
// `tokenAdminValido` rehúsa TODO si el token está vacío (sin token configurado
// nada es válido, que es la postura correcta), así que también va arriba.
process.env.PORTAL_SUPABASE_URL = 'https://careo.sb';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'k';
process.env.GIVEAWAY_ADMIN_TOKEN = 'tok';

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

// ═══ [4] LA PROYECCIÓN PÚBLICA: GATEO, FOLIO Y NOMBRES CORTOS ═══════════════
console.log('\n── [4] la proyección pública: gateo, folio y nombres cortos ──');

// ── Las FORMAS duras del padrón REAL (las que ya están escritas en
// giveaway-estado.js). Formas reales, no ejemplos míos: los ejemplos inventados
// comparten mis sesgos, y el padrón real delató una regla que 8 ejemplos míos
// habrían aprobado.
[
  ['Juan Pérez',                          'Juan',                 'Pérez',           'Juan P.',                 'JP'],
  ['Juan Del Ángel Pérez',                'Juan',                 'Del Ángel Pérez', 'Juan D.',                 'JD'],
  ['Jorge Monserrath Lopez de Leon',      'Jorge Monserrath',     'Lopez de Leon',   'Jorge Monserrath L.',     'JL'],
  ['María de los Angeles Izaguirre Cruz', 'María de los Angeles', 'Izaguirre Cruz',  'María de los Angeles I.', 'MI'],
  ['Ana',                                 'Ana',                  '',                'Ana',                     'A'],
].forEach((c) => {
  const pr = ESC.partirNombre(c[0]);
  af(() => pr && pr.nombre === c[1] && pr.apellido === c[2],
     'partirNombre("' + c[0] + '") dio ' + JSON.stringify(pr));
  af(() => ESC.nombreCorto(c[0]) === c[3],
     'nombreCorto("' + c[0] + '") dio "' + ESC.nombreCorto(c[0]) + '", se esperaba "' + c[3] + '"');
  af(() => ESC.iniciales(c[0]) === c[4],
     'iniciales("' + c[0] + '") dio "' + ESC.iniciales(c[0]) + '", se esperaba "' + c[4] + '"');
});
af(() => ESC.partirNombre('') === null, 'partirNombre("") es null');
af(() => ESC.nombreCorto('') === '', 'nombreCorto("") es cadena vacía, no truena');
af(() => ESC.iniciales('') === '', 'iniciales("") es cadena vacía');

// ── EL FOLIO: una sola definición, y CUENTA A LOS ELIMINADOS ───────────────
const fol = ESC.folios([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
af(() => fol.a === 1 && fol.b === 2 && fol.c === 3, 'folios() numera desde 1 en orden de llegada');
af(() => Object.keys(ESC.folios(null)).length === 0, 'folios(null) no truena');

// ── EL GATEO, con el reloj como PARÁMETRO ──────────────────────────────────
const MOM = TI.momentos([24, 12, 6, 3, 1]);      // [0, 18700, 46700, 74700, 116700]
const MAR = TI.T.MARGEN_ADELANTO_MS;             // 2000
const proj = (t, foto) => ESC.proyectarRondas({
  rondas: RF, momentos: MOM, margenMs: MAR, transcurridoMs: t,
  fotoDeId: foto || (() => null),
});

// Los seis instantes del acta.
[[0, 1, false], [13000, 1, false], [30000, 2, false],
 [60000, 3, false], [95000, 4, false], [200000, 5, true]].forEach((c) => {
  const r = proj(c[0]);
  af(() => r.rondas.length === c[1],
     '🔴 en t=' + c[0] + ' ms se publicaron ' + r.rondas.length + ' rondas, se esperaban ' + c[1]);
  af(() => r.ganador_liberado === c[2],
     '🔴 en t=' + c[0] + ' ms ganador_liberado=' + r.ganador_liberado + ', se esperaba ' + c[2]);
  af(() => r.rondas_totales === 5, 'rondas_totales debe ser 5 siempre, dio ' + r.rondas_totales);
});

// 🔴 EL SPOILER, DICHO COMO ASERCIÓN. Se mide sobre el JSON COMPLETO
// serializado, no campo por campo: un campo nuevo que alguien agregue mañana
// también cae aquí.
[0, 13000, 30000, 60000, 95000].forEach((t) => {
  const r = proj(t);
  const crudo = JSON.stringify(r);
  af(() => r.rondas.every((x) => x.tam >= 3),
     '🔴 en t=' + t + ' salió una ronda de menos de 3: eso SEÑALA al ganador');
  af(() => crudo.indexOf('"id"') === -1,
     '🔒 la proyección NO puede llevar el id del registro (t=' + t + ')');
  af(() => !/whatsapp|correo|instagram|foto_path|descarte|nombre"/i.test(crudo),
     '🔒 dato privado o nombre completo en la proyección (t=' + t + ')');
});
const r95 = proj(95000);
af(() => r95.rondas.length === 4 && r95.rondas[3].tam === 3,
   'en t=95 s la última ronda publicada debe ser la de 3');
af(() => r95.rondas.every((x) => x.tam !== 1),
   '🔴 EL GANADOR VIAJÓ ANTES DEL GIRO FINAL — es el mínimo no negociable');

// `siguiente_ronda_en_ms`: para que la página programe un latido dirigido.
af(() => proj(0).siguiente_ronda_en_ms === 16700,
   'en t=0 la siguiente ronda es en 16700, dio ' + proj(0).siguiente_ronda_en_ms);
af(() => proj(13000).siguiente_ronda_en_ms === 3700,
   'en t=13000 falta 3700, dio ' + proj(13000).siguiente_ronda_en_ms);
af(() => proj(200000).siguiente_ronda_en_ms === null,
   'con todo publicado, siguiente_ronda_en_ms es null');

// ── 🔒 ORDEN POR FOLIO, NUNCA POR REVOLTURA ────────────────────────────────
// `RF.orden` tiene los folios 1..24 EN ESE MISMO ORDEN, así que ahí los dos
// órdenes coinciden y la aserción no diría nada. Se usa una escalera con la
// revoltura AL REVÉS: si la proyección conservara el orden de revoltura, los
// folios saldrían 24,23,22…
const ordenRev = [];
for (let i = 24; i >= 1; i--) ordenRev.push({ id: 'r' + i, nombre: 'N' + i + ' A' + i, folio: i });
const RREV = { v: 1, escalones: [24, 12, 6, 3, 1], orden: ordenRev };
const pRev = ESC.proyectarRondas({ rondas: RREV, momentos: MOM, margenMs: MAR,
                                   transcurridoMs: 200000, fotoDeId: () => null });
pRev.rondas.forEach((x) => {
  const folios = x.miembros.map((m) => m.folio);
  af(() => folios.every((f, i) => i === 0 || f > folios[i - 1]),
     '🔴 la ronda ' + x.i + ' NO viene ordenada por folio: ' + folios.join(','));
});
af(() => pRev.rondas[0].miembros[0].folio === 1,
   '🔴 con la revoltura al revés el primero por folio sigue siendo el 1 — si dice 24, se está publicando el orden de la revoltura');
// 🔒 Y `orden` NO se mutó: es la columna que se guardó.
af(() => RREV.orden[0].folio === 24, '🔒 proyectarRondas MUTÓ el `orden` que le dieron');

// ── 🔒 LA POSICIÓN DEL GANADOR EN EL MOSAICO ES UNIFORME ───────────────────
// Ordenar por folio hace que el rango del ganador entre los 24 sea uniforme.
// Sin esta aserción, «el ganador no es siempre la primera tarjeta» se cumpliría
// con una distribución cargada al principio, que es igual de delatora.
const POSN = 12000;
const posG = new Array(24).fill(0);
for (let i = 0; i < POSN; i++) {
  const e = ESC.construirEscalera(PADRON, esc66);
  const p1 = ESC.proyectarRondas({ rondas: e, momentos: MOM, margenMs: MAR,
                                   transcurridoMs: 0, fotoDeId: () => null });
  posG[p1.rondas[0].miembros.findIndex((m) => m.folio === e.orden[0].folio)]++;
}
const x2p = chi2(posG, POSN / 24);
console.log('    posición del ganador en el mosaico: χ² ' + x2p.toFixed(1) + ' (gl 23) · min '
          + Math.min.apply(null, posG) + ' · max ' + Math.max.apply(null, posG));
// χ² con 23 gl: el crítico a p=0.001 ronda 49.7. 70 es holgado a propósito.
af(() => x2p < 70, '🔴 la posición del ganador en el mosaico NO es uniforme: χ² ' + x2p.toFixed(1));
af(() => posG.every((c) => c > 0), 'alguna posición del mosaico nunca tocó al ganador');
// Control positivo: si se ordenara por revoltura, el ganador SIEMPRE sería el 0.
const posSesgo = new Array(24).fill(0);
for (let i = 0; i < 600; i++) {
  const e = ESC.construirEscalera(PADRON, esc66);
  posSesgo[e.orden.findIndex((m) => m.folio === e.orden[0].folio)]++;   // orden de REVOLTURA
}
af(() => chi2(posSesgo, 600 / 24) > 300,
   '🔴 CONTROL POSITIVO EN ROJO: el careo no distingue el orden de revoltura del orden por folio');

// ── Las fotos: solo las que el llamador declara aprobadas ─────────────────
const conFoto = ESC.proyectarRondas({
  rondas: RF, momentos: MOM, margenMs: MAR, transcurridoMs: 200000,
  fotoDeId: (id) => (Number(String(id).slice(1)) % 2 === 0 ? 'https://firmada/' + id : null),
});
const m0 = conFoto.rondas[0].miembros;
af(() => m0.filter((m) => m.foto).length === 12,
   'deben salir 12 fotos de 24, dio ' + m0.filter((m) => m.foto).length);
af(() => m0.every((m) => m.foto || m.ini), '🔒 sin foto aprobada SIEMPRE hay iniciales — nunca una tarjeta muda');
af(() => m0.filter((m) => m.folio % 2).every((m) => m.foto === null),
   '🔒 una foto NO aprobada salió en público');
// 🔒 Se re-declara en CADA ronda: así un «invalidar» a media transmisión llega
// a quien ya está mirando (el apretón tiene que poder viajar).
af(() => conFoto.rondas.every((x) => x.miembros.every((m) => 'foto' in m)),
   '🔒 alguna ronda no re-declara `foto`: el apretón posterior no llegaría');

// ── Escaleras cortas y el caso degenerado ─────────────────────────────────
const M31 = TI.momentos([3, 1]);
const P31 = { v: 1, escalones: [3, 1], orden: ordenFijo.slice(0, 3) };
af(() => ESC.proyectarRondas({ rondas: P31, momentos: M31, margenMs: MAR, transcurridoMs: 0, fotoDeId: () => null }).rondas.length === 1,
   'con [3,1] en t=0 sale solo la ronda de 3');
af(() => ESC.proyectarRondas({ rondas: P31, momentos: M31, margenMs: MAR, transcurridoMs: 40000, fotoDeId: () => null }).ganador_liberado === true,
   'con [3,1] en t=40 s el ganador ya salió');
// 🔴 EL CASO DEGENERADO: con [1] el único escalón ES el ganador, así que en
// t=0 NO puede salir nada. Es lo que la fórmula de momentos() protege.
const M1 = TI.momentos([1]);
const P1 = { v: 1, escalones: [1], orden: ordenFijo.slice(0, 1) };
af(() => ESC.proyectarRondas({ rondas: P1, momentos: M1, margenMs: MAR, transcurridoMs: 0, fotoDeId: () => null }).rondas.length === 0,
   '🔴 con [1] en t=0 NO puede salir el ganador');
af(() => ESC.proyectarRondas({ rondas: P1, momentos: M1, margenMs: MAR, transcurridoMs: 1000, fotoDeId: () => null }).ganador_liberado === true,
   'con [1] en t=1 s (tras CUENTA_321−MARGEN=700) ya salió');
// Sin escalera: no truena y no inventa.
af(() => ESC.proyectarRondas({ rondas: null, momentos: [], margenMs: MAR, transcurridoMs: 9e9 }).rondas.length === 0,
   'sin escalera la proyección va vacía');
af(() => ESC.proyectarRondas({}).ganador_liberado === false, 'sin nada, ganador_liberado es false');

// ── `resultadoPublico`: los dos descartes se ven IGUAL ────────────────────
af(() => ESC.resultadoPublico('pendiente',   true) === 'pendiente',  'pendiente → pendiente');
af(() => ESC.resultadoPublico('acepto',      true) === 'acepto',     'acepto → acepto');
af(() => ESC.resultadoPublico('no_contesto', true) === 'se_regira',  'no_contesto → se_regira');
af(() => ESC.resultadoPublico('no_cumple',   true) === 'se_regira',  '🔴 no_cumple → se_regira');
// 🔒 Con el ganador SIN revelar, todo dice `pendiente`: si Memo pica un botón a
// media animación, la puerta pública no puede anunciar que ya se resolvió.
['pendiente', 'acepto', 'no_contesto', 'no_cumple'].forEach((rr) => {
  af(() => ESC.resultadoPublico(rr, false) === 'pendiente',
     '🔴 con el ganador sin revelar, "' + rr + '" debe salir como pendiente');
});
// 🔒 La palabra `cumple` no puede salir por la puerta pública NUNCA.
af(() => ['pendiente', 'acepto', 'no_contesto', 'no_cumple']
      .every((rr) => ESC.resultadoPublico(rr, true).indexOf('cumple') === -1),
   '🔒 la cadena "cumple" se filtró al valor público');

// ═══ [5] EL SLUG DE ENSAYO: DOS VALORES, JAMÁS UN SLUG DEL CUERPO ═══════════
console.log('\n── [5] el slug de ensayo ──');
const G = require(path.join(RAIZ, 'netlify/functions/_lib/giveaway.js'));
af(() => G.SLUG_ENSAYO === 'karolg-bbva-2026-ensayo', 'el slug de ensayo dio ' + G.SLUG_ENSAYO);
// 🔴 MINÚSCULAS: el regex de `foto_url` es ^[a-z0-9-]+\/… — con mayúsculas las
// fotos del ensayo saldrían EN BLANCO sin decir por qué, que es el peor modo
// de falla: el que se ve como «ya quedó».
af(() => /^[a-z0-9-]+$/.test(G.SLUG_ENSAYO),
   '🔴 el slug de ensayo no pasa ^[a-z0-9-]+$ — las fotos saldrían en blanco');
af(() => G.SLUG_ENSAYO !== G.SLUG, 'el slug de ensayo no puede ser el real');
// Ausente, vacío, null y 'real' son todos «el sorteo real»: un `body.modo` que
// no vino es el caso normal, no un error.
af(() => G.slugDe() === G.SLUG && G.slugDe('') === G.SLUG
      && G.slugDe(null) === G.SLUG && G.slugDe('real') === G.SLUG,
   'ausente, vacío, null y "real" dan el slug real');
af(() => G.slugDe('ensayo') === G.SLUG_ENSAYO, '"ensayo" da el slug de ensayo');
// 🔒 CUALQUIER OTRA COSA SE REHÚSA. Éste es el candado del «buzón abierto a
// cualquier slug inventado» que el propio lib advierte en su cabecera.
[G.SLUG, 'otro', 'ENSAYO', 'ensayo ', ' ensayo', '../x', 0, 1, {}, [], true].forEach((m) => {
  af(() => G.slugDe(m) === null,
     '🔒 slugDe(' + JSON.stringify(m) + ') debió ser null, dio ' + G.slugDe(m));
});
af(() => G.esEnsayo('ensayo') === true && G.esEnsayo() === false
      && G.esEnsayo('real') === false && G.esEnsayo('otro') === false, 'esEnsayo');

// ═══════════════════════════════════════════════════════════════════════════
// EL ARNÉS DE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════
// 🔒 HANDLER REAL, con el salto simulado UN NIVEL MÁS ADENTRO (global.fetch).
// Un mock por ruta salta al portero: tres tuercas llegaron ROTAS a producción
// con el careo en verde por eso mismo (RAD-FIX-CAMINO, #625).
//
// 🔒 Y EL MOCK HONRA LOS FILTROS DE POSTGREST — incluido el `select`. Uno que
// ignore `eliminado_at=is.null` devolvería al eliminado y el careo diría «la
// tómbola lo excluye» sobre un código que no excluye nada: falsifica hacia el
// lado cómodo.
let REG = [], SOR = [], PATCHES = [], INSERTS = [], URLS = [], BORRADOS = [];

function proyectar(u, filas) {
  const mSel = /select=([^&]+)/.exec(u);
  if (!mSel) return filas.map((r) => Object.assign({}, r));
  const cols = decodeURIComponent(mSel[1]).split(',').map((x) => x.trim());
  return filas.map((r) => {
    const o = {};
    cols.forEach((c) => { if (c in r) o[c] = r[c]; });
    return o;
  });
}
function filtrarReg(u, filas) {
  let out = filas.slice();
  const mSlug = /slug=eq\.([^&]+)/.exec(u);
  if (mSlug) out = out.filter((r) => r.slug === decodeURIComponent(mSlug[1]));
  if (/eliminado_at=is\.null/.test(u))       out = out.filter((r) => !r.eliminado_at);
  if (/foto_estado=neq\.invalidada/.test(u)) out = out.filter((r) => r.foto_estado !== 'invalidada');
  const mEst = /foto_estado=eq\.([^&]+)/.exec(u);
  if (mEst) out = out.filter((r) => (r.foto_estado || 'pendiente') === decodeURIComponent(mEst[1]));
  const mId = /[?&]id=eq\.([^&]+)/.exec(u);
  if (mId) out = out.filter((r) => r.id === decodeURIComponent(mId[1]));
  const mIn = /[?&]id=in\.\(([^)]*)\)/.exec(u);
  if (mIn) { const set = new Set(decodeURIComponent(mIn[1]).split(',')); out = out.filter((r) => set.has(String(r.id))); }
  if (/consuelo_at=is\.null/.test(u))        out = out.filter((r) => !r.consuelo_at);
  if (/order=creado_at\.asc/.test(u))        out.sort((a, b) => String(a.creado_at).localeCompare(String(b.creado_at)));
  return out;
}
function filtrarSor(u, filas) {
  let out = filas.slice();
  const mSlug = /slug=eq\.([^&]+)/.exec(u);
  if (mSlug) out = out.filter((r) => r.slug === decodeURIComponent(mSlug[1]));
  const mRes = /resultado=eq\.([^&]+)/.exec(u);
  if (mRes) out = out.filter((r) => r.resultado === decodeURIComponent(mRes[1]));
  if (/registro_id=not\.is\.null/.test(u)) out = out.filter((r) => r.registro_id != null);
  const mId = /[?&]id=eq\.([^&]+)/.exec(u);
  if (mId) out = out.filter((r) => String(r.id) === decodeURIComponent(mId[1]));
  if (/order=intento\.desc/.test(u)) out.sort((a, b) => Number(b.intento) - Number(a.intento));
  else if (/order=intento\.asc/.test(u)) out.sort((a, b) => Number(a.intento) - Number(b.intento));
  const mLim = /limit=(\d+)/.exec(u);
  if (mLim) out = out.slice(0, Number(mLim[1]));
  return out;
}

global.fetch = async (url, opts) => {
  const u = String(url), m = (opts && opts.method) || 'GET';
  URLS.push({ m, u, body: (opts && opts.body) || '' });
  const J = (v, st) => ({ ok: (st || 200) < 300, status: st || 200,
                          json: async () => v, text: async () => JSON.stringify(v),
                          arrayBuffer: async () => Buffer.from('fotofalsa') });
  if (/giveaway_registros/.test(u)) {
    if (m === 'PATCH') {
      const cambios = JSON.parse(opts.body || '{}');
      const tocadas = filtrarReg(u, REG);
      PATCHES.push({ tabla: 'registros', u, cambios, n: tocadas.length });
      tocadas.forEach((r) => Object.assign(r, cambios));
      return J(tocadas.map((r) => ({ id: r.id, eliminado_motivo: r.eliminado_motivo, foto_estado: r.foto_estado })));
    }
    if (m === 'POST') {
      const f = JSON.parse(opts.body || '{}');
      const arr = Array.isArray(f) ? f : [f];
      arr.forEach((x, i) => { const fila = Object.assign({ id: 'nuevo' + (REG.length + i + 1) }, x); REG.push(fila); INSERTS.push(fila); });
      return J(arr, 201);
    }
    if (m === 'DELETE') {
      const fuera = filtrarReg(u, REG);
      BORRADOS.push({ tabla: 'registros', u, n: fuera.length });
      const ids = new Set(fuera.map((r) => r.id));
      REG = REG.filter((r) => !ids.has(r.id));
      return J([]);
    }
    return J(proyectar(u, filtrarReg(u, REG)));
  }
  if (/giveaway_sorteos/.test(u)) {
    if (m === 'POST') {
      const f = JSON.parse(opts.body || '{}');
      // 🔒 EL ÚNICO DE (slug, intento) SE SIMULA: es el candado de la carrera, y
      // un mock que lo ignore dejaría pasar dos filas con el mismo intento —
      // exactamente lo que el índice existe para impedir.
      if (SOR.some((x) => x.slug === f.slug && Number(x.intento) === Number(f.intento))) {
        return J({ code: '23505', message: 'duplicate key value violates unique constraint "giveaway_sorteos_slug_intento_uniq"' }, 409);
      }
      // 🔒 EL ID TIENE FORMA DE UUID, y no es cosmética: `resolver` valida
      // `^[0-9a-f-]{36}$` y con ids tipo 's1' RECHAZABA con 400 todas las
      // llamadas de preparación del careo — en silencio, dejando seis
      // aserciones en rojo por la razón equivocada. Un mock que no respeta la
      // forma del dato real mide otra cosa.
      const nId = String(SOR.length + 1).padStart(12, '0');
      const fila = Object.assign({ id: '00000000-0000-4000-8000-' + nId,
                                   creado_at: new Date().toISOString() }, f);
      SOR.push(fila); INSERTS.push(fila);
      return J([fila], 201);
    }
    if (m === 'PATCH') {
      const cambios = JSON.parse(opts.body || '{}');
      const tocadas = filtrarSor(u, SOR);
      PATCHES.push({ tabla: 'sorteos', u, cambios, n: tocadas.length });
      tocadas.forEach((x) => Object.assign(x, cambios));
      return J(tocadas.map((x) => Object.assign({}, x)));
    }
    if (m === 'DELETE') {
      const fuera = filtrarSor(u, SOR);
      BORRADOS.push({ tabla: 'sorteos', u, n: fuera.length });
      const ids = new Set(fuera.map((x) => x.id));
      SOR = SOR.filter((x) => !ids.has(x.id));
      return J([]);
    }
    return J(proyectar(u, filtrarSor(u, SOR)));
  }
  if (/storage\/v1\/object\/sign/.test(u)) {
    const cuerpo = JSON.parse((opts && opts.body) || '{}');
    if (Array.isArray(cuerpo.paths)) {
      return J(cuerpo.paths.map((x) => ({ path: x, signedURL: '/object/sign/' + x + '?token=x' })));
    }
    return J({ signedURL: '/object/sign/x?token=x' });
  }
  if (/storage\/v1\/object\/list/.test(u)) return J([]);
  if (/storage\/v1\/object\//.test(u)) return J({}, m === 'DELETE' ? 200 : 200);
  return J([]);
};

const sortear = require(path.join(RAIZ, 'netlify/functions/giveaway-sortear.js')).handler;
const evP = (body, tok) => ({ httpMethod: 'POST',
  headers: Object.assign({ origin: 'https://conectareynosa.mx' },
                         tok === false ? {} : { 'x-admin-token': tok || 'tok' }),
  body: JSON.stringify(body) });
const llamar = async (body, tok) => {
  PATCHES = []; INSERTS = []; URLS = []; BORRADOS = [];
  const r = await sortear(evP(body, tok));
  let d = {}; try { d = JSON.parse(r.body || '{}'); } catch (_) {}
  return { code: r.statusCode, d, crudo: r.body || '' };
};

// Un padrón de prueba con las FORMAS duras dentro, y dos fuera de la tómbola.
const NOMBRES_DUROS = ['Juan Pérez', 'Juan Del Ángel Pérez', 'Jorge Monserrath Lopez de Leon',
                       'María de los Angeles Izaguirre Cruz', 'Ana'];
function sembrarPadron() {
  REG = []; SOR = [];
  for (let i = 1; i <= 30; i++) {
    REG.push({ id: 'r' + i, slug: G.SLUG, nombre: NOMBRES_DUROS[i % 5],
               ciudad: (i % 3) ? 'Reynosa' : 'Monterrey',
               whatsapp: '89900000' + (i < 10 ? '0' + i : i), correo: 'x' + i + '@x.mx',
               instagram: 'ig' + i, foto_path: G.SLUG + '/aaaaaaaaaaaa/f' + i + '.jpg',
               foto_estado: (i % 2) ? 'aprobada' : 'pendiente',
               creado_at: '2026-09-' + (i < 10 ? '0' + i : i) + 'T10:00:00Z',
               eliminado_at: null, consuelo_at: null });
  }
  REG[28].eliminado_at = '2026-09-29T10:00:00Z';   // r29 eliminado
  REG[29].foto_estado = 'invalidada';              // r30 con foto invalidada
}
function sembrarGiro(res, intento, extra) {
  return Object.assign({ id: '00000000-0000-4000-8000-00000000000' + intento,
    slug: G.SLUG, intento, resultado: res, registro_id: 'r' + intento,
    ganador_nombre: NOMBRES_DUROS[intento % 5], ganador_whatsapp: '8990000001',
    total_participantes: 28, creado_at: '2026-10-01T21:00:0' + intento + 'Z' }, extra || {});
}

// ═══════════════════════════════════════════════════════════════════════════
// De aquí abajo todo toca handlers, o sea `await`. En CommonJS el await de
// nivel superior no existe, así que va en una IIFE asíncrona — igual que los
// otros careos de la casa. El `.catch` del final cuenta una caída como ROJO
// con nombre, no como silencio.
// ═══════════════════════════════════════════════════════════════════════════
(async () => {

// ═══ [7] GIRAR: LA ESCALERA, EL RE-GIRO Y EL SORTEO CERRADO ═════════════════
console.log('\n── [7] girar: la escalera, el re-giro y el sorteo cerrado ──');
sembrarPadron();

let g1 = await llamar({ accion: 'girar' });
af(() => g1.code === 200 && g1.d.ok,
   'el primer giro debe salir 200, dio ' + g1.code + ' ' + JSON.stringify(g1.d).slice(0, 140));
// 🔒 LOS DOS FILTROS SIGUEN EN LA CONSULTA: 30 registros, 28 elegibles.
af(() => g1.d.total_participantes === 28,
   '🔒 elegibles debe ser 28 (fuera el eliminado y la foto invalidada), dio ' + g1.d.total_participantes);
af(() => g1.d.intento === 1 && g1.d.es_regiro === false, 'el primer giro es intento 1 y no es re-giro');
af(() => g1.d.escalon === null, 'el primer giro no sale de ningún escalón, dio ' + g1.d.escalon);
// Y la consulta de elegibles llevaba los dos candados, medido sobre la URL real.
af(() => URLS.some((x) => /eliminado_at=is\.null/.test(x.u) && /foto_estado=neq\.invalidada/.test(x.u)),
   '🔒 la consulta de elegibles perdió uno de los dos filtros');

// La escalera se GUARDÓ en el MISMO insert, y con la forma buena.
const fila1 = SOR[0];
af(() => !!fila1.rondas, '🔴 el insert del giro NO llevó la escalera');
af(() => JSON.stringify(fila1.rondas.escalones) === JSON.stringify([24, 12, 6, 3, 1]),
   'con 28 elegibles la escalera es la completa, dio ' + JSON.stringify(fila1.rondas.escalones));
af(() => fila1.rondas.orden.length === 24, '`orden` debe traer 24, dio ' + fila1.rondas.orden.length);
af(() => String(fila1.rondas.orden[0].id) === String(fila1.registro_id),
   '🔒 orden[0] TIENE que ser el ganador de la fila: si no, el show anima hacia otro');
af(() => fila1.rondas.orden.every((r) => r.folio >= 1 && r.folio <= 30),
   'los folios salen del orden de registro de TODOS (incluidos los eliminados)');
af(() => fila1.rondas.orden.every((r) => Object.keys(r).length === 3),
   '🔒 la escalera guardada no lleva un dato de más');
af(() => fila1.rondas.orden.every((r) => r.id !== 'r29' && r.id !== 'r30'),
   '🔴 un NO-elegible entró a la escalera');
// 🔒 Y el insert fue UNO: la escalera no se escribe aparte.
af(() => INSERTS.length === 1, 'el giro debe ser UN solo insert, hubo ' + INSERTS.length);

// ── LA CADENA DE RE-GIROS ───────────────────────────────────────────────────
await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'no_contesto' });
let g2 = await llamar({ accion: 'girar' });
af(() => g2.code === 200 && g2.d.intento === 2 && g2.d.es_regiro === true,
   'el re-giro es intento 2 y se declara re-giro, dio ' + g2.code + '/' + g2.d.intento);
af(() => g2.d.escalon === 3, '🔴 el primer re-giro sale del escalón 3, dio ' + g2.d.escalon);
af(() => !SOR[1].rondas, '🔒 un re-giro NO tiene escalera propia: la hereda');
af(() => SOR[1].origen_sorteo_id === SOR[0].id, 'el re-giro apunta al giro que tiene la escalera');
const tres = SOR[0].rondas.orden.slice(0, 3).map((r) => String(r.id));
af(() => tres.indexOf(String(SOR[1].registro_id)) !== -1 && SOR[1].registro_id !== SOR[0].registro_id,
   '🔴 el re-giro tiene que salir de los OTROS DOS de la ronda de 3');

// 🔒 UN ELIMINADO DESPUÉS DEL GIRO TAMBIÉN ESTÁ QUEMADO. Si no, el pozo podría
// devolver a alguien que ya no está en el padrón: el insert reventaría por
// `ganador_whatsapp` nulo — o peor, saldría EN CÁMARA alguien ya eliminado.
await llamar({ accion: 'resolver', sorteo_id: SOR[1].id, resultado: 'no_cumple', motivo: 'no_sigue' });
const sobra = tres.filter((x) => x !== String(SOR[0].registro_id) && x !== String(SOR[1].registro_id))[0];
REG.find((r) => r.id === sobra).eliminado_at = '2026-09-30T10:00:00Z';
let g3 = await llamar({ accion: 'girar' });
af(() => g3.code === 200, 'el tercer giro sale 200 aunque el que quedaba fue eliminado, dio ' + g3.code + ' ' + g3.d.error);
af(() => g3.d.escalon === 6,
   '🔴 con el último de los 3 eliminado debe SUBIR al escalón 6, dio ' + g3.d.escalon);
af(() => String(SOR[2].registro_id) !== sobra, '🔴 el pozo devolvió al eliminado');

// ── 🔴 EL SORTEO CERRADO ────────────────────────────────────────────────────
// CONTROL POSITIVO PRIMERO: con un pendiente vivo, girar SÍ inserta.
await llamar({ accion: 'resolver', sorteo_id: SOR[2].id, resultado: 'no_contesto' });
const nCtrl = SOR.length;
const gCtrl = await llamar({ accion: 'girar' });
af(() => gCtrl.code === 200 && SOR.length === nCtrl + 1 && INSERTS.length === 1,
   '🔒 CONTROL POSITIVO: antes del acepto, girar SÍ inserta (dio ' + gCtrl.code + ', ' + INSERTS.length + ' inserts)');
// Ahora sí: el acepto CIERRA el sorteo.
await llamar({ accion: 'resolver', sorteo_id: SOR[SOR.length - 1].id, resultado: 'acepto' });
const nAntes = SOR.length;
const gCerrado = await llamar({ accion: 'girar' });
af(() => gCerrado.code === 409, '🔴 con un `acepto` vivo girar debe dar 409, dio ' + gCerrado.code);
af(() => /ganador confirmado|cerrado/i.test(String(gCerrado.d.error || '')),
   'el mensaje debe decir que el sorteo está cerrado, dijo: ' + gCerrado.d.error);
af(() => INSERTS.length === 0, '🔴 CERO FILAS NUEVAS: el mock registró ' + INSERTS.length + ' inserts');
af(() => SOR.length === nAntes, '🔴 la tabla creció tras un giro rehusado');
// Y no se molestó ni en revolver: no firmó, no escribió nada.
af(() => PATCHES.length === 0, 'un giro rehusado no puede haber hecho un PATCH');

// ── LA CARRERA DEL `intento` ────────────────────────────────────────────────
// 🔒 SE SIMULA LA CARRERA DE VERDAD: `girar` calcula `intento = filas + 1`, así
// que para que choque, la tabla tiene que traer YA una fila con ESE intento.
// Con UNA fila que dice intento 2, girar calcula 2 y el único muerde.
//
// ⚠️ Mi primera versión dejaba DOS filas (intentos 1 y 2), girar calculaba 3 y
// no colisionaba nada: el careo pasaba en verde sin ejercitar el candado. Un
// escenario que no alcanza la condición no mide, aunque se vea razonable.
sembrarPadron();
await llamar({ accion: 'girar' });
const escaleraCar = SOR[0].rondas;
SOR = [{ id: '00000000-0000-4000-8000-0000000000ff', slug: G.SLUG, intento: 2,
         resultado: 'no_contesto', registro_id: String(escaleraCar.orden[0].id),
         ganador_nombre: 'X', ganador_whatsapp: '1', rondas: escaleraCar,
         total_participantes: 28, creado_at: '2026-10-01T21:00:00Z' }];
const gCar = await llamar({ accion: 'girar' });
af(() => gCar.code === 409 && /girando|intenta/i.test(String(gCar.d.error || '')),
   '🔒 un 23505 del único (slug,intento) se contesta «ya se está girando», dio '
   + gCar.code + ' ' + gCar.d.error);
af(() => INSERTS.length === 0, 'tras el 23505 no puede quedar una fila nueva');

// ── SIN PARTICIPANTES, Y CON LA ESCALERA AGOTADA ───────────────────────────
REG = []; SOR = [];
const gVacio = await llamar({ accion: 'girar' });
af(() => gVacio.code === 409, 'sin participantes → 409, dio ' + gVacio.code);
sembrarPadron();
await llamar({ accion: 'girar' });
// Se queman TODOS los elegibles, EL GANADOR DE LA ESCALERA INCLUIDO.
//
// ⚠️ Mi primera versión saltaba el índice 0 de REG, que NO es el ganador de la
// escalera —ése lo eligió la revoltura—, así que quedaba uno vivo y el giro
// salía en 200: el careo afirmaba lo contrario de lo que su nombre decía.
await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'no_contesto' });
const yaQuemado = String(SOR[0].registro_id);
REG.filter((r) => !r.eliminado_at && r.foto_estado !== 'invalidada').forEach((r, i) => {
  if (String(r.id) === yaQuemado) return;
  SOR.push({ id: '00000000-0000-4000-9000-' + String(i).padStart(12, '0'), slug: G.SLUG,
             intento: 100 + i, resultado: 'no_contesto', registro_id: r.id,
             ganador_nombre: 'q', ganador_whatsapp: '1', creado_at: '2026-10-01T21:00:00Z' });
});
const gFin = await llamar({ accion: 'girar' });
af(() => gFin.code === 409 && /todos/i.test(String(gFin.d.error || '')),
   'con todos quemados → 409 «ya se giró a todos», dio ' + gFin.code + ' ' + gFin.d.error);

// ── LA PUERTA ───────────────────────────────────────────────────────────────
sembrarPadron();
const sinTok = await llamar({ accion: 'girar' }, false);
af(() => sinTok.code === 401, 'sin token → 401, dio ' + sinTok.code);
af(() => !/8990000|@x\.mx|ig\d/.test(sinTok.crudo), '🔒 el 401 no filtra un solo dato personal');
af(() => INSERTS.length === 0, 'un 401 no puede haber insertado nada');
// Un modo inventado NO se interpreta: se rehúsa.
const gModo = await llamar({ accion: 'girar', modo: 'inventado' });
af(() => gModo.code === 400, '🔒 un modo inventado → 400, dio ' + gModo.code);

// <<<SIGUIENTES-BLOQUES>>>

  completo = true;
  marcador();
  process.exit(mal ? 1 : 0);
})().catch((e) => {
  // 🔒 Una caída del arnés es un ROJO CON NOMBRE, no un stack suelto: el
  // marcador ya dice que la corrida quedó incompleta.
  console.error('\nARNÉS CAÍDO:', e.message, '\n', e.stack);
  marcador();
  process.exit(1);
});
