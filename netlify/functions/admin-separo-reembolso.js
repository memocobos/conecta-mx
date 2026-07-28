// =============================================================================
// admin-separo-reembolso — devolver el separo cuando Memo rechaza (C2-3)
//
// SOLO MAESTRO_ROSHI. Devolver dinero es la operación más delicada del sistema
// y no se delega.
//
// TRAS INTERRUPTOR: REEMBOLSOS_MODO='off' por defecto → 404. El mecanismo está
// construido y probado, pero el CORREO al cliente lleva plantilla PROVISIONAL
// (marcada abajo) hasta que Memo escriba el copy final. Encender sin ese copy
// sería mandarle a un cliente un texto que nadie aprobó, explicándole por qué
// le devolvemos su dinero — justo el correo que más cuidado merece.
//
// CANDADO ANTI-DOBLE-REEMBOLSO, read-then-write:
//   separo_reembolsado_at null → se puede reembolsar. Lleno → 200 ya_reembolsado.
//   (Esa columna la agrega la migración de C2-3; si no existe, el PATCH falla y
//    el reembolso NO se marca — se reporta y se revisa a mano, nunca se repite
//    a ciegas.)
//
// El reembolso es del TOTAL cobrado (base + cargo de servicio): el cliente pagó
// ese total y se le devuelve completo. El cargo de Stripe no se le castiga a él.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');
const stripe = require('./_lib/stripe');

function encendido() {
  return String(process.env.REEMBOLSOS_MODO || 'off').toLowerCase() === 'on';
}

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  // Interruptor propio, ADEMÁS del de Stripe: los dos tienen que estar vivos.
  if (!encendido()) return { statusCode: 404, headers, body: JSON.stringify({ error: 'No disponible' }) };
  if (!stripe.encendido()) return { statusCode: 404, headers, body: JSON.stringify({ error: 'No disponible' }) };
  const coh = stripe.llaveCoherente();
  if (!coh.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: coh.error }) };

  // SOLO ROSHI.
  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const SB_URL = process.env.PORTAL_SUPABASE_URL;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_SERVICE) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars del Portal' }) };
  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }
  const solicitudId = body.solicitud_id;
  const motivo = String(body.motivo || '').trim().slice(0, 300);
  if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'solicitud_id inválido' }) };
  }

  // 1. LEER ANTES DE ESCRIBIR.
  let sol;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}` +
      `&select=id,estado,evento_nombre,separo_pagado_at,separo_session_id,separo_aplicado_pago_id,separo_reembolsado_at,clientes(correo,nombre_completo)`, { headers: sb });
    if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer la solicitud' }) };
    const arr = await r.json();
    sol = Array.isArray(arr) ? arr[0] : null;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer la solicitud' }) };
  }
  if (!sol) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
  if (!sol.separo_pagado_at) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'Esta solicitud no tiene separo pagado: rechaza normal' }) };
  }
  if (sol.separo_reembolsado_at) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ya_reembolsado: true }) };
  }
  // Si el separo YA se aplicó a una cuota, esto no es un rechazo: es una
  // cancelación de un tour aceptado, que sigue otro camino (y otra política).
  if (sol.separo_aplicado_pago_id) {
    return { statusCode: 409, headers, body: JSON.stringify({
      error: 'Este separo ya se aplicó a una cuota: esto ya no es un rechazo, es una cancelación' }) };
  }

  // 2. La sesión y su payment_intent (lo que Stripe necesita para devolver).
  let ses = null;
  try {
    const q = sol.separo_session_id
      ? `session_id=eq.${encodeURIComponent(sol.separo_session_id)}`
      : `solicitud_id=eq.${encodeURIComponent(solicitudId)}&tipo=eq.separo`;
    const r = await fetch(`${SB_URL}/rest/v1/stripe_checkout_sesiones?${q}&select=session_id,payment_intent_id,monto_total_cent&limit=1`, { headers: sb });
    if (r.ok) { const arr = await r.json(); ses = Array.isArray(arr) ? arr[0] : null; }
  } catch (e) { /* abajo se decide */ }
  if (!ses || !ses.payment_intent_id) {
    return { statusCode: 409, headers, body: JSON.stringify({
      error: 'No encontré el cobro en Stripe para devolverlo. Revísalo en el panel de Stripe antes de rechazar.' }) };
  }

  // 3. EL REEMBOLSO. Idempotency-Key por solicitud: un reintento de red no
  // devuelve dos veces.
  const rf = await stripe.apiPost('refunds', {
    payment_intent: ses.payment_intent_id,
    reason: 'requested_by_customer',
    metadata: { solicitud_id: String(solicitudId), motivo: motivo || 'rechazo de solicitud' },
  }, `refund_separo_${solicitudId}`);
  if (!rf.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'Stripe rechazó el reembolso: ' + rf.error }) };

  // 4. Sellar el candado. Si esto falla, el reembolso YA se hizo: se reporta
  // fuerte para que no se repita a ciegas.
  let sellado = true;
  try {
    const pr = await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}`, {
      method: 'PATCH', headers: { ...sb, Prefer: 'return=minimal' },
      body: JSON.stringify({ separo_reembolsado_at: new Date().toISOString() }),
    });
    if (!pr.ok) sellado = false;
  } catch (e) { sellado = false; }

  // 5. Correo al cliente. ⚠️ PLANTILLA PROVISIONAL — el copy final lo escribe
  // Memo. Pasa por correo-guard, así que con CORREOS_MODO='prueba' cae al buzón
  // de calibración. El interruptor de esta function está apagado justamente
  // para que este texto no salga a un cliente antes de que Memo lo apruebe.
  let correoOk = false;
  try {
    const cli = Array.isArray(sol.clientes) ? sol.clientes[0] : sol.clientes;
    const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
    if (KEY && cli && cli.correo) {
      const nombre = String(cli.nombre_completo || 'cliente').trim().split(/\s+/)[0] || 'cliente';
      let to = cli.correo;
      let subject = '[PROVISIONAL] Sobre tu apartado de ' + (sol.evento_nombre || 'tu viaje');
      ({ to, subject } = aplicarModoPrueba({ to, subject }));
      const r5 = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_COBRANZA || 'Conecta Reynosa <admin@conectareynosa.mx>',
          to, subject,
          html: `<p>Hola ${nombre},</p><p><strong>[TEXTO PROVISIONAL — pendiente de aprobación]</strong></p>
<p>No pudimos confirmar tu apartado para <strong>${sol.evento_nombre || 'tu viaje'}</strong> y ya te devolvimos tu dinero.
El reembolso puede tardar unos días en reflejarse según tu banco.</p>
<p>Si tienes dudas, escríbenos por WhatsApp y te ayudamos.</p><p>— Equipo Conecta Reynosa</p>`,
        }),
      }).catch(() => null);
      correoOk = !!(r5 && r5.ok);
    }
  } catch (e) { /* fail-soft: el dinero ya se devolvió */ }

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      ok: true, reembolsado: true, refund_id: rf.data && rf.data.id,
      monto_cent: ses.monto_total_cent, correo: correoOk, sellado,
      aviso: sellado ? undefined : '⚠️ El reembolso SE HIZO pero no se pudo marcar en la base. NO lo repitas: revísalo a mano.',
      admin: { id: auth.user.id, correo: auth.user.correo },
    }),
  };
};
