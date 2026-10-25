#!/usr/bin/env node
/* [KAIO-CABINA-1 · 24-oct-2026] LA CABINA DE TRANSMISIÓN.
 * Tres mitades: [A] las funciones PURAS del uplink rebanadas del front y
 * corridas en vm · [B] el ENCODER REAL (vendor/lame.min.js) codificando de
 * verdad — el control del instrumento: si el careo no produce frames MP3, la
 * cabina de Memo tampoco — · [C] el handler REAL con red falsa que respeta
 * filtros y guarda estado (Supabase + storage + AzuraCast).
 * ⚠️ SIN ANCLA (árbol de trabajo). Lo que este careo NO puede medir y queda
 * DICHO: la conexión webcast contra el AzuraCast vivo — esa la prueba Memo
 * conectándose, con el Web DJ nativo como plan B si el protocolo difiere. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');

process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
process.env.AZURACAST_API_KEY = 'az-falsa';
process.env.JWT_SECRET = 'secreto-del-arnes';

let ok = 0, ko = 0;
const af = (c, m) => { try { c = typeof c === 'function' ? c() : c; } catch (e) { c = false; m += ' · EXC: ' + e.message; } if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

console.log('[A] las puras del uplink, rebanadas del front');
const js = fs.readFileSync(path.join(RAIZ, 'kamehouse-radio.js'), 'utf8');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(js.slice(js.indexOf('function cabinaWsUrl'), js.indexOf('function cabCtx')), ctx, { filename: 'cabina-puras.js' });
const run = (e) => vm.runInContext(e, ctx);

af(run('cabinaWsUrl()') === 'wss://radio.conectareynosa.mx/webdj/radioconecta/', 'la URL del webcast usa el MISMO shortcode del nowplaying (radioconecta) — una estación, un nombre');
const hello = run("cabinaHello('memo', 'secreta123', 48000)");
af(hello.type === 'hello' && hello.data.mime === 'audio/mpeg' && hello.data.user === 'memo' && hello.data.password === 'secreta123', 'el hello lleva mime y las credenciales del locutor (sin ellas AzuraCast rechaza)');
af(hello.data.audio.samplerate === 48000 && hello.data.audio.channels === 2 && hello.data.audio.bitrate === 192, 'y la ficha del audio viaja con el sampleRate REAL del contexto, no uno tecleado');
const i16 = run('cabF32aI16(new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]))');
af(i16[0] === 0 && i16[3] === 32767 && i16[4] === -32768 && i16[5] === 32767 && i16[6] === -32768, 'float→int16 con CLAMP: un pico >1.0 satura en vez de dar la vuelta (el wrap suena a estática)');
af(run('cabMMSS(0)') === '0:00' && run('cabMMSS(65)') === '1:05' && run('cabMMSS(3601)') === '60:01', 'el reloj habla mm:ss');
// [KAIO-CABINA-6] la metadata del show — sin ella AzuraCast repite la última
// canción del AutoDJ y la web pública se queda con el álbum viejo (Memo).
const md1 = run("cabinaMetadata({ ok: true, al_aire: { nombre: 'La Hora del Rock', conductor: 'Memo Cobos' } }, 'memo')");
af(md1.type === 'metadata' && md1.data.title === 'La Hora del Rock' && md1.data.artist === 'Memo Cobos', '[KC-6] con programa al aire, la metadata dice EL SHOW de la parrilla (nombre + conductor)');
const md2 = run("cabinaMetadata(null, 'memo')");
af(md2.type === 'metadata' && md2.data.title === 'Transmisión en vivo' && md2.data.artist === 'memo', '[KC-6] sin parrilla legible, metadata genérica con el locutor — la cartelera caída jamás frena el aire ni inventa un show');
// [KAIO-CABINA-7] los efectos de voz: apagado = parámetros NEUTROS (la cadena
// jamás se reconecta en vivo — reconectar mete clicks al aire).
const fx0 = run('cabFxParams({})');
af(fx0.comp.ratio === 1 && fx0.comp.threshold === 0 && fx0.hpFreq === 10 && fx0.lpFreq === 20000 && fx0.ecoWet === 0, '[KC-7] todo apagado = cadena NEUTRA (ratio 1, filtros abiertos, eco 0): el mic pasa intacto');
const fx1 = run('cabFxParams({ locutor: true, radio: true, eco: 0.3 })');
af(fx1.comp.ratio === 3 && fx1.comp.threshold === -24 && fx1.hpFreq === 300 && fx1.lpFreq === 3400 && fx1.ecoWet === 0.3, '[KC-7] prendidos: compresor de broadcast, pasa-banda 300-3400 (voz de radio) y eco al nivel pedido');
af(run('cabFxParams({ eco: 9 })').ecoWet === 0.5 && run('cabFxParams({ eco: -1 })').ecoWet === 0, '[KC-7] el eco CLAMPA a [0, 0.5] — más de 0.5 se come la voz y un negativo no existe');

console.log('\n[B] el ENCODER de verdad (vendor/lame.min.js) — control del instrumento');
const lctx = {}; lctx.window = lctx; vm.createContext(lctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'vendor/lame.min.js'), 'utf8'), lctx, { filename: 'lame.min.js' });
af(typeof lctx.lamejs === 'function' && typeof lctx.lamejs.Mp3Encoder === 'function', 'lamejs expone Mp3Encoder tal como el front lo invoca (new lamejs.Mp3Encoder)');
const enc = new lctx.lamejs.Mp3Encoder(2, 44100, 192);
const onda = new Int16Array(4096); for (let i = 0; i < onda.length; i++) onda[i] = Math.round(Math.sin(i / 10) * 12000);
const frame = enc.encodeBuffer(onda, onda);
const cola = enc.flush();
af(frame.length > 0 && (frame[0] & 0xff) === 0xff, 'encodeBuffer produce frames MP3 reales (primer byte = sync 0xFF) — si esto no codifica, la cabina tampoco');
af(cola.length > 0, 'y flush suelta la cola al cortar (sin él, el último medio segundo se pierde)');

console.log('\n[C] el handler REAL, por la puerta');
// Red falsa con ESTADO y FILTROS (las 4 leyes de la base de mentira).
const SAMPLERS = [];
const OBJETOS = {};
const STREAMERS = [{ id: 5, streamer_username: 'memo', display_name: 'Memo al aire', is_active: true, streamer_password: 'NUNCA-DEBE-VIAJAR' }];
const MP3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33]), Buffer.alloc(900, 7)]);           // ID3 → mp3
const CANCION_CHICA = Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.alloc(200000, 3)]);    // frame sync
// [KAIO-CABINA-2] La MEDIANA mide 9 MB = 3 rebanadas (4+4+1) — el caso de Memo
// (11.3 MB rebotada) a escala; cada byte lleva su posición para carear que la
// concatenación no revuelva rebanadas. La ENORME (26 MB) rebota el tope TOTAL.
const CANCION_MEDIANA = (() => { const b = Buffer.alloc(9 * 1024 * 1024); b[0] = 0xff; b[1] = 0xfb; for (let i = 2; i < b.length; i++) b[i] = i % 251; return b; })();
const CANCION_ENORME = Buffer.alloc(26 * 1024 * 1024, 9);
function redNueva() {
  const st = { deletes: 0, djsOn: false, adminOk: true, restarts: 0, disconnects: 0 };
  st.fetch = async (url, init) => {
    const U = String(url); const met = ((init || {}).method || 'GET').toUpperCase();
    const resp = (s, b, bin, hdrs) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), arrayBuffer: async () => bin,
      headers: { get: (k) => (hdrs && hdrs[String(k).toLowerCase()]) || null } });
    if (U.includes('/storage/v1/object/radio-samplers/')) {
      const p = U.split('/storage/v1/object/radio-samplers/')[1];
      if (met === 'POST') { OBJETOS[p] = (init.body && init.body.length) || 0; return resp(200, { Key: p }); }
      if (met === 'DELETE') { delete OBJETOS[p]; return resp(200, {}); }
    }
    if (U.includes('/rest/v1/usuarios') && met === 'GET') {
      const m = decodeURIComponent(U).match(/id=eq\.([\w-]+)/);
      const us = { 'u-memo': { id: 'u-memo', rol: 'maestro_roshi', activo: true }, 'u-b': { id: 'u-b', rol: 'bulma', activo: true } };
      return resp(200, m && us[m[1]] ? [us[m[1]]] : []);
    }
    if (U.includes('sesion')) throw new Error('sesion-viva apagada (fail-open)');
    if (U.includes('/rest/v1/radio_samplers')) {
      const m = decodeURIComponent(U).match(/id=eq\.([\w-]+)/);
      if (met === 'GET') {
        let filas = m ? SAMPLERS.filter((x) => x.id === m[1]) : SAMPLERS;
        if (U.includes('archivado=is.false')) filas = filas.filter((x) => !x.archivado);
        return resp(200, filas);
      }
      if (met === 'POST') { const fila = { id: '00000000-0000-4000-8000-00000000000' + (SAMPLERS.length + 1), archivado: false, ...JSON.parse(init.body) }; SAMPLERS.push(fila); return resp(201, [fila]); }
      if (met === 'PATCH') { const f = SAMPLERS.find((x) => x.id === (m && m[1])); if (!f) return resp(200, []); Object.assign(f, JSON.parse(init.body)); return resp(200, [f]); }
      if (met === 'DELETE') { st.deletes++; const i = SAMPLERS.findIndex((x) => x.id === (m && m[1])); if (i < 0) return resp(200, []); return resp(200, [SAMPLERS.splice(i, 1)[0]]); }
    }
    if (U.includes('radio.conectareynosa.mx/api/station/1/streamers')) {
      if (met === 'GET') return resp(200, STREAMERS);
      if (met === 'POST') {
        // [KAIO-CABINA-2] El AzuraCast de Memo nació con los DJs APAGADOS:
        // así contestó en su primera prueba, literal.
        if (!st.djsOn) return resp(500, { code: 500, type: 'StationUnsupportedException', message: 'This station does not currently support this functionality.' });
        const b = JSON.parse(init.body); const s = { id: 9 + STREAMERS.length, ...b }; STREAMERS.push(s); return resp(200, s);
      }
    }
    if (U.includes('radio.conectareynosa.mx/api/admin/station/1') && met === 'PUT') {
      if (!st.adminOk) return resp(403, {});
      if (JSON.parse(init.body).enable_streamers === true) st.djsOn = true;
      return resp(200, {});
    }
    if (U.includes('radio.conectareynosa.mx/api/station/1/restart') && met === 'POST') { st.restarts++; return resp(200, {}); }
    if (U.includes('radio.conectareynosa.mx/api/station/1/backend/disconnect') && met === 'POST') { st.disconnects++; return resp(200, {}); }
    if (U.includes('radio.conectareynosa.mx/api/station/1/streamer/') && met === 'DELETE') {
      const id = Number(U.split('/streamer/')[1]);
      const i = STREAMERS.findIndex((s) => s.id === id);
      if (i < 0) return resp(404, {});
      STREAMERS.splice(i, 1);
      return resp(200, {});
    }
    if (U.includes('/files/download')) {
      const f = decodeURIComponent((U.split('file=')[1] || '').split('&')[0]);
      const entero = (buf) => resp(200, null, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
      if (f === 'rock/chica.mp3') return entero(CANCION_CHICA);
      // mediana.mp3 HONRA el Range (206 + content-range); mediana-sinrange.mp3 lo
      // ignora y manda todo (200) — los DOS servidores existen, el handler aguanta ambos.
      if (f === 'rock/mediana.mp3') {
        const m = String(((init || {}).headers || {}).Range || '').match(/bytes=(\d+)-(\d+)/);
        if (m) {
          const d = Number(m[1]); const h = Math.min(Number(m[2]), CANCION_MEDIANA.length - 1);
          const reb = CANCION_MEDIANA.slice(d, h + 1);
          return resp(206, null, reb.buffer.slice(reb.byteOffset, reb.byteOffset + reb.length),
            { 'content-range': `bytes ${d}-${h}/${CANCION_MEDIANA.length}` });
        }
        return entero(CANCION_MEDIANA);
      }
      if (f === 'rock/mediana-sinrange.mp3') return entero(CANCION_MEDIANA);
      if (f === 'rock/enorme.mp3') return entero(CANCION_ENORME);
      return resp(404, {});
    }
    return resp(404, {});
  };
  return st;
}
function H() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return { h: require(path.join(RAIZ, 'netlify/functions/admin-radio-cabina.js')).handler,
           jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign };
}
const ev = (body, tok) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });

(async function main() {
  const red = redNueva(); global.fetch = red.fetch;
  const { h, jwtSign } = H();
  const roshi = jwtSign({ id: 'u-memo', rol: 'maestro_roshi' }, process.env.JWT_SECRET, 3600);
  const bulma = jwtSign({ id: 'u-b', rol: 'bulma' }, process.env.JWT_SECRET, 3600);

  let r = await h(ev({ accion: 'samplers_listar' }, bulma));
  af(r.statusCode === 403, 'la cabina es SOLO de Memo: bulma rebota 403');

  // Soundboard
  const B64_MP3 = 'data:audio/mpeg;base64,' + MP3.toString('base64');
  r = await h(ev({ accion: 'sampler_crear', nombre: 'Risas', color: '#e8ff4c', audio_b64: B64_MP3 }, roshi));
  let b = JSON.parse(r.body);
  af(r.statusCode === 200 && b.sampler && /radio-samplers\/samplers\//.test(b.sampler.audio_url), 'un MP3 de verdad (magia de bytes ID3) sube al bucket y nace el sampler');
  r = await h(ev({ accion: 'sampler_crear', nombre: 'Texto disfrazado', audio_b64: Buffer.from('soy un txt con nombre .mp3').toString('base64') }, roshi));
  af(r.statusCode === 400 && /bytes/.test(JSON.parse(r.body).error), '🔒 lo que no es MP3/WAV/OGG por sus BYTES se rechaza DICIÉNDOLO — y sin audio no nace fila (el audio ES el sampler)');
  af(SAMPLERS.length === 1 && Object.keys(OBJETOS).length === 1, 'tras el rechazo: 1 sampler, 1 objeto — nada quedó a medias');
  r = await h(ev({ accion: 'sampler_crear', nombre: 'Gigante', audio_b64: Buffer.concat([Buffer.from([0x49, 0x44, 0x33]), Buffer.alloc(3.6 * 1024 * 1024)]).toString('base64') }, roshi));
  af(r.statusCode === 400 && /3\.5 MB/.test(JSON.parse(r.body).error), 'el tope de 3.5 MB se DICE con el tamaño (un tope mudo se lee como «no existe»)');

  const id1 = SAMPLERS[0].id;
  const urlVieja = SAMPLERS[0].audio_url;
  r = await h(ev({ accion: 'sampler_editar', id: id1, nombre: 'Risas fuertes', audio_b64: B64_MP3 }, roshi));
  af(r.statusCode === 200 && SAMPLERS[0].nombre === 'Risas fuertes' && SAMPLERS[0].audio_url !== urlVieja, 'editar cambia nombre Y reemplaza el audio («poder cambiar esos audios» — palabra de Memo)');
  af(Object.keys(OBJETOS).length === 1, 'y el audio VIEJO se barre del bucket: cero huérfanos');
  r = await h(ev({ accion: 'sampler_eliminar', id: id1 }, roshi));
  af(r.statusCode === 400 && SAMPLERS.length === 1 && red.deletes === 0, '🔒 eliminar SIN confirmar:true → 400 con cero escrituras');
  r = await h(ev({ accion: 'sampler_eliminar', id: id1, confirmar: true }, roshi));
  af(r.statusCode === 200 && SAMPLERS.length === 0 && Object.keys(OBJETOS).length === 0, 'con confirmar la fila se va Y su audio también (contenido, no dinero)');

  // Música del catálogo — [KAIO-CABINA-2] baja por REBANADAS, como el front
  async function bajar(ruta) {
    const pedazos = []; let desde = 0, total = 0, llamadas = 0, mime = null;
    for (let i = 0; i < 12; i++) {
      const rr = await h(ev({ accion: 'cancion_descargar', ruta, desde }, roshi));
      const jj = JSON.parse(rr.body);
      if (rr.statusCode !== 200) return { statusCode: rr.statusCode, j: jj, llamadas };
      llamadas++;
      if (desde === 0) mime = jj.mime;
      const buf = Buffer.from(jj.b64, 'base64');
      pedazos.push(buf); total = jj.bytes_total; desde += buf.length;
      if (jj.completo) break;
    }
    return { statusCode: 200, buf: Buffer.concat(pedazos), total, llamadas, mime };
  }
  let d = await bajar('rock/chica.mp3');
  af(d.statusCode === 200 && d.llamadas === 1 && d.mime === 'audio/mpeg' && d.buf.equals(CANCION_CHICA), 'una canción chica baja en UNA llamada con su mime por bytes');
  d = await bajar('rock/mediana.mp3');
  af(d.statusCode === 200 && d.llamadas === 3 && d.total === CANCION_MEDIANA.length && d.buf.equals(CANCION_MEDIANA), '🔒 el caso de Memo (11.3 MB rebotada): una canción de 9 MB baja por 3 REBANADAS y la concatenación es BYTE A BYTE el archivo (servidor que honra Range)');
  d = await bajar('rock/mediana-sinrange.mp3');
  af(d.statusCode === 200 && d.llamadas === 3 && d.buf.equals(CANCION_MEDIANA), 'y con un servidor que IGNORA el Range, el handler rebana él mismo: mismo resultado byte a byte');
  r = await h(ev({ accion: 'cancion_descargar', ruta: 'rock/mediana.mp3', desde: 4194304 }, roshi));
  b = JSON.parse(r.body);
  af(r.statusCode === 200 && b.mime === undefined && b.desde === 4194304, 'el mime solo se afirma en la rebanada 0 — la magia de bytes vive al INICIO del archivo');
  r = await h(ev({ accion: 'cancion_descargar', ruta: 'rock/enorme.mp3' }, roshi));
  b = JSON.parse(r.body);
  af(r.statusCode === 413 && /26\.0 MB/.test(b.error) && /archivo local/.test(b.error), '🔒 el tope que queda es TOTAL (25 MB, por los 10 s de Netlify) y se DICE con el tamaño y el camino alterno');
  r = await h(ev({ accion: 'cancion_descargar', ruta: '../etc/passwd' }, roshi));
  af(r.statusCode === 400, 'una ruta con .. se rechaza en la puerta');

  // Locutores — [KAIO-CABINA-2] el AzuraCast de Memo nació con los DJs APAGADOS
  r = await h(ev({ accion: 'streamers_listar' }, roshi));
  b = JSON.parse(r.body);
  af(r.statusCode === 200 && b.streamers.length === 1 && b.streamers[0].usuario === 'memo', 'los locutores se listan con usuario y nombre');
  af(!JSON.stringify(b).includes('NUNCA-DEBE-VIAJAR') && b.streamers[0].streamer_password === undefined, '🔒 NINGUNA contraseña viaja en la lista — aunque AzuraCast la mandara');
  r = await h(ev({ accion: 'streamer_crear', usuario: 'dj', contrasena: 'corta' }, roshi));
  af(r.statusCode === 400, 'usuario corto o contraseña <8 se rechazan con palabras');
  red.adminOk = false;
  r = await h(ev({ accion: 'streamer_crear', usuario: 'invitado1', contrasena: 'ochoexactos' }, roshi));
  b = JSON.parse(r.body);
  af(r.statusCode === 502 && /[Cc]amino manual/.test(b.error) && STREAMERS.length === 1 && red.djsOn === false, 'DJs apagados Y sin poder de admin → el error trae el CAMINO MANUAL del panel, nada se crea');
  red.adminOk = true;
  r = await h(ev({ accion: 'streamer_crear', usuario: 'invitado1', contrasena: 'ochoexactos', nombre: 'El Invitado' }, roshi));
  b = JSON.parse(r.body);
  af(r.statusCode === 200 && STREAMERS.length === 2 && red.djsOn === true && red.restarts === 1, '🔒 el caso de Memo (StationUnsupportedException): el handler ENCIENDE la puerta de DJs, reinicia la estación y reintenta — la cuenta nace');
  af(typeof b.nota === 'string' && /reinici/.test(b.nota), 'y la pantalla se entera: la nota DICE que la estación se reinició');
  r = await h(ev({ accion: 'streamer_crear', usuario: 'invitado2', contrasena: 'ochoexactos' }, roshi));
  b = JSON.parse(r.body);
  af(r.statusCode === 200 && STREAMERS.length === 3 && red.restarts === 1 && !b.nota, 'con la puerta ya abierta, crear otro NO reinicia nada ni avisa de más');
  r = await h(ev({ accion: 'streamer_eliminar', id: 11 }, roshi));
  af(r.statusCode === 400 && STREAMERS.length === 3, 'eliminar locutor también exige confirmar:true');
  r = await h(ev({ accion: 'streamer_eliminar', id: 11, confirmar: true }, roshi));
  af(r.statusCode === 200 && STREAMERS.length === 2, 'y con confirmar la cuenta se va');

  // [KAIO-CABINA-6] el corte avisado: backend/disconnect suelta al DJ al instante
  r = await h(ev({ accion: 'dj_desconectar' }, roshi));
  af(r.statusCode === 200 && red.disconnects === 1, '[KC-6] dj_desconectar le pega a backend/disconnect de AzuraCast — el corte suelta al DJ al instante en vez de esperar a que liquidsoap note el socket muerto (el banner pegado de /radio)');
  r = await h(ev({ accion: 'dj_desconectar' }, bulma));
  af(r.statusCode === 403 && red.disconnects === 1, '[KC-6] y sigue siendo SOLO de Memo: bulma rebota sin tocar la estación');

  // [KAIO-CABINA-7] el volumen POR SAMPLER vive en su fila (0–2)
  r = await h(ev({ accion: 'sampler_crear', nombre: 'Aplausos', audio_b64: B64_MP3 }, roshi));
  const idVol = JSON.parse(r.body).sampler.id;
  r = await h(ev({ accion: 'sampler_volumen', id: idVol, volumen: 1.5 }, roshi));
  af(r.statusCode === 200 && Number(SAMPLERS.find((s) => s.id === idVol).volumen) === 1.5, '[KC-7] el volumen del sampler se guarda EN SU FILA — vale en cualquier computadora, no en el navegador de una');
  r = await h(ev({ accion: 'sampler_volumen', id: idVol, volumen: 3 }, roshi));
  af(r.statusCode === 400 && /0 a 2/.test(JSON.parse(r.body).error) && Number(SAMPLERS.find((s) => s.id === idVol).volumen) === 1.5, '[KC-7] fuera de rango → 400 CON PALABRAS (no un 23514 pelado) y la fila no se mueve');
  r = await h(ev({ accion: 'sampler_volumen', id: idVol, volumen: 0.5 }, bulma));
  af(r.statusCode === 403 && Number(SAMPLERS.find((s) => s.id === idVol).volumen) === 1.5, '[KC-7] bulma rebota sin escribir: la cabina sigue siendo SOLO de Memo');

  // Estructura del front (lo que el vm no corre): la carga perezosa y el CSP.
  console.log('\n[D] los cables del front y el CSP');
  af(js.includes("s.src = '/vendor/lame.min.js'"), 'lamejs carga PEREZOSA desde /vendor/ (156 KB que solo paga quien transmite)');
  af(js.includes("new WebSocket(cabinaWsUrl(), 'webcast')"), 'el WS pide el subprotocolo webcast (sin él, AzuraCast no entiende el hello)');
  af(js.includes('_cb.buses.sam.connect(_cb.monitorGain)') && !/buses\.mic\.connect\(_cb\.monitorGain\)/.test(js), '🔒 el monitor toca samplers y música — el MIC jamás (se acopla con las bocinas)');
  af(js.includes("admin-radio-media?buscar="), 'la búsqueda de música es la de admin-radio-media — el catálogo tiene UN buscador, no se gemelea');
  af(js.includes("cancion_descargar', ruta, desde") && js.includes('j.completo'), '[KC-2] el front baja la canción en BUCLE de rebanadas hasta `completo`');
  af(js.includes("NotAllowedError") && /candado/.test(js) && /Privacidad y seguridad/.test(js), '[KC-2] el error del mic DICE el remedio: candado del navegador y Ajustes de macOS, por nombre de error');
  af(js.includes('if (j.nota) _cbMsg'), '[KC-2] si el servidor reinició la estación para abrir los DJs, la pantalla lo dice');
  // [KAIO-CABINA-3] — medido en la primera transmisión real: is_live=true y el
  // stream público con pico 0.0000 durante 12.7 s. El silencio al aire se DICE.
  af(js.includes('PURO SILENCIO') && js.includes('_cb.silencioDesde'), '[KC-3] el vigilante de SILENCIO al aire existe: ceros sostenidos con el WS vivo se gritan con remedio');
  af(js.includes('audio.deviceId = { exact: _cb.micDevice }'), '[KC-3] el micrófono se puede ELEGIR por deviceId exacto — el caso del track muerto de Chrome');
  af(js.includes("track.label") && js.includes("track.muted"), '[KC-3] el nombre del dispositivo capturado se DICE y un track muted se grita con el camino de macOS');
  af(js.includes('async function cabMicCambiar') && fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8').includes('id="cab-mic-sel"'), '[KC-3] el selector vive en la Mezcladora y cambiarlo re-captura en vivo');
  // [KAIO-CABINA-4] El mic-monitor es un canal APARTE: micMonitorGain, jamás el
  // monitorGain general (la aserción del monitor sin mic sigue arriba, intacta).
  // ⚠️ ACTUALIZADA EN KAIO-CABINA-7, con razón: el monitor del mic ya no bebe
  // de buses.mic sino de micOut (POST-efectos) — te oyes COMO SALES AL AIRE.
  af(js.includes('_cb.fx.micOut.connect(_cb.micMonitorGain)') && js.includes('function cabMicMonitor'), '[KC-4→7] el locutor oye SU VOZ al instante por un canal propio, y POST-efectos: lo que oyes es lo que sale');
  // [KAIO-CABINA-7] la cadena de efectos y el ducking
  af(js.includes('_cb.buses.mic.connect(_cb.fx.comp)') && js.includes('_cb.fx.micOut.connect(_cb.master)') && !js.includes('_cb.buses.mic.connect(_cb.master)'), '[KC-7] el mic SIEMPRE pasa por la cadena (comp→hp→lp→micOut) antes del master — apagar un efecto es parámetro neutro, no reconexión');
  af(!js.includes('micOut.connect(_cb.monitorGain)'), '[KC-7] micOut tampoco toca el monitor general: el candado del acople sigue entero con la cadena nueva');
  af(js.includes('_cb.buses.mus.connect(_cb.duckGain)') && js.includes('_cb.duckGain.connect(_cb.master)') && !/duckGain/.test(js.slice(js.indexOf('function cabVol'), js.indexOf('function cabMonitor'))), '[KC-7] el ducking es un gain APARTE en serie — jamás pisa el slider de música del usuario (cabVol no lo toca)');
  af(js.includes('_cb.duckTimer') && /clearInterval\(_cb\.duckTimer\)/.test(js), '[KC-7] el reloj del ducking tiene DUEÑO (_cb.duckTimer) y muere al apagar el checkbox — un huérfano seguiría bajando la música');
  af(js.includes('gv.gain.value') && js.includes('s.volumen'), '[KC-7] cada sampler suena con SU volumen de fila, encadenado al bus general (el slider de Samplers manda encima)');
  af(fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8').includes('id="cab-fx-locutor"') && fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8').includes('id="cab-duck"'), '[KC-7] los controles viven en la Mezcladora y nacen APAGADOS (sin efecto = default de forma, DEFAULTS-1)');
  // [KAIO-CABINA-6] los cables de la metadata y del corte avisado — se miden
  // las LLAMADAS literales, no palabras que un comentario pueda contener.
  af(js.includes("fetch('/.netlify/functions/radio-cartelera')") && js.includes('ws.send(JSON.stringify(cabinaMetadata(cart6, usuario)))'), '[KC-6] cabAire pide la parrilla y manda la METADATA del show por el webcast — la web pública deja de quedarse con la última canción del AutoDJ');
  af((() => { const iH = js.indexOf('ws.send(JSON.stringify(cabinaHello('); const iM = js.indexOf('ws.send(JSON.stringify(cabinaMetadata('); return iH > 0 && iM > iH; })(), '[KC-6] el hello viaja PRIMERO y la metadata después — al revés AzuraCast cierra la conexión');
  af(js.slice(js.indexOf('function cabCortar(')).includes("_cbApi({ accion: 'dj_desconectar' })"), '[KC-6] cabCortar AVISA a la estación (best-effort): sin esto el banner AL AIRE de /radio se queda pegado tras el corte');
  af(fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8').includes('SOLO con audífonos'), '[KC-4] el checkbox ADVIERTE lo de los audífonos — con bocinas se acopla');
  const csp = fs.readFileSync(path.join(RAIZ, 'netlify.toml'), 'utf8');
  af(/connect-src[^;]*wss:\/\/radio\.conectareynosa\.mx/.test(csp), 'el CSP deja salir el WebSocket del uplink (sin esto la cabina moriría muda en producción)');
  // [KAIO-CABINA-5] La Permissions-Policy del sitio vetaba el mic con microphone=()
  // (lista vacía = NADIE, por encima del permiso de Chrome): getUserMedia daba
  // NotAllowedError con el candado en "Permitir en cada visita" — medido en el
  // navegador de Memo (politica_permite_mic:false · permiso denied). Era la causa
  // de TODOS los "Permission denied" de la cabina, y de que la transmisión del
  // 25-oct saliera en silencio digital: el mic jamás se abrió en este sitio.
  // El hecho se mide sobre LA LÍNEA DEL HEADER, no sobre el archivo: el comentario
  // que explica el veto retirado CONTIENE "microphone=()" y un grep del archivo
  // entero se caza solo (ley de la casa — ya pasó aquí mismo, primer rojo de KC-5).
  const lineasPP = csp.split('\n').filter(l => /^\s*Permissions-Policy\s*=/.test(l));
  af(lineasPP.length === 1, '[KC-5] hay EXACTAMENTE un header Permissions-Policy (dos serían dos listas que divergen)');
  const pp = lineasPP[0] || '';
  af(/microphone=\(self\)/.test(pp), '[KC-5] la Permissions-Policy permite el mic AL PROPIO SITIO — sin esto la cabina muere con NotAllowedError aunque Chrome diga Permitir');
  af(!/microphone=\(\)/.test(pp), '[KC-5] el veto microphone=() (lista vacía) ya no está EN EL HEADER');
  af(/camera=\(\)/.test(pp) && /geolocation=\(\)/.test(pp) && /payment=\(\)/.test(pp), '[KC-5] cámara, geolocalización y pago SIGUEN vetados — solo se abrió lo que la cabina usa');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(html.includes('id="radio-tab-cabina"') && html.includes("showRadioTab('cabina'"), 'la pestaña Cabina existe y tiene botón');
  af(html.includes('value="">— elige tu cuenta de locutor —') , 'el selector de locutor nace VACÍO (DEFAULTS-1: con qué cuenta sales al aire es una atribución)');

  console.log('\n' + (ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
  process.exit(ko ? 1 : 0);
})();
