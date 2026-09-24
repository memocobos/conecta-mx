// =============================================================================
// _lib/nube — la cotización semanal del transporte a CDMX (NUBE-1)
// =============================================================================
// EL DUEÑO ÚNICO de dos preguntas, y por eso vive aquí y no en cada endpoint:
//   · `vigentes()`  ¿cuál rige AHORA, por modo?         → lo usa el sitio
//   · `regiaEl()`   ¿cuál regía el día X, por modo?     → lo usa el historial
//
// 🔒 ESCRIBIRLAS EN CADA LADO SERÍA LA DÉCIMOSEGUNDA FÓRMULA. La auditoría
// AUD-1 encontró ONCE maneras distintas de decir «cuánto dinero hay», todas
// coherentes consigo mismas hasta que alguien miró dos a la vez. «Qué precio
// rige» es exactamente esa clase de pregunta: el endpoint público, la pantalla
// de captura y el historial tienen que contestar lo mismo o la disputa de un
// cliente se resuelve distinto según quién la mire.
//
// 🔒 VENCIDA = NO HAY PRECIO. `vigentes()` devuelve `null` para el modo cuya
// fila venció, y quien pregunta cae a su camino de siempre (WhatsApp). Un
// precio vencido JAMÁS se pinta ni se vende: es la mentira de NATA —un letrero
// que sobrevivió a su verdad— aplicada al transporte, donde además cuesta
// dinero.
//
// 🔒 LA CICATRIZ DE OMAR COURTZ. `regiaEl()` distingue TRES estados, no dos:
// vigente ese día · vencida ese día · ANTERIOR AL NACIMIENTO. La tabla de
// precios del evento graba CAMBIOS, así que «nunca cambió» y «yo todavía no
// existía» se veían igual y /rol acabó cotizando el precio de HOY para un
// separo pasado. Aquí la primera fila de un modo es su nacimiento y se dice con
// esas palabras.
// =============================================================================

const MODOS = ['bus', 'avion'];

// La forma que sale a la calle. Se arma campo por campo —nunca con un spread—
// para que `capturado_por` y la `nota` interna no se escapen al público por
// accidente: quien las necesita es el admin, y las pide por su endpoint.
function publica(f) {
  if (!f) return null;
  return {
    precio: Number(f.precio_pp),
    vigente_hasta: f.vigente_hasta,
    // [NUBE-4] Los horarios SÍ son públicos: son el dato que el cliente necesita
    // («qué aerolínea, a qué hora salgo y a qué hora regreso»). `nota` y
    // `capturado_por` siguen fuera — quien las necesita es el admin.
    horarios: (typeof f.horarios === 'string' && f.horarios.trim()) ? f.horarios.trim() : null,
  };
}
// La forma completa, para las pantallas con rol.
function interna(f) {
  if (!f) return null;
  return {
    id: f.id,
    modo: f.modo,
    precio: Number(f.precio_pp),
    vigente_desde: f.vigente_desde,
    vigente_hasta: f.vigente_hasta,
    nota: f.nota || null,
    capturado_por: f.capturado_por || null,
    creado_en: f.creado_en,
    // [NUBE-4] `evento_id` en NULL NO es un hueco: es «GENERAL CDMX», y la
    // pantalla lo ROTULA con esas palabras. Un null pintado como vacío haría
    // que la cotización que rige para todos se leyera como un dato que falta.
    evento_id: f.evento_id == null ? null : String(f.evento_id),
    horarios: (typeof f.horarios === 'string' && f.horarios.trim()) ? f.horarios.trim() : null,
  };
}

// Todas las filas de un modo, de la más nueva a la más vieja. `pedir` es el
// lector de PostgREST que le pasa el llamador (así este lib no elige llaves ni
// arma URLs de Supabase: la puerta es del endpoint).
async function filasDe(pedir, modo, eventoId, limite) {
  // [NUBE-4] El filtro del evento es EXPLÍCITO en los dos casos y no hay
  // «sin filtro»: `is.null` para la general y `eq.<slug>` para la del evento.
  // Un `filasDe` que se olvidara del filtro mezclaría las dos y la general
  // podría ganarle a la propia por ser más nueva — el orden decidiría el
  // precio, que es lo que esta función existe para que no pase.
  const filtro = (eventoId == null)
    ? '&evento_id=is.null'
    : ('&evento_id=eq.' + encodeURIComponent(String(eventoId)));
  const qs = 'nube_cotizaciones?modo=eq.' + encodeURIComponent(modo) + filtro
    + '&select=id,modo,evento_id,precio_pp,vigente_desde,vigente_hasta,horarios,nota,capturado_por,creado_en'
    + '&order=vigente_desde.desc,creado_en.desc'
    + (limite ? ('&limit=' + Number(limite)) : '');
  const filas = await pedir(qs);
  return Array.isArray(filas) ? filas : [];
}

// [NUBE-4] LA RESOLUCIÓN CON HERENCIA ROTULADA — la forma de ROL-HIST-PADRE.
//   la cotización DEL EVENTO manda → sin ella, la GENERAL → sin ninguna, null
// y `heredado:true` VIAJA en la respuesta, porque un precio general presentado
// como el precio del evento es un dato bueno con la etiqueta equivocada. Quien
// pinta decide cómo lo dice; lo que no puede es no saberlo.
//
// 🔒 La herencia es de UNA GENERACIÓN y el orden NO se invierte nunca: lo
// específico le gana a lo general aunque la general sea más nueva. Si el bus de
// `edc27` se cotizó el lunes y la general el martes, edc27 vende SU precio.
// `heredado` solo puede ser true cuando se PREGUNTÓ por un evento: en la
// consulta general no hay de quién heredar, y devolverlo en true ahí haría que
// la pantalla rotulara «general» una cotización que ES la general.
async function resolver(pedir, modo, eventoId, ahoraMs) {
  const t = Number.isFinite(ahoraMs) ? ahoraMs : Date.now();
  if (eventoId != null) {
    const propias = await filasDe(pedir, modo, eventoId, 20);
    const suya = cualCubre(propias, t);
    if (suya) return Object.assign(publica(suya), { heredado: false, evento_id: String(eventoId) });
  }
  const generales = await filasDe(pedir, modo, null, 20);
  const g = cualCubre(generales, t);
  if (!g) return null;
  return Object.assign(publica(g), { heredado: eventoId != null, evento_id: null });
}

// ¿Cuál rige en el instante `ahora`? La fila más nueva cuya vigencia lo CUBRE.
// ⚠️ No es «la última capturada»: si alguien capturó una que arranca el lunes
// que viene, hoy no rige. Se pregunta por la ventana, no por el orden.
function cualCubre(filas, ahoraMs) {
  for (const f of filas) {
    const d = Date.parse(f.vigente_desde), h = Date.parse(f.vigente_hasta);
    if (!Number.isFinite(d) || !Number.isFinite(h)) continue;
    if (ahoraMs >= d && ahoraMs < h) return f;
  }
  return null;
}

// { bus: {precio, vigente_hasta} | null, avion: … } — SOLO vigentes.
// `ahoraMs` se recibe en vez de leerse aquí: un careo tiene que poder congelar
// el reloj, y una función que llama a `Date.now()` por dentro no se puede
// medir en la frontera de una vigencia.
async function vigentes(pedir, ahoraMs, eventoId) {
  const t = Number.isFinite(ahoraMs) ? ahoraMs : Date.now();
  // 🔴 NO SE TRAGA EL ERROR, y esto lo cazó el careo. La primera versión
  // envolvía cada lectura en un `try/catch` que caía a `[]`, así que un 5xx de
  // la base salía como «no hay cotización vigente» con `ok:true` — y eso
  // BORRA la diferencia entre «no hay fila» y «NO PUDE LEER». Las dos se ven
  // igual desde el sitio (los dos modos en null → WhatsApp), pero para el
  // endpoint no son lo mismo: el tropiezo tiene que salir con `ok:false` y
  // `no-store`, o el CDN congela diez minutos de «no hay precio» por una
  // caída de un segundo. Un cero es una afirmación; un cero que en realidad
  // es «no sé» es una afirmación falsa.
  // [NUBE-4] El fail-soft sigue siendo POR MODO —bus vigente con avión vencido
  // vende el bus— y ahora la resolución de cada modo es la del resolvedor, con
  // su herencia. `eventoId` ausente = la consulta GENERAL, que es la que pedía
  // NUBE-1: así el llamador viejo sigue teniendo sentido.
  const out = {};
  for (const modo of MODOS) {
    out[modo] = await resolver(pedir, modo, eventoId == null ? null : String(eventoId), t);
  }
  return out;
}

// ¿Qué regía el día `diaMs` para `modo`? Los TRES estados, con su nombre.
//   { estado:'vigente'|'vencida'|'antes_del_nacimiento'|'sin_datos', fila, nacimiento }
//
// «vencida» es el caso en que ese día había filas pero ninguna cubría el día:
// hubo cotización antes y después, y ese día la nube estaba sin vigencia. Se
// devuelve además la ÚLTIMA que venció antes de ese día, porque es el dato que
// un humano quiere ver para entender qué pasó — rotulado como vencida, nunca
// como la que regía.
// El NÚCLEO: los tres estados DENTRO de una llave (la del evento o la general),
// sin herencia. Se separó de `regiaEl` a propósito — mi primera versión hizo
// `regiaEl` recursiva sobre sí misma y la llamada interna le pasaba el evento
// en un QUINTO argumento que nadie leía: `eventoId` quedaba en null y las filas
// propias del evento NUNCA se hubieran consultado. Un dueño con dos trabajos
// —resolver la llave y resolver la herencia— se confunde consigo mismo.
async function _regiaEnLlave(pedir, modo, diaMs, eventoId) {
  const filas = await filasDe(pedir, modo, eventoId == null ? null : String(eventoId));
  if (!filas.length) return { estado: 'sin_datos', fila: null, nacimiento: null };
  // El NACIMIENTO es la vigencia más antigua, no la fila más vieja por
  // `creado_en`: alguien puede capturar hoy una vigencia que arrancó ayer.
  let nacimiento = null;
  for (const f of filas) {
    const d = Date.parse(f.vigente_desde);
    if (!Number.isFinite(d)) continue;
    if (nacimiento == null || d < nacimiento) nacimiento = d;
  }
  if (nacimiento != null && diaMs < nacimiento) {
    return { estado: 'antes_del_nacimiento', fila: null, nacimiento };
  }
  const cubre = cualCubre(filas, diaMs);
  if (cubre) return { estado: 'vigente', fila: interna(cubre), nacimiento };
  // Ninguna cubría ese día: la última que murió antes.
  let previa = null, previaH = -Infinity;
  for (const f of filas) {
    const h = Date.parse(f.vigente_hasta);
    if (Number.isFinite(h) && h <= diaMs && h > previaH) { previa = f; previaH = h; }
  }
  return { estado: 'vencida', fila: interna(previa), nacimiento };
}

// [NUBE-4] LA CASCADA, rotulada — la forma de ROL-HIST-PADRE. La disputa que
// este historial resuelve es «qué precio regía ese día PARA ESTE EVENTO», y
// si ese día el evento no tenía cotización propia, lo que rigió fue la
// general: contestar «sin datos» ahí sería FALSO, sí hubo un precio.
//   `heredado` viaja siempre, y la pantalla lo ROTULA. Un precio general
// presentado como el del evento es un dato bueno con la etiqueta equivocada.
// ⚠️ La general solo REEMPLAZA si de verdad regía ese día. Si tampoco regía,
// se devuelve lo que dijo el evento —su «vencida» o su «antes del
// nacimiento»—, que es la respuesta que EXPLICA, y se agrega `general` con el
// estado de la general para no perder por qué la herencia no salvó el día.
async function regiaEl(pedir, modo, diaMs, eventoId) {
  if (eventoId == null) {
    return Object.assign(await _regiaEnLlave(pedir, modo, diaMs, null), { heredado: false });
  }
  const propio = await _regiaEnLlave(pedir, modo, diaMs, String(eventoId));
  if (propio.estado === 'vigente') return Object.assign(propio, { heredado: false });
  const general = await _regiaEnLlave(pedir, modo, diaMs, null);
  if (general.estado === 'vigente') return Object.assign(general, { heredado: true });
  return Object.assign(propio, { heredado: false, general: general.estado });
}

module.exports = { MODOS, vigentes, regiaEl, resolver, filasDe, publica, interna,
  _cualCubre: cualCubre, _regiaEnLlave };
