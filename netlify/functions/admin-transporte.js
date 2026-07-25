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
const { aplicarModoPrueba } = require('./_lib/correo-guard'); // [F4] OBLIGATORIO en todo envío
const { fetchCatalogo } = require('./_lib/catalogo-index');   // [v2] forma temporal del evento

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[A-Za-z0-9_#.\-]+$/;   // evento_id (slug del EV, p.ej. 'karolg#2')
const ROLES = ['maestro_roshi', 'bulma', 'milk'];

const TIPOS_UNIDAD = ['Van', 'Autobús', 'Otro'];
const TIPOS_PASAJERO = ['lugar', 'viajero', 'usuario']; // == CHECK de la F1
const ROLES_COORDI = ['coordinador', 'cc'];             // quién puede ir de coordi de unidad
const CAP_MIN = 1, CAP_MAX = 100;
const MAX_LOTE = 200;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;  // [v2] date de las corridas por día
const MAX_CLONES = 10;                   // [v2] tope sano de fechas destino por clonado

const ACCIONES = {
  listar: ROLES,
  crear_unidad: ROLES,
  asignar: ROLES,
  quitar: ROLES,
  editar_unidad: ROLES,
  eliminar_unidad: ROLES,
  enviar_listas: ROLES,
  clonar_unidad: ROLES,
};

const U_COLS = 'id,evento_id,fecha,tipo,capacidad,orden,chofer_ocupa,chofer_nombre,coordi_id,notas';
const P_COLS = 'id,unidad_id,evento_id,fecha,pasajero_tipo,pasajero_ref,nombre_cache';
// Campos que se copian al clonar una unidad a otro día (los pasajeros NO).
const U_CLON = ['tipo', 'capacidad', 'chofer_ocupa', 'chofer_nombre', 'coordi_id', 'notas'];

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

      // [v2] Festival por días: `fecha` acota TODO a ese día. Evento simple (o
      // catálogo caído) → `fest` null y ni `fecha` ni `dias` existen: idéntico a la v1.
      const fest = await festivalPorDias(eventoId);
      const fecha = tieneCampo(body, 'fecha') && body.fecha ? String(body.fecha).trim() : null;
      if (fecha) {
        if (!fest) return json(400, { error: 'Este evento no tiene corridas por día' });
        if (!FECHA_RE.test(fecha) || !fest.dias.includes(fecha)) {
          return json(400, { error: 'fecha inválida (no es un día de este evento)' });
        }
      }

      const [unidades, pasajeros] = await cargarUnidades(kh, eventoId, fecha);

      // Asignación actual de cada persona: `${tipo}:${ref}` → unidad_id.
      // Con `fecha`, `pasajeros` ya viene solo de las unidades de ESE día → quien va
      // en un camión de OTRO día no aparece asignado aquí, que es justo el punto.
      // Sin `fecha` en festival, una persona puede ir en varios días: el unidad_id
      // que queda es UNO de ellos (la vista por día es la buena; la F3 usará esa).
      const asignadoPor = {};
      pasajeros.forEach(p => { asignadoPor[`${p.pasajero_tipo}:${p.pasajero_ref}`] = p.unidad_id; });

      const [mundoPortal, mundoKH, personajes] = await Promise.all([
        cargarMundoPortal(portal, eventoId, asignadoPor),
        cargarMundoKH(kh, eventoId, asignadoPor),
        cargarPersonajes(kh, eventoId, asignadoPor),
      ]);

      // [v2] Con día: el universo se reduce a quienes ESE día cubren (por el idx de
      // su solicitud). Los personajes nunca se filtran: son de todo el evento.
      const cubre = (p) => !fecha || !fest || fest.cubre(p.evento_id, fecha);
      if (fecha && fest) {
        mundoPortal.cuartos = mundoPortal.cuartos
          .map(c => ({ ...c, ocupantes: c.ocupantes.filter(cubre) }))
          .filter(c => c.ocupantes.length);
        mundoPortal.sueltos = mundoPortal.sueltos.filter(cubre);
        mundoKH.cuartos = mundoKH.cuartos
          .map(c => ({ ...c, ocupantes: c.ocupantes.filter(cubre) }))
          .filter(c => c.ocupantes.length);
        mundoKH.sueltos = mundoKH.sueltos.filter(cubre);
        // El resumen del día cuenta SOLO a quien lo cubre.
        mundoPortal.total_clientes = mundoPortal.cuartos.reduce((a, c) => a + c.ocupantes.length, 0) + mundoPortal.sueltos.length;
        mundoKH.total_clientes = mundoKH.cuartos.reduce((a, c) => a + c.ocupantes.length, 0) + mundoKH.sueltos.length;
        // `asignados` por cuarto se recalcula sobre los ocupantes que quedaron.
        mundoPortal.cuartos.forEach(c => { c.asignados = c.ocupantes.filter(o => o.unidad_id).length; });
        mundoKH.cuartos.forEach(c => { c.asignados = c.ocupantes.filter(o => o.unidad_id).length; });
      }

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
        // [v2] `dias` SOLO en festivales por días — un evento simple recibe el mismo
        // payload que en la v1, sin claves nuevas.
        ...(fest ? { dias: fest.dias.map(f => ({ fecha: f, label: fest.label(f) })), fecha } : {}),
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

      // [v2] La fecha define la corrida. En festival por días es OBLIGATORIA (una
      // unidad tiene que saber qué día sale); en evento simple NO se acepta.
      const fest = await festivalPorDias(eventoId);
      const fechaCruda = tieneCampo(body, 'fecha') && body.fecha ? String(body.fecha).trim() : null;
      if (fest) {
        if (!fechaCruda) return json(400, { error: 'Este evento va por días: la unidad necesita fecha' });
        if (!FECHA_RE.test(fechaCruda) || !fest.dias.includes(fechaCruda)) {
          return json(400, { error: 'fecha inválida (no es un día de este evento)' });
        }
      } else if (fechaCruda) {
        return json(400, { error: 'Este evento no va por días: la unidad no lleva fecha' });
      }
      const fecha = fest ? fechaCruda : null;

      // El orden se cuenta DENTRO del día: cada día empieza en "Unidad 1".
      const previas = await kh.get(
        `transporte_unidades?evento_id=eq.${enc(eventoId)}&${filtroFecha(fecha)}&select=orden`
      );
      const orden = previas.reduce((m, u) => Math.max(m, Number(u.orden) || 0), 0) + 1;

      const filas = await kh.post('transporte_unidades', {
        evento_id: eventoId,
        fecha,
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
      // [v2] En festival, "sin asignar" se mide EN ESE DÍA y solo entre quienes lo
      // cubren: un combo Vie+Sáb ya subido al viernes sigue contando para el sábado.
      let auto_asignados = 0;
      if (body.autollenar === true) {
        const faltaPortal = necesitaPortal(); if (faltaPortal) return faltaPortal;
        const neta = capacidadNeta(capacidad, choferOcupa);
        const sinAsignar = await clientesSinAsignar(kh, portal, eventoId, fecha, fest);
        if (neta >= sinAsignar.length && sinAsignar.length > 0) {
          await upsertPasajeros(kh, eventoId, unidad.id, sinAsignar, fecha);
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

      // El evento y el DÍA SIEMPRE salen de la unidad, jamás del cliente: son los
      // que atan el índice único (por evento, o por evento+día si hay corridas).
      const eventoId = unidad.evento_id;
      const fecha = unidad.fecha || null;

      // Estado previo de estos mismos pasajeros EN ESE DÍA → idempotencia y conteo
      // asignados/movidos. Que alguien vaya en un camión de otro día no cuenta aquí.
      const previos = await pasajerosDeEvento(kh, eventoId, lote.items, fecha);
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

      await upsertPasajeros(kh, eventoId, unidadId, await resolverNombres(kh, portal, lote.items), fecha);
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

    // ═══════════════ clonar_unidad ═══════════════ [v2]
    // La flota suele repetirse día con día: esto copia el MOLDE de una unidad a
    // otros días (tipo/capacidad/chofer/coordi/notas) SIN pasajeros — cada día se
    // llena solo. Si ya había una unidad igual ese día, se crea otra: Bulma borra
    // la que sobre (no es problema de esta acción adivinar su intención).
    if (accion === 'clonar_unidad') {
      const unidadId = String(body.unidad_id || '').trim();
      if (!UUID_RE.test(unidadId)) return json(400, { error: 'unidad_id inválido' });

      const origen = await getUnidad(kh, unidadId);
      if (!origen) return json(404, { error: 'Unidad no encontrada' });
      if (!origen.fecha) return json(400, { error: 'Esta unidad no es de un evento por días' });

      const fest = await festivalPorDias(origen.evento_id);
      if (!fest) return json(400, { error: 'Este evento no tiene corridas por día' });

      if (!Array.isArray(body.fechas) || !body.fechas.length) {
        return json(400, { error: 'fechas debe ser una lista no vacía' });
      }
      if (body.fechas.length > MAX_CLONES) return json(400, { error: `fechas: máximo ${MAX_CLONES}` });

      const vistas = new Set();
      const destinos = [];
      for (const f of body.fechas) {
        const fecha = String(f == null ? '' : f).trim();
        if (!FECHA_RE.test(fecha) || !fest.dias.includes(fecha)) {
          return json(400, { error: `fecha inválida (no es un día de este evento): ${fecha}` });
        }
        if (fecha === origen.fecha) return json(400, { error: 'Una de las fechas es la de la unidad original' });
        if (vistas.has(fecha)) continue; // repetida en el mismo lote: se ignora
        vistas.add(fecha);
        destinos.push(fecha);
      }

      // El orden se cuenta por día → cada clon entra al final de SU día.
      const previas = await kh.get(
        `transporte_unidades?evento_id=eq.${enc(origen.evento_id)}&fecha=in.(${destinos.map(enc).join(',')})&select=fecha,orden`
      );
      const maxPorFecha = {};
      previas.forEach(u => {
        maxPorFecha[u.fecha] = Math.max(maxPorFecha[u.fecha] || 0, Number(u.orden) || 0);
      });

      const filas = destinos.map(fecha => {
        const fila = { evento_id: origen.evento_id, fecha, orden: (maxPorFecha[fecha] || 0) + 1 };
        U_CLON.forEach(k => { fila[k] = origen[k]; });
        return fila;
      });
      const creadas = await kh.post('transporte_unidades', filas, 'return=representation');
      return json(200, { ok: true, creadas: creadas.map(u => u.id) });
    }

    // ═══════════════ enviar_listas ═══════════════ [F4]
    // A CADA coordi, el correo con SU unidad. Best-effort (allSettled): un envío
    // que truena no tumba a los demás; la respuesta dice exactamente qué faltó.
    if (accion === 'enviar_listas') {
      const eventoId = limpiaEvento(body.evento_id);
      if (!eventoId) return json(400, { error: 'evento_id inválido' });
      const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
      if (!RESEND_KEY) return json(500, { error: 'Falta RESEND_KEY' });

      // [v2] Con `fecha`, solo las corridas de ese día. Sin `fecha` en festival, TODAS
      // — y cada correo lleva el día de SU unidad en el asunto.
      const fest = await festivalPorDias(eventoId);
      const fecha = tieneCampo(body, 'fecha') && body.fecha ? String(body.fecha).trim() : null;
      if (fecha) {
        if (!fest) return json(400, { error: 'Este evento no tiene corridas por día' });
        if (!FECHA_RE.test(fecha) || !fest.dias.includes(fecha)) {
          return json(400, { error: 'fecha inválida (no es un día de este evento)' });
        }
      }

      const [unidades, pasajeros] = await cargarUnidades(kh, eventoId, fecha); // mismos helpers del listar
      const vacio = { ok: true, enviadas: 0, sin_coordi: [], sin_correo: [], vacias: [], errores: 0 };
      if (!unidades.length) return json(200, vacio);

      const eventoNombre = await nombreDeEvento(kh, eventoId);

      const coordiIds = [...new Set(unidades.map(u => u.coordi_id).filter(Boolean))];
      const coordiMap = {};
      if (coordiIds.length) {
        const us = await kh.get(`usuarios?id=in.(${coordiIds.map(enc).join(',')})&select=id,nombre,correo`);
        us.forEach(u => { coordiMap[u.id] = u; });
      }

      const sin_coordi = [], sin_correo = [], vacias = [], envios = [];
      for (const u of unidades) {
        const pax = pasajeros.filter(p => p.unidad_id === u.id);
        if (!pax.length) { vacias.push(u.orden); continue; }        // sin gente no hay lista que mandar
        if (!u.coordi_id) { sin_coordi.push(u.orden); continue; }
        const c = coordiMap[u.coordi_id];
        const correo = (c && typeof c.correo === 'string') ? c.correo.trim() : '';
        if (!correo || !correo.includes('@')) { sin_correo.push(u.orden); continue; }
        envios.push({ u, pax, coordi: c, correo });
      }
      if (!envios.length) return json(200, { ...vacio, sin_coordi, sin_correo, vacias });

      const resultados = await Promise.allSettled(envios.map(e => {
        // [v2] El día va en el asunto SOLO si la unidad tiene fecha → en evento
        // simple el asunto queda EXACTO al de la F4.
        const dia = (fest && e.u.fecha) ? ' · ' + fest.label(e.u.fecha) : '';
        const subject = `🚌 Tu unidad — ${eventoNombre}${dia}: Unidad ${e.u.orden} (${e.u.tipo})`;
        const html = listaUnidadHtml(e.coordi.nombre, eventoNombre + dia, e.u, e.pax);
        // El guard va SIEMPRE justo antes del fetch, sobre el destinatario resuelto.
        const __mp = aplicarModoPrueba({ to: [e.correo], subject });
        return fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Conecta Reynosa <admin@conectareynosa.mx>', to: __mp.to, subject: __mp.subject, html }),
        });
      }));

      let enviadas = 0, errores = 0;
      for (const r of resultados) {
        if (r.status === 'fulfilled' && r.value && r.value.ok) enviadas++;
        else errores++;
      }
      return json(200, { ok: true, enviadas, sin_coordi, sin_correo, vacias, errores });
    }

    return json(400, { error: 'accion inválida' });
  } catch (e) {
    if (e instanceof SbError) return json(502, { error: e.message, detail: e.detail });
    return json(502, { error: 'Error en el transporte', detail: e.message });
  }
};

// ----- [v2] festivales por días -----
//
// Un evento es "festival por días" si su entrada del catálogo trae `multifecha` y
// TODOS sus items traen `ds` + `noches`. Los días que cubre un idx son
// ds .. ds+(noches-1) — p.ej. Corona Capital idx 3 ('Vie + Sáb · 2 días',
// ds 2026-11-20, noches 2) → [2026-11-20, 2026-11-21].
//
// Devuelve null si NO es festival por días (o si el catálogo no se pudo leer) →
// el evento se trata como SIMPLE y todo se comporta como antes de la v2.
async function festivalPorDias(slug) {
  const cat = await fetchCatalogo();               // best-effort: null si falla
  if (!cat) return null;
  const e = cat[String(slug).split('#')[0]];
  if (!e || !Array.isArray(e.multifecha) || !e.multifecha.length) return null;

  const porIdx = {}, labels = {}, set = new Set();
  for (const m of e.multifecha) {
    const noches = Number(m.noches);
    // Si a UN item le falta ds/noches, no se puede derivar el calendario completo
    // → mejor tratar el evento como simple que inventar días a medias.
    if (!m.ds || !FECHA_RE.test(m.ds) || !Number.isInteger(noches) || noches < 1) return null;
    const fechas = [];
    for (let i = 0; i < noches; i++) fechas.push(sumaDias(m.ds, i));
    porIdx[m.idx] = fechas;
    fechas.forEach(f => set.add(f));
    // El nombre bonito de un día sale del idx de UN día ('Vie 20 nov · 1 día' →
    // 'Vie 20 nov'); los combos no nombran días.
    if (noches === 1 && m.lbl) labels[m.ds] = String(m.lbl).split('·')[0].trim() || m.ds;
  }
  const dias = [...set].sort();
  if (!dias.length) return null;
  return {
    dias,
    porIdx,
    labels,
    label: (f) => labels[f] || f,
    cubre: (eventoIdPersona, fecha) => {
      const i = idxDeEventoId(eventoIdPersona);
      if (i === null) return true;   // solicitud sin '#idx' en un festival: no se
      return (porIdx[i] || []).includes(fecha); // esconde, que Bulma decida
    },
  };
}

// 'coronacapital#3' → 3 · 'coronacapital' → null
function idxDeEventoId(eventoId) {
  const p = String(eventoId || '').split('#');
  if (p.length < 2 || p[1] === '') return null;
  const n = parseInt(p[1], 10);
  return (Number.isInteger(n) && n >= 0) ? n : null;
}

// Suma días a un ISO (YYYY-MM-DD) sin cruzar husos: se ancla a mediodía UTC.
function sumaDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Filtro PostgREST del día de una unidad/pasajero: null → `is.null` (evento simple).
function filtroFecha(fecha) {
  return fecha ? `fecha=eq.${enc(fecha)}` : 'fecha=is.null';
}

// ----- carga del mundo -----

// Unidades del evento + TODOS sus pasajeros (una sola consulta por tabla).
// [v2] `fecha` acota a las unidades de ESE día; undefined = todas (evento simple:
// todas tienen fecha null, así que el comportamiento es idéntico al de antes).
async function cargarUnidades(kh, eventoId, fecha) {
  const filtro = fecha ? `&${filtroFecha(fecha)}` : '';
  const unidades = await kh.get(
    `transporte_unidades?evento_id=eq.${enc(eventoId)}${filtro}&select=${U_COLS}&order=orden.asc`
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
// [v2] En festival, `fecha` acota a los sin-asignar DE ESE DÍA y solo a quienes lo
// cubren (su idx incluye la fecha): un combo Vie+Sáb ya subido al viernes sigue
// pendiente para el sábado.
async function clientesSinAsignar(kh, portal, eventoId, fecha, fest) {
  const yaAsignados = await kh.get(
    `transporte_pasajeros?evento_id=eq.${enc(eventoId)}&${filtroFecha(fecha)}&select=pasajero_tipo,pasajero_ref`
  );
  const asignadoPor = {};
  yaAsignados.forEach(p => { asignadoPor[`${p.pasajero_tipo}:${p.pasajero_ref}`] = true; });

  const [mp, mk] = await Promise.all([
    cargarMundoPortal(portal, eventoId, {}),
    cargarMundoKH(kh, eventoId, {}),
  ]);
  const todos = [
    ...mp.cuartos.flatMap(c => c.ocupantes).map(p => ({ tipo: 'lugar', ref: p.ref, nombre: p.nombre, evento_id: p.evento_id })),
    ...mp.sueltos.map(p => ({ tipo: 'lugar', ref: p.ref, nombre: p.nombre, evento_id: p.evento_id })),
    ...mk.cuartos.flatMap(c => c.ocupantes).map(p => ({ tipo: 'viajero', ref: p.ref, nombre: p.nombre, evento_id: p.evento_id })),
    ...mk.sueltos.map(p => ({ tipo: 'viajero', ref: p.ref, nombre: p.nombre, evento_id: p.evento_id })),
  ];
  return todos
    .filter(p => !fecha || !fest || fest.cubre(p.evento_id, fecha))
    .filter(p => !asignadoPor[`${p.tipo}:${p.ref}`]);
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

// Escribe el lote en la unidad. MOVER de unidad = update de unidad_id.
//
// ⚠️ POR QUÉ NO HAY `on_conflict` (v2): el SQL de la v2 sustituyó el UNIQUE simple
// de la F1 por DOS índices PARCIALES (`transporte_pax_simple_uq` WHERE fecha IS
// NULL · `transporte_pax_dia_uq` WHERE fecha IS NOT NULL). Postgres solo infiere
// un índice parcial en ON CONFLICT si le mandas TAMBIÉN su WHERE, y PostgREST no
// tiene forma de mandarlo → `on_conflict=...` da **42P10** ("no unique or exclusion
// constraint matching the ON CONFLICT specification") para CUALQUIER evento. Es
// decir: el upsert de la F1 quedó roto en cuanto se corrió el SQL. Se sustituye por
// read-then-write, que es además el modelo de concurrencia que esta function ya
// declara: los índices siguen siendo el candado real (una-unidad-por-persona, y
// por-día cuando hay fecha).
async function upsertPasajeros(kh, eventoId, unidadId, items, fecha) {
  if (!items.length) return;
  const previos = await pasajerosDeEvento(kh, eventoId, items, fecha);
  const previoPor = {};
  previos.forEach(p => { previoPor[`${p.pasajero_tipo}:${p.pasajero_ref}`] = p; });

  const mover = [], nuevas = [];
  for (const p of items) {
    const ex = previoPor[`${p.tipo}:${p.ref}`];
    if (ex) {
      if (ex.unidad_id !== unidadId) mover.push(ex.id); // ya iba en otra unidad de ESTE día
      // si ya está en ESTA unidad: no-op (idempotente)
    } else {
      nuevas.push({
        evento_id: eventoId,
        unidad_id: unidadId,
        fecha: fecha || null,
        pasajero_tipo: p.tipo,
        pasajero_ref: p.ref,
        nombre_cache: p.nombre || null,
      });
    }
  }
  // Los movidos van en UN PATCH (todos al mismo destino). `nombre_cache` no se
  // re-escribe: mover de camión no le cambia el nombre a nadie.
  if (mover.length) {
    await kh.patch(
      `transporte_pasajeros?id=in.(${mover.map(enc).join(',')})`,
      { unidad_id: unidadId },
      'return=minimal'
    );
  }
  if (nuevas.length) await kh.post('transporte_pasajeros', nuevas, 'return=minimal');
}

// Filas ya existentes para estos (tipo, ref) — una consulta por tipo.
// [v2] Acotado al DÍA: en festival, que alguien ya vaya en un camión del sábado NO
// lo hace "existente" para el viernes (ese es justo el punto de las corridas por
// día). `fecha` null → el mundo simple de siempre (`fecha is null`).
async function pasajerosDeEvento(kh, eventoId, items, fecha) {
  const out = [];
  for (const tipo of TIPOS_PASAJERO) {
    const refs = [...new Set(items.filter(p => p.tipo === tipo).map(p => p.ref))];
    if (!refs.length) continue;
    const rows = await kh.get(
      `transporte_pasajeros?evento_id=eq.${enc(eventoId)}&${filtroFecha(fecha)}&pasajero_tipo=eq.${tipo}`
      + `&pasajero_ref=in.(${refs.map(enc).join(',')})&select=id,pasajero_tipo,pasajero_ref,unidad_id`
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

// ----- [F4] correo por unidad -----

// Nombre bonito del evento para el asunto. `eventos_meta` va por SLUG BASE (sin
// '#idx'). Best-effort: si no está, el asunto usa el evento_id tal cual.
async function nombreDeEvento(kh, eventoId) {
  const slugBase = String(eventoId).split('#')[0];
  try {
    const rows = await kh.get(`eventos_meta?slug=eq.${enc(slugBase)}&select=nombre&limit=1`);
    const n = rows[0] && rows[0].nombre && String(rows[0].nombre).trim();
    return n || eventoId;
  } catch (e) {
    return eventoId;
  }
}

// Molde negro Conecta (calca de admin-avisar-cancelacion). TODO dato escapado.
function listaUnidadHtml(coordiNombre, eventoNombre, u, pax) {
  const nom = escapeHtml((coordiNombre && String(coordiNombre).trim()) || 'coordi');
  const ev = escapeHtml(eventoNombre);
  const neta = capacidadNeta(u.capacidad, u.chofer_ocupa);
  const filas = pax.map((p, i) => `
      <tr>
        <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.45);width:32px">${i + 1}</td>
        <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.1)">${escapeHtml(p.nombre_cache || 'Sin nombre')}</td>
      </tr>`).join('');

  const dato = (k, v) => `<tr><td style="padding:3px 0;color:rgba(255,255,255,.55);width:120px">${escapeHtml(k)}</td><td style="padding:3px 0"><b>${escapeHtml(v)}</b></td></tr>`;
  const chofer = (u.chofer_nombre || u.chofer_ocupa)
    ? dato('Chofer', u.chofer_nombre || 'sí, ocupa asiento')
    : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span>
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0">Hola <strong>${nom}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">
      <p style="margin:0 0 14px 0">Esta es tu unidad para <b style="color:#e8ff4c">${ev}</b>.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 20px 0">
      ${dato('Unidad', `${u.orden} · ${u.tipo}`)}
      ${dato('Capacidad', `${u.capacidad} (${neta} para pasajeros)`)}
      ${chofer}
      ${dato('Ocupados', `${pax.length} de ${neta}`)}
    </table>
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:6px">Tus pasajeros</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${filas}</table>
    <p style="font-size:14px;margin:14px 0 0 0"><b>Total: ${pax.length} pasajero${pax.length === 1 ? '' : 's'}</b></p>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.88);margin:20px 0 0 0">Cualquier cambio de última hora se te avisa por este medio — preséntate con esta lista.</p>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Equipo Conecta Reynosa</p>
  </div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
