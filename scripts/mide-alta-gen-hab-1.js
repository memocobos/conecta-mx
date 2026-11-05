#!/usr/bin/env node
/* ===========================================================================
 * mide-alta-gen-hab-1 — ALTA-GEN-HAB-1 + VJ-CORRIGE-JUNTO-1 (4-nov-2026)
 * Palabra de Memo: «en capsule en los clientes pon el botón de corregir a lado
 * del de pagos · a la hora de registrar cliente no viene la opción de poner
 * género y habitación».
 *   [A] servidor: viajero_migrar guarda genero (H/M) y hotel_tipo (lista del
 *       rooming); vacío = NULL; raro rebota 400 sin escribir; habitación en un
 *       CHEAP rebota (no duerme).
 *   [B] pantalla: _migLeer manda los dos; en CHEAP el select de habitación se
 *       apaga y se vacía; el botón ✏️ Corregir va junto a 📎 Pagos.
 * (Basado en la red falsa de mide-ride-sin-zona-1; abajo su cabecera vieja.)
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
  console.log('══ mide:alta-gen-hab-1 ══');
  console.log('\n[A] servidor (viajero_migrar)');
  DB = { posts: [] };
  let r = await migrar({ tipo_paquete: 'plus', zona_boleto: 'Jardín Derecho', genero: 'm', hotel_tipo: 'doble' });
  af(r.statusCode === 200 && DB.posts[0] && DB.posts[0].genero === 'M' && DB.posts[0].hotel_tipo === 'Doble',
     'PLUS con género y habitación → nace con genero M y hotel_tipo «Doble» (canonizados) (' + r.statusCode + ')');
  DB = { posts: [] };
  r = await migrar({ tipo_paquete: 'plus', zona_boleto: 'Jardín Derecho' });
  af(r.statusCode === 200 && DB.posts[0] && DB.posts[0].genero === null && DB.posts[0].hotel_tipo === null, 'sin dato → los dos NULL (no se adivina)');
  DB = { posts: [] };
  r = await migrar({ tipo_paquete: 'plus', zona_boleto: 'Jardín Derecho', genero: 'X' });
  af(r.statusCode === 400 && /género inválido/.test(r.body) && DB.posts.length === 0, 'género raro → 400 y cero escrituras');
  DB = { posts: [] };
  r = await migrar({ tipo_paquete: 'plus', zona_boleto: 'Jardín Derecho', hotel_tipo: 'Suite' });
  af(r.statusCode === 400 && /habitación inválida/.test(r.body) && DB.posts.length === 0, 'habitación fuera de la lista → 400 y cero escrituras');
  DB = { posts: [] };
  r = await migrar({ tipo_paquete: 'cheap', zona_boleto: 'Jardín Derecho', hotel_tipo: 'Doble' });
  af(r.statusCode === 400 && DB.posts.length === 0, 'habitación en un CHEAP → 400 (no duerme) y cero escrituras (' + r.body.slice(0, 80) + ')');
  DB = { posts: [] };
  r = await migrar({ tipo_paquete: 'ride', genero: 'H', hotel_tipo: 'Compartida' });
  af(r.statusCode === 200 && DB.posts[0] && DB.posts[0].hotel_tipo === 'Compartida' && DB.posts[0].genero === 'H', 'RIDE (duerme) acepta habitación y género');

  console.log('\n[B] pantalla');
  const src = fs.readFileSync(path.join(RAIZ, 'kamehouse-capsule.js'), 'utf8');
  const cortar = (s, n) => { const i = s.indexOf('function ' + n + '('); let d = 0; for (let k = s.indexOf('{', i); k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); } } };
  const els = {}; const el = (id) => els[id] || (els[id] = { value: '', innerHTML: '', style: {}, textContent: '', disabled: false });
  const ctx = { _migEl: el, _migSlug: () => 'juniorh', _migNotasConDescuento: (n) => n, _migEV: {}, _esfEsc: String };
  vm.createContext(ctx);
  vm.runInContext(cortar(src, '_migLeer') + cortar(src, '_migHabSegunPaquete'), ctx);
  el('mig-genero').value = 'M'; el('mig-hab').value = 'Triple';
  const d = vm.runInContext('_migLeer()', ctx);
  af(d.genero === 'M' && d.hotel_tipo === 'Triple', '_migLeer manda genero y hotel_tipo');
  el('mig-paquete').value = 'cheap'; vm.runInContext('_migHabSegunPaquete()', ctx);
  af(el('mig-hab').disabled === true && el('mig-hab').value === '' && /CHEAP/.test(el('mig-hab-nota').textContent), 'en CHEAP la habitación se apaga, se vacía y lo dice');
  el('mig-paquete').value = 'plus'; el('mig-hab').value = 'Doble'; vm.runInContext('_migHabSegunPaquete()', ctx);
  af(el('mig-hab').disabled === false && el('mig-hab').value === 'Doble', 'en PLUS se vuelve a poder elegir');
  af(/_migHabSegunPaquete\(\)/.test(cortar(src, '_migCuenta')), '_migCuenta (lo llama migZonas al cambiar paquete) refresca la habitación');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(/id="mig-genero"[\s\S]{0,120}value="">— sin dato —/.test(html) && /id="mig-hab"[\s\S]{0,120}value="">— sin dato —/.test(html), 'los dos selects existen en el alta y NACEN vacíos (DEFAULTS-1)');
  const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const iP = kh.indexOf("📎 Pagos</button>"), iC = kh.indexOf("✏️ Corregir</button>"), iPlan = kh.indexOf("🗓 Plan</button>");
  af(iP > 0 && iC > iP && iC < iPlan, 'en la fila del viajero ✏️ Corregir va justo después de 📎 Pagos (antes de 🗓 Plan)');
  af((kh.match(/✏️ Corregir<\/button>/g) || []).length === 1, 'un solo botón ✏️ Corregir por fila (se movió, no se duplicó)');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();
