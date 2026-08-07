// =============================================================================
// _lib/categorias-gasto.js — EL CATÁLOGO DE CATEGORÍAS DE GASTO. Fuente única.
//
// [AUD-1g] La auditoría encontró que la migración de FIN-1b escribió `boletos`,
// `hotel` y `transporte` (minúsculas, y `hotel` ni siquiera existía en el
// catálogo del select). Cualquier filtro o agrupación por categoría los dejaba
// fuera EN SILENCIO. Jane lo reparó en la base; esto impide que vuelva a pasar.
//
// LA LISTA VIVE AQUÍ Y EN NINGÚN OTRO LADO. El `<select>` del navegador se
// llena con lo que devuelve `admin-gastos-list`, que lee esta constante — dos
// copias de un catálogo son dos catálogos, y acaban divergiendo el día que
// alguien agrega una categoría en un solo sitio.
//
// Añadir una categoría = una línea aquí. Nada más.
// =============================================================================

const CATEGORIAS = [
  'Transporte',
  'Hospedaje',
  'Kits',
  'Boletos',
  'Marketing',
  'Salarios',
  'Renta',
  'Combustible',
  'Comida Staff',
  'Otros',
];

// ¿Es una categoría del catálogo? Sensible a mayúsculas A PROPÓSITO: si se
// aceptara 'boletos' además de 'Boletos', la tabla acabaría con las dos y
// agrupar por categoría volvería a partir el mismo concepto en dos.
// `null`/vacío es válido: la categoría es opcional.
function esValida(cat) {
  if (cat == null || cat === '') return true;
  return CATEGORIAS.includes(String(cat));
}

// El error, redactado para quien lo lee: dice qué se aceptaría.
function errorCategoria(cat) {
  return `Categoría inválida: "${String(cat).slice(0, 60)}". Las válidas son: ${CATEGORIAS.join(', ')}.`;
}

module.exports = { CATEGORIAS, esValida, errorCategoria };
