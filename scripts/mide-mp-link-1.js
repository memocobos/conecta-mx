#!/usr/bin/env node
/* =============================================================================
 * mide-mp-link-1 — LINKS DE PAGO DE MERCADO PAGO EN LA REQUISICIÓN
 * (MP-LINK-1, 8-nov-2026). Palabra de Memo: links al reservar · la comisión se
 * la cobra al cliente · al caer el pago se MARCA «pagado en MP» y Bulma aprueba.
 *
 * Entra por los TRES handlers REALES —requisicion-crear, mp-webhook y
 * admin-requisiciones— con una red falsa que modela Supabase (KH, con filtros
 * y estado), Mercado Pago (preferences + GET payments) y el index servido.
 * El dueño del precio es el REAL (resolverPrecioVenta sobre el index del
 * árbol); la firma del webhook se arma con el firmador del propio lib.
 *
 * ⚠️ SIN ANCLA (árbol de trabajo): controles positivos por CONSTRUCCIÓN
 *    (MP apagado · tarifa sin configurar · firma rota · segundo pago).
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}

process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
process.env.JWT_SECRET = 'secreto-del-arnes';
process.env.SITE_URL = 'https://conectareynosa.mx';
process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'pt-falsa';
const MP_ON = () => { process.env.PAGOS_MP_MODO = 'live'; process.env.MP_ACCESS_TOKEN = 'APP_USR-arnes'; process.env.MP_WEBHOOK_SECRET = 'sec-arnes'; process.env.MP_PCT_LINK = '0.0349'; delete process.env.MP_FIJA_LINK; delete process.env.MP_ABSORBE_CARGO; };
const MP_OFF = () => { delete process.env.PAGOS_MP_MODO; delete process.env.MP_ACCESS_TOKEN; delete process.env.MP_WEBHOOK_SECRET; delete process.env.MP_PCT_LINK; };

const INDEX_HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

// ── LA RED FALSA ────────────────────────────────────────────────────────────
function redNueva(opts) {
  opts = opts || {};
  const st = {
    requisiciones: (opts.requisiciones || []).map((r) => Object.assign({}, r)),
    mp_pagos: [], viajeros: [], abonos: [], prefs: [], pagosMP: opts.pagosMP || {},
    mpRechaza: !!opts.mpRechaza, log: [], uploads: [],
  };
  let seq = 1;
  const uuid = () => '00000000-0000-4000-8000-' + String(seq++).padStart(12, '0');
  const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  function filtros(url) {
    const u = new URL(url); const f = [];
    for (const [k, v] of u.searchParams) {
      if (['select', 'limit', 'order'].includes(k)) continue;
      f.push([k, decodeURIComponent(v)]);
    }
    return f;
  }
  const casa = (row, f) => f.every(([k, v]) => {
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('neq.')) return String(row[k]) !== v.slice(4);
    if (v === 'is.null') return row[k] == null;
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(row[k]));
    throw new Error('filtro no modelado ' + k + '=' + v);
  });
  st.fetch = async function (url, init) {
    init = init || {}; const met = (init.method || 'GET').toUpperCase(); url = String(url);
    st.log.push(met + ' ' + url);
    if (url.includes('/index.html') || /conectareynosa\.mx\/?$/.test(url)) return resp(200, INDEX_HTML);
    // Mercado Pago
    if (url.startsWith('https://api.mercadopago.com/checkout/preferences') && met === 'POST') {
      if (st.mpRechaza) return resp(400, { message: 'invalid access token' });
      const p = JSON.parse(init.body); const id = 'PREF-' + seq++;
      st.prefs.push({ id, body: p, idem: (init.headers || {})['X-Idempotency-Key'] });
      return resp(201, { id, init_point: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=' + id, sandbox_init_point: 'https://sandbox/' + id });
    }
    let m = url.match(/^https:\/\/api\.mercadopago\.com\/v1\/payments\/(\d+)$/);
    if (m) { const p = st.pagosMP[m[1]]; return p ? resp(200, p) : resp(404, { message: 'not found' }); }
    // storage
    m = url.match(/\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (m && met === 'POST') { st.uploads.push(m[2]); return resp(200, { Key: m[2] }); }
    // rest
    const tabla = url.includes('/rest/v1/requisiciones') ? 'requisiciones' : url.includes('/rest/v1/mp_pagos') ? 'mp_pagos'
      : url.includes('/rest/v1/viajeros_evento') ? 'viajeros' : url.includes('/rest/v1/abonos_viajero') ? 'abonos' : null;
    if (url.includes('/rest/v1/usuarios') || url.includes('sesion')) throw new Error('sesion-viva apagada en el arnés (fail-open)');
    if (!tabla) throw new Error('URL no contemplada: ' + met + ' ' + url);
    const T = st[tabla]; const f = filtros(url);
    if (met === 'GET') return resp(200, T.filter((r) => casa(r, f)).map((r) => Object.assign({}, r)));
    if (met === 'POST') {
      const cuerpo = JSON.parse(init.body);
      const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((x) => Object.assign({ id: x.id || uuid(), creado_en: new Date().toISOString() }, x));
      if (tabla === 'mp_pagos') {
        for (const x of filas) if (T.some((y) => y.mp_payment_id === x.mp_payment_id)) {
          return resp(409, { code: '23505', message: 'duplicate key value violates unique constraint "mp_pagos_mp_payment_id_key"' });
        }
      }
      filas.forEach((x) => T.push(x));
      return resp(201, filas);
    }
    if (met === 'PATCH') {
      const cambios = JSON.parse(init.body);
      const rows = T.filter((r) => casa(r, f));
      rows.forEach((r) => Object.assign(r, cambios));
      return resp(200, rows.map((r) => Object.assign({}, r)));
    }
    throw new Error('método ' + met);
  };
  return st;
}
function frescos() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return {
    crear: require(path.join(RAIZ, 'netlify/functions/requisicion-crear.js')).handler,
    webhook: require(path.join(RAIZ, 'netlify/functions/mp-webhook.js')).handler,
    admin: require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler,
    jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
    resolver: require(path.join(RAIZ, 'netlify/functions/_lib/precio-zona.js')).resolverPrecioVenta,
    mp: require(path.join(RAIZ, 'netlify/functions/_lib/mercadopago.js')),
    link: require(path.join(RAIZ, 'netlify/functions/_lib/mp-link.js')),
    tarifas: require(path.join(RAIZ, 'netlify/functions/_lib/mp-tarifas.js')),
  };
}
const evento = (body, token) => ({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://conectareynosa.mx' }, token ? { authorization: 'Bearer ' + token } : {}), body: JSON.stringify(body) });
// Notificación de MP tal como llega: data.id en el QUERYSTRING + firma sobre el manifest.
function notif(H, paymentId) {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = H.mp.firmarParaPruebas({ dataId: paymentId, xRequestId: 'rq-1', ts, secreto: process.env.MP_WEBHOOK_SECRET });
  return { httpMethod: 'POST', headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'rq-1' }, queryStringParameters: { 'data.id': paymentId, type: 'payment' }, body: JSON.stringify({ type: 'payment', action: 'payment.updated', id: 'n-1', data: { id: paymentId } }) };
}
const pagoMP = (id, ref, monto, estado, extra) => Object.assign({ id: Number(id), status: estado || 'approved', status_detail: 'accredited', transaction_amount: monto, currency_id: 'MXN', external_reference: ref, payment_method_id: 'visa', payment_type_id: 'credit_card', live_mode: true, transaction_details: { net_received_amount: Math.round(monto * 0.9595 * 100) / 100 } }, extra || {});

(async function main() {
  console.log('══ mide:mp-link-1 · links de pago de Mercado Pago en la requisición ══\n');
  MP_ON();
  let red = redNueva(); global.fetch = red.fetch; let H = frescos();

  // ── [T] la tarifa del link ────────────────────────────────────────────────
  console.log('[T] la comisión se la cobra al cliente — _lib/mp-tarifas.calcularLink');
  let t = H.tarifas.calcularLink(300);
  af(t.total_pesos === 313 && t.neto_pesos === 300 && t.comision_pesos === 13, `[T1] separo $300 al 3.49 % + IVA → total $313, comisión $13 (${JSON.stringify(t)})`);
  af(Number.isInteger(t.total_pesos), '[T2] el total va redondeado al PESO (hacia arriba)');
  // A la casa le queda al menos el neto una vez que MP descuenta su comisión + IVA.
  af(t.total_pesos - t.total_pesos * 0.0349 * 1.16 >= 300, '[T3] 🔒 total − comisión real de MP (3.49 % + IVA) ≥ el separo: nunca entra menos del neto');
  delete process.env.MP_PCT_LINK;
  af(!H.tarifas.linkConfigurado() && H.tarifas.calcularLink(300).error, '[T4] 🔒 sin MP_PCT_LINK NO hay tarifa de respaldo: el link no se ofrece');
  process.env.MP_PCT_LINK = '0.0349'; process.env.MP_ABSORBE_CARGO = '1';
  t = H.tarifas.calcularLink(300);
  af(t.total_pesos === 300 && t.comision_pesos === 0, '[T5] MP_ABSORBE_CARGO=1 → la casa absorbe: total = separo');
  delete process.env.MP_ABSORBE_CARGO;
  af(H.tarifas.calcularLink(0).error && H.tarifas.calcularLink(-5).error, '[T6] monto 0/negativo → error');

  // ── [L] _lib/mp-link ──────────────────────────────────────────────────────
  console.log('\n[L] _lib/mp-link — disponible · referencia · preferencia');
  af(H.link.disponible().ok, '[L1] con MP encendido, llave coherente y tarifa → disponible');
  af(H.link.referenciaDe('R-ABCDE') === 'req:R-ABCDE' && H.link.folioDeReferencia('req:R-ABCDE') === 'R-ABCDE', '[L2] referencia req:<folio> ida y vuelta');
  af(H.link.folioDeReferencia('11111111-2222-4333-8444-555555555555') === null && H.link.folioDeReferencia('') === null && H.link.folioDeReferencia('req:') === null, '[L3] un uuid pelado (flujo viejo del Portal) o basura NO es requisición');
  MP_OFF(); af(!H.link.disponible().ok && /PAGOS_MP_MODO/.test(H.link.disponible().motivo), '[L4] 🔒 MP apagado → no disponible, y dice por qué');
  MP_ON(); process.env.MP_ACCESS_TOKEN = 'TEST-x';
  af(!H.link.disponible().ok && /live con llave TEST/.test(H.link.disponible().motivo), '[L5] 🔒 modo live con llave TEST- → no disponible (llave incoherente)');
  MP_ON();
  const reqF = { id: 'rid-1', folio: 'R-ARNES', separo_sistema: 300, evento_nombre: 'Prueba', evento_id: 'prueba', paquete: 'plus', zona: 'Oro', num_personas: 1, nombre: 'Ana', correo: 'ana@x.mx' };
  let L = await H.link.crearLinkRequisicion({ req: reqF, SB_URL: process.env.SUPABASE_URL_KAMEHOUSE, sbH: { apikey: 'x', Authorization: 'Bearer x' } });
  af(L.ok && /pref_id=PREF-/.test(L.url) && L.total_pesos === 313 && L.comision_pesos === 13, `[L6] crea la preferencia y devuelve url/total/comisión (${L.total_pesos}/${L.comision_pesos})`);
  const pref = red.prefs[0] && red.prefs[0].body;
  af(pref && pref.external_reference === 'req:R-ARNES' && pref.items[0].unit_price === 313 && pref.items[0].currency_id === 'MXN', '[L7] 🔒 external_reference=req:<folio> · unit_price EN PESOS = total con comisión');
  af(pref && pref.binary_mode === false && !(pref.payment_methods && pref.payment_methods.excluded_payment_types), '[L8] binary_mode false y SIN métodos excluidos (OXXO/SPEI entran: el cliente eligió «link»)');
  af(pref && /\/\.netlify\/functions\/mp-webhook$/.test(pref.notification_url) && /folio=R-ARNES/.test(pref.back_urls.success), '[L9] notification_url al webhook · back_urls con el folio');
  af(red.prefs[0].idem === 'req_R-ARNES_313', '[L10] X-Idempotency-Key = folio+monto (un reintento no crea dos preferencias)');
  af(red.log.some((l) => /^PATCH .*requisiciones\?id=eq\.rid-1/.test(l)), '[L11] el link se GUARDA en la fila (PATCH por id)');
  red = redNueva({ mpRechaza: true }); global.fetch = red.fetch;
  L = await H.link.crearLinkRequisicion({ req: reqF, SB_URL: process.env.SUPABASE_URL_KAMEHOUSE, sbH: {} });
  af(!L.ok && /rechazó/.test(L.motivo) && !red.log.some((l) => l.startsWith('PATCH')), '[L12] 🔒 MP rechaza → ok:false con motivo, CERO escrituras, y no lanza');

  // ── [R] requisicion-crear REAL ────────────────────────────────────────────
  console.log('\n[R] requisicion-crear — el link nace con la requisición (y sin MP, nace igual)');
  red = redNueva(); global.fetch = red.fetch; H = frescos();
  const { fetchEventosRaw } = require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
  const EV = await fetchEventosRaw();
  let vendible = null;
  for (const e of EV || []) {
    if (!e || !Array.isArray(e.zonas)) continue;
    for (const z of e.zonas) {
      if (!z || !z.n || vendible) continue;
      const r = await H.resolver({ evento_id: e.id, paquete: 'plus', zona: z.n, num_personas: 1, transporte_cost: 0 }).catch(() => null);
      if (r && r.ok && Number(r.separo) > 0) vendible = { ev: e.id, zona: z.n, r };
    }
    if (vendible) break;
  }
  if (!vendible) { console.log('✗ sin caso vendible en el catálogo de hoy — NADA MEDIDO'); process.exit(1); }
  console.log(`  premisa: ${vendible.ev}/«${vendible.zona}» separo $${vendible.r.separo}`);
  const body = () => ({ web: '', evento_id: vendible.ev, paquete: 'plus', zona: vendible.zona, num_personas: 1, hotel: 'Compartida', transporte: null, cotizacion_texto: 'x', nombre: 'Cliente Link', celular: '8991112233', correo: 'link@prueba.mx', forma_pago: 'link_pago', comprobante_base64: '' });
  let r = await H.crear(evento(body())); let j = JSON.parse(r.body);
  const esperadoTotal = H.tarifas.calcularLink(vendible.r.separo).total_pesos;
  af(r.statusCode === 200 && j.ok && j.pago && /pref_id=/.test(j.pago.url), `[R1] link_pago con MP encendido → 200 con pago.url (${j.folio})`);
  af(j.pago && j.pago.total === esperadoTotal && j.pago.neto === vendible.r.separo && j.pago.comision === esperadoTotal - vendible.r.separo, `[R2] pago.total = separo del DUEÑO + comisión ($${j.pago && j.pago.total}); el cliente no mandó un peso`);
  let fila = red.requisiciones[0];
  af(fila && fila.mp_init_point === j.pago.url && fila.mp_monto_cobrar === esperadoTotal && fila.mp_preference_id, '[R3] la fila guarda mp_init_point / mp_monto_cobrar / mp_preference_id');
  af(fila && fila.mp_pago_id == null && red.abonos.length === 0 && red.viajeros.length === 0, '[R4] 🔒 el link NO es un pago: mp_pago_id null, cero abonos, cero viajeros');
  af(red.prefs[0].body.external_reference === 'req:' + fila.folio, '[R5] la preferencia apunta al folio REAL de la fila');
  // control: transferencia no genera link
  red = redNueva(); global.fetch = red.fetch; H = frescos();
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]).toString('base64');
  r = await H.crear(evento(Object.assign(body(), { forma_pago: 'transferencia', comprobante_base64: JPEG }))); j = JSON.parse(r.body);
  af(j.ok && !j.pago && red.prefs.length === 0, '[R6] transferencia con comprobante → sin link (MP no se toca)');
  // control positivo: MP apagado → la requisición nace IGUAL, sin pago
  MP_OFF(); red = redNueva(); global.fetch = red.fetch; H = frescos();
  r = await H.crear(evento(body())); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok && !j.pago && red.requisiciones.length === 1 && red.prefs.length === 0, '[R7] 🔒 MP APAGADO → la requisición nace igual (fail-soft), sin pago y sin pegarle a MP');
  MP_ON(); red = redNueva({ mpRechaza: true }); global.fetch = red.fetch; H = frescos();
  r = await H.crear(evento(body())); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok && !j.pago && red.requisiciones.length === 1, '[R8] 🔒 MP rechaza la preferencia → la requisición nace igual, sin pago');

  // ── [W] mp-webhook REAL · la rama req: ────────────────────────────────────
  console.log('\n[W] mp-webhook — anota en mp_pagos y MARCA la requisición; nada automático decide dinero');
  MP_ON();
  const REQ = { id: 'r-1', folio: 'R-WEBHK', estado: 'pendiente', separo_sistema: 300, mp_monto_cobrar: 313, mp_pago_id: null, mp_init_point: 'https://x/pref' };
  red = redNueva({ requisiciones: [REQ], pagosMP: { 1001: pagoMP(1001, 'req:R-WEBHK', 313), 1002: pagoMP(1002, 'req:R-WEBHK', 313, 'pending', { payment_type_id: 'ticket', payment_method_id: 'oxxo' }), 1003: pagoMP(1003, 'req:R-WEBHK', 313), 1004: pagoMP(1004, 'req:R-NADIE', 500) } });
  global.fetch = red.fetch; H = frescos();
  r = await H.webhook(notif(H, '1001')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok && j.req === 'R-WEBHK' && j.marcado === true, `[W1] pago aprobado → 200 marcado (${r.body.slice(0, 90)})`);
  af(red.mp_pagos.length === 1 && red.mp_pagos[0].mp_payment_id === '1001' && red.mp_pagos[0].estado === 'approved' && red.mp_pagos[0].external_reference === 'req:R-WEBHK' && red.mp_pagos[0].requisicion_id === 'r-1', '[W2] UNA fila en mp_pagos con el id de MP, la referencia y la requisición');
  af(red.mp_pagos[0].monto_cobrado === 313 && red.mp_pagos[0].monto_esperado === 313 && red.mp_pagos[0].metodo === 'credit_card' && red.mp_pagos[0].neto != null, '[W3] monto cobrado/esperado/método/neto del GET autenticado (jamás del cuerpo)');
  let rq = red.requisiciones[0];
  af(rq.mp_pago_id === '1001' && rq.mp_monto === 313 && rq.mp_pagado_at, '[W4] la requisición queda MARCADA: mp_pago_id · mp_monto · mp_pagado_at');
  af(rq.estado === 'pendiente' && red.viajeros.length === 0 && red.abonos.length === 0, '[W5] 🔒 sigue PENDIENTE: cero viajeros, cero abonos — el dinero lo escribe Bulma al aprobar');
  // idempotencia
  r = await H.webhook(notif(H, '1001')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && red.mp_pagos.length === 1 && j.ya_marcada === true, '[W6] 🔒 la MISMA notificación otra vez → 200, sigue UNA fila (23505 del índice confirmado por nombre), ya_marcada');
  // segundo pago aprobado de la misma requisición: NO pisa
  r = await H.webhook(notif(H, '1003')); j = JSON.parse(r.body);
  af(red.mp_pagos.length === 2 && red.requisiciones[0].mp_pago_id === '1001' && j.ya_marcada === true, '[W7] 🔒 un SEGUNDO pago aprobado se anota pero NO pisa la marca (valor esperado mp_pago_id=is.null): queda a la vista el duplicado');
  // OXXO pending → se anota, no marca; luego approved → actualiza y marca
  red = redNueva({ requisiciones: [Object.assign({}, REQ)], pagosMP: { 1002: pagoMP(1002, 'req:R-WEBHK', 313, 'pending', { payment_type_id: 'ticket', payment_method_id: 'oxxo' }) } });
  global.fetch = red.fetch; H = frescos();
  r = await H.webhook(notif(H, '1002')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.anotado && j.estado === 'pending' && red.mp_pagos.length === 1 && red.mp_pagos[0].estado === 'pending' && red.requisiciones[0].mp_pago_id == null, '[W8] OXXO pending → se ANOTA (metodo ticket) y la requisición NO se marca');
  red.pagosMP[1002] = pagoMP(1002, 'req:R-WEBHK', 313, 'approved', { payment_type_id: 'ticket', payment_method_id: 'oxxo' });
  r = await H.webhook(notif(H, '1002')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.marcado === true && red.mp_pagos.length === 1 && red.mp_pagos[0].estado === 'approved' && red.requisiciones[0].mp_pago_id === '1002', '[W9] el MISMO pago llega approved días después → la fila se ACTUALIZA (no nace otra) y la requisición se marca');
  // pago de una requisición que no existe
  red = redNueva({ requisiciones: [], pagosMP: { 1004: pagoMP(1004, 'req:R-NADIE', 500) } }); global.fetch = red.fetch; H = frescos();
  r = await H.webhook(notif(H, '1004')); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.sin_requisicion === true && red.mp_pagos.length === 1 && red.mp_pagos[0].requisicion_id == null, '[W10] pago aprobado sin requisición → se ANOTA igual (dinero que llegó) y se dice sin_requisicion');
  // firma rota → 400 y cero efectos
  red = redNueva({ requisiciones: [Object.assign({}, REQ)], pagosMP: { 1001: pagoMP(1001, 'req:R-WEBHK', 313) } }); global.fetch = red.fetch; H = frescos();
  const mala = notif(H, '1001'); mala.headers['x-signature'] = mala.headers['x-signature'].replace(/v1=.*/, 'v1=deadbeef');
  r = await H.webhook(mala);
  af(r.statusCode === 400 && red.mp_pagos.length === 0 && red.log.every((l) => !/mercadopago/.test(l)), '[W11] 🔒 firma inválida → 400, ni se consulta MP ni se escribe nada');
  // [MP-IPN-1] el IPN heredado (topic= en el querystring, SIN firma) — medido
  // en el primer pago real (9-nov): MP lo manda además del webhook firmado y
  // lo reintentaba porque aquí era 400. Hoy: 200 ignorado, cero escrituras,
  // cero lecturas a MP. Y la forma MODERNA sin firma SIGUE siendo 400.
  red = redNueva({ requisiciones: [Object.assign({}, REQ)], pagosMP: { 1001: pagoMP(1001, 'req:R-WEBHK', 313) } }); global.fetch = red.fetch; H = frescos();
  for (const topic of ['payment', 'merchant_order']) {
    r = await H.webhook({ httpMethod: 'POST', headers: {}, queryStringParameters: { id: topic === 'payment' ? '1001' : '45986443962', topic }, body: JSON.stringify({ resource: '/x', topic }) });
    j = JSON.parse(r.body);
    af(r.statusCode === 200 && j.ignorado === true && red.mp_pagos.length === 0 && red.log.every((l) => !/mercadopago/.test(l)), `[W11b] 🔒 IPN heredado topic=${topic} SIN firma → 200 ignorado, cero escrituras y cero lecturas a MP`);
  }
  r = await H.webhook({ httpMethod: 'POST', headers: {}, queryStringParameters: { 'data.id': '1001', type: 'payment' }, body: JSON.stringify({ type: 'payment', data: { id: '1001' } }) });
  af(r.statusCode === 400 && red.mp_pagos.length === 0, '[W11c] 🔒 la forma MODERNA (data.id+type) SIN firma sigue siendo 400: ésa sí debe traerla');
  MP_OFF(); H = frescos();
  r = await H.webhook(notif(Object.assign({}, H, { mp: require(path.join(RAIZ, 'netlify/functions/_lib/mercadopago.js')) }), '1001'));
  af(r.statusCode === 404, '[W12] 🔒 MP apagado → el webhook contesta 404 (no existe para nadie)');
  MP_ON();
  // el flujo viejo del Portal (uuid) sigue por su camino: no toca KH
  red = redNueva({ pagosMP: { 1005: pagoMP(1005, '11111111-2222-4333-8444-555555555555', 300) } }); global.fetch = red.fetch; H = frescos();
  r = await H.webhook(notif(H, '1005')).catch((e) => ({ statusCode: 'EXC', body: e.message }));
  af(red.mp_pagos.length === 0 && !red.log.some((l) => /kh\.falso\.test\/rest\/v1\/requisiciones/.test(l)), '[W13] un uuid pelado (Portal viejo) NO entra a la rama de KameHouse (cero lecturas a requisiciones de KH)');

  // ── [A] admin-requisiciones REAL · aprobar con pago en MP + mp_link ───────
  console.log('\n[A] admin-requisiciones — aprobar con «pagado en MP» y la acción mp_link');
  red = redNueva(); global.fetch = red.fetch; H = frescos();
  // Una requisición REAL por el handler (para tener zona canónica y todo), sin MP para que nazca sin link.
  MP_OFF(); H = frescos();
  r = await H.crear(evento(body())); j = JSON.parse(r.body);
  MP_ON(); H = frescos();
  const tok = H.jwtSign({ id: 'u-bulma', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  fila = red.requisiciones[0];
  af(fila && !fila.mp_init_point, `[A0] premisa: la requisición ${fila && fila.folio} nació SIN link (MP estaba apagado)`);
  // mp_link genera
  r = await H.admin(evento({ accion: 'mp_link', id: fila.id }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok && /pref_id=/.test(j.url) && j.guardado === false && j.monto === esperadoTotal, `[A1] mp_link genera el link cuando no hay (${j.monto})`);
  af(red.requisiciones[0].mp_init_point === j.url, '[A2] y lo guarda en la fila');
  r = await H.admin(evento({ accion: 'mp_link', id: fila.id }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.guardado === true && red.prefs.length === 1, '[A3] mp_link otra vez → devuelve el GUARDADO sin pegarle a MP (1 preferencia)');
  r = await H.admin(evento({ accion: 'mp_link', id: fila.id, regenerar: true }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.guardado === false && red.prefs.length === 2, '[A4] regenerar:true → preferencia nueva');
  // el webhook marca el pago del link
  const pid = '2001';
  red.pagosMP[pid] = pagoMP(pid, 'req:' + fila.folio, esperadoTotal);
  r = await H.webhook(notif(H, pid)); j = JSON.parse(r.body);
  af(j.marcado === true && red.requisiciones[0].mp_pago_id === pid, '[A5] el pago del link cae por el webhook y marca la requisición');
  r = await H.admin(evento({ accion: 'mp_link', id: fila.id }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 409 && j.mp_pago_id === pid, '[A6] con pago aprobado, mp_link → 409 (no se genera link de algo ya pagado)');
  // aprobar SIN teclear monto: el abono es el NETO
  r = await H.admin(evento({ accion: 'aprobar', id: fila.id, total_contrato: vendible.r.total }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok && red.viajeros.length === 1, `[A7] aprobar sin monto tecleado → 200, nace el viajero (${r.statusCode} ${String(r.body).slice(0, 80)})`);
  af(red.abonos.length === 1 && red.abonos[0].monto === vendible.r.separo, `[A8] 🔒 nace UN abono por el NETO = separo $${vendible.r.separo} (cobrado $${esperadoTotal} − comisión al cliente), no por el bruto`);
  af(red.abonos[0].mp_pago_id === pid && /pagado en Mercado Pago #2001/.test(red.abonos[0].nota) && red.abonos[0].foto_path == null, '[A9] el abono lleva mp_pago_id y la nota dice «pagado en Mercado Pago #id» — sin foto, su comprobante es el id');
  af(!/comprobante verificado/.test(red.abonos[0].nota), '[A10] 🔒 la nota NO afirma «comprobante verificado» (no hubo foto)');
  // control: sin pago MP y sin comprobante, aprobar sin monto → SIN abono (REQ-LINK-1 sigue)
  MP_OFF(); red = redNueva(); global.fetch = red.fetch; H = frescos();
  r = await H.crear(evento(body())); const f2 = red.requisiciones[0];
  r = await H.admin(evento({ accion: 'aprobar', id: f2.id, total_contrato: vendible.r.total }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && red.viajeros.length === 1 && red.abonos.length === 0 && j.sin_abono, '[A11] 🔒 control REQ-LINK-1: link_pago SIN pago en MP y sin monto → viajero SIN abono (nada se inventa)');
  MP_ON();

  // ── [P] la pantalla (bandeja) y el index — cableado ───────────────────────
  console.log('\n[P] cableado de pantallas');
  const kr = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
  const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  af(/function _reqTieneComprobante\(r\)[^}]*comprobante_path \|\| r\.mp_pago_id/.test(kr), '[P1] la bandeja trata el pago en MP como comprobante (_reqTieneComprobante)');
  af(/accion: 'mp_link'/.test(kr) && /_reqBdjMpLink/.test(kr) && /Pagado en Mercado Pago/.test(kr), '[P2] la bandeja tiene el botón del link y el chip «Pagado en Mercado Pago»');
  // el neto de la pantalla es el espejo del servidor
  const srv = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js'), 'utf8');
  af(/Math\.max\(0, Math\.round\(Number\(req\.mp_monto_cobrar\) - Number\(req\.separo_sistema\)\)\)/.test(srv) && /Math\.max\(0, Math\.round\(Number\(r\.mp_monto_cobrar\) - Number\(r\.separo_sistema\)\)\)/.test(kr), '[P3] la fórmula del NETO es la MISMA en servidor y pantalla (espejo careado)');
  af(/r\.j\.pago&&r\.j\.pago\.url/.test(idx) && /Pagar \$/.test(idx) && /comisión de Mercado Pago/.test(idx), '[P4] el index pinta el botón «Pagar $X en Mercado Pago» con la comisión DICHA');
  af(/qs\.get\('pago'\)/.test(idx) && /history\.replaceState/.test(idx), '[P5] el regreso ?pago= pinta un letrero y NO afirma nada sobre el dinero');
  af(/add column if not exists mp_pago_id text/.test(fs.readFileSync(path.join(RAIZ, 'migraciones/MP-1.sql'), 'utf8')), '[P6] el acta MP-1.sql trae abonos_viajero.mp_pago_id');

  console.log(`\n══ RESULTADO: ${V} en verde · ${R} en rojo ══`);
  if (V === 0) { console.log('NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(1); });
