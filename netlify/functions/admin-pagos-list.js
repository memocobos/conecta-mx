// =============================================================================
// admin-pagos-list  (Fase 2.3c — LECTURA)
//
// Devuelve el plan de pagos de UNA solicitud (tabla `pagos` del Supabase NUEVO
// conecta-portal), ordenado por numero_pago. Lo usa Kamehouse → Solicitudes
// Portal → modal de detalle, sección "Plan de pagos" (carga diferida, mismo
// patrón que admin-solicitud-comprobante).
//
// Body JSON: { solicitud_id: uuid }
//
// Seguridad: mismo patrón que admin-generar-plan-pagos / update-estado.
// Authorization: Bearer <JWT> validado por verifyAdminAuth(); roles
// maestro_roshi/bulma. service_role SOLO aquí (backend), nunca en el front.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET. (Reusa las del portal — sin env vars nuevas.)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

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

  const auth = verifyAdminAuth(event, ['maestro_roshi','bulma']);
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
    const url = `${env.PORTAL_SB_URL}/rest/v1/pagos?solicitud_id=eq.${solicitudId}&select=*&order=numero_pago.asc`;
    const r = await fetch(url, { headers: sbHeaders });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de pagos', detail }) };
    }
    const pagos = await r.json();

    // Lugares de la solicitud (F3-t4b): la UI agrupa el plan por lugar y necesita
    // numero/nombre/cliente_id para los sub-encabezados. Best-effort: si falla,
    // se devuelve lugares:[] SIN romper la respuesta de pagos (planes grupales
    // viejos no traen lugar_id y simplemente ignoran esto).
    let lugares = [];
    try {
      const lr = await fetch(
        `${env.PORTAL_SB_URL}/rest/v1/lugares?solicitud_id=eq.${solicitudId}&select=id,numero,nombre,cliente_id,estado,paquete,boleto_entregado_at&order=numero.asc`,
        { headers: sbHeaders }
      );
      if (lr.ok) {
        const arr = await lr.json();
        if (Array.isArray(arr)) lugares = arr;
      }
    } catch (_) { /* best-effort: la UI degrada a sin-etiquetas */ }

    // [F3b] Contrato vivo por lugar: { estado, token }. Bulma es admin → el token
    // SÍ viaja (para "copiar link de firma"). Best-effort: si falla, los lugares
    // quedan sin `contrato` y la UI no pinta chips (solicitudes viejas pre-módulo).
    try {
      const ids = lugares.map(l => l.id).filter(Boolean);
      if (ids.length) {
        const inLug = ids.map(encodeURIComponent).join(',');
        const cr = await fetch(
          `${env.PORTAL_SB_URL}/rest/v1/contratos_viajeros?lugar_id=in.(${inLug})&estado=neq.anulado&select=lugar_id,estado,token`,
          { headers: sbHeaders }
        );
        if (cr.ok) {
          const cts = await cr.json();
          const byLug = {};
          (Array.isArray(cts) ? cts : []).forEach(c => { byLug[c.lugar_id] = { estado: c.estado, token: c.token }; });
          lugares.forEach(l => { if (byLug[l.id]) l.contrato = byLug[l.id]; });
        }
      }
    } catch (_) { /* best-effort */ }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, pagos: Array.isArray(pagos) ? pagos : [], lugares }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando pagos', detail: e.message }) };
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
