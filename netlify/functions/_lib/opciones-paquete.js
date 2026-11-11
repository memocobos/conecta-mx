// =============================================================================
// _lib/opciones-paquete.js — [PREVENTA-PORTAL-1] ¿Qué puede elegir quien está
// en la PREVENTA A CIEGAS, y cuánto cuesta? (27-oct-2026)
//
// El wizard «Elegir mi paquete» del Portal le pregunta aquí. Nada se copia:
//   · qué paquetes vende el sitio → `paqueteVendibleEnSitio` (espejo del index)
//   · qué zonas y habitaciones hay → `_zonaLista` / `_hotelLista` de precio-zona
//   · cuánto cuesta cada combinación → `_calcularPrecio` (el MISMO motor que
//     sella una venta), con los candados de venta ENCENDIDOS: zona agotada,
//     próximamente o sin precio NO se ofrece.
// El precio es de LISTA, por persona. Lo que se le cobra al final lo confirma
// Bulma/Milk al aplicar (el rumbo: nada automático decide dinero).
// =============================================================================
const { fetchEventosRaw, fetchHotelesGlobales } = require('./catalogo-index');
const { _calcularPrecio, _zonaLista, _hotelLista, esCDMX, PAQUETES } = require('./precio-zona');
const { paqueteVendibleEnSitio } = require('./paquete-sitio');

const ZONA_PREVENTA_RE = /^preventa a ciegas$/i;
// [PREVENTA-AUTO-1] El beneficio de la preventa a ciegas (palabra de Memo,
// 10-nov-2026): sobre el precio de lista de CUALQUIER paquete y zona, $300 de
// descuento POR LUGAR — y sus $300 de separo cuentan aparte como pago.
// «Si el paquete cuesta 5600 para todo mundo, para ella cuesta 5300 y sus 300
// de reserva cuentan como pago: ya solo debe $5000.» Un solo dueño del número.
const PREVENTA_DESCUENTO = 300;
function totalPreventa(precioLista, boletos) {
  const n = Math.max(1, Number(boletos) || 1);
  const p = Math.round(Number(precioLista) || 0);
  if (!(p > PREVENTA_DESCUENTO)) return null; // jamás un contrato en $0 o negativo
  return (p - PREVENTA_DESCUENTO) * n;
}
const NOMBRES = { plus: 'PLUS · Todo incluido', stay: 'STAY · Sin transporte', ride: 'RIDE · Sin boleto', cheap: 'CHEAP · Solo boleto' };
const ORDEN = ['plus', 'stay', 'ride', 'cheap'];

// ¿La fila está en la preventa a ciegas? (misma regla que viajero_elegir_paquete)
function enPreventa(v) {
  const zona = String((v && v.zona_boleto) || '').trim();
  return String((v && v.tipo_paquete) || '').toLowerCase() === 'cheap' && (!zona || ZONA_PREVENTA_RE.test(zona));
}

// Cotiza UNA combinación con el motor. Devuelve el precio por persona o el motivo.
function cotizar(ev, hoteles, { paquete, zona, hotel, fechaIdx }) {
  const r = _calcularPrecio(ev, { hoteles, paquete, zona: zona || undefined, hotel_nombre: hotel || undefined, num_personas: 1, fecha_idx: Number.isInteger(fechaIdx) ? fechaIdx : 0 });
  return r && r.ok ? { ok: true, precio: Number(r.total) || 0, separo: r.separo } : { ok: false, motivo: (r && r.motivo) || 'no se pudo cotizar' };
}

// [COTIZA-VEND-1] `fechaIdx` es OPCIONAL: sin él la respuesta es byte a byte
// la de siempre (el Portal sigue rebotando el multifecha). El cotizador de
// vendedor sí sabe de qué fecha habla y la pasa — las listas y el precio se le
// piden a los MISMOS dueños con ese índice, cero copia.
function _opciones(ev, hoteles, fechaIdx) {
  const conIdx = Number.isInteger(fechaIdx) && fechaIdx >= 0;
  const fi = conIdx ? fechaIdx : 0;
  if (!conIdx && Array.isArray(ev.multifecha) && ev.multifecha.length) return { ok: false, motivo: 'este evento tiene varias fechas: el equipo te ayuda por WhatsApp' };
  const cdmx = esCDMX(ev);
  const paquetes = [];
  for (const p of ORDEN) {
    if (!PAQUETES.includes(p) || !paqueteVendibleEnSitio(ev, p).ok) continue;
    const llevaZona = p !== 'ride' || !!ev.forceZona;
    const llevaHotel = p !== 'cheap' && !ev.noHotel;
    const hab = llevaHotel ? (_hotelLista(ev, fi, cdmx, hoteles) || []).filter((h) => h && h.n && (!Array.isArray(h.viaj) || h.viaj.includes(1)))
      .map((h) => ({ nombre: h.n, extra: Number(h.e) || 0 })) : [];
    const base = hab.length ? hab[0].nombre : null; // la primera es la compartida ($0)
    let zonas = [];
    if (llevaZona) {
      for (const z of _zonaLista(ev, p, fi) || []) {
        if (!z || !z.n || ZONA_PREVENTA_RE.test(z.n)) continue;
        const c = cotizar(ev, hoteles, { paquete: p, zona: z.n, hotel: base, fechaIdx: fi });
        if (c.ok) zonas.push({ zona: z.n, precio: c.precio });
      }
      if (!zonas.length) continue; // sin zonas vendibles, el paquete no se ofrece
    } else {
      const c = cotizar(ev, hoteles, { paquete: p, hotel: base, fechaIdx: fi });
      if (!c.ok) continue;
      zonas = null;
      paquetes.push({ paquete: p, nombre: NOMBRES[p], zonas, precio: c.precio, habitaciones: hab });
      continue;
    }
    paquetes.push({ paquete: p, nombre: NOMBRES[p], zonas, habitaciones: hab });
  }
  return { ok: true, paquetes };
}

// [PN-MULTI-1, 11-nov-2026] Un evento MULTIFECHA (Pa'l Norte: 3 · 2 · 1 día)
// se elige en DOS pasos: primero la fecha/paquete de días (`fechas`), luego el
// paquete y la zona DE ESA fecha. Sin `fechaIdx` la respuesta trae las fechas
// con su «desde» y `paquetes: []`; con él, las opciones de esa fecha y su
// `evento_destino` ('slug#N') — a donde se muda el lugar al aplicar.
// Un evento de UNA fecha responde igual que siempre (sin `fechas`).
function _hoyMx() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' }); }
async function opcionesPaquete(eventoId, fechaIdx) {
  const slug = String(eventoId || '').split('#')[0];
  const lista = await fetchEventosRaw();
  if (!Array.isArray(lista)) return { ok: false, motivo: 'no pudimos leer el catálogo, intenta en un rato' };
  const ev = lista.find((x) => x && x.id === slug);
  if (!ev) return { ok: false, motivo: 'el evento no está en el catálogo' };
  let hoteles = {};
  try { hoteles = await fetchHotelesGlobales(); } catch (_) { hoteles = {}; }
  const evento = { nombre: ev.a || slug, fecha: ev.f || '' };
  if (Array.isArray(ev.multifecha) && ev.multifecha.length) {
    const fechas = [];
    for (const f of fechasVendibles(ev, _hoyMx())) {
      const mf = ev.multifecha[f.idx] || {};
      if (mf.prox) continue;
      const o = _opciones(ev, hoteles, f.idx);
      if (!o.ok || !o.paquetes.length) continue;
      const precios = [];
      o.paquetes.forEach((pq) => { if (pq.precio != null) precios.push(pq.precio); (pq.zonas || []).forEach((z) => precios.push(z.precio)); });
      fechas.push({ idx: f.idx, evento_id: f.evento_id, lbl: f.lbl, sublbl: String(mf.sublbl || ''), desde: precios.length ? Math.min.apply(null, precios) : null, _paquetes: o.paquetes });
    }
    if (!fechas.length) return { ok: false, motivo: 'todavía no hay paquetes a la venta para este evento' };
    const fi = Number.isInteger(fechaIdx) ? fechaIdx : (fechaIdx != null && fechaIdx !== '' && Number.isInteger(Number(fechaIdx)) ? Number(fechaIdx) : null);
    const elegida = fi == null ? null : fechas.find((f) => f.idx === fi);
    if (fi != null && !elegida) return { ok: false, motivo: 'esa opción de fecha ya no está disponible' };
    const publicas = fechas.map(({ _paquetes, ...r }) => r);
    return { ok: true, evento, multifecha: true, fechas: publicas, fecha_idx: elegida ? elegida.idx : null,
      evento_destino: elegida ? elegida.evento_id : null, paquetes: elegida ? elegida._paquetes : [], _ev: ev, _hoteles: hoteles };
  }
  const o = _opciones(ev, hoteles);
  if (!o.ok) return o;
  if (!o.paquetes.length) return { ok: false, motivo: 'todavía no hay paquetes a la venta para este evento' };
  return { ok: true, evento, paquetes: o.paquetes, evento_destino: null, _ev: ev, _hoteles: hoteles };
}

// Valida una elección contra el catálogo VIVO y devuelve su precio de lista.
// [PN-MULTI-1] En un multifecha exige `fecha_idx` y devuelve `evento_destino`.
async function validarEleccion(eventoId, { paquete, zona, hotel, fecha_idx }) {
  const o = await opcionesPaquete(eventoId, fecha_idx);
  if (!o.ok) return o;
  if (o.multifecha && o.fecha_idx == null) return { ok: false, motivo: 'elige primero de cuántos días (o qué fecha) es tu paquete' };
  const p = String(paquete || '').toLowerCase();
  const op = o.paquetes.find((x) => x.paquete === p);
  if (!op) return { ok: false, motivo: 'ese paquete no está disponible para este evento' };
  let z = null;
  if (op.zonas) {
    const hit = op.zonas.find((x) => x.zona === String(zona || '').trim());
    if (!hit) return { ok: false, motivo: 'elige una zona de la lista (esa ya no está disponible)' };
    z = hit.zona;
  }
  let h = null;
  if (op.habitaciones.length) {
    h = op.habitaciones.find((x) => x.nombre === String(hotel || '').trim());
    if (!h) return { ok: false, motivo: 'elige el tipo de habitación' };
    h = h.nombre;
  }
  const c = cotizar(o._ev, o._hoteles, { paquete: p, zona: z, hotel: h, fechaIdx: o.multifecha ? o.fecha_idx : undefined });
  if (!c.ok) return { ok: false, motivo: c.motivo };
  const fechaLbl = o.multifecha ? ((o.fechas.find((f) => f.idx === o.fecha_idx) || {}).lbl || '') : '';
  return { ok: true, paquete: p, zona: z, hotel: h, precio: c.precio, nombre: op.nombre, evento: o.evento, evento_destino: o.evento_destino, fecha_lbl: fechaLbl };
}

// [REQ-CORRIGE-1] Las fechas vendibles de un evento, con su evento_id
// 'slug#N' cuando es multifecha (una fecha ya pasada no se ofrece). Nació
// local en admin-cotizador (COTIZA-VEND-1); al volverse 2 lectores (el
// cotizador y el «Corregir y aprobar» de la bandeja) se MUDÓ aquí — dos
// copias serían dos listas que todavía no divergen.
function fechasVendibles(ev, hoyISO) {
  const { dsDeEvento } = require('./plan-pagos');
  const out = [];
  if (Array.isArray(ev.multifecha) && ev.multifecha.length) {
    ev.multifecha.forEach((mf, i) => {
      const id = ev.id + '#' + i;
      const ds = dsDeEvento(ev, id);
      if (ds && ds < hoyISO) return;
      out.push({ evento_id: id, idx: i, lbl: String((mf && mf.lbl) || ('Fecha ' + (i + 1))), ds: ds || null });
    });
    return out;
  }
  const ds = ev.ds ? String(ev.ds) : null;
  if (ds && ds < hoyISO) return out;
  out.push({ evento_id: ev.id, idx: null, lbl: String(ev.f || ''), ds });
  return out;
}

module.exports = { opcionesPaquete, validarEleccion, enPreventa, _opciones, fechasVendibles, NOMBRES, PREVENTA_DESCUENTO, totalPreventa };
