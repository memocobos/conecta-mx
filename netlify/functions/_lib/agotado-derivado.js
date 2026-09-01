// =============================================================================
// _lib/agotado-derivado — la SIMETRÍA de las listas gemelas, y el AVISO de stock
// =============================================================================
// [AG-STOCK-2, 1-sep-2026] EL NEGOCIO VENDE SOBRE PEDIDO. Firmado por Memo:
// «primero vendo lo comprado, y luego voy comprando más según me van pidiendo».
//
// ⚰️ POR ESO SE RETIRA LA DERIVACIÓN POR STOCK DE AG-STOCK-1. Aquella tuerca
// cerraba toda zona con stock ≤0 o sin pedido capturado, y esa regla está al
// revés para este modelo: la zona SIN pedido no es una zona sin boletos, es
// justo la que todavía no se ha comprado PORQUE nadie la ha pedido. Cerrarla
// mata la venta. Doce de las dieciséis zonas de interpol están en ese caso.
//
// 🔒 LO QUE SÍ SE FUERZA ES LA SIMETRÍA. La mordida real de calle24 no fue el
// stock: fueron DOS LISTAS PARA UNA MISMA ZONA FÍSICA con distinta respuesta —
// nueve zonas agotadas a mano en PLUS con el CHEAP entero a la venta. Si Memo
// cerró una zona, la cerró para el asiento, no para el paquete.
//
//   · zona con `ag` en `zonas` O en `cheapZonas` → sale con `ag` en LAS DOS.
//   · SIGUE SIENDO UNA SOLA DIRECCIÓN: se AGREGA `ag`, jamás se quita. Reabrir
//     lo que alguien cerró a mano es la dirección peligrosa, ayer y hoy.
//   · El par son LAS LISTAS GEMELAS, y en un multifecha cada fecha tiene el
//     suyo. Nunca ENTRE fechas: agotado la noche 1 no es agotado la noche 2.
//
// 📣 Y EL STOCK PASA A SER INFORMACIÓN, NO ACCIÓN: `avisosStock` nombra las
// zonas que quedan A LA VENTA sin pedido o con stock ≤0, para que Memo compre.
// Nombrar sin cerrar es lo que pide la venta sobre pedido.
//
// 🔒 UN EVENTO SIN COMPRAS CAPTURADAS NO SE AVISA, y se DICE por su nombre. Su
// stock todavía no vive en el Palacio, así que ahí no habría nada que medir:
// serían dieciséis avisos que sólo dicen «este evento no está en el Palacio».
// La omisión callada se lee como «los revisó todos», así que se reporta.
// =============================================================================

// Quién manda entre las listas se le pregunta al COMPILADOR, que es su dueño.
// Copiar aquí su orden de mando sería la segunda fuente que esta casa colecciona
// —y ya mordió con `cheapZonas`, que dejó de ser un espejo en ESF-E1c.
const C = require('./esferas-compile');

// Lo que el catálogo entiende por «no se vende»: el `ag` que ya usa el index.
const AGOTADA = 1;

// ⚠️ `prox` MANDA SOBRE `ag`, y no es opinión: los dos parsers del compilador
// escriben `ag: prox ? 0 : ag`. Una zona «próximamente» no está a la venta ni
// está agotada, y escribirle `ag` sería tinta muerta —el compilador la borra—
// que además le mentiría al reporte diciendo que este publish cerró algo.
// Medido el 1-sep sobre las 107 fichas: 7 zonas traen `prox`, CERO traen `prox`
// y `ag` a la vez, y CUATRO fechas de coronacapital tienen el PLUS agotado
// contra un CHEAP en `prox` — que parece la mordida de calle24 y no lo es.
//
// 🔒 QUÉ CUENTA COMO `ag` SE LE PREGUNTA AL COMPILADOR (`_esAg`/`_esProx`), no
// se escribe aquí. Su regla es estrecha —sólo `1`, `true` y `'1'`— y un
// predicado propio y más ancho aceptaría `ag:2` en esta pieza y no en el
// compilador: la zona saldría cerrada en una lista y abierta en la otra, que es
// EXACTAMENTE el defecto que la simetría vino a matar.
function _prox(z) { return !!C._esProx(z); }
function _ag(z) { return !_prox(z) && !!C._esAg(z); }
function _n(z) { return (z && typeof z.n === 'string') ? z.n.trim() : ''; }

// ── EL PAR DE GEMELAS ───────────────────────────────────────────────────────
// PURO. Recibe las dos listas y devuelve dos listas NUEVAS con el `ag` unido.
// No muta: quien compare el antes y el después necesita dos fotos de verdad y
// no dos punteros al mismo sitio.
//
// Se llavea POR NOMBRE dentro de UNA lista, y eso está MEDIDO, no supuesto:
// el 1-sep, sobre las 107 fichas y sus 274 listas, CERO listas repiten un
// nombre. (Colapsar por una llave no-única descarta filas en silencio; el
// careo vuelve a contarlo en cada corrida por si el catálogo cambia.)
function sincronizarPar(a, b) {
  const cerradas = new Set();
  [a, b].forEach((l) => (Array.isArray(l) ? l : []).forEach((z) => { if (_ag(z)) cerradas.add(_n(z)); }));
  if (!cerradas.size) return { a, b, cambiadas: [] };
  const cambiadas = [];
  const pasar = (lista, etq) => {
    if (!Array.isArray(lista)) return lista;
    let tocada = false;
    const nueva = lista.map((z) => {
      const n = _n(z);
      if (!n || !cerradas.has(n) || _ag(z) || _prox(z)) return z;
      tocada = true;
      cambiadas.push({ lista: etq, zona: n });
      return Object.assign({}, z, { ag: AGOTADA });
    });
    return tocada ? nueva : lista;
  };
  return { a: pasar(a, 'zonas'), b: pasar(b, 'cheapZonas'), cambiadas };
}

// ── LA FICHA ENTERA ─────────────────────────────────────────────────────────
// Recibe las listas YA PARSEADAS de una ficha (las columnas `zonas`,
// `cheap_zonas` y `multifecha` de Esferas) y devuelve las nuevas + qué cerró.
//
// 🔒 SE SINCRONIZA LA LISTA QUE EL COMPILADOR VA A LEER, no la que está a la
// mano. Su orden de mando, medido sobre las 107 fichas del 1-sep:
//   · 95 fichas de UNA fecha. 63 tienen `cheap_zonas` capturada → el par es
//     (`zonas`, `cheap_zonas`) y las dos se escriben. Las otras 32 no la
//     tienen: su CHEAP es el ESPEJO del `pc` de PLUS, que nace simétrico solo
//     («disponible = !ag && pc>0») y no hay nada que sincronizar.
//   · 10 multifecha declaran zonas Y cheap POR FECHA → el par es el de CADA
//     fecha, y los globales se DERIVAN de ellas (`derivarGlobalDeFechas`), así
//     que sincronizar las fechas deja el global simétrico solo.
//   · karolcdmx: zonas por fecha pero cheap en la COLUMNA. El PLUS global es
//     derivado —no se puede escribir— y el CHEAP es la columna. Ahí el par es
//     (global derivado, columna), y la única punta escribible es la columna;
//     para la dirección contraria hay que bajar el `ag` a TODAS las fechas,
//     que es donde vive el dato. Hoy karolcdmx está agotada entera en las dos,
//     así que este camino no tiene ni un caso vivo: va cubierto por fixture.
//   · bts: zonas por fecha y ningún cheap → espejo `pc`, simétrico solo.
function simetrizarFicha(ficha) {
  const zonas = (ficha && Array.isArray(ficha.zonas)) ? ficha.zonas : null;
  const cheapZonas = (ficha && Array.isArray(ficha.cheapZonas)) ? ficha.cheapZonas : null;
  const multifecha = (ficha && Array.isArray(ficha.multifecha)) ? ficha.multifecha : null;
  const cambiadas = [];
  const out = { zonas, cheapZonas, multifecha };

  const porFecha = !!(multifecha && C._hayZonasPorFecha(multifecha));

  if (!porFecha) {
    // Una sola fecha (o fechas que no gobiernan): el par de arriba.
    if (zonas && cheapZonas) {
      const r = sincronizarPar(zonas, cheapZonas);
      out.zonas = r.a; out.cheapZonas = r.b;
      r.cambiadas.forEach((c) => cambiadas.push({ fecha: null, lista: c.lista, zona: c.zona }));
    }
    return { zonas: out.zonas, cheapZonas: out.cheapZonas, multifecha: out.multifecha, cambiadas };
  }

  // ── MULTIFECHA ── el par de CADA fecha, por separado.
  let mfTocada = false;
  const mfNueva = multifecha.map((f, i) => {
    if (!f || !Array.isArray(f.zonas) || !Array.isArray(f.cheapZonas)) return f;
    const r = sincronizarPar(f.zonas, f.cheapZonas);
    if (!r.cambiadas.length) return f;
    mfTocada = true;
    r.cambiadas.forEach((c) => cambiadas.push({ fecha: i, lista: c.lista, zona: c.zona }));
    return Object.assign({}, f, { zonas: r.a, cheapZonas: r.b });
  });
  if (mfTocada) out.multifecha = mfNueva;

  // El CHEAP global contra el PLUS global DERIVADO — sólo cuando las fechas no
  // declaran su cheap y la columna sí existe (hoy: karolcdmx, y nadie más).
  if (!C._hayCheapPorFecha(out.multifecha) && cheapZonas) {
    // La derivación se le pide al compilador con SU parser: leer `ag` a mano
    // sobre el JSON crudo sería un tercer parser al lado de los dos que ya hay.
    const mfP = C._parseMultifecha(out.multifecha) || [];
    const global = C._derivarGlobalDeFechas(mfP, 'zonas');
    const agGlobal = new Set(global.filter((z) => _ag(z)).map((z) => _n(z)));
    const agCheap = new Set((cheapZonas || []).filter((z) => _ag(z)).map((z) => _n(z)));

    // (a) cerrada en el PLUS global y viva en la columna → se cierra la columna.
    const rc = sincronizarPar(global, out.cheapZonas);
    if (rc.cambiadas.length) {
      out.cheapZonas = rc.b;
      rc.cambiadas.filter((c) => c.lista === 'cheapZonas')
        .forEach((c) => cambiadas.push({ fecha: null, lista: 'cheapZonas', zona: c.zona }));
    }

    // (b) cerrada en la columna y viva en el PLUS global. El global NO se puede
    // escribir —se deriva— así que el `ag` baja a TODAS las fechas que tengan
    // esa zona: es donde vive el dato, y `derivarGlobalDeFechas` sólo deja el
    // global vivo si la zona está libre en ALGUNA fecha.
    const bajar = [...agCheap].filter((n) => n && !agGlobal.has(n));
    if (bajar.length) {
      const set = new Set(bajar);
      let tocada = false;
      const nueva = (out.multifecha || []).map((f, i) => {
        if (!f || !Array.isArray(f.zonas)) return f;
        let cambio = false;
        const zs = f.zonas.map((z) => {
          const n = _n(z);
          if (!n || !set.has(n) || _ag(z) || _prox(z)) return z;
          cambio = true; tocada = true;
          cambiadas.push({ fecha: i, lista: 'zonas', zona: n });
          return Object.assign({}, z, { ag: AGOTADA });
        });
        return cambio ? Object.assign({}, f, { zonas: zs }) : f;
      });
      if (tocada) out.multifecha = nueva;
    }
  }

  return { zonas: out.zonas, cheapZonas: out.cheapZonas, multifecha: out.multifecha, cambiadas };
}

// ── 🔓 EL CANDADO MULTIFECHA (AG-STOCK-1b) SE LEVANTÓ — AG-STOCK-3, 1-sep ──
//
// 1b lo puso y dejó escrita su condición de salida: «el candado se quita cuando
// la convención se MIDA, no cuando se suponga». Ya se midió, y por un camino que
// nadie planeó: BRUNO-UNIF-1 unificó Bruno Mars 4 y 7 de diciembre, y al
// renombrar los satélites apareció el PRIMER multifecha con pedido capturado.
//
// LO QUE SE MIDIÓ EN LA BASE EL 1-SEP, y es lo que sostiene este levantamiento:
//   · OCHO multifecha tienen compras, y las OCHO llavean por `slug#idx`:
//     alvarodiaz(#0,#1) · brunomars(#0,#1) · caifanes(#0,#1) ·
//     coronacapital(#0,#1,#5) · karolg(#0,#1,#2) · morat(#0,#1) ·
//     omar(#0,#1) · straykids(#0,#1).
//   · CERO filas de `compras` con el slug pelado en esos eventos.
//   · `viajeros_evento` usa EXACTAMENTE las mismas llaves.
// O sea: la convención existe, es una sola, y las dos tablas la comparten. El
// peligro que 1b describía —consumo bajo `omar#0` restándose de un stock
// guardado bajo `omar`— ya no puede ocurrir, porque nadie guarda bajo `omar`.
//
// ⚠️ Y AUNQUE PUDIERA, HOY NO CERRARÍA NADA. Desde AG-STOCK-2 el stock es
// AVISO, no acción: lo peor que puede hacer un stock mal medido aquí es
// nombrar de más o de menos en un informe. La dirección peligrosa —cerrar
// zonas que sí se venden— se retiró con la derivación.
//
// 🔒 LO QUE NO CAMBIA: JAMÁS ENTRE FECHAS. Cada fecha se mide contra SU llave
// (`slug#idx`) y contra las zonas de ESA fecha. Es la misma regla que la
// simetría: agotado la noche 1 no es agotado la noche 2, y comprado para la
// noche 1 tampoco.
//
// Una fecha sin compras dentro de un evento que sí tiene —coronacapital tiene
// #0, #1 y #5 pero no #2, #3 ni #4— NO se avisa: se NOMBRA, igual que un
// evento entero sin pedido. Cada fecha es su propia unidad.

// disponiblesPorZona: Map|objeto zona → número.
function _disp(mapa, zona) {
  if (!mapa) return undefined;
  return (typeof mapa.get === 'function') ? mapa.get(zona) : mapa[zona];
}

// ── EL AVISO ────────────────────────────────────────────────────────────────
// PURO. NO CIERRA NADA. Devuelve las zonas que quedan A LA VENTA y que Memo
// tendría que comprar si alguien las pide.
//
//   ficha:      { zonas, cheapZonas, multifecha } — YA simetrizada, para que el
//               aviso hable de lo que de verdad se va a publicar y no avise de
//               una zona que la simetría acaba de cerrar.
//   gestionado: ¿el evento tiene compras capturadas? Lo decide el llamador con
//               el HECHO —está o no en el lote de stock—, no con una lista.
//   disponibles: zona → número. Ausente = no hay pedido de esa zona.
function avisosStock({ ficha, slug, stock }) {
  // Las zonas A LA VENTA de UNA lista-par. Después de la simetría las dos
  // gemelas dicen lo mismo de cada zona que comparten, así que la unión no
  // infla.
  const vivasDe = (zonas, cheapZonas) => {
    const v = new Set();
    const meter = (l) => (Array.isArray(l) ? l : []).forEach((z) => {
      const n = _n(z);
      if (n && !_ag(z) && !_prox(z)) v.add(n);
    });
    meter(zonas); meter(cheapZonas);
    return v;
  };
  // El veredicto de UNA unidad (un evento de una fecha, o UNA fecha de un
  // multifecha) contra SU llave y SUS zonas. Nunca mira otra fecha.
  const medir = (llave, zonas, cheapZonas) => {
    const disponibles = stock && (typeof stock.get === 'function' ? stock.get(llave) : stock[llave]);
    if (!disponibles) return { sinPedido: true, zonas: [] };
    const out = [];
    for (const n of vivasDe(zonas, cheapZonas)) {
      const d = _disp(disponibles, n);
      const num = (d == null) ? null : Number(d);
      if (num == null) { out.push({ zona: n, disponibles: null, motivo: 'sin pedido capturado' }); continue; }
      // `<= 0` y no `=== 0`: un negativo es sobreventa, y una zona sobrevendida
      // necesita compra todavía más urgente que una en cero.
      if (num <= 0) out.push({ zona: n, disponibles: num, motivo: num < 0 ? 'sobrevendida' : 'stock 0' });
    }
    out.sort((x, y) => x.zona.localeCompare(y.zona, 'es'));
    return { sinPedido: false, zonas: out };
  };

  const mf = (ficha && Array.isArray(ficha.multifecha)) ? ficha.multifecha : null;
  const porFecha = !!(mf && C._hayZonasPorFecha(mf));

  // ── UNA SOLA FECHA (o fechas que no gobiernan): la llave es el slug pelado.
  if (!porFecha) {
    const r = medir(slug, ficha && ficha.zonas, ficha && ficha.cheapZonas);
    return r.sinPedido
      ? { zonas: [], gestionado: false, fechas: [] }
      : { zonas: r.zonas, gestionado: true, fechas: [] };
  }

  // ── MULTIFECHA: cada fecha con SU llave y SUS zonas. 🔓 AG-STOCK-3.
  const fechas = [];
  const todas = [];
  let algunaGestionada = false;
  mf.forEach((f, i) => {
    const llave = slug + '#' + i;
    const lbl = (f && f.lbl) ? String(f.lbl) : ('Fecha ' + (i + 1));
    const r = medir(llave, f && f.zonas, f && f.cheapZonas);
    if (r.sinPedido) { fechas.push({ idx: i, lbl, llave, sin_pedido: true, zonas: [] }); return; }
    algunaGestionada = true;
    fechas.push({ idx: i, lbl, llave, sin_pedido: false, zonas: r.zonas });
    // El montón plano lleva la fecha PEGADA a la zona: sin eso, «Platino» de
    // dos noches distintas se leería como una sola línea repetida.
    r.zonas.forEach((z) => todas.push(Object.assign({}, z, { fecha: lbl })));
  });
  return { zonas: todas, gestionado: algunaGestionada, fechas };
}

// ── EL LOTE ─────────────────────────────────────────────────────────────────
// Un publish compila TODOS los eventos. Pedirle a `_lib/disponibilidad` una
// consulta por evento serían tres consultas × cien eventos; aquí se arman los
// disponibles de TODOS de una sola pasada por tabla. La regla es la misma
// —compras − vendidos_fuera − viajeros que consumen— y quién consume se le
// sigue preguntando a `consumeBoleto`, su dueño.
//
// Se le pasan las filas ya traídas para que esto siga siendo puro y el arnés lo
// pueda interrogar con las filas reales de calle24, sin red.
function disponiblesPorEvento({ compras, ajustes, viajeros, consumeBoleto }) {
  const stock = new Map();      // evento → Map(zona → comprados)
  const meter = (m, ev, zona, n) => {
    if (!m.has(ev)) m.set(ev, new Map());
    const z = m.get(ev);
    z.set(zona, (z.get(zona) || 0) + n);
  };
  (compras || []).forEach((c) => {
    if (!c || !c.evento_id || !c.zona) return;
    meter(stock, String(c.evento_id), String(c.zona), Number(c.cantidad) || 0);
  });
  (ajustes || []).forEach((a) => {
    if (!a || !a.evento_id || !a.zona) return;
    if (!stock.has(String(a.evento_id))) return;   // ajuste de un evento sin compras: no crea stock
    meter(stock, String(a.evento_id), String(a.zona), -(Number(a.vendidos_fuera) || 0));
  });
  (viajeros || []).forEach((v) => {
    if (!v || !v.evento_id) return;
    const ev = String(v.evento_id);
    if (!stock.has(ev)) return;
    // QUIÉN CONSUME SE LO PREGUNTA A SU DUEÑO. Copiar la regla aquí sería la
    // segunda fuente que esta casa colecciona.
    if (!consumeBoleto(v.tipo_paquete, v.tipo_viajero)) return;
    const zona = String(v.zona_boleto || '').trim();
    if (!zona) return;
    meter(stock, ev, zona, -1);
  });
  return stock;
}

// ── EL LOTE DE FICHAS ───────────────────────────────────────────────────────
// Lo que el publish corre sobre las ~100 fichas, AQUÍ y no allá: si el lazo
// vive dentro del handler, el careo tiene que copiarlo para probarlo — y una
// copia del código bajo prueba no prueba el código, prueba la copia. Recibe las
// filas de `esferas_eventos` TAL CUAL vienen (con `zonas`, `cheap_zonas` y
// `multifecha` en texto JSON) y devuelve filas nuevas + el reporte.
//
// 🔒 NO NECESITA LA BASE. Por eso el publish la llama FUERA del try del stock:
// si el Palacio no contesta, el aviso se pierde pero la simetría se aplica.
//
// Cada fila se queda con su ficha PARSEADA en `__ficha` para que el aviso mire
// lo que DE VERDAD se va a publicar y no vuelva a parsear. El publish la borra
// antes de compilar: es andamio, no dato.
function simetrizarLote(filas) {
  const reporte = { eventos: [], cerradas: 0, ilegibles: [] };
  const salida = (filas || []).map((e) => {
    if (!e || !e.slug) return e;
    // Si alguna lista no parsea, ESE evento se deja intacto y se DICE: mejor no
    // sincronizar que sincronizar sobre media lectura.
    let ficha;
    try {
      ficha = {
        zonas: e.zonas ? JSON.parse(e.zonas) : null,
        cheapZonas: e.cheap_zonas ? JSON.parse(e.cheap_zonas) : null,
        multifecha: e.multifecha ? JSON.parse(e.multifecha) : null,
      };
    } catch (_) { reporte.ilegibles.push(e.slug); return e; }

    const r = simetrizarFicha(ficha);
    e.__ficha = { zonas: r.zonas, cheapZonas: r.cheapZonas, multifecha: r.multifecha };
    if (!r.cambiadas.length) return e;

    // El reporte dice QUÉ CERRÓ ESTE PUBLISH, no qué encontró agotado.
    reporte.eventos.push({
      slug: e.slug,
      zonas: [...new Set(r.cambiadas.map((c) => c.zona))].sort((a, b) => a.localeCompare(b, 'es')),
      listas: r.cambiadas.length,
    });
    reporte.cerradas += r.cambiadas.length;
    const out = Object.assign({}, e);              // `__ficha` viaja en la copia
    if (r.zonas) out.zonas = JSON.stringify(r.zonas);
    if (r.cheapZonas) out.cheap_zonas = JSON.stringify(r.cheapZonas);
    if (r.multifecha) out.multifecha = JSON.stringify(r.multifecha);
    return out;
  });
  return { filas: salida, reporte };
}

// El aviso del lote. `stock` es lo que devuelve `disponiblesPorEvento`; un
// evento que no está ahí NO TIENE COMPRAS capturadas, y eso se dice por su
// nombre en vez de callarse: una omisión se lee como «los revisó todos».
function avisosDelLote({ filas, stock }) {
  const reporte = { eventos: [], total: 0, sin_compras: [] };
  (filas || []).forEach((e) => {
    if (!e || !e.slug || !e.__ficha) return;
    const r = avisosStock({ ficha: e.__ficha, slug: e.slug, stock });
    // 🔓 [AG-STOCK-3] LAS FECHAS SE NOMBRAN UNA POR UNA. Decir «coronacapital»
    // a secas escondería que #0, #1 y #5 SÍ tienen pedido capturado y #2, #3 y
    // #4 no — que es justo lo que Memo necesita saber para comprar.
    (r.fechas || []).filter((f) => f.sin_pedido)
      .forEach((f) => reporte.sin_compras.push(e.slug + ' · ' + f.lbl));
    if (!r.gestionado) { if (!(r.fechas || []).length) reporte.sin_compras.push(e.slug); return; }
    if (!r.zonas.length) return;
    reporte.eventos.push({ slug: e.slug, zonas: r.zonas });
    reporte.total += r.zonas.length;
  });
  return reporte;
}

// El andamio se retira: `__ficha` no viaja al compilador.
function soltarFichas(filas) { (filas || []).forEach((e) => { if (e) delete e.__ficha; }); }

module.exports = {
  sincronizarPar, simetrizarFicha, avisosStock,
  simetrizarLote, avisosDelLote, soltarFichas,
  disponiblesPorEvento, AGOTADA,
  _ag, _prox,
};
