// =============================================================================
// mp-webhook — confirma el pago de Mercado Pago y marca el separo (MP-1c)
//
// ORDEN INNEGOCIABLE, el mismo de C2 porque no tiene nada de proveedor:
//
//   1. Interruptor. Apagado → 404, sin leer nada.
//   2. FIRMA verificada contra el manifest. Inválida → 400 y CERO efectos.
//   3. EL MONTO Y EL ESTADO, del GET /v1/payments/{id}. JAMÁS del cuerpo.
//   4. IDEMPOTENCIA: se LEE antes de escribir. Nada de on_conflict. Si aun así
//      hay carrera, el 23505 del índice único CONFIRMA idempotencia — y se
//      confirma que vino de ESE índice, no de otra restricción cualquiera.
//   5. Marcar por la MISMA vía que C2, con rastro `mp:<payment_id>`.
//
// ── (3) LA DIFERENCIA QUE MÁS CUIDADO PIDE ──────────────────────────────────
// El evento de Stripe TRAE el objeto con su importe. La notificación de MP trae
// SOLO un id. Quien lea el monto del cuerpo está escribiendo dinero a partir de
// algo que cualquiera puede inventar: basta un POST con un JSON armado a mano.
// Aquí el cuerpo sirve para UNA cosa —saber qué id consultar— y nada más.
// El importe, el estado y el external_reference salen del GET autenticado.
//
// Y el `external_reference` se CAREA: si el pago dice apuntar a otra solicitud
// que la que tenemos, no se escribe nada y se grita. Un pago real de otro
// comercio no puede marcar un separo nuestro.
//
// ── (4) POR QUÉ LA LLAVE ES payment_id ──────────────────────────────────────
// MP manda VARIAS notificaciones por el MISMO pago según cambia de estado, cada
// una con `id` distinto. Con la llave en ese id, cada notificación se vería como
// nueva y el separo se marcaría más de una vez. El pago es uno: `payment_id` es
// lo único estable.
//
// ⚠️ LA FIRMA NO ESTÁ CERRADA HASTA EL PAGO REAL DE $1 (28-ago). El manifest
//    `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` se careó contra TRES
//    fuentes coincidentes —la primera que consulté daba otro formato— pero la
//    única autoridad es MP mandando una notificación de verdad, y hay reportes
//    de firmas que validan en prueba y fallan en producción. Si resulta ser
//    otro, se corrige en _lib/mercadopago y NADA de este archivo se mueve: por
//    eso el contrato vive allá y aquí solo se usa.
//
// Env: PAGOS_MP_MODO, MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET,
//      PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

const mp = require('./_lib/mercadopago');

// El nombre del índice único de mp_webhook_eventos. Se comprueba por NOMBRE:
// un 23505 de OTRA restricción es un error de verdad y no puede confundirse con
// la idempotencia (el webhook de Stripe mira cualquier "duplicate key" — aquí
// se afina, porque tragarse un error ajeno como si fuera una carrera resuelta
// significaría responder 200 a algo que nunca se guardó).
const INDICE_IDEMPOTENCIA = 'mp_webhook_evento_uq';

const headers = { 'Content-Type': 'application/json' };
const res = (code, body) => ({ statusCode: code, headers, body: JSON.stringify(body) });

exports.handler = async (event) => {
  // ── 1. INTERRUPTOR ─────────────────────────────────────────────────────────
  // 404 y no 403: con el cobro apagado este endpoint no existe para nadie.
  if (!mp.encendido()) return res(404, { error: 'No disponible' });
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });

  // ── 2. LA FIRMA, sobre el cuerpo tal cual llegó ────────────────────────────
  // Netlify puede entregar el cuerpo en base64; hay que decodificarlo ANTES,
  // aunque MP firme un manifest y no el cuerpo: el `data.id` que entra al
  // manifest se toma del querystring, pero el cuerpo se parsea igual y una
  // decodificación tardía deja basura en el rastro.
  const crudo = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');

  const h = event.headers || {};
  const qs = event.queryStringParameters || {};
  // `data.id` sale del QUERYSTRING, que es lo que MP firma. El cuerpo trae el
  // mismo id, pero usar el del cuerpo permitiría firmar una cosa y mandar otra.
  const dataId = qs['data.id'] || qs['data_id'] || qs.id || null;

  const firma = mp.verificarFirma({
    xSignature: h['x-signature'] || h['X-Signature'] || '',
    xRequestId: h['x-request-id'] || h['X-Request-Id'] || '',
    dataId,
  });
  if (!firma.ok) {
    // 400 y NADA más: ni se parsea, ni se registra, ni se toca el dinero.
    // Un cuerpo sin firma válida no es de Mercado Pago.
    console.error('[mp-webhook] firma rechazada:', firma.error);
    return res(400, { error: firma.error });
  }

  let notif = {};
  try { notif = crudo ? JSON.parse(crudo) : {}; } catch { /* el rastro puede ir vacío */ }
  const tipo = notif.type || notif.topic || null;
  const accion = notif.action || null;
  const notifId = notif.id != null ? String(notif.id) : null;

  // Solo las notificaciones de pago tocan dinero. Las demás se responden 200
  // para que MP no reintente, sin registrar nada: no son nuestras.
  if (tipo && String(tipo).toLowerCase() !== 'payment') {
    return res(200, { ok: true, ignorado: true, tipo });
  }
  if (!dataId) return res(400, { error: 'Falta data.id' });

  const SB_URL = process.env.PORTAL_SUPABASE_URL;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_SERVICE) return res(500, { error: 'Faltan env vars del Portal' });
  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' };

  // ── 3. LA VERDAD DEL DINERO ────────────────────────────────────────────────
  // Si el GET falla se responde 500 SIN escribir nada, para que MP reintente.
  // Un 200 aquí sería perder el pago en silencio.
  const pago = await mp.obtenerPago(dataId);
  if (!pago.ok) {
    console.error('[mp-webhook] no se pudo leer el pago', dataId, pago.error);
    return res(500, { error: 'No se pudo consultar el pago en Mercado Pago' });
  }
  const paymentId = String(pago.id);
  const solicitudId = pago.referencia || null;   // external_reference, del GET

  // ── 4. IDEMPOTENCIA: leer ANTES de escribir ────────────────────────────────
  try {
    const yaR = await fetch(`${SB_URL}/rest/v1/mp_webhook_eventos?payment_id=eq.${encodeURIComponent(paymentId)}&select=id,resultado`, { headers: sb });
    if (yaR.ok) {
      const ya = await yaR.json();
      if (Array.isArray(ya) && ya.length) {
        return res(200, { ok: true, duplicado: true, payment_id: paymentId });
      }
    }
  } catch (e) {
    console.error('[mp-webhook] no pude consultar idempotencia:', e.message);
  }

  // El registro va ANTES de tocar el dinero. Si el marcado truena a la mitad, el
  // reintento de MP encuentra la fila y NO vuelve a cobrar: preferimos un pago
  // sin marcar —que se ve en la bitácora y se marca a mano— antes que un separo
  // marcado dos veces.
  const registrar = async (resultado, detalle) => {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/mp_webhook_eventos`, {
        method: 'POST', headers: { ...sb, Prefer: 'return=minimal' },
        body: JSON.stringify({
          payment_id: paymentId, notif_id: notifId, tipo: tipo || 'payment', accion,
          estado_mp: pago.estado, solicitud_id: solicitudId, monto: pago.monto,
          resultado, detalle,
        }),
      });
      if (!r.ok) {
        const txt = await r.text();
        // Un 23505 DE ESTE ÍNDICE es la idempotencia confirmada por la carrera.
        // De cualquier otra restricción es un error de verdad y NO se disfraza:
        // responder 200 a algo que nunca se guardó sería perder el pago.
        if (/23505/.test(txt) && txt.includes(INDICE_IDEMPOTENCIA)) return { duplicado: true };
        console.error('[mp-webhook] no se registró el evento:', txt);
        return { duplicado: false, error: txt };
      }
    } catch (e) {
      console.error('[mp-webhook] registro falló:', e.message);
      return { duplicado: false, error: e.message };
    }
    return { duplicado: false };
  };

  // Solo `approved` es dinero cobrado. Todo lo demás se anota y no se toca nada:
  // un `pending` que mañana se aprueba llegará como otra notificación DEL MISMO
  // pago — y por eso la fila de idempotencia solo se escribe cuando se aplica.
  if (pago.estado !== 'approved') {
    await registrar('ignorado', `estado=${pago.estado} detalle=${pago.detalle || '-'}`);
    return res(200, { ok: true, ignorado: true, estado: pago.estado });
  }

  // El careo del amarre: el pago tiene que apuntar a una solicitud NUESTRA.
  if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    await registrar('error', `external_reference inválido: ${solicitudId || '(vacío)'}`);
    return res(200, { ok: true, sin_solicitud_id: true });
  }

  const marca = await registrar('aplicado', `separo · ${pago.metodo || '-'}`);
  if (marca.duplicado) return res(200, { ok: true, duplicado: true, payment_id: paymentId });
  if (marca.error) {
    // No se pudo dejar el rastro: NO se marca el dinero. Sin bitácora no hay
    // idempotencia, y sin idempotencia marcar es apostar a que no haya reintento.
    return res(500, { error: 'No se pudo registrar el evento; no se marcó el separo' });
  }

  // ── 5. MARCAR EL SEPARO ────────────────────────────────────────────────────
  // READ-THEN-WRITE: si ya tiene separo_pagado_at, otro camino ganó (una
  // transferencia con comprobante, por ejemplo). No se pisa la marca original:
  // la primera confirmación es la buena.
  try {
    const yaR = await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}&select=id,separo_pagado_at`, { headers: sb });
    const ya = yaR.ok ? await yaR.json() : [];
    if (!Array.isArray(ya) || !ya[0]) {
      console.error('[mp-webhook] pago aprobado para una solicitud que no existe:', solicitudId, paymentId);
      return res(200, { ok: true, solicitud_no_encontrada: true });
    }
    if (ya[0].separo_pagado_at) {
      return res(200, { ok: true, separo_ya_marcado: true, payment_id: paymentId });
    }
    await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}`, {
      method: 'PATCH', headers: { ...sb, Prefer: 'return=minimal' },
      body: JSON.stringify({
        separo_pagado_at: new Date().toISOString(),
        separo_mp_payment_id: paymentId,
        metodo_separo: 'mercadopago',
        // separo_aplicado_pago_id se queda NULL A PROPÓSITO: el separo está
        // pagado pero AÚN NO aplicado a una cuota. Ese null es el candado que
        // impide aplicarlo dos veces cuando Memo acepte. Igual que en C2.
      }),
    });
  } catch (e) {
    console.error('[mp-webhook] no se pudo marcar el separo:', e.message, paymentId);
    // 200: el evento YA quedó registrado, así que un reintento de MP no volvería
    // a entrar. Queda en la bitácora como 'aplicado' con el separo sin marcar —
    // visible, y se corrige a mano. Es el modo de falla que elegimos arriba.
    return res(200, { ok: true, registrado_sin_marcar: true, payment_id: paymentId });
  }

  return res(200, {
    ok: true, payment_id: paymentId, solicitud_id: solicitudId,
    monto: pago.monto, estado: pago.estado,
  });
};
