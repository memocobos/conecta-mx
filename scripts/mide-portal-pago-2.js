#!/usr/bin/env node
/* =============================================================================
 * mide-portal-pago-2 — PAGAR DESDE EL PORTAL: el DESGLOSE del comprobante y el
 * LINK DE MERCADO PAGO por cuota (PORTAL-PAGO-2, 9-nov-2026).
 * Palabra de Memo: «construye lo del desglose … y también da opción de pagar
 * desde el portal con mercado pago y transferencia, etc».
 *
 * Entra por los CUATRO handlers REALES —portal-viajero · portal-mi-plan-migrado
 * · mp-webhook · admin-requisiciones— con una red falsa que modela Supabase (KH
 * y Portal, con filtros `eq/neq/is.null/in/or`, estado, el CHECK nuevo de
 * `cambios_viajero_pago_foto` y el índice único de mp_pagos), Mercado Pago
 * (preferences + GET payments) y el storage.
 *
 * 🔒 LAS LEYES QUE ESTE CAREO GUARDA:
 *   · el Portal NO ESCRIBE DINERO: ni subir comprobante, ni pedir link, ni el
 *     webhook tocan abonos_viajero/viajeros_evento (medido POR EL HECHO con
 *     control positivo del contador);
 *   · el desglose solo nombra a quien VIAJA CON la persona (su grupo);
 *   · un link SIN PAGAR no es pendiente del equipo (ni se lista ni se cuenta
 *     ni ocupa el tope del cliente); PAGADO sí;
 *   · el reparto de la bandeja nace UNA vez, un abono por persona, con el mismo
 *     comprobante/mp_pago_id, y con MP la suma ES el neto.
 * ⚠️ SIN ANCLA (árbol de trabajo), como mide:pagos-portal-2 / mide:mp-link-1.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
function af(ok, msg) { try { ok = typeof ok === 'function' ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } }

process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_ANON_KEY = 'anon';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'pt-falsa';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.JWT_SECRET = 'secreto';
process.env.SITE_URL = 'https://conectareynosa.mx';
const MP_ON = () => { process.env.PAGOS_MP_MODO = 'live'; process.env.MP_ACCESS_TOKEN = 'APP_USR-arnes'; process.env.MP_WEBHOOK_SECRET = 'sec-arnes'; process.env.MP_PCT_LINK = '0.0379'; process.env.MP_FIJA_LINK = '4'; delete process.env.MP_ABSORBE_CARGO; };
const MP_OFF = () => { delete process.env.PAGOS_MP_MODO; delete process.env.MP_ACCESS_TOKEN; delete process.env.MP_WEBHOOK_SECRET; delete process.env.MP_PCT_LINK; delete process.env.MP_FIJA_LINK; };

const INDEX_HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const VK = 'aaaaaaaa-0000-4000-8000-000000000001';   // Karina, titular del grupo G1
const VJ = 'aaaaaaaa-0000-4000-8000-000000000002';   // Jose, su acompañante (otro correo)
const VX = 'aaaaaaaa-0000-4000-8000-000000000003';   // OTRA persona, fuera del grupo
const VS = 'aaaaaaaa-0000-4000-8000-000000000004';   // Karina SIN sellar
const G1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1]).toString('base64');

// El rol fijo lo arma el DUEÑO (plan-fijo), con fechas RELATIVAS a hoy: separo
// hace 40 días, evento en 120 días → hay cuotas pasadas (vencidas) y futuras.
const PF = require(path.join(RAIZ, 'netlify/functions/_lib/plan-fijo.js'));
const iso = (d) => d.toISOString().slice(0, 10);
const HOY = new Date();
const SEP = iso(new Date(HOY.getTime() - 40 * 864e5));
const DS = iso(new Date(HOY.getTime() + 120 * 864e5));
const planDe = (total) => PF.armarPlanFijo({ separo_fecha: SEP, separo_monto: 300, total, paquete: 'plus', ds: DS });

function red(opts) {
  opts = opts || {};
  const st = {
    viajeros: [
      { id: VK, portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'fuerzaregida#0', nombre: 'Karina T', correo: 'karina@prueba.mx', celular: '8991112233', tipo_paquete: 'plus', zona_boleto: 'Barrera', total_contrato: 5500, abonado_previo: 300, grupo_viaje: G1, boletos: 1, plan_pagos: planDe(5500) },
      { id: VJ, portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'fuerzaregida#0', nombre: 'Jose P', correo: 'jose@prueba.mx', celular: null, tipo_paquete: 'plus', zona_boleto: 'Barrera', total_contrato: 5500, abonado_previo: 300, grupo_viaje: G1, boletos: 1, plan_pagos: planDe(5500) },
      { id: VX, portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'fuerzaregida#0', nombre: 'Otro', correo: 'otro@x.mx', celular: null, tipo_paquete: 'cheap', zona_boleto: 'Oro', total_contrato: 3000, abonado_previo: 0, grupo_viaje: null, boletos: 1, plan_pagos: null },
      { id: VS, portal_revisado_at: null, evento_id: 'fuerzaregida#0', nombre: 'Karina sin sello', correo: 'karina@prueba.mx', celular: null, tipo_paquete: 'cheap', zona_boleto: 'Oro', total_contrato: 3000, abonado_previo: 0, grupo_viaje: null, boletos: 1, plan_pagos: null },
    ],
    cambios: [], abonos: [], mp_pagos: [], portal_revisiones: [], grupos_whatsapp: [], storage: {}, prefs: [], pagosMP: opts.pagosMP || {}, log: [], dinero: [],
    mpRechaza: !!opts.mpRechaza,
    usuarios: { 'jwt-karina': { id: 'u1', email: 'karina@prueba.mx', email_confirmed_at: '2026-10-13' }, 'jwt-jose': { id: 'u2', email: 'jose@prueba.mx', email_confirmed_at: '2026-10-13' } },
  };
  let seq = 1;
  const resp = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const f = (url) => { const o = []; for (const [k, v] of new URL(url).searchParams) o.push([k, decodeURIComponent(v)]); return o; };
  const casa1 = (row, k, v) => {
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('neq.')) return String(row[k]) !== v.slice(4);
    if (v === 'is.null') return row[k] == null;
    if (v === 'not.is.null') return row[k] != null;
    if (v.startsWith('ilike.')) return String(row[k] || '').toLowerCase() === v.slice(6).toLowerCase();
    if (v.startsWith('gte.')) return String(row[k] || '') >= v.slice(4);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(row[k]));
    throw new Error('filtro no modelado ' + k + '=' + v);
  };
  // `or=(a.op.x,b.op.y)` — la forma de PostgREST, modelada igual que el real.
  const casa = (row, fl) => fl.every(([k, v]) => {
    if (['select', 'limit', 'order'].includes(k)) return true;
    if (k === 'or') return v.slice(1, -1).split(',').some((t) => { const i = t.indexOf('.'); return casa1(row, t.slice(0, i), t.slice(i + 1)); });
    return casa1(row, k, v);
  });
  st.fetch = async (url, init) => {
    init = init || {}; const m = (init.method || 'GET').toUpperCase(); url = String(url); st.log.push(m + ' ' + url);
    if (url.startsWith('https://pt.falso.test/auth/v1/user')) {
      const t = ((init.headers || {}).Authorization || '').slice(7); return st.usuarios[t] ? resp(200, st.usuarios[t]) : resp(401, {}); }
    if (m === 'DELETE') throw new Error('DELETE prohibido');
    if (url.includes('/index.html') || /conectareynosa\.mx\/?$/.test(url)) return resp(200, INDEX_HTML);
    if (url.includes('/rest/v1/usuarios')) return resp(200, [{ activo: true, rol: url.includes('u-cc') ? 'cc' : 'bulma', sesiones_invalidas_antes: null }]);
    // Mercado Pago
    if (url.startsWith('https://api.mercadopago.com/checkout/preferences') && m === 'POST') {
      if (st.mpRechaza) return resp(400, { message: 'invalid access token' });
      const p = JSON.parse(init.body); const id = 'PREF-' + seq++;
      st.prefs.push({ id, body: p, idem: (init.headers || {})['X-Idempotency-Key'] });
      return resp(201, { id, init_point: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=' + id, sandbox_init_point: 'https://sandbox/' + id });
    }
    let mm = url.match(/^https:\/\/api\.mercadopago\.com\/v1\/payments\/(\d+)$/);
    if (mm) { const p = st.pagosMP[mm[1]]; return p ? resp(200, p) : resp(404, { message: 'not found' }); }
    if (url.includes('/storage/v1/object/sign/')) {
      const p = decodeURI(url.split('/storage/v1/object/sign/')[1]);
      if (!st.storage[p]) return resp(404, { error: 'Object not found' });
      return resp(200, { signedURL: '/object/sign/' + p + '?token=FIRMA' });
    }
    if (url.includes('/storage/v1/object/')) {
      const p = decodeURI(url.split('/storage/v1/object/')[1]);
      st.storage[p] = { bytes: init.body, mime: (init.headers || {})['Content-Type'] };
      return resp(200, { Key: p });
    }
    const tabla = url.includes('/viajeros_evento') ? 'viajeros' : url.includes('/cambios_viajero') ? 'cambios' : url.includes('/abonos_viajero') ? 'abonos'
      : url.includes('/mp_pagos') ? 'mp_pagos' : url.includes('/portal_revisiones') ? 'portal_revisiones' : url.includes('/grupos_whatsapp') ? 'grupos_whatsapp' : null;
    if (!tabla) throw new Error('URL no contemplada ' + m + ' ' + url);
    if ((m === 'POST' || m === 'PATCH') && (tabla === 'abonos' || tabla === 'viajeros')) st.dinero.push(m + ' ' + tabla);
    const fl = f(url); const T = st[tabla];
    if (m === 'GET') return resp(200, T.filter((r) => casa(r, fl)).map((r) => Object.assign({}, r)));
    if (m === 'PATCH') { const c = JSON.parse(init.body); const rows = T.filter((r) => casa(r, fl)); rows.forEach((r) => Object.assign(r, c)); return resp(200, rows.map((r) => Object.assign({}, r))); }
    if (m === 'POST') {
      const cuerpo = JSON.parse(init.body);
      const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((x) => Object.assign({ id: x.id || ('cccccccc-0000-4000-8000-' + String(seq++).padStart(12, '0')), creado_en: new Date().toISOString() }, tabla === 'cambios' ? { estado: 'pendiente' } : {}, x));
      for (const row of filas) {
        // El CHECK RE-CREADO por PORTAL-PAGO-2: un pago existe con foto O con link.
        if (tabla === 'cambios' && row.tipo === 'pago' && !row.foto_path && !row.mp_preference_id) return resp(400, { code: '23514', message: 'violates check constraint "cambios_viajero_pago_foto"' });
        if (tabla === 'cambios' && row.desglose != null && !Array.isArray(row.desglose)) return resp(400, { code: '23514', message: 'violates check constraint "cambios_viajero_desglose_forma"' });
        if (tabla === 'mp_pagos' && T.some((y) => y.mp_payment_id === row.mp_payment_id)) return resp(409, { code: '23505', message: 'duplicate key value violates unique constraint "mp_pagos_mp_payment_id_key"' });
      }
      filas.forEach((x) => T.push(x));
      return resp(201, filas);
    }
    throw new Error('método ' + m);
  };
  return st;
}
function fresco() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions')) delete require.cache[k]; });
  return {
    pv: require(path.join(RAIZ, 'netlify/functions/portal-viajero.js')).handler,
    plan: require(path.join(RAIZ, 'netlify/functions/portal-mi-plan-migrado.js')).handler,
    webhook: require(path.join(RAIZ, 'netlify/functions/mp-webhook.js')).handler,
    adm: require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler,
    jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
    mp: require(path.join(RAIZ, 'netlify/functions/_lib/mercadopago.js')),
    link: require(path.join(RAIZ, 'netlify/functions/_lib/mp-link.js')),
    tarifas: require(path.join(RAIZ, 'netlify/functions/_lib/mp-tarifas.js')),
  };
}
const ev = (body, jwt) => ({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://conectareynosa.mx' }, jwt ? { authorization: 'Bearer ' + jwt } : {}), body: JSON.stringify(body) });
// portal-mi-plan-migrado es POST (el Portal lo pide así); el nombre es de lectura.
const evGet = (jwt) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jwt }, body: '{}' });
function notif(H, paymentId) {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = H.mp.firmarParaPruebas({ dataId: paymentId, xRequestId: 'rq-1', ts, secreto: process.env.MP_WEBHOOK_SECRET });
  return { httpMethod: 'POST', headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'rq-1' }, queryStringParameters: { 'data.id': paymentId, type: 'payment' }, body: JSON.stringify({ type: 'payment', action: 'payment.updated', id: 'n-1', data: { id: paymentId } }) };
}
const pagoMP = (id, ref, monto, estado, extra) => Object.assign({ id: Number(id), status: estado || 'approved', status_detail: 'accredited', transaction_amount: monto, currency_id: 'MXN', external_reference: ref, payment_method_id: 'visa', payment_type_id: 'credit_card', live_mode: true, transaction_details: { net_received_amount: Math.round(monto * 0.9595 * 100) / 100 } }, extra || {});

(async () => {
  console.log('══ mide:portal-pago-2 ══\n[L] el lib: referencia cv: y el link de cuota');
  MP_ON(); let st = red(); global.fetch = st.fetch; let H = fresco();
  af(H.link.referenciaCambio(VK) === 'cv:' + VK && H.link.cambioDeReferencia('cv:' + VK.toUpperCase()) === VK, '[L1] cv:<uuid> ida y vuelta (en minúsculas)');
  af(H.link.cambioDeReferencia('req:R-ABC') === null && H.link.cambioDeReferencia('cv:no-es-uuid') === null && H.link.cambioDeReferencia(VK) === null, '[L2] req:, basura y el uuid pelado NO son una cuota');
  af(H.link.folioDeReferencia('cv:' + VK) === null, '[L3] y la rama req: no se traga un cv:');
  let L = await H.link.crearLinkCuota({ cuota: { cambio_id: VK, viajero: { id: VK, nombre: 'K', correo: 'k@x.mx', evento_id: 'fuerzaregida#0' }, evento_nombre: 'Fuerza Regida', neto_pesos: 1300, etiqueta: 'Pago 2' } });
  const T = H.tarifas.calcularLink(1300);
  af(L.ok && L.total_pesos === T.total_pesos && L.neto_pesos === 1300 && st.prefs.length === 1, `[L4] el link cobra neto + comisión del dueño de tarifas (${L.total_pesos} = ${T.total_pesos})`);
  af(st.prefs[0].body.external_reference === 'cv:' + VK && st.prefs[0].body.items[0].unit_price === T.total_pesos && /portal\.html\?pago=ok/.test(st.prefs[0].body.back_urls.success), '[L5] la preferencia lleva cv:<id>, el total en PESOS y vuelve al Portal');
  L = await H.link.crearLinkCuota({ cuota: { cambio_id: 'no-uuid', neto_pesos: 100 } });
  af(!L.ok && st.prefs.length === 1, '[L6] cambio_id inválido → ok:false sin pegarle a MP');
  MP_OFF(); H = fresco();
  L = await H.link.crearLinkCuota({ cuota: { cambio_id: VK, neto_pesos: 100 } });
  af(!L.ok && /apagado/.test(L.motivo), '[L7] MP apagado → ok:false con motivo, jamás lanza');

  console.log('\n[G] portal-mi-plan-migrado — el grupo, los pendientes y mp_disponible');
  MP_ON(); st = red(); global.fetch = st.fetch; H = fresco();
  let r = await H.plan(evGet('jwt-karina')); let j = JSON.parse(r.body);
  let tk = j.tours && j.tours.find((t) => t.viajero_id === VK);
  af(r.statusCode === 200 && j.ok && tk, `[G1] el plan de Karina llega (${r.statusCode})`);
  af(tk && Array.isArray(tk.grupo) && tk.grupo.length === 1 && tk.grupo[0].viajero_id === VJ && tk.grupo[0].nombre === 'Jose P', '[G2] su grupo trae SOLO a Jose (mismo grupo_viaje, mismo evento, ella no se repite)');
  af(tk && tk.grupo[0].resta === 5200 && !('correo' in tk.grupo[0]) && !('celular' in tk.grupo[0]), '[G3] de Jose viaja nombre + dinero (resta 5200), NI correo NI celular');
  af(tk && tk.grupo[0].proximo > 0 && tk.grupo[0].proximo <= 5200, `[G4] y su próximo pago por el rol fijo (${tk && tk.grupo[0].proximo})`);
  af(tk && tk.mp_disponible === true && tk.sugerido > 0 && tk.sugerido <= 5200, `[G5] mp_disponible y el sugerido (atrasado + próxima = ${tk && tk.sugerido})`);
  af(tk && Array.isArray(tk.pagos_pendientes) && tk.pagos_pendientes.length === 0, '[G6] sin pagos pendientes al arrancar');
  const tx = j.tours.find((t) => t.viajero_id === VX);
  af(!tx, '[G7] la fila de OTRA persona no viaja (es del grupo? no — ni la pide)');
  MP_OFF(); H = fresco();
  r = await H.plan(evGet('jwt-karina')); j = JSON.parse(r.body); tk = j.tours.find((t) => t.viajero_id === VK);
  af(tk && tk.mp_disponible === false, '[G8] control positivo: MP apagado → mp_disponible false (el Portal no ofrece el camino 💳)');

  console.log('\n[D] subir_pago con DESGLOSE — texto para la bandeja, cero dinero');
  MP_ON(); st = red(); global.fetch = st.fetch; H = fresco();
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64, desglose: [{ viajero_id: VK, monto: 650 }, { viajero_id: VJ, monto: 650 }] }, 'jwt-karina')); j = JSON.parse(r.body);
  let c0 = st.cambios[0];
  af(r.statusCode === 200 && j.ok && st.cambios.length === 1, `[D1] con desglose válido → 200 y UNA solicitud (${r.statusCode} ${r.body.slice(0, 80)})`);
  af(c0 && Array.isArray(c0.desglose) && c0.desglose.length === 2 && c0.desglose[1].viajero_id === VJ && c0.desglose[1].monto === 650 && c0.desglose[1].nombre === 'Jose P', '[D2] el desglose se GUARDA estructurado con el nombre resuelto por el servidor');
  af(c0 && /declara \$1,300/.test(c0.detalle) && /reparto: Karina T \$650, Jose P \$650/.test(c0.detalle), '[D3] el detalle dice el total (suma del desglose) y el reparto en palabras');
  af(st.dinero.length === 0, '[D4] 🔒 CERO escrituras de dinero');
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64, desglose: [{ viajero_id: VK, monto: 650 }, { viajero_id: VX, monto: 650 }] }, 'jwt-karina'));
  af(r.statusCode === 400 && st.cambios.length === 1 && Object.keys(st.storage).length === 1, '[D5] 🔒 nombrar a alguien FUERA del grupo → 400, ni fila ni objeto (la foto no sube antes de validar)');
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64, desglose: [{ viajero_id: VK, monto: 650 }, { viajero_id: VK, monto: 650 }] }, 'jwt-karina'));
  af(r.statusCode === 400, '[D6] la misma persona dos veces → 400');
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64, desglose: [{ viajero_id: VK, monto: 0 }] }, 'jwt-karina'));
  af(r.statusCode === 400, '[D7] un monto en cero → 400');
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64, desglose: [] }, 'jwt-karina'));
  af(r.statusCode === 400, '[D8] desglose vacío → 400 (si lo mandas, dice algo)');
  // Sin desglose: la forma de siempre (PAGOS-PORTAL-2), intacta.
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VX, comprobante_base64: PNG_B64, monto: 500 }, 'jwt-karina'));
  af(r.statusCode === 404, '[D9] regresión: fila ajena sigue en 404');
  st.usuarios['jwt-otro'] = { id: 'u3', email: 'otro@x.mx', email_confirmed_at: '2026-10-13' };
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VX, comprobante_base64: PNG_B64, monto: 500 }, 'jwt-otro')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok && st.cambios[1].desglose == null && /declara \$500/.test(st.cambios[1].detalle), '[D10] regresión: sin desglose nace como siempre (desglose null, declara $500)');
  af(st.dinero.length === 0, '[D11] 🔒 y tras TODO el bloque: cero escrituras de dinero');

  console.log('\n[P] pago_link — el link de la cuota desde el Portal');
  st = red(); global.fetch = st.fetch; H = fresco();
  r = await H.pv(ev({ accion: 'pago_link', viajero_id: VK }, 'jwt-karina')); j = JSON.parse(r.body);
  c0 = st.cambios[0];
  af(r.statusCode === 200 && j.ok && j.url && j.neto > 0 && j.total > j.neto && st.cambios.length === 1, `[P1] sin monto → link por lo que le TOCA (neto ${j.neto}, cobra ${j.total}) y nace la fila`);
  af(c0 && c0.tipo === 'pago' && c0.estado === 'pendiente' && !c0.foto_path && c0.mp_preference_id && c0.mp_init_point === j.url && Number(c0.mp_neto) === j.neto && Number(c0.mp_monto_cobrar) === j.total, '[P2] la fila es tipo pago SIN foto y CON el link (el CHECK nuevo la admite)');
  af(c0 && c0.id === st.prefs[0].body.external_reference.slice(3), '[P3] 🔒 el external_reference es cv:<id de ESA fila> (el id nace ANTES de pedirle a MP)');
  af(j.neto === H.tarifas.calcularLink(j.neto).neto_pesos && j.total === H.tarifas.calcularLink(j.neto).total_pesos, '[P4] el total sale del dueño de tarifas (comisión al cliente)');
  const sugK = j.neto;
  r = await H.pv(ev({ accion: 'pago_link', viajero_id: VK }, 'jwt-karina')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.reusado === true && st.cambios.length === 1 && st.prefs.length === 1, '[P5] 🔒 el 2º clic por el MISMO monto REUSA el link vivo (ni fila ni preferencia nueva)');
  r = await H.pv(ev({ accion: 'pago_link', viajero_id: VK, monto: 1000 }, 'jwt-karina')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.neto === 1000 && st.cambios.length === 2, '[P6] otro monto (dentro de lo que debe) → link nuevo por $1,000');
  r = await H.pv(ev({ accion: 'pago_link', viajero_id: VK, monto: 99999 }, 'jwt-karina'));
  af(r.statusCode === 400 && st.cambios.length === 2, '[P7] 🔒 más de lo que debe (resta 5200) → 400 sin fila');
  r = await H.pv(ev({ accion: 'pago_link', viajero_id: VK, monto: 12.5 }, 'jwt-karina'));
  af(r.statusCode === 400, '[P8] monto con centavos → 400 (pesos enteros)');
  r = await H.pv(ev({ accion: 'pago_link', viajero_id: VX }, 'jwt-karina'));
  af(r.statusCode === 404 && st.cambios.length === 2, '[P9] 🔒 fila ajena → 404');
  af(st.dinero.length === 0, '[P10] 🔒 pedir links NO escribe dinero');
  // Los links SIN PAGAR no ocupan el tope del cliente ni cuentan para la bandeja.
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64, monto: 300 }, 'jwt-karina'));
  af(r.statusCode === 200 && st.cambios.length === 3, '[P11] con 2 links sin pagar, un comprobante entra (los links no cuentan para el tope)');
  // Y el plan los enseña como pendientes: 1 comprobante + 2 links (con url).
  r = await H.plan(evGet('jwt-karina')); j = JSON.parse(r.body); tk = j.tours.find((t) => t.viajero_id === VK);
  af(tk && tk.pagos_pendientes.length === 3 && tk.pagos_pendientes.filter((x) => x.tipo === 'mp_link' && x.url).length === 2 && tk.pagos_pendientes.filter((x) => x.tipo === 'comprobante').length === 1, '[P12] el plan dice lo que hay en camino: 1 comprobante + 2 links con su url');
  // MP apagado / MP rechaza → 409/502 sin fila.
  MP_OFF(); H = fresco();
  r = await H.pv(ev({ accion: 'pago_link', viajero_id: VK }, 'jwt-karina'));
  af(r.statusCode === 409 && st.cambios.length === 3, '[P13] control positivo: MP apagado → 409 sin fila (fail-soft a la transferencia)');
  MP_ON(); const stR = red({ mpRechaza: true }); global.fetch = stR.fetch; H = fresco();
  r = await H.pv(ev({ accion: 'pago_link', viajero_id: VK }, 'jwt-karina'));
  af(r.statusCode === 502 && stR.cambios.length === 0, '[P14] MP rechaza la preferencia → 502 y NO nace fila huérfana');

  console.log('\n[W] mp-webhook — la rama cv: anota y MARCA; la bandeja lo ve solo entonces');
  st = red(); global.fetch = st.fetch; H = fresco();
  r = await H.pv(ev({ accion: 'pago_link', viajero_id: VK, monto: 1300 }, 'jwt-karina')); j = JSON.parse(r.body);
  const cv = st.cambios[0]; const cobra = j.total;
  st.pagosMP[2001] = pagoMP(2001, 'cv:' + cv.id, cobra);
  st.pagosMP[2002] = pagoMP(2002, 'cv:' + cv.id, cobra, 'pending', { payment_type_id: 'ticket', payment_method_id: 'oxxo' });
  st.pagosMP[2003] = pagoMP(2003, 'cv:' + cv.id, cobra);
  st.pagosMP[2004] = pagoMP(2004, 'cv:dddddddd-0000-4000-8000-000000000009', 500);
  const tok = H.jwtSign({ id: 'u-bulma', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  // ANTES del pago: la bandeja NO lo ve y NO lo cuenta.
  r = await H.adm(ev({ accion: 'cambios_listar' }, tok)); j = JSON.parse(r.body);
  af(j.ok && j.cambios.length === 0 && j.pendientes === 0, '[W1] 🔒 un link SIN pagar no aparece en la bandeja ni se cuenta');
  // Pago PENDIENTE (OXXO): se anota, no se marca.
  r = await H.webhook(notif(H, '2002')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.anotado && st.mp_pagos.length === 1 && st.mp_pagos[0].cambio_id === cv.id && st.mp_pagos[0].viajero_id === VK && !st.cambios[0].mp_pago_id, '[W2] pending → se anota en mp_pagos (con cambio_id y viajero_id) y el cambio sigue SIN marca');
  r = await H.adm(ev({ accion: 'cambios_listar' }, tok)); j = JSON.parse(r.body);
  af(j.cambios.length === 0, '[W3] y la bandeja sigue sin verlo (OXXO pendiente no es dinero todavía)');
  // Pago APROBADO: marca con valor esperado.
  r = await H.webhook(notif(H, '2001')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.marcado === true && st.cambios[0].mp_pago_id === '2001' && Number(st.cambios[0].mp_monto) === cobra && st.cambios[0].mp_pagado_at, `[W4] approved → el cambio queda MARCADO (mp_pago_id 2001, monto ${cobra})`);
  af(st.cambios[0].estado === 'pendiente' && st.dinero.length === 0 && st.abonos.length === 0, '[W5] 🔒 sigue PENDIENTE y sin un abono: nada automático decide dinero');
  r = await H.webhook(notif(H, '2001')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ya_marcada === true && st.mp_pagos.length === 2, '[W6] el MISMO aviso otra vez → idempotente (ya_marcada, cero filas nuevas)');
  r = await H.webhook(notif(H, '2003')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ya_marcada === true && st.cambios[0].mp_pago_id === '2001' && st.mp_pagos.length === 3, '[W7] 🔒 un SEGUNDO pago aprobado NO pisa la marca (queda en mp_pagos a la vista)');
  r = await H.webhook(notif(H, '2004')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.sin_cambio === true && st.mp_pagos.length === 4 && st.mp_pagos[3].cambio_id == null, '[W8] pago de una cuota que no existe → se anota igual, con cambio_id null');
  // AHORA SÍ la bandeja lo ve, con el chip.
  r = await H.adm(ev({ accion: 'cambios_listar' }, tok)); j = JSON.parse(r.body);
  af(j.cambios.length === 1 && j.cambios[0].mp_pago_id === '2001' && j.pendientes === 1, '[W9] pagado → aparece en la bandeja y cuenta como pendiente');

  console.log('\n[C] cambio_pago_capturar — el reparto y el neto de MP');
  // Sobre el cambio pagado en MP (sin foto): capturar sin reparto → abono por el NETO.
  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cv.id, monto: 500 }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 400 && st.abonos.length === 0 && /1,300/.test(j.error), '[C1] 🔒 con MP el monto tecleado tiene que ser el NETO: $500 → 400 que dice $1,300');
  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cv.id, reparto: [{ viajero_id: VK, monto: 650 }, { viajero_id: VX, monto: 650 }] }, tok));
  af(r.statusCode === 400 && st.abonos.length === 0, '[C2] 🔒 reparto a alguien fuera del grupo → 400 sin escribir');
  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cv.id, reparto: [{ viajero_id: VK, monto: 650 }, { viajero_id: VJ, monto: 650 }] }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok && st.abonos.length === 2, `[C3] reparto válido que suma el neto → 200 y nacen DOS abonos (${r.statusCode} ${r.body.slice(0, 80)})`);
  const aK = st.abonos.find((a) => a.viajero_id === VK), aJ = st.abonos.find((a) => a.viajero_id === VJ);
  af(aK && aJ && aK.monto === 650 && aJ.monto === 650 && aK.mp_pago_id === '2001' && aJ.mp_pago_id === '2001' && aK.foto_path == null, '[C4] uno por persona, $650 c/u, los dos con el mp_pago_id y sin foto (el pago de MP ES el comprobante)');
  af(aK && /Mercado Pago #2001/.test(aK.nota) && /reparto de Karina T \(2 personas\)/.test(aK.nota) && aK.capturado_por === 'Bulma', '[C5] la nota dice MP, el reparto y quién capturó (del JWT)');
  af(st.cambios[0].estado === 'atendida' && /1,300 repartido entre 2/.test(st.cambios[0].respuesta), '[C6] la solicitud queda atendida con el reparto en la respuesta');
  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cv.id, reparto: [{ viajero_id: VK, monto: 1300 }] }, tok));
  af(r.statusCode === 409 && st.abonos.length === 2, '[C7] 🔒 2º clic → 409 y NO nacen más abonos');
  // El comprobante con desglose (sin MP): la bandeja captura lo que Bulma deje.
  st = red(); global.fetch = st.fetch; H = fresco();
  await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64, desglose: [{ viajero_id: VK, monto: 650 }, { viajero_id: VJ, monto: 650 }] }, 'jwt-karina'));
  const cd = st.cambios[0];
  r = await H.adm(ev({ accion: 'cambios_listar' }, tok)); j = JSON.parse(r.body);
  af(j.cambios.length === 1 && Array.isArray(j.cambios[0].desglose) && j.cambios[0].desglose.length === 2, '[C8] la bandeja recibe el desglose para PRELLENAR');
  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cd.id, reparto: [{ viajero_id: VK, monto: 700 }, { viajero_id: VJ, monto: 600 }] }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && st.abonos.length === 2 && st.abonos.every((a) => a.foto_path === cd.foto_path && a.mp_pago_id == null), '[C9] Bulma CORRIGE el reparto (700/600) y los dos abonos heredan el MISMO comprobante');
  af(st.abonos.find((a) => a.viajero_id === VK).monto === 700 && st.abonos.find((a) => a.viajero_id === VJ).monto === 600, '[C10] el monto que entra es el de Bulma, no el declarado');
  // Un link sin pagar NO se captura.
  MP_ON(); st = red(); global.fetch = st.fetch; H = fresco();
  await H.pv(ev({ accion: 'pago_link', viajero_id: VK, monto: 1300 }, 'jwt-karina'));
  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: st.cambios[0].id, monto: 1300 }, tok));
  af(r.statusCode === 409 && st.abonos.length === 0 && st.cambios[0].estado === 'pendiente', '[C11] 🔒 un link SIN pagar no se puede capturar (409, nada que capturar todavía)');
  // Regresión: la forma de siempre (sin reparto, con foto).
  await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64, monto: 1500 }, 'jwt-karina'));
  const cs = st.cambios[1];
  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cs.id, monto: 1450 }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && st.abonos.length === 1 && st.abonos[0].monto === 1450 && st.abonos[0].foto_path === cs.foto_path && /Pago subido desde el Portal/.test(st.abonos[0].nota), '[C12] regresión PAGOS-PORTAL-2: sin reparto nace UN abono con el monto tecleado y su foto');
  af(!st.log.some((l) => l.startsWith('DELETE')), '[C13] cero DELETEs en toda la corrida');

  console.log('\n[F] las fuentes: el filtro del pendiente vive en los TRES contadores');
  const admSrc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js'), 'utf8');
  const acaSrc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');
  const FILTRO = 'or=(tipo.neq.pago,foto_path.not.is.null,mp_pago_id.not.is.null)';
  af(admSrc.includes("const FILTRO_PAGO_VIVO = '&" + FILTRO + "'") && (admSrc.match(/\$\{FILTRO_PAGO_VIVO\}/g) || []).length === 2, '[F1] admin-requisiciones: UN dueño del filtro, usado en la lista Y en el conteo');
  af(acaSrc.includes('cambios_viajero?estado=eq.pendiente&' + FILTRO), '[F2] el inicio MB (admin-coordi-asignaciones) cuenta con el MISMO filtro, letra por letra');
  const pvSrc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/portal-viajero.js'), 'utf8');
  af(pvSrc.includes("tipo=eq.pago&estado=eq.pendiente&or=(foto_path.not.is.null,mp_pago_id.not.is.null)"), '[F3] el tope del cliente en subir_pago tampoco cuenta links sin pagar');

  console.log('\n[U] las pantallas');
  const P = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
  const K = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
  const recorta = (s, desde, hasta) => { const i = s.indexOf(desde); if (i < 0) return ''; const fin = s.indexOf(hasta, i); return fin < 0 ? s.slice(i) : s.slice(i, fin); };
  const fnPagar = recorta(P, 'function _migPagarHtml', '\n}');
  const fnSubir = recorta(P, 'async function _migPagoSubir', '\n}');
  const fnMp = recorta(P, 'async function _migPagoMp', '\n}');
  const dispatcher = recorta(P, "document.addEventListener('click', (ev) => {", '});');
  af(fnPagar.length > 500 && /data-cam="transfer"/.test(fnPagar) && /data-cam="mp"/.test(fnPagar) && /t\.mp_disponible/.test(fnPagar), '[U1] el Portal pinta los DOS caminos y el 💳 depende de mp_disponible');
  af(/t\.grupo/.test(fnPagar) && /mig-desg-on-/.test(fnPagar) && /pagos_pendientes/.test(fnPagar), '[U2] el desglose sale del grupo del servidor y los pendientes se DICEN');
  af(/accion: 'pago_link'/.test(fnMp) && /window\.location\.href = j\.url/.test(fnMp), '[U3] _migPagoMp pide pago_link y abre la url que el servidor da');
  af(/cuerpo\.desglose = desg/.test(fnSubir) && /accion: 'subir_pago'/.test(fnSubir), '[U4] _migPagoSubir manda el desglose junto al comprobante');
  af(/act === 'pago-cam'/.test(dispatcher) && /act === 'pago-mp'/.test(dispatcher) && /act === 'pago-desg'/.test(dispatcher), '[U5] el dispatcher despacha los tres (delegación, script módulo)');
  af(!/comoPago \+ mandaComp/.test(P), '[U6] el link de la cuenta ya no se pinta DOS veces (vive dentro del camino 🏦)');
  // `money` es LOCAL de _migPagosHtml: si _migPagarHtml la usara suelta, en el
  // navegador sería ReferenceError (lo cazó mide:plan-pagos-1). Se exige que
  // entre por parámetro y que la pantalla se la pase.
  af(/function _migPagarHtml\(t, p, vjId, comoPago, money\)/.test(P) && /_migPagarHtml\(t, p, vjId, comoPago, money\)/.test(recorta(P, 'function _migPagosHtml(t){', '\n}')), '[U6b] 🔒 `money` entra por parámetro (no hay global): la pantalla se la pasa');
  // Y la pantalla se EJECUTA: _migPagarHtml real con un tour de fixture.
  const vm = require('vm');
  const ctx = { escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), money: (n) => '$' + Number(n || 0).toLocaleString('es-MX') };
  vm.createContext(ctx); vm.runInContext(fnPagar + '\n}', ctx);
  const html1 = vm.runInContext(`_migPagarHtml(${JSON.stringify({ viajero_id: VK, nombre: 'Karina T', sugerido: 1300, mp_disponible: true, grupo: [{ viajero_id: VJ, nombre: 'Jose P', resta: 5200, proximo: 1300 }], pagos_pendientes: [] })}, { resta: 5200 }, '${VK}', '<a href="pagos.html#bbva" style="margin-top:12px">cuenta</a>', money)`, ctx);
  af(/¿Cómo quieres pagar tu pago de \$1,300\?/.test(html1) && /value="1300"/.test(html1) && /max="5200"/.test(html1), '[U7] EJECUTADA: pregunta por el sugerido y topa el monto a la resta');
  af(/Jose P/.test(html1) && html1.includes('data-vid="' + VJ + '"') && /Pagar en Mercado Pago/.test(html1) && /subir mi comprobante/.test(html1), '[U8] pinta a Jose en el desglose, el botón de MP y el de subir comprobante');
  const html2 = vm.runInContext(`_migPagarHtml(${JSON.stringify({ viajero_id: VK, nombre: 'Karina T', sugerido: null, mp_disponible: false, grupo: [], pagos_pendientes: [{ tipo: 'mp_pagado', monto: 1300 }] })}, { resta: 3900 }, '${VK}', '<a href="pagos.html">cuenta</a>', money)`, ctx);
  af(!/Pagar en Mercado Pago/.test(html2) && !/mig-desg-on-/.test(html2) && /Recibimos tu pago en Mercado Pago/.test(html2) && /value="3900"/.test(html2), '[U9] sin MP ni grupo: ni botón 💳 ni desglose; el pago acreditado se DICE; el monto nace en la resta');
  // La bandeja: chip MP + desglose + reparto.
  const fnAbrir = recorta(K, 'function _reqPagoAbrir', '\n}');
  const fnCapt = recorta(K, 'async function _reqPagoCapturar', '\n}');
  af(/Pagado en Mercado Pago/.test(K) && /c\.desglose/.test(K) && /El cliente reparte/.test(K), '[U10] la fila de pago pinta el chip de MP y el desglose declarado');
  af(/rq-pago-rep-/.test(fnAbrir) && /readonly/.test(fnAbrir) && /mpNeto/.test(fnAbrir), '[U11] el panel abre cajas por persona (prellenadas) y con MP el monto va fijo al neto');
  af(/reparto/.test(fnCapt) && /cambio_pago_capturar/.test(fnCapt), '[U12] capturar manda `reparto` cuando hay cajas por persona');

  console.log(`\n${R === 0 ? (V ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde') : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + e.stack); process.exit(1); });
