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
  if (u.includes('api.resend.com')) { const b = JSON.parse(init.body); (DB.correos = DB.correos || []).push(b); return resp(200, { id: 'em_' + DB.correos.length }); }
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u-roshi', activo: true, rol: 'maestro_roshi' }]);
  if (u.includes('/rest/v1/abonos_viajero')) { const vid = eq(u, 'viajero_id'); return resp(200, (DB.abonos || []).filter((a) => !vid || a.viajero_id === vid)); }
  if (u.includes('/rest/v1/viajeros_evento')) { const id = eq(u, 'id'); return resp(200, DB.v.filter((v) => !id || v.id === id)); }
  if (u.includes('/rest/v1/cambios_viajero')) {
    if (m === 'PATCH') {
      const id = eq(u, 'id'), est = eq(u, 'estado'); const b = JSON.parse(init.body);
      const f = DB.c.filter((c) => c.id === id && (!est || c.estado === est)); f.forEach((c) => Object.assign(c, b)); return resp(200, f);
    }
    if (m === 'POST') {
      const b = JSON.parse(init.body);
      if (b.tipo === 'paquete' && DB.c.some((c) => c.viajero_id === b.viajero_id && c.tipo === 'paquete' && c.estado === 'pendiente')) return resp(409, { code: '23505' });
      const fila = Object.assign({ id: U(900 + DB.c.length), estado: 'pendiente' }, b); DB.c.push(fila); return resp(201, [fila]);
    }
    let f = DB.c.slice();
    const idf = eq(u, 'id'); if (idf) f = f.filter((c) => c.id === idf);   // [PAQ-SOLO-APLICAR-1] un GET por id trae ESA fila, como PostgREST
    const vid = eq(u, 'viajero_id'); if (vid) f = f.filter((c) => c.viajero_id === vid);
    const t = eq(u, 'tipo'); if (t) f = f.filter((c) => c.tipo === t);
    const e = eq(u, 'estado'); if (e) f = f.filter((c) => c.estado === e);
    return resp(200, f);
  }
  return resp(200, []);
};
const semilla = () => ({ c: [], v: [
    // [PORTAL-SOLO-1] Las filas del fixture nacen SELLADAS: desde el 27-oct el Portal solo toca lo revisado (la fila sin sello es 404, medido en mide:portal-solo-1). El arnés se actualiza a la verdad nueva.
  { id: U(1), portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'nsqkmty', nombre: 'Ana Pérez', correo: 'ana@correo.mx', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas' },
  { id: U(2), portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'nsqkmty', nombre: 'Ya Eligió', correo: 'ana@correo.mx', tipo_paquete: 'plus', zona_boleto: 'Oro' },
  { id: U(3), portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'nsqkmty', nombre: 'Otra', correo: 'otra@x.mx', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas' },
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

  console.log('\n[C] la respuesta va por CORREO y al Portal (PREVENTA-PORTAL-2)');
  process.env.JWT_SECRET = 'secreto-de-arnes'; process.env.RESEND_API_KEY = 're_falso'; process.env.CORREOS_MODO = 'real';
  const HR = require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const tok = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'memo@x.mx', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
  const bandeja = async (b) => { const x = await HR({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(b) }); return { s: x.statusCode, j: JSON.parse(x.body) }; };
  // Bulma ya aplicó el paquete (viajero_elegir_paquete): la fila quedó en STAY General, total 4800, y trae su abono de $300.
  Object.assign(DB.v[0], { tipo_paquete: 'stay', zona_boleto: 'General', total_contrato: 4800, abonado_previo: 0 });
  DB.abonos = [{ viajero_id: U(1), monto: 300 }];
  DB.correos = [];
  r = await bandeja({ accion: 'cambio_cerrar', id: DB.c[0].id, estado: 'atendida', respuesta: 'Paquete aplicado' });
  const cOk = DB.correos[0] || {};
  af(r.s === 200 && r.j.correo && r.j.correo.ok && DB.correos.length === 1, () => 'atendida → UN correo al cliente · ' + JSON.stringify(r.j.correo));
  af(cOk.to && cOk.to[0] === 'ana@correo.mx' && /confirmado/i.test(cOk.subject), () => 'va a SU correo con «confirmado» en el asunto: ' + cOk.subject);
  af(/\$4,800/.test(cOk.html) && /\$300/.test(cOk.html) && /\$4,500/.test(cOk.html), 'el correo dice total $4,800 · pagado $300 · te falta $4,500 (saldoMigrado, no tecleado)');
  af(/conectareynosa\.mx\/portal/.test(cOk.html) && !/WhatsApp/i.test(cOk.html), 'el correo manda al Portal y no dice «por WhatsApp»');
  // Rechazo de una segunda elección: el motivo viaja TAL CUAL por correo y el Portal lo pinta.
  Object.assign(DB.v[2], { correo: 'otra@x.mx' });
  DB.c.push({ id: U(950), viajero_id: U(3), evento_id: 'nsqkmty', correo: 'otra@x.mx', nombre: 'Otra', tipo: 'paquete', detalle: 'x', estado: 'pendiente', paquete_pedido: 'plus', zona_pedida: 'Platino' });
  DB.correos = [];
  r = await bandeja({ accion: 'cambio_cerrar', id: U(950), estado: 'rechazada', respuesta: 'Platino ya no tiene lugar, prueba Oro' });
  const cNo = DB.correos[0] || {};
  af(r.s === 200 && DB.correos.length === 1 && /Platino ya no tiene lugar, prueba Oro/.test(cNo.html) && cNo.to[0] === 'otra@x.mx', 'rechazada → correo con el motivo escrito por el equipo');
  USER = { email: 'otra@x.mx', email_confirmed_at: 'x' };
  r = await llamar({ accion: 'opciones_paquete', viajero_id: U(3) });
  af(r.s === 200 && r.j.rechazada && /Platino ya no tiene lugar/.test(r.j.rechazada.respuesta) && r.j.paquetes.length, 'el Portal recibe la elección rechazada CON su motivo y vuelve a ofrecer opciones');
  // [PAQ-SOLO-APLICAR-1] El caso de Monserrat (28-oct): cerrar «atendida» una
  // elección de paquete SIN aplicarla. Con el viajero aún en preventa → 409,
  // la solicitud sigue pendiente y NO sale el «tu paquete quedó confirmado».
  Object.assign(DB.v[2], { tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas' });
  DB.c.push({ id: U(952), viajero_id: U(3), evento_id: 'nsqkmty', correo: 'otra@x.mx', nombre: 'Otra', tipo: 'paquete', detalle: 'x', estado: 'pendiente', paquete_pedido: 'plus', zona_pedida: 'General' });
  DB.correos = [];
  r = await bandeja({ accion: 'cambio_cerrar', id: U(952), estado: 'atendida', respuesta: 'paso a habitacion cuadruple' });
  af(r.s === 409 && DB.correos.length === 0 && DB.c.find((c) => c.id === U(952)).estado === 'pendiente', () => 'paquete sin aplicar NO se cierra como atendida (409, sigue pendiente, cero correos) · ' + r.s);
  r = await bandeja({ accion: 'cambio_cerrar', id: U(952), estado: 'rechazada', respuesta: 'Ya no hay General, elige otra zona' });
  af(r.s === 200, '«No procede» con motivo sí cierra una elección sin aplicar');
  DB.correos = [];
  DB.c.push({ id: U(951), viajero_id: U(3), evento_id: 'nsqkmty', correo: 'otra@x.mx', tipo: 'zona', detalle: 'cambio de zona', estado: 'pendiente' });
  r = await bandeja({ accion: 'cambio_cerrar', id: U(951), estado: 'atendida' });
  af(r.s === 200 && DB.correos.length === 0 && r.j.correo === null, 'un cambio que NO es de paquete se cierra sin correo (sin cambios a PORTAL-EDIT-1)');
  const ac = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');
  af(/enviar: body\.contrato_sin_correo !== true/.test(ac) && /contrato_sin_correo: true/.test(fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8')), 'desde la bandeja el contrato nace SIN su propio correo: un aviso por decisión');
  af(!/por WhatsApp/.test(fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8').slice(fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8').indexOf('function _migPaqHtml('), fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8').indexOf('async function _paqEnviar('))), 'el wizard del Portal ya no promete WhatsApp');

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
