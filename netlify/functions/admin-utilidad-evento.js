// =============================================================================
// admin-utilidad-evento  (Capa 3 del Palacio — utilidad POR EVENTO, LECTURA)
//
// Reúsa el read+stitch de admin-saldos (mismas 3 fuentes del PORTAL) pero acumula
// POR BASE de evento_id en vez de por cuenta. NO toca admin-saldos (saldos por
// cuenta intactos). Todo vive en PORTAL — NO cruza KH (la deuda a proveedores de
// KH es otra cosa y NO entra aquí).
//
// Por cada evento (base slug; multifecha "base#idx" suma en "base"):
//   cobrado    = pagos con estado='pagado' (caja real), monto = COALESCE(monto_pagado,monto).
//                Definido IGUAL que admin-saldos → una sola verdad de caja.
//   ingresos   = suma de la tabla `ingresos` del evento.
//   vendido    = facturado = suma de solicitudes_tour.precio_total ACTIVAS
//                (estado in en_pagos,pagado; mismo criterio que la vista de cobranza).
//   gastos     = suma de la tabla `gastos` del evento.
//   caja       = (cobrado + ingresos) − gastos
//   proyectado = (vendido + ingresos) − gastos
//   falta_por_cobrar = proyectado − caja   (= vendido − cobrado)
//
// `sin_evento` agrupa filas con evento_id null/vacío (o pagos cuya solicitud no se
// resuelve). `totales.caja_total_empresa` = suma de caja de todos + sin_evento, y
// reconcilia con el gran total de caja de admin-saldos (mismas fuentes, sin filtrar
// por cuenta).
//
// Body JSON: {} (sin parámetros). Respuesta:
//   { ok, generado_at,
//     eventos:{ "<baseSlug>": {cobrado,ingresos,vendido,gastos,caja,proyectado,falta_por_cobrar} },
//     sin_evento:{...mismos campos...},
//     totales:{ caja_total_empresa, proyectado_total, falta_total } }
//
// Seguridad: verifyAdminAuth(['maestro_roshi','bulma']) + corsCheck. service_role
// SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas, sin SQL nuevo.
//
// El read+stitch vive en `_lib/utilidad-evento` (fuente única, también usado por
// admin-liquidacion y admin-ventas-resumen); aquí solo se envuelve con auth y la
// misma respuesta de siempre.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { calcularUtilidadPorEvento } = require('./_lib/utilidad-evento');

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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  try {
    const r = await calcularUtilidadPorEvento({ portalUrl: env.PORTAL_SB_URL, portalService: env.PORTAL_SB_SERVICE });
    if (r.error) return { statusCode: 502, headers, body: JSON.stringify({ error: r.error, detail: r.detail }) };
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        generado_at: new Date().toISOString(),
        eventos: r.eventos,
        sin_evento: r.sin_evento,
        totales: r.totales,
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error calculando utilidad por evento', detail: e.message }) };
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
