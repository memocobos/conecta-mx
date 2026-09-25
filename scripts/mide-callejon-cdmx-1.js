#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-callejon-cdmx-1.js — CALLEJON-CDMX-1 · el paso preseleccionado que
// aun así exigía el clic
//
// Firmado por Memo: «arréglenlo». En eventos de CDMX, tras elegir la zona la
// habitación venía PRE-MARCADA, el paso del transporte seguía OCULTO y la
// cotización no aparecía: el cliente tenía que APRETAR la opción que ya estaba
// marcada para que el flujo siguiera.
//
// 🔒 LOS DOS LADOS SON COMMITS y los dos SE SIRVEN. Y commitear exige RE-ANCLAR.
//
// 🔒 SE ENTRA POR LA PUERTA DEL CLIENTE en 390×844: url del evento → cerrar el
// onboarding como lo cierra una persona → viajeros → paquete → zona. No se
// fabrica el estado: un `selH` puesto a mano daría el resultado correcto por la
// razón equivocada.
//
// 🔒 EL PAR NO-CDMX ES LO QUE DECIDIÓ EL ARREGLO. El mismo flujo en Monterrey
// SIEMPRE llegó al total, y eso prueba que la pre-selección YA confirmaba sola:
// lo roto era un renglón que corría después y deshacía lo único que el camino
// de CDMX hace distinto. Por eso no se le quitó la pre-marca a todo el país.
//
// Se corre:  npm run mide:callejon-cdmx-1
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
    const f = path.join(raiz, decodeURIComponent(u).replace(/^\//, '') || 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) {
        return fs.readFile(path.join(raiz, 'index.html'), (e2, b2) => {
          if (e2) { r.writeHead(404); return r.end('no'); }
          r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(b2);
        });
      }
      const t = /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css'
        : /\.jpe?g$/.test(f) ? 'image/jpeg' : /\.png$/.test(f) ? 'image/png'
        : /\.webp$/.test(f) ? 'image/webp' : 'text/html; charset=utf-8';
      r.writeHead(200, { 'Content-Type': t }); r.end(b);
    });
  });
}
const BASE = process.env.BASE || '8006830';
const HEAD_SHA = process.env.HEAD_SHA || '4a76bd3';   // el commit del MERGE (#772)

// El onboarding tapa la pantalla (z-index 9999, 300 ms después). Se cierra como
// lo cierra una persona y se espera POR CONDICIÓN, no por reloj — la condición
// de merge que Jane puso en la #769: un careo que depende del timing para no
// colgarse sale verde por suerte en una máquina y caído en otra.
const _tapa = () => {
  const e = document.getElementById('onboard-bg');
  if (!e) return false;
  const cs = getComputedStyle(e), r = e.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && r.height > 0;
};
// 🔒 «EXISTE» NO ES «SE VE»: la cadena completa, no el DOM.
const FOTO = `(() => {
  const v = (id) => { const e = document.getElementById(id); if (!e) return null;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && !!e.offsetParent && r.height > 0; };
  const act = (sel) => [...document.querySelectorAll(sel)].filter((b) => b.classList.contains('active')).length;
  const res = document.getElementById('d-result');
  return {
    zona: v('w-zona-card'), hotel: v('w-hotel-card'), transporte: v('w-transport-card'),
    result: v('d-result'), placeholder: v('d-placeholder'),
    hotelMarcados: act('#d-hotel .h-btn'), zonaMarcadas: act('#d-zonas .z-btn'),
    selH: (typeof selH !== 'undefined' && selH) ? selH.n : null,
    selZ: (typeof selZ !== 'undefined' && selZ) ? selZ.n : null,
    selT: (typeof selTransporte !== 'undefined' && selTransporte) ? selTransporte.n : null,
    totales: (res && getComputedStyle(res).display !== 'none') ? (res.innerText.match(/\\$[\\d,]+/g) || []) : [],
    guia: (document.getElementById('d-placeholder') || {}).textContent || '',
  };
})()`;

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'cal-base'), h = sacar(HEAD_SHA, 'cal-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }
  const sb = servidor(b.dir), sh = servidor(h.dir);
  await new Promise((r) => sb.listen(0, r)); await new Promise((r) => sh.listen(0, r));
  const uB = 'http://127.0.0.1:' + sb.address().port, uH = 'http://127.0.0.1:' + sh.address().port;
  const nav = await chromium.launch();

  // El camino del cliente, paso por paso, con su FOTO en cada uno.
  async function recorrer(url, slug, opts) {
    const o = opts || {};
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(url + '/' + slug, { waitUntil: 'domcontentloaded' });
    const onb = await pg.waitForFunction(_tapa, { timeout: 2500 }).then(() => true).catch(() => false);
    if (onb) await pg.evaluate(() => { if (typeof skipOnboarding === 'function') skipOnboarding(); });
    await pg.waitForFunction(`!(${_tapa.toString()})()`, { timeout: 10000 });
    await pg.waitForSelector('#w-viajeros .wiz-btn', { timeout: 15000 });
    await pg.click('#w-viajeros .wiz-btn:nth-child(2)');
    await pg.waitForTimeout(250);
    // El paquete. PLUS es el primero; `pkg` permite pedir otro.
    const idx = o.pkg === 'cheap' ? 4 : 1;
    await pg.evaluate(`(() => { const b = document.querySelector('#w-paquetes .wiz-pkg-btn:nth-child(${idx})'); if (b) b.click(); })()`);
    await pg.waitForTimeout(400);
    const trasPaquete = await pg.evaluate(FOTO);
    // La zona: el primer chip que de verdad se puede apretar.
    const zona = await pg.evaluate(`(() => { const z = document.querySelector('#d-zonas .z-btn:not(.z-btn-off)');
      if (z) { z.click(); return (z.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30); } return null; })()`);
    await pg.waitForTimeout(450);
    const trasZona = await pg.evaluate(FOTO);
    const salida = { onb, errs, zona, trasPaquete, trasZona, pg, ctx };
    if (o.dejar) return salida;
    await ctx.close();
    return salida;
  }

  // ── [I] EL INSTRUMENTO, y la premisa del onboarding ───────────────────
  console.log('[I] el instrumento');
  const hC = await recorrer(uH, 'edc27', { dejar: true });
  af(hC.errs.length === 0, 'la página de HEAD tiró errores en el camino de CDMX: ' + JSON.stringify(hC.errs).slice(0, 250));
  af(hC.onb, 'el onboarding ya no sale: el careo dejaría de medir la pantalla TAPADA, que es la del cliente');
  af(hC.zona, 'no se pudo elegir zona en edc27: sin ese clic no hay callejón que medir');
  af(hC.trasZona.selZ && hC.trasZona.selH,
     'la premisa falla: tras elegir zona tienen que estar puestos `selZ` Y `selH` (la pre-marca). '
     + JSON.stringify(hC.trasZona));

  // ── [B] EL CALLEJÓN, REPRODUCIDO EN BASE ──────────────────────────────
  // 🔒 CONTROL POSITIVO QUE NO PUEDE CADUCAR: BASE es un commit con el
  // callejón dentro, no un sitio vivo.
  console.log('\n[B] control positivo · el callejón en BASE');
  const bC = await recorrer(uB, 'edc27', { dejar: true });
  console.log('    BASE tras zona → transporte:' + bC.trasZona.transporte + ' result:' + bC.trasZona.result
    + ' selH:' + JSON.stringify(bC.trasZona.selH) + ' totales:' + JSON.stringify(bC.trasZona.totales));
  af(bC.trasZona.selH && bC.trasZona.hotelMarcados === 1,
     'en BASE la habitación tenía que venir PRE-MARCADA (es la mitad del callejón): ' + JSON.stringify(bC.trasZona));
  af(bC.trasZona.transporte === false,
     'en BASE el paso del transporte tenía que estar OCULTO tras elegir zona: si no, no hay callejón y el '
     + 'verde de HEAD no prueba nada. ' + JSON.stringify(bC.trasZona));
  af(bC.trasZona.totales.length === 0,
     'en BASE la cotización tenía que NO aparecer: ' + JSON.stringify(bC.trasZona.totales));
  // Y el re-clic de la opción YA MARCADA lo desatoraba: eso es el callejón.
  const bRe = await bC.pg.evaluate(`(() => { const x = document.querySelector('#d-hotel .h-btn.active'); if (x) { x.click(); return true; } return false; })()`);
  await bC.pg.waitForTimeout(400);
  const bTrasRe = await bC.pg.evaluate(FOTO);
  console.log('    BASE re-clic de la habitación ya marcada → transporte:' + bTrasRe.transporte);
  af(bRe && bTrasRe.transporte === true,
     'en BASE, apretar la habitación QUE YA ESTABA MARCADA tenía que destapar el transporte: es la forma '
     + 'exacta del callejón que Memo reportó. ' + JSON.stringify(bTrasRe));
  await bC.ctx.close();

  // ── [H] EL ARREGLO · el transporte aparece SIN re-clic ────────────────
  console.log('\n[H] HEAD · el paso aparece solo');
  console.log('    HEAD tras zona → transporte:' + hC.trasZona.transporte + ' selH:' + JSON.stringify(hC.trasZona.selH));
  af(hC.trasZona.transporte === true,
     '🔴 el paso del transporte SIGUE oculto tras elegir zona: el callejón está vivo. '
     + JSON.stringify(hC.trasZona));
  af(hC.trasZona.hotelMarcados === 1 && hC.trasZona.selH,
     'la pre-selección se perdió: NO era lo que había que quitar — el par no-CDMX prueba que ya '
     + 'confirmaba sola. ' + JSON.stringify(hC.trasZona));
  // 🔒 EL RE-CLIC SE VUELVE IDEMPOTENTE: apretar lo ya marcado no cambia nada.
  // Así se mide que el paso NO depende de ese clic, en vez de solo que aparezca.
  const hRe = await hC.pg.evaluate(`(() => { const x = document.querySelector('#d-hotel .h-btn.active'); if (x) { x.click(); return true; } return false; })()`);
  await hC.pg.waitForTimeout(400);
  const hTrasRe = await hC.pg.evaluate(FOTO);
  console.log('    HEAD re-clic → transporte:' + hTrasRe.transporte + ' selH:' + JSON.stringify(hTrasRe.selH));
  af(hRe && hTrasRe.transporte === true && hTrasRe.selH === hC.trasZona.selH,
     'el re-clic de la habitación CAMBIA el estado: entonces el flujo sigue dependiendo de él y el arreglo '
     + 'es cosmético. ' + JSON.stringify(hTrasRe));

  // ── [T] Y EL TOTAL LLEGA · que no haya un SEGUNDO callejón detrás ─────
  // El transporte es una elección REAL en CDMX (cambia el precio), así que no
  // se pre-marca: el cliente elige y el total sale. Se mide hasta el final,
  // porque «el paso aparece» no es «el cliente puede comprar».
  console.log('\n[T] el camino completo hasta el total');
  const opciones = await hC.pg.evaluate(`[...document.querySelectorAll('#w-transport-card button')]
    .map((b) => (b.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40))`);
  console.log('    opciones: ' + JSON.stringify(opciones));
  af(opciones.length >= 2,
     'el paso del transporte apareció VACÍO: ' + JSON.stringify(opciones));
  const elegido = await hC.pg.evaluate(`(() => {
    const bs = [...document.querySelectorAll('#w-transport-card button')]
      .filter((b) => /Sin transporte/i.test(b.textContent || ''));
    if (bs.length) { bs[0].click(); return (bs[0].textContent || '').trim(); } return null; })()`);
  await hC.pg.waitForTimeout(800);
  const fin = await hC.pg.evaluate(FOTO);
  console.log('    tras «' + elegido + '» → result:' + fin.result + ' totales:' + JSON.stringify(fin.totales));
  af(elegido, 'no se encontró la opción «Sin transporte»: el camino no se pudo cerrar');
  af(fin.result === true && fin.totales.length > 0,
     'el total NO llega ni eligiendo transporte: hay un SEGUNDO callejón detrás del primero. '
     + JSON.stringify(fin));
  af(fin.totales.some((t) => /9,100/.test(t)),
     'el total de edc27 con «Sin transporte» tenía que ser el precio de su zona ($9,100) y salió '
     + JSON.stringify(fin.totales));
  await hC.ctx.close();

  // ── [M] EL PAR QUE DECIDIÓ EL ARREGLO · Monterrey NO se movió ────────
  // 🔒 El mismo flujo fuera de CDMX llegaba al total en BASE **y** en HEAD. Es
  // lo que prueba que la pre-selección ya confirmaba sola, y por eso no se le
  // cobró un clic a todo el país para arreglar un orden de líneas.
  console.log('\n[M] el par no-CDMX (frontera)');
  const bM = await recorrer(uB, 'frontera'), hM = await recorrer(uH, 'frontera');
  console.log('    BASE → result:' + bM.trasZona.result + ' totales:' + JSON.stringify(bM.trasZona.totales));
  console.log('    HEAD → result:' + hM.trasZona.result + ' totales:' + JSON.stringify(hM.trasZona.totales));
  af(bM.trasZona.result === true && bM.trasZona.totales.length > 0,
     'PREMISA DEL ARREGLO: en BASE el flujo de Monterrey tenía que llegar al total sin re-clic. Si no, la '
     + 'pre-selección NO confirmaba sola y el arreglo veraz habría sido el otro (nacer sin marcar). '
     + JSON.stringify(bM.trasZona));
  af(hM.trasZona.result === true && hM.trasZona.totales.length > 0,
     'Monterrey PERDIÓ su total con este cambio: ' + JSON.stringify(hM.trasZona));
  af(JSON.stringify(bM.trasZona.totales) === JSON.stringify(hM.trasZona.totales)
     || bM.trasZona.totales[bM.trasZona.totales.length - 1] === hM.trasZona.totales[hM.trasZona.totales.length - 1],
     'el total de Monterrey CAMBIÓ de número: ' + JSON.stringify(bM.trasZona.totales) + ' → '
     + JSON.stringify(hM.trasZona.totales));
  af(hM.trasZona.transporte === false,
     'a Monterrey le apareció el paso del transporte, y ahí no hay transporte a CDMX que elegir: '
     + JSON.stringify(hM.trasZona));

  // ── [G] LA FRASE DE CARD-GUIA, retirada con razón ────────────────────
  // 🔒 Y NO SE MIDE CON UN GREP: el comentario que explica por qué se retiró
  // CONTIENE el nombre del atributo (la aserción de ausencia que se caza sola,
  // van seis). Se mide el HECHO en la página: qué cards lo LLEVAN.
  console.log('\n[G] la frase de CARD-GUIA');
  const ctxG = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pgG = await ctxG.newPage();
  await pgG.goto(uH + '/', { waitUntil: 'domcontentloaded' });
  const portadoresH = await pgG.evaluate(`[...document.querySelectorAll('[data-guia-confirma]')].map((e) => e.id)`);
  await pgG.goto(uB + '/', { waitUntil: 'domcontentloaded' });
  const portadoresB = await pgG.evaluate(`[...document.querySelectorAll('[data-guia-confirma]')].map((e) => e.id)`);
  console.log('    portadores → BASE ' + JSON.stringify(portadoresB) + '  HEAD ' + JSON.stringify(portadoresH));
  af(portadoresB.indexOf('w-hotel-card') >= 0,
     'en BASE el card del hotel tenía que llevar la frase (la puso CARD-GUIA-1 por este callejón): '
     + JSON.stringify(portadoresB));
  af(portadoresH.indexOf('w-hotel-card') < 0,
     'la frase «Confirma tu habitación para seguir» sigue en el card del hotel, y hoy MENTIRÍA: la '
     + 'pre-selección ya confirma sola, así que pediría apretar un botón que no hace falta');
  // 🔒 EL MECANISMO SE QUEDA COMO MECANISMO Y NO COMO PROMESA: se le SIEMBRA el
  // atributo y se exige que la frase salga. Un lector sin su dato que además no
  // se puede comprobar es un hueco declarado, no tapado.
  // ⚠️ SE SIEMBRA SOBRE EL ESTADO REAL, y me costó un rojo: la primera versión
  // le ponía el atributo a una página RECIÉN ABIERTA, donde el paso del hotel
  // está SIN CONTESTAR — así que `guiaPintar` lo nombraba («Ahora elige tu
  // habitación») y nunca llegaba a la rama del atributo, que solo corre cuando
  // todo lo visible ESTÁ contestado y aun así no hay cotización. Se recorre el
  // camino del cliente primero, que es el único estado donde esa rama existe.
  await ctxG.close();
  const rG = await recorrer(uH, 'edc27', { dejar: true });
  const sembrado = await rG.pg.evaluate(`(() => {
    const c = document.getElementById('w-hotel-card');
    if (!c) return { ok: false };
    const marcado = !!document.querySelector('#d-hotel .h-btn.active');
    c.setAttribute('data-guia-confirma', 'TESTIGO SEMBRADO');
    // Se apagan los pasos de DESPUÉS y la cotización, para reproducir el único
    // estado en que esa rama corre: el hotel es el último a la vista, contestado.
    const t = document.getElementById('w-transport-card'); if (t) t.style.display = 'none';
    const r = document.getElementById('d-result'); if (r) r.style.display = 'none';
    if (typeof guiaPintar === 'function') guiaPintar();
    return { ok: true, marcado, texto: (document.getElementById('d-placeholder') || {}).textContent || '' };
  })()`);
  await rG.ctx.close();
  af(sembrado.marcado,
     'la premisa del sembrado falla: el paso del hotel tiene que estar CONTESTADO para que esa rama '
     + 'exista, y la habitación no quedó marcada');
  console.log('    con el atributo sembrado → ' + JSON.stringify(sembrado.texto));
  af(sembrado.ok && /TESTIGO SEMBRADO/.test(sembrado.texto || ''),
     'el lector de `data-guia-confirma` ya NO funciona: entonces no es un mecanismo esperando a un '
     + 'portador, es código muerto — y eso se poda, no se comenta. Salió ' + JSON.stringify(sembrado.texto));

  // ── [S] LA SIMETRÍA DE LA FUNCIÓN CONSIGO MISMA ──────────────────────
  // El arreglo es que las DOS ramas de `selPaquete` esconden el transporte en
  // el mismo momento. La rama que ya estaba bien es la que 0 de 117 eventos
  // alcanzan (`diaFirst`), y eso se dice en vez de callarse.
  console.log('\n[S] las dos ramas de selPaquete');
  const htmlH = fs.readFileSync(path.join(h.dir, 'index.html'), 'utf8');
  const htmlB = fs.readFileSync(path.join(b.dir, 'index.html'), 'utf8');
  // ⚠️ LAS RAMAS SE CORTAN POR BALANCE DE LLAVES, NO POR UN PREFIJO DE TEXTO.
  // Mi primera versión anclaba en `'// Normal flow'` y ese prefijo casa PRIMERO
  // con el comentario de `selFecha` —«Normal flow only (non-diaFirst…)»—, que
  // vive antes en el archivo: el careo midió una rebanada que empezaba en OTRA
  // función y se puso rojo sobre código correcto. Es la lección de `gzReactivar`:
  // **un prefijo no es un ancla.**
  function _balance(html, desde) {
    let i = html.indexOf('{', desde), prof = 0, k = i;
    for (;; k++) { if (html[k] === '{') prof++; else if (html[k] === '}') prof--; if (prof === 0) break; }
    return { ini: i, fin: k };
  }
  // 🔒 Y LOS COMENTARIOS FUERA ANTES DE MEDIR POSICIONES. La aserción de abajo
  // se puso ROJA cazando el `buildHotelButtons()` que vive DENTRO del comentario
  // que explica el arreglo («esta línea vivía DESPUÉS de `buildHotelButtons()`»).
  // Es la aserción que se caza sola — van SIETE— y aquí en su forma nueva: no
  // era una ausencia, era una POSICIÓN. El comentario que explica dónde estaba
  // algo NOMBRA ese algo, y lo nombra ANTES.
  const _pelado = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  function ramasDeSelPaquete(html) {
    const iFn = html.indexOf('function selPaquete(');
    if (iFn < 0) return null;
    const fn = _balance(html, iFn);
    const cuerpoFn = html.slice(fn.ini, fn.fin + 1);
    const iDia = cuerpoFn.indexOf('if(cur.diaFirst){');
    if (iDia < 0) return null;
    const bloqueDia = _balance(cuerpoFn, iDia);
    return {
      diaFirst: _pelado(cuerpoFn.slice(bloqueDia.ini, bloqueDia.fin + 1)),
      normal: _pelado(cuerpoFn.slice(bloqueDia.fin + 1)),
    };
  }
  // En las dos ramas, el `display='none'` del transporte va ANTES del
  // `buildHotelButtons()`. Se mide por POSICIÓN, no por presencia.
  const ramasH = ramasDeSelPaquete(htmlH);
  af(ramasH && ramasH.diaFirst && ramasH.normal,
     'no se pudieron aislar las dos ramas de `selPaquete`: el instrumento está roto y sus ausencias no '
     + 'dirían nada');
  for (const etiqueta of ['diaFirst', 'normal']) {
    const txt = ramasH ? ramasH[etiqueta] : null;
    if (!txt) continue;
    const iHide = txt.indexOf("$$('w-transport-card').style.display='none'");
    const iHotel = txt.indexOf('buildHotelButtons()');
    console.log('    ' + etiqueta.padEnd(9) + ' esconde@' + iHide + '  buildHotelButtons@' + iHotel
      + '  → ' + (iHide >= 0 && iHide < iHotel ? 'ANTES ✅' : 'DESPUÉS ❌'));
    af(iHide >= 0 && iHotel >= 0 && iHide < iHotel,
       'en la rama ' + etiqueta + ' el `display=none` del transporte NO va antes de `buildHotelButtons()`: '
       + 'ahí el auto-clic pre-marca la habitación, `selHotel` muestra el paso en CDMX y este renglón se lo '
       + 'vuelve a esconder. Es el callejón.');
  }
  // Y el control: en BASE la rama normal lo tenía DESPUÉS.
  const ramasB = ramasDeSelPaquete(htmlB);
  const normB = ramasB ? ramasB.normal : null;
  af(normB, 'no se pudo aislar la rama normal de selPaquete en BASE');
  const bHide = normB ? normB.indexOf("$$('w-transport-card').style.display='none'") : -1;
  const bHotel = normB ? normB.indexOf('buildHotelButtons()') : -1;
  console.log('    BASE normal  esconde@' + bHide + '  buildHotelButtons@' + bHotel);
  af(bHide > bHotel && bHotel >= 0,
     'en BASE la rama normal tenía que esconder el transporte DESPUÉS de construir el hotel: si no, el '
     + 'callejón venía de otra parte y este arreglo apunta al sitio equivocado');

  // ── [P] LO QUE NO SE DEBÍA MOVER ─────────────────────────────────────
  console.log('\n[P] lo que no se debía mover');
  function cuerpo(html, firma) {
    const i = html.indexOf(firma);
    if (i < 0) return null;
    let j = html.indexOf('{', i), prof = 0, k = j;
    for (;; k++) { if (html[k] === '{') prof++; else if (html[k] === '}') prof--; if (prof === 0) break; }
    return html.slice(i, k + 1);
  }
  for (const firma of ['function calcular(', 'function selHotel(', 'function buildHotelButtons(', 'function selZona(']) {
    const cb = cuerpo(htmlB, firma), ch = cuerpo(htmlH, firma);
    af(cb && ch && cb === ch,
       'el cuerpo de `' + firma + '…` cambió y no debía: el arreglo es UN renglón de `selPaquete` que se '
       + 'movió de sitio, no una regla nueva. ' + (cb ? cb.length : 'null') + ' vs ' + (ch ? ch.length : 'null'));
    console.log('    ' + firma.padEnd(28) + (cb && ch && cb === ch ? 'idéntico (' + cb.length + ' bytes)' : '❌ CAMBIÓ'));
  }

  // ── [C] EL CHEAP DE CDMX, que no lleva hotel ni transporte ───────────
  // Se mide porque es el OTRO camino de la misma función (`hasHotel` falso) y
  // una tuerca que mueve un renglón de reseteo puede romperlo sin que se note.
  console.log('\n[C] CHEAP en CDMX (sin hotel)');
  const hCh = await recorrer(uH, 'edc27', { pkg: 'cheap' });
  const bCh = await recorrer(uB, 'edc27', { pkg: 'cheap' });
  console.log('    BASE → hotel:' + bCh.trasZona.hotel + ' transporte:' + bCh.trasZona.transporte
    + ' totales:' + JSON.stringify(bCh.trasZona.totales));
  console.log('    HEAD → hotel:' + hCh.trasZona.hotel + ' transporte:' + hCh.trasZona.transporte
    + ' totales:' + JSON.stringify(hCh.trasZona.totales));
  af(hCh.trasZona.hotel === false && bCh.trasZona.hotel === false,
     'CHEAP no lleva paso de habitación y apareció: ' + JSON.stringify([bCh.trasZona.hotel, hCh.trasZona.hotel]));
  af(hCh.trasZona.transporte === bCh.trasZona.transporte,
     'el paso del transporte del CHEAP cambió de estado con esta tuerca: '
     + bCh.trasZona.transporte + ' → ' + hCh.trasZona.transporte);
  af(JSON.stringify(bCh.trasZona.totales) === JSON.stringify(hCh.trasZona.totales),
     'el total del CHEAP de edc27 cambió: ' + JSON.stringify(bCh.trasZona.totales) + ' → '
     + JSON.stringify(hCh.trasZona.totales));

  await nav.close(); sb.close(); sh.close();
  completo = true;
  process.exitCode = rojo ? 1 : 0;
})();
