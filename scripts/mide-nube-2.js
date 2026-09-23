#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-nube-2.js — NUBE-2 · LOS DOS MODOS VENDEN, Y LO VENCIDO NO SE VENDE
//
// 🔒 EL RELOJ SE CONGELA DENTRO DEL NAVEGADOR. Todo lo que se mide aquí
// depende de DOS fronteras de tiempo —los 15 días del evento y la vigencia de
// la cotización— y las fechas del catálogo son fijas mientras «hoy» se mueve:
// un careo sin congelar diría cosas distintas según el día en que se corra, que
// es el rojo `[12a]` de `mide:tira-agotados` esperando su turno.
//
// 🔒 LOS DOS LADOS SON COMMITS.
//     BASE = 5af2da1  NUBE-1 en main: la nube existe, el index NO la bebe
//     HEAD = e595c63  los dos modos venden (el commit del MERGE)
//
// 🔒 SE ENTRA POR LA URL DEL CLIENTE y se aprietan los BOTONES del wizard: el
// total tiene que salir del camino de verdad, no de llamar a `calcular()`.
//
// Se corre:  npm run mide:nube-2
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
const BASE = process.env.BASE || '5af2da1';
const HEAD_SHA = process.env.HEAD_SHA || 'e595c63';

// ── EL RELOJ CONGELADO · DOS INSTANTES, Y CADA UNO MEDIDO ────────────────
// 🔴 NO EXISTE UN SOLO INSTANTE que sirva para los tres casos, y salió de medir
// el catálogo —no de suponerlo—. Los eventos de CDMX vivos con `noBus` son dos
// (vaiven 17-oct, coronacapital 20-nov) y los que quedan a 15 días o menos
// caen en diciembre: cuando uno está cerca, el otro ya pasó. Mi primera
// versión eligió `louist` «de cerca» a ojo y resultó estar a **191 días**: el
// rojo era de la premisa, no del código.
//
// HOY_A · 1-oct-2026 → `edc27` a 141 días (LEJOS, vendible) y `vaiven` a 16
//                      días (LEJOS y VIVO, que es lo que el caso `noBus` pide).
// HOY_B · 1-dic-2026 → `brunomars` a 3 días (DENTRO de los 15 → WhatsApp).
const HOY_A = Date.parse('2026-10-01T12:00:00-05:00');
const HOY_B = Date.parse('2026-12-01T12:00:00-05:00');
let HOY = HOY_A;
const EV_LEJOS = 'edc27';
const EV_CERCA = 'brunomars';
const EV_NOBUS = 'vaiven';
const EV_VUELO = 'arre';        // su paquete YA incluye el vuelo
const VIG = new Date(HOY_B + 5 * 864e5).toISOString();   // vigente en los DOS instantes
const VENC = new Date(HOY_A - 2 * 864e5).toISOString();  // vencida en los DOS

// La respuesta de `nube-vigente`, conmutable por escenario. Son las formas
// REALES del endpoint (se leyó su código, no se inventó el sobre).
const NUBE = {
  dos:        { ok: true, bus: { precio: 2650, vigente_hasta: VIG }, avion: { precio: 4750, vigente_hasta: VIG } },
  soloBus:    { ok: true, bus: { precio: 2650, vigente_hasta: VIG }, avion: null },
  soloAvion:  { ok: true, bus: null, avion: { precio: 4750, vigente_hasta: VIG } },
  ninguna:    { ok: true, bus: null, avion: null },
  // Vencida = el endpoint ya no la manda (filtra en la fuente). Se deja el
  // caso «me la mandan vencida» igual, para que el navegador no confíe.
  vencidas:   { ok: true, bus: { precio: 2650, vigente_hasta: VENC }, avion: { precio: 4750, vigente_hasta: VENC } },
  caida:      null,   // la red se cae
};
let ESCENARIO = 'dos';
let PEDIDOS = 0;

function servidor(raiz) {
  return http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (/nube-vigente/.test(u)) {
      PEDIDOS++;
      if (NUBE[ESCENARIO] === null) { r.destroy(); return; }   // red caída de verdad
      r.writeHead(200, { 'Content-Type': 'application/json' });
      return r.end(JSON.stringify(NUBE[ESCENARIO]));
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
        : /\.jpe?g$/.test(f) ? 'image/jpeg' : /\.png$/.test(f) ? 'image/png'
        : /\.webp$/.test(f) ? 'image/webp' : 'text/html; charset=utf-8';
      r.writeHead(200, { 'Content-Type': tipo }); r.end(b);
    });
  });
}

// 🔒 EL RELOJ, CONGELADO ANTES DE QUE CORRA UNA LÍNEA DE LA PÁGINA. Se
// reemplaza `Date` por un proxy que sigue siendo `Date` para todo lo demás
// (`parse`, `UTC`, los constructores con argumentos): lo único que cambia es
// «ahora». Congelar solo `Date.now` no bastaría — el sitio hace `new Date()`.
const CONGELAR = (t) => {
  const Real = Date;
  const Falso = new Proxy(Real, {
    construct(T, args) { return args.length ? new T(...args) : new T(t); },
    apply() { return new Real(t).toString(); },
  });
  Object.defineProperty(Falso, 'now', { value: () => t, writable: true });
  window.Date = Falso;
};

async function abrir(page, base, id) {
  await page.goto(base + '/' + id, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const ve = await page.evaluate(() => {
    const e = document.getElementById('onboard-bg');
    return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
  });
  if (ve) {
    await page.evaluate(() => { if (typeof skipOnboarding === 'function') skipOnboarding(); });
    await page.waitForTimeout(200);
  }
}
// Camina el wizard hasta el paso del transporte y devuelve los botones.
async function hastaTransporte(page) {
  const clic = async (sel) => {
    const l = page.locator(sel).first();
    await l.waitFor({ state: 'visible', timeout: 8000 });
    await l.click();
    await page.waitForTimeout(300);
  };
  await clic('#w-viajeros-card .wiz-btn');
  await clic('#w-pkg-card button');
  await clic('#w-zona-card button:not(#w-mapa-btn)');
  // La habitación viene PRE-MARCADA (medido en CARD-GUIA-1) y el paso del
  // transporte solo abre al apretarla: se aprieta, como hace el cliente.
  const hay = await page.locator('#w-hotel-card button').first().isVisible().catch(() => false);
  if (hay) await clic('#w-hotel-card button');
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const caja = document.getElementById('w-transport-card');
    const abierta = !!caja && getComputedStyle(caja).display !== 'none';
    const btns = [...document.querySelectorAll('#d-transport .z-btn')].map((b) => ({
      modo: b.getAttribute('data-t'),
      cost: b.getAttribute('data-cost'),
      txt: (b.innerText || '').replace(/\s+/g, ' ').trim(),
      wa: /wa\.me/.test(b.getAttribute('onclick') || ''),
      vende: /selTransporteBtn/.test(b.getAttribute('onclick') || ''),
      onclick: b.getAttribute('onclick') || '',
    }));
    return { abierta, btns, viaj: (typeof selViaj !== 'undefined') ? selViaj : null };
  });
}

(async () => {
  const b = sacar(BASE, 'n2-base'), h = sacar(HEAD_SHA, 'n2-head');
  console.log('CAREO NUBE-2 · los dos modos venden\n');
  console.log('  BASE ' + b.sha.slice(0, 7) + '  ·  HEAD ' + h.sha.slice(0, 7));
  console.log('  reloj congelado: ' + new Date(HOY).toISOString() + '\n');
  const sb = servidor(b.dir), sh = servidor(h.dir);
  await new Promise((ok) => sb.listen(0, ok));
  await new Promise((ok) => sh.listen(0, ok));
  const uB = 'http://127.0.0.1:' + sb.address().port;
  const uH = 'http://127.0.0.1:' + sh.address().port;
  const nav = await chromium.launch();
  const errores = [];
  const nueva = async () => {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.addInitScript(CONGELAR, HOY);
    p.on('pageerror', (e) => errores.push(String(e.message)));
    return { ctx, p };
  };

  try {
    // ══ [0] LAS PREMISAS: la frontera con eventos REALES ═══════════════════
    console.log('[0] las premisas del reloj y del catálogo');
    let { ctx, p } = await nueva();
    await p.goto(uH + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    const prem = await p.evaluate((ids) => {
      const out = {};
      out.ahora = Date.now();
      for (const id of ids) {
        const e = EV.find((x) => x.id === id);
        out[id] = e ? { ds: e.ds, dias: (typeof _diasEventoMx === 'function') ? _diasEventoMx(e.ds) : null,
                        noBus: !!e.noBus, inc: e.inc || [], st: e.st, cdmx: !!e.cdmx } : null;
      }
      return out;
    }, [EV_LEJOS, EV_CERCA, EV_NOBUS, EV_VUELO]);
    console.log('    reloj de la página: ' + new Date(prem.ahora).toISOString());
    af(prem.ahora === HOY, 'el reloj NO quedó congelado (' + new Date(prem.ahora).toISOString()
       + '): todo lo de abajo dependería del día en que se corra el careo');
    console.log('    en HOY_A · ' + EV_LEJOS + ': ' + prem[EV_LEJOS].dias + ' días · ' + EV_NOBUS + ': ' + prem[EV_NOBUS].dias + ' días');
    af(prem[EV_LEJOS] && prem[EV_LEJOS].dias > 15,
       'la premisa falla: ' + EV_LEJOS + ' está a ' + (prem[EV_LEJOS] && prem[EV_LEJOS].dias) + ' días y el caso «lejos» pide más de 15');
    af(prem[EV_NOBUS] && prem[EV_NOBUS].dias > 15,
       'la premisa falla: ' + EV_NOBUS + ' está a ' + (prem[EV_NOBUS] && prem[EV_NOBUS].dias)
       + ' días en HOY_A y el caso `noBus` necesita que esté LEJOS y vivo');
    await ctx.close();
    // Y la del instante B, con SU reloj: el caso de «cerca» no existe en HOY_A.
    HOY = HOY_B;
    ({ ctx, p } = await nueva());
    await p.goto(uH + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    const premB = await p.evaluate((id) => {
      const e = EV.find((x) => x.id === id);
      return e ? { dias: _diasEventoMx(e.ds), ds: e.ds, st: e.st } : null;
    }, EV_CERCA);
    console.log('    en HOY_B · ' + EV_CERCA + ': ' + (premB && premB.dias) + ' días');
    af(premB && premB.dias <= 15 && premB.dias >= 0,
       'la premisa falla: ' + EV_CERCA + ' está a ' + (premB && premB.dias) + ' días en HOY_B y el caso «cerca» pide 15 o menos');
    HOY = HOY_A;
    af(prem[EV_NOBUS] && prem[EV_NOBUS].noBus === true, EV_NOBUS + ' ya no trae `noBus`: el caso se quedó sin sujeto');
    af(prem[EV_VUELO] && prem[EV_VUELO].inc.some((x) => /vuelo|avi[oó]n/i.test(x)),
       EV_VUELO + ' ya no incluye el vuelo en su paquete: el caso se quedó sin sujeto');
    // 🔒 LA REGLA DERIVADA REPRODUCE EL CABLEADO POR ID, evento por evento.
    // Sin esto, cambiar `cur.id==='arre'` por un predicado sería un cambio de
    // comportamiento disfrazado de limpieza.
    const derivada = await p.evaluate(() => {
      const f = (e) => ((e && e.inc) || []).some((x) => /\bavi[oó]n\b|\bvuelo\b/i.test(String(x)));
      return { derivada: EV.filter(f).map((e) => e.id), porId: EV.filter((e) => e.id === 'arre').map((e) => e.id) };
    });
    console.log('    vuelo incluido → derivada: ' + JSON.stringify(derivada.derivada) + ' · por id: ' + JSON.stringify(derivada.porId));
    af(JSON.stringify(derivada.derivada) === JSON.stringify(derivada.porId),
       '🔴 la regla derivada del «qué incluye» NO reproduce el `id===\'arre\'` cableado: '
       + JSON.stringify(derivada) + ' — cambiarlo sería un cambio de comportamiento, no una limpieza');
    await ctx.close();

    // ══ [1] LOS DOS MODOS VENDEN ═══════════════════════════════════════════
    console.log('\n[1] los dos modos venden (cotización vigente, evento lejos)');
    ESCENARIO = 'dos'; PEDIDOS = 0;
    ({ ctx, p } = await nueva());
    await abrir(p, uH, EV_LEJOS);
    let t = await hastaTransporte(p);
    t.btns.forEach((x) => console.log('    · ' + String(x.modo).padEnd(6) + ' cost=' + String(x.cost)
      + ' vende=' + x.vende + ' wa=' + x.wa + '  «' + x.txt.replace(/\n/g, ' ') + '»'));
    af(t.abierta, 'el paso del transporte no se abrió: el camino del cliente se rompió');
    const bus = t.btns.find((x) => x.modo === 'bus'), avion = t.btns.find((x) => x.modo === 'avion');
    af(!!bus && bus.vende && !bus.wa, 'el bus no vende con cotización vigente: ' + JSON.stringify(bus));
    af(!!bus && Number(bus.cost) === 2650, 'el bus no pinta el precio VIVO (2650): ' + JSON.stringify(bus && bus.cost));
    af(!!bus && !/2,500|2500/.test(bus.txt), '🔴 el bus sigue pintando el $2,500 TECLEADO: ' + JSON.stringify(bus && bus.txt));
    af(!!avion && avion.vende && !avion.wa,
       '🔴 el avión NO vende: sigue siendo un link a WhatsApp. La decisión firmada es que vende igual que el bus');
    af(!!avion && Number(avion.cost) === 4750, 'el avión no pinta su precio vivo (4750): ' + JSON.stringify(avion && avion.cost));
    af(!!avion && /4,750/.test(avion.txt), 'el avión no enseña el precio con formato de la casa: ' + JSON.stringify(avion && avion.txt));
    af(t.btns.some((x) => x.modo === 'sin'), 'se perdió el botón «Sin transporte»');
    af(PEDIDOS === 1, 'la cotización se pidió ' + PEDIDOS + ' veces por carga y debía pedirse 1');

    // ══ [2] EL TOTAL, CONTRA EL DUEÑO DE LA ARITMÉTICA ════════════════════
    // 🔒 No se compara contra un número tecleado: se lee el total ANTES y
    // DESPUÉS de elegir el avión y se exige que la diferencia sea
    // `precio × viajeros` — que es lo que hace `calcular()` para el bus, en un
    // solo sitio y agnóstico al modo. Si el avión hubiera estrenado su propia
    // suma, aquí se vería.
    console.log('\n[2] el total del avión, por la misma multiplicación que el bus');
    // 🔴 EL «ANTES» ES «SIN TRANSPORTE», NO «NADA ELEGIDO». Mi primera versión
    // leyó el total antes de elegir cualquier transporte y valía 0 —porque
    // `calcular()` se sale temprano sin transporte en CDMX—, así que la Δ era
    // el total ENTERO y no el término del transporte. Se elige «Sin
    // transporte» ($0) y desde ahí se mide: eso aísla exactamente la suma que
    // esta tuerca toca.
    await p.locator('#d-transport .z-btn[data-t="sin"]').first().click();
    await p.waitForTimeout(350);
    const antes = await p.evaluate(() => ({ total: total, pp: costoXPersona, viaj: selViaj }));
    af(antes.total > 0, 'la premisa del total no se sostiene: con «Sin transporte» el total salió '
       + antes.total + ' y la Δ del transporte no se podría aislar');
    await p.locator('#d-transport .z-btn[data-t="avion"]').first().click();
    await p.waitForTimeout(400);
    const desp = await p.evaluate(() => ({ total: total, pp: costoXPersona, viaj: selViaj,
                                           sel: selTransporte, pintado: (document.getElementById('r-transport') || {}).textContent || '' }));
    console.log('    antes: total=' + antes.total + ' pp=' + antes.pp + ' · después: total=' + desp.total + ' pp=' + desp.pp
      + ' · viajeros=' + desp.viaj);
    af(desp.sel && desp.sel.cost === 4750 && /avi[oó]n/i.test(desp.sel.n || ''),
       'elegir el avión no dejó `selTransporte` con su costo: ' + JSON.stringify(desp.sel));
    af(desp.total - antes.total === 4750 * desp.viaj,
       '🔴 el total no creció `precio × viajeros` (Δ=' + (desp.total - antes.total) + ', esperado '
       + (4750 * desp.viaj) + '): el avión estrenó aritmética en vez de pasar por la del bus');
    af(desp.pp - antes.pp === 4750,
       'el costo por persona no creció el precio del avión (Δ=' + (desp.pp - antes.pp) + ')');
    af(/4,750/.test(desp.pintado) && /avi[oó]n/i.test(desp.pintado),
       'el renglón del total no nombra el avión con su precio: ' + JSON.stringify(desp.pintado));
    // Y el bus, por el mismo camino, tiene que dar lo mismo con SU precio.
    await p.locator('#d-transport .z-btn[data-t="bus"]').first().click();
    await p.waitForTimeout(400);
    const busSel = await p.evaluate(() => ({ total: total, viaj: selViaj, sel: selTransporte }));
    af(busSel.total - antes.total === 2650 * busSel.viaj,
       'el bus no suma por la misma regla (Δ=' + (busSel.total - antes.total) + '): los dos modos deben pasar por el mismo sitio');
    await ctx.close();

    // ══ [3] LA FRONTERA DE LOS 15 DÍAS, PARA LOS DOS ══════════════════════
    console.log('\n[3] la frontera de los 15 días aplica a los DOS modos');
    // ⚠️ CON EL RELOJ B: el caso de «cerca» no existe en el instante A, porque
    // los eventos de CDMX a 15 días o menos caen en diciembre. El reloj se
    // mueve al instante donde el caso ES REAL, en vez de fabricar un evento.
    ESCENARIO = 'dos'; HOY = HOY_B;
    ({ ctx, p } = await nueva());
    await abrir(p, uH, EV_CERCA);
    t = await hastaTransporte(p);
    t.btns.forEach((x) => console.log('    · ' + String(x.modo).padEnd(6) + ' vende=' + x.vende + ' wa=' + x.wa));
    const bC = t.btns.find((x) => x.modo === 'bus'), aC = t.btns.find((x) => x.modo === 'avion');
    af(!bC || (bC.wa && !bC.vende),
       'a 11 días del evento el bus sigue vendiendo: la frontera firmada de los 15 días se rompió');
    af(!!aC && aC.wa && !aC.vende,
       '🔴 a 11 días del evento el AVIÓN vende con el precio del lunes: cerca del evento ese precio ya no '
       + 'aguanta y cotiza un humano — es la misma regla del bus, extendida');
    af(!!bC && /8119771072/.test(bC.onclick), 'el bus cercano no manda a SU WhatsApp (8119771072)');
    af(!!aC && /8132321405/.test(aC.onclick), 'el avión cercano no manda a SU WhatsApp (8132321405)');
    await ctx.close();
    HOY = HOY_A;

    // ══ [4] FAIL-SOFT POR MODO, y lo VENCIDO no se vende ══════════════════
    console.log('\n[4] fail-soft POR MODO');
    for (const [esc, espera] of [
      ['soloBus',   { bus: 'vende', avion: 'wa' }],
      ['soloAvion', { bus: 'wa',    avion: 'vende' }],
      ['ninguna',   { bus: 'wa',    avion: 'wa' }],
      ['vencidas',  { bus: 'wa',    avion: 'wa' }],
      ['caida',     { bus: 'wa',    avion: 'wa' }],
    ]) {
      ESCENARIO = esc;
      ({ ctx, p } = await nueva());
      await abrir(p, uH, EV_LEJOS);
      const tt = await hastaTransporte(p);
      const g = (m) => { const x = tt.btns.find((y) => y.modo === m); return !x ? 'ausente' : (x.vende ? 'vende' : (x.wa ? 'wa' : '?')); };
      console.log('    ' + esc.padEnd(10) + ' → bus: ' + g('bus') + ' · avión: ' + g('avion'));
      af(g('bus') === espera.bus, esc + ': el bus quedó «' + g('bus') + '» y se esperaba «' + espera.bus + '»');
      af(g('avion') === espera.avion, esc + ': el avión quedó «' + g('avion') + '» y se esperaba «' + espera.avion + '»');
      await ctx.close();
    }
    // 🔒 EL CONTROL POSITIVO DE LA VENCIDA, EN EL BOTÓN Y EN PAR. Que el
    // escenario `vencidas` dé WhatsApp solo vale si el MISMO evento con la
    // MISMA cotización pero VIGENTE da precio: si los dos dieran WhatsApp, el
    // careo no distinguiría «rehusé lo vencido» de «no vendo nunca».
    // ⚠️ Mi primera versión puso aquí un `af(true, …)` de ancla — una aserción
    // que NO PUEDE FALLAR no es una aserción, y encima inflaba la cuenta de
    // verdes. Se mide el par de verdad.
    const par = {};
    for (const esc of ['dos', 'vencidas']) {
      ESCENARIO = esc;
      ({ ctx, p } = await nueva());
      await abrir(p, uH, EV_LEJOS);
      const tp = await hastaTransporte(p);
      par[esc] = tp.btns.filter((x) => x.modo !== 'sin').map((x) => x.modo + ':' + (x.vende ? 'vende' : 'wa')).join(' ');
      await ctx.close();
    }
    console.log('    el par: vigente → ' + par.dos + '  ·  vencida → ' + par.vencidas);
    af(par.dos === 'bus:vende avion:vende',
       'el brazo VIGENTE del control no vende los dos: ' + par.dos + ' — sin eso, el «wa» de la vencida no prueba nada');
    af(par.vencidas === 'bus:wa avion:wa', 'el brazo VENCIDO del control vende: ' + par.vencidas);
    af(par.dos !== par.vencidas,
       'vigente y vencida dan el MISMO resultado: el careo no distingue «rehusé lo vencido» de «no vendo nunca»');

    // ══ [5] LO QUE NO SE TOCA ═════════════════════════════════════════════
    console.log('\n[5] lo que no se toca: noBus y el vuelo incluido');
    ESCENARIO = 'dos';
    ({ ctx, p } = await nueva());
    await abrir(p, uH, EV_NOBUS);
    const tN = await hastaTransporte(p);
    console.log('    ' + EV_NOBUS + ' (noBus) → ' + JSON.stringify(tN.btns.map((x) => x.modo + ':' + (x.vende ? 'vende' : 'wa'))));
    af(!tN.btns.some((x) => x.modo === 'bus'), 'un evento con `noBus` pinta el botón del autobús');
    af(tN.btns.some((x) => x.modo === 'avion' && x.vende),
       'en un evento con `noBus` el avión debía vender (es el único transporte con precio): ' + JSON.stringify(tN.btns));
    await ctx.close();
    // El del vuelo incluido: su avión NO vende, o le cobraría el vuelo dos
    // veces. Se mide por la FUNCIÓN, porque `arre` está agotado y su card no
    // abre el cotizador — y decirlo es parte del careo.
    ({ ctx, p } = await nueva());
    await p.goto(uH + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    const vueloInc = await p.evaluate((id) => {
      const e = EV.find((x) => x.id === id);
      return { incluido: nubeVueloIncluido(e), st: e.st };
    }, EV_VUELO);
    console.log('    ' + EV_VUELO + ' → vuelo incluido: ' + vueloInc.incluido + ' (st=' + JSON.stringify(vueloInc.st) + ')');
    af(vueloInc.incluido === true,
       '🔴 el evento cuyo paquete INCLUYE el vuelo no se reconoce: el sitio le vendería el vuelo DOS VECES');
    // Y el caso simétrico, para que la regla no sea «siempre sí»: un evento de
    // CDMX normal NO tiene el vuelo incluido.
    const noInc = await p.evaluate((id) => nubeVueloIncluido(EV.find((x) => x.id === id)), EV_LEJOS);
    af(noInc === false, 'la regla del vuelo incluido dice SÍ de un evento normal: entonces no distingue nada');
    await ctx.close();

    // ══ [6] CONTROL POSITIVO · BASE ═══════════════════════════════════════
    // En BASE la nube YA existe (NUBE-1 está en main) pero el index NO la
    // bebe: el bus pinta su $2,500 tecleado y el avión es un link. Sin este
    // par, el verde de [1] no distingue «lo cablé» de «ya estaba».
    console.log('\n[6] CONTROL POSITIVO · el mismo camino en BASE');
    ESCENARIO = 'dos'; PEDIDOS = 0;
    ({ ctx, p } = await nueva());
    await abrir(p, uB, EV_LEJOS);
    const tB = await hastaTransporte(p);
    tB.btns.forEach((x) => console.log('    · ' + String(x.modo).padEnd(6) + ' cost=' + String(x.cost) + ' vende=' + x.vende + ' wa=' + x.wa));
    const bB = tB.btns.find((x) => x.modo === 'bus'), aB = tB.btns.find((x) => x.modo === 'avion');
    af(!!bB && Number(bB.cost) === 2500, 'la premisa del ANTES no se sostiene: en BASE el bus no pinta el $2,500 tecleado');
    af(!!aB && aB.wa && !aB.vende, 'en BASE el avión ya vendía: entonces [1] no prueba nada');
    af(PEDIDOS === 0, 'BASE le pidió la cotización a la nube ' + PEDIDOS + ' vez(ces): no debería conocerla');
    await ctx.close();

    af(errores.length === 0, 'la página tiró ' + errores.length + ' error(es) de JS: ' + errores.slice(0, 3).join(' · '));
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
