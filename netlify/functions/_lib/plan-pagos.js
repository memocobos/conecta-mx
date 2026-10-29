// =============================================================================
// _lib/plan-pagos  —  EL DUEÑO DE «CUÁNDO TE TOCA PAGAR» (PLAN-PAGOS-1a)
// =============================================================================
// La fórmula de las quincenas de la casa —ventanas 9-16 y 24-1, margen de 5 días
// antes del evento, tope de 10 pagos (4 en CHEAP)— vivía en TRES copias que no se
// pueden importar entre sí: `getQuincenas` de rol.html, su gemela de index.html y
// `_spGetQuincenas` de kamehouse.js. Medido el 28-oct: sus BYTES difieren (sha1
// 1656f00d / bc2434c6 / 37285878) y su SALIDA coincide — o sea, tres listas que
// todavía no divergen. Cuando el Portal entró de cuarto lector, la opción honesta
// era darle un dueño en vez de una cuarta copia.
//
// 🔒 ESTA LIB NO ES UNA REIMPLEMENTACIÓN: es la de rol.html, que es el canon
// declarado (lo dice el propio comentario de index.html: «EL CANON ES LA FIRMA DE
// rol.html»), copiada con su lógica intacta y su reloj vuelto INYECTABLE. El careo
// `mide:plan-pagos-1` la carea contra las TRES copias vivas sobre casos reales: el
// día que alguien mueva una y no las otras, suena aquí.
//
// ⚠️ LAS TRES COPIAS DEL NAVEGADOR SIGUEN VIVAS Y NO SE TOCAN. index.html y
// rol.html son páginas sin bundler (no pueden `require`) y kamehouse.js tampoco.
// Unificarlas de verdad es otra tuerca; lo que esta lib compra hoy es que el
// CUARTO lector —el servidor— no estrene una cuarta.
//
// ── LO QUE SE MIDIÓ ANTES DE DISEÑAR, Y CAMBIÓ LA FORMA ─────────────────────
// La pregunta natural era «armemos el calendario desde que apartó, y marquemos lo
// ya pagado». NO SE PUEDE, y no es opinión:
//   · `viajeros_evento.creado_en` de los migrados es el **28-ago-2026** para todos
//     — la fecha de la MIGRACIÓN, no la de su separo.
//   · el primer abono de los migrados es del **20-sep-2026** — la fecha de la
//     primera COSECHA del careo, no la de su pago.
//   · y **1,049 de 1,632 filas con correo no tienen UN SOLO abono con fecha**: su
//     dinero entero vive en `abonado_previo`, que no tiene columna de fecha.
// O sea que para dos de cada tres clientes el pasado de su plan NO EXISTE en la
// base. Un calendario «desde el separo» sería una fecha inventada sobre dinero.
//
// 🔒 POR ESO EL PLAN ES HACIA ADELANTE: las quincenas que QUEDAN entre hoy y el
// evento, con `resta` repartida entre ellas. El pasado se cuenta con lo que sí es
// verdad —cuánto lleva abonado y, cuando los hay, sus abonos con su fecha— y nunca
// se dibuja una cuota vieja que nadie puede confirmar.
//
// Y con `from = hoy` la fórmula HACE SOLA lo correcto: su `cutoff` (from + 5 días)
// deja fuera las ventanas ya pasadas y la que arranca pasado mañana. No hubo que
// tocarle una línea para que sirviera a este lector.
//
// Exporta:
//   MESES                                   — el mapa de rol/index, para el rótulo
//   quincenasEntre(from, until, max, diasAntes) → [{lbl, d, e}]
//   hoyReynosa(ahora)                       → Date a mediodía del día de Reynosa
//   dsDeEvento(ev, eventoId)                → el `ds` de ESA fecha (slug#N)
//   planDelViaje({...})                     → { estado, resta, cuotas, proxima, … }
// =============================================================================

// Copiado de index.html (`var MESES=…`, línea 2989). rol.html lo recibe del index.
const MESES = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
  '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
};

// El margen por default cuando el evento no trae `diasAntes`. [COT-NORMA-2]
const DIAS_ANTES_DEFAULT = 5;
// El buffer del separo: no se cobra la quincena que arranca dentro de 5 días.
const BUFFER_SEPARO_DIAS = 5;
// Tope de pagos por paquete. [rol.html: maxPagos=(pkg==='cheap')?4:10]
const MAX_PAGOS = { cheap: 4, otros: 10 };

// ── [COT-NORMA-2] El rótulo dice la ventana REAL, ya recortada al margen. Con un
// solo día («9 al 9») se lee mal, así que se dice «el 9 de Septiembre».
function _lblVentana(ini, fin, mesIni, mesFin) {
  if (ini.getDate() === fin.getDate() && ini.getMonth() === fin.getMonth()) return 'el ' + ini.getDate() + ' de ' + mesIni;
  if (ini.getMonth() === fin.getMonth()) return ini.getDate() + ' al ' + fin.getDate() + ' de ' + mesIni;
  return ini.getDate() + ' ' + mesIni + ' al ' + fin.getDate() + ' de ' + mesFin;
}

// ── LA FÓRMULA. Copia de `getQuincenas` de rol.html (líneas 3004-3051), con su
// lógica intacta. Lo único que cambia es que `MESES` viene del módulo en vez de
// un global del navegador.
function quincenasEntre(from, until, max, diasAntes) {
  if (!(from instanceof Date) || !(until instanceof Date)) return [];
  if (!isFinite(from.getTime()) || !isFinite(until.getTime())) return [];
  const topeN = (max != null && isFinite(max)) ? Number(max) : MAX_PAGOS.otros;
  if (topeN <= 0) return [];
  const dias = (diasAntes != null && isFinite(diasAntes)) ? Number(diasAntes) : DIAS_ANTES_DEFAULT;
  const result = [];
  const capped = new Date(until.getTime() - dias * 24 * 3600 * 1000);
  const cutoff = new Date(from.getTime() + BUFFER_SEPARO_DIAS * 24 * 3600 * 1000);
  const d = new Date(from); d.setDate(1);
  // Guarda de cordura del bucle: la fórmula del navegador avanza mes a mes sin
  // tope propio porque `capped` siempre está cerca; aquí puede llegar un `until`
  // disparatado desde un dato malo y no se vale colgar una function.
  let vueltas = 0;
  while (d <= capped && result.length < topeN && vueltas++ < 600) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const q1s = new Date(d.getFullYear(), d.getMonth(), 9);
    const q1e = new Date(d.getFullYear(), d.getMonth(), 16);
    if (q1s > cutoff && q1s <= capped) {
      const q1f = (q1e > capped) ? capped : q1e;
      result.push({ lbl: _lblVentana(q1s, q1f, MESES[mm] || '', MESES[mm] || ''), d: q1s, e: q1f });
    }
    const q2s = new Date(d.getFullYear(), d.getMonth(), 24);
    const q2e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    if (q2s > cutoff && q2s <= capped) {
      const q2f = (q2e > capped) ? capped : q2e;
      const mn = String((d.getMonth() + 2 > 12 ? 1 : d.getMonth() + 2)).padStart(2, '0');
      result.push({ lbl: _lblVentana(q2s, q2f, MESES[mm] || '', MESES[mn] || ''), d: q2s, e: q2f });
    }
    d.setMonth(d.getMonth() + 1);
  }
  return result.slice(0, topeN);
}

// ── «HOY» ES EL DÍA DE REYNOSA, NO EL DE GREENWICH ──────────────────────────
// 🔒 La ley de `toISOString()`: en Netlify el reloj va en UTC, así que a las 7 de
// la tarde de Reynosa allá ya es mañana — y el calendario del cliente se correría
// un día. Se deriva el día en `America/Matamoros` (que SÍ cambia con EE.UU.) y se
// construye a MEDIODÍA local del proceso, que es como el resto de la casa arma
// fechas de calendario (`new Date(ds+'T12:00:00')`): a mediodía ningún corrimiento
// de huso cruza la medianoche.
function hoyReynosa(ahora) {
  const base = (ahora instanceof Date && isFinite(ahora.getTime())) ? ahora : new Date();
  let y, m, d;
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Matamoros', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(base).split('-');
    y = Number(p[0]); m = Number(p[1]); d = Number(p[2]);
  } catch (e) {
    y = base.getFullYear(); m = base.getMonth() + 1; d = base.getDate();
  }
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

// ── EL `ds` DE **ESA** FECHA, no el del evento ──────────────────────────────
// Misma precedencia que rol.html (`dsList[fi] || multifecha[fi].ds || ev.ds`) y que
// kamehouse.js:8948. El índice sale del `slug#N` del viajero.
// 🔒 Un `#N` que la ficha no tiene devuelve null, NO el `ds` del evento: ofrecerle
// el calendario de otra fecha es peor que no ofrecerle ninguno.
function dsDeEvento(ev, eventoId) {
  if (!ev) return null;
  const m = /#(\d+)$/.exec(String(eventoId == null ? '' : eventoId));
  if (m) {
    const i = Number(m[1]);
    const porLista = Array.isArray(ev.dsList) ? ev.dsList[i] : null;
    if (porLista) return String(porLista);
    const mf = Array.isArray(ev.multifecha) ? ev.multifecha[i] : null;
    if (mf && mf.ds) return String(mf.ds);
    // Un evento sin multifecha que igual trae `#0` es el caso de las fichas que
    // nacieron con índice y nunca lo usaron: su única fecha es la del evento.
    if (i === 0 && !Array.isArray(ev.multifecha) && !Array.isArray(ev.dsList)) {
      return ev.ds ? String(ev.ds) : null;
    }
    return null;
  }
  return ev.ds ? String(ev.ds) : null;
}

function _num(x) { const n = Number(x); return isFinite(n) ? n : null; }

// ── EL PLAN DE UN VIAJE ─────────────────────────────────────────────────────
// Entra: { total, abonado, ds, paquete, diasAntes, ahora }
// Sale:  { estado, resta, cuotas:[{lbl, fecha, monto}], proxima, dias_evento }
//
// Los estados son SEIS y cada uno dice una cosa distinta — aplastarlos en «no hay
// plan» es justo lo que esta casa llama un cero falso:
//   'sin_total'      → la fila no trae total: no se sabe cuánto debe (≠ debe $0)
//   'liquidado'      → ya pagó todo: no hay nada que calendarizar
//   'sin_fecha'      → el catálogo no sabe cuándo es su fecha
//   'evento_pasado'  → el viaje ya ocurrió
//   'liquidar'       → debe, pero ya no caben quincenas antes del margen
//   'calendario'     → el caso normal: aquí vienen las cuotas
function planDelViaje(opt) {
  const o = opt || {};
  const total = _num(o.total);
  const abonado = _num(o.abonado) || 0;
  if (total == null || total <= 0) return { estado: 'sin_total', resta: null, cuotas: [] };

  const resta = Math.round((total - abonado) * 100) / 100;
  if (resta <= 0) return { estado: 'liquidado', resta: 0, cuotas: [] };

  const ds = o.ds ? String(o.ds) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return { estado: 'sin_fecha', resta, cuotas: [] };
  const eventDate = new Date(ds + 'T12:00:00');
  if (!isFinite(eventDate.getTime())) return { estado: 'sin_fecha', resta, cuotas: [] };

  const hoy = hoyReynosa(o.ahora);
  const diasEvento = Math.round((eventDate.getTime() - hoy.getTime()) / 864e5);
  if (diasEvento < 0) return { estado: 'evento_pasado', resta, cuotas: [], dias_evento: diasEvento };

  const paq = String(o.paquete == null ? '' : o.paquete).trim().toLowerCase();
  const max = (paq === 'cheap') ? MAX_PAGOS.cheap : MAX_PAGOS.otros;

  let qs = quincenasEntre(hoy, eventDate, max, o.diasAntes);
  // [COT-FIX-4] No puede haber más pagos que pesos: con el resto por debajo del
  // número de quincenas, el ajuste del último renglón lo dejaría en NEGATIVO.
  if (qs.length > resta && resta > 0) qs = qs.slice(0, Math.max(1, Math.floor(resta)));

  if (!qs.length) {
    // Debe dinero y ya no caben quincenas: su pago es antes del evento. Es la
    // fila `liq` de rol.html (`buildRows`), con el mismo nombre.
    return {
      estado: 'liquidar', resta, dias_evento: diasEvento,
      cuotas: [{ lbl: 'Antes del evento', fecha: ds, monto: resta, n: 1 }],
      proxima: { lbl: 'Antes del evento', fecha: ds, monto: resta, n: 1 },
    };
  }

  const pagoQ = Math.ceil(resta / qs.length);
  let acc = 0;
  const cuotas = qs.map((q, i) => {
    const monto = (i === qs.length - 1) ? Math.round((resta - acc) * 100) / 100 : pagoQ;
    acc += monto;
    return {
      n: i + 1,
      lbl: q.lbl,
      // Fecha en que ABRE la ventana, en 'YYYY-MM-DD' (la que el Portal pinta).
      fecha: q.d.getFullYear() + '-' + String(q.d.getMonth() + 1).padStart(2, '0') + '-' + String(q.d.getDate()).padStart(2, '0'),
      hasta: q.e.getFullYear() + '-' + String(q.e.getMonth() + 1).padStart(2, '0') + '-' + String(q.e.getDate()).padStart(2, '0'),
      monto,
    };
  });

  return { estado: 'calendario', resta, cuotas, proxima: cuotas[0] || null, dias_evento: diasEvento };
}

module.exports = {
  MESES, DIAS_ANTES_DEFAULT, BUFFER_SEPARO_DIAS, MAX_PAGOS,
  quincenasEntre, hoyReynosa, dsDeEvento, planDelViaje,
  _lblVentana,
};
