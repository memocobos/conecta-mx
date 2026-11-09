#!/usr/bin/env node
/* mide-legal-1 — LEGAL-1 (9-nov-2026)
 * Las dos páginas públicas que Google Auth Platform exige para publicar el
 * login con Google del Portal: /privacidad y /terminos.
 *   [R] las rutas existen en _redirects ANTES del catchall /* (si no, caen al index)
 *   [T] las políticas de terminos.html dicen EXACTO lo que dice `var POLITICAS`
 *       del index (el texto de Memo) — si cambian allá y no aquí, rojo con nombre
 *   [P] privacidad nombra responsable, contacto, ARCO, INE y Google
 *   [C] control positivo: una política alterada SÍ se caza */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
const af = (c, m) => { if (c) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

console.log('[R] rutas');
const red = leer('_redirects').split('\n');
const iCatch = red.findIndex((l) => /^\/\*\s/.test(l));
for (const r of ['privacidad', 'terminos']) {
  const i = red.findIndex((l) => new RegExp('^/' + r + '\\s+/' + r + '\\.html\\s+200').test(l));
  af(i >= 0 && (iCatch < 0 || i < iCatch), '/' + r + ' → /' + r + '.html antes del catchall (línea ' + (i + 1) + ', catchall ' + (iCatch + 1) + ')');
  af(fs.existsSync(path.join(RAIZ, r + '.html')), r + '.html existe');
}

console.log('\n[T] términos = POLITICAS del index');
const IDX = leer('index.html');
const ini = IDX.indexOf('var POLITICAS = [');
const fin = IDX.indexOf('];', ini) + 2;
const ctx = {}; vm.createContext(ctx); vm.runInContext(IDX.slice(ini, fin).replace('var POLITICAS', 'this.POLITICAS'), ctx);
const txts = ctx.POLITICAS.flatMap((g) => g.items.map((it) => plano(it.txt)));
af(txts.length >= 8, 'POLITICAS trae ' + txts.length + ' renglones (premisa)');
const TER = plano(leer('terminos.html'));
const cubre = (t) => txts.every((x) => t.includes(x));
for (const x of txts) af(TER.includes(x), 'terminos dice: «' + x.slice(0, 60) + '…»');
af(!cubre(TER.replace('$350', '$300')), 'CONTROL POSITIVO: una política alterada ($350→$300) se caza');

console.log('\n[P] privacidad');
const PRI = plano(leer('privacidad.html'));
for (const k of ['Guillermo Alexander Cobos Vizcarra', 'Calle Toluca 125', 'reynosa@conectamexico.mx', 'ARCO', 'INE', 'Google', 'Mercado Pago', 'no recibimos ni guardamos'])
  af(PRI.includes(k), 'privacidad nombra «' + k + '»');
af(!/<script/i.test(leer('privacidad.html')) && !/<script/i.test(leer('terminos.html')), 'las dos páginas son estáticas (sin <script>)');

console.log('\n' + (R ? '🔴' : '✅') + ' mide:legal-1 · ' + V + ' en verde · ' + R + ' en rojo');
process.exit(R ? 1 : 0);
