// =============================================================================
// _lib/cosecha-excel.js — traer una pestaña del Excel, y saber cuándo NO se trajo
// =============================================================================
// EXCEL-BOTÓN-1a. La cosecha corre en el SERVIDOR, no en el navegador: se midió
// que el fetch directo a `gviz` desde nuestro origen muere en el preflight, con
// y sin credenciales. La puerta es un Apps Script publicado como Web App
// (apps-script/excel-cosechador.gs), al que se le pega con un token que vive en una
// env var y NUNCA baja al navegador.
//
// ── LA GUARDA ES DE FORMA, NO DE STATUS ─────────────────────────────────────
// Cuando algo sale mal del lado de Google, la respuesta no es un error: es una
// PÁGINA. Una URL mal desplegada, una implementación que pide iniciar sesión, un
// /exec que ya no existe — todos contestan HTML, muchos con 200. Un parser
// alimentado con HTML no truena: devuelve cero filas. Y cero filas leído como
// «no hay nadie nuevo» es la peor mentira posible en esta herramienta.
//
// Por eso nada se da por bueno hasta que se ve la FORMA esperada, y el último
// candado es la celda exacta `Nombre`: si no está, no es la hoja, se diga lo que
// se diga en el status. Cada fallo sale con su propio código y con un mensaje
// que se puede obedecer — los tres se arreglan distinto y confundirlos manda al
// admin a arreglar lo que no está roto.
// =============================================================================

const CELDA_ENCABEZADO = 'Nombre';
// Cuántas filas se miran buscando el encabezado. Las pestañas reales lo traen
// entre la 1 y la 8 (varía por pestaña); 30 es holgura de sobra sin volver el
// error inútil («no lo encontré en 5000 filas» no ayuda a nadie).
const MAX_FILAS_ENCABEZADO = 30;

// ── LAS DOS PUERTAS ─────────────────────────────────────────────────────────
// [CUADRE-2] Hay DOS exceles y por lo tanto DOS puertas:
//   · las PESTAÑAS de las chicas (una por evento) — la de siempre;
//   · el libro corrido de NUMEROLOGÍA, pestaña «Boletos», donde Memo anota los
//     CHEAP que cobra directo.
//
// 🔒 SON DOS DESPLIEGUES DEL MISMO `.gs`, NO UN `.gs` QUE RECIBE LA HOJA. El
// `excel-cosechador.gs` está atado a SU hoja A PROPÓSITO: el SID no viaja de
// fuera, y así una URL filtrada no puede pedirle que lea CUALQUIER hoja de
// Drive. Abrir esa puerta para ahorrarse un despliegue cambiaría un candado
// real por comodidad. Cada despliegue trae su par de env vars.
const FUENTES = {
  pestanas: {
    url: 'EXCEL_SCRIPT_URL', token: 'EXCEL_SCRIPT_TOKEN',
    // El último candado de forma: si no está la celda «Nombre», no es la hoja.
    exigeEncabezado: true,
    comoSePone: 'Se ponen al desplegar el Apps Script desde el Excel de las chicas (ver apps-script/excel-cosechador.gs).',
  },
  numerologia: {
    url: 'NUMEROLOGIA_SCRIPT_URL', token: 'NUMEROLOGIA_SCRIPT_TOKEN',
    // 🔒 EL LIBRO NO TIENE UN ENCABEZADO: TIENE 55. Es una pila de bloques, uno
    // por evento, cada uno con el suyo — y OCHO de ellos ni siquiera rotulan
    // «Nombre». Exigir aquí una celda única sería rechazar la hoja BUENA:
    // medido, `cosechar` contestaba SIN_ENCABEZADO sobre la pestaña real. La
    // guarda de forma de esta fuente vive en su parser, que exige «Costo al
    // Publico» + «Separo» para reconocer un bloque.
    exigeEncabezado: false,
    comoSePone: 'Se ponen al desplegar el MISMO apps-script/excel-cosechador.gs una SEGUNDA vez, ahora desde el Excel «Numerología» de Memo, y guardar su /exec y su token con estos nombres.',
  },
};

// ── EL RELOJ, LA CADENA Y EL REINTENTO ──────────────────────────────────────
// [COSECHA-REDIRECT-1] Lo que Jane vio el 3-oct pidiendo trueno por evento:
// 504 · 504 · y a la tercera el cuerpo de `doGet` del .gs —«Este script solo
// contesta por POST y con token · [SIN_TOKEN]»—. Medido contra producción el
// mismo día, 21 cosechas seguidas (catálogo, trueno ×6, tanda de 10 en
// paralelo): la cadena REAL del Apps Script es SIEMPRE
//
//     POST  script.google.com/macros/s/<id>/exec        → 302
//     GET   script.googleusercontent.com/macros/echo    → 200  (1.7–2.3 s)
//
// 🔒 ESE CAMBIO DE MÉTODO ES NORMAL Y ES DEL ESTÁNDAR: un 301/302/303 sobre un
// POST se sigue con GET y SIN cuerpo. No es un defecto: el `echo` sirve el
// resultado que el POST YA ejecutó. Pero deja una mordida: si la redirección se
// degrada y el `Location` apunta OTRA VEZ al `/exec`, ese GET ya no recoge nada
// — EJECUTA `doGet`, que contesta SIN_TOKEN. Es la única forma de que nuestro
// cosechador vea ese código, porque `leerEnv` ya cortó antes si falta el token
// (SIN_CONFIG) y un token equivocado contesta TOKEN_INVALIDO. Dicho al revés:
//
//   🔒 SIN_TOKEN NO ES UNA FALLA DE CONFIGURACIÓN — ES UN ACCIDENTE DE RED.
//
// Dos remedios, los dos con su razón medida:
//  · LA CADENA SE CAMINA A MANO para no degradar el método donde importa: al
//    `echo` se va con GET (es lo correcto y es lo medido), y si el destino es el
//    MISMO `/exec` se vuelve a POSTEAR con el cuerpo. Nunca se le hace GET a la
//    puerta que ejecuta `doGet`.
//  · UN RELOJ Y UN REINTENTO, porque la otra cara del mismo mal rato es el 504:
//    el fetch no tenía reloj, así que un Google colgado se comía los 10 s
//    enteros de Netlify y el admin recibía un 504 pelón, sin una palabra de qué
//    pasó. Ahora cada intento tiene su reloj y el presupuesto está medido para
//    caber en esos 10 s con el resto del careo adentro.
//
// 🔒 REINTENTAR ES SEGURO Y NO ES UNA SUPOSICIÓN: `doPost` del .gs solo LEE
// (`getValues` / `getBackgrounds`); no tiene una sola escritura. Dos cosechas
// son dos fotos, nunca dos efectos.
const MAX_SALTOS = 5;
// 🔴 EL RELOJ DE UN INTENTO ES EL PRESUPUESTO QUE QUEDA, NO UNA REBANADA FIJA.
// Nació partido —4.5 s por intento, el doble de la peor cosecha medida (2,264
// ms)— y la PRIMERA corrida del lib nuevo contra el Google real lo tumbó: el
// arranque en frío tardó más de 4.5 s, el intento 1 abortó, al reintento le
// quedaron 2,690 ms y abortó también. 7,506 ms para fallar algo que, sin reloj,
// habría CONTESTADO BIEN. Un candado que convierte una llamada lenta-pero-buena
// en un fallo es peor que el 504 que vino a curar.
// 🔒 Así que el reparto es ASIMÉTRICO a propósito: el primer intento se lleva
// TODO el presupuesto, y solo hay reintento si falló DEJANDO tiempo —que es
// justo la forma del fallo transitorio (SIN_TOKEN y la PÁGINA vuelven en ~1.5 s,
// no agotan nada)—. Un colgado se come el presupuesto y NO se reintenta, que es
// lo correcto dentro de una función de 10 s.
// Netlify corta en 10 s TODO el careo (cosecha + base + cuentas). 7.5 s deja
// 2.5 s para lo demás, que es más de lo que el careo de un evento gasta.
const MS_PRESUPUESTO = 7500;
const MS_PAUSA = 300;
// 🔒 Por debajo de esto un reintento NO PUEDE ganar —la cosecha más rápida que
// se midió fue de 1,691 ms—, así que insistir solo quemaría el presupuesto y
// cambiaría un error legible por un 504.
const MS_MINIMO_OTRO = 1800;
const INTENTOS_MAX = 2;
// Las tres caras del MISMO mal rato de Google, y las únicas que se reintentan.
// TOKEN_INVALIDO, SIN_CONFIG, PESTANA_NO_EXISTE y SIN_ENCABEZADO NO están aquí
// a propósito: ésos se arreglan desplegando o sembrando, y insistir sobre ellos
// es hacerle perder el tiempo al admin tres veces en vez de una.
const TRANSITORIOS = ['SIN_TOKEN', 'NO_ES_JSON', 'SIN_RESPUESTA'];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ¿Este destino es la MISMA puerta /exec a la que le pegamos? Se compara origen
// + ruta y se ignoran los parámetros: lo que decide es si un GET ahí ejecutaría
// `doGet`, no cómo venga firmada la URL.
function esLaMismaPuerta(destino, urlExec) {
  try {
    const a = new URL(destino), b = new URL(urlExec);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch (e) { return false; }
}

// Un intento: camina la cadena y devuelve { status, texto }.
// 🔒 Una respuesta SIN `headers` —la forma que usan los fetch falsos de los
// arneses— se trata como FINAL. Preguntarle `location` a ciegas habría tirado
// un TypeError en todos los careos que ya corren, que es el defecto del
// instrumento disfrazado de defecto del código.
async function unIntento(_fetch, urlExec, cuerpo, timeoutMs) {
  const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
  const reloj = ctrl ? setTimeout(() => ctrl.abort(), Math.max(1, timeoutMs)) : null;
  let url = urlExec, metodo = 'POST';
  try {
    for (let salto = 0; salto < MAX_SALTOS; salto++) {
      const init = (metodo === 'POST')
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo, redirect: 'manual' }
        : { method: 'GET', redirect: 'manual' };
      if (ctrl) init.signal = ctrl.signal;
      const r = await _fetch(url, init);
      const loc = (r && r.headers && typeof r.headers.get === 'function') ? r.headers.get('location') : null;
      const esRedireccion = r && r.status >= 300 && r.status < 400 && loc;
      if (!esRedireccion) return { status: r.status, texto: await r.text() };
      const destino = (() => { try { return new URL(loc, url).toString(); } catch (e) { return loc; } })();
      // 🔒 AQUÍ VIVE LA CURA: al `echo` con GET; a la puerta que ejecuta, con POST.
      metodo = esLaMismaPuerta(destino, urlExec) ? 'POST' : 'GET';
      url = destino;
    }
    // Una cadena que no termina no se sigue en silencio: se dice que giraba.
    return { status: 0, texto: '', circulo: true };
  } finally { if (reloj) clearTimeout(reloj); }
}

function leerEnv(fuente) {
  const f = FUENTES[fuente || 'pestanas'];
  if (!f) return { error: { codigo: 'FUENTE_DESCONOCIDA', mensaje: `No existe la fuente «${fuente}».` } };
  const url = process.env[f.url];
  const token = process.env[f.token];
  if (!url || !token) {
    return { error: { codigo: 'SIN_CONFIG',
      mensaje: `Faltan ${f.url} / ${f.token} en Netlify. ${f.comoSePone}` } };
  }
  return { url, token };
}

// ¿Esto que llegó es una página en vez de datos? Se pregunta por el CUERPO y no
// por el `content-type`: una implementación que redirige a la pantalla de acceso
// de Google puede llegar con cualquier encabezado.
function pareceHtml(texto) {
  const t = String(texto || '').trimStart().slice(0, 400).toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html') || t.includes('<head');
}

// Busca la fila del encabezado por la celda EXACTA (sin espacios de sobra). No
// se busca «que contenga nombre»: `Nombre del titular` o `Nombre de la zona`
// harían pasar por encabezado a una fila que no lo es.
function buscarEncabezado(filas) {
  const tope = Math.min(filas.length, MAX_FILAS_ENCABEZADO);
  for (let i = 0; i < tope; i++) {
    const fila = Array.isArray(filas[i]) ? filas[i] : [];
    for (let c = 0; c < fila.length; c++) {
      if (String(fila[c] == null ? '' : fila[c]).trim() === CELDA_ENCABEZADO) {
        return { fila: i, columna: c };
      }
    }
  }
  return null;
}

// cosechar({ pestana }) →
//   { ok:true,  pestana, filas, n_filas, encabezado:{fila,columna}, pestanas }
//   { ok:false, codigo, mensaje, pestanas? }
// `pestana` vacío = solo el catálogo de pestañas (ahí no hay encabezado que
// buscar, y pedirlo sería inventar un fallo).
async function cosechar({ pestana, fuente } = {}, fetchImpl) {
  const env = leerEnv(fuente);
  if (env.error) return { ok: false, fuente: fuente || 'pestanas', ...env.error };
  const _fetch = fetchImpl || fetch;

  const nombreVar = (FUENTES[fuente || 'pestanas'] || {}).url;

  // 🔒 EL CUERPO SIEMPRE LLEVA TOKEN: `leerEnv` ya cortó arriba con SIN_CONFIG si
  // faltaba. Ésa es la medición que vuelve TRANSITORIO al SIN_TOKEN del script:
  // no hay un camino por el que esta lib mande un cuerpo sin token.
  const cuerpo = JSON.stringify({ token: env.token, pestana: pestana || '' });
  const t0 = Date.now();
  let json = null, fallo = null, intentos = 0;
  for (;;) {
    intentos++;
    fallo = null; json = null;
    const reloj = Math.max(1, MS_PRESUPUESTO - (Date.now() - t0));
    let got = null;
    try {
      got = await unIntento(_fetch, env.url, cuerpo, reloj);
    } catch (e) {
      const colgado = !!(e && (e.name === 'AbortError' || /abort/i.test(String((e && e.message) || ''))));
      fallo = { codigo: 'SIN_RESPUESTA',
        // Las dos causas se arreglan distinto —Google colgado se espera, una URL
        // muerta se vuelve a desplegar—, así que NO comparten mensaje.
        mensaje: colgado
          ? 'El Apps Script no contestó en ' + reloj + ' ms: Google está colgado o saturado. No es tu despliegue.'
          : 'No se pudo hablar con el Apps Script (' + (e && e.message) + '). Revisa que ' + nombreVar + ' siga viva.' };
    }
    if (!fallo && got.circulo) {
      fallo = { codigo: 'NO_ES_JSON',
        mensaje: 'La redirección del Apps Script giraba en redondo: ' + MAX_SALTOS + ' saltos sin llegar a los datos.' };
    }
    if (!fallo && pareceHtml(got.texto)) {
      fallo = { codigo: 'NO_ES_JSON',
        mensaje: 'Google contestó una PÁGINA, no datos. Casi siempre es el despliegue: la implementación tiene que ser "Ejecutar como: yo" y "Acceso: cualquier persona". Abre la URL /exec en el navegador — debe decir SIN_TOKEN.',
        pista: String(got.texto).trim().slice(0, 160) };
    }
    if (!fallo) {
      try { json = JSON.parse(got.texto); }
      catch (e) {
        fallo = { codigo: 'NO_ES_JSON',
          mensaje: 'La respuesta del Apps Script no es JSON.', pista: String(got.texto).trim().slice(0, 160) };
      }
    }
    // El Web App contesta 200 siempre y pone el resultado en el cuerpo: el éxito
    // se lee de `ok`, jamás del código HTTP.
    if (!fallo && (!json || json.ok !== true)) {
      fallo = { codigo: (json && json.codigo) || 'ERROR',
        mensaje: (json && json.error) || 'El Apps Script rechazó la petición.',
        pestanas: (json && json.pestanas) || undefined };
    }
    if (!fallo) break;
    if (!TRANSITORIOS.includes(fallo.codigo)) break;
    if (intentos >= INTENTOS_MAX) break;
    // 🔒 No se insiste sin presupuesto: un reintento que no cabe cambia un error
    // legible por un 504 pelón, que es justo el que nos trajo aquí.
    if (MS_PRESUPUESTO - (Date.now() - t0) < MS_MINIMO_OTRO) break;
    await esperar(MS_PAUSA);
  }

  if (fallo) {
    return { ok: false, codigo: fallo.codigo,
      // Que se reintentó se DICE. «Falló» y «falló dos veces con pausa en medio»
      // mandan a revisar cosas distintas.
      mensaje: fallo.mensaje + (intentos > 1 ? ' · Se reintentó ' + intentos + ' veces y Google no se recuperó.' : ''),
      pista: fallo.pista, pestanas: fallo.pestanas, intentos };
  }

  if (!pestana) {
    return { ok: true, pestanas: Array.isArray(json.pestanas) ? json.pestanas : [], leido_en: json.leido_en, intentos };
  }

  const filas = Array.isArray(json.filas) ? json.filas : null;
  if (!filas) {
    return { ok: false, codigo: 'SIN_FILAS', mensaje: 'El Apps Script no devolvió filas para "' + pestana + '".' };
  }

  if (FUENTES[fuente || 'pestanas'].exigeEncabezado === false) {
    return { ok: true, pestana, filas, n_filas: filas.length, encabezado: null,
             // [CAREO-ZONA-1] El color viaja TAL CUAL: cuántas celdas rojas tiene
             // cada fila, y si los colores se pudieron leer. Este lib no decide
             // quién está cancelado — lo pasa.
             rojas: Array.isArray(json.rojas) ? json.rojas : null,
             colores_leidos: json.colores_leidos === true,
             fuente: fuente || 'pestanas',
             pestanas: Array.isArray(json.pestanas) ? json.pestanas : [], leido_en: json.leido_en, intentos };
  }

  const encabezado = buscarEncabezado(filas);
  if (!encabezado) {
    return { ok: false, codigo: 'SIN_ENCABEZADO',
      mensaje: 'La pestaña "' + pestana + '" no tiene una celda "' + CELDA_ENCABEZADO + '" en sus primeras '
             + MAX_FILAS_ENCABEZADO + ' filas: o no es una pestaña de viajeros, o le cambiaron el encabezado.',
      primeras_filas: filas.slice(0, 3) };
  }

  return { ok: true, pestana, filas, n_filas: filas.length, encabezado,
           // [CAREO-ZONA-1] idem: el hecho del color, sin interpretar.
           rojas: Array.isArray(json.rojas) ? json.rojas : null,
           colores_leidos: json.colores_leidos === true,
           pestanas: Array.isArray(json.pestanas) ? json.pestanas : [], leido_en: json.leido_en, intentos };
}

module.exports = { cosechar, buscarEncabezado, pareceHtml, leerEnv, FUENTES,
                   CELDA_ENCABEZADO, MAX_FILAS_ENCABEZADO,
                   // [COSECHA-REDIRECT-1] El arnés carea la cura, no la copia.
                   esLaMismaPuerta, unIntento, TRANSITORIOS,
                   MAX_SALTOS, MS_PRESUPUESTO, MS_MINIMO_OTRO, MS_PAUSA, INTENTOS_MAX };
