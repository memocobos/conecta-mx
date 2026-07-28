// =============================================================================
// stripe-checkout-crear — crea la Checkout Session de UNA cuota (Fase C · ST-1)
//
// El cliente (titular del Portal, JWT de Supabase Auth) pide "quiero pagar esta
// cuota con este método". El servidor valida TODO y calcula el total. El cliente
// JAMÁS manda un monto.
//
// Validaciones, en orden y todas server-side:
//   1. Interruptor PAGOS_STRIPE_MODO ≠ 'off'  → si está off, 404 (dormido total).
//   2. JWT del titular → auth_user_id real.
//   3. La cuota existe, es SUYA, está 'pendiente' (ni pagada ni cancelada).
//   4. El paquete NO es CHEAP (payout va a CLABE BBVA — cuenta fiscalizada).
//   5. La cuota es elegible según STRIPE_CUOTAS_ELEGIBLES.
//   6. El total sale de _lib/stripe-tarifas — nunca del body.
//
// Env: PAGOS_STRIPE_MODO, STRIPE_SECRET_KEY, PORTAL_SUPABASE_URL/ANON/SERVICE.
// =============================================================================

const stripe = require('./_lib/stripe');
const tarifas = require('./_lib/stripe-tarifas');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // 1. EL INTERRUPTOR. Apagado = la function no existe para el mundo.
  if (!stripe.encendido()) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'No disponible' }) };
  }
  const coh = stripe.llaveCoherente();
  if (!coh.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: coh.error }) };

  const SB_URL = process.env.PORTAL_SUPABASE_URL;
  const SB_ANON = process.env.PORTAL_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_ANON || !SB_SERVICE) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars del Portal' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const pagoId = body.pago_id;
  const metodo = String(body.metodo || '').toLowerCase();
  if (!pagoId || !/^[0-9a-f-]{36}$/i.test(pagoId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'pago_id inválido' }) };
  }
  if (!tarifas.METODOS.includes(metodo)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'metodo inválido (' + tarifas.METODOS.join('|') + ')' }) };
  }
  // Si el cliente manda un monto, es señal de que algo lo está intentando: se
  // rechaza en vez de ignorarlo en silencio.
  if (body.monto != null || body.total != null || body.total_cent != null) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'El total lo calcula el servidor: no mandes montos' }) };
  }

  // 2. JWT del titular.
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Falta Authorization Bearer' }) };
  let authUserId;
  try {
    const uR = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + jwt } });
    if (!uR.ok) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión inválida' }) };
    const u = await uR.json();
    authUserId = u && u.id;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo validar la sesión' }) };
  }
  if (!authUserId) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión inválida' }) };

  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' };

  // 3-4. La cuota, su dueño y su paquete — en UNA consulta con el join.
  let pago;
  try {
    const q = `${SB_URL}/rest/v1/pagos?id=eq.${encodeURIComponent(pagoId)}` +
      `&select=id,solicitud_id,concepto,monto,estado,solicitudes_tour(id,paquete,estado,evento_nombre,clientes(auth_user_id,correo,nombre_completo))`;
    const r = await fetch(q, { headers: sb });
    if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer la cuota' }) };
    const arr = await r.json();
    pago = Array.isArray(arr) ? arr[0] : null;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer la cuota' }) };
  }
  if (!pago) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cuota no encontrada' }) };

  const sol = Array.isArray(pago.solicitudes_tour) ? pago.solicitudes_tour[0] : pago.solicitudes_tour;
  const cli = sol && (Array.isArray(sol.clientes) ? sol.clientes[0] : sol.clientes);

  // ES SUYA. Mismo 404 que "no existe": a un tercero no se le confirma que la
  // cuota exista (sería decirle qué IDs son reales).
  if (!cli || cli.auth_user_id !== authUserId) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cuota no encontrada' }) };
  }
  if (pago.estado !== 'pendiente') {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'Esa cuota ya no está pendiente (' + pago.estado + ')' }) };
  }
  if (sol.estado === 'cancelado') {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'La solicitud está cancelada' }) };
  }
  // CHEAP fuera, del lado del servidor (el brief lo pide explícito).
  if (String(sol.paquete || '').toLowerCase() === 'cheap') {
    return { statusCode: 409, headers, body: JSON.stringify({
      error: 'El paquete CHEAP se paga por transferencia o depósito a Banamex, como siempre' }) };
  }
  if (!tarifas.cuotaElegible(pago.concepto)) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'Esa cuota no acepta pago con tarjeta' }) };
  }

  // 6. EL TOTAL, del servidor.
  const t = tarifas.calcularTotal(pago.monto, metodo);
  if (t.error) return { statusCode: 400, headers, body: JSON.stringify({ error: t.error }) };

  const sitio = String(process.env.PORTAL_URL || 'https://conectareynosa.mx').replace(/\/+$/, '');
  const tipos = (metodo === 'oxxo') ? ['oxxo'] : ['card'];
  const payload = {
    mode: 'payment',
    payment_method_types: tipos,
    locale: 'es',
    client_reference_id: String(pago.id),
    success_url: `${sitio}/portal.html?pago=ok&s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${sitio}/portal.html?pago=cancelado`,
    metadata: { pago_id: String(pago.id), solicitud_id: String(pago.solicitud_id), metodo },
    payment_intent_data: { metadata: { pago_id: String(pago.id), solicitud_id: String(pago.solicitud_id) } },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'mxn',
        unit_amount: t.total_cent,
        product_data: { name: `${pago.concepto || 'Pago'} · ${sol.evento_nombre || 'Conecta Reynosa'}` },
      },
    }],
  };
  if (cli.correo) payload.customer_email = cli.correo;
  if (t.msi_meses) {
    payload.payment_method_options = { card: { installments: { enabled: true } } };
  }

  // Idempotency-Key: un reintento de red no crea DOS sesiones para la misma
  // cuota y método. Sin fecha, para que el reintento sea el mismo.
  const r = await stripe.apiPost('checkout/sessions', payload, `pago_${pago.id}_${metodo}`);
  if (!r.ok) return { statusCode: r.status === 400 ? 502 : r.status, headers, body: JSON.stringify({ error: r.error }) };

  const ses = r.data;

  // Registro de la sesión. BEST-EFFORT: si falla, el cliente ya tiene su URL y
  // el webhook trae el pago_id en la metadata — el pago NO se pierde por esto.
  try {
    await fetch(`${SB_URL}/rest/v1/stripe_checkout_sesiones`, {
      method: 'POST', headers: { ...sb, Prefer: 'return=minimal' },
      body: JSON.stringify({
        session_id: ses.id, pago_id: pago.id, solicitud_id: pago.solicitud_id,
        auth_user_id: authUserId, metodo,
        monto_base_cent: t.base_cent, cargo_servicio_cent: t.cargo_cent, monto_total_cent: t.total_cent,
        pct_aplicado: t.pct_aplicado, absorbe_cargo: t.absorbe, estado: 'creada', modo: stripe.modo(),
      }),
    });
  } catch (e) {
    console.error('[stripe-checkout-crear] no se registró la sesión (no crítico):', e.message);
  }

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      ok: true, url: ses.url, session_id: ses.id,
      // se devuelve el desglose para que la UI muestre el MISMO número que cobró
      // el servidor, no uno recalculado en el cliente.
      total_cent: t.total_cent, base_cent: t.base_cent, cargo_cent: t.cargo_cent,
      metodo, modo: stripe.modo(),
    }),
  };
};
