#!/usr/bin/env node
// =============================================================================
// mide:excel-ag-2 — EL INDEX OBEDECE EL BLOQUE «Disponibilidad» DEL EXCEL
// =============================================================================
// Las tres respuestas firmadas de Memo (2-oct-2026) son lo que este careo vigila:
//   1. `Restan` negativo AGOTA igual, pero sale con aviso propio «SOBREVENDIDA −N».
//   2. Las zonas sin ficha se IGNORAN y se LISTAN.
//   3. 🔒 Solo se CIERRA cuando `Pedido > 0`. Con `Pedido 0` jamás se toca la venta.
// Más el candado de `prox` (aprobado el 2-oct) y el de las REACTIVADAS como montón
// propio, que Memo pidió por una razón concreta: él agota zonas a propósito.
'use strict';
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const D = require(path.join(RAIZ, 'netlify/functions/_lib/excel-disponibilidad.js'));

let v = 0, r = 0;
const af = (c, m) => { let ok = false, ex = '';
  try { ok = !!(typeof c === 'function' ? c() : c); } catch (e) { ok = false; ex = ' [' + e.message + ']'; }
  if (ok) v++; else { r++; console.log('  ❌ ' + (typeof m === 'function' ? m() : m) + ex); } };

// ── LA PESTAÑA REAL DE ARJONA, copiada de la cosecha del 2-oct ───────────────
// 🔒 Es una FOTO y por eso el careo RECOMPUTA sobre ella. Trae el peligro dentro:
// `Pedido` DOS veces en la fila 0 — col 3 (boletos) y col 9 (TALLAS).
const FILAS = [
  ['', 'Disponibilidad', 'Precio', 'Pedido', 'Restan', '', 'Total', '', 'Tallas', 'Pedido', '', ''],
  ['', 'Diamante',       '$7,515', '30',     '1',      '', '-7',    '', 'XS',     '1',   '500', '499'],
  ['', 'Oro',            '$3,950', '10',     '2',      '', '',      '', 'S',      '10',  '500', '490'],
  ['', 'Plata',          '$3,490', '10',     '0',      '', '',      '', 'M',      '19',  '500', '481'],
  ['', 'Primer Nivel',   '$3,030', '10',     '2',      '', '',      '', 'L',      '12',  '500', '488'],
  ['', 'VIP',            '$0',     '0',      '-1',     '', '',      '', 'XL',     '0',   '500', '500'],
  ['', 'Platino',        '$0',     '0',      '-7',     '', '',      '', 'XXL',    '4',   '500', '496'],
  ['', '',               '',       '',       '',       '', '',      '', 'Total',  '46',  '3000', ''],
];
const FICHA = [
  { n: 'Diamante', ag: false }, { n: 'Oro', ag: false }, { n: 'Plata', ag: false },
  { n: 'Primer Nivel', ag: false }, { n: 'VIP', ag: false }, { n: 'Platino', ag: false },
];
const cls = (extra) => D.clasificar(Object.assign(
  { filas: FILAS, fichaZonas: FICHA, pestana: 'Ricardo Arjona - 5 de diciembre', eventoId: 'arjona' }, extra || {}));

console.log('\n═══ mide:excel-ag-2 ═══════════════════════════════════════════');

console.log('\n[A] 🔴 EL ANCLA: el Pedido es el de Disponibilidad, NO el de TALLAS');
{
  const ub = D.ubicarBloque(FILAS);
  console.log('    bloque en fila ' + ub.fila + ' col ' + ub.col + ' · pedido col ' + ub.cols.pedido);
  af(() => ub.hay, 'no ubicó el bloque');
  af(() => ub.cols.pedido === 3, '🔴 el Pedido leído es la col ' + ub.cols.pedido + ' — la 9 es TALLAS');
  // 🔒 CONTROL POSITIVO: la columna de Tallas EXISTE y dice OTRA COSA. Si las dos
  // dieran lo mismo, este careo no podría distinguir que se leyó la correcta.
  const tallas = FILAS.slice(1, 7).map((f) => f[9]);
  const bol = FILAS.slice(1, 7).map((f) => f[3]);
  console.log('    pedido de boletos: ' + bol.join(',') + '   ·   pedido de TALLAS: ' + tallas.join(','));
  af(() => JSON.stringify(tallas) !== JSON.stringify(bol),
     '🔴 CONTROL POSITIVO: Tallas y boletos traen los MISMOS números — el fixture no puede distinguir qué columna se leyó');
  const z = D.leerZonas(FILAS, ub);
  af(() => z.length === 6, 'leyó ' + z.length + ' zonas, eran 6');
  af(() => z[0].pedido === 30 && z[0].restan === 1, 'Diamante: pedido/restan mal (' + z[0].pedido + '/' + z[0].restan + ')');
  af(() => !z.some((x) => x.pedido === 19 || x.pedido === 12),
     '🔴 SE COLÓ UN NÚMERO DE TALLAS (19 = M, 12 = L) en el pedido de boletos');
  // 🔴 LA INVARIANTE DE VERDAD, y esta aserción cazó un defecto real: Tallas
  // tiene que quedar fuera del rango del bloque **en LAS DOS posiciones medidas**
  // (col 1 en 70 pestañas, col 2 en una). Con el ANCHO en 8 lo dejaba fuera por
  // UNA columna con el bloque en la 1, y lo metía DENTRO con el bloque en la 2.
  const COL_TALLAS = 9;
  af(() => (1 + D.ANCHO_BLOQUE) <= COL_TALLAS,
     'con el bloque en la col 1, el rango alcanza la columna de Tallas (' + (1 + D.ANCHO_BLOQUE) + ' > ' + COL_TALLAS + ')');
  af(() => (2 + D.ANCHO_BLOQUE) <= COL_TALLAS,
     '\u{1F534} con el bloque en la col 2 —la pestaña que SÍ existe— el rango alcanza Tallas: '
     + 'la «holgura» se come la defensa justo en el caso raro');
  // Y la segunda defensa, independiente: gana el PRIMER «Pedido» a la derecha.
  af(() => ub.cols.pedido < COL_TALLAS, 'el Pedido elegido no es el más cercano a Disponibilidad');
}

console.log('\n[B] 🔒 LA SEGURIDAD: con Pedido 0 NO se cierra — con su CONTROL POSITIVO');
{
  const r0 = cls();
  const nom = (a) => a.map((x) => x.zona).sort();
  console.log('    cerradas: ' + JSON.stringify(nom(r0.cerradas))
    + '  ·  vendo_sin_pedido: ' + JSON.stringify(nom(r0.vendo_sin_pedido)));
  af(() => nom(r0.cerradas).join() === 'Plata', 'cerradas tenía que ser solo Plata: ' + JSON.stringify(nom(r0.cerradas)));
  af(() => nom(r0.vendo_sin_pedido).join() === 'Platino,VIP',
     'vendo_sin_pedido tenía que ser VIP y Platino: ' + JSON.stringify(nom(r0.vendo_sin_pedido)));
  // 🔴 VIP y Platino tienen Restan NEGATIVO: sin la guarda se cerrarían.
  af(() => !r0.cerradas.some((x) => x.zona === 'VIP' || x.zona === 'Platino'),
     '🔴 SE CERRÓ una zona con Pedido 0: le apagó la venta a lo que SÍ se vende (el caso arjona)');
  // 🔒 CONTROL POSITIVO: la MISMA zona con Pedido > 0 SÍ se cierra. Sin este par,
  // «no cerró» no distingue «la guarda muerde» de «nunca llegué ahí».
  const conPedido = FILAS.map((f) => f.slice());
  conPedido[5][3] = '8';                        // VIP: Pedido 0 → 8
  const r1 = D.clasificar({ filas: conPedido, fichaZonas: FICHA, pestana: 'x', eventoId: 'arjona' });
  console.log('    con VIP a Pedido 8 → cerradas: ' + JSON.stringify(nom(r1.cerradas)));
  af(() => r1.cerradas.some((x) => x.zona === 'VIP'),
     '🔴 CONTROL POSITIVO: con Pedido 8 y Restan −1, VIP TENÍA que cerrarse — la guarda no es la que decide');
  af(() => !r1.vendo_sin_pedido.some((x) => x.zona === 'VIP'), 'VIP sigue en vendo_sin_pedido con Pedido 8');
  // Y el vacío NO es cero, pero tampoco cierra.
  const vacio = FILAS.map((f) => f.slice()); vacio[3][3] = '';
  const r2 = D.clasificar({ filas: vacio, fichaZonas: FICHA, pestana: 'x', eventoId: 'arjona' });
  af(() => !r2.cerradas.some((x) => x.zona === 'Plata'), 'con Pedido VACÍO se cerró Plata: el hueco no es un cero');
  af(() => r2.vendo_sin_pedido.some((x) => x.zona === 'Plata' && /VAC/.test(x.motivo)),
     'el Pedido vacío no se distingue del cero en el motivo');
}

console.log('\n[C] 🔴 SOBREVENDIDA: sale AUNQUE también se cierre');
{
  const conPedido = FILAS.map((f) => f.slice());
  conPedido[6][3] = '5';                        // Platino: Pedido 0 → 5, Restan −7
  const rr = D.clasificar({ filas: conPedido, fichaZonas: FICHA, pestana: 'Ricardo Arjona - 5 de diciembre', eventoId: 'arjona' });
  const sv = rr.sobrevendidas.find((x) => x.zona === 'Platino');
  console.log('    Platino (pedido 5, restan −7) → cerrada: ' + !!rr.cerradas.find((x) => x.zona === 'Platino')
    + ' · sobrevendida: ' + !!sv);
  af(() => !!rr.cerradas.find((x) => x.zona === 'Platino'), 'Platino no se cerró');
  af(() => !!sv, '🔴 Platino no salió en sobrevendidas: un −7 reportado solo como «agotada» ESCONDE el problema');
  af(() => sv && sv.aviso === 'SOBREVENDIDA -7', 'el aviso no dice el número: «' + (sv && sv.aviso) + '»');
  af(() => sv && /Ricardo Arjona/.test(sv.motivo), 'el aviso no nombra la PESTAÑA que hay que revisar');
  // Un Restan 0 NO es sobrevendida.
  af(() => !rr.sobrevendidas.some((x) => x.zona === 'Plata'), 'un Restan 0 se reportó como sobrevendida');
}

console.log('\n[D] 🔒 LAS REACTIVADAS, MONTÓN PROPIO — jamás mezcladas');
{
  const fichaAg = FICHA.map((z) => z.n === 'Oro' ? { n: 'Oro', ag: true } : z);
  const rr = cls({ fichaZonas: fichaAg });
  console.log('    Oro (ag en ficha, pedido 10 restan 2) → reactivadas: '
    + JSON.stringify(rr.reactivadas.map((x) => x.zona)));
  af(() => rr.reactivadas.some((x) => x.zona === 'Oro'), 'Oro no se propuso para reactivar');
  af(() => !rr.cerradas.some((x) => x.zona === 'Oro'), '🔴 Oro salió en CERRADAS: los dos montones se mezclaron');
  af(() => rr.reactivadas.every((x) => x.ag_de === true && x.ag_a === false), 'la reactivación no dice el de/a');
  af(() => rr.reactivadas.some((x) => /a propósito/.test(x.motivo)),
     'la reactivación no avisa de que Memo agota zonas a propósito');
  // 🔒 Y una zona YA cerrada que el Excel confirma cerrada NO se re-propone.
  const fichaPlata = FICHA.map((z) => z.n === 'Plata' ? { n: 'Plata', ag: true } : z);
  const r2 = cls({ fichaZonas: fichaPlata });
  af(() => !r2.cerradas.some((x) => x.zona === 'Plata'), 'se re-propuso cerrar una zona YA cerrada');
}

console.log('\n[E] 🔒 EL CANDADO DE `prox` (aprobado 2-oct)');
{
  const fichaProx = FICHA.map((z) => z.n === 'Plata' ? { n: 'Plata', ag: false, prox: true } : z);
  const rr = cls({ fichaZonas: fichaProx });
  console.log('    Plata en PRÓXIMAMENTE (pedido 10, restan 0) → prox_saltadas: '
    + JSON.stringify(rr.prox_saltadas.map((x) => x.zona)));
  af(() => rr.prox_saltadas.some((x) => x.zona === 'Plata'), 'la zona `prox` no salió en su montón');
  af(() => !rr.cerradas.some((x) => x.zona === 'Plata'),
     '🔴 SE CERRÓ una zona `prox`: le cambia el letrero de PRÓXIMAMENTE a AGOTADO, que es lo contrario de lo que pasa');
  af(() => !rr.sobrevendidas.some((x) => x.zona === 'Plata'), 'una zona `prox` salió en sobrevendidas');
  // CONTROL POSITIVO: sin `prox`, esa MISMA zona sí se cierra.
  af(() => cls().cerradas.some((x) => x.zona === 'Plata'),
     '🔴 CONTROL POSITIVO: sin `prox` Plata TENÍA que cerrarse — el candado no es el que decide');
}

console.log('\n[F] 🔒 SIN FICHA: se ignora y se LISTA');
{
  const rr = cls({ fichaZonas: FICHA.filter((z) => z.n !== 'Diamante') });
  af(() => rr.sin_ficha.some((x) => x.zona === 'Diamante'), 'la zona sin ficha no se listó');
  af(() => !rr.cerradas.some((x) => x.zona === 'Diamante')
        && !rr.reactivadas.some((x) => x.zona === 'Diamante'),
     '🔴 se gobernó una zona que la ficha no tiene');
  af(() => rr.sin_ficha[0] && /no existe en la ficha/.test(rr.sin_ficha[0].motivo), 'el motivo no dice por qué');
}

console.log('\n[G] la posición del bloque VARÍA, y el fixture lo prueba');
{
  // Medido: 70 pestañas traen el bloque en col 1 y UNA en col 2.
  const corrido = FILAS.map((f) => [''].concat(f));
  const ub = D.ubicarBloque(corrido);
  af(() => ub.hay && ub.col === 2, 'con el bloque corrido una columna no lo encontró en la col 2');
  af(() => ub.cols.pedido === 4, 'los encabezados no se movieron con el bloque: pedido quedó en ' + ub.cols.pedido);
  const z = D.leerZonas(corrido, ub);
  af(() => z.length === 6 && z[0].pedido === 30,
     '🔴 corrido una columna lee mal: un índice FIJO habría roto esta pestaña');
  // Y sin bloque, se DICE — no se devuelve vacío en silencio.
  const sin = D.clasificar({ filas: [['a','b'],['c','d']], fichaZonas: FICHA });
  af(() => sin.ok === false && /Disponibilidad/.test(sin.motivo),
     'sin bloque no dice el motivo: un vacío sin razón se lee como «no había nada que cambiar»');
}

console.log('\n[H] `regla_zona`: UNA pestaña, VARIAS fechas (coronacapital)');
{
  const CORONA = [
    ['', 'Disponibilidad', 'Precio', 'Pedido', 'Restan'],
    ['', 'General',         '$0', '17', '0'],
    ['', 'General Viernes', '$0', '19', '8'],
    ['', 'General Sabado',  '$0', '19', '-3'],
    ['', 'General Domingo', '$0', '19', '15'],
  ];
  const fic = [{ n: 'General', ag: false }, { n: 'General Viernes', ag: false },
               { n: 'General Sabado', ag: false }, { n: 'General Domingo', ag: false }];
  const v0 = D.clasificar({ filas: CORONA, fichaZonas: fic, reglaZona: 'General Viernes', eventoId: 'coronacapital#0' });
  const v5 = D.clasificar({ filas: CORONA, fichaZonas: fic, reglaZona: 'General', eventoId: 'coronacapital#5' });
  console.log('    #0 (General Viernes) → ' + v0.zonas_leidas + ' zona · #5 (General) → ' + v5.zonas_leidas + ' zona');
  af(() => v0.zonas_leidas === 1 && v5.zonas_leidas === 1,
     'la regla_zona no reparte 1 zona por evento-fecha: ' + v0.zonas_leidas + '/' + v5.zonas_leidas);
  // 🔒 «General» es PREFIJO de «General Viernes»: la regla casa por zona EXACTA
  // normalizada, no por prefijo. Si casara por prefijo, #5 se llevaría las cuatro.
  af(() => v5.zonas_leidas === 1,
     '🔴 la regla «General» se llevó ' + v5.zonas_leidas + ' zonas: está casando por PREFIJO');
  af(() => v5.cerradas.length === 1 && v5.cerradas[0].zona === 'General',
     '#5 tenía que cerrar «General» (pedido 17, restan 0)');
  af(() => v0.cerradas.length === 0, '#0 no tenía que cerrar nada (restan 8)');
  const v1 = D.clasificar({ filas: CORONA, fichaZonas: fic, reglaZona: 'General Sabado', eventoId: 'coronacapital#1' });
  af(() => v1.sobrevendidas.length === 1 && v1.cerradas.length === 1,
     '#1 (restan −3) tenía que cerrarse Y salir como sobrevendida');
}

console.log('\n' + (r === 0
  ? (v === 0 ? '⚠️  NADA MEDIDO · esto NO es un verde' : '✅ VERDE · ' + v + ' en verde, 0 en rojo')
  : '🔴 ROJO · ' + v + ' en verde, ' + r + ' en rojo'));
process.exit(r === 0 && v > 0 ? 0 : 1);
