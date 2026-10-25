#!/usr/bin/env node
/* [KAIO-V3 · 25-oct-2026] KAIO-SAMA V3: el panel EN VIVO de la cabina, el
 * acomodo de la música (mover/mkdir/subir) y el centro de control.
 * [A] el handler REAL de admin-radio-media contra una red falsa de AzuraCast
 *     que exige LAS FORMAS MEDIDAS en el servidor real el 25-oct (capturadas
 *     de su propia UI con la sesión de Memo): files/batch con el campo `dirs`
 *     —NO `directories`, el dedazo que habría muerto en silencio— y
 *     files/mkdir {currentDirectory, name}.
 * [B] los cables del front, medidos sobre el fuente (hechos, no palabras).
 * ⚠️ SIN ANCLA (árbol de trabajo, como mide:kaio-cabina-1): mide lo que acabas
 * de escribir y no puede traer control positivo por commit — dicho aquí.
 * ⚠️ Lo que NO puede medir y queda DICHO: mover/mkdir/subir contra el
 * AzuraCast VIVO van con la API key (sin CSRF) — la primera corrida real la
 * hace Memo desde la Biblioteca; un 502 ahí trae el detalle del server. */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

process.env.AZURACAST_API_KEY = 'az-falsa';
process.env.RADIO_EDITOR_KEY = 'editor-falso';
process.env.JWT_SECRET = 'secreto-del-arnes';
// ⚠️ SUPABASE_URL_KAMEHOUSE se deja SIN poner A PROPÓSITO: con una URL falsa el
// guard de sesión-viva le PEGA a la red falsa (404 → fail-open) y esa llamada
// rompe los casos «rebota 400 SIN pegarle a la red». Sin la var, el guard hace
// fail-open sin red — el log «[sesion-viva] FAIL-OPEN» en la consola es ruido
// esperado, no un defecto. Ya se pagó una vez: callar el log puso 3 rojos.

let ok = 0, ko = 0;
const af = (c, m) => { try { c = typeof c === 'function' ? c() : c; } catch (e) { c = false; m += ' · EXC: ' + e.message; } if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

// ── Red falsa de AzuraCast: registra MÉTODO, RUTA y BODY de cada llamada ─────
function redNueva() {
  const st = { llamadas: [] };
  st.fetch = async (url, init) => {
    const U = String(url), m = ((init || {}).method || 'GET').toUpperCase();
    let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}
    st.llamadas.push({ m, u: U, body });
    const resp = (s, o) => ({ ok: s < 400, status: s, json: async () => o, text: async () => JSON.stringify(o) });
    if (U.includes('/files/batch')) return resp(200, { success: true });
    if (U.includes('/files/mkdir')) return resp(200, { success: true });
    if (U.endsWith('/api/station/1/files') && m === 'POST') return resp(200, { id: 999 });
    return resp(404, { error: 'ruta no esperada: ' + U });
  };
  return st;
}
function H() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return { h: require(path.join(RAIZ, 'netlify/functions/admin-radio-media.js')).handler,
           jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign };
}
const ev = (body, tok) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });

// Un MP3 de mentira con magia REAL (tag ID3) — el tipo se decide por bytes.
const MP3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]), Buffer.alloc(900, 7)]);

(async function main() {
  console.log('[A] admin-radio-media: mover · mkdir · subir (handler real, formas MEDIDAS)');
  const red = redNueva(); global.fetch = red.fetch;
  const { h, jwtSign } = H();
  const roshi = jwtSign({ id: 'u-memo', rol: 'maestro_roshi' }, process.env.JWT_SECRET, 3600);
  const bulma = jwtSign({ id: 'u-b', rol: 'bulma' }, process.env.JWT_SECRET, 3600);

  // mover — la forma del server real, campo por campo
  let r = await h(ev({ accion: 'mover', ruta: 'Mix/cancion.mp3', destino: 'Bad Bunny' }, roshi));
  let llamada = red.llamadas.filter(c => c.m !== 'GET').slice(-1)[0] || {};
  af(r.statusCode === 200 && JSON.parse(r.body).ok === true, 'mover contesta ok');
  af(llamada.m === 'PUT' && /\/api\/station\/1\/files\/batch$/.test(llamada.u), 'mover le pega a PUT files/batch (método y ruta MEDIDOS en el AzuraCast real)');
  af(() => { const b = llamada.body; return b && b.do === 'move' && b.directory === 'Bad Bunny' && Array.isArray(b.dirs) && b.dirs.length === 0 && Array.isArray(b.files) && b.files[0] === 'Mix/cancion.mp3' && b.currentDirectory === ''; },
    '🔒 el body habla la forma CAPTURADA: do/currentDirectory/directory/files/`dirs` — el campo es dirs, NO directories (el dedazo que habría muerto mudo)');
  const antes = red.llamadas.length;
  r = await h(ev({ accion: 'mover', ruta: 'Mix/cancion.mp3', destino: '../fuera' }, roshi));
  af(r.statusCode === 400 && red.llamadas.length === antes, 'un destino con .. rebota 400 SIN pegarle a la red');
  r = await h(ev({ accion: 'mover', ruta: 'Mix/cancion.mp3', destino: '' }, roshi));
  af(r.statusCode === 200, 'destino \'\' = la raíz, y es válido a propósito');

  // mkdir — SIN `ruta` en el body (la excepción a la guarda global existe para esto)
  r = await h(ev({ accion: 'mkdir', carpeta: '', nombre: 'Artista Nuevo' }, roshi));
  llamada = red.llamadas.filter(c => c.m !== 'GET').slice(-1)[0] || {};
  af(r.statusCode === 200 && JSON.parse(r.body).ruta === 'Artista Nuevo', 'mkdir SIN `ruta` en el body pasa la puerta (la guarda global lo exceptúa — con ella viva daba 400) y devuelve la ruta nueva');
  af(llamada.m === 'POST' && /\/files\/mkdir$/.test(llamada.u) && llamada.body && llamada.body.currentDirectory === '' && llamada.body.name === 'Artista Nuevo',
    'y habla la forma MEDIDA: POST files/mkdir {currentDirectory, name}');
  const antes2 = red.llamadas.length;
  r = await h(ev({ accion: 'mkdir', carpeta: '', nombre: 'con/diagonal' }, roshi));
  af(r.statusCode === 400 && red.llamadas.length === antes2, 'un nombre con / rebota 400 sin red: es UNA carpeta, no una ruta');

  // subir — magia de bytes del DUEÑO + tope de 4 MB DICHO
  r = await h(ev({ accion: 'subir', ruta: 'Artista Nuevo/tema.mp3', archivo: MP3.toString('base64') }, roshi));
  llamada = red.llamadas.filter(c => c.m !== 'GET').slice(-1)[0] || {};
  af(r.statusCode === 200 && llamada.m === 'POST' && /\/api\/station\/1\/files$/.test(llamada.u) && llamada.body && llamada.body.path === 'Artista Nuevo/tema.mp3' && typeof llamada.body.file === 'string',
    'subir un MP3 real (magia ID3) → POST files {path, file}');
  const antes3 = red.llamadas.length;
  r = await h(ev({ accion: 'subir', ruta: 'X/t.mp3', archivo: Buffer.from('soy texto con nombre mp3').toString('base64') }, roshi));
  af(r.statusCode === 400 && /bytes/.test(JSON.parse(r.body).error) && red.llamadas.length === antes3, 'lo que no es audio POR SUS BYTES se rechaza diciéndolo, sin red');
  r = await h(ev({ accion: 'subir', ruta: 'X/t.mp3', archivo: Buffer.concat([Buffer.from([0x49, 0x44, 0x33]), Buffer.alloc(4.2 * 1024 * 1024)]).toString('base64') }, roshi));
  af(r.statusCode === 400 && /4 MB/.test(JSON.parse(r.body).error) && /AzuraCast/.test(JSON.parse(r.body).error), 'el tope de 4 MB se DICE con el camino alterno (el gestor de AzuraCast)');
  r = await h(ev({ accion: 'mover', ruta: 'Mix/c.mp3', destino: 'X' }, bulma));
  af(r.statusCode === 403, 'la biblioteca sigue siendo SOLO de Memo: bulma rebota');

  console.log('\n[B] los cables del front (hechos sobre el fuente)');
  const js = fs.readFileSync(path.join(RAIZ, 'kamehouse-radio.js'), 'utf8');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  const toml = fs.readFileSync(path.join(RAIZ, 'netlify.toml'), 'utf8');
  const media = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-radio-media.js'), 'utf8');
  const cabina = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-radio-cabina.js'), 'utf8');

  // La magia de bytes tiene UN dueño
  af(/require\('\.\/_lib\/audio-magia'\)/.test(media) && /require\('\.\/_lib\/audio-magia'\)/.test(cabina), 'la magia de audio la PIDEN los dos endpoints a _lib/audio-magia');
  af(!/function\s+tipoAudio/.test(media) && !/function\s+tipoAudio/.test(cabina), 'y ninguno declara la suya: dos copias serían dos listas que todavía no divergen');

  // Panel EN VIVO de la cabina
  af(html.includes('id="cab-pub-pet"') && html.includes('id="cab-pub-muro"') && html.includes('id="cab-pub-ding"'), '[V3a] el panel «Llegando del público» vive en la Cabina, con su campana');
  af((() => { const i = html.indexOf('id="cab-pub-ding"'); return i > 0 && !/checked/.test(html.slice(i, i + 80)); })(), 'la campana nace APAGADA (DEFAULTS-1)');
  af(js.includes('if (_cb.pubTimer) return') && /clearInterval/.test(js.slice(js.indexOf('function _cbOyentesStop'))) !== null, 'el latido del público tiene DUEÑO (_cb.pubTimer) y no se duplica al reabrir el tab');
  af(js.slice(js.indexOf('_cb.pubTimer = setInterval')).slice(0, 300).includes('document.hidden'), 'el tick se salta con la pestaña oculta — un panel de fondo no paga lecturas');
  af(js.includes("_cbPubStart();   // [KAIO-V3a]"), 'loadRadioCabina lo arranca');
  af(js.includes('await radioAtender(id, true)') && js.includes('await radioMuroVisible(id, visible)'), 'las acciones DELEGAN en los dueños existentes (radioAtender/radioMuroVisible) — cero segunda implementación del POST');
  af((() => { const d = js.slice(js.indexOf('function _cbDing'), js.indexOf('// ── Soundboard')); return d.includes('ctx.destination') && !d.includes('master') && !d.includes('buses'); })(), '🔒 el ding va DIRECTO a destination: jamás al master — nada que no sea la mezcla sale al aire');
  af(js.includes('const primera = !_cb.pubVistos') && js.includes('primera ? new Set()'), 'el primer tick SIEMBRA sin resaltar ni sonar: abrir la cabina no es que llegó algo');

  // Biblioteca: descarga con UN dueño, reproductor local, mover/subir
  af((js.match(/async function _radioBajarRuta/g) || []).length === 1, '[V3b] la descarga por rebanadas tiene UN dueño (_radioBajarRuta)');
  af((js.match(/_radioBajarRuta\(/g) || []).length >= 3, 'y lo llaman la cabina Y la biblioteca (2+ llamadores)');
  af((js.match(/cancion_descargar/g) || []).length === 1, 'el bucle de rebanadas vive UNA vez: cero bucles gemelos');
  af(/media-src 'self' blob:/.test(toml), '🔒 blob: está en media-src — sin él el reproductor local moría por CSP (la lección de REQ-FOTO-1, aplicada ANTES de que muerda)');
  af(js.includes('event.stopPropagation();bibEscuchar(') && js.includes('event.stopPropagation();bibMoverAbrir('), 'los botones ▶/📁 frenan la propagación: sin eso cada clic abriría también el editor');
  af((() => { const b = js.slice(js.indexOf('async function bibEscuchar'), js.indexOf('function bibEscucharCerrar')); return !b.includes('_cb.buses') && !b.includes('cabCtx'); })(), 'escuchar es LOCAL (<audio> propio): no pasa por el grafo de la cabina — no sale al aire');
  af(js.includes('URL.revokeObjectURL'), 'el blob viejo se revoca: una tarde de escuchas no acumula memoria');
  af((() => { const b = js.slice(js.indexOf('async function bibSubir'), js.indexOf('async function bibSubir') + 900); return b.includes('f.size > 4 * 1024 * 1024'); })(), 'subir rechaza >4 MB ANTES de leer el archivo (el server lo re-valida con palabras)');
  af(js.includes("_bibArtistas = null;   // la raíz cambió"), 'crear carpeta invalida el caché de la raíz: la carpeta nueva aparece sin recargar la página');
  af((() => { const b = js.slice(js.indexOf('function _bibToggleRaizUI')); return b.slice(0, 700).includes("_bibCrumbs.length"); })(), 'el bloque de subir solo vive DENTRO de una carpeta (en la raíz no hay «aquí»)');

  // Control y Números
  af(js.includes('_ctrlAireCargar();   // [KAIO-V3c]') && js.includes("fetch('/.netlify/functions/radio-cartelera')"), '[V3c] Control abre con «Al aire ahora» y la parrilla se le PREGUNTA al dueño público — ni un minuto de pared se re-calcula');
  af(html.includes('id="radio-ctrl-aire"') && /radioControlSaltar\(\)/.test(html.slice(html.indexOf('id="radio-ctrl-aire"'), html.indexOf('id="radio-ctrl-aire"') + 800)), 'con Saltar canción a la mano');
  af(js.includes('let _rnVivoTimer = null') && (() => { const b = js.slice(js.indexOf('_rnVivoTimer = setInterval'), js.indexOf('_rnVivoTimer = setInterval') + 400); return b.includes('document.hidden') && !b.includes('_rnOyentes'); })(), 'las tarjetas de Números LATEN solas (dueño _rnVivoTimer), solo las piezas baratas y nunca en fondo');

  console.log('\n' + (ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
  process.exit(ko ? 1 : 0);
})();
