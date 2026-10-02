#!/usr/bin/env node
// =============================================================================
// mide:zona-excel-manda-1 — LA ORTOGRAFÍA DEL EXCEL MANDA EN LA FICHA
// =============================================================================
// Regla firmada de Memo (2-oct-2026), citada:
//   «NO cambio el Excel: tú cámbialo en el index. Si dice 1er Nivel regúlalo a
//    Primer Nivel (arjona), y así con todos … Ajústate para poder leerlo y de
//    paso cambia el index.»
//
// 🔒 LA FIRMA ES DE LA CLASE, NO DE LOS NOMBRES (lo dijo Jane): toda zona cuya
// ficha difiera de cómo la escribe el Excel. Por eso el lote NO sale de una
// lista tecleada — sale de carear la FICHA contra la COSECHA. Un lote escrito a
// mano al lado de la realidad envejece solo, y esta casa ya lo pagó dos veces
// en este mismo encargo (caifanes#1 y los dos renombres que mi tabla no traía).
//
// 🔴🔒 EL PELIGRO CENTRAL, Y ES UNA LEY DE LA CASA: «Perfil» ES PREFIJO DE
// «Perfil B», «Perfil C» y «Perfil D». Un replace a ciegas de `Perfil` →
// `Perfiles` convierte «Perfil B» en «Perfiles B». MEDIDO contra la ficha real
// de caifanes: el token exacto `"n":"Perfil"` aparece 6 veces y el prefijo
// `"n":"Perfil` aparece 24 — o sea **18 nombres de zona corrompidos** en
// silencio, en las zonas que el cliente ve y por las que paga.
// EL ANCLA ES LA COMILLA DE CIERRE. Un prefijo no es un ancla.
//
// ⚠️ ESTE CAREO NO ESCRIBE NADA y no tiene llaves de la base: mide la LÓGICA
// del renombre recomputándola contra el texto REAL de las tres fichas, y mide
// el sitio SERVIDO (que es público). La aplicación viva se verifica releyendo
// cada renglón por el MCP y se reporta con sus números.
'use strict';
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const { normalizarZona } = require(path.join(RAIZ, 'netlify/functions/_lib/normalizar-zona.js'));

let verdes = 0, rojos = 0;
function af(cond, msg) {
  let ok = false, extra = '';
  try { ok = !!(typeof cond === 'function' ? cond() : cond); }
  catch (e) { ok = false; extra = ' [EXCEPCIÓN: ' + e.message + ']'; }
  const m = typeof msg === 'function' ? (() => { try { return msg(); } catch (e) { return '(mensaje ilegible)'; } })() : msg;
  if (ok) { verdes++; } else { rojos++; console.log('  ❌ ' + m + extra); }
}

// ── EL LOTE, DERIVADO DE LA MEDICIÓN (2-oct-2026) ───────────────────────────
// 🔒 `sitios` es el conteo MEDIDO del token exacto en la fila de la ficha, y se
// AFIRMA: si el renombre toca más o menos sitios que éstos, el careo cae. Sin
// ese número, «se renombró» y «se renombró a medias» se ven igual.
const LOTE = [
  { ficha: 'arjona',   vieja: '1er Nivel',      nueva: 'Primer Nivel',  sitios: 2, pestanas: ['arjona'] },
  { ficha: 'arjona',   vieja: '3er Nivel',      nueva: 'Tercer Nivel',  sitios: 2, pestanas: ['arjona'] },
  { ficha: 'caifanes', vieja: 'Perfil',         nueva: 'Perfiles',      sitios: 6, pestanas: ['caifanes#0', 'caifanes#1'] },
  { ficha: 'caifanes', vieja: 'Perfil D',       nueva: 'Perfiles D',    sitios: 6, pestanas: ['caifanes#1'] },
  { ficha: 'trueno',   vieja: 'Perfil A',       nueva: 'Perfil',        sitios: 2, pestanas: ['trueno'] },
  { ficha: 'trueno',   vieja: 'Beyond General', nueva: 'Beyond',        sitios: 2, pestanas: ['trueno'] },
];
// ⚠️ `2do Nivel` → `Segundo Nivel` NO ESTÁ EN EL LOTE y no es un olvido: MEDIDO,
// la ficha de arjona YA dice «Segundo Nivel» (0 ocurrencias del token viejo en
// los dos sitios) y sus 2 viajeros ya están capturados así. Queda NOMBRADO aquí
// porque Memo lo nombró: es el séptimo par, con cero sitios y cero datos. Su
// aserción vive abajo — se exige que siga sin aparecer.
const YA_APLICADO = { ficha: 'arjona', vieja: '2do Nivel', nueva: 'Segundo Nivel' };

// ── LAS FICHAS, TEXTO REAL leído de esferas_eventos el 2-oct-2026 ───────────
// 🔒 Es una FOTO, y por eso el careo RECOMPUTA el renombre sobre ella en vez de
// comparar contra una salida guardada: un par positivo que vive en el papel no
// mide nada (la ley del fixture grabado).
const FICHA = {
  arjona: '[{"n":"Diamante","p":10215,"pc":9500,"vip":1},{"n":"Platino","p":8490,"pc":6800,"vip":1},{"n":"VIP","p":7815,"pc":6300,"vip":1},{"n":"Oro","p":6650,"pc":5000},{"n":"Plata","p":6190,"pc":4500,"ag":1},{"n":"1er Nivel","p":5730,"pc":4100},{"n":"Segundo Nivel","p":5040,"pc":3400},{"n":"3er Nivel","p":4235,"pc":2600},{"n":"General de Pie","p":3890,"pc":2200}]',
  caifanes: '[{"n":"Beyond VIP","p":5500,"vip":1},{"n":"Beyond Oro","p":5300,"vip":1},{"n":"Platino","p":5100,"ag":1},{"n":"Platino B","p":4900,"ag":1},{"n":"Perfil","p":4550},{"n":"Perfil B","p":4200,"ag":1},{"n":"Perfil C","p":3900,"ag":1},{"n":"Perfil D","p":3500,"ag":1}]',
  trueno: '[{"n":"Beyond General","p":4450,"pc":2650,"ag":0,"prox":0,"vip":0,"requiereViajeros":0},{"n":"Platino","p":5250,"pc":3450,"ag":0,"prox":0,"vip":1,"requiereViajeros":0},{"n":"Platino B","p":4700,"pc":2900,"ag":0,"prox":0,"vip":0,"requiereViajeros":0},{"n":"Platino C","p":4150,"pc":0,"ag":1,"prox":0,"vip":0,"requiereViajeros":0},{"n":"Perfil A","p":4050,"pc":2250,"ag":0,"prox":0,"vip":0,"requiereViajeros":0},{"n":"Perfil B","p":3900,"pc":0,"ag":1,"prox":0,"vip":0,"requiereViajeros":0},{"n":"Perfil C","p":3650,"pc":0,"ag":1,"prox":0,"vip":0,"requiereViajeros":0},{"n":"Perfil D","p":3800,"pc":0,"ag":1,"prox":0,"vip":0,"requiereViajeros":0}]',
};

// ── LO QUE EL EXCEL ESCRIBE, cosechado de las pestañas REALES el 2-oct-2026 ──
// 🔒 Por el LITERAL del encabezado («Boleto», fila 10), jamás por índice de
// columna: la columna VARÍA de pestaña a pestaña (la lección de CUADRE-6).
// ⚠️ «-» y «N/A» NO son zonas: son el marcador de «esta fila no es un boleto».
const COSECHA = {
  'arjona':     { 'Diamante': 29, 'Oro': 8, 'Plata': 10, 'Platino': 7, 'Primer Nivel': 8, 'Segundo Nivel': 2, 'Tercer Nivel': 2, 'VIP': 1 },
  'caifanes#0': { '-': 19, 'Beyond Oro': 2, 'Perfiles': 7, 'Platino': 9 },
  'caifanes#1': { '-': 12, 'Beyond Oro': 6, 'Beyond VIP': 6, 'N/A': 3, 'Perfiles': 5, 'Perfiles D': 6, 'Platino': 6 },
  'trueno':     { '-': 42, 'Beyond': 1, 'Perfil': 2, 'Perfil B': 2, 'Platino': 2 },
};
const NO_ES_ZONA = new Set(['-', 'N/A', '']);
const FICHA_DE_PESTANA = { 'arjona': 'arjona', 'caifanes#0': 'caifanes', 'caifanes#1': 'caifanes', 'trueno': 'trueno' };

// ── EL RENOMBRE: ancla exacta, token completo ───────────────────────────────
const tok = (z) => '"n":"' + z + '"';
function renombrar(texto, vieja, nueva) {
  return texto.split(tok(vieja)).join(tok(nueva));
}
function cuantas(texto, aguja) { return texto.split(aguja).length - 1; }
const nombres = (texto) => JSON.parse(texto).map((x) => x.n);
const sinN = (texto) => JSON.parse(texto).map((x) => { const y = Object.assign({}, x); delete y.n; return y; });

console.log('\n═══ mide:zona-excel-manda-1 ═══════════════════════════════════════');

// ═══ [A] EL ANCLA EXACTA, Y SU CONTROL POSITIVO ════════════════════════════
// Esto es el corazón del careo: sin el control, «no corrompió nada» no
// distingue «el ancla es buena» de «no medí».
console.log('\n[A] el ancla exacta contra el prefijo (la ficha REAL de caifanes)');
{
  const t = FICHA.caifanes;
  const exacto = cuantas(t, tok('Perfil'));
  const prefijo = cuantas(t, '"n":"Perfil');
  console.log('    token exacto `"n":"Perfil"` → ' + exacto + '   ·   prefijo `"n":"Perfil` → ' + prefijo);
  af(() => exacto === 1, 'el token exacto de «Perfil» en `zonas` de caifanes tenía que ser 1, dio ' + exacto);
  af(() => prefijo === 4, 'el prefijo tenía que casar 4 veces (Perfil, Perfil B, Perfil C, Perfil D), dio ' + prefijo);
  // 🔒 CONTROL POSITIVO: el replace por PREFIJO SÍ corrompe.
  const malo = t.split('"n":"Perfil').join('"n":"Perfiles');
  const nMalo = nombres(malo);
  console.log('    por prefijo saldría: ' + nMalo.filter((n) => /^Perfiles/.test(n)).join(', '));
  af(() => nMalo.includes('Perfiles B') && nMalo.includes('Perfiles C'),
     'CONTROL POSITIVO: el replace por prefijo TENÍA que corromper «Perfil B» y «Perfil C» — si no, este careo no mide el peligro');
  // Y el ancla buena NO los toca.
  const bueno = renombrar(t, 'Perfil', 'Perfiles');
  const nBueno = nombres(bueno);
  af(() => nBueno.includes('Perfiles'), 'el renombre no dejó «Perfiles»');
  af(() => nBueno.includes('Perfil B') && nBueno.includes('Perfil C') && nBueno.includes('Perfil D'),
     '🔴 el ancla exacta SE LLEVÓ a los hermanos: ' + JSON.stringify(nBueno));
  af(() => !nBueno.includes('Perfiles B') && !nBueno.includes('Perfiles C'),
     '🔴 aparecieron zonas que nadie pidió: ' + JSON.stringify(nBueno));
}

// ═══ [B] TODO LO QUE NO ES EL NOMBRE SE CONSERVA ═══════════════════════════
// Un renombre que mueva un precio es un renombre que cobra distinto.
console.log('\n[B] solo cambia `n` — precios y banderas intactos');
for (const r of LOTE) {
  const antes = FICHA[r.ficha];
  const desp = renombrar(antes, r.vieja, r.nueva);
  af(() => JSON.stringify(sinN(antes)) === JSON.stringify(sinN(desp)),
     '🔴 ' + r.ficha + ' «' + r.vieja + '»: se movió algo que NO es el nombre (precio o bandera)');
  const na = nombres(antes), nd = nombres(desp);
  af(() => na.length === nd.length, r.ficha + ' «' + r.vieja + '»: cambió la CANTIDAD de zonas (' + na.length + ' → ' + nd.length + ')');
  af(() => nd.includes(r.nueva), r.ficha + ': no quedó «' + r.nueva + '»');
  af(() => !nd.includes(r.vieja), r.ficha + ': sobrevivió «' + r.vieja + '»');
  // Las demás zonas, una por una, en su mismo lugar.
  const esperadas = na.map((n) => (n === r.vieja ? r.nueva : n));
  af(() => JSON.stringify(nd) === JSON.stringify(esperadas),
     '🔴 ' + r.ficha + ' «' + r.vieja + '»: la lista de nombres no es la esperada\n       dio      ' + JSON.stringify(nd) + '\n       esperaba ' + JSON.stringify(esperadas));
}

// ═══ [C] CERO COLISIONES NORMALIZADAS POST-RENOMBRE (candado de Jane) ══════
// 🔒 Se le PREGUNTA al dueño (`_lib/normalizar-zona`), no se repite la forma.
console.log('\n[C] colisiones normalizadas, re-corridas con el lote puesto');
{
  const finales = {};
  for (const slug of Object.keys(FICHA)) {
    let t = FICHA[slug];
    for (const r of LOTE) if (r.ficha === slug) t = renombrar(t, r.vieja, r.nueva);
    finales[slug] = nombres(t);
  }
  console.log('    trueno queda: ' + finales.trueno.join(' · '));
  console.log('    caifanes queda: ' + finales.caifanes.join(' · '));
  for (const slug of Object.keys(finales)) {
    const vistas = new Map();
    const choques = [];
    for (const n of finales[slug]) {
      const k = normalizarZona(n);
      if (vistas.has(k) && vistas.get(k) !== n) choques.push(vistas.get(k) + ' ↔ ' + n);
      else if (vistas.has(k)) choques.push('(duplicado exacto) ' + n);
      vistas.set(k, n);
    }
    af(() => choques.length === 0, '🔴 ' + slug + ': COLISIÓN normalizada tras el renombre → ' + choques.join(' | ')
       + '. Dos zonas que normalizadas coinciden se FUNDEN y el stock de una resta de la otra.');
  }
  // Jane lo pidió por nombre: en trueno conviven «Perfil» y «Perfil B», y «Beyond».
  af(() => finales.trueno.includes('Perfil') && finales.trueno.includes('Perfil B'),
     'en trueno tenían que convivir «Perfil» y «Perfil B»');
  af(() => finales.trueno.includes('Beyond'), 'en trueno tenía que quedar «Beyond»');
  af(() => normalizarZona('Perfil') !== normalizarZona('Perfil B'),
     '🔴 el normalizador funde «Perfil» con «Perfil B»: el renombre de trueno sería inseguro');
  // 🔒 CONTROL POSITIVO del barrido: con un par sembrado, TIENE que caer.
  const sembrado = ['Perfil', 'perfil', 'Platino'];
  const v2 = new Map(); let cayo = false;
  for (const n of sembrado) { const k = normalizarZona(n); if (v2.has(k) && v2.get(k) !== n) cayo = true; v2.set(k, n); }
  af(() => cayo, 'CONTROL POSITIVO: el barrido de colisiones no cazó el par sembrado «Perfil»/«perfil» — su cero no prueba nada');
}

// ═══ [D] EL LOTE ESTÁ COMPLETO: lo dice el DATO, no la lista ═══════════════
// 🔒 CANDADO DE CARDINALIDAD que pidió Jane: si el careo de pestaña-vs-ficha
// encuentra un par que el lote no cubre, LO DICE. Jamás pasa en vacío.
console.log('\n[D] ¿el lote cubre todo par (pestaña, zona) que el Excel escribe y la ficha no?');
{
  const finales = {};
  for (const slug of Object.keys(FICHA)) {
    let t = FICHA[slug];
    for (const r of LOTE) if (r.ficha === slug) t = renombrar(t, r.vieja, r.nueva);
    finales[slug] = new Set(nombres(t).map(normalizarZona));
  }
  const huerfanas = [];
  let miradas = 0;
  for (const pest of Object.keys(COSECHA)) {
    const fichaSlug = FICHA_DE_PESTANA[pest];
    for (const z of Object.keys(COSECHA[pest])) {
      if (NO_ES_ZONA.has(z)) continue;
      miradas++;
      if (!finales[fichaSlug].has(normalizarZona(z))) huerfanas.push(pest + ' → «' + z + '» (' + COSECHA[pest][z] + ' filas)');
    }
  }
  console.log('    zonas de Excel miradas: ' + miradas);
  af(() => miradas >= 18, 'el barrido miró ' + miradas + ' zonas: con tan pocas no está midiendo el padrón');
  af(() => huerfanas.length === 0,
     '🔴 EL LOTE NO ESTÁ COMPLETO. El Excel escribe zonas que la ficha no tendrá ni después del renombre:\n       '
     + huerfanas.join('\n       ') + '\n       Un par sin cubrir atora a cada persona nueva de esa zona en el careo.');
  // 🔒 CONTROL POSITIVO: sin el lote, el barrido TIENE que encontrar huérfanas.
  const crudo = {}; for (const s of Object.keys(FICHA)) crudo[s] = new Set(nombres(FICHA[s]).map(normalizarZona));
  const sinLote = [];
  for (const pest of Object.keys(COSECHA)) for (const z of Object.keys(COSECHA[pest])) {
    if (NO_ES_ZONA.has(z)) continue;
    if (!crudo[FICHA_DE_PESTANA[pest]].has(normalizarZona(z))) sinLote.push(pest + '/' + z);
  }
  console.log('    sin el lote quedarían huérfanas: ' + sinLote.length + ' → ' + sinLote.join(', '));
  // ⚠️ SON 7, NO 6, y la diferencia es la forma del trabajo: `caifanes#0/Perfiles`
  // y `caifanes#1/Perfiles` son DOS pares que cura UN SOLO renombre de ficha,
  // porque las dos pestañas comparten la ficha del PADRE. Confíe en el conteo del
  // dato: mi primera expectativa dijo 6 y el barrido dijo 7 — tenía razón el barrido.
  af(() => sinLote.length === 7,
     'CONTROL POSITIVO: sin el lote tenían que quedar 7 pares huérfanos (los 7 que el lote cura), quedaron ' + sinLote.length + ': ' + sinLote.join(', '));
}

// ═══ [E] LO QUE NO SE RENOMBRA, Y POR QUÉ — medido, no supuesto ════════════
console.log('\n[E] las zonas que NO entran al lote');
{
  // caifanes «Perfil B» y «Perfil C»: el Excel NO las escribe (las dos `ag:1`).
  const excelCaif = new Set([...Object.keys(COSECHA['caifanes#0']), ...Object.keys(COSECHA['caifanes#1'])]);
  af(() => !excelCaif.has('Perfiles B') && !excelCaif.has('Perfil B'),
     '🔴 el Excel SÍ escribe un «Perfil B»/«Perfiles B» en caifanes: entonces el lote está corto');
  af(() => !excelCaif.has('Perfiles C') && !excelCaif.has('Perfil C'),
     '🔴 el Excel SÍ escribe un «Perfil C»/«Perfiles C» en caifanes: entonces el lote está corto');
  // trueno «Perfil B»: el Excel YA la escribe igual que la ficha → no se toca.
  af(() => Object.keys(COSECHA['trueno']).includes('Perfil B'),
     'el Excel de trueno tenía que escribir «Perfil B» tal cual (por eso no se renombra)');
  af(() => !LOTE.some((r) => r.vieja === 'Perfil B'), 'nadie debe renombrar «Perfil B»: la ficha y el Excel ya coinciden');
  // arjona «General de Pie»: no está en el Excel (nadie ha vendido ahí).
  af(() => !Object.keys(COSECHA['arjona']).includes('General de Pie'),
     'premisa: el Excel de arjona no escribe «General de Pie»');
  // Y el séptimo par, el que ya estaba hecho.
  af(() => cuantas(FICHA.arjona, tok(YA_APLICADO.vieja)) === 0,
     '🔴 apareció «' + YA_APLICADO.vieja + '» en la ficha de arjona: ya no estaría aplicado y el lote estaría corto');
  af(() => nombres(FICHA.arjona).includes(YA_APLICADO.nueva),
     'la ficha de arjona tenía que traer ya «' + YA_APLICADO.nueva + '»');
  af(() => Object.keys(COSECHA['arjona']).includes('Segundo Nivel'),
     'el Excel de arjona tenía que escribir «Segundo Nivel» (es la prueba de que esa dirección es la correcta)');
}

// ═══ [F] LA CARDINALIDAD DEL LOTE ══════════════════════════════════════════
console.log('\n[F] el lote, en números');
{
  const sitios = LOTE.reduce((a, r) => a + r.sitios, 0);
  const pares = LOTE.reduce((a, r) => a + r.pestanas.length, 0);
  console.log('    renombres de ficha: ' + LOTE.length + ' · sitios de JSON: ' + sitios
    + ' · pares (pestaña,zona) vivos: ' + pares + ' · + 1 par ya aplicado (2do Nivel)');
  af(() => LOTE.length === 6, 'el lote tenía 6 renombres de ficha vivos, trae ' + LOTE.length);
  af(() => sitios === 20, 'los sitios de JSON medidos eran 20, el lote declara ' + sitios);
  // 🔒 7 pares VIVOS, no 8: el octavo nombrado (`2do Nivel`) ya estaba aplicado
  // en la ficha, así que no es un par que falte curar. Y 7 pares con 6 renombres de
  // ficha NO es una incoherencia: caifanes cura dos pestañas con una edición.
  af(() => pares === 7, 'los pares (pestaña,zona) vivos eran 7, el lote declara ' + pares);
  af(() => pares > LOTE.length,
     'los pares tenían que ser MÁS que los renombres de ficha (caifanes sirve a dos pestañas): ' + pares + ' vs ' + LOTE.length);
  // 🔒 caifanes es UNA ficha que sirve a DOS pestañas: eso cambia la forma del
  // trabajo y por eso se afirma.
  const caif = LOTE.filter((r) => r.ficha === 'caifanes');
  af(() => caif.some((r) => r.pestanas.length === 2),
     '🔴 caifanes dejó de ser UNA ficha para DOS pestañas: el renombre del padre afecta a #0 y #1 a la vez');
  af(() => LOTE.filter((r) => r.sitios === 6).length === 2,
     'las dos zonas de caifanes viven en 6 sitios cada una (zonas + cheap + 2 fechas × 2): el multifecha también cuenta');
}

console.log('\n' + (rojos === 0
  ? (verdes === 0 ? '⚠️  NADA MEDIDO · esto NO es un verde' : '✅ VERDE · ' + verdes + ' en verde, 0 en rojo')
  : '🔴 ROJO · ' + verdes + ' en verde, ' + rojos + ' en rojo'));
process.exit(rojos === 0 && verdes > 0 ? 0 : 1);
