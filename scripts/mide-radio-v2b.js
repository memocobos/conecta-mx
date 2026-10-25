#!/usr/bin/env node
/* [RADIO-V2b · 24-oct-2026] LA PÁGINA /radio APRENDE «AL AIRE» Y CARTELERA.
 * Las funciones que arman HTML son PURAS a propósito: este careo las REBANA de
 * radio/index.html (el patrón de mide:sorteo-fotos-1) y las corre en un vm —
 * se mide el código que el cliente va a correr, no una copia.
 * ⚠️ SIN ANCLA (árbol de trabajo). La verificación VISUAL va aparte (vistas
 * previas sembradas + navegador tras el deploy). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0, ko = 0;
const af = (c, m) => { try { c = typeof c === 'function' ? c() : c; } catch (e) { c = false; m += ' · EXC: ' + e.message; } if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

const html = fs.readFileSync(path.join(__dirname, '..', 'radio/index.html'), 'utf8');

console.log('[A] la estructura de la página');
af((html.match(/data-vista="cartelera"/g) || []).length >= 3, 'Cartelera vive en las DOS barras de navegación (desktop y móvil) + su regla de vista');
af(html.includes('id="sec-cartelera"') && html.includes('id="cartContenido"'), 'la sección y su contenedor existen');
af(/body\[data-vista="cartelera"\] #sec-cartelera\{display:block\}/.test(html), 'la regla CSS enciende la vista (sin ella el tab quedaría en blanco)');
af(html.includes("var FN_CARTELERA = '/.netlify/functions/radio-cartelera'"), 'bebe del endpoint público de V2a');
af(html.includes('pintarAlAire(data.live || null)'), 'el AL AIRE entra por el latido del nowplaying (cada 15 s, el que ya existía)');
af(html.includes('id="alAire"') && html.includes('id="proximoProg"'), 'el banner AL AIRE y el renglón del próximo programa viven en el escenario');
// El fetch de la cartelera no puede tumbar la página: fail-soft con .catch.
const cc = html.slice(html.indexOf('function cargarCartelera'), html.indexOf('setInterval(cargarCartelera'));
af(/\.catch\(/.test(cc) && /cartError = true/.test(cc), 'la cartelera caída se DICE (cartError) en vez de dejar «Cargando…» eterno');

console.log('\n[B] las funciones puras, rebanadas y corridas en vm');
const corta = (desde, hasta) => html.slice(html.indexOf(desde), html.indexOf(hasta));
const codigo = corta('function esc(s)', 'function fmt(s)') +
  corta('var cart = null;', 'function pintarCartelera()');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(codigo, ctx, { filename: 'radio-inline.js' });
const run = (expr) => vm.runInContext(expr, ctx);

af(run("hora12('20:00')") === '8 PM' && run("hora12('09:30')") === '9:30 AM' &&
   run("hora12('00:00')") === '12 AM' && run("hora12('12:00')") === '12 PM', 'hora12 habla como la gente (8 PM, 9:30 AM, 12 AM, 12 PM)');

// «hoy/mañana» sale de la FECHA proyectada del servidor, no de los minutos:
// a las 11 PM un programa de mañana 10 AM está a 660 min y habría dicho «hoy».
af(run("cuandoSiguiente({ fecha: '2026-10-27', dia_nombre: 'martes', hora_inicio: '20:00', empieza_en_min: 90 }, '2026-10-27')") === 'hoy a las 8 PM · empieza en 1 h 30 min',
   'el siguiente de HOY dice hoy, con su cuenta regresiva');
const tarde = run("cuandoSiguiente({ fecha: '2026-10-28', dia_nombre: 'miércoles', hora_inicio: '10:00', empieza_en_min: 660 }, '2026-10-27')");
af(/^mañana a las 10 AM/.test(tarde) && !/^hoy/.test(tarde), 'a 660 min pero con fecha de MAÑANA dice mañana (el bug de los minutos, cazado)');
af(/^el viernes/.test(run("cuandoSiguiente({ fecha: '2026-10-30', dia_nombre: 'viernes', hora_inicio: '19:00', empieza_en_min: 4000 }, '2026-10-27')")), 'más lejos dice el día con su nombre');

af(run('alAireHtml(null, null)') === null && run('alAireHtml({ is_live: false }, null)') === null, 'sin locutor conectado NO hay banner');
af(run("alAireHtml({ is_live: false }, { al_aire: { nombre: 'La Hora' } })") === null,
   '🔒 la PARRILLA sola no enciende el AL AIRE: el banner exige live.is_live (qué suena ≠ qué debería sonar)');
let s = run("alAireHtml({ is_live: true, streamer_name: 'Memo' }, null)");
af(/Transmisión en vivo/.test(s) && /con Memo/.test(s), 'vivo SIN programa en la parrilla: «Transmisión en vivo · con {locutor}»');
s = run("alAireHtml({ is_live: true, streamer_name: 'dj' }, { al_aire: { nombre: 'La Hora Conecta', conductor: 'Memo' } })");
af(/AL AIRE: La Hora Conecta/.test(s) && /con Memo/.test(s), 'vivo CON programa: nombre de la parrilla y su conductor');

af(run('proximoHtml(null)') === '', 'sin cartelera el renglón del próximo va vacío');
af(/En la parrilla/.test(run("proximoHtml({ al_aire: { nombre: 'X', hora_fin: '22:00' } })")), 'con programa en horario: «En la parrilla … hasta las»');
af(/Próximo programa/.test(run("proximoHtml({ al_aire: null, siguiente: { nombre: 'Y', fecha: '2026-10-27', hora_inicio: '20:00', empieza_en_min: 60 } })")), 'sin al-aire: «Próximo programa»');

af(/No se pudo cargar/.test(run('cartHtml(null, true)')), 'el error de red se DICE — no se disfraza de parrilla vacía (un cero es una afirmación)');
af(/por estrenarse/.test(run('cartHtml({ semanales: [], especiales: [], al_aire: null, siguiente: null }, false)')), 'la parrilla VACÍA tiene estado digno (las pruebas de Memo arrancan sin programas)');
const FIX = `{
  al_aire: { id: 'a', nombre: 'La Hora Conecta', conductor: 'Memo', tipo: 'semanal', hora_inicio: '20:00', hora_fin: '22:00' },
  siguiente: { id: 'b', nombre: 'Entrevista', tipo: 'especial', fecha: '2026-10-28', dia_nombre: 'miércoles', hora_inicio: '19:00', empieza_en_min: 1380 },
  semanales: [
    { id: 'c', nombre: 'Dominguero', dia_semana: 0, tipo: 'semanal', hora_inicio: '10:00', hora_fin: '12:00' },
    { id: 'a', nombre: 'La Hora Conecta', conductor: 'Memo', dia_semana: 2, tipo: 'semanal', hora_inicio: '20:00', hora_fin: '22:00' }
  ],
  especiales: [{ id: 'b', nombre: 'Entrevista <script>', tipo: 'especial', fecha: '2026-10-28', hora_inicio: '19:00', hora_fin: '20:00' }]
}`;
s = run('cartHtml(' + FIX + ', false, 2)');   // dow 2 = martes inyectado
af(/Al aire ahora/.test(s) && /cartAhoraNom">LA HORA CONECTA|cartAhoraNom">La Hora Conecta/.test(s), 'el AL AIRE de la parrilla sale resaltado arriba');
af(/cartSigue/.test(s) && /Entrevista/.test(s), 'el SIGUE sale con su tarjeta');
af(s.indexOf('martes<span class="hoyChip">HOY</span>') >= 0, 'la semana ARRANCA en hoy (día inyectado), con su chip');
af(s.indexOf('martes') < s.indexOf('domingo'), 'y el domingo va después del martes — el orden es desde hoy, no de calendario');
af(/Especial/.test(s) && !/<script>/.test(s), 'los especiales llevan su chip azul y el texto va ESCAPADO (el <script> del fixture no sale crudo)');

console.log('\n[C] RADIO-V2a2: fin LIBRE y la foto, en la página');
af(run("rangoHoras({ hora_inicio: '20:00', hora_fin: '22:00' })") === '8 PM–10 PM' &&
   run("rangoHoras({ hora_inicio: '20:00', hora_fin: null })") === 'desde las 8 PM', 'rangoHoras: con fin dice el rango; SIN fin dice «desde las 8 PM» — jamás inventa un cierre');
af(/desde las 8 PM/.test(run("proximoHtml({ al_aire: { nombre: 'X', hora_inicio: '20:00', hora_fin: null } })")), 'el renglón del escenario con programa SIN fin dice «desde las», no «hasta las null»');
const LIBRE = `{
  al_aire: { id: 'a', nombre: 'Maratón', hora_inicio: '20:00', hora_fin: null, tipo: 'semanal', foto_url: 'https://kh.supabase.co/storage/v1/object/public/radio-programas/programas/a.jpg' },
  siguiente: null, especiales: [],
  semanales: [{ id: 'a', nombre: 'Maratón', dia_semana: 2, tipo: 'semanal', hora_inicio: '20:00', hora_fin: null, foto_url: 'https://kh.supabase.co/x.jpg"><script>' }]
}`;
s = run('cartHtml(' + LIBRE + ', false, 2)');
af(/desde las 8 PM/.test(s) && !/null/.test(s), 'la parrilla con fin libre pinta «desde las 8 PM» y ningún «null» se asoma');
af(/cartAhoraFoto/.test(s) && /cartFoto/.test(s), 'la foto del programa sale en el AL AIRE y en su fila de la semana');
af(!/"><script>/.test(s), 'y la URL de la foto va ESCAPADA (una comilla en el dato no rompe el HTML)');

// LA CARÁTULA DEL REPRODUCTOR (idea de Memo): en vivo con programa con foto,
// la foto TOMA la portada del álbum; cualquier pata que falte → el álbum.
af(run("caratulaSrc('album.jpg', { is_live: true }, { al_aire: { foto_url: 'programa.jpg' } })") === 'programa.jpg', 'AL AIRE con foto: la foto del programa toma la carátula');
af(run("caratulaSrc('album.jpg', { is_live: false }, { al_aire: { foto_url: 'programa.jpg' } })") === 'album.jpg', '🔒 sin locutor conectado la carátula sigue siendo el álbum — la parrilla sola no la toma');
af(run("caratulaSrc('album.jpg', { is_live: true }, { al_aire: { foto_url: null } })") === 'album.jpg' &&
   run("caratulaSrc('album.jpg', { is_live: true }, null)") === 'album.jpg' &&
   run("caratulaSrc('album.jpg', null, null)") === 'album.jpg', 'programa sin foto, sin programa o sin dato → el álbum de siempre');
af(html.includes('caratulaSrc(actual.art, ultimoLive, cart)') && html.includes('pintarCaratula();'), 'y el reproductor REAL le pregunta a caratulaSrc en el latido Y al llegar la cartelera');

console.log('\n' + (ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
process.exit(ko ? 1 : 0);
