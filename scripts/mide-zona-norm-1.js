#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-zona-norm-1.js — ZONA-NORM-1 · el casamiento de zonas aprende acentos
//
// Medido por Jane (25-sep-2026): siete eventos tenían la misma zona escrita
// distinto entre lo capturado y la ficha. El stock casa por cadena EXACTA, así
// que esas filas restaban de una llave que NO EXISTE.
//
// 🔒 LOS DOS LADOS SON COMMITS. Commitear exige RE-ANCLAR.
//
// 🔒 LOS PARES SON REALES, LEÍDOS DE LA BASE el 25-sep DESPUÉS de que Jane
// alineara los datos de hoy. No son ejemplos inventados: los inventados
// comparten mis sesgos, y aquí el dato ES el caso.
//
// 🔒 EL CONTROL POSITIVO ES UNA COLISIÓN, no una ausencia: si una ficha tuviera
// dos zonas DISTINTAS que normalizadas coincidan, el normalizador las FUNDIRÍA.
// Se mide (a) que el normalizador de verdad las fundiría —sembrando el par— y
// (b) que hoy NO existe tal par en el catálogo, con VIGILANTE VIVO sobre el
// árbol de trabajo: eso es un hecho del catálogo de hoy, no del par de commits,
// y anclado a un commit nunca podría avisar.
//
// Se corre:  npm run mide:zona-norm-1
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0, completo = false;
const fallos = [];
function af(c, e) {
  let v = false;
  try { v = (typeof c === 'function') ? !!c() : !!c; }
  catch (x) { v = false; e = e + '  [EXCEPCIÓN: ' + x.message + ']'; }
  if (v) ok++; else { mal++; fallos.push(e); console.log('   ✗ ' + e); }
}
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  console.log((mal ? '❌ ROJO · ' : '✅ VERDE · ') + ok + ' en verde, ' + mal + ' en rojo');
  fallos.slice(0, 16).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '61ee30f';
const HEAD_SHA = process.env.HEAD_SHA || 'e1d2faa';

// ── LOS PARES REALES ────────────────────────────────────────────────────
// Leídos de la base el 25-sep-2026 con un GROUP BY por (evento, zona
// normalizada) pidiendo los grupos con MÁS DE UNA ortografía. Son los que
// seguían vivos DESPUÉS de la alineación de Jane, así que esto no es solo el
// hoyo de mañana: es el de hoy.
const PARES = [
  { evento: 'alfredito',  a: 'Retráctil Vip', b: 'Retráctil VIP', fuentes: 'ajustes, compras' },
  { evento: 'frontera#1', a: 'Retractil Oro', b: 'Retráctil Oro', fuentes: 'ajustes, compras, viajeros' },
  { evento: 'hilary',     a: 'Seccion C',     b: 'Sección C',     fuentes: 'ajustes, compras, viajeros' },
  { evento: 'hilary',     a: 'Seccion D',     b: 'Sección D',     fuentes: 'ajustes, compras, viajeros' },
  { evento: 'ultramexico', a: 'General',      b: 'GENERAL',       fuentes: 'ajustes, compras, viajeros' },
];
// El caso que mordió a Jane en un ALTA REAL.
const ALTA_REAL = { evento: 'frontera#1', paquete: 'PLUS', ficha: 'Retráctil Oro', pestana: 'Retractil Oro' };

// ⚠️ ZONAS QUE **NO** SON LA MISMA y no se pueden fundir. Sin este par, un
// normalizador que borrara demasiado (quitar espacios, recortar palabras)
// pasaría el careo entero.
const DISTINTAS = [
  ['General', 'General Viernes'],
  ['Sección C', 'Sección D'],
  ['VIP', 'VIP Plus'],
  ['Retráctil Oro', 'Retráctil Vip'],
];

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'zn-base'), h = sacar(HEAD_SHA, 'zn-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }
  const reqH = (f) => require(path.join(h.dir, 'netlify/functions/_lib', f));
  const reqB = (f) => require(path.join(b.dir, 'netlify/functions/_lib', f));

  // ── [D] EL DUEÑO, y que sea UNO ───────────────────────────────────────
  console.log('[D] el dueño de «¿son la misma zona?»');
  const { normalizarZona } = reqH('normalizar-zona');
  af(typeof normalizarZona === 'function', 'el lib no exporta `normalizarZona`: nada de lo de abajo mide algo');
  for (const p of PARES) {
    const ka = normalizarZona(p.a), kb = normalizarZona(p.b);
    console.log('    ' + p.evento.padEnd(12) + JSON.stringify(p.a).padEnd(18) + ' ≟ ' + JSON.stringify(p.b).padEnd(18)
      + ' → ' + (ka === kb ? 'MISMA («' + ka + '»)' : '❌ distintas'));
    af(ka === kb, p.evento + ': «' + p.a + '» y «' + p.b + '» tienen que casar y no casan (' + ka + ' vs ' + kb + ')');
  }
  // 🔒 Y NO FUNDE LO QUE DE VERDAD ES DISTINTO. Un normalizador que borrara de
  // más pasaría todo lo de arriba y perdería dinero en silencio.
  for (const [x, y] of DISTINTAS) {
    af(normalizarZona(x) !== normalizarZona(y),
       '🔴 el normalizador FUNDIÓ dos zonas que NO son la misma: «' + x + '» y «' + y + '» → «'
       + normalizarZona(x) + '». Eso cobraría el precio de una por la otra');
  }
  af(normalizarZona(null) === '' && normalizarZona(undefined) === '',
     'la ausencia tiene que normalizar a cadena vacía, no a «null»: ' + JSON.stringify([normalizarZona(null), normalizarZona(undefined)]));
  // 🔒 UNA sola forma en el árbol: `normalizarNombre` del careo la PIDE.
  const { normalizarNombre } = reqH('excel-careo');
  af(normalizarNombre('  Retráctil   ORO ') === normalizarZona('  Retráctil   ORO '),
     'el normalizador del careo y el de zonas dan resultados DISTINTOS: son dos listas que todavía no '
     + 'divergen, y el día que una aprenda algo la otra casaría distinto');
  const fuenteCareo = fs.readFileSync(path.join(h.dir, 'netlify/functions/_lib/excel-careo.js'), 'utf8');
  af(/require\('\.\/normalizar-zona'\)/.test(fuenteCareo),
     '`normalizarNombre` volvió a escribir la forma en vez de pedirla: dos copias de la misma regla');

  // ── [S] EL STOCK · escritor y lector, el par completo ─────────────────
  // 🔴 Normalizar solo el ESCRITOR dejaría TODAS las zonas sin pedido: el hoyo
  // al revés y más grande. Se mide el par entero, con las filas reales.
  console.log('\n[S] el stock: lo capturado resta de la llave de la ficha');
  const { disponiblesPorEvento, avisosStock } = reqH('agotado-derivado');
  const { disponiblesPorEvento: dispB } = reqB('agotado-derivado');
  const consumeBoleto = () => true;
  // El caso real: la compra dice «Retractil Oro» (sin acento, como la pestaña) y
  // la ficha dice «Retráctil Oro».
  // ⚠️ LOS NÚMEROS CIERRAN EN **0** A PROPÓSITO, y me costó tres rojos: el aviso
  // solo NOMBRA las zonas en riesgo (`num <= 0`), así que con 5 disponibles no
  // dice nada de ella y la lectura no se puede carear. Con 5 − 2 − 3 = 0 la
  // zona SÍ sale en el aviso, y el par queda medible en los dos lados.
  const entrada = {
    compras: [{ evento_id: 'frontera#1', zona: 'Retractil Oro', cantidad: 5 }],
    ajustes: [{ evento_id: 'frontera#1', zona: 'RETRACTIL ORO', vendidos_fuera: 2 }],
    viajeros: [{ evento_id: 'frontera#1', zona_boleto: 'Retráctil Oro', boletos: 3, tipo_paquete: 'PLUS', tipo_viajero: 'cliente' }],
    consumeBoleto,
  };
  const stH = disponiblesPorEvento(entrada);
  const stB = dispB(entrada);
  const llavesH = [...stH.get('frontera#1').keys()], llavesB = [...stB.get('frontera#1').keys()];
  console.log('    BASE llaves: ' + JSON.stringify(llavesB));
  console.log('    HEAD llaves: ' + JSON.stringify(llavesH));
  af(llavesB.length === 3,
     'CONTROL POSITIVO: en BASE las tres ortografías tenían que dar TRES llaves distintas (el hoyo). '
     + 'Salieron ' + llavesB.length + ': ' + JSON.stringify(llavesB));
  af(llavesH.length === 1,
     '🔴 en HEAD las tres ortografías siguen dando ' + llavesH.length + ' llaves: ' + JSON.stringify(llavesH));
  af(llavesH[0] === normalizarZona('Retráctil Oro'),
     'la llave no es la normalizada por el dueño: ' + JSON.stringify(llavesH[0]));
  af(stH.get('frontera#1').get(llavesH[0]) === 0,
     'la cuenta no es 5 − 2 − 3 = 0: ' + stH.get('frontera#1').get(llavesH[0]));
  // 🔒 Y EL LECTOR: el aviso busca con la ortografía de la FICHA y tiene que
  // encontrarla. Se entra por `avisosStock`, que es quien lo hace de verdad.
  const ficha = { zonas: [{ n: 'Retráctil Oro', p: 6100 }], cheapZonas: [], multifecha: null };
  const avH = avisosStock({ ficha, slug: 'frontera#1', stock: stH });
  const { avisosStock: avisosB } = reqB('agotado-derivado');
  const avB = avisosB({ ficha, slug: 'frontera#1', stock: stB });
  const zonaDe = (r) => ((r && r.zonas) || []).find((z) => z.zona === 'Retráctil Oro');
  console.log('    BASE aviso: ' + JSON.stringify(zonaDe(avB)));
  console.log('    HEAD aviso: ' + JSON.stringify(zonaDe(avH)));
  // 🔴 EL CONTROL POSITIVO, Y EL SÍNTOMA REAL ES PEOR DE LO QUE YO ESPERABA:
  // en BASE el aviso no dice «sin pedido» — dice **SOBREVENDIDA en −3**, porque
  // encuentra la resta de los viajeros (que casualmente escribieron como la
  // ficha) y NO las 5 compradas ni los 2 vendidos fuera. O sea que el aviso
  // cuenta **solo lo que casualmente casa con la ortografía de la ficha** y
  // pinta una sobreventa que no existe. La verdad es 0.
  af(zonaDe(avB) && zonaDe(avB).disponibles === -3 && zonaDe(avB).motivo === 'sobrevendida',
     'CONTROL POSITIVO del lector: en BASE el aviso tenía que pintar −3 «sobrevendida» — cuenta solo la '
     + 'resta que casa con la ficha y se pierde las 5 compradas. Salió ' + JSON.stringify(zonaDe(avB)));
  af(zonaDe(avH) && zonaDe(avH).disponibles === 0 && zonaDe(avH).motivo === 'stock 0',
     '🔴 el aviso sigue sin encontrar el pedido completo: normalizar solo el escritor dejaría TODAS las '
     + 'zonas sin pedido, y normalizar solo el lector las dejaría a todas en cero. Salió '
     + JSON.stringify(zonaDe(avH)));
  // 🔒 Y LO PINTADO NO SE TOCA: el aviso dice la ortografía de la FICHA, no la llave.
  af(zonaDe(avH) && zonaDe(avH).zona === 'Retráctil Oro',
     'el aviso pinta la LLAVE en vez del nombre de la ficha: lo guardado y lo pintado no se tocan — la '
     + 'ficha es la ortografía canónica. Salió ' + JSON.stringify(zonaDe(avH) && zonaDe(avH).zona));

  // ── [V] LA VENTA · el alta real que mordió a Jane ─────────────────────
  console.log('\n[V] el alta real: «' + ALTA_REAL.pestana + '» contra la ficha «' + ALTA_REAL.ficha + '»');
  const INDEX_H = fs.readFileSync(path.join(h.dir, 'index.html'), 'utf8');
  const INDEX_B = fs.readFileSync(path.join(b.dir, 'index.html'), 'utf8');
  async function venta(dir, index, zona, extra) {
    process.env.URL = 'https://conectareynosa.mx';
    delete process.env.DEPLOY_PRIME_URL;
    global.fetch = async (u) => {
      if (/\/index\.html$/.test(String(u))) return { ok: true, status: 200, text: async () => index, json: async () => ({}) };
      throw new Error('la red falsa solo sirve el index: ' + u);
    };
    for (const f of ['catalogo-index.js', 'precio-zona.js']) {
      try { delete require.cache[require.resolve(path.join(dir, 'netlify/functions/_lib', f))]; } catch (_) {}
    }
    const { resolverPrecioVenta } = require(path.join(dir, 'netlify/functions/_lib/precio-zona.js'));
    return resolverPrecioVenta(Object.assign({
      evento_id: ALTA_REAL.evento, paquete: ALTA_REAL.paquete, zona, num_personas: 1,
    }, extra || {}));
  }
  const vB = await venta(b.dir, INDEX_B, ALTA_REAL.pestana);
  const vH = await venta(h.dir, INDEX_H, ALTA_REAL.pestana);
  const vFicha = await venta(h.dir, INDEX_H, ALTA_REAL.ficha);
  console.log('    BASE con la ortografía de la pestaña: ' + (vB.ok ? 'ok ' + vB.total : 'REHUSADA — ' + vB.motivo));
  console.log('    HEAD con la ortografía de la pestaña: ' + (vH.ok ? 'ok ' + vH.total : 'REHUSADA — ' + vH.motivo));
  af(!vB.ok && /zona no encontrada/i.test(String(vB.motivo)),
     'CONTROL POSITIVO: en BASE el alta con la ortografía de la pestaña tenía que rehusarse con «zona no '
     + 'encontrada en el catálogo» — es el caso que mordió a Jane. Salió ' + JSON.stringify(vB));
  af(vH.ok && Number(vH.total) > 0,
     '🔴 el alta con la ortografía de la pestaña sigue rehusándose: ' + JSON.stringify(vH.motivo));
  af(vH.ok && vFicha.ok && Number(vH.total) === Number(vFicha.total),
     'las dos ortografías dan totales DISTINTOS: ' + vH.total + ' vs ' + vFicha.total
     + '. El precio sale de la zona del EV, así que tiene que ser el MISMO número');
  // 🔒 Y LA ZONA QUE DE VERDAD NO EXISTE SIGUE REHUSÁNDOSE. Sin esto, «casa por
  // normalizado» podría haberse vuelto «casa con lo que sea».
  const inventada = await venta(h.dir, INDEX_H, 'Zona Que No Existe');
  console.log('    una zona inventada: ' + (inventada.ok ? '❌ la aceptó' : 'REHUSADA — ' + inventada.motivo));
  af(!inventada.ok && /zona no encontrada/i.test(String(inventada.motivo)),
     '🔴 una zona que NO está en el catálogo se aceptó: normalizar no puede volverse «casar con lo que '
     + 'sea». ' + JSON.stringify(inventada));
  // 🔒 LOS CANDADOS DE VENTA SIGUEN EN PIE. La puerta `para_careo` es lo único
  // que los abre, y esta tuerca no la toca.
  const { fetchEventosRaw } = require(path.join(h.dir, 'netlify/functions/_lib/catalogo-index.js'));
  const evs = await fetchEventosRaw();
  af(Array.isArray(evs) && evs.length > 50, 'el catálogo no se leyó: los candados de abajo medirían en vacío');
  let agotadaCaso = null;
  for (const ev of (evs || [])) {
    if (ev._past || ev.st === 'agotado') continue;
    const z = (ev.zonas || []).find((x) => x && x.ag && Number(x.p) > 0);
    if (z) { agotadaCaso = { id: ev.id, zona: z.n }; break; }
  }
  console.log('    candado de venta, caso: ' + JSON.stringify(agotadaCaso));
  af(agotadaCaso, 'no se encontró un evento A LA VENTA con una zona agotada CON precio: el candado no se puede medir');
  if (agotadaCaso) {
    const sinPuerta = await venta(h.dir, INDEX_H, agotadaCaso.zona, { evento_id: agotadaCaso.id });
    const conPuerta = await venta(h.dir, INDEX_H, agotadaCaso.zona, { evento_id: agotadaCaso.id, para_careo: true });
    console.log('    sin puerta: ' + (sinPuerta.ok ? 'ok' : 'REHUSADA — ' + sinPuerta.motivo)
      + '   ·   con puerta: ' + (conPuerta.ok ? 'ok ' + conPuerta.total : 'REHUSADA — ' + conPuerta.motivo));
    af(!sinPuerta.ok && /agotada/i.test(String(sinPuerta.motivo)),
       '🔴 la zona AGOTADA se vendió: normalizar el casamiento no puede haber debilitado los candados de '
       + 'AUD-2. ' + JSON.stringify(sinPuerta));
    af(conPuerta.ok, 'la puerta `para_careo` dejó de abrir la zona agotada: el careo del Excel la necesita');
    // Y escrita distinto, se rehúsa IGUAL: el candado no se salta por el acento.
    const raro = await venta(h.dir, INDEX_H, String(agotadaCaso.zona).toUpperCase(), { evento_id: agotadaCaso.id });
    af(!raro.ok && /agotada/i.test(String(raro.motivo)),
       '🔴 la zona agotada escrita en MAYÚSCULAS se vendió: el casamiento nuevo no puede ser una puerta '
       + 'trasera a los candados. ' + JSON.stringify(raro));
  }

  // ── [C] EL CAREO DE BOLETOS-POR-ZONA de CUADRE-5 ──────────────────────
  // Dos filas de la MISMA zona escritas distinto contaban como DOS zonas, y el
  // renglón se quedaba pendiente con «2 boletos en 2 zonas».
  console.log('\n[C] los boletos por zona del careo del Excel');
  const fuenteCorrer = fs.readFileSync(path.join(h.dir, 'netlify/functions/_lib/excel-careo-correr.js'), 'utf8');
  const fuenteCorrerB = fs.readFileSync(path.join(b.dir, 'netlify/functions/_lib/excel-careo-correr.js'), 'utf8');
  af(/normalizarZona\(zc\)/.test(fuenteCorrer),
     'el agrupado de boletos por zona no normaliza: dos filas de la MISMA zona escritas distinto se '
     + 'contarían como dos y el renglón se quedaría pendiente sobre boletos que son de la misma');
  af(!/normalizar-zona/.test(fuenteCorrerB), 'BASE ya normalizaba ahí: el control positivo no se sostiene');

  // ── [K] LA COLISIÓN · el precio de normalizar, medido ─────────────────
  // 🔒 EL CONTROL POSITIVO ES QUE EL NORMALIZADOR SÍ FUNDIRÍA UN PAR ASÍ. Sin
  // esta mitad, «hoy no hay colisiones» sería una ausencia sin instrumento.
  console.log('\n[K] la colisión: el precio de normalizar');
  af(normalizarZona('Vip') === normalizarZona('VIP'),
     'el par sembrado NO colisiona, así que el barrido de abajo no prueba nada: su cero podría ser que el '
     + 'instrumento no ve colisiones');
  const colisionador = (listas) => {
    const out = [];
    for (const [donde, lista] of listas) {
      const vistas = new Map();
      for (const z of (Array.isArray(lista) ? lista : [])) {
        const n = z && z.n; if (!n) continue;
        const k = normalizarZona(n);
        if (vistas.has(k) && vistas.get(k) !== String(n)) out.push({ donde, a: vistas.get(k), b: String(n), k });
        else if (!vistas.has(k)) vistas.set(k, String(n));
      }
    }
    return out;
  };
  // El instrumento se valida con un par CONOCIDO antes de creerle su cero.
  const sembrado = colisionador([['sembrada', [{ n: 'Vip' }, { n: 'VIP' }]]]);
  console.log('    el instrumento con un par sembrado: ' + JSON.stringify(sembrado));
  af(sembrado.length === 1,
     'el buscador de colisiones NO ve una colisión sembrada, así que su cero sobre el catálogo no diría '
     + 'nada: ' + JSON.stringify(sembrado));

  // ── [W] VIGILANTE VIVO · contra el ÁRBOL DE TRABAJO ───────────────────
  // 🔒 VA CONTRA EL CATÁLOGO DE HOY, no contra el par de commits, y es a
  // propósito: «no hay colisiones» es un hecho del catálogo que puede cambiar
  // con cualquier publicación. Puesto contra un commit nunca podría avisar —
  // la lección de FEST-SEP-1, donde un testigo anclado se quedó verde para
  // siempre afirmando un defecto que ya no existía.
  console.log('\n[W] vigilante VIVO · colisiones en el catálogo de hoy');
  const { _parseEV } = require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
  const EV = _parseEV(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'));
  af(Array.isArray(EV) && EV.length > 50, 'el catálogo del árbol de trabajo no se pudo leer: ' + (EV || []).length);
  let listas = 0, zonas = 0;
  const choques = [];
  for (const ev of (EV || [])) {
    const unidades = [['zonas', ev.zonas], ['cheapZonas', ev.cheapZonas]];
    if (ev.multifecha) ev.multifecha.forEach((m, i) => {
      unidades.push(['mf[' + i + '].zonas', m.zonas]);
      const cz = m.cheapZonas;
      unidades.push(['mf[' + i + '].cheapZonas', cz && (Array.isArray(cz) ? cz : Object.values(cz))]);
    });
    for (const [, l] of unidades) if (Array.isArray(l) && l.length) { listas++; zonas += l.length; }
    colisionador(unidades).forEach((c) => choques.push(Object.assign({ evento: ev.id }, c)));
  }
  console.log('    barridas ' + listas + ' listas · ' + zonas + ' zonas → colisiones: ' + choques.length);
  choques.slice(0, 6).forEach((c) => console.log('      ' + JSON.stringify(c)));
  af(listas > 150 && zonas > 1000,
     'CANDADO DE CARDINALIDAD: el barrido vio ' + listas + ' listas y ' + zonas + ' zonas. Con un puñado, '
     + 'un cero de colisiones pasaría en vacío');
  af(choques.length === 0,
     '🔴 APARECIÓ UNA COLISIÓN EN EL CATÁLOGO: ' + JSON.stringify(choques.slice(0, 4)) + '. Dos zonas '
     + 'DISTINTAS de una misma lista que normalizadas coinciden — el casamiento las FUNDIRÍA y una '
     + 'cobraría el precio de la otra. Hay que renombrar una de las dos en la ficha ANTES de publicar, o '
     + 'esta tuerca deja de ser segura.');

  completo = true;
  process.exitCode = mal ? 1 : 0;
})();
