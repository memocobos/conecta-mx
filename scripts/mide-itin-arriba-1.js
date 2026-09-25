#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-itin-arriba-1.js — ITIN-ARRIBA-1 · el itinerario, arriba del paso 1
//
// Orden de Memo (25-sep-2026): en la ficha del evento el card Itinerario queda
// ANTES del paso 1 «¿Cuántos viajeros?» — el cliente antoja el viaje primero y
// cotiza después. Políticas NO se toca: sigue al fondo del todo.
//
// 🔒 LOS DOS LADOS SON COMMITS y los dos SE SIRVEN. Commitear exige RE-ANCLAR.
//
// 🔒 SE ENTRA POR LA URL DEL CLIENTE (`/<slug>`), la ley de CARD-ITIN-1: el
// deep-link ejecuta A MEDIA PARSEADA, y un careo que llama a `showDetail()` a
// mano SALE VERDE sobre código roto — comprobado en esa serie.
//
// 🔒 «ARRIBA» SE MIDE EN PÍXELES, NO EN EL MARKUP. El orden del DOM se le
// pregunta al navegador (`compareDocumentPosition`) y el DÓNDE a las cajas
// reales: «el ALTO no es el DÓNDE» es la lección de #756, y aquí la promesa de
// Memo es exactamente una posición.
//
// Se corre:  npm run mide:itin-arriba-1
// ══════════════════════════════════════════════════════════════════════════
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');
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
const BASE = process.env.BASE || 'db7e2b2';   // la punta de callejon-cdmx-1, la PR de abajo
const HEAD_SHA = process.env.HEAD_SHA || 'HEAD';
// El overlay del onboarding se abre 300 ms después con z-index 9999. Se cierra
// COMO LO CIERRA EL CLIENTE y se espera POR CONDICIÓN — la condición de merge
// de la #769: un careo que depende del timing sale verde por suerte.
const _tapa = () => {
  const e = document.getElementById('onboard-bg');
  if (!e) return false;
  const cs = getComputedStyle(e), r = e.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && r.height > 0;
};
// La FOTO: orden del DOM según el NAVEGADOR, y el DÓNDE en píxeles de página.
const FOTO = `(() => {
  const g = (id) => document.getElementById(id);
  const caja = (id) => { const e = g(id); if (!e) return null;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    const ve = cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && !!e.offsetParent && r.height > 0;
    const cont = e.closest('.modal-overlay, #d-modal') || document.scrollingElement;
    return { ve, top: Math.round(r.top + (cont && cont.scrollTop ? cont.scrollTop : 0)), alto: Math.round(r.height) }; };
  const itin = g('d-itin-card'), viaj = g('w-viajeros-card'), pol = g('d-pol-card');
  // El ORDEN se lo contesta el navegador, no un indexOf sobre el archivo.
  const antesDe = (a, b) => (a && b) ? !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
  // Todos los cards de la ficha, EN ORDEN DE DOCUMENTO, con su id.
  const modal = g('d-modal') || document;
  const cards = [...modal.querySelectorAll('.card[id], .wiz-card[id]')].map((e) => e.id);
  const guia = [...modal.querySelectorAll('[data-guia]')].map((e) => e.getAttribute('data-guia'));
  return {
    itin: caja('d-itin-card'), viaj: caja('w-viajeros-card'), pol: caja('d-pol-card'),
    nube: caja('d-nube-card'),
    itinAntesDeViaj: antesDe(itin, viaj),
    polDespuesDeTodo: cards.length ? cards[cards.length - 1] === 'd-pol-card' : null,
    cards, guia,
    placeholder: (g('d-placeholder') || {}).textContent || '',
    ev: document.body.getAttribute('data-ev'),
  };
})()`;

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'ia-base'), h = sacar(HEAD_SHA, 'ia-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }
  const sb = servidor(b.dir), sh = servidor(h.dir);
  await new Promise((r) => sb.listen(0, r)); await new Promise((r) => sh.listen(0, r));
  const uB = 'http://127.0.0.1:' + sb.address().port, uH = 'http://127.0.0.1:' + sh.address().port;
  const nav = await chromium.launch();

  async function abrir(url, slug, ancho, opts) {
    const o = opts || {};
    const ctx = await nav.newContext({ viewport: { width: ancho, height: ancho === 390 ? 844 : 900 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(url + '/' + slug, { waitUntil: 'domcontentloaded' });
    const onb = await pg.waitForFunction(_tapa, { timeout: 2500 }).then(() => true).catch(() => false);
    if (onb) await pg.evaluate(() => { if (typeof skipOnboarding === 'function') skipOnboarding(); });
    await pg.waitForFunction(`!(${_tapa.toString()})()`, { timeout: 10000 });
    await pg.waitForTimeout(350);
    const d = await pg.evaluate(FOTO);
    if (o.dejar) return { d, errs, onb, pg, ctx };
    await ctx.close();
    return { d, errs, onb };
  }

  // ── [I] EL INSTRUMENTO, y la premisa de la puerta ─────────────────────
  console.log('[I] el instrumento');
  const H390 = await abrir(uH, 'frontera', 390);
  const B390 = await abrir(uB, 'frontera', 390);
  af(H390.d.ev === 'frontera' && B390.d.ev === 'frontera',
     'la url `/frontera` no abrió su ficha en los dos lados: ' + H390.d.ev + ' / ' + B390.d.ev);
  af(H390.errs.length === 0, 'HEAD tiró errores por la url: ' + JSON.stringify(H390.errs).slice(0, 250));
  af(B390.errs.length === 0, 'BASE tiró errores por la url: ' + JSON.stringify(B390.errs).slice(0, 250));
  af(H390.onb && B390.onb,
     'el onboarding ya no sale en algún lado: el careo dejaría de medir la pantalla tapada, que es la del '
     + 'cliente, y no se enteraría');
  af(B390.d.itin && B390.d.itin.ve,
     'PREMISA: en BASE el itinerario tenía que estar VISIBLE en este evento (tiene plantilla). Sin eso, '
     + 'la mudanza no se puede comparar. ' + JSON.stringify(B390.d.itin));

  // ── [O] EL ORDEN DEL DOM · se lo contesta el NAVEGADOR ────────────────
  console.log('\n[O] el orden en el documento');
  console.log('    BASE itin antes de viajeros: ' + B390.d.itinAntesDeViaj);
  console.log('    HEAD itin antes de viajeros: ' + H390.d.itinAntesDeViaj);
  af(B390.d.itinAntesDeViaj === false,
     'CONTROL POSITIVO: en BASE el itinerario tenía que venir DESPUÉS del paso 1. Si ya estaba arriba, '
     + 'esta tuerca no muda nada y su verde no dice nada');
  af(H390.d.itinAntesDeViaj === true,
     '🔴 el itinerario NO quedó antes del paso 1 en el documento: ' + JSON.stringify(H390.d.itinAntesDeViaj));

  // ── [V] «ARRIBA» EN PÍXELES, en móvil Y en escritorio ────────────────
  // 🔒 El ALTO no es el DÓNDE. Que el card «exista» y «se vea» no dice que esté
  // ARRIBA: se comparan las cajas REALES de los dos, en los dos anchos.
  console.log('\n[V] el DÓNDE, en píxeles');
  const H1350 = await abrir(uH, 'frontera', 1350);
  const B1350 = await abrir(uB, 'frontera', 1350);
  for (const [ancho, hh, bb] of [[390, H390, B390], [1350, H1350, B1350]]) {
    console.log('    ' + ancho + 'px  BASE itin@' + (bb.d.itin && bb.d.itin.top) + ' viaj@' + (bb.d.viaj && bb.d.viaj.top)
      + '   ·   HEAD itin@' + (hh.d.itin && hh.d.itin.top) + ' viaj@' + (hh.d.viaj && hh.d.viaj.top));
    af(hh.d.itin && hh.d.itin.ve && hh.d.viaj && hh.d.viaj.ve,
       '«existe» no es «se ve»: a ' + ancho + 'px alguno de los dos cards no pasa su cadena de visibilidad. '
       + JSON.stringify([hh.d.itin, hh.d.viaj]));
    af(hh.d.itin.top < hh.d.viaj.top,
       '🔴 a ' + ancho + 'px el itinerario NO queda ARRIBA del paso 1: itin@' + hh.d.itin.top
       + ' contra viajeros@' + hh.d.viaj.top + '. El markup puede estar bien y el CSS ponerlo abajo igual');
    af(bb.d.itin.top > bb.d.viaj.top,
       'CONTROL POSITIVO a ' + ancho + 'px: en BASE el itinerario tenía que caer DEBAJO del paso 1, y salió '
       + 'itin@' + bb.d.itin.top + ' viajeros@' + bb.d.viaj.top);
  }

  // ── [T] EL TERCER ESTADO · sin plantilla, el card se apaga ───────────
  // `_itinCard` lo prende/apaga `itinerarioDe(cur)` POR ID. La mudanza no puede
  // romper eso, y el caso que lo prueba es el evento que NO es ni MTY ni CDMX.
  console.log('\n[T] el tercer estado (bahidora, sin plantilla)');
  const hSin = await abrir(uH, 'bahidora', 390);
  const bSin = await abrir(uB, 'bahidora', 390);
  console.log('    BASE itin.ve=' + (bSin.d.itin && bSin.d.itin.ve) + '   HEAD itin.ve=' + (hSin.d.itin && hSin.d.itin.ve));
  af(bSin.d.itin && bSin.d.itin.ve === false,
     'PREMISA DEL TERCER ESTADO: en BASE bahidora no tenía que mostrar itinerario (no es ni Monterrey ni '
     + 'CDMX). Si lo mostraba, este bloque no prueba nada. ' + JSON.stringify(bSin.d.itin));
  af(hSin.d.itin && hSin.d.itin.ve === false,
     '🔴 al mudar el card, el evento SIN plantilla lo enciende: `_itinCard` lo busca por id y lo apaga con '
     + '`itinerarioDe(cur)`. Antes que un letrero que miente, ninguno. ' + JSON.stringify(hSin.d.itin));
  af(hSin.errs.length === 0, 'bahidora tiró errores en HEAD: ' + JSON.stringify(hSin.errs).slice(0, 200));
  // Y en un evento de CDMX sigue encendido (la otra plantilla).
  const hCdmx = await abrir(uH, 'edc27', 390);
  af(hCdmx.d.itin && hCdmx.d.itin.ve && hCdmx.d.itin.top < hCdmx.d.viaj.top,
     'en un evento de CDMX el itinerario no quedó visible y arriba: ' + JSON.stringify([hCdmx.d.itin, hCdmx.d.viaj]));

  // ── [G] LA GUÍA, BYTE A BYTE ─────────────────────────────────────────
  // CARD-GUIA-1 recorre `[data-guia]` en ORDEN DE DOCUMENTO. `d-itin-card` no
  // trae ese atributo, así que la mudanza NO debería moverle nada — y eso se
  // AFIRMA contra BASE, no se supone.
  console.log('\n[G] la secuencia de la guía');
  console.log('    BASE ' + JSON.stringify(B390.d.guia));
  console.log('    HEAD ' + JSON.stringify(H390.d.guia));
  af(B390.d.guia.length >= 4,
     'CANDADO DE CARDINALIDAD: la guía trae ' + B390.d.guia.length + ' pasos. Con uno o ninguno, una '
     + 'igualdad byte a byte pasaría en vacío');
  af(JSON.stringify(B390.d.guia) === JSON.stringify(H390.d.guia),
     '🔴 la SECUENCIA de la guía cambió con la mudanza: ' + JSON.stringify(B390.d.guia) + ' → '
     + JSON.stringify(H390.d.guia) + '. El orden de los pasos lo dice el DOCUMENTO, así que mover un card '
     + 'puede reordenarlos sin que nadie lo note');
  af(H390.d.guia.indexOf('itinerario') < 0 && B390.d.guia.indexOf('itinerario') < 0,
     'el card del itinerario aparece en la guía: no lleva `data-guia` justo para no ser un paso del wizard');
  // Y lo que la guía DICE al abrir, idéntico.
  af(B390.d.placeholder === H390.d.placeholder,
     'la frase de arranque de la guía cambió: ' + JSON.stringify(B390.d.placeholder) + ' → '
     + JSON.stringify(H390.d.placeholder));

  // ── [P] POLÍTICAS · sigue siendo lo ÚLTIMO, también con el wizard abierto
  // Se mide con la cotización ARMADA, que es cuando el wizard crece y podría
  // empujar Políticas entre los pasos.
  console.log('\n[P] políticas, al fondo del todo');
  const rP = await abrir(uH, 'frontera', 390, { dejar: true });
  const rPB = await abrir(uB, 'frontera', 390, { dejar: true });
  async function expandir(pg) {
    await pg.waitForSelector('#w-viajeros .wiz-btn', { timeout: 15000 });
    await pg.click('#w-viajeros .wiz-btn:nth-child(2)');
    await pg.waitForTimeout(250);
    await pg.evaluate(`(() => { const b = document.querySelector('#w-paquetes .wiz-pkg-btn:nth-child(1)'); if (b) b.click(); })()`);
    await pg.waitForTimeout(350);
    await pg.evaluate(`(() => { const z = document.querySelector('#d-zonas .z-btn:not(.z-btn-off)'); if (z) z.click(); })()`);
    await pg.waitForTimeout(500);
    return pg.evaluate(FOTO);
  }
  const pH = await expandir(rP.pg), pB = await expandir(rPB.pg);
  console.log('    HEAD cards: ' + JSON.stringify(pH.cards));
  af(pB.polDespuesDeTodo === true,
     'PREMISA: en BASE Políticas ya tenía que ser el último card de la ficha. ' + JSON.stringify(pB.cards));
  af(pH.polDespuesDeTodo === true,
     '🔴 Políticas dejó de ser el último card de la ficha: ' + JSON.stringify(pH.cards));
  af(pH.pol && pH.pol.top > pH.itin.top && pH.pol.top > pH.viaj.top,
     'Políticas quedó por ENCIMA de algún paso: tiene que empujarse conforme el wizard se expande. '
     + JSON.stringify([pH.pol, pH.viaj, pH.itin]));
  // Y nunca queda ENTRE pasos: su top es mayor que el de TODOS los wiz-card.
  const entre = await rP.pg.evaluate(`(() => {
    const pol = document.getElementById('d-pol-card'); if (!pol) return null;
    const pt = pol.getBoundingClientRect().top;
    return [...document.querySelectorAll('.wiz-card')]
      .filter((e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && e.getBoundingClientRect().height > 0; })
      .filter((e) => e.getBoundingClientRect().top > pt).map((e) => e.id);
  })()`);
  console.log('    pasos que quedaron DEBAJO de políticas: ' + JSON.stringify(entre));
  af(Array.isArray(entre) && entre.length === 0,
     '🔴 hay pasos del wizard por DEBAJO de Políticas, o sea que Políticas quedó ENTRE pasos: '
     + JSON.stringify(entre));
  await rP.ctx.close(); await rPB.ctx.close();

  // ── [B] SE MUDÓ, NO SE RE-ESCRIBIÓ ───────────────────────────────────
  // 🔒 El bloque tiene que ser byte por byte el mismo. Re-teclearlo sería la
  // copia que todavía no diverge — y aquí el texto es de Memo.
  console.log('\n[B] el bloque, byte a byte');
  const htmlH = fs.readFileSync(path.join(h.dir, 'index.html'), 'utf8');
  const htmlB = fs.readFileSync(path.join(b.dir, 'index.html'), 'utf8');
  function bloqueItin(html) {
    const i = html.indexOf('<div class="card" id="d-itin-card"');
    if (i < 0) return null;
    const j = html.indexOf('</div>\n', html.indexOf('d-itin-btn', i));
    return html.slice(i, j + 7);
  }
  const bH = bloqueItin(htmlH), bB = bloqueItin(htmlB);
  const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 12) : '(null)';
  console.log('    sha1  BASE ' + sha(bB) + '   HEAD ' + sha(bH));
  af(bH && bB && bH === bB,
     'el bloque del itinerario NO es byte por byte el de BASE: se re-escribió en vez de mudarse, y ese '
     + 'texto es de Memo. ' + sha(bB) + ' vs ' + sha(bH));
  // Y aparece UNA sola vez: una mudanza mal hecha lo deja duplicado y el
  // segundo, oculto, no se nota nunca.
  const veces = (htmlH.match(/id="d-itin-card"/g) || []).length;
  console.log('    apariciones de `d-itin-card` en HEAD: ' + veces);
  af(veces === 1, 'el card quedó DUPLICADO (' + veces + '): el segundo nace oculto y nadie lo ve hasta que estorba');

  // ── [N] LO QUE NO SE DEBÍA TOCAR ─────────────────────────────────────
  console.log('\n[N] lo que no se debía tocar');
  function cuerpo(html, firma) {
    const i = html.indexOf(firma);
    if (i < 0) return null;
    let j = html.indexOf('{', i), prof = 0, k = j;
    for (;; k++) { if (html[k] === '{') prof++; else if (html[k] === '}') prof--; if (prof === 0) break; }
    return html.slice(i, k + 1);
  }
  for (const firma of ['function abrirItinerario(', 'function itinerarioDe(', 'function polHtml(', 'function nubeCardHtml(']) {
    const cb = cuerpo(htmlB, firma), ch = cuerpo(htmlH, firma);
    af(cb && ch && cb === ch,
       'el cuerpo de `' + firma + '…` cambió y no debía: esta tuerca MUEVE un card, no toca su mecánica. '
       + (cb ? cb.length : 'null') + ' vs ' + (ch ? ch.length : 'null'));
    console.log('    ' + firma.padEnd(26) + (cb && ch && cb === ch ? 'idéntico (' + cb.length + ' bytes)' : '❌ CAMBIÓ'));
  }
  // El card de la nube y el de políticas, byte a byte en su markup.
  for (const [id, quien] of [['d-nube-card', 'el card de la nube'], ['d-pol-card', 'el card de políticas']]) {
    const corte = (html) => { const i = html.indexOf('id="' + id + '"'); return i < 0 ? null : html.slice(i, html.indexOf('</div>\n\n', i)); };
    af(corte(htmlB) === corte(htmlH), quien + ' (' + id + ') cambió de markup y no debía');
  }
  // 🔒 Y LOS TEXTOS DE MEMO: las políticas se comparan como DATOS, no por grep.
  const pol = (html) => { const i = html.indexOf('var POLITICAS'); if (i < 0) return null;
    let j = html.indexOf('[', i), prof = 0, k = j;
    for (;; k++) { if (html[k] === '[') prof++; else if (html[k] === ']') prof--; if (prof === 0) break; }
    return html.slice(j, k + 1); };
  af(pol(htmlB) && pol(htmlB) === pol(htmlH),
     'el arreglo `POLITICAS` cambió: son los textos de Memo, copiados y no parafraseados');

  await nav.close(); sb.close(); sh.close();
  completo = true;
  process.exitCode = rojo ? 1 : 0;
})();
