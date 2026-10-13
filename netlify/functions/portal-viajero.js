// =============================================================================
// portal-viajero  (PORTAL-EDIT-1 — lo que el cliente PUEDE hacer con su viaje)
// =============================================================================
// Dos acciones, las dos sobre filas de `viajeros_evento` (KameHouse) que son
// SUYAS — y «suyas» se decide igual que en portal-mi-plan-migrado: por el correo
// VERIFICADO del propio JWT, en minúsculas de los dos lados. Nunca por un id que
// el navegador diga que es suyo sin comprobarlo.
//
//   · `editar`          → nombre, celular, talla, número y nombre de emergencia.
//                         DIRECTO a la lista del evento (no mueven dinero).
//   · `solicitar_cambio`→ hotel / zona / fecha / otro: NO se cambia nada; nace una
//                         fila en `cambios_viajero` que cae a la bandeja de
//                         Bulma/Milk. Mueve precio y contrato: lo decide un humano
//                         (el rumbo: «nada automático decide dinero»).
//
// 🔒 Lo que JAMÁS se toca desde aquí: correo (es la llave de la cuenta), evento,
// paquete, zona, boletos, contrato, abonos. Cualquier otro campo del cuerpo se
// IGNORA, no se rechaza: una página vieja que mande de más no tumba el guardado.
//
// POST (Authorization: Bearer <jwt del Portal>) { accion, viajero_id, ... }
// Env: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY, SUPABASE_URL_KAMEHOUSE,
//      SUPABASE_SERVICE_KEY_KAMEHOUSE.
// =============================================================================
const { tallaNormalizada } = require('./_lib/correo-forma');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = ['hotel', 'zona', 'fecha', 'otro'];
const MAX_PENDIENTES = 3; // por viajero: un buzón, no un chat

function json(status, headers, body) { return { statusCode: status, headers, body: JSON.stringify(body) }; }

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, headers, { ok: false, error: 'Solo POST' });

  const PT_URL = process.env.PORTAL_SUPABASE_URL;
  const PT_ANON = process.env.PORTAL_SUPABASE_ANON_KEY;
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!PT_URL || !PT_ANON || !KH_URL || !KH_KEY) return json(500, headers, { ok: false, error: 'Faltan env vars' });

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return json(401, headers, { ok: false, error: 'Inicia sesión otra vez' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return json(400, headers, { ok: false, error: 'Cuerpo inválido' }); }
  const accion = String(body.accion || '');
  if (accion !== 'editar' && accion !== 'solicitar_cambio') return json(400, headers, { ok: false, error: 'Acción desconocida' });
  const viajero_id = String(body.viajero_id || '');
  if (!UUID_RE.test(viajero_id)) return json(400, headers, { ok: false, error: 'Viajero inválido' });

  // ── 1 · Quién es (JWT del Portal, correo VERIFICADO) ─────────────────────
  let user;
  try {
    const r = await fetch(`${PT_URL}/auth/v1/user`, { headers: { apikey: PT_ANON, Authorization: 'Bearer ' + jwt } });
    if (!r.ok) return json(401, headers, { ok: false, error: 'Tu sesión venció: entra otra vez' });
    user = await r.json();
  } catch (e) { return json(502, headers, { ok: false, error: 'No pude validar tu sesión' }); }
  const correo = (user && typeof user.email === 'string') ? user.email.trim().toLowerCase() : '';
  if (!correo || !user.email_confirmed_at) return json(403, headers, { ok: false, error: 'Confirma tu correo para poder editar' });

  // ── 2 · La fila, y que sea SUYA ──────────────────────────────────────────
  const hKH = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  let v;
  try {
    const r = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=eq.${viajero_id}&select=id,evento_id,nombre,correo,celular&limit=1`, { headers: hKH });
    if (!r.ok) return json(502, headers, { ok: false, error: 'No pude leer tu viaje' });
    v = (await r.json())[0];
  } catch (e) { return json(502, headers, { ok: false, error: 'No pude leer tu viaje' }); }
  // 🔒 Inexistente y ajena contestan LO MISMO: no se le confirma a nadie que un
  // id existe si no es suyo.
  if (!v || String(v.correo == null ? '' : v.correo).trim().toLowerCase() !== correo) {
    return json(404, headers, { ok: false, error: 'No encontramos ese viajero en tu cuenta' });
  }

  // ── 3a · EDITAR ──────────────────────────────────────────────────────────
  if (accion === 'editar') {
    const c = body.campos || {};
    const cambios = {};
    if (c.nombre !== undefined) {
      const n = String(c.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (n.length < 2) return json(400, headers, { ok: false, error: 'Escribe el nombre completo' });
      cambios.nombre = n;
    }
    if (c.celular !== undefined) {
      const d = String(c.celular || '').replace(/\D/g, '');
      if (d.length !== 10) return json(400, headers, { ok: false, error: 'El WhatsApp va a 10 dígitos' });
      cambios.celular = d;
    }
    if (c.talla_playera !== undefined) {
      const t = tallaNormalizada(c.talla_playera);
      if (!t) return json(400, headers, { ok: false, error: 'Elige una talla de XS a XXL' });
      cambios.talla_playera = t;
    }
    if (c.num_emergencia !== undefined) {
      const d = String(c.num_emergencia || '').replace(/\D/g, '');
      if (d.length !== 10) return json(400, headers, { ok: false, error: 'El número de emergencia va a 10 dígitos' });
      const cel = cambios.celular || String(v.celular || '').replace(/\D/g, '');
      if (cel && d === cel) return json(400, headers, { ok: false, error: 'El número de emergencia tiene que ser de otra persona' });
      cambios.num_emergencia = d;
    }
    if (c.emergencia_nombre !== undefined) {
      const n = String(c.emergencia_nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (n && n.length < 2) return json(400, headers, { ok: false, error: 'Escribe el nombre de tu contacto de emergencia' });
      cambios.emergencia_nombre = n || null;
    }
    if (!Object.keys(cambios).length) return json(400, headers, { ok: false, error: 'No hay nada que guardar' });
    cambios.editado_portal_at = new Date().toISOString();
    // 🔒 El PATCH vuelve a exigir el correo (ilike solo estrecha; la fila ya se
    // comprobó arriba por igualdad exacta). Así una carrera no escribe en otra.
    const r = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=eq.${viajero_id}&correo=ilike.${encodeURIComponent(correo)}`, {
      method: 'PATCH',
      headers: Object.assign({}, hKH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(cambios),
    });
    if (!r.ok) return json(502, headers, { ok: false, error: 'No se pudo guardar. Inténtalo otra vez.' });
    const filas = await r.json().catch(() => []);
    if (!Array.isArray(filas) || filas.length !== 1) return json(409, headers, { ok: false, error: 'No se pudo guardar. Recarga e inténtalo otra vez.' });
    return json(200, headers, { ok: true, guardado: Object.keys(cambios).filter((k) => k !== 'editado_portal_at') });
  }

  // ── 3b · SOLICITAR UN CAMBIO (hotel / zona / fecha / otro) ───────────────
  const tipo = String(body.tipo || '');
  if (!TIPOS.includes(tipo)) return json(400, headers, { ok: false, error: 'Elige qué quieres cambiar' });
  const detalle = String(body.detalle || '').trim().replace(/\s+/g, ' ').slice(0, 600);
  if (detalle.length < 3) return json(400, headers, { ok: false, error: 'Cuéntanos qué cambio necesitas' });
  try {
    const p = await fetch(`${KH_URL}/rest/v1/cambios_viajero?viajero_id=eq.${viajero_id}&estado=eq.pendiente&select=id&limit=${MAX_PENDIENTES + 1}`, { headers: hKH });
    if (!p.ok) return json(502, headers, { ok: false, error: 'No pude registrar tu solicitud' });
    if ((await p.json()).length >= MAX_PENDIENTES) {
      return json(429, headers, { ok: false, error: 'Ya tienes solicitudes pendientes: el equipo te contacta por WhatsApp' });
    }
  } catch (e) { return json(502, headers, { ok: false, error: 'No pude registrar tu solicitud' }); }
  const fila = { viajero_id, evento_id: v.evento_id, correo, nombre: v.nombre || null, tipo, detalle };
  const r = await fetch(`${KH_URL}/rest/v1/cambios_viajero`, {
    method: 'POST',
    headers: Object.assign({}, hKH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(fila),
  });
  if (!r.ok) return json(502, headers, { ok: false, error: 'No pude registrar tu solicitud' });
  return json(200, headers, { ok: true, solicitud: 'pendiente' });
};
