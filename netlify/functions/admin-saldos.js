// =============================================================================
// admin-saldos  (S3 — visor de saldos por cuenta, LECTURA)
//
// Suma lo YA capturado agrupado por cuenta y devuelve el saldo que DEBERÍA haber
// en cada una. NO hay migración: solo LEE las tablas del PORTAL.
//
//   ENTRADAS = pagos COBRADOS (pagos.estado='pagado', monto real =
//              COALESCE(monto_pagado, monto)) + ingresos sueltos (tabla ingresos)
//              + [SAL-1] lo COBRADO A LOS MIGRADOS del Excel (KH), repartido por
//                cuenta con la regla paquete→banco de `_lib/catalogo-index`
//   SALIDAS  = gastos (tabla gastos)
//   saldo por cuenta = entradas − salidas
//
// [SAL-1] Antes esto solo miraba el Portal, y con melanie eso dejaba a BBVA en
// −$147,172: los gastos del evento sin una sola entrada, porque su dinero entró
// por fuera del Portal. No era un cálculo equivocado, era media pregunta.
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

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
// [SAL-1] El dinero migrado, repartido por cuenta en la fuente única.
const { migradosPorCuenta } = require('./_lib/cuenta-evento');
const { fetchCatalogo } = require('./_lib/catalogo-index');

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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma', 'milk']);
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

    // [SAL-1] EL DINERO MIGRADO — la mitad que faltaba de la pregunta.
    //
    // Fails-soft a propósito (mismo criterio que la cuenta de AUD-1c en
    // admin-utilidad-evento): si esto truena, Saldos sigue devolviendo lo del
    // Portal y la pantalla lo DICE, en vez de quedarse en blanco. Lo que NO se
    // hace es callarlo: un saldo incompleto que se presenta como completo es
    // exactamente el bug que esta tuerca vino a arreglar.
    let migrados = null, migradosError = null;
    try {
      const envKH = readEnvKH();
      if (envKH.error) {
        migradosError = envKH.error;
      } else {
        const catalogo = await fetchCatalogo();
        const m = await migradosPorCuenta({
          khUrl: envKH.KH_SB_URL, khService: envKH.KH_SB_SERVICE,
          catalogo, rol: (auth.user || {}).rol,
        });
        if (m.error) migradosError = m.error; else migrados = m;
      }
    } catch (e) { migradosError = e.message; }

    // Acumuladores por cuenta (solo las 3 visibles).
    const acc = {};
    CUENTAS.forEach(c => {
      acc[c] = { entradas_pagos: 0, entradas_ingresos: 0, entradas_migrados: 0, salidas_gastos: 0, pagos: [], ingresos: [], gastos: [] };
    });
    let otrosTotal = 0;

    // Las entradas migradas por cuenta. Una cubeta que no sea de las 3 visibles
    // NO se manda a `otros_total`: `migradosPorCuenta` solo devuelve cubetas
    // conocidas, y lo que no pudo clasificar viaja aparte y rotulado.
    if (migrados && migrados.por_cuenta) {
      Object.keys(migrados.por_cuenta).forEach((c) => {
        if (CUENTAS.includes(c)) acc[c].entradas_migrados += Number(migrados.por_cuenta[c] || 0);
      });
    }

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
      const entradas = a.entradas_pagos + a.entradas_ingresos + a.entradas_migrados;
      const salidas = a.salidas_gastos;
      cuentas[c] = {
        entradas_pagos:    a.entradas_pagos,
        entradas_ingresos: a.entradas_ingresos,
        entradas_migrados: a.entradas_migrados,
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
        // [SAL-1] Lo migrado, con su desglose y lo que NO se pudo clasificar. Va
        // aparte de `cuentas` para que la pantalla pueda decir de dónde salió
        // cada peso — y para que `sin_clasificar` tenga dónde verse.
        migrados: migrados ? {
          total: migrados.total,
          por_cuenta: migrados.por_cuenta,
          sin_clasificar: migrados.sin_clasificar,
          ve_migrados: migrados.ve_migrados,
        } : null,
        migrados_error: migradosError,
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error calculando saldos', detail: e.message }) };
  }
};

// ----- helpers -----

// [SAL-1] KH va aparte del Portal: si sus llaves faltan, Saldos sigue dando lo
// del Portal y lo dice, en vez de tronar entero.
function readEnvKH() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) return { error: 'Faltan env vars KH' };
  return { KH_SB_URL, KH_SB_SERVICE };
}

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
