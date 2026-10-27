// =============================================================================
// _lib/paquete-sitio.js — [REQ-2027-1] ¿El SITIO vende este paquete en este
// evento? (26-oct-2026)
//
// Es el ESPEJO, en el servidor, de los botones de paquete del cotizador del
// index (la función que enciende/apaga PLUS · RIDE · STAY · CHEAP). El motor de
// precios (`_lib/precio-zona`) cotiza cualquier paquete que le pidan — y así
// debe seguir, porque lo usan también las cortesías y las capturas internas
// (palabra de Memo, 26-oct: «el candado SOLO en la puerta pública»). Esta lib
// la consulta ÚNICAMENTE `requisicion-crear`: lo que el público no puede elegir
// en la pantalla tampoco puede nacer por una petición armada a mano.
//
// Reglas, copiadas del index (no inventadas):
//   · rideOnly  → solo RIDE (y CHEAP si el evento trae cheapAlsoOk)
//   · cheapOnly → solo CHEAP (la preventa a ciegas vive aquí)
//   · CDMX o noStay → sin STAY
//   · cheapSoon (PRÓXIMAMENTE) o noCheap → sin CHEAP
// 🔒 Si el index cambia sus botones, esta lista se carea contra él
//    (`npm run mide:req-2027-1`).
// =============================================================================
const { esCDMX } = require('./precio-zona');

function paqueteVendibleEnSitio(ev, paquete) {
  const p = String(paquete || '').toLowerCase();
  if (!ev) return { ok: false, motivo: 'evento no encontrado' };
  // Por el VENUE, igual que `isCDMX` del index (no por la bandera `cdmx`):
  // si el servidor usara otra prueba, rechazaría lo que la pantalla ofrece.
  const cdmx = esCDMX(ev);
  if (ev.rideOnly) {
    if (p === 'ride') return { ok: true };
    if (p === 'cheap' && ev.cheapAlsoOk) return { ok: true };
    return { ok: false, motivo: 'este evento solo vende el viaje (RIDE)' };
  }
  if (ev.cheapOnly) {
    return p === 'cheap' ? { ok: true } : { ok: false, motivo: 'este evento solo vende boleto (CHEAP)' };
  }
  if (p === 'stay' && (cdmx || ev.noStay)) return { ok: false, motivo: 'este evento no tiene paquete STAY' };
  if (p === 'cheap' && (ev.cheapSoon || ev.noCheap)) return { ok: false, motivo: 'este evento no vende CHEAP por ahora' };
  return { ok: true };
}

module.exports = { paqueteVendibleEnSitio };
