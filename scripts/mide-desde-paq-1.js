#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-desde-paq-1.js — DESDE-PAQ-1 · el «desde» de cada paquete, un dueño
//
// Reporte de Memo con capturas (23-sep-2026, EDC27): PLUS «desde $4,100» y
// CHEAP «desde $5,200» — el todo incluido MÁS BARATO que el boleto solo —
// cuando el CHEAP real de 1 día son $2,400.
//
// 🔒 LOS DOS LADOS SON COMMITS y los dos SE SIRVEN: cada árbol sale con
// `git archive` y lo levanta su propio servidor, así que el careo no caduca al
// mergear. Y commitear exige RE-ANCLAR: si con `HEAD_SHA=<sha>` a mano sale
// verde y a secas sale rojo, el ancla está vieja, no el código.
//
// 🔒 SE ENTRA POR LA URL DEL CLIENTE (`/edc27`) en 390×844 — que además es el
// camino que corre DURANTE EL PARSEO y por el que un `var` de nivel superior
// vale `undefined`. Un careo que llamara `showDetail()` a mano sale verde
// aunque el deep-link esté roto: comprobado en CARD-ITIN.
//
// 🔒 EL CATÁLOGO ES EL REAL, servido por cada árbol, y se parsea con el DUEÑO
// del parseo (`_lib/catalogo-index._parseEV`) — el mismo instrumento para los
// dos lados, para no mezclar «fijar el dato» con «variar el compilador».
//
// Se corre:  npm run mide:desde-paq-1
// ══════════════════════════════════════════════════════════════════════════
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const RAIZ = path.join(__dirname, '..');
const { _parseEV } = require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));

let verde = 0, rojo = 0, completo = false;
const fallos = [];
function af(cond, msg) {
  let ok = false;
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; }
  catch (e) { ok = false; msg = msg + '  [EXCEPCIÓN: ' + e.message + ']'; }
  if (ok) verde++; else { rojo++; fallos.push(msg); console.log('   ✗ ' + msg); }
}
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  console.log((rojo ? '❌ ROJO · ' : '✅ VERDE · ') + verde + ' en verde, ' + rojo + ' en rojo');
  fallos.slice(0, 16).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
function servidor(raiz) {
  return http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (/\.netlify\/functions\//.test(u)) {
      q.on('data', () => {});
      return q.on('end', () => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{"ok":true}'); });
    }
    const rel = decodeURIComponent(u).replace(/^\//, '');
    const f = path.join(raiz, rel || 'index.html');
    fs.readFile(f, (e, b) => {
      // `/<slug>` es una url REAL del cliente: producción la resuelve al index.
      if (e) {
        return fs.readFile(path.join(raiz, 'index.html'), (e2, b2) => {
          if (e2) { r.writeHead(404); return r.end('no'); }
          r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(b2);
        });
      }
      const tipo = /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css'
        : /\.jpe?g$/.test(f) ? 'image/jpeg' : /\.png$/.test(f) ? 'image/png'
        : /\.webp$/.test(f) ? 'image/webp' : 'text/html; charset=utf-8';
      r.writeHead(200, { 'Content-Type': tipo }); r.end(b);
    });
  });
}
// ⚠️ EL ONBOARDING TAPA LA PANTALLA, y eso es la realidad del cliente: el popup
// «¿Cómo reservar tu lugar?» se abre **300 ms después** de la ficha y cubre todo
// con `z-index:9999`, así que para apretar cualquier cosa hay que cerrarlo
// primero — igual que lo hace una persona. Es la forma de `6b1c789`
// (CARD-ITIN: «el careo cierra el onboarding como lo cierra el cliente»).
//
// 🔴 Y AQUÍ COSTÓ UNA CONDICIÓN DE MERGE. Mi versión apretaba «2 personas» a
// ciegas: en mi máquina el clic **le ganaba la carrera** a los 300 ms y salía
// verde, y en la de Jane el overlay ya estaba puesto y Playwright se quedó
// esperando hasta el TimeoutError — dos corridas. Un careo que depende del
// timing para no colgarse es la familia de la ventana de ~150 ms: **verde por
// suerte en una máquina y caído en otra**, y de las dos formas no mide.
//
// 🔒 POR ESO NO SE SIGUE POR RELOJ: se espera a que el overlay DEJE DE TAPAR,
// que es la condición de verdad. Y el estado se DEVUELVE, para poder afirmar
// que el onboarding sigue vivo —que es la regresión que más miedo da— en vez
// de que un careo verde esconda que dejó de salir.
const _tapa = () => {
  const e = document.getElementById('onboard-bg');
  if (!e) return false;
  const cs = getComputedStyle(e), r = e.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && r.height > 0;
};
async function cerrarOnboarding(pg) {
  // Se le da su ventana de 300 ms para APARECER, sin colgarse si no aparece
  // (no siempre sale: `showOnboarding` se salta con promo o itinerario solo).
  const salio = await pg.waitForFunction(_tapa, { timeout: 2500 }).then(() => true).catch(() => false);
  if (salio) await pg.evaluate(() => { if (typeof skipOnboarding === 'function') skipOnboarding(); });
  // La condición, no el reloj: nadie aprieta nada hasta que el overlay se fue.
  await pg.waitForFunction(`!(${_tapa.toString()})()`, { timeout: 10000 });
  return salio;
}
const BASE = process.env.BASE || '5b2c107';
const HEAD_SHA = process.env.HEAD_SHA || 'b9b1bb6';   // el commit del MERGE (#769)

// ── LAS COMPUERTAS QUE DECIDEN SI EL NÚMERO SE PINTA ────────────────────
// Copiadas del ORDEN REAL de updatePkgCards, no parafraseadas. Sin ellas el
// barrido mide FÓRMULAS y no lo que el cliente ve: con las fórmulas a secas
// salían CUATRO violaciones y dos eran de `fanfest-*`, que son `rideOnly` y no
// pintan NINGUNO de los dos números. Contarlas habría vuelto ruido el control.
function pintaPlus(ev) { return !ev.rideOnly && !ev.cheapOnly; }
function pintaCheap(ev, desdeCheap) {
  if (ev.cheapSoon && !ev.rideOnly) return false;   // pinta «PRÓXIMAMENTE»
  if (ev.noCheap) return false;                      // NOCHEAP-1: lo esconde
  if (ev.rideOnly && !ev.cheapAlsoOk) return false;  // se sale antes
  return desdeCheap > 0;
}
// 🔒 Y LA PUERTA DE ARRIBA: un AGOTADO no abre la ficha (regla de la casa), así
// que sus números no los ve nadie. Se cuenta aparte en vez de mezclarlo.
function abreFicha(ev) {
  return ev.st !== 'agotado' && !ev._past && ev.st !== 'proceso'
      && ev.st !== 'solo-viaje' && ev.st !== 'proximamente';
}
// Las DOS lecturas, cada una copiada de SU árbol. La de BASE es el defecto.
function desdePlusBase(ev) {
  var _z = (ev.multifecha ? ev.multifecha.reduce(function (a, mf) { return a.concat(mf.zonas); }, ev.zonas || []) : (ev.zonas || []));
  if (ev.cheapOnly && ev.cheapZonas) _z = ev.cheapZonas;
  var a = _z.filter(function (z) { return !z.ag && !z.prox && z.p > 0; });
  if (!a.length) { if (ev.rideOnly && ev.ride > 0) return ev.ride; return 0; }
  return Math.min.apply(null, a.map(function (z) { return z.p; }));
}
function desdeCheapBase(ev) {
  if (ev.cheapZonas && Array.isArray(ev.cheapZonas)) {
    var a = ev.cheapZonas.filter(function (z) { return !z.ag && z.p > 0; });
    if (a.length) return Math.min.apply(null, a.map(function (z) { return z.p; }));
  }
  return 0;
}
function barrer(EV, dPlus, dCheap) {
  let ambos = 0, viol = [], violAbiertos = [];
  for (const ev of EV) {
    const c = dCheap(ev);
    if (!pintaPlus(ev) || !pintaCheap(ev, c)) continue;
    const p = dPlus(ev);
    if (!(p > 0 && c > 0)) continue;
    ambos++;
    if (p < c) { viol.push(ev.id + ' PLUS ' + p + ' < CHEAP ' + c); if (abreFicha(ev)) violAbiertos.push(ev.id); }
  }
  return { ambos, viol, violAbiertos };
}
const dinero = (s) => Number(String(s == null ? '' : s).replace(/[^0-9]/g, '')) || 0;

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'desde-base'), h = sacar(HEAD_SHA, 'desde-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit: el par no dice nada.'); process.exit(1); }
  const sb = servidor(b.dir), sh = servidor(h.dir);
  await new Promise((r) => sb.listen(0, r)); await new Promise((r) => sh.listen(0, r));
  const uB = 'http://127.0.0.1:' + sb.address().port, uH = 'http://127.0.0.1:' + sh.address().port;

  // ── [I] EL INSTRUMENTO, antes de creerle nada ─────────────────────────
  console.log('[I] el instrumento');
  const htmlB = await (await fetch(uB + '/index.html')).text();
  const htmlH = await (await fetch(uH + '/index.html')).text();
  const evB = _parseEV(htmlB), evH = _parseEV(htmlH);
  af(Array.isArray(evB) && evB.length > 100, 'el catálogo de BASE no se sirvió/parseó: ' + (evB || []).length);
  af(Array.isArray(evH) && evH.length > 100, 'el catálogo de HEAD no se sirvió/parseó: ' + (evH || []).length);
  af(evB.length === evH.length,
     'los dos árboles tienen distinto número de eventos (' + evB.length + ' vs ' + evH.length + '): esta '
     + 'tuerca no toca el catálogo, así que un barrido comparado mediría dos universos');
  console.log('    catálogo servido: ' + evB.length + ' eventos en los dos lados');

  // ── [S] EL BARRIDO DEL CATÁLOGO ENTERO · la invariante ────────────────
  // 🔒 CONTROL POSITIVO QUE NO PUEDE CADUCAR: no depende de una fecha ni de un
  // sitio vivo, solo de que BASE es un commit con el defecto dentro.
  console.log('\n[S] la invariante desde(PLUS) ≥ desde(CHEAP), catálogo entero');
  const rB = barrer(evB, desdePlusBase, desdeCheapBase);
  // En HEAD se le pregunta al DUEÑO, ejecutado en la página servida — no se
  // re-escribe su regla aquí: si el arnés repite la cuenta, los dos pueden
  // estar igual de equivocados.
  const nav = await chromium.launch();
  const ctxH = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pgH = await ctxH.newPage();
  const errsH = []; pgH.on('pageerror', (e) => errsH.push(e.message));
  await pgH.goto(uH + '/', { waitUntil: 'domcontentloaded' });
  af(typeof await pgH.evaluate('typeof desdeDelPaquete') === 'string' && await pgH.evaluate('typeof desdeDelPaquete') === 'function',
     'el dueño `desdeDelPaquete` no existe en la página de HEAD: todo lo de abajo mediría otra cosa');
  const rH = await pgH.evaluate(`(() => {
    const pintaPlus = (ev) => !ev.rideOnly && !ev.cheapOnly;
    const abre = (ev) => ev.st !== 'agotado' && !ev._past && ev.st !== 'proceso' && ev.st !== 'solo-viaje' && ev.st !== 'proximamente';
    let ambos = 0; const viol = [], violAbiertos = [];
    for (const ev of EV) {
      const c = desdeDelPaquete(ev, 'cheap');
      if (ev.cheapSoon && !ev.rideOnly) continue;
      if (ev.noCheap) continue;
      if (ev.rideOnly && !ev.cheapAlsoOk) continue;
      if (!(c > 0) || !pintaPlus(ev)) continue;
      const p = desdeDelPaquete(ev, 'plus');
      if (!(p > 0 && c > 0)) continue;
      ambos++;
      if (p < c) { viol.push(ev.id + ' PLUS ' + p + ' < CHEAP ' + c); if (abre(ev)) violAbiertos.push(ev.id); }
    }
    return { ambos, viol, violAbiertos };
  })()`);
  console.log('    BASE: ' + rB.ambos + ' eventos pintan los dos · ' + rB.viol.length + ' violan → ' + JSON.stringify(rB.viol));
  console.log('    HEAD: ' + rH.ambos + ' eventos pintan los dos · ' + rH.viol.length + ' violan → ' + JSON.stringify(rH.viol));
  af(rB.ambos > 50,
     'CANDADO DE CARDINALIDAD: solo ' + rB.ambos + ' eventos pintan los dos números. Con un puñado, un '
     + '«0 violaciones» en HEAD no dice nada: pasaría en vacío');
  af(rH.ambos === rB.ambos,
     'el número de eventos que ofrecen LOS DOS paquetes cambió (' + rB.ambos + ' → ' + rH.ambos + '): esta '
     + 'tuerca arregla un PRECIO, no puede quitar ni poner paquetes a la venta');
  af(rB.viol.length > 0,
     'CONTROL POSITIVO EN ROJO: BASE tenía que VIOLAR la invariante y no la viola. Si el defecto no está '
     + 'en BASE, el verde de HEAD no prueba que esta tuerca arregle nada');
  af(rB.violAbiertos.indexOf('edc27') >= 0,
     'el caso que Memo reportó (edc27) no sale violando en BASE con la ficha abierta: ' + JSON.stringify(rB.violAbiertos));
  af(rH.viol.length === 0,
     'HEAD sigue violando la invariante en ' + rH.viol.length + ' eventos: ' + JSON.stringify(rH.viol));
  // Y el caso de `harry`: violaba en BASE pero con la ficha CERRADA (agotado).
  // Se nombra para que no parezca que el arreglo «sobró».
  af(rB.viol.some((v) => /^harry /.test(v)) && !rH.viol.some((v) => /^harry /.test(v)),
     '`harry` tenía que violar en BASE y no en HEAD. Su ficha está cerrada (agotado), así que nadie lo '
     + 'veía — pero es el MISMO defecto y el arreglo también lo alcanza');
  af(rB.violAbiertos.length === 1,
     'en BASE hay ' + rB.violAbiertos.length + ' eventos violando CON la ficha abierta y tenía que ser 1 '
     + '(edc27): si son más, el reporte de Memo describía solo una parte y hay que decírselo');

  // ── [E] EDC27 EN LA TARJETA RENDERIZADA, por la URL del cliente ───────
  console.log('\n[E] la tarjeta de edc27, entrando por /edc27 en 390×844');
  async function tarjeta(url, quien) {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(url + '/edc27', { waitUntil: 'domcontentloaded' });
    // 🔒 EL CLIENTE ELIGE VIAJEROS ANTES DE VER LOS PRECIOS. `updatePkgCards`
    // —la que pinta los `pp-*`— solo la llama `selViajeros`, así que recién
    // abierta la ficha los cuatro letreros dicen «—». Mi primera versión de este
    // bloque midió justo eso y puso CUATRO rojos sobre código sano, BASE incluido:
    // es la lección de ROL-MONTO-MUDO —saltarse un paso del wizard mide una
    // pantalla que ningún cliente ve—. Se aprieta «2 personas», que es un clic
    // de verdad, y se AFIRMA que se apretó.
    await pg.waitForSelector('#w-viajeros .wiz-btn', { timeout: 15000 });
    const onbSalio = await cerrarOnboarding(pg);
    await pg.click('#w-viajeros .wiz-btn:nth-child(2)');
    await pg.waitForFunction("document.getElementById('pp-cheap') && document.getElementById('pp-cheap').textContent !== '—'", { timeout: 15000 }).catch(() => {});
    const leer = () => pg.evaluate(`(() => {
      const v = (id) => { const e = document.getElementById(id); if (!e) return null;
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        return { txt: e.textContent.trim(), ve: !(cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || !e.offsetParent || r.width < 1) }; };
      return { plus: v('pp-plus'), cheap: v('pp-cheap'), stay: v('pp-stay'), ride: v('pp-ride'),
               ev: document.body.getAttribute('data-ev'), viaj: (typeof selViaj === 'number' ? selViaj : null) };
    })()`);
    const d = await leer();
    d.onbSalio = onbSalio;
    await ctx.close();
    console.log('    ' + quien.padEnd(5) + ' plus ' + (d.plus && d.plus.txt) + ' · cheap ' + (d.cheap && d.cheap.txt)
      + ' · stay ' + (d.stay && d.stay.txt) + ' · ride ' + (d.ride && d.ride.txt)
      + '   onboarding: ' + (onbSalio ? 'salió y se cerró' : 'no salió') + '   errores: ' + errs.length);
    return { d, errs };
  }
  const tB = await tarjeta(uB, 'BASE'), tH = await tarjeta(uH, 'HEAD');
  // La premisa: se llegó a la ficha de edc27 por la url, en los dos lados.
  af(tB.d.ev === 'edc27' && tH.d.ev === 'edc27',
     'la url `/edc27` no abrió la ficha de edc27 en los dos lados (BASE ' + tB.d.ev + ' / HEAD ' + tH.d.ev
     + '): sin esa premisa las lecturas de abajo son de otra pantalla');
  af(tB.d.viaj === 2 && tH.d.viaj === 2,
     'el clic de «2 personas» no prendió `selViaj` en los dos lados (BASE ' + tB.d.viaj + ' / HEAD '
     + tH.d.viaj + '): sin ese paso `updatePkgCards` no corre y los cuatro letreros dicen «—» — un rojo '
     + 'que parece del código y es del arnés');
  af(tB.errs.length === 0, 'la página de BASE tiró errores por la url: ' + JSON.stringify(tB.errs).slice(0, 200));
  af(tH.errs.length === 0, 'la página de HEAD tiró errores por la url: ' + JSON.stringify(tH.errs).slice(0, 200));
  af(tB.d.plus.ve && tB.d.cheap.ve && tH.d.plus.ve && tH.d.cheap.ve,
     '«existe» no es «se ve»: alguno de los dos precios no pasa su cadena de visibilidad');
  // 🔒 LA CAPTURA DE MEMO, EXIGIDA EN BASE. Es el control positivo con números.
  af(dinero(tB.d.plus.txt) === 4100 && dinero(tB.d.cheap.txt) === 5200,
     'BASE tenía que reproducir la captura de Memo —PLUS $4,100 y CHEAP $5,200— y pintó PLUS '
     + tB.d.plus.txt + ' / CHEAP ' + tB.d.cheap.txt);
  af(dinero(tH.d.plus.txt) === 4100,
     'el PLUS de edc27 se movió: tenía que quedarse en $4,100 (ya recorría todas las fechas). Pintó '
     + tH.d.plus.txt);
  af(dinero(tH.d.cheap.txt) === 2400,
     'el CHEAP de edc27 no pinta $2,400 (el de 1 día, el más barato de su universo). Pintó ' + tH.d.cheap.txt);
  af(dinero(tH.d.plus.txt) >= dinero(tH.d.cheap.txt),
     'EN LO RENDERIZADO el todo incluido sigue saliendo más barato que el boleto solo: PLUS '
     + tH.d.plus.txt + ' vs CHEAP ' + tH.d.cheap.txt);
  // edc27 es CDMX: STAY no aplica, y eso no se movió.
  af(tB.d.stay.txt === tH.d.stay.txt,
     'el STAY de edc27 (CDMX, «—») cambió: ' + tB.d.stay.txt + ' → ' + tH.d.stay.txt);
  af(tB.d.ride.txt === tH.d.ride.txt,
     'el RIDE de edc27 cambió al mudar su cuenta a la puerta del dueño: ' + tB.d.ride.txt + ' → ' + tH.d.ride.txt);

  // ── [H] LA LEY DEL HOISTING · la url y el clic tienen que coincidir ───
  // El deep-link corre DURANTE el parseo. Si el dueño hubiera nacido en un
  // `var`, por la url valdría `undefined` y por el clic funcionaría: el mismo
  // evento con dos caras según la puerta. Se mide el PAR.
  console.log('\n[H] la url y el clic, el mismo número');
  const ctxC = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pgC = await ctxC.newPage();
  const errC = []; pgC.on('pageerror', (e) => errC.push(e.message));
  await pgC.goto(uH + '/', { waitUntil: 'domcontentloaded' });
  await pgC.evaluate("showDetail('edc27')");
  await pgC.waitForSelector('#w-viajeros .wiz-btn', { timeout: 15000 });
  const onbClic = await cerrarOnboarding(pgC);
  await pgC.click('#w-viajeros .wiz-btn:nth-child(2)');
  await pgC.waitForFunction("document.getElementById('pp-cheap').textContent !== '—'", { timeout: 15000 }).catch(() => {});
  const porClic = await pgC.evaluate("document.getElementById('pp-cheap').textContent.trim()");
  console.log('    por la url ' + tH.d.cheap.txt + '   ·   por el clic ' + porClic);
  af(porClic === tH.d.cheap.txt,
     'el CHEAP sale distinto por la url (' + tH.d.cheap.txt + ') que por el clic (' + porClic + '): sospecha '
     + 'del ORDEN DE PARSEO antes que del CSS — un `var` de nivel superior leído desde arriba vale undefined');
  console.log('    onboarding → por la url ' + (tH.d.onbSalio ? 'SÍ' : 'no') + ' · por el clic ' + (onbClic ? 'SÍ' : 'no'));
  // 🔒 SE AFIRMA QUE EL ONBOARDING SIGUE VIVO. Si un día deja de salir, el careo
  // seguiría verde sin él —y el popup de «¿cómo reservar?» es de Memo—, así que
  // su ausencia tiene que ser un rojo, no un silencio. Por las DOS puertas,
  // porque es «una vez por evento por dispositivo» y cada contexto es nuevo.
  af(tB.d.onbSalio && tH.d.onbSalio && onbClic,
     'el onboarding YA NO SALE en alguna de las tres corridas (url BASE ' + tB.d.onbSalio + ' / url HEAD '
     + tH.d.onbSalio + ' / clic ' + onbClic + '). O se rompió el popup de «¿Cómo reservar tu lugar?», o '
     + 'esta ficha entró en el caso de `_promoVa`/`_itinSolo` que se lo salta — en ese caso el careo deja '
     + 'de estar midiendo la pantalla tapada, que es la del cliente.');
  af(errC.length === 0, 'la página tiró errores por el camino del clic: ' + JSON.stringify(errC).slice(0, 200));

  // ── [R] LO QUE NO SE DEBÍA MOVER ──────────────────────────────────────
  console.log('\n[R] lo que no se debía mover');
  // 1) La TARJETA DEL CATÁLOGO de los `rideOnly` sin zonas: la cola de
  //    RIDE-VIVO-1. Mi primera versión del dueño se la comió y estos dos
  //    caían de $2,900 a $0. Se mide en la tarjeta RENDERIZADA.
  async function tarjetaCatalogo(url, id) {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    await pg.goto(url + '/', { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction("document.querySelectorAll('.ev-card, [onclick*=showDetail]').length > 5", { timeout: 15000 }).catch(() => {});
    const t = await pg.evaluate(`(() => { const e = document.querySelector('[data-id="${id}"], #ev-${id}');
      const raiz = e || document.body;
      const p = raiz.querySelector('.ev-price');
      return p ? p.textContent.trim() : null; })()`);
    const viaMinP = await pg.evaluate(`(() => { const ev = EV.find((x) => x.id === '${id}'); return ev ? minP(ev) : null; })()`);
    await ctx.close();
    return { t, viaMinP };
  }
  for (const id of ['bts', 'straykids']) {
    const cB = await tarjetaCatalogo(uB, id), cH = await tarjetaCatalogo(uH, id);
    console.log('    ' + id.padEnd(10) + ' minP BASE ' + cB.viaMinP + ' → HEAD ' + cH.viaMinP);
    af(cB.viaMinP === cH.viaMinP && cH.viaMinP > 0,
       id + ' (rideOnly sin zonas) cambió su «desde»: ' + cB.viaMinP + ' → ' + cH.viaMinP + '. Es la cola de '
       + 'RIDE-VIVO-1, y `minP` pinta la TARJETA DEL CATÁLOGO: un 0 aquí borra el precio de la portada');
  }
  // 2) El cotizador. La orden dice que sus totales están bien y no se tocan:
  //    se carea el CUERPO de `calcular()` byte a byte, cortando por BALANCE DE
  //    LLAVES (cortar en «la siguiente declaración» es frágil).
  function cuerpo(html, firma) {
    const i = html.indexOf(firma);
    if (i < 0) return null;
    let j = html.indexOf('{', i), prof = 0, k = j;
    for (;; k++) { if (html[k] === '{') prof++; else if (html[k] === '}') prof--; if (prof === 0) break; }
    return html.slice(i, k + 1);
  }
  for (const firma of ['function calcular(', 'function minPrice(']) {
    const cb = cuerpo(htmlB, firma), ch = cuerpo(htmlH, firma);
    af(cb && ch && cb === ch,
       'el cuerpo de `' + firma + '…` cambió y no debía: ' + (cb ? cb.length : 'null') + ' vs ' + (ch ? ch.length : 'null')
       + ' bytes. Los totales del cotizador están bien y esta tuerca no los toca');
    console.log('    ' + firma.padEnd(22) + (cb && ch && cb === ch ? 'idéntico (' + cb.length + ' bytes)' : '❌ CAMBIÓ'));
  }
  // 3) `STAY_DESCUENTO` sigue siendo 500 y sigue siendo quien manda en el STAY.
  af(await pgH.evaluate('typeof STAY_DESCUENTO === "number" && STAY_DESCUENTO === 500'),
     'STAY_DESCUENTO dejó de ser 500 en la página: el STAY es PLUS − $500 FIJOS, firmado');

  // ── [P] LA PODA, MEDIDA EN LA PÁGINA ──────────────────────────────────
  // El HECHO, no la palabra: un grep del nombre se caza solo, porque el
  // comentario que explica la poda CONTIENE el nombre.
  console.log('\n[P] la poda de getPaquetes');
  const enBase = await (async () => {
    const ctx = await nav.newContext(); const pg = await ctx.newPage();
    await pg.goto(uB + '/', { waitUntil: 'domcontentloaded' });
    const t = await pg.evaluate('typeof getPaquetes'); await ctx.close(); return t;
  })();
  const enHead = await pgH.evaluate('typeof getPaquetes');
  console.log('    typeof getPaquetes → BASE «' + enBase + '»   HEAD «' + enHead + '»');
  af(enBase === 'function', 'en BASE `getPaquetes` tenía que existir: sin eso la poda no se puede afirmar');
  af(enHead === 'undefined', 'en HEAD `getPaquetes` sigue viva: era la quinta manera de decir «desde cuánto», '
     + 'con cero llamadores y el letrero del CHEAP pintando el mínimo del PLUS');

  // ── [U] EL DUEÑO, EN SUS CASOS FINOS ──────────────────────────────────
  // Complemento de unidad al barrido de arriba (que es el camino): se le dan
  // eventos sembrados para ver las reglas que el catálogo de hoy no ejercita.
  console.log('\n[U] el dueño, caso por caso');
  const u = await pgH.evaluate(`(() => {
    const d = (ev, p) => desdeDelPaquete(ev, p);
    return {
      // prox se filtra igual que ag en los DOS paquetes.
      proxPlus:  d({ zonas: [{ p: 100, prox: 1 }, { p: 900 }] }, 'plus'),
      proxCheap: d({ cheapZonas: [{ p: 100, prox: 1 }, { p: 900 }] }, 'cheap'),
      agCheap:   d({ cheapZonas: [{ p: 100, ag: 1 }, { p: 900 }] }, 'cheap'),
      // el universo: global MÁS cada fecha, para los dos.
      uniPlus:  d({ zonas: [{ p: 900 }], multifecha: [{ zonas: [{ p: 300 }] }, { zonas: [{ p: 700 }] }] }, 'plus'),
      uniCheap: d({ cheapZonas: [{ p: 900 }], multifecha: [{ cheapZonas: [{ p: 300 }] }, { cheapZonas: [{ p: 700 }] }] }, 'cheap'),
      // listas por fecha como OBJETO indexado, no arreglo.
      objCheap: d({ cheapZonas: [{ p: 900 }], multifecha: [{ cheapZonas: { a: { p: 250 } } }] }, 'cheap'),
      // sin nada: cero, no Infinity ni NaN.
      vacioCheap: d({ }, 'cheap'),
      vacioPlus:  d({ }, 'plus'),
      // la cola de RIDE-VIVO-1.
      rideVivo: d({ rideOnly: true, ride: 2900, zonas: [] }, 'plus'),
      // cheapOnly hace que el PLUS lea la lista del CHEAP (regla que ya existía).
      cheapOnly: d({ cheapOnly: true, cheapZonas: [{ p: 640 }], zonas: [{ p: 100 }] }, 'plus'),
      // el RIDE: mínimo entre fechas, con respaldo del evento y de la ciudad.
      rideMf: d({ ride: 2700, multifecha: [{ ride: 2500 }, { ride: 3100 }] }, 'ride'),
      rideEv: d({ ride: 2700, multifecha: [{}] }, 'ride'),
      rideCdmx: d({ v: 'Autódromo Hermanos Rodríguez, CDMX' }, 'ride'),
      rideMty: d({ v: 'Arena Monterrey' }, 'ride'),
    };
  })()`);
  console.log('    ' + JSON.stringify(u));
  af(u.proxPlus === 900 && u.proxCheap === 900,
     '`prox` no se filtra igual en los dos: plus ' + u.proxPlus + ' / cheap ' + u.proxCheap + '. Una zona con '
     + 'precio sin publicar ganando el mínimo anuncia un número que nadie puede comprar');
  af(u.agCheap === 900, 'el CHEAP dejó de filtrar `ag`: ' + u.agCheap);
  af(u.uniPlus === 300 && u.uniCheap === 300,
     'los dos paquetes no recorren el MISMO universo: plus ' + u.uniPlus + ' / cheap ' + u.uniCheap);
  af(u.objCheap === 250, 'una lista por fecha en forma de objeto indexado se ignora: ' + u.objCheap);
  af(u.vacioCheap === 0 && u.vacioPlus === 0,
     'un evento sin listas tiene que dar 0 (que la pantalla lee como «Cotizar»), no Infinity ni NaN: '
     + u.vacioCheap + ' / ' + u.vacioPlus);
  af(u.rideVivo === 2900, 'la cola de RIDE-VIVO-1 se perdió: un `rideOnly` sin zonas dio ' + u.rideVivo);
  af(u.cheapOnly === 640, '`cheapOnly` dejó de hacer que el PLUS lea la lista del CHEAP: ' + u.cheapOnly);
  af(u.rideMf === 2500 && u.rideEv === 2700 && u.rideCdmx === 2900 && u.rideMty === 2700,
     'el RIDE cambió de cuenta al mudarse a la puerta del dueño: ' + JSON.stringify([u.rideMf, u.rideEv, u.rideCdmx, u.rideMty])
     + ' (se esperaba 2500/2700/2900/2700)');

  // ── [V] VIGILANCIA VIVA · el camino que hoy no se alcanza ─────────────
  // 🔒 ESTE BLOQUE VA CONTRA EL ÁRBOL DE TRABAJO, NO CONTRA EL ARCHIVADO, y es
  // a propósito: mide un hecho del CATÁLOGO DE HOY, no del par de commits. Un
  // testigo anclado a un commit nunca puede avisar de que el mundo cambió —la
  // lección de FEST-SEP-1, donde el testigo se quedó verde para siempre.
  console.log('\n[V] vigilancia viva · el camino `diaFirst`');
  const evVivo = _parseEV(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'));
  const conDiaFirst = evVivo.filter((e) => e.diaFirst).map((e) => e.id);
  console.log('    eventos con diaFirst en el árbol de trabajo: ' + conDiaFirst.length + ' ' + JSON.stringify(conDiaFirst));
  af(conDiaFirst.length === 0,
     'APARECIÓ UN EVENTO CON `diaFirst` (' + JSON.stringify(conDiaFirst) + ') y eso ENCIENDE el otro camino '
     + 'del «desde», el que hoy es inalcanzable: `if(cur.diaFirst&&selBoleto&&…)` en los bloques del PLUS y '
     + 'del CHEAP. Ese camino NO pasó por el dueño —se dejó intacto porque con 0 eventos no se puede medir— '
     + 'y encima el del CHEAP no filtra `prox` mientras el del PLUS sí. Antes de publicar ese evento, hay '
     + 'que llevarlo al dueño Y medirlo.');

  await nav.close(); sb.close(); sh.close();
  completo = true;
  process.exitCode = rojo ? 1 : 0;
})();
