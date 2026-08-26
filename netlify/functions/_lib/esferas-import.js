// =============================================================================
// _lib/esferas-import.js — EL IMPORTADOR: del `index.html` a Esferas.
//
// [ESF-E2] Memo decidió que TODOS los eventos vivan en Esferas y él los gobierne
// solo. Este lib hace la mitad difícil: leer el `EV` del index, proponer la fila
// `esferas_eventos` que lo describiría, y —lo importante— DECIDIR SI ESE EVENTO
// SE PUEDE GOBERNAR SIN PERDER NADA.
//
// ⚠️ EL CANDADO INNEGOCIABLE. Un evento solo se vuelve gobernable si el
// compilador, alimentado con la fila propuesta, **reproduce sus valores**. Si
// pierde uno solo, va a la lista de brechas y se queda a mano. Sin este candado,
// importar sería sobrescribir eventos buenos con versiones degradadas — y es
// exactamente lo que estuvo a punto de pasar: el careo destapó que `zonas[].vip`
// (131 zonas), `ride` (68 eventos), `cheapZonas` divergentes (14) y la multifecha
// de 8 conciertos se perdían EN SILENCIO, porque `fusionarConViejo` protege
// campos de PRIMER NIVEL y todos ésos viven dentro de campos que el compilador
// dice gobernar.
//
// EL JUEZ ES SEMÁNTICO, NO DE BYTES (ratificado por Memo). Se comparan los
// VALORES a cualquier profundidad; el ORDEN de las claves no cuenta, porque
// publicar reescribe la entrada en orden canónico — que es lo que ya pasa con
// los eventos gobernados hoy. Un evento que solo difiere en el orden SÍ es
// gobernable.
// =============================================================================

const { _generarObj: generarObj, todayMx } = require('./esferas-compile');

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Cortar el array EV en objetos, por balance de llaves ─────────────────────
// Ignora el contenido de las cadenas. NO se usa un regex: un `}` dentro de un
// nombre de zona partiría el objeto por la mitad.
function objetosDelEV(indexHtml) {
  const i = indexHtml.indexOf('var EV=[');
  if (i < 0) return { error: 'no encontré `var EV=[` en el index' };
  const fin = indexHtml.indexOf('\n', indexHtml.indexOf('];', i));
  const bloque = indexHtml.slice(i, fin);
  const out = [];
  let k = 0;
  for (;;) {
    k = bloque.indexOf("{id:'", k);
    if (k < 0) break;
    let d = 0, e = k;
    while (e < bloque.length) {
      const ch = bloque[e];
      if (ch === "'") { e++; while (e < bloque.length && bloque[e] !== "'") { if (bloque[e] === '\\') e++; e++; } }
      else if (ch === '{') d++;
      else if (ch === '}') { d--; if (d === 0) break; }
      e++;
    }
    out.push(bloque.slice(k, e + 1));
    k = e + 1;
  }
  return { textos: out };
}

// Evalúa los objetos con las constantes del index como stubs. Las referencias a
// `BANCO_HEY` y `PROMOS` se conservan como texto en el objeto original, así que
// aquí solo hacen falta para que el `new Function` no truene.
function evaluar(textos) {
  try {
    return { evs: new Function('BANCO_DEFAULT', 'BANCO_HEY', 'PROMOS', 'HOTEL_CDM', 'HOTEL_MTY',
      'return [' + textos.join(',') + ']')('BANCO_DEFAULT', 'BANCO_HEY', {}, {}, {}) };
  } catch (e) { return { error: 'el EV no evalúa: ' + e.message }; }
}

// ── EV → la fila de Esferas ─────────────────────────────────────────────────
// Es el corazón del importador. Cada campo sale de donde vive HOY en el evento;
// nada se inventa, y lo que no se sabe expresar simplemente no viaja (y el juez
// lo caza).
function evAEsfera(ev) {
  const cheapPorNombre = {};
  (ev.cheapZonas || []).forEach((z) => { if (z && z.n != null) cheapPorNombre[String(z.n).trim()] = z; });
  const zonas = (ev.zonas || []).filter((z) => z && z.n != null).map((z) => {
    const cz = cheapPorNombre[String(z.n).trim()];
    return {
      n: z.n, p: Number(z.p) || 0,
      pc: (cz && !cz.ag && Number(cz.p) > 0) ? Number(cz.p) : 0,
      ag: z.ag ? 1 : 0, prox: z.prox ? 1 : 0, vip: z.vip ? 1 : 0,
    };
  });
  // La lista CHEAP viaja ENTERA, no como reflejo: desde ESF-E1c es su propia
  // lista y el catálogo tiene 14 eventos donde diverge de verdad.
  const cheap = (ev.cheapZonas || []).filter((z) => z && z.n != null).map((z) => {
    const o = { n: z.n, p: Number(z.p) || 0, ag: z.ag ? 1 : 0, prox: z.prox ? 1 : 0, vip: z.vip ? 1 : 0 };
    if (z.sepEspecial != null) o.sepEspecial = z.sepEspecial;
    if (z.requiereViajeros != null) o.requiereViajeros = z.requiereViajeros;
    return o;
  });
  // La multifecha de CONCIERTO. La de festival —con `noches`/`hotel` por
  // entrada— no entra aquí: ésa se captura como festival.
  const mfConcierto = Array.isArray(ev.multifecha) && ev.multifecha.length
    && !ev.multifecha.some((f) => f && (f.noches != null || f.hotel));
  return {
    // [ESF-E1g] El banco viaja con el evento. `evaluar()` ata BANCO_DEFAULT y
    // BANCO_HEY a sus NOMBRES (strings), no a {}, así que aquí `ev.banco` ya es
    // el identificador — que es justo lo que hay que guardar para re-emitirlo.
    // Ausente = el evento no dice banco, y así se queda.
    banco: (typeof ev.banco === 'string' && ev.banco) ? ev.banco : null,
    // [ESF-CAMPOS-1] Los tres viajan con el evento al importarlo.
    // [ESF-FLASH-1] El código flash viaja entero. Se serializa aquí y el
    // compilador lo vuelve a parsear: una sola forma de leerlo.
    flash_promo: (ev.flashPromo && typeof ev.flashPromo === 'object') ? JSON.stringify(ev.flashPromo) : null,
    // [ESF-CIERRE-LINEUP] La llave o la URL del cartel, tal cual viene.
    lineup: (typeof ev.lineup === 'string' && ev.lineup.trim()) ? ev.lineup.trim() : null,
    // [ESF-CIERRE-FECHA] El EV no tiene `fecha_fin`: sus días viven en el texto
    // de `f`. Al importar se guarda ese texto COMO OVERRIDE —es la única forma
    // de reproducirlo sin adivinar— y Memo puede cambiarlo a rango después,
    // que es más honesto que un texto suelto.
    fecha_fin: null,
    f_texto: (typeof ev.f === 'string' && ev.f.trim()) ? ev.f.trim() : null,
    promo: ev.promo === true,
    promo_code: (typeof ev.promoCode === 'string' && ev.promoCode.trim()) ? ev.promoCode.trim() : null,
    promo_label: (typeof ev.promoLabel === 'string' && ev.promoLabel.trim()) ? ev.promoLabel.trim() : null,
    deporte: !!ev.deporte,
    music_search: (typeof ev.musicSearch === 'string' && ev.musicSearch.trim()) ? ev.musicSearch.trim() : null,
    slug: ev.id,
    nombre: (ev.img && ev.img !== false) ? ev.img : (ev.a || ev.id),
    titulo: ev.a || '',
    status: ev.st || '',
    ciudad: ev.cdmx ? 'CDMX' : 'MTY',
    fecha_inicio: FECHA_RE.test(ev.ds || '') ? ev.ds : null,
    fechas_extra: JSON.stringify((ev.dsList || []).slice(1)),
    created_at: FECHA_RE.test(ev.added || '') ? ev.added : null,
    music: ev.music || '',
    color: ev.c || 'azul',
    venue: ev.v || '',
    mapa: (typeof ev.mapa === 'string') ? ev.mapa : '',
    inc: JSON.stringify(ev.inc || []),
    sep: (ev.sep != null) ? ev.sep : null,
    sep_cheap: (ev.sepCheap != null) ? ev.sepCheap : null,
    nota: ev.nota || '',
    foto: ev.staticImg || '',
    zonas: JSON.stringify(zonas),
    cheap_zonas: ev.cheapZonas ? JSON.stringify(cheap) : '',
    hotel: (Array.isArray(ev.hotel) && ev.hotel.length)
      ? JSON.stringify({ custom: true, pp: !!ev.hotelPP, override: !!ev.hotelOverride,
          items: ev.hotel.map((r) => ({ n: r.n, e: r.e, viaj: r.viaj })) })
      : '',
    multifecha: mfConcierto ? JSON.stringify(ev.multifecha) : '',
    ride: (ev.ride != null) ? ev.ride : null,
    sep_ride: (ev.sepRide != null) ? ev.sepRide : null,
    ride_only: !!ev.rideOnly, cheap_only: !!ev.cheapOnly,
    no_stay: !!ev.noStay, no_cheap: !!ev.noCheap, no_bus: !!ev.noBus,
    cheap_soon: !!ev.cheapSoon, cheap_also_ok: !!ev.cheapAlsoOk,
    festival: '', pagos: '',
  };
}

// ── El juez semántico ───────────────────────────────────────────────────────
// Aplana el objeto a rutas → valor y compara. El ORDEN de las claves no aparece
// en esta representación, que es justo el punto.
function aplanar(o, pre, out) {
  out = out || {}; pre = pre || '';
  if (o === null || typeof o !== 'object') { out[pre] = o; return out; }
  if (Array.isArray(o)) { o.forEach((v, k) => aplanar(v, pre + '[' + k + ']', out)); return out; }
  Object.keys(o).forEach((k) => aplanar(o[k], pre ? pre + '.' + k : k, out));
  return out;
}

function juzgar(textoViejo, textoNuevo) {
  const ev = (t) => new Function('BANCO_DEFAULT', 'BANCO_HEY', 'PROMOS', 'HOTEL_CDM', 'HOTEL_MTY', 'return ' + t)
    ('BANCO_DEFAULT', 'BANCO_HEY', {}, {}, {});
  let a, b;
  try { a = aplanar(ev(textoViejo)); b = aplanar(ev(textoNuevo)); }
  catch (e) { return { ok: false, motivo: 'no pude comparar: ' + e.message, brechas: [] }; }
  const brechas = [];
  Object.keys(a).forEach((k) => {
    if (!(k in b)) brechas.push({ campo: k, que: 'se pierde', tenia: a[k] });
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) brechas.push({ campo: k, que: 'cambia', tenia: a[k], quedaria: b[k] });
  });
  Object.keys(b).forEach((k) => { if (!(k in a)) brechas.push({ campo: k, que: 'se inventa', quedaria: b[k] }); });
  return { ok: brechas.length === 0, brechas };
}

// ── La API: diagnosticar el catálogo entero ─────────────────────────────────
// PURA: no escribe nada. Devuelve qué se puede gobernar y, para el resto, QUÉ
// se perdería — que es la lista de brechas viva que pidió Memo.
function diagnosticar({ indexHtml, hoy }) {
  const corte = objetosDelEV(indexHtml);
  if (corte.error) return corte;
  const ev = evaluar(corte.textos);
  if (ev.error) return ev;
  const dia = hoy || todayMx();
  const gobernables = [], conBrecha = [];
  corte.textos.forEach((t, i) => {
    const e = ev.evs[i];
    if (!e || !e.id) return;
    const fila = evAEsfera(e);
    let generado;
    try { generado = generarObj(fila, dia); }
    // [ESF-ARCHIVO-1] La fila viaja TAMBIÉN en los con-brecha: el archivo los
    // siembra sin pasar el juez, y sin la fila no habría qué sembrar. Que no
    // pase el juez no significa que no se pueda guardar — significa que no se
    // puede PUBLICAR, y de eso se encarga el veto.
    catch (err) { conBrecha.push({ slug: e.id, fila, motivo: 'el compilador no pudo: ' + err.message, brechas: [] }); return; }
    const v = juzgar(t, generado);
    if (v.ok) gobernables.push({ slug: e.id, fila, byteIgual: generado === t });
    else conBrecha.push({ slug: e.id, fila, motivo: v.motivo || null, brechas: v.brechas });
  });
  return { gobernables, conBrecha, total: gobernables.length + conBrecha.length };
}

// ═══ [ESF-LISTA-1] ¿ESTE EVENTO YA PASÓ? ═══════════════════════════════════
// Un evento pasado no se gobierna: se recuerda. No tiene sentido traerlo a
// Esferas para poder agotarle una zona.
//
// ⚠️ LA REGLA ES UNA SOLA Y ES LA DE ORD-1: manda la PRIMERA fecha, igual que
// `_evFechaOrden` en el navegador. No porque sea obviamente la mejor, sino
// porque el filtro de la lista y este candado tienen que estar de acuerdo: dos
// definiciones de "pasado" en la misma tuerca es la divergencia que UTIL-C
// destapó cinco veces.
//
// EL FILO, DICHO: un evento de varias noches cuya PRIMERA ya pasó cuenta como
// pasado aunque le queden noches vendiendo. Medido sobre el catálogo del
// 25-ago-2026: 102 objetos, 56 próximos, 42 pasados, 4 sin fecha, y NINGUNO
// partido por hoy — hoy las dos lecturas coinciden. Si algún día uno se parte,
// se cambia AQUÍ y en `_evFechaOrden`, juntas.
//
// Sin fecha NO es pasado: un evento por confirmar está pendiente, no es
// historia.
function fechasDeFila(fila) {
  const f = [];
  const add = (v) => { if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) f.push(v.trim()); };
  if (fila) {
    add(fila.fecha_inicio);
    let ex = fila.fechas_extra;
    if (typeof ex === 'string') { try { ex = JSON.parse(ex); } catch (_) { ex = null; } }
    if (Array.isArray(ex)) ex.forEach(add);
    let mf = fila.multifecha;
    if (typeof mf === 'string') { try { mf = JSON.parse(mf); } catch (_) { mf = null; } }
    if (Array.isArray(mf)) mf.forEach((m) => add(m && m.ds));
  }
  return f.sort();
}

function esPasadoFila(fila, dia) {
  const f = fechasDeFila(fila);
  if (!f.length) return false;
  return f[0] < (dia || todayMx());
}

module.exports = { diagnosticar, evAEsfera, juzgar, esPasadoFila, fechasDeFila, _objetosDelEV: objetosDelEV, _aplanar: aplanar };
