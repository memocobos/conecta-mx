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
    if (!f) {
      // ⚠️ LA MISMA LÓGICA DE JANE, UN NIVEL MÁS ALLÁ: si no se puede gobernar, el
      // sobrecupo **sigue siendo real**. No se cambia la regla de Memo — estas zonas
      // se siguen IGNORANDO— pero se LISTAN MEJOR: el número viaja en su propio
      // renglón. Medido: son 9 zonas (karolg#0 «Club Seat» −4, juniorh «Mesa
      // Rockstar» −4…). Listarlas sin decir que están sobrevendidas sería
      // esconder un dato dentro de un montón que nadie lee con lupa.
      // 🔒 NO entran a `sobrevendidas` porque ese montón es de zonas gobernables y
      // mezclarlas pediría a alguien ir a arreglar lo que no tiene ficha. Que Memo
      // decida si quiere que griten ahí también.
      const neg = z.restan != null && z.restan < 0;
      sinFicha.push(Object.assign({}, base, {
        sobrevendida: neg,
        motivo: 'la zona del Excel no existe en la ficha: no se puede gobernar'
              + (neg ? ' — ⚠️ y además está SOBREVENDIDA ' + z.restan : '') }));
      continue;
    }

    // 🔴 SOBREVENDIDA PRIMERO, Y EL ORDEN ES EL ARREGLO — lo cazó Jane:
    // el candado de `prox` se estaba TRAGANDO este aviso. Una zona `prox` con
    // `Restan < 0` caía en `prox_saltadas` y nunca gritaba.
    // 🔒 SU FORMULACIÓN ES LA LEY: **el candado protege la VENTA, pero un AVISO
    // NO ES UNA VENTA.** Que no se pueda cerrar una zona no vuelve invisible que
    // alguien vendió lugares de más en ella. Misma familia que el `revento` de
    // CAREO-RED-1 y el de la ronda final del sorteo: el orden de los `if` no es
    // cosmética, decide qué se llega a reportar.
    // Sale SIEMPRE que `Restan < 0`: **aunque también se cierre** y **aunque sea
    // `prox`**. Son lugares vendidos de más y alguien tiene que ir a esa pestaña.
    if (z.restan != null && z.restan < 0) {
      sobrevendidas.push(Object.assign({}, base, { zona_ficha: f.n,
        aviso: 'SOBREVENDIDA ' + z.restan,
        prox: !!f.prox,
        motivo: 'hay ' + Math.abs(z.restan) + ' lugar(es) vendidos de más sobre el pedido'
              + ' — revisar la pestaña «' + (pestana || '?') + '»'
              + (f.prox ? ' · ⚠️ la zona está en PRÓXIMAMENTE: no se cierra, pero el sobrecupo es real' : '') }));
    }

    // 🔒 EL TERCER ESTADO. `prox` no es «a la venta»: cerrarla no quita nada pero
    // le cambia el letrero de PRÓXIMAMENTE a AGOTADO, que es decirle al cliente
    // lo contrario de lo que pasa. Aprobado por Memo (2-oct).
    // ⚠️ VA DESPUÉS del aviso de sobrevendida, a propósito (ver arriba).
    if (f.prox) { proxSaltadas.push(Object.assign({}, base, { zona_ficha: f.n,
      sobrevendida: z.restan != null && z.restan < 0,
      motivo: 'la zona está en PRÓXIMAMENTE: no está a la venta, así que no se cierra ni se abre'
            + (z.restan != null && z.restan < 0 ? ' — pero su sobrecupo SÍ se reportó' : '') })); continue; }

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

  // 🔒 EL ORDEN DE `sin_ficha` ES UN HECHO, NO COSMÉTICA — palabra de Memo
  // (2-oct): las SOBREVENDIDAS van HASTA ARRIBA, ordenadas por su `Restan` (la más
  // negativa primero). **Entre 176 renglones un −4 se pierde**, y esas son
  // justamente las fichas que él va a completar primero. Un listado que entierra
  // su propio dato urgente es un listado que nadie lee dos veces.
  sinFicha.sort((a, b) => {
    const na = a.sobrevendida ? 1 : 0, nb = b.sobrevendida ? 1 : 0;
    if (na !== nb) return nb - na;                       // las sobrevendidas, arriba
    if (na) return (a.restan || 0) - (b.restan || 0);    // la más negativa, primero
    return String(a.evento_id || '').localeCompare(String(b.evento_id || ''))
        || String(a.zona).localeCompare(String(b.zona));
  });

  return { ok: true, bloque: { fila: ub.fila, col: ub.col, cols: ub.cols },
           zonas_leidas: zonas.length,
           cerradas, reactivadas, sobrevendidas,
           vendo_sin_pedido: vendoSinPedido, sin_ficha: sinFicha,
           sin_ficha_sobrevendidas: sinFicha.filter((x) => x.sobrevendida).length,
           prox_saltadas: proxSaltadas };
}

module.exports = { clasificar, ubicarBloque, leerZonas, leerNum,
                   MAX_FILAS_BLOQUE, ANCHO_BLOQUE };

// ═══════════════════════════════════════════════════════════════════════════
// APLICAR EL `ag` EN LA FICHA — la pieza donde un error corrompe el catálogo
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 EL SITIO NO ES OBVIO, Y YA LO MEDÍ EN ZONA-EXCEL-MANDA-1: en un multifecha
// las zonas viven en SEIS sitios (`zonas`, `cheap_zonas`, y dentro de cada fecha
// de `multifecha` sus `zonas` y `cheapZonas`). Para `karolg#1` el `ag` va en
// `multifecha[1]` y **jamás** en las globales: tocarlas cerraría la zona para
// LAS TRES fechas. El índice sale del sufijo del `evento_id`, que es la misma
// llave que ya usa `regla_zona`.
//
// 🔒 Y SE EDITA QUIRÚRGICAMENTE, NO RE-SERIALIZANDO. Parsear y volver a escribir
// el JSON entero cambiaría bytes que nadie pidió (orden de llaves, espaciado) y
// volvería imposible afirmar que las otras fechas quedaron igual. Aquí se parte
// el arreglo por BALANCE DE LLAVES, se toca SOLO el elemento que cambia y se
// rejunta con sus separadores originales — así el careo puede exigir que los
// hermanos queden byte a byte.

// Parte un texto `[{...},{...}]` en sus elementos de nivel 1, conservando lo que
// hay ENTRE ellos (comas, espacios) para poder rejuntar sin inventar formato.
function partirArreglo(texto) {
  const t = String(texto == null ? '' : texto);
  const ini = t.indexOf('[');
  if (ini < 0) return null;
  const partes = [], seps = [];
  let d = 0, desde = -1, cursor = ini + 1, fin = -1;
  for (let i = ini + 1; i < t.length; i++) {
    const c = t[i];
    if (c === '{') { if (d === 0) { seps.push(t.slice(cursor, i)); desde = i; } d++; }
    else if (c === '}') { d--; if (d === 0) { partes.push(t.slice(desde, i + 1)); cursor = i + 1; } }
    else if (c === ']' && d === 0) { fin = i; break; }
  }
  if (fin < 0) return null;
  return { prefijo: t.slice(0, ini + 1), partes, seps, cola: t.slice(cursor, fin), sufijo: t.slice(fin) };
}
function juntarArreglo(p) {
  let out = p.prefijo;
  for (let i = 0; i < p.partes.length; i++) out += (p.seps[i] != null ? p.seps[i] : (i ? ',' : '')) + p.partes[i];
  return out + p.cola + p.sufijo;
}

// Pone o quita `ag` en UN objeto de zona, sin tocar nada más de ese objeto.
// `ag:1` cuando se cierra; cuando se abre se pone `ag:0` si la llave existía, y
// si no existía NO se inventa — una llave que nadie escribió no la añade un
// cierre que no ocurrió.
function ponerAg(objTexto, ag) {
  const t = String(objTexto);
  if (/"ag"\s*:/.test(t)) return t.replace(/("ag"\s*:\s*)(?:true|false|-?\d+)/, '$1' + (ag ? 1 : 0));
  if (!ag) return t;                       // abrir algo que nunca estuvo cerrado: no-op
  // Se inserta junto al nombre, que es la llave que siempre existe.
  return t.replace(/("n"\s*:\s*"(?:[^"\\]|\\.)*")/, '$1,"ag":1');
}

// Cambia el `ag` de UNA zona dentro de un texto de arreglo de zonas.
// Devuelve { texto, tocadas } — `tocadas` es cuántos objetos cambiaron, y el
// llamador lo AFIRMA: cero significa que la zona no estaba, y más de uno que el
// nombre no es único.
function agEnArreglo(texto, zona, ag) {
  const p = partirArreglo(texto);
  if (!p) return { texto: texto, tocadas: 0, error: 'no es un arreglo' };
  const k = normalizarZona(zona);
  let tocadas = 0;
  p.partes = p.partes.map((o) => {
    const m = /"n"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(o);
    if (!m || normalizarZona(m[1]) !== k) return o;
    const nuevo = ponerAg(o, ag);
    if (nuevo !== o) tocadas++;
    return nuevo;
  });
  return { texto: juntarArreglo(p), tocadas };
}

// El sitio: para `slug#idx` es la fecha idx del multifecha; si no, las globales.
function sitioDe(eventoId) {
  const m = /^(.+?)#(\d+)$/.exec(String(eventoId || ''));
  return m ? { slug: m[1], idx: Number(m[2]), multifecha: true }
           : { slug: String(eventoId || ''), idx: null, multifecha: false };
}

// Aplica el cambio sobre los TRES campos de la fila de `esferas_eventos`.
// Devuelve solo los que CAMBIAN, para que el PATCH no toque lo que no movió.
function aplicarAgEnFicha({ zonas, cheap_zonas, multifecha, eventoId, zona, ag }) {
  const sitio = sitioDe(eventoId);
  const cambios = {}, detalle = { sitio, tocadas: 0, donde: [] };

  if (!sitio.multifecha) {
    for (const [campo, txt] of [['zonas', zonas], ['cheap_zonas', cheap_zonas]]) {
      if (!txt) continue;
      const r = agEnArreglo(txt, zona, ag);
      if (r.tocadas) { cambios[campo] = r.texto; detalle.tocadas += r.tocadas; detalle.donde.push(campo); }
    }
    return { cambios, detalle };
  }

  // MULTIFECHA: solo la fecha `idx`, y dentro de ella sus dos listas.
  if (!multifecha) return { cambios, detalle, error: 'el evento es multifecha y la ficha no trae `multifecha`' };
  const p = partirArreglo(multifecha);
  if (!p) return { cambios, detalle, error: '`multifecha` no es un arreglo legible' };
  if (!p.partes[sitio.idx]) return { cambios, detalle, error: 'la ficha no tiene la fecha #' + sitio.idx };

  let el = p.partes[sitio.idx];
  for (const llave of ['zonas', 'cheapZonas']) {
    // 🔒 Se corta la sub-lista por su llave Y por balance, no por `indexOf` de la
    // siguiente: el ancla también vive anidada, y un corte por texto cae dentro
    // del dato de adentro.
    const re = new RegExp('"' + llave + '"\\s*:\\s*\\[');
    const m = re.exec(el);
    if (!m) continue;
    const desde = m.index + m[0].length - 1;
    let d = 0, hasta = -1;
    for (let i = desde; i < el.length; i++) {
      if (el[i] === '[') d++;
      else if (el[i] === ']') { d--; if (d === 0) { hasta = i; break; } }
    }
    if (hasta < 0) continue;
    const sub = el.slice(desde, hasta + 1);
    const r = agEnArreglo(sub, zona, ag);
    if (r.tocadas) {
      el = el.slice(0, desde) + r.texto + el.slice(hasta + 1);
      detalle.tocadas += r.tocadas;
      detalle.donde.push('multifecha[' + sitio.idx + '].' + llave);
    }
  }
  if (detalle.tocadas) { p.partes[sitio.idx] = el; cambios.multifecha = juntarArreglo(p); }
  return { cambios, detalle };
}

module.exports.aplicarAgEnFicha = aplicarAgEnFicha;
module.exports.agEnArreglo = agEnArreglo;
module.exports.partirArreglo = partirArreglo;
module.exports.sitioDe = sitioDe;
