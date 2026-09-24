#!/usr/bin/env node
// ============================================================================
// mide-fest-sep-1 · FEST-SEP-1: el separo del festival tiene UN dueño
// ============================================================================
// Regla firmada de Memo (23-sep-2026): «yo elijo el separo», igual que en todos
// los eventos. El camino de festival con paquetes emite el `sep` de la ficha
// como el camino normal.
//
// 🔒 LOS DOS LADOS SON COMMITS: cada árbol sale con `git archive` a su carpeta.
// Y la otra cara, pagada tres veces en #756: **commitear exige re-anclar** — si
// con `HEAD_SHA=<sha>` a mano sale verde y a secas sale rojo, el ancla está
// vieja, no el código.
//
// EL DEFECTO: `generarObjFestival` concatenaba `sepSeg`, que NO existía en su
// ámbito → `ReferenceError` antes de emitir un solo byte. Y dos líneas antes
// declaraba un `sepN` con default 500 que NADIE leía: el fósil de la regla que
// ESF-E1g derogó («antes caía a 500 cuando faltaba, y eso no era un default:
// era una AFIRMACIÓN sobre un evento que no la hacía»). Las dos caras del mismo
// hueco — la regla buena sin llamador y la vieja sin lector.
//
// 🔒 SE ENTRA POR LA RAMA DE PAQUETES, y por la PUERTA: `_generarObj` es quien
// decide (`parseFestival(esfera.festival)` con `paquetes.length`), así que el
// careo siembra un festival que SÍ los trae y deja que el emisor se elija solo.
// Llamar a `generarObjFestival` a mano mediría una función, no el camino.
// ============================================================================
const { execSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const RAIZ = path.resolve(__dirname, '..');

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
// BASE: el main anterior a esta tuerca (trae el ReferenceError vivo).
const BASE = process.env.BASE || 'origin/main';
const HEAD_SHA = process.env.HEAD_SHA || 'HEAD';
const HOY = '2026-09-23';

// Sin comentarios: una aserción sobre el TEXTO del archivo se caza sola, porque
// el propio comentario que explica por qué `sepN` murió CONTIENE «sepN».
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// La ficha de festival SEMBRADA. La forma de `paquetes` se LEYÓ del ESCRITOR
// (`kamehouse-esferas.js`: lbl/ds/noches/ride/zonas/cheapZonas/hotel/hotelTotal),
// no de lo que yo recordara del payload — el fixture se carea contra la función
// que lo produce.
const FEST_CON_PAQUETES = JSON.stringify({
  switches: { cheap: true, stay: true, ride: false, transporte: 'cdmx' },
  portada: null, lineup: null, lineup_mostrar: true, musica: [],
  paquetes: [
    { lbl: 'Vie 20 nov · 1 día', ds: '2026-11-20', noches: 1, ride: 0,
      zonas: [{ n: 'General', p: 3200, pc: 1800 }], cheapZonas: [], hotel: [], hotelTotal: 0 },
    { lbl: 'Sáb 21 nov · 2 días', ds: '2026-11-21', noches: 2, ride: 0,
      zonas: [{ n: 'General', p: 5400, pc: 2900 }], cheapZonas: [], hotel: [], hotelTotal: 0 },
  ],
});
const FICHA = {
  slug: 'careofest', nombre: 'Careo Fest', titulo: 'Careo Fest',
  fecha_inicio: '2026-11-20', fechas_extra: JSON.stringify(['2026-11-21']),
  ciudad: 'MTY', venue: 'Parque Fundidora', status: '', color: 'azul',
  inc: JSON.stringify(['Boleto', 'Kit Conecta']), sep: 500,
  zonas: JSON.stringify([{ n: 'General', p: 3200 }]),
};
const emitir = (lib, extra) => lib._generarObj(Object.assign({}, FICHA, extra || {}), HOY);
// El segmento del separo, AISLADO del resto del objeto.
const segSep = (obj) => { const m = String(obj).match(/,sep:(-?\d+)/); return m ? m[0] : '(no emite)'; };

(function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'fest-base'), h = sacar(HEAD_SHA, 'fest-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit: el par no puede decir nada.'); process.exit(1); }
  const rq = (dir) => { const p = path.join(dir, 'netlify/functions/_lib/esferas-compile.js');
    for (const k of Object.keys(require.cache)) if (k === p) delete require.cache[k];
    return require(p); };
  const libB = rq(b.dir), libH = rq(h.dir);

  // ── [I] EL INSTRUMENTO, antes de creerle nada ──────────────────────────
  console.log('[I] el instrumento');
  af(typeof libB._generarObj === 'function' && typeof libH._generarObj === 'function',
     'los dos libs tienen que exportar `_generarObj`: sin eso, todo lo de abajo mide la nada');
  // Un concierto corriente compila en los DOS lados. Si esto no pasa, un rojo
  // de más abajo podría ser «el lib no carga», no el separo.
  const conciertoB = emitir(libB, {}), conciertoH = emitir(libH, {});
  af(/^\{id:'careofest'/.test(conciertoB) && /^\{id:'careofest'/.test(conciertoH),
     'el camino de CONCIERTO no compila en los dos lados: la premisa de la medición no se sostiene');
  console.log('    concierto BASE → ' + segSep(conciertoB) + '   HEAD → ' + segSep(conciertoH));

  // ── [A] EL CONTROL POSITIVO · BASE ESTÁ ROTO ────────────────────────────
  // 🔒 Toda aserción «HEAD arregla X» necesita su par que exija que BASE SÍ
  // falle. Aquí el par no puede caducar por el paso del tiempo: BASE es un
  // commit, no un sitio vivo.
  console.log('\n[A] control positivo · el emisor de festival en BASE');
  let errB = null, objB = null;
  try { objB = emitir(libB, { festival: FEST_CON_PAQUETES }); } catch (e) { errB = e.message; }
  console.log('    BASE con paquetes → ' + (errB ? 'TRUENA: ' + errB : 'emite ' + String(objB).slice(0, 60)));
  af(errB && /sepSeg is not defined/.test(errB),
     'BASE tenía que tronar con «sepSeg is not defined» y no lo hizo: si BASE no está roto, el verde de '
     + 'HEAD no prueba que esta tuerca arregle algo. Salió: ' + (errB || '(emitió sin tronar)'));
  af(objB === null,
     'BASE emitió un objeto por la rama de festival: el defecto que esta tuerca cierra no existía ahí');

  let errH = null, objH = null;
  try { objH = emitir(libH, { festival: FEST_CON_PAQUETES }); } catch (e) { errH = e.message; }
  console.log('    HEAD con paquetes → ' + (errH ? 'TRUENA: ' + errH : segSep(objH)));
  af(!errH, 'HEAD sigue tronando por la rama de festival: ' + errH);
  af(objH && /^\{id:'careofest'/.test(String(objH)),
     'HEAD no emitió un objeto EV por la rama de festival: ' + String(objH).slice(0, 80));

  // La premisa de que de verdad se entró por la rama del FESTIVAL, no por la
  // de concierto: el formato festival lleva `multifecha:[` derivada de los
  // paquetes y el objeto del concierto de esta ficha NO la lleva.
  af(objH && /multifecha:\[/.test(String(objH)) && !/multifecha:\[/.test(conciertoH),
     'no se puede afirmar que se entró POR la rama de paquetes: los dos objetos se ven igual. '
     + 'Sin esa premisa, todo [B]/[C] podría estar midiendo el camino de concierto');

  // ── [B] EL SEPARO SALE DE LA FICHA · se MUTA el dato, no se busca la palabra
  console.log('\n[B] el separo sale de la ficha (mutando el dato)');
  for (const v of [500, 777, 0, 300, 1250]) {
    const o = emitir(libH, { festival: FEST_CON_PAQUETES, sep: v });
    af(segSep(o) === ',sep:' + v,
       'el festival con sep=' + v + ' emitió «' + segSep(o) + '» en vez de «,sep:' + v + '»');
  }
  console.log('    sep 500/777/0/300/1250 → ' + [500, 777, 0, 300, 1250]
    .map((v) => segSep(emitir(libH, { festival: FEST_CON_PAQUETES, sep: v }))).join(' · '));

  // ── [C] LA SIMETRÍA · el MISMO dueño para los dos caminos ───────────────
  // El barrido incluye los casos que NO son un separo (null, negativo, texto):
  // la regla es del dueño, así que las dos ramas tienen que rehusarse IGUAL.
  console.log('\n[C] simetría festival ↔ concierto, valor por valor');
  const VALORES = [
    ['500', 500], ['0', 0], ['-1', -1], ['ausente', undefined], ['null', null],
    ['texto', 'abc'], ['cadena "500"', '500'], ['500.4', 500.4], ['NaN', NaN], ['vacío', ''],
  ];
  for (const [etiqueta, v] of VALORES) {
    const extra = (v === undefined) ? {} : { sep: v };
    const oFest = emitir(libH, Object.assign({ festival: FEST_CON_PAQUETES }, extra));
    const oConc = emitir(libH, extra);
    const sFest = segSep(oFest), sConc = segSep(oConc);
    af(sFest === sConc,
       'sep=' + etiqueta + ': el festival emite «' + sFest + '» y el concierto «' + sConc + '» — '
       + 'dos caminos con dos respuestas es la fórmula que todavía no ha divergido');
    console.log('    sep=' + etiqueta.padEnd(12) + ' festival ' + sFest.padEnd(12) + ' concierto ' + sConc);
  }
  // Candado de cardinalidad: si el barrido no ejercitó los dos resultados
  // posibles (emite / no emite), la simetría pasó en vacío.
  const resultados = new Set(VALORES.map(([, v]) =>
    segSep(emitir(libH, Object.assign({ festival: FEST_CON_PAQUETES }, v === undefined ? {} : { sep: v })))));
  af(resultados.size >= 2 && resultados.has('(no emite)'),
     'el barrido de [C] no llegó a los DOS resultados (emitir y no emitir): una simetría que solo prueba '
     + 'un lado no prueba la simetría. Salió: ' + [...resultados].join(' / '));

  // ── [D] EL FÓSIL DEL 500 MURIÓ ──────────────────────────────────────────
  // La regla de ESF-E1g dice que un separo ausente NO se inventa. El `sepN`
  // muerto del festival decía lo contrario (default 500). Se mide el HECHO.
  console.log('\n[D] el fósil del default 500');
  const sinSep = emitir(libH, { festival: FEST_CON_PAQUETES });
  af(!/,sep:/.test(String(sinSep)),
     'un festival SIN `sep` emitió un separo: eso es el fósil del default 500 vivo — «no era un default, '
     + 'era una AFIRMACIÓN sobre un evento que no la hacía». Salió: ' + segSep(sinSep));
  af(!/sep:500/.test(String(sinSep)),
     'un festival sin `sep` trae `sep:500`: el default derogado sigue ahí');
  // Y UN SOLO DUEÑO: la expresión de la regla se escribe UNA vez. Sobre el
  // archivo SIN comentarios, porque el comentario que explica el fósil lo nombra.
  const fuenteH = sinComentarios(fs.readFileSync(path.join(h.dir, 'netlify/functions/_lib/esferas-compile.js'), 'utf8'));
  const fuenteB = sinComentarios(fs.readFileSync(path.join(b.dir, 'netlify/functions/_lib/esferas-compile.js'), 'utf8'));
  const cuenta = (s) => (s.match(/Number\.isFinite\(Number\(esfera\.sep\)\)/g) || []).length;
  console.log('    la regla del separo escrita: BASE ' + cuenta(fuenteB) + ' veces · HEAD ' + cuenta(fuenteH));
  af(cuenta(fuenteB) === 2,
     'BASE tenía que traer la regla del separo escrita DOS veces (el fósil y la buena) y trae '
     + cuenta(fuenteB) + ': el control positivo de «un solo dueño» no se sostiene');
  af(cuenta(fuenteH) === 1,
     'HEAD escribe la regla del separo ' + cuenta(fuenteH) + ' veces: tiene que haber UN dueño. Una '
     + 'pregunta de dinero contestada en dos sitios acaba contestándose distinto');
  af(!/\bsepN\b/.test(fuenteH), 'el fósil `sepN` sigue vivo en el código de HEAD');

  // ── [E] CANDADO DE BYTES SOBRE LO PUBLICADO ─────────────────────────────
  // Las 4 fichas REALES con objeto `festival` traen CERO paquetes, así que hoy
  // pasan por el camino de CONCIERTO. Esta tuerca no puede moverles un byte.
  console.log('\n[E] las 4 fichas REALES de festival, byte a byte');
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/fest-sep-1-fichas.json'), 'utf8'));
  af(fx.filas.length === 4, 'el fixture tiene que traer las 4 fichas reales y trae ' + fx.filas.length);
  let conPaquetes = 0;
  for (const fila of fx.filas) {
    // La premisa que hace que este bloque signifique algo: hoy ninguna trae
    // paquetes. El día que una los traiga, esta cuenta lo dice en voz alta.
    if (JSON.parse(fila.festival).paquetes.length) conPaquetes++;
    const oB = libB._generarObj(fila, HOY), oH = libH._generarObj(fila, HOY);
    af(oB === oH,
       fila.slug + ': el objeto publicado CAMBIÓ con esta tuerca. BASE ' + String(oB).length
       + ' bytes, HEAD ' + String(oH).length + '. Primer punto donde difieren: '
       + (() => { const a = String(oB), c = String(oH);
                  let i = 0; while (i < a.length && a[i] === c[i]) i++;
                  return '…' + a.slice(Math.max(0, i - 40), i + 40) + ' | …' + c.slice(Math.max(0, i - 40), i + 40); })());
    console.log('    ' + fila.slug.padEnd(11) + String(oH).length + ' bytes · ' + segSep(oH)
      + ' · ' + (oB === oH ? 'IDÉNTICO' : '❌ CAMBIÓ'));
  }
  af(conPaquetes === 0,
     'ALGUNA de las 4 fichas reales ya trae paquetes (' + conPaquetes + '): la afirmación «hoy no cambia un '
     + 'byte publicado» deja de valer, y hay que remedir contra la base antes de repetirla');

  // Y el mismo candado de bytes sobre el camino de concierto variando el sep,
  // que es la única línea que esta tuerca le tocó a ese emisor.
  console.log('\n[E2] el emisor de CONCIERTO, sep por sep');
  for (const [etiqueta, v] of VALORES) {
    const extra = (v === undefined) ? {} : { sep: v };
    af(emitir(libB, extra) === emitir(libH, extra),
       'el concierto con sep=' + etiqueta + ' cambió de bytes: esta tuerca solo cambió ese emisor de '
       + '`const sepSeg` a `sepSeg(esfera)`, y el cuerpo del dueño es la MISMA expresión');
  }

  // ── [F] `sep` sigue declarado en CAMPOS_DEL_COMPILADOR ──────────────────
  // El Set se EVALÚA (se lee el exportado), no se busca con un regex: un regex
  // cuenta lo comentado como declarado.
  console.log('\n[F] el Set');
  af(libH.CAMPOS_DEL_COMPILADOR.has('sep') && libB.CAMPOS_DEL_COMPILADOR.has('sep'),
     'una llave emitida y no declarada en CAMPOS_DEL_COMPILADOR queda en tierra de nadie: se escribe y '
     + 'NO SE PUEDE BORRAR, porque el fusionador la re-inserta desde el objeto viejo');

  completo = true;
  process.exitCode = rojo ? 1 : 0;
})();
