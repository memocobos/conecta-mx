#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-card-itin.js — CARD-ITIN-1 · EL ITINERARIO EN TODOS LOS EVENTOS
//
// Se entra POR EL CAMINO DEL CLIENTE —la url del evento, que es la que se
// comparte— en 390×844, que es donde está la gente.
//
// 🔒 LOS DOS LADOS SON COMMITS: cada árbol sale con `git archive` a su
// directorio y SE SIRVE de ahí, así que el careo no caduca al mergear.
//     BASE = 53bb769  el main sin itinerario
//     HEAD = bbb9921  el itinerario con sus tres estados (el commit del MERGE)
//
// 🔒 «EXISTE» NO ES «SE VE»: cada pieza se mide por su CADENA de visibilidad
// —`display`, `visibility`, `opacity`, `offsetParent` y su caja—, no por estar
// en el DOM.
//
// 🔒 LOS CUATRO EVENTOS SON REALES Y CADA UNO ES UNA CLASE, con su premisa
// afirmada antes de medir. `edc27` no se eligió por bonito: está en el
// **Autódromo Hermanos Rodríguez**, así que es el caso exacto que Jane marcó
// en el brief — si el «Estadio GNP» estuviera tecleado, se vería aquí.
//
// Se corre:  npm run mide:card-itin
// ══════════════════════════════════════════════════════════════════════════
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const RAIZ = path.join(__dirname, '..');

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
  fallos.slice(0, 14).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '53bb769';
// 🔒 ANCLADO A UN COMMIT, no a `HEAD`. Con `HEAD` este careo mediría el árbol
// de hoy y dentro de tres tuercas le estaría culpando a ésta lo que otros
// cambien. Y la otra cara, pagada tres veces en #756: **commitear exige
// re-anclar** — si con `HEAD_SHA=<sha>` a mano sale verde y a secas sale rojo,
// el ancla está vieja, no el código.
// ⏳ RE-ANCLADO en FEST-SEP-1 (23-sep-2026): el testigo de la rama del festival
// se relevó por la medición de verdad, y esa medición solo existe en el árbol
// nuevo. El ancla vieja era `bbb9921` (el merge de CARD-ITIN-1).
const HEAD_SHA = process.env.HEAD_SHA || '2e246c3';   // re-anclado al merge de FEST-SEP-1 (#768)

// ── LOS CUATRO EVENTOS, uno por clase ────────────────────────────────────
const CASOS = {
  mty:     { id: 'frontera',     venue: 'Arena Monterrey' },
  cdmx:    { id: 'edc27',        venue: 'Autódromo Hermanos Rodríguez' },
  ninguna: { id: 'julionrodep',  venue: 'Expo Coahuila' },
  propio:  { id: 'pulsoquetaro', venue: 'Autodromo Querétaro' },
  promo:   { id: 'dalemix',      venue: null },
};

function servidor(raiz) {
  return http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    // Ninguna function de verdad: el careo no toca la red del negocio.
    if (/\.netlify\/functions\//.test(u)) {
      q.on('data', () => {});
      return q.on('end', () => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{"ok":true}'); });
    }
    const rel = decodeURIComponent(u).replace(/^\//, '');
    const f = path.join(raiz, rel || 'index.html');
    fs.readFile(f, (e, b) => {
      // Reserva de una sola página: `/<slug>` es una url REAL del cliente (es
      // la que se comparte y la que `pushState` escribe), y el servidor de
      // producción la resuelve al index. Sin esta caída, el careo mediría un
      // 404 y le echaría la culpa al código.
      if (e) {
        return fs.readFile(path.join(raiz, 'index.html'), (e2, b2) => {
          if (e2) { r.writeHead(404); return r.end('no'); }
          r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(b2);
        });
      }
      const tipo = /\.js$/.test(f) ? 'text/javascript'
        : /\.css$/.test(f) ? 'text/css'
        : /\.jpe?g$/.test(f) ? 'image/jpeg'
        : /\.png$/.test(f) ? 'image/png'
        : /\.webp$/.test(f) ? 'image/webp' : 'text/html; charset=utf-8';
      r.writeHead(200, { 'Content-Type': tipo }); r.end(b);
    });
  });
}

// 🔒 LA CADENA DE VISIBILIDAD, no el DOM. `offsetParent` es null POR
// DEFINICIÓN en `position:fixed`, así que ahí se mide la CAJA.
const MIRA = `(function(sel){
  var e = document.querySelector(sel);
  if (!e) return { hay:false };
  var cs = getComputedStyle(e), r = e.getBoundingClientRect();
  var fijo = cs.position === 'fixed';
  var ve = !e.hidden
        && (fijo || e.offsetParent !== null)
        && cs.display !== 'none' && cs.visibility !== 'hidden'
        && Number(cs.opacity) >= .05
        && r.width > 0 && r.height > 0;
  return { hay:true, ve:ve, x:Math.round(r.x), y:Math.round(r.y),
           w:Math.round(r.width), h:Math.round(r.height),
           txt:(e.innerText||'').trim(), html:e.innerHTML };
})`;

// ⚠️ EL ONBOARDING TAPA EL CARD, y eso es la realidad del cliente: el popup
// «¿Cómo reservar tu lugar?» se abre 300 ms después y cubre la pantalla, así
// que para apretar «Ver itinerario» hay que cerrarlo primero — igual que lo
// hace una persona. La primera versión de este careo clickeaba a ciegas y
// Playwright se quedaba 30 s esperando: el clic era interceptado. Medirlo así
// también AFIRMA que el onboarding sigue vivo, que es la regresión que más
// miedo daba.
async function abrirEvento(page, base, id) {
  await page.goto(base + '/' + id, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);   // el card se arma y el onboarding tarda 300ms
  const onb = await page.evaluate(() => {
    const e = document.getElementById('onboard-bg');
    if (!e) return { hay: false, ve: false };
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    return { hay: true, ve: cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0 };
  });
  if (onb.ve) {
    await page.evaluate(() => { if (typeof skipOnboarding === 'function') skipOnboarding(); });
    await page.waitForTimeout(250);
  }
  return onb;
}

(async () => {
  const b = sacar(BASE, 'itin-base'), h = sacar(HEAD_SHA, 'itin-head');
  console.log('CAREO CARD-ITIN-1 · el itinerario, por la url del cliente\n');
  console.log('  BASE ' + b.sha.slice(0, 7) + '  ·  HEAD ' + h.sha.slice(0, 7) + '\n');
  const sb = servidor(b.dir), sh = servidor(h.dir);
  await new Promise((ok) => sb.listen(0, ok));
  await new Promise((ok) => sh.listen(0, ok));
  const uB = 'http://127.0.0.1:' + sb.address().port;
  const uH = 'http://127.0.0.1:' + sh.address().port;
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e.message)));

  try {
    // ── [0] EL INSTRUMENTO Y LAS PREMISAS ─────────────────────────────────
    // Antes de creerle una ausencia a este careo, se le hace contestar algo
    // que YA se sabe: que los cuatro eventos existen y que su venue es el que
    // hace que caigan en su clase. Sin esto, «no dice Soriana Hidalgo» podría
    // ser que el evento no existe.
    console.log('[0] el instrumento y las premisas');
    await page.goto(uH + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const universo = await page.evaluate(() => (typeof EV !== 'undefined' && EV.length) || 0);
    console.log('    eventos servidos en HEAD: ' + universo);
    af(universo > 100, 'el catálogo servido trae ' + universo + ' eventos: el árbol no se sirvió bien');
    for (const k of Object.keys(CASOS)) {
      const c = CASOS[k];
      const ev = await page.evaluate((id) => {
        const e = (typeof EV !== 'undefined') && EV.find((x) => x && x.id === id);
        return e ? { v: e.v, st: e.st, cdmx: !!e.cdmx, itin: !!e.itinerario, promo: !!e.promoModal, horaShow: e.horaShow || null } : null;
      }, c.id);
      af(!!ev, 'el evento «' + c.id + '» (clase ' + k + ') NO está en el catálogo: su clase no se puede medir');
      if (ev && c.venue) {
        af(String(ev.v).indexOf(c.venue) >= 0,
           'la premisa de «' + c.id + '» no se sostiene: su venue es ' + JSON.stringify(ev.v)
           + ' y la clase ' + k + ' depende de que diga ' + JSON.stringify(c.venue));
      }
      if (ev) console.log('    · ' + c.id.padEnd(14) + ' v=' + JSON.stringify(ev.v) + ' itinPropio=' + ev.itin + ' promoModal=' + ev.promo + ' horaShow=' + JSON.stringify(ev.horaShow));
    }
    // La premisa del caso de la hora: edc27 NO trae `horaShow`, y por eso se
    // puede exigir que la frase del concierto no se pinte. Si algún día la
    // trae, esta aserción avisa en vez de pasar en hueco.
    const horaEdc = await page.evaluate(() => (EV.find((x) => x.id === 'edc27') || {}).horaShow || null);
    af(horaEdc == null, 'edc27 ya trae `horaShow` (' + JSON.stringify(horaEdc)
       + '): el caso del hueco de la hora dejó de medir lo que dice medir');

    // ── [1] LA PLANTILLA DE MONTERREY ─────────────────────────────────────
    console.log('\n[1] la plantilla de Monterrey · ' + CASOS.mty.id);
    await abrirEvento(page, uH, CASOS.mty.id);
    let card = await page.evaluate(MIRA + '("#d-itin-card")');
    console.log('    card: ve=' + card.ve + ' y=' + card.y + ' h=' + card.h);
    af(card.hay && card.ve, 'el card del itinerario no SE VE en ' + CASOS.mty.id + ': ' + JSON.stringify(card));
    let btn = await page.evaluate(MIRA + '("#d-itin-btn")');
    af(btn.hay && btn.ve, 'el botón «Ver itinerario» no se ve: ' + JSON.stringify(btn));
    af(/VER ITINERARIO/i.test(btn.txt || ''), 'el botón no dice «Ver itinerario», dice ' + JSON.stringify(btn.txt));
    af(btn.x >= 0 && (btn.x + btn.w) <= 390,
       'el botón se sale del ancho del teléfono: x=' + btn.x + ' w=' + btn.w);
    // El modal nace CERRADO: el auto-abrir es solo de los especiales.
    let modal = await page.evaluate(MIRA + '("#itin-modal-bg")');
    af(modal.hay && !modal.ve, 'el modal del itinerario se abrió SOLO en un evento de plantilla: '
       + 'eso apagaría el onboarding en todo el sitio');
    await page.click('#d-itin-btn');
    await page.waitForTimeout(250);
    modal = await page.evaluate(MIRA + '("#itin-modal-bg")');
    af(modal.ve, 'el modal no se abrió al apretar el botón');
    const txtMty = await page.evaluate(() => (document.getElementById('itin-modal-desc') || {}).innerText || '');
    const htmlMty = await page.evaluate(() => (document.getElementById('itin-modal-desc') || {}).innerHTML || '');
    console.log('    el modal trae ' + txtMty.length + ' caracteres');
    af(/Soriana Hidalgo/.test(txtMty), 'la plantilla de Monterrey no dice «Soriana Hidalgo»');
    af(/rumbo a Monterrey/.test(txtMty), 'la plantilla no dice «rumbo a Monterrey»');
    af(/de 7:00 a\. m\. a 10:00 a\. m\./.test(txtMty), 'falta el horario del desayuno, que es palabra de Memo');
    af(/Nota importante/.test(txtMty), 'falta la nota de que los horarios son estimados');
    af(/<b>Salida desde Reynosa<\/b>/.test(htmlMty),
       'las **negritas** del brief no se están pintando como negritas');
    af(!/\*\*/.test(txtMty), 'el texto muestra los asteriscos crudos: el markup no se convirtió');
    // Y NO trae nada de la otra plantilla: son dos textos, no uno mezclado.
    af(!/Central de Autobuses del Norte/.test(txtMty),
       'la plantilla de Monterrey trae texto de la de CDMX');
    // Se REABRE a placer — que es justo lo que pidió Memo.
    await page.click('#itin-modal-bg', { position: { x: 5, y: 5 } });
    await page.waitForTimeout(200);
    af(!(await page.evaluate(MIRA + '("#itin-modal-bg")')).ve, 'el modal no se cerró');
    await page.click('#d-itin-btn');
    await page.waitForTimeout(250);
    af((await page.evaluate(MIRA + '("#itin-modal-bg")')).ve,
       'el itinerario NO se puede reabrir: «que lo reabra a placer» era el encargo');

    // ── [2] CDMX · LAS DOS VARIANTES, Y EL VENUE DERIVADO ─────────────────
    console.log('\n[2] CDMX · las dos variantes y el venue derivado · ' + CASOS.cdmx.id);
    await abrirEvento(page, uH, CASOS.cdmx.id);
    af((await page.evaluate(MIRA + '("#d-itin-card")')).ve, 'el card no se ve en el evento de CDMX');
    await page.click('#d-itin-btn');
    await page.waitForTimeout(250);
    const txtCd = await page.evaluate(() => (document.getElementById('itin-modal-desc') || {}).innerText || '');
    console.log('    el modal de CDMX trae ' + txtCd.length + ' caracteres');
    af(/Viaje en bus/.test(txtCd), 'falta la variante de BUS');
    af(/Viaje en avi[oó]n/.test(txtCd), 'falta la variante de AVIÓN');
    af(/Central de Autobuses del Norte de CDMX entre 9:00 y 10:30/.test(txtCd), 'el punto de reunión del bus no es el del brief');
    af(/Aeropuerto de CDMX \(AICM\) entre 10:00 y 10:30/.test(txtCd), 'el punto de reunión del avión no es el del brief');
    af(/hacia el aeropuerto a las 4:00 a\. m\./.test(txtCd), 'falta el regreso del avión');
    // 🔴 EL CASO DE JANE: el recinto SE DERIVA de la ficha.
    af(txtCd.indexOf('Autódromo Hermanos Rodríguez') >= 0,
       'el itinerario de CDMX NO nombra el recinto del evento (Autódromo Hermanos Rodríguez): el venue no se está derivando');
    af(!/Estadio GNP/.test(txtCd),
       '🔴 el itinerario dice «Estadio GNP» en un evento del Autódromo: el letrero está TECLEADO, que es justo lo que Jane marcó');
    af(!/,\s*CDMX\b/.test(txtCd.split('Traslado al concierto')[1] || ''),
       'el recinto se imprime con su sufijo «, CDMX» dentro de la frase: se lee mal');
    // 🔒 Y LA HORA NO SE INVENTA: sin `horaShow`, la frase no existe.
    af(!/El concierto comienza a las/.test(txtCd),
       '🔴 el itinerario afirma a qué hora empieza el concierto sin que la ficha lo diga: '
       + 'el brief traía «9:00 p. m.» tecleado y eso es del evento, no de la plantilla');
    af(!/9:00 p\. m\./.test(txtCd), 'el «9:00 p. m.» del brief sobrevivió en el texto');

    // ── [3] EL TERCER ESTADO · ninguna plantilla le sirve ─────────────────
    console.log('\n[3] el tercer estado · ' + CASOS.ninguna.id + ' (ni Monterrey ni CDMX)');
    await abrirEvento(page, uH, CASOS.ninguna.id);
    const cardN = await page.evaluate(MIRA + '("#d-itin-card")');
    console.log('    card: ve=' + cardN.ve);
    af(cardN.hay && !cardN.ve,
       '🔴 ' + CASOS.ninguna.id + ' (Expo Coahuila) SÍ pinta card de itinerario: '
       + 'le estamos dando una plantilla que no le corresponde');
    const cuerpoN = await page.evaluate(() => document.body.innerText || '');
    af(!/Soriana Hidalgo/.test(cuerpoN),
       '🔴 la página de un evento de Saltillo dice «nos reunimos en Soriana Hidalgo»: el letrero miente');
    af(!/Central de Autobuses del Norte/.test(cuerpoN), 'un evento que no es de CDMX trae su itinerario');

    // ── [4] EL ITINERARIO PROPIO GANA ─────────────────────────────────────
    console.log('\n[4] el itinerario propio · ' + CASOS.propio.id);
    await abrirEvento(page, uH, CASOS.propio.id);
    // Los especiales abren SOLOS, como hoy.
    let modalP = await page.evaluate(MIRA + '("#itin-modal-bg")');
    af(modalP.ve, 'el especial ' + CASOS.propio.id + ' ya NO abre su itinerario solo: eso funcionaba antes');
    const txtP = await page.evaluate(() => (document.getElementById('itin-modal-desc') || {}).innerText || '');
    af(/9 DE OCTUBRE/.test(txtP), 'el itinerario de ' + CASOS.propio.id + ' perdió su primer día');
    af(/Quer[eé]taro/.test(txtP), 'el itinerario propio no menciona Querétaro: ¿se perdió el texto?');
    af(/5:00 AM — Llegada a Reynosa/.test(txtP), 'el itinerario propio perdió su última línea');
    af(!/Soriana Hidalgo/.test(txtP),
       'la PLANTILLA le ganó al itinerario propio: un evento de Querétaro con el texto de Monterrey');
    af(txtP.length > 300, 'el itinerario propio salió recortado (' + txtP.length + ' caracteres)');

    // ── [5] LO QUE NO SE DEBÍA TOCAR ──────────────────────────────────────
    console.log('\n[5] lo que NO se debía tocar');
    // (a) La promo de dalemix sigue siendo una promo, con su modal y su texto.
    await abrirEvento(page, uH, CASOS.promo.id);
    const promo = await page.evaluate(MIRA + '("#promo-modal-bg")');
    const txtPromo = await page.evaluate(() => (document.getElementById('promo-modal-desc') || {}).innerText || '');
    af(promo.ve, 'la promo de dalemix dejó de abrirse: era el TERCER usuario de promoModal y no es un itinerario');
    af(/COMIDA|comida/.test(txtPromo + (await page.evaluate(() => (document.getElementById('promo-modal-title') || {}).innerText || ''))),
       'el modal de dalemix ya no habla de la comida gratis: ' + JSON.stringify(txtPromo.slice(0, 60)));
    const itinEnDalemix = await page.evaluate(MIRA + '("#d-itin-card")');
    af(itinEnDalemix.hay && itinEnDalemix.ve,
       'dalemix es de Monterrey y NO trae card de itinerario: la promo y el itinerario no se estorban');
    // (b) 🔴 EL ONBOARDING SIGUE VIVO. Si el itinerario se abriera solo en
    // todos los eventos, este popup dejaría de verse EN TODO EL SITIO — y eso
    // no lo habría cazado ninguna aserción sobre el itinerario.
    // Sesión NUEVA: el onboarding es «una vez por evento por dispositivo», y
    // los pasos anteriores ya lo cerraron para este evento. Sin contexto nuevo
    // esta aserción mediría el sessionStorage, no el código.
    const ctx2 = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const page2 = await ctx2.newPage();
    const onb = await abrirEvento(page2, uH, CASOS.mty.id);
    await ctx2.close();
    console.log('    onboarding en sesión nueva: ' + JSON.stringify(onb));
    af(onb.ve, '🔴 el popup «¿Cómo reservar tu lugar?» ya NO se ve en un evento normal: '
       + 'el itinerario le está robando la pantalla');
    // (c) Ni un error de JavaScript en toda la corrida.
    af(errores.length === 0, 'la página tiró ' + errores.length + ' error(es) de JS: ' + errores.slice(0, 3).join(' · '));

    // ── [6] CONTROL POSITIVO · BASE no puede pasar estas aserciones ───────
    // Sin esto, el verde de arriba no distingue «lo arreglé» de «mido algo que
    // ya pasaba». La ley grande de la casa.
    console.log('\n[6] CONTROL POSITIVO · el mismo camino en BASE');
    await abrirEvento(page, uB, CASOS.mty.id);
    const cardB = await page.evaluate(MIRA + '("#d-itin-card")');
    af(!cardB.hay, 'BASE ya trae el card del itinerario: entonces [1] no prueba nada');
    const cuerpoB = await page.evaluate(() => document.body.innerText || '');
    af(!/Soriana Hidalgo/.test(cuerpoB), 'BASE ya pinta la plantilla de Monterrey: [1] no prueba nada');
    await abrirEvento(page, uB, CASOS.propio.id);
    const promoB = await page.evaluate(MIRA + '("#promo-modal-bg")');
    const txtPB = await page.evaluate(() => (document.getElementById('promo-modal-desc') || {}).innerText || '');
    af(promoB.ve && /9 DE OCTUBRE/.test(txtPB),
       'la premisa del ANTES no se sostiene: en BASE el itinerario de pulso salía por el promo modal, '
       + 'y es lo que esta tuerca migró');
    const itinBaseNodo = await page.evaluate(MIRA + '("#itin-modal-bg")');
    af(!itinBaseNodo.hay, 'BASE ya tiene el modal propio del itinerario');
  } catch (e) {
    console.log('   ✗ EXCEPCIÓN en el navegador: ' + e.message);
    rojo++; fallos.push('EXCEPCIÓN: ' + e.message);
  } finally {
    await nav.close(); sb.close(); sh.close();
  }

  // ── [7] EL COMPILADOR · la emisión, el Set y el candado ────────────────
  // 🔒 SE MIDE POR EMISIÓN, no contando llamadas con un regex. Mi primera
  // versión contaba `itinerarioSeg(esfera)` en el fuente y daba TRES —porque
  // la declaración de la función también decía eso—: un rojo que era mío.
  // Preguntarle al emisor qué SALE es más fuerte y no se confunde.
  console.log('\n[7] el compilador');
  const lib = require(path.join(h.dir, 'netlify/functions/_lib/esferas-compile.js'));
  const HOY = '2026-09-23';
  const fichaBase = {
    slug: 'careoitin', nombre: 'Careo Itin', titulo: 'Careo Itin', fecha_inicio: '2026-12-01',
    ciudad: 'MTY', venue: 'Arena Monterrey, Mty', status: '', color: 'azul',
    zonas: JSON.stringify([{ n: 'General', p: 1000 }]), inc: JSON.stringify(['Boleto']), sep: 500,
  };
  const emite = (extra) => lib._generarObj(Object.assign({}, fichaBase, extra || {}), HOY);
  const objSin = emite({});
  const objCon = emite({ itinerario: 'MI ITINERARIO PROPIO', hora_show: '9:00 p. m.' });
  const objNull = emite({ itinerario_null: true });
  console.log('    sin itinerario  → ' + (/itinerario/.test(objSin) ? 'EMITE algo' : 'no emite (correcto)'));
  console.log('    con itinerario  → ' + (objCon.match(/itinerario:'[^']*'/) || ['(nada)'])[0]);
  console.log('    con el apagador → ' + (objNull.match(/itinerario:[a-z]+/) || ['(nada)'])[0]);
  af(!/itinerario/.test(objSin),
     'el compilador emite `itinerario` en un evento que no lo tiene: la ausencia es lo que hace caer a la plantilla');
  af(/itinerario:'MI ITINERARIO PROPIO'/.test(objCon), 'el compilador NO emite el itinerario de la ficha: ' + objCon.slice(0, 160));
  af(/horaShow:'9:00 p\. m\.'/.test(objCon), 'el compilador NO emite `horaShow`');
  af(/itinerario:null/.test(objNull),
     'el apagador no emite `itinerario:null` EXPLÍCITO: una llave ausente no es una llave en null, '
     + 'y el candado la mira');
  // El texto sale ESCAPADO: es un string que va al catálogo público.
  const objRaro = emite({ itinerario: "linea 1\nno's escape </script>" });
  af(/itinerario:'linea 1\\nno\\'s escape <\\\/script>'/.test(objRaro),
     'el itinerario no sale escapado (saltos, comilla y cierre de script): ' + (objRaro.match(/itinerario:'[^,]*/) || [''])[0]);
  // ── LAS DOS RAMAS DEL EMISOR · el testigo, RELEVADO ────────────────
  // ✅ EL DEFECTO AJENO QUE ESTE BLOQUE VIGILABA YA ESTÁ ARREGLADO. Este careo
  // dejó dicho que `generarObjFestival` no podía correr —referenciaba `sepSeg`,
  // que no existía en su ámbito— y puso un TESTIGO que exigía que tronara con
  // ESE mensaje, para ponerse rojo el día del arreglo. **FEST-SEP-1** lo
  // arregló (23-sep-2026, palabra de Memo: «yo elijo el separo, igual que en
  // todos los eventos»): `sepSeg(esfera)` es hoy un dueño top-level y los DOS
  // caminos le preguntan. Así que la aserción que NO SE PODÍA HACER —«la rama
  // del festival EMITE el itinerario»— ya se puede, y es la que va.
  //
  // 🔴 Y POR QUÉ SE RELEVA A MANO ES UNA LEY, LA TERCERA CARA DEL ANCLA: **un
  // testigo anclado a un commit no puede atestiguar un arreglo posterior.**
  // Este careo lee el árbol de `HEAD_SHA`, así que el día del arreglo NO se
  // puso rojo —medido: 69 verdes y «rama festival → sepSeg is not defined» con
  // el arreglo ya commiteado en la rama—. Se habría quedado verde para siempre
  // afirmando un defecto que ya no existe, y eso es peor que un rojo: **el
  // verde caducado no avisa**. Un testigo de un defecto AJENO se re-ancla EN
  // la tuerca que lo arregla, y se re-ancla a mano.
  //
  // De las dos que quedaban, (a) —el segmento ESCRITO en esa rama— se queda:
  // es el candado estructural del barrido de dos ramas, y sigue valiendo para
  // cualquier campo futuro que se emita en una sola.
  const fuenteLib = fs.readFileSync(path.join(h.dir, 'netlify/functions/_lib/esferas-compile.js'), 'utf8');
  const cuerpoFest = fuenteLib.slice(fuenteLib.indexOf('function generarObjFestival'),
                                     fuenteLib.indexOf('function generarObj(esfera, hoy)'));
  af(/itinerarioSeg\(esfera\)/.test(cuerpoFest) && /horaShowSeg\(esfera\)/.test(cuerpoFest),
     'la rama del FESTIVAL no lleva escrito el segmento del itinerario: un campo emitido en una sola '
     + 'rama se pierde en la otra — la lección del barrido de dos ramas');
  let fest = null, festErr = null;
  try {
    fest = lib._generarObj(Object.assign({}, fichaBase, {
      festival: JSON.stringify({ paquetes: [{ lbl: 'Día 1', noches: 1, zonas: [{ n: 'General', p: 1000 }] }] }),
      multifecha: JSON.stringify([{ lbl: 'Día 1', ds: '2026-12-01', zonas: [{ n: 'General', p: 1000 }] }]),
      itinerario: 'ITINERARIO DEL FESTIVAL',
    }), HOY);
  } catch (e) { festErr = e.message; }
  console.log('    rama festival → ' + (festErr ? 'TRUENA: ' + festErr
    : (String(fest).match(/itinerario:'[^']*'/) || ['(no emite itinerario)'])[0]));
  af(!festErr,
     'la rama del FESTIVAL vuelve a tronar, así que el itinerario no se puede medir ahí: ' + festErr);
  // La premisa de que se entró POR la rama del festival y no por la de
  // concierto: el formato festival DERIVA su `multifecha` de los paquetes.
  af(fest && /multifecha:\[/.test(String(fest)),
     'no se puede afirmar que el objeto salga del emisor de FESTIVAL: sin esa premisa, la aserción de '
     + 'abajo podría estar midiendo el camino de concierto otra vez');
  af(fest && /itinerario:'ITINERARIO DEL FESTIVAL'/.test(String(fest)),
     'la rama del FESTIVAL no emite el itinerario de la ficha — un campo emitido en una sola rama se '
     + 'pierde en la otra. Salió: ' + String(fest).slice(0, 200));

  // EL SET. Se EVALÚA (se lee el Set exportado), no se busca con un regex: un
  // regex cuenta lo comentado como declarado.
  const S = lib.CAMPOS_DEL_COMPILADOR;
  af(S && typeof S.has === 'function', 'CAMPOS_DEL_COMPILADOR no se exporta como Set');
  af(S && S.has('itinerario'), '`itinerario` NO está en CAMPOS_DEL_COMPILADOR: `fusionarConViejo` lo '
     + 're-insertaría desde el objeto viejo y quitarlo desde Esferas no serviría de nada (la mordida de `noStay`)');
  af(S && S.has('horaShow'), '`horaShow` NO está en CAMPOS_DEL_COMPILADOR');
  // 🔒 EL BARRIDO: todo lo que el emisor PUEDE emitir tiene que estar
  // declarado. Se comparan las llaves de nivel 1 del objeto «con todo
  // encendido» contra el Set — el careo de la época ESF, aplicado a esta
  // tuerca en vez de confiar en que me acordé de declararlas.
  const llavesCon = Object.keys(new Function('var BANCO_DEFAULT={},BANCO_HEY={},HOTEL_STD=[],HOTEL_MTY=[],HOTEL_CDM=[],PROMOS={};return ' + objCon)());
  const sinDeclarar = llavesCon.filter((k) => S && !S.has(k));
  console.log('    llaves emitidas sin declarar: ' + JSON.stringify(sinDeclarar));
  af(sinDeclarar.length === 0, 'el emisor emite llaves que el Set no declara: ' + JSON.stringify(sinDeclarar)
     + ' — quedan en tierra de nadie: se escriben y NO se pueden borrar');
  // EL CANDADO CONTRA EL BORRADO SILENCIOSO, por su EFECTO.
  const viejo = "{id:'x',itinerario:'UN ITINERARIO PROPIO'}";
  const nuevoObj = "{id:'x'}";
  let riesgos = [];
  lib._fusionarConViejo(viejo, nuevoObj, 'x', {}, riesgos);
  console.log('    riesgos del candado: ' + JSON.stringify(riesgos));
  af(riesgos.some((r) => r.campo === 'itinerario'),
     '🔴 el candado NO ve que el publish se llevaría el itinerario. Y aquí el borrado silencioso es PEOR '
     + 'que en un mapa: no deja el card vacío, lo deja con la PLANTILLA — un evento de Puebla con el '
     + 'itinerario de Monterrey');
  let riesgos2 = [];
  lib._fusionarConViejo(viejo, nuevoObj, 'x', { itinerario_null: true }, riesgos2);
  af(!riesgos2.some((r) => r.campo === 'itinerario'),
     'con `itinerario_null` el candado sigue reclamando: no habría forma de quitar un itinerario a propósito, '
     + 'y se rehusaría el publish PARA SIEMPRE');
  // CONTROL DEL INSTRUMENTO: si el candado reportara siempre, su rojo no vale.
  let riesgos3 = [];
  lib._fusionarConViejo("{id:'x'}", "{id:'x'}", 'x', {}, riesgos3);
  af(!riesgos3.some((r) => r.campo === 'itinerario'),
     'el candado reporta riesgo en un evento que NUNCA tuvo itinerario: reporta siempre, así que no reporta nada');

  completo = true;
  marcador();
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); marcador(); process.exit(1); });
