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
// ⚰️ [GANADOR-PODA-1] Aquí vivía `artistaDelArbol`, que sacaba el artista del
// catálogo del árbol medido para carear la petición a Deezer. Se fue con la
// muestra de 30 s, y con ella la proyección `artista` del catálogo.
const PEDIDOS_FOTO = [];
// ⚰️ [GANADOR-PODA-1] Aquí vivía `wavSilencio`, medio segundo de silencio en
// WAV para probar que el botón de play alternaba de verdad. Se fue con la
// muestra.
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
// 🔒 LA MEDIDA SE LEE DE LOS BYTES DEL ARCHIVO, que es la única prueba de que
// la story salió 1080×1920: creerle al mensaje de la pantalla sería creerle al
// que lo escribió.
//
// ⚰️ [GANADOR-PODA-1] Antes esto leía el IHDR de un PNG. La story pasó a JPEG
// al 92 % —el PNG pesaba 2.28 MB medidos y en JPEG son ~300 KB—, así que ahora
// se camina el flujo JPEG hasta su SOF y se leen alto y ancho de ahí. La
// aserción del formato entra al contrato: un PNG con extensión .jpg pasaría
// desapercibido en la galería y reventaría el peso otra vez.
function medidaJPG(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;   // SOI
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0/1/2/3, 5-7, 9-11, 13-15: los que llevan las dimensiones.
    if ((m >= 0xC0 && m <= 0xCF) && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  return null;
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
      },
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
    // ⚰️ Aquí se servían el WAV del careo y la respuesta de la function
    // `deezer`. Se fueron con la muestra: hoy `/sorteo` no debe pedir ninguna
    // de las dos, y el escenario A lo exige.
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

  // ── A · ⚰️ RETIRADO + GUARDIA VIVA: LA IMAGEN YA NO VISTE LA TARJETA ────
  //
  // Aquí se medía EN QUÉ SEGUNDO pedía el navegador `karol-g.jpg` (0 antes del
  // final, la primera en el ms 63 006) y que el mueble quedara vestido. Todo
  // eso se RETIRA por GANADOR-PODA-1: Memo la quitó de la tarjeta y de la story
  // —«genera mucho caos en el diseño de web, mobile y story»—, así que esas
  // aserciones exigirían hoy deshacer una decisión suya. Se retiran CON SU
  // RAZÓN, no en silencio: alguien que las «arregle» para que pasen estaría
  // revirtiendo la poda sin enterarse.
  //
  // ⚰️ Y con ellas se va su PAR: BASE (9820489) tampoco pedía la imagen —la
  // trajo la propia PR B—, así que ya no hay dos lados que comparar. Lo que
  // queda es una GUARDIA VIVA: `/sorteo` no debe pedir esa imagen NUNCA.
  // ⚠️ La imagen sigue viva en `/giveaway` y ESO NO SE MIDE AQUÍ: esta guardia
  // es de `/sorteo`.
  console.log('\n── A · guardia: /sorteo no pide karol-g.jpg en todo el show ──');
  {
    PEDIDOS.length = 0;
    ARRANQUE = Date.now(); RES = 'pendiente';
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    const img = [], deez = [];
    pg.on('request', (req) => {
      const u = req.url();
      if (u.indexOf('karol-g.jpg') !== -1) img.push(Date.now() - ARRANQUE);
      if (u.indexOf('functions/deezer') !== -1) deez.push(u);
    });
    await pg.goto('http://127.0.0.1:' + pH + '/sorteo.html', { waitUntil: 'load' });
    while (Date.now() - ARRANQUE < marcaRev + 3000) await pg.waitForTimeout(250);
    console.log('   el show completo: karol-g.jpg pedida ' + img.length + ' vez/veces'
      + ' · la function deezer, ' + deez.length);
    af(img.length === 0,
       '🔴 `/sorteo` volvió a pedir karol-g.jpg (en ms ' + JSON.stringify(img) + '): la poda'
       + ' de GANADOR-PODA-1 la saca de la tarjeta y de la story');
    // ⚰️ Y la otra mitad de la poda: la muestra de 30 s. Medido antes de
    // podar, la function `deezer` tiene DIEZ llamadores vivos (index ×2,
    // portal ×6, esferas ×2), así que la function NO se tocó — lo que se
    // exige aquí es que `/sorteo` no la llame.
    af(deez.length === 0,
       '🔴 `/sorteo` volvió a pedirle la canción a la function deezer: '
       + JSON.stringify(deez.slice(0, 2)));
    const vest = await pg.evaluate(() => {
      const c = document.querySelector('.mosaico-caja');
      return c ? getComputedStyle(c).backgroundImage : null;
    });
    af(!/karol-g/.test(String(vest)),
       '🔴 el mueble volvió a quedar vestido: background-image = ' + vest);
    af(errs.length === 0, 'errores en A: ' + JSON.stringify(errs.slice(0, 2)));
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
  console.log('\n── D · TODO el bloque del admin cabe en 390×844 ──');
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
     '🔴 las CINCO piezas ya NO caben: y=' + caben.top + '..' + caben.bot + ' en ' + caben.vh + 'px');
  af(caben.bot <= caben.vh - 8,
     '🔴 el reloj de 10 minutos queda pegado al borde o fuera: acaba en ' + caben.bot);
  // ── 🔴 [GANADOR-PODA-1] Y AHORA **TODO**, herramientas incluidas ─────────
  // Antes esto se REPORTABA sin aserción: las herramientas sumaban 315px bajo
  // el pliegue y se dijo en voz alta en vez de callarlo. Memo lo convirtió en
  // orden: los tres botones a dos columnas «que quepan sin scroll con el
  // bloque del ganador en 390×844». Así que ahora se EXIGE.
  af(h.acciones > 0 && h.acciones < 130,
     '🔴 los tres botones miden ' + h.acciones + 'px: en dos columnas tienen que bajar de'
     + ' 130 (apilados median 206)');
  af(caben.panBot !== null && caben.panBot <= caben.vh,
     '🔴 el panel del admin acaba en y=' + caben.panBot + ' y el viewport mide ' + caben.vh
     + ': todavía hay que hacer scroll para llegar a los botones');
  // Y el ORDEN de las dos columnas: «Aceptó» a lo ancho, los dos descartes
  // compartiendo renglón. Se mide por geometría, no por el CSS.
  const cols = await pg.evaluate(() => {
    const r = (id) => { const e = document.getElementById(id); if (!e) return null;
      const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top),
        w: Math.round(b.width) }; };
    return { si: r('si'), no: r('no'), nc: r('nocumple'), ancho: innerWidth };
  });
  console.log('   los botones: si ' + JSON.stringify(cols.si) + ' · no ' + JSON.stringify(cols.no)
            + ' · nocumple ' + JSON.stringify(cols.nc));
  af(cols.si && cols.no && cols.nc, '🔴 falta alguno de los tres botones');
  if (cols.si && cols.no && cols.nc) {
    af(cols.si.w > cols.no.w,
       '🔴 «Aceptó el premio» no va a lo ancho: ' + cols.si.w + ' contra ' + cols.no.w);
    af(cols.no.y === cols.nc.y,
       '🔴 los dos descartes no comparten renglón: y=' + cols.no.y + ' y ' + cols.nc.y);
    af(cols.no.x !== cols.nc.x, 'y van en columnas distintas');
  }
  af(caben.anchoDoc <= caben.anchoVista + 1,
     '🔴 la página desborda a lo ancho: ' + caben.anchoDoc + ' > ' + caben.anchoVista);
  await pg.close();

  // ── E, E2, F, G · ⚰️ RETIRADOS: LA MUESTRA DE 30 s YA NO EXISTE ─────────
  //
  // Aquí vivían cuatro escenarios de la muestra de música: que la pieza saliera
  // con el artista DERIVADO del catálogo, que el botón alternara play→pausa→play
  // (con su WAV generado), que sin `preview` la pieza NO se pintara (fail-soft),
  // y el control positivo de que en BASE no existía.
  //
  // ⚰️ TODO RETIRADO por GANADOR-PODA-1. Palabra de Memo: «si la gente le tiene
  // que dar play no le veo caso — elimínala». Sus aserciones exigirían hoy que
  // la pieza VOLVIERA, o sea deshacer su decisión; y el control positivo de G
  // («en BASE no existe») pasó a ser cierto en los DOS lados, que es justo la
  // forma de control positivo que caduca.
  //
  // Lo que sobrevive de todo eso es UNA guardia viva, arriba en el escenario A:
  // `/sorteo` no le pide nada a la function `deezer`. La function sigue en pie
  // con sus DIEZ llamadores (index ×2, portal ×6, esferas ×2) — medido antes de
  // podar, porque la poda se decide contando.

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
  const m1 = medidaJPG(conIg.buf);
  console.log('   con @: ' + conIg.nombre + ' · ' + JSON.stringify(m1) + ' · '
            + conIg.buf.length + ' bytes · «' + conIg.msg + '»');
  af(!!m1, '🔴 lo que bajó no es un JPEG legible');
  af(m1 && m1.w === 1080 && m1.h === 1920,
     '🔴 la story NO es 1080×1920: ' + JSON.stringify(m1));
  af(conIg.buf.length > 20000,
     '🔴 el archivo pesa ' + conIg.buf.length + ' bytes: está casi vacío, no se dibujó nada');
  // 🔴 Y EL PESO ES LA MITAD DE LA TUERCA: el PNG medía 2.28 MB y por eso se
  // cambió el formato. Un techo de 900 KB deja aire de sobra sobre los ~300 KB
  // esperados y caza una vuelta al PNG sin tener que adivinar el número.
  console.log('   pesa ' + Math.round(conIg.buf.length / 1024) + ' KB (el PNG pesaba 2231 KB)');
  af(conIg.buf.length < 900 * 1024,
     '🔴 la story pesa ' + Math.round(conIg.buf.length / 1024) + ' KB: se volvió al PNG'
     + ' o el JPEG no se está comprimiendo');
  af(/\.jpg$/.test(conIg.nombre) && /ganador-/.test(conIg.nombre),
     '🔴 el archivo no se llama .jpg por el ganador: ' + conIg.nombre);
  // 🔒 Y la extensión no basta: se comprueba que los BYTES sean JPEG.
  af(conIg.buf[0] === 0xFF && conIg.buf[1] === 0xD8,
     '🔴 la extensión dice .jpg pero los bytes no son JPEG');
  // 🔒 LA FOTO ENTRÓ POR `foto_datauri`, que es la puerta que evita el canvas
  // contaminado. Si hubiera entrado por una url firmada, no habría archivo.
  af(PEDIDOS_FOTO.length === 1 && PEDIDOS_FOTO[0] === GANADOR.id,
     '🔴 la foto no se pidió por `foto_datauri` con el registro del ganador: '
     + JSON.stringify(PEDIDOS_FOTO));

  // 3 · EL INTERRUPTOR DEL @ CAMBIA EL ARCHIVO. Sin esto, el interruptor
  // podría no estar conectado a nada y el careo no lo notaría.
  const sinIgPng = await bajar(false);
  const m2 = medidaJPG(sinIgPng.buf);
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
