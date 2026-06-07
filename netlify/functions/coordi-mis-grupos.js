// =============================================================================
// coordi-mis-grupos  (DC2a — cockpit del coordinador, LECTURA segura)
//
// Devuelve SOLO los viajeros de los eventos que el coordinador del JWT ACEPTÓ.
// Pieza de seguridad: un coordi NO debe ver viajeros de eventos ajenos.
//
// Cruza 2 bases (las lee por separado, NO las unifica):
//   - KH (Supabase Kamehouse): tabla eventos_coordi → qué eventos aceptó el
//     coordi (coordi_id sale del JWT, NUNCA del body).
//   - PORTAL (Supabase conecta-portal): solicitudes_tour + clientes → los
//     viajeros de cada evento aceptado. Misma lógica que admin-viajeros-evento.
//
// Devuelve por viajero SOLO logística (CERO dinero):
//   nombre_completo, talla_playera, celular, contacto_emergencia_nombre,
//   contacto_emergencia_telefono, contacto_emergencia_relacion, zona, paquete,
//   tipo_habitacion, comentarios (notas de la solicitud, si existe).
// NADA de total/abonado/restante/pagos/cobranza.
//
// Auth: Authorization: Bearer <JWT>. Rol 'coordinador' (operativo); maestro_roshi
// y bulma solo para previsualizar. El filtro de eventos lo decide el servidor a
// partir del coordi_id del JWT.
//
// Body JSON: {}  (no se acepta coordi_id/evento_id del body para el filtro).
//
// Env vars (reusa las existentes, sin vars nuevas):
//   - SUPABASE_URL_KAMEHOUSE (|| SUPABASE_URL), SUPABASE_SERVICE_KEY_KAMEHOUSE
//   - PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY
//   - JWT_SECRET (lo lee verifyAdminAuth)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

// Solo viajeros aprobados (igual que admin-viajeros-evento). 'pendiente' aún no
// está aprobado; 'cancelado' fuera.
const ESTADOS_VIAJERO = ['en_pagos', 'pagado'];

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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  // Rol operativo: coordinador. maestro_roshi/bulma solo para previsualizar.
  const auth = verifyAdminAuth(event, ['coordinador', 'maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  // SEGURIDAD: el coordi_id sale del JWT, no del body. El servidor decide la
  // lista de eventos (los aceptados de ESTE coordi). Nada del body filtra.
  const coordiId = auth.user && auth.user.id;
  if (!coordiId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JWT sin id de usuario' }) };
  }

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const khHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const portalHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // 1) KH: eventos que ESTE coordi aceptó. coordi_id viene del JWT.
    const ap = new URLSearchParams();
    ap.set('select', 'evento_id,indicaciones');
    ap.append('coordi_id', `eq.${coordiId}`);
    ap.append('status', 'eq.aceptado');
    ap.set('limit', '500');

    const asigUrl = `${env.KH_SB_URL}/rest/v1/eventos_coordi?${ap.toString()}`;
    const asigR = await fetch(asigUrl, { headers: khHeaders });
    if (!asigR.ok) {
      const detail = await asigR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta de asignaciones', detail }) };
    }
    const asigRaw = await asigR.json();

    // Dedupe por evento_id (por si hubiera filas repetidas); conserva la primera
    // indicacion no vacía.
    const asignaciones = [];
    const vistos = new Set();
    for (const a of (Array.isArray(asigRaw) ? asigRaw : [])) {
      const eid = typeof a.evento_id === 'string' ? a.evento_id.trim() : '';
      if (!eid || vistos.has(eid)) continue;
      vistos.add(eid);
      asignaciones.push({ evento_id: eid, indicaciones: a.indicaciones || null });
    }

    // Sin aceptados → lista vacía (no es error).
    if (!asignaciones.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, eventos: [] }) };
    }

    // 2) Por cada evento aceptado, traer sus viajeros del PORTAL (misma lógica
    //    que admin-viajeros-evento: prefijo en DB + match exacto en JS).
    const eventos = [];
    for (const asig of asignaciones) {
      const base = asig.evento_id;
      // El id base de EV es un slug; rechazamos cualquier cosa rara (defensa,
      // aunque el valor viene de KH, no del usuario).
      if (base.length > 80 || !/^[A-Za-z0-9_.\-]+$/.test(base)) {
        eventos.push({ evento_id: base, nombre: base, indicaciones: asig.indicaciones, viajeros: [] });
        continue;
      }

      const sp = new URLSearchParams();
      // select=* + embed clientes: reusamos lo que admin-viajeros-evento/​
      // admin-solicitudes-list ya usan. Leemos campos de dinero internamente
      // pero NO los devolvemos.
      sp.set('select', '*,clientes(nombre_completo,celular,talla_playera,contacto_emergencia_nombre,contacto_emergencia_telefono,contacto_emergencia_relacion)');
      sp.append('evento_id', `like.${base}*`);
      sp.append('estado', `in.(${ESTADOS_VIAJERO.join(',')})`);
      sp.set('order', 'created_at.desc');
      sp.set('limit', '1000');

      const solUrl = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?${sp.toString()}`;
      const solR = await fetch(solUrl, { headers: portalHeaders });
      if (!solR.ok) {
        const detail = await solR.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'PORTAL rechazó la consulta de viajeros', detail }) };
      }
      const solRaw = await solR.json();

      // Match EXACTO: === base o base + '#...' (multifecha). El '*' del like solo
      // acota; aquí filtramos para no traer slugs que comparten prefijo.
      const prefijoMf = base + '#';
      const solicitudes = (Array.isArray(solRaw) ? solRaw : [])
        .filter(s => s.evento_id === base || (typeof s.evento_id === 'string' && s.evento_id.startsWith(prefijoMf)));

      // Nombre del evento: lo tomamos del evento_nombre de la solicitud; si no
      // hay viajeros, caemos al evento_id.
      const nombre = (solicitudes.find(s => s.evento_nombre) || {}).evento_nombre || base;

      // 3) Armar viajeros SOLO con logística (cero dinero).
      const viajeros = solicitudes.map(s => {
        const c = s.clientes || {};
        return {
          nombre_completo:               c.nombre_completo || null,
          talla_playera:                 c.talla_playera || null,
          celular:                       c.celular || null,
          contacto_emergencia_nombre:    c.contacto_emergencia_nombre || null,
          contacto_emergencia_telefono:  c.contacto_emergencia_telefono || null,
          contacto_emergencia_relacion:  c.contacto_emergencia_relacion || null,
          zona:                          s.zona || null,
          paquete:                       s.paquete || null,
          tipo_habitacion:               s.tipo_habitacion || null,
          // 'notas' de la solicitud, si el modelo la tiene (select=* la trae).
          comentarios:                   (s.notas != null && s.notas !== '') ? s.notas : null,
        };
      });

      // Orden estable por nombre del viajero.
      viajeros.sort((a, b) =>
        String(a.nombre_completo || '').localeCompare(String(b.nombre_completo || ''), 'es'));

      eventos.push({
        evento_id:    base,
        nombre,
        indicaciones: asig.indicaciones,
        viajeros,
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, eventos }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error armando mis grupos', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_SB_URL      = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SB_SERVICE  = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars PORTAL (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE, PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
