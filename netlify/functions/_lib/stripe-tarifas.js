// =============================================================================
// _lib/stripe-tarifas.js — LOS PORCENTAJES, EN UN SOLO LUGAR (Fase C · ST-1)
//
// El cargo por servicio lo paga el CLIENTE (la utilidad de Memo queda intacta),
// salvo que el interruptor de promo diga lo contrario. Aquí vive TODO lo
// configurable de esa cuenta: los %, qué cuotas aceptan tarjeta y quién absorbe.
//
// Regla dura: EL TOTAL SE CALCULA SIEMPRE AQUÍ, EN EL SERVIDOR. El cliente pide
// un método, nunca un monto.
//
// Dinero en CENTAVOS enteros de punta a punta: es como habla Stripe y es la
// única forma de no acumular error de flotante. Los pesos solo aparecen en la
// frontera (lo que viene de `pagos.monto`) y se convierten una vez.
// =============================================================================

// Porcentaje por método. Override por env para poder ajustar sin deploy.
// (Cuando exista UI para editarlos, se mueven a tabla — hoy sería una migración
//  que nadie puede tocar.)
const PCT = {
  oxxo:    num(process.env.STRIPE_PCT_OXXO,    0.04),   // ~4%
  debito:  num(process.env.STRIPE_PCT_DEBITO,  0.04),   // ~4%
  credito: num(process.env.STRIPE_PCT_CREDITO, 0.05),   // ~5% (1 exhibición)
  msi3:    num(process.env.STRIPE_PCT_MSI3,    0.05),   // ~5%
  msi6:    num(process.env.STRIPE_PCT_MSI6,    0.08),   // ~8%
};

const METODOS = Object.keys(PCT);

// Cómo se llama el método en la columna `metodo` de `pagos` (el CHECK nuevo).
const METODO_BD = {
  oxxo: 'stripe_oxxo', debito: 'stripe_debito', credito: 'stripe_credito',
  msi3: 'stripe_msi3', msi6: 'stripe_msi6',
};

// Meses sin intereses que le pedimos a Stripe por método.
const MSI_MESES = { msi3: 3, msi6: 6 };

function num(v, porDefecto) {
  const n = Number(v);
  return (Number.isFinite(n) && n >= 0 && n < 1) ? n : porDefecto;
}

// ¿Quién absorbe el cargo? 'cliente' (normal) o 'conecta' (promo).
function quienAbsorbe() {
  return String(process.env.STRIPE_ABSORBE_CARGO || 'cliente').toLowerCase() === 'conecta'
    ? 'conecta' : 'cliente';
}

// ¿Esta cuota acepta Stripe? Por defecto TODAS; se puede acotar por env a una
// lista de conceptos (p. ej. "Separo,Pago final") como pide el brief.
function cuotaElegible(concepto) {
  const lista = String(process.env.STRIPE_CUOTAS_ELEGIBLES || '').trim();
  if (!lista) return true;
  const permitidos = lista.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return permitidos.includes(String(concepto || '').trim().toLowerCase());
}

// EL CÁLCULO. montoPesos → { base, cargo, total } en CENTAVOS enteros.
// Redondeo del cargo: Math.round al centavo. Si absorbe Conecta, el cargo es 0
// y el cliente paga exactamente su cuota.
function calcularTotal(montoPesos, metodo) {
  if (!METODOS.includes(metodo)) return { error: 'método no soportado: ' + metodo };
  const pesos = Number(montoPesos);
  if (!Number.isFinite(pesos) || pesos <= 0) return { error: 'monto inválido' };

  const base = Math.round(pesos * 100);              // pesos → centavos, UNA vez
  const pct = PCT[metodo];
  const absorbe = quienAbsorbe();
  const cargo = absorbe === 'conecta' ? 0 : Math.round(base * pct);
  return {
    base_cent: base,
    cargo_cent: cargo,
    total_cent: base + cargo,
    pct_aplicado: pct,
    absorbe,
    metodo_bd: METODO_BD[metodo],
    msi_meses: MSI_MESES[metodo] || null,
  };
}

module.exports = { PCT, METODOS, METODO_BD, MSI_MESES, calcularTotal, quienAbsorbe, cuotaElegible };
