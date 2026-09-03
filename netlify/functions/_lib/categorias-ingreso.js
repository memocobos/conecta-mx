// =============================================================================
// _lib/categorias-ingreso.js — EL CATÁLOGO DE CATEGORÍAS DE INGRESO. Fuente única.
//
// [INGRESO-CAT-1] Gemelo exacto de `categorias-gasto`. El hueco venía anotado
// desde DEFAULTS-1: `admin-ingreso-crear` y `admin-ingreso-editar` NO validaban
// la categoría contra ningún catálogo —solo la recortaban a 60 caracteres—, así
// que el NAVEGADOR era la única guarda. Cualquier cliente que hablara con la
// función directamente podía escribir lo que quisiera, y la categoría de un
// ingreso decide cómo se lee ese dinero.
//
// LA LISTA VIVE AQUÍ Y EN NINGÚN OTRO LADO. Los DOS `<select>` del navegador
// —el del alta y el del filtro de la tabla— se llenan con lo que devuelve
// `admin-ingresos-list`, que lee esta constante.
//
// ⚠️ POR QUÉ IMPORTA QUE SEAN LOS DOS: en gastos, esas dos listas vivían
// escritas a mano en el HTML y YA HABÍAN DIVERGIDO en producción — al filtro le
// faltaban `Combustible` y `Comida Staff`, así que un gasto capturado con esas
// categorías NO SE PODÍA FILTRAR, sin error ni aviso. Medido el 3-sep-2026, las
// dos listas de ingreso son todavía idénticas: esta tuerca llega ANTES de la
// divergencia, no después. Dos copias iguales no son una copia: son dos listas
// que aún no divergen.
//
// MEDIDO EN LA BASE ANTES DE ESCRIBIRLO (3-sep-2026, proyecto del PORTAL —
// `public.ingresos` vive ahí, no en KameHouse): la tabla tiene **0 filas**, con
// `gastos` en 1 como control de que la consulta sí llegaba. **No hay ninguna
// categoría huérfana que rescatar**, así que el catálogo es exactamente el que
// ya ofrecía el markup. Si algún día aparece una fila con categoría fuera de
// esta lista, es un dato que hay que reportar, no borrar.
//
// Añadir una categoría = una línea aquí. Nada más.
// =============================================================================

const CATEGORIAS = [
  'Vuelo',
  'Autobús',
  'Cargo administrativo',
  'Boleto extra',
  'Otro',
];

// ¿Es una categoría del catálogo? Sensible a mayúsculas A PROPÓSITO: si se
// aceptara 'vuelo' además de 'Vuelo', la tabla acabaría con las dos y agrupar
// por categoría partiría el mismo concepto en dos.
// `null`/vacío es válido: la columna `categoria` es nullable (medido en
// `information_schema`) y el select nace vacío a propósito (DEFAULTS-1).
function esValida(cat) {
  if (cat == null || cat === '') return true;
  return CATEGORIAS.includes(String(cat));
}

// El error, redactado para quien lo lee: dice qué se aceptaría.
function errorCategoria(cat) {
  return `Categoría de ingreso inválida: "${String(cat).slice(0, 60)}". Las válidas son: ${CATEGORIAS.join(', ')}.`;
}

module.exports = { CATEGORIAS, esValida, errorCategoria };
