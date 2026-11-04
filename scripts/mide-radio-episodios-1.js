#!/usr/bin/env node
/* [RADIO-EPISODIOS-1 · 3-nov-2026] La GRABADORA de la cabina y los EPISODIOS.
 * Palabra de Memo: «guardar los episodios de los programas de radio, el audio
 * sobre todo … quiero hacer pruebas y grabar para escuchar».
 * Mide: (A) el handler REAL con red falsa que modela storage (firmar subida,
 * listar objetos, firmar descargas, borrar) y la tabla; (B) la pantalla real en
 * vm: el título por defecto y que la grabadora graba DEL MASTER con su propio
 * encoder, sin depender del aire; (C) los cables (HTML, CSP, carga).
 * ⚠️ SIN ANCLA (árbol de trabajo). La prueba de oído es de Memo. */
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

const EPIS = [];
const OBJ = {};        // path → bytes (el bucket privado)
const PROG = { '11111111-1111-4111-8111-111111111111': 'Los Ayatola' };
const st = { inserts: 0, objDeletes: 0, firmasSubida: 0 };
global.fetch = async (url, init) => {
  const U = decodeURIComponent(String(url)); const met = ((init || {}).method || 'GET').toUpperCase();
  const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
  if (U.includes('/rest/v1/usuarios') && met === 'GET') {
    const m = U.match(/id=eq\.([\w-]+)/);
    const us = { 'u-memo': { id: 'u-memo', rol: 'maestro_roshi', activo: true, correo: 'memo@x.mx' }, 'u-b': { id: 'u-b', rol: 'bulma', activo: true } };
    return resp(200, m && us[m[1]] ? [us[m[1]]] : []);
  }
  if (U.includes('sesion')) throw new Error('sesion-viva apagada');
  const pre = 'https://kh.falso.test/storage/v1/object/';
  if (U.startsWith(pre + 'upload/sign/radio-episodios/') && met === 'POST') {
    st.firmasSubida++;
    const p = U.slice((pre + 'upload/sign/radio-episodios/').length);
    return resp(200, { url: '/object/upload/sign/radio-episodios/' + p + '?token=tok-' + st.firmasSubida });
  }
  if (U === pre + 'list/radio-episodios' && met === 'POST') {
    const b = JSON.parse(init.body);
    return resp(200, Object.keys(OBJ).filter((p) => p.startsWith(b.prefix + '/') && p.slice(b.prefix.length + 1).includes(b.search || ''))
      .map((p) => ({ name: p.slice(b.prefix.length + 1), metadata: { size: OBJ[p] } })));
  }
  if (U === pre + 'sign/radio-episodios' && met === 'POST') {
    const b = JSON.parse(init.body);
    return resp(200, b.paths.map((p) => (OBJ[p] != null ? { path: p, signedURL: '/object/sign/radio-episodios/' + p + '?token=s', error: null } : { path: p, signedURL: null, error: 'Not found' })));
  }
  if (U.startsWith(pre + 'radio-episodios/') && met === 'DELETE') { st.objDeletes++; delete OBJ[U.slice((pre + 'radio-episodios/').length)]; return resp(200, {}); }
  if (U.includes('/rest/v1/radio_episodios')) {
    const m = U.match(/id=eq\.([\w-]+)/);
    if (met === 'GET') return resp(200, EPIS.map((e) => ({ ...e, radio_programas: e.programa_id ? { nombre: PROG[e.programa_id] } : null })));
    if (met === 'POST') { st.inserts++; const f = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-00000000000' + EPIS.length, grabado_el: '2026-11-04T03:00:00Z', ...JSON.parse(init.body) }; EPIS.push(f); return resp(201, [f]); }
    if (met === 'PATCH') { const f = EPIS.find((x) => x.id === (m && m[1])); if (!f) return resp(200, []); Object.assign(f, JSON.parse(init.body)); return resp(200, [f]); }
    if (met === 'DELETE') { const i = EPIS.findIndex((x) => x.id === (m && m[1])); if (i < 0) return resp(200, []); return resp(200, [EPIS.splice(i, 1)[0]]); }
  }
  return resp(404, {});
};
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const h = require(path.join(RAIZ, 'netlify/functions/admin-radio-cabina.js')).handler;
const ev = (body, tok) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });

(async () => {
  const roshi = jwtSign({ id: 'u-memo', rol: 'maestro_roshi', correo: 'memo@x.mx' }, process.env.JWT_SECRET, 3600);
  const bulma = jwtSign({ id: 'u-b', rol: 'bulma' }, process.env.JWT_SECRET, 3600);
  const J = (r) => JSON.parse(r.body);

  console.log('[A] el handler REAL, por la puerta');
  let r = await h(ev({ accion: 'episodio_subir_url' }, bulma));
  af(r.statusCode === 403 && st.firmasSubida === 0, 'la grabadora es de la cabina: solo maestro_roshi (bulma 403, cero firmas)');
  r = await h(ev({ accion: 'episodio_subir_url', path: 'otra/cosa.mp3' }, roshi));
  let b = J(r);
  af(r.statusCode === 200 && /^episodios\/\d{4}-\d{2}-\d{2}-[a-z0-9]+\.mp3$/.test(b.path), '🔒 el PATH lo arma el SERVIDOR (el que manda el navegador se ignora)');
  af(b.upload_url === 'https://kh.falso.test/storage/v1/object/upload/sign/radio-episodios/' + b.path + '?token=tok-' + st.firmasSubida, 'la URL de subida es la que firmó storage, completa (/storage/v1 + url relativa)');
  const path1 = b.path;

  r = await h(ev({ accion: 'episodio_crear', path: path1, titulo: 'Prueba 1' }, roshi));
  af(r.statusCode === 409 && st.inserts === 0, '🔒 sin el audio en el bucket NO nace el episodio (409, cero inserts) — un índice mudo no existe');
  r = await h(ev({ accion: 'episodio_crear', path: '../secreto.mp3', titulo: 'x' }, roshi));
  af(r.statusCode === 400 && st.inserts === 0, 'un path que no es de episodios rebota 400');
  OBJ[path1] = 5 * 1048576;   // el navegador subió
  r = await h(ev({ accion: 'episodio_crear', path: path1, titulo: '   ' }, roshi));
  af(r.statusCode === 400 && st.inserts === 0, 'sin título no se guarda');
  r = await h(ev({ accion: 'episodio_crear', path: path1, titulo: 'Los Ayatola · 3 nov', programa_id: '11111111-1111-4111-8111-111111111111', duracion_seg: 1834.4, bytes: 5242880 }, roshi));
  b = J(r);
  af(r.statusCode === 200 && st.inserts === 1 && b.episodio.audio_path === path1 && b.episodio.duracion_seg === 1834 && b.episodio.creado_por === 'memo@x.mx', 'con el audio arriba nace el episodio: path, duración y quién grabó');
  r = await h(ev({ accion: 'episodio_crear', path: path1, titulo: 'x', programa_id: 'no-uuid' }, roshi));
  af(r.statusCode === 400, 'un programa_id que no es uuid rebota');

  r = await h(ev({ accion: 'episodios_listar' }, roshi));
  b = J(r);
  const e0 = (b.episodios || [])[0] || {};
  af(r.statusCode === 200 && e0.programa === 'Los Ayatola' && e0.url === 'https://kh.falso.test/storage/v1/object/sign/radio-episodios/' + path1 + '?token=s', 'la lista trae el programa y una URL FIRMADA para escuchar (el bucket es privado)');
  af(!('audio_path' in e0), '🔒 el path crudo no viaja al navegador — solo la URL firmada');

  r = await h(ev({ accion: 'episodio_editar', id: e0.id, titulo: 'Renombrado' }, roshi));
  af(r.statusCode === 200 && EPIS[0].titulo === 'Renombrado', 'renombrar funciona');
  r = await h(ev({ accion: 'episodio_eliminar', id: e0.id }, roshi));
  af(r.statusCode === 400 && EPIS.length === 1 && st.objDeletes === 0, '🔒 eliminar sin confirmar:true → 400, cero borrados (el candado vive en el servidor)');
  r = await h(ev({ accion: 'episodio_eliminar', id: e0.id, confirmar: true }, roshi));
  af(r.statusCode === 200 && EPIS.length === 0 && OBJ[path1] === undefined && st.objDeletes === 1, 'eliminar con confirmar borra el índice Y su audio del bucket');
  r = await h(ev({ accion: 'episodio_eliminar', id: e0.id, confirmar: true }, roshi));
  af(r.statusCode === 404, 'un segundo clic contesta 404, no truena');
  r = await h(ev({ accion: 'samplers_listar_no' }, roshi));
  af(r.statusCode === 400 && /episodio_subir_url/.test(J(r).error), 'la lista de acciones del error nombra las nuevas');

  console.log('\n[B] la grabadora del front, ejecutada en vm');
  const js = fs.readFileSync(path.join(RAIZ, 'kamehouse-radio.js'), 'utf8');
  const ini = js.indexOf('const CAB_GRAB_KBPS'), fin = js.indexOf("window.addEventListener('beforeunload'");
  af(ini > 0 && fin > ini, 'el bloque de la grabadora existe');
  const bloque = js.slice(ini, fin);
  const ctx = { console, Date, Math, Number, String, Blob: function (ch, o) { this.size = ch.reduce((a, c) => a + c.length, 0); this.type = o.type; },
    URL: { createObjectURL: () => 'blob:falso' }, setInterval: () => 1, clearInterval: () => {}, fetch: () => Promise.resolve({ json: () => ({ ok: true, al_aire: { id: 'p1', nombre: 'Los Ayatola' } }) }) };
  vm.createContext(ctx);
  vm.runInContext(bloque, ctx);
  const t1 = vm.runInContext("cabGrabTitulo({ al_aire: { nombre: 'Los Ayatola' } }, Date.UTC(2026,10,4,3,15))", ctx);
  const t2 = vm.runInContext('cabGrabTitulo(null, Date.UTC(2026,10,4,3,15))', ctx);
  af(/^Los Ayatola · 3 nov/.test(t1), 'con programa al aire el título nace con su nombre y la fecha de REYNOSA (3-nov, no el 4 de Greenwich): ' + t1);
  af(/^Prueba de cabina · 3 nov/.test(t2), 'sin programa nace «Prueba de cabina · fecha»: ' + t2);
  const cg = bloque.slice(bloque.indexOf('async function cabGrabar'), bloque.indexOf('function _cbGrabDetener'));
  af(/_cb\.master\.connect\(g\.proc\)/.test(cg) && /new lamejs\.Mp3Encoder\(2, ctx\.sampleRate, CAB_GRAB_KBPS\)/.test(cg), 'graba DEL MASTER (la mezcla post-efectos) con SU PROPIO encoder');
  af(!/_cb\.ws/.test(cg) && !/_cb\.enc\b/.test(cg), '🔒 la grabadora no toca el WS ni el encoder del aire — graba igual sin salir al aire');
  af(/g\.sink\.gain\.value = 0/.test(cg), 'su processor va a un sink en silencio (no duplica el monitor)');
  const cd = bloque.slice(bloque.indexOf('function _cbGrabDetener'), bloque.indexOf('function _cbGrabSesionPintar'));
  af(/clearInterval\(g\.reloj\)/.test(cd) && /_cb\.master\.disconnect\(g\.proc\)/.test(cd) && /g\.enc\.flush\(\)/.test(cd), 'detener: el reloj muere, el processor se desconecta y el encoder suelta su cola (flush)');
  const gu = bloque.slice(bloque.indexOf('async function cabGrabGuardar'), bloque.indexOf('async function cabEpisodiosCargar'));
  af(gu.indexOf("'episodio_subir_url'") < gu.indexOf('x.send(g.blob)') && gu.indexOf('x.send(g.blob)') < gu.indexOf("'episodio_crear'"), '🔒 orden: firmar → subir el MP3 directo → y SOLO después crear el índice');
  af(/413/.test(gu) && /Storage → Settings/.test(gu), 'si el MP3 pasa el tope de Supabase se DICE con el tamaño y el camino (y queda la descarga)');

  console.log('\n[C] los cables');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(html.includes('id="cab-grab-btn"') && html.includes('onclick="cabGrabar()"') && html.includes('id="cab-epi-lista"'), 'la tarjeta de la grabadora vive en la cabina');
  af(/cabEpisodiosCargar\(\);/.test(js.slice(js.indexOf('async function loadRadioCabina'), js.indexOf('function _cbSamplersPintar'))), 'abrir la cabina carga los episodios guardados');
  const toml = fs.readFileSync(path.join(RAIZ, 'netlify.toml'), 'utf8');
  const media = (toml.match(/media-src([^;]*);/) || [])[1] || '';
  af(/npgnhsmwpcipxgvfxrho\.supabase\.co/.test(media) && /blob:/.test(media), 'el CSP deja tocar el episodio (supabase en media-src) y la grabación de la sesión (blob:) — sin esto el <audio> moriría mudo');
  af(/beforeunload/.test(js) && /_cb\.grab \|\|/.test(js), 'cerrar la pestaña con una grabación en curso o sin guardar avisa');
  const acta = fs.readFileSync(path.join(RAIZ, 'migraciones/RADIO-EPISODIOS-1.sql'), 'utf8');
  af(/enable row level security/.test(acta) && /grant select, insert, update, delete on public\.radio_episodios to service_role/.test(acta) && /'radio-episodios', false/.test(acta), 'el acta trae RLS deny-all, el GRANT a service_role y el bucket PRIVADO');

  console.log('\n' + (ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
  process.exit(ko ? 1 : 0);
})();
