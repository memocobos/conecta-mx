// =============================================================================
// LUCES-PLACA-1 · los foquitos de la tragamonedas de /sorteo
// =============================================================================
// Memo, en un iPhone a 390 px: dos focos de la fila de arriba se pintaban
// ENCIMA de la placa CONECTA MX (uno en la «C», otro en la «X»), y el último
// foco de abajo a la derecha quedaba más pegado a su vecino que el resto.
//
// LAS DOS CAUSAS, MEDIDAS Y DISTINTAS:
//   (a) `.placa` y `.luces` están las dos posicionadas y ninguna traía
//       z-index, así que mandaba el ORDEN DEL DOM — y `.luces` va después.
//   (b) los focos se colocaban por su BORDE (`left:8%` contra `right:8%`), que
//       NO es simétrico: el ancho del foco se cuenta hacia adentro de un lado y
//       hacia afuera del otro. Medido: 33.33 px contra 60.48 px.
//
// 🔒 SE MIDE EN EL NAVEGADOR, NO A OJO NI EN EL CSS. La intersección sale de
// `getBoundingClientRect` y quién pinta encima se le pregunta a
// `elementFromPoint`, que es el único que contesta la verdad: el estilo en
// línea, el z-index y el orden del DOM se combinan de maneras que leer el
// archivo no predice.
//
// 🔒 LOS DOS LADOS SON COMMITS. BASE es el main de antes y TIENE QUE FALLAR:
// sin eso, el verde de HEAD no distingue «lo arreglé» de «no estoy midiendo».
// ⚠️ HEAD sale del árbol vivo mientras esta tuerca está en revisión. EN CUANTO
// SE MERGEE hay que anclarlo a su commit de merge, o la siguiente tuerca que
// toque sorteo.html va a reventar este careo sin tener la culpa — le pasó a
// `mide:consuelo-verdad` el 21-sep.
//
// Uso: node scripts/mide-luces-placa.js   (BASE=<sha> HEAD=<sha> opcionales)
// =============================================================================

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const sh = (c) => execSync(c, { cwd: RAIZ, encoding: 'utf8' }).trim();
const BASE = sh(`git rev-parse ${process.env.BASE || 'main'}`);
const HEAD = process.env.HEAD ? sh(`git rev-parse ${process.env.HEAD}`) : null;

let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

const ANCHOS = [
  { n: 'celular', width: 390 },
  { n: 'tableta', width: 768 },
  { n: 'escritorio', width: 1280 },
];

function servir(raiz) {
  const s = http.createServer((q, r) => {
    const f = path.join(raiz, decodeURIComponent(q.url.split('?')[0]).replace(/^\//, '') || 'sorteo.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); return r.end('no'); }
      r.writeHead(200, { 'Content-Type': /\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'text/html; charset=utf-8' });
      r.end(b);
    });
  });
  return new Promise((res) => s.listen(0, '127.0.0.1', () => res({ s, p: s.address().port })));
}

function arbol(sha) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'luces-' + sha.slice(0, 7) + '-'));
  execSync(`git archive ${sha} sorteo.html | tar -x -C ${d}`, { cwd: RAIZ });
  return d;
}

// Lee la geometría REAL de la máquina en una página ya cargada.
async function medir(pg) {
  return pg.evaluate(() => {
    const caja = (e) => { const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.x + r.width, b: r.y + r.height }; };
    const placa = document.querySelector('.placa');
    const maq = document.querySelector('.maquina');
    if (!placa || !maq) return null;
    const P = caja(placa), M = caja(maq);
    const luces = [...document.querySelectorAll('.luz')].map((e, i) => {
      const c = caja(e);
      return { i, ...c, cx: c.x + c.w / 2, cy: c.y + c.h / 2 };
    });
    const cruzan = luces.filter((l) => !(l.r <= P.x || l.x >= P.r || l.b <= P.y || l.y >= P.b));
    // 🔒 Quién pinta en el centro de la placa se le pregunta al NAVEGADOR.
    // 🔴 Se pregunta si la placa CONTIENE a quien pinta, no cómo se llama: el
    // punto central cae sobre el <span> de «Conecta», que no tiene class, así
    // que comparar nombres daba un rojo falso. Es el hecho, no la palabra.
    const eP = document.elementFromPoint(P.x + P.w / 2, P.y + P.h / 2);
    const enPlaca = eP ? (placa.contains(eP) ? 'la placa (' + (eP.className || eP.tagName) + ')' : (eP.className || eP.tagName)) : null;
    const placaArriba = !!eP && placa.contains(eP);
    const ys = [...new Set(luces.map((l) => Math.round(l.cy)))].sort((a, b) => a - b);
    const fila = (y) => luces.filter((l) => Math.round(l.cy) === y).sort((a, b) => a.cx - b.cx).map((l) => +l.cx.toFixed(2));
    return { placa: P, maquina: M, total: luces.length,
      cruzan: cruzan.map((l) => ({ i: l.i, cx: +l.cx.toFixed(2) })),
      pintaEnPlaca: enPlaca, placaArriba,
      arriba: fila(ys[0]), abajo: fila(ys[ys.length - 1]) };
  });
}

const seps = (a) => a.slice(1).map((v, k) => +(v - a[k]).toFixed(2));
const desnivel = (a) => { const s = seps(a); return s.length ? +(Math.max(...s) - Math.min(...s)).toFixed(2) : 0; };
// Simetría de una fila respecto al centro de la máquina: el k-ésimo desde la
// izquierda tiene que estar a la misma distancia del centro que el k-ésimo
// desde la derecha.
const asimetria = (a, centro) => {
  let peor = 0;
  for (let k = 0; k < Math.floor(a.length / 2); k++) {
    peor = Math.max(peor, Math.abs((centro - a[k]) - (a[a.length - 1 - k] - centro)));
  }
  return +peor.toFixed(2);
};

(async () => {
  console.log('CAREO LUCES-PLACA-1 · los foquitos de /sorteo\n');
  console.log('BASE ' + BASE.slice(0, 7) + ' · HEAD ' + (HEAD ? HEAD.slice(0, 7) : 'árbol de trabajo'));

  const dirBase = arbol(BASE);
  const dirHead = HEAD ? arbol(HEAD) : RAIZ;
  const sBase = await servir(dirBase), sHead = await servir(dirHead);
  const nav = await chromium.launch();

  const abrir = async (puerto, width) => {
    const pg = await nav.newPage({ viewport: { width, height: 900 } });
    await pg.route('**/.netlify/functions/giveaway-estado*', (r) => r.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ ok: true, total: 40, sorteos: [], registro_cerrado: false }) }));
    await pg.route('**/.netlify/functions/giveaway-lista*', (r) => r.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ ok: true, nombres: [] }) }));
    await pg.goto(`http://127.0.0.1:${puerto}/sorteo.html`, { waitUntil: 'load' });
    await pg.waitForTimeout(500);
    return pg;
  };

  for (const a of ANCHOS) {
    // ── BASE: el control positivo. TIENE que estar roto. ────────────────────
    const pgB = await abrir(sBase.p, a.width);
    const B = await medir(pgB);
    await pgB.close();
    af(!!B && B.total >= 10, `[${a.n}] BASE: no encontré las luces (la sección pasaría EN VACÍO)`);
    if (B) {
      af(B.cruzan.length > 0,
        `[${a.n}] CONTROL POSITIVO: en BASE ningún foco cruza la placa — este careo no distingue «lo arreglé» de «no mido»`);
      af(desnivel(B.abajo) > 5,
        `[${a.n}] CONTROL POSITIVO: la fila de abajo de BASE ya estaba pareja (${desnivel(B.abajo)}px) — el caso no mide nada`);
    }

    // ── HEAD: lo que se entrega ─────────────────────────────────────────────
    const pg = await abrir(sHead.p, a.width);
    const H = await medir(pg);
    af(!!H && H.total >= 10, `[${a.n}] HEAD: no encontré las luces (cardinalidad)`);
    if (!H) { await pg.close(); continue; }
    const centro = H.maquina.x + H.maquina.w / 2;

    console.log(`\n══ ${a.n} (${a.width}px) · ${H.total} focos ══`);
    console.log(`   BASE  cruces con la placa: ${B ? B.cruzan.length : '—'} · desnivel abajo: ${B ? desnivel(B.abajo) : '—'}px`);
    console.log(`   HEAD  cruces con la placa: ${H.cruzan.length} · desnivel abajo: ${desnivel(H.abajo)}px`);
    console.log(`   arriba (${H.arriba.length}): ${H.arriba.join(', ')}`);
    console.log(`   abajo  (${H.abajo.length}): ${H.abajo.join(', ')}`);

    // 1 · NINGÚN foco detrás de la placa
    af(H.cruzan.length === 0,
      `[${a.n}] ${H.cruzan.length} foco(s) siguen intersectando la placa: x=${H.cruzan.map((c) => c.cx).join(', ')}`);

    // 2 · y la placa pinta ENCIMA aunque hubiera uno (los dos candados, no uno)
    af(H.placaArriba === true,
      `[${a.n}] en el centro de la placa pinta «${H.pintaEnPlaca}», que no está dentro de la placa`);
    const tapa = await pg.evaluate(() => {
      // Se SIEMBRA un foco justo en el centro de la placa: el z-index tiene que
      // ganarle igual. Sin esto, el z-index podría no existir y las aserciones
      // seguirían verdes solo porque no hay focos ahí.
      const p = document.querySelector('.placa').getBoundingClientRect();
      const i = document.createElement('i');
      i.className = 'luz'; i.style.cssText = `top:${p.y + p.height / 2 - 6}px;left:${p.x + p.width / 2 - 6}px;position:fixed`;
      document.querySelector('.luces').appendChild(i);
      const e = document.elementFromPoint(p.x + p.width / 2, p.y + p.height / 2);
      const placa = document.querySelector('.placa');
      const dentro = !!e && placa.contains(e);
      const quien = e ? (e.className || e.tagName) : null;
      i.remove();
      return { dentro, quien };
    });
    af(tapa.dentro === true,
      `[${a.n}] con un foco sembrado en su centro, la placa NO queda encima: pinta «${tapa.quien}»`);

    // 3 · cada fila, espaciada pareja (≤1px, que es redondeo de subpíxel)
    af(desnivel(H.abajo) <= 1, `[${a.n}] la fila de ABAJO no está pareja: ${desnivel(H.abajo)}px de desnivel`);
    af(H.arriba.length >= 4, `[${a.n}] la fila de ARRIBA se quedó con ${H.arriba.length} focos`);

    // 4 · cada fila, simétrica respecto al centro de la máquina
    af(asimetria(H.abajo, centro) <= 1, `[${a.n}] la fila de ABAJO no es simétrica: ${asimetria(H.abajo, centro)}px`);
    af(asimetria(H.arriba, centro) <= 1, `[${a.n}] la fila de ARRIBA no es simétrica: ${asimetria(H.arriba, centro)}px`);

    // 5 · ESPEJEADAS: cada foco de arriba cae en una columna de abajo.
    // No se exige el mismo NÚMERO —arriba faltan a propósito las del centro,
    // ahí va la placa— sino que las que hay compartan columna.
    const sinPareja = H.arriba.filter((x) => !H.abajo.some((y) => Math.abs(x - y) <= 1));
    af(sinPareja.length === 0,
      `[${a.n}] focos de arriba sin columna gemela abajo: ${sinPareja.join(', ')}`);
    console.log(`   espejeadas: ${sinPareja.length === 0 ? 'sí ✅' : '❌'} · simetría abajo ${asimetria(H.abajo, centro)}px · arriba ${asimetria(H.arriba, centro)}px`);
    await pg.close();
  }

  await nav.close(); sBase.s.close(); sHead.s.close();
  console.log('\n──────────────────────────────────────────────');
  if (mal) { console.log(`❌ ROJO · ${ok} en verde, ${mal} en rojo`); fallos.forEach((f) => console.log('  · ' + f)); process.exit(1); }
  console.log(`✅ VERDE · ${ok} aserciones en verde, 0 en rojo`);
})();
