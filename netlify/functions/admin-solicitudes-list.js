// =============================================================================
// admin-solicitudes-list
//
// Devuelve la lista de solicitudes_tour del Supabase NUEVO (conecta-portal),
// con datos del cliente embebidos. Filtros opcionales: estado, evento_id,
// rango de fechas (ISO), search libre por nombre/correo/evento.
//
// Fase 2.2b — usado por la pestaña "Solicitudes Portal" de Kamehouse.
//
// Seguridad:
//   - El frontend de kamehouse manda x-kh-user-id + x-kh-correo en headers.
//   - Validamos contra la tabla usuarios del Supabase VIEJO con anon key,
//     exigiendo activo=true y rol ∈ {maestro_roshi, bulma}.
//   - Si pasa, se consulta el Supabase NUEVO con service_role (bypass RLS).
//   - service_role nunca sale al cliente.
//
// Variables de entorno requeridas:
//   - PORTAL_SUPABASE_URL          (proyecto NUEVO conecta-portal)
//   - PORTAL_SUPABASE_SERVICE_KEY  (proyecto NUEVO conecta-portal)
//   - KH_SUPABASE_URL              (proyecto VIEJO de kamehouse — para validar admin)
//   - KH_SUPABASE_ANON_KEY         (proyecto VIEJO de kamehouse — anon basta)
// =============================================================================

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-kh-user-id, x-kh-correo',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const admin = await verificarAdminKh(event.headers, env);
  if (admin.error) return { statusCode: admin.status, headers, body: JSON.stringify({ error: admin.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const params = new URLSearchParams();
  params.set('select', '*,clientes(numero_cliente,nombre_completo,correo,celular,talla_playera,contacto_emergencia_nombre,contacto_emergencia_telefono,contacto_emergencia_relacion)');
  params.set('order', 'created_at.desc');

  if (body.estado && ['pendiente','en_pagos','pagado','cancelado'].includes(body.estado)) {
    params.append('estado', `eq.${body.estado}`);
  }
  if (body.evento_id && typeof body.evento_id === 'string') {
    params.append('evento_id', `eq.${body.evento_id}`);
  }
  if (body.desde) params.append('created_at', `gte.${body.desde}`);
  if (body.hasta) params.append('created_at', `lte.${body.hasta}`);

  // Hard cap defensivo. Si crece más allá, paginamos desde el frontend.
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 200, 1), 500);
  params.set('limit', String(limit));

  let solicitudes;
  try {
    const url = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?${params.toString()}`;
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
  const KH_SB_URL         = process.env.KH_SUPABASE_URL;
  const KH_SB_ANON        = process.env.KH_SUPABASE_ANON_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE || !KH_SB_URL || !KH_SB_ANON) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY, KH_SUPABASE_URL/ANON_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE, KH_SB_URL, KH_SB_ANON };
}

async function verificarAdminKh(reqHeaders, env) {
  const h = lower(reqHeaders);
  const userId = h['x-kh-user-id'];
  const correo = (h['x-kh-correo'] || '').toLowerCase();
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId) || !correo) {
    return { error: 'Faltan headers x-kh-user-id / x-kh-correo', status: 401 };
  }
  const url = `${env.KH_SB_URL}/rest/v1/usuarios?id=eq.${userId}&correo=eq.${encodeURIComponent(correo)}&activo=eq.true&select=id,correo,rol&limit=1`;
  let arr;
  try {
    const r = await fetch(url, { headers: { apikey: env.KH_SB_ANON, Authorization: `Bearer ${env.KH_SB_ANON}` } });
    if (!r.ok) return { error: 'No se pudo validar admin contra Kamehouse', status: 502 };
    arr = await r.json();
  } catch (e) {
    return { error: 'Error de red validando admin', status: 502 };
  }
  const u = Array.isArray(arr) ? arr[0] : null;
  if (!u) return { error: 'Usuario no encontrado o inactivo', status: 401 };
  if (!['maestro_roshi','bulma'].includes(u.rol)) {
    return { error: 'Rol sin permiso para Solicitudes Portal', status: 403 };
  }
  return { admin: u };
}

function lower(obj) {
  const out = {};
  for (const k in obj || {}) out[k.toLowerCase()] = obj[k];
  return out;
}
