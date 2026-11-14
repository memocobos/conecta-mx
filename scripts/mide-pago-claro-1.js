#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// mide:pago-claro-1 — EL COMPROBANTE CON SU CUENTA ENFRENTE (13-nov-2026)
//
// Palabra de Memo: «lo de los comprobantes de pago de los abonos también siento
// que les falta más». La tarjeta enseñaba un nombre, un identificador de evento
// y un botón que abría la foto en otra pestaña: para saber si el monto tenía
// sentido había que irse a Capsule a buscar a la persona.
//
//   [A] servidor · cambios_listar (handler real): cada comprobante trae la
//       cuenta de la persona — y los números son los de los DUEÑOS (saldoMigrado,
//       estadoPlan/tocaHoy), careados aquí contra ellos. Solo LEE.
//   [B] servidor · el aviso de «puede ser repetido» (mismo monto, ≤15 días) y
//       sus controles (monto viejo, pago de Mercado Pago, otro monto).
//   [C] servidor · si la cuenta no se puede leer, la lista sale IGUAL y lo dice.
//   [D] pantalla (ejecutada, de punta a punta contra el handler real): la
//       tarjeta pinta la cuenta, el comprobante a la vista y los avisos; el
//       abono se captura y el aviso dice cuánto le queda.
//
// ⚠️ SIN ANCLA a propósito (árbol de trabajo). Reloj CONGELADO (13-nov-2026)
// y catálogo sintético: nada aquí caduca con el calendario.
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

const AHORA_ISO = '2026-11-13T18:00:00Z';
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

// El catálogo se cambia ANTES de cargar el handler (lo importa desestructurado).
const EV = [{ id: 'tour27', a: 'Tour Veintisiete', ds: '2027-02-13', f: '13 feb 2027' }];
const CI = require(L('_lib/catalogo-index.js'));
CI.fetchEventosRaw = async () => EV;
const PF = require(L('_lib/plan-fijo.js'));
const { saldoMigrado } = require(L('_lib/cuenta-evento.js'));

const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
let DB;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
const OR_VIVO = '(tipo.neq.pago,foto_path.not.is.null,mp_pago_id.not.is.null)';
function casa(f, k, expr) {
  const v = f[k]; let m;
  if (k === 'or') { if (expr !== OR_VIVO) throw new Error('la red falsa no entiende or=' + expr); return f.tipo !== 'pago' || f.foto_path != null || f.mp_pago_id != null; }
  if (expr === 'is.null') return v == null;
  if (expr === 'not.is.null') return v != null;
  if ((m = /^eq\.(.*)$/.exec(expr))) return String(v) === m[1];
  if ((m = /^in\.\((.*)\)$/.exec(expr))) return m[1].split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(v));
  throw new Error('la red falsa no entiende el filtro ' + k + '=' + expr);
}
const filtra = (tabla, qs) => { let o = tabla.slice(); for (const [k, v] of qs.entries()) { if (['select', 'order', 'limit'].includes(k)) continue; o = o.filter((f) => casa(f, k, v)); } return o; };
// 🔒 La base de verdad solo devuelve las columnas PEDIDAS: una red falsa que
// regresa la fila entera haría pasar por «viajó» un dato que el handler nunca
// pidió (y escondería el día que sí lo pida de más).
const proyecta = (filas, qs) => { const sel = qs.get('select'); if (!sel || sel === '*') return filas.map((f) => Object.assign({}, f)); const cols = sel.split(','); return filas.map((f) => { const o = {}; cols.forEach((c) => { o[c] = f[c] === undefined ? null : f[c]; }); return o; }); };
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase();
  const u = new URL(String(url)); const p = u.pathname, qs = u.searchParams;
  const cuerpo = () => { try { return JSON.parse(init.body); } catch (_) { return null; } };
  DB.seq.push(m + ' ' + p.replace(/^.*\/(rest|storage)\/v1\//, ''));
  if (/resend\.com/.test(u.host)) { DB.mails++; return resp(200, { id: 'em' }); }
  if (/\/storage\/v1\/object\/sign\//.test(p)) return resp(200, { signedURL: '/object/sign/' + p.split('/object/sign/')[1] + '?token=firmado' });
  if (/\/usuarios$/.test(p)) return resp(200, [{ id: 'u-roshi', activo: true, rol: 'maestro_roshi' }]);
  if (/\/cambios_viajero$/.test(p)) {
    const filas = filtra(DB.cam, qs);
    if (m === 'PATCH') { filas.forEach((f) => Object.assign(f, cuerpo())); return resp(200, filas.map((f) => Object.assign({}, f))); }
    if (m !== 'GET') throw new Error('escritura inesperada a cambios_viajero: ' + m);
    return resp(200, filas.map((f) => Object.assign({}, f)));
  }
  if (/\/viajeros_evento$/.test(p)) { if (m !== 'GET') throw new Error('PAGO-CLARO no escribe viajeros (' + m + ')'); return resp(200, proyecta(filtra(DB.vj, qs), qs)); }
  if (/\/abonos_viajero$/.test(p)) {
    if (m === 'POST') { const b = cuerpo(); const arr = (Array.isArray(b) ? b : [b]).map((x, i) => Object.assign({ id: uuid(900 + DB.ab.length + i), fecha: '2026-11-13' }, x)); DB.ab.push(...arr); return resp(201, arr); }
    if (DB.fallaAbonos) return resp(500, { message: 'falla sembrada' });
    return resp(200, proyecta(filtra(DB.ab, qs), qs));
  }
  return resp(200, []);
};
const { jwtSign } = require(L('_lib/verify-admin.js'));
const TOK = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'memo@x.mx', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
const H = require(L('admin-requisiciones.js')).handler;
const llama = (body) => H({ httpMethod: 'POST', path: '/.netlify/functions/admin-requisiciones', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + TOK }, body: JSON.stringify(body) });
const cuerpoDe = (r) => { try { return JSON.parse(r.body); } catch (_) { return {}; } };

// ── La semilla ──────────────────────────────────────────────────────────────
const PLAN = PF.armarPlanFijo({ separo_fecha: '2026-10-29', separo_monto: 300, total: 5300, paquete: 'plus', ds: '2027-02-13' });
const V1 = uuid(1), V2 = uuid(2), V3 = uuid(3), V4 = uuid(4);
const P1 = uuid(11), P2 = uuid(12), P3 = uuid(13), P4 = uuid(14), C5 = uuid(15), P6 = uuid(16), LINK = uuid(17);
function semilla() {
  const vj = (id, o) => Object.assign({ id, nombre: 'Persona ' + id.slice(-1), celular: '8990000000', tipo_paquete: 'plus', zona_boleto: 'General', grupo_viaje: null, evento_id: 'tour27', total_contrato: 5300, abonado_previo: 2420, plan_pagos: null }, o);
  const cam = (id, vid, o) => Object.assign({ id, viajero_id: vid, evento_id: 'tour27', tipo: 'pago', estado: 'pendiente', nombre: 'Persona ' + vid.slice(-1), correo: 'p@x.com', detalle: 'Pago subido desde el Portal', foto_path: 'portal/' + vid + '/a.jpg', mp_pago_id: null, desglose: null, creado_en: AHORA_ISO }, o);
  DB = { seq: [], mails: 0, fallaAbonos: false,
    vj: [vj(V1, { nombre: 'Tania Prueba', plan_pagos: PLAN }), vj(V2, { nombre: 'Sin Rol', total_contrato: 4000, abonado_previo: 1000 }), vj(V3, { nombre: 'Paga En Línea' }), vj(V4, { nombre: 'Sin Total', total_contrato: null, abonado_previo: 0 })],
    ab: [{ id: uuid(101), viajero_id: V1, monto: 480, fecha: '2026-11-10', nota: 'Careo Excel', foto_path: null, created_at: '2026-11-10T10:00:00Z' },
      { id: uuid(102), viajero_id: V2, monto: 700, fecha: '2026-09-20', nota: 'viejo', foto_path: 'x.jpg', created_at: '2026-09-20T10:00:00Z' }],
    cam: [cam(P1, V1, { detalle: 'Pago subido desde el Portal · el cliente declara $480' }),
      cam(P2, V2, { detalle: 'Pago subido desde el Portal · el cliente declara $9,999' }),
      cam(P3, V3, { foto_path: null, mp_pago_id: 'mp-1', mp_monto: 519, mp_monto_cobrar: 519, mp_neto: 500, detalle: 'Pago en línea · el cliente declara $500' }),
      cam(P4, V4, { detalle: 'Pago subido desde el Portal' }),
      cam(C5, V2, { tipo: 'hotel', foto_path: null, detalle: 'Quiero habitación doble' }),
      cam(P6, V2, { foto_path: 'portal/' + V2 + '/estado.pdf', detalle: 'Pago subido desde el Portal · el cliente declara $700' }),
      cam(LINK, V1, { foto_path: null, mp_pago_id: null, detalle: 'link de MP sin pagar' })],
  };
}

(async () => {
  console.log('══ mide:pago-claro-1 ══ (reloj congelado: 2026-11-13)');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[A] la cuenta de quien pagó (admin-requisiciones · cambios_listar)');
  semilla();
  let r = await llama({ accion: 'cambios_listar', estado: 'pendiente' }), j = cuerpoDe(r);
  const de = (id) => (j.cambios || []).find((c) => c.id === id);
  af(() => (r.statusCode === 200 && j.cambios.length === 6 && !de(LINK)), () => 'la lista de siempre: 6 pendientes (el link de Mercado Pago SIN pagar sigue sin ser trabajo de nadie) → ' + (j.cambios || []).length);
  const c1 = de(P1).cuenta;
  const s1 = saldoMigrado(DB.vj[0], DB.ab.filter((a) => a.viajero_id === V1));
  af(() => (c1 && c1.total === s1.total && c1.abonado === s1.abonado && c1.resta === s1.resta && c1.resta === 2400), () => '🔒 total/pagado/falta son los del DUEÑO del dinero (saldoMigrado): ' + JSON.stringify([c1.total, c1.abonado, c1.resta]));
  const toca1 = PF.tocaHoy(PF.estadoPlan(PLAN, { total: s1.total, abonado: s1.abonado, ahora }), s1.resta);
  af(() => (toca1 && c1.toca && c1.toca.monto === toca1.monto && c1.toca.etiqueta === toca1.etiqueta && c1.toca.hasta === toca1.hasta), () => '🔒 «le toca hoy» es el del dueño del rol (estadoPlan → tocaHoy), el MISMO número que ve en su Portal: $' + c1.toca.monto + ' · ' + c1.toca.etiqueta);
  af(() => (c1.declarado === 480 && c1.sin_rol === false && c1.ultimos.length === 1 && c1.ultimos[0].monto === 480 && c1.ultimos[0].fecha === '2026-11-10'), 'trae lo que declaró ($480) y sus últimos abonos');
  af(() => (de(P1).evento_nombre === 'Tour Veintisiete' && de(P1).evento_fecha && de(C5).evento_nombre === 'Tour Veintisiete'), 'el evento viaja con NOMBRE y fecha (también en los cambios que no son pago)');
  const c2 = de(P2).cuenta;
  af(() => (c2.sin_rol === true && c2.toca === null && c2.resta === 2300 && c2.declarado === 9999), 'sin rol fijo: se dice (sin_rol) y no se inventa un «le toca»');
  af(() => (de(P4).cuenta.total === null && de(P4).cuenta.toca === null), 'sin total de contrato: total null (un cero diría «no debe nada»)');
  af(() => (!('cuenta' in de(C5))), 'un cambio que NO es pago no carga cuenta');
  af(() => (de(P1).viajero && !('plan_pagos' in de(P1).viajero) && !('total_contrato' in de(P1).viajero)), 'el plan y el dinero crudos NO viajan dentro de `viajero` (solo la cuenta ya contada)');
  af(() => (DB.seq.every((s) => /^GET /.test(s))), () => '🔒 solo LEE: ' + DB.seq.filter((s) => !/^GET /.test(s)).length + ' escrituras');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[B] «puede ser repetido»');
  af(() => (c1.posible_repetido && c1.posible_repetido.monto === 480 && c1.posible_repetido.fecha === '2026-11-10'), 'declaró $480 y ya tiene un abono de $480 de hace 3 días → se AVISA (con monto y fecha)');
  af(() => (de(P6).cuenta.declarado === 700 && de(P6).cuenta.posible_repetido === null), 'CONTROL: mismo monto pero de hace 54 días → no se acusa (ventana de 15 días)');
  af(() => (c2.posible_repetido === null), 'CONTROL: otro monto → no avisa');
  af(() => (de(P3).cuenta.declarado === null && de(P3).cuenta.posible_repetido === null), 'un pago de Mercado Pago no se compara: el pago en línea ES el comprobante');
  semilla(); DB.ab.push({ id: uuid(103), viajero_id: V1, monto: 480, fecha: '2026-11-12', nota: 'otro', foto_path: 'y.jpg', created_at: '2026-11-12T10:00:00Z' });
  j = cuerpoDe(await llama({ accion: 'cambios_listar', estado: 'pendiente' }));
  af(() => (j.cambios.find((c) => c.id === P1).cuenta.ultimos.map((a) => a.fecha).join(',') === '2026-11-12,2026-11-10'), 'los últimos abonos van del más nuevo al más viejo');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[C] es AYUDA: si no se puede leer, no estorba');
  semilla(); DB.fallaAbonos = true;
  r = await llama({ accion: 'cambios_listar', estado: 'pendiente' }); j = cuerpoDe(r);
  af(r.statusCode === 200 && j.cambios.length === 6 && j.cambios.find((c) => c.id === P1).cuenta === null && /revisa su saldo en Capsule/.test(j.cambios.find((c) => c.id === P1).cuenta_error),
    '🔒 la base tose al leer los abonos → la lista sale IGUAL (200, las 6), la cuenta va en null y se DICE por qué');
  af(() => (j.cambios.find((c) => c.id === P1).evento_nombre === 'Tour Veintisiete'), 'y lo demás (el nombre del evento) sigue ahí');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[D] la pantalla, contra el handler real');
  semilla();
  const els = {};
  const nodo = (id) => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, dataset: {}, style: {},
    classList: { _s: new Set(), toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }, contains(c) { return this._s.has(c); } },
    parentNode: { insertBefore: () => {} }, appendChild: () => {}, focus: () => {}, querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {} });
  const toasts = [], conteos = [], abiertas = [];
  const ctx = { console, setTimeout: () => 0, confirm: () => true, alert: () => {}, navigator: {},
    window: { open: (u) => abiertas.push(u) },
    document: { getElementById: (id) => nodo(id), createElement: () => nodo('nuevo'), querySelectorAll: () => [], querySelector: () => null },
    showToast: (t, k) => toasts.push([t, k]), khPaqueteTexto: () => '', KH_PREVENTA_DESCUENTO: 300, currentUser: { rol: 'bulma' }, _tsToDate: (x) => new Date(x), khViajeros: {},
    khAdminFetch: async (url, o) => { const rr = await H({ httpMethod: 'POST', path: '/.netlify/functions/admin-requisiciones', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + TOK }, body: o.body });
      return { ok: rr.statusCode < 300, status: rr.statusCode, json: async () => JSON.parse(rr.body) }; } };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8'), ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run('_reqContar = (s, n) => __conteos.push([s, n])'); ctx.__conteos = conteos;
  await run('loadCambiosPortal()');
  // Las miniaturas las pide loadCambiosPortal por su cuenta (sin esperar): se le da tiempo.
  for (let i = 0; i < 200 && DB.seq.filter((x) => /object\/sign/.test(x)).length < 3; i++) await new Promise((ok) => setImmediate(ok));
  for (let i = 0; i < 20; i++) await new Promise((ok) => setImmediate(ok));
  const hP = nodo('req-pagos').innerHTML, hC = nodo('req-cambios').innerHTML;
  const tarjeta = (h, id) => { const i = h.indexOf('id="rq-cambio-' + id + '"'); const k = h.indexOf('<div class="rq-cambio" id="rq-cambio-', i + 10); return h.slice(i, k < 0 ? h.length : k); };
  af(() => (hP.includes(P1) && hP.includes(P3) && !hP.includes(C5) && hC.includes(C5) && !hC.includes(P1)), 'los comprobantes van a «💳 Pagos por capturar» y lo demás a «🔁 Cambios pedidos»');
  af(() => (conteos.some((c) => c[0] === 'pagos' && c[1] === 5) && conteos.some((c) => c[0] === 'cambios' && c[1] === 1)), 'y cada trabajo le cuenta su número al mapa (5 pagos · 1 cambio)');
  const t1 = tarjeta(hP, P1);
  af(() => (/Tour Veintisiete/.test(t1) && /<small>Total<\/small><b>\$5,300<\/b>/.test(t1) && /<small>Pagado<\/small><b>\$2,900<\/b>/.test(t1) && /<small>Le falta<\/small><b>\$2,400<\/b>/.test(t1)), 'la tarjeta pinta SU cuenta: evento con nombre · total $5,300 · pagado $2,900 · le falta $2,400');
  af(() => (t1.includes('<small>Le toca hoy</small><b>$' + toca1.monto.toLocaleString('es-MX') + '</b>') && /<small>Declaró<\/small><b>\$480<\/b>/.test(t1)), 'lo que le toca hoy por su rol y lo que declaró, lado a lado');
  af(() => (/puede ser repetido/.test(t1) && /abono de \$480 capturado el 10 nov/.test(t1) && /Sus últimos abonos: <b>\$480<\/b> · 10 nov/.test(t1)), 'el aviso de posible repetido (monto y fecha) y sus últimos abonos');
  const iCap = t1.indexOf('➕ Capturar abono'), iNo = t1.indexOf('No procede');
  af(() => (/class="rq-btn pri" onclick="_reqPagoAbrir/.test(t1) && iCap > -1 && iNo > iCap), 'el paso en verde es «➕ Capturar abono»; «No procede» va al final');
  const t2 = tarjeta(hP, P2);
  af(() => (/más de lo que le falta/.test(t2) && /Todavía no tiene su rol de pagos fijo/.test(t2)), 'declaró más de lo que debe → se avisa; sin rol → se dice');
  af(() => (/Pagado en Mercado Pago/.test(tarjeta(hP, P3)) && !/<small>Declaró<\/small>/.test(tarjeta(hP, P3)) && /no trae total de contrato/.test(tarjeta(hP, P4))), 'Mercado Pago: su chip y sin «Declaró»; sin total: se dice');
  // El comprobante a la vista.
  af(() => (/<img alt="Comprobante de [^"]*" src="https:\/\/kh\.falso\.test\/storage\/v1\/object\/sign\/abonos-viajeros\/portal\/[^"]*\?token=firmado"/.test(nodo('rq-comp-' + P1).innerHTML)), () => 'el comprobante se pinta EN la tarjeta con la URL que firma el servidor (' + nodo('rq-comp-' + P1).innerHTML.slice(0, 60) + '…)');
  af(() => (/PDF/.test(nodo('rq-comp-' + P6).textContent) && DB.seq.filter((s) => /object\/sign/.test(s)).length === 3), () => 'un PDF no se pinta (se abre aparte) y solo se firman las fotos: ' + DB.seq.filter((s) => /object\/sign/.test(s)).length + ' firmas para 3 fotos');
  run(`_reqPagoZoom('${P1}')`);
  af(() => (nodo('rq-comp-' + P1).classList.contains('grande') && abiertas.length === 0), 'clic en la miniatura: se agranda AHÍ MISMO (no abre otra pestaña)');
  await run(`_reqPagoZoom('${P6}')`); await new Promise((ok) => setImmediate(ok));
  af(() => (abiertas.length === 1 && /estado\.pdf/.test(abiertas[0])), 'clic en un PDF: ese sí se abre aparte');
  // Capturar: por la puerta de siempre, y el aviso dice cómo quedó.
  run(`_reqPagoAbrir('${P1}')`);
  af(() => (/value="480"/.test(nodo('rq-cambio-form-' + P1).innerHTML)), 'el panel de captura sigue naciendo con lo declarado, editable (PAGOS-PORTAL-2)');
  nodo('rq-pago-monto-' + P1).value = '480';
  ctx.document.querySelectorAll = () => [];
  await run(`_reqPagoCapturar('${P1}')`);
  const nuevo = DB.ab.find((a) => a.viajero_id === V1 && a.foto_path === 'portal/' + V1 + '/a.jpg');
  af(() => (nuevo && nuevo.monto === 480 && DB.cam.find((c) => c.id === P1).estado === 'atendida'), 'capturar: nace el abono con el comprobante ligado y la solicitud se cierra (lo de siempre)');
  af(() => (toasts.some((t) => /Abono capturado: \$480 · le quedan por pagar \$1,920/.test(t[0]))), () => 'y el aviso dice cómo quedó su cuenta: «' + ((toasts.find((t) => /Abono capturado/.test(t[0])) || [''])[0]).slice(0, 70) + '…»');

  console.log('\n' + (V === 0 ? 'NADA MEDIDO · esto NO es un verde' : (R ? '🔴 ROJO' : '✅ VERDE')) + ' · ' + V + ' en verde, ' + R + ' en rojo');
  process.exit(R || !V ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + (e && e.stack)); process.exit(1); });
