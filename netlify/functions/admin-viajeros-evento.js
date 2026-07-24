// =============================================================================
// admin-viajeros-evento  (Capsule Corp sobre el portal — LECTURA)
//
// Devuelve los VIAJEROS de un evento = solicitudes_tour del Supabase NUEVO
// (conecta-portal) cuyo evento_id coincide con el id base de EV (index.html) o
// con su variante multifecha (base + '#<idx>'). Lo usa Kamehouse → Capsule Corp
// → sub-pestaña Viajeros / Rooming.
//
// Body JSON: { evento_id }   (id base de EV, ej. 'karolg')
//
// Solo cuenta como viajeros los estados 'en_pagos' y 'pagado' (los 'pendiente'
// aún no están aprobados; 'cancelado' fuera).
//
// Por cada viajero: datos del cliente (join a clientes), paquete, zona,
// num_personas, tipo_habitacion, estado, y resumen de pago calculado en la
// función leyendo `pagos`: total (precio_total), abonado (suma de pagos
// estado='pagado'), restante.
//
// Seguridad: mismo patrón que admin-solicitudes-list. Authorization:
// Bearer <JWT> validado por verifyAdminAuth(); roles maestro_roshi/bulma.
// service_role SOLO aquí (backend), nunca en el front. Solo lectura.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET. (Reusa las del portal — sin env vars nuevas.)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

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

  const auth = verifyAdminAuth(event, ['maestro_roshi','bulma','milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const base = typeof body.evento_id === 'string' ? body.evento_id.trim() : '';
  // El id base de EV es un slug; el '#' (multifecha) NO debe venir aquí.
  if (!base || base.length > 80 || !/^[A-Za-z0-9_.\-]+$/.test(base)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
  }

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Traer solicitudes cuyo evento_id empiece con el base (prefijo). Acotamos
    //    en DB con like.<base>* y luego hacemos match EXACTO en JS (=== base o
    //    base+'#...'), para no traer eventos que solo comparten prefijo
    //    (p.ej. 'karolg2') ni que el '_' de LIKE actúe como comodín.
    const sp = new URLSearchParams();
    sp.set('select', 'id,evento_id,evento_nombre,paquete,zona,num_personas,tipo_habitacion,estado,precio_total,monto_separo,clientes(id,nombre_completo,correo,celular,creado_por_admin,auth_user_id)');
    sp.append('evento_id', `like.${base}*`);
    sp.append('estado', `in.(${ESTADOS_VIAJERO.join(',')})`);
    sp.set('order', 'created_at.desc');
    sp.set('limit', '1000');

    const solUrl = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?${sp.toString()}`;
    const solR = await fetch(solUrl, { headers: sbHeaders });
    if (!solR.ok) {
      const detail = await solR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de solicitudes', detail }) };
    }
    const solRaw = await solR.json();
    const prefijoMf = base + '#';
    const solicitudes = (Array.isArray(solRaw) ? solRaw : [])
      .filter(s => s.evento_id === base || (typeof s.evento_id === 'string' && s.evento_id.startsWith(prefijoMf)));

    if (!solicitudes.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: 0, viajeros: [] }) };
    }

    // 2. Sumar lo abonado por solicitud en UNA sola query a pagos (estado=pagado).
    const ids = solicitudes.map(s => s.id);
    const abonadoPorSolicitud = {};
    const pp = new URLSearchParams();
    pp.set('select', 'solicitud_id,monto,monto_pagado,estado');
    pp.append('solicitud_id', `in.(${ids.join(',')})`);
    pp.append('estado', 'eq.pagado');
    pp.set('limit', '5000');

    const pagosUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?${pp.toString()}`;
    const pagosR = await fetch(pagosUrl, { headers: sbHeaders });
    if (!pagosR.ok) {
      const detail = await pagosR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de pagos', detail }) };
    }
    const pagos = await pagosR.json();
    for (const p of (Array.isArray(pagos) ? pagos : [])) {
      // monto REAL pagado: COALESCE(monto_pagado, monto) — pagos previos a la
      // Fase 3.2 tienen monto_pagado NULL y suman su monto del plan.
      const real = (p.monto_pagado == null) ? p.monto : p.monto_pagado;
      abonadoPorSolicitud[p.solicitud_id] = (abonadoPorSolicitud[p.solicitud_id] || 0) + Number(real || 0);
    }

    // 3. Armar los viajeros con su resumen de pago.
    const viajeros = solicitudes.map(s => {
      const total   = Number(s.precio_total || 0);
      const abonado = abonadoPorSolicitud[s.id] || 0;
      const restante = Math.max(0, total - abonado);
      return {
        id:              s.id,
        evento_id:       s.evento_id,
        evento_nombre:   s.evento_nombre,
        paquete:         s.paquete,
        zona:            s.zona,
        num_personas:    s.num_personas,
        tipo_habitacion: s.tipo_habitacion,
        estado:          s.estado,
        clientes:        s.clientes || {},
        pago:            { total, abonado, restante },
      };
    });
    // Orden estable por nombre del cliente para la tabla.
    viajeros.sort((a, b) =>
      String((a.clientes || {}).nombre_completo || '').localeCompare(String((b.clientes || {}).nombre_completo || ''), 'es'));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, count: viajeros.length, viajeros }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando viajeros', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
