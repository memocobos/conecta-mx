// =============================================================================
// _lib/agotado-derivado — el agotado sale del STOCK, no de la mano (AG-STOCK-1)
// =============================================================================
// Caso real, calle24, 31-ago-2026: nueve zonas agotadas a mano en PLUS con su
// lista CHEAP entera «a la venta». El cliente compró boletos de zonas sin
// inventario. Dos listas para una misma zona física, y sólo una de ellas
// cerrada.
//
// 🔒 LA DIRECCIÓN SE FUERZA EN UN SOLO SENTIDO.
//   · Agotar de más A MANO es decisión comercial válida: cerrar una zona que
//     todavía tiene boletos es cosa de Memo, y esta derivación no la revierte.
//     NUNCA se quita un `ag` puesto en la ficha.
//   · Vender lo que el stock dice que NO HAY es lo que no puede pasar. Esa
//     dirección —de «a la venta» a «agotada»— es la única que se fuerza.
//
// 🔒 LA ZONA FÍSICA ES UNA, LAS LISTAS SON DOS. `zonas` (PLUS) y `cheapZonas`
// comparten el mismo asiento del venue: si no hay boleto, no lo hay para
// ninguno de los dos paquetes. Por eso el agotado se aplica EN LAS DOS.
//
// 🔒 UN EVENTO SIN COMPRAS CAPTURADAS NO SE TOCA, y se DICE por su nombre.
// Su stock todavía no vive en el Palacio (el Paso 6 va a medias), así que
// derivar ahí no sería medir: sería inventar un cero. El publish lo reporta
// igual que los letreros no emitidos — una omisión callada se lee como «los
// revisó todos».
//
// ⚠️ Y DENTRO DE UN EVENTO QUE SÍ SE GOBIERNA, una zona sin fila de compra es
// una zona con CERO boletos. Firmado por Memo el 31-ago. `_lib/disponibilidad`
// marca esas zonas como `gestionada:false` («no sé» en vez de «cero»), y esa
// cautela es correcta EN SU CASO: se escribió para la MIGRACIÓN —viajeros
// movidos a un evento cuyo pedido nadie capturó—, que es un caso de evento
// entero y que aquí ya está excluido por la regla de arriba. Cuando el evento
// SÍ tiene pedido cargado, «esta zona no aparece en las compras» significa que
// no se compró: nueve de las doce zonas de calle24 están en ese caso, y son
// justo las que se estaban vendiendo sin boletos.
// =============================================================================

// Lo que el catálogo entiende por «no se vende»: el `ag` que ya usa el index.
const AGOTADA = 1;

// disponiblesPorZona: Map|objeto zona → número. Puede venir de
// `_lib/disponibilidad` (su `desgloseZona(...).disponibles`) o del lote que
// arma el publish. `undefined` en una zona de un evento GESTIONADO significa
// «no hay compra de esa zona» → cero.
function _disp(mapa, zona) {
  if (!mapa) return undefined;
  const v = (typeof mapa.get === 'function') ? mapa.get(zona) : mapa[zona];
  return v;
}

// 🔒 EL CANDADO MULTIFECHA. Un evento con `multifecha` NO SE DERIVA, y no es
// cautela de más: MEDIDO en la base el 1-sep-2026,
//   · `viajeros_evento` SÍ llavea por `slug#idx` — 27 filas en 13 eventos
//     (omar#0/#1, karolg#0/#1/#2, morat#0/#1…).
//   · `compras` tiene CERO filas con `#`, y cero también sin `#` para esos
//     eventos. `stock_ajustes`, igual.
// O sea que NINGÚN multifecha tiene pedido capturado todavía, y por eso la
// convención de llaves no está definida: nunca se ha ejercitado.
//
// El día que se capture el primero, el consumo de sus viajeros —que vive bajo
// `omar#0`— no se restaría de un stock guardado bajo `omar`, y el resultado
// saldría INFLADO: zonas abiertas que no deberían estarlo. Ésa es exactamente
// la dirección peligrosa que esta tuerca vino a cerrar, así que derivar con un
// stock que PUEDE estar inflado es peor que no derivar.
//
// Se excluye y SE NOMBRA, en el mismo montón que los eventos sin compras. El
// candado se quita cuando la convención se MIDA, no cuando se suponga.
function esDerivable(obj) {
  const mf = obj && obj.multifecha;
  if (Array.isArray(mf) && mf.length) return { ok: false, motivo: 'multifecha: llaves sin definir' };
  return { ok: true, motivo: null };
}

// PURO. Recibe el objeto del evento (ya compilado o su ficha) y devuelve qué
// zonas hay que forzar. NO muta: quien escribe decide.
//
//   obj:        { zonas:[{n,p,ag?}], cheapZonas:[...], multifecha:[...] }
//   gestionado: ¿el evento tiene compras capturadas? (lo decide el llamador,
//               con el hecho, no con una lista al lado)
//   disponibles: zona → número disponible. Ausente = 0 en evento gestionado.
//
// Devuelve { forzar:Set<nombre>, detalle:[{zona,disponibles,motivo}], gestionado }
function zonasAForzar({ obj, gestionado, disponibles }) {
  if (!gestionado) return { forzar: new Set(), detalle: [], gestionado: false };
  const der = esDerivable(obj);
  if (!der.ok) return { forzar: new Set(), detalle: [], gestionado: true, excluido: der.motivo };
  const nombres = new Set();
  const meter = (lista) => (Array.isArray(lista) ? lista : []).forEach((z) => {
    if (z && z.n) nombres.add(String(z.n));
  });
  meter(obj && obj.zonas);
  meter(obj && obj.cheapZonas);
  (Array.isArray(obj && obj.multifecha) ? obj.multifecha : []).forEach((mf) => {
    meter(mf && mf.zonas); meter(mf && mf.cheapZonas);
  });

  const forzar = new Set(), detalle = [];
  for (const n of nombres) {
    const d = _disp(disponibles, n);
    const num = (d == null) ? 0 : Number(d);
    // `<= 0` y no `=== 0`: un negativo es sobreventa, y una zona sobrevendida
    // tiene todavía menos que vender que una en cero.
    if (num <= 0) {
      forzar.add(n);
      detalle.push({ zona: n, disponibles: (d == null) ? null : num,
                     motivo: (d == null) ? 'sin compra capturada' : (num < 0 ? 'sobrevendida' : 'stock 0') });
    }
  }
  return { forzar, detalle, gestionado: true };
}

// Aplica el agotado a UNA lista de zonas. Devuelve una lista NUEVA — el objeto
// viejo no se toca, para que quien compare el antes y el después tenga dos
// fotos de verdad y no dos punteros al mismo sitio.
function aplicarALista(lista, forzar) {
  return (Array.isArray(lista) ? lista : []).map((z) => {
    if (!z || !z.n || !forzar.has(String(z.n))) return z;
    if (z.ag) return z;                      // ya estaba agotada a mano: se respeta
    return Object.assign({}, z, { ag: AGOTADA });
  });
}

// La aplicación completa sobre un objeto de evento, multifecha incluida.
// Devuelve { obj: objetoNuevo, cambiadas: [nombres] } — `cambiadas` son las que
// PASARON de vendiéndose a agotadas, no todas las agotadas: el reporte tiene que
// decir qué hizo este publish, no qué encontró.
function aplicarAgotados(obj, forzar) {
  if (!obj || !forzar || !forzar.size) return { obj, cambiadas: [] };
  const cambiadas = new Set();
  const marca = (lista) => {
    const nueva = aplicarALista(lista, forzar);
    (Array.isArray(lista) ? lista : []).forEach((z, i) => {
      if (z && z.n && !z.ag && nueva[i] && nueva[i].ag) cambiadas.add(String(z.n));
    });
    return nueva;
  };
  const out = Object.assign({}, obj);
  if (Array.isArray(obj.zonas)) out.zonas = marca(obj.zonas);
  if (Array.isArray(obj.cheapZonas)) out.cheapZonas = marca(obj.cheapZonas);
  if (Array.isArray(obj.multifecha)) {
    out.multifecha = obj.multifecha.map((mf) => {
      if (!mf) return mf;
      const m = Object.assign({}, mf);
      if (Array.isArray(mf.zonas)) m.zonas = marca(mf.zonas);
      if (Array.isArray(mf.cheapZonas)) m.cheapZonas = marca(mf.cheapZonas);
      return m;
    });
  }
  return { obj: out, cambiadas: [...cambiadas].sort((a, b) => a.localeCompare(b, 'es')) };
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

module.exports = { zonasAForzar, aplicarAgotados, aplicarALista, disponiblesPorEvento, esDerivable, AGOTADA };
