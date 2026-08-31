// =============================================================================
// admin-separo-aplicar — el SELLO: aplica el separo ya pagado a la cuota 1
// (Fase C2 · C2-3)
//
// Cuando Memo acepta una solicitud cuyo separo YA se pagó por Stripe, esta
// function marca la cuota 1 como pagada por la MISMA vía auditada que usa el
// Palacio (_lib/marcar-pago): update + bitácora pagos_auditoria + reconciliación
// + correo. Una sola ruta al dinero, con actor '<metodo>:<referencia del cobro>'
// — decía 'stripe:evt_...' y ya no es cierto: hoy quien cobra es Mercado Pago.
//
// EL CANDADO DE LA DOBLE APLICACIÓN es `separo_aplicado_pago_id`:
//   · null  → el separo está pagado pero NO aplicado. Se puede aplicar.
//   · lleno → ya se aplicó a esa cuota. Se responde 200 con ya_aplicado, NO 409:
//             aceptar dos veces no es un error del usuario, es un doble click.
// READ-THEN-WRITE, sin on_conflict, como manda la casa.
//
// El separo que se aplica es el que se COBRÓ (monto_base_cent de la sesión, sin
// el cargo por servicio): el cargo es de Stripe, no dinero del viaje. Si se
// registrara el total, la reconciliación creería que el cliente pagó de más.
//
// Roles: maestro_roshi / bulma / milk (los mismos que ya marcan pagos).
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { aplicarNucleo } = require('./_lib/marcar-pago');

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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma', 'milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const SB_URL = process.env.PORTAL_SUPABASE_URL;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_SERVICE) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars del Portal' }) };
  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }
  const solicitudId = body.solicitud_id;
  if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'solicitud_id inválido' }) };
  }

  // 1. LEER ANTES DE ESCRIBIR.
  let sol;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}` +
      `&select=id,estado,separo_pagado_at,separo_session_id,separo_aplicado_pago_id,metodo_separo,separo_mp_payment_id`, { headers: sb });
    if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer la solicitud' }) };
    const arr = await r.json();
    sol = Array.isArray(arr) ? arr[0] : null;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer la solicitud' }) };
  }
  if (!sol) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };

  if (!sol.separo_pagado_at) {
    // No hay nada que aplicar: esta solicitud no pagó por Stripe. NO es error —
    // es el camino normal de una solicitud con comprobante o sin pago.
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sin_separo: true }) };
  }
  // EL CANDADO. 200, no 409: aceptar dos veces es un doble click, no un error.
  if (sol.separo_aplicado_pago_id) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ya_aplicado: true, pago_id: sol.separo_aplicado_pago_id }) };
  }

  // [SEP-ETIQUETA-1a] Aquí se consultaba `stripe_checkout_sesiones` para sacar el
  // MONTO BASE —lo que entró al viaje, sin el cargo de servicio de la
  // procesadora—. Esa tabla tiene CERO filas (medido): la consulta devolvía null
  // siempre y el monto caía al de la cuota. Se retira con la vía de Stripe.
  //
  // ⚠️ Y el respaldo NO es un apaño, es la respuesta correcta: el monto de la
  // cuota 1 ES el dinero del viaje. Mercado Pago le suma su cargo al cliente
  // encima (`_lib/mp-tarifas`), y ese cargo no debe entrar al plan — que es
  // exactamente lo que buscaba la lógica del monto base.
  //
  // MP no persiste su `base_pesos` en ningún lado: se calcula al crear el cobro
  // y viaja al cliente, pero no se guarda. Si algún día hace falta el desglose,
  // es columna nueva y por tanto SQL de Jane.

  // 3. La cuota 1 del plan (que la aceptación acaba de generar).
  let cuota;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/pagos?solicitud_id=eq.${encodeURIComponent(solicitudId)}` +
      `&numero_pago=eq.1&estado=eq.pendiente&select=id,monto,estado,updated_at&order=id&limit=1`, { headers: sb });
    if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer el plan' }) };
    const arr = await r.json();
    cuota = Array.isArray(arr) ? arr[0] : null;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer el plan' }) };
  }
  if (!cuota) {
    // Sin cuota 1 pendiente no hay dónde aplicarlo. Se responde 409 para que el
    // Palacio lo muestre: es un caso que Memo tiene que ver, no tragarse.
    return { statusCode: 409, headers, body: JSON.stringify({
      error: 'El separo está pagado pero no encontré una cuota 1 pendiente donde aplicarlo' }) };
  }

  // 4. LA VÍA AUDITADA. El monto es el BASE (lo que entró al viaje), no el total.
  const montoPesos = Number(cuota.monto);
  const hoyMx = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  // [SEP-ETIQUETA-1a] LA ETIQUETA SALE DE LA SOLICITUD, no de una suposición.
  // Esta línea preguntaba a `stripe_checkout_sesiones` —que está VACÍA— y el
  // ternario caía SIEMPRE del lado `stripe_credito`: un separo cobrado por
  // Mercado Pago se guardaba etiquetado como Stripe, y de ahí se copiaba solo a
  // `pagos_auditoria`. El dinero estaba bien; la etiqueta no.
  //
  // `metodo_separo` lo escribe `mp-webhook` al confirmar el cobro, y es la única
  // fuente que sabe de verdad por dónde entró el dinero. Se hereda ese nombre.
  //
  // ⚠️ Y si no lo sabe, NO SE INVENTA: `null`. El campo queda vacío, se ve en el
  // renglón del plan y alguien pregunta. Una etiqueta inventada nadie la
  // pregunta, porque parece un dato.
  const metodoBd = sol.metodo_separo === 'mercadopago' ? 'mercadopago' : null;

  const r = await aplicarNucleo({
    env: { PORTAL_SB_URL: SB_URL, PORTAL_SB_SERVICE: SB_SERVICE },
    headers, pagoId: cuota.id, accion: 'pagar',
    patch: {
      estado: 'pagado', fecha_pagada: hoyMx, metodo: metodoBd, cuenta: 'BBVA',
      // [SEP-ETIQUETA-1a] La referencia y el actor tampoco pueden decir «stripe»
      // cuando el cobro fue de Mercado Pago. `separo_mp_payment_id` es el rastro
      // que deja el webhook de MP; el `separo_session_id` se queda como respaldo
      // para las filas viejas, y si no hay ninguno se dice `separo` a secas en
      // vez de nombrar una procesadora que no cobró.
      referencia: sol.separo_mp_payment_id || sol.separo_session_id || 'separo',
      registrado_por: metodoBd || 'separo', monto_pagado: montoPesos,
    },
    actorEtiqueta: (metodoBd || 'separo') + ':' + (sol.separo_mp_payment_id || sol.separo_session_id || solicitudId),
    // [CONC-2] La versión es la que acaba de traer la lectura de arriba: aquí no
    // hay pantalla abierta, la ventana es de milisegundos — pero es justo la
    // ventana en la que el admin puede estar marcando esa misma cuota a mano.
    version: cuota.updated_at,
  });
  if (r.statusCode !== 200) return r;   // el núcleo ya trae su propio mensaje

  // 5. SELLAR el candado. Va DESPUÉS de aplicar: si el marcado falla, el separo
  // sigue sin aplicar y se puede reintentar. Al revés se perdería el pago.
  // [CONC-3] El sello también lleva su condición: solo sella si SIGUE sin sellar.
  // El candado de arriba lo decide en JS sobre una lectura de hace tres llamadas
  // de red, y dos admins con la ficha abierta lo cruzan sin esfuerzo. Cero filas
  // aquí significa que otro selló primero — y NO se responde error: el pago de
  // este ya aterrizó bien, y desde CONC-2 el segundo ni siquiera pudo aplicarlo
  // dos veces (su cuota 1 ya no está 'pendiente'). Solo queda dicho en el log.
  try {
    const selloR = await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}`
      + `&separo_aplicado_pago_id=is.null`, {
      method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' },
      body: JSON.stringify({ separo_aplicado_pago_id: cuota.id }),
    });
    const filas = selloR.ok ? await selloR.json().catch(() => null) : null;
    if (selloR.ok && (!Array.isArray(filas) || filas.length === 0)) {
      console.error('[separo-aplicar] otro admin selló primero:', solicitudId, cuota.id);
    }
  } catch (e) {
    console.error('[separo-aplicar] no se pudo sellar el candado:', e.message);
  }

  return {
    statusCode: 200, headers,
    body: JSON.stringify({ ok: true, aplicado: true, pago_id: cuota.id, monto_aplicado: montoPesos,
      metodo: metodoBd, admin: { id: auth.user.id, correo: auth.user.correo } }),
  };
};
