// =============================================================================
// admin-nube — la pluma de Bulma y Milk sobre la nube voladora (NUBE-1)
// =============================================================================
// POST { accion } · roles maestro_roshi | bulma | milk.
//   'listar'  → { ok, modos:{ bus:{vigente,ultimas[]}, avion:{…} }, ahora }
//   'cotizar' → inserta UNA fila. { modo, precio_pp, vigente_hasta, vigente_desde?, nota? }
//   'historial' → ¿qué regía el día X? { dia } → los dos modos con su estado
//                 ROTULADO y quién la capturó. [NUBE-3]
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
const { MODOS, vigentes, regiaEl, resolver, filasDe, interna, _cualCubre } = require('./_lib/nube');

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const { fetchEventosRaw } = require('./_lib/catalogo-index');

// [NUBE-4] LA LISTA DE EVENTOS SE DERIVA DEL CATÁLOGO, NO SE TECLEA. Un arreglo
// de slugs a mano es la lista al lado de la realidad que esta casa ya pagó siete
// veces: el día que entre un evento de CDMX nuevo, la pluma no lo ofrecería y
// nadie se enteraría — se vería igual que «todavía no hay que cotizarlo».
//
// La regla, copiada de dónde el sitio la aplica (`isCDMX` y `nubeVueloIncluido`
// de index.html, el paso del transporte):
//   · es de CDMX (por el VENUE, que es lo que el index mira),
//   · no pasó,
//   · y su paquete NO incluye ya el vuelo — si lo incluye, no usa este paso y
//     ofrecerlo invitaría a venderle el vuelo DOS veces.
// ⚠️ `noBus` SÍ entra: ese evento sigue usando el paso, con avión solamente.
function _esCdmx(ev) {
  const v = String((ev && ev.v) || '').toUpperCase();
  return v.includes('CDMX') || v.includes('CIUDAD DE MEXICO');
}
function _vueloIncluido(ev) {
  const inc = (ev && ev.inc) || [];
  return inc.some((x) => /\bavi[o\u00f3]n\b|\bvuelo\b/i.test(String(x)));
}
// El día de hoy en REYNOSA. `toISOString()` nunca es «hoy» en México: pasadas
// las 6 de la tarde de acá ya es el día siguiente en Greenwich, y en esta casa
// se trabaja de noche.
function _hoyReynosa() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
}
async function eventosCdmx() {
  const EV = await fetchEventosRaw();
  if (!Array.isArray(EV)) return null;      // NO se inventa una lista vacía
  const hoy = _hoyReynosa();
  return EV
    .filter((ev) => ev && ev.id && _esCdmx(ev) && !ev._past && String(ev.ds || '') >= hoy && !_vueloIncluido(ev))
    .map((ev) => ({ id: String(ev.id), nombre: String(ev.a || ev.id), ds: ev.ds || null, st: ev.st || '' }))
    .sort((a, b) => String(a.ds || '9999').localeCompare(String(b.ds || '9999')));
}

const ACCIONES = ['listar', 'cotizar', 'historial', 'eventos', 'cobertura'];

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
    // ── cobertura · ¿CUÁNTOS EVENTOS VIVOS SE QUEDAN SIN PRECIO? ───────────
    // [NUBE-5] El renglón del Radar necesita una cuenta, no un precio: cuántos
    // eventos de CDMX vivos NO tienen cotización propia NI general para un
    // modo. «La general venció» y «tres eventos se quedaron sin nada» no son la
    // misma noticia, y la segunda es la que dice el tamaño del problema.
    //
    // 🔒 LA PREGUNTA SE LE HACE AL DUEÑO, evento por evento (`resolver`), en vez
    // de razonar aquí «si la general rige, todos están cubiertos» — que es
    // cierto HOY y es exactamente la clase de atajo que vuelve a esta función
    // una segunda opinión sobre la cascada. Lo que SÍ se hace es memoizar el
    // LECTOR: la consulta de la general se repetiría 18 veces idéntica, y
    // cachear una lectura no es re-implementar una regla.
    if (accion === 'cobertura') {
      const lista = await eventosCdmx();
      if (lista == null) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer el cat\u00e1logo' }) };
      }
      const memo = new Map();
      const pedirMemo = async (qs) => {
        if (memo.has(qs)) return memo.get(qs);
        const v = await pedir(qs);
        memo.set(qs, v);
        return v;
      };
      const ahora = Date.now();
      const sin = {}, propios = {};
      for (const modo of MODOS) { sin[modo] = []; propios[modo] = 0; }
      for (const ev of lista) {
        for (const modo of MODOS) {
          const r = await resolver(pedirMemo, modo, ev.id, ahora);
          if (!r) sin[modo].push({ id: ev.id, nombre: ev.nombre, ds: ev.ds });
          else if (r.heredado === false) propios[modo]++;
        }
      }
      return { statusCode: 200, headers, body: JSON.stringify({
        ok: true, total: lista.length, sin, propios, consultas: memo.size, ahora,
      }) };
    }

    if (accion === 'eventos') {
      const lista = await eventosCdmx();
      if (lista == null) {
        // 🔒 NO SE CONTESTA UNA LISTA VACÍA CUANDO NO SE PUDO LEER. Un `[]` aquí
        // dejaría el selector con solo la opción general y se leería como «no hay
        // eventos de CDMX» — la diferencia entre «no hay» y «no pude» otra vez.
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer el cat\u00e1logo para armar la lista de eventos' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, eventos: lista }) };
    }

    // [NUBE-4] El evento del que se habla. AUSENTE o vacío = la GENERAL, que es
    // un caso REAL y no un dato que falta: la pantalla lo dice con palabras
    // («— General CDMX (todos) —»).
    const eventoId = (typeof body.evento_id === 'string' && body.evento_id.trim())
      ? body.evento_id.trim() : null;

    if (accion === 'listar') {
      const ahora = Date.now();
      const modos = {};
      for (const modo of MODOS) {
        const filas = await filasDe(pedir, modo, eventoId, 12);
        modos[modo] = {
          // La vigente sale del DUEÑO (`_cualCubre`), no de «la primera de la
          // lista»: una fila capturada para el lunes que viene NO rige hoy, y
          // ordenarlas no contesta esa pregunta.
          vigente: interna(_cualCubre(filas, ahora)),
          ultimas: filas.map(interna),
        };
      }
      // [NUBE-4] Y la RESOLUCIÓN, que es otra pregunta que la de «mis filas»:
      // con el evento elegido, `vigente` de arriba puede estar en null y aun
      // así haber precio — el heredado de la general. La pantalla tiene que
      // poder decir «este evento no tiene cotización propia, rige la general»
      // en vez de «no hay precio», que sería falso.
      const resuelto = await vigentes(pedir, ahora, eventoId);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, evento_id: eventoId, modos, resuelto, ahora }) };
    }

    // ── historial · ¿QUÉ REGÍA EL DÍA X? ──────────────────────────────────
    // 🔒 LA PREGUNTA SE LE HACE AL DUEÑO (`regiaEl` de `_lib/nube`), no se
    // re-implementa aquí. Es la misma razón por la que el lib existe: «qué
    // precio regía» contestado en dos sitios acaba contestándose distinto, y
    // este endpoint es justo el que va a resolver una disputa de dinero.
    //
    // 🔒 Y LOS TRES ESTADOS VIAJAN CON SU NOMBRE, sin aplastarse en un
    // booleano: «vigente ese día», «vencida ese día» y «ANTERIOR AL
    // NACIMIENTO» no son grados de lo mismo. Juntarlos en «no hay» es
    // exactamente el error de Omar Courtz, que acabó contestando el precio de
    // HOY para un separo pasado.
    if (accion === 'historial') {
      const crudo = (typeof body.dia === 'string') ? body.dia.trim() : '';
      if (!crudo) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el día que se consulta' }) };
      // ⚠️ Una fecha suelta se lee como el MEDIODÍA de Reynosa, no como
      // medianoche UTC: `Date.parse('2026-10-05')` es medianoche en Greenwich,
      // o sea el día ANTERIOR acá — la mordida de `toISOString()` que esta
      // casa ya pagó tres veces. El mediodía deja el día elegido dentro de sí
      // mismo con cualquiera de los dos husos de Reynosa.
      const soloFecha = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(crudo);
      const dia = soloFecha ? Date.parse(crudo + 'T12:00:00-05:00') : Date.parse(crudo);
      if (!Number.isFinite(dia)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ese día no se entiende: ' + crudo }) };
      }
      const modos = {};
      for (const modo of MODOS) modos[modo] = await regiaEl(pedir, modo, dia, eventoId);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dia: new Date(dia).toISOString(), evento_id: eventoId, modos }) };
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
    // [NUBE-4] Los HORARIOS: texto libre (aerolínea, hora de salida y regreso).
    // Opcionales a propósito — una cotización sin horarios sigue siendo un
    // precio válido, y el card los omite en vez de inventarlos.
    const horarios = typeof body.horarios === 'string' && body.horarios.trim()
      ? body.horarios.trim().slice(0, 600) : null;
    // 🔒 EL EVENTO SE VALIDA CONTRA LA LISTA DERIVADA, en la PUERTA. Un slug
    // mal escrito crearía una fila huérfana que no rige para nadie y que nadie
    // podría encontrar: el precio quedaría capturado y el sitio seguiría en
    // WhatsApp, con la pantalla diciendo «ya coticé». Es el «éxito vacío» con
    // dinero enfrente, y el dato imposible se rehusa donde se captura.
    if (eventoId != null) {
      const lista = await eventosCdmx();
      if (lista == null) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo leer el cat\u00e1logo para comprobar el evento. Intenta de nuevo.' }) };
      }
      if (!lista.some((e) => e.id === eventoId)) {
        return { statusCode: 400, headers, body: JSON.stringify({
          error: 'Ese evento no est\u00e1 en la lista de eventos de CDMX vivos: ' + eventoId,
        }) };
      }
    }
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
        evento_id: eventoId,
        precio_pp: precio,
        vigente_desde: new Date(desde).toISOString(),
        vigente_hasta: new Date(hasta).toISOString(),
        horarios,
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
    const v = await vigentes(pedir, Date.now(), eventoId);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, fila: nueva, vigentes: v }) };
  } catch (e) {
    console.error('[admin-nube]', (e && e.message) || e);
    return { statusCode: 502, headers, body: JSON.stringify({ error: (e && e.message) || 'Error leyendo la nube' }) };
  }
};
