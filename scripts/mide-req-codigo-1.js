#!/usr/bin/env node
/**
 * mide:req-codigo-1 — REQ-CODIGO-1 (12-nov-2026): el código de descuento llega a
 * la requisición, se valida contra el PROMOS del index SERVIDO, cuenta sus usos
 * en el SERVIDOR y el total nace YA con el descuento.
 *
 * Entra por el handler REAL (requisicion-crear) con una red falsa que sirve el
 * index del árbol (con códigos de prueba sembrados en su PROMOS) y guarda las
 * requisiciones con estado. Sin ancla de commit a propósito (árbol de trabajo,
 * la forma de mide:req-b1).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
let verdes = 0, rojos = 0;
function af(c, m) { if (c) { verdes++; console.log('  ✓ ' + m); } else { rojos++; console.log('  ✗ ' + m); } }

process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
process.env.URL = 'https://conectareynosa.mx';

const INDEX_REAL = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const LEJOS = Date.now() + 30 * 864e5;
function indexConCodigos(slug) {
  const extra =
    `'PRUEBAUNA':{amount:200,expiresTs:${LEJOS},maxUsos:1,usos:0,desc:'arnés',onlyEvent:'${slug}'},` +
    `'PRUEBAPCT':{pct:10,expiresTs:${LEJOS},maxUsos:9999,usos:0,desc:'arnés',onlyEvent:'${slug}'},` +
    `'PRUEBAYO':{amount:100,expiresTs:${LEJOS},maxUsos:9999,usos:0,singleUse:true,desc:'arnés',onlyEvent:'${slug}'},` +
    `'PRUEBAOTRO':{amount:100,expiresTs:${LEJOS},maxUsos:9999,usos:0,desc:'arnés',onlyEvent:'otroeventoquenoexiste'},` +
    `'PRUEBAVIEJO':{amount:100,expiresTs:${Date.now() - 864e5},maxUsos:9999,usos:0,desc:'arnés',onlyEvent:'${slug}'},` +
    `'PRUEBANOPKG':{amount:100,expiresTs:${LEJOS},maxUsos:9999,usos:0,desc:'arnés',onlyEvent:'${slug}',excludePkg:['plus']},`;
  const h = INDEX_REAL.replace('var PROMOS={', 'var PROMOS={' + extra);
  if (h === INDEX_REAL) throw new Error('no encontré `var PROMOS={` en el index');
  return h;
}

function redNueva(html) {
  const st = { requisiciones: [], log: [] };
  let seq = 1;
  const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  st.fetch = async function (url, init) {
    init = init || {}; const met = (init.method || 'GET').toUpperCase(); const u = String(url);
    st.log.push(met + ' ' + u);
    if (u.includes('/index.html')) return resp(200, html);
    if (u.includes('/storage/v1/object/') && met === 'POST') return resp(200, { Key: 'x' });
    if (u.includes('/rest/v1/requisiciones')) {
      const q = new URL(u).searchParams; const f = {};
      for (const [k, v] of q) if (v.startsWith('eq.')) f[k] = decodeURIComponent(v.slice(3));
      const est = q.get('estado'); const ests = est && est.startsWith('in.(') ? est.slice(4, -1).split(',') : null;
      if (met === 'GET') return resp(200, st.requisiciones.filter((r) => Object.keys(f).every((k) => String(r[k]) === String(f[k])) && (!ests || ests.includes(r.estado))));
      if (met === 'POST') { const fila = JSON.parse(init.body); fila.id = 'req-' + (seq++); st.requisiciones.push(fila); return resp(201, [fila]); }
    }
    if (u.includes('/rpc/')) return resp(200, []);
    throw new Error('URL no contemplada: ' + met + ' ' + u);
  };
  return st;
}
function fresco() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions')) delete require.cache[k]; });
  return { crear: require(path.join(RAIZ, 'netlify/functions/requisicion-crear.js')).handler, resolver: require(path.join(RAIZ, 'netlify/functions/_lib/precio-zona.js')).resolverPrecioVenta };
}
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]).toString('base64');
const ev = (b) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx' }, body: JSON.stringify(b) });

(async function () {
  console.log('══ mide:req-codigo-1 · el código llega a la requisición ══\n');
  // Premisa: un evento PLUS vendible del catálogo real, preguntándole al dueño.
  let red = redNueva(INDEX_REAL); global.fetch = red.fetch; let H = fresco();
  const EV = await require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js')).fetchEventosRaw();
  let caso = null;
  for (const e of EV || []) {
    if (!e || !Array.isArray(e.zonas) || (e.multifecha && e.multifecha.length)) continue;
    for (const z of e.zonas) {
      const r = await H.resolver({ evento_id: e.id, paquete: 'plus', zona: z.n, num_personas: 2, transporte_cost: 0 }).catch(() => null);
      if (r && r.ok && r.total > 1000) { caso = { ev: e.id, zona: z.n, r }; break; }
    }
    if (caso) break;
  }
  if (!caso) { console.log('✗ sin caso vendible — NADA MEDIDO'); process.exit(1); }
  console.log(`  premisa: ${caso.ev}/«${caso.zona}» PLUS ×2 = $${caso.r.total}\n`);
  const html = indexConCodigos(caso.ev);
  const base = (extra) => Object.assign({ web: '', evento_id: caso.ev, paquete: 'plus', zona: caso.zona, num_personas: 2, hotel: null, cotizacion_texto: 'x', nombre: 'Cliente Arnés', celular: '8991112233', correo: 'arnes@prueba.mx', forma_pago: 'transferencia', comprobante_base64: JPEG }, extra || {});
  async function correr(cuerpo, previas) {
    red = redNueva(html); (previas || []).forEach((p) => red.requisiciones.push(p)); global.fetch = red.fetch; H = fresco();
    const r = await H.crear(ev(cuerpo)); return { r, j: JSON.parse(r.body), fila: red.requisiciones.find((x) => x.id && x.id.startsWith('req-')) };
  }

  let t = await correr(base());
  af(t.r.statusCode === 200 && t.fila && t.fila.codigo == null && t.fila.descuento == null && t.fila.total_sistema === caso.r.total, '[A1] sin código: igual que siempre (total del dueño, sin código ni descuento)');

  t = await correr(base({ codigo: 'pruebauna' }));
  af(t.r.statusCode === 200 && t.fila && t.fila.codigo === 'PRUEBAUNA', '[B1] el código viaja (en mayúsculas)');
  af(t.fila && t.fila.descuento === 400 && t.fila.total_sistema === caso.r.total - 400 && t.fila.total_lista === caso.r.total, `[B2] amount × personas: $200 × 2 → total $${t.fila && t.fila.total_sistema} (lista $${caso.r.total})`);
  af(t.fila && t.fila.separo_sistema === caso.r.separo, '[B3] el separo NO cambia');

  t = await correr(base({ codigo: 'PRUEBAPCT' }));
  const esperadoPct = caso.r.total - Math.round(caso.r.total * 10 / 100);
  af(t.fila && t.fila.total_sistema === esperadoPct, `[B4] pct: 10% → $${t.fila && t.fila.total_sistema} (esperado $${esperadoPct}, la aritmética de calcular())`);

  // 🔒 maxUsos en el SERVIDOR
  const viva = { id: 'vieja-1', codigo: 'PRUEBAUNA', estado: 'pendiente', celular: '8000000000', correo: 'otra@x.mx', evento_id: caso.ev };
  t = await correr(base({ codigo: 'PRUEBAUNA' }), [viva]);
  af(t.r.statusCode === 409 && t.j.codigo_invalido && !t.fila, '[C1] 🔒 tope de usos 1 con una viva → 409 y NO nace la requisición');
  t = await correr(base({ codigo: 'PRUEBAUNA' }), [Object.assign({}, viva, { estado: 'rechazada' })]);
  af(t.r.statusCode === 200 && t.fila && t.fila.codigo === 'PRUEBAUNA', '[C2] una RECHAZADA no cuenta: el código sigue disponible');
  // singleUse por persona
  t = await correr(base({ codigo: 'PRUEBAYO' }), [{ id: 'v2', codigo: 'PRUEBAYO', estado: 'aprobada', celular: '8991112233', correo: 'otro@x.mx', evento_id: caso.ev }]);
  af(t.r.statusCode === 409 && /ya usaste/.test(t.j.error), '[C3] 🔒 singleUse: la misma persona (mismo celular) no lo usa dos veces');
  t = await correr(base({ codigo: 'PRUEBAYO' }), [{ id: 'v3', codigo: 'PRUEBAYO', estado: 'aprobada', celular: '8000000001', correo: 'otro@x.mx', evento_id: caso.ev }]);
  af(t.r.statusCode === 200, '[C4] singleUse: otra persona sí puede');

  // Reglas de validarPromo
  t = await correr(base({ codigo: 'PRUEBAOTRO' }));
  af(t.r.statusCode === 409 && /no aplica para este evento/.test(t.j.error) && !t.fila, '[D1] código de otro evento → 409 con la razón');
  t = await correr(base({ codigo: 'PRUEBAVIEJO' }));
  af(t.r.statusCode === 409 && /expir/.test(t.j.error), '[D2] código vencido → 409');
  t = await correr(base({ codigo: 'PRUEBANOPKG' }));
  af(t.r.statusCode === 409 && /PLUS/.test(t.j.error), '[D3] paquete excluido → 409');
  t = await correr(base({ codigo: 'NOEXISTE123' }));
  af(t.r.statusCode === 409 && /no es válido/.test(t.j.error), '[D4] código inexistente → 409');

  // Pantallas
  const idx = INDEX_REAL;
  af(/codigo:\(typeof _promoActivo!=='undefined'&&_promoActivo&&_promoActivo\.code\)/.test(idx), '[E1] el index manda el código activo en la requisición');
  const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
  af(/r\.codigo \? `<i[^`]*🎟/.test(kh), '[E2] la bandeja pinta «🎟 CÓDIGO −$X (lista $Y)» junto al total');

  console.log(`\n${rojos ? '🔴 ROJO' : '✅ VERDE'} · ${verdes} en verde · ${rojos} en rojo`);
  process.exitCode = rojos ? 1 : 0;
})().catch((e) => { console.log('✗ el arnés se cayó: ' + e.stack); process.exitCode = 1; });
