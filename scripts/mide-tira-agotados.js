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
const BASE = sh(`git rev-parse ${process.env.BASE || '5215107'}`);   // el merge de #738
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
function servir(raiz, top) {
  return new Promise((res, rej) => {
    const s = http.createServer((req, r) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      // [LAND-2] LOS MÁS BUSCADOS, CUANDO SE PIDEN. Sin esto el endpoint da 404
      // y la tira cae SIEMPRE en su respaldo por fecha — que es justo el camino
      // que producción NO toma: allá el top sí contesta y manda. Medir solo el
      // respaldo dejaba sin ejercitar la rama que el cliente ve todos los días.
      // El contrato es el real: { top: [{event_id}] }, el mismo que lee refreshTop10.
      if (u === '/.netlify/functions/event-clicks') {
        r.writeHead(top ? 200 : 404, { 'Content-Type': 'application/json' });
        return r.end(top ? JSON.stringify({ top: top.map((id) => ({ event_id: id })) }) : '{}');
      }
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

// [LAND-2] AGOTAR POR SEMÁFORO, no por etiqueta. Deja `st:''` y marca `ag:1` en
// todas las zonas: el evento queda agotado SOLO por el auto-semáforo, que es la
// tercera pata de la regla sellada (st · ev.agotado · zonas). Sirve para que el
// candado hero↔catálogo tenga algo que morder: un hero que preguntara nada más
// por `st==='agotado'` pintaría este evento SIN sello mientras el catálogo lo
// tacha. 🔒 Comprueba que mutó de verdad.
function mutarSemaforo(html, id) {
  const ini = html.indexOf(`\n  {id:'${id}',`);
  if (ini < 0) throw new Error(`mutarSemaforo: no encontré la ficha de ${id}`);
  const sig = html.indexOf(`\n  {id:'`, ini + 3);
  const fin = sig < 0 ? html.length : sig;
  const ficha = html.slice(ini, fin);
  // Los objetos de zona son planos y no contienen `}` adentro: cerrar cada uno
  // con `,ag:1}` los agota a todos sin tocar nada anidado.
  let nueva = ficha.replace(/(\{n:'[^']*'[^{}]*?)\}/g, (m, cuerpo) => /,ag:1/.test(cuerpo) ? m : cuerpo + ',ag:1}');
  nueva = nueva.replace(/,st:'[^']*'/, ",st:''");
  if (nueva === ficha) throw new Error(`mutarSemaforo: ${id} no cambió`);
  return html.slice(0, ini) + nueva + html.slice(fin);
}

// [LAND-2b] SACAR DEL UNIVERSO SIN MOVER LA TARJETA GRANDE. Desagotar a un
// evento cercano lo vuelve el próximo a la venta y se lleva la tarjeta grande
// —y con ella el tope de la ventana—, así que no sirve para medir el BORDE de
// la ventana. `listOnly` lo saca del universo de la tira dejando la grande
// donde está.
function mutarListOnly(html, id) {
  const anc = `\n  {id:'${id}',`;
  const i = html.indexOf(anc);
  if (i < 0) throw new Error(`mutarListOnly: no encontré la ficha de ${id}`);
  if (/listOnly/.test(html.slice(i, i + 200))) return html;
  return html.slice(0, i + anc.length) + 'listOnly:true,' + html.slice(i + anc.length);
}

// [LAND-2b] DESAGOTAR DE VERDAD. No basta con vaciar el `st`: si las zonas
// siguen en `ag:1` el auto-semáforo vuelve a agotarlo y el control se mediría a
// sí mismo. Quita el `ag:1` de todas las zonas Y vacía el st.
function mutarDesagotar(html, id) {
  const ini = html.indexOf(`\n  {id:'${id}',`);
  if (ini < 0) throw new Error(`mutarDesagotar: no encontré la ficha de ${id}`);
  const sig = html.indexOf(`\n  {id:'`, ini + 3);
  const fin = sig < 0 ? html.length : sig;
  const ficha = html.slice(ini, fin);
  const nueva = ficha.replace(/,ag:1/g, '').replace(/,st:'[^']*'/, ",st:''");
  if (nueva === ficha) throw new Error(`mutarDesagotar: ${id} no cambió`);
  return html.slice(0, ini) + nueva + html.slice(fin);
}

async function mirar(dirBase, mutaciones, top) {
  // Copia del commit con el catálogo que pida el caso. El navegador arranca de
  // cero contra ella: es una publicación distinta, no un estado inyectado.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'land2-run-'));
  for (const f of ARCHIVOS.split(' ')) fs.copyFileSync(path.join(dirBase, f), path.join(dir, f));
  if (mutaciones && mutaciones.length) {
    let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    for (const [id, st] of mutaciones) html =
      (st === '@semaforo') ? mutarSemaforo(html, id) :
      (st === '@desagotar') ? mutarDesagotar(html, id) :
      (st === '@listonly') ? mutarListOnly(html, id) : mutarSt(html, id, st);
    fs.writeFileSync(path.join(dir, 'index.html'), html);
  }
  const s = await servir(dir, top);
  const puerto = s.address().port;
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.goto(`http://127.0.0.1:${puerto}/index.html`, { waitUntil: 'load' });
  // ⚠️ SE ESPERA AL HERO, NO AL CATÁLOGO. Esperar a que existan `.ev-card` NO
  // prueba que la tira esté pintada: el catálogo y el hero los construyen
  // bloques distintos. Con esa espera floja el careo parpadeó dos veces —leyó
  // una tira que todavía no era la definitiva— y un parpadeo se lee igual que
  // un defecto. Ahora se espera a que la tira TENGA miniaturas y a que el
  // navegador haya terminado de cargar; si no llegan, el careo se cae a gritos
  // en vez de medir a medias.
  // ⚠️ LA ESPERA NO PUEDE MATAR EL CAREO. Existe para no medir antes de tiempo,
  // pero si vence hay que MEDIR IGUAL y que lo diga una aserción: un sabotaje
  // que dejaba la tira vacía tumbaba la corrida entera con un timeout y se
  // llevaba por delante todas las secciones de abajo, que ni se ejercitaron.
  // Es la ley del libro: un arnés que se cae no reporta.
  let esperaVencida = false;
  try {
    await page.waitForFunction(
      () => document.readyState === 'complete' &&
            typeof EV !== 'undefined' &&
            document.querySelectorAll('.ev-card').length > 0 &&
            document.querySelectorAll('#hh-strip .hs-item').length > 0,
      null, { timeout: 12000 });
  } catch (e) { esperaVencida = true; }
  // Y un respiro para que cualquier repintado tardío del hero haya ocurrido
  // ANTES de la foto: lo que se mide es la tira asentada, no una a mitad.
  await page.waitForTimeout(400);
  // Con top servido, la tira nace con el respaldo y el top la ASCIENDE después
  // (`__landHeroTop`). Se espera al ascenso, o se mediría la tira de antes.
  // ⚠️ SE ESPERA, PERO NO SE MUERE. Si el ascenso no llega, esto tiene que
  // salir como un ROJO de [8a] y dejar correr el resto: un arnés que se cae
  // deja todas las secciones de abajo sin ejercitar, y el resumen no lo dice.
  // (Probado: un sabotaje que le daba la tarjeta grande al #1 del top tumbaba
  // el careo entero con un timeout en vez de reportar.)
  if (top) {
    try {
      // ⚠️ [LAND-2b] EL ASCENSO YA NO SE RECONOCE POR LA FUENTE. Antes se
      // esperaba a `data-fuente === 'top'`, pero ahora el top puede llegar y NO
      // ganar un solo lugar (los agotados próximos van primero): esa espera se
      // agotaría en el caso normal y mediría la tira ANTES del ascenso. La
      // señal honesta es que el top llegó y el hero se volvió a construir.
      await page.waitForFunction(
        () => typeof _top10Ids !== 'undefined' && _top10Ids.length > 0 &&
              document.querySelectorAll('#hh-strip .hs-item').length > 0,
        null, { timeout: 8000 });
    } catch (e) { /* lo dicen las aserciones, no una excepción */ }
    await page.waitForTimeout(250);
  }

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
    const showReal = window.showDetail, openReal = window.open, wlReal = window.abrirWaitlistModal;
    window.showDetail = (id) => { aterrizo = { ruta: 'ficha', id }; };
    window.open = (url) => { aterrizo = { ruta: 'wa', url }; return null; };
    // [LAND-2c] La puerta del «próximamente» en el catálogo, medida en la
    // tarjeta real: `abrirWaitlistModal(ev)` — recibe el EVENTO, no el id.
    window.abrirWaitlistModal = (ev) => { aterrizo = { ruta: 'waitlist', id: ev && ev.id }; };
    const clicar = (el) => { aterrizo = null; el.click(); return aterrizo || { ruta: 'nada' }; };

    const caja = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    const encima = (a, b) => !!(a && b) && !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

    const strip = document.getElementById('hh-strip');
    const volcado = strip ? strip.innerHTML.slice(0, 1200) : '(sin tira)';
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
        // [LAND-2c] Lo que el cliente LEE de fecha, y el sello de próximamente.
        fecha: (it.querySelector('.hs-fecha') || {}).textContent || '',
        prox: (() => { const q = it.querySelector('.hs-prox');
          return !!q && q.offsetHeight > 0 && q.offsetWidth > 0; })(),
        proxTxt: (it.querySelector('.hs-prox') || {}).textContent || '',
        proxFondo: it.querySelector('.hs-prox') ? getComputedStyle(it.querySelector('.hs-prox')).backgroundColor : '',
        selloTapaNombre: encima(caja(sello), caja(nom)),
        // 🔒 «Sin tapar el nombre» NO se puede falsear: `.hs-media` recorta con
        // overflow:hidden y el nombre vive FUERA, en `.hs-media`+`.hs-body`
        // hermanos. Probado con un sabotaje: mover el sello a top:44px no lo
        // sacó de la foto y la aserción siguió verde — una guarda inalcanzable.
        // Lo que SÍ puede romperse es lo que el sello tapa de la PORTADA: copiar
        // el `::after` de `.ev-card` (inset:0, 26px) borraría el cartel entero
        // en 50px de alto. Eso se mide por el CENTRO del cartel, sin inventar
        // ningún umbral: si el sello lo cubre, la miniatura dejó de ser una foto.
        selloTapaCartel: (() => {
          const cs = caja(sello), cm = caja(it.querySelector('.hs-media'));
          if (!cs || !cm) return false;
          const cx = cm.x + cm.w / 2, cy = cm.y + cm.h / 2;
          return cx >= cs.x && cx <= cs.x + cs.w && cy >= cs.y && cy <= cs.y + cs.h;
        })(),
        dataId: it.getAttribute('data-id') || '',
        destino: clicar(it),
      };
    });

    const slot = document.getElementById('hh-next');
    const wrap = document.getElementById('hh-next-wrap');
    const grandeVisible = !!wrap && getComputedStyle(wrap).display !== 'none';
    const grande = grandeVisible && slot ? clicar(slot) : { ruta: 'nada' };
    const masN = (document.querySelector('.hs-mas-n') || {}).textContent || '';

    window.showDetail = showReal; window.open = openReal; window.abrirWaitlistModal = wlReal;

    // 🔒 EL CANDADO: el veredicto que usa el hero, contra la TARJETA RENDERIZADA.
    const candado = univ.map((e) => {
      const card = document.querySelector('.ev-card[data-id="' + e.id + '"]');
      return { id: e.id, hero: esAg(e), catalogo: !!card && card.classList.contains('agotado'), hayCard: !!card };
    });

    return {
      colisionNombre: colision,
      univ: univ.map((e) => { const v = _evVeredicto(e);
        return { id: e.id, ds: dsEf(e), ag: v.isAg, proxi: v.isProxi || v.isPronto,
                 soloProxi: v.isProxi, nombre: limpio(e.a) }; }),
      aLaVenta: aLaVenta.map((e) => e.id),
      items,
      grande,
      grandeVisible,
      stripVisible: !!strip && getComputedStyle(strip).display !== 'none',
      fuente: strip ? strip.getAttribute('data-fuente') : '',
      masN,
      candado,
      volcado,
      listo: document.readyState,
    };
  });

  await nav.close(); s.close();
  foto.errores = errores;
  foto.esperaVencida = esperaVencida;
  return foto;
}

// La tira, tal como la tuerca la define: los 3 primeros del universo que no
// sean la tarjeta grande. Se DERIVA del EV de cada commit — no hay lista escrita
// a mano que se pudra cuando pase septiembre.
const esperados = (foto) => foto.univ.filter((e) => e.id !== (foto.grande && foto.grande.id)).slice(0, 3);
const rojo = (s) => { const m = String(s).match(/[\d.]+/g) || []; return m[0] === '255' && m[1] === '40' && m[2] === '59'; };
// El amarillo con que el CATÁLOGO pinta «Próximamente» (.ev-tag.tpronto y el
// badge AVÍSAME): #e8ff4c = var(--c-amarillo). No se inventa un color nuevo.
const amarillo = (s) => { const m = String(s).match(/[\d.]+/g) || []; return m[0] === '232' && m[1] === '255' && m[2] === '76'; };

(async () => {
  const dirB = extraer(BASE), dirH = extraer(HEAD);
  console.log(`\n═══ CAREO LAND-2 · la tira enseña también los agotados que vienen ═══`);
  console.log(`   BASE ${BASE.slice(0, 7)}  →  HEAD ${HEAD.slice(0, 7)}\n`);

  // ── HEAD, con el catálogo tal cual está publicado ──────────────────────────
  const H = await mirar(dirH, null);
  af(H.errores.length === 0, `[0] HEAD tiró errores de página: ${H.errores.join(' | ')}`);
  // Toda carga que el careo mire tiene que estar limpia: un error de página en
  // un CONTROL lo volvería un renglón verde sobre una página rota.
  const limpio = (foto, etiqueta) => {
    af(foto.errores.length === 0, `[0${etiqueta}] la página tiró errores: ${foto.errores.join(' | ')}`);
    af(!foto.esperaVencida, `[0${etiqueta}] la tira nunca llegó a pintar miniaturas (la espera venció): se midió lo que hubiera`);
  };
  limpio(H, '');
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
  const itemDe = (foto, e, i) => foto.items.find((x) => x.dataId === e.id) || foto.items[i];
  esp.forEach((e, i) => {
    const it = itemDe(H, e, i); if (!it) return;
    if (e.ag) {
      af(it.sello, `[2a] «${e.nombre}» está agotado y su miniatura NO trae sello visible · tira servida: ${H.volcado.replace(/\s+/g, ' ').slice(0, 300)}`);
      af(it.selloTxt === 'AGOTADO', `[2a] el sello de «${e.nombre}» dice «${it.selloTxt}», no «AGOTADO»`);
      af(rojo(it.selloFondo), `[2b] el sello de «${e.nombre}» es ${it.selloFondo}, no el rojo de la casa #ff283b`);
      af(!it.selloTapaNombre, `[2c] el sello de «${e.nombre}» se encima con el nombre`);
      af(!it.selloTapaCartel, `[2c] el sello de «${e.nombre}» tapa el centro del cartel: la miniatura dejó de enseñar la foto`);
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
    const it = itemDe(H, e, i); if (!it) return;
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

  // [6b] 🔒 LA MITAD QUE DE VERDAD IMPORTA: el sello PINTADO contra la clase de
  // la tarjeta. [6a] carea `_evVeredicto` contra el catálogo, pero las dos
  // salen de la misma función: si el hero se inventara SU regla, [6a] seguiría
  // verde. Esto compara lo que el cliente VE en la tira con lo que el cliente
  // VE en el catálogo, que es el candado que la tuerca pide.
  const cardAg = (foto, id) => { const c = foto.candado.find((x) => x.id === id); return c && c.catalogo; };
  const selloVsCard = (foto, etiqueta) => foto.items.forEach((it) => {
    if (!it.dataId) return;
    af(it.sello === !!cardAg(foto, it.dataId),
       `[6b${etiqueta}] «${it.dataId}»: la tira ${it.sello ? 'SÍ' : 'NO'} lo sella y su tarjeta del catálogo ${cardAg(foto, it.dataId) ? 'SÍ' : 'NO'} está agotada`);
  });
  selloVsCard(H, '');

  // ── CONTROLES: se cambia el DATO y la página arranca de nuevo ──────────────
  // [2d/4b] UNA TIRA MIXTA, BUSCADA EN LOS DATOS, NO ADIVINADA.
  // El control al revés («un evento a la venta NO lleva sello») no se puede
  // correr con el catálogo de hoy: las tres miniaturas están agotadas, así que
  // esa rama vivía EN VACÍO — un renglón verde sobre algo que nunca se ejercitó.
  // Y no basta con desagotar a uno cualquiera: desagotar al PRIMERO de la tira
  // lo convierte en la tarjeta grande (pasa a ser el próximo a la venta) y
  // desaparece de la tira — así se cayó el primer intento. Se prueban los
  // agotados en orden hasta dar con una publicación que deje la tira MEZCLADA,
  // y si ninguna la deja, se dice en rojo en vez de callarlo.
  let mixta = null;
  for (const cand of esp.filter((e) => e.ag)) {
    const M = await mirar(dirH, [[cand.id, '']]);
    if (M.items.some((i) => !i.sello) && M.items.some((i) => i.sello)) { mixta = { cand, M }; break; }
  }
  af(!!mixta, `[2d-control] con el catálogo de hoy no se pudo armar una tira MIXTA: el control al revés no se corrió`);
  if (mixta) {
    const { cand, M } = mixta;
    console.log(`   control mixto · desagotando «${cand.id}»: ${M.items.map((i) => i.nombre + (i.sello ? ' [AGOTADO]' : ' [venta]')).join(' · ')}`);
    esperados(M).forEach((e, i) => {
      const it = itemDe(M, e, i); if (!it) return;
      if (e.ag) af(it.sello, `[2d-control] «${e.id}» sigue agotado y perdió el sello en la tira mixta`);
      else {
        af(!it.sello, `[2d-control] «${e.id}» está A LA VENTA y lleva sello`);
        af(it.destino.ruta === 'ficha', `[4b-control] «${e.id}» a la venta aterrizó en ${it.destino.ruta}, no en la ficha`);
      }
    });
    selloVsCard(M, '-mixto');
    limpio(M, '-mixto');
  }

  // [6c] 🔒 EL AUTO-SEMÁFORO, la pata que una regla inventada se salta.
  // Se agota al primero de la tira SIN etiqueta: `st:''` y todas las zonas en
  // `ag:1`. El catálogo lo tacha (lo hace `_evVeredicto`), así que la tira
  // TIENE que sellarlo. Un hero que preguntara nada más por `st==='agotado'`
  // —la copia fácil— pasaría [6a] y moriría aquí.
  const semId = (esp.find((e) => e.ag) || esp[0] || {}).id;
  if (semId) {
    const S = await mirar(dirH, [[semId, '@semaforo']]);
    const itS = S.items.find((x) => x.dataId === semId);
    af(cardAg(S, semId) === true, `[6c] el montaje falló: «${semId}» con todas las zonas agotadas no salió tachado en el catálogo`);
    af(!!itS, `[6c] «${semId}» agotado por semáforo desapareció de la tira`);
    if (itS && !itS.sello) console.log('   [6c] volcado de la tira servida:\n   ' + S.volcado.replace(/\s+/g, ' ').slice(0, 900));
    if (itS) af(itS.sello, `[6c] «${semId}» está agotado SOLO por el auto-semáforo y la tira no lo selló`);
    selloVsCard(S, '-semáforo');
    limpio(S, '-semáforo');
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
    limpio(G, '-grande');
  }

  // ⚠️ [LAND-2c] AQUÍ VIVÍA EL AVISO de los «próximamente» que el universo nuevo
  // admitía sin nada que los distinga. Dejó de ser un aviso: ahora llevan su
  // propio sello y su propia puerta, y se exige en [12b]. El otro «queda dicho»
  // —que `fechaCorta` no decía el año— se exige en [12c].

  // ══ [8] EL CAMINO REAL DE PRODUCCIÓN ═════════════════════════════════════
  // ⚠️ ESTA ES LA ASERCIÓN QUE FALTÓ EN #737, Y POR ESO LA TUERCA NO SIRVIÓ EN
  // VIVO. Aquel careo midió que el camino del top FUNCIONA —fuente, chips,
  // sello por esa vía— pero nunca exigió que por ahí SALIERAN los agotados
  // próximos. En producción el top contesta y trae 3 vendibles, llena los 3
  // lugares, y Young Miko, The Neighbourhood y Stray Kids quedaban fuera igual
  // que antes. El «antes/después» de aquella PR era el RESPALDO, que producción
  // no toma nunca.
  //
  // TOP_REAL es el top de VERDAD, tal como lo devolvió
  // `/.netlify/functions/event-clicks` de conectareynosa.mx el 19-sep-2026 tras
  // el merge de #737. Es una FOTO —si el ranking cambia, este careo no lo ve—
  // pero lo que se asegura NO sale de la foto: las expectativas se derivan del
  // EV del commit. La foto solo pone al top A CONTESTAR, que es lo que en
  // producción pasa siempre y en el careo no pasaba nunca.
  // 🔒 Young Miko va #8 en este top: por ranking JAMÁS alcanzaría la tira.
  const TOP_REAL = ['julion', 'titodoble', 'alfredito', 'natanael', 'frontera',
                    'payasonicos', 'monlaferte', 'youngmiko', 'alvarodiaz', 'karolg'];

  // La ventana, derivada del EV: agotados con fecha entre hoy y la de la
  // tarjeta grande INCLUSIVE, por fecha, hasta 3.
  const dsGrande = (H.univ.find((e) => e.id === H.grande.id) || {}).ds || '';
  const ventana = H.univ.filter((e) => e.ag && e.ds <= dsGrande && e.id !== H.grande.id).slice(0, 3);
  console.log(`   ventana de agotados [hoy … ${dsGrande}]: ${ventana.map((e) => e.id + ' ' + e.ds).join(' · ') || '(ninguno)'}`);
  af(ventana.length > 0, `[8] hoy no hay agotados entre hoy y la fecha de la grande: este careo no puede probar LAND-2b`);

  const P = await mirar(dirH, null, TOP_REAL);
  limpio(P, '-produccion');
  console.log(`   con el top REAL contestando · tira: ${P.items.map((i) => (i.rank || '') + i.nombre + (i.sello ? ' [AGOTADO]' : '')).join(' · ')}  (fuente ${P.fuente}, ${P.masN})`);

  // [8a] Los agotados de la ventana ganan los primeros lugares, EN ORDEN DE FECHA.
  ventana.forEach((e, i) => {
    const it = P.items[i];
    af(!!it && it.dataId === e.id,
       `[8a] con el top real, el lugar ${i + 1} lo ocupa «${it ? it.dataId : '—'}» y le tocaba a «${e.id}» (${e.ds}, agotado y antes o el mismo día que la grande)`);
    if (it && it.dataId === e.id) af(it.sello, `[8a] «${e.id}» ganó su lugar por agotado y no lleva sello`);
  });
  // [8b] La grande no se mueve por más que el top la empuje.
  af(P.grande.id === H.grande.id, `[8b] el top real cambió la tarjeta grande: ${H.grande.id} → ${P.grande.id}`);
  af(/agotados/.test(P.fuente || ''), `[8b] con la ventana llena la fuente dice «${P.fuente}» y no menciona los agotados`);
  selloVsCard(P, '-produccion');

  // [8c] Los lugares que SOBREN los llena el top, en su orden.
  const yaPuestos = new Set([H.grande.id, ...ventana.map((e) => e.id)]);
  const delTop = TOP_REAL.filter((id) => !yaPuestos.has(id) && H.univ.some((e) => e.id === id));
  for (let i = 0; i < 3 - ventana.length; i++) {
    const it = P.items[ventana.length + i];
    af(!!it && it.dataId === delTop[i],
       `[8c] el lugar ${ventana.length + i + 1} sobra de la ventana y le tocaba al top («${delTop[i]}»), salió «${it ? it.dataId : '—'}»`);
  }

  // ══ [9] CONTROL AL REVÉS · SIN AGOTADOS PRÓXIMOS, EL TOP LLENA LOS 3 ══════
  // Se desagotan TODOS los agotados del universo (st vacío Y zonas libres: con
  // el `ag:1` puesto el auto-semáforo los revive y el control se mediría solo).
  // Sin nadie en la ventana la tira tiene que ser el top puro, con sus chips y
  // sin un sello — exactamente como se comportaba antes de esta tuerca.
  const D = await mirar(dirH, H.univ.filter((e) => e.ag).map((e) => [e.id, '@desagotar']), TOP_REAL);
  limpio(D, '-sin-agotados');
  console.log(`   sin agotados próximos · tira: ${D.items.map((i) => (i.rank || '') + i.nombre + (i.sello ? ' [AGOTADO]' : '')).join(' · ')}  (fuente ${D.fuente})`);
  af(D.univ.filter((e) => e.ag).length === 0, `[9] el montaje falló: quedaron ${D.univ.filter((e) => e.ag).length} agotados tras desagotarlos`);
  af(D.fuente === 'top', `[9a] sin agotados próximos la tira dice fuente «${D.fuente}», no «top»`);
  const delTopD = TOP_REAL.filter((id) => id !== D.grande.id && D.univ.some((e) => e.id === id)).slice(0, 3);
  delTopD.forEach((id, i) => {
    const it = D.items[i];
    af(!!it && it.dataId === id, `[9a] sin agotados, el lugar ${i + 1} le tocaba a «${id}» (#${TOP_REAL.indexOf(id) + 1} del top) y salió «${it ? it.dataId : '—'}»`);
    if (it && it.dataId === id) af(it.rank === '#' + (TOP_REAL.indexOf(id) + 1),
      `[9b] «${id}» va #${TOP_REAL.indexOf(id) + 1} en el top y su chip dice «${it.rank || '(ninguno)'}»`);
  });
  af(!D.items.some((x) => x.sello), `[9c] sin agotados en el catálogo la tira sigue pintando sellos`);

  // ══ [11] EL BORDE DE LA VENTANA · «INCLUSIVE» TIENE QUE SER OBSERVABLE ═══
  // La regla dice [hoy … la fecha de la grande, INCLUSIVE]. Con el catálogo de
  // hoy ese «inclusive» NO SE PUEDE FALSEAR: los tres agotados de la ventana
  // caen antes del 2-oct y llenan los lugares, así que Iron Maiden —que cae el
  // MISMO día que la grande— queda cuarto y no cabe. Probado: cambiar el corte
  // de `>` a `>=` dejaba el careo en 100 verdes. Una regla que no se puede
  // romper no se está midiendo.
  //
  // Se despeja el borde sacando del universo a los agotados que están DELANTE,
  // con `listOnly` — no desagotándolos: desagotar a uno cercano lo vuelve el
  // próximo a la venta, se lleva la tarjeta grande y con ella el tope de la
  // ventana, que es justo lo que se quiere dejar quieto.
  const enBorde = H.univ.find((e) => e.ag && e.ds === dsGrande && e.id !== H.grande.id);
  const delante = H.univ.filter((e) => e.ag && e.ds < dsGrande).map((e) => e.id);
  af(!!enBorde, `[11] no hay un agotado en la fecha exacta de la grande: el «inclusive» de la ventana no se puede medir hoy`);
  if (enBorde) {
    const W = await mirar(dirH, delante.map((id) => [id, '@listonly']), TOP_REAL);
    limpio(W, '-borde');
    console.log(`   borde de la ventana (fuera ${delante.join(', ')}) · tira: ${W.items.map((i) => (i.rank || '') + i.nombre + (i.sello ? ' [AGOTADO]' : '')).join(' · ')}  (fuente ${W.fuente})`);
    af(W.grande.id === H.grande.id, `[11] el montaje movió la tarjeta grande: ${H.grande.id} → ${W.grande.id}`);
    const it = W.items.find((x) => x.dataId === enBorde.id);
    af(!!it, `[11a] «${enBorde.id}» cae el MISMO día que la grande (${dsGrande}) y la ventana lo dejó fuera: «inclusive» no se está cumpliendo`);
    if (it) af(it.sello, `[11a] «${enBorde.id}» entró por la ventana y no lleva sello`);
    // Y lo de MÁS ALLÁ del borde sigue fuera: la ventana tiene tope.
    const masAlla = H.univ.filter((e) => e.ag && e.ds > dsGrande).map((e) => e.id);
    af(masAlla.length > 0, `[11b] no hay agotados después de la fecha de la grande: el TOPE de la ventana no se puede medir hoy`);
    masAlla.forEach((id) => af(!W.items.some((x) => x.dataId === id),
      `[11b] «${id}» cae DESPUÉS de la grande y la ventana se lo llevó igual: el tope no existe`));
  }

  // ══ [10] LA MEZCLA · un agotado en la ventana y el top llenando el resto ══
  // Prueba que el sello y el chip #N CONVIVEN y que el corte entre las dos vías
  // cae donde debe. Se desagotan todos menos el primero de la ventana.
  const quedaUno = ventana[0];
  if (quedaUno && H.univ.filter((e) => e.ag).length > 1) {
    const X = await mirar(dirH, H.univ.filter((e) => e.ag && e.id !== quedaUno.id).map((e) => [e.id, '@desagotar']), TOP_REAL);
    limpio(X, '-mezcla');
    console.log(`   un solo agotado · tira: ${X.items.map((i) => (i.rank || '') + i.nombre + (i.sello ? ' [AGOTADO]' : '')).join(' · ')}  (fuente ${X.fuente})`);
    const it0 = X.items[0];
    af(!!it0 && it0.dataId === quedaUno.id, `[10a] el único agotado de la ventana no ganó el primer lugar: salió «${it0 ? it0.dataId : '—'}»`);
    if (it0) af(it0.sello, `[10a] el único agotado de la ventana no lleva sello`);
    af(X.items.length === 3, `[10b] la tira quedó con ${X.items.length} miniaturas: el top no completó los lugares que sobraron`);
    af(X.items.slice(1).every((x) => !x.sello), `[10b] los lugares que llenó el top salieron sellados`);
    const restoTop = TOP_REAL.filter((id) => id !== X.grande.id && id !== quedaUno.id && X.univ.some((e) => e.id === id)).slice(0, 2);
    restoTop.forEach((id, i) => {
      const it = X.items[1 + i];
      af(!!it && it.dataId === id, `[10c] el lugar ${2 + i} le tocaba al top («${id}») y salió «${it ? it.dataId : '—'}»`);
      if (it && it.dataId === id) af(it.rank === '#' + (TOP_REAL.indexOf(id) + 1),
        `[10c] «${id}» llenó su lugar por el top y su chip dice «${it.rank || '(ninguno)'}»`);
    });
    af(/agotados/.test(X.fuente || '') && /top/.test(X.fuente || ''), `[10d] la fuente dice «${X.fuente}» y la tira se armó con las dos vías`);
    selloVsCard(X, '-mezcla');
  }

  // ══ [12] LAS TRES DECISIONES DE LAND-2c ══════════════════════════════════

  // [12a] SIN CHIP PARA QUIEN ENTRÓ POR AGOTADO.
  // Young Miko va #8 en el top real Y gana su lugar por la ventana. El chip le
  // comía el ancho al nombre («YOUNG …» en vez de «Young Miko»), y el sello ya
  // cuenta la historia. Los que entran POR el top sí lo conservan — eso lo
  // exigen [9b] y [10c], que corren en el mismo careo.
  const enTopYVentana = ventana.filter((e) => TOP_REAL.indexOf(e.id) >= 0);
  af(enTopYVentana.length > 0,
     `[12a] ningún agotado de la ventana está en el top: no se puede probar que el chip se retire`);
  enTopYVentana.forEach((e) => {
    const it = P.items.find((x) => x.dataId === e.id);
    af(!!it && !it.rank,
       `[12a] «${e.id}» entró por la ventana (va #${TOP_REAL.indexOf(e.id) + 1} en el top) y sale con chip «${it ? it.rank : '—'}»`);
  });

  // 🔒 CONTROL POSITIVO DE [12a], LOS DOS LADOS CON EL MISMO TOP SERVIDO.
  // Con TOP_REAL, BASE llena los 3 lugares desde el top y el agotado de la
  // ventana ni aparece: no hay contra qué comparar. Así que se sirve un top
  // CORTO que incluye al agotado — con dos ids el top no llena los 3 y BASE lo
  // saca por esa vía, con su chip. HEAD, con EXACTAMENTE el mismo top, lo saca
  // por la ventana y sin chip. La diferencia es la tuerca, no el montaje.
  const victima = enTopYVentana[0];
  if (victima) {
    const topCorto = [TOP_REAL.find((id) => id !== victima.id && H.univ.some((e) => e.id === id)), victima.id].filter(Boolean);
    const CB = await mirar(dirB, null, topCorto);
    const CH = await mirar(dirH, null, topCorto);
    limpio(CB, '-BASE-chip'); limpio(CH, '-HEAD-chip');
    const itCB = CB.items.find((x) => x.dataId === victima.id);
    const itCH = CH.items.find((x) => x.dataId === victima.id);
    console.log(`   chip · top corto [${topCorto.join(', ')}] · BASE «${itCB ? itCB.rank || '(sin chip)' : '(no sale)'}» → HEAD «${itCH ? itCH.rank || '(sin chip)' : '(no sale)'}»`);
    af(!!itCB && !!itCB.rank,
       `[12a] BASE tampoco le pone chip a «${victima.id}» con el top corto: el control positivo no prueba nada`);
    af(!!itCH && !itCH.rank,
       `[12a] HEAD le sigue poniendo chip a «${victima.id}», que entra por la ventana`);
  }

  // [12b] EL SELLO «PRÓXIMAMENTE» Y SU PUERTA.
  // Hoy ningún proxi llega por fecha (son de 2027), así que se SIEMBRA por el
  // top —que es como llegaría de verdad— y se despeja la ventana con
  // `listOnly`, igual que en [11].
  const unProxi = H.univ.find((e) => e.soloProxi);
  af(!!unProxi, `[12b] no hay ningún «próximamente» en el universo: el sello no se puede medir hoy`);
  if (unProxi) {
    const topSembrado = [unProxi.id].concat(TOP_REAL.filter((id) => id !== unProxi.id));
    const Q = await mirar(dirH, delante.concat(enBorde ? [enBorde.id] : []).map((id) => [id, '@listonly']), topSembrado);
    limpio(Q, '-proxi');
    console.log(`   proxi sembrado en el top · tira: ${Q.items.map((i) => i.nombre + (i.sello ? ' [AGOTADO]' : '') + (i.prox ? ' [PRÓXIMAMENTE]' : '') + ' · ' + i.fecha).join(' | ')}`);
    const itQ = Q.items.find((x) => x.dataId === unProxi.id);
    af(!!itQ, `[12b] «${unProxi.id}» va #1 en el top sembrado y no salió en la tira`);
    if (itQ) {
      af(itQ.prox, `[12b] «${unProxi.id}» es «próximamente» y su miniatura NO trae sello visible`);
      af(itQ.proxTxt.trim() === 'PRÓXIMAMENTE', `[12b] el sello de «${unProxi.id}» dice «${itQ.proxTxt.trim()}», no «PRÓXIMAMENTE»`);
      af(amarillo(itQ.proxFondo), `[12b] el sello de «${unProxi.id}» es ${itQ.proxFondo}, no el amarillo con que el catálogo pinta «Próximamente»`);
      af(!itQ.sello, `[12b] «${unProxi.id}» no está agotado y lleva TAMBIÉN el sello de agotado`);
      // 🔒 La puerta, medida contra la que toma la TARJETA REAL del catálogo.
      af(itQ.destino.ruta === 'waitlist',
         `[12b] tocar «${unProxi.id}» aterrizó en ${itQ.destino.ruta}, y su tarjeta del catálogo abre la lista de espera`);
      af(itQ.destino.ruta !== 'ficha', `[12b] un «próximamente» abrió el COTIZADOR`);
    }
    // 🔒 CONTROL POSITIVO: el mismo catálogo y el mismo top, en BASE.
    const QB = await mirar(dirB, delante.concat(enBorde ? [enBorde.id] : []).map((id) => [id, '@listonly']), topSembrado);
    limpio(QB, '-BASE-proxi');
    const itQB = QB.items.find((x) => x.dataId === unProxi.id);
    af(!!itQB, `[12b] «${unProxi.id}» tampoco sale en BASE: el control positivo no tiene contra qué comparar`);
    if (itQB) {
      af(!itQB.prox, `[12b] BASE ya sella los «próximamente»: el sello no es de esta tuerca`);
      af(itQB.destino.ruta === 'ficha',
         `[12b] BASE ya NO abre el cotizador con un «próximamente» (aterriza en ${itQB.destino.ruta}): la puerta no es de esta tuerca`);
    }
  }

  // [12c] EL AÑO EN LA FECHA, EN LOS DOS SENTIDOS.
  // Un evento de otro año imprime el año; uno del año corriente, no.
  const anioHoy = new Date().getFullYear();
  const deOtroAnio = H.univ.find((e) => Number(e.ds.slice(0, 4)) !== anioHoy);
  af(!!deOtroAnio, `[12c] todo el universo es del año corriente: el año en la fecha no se puede medir hoy`);
  if (deOtroAnio) {
    const topAnio = [deOtroAnio.id].concat(TOP_REAL.filter((id) => id !== deOtroAnio.id));
    const Y = await mirar(dirH, delante.concat(enBorde ? [enBorde.id] : []).map((id) => [id, '@listonly']), topAnio);
    limpio(Y, '-anio');
    console.log(`   fechas impresas · ${Y.items.map((i) => i.dataId + ': «' + i.fecha + '»').join(' | ')}`);
    const itY = Y.items.find((x) => x.dataId === deOtroAnio.id);
    af(!!itY, `[12c] «${deOtroAnio.id}» (${deOtroAnio.ds}) no salió en la tira`);
    if (itY) af(new RegExp('\\b' + deOtroAnio.ds.slice(0, 4) + '\\b').test(itY.fecha),
       `[12c] «${deOtroAnio.id}» es de ${deOtroAnio.ds.slice(0, 4)} y su fecha dice «${itY.fecha}», sin año`);
    // …y al revés: los del año corriente siguen cortitos.
    const delAnio = Y.items.filter((x) => { const e = Y.univ.find((u) => u.id === x.dataId);
      return e && Number(e.ds.slice(0, 4)) === anioHoy; });
    af(delAnio.length > 0, `[12c] en esa tira no quedó ningún evento del año corriente: el control al revés no se corrió`);
    delAnio.forEach((x) => af(!/\d{4}/.test(x.fecha),
      `[12c] «${x.dataId}» es de ${anioHoy} y su fecha dice «${x.fecha}»: el año sobra`));
    // 🔒 CONTROL POSITIVO: el mismo evento, el mismo top, en BASE, sin año.
    const YB = await mirar(dirB, delante.concat(enBorde ? [enBorde.id] : []).map((id) => [id, '@listonly']), topAnio);
    limpio(YB, '-BASE-anio');
    const itYB = YB.items.find((x) => x.dataId === deOtroAnio.id);
    af(!!itYB, `[12c] «${deOtroAnio.id}» tampoco sale en BASE: el control positivo no tiene contra qué comparar`);
    if (itYB) af(!/\d{4}/.test(itYB.fecha),
      `[12c] BASE ya imprime el año («${itYB.fecha}»): el año no es de esta tuerca`);
  }

  // ── [7] CONTROL POSITIVO: BASE TIENE QUE FALLAR ───────────────────────────
  const B = await mirar(dirB, null);
  limpio(B, '-BASE');
  const agB = new Set(B.univ.filter((e) => e.ag).map((e) => e.id));
  const espB = esperados(B);
  console.log(`   BASE · tarjeta grande: ${B.grande.id} · tira: ${B.items.map(i=>i.nombre).join(' · ')}  (+N ${B.masN})`);
  af(espB.some((e) => e.ag),
     `[7] BASE no tiene agotados próximos que mostrar: el control positivo no prueba nada`);
  // ⚠️ [LAND-2b] AQUÍ VIVÍAN [7a], [7b] Y [7c]: el control positivo de LAND-2
  // contra `e6633b1`, que exigía que BASE no sellara, omitiera a los agotados
  // próximos y contara distinto el «+N». La tuerca movió el BASE al merge de
  // #737, donde todo eso YA ESTÁ: esas tres aserciones pasaron a ser falsas por
  // construcción, no por un defecto.
  // No es un hueco de cobertura: el sello, el universo y el «+N» se siguen
  // exigiendo sobre HEAD en [1]…[6]; lo que cambió es contra qué pasado se mide
  // el arreglo. El control positivo se re-apunta al camino donde LAND-2b sí
  // cambia algo —el del top— en [7d] y [7e].

  // ⚠️ [LAND-2c] AQUÍ VIVÍAN [7d] Y [7e]: el control positivo de LAND-2b contra
  // `66527e9`, que exigía que BASE dejara fuera a los agotados de la ventana
  // con el top real y contara +46. La tuerca movió el BASE al merge de #738,
  // donde eso YA ESTÁ: las dos son falsas por construcción, no por un defecto.
  // Es la tercera vez que pasa lo mismo al mover el BASE, y el patrón es el
  // del libro: un control positivo caduca cuando su pasado se vuelve presente.
  // Lo que LAND-2b arregló se sigue exigiendo sobre HEAD en [8]…[11]; el
  // control positivo se re-apunta a lo que LAND-2c cambia, en [12].

  console.log(`\n   ${ok} verdes · ${mal} rojos`);
  if (mal) { console.log('\n   ROJOS:'); fallos.forEach((f) => console.log('   ✗ ' + f)); }
  else console.log('   ✅ todo verde');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('\n💥 el careo se cayó:', e.stack || e.message); process.exit(2); });
