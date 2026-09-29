#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-itin-nobus-1.js — ITIN-NOBUS-1 · la plantilla CDMX no le miente al noBus
//
// Reporte de Memo (28-sep-2026): la ficha de Vaivén pintaba el itinerario de
// plantilla CDMX —reunión en la Central de Autobuses, «Viaje en bus»— cuando
// su propia nota dice «NO incluye transporte a CDMX. Llega por tu cuenta».
// El card contradecía a la nota DEL MISMO EVENTO.
//
// La forma es el precedente de CARD-ITIN-1: antes que un letrero que miente,
// ninguno. `noBus` + CDMX → tercer estado (sin plantilla) hasta que la ficha
// traiga itinerario propio, que gana arriba y reabre el card.
//
// 🔒 LOS DOS LADOS SON COMMITS, SERVIDOS, y se entra POR LA URL DEL EVENTO
//    (el deep-link que se comparte) en 390×844 — la ley del parseo de
//    CARD-ITIN-1: lo que se ve por clic y no por URL es otro defecto.
// 🔒 El control positivo es BASE: su modal de vaiven DICE «Central de
//    Autobuses». Y el control en el otro sentido: un CDMX normal y un MTY
//    pintan su plantilla BYTE A BYTE igual que BASE; el propio, intacto.
//
// Se corre:  npm run mide:itin-nobus-1
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const http = require('http');
const { chromium } = require('playwright');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0, completo = false;
const fallos = [];
function af(c, e) {
  let v = false;
  try { v = (typeof c === 'function') ? !!c() : !!c; }
  catch (x) { v = false; e = e + '  [EXCEPCIÓN: ' + x.message + ']'; }
  if (v) ok++; else { mal++; fallos.push(e); console.log('   ✗ ' + e); }
}
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  console.log((mal ? '❌ ROJO · ' : '✅ VERDE · ') + ok + ' en verde, ' + mal + ' en rojo');
  fallos.slice(0, 16).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' index.html imgs.js mapas.js lineups.js | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || 'ee4c0ef';       // el merge de NUM-MULTIFECHA-1
const HEAD_SHA = process.env.HEAD_SHA || 'HEAD';

// Sirve el árbol; una ruta que no es archivo cae al index — así el deep-link
// `/vaiven` entra POR DONDE ENTRA EL CLIENTE.
function servir(dir) {
  const srv = http.createServer((req, res) => {
    let f = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(404); return res.end('no'); }
      res.writeHead(200, { 'Content-Type': /\.js$/.test(f) ? 'text/javascript' : 'text/html; charset=utf-8' });
      res.end(b);
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, puerto: srv.address().port })));
}

// Abre la ficha de un evento por su URL y contesta lo que el cliente VE:
// si el card del itinerario se pinta y, cuando se pinta, el TEXTO del modal.
async function leerItinerario(nav, puerto, slug) {
  const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
  // Los endpoints de red (disponibilidad, nube, funciones) no existen en el
  // arnés: se contestan vacíos para que el fail-soft del sitio siga su curso.
  await page.route('**/.netlify/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.route(/googletagmanager|google-analytics|deezer|dzcdn/, (r) => r.fulfill({ status: 200, body: '' }));
  await page.goto('http://127.0.0.1:' + puerto + '/' + slug, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const card = document.getElementById('d-itin-card');
    const visible = !!card && getComputedStyle(card).display !== 'none';
    let texto = null;
    try {
      // El texto por el MISMO camino que el clic del cliente: abrirItinerario.
      if (visible) { abrirItinerario(); texto = document.getElementById('itin-modal-desc').textContent; }
    } catch (e) { texto = 'ERROR:' + e.message; }
    const ev = (typeof cur !== 'undefined' && cur) ? { id: cur.id, noBus: !!cur.noBus, cdmx: !!cur.cdmx, v: cur.v } : null;
    return { visible, texto, ev };
  });
  await page.close();
  return r;
}

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'in-base'), h = sacar(HEAD_SHA, 'in-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }
  const sb = await servir(b.dir), sh = await servir(h.dir);
  const nav = await chromium.launch();

  // ── [0] LA PREMISA, AFIRMADA EN LO SERVIDO ──────────────────────────────
  console.log('[0] la premisa: vaiven es CDMX + noBus en el árbol servido');
  const vB = await leerItinerario(nav, sb.puerto, 'vaiven');
  const vH = await leerItinerario(nav, sh.puerto, 'vaiven');
  af(vB.ev && vB.ev.id === 'vaiven' && vB.ev.noBus && vB.ev.cdmx, 'BASE sirvió a vaiven con noBus+cdmx: ' + JSON.stringify(vB.ev));
  af(vH.ev && vH.ev.noBus && vH.ev.cdmx, 'HEAD también (la ficha no se tocó)');

  // ── [1] EL DEFECTO EN BASE, LA CURA EN HEAD ─────────────────────────────
  console.log('[1] vaiven · el letrero que mentía');
  af(vB.visible && /Central de Autobuses/.test(vB.texto || ''),
     'BASE pintaba el card Y el modal decía «Central de Autobuses» — la mentira medida: ' + String(vB.texto).slice(0, 60));
  af(/Viaje en bus/.test(vB.texto || ''), 'y ofrecía el «Viaje en bus» que el evento no vende');
  af(!vH.visible, 'HEAD: el card NO se pinta (tercer estado, como los venues sin plantilla)');
  af(vH.texto === null, 'y no hay modal que abrir');

  // ── [2] EL OTRO SENTIDO: el CDMX normal NO pierde su plantilla ──────────
  console.log('[2] knotfest (CDMX con bus) · byte a byte');
  const kB = await leerItinerario(nav, sb.puerto, 'knotfest');
  const kH = await leerItinerario(nav, sh.puerto, 'knotfest');
  af(kB.ev && !kB.ev.noBus && kB.visible, 'la premisa: knotfest es CDMX sin noBus y BASE lo pinta');
  af(kH.visible && kH.texto === kB.texto,
     'HEAD pinta EXACTAMENTE el mismo itinerario que BASE (byte a byte)');
  af(/Central de Autobuses/.test(kH.texto || '') && /avi/i.test(kH.texto || ''),
     'con sus DOS variantes vivas (bus y avión)');

  // ── [3] MTY y PROPIO, intactos ──────────────────────────────────────────
  console.log('[3] emmanuel (MTY) y pulsoquetaro (propio)');
  const mB = await leerItinerario(nav, sb.puerto, 'emmanuel');
  const mH = await leerItinerario(nav, sh.puerto, 'emmanuel');
  af(mB.visible && mH.visible && mH.texto === mB.texto, 'el MTY pinta su plantilla idéntica');
  const pB = await leerItinerario(nav, sb.puerto, 'pulsoquetaro');
  const pH = await leerItinerario(nav, sh.puerto, 'pulsoquetaro');
  af(pB.visible && pH.visible && pH.texto === pB.texto && /9 DE OCTUBRE/.test(pH.texto || ''),
     'el itinerario PROPIO sigue intacto — y el día que vaiven tenga el suyo, gana por esta misma rama');

  // ── [4] LA COBERTURA, derivada y con nombres ────────────────────────────
  console.log('[4] cuántos eventos cambia esto (derivado del catálogo servido)');
  {
    const page = await nav.newPage();
    await page.route('**/.netlify/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await page.goto('http://127.0.0.1:' + sh.puerto + '/', { waitUntil: 'domcontentloaded' });
    const lista = await page.evaluate(() => EV.filter((e) => itinEsCdmx(e) && e.noBus && !(typeof e.itinerario === 'string' && e.itinerario.trim())).map((e) => e.id));
    await page.close();
    console.log('    noBus de CDMX sin itinerario propio: ' + lista.join(', '));
    af(lista.includes('vaiven'), 'vaiven está en la lista');
    af(lista.length >= 1 && lista.length <= 6, 'la clase es chica y nombrada (' + lista.length + '): un cambio que apagara media portada se vería aquí');
  }

  await nav.close(); sb.srv.close(); sh.srv.close();
  completo = true;
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN DEL ARNÉS: ' + e.stack); process.exit(1); });
