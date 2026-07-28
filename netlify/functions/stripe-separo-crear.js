// =============================================================================
// stripe-separo-crear — cobra el SEPARO de una solicitud, ANTES de la
// aceptación de Memo (Fase C2 · C2-2)
//
// Es la variante de stripe-checkout-crear para el flujo nuevo: el cliente acaba
// de armar su solicitud, su lugar quedó apartado con reloj, y paga AHÍ MISMO.
// Todavía no hay plan de pagos ni cuotas — por eso la sesión va con
// tipo='separo' y solicitud_id, sin pago_id (destrabado en C2-1).
//
// EL MONTO NO VIENE DEL CLIENTE NI DE LA FILA: sale de resolverPrecioVenta
// (_lib/precio-zona), el mismo candado que ya usa el módulo Vendedores. La fila
// de la solicitud trae `monto_separo`, pero la escribió el navegador del cliente
// y por eso NO se le cree: solo se usa para AVISAR si difiere.
//
// Puertas, todas server-side:
//   1. Interruptor PAGOS_STRIPE_MODO ≠ 'off' → si no, 404.
//   2. JWT del titular → la solicitud es SUYA.
//   3. estado='pendiente' (aún no aceptada) y hold VIGENTE — no se cobra por un
//      apartado que ya venció.
//   4. Paquete NO-CHEAP.
//   5. SIN separo ya pagado (separo_pagado_at null) — candado del doble cobro.
//
// Env: PAGOS_STRIPE_MODO, STRIPE_SECRET_KEY, PORTAL_SUPABASE_URL/ANON/SERVICE.
// =============================================================================

const stripe = require('./_lib/stripe');
const tarifas = require('./_lib/stripe-tarifas');
const { resolverPrecioVenta } = require('./_lib/precio-zona');
const { etiquetaHold, holdMinutos } = require('./_lib/disponibilidad');

// Métodos válidos para un SEPARO. La transferencia no pasa por aquí: ésa sube
// comprobante por el flujo de siempre.
const METODOS_SEPARO = ['oxxo', 'debito', 'credito', 'msi3', 'msi6'];

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!stripe.encendido()) return { statusCode: 404, headers, body: JSON.stringify({ error: 'No disponible' }) };
  const coh = stripe.llaveCoherente();
  if (!coh.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: coh.error }) };

  const SB_URL = process.env.PORTAL_SUPABASE_URL;
  const SB_ANON = process.env.PORTAL_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_ANON || !SB_SERVICE) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars del Portal' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const solicitudId = body.solicitud_id;
  const metodo = String(body.metodo || '').toLowerCase();
  if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'solicitud_id inválido' }) };
  }
  if (!METODOS_SEPARO.includes(metodo)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'metodo inválido (' + METODOS_SEPARO.join('|') + ')' }) };
  }
  if (body.monto != null || body.total != null || body.total_cent != null) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'El total lo calcula el servidor: no mandes montos' }) };
  }

  // JWT del titular.
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Falta Authorization Bearer' }) };
  let authUserId;
  try {
    const uR = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + jwt } });
    if (!uR.ok) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión inválida' }) };
    authUserId = (await uR.json()).id;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo validar la sesión' }) };
  }
  if (!authUserId) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión inválida' }) };

  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' };

  let sol;
  try {
    const q = `${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}` +
      `&select=id,estado,paquete,zona,num_personas,evento_id,evento_nombre,monto_separo,` +
      `hold_expira_at,metodo_separo,separo_pagado_at,comprobante_separo_url,` +
      `tipo_habitacion,lleva_vuelo,clientes(auth_user_id,correo,nombre_completo)`;
    const r = await fetch(q, { headers: sb });
    if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer la solicitud' }) };
    const arr = await r.json();
    sol = Array.isArray(arr) ? arr[0] : null;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer la solicitud' }) };
  }
  if (!sol) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };

  const cli = Array.isArray(sol.clientes) ? sol.clientes[0] : sol.clientes;
  // Ajena → 404, igual que en el checkout de cuotas: a un tercero no se le
  // confirma que ese id exista.
  if (!cli || cli.auth_user_id !== authUserId) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
  }
  if (sol.estado !== 'pendiente') {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'Esta solicitud ya no está en espera (' + sol.estado + ')' }) };
  }
  // CANDADO DEL DOBLE COBRO. Va ANTES del reloj: si ya pagó, el mensaje correcto
  // es "ya pagaste", no "se te venció".
  if (sol.separo_pagado_at) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'Tu apartado ya está pagado', ya_pagado: true }) };
  }
  // EL RELOJ. Se lee con la función de C2-1: nadie muta la fila.
  const et = etiquetaHold(sol, Date.now());
  if (et.etiqueta === 'vencida') {
    return { statusCode: 409, headers, body: JSON.stringify({
      error: 'Se te acabó el tiempo para apartar este lugar. Vuelve a intentarlo y te damos otro rato.', vencido: true }) };
  }
  if (String(sol.paquete || '').toLowerCase() === 'cheap') {
    return { statusCode: 409, headers, body: JSON.stringify({
      error: 'El paquete CHEAP se aparta por transferencia o depósito a Banamex, como siempre' }) };
  }

  // ── EL MONTO, DEL CANDADO DE PRECIO ────────────────────────────────────────
  const pv = await resolverPrecioVenta({
    evento_id: sol.evento_id, paquete: sol.paquete, zona: sol.zona,
    num_personas: sol.num_personas, tipo_habitacion: sol.tipo_habitacion,
  });
  if (!pv || !pv.ok || !(Number(pv.separo) > 0)) {
    // FAIL-LOUD: sin precio autoritativo NO se cobra. Mejor no cobrar que
    // cobrar un monto que no sabemos defender.
    return { statusCode: 409, headers, body: JSON.stringify({
      error: 'No pudimos calcular tu apartado ahora mismo. Escríbenos por WhatsApp y lo resolvemos.',
      detalle: (pv && pv.motivo) || 'precio indeterminado' }) };
  }
  const separoPesos = Number(pv.separo);

  // La fila trae monto_separo escrito por el navegador. NO se le cree; solo se
  // reporta la diferencia para que quede en la bitácora del Palacio.
  const difiere = Number(sol.monto_separo) > 0 && Math.abs(Number(sol.monto_separo) - separoPesos) > 1;

  // [C2-4 remate] CANDADO DEL UMBRAL MSI, también aquí: un separo nunca llega
  // a la mitad del tour, así que los MSI quedan fuera por regla, no por olvido.
  if (!tarifas.metodosPara(separoPesos, Number(pv.total)).includes(metodo)) {
    return { statusCode: 409, headers, body: JSON.stringify({
      error: 'Los meses sin intereses son para pagos grandes (al menos la mitad de tu viaje)' }) };
  }

  const t = tarifas.calcularTotal(separoPesos, metodo);
  if (t.error) return { statusCode: 400, headers, body: JSON.stringify({ error: t.error }) };

  // ── VIGENCIA DE LA SESIÓN, ALINEADA AL HOLD ────────────────────────────────
  // OXXO: la ficha dura lo que dura el hold (24 h). Tarjeta: la sesión expira
  // con el reloj corto. Si la sesión viviera más que el apartado, el cliente
  // podría pagar por un lugar que ya se soltó.
  const minutos = holdMinutos(metodo === 'oxxo' ? 'oxxo' : 'tarjeta');
  const holdMs = sol.hold_expira_at ? Date.parse(sol.hold_expira_at) : NaN;
  const finPorHold = Number.isFinite(holdMs) ? Math.floor(holdMs / 1000) : null;
  const finPorMetodo = Math.floor(Date.now() / 1000) + minutos * 60;
  // Stripe exige al menos 30 min de vigencia; con el reloj de 15 min se usa el
  // mínimo y el candado real lo pone el servidor al confirmar, no la caducidad.
  const MIN_STRIPE = Math.floor(Date.now() / 1000) + 31 * 60;
  let expiresAt = Math.min(finPorHold || finPorMetodo, finPorMetodo);
  if (expiresAt < MIN_STRIPE) expiresAt = MIN_STRIPE;

  const sitio = String(process.env.PORTAL_URL || 'https://conectareynosa.mx').replace(/\/+$/, '');
  const payload = {
    mode: 'payment',
    payment_method_types: (metodo === 'oxxo') ? ['oxxo'] : ['card'],
    locale: 'es',
    expires_at: expiresAt,
    client_reference_id: String(sol.id),
    success_url: `${sitio}/portal.html?apartado=ok&s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${sitio}/portal.html?apartado=cancelado`,
    metadata: { tipo: 'separo', solicitud_id: String(sol.id), metodo },
    payment_intent_data: { metadata: { tipo: 'separo', solicitud_id: String(sol.id) } },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'mxn',
        unit_amount: t.total_cent,
        product_data: { name: `Apartado · ${sol.evento_nombre || 'Conecta Reynosa'}` },
      },
    }],
  };
  if (cli.correo) payload.customer_email = cli.correo;
  if (t.msi_meses) payload.payment_method_options = { card: { installments: { enabled: true } } };

  const r = await stripe.apiPost('checkout/sessions', payload, `separo_${sol.id}_${metodo}`);
  if (!r.ok) return { statusCode: r.status === 400 ? 502 : r.status, headers, body: JSON.stringify({ error: r.error }) };
  const ses = r.data;

  // Registro. tipo='separo' y pago_id NULL: la cuota no existe todavía.
  try {
    await fetch(`${SB_URL}/rest/v1/stripe_checkout_sesiones`, {
      method: 'POST', headers: { ...sb, Prefer: 'return=minimal' },
      body: JSON.stringify({
        session_id: ses.id, tipo: 'separo', pago_id: null, solicitud_id: sol.id,
        auth_user_id: authUserId, metodo,
        monto_base_cent: t.base_cent, cargo_servicio_cent: t.cargo_cent, monto_total_cent: t.total_cent,
        pct_aplicado: t.pct_aplicado, absorbe_cargo: t.absorbe, estado: 'creada', modo: stripe.modo(),
      }),
    });
  } catch (e) {
    console.error('[stripe-separo-crear] no se registró la sesión (no crítico):', e.message);
  }

  // Se anota el método elegido en la solicitud (para la etiqueta de la cola y
  // para que el reloj de OXXO se lea como tal). No toca el hold: eso es de
  // portal-nueva-solicitud, y muta lo mínimo.
  try {
    await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(sol.id)}`, {
      method: 'PATCH', headers: { ...sb, Prefer: 'return=minimal' },
      body: JSON.stringify({ metodo_separo: (metodo === 'oxxo') ? 'oxxo' : 'tarjeta' }),
    });
  } catch (e) { /* cosmético */ }

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      ok: true, url: ses.url, session_id: ses.id,
      total_cent: t.total_cent, base_cent: t.base_cent, cargo_cent: t.cargo_cent,
      metodo, expira_en: expiresAt, modo: stripe.modo(),
      aviso_monto: difiere ? 'el monto de la fila difiere del catálogo; se cobró el del catálogo' : undefined,
    }),
  };
};
