// =============================================================================
// portal-invitacion-aceptar  (Acompañantes F2-t2 — la ACEPTACIÓN)
//
// La llama el ACOMPAÑANTE (ya logueado con su propia cuenta) para aceptar la
// invitación que le llegó por correo (#225). Liga el "lugar" a su cliente:
// cliente_id + invitacion_aceptada_at. Si aún no tiene fila en `clientes`, se le
// crea una mínima (patrón portal-reclamar-cuenta).
//
// CANDADO DE SEGURIDAD (decisión de Memo/Claude): el correo del usuario logueado
// debe COINCIDIR con el correo del lugar (trim+lower). Si no, 403 y NO se liga —
// así nadie acepta el lugar de otra persona con un token filtrado.
//
// Idempotente: re-abrir el link ya aceptado por el MISMO usuario → 200
// { ya_aceptada:true }. Por otro usuario → 409.
//
// Seguridad (mismo patrón que portal-lugar-actualizar): valida el JWT con
// GET /auth/v1/user (apikey ANON), y lee/escribe con service_role.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY,
//                       PORTAL_SUPABASE_SERVICE_KEY. (Sin env vars nuevas.)
// =============================================================================

const { crearContratoParaLugar } = require('./_lib/contratos-viajeros');

const UUID_RE = /^[0-9a-f-]{36}$/i;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const SB_ANON    = process.env.PORTAL_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_ANON || !SB_SERVICE) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars (PORTAL_SUPABASE_*)' }) };
  }

  // ---- 1. Validar el JWT del acompañante (id + email) ----
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Falta Authorization Bearer' }) };
  }

  let user;
  try {
    const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + jwt },
    });
    if (!userResp.ok) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT inválido o expirado' }) };
    }
    user = await userResp.json();
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo validar el JWT', detail: e.message }) };
  }
  if (!user || !user.id) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT sin usuario' }) };
  }
  const correoUser = (user && typeof user.email === 'string') ? user.email.trim().toLowerCase() : '';

  // ---- 2. Body: token ----
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const token = body && typeof body.token === 'string' ? body.token.trim() : '';
  if (!UUID_RE.test(token)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'token inválido' }) };
  }

  const sbHeaders = {
    apikey: SB_SERVICE,
    Authorization: 'Bearer ' + SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // ---- 3a. Buscar el lugar por token ----
    const lugR = await fetch(
      `${SB_URL}/rest/v1/lugares?invitacion_token=eq.${encodeURIComponent(token)}`
      + `&select=id,solicitud_id,numero,nombre,correo,estado,cliente_id,invitacion_aceptada_at,fecha_nacimiento&limit=1`,
      { headers: sbHeaders }
    );
    if (!lugR.ok) {
      const detail = await lugR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta del lugar', detail }) };
    }
    const lugArr = await lugR.json();
    const lugar = Array.isArray(lugArr) ? lugArr[0] : null;
    if (!lugar) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Invitación no válida' }) };
    }

    // ---- 3b. El lugar debe estar 'activo' ----
    if (lugar.estado !== 'activo') {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este lugar ya no está disponible' }) };
    }

    // ---- 3c. El correo del usuario debe COINCIDIR con el del lugar ----
    const correoLugar = (lugar.correo && typeof lugar.correo === 'string') ? lugar.correo.trim().toLowerCase() : '';
    if (!correoUser || !correoLugar || correoUser !== correoLugar) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: `Entra con el correo al que llegó tu invitación (${ofuscar(correoLugar)})` }),
      };
    }

    // ---- 3e. La solicitud no debe estar cancelada (y traer evento_nombre) ----
    const solR = await fetch(
      `${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(lugar.solicitud_id)}&select=evento_nombre,estado,evento_id&limit=1`,
      { headers: sbHeaders }
    );
    if (!solR.ok) {
      const detail = await solR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de la solicitud', detail }) };
    }
    const solArr = await solR.json();
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    if (!solicitud) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
    }
    if (solicitud.estado === 'cancelado') {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este tour fue cancelado' }) };
    }
    const eventoNombre = solicitud.evento_nombre || 'tu viaje';

    // ---- 4. Cliente del usuario (leer; se crea si falta más abajo) ----
    let clienteId = await buscarClienteId(SB_URL, sbHeaders, user.id);

    // ---- 3d. ¿Ya estaba aceptada? Idempotente para el MISMO usuario. ----
    if (lugar.invitacion_aceptada_at) {
      if (clienteId && lugar.cliente_id === clienteId) {
        // Re-click del link ya aceptado: re-apunta por si el plan (#229) se generó
        // DESPUÉS de aceptar y sus cuotas quedaron al titular. Idempotente/best-effort.
        const reap = await reapuntarCuotas(SB_URL, sbHeaders, lugar.id, clienteId, user.id);
        await _ensureContrato(SB_URL, sbHeaders, lugar, solicitud); // F2a: por si aún no tenía contrato
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ya_aceptada: true, evento_nombre: eventoNombre, ...reap }) };
      }
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Esta invitación ya fue usada' }) };
    }

    // ---- 5. Crear el cliente mínimo si el usuario aún no tiene ----
    if (!clienteId) {
      const insR = await fetch(`${SB_URL}/rest/v1/clientes`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({
          auth_user_id:    user.id,
          correo:          correoUser,
          nombre_completo: (lugar.nombre && String(lugar.nombre).trim()) || correoUser,
        }),
      });
      if (!insR.ok) {
        const detail = await insR.text();
        // Carrera: si ya se creó en paralelo (23505), lo releemos.
        if (insR.status === 409 || detail.includes('23505')) {
          clienteId = await buscarClienteId(SB_URL, sbHeaders, user.id);
        }
        if (!clienteId) {
          return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo crear tu cliente', detail }) };
        }
      } else {
        const insArr = await insR.json();
        clienteId = Array.isArray(insArr) ? (insArr[0] && insArr[0].id) : (insArr && insArr.id);
      }
    }
    if (!clienteId) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo resolver tu cliente' }) };
    }

    // ---- 6. Ligar el lugar al cliente (aceptación) ----
    const nowISO = new Date().toISOString();
    const upR = await fetch(`${SB_URL}/rest/v1/lugares?id=eq.${encodeURIComponent(lugar.id)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ cliente_id: clienteId, invitacion_aceptada_at: nowISO, updated_at: nowISO }),
    });
    if (!upR.ok) {
      const detail = await upR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo aceptar la invitación', detail }) };
    }

    // ---- 7. Re-apuntar al acompañante las cuotas NO pagadas de su lugar (F3-t3).
    //         Best-effort: un fallo NO revierte la aceptación (ya hecha arriba).
    const reap = await reapuntarCuotas(SB_URL, sbHeaders, lugar.id, clienteId, user.id);

    // ---- 8. Contrato F2a: si su lugar no tiene contrato vivo, crearlo (insert
    //         directo, idempotente). SIN correo aquí — su portal se lo muestra en F3.
    await _ensureContrato(SB_URL, sbHeaders, lugar, solicitud);

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, evento_nombre: eventoNombre, ...reap }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error aceptando la invitación', detail: e.message }) };
  }
};

// ----- helpers -----

// F2a: asegura un contrato vivo para el lugar del acompañante. Insert directo
// (idempotente: 23505 → ya existe). Best-effort: NUNCA lanza — no revierte la
// aceptación. Sin correo (su portal muestra el contrato en F3).
async function _ensureContrato(SB_URL, sbHeaders, lugar, solicitud) {
  try {
    await crearContratoParaLugar({
      portalUrl: SB_URL,
      portalHeaders: sbHeaders,
      lugar: { id: lugar.id, fecha_nacimiento: lugar.fecha_nacimiento },
      solicitud: { id: lugar.solicitud_id, evento_id: solicitud && solicitud.evento_id },
    });
  } catch (e) {
    console.warn('[invitacion-aceptar] contrato F2a:', e.message);
  }
}

// F3-t3: re-apunta al acompañante las cuotas NO pagadas de SU lugar (las que se
// generaron al titular porque el lugar aún no tenía dueño, #229). Best-effort:
// NUNCA lanza — un fallo aquí no revierte la aceptación, solo se reporta. Las
// cuotas 'pagado' quedan intactas (historia contable de quien las pagó);
// pendientes Y vencidas se re-apuntan (si debe, la deuda es suya). Idempotente:
// re-aplicar deja los mismos valores.
async function reapuntarCuotas(SB_URL, sbHeaders, lugarId, clienteId, authUserId) {
  try {
    const nowISO = new Date().toISOString();
    const r = await fetch(
      `${SB_URL}/rest/v1/pagos?lugar_id=eq.${encodeURIComponent(lugarId)}&estado=neq.pagado`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ cliente_id: clienteId, auth_user_id: authUserId, updated_at: nowISO }),
      }
    );
    if (!r.ok) return { cuotas_error: true };
    const arr = await r.json();
    return { cuotas_reapuntadas: Array.isArray(arr) ? arr.length : 0 };
  } catch (e) {
    return { cuotas_error: true };
  }
}

async function buscarClienteId(SB_URL, sbHeaders, authUserId) {
  const r = await fetch(
    `${SB_URL}/rest/v1/clientes?auth_user_id=eq.${encodeURIComponent(authUserId)}&select=id&limit=1`,
    { headers: sbHeaders }
  );
  if (!r.ok) return null;
  const arr = await r.json();
  return (Array.isArray(arr) && arr[0] && arr[0].id) || null;
}

// 'juan@gmail.com' → 'j***@gmail.com'. No revela el correo completo.
function ofuscar(correo) {
  const s = String(correo || '');
  const at = s.indexOf('@');
  if (at <= 0) return '***';
  return s[0] + '***' + s.slice(at);
}
