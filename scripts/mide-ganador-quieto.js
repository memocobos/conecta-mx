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
// Se corre:  npm run mide:ganador-quieto
//            (o HEAD_SHA=HEAD npm run mide:ganador-quieto, para remedir el
//             árbol de HOY contra el MISMO BASE)
//
// ⚠️ Este renglón decía `mide:ganador-b` — de la copia del arnés hermano. Lo
// cazó Jane leyendo la PR. Un comando de arranque equivocado en la cabecera
// manda a correr OTRO careo y a leer su verde como si fuera el de aquí.
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
// 🔒 UN SEGUNDO BASE PARA EL ESCENARIO D. El de arriba es anterior a #753, así
// que sirve para el huérfano; pero GANADOR-QUIETO-2 hay que carearlo contra el
// main que YA TRAE #753 —si no, el verde no distingue este arreglo del anterior.
const BASE2 = process.env.BASE2 || '3ac566e';
// 🔒 HEAD ANCLADO A UN COMMIT FIJO, no a `HEAD`. Con `HEAD` el careo mediría
// SIEMPRE el árbol de hoy, así que dentro de tres tuercas estaría midiendo
// código ajeno y culpándole a esta tuerca lo que otros cambien. `036e5df` es el
// commit cuyo árbol trae los tres candados y el letrero.
//   · careo CONGELADO (el default): reproducible, no caduca.
//   · vigilante VIVO: `HEAD_SHA=HEAD npm run mide:ganador-quieto`, que remide el
//     árbol de hoy contra el MISMO BASE — útil el día que alguien toque esto.
const HEAD_SHA = process.env.HEAD_SHA || 'HEAD';   // se ancla antes del merge
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
let VIEJO_MS = 0;      // >0 envejece el giro: el show llega como REPETICIÓN
let FOLIO_FALSO = 0;   // >0: `ultimo.folio` NO está en la rejilla
// 🔴 EL PADRON ES CONMUTABLE, y es lo que hace DETERMINISTA la carrera.
// Los dos giros comparten `SHOW.t0` una vez reemplazado, pero NO comparten
// `cuando`: con 40 participantes la revelacion cae en el segundo 76 y con 5
// cae en el 7.5. Asi el `esperarDato` del show viejo —que todavia espera su
// segundo 76— sigue vivo cuando el show nuevo YA REVELO a su ganador, y su
// reloj de temblor alcanza a la ganadora ya anunciada.
// Es un caso REAL del ensayo: borrar, sembrar menos, girar.
let CUANTOS = 40;
const padrones = {};
function datos() {
  if (!padrones[CUANTOS]) {
    const lista = [];
    for (let i = 1; i <= CUANTOS; i++) lista.push({ id: 'r' + CUANTOS + '-' + i,
      nombre: 'Nombre' + i + ' Apellido' + i, folio: i, ciudad: CIUDADES[i % CIUDADES.length] });
    const esc = TI.escalonesPara(CUANTOS);
    padrones[CUANTOS] = { lista, esc, rondas: ESC.construirEscalera(lista, esc),
                          mom: TI.momentos(esc) };
  }
  return padrones[CUANTOS];
}
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
  const D = datos();
  const proy = ESC.proyectarRondas({ rondas: D.rondas, momentos: D.mom,
    margenMs: TI.T.MARGEN_ADELANTO_MS, transcurridoMs: t,
    momentoDosMs: TI.momentoDosMs(D.esc), fotoDeId: () => null,
    ciudadDeId: (id) => (D.lista.find((x) => x.id === id) || {}).ciudad || null });
  const rev = !!proy.ganador_liberado;
  const G0 = D.rondas.orden[0];
  return { ok: true, total: CUANTOS, ahora: new Date().toISOString(), registro_cerrado: true,
    sorteo: '2026-10-01T21:00:00-05:00', modo: 'real',
    ultimo: { id: GIRO, intento: (GIRO === 'g1' ? 1 : 2), resultado: RES,
      nombre: rev ? G0.nombre : null,
      // 🔴 EL MECANISMO DE LA CAPTURA DE JANE, hecho determinista: el servidor
      // dice un folio que NO está en la rejilla, así que `fichaDe(folioG)`
      // devuelve null — exactamente lo que le pasó en el ensayo real. Da igual
      // POR QUÉ falló allá: lo que se mide es que la quietud no dependa de eso.
      folio: rev ? (FOLIO_FALSO || G0.folio) : null,
      premio: rev ? G.PREMIOS[G.premioPorCiudad(
        (D.lista.find((x) => x.id === G0.id) || {}).ciudad)] : null,
      ciudad: rev ? (D.lista.find((x) => x.id === G0.id) || {}).ciudad : null,
      total_participantes: CUANTOS, creado_at: new Date(ARRANQUE - VIEJO_MS).toISOString(),
      de_cuantos: CUANTOS,
      escalones: D.esc, escalon: null, es_regiro: false,
      rondas: proy.rondas, rondas_totales: proy.rondas_totales,
      siguiente_ronda_en_ms: proy.siguiente_ronda_en_ms,
      revelacion_en_ms: D.mom[D.mom.length - 1],
      dos: proy.dos || null,
      momento_dos_en_ms: TI.momentoDosMs(D.esc),
      momento_finalistas_en_ms: TI.momentoFinalistasMs(D.esc),
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
    nombre: datos().rondas.orden[0].nombre, whatsapp: WA, instagram: IG,
    ciudad: 'Reynosa', foto_estado: 'aprobada', tiene_foto: true,
    registro_id: datos().rondas.orden[0].id,
    premio: 'PLUS', premio_texto: G.PREMIOS.PLUS,
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
  // 🔒 SE CUENTAN LOS RELOJES VIVOS, instrumentando `setInterval` ANTES de que
  // corra el script de la página. Es la medición DIRECTA de la hipótesis: si
  // queda un reloj de 120 ms huérfano, aquí se ve — sin inferirlo del temblor.
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    window.__ivs = new Map();
    const si = window.setInterval, ci = window.clearInterval;
    window.setInterval = function (fn, ms) {
      const id = si.apply(window, arguments); window.__ivs.set(id, ms); return id;
    };
    window.clearInterval = function (id) { window.__ivs.delete(id); return ci.apply(window, arguments); };
    window.__relojes = () => { const c = {}; window.__ivs.forEach((ms) => { c[ms] = (c[ms] || 0) + 1; }); return c; };
  });
  const relojes120 = (pg) => pg.evaluate(() =>
    (window.__relojes ? (window.__relojes()['120'] || 0) : -1));
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
  // 🔒 SE ESPERA A QUE ACABE LA ANIMACIÓN DE ENTRADA, no un número de ms.
  // `mosGana` escala la tarjeta de 1 a 1.35 a 1.18 en .9 s: muestrear encima
  // da «se mueve» por una animación que SÍ debe moverse, y eso es un rojo de
  // instrumento, no un defecto. Se le pregunta al navegador por la animación
  // POR SU NOMBRE — esperar «a que no haya ninguna» se colgaría en BASE, donde
  // `tiembla` es infinita, que es justo lo que venimos a cazar.
  async function esperarEntrada(pg, msMax) {
    const t0 = Date.now();
    while (Date.now() - t0 < (msMax || 3000)) {
      const corriendo = await pg.evaluate(() => {
        const g = document.querySelector('.mos.gana');
        if (!g || !g.getAnimations) return false;
        return [g].concat([].slice.call(g.querySelectorAll('*')))
          .some((e) => e.getAnimations().some((a) =>
            a.playState === 'running' && String(a.animationName || '').indexOf('mosGana') !== -1));
      });
      if (!corriendo) return Date.now() - t0;
      await pg.waitForTimeout(100);
    }
    return -1;
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
    const pg = await ctx.newPage();
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

    // …y ahora el RE-GIRO, COMO PASA DE VERDAD: Memo pica «Girar» y el giro
    // nuevo nace con `creado_at` = AHORA, o sea t≈0.
    //
    // 🔴 ESTO ES EL CORAZÓN DEL CASO, y mi primera versión lo tenía al revés:
    // puse el giro nuevo cerca de SU revelación (t≈73 s), y entonces el
    // `esperarDato` de la vuelta 1 —que compara contra el `SHOW.t0` NUEVO y su
    // propio `cuando` viejo— también se disparaba y llamaba a su `limpiar()`,
    // matando el huérfano. Con t≈0 ese `esperarDato` se queda esperando y el
    // reloj de la vuelta 1 sigue temblando durante TODO el show de la vuelta 2.
    // El careo pasaba en verde midiendo un camino que se limpia solo.
    GIRO = 'g2';
    ARRANQUE = Date.now();
    // 🔴 AQUÍ SE MIDE EL HUÉRFANO, que es lo que el instrumento destapó: con el
    // reloj de la vuelta 1 vivo, las fichas de la vuelta 2 tiemblan DURANTE SU
    // PRESENTACIÓN — cuando nada debe temblar todavía. Es el mismo defecto que
    // reportó Memo (un reloj que resucita el temblor), visto en el momento en
    // que SÍ se puede reproducir.
    let orfano = { relojes: -1, tmb: 0, mos: 0, pintadas: -1 };
    for (let i = 0; i < 26; i++) {
      await pg.waitForTimeout(700);
      const f = await pg.evaluate(() => ({
        tmb: document.querySelectorAll('#mosaico .mos-tiembla').length,
        mos: document.querySelectorAll('#mosaico .mos').length,
        show: window.__sorteoShow ? window.__sorteoShow() : null,
      }));
      const r = await relojes120(pg);
      const pintadas = f.show ? f.show.pintadas : -1;
      // La ventana buena: la presentación de la vuelta 2 (ronda 0, con fichas).
      if (pintadas === 0 && f.mos > 0) {
        orfano = { relojes: r, tmb: f.tmb, mos: f.mos, pintadas };
        break;
      }
    }
    console.log('   durante la PRESENTACIÓN de la vuelta 2: relojes de 120 ms = '
      + orfano.relojes + ' · fichas ' + orfano.mos + ' · temblando ' + orfano.tmb);
    af(orfano.mos > 0,
       '🔒 PREMISA: había que cazar la presentación de la vuelta 2 y no se alcanzó');
    if (esperaQuieta) {
      af(orfano.relojes === 0,
         '🔴 quedó un reloj de temblor HUÉRFANO (' + orfano.relojes + ') durante la'
         + ' presentación del show siguiente');
      af(orfano.tmb === 0,
         '🔴 las fichas tiemblan durante la PRESENTACIÓN: ' + orfano.tmb + ' de ' + orfano.mos
         + ' — algo las está moviendo cuando nada debería');
    } else {
      // 🔒 CONTROL POSITIVO DEL PAR, y aquí SÍ muerde: en BASE el huérfano vive.
      af(orfano.relojes >= 1 && orfano.tmb > 0,
         '🔒 CONTROL POSITIVO EN ROJO: en BASE no quedó el reloj huérfano ('
         + orfano.relojes + ') ni temblaron las fichas (' + orfano.tmb + '), así que'
         + ' este careo NO reproduce el defecto');
    }

    // Se CAZA la fase, no se adivina el instante: el show entero son 82 s.
    let gana = false;
    const tope = Date.now() + TI.duracionTotal(escalones) + 20000;
    while (!gana && Date.now() < tope) {
      await pg.waitForTimeout(300);
      gana = await pg.evaluate(() => document.querySelectorAll('.mos.gana').length === 1);
    }
    af(gana, '🔴 ' + etiqueta + ': nunca se reveló un ganador en la segunda vuelta');
    if (gana) {
      const tEnt = await esperarEntrada(pg);
      console.log('   la animación de entrada acabó en ' + tEnt + 'ms');
      await pg.waitForTimeout(150);
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
        // ⚠️ AQUÍ **NO** SE EXIGE QUE BASE FALLE, y hay que decir por qué: por
        // este camino BASE llega con la ganadora QUIETA, porque el huérfano de
        // la vuelta 1 muere cuando su propio `esperarDato` alcanza su momento
        // —comparado contra el `SHOW.t0` NUEVO— justo antes de la revelación.
        // Medido, no supuesto: al revelarse ya no hay ningún reloj de 120 ms.
        //
        // 🔴 O SEA QUE ESTE CAREO **NO REPRODUCE LA CAPTURA DE MEMO**: prueba
        // el defecto de la MISMA CLASE (un reloj huérfano que resucita el
        // temblor) en la ventana donde sí se ve, y garantiza la quietud en
        // HEAD. Poner aquí un `af` que exigiera el rojo sería inventar un par
        // que no existe; dejarlo sin nota sería peor.
        console.log('   (por este camino BASE llega quieta: relojes de 120 ms al revelarse = '
          + (await relojes120(pg)) + ')');
        af(true, 'medido: por este camino el huérfano muere antes de la revelación');
      }
      // 🔒 Y LA ASERCIÓN ESTRUCTURAL, que no depende de ver temblar: tras la
      // revelación NO puede quedar ni un reloj de temblor vivo.
      const r120 = await relojes120(pg);
      if (esperaQuieta) {
        af(r120 === 0,
           '🔴 tras la revelación queda ' + r120 + ' reloj(es) de temblor vivo(s)');
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
  let pg2 = await ctx.newPage();
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
  ARRANQUE = Date.now();
  let gana2 = false;
  const tope2 = Date.now() + TI.duracionTotal(escalones) + 20000;
  while (!gana2 && Date.now() < tope2) {
    await pg2.waitForTimeout(300);
    gana2 = await pg2.evaluate(() => document.querySelectorAll('.mos.gana').length === 1);
  }
  af(gana2, '🔴 tras el reset nunca se reveló un ganador');
  if (gana2) {
    await esperarEntrada(pg2);
    await pg2.waitForTimeout(150);
    const v2 = veredicto(await vigilarQuietud(pg2, 3600, 150));
    console.log('   tras el reset: ' + v2.n + ' muestras · posiciones: ' + v2.posiciones
      + ' · con temblor: ' + v2.conTemblor + ' · envoltorios: ' + v2.nidos);
    af(v2.posiciones === 1 && v2.conTemblor === 0,
       '🔴 tras el reset del ensayo la ganadora se mueve: ' + JSON.stringify(v2));
  }
  af(errs2.length === 0, 'errores en B: ' + JSON.stringify(errs2.slice(0, 2)));
  await pg2.close();

  // ── C · 🔴 LA CARRERA, DETERMINISTA: EL HUÉRFANO ALCANZA A LA GANADORA ──
  //
  // Esto es la captura de Memo. Los dos giros comparten `SHOW.t0`, pero NO su
  // `cuando`: con 40 participantes la revelación cae en el segundo 76 y con 5
  // cae en el 7.5. Así el `esperarDato` del show viejo sigue esperando su
  // segundo 76 —o sea que su `limpiar()` NO ha corrido— cuando el show nuevo
  // YA REVELÓ a su ganadora, y su reloj de temblor la alcanza.
  //
  // 🔒 Y ES PERMANENTE: el temblor es una animación `infinite`, así que un solo
  // tic tardío se la pega para siempre. Matar el reloj después ya no la quita.
  // Por eso el defecto se veía intermitente y por eso una muestra tomada un
  // segundo más tarde podía no verlo: la carrera dura ~150 ms, pero lo que deja
  // NO SE VA.
  //
  // Es un caso REAL del ensayo: borrar, sembrar menos, girar.
  for (const [etiqueta, puerto, esperaQuieta] of [['HEAD', pH, true], ['BASE', pB, false]]) {
    console.log('\n── C · ' + etiqueta + ' · el huérfano alcanza a la ganadora ──');
    CUANTOS = 40; GIRO = 'g1'; RES = 'pendiente'; SIN_GIRO = false;
    ARRANQUE = Date.now() - (TI.momentoFinalistasMs(TI.escalonesPara(40)) - 800);
    const pg3 = await ctx.newPage();
    const errs3 = []; pg3.on('pageerror', (e) => errs3.push(e.message));
    await pg3.goto('http://127.0.0.1:' + puerto + '/sorteo.html', { waitUntil: 'load' });
    let vivo3 = false;
    for (let i = 0; i < 40 && !vivo3; i++) {
      await pg3.waitForTimeout(140);
      vivo3 = await pg3.evaluate(() => !!document.querySelector('#mosaico .mos .mos-tiembla'));
    }
    af(vivo3, '🔒 CONTROL POSITIVO: el temblor de la vuelta 1 tiene que estar vivo en ' + etiqueta);
    const antes = await relojes120(pg3);
    // El giro nuevo: OTRO id, OTRO tamaño de padrón, y nace en t≈0.
    CUANTOS = 5; GIRO = 'g2';
    ARRANQUE = Date.now();
    const escCorta = TI.escalonesPara(5);
    console.log('   vuelta 1 revelaba en el ms ' + TI.momentos(TI.escalonesPara(40)).slice(-1)[0]
      + ' · vuelta 2 revela en el ms ' + TI.momentos(escCorta).slice(-1)[0]
      + ' · relojes de 120 ms antes del cambio: ' + antes);
    let gana3 = false;
    const tope3 = Date.now() + TI.duracionTotal(escCorta) + 25000;
    while (!gana3 && Date.now() < tope3) {
      await pg3.waitForTimeout(250);
      gana3 = await pg3.evaluate(() => document.querySelectorAll('.mos.gana').length === 1);
    }
    af(gana3, '🔴 ' + etiqueta + ': la vuelta corta nunca reveló ganadora');
    if (gana3) {
      const r3 = await relojes120(pg3);
      const tEnt3 = await esperarEntrada(pg3);
      console.log('   la animación de entrada acabó en ' + tEnt3 + 'ms');
      await pg3.waitForTimeout(150);
      const v3 = veredicto(await vigilarQuietud(pg3, 3600, 150));
      console.log('   ' + etiqueta + ': relojes de 120 ms al revelarse = ' + r3
        + ' · ' + v3.n + ' muestras · posiciones: ' + v3.posiciones
        + ' · con temblor: ' + v3.conTemblor + ' · envoltorios: ' + v3.nidos
        + ' · animaciones: ' + JSON.stringify(v3.anims));
      if (esperaQuieta) {
        af(r3 === 0, '🔴 al revelarse la ganadora quedaba ' + r3 + ' reloj(es) de temblor vivo(s)');
        af(v3.posiciones === 1,
           '🔴 LA GANADORA SE MUEVE tras anunciarse: ' + v3.posiciones + ' posiciones en '
           + v3.n + ' muestras');
        af(v3.conTemblor === 0,
           '🔴 la ganadora quedó con `.mos-tiembla` en ' + v3.conTemblor + ' de ' + v3.n
           + ' muestras: el huérfano se la pegó, y una animación infinita no se va sola');
        af(v3.anims.every((a) => a.indexOf('tiembla') === -1),
           '🔴 la animación `tiembla` vive en la ganadora: ' + JSON.stringify(v3.anims));
        af(v3.nidos <= 1, '🔴 envoltorios ANIDADOS: ' + v3.nidos);
      } else {
        // 🔒 EL PAR: BASE tiene que REPROBAR exactamente esto.
        const falla = (v3.conTemblor > 0) || (v3.posiciones > 1)
          || v3.anims.some((a) => a.indexOf('tiembla') !== -1);
        af(falla,
           '🔒 CONTROL POSITIVO EN ROJO: en BASE la ganadora NO tembló por este camino'
           + ' (relojes=' + r3 + ', ' + JSON.stringify(v3) + '), así que el careo no'
           + ' reproduce la captura de Memo');
        if (falla) console.log('   🔴 BASE: la ganadora TIEMBLA ya anunciada — reproducido');
      }
    }
    af(errs3.length === 0, etiqueta + ': errores en C: ' + JSON.stringify(errs3.slice(0, 2)));
    await pg3.close();
  }
  CUANTOS = 40;

  // ── D · 🔴 GANADOR-QUIETO-2: LA CAPTURA DE JANE ─────────────────────────
  //
  // El caso REAL: la página está ABIERTA, se prende el ensayo, y el giro
  // pendiente llega POR LATIDO — no por un `goto` fresco. A la revelación los
  // letreros y `body.gano` se pintaron BIEN, pero la ficha ganadora se quedó
  // con `mos vive finalista` —sin `.gana`, sin `data-quieta`— y `tiembla`
  // corriendo con `--amp:9.0px` congelado.
  //
  // Los letreros y `body.gano` se escriben en UN SOLO SITIO, así que el
  // callback corrió y lo que se saltó fue `if (eg)`: `fichaDe(folioG)` dio
  // null. Aquí eso se fuerza con un folio que NO está en la rejilla — el
  // mecanismo, no la causa remota— y se exige que la quietud NO DEPENDA de
  // encontrar la ficha.
  console.log('\n── D · GANADOR-QUIETO-2 · el folio del ganador no está en la rejilla ──');
  const base2 = sacar(BASE2, 'gq2-base');
  const s2 = servidor(base2.dir);
  await new Promise((ok) => s2.listen(0, '127.0.0.1', ok));
  const p2 = s2.address().port;
  console.log('   BASE2 = ' + base2.sha.slice(0, 9) + '  (el main con #753, que todavía tiembla)');
  af(base2.sha !== head.sha, '🔴 BASE2 y HEAD son el mismo commit');

  for (const [etq, puerto, esHead] of [['HEAD', pH, true], ['BASE2', p2, false]]) {
    CUANTOS = 24; GIRO = 'g1'; RES = 'pendiente';
    SIN_GIRO = true; VIEJO_MS = 0; FOLIO_FALSO = 0;
    const totalD = TI.duracionTotal(TI.escalonesPara(24));
    const pgD = await ctx.newPage();
    const errsD = []; pgD.on('pageerror', (e) => errsD.push(e.message));
    const avisos = []; pgD.on('console', (m) => { if (m.type() === 'error') avisos.push(m.text()); });
    await pgD.goto('http://127.0.0.1:' + puerto + '/sorteo.html', { waitUntil: 'load' });
    await pgD.waitForTimeout(2200);
    af(await pgD.evaluate(() => (window.__sorteoShow ? window.__sorteoShow() : null) === null),
       '🔒 PREMISA: la página arranca ABIERTA y sin show (' + etq + ')');
    // Y ahora llega el giro, VIEJO (repetición) y con el folio que no cuadra.
    ARRANQUE = Date.now();
    VIEJO_MS = totalD + 30000;
    FOLIO_FALSO = 999;
    SIN_GIRO = false;
    let sh = null, tD = Date.now();
    while (!sh && Date.now() - tD < 20000) {
      await pgD.waitForTimeout(400);
      sh = await pgD.evaluate(() => window.__sorteoShow && window.__sorteoShow());
    }
    af(!!sh && sh.sincronizado === false,
       '🔒 PREMISA: el show llegó POR LATIDO y como REPETICIÓN, no por un goto: '
       + JSON.stringify(sh && { sinc: sh.sincronizado, t: sh.t }));
    // Se deja correr la repetición completa hasta que se pinta el cierre.
    let cerro = false; tD = Date.now();
    while (!cerro && Date.now() - tD < totalD + 45000) {
      await pgD.waitForTimeout(700);
      cerro = await pgD.evaluate(() => document.body.classList.contains('gano'));
    }
    af(cerro, '🔴 ' + etq + ': nunca se pintó el cierre del show (body.gano)');
    if (cerro) {
      await esperarEntrada(pgD);
      await pgD.waitForTimeout(300);
      const vD = veredicto(await vigilarQuietud(pgD, 3600, 150));
      const extra = await pgD.evaluate(() => {
        const g = document.querySelector('.mos.gana');
        return { gana: !!g,
                 quieta: g ? g.getAttribute('data-quieta') : null,
                 tiembla: document.querySelectorAll('.mosaico-caja .mos-tiembla').length,
                 fichas: [].slice.call(document.querySelectorAll('#mosaico .mos'))
                   .map((e) => e.getAttribute('data-folio') + ':' + String(e.className)),
                 quedan: (document.getElementById('mos-quedan') || {}).textContent,
                 de: (document.getElementById('mos-de') || {}).textContent,
                 placa: !!document.querySelector('#placa-ganador.on') };
      });
      console.log('   ' + etq + ': .mos.gana=' + extra.gana + ' quieta=' + extra.quieta
        + ' tiembla=' + extra.tiembla + ' · letreros «' + extra.quedan + '» / «' + extra.de
        + '» · placa=' + extra.placa);
      console.log('   ' + etq + ': fichas ' + JSON.stringify(extra.fichas)
        + ' · muestras con temblor ' + vD.conTemblor + '/' + vD.n
        + ' · anim ' + JSON.stringify(vD.anims));
      // La PREMISA del caso, igual en los dos lados: los letreros SÍ se pintan.
      af(/Ganador/.test(extra.quedan || '') && /1 de 24/.test(extra.de || ''),
         '🔒 PREMISA: los letreros del cierre se pintaron en ' + etq + ': «'
         + extra.quedan + '» / «' + extra.de + '»');
      if (esHead) {
        af(vD.conTemblor === 0 && extra.tiembla === 0,
           '🔴 HEAD: la ganadora quedó temblando aunque su folio no estuviera en la rejilla ('
           + extra.tiembla + ' con `.mos-tiembla`, ' + vD.conTemblor + '/' + vD.n + ' muestras)');
        af(vD.anims.every((a) => a.indexOf('tiembla') === -1),
           '🔴 HEAD: la animación `tiembla` sigue viva: ' + JSON.stringify(vD.anims));
        af(vD.posiciones === 1,
           '🔴 HEAD: la ganadora se mueve: ' + vD.posiciones + ' posiciones en ' + vD.n);
        // Y el respaldo: marca la única viva, y LO GRITA.
        af(extra.gana, '🔴 HEAD: nadie quedó marcado como ganador');
        af(extra.quieta === '1', 'y la marcada está callada, dio ' + extra.quieta);
        af(avisos.some((t) => /no está en la rejilla/.test(t)),
           '🔴 HEAD: el respaldo se usó EN SILENCIO; tiene que gritarlo: '
           + JSON.stringify(avisos.slice(0, 2)));
        console.log('   HEAD avisó: «' + (avisos.find((t) => /no está en la rejilla/.test(t)) || '—')
          .slice(0, 110) + '»');
      } else {
        // 🔒 EL PAR: BASE2 —el main con #753— tiene que REPRODUCIR la captura.
        const falla = (extra.tiembla > 0 || vD.conTemblor > 0) && !extra.gana;
        af(falla,
           '🔒 CONTROL POSITIVO EN ROJO: en BASE2 la ganadora no quedó temblando y sin '
           + 'marcar, así que este careo NO reproduce la captura de Jane. Dio tiembla='
           + extra.tiembla + ' gana=' + extra.gana);
        if (falla) console.log('   🔴 BASE2: temblando y SIN `.gana` — la captura de Jane, reproducida');
      }
    }
    af(errsD.length === 0, etq + ': errores en D: ' + JSON.stringify(errsD.slice(0, 2)));
    await pgD.close();
  }
  FOLIO_FALSO = 0; VIEJO_MS = 0; SIN_GIRO = false; CUANTOS = 40;
  s2.close();

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
