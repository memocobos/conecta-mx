#!/usr/bin/env node
/* ===========================================================================
 * mide-ride-sin-zona-1 — RIDE-SIN-ZONA-1 (27-oct-2026)
 *
 * Reporte de Milk: al dar de alta a mano un viajero RIDE en KameHouse, la
 * pantalla exigía «la zona del boleto» — y el RIDE no lleva boleto. Medido: la
 * pantalla (migGuardar/migZonas) Y el servidor (viajero_migrar) la exigían; la
 * requisición aprobada ya lo hacía bien (RIDE nace con zona NULL).
 *   [A] servidor: RIDE sin zona nace (zona NULL, sin tocar stock); PLUS sin zona
 *       se sigue rechazando; RIDE CON una zona inventada sigue pasando por la
 *       puerta (desconocida → rechazo).
 *   [B] pantalla: migZonas con RIDE dice «RIDE no lleva boleto» y migGuardar no
 *       lo frena; con PLUS sigue frenando.
 * ⚠️ SIN ANCLA a propósito (árbol de trabajo).
 * ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };

const INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
let DB;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = String(url);
  if (u.includes('/index.html') || /conectareynosa\.mx\/?$/.test(u)) return resp(200, INDEX);
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'maestro_roshi' }]);
  if (u.includes('/rest/v1/eventos_meta')) return resp(200, [{ slug: 'juniorh' }]);
  if (u.includes('/rest/v1/stock_ajustes')) return resp(200, []);
  if (u.includes('/rest/v1/viajeros_evento')) {
    if (m === 'POST') { const f = Object.assign({ id: 'v-1' }, JSON.parse(init.body)); DB.posts.push(f); return resp(201, [f]); }
    return resp(200, []);
  }
  return resp(200, []);
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const tok = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'memo@x.mx', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
const migrar = (x) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok },
  body: JSON.stringify(Object.assign({ accion: 'viajero_migrar', evento_id: 'juniorh', nombre: 'Prueba Arnés', total_contrato: 2700 }, x)) });

(async () => {
  console.log('══ mide:ride-sin-zona-1 ══');
  console.log('\n[A] servidor (viajero_migrar)');
  DB = { posts: [] };
  let r = await migrar({ tipo_paquete: 'ride' });
  af(r.statusCode === 200 && DB.posts.length === 1 && DB.posts[0].zona_boleto === null && DB.posts[0].tipo_paquete === 'ride',
     'RIDE sin zona → nace con zona NULL (' + r.statusCode + ' ' + r.body.slice(0, 90) + ')');
  DB = { posts: [] };
  r = await migrar({ tipo_paquete: 'plus' });
  af(r.statusCode === 400 && /zona del boleto es obligatoria/.test(r.body) && DB.posts.length === 0, 'PLUS sin zona → 400 y cero escrituras (sigue igual)');
  DB = { posts: [] };
  r = await migrar({ tipo_paquete: 'cheap', zona_boleto: '' });
  af(r.statusCode === 400 && DB.posts.length === 0, 'CHEAP sin zona → 400 (sigue igual)');
  DB = { posts: [] };
  r = await migrar({ tipo_paquete: 'ride', zona_boleto: 'Zona Inventada XYZ' });
  af(r.statusCode === 400 && /no existe en la ficha/.test(r.body) && DB.posts.length === 0, 'RIDE con zona inventada → sigue pasando por la puerta y rebota');
  DB = { posts: [] };
  r = await migrar({ tipo_paquete: 'plus', zona_boleto: 'Jardín Derecho' });
  af(r.statusCode === 200 && DB.posts[0] && DB.posts[0].zona_boleto === 'Jardín Derecho', 'regresión: PLUS con zona real nace con su zona');

  console.log('\n[B] pantalla (kamehouse-capsule.js)');
  const src = fs.readFileSync(path.join(RAIZ, 'kamehouse-capsule.js'), 'utf8');
  const cortar = (n) => { const i = src.indexOf('function ' + n + '('); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } };
  const els = {}; const el = (id) => els[id] || (els[id] = { value: '', innerHTML: '', style: {}, textContent: '' });
  const ctx = { _migEl: el, _migCuenta() {}, _esfEsc: (s) => String(s), _migEV: { zonas: [{ n: 'Jardín Derecho', p: 3900 }], cheapZonas: [] },
    _migSlug: () => 'juniorh', _migNotasConDescuento: (n) => n, errores: [], khViajeros: { buscarParecido: async () => [] }, enviados: [] };
  ctx._migError = (m) => { if (m) ctx.errores.push(m); };
  ctx._migEnviar = async (d) => { ctx.enviados.push(d); };
  vm.createContext(ctx);
  vm.runInContext(cortar('migZonas') + cortar('_migLeer') + 'async ' + cortar('migGuardar'), ctx);
  el('mig-paquete').value = 'ride'; vm.runInContext('migZonas()', ctx);
  af(/RIDE no lleva boleto/.test(el('mig-zona').innerHTML), 'con RIDE el select de zona dice «RIDE no lleva boleto»');
  el('mig-zona').value = ''; el('mig-nombre').value = 'Prueba'; el('mig-total').value = '2700';
  await vm.runInContext('migGuardar()', ctx);
  af(ctx.errores.length === 0 && ctx.enviados.length === 1, 'migGuardar con RIDE sin zona ENVÍA (no frena)');
  ctx.errores.length = 0; ctx.enviados.length = 0;
  el('mig-paquete').value = 'plus'; vm.runInContext('migZonas()', ctx);
  af(/Jardín Derecho/.test(el('mig-zona').innerHTML), 'con PLUS el select vuelve a listar las zonas');
  el('mig-zona').value = '';
  await vm.runInContext('migGuardar()', ctx);
  af(ctx.errores.some((m) => /zona del boleto/.test(m)) && ctx.enviados.length === 0, 'migGuardar con PLUS sin zona sigue frenando');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();
