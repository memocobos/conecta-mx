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
  };
}

// Todas las filas de un modo, de la más nueva a la más vieja. `pedir` es el
// lector de PostgREST que le pasa el llamador (así este lib no elige llaves ni
// arma URLs de Supabase: la puerta es del endpoint).
async function filasDe(pedir, modo, limite) {
  const qs = 'nube_cotizaciones?modo=eq.' + encodeURIComponent(modo)
    + '&select=id,modo,precio_pp,vigente_desde,vigente_hasta,nota,capturado_por,creado_en'
    + '&order=vigente_desde.desc,creado_en.desc'
    + (limite ? ('&limit=' + Number(limite)) : '');
  const filas = await pedir(qs);
  return Array.isArray(filas) ? filas : [];
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
async function vigentes(pedir, ahoraMs) {
  const t = Number.isFinite(ahoraMs) ? ahoraMs : Date.now();
  const out = {};
  for (const modo of MODOS) {
    let filas = [];
    try { filas = await filasDe(pedir, modo, 20); } catch (_) { filas = []; }
    out[modo] = publica(cualCubre(filas, t));
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
async function regiaEl(pedir, modo, diaMs) {
  const filas = await filasDe(pedir, modo);
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

module.exports = { MODOS, vigentes, regiaEl, filasDe, publica, interna, _cualCubre: cualCubre };
