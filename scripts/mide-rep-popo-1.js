#!/usr/bin/env node
/* =============================================================================
 * mide-rep-popo-1 — MISTER POPO TAMBIÉN COORDINA (21-oct-2026).
 *
 * Caso real: Allan (rol mister_popo) coordinó Alejandro Sanz; la alerta de GZ
 * le pedía su reporte post-evento y la pantalla solo le enseñaba «los reportes
 * que hay» — la puerta de CREAR era solo del rol coordinador, en UI y servidor.
 *
 * Entra por el handler REAL (admin-reportes) con red falsa que respeta filtros
 * eq. y guarda estado. ⚠️ SIN ANCLA a propósito (árbol de trabajo, como
 * mide:req-dup-1): controles por construcción.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let V = 0, R = 0;
const af = (ok, msg) => { try { ok = typeof ok === 'function' ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN: ' + e.message; } if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } };

process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
process.env.JWT_SECRET = 'secreto-del-arnes';

const POPO = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTRO = 'bbbbbbbb-0000-4000-8000-000000000002';

function redNueva() {
  const st = { reportes: [
    { id: '11111111-1111-4111-8111-111111111111', coordi_id: POPO, status: 'enviado', evento_id: 'sanz', kits_detalle: [], gastos_detalle: [] },
    { id: '22222222-2222-4222-8222-222222222222', coordi_id: OTRO, status: 'enviado', evento_id: 'enjambre', kits_detalle: [], gastos_detalle: [] },
  ], escrituras: 0 };
  let seq = 1;
  const uuid = () => '00000000-0000-4000-8000-' + String(seq++).padStart(12, '0');
  const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const filtros = (url) => { const u = new URL(url); const f = {}; for (const [k, v] of u.searchParams) if (String(v).startsWith('eq.')) f[k] = decodeURIComponent(String(v).slice(3)); return f; };
  st.fetch = async (url, init) => {
    init = init || {};
    const met = (init.method || 'GET').toUpperCase();
    const U = String(url);
    if (U.includes('/rest/v1/reportes_evento')) {
      const f = filtros(url);
      const casa = (r) => Object.keys(f).every((k) => String(r[k]) === String(f[k]));
      if (met === 'GET') return resp(200, st.reportes.filter(casa));
      if (met === 'POST') { st.escrituras++; const fila = Object.assign({ id: uuid() }, JSON.parse(init.body)); st.reportes.push(fila); return resp(201, [fila]); }
      if (met === 'PATCH') { st.escrituras++; const rows = st.reportes.filter(casa); rows.forEach((r) => Object.assign(r, JSON.parse(init.body))); return resp(200, rows.map((r) => ({ ...r }))); }
    }
    if (U.includes('/rest/v1/salidas_bodega') && met === 'GET') return resp(200, []); // sin salidas → camino legacy
    if (U.includes('/rest/v1/usuarios') || U.includes('sesion')) throw new Error('sesion-viva apagada (fail-open documentado)');
    if (met === 'GET') return resp(200, []);
    throw new Error('URL no contemplada: ' + met + ' ' + U);
  };
  return st;
}
function H() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return { h: require(path.join(RAIZ, 'netlify/functions/admin-reportes.js')).handler, jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign };
}
const evento = (body, token) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + token }, body: JSON.stringify(body) });

(async function main() {
  console.log('══ mide:rep-popo-1 · Mister Popo también coordina ══\n');
  let red = redNueva();
  global.fetch = red.fetch;
  let { h, jwtSign } = H();
  const tokPopo = jwtSign({ id: POPO, rol: 'mister_popo', nombre: 'Allan' }, process.env.JWT_SECRET, 3600);
  const tokCoordi = jwtSign({ id: OTRO, rol: 'coordinador', nombre: 'Coordi' }, process.env.JWT_SECRET, 3600);

  console.log('[A] Popo CREA su reporte (guardar_mio) — el caso de Allan');
  let r = await h(evento({ accion: 'guardar_mio', status: 'borrador', evento_id: 'sanz', dinero_recibido: 1000 }, tokPopo));
  let b = JSON.parse(r.body);
  af(r.statusCode === 200 || r.statusCode === 201, 'guardar_mio contesta ok para mister_popo (antes: 403)');
  const mio = red.reportes.find((x) => x.coordi_id === POPO && x.status === 'borrador');
  af(!!mio, 'y la fila nace con coordi_id = EL DEL JWT (no puede reportar a nombre de otro)');

  console.log('\n[B] Popo NO se aprueba a sí mismo (el candado vive en el servidor)');
  red = redNueva(); global.fetch = red.fetch; ({ h } = H());
  r = await h(evento({ accion: 'aprobar_popo', id: '11111111-1111-4111-8111-111111111111' }, tokPopo));
  b = JSON.parse(r.body);
  af(r.statusCode === 403, 'aprobar_popo sobre SU propio reporte → 403');
  af(/Memo|Bulma|Milk/i.test(b.error || ''), 'y el error dice QUIÉN sí lo aprueba');
  af(red.reportes[0].status === 'enviado' && red.escrituras === 0, 'cero escrituras: su reporte sigue enviado');

  console.log('\n[C] Popo SÍ aprueba el reporte AJENO (su oficio de siempre)');
  red = redNueva(); global.fetch = red.fetch; ({ h } = H());
  r = await h(evento({ accion: 'aprobar_popo', id: '22222222-2222-4222-8222-222222222222' }, tokPopo));
  b = JSON.parse(r.body);
  af(r.statusCode === 200, 'aprobar_popo del reporte de otro coordi → 200');
  af(red.reportes[1].status === 'aprobado_popo', 'y el estado avanza a aprobado_popo');

  console.log('\n[D] el coordi de siempre no se movió (regresión)');
  red = redNueva(); global.fetch = red.fetch; ({ h } = H());
  r = await h(evento({ accion: 'guardar_mio', status: 'borrador', evento_id: 'enjambre' }, tokCoordi));
  af(r.statusCode === 200 || r.statusCode === 201, 'guardar_mio sigue abierto para coordinador');
  r = await h(evento({ accion: 'aprobar_popo', id: '22222222-2222-4222-8222-222222222222' }, tokCoordi));
  af(r.statusCode === 403, 'y un coordinador sigue SIN poder aprobar (403)');

  console.log('\n[E] la pantalla (estática)');
  const ui = fs.readFileSync(path.join(RAIZ, 'kamehouse-reportes.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  // El rojo de la primera corrida fue MÍO: recorté el archivo a 2,500 chars y
  // loadReportes vive más abajo — medía un prefijo donde el botón no existe.
  af(/rol === 'mister_popo'\) \{[^]*?\+ Nuevo Reporte/.test(ui), 'Popo ve el botón «+ Nuevo Reporte»');
  af(/const esMio = String\(r\.coordi_id\) === String\(currentUser\?\.id\)/.test(ui), 'la fila sabe si es SUYA');
  af(/esMio\s*\?\s*`<span[^`]*lo aprueban Memo, Bulma o Milk/.test(ui), 'su propia fila enviada NO trae el botón de aprobar: dice quién la aprueba');
  af(/\(rol === 'coordinador' \|\| \(rol === 'mister_popo' && esMio\)\)/.test(ui), 'y puede EDITAR/ENVIAR solo las suyas (borrador/rechazado)');

  console.log('\n' + (R ? '🔴 ROJO' : (V ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('🔴 el arnés se cayó: ' + (e && e.stack || e)); process.exit(1); });
