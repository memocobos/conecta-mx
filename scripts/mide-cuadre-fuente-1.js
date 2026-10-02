#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-cuadre-fuente-1.js — CUADRE-FUENTE-1 · el dinero tiene UN dueño
//
// Regla firmada de Memo (1-oct-2026), citada en el código:
//   «Numerología es SOLO venta CHEAP y lleva los pagos COMPLETOS. La pestaña de
//    Conecta 2026 lleva los pagos de PLUS/STAY/RIDE. El CHEAP en la pestaña
//    aparece a veces sin saldo o solo con el separo — ese separo es REFLEJO, NO
//    es dinero adicional.»
//
// 🔴 EL FIXTURE SEPARA LAS IMPLEMENTACIONES (la ley de CUADRE-ZONA-1c): una
//    CHEAP con separo $500 en pestaña + $3,800 completos en libro tiene que dar
//    **$3,800** — BASE da $4,300, HEAD $3,800. Si los dos números pudieran
//    coincidir, el verde no diría nada.
//
// 🔒 Y UN PAPEL NUEVO NO SE CUELGA DE UNA FIXTURE VIEJA (la ley de Monserrat):
//    cada caso tiene su propia persona.
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let verde = 0, rojo = 0, completo = false;
const fallos = [];
function af(cond, msg) {
  let ok = false, extra = '';
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; }
  catch (e) { ok = false; extra = '  [EXCEPCIÓN: ' + e.message + ']'; }
  if (ok) { verde++; return; }
  let t; try { t = (typeof msg === 'function') ? msg() : msg; }
  catch (e) { t = '(el mensaje también reventó: ' + e.message + ')'; }
  rojo++; fallos.push(t + extra); console.log('   ✗ ' + t + extra);
}
function ver(fn) { try { const v = fn(); return v === undefined ? 'undefined' : JSON.stringify(v); } catch (e) { return '«no se pudo leer: ' + e.message + '»'; } }
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  if (verde + rojo === 0) { console.log('⚠️  NADA MEDIDO · cero aserciones corrieron: esto NO es un verde'); return; }
  console.log((rojo ? '❌ ROJO · ' : '✅ VERDE · ') + verde + ' en verde, ' + rojo + ' en rojo');
  fallos.slice(0, 20).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '55b5ee6';   // el main con CHATARRA-SELLO-1
const HEAD_SHA = process.env.HEAD_SHA || 'HEAD';
// El guardián del árbol sucio, copiado de mide:concilia-1 (ahí vive su razón).
const MEDIDOS = ['netlify/functions/_lib/numerologia.js', 'netlify/functions/_lib/excel-careo-correr.js'];
function avisarSiSucio() {
  let sucio = '';
  try { sucio = execSync('git status --porcelain -- ' + MEDIDOS.join(' '), { cwd: RAIZ, encoding: 'utf8' }).trim(); } catch (_) { return; }
  if (!sucio) return;
  let mismo = false;
  try {
    mismo = execSync('git rev-parse ' + HEAD_SHA, { cwd: RAIZ, encoding: 'utf8' }).trim()
         === execSync('git rev-parse HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim();
  } catch (_) { mismo = false; }
  if (!mismo) return;
  console.log('\n⚠️  EL ARNÉS MIDE EL COMMIT, NO TU ÁRBOL DE TRABAJO.');
  sucio.split('\n').forEach((l) => console.log('     ' + l));
  console.log('   Committea y vuelve a correr.\n');
  process.exit(2);
}

// ── EL PADRÓN · UNA PERSONA POR PAPEL (la ley de Monserrat) ─────────────────
const PESTANA = [
  // [1] CHEAP en las DOS: separo $500 en pestaña + $3,800 completos en libro.
  //     🔴 Es el caso que separa las implementaciones: BASE $4,300 · HEAD $3,800.
  { clave: 'cheap dos fuentes', nombre: 'Cheap Dos Fuentes', abonado: 500, total: 3800,
    paquete: 'cheap', filas: 1, pestanas: ['Natanael Cano - 27 de Noviembre'] },
  // [2] CHEAP en las dos, pero la pestaña trae MÁS que el separo → aviso (b).
  { clave: 'cheap sobre separo', nombre: 'Cheap Sobre Separo', abonado: 2100, total: 3800,
    paquete: 'cheap', filas: 1, pestanas: ['Natanael Cano - 27 de Noviembre'] },
  // [3] PLUS con dinero en pestaña y SIN libro → no se mueve ni un peso.
  { clave: 'plus intocable', nombre: 'Plus Intocable', abonado: 6400, total: 9200,
    paquete: 'plus', filas: 1, pestanas: ['Natanael Cano - 27 de Noviembre'] },
  // [4] PLUS que SÍ aparece en el libro → aviso (a): el libro es solo CHEAP.
  { clave: 'plus en libro', nombre: 'Plus En Libro', abonado: 5000, total: 9200,
    paquete: 'plus', filas: 1, pestanas: ['Natanael Cano - 27 de Noviembre'] },
  // [5] CHEAP SOLO en la pestaña, con dinero → aviso (c): su pago sin dueño.
  { clave: 'cheap sin libro', nombre: 'Cheap Sin Libro', abonado: 1800, total: 3800,
    paquete: 'cheap', filas: 1, pestanas: ['Natanael Cano - 27 de Noviembre'] },
  // [6] CHEAP en las dos con DOS compras del libro → las del libro SÍ suman.
  { clave: 'cheap dos compras', nombre: 'Cheap Dos Compras', abonado: 500, total: 7600,
    paquete: 'cheap', filas: 1, pestanas: ['Natanael Cano - 27 de Noviembre'] },
];
const LIBRO = [
  { clave: 'cheap dos fuentes', nombre: 'Cheap Dos Fuentes', abonado: 3800, boletos: 1, zona: 'Platino', costo_publico: 3800 },
  { clave: 'cheap sobre separo', nombre: 'Cheap Sobre Separo', abonado: 3800, boletos: 1, zona: 'Platino', costo_publico: 3800 },
  { clave: 'plus en libro', nombre: 'Plus En Libro', abonado: 3000, boletos: 1, zona: 'Platino', costo_publico: 3000 },
  { clave: 'cheap dos compras', nombre: 'Cheap Dos Compras', abonado: 3800, boletos: 1, zona: 'Platino', costo_publico: 3800 },
  { clave: 'cheap dos compras', nombre: 'Cheap Dos Compras', abonado: 3800, boletos: 1, zona: 'Platino', costo_publico: 3800 },
  // SOLO en el libro: como hoy (CUADRE-2c), no cambia.
  { clave: 'solo libro', nombre: 'Solo Libro', abonado: 3000, boletos: 1, zona: 'Platino', costo_publico: 3000 },
];

(async function main() {
  process.on('exit', marcador);
  avisarSiSucio();
  const b = sacar(BASE, 'cf-base'), h = sacar(HEAD_SHA, 'cf-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }
  const numH = require(path.join(h.dir, 'netlify/functions/_lib/numerologia.js'));
  const numB = require(path.join(b.dir, 'netlify/functions/_lib/numerologia.js'));
  const porClave = (arr) => new Map(arr.map((p) => [p.clave, p]));
  // ⚠️ [CUADRE-FUENTE-1b] La fusión ahora recibe el PAQUETE DE LA BASE: la regla
  // «el libro manda el dinero» está ACOTADA A CHEAP (palabra de Memo, opción B).
  // Se le pasa el MISMO mapa que arma `correrCareo`, con la misma forma (cola por
  // llave), para no medir una estructura que el código real no usa.
  const PAQ = new Map([
    ['cheap dos fuentes', ['CHEAP']], ['cheap sobre separo', ['CHEAP']],
    ['plus intocable', ['PLUS']], ['plus en libro', ['PLUS']],
    ['cheap sin libro', ['CHEAP']], ['cheap dos compras', ['CHEAP']],
  ]);

  // ── [F] LA REGLA · EL LIBRO MANDA EL DINERO ───────────────────────────
  console.log('[F] el abonado lo manda el LIBRO');
  const fH = porClave(numH.fundirNumerologia(PESTANA, LIBRO, PAQ));
  const uno = fH.get('cheap dos fuentes');
  console.log('    Cheap Dos Fuentes → abonado ' + ver(() => uno.abonado)
    + ' (pestaña ' + ver(() => uno.abonado_pestana) + ' · libro ' + ver(() => uno.abonado_libro) + ')');
  af(uno && uno.abonado === 3800,
     () => '🔴 el abonado no es el del LIBRO ($3,800). Si salió 4,300 es la SUMA que esta tuerca cierra: '
     + 'el separo de la pestaña es un REFLEJO del pago que el libro ya trae completo, y sumarlos cuenta el '
     + 'mismo dinero dos veces (141 personas, $214,233 en producción). Salió ' + ver(() => uno && uno.abonado));
  // 🔒 Y el TOTAL sigue siendo de la pestaña: «el libro jamás pisa a la pestaña».
  af(uno && uno.total === 3800, () => 'el total se movió: el libro no manda el total. ' + ver(() => uno && uno.total));
  // 🔒 El dinero de la pestaña se CONSERVA con nombre, no se tira: lo necesita el aviso (b).
  af(uno && uno.abonado_pestana === 500 && uno.abonado_libro === 3800,
     () => 'no se conservaron los dos montos por separado: sin ellos el aviso no puede decir qué dinero se '
     + 'deja de contar. ' + ver(() => uno && { p: uno.abonado_pestana, l: uno.abonado_libro }));
  // 🔒 El andamio interno NO viaja.
  af(uno && !('__libroManda' in uno), 'el andamio `__libroManda` se escapó: nadie más debe decidir con él');

  // ── [+] CONTROL POSITIVO · BASE da OTRO número ────────────────────────
  // 🔴 Sin esto el verde de arriba no dice nada: podría estar pasando porque el
  // fixture no ejercita la suma.
  console.log('\n[+] control positivo · BASE suma los dos');
  const fB = porClave(numB.fundirNumerologia(PESTANA, LIBRO, PAQ));
  const unoB = fB.get('cheap dos fuentes');
  console.log('    BASE → ' + ver(() => unoB.abonado) + '   ·   HEAD → ' + ver(() => uno.abonado));
  af(unoB && unoB.abonado === 4300,
     () => '🔴 CONTROL POSITIVO: en BASE tenía que dar $4,300 (500 + 3,800). Si no, el fixture no ejercita el '
     + 'doble conteo y el verde de arriba no prueba nada. Salió ' + ver(() => unoB && unoB.abonado));
  af(unoB && uno && unoB.abonado !== uno.abonado,
     'BASE y HEAD dan el MISMO número: entonces este fixture no separa las dos implementaciones');

  // ── [2] DOS COMPRAS DEL LIBRO SÍ SUMAN ENTRE SÍ ───────────────────────
  // ⚠️ Un `=` a secas habría dejado a quien compró dos veces con el dinero de
  // una sola compra: el mismo defecto al revés, y más difícil de ver.
  console.log('\n[2] dos compras del libro suman entre sí');
  const dos = fH.get('cheap dos compras');
  console.log('    Cheap Dos Compras → ' + ver(() => dos.abonado) + ' (3800+3800, sin el separo)');
  af(dos && dos.abonado === 7600,
     () => '🔴 dos compras CHEAP del libro son dos ventas distintas, no un reflejo: tenían que sumar $7,600. '
     + 'Si salió 3,800 el `=` se comió una compra; si salió 8,100 volvió a entrar el separo. Salió '
     + ver(() => dos && dos.abonado));

  // ── [P] EL NO-CHEAP NO SE MUEVE NI UN PESO ────────────────────────────
  console.log('\n[P] control del no-CHEAP');
  const plus = fH.get('plus intocable');
  const plusB = fB.get('plus intocable');
  console.log('    Plus Intocable → BASE ' + ver(() => plusB.abonado) + ' · HEAD ' + ver(() => plus.abonado));
  af(plus && plus.abonado === 6400 && plusB && plusB.abonado === 6400,
     () => '🔴 un PLUS sin libro cambió de abonado: esta tuerca toca SOLO a quien vive en las dos fuentes. '
     + ver(() => ({ base: plusB && plusB.abonado, head: plus && plus.abonado })));
  af(plus && plus.abonado_pestana === undefined,
     'a un PLUS sin libro se le puso `abonado_pestana`: ese campo es la marca de que el libro mandó');
  // Y quien vive SOLO en el libro: como hoy (CUADRE-2c).
  const solo = fH.get('solo libro'), soloB = fB.get('solo libro');
  af(solo && soloB && solo.abonado === soloB.abonado && solo.abonado === 3000,
     () => 'quien vive SOLO en el libro cambió: CUADRE-2c no se toca. ' + ver(() => ({ b: soloB && soloB.abonado, h: solo && solo.abonado })));
  af(solo && solo.total === 3000, 'el total del que solo vive en el libro ya no es su `costo_publico` (CUADRE-2c)');

  // ══ [¬] LA REGLA ESTÁ ACOTADA A CHEAP · EL PLUS-EN-LIBRO ══════════════
  // 🔒 Palabra de Memo (opción B, 1-oct): para un no-CHEAP el dinero sigue
  // mandando la PESTAÑA aunque aparezca en el libro — esa fila es anomalía, no
  // fuente, y no suma ni resta un peso.
  console.log('\n[¬] la regla acotada · el PLUS que aparece en el libro');
  const pl = fH.get('plus en libro'), plB = fB.get('plus en libro');
  console.log('    HEAD → abonado ' + ver(() => pl.abonado) + ' (pestaña intacta)   ·   '
    + 'fila anómala: ' + ver(() => pl.libro_anomalo) + ' × ' + ver(() => pl.libro_anomalo_monto));
  console.log('    BASE → abonado ' + ver(() => plB.abonado));
  af(pl && pl.abonado === 5000,
     () => '🔴 al PLUS que aparece en el libro se le movió el dinero. Bajo la regla ACOTADA su abonado es '
     + 'EL DE LA PESTAÑA ($5,000) intacto: la pestaña es la dueña del dinero PLUS por la misma regla de '
     + 'Memo, y la fila del libro es anomalía. Salió ' + ver(() => pl && pl.abonado));
  // 🔴 EL FIXTURE SIGUE DISTINGUIENDO IMPLEMENTACIONES: con la regla SIN acotar,
  // este PLUS habría dado el monto del LIBRO ($3,000). Los dos números tienen que
  // diferir, o el verde de arriba no prueba que la acotación exista.
  af(plB && plB.abonado === 8000,
     () => 'CONTROL POSITIVO: en BASE (que sumaba) este PLUS tenía que dar $8,000 (5,000 + 3,000). Si da '
     + '5,000 el fixture no ejercita nada. Salió ' + ver(() => plB && plB.abonado));
  af(pl && plB && pl.abonado !== plB.abonado,
     'BASE y HEAD dan el MISMO abonado para el PLUS-en-libro: el fixture no separa las implementaciones');
  // 🔒 Y el dinero del libro NO se perdió de vista: queda contado aparte para que
  // el aviso (a) lo pueda decir. Un dinero ignorado y además invisible sería peor
  // que sumarlo.
  af(pl && pl.libro_anomalo === 1 && pl.libro_anomalo_monto === 3000,
     () => 'la fila anómala del libro no se contó aparte: sin su monto, el aviso no puede decir qué dinero '
     + 'del libro se está ignorando. ' + ver(() => pl && { n: pl.libro_anomalo, m: pl.libro_anomalo_monto }));
  // 🔒 Y NO lleva la marca de «el libro mandó»: esa huella es lo que el aviso (b)
  // mira para no nombrarlo.
  af(pl && pl.abonado_pestana === undefined,
     'al PLUS se le puso `abonado_pestana`: esa marca significa «el libro mandó» y aquí NO mandó');
  // ⚠️ Su fila del libro no entra a `filas`: no es una venta de este careo.
  af(pl && pl.filas === 1, () => 'la fila anómala del libro se contó como una fila más: ' + ver(() => pl && pl.filas));

  // ── [=] LOS CASOS CHEAP NO SE MUEVEN NI UN BIT ──────────────────
  // 🔒 La acotación no podía tocar a los CHEAP, y no se promete: se CAREA el
  // objeto entero de cada uno contra lo que daba la regla sin acotar.
  console.log('\n[=] los CHEAP, idénticos a antes de la acotación');
  {
    const sinAcotar = porClave(numH.fundirNumerologia(PESTANA, LIBRO));   // sin el mapa → cae al paquete de la pestaña
    for (const k of ['cheap dos fuentes', 'cheap sobre separo', 'cheap sin libro', 'cheap dos compras']) {
      const a = fH.get(k), b2 = sinAcotar.get(k);
      af(a && b2 && a.abonado === b2.abonado,
         () => 'el CHEAP «' + k + '» cambió con la acotación: ' + ver(() => ({ con: a && a.abonado, sin: b2 && b2.abonado })));
    }
    console.log('    los cuatro CHEAP: ' + ver(() => ['cheap dos fuentes', 'cheap sobre separo', 'cheap sin libro', 'cheap dos compras'].map((k) => fH.get(k).abonado)));
    // Y el solo-libro tampoco.
    af(fH.get('solo libro').abonado === 3000, 'el solo-libro cambió con la acotación');
  }

  // ── [R] LA FILA ROJA SIGUE EXACTAMENTE COMO CAREO-ZONA-1b ─────────────
  console.log('\n[R] el rojo del libro, intacto');
  const conRoja = numH.fundirNumerologia(
    [{ clave: 'viva', nombre: 'Viva', abonado: 500, total: 9200, paquete: 'plus', filas: 1, pestanas: ['X'] }],
    [{ clave: 'viva', nombre: 'Viva', abonado: 1500, boletos: 1, roja: true }]);
  console.log('    pestaña viva + libro rojo → abonado ' + ver(() => conRoja[0].abonado)
    + ' · libro_rojo ' + ver(() => conRoja[0].libro_rojo) + '/' + ver(() => conRoja[0].libro_rojo_monto));
  af(conRoja[0] && conRoja[0].abonado === 500,
     () => '🔴 la compra ROJA del libro entró al abonado: una compra cancelada no es dinero que cobrar, y la '
     + 'regla nueva NO la convierte en dueña del dinero. Salió ' + ver(() => conRoja[0] && conRoja[0].abonado));
  af(conRoja[0] && conRoja[0].libro_rojo === 1 && conRoja[0].libro_rojo_monto === 1500,
     () => 'el aviso del rojo se perdió: ' + ver(() => conRoja[0]));
  af(conRoja[0] && conRoja[0].abonado_pestana === undefined,
     'una fila ROJA marcó el dinero como «del libro»: el rojo no manda nada, lo cancela');

  // ── [A] LOS TRES AVISOS, POR SU NOMBRE ────────────────────────────────
  // Se entra por `correrCareo` REAL con red falsa: los avisos preguntan por el
  // paquete de la BASE, que la fusión no conoce.
  console.log('\n[A] los tres avisos');
  const avisos = await avisosDe(h.dir);
  const n = (k) => (avisos[k] || []).map((x) => x.nombre).sort();
  console.log('    (a) libro no-CHEAP      : ' + ver(() => n('libro_no_cheap')));
  console.log('    (b) pestaña > separo    : ' + ver(() => n('pestana_sobre_separo')));
  console.log('    (c) CHEAP sin libro     : ' + ver(() => n('cheap_sin_libro')));
  af(JSON.stringify(n('libro_no_cheap')) === JSON.stringify(['Plus En Libro']),
     () => '(a) no nombra al PLUS que aparece en el libro: el libro es SOLO venta CHEAP por regla. ' + ver(() => n('libro_no_cheap')));
  // ⚠️ MI ASERCIÓN ESPERABA **UN** NOMBRE Y SALIERON DOS — y el segundo no es un
  // error del código: es un HALLAZGO. «Plus En Libro» es PLUS con $5,000 en la
  // pestaña y $3,000 en el libro; bajo la regla nueva su abonado pasa a $3,000, o
  // sea que **$5,000 de dinero PLUS dejan de contarse** — y la pestaña es la dueña
  // del dinero PLUS por la misma regla de Memo. Pertenece a (b) con todo derecho,
  // y de hecho es el caso MÁS urgente de los tres.
  // 🔒 Se exige que salga en LOS DOS avisos, porque es la combinación peligrosa:
  // (a) dice «este PLUS no debería estar en el libro» y (b) dice «y por eso se le
  // dejó de contar dinero». Nombrarlo en uno solo contaría media historia.
  // ⚠️ ESTA ASERCIÓN EXIGÍA AL PLUS EN **LOS DOS** AVISOS, y la palabra de Memo
  // (opción B) la cambió: con la regla acotada al no-CHEAP **no se le deja de
  // contar nada**, así que (b) ya no le toca. Avisar ahí diría que se perdió un
  // dinero que no se perdió — y mandaría a buscar un agujero que no existe. Se
  // retira de ese caso CON SU RAZÓN; sigue saliendo en (a), con sus montos.
  af(JSON.stringify(n('pestana_sobre_separo')) === JSON.stringify(['Cheap Sobre Separo']),
     () => '(b) tiene que nombrar SOLO al CHEAP a quien de verdad se le deja de contar dinero. Si nombra al '
     + 'PLUS, está avisando de una pérdida que la regla acotada ya no causa. ' + ver(() => n('pestana_sobre_separo')));
  af(!n('pestana_sobre_separo').includes('Plus En Libro'),
     'el PLUS sigue en (b): con la regla acotada su dinero NO se deja de contar, así que ese aviso mentiría');
  // 🔒 Y (a) trae los montos, porque es el ÚNICO sitio donde ese dinero del libro
  // aparece: bajo la regla acotada no mueve un peso, así que sin la cifra nadie
  // podría ir a buscarla.
  const ava = (avisos.libro_no_cheap || [])[0];
  af(ava && ava.monto_libro_ignorado === 3000 && ava.abonado_pestana === 5000 && ava.filas_libro === 1,
     () => '(a) no trae los montos de la fila anómala ni el abonado que SÍ cuenta: ' + ver(() => ava));
  af(ava && /ANOMAL/i.test(ava.motivo) && /\$3,000/.test(ava.motivo) && /\$5,000/.test(ava.motivo),
     () => '(a) no dice en palabras que la fila es anomalía y cuánto dinero ignora: ' + ver(() => ava && ava.motivo));
  af(JSON.stringify(n('cheap_sin_libro')) === JSON.stringify(['Cheap Sin Libro']),
     () => '(c) no nombra al CHEAP con dinero y sin fila en el libro: su pago no tiene dueño que lo respalde. '
     + ver(() => n('cheap_sin_libro')));
  // 🔒 Y (b) dice los DOS montos: un dinero que desaparece sin cifras no se audita.
  const avb = (avisos.pestana_sobre_separo || [])[0];
  af(avb && avb.abonado_pestana === 2100 && avb.abonado_libro === 3800,
     () => '(b) no trae los dos montos: ' + ver(() => avb));
  af(avb && /ya no se cuenta/i.test(avb.motivo) && /\$2,100/.test(avb.motivo) && /\$3,800/.test(avb.motivo),
     () => '(b) no dice en palabras qué dinero deja de contarse: ' + ver(() => avb && avb.motivo));
  // 🔒 El que cuadra con el separo exacto NO se nombra: avisar de lo normal
  // vuelve el aviso parte del mueble (la ley de NUBE).
  af(!n('pestana_sobre_separo').includes('Cheap Dos Fuentes'),
     '(b) nombró a quien traía EXACTAMENTE el separo: eso es el reflejo esperado, no un dato que mirar');
  af(!n('cheap_sin_libro').includes('Plus Intocable'),
     '(c) nombró a un PLUS: el aviso es de pagos CHEAP sin dueño');

  // ── [I] IDEMPOTENCIA · segunda pasada = cero abonos ───────────────────
  // 🔒 La idempotencia la da el RE-CAREO: con el dinero ya cuadrado bajo la regla
  // nueva, `planear` no propone un solo abono.
  console.log('\n[I] segunda pasada: cero abonos propuestos');
  const ap = require(path.join(h.dir, 'netlify/functions/_lib/excel-aplicar.js'));
  const yaCuadrado = {
    montones: { pagos: [{ nombre: 'Cheap Dos Fuentes', viajero_id: 'v1', excel: 3800, base: 3800, diferencia: 0 }],
                totales_contrato: [] },
    personas: [], viajeros: [{ id: 'v1', nombre: 'Cheap Dos Fuentes' }],
    pestanas: [{ pestana: 'X' }], chatarraPorZona: {}, ajustes: [],
  };
  const plan = ap.planear(yaCuadrado, {});
  console.log('    abonos propuestos: ' + ver(() => plan.abonos.length));
  af(plan.abonos.length === 0,
     () => '🔴 con el dinero ya cuadrado bajo la regla nueva se propuso un abono: la segunda pasada del careo '
     + 'tiene que proponer CERO, o cada corrida volvería a mover dinero. ' + ver(() => plan.abonos));

  completo = true;
  process.exit(rojo ? 1 : 0);

  // ── el helper que entra por `correrCareo` real ───────────────────────
  async function avisosDe(dir) {
    const KH = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
    const VIAJEROS = [
      { id: 'v1', nombre: 'Cheap Dos Fuentes', tipo_paquete: 'CHEAP', zona_boleto: 'Platino', total_contrato: 3800, abonado_previo: 0, notas: '' },
      { id: 'v2', nombre: 'Cheap Sobre Separo', tipo_paquete: 'CHEAP', zona_boleto: 'Platino', total_contrato: 3800, abonado_previo: 0, notas: '' },
      { id: 'v3', nombre: 'Plus Intocable', tipo_paquete: 'PLUS', zona_boleto: 'VIP A', total_contrato: 9200, abonado_previo: 0, notas: '' },
      { id: 'v4', nombre: 'Plus En Libro', tipo_paquete: 'PLUS', zona_boleto: 'VIP A', total_contrato: 9200, abonado_previo: 0, notas: '' },
      { id: 'v5', nombre: 'Cheap Sin Libro', tipo_paquete: 'CHEAP', zona_boleto: 'Platino', total_contrato: 3800, abonado_previo: 0, notas: '' },
      { id: 'v6', nombre: 'Cheap Dos Compras', tipo_paquete: 'CHEAP', zona_boleto: 'Platino', total_contrato: 7600, abonado_previo: 0, notas: '' },
    ];
    const CAB = ['Nombre', 'Paquete', 'Boleto', 'Separo', 'Total'];
    const fila = (nombre, paq, abonado, total) => {
      const f = new Array(CAB.length).fill('');
      f[0] = nombre; f[1] = paq; f[2] = 'Platino'; f[3] = '$' + abonado; f[4] = '$' + total; return f;
    };
    const PEST = [...Array.from({ length: 10 }, () => new Array(CAB.length).fill('')), CAB,
      ...PESTANA.map((p) => fila(p.nombre, p.paquete, p.abonado, p.total))];
    const CABL = ['Nombre', 'Fecha', 'Tipo de Boleto', 'Costo al Publico', 'Separo'];
    const filaL = (nombre, costo, sep) => { const f = new Array(CABL.length).fill(''); f[0] = nombre; f[1] = '27 de Noviembre'; f[2] = 'Platino'; f[3] = String(costo); f[4] = String(sep); return f; };
    // ⚠️ LA FILA DE TÍTULO LLEVA **UNA SOLA** CELDA LLENA. `filaL` fija `Fecha` y
    // `Tipo de Boleto` siempre, así que usándola para el título salían 3 celdas
    // llenas — `parsearLibro` exige `llenas === 1` para leerla como título, así
    // que caía a `fueraDeBloque`, el bloque quedaba «(sin título)» y las personas
    // iban todas a `sinMapeo`: el libro NO se fundía y los tres avisos medían en
    // vacío (el (c) nombraba a TODOS los CHEAP, que fue la pista).
    const titulo = new Array(CABL.length).fill('');
    titulo[0] = 'Natanael Cano - 27 de Noviembre';
    const LIB = [titulo, CABL,
      ...LIBRO.map((l) => filaL(l.nombre, l.costo_publico, l.abonado))];
    const EV = { id: 'natanael', a: 'Natanael Cano', f: '27 Nov', ds: '2026-11-27', v: 'Arena Monterrey, MTY',
                 st: '', zonas: [{ n: 'Platino', p: 3800 }, { n: 'VIP A', p: 9200 }], inc: ['Boleto'], sep: 500, sepCheap: 500 };
    global.fetch = async (url, opts) => {
      const u = String(url);
      if (/index\.html$/.test(u)) return { ok: true, status: 200, text: async () => 'var EV=[' + JSON.stringify(EV) + '];', json: async () => ({}) };
      if (u.startsWith('https://script.test')) {
        const c = JSON.parse(opts.body);
        if (!c.pestana) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, pestanas: ['Natanael Cano - 27 de Noviembre'] }) };
        const esLibro = c.pestana === 'Boletos';
        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, pestana: c.pestana,
          filas: esLibro ? LIB : PEST, colores_leidos: false, pestanas: [c.pestana] }) };
      }
      if (!u.startsWith(KH)) throw new Error('la red falsa no conoce: ' + u);
      const t = new URL(u).pathname.replace('/rest/v1/', '');
      const dato = t === 'excel_pestanas' ? [{ evento_id: 'natanael', pestana: 'Natanael Cano - 27 de Noviembre', regla_zona: null, activa: true, notas: null }]
        : t === 'viajeros_evento' ? VIAJEROS
        : t === 'numerologia_eventos' ? [{ nombre_libro: 'Natanael Cano - 27 de Noviembre', fecha_libro: '27 de Noviembre', evento_id: 'natanael', activa: true }]
        : [];
      return { ok: true, status: 200, json: async () => dato, text: async () => '' };
    };
    for (const f of ['_lib/excel-careo-correr.js', '_lib/excel-careo.js', '_lib/numerologia.js',
                     '_lib/cosecha-excel.js', '_lib/catalogo-index.js', '_lib/precio-zona.js', '_lib/zona-ficha.js']) {
      try { delete require.cache[require.resolve(path.join(dir, 'netlify/functions', f))]; } catch (_) {}
    }
    process.env.SUPABASE_URL_KAMEHOUSE = KH;
    process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
    process.env.EXCEL_SCRIPT_URL = 'https://script.test/exec';
    process.env.EXCEL_SCRIPT_TOKEN = 't';
    process.env.NUMEROLOGIA_SCRIPT_URL = 'https://script.test/num/exec';
    process.env.NUMEROLOGIA_SCRIPT_TOKEN = 't';
    process.env.URL = 'https://conectareynosa.mx';
    const { correrCareo } = require(path.join(dir, 'netlify/functions/_lib/excel-careo-correr.js'));
    const r = await correrCareo('natanael');
    if (r.error) { console.log('   ⚠️ correrCareo dio error: ' + JSON.stringify(r.error).slice(0, 200)); return {}; }
    return r.avisosFuente || {};
  }
})().catch((e) => { console.error('EXCEPCIÓN DEL ARNÉS: ' + e.stack); process.exit(1); });
