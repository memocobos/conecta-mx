// =============================================================================
// admin-cotizador.js — [COTIZA-VEND-1 · 30-oct-2026] EL COTIZADOR DE VENDEDOR
// =============================================================================
// Palabra de Memo (30-oct), citada: «el rol de pagos … que sea una herramienta
// para nosotros los vendedores para poder cotizar en base a lo que hay de info
// en index, cargar los vuelos de nube voladora, hotel etc y poderle bajar el
// card o el png al cliente y enviárselo» → «si dale».
//
// 🔒 AQUÍ NO VIVE NINGUNA REGLA DE PRECIO. Todo se le PREGUNTA a su dueño:
//   · qué se vende y a cuánto  → `_lib/opciones-paquete` (`_opciones` con la
//     fecha) → `_calcularPrecio` / `_zonaLista` / `_hotelLista` de precio-zona
//   · el total del grupo       → `_calcularPrecio` (el MISMO motor que sella
//     una venta: separo, STAY −$500, hotel por persona, regla de los 15 días)
//   · el transporte de CDMX    → `_lib/nube` (`vigentes`, con su herencia
//     rotulada: la cotización del evento manda, si no la GENERAL)
//   · el rol de quincenas      → `_lib/plan-pagos` (`planDelViaje` con el
//     separo como lo ya abonado — la fórmula de rol.html, su canon)
// Un cotizador que calculara por su cuenta sería la cuarta copia de la regla de
// precios, y la primera que le pone un número enfrente a un cliente.
//
// 🔒 CERO ESCRITURAS. Esto cotiza; no aparta, no crea viajero, no mueve dinero.
// Lo que sale de aquí es una IMAGEN para mandar por WhatsApp.
//
// Roles: maestro_roshi · bulma · milk (las que venden).
//
// Body JSON: { accion, ... }
//   'eventos'                      → { ok, eventos:[{id, nombre, venue, cdmx, st, fechas:[{evento_id, lbl, ds}]}] }
//   'opciones' { evento_id }       → { ok, evento, paquetes, hoteles, nube, dias_al_evento }
//   'cotizar'  { evento_id, paquete, zona?, hotel?, personas, transporte?, transporte_monto? }
//       transporte: 'bus' | 'avion' | 'manual' | 'ninguno'  (solo CDMX, no CHEAP)
//       → { ok, cotizacion:{…}, plan:{…}, avisos:[…] }
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { fetchEventosRaw, fetchHotelesGlobales } = require('./_lib/catalogo-index');
const { _calcularPrecio, _hotelLista, esCDMX, hoyMx, _diasEvento } = require('./_lib/precio-zona');
const { _opciones, NOMBRES } = require('./_lib/opciones-paquete');
const { planDelViaje, dsDeEvento } = require('./_lib/plan-pagos');
const { vigentes } = require('./_lib/nube');

const ROLES = ['maestro_roshi', 'bulma', 'milk'];
const ACCIONES = ['eventos', 'opciones', 'cotizar'];
const TRANSPORTES = ['bus', 'avion', 'manual', 'ninguno'];
const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

function lectorNube() {
  return async (qs) => {
    const r = await fetch(SB_URL + '/rest/v1/' + qs, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    if (!r.ok) throw new Error('SB ' + r.status);
    return r.json();
  };
}

// Las fechas vendibles de un evento, con su evento_id 'slug#N' cuando es
// multifecha. Una fecha que ya pasó no se ofrece (no se cotiza lo que ya fue).
function fechasDe(ev, hoyISO) {
  const out = [];
  if (Array.isArray(ev.multifecha) && ev.multifecha.length) {
    ev.multifecha.forEach((mf, i) => {
      const id = ev.id + '#' + i;
      const ds = dsDeEvento(ev, id);
      if (ds && ds < hoyISO) return;
      out.push({ evento_id: id, idx: i, lbl: String((mf && mf.lbl) || ('Fecha ' + (i + 1))), ds: ds || null });
    });
    return out;
  }
  const ds = ev.ds ? String(ev.ds) : null;
  if (ds && ds < hoyISO) return out;
  out.push({ evento_id: ev.id, idx: null, lbl: String(ev.f || ''), ds });
  return out;
}

function partirId(eventoId) {
  const s = String(eventoId || '');
  const [slug, idxStr] = s.split('#');
  const idx = (idxStr != null && /^\d+$/.test(idxStr)) ? Number(idxStr) : null;
  return { slug, idx };
}

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const res = (code, obj) => ({ statusCode: code, headers, body: JSON.stringify(obj) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  if (!__origin) return res(403, { error: 'Origen no permitido' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return res(400, { error: 'JSON inválido' }); }
  const accion = String(body.accion || '');
  if (!ACCIONES.includes(accion)) return res(400, { error: `Acción no reconocida. Se puede: ${ACCIONES.join(', ')}.`, codigo: 'ACCION_DESCONOCIDA' });

  const auth = await verifyAdminAuthLive(event, ROLES);
  if (!auth.valid) return res(auth.status, { error: auth.error });

  try {
    const lista = await fetchEventosRaw();
    // 🔒 Sin catálogo NO se cotiza: un precio inventado frente a un cliente es
    // peor que un «intenta en un rato».
    if (!Array.isArray(lista)) return res(502, { error: 'No se pudo leer el catálogo del sitio. Intenta en un momento.' });
    const hoyISO = hoyMx();

    // ── eventos ─────────────────────────────────────────────────────────────
    if (accion === 'eventos') {
      const eventos = [];
      for (const ev of lista) {
        if (!ev || !ev.id) continue;
        const fechas = fechasDe(ev, hoyISO);
        if (!fechas.length) continue;
        eventos.push({ id: ev.id, nombre: ev.a || ev.id, venue: ev.v || '', cdmx: esCDMX(ev), st: ev.st || '', fecha: ev.f || '', fechas });
      }
      eventos.sort((a, b) => String((a.fechas[0] || {}).ds || '9999').localeCompare(String((b.fechas[0] || {}).ds || '9999')));
      return res(200, { ok: true, eventos });
    }

    const { slug, idx } = partirId(body.evento_id);
    const ev = lista.find((x) => x && x.id === slug);
    if (!ev) return res(404, { error: 'Ese evento no está en el catálogo.' });
    const esMulti = Array.isArray(ev.multifecha) && ev.multifecha.length > 0;
    if (esMulti && (idx == null || !ev.multifecha[idx])) return res(400, { error: 'Elige la fecha del evento.' });
    const fi = esMulti ? idx : 0;
    const eventoId = esMulti ? (slug + '#' + fi) : slug;
    const ds = dsDeEvento(ev, eventoId);
    const cdmx = esCDMX(ev);
    let hoteles = {};
    try { hoteles = await fetchHotelesGlobales(); } catch (_) { hoteles = {}; }
    const fechaLbl = esMulti ? String(ev.multifecha[fi].lbl || '') : String(ev.f || '');
    const evInfo = { evento_id: eventoId, nombre: ev.a || slug, venue: ev.v || '', fecha: fechaLbl, ds: ds || null, cdmx, st: ev.st || '' };
    const diasAl = ds ? _diasEvento(ds, hoyISO) : null;

    // La Nube solo pinta en CDMX; fail-soft DICHO (la pantalla ofrece «manual»).
    let nube = null, nubeError = null;
    if (cdmx) {
      if (!SB_KEY) nubeError = 'sin llaves de KameHouse';
      else {
        try { nube = await vigentes(lectorNube(), Date.now(), slug); }
        catch (e) { nubeError = 'no se pudo leer la Nube'; }
      }
    }

    // ── opciones ────────────────────────────────────────────────────────────
    if (accion === 'opciones') {
      const o = _opciones(ev, hoteles, fi);
      if (!o.ok) return res(409, { error: o.motivo });
      // Las habitaciones COMPLETAS (con para cuántos viajeros vale cada una):
      // el vendedor cotiza grupos, no a una persona. La lista es la del dueño.
      const habs = (_hotelLista(ev, fi, cdmx, hoteles) || []).filter((h) => h && h.n)
        .map((h) => ({ nombre: h.n, extra: Number(h.e) || 0, viaj: Array.isArray(h.viaj) ? h.viaj : null }));
      return res(200, {
        ok: true, evento: evInfo, paquetes: o.paquetes, hoteles: habs, hotel_pp: !!ev.hotelPP,
        nube: cdmx ? { bus: (nube && nube.bus) || null, avion: (nube && nube.avion) || null, error: nubeError } : null,
        dias_al_evento: diasAl,
      });
    }

    // ── cotizar ─────────────────────────────────────────────────────────────
    const paquete = String(body.paquete || '').toLowerCase();
    if (!NOMBRES[paquete]) return res(400, { error: 'Elige el paquete.' });
    const personas = Number(body.personas);
    if (!Number.isInteger(personas) || personas < 1 || personas > 40) return res(400, { error: 'Número de personas inválido (1 a 40).' });

    const avisos = [];
    let transporte = null;
    let transporteCost;
    if (cdmx && paquete !== 'cheap') {
      const modo = String(body.transporte || '');
      if (!TRANSPORTES.includes(modo)) return res(400, { error: 'Elige el transporte (autobús, avión, monto manual o sin transporte).' });
      if (modo === 'bus' || modo === 'avion') {
        const v = nube && nube[modo];
        if (!v || !(Number(v.precio) > 0)) return res(409, { error: `No hay cotización vigente de ${modo === 'bus' ? 'autobús' : 'avión'} en la Nube. Captúrala en Nube voladora o usa «monto manual».`, nube_error: nubeError });
        transporteCost = Number(v.precio);
        transporte = { modo, precio: transporteCost, fuente: v.heredado ? 'nube · tarifa general CDMX' : 'nube · cotización del evento', vigente_hasta: v.vigente_hasta || null, horarios: v.horarios || null };
      } else if (modo === 'manual') {
        const m = Number(body.transporte_monto);
        if (!Number.isFinite(m) || m <= 0 || m > 100000) return res(400, { error: 'Escribe el monto del transporte por persona.' });
        transporteCost = Math.round(m);
        transporte = { modo, precio: transporteCost, fuente: 'monto tecleado por quien cotiza', vigente_hasta: null, horarios: null };
      } else {
        transporteCost = 0;
        transporte = { modo: 'ninguno', precio: 0, fuente: 'sin transporte', vigente_hasta: null, horarios: null };
        avisos.push('La cotización NO incluye transporte a CDMX.');
      }
      if (diasAl != null && diasAl <= 15 && modo !== 'ninguno') avisos.push('Faltan 15 días o menos: el transporte se confirma por WhatsApp antes de cerrar.');
    }

    const r = _calcularPrecio(ev, {
      hoteles, paquete,
      zona: body.zona ? String(body.zona) : undefined,
      hotel_nombre: body.hotel ? String(body.hotel) : undefined,
      num_personas: personas,
      transporte_cost: transporteCost,
      fecha_idx: fi,
      hoyISO,
    });
    if (!r || !r.ok) return res(409, { error: (r && r.motivo) || 'No se pudo cotizar esa combinación.' });
    if (r.requiere_hotel) return res(400, { error: 'Elige el tipo de habitación.' });

    // El rol: el separo es lo primero que se paga; el resto se reparte en
    // quincenas con la fórmula de siempre (planDelViaje, separo = abonado).
    const plan = planDelViaje({ total: r.total, abonado: r.separo, ds, paquete });

    return res(200, {
      ok: true,
      cotizacion: {
        evento: evInfo, paquete, paquete_nombre: NOMBRES[paquete],
        zona: r.zona || null, hotel: body.hotel ? String(body.hotel) : null, personas,
        precio_unit: r.precio_unit, total: r.total, separo: r.separo, resto: r.resto,
        desglose: r.desglose, transporte, hoy: hoyISO,
      },
      plan, avisos,
    });
  } catch (e) {
    console.error('[admin-cotizador]', (e && e.message) || e);
    return res(500, { error: 'Error al cotizar: ' + ((e && e.message) || 'desconocido') });
  }
};
