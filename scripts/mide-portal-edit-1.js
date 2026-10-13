#!/usr/bin/env node
/* =============================================================================
 * mide-portal-edit-1 — el cliente edita sus datos y pide cambios desde el Portal.
 * Entra por los handlers REALES (portal-viajero, portal-mi-plan-migrado,
 * admin-requisiciones) con una red falsa que respeta filtros y guarda estado.
 * ⚠️ SIN ANCLA (árbol de trabajo), como mide:req-b1 / mide:acomp-1.
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

const VK = 'aaaaaaaa-0000-4000-8000-000000000001';   // de Karina
const VA = 'aaaaaaaa-0000-4000-8000-000000000002';   // acompañante Ana, con el correo de Karina
const VX = 'aaaaaaaa-0000-4000-8000-000000000003';   // de OTRA persona
function red() {
  const st = {
    viajeros: [
      { id: VK, evento_id: 'palnorte', nombre: 'Karina T', correo: 'Karina@Prueba.mx', celular: '8991112233', talla_playera: null, num_emergencia: null, emergencia_nombre: null, tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', total_contrato: 300, abonado_previo: 0 },
      { id: VA, evento_id: 'palnorte', nombre: 'Ana', correo: 'karina@prueba.mx', celular: null, talla_playera: null, num_emergencia: null, tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', total_contrato: 300, abonado_previo: 0 },
      { id: VX, evento_id: 'palnorte', nombre: 'Otro', correo: 'otro@x.mx', celular: '8990000000', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', total_contrato: 300, abonado_previo: 0 },
    ],
    cambios: [], log: [],
    usuarios: { 'jwt-karina': { id: 'u1', email: 'karina@prueba.mx', email_confirmed_at: '2026-10-13' },
                'jwt-sinverif': { id: 'u2', email: 'karina@prueba.mx', email_confirmed_at: null } },
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
      const t = (init.headers.Authorization || '').slice(7); return st.usuarios[t] ? resp(200, st.usuarios[t]) : resp(401, {}); }
    if (m === 'DELETE') throw new Error('DELETE prohibido');
    const tabla = url.includes('/viajeros_evento') ? 'viajeros' : url.includes('/cambios_viajero') ? 'cambios' : url.includes('/abonos_viajero') ? 'abonos' : null;
    if (tabla === 'abonos') return resp(200, []);
    if (!tabla) throw new Error('URL no contemplada ' + m + ' ' + url);
    const fl = f(url); const T = st[tabla];
    if (m === 'GET') return resp(200, T.filter((r) => casa(r, fl)).map((r) => Object.assign({}, r)));
    if (m === 'PATCH') { const c = JSON.parse(init.body); const rows = T.filter((r) => casa(r, fl)); rows.forEach((r) => Object.assign(r, c)); return resp(200, rows.map((r) => Object.assign({}, r))); }
    if (m === 'POST') { const row = Object.assign({ id: 'cccccccc-0000-4000-8000-' + String(seq++).padStart(12, '0'), estado: 'pendiente' }, JSON.parse(init.body)); T.push(row); return resp(201, [row]); }
    throw new Error('método ' + m);
  };
  return st;
}
function fresco() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions')) delete require.cache[k]; });
  return {
    pv: require(path.join(RAIZ, 'netlify/functions/portal-viajero.js')).handler,
    plan: require(path.join(RAIZ, 'netlify/functions/portal-mi-plan-migrado.js')).handler,
    adm: require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler,
    jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
  };
}
const ev = (body, jwt) => ({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://conectareynosa.mx' }, jwt ? { authorization: 'Bearer ' + jwt } : {}), body: JSON.stringify(body) });

(async () => {
  console.log('══ mide:portal-edit-1 ══\n[A] el plan trae lo editable');
  let st = red(); global.fetch = st.fetch; let H = fresco();
  let r = await H.plan(ev({}, 'jwt-karina')); let j = JSON.parse(r.body);
  af(j.ok && j.tours.length === 2, `[A1] Karina ve SUS 2 filas (la suya + Ana con su correo), no la ajena (${j.tours && j.tours.length})`);
  af(j.tours.every((t) => t.viajero_id && 'talla_playera' in t && 'num_emergencia' in t && 'celular' in t), '[A2] cada fila trae viajero_id y los campos editables');

  console.log('\n[B] editar — directo a la lista del evento, solo lo suyo');
  r = await H.pv(ev({ accion: 'editar', viajero_id: VA, campos: { nombre: 'Ana López Pérez', celular: '899-111-0001', talla_playera: 'm', num_emergencia: '8991110002', emergencia_nombre: 'Mamá', total_contrato: 1, zona_boleto: 'VIP', correo: 'hack@x.mx' } }, 'jwt-karina'));
  j = JSON.parse(r.body); const ana = st.viajeros.find((v) => v.id === VA);
  af(r.statusCode === 200 && j.ok, `[B1] editar a su acompañante → 200 (${r.statusCode} ${r.body.slice(0, 80)})`);
  af(ana.nombre === 'Ana López Pérez' && ana.celular === '8991110001' && ana.talla_playera === 'M' && ana.num_emergencia === '8991110002' && ana.emergencia_nombre === 'Mamá', '[B2] los datos llegan a viajeros_evento, normalizados (talla M, celular sin guiones)');
  af(ana.total_contrato === 300 && ana.zona_boleto === 'Preventa a ciegas' && ana.correo === 'karina@prueba.mx', '[B3] 🔒 contrato, zona y correo NO se tocan aunque el cuerpo los mande');
  af(!!ana.editado_portal_at, '[B4] queda el sello editado_portal_at');
  const antesX = JSON.stringify(st.viajeros.find((v) => v.id === VX));
  r = await H.pv(ev({ accion: 'editar', viajero_id: VX, campos: { nombre: 'Robado' } }, 'jwt-karina'));
  af(r.statusCode === 404 && JSON.stringify(st.viajeros.find((v) => v.id === VX)) === antesX, '[B5] 🔒 fila AJENA → 404 y cero cambios');
  r = await H.pv(ev({ accion: 'editar', viajero_id: 'aaaaaaaa-0000-4000-8000-000000000999', campos: { nombre: 'X y' } }, 'jwt-karina'));
  af(r.statusCode === 404, '[B6] id inexistente contesta IGUAL que ajeno (404)');
  r = await H.pv(ev({ accion: 'editar', viajero_id: VK, campos: { num_emergencia: '8991112233' } }, 'jwt-karina'));
  af(r.statusCode === 400, '[B7] emergencia = su propio WhatsApp → 400');
  r = await H.pv(ev({ accion: 'editar', viajero_id: VK, campos: { talla_playera: 'XXXL' } }, 'jwt-karina'));
  af(r.statusCode === 400, '[B8] talla inventada → 400');
  r = await H.pv(ev({ accion: 'editar', viajero_id: VK, campos: { nombre: 'X' } }, 'jwt-karina'));
  af(r.statusCode === 400, '[B9] nombre de 1 letra → 400');
  r = await H.pv(ev({ accion: 'editar', viajero_id: VK, campos: { nombre: 'Karina T' } }, 'jwt-sinverif'));
  af(r.statusCode === 403, '[B10] correo sin verificar → 403');
  r = await H.pv(ev({ accion: 'editar', viajero_id: VK, campos: { nombre: 'Karina T' } }));
  af(r.statusCode === 401, '[B11] sin sesión → 401');
  r = await H.pv(ev({ accion: 'editar', viajero_id: VK, campos: {} }, 'jwt-karina'));
  af(r.statusCode === 400, '[B12] nada que guardar → 400');

  console.log('\n[C] pedir un cambio — no cambia nada, cae a la bandeja');
  const antesK = JSON.stringify(st.viajeros.find((v) => v.id === VK));
  r = await H.pv(ev({ accion: 'solicitar_cambio', viajero_id: VK, tipo: 'hotel', detalle: 'Quiero habitación doble con Ana' }, 'jwt-karina'));
  af(r.statusCode === 200 && st.cambios.length === 1 && st.cambios[0].estado === 'pendiente' && st.cambios[0].correo === 'karina@prueba.mx', '[C1] nace UNA solicitud pendiente con su correo');
  af(JSON.stringify(st.viajeros.find((v) => v.id === VK)) === antesK, '[C2] 🔒 el viajero NO cambia (hotel/zona mueven precio: lo decide un humano)');
  r = await H.pv(ev({ accion: 'solicitar_cambio', viajero_id: VK, tipo: 'vuelo', detalle: 'xxx' }, 'jwt-karina'));
  af(r.statusCode === 400, '[C3] tipo inventado → 400');
  r = await H.pv(ev({ accion: 'solicitar_cambio', viajero_id: VX, tipo: 'zona', detalle: 'cambio' }, 'jwt-karina'));
  af(r.statusCode === 404 && st.cambios.length === 1, '[C4] 🔒 pedir cambio de una fila ajena → 404');
  for (let i = 0; i < 2; i++) await H.pv(ev({ accion: 'solicitar_cambio', viajero_id: VK, tipo: 'otro', detalle: 'otra cosa ' + i }, 'jwt-karina'));
  r = await H.pv(ev({ accion: 'solicitar_cambio', viajero_id: VK, tipo: 'otro', detalle: 'la cuarta' }, 'jwt-karina'));
  af(r.statusCode === 429 && st.cambios.length === 3, '[C5] tope de 3 pendientes por viajero → 429');

  console.log('\n[D] la bandeja de KameHouse');
  const tok = H.jwtSign({ id: 'u-bulma', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const tokCC = H.jwtSign({ id: 'u-cc', rol: 'cc', nombre: 'Coordi' }, process.env.JWT_SECRET, 3600);
  r = await H.adm(ev({ accion: 'cambios_listar' }, tokCC));
  af(r.statusCode === 403, '[D1] rol cc → 403');
  r = await H.adm(ev({ accion: 'cambios_listar' }, tok)); j = JSON.parse(r.body);
  af(j.ok && j.cambios.length === 3 && j.pendientes === 3 && j.cambios[0].viajero && j.cambios[0].viajero.celular === '8991112233', '[D2] lista las 3 con el WhatsApp ACTUAL del viajero');
  const cid = st.cambios[0].id;
  r = await H.adm(ev({ accion: 'cambio_cerrar', id: cid, estado: 'rechazada', respuesta: '' }, tok));
  af(r.statusCode === 400, '[D3] rechazar sin motivo → 400');
  r = await H.adm(ev({ accion: 'cambio_cerrar', id: cid, estado: 'atendida', respuesta: 'Pasada a doble' }, tok));
  af(r.statusCode === 200 && st.cambios[0].estado === 'atendida' && st.cambios[0].atendida_por === 'Bulma', '[D4] atendida queda con quién y cuándo');
  r = await H.adm(ev({ accion: 'cambio_cerrar', id: cid, estado: 'rechazada', respuesta: 'xxx' }, tok));
  af(r.statusCode === 409, '[D5] cerrarla otra vez → 409 (doble clic no escribe)');
  af(!st.log.some((l) => l.startsWith('DELETE')), '[D6] cero DELETEs en toda la corrida');

  console.log('\n[E] la pantalla del Portal');
  const P = require('fs').readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
  af(/function _migDatosHtml\(/.test(P) && /function _migGuardar\(/.test(P) && /function _migPedir\(/.test(P), '[E1] las funciones existen');
  af(!/onclick="_mig/.test(P) && /data-mig-act/.test(P) && /closest\('\[data-mig-act\]'\)/.test(P), '[E2] 🔒 botones por DELEGACIÓN (el script del Portal es módulo: un onclick no vería las funciones)');
  af(/portal-viajero/.test(P), '[E3] la pantalla habla con portal-viajero');

  console.log(`\n${R === 0 ? (V ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde') : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + e.stack); process.exit(1); });
