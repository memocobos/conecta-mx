// =============================================================================
// mp-separo-crear — cobra el SEPARO con Checkout Pro (MP-1b)
//
// Espejo de `stripe-separo-crear`, la pieza de C2 que sobrevive por decisión de
// Memo: **el cliente paga AL SOLICITAR**, antes de la aceptación. Lo que cambia
// es el proveedor, no el momento.
//
// El cliente pide "quiero apartar con esta forma de pago". El SERVIDOR valida
// TODO y calcula el total; el cliente solo recibe la URL a la que ir.
//
// ── EL ENRUTAMIENTO (regla firmada) ─────────────────────────────────────────
// CHEAP no llega aquí: solo transferencia a Banamex. La puerta se cierra dos
// veces —el menú no le ofrece la opción y este endpoint la rechaza— porque
// esconder no es impedir.
//
// ── 3D SECURE ───────────────────────────────────────────────────────────────
// Es la razón de elegir Checkout Pro sobre Bricks: MP lo orquesta. Aquí no se
// implementa el reto — se DELEGA. Si un día el panel de MP dejara de exigirlo,
// esta integración se quedaría sin 3DS sin que el código cambie: por eso queda
// como pendiente explícito verificar la exigencia en el panel al recibir la
// cuenta verificada, y no darla por hecha.
//
// ⚠️ EL IMPORTE VA EN PESOS (`transaction_amount`), no en centavos como Stripe.
//
// ⚠️ EL RETORNO DEL CLIENTE NO CONFIRMA NADA. `back_urls` solo sirve para
// enseñarle una pantalla. El dinero lo confirma el WEBHOOK (MP-1c). Un cliente
// que cierra el navegador tiene que quedar igual de bien cobrado.
//
// Env: PAGOS_MP_MODO, MP_ACCESS_TOKEN, SITE_URL, PORTAL_SUPABASE_URL/ANON/SERVICE.
// =============================================================================

const mp = require('./_lib/mercadopago');
const tarifas = require('./_lib/mp-tarifas');
const { resolverPrecioVenta } = require('./_lib/precio-zona');
const { etiquetaHold } = require('./_lib/disponibilidad');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const PAQUETES_CON_MP = ['plus', 'ride', 'stay'];
const SITE = (process.env.SITE_URL || 'https://conectareynosa.mx').replace(/\/+$/, '');

exports.handler = async (event) => {
  const headers = { ...CORS };
  const bad = (c, m, extra) => ({ statusCode: c, headers, body: JSON.stringify({ ok: false, error: m, ...(extra || {}) }) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return bad(405, 'Method not allowed');

  if (!mp.encendido()) return bad(503, 'El cobro con tarjeta no está disponible');
  const llave = mp.llaveCoherente();
  if (!llave.ok) { console.error('[mp-separo-crear] llave incoherente:', llave.error); return bad(503, 'El cobro con tarjeta no está disponible'); }

  const SB_URL = process.env.PORTAL_SUPABASE_URL;
  const SB_ANON = process.env.PORTAL_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_ANON || !SB_SERVICE) return bad(500, 'Portal no configurado');

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return bad(400, 'JSON inválido'); }
  const solicitudId = String(body.solicitud_id || '').trim();
  const metodo = String(body.metodo || '').trim().toLowerCase();
  if (!solicitudId) return bad(400, 'Falta solicitud_id');
  if (!tarifas.ORDEN.includes(metodo)) return bad(400, 'Método de pago no válido');

  // Sesión del CLIENTE.
  const jwt = ((event.headers && (event.headers.authorization || event.headers.Authorization)) || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return bad(401, 'Falta Authorization Bearer');
  let authUserId = null;
  try {
    const uR = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + jwt } });
    if (!uR.ok) return bad(401, 'Sesión inválida');
    authUserId = (await uR.json()).id;
  } catch { return bad(401, 'Sesión inválida'); }
  if (!authUserId) return bad(401, 'Sesión inválida');

  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' };
  let sol;
  try {
    const q = `${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}`
      + `&select=id,estado,paquete,zona,num_personas,evento_id,evento_nombre,tipo_habitacion,`
      + `hold_expira_at,separo_pagado_at,clientes(auth_user_id,nombre_completo,correo)`;
    const r = await fetch(q, { headers: sb });
    if (!r.ok) return bad(502, 'El Portal rechazó la consulta');
    sol = (await r.json())[0];
  } catch (e) { return bad(502, 'Error leyendo la solicitud'); }
  if (!sol) return bad(404, 'Solicitud no encontrada');
  const cli = Array.isArray(sol.clientes) ? sol.clientes[0] : sol.clientes;

  // LAS PUERTAS, en orden y sin atajos.
  if (!cli || cli.auth_user_id !== authUserId) return bad(403, 'Esta solicitud no es tuya');
  if (sol.estado !== 'pendiente') return bad(409, 'Esta solicitud ya no está pendiente');
  if (sol.separo_pagado_at) return bad(409, 'El separo de esta solicitud ya está pagado');
  if (etiquetaHold(sol, Date.now()).etiqueta === 'vencida') return bad(409, 'El apartado venció — vuelve a solicitar');

  // El enrutamiento, del lado del servidor: CHEAP no paga con tarjeta.
  const paquete = String(sol.paquete || '').trim().toLowerCase();
  if (!PAQUETES_CON_MP.includes(paquete)) {
    return bad(409, 'Este paquete se aparta solo por transferencia', { paquete });
  }

  // EL MONTO, del catálogo. NUNCA de la fila: la escribió el navegador.
  const pv = await resolverPrecioVenta({
    evento_id: sol.evento_id, paquete: sol.paquete, zona: sol.zona,
    num_personas: sol.num_personas, tipo_habitacion: sol.tipo_habitacion,
  });
  if (!pv || !pv.ok || !(Number(pv.separo) > 0)) return bad(409, 'No se pudo calcular el separo de esta solicitud');
  // [COT-FIX-1] Tercera puerta del estado imposible.
  if (Number(pv.separo) > Number(pv.total)) {
    console.error('[mp-separo-crear] separo>total en', sol.evento_id, pv.separo, pv.total);
    return bad(409, 'Catálogo mal capturado para este evento — escríbenos');
  }
  if (!tarifas.metodosPara(Number(pv.separo), Number(pv.total)).includes(metodo)) {
    return bad(409, 'Ese método no está disponible para este separo');
  }
  const t = tarifas.calcularTotal(Number(pv.separo), metodo);
  if (t.error) return bad(409, 'No se pudo calcular el cargo: ' + t.error);

  // ── LA PREFERENCIA (Checkout Pro) ──────────────────────────────────────────
  // `external_reference` es el amarre a NUESTRA solicitud: el webhook lo carea
  // contra lo que devuelve el GET del pago, y si no coincide no escribe nada.
  const pref = {
    items: [{
      id: String(sol.id),
      title: `Separo — ${sol.evento_nombre || sol.evento_id}`,
      description: `${String(sol.paquete).toUpperCase()} · ${sol.zona || 'sin zona'} · ${sol.num_personas} persona(s)`,
      quantity: 1,
      currency_id: 'MXN',
      unit_price: t.total_pesos,        // ⚠️ EN PESOS
    }],
    external_reference: String(sol.id),
    payer: cli.correo ? { email: cli.correo, name: cli.nombre_completo || undefined } : undefined,
    back_urls: {
      success: `${SITE}/portal.html?pago=ok&sol=${encodeURIComponent(sol.id)}`,
      failure: `${SITE}/portal.html?pago=error&sol=${encodeURIComponent(sol.id)}`,
      pending: `${SITE}/portal.html?pago=pendiente&sol=${encodeURIComponent(sol.id)}`,
    },
    notification_url: `${SITE}/.netlify/functions/mp-webhook`,
    // Una sola exhibición salvo que el método sea MSI: `installments` es el TOPE.
    payment_methods: {
      installments: metodo === 'msi6' ? 6 : (metodo === 'msi3' ? 3 : 1),
      // Sin efectivo ni transferencia DENTRO del checkout: la transferencia es
      // el flujo de la casa (con su comprobante) y no se duplica aquí.
      excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }, { id: 'atm' }],
    },
  };

  const r = await mp.apiPost('/checkout/preferences', pref, { idempotencia: `sol_${sol.id}_${metodo}` });
  if (!r.ok) {
    console.error('[mp-separo-crear] MP rechazó la preferencia:', r.status, r.error);
    return bad(502, 'No se pudo iniciar el pago con tarjeta');
  }
  const p = r.json || {};
  // En modo test MP devuelve `sandbox_init_point`; en producción, `init_point`.
  const url = mp.modo() === 'live' ? p.init_point : (p.sandbox_init_point || p.init_point);
  if (!url) return bad(502, 'Mercado Pago no devolvió una URL de pago');

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      ok: true, proveedor: 'mercadopago',
      preference_id: p.id, url,
      total_pesos: t.total_pesos, cargo_pesos: t.cargo_pesos, base_pesos: t.base_pesos,
    }),
  };
};
