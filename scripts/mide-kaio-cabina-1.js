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
const CANCION_GORDA = Buffer.alloc(Math.round(4.6 * 1024 * 1024), 9);
function redNueva() {
  const st = { deletes: 0 };
  st.fetch = async (url, init) => {
    const U = String(url); const met = ((init || {}).method || 'GET').toUpperCase();
    const resp = (s, b, bin) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), arrayBuffer: async () => bin });
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
      if (met === 'POST') { const b = JSON.parse(init.body); const s = { id: 9, ...b }; STREAMERS.push(s); return resp(200, s); }
    }
    if (U.includes('radio.conectareynosa.mx/api/station/1/streamer/') && met === 'DELETE') {
      const id = Number(U.split('/streamer/')[1]);
      const i = STREAMERS.findIndex((s) => s.id === id);
      if (i < 0) return resp(404, {});
      STREAMERS.splice(i, 1);
      return resp(200, {});
    }
    if (U.includes('/files/download')) {
      const f = decodeURIComponent(U.split('file=')[1] || '');
      if (f === 'rock/chica.mp3') return resp(200, null, CANCION_CHICA.buffer.slice(CANCION_CHICA.byteOffset, CANCION_CHICA.byteOffset + CANCION_CHICA.length));
      if (f === 'rock/gorda.mp3') return resp(200, null, CANCION_GORDA.buffer.slice(0, CANCION_GORDA.length));
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

  // Música del catálogo
  r = await h(ev({ accion: 'cancion_descargar', ruta: 'rock/chica.mp3' }, roshi));
  b = JSON.parse(r.body);
  af(r.statusCode === 200 && b.ok && b.mime === 'audio/mpeg' && Buffer.from(b.b64, 'base64').length === CANCION_CHICA.length, 'una canción chica baja entera en base64 con su mime por bytes');
  r = await h(ev({ accion: 'cancion_descargar', ruta: 'rock/gorda.mp3' }, roshi));
  b = JSON.parse(r.body);
  af(r.statusCode === 413 && /4\.6 MB/.test(b.error) && /archivo local/.test(b.error), '🔒 la canción que no cabe en el puente contesta 413 CON su tamaño y el camino alterno — no un 502 mudo');
  r = await h(ev({ accion: 'cancion_descargar', ruta: '../etc/passwd' }, roshi));
  af(r.statusCode === 400, 'una ruta con .. se rechaza en la puerta');

  // Locutores
  r = await h(ev({ accion: 'streamers_listar' }, roshi));
  b = JSON.parse(r.body);
  af(r.statusCode === 200 && b.streamers.length === 1 && b.streamers[0].usuario === 'memo', 'los locutores se listan con usuario y nombre');
  af(!JSON.stringify(b).includes('NUNCA-DEBE-VIAJAR') && b.streamers[0].streamer_password === undefined, '🔒 NINGUNA contraseña viaja en la lista — aunque AzuraCast la mandara');
  r = await h(ev({ accion: 'streamer_crear', usuario: 'dj', contrasena: 'corta' }, roshi));
  af(r.statusCode === 400, 'usuario corto o contraseña <8 se rechazan con palabras');
  r = await h(ev({ accion: 'streamer_crear', usuario: 'invitado1', contrasena: 'ochoexactos', nombre: 'El Invitado' }, roshi));
  af(r.statusCode === 200 && STREAMERS.length === 2, 'crear locutor pega en AzuraCast y nace la cuenta');
  r = await h(ev({ accion: 'streamer_eliminar', id: 9 }, roshi));
  af(r.statusCode === 400 && STREAMERS.length === 2, 'eliminar locutor también exige confirmar:true');
  r = await h(ev({ accion: 'streamer_eliminar', id: 9, confirmar: true }, roshi));
  af(r.statusCode === 200 && STREAMERS.length === 1, 'y con confirmar la cuenta se va');

  // Estructura del front (lo que el vm no corre): la carga perezosa y el CSP.
  console.log('\n[D] los cables del front y el CSP');
  af(js.includes("s.src = '/vendor/lame.min.js'"), 'lamejs carga PEREZOSA desde /vendor/ (156 KB que solo paga quien transmite)');
  af(js.includes("new WebSocket(cabinaWsUrl(), 'webcast')"), 'el WS pide el subprotocolo webcast (sin él, AzuraCast no entiende el hello)');
  af(js.includes('_cb.buses.sam.connect(_cb.monitorGain)') && !/buses\.mic\.connect\(_cb\.monitorGain\)/.test(js), '🔒 el monitor toca samplers y música — el MIC jamás (se acopla con las bocinas)');
  af(js.includes("admin-radio-media?buscar="), 'la búsqueda de música es la de admin-radio-media — el catálogo tiene UN buscador, no se gemelea');
  const csp = fs.readFileSync(path.join(RAIZ, 'netlify.toml'), 'utf8');
  af(/connect-src[^;]*wss:\/\/radio\.conectareynosa\.mx/.test(csp), 'el CSP deja salir el WebSocket del uplink (sin esto la cabina moriría muda en producción)');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(html.includes('id="radio-tab-cabina"') && html.includes("showRadioTab('cabina'"), 'la pestaña Cabina existe y tiene botón');
  af(html.includes('value="">— elige tu cuenta de locutor —') , 'el selector de locutor nace VACÍO (DEFAULTS-1: con qué cuenta sales al aire es una atribución)');

  console.log('\n' + (ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
  process.exit(ko ? 1 : 0);
})();
