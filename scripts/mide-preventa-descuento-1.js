#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-preventa-descuento-1.js — PREVENTA-DESCUENTO-1 · el descuento que se
// contaba como pago
//
// 🔴 EL DEFECTO: `mapa.dinero` incluía la columna «Preventa», con esta razón
// escrita en el código: «en Pa'l Norte la preventa hace de separo». Barrido el
// 3-oct-2026 sobre LAS 68 PESTAÑAS ACTIVAS, preguntándole a la celda `Abonado`
// de cada pestaña en las 28 filas que traen Preventa con valor:
//
//     PREVENTA ES DESCUENTO : 28/28      PREVENTA ES DINERO : 0/28
//     pestañas con «Pa'l Norte» activas : NINGUNA
//     y la cuenta cierra al peso: Total = Costo + Hab + Avión − Preventa
//
// Le regalaba al negocio $14,556 que nunca recibió, y a 16 personas les hacía
// ver la deuda MÁS CHICA de lo que es.
//
// LO QUE ESTA TUERCA METE, y este careo mide EN LOS DOS SENTIDOS:
//   · la Preventa NO se suma al abonado  (y en BASE SÍ se sumaba);
//   · el separo y los pagos SÍ se siguen sumando (no se rompió la suma);
//   · un TESTIGO que, el día que la Preventa vuelva a hacer de DINERO, lo GRITA
//     en pantalla con nombres — la regla se re-decide con datos, no revive sola;
//   · y sus TRES estados sin aplastar: descuento · dinero · no se puede decir.
//
// 🔒 Y UNA AFIRMACIÓN DE LO QUE **NO** ARREGLA: el contrato que el careo re-escribe
//    sale de `mapa.total` (la celda «Total»), no de `mapa.dinero`. Esta tuerca NO
//    lo toca, y el careo lo dice para que nadie lo crea arreglado.
//
// Se corre:  npm run mide:preventa-descuento-1
// ══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let v = 0, r = 0, completo = false;
const fallos = [];
const af = (c, m) => { let ok = false, ex = '';
  try { ok = !!(typeof c === 'function' ? c() : c); } catch (e) { ok = false; ex = ' [' + e.message + ']'; }
  if (ok) v++; else { r++; const t = (typeof m === 'function' ? m() : m) + ex; fallos.push(t); console.log('  ❌ ' + t); } };
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final');
  console.log(r === 0 ? (v === 0 ? '⚠️  NADA MEDIDO' : '✅ VERDE · ' + v + ' en verde, 0 en rojo')
                      : '🔴 ROJO · ' + v + ' en verde, ' + r + ' en rojo');
  fallos.slice(0, 20).forEach((f) => console.log('  · ' + f));
}
const BASE = process.env.BASE || 'fbe52ad';   // el main con la Preventa como dinero

function sacar(ref) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prevd-' + sha.slice(0, 7) + '-'));
  // 🔒 Se extrae el _lib COMPLETO: \`excel-careo\` requiere a sus vecinos
  // (\`normalizar-zona\`), y un árbol a medias truena por el instrumento.
  execSync('git archive ' + sha + ' netlify/functions/_lib kamehouse-eventos.js | tar -x -C ' + dir,
           { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}

// ── LA PESTAÑA DE MENTIRA, CON LA FORMA REAL ─────────────────────────────────
// 🔒 Los rótulos y el orden se copiaron de la cosecha REAL de juniorh (3-oct):
// No. · Nombre · Paquete · Boleto · (vacía = separo sin nombre) · Separo · 1..10
// · Preventa · Costo · Habitación · Pago Hab · Avión - Bus · Total · Abonado ·
// Resta · TALLA. La vacía después de «Boleto» es la que `separoSinNombre` busca
// por POSICIÓN, así que si se quita, el mapa cambia de significado.
const ENC = ['No.', 'Nombre', 'Paquete', 'Boleto', '', 'Separo', '1', '2', '3',
             'Preventa', 'Costo', 'Habitación', 'Pago Hab', 'Avión - Bus',
             'Total', 'Abonado', 'Resta', 'TALLA'];
const I = {}; ENC.forEach((x, i) => { if (x) I[x] = i; });
// Itzel, con los números REALES medidos: separo 300 + pagos 5000 = 5300 = Total,
// Costo 5500 − Preventa 200 = 5300, y la pestaña declara Abonado 5300.
function filaItzel() {
  const f = new Array(ENC.length).fill('');
  f[I['No.']] = 33; f[I.Nombre] = 'Itzel Esmeralda Vazquez Hernandez';
  f[I.Paquete] = 'PLUS'; f[I.Boleto] = '1r Nivel, 1ra base';
  f[I.Separo] = '$300'; f['6'] = undefined;
  f[I['1']] = '$1,500'; f[I['2']] = '$2,000'; f[I['3']] = '$1,500';
  f[I.Preventa] = '$200'; f[I.Costo] = '5500'; f[I['Pago Hab']] = '$0';
  f[I['Avión - Bus']] = '$0'; f[I.Total] = '$5,300'; f[I.Abonado] = '$5,300';
  f[I.Resta] = '$0'; f[I.TALLA] = 'XS';
  return f;
}
// La MISMA fila, pero con la pestaña declarando que la preventa SÍ es dinero:
// Abonado = 5300 + 200. Es el caso que hoy no existe y que el testigo vigila.
function filaPreventaEsDinero() {
  const f = filaItzel(); f[I.Nombre] = 'Alguien de Pal Norte';
  f[I.Abonado] = '$5,500'; f[I.Resta] = '-$200';
  return f;
}
// Y una sin columna «Abonado»: el testigo NO puede juzgarla.
const ENC_SIN_AB = ENC.filter((x) => x !== 'Abonado');

const hoja = (enc, filas) => [enc].concat(filas);
const cargar = (dir) => {
  const p = path.join(dir, 'netlify/functions/_lib/excel-careo.js');
  delete require.cache[require.resolve(p)];
  return require(p);
};

const b = sacar(BASE);
const H = cargar(RAIZ), B = cargar(b.dir);
console.log('\n═══ PREVENTA-DESCUENTO-1 · el descuento que se contaba como pago ═══');
console.log('    BASE ' + b.sha.slice(0, 7) + '  ·  HEAD = árbol de trabajo\n');

// ── [A] SENTIDO 1 · la Preventa NO se suma ──────────────────────────────────
console.log('  [A] sentido 1: la Preventa NO entra al abonado');
{
  const f = filaItzel();
  const pH = H.parsearPestana(hoja(ENC, [f]), { fila: 0, columna: 1 }, null);
  const pB = B.parsearPestana(hoja(ENC, [f]), { fila: 0, columna: 1 }, null);
  const perH = [...pH.personas.values()][0], perB = [...pB.personas.values()][0];
  console.log('    HEAD abonado=' + perH.abonado + '  ·  BASE abonado=' + perB.abonado
    + '  ·  la pestaña declara 5300');
  af(() => perH.abonado === 5300, () => '🔴 HEAD no suma 5300 (separo 300 + 1500+2000+1500): ' + perH.abonado);
  // 🔒 EL CONTROL POSITIVO: sin esto, «HEAD lo arregla» no se midió.
  af(() => perB.abonado === 5500,
     () => '🔒 CONTROL POSITIVO: BASE no inflaba el abonado — entonces este careo no mide el arreglo (BASE=' + perB.abonado + ')');
  af(() => perB.abonado - perH.abonado === 200,
     () => 'la diferencia entre los dos árboles no es la preventa: ' + (perB.abonado - perH.abonado));
  // 🔒 Y EL ORÁCULO: el abonado de HEAD es el que la PESTAÑA declara.
  af(() => perH.abonado === 5300 && perH.abDeclarado === 5300,
     () => '🔒 el abonado de HEAD no coincide con el `Abonado` de la pestaña: ' + perH.abonado + ' vs ' + perH.abDeclarado);
  af(() => perH.preventa === 200, () => 'la preventa no viaja aparte: ' + perH.preventa);
}

// ── [B] SENTIDO 2 · lo que SÍ se sigue sumando ──────────────────────────────
console.log('\n  [B] sentido 2: el separo y los pagos SIGUEN sumando');
{
  const mapa = H.mapearColumnas(ENC);
  console.log('    columnas de dinero: ' + JSON.stringify(mapa.dinero) + '  (preventa está en ' + mapa.preventa + ')');
  af(() => mapa.dinero.indexOf(mapa.preventa) === -1, '🔴 la preventa sigue en `mapa.dinero`');
  af(() => mapa.preventa >= 0, '🔴 `mapa.preventa` se borró del mapa: el testigo y el reporte la necesitan');
  af(() => mapa.dinero.indexOf(mapa.separoNombrado) !== -1, '🔴 el separo nombrado salió de `mapa.dinero`');
  af(() => mapa.dinero.indexOf(mapa.separoSinNombre) !== -1, '🔴 el separo SIN nombre salió de `mapa.dinero`');
  af(() => mapa.pagos.every((c) => mapa.dinero.indexOf(c) !== -1), '🔴 algún pago salió de `mapa.dinero`');
  af(() => mapa.dinero.indexOf(mapa.total) === -1, '🔒 el Total se colό a `mapa.dinero`');
  af(() => mapa.dinero.indexOf(mapa.avionBus) === -1, '🔒 el vuelo se coló a `mapa.dinero`');
  af(() => mapa.dinero.indexOf(mapa.abonado) === -1,
     '🔒 la celda `Abonado` se coló a `mapa.dinero`: duplicaría el abonado de todo el mundo');
  af(() => mapa.abonado >= 0, '🔴 `mapa.abonado` no existe: el testigo se queda sin oráculo');
  // Y el separo sin nombre, que vive POR POSICIÓN: la vacía tras «Boleto».
  const sin = new Array(ENC.length).fill(''); sin[I.Nombre] = 'Pedro'; sin[I.Boleto] = 'Oro';
  sin[I.Boleto + 1] = '$900'; sin[I['1']] = '$100'; sin[I.Abonado] = '$1,000';
  const p2 = H.parsearPestana(hoja(ENC, [sin]), { fila: 0, columna: 1 }, null);
  af(() => [...p2.personas.values()][0].abonado === 1000,
     () => '🔴 el separo sin nombre dejó de sumar: ' + [...p2.personas.values()][0].abonado);
}

// ── [C] 🔒 EL TESTIGO · los tres estados, sin aplastar ──────────────────────
console.log('\n  [C] 🔒 el testigo, y el día que Pal Norte reviva');
{
  // descuento (lo medido hoy)
  const t1 = H.parsearPestana(hoja(ENC, [filaItzel()]), { fila: 0, columna: 1 }, null).testigo_preventa;
  console.log('    descuento → ' + JSON.stringify({ con: t1.con_preventa, desc: t1.descuento, din: t1.dinero, nse: t1.no_se_puede_decir, aviso: !!t1.aviso }));
  af(() => t1.con_preventa === 1 && t1.descuento === 1 && t1.dinero === 0 && t1.no_se_puede_decir === 0,
     () => '🔴 el testigo no reconoce el descuento: ' + JSON.stringify(t1));
  af(() => t1.aviso === null, '🔴 con cero casos de dinero el testigo grita de todas formas');
  af(() => t1.suma_preventa === 200, () => 'el testigo no suma la preventa: ' + t1.suma_preventa);

  // DINERO (el caso que vigila)
  const t2 = H.parsearPestana(hoja(ENC, [filaPreventaEsDinero()]), { fila: 0, columna: 1 }, null).testigo_preventa;
  console.log('    DINERO    → ' + JSON.stringify({ con: t2.con_preventa, desc: t2.descuento, din: t2.dinero, aviso: !!t2.aviso }));
  af(() => t2.dinero === 1 && t2.descuento === 0,
     () => '🔴 el testigo NO caza la preventa que hace de dinero: ' + JSON.stringify(t2));
  af(() => !!t2.aviso && /RE-DECIDIR/.test(t2.aviso),
     () => '🔴 el testigo no pide re-decidir la regla: ' + t2.aviso);
  af(() => (t2.como_dinero || []).length === 1 && t2.como_dinero[0].nombre === 'Alguien de Pal Norte',
     () => '🔴 el testigo cuenta pero NO NOMBRA: un conteo sin nombres no se puede revisar');
  af(() => t2.como_dinero[0].preventa === 200 && t2.como_dinero[0].suma_sin_preventa === 5300
        && t2.como_dinero[0].abonado_declarado === 5500,
     () => 'el testigo no trae los tres números que dejan ver el caso: ' + JSON.stringify(t2.como_dinero[0]));
  // 🔒 Y AUNQUE GRITE, NO CAMBIA NADA POR SU CUENTA: el abonado sigue sin la preventa.
  const perDin = [...H.parsearPestana(hoja(ENC, [filaPreventaEsDinero()]), { fila: 0, columna: 1 }, null).personas.values()][0];
  af(() => perDin.abonado === 5300,
     () => '🔒 el testigo se puso a decidir: el abonado cambió a ' + perDin.abonado + ' en vez de avisar');

  // NO SE PUEDE DECIR (sin columna «Abonado») — y NO es un descuento
  const fSin = filaItzel().filter((_, i) => ENC[i] !== 'Abonado');
  const t3 = H.parsearPestana(hoja(ENC_SIN_AB, [fSin]), { fila: 0, columna: 1 }, null).testigo_preventa;
  console.log('    sin Abonado → ' + JSON.stringify({ con: t3.con_preventa, desc: t3.descuento, nse: t3.no_se_puede_decir, col_ab: t3.columna_abonado }));
  af(() => t3.no_se_puede_decir === 1 && t3.descuento === 0,
     () => '🔴 sin oráculo el testigo lo da por DESCUENTO: eso afirma sobre una hoja que no se midió — ' + JSON.stringify(t3));
  af(() => t3.columna_abonado === false, 'el testigo no dice que falta la columna «Abonado»');
}

// ── [D] 🔒 LO QUE ESTA TUERCA **NO** ARREGLA ────────────────────────────────
console.log('\n  [D] 🔒 el contrato que el careo re-escribe NO sale de aquí');
{
  // 🔴 Jane midió que el careo del 3-oct re-escribió el contrato de las tres de
  // karolg#1 de $7,450 → $6,950. Ese camino lee `mapa.total` (la celda «Total»),
  // que esta tuerca NO toca: el `excel_total` de la fila sigue siendo 5300 aunque
  // la preventa ya no se sume. Se AFIRMA para que nadie lo crea arreglado.
  const pH = H.parsearPestana(hoja(ENC, [filaItzel()]), { fila: 0, columna: 1 }, null);
  const pB = B.parsearPestana(hoja(ENC, [filaItzel()]), { fila: 0, columna: 1 }, null);
  const tH = [...pH.personas.values()][0].total, tB = [...pB.personas.values()][0].total;
  console.log('    total de la fila → HEAD ' + tH + '  ·  BASE ' + tB + '  (la celda «Total» dice 5300)');
  af(() => tH === 5300 && tB === 5300,
     () => '🔴 el total de la fila cambió con esta tuerca: HEAD ' + tH + ' vs BASE ' + tB);
  af(() => H.mapearColumnas(ENC).total === B.mapearColumnas(ENC).total,
     'la columna del Total se movió: esta tuerca no debía tocarla');
}

// ── [E] la pantalla pinta el testigo (y calla cuando no hay nada) ───────────
console.log('\n  [E] la pantalla, con la función REAL de la UI');
{
  const vm = require('vm');
  const pant = (dir) => {
    const src = fs.readFileSync(path.join(dir, 'kamehouse-eventos.js'), 'utf8');
    const c = { document: { getElementById: () => null }, window: {}, showToast: () => {}, console: { log: () => {} } };
    vm.createContext(c); vm.runInContext(src, c, { filename: 'kamehouse-eventos.js' });
    return c;
  };
  const cH = pant(RAIZ), cB = pant(b.dir);
  af(() => typeof cH._excelTestigoPreventaHtml === 'function', '🔴 el pintor del testigo no existe');
  af(() => typeof cB._excelTestigoPreventaHtml !== 'function', '🔒 CONTROL POSITIVO: BASE ya lo tenía');
  const FUENTE = fs.readFileSync(path.join(RAIZ, 'kamehouse-eventos.js'), 'utf8');
  af(() => (FUENTE.match(/\$\{_excelTestigoPreventaHtml\(/g) || []).length === 1,
     '🔴 nadie lo llama: un pintor sin llamador no pinta nada');
  const din = cH._excelTestigoPreventaHtml({ dinero: 1, descuento: 0, no_se_puede_decir: 0,
    aviso: 'hay que RE-DECIDIR la regla', columna_abonado: true,
    como_dinero: [{ nombre: 'Alguien de Pal Norte', preventa: 200, suma_sin_preventa: 5300, abonado_declarado: 5500 }] });
  af(() => /alert-error/.test(din) && /Alguien de Pal Norte/.test(din) && /RE-DECIDIR/.test(din),
     () => '🔴 el aviso de DINERO no se pinta con su nombre: ' + din.slice(0, 120));
  const nada = cH._excelTestigoPreventaHtml({ dinero: 0, descuento: 9, no_se_puede_decir: 0, columna_abonado: true, como_dinero: [] });
  af(() => nada === '', '🔴 con todo en descuento pinta letrero: un «todo bien» permanente se vuelve invisible');
  const hueco = cH._excelTestigoPreventaHtml({ dinero: 0, descuento: 0, no_se_puede_decir: 2, columna_abonado: false, como_dinero: [] });
  af(() => /NO se pudieron juzgar/.test(hueco) && /no trae columna/.test(hueco),
     () => '🔴 el hueco se calla: callarlo lo volvería un verde — ' + hueco.slice(0, 100));
  af(() => cH._excelTestigoPreventaHtml(null) === '', 'con el testigo en null truena o pinta');
}

completo = true;
marcador();
process.exit(r === 0 && v > 0 ? 0 : 1);
