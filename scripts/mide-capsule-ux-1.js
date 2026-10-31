#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// [CAPSULE-UX-1 · 29-oct-2026] Encontrar eventos y viajeros en Capsule Corp.
// Palabra de Memo: «es complicado encontrar los eventos, al entrar en eventos
// es complicado encontrar a los viajeros, saber qué boletos tienen, qué tipo
// de paquete, tal vez tener unos contadores extras por tipo de paquete y
// boletos y otro global».
//
// VIGILANTE VIVO del árbol de trabajo (como mide:cc-cards-1 y
// mide:capsule-comp-1): cero `git archive`, cero HEAD_SHA — mide lo que está
// escrito HOY. Por eso no trae control positivo por commit: sus controles son
// por construcción (casos sembrados que tienen que caer de un lado exacto).
//
// Las funciones NO se re-implementan aquí: se REBANAN de kamehouse.js por
// balance de llaves y se corren en vm — incluido khPaqueteTexto, el DUEÑO de
// la etiqueta del paquete (los de la preventa cuentan como «PREVENTA A
// CIEGAS», jamás como CHEAP).
// ═════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
const cap = fs.readFileSync(path.join(RAIZ, 'kamehouse-capsule.js'), 'utf8');
const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
const css = fs.readFileSync(path.join(RAIZ, 'kamehouse.css'), 'utf8');

let ok = 0, ko = 0;
const af = (c, m) => { if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };
const sinCom = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

// Rebana `function NOMBRE(...)` por balance de llaves (con el paréntesis en el
// ancla: «un prefijo no es un ancla»).
function fn(fuente, nombre) {
  const i = fuente.search(new RegExp('(async )?function ' + nombre + '\\('));
  if (i < 0) throw new Error('no existe function ' + nombre);
  let d = 0, ini = fuente.indexOf('{', i);
  for (let p = ini; p < fuente.length; p++) {
    const c = fuente[p];
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return fuente.slice(i, p + 1); }
  }
  throw new Error(nombre + ' sin cerrar');
}
// Rebana una declaración `const NOMBRE = ...;` de una línea.
function decl(fuente, nombre) {
  const m = fuente.match(new RegExp('(const|let) ' + nombre + ' = [^\\n]*'));
  if (!m) throw new Error('no existe la declaración ' + nombre);
  return m[0];
}

// ── [A] el RESUMEN (los contadores), con el dueño de la etiqueta de verdad ──
console.log('[A] _vjResumenDe · los contadores derivan de las filas, con el dueño de la etiqueta');
const sb = {};
vm.createContext(sb);
[decl(js, 'KH_PREVENTA_EVENTOS'), fn(js, 'khEsPreventaCiegas'), fn(js, 'khPaqueteTexto'),
 fn(js, '_esStaff'), decl(js, '_vjNorm'), fn(js, '_vjEsBaja'), fn(js, '_vjResumenDe'), fn(js, '_vjFiltraFilas')]
  .forEach((code) => vm.runInContext(code, sb));

// Fixture: nombres INVENTADOS (jamás datos de clientes reales). Cada fila
// existe para distinguir una implementación de otra:
const FILAS = [
  { id: 'a', nombre: 'María Pérez',   correo: 'maria@x.mx',  celular: '8991112233', tipo_paquete: 'plus',  zona_boleto: 'VIP',               boletos: 2, evento_id: 'frontera' },
  { id: 'b', nombre: 'Sofía López',   correo: 'sofia@x.mx',  celular: '8990000001', tipo_paquete: 'cheap', zona_boleto: 'General',           boletos: 1, evento_id: 'karolg#0' },
  { id: 'c', nombre: 'Pedro Niño',    correo: '',            celular: '8990000002', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', boletos: 1, evento_id: 'nsqkmty' },
  { id: 'd', nombre: 'Luisa Cantú',   correo: 'l@x.mx',      celular: '8990000003', tipo_paquete: 'cheap', zona_boleto: 'General',           boletos: 1, evento_id: 'palnorte#0' },
  { id: 'e', nombre: 'Coordi Prueba', correo: '',            celular: '',           tipo_paquete: 'plus',  zona_boleto: 'VIP',               boletos: 1, evento_id: 'frontera', tipo_viajero: 'coordinador' },
  { id: 'f', nombre: 'Baja Prueba',   correo: '',            celular: '',           tipo_paquete: 'cheap', zona_boleto: null,                boletos: 0, evento_id: 'frontera' },
  { id: 'g', nombre: 'Ride Gómez',    correo: '',            celular: '',           tipo_paquete: 'ride',  zona_boleto: null,                boletos: 1, evento_id: 'frontera', notas: 'paga en diciembre' },
];
const res = vm.runInContext('_vjResumenDe(' + JSON.stringify(FILAS) + ')', sb);
af(res.filas === 6, 'filas activas = 6 (la baja NO cuenta): ' + res.filas);
af(res.lugares === 7, 'lugares = 7 (2+1+1+1+1+1 — la baja no suma): ' + res.lugares);
af(res.bajas === 1, 'bajas = 1, contada APARTE: ' + res.bajas);
af(res.staff === 1, 'staff = 1: ' + res.staff);
// 🔒 El control del DUEÑO: la zona «Preventa a ciegas» (c) Y el evento de
// KH_PREVENTA_EVENTOS (d, palnorte) caen los DOS en PREVENTA A CIEGAS — y el
// CHEAP normal (b, karolg) se queda en CHEAP. Si alguien re-implementara la
// etiqueta con el tipo_paquete pelado, las tres caerían juntas en CHEAP.
af(res.paquetes['PREVENTA A CIEGAS'] && res.paquetes['PREVENTA A CIEGAS'].filas === 2,
   'los 2 de preventa cuentan como PREVENTA A CIEGAS (zona + lista, las DOS ramas del dueño): '
   + JSON.stringify(res.paquetes['PREVENTA A CIEGAS']));
af(res.paquetes.CHEAP && res.paquetes.CHEAP.filas === 1,
   'el CHEAP normal (karolg) se queda en CHEAP, no lo arrastra la preventa: ' + JSON.stringify(res.paquetes.CHEAP));
af(res.paquetes.PLUS && res.paquetes.PLUS.filas === 2 && res.paquetes.PLUS.lugares === 3,
   'PLUS: 2 filas · 3 lugares (la de 2 boletos pesa 2): ' + JSON.stringify(res.paquetes.PLUS));
af(res.paquetes.RIDE && res.paquetes.RIDE.filas === 1, 'RIDE: 1 fila (sin zona, 1 lugar)');
af(res.zonas.VIP === 3 && res.zonas.General === 2 && res.zonas['Preventa a ciegas'] === 1,
   'boletos por zona: VIP 3 · General 2 · Preventa 1 → ' + JSON.stringify(res.zonas));

// ── [B] el FILTRO: sin acentos, por todos los campos, y PURO ───────────────
console.log('[B] _vjFiltraFilas · texto sin acentos + chips, sin tocar el universo');
const filtra = (q, chip) => vm.runInContext('_vjFiltraFilas(' + JSON.stringify(FILAS) + ', ' + JSON.stringify(q) + ', ' + JSON.stringify(chip || null) + ')', sb);
af(filtra('sofia').length === 1 && filtra('sofia')[0].id === 'b',
   '«sofia» encuentra a Sofía (sin acentos) y SOLO a ella — 1 de 7, el control por construcción');
af(filtra('8991112233').length === 1 && filtra('8991112233')[0].id === 'a', 'por celular: 1 exacta');
af(filtra('preventa').length === 2, '«preventa» trae a los 2 de la preventa (zona y etiqueta del dueño): ' + filtra('preventa').length);
af(filtra('diciembre').length === 1 && filtra('diciembre')[0].id === 'g', 'por NOTA: la de «paga en diciembre»');
af(filtra('', 'PLUS').length === 2, 'chip PLUS: 2 filas (cliente + staff)');
af(filtra('', '__staff').length === 1 && filtra('', '__staff')[0].id === 'e', 'chip staff: solo el coordi');
af(filtra('', '__bajas').length === 1 && filtra('', '__bajas')[0].id === 'f', 'chip bajas: solo la baja');
af(filtra('maria', 'PLUS').length === 1 && filtra('maria', 'PLUS')[0].id === 'a', 'chip + texto se COMBINAN (1 exacta)');
af(filtra('zzz-no-existe').length === 0, 'sin coincidencias = 0 (y no revienta)');
af(FILAS.length === 7, 'el filtro es PURO: el universo sigue con sus 7 filas');

// ── [C] la pantalla: el repintado no cuesta una consulta ──────────────────
console.log('[C] _vj2Pintar / _vj2Cargar · filtrar no refetchea y el dinero es del universo');
const pintar = sinCom(fn(js, '_vj2Pintar'));
const cargar = sinCom(fn(js, '_vj2Cargar'));
af(/^function _vj2Pintar\(\)/.test(fn(js, '_vj2Pintar')), '_vj2Pintar es SÍNCRONA (pintar no espera a nadie)');
af(!/khViajeros\.|khAdminFetch|await /.test(pintar), '_vj2Pintar NO hace fetch: filtrar jamás cuesta una consulta');
// [CAPSULE-UX-2 · 30-oct-2026] Las firmas ganaron el mapa de contratos
// (_ctrMapa, para las alertas 📜/🪪): la aserción se actualiza a la verdad
// nueva — lo que vigila NO cambió: los chips siguen saliendo del UNIVERSO
// (_vj2Filas) y la tabla del filtro. No se silenció, se re-anchó la firma.
af(/_vjChipsPintar\(_vjResumenDe\(_vj2Filas, _ctrMapa\)\)/.test(pintar),
   'los chips se calculan del UNIVERSO (_vj2Filas), no de lo filtrado');
af(/_vjFiltraFilas\(_vj2Filas, _vj2Q, _vj2Chip, _ctrMapa\)/.test(pintar), 'la tabla sale del filtro (visibles)');
af(/visibles\.forEach/.test(pintar) && /Mostrando/.test(pintar),
   'el orden por grupos corre sobre lo VISIBLE y el filtro DICE «Mostrando X de Y»');
// El dinero del evento se suma sobre _vj2Filas (universo), no sobre visibles:
const sumasDinero = (pintar.match(/_vj2Filas\.forEach\(\(v\) => \{\s*const s = _vj3Saldo/g) || []).length;
af(sumasDinero === 2, 'las DOS sumas de dinero (deuda/favor y total/abonado) van sobre _vj2Filas: ' + sumasDinero + ' de 2');
// [VJ-PERFIL-1] el contexto ganó `perfiles` (foto/edad/emergencia del Portal): verdad nueva.
af(/_vj2Ctx = \{ evento: _ccEventoActual, porViajero, ctrMapa: _ctrMapa, perfiles: _perfiles \}/.test(cargar)
   && /_vj2Pintar\(\)/.test(cargar), '_vj2Cargar guarda el contexto y delega el pintado');
af(/_vj2Ctx\.evento !== _ccEventoActual/.test(cargar),
   'al cambiar de EVENTO el filtro se limpia (uno heredado escondería viajeros del evento nuevo)');
af(/cc-vj-buscar/.test(html) && /oninput="vjBuscar\(this\.value\)"/.test(html),
   'el buscador vive en el HTML (foco a salvo del repintado) y llama a vjBuscar');
af(/id="cc-vj-chips"/.test(html), 'el contenedor de chips existe en el HTML');

// ── [D] los chips pintados: clickeables y con el universo dicho ────────────
console.log('[D] _vjChipsPintar · chips clickeables, DOM falso');
const sb2 = {};
vm.createContext(sb2);
let chipsHtml = '';
sb2.document = { getElementById: (id) => (id === 'cc-vj-chips' ? { set innerHTML(v) { chipsHtml = v; }, get innerHTML() { return chipsHtml; } } : null) };
[decl(js, 'KH_PREVENTA_EVENTOS'), fn(js, 'khEsPreventaCiegas'), fn(js, 'khPaqueteTexto'), fn(js, '_esStaff'),
 decl(js, '_vjNorm'), fn(js, '_vjEsBaja'), fn(js, '_vjResumenDe'), fn(js, '_esfEsc'), fn(js, '_attrJs'),
 'let _vj2Chip = null;', fn(js, '_vjChipsPintar')].forEach((code) => vm.runInContext(code, sb2));
vm.runInContext('_vjChipsPintar(_vjResumenDe(' + JSON.stringify(FILAS) + '))', sb2);
af(/👥 <b>6<\/b> viajeros · 🎟 <b>7<\/b> lugares/.test(chipsHtml), 'el chip GLOBAL dice 6 viajeros · 7 lugares');
af(/PREVENTA A CIEGAS <b>2<\/b> · 2🎟/.test(chipsHtml), 'el chip de la preventa dice 2 · 2🎟');
af(/onclick="vjChip\('PLUS'\)"/.test(chipsHtml), 'los chips de paquete son BOTONES que filtran (vjChip)');
af(/bajas <b>1<\/b>/.test(chipsHtml) && /staff <b>1<\/b>/.test(chipsHtml), 'bajas y staff tienen su chip aparte');
af(/boletos por zona \(3 zonas\)/.test(chipsHtml), 'el desplegable de zonas dice cuántas hay (3)');
// Control positivo del instrumento: con chip activo, el chip se marca.
vm.runInContext('_vj2Chip = "PLUS"; _vjChipsPintar(_vjResumenDe(' + JSON.stringify(FILAS) + '))', sb2);
af(/class="vj-chip vj-chip-on"[^>]*onclick="vjChip\('PLUS'\)"/.test(chipsHtml), 'el chip activo se pinta encendido (vj-chip-on)');

// ── [E] los eventos: buscador por slug/artista + parrilla ──────────────────
console.log('[E] filtrarCapsule (REAL) · por slug y artista · la parrilla en CSS');
const sb3 = {};
vm.createContext(sb3);
let listaRecibida = null;
sb3.document = { getElementById: (id) => (id === 'cc-buscar' ? { value: sb3.__q || '' } : null) };
sb3.renderCCEventos = (lista) => { listaRecibida = lista; };
sb3._ccFiltroFecha = 'todos';
sb3._ccEventosCache = [
  { id: 'edc27', nombre: 'EDC México', artista: 'Varios', ciudad: 'CDMX', _res: {} },
  { id: 'fuerzaregida#0', nombre: 'Fuerza Regida', artista: 'Fuerza Regida', ciudad: 'Monterrey', _res: {} },
  { id: 'aitana', nombre: 'Aitana en MTY', artista: 'Aitana', ciudad: 'Monterrey', _res: { equipo: [{ nombre: 'Sofía C.' }] } },
];
vm.runInContext(fn(cap, 'filtrarCapsule'), sb3);
const busca = (q) => { sb3.__q = q; listaRecibida = null; vm.runInContext('filtrarCapsule()', sb3); return listaRecibida; };
af(busca('edc27').length === 1 && busca('edc27')[0].id === 'edc27', 'buscar por SLUG («edc27») encuentra 1 de 3');
af(busca('aitana').length === 1, 'buscar por artista/nombre («aitana») encuentra 1 de 3');
af(busca('sofia').length === 1 && busca('sofia')[0].id === 'aitana', '«sofia» encuentra el tour de la coordi Sofía (sin acentos) — se conserva lo de CC-CARDS-1');
af(busca('').length === 3, 'sin texto, pasan los 3 (solo el filtro de fecha decide)');
af(/#cc-eventos-grid\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(430px,1fr\)\)/.test(css),
   'la parrilla de eventos es GRID de columnas en el CSS');
af(/@media\(max-width:620px\)\{#cc-eventos-grid\{grid-template-columns:1fr\}\}/.test(css),
   'y en celular vuelve a UNA columna');
const render = sinCom(fn(js, 'renderCCEventos'));
af(/cc-ev-cnt/.test(render) && /filtrada\.length/.test(render), 'renderCCEventos dice CUÁNTOS tours se están viendo');
af(!/margin-bottom:10px/.test(render), 'la tarjeta ya no trae margin-bottom inline (el gap del grid manda)');

// ── [F] el aterrizaje: los tres roles del dinero caen en Viajeros ──────────
console.log('[F] _ccSubDefault · el aterrizaje por rol (palabra de Memo, 29-oct)');
const sb4 = {};
vm.createContext(sb4);
vm.runInContext(decl(js, 'CC_SUB_POR_ROL').replace(/^let /, 'const ') , sb4);
vm.runInContext(fn(js, '_ccSubDefault'), sb4);
const aterriza = (rol) => vm.runInContext('(() => { currentUser = ' + JSON.stringify({ rol }) + '; return _ccSubDefault(); })()', sb4);
af(aterriza('maestro_roshi') === 'viajeros', 'maestro_roshi aterriza en Viajeros (su palabra del 29-oct ES la medición)');
af(aterriza('bulma') === 'viajeros' && aterriza('milk') === 'viajeros', 'bulma y milk siguen en Viajeros');
af(aterriza('coordinador') === 'equipo', 'un rol sin hecho firmado cae al default de siempre (equipo)');

// ── [G] EL CAMINO, no la función: _vj2Pintar EJECUTADA con DOM falso ────────
// «Probar el camino, no la función»: el pintor REAL corre completo —con el
// filtro puesto— y se cuenta qué filas acabaron EN LA TABLA. Un grep del
// fuente no caza un ReferenceError de una pieza mal nombrada; ejecutarlo sí.
console.log('[G] _vj2Pintar ejecutada de punta a punta (DOM falso)');
try {
  const sb5 = {};
  vm.createContext(sb5);
  const nodos = {};
  const nodo = (id) => (nodos[id] = nodos[id] || { id, style: {}, innerHTML: '', textContent: '' });
  sb5.window = sb5;   // window.__vjCtr y los timers viven en el mismo sandbox
  sb5.document = { getElementById: (id) => nodo(id), querySelectorAll: () => [] };
  sb5.currentUser = { rol: 'maestro_roshi' };   // ve dinero y acciones
  [decl(js, 'KH_PREVENTA_EVENTOS'), fn(js, 'khEsPreventaCiegas'), fn(js, 'khPaqueteTexto'), fn(js, '_esStaff'),
   decl(js, '_vjNorm'), fn(js, '_vjEsBaja'), fn(js, '_vjResumenDe'), fn(js, '_vjFiltraFilas'),
   fn(js, '_esfEsc'), fn(js, '_attrJs'), fn(js, '_vj3Saldo'), fn(js, '_vj3Money'),
   // [CAPSULE-WA-1] el pintor ahora arma links de WhatsApp: sus tres dueños van al sandbox
   fn(js, '_cobDigits'), fn(js, '_waDigits10'), fn(js, '_vjWaHref'), fn(js, '_vjEdad'), fn(js, '_vjPerfil'),
   decl(js, 'VJ_ROLES_ELIMINAR'), fn(js, '_vjPuedeEliminar'), fn(js, '_vjCtrPuede'), fn(js, '_vjCtrChip'),
   decl(js, 'KH_CONTRATO_CLIENTE_VIVO'), decl(js, 'KH_CONTRATO_PRUEBA_CORREOS'),
   'let _vj2Filas = []; let _vj2Q = ""; let _vj2Chip = null; let _vj2Ctx = null;',
   fn(js, '_vjChipsPintar'), fn(js, '_vj2Pintar')].forEach((code) => vm.runInContext(code, sb5));
  vm.runInContext('_vj2Filas = ' + JSON.stringify(FILAS) + ';'
    + '_vj2Ctx = { evento: "frontera", porViajero: {}, ctrMapa: null };'
    + '_vj2Q = "sofia"; _vj2Chip = null; _vj2Pintar();', sb5);
  const tabla = nodos['cc-kh-list'] ? nodos['cc-kh-list'].innerHTML : '';
  const filasPintadas = (tabla.match(/<tr(?![^>]*id="vj-ab-)[^>]*>\s*(<td><input|<td><b>)/g) || []).length;
  af(filasPintadas === 1, 'con «sofia» la tabla pinta EXACTAMENTE 1 fila de persona: ' + filasPintadas);
  af(/Sofía López/.test(tabla) && !/María Pérez/.test(tabla), 'y es Sofía — María quedó fuera por el filtro');
  af(/Mostrando <b>1<\/b> de 7 viajeros/.test(tabla), 'la nota dice la verdad: «Mostrando 1 de 7»');
  af(/👥 <b>6<\/b> viajeros · 🎟 <b>7<\/b> lugares/.test(nodos['cc-vj-chips'].innerHTML),
     'los chips siguen con el UNIVERSO (6·7) aunque la tabla esté filtrada');
  // Sin filtro: las 7 filas (6 activas + 1 baja) se pintan como siempre.
  vm.runInContext('_vj2Q = ""; _vj2Chip = null; _vj2Pintar();', sb5);
  const tabla2 = nodos['cc-kh-list'].innerHTML;
  const filas2 = (tabla2.match(/<tr(?![^>]*id="vj-ab-)[^>]*>\s*(<td><input|<td><b>)/g) || []).length;
  af(filas2 === 7, 'sin filtro la tabla pinta las 7 filas de siempre (bajas incluidas): ' + filas2);
  af(/Baja Prueba/.test(tabla2), 'la baja sigue a la vista por default (hoy no se esconde nada)');
  // [CAPSULE-WA-1] por el pintor REAL: 4 fixtures traen celular de 10 dígitos
  // (a,b,c,d) → 4 links; las 3 filas sin celular, ninguno.
  const links = (tabla2.match(/class="vj2-wa"/g) || []).length;
  af(links === 4, 'el pintor arma 4 links de WhatsApp — los 4 celulares de 10 dígitos: ' + links);
  af(tabla2.indexOf('https://wa.me/528991112233?text=') !== -1, 'y el de María lleva SU número con el 52 delante');
  // [VJ-PERFIL-1] foto · edad · emergencia del PERFIL del Portal + notas en desplegable.
  vm.runInContext('_vj2Filas[0].correo = "Maria@X.mx"; _vj2Filas[0].notas = "nota larga de migración"; _vj2Filas[0].emergencia_nombre = null; _vj2Filas[0].num_emergencia = null;'
    + '_vj2Ctx.perfiles = { "maria@x.mx": { fecha_nacimiento: "2000-01-01", avatar_url: "https://cdn.x/a.jpg", emergencia_nombre: "Lupe", emergencia_tel: "8990001111", emergencia_relacion: "mamá" } };'
    + '_vj2Pintar();', sb5);
  const t3 = nodos['cc-kh-list'].innerHTML;
  const anioRey = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' }).slice(0, 4));
  af(t3.indexOf('<img src="https://cdn.x/a.jpg"') !== -1, '[VJ-PERFIL-1] la foto del perfil del Portal sale junto al nombre (casado por correo sin importar mayúsculas)');
  af(t3.indexOf(`· ${anioRey - 2000} años`) !== -1, '[VJ-PERFIL-1] la edad sale de la fecha de nacimiento: ' + (anioRey - 2000));
  af(/🆘 Lupe \(mamá\) · 8990001111/.test(t3), '[VJ-PERFIL-1] sin emergencia en KameHouse, se pinta la del perfil con nombre, parentesco y teléfono');
  af(/<details class="vj2-nota"><summary[^>]*>📝 Notas<\/summary>[\s\S]*nota larga de migración/.test(t3) && !/<th>Notas<\/th>/.test(t3), '[VJ-PERFIL-1] las notas viven en un desplegable al final (ya no es columna)');
  af(vm.runInContext('_vjEdad("2010-12-31")', sb5) === anioRey - 2011 || vm.runInContext('_vjEdad("2010-12-31")', sb5) === anioRey - 2010, 'la edad descuenta el cumpleaños que aún no llega');
  af(vm.runInContext('_vjEdad("")', sb5) === null, 'sin fecha no se inventa edad');
} catch (e) {
  af(false, 'EL PINTOR REVENTÓ al ejecutarse: ' + e.message);
}

// ── [H] CAPSULE-WA-1 · el celular como link de WhatsApp ────────────────────────
// _waDigits10 es el dueño EXTRAÍDO de _cobWaHref (cobranza): aquí se carea que
// la escalera resuelve lo mismo de siempre Y que la cobranza no cambió de
// conducta con la mudanza — una extracción que moviera la salida sería una
// reescritura disfrazada.
console.log('\n[H] CAPSULE-WA-1 · el celular como link de WhatsApp');
try {
  const sbH = {};
  vm.createContext(sbH);
  ['const _spFmtMxn = (n) => "$" + n;',
   fn(js, '_cobDigits'), fn(js, '_waDigits10'), fn(js, '_vjWaHref'), fn(js, '_cobWaHref')]
    .forEach((c) => vm.runInContext(c, sbH));
  const w10 = (s) => vm.runInContext('_waDigits10(' + JSON.stringify(s) + ')', sbH);
  af(w10('899 111-2233') === '8991112233', '10 dígitos con ruido → los 10 limpios');
  af(w10('528991112233') === '8991112233', '52+10 → pela el 52');
  af(w10('5218991112233') === '8991112233', '521+10 → pela el 521');
  af(w10('19566586239') === null, '11 dígitos de EE.UU. (caso REAL del padrón) NO se adivina → null');
  af(w10('899111223') === null && w10('') === null && w10(null) === null, '9 dígitos / vacío / null → null');
  // La cobranza (el llamador viejo) sigue contestando lo de siempre:
  const cob = vm.runInContext(
    '_cobWaHref({ clientes: { celular: "52 899 111 2233", nombre_completo: "Ana López" }, evento_nombre: "Frontera" })', sbH);
  af(typeof cob === 'string' && cob.indexOf('https://wa.me/528991112233?text=') === 0,
     'la cobranza sigue armando wa.me/52+10 tras la extracción');
  af(decodeURIComponent(cob.split('?text=')[1]).indexOf('Ana') !== -1, 'y su mensaje sigue nombrando a la persona');
  // El link nuevo de la lista de viajeros:
  const va = vm.runInContext('_vjWaHref({ celular: "8991112233", nombre: "María Pérez" }, "Frontera Tour")', sbH);
  af(typeof va === 'string' && va.indexOf('https://wa.me/528991112233?text=') === 0,
     'viajero con 10 dígitos → link wa.me/52+10');
  const msgH = decodeURIComponent(String(va).split('?text=')[1] || '');
  af(msgH.indexOf('María') !== -1 && msgH.indexOf('Frontera Tour') !== -1,
     'el saludo nombra a la persona y a SU evento');
  af(msgH.toLowerCase().indexOf('cambio') === -1,
     'el saludo es NEUTRO: no afirma un motivo — el motivo lo escribe el humano');
  af(vm.runInContext('_vjWaHref({ celular: "", nombre: "X" }, "E")', sbH) === null, 'sin celular → sin link');
  af(vm.runInContext('_vjWaHref({ celular: "19566586239", nombre: "X" }, "E")', sbH) === null,
     'celular de EE.UU. → sin link (no se inventa la lada 52)');
  const sinEv = vm.runInContext(
    'decodeURIComponent(_vjWaHref({ celular: "8991112233", nombre: "X" }, "").split("?text=")[1])', sbH);
  af(sinEv.indexOf('tu tour') !== -1, 'sin nombre de evento el saludo dice «tu tour», no un slug crudo');
} catch (e) {
  af(false, '[H] reventó: ' + e.message);
}

console.log('\n' + (ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
process.exit(ko ? 1 : 0);
