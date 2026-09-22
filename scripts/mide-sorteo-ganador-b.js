#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-sorteo-ganador-b.js — PR B · LA TARJETA DEL GANADOR, VESTIDA
//
// 🔒 LOS DOS LADOS SON COMMITS DESDE LA PRIMERA CORRIDA, y no «el árbol de
// trabajo contra un commit»: cada lado se saca con `git archive` a su propio
// directorio y SE SIRVE de ahí. Así el careo no caduca al mergear y ninguna
// tuerca posterior queda acusada de lo que mide (la mitad que le faltaba a 11
// de 13 arneses de KH-4).
//
//     BASE = 9820489  el merge de la #751: ya trae el sorteo por rondas, el
//                     marco de campeón y la placa — pero NO la imagen, NI el
//                     contacto del ganador.
//     HEAD = $HEAD_SHA (default: el commit de HEAD)
//
// Se corre:  npm run mide:ganador-b      (o HEAD_SHA=<sha> node scripts/…)
// ══════════════════════════════════════════════════════════════════════════
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const RAIZ = path.join(__dirname, '..');
const TI = require(RAIZ + '/sorteo-tiempos.js');
const ESC = require(RAIZ + '/netlify/functions/_lib/sorteo-escalera.js');
process.env.PORTAL_SUPABASE_URL = process.env.PORTAL_SUPABASE_URL || 'https://careo.sb';
process.env.PORTAL_SUPABASE_SERVICE_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY || 'k';
const G = require(RAIZ + '/netlify/functions/_lib/giveaway.js');

const VESTIDO = '/imgs/giveaways/karol-g.jpg';
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
  fallos.slice(0, 12).forEach((f) => console.log('  · ' + f));
}
process.on('exit', () => { if (!completo) { /* el marcador ya lo dijo */ } });

// ── LOS DOS ÁRBOLES ───────────────────────────────────────────────────────
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '9820489';
const HEAD_SHA = process.env.HEAD_SHA || 'HEAD';
let base = null, head = null;
try { base = sacar(BASE, 'gb-base'); } catch (e) { console.error('no se pudo sacar BASE: ' + e.message); }
try { head = sacar(HEAD_SHA, 'gb-head'); } catch (e) { console.error('no se pudo sacar HEAD: ' + e.message); }

// ── EL ESTADO FALSO, con el show YA ACABADO o corriendo ───────────────────
const CIUDADES = ['Reynosa', 'Monterrey', 'San Nicolás de los Garza', 'Río Bravo'];
const padron = [];
for (let i = 1; i <= 40; i++) padron.push({ id: 'r' + i, nombre: 'Nombre' + i + ' Apellido' + i,
                                            folio: i, ciudad: CIUDADES[i % CIUDADES.length] });
const ciudadDe = (id) => (padron.find((x) => x.id === id) || {}).ciudad || null;
const escalones = TI.escalonesPara(40);
const rondas = ESC.construirEscalera(padron, escalones);
const momentos = TI.momentos(escalones);
const GANADOR = rondas.orden[0];

let ARRANQUE = Date.now();
let RES = 'pendiente';
let WA = '8990000001';            // 10 dígitos, como los guarda el registro
let IG = 'karla.m';
const PEDIDOS = [];               // toda url pedida, con su instante

function estado() {
  const t = Date.now() - ARRANQUE;
  const proy = ESC.proyectarRondas({ rondas, momentos, margenMs: TI.T.MARGEN_ADELANTO_MS,
    transcurridoMs: t, momentoDosMs: TI.momentoDosMs(escalones),
    fotoDeId: () => null, ciudadDeId: ciudadDe });
  const rev = !!proy.ganador_liberado;
  return { ok: true, total: 40, ahora: new Date().toISOString(), registro_cerrado: true,
    sorteo: '2026-10-01T21:00:00-05:00', modo: 'real',
    ultimo: { id: 'g1', intento: 1, resultado: RES,
      nombre: rev ? GANADOR.nombre : null, folio: rev ? GANADOR.folio : null,
      premio: rev ? G.PREMIOS[G.premioPorCiudad(ciudadDe(GANADOR.id))] : null,
      ciudad: rev ? ciudadDe(GANADOR.id) : null,
      total_participantes: 40, creado_at: new Date(ARRANQUE).toISOString(), de_cuantos: 40,
      escalones, escalon: null, es_regiro: false,
      rondas: proy.rondas, rondas_totales: proy.rondas_totales,
      siguiente_ronda_en_ms: proy.siguiente_ronda_en_ms,
      revelacion_en_ms: momentos[momentos.length - 1],
      dos: proy.dos || null,
      momento_dos_en_ms: TI.momentoDosMs(escalones),
      momento_finalistas_en_ms: TI.momentoFinalistasMs(escalones) },
    giros: [] };
}
// 🔒 `premio_texto` se DERIVA de `_lib`, igual que en producción: si el careo
// lo tecleara, probaría que la pantalla copia mi texto, no el del servidor.
function estadoAdmin() {
  return { ok: true, cadena: [], ultimo: {
    sorteo_id: 'g1', intento: 1, resultado: RES, descarte_motivo: null,
    nombre: GANADOR.nombre, whatsapp: WA, instagram: IG,
    ciudad: ciudadDe(GANADOR.id), foto_estado: 'aprobada', tiene_foto: true,
    registro_id: GANADOR.id,
    premio: G.premioPorCiudad(ciudadDe(GANADOR.id)),
    premio_texto: G.PREMIOS[G.premioPorCiudad(ciudadDe(GANADOR.id))],
    creado_at: new Date(ARRANQUE).toISOString(), es_regiro: false } };
}

function servidor(raiz) {
  return http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    PEDIDOS.push({ u, t: Date.now() - ARRANQUE });
    if (/giveaway-estado/.test(u)) {
      r.writeHead(200, { 'Content-Type': 'application/json' });
      return r.end(JSON.stringify(estado()));
    }
    if (/giveaway-sortear/.test(u)) {
      let cuerpo = '';
      q.on('data', (c) => { cuerpo += c; });
      return q.on('end', () => {
        let b = {}; try { b = JSON.parse(cuerpo || '{}'); } catch (_) {}
        r.writeHead(200, { 'Content-Type': 'application/json' });
        if (b.accion === 'estado_admin') return r.end(JSON.stringify(estadoAdmin()));
        if (b.accion === 'pendientes_foto') return r.end(JSON.stringify({ ok: true, pendientes: 0 }));
        return r.end(JSON.stringify({ ok: true }));
      });
    }
    if (/\.netlify\/functions\//.test(u)) {
      r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":false}');
    }
    const f = path.join(raiz, decodeURIComponent(u).replace(/^\//, '') || 'sorteo.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); return r.end('no'); }
      const tipo = /\.js$/.test(f) ? 'text/javascript'
        : /\.jpg$/.test(f) ? 'image/jpeg'
        : /\.css$/.test(f) ? 'text/css' : 'text/html; charset=utf-8';
      r.writeHead(200, { 'Content-Type': tipo }); r.end(b);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('\n── LOS DOS LADOS, LOS DOS COMMITS ──');
  af(!!base, '🔴 no se pudo extraer el árbol de BASE (' + BASE + ')');
  af(!!head, '🔴 no se pudo extraer el árbol de HEAD (' + HEAD_SHA + ')');
  if (!base || !head) { marcador(); process.exit(1); }
  console.log('   BASE = ' + base.sha.slice(0, 9) + '  (el merge de la #751)');
  console.log('   HEAD = ' + head.sha.slice(0, 9));
  af(base.sha !== head.sha, '🔴 BASE y HEAD son el MISMO commit: este careo no compara nada');

  const sBase = servidor(base.dir), sHead = servidor(head.dir);
  await new Promise((ok) => sBase.listen(0, '127.0.0.1', ok));
  await new Promise((ok) => sHead.listen(0, '127.0.0.1', ok));
  const pB = sBase.address().port, pH = sHead.address().port;
  const nav = await chromium.launch();

  // ── UNA CORRIDA COMPLETA DEL SHOW, mirando CUÁNDO se pide la imagen ─────
  // 🔴 NO se mide «se ve la imagen»: se mide EN QUÉ SEGUNDO la pide el
  // navegador. «Entra al revelarse, no durante el show» es una afirmación
  // sobre el TIEMPO, y una captura del final no la puede contestar.
  console.log('\n── A · la imagen entra al FINAL, no durante el show ──');
  const marcaFinal = TI.momentoFinalistasMs(escalones);
  const marcaRev = momentos[momentos.length - 1];
  for (const [etiqueta, puerto, esperado] of [['HEAD', pH, true], ['BASE', pB, false]]) {
    PEDIDOS.length = 0;
    ARRANQUE = Date.now(); RES = 'pendiente';
    const pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    const img = [];
    pg.on('request', (req) => {
      if (req.url().indexOf('karol-g.jpg') !== -1) img.push(Date.now() - ARRANQUE);
    });
    await pg.goto('http://127.0.0.1:' + puerto + '/sorteo.html', { waitUntil: 'load' });
    // Se espera hasta justo ANTES de que arranque el final.
    while (Date.now() - ARRANQUE < marcaFinal - 900) await pg.waitForTimeout(150);
    const antes = img.slice();
    // Y hasta pasada la revelación.
    while (Date.now() - ARRANQUE < marcaRev + 2500) await pg.waitForTimeout(200);
    const despues = img.slice();
    console.log('   ' + etiqueta + ': pedida ' + despues.length + ' vez/veces'
      + (despues.length ? ' (en ms: ' + despues.join(', ') + ')' : '')
      + ' · antes del final: ' + antes.length);
    af(antes.length === 0,
       '🔴 ' + etiqueta + ': la imagen se pidió DURANTE el show, en ms ' + JSON.stringify(antes)
       + ' — compite con las fotos del padrón');
    if (esperado) {
      af(despues.length >= 1,
         '🔴 HEAD: la imagen NUNCA se pidió, así que el mueble no se vistió');
      af(despues.length >= 1 && despues[0] >= marcaFinal - 1200,
         '🔴 HEAD: se pidió en el ms ' + despues[0] + ', antes de que arranque el final ('
         + marcaFinal + ')');
      af(despues.length >= 1 && despues[0] <= marcaRev,
         '🔴 HEAD: se pidió en el ms ' + despues[0] + ', DESPUÉS de la revelación ('
         + marcaRev + '): llegaría tarde al destello');
      // 🔒 UNA SOLA DESCARGA: el precargado del JS y la regla del CSS tienen
      // que apuntar a la MISMA url, o son dos peticiones del mismo archivo.
      af(new Set(despues).size <= 2 && despues.length <= 2,
         '🔴 la imagen se pidió ' + despues.length + ' veces: el precargado del JS y el'
         + ' CSS no están apuntando a la misma url');
      // Y el mueble, vestido de verdad: el fondo COMPUTADO lo trae.
      const vest = await pg.evaluate(() => {
        const c = document.querySelector('.mosaico-caja');
        if (!c) return null;
        const cs = getComputedStyle(c), pre = getComputedStyle(c, '::before');
        return { img: cs.backgroundImage, tam: cs.backgroundSize,
                 velo: pre.backgroundImage, gano: document.body.classList.contains('gano') };
      });
      af(vest && vest.gano, 'la página está en estado «gano»');
      af(vest && vest.img.indexOf('karol-g.jpg') !== -1,
         '🔴 el mueble NO quedó vestido: background-image = ' + JSON.stringify((vest || {}).img));
      af(vest && vest.tam === 'cover', 'y la imagen cubre el mueble, dio ' + (vest || {}).tam);
      af(vest && /gradient/.test(vest.velo),
         '🔴 falta el velo: la foto y los letreros del ganador no se leerían encima');
    } else {
      af(despues.length === 0,
         '🔒 CONTROL POSITIVO: en BASE la imagen NO EXISTE en la pantalla, y se pidió '
         + despues.length + ' veces. Si se pidiera, este careo no distingue la tuerca');
      const hayB = await pg.evaluate(() => !!document.getElementById('contacto'));
      af(!hayB, '🔒 CONTROL POSITIVO: en BASE tampoco existe el bloque de contacto');
    }
    af(errs.length === 0, etiqueta + ': errores de página: ' + JSON.stringify(errs.slice(0, 2)));
    await pg.close();
  }

  // ── B · EL CONTACTO DEL GANADOR: SOLO CON TOKEN ─────────────────────────
  console.log('\n── B · el contacto del ganador, solo con token ──');
  const mirarContacto = (pg) => pg.evaluate(() => {
    const c = document.getElementById('contacto');
    const wa = document.getElementById('c-wa'), ig = document.getElementById('c-ig');
    const ve = (e) => !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'
                    && Number(getComputedStyle(e).opacity) > .05;
    return { caja: ve(c), wa: ve(wa), ig: ve(ig),
             waHref: wa ? (wa.getAttribute('href') || '') : null,
             igHref: ig ? (ig.getAttribute('href') || '') : null,
             igTxt: ig ? ig.textContent.trim() : null,
             igOff: ig ? ig.getAttribute('aria-disabled') : null,
             cuerpo: document.body.innerText };
  });
  // El show ya pasó: se entra tarde y la página repite, pero el panel está.
  ARRANQUE = Date.now() - (marcaRev + 4000); RES = 'pendiente';
  let pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
  const errsB = []; pg.on('pageerror', (e) => errsB.push(e.message));
  await pg.goto('http://127.0.0.1:' + pH + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(1500);

  // 🔴 SIN TOKEN: ni la caja, ni el teléfono, ni el Instagram. Y no basta con
  // que el bloque esté oculto: el DATO no puede estar en la página.
  const sinTok = await mirarContacto(pg);
  af(!sinTok.caja, '🔴 el contacto del ganador se VE sin token');
  af(!sinTok.waHref, '🔴 sin token el botón de WhatsApp ya trae href: ' + sinTok.waHref);
  const fuente = await pg.content();
  af(fuente.indexOf(WA) === -1,
     '🔴 el WhatsApp del ganador está en la página SIN token');
  af(fuente.indexOf(IG) === -1,
     '🔴 el Instagram del ganador está en la página SIN token');

  // CON TOKEN.
  await pg.evaluate(() => {
    const p = document.getElementById('puerta');
    if (p) p.style.display = 'block';
  });
  // 🔒 SE ENTRA COMO ENTRA MEMO: no hay botón, el token se manda con Enter.
  // (Buscar un `#entrar` que no existe deja el careo midiendo la pantalla sin
  // token y llamándola «con token» — la puerta equivocada de siempre.)
  await pg.fill('#tok', 'tok-de-careo');
  await pg.press('#tok', 'Enter');
  await pg.waitForTimeout(1200);
  const conTok = await mirarContacto(pg);
  console.log('   con token: ' + JSON.stringify({ caja: conTok.caja, wa: conTok.wa, ig: conTok.ig,
    igTxt: conTok.igTxt }));
  console.log('   el href: ' + String(conTok.waHref).slice(0, 96) + '…');
  af(conTok.caja, '🔴 con token el contacto no se ve');
  af(conTok.wa && conTok.ig, '🔴 falta una de las dos puertas: ' + JSON.stringify(conTok));
  // 🔴 EL `52`: el registro guarda DIEZ dígitos «sin lada de país», así que un
  // wa.me sin el 52 abre un chat con NADIE.
  af(String(conTok.waHref).indexOf('https://wa.me/52' + WA + '?') === 0,
     '🔴 el wa.me no lleva el 52 delante de los 10 dígitos: ' + conTok.waHref);
  // Y el texto DERIVADO: el nombre del ganador y el premio de `_lib`, no un
  // texto tecleado en la pantalla.
  const esperadoPremio = G.PREMIOS[G.premioPorCiudad(ciudadDe(GANADOR.id))];
  const texto = decodeURIComponent(String(conTok.waHref).split('?text=')[1] || '');
  af(texto.indexOf(GANADOR.nombre) !== -1,
     '🔴 el mensaje no nombra al ganador: ' + texto);
  af(texto.indexOf(esperadoPremio) !== -1,
     '🔴 el mensaje no lleva el premio DERIVADO de `_lib`: ' + texto);
  af(conTok.igHref === 'https://instagram.com/' + IG,
     '🔴 el enlace de Instagram no es el del ganador: ' + conTok.igHref);
  af(conTok.igTxt === '@' + IG, 'y el botón dice su @, dijo ' + conTok.igTxt);
  af(errsB.length === 0, 'errores en B: ' + JSON.stringify(errsB.slice(0, 2)));
  await pg.close();

  // ── C · SIN INSTAGRAM: se queda A LA VISTA y APAGADO ────────────────────
  console.log('\n── C · un ganador sin Instagram ──');
  IG = '';
  ARRANQUE = Date.now() - (marcaRev + 4000);
  pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
  await pg.goto('http://127.0.0.1:' + pH + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => { const p = document.getElementById('puerta'); if (p) p.style.display = 'block'; });
  // 🔒 SE ENTRA COMO ENTRA MEMO: no hay botón, el token se manda con Enter.
  // (Buscar un `#entrar` que no existe deja el careo midiendo la pantalla sin
  // token y llamándola «con token» — la puerta equivocada de siempre.)
  await pg.fill('#tok', 'tok-de-careo');
  await pg.press('#tok', 'Enter');
  await pg.waitForTimeout(1200);
  const sinIg = await mirarContacto(pg);
  console.log('   sin Instagram: ' + JSON.stringify({ ig: sinIg.ig, txt: sinIg.igTxt,
    href: sinIg.igHref, off: sinIg.igOff }));
  af(sinIg.wa, 'el WhatsApp sigue ahí');
  af(sinIg.ig, '🔒 el botón de Instagram se queda A LA VISTA: que FALTE es un dato que Memo necesita ver');
  af(!sinIg.igHref, '🔴 sin Instagram el enlace sigue apuntando a algo: ' + sinIg.igHref);
  af(sinIg.igOff === 'true', 'y queda apagado con aria-disabled, dio ' + sinIg.igOff);
  af(/sin Instagram/.test(sinIg.igTxt || ''), 'y lo dice: ' + sinIg.igTxt);
  IG = 'karla.m';
  await pg.close();

  // ── D · EL BLOQUE DEL GANADOR SIGUE CABIENDO ────────────────────────────
  // 🔴 El mueble vestido cambió su `padding`, y el contacto AGREGA dos botones
  // al panel. Las dos cosas empujan, así que la medida de la #751 hay que
  // volver a tomarla: «cabía» no es una propiedad permanente.
  console.log('\n── D · con la imagen y el contacto, sigue cabiendo ──');
  ARRANQUE = Date.now() - (marcaRev + 4000);
  pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
  await pg.goto('http://127.0.0.1:' + pH + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => { const p = document.getElementById('puerta'); if (p) p.style.display = 'block'; });
  // 🔒 SE ENTRA COMO ENTRA MEMO: no hay botón, el token se manda con Enter.
  // (Buscar un `#entrar` que no existe deja el careo midiendo la pantalla sin
  // token y llamándola «con token» — la puerta equivocada de siempre.)
  await pg.fill('#tok', 'tok-de-careo');
  await pg.press('#tok', 'Enter');
  await pg.waitForTimeout(2500);
  const caben = await pg.evaluate(() => {
    const vis = (e) => {
      if (!e || e.hidden || e.offsetParent === null) return false;
      const cs = getComputedStyle(e);
      return cs.visibility !== 'hidden' && Number(cs.opacity) > .05;
    };
    const ps = [document.querySelector('.mos.gana'), document.getElementById('placa-ganador'),
                document.getElementById('panel')].filter(vis);
    const rs = ps.map((e) => e.getBoundingClientRect());
    return { hay: ps.length, vh: innerHeight, scrollY: Math.round(scrollY),
             top: rs.length ? Math.round(Math.min.apply(null, rs.map((r) => r.top))) : null,
             bot: rs.length ? Math.round(Math.max.apply(null, rs.map((r) => r.bottom))) : null,
             anchoDoc: document.documentElement.scrollWidth, anchoVista: innerWidth };
  });
  console.log('   el bloque: y=' + caben.top + '..' + caben.bot + ' en ' + caben.vh
            + 'px (scrollY ' + caben.scrollY + ')');
  af(caben.hay === 3, '🔴 el bloque del ganador no está completo: ' + caben.hay + ' de 3');
  af(caben.top !== null && caben.top >= 0 && caben.bot <= caben.vh,
     '🔴 con la imagen y el contacto el bloque ya NO cabe: y=' + caben.top + '..' + caben.bot
     + ' en ' + caben.vh + 'px');
  af(caben.anchoDoc <= caben.anchoVista + 1,
     '🔴 la página desborda a lo ancho: ' + caben.anchoDoc + ' > ' + caben.anchoVista);
  await pg.close();

  await nav.close();
  sBase.close(); sHead.close();
  completo = true;
  marcador();
  process.exit(rojo ? 1 : 0);
})().catch((e) => {
  console.error('\nARNÉS CAÍDO:', e.message, '\n', e.stack);
  marcador();
  process.exit(1);
});
