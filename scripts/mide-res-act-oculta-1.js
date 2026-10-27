#!/usr/bin/env node
/* ===========================================================================
 * mide-res-act-oculta-1 — RES-ACT-OCULTA-1 (27-oct-2026)
 * Palabra de Memo: en Montaña Pai, tras «Actualizar» → «Sí, guardar», al
 * cambiar de pestaña y volver la lista de lo guardado seguía ahí; «una vez que
 * la guarde ya no quiero verla».
 *   [A] tras guardar: el panel queda marcado `hecho` y trae botón ✕ Ocultar.
 *   [B] volver a entrar (loadPage('resumen')) lo vacía y lo esconde.
 *   [C] una VISTA PREVIA sin guardar NO se borra al volver (aún falta el clic).
 *   [D] el ✕ esconde a mano.
 * ⚠️ SIN ANCLA (árbol de trabajo).
 * ========================================================================= */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };
const cortar = (src, n) => { const i = src.indexOf('function ' + n + '('); if (i < 0) throw new Error('no está ' + n); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } };
const res = fs.readFileSync(path.join(RAIZ, 'kamehouse-resumen.js'), 'utf8');
const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');

const panel = { innerHTML: '', style: { display: 'none' }, dataset: {} };
const llamadas = [];
const ctx = {
  document: { getElementById: (id) => (id === 'resumen-actualizar-panel' ? panel : null) },
  _evtEsc: (s) => String(s), _evtMxn: (n) => '$' + n,
  khExcelRecorrer: async () => ({ eventos: [], total: 0 }),
  _resumenActualizarAgrupar: () => ({ lugares: [{ nombre: 'Ana', tour: 'x', pagado: 300 }], abonos: [], boletos: [], fuera: [], bajas: [], negativas: [], saltados: [], errores: [], monto: 0 }),
  loadResumen: () => llamadas.push('loadResumen'),
};
['loadInicio','loadRequisiciones','loadPagos','_evtPoblarSelector','loadGastos'].forEach((f) => { ctx[f] = () => {}; });
vm.createContext(ctx);
vm.runInContext('var _resumenActCorriendo = false;' + cortar(res, '_resumenActRecorrer') +cortar(res, 'resumenActualizarOcultar') + cortar(res, '_resumenActualizarHtml') +
  'async ' + cortar(res, 'resumenActualizar') + 'async ' + cortar(res, 'resumenActualizarConfirmar') + cortar(kh, 'loadPage'), ctx);

(async () => {
  console.log('══ mide:res-act-oculta-1 ══');
  await vm.runInContext('resumenActualizar()', ctx);
  af(panel.style.display === '' && /todavía no se ha guardado/.test(panel.innerHTML) && panel.dataset.hecho !== '1', '[prev] Actualizar pinta la vista previa sin marcar hecho');
  vm.runInContext("loadPage('resumen')", ctx);
  af(/todavía no se ha guardado/.test(panel.innerHTML) && panel.style.display === '', '[C] volver con vista previa SIN guardar: se queda');

  await vm.runInContext('resumenActualizarConfirmar()', ctx);
  af(panel.dataset.hecho === '1' && /listo/.test(panel.innerHTML) && /resumenActualizarOcultar\(true\)/.test(panel.innerHTML), '[A] tras guardar: «listo», marcado hecho y con ✕ Ocultar');
  af(llamadas.includes('loadResumen') && /Ana/.test(panel.innerHTML), '[A] el recargo inmediato NO borra el «listo» (se lee al momento)');
  vm.runInContext("loadPage('resumen')", ctx);
  af(panel.innerHTML === '' && panel.style.display === 'none' && panel.dataset.hecho === undefined, '[B] al volver a Montaña Pai lo guardado desaparece');

  await vm.runInContext('resumenActualizar()', ctx);
  await vm.runInContext('resumenActualizarConfirmar()', ctx);
  vm.runInContext('resumenActualizarOcultar(true)', ctx);
  af(panel.innerHTML === '' && panel.style.display === 'none', '[D] el ✕ lo esconde a mano');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();
