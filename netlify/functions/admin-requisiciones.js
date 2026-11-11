// =============================================================================
// admin-requisiciones — FASE B del rumbo (12-oct-2026): la BANDEJA.
//
// Bulma y Milk (y Memo) revisan las requisiciones que levanta el index:
// ven el comprobante, aprueban (y ahí NACE el viajero por la puerta de zonas,
// con su abono), rechazan con motivo, o le escriben al cliente por WhatsApp
// (eso es del navegador — aquí no se manda nada).
//
// 🔒 LA CAPTURA ES MANUAL: el MONTO del abono lo teclea el humano que VIO el
//    comprobante. Viene en el body, pre-llenado por la pantalla con el separo
//    del sistema, pero la autoridad es la persona. Nada automático decide
//    dinero (EL RUMBO, 12-oct).
// 🔒 EL VIAJERO NACE POR LA PUERTA DE ZONAS (_lib/zona-ficha, DISPO-NORM-1):
//    zona desconocida se RECHAZA nombrando las de la ficha; mal escrita se
//    guarda con la ortografía canónica. RIDE va sin zona.
// 🔒 LA CARRERA DEL DOBLE CLIC se cierra RECLAMANDO primero: el PATCH a
//    'aprobada' lleva &estado=eq.pendiente y pide representación — 0 filas =
//    alguien más la revisó primero (409, sin viajero duplicado). Si el insert
//    del viajero falla DESPUÉS del reclamo, el reclamo se REVIERTE a
//    pendiente y se dice. Si lo que falla es el ABONO (el viajero ya nació),
//    NO se borra nada: se contesta con la instrucción exacta — capturar el
//    abono a mano con ➕Abono — porque un viajero sin abono se corrige en un
//    clic y un borrado automático de datos de gente no se hace jamás.
// 🔒 El abono hereda el comprobante: foto_path = comprobante_path (mismo
//    bucket abonos-viajeros, por eso el crear sube ahí).
// 🔒 total_contrato default = total_sistema (el precio del index cuando el
//    cliente cotizó — «los costos son los del index siempre»). El staff puede
//    ajustarlo (CDMX sin transporte en el total del sistema, p. ej.), y eso
//    también es captura manual.
//
// Env: SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { puertaZona } = require('./_lib/zona-ficha');

// [YAJIROBE-1 · 6-nov] yajirobe ayuda a milk: Capsule + Requisiciones (palabra de Memo).
const ROLES_BANDEJA = ['maestro_roshi', 'bulma', 'milk', 'yajirobe'];
const ACCIONES = {
  listar: ROLES_BANDEJA,
  detalle: ROLES_BANDEJA,
  aprobar: ROLES_BANDEJA,
  rechazar: ROLES_BANDEJA,
  rechazo_preview: ROLES_BANDEJA,   // [RECHAZO-AVISO-1] enseña el correo; CERO escrituras
  // [PORTAL-EDIT-1] las solicitudes de cambio que el cliente manda desde el Portal.
  cambios_listar: ROLES_BANDEJA,
  cambio_cerrar: ROLES_BANDEJA,
  // [PAGOS-PORTAL-2] El comprobante que el cliente subió desde el Portal:
  // verlo (URL firmada) y CAPTURAR el abono con el monto TECLEADO por quien lo
  // vio — el humano decide el dinero, la solicitud solo lo avisa.
  cambio_foto: ROLES_BANDEJA,
  cambio_pago_capturar: ROLES_BANDEJA,
  // [PRUEBA-ARCHIVO-1] Quitar una solicitud de PRUEBA (y lo que nació de ella).
  // Solo Memo: es la única acción que saca filas de dinero de la vista.
  archivar_prueba: ['maestro_roshi'],
  // [REQ-CORRIGE-1] «🔁 Corregir y aprobar»: lo que SÍ hay para esta solicitud
  // (fechas, paquetes, zonas con cupo, habitaciones) — SOLO LEE.
  correccion_opciones: ROLES_BANDEJA,
  // [MP-LINK-1] El link de pago de Mercado Pago de una requisición PENDIENTE:
  // devuelve el guardado o genera uno (monto = separo + comisión, del servidor).
  // Cero dinero: un link es una invitación a pagar, no un pago.
  mp_link: ROLES_BANDEJA,
  // [PREVENTA-AUTO-1] «¡Ya hay paquetes!» a la preventa a ciegas de un evento
  // que salió a la venta: lista (solo lee) y mandar (seco por default).
  preventa_costos_lista: ROLES_BANDEJA,
  preventa_costos: ROLES_BANDEJA,
};
// [CONFIRMA-1] Al aprobar sale UN correo: confirmación + invitación al Portal
// (palabra de Memo: «correo único»). El dueño es _lib/correo-confirmacion; sus
// eventos viven ahí (EVENTOS_CORREO), no aquí, para que la captura manual de
// pagos y la bandeja no puedan divergir. Lo que había aquí (portalAlAprobar,
// ACOMP-1) se reemplazó por esa lib: mandaba la invitación SOLA.
const { enviarCorreoPago } = require('./_lib/correo-confirmacion');
const SIGN_EXPIRA = 60 * 60; // 1 hora, como admin-solicitud-comprobante
const BUCKET = 'abonos-viajeros';
// [PORTAL-PAGO-2] Qué cambio del Portal es un PENDIENTE del equipo: todo lo que
// no sea tipo pago, y un pago que traiga comprobante O que MP ya marcó pagado.
// Un link de MP sin pagar vive en la tabla (para el Portal) pero no es
// trabajo de nadie todavía.
const FILTRO_PAGO_VIVO = '&or=(tipo.neq.pago,foto_path.not.is.null,mp_pago_id.not.is.null)';

// ═════════════════════════════════════════════════════════════════════════════
// [REQ-CORRIGE-1 · 31-oct-2026] CORREGIR Y APROBAR
// ═════════════════════════════════════════════════════════════════════════════
// Palabra de Memo, citada: «hay gente que no puedo darles la zona y fecha que
// quieren … cuando los contacto con whatsapp hago el cambio pero ellos tienen
// que volver a meter la solicitud en el index … habrá forma que en
// requisiciones me pongas un portal donde podamos corregir fecha y zona a lo
// que sí tengo disponible, y al aceptar … les llegue el correo con el dato de
// que no había en tal zona pero te pusimos en esta y todo lo demás normal».
//
// 🔒 AQUÍ NO VIVE NINGUNA REGLA DE PRECIO NI DE DISPONIBILIDAD. Se le pregunta
// a los dueños: qué se vende → `_opciones` (opciones-paquete); a cuánto el
// grupo → `_calcularPrecio`; qué habitaciones valen para N → `_hotelLista`;
// qué fechas siguen vivas → `fechasVendibles`; cuántos boletos quedan →
// `cargarDisponibilidad`/`evaluarZona` (el Palacio). El total SUGERIDO sale del
// motor y quien aprueba lo puede teclear distinto (un descuento negociado por
// WhatsApp es palabra humana), igual que en el aprobar de siempre.
// 🔒 La solicitud ORIGINAL no se pisa: sus columnas siguen diciendo lo que el
// cliente pidió y `correccion` guarda antes/después/motivo/quién/cuándo.
// 🔒 Solo dentro del MISMO evento (otra fecha, otra zona, otro paquete, otra
// habitación). Mandar a otro tour es otra venta, no una corrección.
const { fetchEventosRaw, fetchHotelesGlobales } = require('./_lib/catalogo-index');
const { _calcularPrecio, _hotelLista, esCDMX, hoyMx } = require('./_lib/precio-zona');
const { _opciones, fechasVendibles, NOMBRES } = require('./_lib/opciones-paquete');
const { cargarDisponibilidad, evaluarZona } = require('./_lib/disponibilidad');
// [GENERO-2] El género de un acompañante viaja dentro del jsonb de la
// requisición (lo validó requisicion-crear); aquí se vuelve a pasar por el dueño
// para que un jsonb tocado a mano no tumbe el INSERT de todos por el CHECK.
const { generoNormalizado } = require('./_lib/correo-forma');
const _generoOk = (g) => generoNormalizado(g);

// [VJ-HAB-1] El tipo de habitación del rooming KH, normalizado (un solo dueño
// para la habitación pedida y la corregida).
function normHotelTipo(raw) {
  const h = String(raw || '').trim().toLowerCase();
  if (h.startsWith('compartida')) return 'Compartida';
  if (h.startsWith('doble')) return 'Doble';
  if (h.startsWith('triple')) return 'Triple';
  if (h.startsWith('individual')) return 'Individual';
  return null;
}

// Resuelve lo vendible para la solicitud y, si `c` trae una elección
// (paquete…), la VALIDA contra eso mismo. Jamás escribe.
//   → { ok:false, status, error } | { ok:true, evento, fechas, paquetes,
//       habitaciones, inventario_ok, eleccion|null, total_sugerido|null, avisos }
async function resolverCorreccion(req, c, ctx) {
  c = c || {};
  const slug = String(req.evento_id || '').split('#')[0];
  let lista;
  try { lista = await fetchEventosRaw(); } catch (_) { lista = null; }
  if (!Array.isArray(lista)) return { ok: false, status: 502, error: 'No se pudo leer el catálogo — sin él no se corrige a ciegas. Reintenta en un momento.' };
  const ev = lista.find((x) => x && x.id === slug);
  if (!ev) return { ok: false, status: 409, error: `El evento ${slug} ya no está en el catálogo` };
  const hoyISO = hoyMx();
  const fechas = fechasVendibles(ev, hoyISO);
  if (!fechas.length) return { ok: false, status: 409, error: 'Ese evento ya no tiene fechas a la venta' };
  const esMulti = Array.isArray(ev.multifecha) && ev.multifecha.length > 0;

  // La fecha: la elegida, o la que pidió el cliente si sigue viva, o la primera.
  let objetivo = c.evento_id ? String(c.evento_id) : null;
  if (objetivo && objetivo.split('#')[0] !== slug) return { ok: false, status: 400, error: 'La corrección es dentro del MISMO evento — mandar a otro tour es otra venta' };
  let f = objetivo ? fechas.find((x) => x.evento_id === objetivo) : (fechas.find((x) => x.evento_id === req.evento_id) || fechas[0]);
  if (!f) return { ok: false, status: 409, error: 'Esa fecha ya pasó o no existe en la ficha' };
  const fi = esMulti ? f.idx : 0;
  const N = Math.max(1, Number(req.num_personas) || 1);
  const cdmx = esCDMX(ev);
  let hoteles = {};
  try { hoteles = await fetchHotelesGlobales(); } catch (_) { hoteles = {}; }
  const o = _opciones(ev, hoteles, fi);
  if (!o.ok) return { ok: false, status: 409, error: o.motivo };

  // El inventario del Palacio para ESA fecha. Ilegible → las zonas pasan con
  // `quedan:null` y SE DICE (inventario_ok:false) — jamás un cero inventado.
  let disp = null;
  try {
    disp = await cargarDisponibilidad({ khUrl: ctx.SB_URL, khKey: ctx.SB_KEY,
      portalUrl: process.env.PORTAL_SUPABASE_URL, portalKey: process.env.PORTAL_SUPABASE_SERVICE_KEY, evento_id: f.evento_id });
    if (disp && disp.error) disp = null;
  } catch (_) { disp = null; }

  // Habitaciones que valen para N personas (la lista del dueño).
  const habsGrupo = (_hotelLista(ev, fi, cdmx, hoteles) || []).filter((h) => h && h.n && (!Array.isArray(h.viaj) || h.viaj.includes(N)))
    .map((h) => ({ nombre: h.n, extra: Number(h.e) || 0 }));

  const paquetes = o.paquetes.map((p) => ({
    paquete: p.paquete, nombre: p.nombre, precio: p.precio != null ? p.precio : null,
    duerme: (p.habitaciones || []).length > 0,
    zonas: p.zonas ? p.zonas.map((z) => {
      const ez = disp ? evaluarZona(disp, z.zona, N) : null;
      return { zona: z.zona, precio: z.precio, quedan: ez && ez.gestionada ? ez.restante : null,
        gestionada: !!(ez && ez.gestionada), sin_cupo: !!(ez && ez.gestionada && ez.sinCupo) };
    }) : null,
  }));
  const evento = { evento_id: f.evento_id, nombre: ev.a || slug, fecha: f.lbl, ds: f.ds, cdmx };
  const out = { ok: true, evento, fechas, paquetes, habitaciones: habsGrupo, inventario_ok: !!disp, eleccion: null, total_sugerido: null, avisos: [] };
  if (!disp) out.avisos.push('No se pudo leer el inventario del Palacio: los «quedan» no se muestran — revisa el cupo antes de aprobar.');

  if (!c.paquete) return out;

  // ── Validar la elección ──
  const paquete = String(c.paquete || '').toLowerCase();
  const pq = paquetes.find((x) => x.paquete === paquete);
  if (!pq) return { ok: false, status: 409, error: `El paquete ${NOMBRES[paquete] || paquete} no está a la venta en esa fecha` };
  let zona = null;
  if (pq.zonas) {
    const zIn = String(c.zona || '').trim();
    if (!zIn) return { ok: false, status: 400, error: 'Elige la zona' };
    const hit = pq.zonas.find((z) => z.zona === zIn);
    if (!hit) return { ok: false, status: 409, error: `La zona «${zIn}» no está a la venta en esa fecha para ${pq.nombre}` };
    if (hit.sin_cupo) return { ok: false, status: 409, error: `«${zIn}» no tiene ${N} lugar(es) en el Palacio (quedan ${hit.quedan}). Elige otra.` };
    zona = hit.zona;
    if (!hit.gestionada && disp) out.avisos.push(`«${zona}» no tiene pedido cargado en Kamisama: no se pudo medir el cupo.`);
  }
  let hotel = null;
  if (pq.duerme && habsGrupo.length) {
    const hIn = String(c.hotel || '').trim();
    if (!hIn) return { ok: false, status: 400, error: 'Elige la habitación' };
    const hh = habsGrupo.find((h) => h.nombre === hIn);
    if (!hh) return { ok: false, status: 409, error: `La habitación «${hIn}» no vale para ${N} persona(s) en esa fecha` };
    hotel = hh.nombre;
  }
  const r = _calcularPrecio(ev, { hoteles, paquete, zona: zona || undefined, hotel_nombre: hotel || undefined,
    num_personas: N, transporte_cost: 0, fecha_idx: fi, hoyISO });
  if (!r || !r.ok) return { ok: false, status: 409, error: (r && r.motivo) || 'Esa combinación no se puede vender' };
  if (r.requiere_hotel) return { ok: false, status: 400, error: 'Elige la habitación' };
  if (cdmx && paquete !== 'cheap') out.avisos.push('Evento de CDMX: el total sugerido NO incluye el transporte — súmalo al total si va.');
  out.eleccion = { evento_id: f.evento_id, paquete, zona, hotel, hotel_tipo: normHotelTipo(hotel), fecha: f.lbl };
  out.total_sugerido = Math.round(Number(r.total)) || null;
  return out;
}

function j(status, headers, body) { return { statusCode: status, headers, body: JSON.stringify(body) }; }

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
  if (event.httpMethod !== 'POST') return j(405, headers, { error: 'Solo POST' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return j(400, headers, { error: 'Cuerpo inválido' }); }
  const accion = String(body.accion || '');
  if (!ACCIONES[accion]) return j(400, headers, { error: 'Acción desconocida: ' + accion });

  const auth = await verifyAdminAuthLive(event, ACCIONES[accion]);
  if (!auth.valid) return j(auth.status, headers, { error: auth.error });
  const quien = (auth.user && (auth.user.nombre || auth.user.username || auth.user.correo)) || (auth.user && (auth.user.id || auth.user.sub)) || 'panel';

  const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!SB_URL || !SB_KEY) return j(500, headers, { error: 'Faltan credenciales de KameHouse en el entorno' });
  const sbH = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  const base = `${SB_URL}/rest/v1/requisiciones`;

  // ── listar ────────────────────────────────────────────────────────────────
  if (accion === 'listar') {
    const estado = String(body.estado || 'pendiente');
    let q = `${base}?select=*&order=creado_en.desc&limit=200`;
    if (estado !== 'todas') q += `&estado=eq.${encodeURIComponent(estado)}`;
    if (body.evento_id) q += `&evento_id=eq.${encodeURIComponent(String(body.evento_id))}`;
    const [r, rc] = await Promise.all([
      fetch(q, { headers: sbH }),
      // El conteo de pendientes viaja SIEMPRE (badge de la bandeja y del inicio).
      fetch(`${base}?select=id&estado=eq.pendiente&limit=500`, { headers: sbH }),
    ]);
    if (!r.ok) return j(502, headers, { error: 'No se pudo leer la bandeja', detail: (await r.text()).slice(0, 300) });
    const rows = await r.json();
    const pend = rc.ok ? (await rc.json()).length : null; // null = no se pudo contar (no es 0)
    // [REQ-DUP-1 · 20-oct-2026] El aviso de duplicados, nacido del caso real:
    // Virginia Moguel mandó la MISMA solicitud dos veces (mismo comprobante) y
    // la bandeja aprobó las dos — 4 lugares y $1,200 donde eran 2 y $600. Cada
    // fila lista a sus GEMELAS (mismo evento + mismo celular O correo, otra
    // solicitud, pendiente o aprobada). Este aviso es cortesía de pantalla; el
    // candado de verdad vive en `aprobar` (esconder un botón no es la regla).
    let dups = {};
    try {
      const rd = await fetch(`${base}?select=id,folio,evento_id,celular,correo,estado&estado=in.(pendiente,aprobada)&limit=1000`, { headers: sbH });
      if (rd.ok) {
        const todas = await rd.json();
        const nCel = (s) => String(s || '').replace(/\D/g, '');
        const nMail = (s) => String(s || '').trim().toLowerCase();
        for (const row of rows) {
          const c = nCel(row.celular), m = nMail(row.correo);
          const gem = todas.filter((o) => o.id !== row.id && o.evento_id === row.evento_id &&
            ((c && nCel(o.celular) === c) || (m && nMail(o.correo) === m)));
          if (gem.length) dups[row.id] = gem.map((o) => ({ folio: o.folio, estado: o.estado }));
        }
      }
    } catch (_) { /* el aviso no tumba la bandeja; la autoridad es el candado de aprobar */ }
    // [CORREO-PUNTOS-1] El correo con forma rota se NOMBRA antes de aprobar
    // (caso Mia: «miaa..x@gmail.com» se aprobó y no le llegó ni la confirmación
    // ni el contrato). Lo decide el dueño de la forma; la bandeja solo pinta.
    const { problemaCorreo } = require('./_lib/correo-forma');
    const malCorreo = (x) => {
      const out = [];
      if (x.correo) { const p = problemaCorreo(x.correo); if (p) out.push({ quien: x.nombre || 'titular', correo: x.correo, problema: p }); }
      (Array.isArray(x.acompanantes) ? x.acompanantes : []).forEach((a, i) => {
        const p = a && a.correo ? problemaCorreo(a.correo) : '';
        if (p) out.push({ quien: (a && a.nombre) || ('acompañante ' + (i + 1)), correo: a.correo, problema: p });
      });
      return out.length ? out : null;
    };
    // [REQ-FICHA-1 · 4-nov-2026] La FECHA de cada solicitud, para que la
    // tarjeta la diga sin abrir la cotización (palabra de Memo: «tengo que
    // abrir ver la cotización para ver el tipo de boleto, habitación…»). En
    // un multifecha la fecha del #N la decide su dueño (`fechaDeEventoId`):
    // jamás las cuatro de Fuerza Regida juntas. Catálogo ilegible → sin fecha
    // (la tarjeta lo dice) y la bandeja NO se cae por eso.
    let evCat = null;
    try { const l = await fetchEventosRaw(); if (Array.isArray(l)) { evCat = {}; l.forEach((e) => { if (e && e.id) evCat[e.id] = e; }); } } catch (_) { evCat = null; }
    const { fechaDeEventoId } = require('./_lib/fecha-evento');
    const fichaDe = (x) => {
      if (!evCat) return null;
      const ev = evCat[String(x.evento_id || '').split('#')[0]];
      if (!ev) return null;
      return { fecha: fechaDeEventoId(ev, x.evento_id) || null, venue: ev.v || null };
    };
    return j(200, headers, { ok: true, requisiciones: rows.map((x) => {
      const extra = {};
      const fi = fichaDe(x);
      if (fi) { if (fi.fecha) extra.fecha_txt = fi.fecha; if (fi.venue) extra.venue_txt = fi.venue; }
      if (dups[x.id]) extra.dup_de = dups[x.id];
      const mc = malCorreo(x);
      if (mc) extra.correo_problema = mc;
      return Object.keys(extra).length ? Object.assign({}, x, extra) : x;
    }), pendientes: pend });
  }

  // ── [PORTAL-EDIT-1] solicitudes de cambio del Portal ─────────────────────
  // NO cambian nada solas: el staff las ATIENDE (hace el cambio a mano en
  // KameHouse y le confirma al cliente por WhatsApp) o las RECHAZA con motivo.
  if (accion === 'cambios_listar') {
    const cb = `${SB_URL}/rest/v1/cambios_viajero`;
    const estado = String(body.estado || 'pendiente');
    // [PORTAL-PAGO-2] Un pago tipo link de MP que NADIE ha pagado no es un
    // pendiente del equipo: no se enseña ni se cuenta. En cuanto el webhook lo
    // marca (mp_pago_id) o trae comprobante, entra a la bandeja.
    let q = `${cb}?select=*&order=creado_en.desc&limit=200${FILTRO_PAGO_VIVO}`;
    if (estado !== 'todas') q += `&estado=eq.${encodeURIComponent(estado)}`;
    const r = await fetch(q, { headers: sbH });
    if (!r.ok) return j(502, headers, { error: 'No se pudieron leer las solicitudes de cambio', detail: (await r.text()).slice(0, 300) });
    const rows = await r.json();
    // El WhatsApp y el paquete ACTUALES del viajero (para contestarle con su dato de hoy).
    const ids = [...new Set(rows.map((x) => x.viajero_id))];
    let vmap = {};
    if (ids.length) {
      const rv = await fetch(`${SB_URL}/rest/v1/viajeros_evento?id=in.(${encodeURIComponent(ids.map((x) => '"' + x + '"').join(','))})&select=id,nombre,celular,tipo_paquete,zona_boleto`, { headers: sbH });
      if (rv.ok) (await rv.json()).forEach((v) => { vmap[v.id] = v; });
    }
    const pc = await fetch(`${cb}?select=id&estado=eq.pendiente&limit=500${FILTRO_PAGO_VIVO}`, { headers: sbH });
    const pendientes = pc.ok ? (await pc.json()).length : null;
    return j(200, headers, { ok: true, cambios: rows.map((x) => Object.assign({}, x, { viajero: vmap[x.viajero_id] || null })), pendientes });
  }
  // ── [PREVENTA-AUTO-1] «¡Ya hay paquetes!» a la preventa a ciegas ─────────
  // Palabra de Memo (10-nov): «una vez que tengamos los costos le debe de llegar
  // un correo con ya hay paquetes». Se le pregunta al MISMO dueño que el wizard
  // (`opcionesPaquete`): si el evento sigue sin paquetes reales, no se manda.
  if (accion === 'preventa_costos_lista' || accion === 'preventa_costos') {
    const OP = require('./_lib/opciones-paquete');
    const CPC = require('./_lib/correo-preventa-costos');
    const sel = 'id,evento_id,nombre,correo,tipo_paquete,zona_boleto,portal_revisado_at,usuario_id,tipo_viajero';
    const vr = await fetch(`${SB_URL}/rest/v1/viajeros_evento?tipo_paquete=ilike.cheap&zona_boleto=ilike.preventa%20a%20ciegas&select=${sel}&limit=2000`, { headers: sbH });
    if (!vr.ok) return j(502, headers, { error: 'No se pudo leer a la preventa' });
    const { esDelEquipo } = require('./_lib/portal-revision');
    const todos = (await vr.json()).filter((v) => OP.enPreventa(v) && !esDelEquipo(v));
    const porEv = {};
    for (const v of todos) { const b = String(v.evento_id).split('#')[0]; (porEv[b] = porEv[b] || []).push(v); }
    const leerBitacora = async (slug) => {
      const r = await fetch(`${SB_URL}/rest/v1/portal_recordatorios?campana=eq.${encodeURIComponent(CPC.campanaDe(slug))}&select=correo&limit=5000`, { headers: sbH });
      if (!r.ok) return null;
      return new Set((await r.json()).map((x) => String(x.correo).toLowerCase()));
    };
    if (accion === 'preventa_costos_lista') {
      const out = [];
      for (const slug of Object.keys(porEv)) {
        const o = await OP.opcionesPaquete(slug);
        const bit = await leerBitacora(slug);
        const filas = porEv[slug];
        const correos = new Set(filas.map((v) => String(v.correo || '').trim().toLowerCase()).filter(Boolean));
        out.push({ evento_id: slug, evento: (o.evento && o.evento.nombre) || slug, personas: filas.length, correos: correos.size,
          enviados: bit ? [...correos].filter((c) => bit.has(c)).length : null,
          con_paquetes: !!o.ok, motivo: o.ok ? null : o.motivo });
      }
      out.sort((a, b) => (b.con_paquetes - a.con_paquetes) || String(a.evento).localeCompare(String(b.evento)));
      return j(200, headers, { ok: true, eventos: out });
    }
    const slug = String(body.evento_id || '').split('#')[0].trim();
    if (!/^[a-z0-9-]+$/i.test(slug)) return j(400, headers, { error: 'evento_id inválido' });
    const o = await OP.opcionesPaquete(slug);
    if (!o.ok) return j(409, headers, { error: `Todavía no hay paquetes reales a la venta para este evento (${o.motivo}). Publica la ficha con sus zonas y precios primero.` });
    const bit = await leerBitacora(slug);
    if (!bit) return j(502, headers, { error: 'No se pudo leer la bitácora: no mando nada a ciegas (podría repetir correos).' });
    const filas = porEv[slug] || [];
    const porCorreo = {};
    const sinCorreo = [];
    for (const v of filas) {
      const c = String(v.correo || '').trim().toLowerCase();
      if (!/^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/.test(c)) { sinCorreo.push(v.nombre || v.id); continue; }
      if (!v.portal_revisado_at) { sinCorreo.push((v.nombre || v.id) + ' (sin publicar en el Portal)'); continue; }
      if (!porCorreo[c]) porCorreo[c] = v;
    }
    const tocan = Object.keys(porCorreo).filter((c) => !bit.has(c));
    const yaRecibieron = Object.keys(porCorreo).filter((c) => bit.has(c));
    const ejemplo = tocan.length ? CPC.renderPreventaCostos({ nombre: porCorreo[tocan[0]].nombre, correo: tocan[0], evento: o.evento.nombre, fecha: o.evento.fecha }) : null;
    if (body.seco !== false) {
      return j(200, headers, { ok: true, seco: true, evento: o.evento.nombre, a_quien: tocan.map((c) => ({ correo: c, nombre: porCorreo[c].nombre })), ya_recibieron: yaRecibieron.length, saltados: sinCorreo, ejemplo });
    }
    if (body.confirmar !== true) return j(400, headers, { error: 'falta confirmar:true para mandar' });
    const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
    if (!RESEND_KEY) return j(500, headers, { error: 'falta RESEND_API_KEY' });
    const enviados = [], errores = [];
    for (const c of tocan.slice(0, 60)) {
      const v = porCorreo[c];
      const r = CPC.renderPreventaCostos({ nombre: v.nombre, correo: c, evento: o.evento.nombre, fecha: o.evento.fecha });
      let e;
      try { e = await CPC.enviarUno({ r, RESEND_KEY }); } catch (err) { e = { ok: false, aviso: String(err && err.message) }; }
      if (!e.ok) { errores.push({ correo: c, aviso: e.aviso }); continue; }
      // La bitácora DESPUÉS del envío (si falla, se dice: el próximo clic lo repetiría).
      const b = await fetch(`${SB_URL}/rest/v1/portal_recordatorios`, { method: 'POST', headers: Object.assign({}, sbH, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ campana: CPC.campanaDe(slug), correo: c, nombre: v.nombre || null, evento_id: v.evento_id, email_id: e.id, enviado_por: quien }) }).catch(() => null);
      enviados.push({ correo: c, bitacora: !!(b && b.ok) });
    }
    return j(200, headers, { ok: true, enviados, errores, saltados: sinCorreo, faltan: Math.max(0, tocan.length - 60) });
  }

  if (accion === 'cambio_cerrar') {
    const cid = String(body.id || '');
    if (!/^[0-9a-f-]{36}$/.test(cid)) return j(400, headers, { error: 'id inválido' });
    const nuevo = String(body.estado || '');
    if (nuevo !== 'atendida' && nuevo !== 'rechazada') return j(400, headers, { error: 'Estado inválido' });
    const respuesta = String(body.respuesta || '').trim().slice(0, 500);
    if (nuevo === 'rechazada' && respuesta.length < 3) return j(400, headers, { error: 'Di por qué no procede (el cliente lo va a preguntar)' });
    // [PAQ-SOLO-APLICAR-1] Una elección de paquete solo se cierra de DOS formas
    // (palabra de Memo, 30-oct): «✓ Aplicar paquete» o «No procede» con motivo.
    // Medido: el 28-oct los 3 de la preventa de nsqkmty se cerraron «atendida»
    // SIN aplicar el paquete — siguieron en preventa a ciegas ($300) y el cierre
    // les mandó «tu paquete quedó confirmado». Hoy, cerrar como atendida exige
    // que el viajero YA no esté en la preventa (el «Aplicar» lo saca primero y
    // después cierra; un cierre suelto rebota 409 sin escribir ni mandar nada).
    if (nuevo === 'atendida') {
      const pr = await fetch(`${SB_URL}/rest/v1/cambios_viajero?id=eq.${cid}&select=tipo,viajero_id&limit=1`, { headers: sbH });
      if (!pr.ok) return j(502, headers, { error: 'No se pudo leer la solicitud' });
      const c0 = (await pr.json())[0];
      if (c0 && c0.tipo === 'paquete') {
        const vr = await fetch(`${SB_URL}/rest/v1/viajeros_evento?id=eq.${c0.viajero_id}&select=zona_boleto&limit=1`, { headers: sbH });
        if (!vr.ok) return j(502, headers, { error: 'No se pudo leer al viajero' });
        const v0 = (await vr.json())[0];
        const enPreventa = !v0 || /preventa a ciegas/i.test(String(v0.zona_boleto || ''));
        if (enPreventa) return j(409, headers, { error: 'Esa persona sigue en preventa a ciegas: usa «✓ Aplicar paquete» (o «No procede» con motivo). Cerrarla sin aplicar la dejaría atorada.' });
      }
    }
    const r = await fetch(`${SB_URL}/rest/v1/cambios_viajero?id=eq.${cid}&estado=eq.pendiente`, {
      method: 'PATCH',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ estado: nuevo, respuesta: respuesta || null, atendida_por: quien, atendida_at: new Date().toISOString() }),
    });
    if (!r.ok) return j(502, headers, { error: 'No se pudo cerrar la solicitud', detail: (await r.text()).slice(0, 300) });
    const rows = await r.json();
    if (!rows.length) return j(409, headers, { error: 'Esa solicitud ya no está pendiente — alguien más la cerró' });
    // [PREVENTA-PORTAL-2] La respuesta a «Elegir mi paquete» va por CORREO (palabra
    // de Memo). Sale DESPUÉS de cerrar y jamás tumba el cierre: si falla, se DICE.
    // [CAMBIO-RECHAZO-1] Y el «No procede» de los DEMÁS tipos (hotel/zona/fecha/
    // otro/pago) también avisa: medido el 30-oct, el motivo que tecleaba el equipo
    // moría en la columna `respuesta` sin que el cliente se enterara jamás —
    // el mismo hueco que RECHAZO-AVISO-1 cerró en requisiciones. Solo el RECHAZO
    // manda correo aquí: lo atendido se ve en su plan (y el paquete tiene el suyo).
    let correo = null;
    if (rows[0].tipo === 'paquete') {
      const { avisarPaquete } = require('./_lib/correo-paquete');
      correo = await avisarPaquete({ cambio: rows[0], KH_URL: SB_URL, KH_KEY: SB_KEY });
    } else if (nuevo === 'rechazada') {
      const { avisarCambioRechazado } = require('./_lib/correo-cambio');
      correo = await avisarCambioRechazado({ cambio: rows[0], KH_URL: SB_URL, KH_KEY: SB_KEY });
    }
    return j(200, headers, { ok: true, cambio: rows[0], correo });
  }

  // ── [PAGOS-PORTAL-2] el comprobante del cliente, por URL firmada ──────────
  // La MISMA forma que `detalle` (el comprobante de la requisición): firmar el
  // path del bucket privado, 1 h. Solo paths de cambios_viajero — el id manda,
  // el path se LEE de la fila, jamás del cuerpo (un path tecleado podría firmar
  // cualquier objeto del bucket).
  if (accion === 'cambio_foto') {
    const cid = String(body.id || '');
    if (!/^[0-9a-f-]{36}$/.test(cid)) return j(400, headers, { error: 'id inválido' });
    const r = await fetch(`${SB_URL}/rest/v1/cambios_viajero?id=eq.${cid}&select=id,foto_path`, { headers: sbH });
    if (!r.ok) return j(502, headers, { error: 'No se pudo leer la solicitud' });
    const c = (await r.json())[0];
    if (!c) return j(404, headers, { error: 'Esa solicitud no existe' });
    if (!c.foto_path) return j(404, headers, { error: 'Esta solicitud no trae comprobante' });
    let signed_url = null;
    try {
      const rs = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${encodeURI(c.foto_path)}`, {
        method: 'POST',
        headers: Object.assign({}, sbH, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expiresIn: SIGN_EXPIRA }),
      });
      if (rs.ok) {
        const js = await rs.json().catch(() => null);
        if (js && js.signedURL) signed_url = `${SB_URL}/storage/v1${js.signedURL}`;
      }
    } catch (_) { /* sin firma: se dice abajo */ }
    if (!signed_url) return j(502, headers, { error: 'No se pudo firmar el comprobante' });
    return j(200, headers, { ok: true, signed_url });
  }

  // ── [PAGOS-PORTAL-2] capturar el abono de un comprobante del Portal ──────
  // El clic que convierte el AVISO en dinero, con un humano enfrente:
  //   1) el abono nace con el monto TECLEADO por quien vio el comprobante
  //      (jamás el «declarado» del cliente — ese es texto, no cifra) y HEREDA
  //      el foto_path de la solicitud (la forma del aprobar de REQ-B1: mismo
  //      bucket, el 📎 de la lista de viajeros lo abre sin copiar);
  //   2) la solicitud se cierra con VALOR ESPERADO (estado=eq.pendiente): el
  //      2º clic contesta 409 y no nace un segundo abono.
  // ⚠️ El ORDEN es cerrar PRIMERO y abonar DESPUÉS, y es deliberado: si el
  // abono falla, la solicitud quedó 'atendida' sin abono (se reabre a mano o
  // se captura por ➕ Abono — la respuesta 207 lo dice con el monto); al revés,
  // una carrera de dos clics podría crear DOS abonos del mismo comprobante,
  // que es dinero inventado y no se deshace solo. Equivocarse hacia «falta
  // capturar» se ve y se corrige; hacia «capturado dos veces» es lo invisible.
  // [PORTAL-PAGO-2] Y el REPARTO: un comprobante (o un pago de MP) puede cubrir
  // a varios del mismo grupo — «de estos $1,300: $650 a Jose y $650 a Jonathan».
  // El cliente lo DECLARA en `desglose` y aquí el humano lo CONFIRMA (o lo
  // corrige) en `reparto: [{viajero_id, monto}]`. Nace UN abono por persona,
  // todos con el mismo comprobante y el mismo mp_pago_id. Sin `reparto`, la
  // forma de siempre: `monto` al viajero de la solicitud.
  // 🔒 Solo puede nombrar al viajero de la solicitud, a quien el cliente nombró
  //    en su desglose y a su `grupo_viaje` del mismo evento. A nadie más.
  // 🔒 Con pago en MP el dinero YA es un hecho: la suma del reparto tiene que
  //    ser el NETO (bruto − comisión cargada al cliente), ±$1 de redondeo.
  if (accion === 'cambio_pago_capturar') {
    const cid = String(body.id || '');
    if (!/^[0-9a-f-]{36}$/.test(cid)) return j(400, headers, { error: 'id inválido' });

    const rc = await fetch(`${SB_URL}/rest/v1/cambios_viajero?id=eq.${cid}&select=id,viajero_id,evento_id,tipo,estado,foto_path,detalle,nombre,desglose,mp_pago_id,mp_monto,mp_monto_cobrar,mp_neto,mp_preference_id`, { headers: sbH });
    if (!rc.ok) return j(502, headers, { error: 'No se pudo leer la solicitud' });
    const c = (await rc.json())[0];
    if (!c) return j(404, headers, { error: 'Esa solicitud no existe' });
    if (c.tipo !== 'pago') return j(409, headers, { error: 'Esa solicitud no es un pago — se atiende con los botones de siempre' });
    if (!c.foto_path && !c.mp_pago_id) return j(409, headers, { error: 'Este pago no trae comprobante ni pago en Mercado Pago: no hay nada que capturar todavía' });

    // El NETO que MP ya cobró, si lo hay: bruto − (cobrar − neto) = lo que el
    // cliente quiso abonar. Si cobró distinto a lo esperado, el neto sigue la
    // diferencia (la comisión es la del link).
    const mpNeto = c.mp_pago_id
      ? Math.round((Number(c.mp_monto) || 0) - Math.max(0, (Number(c.mp_monto_cobrar) || 0) - (Number(c.mp_neto) || 0)))
      : null;

    // Las MISMAS validaciones de monto que abono_crear (admin-coordi-
    // asignaciones) — copiadas, no inventadas; si divergen, el careo las carea.
    let reparto;
    if (Array.isArray(body.reparto)) {
      if (!body.reparto.length || body.reparto.length > 10) return j(400, headers, { error: 'El reparto tiene que traer de 1 a 10 personas' });
      const permitidos = new Set([c.viajero_id].concat((Array.isArray(c.desglose) ? c.desglose : []).map((d) => d && d.viajero_id).filter(Boolean)));
      try {
        const rv0 = await fetch(`${SB_URL}/rest/v1/viajeros_evento?id=eq.${c.viajero_id}&select=grupo_viaje,evento_id&limit=1`, { headers: sbH });
        const v0 = rv0.ok ? (await rv0.json())[0] : null;
        if (v0 && v0.grupo_viaje) {
          const rg = await fetch(`${SB_URL}/rest/v1/viajeros_evento?grupo_viaje=eq.${encodeURIComponent(v0.grupo_viaje)}&evento_id=eq.${encodeURIComponent(v0.evento_id)}&select=id&limit=20`, { headers: sbH });
          if (rg.ok) (await rg.json()).forEach((m) => permitidos.add(m.id));
        }
      } catch (_) { /* sin grupo legible: solo el titular y su desglose */ }
      const vistos = new Set();
      reparto = [];
      for (const r of body.reparto) {
        const vid = String(r && r.viajero_id || '');
        const m = Number(r && r.monto);
        if (!/^[0-9a-f-]{36}$/.test(vid) || !permitidos.has(vid)) return j(400, headers, { error: 'El reparto nombra a alguien que no viaja con esta persona' });
        if (vistos.has(vid)) return j(400, headers, { error: 'Una persona aparece dos veces en el reparto' });
        if (!Number.isFinite(m) || m <= 0) return j(400, headers, { error: 'Cada monto del reparto tiene que ser mayor que cero' });
        if (m > 1000000) return j(400, headers, { error: 'Monto fuera de rango' });
        vistos.add(vid);
        reparto.push({ viajero_id: vid, monto: m });
      }
    } else {
      const monto = Number(body.monto);
      if (!Number.isFinite(monto) || monto <= 0) return j(400, headers, { error: 'El monto tiene que ser mayor que cero' });
      if (monto > 1000000) return j(400, headers, { error: 'Monto fuera de rango' });
      reparto = [{ viajero_id: c.viajero_id, monto }];
    }
    const montoTotal = Math.round(reparto.reduce((s, r) => s + r.monto, 0) * 100) / 100;
    if (montoTotal > 1000000) return j(400, headers, { error: 'Monto fuera de rango' });
    if (mpNeto != null && Math.abs(montoTotal - mpNeto) > 1) {
      return j(400, headers, { error: `Mercado Pago cobró $${Number(c.mp_monto).toLocaleString('es-MX')} (neto $${mpNeto.toLocaleString('es-MX')}): el reparto tiene que sumar $${mpNeto.toLocaleString('es-MX')}, no $${montoTotal.toLocaleString('es-MX')}` });
    }

    // 1 · Cerrar con valor esperado: el reclamo. 0 filas = alguien ganó el clic.
    const respuesta = `Abono capturado: $${Math.round(montoTotal).toLocaleString('es-MX')}${reparto.length > 1 ? ' repartido entre ' + reparto.length : ''} · ${quien}`;
    const rz = await fetch(`${SB_URL}/rest/v1/cambios_viajero?id=eq.${cid}&estado=eq.pendiente`, {
      method: 'PATCH',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ estado: 'atendida', respuesta, atendida_por: quien, atendida_at: new Date().toISOString() }),
    });
    if (!rz.ok) return j(502, headers, { error: 'No se pudo reclamar la solicitud', detail: (await rz.text()).slice(0, 300) });
    if (!(await rz.json()).length) return j(409, headers, { error: 'Esa solicitud ya no está pendiente — alguien más la atendió' });

    // 2 · Los abonos — capturado_por del JWT (anti-spoofing, como abono_crear),
    // foto_path heredado del comprobante, mp_pago_id heredado del webhook.
    // UN solo POST: o nacen todos o ninguno.
    const origen = c.mp_pago_id
      ? `Pagado en Mercado Pago #${c.mp_pago_id} desde el Portal (cobró $${Number(c.mp_monto).toLocaleString('es-MX')}, comisión al cliente $${Math.max(0, Math.round((Number(c.mp_monto) || 0) - montoTotal)).toLocaleString('es-MX')})`
      : 'Pago subido desde el Portal';
    const titularTxt = reparto.length > 1 ? ` · reparto de ${c.nombre || 'titular'} (${reparto.length} personas)` : '';
    const filasAbono = reparto.map((r) => ({
      viajero_id: r.viajero_id, monto: r.monto, foto_path: c.foto_path || null,
      mp_pago_id: c.mp_pago_id || null,
      nota: (origen + titularTxt + ' · ' + String(c.detalle || '').slice(0, 220)).slice(0, 500),
      capturado_por: quien,
    }));
    const ra = await fetch(`${SB_URL}/rest/v1/abonos_viajero`, {
      method: 'POST',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(filasAbono),
    });
    if (!ra.ok) {
      // La solicitud YA quedó atendida; el dinero NO entró. Se DICE con el
      // monto para capturarlo por ➕ Abono — nada se borra ni se reintenta solo.
      return j(207, headers, { error: 'La solicitud se cerró pero el ABONO NO SE GUARDÓ: captúralo por ➕ Abono con $' + montoTotal + (reparto.length > 1 ? ' (repartido)' : ''), detail: (await ra.text()).slice(0, 300) });
    }
    const abonos = await ra.json();
    const abono = abonos[0] || null;

    // 3 · «Recibimos tu pago» — el MISMO correo de la captura manual, con la
    // FIRMA del dueño (leída de abono_crear, no adivinada). EVENTOS_CORREO
    // decide; fuera de la lista no sale nada. Jamás tumba el abono.
    let correo = null;
    try {
      const recibido = {};
      reparto.forEach((r) => { recibido[r.viajero_id] = r.monto; });
      correo = await enviarCorreoPago({
        tipo: 'abono', evento_id: c.evento_id, viajeroIds: reparto.map((r) => r.viajero_id),
        recibidoPorViajero: recibido,
        enviado_por: (auth.user && auth.user.correo) || null,
        KH_URL: SB_URL, KH_KEY: SB_KEY,
      });
    } catch (e) { correo = { error: e.message }; }
    return j(200, headers, { ok: true, abono, abonos, reparto, correo });
  }

  // Las tres restantes piden el id.
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return j(400, headers, { error: 'id inválido' });

  // ── detalle: la fila + URL firmada del comprobante (1 h) ─────────────────
  if (accion === 'detalle') {
    const r = await fetch(`${base}?id=eq.${id}&select=*`, { headers: sbH });
    if (!r.ok) return j(502, headers, { error: 'No se pudo leer la requisición' });
    const rows = await r.json();
    if (!rows.length) return j(404, headers, { error: 'Esa requisición no existe' });
    const req = rows[0];
    let signed_url = null;
    if (req.comprobante_path) {
      try {
        const rs = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${encodeURI(req.comprobante_path)}`, {
          method: 'POST',
          headers: Object.assign({}, sbH, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ expiresIn: SIGN_EXPIRA }),
        });
        if (rs.ok) {
          const js = await rs.json().catch(() => null);
          if (js && js.signedURL) signed_url = `${SB_URL}/storage/v1${js.signedURL}`;
        }
      } catch (_) { /* sin firma: la pantalla lo dice, no lo inventa */ }
    }
    return j(200, headers, { ok: true, requisicion: req, signed_url });
  }

  // ── [RECHAZO-AVISO-1] LA VISTA PREVIA ────────────────────────────────────
  // Enseña el correo EXACTO que va a recibir el cliente, antes de rechazar.
  // 🔒 CERO escrituras: ni un PATCH, ni un correo. Enseñar no es mandar.
  if (accion === 'rechazo_preview') {
    const CR = require('./_lib/correo-rechazo');
    const rq = await fetch(`${base}?id=eq.${id}&select=*`, { headers: sbH });
    if (!rq.ok) return j(502, headers, { error: 'No se pudo leer la solicitud' });
    const req = (await rq.json())[0];
    if (!req) return j(404, headers, { error: 'Esa solicitud ya no existe' });
    // [RECHAZO-AVISO-1b] Se lo DICE antes del clic, no después del correo.
    const ya = await CR.yaViajaEnEvento({ req, KH_URL: SB_URL, KH_KEY: SB_KEY });
    const prev = await CR.armarRechazo({
      req, motivo_clave: body.motivo_clave,
      motivo_texto: String(body.motivo || '').trim().slice(0, 500), ya,
    });
    return j(200, headers, {
      ok: true, motivos: CR.MOTIVOS, pago: !!req.comprobante_path,
      wa: CR.waDe(req), tiene_correo: !!req.correo, preview: prev, ya_viaja: ya,
    });
  }

  // ── rechazar: motivo OBLIGATORIO — un rechazo sin palabra no le sirve a
  // nadie: ni al cliente que pregunta ni al que lo revisa en un mes. ────────
  //
  // [RECHAZO-AVISO-1] Y DESDE HOY LE AVISA AL CLIENTE. Medido antes: esta
  // acción solo hacía el PATCH, así que cuatro personas que YA habían
  // transferido quedaron rechazadas sin enterarse. El correo sale SOLO (palabra
  // de Memo) y la bandeja ya enseñó el texto exacto antes del clic.
  // 🔒 El aviso JAMÁS tumba el rechazo: si el correo falla, la solicitud queda
  //    rechazada igual y la respuesta DICE que no salió, con el link de
  //    WhatsApp para avisarle a mano. Es la misma ley del correo único.
  if (accion === 'rechazar') {
    const CR = require('./_lib/correo-rechazo');
    const motivo = String(body.motivo || '').trim().slice(0, 500);
    if (motivo.length < 3) return j(400, headers, { error: 'Di por qué se rechaza (el cliente lo va a preguntar)' });
    const clave = body.motivo_clave == null ? null : String(body.motivo_clave);
    if (clave !== null && !CR.CLAVES.includes(clave)) return j(400, headers, { error: 'Ese motivo no existe en la lista' });
    const r = await fetch(`${base}?id=eq.${id}&estado=eq.pendiente`, {
      method: 'PATCH',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ estado: 'rechazada', motivo_rechazo: motivo, motivo_clave: clave, revisada_por: quien, revisada_at: new Date().toISOString() }),
    });
    if (!r.ok) return j(502, headers, { error: 'No se pudo rechazar', detail: (await r.text()).slice(0, 300) });
    const rows = await r.json();
    if (!rows.length) return j(409, headers, { error: 'Esa requisición ya no está pendiente — alguien más la revisó' });
    let aviso = { avisado: false, razon: 'no se intentó' };
    try {
      aviso = await CR.avisarRechazo({ req: rows[0], motivo_clave: clave, motivo_texto: motivo, KH_URL: SB_URL, KH_KEY: SB_KEY });
    } catch (e) { aviso = { avisado: false, razon: 'El aviso falló', detail: String(e.message).slice(0, 200), wa: CR.waDe(rows[0]) }; }
    return j(200, headers, { ok: true, requisicion: rows[0], aviso });
  }

  // ── [PRUEBA-ARCHIVO-1] archivar_prueba: «quítala, fue de prueba» ─────────
  // Palabra de Memo (13-oct): «dame opción de eliminar manualmente las
  // solicitudes de prueba». No se borra a ciegas: TODO lo que se quita se COPIA
  // antes a `pruebas_archivo_*` (con quién, cuándo y por qué) y solo entonces se
  // saca de las tablas vivas. Si la requisición estaba APROBADA, se van también
  // los viajeros que nacieron de ELLA (nota «Requisición FOLIO») y SUS abonos.
  // 🔒 Candado: si alguno de esos viajeros tiene un pago que NO vino de la
  // requisición (capturado a mano después), se REHÚSA — eso ya es dinero real y
  // no se archiva como prueba.
  if (accion === 'archivar_prueba') {
    if (body.confirmar !== true) return j(400, headers, { error: 'Archivar pide confirmar:true' });
    const motivo = String(body.motivo || 'prueba').trim().slice(0, 300) || 'prueba';
    const H = Object.assign({}, sbH, { 'Content-Type': 'application/json' });
    const leer = async (u) => { const r = await fetch(u, { headers: sbH }); if (!r.ok) throw new Error((await r.text()).slice(0, 200)); return r.json(); };
    let req, viajeros = [], abonos = [];
    try {
      req = (await leer(`${base}?id=eq.${id}&select=*`))[0];
      if (!req) return j(404, headers, { error: 'Esa solicitud ya no existe' });
      if (req.estado === 'aprobada') {
        const porNota = await leer(`${SB_URL}/rest/v1/viajeros_evento?evento_id=eq.${encodeURIComponent((req.correccion && req.correccion.despues && req.correccion.despues.evento_id) || req.evento_id)}&notas=like.${encodeURIComponent('Requisición ' + req.folio + '*')}&select=*`);
        const ids = new Set(porNota.map((v) => v.id));
        if (req.viajero_id && !ids.has(req.viajero_id)) {
          const t = await leer(`${SB_URL}/rest/v1/viajeros_evento?id=eq.${req.viajero_id}&select=*`);
          t.forEach((v) => { ids.add(v.id); porNota.push(v); });
        }
        viajeros = porNota;
        if (ids.size) {
          abonos = await leer(`${SB_URL}/rest/v1/abonos_viajero?viajero_id=in.(${Array.from(ids).join(',')})&select=*`);
          const ajenos = abonos.filter((a) => !String(a.nota || '').includes(req.folio));
          if (ajenos.length) {
            return j(409, headers, { error: `No se archiva: ${ajenos.length} pago(s) de esa persona se capturaron aparte de la solicitud (dinero real). Revísalo a mano.` });
          }
        }
      }
    } catch (e) { return j(502, headers, { error: 'No pude leer lo que hay que archivar', detail: e.message }); }
    const sello = { archivado_por: quien, motivo_archivo: motivo };
    // 1 · COPIAR al archivo (si falla, no se borra nada).
    const copiar = async (tabla, filas) => {
      if (!filas.length) return true;
      const r = await fetch(`${SB_URL}/rest/v1/${tabla}`, { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(filas.map((f) => Object.assign({}, f, sello))) });
      if (!r.ok) throw new Error(tabla + ': ' + (await r.text()).slice(0, 200));
      return true;
    };
    try {
      await copiar('pruebas_archivo_requisiciones', [req]);
      await copiar('pruebas_archivo_viajeros', viajeros);
      await copiar('pruebas_archivo_abonos', abonos);
    } catch (e) { return j(502, headers, { error: 'No se pudo copiar al archivo — no se quitó nada', detail: e.message }); }
    // 2 · QUITAR de las tablas vivas, en orden de llaves (abonos → requisición → viajeros).
    const quitar = async (u) => { const r = await fetch(u, { method: 'DELETE', headers: Object.assign({}, sbH, { Prefer: 'return=representation' }) }); if (!r.ok) throw new Error((await r.text()).slice(0, 200)); return (await r.json()).length; };
    try {
      if (abonos.length) await quitar(`${SB_URL}/rest/v1/abonos_viajero?id=in.(${abonos.map((a) => a.id).join(',')})`);
      await quitar(`${base}?id=eq.${id}&folio=eq.${encodeURIComponent(req.folio)}`);
      if (viajeros.length) await quitar(`${SB_URL}/rest/v1/viajeros_evento?id=in.(${viajeros.map((v) => v.id).join(',')})`);
    } catch (e) {
      return j(207, headers, { ok: false, error: 'Se copió al archivo pero no se terminó de quitar — avísale a Jane', detail: e.message });
    }
    return j(200, headers, { ok: true, folio: req.folio, viajeros: viajeros.length, abonos: abonos.length });
  }

  // ── aprobar: NACE el viajero ──────────────────────────────────────────────
  // ── [REQ-CORRIGE-1] lo que SÍ hay para esta solicitud (SOLO LEE) ─────────
  if (accion === 'correccion_opciones') {
    const r0 = await fetch(`${base}?id=eq.${id}&select=*`, { headers: sbH });
    if (!r0.ok) return j(502, headers, { error: 'No se pudo leer la requisición' });
    const rows0 = await r0.json();
    if (!rows0.length) return j(404, headers, { error: 'Esa requisición no existe' });
    const req = rows0[0];
    if (req.estado !== 'pendiente') return j(409, headers, { error: `Ya está ${req.estado}` });
    const c = { evento_id: body.evento_id, paquete: body.paquete, zona: body.zona, hotel: body.hotel };
    const res = await resolverCorreccion(req, c, { SB_URL, SB_KEY });
    if (!res.ok) return j(res.status, headers, { error: res.error });
    return j(200, headers, Object.assign({ pidio: { evento_id: req.evento_id, paquete: req.paquete, zona: req.zona || null, hotel: req.hotel || null, num_personas: req.num_personas } }, res));
  }

  // ── [MP-LINK-1] mp_link: el link de pago de una requisición pendiente ────
  if (accion === 'mp_link') {
    const r0 = await fetch(`${base}?id=eq.${id}&select=*`, { headers: sbH });
    if (!r0.ok) return j(502, headers, { error: 'No se pudo leer la requisición' });
    const rows0 = await r0.json();
    if (!rows0.length) return j(404, headers, { error: 'Esa requisición no existe' });
    const req = rows0[0];
    if (req.estado !== 'pendiente') return j(409, headers, { error: `Ya está ${req.estado}: no se genera link` });
    if (req.mp_pago_id) return j(409, headers, { error: 'Esta requisición YA tiene un pago aprobado en Mercado Pago', mp_pago_id: req.mp_pago_id });
    const { disponible, crearLinkRequisicion } = require('./_lib/mp-link');
    // El guardado sirve tal cual salvo que pidan regenerar (cambió el separo,
    // o el link viejo murió). Regenerar escribe uno nuevo encima — el viejo
    // sigue vivo en MP y, si alguien paga por él, el webhook lo anota igual
    // (la referencia es el folio, no la preferencia).
    if (req.mp_init_point && !body.regenerar) {
      return j(200, headers, { ok: true, url: req.mp_init_point, monto: req.mp_monto_cobrar, preference_id: req.mp_preference_id, guardado: true });
    }
    const d = disponible();
    if (!d.ok) return j(409, headers, { error: 'Mercado Pago no está disponible: ' + d.motivo });
    const link = await crearLinkRequisicion({ req, SB_URL, sbH });
    if (!link.ok) return j(502, headers, { error: 'No se pudo generar el link: ' + link.motivo });
    return j(200, headers, { ok: true, url: link.url, monto: link.total_pesos, comision: link.comision_pesos, neto: link.neto_pesos, preference_id: link.preference_id, guardado: false });
  }

  if (accion === 'aprobar') {
    // 1 · Leer la fila (para armar el viajero con sus datos).
    const r0 = await fetch(`${base}?id=eq.${id}&select=*`, { headers: sbH });
    if (!r0.ok) return j(502, headers, { error: 'No se pudo leer la requisición' });
    const rows0 = await r0.json();
    if (!rows0.length) return j(404, headers, { error: 'Esa requisición no existe' });
    const req = rows0[0];
    if (req.estado !== 'pendiente') return j(409, headers, { error: `Ya está ${req.estado}` });

    // [REQ-DUP-1] EL CANDADO DEL DUPLICADO, en el servidor (la regla, no la UI).
    // Si este celular/correo YA tiene una requisición APROBADA en este evento,
    // aprobar otra duplica lugares y dinero (caso Virginia Moguel, 19-oct: el
    // mismo comprobante se aprobó dos veces). Solo pasa con `duplicado_ok:true`
    // — la palabra de quien COMPARÓ los comprobantes y vio dos pagos distintos.
    // La verificación es parte de la aprobación: si no se puede leer, no se
    // aprueba a ciegas (un candado que falla en silencio no es un candado).
    {
      const cN = String(req.celular || '').replace(/\D/g, '');
      const mN = String(req.correo || '').trim().toLowerCase();
      const rd = await fetch(`${base}?select=id,folio,celular,correo&evento_id=eq.${encodeURIComponent(req.evento_id)}&estado=eq.aprobada&limit=500`, { headers: sbH });
      if (!rd.ok) return j(502, headers, { error: 'No se pudo verificar si hay duplicados — reintenta en un momento' });
      const gem = (await rd.json()).filter((o) => o.id !== id &&
        ((cN && String(o.celular || '').replace(/\D/g, '') === cN) || (mN && String(o.correo || '').trim().toLowerCase() === mN)));
      if (gem.length && body.duplicado_ok !== true) {
        return j(409, headers, {
          error: `Este celular/correo ya tiene aprobada ${gem.map((g) => g.folio).join(', ')} en este mismo evento. Compara los comprobantes: si es la MISMA transferencia, recházala como duplicada; si es una compra nueva de verdad (otro pago), confírmalo.`,
          duplicado: gem.map((g) => g.folio),
        });
      }
    }

    // 1b · [REQ-CORRIGE-1] ¿Se aprueba CORREGIDA? La elección se valida contra
    // lo vendible ANTES de reclamar (un 4xx después dejaría «aprobada» sin
    // viajeros) y manda en todo lo que sigue: fecha, paquete, zona, habitación.
    let corr = null;
    if (body.correccion != null) {
      const c = body.correccion;
      if (typeof c !== 'object' || Array.isArray(c)) return j(400, headers, { error: 'La corrección viene mal formada' });
      const motivo = String(c.motivo || '').trim().slice(0, 300);
      if (motivo.length < 3) return j(400, headers, { error: 'Escribe por qué se corrigió (el cliente lo lee en su correo)' });
      const res = await resolverCorreccion(req, c, { SB_URL, SB_KEY });
      if (!res.ok) return j(res.status, headers, { error: res.error });
      if (!res.eleccion) return j(400, headers, { error: 'Elige el paquete de la corrección' });
      const e = res.eleccion;
      const antes = { evento_id: req.evento_id, paquete: req.paquete, zona: req.zona || null, hotel: req.hotel || null, total: req.total_sistema != null ? Math.round(Number(req.total_sistema)) : null };
      const igual = e.evento_id === antes.evento_id && e.paquete === antes.paquete &&
        String(e.zona || '') === String(antes.zona || '') && normHotelTipo(e.hotel) === normHotelTipo(antes.hotel);
      if (igual) return j(400, headers, { error: 'La corrección es igual a lo que pidió el cliente — usa «Aprobar» normal' });
      corr = { antes, despues: { evento_id: e.evento_id, paquete: e.paquete, zona: e.zona, hotel: e.hotel, total: null },
        motivo, por: quien, at: new Date().toISOString(), total_sugerido: res.total_sugerido, avisos: res.avisos,
        fecha_lbl: e.fecha, hotel_tipo: e.hotel_tipo };
    }
    const evEf = corr ? corr.despues.evento_id : req.evento_id;
    const paqEf = corr ? corr.despues.paquete : req.paquete;
    const hotelEf = corr ? corr.despues.hotel : req.hotel;

    // 2 · El dinero, tecleado por el humano que vio el comprobante.
    // [REQ-LINK-1] Sin comprobante NO se inventa dinero (el caso Daniela,
    // 30-oct: una requisición `link_pago` —que por diseño nace sin comprobante,
    // el cliente paga DESPUÉS en el link— se aprobó y nació un abono de $300
    // que nadie pagó). Con comprobante el monto sigue siendo OBLIGATORIO; sin
    // él, monto 0/omitido = aprobar SIN abono: el viajero nace debiendo todo y
    // el pago real se captura como abono cuando de verdad llegue.
    // [MP-LINK-1] Un pago APROBADO en Mercado Pago (lo marcó el webhook tras
    // leer el pago del GET autenticado) CUENTA como comprobante: el id del pago
    // es el ticket. El monto del abono es lo que MP cobró MENOS la comisión que
    // se le cargó al cliente — a la casa le entra el neto del separo, no el
    // bruto; abonar el bruto le regalaría la comisión de MP al cliente.
    const pagoMP = req.mp_pago_id ? (() => {
      const bruto = Math.round(Number(req.mp_monto) || 0);
      // La comisión que el LINK le cargó = lo que pedía el link − el separo.
      // Sin link propio (mp_monto_cobrar null) no se le resta nada: el bruto.
      const comisionCargada = (req.mp_monto_cobrar != null && req.separo_sistema != null)
        ? Math.max(0, Math.round(Number(req.mp_monto_cobrar) - Number(req.separo_sistema))) : 0;
      return { id: String(req.mp_pago_id), bruto, comision: comisionCargada, neto: Math.max(0, bruto - comisionCargada) };
    })() : null;
    const sinComprobante = !req.comprobante_path && !pagoMP;
    const monto = Math.round(Number(body.monto)) || (pagoMP ? pagoMP.neto : 0);
    if (!(monto > 0) && !sinComprobante) return j(400, headers, { error: 'El monto del abono va en pesos y mayor a cero — es lo que dice el comprobante que verificaste' });
    const total_contrato = (body.total_contrato != null && body.total_contrato !== '')
      ? Math.round(Number(body.total_contrato))
      : (corr ? corr.total_sugerido : (req.total_sistema != null ? Math.round(Number(req.total_sistema)) : null));
    if (corr) corr.despues.total = total_contrato;
    if (!(total_contrato > 0)) return j(400, headers, { error: 'Falta el total del contrato (el sistema no lo tiene para este caso — por ejemplo CDMX con transporte): captúralo' });
    // [DESGLOSE-1] Pagar DE MÁS se permite solo si quien aprueba lo dice
    // (`saldo_favor:true`): el excedente queda como saldo a favor del cliente.
    // Sin esa palabra sigue siendo el candado de siempre contra un dedazo.
    if (monto > total_contrato && body.saldo_favor !== true) return j(400, headers, { error: `El abono ($${monto}) es mayor que el total del contrato ($${total_contrato}). Si el cliente sí pagó de más, confírmalo para dejar $${monto - total_contrato} como saldo a favor; si no, revisa el comprobante.` });
    const notaStaff = String(body.nota || '').trim().slice(0, 500);

    // 3 · La zona, por la PUERTA. El staff puede corregirla al aprobar.
    let zonaFinal = null;
    // [REQ-CORRIGE-1] Corregida: la zona ya salió de `_opciones` (la ortografía
    // de la ficha, con cupo medido) — no hay nada que canonizar.
    if (corr) zonaFinal = corr.despues.zona;
    else if (req.paquete !== 'ride') {
      const capturada = String(body.zona != null && String(body.zona).trim() !== '' ? body.zona : (req.zona || '')).trim();
      if (!capturada) return j(400, headers, { error: 'Falta la zona del boleto' });
      let p;
      try { p = await puertaZona(req.evento_id, capturada); } catch (e) { p = { estado: 'sin-catalogo', zona: capturada }; }
      if (p.estado === 'desconocida') {
        return j(409, headers, { error: `La zona «${capturada}» no existe en la ficha de ${req.evento_id}. Las de la ficha: ${(p.canonicas || []).join(' · ') || '(no se pudieron leer)'}` });
      }
      if (p.estado === 'sin-evento') return j(409, headers, { error: `El evento ${req.evento_id} ya no está en el catálogo` });
      // 'sin-catalogo' pasa tal cual Y SE CONFIESA en la nota (regla DISPO-NORM-1).
      zonaFinal = p.zona;
      var zonaConfesion = (p.estado === 'canonizada') ? ` · zona escrita «${p.capturada}», guardada como la ficha la escribe` :
                          (p.estado === 'sin-catalogo') ? ' · ⚠️ catálogo ilegible al aprobar: la zona pasó sin validar' : '';
    }

    // 3b · [DESGLOSE-1] El desglose se valida ANTES de reclamar: un 400 después
    // del reclamo dejaría la requisición «aprobada» sin viajeros.
    let desglosePre = null;
    {
      const nPre = (Array.isArray(req.acompanantes) && req.acompanantes.length === Math.max(0, (req.num_personas || 1) - 1) && req.acompanantes.length)
        ? req.acompanantes.length + 1 : 1;
      if (nPre > 1 && body.desglose != null) {
        const d = Array.isArray(body.desglose) ? body.desglose.map((x) => Math.round(Number(x))) : null;
        if (!d || d.length !== nPre || d.some((x) => !Number.isFinite(x) || x < 0)) {
          return j(400, headers, { error: `El desglose tiene que traer ${nPre} montos (uno por persona), en pesos y sin negativos` });
        }
        const suma = d.reduce((a, b) => a + b, 0);
        if (suma !== monto) return j(400, headers, { error: `El desglose suma $${suma} y el abono verificado es $${monto}: tienen que ser iguales` });
        desglosePre = d;
      }
    }

    // 4 · RECLAMAR la requisición (cierra la carrera del doble clic).
    const rClaim = await fetch(`${base}?id=eq.${id}&estado=eq.pendiente`, {
      method: 'PATCH',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(Object.assign({ estado: 'aprobada', revisada_por: quien, revisada_at: new Date().toISOString(), nota_staff: notaStaff || null },
        corr ? { correccion: { antes: corr.antes, despues: corr.despues, motivo: corr.motivo, por: corr.por, at: corr.at } } : {})),
    });
    if (!rClaim.ok) return j(502, headers, { error: 'No se pudo reclamar la requisición', detail: (await rClaim.text()).slice(0, 300) });
    const claimed = await rClaim.json();
    if (!claimed.length) return j(409, headers, { error: 'Alguien más la revisó primero — refresca la bandeja' });

    const hoyMX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
    // [VJ-HAB-1] El tipo de habitación elegido al reservar pasa a COLUMNA
    // (`hotel_tipo`), no solo a la nota: Milk/Bulma lo ven y editan en Capsule
    // y el rooming se arma de ahí. Se NORMALIZA a los 4 tipos del rooming KH
    // («Compartida (4 personas)» → Compartida — medido: era el único crudo
    // extra en 59 filas reales); lo que no case queda null Y en la nota, que
    // sigue llevando el crudo completo — nada se pierde, solo se estructura.
    const hotelTipo = normHotelTipo(hotelEf);
    const notaViajero = [
      `Requisición ${req.folio} · ${req.forma_pago}${req.transporte ? ' · ' + req.transporte : ''}${hotelEf ? ' · hotel: ' + hotelEf : ''}`,
      `aprobada por ${quien} ${hoyMX}${zonaConfesion || ''}`,
      corr ? `🔁 CORREGIDA al aprobar: pidió ${corr.antes.evento_id} ${corr.antes.paquete}${corr.antes.zona ? ' ' + corr.antes.zona : ''}${corr.antes.hotel ? ' · ' + corr.antes.hotel : ''} → queda ${corr.despues.evento_id} ${corr.despues.paquete}${corr.despues.zona ? ' ' + corr.despues.zona : ''}${corr.despues.hotel ? ' · ' + corr.despues.hotel : ''} (${corr.motivo})` : '',
      notaStaff ? `nota: ${notaStaff}` : '',
    ].filter(Boolean).join(' · ');

    // 5 · NACEN LOS VIAJEROS. INSERT directo (un solo POST con todas las filas:
    // PostgREST lo hace en una transacción — o nacen todos o ninguno).
    // [ACOMP-1] Con acompañantes: UN viajero por persona, boletos=1 cada uno,
    // y el contrato se REPARTE (palabra de Memo, 13-oct: «repartido — cada
    // viajero queda con su lugar pagado»). El residuo de la división va al
    // titular, para que la suma cuadre AL PESO con lo que se tecleó.
    // Sin acompañantes (requisición de antes de ACOMP-1, o de 1 persona): UN
    // viajero con N boletos, exactamente como siempre.
    const acomp = (Array.isArray(req.acompanantes) && req.acompanantes.length === Math.max(0, (req.num_personas || 1) - 1))
      ? req.acompanantes : null;
    // [ACOMP-1b] talla y emergencia viajan a cada viajero (el Portal las hereda en el puente).
    const personas = acomp && acomp.length ? [{ nombre: req.nombre, correo: req.correo, celular: req.celular,
        talla_playera: req.talla_playera || null, num_emergencia: req.num_emergencia || null, genero: req.genero || null, titular: true }]
      .concat(acomp.map((a) => ({ nombre: a.nombre, correo: a.correo || req.correo, celular: a.celular || null,
        talla_playera: a.talla_playera || null, num_emergencia: a.num_emergencia || null, genero: _generoOk(a.genero), titular: false }))) : null;
    const N = personas ? personas.length : 1;
    const repartir = (x) => { const base = Math.floor(x / N); return Array.from({ length: N }, (_, i) => base + (i === 0 ? x - base * N : 0)); };
    const contratos = repartir(total_contrato);
    // [DESGLOSE-1] Cuánto pagó cada quien: lo CONFIRMA quien aprueba (viene
    // prellenado con lo que declaró el cliente y lo puede corregir). Tiene que
    // sumar EXACTO el abono verificado. Sin desglose: repartido al peso.
    let montos = repartir(monto);
    const desgloseUsado = !!(personas && desglosePre);
    if (desgloseUsado) montos = desglosePre;
    // [GRUPO-VIAJE-1] Los que nacen de UNA requisición viajan juntos: misma
    // llave de grupo para que Bulma/Milk los vean como un solo grupo.
    const grupoViaje = personas ? require('crypto').randomUUID() : null;
    // [PORTAL-SOLO-1] Aprobar ES revisar: alguien vio el comprobante y tecleó
    // el monto. Las filas nacen SELLADAS para el Portal (sin doble trabajo).
    const sello = { portal_revisado_at: new Date().toISOString(), portal_revisado_por: 'requisición ' + req.folio + ' · aprobó ' + quien };
    const filasV = (personas
      ? personas.map((p, i) => ({
          grupo_viaje: grupoViaje,
          evento_id: evEf, nombre: p.nombre, celular: p.celular, correo: p.correo,
          talla_playera: p.talla_playera, num_emergencia: p.num_emergencia,
          genero: p.genero,   // [GENERO-2] lo que dijo al reservar (alimenta el rooming)
          tipo_paquete: paqEf, zona_boleto: zonaFinal, boletos: 1,
          hotel_tipo: hotelTipo,   // [VJ-HAB-1]
          total_contrato: contratos[i], abonado_previo: 0,
          notas: notaViajero + (p.titular ? ` · titular de ${N} lugares` : ` · acompañante de ${req.nombre}`),
        }))
      : [{
          evento_id: evEf, nombre: req.nombre, celular: req.celular, correo: req.correo,
          talla_playera: req.talla_playera || null, num_emergencia: req.num_emergencia || null,
          genero: req.genero || null,   // [GENERO-2]
          tipo_paquete: paqEf, zona_boleto: zonaFinal, boletos: req.num_personas,
          hotel_tipo: hotelTipo,   // [VJ-HAB-1]
          total_contrato, abonado_previo: 0, notas: notaViajero,
        }]).map((f) => Object.assign(f, sello));
    const rV = await fetch(`${SB_URL}/rest/v1/viajeros_evento`, {
      method: 'POST',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(filasV),
    });
    if (!rV.ok) {
      const det = (await rV.text().catch(() => '')).slice(0, 300);
      // Revertir el reclamo: la requisición vuelve a pendiente y se dice.
      await fetch(`${base}?id=eq.${id}&estado=eq.aprobada`, {
        method: 'PATCH',
        headers: Object.assign({}, sbH, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ estado: 'pendiente', revisada_por: null, revisada_at: null }),
      }).catch(() => {});
      return j(502, headers, { error: 'No se pudo crear el viajero — la requisición sigue PENDIENTE, inténtalo otra vez', detail: det });
    }
    const nacidos = await rV.json();
    const vNuevo = nacidos[0];

    // 6 · LOS ABONOS, con el comprobante heredado. capturado_por del JWT.
    // Repartidos igual que el contrato: cada viajero ve su lugar cubierto, y
    // la nota dice QUIÉN pagó (un abono de $300 a nombre del acompañante sin
    // esa nota se leería como dinero que él puso).
    // [REQ-LINK-1] La nota ya no miente: «comprobante verificado» SOLO cuando
    // HAY comprobante. Un monto tecleado sin comprobante (pago verificado por
    // otro canal) lo dice con su nombre — una nota que afirma una verificación
    // que no ocurrió es un candado de papel (la nota de Daniela lo decía).
    const filasA = nacidos.map((v, i) => ({
      viajero_id: v.id,
      monto: montos[i],
      nota: `Requisición ${req.folio} · ` + (req.comprobante_path
        ? 'comprobante verificado al aprobar'
        : (pagoMP
          ? `pagado en Mercado Pago #${pagoMP.id} (cobró $${pagoMP.bruto}${pagoMP.comision ? `, comisión al cliente $${pagoMP.comision}` : ''}) — aprobó ${quien}`
          : `sin comprobante adjunto (${req.forma_pago || 'pago'}) — monto confirmado por ${quien}`))
        + (N > 1 ? (desgloseUsado
          ? ` · su parte del pago del grupo según el desglose confirmado por ${quien} (${i + 1} de ${N}, total $${monto}, comprobante enviado por ${req.nombre})`
          : ` · pagado por ${req.nombre} (${i + 1} de ${N}, total $${monto})`) : ''),
      foto_path: req.comprobante_path || null,
      mp_pago_id: pagoMP ? pagoMP.id : null,   // [MP-LINK-1] su comprobante es el id del pago
      capturado_por: quien,
    })).filter((a) => a.monto > 0);
    // [REQ-LINK-1] Con monto 0 no hay nada que insertar: el POST se salta
    // EXPLÍCITO (no se le manda un arreglo vacío a PostgREST para depender de
    // cómo lo tome) y la respuesta le dice a la bandeja que no nació abono.
    const rA = filasA.length ? await fetch(`${SB_URL}/rest/v1/abonos_viajero`, {
      method: 'POST',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(filasA),
    }) : { ok: true, json: async () => [] };
    if (!rA.ok) {
      const det = (await rA.text().catch(() => '')).slice(0, 300);
      // Los viajeros YA nacieron — no se borran (datos de gente). Instrucción exacta:
      return j(207, headers, {
        ok: false, viajero_id: vNuevo.id, viajeros: nacidos.map((v) => v.id),
        error: `Los viajeros quedaron creados pero LOS ABONOS NO SE REGISTRARON. Captúralos a mano con ➕ Abono (${nacidos.map((v, i) => `«${v.nombre}» $${montos[i]}`).join(' · ')} — requisición ${req.folio}).`,
        detail: det,
      });
    }

    // 6b · [PLAN-FIJO-1] EL ROL DE PAGOS FIJO, desde el día del separo (el día
    // que el cliente mandó su requisición, en Reynosa). Palabra de Memo (4-nov):
    // «esas fechas de pago serán las que siempre verá en el portal». Se arma UNA
    // vez aquí; si el total cambia después, la base re-reparte solo lo que falta.
    // Jamás deshace la aprobación: si no se pudo, la respuesta lo DICE y se fija
    // a mano desde 🗓 Plan en Capsule.
    let planFijo = null;
    try {
      const PF = require('./_lib/plan-fijo');
      const lista = await fetchEventosRaw().catch(() => null);
      const evP = Array.isArray(lista) ? (lista.find((x) => x && x.id === String(evEf).split('#')[0]) || null) : null;
      const fSep = PF.diaReynosa(req.creado_en) || PF.diaReynosa(new Date());
      const res = [];
      for (let i = 0; i < nacidos.length; i++) {
        res.push(await PF.fijarEnBase({
          url: SB_URL, headers: sbH, viajero: nacidos[i], ev: evP, fecha_separo: fSep,
          separo_monto: N > 1 ? montos[i] : monto, por: quien,
        }));
      }
      const malos = res.filter((x) => !x.ok);
      planFijo = malos.length ? { ok: false, error: 'El rol de pagos no se pudo fijar (' + malos[0].error + ') — fíjalo desde 🗓 Plan en Capsule.' } : { ok: true, separo: fSep };
    } catch (e) { planFijo = { ok: false, error: 'El rol de pagos no se pudo fijar — fíjalo desde 🗓 Plan en Capsule.' }; }

    // 7 · Colgarle el viajero TITULAR a la requisición (informativo; si falla, se dice).
    let enlaceOk = true;
    try {
      const rE = await fetch(`${base}?id=eq.${id}`, {
        method: 'PATCH',
        headers: Object.assign({}, sbH, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ viajero_id: vNuevo.id }),
      });
      enlaceOk = rE.ok;
    } catch (_) { enlaceOk = false; }

    // 8 · [CONFIRMA-1] EL CORREO ÚNICO: «¡Tu lugar está confirmado!» con la
    // invitación al Portal adentro. Solo en los eventos de EVENTOS_CORREO
    // (la lib decide y devuelve null fuera de ellos). Nunca deshace la
    // aprobación: si falla, la respuesta lo DICE.
    const recibidoPorViajero = {};
    nacidos.forEach((v, i) => { recibidoPorViajero[v.id] = N > 1 ? montos[i] : monto; });
    const portal = await enviarCorreoPago({
      tipo: 'reserva', evento_id: evEf, viajeroIds: nacidos.map((v) => v.id), recibidoPorViajero,
      // [REQ-CORRIGE-1] El correo de SIEMPRE, con un bloque que dice qué pidió,
      // por qué no se pudo y dónde quedó. Sin corrección no viaja nada nuevo.
      cambio: corr ? { antes: corr.antes, despues: corr.despues, motivo: corr.motivo } : undefined,
      enviado_por: auth.user && auth.user.correo, KH_URL: SB_URL, KH_KEY: SB_KEY,
    });

    // 9 · [CONTRATO-CLIENTE-1] El contrato de cada viajero nacido, con su link
    // de firma por correo (uno por dirección). La lib se salta la preventa a
    // ciegas (su contrato nace al elegir paquete) y jamás lanza: nunca deshace
    // la aprobación — si falla, la respuesta lo DICE.
    const { emitirContratos } = require('./_lib/contrato-cliente');
    const contrato = await emitirContratos({
      viajeroIds: nacidos.map((v) => v.id), creado_por: auth.user && auth.user.correo,
      KH_URL: SB_URL, KH_KEY: SB_KEY,
    });

    return j(200, headers, {
      contrato,
      ok: true,
      viajero_id: vNuevo.id,
      viajeros: nacidos.map((v, i) => ({ id: v.id, nombre: v.nombre, correo: v.correo, contrato: contratos[i] != null && N > 1 ? contratos[i] : total_contrato, abono: N > 1 ? montos[i] : monto })),
      folio: req.folio,
      zona: zonaFinal,
      total_contrato,
      monto,
      correccion: corr ? { antes: corr.antes, despues: corr.despues, motivo: corr.motivo, avisos: corr.avisos } : undefined,
      // [REQ-LINK-1] La bandeja DICE cuando no nació abono — un silencio aquí
      // se leería como «el abono quedó», que es justo lo que este caso cura.
      sin_abono: filasA.length === 0
        ? 'Sin comprobante y sin monto: NO se registró ningún abono — el viajero nace debiendo todo. Captura el pago cuando llegue (➕ Abono o el comprobante que suba por su Portal).'
        : undefined,
      enlace_registrado: enlaceOk,
      plan_fijo: planFijo,
      portal,
    });
  }

  return j(400, headers, { error: 'Acción no implementada' });
};
