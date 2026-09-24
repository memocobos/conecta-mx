#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-nube-5.js — NUBE-5 · el card «Cómo llegar» de cada evento de CDMX
//
// 🔒 LOS DOS LADOS SON COMMITS y los dos SE SIRVEN.
//     BASE = NUBE-4 (el dato por evento, sin card)
//     HEAD = NUBE-5 (el card)
//
// 🔒 SE ENTRA POR LA URL DEL CLIENTE (`/<slug>`) en 390×844 — que es la url que
// se comparte y la que corre DURANTE EL PARSEO. Si el pintor hubiera nacido en
// un `var` de nivel superior, el card se vería por clic y NO por la url: el
// mismo evento con dos caras según la puerta, el bug de `ITIN_MTY`.
//
// 🔒 EL ENDPOINT LO SIRVE EL CAREO, por evento, así que se pueden sembrar los
// casos que la base real no tiene hoy (la tabla está VACÍA): propio, heredado,
// vencido, caído, y el par de eventos que destapó el estado global.
//
// Se corre:  npm run mide:nube-5
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
const BASE = process.env.BASE || '427c0dc';   // el merge de NUBE-4 (#770): el dato por evento, sin card
const HEAD_SHA = process.env.HEAD_SHA || 'ae16450';   // el commit del MERGE (#771)

// ── LO QUE EL ENDPOINT CONTESTA, POR EVENTO ─────────────────────────────
// `edc27` tiene bus PROPIO con horarios · `knotfest` HEREDA la general ·
// `brunomars` tiene el bus VENCIDO (el caso del CDN) · `dimitri` no tiene nada.
const lejano = new Date(Date.now() + 6 * 864e5).toISOString();
const vencido = new Date(Date.now() - 3600e3).toISOString();
const RESPUESTA = {
  edc27: { ok: true, bus: { precio: 2100, vigente_hasta: lejano, horarios: 'Turistar directo · sale 6 am, regresa 11 pm', heredado: false },
           avion: { precio: 5200, vigente_hasta: lejano, horarios: 'Volaris · 7:10 am / 9:40 pm', heredado: false } },
  knotfest: { ok: true, bus: { precio: 2500, vigente_hasta: lejano, horarios: 'Turistar · sale 9 pm', heredado: true }, avion: null },
  brunomars: { ok: true, bus: { precio: 9999, vigente_hasta: vencido, horarios: 'NO DEBE PINTARSE', heredado: false }, avion: null },
  dimitri: { ok: true, bus: null, avion: null },
  _caido: { ok: false, bus: null, avion: null },
};
let PEDIDOS = [];

function servidor(raiz) {
  return http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (/nube-vigente/.test(u)) {
      const m = /[?&]evento=([^&]+)/.exec(q.url);
      const ev = m ? decodeURIComponent(m[1]) : '';
      PEDIDOS.push(ev);
      const d = RESPUESTA[ev] || { ok: true, bus: null, avion: null };
      r.writeHead(200, { 'Content-Type': 'application/json' });
      return r.end(JSON.stringify(d));
    }
    if (/\.netlify\/functions\//.test(u)) {
      q.on('data', () => {});
      return q.on('end', () => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{"ok":true}'); });
    }
    const rel = decodeURIComponent(u).replace(/^\//, '');
    const f = path.join(raiz, rel || 'index.html');
    fs.readFile(f, (e, b) => {
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
// El onboarding tapa la pantalla y se abre 300 ms después. Se cierra COMO LO
// CIERRA EL CLIENTE y se espera por CONDICIÓN, no por reloj — la condición de
// merge que Jane puso en la #769.
const _tapa = () => {
  const e = document.getElementById('onboard-bg');
  if (!e) return false;
  const cs = getComputedStyle(e), r = e.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && r.height > 0;
};
async function cerrarOnboarding(pg) {
  const salio = await pg.waitForFunction(_tapa, { timeout: 2500 }).then(() => true).catch(() => false);
  if (salio) await pg.evaluate(() => { if (typeof skipOnboarding === 'function') skipOnboarding(); });
  await pg.waitForFunction(`!(${_tapa.toString()})()`, { timeout: 10000 });
  return salio;
}
// «EXISTE» NO ES «SE VE»: la cadena completa, no el DOM.
const LEER_CARD = `(() => {
  const c = document.getElementById('d-nube-card');
  if (!c) return { hay: false };
  const cs = getComputedStyle(c), r = c.getBoundingClientRect();
  return {
    hay: true,
    ve: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && !!c.offsetParent && r.height > 0,
    txt: c.innerText.trim(),
    html: (document.getElementById('d-nube-cuerpo') || {}).innerHTML || '',
    ev: document.body.getAttribute('data-ev'),
  };
})()`;

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'n5-base'), h = sacar(HEAD_SHA, 'n5-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }
  const sb = servidor(b.dir), sh = servidor(h.dir);
  await new Promise((r) => sb.listen(0, r)); await new Promise((r) => sh.listen(0, r));
  const uB = 'http://127.0.0.1:' + sb.address().port, uH = 'http://127.0.0.1:' + sh.address().port;
  const nav = await chromium.launch();

  // Abre un evento POR LA URL DEL CLIENTE y lee su card.
  async function abrir(url, slug, opts) {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(url + '/' + slug, { waitUntil: 'domcontentloaded' });
    await cerrarOnboarding(pg);
    // Se espera a que la respuesta caiga (el card se repinta en el `then`).
    await pg.waitForFunction("document.getElementById('d-nube-card') && document.getElementById('d-nube-card').getAttribute('data-listo') !== null || true", { timeout: 1000 }).catch(() => {});
    await pg.waitForTimeout(600);
    const d = await pg.evaluate(LEER_CARD);
    if (opts && opts.dejarAbierto) return { d, errs, pg, ctx };
    await ctx.close();
    return { d, errs };
  }

  // ── [I] EL INSTRUMENTO ────────────────────────────────────────────────
  console.log('[I] el instrumento');
  PEDIDOS = [];
  const iE = await abrir(uH, 'edc27');
  af(iE.errs.length === 0, 'la página de HEAD tiró errores por la url de edc27: ' + JSON.stringify(iE.errs).slice(0, 250));
  af(iE.d.ev === 'edc27', 'la url `/edc27` no abrió su ficha: ' + iE.d.ev);
  // 🔒 EL ENDPOINT SE PIDE **CON EL EVENTO**. Sin esto, todo lo de abajo podría
  // estar midiendo la cotización general pintada en la ficha de cualquiera.
  console.log('    pedidos al endpoint: ' + JSON.stringify(PEDIDOS));
  af(PEDIDOS.length >= 1 && PEDIDOS[0] === 'edc27',
     'el index pidió la cotización SIN el evento (' + JSON.stringify(PEDIDOS) + '): entonces el precio que '
     + 'pinta no es el de este evento, y la herencia la estaría resolviendo la suerte');

  // ── [C] EL CARD, con precio y HORARIOS ────────────────────────────────
  console.log('\n[C] el card de edc27 (cotización PROPIA)');
  console.log('    ' + JSON.stringify(iE.d.txt).slice(0, 220));
  af(iE.d.hay && iE.d.ve, '«existe» no es «se ve»: el card no pasa su cadena de visibilidad. ' + JSON.stringify(iE.d));
  af(/C[óo]mo llegar/i.test(iE.d.txt), 'el card no lleva su título «Cómo llegar»: ' + iE.d.txt.slice(0, 120));
  af(/\$2,100/.test(iE.d.txt), 'el card no pinta el precio PROPIO del bus ($2,100): ' + iE.d.txt.slice(0, 200));
  af(/\$5,200/.test(iE.d.txt), 'el card no pinta el precio del avión ($5,200): ' + iE.d.txt.slice(0, 200));
  af(/Turistar directo/.test(iE.d.txt) && /Volaris/.test(iE.d.txt),
     'los HORARIOS capturados no se pintan, y son el dato que el cliente necesita: ' + iE.d.txt.slice(0, 250));
  // Una cotización PROPIA no puede rotularse «general».
  af(!/general/i.test(iE.d.txt),
     'la cotización PROPIA de edc27 salió rotulada como general: un precio negociado para su fecha '
     + 'presentado como la tarifa de todos. ' + iE.d.txt.slice(0, 200));

  // ── [H] LA HERENCIA, ROTULADA ─────────────────────────────────────────
  console.log('\n[H] knotfest (HEREDA la general)');
  const iK = await abrir(uH, 'knotfest');
  console.log('    ' + JSON.stringify(iK.d.txt).slice(0, 220));
  af(iK.d.ve && /\$2,500/.test(iK.d.txt), 'knotfest no pinta el precio heredado ($2,500): ' + iK.d.txt.slice(0, 200));
  af(/general/i.test(iK.d.txt),
     '🔒 la herencia NO se rotula: un precio general presentado como el de este evento es un dato bueno con '
     + 'la etiqueta equivocada — la lección de ROL-HIST-PADRE. ' + iK.d.txt.slice(0, 200));
  // Su avión no tiene precio → el WhatsApp de cotización, no un precio inventado.
  af(/cotiza/i.test(iK.d.txt) && /8132321405/.test(iK.d.html),
     'el modo sin precio no ofrece el WhatsApp de cotización (8132321405): ' + iK.d.html.slice(0, 250));
  af(!/\$0|NaN|undefined/.test(iK.d.txt), 'el modo sin precio pintó un número inventado: ' + iK.d.txt.slice(0, 200));

  // ── [V] LA VIGENCIA SE RE-VERIFICA DONDE SE PINTA ─────────────────────
  // 🔴 El endpoint ya filtra lo vencido, pero su respuesta va por CDN con
  // `stale-while-revalidate=3600`: puede llegar HASTA UNA HORA VIEJA. Aquí el
  // careo manda a propósito una cotización vencida y exige que NO se pinte.
  console.log('\n[V] la cotización VENCIDA que el CDN podría servir');
  const iB = await abrir(uH, 'brunomars');
  console.log('    ' + JSON.stringify(iB.d.txt).slice(0, 200));
  af(!/\$9,999/.test(iB.d.txt),
     '🔴 SE PINTÓ UNA COTIZACIÓN VENCIDA. El endpoint filtra en la fuente, pero el CDN puede servir una '
     + 'respuesta de hasta una hora: quien pinta el precio es el último que puede comprobarlo, así que lo '
     + 'comprueba. ' + iB.d.txt.slice(0, 200));
  af(!/NO DEBE PINTARSE/.test(iB.d.html), 'se pintaron los horarios de una cotización vencida: ' + iB.d.html.slice(0, 200));

  // ── [N] SIN NINGÚN PRECIO, NO HAY CARD ────────────────────────────────
  console.log('\n[N] dimitri (sin precio en ningún modo)');
  const iD = await abrir(uH, 'dimitri');
  console.log('    card visible: ' + iD.d.ve + '   texto: ' + JSON.stringify(iD.d.txt).slice(0, 80));
  af(iD.d.hay && !iD.d.ve,
     'sin precio en ningún modo el card tiene que ESCONDERSE: una caja que repite lo que el botón de '
     + 'WhatsApp ya dice es ruido. ' + JSON.stringify(iD.d));
  // Y en un evento que NO es de CDMX el card no aparece jamás.
  const iM = await abrir(uH, 'frontera');
  console.log('    un evento de MONTERREY → card visible: ' + iM.d.ve);
  af(iM.d.hay && !iM.d.ve,
     'el card salió en un evento que no es de CDMX: la nube es el transporte A CDMX, y ahí ese card '
     + 'mentiría. ' + JSON.stringify(iM.d));

  // ── [P] EL PAR QUE DESTAPÓ EL ESTADO GLOBAL ───────────────────────────
  // 🔴 En la MISMA visita: se abre edc27 ($2,100 propio) y luego knotfest. Con
  // el cajón global de NUBE-2, el segundo habría pintado el precio del primero.
  console.log('\n[P] dos eventos en la MISMA visita');
  const ctxP = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pgP = await ctxP.newPage();
  const errP = []; pgP.on('pageerror', (e) => errP.push(e.message));
  await pgP.goto(uH + '/edc27', { waitUntil: 'domcontentloaded' });
  await cerrarOnboarding(pgP);
  await pgP.waitForTimeout(600);
  const p1 = await pgP.evaluate(LEER_CARD);
  await pgP.evaluate("showDetail('knotfest')");
  await cerrarOnboarding(pgP);
  await pgP.waitForTimeout(700);
  const p2 = await pgP.evaluate(LEER_CARD);
  console.log('    1º edc27    → ' + (p1.txt.match(/\$[\d,]+/g) || []).join(' '));
  console.log('    2º knotfest → ' + (p2.txt.match(/\$[\d,]+/g) || []).join(' '));
  af(p1.ev === 'edc27' && p2.ev === 'knotfest', 'la premisa falla: no se llegó a los dos eventos (' + p1.ev + ' → ' + p2.ev + ')');
  af(/\$2,500/.test(p2.txt) && !/\$2,100/.test(p2.txt),
     '🔴 knotfest heredó EL PRECIO DE edc27 en la misma visita ($2,100). Es el bug de `cheapBtn` y de '
     + '`rideBtn` —los globales que la pantalla reusa— ahora con un PRECIO: un letrero mal heredado se ve, '
     + 'un precio de otro evento se paga. ' + p2.txt.slice(0, 200));
  af(/general/i.test(p2.txt), 'el segundo evento perdió su rótulo de herencia al reusar la pantalla');
  af(errP.length === 0, 'la visita de dos eventos tiró errores: ' + JSON.stringify(errP).slice(0, 200));
  await ctxP.close();

  // ── [Q] EL COTIZADOR NO SE TOCA ───────────────────────────────────────
  // La orden dice que la venta sigue por el MISMO `selTransporteBtn` y su total
  // por la misma multiplicación. Se carea el CUERPO byte a byte, cortando por
  // BALANCE DE LLAVES (cortar en «la siguiente declaración» es frágil).
  console.log('\n[Q] el cotizador, byte a byte');
  const htmlB = fs.readFileSync(path.join(b.dir, 'index.html'), 'utf8');
  const htmlH = fs.readFileSync(path.join(h.dir, 'index.html'), 'utf8');
  function cuerpo(html, firma) {
    const i = html.indexOf(firma);
    if (i < 0) return null;
    let j = html.indexOf('{', i), prof = 0, k = j;
    for (;; k++) { if (html[k] === '{') prof++; else if (html[k] === '}') prof--; if (prof === 0) break; }
    return html.slice(i, k + 1);
  }
  for (const firma of ['function calcular(', 'function selTransporteBtn(']) {
    const cb = cuerpo(htmlB, firma), ch = cuerpo(htmlH, firma);
    af(cb && ch && cb === ch,
       'el cuerpo de `' + firma + '…` cambió y no debía: la venta vive donde vivía y este card solo '
       + 'INFORMA. ' + (cb ? cb.length : 'null') + ' vs ' + (ch ? ch.length : 'null') + ' bytes');
    console.log('    ' + firma.padEnd(28) + (cb && ch && cb === ch ? 'idéntico (' + cb.length + ' bytes)' : '❌ CAMBIÓ'));
  }
  // Y el paso del transporte sigue vendiendo el precio DEL EVENTO.
  const ctxV = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pgV = await ctxV.newPage();
  await pgV.goto(uH + '/edc27', { waitUntil: 'domcontentloaded' });
  await cerrarOnboarding(pgV);
  await pgV.waitForTimeout(500);
  const venta = await pgV.evaluate(`(() => ({
    bus: typeof nubeDe === 'function' ? nubeDe('bus', cur) : 'sin funcion',
    global: typeof nubeEstado === 'function' ? Object.keys(window.__nube || {}) : null,
  }))()`);
  await ctxV.close();
  console.log('    nubeDe(bus, edc27) → ' + JSON.stringify(venta.bus) + '   llaves del estado: ' + JSON.stringify(venta.global));
  af(venta.bus && Number(venta.bus.precio) === 2100,
     'el cotizador no resuelve el precio DEL EVENTO por el dueño: ' + JSON.stringify(venta.bus));
  af(Array.isArray(venta.global) && venta.global.indexOf('edc27') >= 0,
     'el estado no está llaveado por evento: ' + JSON.stringify(venta.global));

  // ── [H2] LA LEY DEL HOISTING · la url y el clic ───────────────────────
  console.log('\n[H2] la url y el clic, el mismo card');
  const ctxH = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pgH2 = await ctxH.newPage();
  await pgH2.goto(uH + '/', { waitUntil: 'domcontentloaded' });
  await pgH2.evaluate("showDetail('edc27')");
  await cerrarOnboarding(pgH2);
  await pgH2.waitForTimeout(700);
  const porClic = await pgH2.evaluate(LEER_CARD);
  await ctxH.close();
  console.log('    por la url ' + (iE.d.txt.match(/\$[\d,]+/g) || []).join(' ')
    + '   ·   por el clic ' + (porClic.txt.match(/\$[\d,]+/g) || []).join(' '));
  af(porClic.ve === iE.d.ve && (porClic.txt.match(/\$[\d,]+/g) || []).join(' ') === (iE.d.txt.match(/\$[\d,]+/g) || []).join(' '),
     'el card sale distinto por la url que por el clic: sospecha del ORDEN DE PARSEO antes que del CSS — un '
     + '`var` de nivel superior leído por código que está arriba vale `undefined`, y el deep-link corre a '
     + 'media parseada');

  // ── [B] CONTROL POSITIVO · BASE no tiene card ─────────────────────────
  console.log('\n[B] control positivo · BASE');
  const bE = await abrir(uB, 'edc27');
  console.log('    BASE card → hay:' + bE.d.hay + ' ve:' + bE.d.ve);
  af(!bE.d.hay,
     'BASE ya tenía el card «Cómo llegar»: entonces esta tuerca no lo agrega y el verde de arriba no '
     + 'prueba nada');
  af(bE.errs.length === 0, 'la página de BASE tiró errores: ' + JSON.stringify(bE.errs).slice(0, 200));
  af(!/d-nube-card/.test(htmlB) && /d-nube-card/.test(htmlH), 'el markup del card no nació en esta tuerca');
  // Y BASE pedía la cotización SIN el evento: el defecto que NUBE-5 cierra.
  PEDIDOS = [];
  await abrir(uB, 'edc27');
  console.log('    BASE pidió: ' + JSON.stringify(PEDIDOS));
  af(PEDIDOS.length >= 1 && PEDIDOS[0] === '',
     'BASE tenía que pedir la cotización SIN evento (la general): si ya la pedía por evento, el estado por '
     + 'evento de esta tuerca no arregla nada. Pidió ' + JSON.stringify(PEDIDOS));

  // ── [R] EL RENGLÓN DEL RADAR · la cobertura ───────────────────────────
  // Se mide sobre la FUENTE del Radar (es una pantalla con rol, y su handler ya
  // se mide en `mide:nube-4`): que pida la cuenta, que se CALLE cuando no hay
  // nada que decir, y que diga NOMBRES y no solo un número.
  console.log('\n[R] el renglón del Radar');
  const radB = fs.readFileSync(path.join(b.dir, 'kamehouse-radar.js'), 'utf8');
  const radH = fs.readFileSync(path.join(h.dir, 'kamehouse-radar.js'), 'utf8');
  af(!/cobertura/.test(radB) && /'cobertura'/.test(radH), 'el Radar no aprendió a pedir la cobertura');
  af(/descubiertos/.test(radH) && /!flojos\.length && !descubiertos\.length/.test(radH),
     '🔒 el aviso tiene que CALLARSE cuando no hay NADA que decir —ni modo vencido ni evento descubierto—: '
     + 'un aviso permanente se vuelve parte del mueble y deja de avisar');
  af(/\.map\(\(e\) => e\.id\)\.join\(', '\)/.test(radH) || /e\.id\)\.join/.test(radH),
     'el renglón dice un número pero no NOMBRES: «3 eventos» manda a buscar, «edc27, knotfest y flowfest» '
     + 'se resuelve');
  // ⚠️ LA COMILLA VA ESCAPADA EN LA FUENTE. El `onclick` se construye dentro de
  // una cadena JS, así que el archivo dice `showPage(\\'nube\\')`, con barra
  // invertida. Mi primera versión de esta aserción pedía la comilla limpia y se
  // puso ROJA sobre código correcto — el rojo del arnés suele ser mío. Se
  // acepta la comilla con o sin escapar, y se mide el HECHO en las dos puntas.
  const sinCom = radH.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  af(/showPage\(\\?'nube\\?'\)/.test(sinCom),
     'el «Ir a resolver» del Radar no apunta a `showPage(\'nube\')`: ' + (sinCom.match(/onclick[^"]*nube[^"]*/) || ['(no se encontró)'])[0]);
  af(!/showHerramienta\(\\?'nube\\?'\)/.test(sinCom),
     'el «Ir a resolver» del Radar sigue apuntando a la puerta vieja: la Nube se mudó al listado principal '
     + 'y por ahí la pantalla sale VACÍA');

  await nav.close(); sb.close(); sh.close();
  completo = true;
  process.exitCode = rojo ? 1 : 0;
})();
