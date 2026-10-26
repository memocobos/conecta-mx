#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-mas-alla-1.js — EL MÁS ALLÁ: el deep-link con puertas, el wizard del
// agotado, el endpoint público, el admin y los cables de la pantalla.
//
// Orden de Memo (26-oct-2026): «si la gente tiene el link directo les aparece
// como si estuviera activo» → el deep-link aprende los estados; el agotado
// levanta SOLICITUD (wizard) por las TRES puertas; EL MÁS ALLÁ en KameHouse
// la atiende (roshi/bulma/milk).
//
// ⚠️ SIN ANCLA A PROPÓSITO (carga del ÁRBOL DE TRABAJO, como mide:req-b1 y
// mide:cuadre-aplicar): no sufre la trampa del commit y no puede traer control
// positivo por commit — sus controles son positivos por construcción (sembrar
// el caso contrario y verlo tomar la otra ruta). Si algún día se ancla, va con
// su BASE a la vez.
//
// 🔒 El deep-link se mide POR EL IIFE REAL rebanado del index y corrido en vm
// (la ley de sorteo-fotos-1: el careo entra por el constructor de la página,
// no por una re-implementación). `_evVeredicto` entra REAL, rebanado del mismo
// archivo — es el dueño del veredicto y re-implementarlo aquí mediría mi idea
// del dato.
//
// Se corre:  npm run mide:mas-alla-1
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let verde = 0, rojo = 0, completo = false;
const fallos = [];
function af(cond, msg) {
  let ok = false, extra = '';
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; }
  catch (e) { ok = false; extra = '  [EXCEPCIÓN: ' + e.message + ']'; }
  if (ok) { verde++; return; }
  let t; try { t = (typeof msg === 'function') ? msg() : msg; }
  catch (e) { t = '(el mensaje también reventó: ' + e.message + ')'; }
  rojo++; fallos.push(t + extra); console.log('   ✗ ' + t + extra);
}
function ver(fn) { try { const v = fn(); return v === undefined ? 'undefined' : JSON.stringify(v); } catch (e) { return '«no se pudo leer: ' + e.message + '»'; } }
process.on('exit', () => {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  if (verde + rojo === 0) { console.log('⚠️  NADA MEDIDO · cero aserciones corrieron: esto NO es un verde'); return; }
  console.log((rojo ? '❌ ROJO · ' : '✅ VERDE · ') + verde + ' en verde, ' + rojo + ' en rojo');
  fallos.slice(0, 20).forEach((f) => console.log('  · ' + f));
});

// Rebana una función por nombre, cortando por BALANCE DE LLAVES.
function funcionDe(src, nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return null;
}
// Rebana el IIFE del deep-link: del ancla de su comentario al `})();` balanceado.
function iifeDeepLink(src) {
  const ancla = src.indexOf('// Deep link: ?evento=morat');
  if (ancla < 0) return null;
  const ini = src.indexOf('(function(){', ancla);
  if (ini < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', ini); k < src.length; k++) {
    if (src[k] === '{') d++;
    if (src[k] === '}') { d--; if (d === 0) return src.slice(ini, src.indexOf(';', k) + 1); }
  }
  return null;
}

(async function main() {
  const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

  // ── [A] EL DEEP-LINK, POR EL IIFE REAL ─────────────────────────────────
  console.log('[A] el deep-link rutea por el veredicto');
  const fnVer = funcionDe(idx, '_evVeredicto');
  const iife = iifeDeepLink(idx);
  af(!!fnVer, '_evVeredicto no se pudo rebanar del index');
  af(!!iife, 'el IIFE del deep-link no se pudo rebanar (¿se movió su comentario ancla?)');

  // El EV de siembra: cada estado con su cara. Fechas RELATIVAS (la ley de
  // NUBE4: una fecha tecleada comparada contra el reloj real es una bomba).
  const futuro = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const pasado = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
  const EVS = {
    vivo:      { id: 'vivo1', a: 'Vivo Uno', f: '1 dic 2026', ds: futuro, v: 'Arena', st: '', zonas: [{ n: 'GA', p: 1000 }] },
    agotadoSt: { id: 'agst', a: 'Agotado St', f: '2 dic 2026', ds: futuro, v: 'Arena', st: 'agotado', zonas: [{ n: 'GA', p: 1000 }] },
    // El AGOTADO AUTOMÁTICO que Memo preguntó: st vacío, TODAS las zonas ag —
    // _evVeredicto lo enciende solo (el auto-semáforo).
    agotadoAuto: { id: 'agauto', a: 'Agotado Auto', f: '3 dic 2026', ds: futuro, v: 'Arena', st: '', zonas: [{ n: 'GA', p: 1000, ag: 1 }, { n: 'VIP', p: 2000, ag: 1 }] },
    proxi:     { id: 'prox1', a: 'Proxi Uno', f: 'Por confirmar', ds: futuro, v: 'Arena', st: 'proximamente', zonas: [] },
    pronto:    { id: 'pron1', a: 'Pronto Uno', f: 'Por confirmar', ds: futuro, v: 'Arena', st: 'pronto', zonas: [] },
    pasadoEv:  { id: 'pas1', a: 'Pasado Uno', f: '1 ene 2026', ds: pasado, v: 'Arena', st: '', zonas: [{ n: 'GA', p: 1000 }], _past: true },
    // rideOnly con zonas agotadas y RIDE vivo: el veredicto NO enciende isAg
    // (RIDE-VIVO-1) — el deep-link debe seguir al cotizador, no al wizard.
    rideVivo:  { id: 'ride1', a: 'Ride Uno', f: '4 dic 2026', ds: futuro, v: 'Arena', st: '', rideOnly: true, ride: 2700, zonas: [{ n: 'GA', p: 1000, ag: 1 }] },
  };

  function correrDeepLink(slug) {
    const llamadas = { showDetail: 0, avisame: 0, masAlla: 0, href: null, replaceState: 0 };
    const ctx = vm.createContext({
      window: { location: { pathname: '/' + slug, search: '', hash: '' } },
      URLSearchParams,
      EV: Object.values(EVS),
      history: { replaceState: () => { llamadas.replaceState++; } },
      // readyState 'complete': los diferidos a DOM-listo corren AL TIRO — así
      // el espía ve la llamada en la misma pasada.
      document: { readyState: 'complete', addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') fn(); } },
      showDetail: () => { llamadas.showDetail++; },
      abrirWaitlistModal: () => { llamadas.avisame++; },
      abrirMasAllaModal: () => { llamadas.masAlla++; },
      Date, Number, String, Array, Object, Math, JSON,
    });
    Object.defineProperty(ctx.window.location, 'href', { set(v) { llamadas.href = v; }, get() { return ''; } });
    vm.runInContext(fnVer, ctx);           // el dueño del veredicto, REAL
    vm.runInContext(iife, ctx);            // el deep-link, REAL
    return llamadas;
  }

  // Control del INSTRUMENTO: el evento VIVO tiene que llegar a showDetail — si
  // no llega, el vm no está corriendo el camino y los ceros de abajo no dicen nada.
  const cVivo = correrDeepLink('vivo1');
  af(cVivo.showDetail === 1 && cVivo.masAlla === 0 && cVivo.avisame === 0,
     () => '🔴 CONTROL DEL INSTRUMENTO: el evento VIVO tenía que abrir showDetail. ' + ver(() => cVivo));

  const cAgSt = correrDeepLink('agst');
  af(cAgSt.masAlla === 1 && cAgSt.showDetail === 0,
     () => '🔴 EL HOYO DE MEMO: el agotado (st) con link directo tenía que abrir el wizard del Más Allá, no el cotizador. ' + ver(() => cAgSt));
  const cAgAuto = correrDeepLink('agauto');
  af(cAgAuto.masAlla === 1 && cAgAuto.showDetail === 0,
     () => '🔴 el agotado AUTOMÁTICO (todas las zonas ag, st vacío — el auto-semáforo) no cayó al wizard: ' + ver(() => cAgAuto));
  const cProxi = correrDeepLink('prox1');
  af(cProxi.avisame === 1 && cProxi.showDetail === 0 && cProxi.masAlla === 0,
     () => 'el proximamente con link directo tenía que abrir el AVÍSAME: ' + ver(() => cProxi));
  const cPronto = correrDeepLink('pron1');
  af(cPronto.avisame === 1 && cPronto.showDetail === 0,
     () => 'el `pronto` —rotulado igual que proximamente— tenía que ir al AVÍSAME (la asimetría de LAND-2c no se espeja): ' + ver(() => cPronto));
  const cPasado = correrDeepLink('pas1');
  af(cPasado.showDetail === 0 && cPasado.masAlla === 0 && cPasado.avisame === 0,
     () => 'el PASADO con link directo tenía que quedarse en portada (nada se abre): ' + ver(() => cPasado));
  const cRide = correrDeepLink('ride1');
  af(cRide.showDetail === 1 && cRide.masAlla === 0,
     () => '🔴 el rideOnly VIVO con zonas agotadas cayó al wizard: _evVeredicto no enciende isAg ahí (RIDE-VIVO-1) y el camión SÍ se vende. ' + ver(() => cRide));

  // ── [B] EL WIZARD DEL INDEX ────────────────────────────────────────────
  console.log('\n[B] el wizard del Más Allá (funciones reales en vm)');
  const fns = ['_maPaquetesDe', '_maZonasDe', '_maChips', 'abrirMasAllaModal', 'cerrarMasAllaModal', 'enviarMasAlla'].map((n) => funcionDe(idx, n));
  af(fns.every(Boolean), () => 'no se pudieron rebanar las funciones del wizard: ' + ver(() => fns.map((f, i) => f ? 'ok' : i)));

  function domFalso() {
    const nodos = {};
    const mk = (id) => {
      const hijos = [];
      const n = {
        id, value: '', textContent: '', innerHTML: '', className: '',
        style: {}, children: hijos,
        classList: { _s: new Set(), toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); }, add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); } },
        appendChild(x) { hijos.push(x); },
        reset() {},
        querySelectorAll(sel) {
          if (sel === '.ma-chip.on') return hijos.filter((h) => h.classList._s.has('on') && h.className === 'ma-chip');
          return [];
        },
        focus() {},
      };
      return n;
    };
    const ids = ['ma-ev-name', 'ma-form', 'ma-paquetes', 'ma-zonas', 'ma-paq-lbl', 'ma-zonas-lbl', 'ma-msg', 'ma-submit', 'ma-modal-bg', 'ma-nombre', 'ma-celular', 'ma-correo', 'ma-cantidad', 'ma-hp'];
    ids.forEach((id) => { nodos[id] = mk(id); });
    return {
      nodos,
      document: {
        getElementById: (id) => nodos[id] || null,
        createElement: () => {
          const b = { type: '', className: '', textContent: '', onclick: null, classList: { _s: new Set(), toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }, has(c) { return this._s.has(c); } } };
          // el querySelectorAll de arriba filtra por className+on
          Object.defineProperty(b.classList, 'contains', { value(c) { return this._s.has(c); } });
          return b;
        },
      },
    };
  }

  // _maPaquetesDe: la derivación gruesa, caso por caso.
  {
    const ctx = vm.createContext({ Number, Array, String });
    vm.runInContext(funcionDe(idx, '_maPaquetesDe'), ctx);
    const p = (ev) => vm.runInContext('_maPaquetesDe', ctx)(ev);
    af(JSON.stringify(p({ cheapOnly: true })) === JSON.stringify(['Solo boleto (CHEAP)']), () => 'cheapOnly tenía que dar solo CHEAP: ' + ver(() => p({ cheapOnly: true })));
    af(JSON.stringify(p({ rideOnly: true })) === JSON.stringify(['Solo viaje (RIDE)']), 'rideOnly tenía que dar solo RIDE');
    const mty = p({ ride: 2700 });
    af(mty.length === 4 && mty.some((x) => /STAY/.test(x)), () => 'un MTY normal lleva PLUS+STAY+RIDE+CHEAP: ' + ver(() => mty));
    const cdmx = p({ cdmx: true, ride: 2900 });
    af(!cdmx.some((x) => /STAY/.test(x)), () => '🔴 un CDMX ofreció STAY — CDMX no tiene STAY (regla de la casa): ' + ver(() => cdmx));
    af(!p({ noCheap: true, ride: 2700 }).some((x) => /CHEAP/.test(x)), 'noCheap tenía que esconder el CHEAP (NOCHEAP-1)');
  }
  // _maZonasDe: únicas + multifecha.
  {
    const ctx = vm.createContext({ String });
    vm.runInContext(funcionDe(idx, '_maZonasDe'), ctx);
    const z = vm.runInContext('_maZonasDe', ctx)({
      zonas: [{ n: 'GA' }, { n: 'VIP' }],
      cheapZonas: [{ n: 'GA' }, { n: 'Pista' }],
      multifecha: [{ zonas: [{ n: 'GA Viernes' }], cheapZonas: [{ n: 'VIP' }] }],
    });
    af(JSON.stringify(z) === JSON.stringify(['GA', 'VIP', 'Pista', 'GA Viernes']),
       () => 'las zonas del wizard no son el universo ÚNICO (zonas+cheap+multifecha): ' + ver(() => z));
  }
  // enviarMasAlla: validación y payload, con fetch espía.
  {
    const { nodos, document } = domFalso();
    const red = { urls: [], cuerpos: [] };
    const ctx = vm.createContext({
      document, JSON, Number, String, parseInt, Array, Object,
      window: { trackEventClick: null },
      fetch: (url, opts) => { red.urls.push(url); red.cuerpos.push(JSON.parse(opts.body)); return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true, folio: 'MA-X' }) }); },
      setTimeout: (fn) => fn(),
    });
    vm.runInContext('var _maEvento=null;', ctx);
    ['_maPaquetesDe', '_maZonasDe', '_maChips', 'abrirMasAllaModal', 'enviarMasAlla'].forEach((n) => vm.runInContext(funcionDe(idx, n), ctx));
    const evFx = { id: 'agst', a: 'Agotado St', zonas: [{ n: 'GA' }, { n: 'VIP' }], cheapZonas: [], ride: 2700 };
    vm.runInContext('abrirMasAllaModal', ctx)(evFx);
    af(nodos['ma-ev-name'].textContent === 'Agotado St', () => 'el modal no pintó el nombre del evento: ' + ver(() => nodos['ma-ev-name'].textContent));
    af(nodos['ma-zonas'].children.length === 2, () => 'los chips de zonas no se pintaron: ' + ver(() => nodos['ma-zonas'].children.length));
    // nombre corto → error SIN red
    nodos['ma-nombre'].value = 'X'; nodos['ma-celular'].value = '8119771072'; nodos['ma-cantidad'].value = '2';
    vm.runInContext('enviarMasAlla', ctx)(null);
    af(red.urls.length === 0 && /nombre/i.test(nodos['ma-msg'].textContent),
       () => 'el nombre corto tenía que rebotar SIN pegarle a la red: ' + ver(() => ({ red: red.urls.length, msg: nodos['ma-msg'].textContent })));
    // celular corto → error SIN red
    nodos['ma-nombre'].value = 'Laura Mendez'; nodos['ma-celular'].value = '811977';
    vm.runInContext('enviarMasAlla', ctx)(null);
    af(red.urls.length === 0 && /10 dígitos/.test(nodos['ma-msg'].textContent),
       () => 'el celular corto tenía que rebotar SIN red: ' + ver(() => nodos['ma-msg'].textContent));
    // feliz: payload con chips elegidos
    nodos['ma-celular'].value = '8119771072';
    nodos['ma-zonas'].children[0].classList.toggle('on');   // elige 'GA'
    nodos['ma-zonas'].children[0].textContent = 'GA';
    vm.runInContext('enviarMasAlla', ctx)(null);
    // ⚠️ enviarMasAlla NO es async (devuelve false; el fetch vive en .then):
    // un `await` sobre ese false NO drena la cadena de microtareas del fetch
    // espía. setImmediate deja correr la cola completa — sin esto, la
    // aserción del éxito lee el DOM de ANTES de que el .then pinte (primer
    // rojo de esta tanda, y era del instrumento).
    await new Promise((r) => setImmediate(r));
    af(red.urls.length === 1 && /mas-alla-solicitar/.test(red.urls[0]),
       () => 'el envío feliz no le pegó al endpoint: ' + ver(() => red.urls));
    const cuerpo = red.cuerpos[0] || {};
    af(cuerpo.evento_id === 'agst' && cuerpo.celular === '8119771072' && cuerpo.cantidad === 2
       && Array.isArray(cuerpo.zonas) && cuerpo.zonas[0] === 'GA' && ('sitio_web' in cuerpo),
       () => '🔴 el payload no lleva lo que el servidor espera (evento, celular 10, cantidad, zonas de chips, honeypot): ' + ver(() => cuerpo));
    af(nodos['ma-form'].style.display === 'none' && /✓/.test(nodos['ma-msg'].textContent),
       () => 'el éxito no escondió el form ni confirmó: ' + ver(() => nodos['ma-msg'].textContent));
  }

  // ── [C] EL ENDPOINT PÚBLICO REAL ───────────────────────────────────────
  console.log('\n[C] mas-alla-solicitar — el handler real contra red falsa');
  // Columnas REALES de la tabla (del acta MAS-ALLA-1.sql): la red falsa
  // rechaza columnas inventadas, como PostgREST (la lección de BITACORA-1).
  const COLS_TABLA = ['id', 'evento_id', 'evento_nombre', 'nombre', 'celular', 'correo', 'cantidad', 'paquetes', 'zonas', 'estado', 'nota', 'atendido_por', 'atendido_at', 'created_at'];
  let TABLA = [];          // estado de la red falsa
  let ESCRITURAS = 0;
  global.fetch = async (url, opts) => {
    const u = String(url), met = (opts && opts.method) || 'GET';
    if (!/supabase\.co/.test(u)) throw new Error('red falsa: destino desconocido ' + u);
    if (met === 'GET') {
      // el tope cuenta pendientes por celular
      const mCel = /celular=eq\.(\d+)/.exec(u);
      const filas = TABLA.filter((f) => (!mCel || f.celular === mCel[1]) && (!/estado=eq\.pendiente/.test(u) || f.estado === 'pendiente'));
      return { ok: true, status: 200, json: async () => filas, text: async () => '' };
    }
    if (met === 'POST') {
      const fila = JSON.parse(opts.body);
      for (const k of Object.keys(fila)) {
        if (!COLS_TABLA.includes(k)) return { ok: false, status: 400, text: async () => `column "${k}" does not exist`, json: async () => ({}) };
      }
      ESCRITURAS++;
      const nueva = { id: '00000000-0000-4000-9000-' + String(TABLA.length + 1).padStart(12, '0'), estado: 'pendiente', ...fila };
      TABLA.push(nueva);
      return { ok: true, status: 201, json: async () => [nueva], text: async () => '' };
    }
    throw new Error('🔴 el endpoint público usó el método ' + met);
  };
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'llave-falsa';
  delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions/mas-alla-solicitar.js'))];
  const pub = require(path.join(RAIZ, 'netlify/functions/mas-alla-solicitar.js'));
  const pedir = async (body, metodo) => {
    const res = await pub.handler({ httpMethod: metodo || 'POST', headers: { origin: 'https://conectareynosa.mx' }, body: JSON.stringify(body) });
    return { res, d: JSON.parse(res.body || '{}') };
  };

  const base = { evento_id: 'agst', evento_nombre: 'Agotado St', nombre: 'Laura Mendez', celular: '8119771072' };
  // honeypot: éxito de UTILERÍA sin escribir
  const rHp = await pedir({ ...base, sitio_web: 'spam.com' });
  af(rHp.res.statusCode === 200 && rHp.d.ok === true && ESCRITURAS === 0,
     () => '🔴 el honeypot tenía que contestar éxito de utilería SIN escribir: ' + ver(() => ({ st: rHp.res.statusCode, esc: ESCRITURAS })));
  // validaciones, todas SIN INSERT
  for (const [etq, cuerpo, code] of [
    ['nombre corto', { ...base, nombre: 'X' }, 400],
    ['celular de 9', { ...base, celular: '811977107' }, 400],
    ['correo roto', { ...base, correo: 'no-es-correo' }, 400],
    ['cantidad 25', { ...base, cantidad: 25 }, 400],
    ['sin evento', { ...base, evento_id: '' }, 400],
  ]) {
    const r = await pedir(cuerpo);
    af(r.res.statusCode === code && ESCRITURAS === 0,
       () => `«${etq}» tenía que dar ${code} sin escribir: salió ` + r.res.statusCode + ' esc=' + ESCRITURAS);
  }
  const r405 = await pedir(base, 'GET');
  af(r405.res.statusCode === 405, () => 'un GET tenía que dar 405: ' + r405.res.statusCode);
  // feliz
  const rOk = await pedir({ ...base, correo: 'Laura@Mail.com', cantidad: '3', paquetes: ['Todo incluido (PLUS)'], zonas: ['GA', 'GA'], sitio_web: '' });
  af(rOk.res.statusCode === 200 && rOk.d.ok === true && /^MA-/.test(rOk.d.folio) && ESCRITURAS === 1,
     () => '🔴 el caso feliz no insertó: ' + ver(() => ({ st: rOk.res.statusCode, d: rOk.d, esc: ESCRITURAS })));
  af(TABLA[0] && TABLA[0].correo === 'laura@mail.com' && TABLA[0].cantidad === 3
     && JSON.stringify(TABLA[0].zonas) === JSON.stringify(['GA']),
     () => 'la fila no quedó normalizada (correo en minúsculas, cantidad numérica, zonas SIN repetidos): ' + ver(() => TABLA[0]));
  // el tope: 3 pendientes del mismo celular → 429
  TABLA = [1, 2, 3].map((i) => ({ id: 'x' + i, celular: '8119771072', estado: 'pendiente' }));
  ESCRITURAS = 0;
  const rTope = await pedir(base);
  af(rTope.res.statusCode === 429 && ESCRITURAS === 0,
     () => 'con 3 pendientes del mismo celular tenía que dar 429 sin escribir: ' + rTope.res.statusCode + ' esc=' + ESCRITURAS);
  // y las ATENDIDAS no cuentan para el tope
  TABLA = TABLA.map((f) => ({ ...f, estado: 'vendido' }));
  const rTras = await pedir(base);
  af(rTras.res.statusCode === 200 && ESCRITURAS === 1,
     () => 'las solicitudes YA ATENDIDAS no deben contar para el tope (quien fue atendido puede volver a pedir): ' + rTras.res.statusCode);

  // ── [D] EL ADMIN REAL ──────────────────────────────────────────────────
  console.log('\n[D] admin-mas-alla — roles, listar enriquecido, marcar con filtro');
  let ROL = 'bulma';
  const vaPath = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[vaPath] = { id: vaPath, filename: vaPath, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    // El mock RESPETA la lista de roles que el handler le pasa: así se mide
    // que el handler pide LOS ROLES FIRMADOS, no que el mock deja pasar todo.
    verifyAdminAuthLive: async (ev, roles) => (Array.isArray(roles) && roles.includes(ROL))
      ? { valid: true, user: { id: 'u1', correo: ROL + '@conecta', rol: ROL } }
      : { valid: false, status: 403, error: 'Rol sin permiso' },
  } };
  let CATALOGO = { agst: { nombre: 'Agotado St', fecha: '2 dic 2026', ds: '2026-12-02', venue: 'Arena', st: 'agotado' } };
  const ciPath = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
  require.cache[ciPath] = { id: ciPath, filename: ciPath, loaded: true, exports: {
    fetchCatalogo: async () => CATALOGO,
  } };
  let PATCHES = [];
  TABLA = [
    { id: '00000000-0000-4000-9000-000000000001', evento_id: 'agst', evento_nombre: 'Agotado St', nombre: 'Laura Mendez', celular: '8119771072', correo: null, cantidad: 3, paquetes: null, zonas: ['GA'], estado: 'pendiente', nota: null, atendido_por: null, atendido_at: null, created_at: new Date().toISOString() },
  ];
  global.fetch = async (url, opts) => {
    const u = String(url), met = (opts && opts.method) || 'GET';
    if (met === 'DELETE') throw new Error('🔴 admin-mas-alla mandó un DELETE: aquí nada se borra');
    if (met === 'GET') return { ok: true, status: 200, json: async () => TABLA, text: async () => '' };
    if (met === 'PATCH') {
      const m = /id=eq\.([0-9a-f-]+)/.exec(u);
      if (!m) throw new Error('🔴 PATCH SIN FILTRO id=eq. — barrería la tabla entera');
      PATCHES.push(JSON.parse(opts.body));
      const i = TABLA.findIndex((f) => f.id === m[1]);
      if (i < 0) return { ok: true, status: 200, json: async () => [], text: async () => '' };
      TABLA[i] = { ...TABLA[i], ...JSON.parse(opts.body) };
      return { ok: true, status: 200, json: async () => [TABLA[i]], text: async () => '' };
    }
    throw new Error('método inesperado ' + met);
  };
  delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions/admin-mas-alla.js'))];
  const adm = require(path.join(RAIZ, 'netlify/functions/admin-mas-alla.js'));
  const pedirAdm = async (body) => {
    const res = await adm.handler({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' }, body: JSON.stringify(body) });
    return { res, d: JSON.parse(res.body || '{}') };
  };

  ROL = 'coordinador';
  const rCoordi = await pedirAdm({ accion: 'listar' });
  af(rCoordi.res.statusCode === 403, () => 'un coordinador tenía que rebotar con 403: ' + rCoordi.res.statusCode);
  ROL = 'milk';
  const rLis = await pedirAdm({ accion: 'listar' });
  af(rLis.res.statusCode === 200 && rLis.d.ok === true && rLis.d.catalogo_ok === true,
     () => 'milk tenía que poder listar: ' + ver(() => ({ st: rLis.res.statusCode, d: rLis.d && rLis.d.error })));
  af(rLis.d.solicitudes[0] && rLis.d.solicitudes[0].ev_ds === '2026-12-02' && rLis.d.solicitudes[0].ev_fecha === '2 dic 2026',
     () => 'la solicitud no salió ENRIQUECIDA con el catálogo (ev_ds para la cercanía): ' + ver(() => rLis.d.solicitudes[0]));
  // catálogo caído = fail-soft DICHO, las solicitudes salen igual
  CATALOGO = null;
  const rSinCat = await pedirAdm({ accion: 'listar' });
  af(rSinCat.res.statusCode === 200 && rSinCat.d.catalogo_ok === false && rSinCat.d.solicitudes.length === 1,
     () => '🔴 con el catálogo caído las solicitudes tenían que salir IGUAL con catalogo_ok:false (esconder demanda sería un cero falso): ' + ver(() => ({ ok: rSinCat.d.catalogo_ok, n: (rSinCat.d.solicitudes || []).length })));
  CATALOGO = { agst: { nombre: 'Agotado St', fecha: '2 dic 2026', ds: '2026-12-02' } };
  // marcar
  const rMal = await pedirAdm({ accion: 'marcar', id: TABLA[0].id, estado: 'facturado' });
  af(rMal.res.statusCode === 400 && PATCHES.length === 0,
     () => 'un estado inventado tenía que rebotar 400 SIN red: ' + rMal.res.statusCode + ' patches=' + PATCHES.length);
  const rUuid = await pedirAdm({ accion: 'marcar', id: 'x; drop table', estado: 'vendido' });
  af(rUuid.res.statusCode === 400 && PATCHES.length === 0, 'un id que no es uuid tenía que rebotar en la puerta');
  const rVend = await pedirAdm({ accion: 'marcar', id: TABLA[0].id, estado: 'vendido' });
  af(rVend.res.statusCode === 200 && rVend.d.solicitud.estado === 'vendido'
     && rVend.d.solicitud.atendido_por === 'milk@conecta' && !!rVend.d.solicitud.atendido_at,
     () => 'marcar vendido tenía que sellar atendido_por del JWT: ' + ver(() => rVend.d.solicitud));
  const rPend = await pedirAdm({ accion: 'marcar', id: TABLA[0].id, estado: 'pendiente' });
  af(rPend.res.statusCode === 200 && rPend.d.solicitud.atendido_por === null && rPend.d.solicitud.atendido_at === null,
     () => 'volver a pendiente tenía que LIMPIAR el sello: ' + ver(() => rPend.d.solicitud));
  const rAccX = await pedirAdm({ accion: 'aplicar' });
  af(rAccX.res.statusCode === 400 && rAccX.d.codigo === 'ACCION_DESCONOCIDA',
     'una acción fuera de ACCIONES tenía que rebotar (ley de RAD-FIX-CAMINO)');

  // ── [E] LOS CABLES DE LA PANTALLA KH ───────────────────────────────────
  console.log('\n[E] la pantalla EL MÁS ALLÁ — cables y render');
  const wl = fs.readFileSync(path.join(RAIZ, 'kamehouse-waitlist.js'), 'utf8');
  const khHtml = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  const khJs = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  for (const f of ['maVista', 'maRefrescar', 'loadMasAlla', 'maMarcar', 'maWhatsApp', '_maPintar', 'maAbrirAgotados', 'maFiltroEstado']) {
    af(new RegExp('function ' + f + '\\(').test(wl), () => '`' + f + '` no existe en kamehouse-waitlist.js');
  }
  af(/id="mav-agotados"/.test(khHtml) && /id="ma-groups"/.test(khHtml) && /id="ma-f-evento"/.test(khHtml),
     'los contenedores de la vista de agotados no están en kamehouse.html');
  af(/maRefrescar\(\)/.test(khHtml), 'el ↻ del hero no llama a maRefrescar (refrescaría siempre la otra vista)');
  af(/>El Más Allá<\/span>/.test(khHtml), 'el menú no dice «El Más Allá»');
  af(/id="page-waitlist"/.test(khHtml), 'el id de la página cambió: permisos y showHerramienta llavean por `waitlist`');
  // permisos: bulma y milk ganaron 'waitlist' — se EVALÚA la lista, no se grepa
  // el archivo entero (mi propio comentario la nombra).
  {
    const m = /const PERMISOS_TABS = \{[\s\S]*?\n\};/.exec(khJs);
    af(!!m, 'PERMISOS_TABS no se pudo rebanar de kamehouse.js');
    if (m) {
      const ctx = vm.createContext({});
      vm.runInContext(m[0].replace('const PERMISOS_TABS', 'globalThis.PERMISOS_TABS'), ctx);
      const PT = vm.runInContext('PERMISOS_TABS', ctx);
      af(PT.bulma.includes('waitlist') && PT.milk.includes('waitlist') && PT.maestro_roshi.includes('waitlist'),
         () => '🔴 bulma/milk no tienen `waitlist` en PERMISOS_TABS — firmado por Memo que ellas atienden: ' + ver(() => ({ b: PT.bulma.includes('waitlist'), m: PT.milk.includes('waitlist') })));
    }
  }
  af(/maAbrirAgotados\(\)/.test(khJs), 'la tarjeta del inicio de Bulma/Milk no llama a maAbrirAgotados');
  af(/admin-mas-alla/.test(khJs), 'el inicio MB no le pregunta a admin-mas-alla por las pendientes');

  // el mensaje de WhatsApp, corrido de verdad
  {
    const ctx = vm.createContext({ Number, String, Array, Math, JSON, encodeURIComponent });
    vm.runInContext(funcionDe(wl, '_maMsgWa'), ctx);
    const msg = vm.runInContext('_maMsgWa', ctx)({ nombre: 'Laura Mendez', ev_nombre: 'Junior H', cantidad: 2, zonas: ['GA', 'VIP'] });
    af(/Laura/.test(msg) && /Junior H/.test(msg) && /2 boletos/.test(msg) && /GA \/ VIP/.test(msg) && /zona que buscas/.test(msg),
       () => 'el mensaje de WhatsApp no se deriva del dato (nombre, evento, cantidad, zonas): ' + ver(() => msg));
    // y el link lleva el 52 + 10 dígitos (la lección del giveaway)
    const aperturas = [];
    const ctx2 = vm.createContext({
      Number, String, Array, JSON, encodeURIComponent,
      window: { open: (u) => aperturas.push(u), __masAlla: { data: [{ id: 'a1', nombre: 'Laura', celular: '8119771072', ev_nombre: 'Junior H', cantidad: 1 }] } },
    });
    vm.runInContext(funcionDe(wl, '_maSt'), ctx2);
    vm.runInContext(funcionDe(wl, '_maMsgWa'), ctx2);
    vm.runInContext(funcionDe(wl, 'maWhatsApp'), ctx2);
    vm.runInContext('maWhatsApp', ctx2)('a1');
    af(aperturas.length === 1 && /^https:\/\/wa\.me\/528119771072\?text=/.test(aperturas[0]),
       () => '🔴 el wa.me no lleva 52 + los 10 dígitos — sin lada abre un chat con NADIE: ' + ver(() => aperturas));
  }
  // _maPintar: orden por CERCANÍA (ev_ds asc) y el badge que se calla en cero
  {
    const cajas = {};
    const mk = (id) => ({ id, innerHTML: '', textContent: '', value: '', style: {} });
    ['ma-groups', 'ma-summary', 'mav-agotados-n', 'ma-f-evento'].forEach((id) => { cajas[id] = mk(id); });
    const lejos = { id: 'b1', evento_id: 'lejos', ev_nombre: 'Evento Lejano', ev_ds: '2027-06-01', ev_fecha: 'jun 2027', nombre: 'Persona Dos', celular: '8100000002', cantidad: 1, estado: 'pendiente', created_at: new Date().toISOString() };
    const cerca = { id: 'a1', evento_id: 'cerca', ev_nombre: 'Evento Cercano', ev_ds: '2026-11-01', ev_fecha: 'nov 2026', nombre: 'Persona Uno', celular: '8100000001', cantidad: 2, zonas: ['GA'], estado: 'pendiente', created_at: new Date().toISOString() };
    const ctx = vm.createContext({
      document: { getElementById: (id) => cajas[id] || null },
      window: { __masAlla: { data: [lejos, cerca], estado: 'pendiente', evento: '', q: '' } },
      Number, String, Array, Object, JSON, Map, Set, Intl, Date,
    });
    ['_maSt', '_maCoincide', '_maBadge', '_maMsgWa', '_wlEsc', '_wlFmtDate', '_tsToDate', '_maPintar'].forEach((n) => {
      const f = funcionDe(wl, n);
      if (f) vm.runInContext(f, ctx);
    });
    vm.runInContext('_maPintar', ctx)();
    const html = cajas['ma-groups'].innerHTML;
    af(html.indexOf('Evento Cercano') >= 0 && html.indexOf('Evento Lejano') >= 0
       && html.indexOf('Evento Cercano') < html.indexOf('Evento Lejano'),
       () => '🔴 el orden no es por CERCANÍA del evento (el de nov va antes que el de jun-2027): cercano@' + html.indexOf('Evento Cercano') + ' lejano@' + html.indexOf('Evento Lejano'));
    af(cajas['mav-agotados-n'].textContent === ' · 2', () => 'el badge del tab no dice los pendientes: ' + ver(() => cajas['mav-agotados-n'].textContent));
    af(/maWhatsApp\('a1'\)/.test(html) && /maMarcar\('a1','vendido'/.test(html),
       'las filas no traen sus botones (WhatsApp y Vendido) cableados al dueño');
    // en cero, el badge SE CALLA
    const ctx0 = vm.createContext({
      document: { getElementById: (id) => cajas[id] || null },
      window: { __masAlla: { data: [], estado: 'pendiente', evento: '', q: '' } },
      Number, String, Array, Object, JSON, Map, Set, Intl, Date,
    });
    ['_maSt', '_maCoincide', '_maBadge', '_wlEsc', '_wlFmtDate', '_tsToDate', '_maPintar'].forEach((n) => { const f = funcionDe(wl, n); if (f) vm.runInContext(f, ctx0); });
    vm.runInContext('_maPintar', ctx0)();
    af(cajas['mav-agotados-n'].textContent === '', () => 'con cero pendientes el badge tenía que CALLARSE: ' + ver(() => cajas['mav-agotados-n'].textContent));
  }

  // ── [F] LOS CABLES DEL INDEX ───────────────────────────────────────────
  console.log('\n[F] los cables del index (las tres puertas)');
  // La regla CSS de la tarjeta agotada SIN pointer-events:none — se mide SOBRE
  // LA LÍNEA de la regla, no sobre el archivo (mi propio comentario nombra
  // pointer-events: la lección KC-5).
  const reglaAg = /\.ev-card\.agotado\{[^}]*\}/.exec(idx);
  af(!!reglaAg && !/pointer-events\s*:\s*none/.test(reglaAg[0]),
     () => '🔴 .ev-card.agotado sigue con pointer-events:none — el onclick de la tarjeta sería letra muerta: ' + ver(() => reglaAg && reglaAg[0]));
  af(/else if\(isAg&&!isPast\)\{/.test(idx) && /abrirMasAllaModal\(evv\)/.test(idx),
     'la tarjeta agotada no tiene su rama de onclick al wizard');
  af(/it\.onclick=ag\?function\(\)\{solicitar\(e\);\}/.test(idx),
     'la tira del hero no manda el agotado a solicitar() (el wizard)');
  af(/function solicitar\(ev\)\{/.test(idx) && funcionDe(idx, 'solicitar').includes('abrirMasAllaModal'),
     'solicitar() no delega en abrirMasAllaModal');
  af(/id="ma-modal-bg"/.test(idx) && /id="ma-hp"/.test(idx) && /name="sitio_web"/.test(idx),
     'el modal del Más Allá o su honeypot no están en el index');
  af(/id="ma-cantidad"/.test(idx) && /<option value="1" selected>1 boleto<\/option>/.test(idx),
     'la cantidad no nace en «1 boleto» ANUNCIADO (DEFAULTS-1: forma, a la vista)');

  completo = true;
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('ARNÉS REVENTÓ:', e); process.exit(1); });
