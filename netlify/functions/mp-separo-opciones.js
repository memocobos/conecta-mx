// =============================================================================
// mp-separo-opciones — el MENÚ del separo, con sus totales (MP-1b)
//
// Espejo de `stripe-separo-opciones`: el Portal pregunta "¿cómo puedo apartar y
// cuánto cuesta cada forma?" y el SERVIDOR contesta con los totales ya
// calculados. El cliente NUNCA hace aritmética de dinero: solo pinta lo que le
// dan. Esa forma es de C2 y sobrevive entera — lo que cambia es el proveedor.
//
// ── EL ENRUTAMIENTO POR PAQUETE (regla firmada) ─────────────────────────────
//
//   PLUS / RIDE / STAY → Mercado Pago (tarjeta, 3DS obligatorio) O transferencia
//   CHEAP              → SOLO transferencia. Sin botón de MP, sin opción de
//                        tarjeta, y SIN HUECO: no se pinta un botón muerto ni un
//                        aviso de "no disponible". No se ofrece lo que no aplica.
//
// La regla ya vivía en C2 (`if (paquete === 'cheap') return apagado`) y se
// conserva tal cual: CHEAP ni ve el menú.
//
// ⚠️ LA CUENTA BANCARIA NO VIAJA POR AQUÍ. El Portal ya la pide a
// `portal-cuenta-tour`, que la resuelve con `cuentaParaPaquete` — la fuente
// única. Reenviarla desde este endpoint crearía una SEGUNDA fuente del mismo
// dato, que es exactamente lo que el enrutamiento no puede permitirse: sería
// otra copia esperando a divergir, y encima sobre a qué banco manda su dinero
// el cliente. Aquí solo se dice QUÉ formas de pago hay; a qué CLABE, lo dice
// quien ya lo decía.
//
// Devuelve SIEMPRE 200 con { activo: bool }. Con activo=false el Portal se queda
// con su flujo de transferencia de siempre: un proveedor apagado no rompe la
// venta, solo quita una forma de pagar.
//
// Env: PAGOS_MP_MODO, MP_ACCESS_TOKEN, PORTAL_SUPABASE_URL/ANON/SERVICE.
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

// Paquetes que SÍ pueden pagar con tarjeta. CHEAP no está, y no por olvido.
const PAQUETES_CON_MP = ['plus', 'ride', 'stay'];

exports.handler = async (event) => {
  const headers = { ...CORS };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apagado = { statusCode: 200, headers, body: JSON.stringify({ ok: true, activo: false }) };

  if (!mp.encendido()) return apagado;
  if (!mp.llaveCoherente().ok) return apagado;   // llave mal puesta = dormido, no roto

  const SB_URL = process.env.PORTAL_SUPABASE_URL;
  const SB_ANON = process.env.PORTAL_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_ANON || !SB_SERVICE) return apagado;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }
  const solicitudId = String(body.solicitud_id || '').trim();
  if (!solicitudId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta solicitud_id' }) };

  // Sesión del CLIENTE (Supabase Auth del Portal), no admin.
  const jwt = ((event.headers && (event.headers.authorization || event.headers.Authorization)) || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Falta Authorization Bearer' }) };
  let authUserId = null;
  try {
    const uR = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + jwt } });
    if (!uR.ok) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión inválida' }) };
    authUserId = (await uR.json()).id;
  } catch (e) { return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión inválida' }) }; }
  if (!authUserId) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión inválida' }) };

  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' };
  let sol;
  try {
    const q = `${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}`
      + `&select=id,estado,paquete,zona,num_personas,evento_id,tipo_habitacion,hold_expira_at,`
      + `separo_pagado_at,comprobante_separo_url,metodo_separo,clientes(auth_user_id)`;
    const r = await fetch(q, { headers: sb });
    if (!r.ok) return apagado;
    const arr = await r.json();
    sol = Array.isArray(arr) ? arr[0] : null;
  } catch (e) { return apagado; }
  if (!sol) return apagado;
  const cli = Array.isArray(sol.clientes) ? sol.clientes[0] : sol.clientes;

  // LAS MISMAS PUERTAS que mp-separo-crear. Cualquiera que falle → apagado: no
  // se enseña una opción que el servidor va a rechazar.
  if (!cli || cli.auth_user_id !== authUserId) return apagado;
  if (sol.estado !== 'pendiente') return apagado;
  if (sol.separo_pagado_at) return apagado;                        // ya pagó
  if (etiquetaHold(sol, Date.now()).etiqueta === 'vencida') return apagado;

  // ── EL ENRUTAMIENTO ────────────────────────────────────────────────────────
  // CHEAP no ve el menú de tarjeta. `apagado` es justamente "sin hueco": el
  // Portal pinta su transferencia de siempre y no aparece nada de MP — ni un
  // botón deshabilitado ni un aviso. La regla venía de C2 y no cambia.
  const paquete = String(sol.paquete || '').trim().toLowerCase();
  if (!PAQUETES_CON_MP.includes(paquete)) return apagado;

  // EL MONTO, del catálogo. Nunca de la fila: la escribió el navegador.
  const pv = await resolverPrecioVenta({
    evento_id: sol.evento_id, paquete: sol.paquete, zona: sol.zona,
    num_personas: sol.num_personas, tipo_habitacion: sol.tipo_habitacion,
  });
  if (!pv || !pv.ok || !(Number(pv.separo) > 0)) return apagado;    // sin precio, sin menú

  // [COT-FIX-1] Un separo mayor que el total es un estado imposible. Si llegara
  // hasta aquí no se ofrece pagar: la cotización ya truena en el index y el
  // vendedor ya lo tiene bloqueado, ésta es la tercera puerta.
  if (Number(pv.separo) > Number(pv.total)) return apagado;

  const separoPesos = Number(pv.separo);
  const opciones = [];
  for (const m of tarifas.metodosPara(separoPesos, Number(pv.total))) {
    const t = tarifas.calcularTotal(separoPesos, m);
    if (t.error) continue;
    opciones.push({
      metodo: m,
      label: tarifas.ETIQUETAS[m].label,
      nota: tarifas.ETIQUETAS[m].nota,
      // En PESOS, no en centavos: MP cobra `transaction_amount: 1500.00`.
      // El nombre lleva la unidad para que nadie lo confunda con los *_cent de
      // Stripe — un copiar-pegar entre los dos cobraría 100 veces de menos.
      total_pesos: t.total_pesos,
      cargo_pesos: t.cargo_pesos,
      base_pesos: t.base_pesos,
      sin_cargo: t.cargo_pesos === 0,
    });
  }
  if (!opciones.length) return apagado;

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      ok: true, activo: true, proveedor: 'mercadopago',
      solicitud_id: sol.id, hold_expira_at: sol.hold_expira_at,
      // La transferencia va SIEMPRE primero y sin cargo: es el flujo de la casa
      // y no deja de existir porque haya tarjeta. La CLABE la pide el Portal a
      // portal-cuenta-tour — aquí solo se dice que la opción existe.
      transferencia: { label: 'Transferencia o depósito', nota: 'Sin cargo · sube tu comprobante', total_pesos: separoPesos },
      opciones,
    }),
  };
};
