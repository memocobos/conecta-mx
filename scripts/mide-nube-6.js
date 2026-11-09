#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-nube-6.js — NUBE-6 + NUBE-6b · la Nube se simplifica
//
// Palabra de Memo (9-nov-2026): «nube voladora hacerlo manual se está volviendo
// complicado ¿hay forma de optimizarlo?» → «ps dale, primero arreglemos eso
// antes de salir a venta con los eventos 2027 de cdmx». Medido antes: 5 filas
// en toda la historia de la tabla, todas POR EVENTO, vigencias de 2-5 días,
// ninguna general — la cadencia semanal × 18 eventos × 2 modos no la sostuvo
// nadie y el sitio vivía en «cotiza por WhatsApp».
//
// 🔴 NUBE-6b, EL MISMO DÍA, por corrección de Memo: «el avión cambia bastante
// en cada evento, no puede ser general el costo» · «renovación cada 15 días el
// del vuelo, el bus cada 30 porque sí cambia». La primera versión le daba al
// avión una tarifa general «desde $X» — se RETIRÓ: el avión es POR EVENTO y no
// hereda nada; el bus general sigue a 30 días.
//
// Lo que este careo mide:
//   [L] El dueño (`_lib/nube`): `resolver`/`regiaEl` del avión JAMÁS caen a la
//       general aunque exista una fila general de avión; el bus sí hereda.
//       `VIGENCIA_DIAS` = {bus:30, avion:15} y su espejo del navegador es igual.
//   [R] `renovar` (handler REAL): re-captura con el MISMO precio/horarios desde
//       ahora; default bus 30 · avión 15; tope 90; sin propia → 404 y CERO
//       escrituras; avión GENERAL → 400 (también en `cotizar`); el precio del
//       body se ignora. 🔒 Solo INSERT (la red falsa truena ante PATCH/DELETE).
//   [C] `cobertura`: `detalle` por evento + `general` por modo; general.avion
//       es null SIEMPRE y el avión solo puede ser propio o sin.
//   [P] La pantalla: default de vigencia por modo (hoy Reynosa + 30 / + 15),
//       panorama con la general del bus + «renovar», la tarjeta del avión dice
//       «SIEMPRE POR EVENTO» y no ofrece renovar general; vencida con «Revivir».
//   [D] El index NO tiene «desde»: el card y el botón pintan el precio exacto
//       (la mudanza de NUBE-6 se revirtió byte a byte, salvo el pie del card).
//   [A] El Radar: no extraña la general del avión; el bus general por vencer y
//       un avión PROPIO por vencer → sev-media; todo vigente → se calla.
//   [S] Sabotaje con sha1 careado: renovar que copia el precio del body → rojo.
//
// ⚠️ SIN ANCLA DE HEAD A PROPÓSITO: carga del ÁRBOL DE TRABAJO (forma de
// `mide:req-b1`). BASE = el último commit SIN NUBE-6 (`3af80d1`) para el control
// positivo: ahí `renovar` es «Acción desconocida» y cobertura no trae detalle.
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
// BASE = el último commit sin NUBE-6. Se busca por su mensaje para no teclear un
// sha que caduque; si no se encuentra, se dice.
function sacarBase() {
  let sha = '';
  try { sha = execSync("git log --format=%H --grep='^REQ-EXITO-1' -n 1", { cwd: RAIZ, encoding: 'utf8' }).trim(); } catch (_) {}
  if (!sha) sha = process.env.BASE || '3af80d1';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n6-base-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}

const AHORA = Date.now();
const dias = (n) => new Date(AHORA + n * 86400000).toISOString();

// ── EL PADRÓN FALSO ────────────────────────────────────────────────────────
// general bus VIGENTE (vence en 20 días) · una general de AVIÓN vigente que
// NADIE debe leer (el control de NUBE-6b: si alguien la hereda, es rojo) ·
// edc27 con bus PROPIO y avión PROPIO que vence en 3 días · louist sin nada.
function armarFilas() {
  return [
    { id: 'g1', modo: 'bus', evento_id: null, precio_pp: 2500, vigente_desde: dias(-10), vigente_hasta: dias(20),
      horarios: 'Turistar · sale 9 pm', nota: 'general bus', capturado_por: 'milk@conectareynosa.mx', creado_en: dias(-10) },
    { id: 'g2', modo: 'avion', evento_id: null, precio_pp: 4800, vigente_desde: dias(-2), vigente_hasta: dias(20),
      horarios: 'Viva · 7:10 am', nota: 'general avión QUE NO DEBE LEERSE', capturado_por: 'milk@conectareynosa.mx', creado_en: dias(-2) },
    { id: 'e1', modo: 'bus', evento_id: 'edc27', precio_pp: 2100, vigente_desde: dias(-4), vigente_hasta: dias(10),
      horarios: 'directo al Autódromo', nota: 'propio edc27', capturado_por: 'milk@conectareynosa.mx', creado_en: dias(-4) },
    { id: 'e2', modo: 'avion', evento_id: 'edc27', precio_pp: 5200, vigente_desde: dias(-12), vigente_hasta: dias(3),
      horarios: 'Volaris · 6:40 am', nota: 'avión edc27', capturado_por: 'milk@conectareynosa.mx', creado_en: dias(-12) },
  ];
}
let FILAS = armarFilas();

(async function main() {
  process.on('exit', marcador);
  const b = sacarBase();
  console.log('BASE ' + b.sha.slice(0, 7) + ' (sin NUBE-6)   HEAD = árbol de trabajo\n');

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
  // Un lector de PostgREST falso para la lib, sin pasar por el handler.
  const pedirFalso = async (qs) => {
    armarRed(RAIZ);
    const r = await global.fetch('https://x/rest/v1/' + qs, {});
    return r.json();
  };

  // ══ [L] el dueño ═════════════════════════════════════════════════════════
  console.log('[L] el dueño: el avión no hereda');
  {
    limpiar(RAIZ);
    const lib = require(path.join(RAIZ, 'netlify/functions/_lib/nube.js'));
    FILAS = armarFilas();
    af(Array.isArray(lib.MODOS_SIN_GENERAL) && lib.MODOS_SIN_GENERAL.includes('avion') && !lib.MODOS_SIN_GENERAL.includes('bus'),
      'MODOS_SIN_GENERAL = [avion]; fue ' + JSON.stringify(lib.MODOS_SIN_GENERAL));
    af(lib.admiteGeneral('bus') === true && lib.admiteGeneral('avion') === false, 'admiteGeneral: bus sí, avión no');
    af(lib.VIGENCIA_DIAS && lib.VIGENCIA_DIAS.bus === 30 && lib.VIGENCIA_DIAS.avion === 15,
      'VIGENCIA_DIAS = {bus:30, avion:15}; fue ' + JSON.stringify(lib.VIGENCIA_DIAS));
    // control de premisa: la general de avión EXISTE y está vigente en el padrón
    const gAv = FILAS.find((f) => f.id === 'g2');
    af(Date.parse(gAv.vigente_desde) <= AHORA && AHORA < Date.parse(gAv.vigente_hasta), 'premisa: el padrón trae una general de avión VIGENTE (el control tiene dientes)');
    const rAvGen = await lib.resolver(pedirFalso, 'avion', null, AHORA);
    af(rAvGen === null, '🔒 resolver(avion, general) → null AUNQUE exista la fila general vigente; fue ' + JSON.stringify(rAvGen));
    const rAvLou = await lib.resolver(pedirFalso, 'avion', 'louist', AHORA);
    af(rAvLou === null, '🔒 resolver(avion, louist) → null: un evento sin avión propio NO hereda la general; fue ' + JSON.stringify(rAvLou));
    const rAvEdc = await lib.resolver(pedirFalso, 'avion', 'edc27', AHORA);
    af(rAvEdc && Number(rAvEdc.precio) === 5200 && rAvEdc.heredado === false, 'resolver(avion, edc27) → su propia 5200, heredado:false');
    const rBusLou = await lib.resolver(pedirFalso, 'bus', 'louist', AHORA);
    af(rBusLou && Number(rBusLou.precio) === 2500 && rBusLou.heredado === true, 'control: el BUS de louist SÍ hereda la general (2500, heredado:true)');
    const vig = await lib.vigentes(pedirFalso, AHORA, null);
    af(vig.bus && Number(vig.bus.precio) === 2500 && vig.avion === null, 'vigentes(general) → bus 2500 · avion null');
    const hLou = await lib.regiaEl(pedirFalso, 'avion', AHORA, 'louist');
    af(hLou && hLou.heredado === false && hLou.general === 'no_aplica' && hLou.estado !== 'vigente',
      'regiaEl(avion, louist, hoy) NO hereda: heredado:false, general:no_aplica; fue ' + JSON.stringify(hLou).slice(0, 160));
    const hBus = await lib.regiaEl(pedirFalso, 'bus', AHORA, 'louist');
    af(hBus && hBus.estado === 'vigente' && hBus.heredado === true, 'control: regiaEl(bus, louist, hoy) sí hereda la general');
    // el espejo del navegador
    const kn = fs.readFileSync(path.join(RAIZ, 'kamehouse-nube.js'), 'utf8');
    const mDias = /const NUBE_DIAS = (\{[^}]+\})/.exec(kn);
    af(mDias && JSON.stringify(eval('(' + mDias[1] + ')')) === JSON.stringify(lib.VIGENCIA_DIAS), 'el espejo NUBE_DIAS del navegador es IGUAL a VIGENCIA_DIAS del dueño');
    const mSin = /const NUBE_SIN_GENERAL = (\[[^\]]*\])/.exec(kn);
    af(mSin && JSON.stringify(eval(mSin[1])) === JSON.stringify(lib.MODOS_SIN_GENERAL), 'el espejo NUBE_SIN_GENERAL es IGUAL a MODOS_SIN_GENERAL');
    // ningún bebedor arma su propia excepción del avión
    for (const f of ['admin-cotizador.js', 'admin-coordi-asignaciones.js', 'nube-vigente.js', 'admin-nube.js']) {
      const t = fs.readFileSync(path.join(RAIZ, 'netlify/functions', f), 'utf8').replace(/\/\/[^\n]*/g, '');
      af(!/evento_id=is\.null/.test(t), f + ' no arma su propia consulta general (la herencia vive en el dueño)');
    }
  }

  // ══ [R] renovar, por el handler REAL ═════════════════════════════════════
  console.log('[R] renovar');
  {
    const rb = await admin({ accion: 'renovar', modo: 'bus' }, b.dir);
    af(rb.res.statusCode === 400 && /Acción desconocida/.test(rb.d.error || ''),
      'control positivo: en BASE `renovar` es «Acción desconocida»; dio ' + rb.res.statusCode);

    FILAS = armarFilas(); escrituras.length = 0;
    const r1 = await admin({ accion: 'renovar', modo: 'bus' });
    af(r1.res.statusCode === 200 && r1.d.ok === true, 'renovar general bus → 200; dio ' + r1.res.statusCode + ' ' + JSON.stringify(r1.d).slice(0, 160));
    af(escrituras.length === 1, 'escribe EXACTAMENTE una fila; escribió ' + escrituras.length);
    const w = escrituras[0] || {};
    af(w.modo === 'bus' && w.evento_id === null && Number(w.precio_pp) === 2500 && w.horarios === 'Turistar · sale 9 pm',
      'la fila nueva es bus/general con el MISMO precio y horarios; fue ' + JSON.stringify({ modo: w.modo, ev: w.evento_id, p: w.precio_pp, h: w.horarios }));
    af(/^renovada sin cambio el \d{4}-\d{2}-\d{2} \(\+30 días\) · general bus$/.test(w.nota || ''),
      'la nota dice «renovada sin cambio el YYYY-MM-DD (+30 días) · <nota vieja>»; fue ' + JSON.stringify(w.nota));
    af(w.capturado_por === 'milk@conectareynosa.mx', 'capturado_por sale del TOKEN');
    const desde = Date.parse(w.vigente_desde), hasta = Date.parse(w.vigente_hasta);
    af(Math.abs(desde - Date.now()) < 60000 && Math.abs((hasta - desde) - 30 * 86400000) < 1000, 'bus: desde ≈ ahora y 30 días exactos por default');
    af(r1.d.dias === 30 && r1.d.renovada_de && Number(r1.d.renovada_de.precio) === 2500, 'respuesta: dias 30 + renovada_de');

    // avión POR EVENTO, default 15
    FILAS = armarFilas(); escrituras.length = 0;
    const r2 = await admin({ accion: 'renovar', modo: 'avion', evento_id: 'edc27' });
    af(r2.res.statusCode === 200 && escrituras.length === 1 && escrituras[0].evento_id === 'edc27' && Number(escrituras[0].precio_pp) === 5200 && r2.d.dias === 15,
      '🔒 renovar avión de edc27 → una fila propia de 5200 con DEFAULT 15 días; dio ' + r2.res.statusCode + ' dias=' + r2.d.dias);
    af(() => Math.abs((Date.parse(escrituras[0].vigente_hasta) - Date.parse(escrituras[0].vigente_desde)) - 15 * 86400000) < 1000, 'y la vigencia nueva mide 15 días');
    af(() => /\(\+15 días\)/.test(escrituras[0].nota), 'la nota dice +15 días');

    // 🔒 avión GENERAL → 400, en renovar Y en cotizar, cero escrituras
    FILAS = armarFilas(); escrituras.length = 0;
    const r3 = await admin({ accion: 'renovar', modo: 'avion' });
    af(r3.res.statusCode === 400 && /POR EVENTO/.test(r3.d.error || '') && escrituras.length === 0,
      '🔒 renovar avión GENERAL → 400 «por evento», cero escrituras; dio ' + r3.res.statusCode + ' ' + (r3.d.error || ''));
    const r3b = await admin({ accion: 'cotizar', modo: 'avion', precio_pp: 4800, vigente_hasta: dias(15) });
    af(r3b.res.statusCode === 400 && /POR EVENTO/.test(r3b.d.error || '') && escrituras.length === 0,
      '🔒 cotizar avión GENERAL → 400, cero escrituras; dio ' + r3b.res.statusCode + ' ' + (r3b.d.error || ''));
    const r3c = await admin({ accion: 'cotizar', modo: 'bus', precio_pp: 2600, vigente_hasta: dias(30) });
    af(r3c.res.statusCode === 200 && escrituras.length === 1, 'control: cotizar BUS general sigue entrando (200, 1 fila)');

    // tope 90 / piso 1
    escrituras.length = 0;
    const r4 = await admin({ accion: 'renovar', modo: 'bus', dias: 91 });
    af(r4.res.statusCode === 400 && /1 a 90/.test(r4.d.error || '') && escrituras.length === 0, 'dias:91 → 400 y cero escrituras');
    const r4b = await admin({ accion: 'renovar', modo: 'bus', dias: 0 });
    af(r4b.res.statusCode === 400 && escrituras.length === 0, 'dias:0 → 400 y cero escrituras');

    // evento sin propia NO copia la general (bus) → 404
    FILAS = armarFilas(); escrituras.length = 0;
    const r5 = await admin({ accion: 'renovar', modo: 'bus', evento_id: 'louist' });
    af(r5.res.statusCode === 404 && /louist/.test(r5.d.error || '') && /Captura una primero/.test(r5.d.error || '') && escrituras.length === 0,
      'renovar louist/bus (sin propia) → 404 y CERO escrituras: no le inventa una propia copiando la general');
    const r5b = await admin({ accion: 'renovar', modo: 'avion', evento_id: 'louist' });
    af(r5b.res.statusCode === 404 && escrituras.length === 0, 'renovar louist/avión (sin propia) → 404 y cero escrituras');

    // vencida → revive
    FILAS = armarFilas().map((f) => f.id === 'e2' ? Object.assign({}, f, { vigente_hasta: dias(-2) }) : f);
    escrituras.length = 0;
    const r6 = await admin({ accion: 'renovar', modo: 'avion', evento_id: 'edc27' });
    af(r6.res.statusCode === 200 && escrituras.length === 1 && Number(escrituras[0].precio_pp) === 5200, 'con el avión de edc27 VENCIDO, renovar lo REVIVE (5200) desde ahora');

    // precio del body ignorado
    FILAS = armarFilas(); escrituras.length = 0;
    const r7 = await admin({ accion: 'renovar', modo: 'bus', precio_pp: 999 });
    af(r7.res.statusCode === 200 && escrituras.length === 1 && Number(escrituras[0].precio_pp) === 2500, 'un precio_pp en el body se IGNORA (sigue 2500)');

    const src = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-nube.js'), 'utf8');
    af(/const ACCIONES = \[[^\]]*'renovar'[^\]]*\]/.test(src), '`renovar` está en `ACCIONES`');
    af(!/RENOVAR_DIAS_DEFAULT/.test(src) && /VIGENCIA_DIAS\[modo\]/.test(src), 'el default de días se le pide al dueño (VIGENCIA_DIAS[modo]), no a una constante local');
  }

  // ══ [C] cobertura ════════════════════════════════════════════════════════
  console.log('[C] cobertura');
  {
    FILAS = armarFilas();
    const c = await admin({ accion: 'cobertura' });
    af(c.res.statusCode === 200 && c.d.ok === true, 'cobertura → 200');
    af(Array.isArray(c.d.detalle) && c.d.detalle.length === c.d.total && c.d.total > 0, () => 'detalle trae UNA fila por evento (' + c.d.total + ')');
    const edc = (c.d.detalle || []).find((x) => x.id === 'edc27');
    af(edc && edc.bus && edc.bus.estado === 'propio' && Number(edc.bus.precio) === 2100, () => 'edc27.bus = propio 2100; fue ' + JSON.stringify(edc && edc.bus));
    af(edc && edc.avion && edc.avion.estado === 'propio' && Number(edc.avion.precio) === 5200, () => 'edc27.avion = propio 5200; fue ' + JSON.stringify(edc && edc.avion));
    const otro = (c.d.detalle || []).find((x) => x.id !== 'edc27');
    af(otro && otro.bus && otro.bus.estado === 'heredado' && Number(otro.bus.precio) === 2500, () => 'otro evento hereda el BUS general; fue ' + JSON.stringify(otro && otro.bus));
    af(otro && otro.avion && otro.avion.estado === 'sin', () => '🔒 otro evento SIN avión propio sale «sin» — no hereda la general de avión aunque exista; fue ' + JSON.stringify(otro && otro.avion));
    af(() => (c.d.detalle || []).every((x) => !x.avion || x.avion.estado !== 'heredado'), '🔒 NINGÚN evento trae avion.estado=heredado');
    af(c.d.general && c.d.general.bus && Number(c.d.general.bus.precio) === 2500, 'general.bus = 2500');
    af(c.d.general && c.d.general.avion === null, '🔒 general.avion es NULL aunque la tabla traiga una fila general de avión');
    af(c.d.propios && c.d.propios.bus === 1 && c.d.propios.avion === 1, () => 'propios {bus:1, avion:1}; fue ' + JSON.stringify(c.d.propios));
    af(c.d.sin && c.d.sin.bus.length === 0 && c.d.sin.avion.length === c.d.total - 1, () => 'sin.bus=0 · sin.avion = todos menos edc27; fue ' + JSON.stringify({ b: c.d.sin.bus.length, a: c.d.sin.avion.length, t: c.d.total }));
    const cb = await admin({ accion: 'cobertura' }, b.dir);
    af(cb.res.statusCode === 200 && cb.d.detalle === undefined && cb.d.general === undefined, 'control positivo: en BASE cobertura NO trae detalle ni general');
  }

  // ══ [P] la pantalla ══════════════════════════════════════════════════════
  console.log('[P] la pantalla');
  {
    const src = fs.readFileSync(path.join(RAIZ, 'kamehouse-nube.js'), 'utf8');
    const nodos = {};
    const ctx = {
      console, Date, Math, Number, String, JSON, Array, Object, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, Intl,
      document: { getElementById: (id) => nodos[id] || null, querySelectorAll: () => [], querySelector: () => null },
      khAdminFetch: async () => { throw new Error('no red en vm'); }, khErrorCarga: () => {}, khToast: () => {}, showToast: () => {}, showPage: () => {},
      confirm: () => true, alert: () => {}, localStorage: { getItem: () => null, setItem: () => {} }, setTimeout, clearTimeout,
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    let cargo = true;
    try { vm.runInContext(src, ctx, { filename: 'kamehouse-nube.js' }); } catch (e) { cargo = false; console.log('   ! no cargó: ' + e.message); }
    af(cargo, 'kamehouse-nube.js carga en vm');
    const leer = (expr) => { try { return vm.runInContext(expr, ctx); } catch (_) { return undefined; } };
    af(leer('NUBE_DIAS_DEFAULT') === undefined, '⚰️ NUBE_DIAS_DEFAULT (una sola cadencia) ya no existe');
    const hoyR = new Date().toLocaleString('sv-SE', { timeZone: 'America/Matamoros' }).slice(0, 10);
    const [a, m, d] = hoyR.split('-').map(Number);
    const esp = (n) => new Date(Date.UTC(a, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
    af(leer("_nubeDefaultHastaISO('bus')") === esp(30), "_nubeDefaultHastaISO('bus') = hoy Reynosa + 30 (" + esp(30) + '); fue ' + leer("_nubeDefaultHastaISO('bus')"));
    af(leer("_nubeDefaultHastaISO('avion')") === esp(15), "_nubeDefaultHastaISO('avion') = hoy + 15 (" + esp(15) + '); fue ' + leer("_nubeDefaultHastaISO('avion')"));
    af(leer('_nubeProximoDomingoISO()') === esp(30), 'el alias viejo contesta el default del bus');
    af(leer("_nubeAdmiteGeneral('bus')") === true && leer("_nubeAdmiteGeneral('avion')") === false, '_nubeAdmiteGeneral: bus sí, avión no');
    af(typeof ctx.nubeRenovar === 'function' && typeof ctx.nubeIrA === 'function' && typeof ctx._nubePanorama === 'function' && typeof ctx.nubeModoCambio === 'function',
      'existen nubeRenovar, nubeIrA, _nubePanorama y nubeModoCambio');
    // nubeModoCambio mueve el default con el modo
    nodos['nube-modo'] = { value: 'avion' };
    nodos['nube-hasta-fecha'] = { value: '', dataset: {} };
    nodos['nube-hasta-default'] = { textContent: '' };
    nodos['nube-aviso-general'] = { style: { display: 'none' } };
    nodos['nube-evento'] = { value: '__general__' };
    nodos['nube-previa'] = { textContent: '', innerHTML: '' };
    nodos['nube-hasta-hora'] = { value: '23:59' };
    ctx.nubeModoCambio();
    af(nodos['nube-hasta-fecha'].value === esp(15) && /15 días/.test(nodos['nube-hasta-default'].textContent), 'elegir avión pone la vigencia en +15 y la etiqueta dice 15 días; fue ' + nodos['nube-hasta-fecha'].value + ' / ' + nodos['nube-hasta-default'].textContent);
    af(nodos['nube-aviso-general'].style.display === '', 'con avión + «General CDMX» elegido se enciende el aviso «el avión se cotiza por evento»');
    nodos['nube-modo'].value = 'bus';
    ctx.nubeModoCambio();
    af(nodos['nube-hasta-fecha'].value === esp(30) && nodos['nube-aviso-general'].style.display === 'none', 'cambiar a bus → +30 y el aviso se apaga');
    nodos['nube-hasta-fecha'].dataset.auto = ''; nodos['nube-hasta-fecha'].value = '2027-01-01';
    nodos['nube-modo'].value = 'avion';
    ctx.nubeModoCambio();
    af(nodos['nube-hasta-fecha'].value === '2027-01-01', 'una fecha tecleada a mano NO se pisa al cambiar de modo');
    // panorama con respuesta sembrada
    const resp = {
      ok: true, total: 2, ahora: AHORA,
      sin: { bus: [], avion: [{ id: 'louist', nombre: 'Louis Tomlinson' }] }, propios: { bus: 1, avion: 1 },
      general: { bus: { precio: 2500, vigente_hasta: dias(20), horarios: 'Turistar · sale 9 pm' }, avion: null },
      detalle: [
        { id: 'edc27', nombre: 'EDC 2027', ds: '2027-02-19', bus: { estado: 'propio', precio: 2100 }, avion: { estado: 'propio', precio: 5200, vigente_hasta: dias(3) } },
        { id: 'louist', nombre: 'Louis Tomlinson', ds: '2027-05-01', bus: { estado: 'heredado', precio: 2500 }, avion: { estado: 'sin' } },
      ],
    };
    let html = '';
    try { html = ctx._nubePanoramaHtml(resp); } catch (e) { console.log('   ! _nubePanoramaHtml reventó: ' + e.message); }
    af(html.length > 200, '_nubePanoramaHtml arma HTML');
    af(/TARIFA GENERAL CDMX/.test(html) && /\$2,500/.test(html) && /nubeRenovar\('bus',null\)/.test(html) && /renovar 30 días/.test(html),
      'la general del BUS trae su precio y «↻ Sigue igual · renovar 30 días»');
    af(/SIEMPRE POR EVENTO/.test(html) && /15 días/.test(html), 'la tarjeta del avión dice «SIEMPRE POR EVENTO · vigencia 15 días»');
    af(!/nubeRenovar\('avion',null\)/.test(html) && !/SIN TARIFA GENERAL/.test(html), '🔒 el avión NO ofrece renovar/capturar una general ni la extraña');
    af(/1<\/b> con avión propio/.test(html) && /1<\/b> sin avión/.test(html), 'la tarjeta del avión cuenta 1 propio · 1 sin');
    af(/EDC 2027/.test(html) && /propio/.test(html) && /Louis Tomlinson/.test(html) && /sin precio/.test(html) && /nubeIrA\('edc27',''\)/.test(html), 'las filas por evento traen chips y llevan a su evento');
    const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
    af(/30 días bus · 15 avión/.test(kh), 'kamehouse.html anuncia el default por modo (DEFAULTS-1 b)');
    af(/onchange="nubeModoCambio\(\)"/.test(kh) && /id="nube-aviso-general"/.test(kh), 'el select de modo llama a nubeModoCambio y existe el aviso del avión');
    af(/siempre por evento \(rige 15 días\)/.test(kh), 'la ayuda de la pantalla dice que el avión es por evento a 15 días');
  }

  // ══ [D] el index: sin «desde» ════════════════════════════════════════════
  console.log('[D] el index');
  {
    const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const idxB = fs.readFileSync(path.join(b.dir, 'index.html'), 'utf8');
    af(!/nubeAproxLabel/.test(idx) && !/data-aprox/.test(idx), '⚰️ el «desde» de NUBE-6 (nubeAproxLabel / data-aprox) se RETIRÓ del index');
    const corta = (src, inicio) => {
      const i = src.indexOf(inicio); if (i < 0) throw new Error('no está ' + inicio);
      let j = src.indexOf('{', i), prof = 0;
      for (; j < src.length; j++) { if (src[j] === '{') prof++; else if (src[j] === '}') { prof--; if (!prof) break; } }
      return src.slice(i, j + 1);
    };
    af(sha1(corta(idx, 'function _tBoton(')) === sha1(corta(idxB, 'function _tBoton(')), '_tBoton es byte a byte el de BASE (sin «desde»)');
    af(sha1(corta(idx, 'function buildTransporteButtons(')) === sha1(corta(idxB, 'function buildTransporteButtons(')), 'buildTransporteButtons es byte a byte el de BASE');
    const cardH = corta(idx, 'function nubeCardHtml('), cardB = corta(idxB, 'function nubeCardHtml(');
    af(cardH.replace('Tarifa vigente por persona.', 'Tarifa de esta semana.') === cardB,
      'nubeCardHtml es el de BASE salvo el pie («Tarifa vigente por persona» en vez de «de esta semana» — la cadencia ya no es semanal)');
    af(/Tarifa vigente por persona\. El precio final se confirma al reservar\./.test(idx), 'el pie del card dice «Tarifa vigente por persona»');
  }

  // ══ [A] el Radar ═════════════════════════════════════════════════════════
  console.log('[A] el Radar');
  {
    const src = fs.readFileSync(path.join(RAIZ, 'kamehouse-radar.js'), 'utf8');
    const i = src.indexOf('async function _radarNubeAviso(');
    af(i > 0, 'existe _radarNubeAviso');
    let j = src.indexOf('{', i), prof = 0;
    for (; j < src.length; j++) { if (src[j] === '{') prof++; else if (src[j] === '}') { prof--; if (!prof) break; } }
    const fn = src.slice(i, j + 1);
    af(/RAD_NUBE_AVISO_DIAS = 5/.test(fn) && /RAD_NUBE_SIN_GENERAL = \['avion'\]/.test(fn), 'umbral 5 días y el avión sin general, con nombre');
    async function correr(listar, cobertura) {
      const caja = { style: { display: '' }, innerHTML: '' };
      const ctx = {
        console, Date, Number, Math, String, JSON, Array, Object, Set, isFinite, Intl,
        document: { getElementById: (id) => id === 'rdr-nube-aviso' ? caja : null },
        khAdminFetch: async (u, o) => { const body = JSON.parse(o.body); const d = body.accion === 'listar' ? listar : cobertura; return { ok: true, json: async () => d }; },
        showPage: () => {}, RAD_TZ: 'America/Matamoros',
      };
      vm.createContext(ctx);
      vm.runInContext(fn + '\n', ctx);
      await ctx._radarNubeAviso();
      return caja;
    }
    const cobOk = { ok: true, total: 18, sin: { bus: [], avion: [] }, propios: { bus: 0, avion: 18 }, general: {},
      detalle: [{ id: 'edc27', nombre: 'EDC 2027', bus: { estado: 'heredado', precio: 2500 }, avion: { estado: 'propio', precio: 5200, vigente_hasta: dias(12) } }] };
    // la general del avión NO EXISTE (listar la trae null) → nada que extrañar → se calla
    const c1 = await correr({ ok: true, ahora: AHORA, modos: { bus: { vigente: { precio: 2500, vigente_hasta: dias(20) }, ultimas: [] }, avion: { vigente: null, ultimas: [] } } }, cobOk);
    af(c1.style.display === 'none' && c1.innerHTML === '', '🔒 sin general de AVIÓN y con todo lo demás en orden, el Radar SE CALLA (no la extraña)');
    // bus general por vencer → sev-media
    const c2 = await correr({ ok: true, ahora: AHORA, modos: { bus: { vigente: { precio: 2500, vigente_hasta: dias(3) }, ultimas: [] }, avion: { vigente: null, ultimas: [] } } }, cobOk);
    af(c2.style.display !== 'none' && /sev-media/.test(c2.innerHTML) && /vence pronto/.test(c2.innerHTML) && /autobús/.test(c2.innerHTML) && !/sev-alta/.test(c2.innerHTML),
      'bus general que vence en 3 días → sev-media «vence pronto»; fue ' + c2.innerHTML.slice(0, 120));
    // avión PROPIO por vencer → sev-media nombrando el evento
    const cobAv = JSON.parse(JSON.stringify(cobOk)); cobAv.detalle[0].avion.vigente_hasta = dias(2);
    const c3 = await correr({ ok: true, ahora: AHORA, modos: { bus: { vigente: { precio: 2500, vigente_hasta: dias(20) }, ultimas: [] }, avion: { vigente: null, ultimas: [] } } }, cobAv);
    af(/sev-media/.test(c3.innerHTML) && /avión de EDC 2027/.test(c3.innerHTML), 'el avión PROPIO de EDC que vence en 2 días → sev-media nombrando el evento; fue ' + c3.innerHTML.slice(0, 160));
    // bus general vencida → sev-alta
    const c4 = await correr({ ok: true, ahora: AHORA, modos: { bus: { vigente: null, ultimas: [{ precio: 2500, vigente_hasta: dias(-2) }] }, avion: { vigente: null, ultimas: [] } } },
      Object.assign({}, cobOk, { sin: { bus: [{ id: 'x', nombre: 'X' }], avion: [] } }));
    af(/sev-alta/.test(c4.innerHTML) && /autobús/.test(c4.innerHTML) && !/avión \(nunca/.test(c4.innerHTML), 'la general del bus VENCIDA sigue en sev-alta, y el avión no sale como «nunca cotizado»');
    const srcB = fs.readFileSync(path.join(b.dir, 'kamehouse-radar.js'), 'utf8');
    af(!/porVencer/.test(srcB), 'control positivo: BASE no conocía porVencer');
  }

  // ══ [S] sabotaje ═════════════════════════════════════════════════════════
  console.log('[S] sabotaje');
  {
    const p = path.join(RAIZ, 'netlify/functions/admin-nube.js');
    const original = fs.readFileSync(p, 'utf8');
    const h0 = sha1(original);
    const ancla = 'precio_pp: Number(base.precio_pp),';
    af(original.includes(ancla), 'el ancla del sabotaje existe');
    const saboteado = original.replace(ancla, 'precio_pp: Number(body.precio_pp || base.precio_pp),');
    af(sha1(saboteado) !== h0, 'el sabotaje MUTÓ el archivo');
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
    af(rojosSab === 1, 'con el sabotaje la aserción «sigue 2500» se pone ROJA — el verde mide algo');
    // segundo sabotaje: el dueño deja heredar al avión
    const pl = path.join(RAIZ, 'netlify/functions/_lib/nube.js');
    const ol = fs.readFileSync(pl, 'utf8'); const hl = sha1(ol);
    const sl = ol.replace("const MODOS_SIN_GENERAL = ['avion'];", "const MODOS_SIN_GENERAL = [];");
    af(sha1(sl) !== hl, 'el 2º sabotaje MUTÓ el dueño');
    fs.copyFileSync(pl, pl + '.n6bak');
    let rojos2 = 0;
    try {
      fs.writeFileSync(pl, sl);
      FILAS = armarFilas();
      const c = await admin({ accion: 'cobertura' });
      if (!(c.d.general && c.d.general.avion === null)) rojos2++;
    } finally { fs.copyFileSync(pl + '.n6bak', pl); fs.unlinkSync(pl + '.n6bak'); }
    af(sha1(fs.readFileSync(pl, 'utf8')) === hl, 'el dueño quedó RESTAURADO byte a byte');
    af(rojos2 === 1, 'con el avión heredando (sabotaje al dueño), «general.avion es null» se pone ROJA');
  }

  completo = true;
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.log('ARNÉS REVENTÓ: ' + (e && e.stack || e)); process.exit(1); });
