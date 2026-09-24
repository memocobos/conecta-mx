#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-num-bus-1.js — NUM-BUS-1 · EL BUS COTIZA AL NÚMERO DE VIAJES
//
// Regla firmada de Memo (23-sep-2026): cotizar autobús va al **8132321405**
// —el número de vuelos y buses—, no al 8119771072, que es el de RESERVAS.
//
// 🔒 SE MIDE EL BOTÓN RENDERIZADO, no el archivo: lo que importa es a qué
// número manda el botón que el cliente aprieta. Un grep del número diría que
// «ya está cambiado» aunque el botón construyera otra cosa.
//
// 🔒 Y EL CONTROL QUE ESTA TUERCA NECESITA MÁS QUE EL CAMBIO: que los de
// RESERVAS **no se movieron**. Un barrido de números es la clase de cambio que
// arregla uno y se lleva cinco por el camino, así que se cuentan TODOS los
// `wa.me` del árbol y se exige la cuenta exacta, archivo por archivo.
//
// 🔒 LOS DOS LADOS SON COMMITS.
//     BASE = 19f8d16  el bus cotizaba al número de reservas
//     HEAD = b36c041  cotiza al de viajes (el commit del MERGE)
//
// Se corre:  npm run mide:num-bus-1
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
const BASE = process.env.BASE || '19f8d16';
const HEAD_SHA = process.env.HEAD_SHA || 'b36c041';
const VIAJES   = '528132321405';   // vuelos y buses: COTIZAR
const RESERVAS = '528119771072';   // reservar, apartar, informes

// Un evento de CDMX a ≤15 días: es el único estado donde el bus manda a
// WhatsApp. Con el reloj congelado, medido: `brunomars` (4-dic) a 3 días.
const HOY = Date.parse('2026-12-01T12:00:00-05:00');
const EV_CERCA = 'brunomars';

const CONGELAR = (t) => {
  const Real = Date;
  const Falso = new Proxy(Real, {
    construct(T, args) { return args.length ? new T(...args) : new T(t); },
    apply() { return new Real(t).toString(); },
  });
  Object.defineProperty(Falso, 'now', { value: () => t, writable: true });
  window.Date = Falso;
};

function servidor(raiz) {
  return http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (/nube-vigente/.test(u)) {
      // Sin cotización vigente: así el bus cae a su WhatsApp por las DOS
      // razones posibles y el número se mide en el caso que de verdad ocurre.
      r.writeHead(200, { 'Content-Type': 'application/json' });
      return r.end(JSON.stringify({ ok: true, bus: null, avion: null }));
    }
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
      const tipo = /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css'
        : /\.jpe?g$/.test(f) ? 'image/jpeg' : /\.png$/.test(f) ? 'image/png' : 'text/html; charset=utf-8';
      r.writeHead(200, { 'Content-Type': tipo }); r.end(b);
    });
  });
}

// Cuenta TODOS los `wa.me/<número>` del árbol, por archivo. Los `wa.me/52` +
// dígitos variables NO se cuentan como nuestros: abren el chat del CLIENTE
// (el teléfono del ganador del sorteo, el de un viajero), y meterlos aquí
// habría convertido el control en ruido.
function censo(dir) {
  const out = {};
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      if (f === 'node_modules' || f === '.git') continue;
      const p = path.join(d, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (!/\.(html|js)$/.test(f)) continue;
      const s = fs.readFileSync(p, 'utf8');
      for (const m of s.matchAll(/wa\.me\/(\d{10,})/g)) {
        const rel = path.relative(dir, p);
        out[rel] = out[rel] || {};
        out[rel][m[1]] = (out[rel][m[1]] || 0) + 1;
      }
    }
  })(dir);
  return out;
}

(async () => {
  const b = sacar(BASE, 'nb-base'), h = sacar(HEAD_SHA, 'nb-head');
  console.log('CAREO NUM-BUS-1 · el bus cotiza al número de viajes\n');
  console.log('  BASE ' + b.sha.slice(0, 7) + '  ·  HEAD ' + h.sha.slice(0, 7) + '\n');

  // ══ [1] EL CENSO · qué se movió y qué no ═══════════════════════════════
  console.log('[1] el censo de números, archivo por archivo');
  const cB = censo(b.dir), cH = censo(h.dir);
  const archivos = [...new Set([...Object.keys(cB), ...Object.keys(cH)])].sort();
  const movidos = [];
  for (const f of archivos) {
    const antes = cB[f] || {}, despues = cH[f] || {};
    const nums = [...new Set([...Object.keys(antes), ...Object.keys(despues)])];
    for (const n of nums) {
      const a = antes[n] || 0, d = despues[n] || 0;
      if (a !== d) movidos.push({ f, n, a, d });
    }
  }
  movidos.forEach((m) => console.log('    ' + m.f + '  ' + m.n + ': ' + m.a + ' → ' + m.d));
  const total = (c) => Object.values(c).reduce((s, o) => s + Object.values(o).reduce((x, y) => x + y, 0), 0);
  console.log('    total de wa.me nuestros: BASE ' + total(cB) + ' · HEAD ' + total(cH));
  af(total(cB) === total(cH),
     'el barrido AGREGÓ o QUITÓ enlaces de WhatsApp (' + total(cB) + ' → ' + total(cH)
     + '): esta tuerca solo cambia un número de destino, no la cantidad de puertas');
  // 🔒 EXACTAMENTE DOS renglones se mueven, y los dos en index.html: uno menos
  // de reservas y uno más de viajes. Un barrido de números es la clase de
  // cambio que arregla uno y se lleva cinco: la cuenta exacta es el candado.
  af(movidos.length === 2, 'se movieron ' + movidos.length + ' renglones y debían ser 2: ' + JSON.stringify(movidos));
  af(movidos.every((m) => m.f === 'index.html'),
     'se tocó un archivo que no es index.html: ' + JSON.stringify(movidos.map((m) => m.f)));
  const menosRes = movidos.find((m) => m.n === RESERVAS);
  const masViajes = movidos.find((m) => m.n === VIAJES);
  af(menosRes && menosRes.a - menosRes.d === 1,
     'no bajó EXACTAMENTE uno del número de reservas: ' + JSON.stringify(menosRes));
  af(masViajes && masViajes.d - masViajes.a === 1,
     'no subió EXACTAMENTE uno del número de viajes: ' + JSON.stringify(masViajes));
  // Y el control por archivo: NINGÚN otro archivo cambió su cuenta.
  const otros = archivos.filter((f) => f !== 'index.html');
  const otrosIguales = otros.every((f) => JSON.stringify(cB[f] || {}) === JSON.stringify(cH[f] || {}));
  console.log('    otros ' + otros.length + ' archivos con wa.me: ' + (otrosIguales ? 'IDÉNTICOS' : 'ALGUNO CAMBIÓ'));
  af(otrosIguales,
     '🔴 algún otro archivo cambió sus números: ' + JSON.stringify(otros.filter((f) => JSON.stringify(cB[f] || {}) !== JSON.stringify(cH[f] || {}))));

  // ══ [2] EL BOTÓN RENDERIZADO ═══════════════════════════════════════════
  console.log('\n[2] el botón renderizado, a ≤15 días del evento');
  const sb = servidor(b.dir), sh = servidor(h.dir);
  await new Promise((ok) => sb.listen(0, ok));
  await new Promise((ok) => sh.listen(0, ok));
  const idxHeadCrudo = fs.readFileSync(path.join(h.dir, 'index.html'), 'utf8');
  const nav = await chromium.launch();
  const errores = [];
  const mirar = async (base) => {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.addInitScript(CONGELAR, HOY);
    p.on('pageerror', (e) => errores.push(String(e.message)));
    await p.goto(base + '/' + EV_CERCA, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(800);
    await p.evaluate(() => { if (typeof skipOnboarding === 'function') skipOnboarding(); });
    const clic = async (sel) => {
      const l = p.locator(sel).first();
      await l.waitFor({ state: 'visible', timeout: 8000 });
      await l.click();
      await p.waitForTimeout(280);
    };
    await clic('#w-viajeros-card .wiz-btn');
    await clic('#w-pkg-card button');
    await clic('#w-zona-card button:not(#w-mapa-btn)');
    const hay = await p.locator('#w-hotel-card button').first().isVisible().catch(() => false);
    if (hay) await clic('#w-hotel-card button');
    await p.waitForTimeout(250);
    const out = await p.evaluate(() => {
      const dias = (typeof _diasEventoMx === 'function' && cur) ? _diasEventoMx(cur.ds) : null;
      const btns = [...document.querySelectorAll('#d-transport .z-btn')].map((x) => {
        const oc = x.getAttribute('onclick') || '';
        const num = (oc.match(/wa\.me\/(\d+)/) || [])[1] || null;
        return { modo: x.getAttribute('data-t'), num, wa: /wa\.me/.test(oc),
                 msg: decodeURIComponent((oc.match(/text=([^']*)/) || [])[1] || '').slice(0, 60) };
      });
      const vuelo = document.getElementById('r-vuelo');
      return { dias, btns, vuelo: vuelo ? ((vuelo.href.match(/wa\.me\/(\d+)/) || [])[1] || null) : null };
    });
    await ctx.close();
    return out;
  };
  try {
    const H = await mirar('http://127.0.0.1:' + sh.address().port);
    const B = await mirar('http://127.0.0.1:' + sb.address().port);
    console.log('    días al evento (premisa ≤15): ' + H.dias);
    af(H.dias != null && H.dias <= 15 && H.dias >= 0,
       'la premisa no se sostiene: ' + EV_CERCA + ' está a ' + H.dias + ' días y el caso pide 15 o menos');
    H.btns.forEach((x) => console.log('    HEAD · ' + String(x.modo).padEnd(6) + ' → ' + x.num + '  «' + x.msg + '»'));
    B.btns.forEach((x) => console.log('    BASE · ' + String(x.modo).padEnd(6) + ' → ' + x.num));
    const hb = H.btns.find((x) => x.modo === 'bus'), ha = H.btns.find((x) => x.modo === 'avion');
    const bb = B.btns.find((x) => x.modo === 'bus');
    // 🔴 EL CAMBIO, en el botón que el cliente aprieta.
    af(hb && hb.num === VIAJES,
       '🔴 el botón del autobús manda al ' + (hb && hb.num) + ' y la regla firmada dice ' + VIAJES);
    af(hb && /cotizar autob[uú]s/i.test(hb.msg), 'el mensaje del bus dejó de decir que quiere cotizar autobús: ' + JSON.stringify(hb && hb.msg));
    // Y su hermano, que ya estaba bien: los dos cotizan por el mismo número.
    af(ha && ha.num === VIAJES, 'el botón del avión manda al ' + (ha && ha.num) + ' y debía seguir en ' + VIAJES);
    // CONTROL POSITIVO: en BASE mandaba al de reservas. Sin esto, el verde de
    // arriba no distingue «lo cambié» de «ya estaba».
    af(bb && bb.num === RESERVAS,
       'la premisa del ANTES no se sostiene: en BASE el bus ya mandaba al ' + (bb && bb.num));
    af(bb.num !== hb.num, 'BASE y HEAD mandan al MISMO número: no se cambió nada');
    // Y el botón de cotizar vuelo del resultado, que también es «cotizar».
    // ⚠️ El botón «¿Quieres cotizar tu vuelo?» NO se pinta en este camino (el
    // bus se fue a WhatsApp, así que no hay cotización armada), y una
    // aserción que pasa con `null` es una aserción que pasa en VACÍO. Se mide
    // donde SÍ se puede afirmar: el número con el que se construye su href,
    // leído del fuente sin comentarios.
    console.log('    HEAD · botón «cotizar tu vuelo» en el DOM → ' + H.vuelo + ' (no aplica en este camino)');
    const sinCom = idxHeadCrudo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const hrefVuelo = (sinCom.match(/vueloBtn\.href\s*=\s*'https:\/\/wa\.me\/(\d+)/) || [])[1];
    console.log('    HEAD · su href se arma con → ' + hrefVuelo);
    af(hrefVuelo === VIAJES,
       'el botón de cotizar vuelo se arma con el ' + hrefVuelo + ' y cotizar va al ' + VIAJES);
    af(errores.length === 0, 'la página tiró ' + errores.length + ' error(es) de JS: ' + errores.slice(0, 3).join(' · '));
  } finally {
    await nav.close(); sb.close(); sh.close();
  }

  // ══ [3] LOS QUE NO SE TOCAN, por su contexto ═══════════════════════════
  // 🔒 LA FRONTERA ENTRE «COTIZAR» Y «RESERVAR» ES PALABRA DE MEMO, no un
  // grep. Así que esto NO decide: comprueba que los sitios cuyo contexto dice
  // RESERVAR/APARTAR/INFORMES siguen en el número de reservas, y deja el
  // dudoso nombrado para que él lo lea.
  console.log('\n[3] los de reservas siguen en su número');
  const idxH = fs.readFileSync(path.join(h.dir, 'index.html'), 'utf8');
  const debenSerReservas = [
    ['la constante WA del sitio',        /var WA='528119771072'/],
    ['«Me dan informes?» del catálogo',  /Me dan informes\?/],
    ['«Escríbenos por WhatsApp»',        /wa\.me\/528119771072[^]*?Escr[ií]benos por WhatsApp/s],
  ];
  for (const [etq, re] of debenSerReservas) {
    af(re.test(idxH), 'se movió ' + etq + ': ese camino es RESERVAS y no debía tocarse');
  }
  // El de «apartar mi lugar» del giveaway y los pies de «¡Reserva ya!».
  for (const f of ['giveaway.html', 'sorteo.html', 'faq.html', 'funciona.html', 'pagos.html', 'kit.html', 'portal.html', 'rol.html']) {
    const sB = fs.readFileSync(path.join(b.dir, f), 'utf8');
    const sH = fs.readFileSync(path.join(h.dir, f), 'utf8');
    const nB = (sB.match(/wa\.me\/\d{10,}/g) || []).join(',');
    const nH = (sH.match(/wa\.me\/\d{10,}/g) || []).join(',');
    af(nB === nH, f + ' cambió sus números de WhatsApp y no debía: ' + nB + ' → ' + nH);
  }
  // ✅ EL DUDOSO DEJÓ DE SER DUDOSO — **decisión firmada de Memo, 23-sep-2026**
  // (RADIO-ETIQ-1). El careo lo dejó clavado preguntando y la respuesta fue:
  // el número se QUEDA en reservas y lo que cambia es la ETIQUETA, que decía
  // «Cotizar por WhatsApp» y ahora dice «Cotiza tu evento». Así el botón deja
  // de prometer una cotización de transporte —que no es lo que ese mensaje
  // pide— y el destino coincide con lo que de verdad hace: pedir informes.
  //
  // 🔒 Y SE VIGILAN LAS DOS MITADES, no solo el número: la contradicción que
  // este renglón cazaba era entre la etiqueta y el destino, así que medir solo
  // uno de los dos la dejaría volver por el otro lado.
  const radioH = fs.readFileSync(path.join(h.dir, 'radio/index.html'), 'utf8');
  const radioNum = (radioH.match(/wa\.me\/(\d{10,})/) || [])[1];
  const radioEtq = (radioH.match(/class="btn btnWA"[^>]*>([^<]+)</) || [])[1] || '';
  console.log('    ✅ radio/index.html → ' + radioNum + '  etiqueta: «' + radioEtq.trim() + '»');
  af(radioNum === RESERVAS,
     'la radio cambió de número: por decisión firmada de Memo (23-sep) se QUEDA en reservas — lo que se '
     + 'movió fue la etiqueta, no el destino');
  af(/Cotiza tu evento/.test(radioEtq),
     'la etiqueta de la radio ya no dice «Cotiza tu evento» sino «' + radioEtq.trim() + '»: si vuelve a '
     + 'prometer una cotización, vuelve la contradicción con su mensaje de «info de los tours»');
  af(/info%20de%20los%20tours|info de los tours/.test(radioH),
     'el mensaje de la radio cambió: la decisión firmada era tocar SOLO la etiqueta');
  // Y los `wa.me/52`+dígitos variables NO son nuestros números: abren el chat
  // del CLIENTE. Se comprueba que siguen siendo plantilla, no un literal.
  const sorteoH = fs.readFileSync(path.join(h.dir, 'sorteo.html'), 'utf8');
  af(/wa\.me\/52' \+ digs/.test(sorteoH),
     'el WhatsApp del ganador dejó de armarse con su teléfono: eso abre el chat del CLIENTE, no el nuestro');

  completo = true;
  marcador();
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); marcador(); process.exit(1); });
