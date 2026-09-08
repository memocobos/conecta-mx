#!/usr/bin/env node
// =============================================================================
// scripts/vigia-color-literal.js — EL MEDIDOR DE LA SERIE COLOR
//
// [COLOR-1, 7-sep-2026] NACIÓ DE UN ERROR MÍO, y por eso lo primero que dice es
// para qué NO sirve el otro: `vigia-color-en-linea` cuenta declaraciones
// `color:` dentro de un `style=`, y **un `color:var(--red)` sigue siendo una**.
// Convertir un hex a token —que es justo lo que hace esta serie— NO mueve ese
// número ni un punto. El plan de COLOR-0 decía «el vigía tiene que bajar
// exactamente lo que la fase dice»: eso era falso, y se descubrió midiendo.
//
// Los dos números son distintos y los dos hacen falta:
//   · vigia-color-en-linea  → cuántas declaraciones viven EN LÍNEA
//                             (baja solo si se mueven a una clase)
//   · vigia-color-literal   → cuántas escriben un COLOR A MANO
//                             (baja cuando se convierten a token)  ← ésta
//
// QUÉ CUENTA: un `color:` dentro de `style="…"` cuyo valor es un literal —
// `#hex`, `rgb()`, `hsl()`, un nombre— y NO es `var(--x)`, ni una expresión
// (`${…}` / concatenación), ni `inherit`. Ésos son los que no respetan el tema.
//
// USO:  node scripts/vigia-color-literal.js            → vigila (sale 1 si creció)
//       node scripts/vigia-color-literal.js --detalle  → los lista uno por uno
//       node scripts/vigia-color-literal.js --rebase   → imprime la base nueva
// =============================================================================
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');

// ── Base MEDIDA el 7-sep-2026, DESPUÉS de COLOR-1. Para moverla: --rebase,
//    pegar el bloque, y DECIR EN LA PR por qué cambió.
const BASE = { medida: '2026-09-07', total: 186, html: 6 };

const RE_STYLE = /style\s*=\s*(["'])([\s\S]*?)\1/g;
const RE_DECL  = /(?<![-\w])color\s*:/gi;

// El valor completo: desde `color:` hasta el `;` de NIVEL 0, respetando comillas
// y `${}`. Un capturador que corta en la primera comilla se traga los ternarios
// y contesta la ausencia cómoda — ya mordió una vez en COLOR-0.
function valorTras(style, desde) {
  let i = desde, q = null, llaves = 0, out = '';
  for (; i < style.length; i++) {
    const c = style[i];
    if (q) { out += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
    if (c === '{') llaves++;
    if (c === '}') llaves--;
    if (c === ';' && llaves <= 0) break;
    out += c;
  }
  return out.trim();
}
// PRUEBA POSITIVA, no negativa. La primera versión listaba lo que NO era literal
// y se le coló `' + p.color + '` —concatenación con comillas SIMPLES—, que
// contó como color a mano seis veces. La sintaxis de color en CSS es cerrada,
// así que se puede exigir la forma en vez de adivinar las excepciones.
const FORMAS = [
  /^#[0-9a-f]{3,8}$/i,
  /^rgba?\(\s*[\d.\s,%/]+\)$/i,
  /^hsla?\(\s*[\d.\s,%/deg]+\)$/i,
  /^[a-z]{3,20}$/i,                       // nombres: white, black, tomato…
];
const NO_COLOR = /^(inherit|currentcolor|transparent|unset|initial|revert|auto|none)$/i;
const esLiteral = (v) => {
  if (!v) return false;
  if (NO_COLOR.test(v)) return false;
  return FORMAS.some((r) => r.test(v));
};

function archivos() {
  return [...fs.readdirSync(RAIZ).filter((f) => /^kamehouse.*\.js$/.test(f)).sort(), 'kamehouse.html'];
}
function medir() {
  const porArchivo = {}, detalle = [];
  for (const f of archivos()) {
    const txt = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    const lineas = txt.split('\n'); const offs = []; let acc = 0;
    for (const L of lineas) { offs.push(acc); acc += L.length + 1; }
    const lineaDe = (i) => { let lo = 0, hi = offs.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (offs[m] <= i) lo = m; else hi = m - 1; } return lo + 1; };
    RE_STYLE.lastIndex = 0; let m, n = 0;
    while ((m = RE_STYLE.exec(txt)) !== null) {
      const style = m[2]; RE_DECL.lastIndex = 0; let d;
      while ((d = RE_DECL.exec(style)) !== null) {
        const v = valorTras(style, d.index + d[0].length);
        if (esLiteral(v)) { n++; detalle.push({ archivo: f, linea: lineaDe(m.index), valor: v }); }
      }
    }
    if (n) porArchivo[f] = n;
  }
  return { total: detalle.length, html: porArchivo['kamehouse.html'] || 0, porArchivo, detalle };
}

const hoy = medir();
if (process.argv.includes('--detalle')) {
  hoy.detalle.forEach((d) => console.log(`  ${d.archivo}:${d.linea}  ${d.valor}`));
  process.exit(0);
}
if (process.argv.includes('--rebase')) {
  console.log(`const BASE = { medida: '${new Date().toISOString().slice(0, 10)}', total: ${hoy.total}, html: ${hoy.html} };`);
  process.exit(0);
}
console.log('COLOR LITERAL EN LÍNEA — el que NO respeta el tema');
console.log(`   base ${BASE.medida}:  total ${BASE.total} · kamehouse.html ${BASE.html}`);
console.log(`   hoy:                 total ${hoy.total} · kamehouse.html ${hoy.html}`);
console.log('   por archivo:');
Object.entries(hoy.porArchivo).sort((a, b) => b[1] - a[1])
  .forEach(([f, n]) => console.log(`     ${String(n).padStart(4)}  ${f}`));
if (hoy.total > BASE.total) {
  console.log(`\n🔴 CRECIÓ: ${hoy.total} > ${BASE.total}. Un color a mano nuevo no respeta los temas.`);
  process.exit(1);
}
console.log(hoy.total < BASE.total
  ? `\n🟢 bajó ${BASE.total - hoy.total}. Mueve la base con --rebase y dilo en la PR.`
  : '\n🟢 sin crecimiento.');
