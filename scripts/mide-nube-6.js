#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-nube-6.js — NUBE-6 · la Nube se simplifica
//
// Palabra de Memo (9-nov-2026): «nube voladora hacerlo manual se está volviendo
// complicado ¿hay forma de optimizarlo?» → «ps dale, primero arreglemos eso
// antes de salir a venta con los eventos 2027 de cdmx». Medido antes: 5 filas
// en toda la historia de la tabla, todas POR EVENTO, vigencias de 2-5 días,
// ninguna general — la cadencia semanal × 18 eventos × 2 modos no la sostuvo
// nadie y el sitio vivía en «cotiza por WhatsApp».
//
// Lo que esta tuerca cambia y este careo mide:
//   [R] `renovar` (handler REAL): re-captura la que rige con el MISMO precio y
//       horarios, desde ahora por N días (default 30, tope 90), nota «renovada
//       sin cambio»; sin ninguna → 404 y CERO escrituras; nunca copia la general
//       a un evento. 🔒 Un INSERT, jamás un PATCH/DELETE (la red falsa truena).
//   [C] `cobertura` gana `detalle` por evento (sin · heredado · propio) y la
//       `general` por modo — salen de las MISMAS llamadas al dueño.
//   [P] La pantalla: default de vigencia = hoy Reynosa + 30; el panorama pinta
//       la general con «renovar», la cobertura con sus chips, y la vencida con
//       «Revivir» (funciones REALES rebanadas de kamehouse-nube.js, en vm).
//   [D] El index: `nubeAproxLabel` dice «desde» SOLO para el avión que hereda la
//       general; bus general y avión propio van exactos — en el card Y en el
//       botón del cotizador (código REAL del index, en vm).
//   [A] El Radar: la general que vence en ≤5 días se avisa en sev-media; con
//       todo vigente y lejos se calla; vencida sigue en sev-alta.
//   [S] Sabotaje con sha1 careado: renovar que copia el precio del body → rojo.
//
// ⚠️ SIN ANCLA DE HEAD A PROPÓSITO: carga del ÁRBOL DE TRABAJO (la forma de
// `mide:req-b1`), así mide lo que acabas de escribir. BASE = `git rev-parse
// HEAD` (el último commit, SIN NUBE-6) y sirve de control positivo: ahí
// `renovar` es «Acción desconocida» y `cobertura` no trae `detalle`.
//
// Se corre:  npm run mide:nube-6
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let verde = 0, rojo = 0, completo = false;
const fallos = [];
function af(cond, msg) {
  let ok = false, extra = '';
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; }
  catch (e) { ok = false; extra = '  [EXCEPCIÓN: ' + e.message + ']'; }
  if (ok) { verde++; return; }
  let texto;
  try { texto = (typeof msg === 'function') ? msg() : msg; }
  catch (e) { texto = '(el mensaje también reventó: ' + e.message + ')'; }
  rojo++; fallos.push(texto + extra); console.log('   ✗ ' + texto + extra);
}
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  if (!verde && !rojo) console.log('⚠️ NADA MEDIDO · esto NO es un verde');
  else console.log((rojo ? '❌ ROJO · ' : '✅ VERDE · ') + verde + ' en verde, ' + rojo + ' en rojo');
  fallos.slice(0, 20).forEach((f) => console.log('  · ' + f));
}
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
function sacarBase() {
  const sha = execSync('git rev-parse HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n6-base-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}

const AHORA = Date.now();
const dias = (n) => new Date(AHORA + n * 86400000).toISOString();

// ── EL PADRÓN FALSO ────────────────────────────────────────────────────────
// general bus VIGENTE (vence en 20 días) · general avión VIGENTE pero POR VENCER
// (3 días) · edc27 con bus PROPIO · louist sin nada propio (hereda).
function armarFilas() {
  return [
    { id: 'g1', modo: 'bus', evento_id: null, precio_pp: 2500, vigente_desde: dias(-10), vigente_hasta: dias(20),
      horarios: 'Turistar · sale 9 pm', nota: 'general bus', capturado_por: 'milk@conectareynosa.mx', creado_en: dias(-10) },
    { id: 'g2', modo: 'avion', evento_id: null, precio_pp: 4800, vigente_desde: dias(-27), vigente_hasta: dias(3),
      horarios: 'Viva · 7:10 am', nota: 'general avión', capturado_por: 'milk@conectareynosa.mx', creado_en: dias(-27) },
    { id: 'e1', modo: 'bus', evento_id: 'edc27', precio_pp: 2100, vigente_desde: dias(-4), vigente_hasta: dias(10),
      horarios: 'directo al Autódromo', nota: 'propio edc27', capturado_por: 'milk@conectareynosa.mx', creado_en: dias(-4) },
  ];
}
let FILAS = armarFilas();

(async function main() {
  process.on('exit', marcador);
  const b = sacarBase();
  console.log('BASE ' + b.sha.slice(0, 7) + ' (último commit, sin NUBE-6)   HEAD = árbol de trabajo\n');

  // ── la red falsa: respeta filtros, guarda estado, TRUENA ante PATCH/DELETE ─
  const escrituras = [];
  function armarRed(dir) {
    global.fetch = async (url, opts) => {
      const u = String(url), met = (opts && opts.method) || 'GET';
      if (/index\.html$/.test(u)) {
        return { ok: true, status: 200, text: async () => fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), json: async () => ({}) };
      }
      if (met === 'PATCH' || met === 'DELETE' || met === 'PUT') throw new Error('la nube es INSERT-ONLY: la red falsa truena ante ' + met + ' ' + u);
      if (met === 'POST') {
        const cuerpo = JSON.parse((opts && opts.body) || '{}');
        const fila = Object.assign({ id: 'n' + (escrituras.length + 1), creado_en: dias(0) }, cuerpo);
        escrituras.push(fila); FILAS.push(fila);
        return { ok: true, status: 201, json: async () => [fila], text: async () => '' };
      }
      const mm = /modo=eq\.([a-z]+)/.exec(u);
      if (!mm) throw new Error('la red falsa EXIGE el filtro por modo: ' + u);
      const esNull = /evento_id=is\.null/.test(u);
      const mev = /evento_id=eq\.([^&]+)/.exec(u);
      if (!esNull && !mev) throw new Error('la red falsa EXIGE el filtro por evento_id: ' + u);
      const ev = esNull ? null : decodeURIComponent(mev[1]);
      const out = FILAS.filter((x) => x.modo === mm[1] && x.evento_id === ev)
        .sort((a, c) => Date.parse(c.vigente_desde) - Date.parse(a.vigente_desde));
      return { ok: true, status: 200, json: async () => out, text: async () => '' };
    };
  }
  function limpiar(dir) {
    for (const f of ['admin-nube.js', 'nube-vigente.js', '_lib/nube.js', '_lib/catalogo-index.js']) {
      const p = path.join(dir, 'netlify/functions', f);
      try { delete require.cache[require.resolve(p)]; } catch (_) {}
    }
    const va = require.resolve(path.join(dir, 'netlify/functions/_lib/verify-admin.js'));
    require.cache[va] = { id: va, filename: va, loaded: true, exports: {
      corsCheck: () => 'https://conectareynosa.mx',
      verifyAdminAuthLive: async (ev, roles) => ({ valid: true, roles, user: { id: 'u1', correo: 'milk@conectareynosa.mx', rol: 'milk' } }),
    } };
    process.env.SUPABASE_URL_KAMEHOUSE = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
    process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
    process.env.URL = 'https://conectareynosa.mx';
  }
  const admin = async (body, dir) => {
    const d0 = dir || RAIZ;
    armarRed(d0); limpiar(d0);
    const mod = require(path.join(d0, 'netlify/functions/admin-nube.js'));
    const res = await mod.handler({
      httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify(body),
    });
    return { res, d: JSON.parse(res.body || '{}') };
  };

  // ══ [R] renovar, por el handler REAL ═════════════════════════════════════
  console.log('[R] renovar');
  {
    // control positivo: BASE no conoce la acción
    const rb = await admin({ accion: 'renovar', modo: 'bus' }, b.dir);
    af(rb.res.statusCode === 400 && /Acción desconocida/.test(rb.d.error || ''),
      'control positivo: en BASE `renovar` debería ser «Acción desconocida»; dio ' + rb.res.statusCode + ' ' + JSON.stringify(rb.d).slice(0, 120));

    // general bus, default 30 días
    FILAS = armarFilas(); escrituras.length = 0;
    const r1 = await admin({ accion: 'renovar', modo: 'bus' });
    af(r1.res.statusCode === 200 && r1.d.ok === true, 'renovar general bus → 200 ok; dio ' + r1.res.statusCode + ' ' + JSON.stringify(r1.d).slice(0, 160));
    af(escrituras.length === 1, 'renovar escribe EXACTAMENTE una fila; escribió ' + escrituras.length);
    const w = escrituras[0] || {};
    af(w.modo === 'bus' && w.evento_id === null, 'la fila nueva es bus / general (evento_id null); fue ' + JSON.stringify({ modo: w.modo, evento_id: w.evento_id }));
    af(Number(w.precio_pp) === 2500, 'conserva el MISMO precio (2500); fue ' + w.precio_pp);
    af(w.horarios === 'Turistar · sale 9 pm', 'conserva los horarios; fue ' + JSON.stringify(w.horarios));
    af(/^renovada sin cambio el \d{4}-\d{2}-\d{2} \(\+30 días\) · general bus$/.test(w.nota || ''),
      'la nota dice «renovada sin cambio el YYYY-MM-DD (+30 días) · <nota vieja>»; fue ' + JSON.stringify(w.nota));
    af(w.capturado_por === 'milk@conectareynosa.mx', 'capturado_por sale del TOKEN; fue ' + w.capturado_por);
    const desde = Date.parse(w.vigente_desde), hasta = Date.parse(w.vigente_hasta);
    af(Math.abs(desde - Date.now()) < 60000, 'vigente_desde ≈ ahora (|Δ| < 60 s)');
    af(Math.abs((hasta - desde) - 30 * 86400000) < 1000, 'vigente_hasta − vigente_desde = 30 días exactos; fue ' + ((hasta - desde) / 86400000).toFixed(3));
    af(r1.d.dias === 30 && r1.d.renovada_de && Number(r1.d.renovada_de.precio) === 2500,
      'la respuesta trae dias:30 y renovada_de con el precio viejo; fue ' + JSON.stringify({ dias: r1.d.dias, de: r1.d.renovada_de }).slice(0, 140));
    af(r1.d.vigentes && r1.d.vigentes.bus && Number(r1.d.vigentes.bus.precio) === 2500,
      'tras renovar, `vigentes.bus` del dueño sigue en 2500 (la nueva rige)');

    // avión general con dias=7
    escrituras.length = 0;
    const r2 = await admin({ accion: 'renovar', modo: 'avion', dias: 7 });
    af(r2.res.statusCode === 200 && escrituras.length === 1 && Number(escrituras[0].precio_pp) === 4800 && r2.d.dias === 7,
      'renovar avión general con dias:7 → una fila de 4800 y dias:7; dio ' + r2.res.statusCode + ' ' + JSON.stringify(r2.d).slice(0, 120));
    af(() => Math.abs((Date.parse(escrituras[0].vigente_hasta) - Date.parse(escrituras[0].vigente_desde)) - 7 * 86400000) < 1000, 'y la vigencia nueva mide 7 días');

    // tope 90 y piso 1
    escrituras.length = 0;
    const r3 = await admin({ accion: 'renovar', modo: 'bus', dias: 91 });
    af(r3.res.statusCode === 400 && /1 a 90/.test(r3.d.error || '') && escrituras.length === 0, 'dias:91 → 400 «van de 1 a 90» y cero escrituras; dio ' + r3.res.statusCode + ' ' + (r3.d.error || ''));
    const r3b = await admin({ accion: 'renovar', modo: 'bus', dias: 0 });
    af(r3b.res.statusCode === 400 && escrituras.length === 0, 'dias:0 → 400 y cero escrituras');

    // evento propio: renueva SU fila, no la general
    FILAS = armarFilas(); escrituras.length = 0;
    const r4 = await admin({ accion: 'renovar', modo: 'bus', evento_id: 'edc27' });
    af(r4.res.statusCode === 200 && escrituras.length === 1 && escrituras[0].evento_id === 'edc27' && Number(escrituras[0].precio_pp) === 2100,
      'renovar edc27/bus re-captura SU propia (2100, evento_id edc27), no la general; fue ' + JSON.stringify(escrituras[0] && { ev: escrituras[0].evento_id, p: escrituras[0].precio_pp }));

    // 🔒 evento SIN propia: NO copia la general a su nombre → 404, cero escrituras
    FILAS = armarFilas(); escrituras.length = 0;
    const r5 = await admin({ accion: 'renovar', modo: 'bus', evento_id: 'louist' });
    af(r5.res.statusCode === 404 && /louist/.test(r5.d.error || '') && /Captura una primero/.test(r5.d.error || ''),
      'renovar louist/bus (sin propia) → 404 nombrando el evento y «Captura una primero»; dio ' + r5.res.statusCode + ' ' + (r5.d.error || ''));
    af(escrituras.length === 0, 'y CERO escrituras: no le inventó una cotización propia copiando la general; escribió ' + escrituras.length);

    // vencida: revive la última
    FILAS = armarFilas().map((f) => f.id === 'g2' ? Object.assign({}, f, { vigente_hasta: dias(-2) }) : f);
    escrituras.length = 0;
    const r6 = await admin({ accion: 'renovar', modo: 'avion' });
    af(r6.res.statusCode === 200 && escrituras.length === 1 && Number(escrituras[0].precio_pp) === 4800,
      'con la general de avión VENCIDA, renovar la REVIVE (4800) desde ahora; dio ' + r6.res.statusCode);

    // 🔒 el precio del body se IGNORA: renovar es «sigue igual»
    FILAS = armarFilas(); escrituras.length = 0;
    const r7 = await admin({ accion: 'renovar', modo: 'bus', precio_pp: 999 });
    af(r7.res.statusCode === 200 && escrituras.length === 1 && Number(escrituras[0].precio_pp) === 2500,
      'un precio_pp en el body se IGNORA (sigue 2500, no 999); fue ' + (escrituras[0] && escrituras[0].precio_pp));

    // ACCIONES contiene renovar (ley RAD-FIX-CAMINO) — por el hecho: ya pasó arriba; aquí por el texto también
    const src = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-nube.js'), 'utf8');
    af(/const ACCIONES = \[[^\]]*'renovar'[^\]]*\]/.test(src), '`renovar` está en `ACCIONES`');
    af(/RENOVAR_DIAS_DEFAULT = 30/.test(src) && /RENOVAR_DIAS_MAX = 90/.test(src), 'las constantes RENOVAR_DIAS_DEFAULT=30 y _MAX=90 viven con nombre');
  }

  // ══ [C] cobertura: detalle + general ═════════════════════════════════════
  console.log('[C] cobertura');
  {
    FILAS = armarFilas();
    const c = await admin({ accion: 'cobertura' });
    af(c.res.statusCode === 200 && c.d.ok === true, 'cobertura → 200; dio ' + c.res.statusCode + ' ' + JSON.stringify(c.d).slice(0, 120));
    af(Array.isArray(c.d.detalle) && c.d.detalle.length === c.d.total && c.d.total > 0,
      () => 'detalle trae UNA fila por evento (total ' + c.d.total + ', detalle ' + (c.d.detalle || []).length + ')');
    const edc = (c.d.detalle || []).find((x) => x.id === 'edc27');
    af(edc && edc.bus && edc.bus.estado === 'propio' && Number(edc.bus.precio) === 2100,
      () => 'edc27.bus = propio 2100; fue ' + JSON.stringify(edc && edc.bus));
    af(edc && edc.avion && edc.avion.estado === 'heredado' && Number(edc.avion.precio) === 4800,
      () => 'edc27.avion = heredado 4800; fue ' + JSON.stringify(edc && edc.avion));
    const otro = (c.d.detalle || []).find((x) => x.id !== 'edc27');
    af(otro && otro.bus && otro.bus.estado === 'heredado' && Number(otro.bus.precio) === 2500,
      () => 'un evento sin propia hereda el bus general 2500; fue ' + JSON.stringify(otro && { id: otro.id, bus: otro.bus }));
    af(c.d.general && c.d.general.bus && Number(c.d.general.bus.precio) === 2500 && c.d.general.bus.horarios === 'Turistar · sale 9 pm',
      () => 'general.bus trae precio y horarios; fue ' + JSON.stringify(c.d.general && c.d.general.bus));
    af(c.d.general && c.d.general.avion && Number(c.d.general.avion.precio) === 4800, 'general.avion = 4800');
    af(c.d.propios && c.d.propios.bus === 1 && c.d.propios.avion === 0, () => 'propios {bus:1, avion:0}; fue ' + JSON.stringify(c.d.propios));
    af(c.d.sin && c.d.sin.bus.length === 0 && c.d.sin.avion.length === 0, 'con las dos generales vigentes, sin = {bus:[],avion:[]}');
    // sin general de avión → general.avion null y detalle 'sin'
    FILAS = armarFilas().filter((f) => f.id !== 'g2');
    const c2 = await admin({ accion: 'cobertura' });
    af(c2.d.general && c2.d.general.avion === null, 'sin ninguna de avión, general.avion es NULL (no un cero ni un objeto vacío)');
    af((c2.d.detalle || []).every((x) => x.avion && x.avion.estado === 'sin'), 'y TODO el detalle dice avion: sin');
    af(c2.d.sin && c2.d.sin.avion.length === c2.d.total, 'sin.avion cuenta a todos');
    // control positivo: BASE no trae detalle/general
    FILAS = armarFilas();
    const cb = await admin({ accion: 'cobertura' }, b.dir);
    af(cb.res.statusCode === 200 && cb.d.detalle === undefined && cb.d.general === undefined,
      'control positivo: en BASE cobertura NO trae detalle ni general');
  }

  // ══ [P] la pantalla (kamehouse-nube.js REAL en vm) ═══════════════════════
  console.log('[P] la pantalla');
  {
    const src = fs.readFileSync(path.join(RAIZ, 'kamehouse-nube.js'), 'utf8');
    const ctx = {
      console, Date, Math, Number, String, JSON, Array, Object, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, Intl,
      window: {}, document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
      khAdminFetch: async () => { throw new Error('no red en vm'); }, khErrorCarga: () => {}, khToast: () => {}, showPage: () => {},
      confirm: () => true, alert: () => {}, localStorage: { getItem: () => null, setItem: () => {} }, setTimeout, clearTimeout,
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    let cargo = true;
    try { vm.runInContext(src, ctx, { filename: 'kamehouse-nube.js' }); } catch (e) { cargo = false; console.log('   ! kamehouse-nube.js no cargó en vm: ' + e.message); }
    af(cargo, 'kamehouse-nube.js carga en vm');
    // ⚠️ Un `const` de nivel superior NO se vuelve propiedad del contexto en vm
    // (ámbito léxico): se lee EVALUÁNDOLO adentro, no por `ctx.X`.
    const leer = (expr) => { try { return vm.runInContext(expr, ctx); } catch (_) { return undefined; } };
    af(leer('NUBE_DIAS_DEFAULT') === 30, 'NUBE_DIAS_DEFAULT = 30; fue ' + leer('NUBE_DIAS_DEFAULT'));
    const hoyR = new Date().toLocaleString('sv-SE', { timeZone: 'America/Matamoros' }).slice(0, 10);
    const [a, m, d] = hoyR.split('-').map(Number);
    const esperado = new Date(Date.UTC(a, m - 1, d) + 30 * 86400000).toISOString().slice(0, 10);
    af(typeof ctx._nubeDefaultHastaISO === 'function' && ctx._nubeDefaultHastaISO() === esperado,
      '_nubeDefaultHastaISO() = hoy en Reynosa + 30 (' + esperado + '); fue ' + (ctx._nubeDefaultHastaISO && ctx._nubeDefaultHastaISO()));
    af(typeof ctx._nubeProximoDomingoISO === 'function' && ctx._nubeProximoDomingoISO() === esperado, 'el alias viejo `_nubeProximoDomingoISO` contesta lo mismo');
    af(typeof ctx.nubeRenovar === 'function' && typeof ctx.nubeIrA === 'function' && typeof ctx._nubePanorama === 'function',
      'existen nubeRenovar, nubeIrA y _nubePanorama');
    // panorama con respuesta sembrada
    const resp = {
      ok: true, total: 2, ahora: AHORA,
      sin: { bus: [], avion: [{ id: 'louist', nombre: 'Louis Tomlinson' }] }, propios: { bus: 1, avion: 0 },
      general: { bus: { precio: 2500, vigente_hasta: dias(20), horarios: 'Turistar · sale 9 pm' }, avion: null },
      detalle: [
        { id: 'edc27', nombre: 'EDC 2027', ds: '2027-02-19', bus: { estado: 'propio', precio: 2100 }, avion: { estado: 'sin' } },
        { id: 'louist', nombre: 'Louis Tomlinson', ds: '2027-05-01', bus: { estado: 'heredado', precio: 2500 }, avion: { estado: 'sin' } },
      ],
    };
    let html = '';
    try { html = ctx._nubePanoramaHtml(resp); } catch (e) { console.log('   ! _nubePanoramaHtml reventó: ' + e.message); }
    af(html.length > 200, '_nubePanoramaHtml arma HTML');
    af(/TARIFA GENERAL CDMX/.test(html) && /\$2,500/.test(html), 'pinta la general del bus con su precio');
    af(/nubeRenovar\('bus',null\)/.test(html) && /renovar 30 días/.test(html), 'la general vigente trae el botón «Sigue igual · renovar 30 días» → nubeRenovar(\'bus\',null)');
    af(/SIN TARIFA GENERAL/.test(html) && /nubeRenovar\('avion',null\)/.test(html) && /Capturar general/.test(html),
      'el modo sin general dice SIN TARIFA GENERAL y ofrece Revivir + Capturar general');
    af(/Cobertura · 2 eventos/.test(html), 'la cobertura cuenta los 2 eventos');
    af(/EDC 2027/.test(html) && /propio/.test(html) && /Louis Tomlinson/.test(html) && /general<\/span>/.test(html) && /sin precio/.test(html),
      'las filas por evento traen sus chips: propio · general · sin precio');
    af(/nubeIrA\('edc27',''\)/.test(html), 'cada fila lleva a su evento (nubeIrA)');
    af(/1 con precio propio/.test(html) && /1 heredan la general/.test(html), 'los conteos del bus: 1 propio · 1 hereda');
    // por vencer en el panorama (≤5 días) se marca
    const resp2 = Object.assign({}, resp, { general: { bus: { precio: 2500, vigente_hasta: dias(3), horarios: null }, avion: null } });
    const html2 = ctx._nubePanoramaHtml(resp2);
    af(/⚠️ rige hasta/.test(html2) && /quedan 3 días/.test(html2), 'una general que vence en 3 días sale con ⚠️ y «quedan 3 días»');
    af(!/⚠️ rige hasta/.test(html), 'y la que vence en 20 días NO trae ⚠️');
    // HTML de la página
    const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
    af(/por default, 30 días/.test(kh), 'kamehouse.html anuncia el default de 30 días en la etiqueta (DEFAULTS-1 b)');
    af(/Capturar una cotización/.test(kh) && /Renovar/.test(kh), 'el card de captura y la ayuda nombran Renovar');
  }

  // ══ [D] el index: «desde» SOLO para el avión general ═════════════════════
  console.log('[D] el index');
  {
    const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const corta = (src, inicio) => {
      const i = src.indexOf(inicio); if (i < 0) throw new Error('no está ' + inicio);
      let j = src.indexOf('{', i), prof = 0;
      for (; j < src.length; j++) { if (src[j] === '{') prof++; else if (src[j] === '}') { prof--; if (!prof) break; } }
      return src.slice(i, j + 1);
    };
    const fAprox = corta(idx, 'function nubeAproxLabel(');
    const fCard = corta(idx, 'function nubeCardHtml(');
    const fBoton = corta(idx, 'function _tBoton(');
    const ctx = {
      Number, Math, String, encodeURIComponent, escHtml: (s) => String(s), fmt: (n) => '$' + Number(n).toLocaleString('en-US'),
      _diasEventoMx: () => 60, nubeVueloIncluido: () => false, console,
    };
    const NUBE = {};
    ctx.nubeDe = (modo, ev) => NUBE[modo] || null;
    vm.createContext(ctx);
    vm.runInContext(fAprox + '\n' + fCard + '\n' + fBoton, ctx);
    af(ctx.nubeAproxLabel('avion', { heredado: true, precio: 4800 }) === true, 'nubeAproxLabel: avión heredado → «desde»');
    af(ctx.nubeAproxLabel('avion', { heredado: false, precio: 4800 }) === false, 'avión PROPIO → exacto');
    af(ctx.nubeAproxLabel('bus', { heredado: true, precio: 2500 }) === false, 'bus heredado → exacto');
    af(ctx.nubeAproxLabel('bus', null) === false && ctx.nubeAproxLabel('avion', null) === false, 'sin cotización → false, sin reventar');
    // el card
    NUBE.bus = { precio: 2500, heredado: true, horarios: null }; NUBE.avion = { precio: 4800, heredado: true, horarios: null };
    const card = ctx.nubeCardHtml({ ds: '2027-02-19', a: 'EDC', v: 'CDMX' });
    af(/🚌 Autobús<\/b>/.test(card) && /<b>\$2,500<\/b>/.test(card) && !/desde \$2,500/.test(card), 'card: bus general va EXACTO ($2,500, sin «desde»)');
    af(/<b>desde \$4,800<\/b>/.test(card) && /se confirma al reservar/.test(card), 'card: avión general va «desde $4,800 · se confirma al reservar»');
    NUBE.avion = { precio: 4800, heredado: false, horarios: 'Viva 7 am' };
    const card2 = ctx.nubeCardHtml({ ds: '2027-02-19', a: 'EDC', v: 'CDMX' });
    af(/<b>\$4,800<\/b>/.test(card2) && !/desde \$4,800/.test(card2), 'card: avión PROPIO va exacto');
    af(/El precio final se confirma al reservar/.test(card), 'el pie del card dice que el precio final se confirma al reservar');
    // el botón del cotizador
    const bA = ctx._tBoton('avion', 'Avión', '✈️', 'https://wa.me/x', 4800, true);
    af(/data-aprox="1"/.test(bA) && /desde \$4,800/.test(bA) && /selTransporteBtn\(this,4800,'Avión \(desde\)'\)/.test(bA) && /se confirma al reservar/.test(bA),
      'botón avión general: data-aprox, «desde $4,800», nombre «Avión (desde)» al resumen, y la leyenda');
    const bB = ctx._tBoton('bus', 'Autobús', '🚌', 'https://wa.me/x', 2500, false);
    af(!/data-aprox/.test(bB) && /<div class="z-price">\$2,500<\/div>/.test(bB) && /'Autobús'\)/.test(bB), 'botón bus: exacto, sin data-aprox, nombre «Autobús»');
    const b0 = ctx._tBoton('avion', 'Avión', '✈️', 'https://wa.me/x', 0, false);
    af(/Cotiza por WhatsApp/.test(b0), 'sin precio sigue el WhatsApp de siempre');
    af(/nubeAproxLabel\('bus',cotBus\)/.test(idx) && /nubeAproxLabel\('avion',cotAvion\)/.test(idx), 'los dos llamadores de _tBoton le preguntan al dueño nubeAproxLabel');
    // control positivo: en BASE no existe nubeAproxLabel
    const idxB = fs.readFileSync(path.join(b.dir, 'index.html'), 'utf8');
    af(!/function nubeAproxLabel\(/.test(idxB), 'control positivo: BASE no tenía nubeAproxLabel');
  }

  // ══ [A] el Radar: por vencer ═════════════════════════════════════════════
  console.log('[A] el Radar');
  {
    const src = fs.readFileSync(path.join(RAIZ, 'kamehouse-radar.js'), 'utf8');
    const i = src.indexOf('async function _radarNubeAviso(');
    af(i > 0, 'existe _radarNubeAviso');
    let j = src.indexOf('{', i), prof = 0;
    for (; j < src.length; j++) { if (src[j] === '{') prof++; else if (src[j] === '}') { prof--; if (!prof) break; } }
    const fn = src.slice(i, j + 1);
    af(/RAD_NUBE_AVISO_DIAS = 5/.test(fn), 'el umbral de aviso vive con nombre: 5 días');
    async function correr(listar, cobertura) {
      const caja = { style: { display: '' }, innerHTML: '' };
      const ctx = {
        console, Date, Number, Math, String, JSON, Array, Object, isFinite, Intl,
        document: { getElementById: (id) => id === 'rdr-nube-aviso' ? caja : null },
        khAdminFetch: async (u, o) => {
          const body = JSON.parse(o.body); const d = body.accion === 'listar' ? listar : cobertura;
          return { ok: true, json: async () => d };
        },
        showPage: () => {},
      };
      vm.createContext(ctx);
      vm.runInContext(fn + '\n', ctx);
      await ctx._radarNubeAviso();
      return caja;
    }
    const cob = { ok: true, total: 18, sin: { bus: [], avion: [] }, propios: { bus: 0, avion: 0 }, detalle: [], general: {} };
    // todo vigente y lejos → se calla
    const c1 = await correr({ ok: true, ahora: AHORA, modos: {
      bus: { vigente: { precio: 2500, vigente_hasta: dias(20) }, ultimas: [] },
      avion: { vigente: { precio: 4800, vigente_hasta: dias(25) }, ultimas: [] } } }, cob);
    af(c1.style.display === 'none' && c1.innerHTML === '', 'con las dos generales vigentes y lejos el renglón SE CALLA');
    // avión vence en 3 días → sev-media
    const c2 = await correr({ ok: true, ahora: AHORA, modos: {
      bus: { vigente: { precio: 2500, vigente_hasta: dias(20) }, ultimas: [] },
      avion: { vigente: { precio: 4800, vigente_hasta: dias(3) }, ultimas: [] } } }, cob);
    af(c2.style.display !== 'none' && /sev-media/.test(c2.innerHTML) && /vence pronto/.test(c2.innerHTML) && /avión/.test(c2.innerHTML),
      'la general de avión que vence en 3 días → aviso sev-media «vence pronto» nombrando avión; fue ' + c2.innerHTML.slice(0, 160));
    af(!/sev-alta/.test(c2.innerHTML), 'y NO es sev-alta (nada está vencido)');
    // una vencida → sev-alta de siempre
    const c3 = await correr({ ok: true, ahora: AHORA, modos: {
      bus: { vigente: null, ultimas: [{ precio: 2500, vigente_hasta: dias(-2) }] },
      avion: { vigente: { precio: 4800, vigente_hasta: dias(25) }, ultimas: [] } } }, Object.assign({}, cob, { sin: { bus: [{ id: 'x', nombre: 'X' }], avion: [] } }));
    af(/sev-alta/.test(c3.innerHTML) && /autobús/.test(c3.innerHTML), 'la general del bus VENCIDA sigue en sev-alta');
    // vencida + por vencer → sev-alta y además «vence pronto»
    const c4 = await correr({ ok: true, ahora: AHORA, modos: {
      bus: { vigente: null, ultimas: [{ precio: 2500, vigente_hasta: dias(-2) }] },
      avion: { vigente: { precio: 4800, vigente_hasta: dias(2) }, ultimas: [] } } }, cob);
    af(/sev-alta/.test(c4.innerHTML) && /Y además vence pronto/.test(c4.innerHTML), 'vencida + por vencer → sev-alta con «Y además vence pronto»');
    // control positivo: BASE con avión en 3 días se CALLA (no avisaba por vencer)
    const srcB = fs.readFileSync(path.join(b.dir, 'kamehouse-radar.js'), 'utf8');
    af(!/porVencer/.test(srcB), 'control positivo: BASE no conocía porVencer');
  }

  // ══ [S] sabotaje con sha1 careado ════════════════════════════════════════
  console.log('[S] sabotaje');
  {
    const p = path.join(RAIZ, 'netlify/functions/admin-nube.js');
    const original = fs.readFileSync(p, 'utf8');
    const h0 = sha1(original);
    const ancla = 'precio_pp: Number(base.precio_pp),';
    af(original.includes(ancla), 'el ancla del sabotaje existe en el código');
    const saboteado = original.replace(ancla, 'precio_pp: Number(body.precio_pp || base.precio_pp),');
    af(sha1(saboteado) !== h0, 'el sabotaje MUTÓ el archivo (sha1 distinto)');
    const respaldo = p + '.n6bak';
    fs.copyFileSync(p, respaldo);
    let rojosSab = 0;
    try {
      fs.writeFileSync(p, saboteado);
      FILAS = armarFilas(); escrituras.length = 0;
      const rs = await admin({ accion: 'renovar', modo: 'bus', precio_pp: 999 });
      if (!(rs.res.statusCode === 200 && escrituras.length === 1 && Number(escrituras[0].precio_pp) === 2500)) rojosSab++;
    } finally {
      fs.copyFileSync(respaldo, p); fs.unlinkSync(respaldo);
    }
    af(sha1(fs.readFileSync(p, 'utf8')) === h0, 'el archivo quedó RESTAURADO byte a byte (sha1 ' + h0 + ')');
    af(rojosSab === 1, 'con el sabotaje (renovar obedece el precio del body) la aserción «sigue 2500» se pone ROJA — el verde mide algo; rojos del sabotaje: ' + rojosSab);
  }

  completo = true;
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.log('ARNÉS REVENTÓ: ' + (e && e.stack || e)); process.exit(1); });
