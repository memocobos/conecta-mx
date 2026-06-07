// =============================================================================
// admin-saldos  (S3 — visor de saldos por cuenta, LECTURA)
//
// Suma lo YA capturado agrupado por cuenta y devuelve el saldo que DEBERÍA haber
// en cada una. NO hay migración: solo LEE las tablas del PORTAL.
//
//   ENTRADAS = pagos COBRADOS (pagos.estado='pagado', monto real =
//              COALESCE(monto_pagado, monto)) + ingresos sueltos (tabla ingresos)
//   SALIDAS  = gastos (tabla gastos)
//   saldo por cuenta = entradas − salidas
//
// Solo se muestran 3 cuentas: BBVA, Banamex, Efectivo. Filas con cuenta 'Otro' o
// null se IGNORAN en las tarjetas pero su neto se acumula en `otros_total` para
// un pie de nota honesto. Solo cuentan los pagos en estado 'pagado'.
//
// El portal consulta SIN embeds: pagos, solicitudes_tour y clientes se leen por
// separado y se hace el stitch en JS (igual criterio que admin-cobranza-list).
//
// Body JSON: {} (sin parámetros).
// Respuesta: { ok, generado_at, cuentas:{ BBVA:{...}, Banamex:{...}, Efectivo:{...} }, otros_total }
//   Cada cuenta: { entradas_pagos, entradas_ingresos, salidas_gastos, entradas,
//                  salidas, saldo, pagos:[...], ingresos:[...], gastos:[...] }
//
// Seguridad: verifyAdminAuth(['maestro_roshi','bulma']) + corsCheck.
// service_role SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const CUENTAS = ['BBVA', 'Banamex', 'Efectivo'];

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

  // Lee una tabla del PORTAL y devuelve el array; si falla, error claro (no saldos
  // a medias). Devuelve { data } o { error, detail }.
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
    // 1) Pagos COBRADOS.
    const pagosRes = await leer('pagos', 'estado=eq.pagado&select=id,cuenta,monto,monto_pagado,fecha_pagada,solicitud_id,cliente_id&limit=5000');
    if (pagosRes.error) return { statusCode: 502, headers, body: JSON.stringify({ error: pagosRes.error, detail: pagosRes.detail }) };
    const pagos = pagosRes.data;

    // 2) Stitch de etiquetas (sin embeds): solicitud_id → evento_nombre/cliente_id,
    //    y luego cliente_id → nombre_completo.
    const solIds = [...new Set(pagos.map(p => p.solicitud_id).filter(Boolean))];
    const solMap = {};   // solicitud_id -> { evento_nombre, cliente_id }
    if (solIds.length) {
      const solRes = await leer('solicitudes_tour', `id=in.(${solIds.join(',')})&select=id,evento_nombre,cliente_id&limit=5000`);
      if (solRes.error) return { statusCode: 502, headers, body: JSON.stringify({ error: solRes.error, detail: solRes.detail }) };
      solRes.data.forEach(s => { solMap[s.id] = { evento_nombre: s.evento_nombre, cliente_id: s.cliente_id }; });
    }

    // 3) Ingresos sueltos.
    const ingresosRes = await leer('ingresos', 'select=id,cuenta,monto,concepto,fecha,cliente_id,evento_id&limit=5000');
    if (ingresosRes.error) return { statusCode: 502, headers, body: JSON.stringify({ error: ingresosRes.error, detail: ingresosRes.detail }) };
    const ingresos = ingresosRes.data;

    // 4) Gastos.
    const gastosRes = await leer('gastos', 'select=id,cuenta,monto,concepto,fecha,evento_id&limit=5000');
    if (gastosRes.error) return { statusCode: 502, headers, body: JSON.stringify({ error: gastosRes.error, detail: gastosRes.detail }) };
    const gastos = gastosRes.data;

    // Clientes a resolver: los de los pagos (vía solicitud) + los de ingresos.
    const cliIds = new Set();
    Object.values(solMap).forEach(s => { if (s.cliente_id) cliIds.add(s.cliente_id); });
    ingresos.forEach(i => { if (i.cliente_id) cliIds.add(i.cliente_id); });
    const cliMap = {};   // cliente_id -> nombre_completo
    if (cliIds.size) {
      const cliRes = await leer('clientes', `id=in.(${[...cliIds].join(',')})&select=id,nombre_completo&limit=5000`);
      if (cliRes.error) return { statusCode: 502, headers, body: JSON.stringify({ error: cliRes.error, detail: cliRes.detail }) };
      cliRes.data.forEach(c => { cliMap[c.id] = c.nombre_completo; });
    }

    // Acumuladores por cuenta (solo las 3 visibles).
    const acc = {};
    CUENTAS.forEach(c => {
      acc[c] = { entradas_pagos: 0, entradas_ingresos: 0, salidas_gastos: 0, pagos: [], ingresos: [], gastos: [] };
    });
    let otrosTotal = 0;

    // Pagos: monto real = COALESCE(monto_pagado, monto).
    for (const p of pagos) {
      const real = (p.monto_pagado == null) ? Number(p.monto || 0) : Number(p.monto_pagado || 0);
      const cuenta = p.cuenta;
      if (CUENTAS.includes(cuenta)) {
        acc[cuenta].entradas_pagos += real;
        const sol = solMap[p.solicitud_id] || {};
        acc[cuenta].pagos.push({
          fecha:   p.fecha_pagada || null,
          cliente: (sol.cliente_id && cliMap[sol.cliente_id]) || null,
          evento:  sol.evento_nombre || null,
          monto:   real,
        });
      } else {
        otrosTotal += real;
      }
    }

    // Ingresos: suma positiva.
    for (const i of ingresos) {
      const monto = Number(i.monto || 0);
      const cuenta = i.cuenta;
      if (CUENTAS.includes(cuenta)) {
        acc[cuenta].entradas_ingresos += monto;
        acc[cuenta].ingresos.push({
          fecha:    i.fecha || null,
          concepto: i.concepto || null,
          cliente:  (i.cliente_id && cliMap[i.cliente_id]) || null,
          evento:   i.evento_id || null,
          monto,
        });
      } else {
        otrosTotal += monto;
      }
    }

    // Gastos: salida (resta del neto de "otros" cuando aplica).
    for (const g of gastos) {
      const monto = Number(g.monto || 0);
      const cuenta = g.cuenta;
      if (CUENTAS.includes(cuenta)) {
        acc[cuenta].salidas_gastos += monto;
        acc[cuenta].gastos.push({
          fecha:    g.fecha || null,
          concepto: g.concepto || null,
          evento:   g.evento_id || null,
          monto,
        });
      } else {
        otrosTotal -= monto;
      }
    }

    // Arma la respuesta por cuenta con totales derivados.
    const cuentas = {};
    CUENTAS.forEach(c => {
      const a = acc[c];
      const entradas = a.entradas_pagos + a.entradas_ingresos;
      const salidas = a.salidas_gastos;
      cuentas[c] = {
        entradas_pagos:    a.entradas_pagos,
        entradas_ingresos: a.entradas_ingresos,
        salidas_gastos:    a.salidas_gastos,
        entradas,
        salidas,
        saldo: entradas - salidas,
        pagos:    a.pagos,
        ingresos: a.ingresos,
        gastos:   a.gastos,
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        generado_at: new Date().toISOString(),
        cuentas,
        otros_total: otrosTotal,
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error calculando saldos', detail: e.message }) };
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
