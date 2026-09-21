#!/usr/bin/env node
// =============================================================================
// scripts/mide-stock-vivo.js — EL CAREO DE STOCK-VIVO-1
// =============================================================================
// «¡Últimos N!» en las zonas con 5 o menos, y no dejar pedir más lugares de los
// que quedan. La escasez vende; la escasez FALSA quema la confianza, así que
// todo lo que este careo mide es que el número venga del inventario y no de una
// ocurrencia del navegador.
//
// Cómo mide, y de dónde:
//   · Los DOS lados son COMMITS (`git archive`). El de BASE tiene que FALLAR lo
//     que HEAD arregla, o el verde de HEAD no dice nada.
//   · Se entra POR DONDE ENTRA EL CLIENTE: se sirve el commit por HTTP, arranca
//     el index entero y se HACE CLIC. Nada se llama por dentro.
//   · Todo se lee del HTML PINTADO por el navegador, jamás del fuente — el
//     comentario que explica el chip no puede cazarse a sí mismo.
//   · El endpoint se ataja EN LA RED (`page.route`), que es un salto más
//     adentro: corren de verdad `loadDisponibilidad`, `buildZonaButtons` y el
//     manejador del clic. Y el doble CUENTA SUS LLAMADAS: un fetch=0 no es un
//     resultado, es que nunca se ejecutó.
//
// ⚠️ EL GEMELO MUERTO: el libro avisa que el index tiene DOS constructores de
// chips de zona y que uno no lo llama nadie —un arnés ya midió la función
// muerta—. MEDIDO HOY: `renderZonas` YA NO EXISTE; vive solo
// `buildZonaButtons`, con 4 llamadores. La sección [0] lo vuelve a comprobar en
// cada corrida, porque el día que alguien reviva al gemelo esto tiene que
// gritar, no adivinar.
//
// Uso: node scripts/mide-stock-vivo.js   (BASE=<sha> HEAD=<sha> opcionales)
// =============================================================================

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const sh = (c) => execSync(c, { cwd: RAIZ, encoding: 'utf8' }).trim();
const BASE = sh(`git rev-parse ${process.env.BASE || 'origin/main'}`);
const HEAD = sh(`git rev-parse ${process.env.HEAD || 'HEAD'}`);
const ARCHIVOS = 'index.html imgs.js mapas.js lineups.js';

let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

function extraer(sha) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-'));
  execSync(`git archive ${sha} ${ARCHIVOS} | tar -x -C ${dir}`, { cwd: RAIZ });
  return dir;
}
function servir(dir) {
  const srv = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(404); return res.end('no'); }
      res.writeHead(200, { 'Content-Type': /\.js$/.test(f) ? 'text/javascript' : 'text/html; charset=utf-8' });
      res.end(b);
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, puerto: srv.address().port })));
}

// El doble del endpoint, EN LA RED. Devuelve lo que se le diga y CUENTA.
function armarRuta(page, respuestaPara) {
  const llamadas = [];
  return page.route('**/.netlify/functions/disponibilidad-evento', async (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}');
    llamadas.push(cuerpo.evento_id);
    const r = respuestaPara(cuerpo.evento_id);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
  }).then(() => llamadas);
}

// Abre la ficha de un evento por donde la abre el cliente y devuelve el HTML
// de las zonas ya pintadas.
// ⚠️ `showDetail` recibe un ID, NO el objeto del evento. Pasarle el EV entero
// deja la ficha a medio armar (`cur` en null) y el resto del asistente truena
// con «Cannot read properties of null» — sin que el arnés se entere, porque el
// error vive en la página. La firma se LEE del otro lado, no se recuerda.
async function abrirFicha(page, evId, viajeros) {
  await page.evaluate((id) => window.showDetail(id), evId);
  await page.waitForTimeout(120);
  // Los pasos, en el orden en que los toca el cliente: viajeros → paquete.
  await page.evaluate((n) => {
    const b = document.querySelectorAll('#w-viajeros .wiz-btn');
    if (b.length) b[(n || 1) - 1].click();
  }, viajeros || 1);
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const b = document.querySelectorAll('#w-pkg-card .wiz-btn');
    if (b.length) b[0].click();            // PLUS
  });
  await page.waitForTimeout(450);          // que llegue la disponibilidad
  return page.evaluate(() => {
    const el = document.getElementById('d-zonas');
    return el ? el.innerHTML : '';
  });
}

(async () => {
  console.log('CAREO STOCK-VIVO-1 · «¡Últimos N!» y el atajo de cantidad\n');
  console.log(`   BASE ${BASE.slice(0, 7)}  →  HEAD ${HEAD.slice(0, 7)}\n`);

  // ── [0] EL GEMELO MUERTO: anclar por NOMBRE y exigir llamadores ──────────
  console.log('[0] el constructor VIVO de chips de zona');
  const src = sh(`git show ${HEAD}:index.html`);
  const decl = (n) => (src.match(new RegExp('function\\s+' + n + '\\s*\\(', 'g')) || []).length;
  const llam = (n) => (src.match(new RegExp('(?<!function\\s)\\b' + n + '\\s*\\(', 'g')) || []).length - decl(n);
  console.log(`    buildZonaButtons: ${decl('buildZonaButtons')} declaración(es), ${llam('buildZonaButtons')} llamador(es)`);
  console.log(`    renderZonas:      ${decl('renderZonas')} declaración(es), ${llam('renderZonas')} llamador(es)`);
  af(decl('buildZonaButtons') === 1 && llam('buildZonaButtons') > 0,
     'el constructor donde va el chip no está vivo: declaraciones ' + decl('buildZonaButtons') + ', llamadores ' + llam('buildZonaButtons'));
  af(decl('renderZonas') === 0 || llam('renderZonas') > 0,
     'REVIVIÓ el gemelo muerto `renderZonas` y NADIE lo llama: el chip podría acabar en la función que nadie usa');

  const dirB = extraer(BASE), dirH = extraer(HEAD);
  const sB = await servir(dirB), sH = await servir(dirH);
  const nav = await chromium.launch();

  // Un evento de UNA fecha y otro MULTIFECHA, los dos del catálogo real.
  const EV1 = 'youngmiko', EVMF = 'straykids';

  async function corrida(puerto, respuesta, evId, viajeros) {
    const ctx = await nav.newContext();
    const page = await ctx.newPage();
    const llamadas = await armarRuta(page, respuesta);
    await page.goto(`http://127.0.0.1:${puerto}/index.html`, { waitUntil: 'load' });
    const html = await abrirFicha(page, evId, viajeros);
    return { page, ctx, html, llamadas };
  }
  const cerrar = async (c) => { await c.page.close(); await c.ctx.close(); };

  // Respuesta con las zonas REALES de youngmiko y los conteos que se pidan.
  const resp = (pocas, agotadas) => () => ({
    ok: true, evento_id: 'x', gestionado: true,
    zonas_gestionadas: [...Object.keys(pocas), ...(agotadas || []), 'Zona Abundante'],
    zonas_agotadas: agotadas || [], zonas_pocas: pocas,
  });

  // ── [1] EL UMBRAL: 6 sin chip · 5 con chip · 1 en singular ───────────────
  console.log('\n[1] el umbral de la escasez');
  const c5 = await corrida(sH.puerto, resp({ 'Cancha General': 5 }), EV1);
  console.log('    con 5 libres → ' + (/Últimos 5/.test(c5.html) ? '«¡Últimos 5!» ✓' : 'SIN CHIP ✗'));
  af(/¡Últimos 5!/.test(c5.html), 'con 5 libres no salió «¡Últimos 5!»');
  af(c5.llamadas.length > 0, 'el doble del endpoint NUNCA se llamó: un fetch=0 no es resultado');
  await cerrar(c5);

  const c1 = await corrida(sH.puerto, resp({ 'Cancha General': 1 }), EV1);
  console.log('    con 1 libre  → ' + (/Último lugar/.test(c1.html) ? '«¡Último lugar!» ✓' : 'mal'));
  af(/¡Último lugar!/.test(c1.html), 'con 1 libre tiene que decir «¡Último lugar!», no «¡Últimos 1!»');
  af(!/¡Últimos 1!/.test(c1.html), 'salió «¡Últimos 1!»: en singular se dice distinto');
  await cerrar(c1);

  // 🔒 CON 6 O MÁS, NADA. El servidor ni siquiera manda el número (solo ≤5), así
  // que aquí se comprueba el otro lado: aunque llegara, el chip no se pinta.
  const c6 = await corrida(sH.puerto, resp({}), EV1);
  console.log('    con 6+ libres → ' + (/Últimos|Último lugar/.test(c6.html) ? 'CHIP INDEBIDO ✗' : 'sin chip ✓'));
  af(!/¡Últimos|¡Último lugar/.test(c6.html),
     'con abundancia salió un chip: enseñar el inventario mata la urgencia y lo publica');
  await cerrar(c6);

  // 🔒 DEFENSA EN DOS CAPAS. Arriba se comprobó que sin número no hay chip —
  // pero eso pasa igual aunque el navegador no tuviera tope, porque el
  // servidor no manda nada. Aquí se le manda un 9 A PROPÓSITO: el cliente
  // tiene que rehusarlo igual. (Sin este caso, quitarle el `<=5` al navegador
  // pasaba VERDE: el hueco lo destapó un sabotaje.)
  const c9 = await corrida(sH.puerto, resp({ 'Cancha General': 9 }), EV1);
  console.log('    el servidor manda 9 → ' + (/¡Últimos 9!/.test(c9.html) ? 'LO PINTÓ ✗' : 'rehusado ✓'));
  af(!/¡Últimos 9!/.test(c9.html),
     'el navegador pintó un 9: el tope de 5 tiene que valer en las DOS capas, no solo en el servidor');
  await cerrar(c9);

  // ── [2] ZONA NO GESTIONADA: jamás dice «últimos» ─────────────────────────
  console.log('\n[2] zona NO gestionada');
  // El servidor manda un conteo de una zona que NO está gestionada. Tiene que
  // ignorarse: una zona sin manejo de stock diciendo «últimos» es escasez
  // INVENTADA, y eso no se hace ni por marketing.
  // ⚠️ DOS VECES MAL ANTES DE QUEDAR BIEN, y las dos por el FIXTURE:
  //   (1) puse la misma zona en las dos listas, así que quitarle al código el
  //       filtro de gestionada no cambiaba nada;
  //   (2) la cambié por «Luneta»… que en el catálogo trae `ag:1`, o sea que la
  //       tapaba OTRA guarda —la de lo agotado— y el sabotaje seguía pasando.
  // «Barrera» está libre en el EV y no viene en `zonas_gestionadas`: es la
  // única forma de que esta guarda sea la que decide. El fixture se mide, no
  // se elige de memoria.
  const cng = await corrida(sH.puerto, () => ({ ok: true, gestionado: true,
    zonas_gestionadas: ['Cancha General'], zonas_agotadas: [],
    zonas_pocas: { 'Cancha General': 2, 'Barrera': 3 } }), EV1);   // Barrera NO gestionada
  const chips = (cng.html.match(/data-pocas="[^"]*"/g) || []);
  console.log('    chips pintados: ' + chips.length + ' ' + JSON.stringify(chips));
  af(chips.length === 1, 'se pintaron ' + chips.length + ' chip(s) y solo UNA de las dos zonas está gestionada: '
     + 'una zona sin manejo de stock diciendo «últimos» es escasez INVENTADA');
  af(!/Barrera[\s\S]{0,260}¡Últimos 3!/.test(cng.html), 'la zona NO gestionada enseñó su chip');
  await cerrar(cng);

  // ── [3] REGRESIÓN DEL OVERLAY: 0 sigue apagando ──────────────────────────
  console.log('\n[3] el apagado a cero (regresión)');
  // El servidor manda la MISMA zona como agotada Y con conteo (dato
  // contradictorio, pero el navegador no puede confiar en que nunca pase). El
  // apagado manda y el chip no se pinta.
  // ⚠️ Antes este caso mandaba `pocas` VACÍO, así que el candado del chip no se
  // ejercitaba: un sabotaje que lo pintaba sobre lo agotado pasaba verde.
  const c0 = await corrida(sH.puerto, resp({ 'Cancha General': 2 }, ['Cancha General']), EV1);
  af(/z-ag-badge/.test(c0.html) && /AGOTADO/.test(c0.html), 'el apagado a cero dejó de funcionar');
  af(!/¡Últimos|¡Último lugar/.test(c0.html), 'una zona AGOTADA enseñó chip de escasez');
  console.log('    zona agotada → ' + (/AGOTADO/.test(c0.html) ? 'apagada ✓ y sin chip ✓' : 'mal'));
  await cerrar(c0);

  // ── [4] MULTIFECHA: la llave lleva #N ────────────────────────────────────
  // 🔴 MEDIDO ANTES DE TOCAR NADA: el overlay pedía la BASE (`straykids`) y el
  // stock de KH se llavea por fecha (`straykids#0`), así que el endpoint
  // contestaba `gestionado=false` y los 15 multifecha NO recibían overlay
  // ninguno — ni el apagado. La tuerca lo daba por resuelto.
  console.log('\n[4] multifecha: la llave por fecha');
  const cmf = await corrida(sH.puerto, resp({ 'Zona GNP': 2 }), EVMF);
  console.log('    el index pidió: ' + JSON.stringify(cmf.llamadas));
  af(cmf.llamadas.length > 0 && cmf.llamadas.every((k) => /#\d+$/.test(k)),
     'en multifecha la llave no lleva #N: ' + JSON.stringify(cmf.llamadas)
     + ' — con la base, el endpoint contesta gestionado=false y el evento se queda SIN overlay');
  await cerrar(cmf);

  // ── [5] LA CANTIDAD: 2 viajeros contra 1 libre ───────────────────────────
  console.log('\n[5] pedir 2 con 1 disponible');
  const cq = await corrida(sH.puerto, resp({ 'Cancha General': 1 }), EV1, 2);
  const r = await cq.page.evaluate(() => {
    const b = [...document.querySelectorAll('#d-zonas .z-btn:not(.ag)')]
      .find((x) => (x.getAttribute('data-n') || '') === 'Cancha General');
    if (!b) return { falta: true };
    b.click();
    // ⚠️ El aviso se lee del TOAST, que es donde el cliente lo ve. La primera
    // versión raspaba el final de `document.body.textContent` y lo que traía
    // era el código de la marquesina: un rojo del instrumento, no del código.
    const t = document.getElementById('toast');
    return { falta: false,
      aviso: t ? t.textContent : '',
      visible: !!(t && /\bshow\b/.test(t.className)),
      zonaElegida: !!window.selZ };
  });
  console.log('    tras el clic → zona elegida: ' + r.zonaElegida);
  af(!r.falta, 'la zona con 1 libre no se pudo ni encontrar');
  af(r.zonaElegida === false, 'SE ARMÓ LA COTIZACIÓN IMPOSIBLE: 2 viajeros sobre 1 lugar');
  console.log('    el aviso: «' + String(r.aviso).slice(0, 110) + '»');
  af(/solo queda/i.test(r.aviso), 'no se le dijo al cliente cuántos quedan: ' + JSON.stringify(String(r.aviso).slice(0, 160)));
  // 🔒 «Existe» no es «se ve»: el toast tiene que estar MOSTRÁNDOSE.
  af(r.visible === true, 'el aviso existe en el DOM pero no se está enseñando (le falta la clase `show`)');
  af(/WhatsApp/i.test(r.aviso), 'el aviso no le dice por dónde resolver el resto');
  await cerrar(cq);

  // Y con 2 viajeros contra 2 libres SÍ se puede: el candado no puede ser
  // «nunca se elige nada».
  const cq2 = await corrida(sH.puerto, resp({ 'Cancha General': 2 }), EV1, 2);
  const r2 = await cq2.page.evaluate(() => {
    const b = [...document.querySelectorAll('#d-zonas .z-btn:not(.ag)')]
      .find((x) => (x.getAttribute('data-n') || '') === 'Cancha General');
    b.click(); return !!window.selZ;
  });
  console.log('    2 viajeros contra 2 libres → elegida: ' + r2);
  af(r2 === true, 'con lugares SUFICIENTES la zona no se dejó elegir: el candado muerde de más');
  await cerrar(cq2);

  // Y sin conteo (zona con >5), NO se bloquea nada.
  const cq3 = await corrida(sH.puerto, resp({}), EV1, 4);
  const r3 = await cq3.page.evaluate(() => {
    const b = [...document.querySelectorAll('#d-zonas .z-btn:not(.ag)')]
      .find((x) => (x.getAttribute('data-n') || '') === 'Cancha General');
    b.click(); return !!window.selZ;
  });
  console.log('    sin conteo (zona abundante) → elegida: ' + r3);
  af(r3 === true, 'sin conteo el index bloqueó: la guarda de verdad es el servidor al solicitar');
  await cerrar(cq3);

  // ── [6] EL CONTROL POSITIVO: BASE tiene que FALLAR ───────────────────────
  console.log('\n[6] CONTROL POSITIVO · lo mismo contra BASE');
  const b5 = await corrida(sB.puerto, resp({ 'Cancha General': 5 }), EV1);
  console.log('    BASE con 5 libres → ' + (/¡Últimos 5!/.test(b5.html) ? 'YA LO HACÍA ✗' : 'sin chip ✓'));
  af(!/¡Últimos 5!/.test(b5.html),
     'BASE ya pintaba el chip: entonces el verde de HEAD no prueba que esta tuerca lo trajo');
  await cerrar(b5);
  const bmf = await corrida(sB.puerto, resp({ 'Zona GNP': 2 }), EVMF);
  console.log('    BASE multifecha pidió: ' + JSON.stringify(bmf.llamadas));
  af(bmf.llamadas.some((k) => !/#\d+$/.test(k)),
     'BASE ya pedía con #N: entonces el arreglo de la llave no es de esta tuerca');
  await cerrar(bmf);

  // ── [7] EL SERVIDOR NO EXPONE NÚMEROS GRANDES ───────────────────────────
  // La aserción va sobre el JSON que el endpoint SIRVE, no sobre su fuente: un
  // cliente curioso del DevTools no puede ver más de lo que el chip dice.
  console.log('\n[7] el JSON servido por el endpoint real');
  try {
    const disp = require(path.join(RAIZ, 'netlify/functions/disponibilidad-evento.js'));
    const res = await disp.handler({ httpMethod: 'POST', headers: {},
      body: JSON.stringify({ evento_id: process.env.EV_PRUEBA || 'youngmiko' }) });
    const d = JSON.parse(res.body);
    if (d && d.ok) {
      const vals = Object.values(d.zonas_pocas || {});
      console.log('    zonas_pocas servidas: ' + JSON.stringify(d.zonas_pocas));
      af(vals.length > 0, 'el evento de prueba no trae ninguna zona con pocas: el candado de abajo pasaría en hueco');
      af(vals.every((v) => v >= 1 && v <= 5), 'el endpoint expuso un número FUERA de 1..5: ' + JSON.stringify(d.zonas_pocas));
      af(!('stock' in d) && !('vendidos' in d) && !('stockPorZona' in d),
         'el endpoint expuso el inventario completo, no solo la escasez: ' + Object.keys(d).join(','));
    } else { console.log('    (sin credenciales: se salta)'); }
  } catch (e) { console.log('    (no se pudo consultar el endpoint real: ' + e.message + ')'); }

  await nav.close(); sB.srv.close(); sH.srv.close();
  fs.rmSync(dirB, { recursive: true, force: true }); fs.rmSync(dirH, { recursive: true, force: true });

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); process.exit(1); });
