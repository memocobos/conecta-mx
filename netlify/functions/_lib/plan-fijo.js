'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// [PLAN-FIJO-1] EL ROL DE PAGOS FIJO — se arma UNA vez, desde la fecha de separo.
//
// Palabra de Memo (4-nov-2026), citada: «el calendario debe de quedar fijo
// siguiendo las reglas establecidas a partir de la fecha de separo … esas fechas
// de pago serán las que siempre verá en el portal … si lo estás cambiando
// constantemente la gente va a depositar de más porque no van a entender que
// está subiendo el dinero».
//
// 🔴 El defecto que esto cura (caso Sahid, FR 11-ene, separó el 29-oct): el
// Portal recalculaba el plan CADA DÍA desde «hoy» con `planDelViaje`, y la regla
// de los 5 días (pensada para el SEPARO) le borró la quincena del 9-16 nov el
// 4-nov: de 4 pagos de $975 pasó a 3 de $1,300 sin que ella hiciera nada.
//
// Las tres decisiones de Memo (4-nov), firmadas:
//   1. Los migrados del Excel (sin fecha de separo real) NO ven calendario hasta
//      que Bulma/Milk capturen su fecha de separo en Capsule.
//   2. Un pago no hecho sale VENCIDO y se suma aparte; los demás no cambian. Lo
//      que abone de más se aplica a los pagos EN ORDEN.
//   3. Si cambia el total: MISMAS fechas, nuevo monto en las que faltan. Eso lo
//      hace el trigger `plan_pagos_resplit` de la base (migraciones/PLAN-FIJO-1.sql)
//      para que ningún escritor de `total_contrato` se lo salte.
//
// 🔒 Las FECHAS salen de la fórmula de siempre (`quincenasEntre` de plan-pagos,
// copia del canon de rol.html), corrida UNA vez con `from = fecha de separo`.
// Esta lib no re-implementa una quincena: la congela.
// ═══════════════════════════════════════════════════════════════════════════

const PP = require('./plan-pagos');

const VERSION = 1;

function _iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _fecha(ds) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ds || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return isFinite(d.getTime()) ? d : null;
}
function _num(x) { const n = Number(x); return isFinite(n) ? n : null; }
function maxPagos(paquete) {
  return String(paquete || '').trim().toLowerCase() === 'cheap' ? PP.MAX_PAGOS.cheap : PP.MAX_PAGOS.otros;
}

// Reparte `resto` en `k` cuotas como rol.html: ceil por cuota y el último ajusta.
function _repartir(resto, k) {
  const out = [];
  if (k <= 0) return out;
  // [COT-FIX-4] no más pagos que pesos (el último quedaría negativo)
  const r = Math.max(0, Math.round(resto * 100) / 100);
  const q = Math.ceil(r / k);
  let acc = 0;
  for (let i = 0; i < k; i++) {
    const m = (i === k - 1) ? Math.round((r - acc) * 100) / 100 : Math.min(q, Math.max(0, r - acc));
    acc += m;
    out.push(m);
  }
  return out;
}

// ── ARMAR (una sola vez) ────────────────────────────────────────────────────
// Entra: { separo_fecha 'YYYY-MM-DD', separo_monto, total, paquete, ds (fecha del
//          evento), diasAntes, por }
// Sale:  el jsonb que se guarda en `viajeros_evento.plan_pagos`, o
//        { error } con el motivo (sin fecha de evento, separo inválido…).
function armarPlanFijo(o) {
  o = o || {};
  const sep = _fecha(o.separo_fecha);
  if (!sep) return { error: 'fecha de separo inválida' };
  const ds = o.ds ? String(o.ds) : '';
  const ev = _fecha(ds);
  if (!ev) return { error: 'el evento no tiene fecha en el catálogo' };
  if (sep > ev) return { error: 'la fecha de separo es después del evento' };
  const sepMonto = _num(o.separo_monto);
  if (sepMonto == null || sepMonto < 0) return { error: 'monto de separo inválido' };
  const total = _num(o.total);

  // Las ventanas se guardan TODAS (hasta el tope de 10) aunque el paquete use
  // menos: si una preventa (CHEAP, 4) elige después PLUS, el trigger ya tiene
  // las fechas que le tocaban desde su separo.
  const vent = PP.quincenasEntre(sep, ev, PP.MAX_PAGOS.otros, o.diasAntes).map((q) => ({
    lbl: q.lbl, ini: _iso(q.d), fin: _iso(q.e),
  }));
  const n = Math.min(maxPagos(o.paquete), vent.length);
  const deuda = (total != null && total > 0) ? Math.max(0, total - sepMonto) : 0;
  let cuotas;
  if (n > 0) {
    const montos = _repartir(deuda, n);
    cuotas = vent.slice(0, n).map((v, i) => ({ n: i + 1, lbl: v.lbl, ini: v.ini, fin: v.fin, monto: montos[i] }));
  } else {
    // Separó tan cerca del evento que no cabe ninguna quincena: se liquida antes
    // del evento (la fila `liq` de rol.html).
    cuotas = deuda > 0 ? [{ n: 1, lbl: 'Antes del evento', ini: o.separo_fecha, fin: ds, monto: deuda, liq: true }] : [];
  }
  return {
    v: VERSION,
    separo_fecha: String(o.separo_fecha).slice(0, 10),
    separo_monto: sepMonto,
    evento_ds: ds,
    total_base: total,
    ventanas: vent,
    cuotas,
    creado_at: new Date().toISOString(),
    creado_por: o.por || null,
    ajustes: [],
  };
}

// ── LEER (cada vez que alguien lo mira) ────────────────────────────────────
// Aplica lo pagado A LAS CUOTAS EN ORDEN y dice el estado de cada una. No mueve
// una fecha ni un monto: solo cuenta.
//   estado por cuota: 'pagada' · 'parcial' · 'vencida' · 'pendiente'
// Entra: (plan, { total, abonado, ahora })
function estadoPlan(plan, o) {
  o = o || {};
  if (!plan || !Array.isArray(plan.cuotas)) return null;
  const total = _num(o.total);
  const abonado = _num(o.abonado) || 0;
  if (total == null || total <= 0) return { estado: 'sin_total', resta: null, cuotas: [], separo_fecha: plan.separo_fecha };
  const resta = Math.round((total - abonado) * 100) / 100;
  const hoyD = PP.hoyReynosa(o.ahora);
  const hoy = _iso(hoyD);
  const ds = plan.evento_ds || '';
  const base = {
    separo_fecha: plan.separo_fecha,
    separo_monto: plan.separo_monto,
    fijo: true,
  };
  if (resta <= 0) return Object.assign({ estado: 'liquidado', resta: 0, cuotas: [], atrasado: 0 }, base);
  if (ds && ds < hoy) return Object.assign({ estado: 'evento_pasado', resta, cuotas: [], atrasado: 0 }, base);

  // Lo pagado PARA el plan = lo abonado menos el separo (el separo no es cuota).
  let bolsa = Math.max(0, abonado - (Number(plan.separo_monto) || 0));
  let atrasado = 0;
  const cuotas = plan.cuotas.filter((c) => Number(c.monto) > 0).map((c) => {
    const monto = Number(c.monto) || 0;
    const cubre = Math.min(monto, bolsa);
    bolsa = Math.round((bolsa - cubre) * 100) / 100;
    const falta = Math.round((monto - cubre) * 100) / 100;
    let est;
    if (falta <= 0) est = 'pagada';
    else if (c.fin && c.fin < hoy) { est = 'vencida'; atrasado += falta; }
    else est = cubre > 0 ? 'parcial' : 'pendiente';
    return { n: c.n, lbl: c.lbl, fecha: c.ini, hasta: c.fin, monto, pagado: cubre, falta, estado: est, liq: !!c.liq };
  });
  atrasado = Math.min(Math.round(atrasado * 100) / 100, resta);
  // El próximo pago = la primera cuota NO vencida que todavía debe algo.
  const prox = cuotas.find((c) => c.estado === 'pendiente' || c.estado === 'parcial') || null;
  return Object.assign({
    estado: 'calendario',
    resta,
    cuotas,
    atrasado,
    proxima: prox ? { n: prox.n, lbl: prox.lbl, fecha: prox.fecha, hasta: prox.hasta, monto: Math.min(prox.falta, resta) } : null,
  }, base);
}

// ── RE-REPARTIR cuando cambia el total (espejo JS del trigger de la base) ────
// Las cuotas cuya ventana YA EMPEZÓ conservan su monto; las que no han empezado
// se re-reparten con lo que falte. Sin ventanas futuras, lo que falte va a una
// cuota «Antes del evento». Lo usa el careo para carear el trigger; la base es
// quien lo aplica de verdad.
function rerepartir(plan, o) {
  o = o || {};
  if (!plan || !Array.isArray(plan.cuotas)) return plan;
  const hoy = _iso(PP.hoyReynosa(o.ahora));
  const total = Number(o.total) || 0;
  const n = maxPagos(o.paquete);
  const deuda = Math.max(0, total - (Number(plan.separo_monto) || 0));
  // Una cuota de $0 (preventa: total = separo) no ocupa lugar: al elegir paquete
  // el dinero se reparte en las ventanas que le quedan, no en las que pasaron en cero.
  const kept = plan.cuotas.filter((c) => c.ini <= hoy && !c.liq && Number(c.monto) > 0);
  const sumKept = kept.reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const fut = (plan.ventanas || []).filter((v) => v.ini > hoy).slice(0, Math.max(0, n - kept.length));
  const resto = Math.max(0, deuda - sumKept);
  let nuevas;
  if (fut.length) {
    const m = _repartir(resto, fut.length);
    nuevas = fut.map((v, i) => ({ lbl: v.lbl, ini: v.ini, fin: v.fin, monto: m[i] }));
  } else {
    nuevas = resto > 0 ? [{ lbl: 'Antes del evento', ini: hoy, fin: plan.evento_ds || hoy, monto: resto, liq: true }] : [];
  }
  const cuotas = kept.concat(nuevas).map((c, i) => Object.assign({}, c, { n: i + 1 }));
  return Object.assign({}, plan, { cuotas, total_base: total });
}

// ── «HOY» de una fecha guardada como timestamp, en Reynosa (para el separo de
// una requisición: el día en que el cliente mandó su separo).
function diaReynosa(ts) {
  const d = ts ? new Date(ts) : null;
  if (!d || !isFinite(d.getTime())) return null;
  return _iso(PP.hoyReynosa(d));
}

// ── FIJAR EN LA BASE (una fila) ─────────────────────────────────────────────
// Arma el plan y lo escribe CON valor esperado: sin `reemplazar`, solo si la
// fila aún no tiene plan (`plan_pagos=is.null`) — un 2º clic no lo pisa. Jamás
// lanza: devuelve { ok, error }. El catálogo (`ev`) da la fecha del #N.
async function fijarEnBase(o) {
  try {
    const { url, headers, viajero, ev, fecha_separo, separo_monto, por, reemplazar } = o || {};
    if (!viajero || !viajero.id) return { ok: false, error: 'sin viajero' };
    if (!ev) return { ok: false, error: 'el catálogo no trae este evento' };
    const ds = PP.dsDeEvento(ev, viajero.evento_id);
    const plan = armarPlanFijo({
      separo_fecha: fecha_separo, separo_monto, total: viajero.total_contrato,
      paquete: viajero.tipo_paquete, ds, diasAntes: ev.diasAntes, por,
    });
    if (plan.error) return { ok: false, error: plan.error };
    const filtro = reemplazar ? '' : '&plan_pagos=is.null';
    const r = await fetch(`${url}/rest/v1/viajeros_evento?id=eq.${viajero.id}${filtro}`, {
      method: 'PATCH',
      headers: Object.assign({}, headers, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ fecha_separo: plan.separo_fecha, plan_pagos: plan }),
    });
    if (!r.ok) return { ok: false, error: 'la base rechazó el plan: ' + (await r.text().catch(() => '')).slice(0, 200) };
    const filas = await r.json().catch(() => []);
    if (!filas.length) return { ok: false, error: 'ya tenía plan fijo (no se pisó)', ya_tenia: true };
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'error' };
  }
}

module.exports = { VERSION, armarPlanFijo, estadoPlan, rerepartir, maxPagos, diaReynosa, fijarEnBase, _repartir };
