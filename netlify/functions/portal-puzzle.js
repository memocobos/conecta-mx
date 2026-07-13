// =============================================================================
// portal-puzzle  (Acompañantes F4-t2 — backend del PUZZLE de cuartos)
//
// La llama el TITULAR con su PROPIO JWT del portal para armar el "rompecabezas"
// de habitaciones de su grupo: crear/eliminar cuartos (habitaciones_grupo) y
// asignar/quitar sus lugares a un cuarto (lugares.habitacion_grupo_id).
//
// Este backend es SOLO ESCRITURAS. La LECTURA del estado va por el RLS existente
// (el titular ya lee sus lugares y sus habitaciones). La UI es la t3; la vista de
// Bulma la t4.
//
// REGLA DE NEGOCIO: el candado es de SOBRECUPO, no de subcupo — una Compartida
// (cap 4) con 3 asignados es válida; lo que NO se permite es meter un 5º. El
// puzzle acomoda PERSONAS, nunca toca precios/pagos/paquete/tipo_habitacion.
//
// CANDADO UNIVERSAL: toda acción resuelve la solicitud implicada y exige que sea
// del usuario (auth_user_id === user.id → 403) y no cancelada (409).
//
// Seguridad (mismo patrón que portal-lugar-actualizar): valida el JWT con
// GET /auth/v1/user (apikey ANON), y opera con service_role.
//
// CONCURRENCIA: el chequeo de cupo en 'asignar' es read-then-write (cuenta y
// luego escribe, sin lock). En el uso real —un titular acomodando a su grupo
// desde su teléfono— es suficiente; no se sobre-ingenieriza con locks/transacción.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY,
//                       PORTAL_SUPABASE_SERVICE_KEY. (Sin env vars nuevas.)
// =============================================================================

const UUID_RE = /^[0-9a-f-]{36}$/i;

// Tipos de cuarto FIJOS: la capacidad la fija el SERVIDOR según el tipo, nunca
// el body. Un tipo fuera de esta lista → 400.
const TIPOS = { Individual: 1, Doble: 2, Triple: 3, Compartida: 4 };

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  const json = (statusCode, payload) => ({ statusCode, headers, body: JSON.stringify(payload) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const SB_ANON    = process.env.PORTAL_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_ANON || !SB_SERVICE) {
    return json(500, { error: 'Faltan env vars (PORTAL_SUPABASE_*)' });
  }

  // ---- 1. Validar el JWT del titular ----
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return json(401, { error: 'Falta Authorization Bearer' });

  let user;
  try {
    const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + jwt },
    });
    if (!userResp.ok) return json(401, { error: 'JWT inválido o expirado' });
    user = await userResp.json();
  } catch (e) {
    return json(502, { error: 'No se pudo validar el JWT', detail: e.message });
  }
  if (!user || !user.id) return json(401, { error: 'JWT sin usuario' });

  // ---- 2. Body ----
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  const accion = body && typeof body.accion === 'string' ? body.accion : '';
  if (!['crear_habitacion', 'eliminar_habitacion', 'asignar', 'quitar'].includes(accion)) {
    return json(400, { error: 'accion inválida' });
  }

  const sbHeaders = {
    apikey: SB_SERVICE,
    Authorization: 'Bearer ' + SB_SERVICE,
    'Content-Type': 'application/json',
  };

  // GET de un recurso por id; devuelve la fila o null.
  const getOne = async (path) => {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
    if (!r.ok) return { err: json(502, { error: 'Supabase rechazó una consulta', detail: await r.text() }) };
    const arr = await r.json();
    return { row: Array.isArray(arr) ? arr[0] : null };
  };

  // CANDADO UNIVERSAL: la solicitud existe, es del usuario y no está cancelada.
  const candado = async (solId) => {
    const { row: sol, err } = await getOne(
      `solicitudes_tour?id=eq.${encodeURIComponent(solId)}&select=id,auth_user_id,estado&limit=1`
    );
    if (err) return { err };
    if (!sol) return { err: json(404, { error: 'Solicitud no encontrada' }) };
    if (sol.auth_user_id !== user.id) return { err: json(403, { error: 'Esta solicitud no es tuya' }) };
    if (sol.estado === 'cancelado') return { err: json(409, { error: 'Este tour fue cancelado' }) };
    return { sol };
  };

  const nowISO = new Date().toISOString();

  try {
    // ═══════════════ 1) crear_habitacion ═══════════════
    if (accion === 'crear_habitacion') {
      const solId = body.solicitud_id;
      if (!solId || !UUID_RE.test(solId)) return json(400, { error: 'solicitud_id inválido' });
      const tipo = body.tipo;
      if (!Object.prototype.hasOwnProperty.call(TIPOS, tipo)) {
        return json(400, { error: 'tipo inválido (Individual|Doble|Triple|Compartida)' });
      }
      const { err } = await candado(solId);
      if (err) return err;

      const capacidad = TIPOS[tipo]; // la fija el SERVIDOR, nunca el body

      // Habitaciones existentes (para el candado de sensatez y el orden).
      const habR = await fetch(
        `${SB_URL}/rest/v1/habitaciones_grupo?solicitud_id=eq.${encodeURIComponent(solId)}&select=capacidad,orden`,
        { headers: sbHeaders }
      );
      if (!habR.ok) return json(502, { error: 'Supabase rechazó la consulta de habitaciones', detail: await habR.text() });
      const habs = await habR.json();
      const sumaCap = (Array.isArray(habs) ? habs : []).reduce((a, h) => a + (Number(h.capacidad) || 0), 0);
      const maxOrden = (Array.isArray(habs) ? habs : []).reduce((m, h) => Math.max(m, Number(h.orden) || 0), 0);

      // Lugares ACTIVOS de la solicitud (los baja/traspasado no cuentan).
      const lugR = await fetch(
        `${SB_URL}/rest/v1/lugares?solicitud_id=eq.${encodeURIComponent(solId)}&estado=eq.activo&select=id`,
        { headers: sbHeaders }
      );
      if (!lugR.ok) return json(502, { error: 'Supabase rechazó la consulta de lugares', detail: await lugR.text() });
      const lugares = await lugR.json();
      const activos = Array.isArray(lugares) ? lugares.length : 0;

      // CANDADO de sensatez: si los cuartos ya cubren a todos, no crear más.
      if (sumaCap >= activos) {
        return json(409, { error: 'Tus cuartos ya cubren a todo el grupo' });
      }

      const insR = await fetch(`${SB_URL}/rest/v1/habitaciones_grupo`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ solicitud_id: solId, tipo, capacidad, orden: maxOrden + 1 }),
      });
      if (!insR.ok) return json(502, { error: 'No se pudo crear la habitación', detail: await insR.text() });
      const insArr = await insR.json();
      return json(200, { ok: true, habitacion: Array.isArray(insArr) ? insArr[0] : insArr });
    }

    // ═══════════════ 2) eliminar_habitacion ═══════════════
    if (accion === 'eliminar_habitacion') {
      const habId = body.habitacion_id;
      if (!habId || !UUID_RE.test(habId)) return json(400, { error: 'habitacion_id inválido' });
      const { row: hab, err: e1 } = await getOne(
        `habitaciones_grupo?id=eq.${encodeURIComponent(habId)}&select=id,solicitud_id&limit=1`
      );
      if (e1) return e1;
      if (!hab) return json(404, { error: 'Habitación no encontrada' });
      const { err } = await candado(hab.solicitud_id);
      if (err) return err;

      // AMIGABLE: primero desasignar a sus ocupantes, luego borrar el cuarto.
      const desR = await fetch(
        `${SB_URL}/rest/v1/lugares?habitacion_grupo_id=eq.${encodeURIComponent(habId)}`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ habitacion_grupo_id: null, updated_at: nowISO }),
        }
      );
      if (!desR.ok) return json(502, { error: 'No se pudo desasignar a los ocupantes', detail: await desR.text() });
      const desArr = await desR.json();
      const desasignados = Array.isArray(desArr) ? desArr.length : 0;

      const delR = await fetch(`${SB_URL}/rest/v1/habitaciones_grupo?id=eq.${encodeURIComponent(habId)}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!delR.ok) return json(502, { error: 'No se pudo eliminar la habitación', detail: await delR.text() });
      return json(200, { ok: true, desasignados });
    }

    // ═══════════════ 3) asignar ═══════════════
    if (accion === 'asignar') {
      const lugarId = body.lugar_id;
      const habId = body.habitacion_id;
      if (!lugarId || !UUID_RE.test(lugarId)) return json(400, { error: 'lugar_id inválido' });
      if (!habId || !UUID_RE.test(habId)) return json(400, { error: 'habitacion_id inválido' });

      const { row: lugar, err: e1 } = await getOne(
        `lugares?id=eq.${encodeURIComponent(lugarId)}&select=id,solicitud_id,estado,habitacion_grupo_id&limit=1`
      );
      if (e1) return e1;
      if (!lugar) return json(404, { error: 'Lugar no encontrado' });
      if (lugar.estado !== 'activo') return json(409, { error: 'Ese lugar no se puede asignar (no está activo)' });

      const { row: hab, err: e2 } = await getOne(
        `habitaciones_grupo?id=eq.${encodeURIComponent(habId)}&select=id,solicitud_id,capacidad&limit=1`
      );
      if (e2) return e2;
      if (!hab) return json(404, { error: 'Habitación no encontrada' });

      // Candado universal por la solicitud del lugar.
      const { err } = await candado(lugar.solicitud_id);
      if (err) return err;

      // El lugar y la habitación deben ser de la MISMA solicitud.
      if (lugar.solicitud_id !== hab.solicitud_id) {
        return json(400, { error: 'El lugar y la habitación son de solicitudes distintas' });
      }

      // Idempotente: ya está en ESTE cuarto → 200 sin contar doble ni reescribir.
      if (lugar.habitacion_grupo_id === habId) return json(200, { ok: true });

      // CUPO (sobrecupo): cuenta actual del cuarto destino. El lugar a asignar NO
      // está en este cuarto (ya se manejó el caso idempotente), así que no infla el
      // conteo. Si mover desde otro cuarto, el PATCH lo saca del anterior al sobreescribir.
      const ocupR = await fetch(
        `${SB_URL}/rest/v1/lugares?habitacion_grupo_id=eq.${encodeURIComponent(habId)}&select=id`,
        { headers: sbHeaders }
      );
      if (!ocupR.ok) return json(502, { error: 'Supabase rechazó la consulta de ocupantes', detail: await ocupR.text() });
      const ocupantes = await ocupR.json();
      const count = Array.isArray(ocupantes) ? ocupantes.length : 0;
      if (count >= Number(hab.capacidad || 0)) {
        return json(409, { error: 'Ese cuarto ya está lleno' });
      }

      const upR = await fetch(`${SB_URL}/rest/v1/lugares?id=eq.${encodeURIComponent(lugarId)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ habitacion_grupo_id: habId, updated_at: nowISO }),
      });
      if (!upR.ok) return json(502, { error: 'No se pudo asignar el lugar', detail: await upR.text() });
      return json(200, { ok: true });
    }

    // ═══════════════ 4) quitar ═══════════════
    if (accion === 'quitar') {
      const lugarId = body.lugar_id;
      if (!lugarId || !UUID_RE.test(lugarId)) return json(400, { error: 'lugar_id inválido' });
      const { row: lugar, err: e1 } = await getOne(
        `lugares?id=eq.${encodeURIComponent(lugarId)}&select=id,solicitud_id&limit=1`
      );
      if (e1) return e1;
      if (!lugar) return json(404, { error: 'Lugar no encontrado' });
      const { err } = await candado(lugar.solicitud_id);
      if (err) return err;

      const upR = await fetch(`${SB_URL}/rest/v1/lugares?id=eq.${encodeURIComponent(lugarId)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ habitacion_grupo_id: null, updated_at: nowISO }),
      });
      if (!upR.ok) return json(502, { error: 'No se pudo quitar el lugar del cuarto', detail: await upR.text() });
      return json(200, { ok: true });
    }

    return json(400, { error: 'accion inválida' });
  } catch (e) {
    return json(502, { error: 'Error en el puzzle de cuartos', detail: e.message });
  }
};
