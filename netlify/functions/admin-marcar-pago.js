// =============================================================================
// admin-marcar-pago  (Fase 2.3c — ESCRITURA)
//
// Marca UN pago como pagado (o lo revierte a pendiente) en la tabla `pagos`
// del Supabase NUEVO (conecta-portal). Lo usa Kamehouse → Solicitudes Portal →
// modal de detalle, sección "Plan de pagos". En cuanto un pago pasa a 'pagado',
// el cliente lo ve en portal.html (que suma los pagos 'pagado' como "abonado").
//
// Body JSON:
//   { pago_id: uuid, accion: 'pagar'|'revertir',
//     fecha_pagada?: 'YYYY-MM-DD', metodo?, referencia? }
//
// Lógica (service_role):
//   - 'pagar'    → estado='pagado', fecha_pagada (default hoy MX), metodo,
//                  referencia, registrado_por = admin del JWT.
//   - 'revertir' → estado='pendiente', fecha_pagada=null, metodo=null,
//                  referencia=null. (Deja el pago como estaba — reversible.)
//   Después de actualizar, reconcilia el estado de la solicitud:
//   - si TODOS los pagos quedan 'pagado'           → solicitud → 'pagado'.
//   - si NO todos y la solicitud estaba 'pagado'   → solicitud → 'en_pagos'.
//   Nunca borra filas: solo UPDATE.
//
// Seguridad: mismo patrón que admin-generar-plan-pagos. Authorization:
// Bearer <JWT> validado por verifyAdminAuth(); roles maestro_roshi/bulma.
// service_role SOLO aquí (backend), nunca en el front.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET. (Reusa las del portal — sin env vars nuevas.)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

// `metodo` = CÓMO pagó (solo formas de pago; ya no incluye bancos). La BD aún
// acepta los viejos (bbva/hey/otro) para no violar filas existentes, pero la UI
// y esta validación solo permiten los 3 nuevos.
const METODOS_VALIDOS = ['transferencia','deposito','efectivo'];
// `cuenta` = a qué cuenta ENTRÓ el dinero (distinto de `metodo`). Opcional.
const CUENTAS_VALIDAS = ['BBVA','Banamex','Efectivo','Otro'];
const MAX_REFERENCIA = 120;

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

  const pagoId = body.pago_id;
  const accion = body.accion;
  if (!pagoId || !/^[0-9a-f-]{36}$/i.test(pagoId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'pago_id inválido' }) };
  }
  if (accion !== 'pagar' && accion !== 'revertir') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "accion debe ser 'pagar' o 'revertir'" }) };
  }

  // ── Construir el patch según la acción ───────────────────────────────────
  let patch;
  if (accion === 'pagar') {
    const metodo = body.metodo;
    if (!METODOS_VALIDOS.includes(metodo)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'metodo inválido (transferencia|deposito|efectivo)' }) };
    }
    let fechaPagada = body.fecha_pagada;
    if (fechaPagada == null || fechaPagada === '') {
      fechaPagada = hoyMx();
    } else if (typeof fechaPagada !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fechaPagada)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'fecha_pagada debe ser YYYY-MM-DD' }) };
    }
    let referencia = body.referencia;
    if (referencia != null && typeof referencia !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'referencia debe ser texto' }) };
    }
    referencia = referencia ? String(referencia).trim() : '';
    if (referencia.length > MAX_REFERENCIA) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `referencia demasiado larga (máx ${MAX_REFERENCIA})` }) };
    }
    // monto_pagado opcional: monto REAL pagado. Si no viene, queda NULL y el
    // cálculo de abonado usa el monto del plan (COALESCE) — compatibilidad.
    let montoPagado = body.monto_pagado;
    if (montoPagado == null || montoPagado === '') {
      montoPagado = null;
    } else {
      montoPagado = Number(montoPagado);
      if (!Number.isFinite(montoPagado) || montoPagado < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'monto_pagado debe ser un número >= 0' }) };
      }
    }
    // cuenta opcional: a qué cuenta entró el dinero. Si viene, debe ser válida.
    let cuenta = body.cuenta;
    if (cuenta == null || cuenta === '') {
      cuenta = null;
    } else if (!CUENTAS_VALIDAS.includes(cuenta)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'cuenta inválida (BBVA|Banamex|Efectivo|Otro)' }) };
    }
    const registradoPor = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';
    patch = {
      estado:         'pagado',
      fecha_pagada:   fechaPagada,
      metodo:         metodo,
      cuenta:         cuenta,
      referencia:     referencia || null,
      registrado_por: registradoPor,
    };
    if (montoPagado !== null) patch.monto_pagado = montoPagado;
  } else {
    // revertir: deja el pago como estaba (pendiente, sin datos de pago).
    patch = { estado: 'pendiente', fecha_pagada: null, metodo: null, cuenta: null, referencia: null, monto_pagado: null };
  }

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // 1. UPDATE del pago. return=representation nos da la fila (incl. solicitud_id).
    const pagoUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?id=eq.${pagoId}`;
    const upR = await fetch(pagoUrl, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!upR.ok) {
      const detail = await upR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la actualización del pago', detail }) };
    }
    const upArr = await upR.json();
    const pago = Array.isArray(upArr) ? upArr[0] : null;
    if (!pago) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Pago no encontrado' }) };
    }

    // 2. Leer TODOS los pagos de la solicitud para reconciliar su estado.
    const solicitudId = pago.solicitud_id;
    const allUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?solicitud_id=eq.${solicitudId}&select=estado`;
    const allR = await fetch(allUrl, { headers: sbHeaders });
    if (!allR.ok) {
      const detail = await allR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de pagos', detail }) };
    }
    const todos = await allR.json();
    const todosPagados = Array.isArray(todos) && todos.length > 0 && todos.every(p => p.estado === 'pagado');

    // 3. Leer el estado actual de la solicitud y reconciliar si hace falta.
    const solUrl = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}&select=id,estado`;
    const solR = await fetch(solUrl, { headers: sbHeaders });
    if (!solR.ok) {
      const detail = await solR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de solicitud', detail }) };
    }
    const solArr = await solR.json();
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    const estadoPrevio = solicitud ? solicitud.estado : null;
    let estadoSolicitud = estadoPrevio;

    let nuevoEstadoSol = null;
    if (todosPagados && estadoPrevio !== 'pagado') {
      nuevoEstadoSol = 'pagado';
    } else if (!todosPagados && estadoPrevio === 'pagado') {
      nuevoEstadoSol = 'en_pagos';
    }

    if (nuevoEstadoSol) {
      const patchSolR = await fetch(`${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ estado: nuevoEstadoSol }),
      });
      if (!patchSolR.ok) {
        const detail = await patchSolR.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Pago actualizado, pero falló la reconciliación del estado de la solicitud', detail }) };
      }
      estadoSolicitud = nuevoEstadoSol;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        pago,
        solicitud_id: solicitudId,
        solicitud_estado: estadoSolicitud,
        solicitud_estado_cambio: nuevoEstadoSol,
        admin: { id: auth.user.id, correo: auth.user.correo },
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error marcando el pago', detail: e.message }) };
  }
};

// ----- helpers -----

// Fecha de hoy en zona horaria de México (America/Monterrey), formato YYYY-MM-DD.
// en-CA produce el formato ISO de fecha directamente.
function hoyMx() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Monterrey',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
