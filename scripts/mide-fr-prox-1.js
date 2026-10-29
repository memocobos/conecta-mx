#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// FR-PROX-1 · LA NOCHE EN «PRÓXIMAMENTE» (29-oct-2026)
// ═══════════════════════════════════════════════════════════════════════════
// Palabra de Memo: «las fechas en el multifecha en esferas se puedan poner en
// lugar de agotado también opción de Próximamente, como ahorita en fuerza
// regida que aún no puedo abrir las fechas 15 y 16».
//
// LO MEDIDO ANTES DE CONSTRUIR: el index lee `mf.prox` de la ENTRADA desde
// siempre (buildFechaButtons pinta el botón deshabilitado «↻ Próximamente»)
// pero su ESCRITOR murió con la era pre-Esferas: parseMultifecha lo recortaba
// y multifechaTexto no lo emitía — un lector sin escritor, la familia de la
// guarda inalcanzable. Las zonas prox, el candado del servidor
// (_calcularPrecio L186) y la derivación del global (ESF-UX-2c) YA existían.
//
// ⚠️ SIN ANCLA a propósito (carga del ÁRBOL, como mide:req-b1): no sufre la
// trampa del commit y no puede traer control positivo por commit — sus
// controles son positivos por construcción (round-trip + sabotaje con sha1).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let V = 0, R = 0;
const af = (cond, msg) => {
  try { cond = (typeof cond === 'function') ? cond() : cond; }
  catch (e) { cond = false; msg += ' · EXCEPCIÓN: ' + (e && e.message); }
  if (cond) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
};
// Rebana una función top-level por BALANCE DE LLAVES (la forma de la casa).
function rebana(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let j = src.indexOf('{', i), bal = 0, k = j;
  for (; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') bal++;
    else if (ch === '}') { bal--; if (bal === 0) { k++; break; } }
  }
  return src.slice(i, k);
}

const COMPILE = path.join(RAIZ, 'netlify/functions/_lib/esferas-compile.js');
const { compilarEV } = require(COMPILE);
const { _calcularPrecio } = require(path.join(RAIZ, 'netlify/functions/_lib/precio-zona.js'));
const INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const ESF_SRC = fs.readFileSync(path.join(RAIZ, 'kamehouse-esferas.js'), 'utf8');
const KH_SRC = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');

// Extrae el objeto de un evento del EV por balance de llaves.
function extraeObj(src, id) {
  const i = src.indexOf("id:'" + id + "'");
  if (i < 0) return null;
  let a = src.lastIndexOf('{', i), bal = 0, j = a;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') bal++;
    else if (ch === '}') { bal--; if (bal === 0) { j++; break; } }
  }
  return src.slice(a, j);
}
const evalObj = (lit) => vm.runInNewContext('(' + lit + ')', {});

// ── [A] EL COMPILADOR: prox de ENTRADA viaja, y sin prox nada se mueve ──────
console.log('\n[A] compilador · parseMultifecha + multifechaTexto');
{
  const csrc = fs.readFileSync(COMPILE, 'utf8');
  const sb = { module: { exports: {} } };
  // multifechaTexto necesita escStr/cheapZonaTexto/_hotelFilaTexto; parseMultifecha
  // necesita parseCheapZonas/_esAg/_esProx/FECHA_RE — se rebanan del archivo REAL.
  const piezas = ['escStr', 'cheapZonaTexto', '_hotelFilaTexto', 'parseCheapZonas',
    '_esAg', '_esProx', 'parseMultifecha', 'multifechaTexto']
    .map((n) => rebana(csrc, n)).filter(Boolean);
  af(piezas.length === 8, 'las 8 piezas del compilador se rebanaron (' + piezas.length + '/8)');
  const feRe = csrc.match(/const FECHA_RE\s*=\s*[^;]+;/);
  vm.createContext(sb);
  vm.runInContext((feRe ? feRe[0] : 'const FECHA_RE=/^\\d{4}-\\d{2}-\\d{2}$/;') + '\n' + piezas.join('\n'), sb);
  const parseMF = vm.runInContext('parseMultifecha', sb);
  const mfTexto = vm.runInContext('multifechaTexto', sb);

  // Round-trip de una entrada REAL del index (fuerzaregida #0, sin prox):
  // parsear + re-emitir = byte-igual → la edición no movió la emisión sin-prox.
  const vie = evalObj(extraeObj(INDEX, 'fuerzaregida'));
  const lit0 = (() => {
    // el literal de la entrada #0 tal cual vive en el index (balance de llaves)
    const i = INDEX.indexOf("multifecha:[", INDEX.indexOf("id:'fuerzaregida'"));
    let a = INDEX.indexOf('{', i), bal = 0, j = a;
    for (; j < INDEX.length; j++) {
      const ch = INDEX[j];
      if (ch === '{') bal++;
      else if (ch === '}') { bal--; if (bal === 0) { j++; break; } }
    }
    return INDEX.slice(a, j);
  })();
  const parsed0 = parseMF([vie.multifecha[0]])[0];
  af(mfTexto(parsed0) === lit0, 'round-trip SIN prox: parsear+emitir la entrada #0 real = byte-igual al index');
  af(parsed0.prox === 0, 'una entrada sin prox parsea prox:0 (no undefined — la llave existe)');

  // Con prox: se conserva y se emite, en los dos tipos (1 y true — la forma rideAgotado).
  const conProx = parseMF([Object.assign({}, vie.multifecha[0], { prox: 1 })])[0];
  af(conProx.prox === 1, 'parseMultifecha conserva prox:1 de la entrada');
  af(mfTexto(conProx).endsWith(',prox:1}'), 'multifechaTexto emite ,prox:1 al final');
  const conTrue = parseMF([Object.assign({}, vie.multifecha[0], { prox: true })])[0];
  af(conTrue.prox === true, 'el TIPO se conserva: prox:true parsea true');
  af(mfTexto(conTrue).endsWith(',prox:true}'), 'y se emite ,prox:true (como rideAgotado)');
}

// ── [B] LA FICHA REAL post-update, por el DUEÑO (compilarEV) ────────────────
console.log('\n[B] compilarEV con la ficha REAL de la base (fr-prox-ficha.json)');
let nue = null;
{
  const fichaPath = process.env.FICHA || '/sessions/gifted-blissful-cori/mnt/outputs/fr-prox-ficha.json';
  if (!fs.existsSync(fichaPath)) {
    console.log('  ⚠ sin ficha en ' + fichaPath + ' — el bloque [B]/[C]/[D] usa la ficha; se salta.');
  } else {
    const FICHA = JSON.parse(fs.readFileSync(fichaPath, 'utf8'));
    const out = compilarEV({ esferas: [FICHA], indexHtml: INDEX });
    const html = out.contenidoNuevo || out.contenido || out.html;
    nue = evalObj(extraeObj(html, 'fuerzaregida'));
    af(nue.multifecha.length === 4, 'multifecha emitido con 4 entradas');
    af(nue.multifecha[2].prox === 1 && nue.multifecha[3].prox === 1, '#2 y #3 EMITEN prox:1 en la entrada');
    af(!nue.multifecha[0].prox && !nue.multifecha[1].prox, '#0 y #1 sin prox');
    for (const i of [2, 3]) {
      af(nue.multifecha[i].zonas.every((z) => z.prox === 1 && !z.ag), '#' + i + ': 15 zonas prox:1 sin ag');
      af(nue.multifecha[i].cheapZonas.every((z) => z.prox === 1 && !z.ag), '#' + i + ': 15 cheapZonas prox:1 sin ag');
    }
    af(/11/.test(nue.f) && /15/.test(nue.f) && /16/.test(nue.f), 'f sigue nombrando las 4 fechas (anunciadas): «' + nue.f + '»');
    // La derivación del global (ESF-UX-2c): una zona viva SOLO en fechas prox
    // sale PRÓXIMAMENTE en el catálogo — ni disponible ni agotada.
    const gPlat = nue.zonas.find((z) => z.n === 'Platino');
    af(gPlat && gPlat.prox === 1 && !gPlat.ag, 'global Platino (ag en 11/12 · prox en 15/16) deriva PRÓXIMAMENTE');
    const gVip = nue.zonas.find((z) => z.n === 'Cancha VIP');
    af(gVip && !gVip.prox && !gVip.ag, 'global Cancha VIP (abierta el 11) sigue ABIERTA');
  }
}

// ── [C] EL BOTÓN DE FECHA DEL INDEX, la función REAL ────────────────────────
console.log('\n[C] buildFechaButtons real (rebanada del index, vm + DOM falso)');
if (nue) {
  const fn = rebana(INDEX, 'buildFechaButtons');
  af(!!fn, 'buildFechaButtons se rebanó del index');
  const caja = { html: '' };
  const sb = {
    cur: nue, selPkg: 'plus', selFechaIdx: 0,
    $$: () => ({ set innerHTML(v) { caja.html = v; } }),
  };
  vm.createContext(sb);
  vm.runInContext(fn + '\nbuildFechaButtons();', sb);
  const botones = caja.html.split('</button>').filter((s) => s.trim());
  af(botones.length === 4, 'pinta 4 botones de fecha');
  af(/15 Enero/.test(botones[2]) && /Próximamente/.test(botones[2]) && /disabled/.test(botones[2]),
    'el botón del 15-ene sale DESHABILITADO con «Próximamente»');
  af(/16 Enero/.test(botones[3]) && /Próximamente/.test(botones[3]) && /disabled/.test(botones[3]),
    'el botón del 16-ene sale DESHABILITADO con «Próximamente»');
  af(/11 Enero/.test(botones[0]) && !/disabled/.test(botones[0]), 'el del 11-ene sigue VIVO (vende)');
  af(/12 Enero/.test(botones[1]) && !/disabled/.test(botones[1]), 'el del 12-ene sigue VIVO');
}

// ── [D] EL SERVIDOR: _calcularPrecio rebota la fecha prox ───────────────────
console.log('\n[D] _calcularPrecio (la puerta del cliente, SIN para_careo)');
if (nue) {
  const HOY = '2026-10-29';
  const r2p = _calcularPrecio(nue, { paquete: 'plus', zona: 'Cancha VIP', num_personas: 1, fecha_idx: 2, hoyISO: HOY });
  af(r2p.ok === false && /próx/i.test(r2p.motivo || ''), '#2 PLUS Cancha VIP REBOTA: ' + (r2p.motivo || ''));
  const r3c = _calcularPrecio(nue, { paquete: 'cheap', zona: 'Luneta', num_personas: 1, fecha_idx: 3, hoyISO: HOY });
  af(r3c.ok === false && /próx/i.test(r3c.motivo || ''), '#3 CHEAP Luneta REBOTA: ' + (r3c.motivo || ''));
  const r0 = _calcularPrecio(nue, { paquete: 'plus', zona: 'Cancha VIP', num_personas: 1, fecha_idx: 0, hoyISO: HOY });
  af(r0.ok === true && r0.separo === 300, 'control: #0 Cancha VIP sigue cotizando (total $' + (r0.total || '?') + ' · sep $300)');
}

// ── [E] EL EDITOR DE ESFERAS: los tres verbos sobre un box falso ────────────
console.log('\n[E] _esfMfProx · _esfTabAgotar · _esfGetMultifecha (rebanados, vm)');
{
  const piezas = ['_esfTabAgotar', '_esfMfProx', '_esfMfProxPintar'].map((n) => rebana(ESF_SRC, n));
  af(piezas.every(Boolean), 'los 3 verbos se rebanaron del archivo real');
  // MF_ADMINISTRADAS se EVALÚA del kamehouse.js real (no regex sobre comentarios).
  const setLit = KH_SRC.match(/const MF_ADMINISTRADAS = new Set\(\s*\[[^\]]*\]\);/);
  af(!!setLit, 'MF_ADMINISTRADAS se encontró en kamehouse.js');
  // El Set se EVALÚA del archivo real (no regex sobre comentarios — ley de ESF).
  const MFA = vm.runInNewContext(setLit[0] + '; MF_ADMINISTRADAS;', {});
  af(MFA.has('prox'), 'MF_ADMINISTRADAS contiene prox (sin esto, Reabrir no podría quitarlo: la preservación lo re-insertaría)');

  // Un box FALSO con la forma que las funciones leen (la del bloque real).
  function boxFalso(prox) {
    const btn = { textContent: '↻ Próximamente', style: {} };
    const inputs = { '.esf-mf-prox': btn, '.esf-mf-lbl': { value: '15 Enero' }, '.esf-mf-ride': { value: '' }, '.esf-mf-rideag': { checked: false } };
    return {
      _esfZonas: [{ n: 'Cancha VIP', p: 5900, ag: 1 }, { n: 'Platino', p: 7200, ag: 1 }],
      _esfCheap: [{ n: 'Cancha VIP', p: 4100, ag: 1 }],
      _esfProx: !!prox,
      _esfMfOrig: {},
      querySelector: (sel) => inputs[sel] || null,
      _btn: btn,
    };
  }
  const sb = { _esfTableroPintar: () => {}, _esfAviso: () => {}, console };
  vm.createContext(sb);
  vm.runInContext(piezas.join('\n'), sb);

  // El verbo nuevo: entrada + zonas a prox, sin ag.
  const b1 = boxFalso(false);
  vm.runInContext('_esfMfProx(col)', Object.assign(sb, { col: { box: b1 } }));
  af(b1._esfProx === true, '_esfMfProx marca la ENTRADA');
  af(b1._esfZonas.every((z) => z.prox === 1 && !('ag' in z)), '…y las zonas PLUS quedan prox:1 sin ag');
  af(b1._esfCheap.every((z) => z.prox === 1 && !('ag' in z)), '…y las CHEAP también');
  af(b1._btn.textContent === '✓ Próximamente', '…y el botón CAMBIA de cara (el estado se ve)');

  // Agotar la noche: quita el prox (entrada y zonas) y agota.
  const b2 = boxFalso(true); b2._esfZonas.forEach((z) => { delete z.ag; z.prox = 1; });
  vm.runInContext('_esfTabAgotar(col, true)', Object.assign(sb, { col: { box: b2, fecha: true } }));
  af(b2._esfProx === false, 'Agotar la noche QUITA el prox de la entrada');
  af(b2._esfZonas.every((z) => z.ag === 1 && !('prox' in z)), '…y las zonas quedan ag:1 sin prox');

  // Reabrir: a la venta — quita ag Y prox.
  const b3 = boxFalso(true); b3._esfZonas.forEach((z) => { z.prox = 1; });
  vm.runInContext('_esfTabAgotar(col, false)', Object.assign(sb, { col: { box: b3, fecha: true } }));
  af(b3._esfProx === false, 'Reabrir QUITA el prox de la entrada');
  af(b3._esfZonas.every((z) => !('ag' in z) && !('prox' in z)), '…y las zonas quedan SIN ag y SIN prox (a la venta)');

  // _esfGetMultifecha: emite prox del box, conserva el TIPO del original, y al
  // quitarlo NO vuelve por preservación.
  const gmSrc = rebana(ESF_SRC, '_esfGetMultifecha');
  af(!!gmSrc, '_esfGetMultifecha se rebanó');
  function corredorGM(boxes) {
    const sb2 = {
      document: { querySelectorAll: () => boxes },
      Array, Number, parseInt, MF_ADMINISTRADAS: MFA,
      _esfMfLeerHotel: () => null, Object,
    };
    vm.createContext(sb2);
    return vm.runInContext(gmSrc + '\n_esfGetMultifecha();', sb2);
  }
  const mkBox = (prox, orig) => {
    const inputs = {
      '.esf-mf-lbl': { value: '15 Enero' }, '.esf-mf-ds': { value: '2027-01-15' },
      '.esf-mf-sublbl': { value: '' }, '.esf-mf-noches': { value: '' },
      '.esf-mf-music': { value: '' }, '.esf-mf-ride': { value: '' },
      '.esf-mf-rideag': { checked: false }, '.esf-mf-hotelbox': {},
    };
    return { _esfZonas: [{ n: 'A', p: 100 }], _esfCheap: [], _esfProx: !!prox,
      _esfMfOrig: orig || {}, querySelector: (s) => inputs[s] || null };
  };
  const out1 = corredorGM([mkBox(true, {})]);
  af(out1 && out1[0].prox === 1, 'guardar con el box en prox emite prox:1');
  const out2 = corredorGM([mkBox(true, { prox: true })]);
  af(out2 && out2[0].prox === true, 'el TIPO del original se conserva (prox:true vuelve true)');
  const out3 = corredorGM([mkBox(false, { prox: 1, rarisima: 'x' })]);
  af(out3 && !('prox' in out3[0]), 'QUITADO el prox, NO vuelve por preservación (MF_ADMINISTRADAS)');
  af(out3 && out3[0].rarisima === 'x', 'control: una llave desconocida SÍ se preserva');
}

// ── [F] SABOTAJE: la emisión de prox se puede romper y el careo lo ve ───────
console.log('\n[F] sabotaje (sha1 careado, respaldo con cp — jamás checkout)');
{
  const crypto = require('crypto');
  const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
  const orig = fs.readFileSync(COMPILE, 'utf8');
  const shaAntes = sha(orig);
  const ancla = "(f.prox ? (',prox:' + (f.prox === true ? 'true' : '1')) : '') + '}';";
  af(orig.includes(ancla), 'el ancla del sabotaje existe');
  const sab = orig.replace(ancla, "'}';");
  af(sha(sab) !== shaAntes, 'el sabotaje MUTÓ (sha1 distinto)');
  fs.writeFileSync(COMPILE, sab);
  try {
    delete require.cache[require.resolve(COMPILE)];
    const csab = require(COMPILE);
    const fichaPath = process.env.FICHA || '/sessions/gifted-blissful-cori/mnt/outputs/fr-prox-ficha.json';
    if (fs.existsSync(fichaPath)) {
      const FICHA = JSON.parse(fs.readFileSync(fichaPath, 'utf8'));
      const outS = csab.compilarEV({ esferas: [FICHA], indexHtml: INDEX });
      const nueS = evalObj(extraeObj(outS.contenidoNuevo || outS.contenido || outS.html, 'fuerzaregida'));
      af(!nueS.multifecha[2].prox, 'SABOTEADO, el emitido pierde el prox — el verde de [B] mide algo');
    } else {
      af(true, '(sin ficha: el sabotaje solo verifica mutación+restauración)');
    }
  } finally {
    fs.writeFileSync(COMPILE, orig);
    delete require.cache[require.resolve(COMPILE)];
  }
  af(sha(fs.readFileSync(COMPILE, 'utf8')) === shaAntes, 'restaurado byte a byte (' + shaAntes + ')');
}

console.log('\n══ ' + (R === 0 ? '✅ VERDE' : '🔴 ROJO') + ' · ' + V + ' en verde · ' + R + ' en rojo ══');
process.exit(R === 0 ? 0 : 1);
