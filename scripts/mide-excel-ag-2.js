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

console.log('\n[S] 🔴 SOBREVENDIDA: sale AUNQUE también se cierre');
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
  // ⚠️ Plata aquí trae `Restan 0`, que NO es sobrevendida: esta aserción pasa por
  // la razón correcta, y por eso NO era la que cazaba el defecto de abajo.
  af(() => !rr.sobrevendidas.some((x) => x.zona === 'Plata'), 'un Restan 0 en zona `prox` salió como sobrevendida');

  // ══ 🔴 EL CASO QUE CAZÓ JANE: UNA ZONA `prox` SOBREVENDIDA SÍ TIENE QUE GRITAR
  // El candado de `prox` se estaba TRAGANDO el aviso: caía en `prox_saltadas` y
  // nunca salía en `sobrevendidas`. 🔒 Su formulación es la ley: **el candado
  // protege la VENTA, pero un AVISO NO ES UNA VENTA.** Que no se pueda cerrar una
  // zona no vuelve invisible que alguien vendió lugares de más en ella.
  // Mi careo NO lo cazaba porque mi fixture de `prox` tenía `Restan 0`: la
  // aserción pasaba en vacío sobre el caso que importaba.
  {
    // VIP: prox:1 Y Restan −1 — las dos cosas a la vez, que es el caso real.
    const fichaProxNeg = FICHA.map((z) => z.n === 'VIP' ? { n: 'VIP', ag: false, prox: true } : z);
    const conPed = FILAS.map((f) => f.slice());
    conPed[5][3] = '6';                       // VIP: Pedido 0 → 6, Restan sigue en −1
    const pn = D.clasificar({ filas: conPed, fichaZonas: fichaProxNeg,
                              pestana: 'Ricardo Arjona - 5 de diciembre', eventoId: 'arjona' });
    const sv = pn.sobrevendidas.find((x) => x.zona === 'VIP');
    console.log('    VIP prox:1 + Restan −1 → grita: ' + !!sv
      + '  ·  en prox_saltadas: ' + pn.prox_saltadas.some((x) => x.zona === 'VIP')
      + '  ·  cerrada: ' + pn.cerradas.some((x) => x.zona === 'VIP'));
    af(() => !!sv,
       '\u{1F534} una zona `prox` SOBREVENDIDA no grita: el candado se tragó el aviso (el defecto de Jane)');
    af(() => sv && sv.aviso === 'SOBREVENDIDA -1', 'el aviso no trae el número: «' + (sv && sv.aviso) + '»');
    af(() => sv && sv.prox === true, 'el aviso no dice que la zona es `prox`');
    af(() => sv && /PRÓXIMAMENTE/.test(sv.motivo),
       'el motivo no explica que no se cierra pero el sobrecupo es real');
    // 🔒 Y LA VENTA SIGUE PROTEGIDA: grita, pero NO se cierra.
    af(() => !pn.cerradas.some((x) => x.zona === 'VIP'),
       '\u{1F534} al arreglar el aviso se rompió el candado: una zona `prox` se CERRÓ');
    af(() => pn.prox_saltadas.some((x) => x.zona === 'VIP'), 'la zona `prox` dejó de salir en su propio montón');
    af(() => pn.prox_saltadas.find((x) => x.zona === 'VIP').sobrevendida === true,
       'el montón de prox no dice que esa zona además está sobrevendida');
  }
  // CONTROL POSITIVO: sin `prox`, esa MISMA zona sí se cierra.
  af(() => cls().cerradas.some((x) => x.zona === 'Plata'),
     '🔴 CONTROL POSITIVO: sin `prox` Plata TENÍA que cerrarse — el candado no es el que decide');
}

// ═══ [C] 🔴 EL SITIO DE LA FICHA — donde un error CORROMPE EL CATÁLOGO ═════
// Medido en ZONA-EXCEL-MANDA-1: en un multifecha las zonas viven en SEIS sitios.
// Para `karolg#1` el `ag` va en `multifecha[1]` y JAMÁS en las globales — tocarlas
// cerraría la zona para LAS TRES fechas.
console.log('\n[C] el `ag` se escribe en multifecha[idx], y lo de al lado queda BYTE A BYTE');
{
  // Ficha con la FORMA real de karolg: globales + 3 fechas, «Poniente Baja» en todas.
  const z = (n, extra) => '{"n":"' + n + '"' + (extra || '') + '}';
  const lista = (sufijo) => '[' + z('VIP A', ',"p":9200') + ',' + z('Poniente Baja', ',"p":7200' + (sufijo || '')) + ',' + z('Norte General', ',"p":4600,"ag":1') + ']';
  const FICHA_ROW = {
    zonas: lista(), cheap_zonas: lista(),
    multifecha: '[{"lbl":"6 Noviembre","zonas":' + lista() + ',"cheapZonas":' + lista() + '},'
              + '{"lbl":"7 Noviembre","zonas":' + lista() + ',"cheapZonas":' + lista() + '},'
              + '{"lbl":"8 Noviembre","zonas":' + lista() + ',"cheapZonas":' + lista() + '}]',
  };
  const r = D.aplicarAgEnFicha(Object.assign({}, FICHA_ROW,
    { eventoId: 'karolg#1', zona: 'Poniente Baja', ag: true }));
  console.log('    tocadas: ' + r.detalle.tocadas + ' · donde: ' + JSON.stringify(r.detalle.donde));
  af(() => !r.error, 'error: ' + r.error);
  af(() => r.detalle.tocadas === 2, 'tenía que tocar 2 sitios (zonas y cheapZonas de la fecha), tocó ' + r.detalle.tocadas);
  af(() => JSON.stringify(r.detalle.donde) === '["multifecha[1].zonas","multifecha[1].cheapZonas"]',
     'los sitios tocados no son los de la fecha 1: ' + JSON.stringify(r.detalle.donde));
  // 🔴 LO QUE NO SE TOCA, BYTE A BYTE
  af(() => r.cambios.zonas === undefined,
     '\u{1F534} SE TOCÓ `zonas` GLOBAL: eso cierra la zona para LAS TRES fechas');
  af(() => r.cambios.cheap_zonas === undefined, '\u{1F534} SE TOCÓ `cheap_zonas` GLOBAL');
  af(() => typeof r.cambios.multifecha === 'string', 'no devolvió el multifecha nuevo');
  // Las OTRAS fechas, byte a byte
  const trozos = (t) => D.partirArreglo(t).partes;
  const antes = trozos(FICHA_ROW.multifecha), desp = trozos(r.cambios.multifecha);
  af(() => antes.length === desp.length && desp.length === 3, 'cambió el número de fechas');
  af(() => desp[0] === antes[0], '\u{1F534} la fecha [0] CAMBIÓ — se escribió en la fecha equivocada');
  af(() => desp[2] === antes[2], '\u{1F534} la fecha [2] CAMBIÓ');
  af(() => desp[1] !== antes[1], 'la fecha [1] NO cambió: no se escribió nada');
  // Y dentro de la fecha 1, SOLO esa zona
  // ⚠️ NO se mide la POSICIÓN de la llave: `ponerAg` la inserta junto a `"n"`, que
  // es la única que siempre existe, así que sale `{"n":…,"ag":1,"p":…}`. Mi primera
  // aserción exigía `…,"p":7200,"ag":1}` y salió ROJA contra código correcto: medía
  // el ORDEN de las llaves —cosmética— en vez del HECHO. El compilador hace
  // JSON.parse, así que lo que importa es el OBJETO, no la cadena.
  {
    const fecha1 = JSON.parse(desp[1]);
    const pb = fecha1.zonas.find((x) => x.n === 'Poniente Baja');
    af(() => pb && pb.ag === 1, 'la zona no quedó con ag:1 (parseado): ' + JSON.stringify(pb));
    af(() => pb && pb.p === 7200, '🔴 se perdió el PRECIO al escribir el ag: ' + JSON.stringify(pb));
    const pbc = fecha1.cheapZonas.find((x) => x.n === 'Poniente Baja');
    af(() => pbc && pbc.ag === 1, 'la cheapZonas de la fecha no quedó con ag:1');
  }
  af(() => (desp[1].match(/"n":"VIP A","p":9200\}/g) || []).length === 2,
     '\u{1F534} se tocó «VIP A», que no era la zona');
  af(() => (desp[1].match(/"ag":1/g) || []).length === 4,
     'los `ag:1` de la fecha 1 debían ser 4 (2 de Norte General + 2 nuevos), son '
     + (desp[1].match(/"ag":1/g) || []).length);
  // 🔒 Y EL JSON SIGUE SIENDO JSON (parsear no es funcionar, pero no parsear SÍ es romper)
  af(() => { JSON.parse(r.cambios.multifecha); return true; }, '\u{1F534} el multifecha resultante NO PARSEA');
  af(() => JSON.parse(r.cambios.multifecha)[1].zonas.find((x) => x.n === 'Poniente Baja').ag === 1,
     'parseado, la zona no trae ag:1');

  // ── ABRIR (reactivar) ──
  const ab = D.aplicarAgEnFicha(Object.assign({}, FICHA_ROW,
    { eventoId: 'karolg#0', zona: 'Norte General', ag: false }));
  af(() => ab.detalle.tocadas === 2, 'abrir tocaba 2 sitios, tocó ' + ab.detalle.tocadas);
  af(() => /"n":"Norte General","p":4600,"ag":0/.test(trozos(ab.cambios.multifecha)[0]),
     'al abrir no quedó en ag:0');
  af(() => trozos(ab.cambios.multifecha)[1] === antes[1], 'al abrir la fecha [0] se tocó la [1]');
  // 🔒 Abrir una zona que NUNCA tuvo `ag` es un NO-OP: no se inventa la llave.
  const noop = D.aplicarAgEnFicha(Object.assign({}, FICHA_ROW,
    { eventoId: 'karolg#0', zona: 'VIP A', ag: false }));
  af(() => noop.detalle.tocadas === 0,
     'abrir una zona sin `ag` escribió algo: una llave que nadie puso no la añade un cierre que no ocurrió');

  // ── FECHA ÚNICA: ahí SÍ van las globales ──
  const uni = D.aplicarAgEnFicha(Object.assign({}, FICHA_ROW,
    { eventoId: 'arjona', zona: 'Poniente Baja', ag: true }));
  af(() => uni.detalle.tocadas === 2 && uni.cambios.zonas && uni.cambios.cheap_zonas,
     'en un evento de fecha única tenían que tocarse las dos globales');
  af(() => uni.cambios.multifecha === undefined, 'en fecha única se tocó el multifecha');

  // ── LOS ERRORES SE DICEN, no se devuelven vacíos ──
  const mal = D.aplicarAgEnFicha({ zonas: FICHA_ROW.zonas, cheap_zonas: FICHA_ROW.cheap_zonas,
    multifecha: FICHA_ROW.multifecha, eventoId: 'karolg#9', zona: 'Poniente Baja', ag: true });
  af(() => !!mal.error && /fecha #9/.test(mal.error), 'una fecha que no existe no dice el motivo');
  const noZona = D.aplicarAgEnFicha(Object.assign({}, FICHA_ROW,
    { eventoId: 'karolg#1', zona: 'Zona Que No Existe', ag: true }));
  af(() => noZona.detalle.tocadas === 0, 'una zona inexistente tocó algo');
}

console.log('\n[F] 🔒 SIN FICHA: se ignora y se LISTA');
{
  const rr = cls({ fichaZonas: FICHA.filter((z) => z.n !== 'Diamante') });
  af(() => rr.sin_ficha.some((x) => x.zona === 'Diamante'), 'la zona sin ficha no se listó');
  af(() => !rr.cerradas.some((x) => x.zona === 'Diamante')
        && !rr.reactivadas.some((x) => x.zona === 'Diamante'),
     '🔴 se gobernó una zona que la ficha no tiene');
  af(() => rr.sin_ficha[0] && /no existe en la ficha/.test(rr.sin_ficha[0].motivo), 'el motivo no dice por qué');
  // ⚠️ Y si además está sobrevendida, el número VIAJA en su renglón — la lógica de
  // Jane un nivel más allá: no se gobierna, pero el sobrecupo es real.
  {
    const sinNeg = D.clasificar({ filas: FILAS, pestana: 'x', eventoId: 'arjona',
      fichaZonas: FICHA.filter((z) => z.n !== 'Platino') });   // Platino: Restan −7
    const p = sinNeg.sin_ficha.find((x) => x.zona === 'Platino');
    af(() => p && p.sobrevendida === true, 'una zona sin ficha y sobrevendida no lo dice en su renglón');
    af(() => p && /SOBREVENDIDA -7/.test(p.motivo), 'el motivo no trae el número del sobrecupo');
    // 🔒 Y NO se cuela al montón de las gobernables.
    af(() => !sinNeg.sobrevendidas.some((x) => x.zona === 'Platino'),
       'una zona SIN ficha se coló a `sobrevendidas`: ese montón es de zonas que SÍ se pueden arreglar');
  }
}

// ═══ [F2] 🔒 EL ORDEN DE `sin_ficha` ES UN HECHO ═════════════════════
// Palabra de Memo (2-oct): las sobrevendidas van HASTA ARRIBA, por su Restan.
// Entre 176 renglones un −4 se pierde — y esas son las fichas que completa primero.
console.log('\n[F2] el orden del listado sin_ficha');
{
  // Ninguna zona en la ficha: las 6 caen a sin_ficha, con Restan 1,2,0,2,−1,−7.
  const rr = D.clasificar({ filas: FILAS, fichaZonas: [], pestana: 'x', eventoId: 'arjona' });
  const orden = rr.sin_ficha.map((x) => x.zona + '(' + x.restan + ')');
  console.log('    orden: ' + orden.join(' · '));
  af(() => rr.sin_ficha.length === 6, 'cayeron ' + rr.sin_ficha.length + ' a sin_ficha, eran 6');
  af(() => rr.sin_ficha_sobrevendidas === 2, 'el conteo de sobrevendidas sin ficha dio ' + rr.sin_ficha_sobrevendidas);
  // 🔴 Las dos negativas, ARRIBA, y la más negativa PRIMERO.
  af(() => rr.sin_ficha[0].zona === 'Platino' && rr.sin_ficha[0].restan === -7,
     '\u{1F534} la más negativa (−7) no quedó primera: quedó «' + rr.sin_ficha[0].zona + '»');
  af(() => rr.sin_ficha[1].zona === 'VIP' && rr.sin_ficha[1].restan === -1,
     'la segunda más negativa (−1) no quedó segunda');
  af(() => rr.sin_ficha.slice(0, 2).every((x) => x.sobrevendida),
     'las dos primeras no son las sobrevendidas');
  af(() => rr.sin_ficha.slice(2).every((x) => !x.sobrevendida),
     '\u{1F534} una sobrevendida quedó ENTERRADA bajo las demás');
  // 🔒 CONTROL POSITIVO DEL ORDEN: sin ordenar, el −7 NO sale primero — el
  // orden natural de lectura del bloque pone Diamante arriba. Si este control
  // pasara, el orden no lo estaría poniendo el código.
  const natural = ['Diamante', 'Oro', 'Plata', 'Primer Nivel', 'VIP', 'Platino'];
  af(() => natural[0] !== rr.sin_ficha[0].zona,
     'CONTROL POSITIVO: el primero coincide con el orden de lectura — el `sort` no está haciendo nada');
  // Y el número se VE en el motivo, no solo en un campo.
  af(() => /SOBREVENDIDA -7/.test(rr.sin_ficha[0].motivo), 'el número no se ve en el renglón');
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
