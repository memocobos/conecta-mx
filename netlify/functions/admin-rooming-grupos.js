// =============================================================================
// admin-rooming-grupos  (Acompañantes F4-t4 — rooming de GRUPOS para Bulma)
//
// La vista de Capsule (sub-tab Rooming) para que Bulma vea y AJUSTE los cuartos
// que los TITULARES armaron en el Portal (habitaciones_grupo + lugares). Es una
// SECCIÓN NUEVA junto al rooming KH (rooming_habitaciones), que NO se toca.
//
// Decisión de Memo: el puzzle lo arma el titular (portal-puzzle, #235/#237); el
// ajuste fino es de Bulma → este backend expone las MISMAS 4 acciones con auth de
// admin (verifyAdminAuth, roles maestro_roshi/bulma) en vez del candado de dueño.
//
// Seguridad/roles: molde de admin-rooming (verifyAdminAuth + corsCheck). Los datos
// del puzzle viven en el PORTAL, así que usa PORTAL_SUPABASE_* (patrón
// admin-posponer-evento), NO las env de KH.
//
// CANDADOS de las escrituras: CALCA DELIBERADA de portal-puzzle.js (#235) — tipos
// fijos por servidor, sensatez, sobrecupo con idempotencia, candado cruzado, lugar
// activo, solicitud no cancelada — MENOS el de dueño (auth_user_id), porque Bulma
// es admin. Cualquier cambio de regla debe hacerse en AMBOS a la vez.
//
// CONCURRENCIA: el cupo en 'asignar' es read-then-write (igual que #235). Suficiente
// para el uso real (Bulma ajustando un grupo); sin locks.
//
// Env vars: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-f-]{36}$/i;
const SLUG_RE = /^[a-zA-Z0-9_#-]{1,80}$/; // evento_id = slug (o slug#idx multifecha)
const ROLES = ['maestro_roshi', 'bulma', 'milk'];

// Tipos de cuarto FIJOS: la capacidad la fija el SERVIDOR según el tipo (calca #235).
const TIPOS = { Individual: 1, Doble: 2, Triple: 3, Compartida: 4 };

const ACCIONES = {
  listar: ROLES,
  crear_habitacion: ROLES,
  eliminar_habitacion: ROLES,
  asignar: ROLES,
  quitar: ROLES,
};

const PORTAL_URL = process.env.PORTAL_SUPABASE_URL;
const PORTAL_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (statusCode, payload) => ({ statusCode, headers, body: JSON.stringify(payload) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!__origin) return json(403, { error: 'Origen no permitido' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  const accion = body.accion;
  if (!(accion in ACCIONES)) return json(400, { error: 'accion inválida' });

  const auth = verifyAdminAuth(event, ACCIONES[accion]);
  if (!auth.valid) return json(auth.status, { error: auth.error });

  if (!PORTAL_URL || !PORTAL_KEY) {
    return json(500, { error: 'Portal Supabase no configurado (PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY)' });
  }

  const sbHeaders = {
    apikey: PORTAL_KEY,
    Authorization: 'Bearer ' + PORTAL_KEY,
    'Content-Type': 'application/json',
  };
  const enc = encodeURIComponent;

  const getOne = async (path) => {
    const r = await fetch(`${PORTAL_URL}/rest/v1/${path}`, { headers: sbHeaders });
    if (!r.ok) return { err: json(502, { error: 'Supabase rechazó una consulta', detail: await r.text() }) };
    const arr = await r.json();
    return { row: Array.isArray(arr) ? arr[0] : null };
  };

  // CANDADO (admin): la solicitud existe y NO está cancelada. Sin el de dueño (#235
  // exige auth_user_id === user.id; aquí Bulma es admin y puede ajustar cualquiera).
  const candado = async (solId) => {
    const { row: sol, err } = await getOne(`solicitudes_tour?id=eq.${enc(solId)}&select=id,estado&limit=1`);
    if (err) return { err };
    if (!sol) return { err: json(404, { error: 'Solicitud no encontrada' }) };
    if (sol.estado === 'cancelado') return { err: json(409, { error: 'Este tour fue cancelado' }) };
    return { sol };
  };

  const nowISO = new Date().toISOString();

  try {
    // ═══════════════ listar ═══════════════
    if (accion === 'listar') {
      const eventoId = String(body.evento_id || '').trim();
      if (!eventoId || !SLUG_RE.test(eventoId)) return json(400, { error: 'evento_id inválido' });
      // Multifecha: el Portal guarda las solicitudes con evento_id='slug#idx'
      // (portal.html: ev.id + '#' + multifechaIdx). El front lista por el slug
      // BASE, así que hay que reunir la base + todas sus fechas. slugBase = el
      // slug sin el sufijo '#idx', re-saneado a SOLO [a-z0-9_-] antes de entrar
      // al filtro like (anti-inyección en el or= de PostgREST).
      const slugBase = eventoId.split('#')[0];
      if (!/^[a-z0-9_-]+$/.test(slugBase)) return json(400, { error: 'evento_id inválido' });
      // [F6-t2] Con todos:true, la lista de COORDIS incluye también solicitudes de 1
      // lugar y enriquece cada lugar con el contacto de su persona. SIN el flag, la
      // respuesta queda EXACTA de hoy (#238/#242 no se enteran).
      const todos = body.todos === true;

      // Unión base + fechas: or=(evento_id.eq.<slug>, evento_id.like.<slug>#*).
      // El '#' viaja como %23 (si no, HTTP lo tomaría como fragmento) y el '*' es
      // el comodín de PostgREST like. slugBase ya está saneado a [a-z0-9_-], así
      // que es seguro interpolarlo sin encodeURIComponent (que rompería el or=).
      const eventoFiltro = `or=(evento_id.eq.${slugBase},evento_id.like.${slugBase}%23*)`;
      const solR = await fetch(
        `${PORTAL_URL}/rest/v1/solicitudes_tour?${eventoFiltro}&estado=neq.cancelado`
        + `&select=id,cliente_id,evento_id,evento_nombre,num_personas`,
        { headers: sbHeaders }
      );
      if (!solR.ok) return json(502, { error: 'Supabase rechazó la consulta de solicitudes', detail: await solR.text() });
      const solicitudes = await solR.json();
      const sols = Array.isArray(solicitudes) ? solicitudes : [];
      if (!sols.length) return json(200, { ok: true, grupos: [] });

      const solIds = sols.map(s => s.id);
      const inSol = solIds.map(enc).join(',');

      // Los campos extra (correo/paquete/zona/fecha_nacimiento) se seleccionan
      // siempre pero SOLO se emiten con `todos` — el map base los ignora.
      const [lugR, habR] = await Promise.all([
        fetch(`${PORTAL_URL}/rest/v1/lugares?solicitud_id=in.(${inSol})&select=id,solicitud_id,numero,nombre,estado,habitacion_grupo_id,cliente_id,correo,paquete,zona,fecha_nacimiento&order=numero.asc`, { headers: sbHeaders }),
        fetch(`${PORTAL_URL}/rest/v1/habitaciones_grupo?solicitud_id=in.(${inSol})&select=id,solicitud_id,tipo,capacidad,orden&order=orden.asc`, { headers: sbHeaders }),
      ]);
      if (!lugR.ok) return json(502, { error: 'Supabase rechazó la consulta de lugares', detail: await lugR.text() });
      if (!habR.ok) return json(502, { error: 'Supabase rechazó la consulta de habitaciones', detail: await habR.text() });
      const lugares = await lugR.json();
      const habitaciones = await habR.json();

      // Clientes: titulares siempre (para titular_nombre). Con `todos`, también los
      // dueños de cada lugar + columnas de contacto (correo/celular).
      const lugCliIds = todos ? (Array.isArray(lugares) ? lugares : []).filter(l => l.cliente_id).map(l => l.cliente_id) : [];
      const cliIds = [...new Set([...sols.map(s => s.cliente_id), ...lugCliIds].filter(Boolean))];
      const cliSelect = todos ? 'id,nombre_completo,correo,celular' : 'id,nombre_completo';
      const cliMap = {};
      if (cliIds.length) {
        const cliR = await fetch(`${PORTAL_URL}/rest/v1/clientes?id=in.(${cliIds.map(enc).join(',')})&select=${cliSelect}`, { headers: sbHeaders });
        if (cliR.ok) (await cliR.json()).forEach(c => { cliMap[c.id] = c; });
      }

      const lugPorSol = {}, habPorSol = {};
      (Array.isArray(lugares) ? lugares : []).forEach(l => { (lugPorSol[l.solicitud_id] = lugPorSol[l.solicitud_id] || []).push(l); });
      (Array.isArray(habitaciones) ? habitaciones : []).forEach(h => { (habPorSol[h.solicitud_id] = habPorSol[h.solicitud_id] || []).push(h); });

      const grupos = [];
      for (const s of sols) {
        const lugs = lugPorSol[s.id] || [];
        // Sin `todos`: solo grupos con 2+ lugares (los demás no tienen puzzle).
        // Con `todos`: cualquiera con al menos 1 lugar (incluye los individuales).
        if (todos ? !lugs.length : lugs.length < 2) continue;
        const cli = cliMap[s.cliente_id] || {};
        grupos.push({
          solicitud_id: s.id,
          titular_nombre: (cli.nombre_completo && String(cli.nombre_completo).trim()) || 'Titular',
          evento_nombre: s.evento_nombre || '',
          evento_id: s.evento_id || '', // real (con #idx en multifecha) → el front distingue fechas
          lugares: lugs.map(l => {
            const base = {
              id: l.id, numero: l.numero, nombre: l.nombre, estado: l.estado,
              habitacion_grupo_id: l.habitacion_grupo_id, cliente_id: l.cliente_id,
            };
            if (!todos) return base;
            // Contacto: si el lugar tiene cliente (aceptó) → su perfil; si no → lo
            // capturado en el lugar (nombre/correo). celular solo del perfil.
            const lc = l.cliente_id ? (cliMap[l.cliente_id] || {}) : {};
            return {
              ...base,
              nombre: (l.nombre && String(l.nombre).trim()) || (lc.nombre_completo || null),
              correo: l.cliente_id ? (lc.correo || null) : (l.correo || null),
              celular: l.cliente_id ? (lc.celular || null) : null,
              paquete: l.paquete || null,
              zona: l.zona || null,
              fecha_nacimiento: l.fecha_nacimiento || null,
            };
          }),
          habitaciones: (habPorSol[s.id] || []).map(h => ({ id: h.id, tipo: h.tipo, capacidad: h.capacidad, orden: h.orden })),
        });
      }
      return json(200, { ok: true, grupos });
    }

    // ═══════════════ crear_habitacion ═══════════════ (calca #235)
    if (accion === 'crear_habitacion') {
      const solId = body.solicitud_id;
      if (!solId || !UUID_RE.test(solId)) return json(400, { error: 'solicitud_id inválido' });
      const tipo = body.tipo;
      if (!Object.prototype.hasOwnProperty.call(TIPOS, tipo)) {
        return json(400, { error: 'tipo inválido (Individual|Doble|Triple|Compartida)' });
      }
      const { err } = await candado(solId);
      if (err) return err;

      const capacidad = TIPOS[tipo]; // la fija el SERVIDOR

      const habR = await fetch(
        `${PORTAL_URL}/rest/v1/habitaciones_grupo?solicitud_id=eq.${enc(solId)}&select=capacidad,orden`,
        { headers: sbHeaders }
      );
      if (!habR.ok) return json(502, { error: 'Supabase rechazó la consulta de habitaciones', detail: await habR.text() });
      const habs = await habR.json();
      const sumaCap = (Array.isArray(habs) ? habs : []).reduce((a, h) => a + (Number(h.capacidad) || 0), 0);
      const maxOrden = (Array.isArray(habs) ? habs : []).reduce((m, h) => Math.max(m, Number(h.orden) || 0), 0);

      const lugR = await fetch(
        `${PORTAL_URL}/rest/v1/lugares?solicitud_id=eq.${enc(solId)}&estado=eq.activo&select=id`,
        { headers: sbHeaders }
      );
      if (!lugR.ok) return json(502, { error: 'Supabase rechazó la consulta de lugares', detail: await lugR.text() });
      const lugares = await lugR.json();
      const activos = Array.isArray(lugares) ? lugares.length : 0;

      if (sumaCap >= activos) return json(409, { error: 'Tus cuartos ya cubren a todo el grupo' });

      const insR = await fetch(`${PORTAL_URL}/rest/v1/habitaciones_grupo`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ solicitud_id: solId, tipo, capacidad, orden: maxOrden + 1 }),
      });
      if (!insR.ok) return json(502, { error: 'No se pudo crear la habitación', detail: await insR.text() });
      const insArr = await insR.json();
      return json(200, { ok: true, habitacion: Array.isArray(insArr) ? insArr[0] : insArr });
    }

    // ═══════════════ eliminar_habitacion ═══════════════ (calca #235)
    if (accion === 'eliminar_habitacion') {
      const habId = body.habitacion_id;
      if (!habId || !UUID_RE.test(habId)) return json(400, { error: 'habitacion_id inválido' });
      const { row: hab, err: e1 } = await getOne(`habitaciones_grupo?id=eq.${enc(habId)}&select=id,solicitud_id&limit=1`);
      if (e1) return e1;
      if (!hab) return json(404, { error: 'Habitación no encontrada' });
      const { err } = await candado(hab.solicitud_id);
      if (err) return err;

      const desR = await fetch(`${PORTAL_URL}/rest/v1/lugares?habitacion_grupo_id=eq.${enc(habId)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ habitacion_grupo_id: null, updated_at: nowISO }),
      });
      if (!desR.ok) return json(502, { error: 'No se pudo desasignar a los ocupantes', detail: await desR.text() });
      const desArr = await desR.json();
      const desasignados = Array.isArray(desArr) ? desArr.length : 0;

      const delR = await fetch(`${PORTAL_URL}/rest/v1/habitaciones_grupo?id=eq.${enc(habId)}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!delR.ok) return json(502, { error: 'No se pudo eliminar la habitación', detail: await delR.text() });
      return json(200, { ok: true, desasignados });
    }

    // ═══════════════ asignar ═══════════════ (calca #235)
    if (accion === 'asignar') {
      const lugarId = body.lugar_id;
      const habId = body.habitacion_id;
      if (!lugarId || !UUID_RE.test(lugarId)) return json(400, { error: 'lugar_id inválido' });
      if (!habId || !UUID_RE.test(habId)) return json(400, { error: 'habitacion_id inválido' });

      const { row: lugar, err: e1 } = await getOne(
        `lugares?id=eq.${enc(lugarId)}&select=id,solicitud_id,estado,habitacion_grupo_id&limit=1`
      );
      if (e1) return e1;
      if (!lugar) return json(404, { error: 'Lugar no encontrado' });
      if (lugar.estado !== 'activo') return json(409, { error: 'Ese lugar no se puede asignar (no está activo)' });

      const { row: hab, err: e2 } = await getOne(
        `habitaciones_grupo?id=eq.${enc(habId)}&select=id,solicitud_id,capacidad&limit=1`
      );
      if (e2) return e2;
      if (!hab) return json(404, { error: 'Habitación no encontrada' });

      const { err } = await candado(lugar.solicitud_id);
      if (err) return err;

      if (lugar.solicitud_id !== hab.solicitud_id) {
        return json(400, { error: 'El lugar y la habitación son de solicitudes distintas' });
      }

      if (lugar.habitacion_grupo_id === habId) return json(200, { ok: true }); // idempotente

      const ocupR = await fetch(
        `${PORTAL_URL}/rest/v1/lugares?habitacion_grupo_id=eq.${enc(habId)}&select=id`,
        { headers: sbHeaders }
      );
      if (!ocupR.ok) return json(502, { error: 'Supabase rechazó la consulta de ocupantes', detail: await ocupR.text() });
      const ocupantes = await ocupR.json();
      const count = Array.isArray(ocupantes) ? ocupantes.length : 0;
      if (count >= Number(hab.capacidad || 0)) return json(409, { error: 'Ese cuarto ya está lleno' });

      const upR = await fetch(`${PORTAL_URL}/rest/v1/lugares?id=eq.${enc(lugarId)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ habitacion_grupo_id: habId, updated_at: nowISO }),
      });
      if (!upR.ok) return json(502, { error: 'No se pudo asignar el lugar', detail: await upR.text() });
      return json(200, { ok: true });
    }

    // ═══════════════ quitar ═══════════════ (calca #235)
    if (accion === 'quitar') {
      const lugarId = body.lugar_id;
      if (!lugarId || !UUID_RE.test(lugarId)) return json(400, { error: 'lugar_id inválido' });
      const { row: lugar, err: e1 } = await getOne(`lugares?id=eq.${enc(lugarId)}&select=id,solicitud_id&limit=1`);
      if (e1) return e1;
      if (!lugar) return json(404, { error: 'Lugar no encontrado' });
      const { err } = await candado(lugar.solicitud_id);
      if (err) return err;

      const upR = await fetch(`${PORTAL_URL}/rest/v1/lugares?id=eq.${enc(lugarId)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ habitacion_grupo_id: null, updated_at: nowISO }),
      });
      if (!upR.ok) return json(502, { error: 'No se pudo quitar el lugar del cuarto', detail: await upR.text() });
      return json(200, { ok: true });
    }

    return json(400, { error: 'accion inválida' });
  } catch (e) {
    return json(502, { error: 'Error en el rooming de grupos', detail: e.message });
  }
};
