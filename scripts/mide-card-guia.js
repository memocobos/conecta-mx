#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-card-guia.js — CARD-GUIA-1 · EL COTIZADOR QUE ACOMPAÑA
//
// 🔒 SE MIDE EL CAMINO DEL CLIENTE, PASO POR PASO, en 390×844: se abre el
// evento por su url, se elige viajeros → paquete → zona → habitación, y en
// CADA paso se lee lo que el letrero DICE. No se llama a `calcular()` a mano:
// el letrero se escribe desde sus salidas tempranas, y llamarla por fuera
// mediría la función en vez del camino.
//
// 🔒 LOS DOS LADOS SON COMMITS.
//     BASE = d3ca76c  el letrero mudo: la misma frase para los cinco pasos
//     HEAD = f6620d6  cada paso dice el suyo
//
// ⚠️ LA PREMISA DEL ENCARGO NO SE SOSTUVO y el careo la deja medida: el FAB de
// ayuda NO EXISTE en el árbol. Se afirma aquí para que nadie vuelva a
// diseñar «sobre los hints del FAB».
//
// Se corre:  npm run mide:card-guia
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
const BASE = process.env.BASE || 'd3ca76c';
const HEAD_SHA = process.env.HEAD_SHA || 'f6620d6';
// `frontera` es de Monterrey y vende PLUS con zona y hotel: recorre los tres
// pasos del encargo. El de CDMX se mide aparte porque tiene un paso más.
const EV_MTY = 'frontera';
const EV_CDMX = 'edc27';
const ARRANQUE = 'Elige tus opciones para ver tu cotización';

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
      const tipo = /\.js$/.test(f) ? 'text/javascript'
        : /\.css$/.test(f) ? 'text/css'
        : /\.jpe?g$/.test(f) ? 'image/jpeg'
        : /\.png$/.test(f) ? 'image/png'
        : /\.webp$/.test(f) ? 'image/webp' : 'text/html; charset=utf-8';
      r.writeHead(200, { 'Content-Type': tipo }); r.end(b);
    });
  });
}

// 🔒 «EXISTE» NO ES «SE VE»: el letrero se lee SOLO si el cliente lo está
// viendo. Un texto correcto en un nodo escondido no acompaña a nadie.
const LETRERO = `(function(){
  var e = document.getElementById('d-placeholder');
  if (!e) return { hay:false };
  var cs = getComputedStyle(e), r = e.getBoundingClientRect();
  return { hay:true,
           ve: !e.hidden && e.offsetParent !== null && cs.display !== 'none'
               && cs.visibility !== 'hidden' && Number(cs.opacity) >= .05
               && r.width > 0 && r.height > 0,
           txt: (e.textContent || '').trim(),
           y: Math.round(r.y), h: Math.round(r.height) };
})()`;

async function abrirEvento(page, base, id) {
  await page.goto(base + '/' + id, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const ve = await page.evaluate(() => {
    const e = document.getElementById('onboard-bg');
    return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
  });
  if (ve) {
    await page.evaluate(() => { if (typeof skipOnboarding === 'function') skipOnboarding(); });
    await page.waitForTimeout(250);
  }
}
// Aprieta el primer botón VISIBLE que case con el texto, dentro del wizard.
// Entrar por el botón es la única forma de que el estado lo arme el sitio.
// ⚠️ LOS IDS SE LEYERON DEL MARKUP, no se adivinaron: la card de viajeros es
// `w-viajeros-card` y no `w-viaj-card`, y la de zona lleva DENTRO el botón
// «Ver mapa del venue» (`#w-mapa-btn`), que no es una zona. La primera versión
// de este careo los inventó y dio tres rojos que eran míos: la lista a mano al
// lado de la realidad.
async function apretar(page, sel) {
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: 8000 });
  await loc.click();
  await page.waitForTimeout(350);
}

(async () => {
  const b = sacar(BASE, 'guia-base'), h = sacar(HEAD_SHA, 'guia-head');
  console.log('CAREO CARD-GUIA-1 · el cotizador que acompaña\n');
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
    // ── [0] LA PREMISA DEL ENCARGO, MEDIDA ────────────────────────────────
    // «Montado sobre los hints sutiles del FAB» — el FAB no existe. Se deja
    // medido para que no se vuelva a diseñar sobre algo que no está.
    console.log('[0] la premisa del encargo: ¿existe el FAB de ayuda?');
    const idx = fs.readFileSync(path.join(h.dir, 'index.html'), 'utf8');
    const sinCom = idx.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
    af(/sistema de ayuda ya eliminado/.test(idx),
       'el index ya no dice que el sistema de ayuda fue eliminado: si volvió, la guía debería montarse ahí');
    af(!/help-fab-shown['"]\s*\]?\s*=/.test(sinCom) && !/id=["']help-fab/.test(sinCom),
       'apareció un FAB de ayuda en el árbol: entonces la guía SÍ tenía dónde montarse y hay que revisarlo');
    await abrirEvento(page, uH, EV_MTY);
    const fabs = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('*').forEach((e) => {
        const cs = getComputedStyle(e);
        if (cs.position !== 'fixed') return;
        const r = e.getBoundingClientRect();
        if (r.width < 20 || r.width > 120 || r.height < 20 || r.height > 120) return;
        if (cs.display === 'none' || Number(cs.opacity) < .05) return;
        out.push((e.id || e.className || e.tagName) + '');
      });
      return out;
    });
    console.log('    flotantes chicos a la vista: ' + JSON.stringify(fabs));
    af(!fabs.some((c) => /help|ayuda|\?|hint/i.test(c)),
       'hay un flotante de ayuda en la pantalla: ' + JSON.stringify(fabs));

    // ── [1] EL LETRERO ARRANCA EN SU FRASE, Y SE VE ───────────────────────
    console.log('\n[1] el letrero al abrir el card');
    let l = await page.evaluate(LETRERO);
    console.log('    ' + JSON.stringify(l.txt) + '  ve=' + l.ve + ' y=' + l.y);
    af(l.hay && l.ve, 'el letrero del cotizador no SE VE al abrir el card: ' + JSON.stringify(l));
    af(l.txt === ARRANQUE, 'al abrir el card el letrero dice ' + JSON.stringify(l.txt)
       + ' y debe decir su frase de arranque: nada que el cliente no haya hecho todavía');

    // ── [2] EL CAMINO, PASO POR PASO ──────────────────────────────────────
    // Se entra por los BOTONES del wizard, nunca llamando a `calcular()`: el
    // letrero sale de sus salidas tempranas, y llamarla por fuera mediría la
    // función en vez del camino (la lección de «probar el camino, no la
    // función»).
    console.log('\n[2] el camino del cliente, paso por paso');
    const dicho = [];
    // 1 · viajeros
    await apretar(page, '#w-viajeros-card .wiz-btn');
    l = await page.evaluate(LETRERO); dicho.push(['tras viajeros', l.txt, l.ve]);
    // 2 · paquete
    await apretar(page, '#w-pkg-card button');
    l = await page.evaluate(LETRERO); dicho.push(['tras paquete', l.txt, l.ve]);
    // 3 · zona
    await apretar(page, '#w-zona-card button:not(#w-mapa-btn)');
    l = await page.evaluate(LETRERO); dicho.push(['tras zona', l.txt, l.ve]);
    dicho.forEach(([q, t, v]) => console.log('    ' + q.padEnd(14) + JSON.stringify(t) + (v ? '' : '  (NO SE VE)')));

    // Tras elegir VIAJEROS, lo que falta es el paquete — y eso es lo que dice.
    af(/Ahora elige tu paquete\./.test(dicho[0][1]),
       'tras elegir viajeros el letrero dice ' + JSON.stringify(dicho[0][1])
       + ' y debía pedir el PAQUETE, que es el primer paso que el sitio ABRE');
    af(dicho[0][2], 'el letrero del paso del paquete no se ve');
    // Tras el paquete, la zona.
    af(/Ahora elige tu zona\./.test(dicho[1][1]),
       'tras elegir el paquete el letrero dice ' + JSON.stringify(dicho[1][1]) + ' y debía pedir la ZONA');
    af(dicho[1][2], 'el letrero del paso de la zona no se ve');
    // 🔒 Y EL ORDEN NO SE SALTA PASOS: nombrar la zona cuando falta el paquete
    // mandaría al cliente a un paso que todavía no existe. Mi primera versión
    // escribía el letrero en cada REVELADO y `selPaquete` abre la zona Y la
    // habitación en la misma pasada: ganaba el último y pedía la habitación
    // cuando faltaba la zona. Hoy el orden lo dice el DOCUMENTO.
    af(!/zona|habitaci/i.test(dicho[0][1]),
       'el letrero nombra la zona o la habitación cuando lo que falta es el paquete: manda al cliente '
       + 'a un paso que todavía no está abierto');
    af(!/habitaci/i.test(dicho[1][1]), 'el letrero pide la habitación cuando lo que falta es la zona');
    // ⚠️ TRAS LA ZONA NO PIDE LA HABITACIÓN, Y ESO ESTÁ BIEN: medido, el sitio
    // la trae PRE-MARCADA («Compartida») en 1, 2 y 3 viajeros, en MTY y en
    // CDMX. En un evento de Monterrey con eso ya está todo, así que la
    // cotización aparece y el letrero SE APAGA — no tiene nada que pedir.
    // Mi primera aserción exigía «Ahora elige tu habitación» aquí y era MÍA:
    // el paso no estaba pendiente, estaba contestado de fábrica.
    const hotelPre = await page.evaluate(() => {
      const c = document.getElementById('w-hotel-card');
      return !!c && getComputedStyle(c).display !== 'none' && !!c.querySelector('.active');
    });
    console.log('    la habitación viene pre-marcada: ' + hotelPre);
    af(hotelPre, '⚠️ PREMISA CAMBIADA: la habitación YA NO viene pre-marcada. Entonces sí hay un paso '
       + 'pendiente ahí y el letrero debe pedirla — revisa este bloque y el de CDMX');
    l = await page.evaluate(LETRERO);
    const res = await page.evaluate(() => {
      const e = document.getElementById('d-result');
      if (!e) return null;
      return getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
    });
    console.log('    tras la zona: letrero ve=' + l.ve + ' · cotización a la vista=' + res);
    af(res === true, 'en Monterrey, con la habitación pre-marcada, la cotización debía aparecer tras la zona');
    af(!l.ve, 'con todo elegido el letrero de guía SIGUE a la vista: ya no tiene nada que pedir');

    // ── [3] CDMX · EL CALLEJÓN QUE ESTABA MUDO ────────────────────────────
    // 🔴 Medido: en un evento de CDMX, tras elegir la zona, la habitación
    // viene PRE-MARCADA, el paso del transporte está todavía OCULTO y la
    // cotización NO aparece. El cliente tiene que apretar la opción que ya
    // estaba marcada para que el flujo siga. El callejón es PRE-EXISTENTE
    // —esta tuerca no lo arregla— pero el letrero ahí decía «Elige tus
    // opciones para ver tu cotización», que no le dice QUÉ apretar.
    console.log('\n[3] CDMX · el callejón que estaba mudo');
    const ctxC = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const pC = await ctxC.newPage();
    const errC = []; pC.on('pageerror', (e) => errC.push(String(e.message)));
    await abrirEvento(pC, uH, EV_CDMX);
    await apretar(pC, '#w-viajeros-card .wiz-btn');
    await apretar(pC, '#w-pkg-card button');
    let lC = await pC.evaluate(LETRERO);
    af(/Ahora elige tu zona\./.test(lC.txt), 'en CDMX, tras el paquete, el letrero dice ' + JSON.stringify(lC.txt));
    await apretar(pC, '#w-zona-card button:not(#w-mapa-btn)');
    const estadoC = await pC.evaluate(() => ({
      transporte: getComputedStyle(document.getElementById('w-transport-card')).display,
      hotelPre: !!document.querySelector('#w-hotel-card .active'),
      cotiza: (function(){ const e = document.getElementById('d-result'); return !!e && getComputedStyle(e).display !== 'none'; })(),
    }));
    lC = await pC.evaluate(LETRERO);
    console.log('    tras la zona en CDMX: ' + JSON.stringify(estadoC) + ' · letrero: ' + JSON.stringify(lC.txt));
    // La premisa del callejón: si algún día se arregla, estas aserciones avisan.
    af(estadoC.transporte === 'none' && estadoC.hotelPre && !estadoC.cotiza,
       '⚠️ PREMISA CAMBIADA (y sería buena noticia): el callejón de CDMX ya no ocurre '
       + JSON.stringify(estadoC) + '. Revisa este bloque: la frase de confirmación puede sobrar');
    af(/Confirma tu habitaci[oó]n para seguir\./.test(lC.txt),
       '🔴 en el callejón de CDMX el letrero dice ' + JSON.stringify(lC.txt)
       + ' y debía decir QUÉ apretar: es el silencio que esta tuerca viene a quitar');
    af(lC.txt !== ARRANQUE, 'en el callejón de CDMX el letrero se quedó en la frase muda');
    af(lC.ve, 'el letrero del callejón no se ve');
    // Y al apretar la habitación pre-marcada, el paso del transporte abre y el
    // letrero lo pide: la cadena completa, sin un solo momento mudo.
    await apretar(pC, '#w-hotel-card button');
    lC = await pC.evaluate(LETRERO);
    console.log('    tras confirmar la habitación: ' + JSON.stringify(lC.txt));
    af(/Ahora elige c[oó]mo llegas\./.test(lC.txt),
       'tras confirmar la habitación el letrero dice ' + JSON.stringify(lC.txt) + ' y debía pedir el transporte');
    af(errC.length === 0, 'CDMX tiró errores de JS: ' + errC.slice(0, 3).join(' · '));
    await ctxC.close();

    // ── [4] EL LETRERO NO SE QUEDA PEGADO AL CAMBIAR DE EVENTO ────────────
    // Sin el reseteo, abrir otro evento diría «Ahora elige tu habitación»
    // antes de que el cliente eligiera nada. Un letrero viejo es peor que uno
    // genérico, porque el genérico no miente.
    console.log('\n[4] el letrero no se queda pegado');
    await abrirEvento(page, uH, EV_MTY);
    await apretar(page, '#w-viajeros-card .wiz-btn');
    const antes = (await page.evaluate(LETRERO)).txt;
    await page.evaluate(() => { if (typeof showDetail === 'function') showDetail('prevail'); });
    await page.waitForTimeout(600);
    const despues = (await page.evaluate(LETRERO)).txt;
    console.log('    antes: ' + JSON.stringify(antes) + '  → al abrir otro evento: ' + JSON.stringify(despues));
    af(/Ahora elige/.test(antes), 'la premisa no se sostiene: el letrero no traía guía antes de cambiar de evento');
    af(despues === ARRANQUE, 'el letrero se quedó PEGADO del evento anterior: dice ' + JSON.stringify(despues));

    // ── [5] LA URL QUE SE COMPARTE · la trampa del `var` hoisted ──────────
    // Es la tercera cara de lo mismo en esta serie, y aquí NO tira error: sin
    // la guarda, el letrero diría literalmente «undefined» y nadie lo vería en
    // la consola.
    console.log('\n[5] por la url que se comparte');
    const ctxU = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const pU = await ctxU.newPage();
    const errU = []; pU.on('pageerror', (e) => errU.push(String(e.message)));
    await abrirEvento(pU, uH, EV_MTY);
    const lU = await pU.evaluate(LETRERO);
    console.log('    ' + JSON.stringify(lU.txt));
    af(lU.txt === ARRANQUE, 'entrando por la url el letrero dice ' + JSON.stringify(lU.txt));
    af(!/undefined/i.test(lU.txt),
       '🔴 el letrero dice «undefined»: `GUIA_ARRANQUE` se leyó a media parseada, cuando el `var` existe '
       + 'por hoisting pero todavía no vale nada. Y no tira error, así que nadie lo ve en la consola');
    af(errU.length === 0, 'entrar por la url tiró errores de JS: ' + errU.slice(0, 3).join(' · '));
    await ctxU.close();
    af(errores.length === 0, 'la página tiró ' + errores.length + ' error(es) de JS: ' + errores.slice(0, 3).join(' · '));

    // ── [6] CONTROL POSITIVO · en BASE el letrero era MUDO ────────────────
    // La misma secuencia, en BASE: el letrero no se mueve. Sin esto, el verde
    // de arriba no distingue «lo hice hablar» de «ya hablaba».
    console.log('\n[6] CONTROL POSITIVO · la misma secuencia en BASE');
    await abrirEvento(page, uB, EV_MTY);
    const bDicho = [];
    bDicho.push((await page.evaluate(LETRERO)).txt);
    await apretar(page, '#w-viajeros-card .wiz-btn');
    bDicho.push((await page.evaluate(LETRERO)).txt);
    await apretar(page, '#w-pkg-card button');
    bDicho.push((await page.evaluate(LETRERO)).txt);
    await apretar(page, '#w-zona-card button:not(#w-mapa-btn)');
    bDicho.push((await page.evaluate(LETRERO)).txt);
    console.log('    BASE dice, en los cuatro momentos: ' + JSON.stringify(bDicho));
    af(bDicho.every((t) => t === ARRANQUE),
       'en BASE el letrero YA cambiaba por paso (' + JSON.stringify(bDicho) + '): entonces [2] no prueba nada');
    af(new Set(bDicho).size === 1, 'en BASE el letrero no era el mismo en los cuatro momentos');
  } catch (e) {
    console.log('   ✗ EXCEPCIÓN en el navegador: ' + e.message);
    rojo++; fallos.push('EXCEPCIÓN: ' + e.message);
  } finally {
    await nav.close(); sb.close(); sh.close();
  }

  completo = true;
  marcador();
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); marcador(); process.exit(1); });
