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

// ESCAPE OBLIGATORIO antes de interpolar en comillas simples. El texto viaja a
// index.html DENTRO de un <script>, así que hay que sobrevivir a DOS capas:
//
//   1) JS   — '\' → '\\' y "'" → "\'"  ("Guns N' Roses" no rompe el array).
//   2) HTML — '</' → '<\/'. 🔒 AUD-1: sin esto, un nombre con "</script>" CIERRA
//      el <script> de index.html y rompe el sitio… y PASA la validación, porque
//      los dos validadores parsean el JS extraído, no el HTML. La secuencia
//      '<\/' es idéntica a '</' para JS y ya no cierra la etiqueta para el
//      navegador. Se escapa TODO '</', no solo '</script>' (también '</style>',
//      '</textarea>', etc.).
//   3) Saltos de línea y separadores — \n \r U+2028 U+2029 terminan un literal
//      de comillas simples. Se emiten como escapes.
//
// El orden importa: la barra invertida SIEMPRE primero.
function escStr(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/<\//g, '<\\/');
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

// ¿El valor es "vacío" (no capturado)? null/undefined/'' → sí. Se usa para
// distinguir "no puso precio cheap" de "puso una basura".
function _vacio(v) {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

// B1 — `zonas` (texto JSON desde la DB, o array) → filas normalizadas en el
// ORDEN capturado: {n, p, pc, ag, prox}. Basura estructural → []. Descarta filas sin
// nombre. (VIP eliminado: ya no se captura ni se emite.)
//
// 🔒 AUD-1 — ERROR DE CAPTURA, no silencio: antes, un precio no numérico (el
// clásico "2,700" con coma, que Number() vuelve NaN) se normalizaba a 0 y la
// zona se publicaba DISPONIBLE A $0. Ahora una zona NO agotada con precio
// inválido o ≤0 LANZA, y el error sube al dryrun/publicar para que se corrija
// la captura. Una zona agotada (ag) sí puede ir en 0: no se vende.
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
    const ag = (z.ag === 1 || z.ag === true || z.ag === '1') ? 1 : 0;
    // [E1] PRÓXIMAMENTE: la zona existe pero todavía no tiene costo. El index ya
    // sabe pintarla (botón deshabilitado en cursiva) y minP la ignora; lo único
    // que faltaba era que el campo sobreviviera el viaje editor → EV.
    // PROX MANDA sobre AGOTADA: si por lo que sea llegaran las dos, se publica
    // prox (una zona sin precio anunciada como "agotada" le miente al cliente
    // sobre algo que nunca estuvo a la venta).
    const prox = (z.prox === 1 || z.prox === true || z.prox === '1') ? 1 : 0;
    const p = Number(z.p);
    // El candado AUD-1 no aplica a una zona prox: no tener precio todavía es
    // EXACTAMENTE su caso de uso, no un error de captura.
    if (!ag && !prox && !(Number.isFinite(p) && p > 0)) {
      throw new Error(
        `Zona "${n}": el precio "${z.p}" no es un número válido. ` +
        'Escríbelo sin comas ni símbolos (ej. 2700), o marca la zona como agotada.'
      );
    }
    // El precio cheap es opcional; si se capturó algo, tiene que ser un número.
    const pcRaw = z.pc;
    const pc = Number(pcRaw);
    if (!_vacio(pcRaw) && !Number.isFinite(pc)) {
      throw new Error(
        `Zona "${n}": el precio cheap "${pcRaw}" no es un número válido. ` +
        'Escríbelo sin comas ni símbolos (ej. 1800) o déjalo vacío.'
      );
    }
    // [ESF-E1b] VIP: la zona lleva marca de preferente. Se PERDÍA hasta hoy —53
    // eventos la usan en `zonas` y 51 en `cheapZonas`, 131 zonas en total— y el
    // candado de `fusionarConViejo` NO la protegía: protege campos de PRIMER
    // NIVEL, y `zonas` es uno que el compilador SÍ gobierna, así que el array se
    // reemplazaba entero y lo de adentro se iba sin que nada avisara.
    const vip = (z.vip === 1 || z.vip === true || z.vip === '1') ? 1 : 0;
    out.push({
      n,
      p: (Number.isFinite(p) && p > 0) ? Math.round(p) : 0,
      pc: (Number.isFinite(pc) && pc > 0) ? Math.round(pc) : 0,
      // prox manda: si vinieran las dos, la zona se publica como próximamente
      ag: prox ? 0 : ag,
      prox,
      vip,
    });
  }
  return out;
}

// [ESF-E1c] LA LISTA CHEAP ES SUYA, NO UN REFLEJO.
// Hasta hoy `cheapZonas` se DERIVABA de las mismas zonas PLUS: mismo nombre,
// mismo orden, `p:pc`. Medido sobre los 78 eventos que la tienen, eso alcanza
// para 64 — pero **14 divergen de verdad**: 5 tienen otro NÚMERO de zonas
// (machaca 3 vs 2, mendivil 11 vs 4, solomun 0 vs 3, youngmiko 9 vs 8), 8
// tienen otros nombres u otro orden, y 1 tiene los `ag` cruzados. Más 2 zonas
// cheap con `sepEspecial` propio, que un espejo no puede expresar.
//
// Un modelo que solo puede decir "lo mismo que PLUS" no describe el catálogo,
// así que la lista pasa a ser INDEPENDIENTE. El botón "copiar de PLUS" de la
// pantalla es conveniencia de captura, no el modelo.
function parseCheapZonas(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return null;              // vacío ≠ lista vacía
    try { arr = JSON.parse(raw); } catch (_) { return null; }
  }
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const z of arr) {
    if (!z || typeof z !== 'object') continue;
    const n = (typeof z.n === 'string' ? z.n : '').trim();
    if (!n) continue;
    const p = Number(z.p);
    const prox = (z.prox === 1 || z.prox === true || z.prox === '1') ? 1 : 0;
    const ag = (z.ag === 1 || z.ag === true || z.ag === '1') ? 1 : 0;
    const vip = (z.vip === 1 || z.vip === true || z.vip === '1') ? 1 : 0;
    const se = Number(z.sepEspecial);
    const rv = Number(z.requiereViajeros);
    out.push({
      n, p: (Number.isFinite(p) && p > 0) ? Math.round(p) : 0,
      ag: prox ? 0 : ag, prox, vip,
      sepEspecial: (Number.isFinite(se) && se > 0) ? Math.round(se) : null,
      requiereViajeros: (Number.isFinite(rv) && rv > 0) ? Math.round(rv) : null,
    });
  }
  return out;
}

// El texto de UNA zona cheap, en el orden del catálogo: n · p · vip · ag/prox ·
// sepEspecial · requiereViajeros.
function cheapZonaTexto(z) {
  return "{n:'" + escStr(z.n) + "',p:" + z.p +
    (z.vip ? ',vip:1' : '') +
    (z.prox ? ',prox:1' : (z.ag ? ',ag:1' : '')) +
    (z.sepEspecial != null ? ',sepEspecial:' + z.sepEspecial : '') +
    (z.requiereViajeros != null ? ',requiereViajeros:' + z.requiereViajeros : '') + '}';
}

// ═══ [ESF-E1f] MULTIFECHA EN CONCIERTOS · el NIVEL 4 de Memo ════════════════
// Cada fecha con SUS PROPIAS zonas, agotables una por una. Hasta hoy
// `multifecha:` solo se emitía en el camino de FESTIVAL —2 de las 2 apariciones
// del compilador— así que un concierto multifecha (straykids, weeknd, bts,
// karolg, morat, caifanes, harry, alvarodiaz: OCHO eventos) no se podía
// gobernar: `multifecha` YA estaba en CAMPOS_DEL_COMPILADOR, y publicarlo le
// habría borrado las fechas con sus zonas. La misma trampa que `noStay` en
// ESF-E1e, pero borrando bastante más.
//
// Las dos familias del catálogo NO se mezclan: la de FECHA (lbl · ds? · zonas ·
// cheapZonas? · ride? · rideAgotado?) es ésta; la de PAQUETE —con `noches`,
// `music` y `hotel` por entrada— es la del festival y sigue por su camino.
// ═══ [ESF-E1g] EL BANCO · una lista CERRADA, y por una razón dura ══════════
// `banco` sale al `index.html` como un IDENTIFICADOR CRUDO (`banco:BANCO_HEY`),
// no como texto entre comillas. Cualquier cosa que no sea uno de los nombres
// conocidos sería CÓDIGO inyectado en el catálogo público. Por eso no basta con
// validar la forma: la lista es cerrada.
//
// Medido sobre el catálogo: solo existen dos. 87 eventos BANCO_DEFAULT (BBVA),
// 3 BANCO_HEY (Banamex: acdc, soad, harry) y 12 SIN banco.
//
// Y por eso `banco` necesitaba COLUMNA en vez de "no emitirlo nunca": 90 de 102
// eventos SÍ lo traen, así que dejar de emitirlo se lo habría BORRADO a los 90.
// El default es legítimo y está ANUNCIADO (todos los lectores hacen
// `ev.banco || BANCO_DEFAULT`), pero eso no autoriza a inventarlo ni a perderlo.
const BANCOS_VALIDOS = ['BANCO_DEFAULT', 'BANCO_HEY'];
function bancoValido(v) {
  const s = (typeof v === 'string') ? v.trim() : '';
  return BANCOS_VALIDOS.includes(s) ? s : null;
}

function parseMultifecha(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return null;
    try { arr = JSON.parse(raw); } catch (_) { return null; }
  }
  if (!Array.isArray(arr) || !arr.length) return null;
  const out = [];
  for (const f of arr) {
    if (!f || typeof f !== 'object') continue;
    const lbl = (typeof f.lbl === 'string' ? f.lbl : '').trim();
    if (!lbl) continue;                       // sin etiqueta no hay fecha que mostrar
    const ds = (typeof f.ds === 'string' && FECHA_RE.test(f.ds.trim())) ? f.ds.trim() : null;
    // Las zonas de la fecha se leen con el MISMO parser que las de arriba: una
    // zona es una zona, esté donde esté. Un tercer parser sería la copia que
    // acaba divergiendo.
    const zonas = parseCheapZonas(f.zonas) || [];
    const cheap = parseCheapZonas(f.cheapZonas);
    const ride = Number(f.ride);
    out.push({
      lbl, ds, zonas,
      cheapZonas: cheap,
      ride: (Number.isFinite(ride) && ride > 0) ? Math.round(ride) : null,
      rideAgotado: (f.rideAgotado === 1 || f.rideAgotado === true || f.rideAgotado === '1') ? 1 : 0,
    });
  }
  return out.length ? out : null;
}

// El texto de UNA fecha, en el orden del catálogo:
//   lbl · ds? · zonas · cheapZonas? · ride? · rideAgotado?
function multifechaTexto(f) {
  return "{lbl:'" + escStr(f.lbl) + "'" +
    (f.ds ? ",ds:'" + f.ds + "'" : '') +
    ',zonas:[' + f.zonas.map(cheapZonaTexto).join(',') + ']' +
    (f.cheapZonas ? ',cheapZonas:[' + f.cheapZonas.map(cheapZonaTexto).join(',') + ']' : '') +
    (f.ride != null ? ',ride:' + f.ride : '') +
    (f.rideAgotado ? ',rideAgotado:1' : '') + '}';
}

// B1 — emite el segmento "zonas:[...]" (+ ",cheapZonas:[...]" si alguna zona
// tiene pc>0) byte-exacto: comillas simples, sin espacios, ag:1 solo si truthy.
// Sin zonas válidas → "zonas:[]" (byte-igual a hoy). NO emite vip nunca.
// ═══ [ESF-CAMPOS-1] TRES CAMPOS CHICOS QUE BLOQUEABAN A 13 EVENTOS VIVOS ═══
// Medidos sobre el catálogo del 25-ago: `promo` en 22 eventos (12 vivos),
// `deporte` en 4 (3 vivos) y `musicSearch` en 2 (1 vivo). Ninguno es complicado
// —dos banderas y una cadena— y entre los tres desbloquean 13 eventos vivos que
// solo los tenían a ellos como brecha.
//
// El SITIO de cada uno sale de contar el catálogo, no de elegirlo: `promo` va
// después de `id` (19 de 22), `deporte` después de `id` (3 de 4) y `musicSearch`
// después de `img` (2 de 2). El juez es semántico y no mira el orden, pero
// emitir en el sitio mayoritario deja byte-idénticos a los que ya estaban.
//
// `promo:true` y `deporte:1` — cada uno con SU literal, que es como vive en el
// catálogo. Escribir `promo:1` sería semánticamente otra cosa para el juez.
function promoSeg(esfera) { return esfera.promo ? 'promo:true,' : ''; }

// [ESF-PROMO-PAR] El código de la promo y su etiqueta. Nacieron con CAT-1 (la
// promo de pareja) y son el badge que el index pinta sobre la tarjeta:
//   promoCode:'TINI'
//   promoLabel:'PROMO DE PAREJA · CÓDIGO: TINI · HASTA EL 24 AGO'
// Medido: los 6 eventos que los tienen los tienen LOS DOS, y en el mismo orden
// (promoCode tras `promo`, promoLabel tras `promoCode`). Aun así se guardan por
// SEPARADO: que hoy vayan juntos no los convierte en un solo dato, y un par
// acoplado a la fuerza es lo que hay que desacoplar cuando uno cambie.
//
// Son los últimos que le faltaban a calle24, tini, enjambre, alejandrosanz y
// badgyal — los cinco que mi tabla de diseño contó de más al meter `promo`,
// `promoCode` y `promoLabel` en el mismo cubo.
function promoCodeSeg(esfera) {
  const v = (typeof esfera.promo_code === 'string') ? esfera.promo_code.trim() : '';
  return v ? ("promoCode:'" + escStr(v) + "',") : '';
}
function promoLabelSeg(esfera) {
  const v = (typeof esfera.promo_label === 'string') ? esfera.promo_label.trim() : '';
  return v ? ("promoLabel:'" + escStr(v) + "',") : '';
}
function deporteSeg(esfera) { return esfera.deporte ? 'deporte:1,' : ''; }
function musicSearchSeg(esfera) {
  const v = (typeof esfera.music_search === 'string') ? esfera.music_search.trim() : '';
  return v ? ("musicSearch:'" + escStr(v) + "',") : '';
}

// ═══ [ESF-FLASH-1] EL CÓDIGO DE DESCUENTO FLASH ═══════════════════════════
// El último campo grande del mapa: bloqueaba a 14 eventos vivos.
//
// EL CATÁLOGO TIENE DOS FORMAS, medidas sobre los 15 que lo traen:
//   corta (10):  {code, pct|amount, expiresTs}
//   larga  (5):  {code, pct, expiresHours, expiresTs, excludePkg, onlyEvent}
// Por eso viaja como UN objeto en una columna JSON —igual que `hotel`,
// `multifecha` y `cheap_zonas`— y no como cuatro columnas sueltas: cuatro
// columnas habrían dejado fuera a los 5 de la forma larga.
//
// ⚠️ `expiresTs` SE GUARDA COMO INSTANTE (epoch ms), no como texto con huso.
// En el catálogo aparece de las dos maneras —número crudo en 10, y
// `Date.parse('...-06:00')` en 5— y las dos evalúan a lo mismo. Guardar el
// instante quita la pregunta: no hay literal que escribir mal.
//
// LA REGLA DEL HUSO vive en la CAPTURA, no aquí: lo que Memo teclea se lee en
// hora de REYNOSA (-05:00), que sigue el horario de EE.UU. Careado contra el
// COMPA de arre: 1778427681035 son las 10:41:21 del 10-may en Reynosa. Los
// literales `-06:00` del catálogo son de mayo y son LEGACY; los nuevos
// (`-05:00`, agosto) ya siguen esta regla.
//
// `pct` y `amount` son EXCLUYENTES: un porcentaje o unos pesos, nunca los dos.
const FLASH_PKGS = ['plus', 'ride', 'stay', 'cheap'];

function parseFlashPromo(raw) {
  let o = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return null;
    try { o = JSON.parse(raw); } catch (_) { return null; }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const code = (typeof o.code === 'string') ? o.code.trim() : '';
  if (!code) return null;                       // sin código no hay promo que aplicar
  const ts = Number(o.expiresTs);
  if (!Number.isFinite(ts) || ts <= 0) return null;   // sin vencimiento tampoco
  const out = { code, expiresTs: Math.round(ts) };
  const pct = Number(o.pct), amount = Number(o.amount);
  if (Number.isFinite(pct) && pct > 0) out.pct = Math.round(pct);
  else if (Number.isFinite(amount) && amount > 0) out.amount = Math.round(amount);
  else return null;                             // un descuento de nada no es un descuento
  const hrs = Number(o.expiresHours);
  if (Number.isFinite(hrs) && hrs > 0) out.expiresHours = Math.round(hrs);
  if (Array.isArray(o.excludePkg)) {
    const ex = o.excludePkg.map((x) => String(x).trim().toLowerCase()).filter((x) => FLASH_PKGS.includes(x));
    if (ex.length) out.excludePkg = ex;
  }
  if (typeof o.onlyEvent === 'string' && o.onlyEvent.trim()) out.onlyEvent = o.onlyEvent.trim();
  return out;
}

// El orden de las llaves es el del catálogo:
//   code · pct|amount · expiresHours? · expiresTs · excludePkg? · onlyEvent?
function flashPromoSeg(esfera) {
  const f = parseFlashPromo(esfera.flash_promo);
  if (!f) return '';
  return "flashPromo:{code:'" + escStr(f.code) + "'" +
    (f.pct != null ? ',pct:' + f.pct : ',amount:' + f.amount) +
    (f.expiresHours != null ? ',expiresHours:' + f.expiresHours : '') +
    ',expiresTs:' + f.expiresTs +
    (f.excludePkg ? ",excludePkg:['" + f.excludePkg.join("','") + "']" : '') +
    (f.onlyEvent ? ",onlyEvent:'" + escStr(f.onlyEvent) + "'" : '') +
    '},';
}

// ═══ [ESF-CIERRE-LINEUP] EL CARTEL DEL FESTIVAL ═══════════════════════════
// Bloqueaba a 9 eventos vivos. Ya se emitía en el camino de FESTIVAL (desde
// `festival.lineup`), pero un CONCIERTO que lo trae —machaca, straykids,
// knotfest, dalemix…— no tenía de dónde sacarlo.
//
// ⚠️ NO ES UNA URL, o no siempre: en el catálogo `lineup:'machaca'` es una LLAVE
// del archivo `lineups.js`, que se mantiene a mano. Guardar solo URLs habría
// roto los 12 que ya existen; guardar solo llaves habría dejado a Esferas sin
// poder cerrar el círculo (subir una imagen y usarla).
//
// Se guardan LAS DOS COSAS en el mismo campo, que es exactamente lo que
// `staticImg` ya hace en este catálogo desde hace tiempo: si empieza por `http`
// o `data:` es la imagen; si no, es una llave de LINEUPS. El index aprende el
// mismo truco en `abrirLineup` — no es un patrón nuevo, es el que ya vivía al
// lado.
function lineupConcSeg(esfera) {
  const v = (typeof esfera.lineup === 'string') ? esfera.lineup.trim() : '';
  return v ? ("lineup:'" + escStr(v) + "',") : '';
}

function zonasSegmento(esfera) {
  const rows = parseZonas(esfera.zonas);
  if (!rows.length) return 'zonas:[]';
  // [E1] El orden de las llaves espeja el de los EV que ya viven en el index
  // (p.ej. coronacapital: {n:'General',p:0,prox:1}), para que el compilado siga
  // siendo byte-exacto contra lo capturado a mano.
  // [ESF-E1b] El orden es `n · p · vip · ag`, medido sobre las 1,910 zonas del
  // catálogo: 119 lo escriben así y solo 12 al revés (`ag · vip`). Se emite el
  // mayoritario; esos 12 quedan semánticamente idénticos y se canonicalizan al
  // publicar, que es lo que ya pasa con los eventos gobernados.
  const plus = rows.map((z) =>
    "{n:'" + escStr(z.n) + "',p:" + z.p + (z.vip ? ',vip:1' : '') +
    (z.prox ? ',prox:1' : (z.ag ? ',ag:1' : '')) + '}'
  ).join(',');
  let seg = 'zonas:[' + plus + ']';
  // [ESF-E1c] LA LISTA PROPIA MANDA. Si Esferas capturó una, se emite tal cual
  // y no se mira `pc` para nada.
  const propia = parseCheapZonas(esfera.cheap_zonas);
  if (propia) {
    return propia.length
      ? (seg + ',cheapZonas:[' + propia.map(cheapZonaTexto).join(',') + ']')
      : seg;                                  // lista vacía capturada = sin cheap
  }

  // ⚠️ RAMPA DE MIGRACIÓN, NO UN SEGUNDO CAMINO. Mientras un evento no tenga su
  // lista capturada, se sigue derivando del `pc` de las zonas PLUS como hasta
  // hoy — si no, los 7 eventos ya gobernados que tienen cheapZonas las perderían
  // en su próxima publicación, y los que se creen desde cero en Esferas nacerían
  // sin cheap aunque el capturista pusiera precios.
  //
  // SE RETIRA cuando E2 haya sembrado `cheap_zonas` en todos los eventos: a
  // partir de ahí "sin lista" significa de verdad "sin cheap". La condición está
  // escrita aquí para que no se quede como una rama eterna que nadie se atreve a
  // borrar.
  //
  // cheapZonas SOLO si alguna zona tiene precio cheap. Espeja TODAS las zonas:
  // disponible (no ag y pc>0) → p:pc; el resto → p:0,ag:1 (patrón legacy).
  // [E1] Una zona prox se espeja como prox también en cheap: si todavía no hay
  // costo PLUS, tampoco lo hay CHEAP — anunciarla "agotada" mentiría igual.
  if (rows.some((z) => z.pc > 0)) {
    const cheap = rows.map((z) => {
      const v = z.vip ? ',vip:1' : '';
      if (z.prox) return "{n:'" + escStr(z.n) + "',p:0" + v + ',prox:1}';
      const avail = !z.ag && z.pc > 0;
      // [ESF-E1b] La marca VIP viaja al espejo cheap: es propiedad de la ZONA
      // (dónde te sientas), no del paquete. Una zona VIP sigue siendo VIP
      // aunque se compre sin transporte.
      return "{n:'" + escStr(z.n) + "',p:" + (avail ? z.pc : 0) + v +
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
  // [ESF-E0] YA NO SE EMITE NADA. El campo `pagos` del EV era dato muerto —el
  // plan real lo arma `getQuincenas` sola y ningún render lo lee, verificado
  // con grep sobre index.html y todo el repo— y ESF-E0 lo podó de los 89
  // objetos que lo traían. Si el compilador siguiera emitiendo `pagos:[]`,
  // publicar cualquier evento se lo volvería a poner, y el careo byte a byte
  // —que es el candado de toda esta serie— fallaría para siempre por un campo
  // que nadie lee.
  //
  // Se conserva la función, vacía, en vez de borrar la llamada: así el punto
  // donde se decidió queda a la vista y el diff de esta tuerca es de una línea.
  return '';
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
    // [ESF-CIERRE-HOTEL] El hotel FINO. 36 de las 145 filas del catálogo traen
    // `k` (la llave del tipo de cuarto), `pp` (su costo POR PERSONA) y `desc`
    // (la frase que lee el cliente: "Tu parte del cuarto doble"). El compilador
    // emitía solo `{n,e,viaj}`, así que 8 eventos perdían las tres.
    //
    // ⚠️ OJO CON `pp`: el de la FILA es un NÚMERO (el costo por persona de ese
    // cuarto) y el del ARREGLO es una BANDERA (`hotelPP:true`). Mismo nombre,
    // dos cosas. Se leen por separado y no se tocan entre sí.
    const k = (typeof it.k === 'string' && it.k.trim()) ? it.k.trim() : null;
    const ppFila = Number(it.pp);
    const desc = (typeof it.desc === 'string' && it.desc.trim()) ? it.desc.trim() : null;
    items.push({
      n, e: (Number.isFinite(e) && e > 0) ? Math.round(e) : 0, viaj,
      k,
      pp: (Number.isFinite(ppFila) && ppFila >= 0 && it.pp != null) ? Math.round(ppFila) : null,
      desc,
    });
  }
  if (!items.length) return null;
  // [ESF-E1e] Las DOS banderas viajan con la lista, no se dan por hechas. Medido
  // sobre los 33 eventos con hotel propio: 100 filas son `{n,e}` a secas —sin
  // `viaj`, sin `hotelPP`, sin `hotelOverride`— y 32 son la forma del festival.
  // El emisor forzaba `hotelOverride:true,hotelPP:true` SIEMPRE, así que a los
  // primeros les habría estrenado dos banderas: `hotelPP` cambia el costo de
  // "total" a "POR PERSONA" y `hotelOverride` le quita al evento el default de
  // su ciudad. Dos precios distintos por una bandera que nadie pidió.
  items.pp = (obj.pp === undefined) ? true : !!obj.pp;
  items.override = (obj.override === undefined) ? true : !!obj.override;
  return items;
}

// B2b — emite el segmento de hotel. Sin custom → "hotel:[]" byte-igual a hoy
// (default de ciudad). Con custom → "hotelOverride:true,hotelPP:true,hotel:[...]"
// byte-exacto (e POR PERSONA, viaj sin espacios).
function hotelSegmento(esfera) {
  const items = parseHotel(esfera.hotel);
  if (!items) return 'hotel:[]';
  // [ESF-CIERRE-HOTEL] El orden es el del catálogo: k · n · e · pp · viaj · desc.
  // Cada uno SOLO si la fila lo trae — las 109 filas simples (`{n,e}`) siguen
  // saliendo idénticas, que es el candado de #585.
  const arr = items.map((it) => {
    const kStr = it.k ? ("k:'" + escStr(it.k) + "',") : '';
    const ppStr = (it.pp != null) ? (',pp:' + it.pp) : '';
    const viajStr = it.viaj.length ? (',viaj:[' + it.viaj.join(',') + ']') : '';
    const descStr = it.desc ? (",desc:'" + escStr(it.desc) + "'") : '';
    return '{' + kStr + "n:'" + escStr(it.n) + "',e:" + it.e + ppStr + viajStr + descStr + '}';
  }).join(',');
  // [ESF-E1e] Las banderas SOLO si la lista las trae. El default sigue siendo
  // `true` para no mover a los eventos ya gobernados ni a los festivales, que es
  // como se capturan hoy; lo que cambia es que ahora se pueden apagar.
  const flags = (items.override ? 'hotelOverride:true,' : '') + (items.pp ? 'hotelPP:true,' : '');
  return flags + 'hotel:[' + arr + ']';
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
    musica: Array.isArray(obj.musica) ? obj.musica : [],
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
// 🔒 AUD-1: mismo candado de captura que parseZonas — un precio no numérico en
// un paquete de festival también publicaba una zona a $0. Aquí no hay `ag` por
// paquete, así que todo precio de zona debe ser un número > 0.
function _festZonaRows(zonas, lblPaquete) {
  const donde = lblPaquete ? ` del paquete "${lblPaquete}"` : '';
  return (Array.isArray(zonas) ? zonas : [])
    .map((z) => {
      const n = (z && typeof z.n === 'string') ? z.n.trim() : '';
      if (!n) return { n: '', p: 0, pc: 0 };
      const p = Number(z && z.p);
      if (!(Number.isFinite(p) && p > 0)) {
        throw new Error(
          `Zona "${n}"${donde}: el precio "${z && z.p}" no es un número válido. ` +
          'Escríbelo sin comas ni símbolos (ej. 2700).'
        );
      }
      const pcRaw = z && z.pc;
      const pc = Number(pcRaw);
      if (!_vacio(pcRaw) && !Number.isFinite(pc)) {
        throw new Error(
          `Zona "${n}"${donde}: el precio cheap "${pcRaw}" no es un número válido.`
        );
      }
      return { n, p, pc: Number.isFinite(pc) ? pc : 0 };
    })
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
  // [ESF-CIERRE-FECHA] El override y el rango, ANTES de todo lo demás. Los dos
  // emisores calculaban `f` EN LÍNEA —dos gemelas de la misma regla— así que
  // arreglarlo en `fechaDisplayDeEsfera` no servía de nada: nadie la llamaba
  // desde aquí. Se enchufa el override donde el valor se decide, en los dos.
  const _libre1 = (typeof esfera.f_texto === 'string') ? esfera.f_texto.trim() : '';
  const _rango1 = _diasDelRango(dsRaw, esfera.fecha_fin ? String(esfera.fecha_fin).slice(0, 10) : '');
  const fStr = _libre1 ? _libre1
    : (_rango1.length >= 2 ? fDisplayMulti(_rango1)
      : ((fechas.length >= 2) ? fDisplayMulti(fechas) : fDisplay(dsFinal || fi)));

  // [ESF-E1d] `added` SOLO si la fila trae fecha. Antes caía en `hoy`, y eso NO
  // es un default inocuo: `added` alimenta el filtro **NUEVOS** del catálogo
  // ("agregado en los últimos 30 días"). Los 54 eventos del EV que no lo traen
  // habrían aparecido como recién llegados el día que se gobernaran — 54
  // conciertos viejos amontonados en la pestaña de novedades.
  //
  // Quitar el relleno es seguro para lo que se crea en Esferas: `created_at` es
  // NOT NULL con `now()` (medido en la base: 0 nulos de 13 filas), así que un
  // evento nuevo SIEMPRE lo tendrá. Lo único que cambia es lo importado sin fecha
  // conocida, que es justo lo que no debe estrenar una.
  const _addedRaw = esfera.created_at ? String(esfera.created_at).slice(0, 10) : '';
  const addedSeg = FECHA_RE.test(_addedRaw) ? ("added:'" + _addedRaw + "',") : '';
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
    const rows = _festZonaRows(p.zonas, p.lbl);
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
  const firstRows = _festZonaRows(fest.paquetes[0] && fest.paquetes[0].zonas, fest.paquetes[0] && fest.paquetes[0].lbl);
  let topZonas = 'zonas:[' + firstRows.map((z) => "{n:'" + escStr(z.n) + "',p:" + Math.round(z.p) + '}').join(',') + ']';
  if (cheapOn && firstRows.some((z) => z.pc > 0)) {
    topZonas += ',cheapZonas:[' + firstRows.filter((z) => z.pc > 0).map((z) => "{n:'" + escStr(z.n) + "',p:" + Math.round(z.pc) + '}').join(',') + ']';
  }

  // Música rotativa (3b): lista de ids Deezer del festival. El sitio elige UNA al
  // azar por visita (evMusicQuery). Sin ids → no se emite.
  const musIds = Array.isArray(fest.musica)
    ? fest.musica.map((m) => (m && m.id != null) ? String(m.id).trim() : '').filter(Boolean)
    : [];
  const musicListSeg = musIds.length
    ? ('musicList:[' + musIds.map((id) => "'" + escStr(id) + "'").join(',') + '],')
    : '';

  // [ESF-E1g] El banco: solo si la esfera lo trae y está en la lista cerrada.
  // Ausente = el evento no dice banco, y todos los lectores caen a BANCO_DEFAULT
  // por su cuenta (`ev.banco || BANCO_DEFAULT`, medido en index, rol,
  // catalogo-index, cuenta-deposito y cuenta-evento).
  const _bk = bancoValido(esfera.banco);
  const bancoSeg = _bk ? (',banco:' + _bk) : '';
  return "{id:'" + escStr(esfera.slug) + "'," + promoSeg(esfera) + promoCodeSeg(esfera) + promoLabelSeg(esfera) + deporteSeg(esfera) + addedSeg + musicListSeg + flags +
    "c:'" + color +
    "'," + imgSeg + musicSearchSeg(esfera) + lineupSeg + flashPromoSeg(esfera) +
    "a:'" + escStr(esfera.titulo || nombre) +
    "',f:'" + escStr(fStr) +
    "',ds:'" + escStr(dsFinal) +
    "',v:'" + venue +
    "',st:'" + escStr(status) +
    "'," + incSeg + sepSeg + notaSeg +
    bancoSeg + ',multifecha:[' + mfStr + '],' + topZonas + pagosSegmento() + '}';
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
  // [ESF-E1f] Las fechas con sus zonas. Si el evento las trae y NO tiene
  // `fechas_extra`, las fechas del display salen de aquí — es el caso de morat y
  // caifanes, que llevan `ds` en cada entrada y no tienen `dsList`.
  const mfFilas = parseMultifecha(esfera.multifecha);
  const mfDs = mfFilas ? mfFilas.map((f) => f.ds).filter(Boolean) : [];
  const dsFinal = fechas.length ? fechas[0] : ds;        // primera cronológica
  // [ESF-E1f] El display: mandan las `fechas_extra` si las hay; si no, las `ds`
  // de las entradas de multifecha. NO se inventa `dsList` a partir de ellas —
  // morat y caifanes no lo tienen, y añadírselo les estrenaría el selector de
  // día en el sitio: eso es un cambio de PANTALLA, no de dato.
  const fDeMulti = (!esMulti && mfDs.length >= 2) ? [...new Set(mfDs)].sort() : null;
  // [ESF-CIERRE-FECHA] El override y el rango, ANTES de todo lo demás. Los dos
  // emisores calculaban `f` EN LÍNEA —dos gemelas de la misma regla— así que
  // arreglarlo en `fechaDisplayDeEsfera` no servía de nada: nadie la llamaba
  // desde aquí. Se enchufa el override donde el valor se decide, en los dos.
  const _libre2 = (typeof esfera.f_texto === 'string') ? esfera.f_texto.trim() : '';
  const _rango2 = _diasDelRango(ds, esfera.fecha_fin ? String(esfera.fecha_fin).slice(0, 10) : '');
  const fStr = _libre2 ? _libre2
    : (_rango2.length >= 2 ? fDisplayMulti(_rango2)
      : (esMulti ? fDisplayMulti(fechas)
        : (fDeMulti ? fDisplayMulti(fDeMulti) : fDisplay(dsFinal || fi))));
  const dsListStr = esMulti
    ? ('dsList:[' + fechas.map((d) => "'" + d + "'").join(',') + '],')
    : '';
  // [ESF-E1d] `added` SOLO si la fila trae fecha. Antes caía en `hoy`, y eso NO
  // es un default inocuo: `added` alimenta el filtro **NUEVOS** del catálogo
  // ("agregado en los últimos 30 días"). Los 54 eventos del EV que no lo traen
  // habrían aparecido como recién llegados el día que se gobernaran — 54
  // conciertos viejos amontonados en la pestaña de novedades.
  //
  // Quitar el relleno es seguro para lo que se crea en Esferas: `created_at` es
  // NOT NULL con `now()` (medido en la base: 0 nulos de 13 filas), así que un
  // evento nuevo SIEMPRE lo tendrá. Lo único que cambia es lo importado sin fecha
  // conocida, que es justo lo que no debe estrenar una.
  const _addedRaw = esfera.created_at ? String(esfera.created_at).slice(0, 10) : '';
  const addedSeg = FECHA_RE.test(_addedRaw) ? ("added:'" + _addedRaw + "',") : '';
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
  // [ESF-E1g] sep: el separo PLUS. NO SE INVENTA — misma regla que `added` y las
  // banderas de hotel en E1d: solo se emite si la esfera lo trae.
  //
  // Antes caía a 500 cuando faltaba, y eso no era un default: era una AFIRMACIÓN
  // sobre un evento que no la hacía. 13 objetos del catálogo no tienen `sep`
  // (agotados y "por confirmar", con `zonas:[]`) y el compilador les añadía uno,
  // así que ninguno era gobernable.
  //
  // No emitirlo NO cambia el sitio: `precio-zona` ya trata el separo ausente como
  // INDETERMINADO a propósito (AUD-2: "el separo ES la ganancia; mejor que no se
  // venda a que se venda sin ella"), portal lee `ev.sep || 500` y rol `ev.sep||0`.
  // Lo que cambia es que el compilador deja de decir algo que el evento no dice.
  const sepSeg = (esfera.sep != null && Number.isFinite(Number(esfera.sep)) && Number(esfera.sep) >= 0)
    ? (',sep:' + Math.round(Number(esfera.sep))) : '';
  // sepCheap: SOLO si el evento tiene cheapZonas (alguna pc>0) Y sep_cheap definido.
  // [ESF-SEPCHEAP] "¿Este evento vende CHEAP?" se preguntaba SOLO por
  // `zonas[].pc > 0` — la forma vieja, anterior a que ESF-E1c le diera a CHEAP
  // su lista propia. Un evento capturado con el modelo NUEVO (lista
  // independiente, sin `pc` en las zonas PLUS) vendía CHEAP y aun así perdía su
  // `sepCheap`, en silencio.
  //
  // Hoy muerde a UNO —karolcdmx, 14 cheap_zonas y cero `pc`— pero el filo es a
  // FUTURO: desde E1c el modelo es la lista propia, así que cada evento nuevo
  // que Memo capture así habría perdido el separo cheap.
  //
  // Las DOS vías cuentan, porque las dos son maneras legítimas de vender CHEAP.
  const _czLista = parseCheapZonas(esfera.cheap_zonas);
  const tieneCheap = parseZonas(esfera.zonas).some((z) => z.pc > 0)
    || (Array.isArray(_czLista) && _czLista.length > 0);
  const sepCheapSeg = (tieneCheap && esfera.sep_cheap != null
    && Number.isFinite(Number(esfera.sep_cheap)) && Number(esfera.sep_cheap) >= 0)
    ? (',sepCheap:' + Math.round(Number(esfera.sep_cheap))) : '';
  // [ESF-E1a] RIDE: el precio del paquete sin boleto. Es el campo que más
  // eventos bloqueaba —68 de 95 lo traen— y sin él dos tercios del catálogo no se
  // podían gobernar desde Esferas.
  //
  // Se emite SOLO si viene: un evento sin RIDE no debe estrenar `ride:0`, que el
  // index leería como "el RIDE cuesta cero". Ausente ≠ gratis.
  //
  // `sepRide` va PEGADO a él y con la misma regla: solo si hay `ride`. El separo
  // de un paquete que no se vende no significa nada, y los 5 eventos que lo traen
  // lo ponen siempre junto al ride.
  const rideN = (esfera.ride != null && esfera.ride !== '' && Number.isFinite(Number(esfera.ride)) && Number(esfera.ride) > 0)
    ? Math.round(Number(esfera.ride)) : null;
  const sepRideN = (rideN != null && esfera.sep_ride != null && esfera.sep_ride !== ''
    && Number.isFinite(Number(esfera.sep_ride)) && Number(esfera.sep_ride) >= 0)
    ? Math.round(Number(esfera.sep_ride)) : null;
  const rideSeg = (rideN == null) ? ''
    : ((sepRideN != null ? ',sepRide:' + sepRideN : '') + ',ride:' + rideN);

  // nota: aviso especial. Si hay → nota:'<esc>'; si vacío → no emitir.
  const notaSeg = esfera.nota ? (",nota:'" + escStr(esfera.nota) + "'") : '';
  // Foto (portada manual del concierto) → staticImg + img:false; si no → img:'<nombre>'
  // (byte-igual a hoy). Mismo molde que el branch de festival (fest.portada).
  // ═══ [ESF-CIERRE-COLAS] `staticImg` e `img` SON DOS CAMPOS, no uno ═════════
  // El compilador los derivaba los dos de `foto`, y por eso solo sabía escribir
  // DOS de las SEIS combinaciones que el catálogo usa de verdad:
  //
  //   88  img:'<nombre>'                          ← el default de siempre
  //    2  staticImg:'<URL>',img:false             ← `foto` (julionrodep, natanael)
  //    6  staticImg:'<llave>'   (SIN img)         ← machaca, emblema, t3r…
  //    2  staticImg:'<llave>',img:false           ← soyluna, knotfest
  //    2  staticImg:'<llave>',img:'<texto>'       ← arre, pulsoquetaro
  //    2  (ninguno de los dos)                    ← mendivil, miloj
  //
  // Qué es cada uno: `staticImg` es la IMAGEN (una llave de `imgs.js` o una URL);
  // `img` es el NOMBRE CON EL QUE SE BUSCA una portada cuando no hay estática, y
  // `img:false` significa "no busques". Ausente y `false` se comportan IGUAL en
  // el sitio cuando hay imagen estática —lo dice la línea 3129 del index— pero el
  // juez es semántico y una llave ausente no es una llave en `false`: por eso
  // hacen falta los dos casos, y por eso `img_omitir` existe.
  const _stat = (typeof esfera.foto === 'string' && esfera.foto.trim()) ? esfera.foto.trim()
    : ((typeof esfera.static_img === 'string' && esfera.static_img.trim()) ? esfera.static_img.trim() : '');
  const _imgTxt = (typeof esfera.img_texto === 'string' && esfera.img_texto.trim()) ? esfera.img_texto.trim() : '';
  const _statSeg = _stat ? ("staticImg:'" + escStr(_stat) + "',") : '';
  const imgSeg = _statSeg + (
    esfera.img_omitir ? ''
      : (_imgTxt ? ("img:'" + escStr(_imgTxt) + "',")
        : (_stat ? 'img:false,' : ("img:'" + escStr(nombre) + "',"))));
  // ═══ [ESF-E1e] LAS BANDERAS DE PAQUETE, EN EL CAMINO DE CONCIERTO ═══════════
  // Hasta hoy este bloque SOLO existía en el camino de festival. Un concierto
  // gobernado no podía decir "este evento no vende STAY" — y `noStay` YA estaba
  // en CAMPOS_DEL_COMPILADOR, así que publicar un concierto que la trajera se la
  // habría llevado. La bandera estaba en la lista de gobernadas y el compilador
  // no sabía escribirla: la peor combinación posible.
  //
  // Es el NIVEL 3 de la granularidad que pidió Memo —apagar paquete por paquete—
  // y son las mismas banderas que CAT-AGOT-1 acaba de arreglar en el index
  // (`rideOnly` en Stray Kids, `cheapOnly` en WWE Mexico).
  //
  // ⚠️ `cheapAlsoOk` solo significa algo junto a `rideOnly`: es su matiz ("solo
  // RIDE, pero el CHEAP también se puede"). Suelta no dice nada, así que suelta
  // no se emite.
  const _f = [];
  if (esfera.no_bus) _f.push('noBus:true');
  if (esfera.ride_only) {
    _f.push('rideOnly:true');
    if (esfera.cheap_also_ok) _f.push('cheapAlsoOk:true');
  } else if (esfera.cheap_only) {
    // Excluyentes por definición: "solo RIDE" y "solo CHEAP" no pueden ser las
    // dos ciertas. Si llegaran juntas manda `rideOnly`, y se decide AQUÍ en vez
    // de dejar que lo decida el orden en que se escriban.
    _f.push('cheapOnly:true');
  }
  if (esfera.no_stay) _f.push('noStay:true');
  if (esfera.no_cheap) _f.push('noCheap:true');
  if (esfera.cheap_soon) _f.push('cheapSoon:true');
  const flagsSeg = _f.length ? (_f.join(',') + ',') : '';

  // [ESF-E1g] El banco: solo si la esfera lo trae y está en la lista cerrada.
  // Ausente = el evento no dice banco, y todos los lectores caen a BANCO_DEFAULT
  // por su cuenta (`ev.banco || BANCO_DEFAULT`, medido en index, rol,
  // catalogo-index, cuenta-deposito y cuenta-evento).
  const _bk = bancoValido(esfera.banco);
  const bancoSeg = _bk ? (',banco:' + _bk) : '';
  return "{id:'" + escStr(esfera.slug) + "'," + promoSeg(esfera) + promoCodeSeg(esfera) + promoLabelSeg(esfera) + deporteSeg(esfera) + addedSeg + music +
    "c:'" + color +
    "'," + imgSeg + musicSearchSeg(esfera) +
    "a:'" + escStr(esfera.titulo || nombre) +
    "',f:'" + escStr(fStr) +
    "',ds:'" + escStr(dsFinal) +
    "'," + dsListStr +
    "v:'" + venue +
    "',st:'" + escStr(status) +
    "'," + cdmx + mapa + lineupConcSeg(esfera) + flashPromoSeg(esfera) + flagsSeg +
    incSeg + sepSeg + sepCheapSeg + rideSeg + notaSeg +
    bancoSeg + ',' +
    // [ESF-E1f] La multifecha va ANTES de las zonas, igual que en el camino de
    // festival y que en los 8 conciertos del catálogo.
    (mfFilas ? ('multifecha:[' + mfFilas.map(multifechaTexto).join(',') + '],') : '') +
    zonasSegmento(esfera) + "," + hotelSegmento(esfera) + pagosSegmento() + "}";
}

// ═══ [ESF-FECHA] LA FECHA IMPOSIBLE SE RECHAZA EN LA PUERTA ═════════════════
// Memo capturó `0026-08-18` en titodoble —un dedazo de 2026— y Esferas lo
// aceptó sin decir nada. El evento pasó a estar "agotado hace dos mil años":
// desapareció del sitio, sin error, sin aviso y sin nada que mirar. La fecha
// tenía la FORMA correcta (`\d{4}-\d{2}-\d{2}`), y eso era lo único que se
// comprobaba.
//
// Es la misma familia que el techo del separo: el formato está bien, lo que no
// puede existir es el HECHO. Por eso el rechazo es 422 y no 400.
//
// La ventana es deliberadamente ancha —2020 a 2100— porque no está aquí para
// adivinar si una fecha es "razonable", sino para cazar el dedazo que cambia el
// siglo. Un evento de 2031 se captura sin fricción; uno de 0026 o de 20260 no.
const ANIO_MIN = 2020;
const ANIO_MAX = 2100;

// Devuelve `null` si la fecha sirve, o el texto del error si no.
// `''`/null se consideran "sin fecha", que es legítimo (un evento por confirmar).
function fechaAbsurda(v, campo) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!FECHA_RE.test(s)) return `${campo || 'La fecha'} no tiene la forma AAAA-MM-DD: "${s.slice(0, 20)}".`;
  const anio = Number(s.slice(0, 4));
  if (!(anio >= ANIO_MIN && anio <= ANIO_MAX)) {
    return `${campo || 'La fecha'} dice el año ${anio}, que no puede ser: se aceptan de ${ANIO_MIN} a ${ANIO_MAX}. ` +
      'Revisa si se te fue un dígito — un año como 0026 hace que el evento desaparezca del sitio por "pasado".';
  }
  return null;
}

// ── Parsers de validación (idénticos a los consumidores) ──────────────────────

// ⚠️ NOTA SOBRE LOS BALANCEADORES (extraerEVKamehouse y _localizarObjeto):
// solo reconocen strings de comillas simples y dobles. NO entienden template
// literals (`backticks`) ni comentarios. Hoy es seguro porque el EV se escribe
// SIEMPRE con comillas simples (lo garantiza este compilador y así está el
// index.html a mano). Si algún día alguien mete un backtick — o un '[' / '{'
// dentro de un comentario — dentro del array EV, el balanceo se descuadra y la
// extracción falla o corta donde no debe. Regla: dentro de `var EV=[…]`, solo
// comillas simples.
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
  // HOTEL_MTY incluida: un evento del EV puede referenciarla y sin el stub la
  // validación entera reventaría con ReferenceError.
  const stubs = 'var BANCO_DEFAULT={},BANCO_HEY={},HOTEL_CDM=[],HOTEL_STD=[],HOTEL_MTY=[];';
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

// ── 🔒 AUD-1: fusión al ACTUALIZAR (no perder lo que el compilador no maneja) ──
//
// El compilador emite un subconjunto del EV. Un evento que ya vive en index.html
// puede traer campos que NADIE captura en las Esferas (ride, rideOnly, cheapOnly,
// diaFirst, waChannel, noBus…) y, sobre todo, `banco:BANCO_HEY`. Antes, re-publicar
// SUSTITUÍA el objeto entero → esos campos DESAPARECÍAN y el banco se volvía
// BANCO_DEFAULT: un evento de Banamex se quedaba con la cuenta EQUIVOCADA y nadie
// se enteraba (la validación solo mira que el id exista).
//
// Ahora se fusiona: lo que el compilador maneja MANDA (es lo recién capturado) y
// todo lo demás del objeto viejo SE CONSERVA tal cual. Si un campo perdido no se
// puede re-emitir con seguridad (arrays/objetos que no sabemos serializar), se
// LANZA con un mensaje claro en vez de tragárselo.
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Campos que el compilador ADMINISTRA. Ojo con la distinción, que es el corazón
// de la fusión: administrar ≠ emitir siempre. `cheapZonas` se emite solo si hay
// precio cheap; `mapa` solo si se subió mapa; `dsList` solo si hay multifecha.
// Cuando el compilador administra un campo y NO lo emite, eso SIGNIFICA "este
// evento ya no lo tiene" → se deja ir. Lo que se preserva es únicamente lo que
// el capturador de Esferas ni siquiera conoce (ride, rideOnly, cheapOnly,
// diaFirst, waChannel, _past…).
const CAMPOS_DEL_COMPILADOR = new Set([
  // base concierto
  'id', 'added', 'music', 'c', 'staticImg', 'img', 'a', 'f', 'ds', 'dsList',
  'v', 'st', 'cdmx', 'mapa', 'inc', 'sep', 'sepCheap', 'nota', 'banco',
  'zonas', 'cheapZonas', 'hotel', 'hotelOverride', 'hotelPP', 'pagos',
  // extras del formato festival
  'musicList', // [ESF-FLAGS] Las SIETE banderas de paquete, no cuatro. `rideOnly`,
  // `cheapOnly` y `cheapAlsoOk` se EMITÍAN pero no estaban aquí, y este Set es
  // el que le dice a `fusionarConViejo` "esto lo administra el compilador". Al
  // faltar, el fusionador las trataba como campo ajeno y las RE-INSERTABA desde
  // el objeto viejo: apagarlas en Esferas no servía de nada. Medido en vivo
  // sobre straykids (rideOnly) y wwemexico (cheapOnly).
  //
  // La regla, para que no se repita: si el compilador puede EMITIR una llave,
  // esa llave va en este Set. Lo contrario deja el campo en tierra de nadie —
  // se escribe pero no se puede borrar.
  'noBus', 'noStay', 'noCheap', 'cheapSoon', 'rideOnly', 'cheapOnly', 'cheapAlsoOk',
  // [ESF-CAMPOS-1] Se emiten, así que se declaran — la regla de ESF-FLAGS.
  'promo', 'promoCode', 'promoLabel', 'deporte', 'musicSearch',
  // [ESF-FLASH-1] Se emite, se declara.
  // [ESF-CIERRE-LINEUP] `lineup` ya vivía aquí por el camino de festival; el
  // concierto solo aprendió a emitirlo. NO se toca la lista.
  'flashPromo', 'lineup', 'multifecha',
  // [ESF-E1a] Desde que Esferas sabe emitirlos, los GOBIERNA: si no entraran
  // aquí, `fusionarConViejo` los conservaría del index viejo y habría dos
  // fuentes para el mismo número — justo lo que esta serie viene a cerrar.
  'ride', 'sepRide',
]);

// Serializa un valor primitivo al formato del EV. null si no es serializable.
function _serializarValor(v) {
  if (typeof v === 'string') return "'" + escStr(v) + "'";
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (typeof v === 'boolean') return String(v);
  return null;
}

// Texto CRUDO del valor de una propiedad de primer nivel dentro del objeto, tal
// como está escrito en index.html. null si no la encuentra.
//
// Se preserva el TEXTO y no el valor parseado a propósito: un campo puede
// referirse a variables del index (BANCO_HEY, HOTEL_STD, PROMOS…) y al parsear
// con stubs esas referencias se vuelven {} — re-serializar el valor las
// destruiría. Copiar el texto conserva la referencia intacta.
function _valorCrudoDe(objText, key) {
  const s = String(objText);
  let inStr = false, sc = '', esc = false, brace = 0, bracket = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (ch === '\\') { esc = true; continue; } if (ch === sc) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; sc = ch; continue; }
    if (ch === '{') { brace++; continue; }
    if (ch === '}') { brace--; continue; }
    if (ch === '[') { bracket++; continue; }
    if (ch === ']') { bracket--; continue; }
    // Nivel 1 = propiedades directas del objeto-evento.
    if (brace === 1 && bracket === 0 && ch === ':') {
      let j = i - 1;
      while (j >= 0 && /\s/.test(s[j])) j--;
      let fin = j + 1;
      while (j >= 0 && /[A-Za-z0-9_$]/.test(s[j])) j--;
      const nombre = s.slice(j + 1, fin);
      if (nombre !== key) continue;
      // Valor: desde aquí hasta la coma de nivel 1 o el cierre del objeto.
      let k = i + 1;
      let b2 = 0, br2 = 0, inS2 = false, sc2 = '', esc2 = false;
      for (; k < s.length; k++) {
        const c = s[k];
        if (esc2) { esc2 = false; continue; }
        if (inS2) { if (c === '\\') { esc2 = true; continue; } if (c === sc2) inS2 = false; continue; }
        if (c === '"' || c === "'") { inS2 = true; sc2 = c; continue; }
        if (c === '{') { b2++; continue; }
        if (c === '[') { br2++; continue; }
        if (c === '}') { if (b2 === 0) break; b2--; continue; }
        if (c === ']') { br2--; continue; }
        if (c === ',' && b2 === 0 && br2 === 0) break;
      }
      return s.slice(i + 1, k).trim();
    }
  }
  return null;
}

// Referencia de banco del objeto VIEJO tal como está escrita (BANCO_DEFAULT /
// BANCO_HEY / la que sea). Se lee del TEXTO porque al parsear con stubs todos
// los bancos valen {} y son indistinguibles. null si no hay o si es un literal.
function _bancoIdentificador(objText) {
  const m = String(objText).match(/[,{]\s*banco\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)/);
  return m ? m[1] : null;
}

// [FIX] Inserta `texto` justo antes del `zonas:` DE NIVEL SUPERIOR del objeto.
// Camina el texto contando llaves/corchetes y saltándose el contenido de las
// comillas, igual que el cortador del EV: un regex no puede distinguir el
// `zonas:` de arriba del que vive dentro de `multifecha[0]`, y esa distinción
// es justo la que hacía falta.
function _insertarAntesDeZonasNivel1(objText, texto) {
  let d = 0;
  for (let i = 0; i < objText.length; i++) {
    const ch = objText[i];
    if (ch === "'") { i++; while (i < objText.length && objText[i] !== "'") { if (objText[i] === '\\') i++; i++; } continue; }
    if (ch === '{' || ch === '[') { d++; continue; }
    if (ch === '}' || ch === ']') { d--; continue; }
    // Nivel 1 = dentro del objeto del evento y fuera de todo lo demás.
    if (d === 1 && (objText[i - 1] === ',' || objText[i - 1] === '{') && objText.startsWith('zonas:', i)) {
      return objText.slice(0, i) + texto + objText.slice(i);
    }
  }
  return objText;   // no se encontró: quien llama decide (hoy, lanza)
}

// fusionarConViejo(objTextViejo, objNuevo) → objNuevo enriquecido.
// Lanza si hay un campo que se perdería y no se puede re-emitir.
function fusionarConViejo(objTextViejo, objNuevo, slug) {
  let viejo, nuevo;
  try { viejo = _parseObjeto(objTextViejo); } catch (e) {
    throw new Error(`No pude leer el evento "${slug}" que ya está en index.html (${e.message}). No se actualiza a ciegas.`);
  }
  try { nuevo = _parseObjeto(objNuevo); } catch (e) {
    throw new Error(`El objeto generado para "${slug}" no parsea (${e.message}).`);
  }
  if (!viejo || typeof viejo !== 'object') return objNuevo;

  const extras = [];
  for (const k of Object.keys(viejo)) {
    // El compilador manda sobre todo lo que administra: si lo emitió, gana su
    // versión; si NO lo emitió, es que el evento dejó de tenerlo.
    if (CAMPOS_DEL_COMPILADOR.has(k)) continue;
    if (Object.prototype.hasOwnProperty.call(nuevo, k)) continue;
    if (!IDENT_RE.test(k)) {
      throw new Error(`El evento "${slug}" trae la propiedad "${k}", que no puedo re-emitir. Edita index.html a mano.`);
    }
    // Preferimos SIEMPRE el texto original (conserva referencias a variables
    // como BANCO_HEY o PROMOS). Solo si no se puede localizar, se re-serializa
    // el valor primitivo. Si ninguna vía funciona, se rehúsa el update: jamás
    // publicar perdiendo un campo en silencio.
    const crudo = _valorCrudoDe(objTextViejo, k);
    const ser = (crudo != null && crudo !== '') ? crudo : _serializarValor(viejo[k]);
    if (ser == null) {
      throw new Error(
        `No puedo actualizar "${slug}" sin perder el campo "${k}" (${Array.isArray(viejo[k]) ? 'lista' : typeof viejo[k]}), ` +
        'que el capturador de Esferas no maneja. Quítalo de index.html o edita ese evento a mano.'
      );
    }
    extras.push(k + ':' + ser);
  }

  // Banco: si el viejo apuntaba a otra referencia, se respeta.
  //
  // [ESF-E1g] Desde que `banco` es opcional hay DOS casos, y antes solo existía
  // uno. Si el objeto nuevo ya trae un banco, se sustituye como siempre. Si NO
  // lo trae —porque la esfera no tiene el dato— se INSERTA el viejo: dejar de
  // emitirlo no puede significar borrárselo a los 90 eventos que sí lo tienen.
  // Sin esta rama, republicar acdc/soad/harry TRONABA.
  const bancoViejo = _bancoIdentificador(objTextViejo);
  let salida = objNuevo;
  if (bancoViejo) {
    const bancoNuevo = _bancoIdentificador(objNuevo);
    if (bancoNuevo == null) {
      // ⚠️ [FIX] Se inserta antes de `zonas:` DEL NIVEL SUPERIOR. Un `replace`
      // sobre el primer `,zonas:` que aparezca es incorrecto: en un evento
      // multifecha el primero vive DENTRO de `multifecha[0]`, y el banco acaba
      // metido en la primera noche. Pasó de verdad —weeknd, bts y alvarodiaz
      // salieron publicados con `multifecha[0].banco` y SIN banco de nivel
      // superior— y los tres dejaron de ser gobernables.
      const antes = salida;
      salida = _insertarAntesDeZonasNivel1(salida, 'banco:' + bancoViejo + ',');
      if (salida === antes) {
        throw new Error(`No pude conservar el banco (${bancoViejo}) de "${slug}". No se actualiza a ciegas.`);
      }
    } else if (bancoNuevo !== bancoViejo && bancoViejo !== 'BANCO_DEFAULT') {
      const antes = salida;
      salida = salida.replace(/([,{])banco:[A-Za-z_$][A-Za-z0-9_$]*/, '$1banco:' + bancoViejo);
      if (salida === antes) {
        throw new Error(`No pude conservar el banco (${bancoViejo}) de "${slug}". No se actualiza a ciegas.`);
      }
    }
  }

  if (!extras.length) return salida;
  // Se inyectan antes de la llave de cierre (el objeto generado SIEMPRE cierra en '}').
  if (!salida.endsWith('}')) throw new Error(`Objeto generado con forma inesperada para "${slug}".`);
  return salida.slice(0, -1) + ',' + extras.join(',') + '}';
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
  const slugsVistos = new Set(); // 🔒 AUD-1: un slug repetido en el lote se
                                 // insertaría/actualizaría dos veces.
  for (const esf of (Array.isArray(esferas) ? esferas : [])) {
    if (!esf || !esf.slug) continue;
    const slug = String(esf.slug);
    if (slugsVistos.has(slug)) {
      throw new Error(`El slug "${slug}" viene repetido en el lote — cada evento se publica una sola vez.`);
    }
    slugsVistos.add(slug);
    let obj = generarObj(esf, hoy);
    if (idsAntes.has(slug)) {
      // 🔒 AUD-1: fusionar con lo que ya vive en index.html (banco, ride,
      // rideOnly, waChannel… que el capturador no maneja) en vez de sustituir.
      const loc = _localizarObjeto(content, slug);
      if (!loc) {
        throw new Error(`El evento "${slug}" aparece en el EV pero no pude localizar su objeto para actualizarlo.`);
      }
      obj = fusionarConViejo(content.slice(loc.start, loc.end), obj, slug);
      aActualizar.push({ slug, obj });
    } else {
      aInsertar.push({ slug, obj });
    }
  }

  // Primero reemplaza los existentes EN SU LUGAR (balanceo, sin tocar comas
  // vecinas), luego inserta los nuevos tras `var EV=[` (marcador intacto).
  let contenidoNuevo = content;
  for (const it of aActualizar) {
    contenidoNuevo = reemplazarEnEV(contenidoNuevo, it.slug, it.obj);
  }
  if (aInsertar.length > 0) {
    const bloque = aInsertar.map(x => x.obj).join(',\n  ');
    // 🔒 AUD-1: reemplazo por FUNCIÓN. Con un string, '$&' y '$$' dentro del
    // texto capturado (un nombre de evento, una nota) se interpretan como
    // patrones de sustitución y el HTML sale distinto de lo que se capturó.
    contenidoNuevo = contenidoNuevo.replace('var EV=[', () => 'var EV=[\n  ' + bloque + ',');
  }

  // 🔒 AUD-1: el update NO puede fallar en silencio. reemplazarEnEV devuelve el
  // contenido intacto si no localizó el objeto; antes eso pasaba como éxito
  // porque la validación solo comprobaba que el slug existiera (y existía: el
  // viejo). Ahora se exige que el objeto que quedó en el archivo sea EXACTAMENTE
  // el que compilamos.
  for (const it of aActualizar) {
    const loc = _localizarObjeto(contenidoNuevo, it.slug);
    if (!loc) {
      throw new Error(`Actualización fallida: "${it.slug}" ya no se localiza en el EV tras el reemplazo.`);
    }
    if (contenidoNuevo.slice(loc.start, loc.end) !== it.obj) {
      throw new Error(`Actualización fallida: el evento "${it.slug}" quedó con el contenido VIEJO — no se aplicó el reemplazo.`);
    }
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
  // HOTEL_MTY incluida: un evento del EV puede referenciarla y sin el stub la
  // validación entera reventaría con ReferenceError.
  const stubs = 'var BANCO_DEFAULT={},BANCO_HEY={},HOTEL_CDM=[],HOTEL_STD=[],HOTEL_MTY=[];';
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

// [WL-1] La fecha COMO SE VA A VER en el catálogo, para quien necesita
// imprimirla SIN leer el index desplegado — que al publicar todavía es el
// viejo. Es la misma cuenta que hacen generarObj y generarObjFestival para su
// campo `f` (idéntica en las dos: dedupe de fecha_inicio + fechas_extra,
// ordenar, y multi si son 2 o más). No se copia el resultado de nadie: el arnés
// de WL-1 la carea contra el objeto REALMENTE compilado, evento por evento, así
// que si algún día divergen, truena en vez de mentir en un correo.
// ═══ [ESF-CIERRE-FECHA] LOS EVENTOS DE CORRIDO ════════════════════════════
// Ocho eventos traían sus días SOLO en el texto de `f` —"20, 21 y 22 nov
// 2026"— sin `dsList` que los respaldara. El compilador solo veía `ds` y
// generaba "20 nov 2026": un festival de tres días anunciado como de uno.
//
// SON DE CORRIDO, NO DE ESCOGER DÍA: se va a los tres, no se elige uno. Por eso
// se modelan como RANGO (inicio + fin) y NO como multifecha — un selector de
// noche aquí sería una pregunta que el cliente no tiene que contestar.
//
// ⚠️ `fecha_fin` NO emite `dsList`. Es la diferencia entre "el evento dura tres
// días" y "elige uno de tres", y el catálogo distingue las dos: dsList es de los
// que se eligen.
//
// MEDIDO CONTRA LOS 8 REALES: el rango reproduce SEIS. Los otros dos no son
// fallas del modelo, son otra cosa:
//   · harry  "1, 7 y 8 ago 2026" — NO es un rango: son días SUELTOS. De los que
//     se eligen, no de corrido. (Y ya pasó: entra por archivo.)
//   · warped "12-13 sep 2026"   — es un rango, pero escrito con GUION en vez
//     de "y". El formato del catálogo no es uno solo.
// Para esos dos existe `f_texto`: un override que gana sobre todo. No es una
// grieta del diseño — es el reconocimiento de que `f` es TEXTO PARA UN HUMANO y
// alguna vez va a decir algo que ninguna regla genera.
function _diasDelRango(ini, fin) {
  if (!FECHA_RE.test(ini || '') || !FECHA_RE.test(fin || '')) return [];
  if (fin < ini) return [];
  const out = [];
  const d = new Date(ini + 'T12:00:00Z');
  const tope = new Date(fin + 'T12:00:00Z');
  // Tope de cordura: un "rango" de más de 60 días es un dedazo, no un festival.
  while (d <= tope && out.length < 60) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

function fechaDisplayDeEsfera(esfera) {
  // El override gana sobre todo: si alguien lo escribió, es porque ninguna regla
  // daba con lo que el cartel dice.
  const libre = (esfera && typeof esfera.f_texto === 'string') ? esfera.f_texto.trim() : '';
  if (libre) return libre;

  const fi = (esfera && esfera.fecha_inicio) || null;
  const ds = fi ? String(fi).slice(0, 10) : '';

  // El RANGO: de corrido, sin selector de día.
  const rango = _diasDelRango(ds, (esfera && esfera.fecha_fin) ? String(esfera.fecha_fin).slice(0, 10) : '');
  if (rango.length >= 2) return fDisplayMulti(rango);

  const fechas = [];
  const vistas = new Set();
  for (const d of [ds].concat(parseFechasExtra(esfera && esfera.fechas_extra))) {
    if (FECHA_RE.test(d) && !vistas.has(d)) { vistas.add(d); fechas.push(d); }
  }
  fechas.sort();
  const dsFinal = fechas.length ? fechas[0] : ds;
  return (fechas.length >= 2) ? fDisplayMulti(fechas) : fDisplay(dsFinal || fi);
}

module.exports = {
  compilarEV, quitarDelEV, reemplazarEnEV, todayMx, fechaDisplayDeEsfera,
  bancoValido, BANCOS_VALIDOS, _insertarAntesDeZonasNivel1, _parseFlashPromo: parseFlashPromo,
  _diasDelRango,
  // Helpers puros expuestos para el arnés (patrón de la casa).
  _escStr: escStr,
  _parseZonas: parseZonas,
  fechaAbsurda, ANIO_MIN, ANIO_MAX,
  _parseCheapZonas: parseCheapZonas,
  _parseMultifecha: parseMultifecha,
  _generarObj: generarObj,
  _fusionarConViejo: fusionarConViejo,
  _extraerEVKamehouse: extraerEVKamehouse,
  _extraerEVPortal: extraerEVPortal,
};
