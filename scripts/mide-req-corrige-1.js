#!/usr/bin/env node
/* =============================================================================
 * mide:req-corrige-1 — [REQ-CORRIGE-1] «🔁 Corregir y aprobar» (31-oct-2026)
 *
 * Palabra de Memo: cuando no hay lugar en la zona/fecha que pidió, se le
 * acomoda en lo que SÍ hay desde la bandeja, sin que vuelva a meter la
 * solicitud, y le llega el correo de siempre con el ajuste dicho.
 *   [O] correccion_opciones: lo vendible por fecha, el cupo del Palacio, CERO escrituras
 *   [R] rebotes ANTES de reclamar: otro evento · zona inexistente · sin cupo ·
 *       habitación que no vale · sin motivo · igual a lo pedido → cero escrituras
 *   [V] aprobar CORREGIDA: el viajero nace donde se corrigió; la solicitud
 *       conserva lo que pidió y guarda antes/después/motivo; el total sugerido
 *       es el del DUEÑO (_calcularPrecio), preguntado aparte por el arnés
 *   [G] regresión: aprobar sin corrección no cambia
 *   [E] el correo: el bloque del ajuste sale solo con `cambio`; sin él, el
 *       render es BYTE A BYTE el de HEAD
 *   [P] la pantalla: body.correccion por el HECHO (vm con DOM falso)
 *
 * ⚠️ SIN ANCLA a propósito (árbol de trabajo, como mide:req-b1): sus controles
 * positivos son por construcción.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let V = 0, R = 0; const rojos = [];
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; rojos.push(msg); console.log('  ✗ ' + msg); }
}

process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
process.env.PORTAL_SUPABASE_URL = 'https://portal.falso.test';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'portal-falsa';
process.env.RESEND_API_KEY = 're_falsa';
process.env.JWT_SECRET = 'secreto-del-arnes';

const INDEX_HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const UUID = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

// ── LA RED FALSA (la forma de mide:req-b1: estado + filtros respetados) ─────
function redNueva(opts) {
  opts = opts || {};
  const st = {
    requisiciones: (opts.requisiciones || []).map((r) => Object.assign({}, r)),
    viajeros: (opts.viajeros || []).map((r) => Object.assign({}, r)),
    abonos: (opts.abonos || []).map((r) => Object.assign({}, r)),
    uploads: [], firmas: [], log: [], correos: [],
  };
  let seq = 100;
  function resp(status, body) {
    return { ok: status >= 200 && status < 300, status,
      json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  }
  function filtros(url) {
    const u = new URL(url); const f = {};
    for (const [k, v] of u.searchParams) {
      if (typeof v === 'string' && v.startsWith('eq.')) f[k] = decodeURIComponent(v.slice(3));
    }
    return f;
  }
  const casa = (rows, f) => rows.filter((r) => Object.keys(f).every((k) => String(r[k]) === String(f[k])));
  st.fetch = async function (url, init) {
    init = init || {};
    const met = (init.method || 'GET').toUpperCase();
    const u = String(url);
    st.log.push(met + ' ' + u);
    if (u.includes('/index.html') || /conectareynosa\.mx\/?$/.test(u)) return resp(200, INDEX_HTML);
    // Auth del Portal (el JWT del cliente).
    if (u.includes('/auth/v1/user')) return resp(200, { email: opts.correoCliente || 'cliente@x.com', email_confirmed_at: '2026-01-01T00:00:00Z' });
    // Storage: firmar y subir.
    let m = u.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
    if (m) {
      const pathPedido = decodeURI(m[2]);
      st.firmas.push({ bucket: m[1], path: pathPedido });
      // Firmar un objeto inexistente es 404, como el storage real.
      const existe = st.abonos.some((a) => a.foto_path === pathPedido) || st.uploads.some((x) => x.path === pathPedido) || (opts.objetos || []).includes(pathPedido);
      if (!existe) return resp(404, { error: 'Object not found' });
      return resp(200, { signedURL: '/object/sign/' + m[1] + '/' + m[2] + '?token=firmado' });
    }
    m = u.match(/\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (m && met === 'POST') { st.uploads.push({ bucket: m[1], path: decodeURI(m[2]) }); return resp(200, { Key: m[2] }); }
    // rest/v1 con estado y filtros.
    const tabla = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
    if (tabla === 'requisiciones') {
      const f = filtros(u);
      if (met === 'GET') return resp(200, casa(st.requisiciones, f));
      if (met === 'PATCH') { const rows = casa(st.requisiciones, f); rows.forEach((r) => Object.assign(r, JSON.parse(init.body))); return resp(200, rows.map((r) => Object.assign({}, r))); }
    }
    if (tabla === 'viajeros_evento') {
      const f = filtros(u);
      if (met === 'GET') return resp(200, casa(st.viajeros, f));
      if (met === 'POST') {
        const cuerpo = JSON.parse(init.body);
        const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((x) => Object.assign({ id: x.id || UUID(seq++) }, x));
        filas.forEach((x) => st.viajeros.push(x));
        return resp(201, filas);
      }
      if (met === 'PATCH') { const rows = casa(st.viajeros, f); rows.forEach((r) => Object.assign(r, JSON.parse(init.body))); return resp(200, rows.map((r) => Object.assign({}, r))); }
    }
    if (tabla === 'abonos_viajero') {
      const f = filtros(u);
      if (met === 'GET') return resp(200, casa(st.abonos, f));
      if (met === 'POST') {
        const cuerpo = JSON.parse(init.body);
        const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((x) => Object.assign({ id: x.id || UUID(seq++) }, x));
        filas.forEach((x) => st.abonos.push(x));
        return resp(201, filas);
      }
    }
    // Satélites que las libs tocan fail-soft (contratos, bitácoras, revisiones):
    // contestan vacío — sus propias tuercas ya los carean; aquí no son el sujeto.
    if (tabla === 'compras' && met === 'GET') { const f = filtros(u); return resp(200, casa(opts.compras || [], f)); }
    if (tabla === 'solicitudes_tour' && met === 'GET') return resp(200, []);
    if (['contratos_cliente', 'invitaciones_portal', 'portal_revisiones', 'cambios_viajero', 'stock_ajustes', 'clientes', 'grupos_whatsapp'].includes(tabla)) {
      if (met === 'GET') return resp(200, []);
      if (met === 'POST') return resp(201, [Object.assign({ id: UUID(seq++) }, JSON.parse(init.body || '{}'))]);
      if (met === 'PATCH') return resp(200, []);
    }
    if (u.includes('api.resend.com')) { st.correos.push(JSON.parse(init.body || '{}')); return resp(200, { id: 'em_falso' }); }
    if (u.includes('/rest/v1/usuarios') || u.includes('sesion')) throw new Error('sesion-viva apagada en el arnés (fail-open)');
    throw new Error('la red falsa no entiende: ' + met + ' ' + u);
  };
  return st;
}

function frescos() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return {
    admin: require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler,
    jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
  };
}
function evento(body, token) {
  return { httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + token }, body: JSON.stringify(body) };
}
// Pidió fuerzaregida#1 PLUS «Barrera» (AGOTADA en la ficha), 2 personas.
function reqBase(extra) {
  return Object.assign({
    id: UUID(1), folio: 'R-CORR1', evento_id: 'fuerzaregida#1', evento_nombre: 'Fuerza Regida',
    paquete: 'plus', zona: 'Barrera', num_personas: 2, hotel: 'Compartida (4 personas)',
    nombre: 'Clienta Prueba', celular: '8991234567', correo: 'cliente@x.com',
    forma_pago: 'transferencia', total_sistema: 11000, separo_sistema: 600,
    comprobante_path: 'req/R-CORR1/x.jpg', comprobante_tipo: 'image/jpeg', estado: 'pendiente',
    acompanantes: null, desglose: null, talla_playera: null, num_emergencia: null, transporte: null,
  }, extra || {});
}
const escrituras = (red) => red.log.filter((l) => /^(POST|PATCH|DELETE) .*\/rest\/v1\//.test(l)).length;

(async function main() {
  console.log('══ mide:req-corrige-1 · corregir y aprobar ══');
  let H = frescos();
  const jw = H.jwtSign({ id: 'u-bulma', rol: 'bulma', correo: 'bulma@conecta.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  // El dueño, preguntado POR SEPARADO (el arnés no repite la cuenta).
  global.fetch = redNueva().fetch;
  const CI = require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
  const EV = await CI.fetchEventosRaw(); const HOT = await CI.fetchHotelesGlobales();
  const PZ = require(path.join(RAIZ, 'netlify/functions/_lib/precio-zona.js'));
  const fr = EV.find((e) => e.id === 'fuerzaregida');
  const due = PZ._calcularPrecio(fr, { hoteles: HOT, paquete: 'plus', zona: 'Oro', hotel_nombre: 'Doble', num_personas: 2, transporte_cost: 0, fecha_idx: 2, hoyISO: PZ.hoyMx() });
  af(due && due.ok && due.total > 0, 'premisa: el dueño cotiza fr#2 PLUS Oro Doble ×2 (' + (due && due.total) + ')');

  // ════ [O] opciones ════
  console.log('\n── [O] correccion_opciones ──');
  const COMPRAS = [{ evento_id: 'fuerzaregida#2', zona: 'Luneta', cantidad: 1, costo_unitario: 1775 }];
  let red = redNueva({ requisiciones: [reqBase()], compras: COMPRAS });
  global.fetch = red.fetch; H = frescos();
  let r = await H.admin(evento({ accion: 'correccion_opciones', id: UUID(1) }, jw));
  let j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok, 'O1 200 (fue ' + r.statusCode + ' ' + (j.error || '') + ')');
  af(j.pidio && j.pidio.zona === 'Barrera' && j.pidio.evento_id === 'fuerzaregida#1', 'O1 dice lo que PIDIÓ');
  af(Array.isArray(j.fechas) && j.fechas.length === 4 && j.evento && j.evento.evento_id === 'fuerzaregida#1', 'O1 las 4 fechas vivas; arranca en la que pidió');
  const plus1 = (j.paquetes || []).find((p) => p.paquete === 'plus');
  af(plus1 && !plus1.zonas.some((z) => z.zona === 'Barrera'), 'O1 Barrera (agotada en la ficha) NO se ofrece');
  const habs = (j.habitaciones || []).map((h) => h.nombre);
  af(habs.includes('Doble') && !habs.includes('Individual'), 'O1 habitaciones para 2: Doble sí, Individual no (viaj del dueño)');
  af(escrituras(red) === 0, 'O1 CERO escrituras');
  r = await H.admin(evento({ accion: 'correccion_opciones', id: UUID(1), evento_id: 'fuerzaregida#2' }, jw));
  j = JSON.parse(r.body);
  const zonas2 = ((j.paquetes || []).find((p) => p.paquete === 'plus') || { zonas: [] }).zonas;
  const lun = zonas2.find((z) => z.zona === 'Luneta');
  af(lun && lun.gestionada && lun.quedan === 1 && lun.sin_cupo === true, 'O2 Luneta #2 con 1 comprado: quedan 1 → SIN CUPO para 2 (el Palacio decide)');
  const oro = zonas2.find((z) => z.zona === 'Oro');
  af(oro && oro.gestionada === false && oro.quedan === null && !oro.sin_cupo, 'O2 Oro sin pedido: quedan null (no un cero inventado)');
  r = await H.admin(evento({ accion: 'correccion_opciones', id: UUID(1), evento_id: 'fuerzaregida#2', paquete: 'plus', zona: 'Oro', hotel: 'Doble' }, jw));
  j = JSON.parse(r.body);
  af(j.eleccion && j.eleccion.hotel_tipo === 'Doble' && j.total_sugerido === Math.round(due.total), 'O3 la elección completa trae el total del DUEÑO (' + j.total_sugerido + ' = ' + (due && due.total) + ')');
  af(escrituras(red) === 0, 'O3 y sigue en CERO escrituras');

  // ════ [R] rebotes ════
  console.log('\n── [R] rebotes antes de reclamar ──');
  const casos = [
    ['otro evento', { evento_id: 'karolg#0', paquete: 'plus', zona: 'Oro', hotel: 'Doble', motivo: 'no habia' }, 400],
    ['zona inexistente', { evento_id: 'fuerzaregida#2', paquete: 'plus', zona: 'Zona Inventada', hotel: 'Doble', motivo: 'no habia' }, 409],
    ['zona sin cupo', { evento_id: 'fuerzaregida#2', paquete: 'plus', zona: 'Luneta', hotel: 'Doble', motivo: 'no habia' }, 409],
    ['habitación que no vale para 2', { evento_id: 'fuerzaregida#2', paquete: 'plus', zona: 'Oro', hotel: 'Individual', motivo: 'no habia' }, 409],
    ['sin motivo', { evento_id: 'fuerzaregida#2', paquete: 'plus', zona: 'Oro', hotel: 'Doble', motivo: '' }, 400],
    ['lo pedido agotado', { evento_id: 'fuerzaregida#1', paquete: 'plus', zona: 'Barrera', hotel: 'Compartida (4 personas)', motivo: 'igual' }, 409],
  ];
  for (const [nom, c, cod] of casos) {
    red = redNueva({ requisiciones: [reqBase()], compras: COMPRAS }); global.fetch = red.fetch; H = frescos();
    r = await H.admin(evento({ accion: 'aprobar', id: UUID(1), monto: 600, total_contrato: 11000, correccion: c }, jw));
    j = JSON.parse(r.body);
    af(r.statusCode === cod && escrituras(red) === 0 && red.requisiciones[0].estado === 'pendiente' && red.viajeros.length === 0,
      `R ${nom} → ${cod} sin escribir nada (fue ${r.statusCode}: ${j.error || ''})`);
  }
  red = redNueva({ requisiciones: [reqBase({ zona: 'Cancha VIP' })] }); global.fetch = red.fetch; H = frescos();
  r = await H.admin(evento({ accion: 'aprobar', id: UUID(1), monto: 600, total_contrato: 11000, correccion: { evento_id: 'fuerzaregida#1', paquete: 'plus', zona: 'Cancha VIP', hotel: 'Compartida (4 personas)', motivo: 'igual' } }, jw));
  j = JSON.parse(r.body);
  af(r.statusCode === 400 && /igual a lo que pidió/.test(j.error || '') && escrituras(red) === 0, 'R igual a lo pedido (vendible) → 400 «usa Aprobar normal», cero escrituras');

  // ════ [V] aprobar corregida ════
  console.log('\n── [V] aprobar CORREGIDA ──');
  red = redNueva({ requisiciones: [reqBase()], compras: COMPRAS, objetos: ['req/R-CORR1/x.jpg'] }); global.fetch = red.fetch; H = frescos();
  const MOTIVO = 'Ya no había Barrera el 12; te acomodamos en Oro el 15.';
  r = await H.admin(evento({ accion: 'aprobar', id: UUID(1), monto: 600, correccion: { evento_id: 'fuerzaregida#2', paquete: 'plus', zona: 'Oro', hotel: 'Doble', motivo: MOTIVO } }, jw));
  j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok, 'V1 200 (fue ' + r.statusCode + ' ' + (j.error || '') + ')');
  const v = red.viajeros[0] || {};
  af(red.viajeros.length === 1 && v.evento_id === 'fuerzaregida#2' && v.tipo_paquete === 'plus' && v.zona_boleto === 'Oro' && v.hotel_tipo === 'Doble', 'V1 el viajero nace en fr#2 · plus · Oro · Doble');
  af(v.total_contrato === Math.round(due.total), 'V1 sin total tecleado, el contrato = el total del DUEÑO (' + v.total_contrato + ')');
  af(/CORREGIDA al aprobar/.test(v.notas || '') && (v.notas || '').includes(MOTIVO), 'V1 la nota del viajero dice la corrección y su motivo');
  const rq = red.requisiciones[0];
  af(rq.estado === 'aprobada' && rq.evento_id === 'fuerzaregida#1' && rq.zona === 'Barrera', 'V1 la solicitud CONSERVA lo que pidió (no se pisa)');
  af(rq.correccion && rq.correccion.antes.zona === 'Barrera' && rq.correccion.despues.zona === 'Oro' && rq.correccion.despues.evento_id === 'fuerzaregida#2' && rq.correccion.motivo === MOTIVO && rq.correccion.por === 'Bulma' && rq.correccion.despues.total === v.total_contrato, 'V1 `correccion` guarda antes/después/motivo/quién/total');
  af(red.abonos.length === 1 && red.abonos[0].monto === 600, 'V1 el abono de siempre ($600)');
  const corr = red.correos.find((c) => /Hubo un ajuste/.test(c.html || ''));
  af(!!corr, 'V1 salió el correo de confirmación CON el bloque del ajuste (' + red.correos.length + ' correos)');
  af(corr && corr.html.includes('Oro') && corr.html.includes('Barrera') && corr.html.includes('15 ene') && corr.html.includes('Ya no había Barrera'), 'V1 el correo dice qué pidió, dónde quedó, la fecha nueva y el motivo');
  red = redNueva({ requisiciones: [reqBase()], compras: COMPRAS }); global.fetch = red.fetch; H = frescos();
  r = await H.admin(evento({ accion: 'aprobar', id: UUID(1), monto: 600, total_contrato: 12345, correccion: { evento_id: 'fuerzaregida#2', paquete: 'plus', zona: 'Oro', hotel: 'Doble', motivo: MOTIVO } }, jw));
  af(r.statusCode === 200 && red.viajeros[0] && red.viajeros[0].total_contrato === 12345 && red.requisiciones[0].correccion.despues.total === 12345, 'V2 el total TECLEADO manda sobre el sugerido');

  // ════ [G] regresión ════
  console.log('\n── [G] aprobar sin corrección ──');
  red = redNueva({ requisiciones: [reqBase({ zona: 'Cancha VIP' })] }); global.fetch = red.fetch; H = frescos();
  r = await H.admin(evento({ accion: 'aprobar', id: UUID(1), monto: 600, total_contrato: 11000 }, jw));
  af(r.statusCode === 200 && red.viajeros[0] && red.viajeros[0].evento_id === 'fuerzaregida#1' && red.viajeros[0].zona_boleto === 'Cancha VIP' && red.viajeros[0].hotel_tipo === 'Compartida', 'G1 nace donde pidió, como siempre');
  af(!('correccion' in red.requisiciones[0]) && !red.correos.some((c) => /Hubo un ajuste/.test(c.html || '')), 'G1 sin `correccion` y el correo SIN bloque de ajuste');

  // ════ [E] el render ════
  console.log('\n── [E] el correo ──');
  {
    const CC = require(path.join(RAIZ, 'netlify/functions/_lib/correo-confirmacion.js'));
    const tmp = path.join(require('os').tmpdir(), 'cc-head-' + process.pid);
    fs.mkdirSync(tmp + '/_lib', { recursive: true });
    for (const f of fs.readdirSync(path.join(RAIZ, 'netlify/functions/_lib'))) {
      let buf;
      try { buf = execSync('git -C "' + RAIZ + '" show HEAD:netlify/functions/_lib/' + f, { stdio: ['ignore', 'pipe', 'ignore'] }); }
      catch (_) { buf = fs.readFileSync(path.join(RAIZ, 'netlify/functions/_lib', f)); }
      fs.writeFileSync(tmp + '/_lib/' + f, buf);
    }
    const CCH = require(tmp + '/_lib/correo-confirmacion.js');
    const arg = { tipo: 'reserva', correo: 'x@y.com', ev: fr, evento_id: 'fuerzaregida#2', nombres: ['Ana', 'Beto'], recibido: 600, total: 13000, resta: 12400, portal: 'nuevo', grupo: null };
    af(CC.renderConfirmacion(arg).html === CCH.renderConfirmacion(arg).html, 'E1 sin `cambio`, el render es BYTE A BYTE el de HEAD');
    af(CC.renderConfirmacion(Object.assign({}, arg, { cambio: { antes: {}, despues: {}, motivo: 'x' } })).html !== CCH.renderConfirmacion(arg).html, 'E1-ctrl con `cambio` el render SÍ cambia (la igualdad de arriba dice algo)');
    const c2 = CC.renderConfirmacion(Object.assign({}, arg, { cambio: { antes: { evento_id: 'fuerzaregida#1', paquete: 'plus', zona: 'Barrera', hotel: 'Compartida (4 personas)' }, despues: { evento_id: 'fuerzaregida#2', paquete: 'plus', zona: 'Oro', hotel: 'Doble' }, motivo: 'No había <Barrera>' } }));
    af(/Hubo un ajuste/.test(c2.html) && c2.html.includes('&lt;Barrera&gt;') && !c2.html.includes('<Barrera>'), 'E2 con `cambio`: bloque presente y el motivo ESCAPADO');
    af(/12 ene/.test(c2.html) && /15 ene/.test(c2.html), 'E2 cambió la fecha: dice las DOS (12 → 15)');
    const c3 = CC.renderConfirmacion(Object.assign({}, arg, { evento_id: 'fuerzaregida#1', cambio: { antes: { evento_id: 'fuerzaregida#1', paquete: 'plus', zona: 'Barrera' }, despues: { evento_id: 'fuerzaregida#1', paquete: 'plus', zona: 'Cancha VIP' }, motivo: 'x' } }));
    const bloque = (c3.html.match(/Hubo un ajuste[\s\S]*?<\/table>/) || [''])[0];
    af(bloque && !/ ene/.test(bloque), 'E3 misma fecha: el bloque no repite fechas');
    af(/<td style="[^"]*color:#/.test(bloque), 'E3 celdas con color EXPLÍCITO (los clientes de correo no heredan)');
  }

  // ════ [P] pantalla ════
  console.log('\n── [P] la pantalla ──');
  {
    const SRC = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
    af(/accion: 'correccion_opciones'/.test(SRC), 'P1 la bandeja pide correccion_opciones');
    const llamadas = []; const els = {};
    const el = (id, v) => (els[id] = els[id] || { id, value: v || '', textContent: '', style: {}, disabled: false });
    const ctx = { console, setTimeout: () => {}, confirm: () => true, alert: () => {},
      document: { getElementById: (id) => els[id] || null, querySelectorAll: () => [] },
      khAdminFetch: async (u, o) => { llamadas.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ ok: true, viajeros: [{}], monto: 600 }) }; },
      loadRequisiciones: () => {}, loadCambiosPortal: () => {}, khPaqueteTexto: () => '', showToast: () => {}, currentUser: { rol: 'bulma' } };
    vm.createContext(ctx);
    vm.runInContext(SRC + '\n;this.__c=_reqCor;this.__ap=_reqBdjAprobar;this.__rows=_reqBdjRows;', ctx);
    const ID = 'q1'; ctx.__rows.push({ id: ID, comprobante_path: 'x', paquete: 'plus' });
    el('req-apr-monto-' + ID, '600'); el('req-apr-total-' + ID, '13000'); el('req-apr-zona-' + ID, 'Barrera'); el('req-apr-nota-' + ID, ''); el('req-apr-msg-' + ID); el('req-apr-go-' + ID);
    ctx.__c[ID] = { on: true, sel: { evento_id: 'fuerzaregida#2', paquete: 'plus', zona: '', hotel: '' }, motivo: 'm', op: { eleccion: null } };
    await ctx.__ap(ID);
    af(llamadas.length === 0 && /Termina de elegir/.test(els['req-apr-msg-' + ID].textContent), 'P2 corrección a medias: NO se llama al servidor y se DICE');
    ctx.__c[ID].op = { pidio: { evento_id: 'fuerzaregida#1', paquete: 'plus', zona: 'Barrera' }, eleccion: { evento_id: 'fuerzaregida#2', paquete: 'plus', zona: 'Oro', hotel: 'Doble' } };
    ctx.__c[ID].motivo = 'no había';
    await ctx.__ap(ID);
    const b = llamadas[0] || {};
    af(b.correccion && b.correccion.zona === 'Oro' && b.correccion.evento_id === 'fuerzaregida#2' && b.correccion.hotel === 'Doble' && b.correccion.motivo === 'no había' && !('zona' in b), 'P3 con elección completa viaja body.correccion y NO la zona vieja del input');
    delete ctx.__c[ID]; llamadas.length = 0;
    await ctx.__ap(ID);
    af(llamadas[0] && llamadas[0].zona === 'Barrera' && !llamadas[0].correccion, 'P4 control: sin corrección viaja la zona del input y nada más (regresión)');
  }

  console.log('\n══ ' + (R ? '🔴 ROJO' : '🟢 VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo ══');
  if (R) { rojos.forEach((m) => console.log('  ✗ ' + m)); process.exit(1); }
  if (!V) { console.log('NADA MEDIDO · esto NO es un verde'); process.exit(2); }
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(2); });
