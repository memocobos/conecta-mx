// =============================================================================
// _lib/esferas-compile.js — Compilador EV compartido (Esferas del Dragón)
//
// Función PURA: no hace fetch, no lee env. Recibe las filas de esferas_eventos y
// el string de index.html, genera el objeto-evento byte-exacto de cada Esfera
// ausente del array EV, lo inserta tras `var EV=[`, y valida el resultado con los
// DOS parsers consumidores (kamehouse-style y portal-style, new Function — nunca
// vm.Script). Misma lógica/escape/formato que validó la Pieza 2a.
//
// La usan: esferas-compilar-dryrun (preview) y esferas-publicar (escritura real).
// Está en `_lib/` (subcarpeta) — Netlify NO la auto-registra como function.
// =============================================================================

const MX_TZ = 'America/Monterrey';

// Fecha de hoy en huso CDMX/Monterrey (NO UTC). Patrón todayMx() de
// rol-recordatorios.js. en-CA da formato YYYY-MM-DD directo.
function todayMx() {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: MX_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return f.format(new Date());
}

// Meses abreviados español para fDisplay (local al generador — independiente del
// MESES de index.html, que es un objeto por número de mes).
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ── Generador del objeto-evento ───────────────────────────────────────────────

// ESCAPE OBLIGATORIO: '\' → '\\' y "'" → "\'" antes de interpolar en comillas
// simples. Un nombre tipo "Guns N' Roses" NO debe romper el array.
function escStr(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// 'YYYY-MM-DD' → 'D mes YYYY' (día sin cero a la izquierda). null → 'Por confirmar'.
function fDisplay(fecha_inicio) {
  if (!fecha_inicio) return 'Por confirmar';
  const m = String(fecha_inicio).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 'Por confirmar';
  const mes = MESES[parseInt(m[2], 10) - 1];
  if (!mes) return 'Por confirmar';
  return parseInt(m[3], 10) + ' ' + mes + ' ' + m[1];
}

// Byte-exacto: comillas simples, sin espacios extra. banco:BANCO_DEFAULT SIN
// comillas (referencia a variable). cdmx:true, SOLO si ciudad==='CDMX'.
// `added` deriva de created_at de la fila (estable entre re-publicaciones); si no
// hay, cae a hoy (todayMx). `music` (Deezer track id) solo si viene, tras added.
function generarObj(esfera, hoy) {
  const nombre = esfera.nombre || '';
  const status = esfera.status || '';
  const ciudad = esfera.ciudad || '';
  const fi = esfera.fecha_inicio || null;
  const ds = fi ? String(fi).slice(0, 10) : '';
  const added = esfera.created_at ? String(esfera.created_at).slice(0, 10) : hoy;
  const music = esfera.music ? ("music:'" + escStr(esfera.music) + "',") : '';
  const color = escStr(esfera.color || 'azul');
  const venue = escStr(esfera.venue || '');
  const cdmx = (ciudad === 'CDMX') ? 'cdmx:true,' : '';
  return "{id:'" + escStr(esfera.slug) +
    "',added:'" + added +
    "'," + music +
    "c:'" + color +
    "',img:'" + escStr(nombre) +
    "',a:'" + escStr(esfera.titulo || nombre) +
    "',f:'" + escStr(fDisplay(fi)) +
    "',ds:'" + escStr(ds) +
    "',v:'" + venue +
    "',st:'" + escStr(status) +
    "'," + cdmx +
    "inc:[],banco:BANCO_DEFAULT,zonas:[],hotel:[],pagos:[]}";
}

// ── Parsers de validación (idénticos a los consumidores) ──────────────────────

// estilo-kamehouse: regex + balanceo de corchetes ignorando strings + new Function.
function extraerEVKamehouse(content) {
  const m = content.match(/var\s+EV\s*=\s*\[/);
  if (!m) throw new Error('var EV no encontrado');
  const start = m.index + m[0].length - 1;
  let depth = 0, inStr = false, sc = '', esc = false, end = -1;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (ch === '\\') { esc = true; continue; } if (ch === sc) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; sc = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (!depth) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('Array EV sin cerrar');
  const arrText = content.slice(start, end);
  const stubs = 'var BANCO_DEFAULT={},BANCO_HEY={},HOTEL_CDM=[],HOTEL_STD=[];';
  const ev = new Function(stubs + 'return ' + arrText + ';')();
  if (!Array.isArray(ev)) throw new Error('EV no es array');
  return ev;
}

// estilo-portal: bloque WA…_promoActivo ejecutado con un winStub.
function extraerEVPortal(content) {
  const startIdx = content.indexOf("var WA='");
  let endIdx = content.indexOf('var _promoActivo');
  if (endIdx < 0) endIdx = content.indexOf('function $$(');
  if (startIdx < 0 || endIdx < 0) throw new Error('Bloque EV no localizado');
  const block = content.slice(startIdx, endIdx);
  const fn = new Function('window',
    block +
    '\nreturn {EV:EV,HOTEL_STD:HOTEL_STD,HOTEL_CDM:(typeof HOTEL_CDM!=="undefined"?HOTEL_CDM:[]),HOTEL_MTY:(typeof HOTEL_MTY!=="undefined"?HOTEL_MTY:[]),MESES:MESES};'
  );
  const noop = () => {};
  const winStub = {
    STATIC_IMGS: {}, MAPAS: {}, LINEUPS: {},
    addEventListener: noop, removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    location: { pathname: '/', search: '', hash: '' },
    history: { state: null, pushState: noop, replaceState: noop },
  };
  const out = fn(winStub);
  const ev = out.EV || [];
  if (!Array.isArray(ev)) throw new Error('EV no es array');
  return ev;
}

// ── API pública ───────────────────────────────────────────────────────────────

// compilarEV({ esferas, indexHtml }) → { contenidoNuevo, aInsertar, yaEnEv, validacion }
// Pura: no escribe nada. El caller decide si hace PUT con contenidoNuevo según
// la validación.
function compilarEV({ esferas, indexHtml }) {
  const content = String(indexHtml || '');

  // Ids ya presentes en el EV actual (parser de balanceo de kamehouse).
  const evAntes = extraerEVKamehouse(content);
  const idsAntes = new Set(evAntes.map(e => e && e.id).filter(Boolean));

  // UPSERT: cada Esfera genera su obj. Si su slug YA está en el EV → aActualizar
  // (reemplazar en su lugar); si NO → aInsertar.
  const hoy = todayMx();
  const aInsertar = [];
  const aActualizar = [];
  for (const esf of (Array.isArray(esferas) ? esferas : [])) {
    if (!esf || !esf.slug) continue;
    const obj = generarObj(esf, hoy);
    if (idsAntes.has(esf.slug)) aActualizar.push({ slug: esf.slug, obj });
    else aInsertar.push({ slug: esf.slug, obj });
  }

  // Primero reemplaza los existentes EN SU LUGAR (balanceo, sin tocar comas
  // vecinas), luego inserta los nuevos tras `var EV=[` (marcador intacto).
  let contenidoNuevo = content;
  for (const it of aActualizar) {
    contenidoNuevo = reemplazarEnEV(contenidoNuevo, it.slug, it.obj);
  }
  if (aInsertar.length > 0) {
    const bloque = aInsertar.map(x => x.obj).join(',\n  ');
    contenidoNuevo = contenidoNuevo.replace('var EV=[', 'var EV=[\n  ' + bloque + ',');
  }

  // GUARDA: si nada cambió, avisar para evitar un PUT redundante.
  const sin_cambios = (contenidoNuevo === content);

  // VALIDACIÓN con AMBOS parsers: todos los slugs (insertados + actualizados)
  // deben aparecer y el array debe parsear.
  const targetSlugs = aInsertar.map(x => x.slug).concat(aActualizar.map(x => x.slug));
  const validacion = {
    kamehouse_ok: false,
    portal_ok: false,
    ev_antes: evAntes.length,
    ev_despues: null,
    nuevos_encontrados: [],
    error: null,
  };

  try {
    const evKame = extraerEVKamehouse(contenidoNuevo);
    const ids = new Set(evKame.map(e => e && e.id).filter(Boolean));
    const faltan = targetSlugs.filter(s => !ids.has(s));
    validacion.kamehouse_ok = (faltan.length === 0);
    validacion.ev_despues = evKame.length;
    validacion.nuevos_encontrados = targetSlugs.filter(s => ids.has(s));
    if (faltan.length) validacion.error = 'kamehouse: faltan ids ' + faltan.join(', ');
  } catch (e) {
    validacion.kamehouse_ok = false;
    validacion.error = 'kamehouse parser: ' + e.message;
  }

  try {
    const evPortal = extraerEVPortal(contenidoNuevo);
    const idsP = new Set(evPortal.map(e => e && e.id).filter(Boolean));
    const faltanP = targetSlugs.filter(s => !idsP.has(s));
    validacion.portal_ok = (faltanP.length === 0);
    if (validacion.ev_despues == null) validacion.ev_despues = evPortal.length;
    if (faltanP.length && !validacion.error) validacion.error = 'portal: faltan ids ' + faltanP.join(', ');
  } catch (e) {
    validacion.portal_ok = false;
    if (!validacion.error) validacion.error = 'portal parser: ' + e.message;
  }

  return { contenidoNuevo, aInsertar, aActualizar, validacion, sin_cambios };
}

// ── Despublicar: quitar un objeto del EV por id (balanceo de llaves) ───────────

// Parsea un único objeto-evento aislado (con los mismos stubs que el parser
// kamehouse). Devuelve el objeto o lanza.
function _parseObjeto(objText) {
  const stubs = 'var BANCO_DEFAULT={},BANCO_HEY={},HOTEL_CDM=[],HOTEL_STD=[];';
  return new Function(stubs + 'return (' + objText + ');')();
}

// Valida un contenido con AMBOS parsers exigiendo que `slug` ya NO esté en el EV.
function _validarSlugFuera(content, slug, evAntesLen) {
  const v = { kamehouse_ok: false, portal_ok: false, ev_antes: evAntesLen, ev_despues: null, slug_fuera: false, error: null };
  try {
    const ev = extraerEVKamehouse(content);
    const tiene = ev.some(e => e && e.id === slug);
    v.ev_despues = ev.length;
    v.slug_fuera = !tiene;
    v.kamehouse_ok = !tiene;
    if (tiene) v.error = 'kamehouse: el slug sigue presente';
  } catch (e) {
    v.kamehouse_ok = false;
    v.error = 'kamehouse parser: ' + e.message;
  }
  try {
    const ev = extraerEVPortal(content);
    const tiene = ev.some(e => e && e.id === slug);
    if (v.ev_despues == null) v.ev_despues = ev.length;
    v.portal_ok = !tiene;
    if (tiene && !v.error) v.error = 'portal: el slug sigue presente';
  } catch (e) {
    v.portal_ok = false;
    if (!v.error) v.error = 'portal parser: ' + e.message;
  }
  return v;
}

// _localizarObjeto(content, slug) → {start,end} | null
// Localiza el objeto top-level cuyo id===slug dentro de `var EV=[` por BALANCEO
// DE LLAVES (respeta strings y anidación zonas:[{...}]; confirma obj.id===slug
// parseando el objeto aislado). Devuelve los índices [start,end) del objeto.
function _localizarObjeto(content, slug) {
  const target = String(slug || '');
  const m = content.match(/var\s+EV\s*=\s*\[/);
  if (!m) throw new Error('var EV no encontrado');
  const arrStart = m.index + m[0].length - 1; // apunta al '['
  const needle = "id:'" + target + "'";

  // brace===0 && bracket===1 marca el inicio/fin de cada objeto directo del array.
  let inStr = false, sc = '', esc = false, brace = 0, bracket = 1, objStart = -1;
  for (let i = arrStart + 1; i < content.length; i++) {
    const ch = content[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (ch === '\\') { esc = true; continue; } if (ch === sc) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; sc = ch; continue; }
    if (ch === '[') { bracket++; continue; }
    if (ch === ']') { bracket--; if (bracket === 0) break; continue; }
    if (ch === '{') { if (brace === 0 && bracket === 1) objStart = i; brace++; continue; }
    if (ch === '}') {
      brace--;
      if (brace === 0 && bracket === 1 && objStart >= 0) {
        const objText = content.slice(objStart, i + 1);
        if (objText.includes(needle)) {
          let obj = null;
          try { obj = _parseObjeto(objText); } catch (_) { obj = null; }
          if (obj && obj.id === target) return { start: objStart, end: i + 1 };
        }
        objStart = -1;
      }
      continue;
    }
  }
  return null;
}

// reemplazarEnEV(content, slug, nuevoObj) → string
// Sustituye el objeto id===slug por nuevoObj, SIN tocar comas vecinas ni otros
// eventos. Si no lo encuentra, devuelve el contenido sin cambios.
function reemplazarEnEV(content, slug, nuevoObj) {
  const loc = _localizarObjeto(content, slug);
  if (!loc) return content;
  return content.slice(0, loc.start) + nuevoObj + content.slice(loc.end);
}

// quitarDelEV({ indexHtml, slug }) → { contenidoNuevo, encontrado, validacion }
// Localiza el objeto por balanceo, lo borra completo incluyendo su coma, sin
// tocar el marcador ni otros eventos, y valida con los dos parsers.
function quitarDelEV({ indexHtml, slug }) {
  const content = String(indexHtml || '');
  const target = String(slug || '');

  // Valida que el EV base parsea (y da el conteo "antes").
  const evAntes = extraerEVKamehouse(content);

  const found = _localizarObjeto(content, target);
  if (!found) {
    return { contenidoNuevo: content, encontrado: false, validacion: _validarSlugFuera(content, target, evAntes.length) };
  }

  // Borrar el objeto + una coma adyacente: trailing preferente; si es el último
  // elemento, la coma previa.
  let s = found.start, e = found.end;
  let after = e;
  while (after < content.length && /\s/.test(content[after])) after++;
  if (content[after] === ',') {
    e = after + 1;
  } else {
    let b = s - 1;
    while (b >= 0 && /\s/.test(content[b])) b--;
    if (content[b] === ',') { s = b; }
  }
  const contenidoNuevo = content.slice(0, s) + content.slice(e);

  return { contenidoNuevo, encontrado: true, validacion: _validarSlugFuera(contenidoNuevo, target, evAntes.length) };
}

module.exports = { compilarEV, quitarDelEV, reemplazarEnEV, todayMx };
