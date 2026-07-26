// =============================================================================
// admin-cobranza-list  (Fase 3 — centro de cobranza, LECTURA)
//
// Lista los tours ACTIVOS del portal (solicitudes_tour en estado en_pagos/pagado)
// con su avance de cobranza, para la pestaña Pagos de Kamehouse. Es una vista
// global (sin evento fijo); admite filtros opcionales. La cobranza fina
// (marcar/revertir) sigue por admin-marcar-pago (flujo 2.3c) — aquí solo lectura.
//
// Body JSON (todo opcional): { evento_id?, estado?, nombre? }
//   - evento_id: id base de EV → matchea base exacto y base+'#' (multifecha).
//   - estado: 'en_pagos' | 'pagado' | 'cancelado'. Sin estado → in.(en_pagos,pagado).
//   - nombre: filtra por clientes.nombre_completo (case-insensitive, en JS).
//
// Por tour: cliente (nombre_completo, celular), total (precio_total), abonado
// (suma de pagos estado='pagado'), restante, y el próximo pago pendiente (la
// fecha_esperada más cercana entre pendiente/vencido) si existe.
//
// Seguridad: mismo patrón que admin-viajeros-evento. verifyAdminAuth(['maestro_roshi','bulma']).
// service_role SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const ESTADOS_FILTRO = ['en_pagos', 'pagado', 'cancelado'];
const ESTADOS_DEFAULT = ['en_pagos', 'pagado'];

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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi','bulma','milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  // ── Filtros ──────────────────────────────────────────────────────────────
  const base = (typeof body.evento_id === 'string' && body.evento_id.trim()) ? body.evento_id.trim() : '';
  if (base && (base.length > 80 || !/^[A-Za-z0-9_.\-]+$/.test(base))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
  }
  const estadoFiltro = (typeof body.estado === 'string' && ESTADOS_FILTRO.includes(body.estado)) ? body.estado : '';
  const nombreQ = (typeof body.nombre === 'string') ? body.nombre.trim().toLowerCase() : '';

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Solicitudes activas (o el estado filtrado).
    const sp = new URLSearchParams();
    sp.set('select', 'id,evento_id,evento_nombre,paquete,zona,num_personas,estado,precio_total,created_at,clientes(nombre_completo,celular,creado_por_admin,auth_user_id)');
    if (estadoFiltro) sp.append('estado', `eq.${estadoFiltro}`);
    else              sp.append('estado', `in.(${ESTADOS_DEFAULT.join(',')})`);
    if (base) sp.append('evento_id', `like.${base}*`);  // acota; el match exacto va en JS
    sp.set('order', 'created_at.desc');
    sp.set('limit', '300');

    const solUrl = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?${sp.toString()}`;
    const solR = await fetch(solUrl, { headers: sbHeaders });
    if (!solR.ok) {
      const detail = await solR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de solicitudes', detail }) };
    }
    let solicitudes = await solR.json();
    solicitudes = Array.isArray(solicitudes) ? solicitudes : [];

    // Match EXACTO del evento base / multifecha (evita 'karolg2' por prefijo).
    if (base) {
      const prefijoMf = base + '#';
      solicitudes = solicitudes.filter(s => s.evento_id === base || (typeof s.evento_id === 'string' && s.evento_id.startsWith(prefijoMf)));
    }
    // Filtro por nombre del cliente (en JS, como admin-solicitudes-list).
    if (nombreQ.length >= 2) {
      solicitudes = solicitudes.filter(s => String((s.clientes || {}).nombre_completo || '').toLowerCase().includes(nombreQ));
    }

    if (!solicitudes.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: 0, tours: [] }) };
    }

    // 2. Todos los pagos de esas solicitudes en UNA query.
    const ids = solicitudes.map(s => s.id);
    const pp = new URLSearchParams();
    pp.set('select', 'solicitud_id,numero_pago,concepto,monto,monto_pagado,estado,fecha_esperada');
    pp.append('solicitud_id', `in.(${ids.join(',')})`);
    pp.set('limit', '5000');

    const pagosUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?${pp.toString()}`;
    const pagosR = await fetch(pagosUrl, { headers: sbHeaders });
    if (!pagosR.ok) {
      const detail = await pagosR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de pagos', detail }) };
    }
    const pagos = await pagosR.json();

    // Agregar por solicitud: abonado + próximo pendiente (fecha más cercana).
    const abonadoPor = {};
    const proximoPor = {};
    const vencidosPor = {};
    for (const p of (Array.isArray(pagos) ? pagos : [])) {
      if (p.estado === 'vencido') {
        vencidosPor[p.solicitud_id] = (vencidosPor[p.solicitud_id] || 0) + 1;
      }
      if (p.estado === 'pagado') {
        // monto REAL pagado: COALESCE(monto_pagado, monto) — los pagos previos
        // a la Fase 3.2 tienen monto_pagado NULL y suman su monto del plan.
        const real = (p.monto_pagado == null) ? p.monto : p.monto_pagado;
        abonadoPor[p.solicitud_id] = (abonadoPor[p.solicitud_id] || 0) + Number(real || 0);
      } else if (p.estado === 'pendiente' || p.estado === 'vencido') {
        const prev = proximoPor[p.solicitud_id];
        if (!prev || String(p.fecha_esperada || '') < String(prev.fecha_esperada || '')) {
          proximoPor[p.solicitud_id] = {
            numero_pago: p.numero_pago,
            concepto: p.concepto,
            monto: Number(p.monto || 0),
            fecha_esperada: p.fecha_esperada,
          };
        }
      }
    }

    // 3. Armar los tours.
    const tours = solicitudes.map(s => {
      const total = Number(s.precio_total || 0);
      const abonado = abonadoPor[s.id] || 0;
      const restante = Math.max(0, total - abonado);
      return {
        id:            s.id,
        evento_id:     s.evento_id,
        evento_nombre: s.evento_nombre,
        paquete:       s.paquete,
        zona:          s.zona,
        num_personas:  s.num_personas,
        estado:        s.estado,
        created_at:    s.created_at,
        clientes:      s.clientes || {},
        pago:          { total, abonado, restante, proximo: proximoPor[s.id] || null, vencidos: vencidosPor[s.id] || 0 },
      };
    });

    // Orden: por próximo pago pendiente asc (los que deben antes, primero);
    // los ya liquidados (sin próximo) al final; desempate por created_at desc.
    tours.sort((a, b) => {
      const fa = (a.pago.proximo && a.pago.proximo.fecha_esperada) || '9999-12-31';
      const fb = (b.pago.proximo && b.pago.proximo.fecha_esperada) || '9999-12-31';
      if (fa !== fb) return fa < fb ? -1 : 1;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, count: tours.length, tours }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando cobranza', detail: e.message }) };
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
