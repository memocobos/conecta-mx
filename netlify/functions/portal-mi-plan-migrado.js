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
const PREVENTA_EVENTOS_ESPEJO = ['palnorte'];   // espejo de KH_PREVENTA_EVENTOS
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
      + '&select=id,evento_id,nombre,correo,celular,talla_playera,num_emergencia,emergencia_nombre,emergencia_parentesco,tipo_paquete,zona_boleto,total_contrato,abonado_previo,boletos,portal_revisado_at,usuario_id,tipo_viajero&limit=200', { headers: hKH });
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

    // Los abonos de ESOS viajeros. Se filtra en el servidor por sus ids.
    const ids = viajeros.map((v) => '"' + v.id + '"').join(',');
    const aR = await fetch(`${KH_URL}/rest/v1/abonos_viajero?viajero_id=in.(${encodeURIComponent(ids)})`
      + '&select=viajero_id,monto,fecha&limit=5000', { headers: hKH });
    if (!aR.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No pude leer tus abonos', detail: await aR.text() }) };
    const abonos = await aR.json();
    const porViajero = {};
    (Array.isArray(abonos) ? abonos : []).forEach((a) => { (porViajero[a.viajero_id] = porViajero[a.viajero_id] || []).push(a); });

    // [GRUPO-WA-1] El link del grupo de WhatsApp de cada evento. Solo viaja aquí,
    // al dueño VERIFICADO de la fila (nunca al index público). Sin link → null.
    const { gruposDe } = require('./_lib/grupo-whatsapp');
    const linksWA = await gruposDe(viajeros.map((v) => v.evento_id), { KH_URL, KH_KEY });

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

    const tours = viajeros.map((v) => {
      const s = saldoMigrado(v, porViajero[v.id]);   // LA MISMA función del Palacio
      const evCat = evPorSlug[String(v.evento_id).split('#')[0]] || null;
      const dsEv = evCat ? PP.dsDeEvento(evCat, v.evento_id) : null;
      const plan = evRaw ? PP.planDelViaje({
        total: s ? s.total : null,
        abonado: s ? s.abonado : 0,
        ds: dsEv,
        paquete: v.tipo_paquete,
        diasAntes: evCat ? evCat.diasAntes : null,
        ahora,
      }) : null;
      return {
        // [PORTAL-EDIT-1] el id y los datos EDITABLES viajan para que el cliente
        // los complete/corrija (portal-viajero vuelve a comprobar que son suyos).
        viajero_id: v.id,
        nombre: v.nombre || null,
        celular: v.celular || null,
        talla_playera: v.talla_playera || null,
        num_emergencia: v.num_emergencia || null,
        emergencia_nombre: v.emergencia_nombre || null,
        emergencia_parentesco: v.emergencia_parentesco || null,
        evento_id: v.evento_id,
        // [ACOMP-2] cuántos lugares trae la fila: con 2+ el Portal le ofrece
        // al titular darle su ficha a cada acompañante.
        boletos: Number(v.boletos) || 1,
        grupo_whatsapp: linksWA[v.evento_id] || null,
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
        // La fecha del evento, derivada del catálogo para ESA fecha del `slug#N`.
        evento_ds: dsEv,
        // 🔒 Los abonos van ORDENADOS por fecha y con su fecha tal cual está. Los
        // de la cosecha traen la fecha del careo, no la del pago: el Portal lo
        // dice con palabras en vez de presentarlas como fecha de pago.
        abonos: (porViajero[v.id] || [])
          .map((a) => ({ monto: Number(a.monto) || 0, fecha: a.fecha || null }))
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
