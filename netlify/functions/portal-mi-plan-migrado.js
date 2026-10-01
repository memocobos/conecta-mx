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
      + '&select=id,evento_id,nombre,correo,tipo_paquete,zona_boleto,total_contrato,abonado_previo&limit=200', { headers: hKH });
    if (!vR.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No pude leer tus tours', detail: await vR.text() }) };
    const crudos = await vR.json();
    // 🔒 LA IGUALDAD EXACTA, EN MINÚSCULAS Y DE LOS DOS LADOS. Es el filtro que
    // vuelve inofensivo cualquier comodín del patrón.
    const viajeros = (Array.isArray(crudos) ? crudos : [])
      .filter((v) => String(v && v.correo != null ? v.correo : '').trim().toLowerCase() === correo);
    if (!viajeros.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, tours: [] }) };
    }

    // Los abonos de ESOS viajeros. Se filtra en el servidor por sus ids.
    const ids = viajeros.map((v) => '"' + v.id + '"').join(',');
    const aR = await fetch(`${KH_URL}/rest/v1/abonos_viajero?viajero_id=in.(${encodeURIComponent(ids)})`
      + '&select=viajero_id,monto,fecha&limit=5000', { headers: hKH });
    if (!aR.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No pude leer tus abonos', detail: await aR.text() }) };
    const abonos = await aR.json();
    const porViajero = {};
    (Array.isArray(abonos) ? abonos : []).forEach((a) => { (porViajero[a.viajero_id] = porViajero[a.viajero_id] || []).push(a); });

    const tours = viajeros.map((v) => {
      const s = saldoMigrado(v, porViajero[v.id]);   // LA MISMA función del Palacio
      return {
        evento_id: v.evento_id,
        paquete: v.tipo_paquete || null,
        zona: v.zona_boleto || null,
        // `null` cuando la fila no trae total: «no sé» dicho con su nombre, en
        // vez de un 0 que se leería como «no debes nada».
        total: s ? s.total : null,
        abonado: s ? s.abonado : null,
        resta: s ? s.resta : null,
        sin_plan: !s,
        abonos: (porViajero[v.id] || []).map((a) => ({ monto: Number(a.monto) || 0, fecha: a.fecha || null })),
      };
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, tours, fuente: 'kamehouse/viajeros_evento' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error leyendo tu plan', detail: e.message }) };
  }
};
