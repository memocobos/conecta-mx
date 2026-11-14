#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// mide:req-simple-1 — LA BANDEJA POR TRABAJOS (REQ-SIMPLE-1 · 13-nov-2026)
//
// Palabra de Memo: «son muchos clicks, muchas cosas que poner atención, hay
// momentos en los que no sé qué estoy haciendo … si yo no la entiendo, cómo le
// explico a mi team».
// 🔴 Lo medido en la base (13-nov): de 52 «no veo mi viaje» cerradas con «✓ Ya
// quedó», 51 se cerraron SIN ligar ninguna fila y 23 de esas personas siguen sin
// ningún viaje a su correo. Y «📊 Excel» comparaba al hermano contra los números
// de la persona de la tarjeta (caso Stephani/Jaime: un «≠» que no existía).
//
//   [A] servidor · «Ya quedó» sobre un «no veo mi viaje» SIN ningún viaje ligado
//       exige confirmarlo (409) — el caso medido, sembrado.
//   [B] servidor · el Excel dice quién es ELLA: solo esa se compara.
//   [C] servidor · la bitácora también enseña lo cerrado con «ya quedó».
//   [D] pantalla · EL MAPA: un número por trabajo, foco en el primero pendiente,
//       «?» no es cero, y cambiar de pestaña no recarga los otros trabajos.
//   [E] pantalla · las tarjetas dicen su estado y su ÚNICO paso en verde.
//   [F] la página: las secciones en orden FIJO y las mismas que el mapa.
//
// ⚠️ SIN ANCLA a propósito (carga del árbol). Controles por construcción.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const L = (p) => path.join(RAIZ, 'netlify/functions', p);

process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.RESEND_API_KEY = 're_falso';
process.env.CORREOS_MODO = 'real';

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = typeof c === 'function' ? !!c() : !!c; } catch (_) { ok = false; }
  const msg = typeof m === 'function' ? (() => { try { return m(); } catch (e) { return '(msg) ' + e.message; } })() : m;
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } };

const EV = [{ id: 'tour27', a: 'Tour Veintisiete', ds: '2099-02-13', f: '13 feb 2099' }, { id: 'viejo', a: 'Tour Viejo', ds: '2020-01-01', f: '1 ene 2020' }];
const CI = require(L('_lib/catalogo-index.js'));
CI.fetchEventosRaw = async () => EV;
// El careo del Excel NO corre de verdad (cosecha a Google): se le cambia la
// respuesta al dueño ANTES de cargar el handler, con la forma real (`personas`).
const ECC = require(L('_lib/excel-careo-correr.js'));
let personasExcel = [];
ECC.correrCareo = async () => ({ personas: personasExcel });

const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
let DB, seqN = 100;
const semilla = () => { DB = { vj: [], ab: [], rev: [], seq: [], mails: 0 }; };
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
function casa(f, k, expr) {
  const v = f[k]; let m;
  if (expr === 'is.null') return v == null;
  if (expr === 'not.is.null') return v != null;
  if ((m = /^eq\.(.*)$/.exec(expr))) return String(v) === m[1];
  if ((m = /^in\.\((.*)\)$/.exec(expr))) return m[1].split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(v));
  if ((m = /^ilike\.(.*)$/.exec(expr))) return String(v == null ? '' : v).toLowerCase() === m[1].toLowerCase();
  if ((m = /^like\.(.*)\*$/.exec(expr))) return String(v == null ? '' : v).startsWith(m[1]);
  throw new Error('la red falsa no entiende el filtro ' + k + '=' + expr);
}
const filtra = (tabla, qs) => { let fs2 = tabla.slice(); for (const [k, v] of qs.entries()) { if (['select', 'order', 'limit'].includes(k)) continue; fs2 = fs2.filter((f) => casa(f, k, v)); } return fs2; };
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase();
  const u = new URL(String(url)); const p = u.pathname, qs = u.searchParams;
  const cuerpo = () => { try { return JSON.parse(init.body); } catch (_) { return null; } };
  DB.seq.push(m + ' ' + p.replace(/^.*\/rest\/v1\//, '') + (m === 'GET' ? '?' + u.search.slice(1, 60) : ''));
  if (/resend\.com/.test(u.host)) { DB.mails++; return resp(200, { id: 'em-' + DB.mails }); }
  if (/\/usuarios$/.test(p)) return resp(200, [{ id: 'u-roshi', activo: true, rol: 'maestro_roshi' }]);
  if (/\/viajeros_evento$/.test(p)) {
    const filas = filtra(DB.vj, qs);
    if (m === 'PATCH') { filas.forEach((f) => Object.assign(f, cuerpo())); return resp(200, filas); }
    return resp(200, filas);
  }
  if (/\/abonos_viajero$/.test(p)) return resp(200, filtra(DB.ab, qs));
  if (/\/portal_revisiones$/.test(p)) {
    if (m === 'POST') { const b = cuerpo(); const arr = (Array.isArray(b) ? b : [b]).map((x) => Object.assign({ id: uuid(++seqN) }, x)); DB.rev.push(...arr); return resp(201, arr); }
    const filas = filtra(DB.rev, qs);
    if (m === 'PATCH') { filas.forEach((f) => Object.assign(f, cuerpo())); return resp(200, filas.map((f) => Object.assign({}, f))); }
    return resp(200, filas.map((f) => Object.assign({}, f)));
  }
  return resp(200, []);
};
const { jwtSign } = require(L('_lib/verify-admin.js'));
const TOK = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'memo@x.mx', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
const llama = (body) => require(L('admin-portal-revision.js')).handler({ httpMethod: 'POST', path: '/.netlify/functions/admin-portal-revision',
  headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + TOK }, body: JSON.stringify(body) });
const cuerpoDe = (r) => { try { return JSON.parse(r.body); } catch (_) { return {}; } };
const revDe = (o) => { const x = Object.assign({ id: uuid(++seqN), tipo: 'ligar', estado: 'pendiente', correo: 'ana@x.com', evento_id: 'tour27', nombre_dado: 'Ana Pérez', celular: '8991112233', viajero_ids: [], creado_en: '2026-11-13T18:00:00Z', nota_staff: null }, o || {}); DB.rev.push(x); return x; };
const vjDe = (o) => { const x = Object.assign({ id: uuid(++seqN), nombre: 'Ana Pérez', correo: null, celular: '8991112233', evento_id: 'tour27', tipo_paquete: 'plus', zona_boleto: 'General', total_contrato: 5000, abonado_previo: 1000, boletos: 1, portal_revisado_at: null, portal_revisado_por: null, usuario_id: null, tipo_viajero: 'cliente', notas: null }, o || {}); DB.vj.push(x); return x; };
const escrituras = (tabla) => DB.seq.filter((s) => new RegExp('^(PATCH|POST|DELETE) ' + tabla).test(s)).length;

// ── El DOM de mentira (nodos persistentes por id) ───────────────────────────
function domFalso(secs) {
  const els = {};
  const nodo = (id) => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', hidden: false, dataset: {}, style: {},
    classList: { _s: new Set(), toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    parentNode: { insertBefore: () => {} }, appendChild: () => {}, focus: () => {}, querySelectorAll: () => [], addEventListener: () => {} });
  const secNodos = (secs || []).map((k) => { const n = nodo('req-sec-' + k); n.dataset.sec = k; return n; });
  return { els, nodo, document: {
    getElementById: (id) => nodo(id), createElement: () => nodo('nuevo-' + Object.keys(els).length),
    querySelectorAll: (sel) => (/\.rq-sec/.test(sel) ? secNodos : []), querySelector: () => null,
  } };
}

(async () => {
  console.log('══ mide:req-simple-1 ══');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[A] «Ya quedó» no es «Es esta persona» (admin-portal-revision · cerrar_resuelta)');
  semilla();
  let rev = revDe(); vjDe();                       // el parecido EXISTE, pero nadie lo ligó: su correo sigue en NULL
  let r = await llama({ accion: 'cerrar_resuelta', id: rev.id, nota: 'Listo' }), j = cuerpoDe(r);
  af(r.statusCode === 409 && j.pide_confirmar_sin_viaje === true && rev.estado === 'pendiente' && escrituras('portal_revisiones') === 0 && DB.mails === 0,
    () => '🔒 el caso medido: cerrar con «Listo» un «no veo mi viaje» sin ningún viaje a su correo → 409 y NADA se escribe (' + r.statusCode + ')');
  af(() => (/Es esta persona/.test(j.error) && /sin ver nada/.test(j.error)), 'el error dice qué pasa y cuál es el botón correcto');
  r = await llama({ accion: 'cerrar_resuelta', id: rev.id, nota: 'Se registró con otro correo', sin_viaje: true }); j = cuerpoDe(r);
  af(r.statusCode === 200 && rev.estado === 'resuelta' && /^\[cerrada SIN ligar ningún viaje\] Se registró/.test(rev.nota_staff) && DB.mails === 0,
    'confirmado con todas sus letras → se cierra, la bitácora dice que fue SIN ligar y no sale ningún correo');
  semilla(); rev = revDe(); vjDe({ correo: 'ana@x.com', portal_revisado_at: '2026-11-10T00:00:00Z' });
  r = await llama({ accion: 'cerrar_resuelta', id: rev.id, nota: 'Ya veía su viaje (1 publicado)', avisar: true }); j = cuerpoDe(r);
  af(r.statusCode === 200 && rev.estado === 'resuelta' && j.visibles === 1 && DB.mails === 1 && !/SIN ligar/.test(rev.nota_staff),
    'CONTROL: con un viaje ya ligado y publicado se cierra de un clic y le llega su correo (el candado no estorba)');
  semilla(); rev = revDe({ tipo: 'revisar' });
  r = await llama({ accion: 'cerrar_resuelta', id: rev.id, nota: 'se resolvió' });
  af(() => (r.statusCode === 200), 'el candado es SOLO del «no veo mi viaje»: una revisión normal se cierra como siempre');
  semilla(); rev = revDe(); const cand = vjDe();
  r = await llama({ accion: 'ligar', id: rev.id, viajero_id: cand.id }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && cand.correo === 'ana@x.com' && j.sellada === false), '«✓ Es esta persona» SÍ liga: escribe su correo en la fila (y dice si ya estaba publicada)');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[B] el Excel dice quién es ELLA (admin-portal-revision · excel)');
  semilla();
  personasExcel = [
    { nombre: 'Jaime Eduardo Manzo Rodriguez', total: 5950, abonado: 3000 },
    { nombre: 'Stephani Manzo Rodríguez', total: 5950, abonado: 5705 },
  ];
  r = await llama({ accion: 'excel', evento_id: 'tour27', nombre: 'STEPHANI MANZO RODRIGUEZ' }); j = cuerpoDe(r);
  af(r.statusCode === 200 && j.personas.length === 2 && j.personas[0].nombre === 'Stephani Manzo Rodríguez' && j.personas[0].es_ella === true && j.personas[1].es_ella === false && j.hay_ella === true,
    () => 'caso Stephani/Jaime: ELLA es la de nombre idéntico (sin acentos ni mayúsculas), va primero; el hermano viaja rotulado «no es ella» → ' + JSON.stringify(j.personas.map((p) => [p.nombre.split(' ')[0], p.es_ella])));
  r = await llama({ accion: 'excel', evento_id: 'tour27', nombre: 'Rodriguez Manzo Stephani' }); j = cuerpoDe(r);
  af(() => (j.personas.find((p) => p.es_ella).nombre === 'Stephani Manzo Rodríguez'), 'el orden de las palabras no importa');
  personasExcel = [{ nombre: 'Maria Lopez Garcia', total: 1, abonado: 1 }, { nombre: 'Maria Lopez Perez', total: 2, abonado: 2 }];
  r = await llama({ accion: 'excel', evento_id: 'tour27', nombre: 'Maria Lopez' }); j = cuerpoDe(r);
  af(() => (j.personas.length === 2 && j.personas.every((p) => !p.es_ella) && j.hay_ella === false), '🔒 dos candidatas igual de buenas → NINGUNA es «ella» (no se adivina: se listan y un humano mira)');
  personasExcel = [{ nombre: 'Maria Lopez Garcia', total: 1, abonado: 1 }, { nombre: 'Pedro Lopez Garcia', total: 2, abonado: 2 }];
  r = await llama({ accion: 'excel', evento_id: 'tour27', nombre: 'Maria Lopez' }); j = cuerpoDe(r);
  af(() => (j.personas.length === 1 && j.personas[0].es_ella === true), 'sin nombre idéntico pero UNA sola que lo contiene → es ella');
  af(() => (escrituras('viajeros_evento') === 0 && escrituras('portal_revisiones') === 0), 'el Excel solo LEE');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[C] la bitácora enseña también lo cerrado con «ya quedó»');
  semilla(); DB.rev.push({ id: uuid(1), tipo: 'ligar', estado: 'resuelta', correo: 'x@x.com', atendida_at: '2026-11-12T00:00:00Z', atendida_por: 'Milk', nota_staff: 'Listo' },
    { id: uuid(2), tipo: 'revisar', estado: 'publicada', correo: 'y@x.com', atendida_at: '2026-11-11T00:00:00Z', atendida_por: 'Bulma' });
  r = await llama({ accion: 'listar' }); j = cuerpoDe(r);
  af(() => (r.statusCode === 200 && j.recientes.some((x) => x.estado === 'resuelta') && j.recientes.length === 2), 'listar → `recientes` trae la resuelta (era el cierre más usado y el único invisible)');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[D] el mapa (kamehouse-requisiciones.js, ejecutado)');
  const SRC_REQ = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
  const htmlPag = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  const pag = htmlPag.slice(htmlPag.indexOf('id="page-requisiciones"'), htmlPag.indexOf('<!-- ─── SOLICITUDES PORTAL'));
  const secsHtml = [...pag.matchAll(/class="rq-sec" id="req-sec-[a-z]+" data-sec="([a-z]+)"/g)].map((m) => m[1]);
  const dom = domFalso(secsHtml);
  const llamadasReq = [];
  const ctx = { document: dom.document, window: {}, navigator: {}, console, setTimeout: () => 0, confirm: () => true, alert: () => {},
    showToast: () => {}, khPaqueteTexto: () => '', KH_PREVENTA_DESCUENTO: 300, currentUser: { rol: 'bulma' }, _tsToDate: (x) => new Date(x), khViajeros: {},
    loadRevisionesPortal: () => { llamadasReq.push('revisiones'); },
    khAdminFetch: async (url, o) => { const b = JSON.parse(o.body); llamadasReq.push(b.accion);
      const resp2 = b.accion === 'listar' ? { ok: true, requisiciones: [], pendientes: 2 } : b.accion === 'cambios_listar' ? { ok: true, cambios: [] } : { ok: true, eventos: [] };
      return { ok: true, status: 200, json: async () => resp2 }; } };
  vm.createContext(ctx); vm.runInContext(SRC_REQ, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  const visibles = () => secsHtml.filter((k) => !dom.nodo('req-sec-' + k).hidden);
  const claves = run('_REQ_SECS.map((s) => s.k)');
  af(() => (JSON.stringify(claves) === JSON.stringify(['sitio', 'pagos', 'ligar', 'portal', 'rol', 'cambios'])), 'el orden es de URGENCIA: reservaciones · pagos · no ven su viaje · publicar · rol · cambios');
  run("_reqContar('sitio', 0); _reqContar('pagos', 0)");
  af(() => (visibles().length === secsHtml.length && dom.nodo('req-bdj-pend').textContent === '…'), 'mientras alguna lectura no contesta: TODO a la vista y el total dice «…» (no enfoca a ciegas)');
  run("_reqContar('ligar', 3); _reqContar('portal', 7); _reqContar('rol', 4); _reqContar('cambios', 0)");
  af(() => (JSON.stringify(visibles()) === JSON.stringify(['ligar', 'extras'])), () => 'con todo contado enfoca el PRIMER trabajo con pendientes (no ven su viaje) → ' + visibles().join(','));
  af(() => (dom.nodo('req-bdj-pend').textContent === '14'), 'el contador de arriba es la SUMA de todos los trabajos (3+7+4), no solo las reservaciones');
  const mapa = dom.nodo('req-mapa').innerHTML;
  af(() => ((mapa.match(/<button type="button" class="rq-tile/g) || []).length === 7 && /rq-tile on" onclick="_reqEnfocar\('ligar'\)/.test(mapa) && /rq-tile cero" onclick="_reqEnfocar\('sitio'\)/.test(mapa) && /✓ al día/.test(mapa)), 'el mapa: una tarjeta por trabajo + «ver todo»; la enfocada marcada y las que están en cero dicen «✓ al día»');
  run("_reqEnfocar('rol')");
  af(() => (JSON.stringify(visibles()) === JSON.stringify(['rol', 'extras'])), 'tocar una tarjeta enseña SOLO ese trabajo');
  run("_reqContar('ligar', 2)");
  af(() => (JSON.stringify(visibles()) === JSON.stringify(['rol', 'extras'])), 'y lo que elegiste no se te mueve aunque cambien los otros números');
  run("_reqContar('rol', 0)");
  af(() => (JSON.stringify(visibles()) === JSON.stringify(['ligar', 'extras'])), 'al acabar el último de ese trabajo, la bandeja te lleva sola al siguiente con pendientes');
  run("_reqEnfocar('todo')");
  af(() => (visibles().length === secsHtml.length), '«Ver todo junto» enseña todas las secciones');
  run("_reqContar('pagos', null)");
  af(() => (/rq-tile err/.test(dom.nodo('req-mapa').innerHTML) && /\+\?$/.test(dom.nodo('req-bdj-pend').textContent)), '🔒 un trabajo que NO se pudo leer no es cero: su tarjeta dice «?» y el total «+?»');
  // Cambiar de pestaña no recarga los otros trabajos.
  llamadasReq.length = 0;
  await run('loadRequisiciones()');
  const completa = llamadasReq.slice();
  llamadasReq.length = 0;
  await run("loadRequisiciones('aprobada')");
  af(() => (completa.includes('cambios_listar') && completa.includes('revisiones') && JSON.stringify(llamadasReq) === JSON.stringify(['listar'])), () => 'la carga completa lee todo (' + completa.join(',') + '); cambiar a «Aprobadas» solo recarga las reservaciones (' + llamadasReq.join(',') + ')');
  af(() => (run('_reqConteo.sitio') === 2), 'el número de «Reservaciones nuevas» es el de PENDIENTES del servidor, estés en la pestaña que estés');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[E] las tarjetas del Portal (kamehouse-portal-revision.js, ejecutado)');
  const dom2 = domFalso(secsHtml);
  const llamadasPrv = [], toasts = [], conteos = [];
  let respListar = { ok: true, pendientes: [], recientes: [] }, confirma = true, respCerrar = { ok: true, correo: { ok: true } };
  const ctx2 = { document: dom2.document, console, confirm: () => confirma, prompt: () => '', showToast: (t, k) => toasts.push([t, k]),
    _reqSecH: (t, q, n) => `<h data-n="${n || 0}">${t}</h>`, _reqContar: (s, n) => conteos.push([s, n]), loadRolPendientes: () => {},
    khAdminFetch: async (url, o) => { const b = JSON.parse(o.body); llamadasPrv.push(b);
      const x = b.accion === 'listar' ? respListar : b.accion === 'cerrar_resuelta' ? respCerrar : { ok: true, cierre: { cerrada: false, restantes: 1 } };
      return { ok: !x.error, status: x._s || 200, json: async () => x }; } };
  vm.createContext(ctx2); vm.runInContext(fs.readFileSync(path.join(RAIZ, 'kamehouse-portal-revision.js'), 'utf8'), ctx2);
  const run2 = (code) => vm.runInContext(code, ctx2);
  const cuenta = { total: 5950, abonado: 5705, resta: 245 };
  const filaP = (o) => Object.assign({ id: uuid(++seqN), nombre: 'Stephani Manzo', evento_id: 'tour27', evento_nombre: 'Tour 27', tipo_paquete: 'plus', boletos: 1, cuenta, abonos_lista: [], portal_revisado_at: null, no_procede: null, evento_pasado: false }, o || {});
  const cands = [{ id: uuid(901), nombre: 'Ana Pérez', evento_id: 'tour27', tipo_paquete: 'plus', cuenta, mismo_celular: true, ya_es_suyo: false, correo: null }];
  const REVS = {
    sinNada: { id: 'r-sin', tipo: 'ligar', correo: 'ana@x.com', nombre_dado: 'Ana Pérez', celular: '8991112233', evento: { nombre: 'Tour 27' }, filas: [], candidatos: cands, sin_revisar: 0, creado_en: '2026-11-13T18:00:00Z' },
    yaVe: { id: 'r-ya', tipo: 'ligar', correo: 'bea@x.com', nombre_dado: 'Bea', evento: { nombre: 'Tour 27' }, filas: [filaP({ portal_revisado_at: '2026-11-10' })], candidatos: [], sin_revisar: 0, creado_en: '2026-11-13T18:00:00Z' },
    porPublicar: { id: 'r-pub', tipo: 'revisar', correo: 'caro@x.com', filas: [filaP(), filaP()], sin_revisar: 2, creado_en: '2026-11-13T18:00:00Z' },
    pasados: { id: 'r-pas', tipo: 'revisar', correo: 'dani@x.com', filas: [filaP({ evento_pasado: true }), filaP({ evento_pasado: true }), filaP()], sin_revisar: 3, creado_en: '2026-11-13T18:00:00Z' },
  };
  respListar = { ok: true, pendientes: Object.values(REVS), recientes: [] };
  await run2('loadRevisionesPortal()');
  const hLig = dom2.nodo('req-ligar').innerHTML, hRev = dom2.nodo('req-portal').innerHTML;
  af(() => (/r-sin/.test(hLig) && /r-ya/.test(hLig) && !/r-pub/.test(hLig) && /r-pub/.test(hRev) && /r-pas/.test(hRev) && !/r-sin/.test(hRev)), 'una lectura, DOS trabajos: los «no veo mi viaje» van a su sección y los «por publicar» a la suya');
  af(() => (conteos.some((c) => c[0] === 'ligar' && c[1] === 2) && conteos.some((c) => c[0] === 'portal' && c[1] === 2)), 'cada sección le cuenta SU número al mapa (2 y 2)');
  const tarjeta = (h, id) => { const i = h.indexOf('id="prv-' + id + '"'); const k = h.indexOf('<div class="rq-cambio" id="prv-', i + 10); return h.slice(i, k < 0 ? h.length : k); };
  const tSin = tarjeta(hLig, 'r-sin'), tYa = tarjeta(hLig, 'r-ya'), tPub = tarjeta(hRev, 'r-pub'), tPas = tarjeta(hRev, 'r-pas');
  const verdes = (t) => (t.match(/class="rq-btn pri"[^>]*>([^<]*)</g) || []).map((x) => x.replace(/^.*>/, '').replace(/<$/, ''));
  af(/Hoy NO ve ningún viaje/.test(tSin) && JSON.stringify(verdes(tSin)) === JSON.stringify(['✓ Es esta persona']) && /Cerrar sin ligar…/.test(tSin) && !/_prvCerrarAvisar/.test(tSin),
    () => 'sin ningún viaje a su correo: se DICE en rojo y el único verde es «✓ Es esta persona» → ' + JSON.stringify(verdes(tSin)));
  af(() => (/ya ve su viaje/.test(tYa) && JSON.stringify(verdes(tYa)) === JSON.stringify(['✓ Cerrar y avisarle por correo'])), () => 'ya ve su viaje: el único verde es «✓ Cerrar y avisarle» → ' + JSON.stringify(verdes(tYa)));
  af(() => (verdes(tPub).filter((x) => /Publicar los 2 que faltan/.test(x)).length === 1 && verdes(tPub).filter((x) => /Publicar este/.test(x)).length === 2 && !/_prvCerrarAvisar/.test(tPub)), 'por publicar: los verdes son «Publicar» (cada viaje y los 2 de golpe); «No procede» y «Ya quedó» van aparte');
  af(() => (/Publicar los 2 pasados como recuerdo/.test(tPas) && /📸 Publicar como recuerdo/.test(tPas)), 'con varios viajes pasados: un botón los publica como recuerdo de un jalón');
  const iPub = tPub.indexOf('✓ Publicar este'), iNo = tPub.indexOf('✗ No procede');
  af(() => (iPub > -1 && iNo > iPub && tPub.indexOf('✏️ Corregir') > iPub), 'en cada viaje el paso de siempre va PRIMERO; «No procede» al final');
  // El Excel en pantalla.
  const vFila = REVS.porPublicar.filas[0];
  const hx = run2('_prvExcelHtml')(vFila, [{ nombre: 'Stephani Manzo Rodríguez', total: 5950, abonado: 5705, es_ella: true }, { nombre: 'Jaime Eduardo Manzo Rodriguez', total: 5950, abonado: 3000, es_ella: false }]);
  af(() => (/Cuadra con el Excel/.test(hx) && !/≠/.test(hx) && /Otras personas del Excel con nombre parecido \(1\)/.test(hx) && /Jaime Eduardo/.test(hx)), 'caso Stephani/Jaime en pantalla: ELLA cuadra; el hermano sale aparte, sin «≠» (ya no se compara con los números de ella)');
  const hx2 = run2('_prvExcelHtml')(vFila, [{ nombre: 'Stephani Manzo', total: 5950, abonado: 6005, es_ella: true }]);
  af(() => (/≠ No cuadra con el Excel/.test(hx2) && /\$300 MÁS de pagado: puede faltar capturar un abono/.test(hx2)), 'CONTROL: cuando de verdad no cuadra lo dice, con los dos números y la pista ($300 que faltan de capturar)');
  af(() => (/No hay una fila del Excel con su nombre exacto/.test(run2('_prvExcelHtml')(vFila, [{ nombre: 'Otra Persona Manzo', total: 1, abonado: 1, es_ella: false }]))), 'sin «ella» en el Excel: se dice, y no se compara con nadie');
  // Cerrar sin ligar: se confirma con todas sus letras.
  run2("_prvResueltaAbrir('r-sin')");
  const panel = dom2.nodo('prv-form-r-sin').innerHTML;
  af(() => (/sigue sin ningún viaje/.test(panel) && /Cerrar SIN ligar/.test(panel) && !/prv-ok-avisar/.test(panel)), 'el panel de «Cerrar sin ligar…» avisa ANTES del clic y no ofrece mandar el correo de «ya puedes verlo»');
  dom2.nodo('prv-ok-nota-r-sin').value = 'Se registró con otro correo';
  llamadasPrv.length = 0; await run2("_prvResueltaGo('r-sin')");
  const cz = llamadasPrv.find((b) => b.accion === 'cerrar_resuelta');
  af(() => (cz && cz.sin_viaje === true && cz.avisar === false && cz.nota === 'Se registró con otro correo'), 'y manda `sin_viaje:true` (lo que el servidor exige) sin correo');
  llamadasPrv.length = 0; await run2("_prvCerrarAvisar('r-ya')");
  const ok1 = llamadasPrv.find((b) => b.accion === 'cerrar_resuelta');
  af(() => (ok1 && ok1.avisar === true && !ok1.sin_viaje && /^Ya veía su viaje \(1 publicado\)$/.test(ok1.nota)), () => '«✓ Cerrar y avisarle»: UN clic, sin teclear; la nota la pone el sistema («' + (ok1 && ok1.nota) + '»)');
  llamadasPrv.length = 0; confirma = true; await run2("_prvPublicarPasados('r-pas')");
  af(() => (llamadasPrv.filter((b) => b.accion === 'fila_publicar').length === 2), 'publicar los pasados usa la puerta de siempre (`fila_publicar`), una vez por viaje pasado — el que viene NO se toca');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[F] la página');
  af(() => (JSON.stringify(secsHtml) === JSON.stringify(['sitio', 'pagos', 'ligar', 'portal', 'rol', 'cambios', 'extras'])), () => 'las secciones viven en la página en orden FIJO (ya no en el orden en que contesta cada lectura): ' + secsHtml.join(' · '));
  af(() => (claves.every((k) => secsHtml.includes(k))), 'cada tarjeta del mapa tiene su sección (derivado de la página, no de una lista aparte)');
  const _REQ_CLAVES = claves;
  af(() => (['req-mapa', 'req-pagos', 'req-ligar', 'req-portal', 'req-rol-fijar', 'req-cambios', 'req-prev-costos', 'req-extras', 'req-bdj-lista', 'req-bdj-tabs'].every((id) => pag.includes('id="' + id + '"'))), 'todas las cajas existen en la página');
  af(() => (pag.indexOf('id="req-bdj-tabs"') > pag.indexOf('id="req-sec-sitio"') && pag.indexOf('id="req-bdj-tabs"') < pag.indexOf('id="req-sec-pagos"')), 'las pestañas Pendientes/Aprobadas/… viven DENTRO de «Reservaciones del sitio» (solo filtran eso)');
  const css = fs.readFileSync(path.join(RAIZ, 'kamehouse.css'), 'utf8');
  af(() => (/\.rq-mapa\{/.test(css) && /\.rq-tile\.on\{/.test(css) && /\.rq-sec\[hidden\]\{display:none\}/.test(css)), 'el CSS del mapa existe (y una sección oculta de verdad no se ve)');
  const bloque = css.slice(css.indexOf('[REQ-SIMPLE-1 · 13-nov-2026] La bandeja por TRABAJOS'), css.indexOf('KH-GZ') > 0 ? undefined : undefined).split('/* ═')[0];
  af(() => (!/#[0-9a-fA-F]{3,6}\b/.test(bloque) && !/rgba?\(/.test(bloque)), 'el bloque nuevo usa solo tokens del tema: ni un color tecleado');

  // El rol de SOLO LECTURA (director): sus controles de escritura se esconden por
  // el NOMBRE del onclick (DIRECTOR-1). Los botones nuevos que escriben tienen que
  // caer en esa lista; los que solo navegan (el mapa, agrandar la foto) NO.
  const patrones = [...css.slice(css.indexOf('[DIRECTOR-1] SOLO LECTURA')).matchAll(/body\.kh-solo-lectura \[onclick\*="([^"]+)" i\]/g)].map((m) => m[1].toLowerCase());
  const oculto = (onclick) => patrones.some((pt) => onclick.toLowerCase().includes(pt));
  const escriben = ["_rfFijarHoy('x')", '_rfFijarHoyTodos(2)', "_rfFijar('x')", "_vjPlanFijarHoy('x','y')", "_prvCerrarAvisar('x')", "_prvPublicarPasados('x')", "_prvPublicar('x')", "_prvFilaPublicar('x', 0)", "_reqPagoAbrir('x')"];
  const navegan = _REQ_CLAVES.map((k) => `_reqEnfocar('${k}')`).concat(["_reqEnfocar('todo')", "_reqPagoZoom('x')", "_reqPagoVer('x')"]);
  af(() => (patrones.length > 40 && escriben.every(oculto)), () => 'solo lectura: los botones nuevos que ESCRIBEN quedan ocultos para el director → sin ocultar: ' + JSON.stringify(escriben.filter((x) => !oculto(x))));
  af(() => (navegan.every((x) => !oculto(x))), () => 'y los que solo NAVEGAN (el mapa, ver el comprobante) no se esconden → ocultos de más: ' + JSON.stringify(navegan.filter(oculto)));

  console.log('\n' + (V === 0 ? 'NADA MEDIDO · esto NO es un verde' : (R ? '🔴 ROJO' : '✅ VERDE')) + ' · ' + V + ' en verde, ' + R + ' en rojo');
  process.exit(R || !V ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + (e && e.stack)); process.exit(1); });
