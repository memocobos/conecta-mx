#!/usr/bin/env node
// =============================================================================
// mide-cancelar-lugar-1.js — [CANCELAR-LUGAR-1 + CAPSULE-DISPO-1 + KAMISAMA-SCROLL-1]
// (30-oct-2026). SIN ancla de commit, a propósito: carga del ÁRBOL de trabajo
// (como mide:req-b1). Controles por construcción + sabotaje aparte.
//
//  [A] viajero_cancelar por el HANDLER REAL con red falsa que respeta filtros
//      (incluido el `or=(boletos.neq.0,zona_boleto.not.is.null)` del valor
//      esperado — sin modelarlo, «el 2º clic da 409» sería un verde vacío):
//      ganancia · reembolso · tope del monto · confirmar · motivo · 2º clic ·
//      cero escrituras a abonos · nombre fuera del cuarto · cero DELETEs.
//  [B] semáforo: Milk lo LEE; vendidos_fuera sigue roshi/bulma.
//  [C] la pantalla: chips de inventario (sin pedido se DICE), datalist de
//      zonas con «quedan N», botón ⛔ y su recarga.
//  [D] el mando de Kamisama devuelve el alto que pierde (no brinca).
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');

process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.PORTAL_SUPABASE_URL = 'https://portal.falso.test';
process.env.PORTAL_SUPABASE_SERVICE = 'svc2';
process.env.CORREOS_MODO = 'real';

let V = 0, R = 0;
const af = (c, m) => {
  let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {}
  if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); }
};
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
const eq = (q, campo) => { const m = q.match(new RegExp('[?&]' + campo + '=eq\\.([^&]*)')); return m ? decodeURIComponent(m[1]) : null; };

let DB; const TODAS = [];
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = decodeURIComponent(String(url));
  if (m === 'DELETE') { TODAS.push({ t: 'DELETE', u }); throw new Error('DELETE prohibido'); }
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'bulma' }]);
  if (u.includes('/rest/v1/abonos_viajero')) {
    if (m !== 'GET') { TODAS.push({ t: 'abonos', m }); return resp(201, [{}]); }
    const vid = eq(u, 'viajero_id'); return resp(200, DB.abonos.filter((a) => a.viajero_id === vid));
  }
  if (u.includes('/rest/v1/reembolsos')) {
    if (m === 'POST') { const b = JSON.parse(init.body); TODAS.push({ t: 'reembolsos', b }); DB.reemb.push(b); return resp(201, [Object.assign({ id: 'r' + DB.reemb.length }, b)]); }
    return resp(200, DB.reemb);
  }
  if (u.includes('/rest/v1/rooming_habitaciones')) {
    const id = eq(u, 'id'); const h = DB.habs.find((x) => x.id === id);
    if (m === 'PATCH') { const b = JSON.parse(init.body); TODAS.push({ t: 'rooming', b }); if (h) Object.assign(h, b); return resp(204, []); }
    return resp(200, h ? [h] : []);
  }
  if (u.includes('/rest/v1/viajeros_evento')) {
    let f = DB.v.slice();
    const id = eq(u, 'id'); if (id) f = f.filter((x) => x.id === id);
    if (/or=\(boletos\.neq\.0,zona_boleto\.not\.is\.null\)/.test(u)) f = f.filter((x) => Number(x.boletos) !== 0 || x.zona_boleto != null);
    else if (/[?&]or=/.test(u)) throw new Error('la red falsa no entiende este or=: ' + u);
    // 🔒 COPIAS, no referencias: la base de verdad devuelve JSON nuevo. Con
    // referencias vivas el PATCH muta lo que el handler ya «leyó».
    if (m === 'PATCH') { const b = JSON.parse(init.body); TODAS.push({ t: 've', b, filas: f.length }); f.forEach((x) => Object.assign(x, b)); return resp(200, JSON.parse(JSON.stringify(f))); }
    return resp(200, JSON.parse(JSON.stringify(f)));
  }
  return resp(200, []);
};

const semilla = () => {
  DB = {
    v: [
      { id: U(1), evento_id: 'nsqkmty', nombre: 'Lucía Paz', correo: 'l@x.mx', tipo_paquete: 'cheap', zona_boleto: 'McCormick', boletos: 2, total_contrato: 5800, abonado_previo: 1000, notas: 'migrada', habitacion_id: null, grupo_viaje: null },
      { id: U(2), evento_id: 'nsqkmty', nombre: 'Pepe Cuarto', correo: null, tipo_paquete: 'plus', zona_boleto: 'Oro', boletos: 1, total_contrato: 9000, abonado_previo: 0, notas: '', habitacion_id: U(90), grupo_viaje: U(91) },
    ],
    abonos: [{ viajero_id: U(1), monto: 500 }, { viajero_id: U(2), monto: 3000 }],
    reemb: [],
    habs: [{ id: U(90), ocupantes: ['Pepe Cuarto', 'Otro Señor'] }],
  };
};
const llamar = async (b, rol) => {
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const jw = jwtSign({ id: 'u', rol: rol || 'bulma', correo: 'b@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify(b) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};
const de = (n) => DB.v.find((x) => x.id === U(n));

(async () => {
  console.log('\nCAREO CANCELAR-LUGAR-1 · CAPSULE-DISPO-1 · KAMISAMA-SCROLL-1\n');
  console.log('[A] viajero_cancelar por el handler REAL');
  const src = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');
  af(/viajero_cancelar:\s*ROLES_EDITA_VIAJERO/.test(src), 'la acción está en ACCIONES (si no, el portero la rechaza antes)');

  semilla();
  let r = await llamar({ accion: 'viajero_cancelar', id: U(1), modo: 'ganancia', motivo: 'no hay McCormick' });
  af(r.s === 400 && /confirmar/.test(r.j.error || ''), 'sin confirmar:true → 400');
  r = await llamar({ accion: 'viajero_cancelar', id: U(1), modo: 'ganancia', confirmar: true, motivo: '' });
  af(r.s === 400 && /motivo/.test(r.j.error || ''), 'sin motivo → 400');
  r = await llamar({ accion: 'viajero_cancelar', id: U(1), modo: 'borrar', confirmar: true, motivo: 'x x x' });
  af(r.s === 400, 'modo inventado → 400');
  af(TODAS.length === 0, `nada se escribió en los rebotes (${TODAS.length})`);

  r = await llamar({ accion: 'viajero_cancelar', id: U(1), modo: 'ganancia', confirmar: true, motivo: 'no hay McCormick' });
  const v1 = de(1);
  af(r.s === 200, 'ganancia → 200');
  af(v1.boletos === 0 && v1.zona_boleto === null, 'boletos 0 y zona NULL (el boleto vuelve al inventario)');
  af(v1.total_contrato === 1500, `contrato = lo COBRADO previo+abonos = 1500 (es ${v1.total_contrato}) — saldo 0`);
  af(v1.abonado_previo === 1000, 'el abonado previo NO se toca');
  af(/\[CANCELA \d{4}-\d\d-\d\d\] dinero A FAVOR/.test(v1.notas) && /^migrada · /.test(v1.notas), 'la nota se ANEXA con el rastro (la procedencia no se pisa)');
  af(DB.reemb.length === 0, 'modo ganancia: CERO reembolsos');
  af(r.j.libero && r.j.libero.zona === 'McCormick' && r.j.libero.boletos === 2, 'la respuesta dice qué liberó (2 McCormick)');
  const nAntes = TODAS.length;
  r = await llamar({ accion: 'viajero_cancelar', id: U(1), modo: 'reembolso', monto: 100, confirmar: true, motivo: 'otra vez' });
  af(r.s === 409 && r.j.ya, '2º clic sobre un lugar cancelado → 409');
  af(TODAS.length === nAntes && DB.reemb.length === 0, '…y no nace un reembolso ni se escribe nada');

  semilla();
  r = await llamar({ accion: 'viajero_cancelar', id: U(2), modo: 'reembolso', monto: 3500, confirmar: true, motivo: 'se enfermó' });
  af(r.s === 400 && /más de lo cobrado/.test(r.j.error || ''), 'reembolso mayor a lo cobrado ($3000) → 400');
  r = await llamar({ accion: 'viajero_cancelar', id: U(2), modo: 'reembolso', monto: 2000, confirmar: true, motivo: 'se enfermó', datos_bancarios: 'CLABE 123' });
  const v2 = de(2);
  af(r.s === 200 && r.j.reembolso, 'reembolso → 200 con su fila');
  af(DB.reemb.length === 1 && DB.reemb[0].monto === 2000 && DB.reemb[0].estado === 'pendiente', 'nace UNA fila PENDIENTE en Yamcha por $2000');
  af(DB.reemb[0].evento_slug === 'nsqkmty' && new RegExp('Viajero ' + U(2)).test(DB.reemb[0].notas), 'llavea el evento base y nombra al viajero (forma de CANCEL-1)');
  af(v2.total_contrato === 3000, 'contrato = lo cobrado (3000): la utilidad baja solo cuando Yamcha transfiere');
  af(v2.habitacion_id === null && v2.grupo_viaje === null, 'habitación y grupo se SUELTAN');
  af(JSON.stringify(DB.habs[0].ocupantes) === '["Otro Señor"]', 'su nombre sale del cuarto; el otro ocupante se queda');
  af(!TODAS.some((x) => x.t === 'abonos'), 'CERO escrituras a abonos_viajero en toda la corrida');
  af(!TODAS.some((x) => x.t === 'DELETE'), 'CERO DELETEs (cancelar no es eliminar)');
  // control positivo del contador
  await fetch('https://kh.falso.test/rest/v1/abonos_viajero', { method: 'POST', body: '{}' });
  af(TODAS.some((x) => x.t === 'abonos'), 'control: el contador SÍ ve una escritura inyectada a abonos');

  console.log('\n[B] el semáforo');
  const comp = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-compras.js'), 'utf8');
  af(/semaforo:\s*\[\.\.\.ROLES_STOCK,\s*'milk'\]/.test(comp), 'Milk LEE el semáforo');
  af(/ajuste_guardar:\s*ROLES_STOCK\b/.test(comp) && /ROLES_STOCK = \['maestro_roshi', 'bulma'\]/.test(comp), 'capturar vendidos_fuera sigue solo roshi/bulma');

  console.log('\n[C] la pantalla');
  const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const corta = (decl) => { const i = kh.indexOf(decl); if (i < 0) return null; let d = 0; for (let k = kh.indexOf('{', i); k < kh.length; k++) { if (kh[k] === '{') d++; if (kh[k] === '}' && !--d) return kh.slice(i, k + 1); } return null; };
  const fPintar = corta('function _vjInvPintar(');
  const nodos = { 'cc-vj-inv': { innerHTML: '' } };
  const ctx = { document: { getElementById: (x) => nodos[x] || null }, _esfEsc: (s) => String(s == null ? '' : s), _vjInv: null };
  vm.createContext(ctx); vm.runInContext(fPintar + ';this._p=_vjInvPintar;', ctx);
  ctx._vjInv = { evento: 'nsqkmty', zonas: [
    { zona: 'McCormick', disponibles: -2, estado: 'negativo', compradas: 10, fuera: 0, migrados: 12 },
    { zona: 'Oro', disponibles: 3, estado: 'amarillo', compradas: 20, migrados: 17 },
    { zona: 'Pista', disponibles: null, estado: 'sin-stock', compradas: 0, migrados: 4 }] };
  vm.runInContext('_vjInv = this._vjInv; _vjInvPintar();', ctx);
  const html = nodos['cc-vj-inv'].innerHTML;
  af(/McCormick · -2 ⚠️ sobrevendida/.test(html), 'una zona sobrevendida se DICE («-2 sobrevendida»)');
  af(/Oro · quedan <b>3<\/b>/.test(html), '«Oro · quedan 3»');
  af(/Pista · sin pedido/.test(html) && !/Pista · quedan/.test(html), 'zona sin pedido dice «sin pedido», jamás un número');
  af(html.indexOf('McCormick') < html.indexOf('Oro'), 'las más escasas primero');
  ctx._vjInv = { evento: 'x', zonas: [] }; vm.runInContext('_vjInv = this._vjInv; _vjInvPintar();', ctx);
  af(/no tiene pedido de boletos cargado/.test(nodos['cc-vj-inv'].innerHTML), 'sin pedido en todo el evento: se dice, no queda en blanco');
  af(/_vjInvCargar\(_ccEventoActual\)/.test(corta('async function _vj2Cargar(') || ''), 'cada recarga de la lista (corregir/mover/cancelar) repinta el marcador');
  af(/evId !== _ccEventoActual\) return/.test(corta('async function _vjInvCargar(') || ''), 'una respuesta tardía de otro evento no se pinta');
  // [ZONA-SELECT-1] Actualizado a la verdad nueva: el datalist obligaba a
  // TECLEAR (Chrome solo enseñaba la zona ya escrita); hoy es un <select> que
  // llena el servidor (fechas_de_evento → zonasDeFecha) con «quedan N».
  af(/_vjEditarZonas\(id, v\)/.test(corta('function _vjEditarAbrir(') || '') && /<select class="cot-input" id="vjx-z-/.test(corta('function _vjEditarAbrir(') || ''), 'el ✏️ Corregir ELIGE la zona de un select (no se teclea)');
  af(/fechasDeEvento\(v\.evento_id\)/.test(corta('async function _vjEditarZonas(') || '') && /quedan \$\{d\}/.test(corta('async function _vjEditarZonas(') || ''), 'las zonas salen de la ficha de esa fecha con «quedan N»');
  af(/_vjCancelarAbrir\(/.test(kh) && /accion: 'viajero_cancelar'/.test(corta('async function _vjCancelarGuardar(') || ''), 'el botón ⛔ llama a viajero_cancelar');
  af(/confirm\(frase\)/.test(corta('async function _vjCancelarGuardar(') || '') && /await _vj2Cargar\(\)/.test(corta('async function _vjCancelarGuardar(') || ''), 'pide confirm y recarga lista + marcador');
  af(/id="cc-vj-inv"/.test(fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8')), 'el contenedor del marcador vive en el HTML');

  console.log('\n[D] el mando de Kamisama no brinca');
  const km = fs.readFileSync(path.join(RAIZ, 'kamehouse-kamisama.js'), 'utf8');
  const i0 = km.indexOf('function _kmsMandoSticky('); let d = 0, fin = -1;
  for (let k = km.indexOf('{', i0); k < km.length; k++) { if (km[k] === '{') d++; if (km[k] === '}' && !--d) { fin = k; break; } }
  const fM = km.slice(i0, fin + 1);
  let cb = null;
  const clases = new Set(); let alto = 120;
  const mando = { classList: { contains: (c) => clases.has(c), add: (c) => { clases.add(c); alto = 78; }, remove: (c) => { clases.delete(c); alto = 120; }, toggle: () => {} }, style: {}, get offsetHeight() { return alto; } };
  const c2 = { document: { getElementById: () => ({}), querySelector: () => mando }, window: { IntersectionObserver: 1 }, getComputedStyle: () => ({ marginBottom: '16px' }),
    IntersectionObserver: function (f) { cb = f; this.observe = () => {}; this.disconnect = () => {}; }, _kmsMandoObs: null };
  c2.window.IntersectionObserver = c2.IntersectionObserver;
  vm.createContext(c2); vm.runInContext('var _kmsMandoObs=null;' + fM + ';_kmsMandoSticky();', c2);
  cb([{ isIntersecting: false }]);
  af(clases.has('kms-mando-mini'), 'al bajar, el mando se vuelve mini');
  af(mando.style.marginBottom === 'calc(16px + 42px)', `el alto perdido (42px) se devuelve como margen: «${mando.style.marginBottom}»`);
  cb([{ isIntersecting: false }]);
  af(mando.style.marginBottom === 'calc(16px + 42px)', 'un 2º aviso igual no re-mide (no se acumula margen)');
  cb([{ isIntersecting: true }]);
  af(!clases.has('kms-mando-mini') && mando.style.marginBottom === '', 'al subir, vuelve lleno y sin margen extra');

  console.log(`\n${R ? '🔴' : '✅'} ${V} en verde · ${R} en rojo`);
  if (!V) console.log('NADA MEDIDO · esto NO es un verde');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(1); });
