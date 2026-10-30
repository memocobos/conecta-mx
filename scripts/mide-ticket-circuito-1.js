#!/usr/bin/env node
/* =============================================================================
 * mide:ticket-circuito-1 — [REQ-LINK-1 + ABONO-FOTO-2 + PORTAL-TICKET-1]
 * EL CIRCUITO DEL TICKET, de punta a punta. (30-oct-2026)
 *
 * Nació del caso Daniela (30-oct): una requisición `link_pago` —que por diseño
 * nace SIN comprobante: el cliente paga después en el link— se aprobó y nació
 * un abono de $300 que nadie pagó, con nota «comprobante verificado al
 * aprobar». Tres piezas:
 *   [A] REQ-LINK-1 · aprobar sin comprobante y sin monto NO inventa abonos
 *       (handler REAL de admin-requisiciones, red falsa con estado y filtros).
 *   [B] PORTAL-TICKET-1 · el cliente pide la URL firmada de SU comprobante
 *       (handler REAL de portal-viajero, doble filtro id+viajero).
 *   [C] Las pantallas, por el HECHO: el ➕ Abono de Capsule manda la foto, el
 *       historial del Portal pinta el 📎 solo con tiene_foto, y la bandeja no
 *       prellena el monto sin comprobante.
 *
 * ⚠️ SIN ANCLA a propósito (árbol de trabajo, como mide:req-b1): mide lo que
 * acabas de escribir; sus controles positivos son por construcción.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let V = 0, R = 0; const rojos = [];
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; rojos.push(msg); console.log('  ✗ ' + msg); }
}

process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
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
    uploads: [], firmas: [], log: [],
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
    if (['contratos_cliente', 'invitaciones_portal', 'portal_revisiones', 'cambios_viajero', 'stock_ajustes', 'compras'].includes(tabla)) {
      if (met === 'GET') return resp(200, []);
      if (met === 'POST') return resp(201, [Object.assign({ id: UUID(seq++) }, JSON.parse(init.body || '{}'))]);
      if (met === 'PATCH') return resp(200, []);
    }
    if (u.includes('api.resend.com')) return resp(200, { id: 'em_falso' });
    if (u.includes('/rest/v1/usuarios') || u.includes('sesion')) throw new Error('sesion-viva apagada en el arnés (fail-open)');
    throw new Error('la red falsa no entiende: ' + met + ' ' + u);
  };
  return st;
}

function frescos() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return {
    admin: require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler,
    portalViajero: require(path.join(RAIZ, 'netlify/functions/portal-viajero.js')).handler,
    jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
  };
}
function evento(body, token) {
  const headers = { origin: 'https://conectareynosa.mx' };
  if (token) headers.authorization = 'Bearer ' + token;
  return { httpMethod: 'POST', headers, body: JSON.stringify(body) };
}

// Una requisición pendiente VÁLIDA sobre el catálogo real (fuerzaregida#1,
// zona que la puerta acepta — si el catálogo de hoy la cerrara, la premisa
// de abajo lo diría con nombre en vez de pasar en vacío).
function reqBase(extra) {
  return Object.assign({
    id: UUID(1), folio: 'R-TICKET', evento_id: 'fuerzaregida#1', evento_nombre: 'Fuerza Regida',
    paquete: 'plus', zona: 'Cancha VIP', num_personas: 1, hotel: 'Compartida (4 personas)',
    nombre: 'Clienta Prueba', celular: '8991234567', correo: 'cliente@x.com',
    forma_pago: 'link_pago', total_sistema: 5900, separo_sistema: 300,
    comprobante_path: null, comprobante_tipo: null, estado: 'pendiente',
    acompanantes: null, desglose: null, talla_playera: null, num_emergencia: null, transporte: null,
  }, extra || {});
}

(async function main() {
  console.log('══ mide:ticket-circuito-1 · el circuito del ticket ══');

  // ════ [A] REQ-LINK-1 · el aprobar ya no inventa dinero ════════════════════
  console.log('\n── [A] aprobar link_pago sin comprobante ──');
  {
    // A1 · sin comprobante + sin monto → viajero SÍ, abono NO, y se DICE.
    let red = redNueva({ requisiciones: [reqBase()] });
    global.fetch = red.fetch;
    let H = frescos();
    // jwtSign EXIGE ttl (ses-1: sin exp no hay token) — la lección de req-b1.
    const jw = H.jwtSign({ id: 'u-bulma', rol: 'bulma', correo: 'bulma@conecta.mx' }, process.env.JWT_SECRET, 3600);
    let r = await H.admin(evento({ accion: 'aprobar', id: UUID(1), monto: 0, total_contrato: 5900 }, jw));
    let j = JSON.parse(r.body);
    af(r.statusCode === 200, `A1 aprobar sin comprobante y monto 0 → 200 (fue ${r.statusCode}: ${j.error || 'ok'})`);
    af(red.viajeros.length === 1, 'A1 el viajero SÍ nace (' + red.viajeros.length + ')');
    af(red.abonos.length === 0, 'A1 CERO abonos nacen — el dinero no se inventa (' + red.abonos.length + ')');
    af(typeof j.sin_abono === 'string' && j.sin_abono.includes('NO se registró'), 'A1 la respuesta DICE que no nació abono');
    // Control positivo del contador: una inserción inyectada SÍ se ve.
    await red.fetch('https://kh.falso.test/rest/v1/abonos_viajero', { method: 'POST', body: JSON.stringify({ viajero_id: UUID(9), monto: 1 }) });
    af(red.abonos.length === 1, 'A1-ctrl el contador de abonos VE una inserción inyectada (su cero dice algo)');

    // A2 · sin comprobante + monto TECLEADO (verificado por otro canal) → el
    // abono nace pero la nota NO miente «comprobante verificado».
    red = redNueva({ requisiciones: [reqBase({ id: UUID(2), folio: 'R-TICKE2', correo: 'otra@x.com', celular: '8990000001' })] });
    global.fetch = red.fetch;
    H = frescos();
    r = await H.admin(evento({ accion: 'aprobar', id: UUID(2), monto: 300, total_contrato: 5900 }, jw));
    j = JSON.parse(r.body);
    af(r.statusCode === 200, `A2 sin comprobante + monto tecleado → 200 (fue ${r.statusCode}: ${j.error || 'ok'})`);
    af(red.abonos.length === 1 && Number(red.abonos[0].monto) === 300, 'A2 el abono nace con el monto tecleado');
    af(red.abonos.length === 1 && /sin comprobante adjunto/.test(red.abonos[0].nota || ''), 'A2 la nota dice «sin comprobante adjunto»');
    af(red.abonos.length === 1 && !/comprobante verificado/.test(red.abonos[0].nota || ''), 'A2 la nota YA NO dice «comprobante verificado» (la mentira de Daniela)');
    af(red.abonos.length === 1 && red.abonos[0].foto_path == null, 'A2 sin foto_path (no hay comprobante que heredar)');

    // A3 · CON comprobante + monto 0 → 400 (la regla vieja sigue donde aplica).
    red = redNueva({ requisiciones: [reqBase({ id: UUID(3), folio: 'R-TICKE3', correo: 'tres@x.com', celular: '8990000002', forma_pago: 'transferencia', comprobante_path: 'req/R-TICKE3/x.jpg', comprobante_tipo: 'image/jpeg' })], objetos: ['req/R-TICKE3/x.jpg'] });
    global.fetch = red.fetch;
    H = frescos();
    r = await H.admin(evento({ accion: 'aprobar', id: UUID(3), monto: 0, total_contrato: 5900 }, jw));
    af(r.statusCode === 400, `A3 CON comprobante y monto 0 → 400 (fue ${r.statusCode})`);
    af(red.abonos.length === 0 && red.viajeros.length === 0, 'A3 y no nace nada');

    // A4 · CON comprobante + monto → regresión: nota «comprobante verificado»
    // y foto_path heredado, como siempre.
    r = await H.admin(evento({ accion: 'aprobar', id: UUID(3), monto: 300, total_contrato: 5900 }, jw));
    j = JSON.parse(r.body);
    af(r.statusCode === 200, `A4 con comprobante + monto → 200 (fue ${r.statusCode}: ${j.error || 'ok'})`);
    af(red.abonos.length === 1 && /comprobante verificado al aprobar/.test(red.abonos[0].nota || ''), 'A4 la nota de siempre sigue viva (regresión)');
    af(red.abonos.length === 1 && red.abonos[0].foto_path === 'req/R-TICKE3/x.jpg', 'A4 el foto_path se hereda, como siempre');
  }

  // El correo: con $0 no dice «Recibimos $0».
  {
    Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions')) delete require.cache[k]; });
    const { fetchEventosRaw } = require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
    global.fetch = redNueva().fetch;
    const EV = await fetchEventosRaw();
    const fr = EV.find((e) => e.id === 'fuerzaregida');
    const { renderConfirmacion } = require(path.join(RAIZ, 'netlify/functions/_lib/correo-confirmacion.js'));
    const r0 = renderConfirmacion({ tipo: 'reserva', correo: 'x@y.com', ev: fr, evento_id: 'fuerzaregida#1', nombres: ['Ana'], recibido: 0, total: 5900, resta: 5900, portal: null, grupo: null });
    af(r0.html && !/Recibimos[\s\S]{0,80}\$0\b/.test(r0.html) && /pendiente/.test(r0.html), 'correo con $0: dice «pendiente», no «Recibimos $0»');
    const r1 = renderConfirmacion({ tipo: 'reserva', correo: 'x@y.com', ev: fr, evento_id: 'fuerzaregida#1', nombres: ['Ana'], recibido: 300, total: 5900, resta: 5600, portal: null, grupo: null });
    af(r1.html && /Recibimos/.test(r1.html) && /300/.test(r1.html), 'correo con $300: «Recibimos» sigue igual (regresión)');
  }

  // ════ [B] PORTAL-TICKET-1 · el cliente ve SU comprobante ══════════════════
  console.log('\n── [B] portal-viajero · abono_foto ──');
  {
    process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
    process.env.PORTAL_SUPABASE_ANON_KEY = 'anon-falsa';
    const VJ = UUID(10), VJ_AJENO = UUID(11), AB_FOTO = UUID(20), AB_SIN = UUID(21), AB_AJENO = UUID(22);
    const mundo = () => redNueva({
      correoCliente: 'cliente@x.com',
      viajeros: [
        { id: VJ, evento_id: 'fuerzaregida#1', nombre: 'Clienta', correo: 'cliente@x.com', celular: '8991234567', tipo_paquete: 'plus', zona_boleto: 'Cancha VIP', portal_revisado_at: '2026-10-30T00:00:00Z', usuario_id: null, tipo_viajero: null },
        { id: VJ_AJENO, evento_id: 'fuerzaregida#1', nombre: 'Otra Persona', correo: 'ajena@x.com', celular: '8990000009', tipo_paquete: 'plus', zona_boleto: 'Oro', portal_revisado_at: '2026-10-30T00:00:00Z', usuario_id: null, tipo_viajero: null },
      ],
      abonos: [
        { id: AB_FOTO, viajero_id: VJ, monto: 300, fecha: '2026-10-30', foto_path: 'req/R-TICKET/f.jpg' },
        { id: AB_SIN, viajero_id: VJ, monto: 200, fecha: '2026-10-29', foto_path: null },
        { id: AB_AJENO, viajero_id: VJ_AJENO, monto: 500, fecha: '2026-10-30', foto_path: 'req/R-AJENO/f.jpg' },
      ],
    });
    let red = mundo();
    global.fetch = red.fetch;
    let H = frescos();
    const pide = (abono_id, viajero_id) => H.portalViajero(evento({ accion: 'abono_foto', viajero_id: viajero_id || VJ, abono_id }, 'jwt-del-cliente'));

    let r = await pide(AB_FOTO); let j = JSON.parse(r.body);
    af(r.statusCode === 200 && j.ok && /\/storage\/v1\//.test(j.url || ''), `B1 abono suyo con foto → 200 + URL firmada (fue ${r.statusCode}: ${j.error || 'ok'})`);
    af(red.firmas.length === 1 && red.firmas[0].path === 'req/R-TICKET/f.jpg', 'B1 se firmó el path DE LA FILA, no uno tecleado');

    r = await pide(AB_SIN); j = JSON.parse(r.body);
    af(r.statusCode === 404 && /comprobante digital/.test(j.error || ''), 'B2 abono sin foto → 404 que lo DICE («sin comprobante digital»)');

    r = await pide(AB_AJENO); j = JSON.parse(r.body);
    af(r.statusCode === 404 && !/digital/.test(j.error || ''), 'B3 abono de OTRO viajero → 404 (el doble filtro id+viajero no confirma nada)');

    // B4 · la fila sin sello del Portal: el portero contesta como ajena.
    red = mundo(); red.viajeros[0].portal_revisado_at = null;
    global.fetch = red.fetch; H = frescos();
    r = await pide(AB_FOTO);
    af(r.statusCode === 404, `B4 viajero SIN sello → 404 (el portero de PORTAL-SOLO-1 manda) (fue ${r.statusCode})`);
    // B5 · un path del CUERPO no firma nada (la acción ni lo lee).
    red = mundo(); global.fetch = red.fetch; H = frescos();
    r = await H.portalViajero(evento({ accion: 'abono_foto', viajero_id: VJ, abono_id: AB_FOTO, foto_path: 'secreto/otro.jpg' }, 'jwt'));
    af(red.firmas.length === 1 && red.firmas[0].path === 'req/R-TICKET/f.jpg', 'B5 un foto_path tecleado en el cuerpo se IGNORA');
  }

  // ════ [C] LAS PANTALLAS, por el hecho ═════════════════════════════════════
  console.log('\n── [C] pantallas ──');
  const KH_JS = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const REQ_JS = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
  const PORTAL_HTML = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
  // Rebana una función por balance de llaves desde su declaración.
  function rebana(src, decl) {
    const i = src.indexOf(decl);
    if (i < 0) throw new Error('no encontré ' + decl);
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('llaves sin balance en ' + decl);
  }

  // C1 · el ➕ Abono de Capsule: el input de foto EXISTE y la foto VIAJA.
  {
    const payloads = [];
    const ctx = {
      document: (() => {
        const nodos = {};
        // El tr real NACE con display:none — sin eso el toggle de _vjAbonoAbrir
        // lo lee como «ya abierto» y se sale sin pintar (mordida del instrumento).
        const nodo = (id) => (nodos[id] = nodos[id] || { id, style: { display: 'none' }, dataset: {}, value: '', files: null, innerHTML: '', firstElementChild: { set innerHTML(h) { nodos.__abonoHtml = h; }, get innerHTML() { return nodos.__abonoHtml || ''; } }, focus() {}, querySelectorAll: () => [] });
        return { getElementById: (id) => nodo(id), querySelectorAll: () => [] };
      })(),
      khViajeros: { abonoCrear: async (p) => { payloads.push(p); return { ok: true }; } },
      _vj3LeerFoto: async (input) => (input && input.files ? 'data:image/jpeg;base64,FOTOFALSA' : null),
      _esfEsc: (s) => String(s == null ? '' : s), _attrJs: (s) => String(s == null ? '' : s),
      _mxFechaStr: () => '2026-10-30', _spFmtMxn: (n) => '$' + n,
      _abonoCorreoTxt: () => '', showToast: () => {}, loadViajeros: async () => {},
      Number, isFinite, String, Promise, console,
    };
    vm.createContext(ctx);
    vm.runInContext(rebana(KH_JS, 'function _vjAbonoAbrir'), ctx);
    vm.runInContext(rebana(KH_JS, 'async function _vjAbonoGuardar'), ctx);
    vm.runInContext('_vjAbonoAbrir("vj-1", "Clienta")', ctx);
    const html = vm.runInContext('document.getElementById("vj-ab-vj-1").firstElementChild.innerHTML', ctx);
    af(/vja-ft-vj-1/.test(html) && /type="file"/.test(html), 'C1 el panel ➕ Abono trae el input de COMPROBANTE');
    // Con archivo elegido, la foto viaja en el payload.
    vm.runInContext('document.getElementById("vja-m-vj-1").value = "300"; document.getElementById("vja-ft-vj-1").files = [{}];', ctx);
    await vm.runInContext('_vjAbonoGuardar("vj-1")', ctx);
    af(payloads.length === 1 && payloads[0].foto === 'data:image/jpeg;base64,FOTOFALSA', 'C1 la foto VIAJA en abonoCrear');
    // Sin archivo, viaja undefined (la foto es opcional — nada se rompe).
    vm.runInContext('document.getElementById("vja-ft-vj-1").files = null;', ctx);
    await vm.runInContext('_vjAbonoGuardar("vj-1")', ctx);
    af(payloads.length === 2 && payloads[1].foto === undefined, 'C1 sin archivo el abono sale igual, sin foto (opcional)');
  }

  // C2 · el historial del Portal: 📎 solo donde tiene_foto.
  {
    const ctx = { escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), money: (n) => '$' + n, console };
    vm.createContext(ctx);
    // La función real es grande; el sujeto es el forEach del historial — se
    // rebana la función completa y se corre con un plan mínimo liquidado.
    vm.runInContext(rebana(PORTAL_HTML, 'function _migPagosHtml'), ctx);
    const t = {
      viajero_id: UUID(10), total: 300, abonado: 300, resta: 0, banco: 'bbva',
      plan: { estado: 'liquidado', resta: 0, cuotas: [] }, abonado_previo: 0,
      abonos: [
        { id: UUID(20), monto: 300, fecha: '2026-10-30', tiene_foto: true },
        { id: UUID(21), monto: 200, fecha: '2026-10-29', tiene_foto: false },
      ],
    };
    const html = vm.runInContext('_migPagosHtml(' + JSON.stringify(t) + ')', ctx);
    const botones = (html.match(/data-mig-act="abono-foto"/g) || []).length;
    af(botones === 1, 'C2 el historial pinta UN 📎 (solo el abono con foto): ' + botones);
    af(html.includes('data-mig-abono="' + UUID(20) + '"'), 'C2 el 📎 lleva el id del abono CORRECTO');
    af(!html.includes('foto_path'), 'C2 ningún path viaja a la pantalla');
  }

  // C3 · la bandeja: el monto NO se prellena sin comprobante + el letrero.
  {
    const ctx = { console, Number, Math, Array, String, _reqBdjEsc: (s) => String(s == null ? '' : s) };
    vm.createContext(ctx);
    vm.runInContext(rebana(REQ_JS, 'function _reqBdjMontoInicial'), ctx);
    vm.runInContext(rebana(REQ_JS, 'function _reqBdjPersonas'), ctx);
    const conComp = { comprobante_path: 'req/x.jpg', separo_sistema: 300, acompanantes: null, num_personas: 1 };
    const sinComp = { comprobante_path: null, separo_sistema: 300, acompanantes: null, num_personas: 1 };
    af(vm.runInContext('_reqBdjMontoInicial(' + JSON.stringify(conComp) + ')', ctx) === 300, 'C3 CON comprobante el monto se prellena con el separo (como siempre)');
    af(vm.runInContext('_reqBdjMontoInicial(' + JSON.stringify(sinComp) + ')', ctx) === '', 'C3 SIN comprobante el monto nace VACÍO (el prellenado parió a Daniela)');
    // El letrero vive en el template del panel de aprobar (no en un comentario):
    const ui = rebana(REQ_JS, 'function _reqBdjAprobarUI');
    af(/SIN COMPROBANTE/.test(ui) && /deja el monto vacío/.test(ui), 'C3 el panel de aprobar trae el letrero rojo del sin-comprobante');
  }

  console.log('\n══ RESULTADO ══');
  if (R === 0 && V > 0) console.log(`✅ VERDE · ${V} en verde`);
  else if (V === 0) console.log('⚠️ NADA MEDIDO · esto NO es un verde');
  else { console.log(`🔴 ROJO · ${V} verde · ${R} rojo`); rojos.forEach((n) => console.log('   · ' + n)); }
  process.exit(R === 0 && V > 0 ? 0 : 1);
})().catch((e) => { console.error('🔴 EL ARNÉS SE CAYÓ:', e); process.exit(1); });
