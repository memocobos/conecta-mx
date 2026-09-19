#!/usr/bin/env node
// =============================================================================
// scripts/mide-tira-agotados.js — EL CAREO DE LAND-2
// =============================================================================
// La portada anunciaba «Próximo evento: Natanael Cano (2 oct)» mientras Young
// Miko (19 sep), The Neighbourhood (23 sep) y Stray Kids (25 sep) —agotados—
// ocurrían ANTES y no aparecían en ningún lado del hero. La tuerca abre la
// tira a los próximos por fecha, agotados incluidos, con sello AGOTADO.
//
// Lo que mide, y DE DÓNDE:
//   · Los DOS lados son commits (`git archive`): BASE (el main de antes) y HEAD.
//     El verde de BASE también caduca: por eso BASE tiene que FALLAR lo que
//     HEAD arregla (sección 7), o el careo no prueba nada.
//   · TODO se lee del HTML PINTADO por el navegador real, nunca del fuente: el
//     comentario que explica el sello no puede cazarse a sí mismo.
//   · Se entra POR DONDE ENTRA EL CLIENTE: se sirve el commit por HTTP, arranca
//     la página entera y se HACE CLIC en los elementos. El destino del clic se
//     observa en el borde (`showDetail` y `window.open` son dobles); nada más
//     se simula. El id de cada miniatura SALE DE ESE CLIC, no de una lista mía.
//   · Lo que varía es el DATO, no el estado interno: para los controles se
//     reescribe el `EV` del index servido —lo mismo que hace una publicación de
//     Esferas— y el navegador arranca de cero con él. Nunca se fabrica `state`
//     a mano ni se llama a una función por dentro.
//   · 🔒 EL CANDADO HERO↔CATÁLOGO. El veredicto de agotado de la tira se carea
//     contra la clase `.agotado` de LA TARJETA RENDERIZADA del catálogo, evento
//     por evento, sobre los 60 próximos. Ese candado vivía SOLO como comentario
//     desde LAND-1 (su arnés nunca se versionó): aquí nace de verdad.
//
// Uso: node scripts/mide-tira-agotados.js   (BASE=<sha> HEAD=<sha> opcionales)
// =============================================================================

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const sh = (c) => execSync(c, { cwd: RAIZ, encoding: 'utf8' }).trim();
const BASE = sh(`git rev-parse ${process.env.BASE || 'e6633b1'}`);
const HEAD = sh(`git rev-parse ${process.env.HEAD || 'HEAD'}`);

let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

const ARCHIVOS = 'index.html imgs.js mapas.js lineups.js meta-events.js';
function extraer(sha) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'land2-' + sha.slice(0, 7) + '-'));
  execSync(`git archive ${sha} ${ARCHIVOS} | tar -x -C ${dir}`, { cwd: RAIZ });
  return dir;
}

const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2' };
function servir(raiz) {
  return new Promise((res, rej) => {
    const s = http.createServer((req, r) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(raiz, u === '/' ? 'index.html' : u);
      if (!f.startsWith(raiz)) { r.writeHead(403); return r.end(); }
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end('no'); }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); r.end(d); });
    });
    // EADDRINUSE se GRITA: un servidor de otra corrida sirve OTRO commit.
    s.on('error', rej);
    s.listen(0, () => res(s));            // puerto 0: el SO da uno libre, sin colisión
  });
}

// ── MUTAR EL DATO, NO EL ESTADO ──────────────────────────────────────────────
// Reescribe el `st` de UN evento del index servido. El ancla es el arranque de
// la ficha de nivel superior (`\n  {id:'x',`) porque `{id:` también vive ANIDADO
// en multifecha/hotel; y el corte termina donde arranca la siguiente ficha.
// 🔒 La sonda comprueba que MUTÓ: un replace sin ancla no cambia nada y se leería
// como un control verde en vacío.
function mutarSt(html, id, nuevoSt) {
  const ini = html.indexOf(`\n  {id:'${id}',`);
  if (ini < 0) throw new Error(`mutarSt: no encontré la ficha de ${id}`);
  const sig = html.indexOf(`\n  {id:'`, ini + 3);
  const fin = sig < 0 ? html.length : sig;
  const ficha = html.slice(ini, fin);
  const antes = ficha.match(/,st:'[^']*'/);
  if (!antes) throw new Error(`mutarSt: ${id} no declara st`);
  const nueva = ficha.replace(/,st:'[^']*'/, `,st:'${nuevoSt}'`);
  if (nueva === ficha) throw new Error(`mutarSt: ${id} no cambió (${antes[0]} → ${nuevoSt})`);
  return html.slice(0, ini) + nueva + html.slice(fin);
}

async function mirar(dirBase, mutaciones) {
  // Copia del commit con el catálogo que pida el caso. El navegador arranca de
  // cero contra ella: es una publicación distinta, no un estado inyectado.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'land2-run-'));
  for (const f of ARCHIVOS.split(' ')) fs.copyFileSync(path.join(dirBase, f), path.join(dir, f));
  if (mutaciones && mutaciones.length) {
    let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    for (const [id, st] of mutaciones) html = mutarSt(html, id, st);
    fs.writeFileSync(path.join(dir, 'index.html'), html);
  }
  const s = await servir(dir);
  const puerto = s.address().port;
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto(`http://127.0.0.1:${puerto}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof EV !== 'undefined' && document.querySelectorAll('.ev-card').length > 0);

  const foto = await page.evaluate(() => {
    const dsEf = (ev) => { const l = (ev.dsList && ev.dsList.length) ? ev.dsList : (ev.ds ? [ev.ds] : []); return l[0] || ''; };
    const esPasado = (ev) => !!(ev.ds && ev.ds !== '2027-12-31' && new Date(ev.ds + 'T23:59:59') < new Date());
    const limpio = (a) => (a || '').replace(/ - .*/, '').replace(/ Tour.*/, '');

    // El universo que la tuerca define para la tira, derivado del EV DEL COMMIT.
    const univ = EV.filter((e) => !e.listOnly && !esPasado(e) && dsEf(e))
                   .sort((a, b) => dsEf(a).localeCompare(dsEf(b)));
    const esAg = (e) => _evVeredicto(e).isAg;
    const aLaVenta = univ.filter((e) => { const v = _evVeredicto(e);
      return !v.isAg && !v.isProxi && !v.isPronto && !v.isProc && !v.isPC2 && !v.isNF && !v.isSV && (e.st === '' || e.st === 'ultimos'); });

    // 🔒 El nombre solo sirve de llave si es ÚNICO: una llave no-única DESCARTA
    // en silencio. Si colisiona, se dice y el careo lo trata como fallo.
    const nombres = {}; let colision = null;
    univ.forEach((e) => { const k = limpio(e.a); if (nombres[k]) colision = k; nombres[k] = e.id; });

    // ── Los dobles del BORDE. Nada más se simula: el manejador que corre es el real.
    let aterrizo = null;
    const showReal = window.showDetail, openReal = window.open;
    window.showDetail = (id) => { aterrizo = { ruta: 'ficha', id }; };
    window.open = (url) => { aterrizo = { ruta: 'wa', url }; return null; };
    const clicar = (el) => { aterrizo = null; el.click(); return aterrizo || { ruta: 'nada' }; };

    const caja = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    const encima = (a, b) => !!(a && b) && !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

    const strip = document.getElementById('hh-strip');
    const items = [...document.querySelectorAll('#hh-strip .hs-item:not(.hs-mas)')].map((it) => {
      const sello = it.querySelector('.hs-ag');
      const nom = it.querySelector('.hs-name');
      const visible = !!sello && sello.offsetHeight > 0 && sello.offsetWidth > 0;
      return {
        nombre: nom ? nom.textContent.replace(/^#\d+/, '').trim() : '',
        rank: (it.querySelector('.hs-rank') || {}).textContent || '',
        sello: visible,
        selloTxt: sello ? sello.textContent.trim() : '',
        selloFondo: sello ? getComputedStyle(sello).backgroundColor : '',
        selloTapaNombre: encima(caja(sello), caja(nom)),
        dataId: it.getAttribute('data-id') || '',
        destino: clicar(it),
      };
    });

    const slot = document.getElementById('hh-next');
    const wrap = document.getElementById('hh-next-wrap');
    const grandeVisible = !!wrap && getComputedStyle(wrap).display !== 'none';
    const grande = grandeVisible && slot ? clicar(slot) : { ruta: 'nada' };
    const masN = (document.querySelector('.hs-mas-n') || {}).textContent || '';

    window.showDetail = showReal; window.open = openReal;

    // 🔒 EL CANDADO: el veredicto que usa el hero, contra la TARJETA RENDERIZADA.
    const candado = univ.map((e) => {
      const card = document.querySelector('.ev-card[data-id="' + e.id + '"]');
      return { id: e.id, hero: esAg(e), catalogo: !!card && card.classList.contains('agotado'), hayCard: !!card };
    });

    return {
      colisionNombre: colision,
      univ: univ.map((e) => ({ id: e.id, ds: dsEf(e), ag: esAg(e), nombre: limpio(e.a) })),
      aLaVenta: aLaVenta.map((e) => e.id),
      items,
      grande,
      grandeVisible,
      stripVisible: !!strip && getComputedStyle(strip).display !== 'none',
      masN,
      candado,
    };
  });

  await nav.close(); s.close();
  foto.errores = errores;
  return foto;
}

// La tira, tal como la tuerca la define: los 3 primeros del universo que no
// sean la tarjeta grande. Se DERIVA del EV de cada commit — no hay lista escrita
// a mano que se pudra cuando pase septiembre.
const esperados = (foto) => foto.univ.filter((e) => e.id !== (foto.grande && foto.grande.id)).slice(0, 3);
const rojo = (s) => { const m = String(s).match(/[\d.]+/g) || []; return m[0] === '255' && m[1] === '40' && m[2] === '59'; };

(async () => {
  const dirB = extraer(BASE), dirH = extraer(HEAD);
  console.log(`\n═══ CAREO LAND-2 · la tira enseña también los agotados que vienen ═══`);
  console.log(`   BASE ${BASE.slice(0, 7)}  →  HEAD ${HEAD.slice(0, 7)}\n`);

  // ── HEAD, con el catálogo tal cual está publicado ──────────────────────────
  const H = await mirar(dirH, null);
  af(H.errores.length === 0, `[0] HEAD tiró errores de página: ${H.errores.join(' | ')}`);
  af(!H.colisionNombre, `[0] dos eventos próximos comparten nombre corto («${H.colisionNombre}»): la llave no sirve`);

  const esp = esperados(H);
  console.log(`   universo próximo: ${H.univ.length} · a la venta: ${H.aLaVenta.length} · agotados: ${H.univ.filter(e=>e.ag).length}`);
  console.log(`   tarjeta grande: ${H.grande.id} · tira pintada: ${H.items.map(i=>i.nombre+(i.sello?' [AGOTADO]':'')).join(' · ')}`);
  console.log(`   esperada por fecha: ${esp.map(e=>e.id+(e.ag?'*':'')).join(' · ')}\n`);

  // [1] EL UNIVERSO
  af(H.items.length === esp.length,
     `[1a] la tira pintó ${H.items.length} miniaturas, el universo pedía ${esp.length}`);
  esp.forEach((e, i) => af(H.items[i] && H.items[i].nombre.toUpperCase() === e.nombre.toUpperCase(),
     `[1a] posición ${i + 1}: la tira pintó «${H.items[i] ? H.items[i].nombre : '—'}» y por fecha tocaba «${e.nombre}» (${e.ds})`));
  // 🔒 El éxito vacío también habla: sin un agotado próximo, nada de esto prueba nada.
  af(esp.some((e) => e.ag),
     `[1b] el catálogo de hoy no tiene NI UN agotado entre los 3 próximos: este careo no puede probar la tuerca`);

  // [2] EL SELLO
  esp.forEach((e, i) => {
    const it = H.items[i]; if (!it) return;
    if (e.ag) {
      af(it.sello, `[2a] «${e.nombre}» está agotado y su miniatura NO trae sello visible`);
      af(it.selloTxt === 'AGOTADO', `[2a] el sello de «${e.nombre}» dice «${it.selloTxt}», no «AGOTADO»`);
      af(rojo(it.selloFondo), `[2b] el sello de «${e.nombre}» es ${it.selloFondo}, no el rojo de la casa #ff283b`);
      af(!it.selloTapaNombre, `[2c] el sello de «${e.nombre}» se encima con el nombre`);
    } else {
      af(!it.sello, `[2d] «${e.nombre}» está A LA VENTA y su miniatura trae sello de agotado`);
    }
  });

  // [3] LA TARJETA GRANDE
  const agH = new Set(H.univ.filter((e) => e.ag).map((e) => e.id));
  af(H.grande.ruta === 'ficha', `[3a] la tarjeta grande no abrió la ficha (${JSON.stringify(H.grande)})`);
  af(!agH.has(H.grande.id), `[3a] la tarjeta grande es un AGOTADO: ${H.grande.id}`);

  // [4] EL CLIC
  esp.forEach((e, i) => {
    const it = H.items[i]; if (!it) return;
    if (e.ag) {
      af(it.destino.ruta === 'wa', `[4a] tocar «${e.nombre}» (agotado) aterrizó en ${it.destino.ruta}, no en WhatsApp`);
      af(/wa\.me\//.test(it.destino.url || ''), `[4a] «${e.nombre}» no abrió wa.me: ${it.destino.url}`);
    } else {
      af(it.destino.ruta === 'ficha', `[4b] tocar «${e.nombre}» (a la venta) aterrizó en ${it.destino.ruta}, no en la ficha`);
    }
  });

  // [5] EL «+N MÁS» — los que quedan A LA VENTA y no se ven
  const venta = new Set(H.aLaVenta);
  const vistosVenta = esp.filter((e) => venta.has(e.id)).length;
  const nEsperado = H.aLaVenta.length - 1 - vistosVenta;
  af(H.masN === '+' + nEsperado,
     `[5a] el «+N más» dice «${H.masN}» y los que quedan a la venta sin verse son ${nEsperado}`);

  // [6] 🔒 EL CANDADO HERO↔CATÁLOGO, evento por evento
  const rotos = H.candado.filter((c) => !c.hayCard || c.hero !== c.catalogo);
  af(rotos.length === 0,
     `[6a] el veredicto del hero y la tarjeta del catálogo divergen en ${rotos.length}: ${rotos.slice(0,5).map(r=>r.id+(r.hayCard?` hero=${r.hero} catálogo=${r.catalogo}`:' sin tarjeta')).join(', ')}`);
  af(H.candado.length > 0, `[6a] el candado se corrió sobre CERO eventos`);

  // ── CONTROLES: se cambia el DATO y la página arranca de nuevo ──────────────
  // [2d/4b] Mezcla de verdad: se despierta al 2º de la tira, que hoy está agotado.
  const mezclaId = esp[1] && esp[1].ag ? esp[1].id : (esp.find((e) => e.ag) || {}).id;
  if (mezclaId) {
    const M = await mirar(dirH, [[mezclaId, '']]);
    const it = M.items.find((i) => i.dataId === mezclaId) ||
               M.items[esperados(M).findIndex((e) => e.id === mezclaId)];
    af(!!it, `[2d-control] «${mezclaId}» desagotado ya no aparece en la tira`);
    if (it) {
      af(!it.sello, `[2d-control] «${mezclaId}» a la venta SIGUE trayendo sello`);
      af(it.destino.ruta === 'ficha', `[4b-control] «${mezclaId}» a la venta no abrió la ficha (${it.destino.ruta})`);
    }
    af(M.items.some((i) => i.sello), `[2d-control] al desagotar uno se apagaron TODOS los sellos`);
  }

  // [3b] La grande nunca es un agotado, ni forzándola: se agota al que hoy la ocupa.
  if (H.grande.id) {
    const G = await mirar(dirH, [[H.grande.id, 'agotado']]);
    const agG = new Set(G.univ.filter((e) => e.ag).map((e) => e.id));
    af(G.grande.id !== H.grande.id, `[3b] se agotó «${H.grande.id}» y sigue siendo la tarjeta grande`);
    af(!agG.has(G.grande.id), `[3b] tras agotar al primero, la tarjeta grande es un AGOTADO: ${G.grande.id}`);
    af(G.items.length === 3, `[3b] la tira quedó con ${G.items.length} miniaturas tras mover la grande`);
    const rotosG = G.candado.filter((c) => !c.hayCard || c.hero !== c.catalogo);
    af(rotosG.length === 0, `[6a-control] el candado se rompió con el catálogo mutado: ${rotosG.length} eventos`);
  }

  // ── [7] CONTROL POSITIVO: BASE TIENE QUE FALLAR ───────────────────────────
  const B = await mirar(dirB, null);
  const agB = new Set(B.univ.filter((e) => e.ag).map((e) => e.id));
  const espB = esperados(B);
  console.log(`   BASE · tarjeta grande: ${B.grande.id} · tira: ${B.items.map(i=>i.nombre).join(' · ')}  (+N ${B.masN})`);
  af(espB.some((e) => e.ag),
     `[7] BASE no tiene agotados próximos que mostrar: el control positivo no prueba nada`);
  af(!B.items.some((i) => i.sello),
     `[7a] BASE ya pinta sellos: el sello no es de esta tuerca`);
  const nombresBase = new Set(B.items.map((i) => i.nombre.toUpperCase()));
  const agotadosOmitidos = espB.filter((e) => e.ag && !nombresBase.has(e.nombre.toUpperCase()));
  af(agotadosOmitidos.length > 0,
     `[7b] BASE ya muestra a los agotados próximos: no había nada que arreglar`);
  af(B.masN !== H.masN,
     `[7c] el «+N más» no se movió (${B.masN} → ${H.masN}): la resta vieja y la nueva no divergen hoy`);

  console.log(`\n   ${ok} verdes · ${mal} rojos`);
  if (mal) { console.log('\n   ROJOS:'); fallos.forEach((f) => console.log('   ✗ ' + f)); }
  else console.log('   ✅ todo verde');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('\n💥 el careo se cayó:', e.stack || e.message); process.exit(2); });
