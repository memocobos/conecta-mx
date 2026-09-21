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
let SIN_GIRO = false;         // para medir «Como funciona», que vive ANTES del giro
let N = 66;                   // registrados, cuando no hay giro
let RES = 'pendiente';        // el resultado PUBLICO del giro vivo
let RESUELTOS = [];           // los `giros` que ve el publico

function estado() {
  pedidos++;
  if (SIN_GIRO) {
    return { ok: true, total: N, ahora: new Date().toISOString(), registro_cerrado: false,
      sorteo: '2026-10-01T21:00:00-05:00', modo: 'real', ultimo: null, giros: [] };
  }
  const t = Date.now() - ARRANQUE;
  const proy = ESC.proyectarRondas({ rondas, momentos, margenMs: TI.T.MARGEN_ADELANTO_MS,
    transcurridoMs: t, fotoDeId: () => null });
  // 🔒 EL CORTE SIMULA UN LATIDO QUE NO TRAE LA RONDA: el servidor deja de
  // publicar de la ronda `TOPE` en adelante, como si su respuesta se cayera.
  const recortadas = proy.rondas.filter((r) => r.i < TOPE);
  const rev = proy.ganador_liberado && TOPE === Infinity;
  return { ok: true, total: 66, ahora: new Date().toISOString(), registro_cerrado: true,
    sorteo: '2026-10-01T21:00:00-05:00', modo: 'real',
    ultimo: { id: 'g1', intento: 1, resultado: RES,
      nombre: rev ? rondas.orden[0].nombre : null, folio: rev ? rondas.orden[0].folio : null,
      total_participantes: 66, creado_at: new Date(ARRANQUE).toISOString(), de_cuantos: 66,
      escalones, escalon: null, es_regiro: false,
      rondas: recortadas, rondas_totales: proy.rondas_totales,
      siguiente_ronda_en_ms: proy.siguiente_ronda_en_ms,
      revelacion_en_ms: momentos[momentos.length - 1] },
    giros: RESUELTOS };
}
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (/giveaway-estado/.test(u)) { r.writeHead(200, {'Content-Type':'application/json'}); return r.end(JSON.stringify(estado())); }
  // La puerta privada, lo justo para que `entrar()` abra el modo admin: el
  // careo tiene que poder VER los botones, no solo el fuente.
  if (/giveaway-sortear/.test(u)) {
    let cuerpo = '';
    q.on('data', (c) => { cuerpo += c; });
    return q.on('end', () => {
      let b = {}; try { b = JSON.parse(cuerpo || '{}'); } catch (_) {}
      r.writeHead(200, { 'Content-Type': 'application/json' });
      if (b.accion === 'estado_admin') {
        return r.end(JSON.stringify({ ok: true, cadena: [],
          ultimo: { sorteo_id: 'g1', intento: 1, resultado: RES, nombre: rondas.orden[0].nombre,
                    whatsapp: '8990000001', instagram: 'alguien', ciudad: 'Reynosa',
                    premio: 'PLUS', creado_at: new Date(ARRANQUE).toISOString(),
                    descarte_motivo: RES === 'no_cumple' ? 'no_sigue' : null } }));
      }
      if (b.accion === 'pendientes_foto') return r.end(JSON.stringify({ ok: true, pendientes: 0 }));
      r.end(JSON.stringify({ ok: true }));
    });
  }
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

  // ── E · «COMO FUNCIONA» ES DERIVADO ────────────────────────────────────
  // 🔒 Con los SEIS N. Si el bloque estuviera tecleado, con 23 participantes
  // prometeria una ronda de 24 que no va a existir, y con 2 prometeria rondas
  // donde hay un giro directo. La base 8 promete este bloque, asi que decir
  // mal la mecanica es incumplir las bases en la propia pagina del sorteo.
  console.log('\n── E · «Como funciona» es DERIVADO ──');
  SIN_GIRO = true;
  for (const n of [66, 23, 11, 5, 2, 0]) {
    N = n;
    pg = await nav.newPage({ viewport: { width: 390, height: 900 } });
    const errsE = []; pg.on('pageerror', (e) => errsE.push(e.message));
    await pg.goto('http://127.0.0.1:' + p + '/sorteo.html', { waitUntil: 'load' });
    await pg.waitForTimeout(1200);
    const m = await pg.evaluate(() => { const c = document.getElementById('como-func');
      return { visible: !!(c && !c.hidden && c.offsetParent !== null),
               txt: (document.getElementById('como-pasos') || {}).textContent || '',
               pasos: document.querySelectorAll('#como-pasos li').length }; });
    console.log('   N=' + String(n).padStart(3) + ' visible=' + m.visible + ' pasos=' + m.pasos
              + '  ' + m.txt.slice(0, 80).replace(/\s+/g, ' '));
    af(errsE.length === 0, 'errores con N=' + n + ': ' + JSON.stringify(errsE.slice(0, 2)));
    if (n >= 3) {
      af(m.visible, '🔴 con N=' + n + ' el bloque debe verse');
      af(m.pasos === 4, 'con N=' + n + ' deben ser 4 renglones, hubo ' + m.pasos);
    } else {
      af(!m.visible, '🔴 con N=' + n + ' NO hay rondas: el bloque tiene que CALLARSE');
    }
    if (n === 66) af(/24 de los 66/.test(m.txt) && /24 · 12 · 6 · 3 · 1/.test(m.txt),
                     'con 66: «24 de los 66» y la escalera completa');
    if (n === 23) af(/12 de los 23/.test(m.txt) && !/24/.test(m.txt),
                     '🔴 con 23 NO puede mencionar los 24. Dijo: ' + m.txt.slice(0, 110));
    if (n === 11) af(/6 de los 11/.test(m.txt) && !/\b12\b/.test(m.txt),
                     '🔴 con 11 no puede mencionar 12. Dijo: ' + m.txt.slice(0, 110));
    if (n === 5)  af(/3 de los 5/.test(m.txt) && /3 · 1/.test(m.txt), 'con 5 dice 3 · 1');
    await pg.close();
  }
  SIN_GIRO = false;

  // ── F · LOS TRES BOTONES, «GIRAR» FUERA Y EL RELOJ ─────────────────────
  console.log('\n── F · los tres botones, «Girar» fuera y el reloj ──');
  // ⚠️ DENTRO de la ventana y PASADA la revelacion (116.7 s), no en t=200 s:
  // con t=200 s el show es una REPETICION de 2:12, asi que `pintarPanel` aun no
  // habia corrido y el reloj seguia mostrando el «10:00» del HTML. Mi primera
  // version media la pagina antes de que existiera lo que queria medir.
  const ESPERA_F = 20000;
  ARRANQUE = Date.now() - 125000; TOPE = Infinity; RES = 'pendiente'; RESUELTOS = [];
  pg = await nav.newPage({ viewport: { width: 390, height: 900 } });
  const errsF = []; pg.on('pageerror', (e) => errsF.push(e.message));
  await pg.goto('http://127.0.0.1:' + p + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(2500);
  // Abrir el candadito
  await pg.click('#llave');
  await pg.fill('#tok', 'tok');
  await pg.press('#tok', 'Enter');
  // Se espera a que el show ACABE (giro final 11 s + revelacion 4.2 s) para que
  // el panel exista: medir el reloj antes es medir el HTML, no el codigo.
  await pg.waitForTimeout(ESPERA_F);
  let b = await pg.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return !!(e && e.offsetParent !== null); };
    const txt = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
    return { admin: vis('admin'), si: txt('si'), no: txt('no'), nocumple: txt('nocumple'),
             girar: vis('girar'), cerrado: vis('sorteo-cerrado'),
             reloj: txt('reloj-n'), revel: (window.__sorteoShow && 1) || 0 };
  });
  console.log('   pendiente ', JSON.stringify(b));
  af(b.admin, 'el modo admin abre con el token');
  af(b.nocumple === 'No cumple las bases', '🔴 el TERCER botón existe y se llama así, dijo ' + b.nocumple);
  af(b.si === 'Aceptó el premio', 'el primero dice «Aceptó el premio», dijo ' + b.si);
  af(b.girar === true && b.cerrado === false, 'con un pendiente, «Girar» está y el aviso no');
  // 🔒 EL RELOJ ARRANCA EN LA REVELACIÓN. El giro lleva 200 s y la revelación
  // cae en 116.7 s, así que quedan 10min − (200−116.7) = 8:36 aprox.
  const m10 = /^(\d+):(\d\d)$/.exec(b.reloj || '');
  const seg = m10 ? Number(m10[1]) * 60 + Number(m10[2]) : -1;
  const transcurrido = (Date.now() - ARRANQUE) / 1000;
  const esperado = momentos[momentos.length - 1] / 1000 + 600 - transcurrido;
  console.log('   reloj=' + b.reloj + ' (' + seg + 's) · esperado ~' + Math.round(esperado) + 's');
  af(Math.abs(seg - esperado) < 8,
     '🔴 el reloj no arranca en la REVELACIÓN: marcó ' + seg + 's y se esperaban ~'
     + Math.round(esperado) + 's (arrancando en creado_at habria marcado ~'
     + Math.round(600 - transcurrido) + 's)');

  // ── El descarte: en público NO sale el motivo ───────────────────────────
  RES = 'se_regira';
  RESUELTOS = [{ id: 'g1', intento: 1, resultado: 'se_regira', nombre: null, folio: null,
                 total_participantes: 66, creado_at: new Date(ARRANQUE).toISOString() }];
  await pg.waitForTimeout(4500);
  const d = await pg.evaluate(() => ({
    cuerpo: document.body.innerText,
    placa: (document.getElementById('pg-l') || {}).textContent,
  }));
  af(/Se vuelve a girar/.test(d.placa || '') || /Se vuelve a girar/.test(d.cuerpo),
     '🔴 en público el descarte dice «Se vuelve a girar», la placa dijo ' + d.placa);
  af(!/no cumple|no_cumple|no sigue|no_sigue/i.test(d.cuerpo),
     '🔴 EL MOTIVO DEL DESCARTE SALIÓ EN PANTALLA PÚBLICA');

  // ── Con `acepto`, «Girar» se va ─────────────────────────────────────────
  RES = 'acepto';
  RESUELTOS = [{ id: 'g1', intento: 1, resultado: 'acepto', nombre: rondas.orden[0].nombre,
                 folio: rondas.orden[0].folio, total_participantes: 66,
                 creado_at: new Date(ARRANQUE).toISOString() }];
  await pg.waitForTimeout(4500);
  b = await pg.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return !!(e && e.offsetParent !== null); };
    return { girar: vis('girar'), cerrado: vis('sorteo-cerrado'), rescate: vis('rescate'),
             acciones: vis('acciones') };
  });
  console.log('   acepto    ', JSON.stringify(b));
  af(b.girar === false, '🔴 con ganador confirmado «Girar» tiene que DESAPARECER (no deshabilitado)');
  af(b.cerrado === true, 'y el aviso de «sorteo cerrado» ocupa su lugar: un hueco no explica nada');
  af(b.acciones === false, 'los tres botones se van con el sorteo resuelto');
  af(b.rescate === true, 'y el «¿no ganaste?» aparece SOLO con acepto');
  af(errsF.length === 0, 'errores en F: ' + JSON.stringify(errsF.slice(0, 3)));
  await pg.close();
  RES = 'pendiente'; RESUELTOS = [];

  await nav.close(); srv.close();
  console.log('\n' + (mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' en verde, ' + mal + ' en rojo');
  fallos.forEach((x) => console.log('  · ' + x));
  process.exit(mal ? 1 : 0);
})();
