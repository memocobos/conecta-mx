#!/usr/bin/env node
/* =============================================================================
 * mide-req-b1 — FASE B: la requisición nace en el index y se aprueba en la bandeja.
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
  console.log('══ mide:req-b1 · FASE B: requisición → bandeja → viajero ══\n');

  // ── [0] La PREMISA: encontrar en el catálogo REAL un caso vendible y uno
  // agotado, PREGUNTÁNDOLE AL DUEÑO. Sin premisa, el arnés se detiene. ──────
  let red = redNueva();
  global.fetch = red.fetch;
  let H = handlersFrescos();
  // El EV se le pide al DUEÑO del lector (fetchEventosRaw), no a un eval mío:
  // el literal del index referencia vars vecinas (BANCO_DEFAULT) y un eval
  // pelado truena — re-implementar al lector es la trampa de siempre.
  const { fetchEventosRaw } = require(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
  const EV = await fetchEventosRaw();
  if (!Array.isArray(EV) || !EV.length) { console.log('✗ fetchEventosRaw no dio catálogo — NADA MEDIDO'); process.exit(1); }
  let vendible = null, agotada = null;
  for (const e of EV) {
    if (!e || !Array.isArray(e.zonas)) continue;
    for (const z of e.zonas) {
      if (!z || !z.n) continue;
      if (!vendible) {
        const r = await H.resolver({ evento_id: e.id, paquete: 'plus', zona: z.n, num_personas: 2, transporte_cost: 0 }).catch(() => null);
        if (r && r.ok) vendible = { ev: e.id, zona: z.n, r };
      }
      if (!agotada && z.ag) {
        const r = await H.resolver({ evento_id: e.id, paquete: 'plus', zona: z.n, num_personas: 1, transporte_cost: 0 }).catch(() => null);
        if (r && !r.ok) agotada = { ev: e.id, zona: z.n, motivo: r.motivo };
      }
    }
    if (vendible && agotada) break;
  }
  if (!vendible) { console.log('✗ el catálogo de hoy no tiene NINGÚN caso vendible — esto NO es un verde. NADA MEDIDO.'); process.exit(1); }
  console.log(`  premisa: vendible=${vendible.ev}/«${vendible.zona}» (total $${vendible.r.total}, separo $${vendible.r.separo}) · agotada=${agotada ? agotada.ev + '/«' + agotada.zona + '»' : 'NO HAY'}\n`);

  const bueno = () => ({
    web: '', evento_id: vendible.ev, paquete: 'plus', zona: vendible.zona,
    num_personas: 2, hotel: 'Compartida', transporte: null,
    cotizacion_texto: 'COTIZACIÓN DE PRUEBA', nombre: 'Cliente Arnés', celular: '8991112233',
    correo: 'arnes@prueba.mx', forma_pago: 'transferencia', comprobante_base64: JPEG,
  });

  // ── [A] requisicion-crear ─────────────────────────────────────────────────
  console.log('[A] requisicion-crear — la requisición nace bien y nace vigilada');
  red = redNueva(); global.fetch = red.fetch; H = handlersFrescos();
  let r = await H.crear(evento('POST', bueno()));
  let j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok && /^R-[A-Z2-9]{5}$/.test(j.folio), `[A1] camino feliz: 200 con folio (${j.folio || r.body.slice(0, 80)})`);
  af(red.requisiciones.length === 1, '[A2] UNA fila insertada');
  const fila = red.requisiciones[0] || {};
  af(fila.estado === 'pendiente', '[A3] nace pendiente');
  af(fila.zona === vendible.zona, '[A4] la zona guardada es la CANÓNICA que contestó el dueño');
  af(fila.total_sistema === vendible.r.total && fila.separo_sistema === vendible.r.separo, `[A5] total/separo = los del DUEÑO ($${fila.total_sistema}/$${fila.separo_sistema})`);
  af(red.uploads.length === 1 && red.uploads[0].bucket === 'abonos-viajeros' && /^req\//.test(red.uploads[0].path), '[A6] comprobante subido a abonos-viajeros bajo req/');
  af(red.uploads[0] && red.uploads[0].contentType === 'image/jpeg' && fila.comprobante_tipo === 'image/jpeg', '[A7] tipo por MAGIA de bytes (jpeg)');
  af(typeof fila.evento_nombre === 'string' && fila.evento_nombre.length > 0, '[A8] evento_nombre derivado del catálogo');

  // control positivo: EL PRECIO NO VIENE DEL CLIENTE
  red = redNueva(); global.fetch = red.fetch; H = handlersFrescos();
  const tramposo = Object.assign(bueno(), { total_sistema: 1, separo_sistema: 1, total: 1 });
  r = await H.crear(evento('POST', tramposo)); j = JSON.parse(r.body);
  af(j.ok && red.requisiciones[0].total_sistema === vendible.r.total && red.requisiciones[0].separo_sistema === vendible.r.separo,
    '[A9] 🔒 control: un total tramposo en el payload NO mueve lo guardado — manda el dueño');

  // zona agotada → la requisición NO nace
  if (agotada) {
    red = redNueva(); global.fetch = red.fetch; H = handlersFrescos();
    r = await H.crear(evento('POST', Object.assign(bueno(), { evento_id: agotada.ev, zona: agotada.zona })));
    j = JSON.parse(r.body);
    af(r.statusCode === 409 && !j.ok, `[A10] zona agotada → 409 («${(j.error || '').slice(0, 60)}…»)`);
    af(red.requisiciones.length === 0 && red.uploads.length === 0, '[A11] y CERO escrituras (ni fila ni archivo)');
  } else {
    af(false, '[A10] no hubo zona agotada en el catálogo para medir el rechazo — esto NO es verde');
  }

  // link_pago sin comprobante · transferencia sin comprobante
  red = redNueva(); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.crear(evento('POST', Object.assign(bueno(), { forma_pago: 'link_pago', comprobante_base64: '' })));
  j = JSON.parse(r.body);
  af(j.ok && red.requisiciones[0] && red.requisiciones[0].comprobante_path == null && red.uploads.length === 0, '[A12] link_pago sin comprobante: nace sin archivo');
  red = redNueva(); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.crear(evento('POST', Object.assign(bueno(), { comprobante_base64: '' })));
  af(r.statusCode === 400 && red.requisiciones.length === 0, '[A13] transferencia SIN comprobante → 400 y cero escrituras');

  // honeypot · celular corto · archivo basura · PDF
  red = redNueva(); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.crear(evento('POST', Object.assign(bueno(), { web: 'soy-un-bot' }))); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok && red.requisiciones.length === 0 && red.uploads.length === 0, '[A14] honeypot lleno: «éxito» de utilería y CERO escrituras');
  r = await H.crear(evento('POST', Object.assign(bueno(), { celular: '899111223' })));
  af(r.statusCode === 400, '[A15] celular de 9 dígitos → 400');
  r = await H.crear(evento('POST', Object.assign(bueno(), { comprobante_base64: BASURA })));
  af(r.statusCode === 400 && red.uploads.length === 0, '[A16] bytes sin magia conocida → 400, nada al bucket');
  red = redNueva(); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.crear(evento('POST', Object.assign(bueno(), { comprobante_base64: PDF }))); j = JSON.parse(r.body);
  af(j.ok && red.uploads[0] && /\.pdf$/.test(red.uploads[0].path) && red.uploads[0].contentType === 'application/pdf', '[A17] PDF por magia → sube como pdf');

  // tope por celular (3 pendientes ya en la base falsa)
  red = redNueva({ requisiciones: [1, 2, 3].map((i) => ({ id: 'x' + i, celular: '8991112233', evento_id: vendible.ev, estado: 'pendiente' })) });
  global.fetch = red.fetch; H = handlersFrescos();
  r = await H.crear(evento('POST', bueno()));
  af(r.statusCode === 429 && red.requisiciones.length === 3 && red.uploads.length === 0, '[A18] tope por celular: la 4ª → 429, cero escrituras');

  // catálogo caído → 502 y nada nace (corre al FINAL de [A]: envenena la caché)
  red = redNueva({ indexCaido: true }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.crear(evento('POST', bueno()));
  af(r.statusCode === 502 && red.requisiciones.length === 0 && red.uploads.length === 0, '[A19] catálogo ilegible → 502, cero escrituras (mejor no vender que vender a ciegas)');

  // ── [B] admin-requisiciones ───────────────────────────────────────────────
  console.log('\n[B] admin-requisiciones — la bandeja y el nacimiento del viajero');
  H = handlersFrescos();
  // jwtSign EXIGE ttl (ses-1: sin exp no hay token) — mi primer intento lo omitió
  // y el 401 era del candado haciendo su trabajo, no del código.
  const tokenBulma = H.jwtSign({ id: 'u-bulma', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const tokenCC = H.jwtSign({ id: 'u-cc', rol: 'cc', nombre: 'Coordi' }, process.env.JWT_SECRET, 3600);
  const pendiente = () => ({
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', folio: 'R-TEST1',
    evento_id: vendible.ev, evento_nombre: 'Evento Arnés', paquete: 'plus',
    zona: vendible.zona, num_personas: 2, hotel: 'Compartida', transporte: null,
    nombre: 'Cliente Arnés', celular: '8991112233', correo: 'a@b.mx',
    forma_pago: 'transferencia', total_sistema: vendible.r.total, separo_sistema: vendible.r.separo,
    comprobante_path: 'req/R-TEST1/x.jpg', comprobante_tipo: 'image/jpeg', estado: 'pendiente',
  });

  // sin token / rol sin permiso
  red = redNueva({ requisiciones: [pendiente()] }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'listar' }));
  af(r.statusCode === 401, '[B1] sin token → 401');
  r = await H.admin(evento('POST', { accion: 'listar' }, tokenCC));
  af(r.statusCode === 403, '[B2] rol cc → 403 (la bandeja es de Bulma/Milk/Memo)');

  // listar + detalle con firma
  r = await H.admin(evento('POST', { accion: 'listar' }, tokenBulma)); j = JSON.parse(r.body);
  af(j.ok && j.requisiciones.length === 1 && j.pendientes === 1, '[B3] listar: 1 pendiente, conteo 1');
  r = await H.admin(evento('POST', { accion: 'detalle', id: pendiente().id }, tokenBulma)); j = JSON.parse(r.body);
  af(j.ok && typeof j.signed_url === 'string' && j.signed_url.includes('firmada'), '[B4] detalle trae URL firmada del comprobante');

  // aprobar FELIZ: nace el viajero con su abono
  red = redNueva({ requisiciones: [pendiente()] }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pendiente().id, monto: 500, nota: 'visto en comprobante' }, tokenBulma));
  j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok, '[B5] aprobar feliz → 200');
  af(red.viajeros.length === 1, '[B6] nació UN viajero');
  const vj = red.viajeros[0] || {};
  af(vj.evento_id === vendible.ev && vj.tipo_paquete === 'plus' && vj.zona_boleto === vendible.zona && vj.boletos === 2, '[B7] con evento/paquete/zona canónica/boletos del grupo');
  af(vj.total_contrato === vendible.r.total && vj.abonado_previo === 0, `[B8] total_contrato = el del index ($${vj.total_contrato}) y abonado_previo 0 — el dinero va en el ABONO`);
  af(red.abonos.length === 1 && red.abonos[0].monto === 500 && red.abonos[0].viajero_id === vj.id, '[B9] UN abono de $500 colgado del viajero');
  af(red.abonos[0].foto_path === 'req/R-TEST1/x.jpg', '[B10] el abono HEREDA el comprobante (foto_path)');
  af(red.abonos[0].capturado_por === 'Bulma', '[B11] capturado_por sale del JWT, no del cliente');
  af(red.requisiciones[0].estado === 'aprobada' && red.requisiciones[0].viajero_id === vj.id, '[B12] la requisición quedó aprobada y enlazada');
  af((red.requisiciones[0].nota_staff || '') === 'visto en comprobante', '[B13] la nota del staff viaja');

  // 🔒 el doble clic: la segunda NO crea otro viajero
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pendiente().id, monto: 500 }, tokenBulma));
  af(r.statusCode === 409 && red.viajeros.length === 1 && red.abonos.length === 1, '[B14] 🔒 doble clic → 409 y SIGUE habiendo un solo viajero/abono');

  // dinero inválido — cero escrituras
  red = redNueva({ requisiciones: [pendiente()] }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pendiente().id, monto: 0 }, tokenBulma));
  af(r.statusCode === 400 && red.viajeros.length === 0 && red.requisiciones[0].estado === 'pendiente', '[B15] monto 0 → 400, nada se mueve');
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pendiente().id, monto: 999999 }, tokenBulma));
  af(r.statusCode === 400 && red.viajeros.length === 0, '[B16] abono mayor que el total → 400');

  // zona desconocida: 409 NOMBRANDO las de la ficha y SIN reclamar
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pendiente().id, monto: 500, zona: 'Zona Inventada Del Arnés' }, tokenBulma));
  j = JSON.parse(r.body);
  af(r.statusCode === 409 && /no existe en la ficha/.test(j.error || '') && (j.error || '').includes('·'), '[B17] zona desconocida → 409 nombrando las canónicas');
  af(red.requisiciones[0].estado === 'pendiente' && red.viajeros.length === 0, '[B18] y la requisición sigue PENDIENTE (la zona se valida ANTES de reclamar)');

  // viajero falla → el reclamo se REVIERTE
  red = redNueva({ requisiciones: [pendiente()], viajeroInsertFalla: true }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pendiente().id, monto: 500 }, tokenBulma));
  af(r.statusCode === 502 && red.requisiciones[0].estado === 'pendiente', '[B19] insert del viajero falla → 502 y el reclamo REVERTIDO a pendiente');

  // abono falla → 207 con instrucción y el viajero NO se borra
  red = redNueva({ requisiciones: [pendiente()], abonoInsertFalla: true }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'aprobar', id: pendiente().id, monto: 500 }, tokenBulma));
  j = JSON.parse(r.body);
  af(r.statusCode === 207 && /Abono/.test(j.error || '') && red.viajeros.length === 1, '[B20] abono falla → 207 con la instrucción exacta, el viajero NO se borra');
  af(!red.log.some((l) => l.startsWith('DELETE')), '[B21] 🔒 NINGÚN DELETE en toda la corrida — datos de gente no se borran solos');

  // rechazar: motivo obligatorio + candado de estado
  red = redNueva({ requisiciones: [pendiente()] }); global.fetch = red.fetch; H = handlersFrescos();
  r = await H.admin(evento('POST', { accion: 'rechazar', id: pendiente().id }, tokenBulma));
  af(r.statusCode === 400, '[B22] rechazar sin motivo → 400');
  r = await H.admin(evento('POST', { accion: 'rechazar', id: pendiente().id, motivo: 'comprobante ilegible' }, tokenBulma));
  j = JSON.parse(r.body);
  af(j.ok && red.requisiciones[0].estado === 'rechazada' && red.requisiciones[0].motivo_rechazo === 'comprobante ilegible', '[B23] rechazar con motivo lo escribe');
  r = await H.admin(evento('POST', { accion: 'rechazar', id: pendiente().id, motivo: 'otra vez' }, tokenBulma));
  af(r.statusCode === 409, '[B24] re-rechazar lo ya rechazado → 409 (el filtro de estado muerde)');

  // ── [C] los tres frentes del navegador llevan sus piezas ─────────────────
  console.log('\n[C] las pantallas llevan sus piezas (hecho, no promesa)');
  const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const khh = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  const khj = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const mod = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
  af(idx.includes("id=\"req-seccion\"") && idx.includes('/.netlify/functions/requisicion-crear'), '[C1] el index tiene la sección y le pega al endpoint real');
  af(/try\{_reqPintar\(\);\}catch/.test(idx), '[C2] el pintado va en try: un tropiezo NO tira el modal del dinero');
  af(khh.includes('id="page-requisiciones"') && khh.includes('kamehouse-requisiciones.js'), '[C3] kamehouse tiene la página y carga el módulo');
  af((khj.match(/'requisiciones'/g) || []).length >= 4, '[C4] PERMISOS_TABS (3 roles) + dispatch llevan la pantalla');
  af(mod.includes('admin-requisiciones') && mod.includes('_reqBdjAprobar'), '[C5] el módulo le habla al endpoint y trae el aprobar');
  af(khj.includes('${reqHtml}'), '[C6] el inicio de Milk/Bulma PINTA la tarjeta de requisiciones');
  // 🔒 EL INTERRUPTOR (orden de Memo, 12-oct): la requisición NO sale a la luz
  // hasta la luz verde. Se mide EL HECHO en el código vivo: el flag declarado
  // en false, el guard al ARRANQUE de _reqPintar (vaciando la sección), y el
  // override secreto ?req=1 para probar en producción.
  af(/var REQUISICION_VIVA\s*=\s*false/.test(idx), '[C7] 🔒 REQUISICION_VIVA declarado APAGADO — el sitio público queda como siempre');
  {
    const i0 = idx.indexOf('function _reqPintar');
    const cuerpo = idx.slice(i0, idx.indexOf('function _reqForma', i0));
    af(/if\(!_requisicionActiva\(\)\)\{\s*cont\.innerHTML=''/.test(cuerpo), '[C8] _reqPintar se rinde Y VACÍA la sección con el interruptor apagado');
  }
  af(idx.includes("conecta_req_preview") && idx.includes("get('req')"), '[C9] override ?req=1 por pestaña (patrón RESERVA_PORTAL) para probar sin enseñarlo');

  console.log(`\n${R === 0 ? '✅ VERDE' : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  if (V === 0) { console.log('NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('EL ARNÉS SE CAYÓ (eso no es un reporte):', e); process.exit(1); });
