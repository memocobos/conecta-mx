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
af(/NAV_ALIAS = \{ ingresos: 'gastos', saldos: 'gastos', reportes: 'inventario', montana: 'equipo' \}/.test(js), 'NAV_ALIAS vive en showPage con sus cuatro alias');

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

console.log('[F] NAV-MIN-2: el orden de Eventos, Kaio-sama en Herramientas, Equipo disuelto, el renombre');
const nav = html.slice(html.indexOf('id="kh-sidebar"'), html.indexOf('</nav>'));
const ordenEv = ['nav-esferas', 'nav-kamisama', 'nav-baba', 'nav-radar', 'nav-nube', 'nav-yamcha'].map((id) => nav.indexOf(`id="${id}"`));
af(ordenEv.every((x) => x > -1) && ordenEv.every((x, i) => i === 0 || x > ordenEv[i - 1]), 'Eventos en el orden de Memo: Esferas · Palacio · Baba · Radar · Nube · Yamcha');
const dd = nav.slice(nav.indexOf('nav-dropdown-herramientas'));
af(dd.includes(`id="nav-radio" onclick="showHerramienta('radio')"`), 'Kaio-sama vive en Herramientas (showHerramienta)');
af(!/nav-btn" onclick="showPage\('radio'\)/.test(nav), 'y ya no tiene botón de página');
// Comentarios fuera ANTES de la aserción de ausencia: el ⚰️ de loadPage
// NOMBRA la línea que se fue (la ley de «un arnés que lee comentarios»).
const jsVivo = js.replace(/\/\/[^\n]*/g, '');
af(/if \(name === 'radio'\) \{\s*loadRadio\(\);/.test(jsVivo) && !/if \(name === 'radio'\) loadRadio/.test(jsVivo), 'la carga de la radio vive en showHerramienta y NO en loadPage (una puerta)');
af(!/nav-group-title[^>]*>Equipo</.test(nav), 'el grupo «Equipo» murió');
af(!/id="nav-montana"/.test(nav), 'Montaña Pai (permisos del equipo) ya no tiene botón propio');
af(nav.indexOf('id="nav-equipo"') > -1 && nav.indexOf('id="nav-equipo"') < nav.indexOf('nav-group-title" onclick="toggleNavGroup(this)">Eventos'), 'Guerreros Z vive en Operación (antes del grupo Eventos)');
af(/id="nav-resumen"><svg[^>]*><use href="#ic-montana"[^>]*><\/svg><span>Montaña Pai<\/span>/.test(nav.replace(/\n/g, '')), 'el Resumen se llama «Montaña Pai» en el menú');
af(pagina('resumen').includes('MONTAÑA PAI'), 'y en su título de página');
af(pagina('montana').includes('PANEL DE CONTROL'), 'la pantalla vieja de Montaña Pai ahora es «PANEL DE CONTROL» (sin nombres duplicados)');
af(activa('equipo', 'Guerreros Z') && pagina('equipo').includes("showPage('montana')") && pagina('equipo').includes('id="equipo-subnav"') && pagina('equipo').includes('display:none'), 'Guerreros Z trae su sub-barra, NACE oculta (la enciende el permiso)');
const apu = fs.readFileSync(path.join(RAIZ, 'kamehouse-montana.js'), 'utf8');
af(/equipo-subnav'\)/.test(apu) && /_puedeVerTab\('montana'\)/.test(apu), 'aplicarPermisosUI la enciende solo con el permiso montana');
af(activa('montana', 'Panel de control') && pagina('montana').includes("showPage('equipo')"), 'el Panel de control trae su sub-barra de regreso');
af(/montana: 'equipo'/.test(js), 'NAV_ALIAS resalta Guerreros Z al abrir el Panel');

console.log('[E] control positivo del instrumento');
af(!activa('gastos', 'Ingresos'), 'el detector de activo distingue (Gastos no marca Ingresos)');

console.log((ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
process.exit(ko ? 1 : 0);
