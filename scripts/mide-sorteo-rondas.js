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
// 🔴 EL MENSAJE TAMBIÉN PUEDE TRONAR, y si truena se cae el arnés entero — lo
// que el try/catch de aquí NO alcanza a atrapar, porque un mensaje armado con
// `+` se evalúa ANTES de entrar a esta función. Pasó: `'...' +
// res.d.ultimo.rondas.length` con `rondas` en undefined tumbó la corrida en el
// bloque [9] y el marcador dijo «0 en rojo» sobre una caída.
// Se admite el mensaje como FUNCIÓN para poder diferirlo; y el que llegue ya
// armado se protege igual con su propio try.
// ⚠️ NUNCA `await` DENTRO de la flecha que recibe `af()`: la flecha no es
// asíncrona y el archivo deja de PARSEAR — o sea que no se cae una aserción,
// se cae el careo entero antes de correr una línea. Me mordió TRES veces en
// esta tuerca. La forma buena: `const r = await llamar(...)` y luego
// `af(() => r.code === 200, ...)`.
const af = (fn, e) => {
  const texto = () => {
    try { return (typeof e === 'function') ? e() : e; }
    catch (x) { return '(el mensaje del careo tronó: ' + x.message + ')'; }
  };
  let c = false;
  try { c = (typeof fn === 'function') ? fn() : fn; }
  catch (x) { fallos.push(texto() + '  → TRONÓ: ' + x.message); mal++; return; }
  if (c) ok++; else { mal++; fallos.push(texto()); }
};

// 🔒 UN ARNÉS QUE SE CAE NO REPORTA. `af()` atrapa lo que truena DENTRO de una
// aserción, pero las líneas de PREPARACIÓN están fuera: una excepción ahí
// tumbaba el archivo entero y los bloques de abajo se quedaban sin ejercitar,
// enseñando solo un stack. Este guardián imprime el marcador SIEMPRE y dice en
// voz alta que la corrida quedó incompleta — así una caída no se puede leer
// como «no había nada más que medir».
let completo = false, reportado = false;
function marcador() {
  // Se llama desde el final feliz, desde el .catch de la IIFE y desde el
  // handler de `exit`. Imprimirlo tres veces no aclara nada.
  if (reportado) return;
  reportado = true;
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
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.careo';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
// 🔒 `giveaway-consuelo` carea el código contra el `var PROMOS` del index
// SERVIDO — la lección de CONSUELO-VERDAD-1: la fila viva NO es lo que el
// cliente ve, y la copia del index solo se refresca publicando desde Baba. Se
// apunta a un sitio de mentira para que el careo no salga a la red.
process.env.URL = 'https://sitio.careo';

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
let TIPO_GUARDADO = 'image/jpeg';

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
  const J = (v, st, ctype) => ({ ok: (st || 200) < 300, status: st || 200,
                          json: async () => v, text: async () => JSON.stringify(v),
                          headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? (ctype || null) : null) },
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
  // La fila del código de consolación, en KameHouse. Va con ventana VIVA: sin
  // ella `promoViva` aborta ANTES de la consulta del ganador, y el careo del
  // consuelo mediría la nada — es lo que me pasó.
  // El index SERVIDO, con su `var PROMOS`. Es la SEGUNDA fuente que el consuelo
  // carea antes de anunciar un código.
  // ⚠️ Los DOS vencimientos cuadran al milisegundo a propósito: el candado de
  // CONSUELO-VERDAD-1 compara el `expiresTs` del sitio contra el `expires_at`
  // de la fila y se rehúsa si difieren. Desalinearlos aquí dejaría el careo
  // midiendo ese candado en vez del filtro del ganador — y de paso confirma
  // que el candado SIGUE VIVO, porque con mi primer valor mordió.
  if (/sitio\.careo\/index\.html/.test(u)) {
    return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => Buffer.from(''),
      text: async () => "var PROMOS = { 'KAROL': {amount:400, startTs:1788220800000, "
        + "expiresTs:1798761599000, maxUsos:9999, usos:0, desc:'$400 de descuento con código KAROL', "
        + "onlyEvent:'karolg'}, };\nvar EV=[{id:'karolg',a:'Karol G',f:'7 nov 2026',ds:'2026-11-07'}];" };
  }
  if (/promos_codigos/.test(u)) {
    return J([{ codigo: 'KAROL', desc_texto: '$400 de descuento con código KAROL',
                monto: 400, pct: null, archivado: false,
                starts_at: '2026-09-01T00:00:00Z', expires_at: '2026-12-31T23:59:59Z' }]);
  }
  // El catálogo de KameHouse, lo justo para que el correo se pueda armar.
  if (/kh\.careo/.test(u) && /catalogo|eventos|index/.test(u)) return J([]);
  if (/storage\/v1\/object\/list/.test(u)) return J([]);
  // El almacén contesta con el tipo con el que se GUARDÓ el objeto, que es lo
  // que `foto_datauri` tiene que creerle en vez de adivinar por la extensión.
  if (/storage\/v1\/object\//.test(u)) return J({}, 200, TIPO_GUARDADO);
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


// ═══ [8] RESOLVER: CUATRO VALORES Y LAS REGLAS DE DESHACER ══════════════════
console.log('\n── [8] resolver: cuatro valores y las reglas de deshacer ──');

// ── El tercer botón EXIGE motivo, de lista cerrada ─────────────────────────
sembrarPadron(); SOR = [sembrarGiro('pendiente', 1)];
let rr = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'no_cumple' });
af(() => rr.code === 400 && /motivo/i.test(String(rr.d.error)),
   '🔴 `no_cumple` sin motivo → 400, dio ' + rr.code + ' ' + rr.d.error);
af(() => SOR[0].resultado === 'pendiente', 'y no se movió');
rr = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'no_cumple', motivo: 'no_sige' });
af(() => rr.code === 400, '🔒 un motivo fuera de la lista → 400 (el typo NO puede pasar), dio ' + rr.code);
rr = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'no_cumple', motivo: 'otro', motivo_detalle: 'ab' });
af(() => rr.code === 400 && /otro/i.test(String(rr.d.error)), '«otro» sin texto → 400, dio ' + rr.code);
rr = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'no_cumple', motivo: 'no_sigue' });
af(() => rr.code === 200 && SOR[0].resultado === 'no_cumple' && SOR[0].descarte_motivo === 'no_sigue',
   '🔴 `no_cumple` + no_sigue se guarda, quedó ' + SOR[0].resultado + '/' + SOR[0].descarte_motivo);
SOR = [sembrarGiro('pendiente', 1)];
await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'no_cumple',
               motivo: 'otro', motivo_detalle: 'cuenta privada' });
af(() => SOR[0].descarte_motivo === 'otro: cuenta privada',
   'el «otro» guarda «otro: <texto>», igual que `eliminado_motivo`; quedó ' + SOR[0].descarte_motivo);

// ── Deshacer: SOLO mientras no haya giro posterior ────────────────────────
SOR = [sembrarGiro('no_contesto', 1)];
rr = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'pendiente' });
af(() => rr.code === 200 && SOR[0].resultado === 'pendiente',
   'sin giro posterior, no_contesto vuelve a pendiente; dio ' + rr.code);
SOR = [sembrarGiro('no_contesto', 1)];
rr = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'acepto' });
af(() => rr.code === 200 && SOR[0].resultado === 'acepto',
   'sin giro posterior, no_contesto puede pasar a acepto (el dedazo útil)');
SOR = [sembrarGiro('no_cumple', 1, { descarte_motivo: 'no_sigue' })];
rr = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'no_contesto' });
af(() => rr.code === 200 && SOR[0].resultado === 'no_contesto' && SOR[0].descarte_motivo === null,
   'entre los dos descartes se puede corregir la etiqueta, y el motivo se limpia');
// 🔴 Con un giro POSTERIOR queda FIJO: deshacerlo crearía dos ganadores vivos.
SOR = [sembrarGiro('no_cumple', 1, { descarte_motivo: 'no_sigue' }), sembrarGiro('pendiente', 2)];
rr = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'pendiente' });
af(() => rr.code === 409 && /volvió a girar|fijo/i.test(String(rr.d.error)),
   '🔴 con un giro posterior el descarte queda FIJO, dio ' + rr.code + ' ' + rr.d.error);
af(() => SOR[0].resultado === 'no_cumple', 'y no se movió');
// Pero el giro VIVO (el último) sí se resuelve.
rr = await llamar({ accion: 'resolver', sorteo_id: SOR[1].id, resultado: 'acepto' });
af(() => rr.code === 200 && SOR[1].resultado === 'acepto', 'el giro vivo sí se resuelve');

// 🔒 EL MOTIVO SE BORRA AL DEJAR DE SER DESCARTE ───────────────────────────
SOR = [sembrarGiro('no_cumple', 1, { descarte_motivo: 'no_sigue' })];
await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'acepto' });
af(() => SOR[0].descarte_motivo === null,
   '🔒 un motivo colgando de una fila que ya no es descarte es un dato que MIENTE; quedó ' + SOR[0].descarte_motivo);

// ── `acepto` es IRREVERSIBLE ───────────────────────────────────────────────
SOR = [sembrarGiro('acepto', 1)];
for (const dest of ['pendiente', 'no_contesto']) {
  const r2 = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: dest });
  af(() => r2.code === 409 && /confirmado|no se puede/i.test(String(r2.d.error)),
     '🔴 `acepto` NO se deshace hacia ' + dest + ', dio ' + r2.code);
}
rr = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'no_cumple', motivo: 'no_sigue' });
af(() => rr.code === 409, '`acepto` tampoco se vuelve no_cumple');
af(() => SOR[0].resultado === 'acepto', 'y sigue en acepto tras los tres intentos');
// Volver a picarle a ACEPTÓ es IDEMPOTENTE, no un error: es un dedazo inofensivo.
rr = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'acepto' });
af(() => rr.code === 200 && rr.d.sin_cambio === true,
   'acepto → acepto es idempotente, dio ' + rr.code + ' ' + JSON.stringify(rr.d));

// ── La forma y el éxito vacío ──────────────────────────────────────────────
SOR = [sembrarGiro('pendiente', 1)];
const rMal = await llamar({ accion: 'resolver', sorteo_id: 'abc', resultado: 'acepto' });
af(() => rMal.code === 400 && /inválido/i.test(String(rMal.d.error)), 'un sorteo_id que no es uuid → 400');
const rVal = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'inventado' });
af(() => rVal.code === 400, 'un resultado inventado → 400');
const rNo = await llamar({ accion: 'resolver', sorteo_id: '11111111-1111-4111-8111-111111111111', resultado: 'acepto' });
af(() => rNo.code === 404 && /no existe/i.test(String(rNo.d.error)),
   '🔒 el éxito vacío habla: un giro que no existe → 404, dio ' + rNo.code);
const rSin = await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'acepto' }, false);
af(() => rSin.code === 401, 'resolver sin token → 401, dio ' + rSin.code);
af(() => PATCHES.length === 0, 'un 401 no puede haber hecho un PATCH');

// ── 🔒 NINGÚN PATCH TOCA `rondas` ──────────────────────────────────────────
// Medido por HECHO: el mock guarda todos los PATCH. No por grep del fuente —
// el comentario que explica por qué `rondas` no está CONTIENE la palabra.
SOR = [sembrarGiro('pendiente', 1, { rondas: RF })];
await llamar({ accion: 'resolver', sorteo_id: SOR[0].id, resultado: 'acepto' });
af(() => PATCHES.every((x) => !('rondas' in x.cambios)),
   '🔴 un PATCH llevó `rondas` en el cuerpo: la escalera tiene que ser inmutable');
af(() => JSON.stringify(SOR[0].rondas) === JSON.stringify(RF), 'la escalera no se movió al resolver');
// 🔒 EL PATCH VA ACOTADO POR SLUG: sin eso, un token en modo ensayo podría
// resolver un giro REAL pasándole su id.
af(() => PATCHES.filter((x) => x.tabla === 'sorteos').length > 0
      && PATCHES.filter((x) => x.tabla === 'sorteos').every((x) => /slug=eq\./.test(x.u)),
   '🔴 un PATCH de sorteos sin `slug=eq.` — el ensayo podría tocar lo real');


// ═══ [9] LA PUERTA PÚBLICA: EL GATEO DE VERDAD, POR EL CAMINO DE VERDAD ═════
console.log('\n── [9] la puerta pública: el gateo por el camino real ──');
const estado = require(path.join(RAIZ, 'netlify/functions/giveaway-estado.js')).handler;
const evG = (q, tok) => ({ httpMethod: 'GET',
  headers: Object.assign({ origin: 'https://conectareynosa.mx' }, tok ? { 'x-admin-token': tok } : {}),
  queryStringParameters: q || {} });
const pedir = async (q, tok) => {
  URLS = [];
  const r = await estado(evG(q, tok));
  let d = {}; try { d = JSON.parse(r.body || '{}'); } catch (_) {}
  return { code: r.statusCode, d, crudo: r.body || '' };
};

// 🔒 EL RELOJ SE CONGELA MOVIENDO `creado_at` HACIA ATRÁS, no parcheando
// Date.now(): así se mide el camino real (el handler hace su propia resta) y el
// careo no depende de la hora a la que se corra.
async function girarYFijar(atrasMs) {
  sembrarPadron(); SOR = [];
  await llamar({ accion: 'girar' });
  SOR[0].creado_at = new Date(Date.now() - atrasMs).toISOString();
  return SOR[0];
}

for (const [atras, esperadas, revelado] of
     [[0, 1, false], [13000, 1, false], [30000, 2, false],
      [60000, 3, false], [95000, 4, false], [200000, 5, true]]) {
  const fila = await girarYFijar(atras);
  const res = await pedir({ fotos: '1' });
  af(() => res.code === 200 && res.d.ok === true, 'estado 200 con t=' + atras + ', dio ' + res.code);
  af(() => res.d.ultimo && res.d.ultimo.rondas.length === esperadas,
     '🔴 t=' + atras + ': ' + (res.d.ultimo && res.d.ultimo.rondas && res.d.ultimo.rondas.length)
     + ' rondas publicadas, se esperaban ' + esperadas);
  af(() => !!(res.d.ultimo) && (res.d.ultimo.nombre != null) === revelado,
     '🔴 t=' + atras + ': ultimo.nombre ' + (revelado ? 'debía' : 'NO debía')
     + ' venir, vino ' + JSON.stringify(res.d.ultimo.nombre));
  af(() => !!(res.d.ultimo) && (res.d.ultimo.folio != null) === revelado,
     '🔴 t=' + atras + ': el folio del ganador ' + (revelado ? 'debía' : 'NO debía') + ' venir');
  // 🔴 EL NOMBRE COMPLETO DEL GANADOR NO PUEDE ESTAR EN NINGUNA PARTE del
  // cuerpo servido. Se busca la cadena en el JSON entero, no un campo.
  if (!revelado) {
    af(() => res.crudo.indexOf('"nombre":"' + fila.ganador_nombre + '"') === -1,
       '🔴 t=' + atras + ': el nombre del ganador salió como valor de "nombre"');
    af(() => !!(res.d.ultimo && res.d.ultimo.rondas) && res.d.ultimo.rondas.every((x) => x.tam >= 3),
       '🔴 t=' + atras + ': salió una ronda de menos de 3 — eso SEÑALA al ganador');
  }
  // 🔒 Lo privado, en TODOS los instantes, sobre el cuerpo COMPLETO.
  af(() => !/8990000|@x\.mx|"instagram"|foto_path|descarte_motivo|no_cumple|no_sigue/.test(res.crudo),
     '🔴 t=' + atras + ': dato privado en la puerta pública');
  af(() => res.crudo.indexOf('"orden"') === -1,
     '🔴 t=' + atras + ': se filtró `orden` EN CRUDO — ese arreglo EMPIEZA por el ganador');
  af(() => res.crudo.indexOf('"id":"r') === -1,
     '🔒 t=' + atras + ': se filtró un id de registro');
}

// ── El resultado DERIVADO, por el camino real ─────────────────────────────
let fila9 = await girarYFijar(200000);
await llamar({ accion: 'resolver', sorteo_id: fila9.id, resultado: 'no_cumple', motivo: 'no_sigue' });
SOR[0].creado_at = new Date(Date.now() - 200000).toISOString();
let res9 = await pedir({});
af(() => res9.d.ultimo.resultado === 'se_regira',
   '🔴 `no_cumple` debe salir como se_regira, dio ' + res9.d.ultimo.resultado);
af(() => !/no_cumple|no_sigue|cumple/.test(res9.crudo), '🔒 ni la palabra `no_cumple` puede salir');
// Y el mismo giro, resuelto pero A MEDIA ANIMACIÓN: sigue diciendo pendiente.
SOR[0].creado_at = new Date(Date.now() - 30000).toISOString();
res9 = await pedir({});
af(() => res9.d.ultimo.resultado === 'pendiente',
   '🔴 resuelto a media animación, el público debe seguir viendo `pendiente`, vio '
   + res9.d.ultimo.resultado);
af(() => res9.d.ultimo.nombre === null, 'y el nombre sigue oculto');

// ── Las fotos: solo aprobadas, solo con ?fotos=1, NUNCA antes del giro ────
sembrarPadron(); SOR = [];
res9 = await pedir({ fotos: '1' });
af(() => !res9.d.ultimo, 'sin giro no hay `ultimo`');
af(() => !/object\/sign/.test(res9.crudo) && !URLS.some((x) => /object\/sign/.test(x.u)),
   '🔴 SIN GIRO NO SE FIRMA NI UNA FOTO — medido sobre las peticiones que salieron');
await girarYFijar(200000);
res9 = await pedir({ fotos: '1' });
const miembros9 = ((res9.d.ultimo || {}).rondas || [{}])[0].miembros || [];
af(() => miembros9.some((m) => m.foto), 'con ?fotos=1 salen las firmadas');
// En el padrón de prueba los folios IMPARES están aprobados.
af(() => miembros9.every((m) => !m.foto || m.folio % 2 === 1),
   '🔴 salió la foto de alguien SIN aprobar');
af(() => miembros9.every((m) => m.foto || m.ini), '🔒 sin foto SIEMPRE hay iniciales');
// Y la consulta de fotos llevaba el filtro de aprobada EN LA CONSULTA.
af(() => URLS.some((x) => /foto_estado=eq\.aprobada/.test(x.u)),
   '🔒 la consulta de fotos perdió el filtro `foto_estado=eq.aprobada`');
const sinFotos = await pedir({});
af(() => (((sinFotos.d.ultimo || {}).rondas || [{}])[0].miembros || []).every((m) => !('foto' in m)),
   '🔒 sin ?fotos=1 la clave `foto` se OMITE (no null): así la página distingue «no me lo dijeron» de «no tiene»');
af(() => !URLS.some((x) => /object\/sign/.test(x.u)), 'sin ?fotos=1 no se firma nada');

// ── El ensayo NO sale por la puerta pública ───────────────────────────────
const ens = await pedir({ modo: 'ensayo' });
af(() => ens.code === 401, '🔴 ?modo=ensayo sin token → 401, dio ' + ens.code);
const ensTok = await pedir({ modo: 'ensayo' }, 'tok');
af(() => ensTok.code === 200, 'con token el ensayo sí se sirve, dio ' + ensTok.code);
af(() => !ensTok.d.ultimo, 'y el ensayo está vacío (no hereda el giro real)');
const modoMal = await pedir({ modo: 'inventado' });
af(() => modoMal.code === 400, 'un modo inventado → 400, dio ' + modoMal.code);

// ── Los rodillos y los campos derivados ───────────────────────────────────
await girarYFijar(200000);
res9 = await pedir({ rodillos: '1' });
af(() => res9.d.rodillos && res9.d.rodillos.nombres.length > 0 && res9.d.rodillos.apellidos.length > 0,
   'los rodillos siguen dando las dos listas separadas (orden de Memo: se conservan)');
af(() => res9.d.ultimo.de_cuantos === 28 && res9.d.ultimo.escalones[0] === 24,
   'el renglón «24 de N» sale DERIVADO: ' + res9.d.ultimo.escalones[0] + ' de ' + res9.d.ultimo.de_cuantos);
af(() => res9.d.ultimo.rondas_totales === 5, 'rondas_totales dio ' + res9.d.ultimo.rondas_totales);
af(() => res9.d.ultimo.revelacion_en_ms === TI.momentos([24, 12, 6, 3, 1])[4],
   '🔒 `revelacion_en_ms` viene del SERVIDOR: el reloj de 10 min y el gateo tienen que arrancar del MISMO número; dio '
   + res9.d.ultimo.revelacion_en_ms);
af(() => res9.d.ultimo.es_regiro === false && res9.d.ultimo.escalon === null,
   'el primer giro no es re-giro y no tiene escalón');

// ── Un giro VIEJO, sin escalera (los dos de Natanael) ─────────────────────
// 🔒 No se puede romper el camino de un giro anterior a esta tuerca: su
// `rondas` es NULL y el show tiene que ser el de siempre, con el ganador
// revelado de inmediato.
sembrarPadron();
SOR = [sembrarGiro('pendiente', 1)];   // sin `rondas`
res9 = await pedir({});
af(() => res9.d.ultimo && res9.d.ultimo.rondas.length === 0,
   'un giro sin escalera no publica rondas');
af(() => res9.d.ultimo.nombre != null,
   '🔒 un giro sin escalera revela al ganador de inmediato: es el camino de antes');
af(() => res9.d.ultimo.rondas_totales === 0 && res9.d.ultimo.revelacion_en_ms === 0,
   'y sus campos derivados van en cero');


// ═══ [10] EL CONSUELO: EL **GANADOR CONFIRMADO**, NO «EL ÚLTIMO GIRO» ═══════
console.log('\n── [10] el consuelo: el ganador CONFIRMADO ──');
const consuelo = require(path.join(RAIZ, 'netlify/functions/giveaway-consuelo.js')).handler;
// `seco:true` es el ensayo que la propia function ya trae: mide a quién le
// tocaría y NO manda ni marca nada. Un careo no manda un correo.
const llamarCons = async () => {
  URLS = [];
  const r = await consuelo(evP({ seco: true }, 'tok'));
  let d = {}; try { d = JSON.parse(r.body || '{}'); } catch (_) {}
  return { code: r.statusCode, d, urls: URLS.slice() };
};

// 🔴 EL DEFECTO, en su forma exacta: una cadena que TERMINA en un descarte.
// Antes, `order=intento.desc&limit=1` tomaba ESE último giro y excluía del
// consuelo a quien NO ganó — mandándole «no ganaste» a alguien que seguía en
// juego, y dejando al ganador real sin excluir.
sembrarPadron();
SOR = [sembrarGiro('no_contesto', 1), sembrarGiro('no_cumple', 2, { descarte_motivo: 'no_sigue' })];
let c10 = await llamarCons();
af(() => c10.code === 409,
   '🔴 sin ningún `acepto` el consuelo se REHÚSA, dio ' + c10.code);
af(() => /confirmado/i.test(String(c10.d.error || '')),
   '🔒 y lo dice con precisión: «sin ganador CONFIRMADO» no es «no se pudo identificar» '
   + '(lo segundo suena a error y esto es un estado legítimo del sorteo). Dijo: ' + c10.d.error);
// 🔒 Y EL FILTRO VA EN LA CONSULTA, medido sobre la URL que salió de verdad.
af(() => c10.urls.some((x) => /giveaway_sorteos/.test(x.u) && /resultado=eq\.acepto/.test(x.u)),
   '🔴 la consulta del ganador NO lleva `resultado=eq.acepto`');
af(() => !c10.urls.some((x) => /resend\.com/.test(x.u)), '🔒 un rehúse no manda un solo correo');

// Con un `acepto` EN MEDIO de la cadena, toma a ÉSE y no al último.
SOR = [sembrarGiro('no_contesto', 1),
       sembrarGiro('acepto', 2),
       sembrarGiro('no_cumple', 3, { descarte_motivo: 'no_sigue' })];
c10 = await llamarCons();
af(() => !(c10.code === 409 && /confirmado/i.test(String(c10.d.error || ''))),
   '🔴 con un `acepto` en la cadena el consuelo PROCEDE, dio ' + c10.code + ' ' + c10.d.error);
af(() => !c10.urls.some((x) => /resend\.com/.test(x.u)), '🔒 y en seco tampoco manda correos');

// 🔒 EL CONTROL POSITIVO: sin el filtro, la cadena de arriba habría tomado el
// intento 3 (un descarte). Se comprueba que la consulta pide el intento más
// alto **entre los acepto**, no el más alto a secas.
af(() => c10.urls.some((x) => /giveaway_sorteos/.test(x.u)
      && /resultado=eq\.acepto/.test(x.u) && /order=intento\.desc/.test(x.u) && /limit=1/.test(x.u)),
   'la consulta sigue pidiendo el intento más alto, pero ENTRE los acepto');

// Sin ningún giro: también se rehúsa, y por lo mismo.
SOR = [];
c10 = await llamarCons();
af(() => c10.code === 409 && /confirmado/i.test(String(c10.d.error || '')),
   'sin ningún giro → 409 por el mismo motivo, dio ' + c10.code);


// ═══ [11] ESTADO_ADMIN: EL MOTIVO SE **DERIVA** DE LA CADENA ════════════════
console.log('\n── [11] estado_admin: el motivo se DERIVA de la cadena ──');
sembrarPadron();
SOR = [sembrarGiro('no_contesto', 1),
       sembrarGiro('no_cumple', 2, { descarte_motivo: 'no_sigue', origen_sorteo_id: 'o1', escalon: 3 }),
       sembrarGiro('pendiente', 3, { origen_sorteo_id: 'o1', escalon: 6 })];
let a11 = await llamar({ accion: 'estado_admin' });
af(() => a11.code === 200 && a11.d.ok === true, 'estado_admin sale 200, dio ' + a11.code);
af(() => a11.d.ultimo && a11.d.ultimo.resultado === 'pendiente',
   'estado_admin da el resultado VERDADERO (no el derivado del público)');
af(() => Array.isArray(a11.d.cadena) && a11.d.cadena.length === 3,
   'la cadena trae los 3 intentos, dio ' + ((a11.d.cadena || []).length));

// 🔒 EL MOTIVO DE UN RE-GIRO SE DERIVA del resultado del intento ANTERIOR. No
// se guarda: un dato derivable guardado dos veces es cómo los letreros se
// quedan viejos (`flash_promo`, el chip de PROMO-DERIVA-1, las tres fechas).
af(() => ((a11.d.cadena||[])[0]||{}).motivo_derivado === null, 'el primer giro no tiene motivo');
af(() => ((a11.d.cadena||[])[1]||{}).motivo_derivado === 'no_contesto',
   '🔴 el intento 2 existe porque el 1 NO CONTESTÓ; dio ' + ((a11.d.cadena||[])[1]||{}).motivo_derivado);
af(() => ((a11.d.cadena||[])[2]||{}).motivo_derivado === 'no_cumple',
   '🔴 el intento 3 existe porque el 2 NO CUMPLIÓ; dio ' + ((a11.d.cadena||[])[2]||{}).motivo_derivado);
// Y con la cadena al revés el motivo cambia solo: eso es lo que prueba que se
// DERIVA y no que se copió de algún lado.
SOR = [sembrarGiro('no_cumple', 1, { descarte_motivo: 'otro: cuenta privada' }),
       sembrarGiro('no_contesto', 2), sembrarGiro('pendiente', 3)];
let b11 = await llamar({ accion: 'estado_admin' });
af(() => ((b11.d.cadena||[])[1]||{}).motivo_derivado === 'no_cumple'
      && ((b11.d.cadena||[])[2]||{}).motivo_derivado === 'no_contesto',
   '🔴 invirtiendo la cadena, los motivos se invierten: se DERIVAN. Dio '
   + JSON.stringify((b11.d.cadena||[]).map(function(x){ return x.motivo_derivado; })));

// El detalle PRIVADO sí sale por aquí (esta puerta exige token) y nunca allá.
af(() => ((b11.d.cadena||[])[0]||{}).descarte_motivo === 'otro: cuenta privada',
   'el detalle del motivo sale con token, dio ' + ((b11.d.cadena||[])[0]||{}).descarte_motivo);
af(() => (b11.d.ultimo||{}).whatsapp && (b11.d.ultimo||{}).instagram,
   'el contacto del ganador (WhatsApp e Instagram) sale con token');
af(() => (b11.d.ultimo||{}).premio === 'PLUS' || (b11.d.ultimo||{}).premio === 'CHEAP',
   '🔒 el premio se DERIVA de la ciudad con la regla de la casa, dio ' + (b11.d.ultimo||{}).premio);
af(() => typeof (b11.d.ultimo||{}).premio_texto === 'string' && (b11.d.ultimo||{}).premio_texto.length > 20,
   '🔒 y el TEXTO del premio sale de PREMIOS del lib, no tecleado en la pantalla');
af(() => (b11.d.ultimo||{}).escalon === null || typeof (b11.d.ultimo||{}).escalon === 'number', 'el escalón viaja');
const sinT11 = await llamar({ accion: 'estado_admin' }, false);
af(() => sinT11.code === 401, 'sin token → 401, dio ' + sinT11.code);
af(() => !/8990000|ig\d|cuenta privada/.test(sinT11.crudo), '🔒 el 401 no filtra un dato');

// ── `foto_datauri`: la foto lista para el canvas, sin ensuciar ────────────
// 🔒 POR QUÉ NO UNA URL FIRMADA: una imagen de otro dominio ENSUCIA el canvas y
// `toBlob` truena. Un `data:` URI no depende de un header ajeno.
const fd = await llamar({ accion: 'foto_datauri', registro_id: 'r1' });
af(() => fd.code === 200 && /^data:image\/(jpeg|png);base64,/.test(String(fd.d.datauri || '')),
   '🔴 foto_datauri devuelve un data: URI, dio ' + fd.code + ' ' + String(fd.d.datauri || '').slice(0, 40));
af(() => fd.d.foto_estado === 'aprobada', 'y dice en qué estado está la foto, dio ' + fd.d.foto_estado);
// 🔴 EL TIPO SALE DEL ALMACÉN, NO DE LA EXTENSIÓN. El caso que lo destapó: los
// avatares del ENSAYO son SVG con nombre `.png` —el regex de `foto_url` solo
// admite .jpg/.png, así que el nombre NO PUEDE decir la verdad—, y un
// `data:image/png` con bytes SVG no se pinta: en un canvas es una story con la
// cara en blanco. Y muerde igual con una foto real cuya extensión mienta.
TIPO_GUARDADO = 'image/svg+xml';
const fdSvg = await llamar({ accion: 'foto_datauri', registro_id: 'r1' });
af(() => /^data:image\/svg\+xml;base64,/.test(String(fdSvg.d.datauri || '')),
   '🔴 con una ruta .png pero bytes SVG, el tipo tiene que salir del ALMACÉN; dio '
   + String(fdSvg.d.datauri || '').slice(0, 44));
// Y si el almacén no dice nada, la extensión es el ÚLTIMO recurso (no el primero).
TIPO_GUARDADO = null;
const fdSinTipo = await llamar({ accion: 'foto_datauri', registro_id: 'r1' });
af(() => /^data:image\/jpeg;base64,/.test(String(fdSinTipo.d.datauri || '')),
   'sin tipo del almacén cae a la extensión (.jpg → image/jpeg), dio '
   + String(fdSinTipo.d.datauri || '').slice(0, 30));
// Y un tipo que NO es imagen no se cree: no se va a poner en un `data:image/`.
TIPO_GUARDADO = 'text/html';
const fdMal = await llamar({ accion: 'foto_datauri', registro_id: 'r1' });
af(() => !/text\/html/.test(String(fdMal.d.datauri || '')),
   '🔒 un content-type que no es imagen no se copia al data: URI');
TIPO_GUARDADO = 'image/jpeg';

const fdSin = await llamar({ accion: 'foto_datauri', registro_id: 'r1' }, false);
af(() => fdSin.code === 401, '🔒 foto_datauri sin token → 401, dio ' + fdSin.code);
const fdNo = await llamar({ accion: 'foto_datauri', registro_id: 'nadie' });
af(() => fdNo.code === 404, 'un registro que no existe → 404, dio ' + fdNo.code);
const fdVacio = await llamar({ accion: 'foto_datauri' });
af(() => fdVacio.code === 400, 'sin registro_id → 400, dio ' + fdVacio.code);
// 🔒 Y ACOTADO POR SLUG: un token en modo ensayo no puede sacar la foto de
// alguien del sorteo REAL.
af(() => URLS.filter(function(x){ return /giveaway_registros/.test(x.u); })
        .every(function(x){ return /slug=eq\./.test(x.u); }),
   '🔴 foto_datauri leyó registros sin acotar por slug');


// ═══ [12] EL ENSAYO: BLINDADO EN LOS DOS SENTIDOS ═══════════════════════════
console.log('\n── [12] el ensayo: blindado en los dos sentidos ──');

// ── (1) 🔴 LAS TRES ACCIONES NO ALCANZAN EL SLUG REAL, aunque se lo pidan.
//        No «validan»: se REHÚSAN. El slug real no es un caso a manejar aquí.
sembrarPadron();
const nRealAntes = REG.length, nSorAntes = SOR.length;
for (const acc of ['ensayo_sembrar', 'ensayo_reiniciar', 'ensayo_borrar']) {
  const r1 = await llamar({ accion: acc });                       // modo ausente = real
  af(() => r1.code === 403 && /ensayo/i.test(String(r1.d.error || '')),
     '🔴 ' + acc + ' en modo REAL debe dar 403, dio ' + r1.code + ' ' + r1.d.error);
  af(() => BORRADOS.length === 0 && INSERTS.length === 0,
     '🔴 ' + acc + ' en modo real TOCÓ la base: ' + JSON.stringify(BORRADOS.concat(INSERTS)).slice(0, 90));
  const r2 = await llamar({ accion: acc, modo: 'real' });
  af(() => r2.code === 403, '🔴 ' + acc + " con modo:'real' debe dar 403, dio " + r2.code);
  af(() => BORRADOS.length === 0 && INSERTS.length === 0, acc + " con modo:'real' tocó la base");
}
af(() => REG.length === nRealAntes && SOR.length === nSorAntes,
   '🔴 el padrón real se movió: ' + REG.length + '/' + SOR.length);
af(() => REG.every((r) => r.slug === G.SLUG), '🔴 apareció una fila que no es del slug real');

// ── (2) 🔴 EL ENSAYO NO PUEDE ESCRIBIR EN EL SLUG REAL ───────────────────
const sem = await llamar({ accion: 'ensayo_sembrar', modo: 'ensayo' });
af(() => sem.code === 200 && sem.d.sembrados === 24,
   'sembrar deja 24 ficticios, dio ' + sem.code + ' ' + sem.d.sembrados);
af(() => REG.filter((r) => r.slug === G.SLUG_ENSAYO).length === 24,
   'y están en la base con el slug de ensayo, hay ' + REG.filter((r) => r.slug === G.SLUG_ENSAYO).length);
af(() => REG.filter((r) => r.slug === G.SLUG).length === nRealAntes,
   '🔴 sembrar el ensayo TOCÓ el padrón real');
// 🔒 Los nombres son inventados y los correos no pueden existir.
const fichasEns = REG.filter((r) => r.slug === G.SLUG_ENSAYO);
af(() => fichasEns.every((r) => /@ensayo\.invalid$/.test(String(r.correo || ''))),
   '🔒 los correos del ensayo son .invalid: no puede llegarle a nadie');
af(() => fichasEns.every((r) => !REG.some((x) => x.slug === G.SLUG && x.nombre === r.nombre)),
   '🔒 ningún nombre del ensayo coincide con uno del padrón real');
// 🔴 Y LAS RUTAS DE FOTO PASAN EL REGEX DE `foto_url`, que es el que decide si
// la foto se puede firmar. Con mayúsculas en el slug saldrían EN BLANCO.
const RE_FOTO = /^[a-z0-9-]+\/[a-f0-9]{12}\/[A-Za-z0-9-]+\.(jpg|png)$/;
af(() => fichasEns.every((r) => RE_FOTO.test(String(r.foto_path || ''))),
   '🔴 una ruta de avatar NO pasa el regex de foto_url: ' + String((fichasEns[0] || {}).foto_path));
// Mezcla de estados: el ensayo tiene que ejercitar la tarjeta de INICIALES.
af(() => fichasEns.some((r) => r.foto_estado === 'pendiente') && fichasEns.some((r) => r.foto_estado === 'aprobada'),
   '🔒 el ensayo mezcla aprobadas y pendientes: si no, nunca se ve la tarjeta de iniciales');
// Y las dos ramas del premio.
af(() => fichasEns.some((r) => G.premioPorCiudad(r.ciudad) === 'PLUS')
      && fichasEns.some((r) => G.premioPorCiudad(r.ciudad) === 'CHEAP'),
   '🔒 el ensayo mezcla ciudades: si no, una de las dos ramas del premio nunca se prueba');
// Idempotente.
const sem2 = await llamar({ accion: 'ensayo_sembrar', modo: 'ensayo' });
af(() => sem2.code === 200 && sem2.d.sembrados === 0, 'sembrar dos veces no duplica, dio ' + sem2.d.sembrados);

// Un giro de ENSAYO escribe SOLO con el slug de ensayo.
const gEns = await llamar({ accion: 'girar', modo: 'ensayo' });
af(() => gEns.code === 200 && gEns.d.ensayo === true,
   'el giro de ensayo sale 200 y se declara ensayo, dio ' + gEns.code);
af(() => INSERTS.every((x) => x.slug === G.SLUG_ENSAYO),
   '🔴 un giro de ENSAYO insertó una fila con el slug REAL');
af(() => URLS.filter((x) => x.m !== 'GET').every((x) => x.u.indexOf(G.SLUG_ENSAYO) !== -1
      || x.u.indexOf('slug=eq.' + encodeURIComponent(G.SLUG) + '&') === -1),
   '🔴 una ESCRITURA del ensayo apuntó al slug real');
af(() => SOR.filter((x) => x.slug === G.SLUG).length === nSorAntes,
   '🔴 el ensayo agregó un giro al sorteo REAL');

// Reiniciar: se van los giros, se quedan los participantes.
const rei = await llamar({ accion: 'ensayo_reiniciar', modo: 'ensayo' });
af(() => rei.code === 200, 'reiniciar sale 200, dio ' + rei.code);
af(() => SOR.filter((x) => x.slug === G.SLUG_ENSAYO).length === 0, 'reiniciar borra los giros del ensayo');
af(() => REG.filter((r) => r.slug === G.SLUG_ENSAYO).length === 24, 'y DEJA los 24 participantes');
af(() => SOR.filter((x) => x.slug === G.SLUG).length === nSorAntes,
   '🔴 reiniciar el ensayo borró un giro REAL');
af(() => BORRADOS.every((x) => x.u.indexOf(G.SLUG_ENSAYO) !== -1),
   '🔴 un DELETE del ensayo no llevaba el slug de ensayo: ' + JSON.stringify(BORRADOS));

// ── (3) 🔒 LAS OTRAS FUNCTIONS NO PUEDEN VER EL ENSAYO ───────────────────
// No es un candado nuevo: es el que YA estaba (las seis filtran por slug), y se
// AFIRMA porque un candado que nadie carea es una nota. Se mide por HECHO: qué
// URL pidieron, no qué dice su comentario.
const lista12 = require(path.join(RAIZ, 'netlify/functions/giveaway-lista.js')).handler;
URLS = [];
await lista12({ httpMethod: 'GET', headers: { origin: 'https://conectareynosa.mx', 'x-admin-token': 'tok' } });
af(() => URLS.filter((x) => /giveaway_registros/.test(x.u))
        .every((x) => x.u.indexOf('slug=eq.' + encodeURIComponent(G.SLUG)) !== -1),
   '🔒 giveaway-lista solo pregunta por el slug REAL');
af(() => URLS.every((x) => x.u.indexOf(G.SLUG_ENSAYO) === -1),
   '🔴 giveaway-lista mencionó el slug de ensayo');
const reco12 = require(path.join(RAIZ, 'netlify/functions/giveaway-recordatorio.js')).handler;
URLS = [];
try { await reco12({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', 'x-admin-token': 'tok' }, body: '{}' }); } catch (e) {}
af(() => URLS.every((x) => x.u.indexOf(G.SLUG_ENSAYO) === -1),
   '🔴 giveaway-recordatorio mencionó el slug de ensayo — podría MANDAR CORREOS del ensayo');
URLS = [];
await llamarCons();
af(() => URLS.every((x) => x.u.indexOf(G.SLUG_ENSAYO) === -1),
   '🔴 giveaway-consuelo mencionó el slug de ensayo');

// ── (4) 🔴 «LIMPIAR HUÉRFANAS» NO SE LLEVA LOS AVATARES DEL ENSAYO ───────
// El PRIMER candado es la DIAGONAL del prefijo, y es una certeza de escritorio:
// se comprueba aquí antes de confiar en ella.
af(() => (G.SLUG_ENSAYO + '/x/a.png').indexOf(G.SLUG + '/') !== 0,
   '🔴 el prefijo del slug real ALCANZA al del ensayo: la diagonal no salva nada');
af(() => (G.SLUG + '/x/a.png').indexOf(G.SLUG + '/') === 0, 'y sí alcanza lo suyo (control positivo del prefijo)');


// ═══ [13] 🔴 EL CONTROL POSITIVO DEL PR ENTERO: **BASE SÍ FILTRA** ══════════
//
// Sin esto, los mil verdes de arriba no distinguen «lo arreglé» de «no estoy
// midiendo». Se saca el árbol de BASE con `git archive` y se corre SU
// `giveaway-estado` con el MISMO mock: tiene que soltar el nombre del ganador
// desde el instante cero, que es justo el spoiler que esta tuerca cierra.
//
// 🔒 BASE ES UN COMMIT FIJO, no `main`. Cuando esto se mergee, `main` va a
// traer el arreglo y el control positivo se pondría en ROJO solo, diciendo «en
// BASE no se filtra nada» — un control positivo CADUCA cuando su pasado se
// vuelve presente. Es lo que le pasó a mide:luces-placa.
console.log('\n── [13] control positivo: BASE SÍ filtra al ganador ──');
const { execSync } = require('child_process');
const os = require('os');
const BASE = process.env.BASE || '52660aa';
let dirBase = null;
try {
  const sha = execSync('git rev-parse ' + BASE, { cwd: RAIZ, encoding: 'utf8' }).trim();
  dirBase = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'base-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dirBase, { cwd: RAIZ, shell: '/bin/bash' });
  console.log('    BASE = ' + sha.slice(0, 9) + ' extraído');
} catch (e) {
  af(false, '🔴 no se pudo extraer el árbol de BASE (' + BASE + '): ' + e.message);
}
// 🔒 EL LADO DE HEAD SE DICE EN VOZ ALTA. Este careo mide el ÁRBOL DE TRABAJO
// (que es lo que quieres de un vigilante vivo), no un commit congelado — pero
// entonces el verde no vale nada si no se sabe QUÉ árbol midió. Se imprime el
// sha y si está sucio, para que el veredicto no sea ambiguo nunca.
//
// ⏳ ANTES DEL MERGE: aquí se ancla `HEAD` al sha del merge y se corre una vez
// más, para dejar un verdadero careo entre DOS COMMITS que no caduque. Mientras
// la PR vive, el árbol de trabajo es lo correcto.
try {
  const shaHead = execSync('git rev-parse --short HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim();
  const sucio = execSync('git status --porcelain -- sorteo.html sorteo-tiempos.js netlify/functions scripts',
    { cwd: RAIZ, encoding: 'utf8' }).trim();
  console.log('    HEAD medido = ÁRBOL DE TRABAJO sobre ' + shaHead
            + (sucio ? '  ⚠️ CON CAMBIOS SIN COMMITEAR:\n      ' + sucio.split('\n').join('\n      ') : '  (limpio)'));
} catch (e) { console.log('    (no se pudo leer el sha de HEAD: ' + e.message + ')'); }
if (dirBase) {
  const estadoBase = require(path.join(dirBase, 'netlify/functions/giveaway-estado.js')).handler;
  // El MISMO escenario del bloque [9]: un giro recién creado.
  const fila13 = await girarYFijar(0);
  const rBase = await estadoBase(evG({}));
  let dBase = {}; try { dBase = JSON.parse(rBase.body || '{}'); } catch (_) {}
  console.log('    BASE en t=0 → ultimo.nombre = ' + JSON.stringify(dBase.ultimo && dBase.ultimo.nombre));
  af(() => rBase.statusCode === 200, 'el estado de BASE contesta 200, dio ' + rBase.statusCode);
  af(() => dBase.ultimo && dBase.ultimo.nombre === fila13.ganador_nombre,
     '🔴 CONTROL POSITIVO EN ROJO: en BASE el nombre del ganador NO sale en t=0, '
     + 'así que este careo no distingue «lo arreglé» de «no estoy midiendo». Dio '
     + JSON.stringify(dBase.ultimo && dBase.ultimo.nombre));
  af(() => dBase.ultimo && dBase.ultimo.folio != null,
     '🔴 CONTROL POSITIVO: en BASE el folio del ganador también salía en t=0');
  // Y HEAD, en el MISMO instante, NO lo suelta. Los dos lados, medidos juntos.
  const rHead = await pedir({});
  af(() => rHead.d.ultimo && rHead.d.ultimo.nombre === null,
     '🔴 en HEAD, mismo instante, el nombre TIENE que venir en null; vino '
     + JSON.stringify(rHead.d.ultimo && rHead.d.ultimo.nombre));
  af(() => rHead.crudo.indexOf(fila13.ganador_nombre + '"') === -1
        || rHead.d.ultimo.rondas.some((x) => x.miembros.length > 1),
     'y no aparece identificable en ningún otro campo');

  // Lo que BASE no tenía, para que el resto del PR también tenga su contraste.
  const libBase = path.join(dirBase, 'netlify/functions/_lib/sorteo-escalera.js');
  af(() => !require('fs').existsSync(libBase), 'en BASE no existía _lib/sorteo-escalera');
  af(() => !require('fs').existsSync(path.join(dirBase, 'sorteo-tiempos.js')),
     'en BASE no existía sorteo-tiempos.js');
  const gBase = require(path.join(dirBase, 'netlify/functions/_lib/giveaway.js'));
  af(() => gBase.SLUG_ENSAYO === undefined, 'en BASE no existía el slug de ensayo');
  af(() => typeof gBase.slugDe !== 'function', 'ni `slugDe`');
  const htmlBase = require('fs').readFileSync(path.join(dirBase, 'sorteo.html'), 'utf8');
  af(() => htmlBase.indexOf('mosaico-caja') === -1, 'en BASE no había mosaico');
  af(() => htmlBase.indexOf('como-func') === -1, 'ni bloque de «Cómo funciona»');
  af(() => htmlBase.indexOf('nocumple') === -1, 'ni tercer botón');
  af(() => htmlBase.indexOf('banda-ensayo') === -1, 'ni banda de ensayo');
  // Y el consuelo de BASE tomaba «el último giro», sin filtrar por acepto.
  const consBase = require('fs').readFileSync(
    path.join(dirBase, 'netlify/functions/giveaway-consuelo.js'), 'utf8');
  af(() => consBase.indexOf('resultado=eq.acepto') === -1,
     '🔴 CONTROL POSITIVO: en BASE el consuelo NO filtraba por acepto');
}

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
