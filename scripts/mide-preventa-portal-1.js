#!/usr/bin/env node
/* mide-preventa-portal-1 — PREVENTA-PORTAL-1 (27-oct-2026)
 * Los de la preventa a ciegas eligen su paquete en el PORTAL; cae a la bandeja.
 *   [O] opciones: salen del catálogo REAL servido (index.html del árbol) por el
 *       motor de precios — STAY = PLUS − 500, CHEAP sus zonas, RIDE sin zona;
 *       zona agotada NO se ofrece; «Preventa a ciegas» nunca es destino.
 *   [P] pedir (handler REAL portal-viajero): elección inventada rebota sin
 *       escribir; la buena nace en cambios_viajero tipo 'paquete' con
 *       paquete/zona/hotel/precio ESTRUCTURADOS y el precio del MOTOR (no del
 *       cuerpo); 2º envío 409; ajeno 404; quien ya no está en preventa 409.
 *   [B] bandeja: «Aplicar» llama al MISMO dueño (viajero_elegir_paquete) y
 *       cierra la solicitud; el Portal solo pinta el wizard a los de preventa.
 * ⚠️ SIN ANCLA (árbol de trabajo). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} const t = typeof m === 'function' ? m() : m; if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

// El catálogo REAL del árbol, con UNA zona de nsqkmty marcada agotada para el control.
let INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const AGOTADA = 'Luneta';
INDEX = INDEX.replace(/(id:'nsqkmty'[\s\S]*?zonas:\[[\s\S]*?\{n:'Luneta',p:\d+)/, '$1,ag:1');
const ci = require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
const evReal = ci._parseEV(INDEX).find((x) => x.id === 'nsqkmty');

let DB, USER;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
const dec = (u) => decodeURIComponent(u);
const eq = (q, c) => { const m = q.match(new RegExp('[?&]' + c + '=eq\\.([^&]*)')); return m ? m[1] : null; };
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = dec(String(url));
  if (u.includes('/index.html') || /conectareynosa\.mx\/?($|\?)/.test(u)) return resp(200, INDEX);
  if (u.includes('/auth/v1/user')) return USER ? resp(200, USER) : resp(401, {});
  if (u.includes('/rest/v1/viajeros_evento')) { const id = eq(u, 'id'); return resp(200, DB.v.filter((v) => !id || v.id === id)); }
  if (u.includes('/rest/v1/cambios_viajero')) {
    if (m === 'POST') {
      const b = JSON.parse(init.body);
      if (b.tipo === 'paquete' && DB.c.some((c) => c.viajero_id === b.viajero_id && c.tipo === 'paquete' && c.estado === 'pendiente')) return resp(409, { code: '23505' });
      const fila = Object.assign({ id: U(900 + DB.c.length), estado: 'pendiente' }, b); DB.c.push(fila); return resp(201, [fila]);
    }
    let f = DB.c.slice();
    const vid = eq(u, 'viajero_id'); if (vid) f = f.filter((c) => c.viajero_id === vid);
    const t = eq(u, 'tipo'); if (t) f = f.filter((c) => c.tipo === t);
    const e = eq(u, 'estado'); if (e) f = f.filter((c) => c.estado === e);
    return resp(200, f);
  }
  return resp(200, []);
};
const semilla = () => ({ c: [], v: [
  { id: U(1), evento_id: 'nsqkmty', nombre: 'Ana Pérez', correo: 'ana@correo.mx', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas' },
  { id: U(2), evento_id: 'nsqkmty', nombre: 'Ya Eligió', correo: 'ana@correo.mx', tipo_paquete: 'plus', zona_boleto: 'Oro' },
  { id: U(3), evento_id: 'nsqkmty', nombre: 'Otra', correo: 'otra@x.mx', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas' },
] });
const H = require(path.join(RAIZ, 'netlify/functions/portal-viajero.js')).handler;
const llamar = async (b) => { const r = await H({ httpMethod: 'POST', headers: { authorization: 'Bearer jwt' }, body: JSON.stringify(b) }); return { s: r.statusCode, j: JSON.parse(r.body) }; };

(async () => {
  console.log('══ mide:preventa-portal-1 ══\n[O] las opciones salen del motor');
  af(!!evReal && evReal.zonas.length > 5, () => 'premisa: el index del árbol trae a nsqkmty con zonas reales (' + (evReal ? evReal.zonas.length : 0) + ')');
  af(!!(evReal.zonas.find((z) => z.n === AGOTADA) || {}).ag, 'control: la siembra SÍ agotó «' + AGOTADA + '» (si no, «no se ofrece» pasaría en vacío)');
  DB = semilla(); USER = { email: 'Ana@Correo.mx', email_confirmed_at: 'x' };
  let r = await llamar({ accion: 'opciones_paquete', viajero_id: U(1) });
  af(r.s === 200 && r.j.ok, () => 'opciones contesta 200 · ' + JSON.stringify(r.j).slice(0, 120));
  const P = (p) => (r.j.paquetes || []).find((x) => x.paquete === p) || {};
  const zP = (p, z) => ((P(p).zonas || []).find((x) => x.zona === z) || {}).precio;
  const pubPlus = (evReal.zonas.find((z) => z.n === 'General') || {}).p, pubCheap = (evReal.cheapZonas.find((z) => z.n === 'General') || {}).p;
  af(['plus', 'stay', 'ride', 'cheap'].every((p) => P(p).paquete), 'los 4 paquetes se ofrecen (nsqkmty no es CDMX ni cheapOnly)');
  af(zP('plus', 'General') === pubPlus && zP('cheap', 'General') === pubCheap, () => `PLUS y CHEAP General = la ficha (${zP('plus', 'General')}/${pubPlus} · ${zP('cheap', 'General')}/${pubCheap})`);
  af(zP('stay', 'General') === pubPlus - 500, () => 'STAY = PLUS − 500 (STAY_DESCUENTO del motor): ' + zP('stay', 'General'));
  af(P('ride').zonas === null && P('ride').precio === evReal.ride, () => 'RIDE sin zona, su precio es el de la ficha: ' + P('ride').precio);
  af(!(P('plus').zonas || []).some((z) => z.zona === AGOTADA), 'la zona agotada NO se ofrece');
  af(!(r.j.paquetes || []).some((p) => (p.zonas || []).some((z) => /preventa a ciegas/i.test(z.zona))), '«Preventa a ciegas» nunca es destino');
  af(!P('cheap').habitaciones.length && P('plus').habitaciones.length > 0, 'CHEAP sin habitación; PLUS con habitaciones');

  console.log('\n[P] pedir');
  r = await llamar({ accion: 'pedir_paquete', viajero_id: U(1), paquete: 'plus', zona: 'Zona Inventada', hotel: 'Compartida (4 personas)' });
  af(r.s === 400 && DB.c.length === 0, 'zona inventada → 400 sin escribir');
  r = await llamar({ accion: 'pedir_paquete', viajero_id: U(1), paquete: 'plus', zona: AGOTADA, hotel: 'Compartida (4 personas)' });
  af(r.s === 400 && DB.c.length === 0, 'zona agotada → 400 sin escribir');
  r = await llamar({ accion: 'pedir_paquete', viajero_id: U(1), paquete: 'stay', zona: 'General', hotel: 'Compartida (4 personas)', precio: 1 });
  const fila = DB.c[0] || {};
  af(r.s === 200 && fila.tipo === 'paquete' && fila.paquete_pedido === 'stay' && fila.zona_pedida === 'General' && fila.hotel_pedido === 'Compartida (4 personas)', () => 'nace la solicitud estructurada · ' + JSON.stringify(fila).slice(0, 160));
  af(fila.precio_lista === pubPlus - 500 && fila.correo === 'ana@correo.mx', () => 'el precio lo pone el MOTOR (no el «precio:1» del cuerpo) y el correo va en minúsculas: ' + fila.precio_lista);
  r = await llamar({ accion: 'opciones_paquete', viajero_id: U(1) });
  af(r.s === 200 && r.j.pendiente && r.j.pendiente.paquete_pedido === 'stay', 'con una elección pendiente, opciones contesta «en revisión»');
  r = await llamar({ accion: 'pedir_paquete', viajero_id: U(1), paquete: 'plus', zona: 'General', hotel: 'Compartida (4 personas)' });
  af(r.s === 409 && DB.c.length === 1, '2º envío → 409, una sola solicitud');
  r = await llamar({ accion: 'pedir_paquete', viajero_id: U(2), paquete: 'plus', zona: 'General', hotel: 'Compartida (4 personas)' });
  af(r.s === 409 && r.j.ya, 'quien ya tiene paquete → 409 (lo suyo es «Pedir un cambio»)');
  r = await llamar({ accion: 'pedir_paquete', viajero_id: U(3), paquete: 'cheap', zona: 'General' });
  af(r.s === 404 && DB.c.length === 1, 'viajero de otra cuenta → 404 sin escribir');
  r = await llamar({ accion: 'pedir_paquete', viajero_id: U(1), paquete: 'cheap', zona: 'General', hotel: 'x' });
  af(r.s === 409, 'la guarda de pendiente corre ANTES de validar (no hay segunda vía)');

  console.log('\n[B] bandeja y Portal');
  const kr = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
  const ap = kr.slice(kr.indexOf('async function _reqPaqAplicar('), kr.indexOf('// Cerrar un cambio: la nota/motivo'));
  af(/accion: 'viajero_elegir_paquete'/.test(ap) && /accion: 'cambio_cerrar'/.test(ap) && ap.indexOf('viajero_elegir_paquete') < ap.indexOf('cambio_cerrar'), '«Aplicar» llama al MISMO dueño (viajero_elegir_paquete) y DESPUÉS cierra la solicitud');
  af(/ya no est\[aá\] en preventa/.test(ap), 'si ya estaba aplicado, cierra igual (no se queda colgada)');
  const ph = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
  const fn = ph.slice(ph.indexOf('function _migPaqHtml('), ph.indexOf('const _paqOps'));
  const ctx = { escapeHtml: (s) => String(s) }; vm.createContext(ctx); vm.runInContext(fn, ctx);
  af(/Elegir mi paquete/.test(ctx._migPaqHtml({ viajero_id: U(1), zona: 'Preventa a ciegas' })) && ctx._migPaqHtml({ viajero_id: U(2), zona: 'Oro' }) === '', 'el Portal pinta el wizard SOLO a quien está en preventa');
  af(/act === 'paq-abrir'/.test(ph) && /act === 'paq-enviar'/.test(ph) && !/onclick="_paq/.test(ph), 'botones por delegación data-mig-act (el script es MÓDULO)');
  const sql = fs.readFileSync(path.join(RAIZ, 'migraciones/PREVENTA-PORTAL-1.sql'), 'utf8');
  af(/paquete_pedido is not null/.test(sql) && /grant select, insert, update, delete on public\.cambios_viajero to service_role/.test(sql), 'acta: CHECK con is not null (el que sí muerde) + GRANT');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('💥 el arnés se cayó: ' + e.stack); process.exit(1); });
