// =============================================================================
// _lib/epoca — EL CORTE DE ÉPOCA del Palacio (EPOCA-1, 12-oct-2026).
//
// Palabra de Memo, citada: «la migración vieja elimínala para que no marque
// nada… solo deja la info de calle 24 en adelante, así habíamos quedado».
//
// La ÉPOCA NUEVA arranca con calle24 (3-sep-2026): es el primer evento operado
// con números cerrados bajo el rumbo manual. Todo lo anterior —la migración
// del Excel viejo, con sus 1,100+ contratos en $0— sigue VIVO en la base
// (jamás se borra: es el archivo histórico y alimenta el contador público de
// la portada), pero las pantallas OPERATIVAS del Palacio (Resumen, cobranza)
// ya no lo pintan.
//
// 🔒 El corte es OPT-IN por diseño: quien quiere época nueva lo PIDE
// (`epocaDesde: EPOCA_INICIO`). `viajeros-contador` —el «2,468 viajeros y
// contando» de la portada— NO lo pide a propósito: ese número ES la historia
// completa y presume justo lo acumulado.
//
// 🔒 La FECHA de un evento sale de `esferas_eventos.fecha_inicio` (todo evento
// de la época nueva nace en Esferas, así que siempre la tiene). Un slug SIN
// ficha o sin fecha es época vieja por definición — melanie, los fanfest, y
// `palnorte2026` (los 232 viajeros del Pa'l Norte pasado, mudados de slug el
// 12-oct porque la ficha viva `palnorte` es el festival 2027: NO son el mismo
// evento, palabra de Memo).
// =============================================================================

const EPOCA_INICIO = '2026-09-03'; // calle24 — el primer evento de la época nueva

// PURO: ¿esta fecha (YYYY-MM-DD o null) pertenece a la época nueva?
function esEpocaNueva(fechaInicio, desde) {
  const corte = desde || EPOCA_INICIO;
  return typeof fechaInicio === 'string' && fechaInicio >= corte;
}

module.exports = { EPOCA_INICIO, esEpocaNueva };
