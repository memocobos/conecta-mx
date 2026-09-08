// PULSEDOT-MIDE-1 · el costo del pulseDot de funciona.html, medido.
// Réplica del método de SCROLL-2: CPU frenada 4×, viewport 390×844, scroll de
// 2.600px, y mediana/p95/frames largos con la animación VIVA y APAGADA.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const RAIZ = '/Users/memocobos/conecta-mx';
const PUERTO = Number(process.env.PUERTO || 8731);
// Parametrizado a propósito: el sello de SCROLL-2 dice que para re-litigarlo hay
// que volver a MEDIR. Un instrumento que solo sabe medir UNA animación no deja
// re-litigar la de al lado.
const PAGINA   = process.env.PAGINA   || 'funciona.html';
const SELECTOR = process.env.SELECTOR || '.ftr-mini-dot';

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp', '.ico':'image/x-icon' };

function servir() {
  return new Promise((res, rej) => {
    const s = http.createServer((req, r) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(RAIZ, u === '/' ? 'index.html' : u);
      if (!f.startsWith(RAIZ)) { r.writeHead(403); return r.end(); }
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); return r.end('no'); }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
        r.end(d);
      });
    });
    // EADDRINUSE se GRITA: un servidor de otra corrida serviría OTRO commit.
    s.on('error', rej);
    s.listen(PUERTO, () => res(s));
  });
}

const mediana = (a) => { const s = a.slice().sort((x,y)=>x-y); return s.length%2 ? s[(s.length-1)/2] : (s[s.length/2-1]+s[s.length/2])/2; };
const pct = (a,p) => { const s = a.slice().sort((x,y)=>x-y); return s[Math.min(s.length-1, Math.floor(s.length*p))]; };
const r2 = (n) => Math.round(n*10)/10;

// Recoge deltas de requestAnimationFrame mientras corre `accion` en la página.
async function medir(page, ms, scrollear) {
  return page.evaluate(async ({ ms, scrollear }) => {
    const deltas = []; let prev = performance.now(); let parar = false;
    const paso = () => { const t = performance.now(); deltas.push(t - prev); prev = t; if (!parar) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
    const t0 = performance.now();
    if (scrollear) {
      const TOTAL = 2600; const dur = ms;
      await new Promise((res) => {
        const anim = () => {
          const k = Math.min(1, (performance.now() - t0) / dur);
          window.scrollTo(0, TOTAL * k);
          if (k < 1) requestAnimationFrame(anim); else res();
        };
        requestAnimationFrame(anim);
      });
    } else {
      await new Promise((res) => setTimeout(res, ms));
    }
    parar = true;
    await new Promise((r) => setTimeout(r, 50));
    return deltas.slice(1); // el primero arrastra el arranque
  }, { ms, scrollear });
}

(async () => {
  const srv = await servir();
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);

  await page.goto(`http://127.0.0.1:${PUERTO}/` + PAGINA, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  // ── CARDINALIDAD: la premisa del caso tiene que alcanzarse. Si el punto no
  //    existe o la animación no está corriendo, todo lo de abajo mide humo.
  const premisa = await page.evaluate((SEL) => {
    const el = document.querySelector(SEL);
    if (!el) return { existe: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { existe: true, n: document.querySelectorAll(SEL).length,
             animacion: cs.animationName, dur: cs.animationDuration, iter: cs.animationIterationCount,
             alto_pagina: document.documentElement.scrollHeight, y_del_punto: r.top + window.scrollY };
  }, SELECTOR);

  const throttle = async (r) => cdp.send('Emulation.setCPUThrottlingRate', { rate: r });
  const apagar = async (on) => page.evaluate(({ on, SEL }) => {
    let s = document.getElementById('__pulse_off');
    if (on) { if (!s) { s = document.createElement('style'); s.id = '__pulse_off';
      s.textContent = SEL + '{animation:none!important}'; document.head.appendChild(s); } }
    else if (s) s.remove();
    return getComputedStyle(document.querySelector(SEL)).animationName;
  }, { on, SEL: SELECTOR });

  // Control POSITIVO del instrumento: una animación cara de verdad. Si el arnés
  // no la ve, su «no cuesta nada» no vale nada.
  const sabotaje = async (on) => page.evaluate((on) => {
    let s = document.getElementById('__sabotaje');
    if (on) { if (!s) { s = document.createElement('style'); s.id = '__sabotaje';
      s.textContent = `@keyframes __sab{0%,100%{box-shadow:0 0 60px 30px rgba(255,0,0,.7);filter:blur(3px)}50%{box-shadow:0 0 90px 60px rgba(0,0,255,.7);filter:blur(9px)}}
        p,div,span,li,h1,h2,h3{animation:__sab .9s ease-in-out infinite!important}`;
      document.head.appendChild(s); } }
    else if (s) s.remove();
  }, on);

  const escenarios = [];
  const correr = async (nombre, scrollear, arms) => {
    const res = {};
    for (let rep = 0; rep < 5; rep++) {
      for (const [arm, prep] of Object.entries(arms)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await prep();
        await page.waitForTimeout(250);
        const d = await medir(page, 2600, scrollear);
        (res[arm] = res[arm] || []).push(...d);
      }
    }
    escenarios.push({ nombre, res });
  };

  await throttle(4);

  await correr('A · scroll de 2.600px (el método de SCROLL-2)', true, {
    'viva':    async () => { await sabotaje(false); await apagar(false); },
    'apagada': async () => { await sabotaje(false); await apagar(true); },
  });

  // El pie, QUIETO y a la vista: es el único estado donde el punto se pinta de
  // verdad. Medir solo el scroll podría dar «no cuesta» porque nunca se vio.
  await correr('B · pie a la vista, sin scroll', false, {
    'viva':    async () => { await sabotaje(false); await apagar(false); await page.evaluate((SEL) => document.querySelector(SEL).scrollIntoView({ block: 'center' }), SELECTOR); },
    'apagada': async () => { await sabotaje(false); await apagar(true);  await page.evaluate((SEL) => document.querySelector(SEL).scrollIntoView({ block: 'center' }), SELECTOR); },
  });

  await correr('C · CONTROL POSITIVO (sabotaje: animación cara de verdad)', true, {
    'sabotaje': async () => { await apagar(false); await sabotaje(true); },
    'limpio':   async () => { await sabotaje(false); await apagar(false); },
  });

  // ¿El punto estuvo A LA VISTA durante el scroll? Una animación fuera de
  // pantalla no cuesta, y eso cambiaría el significado del escenario A.
  await sabotaje(false); await apagar(false);
  const visibilidad = await page.evaluate(async (SEL) => {
    const el = document.querySelector(SEL);
    let vistas = 0, muestras = 0;
    for (let k = 0; k <= 20; k++) {
      window.scrollTo(0, 2600 * (k / 20));
      await new Promise((r) => requestAnimationFrame(r));
      const r = el.getBoundingClientRect();
      muestras++; if (r.bottom > 0 && r.top < window.innerHeight) vistas++;
    }
    return { vistas, muestras };
  }, SELECTOR);

  await nav.close(); srv.close();

  // ── REPORTE ──────────────────────────────────────────────────────────────
  console.log('PULSEDOT-MIDE-1 · ' + PAGINA + ' · ' + SELECTOR);
  console.log('  viewport 390×844 · CPU frenada 4× · 5 repeticiones por brazo\n');
  console.log('PREMISA (si esto falla, lo de abajo es humo):');
  console.log('  ' + SELECTOR + ' ×' + premisa.n + ' · animation-name=' + premisa.animacion +
              ' · ' + premisa.dur + ' · ' + premisa.iter);
  console.log('  alto de la página ' + premisa.alto_pagina + 'px · el punto vive en y=' + Math.round(premisa.y_del_punto) + 'px');
  console.log('  a la vista en ' + visibilidad.vistas + ' de ' + visibilidad.muestras + ' posiciones del scroll de 2.600px\n');

  for (const e of escenarios) {
    console.log(e.nombre);
    const armas = Object.keys(e.res);
    for (const a of armas) {
      const d = e.res[a];
      console.log('  ' + a.padEnd(9) + ' n=' + String(d.length).padStart(4) +
        '  mediana ' + String(r2(mediana(d))).padStart(5) + 'ms' +
        '  p95 ' + String(r2(pct(d, .95))).padStart(5) + 'ms' +
        '  >32ms: ' + d.filter((x) => x > 32).length +
        '  >50ms: ' + d.filter((x) => x > 50).length);
    }
    const [x, y] = armas;
    const dx = mediana(e.res[x]), dy = mediana(e.res[y]);
    const delta = dx - dy, pctD = dy ? (delta / dy) * 100 : 0;
    console.log('  Δ mediana (' + x + ' − ' + y + ') = ' + r2(delta) + 'ms  (' + r2(pctD) + '%)\n');
  }
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message); process.exit(1); });
