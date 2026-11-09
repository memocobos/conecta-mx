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
// [MP-RIESGO-1 · 9-nov-2026] Mercado Pago rechazó 2 de 3 pagos con tarjeta el
// primer día (cc_rejected_high_risk): su antifraude califica con lo que la
// preferencia le cuenta del comprador y de lo que compra. Mandábamos solo correo
// y un nombre en un solo campo. Hoy viajan nombre y apellido separados, el
// celular (10 dígitos MX), y la categoría del artículo (viajes). No cambia el
// monto ni el flujo: solo le da a MP los datos que su antifraude pide.
function _payerDe(p) {
  if (!p) return undefined;
  const correo = String(p.correo || '').trim();
  if (!correo) return undefined;
  const partes = String(p.nombre || '').trim().split(/\s+/).filter(Boolean);
  const payer = { email: correo };
  if (partes.length) {
    payer.name = partes.length > 2 ? partes.slice(0, partes.length - 2).join(' ') : partes[0];
    const ap = partes.length > 2 ? partes.slice(-2).join(' ') : partes.slice(1).join(' ');
    if (ap) payer.surname = ap;
  }
  const d = String(p.celular || '').replace(/\D/g, '').slice(-10);
  if (d.length === 10) payer.phone = { area_code: '52', number: d };
  return payer;
}

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
        category_id: 'travels',               // [MP-RIESGO-1]
      }],
      external_reference: referenciaDe(folio),
      payer: _payerDe(req),
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

// ═══ [PORTAL-PAGO-2] EL LINK DE UNA CUOTA DESDE EL PORTAL ═══════════════════
// Palabra de Memo (9-nov-2026): «da opción de pagar desde el portal con mercado
// pago». La forma es la MISMA que la requisición, con otro dueño de la fila:
// `cambios_viajero` tipo 'pago' (la bandeja), nacida SIN foto y CON el link.
// external_reference = `cv:<uuid del cambio>` — el webhook lo lee del GET del
// pago y por ese prefijo sabe que es una cuota del Portal (no una requisición
// `req:` ni el uuid pelado del Portal viejo).
// 🔒 El NETO lo decide el servidor (portal-viajero `pago_link`: la cuota que
//    toca, o un monto que el cliente eligió DENTRO de lo que debe); la comisión
//    se le carga al cliente igual que en MP-LINK-1 (calcularLink). Aquí no se
//    escribe dinero: nace un link. El abono lo captura un humano con la marca
//    del webhook enfrente.
const PREFIJO_CV = 'cv:';
const UUID_RE_CV = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function referenciaCambio(cambioId) { return PREFIJO_CV + String(cambioId || '').trim(); }
function cambioDeReferencia(ref) {
  const s = String(ref == null ? '' : ref).trim();
  if (!s.startsWith(PREFIJO_CV)) return null;
  const id = s.slice(PREFIJO_CV.length).trim();
  return UUID_RE_CV.test(id) ? id.toLowerCase() : null;
}

// Crea la preferencia de UNA cuota. `cuota` trae cambio_id (uuid YA elegido —
// el cambio se inserta DESPUÉS con ese id, porque el CHECK de la base exige
// foto o link al nacer), viajero {id, nombre, correo, evento_id}, evento_nombre,
// neto_pesos, etiqueta ('Pago 2 · 24 al 1 de diciembre'). Devuelve
// { ok:true, url, preference_id, total_pesos, comision_pesos, neto_pesos } o
// { ok:false, motivo } — JAMÁS lanza.
async function crearLinkCuota({ cuota, fetchImpl }) {
  const _fetch = fetchImpl || fetch;
  try {
    const d = disponible();
    if (!d.ok) return { ok: false, motivo: d.motivo };
    const cid = String(cuota && cuota.cambio_id || '');
    if (!UUID_RE_CV.test(cid)) return { ok: false, motivo: 'cambio_id inválido' };
    const neto = Math.round(Number(cuota.neto_pesos));
    if (!(neto > 0)) return { ok: false, motivo: 'la cuota no trae monto' };
    const t = tarifas.calcularLink(neto);
    if (t.error) return { ok: false, motivo: t.error };
    const vj = cuota.viajero || {};
    const pref = {
      items: [{
        id: cid,
        title: `${cuota.etiqueta || 'Abono'} · ${cuota.evento_nombre || vj.evento_id || 'tu viaje'}`,
        description: `${vj.nombre || 'Viajero'} · incluye comisión de Mercado Pago`,
        quantity: 1, currency_id: 'MXN', unit_price: t.total_pesos,
        category_id: 'travels',               // [MP-RIESGO-1]
      }],
      external_reference: referenciaCambio(cid),
      payer: _payerDe(vj),
      back_urls: {
        success: `${SITE()}/portal.html?pago=ok`,
        failure: `${SITE()}/portal.html?pago=error`,
        pending: `${SITE()}/portal.html?pago=pendiente`,
      },
      notification_url: `${SITE()}/.netlify/functions/mp-webhook`,
      statement_descriptor: 'CONECTA REYNOSA',
      binary_mode: false,
      payment_methods: { installments: 1 },
    };
    const r = await mp.apiPost('/checkout/preferences', pref, { idempotencia: `cv_${cid}_${t.total_pesos}`, fetchImpl: _fetch });
    if (!r.ok) {
      console.error('[mp-link] MP rechazó la preferencia de cuota', cid, r.status, r.error);
      return { ok: false, motivo: 'Mercado Pago rechazó la preferencia: ' + (r.error || r.status) };
    }
    const p = r.json || {};
    const url = mp.modo() === 'live' ? p.init_point : (p.sandbox_init_point || p.init_point);
    if (!url) return { ok: false, motivo: 'Mercado Pago no devolvió una URL' };
    return { ok: true, url, preference_id: p.id || null, total_pesos: t.total_pesos, comision_pesos: t.comision_pesos, neto_pesos: t.neto_pesos };
  } catch (e) {
    console.error('[mp-link] excepción (cuota)', e && e.message);
    return { ok: false, motivo: e && e.message };
  }
}

module.exports = {
  _payerDe, PREFIJO_REQ, PREFIJO_CV, disponible, referenciaDe, folioDeReferencia, referenciaCambio, cambioDeReferencia, crearLinkRequisicion, crearLinkCuota };
