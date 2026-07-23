// =============================================================================
// _lib/utilidad-evento.js — Utilidad REAL por evento (CAJA), fuente única.
//
// Extracción FIEL del núcleo de `admin-utilidad-evento` (que ahora consume este
// lib y devuelve exactamente la misma respuesta — byte-equivalente). También lo
// usan `admin-liquidacion` (la comisión 30% sale de la CAJA real, no de la vista
// muerta `resumen_eventos`) y `admin-ventas-resumen` (dashboard de finanzas).
//
// TODO vive en PORTAL (pagos/ingresos/gastos/solicitudes_tour). NO cruza KH: la
// deuda a proveedores de KH es otra cosa y NO entra aquí. Fail-closed: si alguna
// de las 3 fuentes falla, devuelve { error, detail } y el caller responde 502
// (jamás utilidades a medias).
//
// Por cada evento (base slug; multifecha "base#idx" suma en "base"):
//   cobrado    = pagos con estado='pagado' (caja real), monto = COALESCE(monto_pagado,monto).
//   ingresos   = suma de la tabla `ingresos` del evento.
//   vendido    = facturado = suma de solicitudes_tour.precio_total ACTIVAS (en_pagos,pagado).
//   gastos     = suma de la tabla `gastos` del evento.
//   caja       = (cobrado + ingresos) − gastos           ← la UTILIDAD real (Memo)
//   proyectado = (vendido + ingresos) − gastos
//   falta_por_cobrar = proyectado − caja   (= vendido − cobrado)
//
// calcularUtilidadPorEvento({ portalUrl, portalService, fetchImpl? })
//   → { eventos:{ "<baseSlug>": {cobrado,ingresos,vendido,gastos,caja,proyectado,falta_por_cobrar} },
//       sin_evento:{...mismos campos...},
//       totales:{ caja_total_empresa, proyectado_total, falta_total } }
//   | { error, detail }
// =============================================================================

const SIN = '__sin_evento__';

// base del evento_id: "karolg#2" → "karolg"; null/'' → '' (sin evento).
function baseSlug(evId) {
  return (evId == null) ? '' : String(evId).split('#')[0].trim();
}

async function calcularUtilidadPorEvento({ portalUrl, portalService, fetchImpl }) {
  const _fetch = fetchImpl || fetch;
  const sbHeaders = {
    apikey: portalService,
    Authorization: 'Bearer ' + portalService,
    'Content-Type': 'application/json',
  };

  // Lee una tabla del PORTAL; fail-closed (no utilidades a medias). { data } | { error, detail }.
  async function leer(tabla, query) {
    try {
      const r = await _fetch(`${portalUrl}/rest/v1/${tabla}?${query}`, { headers: sbHeaders });
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

  // 1) Solicitudes ACTIVAS → vendido (precio_total) + map solicitud→evento.
  const solRes = await leer('solicitudes_tour', 'estado=in.(en_pagos,pagado)&select=id,evento_id,precio_total&limit=10000');
  if (solRes.error) return { error: solRes.error, detail: solRes.detail };
  const solActivas = solRes.data;
  const solEvento = {};  // solicitud_id -> evento_id (crudo)
  solActivas.forEach(s => { solEvento[s.id] = s.evento_id; });

  // 2) Pagos COBRADOS (estado='pagado').
  const pagosRes = await leer('pagos', 'estado=eq.pagado&select=solicitud_id,monto,monto_pagado&limit=20000');
  if (pagosRes.error) return { error: pagosRes.error, detail: pagosRes.detail };
  const pagos = pagosRes.data;

  // 3) Solicitudes de pagos cobrados que NO son activas (p.ej. canceladas): se
  //    resuelve su evento para que la caja cuadre con admin-saldos (que cuenta
  //    TODOS los pagos pagados). Sin esto, irían a sin_evento.
  const faltanIds = [...new Set(pagos.map(p => p.solicitud_id).filter(id => id && !(id in solEvento)))];
  if (faltanIds.length) {
    const extraRes = await leer('solicitudes_tour', `id=in.(${faltanIds.join(',')})&select=id,evento_id&limit=20000`);
    if (extraRes.error) return { error: extraRes.error, detail: extraRes.detail };
    extraRes.data.forEach(s => { solEvento[s.id] = s.evento_id; });
  }

  // 4) Ingresos sueltos.
  const ingRes = await leer('ingresos', 'select=monto,evento_id&limit=10000');
  if (ingRes.error) return { error: ingRes.error, detail: ingRes.detail };

  // 5) Gastos.
  const gasRes = await leer('gastos', 'select=monto,evento_id&limit=10000');
  if (gasRes.error) return { error: gasRes.error, detail: gasRes.detail };

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
    eventos,
    sin_evento,
    totales: { caja_total_empresa, proyectado_total, falta_total },
  };
}

module.exports = { calcularUtilidadPorEvento, baseSlug };
