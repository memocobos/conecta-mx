#!/usr/bin/env node
/* =============================================================================
 * mide-pagos-portal-2 — el cliente sube su COMPROBANTE desde el Portal y
 * Bulma/Milk capturan el abono desde la bandeja (PAGOS-PORTAL-2, 29-oct-2026).
 * Entra por los handlers REALES (portal-viajero · admin-requisiciones) con una
 * red falsa que respeta filtros, guarda estado y modela el STORAGE.
 * ⚠️ SIN ANCLA (árbol de trabajo), como mide:portal-edit-1 / mide:req-b1: no
 * sufre la trampa del commit y no puede traer control positivo por commit —
 * sus controles son positivos por construcción.
 * 🔒 LA LEY QUE ESTE CAREO GUARDA: subir un comprobante NO ESCRIBE DINERO
 * (cero POST/PATCH a abonos_viajero y viajeros_evento desde el Portal), y el
 * abono nace SOLO del clic de la bandeja, con el monto TECLEADO, UNA vez.
 * ========================================================================== */
'use strict';
const path = require('path');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
function af(ok, msg) { try { ok = typeof ok === 'function' ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } }

process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.JWT_SECRET = 'secreto';

const VK = 'aaaaaaaa-0000-4000-8000-000000000001';   // de Karina (sellada)
const VX = 'aaaaaaaa-0000-4000-8000-000000000003';   // de OTRA persona
const VS = 'aaaaaaaa-0000-4000-8000-000000000004';   // de Karina, SIN sellar

// Un PNG de verdad por sus BYTES (tipoImagen mira la firma, no la extensión).
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1]).toString('base64');
const TXT_B64 = Buffer.from('esto es texto plano, no una imagen').toString('base64');

function red() {
  const st = {
    viajeros: [
      { id: VK, portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'fuerzaregida#0', nombre: 'Karina T', correo: 'karina@prueba.mx', celular: '8991112233', tipo_paquete: 'plus', zona_boleto: 'Barrera', total_contrato: 5500, abonado_previo: 300 },
      { id: VX, portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'fuerzaregida#0', nombre: 'Otro', correo: 'otro@x.mx', celular: null, tipo_paquete: 'cheap', zona_boleto: 'Oro', total_contrato: 3000, abonado_previo: 0 },
      { id: VS, portal_revisado_at: null, evento_id: 'fuerzaregida#0', nombre: 'Karina sin sello', correo: 'karina@prueba.mx', celular: null, tipo_paquete: 'cheap', zona_boleto: 'Oro', total_contrato: 3000, abonado_previo: 0 },
    ],
    cambios: [], abonos: [], storage: {}, log: [],
    // escrituras de DINERO, contadas POR EL HECHO (el candado central).
    dinero: [],
    usuarios: { 'jwt-karina': { id: 'u1', email: 'karina@prueba.mx', email_confirmed_at: '2026-10-13' } },
  };
  let seq = 1;
  const resp = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const f = (url) => { const o = {}; for (const [k, v] of new URL(url).searchParams) o[k] = decodeURIComponent(v); return o; };
  const casa = (row, fl) => Object.entries(fl).every(([k, v]) => {
    if (['select', 'limit', 'order'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('ilike.')) return String(row[k] || '').toLowerCase() === v.slice(6).toLowerCase();
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(row[k]));
    return true; });
  st.fetch = async (url, init) => {
    init = init || {}; const m = (init.method || 'GET').toUpperCase(); url = String(url); st.log.push(m + ' ' + url);
    if (url.startsWith('https://pt.falso.test/auth/v1/user')) {
      const t = ((init.headers || {}).Authorization || '').slice(7); return st.usuarios[t] ? resp(200, st.usuarios[t]) : resp(401, {}); }
    if (m === 'DELETE') throw new Error('DELETE prohibido');
    // La sesión viva de verify-admin (SES-1): el usuario existe y está activo —
    // modelada para que el careo no dependa del fail-open de red del lib.
    if (url.includes('/rest/v1/usuarios')) return resp(200, [{ activo: true, rol: url.includes('u-cc') ? 'cc' : 'bulma', sesiones_invalidas_antes: null }]);
    // ── STORAGE: subir y firmar, como el real ──
    if (url.includes('/storage/v1/object/sign/')) {
      const p = decodeURI(url.split('/storage/v1/object/sign/')[1]);
      // Firmar un objeto que NO existe es el defecto que este modelo caza.
      if (!st.storage[p]) return resp(404, { error: 'Object not found' });
      return resp(200, { signedURL: '/object/sign/' + p + '?token=FIRMA' });
    }
    if (url.includes('/storage/v1/object/')) {
      if (m !== 'POST') throw new Error('storage: método no modelado ' + m);
      const p = decodeURI(url.split('/storage/v1/object/')[1]);
      st.storage[p] = { bytes: init.body, mime: (init.headers || {})['Content-Type'] };
      return resp(200, { Key: p });
    }
    const tabla = url.includes('/viajeros_evento') ? 'viajeros' : url.includes('/cambios_viajero') ? 'cambios' : url.includes('/abonos_viajero') ? 'abonos' : null;
    if (!tabla) throw new Error('URL no contemplada ' + m + ' ' + url);
    if ((m === 'POST' || m === 'PATCH') && (tabla === 'abonos' || tabla === 'viajeros')) st.dinero.push(m + ' ' + tabla);
    const fl = f(url); const T = st[tabla];
    if (m === 'GET') return resp(200, T.filter((r) => casa(r, fl)).map((r) => Object.assign({}, r)));
    if (m === 'PATCH') { const c = JSON.parse(init.body); const rows = T.filter((r) => casa(r, fl)); rows.forEach((r) => Object.assign(r, c)); return resp(200, rows.map((r) => Object.assign({}, r))); }
    if (m === 'POST') {
      const row = Object.assign({ id: 'cccccccc-0000-4000-8000-' + String(seq++).padStart(12, '0') }, tabla === 'cambios' ? { estado: 'pendiente' } : {}, JSON.parse(init.body));
      // La base de verdad muerde: un 'pago' sin foto_path rebota (CHECK
      // cambios_viajero_pago_foto del acta) — el fake lo modela o pasa en vacío.
      if (tabla === 'cambios' && row.tipo === 'pago' && !row.foto_path) return resp(400, { code: '23514', message: 'violates check constraint "cambios_viajero_pago_foto"' });
      T.push(row); return resp(201, [row]);
    }
    throw new Error('método ' + m);
  };
  return st;
}
function fresco() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions')) delete require.cache[k]; });
  return {
    pv: require(path.join(RAIZ, 'netlify/functions/portal-viajero.js')).handler,
    adm: require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler,
    jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
  };
}
const ev = (body, jwt) => ({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://conectareynosa.mx' }, jwt ? { authorization: 'Bearer ' + jwt } : {}), body: JSON.stringify(body) });

(async () => {
  console.log('══ mide:pagos-portal-2 ══\n[A] subir_pago — el Portal AVISA, jamás escribe dinero');
  let st = red(); global.fetch = st.fetch; let H = fresco();

  let r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64, monto: 1500, nota: 'pago de la quincena' }, 'jwt-karina'));
  let j = JSON.parse(r.body);
  const c0 = st.cambios[0];
  af(r.statusCode === 200 && j.ok && st.cambios.length === 1, `[A1] feliz → 200 y nace UNA solicitud (${r.statusCode} ${r.body.slice(0, 90)})`);
  af(c0 && c0.tipo === 'pago' && c0.estado === 'pendiente' && c0.correo === 'karina@prueba.mx' && c0.evento_id === 'fuerzaregida#0', '[A2] la fila es tipo pago, pendiente, con su correo y su evento');
  af(c0 && /^portal\/aaaaaaaa-0000-4000-8000-000000000001\/[0-9a-f-]{36}\.png$/.test(c0.foto_path || ''), `[A3] el path es portal/<viajero>/<uuid>.png — la extensión la dicen los BYTES (${c0 && c0.foto_path})`);
  // ⚠️ La clave del storage lleva el BUCKET adelante (abonos-viajeros/portal/…);
  // la fila guarda el path SIN bucket — primer rojo de la corrida 1, era mi aserción.
  af(c0 && st.storage['abonos-viajeros/' + c0.foto_path] && st.storage['abonos-viajeros/' + c0.foto_path].mime === 'image/png', '[A4] el objeto EXISTE en el bucket con su mime (la foto sube ANTES de la fila)');
  af(c0 && /declara \$1,500/.test(c0.detalle) && /quincena/.test(c0.detalle), '[A5] el monto declarado y la nota viajan como TEXTO en el detalle');

  // El candado central, POR EL HECHO: cero escrituras de dinero desde el Portal.
  af(st.dinero.length === 0, `[A6] 🔒 CERO escrituras a abonos_viajero/viajeros_evento (dinero: ${st.dinero.join(',') || 'ninguna'})`);
  // Control positivo del contador: una escritura inyectada SÍ se ve, o el cero
  // de arriba no probaría nada.
  await st.fetch('https://kh.falso.test/rest/v1/abonos_viajero', { method: 'POST', body: JSON.stringify({ viajero_id: VK, monto: 1 }) });
  af(st.dinero.length === 1, '[A7] control positivo: el contador SÍ ve una escritura de dinero');
  st.dinero.length = 0; st.abonos.length = 0;

  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: TXT_B64 }, 'jwt-karina'));
  af(r.statusCode === 400 && st.cambios.length === 1 && Object.keys(st.storage).length === 1, '[A8] bytes de TEXTO → 400, ni fila ni objeto (la extensión es una opinión; los bytes mandan)');
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK }, 'jwt-karina'));
  af(r.statusCode === 400, '[A9] sin comprobante → 400 (la foto es el punto entero)');
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VX, comprobante_base64: PNG_B64 }, 'jwt-karina'));
  af(r.statusCode === 404 && st.cambios.length === 1, '[A10] 🔒 fila AJENA → 404 sin escribir');
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VS, comprobante_base64: PNG_B64 }, 'jwt-karina'));
  af(r.statusCode === 404, '[A11] 🔒 fila SIN sellar → 404 (PORTAL-SOLO-1: sin revisión no se toca)');
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64 }));
  af(r.statusCode === 401, '[A12] sin sesión → 401');

  // El tope: 3 pendientes tipo pago. Ya hay 1; subo 2 más y el 4º rebota.
  for (let i = 0; i < 2; i++) await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64 }, 'jwt-karina'));
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64 }, 'jwt-karina'));
  af(r.statusCode === 429 && st.cambios.filter((c) => c.tipo === 'pago').length === 3, '[A13] el 4º pendiente → 429 (un buzón, no un chat)');
  // El PDF también entra (los bancos dan PDF) — el comprobante de requisición
  // ya tomó esa decisión y aquí se hereda.
  st.cambios.length = 0; // limpiar tope para el caso PDF
  const PDF_B64 = Buffer.from('%PDF-1.4 contenido').toString('base64');
  r = await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PDF_B64 }, 'jwt-karina'));
  af(r.statusCode === 200 && /\.pdf$/.test(st.cambios[0].foto_path), '[A14] un PDF entra con su extensión por bytes');
  af(st.dinero.length === 0, '[A15] 🔒 y tras TODO el bloque del Portal: cero escrituras de dinero');

  console.log('\n[B] la bandeja — ver el comprobante y capturar el abono');
  // Fixture fresco: una solicitud de pago viva con su objeto subido.
  st = red(); global.fetch = st.fetch; H = fresco();
  await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64, monto: 1500 }, 'jwt-karina'));
  const cid = st.cambios[0].id;
  st.dinero.length = 0;
  const tok = H.jwtSign({ id: 'u-bulma', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const tokCC = H.jwtSign({ id: 'u-cc', rol: 'cc', nombre: 'Coordi' }, process.env.JWT_SECRET, 3600);

  r = await H.adm(ev({ accion: 'cambios_listar' }, tok)); j = JSON.parse(r.body);
  af(j.ok && j.cambios.length === 1 && j.cambios[0].tipo === 'pago' && j.cambios[0].foto_path, '[B1] la bandeja lista la solicitud de pago CON su foto_path');

  r = await H.adm(ev({ accion: 'cambio_foto', id: cid }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.signed_url && j.signed_url.includes(st.cambios[0].foto_path), '[B2] cambio_foto firma el path DE LA FILA (no uno tecleado)');
  r = await H.adm(ev({ accion: 'cambio_foto', id: cid }, tokCC));
  af(r.statusCode === 403, '[B3] rol cc → 403');

  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cid, monto: 0 }, tok));
  af(r.statusCode === 400 && st.abonos.length === 0, '[B4] monto 0 → 400 sin escribir (la validación de abono_crear)');
  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cid, monto: 2000000 }, tok));
  af(r.statusCode === 400 && st.abonos.length === 0, '[B5] monto fuera de rango → 400');

  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cid, monto: 1450 }, tok)); j = JSON.parse(r.body);
  const ab = st.abonos[0];
  af(r.statusCode === 200 && j.ok && st.abonos.length === 1, `[B6] capturar → 200 y nace UN abono (${r.statusCode} ${String(r.body).slice(0, 90)})`);
  af(ab && ab.monto === 1450 && ab.viajero_id === VK, '[B7] el monto es el TECLEADO por Bulma (1450), no el declarado del cliente (1500)');
  af(ab && ab.foto_path === st.cambios[0].foto_path, '[B8] 🔒 el abono HEREDA el comprobante (mismo path, cero copias — la forma de REQ-B1)');
  af(ab && ab.capturado_por === 'Bulma', '[B9] capturado_por sale del JWT, no del cuerpo');
  af(st.cambios[0].estado === 'atendida' && /1,450/.test(st.cambios[0].respuesta || ''), '[B10] la solicitud queda atendida con el monto en la respuesta');

  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cid, monto: 1450 }, tok));
  af(r.statusCode === 409 && st.abonos.length === 1, '[B11] 🔒 el 2º clic → 409 y NO nace un segundo abono (valor esperado en el reclamo)');

  // Una solicitud que NO es pago no se captura por aquí.
  await H.pv(ev({ accion: 'solicitar_cambio', viajero_id: VK, tipo: 'hotel', detalle: 'quiero doble' }, 'jwt-karina'));
  const cHotel = st.cambios.find((c) => c.tipo === 'hotel');
  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cHotel.id, monto: 100 }, tok));
  af(r.statusCode === 409 && st.abonos.length === 1, '[B12] tipo hotel → 409 (se atiende con los botones de siempre)');

  // El ORDEN deliberado: si el abono falla, la solicitud queda atendida y el
  // 207 lo DICE con el monto — jamás nacen dos abonos por una carrera.
  await H.pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: PNG_B64 }, 'jwt-karina'));
  const cid2 = st.cambios.find((c) => c.tipo === 'pago' && c.estado === 'pendiente').id;
  const fetchReal = st.fetch;
  global.fetch = async (url, init) => {
    if (String(url).includes('/abonos_viajero') && (init || {}).method === 'POST') return { ok: false, status: 500, json: async () => ({}), text: async () => 'se cayó' };
    return fetchReal(url, init);
  };
  r = await H.adm(ev({ accion: 'cambio_pago_capturar', id: cid2, monto: 800 }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 207 && /NO SE GUARD/i.test(j.error || '') && /800/.test(j.error || ''), '[B13] abono caído → 207 que DICE el monto y manda a ➕ Abono');
  af(st.cambios.find((c) => c.id === cid2).estado === 'atendida' && st.abonos.length === 1, '[B14] la solicitud quedó atendida (cerrar PRIMERO: una carrera jamás crea dos abonos)');
  global.fetch = fetchReal;

  af(!st.log.some((l) => l.startsWith('DELETE')), '[B15] cero DELETEs en toda la corrida');

  console.log('\n[C] las validaciones de monto NO divergen del dueño (abono_crear)');
  const fs = require('fs');
  const admSrc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js'), 'utf8');
  const acaSrc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');
  af(/monto <= 0/.test(admSrc) && /monto <= 0/.test(acaSrc) && /monto > 1000000/.test(admSrc) && /monto > 1000000/.test(acaSrc),
    '[C1] los dos escritores exigen monto>0 y tope 1,000,000 (copiadas, careadas)');

  console.log('\n[D] las pantallas');
  const P = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
  const K = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
  // ⚠️ NO se quita comentarios con regex sobre el HTML ENTERO: un /* suelto en
  // CSS o en un regex del JS traga hasta el */ lejano — medido: 170 KB perdidos
  // (la lección de rebanaPlana en PORTAL-VIVO-1, con otra cara). Se RECORTA el
  // bloque que se mide y se busca ahí: un bloque corto no tiene esa trampa.
  const recorta = (s, desde, hasta) => { const i = s.indexOf(desde); if (i < 0) return ''; const fin = s.indexOf(hasta, i); return fin < 0 ? s.slice(i) : s.slice(i, fin); };
  const dispatcher = recorta(P, "document.addEventListener('click', (ev) => {", '});');
  const fnSubir = recorta(P, 'async function _migPagoSubir', '\n}');
  af(/data-mig-act="pago-subir"/.test(P) && fnSubir.length > 100, '[D1] el Portal tiene el botón y su función');
  af(/act === 'pago-subir'/.test(dispatcher) && /_migPagoSubir\(/.test(dispatcher), '[D2] el dispatcher la despacha (delegación, no onclick)');
  af(/accion: 'subir_pago'/.test(fnSubir) && /toDataURL\('image\/jpeg'/.test(fnSubir), '[D3] manda subir_pago con la imagen por canvas');
  af(!/createObjectURL/.test(fnSubir), '[D4] la subida no usa blob: (el CSP lo veta — REQ-FOTO-1)');
  af(/c\.tipo === 'pago'/.test(K) && /_reqPagoVer/.test(K) && /_reqPagoAbrir/.test(K) && /_reqPagoCapturar/.test(K), '[D5] la bandeja pinta la fila de pago con sus 3 funciones');
  const fnCapturar = recorta(K, 'async function _reqPagoCapturar', '\n}');
  const fnVer = recorta(K, 'async function _reqPagoVer', '\n}');
  af(/cambio_pago_capturar/.test(fnCapturar) && /cambio_foto/.test(fnVer), '[D6] las funciones llaman a las DOS acciones nuevas (medido en SU cuerpo, no en comentarios)');
  af(/pago: '💳/.test(K), '[D7] el tipo pago tiene su etiqueta');

  console.log(`\n${R === 0 ? (V ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde') : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + e.stack); process.exit(1); });
