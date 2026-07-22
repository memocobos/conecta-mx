// =============================================================================
// _lib/precio-zona  (VENDEDORES F1 — precio autoritativo por zona + separo)
//
// CANDADO DE PRECIOS: el precio de una venta NUNCA se acepta del cliente/vendedor;
// SIEMPRE se resuelve aquí desde el catálogo (EV de index.html vía
// _lib/catalogo-index → fetchEventosRaw, FUENTE ÚNICA — D2). Replica FIEL el
// cálculo del sitio (calcular() de index.html): total, costo por persona y el
// SEPARO, que ES la ganancia garantizada de Memo (regla del módulo — D1).
//
// STAY: el descuento de stay = `ev.sep` (única verdad, igual que calcular() del
// sitio y la tarjeta). Decisión de Memo: el descuento anunciado no vive en el EV.
//
// El precio total con hotel/transporte requiere que el caller pase el hotel
// elegido y (en CDMX) el costo de transporte; la función marca requiere_hotel /
// requiere_transporte para que F2/F3 obliguen la selección. Best-effort del
// catálogo: sin catálogo o evento no hallado → { ok:false, indeterminado:true }.
// =============================================================================

const { fetchEventosRaw } = require('./catalogo-index');

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

  const hasZona = (paquete === 'plus' || paquete === 'stay' || paquete === 'cheap') || (paquete === 'ride' && ev.forceZona);
  const hasHotel = (paquete === 'plus' || paquete === 'ride' || paquete === 'stay') && !ev.noHotel;

  // Zona (candado: el precio unitario sale de la zona del EV, nunca del input).
  let selZ = null;
  if (hasZona) {
    const zonaNombre = String((opts && opts.zona) || '');
    selZ = _zonaLista(ev, paquete, fechaIdx).find(z => z && z.n === zonaNombre) || null;
    if (!selZ) return { ok: false, motivo: 'zona no encontrada en el catálogo' };
    if (!(Number(selZ.p) > 0)) return { ok: false, motivo: 'zona agotada / sin precio (p=0)' };
  }

  // Hotel (opcional en F1; si el paquete lo requiere y no se dio, se marca).
  let selH = null;
  const requiereHotel = hasHotel && !(opts && opts.hotel_nombre);
  if (hasHotel && opts && opts.hotel_nombre) {
    selH = (ev.hotel || []).find(h => h && h.n === opts.hotel_nombre) || null;
    if (!selH) return { ok: false, motivo: 'hotel no encontrado en el catálogo' };
  }
  const requiereTransporte = cdmx && paquete !== 'cheap' && !(opts && opts.transporte_cost != null);

  const zonaP = selZ ? (Number(selZ.p) || 0) : 0;
  const hotelRaw = selH ? (Number(selH.e) || 0) : 0;
  const hotelPP = ev.hotelPP ? hotelRaw : Math.ceil(hotelRaw / selViaj);
  const hotelTotal = ev.hotelPP ? (hotelRaw * selViaj) : hotelRaw;
  const _mfR = (ev.multifecha && ev.multifecha[fechaIdx] && ev.multifecha[fechaIdx].ride) || 0;
  const rideBase = _mfR || ev.ride || (cdmx ? 2900 : 2700);
  const stayDiscount = ev.sep || 500; // sep es la única verdad del descuento STAY.

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
  const transportCost = Number(opts && opts.transporte_cost) || 0;
  total += transportCost * selViaj;
  costoXPersona += transportCost;

  // SEPARO = ganancia de Memo. Réplica FIEL de la regla del sitio.
  let separo;
  if (paquete === 'cheap') {
    let cheapSep = (ev.sepCheap !== undefined) ? ev.sepCheap : 1000;
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

  return _calcularPrecio(e, {
    paquete: opts.paquete,
    zona: opts.zona,
    num_personas: opts.num_personas,
    hotel_nombre: opts.hotel_nombre,
    transporte_cost: opts.transporte_cost,
    fecha_idx: fechaIdx,
    hoyISO: opts.hoyISO || hoyMx(),
  });
}

module.exports = { resolverPrecioVenta, _calcularPrecio, esCDMX, _diasEvento, hoyMx, PAQUETES };
