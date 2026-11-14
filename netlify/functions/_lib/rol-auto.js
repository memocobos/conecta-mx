'use strict';
// =============================================================================
// _lib/rol-auto.js — [ROL-2027-1] EL ROL DE PAGOS SE FIJA SOLO AL REGISTRAR
// (13-nov-2026) · solo para los tours 2027 en adelante.
//
// Palabra de Memo, citada: «TODOS LOS TOURS 2027 QUE SE SEPAREN, EL DÍA QUE
// HAGAMOS REGISTRO ES EL DÍA QUE SE CUENTA PARA SU ROL DE PAGOS A PARTIR DE AHÍ,
// PARA NO ESTAR METIENDO UNO POR UNO MANUAL».
//
// 🔴 Lo que había (medido el 13-nov): cada viajero de un tour 2027 registrado en
// Capsule o publicado en el Portal caía a la tarjeta «🗓 Fijar rol» y alguien
// tenía que teclearle fecha y monto de separo, uno por uno — 99 esperando (4 ya
// publicados, 95 por publicar) con la pandilla registrando a todo el 2027.
//
// LA REGLA, en un renglón: el rol se cuenta desde el DÍA EN QUE SE REGISTRA
// (hoy, en Reynosa) y lo que la persona LLEVA PAGADO es su punto de partida; lo
// que le FALTA se reparte parejo en las quincenas de siempre que quedan de ahí
// al evento. Nadie nace con un pago vencido y nadie teclea una fecha.
//
// 🔒 Aquí NO se arma una quincena ni se suma un abono:
//   · las fechas y el reparto son de `armarPlanFijo` (_lib/plan-fijo, el dueño);
//   · lo pagado es de `saldoMigrado` (_lib/cuenta-evento, el dueño del dinero);
//   · la fecha del #N es de `dsDeEvento` (_lib/plan-pagos).
// Esta lib solo decide A QUIÉN le toca y con QUÉ dos datos se llama al dueño.
//
// 🔒 El rol es un CALENDARIO, no dinero: no escribe un abono ni mueve un total.
// 🔒 Jamás pisa un rol que ya existe (`plan_pagos=is.null` en el PATCH del dueño).
// 🔒 Jamás tumba la acción que lo llamó (alta, publicar): todo va en try y lo
//    que no se pudo fijar se DICE con su motivo y cae a la tarjeta «🗓 Fijar rol».
//
// Los tours 2026 NO entran: vienen del Excel con su fecha de separo real y esa
// se captura a mano (decisión 1 de PLAN-FIJO-1, que para ellos sigue viva).
// =============================================================================

const PF = require('./plan-fijo');
const PP = require('./plan-pagos');
const RA = require('./rol-avisos');
const { saldoMigrado } = require('./cuenta-evento');
const { esDelEquipo } = require('./portal-revision');

// El corte: la fecha de SU #N (no la del evento base) de 2027 en adelante.
const ROL_AUTO_DESDE = '2027-01-01';
const ORIGEN = 'registro';
const TOPE_POR_CLIC = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VSEL = 'id,nombre,correo,evento_id,tipo_paquete,total_contrato,abonado_previo,usuario_id,tipo_viajero,portal_revisado_at,fecha_separo,plan_pagos';

const mxn = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
const no = (motivo, extra) => Object.assign({ ok: false, motivo }, extra || {});

function evDe(EV, eventoId) {
  if (!Array.isArray(EV)) return null;
  const slug = String(eventoId || '').split('#')[0];
  return EV.find((e) => e && e.id === slug) || null;
}
const esTourAuto = (ds) => !!ds && String(ds).slice(0, 10) >= ROL_AUTO_DESDE;

// ── PURO: el rol dicho en una frase (la MISMA en la tarjeta, el aviso y el careo)
function resumir(plan) {
  const cs = ((plan && plan.cuotas) || []).filter((c) => Number(c.monto) > 0);
  if (!cs.length) return { n: 0, liq: false, texto: 'sin pagos por calendarizar', cuotas: [] };
  const cuotas = cs.map((c) => ({ n: c.n, lbl: c.lbl, ini: c.ini, fin: c.fin, monto: Number(c.monto), liq: !!c.liq }));
  if (cs.length === 1 && cs[0].liq) {
    return { n: 1, liq: true, texto: `liquida ${mxn(cs[0].monto)} antes del evento (ya no caben quincenas)`, cuotas };
  }
  const m = cuotas.map((c) => c.monto);
  const iguales = m.every((x) => x === m[0]);
  const casi = m.length > 1 && m.slice(0, -1).every((x) => x === m[0]);
  const cuanto = iguales ? ` de ${mxn(m[0])}`
    : casi ? `: ${m.length - 1} de ${mxn(m[0])} y el último de ${mxn(m[m.length - 1])}`
    : ` (de ${mxn(Math.min.apply(null, m))} a ${mxn(Math.max.apply(null, m))})`;
  return {
    n: cuotas.length, liq: false,
    texto: `${cuotas.length} pago${cuotas.length === 1 ? '' : 's'}${cuanto} · el 1º del ${cuotas[0].lbl}`,
    cuotas,
  };
}

// ── PURO: ¿qué rol le toca a este viaje si se fija HOY? No escribe nada.
// o.solo2027 (default true): fuera de 2027 contesta que no, con su motivo.
function propuesta(v, abonos, EV, ahora, o) {
  o = o || {};
  if (!v || !v.id) return no('sin viajero');
  if (v.plan_pagos) return no('ya tiene su rol fijo');
  if (esDelEquipo(v)) return no('es un tour que trabaja (equipo): no lleva rol de pagos');
  const s = saldoMigrado(v, abonos || []);
  if (!s || !(s.total > 0)) return no('sin total de contrato: ponlo con ✏️ y su rol se fija');
  // Liquidado: en la tarjeta no hay nada que fijar. Pero AL REGISTRAR sí nace su
  // rol (cuotas en $0, las ventanas guardadas): si después le sube el total —
  // elige paquete tras la preventa, se le agrega un vuelo— el trigger de la
  // base lo reparte solo en las ventanas que queden y nadie teclea nada. Es lo
  // que ya hace el aprobar de una requisición de preventa (PLAN-FIJO-1).
  if (!(s.resta > 0) && !o.aunLiquidado) return no('ya está liquidado: no hay nada que calendarizar');
  const ev = evDe(EV, v.evento_id);
  const ds = ev ? PP.dsDeEvento(ev, v.evento_id) : null;
  if (!ds) return no('su evento no tiene fecha en el catálogo todavía');
  const hoy = PF.diaReynosa(ahora || new Date());
  if (ds < hoy) return no('su evento ya pasó');
  const auto = esTourAuto(ds);
  if (o.solo2027 !== false && !auto) return no('su tour es de 2026: se fija con su fecha de separo real', { auto: false });
  const plan = PF.armarPlanFijo({
    separo_fecha: hoy, separo_monto: s.abonado, total: s.total,
    paquete: v.tipo_paquete, ds, diasAntes: ev.diasAntes, por: o.por || null, origen: ORIGEN,
  });
  if (plan.error) return no(plan.error);
  return { ok: true, auto, ev, ds, fecha: hoy, separo: s.abonado, total: s.total, resta: s.resta, plan, resumen: resumir(plan) };
}

// ── I/O ─────────────────────────────────────────────────────────────────────
async function leerPorIds(url, headers, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await fetch(`${url}/rest/v1/viajeros_evento?id=in.(${ids.slice(i, i + 100).join(',')})&select=${VSEL}&limit=200`, { headers });
    if (!r.ok) throw new Error('viajeros ' + r.status + ': ' + (await r.text()).slice(0, 200));
    out.push.apply(out, await r.json());
  }
  return out;
}

// FIJAR al registrar/publicar. Entra una lista de ids; sale quién quedó con rol
// y quién no (con su motivo). Jamás lanza.
//   solo2027 (default true): los tours 2026 se saltan — su fecha es la real.
//   aunLiquidado (lo piden el ALTA y el SELLO): también nace el rol de quien no
//     debe nada hoy, con cuotas en $0, para que un total que suba se reparta solo.
async function fijarAlRegistrar(o) {
  const out = { fijados: [], saltados: [], error: null };
  try {
    o = o || {};
    const { url, headers, por, ahora } = o;
    const ids = [...new Set((Array.isArray(o.ids) ? o.ids : []).map(String).filter((x) => UUID_RE.test(x)))];
    if (!ids.length) return out;
    let EV = o.EV;
    if (!Array.isArray(EV) || !EV.length) {
      try { EV = await require('./catalogo-index').fetchEventosRaw(); } catch (_) { EV = null; }
    }
    if (!Array.isArray(EV) || !EV.length) {
      out.error = 'no se pudo leer el catálogo: sin la fecha del evento no se arma el rol';
      ids.forEach((id) => out.saltados.push({ viajero_id: id, motivo: out.error }));
      return out;
    }
    const filas = await leerPorIds(url, headers, ids);
    const ab = filas.length ? await RA.leerAbonos(url, headers, filas.map((f) => f.id)) : {};
    for (const v of filas) {
      const pr = propuesta(v, ab[v.id], EV, ahora, { solo2027: o.solo2027, por, aunLiquidado: o.aunLiquidado === true });
      if (!pr.ok) { out.saltados.push({ viajero_id: v.id, nombre: v.nombre || null, motivo: pr.motivo, auto: pr.auto !== false }); continue; }
      const r = await PF.fijarEnBase({
        url, headers, viajero: v, ev: pr.ev, fecha_separo: pr.fecha, separo_monto: pr.separo,
        por: por || null, origen: ORIGEN,
      });
      if (!r.ok) { out.saltados.push({ viajero_id: v.id, nombre: v.nombre || null, motivo: r.error, auto: true }); continue; }
      const res = resumir(r.plan);
      out.fijados.push({ viajero_id: v.id, nombre: v.nombre || null, evento_id: v.evento_id, fecha: pr.fecha, separo: pr.separo, resta: pr.resta, n: res.n, texto: res.texto });
    }
  } catch (e) {
    out.error = (e && e.message) || 'error';
  }
  return out;
}

// La tarjeta «🗓 Fijar rol» con la PROPUESTA de cada quien (solo LEE): la misma
// población de siempre (`pendientesDeFijar`, su dueño) + qué rol le quedaría si
// se fija hoy y si es de un tour 2027 (los que se pueden fijar de un clic).
async function pendientes({ url, headers, EV, ahora }) {
  const filas = await RA.leerFilas(url, headers, RA.FILTRO_PENDIENTES);
  const ab = filas.length ? await RA.leerAbonos(url, headers, filas.map((f) => f.id)) : {};
  const base = RA.pendientesDeFijar(filas, ab, EV, ahora);
  const porId = new Map(filas.map((f) => [f.id, f]));
  let de2027 = 0;
  base.lista.forEach((p) => {
    const pr = propuesta(porId.get(p.viajero_id), ab[p.viajero_id], EV, ahora, { solo2027: false });
    p.es2027 = !!(pr.ok ? pr.auto : esTourAuto(p.ds));
    p.auto = pr.ok ? { fecha: pr.fecha, separo: pr.separo, n: pr.resumen.n, liq: pr.resumen.liq, texto: pr.resumen.texto } : null;
    p.auto_motivo = pr.ok ? null : pr.motivo;
    if (p.es2027 && p.auto) de2027++;
  });
  return { lista: base.lista, sin_fecha: base.sin_fecha, de2027, regla_desde: ROL_AUTO_DESDE };
}

// «Fijar de una vez». Sin ids: TODOS los pendientes de tours 2027 (la regla).
// Con ids: esos (los eligió un humano en la tarjeta, del año que sean).
// Sin `confirmar:true` es EN SECO: dice a quién y qué rol, y no escribe.
async function barrer({ url, headers, EV, ahora, por, ids, confirmar }) {
  const conIds = Array.isArray(ids) && ids.length > 0;
  if (conIds) {
    // Los eligió un humano (la tarjeta o el 🗓 Plan de Capsule): del año que
    // sean, publicados o no. Los candados son los de `propuesta`.
    const uniq = [...new Set(ids.map(String).filter((x) => UUID_RE.test(x)))];
    const faltan = Math.max(0, uniq.length - TOPE_POR_CLIC);
    const lote = uniq.slice(0, TOPE_POR_CLIC);
    if (confirmar === true) {
      const r = await fijarAlRegistrar({ url, headers, EV, ahora, por, ids: lote, solo2027: false });
      return { ok: true, seco: false, fijados: r.fijados, saltados: r.saltados, error: r.error, faltan };
    }
    const filas = await leerPorIds(url, headers, lote);
    const ab = filas.length ? await RA.leerAbonos(url, headers, filas.map((f) => f.id)) : {};
    const tocan = [], saltados = [];
    filas.forEach((v) => {
      const pr = propuesta(v, ab[v.id], EV, ahora, { solo2027: false });
      if (pr.ok) tocan.push({ viajero_id: v.id, nombre: v.nombre || null, evento: pr.ev.a || v.evento_id, resta: pr.resta, texto: pr.resumen.texto });
      else saltados.push({ viajero_id: v.id, nombre: v.nombre || null, motivo: pr.motivo });
    });
    return { ok: true, seco: true, tocan, saltados, faltan };
  }
  // Sin ids: LA REGLA — los ya publicados sin rol de tours 2027.
  const p = await pendientes({ url, headers, EV, ahora });
  let tocan = p.lista.filter((x) => x.auto && x.es2027);
  const faltan = Math.max(0, tocan.length - TOPE_POR_CLIC);
  tocan = tocan.slice(0, TOPE_POR_CLIC);
  const vista = tocan.map((x) => ({ viajero_id: x.viajero_id, nombre: x.nombre, evento: x.evento, fecha: x.fecha, resta: x.resta, texto: x.auto.texto }));
  if (confirmar !== true) return { ok: true, seco: true, tocan: vista, saltados: [], faltan };
  const r = await fijarAlRegistrar({ url, headers, EV, ahora, por, ids: tocan.map((x) => x.viajero_id), solo2027: true });
  return { ok: true, seco: false, fijados: r.fijados, saltados: r.saltados, error: r.error, faltan };
}

module.exports = {
  ROL_AUTO_DESDE, ORIGEN, TOPE_POR_CLIC, VSEL,
  esTourAuto, resumir, propuesta, fijarAlRegistrar, pendientes, barrer,
};
