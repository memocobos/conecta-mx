// =============================================================================
// stripe-opciones — el MENÚ de una cuota, con sus totales (Fase C · ST-2)
//
// El wizard pregunta "¿cuánto cuesta apartar por cada forma de pago?" y el
// SERVIDOR contesta con los totales ya calculados. El cliente nunca hace
// aritmética de dinero: solo pinta lo que le dan.
//
// El monto sale de resolverPrecioVenta (el catálogo), NUNCA de la fila: la
// escribió el navegador. Mismas puertas que stripe-separo-crear, para no
// enseñarle una opción que el servidor va a rechazar.
//
// Devuelve SIEMPRE 200 con { activo: bool }. Cuando activo=false el Portal se
// dibuja exactamente como siempre (transferencia y ya). Un 404 aquí obligaría
// al front a distinguir "apagado" de "se cayó", y ante la duda debe caer al
// flujo de siempre, que nunca falla.
//
// Mismas puertas que stripe-checkout-crear: la cuota existe, es SUYA, está
// pendiente, no es CHEAP y es elegible. Este endpoint NO crea nada.
// =============================================================================

const stripe = require('./_lib/stripe');
const tarifas = require('./_lib/stripe-tarifas');
const { resolverPrecioVenta } = require('./_lib/precio-zona');
const { etiquetaHold } = require('./_lib/disponibilidad');

const ETIQUETAS = {
  oxxo:    { label: 'OXXO',                   nota: 'Pagas en efectivo · se confirma en unas horas' },
  debito:  { label: 'Tarjeta de débito',      nota: 'Se confirma al instante' },
  credito: { label: 'Crédito · 1 exhibición', nota: 'Se confirma al instante' },
  msi3:    { label: '3 meses sin intereses',  nota: 'Con tarjeta de crédito participante' },
  msi6:    { label: '6 meses sin intereses',  nota: 'Con tarjeta de crédito participante' },
};
const ORDEN = ['oxxo', 'debito', 'credito', 'msi3', 'msi6'];

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apagado = { statusCode: 200, headers, body: JSON.stringify({ ok: true, activo: false }) };

  if (!stripe.encendido()) return apagado;
  if (!stripe.llaveCoherente().ok) return apagado;   // llave mal puesta = dormido, no roto

  const SB_URL = process.env.PORTAL_SUPABASE_URL;
  const SB_ANON = process.env.PORTAL_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_ANON || !SB_SERVICE) return apagado;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return apagado; }
  const solicitudId = body.solicitud_id;
  if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) return apagado;

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Falta Authorization Bearer' }) };
  let authUserId;
  try {
    const uR = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + jwt } });
    if (!uR.ok) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión inválida' }) };
    authUserId = (await uR.json()).id;
  } catch (e) { return apagado; }
  if (!authUserId) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión inválida' }) };

  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' };
  let sol;
  try {
    const q = `${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(solicitudId)}` +
      `&select=id,estado,paquete,zona,num_personas,evento_id,tipo_habitacion,hold_expira_at,` +
      `separo_pagado_at,comprobante_separo_url,metodo_separo,clientes(auth_user_id)`;
    const r = await fetch(q, { headers: sb });
    if (!r.ok) return apagado;
    const arr = await r.json();
    sol = Array.isArray(arr) ? arr[0] : null;
  } catch (e) { return apagado; }
  if (!sol) return apagado;
  const cli = Array.isArray(sol.clientes) ? sol.clientes[0] : sol.clientes;

  // LAS MISMAS PUERTAS que stripe-separo-crear. Cualquiera que falle → apagado.
  if (!cli || cli.auth_user_id !== authUserId) return apagado;
  if (sol.estado !== 'pendiente') return apagado;
  if (sol.separo_pagado_at) return apagado;                       // ya pagó
  if (etiquetaHold(sol, Date.now()).etiqueta === 'vencida') return apagado;
  if (String(sol.paquete || '').toLowerCase() === 'cheap') return apagado;   // CHEAP ni ve el menú

  // EL MONTO, del catálogo.
  const pv = await resolverPrecioVenta({
    evento_id: sol.evento_id, paquete: sol.paquete, zona: sol.zona,
    num_personas: sol.num_personas, tipo_habitacion: sol.tipo_habitacion,
  });
  if (!pv || !pv.ok || !(Number(pv.separo) > 0)) return apagado;   // sin precio, sin menú
  const separoPesos = Number(pv.separo);

  const opciones = [];
  for (const m of ORDEN) {
    const t = tarifas.calcularTotal(separoPesos, m);
    if (t.error) continue;
    opciones.push({
      metodo: m, label: ETIQUETAS[m].label, nota: ETIQUETAS[m].nota,
      total_cent: t.total_cent, cargo_cent: t.cargo_cent, base_cent: t.base_cent,
      sin_cargo: t.cargo_cent === 0,
    });
  }
  if (!opciones.length) return apagado;

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      ok: true, activo: true, solicitud_id: sol.id, hold_expira_at: sol.hold_expira_at,
      // La transferencia va SIEMPRE primero y sin cargo: es el flujo de la casa
      // y no deja de existir porque haya tarjeta.
      transferencia: { label: 'Transferencia o depósito', nota: 'Sin cargo · sube tu comprobante', total_cent: Math.round(separoPesos * 100) },
      opciones,
    }),
  };
};
