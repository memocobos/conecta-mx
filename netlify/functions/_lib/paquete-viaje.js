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

// ── [MIG-1b] ¿CONSUME UN BOLETO DE LA BODEGA? ────────────────────────────────
// Esta regla NO estaba escrita en ningún módulo: vivía suelta dentro de
// `_lib/disponibilidad`, en un `String(row.paquete).toUpperCase() === 'RIDE'`.
// MIG-1b necesita la MISMA regla para un segundo origen (los viajeros migrados),
// y dos copias de una regla acaban divergiendo — así que vive aquí, con las
// otras dos preguntas que se le hacen a un paquete, y los dos orígenes la LEEN.
//
// RIDE no consume: es solo transporte, el boleto lo trae la persona.
// Todo lo demás sí — incluido el paquete VACÍO, y eso es a propósito: en el
// Portal una solicitud sin paquete es un cliente sin clasificar, y no contarlo
// sería sub-reportar lo vendido, o sea SOBREVENDER. Ante la duda, cuenta.
const NO_CONSUMEN_BOLETO = ['ride'];

// El STAFF no consume de la bodega comprada: entra por otra puerta. Se decide
// por `tipo_viajero`, no por el paquete — `contrato-firmar` inserta al staff con
// `tipo_paquete:'PLUS'`, así que mirar el paquete lo contaría como cliente.
// ⚠️ Sin `tipo_viajero` (el caso del Portal: `solicitudes_tour` no tiene esa
// columna) se asume CLIENTE. Cambiar ese default sub-reportaría lo vendido.
function esCliente(tipoViajero) {
  const tv = String(tipoViajero == null ? '' : tipoViajero).trim().toLowerCase();
  return tv === '' || tv === 'cliente';
}

function consumeBoleto(tipoPaquete, tipoViajero) {
  if (!esCliente(tipoViajero)) return false;
  const p = normPaquete(tipoPaquete);
  if (p === null) return true;
  return !NO_CONSUMEN_BOLETO.includes(p);
}

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

module.exports = {
  VIAJAN, DUERMEN, NO_CONSUMEN_BOLETO,
  normPaquete, viaja, duerme, esCliente, consumeBoleto,
  motivoNoViaja, motivoNoDuerme,
};
