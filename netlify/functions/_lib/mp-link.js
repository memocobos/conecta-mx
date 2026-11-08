// =============================================================================
// _lib/mp-link.js — EL LINK DE PAGO DE UNA REQUISICIÓN (MP-LINK-1, 8-nov-2026)
//
// Palabra de Memo (domingo 8-nov): links de pago de Mercado Pago al reservar en
// el index, por cuota en el Portal y como botón en KameHouse · la comisión se
// la cobra al cliente · al caer el pago el sistema MARCA «pagado en MP» y
// Bulma/Milk aprueban. NADA AUTOMÁTICO DECIDE DINERO (rumbo del 12-oct): aquí
// nace un link y se guarda en la fila; el dinero lo escribe un humano al
// aprobar, con la marca del webhook enfrente.
//
// Reusa el contrato de agosto (`_lib/mercadopago`: interruptor PAGOS_MP_MODO,
// llave coherente, apiPost, firma) y la tarifa del link (`_lib/mp-tarifas`).
// Dos lectores lo piden: `requisicion-crear` (al nacer con forma link_pago) y
// `admin-requisiciones` (acción `mp_link`: regenerar/copiar desde la bandeja).
//
// 🔒 FAIL-SOFT A LO DE HOY: si MP está apagado, la llave no cuadra, la tarifa
//    no está o MP rechaza la preferencia, la requisición vive IGUAL y la pantalla
//    dice lo de siempre («te mandamos tu link por WhatsApp»). Un link que no se
//    pudo generar jamás tumba una reservación.
// 🔒 EL MONTO lo pone el SERVIDOR: separo_sistema (del dueño del precio) +
//    comisión (calcularLink). El cliente no manda un peso.
// 🔒 external_reference = `req:<folio>` — el webhook lo lee del GET del pago y
//    por ese prefijo sabe que es una requisición de KameHouse (el uuid pelado
//    sigue siendo el flujo viejo del Portal, que no se toca).
// =============================================================================

const mp = require('./mercadopago');
const tarifas = require('./mp-tarifas');

const SITE = () => (process.env.SITE_URL || 'https://conectareynosa.mx').replace(/\/+$/, '');
const PREFIJO_REQ = 'req:';

// ¿Se puede ofrecer el link ahora mismo? Devuelve { ok, motivo }.
function disponible() {
  if (!mp.encendido()) return { ok: false, motivo: 'PAGOS_MP_MODO apagado' };
  const ll = mp.llaveCoherente();
  if (!ll.ok) return { ok: false, motivo: ll.error };
  if (!tarifas.linkConfigurado()) return { ok: false, motivo: 'MP_PCT_LINK sin configurar' };
  return { ok: true };
}

// El external_reference de una requisición y su lectura inversa.
function referenciaDe(folio) { return PREFIJO_REQ + String(folio || '').trim(); }
function folioDeReferencia(ref) {
  const s = String(ref == null ? '' : ref).trim();
  if (!s.startsWith(PREFIJO_REQ)) return null;
  const f = s.slice(PREFIJO_REQ.length).trim();
  return /^[A-Z0-9-]{3,20}$/i.test(f) ? f : null;
}

// Crea la preferencia de Checkout Pro para una requisición YA insertada y la
// guarda en su fila. `req` trae folio, id, separo_sistema, evento_nombre,
// evento_id, paquete, zona, num_personas, nombre, correo.
// Devuelve { ok:true, url, preference_id, total_pesos, comision_pesos, neto_pesos }
// o { ok:false, motivo } — JAMÁS lanza.
async function crearLinkRequisicion({ req, SB_URL, sbH, fetchImpl }) {
  const _fetch = fetchImpl || fetch;
  try {
    const d = disponible();
    if (!d.ok) return { ok: false, motivo: d.motivo };
    const neto = Number(req && req.separo_sistema);
    if (!(neto > 0)) return { ok: false, motivo: 'la requisición no trae separo_sistema' };
    const t = tarifas.calcularLink(neto);
    if (t.error) return { ok: false, motivo: t.error };

    const folio = String(req.folio);
    const pref = {
      items: [{
        id: folio,
        title: `Separo · ${req.evento_nombre || req.evento_id} · folio ${folio}`,
        description: `${String(req.paquete || '').toUpperCase()} · ${req.zona || 'sin zona'} · ${req.num_personas || 1} persona(s) · incluye comisión de Mercado Pago`,
        quantity: 1,
        currency_id: 'MXN',
        unit_price: t.total_pesos,            // ⚠️ EN PESOS
      }],
      external_reference: referenciaDe(folio),
      payer: req.correo ? { email: String(req.correo), name: req.nombre || undefined } : undefined,
      back_urls: {
        success: `${SITE()}/?pago=ok&folio=${encodeURIComponent(folio)}`,
        failure: `${SITE()}/?pago=error&folio=${encodeURIComponent(folio)}`,
        pending: `${SITE()}/?pago=pendiente&folio=${encodeURIComponent(folio)}`,
      },
      notification_url: `${SITE()}/.netlify/functions/mp-webhook`,
      statement_descriptor: 'CONECTA REYNOSA',
      // El link deja elegir el método EN MP (tarjeta, OXXO, SPEI): no se excluye
      // ninguno a propósito — es justo lo que el cliente pidió al elegir «link».
      // Y binary_mode en false: OXXO nace `pending` y se aprueba al pagar en
      // tienda; con binary_mode true ese camino muere antes de empezar.
      binary_mode: false,
      payment_methods: { installments: 1 },
    };

    const r = await mp.apiPost('/checkout/preferences', pref, {
      idempotencia: `req_${folio}_${t.total_pesos}`,
      fetchImpl: _fetch,
    });
    if (!r.ok) {
      console.error('[mp-link] MP rechazó la preferencia', folio, r.status, r.error);
      return { ok: false, motivo: 'Mercado Pago rechazó la preferencia: ' + (r.error || r.status) };
    }
    const p = r.json || {};
    const url = mp.modo() === 'live' ? p.init_point : (p.sandbox_init_point || p.init_point);
    if (!url) return { ok: false, motivo: 'Mercado Pago no devolvió una URL' };

    // Se guarda en la fila. Un fallo aquí NO tumba nada: el link existe y se
    // devuelve igual; la bandeja puede regenerarlo con `mp_link`.
    if (SB_URL && sbH && req.id) {
      try {
        const up = await _fetch(`${SB_URL}/rest/v1/requisiciones?id=eq.${encodeURIComponent(req.id)}`, {
          method: 'PATCH',
          headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ mp_preference_id: p.id || null, mp_init_point: url, mp_monto_cobrar: t.total_pesos }),
        });
        if (!up.ok) console.error('[mp-link] no se guardó el link en la requisición', folio, up.status);
      } catch (e) { console.error('[mp-link] PATCH falló', folio, e.message); }
    }
    return { ok: true, url, preference_id: p.id || null, total_pesos: t.total_pesos, comision_pesos: t.comision_pesos, neto_pesos: t.neto_pesos };
  } catch (e) {
    console.error('[mp-link] excepción', e && e.message);
    return { ok: false, motivo: e && e.message };
  }
}

module.exports = { PREFIJO_REQ, disponible, referenciaDe, folioDeReferencia, crearLinkRequisicion };
