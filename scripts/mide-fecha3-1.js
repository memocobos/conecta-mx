#!/usr/bin/env node
// =============================================================================
// mide:fecha3-1 — FECHA3-1 (27-oct-2026). Reporte real de una clienta en
// Android: en «Completa tu perfil» la fecha de nacimiento se quedaba en
// «dd/mm/aaaa» sin teclado ni calendario, y «la foto tampoco se guarda».
//   [A] el perfil y el contrato ya no usan <input type="date">: tres listas.
//   [B] _fecha3Leer / _fecha3Poner / _fecha3Html reales, rebanados y corridos
//       en vm: vacío, incompleta, día que no existe, bisiesto, ida y vuelta.
//   [C] la foto de quien todavía NO tiene perfil ya no se tira en silencio:
//       queda pendiente y se sube al guardar el perfil.
//   [D] el respaldo de decodificación ya no usa blob: (el CSP no lo permite).
// SIN ancla — lee el árbol de trabajo (como mide:portal-solo-1): sus controles
// son positivos por construcción (casos que TIENEN que fallar).
// =============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
let ok = 0, mal = 0;
function af(cond, msg) {
  let v; try { v = typeof cond === 'function' ? cond() : cond; } catch (e) { v = false; msg += ' (truena: ' + e.message + ')'; }
  if (v) { ok++; console.log('  ✓ ' + msg); } else { mal++; console.log('  ✗ ' + msg); }
}
const sinComentarios = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
function rebanar(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('no encontré ' + firma);
  let j = src.indexOf('{', i), n = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') n++; else if (src[k] === '}') { n--; if (!n) return src.slice(i, k + 1); } }
  throw new Error('sin cierre ' + firma);
}

console.log('[A] el perfil y el contrato piden la fecha en tres listas');
// Solo comentarios HTML: el quitador de /* */ se come el archivo desde
// `accept="image/*,…"` (un «/*» que NO abre comentario) — cazado en la 1ª corrida.
const limpio = html.replace(/<!--[\s\S]*?-->/g, '');
af(!/id="p-nacimiento"[^>]*type="date"/.test(limpio), 'el perfil ya no trae <input type="date"> en p-nacimiento');
af(/id="p-nacimiento"[^>]*type="hidden"/.test(limpio), 'p-nacimiento es el oculto que guarda el valor');
af(/id="p-nac-3"/.test(limpio), 'existe el contenedor de las tres listas del perfil');
af(!/data-ctr="fecha" type="date"/.test(limpio), 'el contrato ya no trae <input type="date">');
af(/data-ctr="fecha3"/.test(limpio) && /_fecha3Leer\(box\.querySelector\('\[data-ctr="fecha3"\]'\)\)/.test(limpio), '_ctrFecha lee las tres listas del contrato');
af(/\.fecha3\{display:grid/.test(html), 'el CSS pone las tres listas en una fila');

console.log('[B] las funciones reales, en vm');
const src = rebanar(html, 'function _f3dos(') + '\n' + rebanar(html, 'function _fecha3Html(') + '\n'
  + rebanar(html, 'function _fecha3Leer(') + '\n' + rebanar(html, 'function _fecha3Poner(');
const mesesLinea = (html.match(/const _F3_MESES = \[[^\]]+\];/) || [])[0];
af(!!mesesLinea, 'los meses viven en una sola constante');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(mesesLinea.replace('const ', 'var ') + '\n' + src + '\nthis.F={_fecha3Html,_fecha3Leer,_fecha3Poner};', ctx);
const F = ctx.F;
// DOM falso mínimo: un contenedor con tres selects por data-f3.
function caja(d, m, a) {
  const s = { d: { value: d }, m: { value: m }, a: { value: a } };
  return { s, querySelector: (q) => { const k = (q.match(/data-f3="(\w)"/) || [])[1]; return s[k] || null; } };
}
af(F._fecha3Leer(caja('', '', '')) === '', 'nada elegido → «» (vacío, no inválido)');
af(F._fecha3Leer(caja('05', '', '1999')) === null, 'falta el mes → null (incompleta)');
af(F._fecha3Leer(caja('31', '02', '2001')) === null, '31 de febrero → null (no existe)');
af(F._fecha3Leer(caja('29', '02', '2001')) === null, '29-feb de año NO bisiesto → null');
af(F._fecha3Leer(caja('29', '02', '2004')) === '2004-02-29', '29-feb de 2004 (bisiesto) → vale');
af(F._fecha3Leer(caja('07', '11', '1998')) === '1998-11-07', '7-nov-1998 → «1998-11-07»');
const c = caja('', '', '');
F._fecha3Poner(c, '2003-04-09');
af(c.s.d.value === '09' && c.s.m.value === '04' && c.s.a.value === '2003', 'poner «2003-04-09» llena día/mes/año');
af(F._fecha3Leer(c) === '2003-04-09', 'ida y vuelta: lo que se pone es lo que se lee');
F._fecha3Poner(c, '');
af(c.s.d.value === '' && c.s.m.value === '' && c.s.a.value === '', 'poner «» las deja vacías (perfil nuevo)');
const h = F._fecha3Html();
af((h.match(/<select/g) || []).length === 3, 'el html trae exactamente tres <select>');
af(/<option value="">Día<\/option>/.test(h) && /<option value="">Mes<\/option>/.test(h) && /<option value="">Año<\/option>/.test(h), 'las tres nacen en vacío (DEFAULTS-1)');
af(!/selected/.test(h), 'ninguna opción viene preseleccionada');
af((h.match(/data-f3="d"[\s\S]*?<\/select>/)[0].match(/<option/g) || []).length === 32, 'día: vacío + 31');
af(new RegExp('<option value="' + new Date().getFullYear() + '">').test(h) && /<option value="1925">/.test(h), 'año: de este año a 1925');

console.log('[C] la foto de un perfil nuevo ya no se tira');
const sub = rebanar(html, 'async function subirAvatar(');
af(!/if \(!perfilExistente \|\| !file\) return;/.test(sub), 'subirAvatar ya no regresa en silencio sin perfil');
af(/_avatarPendiente = await _avatarToBlob\(file\)/.test(sub), 'sin perfil, la foto queda PENDIENTE');
af(/se guarda cuando termines tu perfil/.test(sub), 'y se le DICE a la clienta');
const guardar = html.slice(html.indexOf("$('#form-profile').addEventListener('submit'"));
const tras = guardar.slice(guardar.indexOf('perfilExistente = resp.data;'), guardar.indexOf("showView('dashboard')"));
af(/_avatarPendiente/.test(tras) && /_avatarSubirBlob\(b/.test(tras), 'al guardar el perfil se sube la foto pendiente');
af(/async function _avatarSubirBlob\(blob, alertEl\)/.test(html), 'la subida tiene UN dueño (_avatarSubirBlob)');

console.log('[D] el respaldo de decodificación no usa blob:');
const dec = rebanar(html, 'async function _avatarToBlob(');
af(!/createObjectURL/.test(sinComentarios(dec)), '_avatarToBlob ya no arma un blob: (el CSP lo bloquea)');
af(/readAsDataURL/.test(dec), 'lee por FileReader → data:');

// [E] PS-EVENTOS-1 — el selector «cargando eventos…» que no se llenaba nunca.
// Medido en los logs de Netlify: el servidor contestó 200 a la clienta (27-oct
// 02:09 UTC) y aun así su pantalla siguió en «cargando». El panel se repinta
// mientras el pedido vuela: se llenaba el <select> VIEJO (ya fuera del DOM) y
// la bandera «ya cargué» dejaba el nuevo mudo para siempre.
(async () => {
  console.log('[E] el selector de eventos se llena aunque el panel se repinte');
  const srcE = 'let _psEventosLista = null, _psEventosPromesa = null;\n'
    + rebanar(html, 'function _psPintarEventos(') + '\n' + rebanar(html, 'async function _psPedirEventos(') + '\n'
    + rebanar(html, 'async function _psCargarEventos(');
  const mkSel = () => ({ innerHTML: '<option value="">— cargando eventos… —</option>', get options() { return { length: (this.innerHTML.match(/<option/g) || []).length }; } });
  let actual = mkSel();
  let pedidos = 0, falla = false;
  const ctxE = {
    escapeHtml: (s) => String(s), setTimeout, clearTimeout, AbortController,
    document: { getElementById: (id) => (id === 'ps-evento' ? actual : null) },
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'x' } } }) } },
    fetch: async () => { pedidos++; await new Promise((r) => setTimeout(r, 30));
      if (falla) return { json: async () => ({ ok: false, error: 'caído' }) };
      return { json: async () => ({ ok: true, eventos: [{ id: 'karolg#1', nombre: 'Karol G', fecha: '7 nov' }] }) }; },
  };
  vm.createContext(ctxE);
  vm.runInContext(srcE + '\nthis.F={_psCargarEventos};', ctxE);
  // Falla primero: dice que no pudo y NO se queda en «cargando».
  falla = true;
  await ctxE.F._psCargarEventos();
  af(/No pude cargar/.test(actual.innerHTML), 'si el servidor falla, el selector LO DICE (no se queda en «cargando»)');
  // Reintento (ya sano) con repintado A MEDIO VUELO: el select nuevo se llena.
  falla = false;
  const p = ctxE.F._psCargarEventos();
  const viejo = actual; actual = mkSel(); // el panel se repinta mientras vuela el pedido
  await p;
  af(/Karol G/.test(actual.innerHTML), 'el select NUEVO (repintado a medio vuelo) se llena con los eventos');
  af(pedidos === 2, 'tras una falla se vuelve a pedir (2 pedidos, no se queda con la promesa rota)');
  // Otro repintado después: se llena de la lista guardada, sin pedir otra vez.
  actual = mkSel();
  await ctxE.F._psCargarEventos();
  af(/Karol G/.test(actual.innerHTML) && pedidos === 2, 'un repintado posterior se llena de la lista guardada sin otro pedido');
  af(!/_psEventosOk/.test(html.replace(/\/\/[^\n]*/g, '')), 'la bandera vieja «_psEventosOk» ya no existe en el código');
  void viejo;
  fin();
})().catch((e) => { mal++; console.log('  ✗ [E] truena: ' + e.message); fin(); });

function fin() {
console.log('\n' + (mal ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde · ' + mal + ' en rojo');
process.exit(mal || !ok ? 1 : 0);
}
