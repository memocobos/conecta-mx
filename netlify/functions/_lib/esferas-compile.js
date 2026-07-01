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

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// `fechas_extra` (texto JSON desde la DB, o array) → array de 'YYYY-MM-DD' válidas.
// Basura → []. NO ordena ni dedupe (eso lo hace generarObj junto con fecha_inicio).
function parseFechasExtra(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch (_) { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    if (typeof x !== 'string') continue;
    const s = x.slice(0, 10);
    if (FECHA_RE.test(s)) out.push(s);
  }
  return out;
}

// `inc` (texto JSON desde la DB, o array) → array de strings no vacíos (trim),
// en orden. Basura → []. Es la lista "qué incluye" del evento.
function parseInc(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch (_) { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    if (typeof x !== 'string') continue;
    const s = x.trim();
    if (s) out.push(s);
  }
  return out;
}

// B1 — `zonas` (texto JSON desde la DB, o array) → filas normalizadas en el
// ORDEN capturado: {n, p, pc, ag}. Basura → []. Descarta filas sin nombre.
// (VIP eliminado: ya no se captura ni se emite.)
function parseZonas(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch (_) { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const z of arr) {
    if (!z || typeof z !== 'object') continue;
    const n = (typeof z.n === 'string' ? z.n : '').trim();
    if (!n) continue;
    const p = Number(z.p);
    const pc = Number(z.pc);
    out.push({
      n,
      p: (Number.isFinite(p) && p > 0) ? Math.round(p) : 0,
      pc: (Number.isFinite(pc) && pc > 0) ? Math.round(pc) : 0,
      ag: (z.ag === 1 || z.ag === true || z.ag === '1') ? 1 : 0,
    });
  }
  return out;
}

// B1 — emite el segmento "zonas:[...]" (+ ",cheapZonas:[...]" si alguna zona
// tiene pc>0) byte-exacto: comillas simples, sin espacios, ag:1 solo si truthy.
// Sin zonas válidas → "zonas:[]" (byte-igual a hoy). NO emite vip nunca.
function zonasSegmento(esfera) {
  const rows = parseZonas(esfera.zonas);
  if (!rows.length) return 'zonas:[]';
  const plus = rows.map((z) =>
    "{n:'" + escStr(z.n) + "',p:" + z.p + (z.ag ? ',ag:1' : '') + '}'
  ).join(',');
  let seg = 'zonas:[' + plus + ']';
  // cheapZonas SOLO si alguna zona tiene precio cheap. Espeja TODAS las zonas:
  // disponible (no ag y pc>0) → p:pc; el resto → p:0,ag:1 (patrón legacy).
  if (rows.some((z) => z.pc > 0)) {
    const cheap = rows.map((z) => {
      const avail = !z.ag && z.pc > 0;
      return "{n:'" + escStr(z.n) + "',p:" + (avail ? z.pc : 0) +
        (avail ? '' : ',ag:1') + '}';
    }).join(',');
    seg += ',cheapZonas:[' + cheap + ']';
  }
  return seg;
}

// B2 — el plan de pagos es AUTOMÁTICO en index.html (getQuincenas arma Separo +
// Pago 1..N por quincenas). El campo `pagos` del EV es dato muerto: ningún render
// lo lee. Por eso SIEMPRE emitimos "pagos:[]" (byte-igual a un evento sin pagos).
// No se captura ni se compila plan custom.
function pagosSegmento() {
  return 'pagos:[]';
}

// B2b — `hotel` (texto JSON o objeto). Solo si {custom:true, items:[...]} →
// filas {n, e(POR PERSONA), viaj}. Sin custom / basura / sin items → null
// (el evento usa el default de ciudad, sin override).
function parseHotel(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch (_) { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (!obj.custom || !Array.isArray(obj.items)) return null;
  const items = [];
  for (const it of obj.items) {
    if (!it || typeof it !== 'object') continue;
    const n = (typeof it.n === 'string' ? it.n : '').trim();
    if (!n) continue;
    const e = Number(it.e);
    const viaj = Array.isArray(it.viaj)
      ? it.viaj.map((x) => parseInt(x, 10)).filter((x) => Number.isInteger(x) && x >= 1 && x <= 4)
      : [];
    items.push({ n, e: (Number.isFinite(e) && e > 0) ? Math.round(e) : 0, viaj });
  }
  if (!items.length) return null;
  return items;
}

// B2b — emite el segmento de hotel. Sin custom → "hotel:[]" byte-igual a hoy
// (default de ciudad). Con custom → "hotelOverride:true,hotelPP:true,hotel:[...]"
// byte-exacto (e POR PERSONA, viaj sin espacios).
function hotelSegmento(esfera) {
  const items = parseHotel(esfera.hotel);
  if (!items) return 'hotel:[]';
  const arr = items.map((it) => {
    const viajStr = it.viaj.length ? (',viaj:[' + it.viaj.join(',') + ']') : '';
    return "{n:'" + escStr(it.n) + "',e:" + it.e + viajStr + '}';
  }).join(',');
  return 'hotelOverride:true,hotelPP:true,hotel:[' + arr + ']';
}

// Display combinado para 2+ fechas (ya ordenadas y validadas 'YYYY-MM-DD').
//   mismo mes y año  → "7, 9 y 10 may 2026"
//   cruzan meses     → "30 nov y 2 dic 2026"  (mes en cada una, año una vez)
//   cruzan años      → "30 dic 2026 y 2 ene 2027" (año en cada una)
function fDisplayMulti(fechas) {
  const parts = fechas.map((s) => ({
    y: s.slice(0, 4),
    mo: parseInt(s.slice(5, 7), 10),
    d: parseInt(s.slice(8, 10), 10),
  }));
  // "a, b y c" — los primeros con ", " y el último con " y ".
  const joinHuman = (items) => (items.length <= 1
    ? (items[0] || '')
    : items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1]);
  const sameYear = parts.every((p) => p.y === parts[0].y);
  const sameMonth = sameYear && parts.every((p) => p.mo === parts[0].mo);
  if (sameMonth) {
    const mes = MESES[parts[0].mo - 1] || '';
    return joinHuman(parts.map((p) => String(p.d))) + ' ' + mes + ' ' + parts[0].y;
  }
  if (sameYear) {
    const items = parts.map((p) => String(p.d) + ' ' + (MESES[p.mo - 1] || ''));
    return joinHuman(items) + ' ' + parts[0].y;
  }
  const items = parts.map((p) => String(p.d) + ' ' + (MESES[p.mo - 1] || '') + ' ' + p.y);
  return joinHuman(items);
}

// ── Festival (Pieza 3a) ───────────────────────────────────────────────────────

// `festival` (texto JSON u objeto) → { switches, portada, lineup, lineup_mostrar,
// paquetes:[...] } o null (null/inválido → concierto). Defensivo. Defaults del
// capturador: cheap/stay ON, ride OFF, transporte cdmx, lineup_mostrar ON.
function parseFestival(raw) {
  if (raw == null) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s || s === 'null') return null;
    try { obj = JSON.parse(s); } catch (_) { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const sw = (obj.switches && typeof obj.switches === 'object') ? obj.switches : {};
  return {
    switches: {
      cheap: sw.cheap !== false,
      stay: sw.stay !== false,
      ride: !!sw.ride,
      transporte: (sw.transporte === 'local') ? 'local' : 'cdmx',
    },
    portada: (typeof obj.portada === 'string' && obj.portada.trim()) ? obj.portada.trim() : null,
    lineup: (typeof obj.lineup === 'string' && obj.lineup.trim()) ? obj.lineup.trim() : null,
    lineup_mostrar: obj.lineup_mostrar !== false,
    paquetes: Array.isArray(obj.paquetes) ? obj.paquetes : [],
  };
}

// k canónico del hotel derivado del nombre.
function _festHotelK(n) {
  const s = String(n == null ? '' : n).toLowerCase();
  if (s.indexOf('compartida') >= 0) return 'compartida';
  if (s.indexOf('triple') >= 0) return 'triple';
  if (s.indexOf('doble') >= 0) return 'doble';
  if (s.indexOf('individual') >= 0) return 'individual';
  return '';
}
// desc del hotel (compartida = frase especial; el resto "Tu parte del cuarto <k>";
// + " · N noches" si noches>1). Calcado del molde de coronacapital.
function _festHotelDesc(k, noches) {
  const base = (k === 'compartida')
    ? 'Compartes cuarto con otros viajeros'
    : ('Tu parte del cuarto ' + (k || 'compartido'));
  return base + (noches > 1 ? (' · ' + noches + ' noches') : '');
}
// Normaliza las zonas de un paquete → [{n,p,pc}] con n no vacío.
function _festZonaRows(zonas) {
  return (Array.isArray(zonas) ? zonas : [])
    .map((z) => ({
      n: (z && typeof z.n === 'string') ? z.n.trim() : '',
      p: Number(z && z.p) || 0,
      pc: Number(z && z.pc) || 0,
    }))
    .filter((z) => z.n);
}

// Genera el objeto EV en FORMATO FESTIVAL (multifecha rico + flags), byte-exacto,
// calcado de coronacapital. Base (id/added/c/a/f/ds/v/st/inc/sep/banco/pagos) igual
// que concierto. La música rotativa (music por multifecha) es la 3b — aquí NO va.
function generarObjFestival(esfera, fest, hoy) {
  const cheapOn = fest.switches.cheap;
  const stayOn = fest.switches.stay;
  const nombre = esfera.nombre || '';
  const status = esfera.status || '';

  // Fechas del evento (f/ds) igual que concierto; multifecha reemplaza a dsList.
  const fi = esfera.fecha_inicio || null;
  const dsRaw = fi ? String(fi).slice(0, 10) : '';
  const fechas = [];
  const vistas = new Set();
  for (const d of [dsRaw].concat(parseFechasExtra(esfera.fechas_extra))) {
    if (FECHA_RE.test(d) && !vistas.has(d)) { vistas.add(d); fechas.push(d); }
  }
  fechas.sort();
  const dsFinal = fechas.length ? fechas[0] : dsRaw;
  const fStr = (fechas.length >= 2) ? fDisplayMulti(fechas) : fDisplay(dsFinal || fi);

  const added = esfera.created_at ? String(esfera.created_at).slice(0, 10) : hoy;
  const color = escStr(esfera.color || 'azul');
  const venue = escStr(esfera.venue || '');
  const incRows = parseInc(esfera.inc);
  const incSeg = incRows.length
    ? ('inc:[' + incRows.map((s) => "'" + escStr(s) + "'").join(',') + ']')
    : 'inc:[]';
  const sepN = (esfera.sep != null && Number.isFinite(Number(esfera.sep)) && Number(esfera.sep) >= 0)
    ? Math.round(Number(esfera.sep)) : 500;
  const notaSeg = esfera.nota ? (",nota:'" + escStr(esfera.nota) + "'") : '';

  // Flags (mismo orden que coronacapital).
  let flags = '';
  if (fest.switches.transporte === 'cdmx') flags += 'cdmx:true,noBus:true,';
  const anyHotel = stayOn && fest.paquetes.some((p) => Array.isArray(p.hotel) && p.hotel.length);
  if (anyHotel) flags += 'hotelOverride:true,hotelPP:true,';
  if (stayOn === false) flags += 'noStay:true,';
  if (cheapOn === false) flags += 'noCheap:true,cheapSoon:true,';

  // Portada → staticImg + img:false; si no → img:'<nombre>'.
  const imgSeg = fest.portada
    ? ("staticImg:'" + escStr(fest.portada) + "',img:false,")
    : ("img:'" + escStr(nombre) + "',");
  const lineupSeg = (fest.lineup && fest.lineup_mostrar) ? ("lineup:'" + escStr(fest.lineup) + "',") : '';

  // multifecha: una entrada por paquete.
  const mfStr = fest.paquetes.map((p) => {
    const rows = _festZonaRows(p.zonas);
    const noches = Number(p.noches) || 0;
    let mf = "{lbl:'" + escStr(p.lbl || '') + "'";
    const pds = (typeof p.ds === 'string' && FECHA_RE.test(String(p.ds).slice(0, 10))) ? String(p.ds).slice(0, 10) : '';
    if (pds) mf += ",ds:'" + pds + "'";
    mf += ',noches:' + noches;
    mf += ',zonas:[' + rows.map((z) => "{n:'" + escStr(z.n) + "',p:" + Math.round(z.p) + '}').join(',') + ']';
    if (cheapOn && rows.some((z) => z.pc > 0)) {
      mf += ',cheapZonas:[' + rows.filter((z) => z.pc > 0).map((z) => "{n:'" + escStr(z.n) + "',p:" + Math.round(z.pc) + '}').join(',') + ']';
    }
    const ride = Number(p.ride) || 0;
    if (ride > 0) mf += ',ride:' + Math.round(ride);
    if (stayOn && Array.isArray(p.hotel) && p.hotel.length) {
      const hstr = p.hotel.map((h) => {
        const k = _festHotelK(h && h.n);
        const e = Math.round(Number(h && h.e) || 0);
        const viaj = (h && Array.isArray(h.viaj))
          ? h.viaj.map((x) => parseInt(x, 10)).filter((x) => Number.isInteger(x) && x >= 1 && x <= 4)
          : [];
        return "{k:'" + k + "',n:'" + escStr(h && h.n) + "',e:" + e + ',pp:' + e +
          ',viaj:[' + viaj.join(',') + "],desc:'" + escStr(_festHotelDesc(k, noches)) + "'}";
      }).join(',');
      mf += ',hotel:[' + hstr + ']';
    }
    return mf + '}';
  }).join(',');

  // Zonas top-level (fallback que el index espera) = del PRIMER paquete.
  const firstRows = _festZonaRows(fest.paquetes[0] && fest.paquetes[0].zonas);
  let topZonas = 'zonas:[' + firstRows.map((z) => "{n:'" + escStr(z.n) + "',p:" + Math.round(z.p) + '}').join(',') + ']';
  if (cheapOn && firstRows.some((z) => z.pc > 0)) {
    topZonas += ',cheapZonas:[' + firstRows.filter((z) => z.pc > 0).map((z) => "{n:'" + escStr(z.n) + "',p:" + Math.round(z.pc) + '}').join(',') + ']';
  }

  return "{id:'" + escStr(esfera.slug) +
    "',added:'" + added +
    "'," + flags +
    "c:'" + color +
    "'," + imgSeg + lineupSeg +
    "a:'" + escStr(esfera.titulo || nombre) +
    "',f:'" + escStr(fStr) +
    "',ds:'" + escStr(dsFinal) +
    "',v:'" + venue +
    "',st:'" + escStr(status) +
    "'," + incSeg + ',sep:' + sepN + notaSeg +
    ',banco:BANCO_DEFAULT,multifecha:[' + mfStr + '],' + topZonas + ',' + pagosSegmento() + '}';
}

// Byte-exacto: comillas simples, sin espacios extra. banco:BANCO_DEFAULT SIN
// comillas (referencia a variable). cdmx:true, SOLO si ciudad==='CDMX'.
// `added` deriva de created_at de la fila (estable entre re-publicaciones); si no
// hay, cae a hoy (todayMx). `music` (Deezer track id) solo si viene, tras added.
function generarObj(esfera, hoy) {
  // Bifurcación: si es festival con paquetes → formato festival; si no, concierto
  // (flujo ACTUAL, byte-igual).
  const fest = parseFestival(esfera.festival);
  if (fest && Array.isArray(fest.paquetes) && fest.paquetes.length) return generarObjFestival(esfera, fest, hoy);
  const nombre = esfera.nombre || '';
  const status = esfera.status || '';
  const ciudad = esfera.ciudad || '';
  const fi = esfera.fecha_inicio || null;
  const ds = fi ? String(fi).slice(0, 10) : '';
  // Multifecha-ficha: [fecha_inicio, ...fechas_extra] válidas, ordenadas, dedupe.
  const fechas = [];
  const vistas = new Set();
  for (const d of [ds].concat(parseFechasExtra(esfera.fechas_extra))) {
    if (FECHA_RE.test(d) && !vistas.has(d)) { vistas.add(d); fechas.push(d); }
  }
  fechas.sort();
  const esMulti = fechas.length >= 2;
  const dsFinal = fechas.length ? fechas[0] : ds;        // primera cronológica
  const fStr = esMulti ? fDisplayMulti(fechas) : fDisplay(dsFinal || fi);
  const dsListStr = esMulti
    ? ('dsList:[' + fechas.map((d) => "'" + d + "'").join(',') + '],')
    : '';
  const added = esfera.created_at ? String(esfera.created_at).slice(0, 10) : hoy;
  const music = esfera.music ? ("music:'" + escStr(esfera.music) + "',") : '';
  const color = escStr(esfera.color || 'azul');
  const venue = escStr(esfera.venue || '');
  const cdmx = (ciudad === 'CDMX') ? 'cdmx:true,' : '';
  // mapa: URL pública de la imagen subida (bucket mapas-eventos). Si vacío, NO se
  // emite → byte-igual a hoy. El render de index.html acepta URL directa o clave.
  const mapa = esfera.mapa ? ("mapa:'" + escStr(esfera.mapa) + "',") : '';
  // inc: lista "qué incluye". Array no vacío → inc:['<esc>',...]; vacío → inc:[].
  const incRows = parseInc(esfera.inc);
  const incSeg = incRows.length
    ? ("inc:[" + incRows.map((s) => "'" + escStr(s) + "'").join(',') + ']')
    : 'inc:[]';
  // sep: separo PLUS. SIEMPRE presente (como los eventos reales). null/ausente → 500.
  const sepN = (esfera.sep != null && Number.isFinite(Number(esfera.sep)) && Number(esfera.sep) >= 0)
    ? Math.round(Number(esfera.sep)) : 500;
  // sepCheap: SOLO si el evento tiene cheapZonas (alguna pc>0) Y sep_cheap definido.
  const tieneCheap = parseZonas(esfera.zonas).some((z) => z.pc > 0);
  const sepCheapSeg = (tieneCheap && esfera.sep_cheap != null
    && Number.isFinite(Number(esfera.sep_cheap)) && Number(esfera.sep_cheap) >= 0)
    ? (',sepCheap:' + Math.round(Number(esfera.sep_cheap))) : '';
  // nota: aviso especial. Si hay → nota:'<esc>'; si vacío → no emitir.
  const notaSeg = esfera.nota ? (",nota:'" + escStr(esfera.nota) + "'") : '';
  return "{id:'" + escStr(esfera.slug) +
    "',added:'" + added +
    "'," + music +
    "c:'" + color +
    "',img:'" + escStr(nombre) +
    "',a:'" + escStr(esfera.titulo || nombre) +
    "',f:'" + escStr(fStr) +
    "',ds:'" + escStr(dsFinal) +
    "'," + dsListStr +
    "v:'" + venue +
    "',st:'" + escStr(status) +
    "'," + cdmx + mapa +
    incSeg + ",sep:" + sepN + sepCheapSeg + notaSeg +
    ",banco:BANCO_DEFAULT," + zonasSegmento(esfera) + "," + hotelSegmento(esfera) + "," + pagosSegmento() + "}";
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
