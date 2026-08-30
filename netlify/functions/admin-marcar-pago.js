// =============================================================================
// admin-marcar-pago  (Fase 2.3c — ESCRITURA)
//
// Marca UN pago como pagado (o lo revierte a pendiente) en la tabla `pagos`
// del Supabase NUEVO (conecta-portal). Lo usa Kamehouse → Solicitudes Portal →
// modal de detalle, sección "Plan de pagos". En cuanto un pago pasa a 'pagado',
// el cliente lo ve en portal.html (que suma los pagos 'pagado' como "abonado").
//
// Body JSON:
//   { pago_id: uuid, accion: 'pagar'|'revertir', version: <updated_at leído>,
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

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { validarMonto } = require('./_lib/monto-limites');
const { aplicarNucleo } = require('./_lib/marcar-pago');

// `metodo` = CÓMO pagó (solo formas de pago; ya no incluye bancos). La BD aún
// acepta los viejos (bbva/hey/otro) para no violar filas existentes, pero la UI
// y esta validación solo permiten los 3 nuevos.
const METODOS_VALIDOS = ['transferencia','deposito','efectivo'];
// `cuenta` = a qué cuenta ENTRÓ el dinero (distinto de `metodo`). Opcional.
const CUENTAS_VALIDAS = ['BBVA','Banamex','Efectivo','Otro'];
const MAX_REFERENCIA = 120;
const TOLERANCIA_MXN = 1; // absorbe redondeos de centavos en el reparto del plan

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

  const pagoId = body.pago_id;
  const accion = body.accion;
  if (!pagoId || !/^[0-9a-f-]{36}$/i.test(pagoId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'pago_id inválido' }) };
  }
  if (accion !== 'pagar' && accion !== 'revertir') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "accion debe ser 'pagar' o 'revertir'" }) };
  }

  // [CONC-2] `version` es el `updated_at` que la pantalla leyó del plan de pagos.
  // Es OBLIGATORIA y se rehúsa el guardado sin ella, a propósito: este es el caso
  // que Memo teme —dos personas con el mismo plan abierto— y la pantalla la manda
  // siempre desde el mismo commit que esta función. Faltarla solo puede ser una
  // pestaña vieja, y ahí vale mucho más un mensaje que se puede obedecer que un
  // candado que se apaga solo justo cuando más falta hace.
  const version = body.version;
  if (typeof version !== 'string' || !version.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({
      error: 'Falta la versión de la cuota. Recarga la pantalla y vuelve a intentarlo.',
      falta_version: true,
    }) };
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
      // 💰 CAP3-1: tope de cordura. Un monto_pagado inflado por un dedazo hace
      // que la reconciliación dé el tour por 'pagado' ANTES de tiempo.
      const _vm = validarMonto(montoPagado, { etiqueta: 'monto_pagado' });
      if (!_vm.ok) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: _vm.error }) };
      }
      montoPagado = _vm.monto;
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

  // [ST-1] El núcleo (update + bitácora + reconciliación + correo) se MOVIÓ a
  // _lib/marcar-pago.js para que exista UNA SOLA ruta al dinero: aquí lo llama
  // el admin con su auth de siempre, y stripe-webhook lo llama con actor
  // 'stripe:evt_...'. La extracción es un movimiento, no un cambio — el arnés
  // de T4 lo prueba antes y después.
  const actorEtiqueta = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';
  const r = await aplicarNucleo({ env, headers, pagoId, accion, patch, actorEtiqueta, version });
  // El bloque `admin` de la respuesta se queda AQUÍ: es del endpoint admin, no
  // del núcleo (un webhook no tiene admin que reportar).
  if (r.statusCode === 200) {
    try {
      const j = JSON.parse(r.body);
      j.admin = { id: auth.user.id, correo: auth.user.correo };
      return { ...r, body: JSON.stringify(j) };
    } catch (e) { return r; }
  }
  return r;
};

// ----- helpers que se quedan (los usa la validación de arriba) -----

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
