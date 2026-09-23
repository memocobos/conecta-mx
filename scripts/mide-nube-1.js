#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-nube-1.js — NUBE-1 · LA COTIZACIÓN SEMANAL A CDMX
//
// 🔒 EL RELOJ SE CONGELA. Todo lo que aquí se mide es una FRONTERA DE TIEMPO
// —qué rige hoy, qué venció, qué regía aquel día— y un careo cuyo resultado
// depende de qué lunes sea hoy es el rojo `[12a]` de `mide:tira-agotados`
// esperando su turno. Ninguna función de la nube llama a `Date.now()` por
// dentro: reciben el instante, justo para poder medirse así.
//
// 🔒 LOS DOS LADOS SON COMMITS.
//     BASE = 09c2bac  main sin nube
//     HEAD = 5af2da1  la tabla, el endpoint y la pantalla (el commit del MERGE)
//
// 🔒 LA CAPTURA ENTRA POR LA PANTALLA REAL DE BULMA: se sirve el markup
// EXTRAÍDO de `kamehouse.html` con el módulo REAL `kamehouse-nube.js`, y lo
// único fingido es el transporte (`khAdminFetch`) — con CONTEO DE LLAMADAS,
// porque un `fetch=0` no es un resultado: es que nunca se ejecutó.
//
// Se corre:  npm run mide:nube-1
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
const BASE = process.env.BASE || '09c2bac';
const HEAD_SHA = process.env.HEAD_SHA || '5af2da1';

// ── EL RELOJ CONGELADO ────────────────────────────────────────────────────
// Lunes 19-oct-2026, 10:00 de Reynosa. Se eligió a propósito: la semana que
// vence el domingo 25-oct (todavía en −05:00) y la SIGUIENTE vence el 1-nov,
// que es el día en que Reynosa cambia a −06:00. Las dos fronteras del huso
// caen dentro del alcance de este careo.
const HOY = Date.parse('2026-10-19T10:00:00-05:00');
const DOM25 = Date.parse('2026-10-25T23:59:00-05:00');   // domingo, aún −05
const DOM01 = Date.parse('2026-11-01T23:59:00-06:00');   // domingo, ya −06

// Filas de mentira con los NOMBRES REALES de las columnas (leídos del SQL, no
// recordados): id, modo, precio_pp, vigente_desde, vigente_hasta, nota,
// capturado_por, creado_en.
const iso = (t) => new Date(t).toISOString();
const fila = (o) => Object.assign({
  id: 'f-' + Math.random().toString(16).slice(2, 8),
  nota: null, capturado_por: 'bulma@conectareynosa.mx', creado_en: iso(HOY),
}, o);

function servidorPantalla(dirHead, markup) {
  return http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u === '/kamehouse-nube.js') {
      const b = fs.readFileSync(path.join(dirHead, 'kamehouse-nube.js'));
      r.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return r.end(b);
    }
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    r.end(markup);
  });
}

// Corta del `kamehouse.html` de HEAD el bloque REAL de la pantalla. Se corta
// por BALANCE DE DIVS, no «hasta el siguiente <div class="page"»: si mañana
// alguien mete un div en medio, un corte por marcador se lleva medio bloque o
// sobra. Y si no lo encuentra, TRUENA — un markup vacío pasaría el careo en
// hueco.
function recortarPagina(html, id) {
  const abre = html.indexOf('<div class="page" id="' + id + '"');
  if (abre < 0) throw new Error('no encontré la página ' + id + ' en kamehouse.html');
  let i = abre, prof = 0;
  while (i < html.length) {
    const sig = html.indexOf('<', i);
    if (sig < 0) break;
    if (html.startsWith('<div', sig)) prof++;
    else if (html.startsWith('</div', sig)) { prof--; if (prof === 0) return html.slice(abre, html.indexOf('>', sig) + 1); }
    i = sig + 1;
  }
  throw new Error('la página ' + id + ' no cierra sus divs');
}

(async () => {
  const b = sacar(BASE, 'nube-base'), h = sacar(HEAD_SHA, 'nube-head');
  console.log('CAREO NUBE-1 · la cotización semanal a CDMX\n');
  console.log('  BASE ' + b.sha.slice(0, 7) + '  ·  HEAD ' + h.sha.slice(0, 7));
  console.log('  reloj congelado: ' + new Date(HOY).toISOString() + '  (lunes 19-oct-2026, Reynosa)\n');

  // ══ [1] EL LIB · quién rige, con el reloj quieto ════════════════════════
  console.log('[1] el lib: quién rige');
  const nube = require(path.join(h.dir, 'netlify/functions/_lib/nube.js'));
  af(Array.isArray(nube.MODOS) && nube.MODOS.length === 2 && nube.MODOS.includes('bus') && nube.MODOS.includes('avion'),
     'los modos del lib no son exactamente bus y avion: ' + JSON.stringify(nube.MODOS));
  // Un lector de mentira que RESPETA el filtro por modo, como la base real: un
  // mock que devuelve todo hace que quien pide un modo reciba el otro.
  const lectorDe = (filas) => {
    const pedidos = [];
    const f = async (qs) => {
      pedidos.push(qs);
      const m = /modo=eq\.([a-z]+)/.exec(qs);
      if (!m) throw new Error('el lector falso exige el filtro por modo: ' + qs);
      return filas.filter((x) => x.modo === m[1]);
    };
    f.pedidos = pedidos;
    return f;
  };
  const VIVAS = [
    fila({ modo: 'bus',   precio_pp: 2500, vigente_desde: iso(HOY - 3 * 864e5), vigente_hasta: iso(DOM25) }),
    fila({ modo: 'avion', precio_pp: 4800, vigente_desde: iso(HOY - 3 * 864e5), vigente_hasta: iso(DOM25) }),
  ];
  let lec = lectorDe(VIVAS);
  let v = await nube.vigentes(lec, HOY);
  console.log('    con las dos vivas: ' + JSON.stringify(v));
  af(v.bus && v.bus.precio === 2500, 'el bus vigente no salió: ' + JSON.stringify(v.bus));
  af(v.avion && v.avion.precio === 4800, 'el avión vigente no salió: ' + JSON.stringify(v.avion));
  // 🔒 LA FORMA PÚBLICA NO LLEVA `capturado_por` NI `nota`: la respuesta se arma
  // campo por campo, nunca con un spread, para que un dato interno no se
  // escape al sitio por accidente.
  af(v.bus && Object.keys(v.bus).sort().join(',') === 'precio,vigente_hasta',
     'la forma pública trae llaves de más: ' + JSON.stringify(Object.keys(v.bus || {})));
  af(lec.pedidos.length === 2, 'el lib pidió ' + lec.pedidos.length + ' veces y debía pedir 2 (una por modo)');

  // ── LA FRONTERA, en el instante exacto ──────────────────────────────────
  // Un ms ANTES del vencimiento todavía rige; en el ms del vencimiento, NO.
  // Sin congelar el reloj esto no se puede ni intentar.
  af((await nube.vigentes(lectorDe(VIVAS), DOM25 - 1)).bus !== null,
     'un milisegundo antes de vencer, el bus ya no rige: la frontera está del lado malo');
  af((await nube.vigentes(lectorDe(VIVAS), DOM25)).bus === null,
     '🔴 EN EL INSTANTE DEL VENCIMIENTO el bus TODAVÍA rige: un precio vencido se estaría vendiendo');
  af((await nube.vigentes(lectorDe(VIVAS), DOM25 + 864e5)).bus === null,
     'una semana después, el bus vencido sigue saliendo como vigente');
  // Y una fila que arranca EL LUNES QUE VIENE no rige hoy: la pregunta es por
  // la ventana, no por el orden de captura.
  const FUTURA = VIVAS.concat([fila({ modo: 'bus', precio_pp: 9999, vigente_desde: iso(DOM25), vigente_hasta: iso(DOM01) })]);
  const vf = await nube.vigentes(lectorDe(FUTURA), HOY);
  af(vf.bus && vf.bus.precio === 2500,
     '🔴 una cotización capturada PARA EL LUNES QUE VIENE está rigiendo hoy (' + JSON.stringify(vf.bus)
     + '): se está contestando «la última capturada» en vez de «la que cubre hoy»');
  // CONTROL DEL INSTRUMENTO: antes de creerle un `null`, se le hace contestar
  // algo que SÍ existe. Si con el conjunto vacío también dijera null, sus
  // ausencias no valdrían nada.
  const vacio = await nube.vigentes(lectorDe([]), HOY);
  af(vacio.bus === null && vacio.avion === null, 'con la tabla vacía el lib inventó una cotización');
  af(v.bus !== null, 'el instrumento no ve una vigente ni cuando la hay: sus nulls no dicen nada');

  // ══ [2] LA CICATRIZ DE OMAR · los TRES estados ═════════════════════════
  console.log('\n[2] el historial: los tres estados');
  const NACE = Date.parse('2026-09-07T00:00:00-05:00');
  const HIST = [
    fila({ modo: 'bus', precio_pp: 2300, vigente_desde: iso(NACE), vigente_hasta: iso(Date.parse('2026-09-13T23:59:00-05:00')) }),
    fila({ modo: 'bus', precio_pp: 2500, vigente_desde: iso(Date.parse('2026-09-21T00:00:00-05:00')), vigente_hasta: iso(Date.parse('2026-09-27T23:59:00-05:00')) }),
  ];
  const q = async (modo, t) => nube.regiaEl(lectorDe(HIST), modo, t);
  const r1 = await q('bus', Date.parse('2026-09-10T12:00:00-05:00'));
  const r2 = await q('bus', Date.parse('2026-09-17T12:00:00-05:00'));   // hueco entre semanas
  const r3 = await q('bus', Date.parse('2026-08-01T12:00:00-05:00'));   // ANTES del nacimiento
  const r4 = await q('avion', HOY);                                     // modo sin datos
  console.log('    10-sep (dentro):        ' + r1.estado + ' · ' + (r1.fila ? r1.fila.precio : '—'));
  console.log('    17-sep (entre semanas): ' + r2.estado + ' · última: ' + (r2.fila ? r2.fila.precio : '—'));
  console.log('    1-ago  (antes de nacer): ' + r3.estado);
  console.log('    avión (sin datos):      ' + r4.estado);
  af(r1.estado === 'vigente' && r1.fila.precio === 2300,
     'el 10-sep debía regir la de $2,300 y salió ' + r1.estado + '/' + (r1.fila && r1.fila.precio));
  af(r2.estado === 'vencida' && r2.fila && r2.fila.precio === 2300,
     'el 17-sep no había vigencia: se esperaba «vencida» con la última ($2,300) y salió '
     + r2.estado + '/' + (r2.fila && r2.fila.precio));
  af(r3.estado === 'antes_del_nacimiento',
     '🔴 LA CICATRIZ DE OMAR: preguntar por un día ANTERIOR al nacimiento contestó «' + r3.estado
     + '». Tiene que decir que la nube aún no existía — nunca el precio de hoy con etiqueta de ayer');
  af(r3.fila === null, 'el caso «antes del nacimiento» devolvió una fila: no hay ninguna que citar');
  af(r4.estado === 'sin_datos', 'un modo que nunca se cotizó contestó ' + r4.estado);
  af(Number(r1.nacimiento) === NACE, 'el nacimiento no es la vigencia más antigua: ' + JSON.stringify(r1.nacimiento));
  // 🔒 EL NACIMIENTO ES LA VIGENCIA MÁS ANTIGUA, NO LA FILA MÁS VIEJA. Alguien
  // puede capturar HOY una vigencia que arrancó la semana pasada; si el
  // nacimiento se leyera de `creado_en`, ese día quedaría «antes de nacer».
  const HIST2 = HIST.concat([fila({
    modo: 'bus', precio_pp: 2100,
    vigente_desde: iso(Date.parse('2026-08-24T00:00:00-05:00')),
    vigente_hasta: iso(Date.parse('2026-08-30T23:59:00-05:00')),
    creado_en: iso(HOY),          // capturada HOY, vigencia VIEJA
  })]);
  const r5 = await nube.regiaEl(lectorDe(HIST2), 'bus', Date.parse('2026-08-26T12:00:00-05:00'));
  af(r5.estado === 'vigente' && r5.fila.precio === 2100,
     'una vigencia vieja capturada hoy quedó fuera del historial (' + r5.estado + '): el nacimiento se '
     + 'está leyendo de `creado_en` y no de la vigencia');

  // ══ [3] EL ENDPOINT PÚBLICO · por el handler REAL ══════════════════════
  console.log('\n[3] el endpoint público, por el handler REAL');
  const correrEndpoint = async ({ filas, caida, status }) => {
    const llamadas = [];
    global.fetch = async (url) => {
      llamadas.push(String(url));
      if (caida) throw new Error('ECONNREFUSED de mentira');
      if (status && status !== 200) return { ok: false, status, text: async () => 'boom', json: async () => ({}) };
      const m = /modo=eq\.([a-z]+)/.exec(String(url));
      const out = (filas || []).filter((x) => !m || x.modo === m[1]);
      return { ok: true, status: 200, json: async () => out, text: async () => JSON.stringify(out) };
    };
    process.env.SUPABASE_URL_KAMEHOUSE = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
    process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
    for (const f of ['nube-vigente.js', '_lib/nube.js']) delete require.cache[require.resolve(path.join(h.dir, 'netlify/functions', f))];
    const mod = require(path.join(h.dir, 'netlify/functions/nube-vigente.js'));
    const res = await mod.handler({ httpMethod: 'GET', headers: {} });
    return { res, d: JSON.parse(res.body), llamadas };
  };
  // 🔴 AQUÍ EL RELOJ **NO** SE CONGELA, Y ES A PROPÓSITO: el endpoint lee el
  // `Date.now()` de verdad —tiene que hacerlo, es lo que rige AHORA— así que
  // sus filas se siembran alrededor del ahora REAL. Mi primera versión les
  // puso la vigencia del lunes congelado (que cae en el FUTURO respecto al
  // ahora real) y el endpoint contestó `null` con toda la razón: el rojo era
  // del fixture. El reloj congelado es para el lib, que recibe el instante.
  const AHORA = Date.now();
  const vivasReales = [
    fila({ modo: 'bus',   precio_pp: 2500, vigente_desde: iso(AHORA - 2 * 864e5), vigente_hasta: iso(AHORA + 5 * 864e5) }),
    fila({ modo: 'avion', precio_pp: 4800, vigente_desde: iso(AHORA - 2 * 864e5), vigente_hasta: iso(AHORA + 5 * 864e5) }),
  ];
  const e1 = await correrEndpoint({ filas: vivasReales });
  console.log('    con las dos vivas: ' + e1.res.statusCode + ' ' + e1.res.body);
  af(e1.res.statusCode === 200 && e1.d.ok === true, 'el endpoint no contestó 200/ok');
  af(e1.d.bus && e1.d.bus.precio === 2500 && e1.d.avion && e1.d.avion.precio === 4800,
     'el endpoint no devuelve los dos precios: ' + e1.res.body);
  af(!/capturado_por|nota/.test(e1.res.body),
     '🔴 el endpoint PÚBLICO está publicando `capturado_por` o la nota interna: ' + e1.res.body);
  // El caché, careado como `viajeros-contador` — que es de donde se copió.
  const cache = e1.res.headers['Cache-Control'] || '';
  const cacheVc = fs.readFileSync(path.join(h.dir, 'netlify/functions/viajeros-contador.js'), 'utf8')
    .match(/const CACHE = '([^']+)'/);
  console.log('    Cache-Control: ' + JSON.stringify(cache));
  af(/s-maxage=\d+/.test(cache), 'la respuesta pública no trae caché de CDN: la pide la ficha de cada evento de CDMX');
  af(cacheVc && cache === cacheVc[1],
     'el caché no es el MISMO perfil que viajeros-contador (' + JSON.stringify(cacheVc && cacheVc[1])
     + '): dos perfiles distintos para la misma clase de respuesta son dos reglas que van a divergir');
  // 🔒 VENCIDA = NO HAY PRECIO.
  const VENCIDAS = vivasReales.map((f) => fila(Object.assign({}, f, {
    vigente_desde: iso(AHORA - 9 * 864e5), vigente_hasta: iso(AHORA - 2 * 864e5) })));
  const e2 = await correrEndpoint({ filas: VENCIDAS });
  console.log('    con las dos vencidas: ' + e2.res.body);
  af(e2.d.bus === null && e2.d.avion === null,
     '🔴 el endpoint publicó un precio VENCIDO: ' + e2.res.body + ' — es la mentira de NATA con dinero');
  af(e2.res.statusCode === 200, 'una cotización vencida no es un error: debía contestar 200 y contestó ' + e2.res.statusCode);
  // FAIL-SOFT: la red caída y el 5xx contestan 200 con nulls y sin caché.
  for (const [etq, opts] of [['red caída', { caida: true }], ['5xx de la base', { filas: vivasReales, status: 500 }]]) {
    const e = await correrEndpoint(opts);
    console.log('    ' + etq + ': ' + e.res.statusCode + ' ' + e.res.body + ' · cache=' + JSON.stringify(e.res.headers['Cache-Control']));
    af(e.res.statusCode === 200,
       'con ' + etq + ' el endpoint contestó ' + e.res.statusCode + ': un tropiezo de esta pieza NO puede ser '
       + 'un error de la página del cliente');
    af(e.d.ok === false && e.d.bus === null && e.d.avion === null,
       'con ' + etq + ' la respuesta no es «no hay precio»: ' + e.res.body);
    af(/no-store/.test(e.res.headers['Cache-Control'] || ''),
       'con ' + etq + ' la respuesta se dejó CACHEAR: el CDN congelaría diez minutos de «no hay precio»');
  }
  // Y sin llaves tampoco inventa.
  delete process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  for (const f of ['nube-vigente.js', '_lib/nube.js']) delete require.cache[require.resolve(path.join(h.dir, 'netlify/functions', f))];
  const sinLlave = await require(path.join(h.dir, 'netlify/functions/nube-vigente.js')).handler({ httpMethod: 'GET', headers: {} });
  af(sinLlave.statusCode === 200 && JSON.parse(sinLlave.body).bus === null,
     'sin llaves el endpoint no cae a «no hay precio»: ' + sinLlave.body);
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';

  // ══ [4] INSERT-ONLY, medido por el HECHO ═══════════════════════════════
  // No por grep de que el código «no dice update»: se ejercita `cotizar` y se
  // mira QUÉ MÉTODOS salieron contra la tabla. Con control positivo.
  console.log('\n[4] INSERT-ONLY, por los métodos que salen');
  const correrAdmin = async (body, quien) => {
    const metodos = [];
    global.fetch = async (url, opts) => {
      const met = (opts && opts.method) || 'GET';
      metodos.push(met + ' ' + String(url).replace(/^.*rest\/v1\//, '').split('?')[0]);
      if (met === 'POST') {
        const enviado = JSON.parse((opts && opts.body) || '{}');
        metodos.enviado = enviado;
        return { ok: true, status: 201, json: async () => [fila(Object.assign({ id: 'nueva' }, enviado))], text: async () => '' };
      }
      const m = /modo=eq\.([a-z]+)/.exec(String(url));
      const out = VIVAS.filter((x) => !m || x.modo === m[1]);
      return { ok: true, status: 200, json: async () => out, text: async () => '' };
    };
    const va = require.resolve(path.join(h.dir, 'netlify/functions/_lib/verify-admin.js'));
    require.cache[va] = { id: va, filename: va, loaded: true, exports: {
      corsCheck: () => 'https://conectareynosa.mx',
      verifyAdminAuthLive: async () => ({ valid: true, user: quien || { id: 'u1', correo: 'bulma@conectareynosa.mx', rol: 'bulma' } }),
    } };
    for (const f of ['admin-nube.js', '_lib/nube.js']) delete require.cache[require.resolve(path.join(h.dir, 'netlify/functions', f))];
    const mod = require(path.join(h.dir, 'netlify/functions/admin-nube.js'));
    const res = await mod.handler({
      httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify(body),
    });
    return { res, d: JSON.parse(res.body || '{}'), metodos };
  };
  const a1 = await correrAdmin({ accion: 'cotizar', modo: 'bus', precio_pp: 2650, vigente_hasta: iso(HOY + 6 * 864e5) });
  console.log('    métodos contra la tabla: ' + JSON.stringify(a1.metodos));
  af(a1.res.statusCode === 200 && a1.d.ok === true, 'cotizar no guardó: ' + a1.res.body);
  af(a1.metodos.some((m) => m.startsWith('POST nube_cotizaciones')), 'no salió ningún INSERT');
  af(!a1.metodos.some((m) => /^(PATCH|PUT|DELETE)/.test(m)),
     '🔴 cotizar mandó un UPDATE o un DELETE: la tabla es INSERT-ONLY y ahí vive el historial. Salió: '
     + JSON.stringify(a1.metodos));
  // CONTROL DEL CONTADOR: si no pudiera ver un método que no es GET, su
  // ausencia de PATCH no diría nada.
  af(a1.metodos.filter((m) => m.startsWith('POST')).length === 1,
     'el contador de métodos no ve el POST: sus ausencias no valen nada (' + JSON.stringify(a1.metodos) + ')');
  // `capturado_por` sale del TOKEN, con el nombre de campo real (`correo`).
  console.log('    lo que se insertó: ' + JSON.stringify(a1.metodos.enviado));
  af(a1.metodos.enviado && a1.metodos.enviado.capturado_por === 'bulma@conectareynosa.mx',
     '🔴 `capturado_por` no salió del token: ' + JSON.stringify(a1.metodos.enviado && a1.metodos.enviado.capturado_por)
     + '. El payload de verify-admin trae `correo` — NO `nombre` ni `email`');
  const a1b = await correrAdmin(
    { accion: 'cotizar', modo: 'bus', precio_pp: 100, vigente_hasta: iso(HOY + 864e5), capturado_por: 'me firmo como Memo' },
    { id: 'u9', correo: 'milk@conectareynosa.mx', rol: 'milk' });
  af(a1b.metodos.enviado && a1b.metodos.enviado.capturado_por === 'milk@conectareynosa.mx',
     '🔴 el body pudo FIRMAR la captura con otro nombre: ' + JSON.stringify(a1b.metodos.enviado.capturado_por));
  // Las guardas del guardado, que NO son decorativas: cada una se alcanza.
  for (const [etq, body, pedazo] of [
    ['sin modo',         { accion: 'cotizar', precio_pp: 100, vigente_hasta: iso(HOY + 864e5) }, /bus.*avion/i],
    ['modo inventado',   { accion: 'cotizar', modo: 'tren', precio_pp: 100, vigente_hasta: iso(HOY + 864e5) }, /bus.*avion/i],
    ['sin precio',       { accion: 'cotizar', modo: 'bus', vigente_hasta: iso(HOY + 864e5) }, /precio/i],
    ['precio en cero',   { accion: 'cotizar', modo: 'bus', precio_pp: 0, vigente_hasta: iso(HOY + 864e5) }, /precio/i],
    ['sin vigencia',     { accion: 'cotizar', modo: 'bus', precio_pp: 100 }, /rige/i],
    // El servidor compara contra el ahora REAL (no contra el reloj congelado),
    // así que «pasada» tiene que ser pasada de verdad.
    ['vigencia pasada',  { accion: 'cotizar', modo: 'bus', precio_pp: 100, vigente_hasta: iso(Date.now() - 864e5) }, /vencida|ya pas/i],
    ['acción inventada', { accion: 'borrar_todo' }, /desconocida/i],
  ]) {
    const r = await correrAdmin(body);
    af(r.res.statusCode === 400, etq + ': se esperaba 400 y contestó ' + r.res.statusCode + ' — ' + r.res.body);
    af(pedazo.test(String(r.d.error || '')), etq + ': el error no dice qué falta («' + r.d.error + '»)');
    af(!r.metodos.some((m) => m.startsWith('POST')), etq + ': se guardó una fila que debía rechazarse');
  }

  // ══ [5] EL HUSO, QUE ES EL HALLAZGO ════════════════════════════════════
  // 🔴 `ESF_FLASH_TZ` es un `-05:00` TECLEADO, y la cadencia semanal de la nube
  // cruza el cambio de horario. Aquí se mide que la pantalla resuelve la hora
  // de pared preguntándole al huso, no al literal.
  console.log('\n[5] el huso: el domingo que cambia el horario');
  const mkPagina = (markup) => '<!doctype html><meta charset="utf-8"><body>' + markup
    + '<script>window.__fetches=[];function khAdminFetch(u,o){window.__fetches.push({u:u,o:o});'
    + 'return Promise.resolve({ok:true,json:function(){return Promise.resolve(window.__resp||{ok:true,modos:{bus:{vigente:null,ultimas:[]},avion:{vigente:null,ultimas:[]}},ahora:Date.now()})}});}'
    + 'window.__toasts=[];function showToast(m,t){window.__toasts.push([m,t]);}'
    + 'function khErrorCarga(c,q,f,e){window.__err=String(e&&e.message||e);}'
    + '<\/script><script src="/kamehouse-nube.js"><\/script></body>';
  const markup = recortarPagina(fs.readFileSync(path.join(h.dir, 'kamehouse.html'), 'utf8'), 'page-nube');
  af(/id="nube-modo"/.test(markup) && /id="nube-precio"/.test(markup) && /id="nube-guardar-btn"/.test(markup),
     'el markup recortado de la pantalla no trae sus campos: el careo mediría una página vacía');
  const srv = servidorPantalla(h.dir, mkPagina(markup));
  await new Promise((ok) => srv.listen(0, ok));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();
  const page = await (await nav.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errsJS = [];
  page.on('pageerror', (e) => errsJS.push(String(e.message)));
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);
    const husos = await page.evaluate(() => ({
      oct25: _nubeInstante('2026-10-25', '23:59'),
      nov01: _nubeInstante('2026-11-01', '23:59'),
    }));
    console.log('    25-oct 23:59 → ' + new Date(husos.oct25).toISOString() + '  (espera −05)');
    console.log('    01-nov 23:59 → ' + new Date(husos.nov01).toISOString() + '  (espera −06)');
    af(husos.oct25 === DOM25, 'el 25-oct no resolvió con −05:00: ' + new Date(husos.oct25).toISOString());
    af(husos.nov01 === DOM01,
       '🔴 el 1-nov resolvió con el huso equivocado (' + new Date(husos.nov01).toISOString() + '). Con el `-05:00` '
       + 'tecleado la cotización vencería UNA HORA ANTES de lo que dice la pantalla, y así todo el invierno');
    af(husos.nov01 - husos.oct25 === 7 * 864e5 + 3600e3,
       'la diferencia entre los dos domingos no incluye la hora del cambio de horario');
    // ── LA PANTALLA: nace vacía y el guardado lo exige ────────────────────
    console.log('\n[6] la pantalla real de Bulma');
    const nace = await page.evaluate(() => {
      _nubeFormReset();
      return {
        modo: document.getElementById('nube-modo').value,
        precio: document.getElementById('nube-precio').value,
        fecha: document.getElementById('nube-hasta-fecha').value,
        hora: document.getElementById('nube-hasta-hora').value,
        previa: document.getElementById('nube-previa').textContent,
        etiquetas: [...document.querySelectorAll('label')].map((l) => l.textContent.trim()),
      };
    });
    console.log('    nace: ' + JSON.stringify({ modo: nace.modo, precio: nace.precio, fecha: nace.fecha, hora: nace.hora }));
    af(nace.modo === '', '🔴 el selector de MODO nace con valor (' + JSON.stringify(nace.modo)
       + '): un default pondría el precio del bus en el avión — el caso `kmt-prov`');
    af(nace.precio === '', 'el precio nace con valor: ' + JSON.stringify(nace.precio));
    af(/^\d{4}-\d{2}-\d{2}$/.test(nace.fecha) && nace.hora === '23:59',
       'la vigencia no trae su default anunciado: ' + JSON.stringify([nace.fecha, nace.hora]));
    // 🔒 EL DEFAULT DE LA VIGENCIA VA **ANUNCIADO**, que es la única forma en
    // que DEFAULTS-1 lo permite: si no está en la etiqueta, es un dato que
    // nadie eligió.
    af(nace.etiquetas.some((t) => /por default/i.test(t) && /domingo/i.test(t)),
       'el default de la vigencia no está ANUNCIADO en su etiqueta: ' + JSON.stringify(nace.etiquetas));
    af(/Regirá hasta/.test(nace.previa), 'la previa no dice hasta cuándo regirá: ' + JSON.stringify(nace.previa));
    // El domingo por default es DOMINGO de verdad, y futuro.
    const dowOK = await page.evaluate(() => {
      const f = document.getElementById('nube-hasta-fecha').value;
      const [a, m, d] = f.split('-').map(Number);
      return { dow: new Date(Date.UTC(a, m - 1, d)).getUTCDay(), futuro: _nubeInstante(f, '23:59') > Date.now() };
    });
    af(dowOK.dow === 0, 'el default de la vigencia no cae en domingo (dow=' + dowOK.dow + ')');
    af(dowOK.futuro, 'el default de la vigencia ya pasó');
    // El guardado EXIGE lo que nació vacío, y su guarda se ALCANZA.
    const sinModo = await page.evaluate(async () => {
      window.__toasts = [];
      document.getElementById('nube-precio').value = '2500';
      await nubeGuardar();
      return { toasts: window.__toasts, fetches: window.__fetches.filter((f) => /admin-nube/.test(f.u) && /cotizar/.test(String(f.o && f.o.body))).length };
    });
    console.log('    guardar sin modo → ' + JSON.stringify(sinModo.toasts) + ' · envíos: ' + sinModo.fetches);
    af(sinModo.fetches === 0, '🔴 guardó sin modo: ' + sinModo.fetches + ' envío(s)');
    af(sinModo.toasts.some(([m]) => /modo/i.test(m)), 'no dijo que falta el modo: ' + JSON.stringify(sinModo.toasts));
    const conTodo = await page.evaluate(async () => {
      window.__toasts = []; window.__fetches = [];
      document.getElementById('nube-modo').value = 'avion';
      document.getElementById('nube-precio').value = '4750';
      await nubeGuardar();
      const env = window.__fetches.filter((f) => /admin-nube/.test(f.u)).map((f) => JSON.parse(f.o.body));
      return { env, toasts: window.__toasts };
    });
    const cot = conTodo.env.find((x) => x.accion === 'cotizar');
    console.log('    guardar completo → ' + JSON.stringify(cot));
    af(!!cot, '🔴 con todo lleno NO se mandó la captura: ' + JSON.stringify(conTodo.env));
    af(cot && cot.modo === 'avion' && cot.precio_pp === 4750, 'la captura mandó otros datos: ' + JSON.stringify(cot));
    af(cot && /Z$/.test(String(cot.vigente_hasta)),
       'la vigencia no viaja como INSTANTE (ISO en UTC): ' + JSON.stringify(cot && cot.vigente_hasta));
    af(cot && !('capturado_por' in cot), 'la pantalla manda `capturado_por`: ese campo es del token, no del body');
    // Y refresca la lista después de guardar: si no, la pantalla miente sobre
    // lo que rige hasta que alguien recargue.
    af(conTodo.env.some((x) => x.accion === 'listar'), 'tras guardar no se volvió a leer la nube');
    // La vigencia pasada se rehúsa EN LA PANTALLA, no solo en el servidor.
    const pasada = await page.evaluate(async () => {
      window.__toasts = []; window.__fetches = [];
      document.getElementById('nube-modo').value = 'bus';
      document.getElementById('nube-precio').value = '2500';
      document.getElementById('nube-hasta-fecha').value = '2020-01-05';
      _nubePreviaVigencia();
      await nubeGuardar();
      return { toasts: window.__toasts, previa: document.getElementById('nube-previa').textContent,
               envios: window.__fetches.filter((f) => /cotizar/.test(String(f.o && f.o.body))).length };
    });
    console.log('    vigencia pasada → ' + JSON.stringify(pasada.toasts) + ' · previa: ' + JSON.stringify(pasada.previa.slice(0, 60)));
    af(pasada.envios === 0, 'la pantalla mandó una cotización que nacería vencida');
    af(/ya pas/i.test(pasada.previa), 'la previa no avisa de que esa vigencia ya pasó: ' + JSON.stringify(pasada.previa));
    // ── LOS DOS MODOS SIEMPRE A LA VISTA, con su estado DICHO ─────────────
    console.log('\n[7] los dos modos y sus tres estados, dichos con palabras');
    const pintado = await page.evaluate((datos) => {
      _nubePintar(datos);
      const t = document.getElementById('nube-cuerpo').textContent;
      return { t, tarjetas: document.querySelectorAll('#nube-cuerpo .card').length };
    }, {
      ahora: HOY,
      modos: {
        bus:   { vigente: { precio: 2500, vigente_hasta: iso(DOM25), capturado_por: 'bulma@conectareynosa.mx', nota: null }, ultimas: [] },
        avion: { vigente: null, ultimas: [{ precio: 4800, vigente_hasta: iso(HOY - 864e5), capturado_por: 'milk@conectareynosa.mx' }] },
      },
    });
    af(pintado.tarjetas === 2, 'no se pintan los DOS modos: ' + pintado.tarjetas + ' tarjeta(s)');
    af(/VIGENTE/.test(pintado.t) && /VENCIDA/.test(pintado.t),
       'los estados no se dicen con palabras: ' + JSON.stringify(pintado.t.slice(0, 120)));
    af(/\$2,500/.test(pintado.t), 'el precio vigente no se pinta');
    af(!/\$4,800\s*por persona/.test(pintado.t),
       '🔴 se está pintando el precio VENCIDO del avión como si rigiera');
    af(/manda al WhatsApp/.test(pintado.t),
       'el modo sin vigencia no dice la CONSECUENCIA: un renglón vacío y uno vencido se ven igual si nadie los nombra');
    const sinNada = await page.evaluate(() => {
      _nubePintar({ ahora: Date.now(), modos: { bus: { vigente: null, ultimas: [] }, avion: { vigente: null, ultimas: [] } } });
      return document.getElementById('nube-cuerpo').textContent;
    });
    af(/SIN COTIZACIÓN/.test(sinNada), 'un modo que nunca se cotizó no se distingue de uno vencido: ' + JSON.stringify(sinNada.slice(0, 100)));
    af(errsJS.length === 0, 'la pantalla tiró errores de JS: ' + errsJS.slice(0, 3).join(' · '));
  } finally {
    await nav.close(); srv.close();
  }

  // ══ [8] CONTROL POSITIVO · en BASE nada de esto existe ═════════════════
  console.log('\n[8] CONTROL POSITIVO · BASE');
  const existe = (rel) => fs.existsSync(path.join(b.dir, rel));
  af(!existe('netlify/functions/nube-vigente.js'), 'BASE ya trae el endpoint: [3] no prueba nada');
  af(!existe('netlify/functions/_lib/nube.js'), 'BASE ya trae el lib');
  af(!existe('kamehouse-nube.js'), 'BASE ya trae la pantalla');
  const htmlBase = fs.readFileSync(path.join(b.dir, 'kamehouse.html'), 'utf8');
  af(!/id="page-nube"/.test(htmlBase), 'BASE ya trae la página de la nube');
  // Y la premisa del permiso: en BASE la herramienta no existe, así que nadie
  // la tenía; en HEAD la tienen los tres que cotizan y NADIE más.
  const jsHead = fs.readFileSync(path.join(h.dir, 'kamehouse.js'), 'utf8');
  const bloque = jsHead.slice(jsHead.indexOf('const PERMISOS_TABS'), jsHead.indexOf('const GZ_TABS_PERMITIDAS'));
  // 🔴 SE MIRA RENGLÓN POR RENGLÓN. Mi primera versión colapsaba los saltos de
  // línea «para leer mejor» y con eso juntó los seis roles en UNA sola línea:
  // el regex de cada rol encontraba el `'nube'` del de abajo y salieron los
  // seis. El rojo era del instrumento — y del lado peligroso, porque acusaba
  // de una fuga de permisos que no existe.
  const conNube = bloque.split('\n')
    .filter((l) => /'nube'/.test(l))
    .map((l) => (l.match(/^\s*([a-z_]+)\s*:/) || [])[1])
    .filter(Boolean);
  console.log('    roles con la herramienta: ' + JSON.stringify(conNube));
  af(conNube.length === 3 && conNube.includes('bulma') && conNube.includes('milk') && conNube.includes('maestro_roshi'),
     'los roles con la nube no son los tres que cotizan: ' + JSON.stringify(conNube));

  completo = true;
  marcador();
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); marcador(); process.exit(1); });
