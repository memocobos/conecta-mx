// =============================================================================
// admin-crear-viajero  (Fase 2a — ESCRITURA)
//
// Da de alta un cliente "walk-in" (de WhatsApp, SIN cuenta de portal) en el
// modelo del portal (Supabase conecta-portal): crea el CLIENTE y su SOLICITUD
// (estado 'en_pagos'). NO genera el plan de pagos aquí — eso lo hace el frontend
// reusando admin-generar-plan-pagos (idempotente), igual que al aprobar.
//
// Lo usa Kamehouse → Capsule Corp → "+ Viajero".
//
// Body JSON:
//   { cliente:   { nombre_completo, celular, correo? },
//     solicitud: { evento_id, evento_nombre, paquete, zona, num_personas,
//                  tipo_habitacion?, precio_total, monto_separo } }
//
// El cliente nace con auth_user_id NULL y creado_por_admin=true; la solicitud
// nace con auth_user_id NULL. La migración 009_walkin aflojó esos NOT NULL.
//
// Seguridad: mismo patrón que admin-generar-plan-pagos. Authorization:
// Bearer <JWT> validado por verifyAdminAuth(); roles maestro_roshi/bulma.
// service_role SOLO aquí (backend), nunca en el front.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       JWT_SECRET. (Reusa las del portal — sin env vars nuevas.)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { ensureLugares } = require('./_lib/portal-lugares');

const PAQUETES_VALIDOS = ['PLUS','RIDE','STAY','CHEAP'];
const HABITACIONES_VALIDAS = ['compartida','triple','doble','individual'];

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

  const auth = verifyAdminAuth(event, ['maestro_roshi','bulma','milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const cli = (body && body.cliente) || {};
  const sol = (body && body.solicitud) || {};

  // ── Validación del cliente ───────────────────────────────────────────────
  const nombre = typeof cli.nombre_completo === 'string' ? cli.nombre_completo.trim() : '';
  const celular = typeof cli.celular === 'string' ? cli.celular.trim() : '';
  if (!nombre)  return { statusCode: 400, headers, body: JSON.stringify({ error: 'nombre_completo es requerido' }) };
  if (nombre.length > 200) return { statusCode: 400, headers, body: JSON.stringify({ error: 'nombre_completo demasiado largo (máx 200)' }) };
  if (!celular) return { statusCode: 400, headers, body: JSON.stringify({ error: 'celular es requerido' }) };
  if (celular.length > 40)  return { statusCode: 400, headers, body: JSON.stringify({ error: 'celular demasiado largo (máx 40)' }) };

  let correo = null;
  if (cli.correo != null && String(cli.correo).trim() !== '') {
    correo = String(cli.correo).trim().toLowerCase();
    if (correo.length > 200 || !correoFormatoValido(correo)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Correo con formato inválido' }) };
    }
  }

  // ── Validación de la solicitud ───────────────────────────────────────────
  const eventoId     = typeof sol.evento_id === 'string' ? sol.evento_id.trim() : '';
  const eventoNombre = typeof sol.evento_nombre === 'string' ? sol.evento_nombre.trim() : '';
  const paquete      = typeof sol.paquete === 'string' ? sol.paquete.trim().toUpperCase() : '';
  const zona         = typeof sol.zona === 'string' ? sol.zona.trim() : '';
  if (!eventoId || eventoId.length > 80)   return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
  if (!eventoNombre)                       return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_nombre es requerido' }) };
  if (!PAQUETES_VALIDOS.includes(paquete)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'paquete inválido (PLUS/RIDE/STAY/CHEAP)' }) };
  if (!zona)                               return { statusCode: 400, headers, body: JSON.stringify({ error: 'zona es requerida' }) };
  if (zona.length > 120)                   return { statusCode: 400, headers, body: JSON.stringify({ error: 'zona demasiado larga (máx 120)' }) };

  let numPersonas = parseInt(sol.num_personas, 10);
  if (!Number.isInteger(numPersonas)) numPersonas = 1;
  if (numPersonas < 1 || numPersonas > 12) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'num_personas debe estar entre 1 y 12' }) };
  }

  let tipoHabitacion = null;
  if (sol.tipo_habitacion != null && String(sol.tipo_habitacion).trim() !== '') {
    tipoHabitacion = String(sol.tipo_habitacion).trim();
    if (!HABITACIONES_VALIDAS.includes(tipoHabitacion)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'tipo_habitacion inválido (compartida/triple/doble/individual)' }) };
    }
  }

  const precioTotal = Number(sol.precio_total);
  const montoSeparo = Number(sol.monto_separo);
  if (!isFinite(precioTotal) || precioTotal < 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'precio_total debe ser número >= 0' }) };
  if (!isFinite(montoSeparo) || montoSeparo < 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'monto_separo debe ser número >= 0' }) };
  if (montoSeparo > precioTotal)                 return { statusCode: 400, headers, body: JSON.stringify({ error: 'monto_separo no puede ser mayor que precio_total' }) };

  const restBase = `${env.PORTAL_SB_URL}/rest/v1`;
  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Crear el cliente walk-in (sin login, perfil mínimo).
    const clienteRow = {
      auth_user_id:     null,
      creado_por_admin: true,
      nombre_completo:  nombre,
      celular:          celular,
      correo:           correo,            // null si no se capturó
    };
    const cliR = await fetch(`${restBase}/clientes`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify(clienteRow),
    });
    if (!cliR.ok) {
      const detail = await cliR.text();
      // 23505 = unique_violation. El único UNIQUE que el admin puede chocar es el correo.
      if ((cliR.status === 409 || detail.includes('23505')) && (detail.includes('correo') || correo)) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'Ya existe un cliente con ese correo' }) };
      }
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la creación del cliente', detail }) };
    }
    const cliArr = await cliR.json();
    const cliente = Array.isArray(cliArr) ? cliArr[0] : null;
    if (!cliente || !cliente.id) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo crear el cliente' }) };
    }

    // 2. Crear la solicitud (estado en_pagos). El plan lo genera el frontend después.
    const solicitudRow = {
      cliente_id:      cliente.id,
      auth_user_id:    null,
      evento_id:       eventoId,
      evento_nombre:   eventoNombre,
      paquete:         paquete,
      zona:            zona,
      num_personas:    numPersonas,
      tipo_habitacion: tipoHabitacion,     // null si no aplica (p.ej. RIDE/CHEAP)
      precio_total:    precioTotal,
      monto_separo:    montoSeparo,
      estado:          'en_pagos',
    };
    const solR = await fetch(`${restBase}/solicitudes_tour`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify(solicitudRow),
    });
    if (!solR.ok) {
      const detail = await solR.text();
      // El cliente ya quedó creado; se devuelve para que no se pierda el dato.
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Cliente creado, pero Supabase rechazó la solicitud', detail, cliente_id: cliente.id }) };
    }
    const solArr = await solR.json();
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    if (!solicitud || !solicitud.id) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo crear la solicitud', cliente_id: cliente.id }) };
    }

    // El walk-in nace 'en_pagos' → crear sus N lugares. Best-effort: un fallo aquí
    // NO revierte cliente/solicitud; solo se reporta. La fila recién creada
    // (return=representation) ya trae todos los campos que necesita el helper.
    const lugaresInfo = {};
    try {
      const res = await ensureLugares({ portalUrl: env.PORTAL_SB_URL, portalHeaders: sbHeaders, solicitud });
      lugaresInfo.lugares_creados = res.creados;
    } catch (e) {
      lugaresInfo.lugares_error = e.message;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        cliente_id: cliente.id,
        solicitud_id: solicitud.id,
        admin: { id: auth.user.id, correo: auth.user.correo },
        ...lugaresInfo,
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error creando el viajero', detail: e.message }) };
  }
};

// ----- helpers -----

// Formato básico: algo@algo.tld con TLD de 2+ letras y sin espacios. Bloquea
// basura como "juanperez", "juan@", "juan@gmail" o "juan@gmail.c". NOTA: ".con"
// pasa este filtro (es formato válido); el front lo atrapa con una sugerencia.
function correoFormatoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(correo == null ? '' : correo).trim());
}

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
