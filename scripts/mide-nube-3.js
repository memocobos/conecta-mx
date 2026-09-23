#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-nube-3.js — NUBE-3 · EL HISTORIAL QUE RESUELVE LA DISPUTA
//
// La pregunta que esta tuerca tiene que contestar bien es de DINERO: «a mí me
// dijeron $X». Así que el careo mide las tres respuestas posibles con sus
// nombres, y sobre todo la que esta casa ya pagó una vez — «la nube aún no
// existía», que NO es «nunca cambió».
//
// 🔒 LOS DOS LADOS SON COMMITS.
//     BASE = e595c63  NUBE-2 en main: la nube vende, pero no se puede consultar
//     HEAD = df2d973  el historial y el renglón del Radar
//
// 🔒 EL RELOJ SE CONGELA: todo aquí es una frontera de vigencia.
//
// Se corre:  npm run mide:nube-3
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
const BASE = process.env.BASE || 'e595c63';
const HEAD_SHA = process.env.HEAD_SHA || 'df2d973';

// ── EL HISTORIAL SEMBRADO ─────────────────────────────────────────────────
// Dos semanas de bus con un HUECO entre ellas, y el avión naciendo MÁS TARDE.
// El hueco y el nacimiento tardío son los dos casos que no se pueden fabricar
// con una sola fila, y son justo los que muerden.
const iso = (s) => new Date(Date.parse(s)).toISOString();
const NACE_BUS = '2026-09-07T00:00:00-05:00';
const FILAS = [
  { id: 'b1', modo: 'bus', precio_pp: 2300, vigente_desde: iso(NACE_BUS),
    vigente_hasta: iso('2026-09-13T23:59:00-05:00'), nota: 'primera del bus',
    capturado_por: 'bulma@conectareynosa.mx', creado_en: iso('2026-09-07T09:00:00-05:00') },
  { id: 'b2', modo: 'bus', precio_pp: 2500, vigente_desde: iso('2026-09-21T00:00:00-05:00'),
    vigente_hasta: iso('2026-09-27T23:59:00-05:00'), nota: null,
    capturado_por: 'milk@conectareynosa.mx', creado_en: iso('2026-09-21T08:30:00-05:00') },
  { id: 'a1', modo: 'avion', precio_pp: 4800, vigente_desde: iso('2026-09-21T00:00:00-05:00'),
    vigente_hasta: iso('2026-09-27T23:59:00-05:00'), nota: 'con escala',
    capturado_por: 'milk@conectareynosa.mx', creado_en: iso('2026-09-21T08:31:00-05:00') },
];
// Los días que se preguntan, cada uno para un estado distinto.
const DIA_DENTRO = '2026-09-10';   // bus: REGÍA (2300) · avión: aún no existía
const DIA_HUECO  = '2026-09-17';   // bus: VENCIDA ese día · avión: aún no existía
const DIA_ANTES  = '2026-08-01';   // los dos: la nube aún no existía

let SIN_TABLA = false;

function servidor(raiz) {
  return http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (/admin-nube/.test(u)) {
      let cuerpo = '';
      q.on('data', (c) => { cuerpo += c; });
      return q.on('end', () => {
        r.writeHead(200, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify({ ok: true, __eco: cuerpo }));
      });
    }
    if (/\.netlify\/functions\//.test(u)) {
      q.on('data', () => {});
      return q.on('end', () => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{"ok":true}'); });
    }
    const f = path.join(raiz, decodeURIComponent(u).replace(/^\//, '') || 'index.html');
    fs.readFile(f, (e, bb) => {
      if (e) { r.writeHead(404); return r.end('no'); }
      const tipo = /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'text/html; charset=utf-8';
      r.writeHead(200, { 'Content-Type': tipo }); r.end(bb);
    });
  });
}

(async () => {
  const b = sacar(BASE, 'n3-base'), h = sacar(HEAD_SHA, 'n3-head');
  console.log('CAREO NUBE-3 · el historial que resuelve la disputa\n');
  console.log('  BASE ' + b.sha.slice(0, 7) + '  ·  HEAD ' + h.sha.slice(0, 7) + '\n');

  // ══ [1] EL ENDPOINT · los tres estados, por el handler REAL ═════════════
  console.log('[1] el endpoint `historial`, por el handler REAL');
  const correr = async (body, filas) => {
    const pedidos = [];
    global.fetch = async (url, opts) => {
      const met = (opts && opts.method) || 'GET';
      pedidos.push(met + ' ' + String(url).replace(/^.*rest\/v1\//, '').split('?')[0]);
      if (SIN_TABLA) return { ok: false, status: 404, text: async () => 'relation does not exist', json: async () => ({}) };
      const m = /modo=eq\.([a-z]+)/.exec(String(url));
      if (!m) throw new Error('la red falsa exige el filtro por modo: ' + url);
      const out = (filas || FILAS).filter((x) => x.modo === m[1]);
      return { ok: true, status: 200, json: async () => out, text: async () => '' };
    };
    process.env.SUPABASE_URL_KAMEHOUSE = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
    process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
    const va = require.resolve(path.join(h.dir, 'netlify/functions/_lib/verify-admin.js'));
    require.cache[va] = { id: va, filename: va, loaded: true, exports: {
      corsCheck: () => 'https://conectareynosa.mx',
      verifyAdminAuthLive: async (ev, roles) => ({ valid: true, roles, user: { id: 'u1', correo: 'bulma@conectareynosa.mx', rol: 'bulma' } }),
    } };
    for (const f of ['admin-nube.js', '_lib/nube.js']) delete require.cache[require.resolve(path.join(h.dir, 'netlify/functions', f))];
    const mod = require(path.join(h.dir, 'netlify/functions/admin-nube.js'));
    const res = await mod.handler({
      httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify(body),
    });
    return { res, d: JSON.parse(res.body || '{}'), pedidos };
  };

  const r1 = await correr({ accion: 'historial', dia: DIA_DENTRO });
  console.log('    ' + DIA_DENTRO + ' → bus: ' + r1.d.modos.bus.estado + '/' + (r1.d.modos.bus.fila && r1.d.modos.bus.fila.precio)
    + ' · avión: ' + r1.d.modos.avion.estado);
  af(r1.res.statusCode === 200 && r1.d.ok === true, 'el historial no contestó 200/ok: ' + r1.res.body.slice(0, 160));
  af(r1.d.modos.bus.estado === 'vigente' && r1.d.modos.bus.fila.precio === 2300,
     'el ' + DIA_DENTRO + ' debía regir el bus de $2,300 y salió ' + r1.d.modos.bus.estado);
  // 🔴 EL CASO DE OMAR, por delante: ese día el AVIÓN todavía no existía.
  af(r1.d.modos.avion.estado === 'antes_del_nacimiento',
     '🔴 el avión el ' + DIA_DENTRO + ' contestó «' + r1.d.modos.avion.estado + '» y ese día NO EXISTÍA: '
     + 'confundir «yo todavía no existía» con «nunca cambió» es lo que hizo que /rol cotizara el precio de HOY '
     + 'para un separo pasado');
  af(r1.d.modos.avion.fila === null, 'el estado «antes del nacimiento» trae una fila que citar, y no debería');
  // El dato que resuelve la disputa viaja completo.
  const f1 = r1.d.modos.bus.fila;
  af(f1 && f1.capturado_por === 'bulma@conectareynosa.mx', 'la respuesta no dice QUIÉN capturó: ' + JSON.stringify(f1 && f1.capturado_por));
  af(f1 && f1.vigente_desde && f1.vigente_hasta, 'la respuesta no trae la vigencia completa: ' + JSON.stringify(f1));
  af(f1 && f1.nota === 'primera del bus', 'la nota del capturador no viaja: ' + JSON.stringify(f1 && f1.nota));

  const r2 = await correr({ accion: 'historial', dia: DIA_HUECO });
  console.log('    ' + DIA_HUECO + ' → bus: ' + r2.d.modos.bus.estado + ' (última: '
    + (r2.d.modos.bus.fila && r2.d.modos.bus.fila.precio) + ')');
  af(r2.d.modos.bus.estado === 'vencida',
     'el ' + DIA_HUECO + ' cayó en el HUECO entre dos semanas y debía decir «vencida», no «' + r2.d.modos.bus.estado + '»');
  af(r2.d.modos.bus.fila && r2.d.modos.bus.fila.precio === 2300,
     'el hueco no enseña la ÚLTIMA que murió antes ($2,300): ' + JSON.stringify(r2.d.modos.bus.fila && r2.d.modos.bus.fila.precio));

  const r3 = await correr({ accion: 'historial', dia: DIA_ANTES });
  console.log('    ' + DIA_ANTES + ' → bus: ' + r3.d.modos.bus.estado + ' · avión: ' + r3.d.modos.avion.estado);
  af(r3.d.modos.bus.estado === 'antes_del_nacimiento' && r3.d.modos.avion.estado === 'antes_del_nacimiento',
     'un día anterior a TODO contestó ' + JSON.stringify([r3.d.modos.bus.estado, r3.d.modos.avion.estado]));
  af(Number(r3.d.modos.bus.nacimiento) === Date.parse(NACE_BUS),
     'el nacimiento del bus no es su vigencia más antigua: ' + JSON.stringify(r3.d.modos.bus.nacimiento));

  // Un modo sin NINGUNA fila: «sin_datos», que no es lo mismo que «no existía».
  const r4 = await correr({ accion: 'historial', dia: DIA_DENTRO }, FILAS.filter((x) => x.modo === 'bus'));
  af(r4.d.modos.avion.estado === 'sin_datos',
     'un modo que nunca se cotizó contestó «' + r4.d.modos.avion.estado + '» y debía decir «sin_datos»');
  // 🔒 CONTROL DEL INSTRUMENTO: los cuatro estados SALEN de verdad en esta
  // corrida. Si el endpoint contestara siempre lo mismo, las aserciones de
  // arriba pasarían por coincidencia.
  const vistos = new Set([r1.d.modos.bus.estado, r1.d.modos.avion.estado, r2.d.modos.bus.estado, r4.d.modos.avion.estado]);
  console.log('    estados distintos vistos: ' + JSON.stringify([...vistos]));
  af(vistos.size === 4, 'el endpoint solo produjo ' + vistos.size + ' estado(s) distinto(s) ('
     + JSON.stringify([...vistos]) + '): con menos de cuatro, no distingue los casos que dice distinguir');

  // ── LA MORDIDA DE FECHAS: el día se lee en Reynosa, no en Greenwich ─────
  // `Date.parse('2026-09-10')` es medianoche UTC = el 9 a las 19:00 en
  // Reynosa. Si el endpoint leyera así, preguntar por el 10 contestaría por el
  // 9 — y en la frontera de una vigencia eso cambia la respuesta.
  const nacimientoJusto = [{ id: 'x', modo: 'bus', precio_pp: 999,
    vigente_desde: iso('2026-09-10T00:00:00-05:00'), vigente_hasta: iso('2026-09-16T23:59:00-05:00'),
    nota: null, capturado_por: 'x', creado_en: iso('2026-09-10T00:00:00-05:00') }];
  const r5 = await correr({ accion: 'historial', dia: '2026-09-10' }, nacimientoJusto);
  console.log('    el DÍA EXACTO del nacimiento (2026-09-10) → ' + r5.d.modos.bus.estado);
  af(r5.d.modos.bus.estado === 'vigente',
     '🔴 preguntar por el DÍA EXACTO en que nació la cotización contestó «' + r5.d.modos.bus.estado
     + '»: el día se está leyendo en Greenwich y no en Reynosa — la mordida de `toISOString()`');
  // Las guardas del día, y la acción en su lista.
  for (const [etq, body, pedazo] of [
    ['sin día', { accion: 'historial' }, /d[ií]a/i],
    ['día basura', { accion: 'historial', dia: 'el lunes pasado' }, /no se entiende/i],
  ]) {
    const r = await correr(body);
    af(r.res.statusCode === 400, etq + ': se esperaba 400 y contestó ' + r.res.statusCode);
    af(pedazo.test(String(r.d.error || '')), etq + ': el error no dice qué falta («' + r.d.error + '»)');
  }
  // 🔒 SOLO LEE: ni un método que no sea GET contra la tabla.
  af(!r1.pedidos.some((p) => /^(POST|PATCH|PUT|DELETE)/.test(p)),
     'el historial ESCRIBIÓ en la tabla: ' + JSON.stringify(r1.pedidos));
  af(r1.pedidos.length === 2, 'el historial pidió ' + r1.pedidos.length + ' veces y debía pedir 2 (una por modo)');

  // ══ [2] LA PANTALLA · los tres estados ROTULADOS ════════════════════════
  console.log('\n[2] la pantalla: los estados con su nombre');
  const markup = (() => {
    const html = fs.readFileSync(path.join(h.dir, 'kamehouse.html'), 'utf8');
    const i = html.indexOf('<div class="page" id="page-nube"');
    if (i < 0) throw new Error('no encontré page-nube');
    let k = i, prof = 0;
    while (k < html.length) {
      const sig = html.indexOf('<', k);
      if (sig < 0) break;
      if (html.startsWith('<div', sig)) prof++;
      else if (html.startsWith('</div', sig)) { prof--; if (prof === 0) return html.slice(i, html.indexOf('>', sig) + 1); }
      k = sig + 1;
    }
    throw new Error('page-nube no cierra');
  })();
  af(/id="nube-q-dia"/.test(markup) && /nubeConsultar\(\)/.test(markup),
     'el markup de la consulta no está en la pantalla: el careo mediría una página vacía');
  const pagina = '<!doctype html><meta charset="utf-8"><body>' + markup
    + '<script>window.__resp=null;window.__envios=[];'
    + 'function khAdminFetch(u,o){window.__envios.push(JSON.parse(o.body));'
    + 'return Promise.resolve({ok:true,json:function(){return Promise.resolve(window.__resp)}});}'
    + 'function showToast(){};function khErrorCarga(c,q,f,e){c.innerHTML="ERR:"+String(e&&e.message||e);}'
    + '<\/script><script src="/kamehouse-nube.js"><\/script></body>';
  const srv = http.createServer((q, r) => {
    if (q.url.indexOf('/kamehouse-nube.js') === 0) {
      r.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return r.end(fs.readFileSync(path.join(h.dir, 'kamehouse-nube.js')));
    }
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(pagina);
  });
  await new Promise((ok) => srv.listen(0, ok));
  const nav = await chromium.launch();
  const page = await (await nav.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errsJS = [];
  page.on('pageerror', (e) => errsJS.push(String(e.message)));
  try {
    await page.goto('http://127.0.0.1:' + srv.address().port + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(200);
    // Las tres respuestas REALES del endpoint se le dan a la pantalla tal
    // cual: el careo no fabrica una forma propia.
    const pinta = async (resp, dia) => {
      await page.evaluate((r) => { window.__resp = r; }, resp);
      await page.evaluate((d) => { document.getElementById('nube-q-dia').value = d; }, dia);
      await page.evaluate(() => nubeConsultar());
      await page.waitForTimeout(150);
      return page.evaluate(() => (document.getElementById('nube-q-res').textContent || '').replace(/\s+/g, ' '));
    };
    const t1 = await pinta(r1.d, DIA_DENTRO);
    console.log('    dentro  → ' + t1.slice(0, 120));
    af(/REG[IÍ]A ESE D[IÍ]A/i.test(t1), 'el estado «vigente» no se rotula: ' + t1.slice(0, 80));
    af(/\$2,300/.test(t1), 'no se pinta el precio de ese día');
    af(/bulma@conectareynosa\.mx/.test(t1), 'no se pinta QUIÉN capturó: sin eso la disputa no se resuelve leyendo');
    af(/vigencia:/.test(t1), 'no se pinta la vigencia completa');
    af(/LA NUBE A[UÚ]N NO EXIST[IÍ]A/i.test(t1),
       '🔴 el avión de ese día no se rotula como «aún no existía»: ' + t1.slice(0, 160));
    const t2 = await pinta(r2.d, DIA_HUECO);
    console.log('    hueco   → ' + t2.slice(0, 120));
    af(/VENCIDA ESE D[IÍ]A/i.test(t2), 'el hueco no se rotula como vencida: ' + t2.slice(0, 80));
    af(/mandaba al WhatsApp/i.test(t2),
       'el hueco no dice qué PASABA ese día en el sitio: el estado sin su consecuencia no se puede leer');
    const t3 = await pinta(r3.d, DIA_ANTES);
    console.log('    antes   → ' + t3.slice(0, 120));
    af(/no es que no cambiara de precio/i.test(t3),
       '🔴 el estado «antes del nacimiento» no lo DICE con palabras: es la cicatriz de Omar y tiene que '
       + 'distinguirse de «nunca cambió»');
    // Y sin día no se pide nada.
    const sinDia = await page.evaluate(async () => {
      window.__envios = [];
      document.getElementById('nube-q-dia').value = '';
      await nubeConsultar();
      return { envios: window.__envios.length, txt: document.getElementById('nube-q-res').textContent };
    });
    af(sinDia.envios === 0, 'consultó sin día: ' + sinDia.envios + ' envío(s)');
    af(/Elige el d[ií]a/i.test(sinDia.txt), 'sin día no dice qué falta: ' + JSON.stringify(sinDia.txt));
    // La pantalla PIDE con la acción y el día, y nada más.
    const env = await page.evaluate(async () => {
      window.__envios = []; window.__resp = null;
      document.getElementById('nube-q-dia').value = '2026-09-10';
      await nubeConsultar().catch(() => {});
      return window.__envios;
    });
    af(env.length === 1 && env[0].accion === 'historial' && env[0].dia === '2026-09-10',
       'la pantalla no pide el historial con su día: ' + JSON.stringify(env));
    af(errsJS.length === 0, 'la pantalla tiró errores de JS: ' + errsJS.slice(0, 3).join(' · '));
  } finally {
    await nav.close(); srv.close();
  }

  // ══ [3] EL RENGLÓN DEL RADAR · se calla cuando no hay nada que decir ════
  console.log('\n[3] el renglón del Radar');
  const radar = fs.readFileSync(path.join(h.dir, 'kamehouse-radar.js'), 'utf8');
  const fn = radar.slice(radar.indexOf('async function _radarNubeAviso'), radar.indexOf('async function loadRadarAlertas'));
  af(fn.length > 200, 'no encontré `_radarNubeAviso` en el Radar');
  // Se ejecuta la función REAL con un DOM mínimo y respuestas conmutables.
  const correrAviso = async (resp) => {
    const nav2 = await chromium.launch();
    const p2 = await (await nav2.newContext()).newPage();
    await p2.setContent('<body><div id="rdr-nube-aviso" style="display:none"></div></body>');
    const out = await p2.evaluate(async ([cuerpo, r]) => {
      window.RAD_TZ = 'America/Matamoros';
      window.khAdminFetch = () => Promise.resolve({ ok: r !== null, json: () => Promise.resolve(r) });
      window.showHerramienta = () => {};
      eval(cuerpo);
      await _radarNubeAviso();
      const c = document.getElementById('rdr-nube-aviso');
      return { display: c.style.display, txt: (c.textContent || '').replace(/\s+/g, ' ') };
    }, [fn, resp]);
    await nav2.close();
    return out;
  };
  const ahora = Date.parse('2026-09-24T10:00:00-05:00');
  const vig = { precio: 2500, vigente_hasta: iso('2026-09-27T23:59:00-05:00'), capturado_por: 'bulma@x' };
  const a1 = await correrAviso({ ok: true, ahora, modos: { bus: { vigente: vig, ultimas: [vig] }, avion: { vigente: vig, ultimas: [vig] } } });
  console.log('    los dos vigentes → display=' + JSON.stringify(a1.display));
  af(a1.display === 'none',
     '🔴 el aviso se pinta con los DOS modos vigentes: un aviso permanente se vuelve parte del mueble y '
     + 'deja de avisar');
  const a2 = await correrAviso({ ok: true, ahora, modos: {
    bus: { vigente: vig, ultimas: [vig] },
    avion: { vigente: null, ultimas: [{ precio: 4800, vigente_hasta: iso('2026-09-20T23:59:00-05:00') }] } } });
  console.log('    solo el avión vencido → ' + a2.txt.slice(0, 120));
  af(a2.display === '', 'con un modo vencido el aviso no se pinta');
  af(/avi[oó]n/i.test(a2.txt) && !/autob[uú]s/i.test(a2.txt),
     'el aviso no nombra SOLO el modo vencido: ' + a2.txt.slice(0, 120));
  af(/NO se vende|cae al WhatsApp/i.test(a2.txt),
     'el aviso no dice la CONSECUENCIA en el sitio: el hecho sin su consecuencia no le dice nada a nadie');
  const a3 = await correrAviso({ ok: true, ahora, modos: {
    bus: { vigente: null, ultimas: [] }, avion: { vigente: null, ultimas: [] } } });
  af(a3.display === '' && /nunca se ha cotizado/i.test(a3.txt),
     'con los dos sin cotizar nunca, el aviso no lo dice: ' + a3.txt.slice(0, 120));
  // Fail-soft CALLADO: si no se puede leer, no se inventa aviso.
  const a4 = await correrAviso(null);
  af(a4.display === 'none' && !a4.txt.trim(),
     'con la lectura caída el Radar pinta un aviso inventado: ' + JSON.stringify(a4));
  // 🔒 Y NO SE METE EN LA LISTA DE ALERTAS GUARDADAS.
  af(/rdr-nube-aviso/.test(radar) && !/ral-list[^\n]*nube/.test(radar),
     'el aviso derivado se está metiendo en la lista de alertas guardadas, que tienen id y «vista»');

  // ══ [4] CONTROL POSITIVO · BASE ═════════════════════════════════════════
  console.log('\n[4] CONTROL POSITIVO · BASE');
  const adminBase = fs.readFileSync(path.join(b.dir, 'netlify/functions/admin-nube.js'), 'utf8');
  af(!/'historial'/.test(adminBase), 'BASE ya tiene la acción `historial`: [1] no prueba nada');
  af(!/nube-q-dia/.test(fs.readFileSync(path.join(b.dir, 'kamehouse.html'), 'utf8')),
     'BASE ya tiene la consulta en pantalla');
  af(!/_radarNubeAviso/.test(fs.readFileSync(path.join(b.dir, 'kamehouse-radar.js'), 'utf8')),
     'BASE ya tiene el renglón del Radar');
  // Y la premisa de la serie: `regiaEl` ya existía en BASE (es de NUBE-1), así
  // que esta tuerca NO la re-implementó: la usó.
  af(/regiaEl/.test(fs.readFileSync(path.join(b.dir, 'netlify/functions/_lib/nube.js'), 'utf8')),
     'la premisa falla: `regiaEl` no venía de NUBE-1, así que no se puede afirmar que esta tuerca le preguntó al dueño');
  const libHead = fs.readFileSync(path.join(h.dir, 'netlify/functions/_lib/nube.js'), 'utf8');
  const libBase = fs.readFileSync(path.join(b.dir, 'netlify/functions/_lib/nube.js'), 'utf8');
  af(libHead === libBase,
     '🔴 esta tuerca TOCÓ `_lib/nube.js`: la pregunta se le hace al dueño, no se le cambia la respuesta '
     + 'para que encaje con la pantalla nueva');

  completo = true;
  marcador();
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); marcador(); process.exit(1); });
