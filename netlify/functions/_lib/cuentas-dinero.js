// =============================================================================
// _lib/cuentas-dinero.js — LAS CUENTAS DE DONDE SALE Y ENTRA EL DINERO.
//
// [UTIL-C-3] Nace porque esta lista estaba en CUATRO archivos idénticos
// (`admin-gasto-crear`, `admin-gasto-editar`, `admin-ingreso-crear`,
// `admin-ingreso-editar`) y hacía falta un quinto lugar para una regla nueva.
// Un catálogo repetido no es "dos listas iguales": es "dos listas que todavía
// no divergen" — y con las categorías de gasto esa frase ya se cumplió EN
// PRODUCCIÓN (el filtro no tenía `Combustible` ni `Comida Staff`, así que esos
// gastos no se podían filtrar, sin error ni aviso).
//
// ⚠️ LO QUE ESTE LIB **NO** UNIFICA, a propósito y medido:
// `admin-saldos` y `admin-reembolsos` tienen su propia lista de TRES —sin
// `Otro`— porque para ellas la lista son las CUBETAS que se pintan, no los
// valores que se aceptan. Un gasto con cuenta `Otro` sí entra en su
// `caja_total` (por el acumulador `otrosTotal`); lo que no tiene es cubeta
// propia. Son dos preguntas distintas sobre la misma columna, y unificarlas a
// ciegas cambiaría una pantalla de dinero sin haberla medido. Queda dicho aquí
// para que el próximo que lo vea sepa que ya se miró.
//
// LA REGLA NUEVA (decisión de Memo, UTIL-C):
//   utilidad global = Σ utilidades por evento − GASTOS SIN EVENTO
// Un gasto sin evento —renta, salarios, redes— resta de la utilidad de la
// empresa entera, así que tiene que decir DE QUÉ CAJA salió cada centavo. En un
// gasto de evento la cuenta sigue siendo opcional (es como estaba, y cambiarlo
// rompería la captura de hoy); en uno sin evento es OBLIGATORIA.
//
// Nace limpia: al escribirse había CERO gastos sin evento en la base (medido,
// no supuesto), así que la regla no deja ninguna fila vieja fuera de la ley.
// =============================================================================

// Las cuatro que el capturista puede elegir.
const CUENTAS = ['BBVA', 'Banamex', 'Efectivo', 'Otro'];

function esValidaCuenta(cuenta) {
  return CUENTAS.includes(cuenta);
}

// Normaliza lo que llega del navegador: cadena con contenido o `null`.
function normCuenta(v) {
  return (typeof v === 'string' && v.trim()) ? v.trim() : null;
}

// El veredicto para un GASTO. Devuelve `null` si está bien, o el texto del
// error. Se contesta lo mismo en el alta y en la edición: editar no puede ser
// la puerta trasera del alta.
function errorCuentaDeGasto(cuenta, eventoId) {
  if (cuenta && !esValidaCuenta(cuenta)) return 'cuenta inválida';
  if (!eventoId && !cuenta) {
    return 'Un gasto sin evento resta de la utilidad de toda la empresa: hay que decir de qué cuenta salió.';
  }
  return null;
}

// Y el de un INGRESO, que hoy solo valida el valor. Vive aquí para que la lista
// no vuelva a tener dos dueños, no porque comparta la regla del evento.
function errorCuentaDeIngreso(cuenta) {
  if (cuenta && !esValidaCuenta(cuenta)) return 'cuenta inválida';
  return null;
}

module.exports = { CUENTAS, esValidaCuenta, normCuenta, errorCuentaDeGasto, errorCuentaDeIngreso };
