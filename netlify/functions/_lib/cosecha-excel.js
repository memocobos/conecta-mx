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
    comoSePone: 'Se ponen al desplegar el Apps Script desde el Excel de las chicas (ver apps-script/excel-cosechador.gs).',
  },
  numerologia: {
    url: 'NUMEROLOGIA_SCRIPT_URL', token: 'NUMEROLOGIA_SCRIPT_TOKEN',
    comoSePone: 'Se ponen al desplegar el MISMO apps-script/excel-cosechador.gs una SEGUNDA vez, ahora desde el Excel «Numerología» de Memo, y guardar su /exec y su token con estos nombres.',
  },
};

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

  let r, texto;
  try {
    r = await _fetch(env.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: env.token, pestana: pestana || '' }),
      redirect: 'follow',
    });
    texto = await r.text();
  } catch (e) {
    return { ok: false, codigo: 'SIN_RESPUESTA',
      // El mensaje nombra LA VAR DE ESTA FUENTE. Decir «revisa EXCEL_SCRIPT_URL»
      // cuando la que falló es la de Numerología manda a arreglar lo que no
      // está roto — el mismo pecado que esta lib lleva evitando desde 1a.
      mensaje: 'No se pudo hablar con el Apps Script (' + (e && e.message) + '). Revisa que ' + nombreVar + ' siga viva.' };
  }

  if (pareceHtml(texto)) {
    return { ok: false, codigo: 'NO_ES_JSON',
      mensaje: 'Google contestó una PÁGINA, no datos. Casi siempre es el despliegue: la implementación tiene que ser "Ejecutar como: yo" y "Acceso: cualquier persona". Abre la URL /exec en el navegador — debe decir SIN_TOKEN.',
      pista: String(texto).trim().slice(0, 160) };
  }

  let json;
  try { json = JSON.parse(texto); }
  catch (e) {
    return { ok: false, codigo: 'NO_ES_JSON',
      mensaje: 'La respuesta del Apps Script no es JSON.', pista: String(texto).trim().slice(0, 160) };
  }

  // El Web App contesta 200 siempre y pone el resultado en el cuerpo: el éxito
  // se lee de `ok`, jamás del código HTTP.
  if (!json || json.ok !== true) {
    return { ok: false, codigo: (json && json.codigo) || 'ERROR',
      mensaje: (json && json.error) || 'El Apps Script rechazó la petición.',
      pestanas: (json && json.pestanas) || undefined };
  }

  if (!pestana) {
    return { ok: true, pestanas: Array.isArray(json.pestanas) ? json.pestanas : [], leido_en: json.leido_en };
  }

  const filas = Array.isArray(json.filas) ? json.filas : null;
  if (!filas) {
    return { ok: false, codigo: 'SIN_FILAS', mensaje: 'El Apps Script no devolvió filas para "' + pestana + '".' };
  }

  const encabezado = buscarEncabezado(filas);
  if (!encabezado) {
    return { ok: false, codigo: 'SIN_ENCABEZADO',
      mensaje: 'La pestaña "' + pestana + '" no tiene una celda "' + CELDA_ENCABEZADO + '" en sus primeras '
             + MAX_FILAS_ENCABEZADO + ' filas: o no es una pestaña de viajeros, o le cambiaron el encabezado.',
      primeras_filas: filas.slice(0, 3) };
  }

  return { ok: true, pestana, filas, n_filas: filas.length, encabezado,
           pestanas: Array.isArray(json.pestanas) ? json.pestanas : [], leido_en: json.leido_en };
}

module.exports = { cosechar, buscarEncabezado, pareceHtml, leerEnv, FUENTES,
                   CELDA_ENCABEZADO, MAX_FILAS_ENCABEZADO };
