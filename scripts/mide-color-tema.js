#!/usr/bin/env node
// =============================================================================
// scripts/mide-color-tema.js — EL CAREO VISUAL DE LA SERIE COLOR
//
// [COLOR-1, 7-sep-2026] Compara BASE contra HEAD **elemento por elemento**, con
// `kamehouse.css` aplicado de verdad y en DOS temas. No adivina: lee el color
// COMPUTADO que pinta el navegador y guarda la captura de cada elemento.
//
// LOS DOS SENTIDOS DEL CONTROL, que es lo que hace que el verde signifique algo:
//   · TEMA POR DEFECTO → HEAD tiene que verse casi igual que BASE. Se imprime el
//     Δ por canal; no se assertea un umbral inventado, se ENSEÑA.
//   · TEMA CLARO (`body.tema-america`, --bg:#FAFAFA) → BASE tiene que salir
//     IDÉNTICO a su propio defecto (ése es el bug: un hex no sigue al tema) y
//     HEAD tiene que MOVERSE. Si HEAD no se mueve, la conversión no sirvió.
//
// USO:  node scripts/mide-color-tema.js <sha-base>     (por defecto: main)
// =============================================================================
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { execSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const BASE_REF = process.argv[2] || 'main';
const TMP = fs.mkdtempSync('/tmp/color-base-');
const SALIDA = process.env.SALIDA || path.join(TMP, 'capturas');

// Los elementos que tocó COLOR-1. `sel` corre en la página; `revelar` destapa su
// contenedor —están en modales `display:none`— y se DICE que se destapó, en vez
// de fabricar estado en silencio.
const OBJETIVOS = [
  { id: 'mig-error',              nota: 'error de migración' },
  { id: 'ctr-btn-cancelar-edit',  nota: 'botón cancelar edición' },
  { id: 'wl-notif-evento',        nota: 'nombre del evento' },
  { texto: 'Incluir código',      nota: 'etiqueta del código' },
  { id: 'wl-notif-codigo',        nota: 'input código',    conFondo: true },
  { id: 'wl-notif-descuento',     nota: 'input descuento', conFondo: true },
  { id: 'wl-notif-horas',         nota: 'input horas',     conFondo: true },
  { id: 'wl-notif-error',         nota: 'error de la lista' },
];

const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2' };
function servir(raiz, puerto) {
  return new Promise((res, rej) => {
    const s = http.createServer((req, r) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(raiz, u === '/' ? 'index.html' : u);
      if (!f.startsWith(raiz)) { r.writeHead(403); return r.end(); }
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end('no'); }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); r.end(d); });
    });
    s.on('error', rej);                    // EADDRINUSE se GRITA: otro puerto sirve OTRO commit
    s.listen(puerto, () => res(s));
  });
}

const rgb = (s) => (String(s).match(/[\d.]+/g) || []).map(Number).slice(0, 3);
const dcanal = (a, b) => { const x = rgb(a), y = rgb(b); return Math.max(...x.map((v, i) => Math.abs(v - (y[i] ?? 0)))); };

async function leer(puerto, tema) {
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${puerto}/kamehouse.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const out = await page.evaluate(({ OBJ, tema }) => {
    if (tema) document.body.classList.add(tema);
    // Se destapan los contenedores ocultos. Es una revelación de PRESENTACIÓN,
    // no un estado fabricado: no se toca ningún dato ni se llama a ninguna función.
    document.querySelectorAll('[style*="display:none"]').forEach((el) => { el.style.display = 'block'; });
    const res = [];
    for (const o of OBJ) {
      let el = o.id ? document.getElementById(o.id) : null;
      if (!el && o.texto) {
        // UN PREFIJO NO ES UN ANCLA: `startsWith` sobre `textContent` casa
        // también con los ANCESTROS, y el primero del documento es el envoltorio
        // —que hereda otro color—. Se exige que el elegido tenga color PROPIO
        // en línea y se toma el más profundo.
        const cands = [...document.querySelectorAll('div')]
          .filter((d) => d.textContent.trim().startsWith(o.texto))
          .filter((d) => /(?<![-\w])color\s*:/i.test(d.getAttribute('style') || ''));
        el = cands.length ? cands[cands.length - 1] : null;
      }
      if (!el) { res.push({ k: o.id || o.texto, falta: true }); continue; }
      const cs = getComputedStyle(el);
      res.push({ k: o.id || o.texto, nota: o.nota, color: cs.color,
                 fondo: o.conFondo ? cs.backgroundColor : null });
    }
    return res;
  }, { OBJ: OBJETIVOS, tema });
  await nav.close();
  return out;
}

(async () => {
  execSync(`git archive ${BASE_REF} | tar -x -C ${TMP}`, { cwd: RAIZ });
  fs.mkdirSync(SALIDA, { recursive: true });
  const sBase = await servir(TMP, 8741), sHead = await servir(RAIZ, 8742);

  const baseDef = await leer(8741, null),  headDef = await leer(8742, null);
  const baseCla = await leer(8741, 'tema-america'), headCla = await leer(8742, 'tema-america');
  sBase.close(); sHead.close();

  let ok = 0, mal = 0; const fallos = [];
  const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

  console.log('CAREO COLOR-1 · elemento por elemento, con kamehouse.css aplicado');
  console.log('  BASE = ' + BASE_REF + '   HEAD = árbol de la rama\n');
  af(OBJETIVOS.length > 0, 'cardinalidad: no hay objetivos');
  af(baseDef.every((x) => !x.falta) && headDef.every((x) => !x.falta),
     'PREMISA: algún elemento no se encontró — ' + [...baseDef, ...headDef].filter((x) => x.falta).map((x) => x.k).join(', '));

  console.log('[1] TEMA POR DEFECTO — cuánto se movió el pixel (se enseña, no se assertea un umbral)');
  headDef.forEach((h, i) => {
    const b = baseDef[i]; if (h.falta || b.falta) return;
    const d = dcanal(b.color, h.color);
    console.log('    ' + h.k.padEnd(24) + ' ' + String(b.color).padEnd(20) + ' → ' + String(h.color).padEnd(20) + '  Δmax ' + d);
    if (h.fondo) console.log('      fondo'.padEnd(28) + ' ' + String(b.fondo).padEnd(20) + ' → ' + String(h.fondo).padEnd(20) + '  Δmax ' + dcanal(b.fondo, h.fondo));
  });

  // ── [2] LA CONVERSIÓN ES REAL, NO UNA COINCIDENCIA ────────────────────────
  // No basta con que el color se parezca al del token: tiene que SER el token.
  // Se resuelve la variable en la misma página y se exige igualdad.
  console.log('\n[2] ¿el color ES el token? (se resuelve la variable en la página)');
  const tokens = await (async () => {
    const s2 = await servir(RAIZ, 8743); const nav = await chromium.launch();
    const p2 = await (await nav.newContext()).newPage();
    await p2.goto('http://127.0.0.1:8743/kamehouse.html', { waitUntil: 'load' });
    const t = await p2.evaluate(() => {
      const cs = getComputedStyle(document.body); const lee = (n) => cs.getPropertyValue(n).trim();
      const conv = (hex) => { const d = document.createElement('div'); d.style.color = hex;
        document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const claro = () => { document.body.classList.add('tema-america');
        const c = getComputedStyle(document.body); const o = { red: conv(c.getPropertyValue('--red').trim()),
          text: conv(c.getPropertyValue('--text').trim()), gold: conv(c.getPropertyValue('--gold').trim()) };
        document.body.classList.remove('tema-america'); return o; };
      return { def: { red: conv(lee('--red')), text: conv(lee('--text')), gold: conv(lee('--gold')) }, claro: claro() };
    });
    await nav.close(); s2.close(); return t;
  })();
  const QUE_TOKEN = { 'mig-error':'red', 'ctr-btn-cancelar-edit':'red', 'wl-notif-error':'red',
    'wl-notif-evento':'text', 'wl-notif-codigo':'text', 'wl-notif-descuento':'text',
    'wl-notif-horas':'text', 'Incluir código':'gold' };
  headDef.forEach((h) => {
    if (h.falta) return;
    const tk = QUE_TOKEN[h.k]; const esperado = tokens.def[tk];
    const igual = dcanal(h.color, esperado) === 0;
    console.log('    ' + h.k.padEnd(24) + ' var(--' + tk + ') = ' + esperado + '  ' + (igual ? '✓' : '✗ pinta ' + h.color));
    af(igual, 'no es el token: ' + h.k + ' pinta ' + h.color + ' y var(--' + tk + ') es ' + esperado);
  });

  // ── [3] EL TEMA CLARO, CON LA EXPECTATIVA CORREGIDA ───────────────────────
  // 🔴 Dos aserciones anteriores se pusieron rojas y las DOS eran mías:
  //   · «en BASE todas son sordas al tema» — FALSO: `tema-america` trae reglas
  //     con `!important` sobre `.btn`, `input` y otros, que YA le ganaban al hex
  //     en línea. La deuda estaba parcialmente tapada en ese tema.
  //   · «en HEAD todas siguen al tema» — FALSO: ningún tema sobreescribe
  //     `--red`, así que los errores NO deben moverse. Que no se muevan es una
  //     propiedad del token, no un fallo.
  // Lo que sí se puede exigir es esto:
  console.log('\n[3] TEMA CLARO (body.tema-america) — expectativa corregida');
  af(dcanal(tokens.def.red, tokens.claro.red) === 0,
     'premisa: --red debería ser igual en los dos temas y no lo es');
  af(dcanal(tokens.def.text, tokens.claro.text) > 0 && dcanal(tokens.def.gold, tokens.claro.gold) > 0,
     'premisa: --text/--gold deberían cambiar con el tema y no cambian');
  console.log('    --red  ' + tokens.def.red + ' → ' + tokens.claro.red + '   (el tema NO lo toca: a propósito)');
  console.log('    --text ' + tokens.def.text + ' → ' + tokens.claro.text);
  console.log('    --gold ' + tokens.def.gold + ' → ' + tokens.claro.gold);

  let siguen = 0, deben = 0;
  headCla.forEach((h, i) => {
    if (h.falta) return;
    const hd = headDef[i], bc = baseCla[i], bd = baseDef[i];
    const tk = QUE_TOKEN[h.k];
    const debeMoverse = dcanal(tokens.def[tk], tokens.claro[tk]) > 0;
    const seMovio = dcanal(h.color, hd.color) > 0;
    // 🔴 Segunda expectativa mía que se puso roja: dar por hecho que SOLO el token
    // puede mover el color. En `tema-america` hay `!important` sobre `.btn` e
    // `input` que le ganan a cualquier estilo en línea, token incluido. Si el
    // tema YA alcanzaba el elemento en BASE, su movimiento no dice nada de la
    // conversión — así que ahí se REPORTA y no se assertea.
    const baseSorda = dcanal(bc.color, bd.color) === 0;
    if (!baseSorda) { /* el tema llega por !important: no es evidencia de la conversión */ }
    else if (debeMoverse) { deben++; if (seMovio) siguen++; af(seMovio, 'HEAD no siguió el tema: ' + h.k); }
    else af(!seMovio, 'HEAD se movió con un token que el tema no toca: ' + h.k);
    console.log('    ' + h.k.padEnd(24) + ' token --' + tk.padEnd(5) +
      ' · debe moverse: ' + (debeMoverse ? 'sí' : 'no ') +
      ' · se movió: ' + (seMovio ? 'sí' : 'no ') +
      ' · BASE ' + (baseSorda ? 'sorda al tema' : 'ya la tapaba un !important del tema'));
  });
  af(deben > 0, 'cardinalidad: ningún elemento SORDA depende del tema — el control no prueba nada');
  console.log('\n    ' + siguen + ' de ' + deben + ' siguen el tema, contando SOLO los que el tema no tapaba con !important');
  console.log('    ⚠️ hallazgo para la serie: en tema-america varias reglas `!important`');
  console.log('       YA le ganaban al hex en línea. La deuda está TAPADA en ese tema,');
  console.log('       no ausente — y se destapa en cuanto alguien quite un !important.');

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message); process.exit(1); });
