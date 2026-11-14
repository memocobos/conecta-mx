#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// mide:cambio-aplica-1 — «✏️ HACER EL CAMBIO» DESDE REQUISICIONES (13-nov-2026)
//
// Palabra de Memo: «lo único que cambiaría es en cambios pedidos poder hacer el
// cambio desde requisiciones y aprobar y que quede guardado».
//
//   [A] servidor · cambio_opciones (handler real, SOLO LEE): cómo está HOY el
//       viajero, las fechas de la ficha, paquetes, zonas con precio y cupo,
//       habitaciones — cada número careado contra su DUEÑO.
//   [B] servidor · la elección: el total se sugiere por DIFERENCIA (sobrevive
//       un descuento), los cuatro modos, el cupo que AVISA, CDMX, validaciones.
//   [C] servidor · candados: tipos con dueño propio, no pendiente, cancelado,
//       catálogo caído — y CERO escrituras, con control positivo.
//   [D] servidor · cambios_listar: la ficha de hoy en la tarjeta y el historial.
//   [E] pantalla, de punta a punta contra LOS DOS handlers reales
//       (admin-requisiciones + admin-coordi-asignaciones): habitación, fecha,
//       fecha + paquete (orden y UN solo correo), error del dueño, cierre
//       fallido y su reintento, sin cambios.
//   [F] pantalla · lo tecleado MANDA, lo no confiable no se pone solo, sin
//       publicar no avisa, el botón verde, el director y el historial.
//
// ⚠️ SIN ANCLA a propósito (árbol de trabajo). Reloj CONGELADO (13-nov-2026) y
// catálogo SINTÉTICO: nada aquí caduca con el calendario ni con una publicación.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const L = (p) => path.join(RAIZ, 'netlify/functions', p);

process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'svc-portal';
process.env.RESEND_API_KEY = 're_falso';
process.env.CORREOS_MODO = 'real';

const AHORA_ISO = '2026-11-13T18:00:00Z';
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [AHORA_ISO])); }
  static now() { return new RealDate(AHORA_ISO).getTime(); }
};

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = typeof c === 'function' ? !!c() : !!c; } catch (_) { ok = false; }
  const msg = typeof m === 'function' ? (() => { try { return m(); } catch (e) { return '(msg) ' + e.message; } })() : m;
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } };

// ── El catálogo SINTÉTICO, con la forma del index (se cambia ANTES de cargar
//    los handlers: lo importan desestructurado) ──────────────────────────────
const Z = (n, p, o) => Object.assign({ n, p }, o || {});
const HOT = {
  mty: [{ n: 'Compartida (4 personas)', e: 0, viaj: [1, 2, 3, 4] }, { n: 'Individual', e: 1960, viaj: [1] }, { n: 'Doble', e: 1300, viaj: [2] }, { n: 'Triple', e: 750, viaj: [3] }],
  cdm: [{ n: 'Compartida (4 personas)', e: 0, viaj: [1, 2, 3, 4] }, { n: 'Individual', e: 2175, viaj: [1] }, { n: 'Doble', e: 1450, viaj: [2] }, { n: 'Triple', e: 750, viaj: [3] }],
};
const EV = [
  { id: 'gira', a: 'Gira Norte', v: 'Arena Monterrey', ds: '2027-01-11', f: '11 y 16 ene 2027', sep: 300, sepCheap: 300, ride: 2700, dsList: ['2027-01-11', '2027-01-16'],
    zonas: [Z('Cancha VIP', 5900), Z('Oro', 6500), Z('Coke Studio', 7200), Z('Butaca', 5200)],
    cheapZonas: [Z('Cancha VIP', 4100), Z('Oro', 4700), Z('Coke Studio', 5400), Z('Butaca', 3400)],
    multifecha: [
      { lbl: '11 Enero', ds: '2027-01-11', zonas: [Z('Cancha VIP', 5900), Z('Oro', 6500, { ag: 1 }), Z('Coke Studio', 7200, { ag: 1 })], cheapZonas: [Z('Cancha VIP', 4100), Z('Oro', 4700, { ag: 1 }), Z('Coke Studio', 5400)] },
      { lbl: '16 Enero', ds: '2027-01-16', zonas: [Z('Oro', 6500), Z('Butaca', 5200)], cheapZonas: [Z('Oro', 4700), Z('Butaca', 3400)] },
    ] },
  { id: 'solo', a: 'Una Fecha', v: 'Arena Monterrey', ds: '2027-02-13', f: '13 feb 2027', sep: 300, sepCheap: 300, zonas: [Z('General', 4000), Z('VIP', 5000)], cheapZonas: [Z('General', 2400), Z('VIP', 3400)] },
  { id: 'capital', a: 'Festival Capital', v: 'Autódromo, CDMX', ds: '2027-03-13', f: '13 mar 2027', sep: 300, sepCheap: 300, ride: 2900, zonas: [Z('General', 4500)], cheapZonas: [Z('General', 2600)] },
];
const CI = require(L('_lib/catalogo-index.js'));
let catalogoCaido = false;
CI.fetchEventosRaw = async () => { if (catalogoCaido) throw new Error('CDN caído'); return EV; };
CI.fetchHotelesGlobales = async () => HOT;
const { _calcularPrecio } = require(L('_lib/precio-zona.js'));
const { saldoMigrado } = require(L('_lib/cuenta-evento.js'));
const { evaluarZona, cargarDisponibilidad } = require(L('_lib/disponibilidad.js'));

// ── La base de mentira: con ESTADO, con FILTROS y proyectando lo PEDIDO ─────
const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
let DB;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
const OR_VIVO = '(tipo.neq.pago,foto_path.not.is.null,mp_pago_id.not.is.null)';
function casa(f, k, expr) {
  const v = f[k]; let m;
  if (k === 'or') { if (expr !== OR_VIVO) throw new Error('la red falsa no entiende or=' + expr); return f.tipo !== 'pago' || f.foto_path != null || f.mp_pago_id != null; }
  if (expr === 'is.null') return v == null;
  if (expr === 'not.is.null') return v != null;
  if ((m = /^eq\.(.*)$/.exec(expr))) return String(v) === m[1];
  if ((m = /^neq\.(.*)$/.exec(expr))) return String(v) !== m[1];
  if ((m = /^in\.\((.*)\)$/.exec(expr))) return m[1].split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(v));
  throw new Error('la red falsa no entiende el filtro ' + k + '=' + expr);
}
const filtra = (tabla, qs) => { let o = tabla.slice(); for (const [k, v] of qs.entries()) { if (['select', 'order', 'limit', 'offset'].includes(k)) continue; o = o.filter((f) => casa(f, k, v)); } return o; };
const proyecta = (filas, qs) => { const sel = qs.get('select'); if (!sel || sel === '*') return filas.map((f) => Object.assign({}, f)); const cols = sel.split(','); return filas.map((f) => { const o = {}; cols.forEach((c) => { o[c] = f[c] === undefined ? null : f[c]; }); return o; }); };
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase();
  const u = new URL(String(url)); const p = u.pathname, qs = u.searchParams;
  const cuerpo = () => { try { return JSON.parse(init.body); } catch (_) { return null; } };
  const tabla = p.replace(/^.*\/(rest|storage)\/v1\//, '');
  if (/resend\.com/.test(u.host)) { DB.seq.push('MAIL'); DB.mails.push(cuerpo()); return resp(200, { id: 'em-' + DB.mails.length }); }
  if (/\/storage\/v1\/object\/sign\//.test(p)) { DB.seq.push('FIRMA'); return resp(200, { signedURL: '/object/sign/' + p.split('/object/sign/')[1] + '?token=firmado' }); }
  DB.seq.push(m + ' ' + tabla + (m === 'PATCH' ? ' [' + Object.keys(cuerpo() || {}).sort().join(',') + ']' : ''));
  if (/pt\.falso\.test/.test(u.host)) return resp(200, []);            // el Portal: sin ventas del flujo viejo
  if (/\/usuarios$/.test(p)) { const uid = (/eq\.(.*)/.exec(qs.get('id') || '') || [])[1] || 'u-bulma'; return resp(200, [{ id: uid, activo: true, rol: uid === 'u-coordi' ? 'coordinador' : 'bulma' }]); }
  if (/\/cambios_viajero$/.test(p)) {
    const filas = filtra(DB.cam, qs);
    if (m === 'PATCH') { if (DB.fallaCierre) { DB.fallaCierre = false; return resp(500, { message: 'falla sembrada al cerrar' }); } filas.forEach((f) => Object.assign(f, cuerpo())); return resp(200, filas.map((f) => Object.assign({}, f))); }
    if (m !== 'GET') throw new Error('escritura inesperada a cambios_viajero: ' + m);
    return resp(200, proyecta(filas, qs));
  }
  if (/\/viajeros_evento$/.test(p)) {
    const filas = filtra(DB.vj, qs);
    if (m === 'PATCH') { if (DB.fallaPatchVj) return resp(500, { message: 'falla sembrada al guardar el viaje' }); filas.forEach((f) => Object.assign(f, cuerpo())); return resp(200, filas.map((f) => Object.assign({}, f))); }
    if (m !== 'GET') throw new Error('la casa no crea ni borra viajeros desde aquí: ' + m);
    return resp(200, proyecta(filas, qs));
  }
  if (/\/abonos_viajero$/.test(p)) { if (m !== 'GET') throw new Error('🔴 escritura a DINERO (abonos_viajero): ' + m); if (DB.fallaAbonos) return resp(500, { message: 'falla sembrada' }); return resp(200, proyecta(filtra(DB.ab, qs), qs)); }
  if (/\/compras$/.test(p)) { if (m !== 'GET') throw new Error('escritura a compras'); return resp(200, proyecta(filtra(DB.compras, qs), qs)); }
  if (/\/stock_ajustes$/.test(p)) { if (m !== 'GET') throw new Error('escritura a stock_ajustes'); return resp(200, []); }
  if (m !== 'GET') throw new Error('escritura inesperada a ' + tabla + ': ' + m);
  return resp(200, []);
};
const { jwtSign } = require(L('_lib/verify-admin.js'));
const TOK = jwtSign({ id: 'u-bulma', rol: 'bulma', correo: 'bulma@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
const HR = require(L('admin-requisiciones.js')).handler;
const HC = require(L('admin-coordi-asignaciones.js')).handler;
const ev0 = (fn, body) => ({ httpMethod: 'POST', path: '/.netlify/functions/' + fn, headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + TOK }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const cuerpoDe = (r) => { try { return JSON.parse(r.body); } catch (_) { return {}; } };
const req = async (body) => { const r = await HR(ev0('admin-requisiciones', body)); return Object.assign({ _s: r.statusCode }, cuerpoDe(r)); };

// ── La semilla ──────────────────────────────────────────────────────────────
const V1 = uuid(1), V2 = uuid(2), V3 = uuid(3), V4 = uuid(4), V5 = uuid(5), V6 = uuid(6), V7 = uuid(7), V8 = uuid(8), VX = uuid(9), V10 = uuid(10);
const C1 = uuid(11), C2 = uuid(12), C3 = uuid(13), C4 = uuid(14), C5 = uuid(15), C6 = uuid(16), C7 = uuid(17), C8 = uuid(18), P9 = uuid(19), Q10 = uuid(20), C11 = uuid(21), C12 = uuid(22);
function semilla() {
  const vj = (id, o) => Object.assign({ id, nombre: 'Persona', correo: 'p' + id.slice(-1) + '@x.com', celular: '8991112233', evento_id: 'gira#0', tipo_paquete: 'plus', zona_boleto: 'Cancha VIP',
    hotel_tipo: 'Compartida', boletos: 1, total_contrato: 5900, abonado_previo: 300, portal_revisado_at: '2026-11-01T00:00:00Z', plan_pagos: null, notas: null,
    habitacion_id: null, grupo_viaje: null, genero: null, indicaciones: null, tipo_viajero: 'cliente', usuario_id: null }, o);
  const cam = (id, vid, tipo, detalle, o) => Object.assign({ id, viajero_id: vid, evento_id: 'gira#0', tipo, estado: 'pendiente', nombre: 'Persona', correo: 'p@x.com', detalle,
    respuesta: null, atendida_por: null, atendida_at: null, foto_path: null, mp_pago_id: null, desglose: null, paquete_pedido: null, zona_pedida: null, hotel_pedido: null, precio_lista: null, creado_en: AHORA_ISO }, o);
  DB = { seq: [], mails: [], fallaAbonos: false, fallaPatchVj: false, fallaCierre: false,
    vj: [
      vj(V1, { nombre: 'Ana Hotel', correo: 'ana@x.com', grupo_viaje: uuid(500) }),                       // viaja con Beto
      vj(V2, { nombre: 'Beto Fecha', correo: 'beto@x.com', total_contrato: 5400, grupo_viaje: uuid(500), habitacion_id: uuid(600) }),   // $500 de descuento negociado · con cuarto
      vj(V3, { nombre: 'Caro Paquete', correo: 'caro@x.com', tipo_paquete: 'cheap', zona_boleto: 'Coke Studio', hotel_tipo: null, total_contrato: 5400, abonado_previo: 200 }),
      vj(V4, { nombre: 'Dani SinTotal', evento_id: 'solo', zona_boleto: 'General', hotel_tipo: null, total_contrato: null, abonado_previo: 0 }),
      vj(V5, { nombre: 'Eli Capital', evento_id: 'capital', tipo_paquete: 'cheap', zona_boleto: 'General', hotel_tipo: null, boletos: 2, total_contrato: 5200, abonado_previo: 600 }),
      vj(V6, { nombre: 'Fer ZonaVieja', evento_id: 'solo', zona_boleto: 'Zona Extinta', hotel_tipo: null, total_contrato: 4000, abonado_previo: 300 }),
      vj(V7, { nombre: 'Gala Cancelada', boletos: 0, zona_boleto: null }),
      vj(V8, { nombre: 'Hugo SinPublicar', evento_id: 'solo', zona_boleto: 'General', total_contrato: 4000, portal_revisado_at: null }),
      vj(VX, { nombre: 'Otro En Oro', evento_id: 'gira#1', zona_boleto: 'Oro', total_contrato: 6500 }),  // ocupa el ÚNICO Oro del 16
      vj(V10, { nombre: 'Iris Preventa', evento_id: 'solo', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', hotel_tipo: null, total_contrato: 300, abonado_previo: 300 }),
    ],
    ab: [{ id: uuid(101), viajero_id: V1, monto: 300, fecha: '2026-11-05' }],
    compras: [
      { evento_id: 'gira#0', zona: 'Cancha VIP', cantidad: 20, costo_unitario: 2900 }, { evento_id: 'gira#0', zona: 'Coke Studio', cantidad: 3, costo_unitario: 4200 },
      { evento_id: 'gira#1', zona: 'Oro', cantidad: 1, costo_unitario: 3500 }, { evento_id: 'gira#1', zona: 'Butaca', cantidad: 10, costo_unitario: 2200 },
      { evento_id: 'solo', zona: 'VIP', cantidad: 1, costo_unitario: 2500 },
    ],
    cam: [
      cam(C1, V1, 'hotel', 'Quiero habitación doble con mi pareja'),
      cam(C2, V2, 'fecha', 'Me queda mejor el 16 de enero'),
      cam(C3, V3, 'otro', 'Quiero cambiar a hotel + transporte + boleto'),
      cam(C4, V4, 'hotel', 'Doble por favor', { evento_id: 'solo' }),
      cam(C5, V5, 'otro', 'Pasar a PLUS', { evento_id: 'capital' }),
      cam(C6, V6, 'zona', 'Quiero VIP', { evento_id: 'solo' }),
      cam(C7, V7, 'zona', 'cambio'),
      cam(C8, V8, 'hotel', 'doble', { evento_id: 'solo' }),
      cam(P9, V1, 'pago', 'Pago subido desde el Portal · el cliente declara $480', { foto_path: 'portal/' + V1 + '/a.jpg' }),
      cam(Q10, V3, 'paquete', 'elige', { paquete_pedido: 'plus', zona_pedida: 'Oro', precio_lista: 6500 }),
      cam(C12, V10, 'otro', 'Quiero el paquete PLUS', { evento_id: 'solo' }),
      cam(C11, V1, 'zona', 'ya atendida', { estado: 'atendida', respuesta: 'se pasó a Oro', atendida_por: 'Milk', atendida_at: '2026-11-10T16:00:00Z' }),
    ],
  };
}
const escrituras = () => DB.seq.filter((s) => !/^GET /.test(s) && s !== 'MAIL' && s !== 'FIRMA');
const parches = (t) => DB.seq.filter((s) => new RegExp('^PATCH ' + t).test(s));
// El precio «a mano», preguntándole al DUEÑO por separado (no se re-suma aquí).
const lista = (evId, paquete, zona, hotelNombre, n) => { const [slug, i] = evId.split('#'); const ev = EV.find((e) => e.id === slug);
  const r = _calcularPrecio(ev, { hoteles: HOT, paquete, zona, hotel_nombre: hotelNombre, num_personas: n, fecha_idx: i == null ? 0 : Number(i), hoyISO: '2026-11-13', para_careo: true, transporte_cost: 0 });
  return r && r.ok ? r.precio_unit : null; };

(async () => {
  console.log('══ mide:cambio-aplica-1 ══ (reloj congelado: 2026-11-13)');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[A] lo que hay para una solicitud (admin-requisiciones · cambio_opciones)');
  semilla();
  let j = await req({ accion: 'cambio_opciones', id: C1 });
  const sA = saldoMigrado(DB.vj[0], DB.ab.filter((a) => a.viajero_id === V1));
  af(() => (j._s === 200 && j.ok && j.cambio.tipo === 'hotel' && j.viajero.id === V1), () => 'contesta para la solicitud (200) y el viajero sale del id de la SOLICITUD → ' + j._s + ' ' + (j.error || ''));
  af(() => (j.hoy.paquete === 'plus' && j.hoy.zona === 'Cancha VIP' && j.hoy.hotel_tipo === 'Compartida' && j.hoy.lugares === 1 && j.hoy.fecha === '11 ene 2027'), () => 'cómo está HOY: ' + JSON.stringify([j.hoy.fecha, j.hoy.paquete, j.hoy.zona, j.hoy.hotel_tipo, j.hoy.lugares]));
  af(() => (j.hoy.total === sA.total && j.hoy.abonado === sA.abonado && j.hoy.resta === sA.resta && j.hoy.abonado === 600), () => '🔒 total/pagado/falta son los del DUEÑO del dinero (saldoMigrado): ' + JSON.stringify([j.hoy.total, j.hoy.abonado, j.hoy.resta]));
  af(() => (j.hoy.con_grupo === true && j.hoy.con_cuarto === false && j.hoy.publicado === true && j.hoy.con_correo === true), 'y lo que la pantalla necesita saber ANTES de guardar: si viaja en grupo, si tiene cuarto, si se le puede avisar');
  af(() => (j.fechas.length === 2 && j.fechas[0].actual && !j.fechas[1].actual && j.fechas[1].evento_id === 'gira#1' && j.fechas[1].etiqueta === '16 ene 2027' && j.fecha === 'gira#0'), () => 'las fechas de la FICHA, con la suya marcada: ' + j.fechas.map((f) => f.etiqueta + (f.actual ? '*' : '')).join(' | '));
  const plusA = j.paquetes.find((p) => p.paquete === 'plus');
  af(() => (j.paquetes.map((p) => p.paquete).join(',') === 'plus,stay,ride,cheap' && plusA.duerme && !j.paquetes.find((p) => p.paquete === 'cheap').duerme && j.paquetes.find((p) => p.paquete === 'ride').zonas === null), 'los 4 paquetes del sitio: PLUS/STAY/RIDE duermen, CHEAP no, RIDE va sin zona');
  af(() => (plusA.zonas.map((z) => z.zona).join(',') === 'Cancha VIP,Oro,Coke Studio' && plusA.zonas.every((z) => z.precio === lista('gira#0', 'plus', z.zona, undefined, 1))), () => '🔒 las zonas son las de ESA fecha (no las del evento entero) y su precio es el del motor: ' + plusA.zonas.map((z) => z.zona + ' $' + z.precio).join(' · '));
  af(() => (plusA.zonas.find((z) => z.zona === 'Oro').ag === true && plusA.zonas.find((z) => z.zona === 'Oro').precio === 6500 && plusA.zonas.find((z) => z.zona === 'Cancha VIP').ag === false), 'una zona AGOTADA en la ficha se enseña (rotulada) y con su precio: aquí se corrige un viaje, no se vende');
  const dispA = await cargarDisponibilidad({ khUrl: process.env.SUPABASE_URL_KAMEHOUSE, khKey: 'svc', portalUrl: process.env.PORTAL_SUPABASE_URL, portalKey: 'x', evento_id: 'gira#0' });
  af(() => (plusA.zonas.find((z) => z.zona === 'Cancha VIP').quedan === evaluarZona(dispA, 'Cancha VIP', 1).restante && plusA.zonas.find((z) => z.zona === 'Cancha VIP').quedan === 18
    && plusA.zonas.find((z) => z.zona === 'Coke Studio').quedan === 2 && plusA.zonas.find((z) => z.zona === 'Oro').quedan === null && j.inventario_ok === true),
  () => '🔒 «quedan» es el del Palacio (evaluarZona): Cancha VIP ' + plusA.zonas[0].quedan + ' · Coke Studio 2 · sin pedido → null (no un cero)');
  af(() => (j.paquetes.find((p) => p.paquete === 'ride').precio === lista('gira#0', 'ride', undefined, undefined, 1) && j.paquetes.find((p) => p.paquete === 'ride').precio === 2700), 'el RIDE trae su precio del motor ($2,700)');
  af(() => (j.habitaciones.map((h) => h.tipo).join(',') === 'Compartida,Doble,Triple,Individual'), 'habitaciones: los cuatro tipos del rooming, en su orden');
  af(() => (j.eleccion === null && j.guia === null && j.avisos.length === 0), 'sin elección no hay sugerido ni avisos');
  j = await req({ accion: 'cambio_opciones', id: C1, evento_id: 'gira#1' });
  af(() => (j._s === 200 && j.fecha === 'gira#1' && j.paquetes.find((p) => p.paquete === 'plus').zonas.map((z) => z.zona).join(',') === 'Oro,Butaca' && j.paquetes.find((p) => p.paquete === 'plus').zonas[0].quedan === 0),
    () => 'con otra fecha: las listas son las de ESA fecha (Oro · Butaca) y Oro ya no tiene lugares (' + j.paquetes.find((p) => p.paquete === 'plus').zonas[0].quedan + ')');
  j = await req({ accion: 'cambio_opciones', id: C5 });
  af(() => (j.evento.cdmx === true && j.paquetes.map((p) => p.paquete).join(',') === 'plus,ride,cheap' && j.hoy.lugares === 2 && j.fechas.length === 1), 'un CDMX no ofrece STAY (el espejo de los botones del sitio) y una sola fecha no ofrece cambiarla');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[B] la elección: el total se sugiere por DIFERENCIA');
  semilla();
  const pide = (id, o) => req(Object.assign({ accion: 'cambio_opciones', id }, o));
  j = await pide(C1, { evento_id: 'gira#0', paquete: 'plus', zona: 'Cancha VIP', hotel: 'Doble' });
  let e = j.eleccion;
  af(() => (e.lista_actual === 5900 && e.lista_nueva === lista('gira#0', 'plus', 'Cancha VIP', 'Doble', 2) && e.lista_nueva === 6550 && e.diferencia === 650), () => 'Compartida → Doble: la Doble de la ficha cuesta $1,300 ENTRE DOS → +$650 por persona (lista ' + e.lista_actual + ' → ' + e.lista_nueva + ')');
  af(() => (e.total_sugerido === 6550 && e.modo === 'diferencia' && e.confiable === true && e.cambia.hotel && !e.cambia.zona && !e.cambia.fecha && !e.cambia.paquete), 'sugerido = su total de hoy + la diferencia ($6,550), y dice QUÉ cambia (solo la habitación)');
  j = await pide(C1, { evento_id: 'gira#0', paquete: 'plus', zona: 'Cancha VIP', hotel: 'Triple' }); const eT = j.eleccion;
  j = await pide(C1, { evento_id: 'gira#0', paquete: 'plus', zona: 'Cancha VIP', hotel: 'Individual' }); const eI = j.eleccion;
  af(() => (eT.diferencia === 250 && eI.diferencia === 1960), () => 'Triple +$' + eT.diferencia + ' (750 entre tres) · Individual +$' + eI.diferencia);
  j = await pide(C2, { evento_id: 'gira#1', paquete: 'plus', zona: 'Butaca', hotel: 'Compartida' }); e = j.eleccion;
  af(() => (e.total_hoy === 5400 && e.lista_actual === 5900 && e.lista_nueva === 5200 && e.diferencia === -700 && e.total_sugerido === 4700 && e.modo === 'diferencia'),
    () => '🔒 un total NEGOCIADO sobrevive: hoy paga $5,400 (lista $5,900) → Butaca del 16 (lista $5,200) = $' + e.total_sugerido + ' — por lista a secas le habrían cobrado $5,200 y perdía sus $500');
  af(() => (e.cambia.fecha && e.cambia.zona && e.fecha === '16 ene 2027' && j.avisos.length === 0), 'cambia fecha y zona; Butaca tiene lugares → sin avisos');
  j = await pide(C2, { evento_id: 'gira#1', paquete: 'plus', zona: 'Oro', hotel: 'Compartida' });
  af(() => (j._s === 200 && j.eleccion.total_sugerido === 6000 && j.avisos.some((a) => /«Oro» ya no tiene lugares/.test(a) && /sobrevendida/.test(a))), () => 'el cupo AVISA y no bloquea: Oro del 16 sin lugares → se dice (' + (j.avisos[0] || '').slice(0, 60) + '…)');
  j = await pide(C3, { evento_id: 'gira#0', paquete: 'plus', zona: 'Coke Studio', hotel: '' }); e = j.eleccion;
  af(() => (j._s === 200 && e.lista_actual === 5400 && e.lista_nueva === 7200 && e.total_sugerido === 7200 && e.cambia.paquete && !e.cambia.zona),
    () => '🔒 CHEAP → PLUS en SU zona, que en PLUS está agotada: se cotiza igual (la puerta del careo: ese boleto ya es suyo) → $' + (e && e.total_sugerido));
  af(() => (!j.avisos.some((a) => /sobrevendida|lugares/.test(a))), 'y NO avisa de cupo: la misma zona el mismo día no mueve ningún boleto');
  j = await pide(C3, { evento_id: 'gira#0', paquete: 'ride' }); e = j.eleccion;
  af(() => (e.zona === null && e.lista_nueva === 2700 && e.diferencia === -2700 && e.total_sugerido === 2700 && e.cambia.zona && e.cambia.paquete), 'CHEAP → RIDE: sin boleto (la zona se va) y el total baja por la diferencia');
  j = await pide(C3, { evento_id: 'gira#0', paquete: 'plus', zona: '' });
  af(() => (j._s === 200 && j.eleccion === null && /Elige la zona/.test(j.guia || '')), 'una elección a medias no es un error: contesta la lista y una guía («Elige la zona»)');
  j = await pide(C4, { evento_id: 'solo', paquete: 'plus', zona: 'General', hotel: 'Doble' }); e = j.eleccion;
  af(() => (j.hoy.total === null && e.total_hoy === null && e.lista_nueva === 4650 && e.total_sugerido === 4650 && e.modo === 'lista' && e.confiable === true), () => 'sin total capturado: nace con el de lista ($' + e.total_sugerido + ', modo «lista») — «sin capturar» no es $0');
  j = await pide(C6, { evento_id: 'solo', paquete: 'plus', zona: 'VIP', hotel: '' }); e = j.eleccion;
  af(() => (e.lista_actual === null && e.lista_nueva === 5000 && e.total_sugerido === 5000 && e.modo === 'lista_sin_base' && e.confiable === false && j.avisos.some((a) => /No pude cotizar lo que tiene hoy/.test(a))),
    () => '🔒 lo que tiene hoy no se puede cotizar (zona que la ficha ya no trae) → el de lista se OFRECE, no es confiable, y se dice por qué');
  j = await pide(C6, { evento_id: 'solo', paquete: 'plus', zona: 'Zona Extinta', hotel: 'Doble' });
  af(() => (j._s === 200 && j.eleccion.total_sugerido === null && j.avisos.some((a) => /No pude cotizar lo nuevo/.test(a))), 'su zona vieja no se le quita por cambiarle otra cosa (se acepta la SUYA) — y sin precio se pide teclear el total');
  j = await pide(C5, { evento_id: 'capital', paquete: 'plus', zona: 'General', hotel: 'Doble' }); e = j.eleccion;
  af(() => (e.lista_actual === 5200 && e.lista_nueva === lista('capital', 'plus', 'General', 'Doble', 2) * 2 && e.lista_nueva === 10450 && e.total_sugerido === 10450), () => 'una fila de 2 lugares: el precio por persona × 2 ($' + e.lista_nueva + ')');
  af(() => (j.avisos.some((a) => /CDMX/.test(a) && /NO incluye autobús ni vuelo/.test(a))), 'CDMX pasando de solo-boleto a paquete con viaje: avisa que el sugerido NO trae transporte');
  j = await pide(C1, { evento_id: 'gira#0', paquete: 'plus', zona: 'Cancha VIP', hotel: 'Compartida' });
  af(() => (j.eleccion.sin_cambio === true && j.eleccion.modo === 'igual' && j.eleccion.total_sugerido === 5900), 'lo mismo que ya tiene: «sin cambio», su total se queda');
  j = await pide(C1, { evento_id: 'gira#0', paquete: 'plus', zona: 'Butaca', hotel: 'Compartida' });
  af(() => (j._s === 409 && /no es zona de esa fecha/.test(j.error || '')), () => 'una zona que ese día NO tiene (Butaca es del 16) rebota → ' + j._s);
  j = await pide(C1, { evento_id: 'solo', paquete: 'plus', zona: 'General' });
  af(() => (j._s === 400 && /MISMO evento/.test(j.error || '')), 'otra fecha solo dentro del MISMO evento (a otro tour es un traspaso)');
  j = await pide(C3, { evento_id: 'gira#0', paquete: 'cheap', zona: 'Coke Studio', hotel: 'Doble' });
  af(() => (j._s === 409 && /no lleva habitación/.test(j.error || '')), 'una habitación en un CHEAP rebota (no duerme)');
  j = await pide(C5, { evento_id: 'capital', paquete: 'stay', zona: 'General' });
  af(() => (j._s === 409), 'un paquete que ese evento no tiene (STAY en CDMX) rebota');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[C] candados');
  semilla();
  j = await req({ accion: 'cambio_opciones', id: P9 });
  af(() => (j._s === 400 && /Capturar abono/.test(j.error || '')), 'un comprobante tiene su propio botón (➕ Capturar abono): aquí se rehúsa');
  j = await req({ accion: 'cambio_opciones', id: Q10 });
  af(() => (j._s === 400 && /Aplicar paquete/.test(j.error || '')), 'la elección de paquete de la preventa también (✓ Aplicar paquete — PAQ-SOLO-APLICAR-1 sigue vivo)');
  j = await req({ accion: 'cambio_opciones', id: C11 });
  af(() => (j._s === 409 && /ya no está pendiente/.test(j.error || '')), 'una solicitud ya cerrada no se vuelve a abrir');
  j = await req({ accion: 'cambio_opciones', id: C7 });
  af(() => (j._s === 409 && /CANCELADO/.test(j.error || '')), 'un lugar cancelado no se edita desde aquí');
  j = await req({ accion: 'cambio_opciones', id: C12 });
  af(() => (j._s === 409 && /PREVENTA A CIEGAS/.test(j.error || '') && /Elegir paquete/.test(j.error || '')), '🔒 quien sigue en preventa a ciegas no se saca de ahí por esta puerta: su paquete lo aplica «🎟 Elegir paquete» (descuento y contrato)');
  j = await req({ accion: 'cambio_opciones', id: uuid(999) });
  const jMalo = await req({ accion: 'cambio_opciones', id: 'no-es-uuid' });
  af(() => (j._s === 404 && jMalo._s === 400), 'id inexistente 404 · id mal formado 400');
  catalogoCaido = true; j = await req({ accion: 'cambio_opciones', id: C1 }); catalogoCaido = false;
  af(() => (j._s === 502 && /catálogo/.test(j.error || '')), 'catálogo ilegible → 502 y se dice (no se cambia a ciegas)');
  DB.fallaAbonos = true; j = await req({ accion: 'cambio_opciones', id: C1 }); DB.fallaAbonos = false;
  af(() => (j._s === 200 && j.hoy.total === 5900 && j.hoy.abonado === null && j.avisos.some((a) => /No pude leer sus pagos/.test(a))), 'sin poder leer sus pagos: lo demás sale IGUAL, lo pagado va en null (no en $0) y se dice');
  af(() => (escrituras().length === 0), () => '🔒 cambio_opciones SOLO LEE: ' + escrituras().length + ' escrituras en todo [C] (' + DB.seq.length + ' lecturas)');
  // Otro usuario (la sesión viva se cachea POR usuario: con el mismo id heredaría el rol de Bulma).
  const coordi = jwtSign({ id: 'u-coordi', rol: 'coordinador', correo: 'c@x.mx', nombre: 'Coordi' }, process.env.JWT_SECRET, 3600);
  const rCo = await HR({ httpMethod: 'POST', path: '/.netlify/functions/admin-requisiciones', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + coordi }, body: JSON.stringify({ accion: 'cambio_opciones', id: C1 }) });
  af(() => (rCo.statusCode === 403), () => 'un rol de fuera de la bandeja no entra (coordinador → ' + rCo.statusCode + ')');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[D] la lista (cambios_listar)');
  semilla();
  j = await req({ accion: 'cambios_listar', estado: 'pendiente' });
  const cD = (j.cambios || []).find((c) => c.id === C1);
  af(() => (cD && cD.viajero.hotel_tipo === 'Compartida' && cD.viajero.boletos === 1 && !('total_contrato' in cD.viajero)), 'cada cambio trae la habitación y los lugares de HOY (el dinero crudo sigue sin viajar en `viajero`)');
  j = await req({ accion: 'cambios_listar', estado: 'todas', solo_cambios: true });
  af(() => (j._s === 200 && j.cambios.length === 11 && j.cambios.every((c) => c.tipo !== 'pago') && j.cambios.some((c) => c.id === C11)), () => 'el historial (`solo_cambios`) no trae comprobantes: ' + (j.cambios || []).length + ' filas, 0 pagos');
  af(() => (escrituras().length === 0), 'y sigue siendo de solo lectura');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[E] la pantalla, de punta a punta contra los DOS handlers reales');
  semilla();
  const els = {};
  const nodo = (id) => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, disabled: false, className: '', dataset: {}, style: {},
    classList: { _s: new Set(), toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }, contains(c) { return this._s.has(c); } },
    parentNode: { insertBefore: () => {} }, appendChild: () => {}, focus: () => {}, querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {} });
  // El DOM de mentira no parsea HTML: al pintarse el esqueleto del panel, sus
  // cajas se «hidratan» con lo que el HTML dice (value / checked), para que la
  // pantalla nazca con los valores que de verdad trae su marcado.
  const hidrata = (html) => { for (const m of String(html).matchAll(/<input\b([^>]*)>/g)) { const a = m[1]; const id = (/\bid="([^"]+)"/.exec(a) || [])[1]; if (!id) continue;
    const n = nodo(id); n.value = ((/\bvalue="([^"]*)"/.exec(a) || [])[1] || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'); n.checked = /\bchecked\b/.test(a); } };
  const toasts = [], llamadasC = [];
  const ctx = { console, setTimeout: () => 0, confirm: () => true, alert: () => {}, navigator: {}, window: { open: () => {} },
    document: { getElementById: (id) => nodo(id), createElement: () => nodo('nuevo'), querySelectorAll: () => [], querySelector: () => null },
    showToast: (t, k) => toasts.push([t, k]), khPaqueteTexto: () => '', KH_PREVENTA_DESCUENTO: 300, currentUser: { rol: 'bulma' }, _tsToDate: (x) => new Date(x),
    khAdminFetch: async (url, o) => {
      const fn = /admin-coordi-asignaciones/.test(url) ? 'admin-coordi-asignaciones' : 'admin-requisiciones';
      if (fn === 'admin-coordi-asignaciones') llamadasC.push(JSON.parse(o.body));
      const rr = await (fn === 'admin-coordi-asignaciones' ? HC : HR)(ev0(fn, o.body));
      return { ok: rr.statusCode < 300, status: rr.statusCode, json: async () => JSON.parse(rr.body) }; } };
  vm.createContext(ctx);
  // khViajeros es el REAL (rebanado de kamehouse.js): si alguien le cambia la
  // firma a editarFull o a mudarFecha, este careo lo ve.
  const KH = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const iKh = KH.indexOf('const khAsignaciones = {'), fKh = KH.indexOf('// [MIG-1a] EL WIZARD DE MIGRACIÓN');
  vm.runInContext(KH.slice(iKh, KH.lastIndexOf('\n', fKh)), ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8'), ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run('_reqContar = () => {}');
  const quieto = async (id) => { for (let i = 0; i < 400; i++) { await new Promise((ok) => setImmediate(ok)); if (run(`!_reqCam['${id}'] || (!_reqCam['${id}'].cargando && !_reqCam['${id}'].revalidar)`)) return; } throw new Error('el panel nunca terminó de cargar'); };
  const abrir = async (id) => { await run(`_reqCambioAplicarAbrir('${id}')`); hidrataPanel(id); await quieto(id); };
  // El esqueleto se pinta ANTES de la primera lectura; se hidrata y se repinta el total que la lectura puso.
  const hidrataPanel = (id) => { const tot = nodo('rq-cam-tot-' + id).value; hidrata(nodo('rq-cambio-form-' + id).innerHTML); nodo('rq-cam-tot-' + id).value = tot; };
  const sel = async (id, campo, valor) => { run(`_reqCambioAplicarSel('${id}','${campo}','${valor}')`); await quieto(id); };
  const guardar = async (id) => { await run(`_reqCambioAplicarGo('${id}')`); for (let i = 0; i < 30; i++) await new Promise((ok) => setImmediate(ok)); };
  const vjDe = (id) => DB.vj.find((v) => v.id === id), camDe = (id) => DB.cam.find((c) => c.id === id);
  await run('loadCambiosPortal()'); for (let i = 0; i < 30; i++) await new Promise((ok) => setImmediate(ok));
  const hC = nodo('req-cambios').innerHTML;
  const tarjeta = (h, id) => { const i = h.indexOf('id="rq-cambio-' + id + '"'); const k = h.indexOf('<div class="rq-cambio" id="rq-cambio-', i + 10); return h.slice(i, k < 0 ? h.length : k); };
  const t1 = tarjeta(hC, C1);
  af(() => (/class="rq-btn pri" onclick="_reqCambioAplicarAbrir\('/.test(t1) && /✏️ Hacer el cambio/.test(t1) && t1.indexOf('Hacer el cambio') < t1.indexOf('Ya lo atendí por fuera') && t1.indexOf('Ya lo atendí por fuera') < t1.indexOf('No procede')),
    'la tarjeta: el paso en verde es «✏️ Hacer el cambio»; «Ya lo atendí por fuera» y «No procede» quedan discretos, al final');
  af(() => (/hoy: PLUS · Cancha VIP · hab\. Compartida/.test(t1) && /Quiero habitación doble/.test(t1)), 'y dice cómo está HOY completo (paquete · zona · habitación) junto a lo que pidió');
  af(() => (/_reqPaqAbrir/.test(tarjeta(hC, Q10)) && !/_reqCambioAplicarAbrir/.test(tarjeta(hC, Q10))), 'la elección de paquete de la preventa conserva SU botón (✓ Aplicar paquete)');

  // E1 · habitación: un solo dueño, un correo, y la solicitud cerrada con SUS frases.
  await abrir(C1);
  af(() => (nodo('rq-cam-tot-' + C1).value == 5900 && nodo('rq-cam-av-' + C1).checked === true && /Aplicamos el cambio que pediste desde tu Portal/.test(nodo('rq-cam-nota-' + C1).value)),
    'el panel nace con lo que TIENE: total $5,900, el aviso por correo prendido (a la vista) y el mensaje ya escrito');
  af(() => (/Hoy tiene: <b>11 ene 2027 · PLUS · Cancha VIP · hab\. Compartida<\/b>/.test(nodo('rq-cam-hoy-' + C1).innerHTML) && /pagado <b>\$600<\/b>/.test(nodo('rq-cam-hoy-' + C1).innerHTML)), 'dice su viaje de hoy y lo que lleva pagado');
  af(() => (/<option value="Cancha VIP" selected>Cancha VIP · \$5,900 · quedan 18 \(la suya\)<\/option>/.test(nodo('rq-cam-sel-' + C1).innerHTML) && /Oro · \$6,500 · agotada en la ficha/.test(nodo('rq-cam-sel-' + C1).innerHTML)),
    'las zonas con precio, «quedan N» y la suya marcada; la agotada se rotula');
  await guardar(C1);
  af(() => (llamadasC.length === 0 && /Aún no cambias nada/.test(nodo('rq-cambio-msg-' + C1).textContent) && camDe(C1).estado === 'pendiente'), '🔒 sin cambiar nada NO se guarda ni se cierra (y se dice qué hacer)');
  await sel(C1, 'hotel', 'Doble');
  af(() => (nodo('rq-cam-tot-' + C1).value == 6550 && /diferencia <b>\+\$650<\/b>/.test(nodo('rq-cam-sug-' + C1).innerHTML)), () => 'elegir Doble: el total sugerido cae solo a la caja ($' + nodo('rq-cam-tot-' + C1).value + ') y la línea explica de dónde sale');
  af(() => (/habitación Compartida → <b>Doble<\/b>/.test(nodo('rq-cam-res-' + C1).innerHTML) && /total \$5,900 → <b>\$6,550<\/b>/.test(nodo('rq-cam-res-' + C1).innerHTML) && /le faltarán <b>\$5,950<\/b>/.test(nodo('rq-cam-res-' + C1).innerHTML)),
    'el resumen dice lo que va a cambiar y cuánto le va a faltar ($6,550 − $600 pagados)');
  af(() => (/viaja en grupo: si su acompañante tiene fila propia, cámbiale también la habitación/.test(nodo('rq-cam-res-' + C1).innerHTML)), 'y como viaja en grupo, recuerda a su acompañante (su fila es aparte)');
  await guardar(C1);
  af(() => (llamadasC.length === 1 && llamadasC[0].accion === 'viajero_editar_full' && llamadasC[0].id === V1 && JSON.stringify(llamadasC[0].campos) === JSON.stringify({ hotel_tipo: 'Doble', total_contrato: 6550 })),
    () => '🔒 lo guarda el DUEÑO de siempre (viajero_editar_full) y solo viaja LO QUE CAMBIÓ: ' + JSON.stringify(llamadasC[0] && llamadasC[0].campos));
  af(() => (vjDe(V1).hotel_tipo === 'Doble' && vjDe(V1).total_contrato === 6550 && vjDe(V1).abonado_previo === 300 && /\[EDITA 2026-11-13\] habitación Compartida → Doble; total \$5900 → \$6550 · Bulma/.test(vjDe(V1).notas)),
    'quedó GUARDADO en su viaje (habitación y total), con el rastro de quién — y lo pagado intacto');
  af(() => (camDe(C1).estado === 'atendida' && camDe(C1).atendida_por === 'Bulma' && camDe(C1).respuesta === 'Cambio aplicado: habitación Compartida → Doble; total $5900 → $6550'),
    () => '🔒 la solicitud queda APROBADA y lo escrito en ella son las frases del dueño: «' + camDe(C1).respuesta + '»');
  af(() => (DB.mails.length === 1 && DB.mails[0].to[0] === 'ana@x.com' && /Actualizamos tu viaje · Gira Norte/.test(DB.mails[0].subject) && /Aplicamos el cambio que pediste desde tu Portal/.test(DB.mails[0].html) && /habitación Compartida → Doble/.test(DB.mails[0].html)),
    'al cliente le llega UN correo (el de siempre: «Actualizamos tu viaje») con lo que cambió y el mensaje');
  af(() => (toasts.some((t) => /Cambio guardado y aprobado/.test(t[0]) && /correo enviado a ana@x\.com/.test(t[0]) && t[1] === 'success')), 'y el aviso en pantalla lo dice todo: guardado, aprobado y correo enviado');
  af(() => (!DB.seq.some((s) => /abonos_viajero/.test(s) && !/^GET/.test(s))), '🔒 cero escrituras a abonos: un cambio de viaje no toca dinero cobrado');

  // E2 · fecha: la mudanza, por SU dueño.
  llamadasC.length = 0; DB.mails.length = 0; toasts.length = 0;
  await abrir(C2);
  await sel(C2, 'evento_id', 'gira#1');
  af(() => (run(`_reqCam['${C2}'].sel.zona`) === '' && /<option value="">— elige —<\/option><option value="Oro"/.test(nodo('rq-cam-sel-' + C2).innerHTML) && /Elige la zona/.test(nodo('rq-cam-sug-' + C2).innerHTML)),
    'al cambiar de FECHA llegan las zonas de ese día; la suya (Cancha VIP) no existe ahí → se pide elegir, no se arrastra');
  await sel(C2, 'zona', 'Butaca');
  af(() => (nodo('rq-cam-tot-' + C2).value == 4700), () => 'la diferencia respeta su descuento: $5,400 − $700 = $' + nodo('rq-cam-tot-' + C2).value);
  af(() => (/al moverlo de fecha se le suelta su cuarto del rooming y su grupo «viaja con»/.test(nodo('rq-cam-res-' + C2).innerHTML)), '🔒 lo que la mudanza SUELTA (su cuarto y su grupo) se dice ANTES de guardar');
  await guardar(C2);
  af(() => (vjDe(V2).habitacion_id === null && vjDe(V2).grupo_viaje === null && toasts.some((t) => /se soltó su habitación/.test(t[0]) && t[1] === 'warning')), 'y al guardar el dueño los suelta y el aviso lo repite');
  af(() => (llamadasC.length === 1 && llamadasC[0].accion === 'viajero_mudar_fecha' && llamadasC[0].destino === 'gira#1' && llamadasC[0].zona_boleto === 'Butaca' && llamadasC[0].total_contrato === 4700),
    () => '🔒 cambio de fecha → lo hace el dueño de la mudanza (viajero_mudar_fecha), con zona y total en la MISMA llamada: ' + JSON.stringify([llamadasC[0].accion, llamadasC[0].destino, llamadasC[0].zona_boleto, llamadasC[0].total_contrato]));
  af(() => (vjDe(V2).evento_id === 'gira#1' && vjDe(V2).zona_boleto === 'Butaca' && vjDe(V2).total_contrato === 4700 && /\[MUDANZA 2026-11-13\] gira#0 → gira#1/.test(vjDe(V2).notas)), 'quedó guardado: está en el 16, en Butaca, con su total');
  af(() => (camDe(C2).estado === 'atendida' && /^Cambio aplicado: fecha «/.test(camDe(C2).respuesta) && /zona «Cancha VIP» → «Butaca»/.test(camDe(C2).respuesta)), () => 'y la solicitud cerrada con lo que se hizo: «' + camDe(C2).respuesta + '»');
  af(() => (DB.mails.length === 1 && /Tu viaje cambió de fecha/.test(DB.mails[0].subject)), 'UN correo: «Tu viaje cambió de fecha»');

  // E3 · fecha + paquete + habitación: el ORDEN y un solo correo.
  llamadasC.length = 0; DB.mails.length = 0; toasts.length = 0;
  await abrir(C3);
  await sel(C3, 'evento_id', 'gira#1');
  await sel(C3, 'paquete', 'plus');
  await sel(C3, 'zona', 'Butaca');
  await sel(C3, 'hotel', 'Doble');
  af(() => (nodo('rq-cam-tot-' + C3).value == 5400 - 5400 + lista('gira#1', 'plus', 'Butaca', 'Doble', 2)), () => 'CHEAP Coke Studio del 11 → PLUS Butaca Doble del 16: total sugerido $' + nodo('rq-cam-tot-' + C3).value);
  await guardar(C3);
  af(() => (llamadasC.length === 2 && llamadasC[0].accion === 'viajero_editar_full' && JSON.stringify(llamadasC[0].campos) === JSON.stringify({ tipo_paquete: 'plus', hotel_tipo: 'Doble' }) && llamadasC[0].avisar === false
    && llamadasC[1].accion === 'viajero_mudar_fecha' && llamadasC[1].zona_boleto === 'Butaca' && llamadasC[1].avisar === true),
  () => '🔒 el orden: primero lo que la mudanza no toca (paquete, habitación) SIN correo, luego la mudanza con zona + total: ' + llamadasC.map((c) => c.accion).join(' → '));
  af(() => (vjDe(V3).evento_id === 'gira#1' && vjDe(V3).tipo_paquete === 'plus' && vjDe(V3).zona_boleto === 'Butaca' && vjDe(V3).hotel_tipo === 'Doble' && vjDe(V3).total_contrato === 5850), () => 'todo quedó guardado: ' + JSON.stringify([vjDe(V3).evento_id, vjDe(V3).tipo_paquete, vjDe(V3).zona_boleto, vjDe(V3).hotel_tipo, vjDe(V3).total_contrato]));
  af(() => (DB.mails.length === 1 && /cambió de fecha/.test(DB.mails[0].subject) && /También: paquete cheap → plus; habitación — → Doble\./.test(DB.mails[0].html)), 'UN solo correo (el de la mudanza) que también nombra el paquete y la habitación');
  af(() => (camDe(C3).estado === 'atendida' && /paquete cheap → plus; habitación — → Doble; fecha/.test(camDe(C3).respuesta)), 'y la solicitud guarda las frases de los DOS dueños, en orden');

  // E4 · el dueño falla → NO se cierra.
  llamadasC.length = 0; DB.mails.length = 0; toasts.length = 0;
  await abrir(C4); await sel(C4, 'hotel', 'Doble');
  DB.fallaPatchVj = true; await guardar(C4); DB.fallaPatchVj = false;
  af(() => (camDe(C4).estado === 'pendiente' && vjDe(V4).hotel_tipo === null && toasts.length === 0 && nodo('rq-cambio-msg-' + C4).textContent.length > 5 && nodo('rq-cam-go-' + C4).disabled === false),
    () => '🔒 si el viaje NO se pudo guardar, la solicitud NO se cierra y se dice: «' + nodo('rq-cambio-msg-' + C4).textContent.slice(0, 60) + '…»');
  // E5 · se guardó pero el cierre falla → se dice; el reintento NO vuelve a escribir.
  DB.fallaCierre = true; await guardar(C4);
  af(() => (vjDe(V4).hotel_tipo === 'Doble' && vjDe(V4).total_contrato === 4650 && camDe(C4).estado === 'pendiente' && /SÍ quedó guardado en su viaje/.test(nodo('rq-cambio-msg-' + C4).textContent)),
    'el viaje se guardó y el cierre falló: se dice con lo que SÍ quedó, y la solicitud sigue a la vista');
  const antes = parches('viajeros_evento').length, mailsAntes = DB.mails.length;
  await guardar(C4);
  af(() => (camDe(C4).estado === 'atendida' && parches('viajeros_evento').length === antes && DB.mails.length === mailsAntes && /ya estaba aplicado en su viaje/.test(camDe(C4).respuesta)),
    () => '🔒 el segundo clic solo CIERRA: 0 escrituras más al viaje y 0 correos más (' + (parches('viajeros_evento').length - antes) + ' · ' + (DB.mails.length - mailsAntes) + ')');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[F] lo tecleado manda · lo no confiable no se pone solo · sin publicar no avisa');
  semilla(); llamadasC.length = 0; toasts.length = 0; Object.keys(els).forEach((k) => delete els[k]);
  await run('loadCambiosPortal()'); for (let i = 0; i < 30; i++) await new Promise((ok) => setImmediate(ok));
  await abrir(C1);
  nodo('rq-cam-tot-' + C1).value = '6300'; run(`_reqCambioAplicarTotal('${C1}')`);
  await sel(C1, 'hotel', 'Doble');
  af(() => (nodo('rq-cam-tot-' + C1).value === '6300' && /usar \$6,550/.test(nodo('rq-cam-sug-' + C1).innerHTML)), '🔒 un total TECLEADO no lo pisa el sugerido ($6,300 se queda) — el sugerido se ofrece con «usar $6,550»');
  run(`_reqCambioAplicarUsar('${C1}')`);
  af(() => (nodo('rq-cam-tot-' + C1).value == 6550), '«usar» lo pone');
  nodo('rq-cam-tot-' + C1).value = '6300'; run(`_reqCambioAplicarTotal('${C1}')`); nodo('rq-cam-av-' + C1).checked = false;
  await guardar(C1);
  af(() => (vjDe(V1).total_contrato === 6300 && DB.mails.length === 0 && llamadasC[llamadasC.length - 1].avisar === false && toasts.some((t) => /sin correo al cliente/.test(t[0]))), 'se guarda el total que confirmó el humano ($6,300); con la casilla apagada no sale correo, y se dice');
  await abrir(C6); await sel(C6, 'zona', 'VIP');
  af(() => (nodo('rq-cam-tot-' + C6).value == 4000 && /no se puso solo/.test(nodo('rq-cam-sug-' + C6).innerHTML) && /usar \$5,000/.test(nodo('rq-cam-sug-' + C6).innerHTML)), '🔒 un sugerido NO confiable no cae a la caja: su total se queda ($4,000) y se ofrece');
  af(() => (/Zona Extinta · ya no está en la ficha/.test(nodo('rq-cam-sel-' + C6).innerHTML)), 'su zona vieja sigue en la lista, rotulada');
  await abrir(C8);
  af(() => (/no está publicado en su Portal/.test(nodo('rq-cam-avw-' + C8).innerHTML)), 'un viaje sin publicar: la casilla del correo se cambia por el porqué');
  await sel(C8, 'hotel', 'Doble'); await guardar(C8);
  af(() => (vjDe(V8).hotel_tipo === 'Doble' && camDe(C8).estado === 'atendida' && DB.mails.length === 0 && llamadasC[llamadasC.length - 1].avisar === false), 'se guarda y se aprueba igual, sin correo');
  await run(`_reqCambioAplicarAbrir('${C12}')`); for (let i = 0; i < 30; i++) await new Promise((ok) => setImmediate(ok));
  af(() => (/PREVENTA A CIEGAS/.test(nodo('rq-cambio-form-' + C12).innerHTML) && !/_reqCambioAplicarGo/.test(nodo('rq-cambio-form-' + C12).innerHTML)), 'si no se puede cambiar por aquí, el panel se vuelve el PORQUÉ (sin un «Guardar» que no haría nada)');
  // El director (solo lectura) no ve los botones que escriben: los esconde el CSS por el nombre.
  const CSS = fs.readFileSync(path.join(RAIZ, 'kamehouse.css'), 'utf8');
  const pats = [...CSS.matchAll(/body\.kh-solo-lectura \[onclick\*="([^"]+)" i\]/g)].map((m) => m[1].toLowerCase());
  const escriben = ['_reqCambioAplicarAbrir', '_reqCambioAplicarGo', '_reqCambioAplicarUsar'];
  af(() => (pats.length > 30 && escriben.every((f) => pats.some((p) => f.toLowerCase().includes(p)))), () => 'los botones nuevos que ESCRIBEN quedan escondidos para el director (patrones leídos del CSS: ' + pats.length + ')');
  // El historial: lo que se le cambió a quién.
  await run('_reqCambiosHist()');
  const hH = nodo('req-cambios-hist').innerHTML;
  af(() => (/Ana Hotel|Persona/.test(hH) && /✓ Atendido<\/span>: Cambio aplicado: habitación Compartida → Doble; total \$5900 → \$6300/.test(hH) && /· Bulma/.test(hH) && !/declara \$480/.test(hH)),
    'el historial enseña lo ya atendido con lo que se hizo y quién (sin comprobantes)');
  af(() => (/ontoggle="if\(this\.open\)_reqCambiosHist\(\)"/.test(nodo('req-cambios').innerHTML)), 'y se pide solo al abrirlo (no en cada carga de la bandeja)');

  console.log('\n' + (V === 0 ? 'NADA MEDIDO · esto NO es un verde' : (R ? '🔴 ROJO' : '✅ VERDE')) + ' · ' + V + ' en verde, ' + R + ' en rojo');
  process.exit(R || !V ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + (e && e.stack)); process.exit(1); });
