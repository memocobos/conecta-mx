#!/usr/bin/env node
// =============================================================================
// scripts/vigia-color-en-linea.js — EL VIGILANTE DEL COLOR EN LÍNEA
//
// [COLOR-VIGIA-1, 4-sep-2026] KH-4 midió el color en línea del Palacio y dejó
// un vigilante «para que no creciera». No cazó nada nunca. LA AUTOPSIA, y es la
// parte que importa porque hay varios vigilantes de la misma familia:
//
//   🔴 NO estaba mal anclado ni medía otra cosa: **NO EXISTÍA**.
//      · `CAREO-*` está en `.gitignore` (línea 27).
//      · `git log --diff-filter=A -- 'CAREO*'` → VACÍO: ningún arnés se versionó
//        jamás en este repo.
//      · No hay `.github/workflows`, ni `scripts` en `package.json`.
//      Vivía como archivo local ignorado en UNA máquina. Nada lo corría, nada lo
//      preservaba y nada notó su ausencia.
//
//   🔒 LA LEY QUE SALE DE AHÍ: **un vigilante que vive en un archivo ignorado no
//      es un vigilante, es una nota**. Si tiene que sobrevivir a la sesión que lo
//      escribió, va VERSIONADO. Por eso esto vive en `scripts/`, que sí se
//      versiona, y no en un `CAREO-*`.
//
// QUÉ MIDE, dicho con precisión (un número que no se puede recomputar no se
// puede vigilar): declaraciones `color:` DENTRO de un atributo `style="…"` en
// línea. NO cuenta `background-color`/`border-color` —ésos van aparte, como
// contexto— ni el `color:` de las plantillas CSS ni el de los comentarios.
//
// ⚠️ LA LÍNEA BASE SE MOVIÓ A LO MEDIDO HOY, CON ACTA. El libro decía 827 js /
// 158 html (KH-4, sobre UN kamehouse.js que la serie MONO repartió en 18
// módulos). El encargo decía 965/196. **Ninguna de las dos se puede reproducir**
// con una definición que se pueda escribir, así que no se consagran: la base es
// lo que hoy mide este archivo. Los aumentos ya ocurridos NO se re-litigan —
// pagar la deuda del color es OTRA tuerca, y no es ésta.
//
// USO:
//   node scripts/vigia-color-en-linea.js            → vigila (sale 1 si creció)
//   node scripts/vigia-color-en-linea.js --autotest → se valida a sí mismo
//   node scripts/vigia-color-en-linea.js --rebase   → imprime la base nueva
// =============================================================================
const fs = require('fs'), path = require('path'), glob = null;
const RAIZ = path.join(__dirname, '..');

// ── La línea base, MEDIDA el 4-sep-2026 sobre `cd251cc`. Para moverla: correr
//    con `--rebase`, pegar el bloque, y DECIR EN LA PR por qué subió.
const BASE = {
  medida: '2026-09-04',
  commit: 'cd251cc',
  js: 888,
  html: 187,
  // Contexto, NO vigilado: cualquier `*color:` en línea (incluye background-color).
  contexto: { jsAmplio: 928, htmlAmplio: 198 },
};

const RE_STYLE = /style\s*=\s*(["'])([\s\S]*?)\1/g;
const RE_COLOR = /(?<![-\w])color\s*:/gi;
const RE_COLOR_AMPLIO = /[-\w]*color\s*:/gi;

function contar(txt, amplio) {
  const re = amplio ? RE_COLOR_AMPLIO : RE_COLOR;
  let n = 0, m;
  RE_STYLE.lastIndex = 0;
  while ((m = RE_STYLE.exec(txt)) !== null) n += (m[2].match(re) || []).length;
  return n;
}
function archivosJs() {
  return fs.readdirSync(RAIZ).filter(f => /^kamehouse.*\.js$/.test(f)).sort();
}
function medir(sobreescritos) {
  const leer = (f) => (sobreescritos && sobreescritos[f] !== undefined)
    ? sobreescritos[f] : fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const porArchivo = {};
  let js = 0, jsAmplio = 0;
  for (const f of archivosJs()) {
    const t = leer(f); const c = contar(t, false);
    if (c) porArchivo[f] = c;
    js += c; jsAmplio += contar(t, true);
  }
  const h = leer('kamehouse.html');
  return { js, html: contar(h, false), jsAmplio, htmlAmplio: contar(h, true), porArchivo };
}

// ── EL INSTRUMENTO SE VALIDA A SÍ MISMO, EN CADA CORRIDA ────────────────────
// 🔒 Un contador roto no truena: CONTESTA, y su respuesta favorita es «todo
// igual» — que es justo la que nadie verifica. Antes de creerle el veredicto se
// le siembra un color de más EN MEMORIA (nunca en disco) y se exige que lo cace;
// y se le quita y se exige que calle.
function autovalidar() {
  const real = medir();
  const f = 'kamehouse.html';
  const txt = fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const conSemilla = txt.replace('<body', '<div style="color:#f0f"></div><body');
  const sembrado = medir({ [f]: conSemilla });
  const limpio = medir({ [f]: txt });
  const caza = sembrado.html === real.html + 1;
  const calla = limpio.html === real.html;
  return { caza, calla, real, sembrado: sembrado.html, base: real.html };
}

const args = process.argv.slice(2);
const v = autovalidar();
if (!v.caza || !v.calla) {
  console.error('🔴 EL INSTRUMENTO NO SIRVE — no se emite veredicto.');
  console.error(`   ¿caza un color sembrado? ${v.caza ? 'sí' : 'NO'} (${v.base} → ${v.sembrado})`);
  console.error(`   ¿calla al quitarlo?      ${v.calla ? 'sí' : 'NO'}`);
  process.exit(2);
}

const hoy = v.real;
if (args.includes('--rebase')) {
  console.log(JSON.stringify({ js: hoy.js, html: hoy.html,
    contexto: { jsAmplio: hoy.jsAmplio, htmlAmplio: hoy.htmlAmplio } }, null, 2));
  process.exit(0);
}

console.log('── VIGÍA DEL COLOR EN LÍNEA ──');
console.log(`   instrumento validado: siembra un color y lo caza (${v.base} → ${v.sembrado}); lo quita y calla.`);
console.log(`   base ${BASE.medida} (${BASE.commit}):  js ${BASE.js} · html ${BASE.html}`);
console.log(`   hoy:                        js ${hoy.js} · html ${hoy.html}`);
console.log(`   contexto (no vigilado, *color: en línea): js ${hoy.jsAmplio} · html ${hoy.htmlAmplio}`);

const subioJs = hoy.js - BASE.js, subioHtml = hoy.html - BASE.html;
if (subioJs > 0 || subioHtml > 0) {
  console.error('\n🔴 EL COLOR EN LÍNEA CRECIÓ.');
  if (subioJs > 0) {
    console.error(`   .js  +${subioJs}  (${BASE.js} → ${hoy.js})`);
    // CON NOMBRE: se dice QUIÉN creció, no solo que creció.
    console.error('   por archivo hoy: ' + Object.entries(hoy.porArchivo)
      .sort((a, b) => b[1] - a[1]).map(([f, c]) => `${f}=${c}`).join(' · '));
  }
  if (subioHtml > 0) console.error(`   html +${subioHtml}  (${BASE.html} → ${hoy.html})`);
  console.error('\n   El color va en `kamehouse.css`, no en `style=`. Si el aumento es a');
  console.error('   propósito y está firmado, se mueve la base con `--rebase` y SE DICE EN LA PR.');
  process.exit(1);
}
console.log(subioJs === 0 && subioHtml === 0
  ? '\n🟢 sin crecimiento.'
  : `\n🟢 sin crecimiento (bajó: js ${subioJs} · html ${subioHtml}).`);
