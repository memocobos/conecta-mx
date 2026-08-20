// =============================================================================
// _lib/mp-tarifas.js — LOS PORCENTAJES DE MERCADO PAGO, EN UN SOLO LUGAR (MP-1b)
//
// Espejo de `_lib/stripe-tarifas`: el cargo por servicio lo paga el CLIENTE (la
// utilidad de Memo queda intacta), salvo que el interruptor diga lo contrario.
//
// ⚠️ AQUÍ NO HAY NINGÚN PORCENTAJE ESCRITO A MANO, Y ES A PROPÓSITO.
//
// Las tarifas de Mercado Pago NO son las de Stripe y VARÍAN POR NEGOCIACIÓN:
// las de la cuenta de Memo solo las sabe su panel. Inventar un número aquí
// sería inventar dinero — cobraría de más o de menos a un cliente real desde el
// primer pago, y en silencio, porque un porcentaje plausible no se nota.
//
// Por eso: cada método se enciende con SU env var. **Sin la env, el método NO
// SE OFRECE** — no cae a un default. Es la misma regla de la casa que
// PAGOS_MP_MODO: la ausencia es apagado, para encender hay que decirlo.
//
// Consecuencia buscada: mientras Memo no pegue sus porcentajes reales en
// Netlify, `mp-separo-opciones` devuelve `activo:false` y el Portal se queda con
// su transferencia de siempre. La venta NUNCA se rompe; solo no aparece la
// tarjeta. Un menú vacío es honesto; un menú con tarifas inventadas, no.
//
// Env por método:  MP_PCT_DEBITO · MP_PCT_CREDITO · MP_PCT_MSI3 · MP_PCT_MSI6
// Interruptor:     MP_ABSORBE_CARGO=1 → lo absorbe la casa (promo), no el cliente
// Umbral MSI:      MP_MSI_UMBRAL_PCT (fracción del total; sin ella, MSI fuera)
// =============================================================================

// null = no configurado = no se ofrece. Jamás un número de respaldo.
function pct(env) {
  const v = process.env[env];
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n >= 1) return null;   // 0.045 = 4.5%
  return n;
}

const ETIQUETAS = {
  debito:  { label: 'Tarjeta de débito',  nota: 'Pago inmediato · verificación 3D Secure' },
  credito: { label: 'Tarjeta de crédito', nota: 'Una exhibición · verificación 3D Secure' },
  msi3:    { label: '3 meses sin intereses', nota: 'Solo tarjetas participantes' },
  msi6:    { label: '6 meses sin intereses', nota: 'Solo tarjetas participantes' },
};
const ORDEN = ['debito', 'credito', 'msi3', 'msi6'];
const METODOS_MSI = ['msi3', 'msi6'];

const PCT_ENV = { debito: 'MP_PCT_DEBITO', credito: 'MP_PCT_CREDITO', msi3: 'MP_PCT_MSI3', msi6: 'MP_PCT_MSI6' };

// ¿Quién paga el cargo? Por defecto el cliente (la utilidad queda intacta).
const absorbeLaCasa = () => String(process.env.MP_ABSORBE_CARGO || '') === '1';

// Umbral para ofrecer MSI: sin env, MSI no se ofrece. No se adivina.
function umbralMsi() {
  const n = Number(process.env.MP_MSI_UMBRAL_PCT);
  return (Number.isFinite(n) && n > 0) ? n : null;
}

// Métodos ofrecibles para este separo. Un método sin porcentaje configurado
// NO entra: no se puede cobrar lo que no se sabe cuánto cuesta.
function metodosPara(separoPesos, totalPesos) {
  const out = [];
  const u = umbralMsi();
  for (const m of ORDEN) {
    if (pct(PCT_ENV[m]) == null) continue;                       // sin tarifa → fuera
    if (METODOS_MSI.includes(m)) {
      if (u == null) continue;                                   // sin umbral → MSI fuera
      if (!(Number(separoPesos) >= Number(totalPesos) * u)) continue;
    }
    out.push(m);
  }
  return out;
}

// El total que paga el cliente, EN PESOS (MP no usa centavos). Se redondea a
// dos decimales: `transaction_amount` acepta decimales y un céntimo perdido en
// cada pago es dinero que no cuadra al cerrar el mes.
function calcularTotal(separoPesos, metodo) {
  const p = pct(PCT_ENV[metodo]);
  if (p == null) return { error: `sin tarifa configurada para ${metodo} (${PCT_ENV[metodo]})` };
  const base = Number(separoPesos);
  if (!Number.isFinite(base) || base <= 0) return { error: 'separo inválido' };
  const cargo = absorbeLaCasa() ? 0 : Math.round(base * p * 100) / 100;
  return {
    base_pesos: Math.round(base * 100) / 100,
    cargo_pesos: cargo,
    total_pesos: Math.round((base + cargo) * 100) / 100,
  };
}

module.exports = { ETIQUETAS, ORDEN, METODOS_MSI, PCT_ENV, pct, absorbeLaCasa, umbralMsi, metodosPara, calcularTotal };
