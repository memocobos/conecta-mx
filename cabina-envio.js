/* [CABINA-ESTABLE-1 · 3-nov-2026] El CODIFICADOR y el ENVÍO de la cabina, en un
 * Worker: fuera del hilo de la pantalla (ver cabina-captura.js — la causa
 * medida de los cortes del 3-nov).
 *
 * Recibe el audio por un MessagePort que viene DIRECTO del AudioWorklet (el
 * hilo de la pantalla jamás lo toca), lo convierte a MP3 con lamejs y:
 *   · modo 'aire'   → lo manda por el webcast a AzuraCast. El hello va
 *     PRIMERO, en el onopen, y el audio solo después (al revés AzuraCast
 *     cierra). La metadata la manda la pantalla cuando la parrilla contesta.
 *   · modo 'grabar' → junta los frames y los devuelve al detener.
 *
 * Cada segundo avisa a la pantalla con un LATIDO: el pico de la mezcla (para
 * el vigilante de silencio), la COLA del WebSocket (bytes que el internet de
 * subida no ha alcanzado a mandar) y los bytes grabados. La pantalla decide
 * qué decir; aquí solo se mide. */
importScripts('/vendor/lame.min.js');

let modo = null, ws = null, enc = null, abierto = false;
let chunks = [], bytes = 0, pico = 0, ultimoLatido = 0, kbps = 128;

function aI16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const v = Math.max(-1, Math.min(1, f32[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

function latido(forzar) {
  const ahora = Date.now();
  if (!forzar && ahora - ultimoLatido < 1000) return;
  ultimoLatido = ahora;
  self.postMessage({ tipo: 'latido', pico, cola: ws ? ws.bufferedAmount : 0, bytes });
  pico = 0;
}

function alAudio(ev) {
  const d = ev.data || {};
  if (!d.L || !enc) return;
  for (let i = 0; i < d.L.length; i += 16) { const a = Math.abs(d.L[i]); if (a > pico) pico = a; }
  const mp3 = enc.encodeBuffer(aI16(d.L), aI16(d.R || d.L));
  if (mp3.length) {
    if (modo === 'aire') { if (ws && ws.readyState === 1) ws.send(mp3); }
    else { chunks.push(mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.length)); bytes += mp3.length; }
  }
  latido(false);
}

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.tipo === 'aire') {
    modo = 'aire'; kbps = Number(m.kbps) || 128;
    if (m.puerto) m.puerto.onmessage = alAudio;
    ws = new WebSocket(m.url, 'webcast');
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      ws.send(m.hello);   // el hello SIEMPRE primero
      enc = new lamejs.Mp3Encoder(2, m.sampleRate, kbps);
      abierto = true;
      self.postMessage({ tipo: 'abierto' });
    };
    ws.onclose = (ev) => { self.postMessage({ tipo: 'cerrado', code: ev.code, abrio: abierto }); enc = null; self.close(); };
    ws.onerror = () => {};   // onclose llega después con el código
  } else if (m.tipo === 'grabar') {
    modo = 'grabar'; kbps = Number(m.kbps) || 96;
    enc = new lamejs.Mp3Encoder(2, m.sampleRate, kbps);
    if (m.puerto) m.puerto.onmessage = alAudio;
  } else if (m.tipo === 'meta') {
    if (ws && ws.readyState === 1 && abierto) ws.send(m.json);
  } else if (m.tipo === 'cerrar') {
    try { if (enc && ws && ws.readyState === 1) { const fin = enc.flush(); if (fin.length) ws.send(fin); } } catch (err) {}
    enc = null;
    try { if (ws) { ws.onclose = null; ws.close(); } } catch (err) {}
    self.close();
  } else if (m.tipo === 'detener') {
    // Un respiro para que lleguen los últimos bloques que el worklet ya mandó.
    setTimeout(() => {
      try { if (enc) { const fin = enc.flush(); if (fin.length) { chunks.push(fin.buffer.slice(fin.byteOffset, fin.byteOffset + fin.length)); bytes += fin.length; } } } catch (err) {}
      enc = null;
      self.postMessage({ tipo: 'grabacion', chunks, bytes }, chunks);
      self.close();
    }, 150);
  }
};
