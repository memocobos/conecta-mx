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
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const SIN = '__sin_evento__';

// base del evento_id: "karolg#2" → "karolg"; null/'' → '' (sin evento).
function baseSlug(evId) {
  return (evId == null) ? '' : String(evId).split('#')[0].trim();
}

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

  const auth = verifyAdminAuth(event, ['maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  // Lee una tabla del PORTAL; fail-closed (no utilidades a medias). { data } | { error, detail }.
  async function leer(tabla, query) {
    try {
      const r = await fetch(`${env.PORTAL_SB_URL}/rest/v1/${tabla}?${query}`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { error: `Supabase rechazó la consulta de ${tabla}`, detail };
      }
      const data = await r.json();
      return { data: Array.isArray(data) ? data : [] };
    } catch (e) {
      return { error: `Error consultando ${tabla}`, detail: e.message };
    }
  }

  try {
    // 1) Solicitudes ACTIVAS → vendido (precio_total) + map solicitud→evento.
    const solRes = await leer('solicitudes_tour', 'estado=in.(en_pagos,pagado)&select=id,evento_id,precio_total&limit=10000');
    if (solRes.error) return { statusCode: 502, headers, body: JSON.stringify({ error: solRes.error, detail: solRes.detail }) };
    const solActivas = solRes.data;
    const solEvento = {};  // solicitud_id -> evento_id (crudo)
    solActivas.forEach(s => { solEvento[s.id] = s.evento_id; });

    // 2) Pagos COBRADOS (estado='pagado').
    const pagosRes = await leer('pagos', 'estado=eq.pagado&select=solicitud_id,monto,monto_pagado&limit=20000');
    if (pagosRes.error) return { statusCode: 502, headers, body: JSON.stringify({ error: pagosRes.error, detail: pagosRes.detail }) };
    const pagos = pagosRes.data;

    // 3) Solicitudes de pagos cobrados que NO son activas (p.ej. canceladas): se
    //    resuelve su evento para que la caja cuadre con admin-saldos (que cuenta
    //    TODOS los pagos pagados). Sin esto, irían a sin_evento.
    const faltanIds = [...new Set(pagos.map(p => p.solicitud_id).filter(id => id && !(id in solEvento)))];
    if (faltanIds.length) {
      const extraRes = await leer('solicitudes_tour', `id=in.(${faltanIds.join(',')})&select=id,evento_id&limit=20000`);
      if (extraRes.error) return { statusCode: 502, headers, body: JSON.stringify({ error: extraRes.error, detail: extraRes.detail }) };
      extraRes.data.forEach(s => { solEvento[s.id] = s.evento_id; });
    }

    // 4) Ingresos sueltos.
    const ingRes = await leer('ingresos', 'select=monto,evento_id&limit=10000');
    if (ingRes.error) return { statusCode: 502, headers, body: JSON.stringify({ error: ingRes.error, detail: ingRes.detail }) };

    // 5) Gastos.
    const gasRes = await leer('gastos', 'select=monto,evento_id&limit=10000');
    if (gasRes.error) return { statusCode: 502, headers, body: JSON.stringify({ error: gasRes.error, detail: gasRes.detail }) };

    // Acumular por base de evento.
    const acc = {};  // base -> { cobrado, ingresos, vendido, gastos }
    const bucket = (base) => {
      const k = base || SIN;
      return (acc[k] = acc[k] || { cobrado: 0, ingresos: 0, vendido: 0, gastos: 0 });
    };

    solActivas.forEach(s => { bucket(baseSlug(s.evento_id)).vendido += Number(s.precio_total || 0); });

    pagos.forEach(p => {
      const real = (p.monto_pagado == null) ? Number(p.monto || 0) : Number(p.monto_pagado || 0);
      bucket(baseSlug(solEvento[p.solicitud_id])).cobrado += real;
    });

    ingRes.data.forEach(i => { bucket(baseSlug(i.evento_id)).ingresos += Number(i.monto || 0); });
    gasRes.data.forEach(g => { bucket(baseSlug(g.evento_id)).gastos += Number(g.monto || 0); });

    // Derivar campos calculados y separar sin_evento + totales de empresa.
    const eventos = {};
    let sin_evento = { cobrado: 0, ingresos: 0, vendido: 0, gastos: 0, caja: 0, proyectado: 0, falta_por_cobrar: 0 };
    let caja_total_empresa = 0, proyectado_total = 0, falta_total = 0;

    Object.keys(acc).forEach(k => {
      const a = acc[k];
      const caja = (a.cobrado + a.ingresos) - a.gastos;
      const proyectado = (a.vendido + a.ingresos) - a.gastos;
      const falta_por_cobrar = proyectado - caja;  // = vendido − cobrado
      const obj = {
        cobrado: a.cobrado, ingresos: a.ingresos, vendido: a.vendido, gastos: a.gastos,
        caja, proyectado, falta_por_cobrar,
      };
      caja_total_empresa += caja;
      proyectado_total += proyectado;
      falta_total += falta_por_cobrar;
      if (k === SIN) sin_evento = obj;
      else eventos[k] = obj;
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        generado_at: new Date().toISOString(),
        eventos,
        sin_evento,
        totales: { caja_total_empresa, proyectado_total, falta_total },
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
