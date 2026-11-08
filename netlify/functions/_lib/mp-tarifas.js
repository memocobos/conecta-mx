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

// ── [MP-LINK-1] EL LINK DE PAGO (8-nov-2026) ────────────────────────────────
// El link de Checkout Pro deja al cliente elegir el método EN la página de MP
// (tarjeta, OXXO, SPEI…), así que el cargo no puede depender del método: se
// cobra UNA tarifa configurada para el link, decidida ANTES de generarlo.
// Palabra de Memo (8-nov): «se la cobra al cliente».
//
//   MP_PCT_LINK   fracción (0.0349 = 3.49 %). SIN ella el link NO se genera y la
//                 requisición sigue como hoy («te mandamos tu link») — la misma
//                 regla de arriba: jamás un número de respaldo en dinero.
//   MP_FIJA_LINK  pesos fijos por operación (sin ella, 0).
//   MP_IVA_CARGO  IVA sobre la comisión de MP (default 0.16 — MP factura IVA
//                 sobre su comisión; es la única constante que trae default,
//                 porque es ley, no negociación).
//
// La fórmula despeja el TOTAL para que a la casa le quede EXACTO el neto:
//   total − total·pct·(1+iva) − fija·(1+iva) = neto
//   total = (neto + fija·(1+iva)) / (1 − pct·(1+iva))
// y se redondea HACIA ARRIBA al peso: un peso de más se le explica al cliente,
// un peso de menos descuadra el separo. `MP_ABSORBE_CARGO=1` lo apaga igual
// que a las tarifas por método.
function pctLink() { return pct('MP_PCT_LINK'); }
function fijaLink() {
  const n = Number(process.env.MP_FIJA_LINK);
  return (Number.isFinite(n) && n >= 0) ? n : 0;
}
function ivaCargo() {
  const v = process.env.MP_IVA_CARGO;
  if (v == null || String(v).trim() === '') return 0.16;
  const n = Number(v);
  return (Number.isFinite(n) && n >= 0 && n < 1) ? n : 0.16;
}
// ¿Se puede ofrecer el link? Solo con tarifa configurada.
function linkConfigurado() { return pctLink() != null; }

// { neto_pesos, comision_pesos, total_pesos } o { error }.
function calcularLink(netoPesos) {
  const neto = Number(netoPesos);
  if (!Number.isFinite(neto) || neto <= 0) return { error: 'monto inválido' };
  const p = pctLink();
  if (p == null) return { error: 'sin tarifa configurada para el link (MP_PCT_LINK)' };
  if (absorbeLaCasa()) {
    const n = Math.round(neto * 100) / 100;
    return { neto_pesos: n, comision_pesos: 0, total_pesos: n };
  }
  const f = (1 + ivaCargo());
  const total = Math.ceil((neto + fijaLink() * f) / (1 - p * f));
  return {
    neto_pesos: Math.round(neto * 100) / 100,
    comision_pesos: Math.round((total - neto) * 100) / 100,
    total_pesos: total,
  };
}

module.exports = {
  ETIQUETAS, ORDEN, METODOS_MSI, PCT_ENV, pct, absorbeLaCasa, umbralMsi, metodosPara, calcularTotal,
  pctLink, fijaLink, ivaCargo, linkConfigurado, calcularLink,
};
