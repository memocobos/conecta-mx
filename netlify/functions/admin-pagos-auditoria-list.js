// =============================================================================
// admin-pagos-auditoria-list  (Fase 2 — LECTURA del historial de cobranza)
//
// Devuelve la BITÁCORA de movimientos de pago de UNA solicitud (tabla
// `pagos_auditoria` del Supabase NUEVO conecta-portal), más reciente primero.
// La escriben los actos humanos de admin-marcar-pago (pagar/revertir). Lo usa
// Kamehouse → Solicitudes Portal → modal del plan de pagos, sección colapsable
// "Ver movimientos" (carga diferida, mismo patrón que admin-pagos-list).
//
// Body JSON: { solicitud_id: uuid }
//
// Seguridad: mismo patrón que admin-pagos-list. Authorization: Bearer <JWT>
// validado por verifyAdminAuth(); roles maestro_roshi/bulma. service_role SOLO
// aquí (backend), nunca en el front.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET. (Reusa las del portal — sin env vars nuevas.)
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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const solicitudId = body.solicitud_id;
  if (!solicitudId || !/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'solicitud_id inválido' }) };
  }

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // Embed pagos(numero_pago) por el FK pago_id→pagos(id). Más reciente primero.
    const url = `${env.PORTAL_SB_URL}/rest/v1/pagos_auditoria?solicitud_id=eq.${solicitudId}`
              + `&select=*,pagos(numero_pago)&order=creado_en.desc`;
    const r = await fetch(url, { headers: sbHeaders });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de auditoría', detail }) };
    }
    const rows = await r.json();
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, movimientos: Array.isArray(rows) ? rows : [] }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando auditoría', detail: e.message }) };
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
