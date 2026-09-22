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
let CAER = false;             // el estado contesta 502: el bloque debe CALLARSE
let N = 66;                   // registrados, cuando no hay giro
let RES = 'pendiente';        // el resultado PUBLICO del giro vivo
let RESUELTOS = [];           // los `giros` que ve el publico
let CUERPOS = [];             // lo que la pagina MANDO de verdad
let QUERIES = [];             // y con que query

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
  if (/giveaway-estado/.test(u)) {
    QUERIES.push(q.url);
    if (CAER) { r.writeHead(502, {'Content-Type':'application/json'}); return r.end('{"ok":false}'); }
    const e = estado();
    // Refleja el modo que le pidieron: la banda tiene que salir de AQUI, no de
    // lo que la pagina crea.
    e.modo = /modo=ensayo/.test(q.url) ? 'ensayo' : 'real';
    if (e.modo === 'ensayo') { e.ultimo = null; e.total = 0; }
    r.writeHead(200, {'Content-Type':'application/json'});
    return r.end(JSON.stringify(e));
  }
  // La puerta privada, lo justo para que `entrar()` abra el modo admin: el
  // careo tiene que poder VER los botones, no solo el fuente.
  if (/giveaway-sortear/.test(u)) {
    let cuerpo = '';
    q.on('data', (c) => { cuerpo += c; });
    return q.on('end', () => {
      let b = {}; try { b = JSON.parse(cuerpo || '{}'); } catch (_) {}
      CUERPOS.push(b);
      r.writeHead(200, { 'Content-Type': 'application/json' });
      if (/^ensayo_/.test(String(b.accion || ''))) {
        if (b.modo !== 'ensayo') return r.end(JSON.stringify({ ok: false, error: 'SIN MODO ENSAYO' }));
        return r.end(JSON.stringify({ ok: true, ensayo: true, sembrados: 24, avatares: 24,
          giros_borrados: 1, fotos_borradas: 24 }));
      }
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
  rgVis: !!document.querySelector('#reloj-ganador:not([hidden])'),
  rgN: (document.getElementById('rg-n') || {}).textContent,
  comoArriba: (() => {
    const c = document.getElementById('como-func'), m = document.getElementById('maquina');
    if (!c || !m) return null;
    // 🔒 «ARRIBA de la máquina» se mide con la GEOMETRÍA, no con el orden del
    // DOM: un `order` de flexbox o un `position` los reordena sin tocar el HTML.
    return { visible: !c.hidden && c.offsetParent !== null,
             arriba: c.getBoundingClientRect().top < m.getBoundingClientRect().top,
             pasos: document.querySelectorAll('#como-pasos li').length,
             txt: (document.getElementById('como-pasos') || {}).textContent || '' };
  })(),
}));

// 🔴 NO SE ADIVINA EL INSTANTE: SE CAZA LA FASE.
//
// Con el show en 40 s las fases miden 5 s y el apagado 1.4 s, mientras que
// cargar la pagina mete 1-3 s de variacion. Esperar por reloj de pared se
// pasaba la ventana y los rojos eran del arnes, no del codigo — seis de una
// sentada. Esto sondea cada 120 ms hasta ver la fase o hasta el plazo: mide LO
// MISMO y es inmune a la variacion.
//
// 🔒 Y con PLAZO: una fase que NUNCA ocurre sigue siendo un rojo, no un verde
// silencioso. Devuelve `visto:false` y la asercion lo dice por su nombre.
async function cazar(pg, foto, pred, msMax, nombre) {
  const t0 = Date.now();
  let ultima = null;
  while (Date.now() - t0 < msMax) {
    ultima = await foto(pg);
    if (pred(ultima)) return { visto: true, f: ultima, ms: Date.now() - t0 };
    await new Promise((r) => setTimeout(r, 120));
  }
  return { visto: false, f: ultima, ms: Date.now() - t0, nombre };
}

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
  const T = TI.T;
  // 1 · 🔴 LA PRESENTACION ES UNO POR UNO. Se caza un estado INTERMEDIO —entre
  // 3 y 20 fichas— para probar que van APILANDOSE y no apareciendo de golpe.
  // Si aparecieran todas juntas, este estado no existiria nunca.
  let c = await cazar(pg, foto, (x) => x.total >= 3 && x.total <= 20,
                      T.CUENTA_321_MS + 6 * T.SACA_UNO_MS + 4000, 'presentacion a medias');
  console.log('   saliendo uno por uno @' + c.ms + 'ms · ' + (c.f && c.f.total) + ' fichas · '
            + JSON.stringify((c.f || {}).quedan));
  af(c.visto, '🔴 nunca se vio la presentacion A MEDIAS: o aparecen de golpe, o no aparecen');
  af(c.visto && /\d+ de 24/.test((c.f || {}).quedan || ''),
     'y el encabezado lleva la cuenta «N de 24», dijo ' + (c.f || {}).quedan);
  // Y el reloj GANADOR EN todavia NO, porque no estan los 24.
  af(c.visto && c.f.rgVis === false,
     '🔴 el reloj «GANADOR EN» no puede arrancar antes de que esten los 24');

  // 1b · La presentacion COMPLETA: las 24, y ahi si arranca el reloj.
  c = await cazar(pg, foto, (x) => x.total === 24 && x.vivas === 24 && x.fuera === 0,
                  T.CUENTA_321_MS + 24 * T.SACA_UNO_MS + 6000, 'presentacion completa');
  console.log('   los 24 completos     @' + c.ms + 'ms ', JSON.stringify((c.f || {}).quedan),
              '· reloj', (c.f || {}).rgN);
  af(c.visto, '🔴 nunca se completaron las 24: ' + JSON.stringify(c.f));
  af(c.visto && /Quedan 24/.test((c.f || {}).quedan || ''),
     'al completarse dice «Quedan 24», dijo ' + (c.f || {}).quedan);
  // 🔴 EL RELOJ «GANADOR EN», visible y con el numero DERIVADO.
  const cr = await cazar(pg, foto, (x) => x.rgVis === true, 3000, 'reloj ganador');
  af(cr.visto, '🔴 el reloj «GANADOR EN» tiene que aparecer al completarse los 24');
  if (cr.visto) {
    const mm = /^(\d+):(\d\d)$/.exec((cr.f.rgN || '').trim());
    const seg = mm ? Number(mm[1]) * 60 + Number(mm[2]) : -1;
    const esp = Math.round(TI.cuentaGanadorMs(escalones) / 1000);
    console.log('   reloj GANADOR EN = ' + cr.f.rgN + ' (' + seg + 's) · esperado ~' + esp + 's');
    af(Math.abs(seg - esp) <= 3,
       '🔴 el reloj marco ' + seg + 's y el derivado dice ' + esp + 's — hay un numero tecleado');
  }

  // 2 · APAGADO: las MISMAS 24 en la rejilla, 12 con el foco muerto.
  c = await cazar(pg, foto, (x) => x.total === 24 && x.fuera === 12 && x.vivas === 12,
                  momentos[1] + T.RONDA_REDOBLE_MS + T.RONDA_APAGADO_MS + 5000, 'apagado');
  console.log('   apagado     @' + c.ms + 'ms ', JSON.stringify(c.f));
  af(c.visto, '🔴 nunca se vio el APAGADO (24 en la rejilla, 12 apagadas): ' + JSON.stringify(c.f));
  af(c.visto && c.f.total === 24,
     '🔒 durante el apagado las 24 SIGUEN en la rejilla: es lo que hace que se vea QUIEN salio');

  // 🔴 Y EL APAGADO TIENE QUE ANIMAR, no re-dibujar. Si `pintarMosaico`
  // reconstruyera el DOM, las eliminadas APARECERIAN ya apagadas y el foco
  // muriendose —el unico momento autoral de esta pantalla— no ocurriria nunca.
  if (c.visto) {
    const anim = await pg.evaluate(() => {
      const rej = document.getElementById('mosaico');
      const ap = [...document.querySelectorAll('.mos.fuera')];
      return { muere: rej ? rej.style.getPropertyValue('--muere') : null,
               conTransicion: ap.filter((e) => getComputedStyle(e).transitionDuration !== '0s').length,
               total: ap.length };
    });
    console.log('   --muere=' + anim.muere + ' · con transicion ' + anim.conTransicion + '/' + anim.total);
    af(!!anim.muere, '🔴 el apagado no fijo `--muere`: no hay transicion que animar');
    af(anim.conTransicion === anim.total,
       'las ' + anim.total + ' apagadas tienen transicion viva, no aparecieron ya muertas');
  }

  // 3 · REACOMODO: los apagados se van y quedan 12, en 4 columnas.
  c = await cazar(pg, foto, (x) => x.total === 12 && x.vivas === 12,
                  T.RONDA_REACOMODO_MS + 5000, 'reacomodo');
  console.log('   reacomodo   @' + c.ms + 'ms ', JSON.stringify(c.f));
  af(c.visto, '🔴 nunca se vio el REACOMODO (solo los 12): ' + JSON.stringify(c.f));
  af(c.visto && /Quedan 12/.test(c.f.quedan || ''),
     'el encabezado dice «Quedan 12», dijo ' + (c.f || {}).quedan);
  af(errs.length === 0, 'errores de pagina: ' + JSON.stringify(errs.slice(0,3)));
  await pg.close();

  // ── B · SOSTIENE: el servidor deja de publicar la ronda de 12 ───────────
  console.log('\n── B · el redoble SE SOSTIENE si falta el dato ──');
  ARRANQUE = Date.now(); TOPE = 1;        // solo la ronda 0
  pg = await nav.newPage({ viewport: { width: 390, height: 900 } });
  const errs2 = []; pg.on('pageerror', (e) => errs2.push(e.message));
  await pg.goto('http://127.0.0.1:' + p + '/sorteo.html', { waitUntil: 'load' });
  // Ya pasado el momento de la ronda 2 (que con la presentacion uno por uno
  // cae en el segundo 39, no en el 7).
  await pg.waitForTimeout(momentos[1] + 3000);
  f = await foto(pg);
  console.log('   t≈24s, servidor recortado ', JSON.stringify(f));
  af(f.redoble === true, '🔴 pasado el momento sin dato, el redoble tiene que estar SOSTENIDO');
  af(f.vivas === 24 && f.fuera === 0, '🔴 y NO se salto la ronda: siguen las 24, hubo ' + f.vivas + '/' + f.fuera);
  af(/Ronda 2/.test(f.quedan || ''), 'el encabezado avisa que espera la ronda 2, dijo ' + f.quedan);
  const antesPed = pedidos;
  await pg.waitForTimeout(3000);
  af(pedidos > antesPed, '🔴 la pagina NO se trabo: siguio latiendo (' + (pedidos - antesPed) + ' peticiones en 3s)');
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
  // ⚠️ Antes aqui se afirmaba «pero todavia NO la pinta». Con el show en 40 s
  // eso dejo de ser cierto Y ESTA BIEN: el dato llego con su momento ya
  // PASADO, y la animacion esta anclada al reloj, asi que la pinta de
  // inmediato — que es justo lo que evita que el retraso se arrastre al resto
  // del show. La asercion vieja habria condenado el comportamiento correcto.
  c = await cazar(pg, foto, (x) => x.fuera === 12 || x.total === 12,
                  T.RONDA_REDOBLE_MS + T.RONDA_APAGADO_MS + 4000, 'recuperacion');
  af(c.visto, '🔴 tras soltar, la ronda de 12 tiene que pintarse: ' + JSON.stringify(c.f));
  af(errs2.length === 0, 'errores de pagina en B: ' + JSON.stringify(errs2.slice(0,3)));
  await pg.close();

  // ── C · DENTRO DE LA VENTANA SE SINCRONIZA ──────────────────────────────
  // El que entra en el segundo 90 tiene que ALCANZAR al instante la ronda que
  // va, no arrancar el show de cero. Con temporizadores relativos esto tardaba
  // dos minutos en ponerse al dia.
  console.log('\n── C · dentro de la ventana SE SINCRONIZA ──');
  const total = TI.duracionTotal(escalones);
  console.log('   el show dura ' + (total / 1000).toFixed(1) + ' s');
  // Dentro de la ventana y en la fase de APAGADO de la ronda de 3.
  // Se entra JUSTO ANTES de la ronda de 3 y se caza su apagado: asi la carga
  // de la pagina cabe dentro de la ventana en vez de comersela.
  const tDentro = momentos[3] - 1200;
  ARRANQUE = Date.now() - tDentro; TOPE = Infinity;
  pg = await nav.newPage({ viewport: { width: 390, height: 900 } });
  const errs3 = []; pg.on('pageerror', (e) => errs3.push(e.message));
  await pg.goto('http://127.0.0.1:' + p + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  f = await foto(pg);
  console.log('   entra en t=' + (tDentro / 1000).toFixed(1) + 's        ', JSON.stringify(f.show), '· vivas', f.vivas);
  af(f.show && f.show.sincronizado === true, '🔴 dentro del show tiene que ir SINCRONIZADO');
  af(f.show && f.show.pintadas >= 3,
     '🔴 y ALCANZAR al instante: pintadas=' + (f.show && f.show.pintadas) + ', se esperaban >=3');
  af(f.show && Math.abs(f.show.t - (tDentro + 1500)) < 3000,
     'el reloj del show va pegado al del servidor, t=' + (f.show && f.show.t));
  // El apagado de la ronda de 3: se ven los SEIS de la anterior, 3 con el foco
  // muerto. Y despues el reacomodo deja solo a los tres, mas grandes.
  let c3 = await cazar(pg, foto, (x) => x.total === 6 && x.vivas === 3 && x.fuera === 3,
                       TI.T.RONDA_REDOBLE_MS + TI.T.RONDA_APAGADO_MS + 5000, 'apagado de la de 3');
  console.log('   apagado de la de 3 @' + c3.ms + 'ms ', JSON.stringify(c3.f));
  af(c3.visto, '🔴 nunca se vio el apagado de la ronda de 3 (6 tarjetas, 3 muertas): ' + JSON.stringify(c3.f));
  c3 = await cazar(pg, foto, (x) => x.total === 3 && x.vivas === 3 && x.cols === '3',
                   TI.T.RONDA_REACOMODO_MS + 5000, 'reacomodo de la de 3');
  console.log('   reacomodo          @' + c3.ms + 'ms ', JSON.stringify(c3.f));
  af(c3.visto, '🔴 tras el reacomodo deben quedar SOLO los 3, en 3 columnas (asi CRECEN): '
     + JSON.stringify(c3.f));
  af(errs3.length === 0, 'errores en C: ' + JSON.stringify(errs3.slice(0, 3)));
  await pg.close();

  // ── D · FUERA DE LA VENTANA SE REPITE COMPLETO ──────────────────────────
  console.log('\n── D · fuera de la ventana SE REPITE desde el inicio ──');
  ARRANQUE = Date.now() - (TI.duracionTotal(escalones) * 5);   // el show ya acabo hace rato
  pg = await nav.newPage({ viewport: { width: 390, height: 900 } });
  const errs4 = []; pg.on('pageerror', (e) => errs4.push(e.message));
  await pg.goto('http://127.0.0.1:' + p + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(3000);
  f = await foto(pg);
  console.log('   entra pasado el show      ', JSON.stringify(f.show), '· vivas', f.vivas);
  af(f.show && f.show.sincronizado === false, '🔴 fuera de la ventana NO se sincroniza: se repite');
  af(f.show && f.show.pintadas === 0,
     '🔴 y arranca DESDE LA RONDA 0: pintadas=' + (f.show && f.show.pintadas));
  // ⚠️ Antes aqui se afirmaba «empieza con las 24». Dejo de ser cierto cuando
  // los 24 pasaron a salir UNO POR UNO: a los 3 s legitimamente hay dos o
  // tres. Lo que importa es que arranque en la RONDA 0 y los vaya APILANDO,
  // no que aparezcan de golpe — que es justo lo que Memo pidio quitar.
  af(f.fuera === 0, 'en la repeticion nadie esta apagado todavia, hubo ' + f.fuera);
  af(f.vivas >= 1 && f.vivas < 24,
     '🔴 la repeticion tiene que estar SACANDOLOS uno por uno, no con las 24 puestas: hubo ' + f.vivas);
  af(/\d+ de 24/.test(f.quedan || ''),
     'y el encabezado lleva la cuenta, dijo ' + f.quedan);
  // Y llega a las 24: la repeticion corre la presentacion COMPLETA.
  const cD = await cazar(pg, foto, (x) => x.total === 24 && x.vivas === 24,
                         TI.T.CUENTA_321_MS + 24 * TI.T.SACA_UNO_MS + 6000, 'repeticion completa');
  af(cD.visto, '🔴 la repeticion no llego a las 24: ' + JSON.stringify(cD.f));
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
    const m = await pg.evaluate(() => {
      const c = document.getElementById('como-func'), mq = document.getElementById('maquina');
      return { visible: !!(c && !c.hidden && c.offsetParent !== null),
               arriba: !!(c && mq && c.getBoundingClientRect().top < mq.getBoundingClientRect().top),
               txt: (document.getElementById('como-pasos') || {}).textContent || '',
               pasos: document.querySelectorAll('#como-pasos li').length }; });
    console.log('   N=' + String(n).padStart(3) + ' visible=' + m.visible + ' arriba=' + m.arriba
              + ' pasos=' + m.pasos + '  ' + m.txt.slice(0, 66).replace(/\s+/g, ' '));
    // 🔴 ARRIBA DE LA MAQUINA, por orden de Memo: en el ensayo estaba debajo y
    // NO LO ENCONTRO. Se mide la GEOMETRIA, no el orden del DOM.
    if (n >= 3) af(m.arriba === true, '🔴 con N=' + n + ' el bloque tiene que estar ARRIBA de la maquina');
    af(errsE.length === 0, 'errores con N=' + n + ': ' + JSON.stringify(errsE.slice(0, 2)));
    if (n >= 3) {
      af(m.visible, '🔴 con N=' + n + ' el bloque debe verse');
      af(m.pasos === 4, 'con N=' + n + ' deben ser 4 renglones, hubo ' + m.pasos);
    } else {
      af(!m.visible, '🔴 con N=' + n + ' NO hay rondas: el bloque tiene que CALLARSE');
    }
    if (n === 66) af(/De los 66 registrados/.test(m.txt) && /24 → 12 → 6 → 3 → 1/.test(m.txt),
                     'con 66: «De los 66 registrados» y la escalera completa. Dijo: ' + m.txt.slice(0, 90));
    if (n === 23) af(/De los 23 registrados/.test(m.txt) && !/24/.test(m.txt),
                     '🔴 con 23 NO puede mencionar los 24. Dijo: ' + m.txt.slice(0, 110));
    if (n === 11) af(/De los 11 registrados/.test(m.txt) && !/\b12\b/.test(m.txt),
                     '🔴 con 11 no puede mencionar 12. Dijo: ' + m.txt.slice(0, 110));
    if (n === 5)  af(/De los 5 registrados/.test(m.txt) && /3 → 1/.test(m.txt), 'con 5 dice 3 → 1');
    await pg.close();
  }
  SIN_GIRO = false;

  // ── F · LOS TRES BOTONES, «GIRAR» FUERA Y EL RELOJ ─────────────────────
  console.log('\n── F · los tres botones, «Girar» fuera y el reloj ──');
  // ⚠️ DENTRO de la ventana y PASADA la revelacion (116.7 s), no en t=200 s:
  // con t=200 s el show es una REPETICION de 2:12, asi que `pintarPanel` aun no
  // habia corrido y el reloj seguia mostrando el «10:00» del HTML. Mi primera
  // version media la pagina antes de que existiera lo que queria medir.
  // Entra pasada la revelacion y se espera a que el show ACABE, para que el
  // panel exista: medir el reloj antes es medir el HTML, no el codigo.
  const tTrasRevelacion = momentos[momentos.length - 1] + 500;
  const ESPERA_F = TI.T.GIRO_FINAL_MS + TI.T.REVELACION_MS + 3500;
  ARRANQUE = Date.now() - tTrasRevelacion; TOPE = Infinity; RES = 'pendiente'; RESUELTOS = [];
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

  // ── G · LA BANDA DE ENSAYO Y SUS TRES CONTROLES ────────────────────────
  console.log('\n── G · la banda de ENSAYO y sus controles ──');
  ARRANQUE = Date.now() - tTrasRevelacion; TOPE = Infinity; RES = 'pendiente'; RESUELTOS = [];
  CUERPOS = []; QUERIES = [];
  pg = await nav.newPage({ viewport: { width: 390, height: 900 } });
  const errsG = []; pg.on('pageerror', (e) => errsG.push(e.message));
  // Se acepta el confirm sin pensar: lo que se mide es que el `modo` viaje,
  // no el dialogo.
  pg.on('dialog', (d) => d.accept());
  await pg.goto('http://127.0.0.1:' + p + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(2000);
  const bandaVis = () => pg.evaluate(() => { const b = document.getElementById('banda-ensayo');
    return { visible: !!(b && !b.hidden && b.offsetParent !== null),
             alto: b ? Math.round(b.getBoundingClientRect().height) : 0,
             txt: b ? b.textContent.trim() : null,
             interruptor: !!document.querySelector('#ens-modo'),
             ctrl: !!document.querySelector('#ens-ctrl:not([hidden])') }; });
  let bg = await bandaVis();
  af(bg.visible === false, '🔴 sin modo ensayo la banda NO se ve');
  af(bg.ctrl === false, 'y los controles del ensayo tampoco');
  // Sin token no hay interruptor a la vista (vive dentro del panel de admin).
  af(!(await pg.evaluate(() => { const a = document.getElementById('admin');
    return !!(a && a.offsetParent !== null); })), '🔒 sin token el panel de admin no está');

  await pg.click('#llave'); await pg.fill('#tok', 'tok'); await pg.press('#tok', 'Enter');
  await pg.waitForTimeout(1200);
  await pg.check('#ens-modo');
  await pg.waitForTimeout(2500);
  bg = await bandaVis();
  console.log('   con modo ensayo ', JSON.stringify(bg));
  af(bg.visible === true, '🔴 con modo ensayo la banda TIENE que verse');
  af(bg.alto >= 28, 'y ser grande (>=28px de alto), midió ' + bg.alto);
  af(/ENSAYO/i.test(bg.txt || ''), 'y decir ENSAYO, dijo ' + bg.txt);
  af(bg.ctrl === true, 'los tres controles aparecen');
  // 🔒 Y la GET del estado llevó el modo: la banda no es cosmética, el
  // servidor está contestando datos de ensayo.
  af(QUERIES.some((x) => /modo=ensayo/.test(x)),
     '🔴 ninguna consulta del estado llevó modo=ensayo');

  // 🔒 LOS TRES CONTROLES MANDAN `modo:"ensayo"` SIEMPRE. Medido sobre los
  // cuerpos que SALIERON del navegador, no leyendo el fuente.
  CUERPOS = [];
  for (const id of ['#ens-sembrar', '#ens-reiniciar', '#ens-borrar']) {
    await pg.click(id);
    await pg.waitForTimeout(900);
  }
  const deEnsayo = CUERPOS.filter((b) => /^ensayo_/.test(String(b.accion || '')));
  console.log('   cuerpos de ensayo:', JSON.stringify(deEnsayo.map((b) => [b.accion, b.modo])));
  af(deEnsayo.length === 3, 'los tres controles mandaron su acción, hubo ' + deEnsayo.length);
  af(deEnsayo.every((b) => b.modo === 'ensayo'),
     '🔴 un control de ensayo salió SIN modo:"ensayo" — habría tocado lo REAL');
  // Y TODO lo que la página manda en modo ensayo lo lleva, no solo esos tres.
  af(CUERPOS.every((b) => b.modo === 'ensayo'),
     '🔴 alguna petición en modo ensayo salió sin `modo`: ' + JSON.stringify(CUERPOS.filter((b) => b.modo !== 'ensayo').slice(0, 3)));

  // Al apagarlo, la banda se va y el modo deja de viajar.
  CUERPOS = []; QUERIES = [];
  await pg.uncheck('#ens-modo');
  await pg.waitForTimeout(2500);
  bg = await bandaVis();
  af(bg.visible === false, '🔴 al apagar el ensayo la banda se va');
  af(QUERIES.length > 0 && !QUERIES.some((x) => /modo=ensayo/.test(x)),
     '🔴 apagado el ensayo, el modo NO puede seguir viajando');
  af(errsG.length === 0, 'errores en G: ' + JSON.stringify(errsG.slice(0, 3)));
  await pg.close();

  // ── H · «COMO FUNCIONA» TAMBIEN EN /giveaway, CON LA MISMA COPY ────────
  // Orden de Memo: quien se esta inscribiendo tiene derecho a saber la
  // mecanica ANTES de dar sus datos. Y la copy sale de sorteo-tiempos.js, no
  // copiada en los dos HTML: el dia que la mecanica cambie, una copia se queda
  // vieja y nadie se entera.
  console.log('\n── H · «Como funciona» en /giveaway ──');
  SIN_GIRO = true;
  for (const [n, caer] of [[73, false], [23, false], [2, false], [73, true]]) {
    N = n; CAER = caer;
    pg = await nav.newPage({ viewport: { width: 390, height: 900 } });
    const errsH = []; pg.on('pageerror', (e) => errsH.push(e.message));
    await pg.goto('http://127.0.0.1:' + p + '/giveaway.html', { waitUntil: 'load' });
    await pg.waitForTimeout(1800);
    const m = await pg.evaluate(() => {
      const c = document.getElementById('como-func');
      const cu = document.querySelector('.cuerpo');
      return { tiempos: !!window.SORTEO_TIEMPOS,
               visible: !!(c && !c.hidden && c.offsetParent !== null),
               pasos: document.querySelectorAll('#como-pasos li').length,
               txt: (document.getElementById('como-pasos') || {}).textContent || '',
               arriba: !!(c && cu && c.getBoundingClientRect().top < cu.getBoundingClientRect().bottom),
               desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    console.log('   N=' + String(n).padStart(3) + (caer ? ' (estado CAIDO)' : '              ')
      + ' visible=' + m.visible + ' pasos=' + m.pasos + '  ' + m.txt.slice(0, 58).replace(/\s+/g, ' '));
    af(m.tiempos, 'sorteo-tiempos.js carga en /giveaway (N=' + n + ')');
    af(errsH.length === 0, 'errores en /giveaway con N=' + n + ': ' + JSON.stringify(errsH.slice(0, 2)));
    af(m.desborde === 0, 'sin desborde horizontal a 390px en /giveaway (N=' + n + ')');
    if (caer) {
      // 🔒 Si no se puede leer el total, el bloque se CALLA. Prometer una
      // mecanica con un numero inventado es peor que no prometerla.
      af(!m.visible, '🔴 con el estado caido el bloque tiene que CALLARSE, no inventar el N');
    } else if (n >= 3) {
      af(m.visible, '🔴 con N=' + n + ' el bloque tiene que verse en /giveaway');
      af(m.pasos === 4, 'cuatro renglones, hubo ' + m.pasos);
      af(new RegExp('De los ' + n + ' registrados').test(m.txt),
         'trae el N VIVO (' + n + '), dijo: ' + m.txt.slice(0, 70));
      // 🔒 LA MISMA COPY, careada contra la funcion compartida caracter por
      // caracter: es la unica forma de que «una sola definicion» sea un hecho.
      const esp = TI.textoComoFunciona(n).map((t) => t.replace(/<\/?b>/g, '')).join('');
      af(m.txt.replace(/\s+/g, ' ').trim() === esp.replace(/\s+/g, ' ').trim(),
         '🔴 la copy de /giveaway NO es la de sorteo-tiempos.js');
      if (n === 23) af(!/24/.test(m.txt), '🔴 con 23 no puede mencionar los 24');
    } else {
      af(!m.visible, '🔴 con N=' + n + ' no hay rondas: el bloque se calla');
    }
    await pg.close();
  }
  SIN_GIRO = false; CAER = false;

  await nav.close(); srv.close();
  console.log('\n' + (mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' en verde, ' + mal + ' en rojo');
  fallos.forEach((x) => console.log('  · ' + x));
  process.exit(mal ? 1 : 0);
})();
