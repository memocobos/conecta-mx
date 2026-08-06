// =============================================================================
// admin-solicitudes-list
//
// Devuelve la lista de solicitudes_tour del Supabase NUEVO (conecta-portal),
// con datos del cliente embebidos. Filtros opcionales: estado, evento_id,
// rango de fechas (ISO), search libre por nombre/correo/evento.
//
// Fase 2.2b — usado por la pestaña "Solicitudes Portal" de Kamehouse.
//
// Seguridad (Security Phase 2 — migrado a JWT):
//   - El frontend de kamehouse manda Authorization: Bearer <JWT> firmado por
//     auth-login.js (HS256). verifyAdminAuth() en _lib/verify-admin.js valida
//     firma + expiración + rol permitido.
//   - Si pasa, se consulta el Supabase NUEVO con service_role (bypass RLS).
//   - service_role nunca sale al cliente.
//
// Variables de entorno requeridas:
//   - PORTAL_SUPABASE_URL          (proyecto NUEVO conecta-portal)
//   - PORTAL_SUPABASE_SERVICE_KEY  (proyecto NUEVO conecta-portal)
//   - JWT_SECRET                   (compartido con auth-login.js)
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

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

  const params = new URLSearchParams();
  // con_pagos (aditivo, ADITIVO/gated): embebe las cuotas del plan para calcular
  // abonado/total en la lista SIN una llamada por fila. Lo usa el sub-tab "Pagos"
  // de Capsule Corp (T1). Sin el flag, el shape es idéntico al de siempre.
  // [CAP-FIX-2] EL EMBED VA CON SU FK NOMBRADO, y no es cosmético.
  //
  // Entre `solicitudes_tour` y `pagos` hay DOS relaciones:
  //   · pagos.solicitud_id → solicitudes_tour.id            (la que queremos)
  //   · solicitudes_tour.separo_aplicado_pago_id → pagos.id (la del separo, C2)
  // Con dos caminos posibles PostgREST no adivina: contesta 300 / PGRST201
  // ("Could not embed because more than one relationship was found") y la
  // función devolvía "Supabase rechazó la query". Eso es lo que tronaba en la
  // pestaña Pagos de Capsule — en TODOS los eventos, no solo en melanie, desde
  // que existe la columna del separo.
  // Verificado contra el Portal real: sin nombrar, HTTP 300; nombrado, HTTP 200.
  const selectPagos = body.con_pagos ? ',pagos!pagos_solicitud_id_fkey(monto,monto_pagado,estado)' : '';
  params.set('select', `*,clientes(numero_cliente,nombre_completo,correo,celular,talla_playera,contacto_emergencia_nombre,contacto_emergencia_telefono,contacto_emergencia_relacion)${selectPagos}`);
  params.set('order', 'created_at.desc');

  if (body.estado && ['pendiente','en_pagos','pagado','cancelado'].includes(body.estado)) {
    params.append('estado', `eq.${body.estado}`);
  }
  // evento_id: por defecto match exacto (eq). multifecha (aditivo/gated): un
  // festival guarda sus fechas como 'slug#N', así que unimos el slug base + todas
  // sus fechas con or=(eq,like slug%23*). Patrón calcado de admin-transporte /
  // admin-rooming-grupos. El or=(...) con %23 se pega CRUDO a la URL (no pasa por
  // URLSearchParams, que lo doble-encodearía). slugBase re-saneado (anti-inyección).
  let orEventoRaw = '';
  if (body.evento_id && typeof body.evento_id === 'string') {
    if (body.multifecha) {
      const slugBase = body.evento_id.split('#')[0];
      if (/^[a-z0-9_-]+$/.test(slugBase)) {
        orEventoRaw = `or=(evento_id.eq.${slugBase},evento_id.like.${slugBase}%23*)`;
      } else {
        // slug con caracteres raros: cae al match exacto (nunca inyecta al or=).
        params.append('evento_id', `eq.${body.evento_id}`);
      }
    } else {
      params.append('evento_id', `eq.${body.evento_id}`);
    }
  }
  if (body.desde) params.append('created_at', `gte.${body.desde}`);
  if (body.hasta) params.append('created_at', `lte.${body.hasta}`);

  // Hard cap defensivo. Si crece más allá, paginamos desde el frontend.
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 200, 1), 500);
  params.set('limit', String(limit));

  let solicitudes;
  try {
    const url = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?${params.toString()}${orEventoRaw ? '&' + orEventoRaw : ''}`;
    const r = await fetch(url, {
      headers: {
        apikey: env.PORTAL_SB_SERVICE,
        Authorization: `Bearer ${env.PORTAL_SB_SERVICE}`,
      },
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la query', detail }) };
    }
    solicitudes = await r.json();
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando Supabase', detail: e.message }) };
  }

  // Filtro de búsqueda libre en server (PostgREST no soporta OR multi-tabla simple).
  if (body.q && typeof body.q === 'string' && body.q.trim().length >= 2) {
    const q = body.q.trim().toLowerCase();
    solicitudes = solicitudes.filter((s) => {
      const c = s.clientes || {};
      return (
        (c.nombre_completo || '').toLowerCase().includes(q) ||
        (c.correo || '').toLowerCase().includes(q) ||
        (s.evento_nombre || '').toLowerCase().includes(q) ||
        String(c.numero_cliente || '').includes(q)
      );
    });
  }

  // con_contratos (aditivo/gated): por solicitud, { total, firmados } de sus
  // contratos vivos — para el contador "N/M firmados" del sub-tab Pagos (F3b).
  // Best-effort: si falla, las filas simplemente no traen `contratos`.
  if (body.con_contratos && solicitudes.length) {
    try {
      const ids = solicitudes.map((s) => s.id).filter(Boolean);
      const inS = ids.map(encodeURIComponent).join(',');
      const cr = await fetch(
        `${env.PORTAL_SB_URL}/rest/v1/contratos_viajeros?solicitud_id=in.(${inS})&estado=neq.anulado&select=solicitud_id,estado`,
        { headers: { apikey: env.PORTAL_SB_SERVICE, Authorization: `Bearer ${env.PORTAL_SB_SERVICE}` } }
      );
      if (cr.ok) {
        const cts = await cr.json();
        const acc = {};
        (Array.isArray(cts) ? cts : []).forEach((c) => {
          const a = (acc[c.solicitud_id] = acc[c.solicitud_id] || { total: 0, firmados: 0 });
          a.total++; if (c.estado === 'firmado') a.firmados++;
        });
        solicitudes.forEach((s) => { if (acc[s.id]) s.contratos = acc[s.id]; });
      }
    } catch (_) { /* best-effort */ }
  }

  // Contadores por estado sobre el resultado bruto (sin search), útil para el header.
  const contadores = { pendiente: 0, en_pagos: 0, pagado: 0, cancelado: 0 };
  for (const s of solicitudes) {
    if (contadores[s.estado] != null) contadores[s.estado]++;
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, count: solicitudes.length, contadores, solicitudes }),
  };
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
