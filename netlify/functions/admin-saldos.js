// =============================================================================
// admin-saldos  (S3 — visor de saldos por cuenta, LECTURA)
//
// [SALDOS-CAJA-1 · 12-oct-2026] LA CAJA ARRANCA DEL BANCO REAL Y SOLO SUMA LO
// CAPTURADO DESDE EL ANCLA. Luz verde de Memo, con la brecha medida antes: el
// término [SAL-1] (cobrado a migrados repartido por paquete→banco) pintaba
// ≈+$1.5M/+$6.4M contra bancos reales de $16.5k/$137k — era una APROXIMACIÓN
// del pasado cuyo gasto histórico nunca se capturó. Se RETIRÓ del cálculo; el
// razonamiento y el ancla viven en `_lib/cuentas-dinero.js` (CAJA_ANCLA_*).
//
//   ENTRADAS = pagos COBRADOS (estado='pagado', fecha_pagada >= ancla,
//              monto real = COALESCE(monto_pagado, monto))
//            + ingresos (fecha >= ancla — el «Saldo inicial» del 13-oct ES el
//              arranque: una fila de `ingresos` por cuenta, categoría
//              'Saldo inicial', con el saldo real de banco al cierre del 12-oct)
//   SALIDAS  = gastos (fecha >= ancla)
//   saldo por cuenta = entradas − salidas
//
// Lo ANTERIOR al ancla no se suma ni se resta: el banco real ya lo traía
// descontado cuando se ancló — contarlo otra vez sería doble conteo. Las
// entradas de clientes posteriores NO entran solas (los abonos del careo llevan
// fecha de cosecha y cuenta aproximada): se capturan como ingreso manual por
// cuenta, o se re-ancla. La pantalla lo dice.
//
// ⚰️ [SAL-1] queda como historia: ese término existió porque con melanie BBVA
// pintaba −$147,172 (gastos sin una entrada). La respuesta de hoy es el ancla,
// no la aproximación. `migradosPorCuenta` sigue en `_lib/cuenta-evento` SIN
// llamador aquí — no la recables al visor: volvería la brecha de millones.
//
// Solo se muestran 3 cuentas: BBVA, Banamex, Efectivo. Filas con cuenta 'Otro' o
// null se IGNORAN en las tarjetas pero su neto (post-ancla) se acumula en
// `otros_total` para un pie de nota honesto. Solo cuentan los pagos 'pagado'.
//
// El portal consulta SIN embeds: pagos, solicitudes_tour y clientes se leen por
// separado y se hace el stitch en JS (igual criterio que admin-cobranza-list).
//
// Body JSON: {} (sin parámetros).
// Respuesta: { ok, generado_at, ancla, cuentas:{ BBVA:{...}, Banamex:{...},
//              Efectivo:{...} }, otros_total, caja_total }
//   Cada cuenta: { entradas_pagos, entradas_ingresos, salidas_gastos, entradas,
//                  salidas, saldo, pagos:[...], ingresos:[...], gastos:[...] }
//
// Seguridad: verifyAdminAuth(['maestro_roshi','bulma','milk']) + corsCheck.
// service_role SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
// [SALDOS-CAJA-1] El ancla de caja: el día (columnas date) y el instante
// (timestamptz) viven con las cuentas, en la lib del dinero.
const { CAJA_ANCLA_DIA, CAJA_ANCLA_INSTANTE } = require('./_lib/cuentas-dinero');

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
    // 1) Pagos COBRADOS, desde el ancla. `fecha_pagada` es timestamptz, así que
    //    el corte va por INSTANTE (medianoche del 13-oct en Reynosa), no por el
    //    día UTC pelado — ver CAJA_ANCLA_INSTANTE en _lib/cuentas-dinero.
    const pagosRes = await leer('pagos', `estado=eq.pagado&fecha_pagada=gte.${encodeURIComponent(CAJA_ANCLA_INSTANTE)}&select=id,cuenta,monto,monto_pagado,fecha_pagada,solicitud_id,cliente_id&limit=5000`);
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

    // 3) Ingresos, desde el ancla. El asiento «Saldo inicial» lleva fecha
    //    CAJA_ANCLA_DIA, así que entra por este mismo filtro — sin caso especial.
    const ingresosRes = await leer('ingresos', `fecha=gte.${CAJA_ANCLA_DIA}&select=id,cuenta,monto,concepto,fecha,cliente_id,evento_id&limit=5000`);
    if (ingresosRes.error) return { statusCode: 502, headers, body: JSON.stringify({ error: ingresosRes.error, detail: ingresosRes.detail }) };
    const ingresos = ingresosRes.data;

    // 4) Gastos, desde el ancla. Los capturados hasta el 12-oct (EFECTIVO-1,
    //    PAGOS-MATRIZ-1/2) quedan DENTRO del ancla: el banco ya los descuenta.
    const gastosRes = await leer('gastos', `fecha=gte.${CAJA_ANCLA_DIA}&select=id,cuenta,monto,concepto,fecha,evento_id&limit=5000`);
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

    // ⚰️ [SALDOS-CAJA-1] Aquí vivía el bloque [SAL-1] que sumaba el cobrado a
    // migrados (KH) repartido por paquete→banco. Se RETIRÓ con luz verde de
    // Memo: era una aproximación que pintaba millones contra bancos reales de
    // miles. La caja arranca del asiento «Saldo inicial» (una fila de
    // `ingresos` por cuenta, fecha = ancla) y de ahí solo lo capturado.

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
        // [SALDOS-CAJA-1] El ancla viaja para que la pantalla la DIGA: un saldo
        // «desde el 13-oct» presentado sin esa palabra se leería como el saldo
        // de toda la historia. La pantalla no la inventa: la dice la fuente.
        ancla: CAJA_ANCLA_DIA,
        cuentas,
        otros_total: otrosTotal,
        // [E5-1] LA CAJA TOTAL LA DICE LA FUENTE. Antes la sumaba el navegador
        // (un `reduce` sobre las tres cuentas + otros dentro del Resumen), que
        // es exactamente la fórmula número doce esperando a divergir: el día
        // que aquí entre una cuarta cuenta, la pantalla seguiría sumando tres.
        // Se calcula donde viven los datos y se manda hecha.
        //
        // OJO — ESTA CAJA NO ES `caja_total_empresa` de `_lib/utilidad-evento`,
        // aunque las dos se llamen "caja". Los universos son distintos: ésta es
        // la caja ANCLADA al banco real y aquélla es la cuenta del Portal. No
        // se comparan ni se "emparejan": son dos respuestas a dos preguntas, y
        // juntarlas repetiría el $0-contra-$136,391 de AUD-1.
        caja_total: CUENTAS.reduce((a, n) => a + Number((cuentas[n] || {}).saldo || 0), 0) + otrosTotal,
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
