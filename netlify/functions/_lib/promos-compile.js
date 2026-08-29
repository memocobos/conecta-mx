// =============================================================================
// _lib/promos-compile — [UB-2] Compila `promos_codigos` al `var PROMOS` del
// index.html. Imita a `_lib/esferas-compile`, no lo reinventa.
//
// LO QUE SE COPIA DE ESFERAS, y por qué cada cosa:
//   · UPSERT por llave, NUNCA borra. Un código ausente de la tabla se queda en
//     el index tal cual: la tabla gobierna lo que tiene, no lo que le falta.
//   · REEMPLAZO EN SU LUGAR por balance de llaves. No se re-serializa el bloque
//     entero: así los COMENTARIOS de dentro sobreviven (y hay varios que
//     documentan lecciones caras, como el del -05:00 de Reynosa).
//   · El reemplazo se hace con FUNCIÓN, no con cadena: un `$&` dentro de un
//     texto se interpretaría como patrón de sustitución.
//   · El update NO puede fallar en silencio: tras reemplazar se vuelve a
//     localizar y se exige que sea EXACTAMENTE lo compilado.
//   · Se valida con los DOS parsers antes de dar la salida por buena.
//
// 🔒 EL CANDADO PROPIO DE ESTE COMPILADOR — el rango de `rol.html`.
// `rol.html` recorta el index entre `var WA='` y `var _promoActivo` y hace
// `eval` de esos 130 KB. PROMOS vive DENTRO de ese rango, y tiene que seguir
// dentro: si el compilador lo moviera fuera, el rol se quedaría con un objeto
// vacío y contestaría «Código no válido» a TODO, sin un solo error. Se
// comprueba en `validar()`, no en una nota.
//
// 🔒 `usos` y `maxUsos` SE EMITEN SIEMPRE, aunque sean el default. No es
// redundancia: `validarPromo` hace `if (p.usos >= p.maxUsos)`, y con los dos
// ausentes eso es `undefined >= undefined` → false, que hoy da el mismo
// resultado por accidente. Emitirlos deja el objeto compilado IDÉNTICO al
// escrito a mano, que es el listón de esta tuerca.
// =============================================================================

// Lo que el compilador ADMINISTRA. Una llave que se emite pero no se declara
// aquí queda en tierra de nadie —se escribe y no se puede borrar—: es la regla
// de oro de la época ESF, que mordió dos veces.
const CAMPOS_DEL_COMPILADOR = new Set([
  'pct', 'pctCheap', 'amount', 'segundoPax', 'exactPersonas',
  'expiresTs', 'startTs', 'maxUsos', 'usos', 'singleUse',
  'desc', 'customMsg', 'hideAmount',
  'onlyEvent', 'onlyEvents', 'allEvents', 'onlyZones', 'excludeZones', 'excludePkg',
]);

// El orden canónico. Se eligió el que MÁS entradas ya usan (medido: 14 de 28
// siguen `unidad · expiresTs · maxUsos · usos · desc · onlyEvent · excludePkg`),
// para que el compilado se parezca lo más posible a lo escrito a mano.
const ORDEN = [
  'pct', 'pctCheap', 'amount', 'segundoPax', 'exactPersonas',
  'startTs', 'expiresTs', 'maxUsos', 'usos', 'singleUse',
  'desc', 'customMsg', 'hideAmount',
  'onlyEvent', 'onlyEvents', 'allEvents', 'onlyZones', 'excludeZones', 'excludePkg',
];

function escStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}
function ser(v) {
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? String(v) : null;
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'string') return "'" + escStr(v) + "'";
  if (Array.isArray(v)) {
    const p = v.map(ser);
    return p.some(x => x == null) ? null : '[' + p.join(',') + ']';
  }
  if (t === 'object') {
    const p = Object.keys(v).map(k => {
      const s = ser(v[k]);
      return s == null ? null : `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : "'" + escStr(k) + "'"}:${s}`;
    });
    return p.some(x => x == null) ? null : '{' + p.join(',') + '}';
  }
  return null;
}

// fila de `promos_codigos` → el objeto que el index espera
function filaAObjeto(f) {
  const o = {};
  if (f.pct != null) o.pct = Number(f.pct);
  if (f.pct_cheap != null) o.pctCheap = Number(f.pct_cheap);
  if (f.monto != null) o.amount = Number(f.monto);
  if (f.segundo_pax) o.segundoPax = f.segundo_pax;
  if (f.exact_personas != null) o.exactPersonas = Number(f.exact_personas);
  if (f.starts_at) o.startTs = Date.parse(f.starts_at);
  if (f.expires_at) o.expiresTs = Date.parse(f.expires_at);
  // 🔒 siempre, aunque sean el default (ver la cabecera)
  o.maxUsos = f.max_usos == null ? 9999 : Number(f.max_usos);
  o.usos = 0;
  if (f.single_use) o.singleUse = true;
  o.desc = f.desc_texto || '';
  if (f.custom_msg) o.customMsg = f.custom_msg;
  if (f.hide_amount) o.hideAmount = true;
  if (f.all_events) o.allEvents = true;
  else if (Array.isArray(f.only_events) && f.only_events.length === 1) o.onlyEvent = f.only_events[0];
  else if (Array.isArray(f.only_events) && f.only_events.length > 1) o.onlyEvents = f.only_events;
  if (f.only_zones && f.only_zones.length) o.onlyZones = f.only_zones;
  if (f.exclude_zones) o.excludeZones = f.exclude_zones;
  if (f.exclude_pkg && f.exclude_pkg.length) o.excludePkg = f.exclude_pkg;
  return o;
}

function generarEntrada(fila) {
  const o = filaAObjeto(fila);
  const emitidas = Object.keys(o);
  // 🔒 La regla de oro: todo lo que se EMITE tiene que estar declarado.
  const huerfanas = emitidas.filter(k => !CAMPOS_DEL_COMPILADOR.has(k));
  if (huerfanas.length) {
    throw new Error(`El compilador emite llaves que no declara: ${huerfanas.join(', ')}`);
  }
  const partes = ORDEN.filter(k => k in o).map(k => `${k}:${ser(o[k])}`);
  return `'${escStr(fila.codigo)}': {${partes.join(', ')}}`;
}

// Localiza `'CODIGO': {…}` por BALANCE, respetando literales de texto Y
// SALTANDO COMENTARIOS.
//
// ⚠️ LO DE LOS COMENTARIOS NO ES ADORNO: sin eso, un `// ojo con 'NATA': {…}`
// dentro del bloque se lleva el reemplazo. Medido — el compilador escribía la
// entrada compilada DENTRO del comentario y dejaba la entrada real intacta, así
// que el código se quedaba con su valor viejo y nadie se enteraba. Ni siquiera
// la guarda de «el update no puede fallar en silencio» lo veía: al re-localizar
// volvía a encontrar el mismo sitio equivocado y casaba consigo misma.
// Es la familia de «un prefijo no es un ancla»: la primera aparición no es la
// entrada.
function localizarCodigo(txt, codigo) {
  const marca = `'${codigo}'`;
  let ini = -1;
  {
    let S = false, q = '', esc = false, linea = false, bloque = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i], d = txt[i + 1];
      if (linea) { if (c === '\n') linea = false; continue; }
      if (bloque) { if (c === '*' && d === '/') { bloque = false; i++; } continue; }
      if (S) { if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; } if (c === q) S = false; continue; }
      if (c === '/' && d === '/') { linea = true; i++; continue; }
      if (c === '/' && d === '*') { bloque = true; i++; continue; }
      if (c === '"') { S = true; q = c; continue; }
      if (c === "'") {
        // ¿es el literal del código, seguido de `:` y `{`?
        if (txt.startsWith(marca, i)) {
          const resto = txt.slice(i + marca.length);
          if (/^\s*:\s*\{/.test(resto)) { ini = i; break; }
        }
        S = true; q = c; continue;
      }
    }
  }
  if (ini < 0) return null;
  let d = 0, S = false, q = '', esc = false;
  for (let i = txt.indexOf('{', ini); i < txt.length; i++) {
    const c = txt[i];
    if (esc) { esc = false; continue; }
    if (S) { if (c === '\\') { esc = true; continue; } if (c === q) S = false; continue; }
    if (c === '"' || c === "'") { S = true; q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return { start: ini, end: i + 1 }; }
  }
  return null;
}

// El bloque `var PROMOS={…}` del index, por balance.
function localizarBloque(html) {
  const m = /var\s+PROMOS\s*=\s*\{/.exec(html);
  if (!m) return null;
  const ini = m.index + m[0].length - 1;
  let d = 0, S = false, q = '', esc = false;
  for (let i = ini; i < html.length; i++) {
    const c = html[i];
    if (esc) { esc = false; continue; }
    if (S) { if (c === '\\') { esc = true; continue; } if (c === q) S = false; continue; }
    if (c === '"' || c === "'") { S = true; q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return { marcador: m.index, start: ini, end: i + 1 }; }
  }
  return null;
}

function evaluarPROMOS(html) {
  const loc = localizarBloque(html);
  if (!loc) return null;
  try { return new Function('return ' + html.slice(loc.start, loc.end) + ';')(); }
  catch (e) { return null; }
}

// compilarPROMOS({ codigos, indexHtml }) → { contenidoNuevo, aInsertar, aActualizar, validacion, sin_cambios }
function compilarPROMOS({ codigos, indexHtml }) {
  const content = String(indexHtml || '');
  const loc = localizarBloque(content);
  if (!loc) throw new Error('No localicé `var PROMOS={` en el index.');

  const antes = evaluarPROMOS(content);
  if (!antes) throw new Error('El PROMOS actual no parsea: no se toca nada.');

  const vistos = new Set();
  const aInsertar = [], aActualizar = [];
  for (const f of (Array.isArray(codigos) ? codigos : [])) {
    if (!f || !f.codigo) continue;
    const cod = String(f.codigo);
    // 🔒 AUD-1: un código repetido en el lote se escribiría dos veces.
    if (vistos.has(cod)) throw new Error(`El código "${cod}" viene repetido en el lote.`);
    vistos.add(cod);
    if (f.archivado) continue;   // archivado = no se publica, pero tampoco se borra
    const texto = generarEntrada(f);
    (cod in antes ? aActualizar : aInsertar).push({ codigo: cod, texto });
  }

  let nuevo = content;
  // 1) reemplazar EN SU LUGAR — sin tocar comentarios ni el marco
  for (const it of aActualizar) {
    const bloque = localizarBloque(nuevo);
    const dentro = nuevo.slice(bloque.start, bloque.end);
    const p = localizarCodigo(dentro, it.codigo);
    if (!p) throw new Error(`No localicé "${it.codigo}" para reemplazarlo.`);
    nuevo = nuevo.slice(0, bloque.start + p.start) + it.texto + nuevo.slice(bloque.start + p.end);
  }
  // 2) insertar los nuevos justo tras `var PROMOS={` (el marcador, intacto)
  if (aInsertar.length) {
    const bloque = localizarBloque(nuevo);
    const corte = bloque.start + 1;
    const texto = '\n  ' + aInsertar.map(x => x.texto).join(',\n  ') + ',';
    nuevo = nuevo.slice(0, corte) + texto + nuevo.slice(corte);
  }

  // 3) 🔒 el update no puede fallar en silencio
  for (const it of aActualizar) {
    const b = localizarBloque(nuevo);
    const p = localizarCodigo(nuevo.slice(b.start, b.end), it.codigo);
    if (!p) throw new Error(`Tras reemplazar, "${it.codigo}" ya no se localiza.`);
    const quedo = nuevo.slice(b.start + p.start, b.start + p.end);
    if (quedo !== it.texto) {
      throw new Error(`Lo que quedó de "${it.codigo}" no es lo que compilé.`);
    }
  }

  return {
    contenidoNuevo: nuevo,
    aInsertar, aActualizar,
    sin_cambios: nuevo === content,
    validacion: validar(nuevo, antes, vistos),
  };
}

// LOS DOS PARSERS + EL RANGO DE rol.html. Si algo de esto falla, la salida no
// se publica: es la diferencia entre un compilador y un editor de texto.
function validar(html, antes, gobernados) {
  const problemas = [];

  // (1) el bloque sigue parseando
  const ahora = evaluarPROMOS(html);
  if (!ahora) { problemas.push('el PROMOS compilado NO parsea'); return { ok: false, problemas }; }

  // (2) NUNCA BORRA: todo lo que había sigue estando
  const perdidos = Object.keys(antes).filter(k => !(k in ahora));
  if (perdidos.length) problemas.push(`desaparecieron códigos: ${perdidos.join(', ')}`);

  // (3) lo NO gobernado no se movió ni un byte en su objeto
  for (const k of Object.keys(antes)) {
    if (gobernados.has(k)) continue;
    if (JSON.stringify(antes[k]) !== JSON.stringify(ahora[k])) {
      problemas.push(`un código que la tabla no gobierna cambió: ${k}`);
    }
  }

  // (4) 🔒 EL RANGO DE rol.html — el candado de UB-0. PROMOS tiene que quedar
  // ENTRE los dos marcadores que `rol.html` usa para recortar, o el rol se
  // queda con `{}` y rechaza todos los códigos sin un solo error.
  const ini = html.indexOf("var WA='");
  const fin = html.indexOf('var _promoActivo');
  const b = localizarBloque(html);
  if (ini < 0) problemas.push("desapareció el marcador `var WA='` que abre el recorte de rol.html");
  if (fin < 0) problemas.push('desapareció el marcador `var _promoActivo` que cierra el recorte de rol.html');
  if (ini >= 0 && fin >= 0 && !(ini < b.marcador && b.end < fin)) {
    problemas.push('PROMOS quedó FUERA del rango que rol.html recorta: el rol se quedaría sin códigos');
  }
  // (5) y ese rango tiene que poder EVALUARSE, que es lo que rol.html hace
  if (ini >= 0 && fin >= 0 && ini < fin) {
    try {
      new Function('window', html.slice(ini, fin) + '\nreturn typeof PROMOS!=="undefined"?PROMOS:null;')
        ({ STATIC_IMGS: {}, MAPAS: {}, LINEUPS: {}, addEventListener() {}, removeEventListener() {},
           matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
           location: { pathname: '/', search: '', hash: '' }, history: { state: null, pushState() {}, replaceState() {} } });
    } catch (e) {
      problemas.push('el rango de rol.html ya no evalúa: ' + e.message);
    }
  }

  return { ok: problemas.length === 0, problemas, total: Object.keys(ahora).length };
}

module.exports = {
  compilarPROMOS, generarEntrada, filaAObjeto, localizarCodigo, localizarBloque,
  evaluarPROMOS, validar, CAMPOS_DEL_COMPILADOR, ORDEN, _ser: ser, _escStr: escStr,
};
