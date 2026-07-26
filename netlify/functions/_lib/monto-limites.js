// =============================================================================
// _lib/monto-limites.js — 💰 CAP3-1: tope de cordura para montos capturados
//
// EL HUECO: gastos, ingresos y abonos validaban `Number.isFinite && >= 0` pero
// SIN techo. Un dedazo de tres ceros ($1,180 → $1,180,000) entraba sin una sola
// queja, y de ahí la mentira se propaga sola:
//   · la caja real del evento queda distorsionada;
//   · admin-liquidacion calcula el 30% de comisiones sobre ese número falso;
//   · un monto_pagado inflado hace que la reconciliación dé un tour por
//     'pagado' antes de tiempo.
// Todas son fallas SILENCIOSAS: nadie recibe un error, simplemente los números
// dejan de ser ciertos.
//
// DECISIÓN DE MEMO: tope de $500,000 POR PARTIDA y comportamiento RECHAZAR (sin
// casilla de "confirmo que sí es correcto"). Si un movimiento real supera el
// tope, se captura en dos partidas — que además deja mejor rastro contable.
//
// El tope es POR PARTIDA, no por total: un evento puede acumular millones en
// gastos legítimos, lo que no es normal es que UNA línea valga medio millón.
// =============================================================================

const MONTO_MAX_MXN = 500000;

// $1,180,000 — separadores de miles, sin decimales cuando es entero.
function formatMXN(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return '$' + num.toLocaleString('es-MX', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// validarMonto(valor, { permitirCero }) → { ok:true, monto } | { ok:false, error }
//
// `permitirCero` respeta lo que cada endpoint acepta HOY: gastos/ingresos
// admiten 0 (una partida en ceros es válida mientras se captura), pero un pago
// de grupo exige > 0. No se cambia esa semántica: solo se le pone techo.
function validarMonto(valor, opciones) {
  const permitirCero = !opciones || opciones.permitirCero !== false;
  const etiqueta = (opciones && opciones.etiqueta) || 'El monto';
  // OJO: Number(null) === 0 y Number('') === 0. Sin este filtro, un monto
  // AUSENTE se colaría como una partida de $0 en vez de avisar que falta.
  if (valor == null || (typeof valor === 'string' && valor.trim() === '')) {
    return { ok: false, error: `${etiqueta} es obligatorio` };
  }
  if (typeof valor === 'boolean') {
    return { ok: false, error: `${etiqueta} debe ser un número` };
  }
  const monto = Number(valor);

  if (!Number.isFinite(monto)) {
    return { ok: false, error: `${etiqueta} debe ser un número` };
  }
  if (monto < 0) {
    return { ok: false, error: `${etiqueta} debe ser un número mayor o igual a 0` };
  }
  if (!permitirCero && monto === 0) {
    return { ok: false, error: `${etiqueta} debe ser mayor a 0` };
  }
  if (monto > MONTO_MAX_MXN) {
    return {
      ok: false,
      error: `${formatMXN(monto)} se ve fuera de rango (máximo ${formatMXN(MONTO_MAX_MXN)} por partida). `
           + 'Revisa el monto — si de verdad es correcto, captúralo en dos partidas.',
    };
  }
  return { ok: true, monto };
}

module.exports = { MONTO_MAX_MXN, validarMonto, formatMXN };
