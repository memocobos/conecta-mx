#!/usr/bin/env node
// [MONT-MIN-1 · 22-oct-2026] SECCIONES MINIMIZABLES DE MONTAÑA PAI.
// Palabra de Memo: minimizar cada desplegado · que la configuración se quede ·
// alerta en la esquina del minimizado con cosas por revisar.
// ⚠️ SIN ANCLA a propósito (árbol de trabajo). La pantalla se verificó además
// en NAVEGADOR REAL (Chrome de Memo) inyectando el módulo sobre producción —
// este arnés guarda la mecánica y los candados que el navegador no vigila.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0, ko = 0;
const af = (c, m) => { try { c = typeof c === 'function' ? c() : c; } catch (e) { c = false; m += ' · EXC: ' + e.message; } if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

const RAIZ = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(RAIZ, 'kamehouse-resumen.js'), 'utf8');
const css = fs.readFileSync(path.join(RAIZ, 'kamehouse.css'), 'utf8');

console.log('[A] la mecánica, por el código REAL (vm con DOM mínimo)');
// El init se rinde sin #page-resumen (otra página): document mínimo basta para
// medir el estado y el toggle, que es lo que el navegador no puede garantizar solo.
const almacen = {};
const ctx = {
  window: {}, console,
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ classList: { add() {}, toggle() {} }, dataset: {} }) },
  localStorage: { getItem: (k) => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); }, removeItem: (k) => { delete almacen[k]; } },
  MutationObserver: class { observe() {} disconnect() {} },
  navigator: {}, location: { href: '' }, setTimeout, clearTimeout,
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(js, ctx, { filename: 'kamehouse-resumen.js' });
af(typeof ctx.mtMinToggle === 'function' && typeof ctx._mtMinInit === 'function', 'el módulo carga y expone mtMinToggle/_mtMinInit');
ctx.mtMinToggle('ganancia');
af(JSON.parse(almacen.kh_mtmin_v1 || '[]').includes('ganancia'), 'minimizar GUARDA en localStorage (kh_mtmin_v1): la configuración se queda');
ctx.mtMinToggle('logistica');
af(JSON.parse(almacen.kh_mtmin_v1).length === 2, 'dos secciones minimizadas conviven en el mismo estado');
ctx.mtMinToggle('ganancia');
af(!JSON.parse(almacen.kh_mtmin_v1).includes('ganancia') && JSON.parse(almacen.kh_mtmin_v1).includes('logistica'), 'expandir quita SOLO la suya — el toggle es por sección');
almacen.kh_mtmin_v1 = '{{roto';
af(ctx._mtMinEstado && [...ctx._mtMinEstado()].length === 0, 'un estado guardado ILEGIBLE cae a vacío sin tronar (el Resumen nunca muere por esto)');

console.log('[B] el censo de secciones');
// ⚠️ Un const de nivel superior NO se cuelga del contexto del vm (la lección
// de PUNTOS-AUTO): se le pregunta EVALUANDO en el mismo contexto.
const secs = vm.runInContext('_MTMIN_SECS', ctx) || [];
const ids = secs.map((s) => s.id);
for (const q of ['logistica', 'alertas', 'conexiones', 'tres', 'dinero', 'atajos', 'metricas', 'ganancia', 'radar', 'riesgo', 'cobrar21']) {
  af(ids.includes(q), `sección «${q}» existe`);
}
af(secs.every((s) => s.titulo && s.sel), 'todas traen título y selector (la barra minimizada no puede quedar muda)');
af((secs.find((s) => s.id === 'riesgo') || {}).badgeSel === '#riesgo-baja-lista', 'riesgo lee su globo del elemento del DATO, no del card');
af((secs.find((s) => s.id === 'cobrar21') || {}).cerca === '.card', 'cobrar21 envuelve el CARD completo (el título vive ahí)');

console.log('[C] el candado del CSS: la clase le GANA al style en línea de los renderers');
af(/\.mt-sec\.min>\*:not\(\.mt-bar\)\{display:none!important\}/.test(css.replace(/\s+/g, '')), 'minimizado esconde todo salvo la barra CON !important — re-pintar no destapa');
af(/\.mt-sec\.mt-oculta\{display:none!important\}/.test(css.replace(/\s+/g, '')), 'sección escondida por el renderer no deja barra ni botón (la ley del hueco de milk)');
af(/\.mt-bar-badge\.rojo/.test(css), 'el globo tiene su cara ROJA para urgentes');

console.log('[D] los renderers DECLARAN su «por revisar» (el globo no se inventa)');
const nBadge = (js.match(/dataset\.mtBadge = /g) || []).length;
af(nBadge >= 6, `data-mt-badge se declara en ${nBadge} sitios (alertas, logística ×2, atrasados, riesgo, cobranza)`);
af((js.match(/dataset\.mtRojo = /g) || []).length >= 3, 'y el nivel rojo viaja aparte (urgentes de logística, riesgo de baja, error)');
af(/attributeFilter: \['style', 'data-mt-badge', 'data-mt-rojo'\]/.test(js), 'el observer vigila estilo Y dato — el globo se refresca cuando el renderer re-pinta');
af(!/\.innerHTML\s*=/.test(js.slice(js.indexOf('_MTMIN_LS'))) || !/_t\.innerHTML|_b\.innerHTML/.test(js.slice(js.indexOf('_MTMIN_LS'))), 'el sync jamás escribe en lo observado: no puede ciclarse');

console.log((ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
process.exit(ko ? 1 : 0);
