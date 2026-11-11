// =============================================================================
// _lib/repartir-lugares.js — [ACOMP-3] EL DUEÑO de «una fila con VARIOS lugares
// se reparte en fichas propias». (10-nov-2026)
//
// Nació dentro de portal-viajero (`repartir`, ACOMP-2, 13-oct). Al volverse DOS
// lectores —el titular desde su Portal y Bulma/Milk/Ximena desde Capsule (caso
// Karina, Pa'l Norte: separó 3 lugares y mandó los datos por Messenger; palabra
// de Memo, 10-nov: «sí, constrúyelo»)— se MUDÓ aquí. Dos copias serían dos
// repartos de dinero que todavía no divergen.
//
// EL DINERO SE REPARTE, NO SE CREA NI SE PIERDE:
//   · contrato: cada acompañante recibe floor(total / lugares); el titular se
//     queda con el resto — la suma cuadra AL PESO con el contrato original.
//   · pagado: cada acompañante recibe floor(cobrado / lugares) como un abono
//     NUEVO «pagado por {titular}»; esa misma cantidad se le QUITA al titular —
//     primero de su `abonado_previo`, luego de sus abonos (de mayor a menor),
//     cada PATCH con su VALOR ESPERADO y la razón ANEXADA. Cero DELETEs.
//
// EL ORDEN ES PARTE DEL CANDADO:
//   1. reclamar al titular (boletos/contrato con valor esperado: doble clic → 409)
//   2. nacen los acompañantes (un POST: todos o ninguno; si fallan, se revierte)
//   3. el dinero: quitar primero, poner después; si poner falla, se devuelve
//   4. el plan fijo se reparte con las MISMAS fechas
//   5. el correo único, SOLO a correos distintos del titular. Jamás tumba nada.
// =============================================================================
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// Normaliza y valida UN acompañante. → { a } | { error } | { vacio:true }
function normalizarAcomp(raw, { conDatosViaje }) {
  const a = raw || {};
  const nombre = String(a.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const correo = String(a.correo || '').trim().toLowerCase();
  const celular = String(a.celular || '').replace(/\D/g, '');
  const tallaRaw = String(a.talla_playera || '').trim().toUpperCase();
  const emer = String(a.num_emergencia || '').replace(/\D/g, '');
  const gen = String(a.genero || '').trim().toUpperCase();
  if (!nombre && !correo && !celular && !tallaRaw && !emer) return { vacio: true };
  if (nombre.length < 2) return { error: 'Escribe el nombre completo de cada acompañante' };
  if (correo && !CORREO_RE.test(correo)) return { error: `El correo de ${nombre} no parece válido` };
  if (celular && celular.length !== 10) return { error: `El WhatsApp de ${nombre} va a 10 dígitos` };
  const out = { nombre, correo, celular: celular || null };
  if (conDatosViaje) {
    if (tallaRaw && !TALLAS.includes(tallaRaw)) return { error: `La talla de ${nombre} tiene que ser una de ${TALLAS.join(', ')}` };
    if (emer && (emer.length < 10 || emer.length > 13)) return { error: `El número de emergencia de ${nombre} va de 10 a 13 dígitos` };
    if (emer && celular && emer === celular) return { error: `El número de emergencia de ${nombre} tiene que ser de OTRA persona` };
    if (gen && !['H', 'M'].includes(gen)) return { error: `El género de ${nombre} es H o M` };
    out.talla_playera = tallaRaw || null;
    out.num_emergencia = emer || null;
    out.genero = gen || null;
  }
  return { a: out };
}

// → { status, body }
// origen: 'portal' (el titular) | 'capsule' (el equipo)
// correoQuien: el correo del titular verificado (portal) o null (capsule)
async function repartirLugares({ viajero_id, acompanantes, origen, quien, capturado_por, KH_URL, KH_KEY }) {
  const hKH = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  const bad = (m, st) => ({ status: st || 400, body: { ok: false, error: m } });
  const H = (extra) => Object.assign({}, hKH, { 'Content-Type': 'application/json' }, extra || {});
  const VE = `${KH_URL}/rest/v1/viajeros_evento`;
  const AB = `${KH_URL}/rest/v1/abonos_viajero`;
  const desdeCapsule = origen === 'capsule';

  let t;
  try {
    const r = await fetch(`${VE}?id=eq.${viajero_id}&select=id,evento_id,nombre,correo,boletos,total_contrato,abonado_previo,tipo_paquete,zona_boleto,tipo_viajero,grupo_viaje,notas,fecha_separo,plan_pagos,portal_revisado_at&limit=1`, { headers: hKH });
    if (!r.ok) return bad('No pude leer el viaje', 502);
    t = (await r.json())[0];
  } catch (_) { return bad('No pude leer el viaje', 502); }
  if (!t) return bad('No encontramos ese viajero', 404);
  const B = Number(t.boletos) || 1;
  if (B < 2) return bad('Este registro es de un solo lugar: no hay acompañantes que agregar');
  const correoTit = String(t.correo || '').trim().toLowerCase();

  const crudos = Array.isArray(acompanantes) ? acompanantes : [];
  const acomp = [];
  for (const raw of crudos) {
    const n = normalizarAcomp(raw, { conDatosViaje: desdeCapsule });
    if (n.vacio) continue;
    if (n.error) return bad(n.error);
    if (!n.a.correo) n.a.correo = correoTit || null;
    acomp.push(n.a);
  }
  const k = acomp.length;
  if (!k) return bad('Escribe al menos un acompañante');
  if (k > B - 1) return bad(`El registro tiene ${B} lugares: se pueden agregar hasta ${B - 1} acompañante${B - 1 === 1 ? '' : 's'}`);

  let abonos = [];
  try {
    const r = await fetch(`${AB}?viajero_id=eq.${viajero_id}&select=id,monto,fecha,nota,foto_path&order=monto.desc&limit=500`, { headers: hKH });
    if (!r.ok) return bad('No pude leer los pagos', 502);
    abonos = await r.json();
  } catch (_) { return bad('No pude leer los pagos', 502); }
  const T = t.total_contrato == null ? null : Math.round(Number(t.total_contrato));
  const P = Math.round(Number(t.abonado_previo) || 0);
  const C = P + abonos.reduce((x, a) => x + (Number(a.monto) || 0), 0);
  const parteT = T == null ? null : Math.floor(T / B);
  const parteC = Math.floor(C / B);
  const mover = parteC * k;

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
  const grupo = t.grupo_viaje || require('crypto').randomUUID();
  const titular = t.nombre || 'el titular';
  const como = desdeCapsule ? `desde Capsule (${quien || 'equipo'})` : 'desde el Portal';

  // 1 · Reclamar al titular.
  const filtroT = `id=eq.${viajero_id}&boletos=eq.${B}` + (T == null ? '&total_contrato=is.null' : `&total_contrato=eq.${t.total_contrato}`);
  const cambiosT = {
    boletos: B - k,
    grupo_viaje: grupo,
    notas: ((t.notas ? t.notas + ' · ' : '') + `ACOMP-2 ${hoy}: repartió ${k} lugar${k === 1 ? '' : 'es'} a ${acomp.map((a) => a.nombre).join(', ')} ${como}`).slice(0, 4000),
  };
  if (T != null) cambiosT.total_contrato = T - parteT * k;
  const rC = await fetch(`${VE}?${filtroT}`, { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify(cambiosT) });
  if (!rC.ok) return bad('No se pudo guardar. Inténtalo otra vez.', 502);
  if ((await rC.json()).length !== 1) return bad('El registro cambió mientras lo editabas: recarga e inténtalo otra vez', 409);
  const revertirT = () => fetch(`${VE}?id=eq.${viajero_id}&boletos=eq.${B - k}`, {
    method: 'PATCH', headers: H(),
    body: JSON.stringify({ boletos: B, total_contrato: T, grupo_viaje: t.grupo_viaje || null, notas: t.notas || null }),
  }).catch(() => {});

  // 2 · Nacen los acompañantes. [PORTAL-SOLO-1] Heredan el sello del titular
  // (desde el Portal el titular siempre está sellado; desde Capsule puede no).
  const sellado = !!t.portal_revisado_at;
  const filas = acomp.map((a) => Object.assign({
    evento_id: t.evento_id, nombre: a.nombre, correo: a.correo, celular: a.celular,
    tipo_paquete: t.tipo_paquete, zona_boleto: t.zona_boleto, tipo_viajero: t.tipo_viajero || null,
    boletos: 1, total_contrato: parteT, abonado_previo: 0, grupo_viaje: grupo,
    portal_revisado_at: sellado ? new Date().toISOString() : null,
    portal_revisado_por: sellado ? 'heredado del titular (ACOMP-2)' : null,
    notas: `Acompañante de ${titular} · su lugar se lo dio ${titular} ${como} ${hoy} (ACOMP-2)`,
  }, desdeCapsule ? { talla_playera: a.talla_playera, num_emergencia: a.num_emergencia, genero: a.genero } : {}));
  const rV = await fetch(VE, { method: 'POST', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify(filas) });
  if (!rV.ok) { await revertirT(); return bad('No se pudieron crear los lugares de los acompañantes. Nada cambió: inténtalo otra vez.', 502); }
  const nacidos = await rV.json();

  // 3 · El dinero: quitar al titular (con valor esperado) y luego poner.
  let dineroOk = true, avisoDinero = null;
  const quitados = [];
  let fotoFuente = null, fechaFuente = null;
  if (mover > 0) {
    let falta = mover;
    if (P > 0) {
      const d = Math.min(P, falta);
      const r = await fetch(`${VE}?id=eq.${viajero_id}&abonado_previo=eq.${t.abonado_previo}`, {
        method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ abonado_previo: P - d }),
      });
      if (r.ok && (await r.json()).length === 1) { falta -= d; quitados.push({ previo: true, de: P - d, a: P }); }
      else dineroOk = false;
    }
    for (const a of abonos) {
      if (!dineroOk || falta <= 0) break;
      const m = Number(a.monto) || 0;
      if (m <= 0) continue;
      const d = Math.min(m, falta);
      const nota = ((a.nota ? a.nota + ' · ' : '') + `ACOMP-2 ${hoy}: $${d} de este pago pasó a los lugares de sus acompañantes (antes $${m})`).slice(0, 2000);
      const r = await fetch(`${AB}?id=eq.${a.id}&monto=eq.${a.monto}`, {
        method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ monto: m - d, nota }),
      });
      if (r.ok && (await r.json()).length === 1) {
        falta -= d; quitados.push({ id: a.id, de: m - d, a: m, nota: a.nota || null });
        if (!fotoFuente) { fotoFuente = a.foto_path || null; fechaFuente = a.fecha || null; }
      } else dineroOk = false;
    }
    if (dineroOk && falta > 0) dineroOk = false;
    if (dineroOk) {
      const filasA = nacidos.map((v) => Object.assign({
        viajero_id: v.id, monto: parteC,
        nota: `Pagado por ${titular} — su parte del pago del grupo (ACOMP-2, ${hoy})`,
        foto_path: fotoFuente, capturado_por: capturado_por || null,
      }, fechaFuente ? { fecha: fechaFuente } : {}));
      const rA = await fetch(AB, { method: 'POST', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify(filasA) });
      if (!rA.ok) dineroOk = false;
    }
    if (!dineroOk) {
      for (const q of quitados) {
        if (q.previo) {
          await fetch(`${VE}?id=eq.${viajero_id}&abonado_previo=eq.${q.de}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ abonado_previo: q.a }) }).catch(() => {});
        } else {
          await fetch(`${AB}?id=eq.${q.id}&monto=eq.${q.de}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ monto: q.a, nota: q.nota }) }).catch(() => {});
        }
      }
      avisoDinero = desdeCapsule
        ? 'Los acompañantes ya tienen su lugar, pero su parte del pago no se pudo acomodar: regístrala con ➕ Abono.'
        : 'Tus acompañantes ya tienen su lugar, pero su parte del pago no se pudo acomodar: el equipo lo hace a mano y te avisa.';
      console.error('[ACOMP-2] reparto de dinero falló', viajero_id, JSON.stringify(quitados));
    }
  }

  // 4 · [PLAN-FIJO-1] El rol de pagos se reparte con las MISMAS fechas.
  if (t.plan_pagos && t.fecha_separo && dineroOk) {
    try {
      const PF = require('./plan-fijo');
      const lista = await require('./catalogo-index').fetchEventosRaw().catch(() => null);
      const evP = Array.isArray(lista) ? (lista.find((x) => x && x.id === String(t.evento_id).split('#')[0]) || null) : null;
      const sepT = Math.round(Number(t.plan_pagos.separo_monto) || 0);
      const parteS = Math.floor(sepT / B);
      for (const v of nacidos) {
        await PF.fijarEnBase({ url: KH_URL, headers: hKH, viajero: v, ev: evP, fecha_separo: t.fecha_separo, separo_monto: parteS, por: capturado_por });
      }
      await PF.fijarEnBase({ url: KH_URL, headers: hKH, viajero: Object.assign({}, t, { total_contrato: T == null ? null : T - parteT * k }),
        ev: evP, fecha_separo: t.fecha_separo, separo_monto: sepT - parteS * k, por: capturado_por, reemplazar: true });
    } catch (e) { console.error('[PLAN-FIJO-1] reparto del plan falló', viajero_id, e && e.message); }
  }

  // 5 · El correo único, a los correos distintos del titular.
  let correoRes = null;
  const paraCorreo = nacidos.filter((v) => v.correo && String(v.correo).toLowerCase() !== correoTit);
  if (paraCorreo.length) {
    try {
      const { enviarCorreoPago } = require('./correo-confirmacion');
      const recibidoPorViajero = {};
      paraCorreo.forEach((v) => { recibidoPorViajero[v.id] = dineroOk ? parteC : 0; });
      correoRes = await enviarCorreoPago({
        tipo: 'reserva', evento_id: t.evento_id, viajeroIds: paraCorreo.map((v) => v.id), recibidoPorViajero,
        enviado_por: capturado_por, KH_URL, KH_KEY,
      });
    } catch (e) { correoRes = { error: e.message }; }
  }

  return {
    status: dineroOk ? 200 : 207,
    body: {
      ok: true,
      acompanantes: nacidos.map((v) => ({ id: v.id, nombre: v.nombre, correo: v.correo, contrato: parteT, pagado: dineroOk ? parteC : 0 })),
      titular: { boletos: B - k, contrato: T == null ? null : T - parteT * k },
      invitados: paraCorreo.map((v) => v.correo),
      correo: correoRes,
      aviso: avisoDinero,
    },
  };
}

module.exports = { repartirLugares, normalizarAcomp, TALLAS };
