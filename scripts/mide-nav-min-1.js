#!/usr/bin/env node
// [NAV-MIN-1 · 20-oct-2026] Palabra de Memo: «tenerlo más minimalista». El grupo
// «Inventario & Ventas» se disolvió: Gastos/Ingresos/Saldos son UNA entrada
// («Dinero») y Reportes vive dentro de la Torre de Karin. Este careo lee el
// ÁRBOL DE TRABAJO a propósito (vigilante vivo de una forma, no un diff entre
// commits): su candado central es el INVARIANTE DE PERMISOS que hace segura la
// sub-barra — si un rol futuro recibe una página hermana sin las demás, la
// sub-barra le pintaría botones a pantallas que el candado de showPage rechaza.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
const js = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
const css = fs.readFileSync(path.join(RAIZ, 'kamehouse.css'), 'utf8');

let ok = 0, ko = 0;
const af = (c, m) => { if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

console.log('[A] el menú');
af(!/id="nav-ingresos"|id="nav-saldos"|id="nav-reportes"/.test(html), 'nav-ingresos/saldos/reportes ya no tienen botón');
af(/id="nav-gastos"><svg[^>]*><use[^>]*><\/svg><span>Dinero<\/span>/.test(html.replace(/\n/g, '')), 'nav-gastos dice «Dinero»');
af(/id="nav-inventario"/.test(html), 'la Torre de Karin conserva su botón');
af(!/Inventario &amp; Ventas/.test(html), 'el grupo «Inventario & Ventas» murió');

console.log('[B] las sub-barras (cada página hermana lleva la suya, con su activo)');
const pagina = (id) => { const i = html.indexOf(`id="page-${id}"`); return html.slice(i, i + 900); };
const activa = (id, txt) => new RegExp('kh-subnav-btn active">[^<]*' + txt).test(pagina(id));
af(activa('gastos', 'Gastos') && pagina('gastos').includes("showPage('ingresos')") && pagina('gastos').includes("showPage('saldos')"), 'Gastos: activo + botones a Ingresos y Saldos');
af(activa('ingresos', 'Ingresos') && pagina('ingresos').includes("showPage('gastos')"), 'Ingresos: activo + botón a Gastos');
af(activa('saldos', 'Saldos') && pagina('saldos').includes("showPage('ingresos')"), 'Saldos: activo + botón a Ingresos');
af(activa('inventario', 'Bodega') && pagina('inventario').includes("showPage('reportes')"), 'Torre: activo Bodega + botón a Reportes');
af(activa('reportes', 'Reportes') && pagina('reportes').includes("showPage('inventario')"), 'Reportes: activo + botón a Bodega');
af((css.match(/\.kh-subnav-btn\{/g) || []).length === 1, 'el estilo .kh-subnav-btn existe UNA vez en kamehouse.css');

console.log('[C] el resaltado del menú para páginas sin botón');
af(/NAV_ALIAS = \{ ingresos: 'gastos', saldos: 'gastos', reportes: 'inventario' \}/.test(js), 'NAV_ALIAS vive en showPage');

console.log('[D] EL INVARIANTE: quien ve una hermana ve a TODAS (evaluado, no leído con regex)');
let PERMISOS_TABS = null;
try {
  const i = js.indexOf('const PERMISOS_TABS = {');
  const fin = js.indexOf('\n};', i);
  PERMISOS_TABS = vm.runInNewContext('(' + js.slice(i + 'const PERMISOS_TABS = '.length, fin + 2) + ')');
} catch (e) { /* af abajo lo dice */ }
af(PERMISOS_TABS && Object.keys(PERMISOS_TABS).length >= 5, 'PERMISOS_TABS se pudo evaluar (' + (PERMISOS_TABS ? Object.keys(PERMISOS_TABS).length : 0) + ' roles)');
if (PERMISOS_TABS) {
  const DINERO = ['gastos', 'ingresos', 'saldos'];
  const malos1 = Object.entries(PERMISOS_TABS).filter(([, t]) => DINERO.some((x) => t.includes(x)) && !DINERO.every((x) => t.includes(x))).map(([r]) => r);
  af(malos1.length === 0, 'Dinero: todo rol con una de gastos/ingresos/saldos tiene las TRES' + (malos1.length ? ' — VIOLAN: ' + malos1.join(',') : ''));
  const malos2 = Object.entries(PERMISOS_TABS).filter(([, t]) => t.includes('inventario') && !t.includes('reportes')).map(([r]) => r);
  af(malos2.length === 0, 'Torre: todo rol con inventario tiene reportes' + (malos2.length ? ' — VIOLAN: ' + malos2.join(',') : ''));
  // Y el espejo: reportes sin inventario dejaría la página con una sub-barra
  // cuyo botón «Bodega» rebota. Hoy nadie; si un rol futuro lo necesita, la
  // sub-barra de reportes tiene que aprender a esconder ese botón.
  const malos3 = Object.entries(PERMISOS_TABS).filter(([, t]) => t.includes('reportes') && !t.includes('inventario')).map(([r]) => r);
  af(malos3.length === 0, 'y reportes sin inventario tampoco existe' + (malos3.length ? ' — VIOLAN: ' + malos3.join(',') : ''));
}

console.log('[E] control positivo del instrumento');
af(!activa('gastos', 'Ingresos'), 'el detector de activo distingue (Gastos no marca Ingresos)');

console.log((ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
process.exit(ko ? 1 : 0);
