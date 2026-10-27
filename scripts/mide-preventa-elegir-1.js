#!/usr/bin/env node
/* mide-preventa-elegir-1 — PREVENTA-ELEGIR-1 (27-oct-2026)
 * Bulma/Milk pasan a quien separó en preventa a su paquete real.
 *   [A] servidor: pasa de preventa a PLUS con zona real; valor esperado (2º clic 409);
 *       una fila que NO está en preventa no se toca; zona inventada rebota;
 *       zona con pedido cargado y sin lugar rebota; «Preventa a ciegas» como zona rebota;
 *       el dinero (abonado_previo / abonos) NO viaja en el PATCH.
 *   [B] etiqueta: nsqkmty ya no rotula CHEAP normales como preventa; los suyos por zona sí.
 * ⚠️ SIN ANCLA (árbol de trabajo). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.PORTAL_SUPABASE_URL = 'https://portal.falso.test';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'psvc';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };

// Catálogo falso con nsqkmty YA con costos reales
const INDEX = `<script>var EV=[{id:'nsqkmty',a:'NSQK',f:'9 abr 2027',ds:'2027-04-09',v:'Arena Monterrey, Mty',st:'',sep:500,sepCheap:500,ride:2700,zonas:[{n:'Oro',p:4500},{n:'Plata',p:3500}],cheapZonas:[{n:'Oro',p:3500},{n:'Plata',p:2500}],hotel:[]}];</script>`;
let DB;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
const dec = (u) => decodeURIComponent(u);
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = String(url);
  if (u.includes('/index.html') || /conectareynosa\.mx\/?($|\?)/.test(u)) return resp(200, INDEX);
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'maestro_roshi' }]);
  if (u.includes('/rest/v1/compras')) return resp(200, DB.compras || []);
  if (u.includes('/rest/v1/stock_ajustes')) return resp(200, []);
  if (u.includes('/rest/v1/viajeros_evento')) {
    const idm = dec(u).match(/id=eq\.([0-9a-f-]{36})/);
    let filas = DB.v.filter((f) => !idm || f.id === idm[1]);
    if (m === 'PATCH') {
      const q = dec(u);
      filas = filas.filter((f) => (!/tipo_paquete=eq\.(\w+)/.test(q) || f.tipo_paquete === q.match(/tipo_paquete=eq\.(\w+)/)[1])
        && (!/total_contrato=eq\.([\d.]+)/.test(q) || Number(f.total_contrato) === Number(q.match(/total_contrato=eq\.([\d.]+)/)[1])));
      const body = JSON.parse(init.body); DB.patches.push(body);
      filas.forEach((f) => Object.assign(f, body));
      return resp(200, filas);
    }
    if (/zona_boleto=eq\./.test(u) || /evento_id=eq\./.test(u)) return resp(200, DB.v.filter((f) => f.evento_id === 'nsqkmty' && f.tipo_paquete !== 'cheap_x'));
    return resp(200, filas);
  }
  return resp(200, []);
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const tok = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'memo@x.mx', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
const call = (x) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(Object.assign({ accion: 'viajero_elegir_paquete' }, x)) });
const ID1 = '11111111-1111-4111-8111-111111111111', ID2 = '22222222-2222-4222-8222-222222222222';
const semilla = () => ({ patches: [], compras: [], v: [
  { id: ID1, evento_id: 'nsqkmty', nombre: 'Ana', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', total_contrato: 300, abonado_previo: 0, boletos: 1, notas: null },
  { id: ID2, evento_id: 'nsqkmty', nombre: 'Beto', tipo_paquete: 'plus', zona_boleto: 'Oro', total_contrato: 4500, abonado_previo: 0, boletos: 1, notas: null },
] });

(async () => {
  console.log('══ mide:preventa-elegir-1 ══\n[A] servidor');
  DB = semilla();
  let r = await call({ id: ID1, tipo_paquete: 'plus', zona_boleto: 'Oro', total_contrato: 4500 });
  const a = DB.v[0];
  af(r.statusCode === 200 && a.tipo_paquete === 'plus' && a.zona_boleto === 'Oro' && Number(a.total_contrato) === 4500, 'preventa → PLUS Oro $4,500 (' + r.statusCode + ' ' + r.body.slice(0, 80) + ')');
  af(/PREVENTA→PAQUETE/.test(a.notas || ''), 'la nota sella el cambio y quién lo capturó');
  af(DB.patches.every((p) => !('abonado_previo' in p)), 'el PATCH NO toca el dinero pagado');
  r = await call({ id: ID1, tipo_paquete: 'plus', zona_boleto: 'Plata', total_contrato: 3500 });
  af(r.statusCode === 409 && Number(DB.v[0].total_contrato) === 4500, '2º clic sobre alguien que ya eligió → 409, nada se mueve');
  DB = semilla();
  r = await call({ id: ID2, tipo_paquete: 'cheap', zona_boleto: 'Plata', total_contrato: 2500 });
  af(r.statusCode === 409 && DB.patches.length === 0, 'una fila que NO está en preventa no se toca (409)');
  r = await call({ id: ID1, tipo_paquete: 'plus', zona_boleto: 'Zona Inventada', total_contrato: 100 });
  af(r.statusCode === 400 && /no existe en la ficha/.test(r.body) && DB.patches.length === 0, 'zona inventada → 400 nombrando las de la ficha');
  r = await call({ id: ID1, tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', total_contrato: 300 });
  af(r.statusCode === 400 && DB.patches.length === 0, '«Preventa a ciegas» como zona destino → 400');
  r = await call({ id: ID1, tipo_paquete: 'plus', zona_boleto: '', total_contrato: 100 });
  af(r.statusCode === 400 && DB.patches.length === 0, 'PLUS sin zona → 400');
  r = await call({ id: ID1, tipo_paquete: 'ride', zona_boleto: '', total_contrato: 2700 });
  af(r.statusCode === 200 && DB.v[0].tipo_paquete === 'ride' && DB.v[0].zona_boleto === null, 'RIDE sin zona → nace sin zona');

  console.log('\n[B] etiqueta en KameHouse');
  const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const i = kh.indexOf('const KH_PREVENTA_EVENTOS'), j = kh.indexOf('function loadPage(name)');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(kh.slice(i, j) + ';this.f=khPaqueteTexto;this.p=khEsPreventaCiegas;', ctx);
  af(ctx.f({ tipo_paquete: 'cheap', zona_boleto: 'Oro', evento_id: 'nsqkmty' }) === 'CHEAP', 'un CHEAP nuevo de nsqk dice CHEAP');
  af(ctx.f({ tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', evento_id: 'nsqkmty' }) === 'PREVENTA A CIEGAS', 'los de la preventa siguen rotulados por su zona');
  af(ctx.p({ tipo_paquete: 'cheap', zona_boleto: null, evento_id: 'palnorte' }) === true, 'palnorte sigue en preventa');
  af(/khEsPreventaCiegas\(v\) \? `<button[^`]*_vjElegirAbrir/.test(kh), 'el botón 🎟 Elegir paquete solo sale a quien está en preventa');
  af(/<td>\$\{_esfEsc\(khPaqueteTexto\(v\) \|\| '—'\)\}<\/td>/.test(kh), 'la lista principal pinta la etiqueta, no el paquete crudo');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();
