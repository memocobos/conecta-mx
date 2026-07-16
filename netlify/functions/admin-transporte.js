// =============================================================================
// admin-transporte  (☁️ Nube Voladora F2 — backend del transporte)
//
// Administra `transporte_unidades` / `transporte_pasajeros` (KH, tablas de la F1)
// para que Bulma arme las unidades de un evento y suba pasajeros POR CUARTO DE
// HOTEL (regla de oro de Memo: los cuartos son los ladrillos → 'asignar' y
// 'quitar' trabajan EN LOTE, nunca de a una persona).
//
// Body JSON: { accion, ... }. Roles: maestro_roshi / bulma.
//   - 'listar'          { evento_id } → { ok, unidades, universo, resumen }
//   - 'crear_unidad'    { evento_id, tipo, capacidad, chofer_ocupa?, chofer_nombre?, autollenar? }
//                       → { ok, unidad, auto_asignados }
//   - 'asignar'         { unidad_id, pasajeros:[{tipo,ref}] } → { ok, asignados, movidos }
//   - 'quitar'          { unidad_id, pasajeros:[{tipo,ref}] } → { ok, quitados }
//   - 'editar_unidad'   { unidad_id, tipo?, capacidad?, chofer_ocupa?, chofer_nombre?, coordi_id?, notas? }
//                       → { ok, unidad }
//   - 'eliminar_unidad' { unidad_id } → { ok, desasignados }
//
// PASAJEROS DE DOS MUNDOS + personajes (CHECK de la F1: 'lugar'|'viajero'|'usuario'):
//   - 'lugar'   → PORTAL `lugares.id`          (clientes que compraron por el Portal)
//   - 'viajero' → KH `viajeros_evento.id`      (clientes/staff del mundo KH)
//   - 'usuario' → KH `usuarios.id`             (coordis y creadoras — PERSONAJES)
// Los personajes NUNCA cuentan en `resumen.total_pasajeros` ni en el autollenado:
// suben a mano (decisión de Memo).
//
// DOS PROYECTOS: las unidades/pasajeros y los viajeros/usuarios viven en KH
// (SUPABASE_*_KAMEHOUSE, molde admin-coordi-asignaciones); los lugares y sus
// cuartos viven en el PORTAL (PORTAL_SUPABASE_*, molde admin-rooming-grupos). La
// env del Portal se exige SOLO en las acciones que la usan.
//
// ⚠️ CUARTOS KH — POR QUÉ NO SE FILTRA `rooming_habitaciones` POR EL EVENTO:
// esa tabla tiene `evento_id` **uuid** con FK a la tabla legacy `eventos(id)`,
// NO el slug que maneja esta tuerca (`eventos_coordi`/`viajeros_evento` sí usan
// slug). Filtrarla por slug reventaría en Postgres (22P02 invalid input syntax
// for uuid) → 502. Así que los cuartos KH se arman AL REVÉS: viajeros del evento
// (por slug) → sus `habitacion_id` → esos cuartos POR ID. Mismo ladrillo, sin
// depender del keyspace legacy. (La columna `rooming_habitaciones.ocupantes` es
// jsonb con NOMBRES sueltos, sin ids: no sirve como pasajero y se ignora.)
//
// CONCURRENCIA: el cupo es read-then-write (igual que #235/#231), sin locks. El
// UNIQUE (evento_id, pasajero_tipo, pasajero_ref) de la F1 es el que garantiza
// una-unidad-por-persona aunque haya carrera; el cupo puede pasarse solo si dos
// admins asignan al mismo cuarto en el mismo instante (uso real: Bulma sola).
//
// Env vars: SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET,
//           PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[A-Za-z0-9_#.\-]+$/;   // evento_id (slug del EV, p.ej. 'karolg#2')
const ROLES = ['maestro_roshi', 'bulma'];

const TIPOS_UNIDAD = ['Van', 'Autobús', 'Otro'];
const TIPOS_PASAJERO = ['lugar', 'viajero', 'usuario']; // == CHECK de la F1
const ROLES_COORDI = ['coordinador', 'cc'];             // quién puede ir de coordi de unidad
const CAP_MIN = 1, CAP_MAX = 100;
const MAX_LOTE = 200;

const ACCIONES = {
  listar: ROLES,
  crear_unidad: ROLES,
  asignar: ROLES,
  quitar: ROLES,
  editar_unidad: ROLES,
  eliminar_unidad: ROLES,
};

const U_COLS = 'id,evento_id,tipo,capacidad,orden,chofer_ocupa,chofer_nombre,coordi_id,notas';
const P_COLS = 'id,unidad_id,evento_id,pasajero_tipo,pasajero_ref,nombre_cache';

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

  const env = readEnvKH();
  if (env.error) return json(500, { error: env.error });

  const kh = sbClient(env.KH_SB_URL, env.KH_SB_SERVICE);
  // El Portal solo se instancia si está configurado; quien lo necesite exige env.
  const portal = (PORTAL_URL && PORTAL_KEY) ? sbClient(PORTAL_URL, PORTAL_KEY) : null;
  const necesitaPortal = () => portal
    ? null
    : json(500, { error: 'Portal Supabase no configurado (PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY)' });

  try {
    // ═══════════════ listar ═══════════════
    if (accion === 'listar') {
      const eventoId = limpiaEvento(body.evento_id);
      if (!eventoId) return json(400, { error: 'evento_id inválido' });
      const faltaPortal = necesitaPortal(); if (faltaPortal) return faltaPortal;

      const [unidades, pasajeros] = await cargarUnidades(kh, eventoId);

      // Asignación actual de cada persona: `${tipo}:${ref}` → unidad_id.
      const asignadoPor = {};
      pasajeros.forEach(p => { asignadoPor[`${p.pasajero_tipo}:${p.pasajero_ref}`] = p.unidad_id; });

      const [mundoPortal, mundoKH, personajes] = await Promise.all([
        cargarMundoPortal(portal, eventoId, asignadoPor),
        cargarMundoKH(kh, eventoId, asignadoPor),
        cargarPersonajes(kh, eventoId, asignadoPor),
      ]);

      // Coordis de las unidades (nombre para pintar el chip).
      const coordiIds = [...new Set(unidades.map(u => u.coordi_id).filter(Boolean))];
      const coordiMap = {};
      if (coordiIds.length) {
        const us = await kh.get(`usuarios?id=in.(${coordiIds.map(enc).join(',')})&select=id,nombre`);
        us.forEach(u => { coordiMap[u.id] = u; });
      }

      const paxPorUnidad = {};
      pasajeros.forEach(p => { paxPorUnidad[p.unidad_id] = (paxPorUnidad[p.unidad_id] || 0) + 1; });

      const unidadesOut = unidades.map(u => {
        const pax = paxPorUnidad[u.id] || 0;
        const neta = capacidadNeta(u.capacidad, u.chofer_ocupa);
        const c = u.coordi_id ? coordiMap[u.coordi_id] : null;
        return {
          ...u,
          coordi: c ? { id: c.id, nombre: c.nombre } : null,
          // `ocupados` = asientos usados sobre la capacidad TOTAL (incluye al chofer
          // si viaja). Los candados de cupo usan `pasajeros_count` vs `capacidad_neta`.
          ocupados: pax + (u.chofer_ocupa ? 1 : 0),
          pasajeros_count: pax,
          capacidad_neta: neta,
          libres: Math.max(0, neta - pax),
          pasajeros: pasajeros
            .filter(p => p.unidad_id === u.id)
            .map(p => ({ id: p.id, pasajero_tipo: p.pasajero_tipo, pasajero_ref: p.pasajero_ref, nombre_cache: p.nombre_cache })),
        };
      });

      // resumen: los PERSONAJES no cuentan (suben a mano).
      const totalPasajeros = mundoPortal.total_clientes + mundoKH.total_clientes;
      const totalAsientosNetos = unidades.reduce((a, u) => a + capacidadNeta(u.capacidad, u.chofer_ocupa), 0);

      return json(200, {
        ok: true,
        unidades: unidadesOut,
        universo: {
          cuartos_portal: mundoPortal.cuartos,
          lugares_sueltos: mundoPortal.sueltos,
          cuartos_kh: mundoKH.cuartos,
          viajeros_sueltos: mundoKH.sueltos,
          personajes,
        },
        resumen: {
          total_pasajeros: totalPasajeros,
          total_asientos_netos: totalAsientosNetos,
          deficit: totalPasajeros - totalAsientosNetos,
        },
      });
    }

    // ═══════════════ crear_unidad ═══════════════
    if (accion === 'crear_unidad') {
      const eventoId = limpiaEvento(body.evento_id);
      if (!eventoId) return json(400, { error: 'evento_id inválido' });

      const tipo = String(body.tipo || '').trim();
      if (!TIPOS_UNIDAD.includes(tipo)) return json(400, { error: 'tipo inválido (Van|Autobús|Otro)' });

      const capacidad = enteroEnRango(body.capacidad, CAP_MIN, CAP_MAX);
      if (capacidad == null) return json(400, { error: `capacidad inválida (entero ${CAP_MIN}-${CAP_MAX})` });

      // Default de Memo: en Van el chofer ocupa asiento; en lo demás no. Override
      // solo si viene explícito en el body.
      const choferOcupa = tieneCampo(body, 'chofer_ocupa') ? !!body.chofer_ocupa : (tipo === 'Van');

      const previas = await kh.get(`transporte_unidades?evento_id=eq.${enc(eventoId)}&select=orden`);
      const orden = previas.reduce((m, u) => Math.max(m, Number(u.orden) || 0), 0) + 1;

      const filas = await kh.post('transporte_unidades', {
        evento_id: eventoId,
        tipo,
        capacidad,
        orden,
        chofer_ocupa: choferOcupa,
        chofer_nombre: textoLimpio(body.chofer_nombre, 120),
        notas: textoLimpio(body.notas, 2000),
      }, 'return=representation');
      const unidad = filas[0] || null;
      if (!unidad) return json(502, { error: 'No se pudo crear la unidad' });

      // ── AUTOLLENADO (regla de Memo) ──────────────────────────────────────
      // Solo si la unidad CABE a todos los clientes sin asignar del evento; si no
      // cabe, no se asigna a nadie (auto_asignados: 0) y Bulma sube los cuartos.
      // PERSONAJES fuera: suben a mano.
      let auto_asignados = 0;
      if (body.autollenar === true) {
        const faltaPortal = necesitaPortal(); if (faltaPortal) return faltaPortal;
        const neta = capacidadNeta(capacidad, choferOcupa);
        const sinAsignar = await clientesSinAsignar(kh, portal, eventoId);
        if (neta >= sinAsignar.length && sinAsignar.length > 0) {
          await upsertPasajeros(kh, eventoId, unidad.id, sinAsignar);
          auto_asignados = sinAsignar.length;
        }
      }

      return json(200, { ok: true, unidad, auto_asignados });
    }

    // ═══════════════ asignar ═══════════════ (EN LOTE — el cuarto entero)
    if (accion === 'asignar') {
      const unidadId = String(body.unidad_id || '').trim();
      if (!UUID_RE.test(unidadId)) return json(400, { error: 'unidad_id inválido' });

      const lote = saneaLote(body.pasajeros);
      if (lote.error) return json(400, { error: lote.error });

      const unidad = await getUnidad(kh, unidadId);
      if (!unidad) return json(404, { error: 'Unidad no encontrada' });
      if (lote.items.some(p => p.tipo === 'lugar')) {
        const faltaPortal = necesitaPortal(); if (faltaPortal) return faltaPortal;
      }

      // El evento SIEMPRE sale de la unidad (no del cliente): es el que ata el
      // UNIQUE (evento_id, pasajero_tipo, pasajero_ref).
      const eventoId = unidad.evento_id;

      // Estado previo de estos mismos pasajeros en el evento → idempotencia y
      // conteo asignados/movidos.
      const previos = await pasajerosDeEvento(kh, eventoId, lote.items);
      const previoPor = {};
      previos.forEach(p => { previoPor[`${p.pasajero_tipo}:${p.pasajero_ref}`] = p.unidad_id; });

      // NUEVOS = los que no están YA en ESTA unidad (los repetidos no ocupan asiento).
      const nuevos = lote.items.filter(p => previoPor[`${p.tipo}:${p.ref}`] !== unidadId);
      const movidos = nuevos.filter(p => previoPor[`${p.tipo}:${p.ref}`] != null).length;
      const asignados = nuevos.length - movidos;

      if (!nuevos.length) return json(200, { ok: true, asignados: 0, movidos: 0 }); // ya estaban

      // CUPO NETO — todo o nada (patrón #231): se valida ANTES de escribir nada.
      const paxActual = await contarPasajeros(kh, unidadId);
      const neta = capacidadNeta(unidad.capacidad, unidad.chofer_ocupa);
      if (paxActual + nuevos.length > neta) {
        const caben = Math.max(0, neta - paxActual);
        return json(409, { error: `Solo caben ${caben} asientos más en esta unidad` });
      }

      await upsertPasajeros(kh, eventoId, unidadId, await resolverNombres(kh, portal, lote.items));
      return json(200, { ok: true, asignados, movidos });
    }

    // ═══════════════ quitar ═══════════════ (idempotente)
    if (accion === 'quitar') {
      const unidadId = String(body.unidad_id || '').trim();
      if (!UUID_RE.test(unidadId)) return json(400, { error: 'unidad_id inválido' });

      const lote = saneaLote(body.pasajeros);
      if (lote.error) return json(400, { error: lote.error });

      const unidad = await getUnidad(kh, unidadId);
      if (!unidad) return json(404, { error: 'Unidad no encontrada' });

      // Un DELETE por tipo presente (máx 3): PostgREST no filtra pares compuestos
      // de forma simple, y (tipo, ref) dentro de UNA unidad ya es único.
      let quitados = 0;
      for (const tipo of TIPOS_PASAJERO) {
        const refs = lote.items.filter(p => p.tipo === tipo).map(p => p.ref);
        if (!refs.length) continue;
        const borradas = await kh.del(
          `transporte_pasajeros?unidad_id=eq.${enc(unidadId)}&pasajero_tipo=eq.${tipo}`
          + `&pasajero_ref=in.(${refs.map(enc).join(',')})`,
          'return=representation'
        );
        quitados += borradas.length;
      }
      return json(200, { ok: true, quitados });
    }

    // ═══════════════ editar_unidad ═══════════════
    if (accion === 'editar_unidad') {
      const unidadId = String(body.unidad_id || '').trim();
      if (!UUID_RE.test(unidadId)) return json(400, { error: 'unidad_id inválido' });

      const unidad = await getUnidad(kh, unidadId);
      if (!unidad) return json(404, { error: 'Unidad no encontrada' });

      const patch = {};
      if (tieneCampo(body, 'tipo')) {
        const tipo = String(body.tipo || '').trim();
        if (!TIPOS_UNIDAD.includes(tipo)) return json(400, { error: 'tipo inválido (Van|Autobús|Otro)' });
        patch.tipo = tipo;
      }
      if (tieneCampo(body, 'capacidad')) {
        const cap = enteroEnRango(body.capacidad, CAP_MIN, CAP_MAX);
        if (cap == null) return json(400, { error: `capacidad inválida (entero ${CAP_MIN}-${CAP_MAX})` });
        patch.capacidad = cap;
      }
      if (tieneCampo(body, 'chofer_ocupa')) patch.chofer_ocupa = !!body.chofer_ocupa;
      if (tieneCampo(body, 'chofer_nombre')) patch.chofer_nombre = textoLimpio(body.chofer_nombre, 120);
      if (tieneCampo(body, 'notas')) patch.notas = textoLimpio(body.notas, 2000);
      if (tieneCampo(body, 'coordi_id')) {
        const cid = body.coordi_id == null || body.coordi_id === '' ? null : String(body.coordi_id).trim();
        if (cid !== null) {
          if (!UUID_RE.test(cid)) return json(400, { error: 'coordi_id inválido' });
          const us = await kh.get(`usuarios?id=eq.${enc(cid)}&select=id,rol&limit=1`);
          const u = us[0];
          if (!u || !ROLES_COORDI.includes(u.rol)) {
            return json(400, { error: 'El coordi debe ser un usuario con rol coordinador o cc' });
          }
        }
        patch.coordi_id = cid;
      }
      if (!Object.keys(patch).length) return json(400, { error: 'Nada que editar' });

      // CANDADO: la capacidad neta resultante debe seguir cubriendo a los que ya van.
      const capFinal = patch.capacidad != null ? patch.capacidad : unidad.capacidad;
      const choferFinal = patch.chofer_ocupa != null ? patch.chofer_ocupa : unidad.chofer_ocupa;
      const netaFinal = capacidadNeta(capFinal, choferFinal);
      const paxActual = await contarPasajeros(kh, unidadId);
      if (netaFinal < paxActual) {
        return json(409, { error: `Primero baja pasajeros: quedarían ${netaFinal} asientos para ${paxActual} pasajeros` });
      }

      patch.updated_at = new Date().toISOString();
      const filas = await kh.patch(`transporte_unidades?id=eq.${enc(unidadId)}`, patch, 'return=representation');
      return json(200, { ok: true, unidad: filas[0] || null });
    }

    // ═══════════════ eliminar_unidad ═══════════════
    if (accion === 'eliminar_unidad') {
      const unidadId = String(body.unidad_id || '').trim();
      if (!UUID_RE.test(unidadId)) return json(400, { error: 'unidad_id inválido' });

      const unidad = await getUnidad(kh, unidadId);
      if (!unidad) return json(404, { error: 'Unidad no encontrada' });

      // Los pasajeros van PRIMERO: el FK transporte_pasajeros.unidad_id NO tiene
      // ON DELETE CASCADE, así que borrar la unidad con gente dentro daría un 409
      // de Postgres. Patrón amigable del puzzle: se desasigna y luego se borra.
      const desasignadas = await kh.del(
        `transporte_pasajeros?unidad_id=eq.${enc(unidadId)}`, 'return=representation'
      );
      await kh.del(`transporte_unidades?id=eq.${enc(unidadId)}`, 'return=minimal');
      return json(200, { ok: true, desasignados: desasignadas.length });
    }

    return json(400, { error: 'accion inválida' });
  } catch (e) {
    if (e instanceof SbError) return json(502, { error: e.message, detail: e.detail });
    return json(502, { error: 'Error en el transporte', detail: e.message });
  }
};

// ----- carga del mundo -----

// Unidades del evento + TODOS sus pasajeros (una sola consulta por tabla).
async function cargarUnidades(kh, eventoId) {
  const unidades = await kh.get(
    `transporte_unidades?evento_id=eq.${enc(eventoId)}&select=${U_COLS}&order=orden.asc`
  );
  if (!unidades.length) return [unidades, []];
  const pasajeros = await kh.get(
    `transporte_pasajeros?unidad_id=in.(${unidades.map(u => enc(u.id)).join(',')})&select=${P_COLS}`
  );
  return [unidades, pasajeros];
}

// PORTAL: cuartos del puzzle (habitaciones_grupo) con sus lugares ACTIVOS, más
// los lugares activos sin cuarto. Multifecha: une el slug base + todas sus fechas.
async function cargarMundoPortal(portal, eventoId, asignadoPor) {
  const vacio = { cuartos: [], sueltos: [], total_clientes: 0 };
  const slugBase = eventoId.split('#')[0];
  // Re-saneo a [a-z0-9_-] antes del filtro like (anti-inyección en el or= de
  // PostgREST) — calca de admin-rooming-grupos.
  if (!/^[a-z0-9_-]+$/.test(slugBase)) return vacio;

  const filtro = `or=(evento_id.eq.${slugBase},evento_id.like.${slugBase}%23*)`;
  // [F3] `evento_id` viaja además del id: como este listar une el slug base + TODAS
  // sus fechas, cada cuarto/lugar tiene que decir de qué fecha es (chip "Fecha N").
  const sols = await portal.get(`solicitudes_tour?${filtro}&estado=neq.cancelado&select=id,evento_id`);
  if (!sols.length) return vacio;
  const inSol = sols.map(s => enc(s.id)).join(',');
  const eventoPorSol = {};
  sols.forEach(s => { eventoPorSol[s.id] = s.evento_id || null; });

  const [lugares, habs] = await Promise.all([
    portal.get(`lugares?solicitud_id=in.(${inSol})&estado=eq.activo&select=id,solicitud_id,numero,nombre,habitacion_grupo_id,cliente_id&order=numero.asc`),
    portal.get(`habitaciones_grupo?solicitud_id=in.(${inSol})&select=id,solicitud_id,tipo,capacidad,orden&order=orden.asc`),
  ]);

  // Nombre: el del lugar; si no lo capturaron, el del cliente dueño (mismo criterio
  // que admin-rooming-grupos con `todos`).
  const cliIds = [...new Set(lugares.filter(l => !nombreDe(l) && l.cliente_id).map(l => l.cliente_id))];
  const cliMap = {};
  if (cliIds.length) {
    const cs = await portal.get(`clientes?id=in.(${cliIds.map(enc).join(',')})&select=id,nombre_completo`);
    cs.forEach(c => { cliMap[c.id] = c; });
  }
  const persona = (l) => ({
    ref: l.id,
    nombre: nombreDe(l) || (cliMap[l.cliente_id] && cliMap[l.cliente_id].nombre_completo) || `Lugar #${l.numero}`,
    unidad_id: asignadoPor[`lugar:${l.id}`] || null,
    evento_id: eventoPorSol[l.solicitud_id] || null, // real, con #idx si es multifecha
  });

  const cuartos = habs.map(h => {
    const ocupantes = lugares.filter(l => l.habitacion_grupo_id === h.id).map(persona);
    return {
      id: h.id, tipo: h.tipo, capacidad: h.capacidad, orden: h.orden,
      solicitud_id: h.solicitud_id,
      evento_id: eventoPorSol[h.solicitud_id] || null, // real, con #idx si es multifecha
      ocupantes,
      asignados: ocupantes.filter(o => o.unidad_id).length,
    };
  });
  const sueltos = lugares.filter(l => !l.habitacion_grupo_id).map(persona);
  return { cuartos, sueltos, total_clientes: lugares.length };
}

// KH: viajeros del evento (slug) agrupados por su cuarto de rooming. Los cuartos
// se traen POR ID desde los viajeros — NO por evento_id, que en
// `rooming_habitaciones` es un uuid de la tabla legacy `eventos` (ver cabecera).
async function cargarMundoKH(kh, eventoId, asignadoPor) {
  const viajeros = await kh.get(
    `viajeros_evento?evento_id=eq.${enc(eventoId)}&select=id,nombre,habitacion_id,evento_id&order=nombre.asc`
  );
  if (!viajeros.length) return { cuartos: [], sueltos: [], total_clientes: 0 };

  // [F3] `evento_id` viaja igual que en el mundo Portal, por simetría del payload.
  // Aquí SIEMPRE es el evento pedido (el filtro es eq exacto): el mundo KH no une
  // fechas, así que en la práctica el chip "Fecha N" solo aparece en los cuartos
  // del Portal — pero la UI no tiene que saberlo.
  const persona = (v) => ({
    ref: v.id,
    nombre: nombreDe(v) || 'Viajero',
    unidad_id: asignadoPor[`viajero:${v.id}`] || null,
    evento_id: v.evento_id || null,
  });

  const habIds = [...new Set(viajeros.map(v => v.habitacion_id).filter(Boolean))];
  let habs = [];
  if (habIds.length) {
    habs = await kh.get(
      `rooming_habitaciones?id=in.(${habIds.map(enc).join(',')})&select=id,numero_hab,tipo,hotel_nombre,orden&order=orden.asc`
    );
  }

  const cuartos = habs.map(h => {
    const ocupantes = viajeros.filter(v => v.habitacion_id === h.id).map(persona);
    return {
      id: h.id, numero_hab: h.numero_hab, tipo: h.tipo, hotel_nombre: h.hotel_nombre, orden: h.orden,
      evento_id: (ocupantes[0] && ocupantes[0].evento_id) || eventoId,
      ocupantes,
      asignados: ocupantes.filter(o => o.unidad_id).length,
    };
  });
  const sueltos = viajeros.filter(v => !v.habitacion_id).map(persona);
  return { cuartos, sueltos, total_clientes: viajeros.length };
}

// PERSONAJES: coordis ACEPTADOS del evento + TODAS las creadoras (rol 'cc').
// Nunca cuentan como pasajeros del evento: Bulma los sube a mano.
async function cargarPersonajes(kh, eventoId, asignadoPor) {
  const [asigs, ccs] = await Promise.all([
    kh.get(`eventos_coordi?evento_id=eq.${enc(eventoId)}&status=eq.aceptado&select=coordi_id`),
    kh.get(`usuarios?rol=eq.cc&select=id,nombre,rol`),
  ]);

  const coordiIds = [...new Set(asigs.map(a => a.coordi_id).filter(Boolean))];
  let coordis = [];
  if (coordiIds.length) {
    coordis = await kh.get(`usuarios?id=in.(${coordiIds.map(enc).join(',')})&select=id,nombre,rol`);
  }

  const vistos = new Set();
  return [...coordis, ...ccs]
    .filter(u => (vistos.has(u.id) ? false : vistos.add(u.id)))
    .map(u => ({
      ref: u.id,
      nombre: nombreDe(u) || 'Sin nombre',
      rol: u.rol,
      unidad_id: asignadoPor[`usuario:${u.id}`] || null,
    }));
}

// ----- pasajeros -----

// Clientes del evento (lugares activos + viajeros) que NO están en ninguna unidad.
// Sin personajes: el autollenado nunca los toca.
async function clientesSinAsignar(kh, portal, eventoId) {
  const yaAsignados = await kh.get(
    `transporte_pasajeros?evento_id=eq.${enc(eventoId)}&select=pasajero_tipo,pasajero_ref`
  );
  const asignadoPor = {};
  yaAsignados.forEach(p => { asignadoPor[`${p.pasajero_tipo}:${p.pasajero_ref}`] = true; });

  const [mp, mk] = await Promise.all([
    cargarMundoPortal(portal, eventoId, {}),
    cargarMundoKH(kh, eventoId, {}),
  ]);
  const todos = [
    ...mp.cuartos.flatMap(c => c.ocupantes).map(p => ({ tipo: 'lugar', ref: p.ref, nombre: p.nombre })),
    ...mp.sueltos.map(p => ({ tipo: 'lugar', ref: p.ref, nombre: p.nombre })),
    ...mk.cuartos.flatMap(c => c.ocupantes).map(p => ({ tipo: 'viajero', ref: p.ref, nombre: p.nombre })),
    ...mk.sueltos.map(p => ({ tipo: 'viajero', ref: p.ref, nombre: p.nombre })),
  ];
  return todos.filter(p => !asignadoPor[`${p.tipo}:${p.ref}`]);
}

// Resuelve nombre_cache SERVER-SIDE por tipo (el cliente nunca manda nombres).
async function resolverNombres(kh, portal, items) {
  const porTipo = (t) => [...new Set(items.filter(p => p.tipo === t).map(p => p.ref))];
  const nombres = {};

  const lugares = porTipo('lugar');
  if (lugares.length && portal) {
    const ls = await portal.get(`lugares?id=in.(${lugares.map(enc).join(',')})&select=id,numero,nombre,cliente_id`);
    const faltan = ls.filter(l => !nombreDe(l) && l.cliente_id).map(l => l.cliente_id);
    const cliMap = {};
    if (faltan.length) {
      const cs = await portal.get(`clientes?id=in.(${[...new Set(faltan)].map(enc).join(',')})&select=id,nombre_completo`);
      cs.forEach(c => { cliMap[c.id] = c; });
    }
    ls.forEach(l => {
      nombres[`lugar:${l.id}`] = nombreDe(l)
        || (cliMap[l.cliente_id] && cliMap[l.cliente_id].nombre_completo)
        || `Lugar #${l.numero}`;
    });
  }

  const viajeros = porTipo('viajero');
  if (viajeros.length) {
    const vs = await kh.get(`viajeros_evento?id=in.(${viajeros.map(enc).join(',')})&select=id,nombre`);
    vs.forEach(v => { nombres[`viajero:${v.id}`] = nombreDe(v) || null; });
  }

  const usuarios = porTipo('usuario');
  if (usuarios.length) {
    const us = await kh.get(`usuarios?id=in.(${usuarios.map(enc).join(',')})&select=id,nombre`);
    us.forEach(u => { nombres[`usuario:${u.id}`] = nombreDe(u) || null; });
  }

  return items.map(p => ({ ...p, nombre: p.nombre || nombres[`${p.tipo}:${p.ref}`] || null }));
}

// UPSERT del lote. El on_conflict sobre el UNIQUE de la F1 hace que MOVER de
// unidad sea un update de unidad_id — y que dos admins en carrera no puedan
// duplicar a una persona en dos unidades.
async function upsertPasajeros(kh, eventoId, unidadId, items) {
  if (!items.length) return;
  const filas = items.map(p => ({
    evento_id: eventoId,
    unidad_id: unidadId,
    pasajero_tipo: p.tipo,
    pasajero_ref: p.ref,
    nombre_cache: p.nombre || null,
  }));
  await kh.post(
    'transporte_pasajeros?on_conflict=evento_id,pasajero_tipo,pasajero_ref',
    filas,
    'resolution=merge-duplicates,return=minimal'
  );
}

// Filas ya existentes en el evento para estos (tipo, ref) — una consulta por tipo.
async function pasajerosDeEvento(kh, eventoId, items) {
  const out = [];
  for (const tipo of TIPOS_PASAJERO) {
    const refs = [...new Set(items.filter(p => p.tipo === tipo).map(p => p.ref))];
    if (!refs.length) continue;
    const rows = await kh.get(
      `transporte_pasajeros?evento_id=eq.${enc(eventoId)}&pasajero_tipo=eq.${tipo}`
      + `&pasajero_ref=in.(${refs.map(enc).join(',')})&select=pasajero_tipo,pasajero_ref,unidad_id`
    );
    out.push(...rows);
  }
  return out;
}

async function contarPasajeros(kh, unidadId) {
  const rows = await kh.get(`transporte_pasajeros?unidad_id=eq.${enc(unidadId)}&select=id`);
  return rows.length;
}

async function getUnidad(kh, unidadId) {
  const rows = await kh.get(`transporte_unidades?id=eq.${enc(unidadId)}&select=${U_COLS}&limit=1`);
  return rows[0] || null;
}

// ----- helpers -----

const enc = encodeURIComponent;

class SbError extends Error {
  constructor(op, detail) { super(`Supabase rechazó el ${op}`); this.detail = detail; }
}

// Cliente REST mínimo (mismo shape para KH y Portal).
function sbClient(url, key) {
  const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const cuerpo = async (r, op) => {
    if (!r.ok) throw new SbError(op, await r.text());
    const txt = await r.text();
    if (!txt) return [];
    try { return JSON.parse(txt); } catch { return []; }
  };
  return {
    async get(path) { return cuerpo(await fetch(`${url}/rest/v1/${path}`, { headers: h }), 'consulta'); },
    async post(path, payload, prefer) {
      return cuerpo(await fetch(`${url}/rest/v1/${path}`, {
        method: 'POST', headers: { ...h, Prefer: prefer }, body: JSON.stringify(payload),
      }), 'insert');
    },
    async patch(path, payload, prefer) {
      return cuerpo(await fetch(`${url}/rest/v1/${path}`, {
        method: 'PATCH', headers: { ...h, Prefer: prefer }, body: JSON.stringify(payload),
      }), 'update');
    },
    async del(path, prefer) {
      return cuerpo(await fetch(`${url}/rest/v1/${path}`, {
        method: 'DELETE', headers: { ...h, Prefer: prefer },
      }), 'delete');
    },
  };
}

function limpiaEvento(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || !SLUG_RE.test(s) || s.length > 120) return null;
  return s;
}

// Sanea el lote de pasajeros y DEDUPLICA: dos veces el mismo (tipo, ref) en un
// mismo upsert rompe Postgres ("ON CONFLICT ... cannot affect row a second time").
function saneaLote(v) {
  if (!Array.isArray(v) || !v.length) return { error: 'pasajeros debe ser una lista no vacía' };
  if (v.length > MAX_LOTE) return { error: `pasajeros: máximo ${MAX_LOTE} por lote` };
  const vistos = new Set();
  const items = [];
  for (const p of v) {
    if (!p || typeof p !== 'object') return { error: 'pasajero inválido' };
    const tipo = String(p.tipo || '').trim();
    const ref = String(p.ref || '').trim();
    if (!TIPOS_PASAJERO.includes(tipo)) return { error: `tipo inválido (${TIPOS_PASAJERO.join('|')})` };
    if (!UUID_RE.test(ref)) return { error: 'ref inválido (uuid)' };
    const k = `${tipo}:${ref}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    items.push({ tipo, ref });
  }
  return { items };
}

function capacidadNeta(capacidad, choferOcupa) {
  return Math.max(0, (Number(capacidad) || 0) - (choferOcupa ? 1 : 0));
}

function enteroEnRango(v, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function tieneCampo(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }

function nombreDe(o) {
  const s = o && o.nombre != null ? String(o.nombre).trim() : '';
  return s || null;
}

function textoLimpio(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function readEnvKH() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
