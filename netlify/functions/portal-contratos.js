// =============================================================================
// portal-contratos  (Contratos F3a — estado de firma por lugar, para el portal)
//
// Devuelve, por lugar relevante para el usuario autenticado, el estado de su
// contrato y —SOLO cuando la regla de visibilidad lo permite— el token para
// firmar. JAMÁS viaja al navegador un token ajeno.
//
// REGLA DE VISIBILIDAD DEL TOKEN (por lugar L, usuario CU):
//   · L es de CU (L.cliente_id === CU)                              → token visible
//   · CU es TITULAR de la solicitud de L y L NO está conectado
//     (L.cliente_id == null: menores / sin invitar)                → token visible
//   · resto (lugares conectados de otros)                          → SOLO estado (chip)
//   · lugar sin contrato vivo (solicitudes viejas pre-módulo)      → no aparece
//
// El acompañante (no titular) solo ve SUS lugares (nunca el grupo). Read con
// service_role tras validar el JWT del portal (patrón portal-mis-lugares).
//
//   GET (Authorization: Bearer <jwt>) → { ok, contratos:{ [lugar_id]:{estado, token?} },
//                                          pendientes:[{lugar_id, token, evento_nombre}] }
//
// Env vars: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY, PORTAL_SUPABASE_SERVICE_KEY.
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

  // ---- 1. Validar el JWT del usuario ----
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Falta Authorization Bearer' }) };

  let user;
  try {
    const uR = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + jwt } });
    if (!uR.ok) return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT inválido o expirado' }) };
    user = await uR.json();
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo validar el JWT', detail: e.message }) };
  }
  if (!user || !user.id) return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT sin usuario' }) };

  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE };
  const empty = { statusCode: 200, headers, body: JSON.stringify({ ok: true, contratos: {}, pendientes: [] }) };

  try {
    // ---- 2. cliente_id del usuario (CU) ----
    const cliR = await fetch(`${SB_URL}/rest/v1/clientes?auth_user_id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`, { headers: sb });
    if (!cliR.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de cliente' }) };
    const CU = ((await cliR.json().catch(() => []))[0] || {}).id;
    if (!CU) return empty;

    // ---- 3. Solicitudes donde CU es TITULAR (sol.cliente_id === CU) ----
    const tR = await fetch(`${SB_URL}/rest/v1/solicitudes_tour?cliente_id=eq.${encodeURIComponent(CU)}&select=id,evento_nombre,estado`, { headers: sb });
    const titularSols = tR.ok ? (await tR.json().catch(() => [])) : [];
    const titularSet = new Set();
    const solById = {};
    for (const s of (Array.isArray(titularSols) ? titularSols : [])) {
      if (s.estado === 'cancelado') continue;
      titularSet.add(s.id); solById[s.id] = s;
    }

    // ---- 4. Lugares de CU (propios) ----
    const lcR = await fetch(`${SB_URL}/rest/v1/lugares?cliente_id=eq.${encodeURIComponent(CU)}&select=id,numero,cliente_id,solicitud_id`, { headers: sb });
    const propios = lcR.ok ? (await lcR.json().catch(() => [])) : [];

    // ---- 5. Todos los lugares de las solicitudes donde CU es titular ----
    let deGrupo = [];
    if (titularSet.size) {
      const inSol = [...titularSet].map(encodeURIComponent).join(',');
      const gR = await fetch(`${SB_URL}/rest/v1/lugares?solicitud_id=in.(${inSol})&select=id,numero,cliente_id,solicitud_id`, { headers: sb });
      if (gR.ok) deGrupo = await gR.json().catch(() => []);
    }

    // ---- 6. Nombres de evento para las solicitudes de los lugares propios (banner) ----
    const solIdsFaltantes = [...new Set((Array.isArray(propios) ? propios : []).map(l => l.solicitud_id).filter(id => id && !solById[id]))];
    if (solIdsFaltantes.length) {
      const inS = solIdsFaltantes.map(encodeURIComponent).join(',');
      const sR = await fetch(`${SB_URL}/rest/v1/solicitudes_tour?id=in.(${inS})&select=id,evento_nombre,estado`, { headers: sb });
      if (sR.ok) (await sR.json().catch(() => [])).forEach(s => { if (s.estado !== 'cancelado') solById[s.id] = s; });
    }

    // ---- 7. Unión de lugares relevantes (dedupe por id) ----
    const byId = {};
    for (const l of [...(Array.isArray(propios) ? propios : []), ...(Array.isArray(deGrupo) ? deGrupo : [])]) {
      if (l && l.id) byId[l.id] = l;
    }
    // Solo lugares cuya solicitud existe y no está cancelada.
    const lugares = Object.values(byId).filter(l => solById[l.solicitud_id]);
    if (!lugares.length) return empty;

    // ---- 8. Contratos vivos de esos lugares ----
    const inLug = lugares.map(l => encodeURIComponent(l.id)).join(',');
    const ctR = await fetch(`${SB_URL}/rest/v1/contratos_viajeros?lugar_id=in.(${inLug})&estado=neq.anulado&select=lugar_id,estado,token`, { headers: sb });
    const ctByLugar = {};
    if (ctR.ok) (await ctR.json().catch(() => [])).forEach(c => { ctByLugar[c.lugar_id] = c; });

    // ---- 9. Armar salida con el token GATEADO por la regla ----
    const contratos = {};
    const pendientes = [];
    for (const l of lugares) {
      const ct = ctByLugar[l.id];
      if (!ct) continue; // sin contrato vivo → no aparece (UI no muestra nada de firma)
      const isOwn = String(l.cliente_id) === String(CU);
      const isTitularSol = titularSet.has(l.solicitud_id);
      const tokenVisible = isOwn || (isTitularSol && (l.cliente_id == null));
      const entry = { estado: ct.estado };
      if (tokenVisible) entry.token = ct.token;
      contratos[l.id] = entry;
      if (ct.estado === 'pendiente' && tokenVisible) {
        pendientes.push({ lugar_id: l.id, token: ct.token, evento_nombre: (solById[l.solicitud_id] || {}).evento_nombre || 'tu viaje' });
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, contratos, pendientes }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando contratos', detail: e.message }) };
  }
};
