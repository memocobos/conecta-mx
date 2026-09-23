// =============================================================================
// admin-nube — la pluma de Bulma y Milk sobre la nube voladora (NUBE-1)
// =============================================================================
// POST { accion } · roles maestro_roshi | bulma | milk.
//   'listar'  → { ok, modos:{ bus:{vigente,ultimas[]}, avion:{…} }, ahora }
//   'cotizar' → inserta UNA fila. { modo, precio_pp, vigente_hasta, vigente_desde?, nota? }
//
// 🔒 INSERT-ONLY, Y NO SOLO POR EL TRIGGER. Aquí no existe ninguna acción que
// actualice ni borre: para cambiar un precio se captura una fila nueva. El
// trigger de la base es el candado de verdad —el que aguanta aunque alguien
// escriba desde otro lado—, y esto es su espejo: los dos tienen que decir lo
// mismo o el candado se lee como protección y el camino queda abierto.
//
// 🔒 UNA ACCIÓN NUEVA VA EN `ACCIONES` O NO EXISTE. Es la ley de RAD-FIX-CAMINO:
// tres tuercas llegaron ROTAS a producción con su careo en verde porque el
// despacho no las conocía.
//
// 🔒 EL QUE CAPTURA SE GRABA DEL TOKEN, NUNCA DEL BODY. `capturado_por` existe
// para que una disputa («a mí me dijeron $X») se resuelva leyendo; si viniera
// de fuera, sería un campo que cualquiera puede firmar con otro nombre.
//
// Sin correo: esta fase no manda nada. El aviso de «la nube está vencida» es un
// renglón de pantalla (NUBE-3), no un cron — decisión de Memo.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { MODOS, vigentes, filasDe, interna, _cualCubre } = require('./_lib/nube');

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const ACCIONES = ['listar', 'cotizar'];

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma', 'milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  if (!SB_URL || !SB_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan las llaves de KameHouse' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const accion = typeof body.accion === 'string' ? body.accion.trim() : '';
  if (!ACCIONES.includes(accion)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Acción desconocida: ' + JSON.stringify(accion) }) };
  }

  const pedir = async (qs) => {
    const r = await fetch(SB_URL + '/rest/v1/' + qs, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
    });
    if (!r.ok) throw new Error('SB ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return r.json();
  };

  try {
    if (accion === 'listar') {
      const ahora = Date.now();
      const modos = {};
      for (const modo of MODOS) {
        const filas = await filasDe(pedir, modo, 12);
        modos[modo] = {
          // La vigente sale del DUEÑO (`_cualCubre`), no de «la primera de la
          // lista»: una fila capturada para el lunes que viene NO rige hoy, y
          // ordenarlas no contesta esa pregunta.
          vigente: interna(_cualCubre(filas, ahora)),
          ultimas: filas.map(interna),
        };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, modos, ahora }) };
    }

    // ── cotizar ────────────────────────────────────────────────────────────
    const modo = typeof body.modo === 'string' ? body.modo.trim().toLowerCase() : '';
    if (!MODOS.includes(modo)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'El modo tiene que ser «bus» o «avion»' }) };
    }
    // 🔒 EL PRECIO NO SE INVENTA NI SE REDONDEA A LA BUENA: se exige un número
    // mayor que cero. Un 0 aquí sería un transporte gratis publicado al sitio.
    const precio = Number(body.precio_pp);
    if (!Number.isFinite(precio) || precio <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el precio por persona (un número mayor que cero)' }) };
    }
    // La vigencia es OBLIGATORIA y llega como instante ya resuelto (la pantalla
    // convierte la hora de Reynosa; el instante quita la pregunta del huso).
    const hasta = Date.parse(body.vigente_hasta);
    if (!Number.isFinite(hasta)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta hasta cuándo rige esta cotización' }) };
    }
    const desde = body.vigente_desde ? Date.parse(body.vigente_desde) : Date.now();
    if (!Number.isFinite(desde)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'La fecha de arranque no se entiende' }) };
    }
    // ⚠️ SE REHÚSA UNA COTIZACIÓN QUE NACE VENCIDA. No es un detalle: una fila
    // así no rige nunca, así que el sitio seguiría en WhatsApp y la pantalla
    // diría «ya capturé» — el «éxito vacío» que esta casa ya pagó.
    //
    // 🔴 Y VA **ANTES** DE LA GUARDA DEL «AL REVÉS», que es lo que cazó el
    // careo: con `vigente_desde` ausente el arranque es AHORA, así que una
    // vigencia pasada dispara primero «termina antes de empezar» — cierto,
    // pero le dice a quien captura el problema equivocado. El mensaje tiene
    // que nombrar la causa que el humano puede corregir.
    if (hasta <= Date.now()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Esa vigencia ya pasó: la cotización nacería vencida y no regiría nunca' }) };
    }
    if (hasta <= desde) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'La vigencia está al revés: termina antes de empezar' }) };
    }
    const nota = typeof body.nota === 'string' && body.nota.trim() ? body.nota.trim().slice(0, 400) : null;
    // Del TOKEN, no del body.
    // 🔒 EL NOMBRE DEL CAMPO SE LEYÓ DEL CÓDIGO DE LA OTRA PUNTA, no de mi
    // memoria: `verifyAdminAuth` documenta su payload como
    // `{ id, correo, rol, exp, iat }` y la variante Live devuelve
    // `{ ...payload, rol: rolVivo }`. O sea **`correo`**, y NO existen
    // `nombre` ni `email`. La primera versión de esta línea los leía y habría
    // caído al uuid en silencio: un `capturado_por` que no sirve para lo único
    // que existe, que es saber QUIÉN capturó.
    const quien = (auth.user && (auth.user.correo || auth.user.id)) || 'desconocido';

    const ins = await fetch(SB_URL + '/rest/v1/nube_cotizaciones', {
      method: 'POST',
      headers: {
        apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify({
        modo,
        precio_pp: precio,
        vigente_desde: new Date(desde).toISOString(),
        vigente_hasta: new Date(hasta).toISOString(),
        nota,
        capturado_por: String(quien).slice(0, 120),
      }),
    });
    if (!ins.ok) {
      const detalle = (await ins.text()).slice(0, 300);
      console.error('[admin-nube] insert', ins.status, detalle);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo guardar la cotización', detail: detalle }) };
    }
    const filas = await ins.json().catch(() => []);
    const nueva = interna(Array.isArray(filas) ? filas[0] : filas);
    // Se devuelve además el estado VIGENTE recalculado, para que la pantalla
    // pinte lo que de verdad rige en vez de suponer que lo recién capturado
    // manda: si Bulma capturó para el lunes que viene, hoy sigue la de antes.
    const v = await vigentes(pedir, Date.now());
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, fila: nueva, vigentes: v }) };
  } catch (e) {
    console.error('[admin-nube]', (e && e.message) || e);
    return { statusCode: 502, headers, body: JSON.stringify({ error: (e && e.message) || 'Error leyendo la nube' }) };
  }
};
