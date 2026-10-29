#!/usr/bin/env node
/* mide-plan-pagos-1 — PLAN-PAGOS-1 (28-oct-2026)
 * «El cliente ve su rol de pagos en el Portal, y el calendario tiene UN dueño.»
 *   [P] PARIDAD: `quincenasEntre` de la lib contra las TRES copias VIVAS
 *       (getQuincenas de rol.html e index.html, _spGetQuincenas de kamehouse.js)
 *       sobre cientos de casos. Con candado de cardinalidad y SABOTAJE: si al
 *       mover la lib la paridad no se pone roja, el careo no está comparando.
 *   [D] dsDeEvento: la fecha de ESA fecha del `slug#N`, y un `#N` que no existe
 *       devuelve null — jamás el `ds` del evento.
 *   [H] hoyReynosa: el día de Reynosa, no el de Greenwich (la ley de toISOString).
 *   [C] planDelViaje: los SEIS estados por su nombre + la aritmética (las cuotas
 *       suman la resta EXACTA) + los topes por paquete + la guarda COT-FIX-4.
 *   [R] El handler REAL de portal-mi-plan-migrado: el plan viaja con la fila
 *       sellada; catálogo ilegible → plan null CON motivo (no cuotas vacías);
 *       `abonado_previo` viaja (sin él el historial contradice la barra).
 *   [F] La PANTALLA real (`_migPagosHtml` rebanada de portal.html y corrida en
 *       vm): cada estado dice lo suyo y el historial cuadra con la barra.
 * ⚠️ SIN ANCLA (árbol de trabajo, como mide:portal-solo-1): no sufre la trampa
 * del commit; a cambio sus controles son POR CONSTRUCCIÓN, no por commit. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (e) { ok = false; } const t = typeof m === 'function' ? m() : m; if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

const PP = require(path.join(RAIZ, 'netlify/functions/_lib/plan-pagos.js'));
const ROL = fs.readFileSync(path.join(RAIZ, 'rol.html'), 'utf8');
const IDX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const KH = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
const PORTAL = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');

// Rebanada por BALANCE DE LLAVES (no «hasta la siguiente declaración»: si alguien
// mete código en medio, esa forma corta mal y acusa a código sano).
function rebana(txt, ancla) {
  const i = txt.indexOf(ancla);
  if (i < 0) throw new Error('ancla no encontrada: ' + ancla);
  let d = 0, k = txt.indexOf('{', i), s = false, sc = '', esc = false;
  for (; k < txt.length; k++) {
    const c = txt[k];
    if (esc) { esc = false; continue; }
    if (s) { if (c === '\\') { esc = true; continue; } if (c === sc) s = false; continue; }
    if (c === '"' || c === "'" || c === '`') { s = true; sc = c; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } }
  }
  return txt.slice(i, k);
}

// ═══ [P] PARIDAD CON LAS TRES COPIAS VIVAS ═════════════════════════════════
console.log('\n[P] La fórmula tiene UN dueño: paridad contra las 3 copias vivas');
const MESES_NAV = { '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril', '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto', '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre' };
function cargarCopia(nombre) {
  let src;
  if (nombre === 'rol') src = rebana(ROL, 'function getQuincenas(from, until, max, diasAntes){');
  else if (nombre === 'index') src = rebana(IDX, 'function getQuincenas(from, until, max, diasAntes){');
  else {
    src = rebana(KH, 'const _SP_MESES = {').replace(/^const _SP_MESES/, 'var _SP_MESES') + ';'
      + rebana(KH, 'function _spLblVentana(ini, fin, mesIni, mesFin) {')
      + rebana(KH, 'function _spGetQuincenas(from, until, max, diasAntes) {');
  }
  const ctx = { MESES: MESES_NAV, console }; vm.createContext(ctx);
  vm.runInContext(src + ';', ctx);
  return ctx.getQuincenas || ctx._spGetQuincenas;
}
const COPIAS = {};
['rol', 'index', 'kh'].forEach((n) => { try { COPIAS[n] = cargarCopia(n); } catch (e) { COPIAS[n] = null; console.log('  ! no se pudo rebanar ' + n + ': ' + e.message); } });
af(() => typeof COPIAS.rol === 'function' && typeof COPIAS.index === 'function' && typeof COPIAS.kh === 'function',
  'las 3 copias vivas se rebanaron y son funciones (si no, el bloque mediría la nada)');

const CASOS = [];
['2026-10-28', '2026-01-05', '2026-02-24', '2026-11-09', '2027-03-01', '2026-12-31', '2026-06-12']
  .forEach((f) => ['2026-11-07', '2027-01-11', '2027-04-09', '2026-11-02', '2027-12-12', '2026-10-30', '2026-07-04']
    .forEach((u) => [1, 2, 4, 10].forEach((mx) => [null, 0, 5, 14].forEach((da) =>
      CASOS.push([new Date(f + 'T12:00:00'), new Date(u + 'T12:00:00'), mx, da])))));

function paridad(fnLib) {
  let dif = 0, conCuotas = 0, max = 0;
  for (const c of CASOS) {
    const r = JSON.stringify(COPIAS.rol(...c)), i = JSON.stringify(COPIAS.index(...c)), k = JSON.stringify(COPIAS.kh(...c));
    const mio = JSON.stringify(fnLib(...c));
    if (r !== i || r !== k || r !== mio) dif++;
    const n = JSON.parse(r).length; if (n) { conCuotas++; if (n > max) max = n; }
  }
  return { dif, conCuotas, max, total: CASOS.length };
}
const PAR = paridad(PP.quincenasEntre);
// 🔒 CARDINALIDAD: sin casos que produzcan cuotas, «0 diferencias» sería el
// acuerdo de cuatro funciones sobre el conjunto vacío.
af(() => PAR.conCuotas >= 300, () => 'el barrido ejercita de verdad: ' + PAR.conCuotas + ' de ' + PAR.total + ' casos devuelven cuotas (hasta ' + PAR.max + ')');
af(() => PAR.dif === 0, () => 'la lib coincide con las 3 copias vivas en los ' + PAR.total + ' casos (difieren: ' + PAR.dif + ')');
// 🔒 CONTROL POSITIVO POR CONSTRUCCIÓN: se mueve la ventana del 9 al 10 y la
// paridad TIENE que romperse. Sin esto, un comparador roto daría 0 siempre.
const SABOT = (from, until, max, diasAntes) => PP.quincenasEntre(from, until, max, diasAntes).map((q) => ({ lbl: q.lbl, d: new Date(q.d.getFullYear(), q.d.getMonth(), q.d.getDate() + 1), e: q.e }));
af(() => paridad(SABOT).dif > 0, () => 'control: una lib saboteada SÍ rompe la paridad (' + paridad(SABOT).dif + ' diferencias) — el careo compara de verdad');
af(() => PP.MAX_PAGOS.cheap === 4 && PP.MAX_PAGOS.otros === 10, 'los topes de la casa: CHEAP 4 · los demás 10');
af(() => PP.DIAS_ANTES_DEFAULT === 5 && PP.BUFFER_SEPARO_DIAS === 5, 'margen de 5 días antes del evento y buffer de 5 días del separo [COT-NORMA-2]');

// ═══ [D] dsDeEvento ════════════════════════════════════════════════════════
console.log('\n[D] La fecha es la de ESA fecha, no la del evento');
const evMulti = { id: 'coronacapital', ds: '2026-11-20', multifecha: [{ ds: '2026-11-20' }, { ds: '2026-11-21' }, { ds: '2026-11-22' }] };
const evLista = { id: 'x', ds: '2026-11-20', dsList: ['2026-11-20', '2026-11-21'] };
const evSimple = { id: 'juniorh', ds: '2027-02-14' };
af(() => PP.dsDeEvento(evMulti, 'coronacapital#1') === '2026-11-21', 'multifecha#1 → su propio ds (2026-11-21)');
af(() => PP.dsDeEvento(evLista, 'x#1') === '2026-11-21', 'dsList gana sobre multifecha, como en rol.html y kamehouse.js');
af(() => PP.dsDeEvento(evSimple, 'juniorh') === '2027-02-14', 'sin #N → el ds del evento');
// 🔒 Un `#N` inexistente NO cae al ds del evento: enseñarle el calendario de otra
// fecha es peor que no enseñarle ninguno.
af(() => PP.dsDeEvento(evMulti, 'coronacapital#9') === null, '#9 que la ficha no tiene → null (NO el ds del evento)');
af(() => PP.dsDeEvento(null, 'x#0') === null, 'sin ficha → null');

// ═══ [H] hoyReynosa ════════════════════════════════════════════════════════
console.log('\n[H] «Hoy» es el día de Reynosa, no el de Greenwich');
// 29-oct 02:00 UTC = 28-oct 21:00 en Reynosa (CDT, −05:00 hasta el 1-nov).
const madrugadaUTC = new Date('2026-10-29T02:00:00Z');
const hR = PP.hoyReynosa(madrugadaUTC);
af(() => hR.getDate() === 28 && hR.getMonth() === 9, () => 'a las 02:00 UTC del 29-oct, «hoy» en Reynosa es el 28 (dio ' + hR.getDate() + ')');
af(() => madrugadaUTC.toISOString().slice(0, 10) === '2026-10-29', 'control: toISOString() de ese MISMO instante dice 29 — es el error que esto evita');
af(() => hR.getHours() === 12, 'se construye a mediodía: ningún corrimiento de huso cruza la medianoche');

// ═══ [C] planDelViaje: los seis estados y la aritmética ════════════════════
console.log('\n[C] El plan: seis estados por su nombre y la aritmética al peso');
const HOY = new Date('2026-10-28T18:00:00Z');
const plan = (o) => PP.planDelViaje(Object.assign({ ahora: HOY }, o));
af(() => plan({ total: null, abonado: 0, ds: '2027-02-14' }).estado === 'sin_total', 'sin total → «sin_total» (≠ «no debes nada»)');
af(() => plan({ total: 5000, abonado: 5000, ds: '2027-02-14' }).estado === 'liquidado', 'pagado completo → «liquidado»');
af(() => plan({ total: 5000, abonado: 6000, ds: '2027-02-14' }).estado === 'liquidado', 'pagado de más → «liquidado», no una resta negativa');
af(() => plan({ total: 5000, abonado: 0, ds: null }).estado === 'sin_fecha', 'sin fecha de evento → «sin_fecha»');
af(() => plan({ total: 5000, abonado: 0, ds: '2026-01-10' }).estado === 'evento_pasado', 'evento ya pasado → «evento_pasado»');
const pCerca = plan({ total: 5000, abonado: 1000, ds: '2026-10-31' });
af(() => pCerca.estado === 'liquidar' && pCerca.cuotas.length === 1, 'evento a 3 días → «liquidar» en una sola cuota antes del evento');
af(() => pCerca.cuotas[0].monto === 4000, () => 'y esa cuota es la resta entera: $' + pCerca.cuotas[0].monto);

const pPlus = plan({ total: 9000, abonado: 2000, ds: '2027-04-09', paquete: 'plus' });
af(() => pPlus.estado === 'calendario' && pPlus.cuotas.length > 1, () => 'PLUS a 5 meses → calendario con ' + pPlus.cuotas.length + ' cuotas');
af(() => pPlus.cuotas.reduce((a, c) => a + c.monto, 0) === 7000, () => 'las cuotas suman la resta EXACTA: $' + pPlus.cuotas.reduce((a, c) => a + c.monto, 0) + ' de $7,000');
af(() => pPlus.proxima && pPlus.proxima.n === 1 && pPlus.proxima.monto === pPlus.cuotas[0].monto, 'la «próxima» es la primera cuota, no una copia aparte');
af(() => /^\d{4}-\d{2}-\d{2}$/.test(pPlus.cuotas[0].fecha), 'cada cuota trae su fecha en YYYY-MM-DD para el Portal');
af(() => /de [A-ZÁÉÍÓÚ]/.test(pPlus.cuotas[0].lbl) || /^el \d+ de /.test(pPlus.cuotas[0].lbl), () => 'el rótulo es el de la casa: «' + pPlus.cuotas[0].lbl + '»');
// 🔒 La última absorbe el residuo: sin eso, 7000/3 dejaría centavos sueltos.
const pResid = plan({ total: 10000, abonado: 0, ds: '2027-01-11', paquete: 'plus' });
af(() => pResid.cuotas.reduce((a, c) => a + c.monto, 0) === 10000, () => 'con residuo, la última cuota lo absorbe: suman $' + pResid.cuotas.reduce((a, c) => a + c.monto, 0));
af(() => pResid.cuotas.every((c) => c.monto > 0), 'ninguna cuota sale en cero o negativa');

const pCheap = plan({ total: 9000, abonado: 0, ds: '2027-12-12', paquete: 'cheap' });
const pOtro = plan({ total: 9000, abonado: 0, ds: '2027-12-12', paquete: 'plus' });
af(() => pCheap.cuotas.length === 4, () => 'CHEAP topa en 4 cuotas (dio ' + pCheap.cuotas.length + ')');
af(() => pOtro.cuotas.length === 10, () => 'PLUS topa en 10 (dio ' + pOtro.cuotas.length + ')');
af(() => PP.planDelViaje({ total: 9000, abonado: 0, ds: '2027-12-12', paquete: ' CHEAP ', ahora: HOY }).cuotas.length === 4, 'el paquete se normaliza: « CHEAP » con espacios y mayúsculas topa igual en 4');
// [COT-FIX-4] No puede haber más pagos que pesos.
const pPobre = plan({ total: 103, abonado: 100, ds: '2027-12-12', paquete: 'plus' });
af(() => pPobre.cuotas.length <= 3 && pPobre.cuotas.every((c) => c.monto > 0), () => 'resta de $3 → ' + pPobre.cuotas.length + ' cuota(s), ninguna negativa [COT-FIX-4]');

// ═══ [R] EL HANDLER REAL ═══════════════════════════════════════════════════
console.log('\n[R] portal-mi-plan-migrado (handler REAL): el plan viaja, y su ausencia se DICE');
const INDEX_HTML = IDX;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
let DB, USER, CATALOGO_VIVO = true;
function filtrar(rows, qs) {
  let out = rows.slice();
  for (const [k, v] of qs.entries()) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    const [op, ...resto] = v.split('.'); const val = resto.join('.');
    if (op === 'eq') out = out.filter((r) => String(r[k]) === val);
    else if (op === 'in') { const set = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')); out = out.filter((r) => set.includes(String(r[k]))); }
    else if (op === 'is') out = out.filter((r) => (val === 'null' ? r[k] == null : String(r[k]) === val));
    else if (op === 'ilike') out = out.filter((r) => String(r[k] || '').toLowerCase() === val.toLowerCase());
    else if (op === 'gte') out = out.filter((r) => String(r[k] || '') >= val);
    else throw new Error('filtro no modelado: ' + k + '=' + v);
  }
  return out;
}
const TABLAS = { viajeros_evento: 'v', abonos_viajero: 'abonos', portal_revisiones: 'rev', grupos_whatsapp: 'wa' };
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = new URL(String(url));
  if (u.hostname === 'conectareynosa.mx' || u.pathname.includes('index.html') || u.pathname === '/') {
    return CATALOGO_VIVO ? resp(200, INDEX_HTML) : resp(502, 'el index no se pudo leer');
  }
  if (u.pathname.includes('/auth/v1/user')) return USER ? resp(200, USER) : resp(401, {});
  const mt = u.pathname.match(/\/rest\/v1\/([a-z_]+)/); if (!mt) return resp(404, {});
  const key = TABLAS[mt[1]]; if (!key) return resp(200, []);
  DB[key] = DB[key] || [];
  if (m === 'GET') {
    const sel = u.searchParams.get('select'); const rows = filtrar(DB[key], u.searchParams);
    if (!sel || sel === '*') return resp(200, rows);
    const cols = sel.split(',');
    return resp(200, rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))));
  }
  if (m === 'POST') { const b = JSON.parse(init.body); const arr = Array.isArray(b) ? b : [b]; const n = arr.map((x, i) => Object.assign({ id: U(900 + i) }, x)); DB[key].push(...n); DB.escrituras.push('POST ' + mt[1]); return resp(201, n); }
  if (m === 'PATCH') { DB.escrituras.push('PATCH ' + mt[1]); return resp(200, []); }
  if (m === 'DELETE') { DB.escrituras.push('DELETE ' + mt[1]); return resp(500, { error: 'DELETE no permitido' }); }
  return resp(400, {});
};
const sello = '2026-10-01T00:00:00Z';
function semilla() {
  return {
    escrituras: [], rev: [], wa: [],
    v: [
      { id: U(1), evento_id: 'juniorh', nombre: 'Laura Gómez', correo: 'laura@correo.mx', tipo_paquete: 'plus', zona_boleto: 'General', total_contrato: 9000, abonado_previo: 2000, boletos: 1, portal_revisado_at: sello },
    ],
    abonos: [{ viajero_id: U(1), monto: 1500, fecha: '2026-10-01' }],
  };
}
function limpiaCache() {
  Object.keys(require.cache).filter((k) => /netlify\/functions/.test(k)).forEach((k) => delete require.cache[k]);
}
async function correr() {
  limpiaCache();
  const h = require(path.join(RAIZ, 'netlify/functions/portal-mi-plan-migrado.js')).handler;
  const r = await h({ httpMethod: 'POST', headers: { authorization: 'Bearer jwt' }, body: '{}' });
  return { status: r.statusCode, j: JSON.parse(r.body) };
}
(async () => {
  USER = { id: 'auth-1', email: 'laura@correo.mx', email_confirmed_at: sello };

  // ── (a) catálogo VIVO: el plan viaja armado
  DB = semilla(); CATALOGO_VIVO = true;
  const A = await correr();
  const tA = (A.j.tours || [])[0];
  af(() => A.status === 200 && !!tA, 'con catálogo vivo contesta 200 con su tour');
  af(() => tA && tA.plan && typeof tA.plan.estado === 'string', () => 'el tour trae su plan con estado: ' + (tA && tA.plan && tA.plan.estado));
  af(() => tA && tA.abonado === 3500 && tA.total === 9000, () => 'el dinero lo sigue contando saldoMigrado: abonado ' + (tA && tA.abonado) + ' de ' + (tA && tA.total));
  af(() => tA && tA.abonado_previo === 2000, 'viaja `abonado_previo` (sin él, el historial contradice la barra)');
  af(() => tA && Array.isArray(tA.abonos) && tA.abonos.length === 1, 'viajan sus abonos con fecha');
  af(() => tA && typeof tA.evento_ds === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(tA.evento_ds), () => 'viaja la fecha del evento derivada del catálogo: ' + (tA && tA.evento_ds));
  af(() => A.j.plan_error == null, 'sin motivo de error cuando el catálogo se leyó');
  // 🔒 La suma de las cuotas es exactamente lo que le falta, dicho por el handler.
  af(() => {
    const p = tA && tA.plan; if (!p || !Array.isArray(p.cuotas) || !p.cuotas.length) return false;
    return p.cuotas.reduce((a, c) => a + c.monto, 0) === p.resta && p.resta === tA.resta;
  }, 'las cuotas que salen del handler suman exactamente la resta del saldo');
  af(() => !DB.escrituras.filter((e) => /PATCH|DELETE/.test(e)).length, 'el plan NO escribe nada: cero PATCH y cero DELETE');

  // ── (b) catálogo ILEGIBLE: no se inventa calendario, y se DICE
  DB = semilla(); CATALOGO_VIVO = false;
  const B = await correr();
  const tB = (B.j.tours || [])[0];
  af(() => B.status === 200 && !!tB, 'con el catálogo caído el tour SIGUE viajando (su dinero no depende del index)');
  af(() => tB && tB.plan === null, 'su plan viaja en null — NO con cuotas vacías, que se leerían como «ya no debes pagos»');
  af(() => typeof B.j.plan_error === 'string' && B.j.plan_error.length > 0, () => 'y el motivo viaja dicho: «' + B.j.plan_error + '»');
  af(() => tB && tB.total === 9000 && tB.resta === 5500, 'el saldo sigue siendo el mismo con o sin catálogo');

  // ── (c) una fila SIN sello sigue sin viajar (regresión de PORTAL-SOLO-1)
  DB = semilla(); CATALOGO_VIVO = true; DB.v[0].portal_revisado_at = null;
  const C = await correr();
  af(() => (C.j.tours || []).length === 0, 'sin sello no viaja el tour… ni su plan (PORTAL-SOLO-1 intacto)');
  af(() => (C.j.en_revision || []).includes('juniorh'), 'y su evento sale en «en_revision»');

  // ═══ [F] LA PANTALLA ═════════════════════════════════════════════════════
  console.log('\n[F] La tarjeta del Portal: cada estado dice lo suyo');
  const ctx = {
    escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(rebana(PORTAL, 'function _migPagosHtml(t){') + ';', ctx);
  af(() => typeof ctx._migPagosHtml === 'function', 'la pantalla se rebanó de portal.html y corre (es la de verdad, no un doble)');
  const pinta = (t) => ctx._migPagosHtml(t);

  const base = { viajero_id: U(1), total: 9000, abonado: 3500, resta: 5500, abonado_previo: 2000, abonos: [{ monto: 1500, fecha: '2026-10-01' }], paquete: 'plus' };
  const hCal = pinta(Object.assign({}, base, { plan: pPlus }));
  af(() => /Tu plan de pagos/.test(hCal), 'el bloque se titula «Tu plan de pagos»');
  af(() => /Tu próximo pago/.test(hCal), 'destaca el próximo pago');
  af(() => /width:39%/.test(hCal), () => 'la barra pinta el avance real (3,500 de 9,000 = 39%)');
  af(() => /Pago 1 /.test(hCal) && /Pago 2 /.test(hCal), 'lista las cuotas numeradas');
  af(() => /pagos\.html#bbva/.test(hCal), 'PLUS manda a la cuenta BBVA de pagos.html');
  af(() => /pagos\.html#heybanco/.test(pinta(Object.assign({}, base, { paquete: 'cheap', plan: pCheap }))), 'CHEAP manda a Banamex — la misma regla de banco del sitio');
  af(() => /Pagos anteriores/.test(hCal) && /\$2,000/.test(hCal), 'el historial DICE los $2,000 sin fecha en vez de callarlos');
  af(() => /registrado el/.test(hCal) && !/pagado el/.test(hCal), 'los abonos se rotulan «registrado el» — su fecha es la de captura, no la del pago');
  // 🔒 El historial tiene que sumar lo mismo que la barra, o el cliente ve dos verdades.
  af(() => {
    const m = hCal.match(/Tus pagos registrados \((\d+)\)/);
    return m && Number(m[1]) === 2;
  }, 'el historial cuenta las 2 partidas (los previos + su abono) = lo que suma la barra');

  af(() => /liquidado/i.test(pinta(Object.assign({}, base, { abonado: 9000, resta: 0, plan: { estado: 'liquidado', resta: 0, cuotas: [] } }))), 'liquidado → «¡Ya está liquidado!»');
  af(() => !/Tu próximo pago/.test(pinta(Object.assign({}, base, { abonado: 9000, resta: 0, plan: { estado: 'liquidado', resta: 0, cuotas: [] } }))), 'y el liquidado NO pinta un próximo pago');
  const hNull = pinta(Object.assign({}, base, { plan: null }));
  af(() => /No pudimos armar tu calendario/.test(hNull), 'plan null → dice que no se pudo armar');
  af(() => !/Pago 1/.test(hNull) && !/Tu próximo pago/.test(hNull), 'y NO inventa ni una cuota');
  af(() => /no tenemos cargado el total/i.test(pinta(Object.assign({}, base, { plan: { estado: 'sin_total', resta: null, cuotas: [] } }))), 'sin_total → lo dice con palabras (no $0)');
  af(() => /confirmemos la fecha/i.test(pinta(Object.assign({}, base, { plan: { estado: 'sin_fecha', resta: 5500, cuotas: [] } }))), 'sin_fecha → «en cuanto confirmemos la fecha»');
  af(() => /ya pasó/i.test(pinta(Object.assign({}, base, { plan: { estado: 'evento_pasado', resta: 5500, cuotas: [] } }))), 'evento_pasado → lo dice, con su saldo');
  af(() => /Antes del evento/.test(pinta(Object.assign({}, base, { plan: pCerca }))), 'liquidar → una cuota «Antes del evento»');
  af(() => pinta({ sin_plan: true }) === '', 'una fila sin plan en la base no pinta bloque (lo dice el mensaje que ya existía)');
  // 🔒 La pantalla NO re-calcula la fórmula: no puede haber quincenas aquí.
  const fuente = rebana(PORTAL, 'function _migPagosHtml(t){');
  af(() => !/new Date\([^)]*,\s*\d+,\s*(9|24)\s*\)/.test(fuente) && !/getQuincenas/.test(fuente),
    'la pantalla no arma ninguna quincena: pinta lo que el servidor manda (cero quinta copia)');

  console.log('\n' + (R === 0 ? '✅ VERDE' : '🔴 ROJO') + ' · ' + V + ' en verde, ' + R + ' en rojo');
  if (V === 0) { console.log('⚠️  NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  process.exit(R === 0 ? 0 : 1);
})().catch((e) => { console.error('\n🔴 el arnés se CAYÓ:', e); process.exit(1); });
