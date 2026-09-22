#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-ganador-quieto.js — GANADOR-QUIETO-1 · LA GANADORA SE QUEDA QUIETA
//
// 🔒 LOS DOS LADOS SON COMMITS DESDE LA PRIMERA CORRIDA, y no «el árbol de
// trabajo contra un commit»: cada lado se saca con `git archive` a su propio
// directorio y SE SIRVE de ahí. Así el careo no caduca al mergear y ninguna
// tuerca posterior queda acusada de lo que mide (la mitad que le faltaba a 11
// de 13 arneses de KH-4).
//
//     BASE = f816e5b  el main de hoy, que TIEMBLA: es el defecto que Memo vio
//                     en el ensayo, y el careo tiene que reproducirlo o no
//                     está midiendo nada.
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
const BASE = process.env.BASE || 'f816e5b';
// ⏳ `HEAD_SHA` se ancla al commit del arreglo ANTES del merge. Mientras la PR
// vive, el commit de HEAD es lo correcto — y el careo SIEMPRE sirve un commit,
// nunca el árbol sucio, porque lo saca con `git archive`.
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
// 🔴 DOS GIROS, CONMUTABLES: es la forma del camino que Memo usó en el ensayo
// —girar, «no contestó», girar otra vez—. Al cambiar el id, la página hace
// `SHOW = showDe(u)` SIN pasar por null, que es justo la condición en la que
// el reloj de la vuelta anterior sobrevive.
let GIRO = 'g1';
// 🔒 MODELA «REINICIAR GIROS» POR SU EFECTO REAL, no con un gancho inventado
// en la página: ese botón BORRA las filas, así que el estado deja de traer
// `ultimo` — y es ESE `ultimo: null` el que hace `SHOW = null` en la página.
// (Mi primera versión llamaba a un `window.__sorteoReset()` que no existe.)
let SIN_GIRO = false;
let WA = '8990000001';            // 10 dígitos, como los guarda el registro
let ARTISTA = null;               // se llena del catálogo del árbol medido
let DEEZER = { preview: 'https://cdns-preview-x.dzcdn.net/stream/careo-30s.mp3',
               title: 'Provenza', artist: 'KAROL G' };
let IG = 'karla.m';
const PEDIDOS = [];               // toda url pedida, con su instante

function estado() {
  if (SIN_GIRO) {
    return { ok: true, total: 40, ahora: new Date().toISOString(), registro_cerrado: true,
      sorteo: '2026-10-01T21:00:00-05:00', modo: 'real', ultimo: null, giros: [] };
  }
  const t = Date.now() - ARRANQUE;
  const proy = ESC.proyectarRondas({ rondas, momentos, margenMs: TI.T.MARGEN_ADELANTO_MS,
    transcurridoMs: t, momentoDosMs: TI.momentoDosMs(escalones),
    fotoDeId: () => null, ciudadDeId: ciudadDe });
  const rev = !!proy.ganador_liberado;
  return { ok: true, total: 40, ahora: new Date().toISOString(), registro_cerrado: true,
    sorteo: '2026-10-01T21:00:00-05:00', modo: 'real',
    ultimo: { id: GIRO, intento: (GIRO === 'g1' ? 1 : 2), resultado: RES,
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
  console.log('   BASE = ' + base.sha.slice(0, 9) + '  (el main que tiembla)');
  console.log('   HEAD = ' + head.sha.slice(0, 9));
  af(base.sha !== head.sha, '🔴 BASE y HEAD son el MISMO commit');

  const sBase = servidor(base.dir), sHead = servidor(head.dir);
  await new Promise((ok) => sBase.listen(0, '127.0.0.1', ok));
  await new Promise((ok) => sHead.listen(0, '127.0.0.1', ok));
  const pB = sBase.address().port, pH = sHead.address().port;
  const nav = await chromium.launch();
  const marcaFin = TI.momentoFinalistasMs(escalones);
  const marcaRev = momentos[momentos.length - 1];

  // 🔒 LA QUIETUD SE MIDE SOSTENIDA, NO EN UN INSTANTE. Un chequeo de un solo
  // momento cae entre dos tics de 120 ms y pierde exactamente la
  // re-aplicación: la tarjeta está quieta EN ESE FOTOGRAMA y temblando el
  // siguiente. Se toman muestras durante varios segundos y se exige que TODAS
  // digan lo mismo.
  //
  // Y se mide el ENVOLTORIO DE ADENTRO, no `.mos`: el temblor es un
  // `transform` sobre el hijo, así que `.mos` no se mueve NUNCA — medirlo daría
  // «quieta» también en plena vibración.
  async function vigilarQuietud(pg, ms, cada) {
    const muestras = [];
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      muestras.push(await pg.evaluate(() => {
        const g = document.querySelector('.mos.gana');
        if (!g) return { hay: false };
        const env = g.firstElementChild || g;
        const r = env.getBoundingClientRect();
        // TODAS las animaciones vivas de la tarjeta y de sus hijos, por nombre.
        const anim = [g].concat([].slice.call(g.querySelectorAll('*')))
          .map((e) => getComputedStyle(e).animationName)
          .filter((x) => x && x !== 'none');
        return { hay: true,
                 y: Math.round((r.top + scrollY) * 100) / 100,
                 x: Math.round(r.left * 100) / 100,
                 tiembla: g.querySelectorAll('.mos-tiembla').length,
                 envoltorios: g.querySelectorAll('.mos-env, .mos-tiembla').length,
                 anim: anim.join(',') };
      }));
      await pg.waitForTimeout(cada);
    }
    return muestras;
  }
  const veredicto = (ms) => {
    const vistas = ms.filter((m) => m.hay);
    const pos = [...new Set(vistas.map((m) => m.x + '/' + m.y))];
    const tmb = vistas.filter((m) => m.tiembla > 0).length;
    const anims = [...new Set(vistas.map((m) => m.anim).filter(Boolean))];
    const nidos = Math.max.apply(null, [0].concat(vistas.map((m) => m.envoltorios)));
    return { n: vistas.length, posiciones: pos.length, conTemblor: tmb, anims, nidos };
  };

  // ── A · EL CAMINO DEL ENSAYO: girar, no contestó, girar otra vez ────────
  // 🔴 ES LA CLASE DE CAMINOS, no el síntoma: lo que reproduce el defecto es
  // que `SHOW` se RENUEVE sin pasar por null mientras el reloj del final de la
  // vuelta anterior sigue vivo. Da igual si el disparador fue un re-giro, un
  // brinco de tiempo del ensayo o un latido tardío.
  for (const [etiqueta, puerto, esperaQuieta] of [['HEAD', pH, true], ['BASE', pB, false]]) {
    console.log('\n── A · ' + etiqueta + ' · re-giro con el reloj anterior vivo ──');
    GIRO = 'g1'; RES = 'pendiente';
    // La vuelta 1 entra justo antes del final: el reloj del temblor arranca…
    ARRANQUE = Date.now() - (marcaFin - 800);
    const pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://127.0.0.1:' + puerto + '/sorteo.html', { waitUntil: 'load' });

    // 🔒 CONTROL POSITIVO, y sin él el cero de abajo no dice nada: ANTES de la
    // revelación el temblor tiene que estar VIVO y MOVIÉNDOSE.
    let vivo = false, movio = false;
    for (let i = 0; i < 40 && !movio; i++) {
      const a = await pg.evaluate(() => {
        const e = document.querySelector('#mosaico .mos .mos-tiembla');
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { y: Math.round((r.top + scrollY) * 100) / 100, x: Math.round(r.left * 100) / 100 };
      });
      if (a) vivo = true;
      await pg.waitForTimeout(140);
      const b = await pg.evaluate(() => {
        const e = document.querySelector('#mosaico .mos .mos-tiembla');
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { y: Math.round((r.top + scrollY) * 100) / 100, x: Math.round(r.left * 100) / 100 };
      });
      if (a && b && (a.x !== b.x || a.y !== b.y)) movio = true;
    }
    console.log('   control positivo · temblor vivo: ' + vivo + ' · se mueve: ' + movio);
    af(vivo, '🔒 CONTROL POSITIVO: nunca apareció el temblor antes de la revelación en '
       + etiqueta + ', así que la medición de quietud no dice nada');
    af(movio, '🔒 CONTROL POSITIVO: el medidor NO VE moverse la tarjeta mientras tiembla en '
       + etiqueta);

    // …y ahora el RE-GIRO: cambia el id del giro y el show arranca de nuevo,
    // ya cerca de su revelación. El reloj de la vuelta 1 queda huérfano.
    GIRO = 'g2';
    ARRANQUE = Date.now() - (marcaRev - 2500);
    // Se CAZA la fase, no se adivina el instante.
    let gana = false;
    for (let i = 0; i < 90 && !gana; i++) {
      await pg.waitForTimeout(200);
      gana = await pg.evaluate(() => document.querySelectorAll('.mos.gana').length === 1);
    }
    af(gana, '🔴 ' + etiqueta + ': nunca se reveló un ganador en la segunda vuelta');
    if (gana) {
      await pg.waitForTimeout(900);
      const ms = await vigilarQuietud(pg, 4200, 150);
      const v = veredicto(ms);
      console.log('   ' + etiqueta + ': ' + v.n + ' muestras · posiciones distintas: '
        + v.posiciones + ' · muestras con temblor: ' + v.conTemblor
        + ' · envoltorios: ' + v.nidos + ' · animaciones: ' + JSON.stringify(v.anims));
      if (esperaQuieta) {
        af(v.n > 20, 'se tomaron suficientes muestras: ' + v.n);
        af(v.posiciones === 1,
           '🔴 LA GANADORA SE MUEVE tras anunciarse: ' + v.posiciones
           + ' posiciones distintas en ' + v.n + ' muestras de 4.2 s');
        af(v.conTemblor === 0,
           '🔴 la ganadora tiene `.mos-tiembla` vivo en ' + v.conTemblor + ' de ' + v.n
           + ' muestras: algo la volvió a poner a temblar');
        af(v.anims.every((a) => a.indexOf('tiembla') === -1),
           '🔴 la animación `tiembla` sigue viva en la ganadora: ' + JSON.stringify(v.anims));
        af(v.nidos <= 1,
           '🔴 envoltorios ANIDADOS en la ganadora (' + v.nidos + '): `temblar` reconstruyó'
           + ' el envoltorio porque lo buscaba por la clase que se le quita');
      } else {
        // 🔒 CONTROL POSITIVO DEL PAR: BASE tiene que REPROBAR este mismo
        // careo. Si BASE pasara, el verde de HEAD no distingue «lo arreglé»
        // de «no estoy midiendo».
        const falla = (v.posiciones > 1) || (v.conTemblor > 0)
          || v.anims.some((a) => a.indexOf('tiembla') !== -1);
        af(falla,
           '🔒 CONTROL POSITIVO EN ROJO: en BASE la ganadora se queda quieta, así que este'
           + ' careo NO reproduce el defecto que Memo vio. Dio ' + JSON.stringify(v));
        console.log('   (BASE reprueba, que es lo que debe hacer)');
      }
    }
    // ── EL LETRERO, leído de la pantalla ──────────────────────────────────
    const letrero = await pg.evaluate(() => ({
      quedan: (document.getElementById('mos-quedan') || {}).textContent,
      de: (document.getElementById('mos-de') || {}).textContent,
    }));
    console.log('   el encabezado: «' + letrero.quedan + '» · «' + letrero.de + '»');
    if (esperaQuieta) {
      af(letrero.quedan === 'Ganador', 'dice «Ganador», dijo ' + letrero.quedan);
      af(!/ronda\s*\d+\s*de\s*\d+/i.test(letrero.de || ''),
         '🔴 el letrero se quedó en la RONDA en la pantalla del ganador: «' + letrero.de + '»');
      // Decisión de Memo (22-sep): «1 de N · al azar», con la N DERIVADA.
      af(letrero.de === '1 de 40 · al azar',
         '🔴 el letrero no cierra el arco con «1 de N · al azar»: «' + letrero.de + '»');
    } else {
      af(/ronda\s*\d+\s*de\s*\d+/i.test(letrero.de || ''),
         '🔒 CONTROL POSITIVO: en BASE el letrero SÍ se queda en la ronda; dijo «'
         + letrero.de + '»');
    }
    af(errs.length === 0, etiqueta + ': errores de página: ' + JSON.stringify(errs.slice(0, 2)));
    await pg.close();
  }

  // ── B · EL OTRO CAMINO: el reset del ensayo (SHOW = null) ──────────────
  // El brinco de tiempo del ensayo pasa por `SHOW = null`, que es OTRA rama.
  // Se mide aparte porque un arreglo puede tapar una y dejar la otra.
  console.log('\n── B · tras un reset del ensayo, la ganadora también queda quieta ──');
  GIRO = 'g1'; RES = 'pendiente';
  ARRANQUE = Date.now() - (marcaFin - 800);
  let pg2 = await nav.newPage({ viewport: { width: 390, height: 844 } });
  const errs2 = []; pg2.on('pageerror', (e) => errs2.push(e.message));
  await pg2.goto('http://127.0.0.1:' + pH + '/sorteo.html', { waitUntil: 'load' });
  // Se deja temblar…
  let vivo2 = false;
  for (let i = 0; i < 40 && !vivo2; i++) {
    await pg2.waitForTimeout(140);
    vivo2 = await pg2.evaluate(() => !!document.querySelector('#mosaico .mos .mos-tiembla'));
  }
  af(vivo2, '🔒 CONTROL POSITIVO: el temblor tiene que estar vivo antes del reset');
  // …y se tira el estado como lo tira «Reiniciar giros»: la tabla queda vacía,
  // el estado deja de traer `ultimo` y la página hace `SHOW = null`. Se espera
  // a que la página LO VEA (su latido), no un instante adivinado.
  SIN_GIRO = true;
  let reposo = false;
  for (let i = 0; i < 60 && !reposo; i++) {
    await pg2.waitForTimeout(200);
    reposo = await pg2.evaluate(() => {
      const s = window.__sorteoShow ? window.__sorteoShow() : null;
      return s === null;
    });
  }
  af(reposo, '🔒 PREMISA: la página tiene que haber visto el reset (SHOW en null)');
  SIN_GIRO = false;
  GIRO = 'g2';
  ARRANQUE = Date.now() - (marcaRev - 2500);
  let gana2 = false;
  for (let i = 0; i < 90 && !gana2; i++) {
    await pg2.waitForTimeout(200);
    gana2 = await pg2.evaluate(() => document.querySelectorAll('.mos.gana').length === 1);
  }
  af(gana2, '🔴 tras el reset nunca se reveló un ganador');
  if (gana2) {
    await pg2.waitForTimeout(900);
    const v2 = veredicto(await vigilarQuietud(pg2, 3600, 150));
    console.log('   tras el reset: ' + v2.n + ' muestras · posiciones: ' + v2.posiciones
      + ' · con temblor: ' + v2.conTemblor + ' · envoltorios: ' + v2.nidos);
    af(v2.posiciones === 1 && v2.conTemblor === 0,
       '🔴 tras el reset del ensayo la ganadora se mueve: ' + JSON.stringify(v2));
  }
  af(errs2.length === 0, 'errores en B: ' + JSON.stringify(errs2.slice(0, 2)));
  await pg2.close();

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
