#!/usr/bin/env node
/* ===========================================================================
 * mide-req-2027-1 — REQ-2027-1 · la puerta 2027, mitad SERVIDOR (26-oct-2026)
 *
 * Palabra de Memo: abrir la requisición a los eventos de 2027 «poco a poco» y
 * SIN tocar el index hasta estar seguros. Esta tuerca es solo el servidor:
 *   [A] el candado de paquetes de la puerta pública (`_lib/paquete-sitio`) —
 *       lo que el cotizador no ofrece no nace (STAY en CDMX, PLUS en solo-CHEAP…)
 *       y SOLO en requisicion-crear: el motor compartido sigue cotizando todo.
 *   [B] requisicion-crear de verdad: el candado rebota con 409 y CERO escrituras;
 *       un paquete válido pasa el candado.
 *   [C] el correo único: lista (palnorte/nsqkmty) para todo; regla de fecha
 *       2027+ SOLO para 'reserva' (aprobar una requisición), jamás para la
 *       captura manual de un pago («solo requisiciones», palabra de Memo).
 *
 * ⚠️ SIN ANCLA a propósito (árbol de trabajo, como mide:req-b1). El catálogo es
 * el REAL: el index.html del árbol servido por la red falsa.
 * ========================================================================= */
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
process.env.CORREOS_MODO = 'real';
const INDEX_HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

let indexCaido = false;
const escrituras = [];
global.fetch = async (url, init = {}) => {
  const u = String(url), m = (init.method || 'GET').toUpperCase();
  const resp = (status, body) => ({ ok: status < 400, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), headers: { get: () => null } });
  if (u.includes('/index.html') || /conectareynosa\.mx\/?$/.test(u)) return indexCaido ? resp(500, 'x') : resp(200, INDEX_HTML);
  if (m !== 'GET') escrituras.push(m + ' ' + u);
  if (u.includes('/rest/v1/requisiciones') && m === 'GET') return resp(200, []);
  if (u.includes('/rest/v1/requisiciones') && m === 'POST') { const f = JSON.parse(init.body); f.id = 'id-falso'; return resp(201, [f]); }
  return resp(200, []);
};
function fresco() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions')) delete require.cache[k]; });
  return {
    crear: require(path.join(RAIZ, 'netlify/functions/requisicion-crear.js')).handler,
    sitio: require(path.join(RAIZ, 'netlify/functions/_lib/paquete-sitio.js')).paqueteVendibleEnSitio,
    correo: require(path.join(RAIZ, 'netlify/functions/_lib/correo-confirmacion.js')),
    resolver: require(path.join(RAIZ, 'netlify/functions/_lib/precio-zona.js')).resolverPrecioVenta,
    EVraw: require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js')).fetchEventosRaw,
  };
}
const ev = (body) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx' }, body: JSON.stringify(body) });

(async () => {
  console.log('══ mide-req-2027-1 · la puerta 2027 (servidor) ══');
  let H = fresco();
  const EV = await H.EVraw();
  af(Array.isArray(EV) && EV.length > 50, 'premisa: el catálogo REAL se lee (' + (EV || []).length + ' eventos)');
  const by = (id) => EV.find((e) => e && e.id === id);

  console.log('\n[A] el candado de paquetes (espejo de los botones del index)');
  const hil = by('hilary'), jr = by('juniorh'), pn = by('palnorte');
  af(hil && !H.sitio(hil, 'stay').ok, 'hilary (CDMX): STAY NO — «No disponible para CDMX» en el index');
  af(hil && H.sitio(hil, 'plus').ok && H.sitio(hil, 'cheap').ok && H.sitio(hil, 'ride').ok, 'hilary: PLUS, CHEAP y RIDE sí');
  af(jr && ['plus', 'stay', 'ride', 'cheap'].every((p) => H.sitio(jr, p).ok), 'juniorh (MTY): los 4 paquetes sí');
  af(pn && H.sitio(pn, 'cheap').ok && !H.sitio(pn, 'plus').ok && !H.sitio(pn, 'stay').ok && !H.sitio(pn, 'ride').ok,
     'palnorte (preventa, solo-CHEAP): CHEAP sí; PLUS/STAY/RIDE no');
  af(!H.sitio({ id: 'x', v: 'Mty', rideOnly: true }, 'plus').ok && H.sitio({ id: 'x', v: 'Mty', rideOnly: true }, 'ride').ok
     && H.sitio({ id: 'x', v: 'Mty', rideOnly: true, cheapAlsoOk: true }, 'cheap').ok, 'rideOnly: solo RIDE (CHEAP con cheapAlsoOk)');
  af(!H.sitio({ id: 'x', v: 'Mty', noCheap: true }, 'cheap').ok && !H.sitio({ id: 'x', v: 'Mty', cheapSoon: true }, 'cheap').ok, 'noCheap / cheapSoon: sin CHEAP');
  af(!H.sitio({ id: 'x', v: 'Puebla', noStay: true }, 'stay').ok, 'noStay foráneo: sin STAY');
  af(H.sitio({ id: 'x', v: 'Arena Monterrey', cdmx: true }, 'stay').ok,
     '🔒 CDMX se decide por el VENUE como isCDMX del index (la bandera sola no cierra STAY) — misma prueba que la pantalla');
  const rStayCdmx = await H.resolver({ evento_id: 'hilary', paquete: 'stay', zona: (hil.zonas || [])[0] && hil.zonas[0].n, num_personas: 1, transporte_cost: 0 });
  af(rStayCdmx && rStayCdmx.ok, '🔒 el MOTOR compartido sigue cotizando STAY en CDMX (cortesías/capturas internas no se rompen)');

  console.log('\n[B] requisicion-crear de verdad');
  const zH = ((hil.zonas || []).find((z) => z && !z.ag && z.p > 0) || {}).n || ((hil.multifecha || [])[0] && (hil.multifecha[0].zonas || [])[0] || {}).n;
  const base = { web: '', num_personas: 1, cotizacion_texto: 'PRUEBA', nombre: 'Arnés Prueba', celular: '8991112233', correo: 'arnes@prueba.mx', forma_pago: 'link_pago' };
  H = fresco(); escrituras.length = 0;
  let r = await H.crear(ev(Object.assign({}, base, { evento_id: (hil.multifecha ? 'hilary#0' : 'hilary'), paquete: 'stay', zona: zH, hotel: 'Compartida' })));
  af(r.statusCode === 409 && /STAY/.test(JSON.parse(r.body).error) && escrituras.length === 0, 'STAY en CDMX → 409 «no tiene paquete STAY» y CERO escrituras (' + r.statusCode + ')');
  H = fresco(); escrituras.length = 0;
  r = await H.crear(ev(Object.assign({}, base, { evento_id: 'palnorte', paquete: 'plus', zona: 'Preventa a ciegas' })));
  af(r.statusCode === 409 && /solo vende boleto/.test(JSON.parse(r.body).error) && escrituras.length === 0, 'PLUS en la preventa solo-CHEAP → 409 y CERO escrituras');
  H = fresco(); escrituras.length = 0;
  const zJ = ((jr.zonas || []).find((z) => z && !z.ag && z.p > 0) || {}).n;
  r = await H.crear(ev(Object.assign({}, base, { evento_id: 'juniorh', paquete: 'plus', zona: zJ, hotel: 'Compartida' })));
  af(r.statusCode === 200 && JSON.parse(r.body).ok, 'control positivo: PLUS en juniorh (MTY) PASA el candado y nace (' + r.statusCode + ' ' + r.body.slice(0, 80) + ')');
  H = fresco(); escrituras.length = 0;
  r = await H.crear(ev(Object.assign({}, base, { evento_id: 'palnorte', paquete: 'cheap', zona: 'Preventa a ciegas' })));
  af(r.statusCode === 200, 'regresión: la preventa de palnorte (CHEAP) sigue naciendo');

  console.log('\n[C] el correo único: lista para todo, fecha 2027+ solo para reservas');
  H = fresco();
  const C = H.correo;
  af(await C.correoDebeSalir('palnorte', 'pago') && await C.correoDebeSalir('nsqkmty', 'reserva'), 'palnorte/nsqkmty: sale en reserva Y en captura manual (como siempre)');
  af(await C.correoDebeSalir('juniorh', 'reserva'), 'juniorh (2027) al APROBAR una requisición → SÍ sale');
  af(await C.correoDebeSalir('fuerzaregida#1', 'reserva'), 'fuerzaregida#1 (multifecha 2027) al aprobar → SÍ sale (se lee el slug base)');
  af(!(await C.correoDebeSalir('juniorh', 'pago')), '🔒 juniorh con pago capturado A MANO → NO sale («solo requisiciones»: los del Excel no reciben nada nuevo)');
  const e2026 = EV.find((e) => e && e.ds && e.ds < '2027-01-01' && e.ds >= '2026-10-27' && !['palnorte', 'nsqkmty'].includes(e.id));
  af(e2026 && !(await C.correoDebeSalir(e2026.id, 'reserva')), 'evento de 2026 (' + (e2026 && e2026.id) + ') al aprobar → NO sale');
  indexCaido = true; H = fresco();
  af(!(await H.correo.correoDebeSalir('juniorh', 'reserva')), '🔒 catálogo caído → NO sale (no se escribe al Portal a ciegas)');
  af(await H.correo.correoDebeSalir('palnorte', 'reserva'), '…pero la lista no depende del catálogo: palnorte sigue');
  indexCaido = false;
  af(C.CORREO_RESERVA_DESDE === '2027-01-01', 'el corte vive con NOMBRE: CORREO_RESERVA_DESDE = 2027-01-01');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();
