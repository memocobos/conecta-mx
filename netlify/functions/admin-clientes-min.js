// =============================================================================
// admin-clientes-min  (S2 — selector de cliente para la pestaña Ingresos)
//
// Lista MÍNIMA de clientes { id, nombre_completo, celular } para poblar el select
// de cliente del modal de Ingresos (value = cliente_id uuid). admin-cobranza-list
// no devuelve el cliente_id crudo (trae clientes anidados por solicitud, sin id),
// así que esta función mínima lo resuelve directo de public.clientes.
//
// Body JSON: {} (sin filtros). Devuelve { ok, count, clientes:[{id,nombre_completo,celular}] }
//   ordenados por nombre_completo asc, límite razonable (2000).
//
// Seguridad: verifyAdminAuth(['maestro_roshi','bulma']) + corsCheck.
// service_role SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas.
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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma', 'milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    const sp = new URLSearchParams();
    sp.set('select', 'id,nombre_completo,celular');
    sp.set('order', 'nombre_completo.asc');
    sp.set('limit', '2000');

    const url = `${env.PORTAL_SB_URL}/rest/v1/clientes?${sp.toString()}`;
    const r = await fetch(url, { headers: sbHeaders });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de clientes', detail }) };
    }
    let clientes = await r.json();
    clientes = Array.isArray(clientes) ? clientes : [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, count: clientes.length, clientes }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando clientes', detail: e.message }) };
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
