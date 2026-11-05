// =============================================================================
// _lib/rol-avisos.js — [ROL-AVISOS-1] los recordatorios de pago y la bandeja
// «🗓 Fijar rol» sobre el ROL FIJO de `viajeros_evento.plan_pagos` (4-nov-2026).
//
// Palabra de Memo: «los recordatorios de correo que le llegarán solo se activarán
// en las fechas de pago de su rol de pagos fijo» · «lo de los correos con los
// recordatorios ya estaba construido en el viejo portal» · «ponme en alertas o
// requisiciones los que vienen de los tours viejos para poner su fecha de separo».
//
// POR QUÉ UN LECTOR NUEVO Y NO LOS CRONS VIEJOS: portal-recordatorios-diario,
// vence-hoy-diario y portal-morosidad-diario leen la tabla `pagos` del PORTAL
// (flujo viejo de solicitudes_tour, hoy VACÍA). Los clientes de verdad viven en
// `viajeros_evento` y su calendario es `plan_pagos`. Aquí se COPIA la escalera de
// los viejos —apertura amable · último día · vencido— con su mismo estilo de
// correo y su caja de cuenta, pero con las fechas DEL ROL FIJO de cada quien:
//   · apertura   → el día que abre la ventana de su cuota (ini)
//   · vence_hoy  → el último día de su ventana (fin)
//   · vencido    → el día SIGUIENTE a su fin, si no la cubrió
//   · antes_evento → 7 días antes del evento, si su saldo va en «Antes del evento»
// Lo cubierto se cuenta con estadoPlan (el MISMO dueño del Portal y de Capsule):
// una cuota ya pagada no recibe nada.
//
// 🔒 UN CORREO POR DIRECCIÓN por corrida (un buzón con 3 viajes recibe uno con
// los 3). Bitácora PROPIA `rol_avisos` (KH, UNIQUE viajero+cuota+tipo): cada
// momento sale UNA vez en la vida de esa cuota, no una vez por día. Se aparta
// ANTES de mandar y se libera si el correo falla. 🔒 SIN BITÁCORA NO SE MANDA
// (al revés que avisos_cobranza, que es fail-open): un cron diario sin memoria
// repetiría el correo todos los días.
// 🔒 El interruptor ROL_AVISOS_VIVO nace APAGADO: encenderlo es palabra de Memo
// después de ver el ensayo (CORREOS_MODO está en 'real').
// =============================================================================

const PF = require('./plan-fijo');
const PP = require('./plan-pagos');
const { saldoMigrado } = require('./cuenta-evento');
const { esDelEquipo } = require('./portal-revision');
const { esCorreoUsable, llaveCorreo } = require('./correo-forma');
const { fechaDeEventoId } = require('./fecha-evento');
const { cajaCuentaHtml } = require('./cuenta-deposito');

const ROL_AVISOS_VIVO = process.env.ROL_AVISOS_ARNES === '1' ? true : false;
const TIPOS = ['apertura', 'vence_hoy', 'vencido', 'antes_evento'];
const PESO = { vencido: 4, vence_hoy: 3, apertura: 2, antes_evento: 1 };
const DIAS_ANTES_EVENTO = 7;
const PORTAL = 'https://conectareynosa.mx/portal';
const VSEL = 'id,nombre,correo,evento_id,tipo_paquete,zona_boleto,boletos,total_contrato,abonado_previo,usuario_id,tipo_viajero,portal_revisado_at,fecha_separo,plan_pagos';

const hoyStr = (ahora) => new Date(ahora || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
function masDias(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n, 12));
  return t.toISOString().slice(0, 10);
}
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtCorta = (iso) => { const [, m, d] = String(iso || '').split('-').map(Number); return (d && m) ? d + ' ' + MES[m - 1] : ''; };
const fmtMxn = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function evDe(EV, eventoId) {
  if (!Array.isArray(EV)) return null;
  const slug = String(eventoId || '').split('#')[0];
  return EV.find((e) => e && e.id === slug) || null;
}

// ── PURO: ¿quién falta de fijar su rol? ────────────────────────────────────
// Publicados en el Portal (sellados), no del equipo, sin plan_pagos, con total,
// con saldo y con un evento que todavía viene. Un evento sin fecha legible se
// CUENTA aparte (no se puede armar un rol sin saber cuándo es el evento).
function pendientesDeFijar(filas, abonosPor, EV, ahora) {
  const hoy = hoyStr(ahora);
  const lista = [];
  let sin_fecha = 0;
  for (const v of filas || []) {
    if (!v || !v.portal_revisado_at || v.plan_pagos || esDelEquipo(v)) continue;
    const ab = (abonosPor && abonosPor[v.id]) || [];
    const s = saldoMigrado(v, ab);
    if (!s || !(s.total > 0) || !(s.resta > 0)) continue;
    const ev = evDe(EV, v.evento_id);
    const ds = ev ? PP.dsDeEvento(ev, v.evento_id) : null;
    if (!ds) { sin_fecha++; continue; }
    if (ds < hoy) continue;
    const primero = ab.find((a) => Number(a.monto) > 0 && a.fecha) || null;
    lista.push({
      viajero_id: v.id, nombre: v.nombre || null, evento_id: v.evento_id,
      evento: ev.a || v.evento_id, fecha: fechaDeEventoId(ev, v.evento_id) || null, ds,
      paquete: v.tipo_paquete || null, total: s.total, abonado: s.abonado, resta: s.resta,
      sugerido: primero ? { fecha: String(primero.fecha).slice(0, 10), monto: Number(primero.monto) || 0, origen: 'su primer abono registrado' } : null,
    });
  }
  lista.sort((a, b) => (a.ds < b.ds ? -1 : a.ds > b.ds ? 1 : String(a.nombre).localeCompare(String(b.nombre))));
  return { lista, sin_fecha };
}

// ── PURO: ¿qué aviso le toca HOY a cada viajero? ───────────────────────────
// Uno por viajero (el más urgente). Devuelve [{ v, tipo, cuota, st }].
function avisosDeHoy(filas, abonosPor, ahora) {
  const hoy = hoyStr(ahora);
  const out = [];
  for (const v of filas || []) {
    if (!v || !v.plan_pagos || !v.portal_revisado_at || esDelEquipo(v)) continue;
    if (!esCorreoUsable(v.correo)) continue;
    const ab = (abonosPor && abonosPor[v.id]) || [];
    const s = saldoMigrado(v, ab);
    if (!s) continue;
    const st = PF.estadoPlan(v.plan_pagos, { total: s.total, abonado: s.abonado, ahora });
    if (!st || st.estado !== 'calendario') continue;
    let mejor = null;
    for (const c of st.cuotas) {
      if (!(c.falta > 0)) continue;
      let tipo = null;
      if (c.liq) { if (c.hasta && masDias(c.hasta, -DIAS_ANTES_EVENTO) === hoy) tipo = 'antes_evento'; }
      else if (c.estado === 'vencida' && c.hasta && masDias(c.hasta, 1) === hoy) tipo = 'vencido';
      else if (c.hasta === hoy) tipo = 'vence_hoy';
      else if (c.fecha === hoy) tipo = 'apertura';
      if (tipo && (!mejor || PESO[tipo] > PESO[mejor.tipo])) mejor = { v, tipo, cuota: c, st, saldo: s };
    }
    if (mejor) out.push(mejor);
  }
  return out;
}

// ── El correo (estilo de los crons viejos del Portal) ──────────────────────
const ASUNTO = {
  apertura: (ev) => `Es momento de tu abono para ${ev} 🎵`,
  vence_hoy: (ev) => `Hoy vence tu abono para ${ev}`,
  vencido: (ev) => `Tu abono para ${ev} quedó pendiente`,
  antes_evento: (ev) => `Falta poco para ${ev}: liquida tu viaje`,
};

function bloqueViaje(a, evNombre) {
  const c = a.cuota, st = a.st;
  const pago = `tu pago ${c.n} (${esc(c.lbl)})`;
  let frase;
  if (a.tipo === 'apertura') frase = `Ya abrió la ventana de ${pago}. Tu abono es de <strong>${fmtMxn(c.falta)}</strong> y tienes hasta el <strong>${fmtCorta(c.hasta)}</strong>.`;
  else if (a.tipo === 'vence_hoy') frase = `Hoy es el último día de ${pago}: <strong>${fmtMxn(c.falta)}</strong>.`;
  else if (a.tipo === 'vencido') frase = `${pago.charAt(0).toUpperCase() + pago.slice(1)} cerró el ${fmtCorta(c.hasta)} y quedó pendiente <strong>${fmtMxn(c.falta)}</strong>. Tus demás fechas no cambian: este monto se suma aparte.`;
  else frase = `Te falta liquidar <strong>${fmtMxn(c.falta)}</strong> antes del evento (${fmtCorta(c.hasta)}).`;
  const atraso = (a.tipo !== 'vencido' && st.atrasado > 0)
    ? `<p style="margin:8px 0 0 0;font-size:13px;color:#ff8a95">Además tienes <strong>${fmtMxn(st.atrasado)}</strong> de pagos vencidos.</p>` : '';
  return `<div style="margin:0 0 16px 0;padding:14px 16px;border-left:3px solid #e8ff4c;background:rgba(255,255,255,.04)">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:6px">${esc(evNombre)}${a.v.nombre ? ' · ' + esc(a.v.nombre) : ''}</div>
    <p style="margin:0">${frase}</p>${atraso}
    <p style="margin:8px 0 0 0;font-size:13px;color:rgba(255,255,255,.6)">Llevas ${fmtMxn(a.saldo.abonado)} de ${fmtMxn(a.saldo.total)} · te faltan ${fmtMxn(st.resta)} en total.</p>
  </div>`;
}

function renderCorreo(grupo, ctx) {
  ctx = ctx || {};
  const prim = grupo[0];
  const tipo = grupo.reduce((t, a) => (PESO[a.tipo] > PESO[t] ? a.tipo : t), prim.tipo);
  const evPrim = (ctx.nombreEvento && ctx.nombreEvento(prim.v.evento_id)) || 'tu viaje';
  const asunto = ASUNTO[tipo](grupo.length > 1 ? 'tus viajes' : evPrim);
  const nombre = String(prim.v.nombre || 'cliente').trim().split(/\s+/)[0] || 'cliente';
  const bloques = grupo.map((a) => bloqueViaje(a, (ctx.nombreEvento && ctx.nombreEvento(a.v.evento_id)) || 'Tu viaje')).join('');
  const caja = ctx.cuentaDe ? cajaCuentaHtml(ctx.cuentaDe(prim.v)) : '';
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span> · Tu rol de pagos
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0;color:#fff">Hola <strong>${esc(nombre)}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">${bloques}
      <p style="margin:0 0 14px 0">Tus fechas son las de tu rol de pagos, fijas desde tu separo. Envíanos tu comprobante y lo registramos.</p>
      ${caja}
      <p style="margin:18px 0 0 0"><a href="${PORTAL}" style="display:inline-block;background:#e8ff4c;color:#000;font-weight:800;text-decoration:none;padding:12px 18px;border-radius:6px">Ver mi rol en el Portal →</a></p>
    </div>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Equipo Conecta Reynosa</p>
  </div>
</body></html>`;
  return { asunto, html, tipo };
}

function agruparPorCorreo(avisos) {
  const m = new Map();
  for (const a of avisos) {
    const k = llaveCorreo(a.v.correo);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(a);
  }
  return m;
}

// ── I/O ─────────────────────────────────────────────────────────────────────
async function leerAbonos(url, headers, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const r = await fetch(`${url}/rest/v1/abonos_viajero?viajero_id=in.(${chunk.join(',')})&select=viajero_id,monto,fecha&order=fecha.asc,created_at.asc&limit=10000`, { headers });
    if (!r.ok) throw new Error('abonos ' + r.status + ': ' + (await r.text()).slice(0, 200));
    for (const a of await r.json()) (out[a.viajero_id] = out[a.viajero_id] || []).push(a);
  }
  return out;
}

async function leerFilas(url, headers, filtro) {
  const r = await fetch(`${url}/rest/v1/viajeros_evento?${filtro}&select=${VSEL}&limit=5000`, { headers });
  if (!r.ok) throw new Error('viajeros ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.json();
}

// La cuenta de su paquete: la decide el dueño del Portal (con la excepción de
// la preventa). Sin banco legible no se pinta ninguna caja.
function cuentaDe(v) {
  try {
    const clave = require('../portal-mi-plan-migrado')._bancoDeViajero(v);
    const CI = require('./catalogo-index');
    const b = clave === 'banamex' ? CI._BANCO_HEY : clave === 'bbva' ? CI._BANCO_DEFAULT : null;
    return b ? { nombre: b.nombre, clabe: b.clabe, tarjeta: b.tarjeta, titular: b.titular } : null;
  } catch (_) { return null; }
}

// La bandeja «🗓 Fijar rol»: solo LEE.
async function listarPendientes({ url, headers, EV, ahora }) {
  const filas = await leerFilas(url, headers, 'portal_revisado_at=not.is.null&plan_pagos=is.null&total_contrato=gt.0');
  const ab = filas.length ? await leerAbonos(url, headers, filas.map((f) => f.id)) : {};
  return pendientesDeFijar(filas, ab, EV, ahora);
}

// La corrida. seco (default) = no escribe ni manda: devuelve a quién y el correo.
async function correrAvisos({ url, headers, EV, ahora, seco = true, enviar }) {
  const filas = await leerFilas(url, headers, 'portal_revisado_at=not.is.null&plan_pagos=not.is.null&correo=not.is.null');
  const ab = filas.length ? await leerAbonos(url, headers, filas.map((f) => f.id)) : {};
  const avisos = avisosDeHoy(filas, ab, ahora);
  const nombreEvento = (id) => { const ev = evDe(EV, id); return ev ? (ev.a || id) : null; };
  const grupos = agruparPorCorreo(avisos);
  const dia = hoyStr(ahora);
  const res = { dia, seco: !!seco, viajeros_con_rol: filas.length, avisos: avisos.length, correos: grupos.size,
    por_tipo: {}, enviados: 0, duplicados: 0, fallidos: 0, sin_bitacora: 0, muestra: [] };
  for (const a of avisos) res.por_tipo[a.tipo] = (res.por_tipo[a.tipo] || 0) + 1;
  for (const [correo, grupo] of grupos) {
    const r = renderCorreo(grupo, { nombreEvento, cuentaDe });
    const fila = { correo, asunto: r.asunto, tipo: r.tipo,
      viajes: grupo.map((a) => ({ viajero_id: a.v.id, nombre: a.v.nombre, evento_id: a.v.evento_id, tipo: a.tipo, cuota: a.cuota.n, lbl: a.cuota.lbl, falta: a.cuota.falta })) };
    if (seco) { if (res.muestra.length < 40) res.muestra.push(Object.assign(fila, res.muestra.length < 3 ? { html: r.html } : {})); continue; }
    // Apartar cada (viajero, cuota, tipo). Lo que ya salió se queda fuera.
    const apartados = [];
    let bitacoraCaida = false;
    for (const a of grupo) {
      const pr = await fetch(`${url}/rest/v1/rol_avisos`, { method: 'POST', headers: Object.assign({}, headers, { Prefer: 'return=representation' }),
        body: JSON.stringify({ viajero_id: a.v.id, cuota_n: a.cuota.n, tipo: a.tipo, correo, dia, monto: a.cuota.falta }) }).catch(() => null);
      if (pr && pr.ok) { const j = await pr.json(); apartados.push(j[0]); continue; }
      const t = pr ? await pr.text() : '';
      if (pr && (pr.status === 409 || /23505|rol_avisos_uq/.test(t))) { res.duplicados++; continue; }
      bitacoraCaida = true;
    }
    const libera = async () => { for (const f of apartados) await fetch(`${url}/rest/v1/rol_avisos?id=eq.${f.id}`, { method: 'DELETE', headers }).catch(() => null); };
    if (bitacoraCaida) { res.sin_bitacora++; await libera(); continue; } // sin bitácora no se manda
    if (!apartados.length) continue;
    const quedan = grupo.filter((a) => apartados.some((f) => f.viajero_id === a.v.id && f.cuota_n === a.cuota.n && f.tipo === a.tipo));
    const rr = renderCorreo(quedan, { nombreEvento, cuentaDe });
    const env = await enviar(correo, rr.asunto, rr.html).catch(() => null);
    if (!env || !env.ok) { res.fallidos++; await libera(); continue; }
    res.enviados++;
    if (env.id) for (const f of apartados) await fetch(`${url}/rest/v1/rol_avisos?id=eq.${f.id}`, { method: 'PATCH', headers, body: JSON.stringify({ email_id: env.id }) }).catch(() => null);
  }
  return res;
}

module.exports = {
  ROL_AVISOS_VIVO, TIPOS, VSEL, DIAS_ANTES_EVENTO,
  pendientesDeFijar, avisosDeHoy, renderCorreo, agruparPorCorreo, hoyStr, masDias,
  listarPendientes, correrAvisos, cuentaDe,
};
