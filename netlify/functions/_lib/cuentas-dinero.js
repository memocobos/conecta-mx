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

// ─────────────────────────────────────────────────────────────────────────────
// [SALDOS-CAJA-1 · 12-oct-2026] EL ANCLA DE CAJA del visor de Saldos.
//
// Luz verde de Memo («confío en ti, haz lo que creas mejor para tener un mejor
// control financiero»), con la brecha MEDIDA antes de decidir: el visor sumaba
// como entradas TODO lo cobrado a los migrados con la regla paquete→banco
// (aproximación del pasado, no registro de dónde cayó cada peso) y el gasto de
// ese dinero histórico nunca se capturó → pintaba ≈+$1.5M/+$6.4M contra bancos
// reales de $16.5k/$137k. Un «asiento de ajuste» habría sido un gasto de
// millones que destroza la utilidad. Era tuerca del visor, no un asiento.
//
// La forma elegida — el visor ARRANCA del banco real y de ahí solo lo capturado:
//   saldo por cuenta = ingresos (incluido el «Saldo inicial» del 13-oct)
//                      + pagos cobrados − gastos, SOLO con fecha >= ancla.
// Lo anterior al ancla ya vive DENTRO del saldo inicial (el banco real ya lo
// descuenta); restarlo otra vez lo contaría doble. Las entradas de clientes
// posteriores NO se suman solas (los abonos del careo llevan fecha de COSECHA y
// cuenta APROXIMADA — mentirían sobre el banco): se reflejan capturando un
// ingreso manual por cuenta, o re-anclando. La conciliación fina sigue siendo
// CONCILIA-1 + la columna `fuente` pendiente.
//
// LOS MONTOS DEL ANCLA NO VIVEN AQUÍ A PROPÓSITO: este repo se publica en
// conectareynosa.mx y un saldo bancario versionado queda descargable. Viven
// como filas de `ingresos` del Portal (categoria 'Saldo inicial',
// registrado_por 'jane-saldos-caja-1'). RE-ANCLAR = asientos nuevos de «Saldo
// inicial» con la fecha nueva + mover estas constantes (tuerca chica), o un
// ingreso/gasto de ajuste con la diferencia contra el banco.
//
// DOS constantes porque hay DOS tipos de columna, y mezclarlas es la mordida
// de siempre de los husos:
//   CAJA_ANCLA_DIA      → columnas `date` (gastos.fecha, ingresos.fecha).
//   CAJA_ANCLA_INSTANTE → columnas timestamptz (pagos.fecha_pagada):
//     medianoche del 13-oct-2026 en Reynosa = 05:00Z (Reynosa va en −05:00
//     hasta el 1-nov; el ancla es UN instante fijo, no una fecha recurrente,
//     así que el cambio de horario posterior no la mueve). Un gte por el día
//     UTC pelado habría metido la noche del 12 de Reynosa — la ley de
//     «toISOString() nunca es hoy en México».
// ─────────────────────────────────────────────────────────────────────────────
const CAJA_ANCLA_DIA = '2026-10-13';
const CAJA_ANCLA_INSTANTE = '2026-10-13T05:00:00Z';

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

module.exports = {
  CUENTAS, esValidaCuenta, normCuenta, errorCuentaDeGasto, errorCuentaDeIngreso,
  // [SALDOS-CAJA-1]
  CAJA_ANCLA_DIA, CAJA_ANCLA_INSTANTE,
};
