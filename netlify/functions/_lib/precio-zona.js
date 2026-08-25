// =============================================================================
// _lib/precio-zona  (VENDEDORES F1 — precio autoritativo por zona + separo)
//
// CANDADO DE PRECIOS: el precio de una venta NUNCA se acepta del cliente/vendedor;
// SIEMPRE se resuelve aquí desde el catálogo (EV de index.html vía
// _lib/catalogo-index → fetchEventosRaw, FUENTE ÚNICA — D2). Replica FIEL el
// cálculo del sitio (calcular() de index.html): total, costo por persona y el
// SEPARO, que ES la ganancia garantizada de Memo (regla del módulo — D1).
//
// STAY: el descuento es FIJO (`STAY_DESCUENTO` = 500), igual que calcular() del
// sitio y la tarjeta). Decisión de Memo: el descuento anunciado no vive en el EV.
//
// El precio total con hotel/transporte requiere que el caller pase el hotel
// elegido y (en CDMX) el costo de transporte; la función marca requiere_hotel /
// requiere_transporte para que F2/F3 obliguen la selección. Best-effort del
// catálogo: sin catálogo o evento no hallado → { ok:false, indeterminado:true }.
// =============================================================================

// [COT-FIX-2] El default del separo CHEAP, con nombre y exportado. Es la
// definición del lado SERVIDOR; index.html, rol.html y kamehouse.js tienen la
// suya porque no pueden importar de aquí. El arnés carea las cuatro.
// [STAY-500] REGLA FIRMADA POR MEMO, 25-ago-2026: el STAY cuesta
// PLUS − $500 FIJOS, siempre, en cualquier evento, SIN IMPORTAR EL SEPARO.
// Antes era `ev.sep || 500` y por eso Omar Courtz (sep 300) salía solo $300
// abajo: se le cobraba de más. El separo es cuánto adelantas, no cuánto te
// descuentan — dos cosas que nunca debieron ser la misma.
// Gemelo con nombre en los 4 runtimes que no pueden importarse entre sí
// (index · _lib/precio-zona · portal · rol), careados por el arnés. Patrón de
// SEPARO_CHEAP_DEFAULT.
const STAY_DESCUENTO = 500;
const SEPARO_CHEAP_DEFAULT = 1000;

const { fetchEventosRaw, fetchHotelesGlobales } = require('./catalogo-index');

const PAQUETES = ['plus', 'ride', 'stay', 'cheap'];

// Hoy en hora MX ('YYYY-MM-DD'), patrón en-CA/Monterrey del cron F4.
function hoyMx() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
}

// Réplica de isCDMX(ev) del index.
function esCDMX(ev) {
  const v = ev && ev.v ? String(ev.v).toUpperCase() : '';
  return v.includes('CDMX') || v.includes('CIUDAD DE MEXICO');
}

// ¿Habitación compartida? (por clave canónica o nombre) — misma prueba que el index
// y el Portal. Usada por la regla de grupo grande (N>4 → solo compartida).
function _esCompartida(h) {
  return !!h && (h.k === 'compartida' || /^compartida/i.test(h.n || ''));
}

// Días naturales entre hoy y la fecha del evento (evento − hoy), a mediodía UTC.
function _diasEvento(evISO, hoyISO) {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(evISO || ''));
  const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(hoyISO || ''));
  if (!m1 || !m2) return null;
  const a = Date.UTC(+m1[1], +m1[2] - 1, +m1[3]);
  const b = Date.UTC(+m2[1], +m2[2] - 1, +m2[3]);
  return Math.round((a - b) / 86400000);
}

// Lista de zonas aplicable (multifecha-aware) según el paquete.
function _zonaLista(ev, paquete, fechaIdx) {
  const mf = ev.multifecha && ev.multifecha[fechaIdx];
  if (paquete === 'cheap') return (mf && mf.cheapZonas) || ev.cheapZonas || [];
  return (mf && mf.zonas) || ev.zonas || [];
}

// 🔒 AUD-2 — CASCADA DE HOTEL, espejo EXACTO del index.html:
//   var hl = (cur.hotelOverride && cur.hotel && cur.hotel.length) ? cur.hotel
//                                                                : hotelList(cur);
//   function hotelList(ev){ mf.hotel de la fecha elegida → isCDMX ? HOTEL_CDM : HOTEL_MTY }
// Antes esta lib solo miraba `ev.hotel`, que además venía undefined porque los
// HOTEL_* se stubbeaban al parsear el EV: ninguna venta con hotel se podía
// resolver en los eventos que usan las listas globales.
function _hotelLista(ev, fechaIdx, cdmx, globales) {
  if (ev.hotelOverride && Array.isArray(ev.hotel) && ev.hotel.length) return ev.hotel;
  const mf = ev.multifecha && ev.multifecha[fechaIdx];
  if (mf && Array.isArray(mf.hotel) && mf.hotel.length) return mf.hotel;
  const g = globales || {};
  const glob = cdmx ? g.cdm : g.mty;
  if (Array.isArray(glob) && glob.length) return glob;
  // Último recurso: lo que el evento declare (si el catálogo pudo materializarlo).
  return Array.isArray(ev.hotel) ? ev.hotel : [];
}

// Fecha efectiva del evento para la fecha elegida (multifecha → su ds).
function _fechaEvento(ev, fechaIdx) {
  const mf = ev.multifecha && ev.multifecha[fechaIdx];
  return (mf && mf.ds) || ev.ds || null;
}

// Estados de catálogo en los que NO se vende.
const ST_NO_VENDIBLE = ['agotado', 'por-confirmar', 'proceso', 'proximamente', 'pronto'];

// ── Cálculo PURO (sin IO) — FIEL a calcular() del index. Recibe el evento CRUDO ──
// del EV + las selecciones. Devuelve { ok, ... } | { ok:false, motivo }.
function _calcularPrecio(ev, opts) {
  if (!ev) return { ok: false, motivo: 'evento no encontrado' };
  const paquete = String((opts && opts.paquete) || '').toLowerCase();
  if (!PAQUETES.includes(paquete)) return { ok: false, motivo: 'paquete inválido' };

  const selViaj = Math.floor(Number(opts && opts.num_personas) || 0);
  if (selViaj < 1) return { ok: false, motivo: 'num_personas inválido' };

  const fechaIdx = Number.isFinite(Number(opts && opts.fecha_idx)) ? Number(opts.fecha_idx) : 0;
  const hoyISO = (opts && opts.hoyISO) || hoyMx();
  const cdmx = esCDMX(ev);

  // 🔒 AUD-2 — fecha_idx fuera de rango. Antes, un slug#99 caía a las listas
  // top-level del evento y VENDÍA a un precio que no corresponde a ninguna fecha.
  if (Array.isArray(ev.multifecha) && ev.multifecha.length) {
    if (!Number.isInteger(fechaIdx) || fechaIdx < 0 || fechaIdx >= ev.multifecha.length) {
      return { ok: false, motivo: 'fecha del evento fuera de rango' };
    }
  } else if (fechaIdx !== 0) {
    return { ok: false, motivo: 'el evento no tiene multifecha' };
  }

  // 🔒 AUD-2 — el catálogo manda: no se vende lo que no está a la venta.
  const st = String(ev.st || '').toLowerCase();
  if (ST_NO_VENDIBLE.includes(st)) {
    return { ok: false, motivo: `el evento está "${st}" en el catálogo — no se vende` };
  }

  // 🔒 AUD-2 — evento ya pasado (de la fecha elegida si es multifecha).
  const dsEvento = _fechaEvento(ev, fechaIdx);
  const diasAlEvento = _diasEvento(dsEvento, hoyISO);
  if (diasAlEvento != null && diasAlEvento < 0) {
    return { ok: false, motivo: 'la fecha del evento ya pasó' };
  }

  const hasZona = (paquete === 'plus' || paquete === 'stay' || paquete === 'cheap') || (paquete === 'ride' && ev.forceZona);
  const hasHotel = (paquete === 'plus' || paquete === 'ride' || paquete === 'stay') && !ev.noHotel;

  // Zona (candado: el precio unitario sale de la zona del EV, nunca del input).
  let selZ = null;
  if (hasZona) {
    const zonaNombre = String((opts && opts.zona) || '');
    selZ = _zonaLista(ev, paquete, fechaIdx).find(z => z && z.n === zonaNombre) || null;
    if (!selZ) return { ok: false, motivo: 'zona no encontrada en el catálogo' };
    // 🔒 AUD-2: las banderas del catálogo mandan. `ag` = agotada, `prox` = aún no
    // sale a la venta. Antes solo se miraba el precio, así que una zona marcada
    // agotada pero con precio se podía vender.
    if (selZ.ag) return { ok: false, motivo: 'zona agotada' };
    if (selZ.prox) return { ok: false, motivo: 'zona aún no disponible (próximamente)' };
    if (!(Number(selZ.p) > 0)) return { ok: false, motivo: 'zona agotada / sin precio (p=0)' };
  }

  // [GR-5b] BUSCAR EL HOTEL SIN EXIGIR EL NOMBRE EXACTO.
//
// El catálogo los llama 'Compartida (4 personas)', 'Doble', 'Triple',
// 'Individual'. El Portal guarda su `tipo_habitacion` en minúsculas y sin
// paréntesis: 'compartida', 'doble', 'triple', 'individual' (es lo que exige
// su CHECK). Con un === estricto NINGUNO empataba, así que el recálculo del
// servidor devolvía 'hotel no encontrado' y GR-5 se caía por su camino
// fail-soft: no sellaba NADA en plus/ride/stay. Letra muerta para todo lo que
// lleva hotel — justo lo que la tuerca venía a blindar.
//
// El EXACTO SE INTENTA PRIMERO: para quien ya manda el nombre del catálogo
// (el Palacio), el resultado es byte-idéntico. La tolerancia es solo la red
// de abajo, y compara por la PRIMERA PALABRA normalizada, que es lo que
// distingue a los cuatro tipos entre sí.
function _normHotel(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().split(/[\s(]/)[0];
}
function _buscarHotel(lista, nombre) {
  if (!Array.isArray(lista) || !nombre) return null;
  const exacto = lista.find(h => h && h.n === nombre);
  if (exacto) return exacto;
  const clave = _normHotel(nombre);
  if (!clave) return null;
  const flojos = lista.filter(h => h && _normHotel(h.n) === clave);
  // Si la primera palabra empata con DOS hoteles distintos, no se adivina:
  // devolver null hace que el llamador diga 'hotel no encontrado', que es
  // honesto. Asignar "el primero" es como se cuelan los precios equivocados.
  return flojos.length === 1 ? flojos[0] : null;
}

// Hotel (opcional en F1; si el paquete lo requiere y no se dio, se marca).
  let selH = null;
  const requiereHotel = hasHotel && !(opts && opts.hotel_nombre);
  if (hasHotel && opts && opts.hotel_nombre) {
    const lista = _hotelLista(ev, fechaIdx, cdmx, opts && opts.hoteles);
    selH = _buscarHotel(lista, opts.hotel_nombre);
    if (!selH) return { ok: false, motivo: 'hotel no encontrado en el catálogo' };
    // Grupo grande (N>4): SOLO habitación compartida (el reparto fino se afina al
    // reservar). Espejo de la regla del index (buildHotelButtons) y de _vtaCalc.
    if (selViaj > 4 && !_esCompartida(selH)) return { ok: false, motivo: 'grupo grande: solo habitación compartida' };
  }
  const requiereTransporte = cdmx && paquete !== 'cheap' && !(opts && opts.transporte_cost != null);

  const zonaP = selZ ? (Number(selZ.p) || 0) : 0;
  const hotelRaw = selH ? (Number(selH.e) || 0) : 0;
  const hotelPP = ev.hotelPP ? hotelRaw : Math.ceil(hotelRaw / selViaj);
  const hotelTotal = ev.hotelPP ? (hotelRaw * selViaj) : hotelRaw;
  const _mfR = (ev.multifecha && ev.multifecha[fechaIdx] && ev.multifecha[fechaIdx].ride) || 0;
  const rideBase = _mfR || ev.ride || (cdmx ? 2900 : 2700);
  const stayDiscount = STAY_DESCUENTO; // [STAY-500] fijo, no `sep`.

  let total = 0, costoXPersona = 0;
  if (paquete === 'plus') {
    if (ev.diaFirst) { total = zonaP + hotelTotal; costoXPersona = Math.ceil(zonaP / selViaj) + hotelPP; }
    else { total = zonaP * selViaj + hotelTotal; costoXPersona = zonaP + hotelPP; }
  } else if (paquete === 'ride') {
    const rideCXP = (ev.rideOnly && zonaP > 0) ? zonaP : rideBase;
    total = rideCXP * selViaj + hotelTotal; costoXPersona = rideCXP + hotelPP;
  } else if (paquete === 'stay') {
    costoXPersona = zonaP - stayDiscount + hotelPP;
    if (costoXPersona < 0) costoXPersona = zonaP + hotelPP;
    total = costoXPersona * selViaj;
  } else { // cheap
    if (ev.diaFirst) { total = zonaP; costoXPersona = Math.ceil(zonaP / selViaj); }
    else { total = zonaP * selViaj; costoXPersona = zonaP; }
  }

  // Transporte CDMX (costo por persona; el caller lo provee).
  // 🔒 AUD-2 — BUG DE DINERO: no había validación. Un costo NEGATIVO restaba del
  // total (venta por debajo del precio real) y un costo en un evento que NO es
  // CDMX sumaba un concepto que el sitio jamás cobra. Ambos se rechazan fuerte:
  // ningún flujo legítimo los manda, así que callar sería tapar un error.
  const tcRaw = (opts && opts.transporte_cost != null) ? Number(opts.transporte_cost) : 0;
  if (!Number.isFinite(tcRaw)) return { ok: false, motivo: 'transporte_cost inválido' };
  if (tcRaw < 0) return { ok: false, motivo: 'transporte_cost no puede ser negativo' };
  if (tcRaw > 0 && !cdmx) return { ok: false, motivo: 'transporte_cost solo aplica a eventos de CDMX' };
  if (tcRaw > 0 && paquete === 'cheap') return { ok: false, motivo: 'el paquete CHEAP no lleva transporte' };
  const transportCost = tcRaw;
  total += transportCost * selViaj;
  costoXPersona += transportCost;

  // SEPARO = ganancia de Memo. Réplica FIEL de la regla del sitio.
  let separo;
  if (paquete === 'cheap') {
    let cheapSep = (ev.sepCheap !== undefined) ? ev.sepCheap : SEPARO_CHEAP_DEFAULT;
    if (selZ) {
      const czList = (ev.multifecha && ev.multifecha[fechaIdx] && ev.multifecha[fechaIdx].cheapZonas) || ev.cheapZonas;
      if (Array.isArray(czList)) {
        const cz = czList.find(z => z && z.n === selZ.n);
        if (cz && cz.sepEspecial !== undefined) cheapSep = cz.sepEspecial;
      }
    }
    separo = (Number(cheapSep) || 0) * selViaj;
  } else {
    const dias = _diasEvento(ev.ds, hoyISO);
    if (dias != null && dias <= 15) {
      separo = Math.ceil(costoXPersona * 0.5) * selViaj;
    } else {
      let evSep = ev.sep;
      if (paquete === 'ride' && ev.sepRide !== undefined) evSep = ev.sepRide;
      if (ev.sepZonas && selZ && ev.sepZonas[selZ.n] !== undefined) evSep = ev.sepZonas[selZ.n];
      separo = (Number(evSep) || 0) * selViaj;
    }
  }

  if (!(total > 0) || !(costoXPersona > 0)) {
    return { ok: false, motivo: 'precio no disponible (total/costo 0)' };
  }

  // 🔒 AUD-2 — el separo ES la ganancia de Memo (regla D1 del módulo). Si para
  // plus/ride/stay saliera 0 (evento sin `sep` en el catálogo), la venta se
  // registraría SIN ganancia y sin que nadie lo note. Mejor indeterminado: que
  // se capture el separo en el catálogo antes de vender.
  if (paquete !== 'cheap' && !(separo > 0)) {
    return {
      ok: false, indeterminado: true,
      motivo: 'el evento no tiene separo definido en el catálogo — captúralo antes de vender',
    };
  }

  return {
    ok: true,
    paquete,
    zona: selZ ? selZ.n : null,
    num_personas: selViaj,
    precio_unit: costoXPersona,           // costo por persona (con hotel/transporte)
    total,                                // total del grupo
    separo,                               // = ganancia de Memo (candado)
    resto: total - separo,
    requiere_hotel: requiereHotel || undefined,
    requiere_transporte: requiereTransporte || undefined,
    desglose: { zonaP, hotelPP, hotelTotal, transportCost, cdmx, diaFirst: !!ev.diaFirst },
    fuente: 'EV',
  };
}

// ── Candado: resuelve el precio de una venta desde el catálogo (con IO). El
// evento_id puede ser 'slug' o 'slug#idx' (multifecha → fecha_idx). NUNCA acepta
// un precio de entrada. Best-effort: sin catálogo/evento → indeterminado. ──
async function resolverPrecioVenta(opts) {
  const eventoId = String((opts && opts.evento_id) || '');
  const [slug, idxStr] = eventoId.split('#');
  const fechaIdx = (idxStr != null && idxStr !== '') ? Number(idxStr) : 0;

  const ev = await fetchEventosRaw();
  if (!Array.isArray(ev)) return { ok: false, indeterminado: true, motivo: 'catálogo no disponible' };
  const e = ev.find(x => x && x.id === slug) || null;
  if (!e) return { ok: false, motivo: 'evento no encontrado en el catálogo' };

  // Listas de hotel globales del index para la cascada (best-effort: {}).
  let hoteles = {};
  try { hoteles = await fetchHotelesGlobales(); } catch (_) { hoteles = {}; }

  return _calcularPrecio(e, {
    hoteles,
    paquete: opts.paquete,
    zona: opts.zona,
    num_personas: opts.num_personas,
    hotel_nombre: opts.hotel_nombre,
    transporte_cost: opts.transporte_cost,
    fecha_idx: fechaIdx,
    hoyISO: opts.hoyISO || hoyMx(),
  });
}

module.exports = { SEPARO_CHEAP_DEFAULT, STAY_DESCUENTO, resolverPrecioVenta, _calcularPrecio, esCDMX, _diasEvento, hoyMx, PAQUETES };
