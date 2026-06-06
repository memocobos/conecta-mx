// =============================================================================
// admin-generar-plan-pagos
//
// Genera el plan de pagos (separo + quincenas) de una solicitud en el Supabase
// NUEVO (conecta-portal). Lo llama Kamehouse → Solicitudes Portal → modal
// "Cambiar estado" JUSTO ANTES de flipear el estado a 'en_pagos'
// (generar-primero: así nunca queda un tour en_pagos sin plan).
//
// Body JSON:
//   { solicitud_id: uuid,
//     pagos: [ { numero_pago:int, concepto:string, monto:number,
//                fecha_esperada:'YYYY-MM-DD' }, ... ] }
//
// El backend completa cliente_id y auth_user_id desde la solicitud, fija
// estado 'pendiente' y registrado_por con el admin del JWT. NO marca pagos
// como pagados (eso es Fase 2.3c).
//
// IDEMPOTENCIA: si la solicitud ya tiene pagos, NO inserta de nuevo y devuelve
// los existentes con { ya_existia: true }. Aprobar dos veces NO duplica el plan.
//
// Seguridad: mismo patrón que admin-solicitud-update-estado. Authorization:
// Bearer <JWT> validado por verifyAdminAuth(); roles maestro_roshi/bulma.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET. (Reusa las del portal — sin env vars nuevas.)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const ESTADO_PAGO_INICIAL = 'pendiente';
const MAX_PAGOS = 20; // separo + hasta ~10 quincenas; 20 es tope defensivo holgado

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

  // ── Validación del array de pagos ──────────────────────────────────────
  const pagos = body.pagos;
  if (!Array.isArray(pagos) || pagos.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'pagos debe ser un array no vacío' }) };
  }
  if (pagos.length > MAX_PAGOS) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Demasiados pagos (máx ${MAX_PAGOS})` }) };
  }

  const numerosVistos = new Set();
  for (const p of pagos) {
    if (!p || typeof p !== 'object') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cada pago debe ser un objeto' }) };
    }
    if (!Number.isInteger(p.numero_pago) || p.numero_pago < 1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'numero_pago debe ser entero >= 1' }) };
    }
    if (numerosVistos.has(p.numero_pago)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `numero_pago duplicado: ${p.numero_pago}` }) };
    }
    numerosVistos.add(p.numero_pago);
    if (typeof p.concepto !== 'string' || !p.concepto.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'concepto requerido' }) };
    }
    if (p.concepto.length > 200) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'concepto demasiado largo (máx 200)' }) };
    }
    if (typeof p.monto !== 'number' || !isFinite(p.monto) || p.monto < 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'monto debe ser número >= 0' }) };
    }
    if (typeof p.fecha_esperada !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha_esperada)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'fecha_esperada debe ser YYYY-MM-DD' }) };
    }
  }

  const restBase = `${env.PORTAL_SB_URL}/rest/v1/pagos`;
  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Traer la solicitud para obtener cliente_id y auth_user_id.
    const solUrl = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}&select=id,cliente_id,auth_user_id`;
    const solR = await fetch(solUrl, { headers: sbHeaders });
    if (!solR.ok) {
      const detail = await solR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de solicitud', detail }) };
    }
    const solArr = await solR.json();
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    if (!solicitud) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
    }

    // 2. IDEMPOTENCIA: si ya hay pagos para esta solicitud, no insertar de nuevo.
    const existUrl = `${restBase}?solicitud_id=eq.${solicitudId}&select=*&order=numero_pago.asc`;
    const existR = await fetch(existUrl, { headers: sbHeaders });
    if (!existR.ok) {
      const detail = await existR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de pagos', detail }) };
    }
    const existentes = await existR.json();
    if (Array.isArray(existentes) && existentes.length > 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ya_existia: true, pagos: existentes }) };
    }

    // 3. Insertar el plan con service_role, completando datos desde la solicitud.
    const registradoPor = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';
    const rows = pagos.map((p) => ({
      solicitud_id:   solicitud.id,
      cliente_id:     solicitud.cliente_id,
      auth_user_id:   solicitud.auth_user_id,
      numero_pago:    p.numero_pago,
      concepto:       p.concepto.trim(),
      monto:          p.monto,
      fecha_esperada: p.fecha_esperada,
      estado:         ESTADO_PAGO_INICIAL,
      registrado_por: registradoPor,
    }));

    const insR = await fetch(restBase, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify(rows),
    });
    if (!insR.ok) {
      const detail = await insR.text();
      // 23505 = unique_violation → carrera con otra aprobación simultánea.
      // Tratamos como idempotente: devolvemos lo que ya quedó guardado.
      if (insR.status === 409 || detail.includes('23505')) {
        const reR = await fetch(existUrl, { headers: sbHeaders });
        const yaPagos = reR.ok ? await reR.json() : [];
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ya_existia: true, pagos: yaPagos }) };
      }
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la inserción del plan', detail }) };
    }
    const insertados = await insR.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, ya_existia: false, pagos: insertados, admin: { id: auth.user.id, correo: auth.user.correo } }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error generando plan de pagos', detail: e.message }) };
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
