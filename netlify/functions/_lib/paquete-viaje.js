// =============================================================================
// _lib/paquete-viaje — QUIÉN VIAJA Y QUIÉN DUERME, según su paquete.
//
// [VJ-4] Nació de un bug que trajo la migración: `viajeros_evento` estaba vacía,
// así que las pantallas de transporte y habitaciones nunca habían tenido que
// filtrar por paquete. Con los 29 migrados de melanie encima, los CHEAP salieron
// ofrecidos para subir a un camión y para dormir en un cuarto. CHEAP es SOLO
// BOLETO: ni viaja ni duerme. Y STAY es "sin transporte": duerme, pero no viaja.
//
// LA REGLA VIVE AQUÍ Y EN UN SOLO LUGAR MÁS (el espejo de kamehouse.js, que el
// arnés carea contra este archivo). Dos copias sueltas de una regla de negocio
// acaban divergiendo, y el síntoma sería que la misma persona sube al camión en
// una pantalla y no en la otra.
//
//   viaja   → plus · ride · null      (transporte)
//   duerme  → plus · ride · stay · null   (habitaciones)
//   cheap   → NUNCA en ninguna de las dos
//   stay    → duerme sí, viaja no
//
// NULL = staff, intercambio, la ganadora de un sorteo. Se dejan DISPONIBLES a
// propósito: no sabemos su paquete y Memo decide. Esconderlos sería decidir por
// él, y es más fácil quitar a alguien de una lista que descubrir que faltaba.
//
// SIN DISTINGUIR MAYÚSCULAS, y esto no es cosmético: los migrados del Excel
// traen 'plus' en minúscula y `viajero_upsert_staff` inserta 'PLUS' en
// mayúscula. Un filtro sensible a mayúsculas dejaría fuera del camión a todo el
// staff que aceptó su tour.
// =============================================================================

const VIAJAN = ['plus', 'ride'];
const DUERMEN = ['plus', 'ride', 'stay'];

// Normaliza el paquete. Vacío/nulo → null (que NO es lo mismo que desconocido:
// aquí null significa "sin paquete asignado" y por regla se incluye).
function normPaquete(tp) {
  const s = String(tp == null ? '' : tp).trim().toLowerCase();
  return s || null;
}

function viaja(tp) {
  const p = normPaquete(tp);
  return p === null || VIAJAN.includes(p);
}

function duerme(tp) {
  const p = normPaquete(tp);
  return p === null || DUERMEN.includes(p);
}

// Motivo legible para la pantalla, cuando alguien está asignado y no debería.
// Se dice el paquete: "no viaja: cheap" explica y además enseña la regla.
function motivoNoViaja(tp) {
  const p = normPaquete(tp);
  return p ? `no viaja: ${p}` : 'no viaja';
}
function motivoNoDuerme(tp) {
  const p = normPaquete(tp);
  return p ? `no duerme: ${p}` : 'no duerme';
}

module.exports = { VIAJAN, DUERMEN, normPaquete, viaja, duerme, motivoNoViaja, motivoNoDuerme };
