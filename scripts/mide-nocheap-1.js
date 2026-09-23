#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-nocheap-1.js — NOCHEAP-1 · LA BANDERA QUE NO APAGABA NADA
//
// 🔒 SE MIDE EL BOTÓN **RENDERIZADO**, no la bandera. La enfermedad de esta
// tuerca era justo la contraria: había una bandera, se capturaba, se emitía…
// y el botón no la miraba. Preguntarle al dato habría dado verde en BASE.
//
// 🔒 LOS DOS LADOS SON COMMITS.
//     BASE = 19f8d16  main: la bandera existe y el index la ignora
//     HEAD = d0b8e93  el index la obedece
//
// 🔒 LAS VARIANTES SE SIEMBRAN SOBRE EVENTOS REALES, mutando su objeto en la
// página. `humbecdmx` es el que de verdad trae la bandera hoy, y a él se le
// añaden los `cheapZonas` que le faltan para destapar el caso peligroso — el
// que el catálogo todavía no tiene y por eso nadie había visto.
//
// Se corre:  npm run mide:nocheap-1
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
const HEAD_SHA = process.env.HEAD_SHA || 'd0b8e93';
const EV_BANDERA = 'humbecdmx';      // el que trae `noCheap` de verdad
const EV_LAS_DOS = 'coronacapital';  // trae noCheap Y cheapSoon (camino festival)
const EV_NORMAL  = 'edc27';          // vende CHEAP sin banderas

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
      const tipo = /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css'
        : /\.jpe?g$/.test(f) ? 'image/jpeg' : /\.png$/.test(f) ? 'image/png' : 'text/html; charset=utf-8';
      r.writeHead(200, { 'Content-Type': tipo }); r.end(b);
    });
  });
}

// 🔒 EL BOTÓN, COMO LO VE EL CLIENTE: su `display` COMPUTADO, su texto y si se
// puede apretar. Las tres cosas, porque un botón escondido, uno apagado y uno
// comprable son tres hechos distintos y esta tuerca existe para distinguirlos.
const MIRAR = `([id, src]) => {
  const e = EV.find((x) => x.id === id);
  if (!e) return { falta: true };
  if (src) (new Function('e', '(' + src + ')(e)'))(e);
  showDetail(id);
  if (typeof skipOnboarding === 'function') skipOnboarding();
  const v = document.querySelector('#w-viajeros-card .wiz-btn');
  if (v) v.click();
  const b = document.getElementById('btn-cheap');
  if (!b) return { hay: false };
  const cs = getComputedStyle(b);
  const r = b.getBoundingClientRect();
  return {
    hay: true,
    oculto: cs.display === 'none',
    ve: cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0,
    comprable: !b.disabled && !/disabled/.test(b.className || ''),
    txt: (b.innerText || '').replace(/\\s+/g, ' ').trim(),
  };
}`;

// Las mutaciones se declaran como FUENTE y se evalúan en la página: así el
// objeto que se toca es el REAL del catálogo servido, no una copia mía.
const SIN_PRECIOS = "(e) => { e.noCheap = true; delete e.cheapSoon; delete e.cheapZonas; }";
const CON_PRECIOS = "(e) => { e.noCheap = true; delete e.cheapSoon; e.cheapZonas = [{ n: 'General', p: 3200 }]; }";
const SOLO_SOON   = "(e) => { delete e.noCheap; e.cheapSoon = true; e.cheapZonas = [{ n: 'General', p: 0, prox: 1 }]; }";
const LIMPIO      = "(e) => { delete e.noCheap; delete e.cheapSoon; }";

(async () => {
  const b = sacar(BASE, 'nc-base'), h = sacar(HEAD_SHA, 'nc-head');
  console.log('CAREO NOCHEAP-1 · la bandera que no apagaba nada\n');
  console.log('  BASE ' + b.sha.slice(0, 7) + '  ·  HEAD ' + h.sha.slice(0, 7) + '\n');
  const sb = servidor(b.dir), sh = servidor(h.dir);
  await new Promise((ok) => sb.listen(0, ok));
  await new Promise((ok) => sh.listen(0, ok));
  const uB = 'http://127.0.0.1:' + sb.address().port;
  const uH = 'http://127.0.0.1:' + sh.address().port;
  const nav = await chromium.launch();
  const errores = [];

  const conPagina = async (base, fn) => {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errores.push(String(e.message)));
    await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(600);
    const out = await fn(p);
    await ctx.close();
    return out;
  };
  // ⚠️ `page.evaluate` con una CADENA la evalúa como EXPRESIÓN e **ignora los
  // argumentos**: pasarle `[id, mut]` no le llegaba nunca y la función leía
  // `undefined`. Se arma la LLAMADA, que es el patrón de los otros careos de
  // la casa (`MIRA + '(\"#sel\")'`). Mi instrumento, no el código — y del
  // lado peligroso, porque una excepción se lee como «la página está rota».
  // Y la flecha va ENTRE PARÉNTESIS: `([a,b])=>{}([...])` no es una llamada
  // válida, hay que envolverla. Dos tropiezos del mismo instrumento seguidos.
  const ver = (p, id, mut) => p.evaluate(
    '(' + MIRAR + ')([' + JSON.stringify(id) + ',' + JSON.stringify(mut || null) + '])');

  try {
    // ══ [0] LA PREMISA: la bandera existe, se captura y se emite ══════════
    console.log('[0] la premisa: el camino de la bandera, punta a punta');
    const esf = fs.readFileSync(path.join(h.dir, 'kamehouse.html'), 'utf8');
    af(/id="esf-pkg-nocheap"/.test(esf), 'la casilla «Sin CHEAP» ya no está en Esferas: el caso se quedó sin sujeto');
    const crear = fs.readFileSync(path.join(h.dir, 'netlify/functions/esferas-crear.js'), 'utf8');
    af(/'no_cheap'/.test(crear), 'el endpoint ya no acepta `no_cheap`');
    const comp = fs.readFileSync(path.join(h.dir, 'netlify/functions/_lib/esferas-compile.js'), 'utf8');
    af(/noCheap:true/.test(comp), 'el compilador ya no emite `noCheap`');
    // Y LA ASIMETRÍA DEL COMPILADOR, clavada como testigo: el festival emite
    // las dos banderas y el concierto solo una. No se arregló aquí a propósito
    // —el index obedeciendo la bandera la vuelve inofensiva—, pero si alguien
    // la uniforma, este renglón avisa para que se revise la precedencia.
    const fest = /cheapOn === false\) flags \+= 'noCheap:true,cheapSoon:true,'/.test(comp);
    const conc = /esfera\.no_cheap\) _f\.push\('noCheap:true'\)/.test(comp);
    console.log('    compilador → festival emite las dos: ' + fest + ' · concierto emite solo noCheap: ' + conc);
    af(fest && conc,
       'TESTIGO: la asimetría del compilador cambió (festival=' + fest + ', concierto=' + conc + '). '
       + 'Si se uniformó, revisa la precedencia cheapSoon > noCheap de este careo');
    // 🔴 LA PREMISA QUE DUELE: en BASE el index NO LEE la bandera.
    const idxBase = fs.readFileSync(path.join(b.dir, 'index.html'), 'utf8');
    const lecturasBase = (idxBase.match(/cur\.noCheap/g) || []).length;
    const idxHead = fs.readFileSync(path.join(h.dir, 'index.html'), 'utf8');
    const lecturasHead = (idxHead.match(/cur\.noCheap/g) || []).length;
    console.log('    lecturas de `cur.noCheap` → BASE: ' + lecturasBase + ' · HEAD: ' + lecturasHead);
    af(lecturasBase === 0, 'la premisa del ANTES no se sostiene: BASE ya leía la bandera (' + lecturasBase + ' lecturas)');
    af(lecturasHead >= 1, 'HEAD no lee la bandera: ' + lecturasHead + ' lecturas');

    // ══ [1] LAS TRES VARIANTES, EN EL BOTÓN RENDERIZADO ═══════════════════
    console.log('\n[1] las tres variantes, en el botón renderizado (HEAD)');
    const H = await conPagina(uH, async (p) => ({
      sinPrecios: await ver(p, EV_BANDERA, SIN_PRECIOS),
      conPrecios: await ver(p, EV_BANDERA, CON_PRECIOS),
      soloSoon:   await ver(p, EV_BANDERA, SOLO_SOON),
      limpio:     await ver(p, EV_NORMAL,  LIMPIO),
    }));
    const pinta = (k, x) => console.log('    ' + k.padEnd(11) + ' oculto=' + x.oculto + ' comprable=' + x.comprable
      + '  «' + String(x.txt).slice(0, 52) + '»');
    Object.keys(H).forEach((k) => pinta(k, H[k]));
    // OCULTO = «este evento no vende CHEAP».
    af(H.sinPrecios.oculto, 'con la bandera puesta el paquete NO se oculta: ' + JSON.stringify(H.sinPrecios));
    af(!H.sinPrecios.ve, 'el paquete oculto sigue viéndose (display no es lo único que lo esconde)');
    // 🔴 EL HOYO: bandera puesta CON precios. Es el caso que el catálogo
    // todavía no tiene y por eso nadie lo había visto.
    af(H.conPrecios.oculto && !H.conPrecios.comprable,
       '🔴 con la bandera puesta Y precios cheap, el paquete sigue comprable: ' + JSON.stringify(H.conPrecios)
       + ' — el sitio vendería justo lo que la casilla dice no vender');
    af(!/\$3,200/.test(H.conPrecios.txt), 'el botón oculto todavía anuncia el precio $3,200');
    // «PRÓXIMAMENTE» sigue siendo su propio letrero, visible y no comprable.
    af(!H.soloSoon.oculto && !H.soloSoon.comprable && /PR[OÓ]XIMAMENTE/i.test(H.soloSoon.txt),
       '«PRÓXIMAMENTE» dejó de ser su propio estado: ' + JSON.stringify(H.soloSoon));
    // Y un evento limpio sigue vendiendo.
    af(!H.limpio.oculto && H.limpio.comprable && /\$/.test(H.limpio.txt),
       'un evento sin banderas dejó de vender CHEAP: ' + JSON.stringify(H.limpio));
    // 🔒 LOS TRES ESTADOS SON TRES, medido: si dos coincidieran, la tuerca no
    // habría servido de nada.
    const firma = (x) => x.oculto ? 'oculto' : (x.comprable ? 'comprable' : 'apagado');
    const firmas = [firma(H.sinPrecios), firma(H.soloSoon), firma(H.limpio)];
    console.log('    las tres firmas: ' + JSON.stringify(firmas));
    af(new Set(firmas).size === 3,
       'los tres hechos NO se ven distintos (' + JSON.stringify(firmas) + '): el encargo era justo que '
       + '«no vendemos», «va a haber» y «se vende» dejaran de decirse igual');

    // ══ [2] `cheapSoon` GANA · la regresión que cazó medir ════════════════
    // `coronacapital` trae LAS DOS banderas. Con la precedencia al revés se le
    // escondía su «PRÓXIMAMENTE» — y eso NO lo pidió nadie.
    console.log('\n[2] precedencia: `cheapSoon` gana sobre `noCheap`');
    const cc = await conPagina(uH, async (p) => ({
      head: await ver(p, EV_LAS_DOS),
      lasDos: await ver(p, EV_BANDERA, "(e) => { e.noCheap = true; e.cheapSoon = true; e.cheapZonas = [{ n: 'General', p: 0, prox: 1 }]; }"),
    }));
    const ccBase = await conPagina(uB, (p) => ver(p, EV_LAS_DOS));
    console.log('    ' + EV_LAS_DOS + ' → BASE: ' + JSON.stringify(ccBase.txt).slice(0, 56)
      + ' · HEAD: ' + JSON.stringify(cc.head.txt).slice(0, 56));
    // La premisa: ese evento trae las dos banderas de verdad.
    const traeLasDos = await conPagina(uH, (p) => p.evaluate((id) => {
      const e = EV.find((x) => x.id === id);
      return { noCheap: !!e.noCheap, cheapSoon: !!e.cheapSoon };
    }, EV_LAS_DOS));
    af(traeLasDos.noCheap && traeLasDos.cheapSoon,
       'la premisa falla: ' + EV_LAS_DOS + ' ya no trae las dos banderas (' + JSON.stringify(traeLasDos)
       + '), así que la precedencia no se está midiendo con un caso real');
    af(!cc.head.oculto && /PR[OÓ]XIMAMENTE/i.test(cc.head.txt),
       '🔴 REGRESIÓN: a ' + EV_LAS_DOS + ' se le escondió su «PRÓXIMAMENTE» (' + JSON.stringify(cc.head)
       + '). «Va a haber» es más específico que «no vendemos»: gana la que dice más');
    // Y byte a byte con BASE: para este evento, esta tuerca NO cambia nada.
    af(cc.head.oculto === ccBase.oculto && cc.head.comprable === ccBase.comprable && cc.head.txt === ccBase.txt,
       'el evento con las dos banderas se ve DISTINTO que en BASE: ' + JSON.stringify({ base: ccBase, head: cc.head })
       + ' — esta tuerca solo debía tocar lo que estaba roto');
    af(!cc.lasDos.oculto && /PR[OÓ]XIMAMENTE/i.test(cc.lasDos.txt),
       'sembrando las dos banderas a mano, la precedencia no se respeta: ' + JSON.stringify(cc.lasDos));

    // ══ [3] LA PANTALLA SE REUSA · el botón vuelve ════════════════════════
    // Los botones son GLOBALES. Sin reencender la visibilidad, el primer
    // evento sin CHEAP se lo borra a todos los siguientes — el bug que ese
    // mismo bloque ya documenta para `disabled`, con otra propiedad.
    console.log('\n[3] la pantalla se reusa: el botón vuelve');
    const reuso = await conPagina(uH, async (p) => {
      const antes = await ver(p, EV_BANDERA, SIN_PRECIOS);
      const despues = await ver(p, EV_NORMAL, LIMPIO);
      const otraVez = await ver(p, EV_BANDERA, SIN_PRECIOS);
      const yOtro = await ver(p, EV_NORMAL, LIMPIO);
      return { antes, despues, otraVez, yOtro };
    });
    console.log('    escondido → normal → escondido → normal: '
      + JSON.stringify([reuso.antes.oculto, reuso.despues.oculto, reuso.otraVez.oculto, reuso.yOtro.oculto]));
    af(reuso.antes.oculto, 'la premisa del reuso falla: el primero no se escondió');
    af(!reuso.despues.oculto && reuso.despues.comprable,
       '🔴 el evento SIGUIENTE se quedó sin CHEAP: el botón es global y no se reenciende — una opción de '
       + 'compra que desaparece sola, en la misma visita y sin aviso');
    af(reuso.otraVez.oculto && !reuso.yOtro.oculto, 'el ciclo no es estable: esconder y mostrar no alternan');

    // ══ [4] LA CONTRADICCIÓN IMPOSIBLE · cheapOnly gana ══════════════════
    // `noCheap` + `cheapOnly` dejaría al cliente SIN NINGÚN paquete, porque
    // `cheapOnly` apaga los otros tres. Ahí gana `cheapOnly`.
    console.log('\n[4] la contradicción: noCheap + cheapOnly');
    const contra = await conPagina(uH, async (p) => {
      const x = await ver(p, EV_BANDERA, "(e) => { e.noCheap = true; e.cheapOnly = true; e.cheapZonas = [{ n: 'General', p: 3200 }]; }");
      const otros = await p.evaluate(() => ['btn-plus', 'btn-ride', 'btn-stay'].map((id) => {
        const b = document.getElementById(id) || document.querySelector('#w-paquetes .wiz-pkg-btn:first-child');
        return b ? (!b.disabled && !/disabled/.test(b.className || '')) : null;
      }));
      return { x, otros };
    });
    console.log('    noCheap+cheapOnly → cheap oculto=' + contra.x.oculto + ' comprable=' + contra.x.comprable
      + ' · otros comprables: ' + JSON.stringify(contra.otros));
    af(!contra.x.oculto,
       '🔴 con `cheapOnly` Y `noCheap` se escondió el ÚNICO paquete que ese evento vende: el cliente se queda '
       + 'sin nada que comprar. Ante datos que se contradicen, gana el que deja una puerta abierta');
    // Y la premisa de que hoy NADIE trae las dos (si mañana alguien las trae,
    // este caso deja de ser hipotético y conviene saberlo).
    const hayContra = await conPagina(uH, (p) => p.evaluate(() => EV.filter((e) => e.noCheap && e.cheapOnly).map((e) => e.id)));
    console.log('    eventos reales con las dos: ' + JSON.stringify(hayContra));
    af(hayContra.length === 0,
       'AVISO: ya hay eventos con `noCheap` Y `cheapOnly` (' + JSON.stringify(hayContra) + '). '
       + 'Dejó de ser hipotético: revisa qué quiso decir quien los capturó');

    // ══ [5] CONTROL POSITIVO · en BASE la bandera no apaga nada ═══════════
    console.log('\n[5] CONTROL POSITIVO · la misma siembra en BASE');
    const B = await conPagina(uB, async (p) => ({
      sinPrecios: await ver(p, EV_BANDERA, SIN_PRECIOS),
      conPrecios: await ver(p, EV_BANDERA, CON_PRECIOS),
    }));
    Object.keys(B).forEach((k) => pinta('BASE ' + k, B[k]));
    af(!B.sinPrecios.oculto,
       'en BASE la bandera YA escondía el paquete: entonces [1] no prueba nada');
    af(B.conPrecios.comprable && /\$3,200/.test(B.conPrecios.txt),
       '🔴 la premisa del DEFECTO no se sostiene: en BASE, con la bandera puesta y precios, el paquete debía '
       + 'salir COMPRABLE a $3,200 — es el hoyo que esta tuerca cierra. Salió: ' + JSON.stringify(B.conPrecios));
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
