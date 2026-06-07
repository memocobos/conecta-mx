// =============================================================================
// portal-reclamar-cuenta   (Fase 2b — la pieza crítica de seguridad)
//
// La llama el CLIENTE con su PROPIO JWT del portal (no admin) cuando se loguea y
// todavía no tiene fila en `clientes` por auth_user_id. Busca un walk-in (cliente
// dado de alta por un admin, sin login) con SU MISMO correo VERIFICADO y lo
// enlaza: rellena auth_user_id en clientes + backfill en solicitudes_tour y pagos.
// Así el cliente ve su plan ya armado, sin recapturar nada.
//
// CANDADO DE SEGURIDAD (no negociable): solo enlaza si el correo del JWT está
// VERIFICADO (email_confirmed_at presente) y SOLO por ese correo. NUNCA por
// nombre ni teléfono. Si hay más de un walk-in con ese correo, NO adivina:
// responde { linked:false, conflicto:true } y se resuelve a mano.
//
// Idempotente: los UPDATE llevan `auth_user_id is null`, así correr dos veces no
// re-enlaza ni pisa datos.
//
// Seguridad (mismo patrón que portal-nueva-solicitud): valida el JWT con
// GET /auth/v1/user (apikey ANON), y escribe con service_role.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY,
//                       PORTAL_SUPABASE_SERVICE_KEY. (Sin env vars nuevas.)
// =============================================================================

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

  // ---- 1. Validar el JWT del cliente ----
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

  // ---- 2. CANDADO: correo verificado del propio JWT ----
  // Sin esto, alguien podría reclamar el walk-in de otra persona con un correo
  // que no le pertenece. email_confirmed_at solo lo setea el proveedor (Google /
  // confirmación por correo), nunca el cliente.
  const correoJwt = (user && typeof user.email === 'string') ? user.email.trim().toLowerCase() : '';
  if (!user || !user.id) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT sin usuario' }) };
  }
  if (!correoJwt || !user.email_confirmed_at) {
    // Correo no verificado o ausente → no se reclama nada.
    return { statusCode: 200, headers, body: JSON.stringify({ linked: false }) };
  }

  const sbHeaders = {
    apikey: SB_SERVICE,
    Authorization: 'Bearer ' + SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // ---- 3. ¿Ya tiene cuenta enlazada? Entonces no hay nada que reclamar. ----
    const yaUrl = `${SB_URL}/rest/v1/clientes?auth_user_id=eq.${user.id}&select=id&limit=1`;
    const yaR = await fetch(yaUrl, { headers: sbHeaders });
    if (!yaR.ok) {
      const detail = await yaR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de cuenta', detail }) };
    }
    const yaArr = await yaR.json();
    if (Array.isArray(yaArr) && yaArr.length > 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ linked: false, ya_tenia_cuenta: true }) };
    }

    // ---- 4. Buscar walk-in(s) con ESE correo verificado, sin login. ----
    // correo se guarda en minúsculas por el trigger; comparamos con el correo
    // (lowercased) del JWT. Exigimos creado_por_admin=true y auth_user_id null.
    const wUrl = `${SB_URL}/rest/v1/clientes`
      + `?correo=eq.${encodeURIComponent(correoJwt)}`
      + `&auth_user_id=is.null`
      + `&creado_por_admin=eq.true`
      + `&select=id,correo,nombre_completo&limit=5`;
    const wR = await fetch(wUrl, { headers: sbHeaders });
    if (!wR.ok) {
      const detail = await wR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la búsqueda de walk-in', detail }) };
    }
    const walkins = await wR.json();

    if (!Array.isArray(walkins) || walkins.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ linked: false }) };
    }
    if (walkins.length > 1) {
      // Caso raro: más de un walk-in con el mismo correo. No adivinamos.
      return { statusCode: 200, headers, body: JSON.stringify({ linked: false, conflicto: true }) };
    }

    const walkin = walkins[0];

    // ---- 5. Enlazar (idempotente con `auth_user_id is null`). ----
    // a. clientes
    const upCli = await fetch(`${SB_URL}/rest/v1/clientes?id=eq.${walkin.id}&auth_user_id=is.null`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ auth_user_id: user.id }),
    });
    if (!upCli.ok) {
      const detail = await upCli.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo enlazar el cliente', detail }) };
    }

    // b. solicitudes_tour (todas las del walk-in)
    const upSol = await fetch(`${SB_URL}/rest/v1/solicitudes_tour?cliente_id=eq.${walkin.id}&auth_user_id=is.null`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ auth_user_id: user.id }),
    });
    if (!upSol.ok) {
      const detail = await upSol.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Cliente enlazado, pero falló el backfill de solicitudes', detail, cliente_id: walkin.id }) };
    }

    // c. pagos (todos los del walk-in)
    const upPag = await fetch(`${SB_URL}/rest/v1/pagos?cliente_id=eq.${walkin.id}&auth_user_id=is.null`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ auth_user_id: user.id }),
    });
    if (!upPag.ok) {
      const detail = await upPag.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Cliente enlazado, pero falló el backfill de pagos', detail, cliente_id: walkin.id }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ linked: true, cliente_id: walkin.id }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error reclamando la cuenta', detail: e.message }) };
  }
};
