// =============================================================================
// portal-mis-lugares  (Acompañantes puente F2→F3 — el acompañante VE sus viajes)
//
// La llama el ACOMPAÑANTE con su PROPIO JWT del portal para listar los "lugares"
// que aceptó (invitación de #226): su lugar quedó ligado a su cliente vía
// cliente_id. Su portal, por defecto, solo muestra solicitudes PROPIAS (por
// auth_user_id); esta función le devuelve —de forma CURADA— los viajes donde es
// acompañante, sin exponer la solicitud del grupo (precio_total, titular, etc.).
//
// Solo se devuelve por cada lugar: evento_id, evento_nombre, numero, paquete,
// zona, tipo_habitacion, precio, estado. NADA más de la solicitud.
//
// Candados (server-side con service_role):
//   - JWT válido → user.id (sin JWT/ inválido → 401).
//   - lugares del cliente del user con numero>=2 (el #1 = su propio titular, ya
//     lo ve en "Mis tours"). Se excluyen los lugares cuya solicitud esté
//     'cancelado' (o no exista).
//
// Seguridad (mismo patrón que portal-lugar-actualizar): valida el JWT con
// GET /auth/v1/user (apikey ANON), y lee con service_role.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY,
//                       PORTAL_SUPABASE_SERVICE_KEY. (Sin env vars nuevas.)
// =============================================================================

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const SB_ANON    = process.env.PORTAL_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_ANON || !SB_SERVICE) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars (PORTAL_SUPABASE_*)' }) };
  }

  // ---- 1. Validar el JWT del acompañante ----
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

  const sbHeaders = {
    apikey: SB_SERVICE,
    Authorization: 'Bearer ' + SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // ---- 2. El cliente del user. Si no tiene, no hay lugares. ----
    const cliR = await fetch(
      `${SB_URL}/rest/v1/clientes?auth_user_id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`,
      { headers: sbHeaders }
    );
    if (!cliR.ok) {
      const detail = await cliR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de cliente', detail }) };
    }
    const cliArr = await cliR.json();
    const cliente = Array.isArray(cliArr) ? cliArr[0] : null;
    if (!cliente || !cliente.id) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, lugares: [] }) };
    }

    // ---- 3. Sus lugares como ACOMPAÑANTE (numero>=2). El #1 = su titular. ----
    const lugR = await fetch(
      `${SB_URL}/rest/v1/lugares?cliente_id=eq.${encodeURIComponent(cliente.id)}&numero=gte.2`
      + `&select=id,numero,nombre,paquete,zona,tipo_habitacion,precio,estado,solicitud_id,invitacion_aceptada_at,habitacion_grupo_id`,
      { headers: sbHeaders }
    );
    if (!lugR.ok) {
      const detail = await lugR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de lugares', detail }) };
    }
    const lugares = await lugR.json();
    if (!Array.isArray(lugares) || lugares.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, lugares: [] }) };
    }

    // ---- 3b. Su CUARTO asignado (F4): habitación + compañeros de cuarto. ----
    //      Solo para lugares con habitacion_grupo_id. CURADO: de los compañeros
    //      solo se toma nombre/numero (nada de correos/estados/cliente_id/pagos).
    const habIds = [...new Set(lugares.map(l => l.habitacion_grupo_id).filter(Boolean))];
    const habById = {};
    const ocupPorHab = {};
    if (habIds.length) {
      const inHab = habIds.map(id => encodeURIComponent(id)).join(',');
      const [habR, ocupR] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/habitaciones_grupo?id=in.(${inHab})&select=id,tipo,orden`, { headers: sbHeaders }),
        fetch(`${SB_URL}/rest/v1/lugares?habitacion_grupo_id=in.(${inHab})&estado=eq.activo&select=id,nombre,numero,habitacion_grupo_id`, { headers: sbHeaders }),
      ]);
      if (habR.ok) (await habR.json()).forEach(h => { habById[h.id] = h; });
      if (ocupR.ok) (await ocupR.json()).forEach(o => { (ocupPorHab[o.habitacion_grupo_id] = ocupPorHab[o.habitacion_grupo_id] || []).push(o); });
    }

    // ---- 4. Cruzar con las solicitudes (solo evento + estado). ----
    // Se excluyen los lugares cuya solicitud esté cancelada o no exista.
    const solIds = [...new Set(lugares.map(l => l.solicitud_id).filter(Boolean))];
    const solById = {};
    if (solIds.length) {
      const inList = solIds.map(id => encodeURIComponent(id)).join(',');
      const solR = await fetch(
        `${SB_URL}/rest/v1/solicitudes_tour?id=in.(${inList})&select=id,evento_id,evento_nombre,estado`,
        { headers: sbHeaders }
      );
      if (!solR.ok) {
        const detail = await solR.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de solicitudes', detail }) };
      }
      const sols = await solR.json();
      (Array.isArray(sols) ? sols : []).forEach(s => { solById[s.id] = s; });
    }

    // ---- 5. Respuesta CURADA (nada de la solicitud salvo evento_id/nombre). ----
    const out = [];
    for (const l of lugares) {
      const sol = solById[l.solicitud_id];
      if (!sol) continue;                       // solicitud borrada/inaccesible → fuera
      if (sol.estado === 'cancelado') continue; // viaje cancelado → no lo mostramos
      // Cuarto asignado (o null). Compañeros = OTROS ocupantes activos, solo nombre.
      let habitacion = null;
      const hab = l.habitacion_grupo_id ? habById[l.habitacion_grupo_id] : null;
      if (hab) {
        const companeros = (ocupPorHab[l.habitacion_grupo_id] || [])
          .filter(o => o.id !== l.id)
          .map(o => (o.nombre && String(o.nombre).trim()) ? String(o.nombre).trim() : ('Lugar #' + o.numero));
        habitacion = { orden: hab.orden, tipo: hab.tipo, companeros };
      }
      out.push({
        // El id del lugar es SUYO (su cuenta lo aceptó) → sirve para que el portal
        // consulte su mini-plan de pagos vía RLS (F3-t6). No expone nada ajeno.
        lugar_id: l.id,
        evento_id: sol.evento_id,
        evento_nombre: sol.evento_nombre,
        numero: l.numero,
        paquete: l.paquete,
        zona: l.zona,
        tipo_habitacion: l.tipo_habitacion,
        precio: l.precio,
        estado: l.estado,
        habitacion,
      });
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, lugares: out }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error listando tus viajes', detail: e.message }) };
  }
};
