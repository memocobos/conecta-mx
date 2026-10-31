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

async function opcionesPaquete(eventoId) {
  const slug = String(eventoId || '').split('#')[0];
  const lista = await fetchEventosRaw();
  if (!Array.isArray(lista)) return { ok: false, motivo: 'no pudimos leer el catálogo, intenta en un rato' };
  const ev = lista.find((x) => x && x.id === slug);
  if (!ev) return { ok: false, motivo: 'el evento no está en el catálogo' };
  let hoteles = {};
  try { hoteles = await fetchHotelesGlobales(); } catch (_) { hoteles = {}; }
  const o = _opciones(ev, hoteles);
  if (!o.ok) return o;
  if (!o.paquetes.length) return { ok: false, motivo: 'todavía no hay paquetes a la venta para este evento' };
  return { ok: true, evento: { nombre: ev.a || slug, fecha: ev.f || '' }, paquetes: o.paquetes, _ev: ev, _hoteles: hoteles };
}

// Valida una elección contra el catálogo VIVO y devuelve su precio de lista.
async function validarEleccion(eventoId, { paquete, zona, hotel }) {
  const o = await opcionesPaquete(eventoId);
  if (!o.ok) return o;
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
  const c = cotizar(o._ev, o._hoteles, { paquete: p, zona: z, hotel: h });
  if (!c.ok) return { ok: false, motivo: c.motivo };
  return { ok: true, paquete: p, zona: z, hotel: h, precio: c.precio, nombre: op.nombre, evento: o.evento };
}

module.exports = { opcionesPaquete, validarEleccion, enPreventa, _opciones, NOMBRES };
