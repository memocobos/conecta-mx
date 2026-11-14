#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// mide:rol-2027-1 — EL ROL SE FIJA SOLO AL REGISTRAR (tours 2027+) · 13-nov-2026
//
// Palabra de Memo: «TODOS LOS TOURS 2027 QUE SE SEPAREN, EL DÍA QUE HAGAMOS
// REGISTRO ES EL DÍA QUE SE CUENTA PARA SU ROL DE PAGOS A PARTIR DE AHÍ, PARA NO
// ESTAR METIENDO UNO POR UNO MANUAL».
//
//   [A] la regla PURA: hoy + lo pagado → lo que falta, parejo, y nadie nace con
//       un pago vencido · solo 2027 (la fecha de SU #N) · a quién NO le toca.
//   [B] fijarAlRegistrar con red falsa: escribe SOLO el calendario (ni un peso),
//       jamás pisa un rol, jamás lanza, y sin catálogo lo DICE.
//   [C] el ALTA MANUAL (handler real): el rol nace con el alta, después del
//       abono y antes del contrato; un tour 2026 no se toca.
//   [D] PUBLICAR en el Portal (handler real): sello → rol → correo; un 2026 va
//       «a mano»; si el rol falla, el publicar NO se cae.
//   [E] la bandeja: plan_pendientes trae la propuesta · rol_auto_fijar en seco
//       no escribe · con confirmar fija SOLO los 2027 · con ids, los elegidos.
//   [F] las pantallas (ejecutadas en vm): el Portal no dice «tu separo» · la
//       tarjeta pone ⚡ en verde para 2027 y la fecha real para 2026.
//
// ⚠️ SIN ANCLA a propósito (carga del árbol de trabajo, como mide:req-b1): mide
// lo que acabas de escribir y no puede traer control positivo POR COMMIT — sus
// controles son por construcción (el caso que NO debe pasar, sembrado).
// ⚠️ El reloj va CONGELADO (13-nov-2026, mediodía de Reynosa) y el catálogo es
// SINTÉTICO: un careo con el reloj real y el index real caduca el día que pase
// el evento del fixture (la lección de NUBE4-ARNES-1).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const L = (p) => path.join(RAIZ, 'netlify/functions', p);

process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.RESEND_API_KEY = 're_falso';
process.env.CORREOS_MODO = 'real';

// ── El reloj congelado ──────────────────────────────────────────────────────
const AHORA_ISO = '2026-11-13T18:00:00Z';     // 12:00 en Reynosa
const HOY = '2026-11-13';
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [AHORA_ISO])); }
  static now() { return new RealDate(AHORA_ISO).getTime(); }
};
const ahora = new Date();

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = typeof c === 'function' ? !!c() : !!c; } catch (_) { ok = false; }
  const msg = typeof m === 'function' ? (() => { try { return m(); } catch (e) { return '(msg) ' + e.message; } })() : m;
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } };

// ── El catálogo sintético (lo sirve el dueño de siempre, con el fetch cambiado)
const EV = [
  { id: 'tour27', a: 'Tour Veintisiete', ds: '2027-02-13', f: '13 feb 2027' },
  { id: 'tour26', a: 'Tour Veintiséis', ds: '2026-12-19', f: '19 dic 2026' },
  { id: 'multi', a: 'Multi Fechas', ds: '2026-12-20', f: '20 dic y 12 ene', multifecha: [{ ds: '2026-12-20', f: '20 Dic' }, { ds: '2027-01-12', f: '12 Ene' }] },
  { id: 'sinfecha', a: 'Sin Fecha Aún' },
  { id: 'pasado', a: 'Ya Pasó', ds: '2026-10-01', f: '1 oct 2026' },
];
const CI = require(L('_lib/catalogo-index.js'));
let catalogoCaido = false;
CI.fetchEventosRaw = async () => { if (catalogoCaido) throw new Error('CDN caído'); return EV; };

const PF = require(L('_lib/plan-fijo.js'));
const RAUTO = require(L('_lib/rol-auto.js'));

// ── La base de mentira: con ESTADO y con FILTROS (los de PostgREST que se usan)
const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
let DB, seqN = 100;
function semilla() {
  DB = { vj: [], ab: [], rev: [], seq: [], mails: 0, fallaPlan: false, usuarios: { 'u-roshi': 'maestro_roshi', 'u-coordi': 'coordinador' } };
}
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
function casa(fila, k, expr) {
  const v = fila[k];
  let m;
  if (expr === 'is.null') return v == null;
  if (expr === 'not.is.null') return v != null;
  if ((m = /^eq\.(.*)$/.exec(expr))) return String(v) === m[1];
  if ((m = /^neq\.(.*)$/.exec(expr))) return String(v) !== m[1];
  if ((m = /^gt\.(.*)$/.exec(expr))) return Number(v) > Number(m[1]);
  if ((m = /^in\.\((.*)\)$/.exec(expr))) return m[1].split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(v));
  if ((m = /^ilike\.(.*)$/.exec(expr))) return String(v == null ? '' : v).toLowerCase() === m[1].toLowerCase();
  if ((m = /^like\.(.*)\*$/.exec(expr))) return String(v == null ? '' : v).startsWith(m[1]);
  throw new Error('la red falsa no entiende el filtro ' + k + '=' + expr);
}
function filtra(tabla, qs) {
  const fuera = ['select', 'order', 'limit', 'offset'];
  let filas = tabla.slice();
  for (const [k, v] of qs.entries()) { if (fuera.includes(k)) continue; filas = filas.filter((f) => casa(f, k, v)); }
  return filas;
}
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase();
  const u = new URL(String(url));
  const p = u.pathname, qs = u.searchParams;
  const cuerpo = () => { try { return JSON.parse(init.body); } catch (_) { return null; } };
  DB.seq.push(m + ' ' + p.replace(/^.*\/(rest\/v1|storage\/v1)\//, '') + (m === 'PATCH' && /viajeros_evento/.test(p) ? ' [' + Object.keys(cuerpo() || {}).join(',') + ']' : ''));
  if (/resend\.com/.test(u.host)) { DB.mails++; return resp(200, { id: 'em-' + DB.mails }); }
  if (/\/storage\/v1\//.test(p)) return resp(200, { Key: 'ok' });
  if (/\/rest\/v1\/usuarios$/.test(p)) { const id = (/eq\.(.*)/.exec(qs.get('id') || '') || [])[1]; return resp(200, [{ id, activo: true, rol: DB.usuarios[id] || 'coordinador' }]); }
  if (/\/rest\/v1\/eventos_meta$/.test(p)) return resp(200, [{ slug: 'x' }]);
  if (/\/rest\/v1\/viajeros_evento$/.test(p)) {
    if (m === 'POST') { const f = Object.assign({ id: uuid(++seqN), plan_pagos: null, fecha_separo: null, usuario_id: null, creado_en: AHORA_ISO }, cuerpo()); DB.vj.push(f); return resp(201, [f]); }
    const filas = filtra(DB.vj, qs);
    if (m === 'PATCH') {
      const b = cuerpo();
      if (b && 'plan_pagos' in b && DB.fallaPlan) return resp(500, { message: 'falla sembrada' });
      filas.forEach((f) => Object.assign(f, b));
      return resp(200, filas.map((f) => Object.assign({}, f)));
    }
    if (m === 'DELETE') throw new Error('la casa no borra viajeros');
    return resp(200, filas.map((f) => Object.assign({}, f)));
  }
  if (/\/rest\/v1\/abonos_viajero$/.test(p)) {
    if (m === 'POST') { const b = cuerpo(); const arr = (Array.isArray(b) ? b : [b]).map((x) => Object.assign({ id: uuid(++seqN), fecha: HOY, created_at: AHORA_ISO }, x)); DB.ab.push(...arr); return resp(201, arr); }
    if (m !== 'GET') throw new Error('escritura inesperada a abonos_viajero: ' + m);
    return resp(200, filtra(DB.ab, qs));
  }
  if (/\/rest\/v1\/portal_revisiones$/.test(p)) {
    if (m === 'POST') { const b = cuerpo(); const arr = (Array.isArray(b) ? b : [b]).map((x) => Object.assign({ id: uuid(++seqN) }, x)); DB.rev.push(...arr); return resp(201, arr); }
    const filas = filtra(DB.rev, qs);
    if (m === 'PATCH') { filas.forEach((f) => Object.assign(f, cuerpo())); return resp(200, filas.map((f) => Object.assign({}, f))); }
    return resp(200, filas.map((f) => Object.assign({}, f)));
  }
  // Lo demás (stock, contratos, bitácoras): no es de esta tuerca.
  return resp(200, []);
};

const { jwtSign } = require(L('_lib/verify-admin.js'));
const tokDe = (id, rol) => jwtSign({ id, rol, correo: id + '@x.mx', nombre: id === 'u-roshi' ? 'Memo' : 'Coordi' }, process.env.JWT_SECRET, 3600);
const TOK = tokDe('u-roshi', 'maestro_roshi');
const llama = (archivo, body, tok) => require(L(archivo)).handler({ httpMethod: 'POST', path: '/.netlify/functions/' + archivo.replace('.js', ''),
  headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + (tok || TOK) }, body: JSON.stringify(body) });
const cuerpoDe = (r) => { try { return JSON.parse(r.body); } catch (_) { return {}; } };
const fila = (o) => Object.assign({ id: uuid(++seqN), nombre: 'Prueba', correo: null, evento_id: 'tour27', tipo_paquete: 'plus', total_contrato: 5300,
  abonado_previo: 2900, usuario_id: null, tipo_viajero: 'cliente', portal_revisado_at: '2026-11-10T00:00:00Z', fecha_separo: null, plan_pagos: null, boletos: 1 }, o || {});
const planes = () => DB.seq.filter((s) => /^PATCH viajeros_evento \[fecha_separo,plan_pagos\]$/.test(s)).length;
const dinero = () => DB.seq.filter((s) => /abonos_viajero/.test(s) && !/^GET/.test(s)).length;

(async () => {
  console.log('══ mide:rol-2027-1 ══ (reloj congelado: ' + HOY + ')');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[A] la regla pura');
  const tania = fila({ nombre: 'Tania Prueba', abonado_previo: 2420 });
  const pA = RAUTO.propuesta(tania, [{ monto: 480, fecha: '2026-11-02' }], EV, ahora);
  af(() => (pA.ok && pA.fecha === HOY && pA.separo === 2900 && pA.resta === 2400), () => 'cuenta desde HOY con lo que lleva pagado ($2,900) y le faltan $2,400 → ' + JSON.stringify({ f: pA.fecha, s: pA.separo, r: pA.resta }));
  af(() => (pA.plan.cuotas.length === 5 && pA.plan.cuotas.every((c) => c.monto === 480)), () => 'lo que falta, PAREJO en las quincenas que quedan: ' + pA.plan.cuotas.map((c) => c.monto).join(','));
  af(() => (pA.plan.cuotas[0].ini === '2026-11-24' && pA.plan.cuotas.every((c) => c.ini > HOY)), () => 'nadie nace con un pago vencido: la 1ª ventana abre el ' + pA.plan.cuotas[0].ini);
  af(() => (pA.plan.origen === 'registro' && pA.plan.separo_fecha === HOY), 'el plan dice de dónde salió su fecha (origen: registro)');
  const stA = PF.estadoPlan(pA.plan, { total: 5300, abonado: 2900, ahora });
  af(() => (stA.estado === 'calendario' && stA.atrasado === 0 && stA.proxima.n === 1 && stA.proxima.monto === 480 && stA.origen === 'registro'), 'al nacer: sin atraso, próximo pago el 1 ($480), y el estado conserva el origen');
  af(() => (/^5 pagos de \$480 · el 1º del 24 Noviembre al 1 de Diciembre$/.test(pA.resumen.texto)), () => 'la frase del rol: «' + pA.resumen.texto + '»');
  // El dueño de las fechas es plan-fijo: la propuesta es SU plan, no otro.
  const directo = PF.armarPlanFijo({ separo_fecha: HOY, separo_monto: 2900, total: 5300, paquete: 'plus', ds: '2027-02-13' });
  af(() => (JSON.stringify(directo.cuotas) === JSON.stringify(pA.plan.cuotas) && !('origen' in directo)), 'las cuotas son las del dueño (armarPlanFijo) byte a byte · y sin `origen` el plan de siempre no cambia');
  af(() => (!('origen' in PF.estadoPlan(directo, { total: 5300, abonado: 2900, ahora }))), 'un plan de separo real no gana la llave `origen`');
  // Solo 2027 — y la fecha es la de SU #N.
  const p26 = RAUTO.propuesta(fila({ evento_id: 'tour26' }), [], EV, ahora);
  af(() => (!p26.ok && p26.auto === false && /2026/.test(p26.motivo)), () => 'un tour 2026 NO se fija solo: «' + p26.motivo + '»');
  af(() => (RAUTO.propuesta(fila({ evento_id: 'tour26' }), [], EV, ahora, { solo2027: false }).ok), 'CONTROL: ese mismo viaje SÍ se puede fijar desde hoy si un humano lo elige');
  af(() => (RAUTO.propuesta(fila({ evento_id: 'multi#1' }), [], EV, ahora).ok && !RAUTO.propuesta(fila({ evento_id: 'multi#0' }), [], EV, ahora).ok), 'multifecha: manda la fecha de SU #N (12-ene-2027 sí · 20-dic-2026 no), no la del evento');
  af(() => (!RAUTO.propuesta(fila({ plan_pagos: directo }), [], EV, ahora).ok), 'con rol → no se toca');
  af(() => (!RAUTO.propuesta(fila({ usuario_id: 'u1' }), [], EV, ahora).ok && !RAUTO.propuesta(fila({ tipo_viajero: 'coordinador' }), [], EV, ahora).ok), 'del equipo → no lleva rol');
  af(() => (!RAUTO.propuesta(fila({ total_contrato: null }), [], EV, ahora).ok && !RAUTO.propuesta(fila({ total_contrato: 0 }), [], EV, ahora).ok), 'sin total → no (y no inventa un calendario de $0)');
  af(() => (!RAUTO.propuesta(fila({ abonado_previo: 5300 }), [], EV, ahora).ok), 'liquidado → nada que calendarizar');
  const liq = RAUTO.propuesta(fila({ tipo_paquete: 'cheap', total_contrato: 300, abonado_previo: 300 }), [], EV, ahora, { aunLiquidado: true });
  af(() => (liq.ok && liq.plan.cuotas.every((c) => c.monto === 0) && liq.plan.ventanas.length > 0 && PF.estadoPlan(liq.plan, { total: 300, abonado: 300, ahora }).estado === 'liquidado'), 'pero AL REGISTRAR sí nace su rol (cuotas en $0, ventanas guardadas) y se sigue viendo «liquidado»');
  const sube = PF.rerepartir(liq.plan, { total: 6300, paquete: 'plus', ahora: new Date('2026-12-05T18:00:00Z') });
  af(() => (sube.cuotas.length > 0 && sube.cuotas.every((c) => c.ini > '2026-12-05') && sube.cuotas.reduce((a, c) => a + c.monto, 0) === 6000), () => 'y si después le SUBE el total (elige paquete), el reparto cae solo en las ventanas que quedan: ' + sube.cuotas.length + ' pagos por $6,000');
  af(() => (!RAUTO.propuesta(fila({ evento_id: 'sinfecha' }), [], EV, ahora).ok && !RAUTO.propuesta(fila({ evento_id: 'pasado' }), [], EV, ahora, { solo2027: false }).ok && !RAUTO.propuesta(fila({ evento_id: 'noexiste' }), [], EV, ahora).ok), 'evento sin fecha / pasado / fuera del catálogo → no');
  const cheap = RAUTO.propuesta(fila({ tipo_paquete: 'cheap', total_contrato: 3000, abonado_previo: 300 }), [], EV, ahora);
  af(() => (cheap.ok && cheap.plan.cuotas.length === 4 && cheap.plan.cuotas.reduce((s, c) => s + c.monto, 0) === 2700), 'CHEAP: sus 4 pagos de siempre, contados desde hoy');
  const tarde = RAUTO.propuesta(fila({ evento_id: 'tour27', total_contrato: 1000, abonado_previo: 0 }), [], [{ id: 'tour27', a: 'T', ds: '2027-01-02' }], new Date('2026-12-28T18:00:00Z'));
  af(() => (tarde.ok && tarde.resumen.liq === true && /antes del evento/.test(tarde.resumen.texto)), 'registrado a días del evento: «liquida antes del evento», no una quincena inventada');
  af(() => (RAUTO.resumir({ cuotas: [{ n: 1, lbl: 'A', monto: 106 }, { n: 2, lbl: 'B', monto: 106 }, { n: 3, lbl: 'C', monto: 103 }] }).texto === '3 pagos: 2 de $106 y el último de $103 · el 1º del A'), 'cuando el último ajusta, la frase lo dice (no redondea a «3 de $106»)');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[B] fijarAlRegistrar (red falsa con estado)');
  semilla();
  const b1 = fila({ nombre: 'Uno' }), b26 = fila({ nombre: 'Del 26', evento_id: 'tour26' }), bPlan = fila({ nombre: 'Con Rol', plan_pagos: directo, fecha_separo: '2026-10-01' });
  DB.vj.push(b1, b26, bPlan); DB.ab.push({ id: uuid(1), viajero_id: b1.id, monto: 100, fecha: '2026-11-05' });
  const rB = await RAUTO.fijarAlRegistrar({ url: 'https://kh.falso.test', headers: {}, ids: [b1.id, b26.id, bPlan.id, 'no-es-uuid'], por: 'arnés' });
  af(() => (rB.fijados.length === 1 && rB.fijados[0].viajero_id === b1.id && b1.plan_pagos && b1.fecha_separo === HOY), 'fija al de 2027 (y solo a él)');
  af(() => (b1.plan_pagos.separo_monto === 3000 && b1.plan_pagos.origen === 'registro' && b1.plan_pagos.creado_por === 'arnés'), () => 'lo pagado lo cuenta el dueño del dinero: previo $2,900 + abono $100 = $' + b1.plan_pagos.separo_monto);
  af(() => (planes() === 1 && dinero() === 0), () => '🔒 escribe SOLO el calendario (fecha_separo + plan_pagos) y NI UN PESO (' + planes() + ' plan, ' + dinero() + ' escrituras a abonos)');
  af(() => (rB.saltados.some((s) => s.viajero_id === b26.id && s.auto === false) && b26.plan_pagos === null), 'el de 2026 se salta y se DICE que no es de la regla (auto:false)');
  af(() => (rB.saltados.some((s) => s.viajero_id === bPlan.id) && bPlan.fecha_separo === '2026-10-01'), 'el que ya tenía rol NO se pisa');
  const rB2 = await RAUTO.fijarAlRegistrar({ url: 'https://kh.falso.test', headers: {}, ids: [b1.id] });
  af(() => (rB2.fijados.length === 0 && planes() === 1), '2º llamado: no vuelve a escribir (idempotente)');
  // La carrera: alguien lo fijó entre la lectura y el PATCH → el valor esperado no lo deja pisar.
  semilla(); const c1 = fila({ nombre: 'Carrera' }); DB.vj.push(c1);
  const fetchReal = global.fetch;
  global.fetch = async (url, init) => { if (init && init.method === 'PATCH') { c1.plan_pagos = directo; c1.fecha_separo = '2026-10-01'; } return fetchReal(url, init); };
  const rC = await RAUTO.fijarAlRegistrar({ url: 'https://kh.falso.test', headers: {}, ids: [c1.id] });
  global.fetch = fetchReal;
  af(() => (rC.fijados.length === 0 && c1.fecha_separo === '2026-10-01' && /no se pisó/.test(rC.saltados[0].motivo)), '🔒 carrera: el PATCH lleva `plan_pagos=is.null` y no pisa el rol que otro acaba de fijar');
  semilla(); const d1 = fila(); DB.vj.push(d1); catalogoCaido = true;
  const rD = await RAUTO.fijarAlRegistrar({ url: 'https://kh.falso.test', headers: {}, ids: [d1.id] });
  catalogoCaido = false;
  af(() => (rD.fijados.length === 0 && /catálogo/.test(rD.error) && rD.saltados.length === 1 && planes() === 0), 'sin catálogo NO se arma nada y se DICE (no un «0 fijados» mudo)');
  semilla(); global.fetch = async () => { throw new Error('red caída'); };
  let lanzo = false, rE = null; try { rE = await RAUTO.fijarAlRegistrar({ url: 'https://kh.falso.test', headers: {}, ids: [uuid(5)] }); } catch (_) { lanzo = true; }
  global.fetch = fetchReal;
  af(() => (!lanzo && rE && rE.error && rE.fijados.length === 0), '🔒 jamás lanza: con la red caída devuelve el error en vez de tumbar a quien lo llamó');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[C] el alta manual (admin-coordi-asignaciones · viajero_migrar, handler real)');
  const alta = (x) => llama('admin-coordi-asignaciones.js', Object.assign({ accion: 'viajero_migrar', evento_id: 'tour27', nombre: 'Alta Arnés', tipo_paquete: 'ride', total_contrato: 2700, abonado_previo: 300 }, x));
  semilla();
  let r = await alta({});
  let j = cuerpoDe(r);
  const vAlta = DB.vj[0];
  af(() => (r.statusCode === 200 && j.rol && j.rol.fijado === true && vAlta && vAlta.plan_pagos && vAlta.fecha_separo === HOY), () => 'alta de un tour 2027 → nace CON su rol, contado desde hoy (' + r.statusCode + ' · ' + JSON.stringify(j.rol) + ')');
  af(() => (vAlta.plan_pagos.separo_monto === 300 && vAlta.plan_pagos.cuotas.reduce((s, c) => s + c.monto, 0) === 2400 && vAlta.plan_pagos.origen === 'registro'), 'su punto de partida es lo que pagó al registrarse ($300) y el resto ($2,400) se reparte');
  af(() => (/^\d+ pagos? /.test(j.rol.texto)), () => 'la respuesta trae la frase para el aviso: «' + j.rol.texto + '»');
  const iPost = DB.seq.findIndex((s) => /^POST viajeros_evento/.test(s)), iPlan = DB.seq.findIndex((s) => /\[fecha_separo,plan_pagos\]/.test(s)), iCtr = DB.seq.findIndex((s) => /contratos_cliente/.test(s));
  af(() => (iPost > -1 && iPlan > iPost), 'orden: primero nace el viajero, luego su rol');
  af(() => (iCtr > -1 && iPlan < iCtr), () => 'y el rol va ANTES del contrato (premisa: el contrato sí se pidió → ' + (iCtr > -1) + ')');
  semilla();
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  r = await alta({ abonado_previo: 900, foto: PNG, contrato: false }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && DB.ab.length === 1 && DB.vj[0].abonado_previo === 0 && DB.vj[0].plan_pagos && DB.vj[0].plan_pagos.separo_monto === 900), () => 'con comprobante: lo pagado vive en el ABONO y el rol lo lee de ahí ($' + ((DB.vj[0].plan_pagos || {}).separo_monto) + ', no del formulario)');
  af(() => (DB.seq.findIndex((s) => /^POST abonos_viajero/.test(s)) < DB.seq.findIndex((s) => /\[fecha_separo,plan_pagos\]/.test(s))), 'orden: el abono nace ANTES que el rol');
  semilla();
  r = await alta({ evento_id: 'tour26', contrato: false }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && DB.vj[0].plan_pagos === null && j.rol && j.rol.fijado === false && j.rol.es2027 === false && planes() === 0), 'alta de un tour 2026 → SIN rol automático (su separo real se captura a mano) y se dice');
  semilla(); DB.fallaPlan = true;
  r = await alta({ contrato: false }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && DB.vj.length === 1 && j.viajero && j.rol && j.rol.fijado === false && j.rol.es2027 === true), '🔒 si el rol falla, el ALTA no se cae: el viajero existe y la respuesta dice que su rol quedó pendiente');
  semilla();
  r = await alta({ abonado_previo: 2700, contrato: false }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && DB.vj[0].plan_pagos && DB.vj[0].plan_pagos.cuotas.every((c) => c.monto === 0) && j.rol.fijado === true && j.rol.n === 0), 'alta ya liquidada (p. ej. preventa $300/$300) → nace con su rol en $0: si le sube el total, se reparte solo');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[D] publicar en el Portal (admin-portal-revision, handler real)');
  const revDe = (correo, tipo) => { const x = { id: uuid(++seqN), tipo: tipo || 'revisar', estado: 'pendiente', correo, viajero_ids: [], creado_en: AHORA_ISO, nota_staff: null, antes: null }; DB.rev.push(x); return x; };
  semilla();
  let v27 = fila({ nombre: 'Ana Dosmil27', correo: 'ana@x.com', portal_revisado_at: null }), v26 = fila({ nombre: 'Ana Dosmil26', correo: 'ana@x.com', evento_id: 'tour26', portal_revisado_at: null, total_contrato: 4000, abonado_previo: 1000 });
  DB.vj.push(v27, v26); let rev = revDe('ana@x.com');
  r = await llama('admin-portal-revision.js', { accion: 'fila_publicar', id: rev.id, viajero_id: v27.id }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && v27.portal_revisado_at && v27.plan_pagos && v27.plan_pagos.origen === 'registro' && v27.fecha_separo === HOY), () => 'publicar UN viaje 2027 → sellado y con su rol desde hoy (' + r.statusCode + ' ' + (j.error || '') + ')');
  af(() => (j.rol && j.rol.fijados.length === 1 && /pagos? /.test(j.rol.fijados[0].texto) && j.rol.a_mano === 0), 'la respuesta lo dice (para el aviso de la pantalla)');
  af(() => (DB.seq.findIndex((s) => /\[portal_revisado_at,portal_revisado_por\]/.test(s)) < DB.seq.findIndex((s) => /\[fecha_separo,plan_pagos\]/.test(s))), 'orden: primero el sello, luego el rol');
  af(() => (planes() === 1 && dinero() === 0), '🔒 publicar no escribe un peso: un plan, cero abonos');
  r = await llama('admin-portal-revision.js', { accion: 'fila_publicar', id: rev.id, viajero_id: v26.id }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && v26.portal_revisado_at && v26.plan_pagos === null && j.rol && j.rol.fijados.length === 0 && j.rol.a_mano === 1), 'publicar un viaje 2026 → sellado, SIN rol, y avisa que va «a mano»');
  af(() => (j.cierre && j.cierre.cerrada === true && DB.mails === 1), 'al terminar la revisión sale UN correo (como siempre)');
  // Una sola fila: el rol queda ANTES del correo «ya puedes ver tu viaje».
  semilla(); v27 = fila({ nombre: 'Beto', correo: 'beto@x.com', portal_revisado_at: null }); DB.vj.push(v27); rev = revDe('beto@x.com');
  r = await llama('admin-portal-revision.js', { accion: 'fila_publicar', id: rev.id, viajero_id: v27.id });
  const iRol = DB.seq.findIndex((s) => /\[fecha_separo,plan_pagos\]/.test(s)), iMail = DB.seq.findIndex((s) => /emails/.test(s));
  af(() => (iRol > -1 && iMail > -1 && iRol < iMail), 'el rol se fija ANTES del correo: cuando entra a su Portal ya ve su calendario');
  // «Publicar las N que faltan»
  semilla(); v27 = fila({ nombre: 'Caro 27', correo: 'caro@x.com', portal_revisado_at: null }); v26 = fila({ nombre: 'Caro 26', correo: 'caro@x.com', evento_id: 'tour26', portal_revisado_at: null });
  DB.vj.push(v27, v26); rev = revDe('caro@x.com');
  r = await llama('admin-portal-revision.js', { accion: 'publicar', id: rev.id, nota: 'ok' }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && j.publicadas === 2 && v27.plan_pagos && !v26.plan_pagos && j.rol.fijados.length === 1 && j.rol.a_mano === 1), 'publicar de golpe: el 2027 con rol, el 2026 a mano');
  // «🪪 Revisados para el Portal» (adelanto, desde Capsule)
  semilla(); v27 = fila({ nombre: 'Dani 27', portal_revisado_at: null }); v26 = fila({ nombre: 'Dani 26', evento_id: 'tour26', portal_revisado_at: null }); const yaSellado = fila({ nombre: 'Ya sellado' });
  DB.vj.push(v27, v26, yaSellado);
  r = await llama('admin-portal-revision.js', { accion: 'adelanto', viajero_ids: [v27.id, v26.id, yaSellado.id] }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && j.publicadas === 2 && v27.plan_pagos && !v26.plan_pagos && !yaSellado.plan_pagos && j.rol.fijados.length === 1), 'revisar por adelantado: lo RECIÉN sellado de 2027 nace con rol (lo ya sellado no se toca aquí)');
  // Si el rol falla, publicar NO se cae.
  semilla(); v27 = fila({ nombre: 'Falla', correo: 'f@x.com', portal_revisado_at: null }); DB.vj.push(v27); rev = revDe('f@x.com'); DB.fallaPlan = true;
  r = await llama('admin-portal-revision.js', { accion: 'fila_publicar', id: rev.id, viajero_id: v27.id }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && v27.portal_revisado_at && !v27.plan_pagos && j.rol && j.rol.fijados.length === 0), '🔒 si el rol falla, el viaje se publica igual (cae a «Rol por fijar») y no se inventa un «fijado»');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[E] la bandeja (plan_pendientes · rol_auto_fijar)');
  const siembraE = () => {
    semilla();
    const a = fila({ nombre: 'A 2027' }), b = fila({ nombre: 'B 2027', total_contrato: 6000, abonado_previo: 0 }), c = fila({ nombre: 'C 2026', evento_id: 'tour26', total_contrato: 4000, abonado_previo: 1000 });
    const d = fila({ nombre: 'D sin publicar', portal_revisado_at: null }), e = fila({ nombre: 'E con rol', plan_pagos: directo }), f = fila({ nombre: 'F liquidado', abonado_previo: 5300 });
    DB.vj.push(a, b, c, d, e, f); return { a, b, c, d, e, f };
  };
  let S = siembraE();
  r = await llama('admin-coordi-asignaciones.js', { accion: 'plan_pendientes' }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && j.pendientes.length === 3 && j.de2027 === 2), () => 'la lista de siempre (publicados, sin rol, con saldo): 3 · de tours 2027: ' + j.de2027);
  const pa = j.pendientes.find((x) => x.viajero_id === S.a.id), pc = j.pendientes.find((x) => x.viajero_id === S.c.id);
  af(() => (pa.es2027 === true && pa.auto && /5 pagos de \$480/.test(pa.auto.texto) && pc.es2027 === false && pc.auto && pc.auto.fecha === HOY), 'cada quien trae su PROPUESTA desde hoy; el 2026 también la trae (rotulado es2027:false)');
  af(() => (planes() === 0), 'plan_pendientes solo LEE');
  r = await llama('admin-coordi-asignaciones.js', { accion: 'rol_auto_fijar' }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && j.seco === true && j.tocan.length === 2 && planes() === 0), '🔒 sin `confirmar` es EN SECO: dice a quién (2) y no escribe');
  r = await llama('admin-coordi-asignaciones.js', { accion: 'rol_auto_fijar', confirmar: true }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && j.fijados.length === 2 && S.a.plan_pagos && S.b.plan_pagos && !S.c.plan_pagos && !S.d.plan_pagos && S.e.plan_pagos === directo), '«Fijar de una vez»: SOLO los publicados de tours 2027 (el 2026, el sin publicar y el que ya tenía rol, intactos)');
  af(() => (S.b.plan_pagos.separo_monto === 0 && S.b.plan_pagos.cuotas.reduce((s, c) => s + c.monto, 0) === 6000), 'quien no ha pagado nada: separo $0 y todo su total repartido');
  r = await llama('admin-coordi-asignaciones.js', { accion: 'rol_auto_fijar', confirmar: true }); j = cuerpoDe(r);
  af(() => (j.fijados.length === 0 && planes() === 2), '2º clic: nada que fijar, nada que pisar');
  r = await llama('admin-coordi-asignaciones.js', { accion: 'rol_auto_fijar', viajero_ids: [S.c.id], confirmar: true }); j = cuerpoDe(r);
  af(() => (j.fijados.length === 1 && S.c.plan_pagos && S.c.plan_pagos.origen === 'registro'), 'con ids: el que un humano eligió se fija desde hoy aunque sea de 2026');
  r = await llama('admin-coordi-asignaciones.js', { accion: 'rol_auto_fijar', viajero_ids: [S.e.id, S.f.id], confirmar: true }); j = cuerpoDe(r);
  af(() => (j.fijados.length === 0 && j.saltados.length === 2 && S.e.plan_pagos === directo), 'con ids de quien ya tiene rol o está liquidado: se salta CON motivo');
  r = await llama('admin-coordi-asignaciones.js', { accion: 'rol_auto_fijar', viajero_ids: ['x'], confirmar: true });
  af(() => (r.statusCode === 400), 'ids inválidos → 400');
  S = siembraE();
  r = await llama('admin-coordi-asignaciones.js', { accion: 'rol_auto_fijar', confirmar: true }, tokDe('u-coordi', 'coordinador'));
  af(() => (r.statusCode === 403 && planes() === 0), 'un coordinador no puede fijar roles (403, cero escrituras)');
  const coordiSrc = fs.readFileSync(L('admin-coordi-asignaciones.js'), 'utf8');
  af(() => (/rol_auto_fijar: ROLES_EDITA_VIAJERO/.test(coordiSrc)), 'rol_auto_fijar está en ACCIONES (o el portero la rechaza)');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[F] las pantallas');
  const ph = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
  const i0 = ph.indexOf('function _migPagosHtml(t){'), i1 = ph.indexOf('function _migGrupoHtml(t){');
  const ctxP = { escapeHtml: (s) => String(s == null ? '' : s).replace(/</g, '&lt;') };
  vm.createContext(ctxP); vm.runInContext(ph.slice(i0, i1), ctxP);
  const pinta = (plan) => vm.runInContext('_migPagosHtml', ctxP)({ viajero_id: 'v1', total: 5300, abonado: 2900, abonado_previo: 2900, abonos: [], plan, banco: 'bbva' });
  const hReg = pinta(stA);
  af(() => (/fijo desde el 13 nov/.test(hReg) && !/desde tu separo/.test(hReg) && /lo que ya habías pagado está contado/.test(hReg)), 'el Portal NO le dice «tu separo del 13 nov» a quien se registró ese día: dice desde cuándo y que lo pagado cuenta');
  const hSep = pinta(PF.estadoPlan(PF.armarPlanFijo({ separo_fecha: '2026-10-29', separo_monto: 300, total: 4200, paquete: 'stay', ds: '2027-01-11' }), { total: 4200, abonado: 300, ahora }));
  af(() => (/fijo desde tu separo \(29 oct\)/.test(hSep)), 'CONTROL: un rol de separo real sigue diciendo «desde tu separo (29 oct)»');
  // La tarjeta de la bandeja, ejecutada.
  const els = {};
  const nodo = (id) => els[id] || (els[id] = { id, innerHTML: '', value: '', dataset: {}, style: {}, parentNode: { insertBefore: () => {} }, appendChild: () => {} });
  const llamadas = [], toasts = [], conteos = [];
  let respPend = null, confirma = true;
  const ctxK = {
    document: { getElementById: (id) => (['req-rol-fijar', 'req-bdj-lista'].includes(id) || els[id] ? nodo(id) : null), createElement: () => nodo('nuevo') },
    khAdminFetch: async () => ({ ok: true, status: 200, json: async () => respPend }),
    khViajeros: { rolAutoFijar: async (ids, c) => { llamadas.push({ ids, c }); return { ok: true, fijados: [{ viajero_id: 'x', texto: '5 pagos de $480' }], saltados: [] }; }, planFijar: async () => ({ ok: true }) },
    showToast: (t, k) => toasts.push([t, k]), confirm: () => confirma,
    _reqSecH: (t, q, n) => `<h>${t}|${n}</h>`, _reqContar: (s, n) => conteos.push([s, n]), _prvExtra: () => null, console,
  };
  vm.createContext(ctxK); vm.runInContext(fs.readFileSync(path.join(RAIZ, 'kamehouse-rol-fijar.js'), 'utf8'), ctxK);
  S = siembraE();
  respPend = cuerpoDe(await llama('admin-coordi-asignaciones.js', { accion: 'plan_pendientes' }));
  await vm.runInContext('loadRolPendientes()', ctxK);
  const html = nodo('req-rol-fijar').innerHTML;
  af(() => (/Fijar los 2 de una vez/.test(html) && conteos.some((c) => c[0] === 'rol' && c[1] === 3)), 'la tarjeta ofrece «Fijar los 2 de una vez» y le cuenta 3 al mapa');
  const trozo = (id) => { const i = html.indexOf('id="rf-' + id + '"'); const k = html.indexOf('class="rq-cambio rf-fila"', i + 10); return html.slice(i, k < 0 ? html.length : k); };
  const t27 = trozo(S.a.id), t26 = trozo(S.c.id);
  af(() => (/class="rq-btn pri" onclick="_rfFijarHoy\(/.test(t27) && /class="rq-btn" onclick="_rfFijar\(/.test(t27) && /5 pagos de \$480/.test(t27)), 'tour 2027: el paso en verde es «⚡ Fijar desde hoy» y la propuesta viene escrita');
  af(() => (/class="rq-btn pri" onclick="_rfFijar\(/.test(t26) && /class="rq-btn" onclick="_rfFijarHoy\(/.test(t26) && /del Excel/.test(t26)), 'tour 2026: el paso en verde es su fecha de separo real (desde hoy queda como opción)');
  confirma = false; await vm.runInContext('_rfFijarHoyTodos(2)', ctxK);
  af(() => (llamadas.length === 0), 'sin confirmar, «Fijar de una vez» no llama al servidor');
  confirma = true; await vm.runInContext('_rfFijarHoyTodos(2)', ctxK);
  af(() => (llamadas.length === 1 && llamadas[0].ids === null && llamadas[0].c === true), 'confirmado: pide la regla SIN ids (el servidor decide quiénes son 2027) y con confirmar');
  await vm.runInContext(`_rfFijarHoy('${S.c.id}')`, ctxK);
  af(() => (llamadas.length === 2 && llamadas[1].ids[0] === S.c.id && llamadas[1].c === true), '«⚡ Fijar desde hoy» de una fila manda SU id');
  const cap = fs.readFileSync(path.join(RAIZ, 'kamehouse-capsule.js'), 'utf8');
  const khjs = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  af(() => (/ro\.fijado && ro\.n > 0\) showToast\('🗓 Rol de pagos fijo desde hoy/.test(cap) && /rolAutoFijar\(viajero_ids, confirmar\)/.test(khjs) && /function _vjPlanFijarHoy\(/.test(khjs)), 'Capsule: el alta DICE que su rol quedó fijo y el 🗓 Plan tiene «⚡ Fijar desde hoy»');
  const revSrc = fs.readFileSync(L('admin-portal-revision.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  af(() => ((revSrc.match(/await rolAlPublicar\(/g) || []).length === 3), () => 'el Portal fija el rol en sus TRES sellos (publicar · fila_publicar · adelanto): ' + (revSrc.match(/await rolAlPublicar\(/g) || []).length);

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[G] lo que sigue solo: sus recordatorios caen en las fechas de ESE rol');
  const RAV = require(L('_lib/rol-avisos.js'));
  const conRol = Object.assign({}, tania, { correo: 'tania@x.com', plan_pagos: pA.plan, fecha_separo: HOY });
  const abT = { [tania.id]: [{ monto: 480, fecha: '2026-11-02' }] };
  const el = (d) => RAV.avisosDeHoy([conRol], abT, new Date(d + 'T18:00:00Z'));
  af(() => (el('2026-11-14').length === 0 && el('2026-11-23').length === 0), 'fijar su rol hoy NO le dispara un correo ni hoy ni mañana (nadie nace con un pago abierto)');
  af(() => (el('2026-11-24').length === 1 && el('2026-11-24')[0].tipo === 'apertura' && el('2026-11-24')[0].cuota.falta === 480), 'el 24-nov abre su primera ventana → ese día le llega «es momento de tu abono» por $480');
  af(() => (el('2026-12-01')[0].tipo === 'vence_hoy' && el('2026-12-02')[0].tipo === 'vencido'), 'y la escalera de siempre: último día (1-dic) y vencido (2-dic) si no pagó');
  const mail = RAV.renderCorreo(el('2026-11-24'), { nombreEvento: () => 'Tour Veintisiete' });
  af(() => (/son fijas y ya no cambian/.test(mail.html) && !/desde tu separo/.test(mail.html)), 'el recordatorio de un rol «al registrar» no dice «fijas desde tu separo»');
  const sepPlan = PF.armarPlanFijo({ separo_fecha: '2026-10-29', separo_monto: 300, total: 4200, paquete: 'stay', ds: '2027-01-11' });
  const mail2 = RAV.renderCorreo(RAV.avisosDeHoy([Object.assign({}, tania, { correo: 't@x.com', total_contrato: 4200, abonado_previo: 300, plan_pagos: sepPlan })], {}, new Date('2026-11-09T18:00:00Z')), { nombreEvento: () => 'T' });
  af(() => (/fijas desde tu separo/.test(mail2.html)), 'CONTROL: el de un rol de separo real lo sigue diciendo');

  console.log('\n' + (V === 0 ? 'NADA MEDIDO · esto NO es un verde' : (R ? '🔴 ROJO' : '✅ VERDE')) + ' · ' + V + ' en verde, ' + R + ' en rojo');
  process.exit(R || !V ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + (e && e.stack)); process.exit(1); });
