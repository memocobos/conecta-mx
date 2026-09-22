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
const CAT = require(RAIZ + '/netlify/functions/_lib/catalogo-index.js');
// 🔒 EL ARTISTA NO SE TECLEA NI EN EL CAREO. Se saca del catálogo del ÁRBOL
// MEDIDO con el mismo parser y la misma llave que usa producción, así que la
// aserción compara «lo que la página pidió» contra «lo que el catálogo dice»,
// no contra un literal mío que podría estar de acuerdo con mi propio bug.
function artistaDelArbol(dir) {
  try {
    const ev = CAT._parseEV(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'));
    const e = (ev || []).find((x) => x && x.id === G.EVENTO_CATALOGO);
    return (e && e.img) ? String(e.img) : null;
  } catch (e) { return null; }
}
const PEDIDOS_DEEZER = [];
const PEDIDOS_FOTO = [];
// 🔴 UN AUDIO DE VERDAD, GENERADO. Para probar que el botón ALTERNA hace falta
// que `play()` no se rechace, y una url inventada de `dzcdn.net` no resuelve en
// el navegador del careo: el audio se queda pausado y el icono no cambia —el
// rojo era del arnés, no del botón—. Así que el careo sirve medio segundo de
// silencio en WAV y mide el botón contra ESO, y deja la url con forma de
// producción para medir la tubería. Dos preguntas, dos fuentes.
function wavSilencio(ms) {
  const hz = 8000, n = Math.round(hz * ms / 1000);
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(hz, 24); b.writeUInt32LE(hz, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write('data', 36); b.writeUInt32LE(n, 40);
  b.fill(128, 44);
  return b;
}
// ⚠️ CUATRO SEGUNDOS, no medio: con 600 ms el clip YA HABÍA TERMINADO para el
// tercer clic, así que `paused` era true por haber acabado —no por un defecto—
// y la aserción del interruptor se puso roja midiendo mi fixture. La premisa de
// un caso («todavía está sonando») tiene que ALCANZARSE para que el caso mida.
const WAV = wavSilencio(4000);
// Un PNG de verdad para `foto_datauri`: 4×4 rojo, construido con zlib. Un
// literal de 1×1 copiado de internet también serviría, pero construirlo deja
// claro qué bytes son y permite cambiarlo si un día hace falta otro tamaño.
function pngRojo(n) {
  const zlib = require('zlib');
  const crc = (buf) => { let c = ~0;
    for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
    return (~c) >>> 0; };
  const trozo = (tipo, datos) => {
    const t = Buffer.from(tipo, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
    const cs = Buffer.alloc(4); cs.writeUInt32BE(crc(Buffer.concat([t, datos])));
    return Buffer.concat([len, t, datos, cs]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; ihdr[9] = 2;                       // 8 bits, RGB
  const cruda = Buffer.concat(Array.from({ length: n }, () =>
    Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: n },
      () => Buffer.from([220, 40, 60])))])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', ihdr), trozo('IDAT', zlib.deflateSync(cruda)), trozo('IEND', Buffer.alloc(0))]);
}
const FOTO_DATAURI = 'data:image/png;base64,' + pngRojo(4).toString('base64');
// Lee el IHDR de un PNG: es la ÚNICA prueba de que la story salió 1080×1920.
// Creerle al mensaje de la pantalla sería creerle al que la escribió.
function medidaPNG(buf) {
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
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
// 🔒 HEAD ANCLADO A UN COMMIT FIJO, no a `HEAD`. Con `HEAD` el careo mediría
// SIEMPRE el árbol de hoy, así que dentro de tres tuercas estaría midiendo
// código ajeno y culpando a esta PR de lo que otros cambien. `6abbf1f` es el
// commit que trae las cuatro piezas.
//   · careo CONGELADO (el default): reproducible, no caduca.
//   · vigilante VIVO: `HEAD_SHA=HEAD npm run mide:ganador-b`, que remide el
//     árbol de hoy contra el MISMO BASE — útil el día que alguien toque esto.
const HEAD_SHA = process.env.HEAD_SHA || '6abbf1f';
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
let ARTISTA = null;               // se llena del catálogo del árbol medido
let DEEZER = { preview: 'https://cdns-preview-x.dzcdn.net/stream/careo-30s.mp3',
               title: 'Provenza', artist: 'KAROL G' };
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
      momento_finalistas_en_ms: TI.momentoFinalistasMs(escalones),
      // Como en producción: derivado del catálogo y SOLO con el ganador ya
      // revelado (la ruta es caliente y el catálogo no se pide en cada latido).
      artista: rev ? ARTISTA : null },
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
        if (b.accion === 'foto_datauri') {
          if (!b.registro_id) return r.end(JSON.stringify({ ok: false, error: 'Falta el participante' }));
          PEDIDOS_FOTO.push(b.registro_id);
          return r.end(JSON.stringify({ ok: true, foto_estado: 'aprobada', datauri: FOTO_DATAURI }));
        }
        if (b.accion === 'pendientes_foto') return r.end(JSON.stringify({ ok: true, pendientes: 0 }));
        return r.end(JSON.stringify({ ok: true }));
      });
    }
    if (u === '/careo-30s.wav') {
      r.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': WAV.length });
      return r.end(WAV);
    }
    if (/\.netlify\/functions\/deezer/.test(u)) {
      PEDIDOS_DEEZER.push(q.url);
      r.writeHead(200, { 'Content-Type': 'application/json' });
      return r.end(JSON.stringify(DEEZER || {}));
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
  // 🔒 EL BLOQUE SON LAS CINCO PIEZAS QUE ENUMERÓ MEMO: «la foto, y debajo
  // nombre completo, ciudad, premio y el reloj de 10 minutos». Se mide de la
  // tarjeta al RELOJ, que es donde acaba su lista.
  //
  // ⚠️ Lo que va DESPUÉS del reloj son HERRAMIENTAS —el teléfono, las dos
  // puertas de contacto, los tres botones y «Ver de nuevo»— y se REPORTAN con
  // su número, sin aserción: con token suman 315px y sí piden desplazarse.
  // Se dice aquí, medido, para que la decisión sea de Memo y no un silencio.
  const caben = await pg.evaluate(() => {
    const vis = (e) => {
      if (!e || e.hidden || e.offsetParent === null) return false;
      const cs = getComputedStyle(e);
      return cs.visibility !== 'hidden' && Number(cs.opacity) > .05;
    };
    const caja = (e) => (e ? e.getBoundingClientRect() : null);
    const g = document.querySelector('.mos.gana');
    const pl = document.getElementById('placa-ganador');
    const rl = document.getElementById('reloj');
    const pan = document.getElementById('panel');
    const ps = [g, pl, rl].filter(vis);
    const rs = ps.map((e) => e.getBoundingClientRect());
    const alto = (id) => { const e = document.getElementById(id);
      return vis(e) ? Math.round(e.getBoundingClientRect().height) : 0; };
    return { hay: ps.length, vh: innerHeight, scrollY: Math.round(scrollY),
             top: rs.length ? Math.round(Math.min.apply(null, rs.map((r) => r.top))) : null,
             bot: rs.length ? Math.round(Math.max.apply(null, rs.map((r) => r.bottom))) : null,
             panBot: vis(pan) ? Math.round(caja(pan).bottom) : null,
             herramientas: { tel: alto('tel'), contacto: alto('contacto'),
                             acciones: alto('acciones'), repetir: alto('repetir') },
             anchoDoc: document.documentElement.scrollWidth, anchoVista: innerWidth };
  });
  const h = caben.herramientas;
  console.log('   el bloque (foto → reloj): y=' + caben.top + '..' + caben.bot + ' en '
            + caben.vh + 'px (scrollY ' + caben.scrollY + ')');
  console.log('   y debajo, las herramientas de admin: tel ' + h.tel + ' · contacto '
            + h.contacto + ' · botones ' + h.acciones + ' · repetir ' + h.repetir
            + ' = ' + (h.tel + h.contacto + h.acciones + h.repetir) + 'px, hasta y=' + caben.panBot);
  af(caben.hay === 3, '🔴 el bloque del ganador no está completo: ' + caben.hay + ' de 3 (foto, placa, reloj)');
  af(caben.top !== null && caben.top >= 0 && caben.bot <= caben.vh,
     '🔴 con la imagen y el contacto las CINCO piezas ya NO caben: y=' + caben.top + '..'
     + caben.bot + ' en ' + caben.vh + 'px');
  // 🔒 Y el reloj tiene que estar DENTRO, que es la pieza que la #751 dejaba
  // 155px bajo el pliegue: es el caso que hace útil esta aserción.
  af(caben.bot <= caben.vh - 8,
     '🔴 el reloj de 10 minutos queda pegado al borde o fuera: acaba en ' + caben.bot);
  af(caben.anchoDoc <= caben.anchoVista + 1,
     '🔴 la página desborda a lo ancho: ' + caben.anchoDoc + ' > ' + caben.anchoVista);
  await pg.close();

  // ── E · LA MUESTRA DE 30 s ──────────────────────────────────────────────
  console.log('\n── E · la muestra de 30 s, con botón de play ──');
  ARTISTA = artistaDelArbol(head.dir);
  af(!!ARTISTA, '🔴 no se pudo derivar el artista del catálogo del árbol medido');
  console.log('   el artista, DERIVADO del catálogo de HEAD: ' + JSON.stringify(ARTISTA));
  PEDIDOS_DEEZER.length = 0;
  ARRANQUE = Date.now() - (marcaRev + 4000);
  pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
  const errsE = []; pg.on('pageerror', (e) => errsE.push(e.message));
  await pg.goto('http://127.0.0.1:' + pH + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(2600);
  const mu = await pg.evaluate(() => {
    const c = document.getElementById('muestra'), au = document.getElementById('m-audio');
    const bt = document.getElementById('m-play'), ic = document.getElementById('m-icono');
    const ve = (e) => !!e && !e.hidden && e.offsetParent !== null;
    return { ve: ve(c), tit: (document.getElementById('m-tit') || {}).textContent,
             src: au ? (au.getAttribute('src') || '') : null,
             pausado: au ? au.paused : null, icono: ic ? ic.getAttribute('href') : null,
             hayBoton: ve(bt), iframes: document.querySelectorAll('iframe').length };
  });
  console.log('   la pieza: ' + JSON.stringify({ ve: mu.ve, tit: mu.tit, icono: mu.icono }));
  console.log('   se le pidió a la function: ' + JSON.stringify(PEDIDOS_DEEZER));
  af(mu.ve, '🔴 la muestra no se ve tras la revelación');
  af(mu.hayBoton, '🔴 no hay botón de play');
  // 🔒 LA PETICIÓN LLEVA EL ARTISTA DEL CATÁLOGO, no un nombre tecleado.
  af(PEDIDOS_DEEZER.length === 1,
     '🔴 la function se pidió ' + PEDIDOS_DEEZER.length + ' veces (las urls de Deezer'
     + ' caducan: se pide UNA, al armar la tarjeta)');
  af(PEDIDOS_DEEZER.length === 1
     && PEDIDOS_DEEZER[0].indexOf('q=' + encodeURIComponent(ARTISTA)) !== -1,
     '🔴 la petición no lleva el artista DERIVADO («' + ARTISTA + '»): ' + PEDIDOS_DEEZER[0]);
  af(PEDIDOS_DEEZER.length === 1 && /type=track/.test(PEDIDOS_DEEZER[0]),
     'y pide el tipo `track`, que es el que trae el preview');
  af(mu.src === DEEZER.preview,
     '🔴 el `<audio>` no quedó con la url del preview: ' + mu.src);
  af(/dzcdn\.net/.test(String(mu.src)),
     '🔒 y el audio sale de `*.dzcdn.net`, que es lo que el CSP permite en `media-src`');
  af(String(mu.tit).indexOf(DEEZER.title) !== -1,
     '🔴 el título no es el que dijo la function: ' + mu.tit);
  af(mu.pausado === true, '🔒 NADA suena solo: el audio nace pausado');
  af(mu.icono === '#ic-play', 'y el botón muestra el play, dio ' + mu.icono);
  // 🔒 NI UN IFRAME: el reproductor OFICIAL no cabe en el CSP y no se metió.
  af(mu.iframes === 0,
     '🔴 apareció un iframe en la página: el CSP dice frame-src \'self\' y un'
     + ' reproductor incrustado de terceros no cargaría');
  af(errsE.length === 0, 'errores en E: ' + JSON.stringify(errsE.slice(0, 2)));
  await pg.close();

  // ── E2 · EL BOTÓN ALTERNA DE VERDAD, con un audio que sí se puede oír ───
  console.log('\n── E2 · el botón: play → pausa → play ──');
  DEEZER = { preview: '/careo-30s.wav', title: 'Silencio', artist: 'Careo' };
  ARRANQUE = Date.now() - (marcaRev + 4000);
  pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
  await pg.goto('http://127.0.0.1:' + pH + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(2600);
  const leer = () => pg.evaluate(() => {
    const au = document.getElementById('m-audio'), ic = document.getElementById('m-icono');
    return { pausado: au ? au.paused : null, icono: ic ? ic.getAttribute('href') : null,
             etiqueta: (document.getElementById('m-play') || {}).ariaLabel || null };
  });
  const e0 = await leer();
  af(e0.pausado === true && e0.icono === '#ic-play',
     '🔒 nace pausado y con el play: ' + JSON.stringify(e0));
  await pg.click('#m-play');
  await pg.waitForTimeout(500);
  const e1 = await leer();
  console.log('   tras el primer clic: ' + JSON.stringify(e1));
  af(e1.pausado === false, '🔴 el botón no arrancó la muestra: ' + JSON.stringify(e1));
  af(e1.icono === '#ic-pausa', '🔴 el icono no cambió a pausa: ' + e1.icono);
  await pg.click('#m-play');
  await pg.waitForTimeout(400);
  const e2 = await leer();
  console.log('   tras el segundo: ' + JSON.stringify(e2));
  af(e2.pausado === true, '🔴 el segundo clic no pausó: ' + JSON.stringify(e2));
  af(e2.icono === '#ic-play', '🔴 el icono no volvió al play: ' + e2.icono);
  // 🔒 Y APAGAR EL SONIDO CALLA LA CANCIÓN: si el interruptor no la callara,
  // el letrero «Activar sonido» estaría mintiendo.
  await pg.click('#m-play');
  await pg.waitForTimeout(400);
  const e3 = await leer();
  af(e3.pausado === false,
     '🔒 PREMISA del caso: tiene que estar SONANDO para poder medir que el '
     + 'interruptor la calla. Dio ' + JSON.stringify(e3));
  await pg.click('#son');            // lo ENCIENDE
  await pg.waitForTimeout(250);
  await pg.click('#son');            // y lo APAGA
  await pg.waitForTimeout(400);
  const e4 = await leer();
  console.log('   tras apagar el sonido: ' + JSON.stringify(e4));
  af(e4.pausado === true,
     '🔴 apagar el sonido no calló la canción: ' + JSON.stringify(e4));
  await pg.close();

  // ── F · SIN CANCIÓN, NO HAY PIEZA (fail-soft) ───────────────────────────
  console.log('\n── F · sin canción, la pieza no existe ──');
  for (const [caso, resp] of [['la function contesta sin preview', { title: 'x' }],
                              ['la function contesta vacío', {}]]) {
    DEEZER = resp;
    PEDIDOS_DEEZER.length = 0;
    ARRANQUE = Date.now() - (marcaRev + 4000);
    pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const errsF = []; pg.on('pageerror', (e) => errsF.push(e.message));
    await pg.goto('http://127.0.0.1:' + pH + '/sorteo.html', { waitUntil: 'load' });
    await pg.waitForTimeout(2600);
    const f = await pg.evaluate(() => {
      const c = document.getElementById('muestra');
      return { ve: !!c && !c.hidden && c.offsetParent !== null,
               gana: document.querySelectorAll('.mos.gana').length };
    });
    console.log('   ' + caso + ' → pieza visible: ' + f.ve + ' · ganador en pie: ' + f.gana);
    af(!f.ve, '🔴 ' + caso + ': la pieza se pintó con un botón que no suena');
    af(f.gana === 1, '🔒 y el ganador sigue en pie: el show no se cae por una canción');
    af(errsF.length === 0, caso + ': errores: ' + JSON.stringify(errsF.slice(0, 2)));
    await pg.close();
  }
  DEEZER = { preview: 'https://cdns-preview-x.dzcdn.net/stream/careo-30s.mp3',
             title: 'Provenza', artist: 'KAROL G' };

  // ── G · CONTROL POSITIVO: en BASE no hay muestra ni se le pide nada ─────
  console.log('\n── G · en BASE no existe la muestra ──');
  PEDIDOS_DEEZER.length = 0;
  ARRANQUE = Date.now() - (marcaRev + 4000);
  pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
  await pg.goto('http://127.0.0.1:' + pB + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(2600);
  const gB = await pg.evaluate(() => ({
    muestra: !!document.getElementById('muestra'),
    play: !!document.getElementById('m-play'),
  }));
  af(!gB.muestra && !gB.play,
     '🔒 CONTROL POSITIVO: en BASE no existe la pieza de música: ' + JSON.stringify(gB));
  af(PEDIDOS_DEEZER.length === 0,
     '🔒 CONTROL POSITIVO: BASE no le pide nada a la function de Deezer, pidió '
     + PEDIDOS_DEEZER.length);
  await pg.close();

  // ── H · EL STORY 1080×1920, PROBADO CON UNA EXPORTACIÓN REAL ───────────
  // 🔒 NO se mide «el botón existe» ni se le cree al mensaje de la pantalla:
  // se APRIETA el botón, se atrapa el archivo que baja y se le leen los bytes
  // del IHDR. Y que el archivo EXISTA es la prueba de que el canvas no quedó
  // contaminado: con una imagen de otro origen dentro, `toBlob` truena con
  // SecurityError y no baja nada.
  console.log('\n── H · el story 1080×1920, exportado de verdad ──');
  const ctxD = await nav.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });

  // 1 · ANTES DEL `acepto` NO EXISTE. Un story de alguien que todavía puede no
  // contestar es un anuncio que habría que desmentir.
  RES = 'pendiente';
  ARRANQUE = Date.now() - (marcaRev + 4000);
  pg = await ctxD.newPage();
  await pg.goto('http://127.0.0.1:' + pH + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(1300);
  await pg.evaluate(() => { const q = document.getElementById('puerta'); if (q) q.style.display = 'block'; });
  await pg.fill('#tok', 'tok-de-careo');
  await pg.press('#tok', 'Enter');
  await pg.waitForTimeout(1500);
  const stPend = await pg.evaluate(() => {
    const c = document.getElementById('story');
    return { ve: !!c && !c.hidden && c.offsetParent !== null };
  });
  af(!stPend.ve, '🔴 el story se ofrece ANTES de que acepte el premio');
  await pg.close();

  // 2 · CON EL `acepto`: se ofrece, y baja un PNG de 1080×1920.
  RES = 'acepto';
  PEDIDOS_FOTO.length = 0;
  ARRANQUE = Date.now() - (marcaRev + 4000);
  pg = await ctxD.newPage();
  const errsH = []; pg.on('pageerror', (e) => errsH.push(e.message));
  await pg.goto('http://127.0.0.1:' + pH + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(1300);
  await pg.evaluate(() => { const q = document.getElementById('puerta'); if (q) q.style.display = 'block'; });
  await pg.fill('#tok', 'tok-de-careo');
  await pg.press('#tok', 'Enter');
  await pg.waitForTimeout(1800);
  const stOk = await pg.evaluate(() => {
    const c = document.getElementById('story'), sw = document.getElementById('st-ig');
    return { ve: !!c && !c.hidden && c.offsetParent !== null,
             sw: !!sw, marcado: sw ? sw.checked : null };
  });
  af(stOk.ve, '🔴 con el premio aceptado el story no se ofrece');
  af(stOk.sw, '🔴 falta el interruptor del @ de Instagram');

  async function bajar(conIg) {
    await pg.evaluate((v) => {
      const sw = document.getElementById('st-ig');
      if (sw) sw.checked = v;
    }, conIg);
    const esperando = pg.waitForEvent('download', { timeout: 25000 });
    await pg.click('#st-bajar');
    const d = await esperando;
    const ruta = await d.path();
    const buf = fs.readFileSync(ruta);
    return { buf, nombre: d.suggestedFilename(),
             msg: await pg.evaluate(() => (document.getElementById('st-msg') || {}).textContent) };
  }

  const conIg = await bajar(true);
  const m1 = medidaPNG(conIg.buf);
  console.log('   con @: ' + conIg.nombre + ' · ' + JSON.stringify(m1) + ' · '
            + conIg.buf.length + ' bytes · «' + conIg.msg + '»');
  af(!!m1, '🔴 lo que bajó no es un PNG legible');
  af(m1 && m1.w === 1080 && m1.h === 1920,
     '🔴 la story NO es 1080×1920: ' + JSON.stringify(m1));
  af(conIg.buf.length > 20000,
     '🔴 el PNG pesa ' + conIg.buf.length + ' bytes: está casi vacío, no se dibujó nada');
  af(/\.png$/.test(conIg.nombre) && /ganador-/.test(conIg.nombre),
     'el archivo se llama por el ganador: ' + conIg.nombre);
  // 🔒 LA FOTO ENTRÓ POR `foto_datauri`, que es la puerta que evita el canvas
  // contaminado. Si hubiera entrado por una url firmada, no habría archivo.
  af(PEDIDOS_FOTO.length === 1 && PEDIDOS_FOTO[0] === GANADOR.id,
     '🔴 la foto no se pidió por `foto_datauri` con el registro del ganador: '
     + JSON.stringify(PEDIDOS_FOTO));

  // 3 · EL INTERRUPTOR DEL @ CAMBIA EL ARCHIVO. Sin esto, el interruptor
  // podría no estar conectado a nada y el careo no lo notaría.
  const sinIgPng = await bajar(false);
  const m2 = medidaPNG(sinIgPng.buf);
  console.log('   sin @: ' + JSON.stringify(m2) + ' · ' + sinIgPng.buf.length + ' bytes');
  af(m2 && m2.w === 1080 && m2.h === 1920, 'sin el @ también sale 1080×1920');
  af(sinIgPng.buf.length !== conIg.buf.length,
     '🔴 el interruptor del @ NO cambia el archivo: los dos PNG pesan '
     + conIg.buf.length + ' bytes, así que no está conectado a nada');
  af(errsH.length === 0, 'errores en H: ' + JSON.stringify(errsH.slice(0, 2)));
  await pg.close();

  // 4 · CONTROL POSITIVO: en BASE no hay story.
  ARRANQUE = Date.now() - (marcaRev + 4000);
  pg = await ctxD.newPage();
  await pg.goto('http://127.0.0.1:' + pB + '/sorteo.html', { waitUntil: 'load' });
  await pg.waitForTimeout(1200);
  const stBase = await pg.evaluate(() => ({
    story: !!document.getElementById('story'), bt: !!document.getElementById('st-bajar'),
  }));
  af(!stBase.story && !stBase.bt,
     '🔒 CONTROL POSITIVO: en BASE no existe el story: ' + JSON.stringify(stBase));
  await pg.close();
  await ctxD.close();
  RES = 'pendiente';

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
