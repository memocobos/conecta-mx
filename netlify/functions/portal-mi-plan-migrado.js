// =============================================================================
// portal-mi-plan-migrado  (MIG-1d-i — lo que el invitado VE)
// =============================================================================
// El cliente migrado entra al Portal y pide SU plan. Su plan NO vive en el
// Portal: vive en `viajeros_evento` + `abonos_viajero` de KameHouse. Esta
// función lo SIRVE, leyendo — no lo copia.
//
// POR QUÉ NO SE COPIA: `admin-saldos` suma los `pagos` en estado 'pagado' como
// entradas de la caja del Portal. Insertar el dinero migrado ahí lo contaría dos
// veces (la cuenta del evento ya lo tiene) y le pondría un saldo falso a un
// libro que arranca en $0 a propósito. Los dos mundos del dinero no se cruzan.
//
// Y la cuenta la hace `saldoMigrado` de `_lib/cuenta-evento` — LA MISMA función
// que usa el Palacio. Una segunda fórmula aquí sería la número doce esperando a
// divergir.
//
// POST (Authorization: Bearer <jwt del cliente>) → { ok, tours:[…] }
//
// 🔒 CANDADO, el mismo de `portal-reclamar-cuenta` y por la misma razón: se
// resuelve SOLO por el correo VERIFICADO del propio JWT. Nunca por nombre, ni
// por teléfono, ni por un id que mande el navegador. El plan de pagos de una
// persona no se le enseña a nadie más.
//
// Env: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY (validar el JWT),
//      SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE (leer el plan).
// =============================================================================

const { saldoMigrado } = require('./_lib/cuenta-evento');

// ═══ [PLAN-PAGOS-1d] ¿A QUÉ CUENTA MANDA ESTE VIAJERO? ═══════════════════════
// La regla de la casa: **CHEAP → Banamex · PLUS/STAY/RIDE → BBVA** (el banco del
// evento, que por default es BBVA).
//
// 🔴 CON UNA EXCEPCIÓN QUE YA COSTÓ CARO UNA VEZ: **la PREVENTA A CIEGAS cobra en
// BBVA** aunque por dentro viaje por el camino CHEAP (PN27-BANCO-1, palabra de
// Memo del 13-oct). Es la ley de «un paquete con otro nombre HEREDA todas las
// reglas del camino que usa por dentro»: al disfrazar uno hay que barrer TODAS
// las del camino — banco incluido. Esta pantalla la repitió sin la excepción y
// la habría mandado a Banamex.
//
// 🔒 **NO se re-implementa la pregunta: se copia la forma del DUEÑO**,
// `khEsPreventaCiegas` de kamehouse.js (que es quien contesta «¿este VIAJERO es
// de preventa?», por su ZONA y no por la ficha — una vez que el evento sale a la
// venta deja de ser cheapOnly y los de la preventa siguen siéndolo). kamehouse.js
// es navegador y no se puede `require`, así que la lista va de ESPEJO CON NOMBRE
// y el careo las carea: el día que una se mueva sin la otra, suena.
const PREVENTA_EVENTOS_ESPEJO = ['palnorte', 'donomar'];   // espejo de KH_PREVENTA_EVENTOS
function esPreventaCiegasViajero(v) {
  if (!v || String(v.tipo_paquete || '').toLowerCase() !== 'cheap') return false;
  if (String(v.zona_boleto || '').trim().toLowerCase() === 'preventa a ciegas') return true;
  return PREVENTA_EVENTOS_ESPEJO.includes(String(v.evento_id || '').split('#')[0]);
}
// 'bbva' | 'banamex' — el ANCLA de pagos.html, decidida en el servidor para que
// la pantalla no vuelva a cargar con una regla de dinero.
function bancoDeViajero(v) {
  if (esPreventaCiegasViajero(v)) return 'bbva';
  return String(v && v.tipo_paquete || '').trim().toLowerCase() === 'cheap' ? 'banamex' : 'bbva';
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const PT_URL = process.env.PORTAL_SUPABASE_URL;
  const PT_ANON = process.env.PORTAL_SUPABASE_ANON_KEY;
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!PT_URL || !PT_ANON || !KH_URL || !KH_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Falta Authorization Bearer' }) };

  let user;
  try {
    const r = await fetch(`${PT_URL}/auth/v1/user`, { headers: { apikey: PT_ANON, Authorization: 'Bearer ' + jwt } });
    if (!r.ok) return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT inválido o expirado' }) };
    user = await r.json();
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo validar el JWT', detail: e.message }) };
  }
  if (!user || !user.id) return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT sin usuario' }) };

  const correo = (typeof user.email === 'string') ? user.email.trim().toLowerCase() : '';
  // Correo sin verificar → no se sirve NADA. No es un error: es que no se puede
  // saber que ese correo es suyo, y con eso se enseñaría el plan de otro.
  if (!correo || !user.email_confirmed_at) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, tours: [], motivo: 'correo sin verificar' }) };
  }

  const hKH = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  try {
    // ═══ [PLAN-CASE-1] EL LECTOR DESAMBIGUA, NO LOS DATOS ═══════════════════
    // 🔴 EL HOYO QUE ESTO CIERRA: `correo=eq.X` es SENSIBLE A MAYÚSCULAS, y el
    // correo del JWT viene en minúsculas. Una fila guardada como
    // «Victorgael2929@gmail.com» era INVISIBLE para su propio dueño: el Portal le
    // enseñaba un plan VACÍO o INCOMPLETO. Medido contra la base viva el 1-oct:
    // **285 filas · 244 personas** con el correo que no es su propia minúscula —
    // ~1 de cada 5 de las que tienen correo. No era un caso raro.
    //
    // 🔒 CERO UPDATEs A `viajeros_evento`. 285 filas de datos de gente no se tocan
    // para arreglar un LECTOR, y además el crudo del correo es justo el dato que
    // delata el problema (la ley de `boletos_crudo`: una normalización que borra el
    // crudo deja ciego al siguiente lector). Quien desambigua es quien lee — la
    // forma de ROL-HIST-PADRE.
    //
    // ── POR QUÉ `ilike` Y NO «traer y comparar en el handler» ────────────────
    // Medido contra la base viva, no supuesto:
    //   · `correo` NO TIENE ÍNDICE (los únicos son `evento_id` y la pk), así que el
    //     `eq` de hoy YA es un Seq Scan. El plan de los dos es IDÉNTICO:
    //     cost 0.00..187.85, buffers hit=156 en los dos casos. No se pierde ningún
    //     índice porque no había ninguno que perder.
    //   · 2,550 filas / 1,512 kB. El `~~*` cuesta ~1.4 ms más en total.
    //   · La alternativa —traer por otro filtro y comparar aquí— no tiene otro
    //     filtro que usar: el cliente solo sabe su correo. Sería traerse las 2,550
    //     filas a la función en cada visita: el MISMO barrido en la base, más
    //     cientos de KB por la red. Estrictamente peor.
    //
    // ⚠️⚠️ Y AQUÍ EL CANDADO QUE NO SE NEGOCIA: en ILIKE, `_` casa CUALQUIER
    // carácter y `%` cualquier cadena. **94 filas / 73 personas tienen `_` en su
    // correo** (medido), así que esto NO es teórico: `maria_lopez@gmail.com` como
    // patrón casaría `mariaXlopez@gmail.com`. Hoy, por suerte, ninguno de los 73
    // pesca filas ajenas — pero la corrección no puede depender de que los datos
    // sigan con suerte.
    //
    // 🔒 ASÍ QUE EL `ilike` SOLO ESTRECHA, Y LA AUTORIDAD ES ESTE HANDLER. El
    // patrón solo puede SOBRE-pescar (un comodín casa más, nunca menos), así que
    // el filtro de abajo es completo: lo que sobra se tira y nada que debía estar
    // se pierde. Esa asimetría es la razón de que este diseño sea seguro — si el
    // `ilike` pudiera sub-pescar, filtrar después NO bastaría.
    //
    // Y no se escapan los comodines a propósito: un escape mal interpretado por
    // PostgREST haría SUB-pescar, que es el defecto que vinimos a arreglar. Se
    // prefiere sobre-pescar y filtrar aquí, donde la regla se puede leer.
    const vR = await fetch(`${KH_URL}/rest/v1/viajeros_evento?correo=ilike.${encodeURIComponent(correo)}`
      + '&select=id,evento_id,nombre,correo,celular,talla_playera,genero,num_emergencia,emergencia_nombre,emergencia_parentesco,tipo_paquete,zona_boleto,total_contrato,abonado_previo,boletos,portal_revisado_at,usuario_id,tipo_viajero,fecha_separo,plan_pagos,vuelo,grupo_viaje&limit=200', { headers: hKH });
    if (!vR.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No pude leer tus tours', detail: await vR.text() }) };
    const crudos = await vR.json();
    // 🔒 LA IGUALDAD EXACTA, EN MINÚSCULAS Y DE LOS DOS LADOS. Es el filtro que
    // vuelve inofensivo cualquier comodín del patrón.
    const suyas = (Array.isArray(crudos) ? crudos : [])
      .filter((v) => String(v && v.correo != null ? v.correo : '').trim().toLowerCase() === correo)
      // [PRV-EQUIPO-1] Los tours que trabaja (coordinador/staff) no son viajes
      // suyos de cliente: viven en KameHouse, no en el Portal.
      .filter((v) => !require('./_lib/portal-revision').esDelEquipo(v));

    // ═══ [PORTAL-SOLO-1] SOLO SE ENSEÑA LO QUE ALGUIEN REVISÓ ═══════════════
    // Palabra de Memo: «antes que se registrara bulma milk o yo podamos revisar
    // su caso … que tal que tiene menos pagos o pagos de más… eso haría al
    // cliente desconfiar». Una fila SIN sello no viaja: ni su dinero ni su
    // paquete. Lo que viaja es que EXISTE algo en revisión (el evento), para que
    // el Portal diga «estamos revisando tu viaje» en vez de «no tienes nada».
    // Y su llegada ABRE la revisión en la bandeja de KameHouse (una por correo).
    const PR = require('./_lib/portal-revision');
    const viajeros = suyas.filter(PR.revisada);
    const sinSello = suyas.filter((v) => !PR.revisada(v));
    let revisionError = null;
    if (sinSello.length) {
      try { await PR.pedirRevision({ correo, filas: suyas, KH_URL, KH_KEY }); }
      catch (e) { revisionError = e.message; }
    }
    // Las solicitudes del cliente (revisar / ligar), pendientes o rechazadas
    // recientes, para que el Portal las pinte con su motivo.
    let solicitudes = [];
    try {
      const rs = await fetch(`${KH_URL}/rest/v1/portal_revisiones?correo=eq.${encodeURIComponent(correo)}&tipo=in.(revisar,ligar)&estado=in.(pendiente,rechazada)&creado_en=gte.${new Date(Date.now() - 60 * 864e5).toISOString()}&select=id,tipo,estado,evento_id,nombre_dado,motivo,creado_en,atendida_at&order=creado_en.desc&limit=20`, { headers: hKH });
      if (rs.ok) solicitudes = await rs.json();
    } catch (_) { /* no tumba el plan */ }
    // [PRV-FILA-1] Un viaje marcado «no procede» (por viaje) ya NO está «en
    // revisión»: se dice con su motivo (arriba, en solicitudes), no se promete.
    let noProcede = new Set();
    if (sinSello.length) {
      try {
        const rn = await fetch(`${KH_URL}/rest/v1/portal_revisiones?correo=eq.${encodeURIComponent(correo)}&tipo=eq.revisar&estado=eq.rechazada&select=viajero_ids&limit=300`, { headers: hKH });
        if (rn.ok) (await rn.json()).forEach((x) => (x.viajero_ids || []).forEach((id) => noProcede.add(String(id))));
      } catch (_) { /* sin la lista, se queda «en revisión»: el lado prudente */ }
    }
    const en_revision = [...new Set(sinSello.filter((v) => !noProcede.has(String(v.id))).map((v) => v.evento_id))];

    if (!viajeros.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, tours: [], en_revision, solicitudes, revision_error: revisionError }) };
    }

    // ═══ [PORTAL-PAGO-2] QUIÉN VIAJA CON QUIÉN (para el desglose) ═══════════
    // Palabra de Memo (9-nov): «si alguien paga por todos, el portal lo deja
    // desglosar». Las filas del MISMO `grupo_viaje` (ACOMP-1/2) viajan con
    // nombre y cuánto le falta a cada quien, para que el titular reparta su
    // comprobante. 🔒 Solo nombre + dinero del grupo: ni correo ni celular de
    // los otros. Sin grupo, lista vacía (y el Portal no ofrece desglose).
    const grupos = [...new Set(viajeros.map((v) => v.grupo_viaje).filter(Boolean))];
    let companeros = [];
    if (grupos.length) {
      try {
        const gR = await fetch(`${KH_URL}/rest/v1/viajeros_evento?grupo_viaje=in.(${encodeURIComponent(grupos.map((g) => '"' + g + '"').join(','))})`
          + '&select=id,evento_id,nombre,grupo_viaje,total_contrato,abonado_previo,plan_pagos,tipo_viajero,usuario_id,boletos,zona_boleto&limit=300', { headers: hKH });
        if (gR.ok) companeros = (await gR.json()).filter((c) => !(Number(c.boletos) === 0 && c.zona_boleto == null));
      } catch (_) { companeros = []; }
    }
    const propios = new Set(viajeros.map((v) => v.id));
    const extraCompaneros = companeros.filter((c) => !propios.has(c.id));

    // Los abonos de ESOS viajeros (y de sus compañeros de grupo, para su saldo).
    const ids = viajeros.concat(extraCompaneros).map((v) => '"' + v.id + '"').join(',');
    // [PORTAL-TICKET-1] `id` y `foto_path` viajan hasta aquí para derivar
    // `tiene_foto`; el PATH jamás sale al navegador (la URL se firma al clic
    // en portal-viajero `abono_foto`, con los filtros de siempre).
    const aR = await fetch(`${KH_URL}/rest/v1/abonos_viajero?viajero_id=in.(${encodeURIComponent(ids)})`
      + '&select=id,viajero_id,monto,fecha,foto_path&limit=5000', { headers: hKH });
    if (!aR.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No pude leer tus abonos', detail: await aR.text() }) };
    const abonos = await aR.json();
    const porViajero = {};
    (Array.isArray(abonos) ? abonos : []).forEach((a) => { (porViajero[a.viajero_id] = porViajero[a.viajero_id] || []).push(a); });

    // [GRUPO-WA-1] El link del grupo de WhatsApp de cada evento. Solo viaja aquí,
    // al dueño VERIFICADO de la fila (nunca al index público). Sin link → null.
    const { gruposDe } = require('./_lib/grupo-whatsapp');
    const linksWA = await gruposDe(viajeros.map((v) => v.evento_id), { KH_URL, KH_KEY });

    // [PORTAL-PAGO-2] Lo que el cliente ya mandó y el equipo no ha capturado:
    // comprobantes en revisión, pagos de MP ya acreditados (en revisión) y links
    // de MP sin pagar (se le vuelve a ofrecer el mismo). El Portal lo DICE para
    // que nadie pague dos veces ni suba el mismo comprobante otra vez.
    const idsPropios = viajeros.map((v) => '"' + v.id + '"').join(',');
    const pagosPend = {};
    try {
      const cR = await fetch(`${KH_URL}/rest/v1/cambios_viajero?viajero_id=in.(${encodeURIComponent(idsPropios)})&tipo=eq.pago&estado=eq.pendiente`
        + '&select=viajero_id,foto_path,mp_preference_id,mp_init_point,mp_neto,mp_monto_cobrar,mp_pago_id,mp_monto,creado_en,desglose&order=creado_en.asc&limit=200', { headers: hKH });
      if (cR.ok) (await cR.json()).forEach((c) => {
        const tipo = c.mp_pago_id ? 'mp_pagado' : c.foto_path ? 'comprobante' : c.mp_preference_id ? 'mp_link' : null;
        if (!tipo) return;
        (pagosPend[c.viajero_id] = pagosPend[c.viajero_id] || []).push({
          tipo,
          monto: tipo === 'mp_pagado' ? Number(c.mp_neto) || null : tipo === 'mp_link' ? Number(c.mp_neto) || null : null,
          cobra: tipo === 'mp_link' ? Number(c.mp_monto_cobrar) || null : null,
          url: tipo === 'mp_link' ? c.mp_init_point : null,
          fecha: c.creado_en || null,
          reparto: Array.isArray(c.desglose) && c.desglose.length > 1,
        });
      });
    } catch (_) { /* sin la lista el Portal no promete nada */ }
    let mpDisponible = false;
    try { mpDisponible = !!require('./_lib/mp-link').disponible().ok; } catch (_) { mpDisponible = false; }

    // ═══ [PLAN-PAGOS-1b] EL CALENDARIO DE PAGOS ════════════════════════════
    // Palabra de Memo (28-oct): «el cliente debe de poder ver su rol de pagos
    // basado en la fórmula que siempre hemos tenido… y ver cuánto falta».
    //
    // 🔒 La fórmula NO se re-escribe aquí: se le pide a `_lib/plan-pagos`, el
    // dueño. Una cuarta copia de «cuándo te toca pagar» sería la cuarta lista
    // que todavía no diverge — y ésta la leería el cliente.
    //
    // 🔒 Y EL CALENDARIO VA HACIA ADELANTE, por lo que dice el dato y no por
    // comodidad: el `creado_en` de los migrados es la fecha de la MIGRACIÓN, su
    // primer abono es la fecha de la primera COSECHA, y 1,049 de 1,632 filas con
    // correo no tienen un solo abono con fecha. El pasado de su plan no existe
    // en ninguna columna; dibujarlo sería inventar fechas sobre dinero. Lo que
    // sí es verdad —cuánto lleva abonado, y sus abonos cuando los hay con su
    // fecha— ya viaja abajo.
    //
    // ⚠️ SIN CATÁLOGO NO SE INVENTA NINGUNO. `fetchEventosRaw` es best-effort y
    // devuelve null si el index no se pudo leer: entonces el plan viaja en null
    // CON su motivo, y el Portal dice que no se pudo armar. Un calendario vacío
    // se leería como «ya no tienes pagos», que es justo lo contrario.
    const PP = require('./_lib/plan-pagos');
    let evRaw = null, planError = null;
    try { evRaw = await require('./_lib/catalogo-index').fetchEventosRaw(); }
    catch (e) { planError = e.message; }
    if (!evRaw) planError = planError || 'no se pudo leer el catálogo';
    const evPorSlug = {};
    (Array.isArray(evRaw) ? evRaw : []).forEach((e) => { if (e && e.id) evPorSlug[String(e.id)] = e; });
    const ahora = new Date();
    // [PORTAL-RECUERDO-1] «Hoy» en Reynosa, como cadena, para saber si un viaje
    // YA PASÓ. Se pregunta aparte del plan a propósito: el plan contesta
    // 'sin_total' antes de mirar la fecha, y un viaje pasado sin total (los
    // migrados viejos) también es pasado.
    const _h = PP.hoyReynosa(ahora);
    const hoyDs = _h.getFullYear() + '-' + String(_h.getMonth() + 1).padStart(2, '0') + '-' + String(_h.getDate()).padStart(2, '0');

    const tours = viajeros.map((v) => {
      const s = saldoMigrado(v, porViajero[v.id]);   // LA MISMA función del Palacio
      const evCat = evPorSlug[String(v.evento_id).split('#')[0]] || null;
      const dsEv = evCat ? PP.dsDeEvento(evCat, v.evento_id) : null;
      // [PLAN-FIJO-1] El rol es FIJO desde la fecha de separo (palabra de
      // Memo, 4-nov): se arma UNA vez y aquí solo se LEE — lo pagado se aplica
      // a las cuotas en orden y lo no pagado sale vencido. ⚰️ El plan ya NO se
      // recalcula desde «hoy» con planDelViaje: eso le cambiaba la cuota al
      // cliente de un día para otro (caso Sahid, $975 → $1,300). Sin plan fijo
      // (los migrados del Excel) no se inventa calendario: Bulma/Milk capturan
      // su fecha de separo en Capsule.
      const PF = require('./_lib/plan-fijo');
      const plan = v.plan_pagos
        ? PF.estadoPlan(v.plan_pagos, { total: s ? s.total : null, abonado: s ? s.abonado : 0, ahora })
        : (!s || s.total == null || s.total <= 0) ? { estado: 'sin_total', resta: null, cuotas: [] }
        : (s.resta <= 0) ? { estado: 'liquidado', resta: 0, cuotas: [] }
        : { estado: 'sin_plan_fijo', resta: s.resta, cuotas: [] };
      return {
        // [PORTAL-EDIT-1] el id y los datos EDITABLES viajan para que el cliente
        // los complete/corrija (portal-viajero vuelve a comprobar que son suyos).
        viajero_id: v.id,
        nombre: v.nombre || null,
        celular: v.celular || null,
        talla_playera: v.talla_playera || null,
        genero: (v.genero === 'H' || v.genero === 'M') ? v.genero : null,   // [GENERO-2]
        num_emergencia: v.num_emergencia || null,
        emergencia_nombre: v.emergencia_nombre || null,
        emergencia_parentesco: v.emergencia_parentesco || null,
        evento_id: v.evento_id,
        // [ACOMP-2] cuántos lugares trae la fila: con 2+ el Portal le ofrece
        // al titular darle su ficha a cada acompañante.
        boletos: Number(v.boletos) || 1,
        grupo_whatsapp: linksWA[v.evento_id] || null,
        // [VUELO-1] Los datos de su vuelo (aerolínea, horarios, clave). 🔒 El
        // COSTO no viaja: palabra de Memo, «un solo total» — ya va dentro del
        // total de arriba y el cliente no ve el desglose.
        vuelo: (v.vuelo && typeof v.vuelo === 'object') ? {
          aerolinea: v.vuelo.aerolinea || null, salida: v.vuelo.salida || null,
          regreso: v.vuelo.regreso || null, clave: v.vuelo.clave || null,
        } : null,
        paquete: v.tipo_paquete || null,
        zona: v.zona_boleto || null,
        // `null` cuando la fila no trae total: «no sé» dicho con su nombre, en
        // vez de un 0 que se leería como «no debes nada».
        total: s ? s.total : null,
        abonado: s ? s.abonado : null,
        resta: s ? s.resta : null,
        // 🔒 Lo abonado ANTES de que existiera un abono con fecha. Viaja aparte y
        // no se deriva en el navegador: sin este número, el historial de abonos
        // contradice al «Abonado» de arriba (de 1,632 filas con correo, 1,049 no
        // tienen un solo abono con fecha — su dinero entero vive aquí) y el
        // cliente ve $5,200 abonados con $1,200 en la lista. Un hueco callado.
        abonado_previo: Number(v.abonado_previo) || 0,
        sin_plan: !s,
        // [PLAN-PAGOS-1b] El calendario de lo que le FALTA. `null` = no se pudo
        // armar (catálogo ilegible), que no es lo mismo que «sin cuotas».
        plan,
        // [PLAN-PAGOS-1d] A qué cuenta manda ESTE viajero, con la excepción de
        // la preventa ya aplicada. La pantalla pinta, no decide.
        banco: bancoDeViajero(v),
        // [PORTAL-PAGO-2] Con quién viaja (mismo grupo, mismo evento), con lo que
        // le falta a cada uno y su próximo pago — para el desglose del
        // comprobante. La propia fila NO va aquí (el Portal la agrega arriba).
        grupo: v.grupo_viaje ? companeros
          .filter((c) => c.grupo_viaje === v.grupo_viaje && c.evento_id === v.evento_id && c.id !== v.id)
          .map((c) => {
            const sc = saldoMigrado(c, porViajero[c.id]);
            let prox = null;
            if (c.plan_pagos && sc && sc.resta > 0) {
              const pc = PF.estadoPlan(c.plan_pagos, { total: sc.total, abonado: sc.abonado, ahora });
              // [COB-WA-1] el mismo dueño que el `sugerido` del titular
              const tc = PF.tocaHoy(pc, sc.resta);
              if (tc) prox = tc.monto;
            }
            return { viajero_id: c.id, nombre: c.nombre || null, resta: sc ? Math.max(0, Math.round(sc.resta)) : null, proximo: prox };
          }) : [],
        // [PORTAL-PAGO-2] Lo que ya está en camino (comprobante en revisión ·
        // pago en MP acreditado en revisión · link de MP sin pagar).
        pagos_pendientes: pagosPend[v.id] || [],
        // [PORTAL-PAGO-2] ¿Se puede ofrecer «Pagar en línea» ahora mismo?
        mp_disponible: mpDisponible,
        // Y lo que le toca pagar HOY según su rol fijo (atrasado + próxima),
        // topado a lo que resta. null sin plan fijo: el Portal ofrece la resta.
        // [COB-WA-1] UN dueño para «qué le toca hoy»: tocaHoy de plan-fijo.
        sugerido: (() => { const t = PF.tocaHoy(plan, s.resta); return t ? t.monto : null; })(),
        // La fecha del evento, derivada del catálogo para ESA fecha del `slug#N`.
        evento_ds: dsEv,
        // [PORTAL-RECUERDO-1] Viaje ya realizado: el Portal lo pinta como
        // RECUERDO (sin dinero, plan, contrato ni botones). Sin fecha → false:
        // no se esconde el dinero de nadie por una fecha que no se pudo leer.
        pasado: !!(dsEv && /^\d{4}-\d{2}-\d{2}$/.test(dsEv) && dsEv < hoyDs),
        // 🔒 Los abonos van ORDENADOS por fecha y con su fecha tal cual está. Los
        // de la cosecha traen la fecha del careo, no la del pago: el Portal lo
        // dice con palabras en vez de presentarlas como fecha de pago.
        abonos: (porViajero[v.id] || [])
          // [PORTAL-TICKET-1] tiene_foto le dice al cliente qué pagos traen su
          // comprobante digital; el id es para pedir la URL firmada al clic.
          .map((a) => ({ id: a.id, monto: Number(a.monto) || 0, fecha: a.fecha || null, tiene_foto: !!a.foto_path }))
          .sort((x, y) => String(x.fecha || '').localeCompare(String(y.fecha || ''))),
      };
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, tours, en_revision, solicitudes, revision_error: revisionError, plan_error: planError, fuente: 'kamehouse/viajeros_evento' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error leyendo tu plan', detail: e.message }) };
  }
};

// Expuestos SOLO para el careo (mide:plan-pagos-1): la decisión de banco y su
// espejo, para poder carearlos contra kamehouse.js sin re-implementarlos.
module.exports._bancoDeViajero = bancoDeViajero;
module.exports._esPreventaCiegasViajero = esPreventaCiegasViajero;
module.exports._PREVENTA_EVENTOS_ESPEJO = PREVENTA_EVENTOS_ESPEJO;
