// =============================================================================
// _lib/excel-disponibilidad — EL BLOQUE «Disponibilidad» DEL EXCEL (EXCEL-AG-1)
// =============================================================================
// Regla firmada de Memo (1-oct-2026), citada:
//   «La columna Pedido son los boletos que SÍ tenemos. Cuando Restan llega a 0,
//    esa zona se agota y listo. Si agrego boletos al Pedido, la zona se reactiva
//    y seguimos vendiendo. Hay eventos (arjona, juniorh) donde el pedido llega a
//    0 pero seguimos vendiendo — necesito una marca para decirlo. Y hay eventos
//    SIN pedido (kevin kaarl) donde compro conforme se vende.»
//
// Y sus TRES respuestas de la fase 2 (2-oct-2026), que son las que gobiernan:
//   1. `Restan` NEGATIVO agota igual, **pero con aviso propio**: sale como
//      «SOBREVENDIDA −N» con su zona y su pestaña. Un −7 reportado como
//      «agotada» a secas esconde que hay gente con lugares de más.
//   2. Las zonas del Excel que NO existen en la ficha se IGNORAN y se LISTAN.
//      No se inventan 176 zonas de golpe: completar fichas es trabajo de
//      catálogo, no del careo.
//   3. 🔒 LA REGLA DE SEGURIDAD: **solo se puede CERRAR cuando `Pedido > 0`.**
//      Con `Pedido 0` jamás se toca la venta — solo se avisa. Así no hace falta
//      una marca nueva por evento-fecha: las 4 zonas vivas de arjona, las 5 de
//      titodoble y las 2 de juniorh quedan protegidas POR CONSTRUCCIÓN.
//
// 🔴🔒 EL ANCLA, Y ES LA LEY DEL ANCLA CON CARA NUEVA: **EL LITERAL TAMPOCO ES
// ANCLA SI HAY DOS IGUALES EN LA MISMA FILA.** Medido en la pestaña real de
// arjona: `Pedido` aparece DOS veces en la fila 0 — la columna 3 (boletos) y la
// columna 9, que es el `Pedido` de **TALLAS** (XS 1 · S 10 · M 19 · L 12 · XL 0
// · XXL 4). Anclar por el nombre de la columna leería **camisetas como lugares**.
// Por eso el ancla es la POSICIÓN RELATIVA a la celda «Disponibilidad», y el
// careo trae el control positivo de que la otra columna NO se lee.
// ⚠️ Y la posición del bloque VARÍA: medido sobre las 71 pestañas activas, 70 lo
// traen en la columna 1 y UNA en la columna 2. Un índice fijo leería mal esa.
'use strict';
const { normalizarZona } = require('./normalizar-zona');

// Cuántas filas se miran buscando el bloque. En las 71 pestañas reales vive en
// la fila 0; 30 es holgura de sobra sin volver el error inútil.
const MAX_FILAS_BLOQUE = 30;
// Cuántas columnas a la DERECHA de «Disponibilidad» se aceptan como suyas.
// 🔴 ESTE NÚMERO ES UN CANDADO, NO UNA HOLGURA, Y SU PRIMERA VERSIÓN ESTABA MAL.
// Lo puse en 8 «por holgura» y el careo lo cazó: con el bloque en la columna 1 eso
// deja el `Pedido` de TALLAS (columna 9) fuera **por UNA sola columna**, y medido
// sobre las 71 pestañas hay UNA donde el bloque vive en la columna 2 — ahí Tallas
// habría ENTRADO al rango. La «holgura» se comía la defensa justo en el caso raro.
// Lo que de verdad se necesita son 3 columnas (Precio +1, Pedido +2, Restan +3);
// 5 deja margen para un bloque con una columna de más y aún así Tallas queda fuera
// en las DOS posiciones medidas. El careo lo afirma para las dos.
// ⚠️ Y hay una segunda defensa, independiente: gana el PRIMER «Pedido» a la derecha,
// y el del bloque siempre está más cerca que el de Tallas. Las dos se quedan: una
// sola bastaría hoy, y es justo por eso que no se sabe cuál fallaría mañana.
const ANCHO_BLOQUE = 5;

const _txt = (x) => String(x == null ? '' : x).trim();
const _norm = (x) => _txt(x).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

// Un número del Excel puede venir como "$7,515", "30", "-7", "" o null.
// 🔒 El VACÍO no es CERO: «no capturado» y «cero» son dos cosas, y confundirlas
// es lo que hace que un hueco se lea como una afirmación.
function leerNum(celda) {
  const t = _txt(celda);
  if (!t) return null;
  const limpio = t.replace(/[$\s,]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

// ── DÓNDE ESTÁ EL BLOQUE ────────────────────────────────────────────────────
// Devuelve { fila, col, cols:{precio,pedido,restan} } o un motivo.
function ubicarBloque(filas) {
  const F = Array.isArray(filas) ? filas : [];
  for (let i = 0; i < Math.min(F.length, MAX_FILAS_BLOQUE); i++) {
    const f = F[i] || [];
    for (let j = 0; j < f.length; j++) {
      if (_norm(f[j]) !== 'disponibilidad') continue;
      // 🔒 Los encabezados del bloque se buscan **a la derecha de esta celda y en
      // SU MISMA FILA**, dentro de ANCHO_BLOQUE. Ésa es toda la defensa contra
      // el `Pedido` de Tallas: no está en el rango, así que no existe para aquí.
      const cols = {};
      for (let k = j; k < Math.min(f.length, j + ANCHO_BLOQUE); k++) {
        const t = _norm(f[k]);
        if (t === 'precio' && cols.precio == null) cols.precio = k;
        if (t === 'pedido' && cols.pedido == null) cols.pedido = k;
        if (t === 'restan' && cols.restan == null) cols.restan = k;
      }
      if (cols.pedido == null || cols.restan == null) {
        return { hay: false, motivo: 'el bloque «Disponibilidad» no trae Pedido y/o Restan',
                 fila: i, col: j, cols };
      }
      return { hay: true, fila: i, col: j, cols };
    }
  }
  return { hay: false, motivo: 'no hay celda «Disponibilidad» en las primeras '
           + MAX_FILAS_BLOQUE + ' filas' };
}

// ── LAS ZONAS DEL BLOQUE ────────────────────────────────────────────────────
function leerZonas(filas, ub) {
  const F = Array.isArray(filas) ? filas : [];
  const out = [];
  for (let i = ub.fila + 1; i < F.length; i++) {
    const f = F[i] || [];
    const zona = _txt(f[ub.col]);
    if (!zona) break;                      // el bloque termina en la primera vacía
    out.push({
      zona,
      precio: ub.cols.precio != null ? leerNum(f[ub.cols.precio]) : null,
      pedido: leerNum(f[ub.cols.pedido]),
      restan: leerNum(f[ub.cols.restan]),
      fila: i,
    });
  }
  return out;
}

// ── LA CLASIFICACIÓN ────────────────────────────────────────────────────────
// `fichaZonas`: [{ n, ag, prox }] de la ficha de ESE evento-fecha (del multifecha
// si lo hay). `reglaZona`: cuando una pestaña sirve a varias fechas, la zona que
// le toca a ésta (coronacapital: UNA pestaña, CUATRO evento-fecha).
function clasificar({ filas, fichaZonas, reglaZona, pestana, eventoId }) {
  const ub = ubicarBloque(filas);
  if (!ub.hay) {
    return { ok: false, motivo: ub.motivo, bloque: ub,
             cerradas: [], reactivadas: [], sobrevendidas: [],
             vendo_sin_pedido: [], sin_ficha: [], prox_saltadas: [] };
  }
  let zonas = leerZonas(filas, ub);
  // 🔒 `regla_zona` reparte UNA pestaña entre VARIAS fechas. Medido en Corona:
  // cada regla casa con EXACTAMENTE 1 zona del bloque, sin ambigüedad.
  if (reglaZona) {
    const k = normalizarZona(reglaZona);
    zonas = zonas.filter((z) => normalizarZona(z.zona) === k);
  }
  const porFicha = new Map();
  for (const z of (fichaZonas || [])) {
    const k = normalizarZona(z.n);
    const prev = porFicha.get(k);
    // Una zona puede venir de `zonas` y de `cheapZonas`: se funden, y basta que
    // UNA diga agotada para que lo esté.
    if (!prev) porFicha.set(k, { n: z.n, ag: !!z.ag, prox: !!z.prox });
    else { prev.ag = prev.ag || !!z.ag; prev.prox = prev.prox || !!z.prox; }
  }

  const cerradas = [], reactivadas = [], sobrevendidas = [],
        vendoSinPedido = [], sinFicha = [], proxSaltadas = [];

  for (const z of zonas) {
    const base = { zona: z.zona, pedido: z.pedido, restan: z.restan,
                   pestana: pestana || null, evento_id: eventoId || null };
    const f = porFicha.get(normalizarZona(z.zona));

    // (2) Sin ficha: se IGNORA y se LISTA. No se inventa la zona.
    if (!f) { sinFicha.push(Object.assign({}, base,
      { motivo: 'la zona del Excel no existe en la ficha: no se puede gobernar' })); continue; }

    // 🔒 EL TERCER ESTADO. `prox` no es «a la venta»: cerrarla no quita nada pero
    // le cambia el letrero de PRÓXIMAMENTE a AGOTADO, que es decirle al cliente
    // lo contrario de lo que pasa. Aprobado por Memo (2-oct).
    if (f.prox) { proxSaltadas.push(Object.assign({}, base, { zona_ficha: f.n,
      motivo: 'la zona está en PRÓXIMAMENTE: no está a la venta, así que no se cierra ni se abre' })); continue; }

    // 🔴 SOBREVENDIDA: sale SIEMPRE que `Restan < 0`, **aunque también se cierre**.
    // Son lugares vendidos de más sobre el pedido y alguien tiene que ir a esa
    // pestaña. Reportarlo solo como «agotada» es lo que esconde el problema.
    if (z.restan != null && z.restan < 0) {
      sobrevendidas.push(Object.assign({}, base, { zona_ficha: f.n,
        aviso: 'SOBREVENDIDA ' + z.restan,
        motivo: 'hay ' + Math.abs(z.restan) + ' lugar(es) vendidos de más sobre el pedido'
              + ' — revisar la pestaña «' + (pestana || '?') + '»' }));
    }

    // 🔒 LA REGLA DE SEGURIDAD, Y VA COMO CONDICIÓN DE ENTRADA, NO COMO FILTRO
    // POSTERIOR: con `Pedido` 0 o vacío NO se toca la venta. Puesta después de
    // decidir el cierre, sería una guarda que ya no alcanza a nada — la ley de
    // CUADRE-5, donde la regla quedó detrás de la tolerancia y no podía ocurrir.
    if (z.pedido == null || z.pedido <= 0) {
      vendoSinPedido.push(Object.assign({}, base, { zona_ficha: f.n, ag_hoy: f.ag,
        motivo: z.pedido == null
          ? 'el Pedido está VACÍO (no capturado): no se toca la venta'
          : 'Pedido 0: se compra conforme se vende, así que NO se cierra' }));
      continue;
    }

    // CERRAR ⟺ Pedido > 0 Y Restan ≤ 0
    if (z.restan != null && z.restan <= 0) {
      if (f.ag) continue;                   // ya está cerrada: nada que proponer
      cerradas.push(Object.assign({}, base, { zona_ficha: f.n, ag_de: false, ag_a: true,
        motivo: 'el pedido de ' + z.pedido + ' se agotó (Restan ' + z.restan + ')' }));
      continue;
    }
    // REACTIVAR ⟺ Pedido > 0 Y Restan > 0 Y hoy está cerrada
    // 🔒 MONTÓN PROPIO, JAMÁS MEZCLADO CON LAS CERRADAS (palabra de Memo): él a
    // veces agota zonas A PROPÓSITO —el caso straykids/solo-viaje— y una
    // reactivación propuesta encima de un cierre suyo tiene que VERSE antes de
    // aplicarse.
    if (z.restan != null && z.restan > 0 && f.ag) {
      reactivadas.push(Object.assign({}, base, { zona_ficha: f.n, ag_de: true, ag_a: false,
        motivo: 'quedan ' + z.restan + ' de un pedido de ' + z.pedido
              + ' — ⚠️ si la agotaste a propósito, NO la apliques' }));
    }
  }

  return { ok: true, bloque: { fila: ub.fila, col: ub.col, cols: ub.cols },
           zonas_leidas: zonas.length,
           cerradas, reactivadas, sobrevendidas,
           vendo_sin_pedido: vendoSinPedido, sin_ficha: sinFicha,
           prox_saltadas: proxSaltadas };
}

module.exports = { clasificar, ubicarBloque, leerZonas, leerNum,
                   MAX_FILAS_BLOQUE, ANCHO_BLOQUE };
