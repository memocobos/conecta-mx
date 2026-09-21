#!/usr/bin/env node
// =============================================================================
// scripts/mide-sorteo-maquina.js — LA MÁQUINA DE RONDAS, EN EL NAVEGADOR
// =============================================================================
// Mide el punto de riesgo de SORTEO-RONDAS-1: que la máquina de rondas de
// /sorteo esté guiada por DATO y no por temporizador.
//
// 🔒 VA VERSIONADO EN scripts/, no como CAREO-* ni en un temporal. El .gitignore
// se come `CAREO-*` (y en macOS también `careo-*`), así que un arnés ahí vive en
// UNA máquina: nada lo corre, nada lo preserva y nada nota su ausencia. Ése fue
// el vigilante de KH-4 que nunca cazó nada porque NUNCA EXISTIÓ.
//
// 🔒 SE MIDE EN EL NAVEGADOR sobre la página SERVIDA. `node --check` no cuenta:
// dio 0 con un paréntesis de más en 188 KB y lo cazó el navegador.
//
// 🔒 Y SE MIDE CON LA SONDA `window.__sorteoShow`, no con una clase de CSS: el
// redoble SOSTENIDO y el redoble DE LA RONDA ponen la MISMA clase, así que
// mirar el DOM no distingue «sigo esperando el dato» de «ya lo tengo».
//
// Corre en ~100 s de reloj real: el show dura 2:12 y esto ejercita cuatro
// escenarios dentro de él. No es para correrlo en cada commit.
//
// Uso: npm run mide:sorteo-maquina
// =============================================================================
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RAIZ = path.join(__dirname, '..');
const TI = require(RAIZ + '/sorteo-tiempos.js');
const ESC = require(RAIZ + '/netlify/functions/_lib/sorteo-escalera.js');

const padron = [];
for (let i = 1; i <= 66; i++) padron.push({ id: 'r' + i, nombre: 'Nombre' + i + ' Apellido' + i, folio: i });
const escalones = TI.escalonesPara(66);
const rondas = ESC.construirEscalera(padron, escalones);
const momentos = TI.momentos(escalones);

let ARRANQUE = Date.now();
let TOPE = Infinity;          // cuantas rondas COMO MAXIMO libera el servidor
let pedidos = 0;

function estado() {
  pedidos++;
  const t = Date.now() - ARRANQUE;
  const proy = ESC.proyectarRondas({ rondas, momentos, margenMs: TI.T.MARGEN_ADELANTO_MS,
    transcurridoMs: t, fotoDeId: () => null });
  // 🔒 EL CORTE SIMULA UN LATIDO QUE NO TRAE LA RONDA: el servidor deja de
  // publicar de la ronda `TOPE` en adelante, como si su respuesta se cayera.
  const recortadas = proy.rondas.filter((r) => r.i < TOPE);
  const rev = proy.ganador_liberado && TOPE === Infinity;
  return { ok: true, total: 66, ahora: new Date().toISOString(), registro_cerrado: true,
    sorteo: '2026-10-01T21:00:00-05:00', modo: 'real',
    ultimo: { id: 'g1', intento: 1, resultado: 'pendiente',
      nombre: rev ? rondas.orden[0].nombre : null, folio: rev ? rondas.orden[0].folio : null,
      total_participantes: 66, creado_at: new Date(ARRANQUE).toISOString(), de_cuantos: 66,
      escalones, escalon: null, es_regiro: false,
      rondas: recortadas, rondas_totales: proy.rondas_totales,
      siguiente_ronda_en_ms: proy.siguiente_ronda_en_ms,
      revelacion_en_ms: momentos[momentos.length - 1] },
    giros: [] };
}
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (/giveaway-estado/.test(u)) { r.writeHead(200, {'Content-Type':'application/json'}); return r.end(JSON.stringify(estado())); }
  if (/\.netlify\/functions\//.test(u)) { r.writeHead(200, {'Content-Type':'application/json'}); return r.end('{"ok":false}'); }
  const f = path.join(RAIZ, decodeURIComponent(u).replace(/^\//,'') || 'sorteo.html');
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end('no'); }
    r.writeHead(200, {'Content-Type': /\.js$/.test(f) ? 'text/javascript' : 'text/html; charset=utf-8'}); r.end(b); });
});
const foto = (pg) => pg.evaluate(() => ({
  quedan: (document.getElementById('mos-quedan')||{}).textContent,
  vivas: document.querySelectorAll('.mos.vive').length,
  fuera: document.querySelectorAll('.mos.fuera').length,
  total: document.querySelectorAll('.mos').length,
  redoble: !!document.querySelector('.mosaico-caja.redoble'),
  cols: (document.getElementById('mosaico')||{}).style?.getPropertyValue('--cols'),
  show: window.__sorteoShow ? window.__sorteoShow() : null,
}));

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const p = srv.address().port, nav = await chromium.launch();
  let ok = 0, mal = 0; const fallos = [];
  const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

  // ── A · AVANZA: de la ronda de 24 a la de 12 ────────────────────────────
  console.log('\n── A · la maquina AVANZA (24 -> 12) ──');
  ARRANQUE = Date.now(); TOPE = Infinity;
  let pg = await nav.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://127.0.0.1:' + p + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(6000);
  let f = await foto(pg);
  console.log('   t≈6s  ', JSON.stringify(f));
  af(f.vivas === 24 && f.fuera === 0, 'en t≈6s deben estar las 24 vivas, hubo ' + f.vivas + '/' + f.fuera);
  // la ronda de 12 se anima en momentos[1]=18700 + redoble 18000 => ~36.7s
  await pg.waitForTimeout(32000);
  f = await foto(pg);
  console.log('   t≈38s ', JSON.stringify(f));
  af(f.vivas === 12 && f.fuera === 12, '🔴 en t≈38s deben quedar 12 vivas y 12 apagadas, hubo ' + f.vivas + '/' + f.fuera);
  af(f.total === 24, 'las 24 siguen en la rejilla (no se saca a nadie del DOM), hubo ' + f.total);
  af(/Quedan 12/.test(f.quedan || ''), 'el encabezado dice «Quedan 12», dijo ' + f.quedan);
  af(errs.length === 0, 'errores de pagina: ' + JSON.stringify(errs.slice(0,3)));
  await pg.close();

  // ── B · SOSTIENE: el servidor deja de publicar la ronda de 12 ───────────
  console.log('\n── B · el redoble SE SOSTIENE si falta el dato ──');
  ARRANQUE = Date.now(); TOPE = 1;        // solo la ronda 0
  pg = await nav.newPage({ viewport: { width: 390, height: 900 } });
  const errs2 = []; pg.on('pageerror', (e) => errs2.push(e.message));
  await pg.goto('http://127.0.0.1:' + p + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(24000);          // ya paso momentos[1]=18.7s
  f = await foto(pg);
  console.log('   t≈24s, servidor recortado ', JSON.stringify(f));
  af(f.redoble === true, '🔴 pasado el momento sin dato, el redoble tiene que estar SOSTENIDO');
  af(f.vivas === 24 && f.fuera === 0, '🔴 y NO se salto la ronda: siguen las 24, hubo ' + f.vivas + '/' + f.fuera);
  af(/Ronda 2/.test(f.quedan || ''), 'el encabezado avisa que espera la ronda 2, dijo ' + f.quedan);
  const antesPed = pedidos;
  await pg.waitForTimeout(5000);
  af(pedidos > antesPed, '🔴 la pagina NO se trabo: siguio latiendo (' + (pedidos - antesPed) + ' peticiones en 5s)');
  af(f.show && f.show.sostenido === true, '🔴 la sonda tiene que decir sostenido:true, dijo ' + JSON.stringify(f.show));
  // Se restablece: SOLTAR se mide en la SONDA, no en la clase de CSS —el
  // redoble de la ronda pone la MISMA clase, asi que mirar el DOM no distingue
  // «sigo esperando el dato» de «ya lo tengo y estoy redoblando».
  TOPE = Infinity;
  await pg.waitForTimeout(2000);
  f = await foto(pg);
  console.log('   restablecido +2s          ', JSON.stringify(f));
  af(f.show && f.show.sostenido === false,
     '🔴 al llegar el dato tiene que SOLTAR (sonda); quedo ' + JSON.stringify(f.show));
  af(f.show && f.show.tengo[1] === 12, 'y ya tiene la ronda de 12 en mano');
  af(f.vivas === 24, 'pero todavia NO la pinta: le toca en su momento del reloj, no al recibirla');
  af(errs2.length === 0, 'errores de pagina en B: ' + JSON.stringify(errs2.slice(0,3)));
  await pg.close();

  // ── C · DENTRO DE LA VENTANA SE SINCRONIZA ──────────────────────────────
  // El que entra en el segundo 90 tiene que ALCANZAR al instante la ronda que
  // va, no arrancar el show de cero. Con temporizadores relativos esto tardaba
  // dos minutos en ponerse al dia.
  console.log('\n── C · dentro de la ventana SE SINCRONIZA ──');
  const total = TI.duracionTotal(escalones);
  console.log('   el show dura ' + (total / 1000).toFixed(1) + ' s');
  ARRANQUE = Date.now() - 90000; TOPE = Infinity;
  pg = await nav.newPage({ viewport: { width: 390, height: 900 } });
  const errs3 = []; pg.on('pageerror', (e) => errs3.push(e.message));
  await pg.goto('http://127.0.0.1:' + p + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(3000);
  f = await foto(pg);
  console.log('   entra en t=90s            ', JSON.stringify(f.show), '· vivas', f.vivas);
  af(f.show && f.show.sincronizado === true, '🔴 en t=90s (dentro del show) tiene que ir SINCRONIZADO');
  af(f.show && f.show.pintadas >= 3,
     '🔴 y ALCANZAR al instante: pintadas=' + (f.show && f.show.pintadas) + ', se esperaban >=3');
  // En t=90s el reloj va en la fase de APAGADO de la ronda de 3 (momentos[3]
  // =74.7s + redoble 18s = 92.7s), asi que se ven los SEIS de la ronda
  // anterior: 3 vivos y 3 con el foco muerto. Asertar 21 apagados era mi error
  // — esos 21 ya se fueron en los reacomodos de las rondas previas.
  af(f.vivas === 3 && f.total === 6,
     '🔴 en t=90s deben verse 6 tarjetas (3 vivas, 3 apagadas), hubo ' + f.vivas + ' vivas de ' + f.total);
  // Y pasado el apagado, el REACOMODO deja solo a los tres, mas grandes.
  await pg.waitForTimeout(7000);
  const fr = await foto(pg);
  console.log('   tras el reacomodo         ', JSON.stringify(fr.show), '· total', fr.total, '· cols', fr.cols);
  af(fr.total === 3 && fr.vivas === 3,
     '🔴 tras el reacomodo deben quedar SOLO los 3 finalistas, hubo ' + fr.total);
  af(fr.cols === '3', 'y la rejilla baja a 3 columnas (asi es como CRECEN), dio ' + fr.cols);
  af(f.show && Math.abs(f.show.t - 93000) < 4000,
     'el reloj del show va pegado al del servidor, t=' + (f.show && f.show.t));
  af(errs3.length === 0, 'errores en C: ' + JSON.stringify(errs3.slice(0, 3)));
  await pg.close();

  // ── D · FUERA DE LA VENTANA SE REPITE COMPLETO ──────────────────────────
  console.log('\n── D · fuera de la ventana SE REPITE desde el inicio ──');
  ARRANQUE = Date.now() - 600000;   // diez minutos: el show ya acabo
  pg = await nav.newPage({ viewport: { width: 390, height: 900 } });
  const errs4 = []; pg.on('pageerror', (e) => errs4.push(e.message));
  await pg.goto('http://127.0.0.1:' + p + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(3000);
  f = await foto(pg);
  console.log('   entra en t=600s           ', JSON.stringify(f.show), '· vivas', f.vivas);
  af(f.show && f.show.sincronizado === false, '🔴 fuera de la ventana NO se sincroniza: se repite');
  af(f.show && f.show.pintadas === 0,
     '🔴 y arranca DESDE LA RONDA 0: pintadas=' + (f.show && f.show.pintadas));
  af(f.vivas === 24 && f.fuera === 0,
     '🔴 la repeticion empieza con las 24, hubo ' + f.vivas + '/' + f.fuera);
  af(f.show && f.show.tengo.filter(Boolean).length === 5,
     'y el servidor le dio TODAS las rondas de una: tengo=' + JSON.stringify(f.show && f.show.tengo));
  af(errs4.length === 0, 'errores en D: ' + JSON.stringify(errs4.slice(0, 3)));
  await pg.close();

  await nav.close(); srv.close();
  console.log('\n' + (mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' en verde, ' + mal + ' en rojo');
  fallos.forEach((x) => console.log('  · ' + x));
  process.exit(mal ? 1 : 0);
})();
