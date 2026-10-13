#!/usr/bin/env node
/* =============================================================================
 * mide-acomp-1 — ACOMP-1: acompañantes en la requisición, reparto al aprobar e invitación al Portal.
 *
 * La red falsa es la de mide:req-b1 (copiada, no importada: aquel es un
 * script con main) más TRES puertas nuevas: el Portal (clientes), Resend y la
 * bitácora invitaciones_portal — todas con estado y filtros reales.
 *
 * Entra por los DOS handlers REALES (requisicion-crear y admin-requisiciones)
 * con una red falsa que respeta FILTROS y guarda ESTADO (la ley de la base de
 * mentira). El catálogo es el REAL: el index.html del árbol servido por la red
 * falsa — un EV inventado clasificaría con MI criterio (lección CUADRE-5).
 * Los eventos/zonas de los casos NO se eligen a ojo: se le PREGUNTA a
 * resolverPrecioVenta (el dueño) hasta que conteste ok/rehusado — así el arnés
 * no caduca cuando el catálogo cambie (lección NUBE4: la fecha tecleada).
 *
 * ⚠️ SIN ANCLA A PROPÓSITO (como mide:cuadre-aplicar): carga del ÁRBOL DE
 * TRABAJO porque mide la tuerca que acabas de escribir. No puede traer control
 * positivo por commit (no hay BASE donde esto exista); sus controles son por
 * construcción: sembrar el caso malo y verlo caer.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let V = 0, R = 0;
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}

// ── Env que los handlers esperan ─────────────────────────────────────────────
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
process.env.JWT_SECRET = 'secreto-del-arnes';
process.env.CORREOS_MODO = 'real'; // como producción: el cero de envíos tiene que salir del diseño, no de un desvío

const INDEX_HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

// ── LA RED FALSA: estado + filtros respetados ────────────────────────────────
function redNueva(opts) {
  opts = opts || {};
  const st = {
    requisiciones: (opts.requisiciones || []).map((r) => Object.assign({}, r)),
    viajeros: [], abonos: [], uploads: [], firmas: 0,
    indexCaido: !!opts.indexCaido,
    viajeroInsertFalla: !!opts.viajeroInsertFalla,
    abonoInsertFalla: !!opts.abonoInsertFalla,
    log: [],
    clientes: (opts.clientes || []).slice(), invitaciones: (opts.invitaciones || []).slice(), correos: [],
    bitacoraCaida: !!opts.bitacoraCaida,
  };
  let seq = 1;
  function uuid() { return '00000000-0000-4000-8000-' + String(seq++).padStart(12, '0'); }
  function resp(status, body, esTexto) {
    return {
      ok: status >= 200 && status < 300, status,
      json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  }
  function idsIn(url) {
    const v = new URL(url).searchParams.get('id');
    if (!v || !v.startsWith('in.(')) return null;
    return decodeURIComponent(v).slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, ''));
  }
  function filtros(url) {
    // eq-filtros de PostgREST que este mundo usa. Se APLICAN de verdad:
    // una red que ignora filtros hace que funciones sanas parezcan rotas.
    const u = new URL(url);
    const f = {};
    for (const [k, v] of u.searchParams) {
      if (typeof v === 'string' && v.startsWith('eq.')) f[k] = decodeURIComponent(v.slice(3));
    }
    return f;
  }
  st.fetch = async function fetchFalso(url, init) {
    init = init || {};
    const met = (init.method || 'GET').toUpperCase();
    st.log.push(met + ' ' + url);
    // 1 · El index servido (catalogo-index lo pide para el EV).
    if (String(url).includes('/index.html') || /conectareynosa\.mx\/?$/.test(String(url))) {
      if (st.indexCaido) return resp(500, 'apagado a propósito');
      return resp(200, INDEX_HTML);
    }
    // 2 · Storage: subida del comprobante y firma.
    let m = String(url).match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
    if (m) { st.firmas++; return resp(200, { signedURL: '/object/sign/firmada/' + m[2] }); }
    m = String(url).match(/\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (m && met === 'POST') {
      st.uploads.push({ bucket: m[1], path: decodeURI(m[2]), contentType: (init.headers || {})['Content-Type'], bytes: init.body ? init.body.length : 0 });
      return resp(200, { Key: m[2] });
    }
    // 3 · rest/v1 con estado y filtros.
    if (String(url).includes('/rest/v1/requisiciones')) {
      const f = filtros(url);
      if (met === 'GET') {
        let rows = st.requisiciones.filter((r) => Object.keys(f).every((k) => String(r[k]) === String(f[k])));
        return resp(200, rows);
      }
      if (met === 'POST') {
        const fila = JSON.parse(init.body);
        fila.id = fila.id || uuid();
        fila.creado_en = new Date().toISOString();
        st.requisiciones.push(fila);
        return resp(201, [fila]);
      }
      if (met === 'PATCH') {
        const cambios = JSON.parse(init.body);
        const rows = st.requisiciones.filter((r) => Object.keys(f).every((k) => String(r[k]) === String(f[k])));
        rows.forEach((r) => Object.assign(r, cambios));
        return resp(200, rows.map((r) => Object.assign({}, r)));
      }
    }
    if (String(url).includes('/rest/v1/viajeros_evento') && met === 'POST') {
      if (st.viajeroInsertFalla) return resp(500, 'tabla enojada (sembrado)');
      // [ACOMP-1] Fiel a PostgREST: el cuerpo puede ser UNA fila o una LISTA
      // (todas en una transacción). La base de mentira que solo aceptaba un
      // objeto mentía de un modo que la de verdad no puede.
      const cuerpo = JSON.parse(init.body);
      const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((f) => Object.assign({ id: f.id || uuid() }, f));
      filas.forEach((f) => st.viajeros.push(f));
      return resp(201, filas);
    }
    if (String(url).includes('/rest/v1/abonos_viajero') && met === 'POST') {
      if (st.abonoInsertFalla) return resp(500, 'abonos enojados (sembrado)');
      // [ACOMP-1] Fiel a PostgREST: el cuerpo puede ser UNA fila o una LISTA
      // (todas en una transacción). La base de mentira que solo aceptaba un
      // objeto mentía de un modo que la de verdad no puede.
      const cuerpo = JSON.parse(init.body);
      const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((f) => Object.assign({ id: f.id || uuid() }, f));
      filas.forEach((f) => st.abonos.push(f));
      return resp(201, filas);
    }
    // ── [ACOMP-1] lectura/escritura de viajeros por id=in.(…) (el puente relee y enlaza).
    if (String(url).includes('/rest/v1/viajeros_evento') && (met === 'GET' || met === 'PATCH')) {
      const ids = idsIn(url);
      const rows = st.viajeros.filter((v) => !ids || ids.includes(String(v.id)));
      if (met === 'PATCH') { const c = JSON.parse(init.body); rows.forEach((v) => Object.assign(v, c)); }
      return resp(200, rows.map((v) => Object.assign({}, v)));
    }
    if (String(url).includes('/rest/v1/invitaciones_portal')) {
      if (st.bitacoraCaida) return resp(500, 'bitácora caída (sembrado)');
      if (met === 'GET') { const f = filtros(url); return resp(200, st.invitaciones.filter((x) => !f.evento_id || x.evento_id === f.evento_id)); }
      if (met === 'POST') { const fila = JSON.parse(init.body); st.invitaciones.push(fila); return resp(201, [fila]); }
    }
    if (String(url).startsWith('https://pt.falso.test/rest/v1/clientes')) {
      if (met === 'GET') {
        const m2 = decodeURIComponent(new URL(url).searchParams.get('correo') || '').match(/^in\.\((.*)\)$/);
        const lista = m2 ? m2[1].split(',').map((x) => x.replace(/^"|"$/g, '')) : [];
        return resp(200, st.clientes.filter((c) => lista.includes(c.correo)));
      }
      if (met === 'POST') { const c = JSON.parse(init.body); c.id = uuid(); c.numero_cliente = 1000 + st.clientes.length; st.clientes.push(c); return resp(201, [c]); }
    }
    if (String(url) === 'https://api.resend.com/emails' && met === 'POST') {
      const b = JSON.parse(init.body); st.correos.push(b); return resp(200, { id: 'em-' + st.correos.length });
    }
    // 4 · sesión viva del verify-admin → TRUENA a propósito: la lib hace
    // fail-open documentado y el rol del JWT manda (es el camino medido).
    if (String(url).includes('/rest/v1/usuarios') || String(url).includes('sesion')) {
      throw new Error('sesion-viva apagada en el arnés (fail-open)');
    }
    throw new Error('URL no contemplada por la red falsa: ' + met + ' ' + url);
  };
  return st;
}

// ── Cargar handlers FRESCOS por escenario (catalogo-index cachea 10 min) ────
function handlersFrescos() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return {
    crear: require(path.join(RAIZ, 'netlify/functions/requisicion-crear.js')).handler,
    admin: require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler,
    jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
    resolver: require(path.join(RAIZ, 'netlify/functions/_lib/precio-zona.js')).resolverPrecioVenta,
  };
}
function evento(httpMethod, body, token) {
  const headers = { origin: 'https://conectareynosa.mx' };
  if (token) headers.authorization = 'Bearer ' + token;
  return { httpMethod, headers, body: body == null ? '' : JSON.stringify(body) };
}

// Comprobantes de mentira con MAGIA real.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]).toString('base64');
const PDF = Buffer.from('%PDF-1.4\n% arnés\n' + 'x'.repeat(64)).toString('base64');
const BASURA = Buffer.alloc(64, 1).toString('base64');

(async function main() {
  console.log('══ mide:acomp-1 · acompañantes → reparto → Portal ══\n');
  let red = redNueva(); global.fetch = red.fetch;
  let H = handlersFrescos();
  const { fetchEventosRaw } = require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
  const EV = await fetchEventosRaw();
  // PREMISA 1: un evento vendible que NO sea de PORTAL_AL_APROBAR (el reparto sin Portal).
  let vendible = null;
  for (const e of EV) {
    if (!e || e.id === 'palnorte' || !Array.isArray(e.zonas)) continue;
    for (const z of e.zonas) {
      if (!z || !z.n) continue;
      const r = await H.resolver({ evento_id: e.id, paquete: 'plus', zona: z.n, num_personas: 3, transporte_cost: 0 }).catch(() => null);
      if (r && r.ok) { vendible = { ev: e.id, zona: z.n, r }; break; }
    }
    if (vendible) break;
  }
  // PREMISA 2: la preventa de palnorte, preguntándole al DUEÑO.
  const pn = EV.find((e) => e && e.id === 'palnorte');
  const zPn = pn && Array.isArray(pn.cheapZonas) && pn.cheapZonas.find((z) => z && !z.ag && z.p > 0);
  const rPn = zPn ? await H.resolver({ evento_id: 'palnorte', paquete: 'cheap', zona: zPn.n, num_personas: 3, transporte_cost: 0 }).catch(() => null) : null;
  if (!vendible || !rPn || !rPn.ok) { console.log('✗ sin premisa (vendible=' + !!vendible + ', palnorte=' + !!(rPn && rPn.ok) + ') — NADA MEDIDO, esto NO es un verde.'); process.exit(1); }
  console.log(`  premisa: vendible=${vendible.ev}/«${vendible.zona}» · palnorte/«${zPn.n}» 3 personas total $${rPn.total}\n`);

  const acompOk = [{ nombre: 'Ana Acompañante', correo: '' }, { nombre: 'Beto Acompañante', correo: 'Beto@Otro.mx' }];
  const pedido = (extra) => Object.assign({
    web: '', evento_id: 'palnorte', paquete: 'cheap', zona: zPn.n, num_personas: 3,
    cotizacion_texto: 'PRUEBA', nombre: 'Karina Arnés', celular: '8991112233', correo: 'karina@prueba.mx',
    forma_pago: 'transferencia', comprobante_base64: JPEG,
  }, extra || {});

  // ── [A] requisicion-crear ─────────────────────────────────────────────────
  console.log('[A] requisicion-crear — los acompañantes nacen con la requisición');
  let r, j;
  r = await H.crear(evento('POST', pedido({ acompanantes: acompOk }))); j = JSON.parse(r.body);
  const req0 = red.requisiciones[0] || {};
  af(r.statusCode === 200 && j.ok, `[A1] 3 personas + 2 acompañantes → 200 (${r.statusCode})`);
  af(Array.isArray(req0.acompanantes) && req0.acompanantes.length === 2, '[A2] se guardan 2 acompañantes (N−1)');
  af(req0.acompanantes && req0.acompanantes[0].correo === 'karina@prueba.mx', '[A3] correo VACÍO → hereda el del titular (palabra de Memo: «toda la info le llega a ella»)');
  af(req0.acompanantes && req0.acompanantes[1].correo === 'beto@otro.mx', '[A4] correo propio → se respeta, en minúsculas (la llave del Portal)');
  red = redNueva(); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.crear(evento('POST', pedido({ acompanantes: [acompOk[0]] })));
  af(r.statusCode === 400 && red.requisiciones.length === 0, '[A5] 3 personas con 1 acompañante → 400, nada nace');
  r = await H.crear(evento('POST', pedido({ acompanantes: [{ nombre: 'X', correo: '' }, acompOk[1]] })));
  af(r.statusCode === 400 && red.requisiciones.length === 0, '[A6] nombre de 1 letra → 400');
  r = await H.crear(evento('POST', pedido({ acompanantes: [acompOk[0], { nombre: 'Beto Uno', correo: 'no-es-correo' }] })));
  af(r.statusCode === 400 && red.requisiciones.length === 0, '[A7] correo sin forma → 400');
  r = await H.crear(evento('POST', pedido({ correo: '' , acompanantes: acompOk })));
  af(r.statusCode === 400 && red.requisiciones.length === 0, '[A8] titular sin correo → 400 (ahí le llega su acceso)');
  r = await H.crear(evento('POST', pedido()));
  af(r.statusCode === 200 && red.requisiciones.length === 1 && red.requisiciones[0].acompanantes == null,
    '[A9] página VIEJA en caché (sin acompañantes) → nace igual, acompanantes NULL (camino de siempre)');

  // ── [B] aprobar — el reparto ──────────────────────────────────────────────
  console.log('\n[B] aprobar — un viajero por persona y el dinero repartido al peso');
  const tokenBulma = H.jwtSign({ id: 'u-bulma', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const pend = (extra) => Object.assign({
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', folio: 'R-ACMP1', evento_id: vendible.ev, evento_nombre: 'Evento Arnés',
    paquete: 'plus', zona: vendible.zona, num_personas: 3, hotel: 'Compartida', transporte: null,
    nombre: 'Karina Arnés', celular: '8991112233', correo: 'karina@prueba.mx', forma_pago: 'transferencia',
    total_sistema: vendible.r.total, separo_sistema: vendible.r.separo,
    comprobante_path: 'req/R-ACMP1/x.jpg', comprobante_tipo: 'image/jpeg', estado: 'pendiente',
    acompanantes: [{ nombre: 'Ana Acompañante', correo: 'karina@prueba.mx' }, { nombre: 'Beto Acompañante', correo: 'beto@otro.mx' }],
  }, extra || {});
  red = redNueva({ requisiciones: [pend()] }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pend().id, monto: 1000, total_contrato: 10001 }, tokenBulma)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok, `[B1] aprobar con acompañantes → 200 (${r.statusCode} ${r.statusCode !== 200 ? r.body.slice(0, 120) : ''})`);
  af(red.viajeros.length === 3 && red.viajeros.every((v) => v.boletos === 1), '[B2] nacen TRES viajeros de 1 boleto cada uno');
  af(red.viajeros.map((v) => v.nombre).join('|') === 'Karina Arnés|Ana Acompañante|Beto Acompañante', '[B3] titular primero, luego los acompañantes EN SU ORDEN');
  af(red.viajeros[1].correo === 'karina@prueba.mx' && red.viajeros[2].correo === 'beto@otro.mx', '[B4] cada viajero lleva el correo que se capturó');
  const sumC = red.viajeros.reduce((a, v) => a + v.total_contrato, 0);
  af(sumC === 10001 && red.viajeros[0].total_contrato === 3335 && red.viajeros[1].total_contrato === 3333, `[B5] contrato repartido AL PESO: 3335+3333+3333 = ${sumC} (el residuo al titular)`);
  af(red.abonos.length === 3 && red.abonos.reduce((a, x) => a + x.monto, 0) === 1000 && red.abonos[0].monto === 334, '[B6] abono repartido: 334+333+333 = $1,000 exactos');
  af(red.abonos.every((x, i) => x.viajero_id === red.viajeros[i].id && x.foto_path === 'req/R-ACMP1/x.jpg'), '[B7] cada abono cuelga de SU viajero y hereda el comprobante');
  af(red.abonos.every((x) => /pagado por Karina Arnés/.test(x.nota || '')), '[B8] la nota del abono dice QUIÉN pagó (el dinero salió de una sola mano)');
  af(j.portal === null, '[B9] evento fuera de PORTAL_AL_APROBAR → no se toca el Portal (portal: null)');
  af(red.correos.length === 0 && red.clientes.length === 0, '[B10] …y cero correos, cero cuentas del Portal');

  // legacy: sin acompañantes → UN viajero con N boletos (igual que siempre)
  red = redNueva({ requisiciones: [pend({ acompanantes: null })] }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pend().id, monto: 900 }, tokenBulma));
  af(r.statusCode === 200 && red.viajeros.length === 1 && red.viajeros[0].boletos === 3 && red.abonos.length === 1 && red.abonos[0].monto === 900,
    '[B11] requisición VIEJA (sin acompañantes) → UN viajero de 3 boletos y UN abono de $900, como siempre');
  // acompañantes de largo incorrecto → camino viejo, no se inventa a nadie
  red = redNueva({ requisiciones: [pend({ acompanantes: [{ nombre: 'Solo Una', correo: 'k@k.mx' }] })] }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pend().id, monto: 900 }, tokenBulma));
  af(red.viajeros.length === 1 && red.viajeros[0].boletos === 3, '[B12] lista que no casa con num_personas → camino viejo, NADIE inventado');
  // falla el abono a media lista → 207, viajeros quedan, nada se borra
  red = redNueva({ requisiciones: [pend()], abonoInsertFalla: true }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pend().id, monto: 900 }, tokenBulma));
  af(r.statusCode === 207 && red.viajeros.length === 3 && !red.log.some((l) => l.startsWith('DELETE')), '[B13] abonos fallan → 207 con los 3 viajeros vivos y CERO DELETEs');

  // ── [C] el Portal al aprobar (palnorte) ──────────────────────────────────
  console.log('\n[C] Portal — puente + invitación por correo, solo en palnorte');
  const pendPn = (extra) => pend(Object.assign({ evento_id: 'palnorte', evento_nombre: 'Pa\'l Norte', paquete: 'cheap', zona: zPn.n,
    total_sistema: rPn.total, separo_sistema: rPn.separo, hotel: null }, extra || {}));
  // sin llaves del Portal → aprobación SÍ queda, el aviso lo DICE
  delete process.env.PORTAL_SUPABASE_URL; delete process.env.PORTAL_SUPABASE_SERVICE_KEY;
  red = redNueva({ requisiciones: [pendPn()] }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pend().id, monto: 900 }, tokenBulma)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && red.viajeros.length === 3 && j.portal && j.portal.ok === false && /llaves del Portal/.test(j.portal.aviso), '[C1] sin llaves → aprobado igual y el aviso lo DICE (no se calla)');
  af(red.correos.length === 0, '[C2] …y sin llaves no sale ni un correo');
  process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test'; process.env.PORTAL_SUPABASE_SERVICE_KEY = 'pt-falsa'; process.env.RESEND_API_KEY = 're_falsa';
  red = redNueva({ requisiciones: [pendPn()] }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pend().id, monto: 900 }, tokenBulma)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.portal && j.portal.ok === true, `[C3] con llaves → portal ok (${JSON.stringify(j.portal).slice(0, 160)})`);
  af(red.clientes.length === 2, `[C4] DOS cuentas del Portal (karina y beto) — Karina y Ana comparten correo = una cuenta (${red.clientes.length})`);
  af(red.viajeros.every((v) => v.portal_cliente_id), '[C5] los TRES viajeros quedan enlazados (portal_cliente_id)');
  const enviosC6 = red.correos.length;
  af(red.correos.length === 2, `[C6] DOS invitaciones: una por CORREO, no por persona (${red.correos.length})`);
  const dest = red.correos.map((c) => (c.to || []).join(',')).sort().join('|');
  af(dest === 'beto@otro.mx|karina@prueba.mx', `[C7] a los correos capturados (${dest})`);
  af(red.correos.every((c) => /conectareynosa\.mx\/portal/.test(c.html || '')), '[C8] cada invitación lleva al Portal');
  af(red.invitaciones.length === 2 && red.invitaciones.every((x) => x.evento_id === 'palnorte'), '[C9] bitácora: 2 asientos, en palnorte, DESPUÉS del envío');
  // idempotencia: Karina ya invitada antes (otra requisición) → solo Beto
  red = redNueva({ requisiciones: [pendPn()], invitaciones: [{ evento_id: 'palnorte', correo: 'karina@prueba.mx' }],
    clientes: [{ id: 'cli-karina', correo: 'karina@prueba.mx', auth_user_id: null }] }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pend().id, monto: 900 }, tokenBulma)); j = JSON.parse(r.body);
  af(red.correos.length === 1 && red.correos[0].to.join() === 'beto@otro.mx', '[C10] quien ya fue invitada NO recibe otro correo; solo el nuevo');
  af(red.clientes.length === 2 && red.viajeros[0].portal_cliente_id === 'cli-karina', '[C11] su cuenta existente se REUSA (no se duplica el cliente)');
  // bitácora caída → no se invita a nadie, aprobación intacta
  red = redNueva({ requisiciones: [pendPn()], bitacoraCaida: true }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pend().id, monto: 900 }, tokenBulma)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && red.correos.length === 0 && j.portal && j.portal.ok === false, '[C12] bitácora ilegible → CERO correos (sin bitácora no se invita) y la aprobación queda');
  // control positivo del contador: si no viera envíos, sus ceros no dirían nada (ya visto en C6 = 2)
  af(enviosC6 === 2, `[C13] control positivo: el contador de Resend SÍ ve envíos (C6 contó ${enviosC6}), así que los ceros de B10/C2/C12 son medición`);

  // ── [D] la pantalla: el formulario del index ─────────────────────────────
  console.log('\n[D] index — el formulario pide a los acompañantes');
  // Sin quitacomentarios: el index trae '/*' dentro de cadenas y un regex de
  // comentarios se come código real (fue mi primer rojo aquí). Los patrones
  // de abajo son de CÓDIGO (llamadas/declaraciones), no palabras sueltas.
  const IDX = INDEX_HTML;
  af(/function _reqAcompHtml\(/.test(IDX) && /function _reqAcompLeer\(/.test(IDX), '[D1] las dos funciones existen DECLARADAS (ley del hoisting)');
  af(/_reqAcompHtml\(inp\)\+/.test(IDX), '[D2] el formulario las pinta');
  af(/acompanantes:acomp\.length\?acomp:undefined/.test(IDX), '[D3] el envío manda los acompañantes');
  af(/data-propio/.test(IDX), '[D4] el correo del titular se copia a los que NO se editaron a mano');

  console.log(`\n${R === 0 ? (V ? '✅ VERDE' : '⚠️ NADA MEDIDO · esto NO es un verde') : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + e.stack); process.exit(1); });
