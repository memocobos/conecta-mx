// =============================================================================
// stripe-webhook — confirma el pago y marca la cuota (Fase C · ST-1)
//
// Orden innegociable:
//   1. Interruptor. Apagado → 404, sin leer nada.
//   2. FIRMA verificada contra el cuerpo CRUDO. Inválida → 400 y CERO efectos.
//   3. IDEMPOTENCIA por event_id: se LEE antes de escribir. Nada de on_conflict.
//      Si aun así hay carrera, el 23505 del índice único CONFIRMA idempotencia.
//   4. Marcar la cuota por la MAQUINARIA AUDITADA (_lib/marcar-pago), con actor
//      'stripe:evt_...'. Reconciliación, bitácora y correo salen de ahí — una
//      sola ruta al dinero.
//
// Un webhook repetido o tardío jamás duplica: la fila de idempotencia se
// escribe ANTES de tocar el dinero.
//
// Env: PAGOS_STRIPE_MODO, STRIPE_WEBHOOK_SECRET, PORTAL_SUPABASE_URL/SERVICE.
// =============================================================================

const stripe = require('./_lib/stripe');
const tarifas = require('./_lib/stripe-tarifas');
const { aplicarNucleo } = require('./_lib/marcar-pago');

// Los que confirman dinero. checkout.session.completed cubre tarjeta/MSI;
// OXXO paga después, y ahí el que confirma es el async_payment_succeeded.
const TIPOS_QUE_PAGAN = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!stripe.encendido()) return { statusCode: 404, headers, body: JSON.stringify({ error: 'No disponible' }) };

  // El cuerpo CRUDO, tal cual llegó: si Netlify lo entregó en base64 hay que
  // decodificarlo ANTES de firmar, o el HMAC no coincide nunca.
  const crudo = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');

  const cabecera = event.headers['stripe-signature'] || event.headers['Stripe-Signature'] || '';
  const firma = stripe.verificarFirma(crudo, cabecera);
  if (!firma.ok) {
    // 400 y NADA más: ni se parsea el cuerpo, ni se registra el evento, ni se
    // toca el dinero. Un cuerpo sin firma válida no es de Stripe.
    return { statusCode: 400, headers, body: JSON.stringify({ error: firma.error }) };
  }

  let evt;
  try { evt = JSON.parse(crudo); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cuerpo no es JSON' }) }; }

  const eventId = evt && evt.id;
  const tipo = evt && evt.type;
  if (!eventId || !tipo) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Evento sin id o type' }) };

  const SB_URL = process.env.PORTAL_SUPABASE_URL;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_SERVICE) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars del Portal' }) };
  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' };

  // ── 3. IDEMPOTENCIA: leer ANTES de escribir ────────────────────────────────
  try {
    const yaR = await fetch(`${SB_URL}/rest/v1/stripe_webhook_eventos?event_id=eq.${encodeURIComponent(eventId)}&select=id,resultado`, { headers: sb });
    if (yaR.ok) {
      const ya = await yaR.json();
      if (Array.isArray(ya) && ya.length) {
        // Ya lo procesamos. 200 para que Stripe deje de reintentar.
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, duplicado: true, event_id: eventId }) };
      }
    }
  } catch (e) {
    console.error('[stripe-webhook] no pude consultar idempotencia:', e.message);
  }

  // ── EL EVENTO PUEDE LLEGAR FLACO ───────────────────────────────────────────
  // El flujo nuevo de Stripe ("destinos de evento") puede mandar solo un resumen
  // —id del objeto y ya— en vez del objeto completo. Si el que llegó no trae lo
  // que necesitamos (payment_status y metadata), se va por él a la API con la
  // misma llave. Lectura pura: no crea ni cobra.
  //
  // Se distingue por AUSENCIA, no por el nombre del estilo: mañana Stripe puede
  // llamarle de otra forma, pero un objeto sin payment_status seguirá siendo
  // insuficiente. `estiloCarga` queda en la bitácora para saber cuál llegó.
  let sesion = (evt.data && evt.data.object) || {};
  let estiloCarga = 'completo';
  const necesitaGordo = TIPOS_QUE_PAGAN.includes(tipo)
    && (!sesion.payment_status || !sesion.metadata || !sesion.metadata.pago_id);
  if (necesitaGordo) {
    // El id puede venir en data.object.id o, en el estilo resumido, en
    // related_object.id. Cualquiera de los dos sirve para pedir el objeto.
    const idObj = sesion.id
      || (evt.related_object && evt.related_object.id)
      || (evt.data && evt.data.related_object && evt.data.related_object.id);
    if (idObj && /^cs_/.test(String(idObj))) {
      const g = await stripe.apiGet('checkout/sessions/' + encodeURIComponent(idObj));
      if (g.ok && g.data) { sesion = g.data; estiloCarga = 'resumido→consultado'; }
      else { estiloCarga = 'resumido→NO se pudo consultar'; }
    } else {
      estiloCarga = 'resumido→sin id de sesión';
    }
  }

  const meta = sesion.metadata || {};
  const pagoId = meta.pago_id || null;
  const metodo = String(meta.metodo || '').toLowerCase();
  const pagaDinero = TIPOS_QUE_PAGAN.includes(tipo) && sesion.payment_status === 'paid';

  // Se registra el evento ANTES de tocar el dinero. Si el marcado truena a la
  // mitad, el reintento de Stripe encuentra la fila y NO vuelve a cobrar —
  // preferimos un pago sin marcar (que se ve en la bitácora y se marca a mano)
  // antes que una cuota marcada dos veces.
  const registrar = async (resultado, detalle) => {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/stripe_webhook_eventos`, {
        method: 'POST', headers: { ...sb, Prefer: 'return=minimal' },
        body: JSON.stringify({
          event_id: eventId, tipo, session_id: sesion.id || null,
          pago_id: pagoId, solicitud_id: (sesion.metadata && sesion.metadata.solicitud_id) || null, resultado,
          detalle: [detalle, 'carga=' + estiloCarga].filter(Boolean).join(' · '),
        }),
      });
      // 23505 = otro proceso ganó la carrera. Eso NO es un error: es la
      // idempotencia confirmada por el índice único.
      if (!r.ok) {
        const txt = await r.text();
        if (/23505|duplicate key/i.test(txt)) return { duplicado: true };
        console.error('[stripe-webhook] no se registró el evento:', txt);
      }
    } catch (e) {
      console.error('[stripe-webhook] registro falló:', e.message);
    }
    return { duplicado: false };
  };

  if (!pagaDinero) {
    await registrar('ignorado', `tipo=${tipo} payment_status=${sesion.payment_status || '-'}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ignorado: true, tipo }) };
  }
  // ── [C2-2] ¿SEPARO o CUOTA? ────────────────────────────────────────────────
  // Un separo pre-aceptación no tiene cuota: se anota en la SOLICITUD y queda
  // "en espera de aplicarse". Quien lo aplica a la cuota 1 es la aceptación de
  // Memo (C2-3), por la vía auditada — aquí NO se toca ningún plan de pagos,
  // porque todavía no existe.
  const solicitudId = meta.solicitud_id || null;
  const esSeparo = String(meta.tipo || '').toLowerCase() === 'separo'
    || (!pagoId && !!solicitudId);
  if (esSeparo) {
    if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) {
      await registrar('error', 'separo sin solicitud_id válido en metadata');
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sin_solicitud_id: true }) };
    }
    const marcaS = await registrar('aplicado', 'separo');
    if (marcaS.duplicado) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, duplicado: true, event_id: eventId }) };
    }
    // READ-THEN-WRITE: si ya tiene separo_pagado_at, otro evento ganó. No se
    // pisa la marca original — la primera confirmación es la buena.
    try {
      const yaR = await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}&select=id,separo_pagado_at`, { headers: sb });
      const ya = yaR.ok ? await yaR.json() : [];
      if (Array.isArray(ya) && ya[0] && ya[0].separo_pagado_at) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, separo_ya_marcado: true }) };
      }
      await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}`, {
        method: 'PATCH', headers: { ...sb, Prefer: 'return=minimal' },
        body: JSON.stringify({
          separo_pagado_at: new Date().toISOString(),
          separo_session_id: sesion.id || null,
          // separo_aplicado_pago_id se queda NULL a propósito: el separo está
          // pagado pero AÚN NO aplicado. Ese null es el candado que impide que
          // se aplique dos veces cuando Memo acepte.
        }),
      });
    } catch (e) {
      console.error('[stripe-webhook] no se pudo marcar el separo:', e.message);
    }
    // La sesión se cierra igual que en el flujo de cuotas.
    try {
      if (sesion.id) {
        await fetch(`${SB_URL}/rest/v1/stripe_checkout_sesiones?session_id=eq.${encodeURIComponent(sesion.id)}`, {
          method: 'PATCH', headers: { ...sb, Prefer: 'return=minimal' },
          body: JSON.stringify({ estado: 'pagada', payment_intent_id: sesion.payment_intent || null, cerrada_en: new Date().toISOString() }),
        });
      }
    } catch (e) { /* cosmético */ }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, event_id: eventId, separo: true, solicitud_id: solicitudId, carga: estiloCarga }) };
  }

  if (!pagoId || !/^[0-9a-f-]{36}$/i.test(pagoId)) {
    await registrar('error', 'evento de pago sin pago_id válido en metadata');
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sin_pago_id: true }) };
  }

  const marca = await registrar('aplicado', null);
  if (marca.duplicado) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, duplicado: true, event_id: eventId }) };
  }

  // ── 4. LA MAQUINARIA AUDITADA ──────────────────────────────────────────────
  // El monto que se registra es el de la CUOTA (el cargo por servicio es de
  // Stripe, no dinero del viaje): si se registrara el total, la reconciliación
  // creería que el cliente pagó de más y el reporte de caja mentiría.
  const env = { PORTAL_SB_URL: SB_URL, PORTAL_SB_SERVICE: SB_SERVICE };
  const hoyMx = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  let montoCuota = null;
  try {
    const pR = await fetch(`${SB_URL}/rest/v1/pagos?id=eq.${encodeURIComponent(pagoId)}&select=monto,estado`, { headers: sb });
    if (pR.ok) {
      const arr = await pR.json();
      const p = Array.isArray(arr) ? arr[0] : null;
      if (p && p.estado === 'pagado') {
        // Alguien ya la marcó (a mano, o un evento hermano). No se re-marca.
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ya_pagada: true }) };
      }
      if (p) montoCuota = p.monto;
    }
  } catch (e) {
    console.error('[stripe-webhook] no pude leer la cuota:', e.message);
  }

  const patch = {
    estado: 'pagado',
    fecha_pagada: hoyMx,
    metodo: tarifas.METODO_BD[metodo] || 'stripe_credito',
    cuenta: 'BBVA',                       // el payout de Stripe cae en la CLABE BBVA
    referencia: sesion.payment_intent || sesion.id || eventId,
    registrado_por: 'stripe',
  };
  if (montoCuota != null) patch.monto_pagado = montoCuota;

  const r = await aplicarNucleo({
    env, headers, pagoId, accion: 'pagar', patch,
    actorEtiqueta: 'stripe:' + eventId,
  });

  // Se cierra la sesión de checkout (cosmético para el tablero).
  try {
    if (sesion.id) {
      await fetch(`${SB_URL}/rest/v1/stripe_checkout_sesiones?session_id=eq.${encodeURIComponent(sesion.id)}`, {
        method: 'PATCH', headers: { ...sb, Prefer: 'return=minimal' },
        body: JSON.stringify({ estado: 'pagada', payment_intent_id: sesion.payment_intent || null, cerrada_en: new Date().toISOString() }),
      });
    }
  } catch (e) { /* cosmético */ }

  // A Stripe SIEMPRE 200 cuando la firma era buena y el evento quedó
  // registrado: un 5xx lo haría reintentar sobre algo ya asentado.
  return {
    statusCode: 200, headers,
    body: JSON.stringify({ ok: true, event_id: eventId, marcado: r.statusCode === 200, detalle_status: r.statusCode, carga: estiloCarga }),
  };
};
