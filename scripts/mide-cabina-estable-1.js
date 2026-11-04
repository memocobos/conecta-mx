#!/usr/bin/env node
/* [CABINA-ESTABLE-1 · 3-nov-2026] LA TRANSMISIÓN YA NO SE CORTA POR LA PANTALLA.
 * Medido en la prueba del 3-nov (23:09–23:18): la estación soltó al locutor y
 * volvió el AutoDJ (23:13 · 23:16:50 · 23:16:56) justo después de bajar
 * canciones del catálogo al aire. El MP3 se hacía en el ScriptProcessor, que
 * corre en el hilo de la pantalla.
 *
 * [A] el WORKLET real (cabina-captura.js) en vm: bloques exactos de 2048,
 *     silencio cuando no hay entrada (un hueco es lo que hace soltar), parar.
 * [B] el WORKER real (cabina-envio.js) en vm con el lamejs REAL y un WebSocket
 *     falso que registra el orden: hello PRIMERO, audio después, metadata,
 *     latido con la cola y el pico, cierre manual vs cierre de la estación,
 *     y el modo grabar devolviendo frames MP3 reales.
 * [C] las puras nuevas del front (cola de subida · estación que suelta).
 * [D] los cables: el camino nuevo primero, el de siempre como respaldo, el CSP.
 * [E] control positivo: BASE (42e560b, sin esta tuerca) no tiene camino fuera de
 *     la pantalla — el defecto existía.
 * ⚠️ Lo que NO se puede medir aquí y queda DICHO: el AudioWorklet y el Worker
 * de un navegador real contra el AzuraCast vivo. Esa prueba es de Memo. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
// El «antes» es un COMMIT fijo (42e560b, el padre de CABINA-ESTABLE-1): leer
// HEAD caducó el día del propio commit — un control positivo anclado a HEAD
// mide el presente, no el defecto.
const BASE = process.env.BASE_SHA || '42e560b';

let ok = 0, ko = 0;
const af = (c, m) => { try { c = typeof c === 'function' ? c() : c; } catch (e) { c = false; m += ' · EXC: ' + e.message; } if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

(async () => {
  console.log('[A] el worklet de captura (hilo de audio)');
  const wsrc = fs.readFileSync(path.join(RAIZ, 'cabina-captura.js'), 'utf8');
  let Clase = null, nombre = null;
  const wctx = { Float32Array, registerProcessor: (n, c) => { nombre = n; Clase = c; } };
  wctx.AudioWorkletProcessor = class { constructor() { this.port = { onmessage: null }; } };
  vm.createContext(wctx); vm.runInContext(wsrc, wctx);
  af(nombre === 'cabina-captura' && typeof Clase === 'function', 'registra el procesador «cabina-captura» (el nombre que pide el front)');
  const p = new Clase();
  const recibidos = [];
  p.port.onmessage({ data: { puerto: { postMessage: (m) => recibidos.push(m) } } });
  for (let q = 0; q < 16; q++) {
    const L = new Float32Array(128).map((_, i) => (q * 128 + i) / 10000), R = new Float32Array(128).fill(-0.25);
    p.process([[L, R]]);
  }
  af(recibidos.length === 1 && recibidos[0].L.length === 2048, '16 cuantos de 128 = UN bloque de 2048 cuadros (~43 ms) — se manda junto, no cuadro por cuadro');
  af(Math.abs(recibidos[0].L[2047] - 0.2047) < 1e-6 && recibidos[0].R[5] === -0.25, 'el bloque lleva las muestras EXACTAS de los dos canales, en orden');
  for (let q = 0; q < 16; q++) p.process([[]]);
  af(recibidos.length === 2 && recibidos[1].L.every((x) => x === 0), 'sin entrada manda SILENCIO, no nada — un hueco en el envío es lo que hace que la estación suelte al locutor');
  for (let q = 0; q < 16; q++) p.process([[new Float32Array(128).fill(0.1)]]);
  af(recibidos.length === 3 && Math.abs(recibidos[2].R[0] - 0.1) < 1e-6, 'una entrada MONO se duplica al canal derecho');
  p.port.onmessage({ data: { parar: true } });
  af(p.process([[new Float32Array(128)]]) === false, 'parar → process devuelve false (el navegador suelta el nodo)');

  console.log('\n[B] el worker de envío (lamejs real + WebSocket falso)');
  const esrc = fs.readFileSync(path.join(RAIZ, 'cabina-envio.js'), 'utf8');
  const lame = fs.readFileSync(path.join(RAIZ, 'vendor/lame.min.js'), 'utf8');
  function mundo() {
    const M = { posts: [], sockets: [], timers: [], cerrado: false, ahora: 1000000 };
    class WSFalso {
      constructor(url, proto) { this.url = url; this.proto = proto; this.readyState = 0; this.sends = []; this.bufferedAmount = 0; M.sockets.push(this); }
      send(x) { this.sends.push(x); }
      close() { this.readyState = 3; this.cerradoManual = true; }
      abrir() { this.readyState = 1; this.onopen && this.onopen(); }
      caer(code) { this.readyState = 3; this.onclose && this.onclose({ code }); }
    }
    const ctx = { Int16Array, Int8Array, Int32Array, Float32Array, Math, Array, Number, Object, console,
      Date: { now: () => M.ahora }, WebSocket: WSFalso,
      setTimeout: (f) => { M.timers.push(f); return 1; } };
    ctx.self = ctx;
    ctx.self.postMessage = (m) => M.posts.push(m);
    ctx.self.close = () => { M.cerrado = true; };
    ctx.importScripts = (u) => { if (u !== '/vendor/lame.min.js') throw new Error('importScripts inesperado ' + u); vm.runInContext(lame, ctx); };
    vm.createContext(ctx); vm.runInContext(esrc, ctx);
    M.ctx = ctx;
    M.msg = (d) => ctx.self.onmessage({ data: d });
    return M;
  }
  const onda = () => { const L = new Float32Array(2048); for (let i = 0; i < L.length; i++) L[i] = Math.sin(i / 8) * 0.4; return L; };
  const W = mundo();
  const puerto = {};
  W.msg({ tipo: 'aire', url: 'wss://radio.conectareynosa.mx/webdj/radioconecta/', hello: '{"type":"hello"}', kbps: 128, sampleRate: 48000, puerto });
  const sock = W.sockets[0];
  af(sock && sock.proto === 'webcast' && /webdj\/radioconecta/.test(sock.url), 'el WebSocket nace DENTRO del Worker con el subprotocolo webcast');
  puerto.onmessage({ data: { L: onda(), R: onda() } });
  af(sock.sends.length === 0, 'audio que llega antes de abrir NO viaja (sin hello, AzuraCast cierra)');
  sock.abrir();
  af(sock.sends[0] === '{"type":"hello"}' && W.posts.some((m) => m.tipo === 'abierto'), 'al abrir: el HELLO es lo PRIMERO que sale y la pantalla recibe «abierto»');
  puerto.onmessage({ data: { L: onda(), R: onda() } });
  puerto.onmessage({ data: { L: onda(), R: onda() } });
  const mp3 = sock.sends.slice(1).filter((x) => typeof x !== 'string');
  af(mp3.length > 0 && (mp3[0][0] & 0xff) === 0xff, 'el audio sale como frames MP3 REALES (sync 0xFF) después del hello');
  W.msg({ tipo: 'meta', json: '{"type":"metadata"}' });
  af(sock.sends.indexOf('{"type":"metadata"}') > 0, 'la metadata del show viaja por el mismo socket, después del hello');
  sock.bufferedAmount = 77777; W.ahora += 1500;
  puerto.onmessage({ data: { L: onda(), R: onda() } });
  const lat = W.posts.filter((m) => m.tipo === 'latido').pop();
  af(lat && lat.cola === 77777 && lat.pico > 0.3, 'el LATIDO le dice a la pantalla la cola de subida (bufferedAmount) y el pico de la mezcla');
  const nLat = W.posts.filter((m) => m.tipo === 'latido').length;
  puerto.onmessage({ data: { L: onda(), R: onda() } });
  af(W.posts.filter((m) => m.tipo === 'latido').length === nLat, 'un latido por segundo, no uno por bloque (la pantalla no se inunda)');
  const antes = sock.sends.length;
  W.msg({ tipo: 'cerrar' });
  af(sock.cerradoManual && W.cerrado && sock.sends.length >= antes, 'cortar: suelta la cola del encoder, cierra el socket y el Worker se apaga');
  af(!W.posts.some((m) => m.tipo === 'cerrado'), 'un corte MANUAL no se reporta como «la estación cerró»');

  const W2 = mundo(); const p2 = {};
  W2.msg({ tipo: 'aire', url: 'wss://x/', hello: 'H', kbps: 128, sampleRate: 44100, puerto: p2 });
  W2.sockets[0].abrir(); W2.sockets[0].caer(1006);
  const c2 = W2.posts.find((m) => m.tipo === 'cerrado');
  af(c2 && c2.code === 1006 && c2.abrio === true && W2.cerrado, 'si la ESTACIÓN cierra, la pantalla recibe el código (para decirlo) y el Worker se apaga');
  const W3 = mundo();
  W3.msg({ tipo: 'aire', url: 'wss://x/', hello: 'H', kbps: 128, sampleRate: 44100, puerto: {} });
  W3.sockets[0].caer(1006);
  af(W3.posts.find((m) => m.tipo === 'cerrado').abrio === false, 'si nunca abrió, se distingue (no se pudo conectar ≠ te soltaron)');

  const G = mundo(); const pg = {};
  G.msg({ tipo: 'grabar', kbps: 96, sampleRate: 48000, puerto: pg });
  for (let i = 0; i < 10; i++) pg.onmessage({ data: { L: onda(), R: onda() } });
  af(G.sockets.length === 0, 'grabar NO abre ningún socket (graba igual sin salir al aire)');
  G.msg({ tipo: 'detener' });
  af(G.timers.length === 1, 'detener espera un respiro para los últimos bloques en camino');
  G.timers[0]();
  const gr = G.posts.find((m) => m.tipo === 'grabacion');
  af(gr && gr.bytes > 0 && gr.chunks.length > 0 && (new Int8Array(gr.chunks[0])[0] & 0xff) === 0xff, 'la grabación vuelve como frames MP3 reales con su peso (' + (gr && gr.bytes) + ' bytes)');
  af(gr && gr.chunks.reduce((a, b) => a + b.byteLength, 0) === gr.bytes, 'los bytes reportados = la suma de los frames devueltos');
  af(G.cerrado, 'y el Worker se apaga');

  console.log('\n[C] las puras nuevas del front');
  const js = fs.readFileSync(path.join(RAIZ, 'kamehouse-radio.js'), 'utf8');
  const pctx = {}; vm.createContext(pctx);
  vm.runInContext('const CAB_AIRE_KBPS = 128;\n' + js.slice(js.indexOf('function cabColaExcedida'), js.indexOf('function _cbVigilaCola')), pctx);
  vm.runInContext(js.slice(js.indexOf('function cabEstacionSolto'), js.indexOf('function _cbVigilaEstacion')), pctx);
  af(vm.runInContext('cabColaExcedida(48001, 128)', pctx) === true && vm.runInContext('cabColaExcedida(47999, 128)', pctx) === false, 'la subida «no alcanza» con más de ~3 s de audio atorado (48 KB a 128 kbps)');
  af(vm.runInContext('cabEstacionSolto(2, 10)', pctx) === false, 'en el arranque NO se acusa a la estación (liquidsoap tarda en reportar al locutor)');
  af(vm.runInContext('cabEstacionSolto(1, 60)', pctx) === false && vm.runInContext('cabEstacionSolto(2, 60)', pctx) === true, 'pasado el arranque, DOS latidos seguidos sin is_live = la estación te soltó (uno solo puede ser la caché)');

  console.log('\n[D] los cables');
  const aire = js.slice(js.indexOf('async function cabAire'), js.indexOf('function cabCortar('));
  af(js.includes("ctx.audioWorklet.addModule('/cabina-captura.js')") && js.includes("new Worker('/cabina-envio.js')"), 'el front carga el worklet y el Worker por su ruta');
  af(aire.indexOf('_cbHiloPosible(ctx)') > 0 && aire.indexOf('_cbHiloPosible(ctx)') < aire.indexOf("new WebSocket(cabinaWsUrl(), 'webcast')"), 'el camino NUEVO se intenta PRIMERO; el WebSocket de la pantalla queda solo de respaldo');
  af(/catch \(e\) \{ h = null; console\.warn/.test(aire), 'si el camino nuevo no arranca, cae al de siempre (transmitir no se frena por esto)');
  af(js.includes("node.port.postMessage({ puerto: canal.port1 }, [canal.port1])") && js.includes('[canal.port2]'), 'el audio va worklet → Worker por un MessageChannel DIRECTO (el hilo de la pantalla no lo toca)');
  af(!/m\.tipo === 'latido'[\s\S]{0,200}encodeBuffer/.test(aire), 'la pantalla no codifica nada en el camino nuevo: solo lee el latido');
  af(aire.includes('_cbVigilaSilencio(Number(m.pico)') && aire.includes('_cbVigilaCola(Number(m.cola)'), 'el latido alimenta al vigilante de silencio y al de la subida');
  af(js.slice(js.indexOf('function _cbOyentesStart')).includes('_cbVigilaEstacion(live);'), 'el latido de oyentes vigila si la estación sigue tomando al locutor');
  const cortar = js.slice(js.indexOf('function cabCortar('), js.indexOf('// ── [RADIO-EPISODIOS-1]'));
  af(cortar.indexOf("postMessage({ tipo: 'cerrar' })") > 0 && cortar.includes("accion: 'dj_desconectar'"), 'cortar avisa al Worker (cerrar) y a la estación (dj_desconectar), como antes');
  const grab = js.slice(js.indexOf('async function cabGrabar'), js.indexOf('function _cbGrabDetener'));
  af(grab.includes("tipo: 'grabar', kbps: CAB_GRAB_KBPS") && !/_cb\.ws/.test(grab), 'la grabadora también codifica fuera de la pantalla, a 96 kbps, sin tocar el envío');
  const det = js.slice(js.indexOf('function _cbGrabDetener'), js.indexOf('function _cbGrabSesionPintar'));
  af(det.includes("postMessage({ tipo: 'detener' })") && /setTimeout\([\s\S]{0,200}no se pudo cerrar/.test(det), 'detener pide los frames al Worker y, si no contesta, lo DICE (no se queda colgado)');
  const csp = (fs.readFileSync(path.join(RAIZ, 'netlify.toml'), 'utf8').match(/Content-Security-Policy = "([^"]*)"/) || [])[1] || '';
  af(/script-src 'self'/.test(csp) && !/worker-src/.test(csp) && /connect-src[^;]*wss:\/\/radio\.conectareynosa\.mx/.test(csp), 'el CSP deja cargar el worklet y el Worker (script-src self, sin worker-src que los vete) y deja salir el socket');
  af(fs.existsSync(path.join(RAIZ, 'cabina-captura.js')) && fs.existsSync(path.join(RAIZ, 'cabina-envio.js')), 'los dos archivos existen en la raíz (el comodín de _redirects no tapa archivos que existen)');

  console.log('\n[F] CABINA-CONSOLA-1: la consola (V8) entra en crudo y con los dos canales');
  const fctx = {}; vm.createContext(fctx);
  vm.runInContext(js.slice(js.indexOf('function cabMicRestricciones'), js.indexOf('function cabCtx')), fctx);
  const rc = vm.runInContext('cabMicRestricciones(true)', fctx), rl = vm.runInContext('cabMicRestricciones(false)', fctx);
  af(rc.echoCancellation === false && rc.noiseSuppression === false && rc.autoGainControl === false, 'modo consola: SIN filtros de llamada — la supresión de ruido ya no recorta la música como «ruido»');
  af(rc.channelCount && rc.channelCount.ideal === 2, 'modo consola: pide los DOS canales (con filtros, Chrome captura mono del primero y el 2º micrófono se pierde)');
  af(rl.echoCancellation === true && rl.noiseSuppression === true, 'sin consola (mic de laptop) los filtros siguen como siempre');
  af(vm.runInContext("cabPareceConsola('V8 USB Audio Device') && cabPareceConsola('USB PnP Sound Device') && !cabPareceConsola('MacBook Pro Microphone')", fctx), 'una V8/tarjeta USB se reconoce para SUGERIR el modo (solo sugiere, no lo prende solo)');
  const tg = js.slice(js.indexOf('async function cabMicToggle'), js.indexOf('async function _cbLlenarMics'));
  af(tg.includes('cabMicRestricciones(_cb.consola)') && tg.includes('audio.deviceId = { exact: _cb.micDevice }'), 'la captura usa las restricciones del dueño y conserva el micrófono elegido');
  af(/channelCount = 1; _cb\.micMono\.channelCountMode = 'explicit'; _cb\.micMono\.channelInterpretation = 'speakers'/.test(tg) && tg.includes('_cb.micMono.connect(_cb.buses.mic)'), 'en consola los dos canales se SUMAN al centro antes del bus del mic (medido en Chrome real: L-solo y R-solo salen 0.334/0.334)');
  af((js.match(/if \(_cb\.micMono\) try \{ _cb\.micMono\.disconnect\(\); \} catch \(e\) \{\}/g) || []).length === 3, 'el nodo de suma se suelta en los 3 sitios donde se suelta el mic (apagar · cambiar mic · cambiar modo)');
  const htmlK = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(htmlK.includes('id="cab-consola" onchange="cabConsola(this.checked)"') && /<input type="checkbox" id="cab-consola"[^>]*>/.test(htmlK) && !/id="cab-consola"[^>]*\schecked[\s>]/.test(htmlK), 'la casilla vive en la Mezcladora y nace APAGADA en el HTML (la preferencia de cada computadora la pinta loadRadioCabina)');
  af(js.includes("localStorage.setItem('cab-consola'") && js.slice(js.indexOf('async function loadRadioCabina')).includes("_cbEl('cab-consola')"), 'la preferencia se recuerda por computadora y se pinta al abrir la cabina');

  console.log('\n[E] control positivo: BASE no tenía camino fuera de la pantalla');
  let base = '';
  try { base = execSync('git show ' + BASE + ':kamehouse-radio.js', { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 << 20 }); } catch (e) {}
  af(base && base.includes('createScriptProcessor(4096, 2, 2)') && !base.includes('_cbHiloPosible'), 'en BASE el MP3 del aire se hacía SOLO en el ScriptProcessor (hilo de la pantalla) — el defecto existía');
  af(base && /bitrate: 192/.test(base) && /Mp3Encoder\(2, ctx\.sampleRate, 192\)/.test(base), 'y en BASE se mandaba a 192 kbps');

  console.log('\n' + (ko ? '🔴 ROJO' : '✅ VERDE') + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
  process.exit(ko ? 1 : 0);
})();
