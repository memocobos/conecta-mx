#!/usr/bin/env node
/* mide-portal-hotfix-1 — PORTAL-HOTFIX-1 (9-nov-2026)
 * Tres defectos del Portal cazados por la auditoría del 9-nov, el primero una
 * REGRESIÓN MÍA (COB-WA-1, commit 01d6d67) que estaba EN PRODUCCIÓN:
 *   [A] portal-mi-plan-migrado: una fila SELLADA sin `total_contrato` hace que
 *       saldoMigrado conteste null, y `s.resta` tumbaba el handler ENTERO con
 *       502 → el Portal (que calla ante !r.ok) no pintaba NADA a esa persona.
 *       Medido en la base: 23 filas selladas sin total · 13 correos.
 *       CONTROL POSITIVO POR COMMIT: el handler de HEAD (git show) → 502.
 *   [B] portal.html: `money` vivía solo como variable LOCAL de _migPlanPintar y
 *       _migPagosHtml; _migPagoMp y _migPagoDesgToggle la usaban SUELTA en un
 *       módulo estricto → ReferenceError, tragado por el catch: el pago en línea
 *       NUNCA abría Mercado Pago. Se EJECUTA la función real en vm con y sin el
 *       dueño de módulo (control por construcción).
 *   [C] el submit del perfil recién guardado no pedía los viajes (spinner
 *       eterno hasta recargar): hoy corre los MISMOS tres lectores que
 *       cargarClienteYRutear — careado contra ESA función, no contra una lista.
 * ⚠️ El sujeto es el ÁRBOL DE TRABAJO (la forma de mide:portal-pago-2); el
 * control positivo de [A] sí es por commit (HEAD, el que está servido). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const { execSync } = require('child_process');
// [PASADO-FUERA-1 · 9-nov] El control positivo leía `HEAD`, y HEAD ya TRAE el
// arreglo (caducó el día de su propio merge). Hoy ancla al commit ANTERIOR a
// PORTAL-HOTFIX-1, buscado por su mensaje.
const BASE_HF = require('child_process').execSync('git log --format=%H -1 --grep="PORTAL-HOTFIX-1"', { cwd: require('path').join(__dirname, '..'), encoding: 'utf8' }).trim() + '~1';
const RAIZ = path.join(__dirname, '..');
process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (e) { ok = false; } const t = typeof m === 'function' ? m() : m; if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const PORTAL = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
const IDX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

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

// ═══ [A] EL HANDLER REAL con una fila sellada SIN total ═══════════════════
console.log('\n[A] portal-mi-plan-migrado: una fila sellada sin total ya NO tumba el handler');
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
let DB, USER;
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
const TABLAS = { viajeros_evento: 'v', abonos_viajero: 'abonos', portal_revisiones: 'rev', grupos_whatsapp: 'wa', cambios_viajero: 'cambios' };
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = new URL(String(url));
  if (u.hostname === 'conectareynosa.mx' || u.pathname.includes('index.html') || u.pathname === '/') return resp(200, IDX);
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
const PF = require(path.join(RAIZ, 'netlify/functions/_lib/plan-fijo.js'));
// La forma REAL de las 23 filas medidas: selladas, con dinero abonado y SIN total
// (migradas del Excel a las que nadie les ha capturado el contrato). Y al lado
// una fila sana, para afirmar que su `sugerido` sigue vivo (regresión).
function semilla() {
  return {
    escrituras: [], rev: [], wa: [], cambios: [],
    v: [
      { id: U(1), evento_id: 'juniorh', nombre: 'Sin Total Gómez', correo: 'sintotal@correo.mx', tipo_paquete: 'plus', zona_boleto: 'General', total_contrato: null, abonado_previo: 300, boletos: 1, portal_revisado_at: sello, plan_pagos: null },
      { id: U(2), evento_id: 'fuerzaregida#0', nombre: 'Sin Total Gómez', correo: 'sintotal@correo.mx', tipo_paquete: 'plus', zona_boleto: 'Oro', total_contrato: 9000, abonado_previo: 2000, boletos: 1, portal_revisado_at: sello,
        plan_pagos: PF.armarPlanFijo({ separo_fecha: '2026-10-01', separo_monto: 2000, total: 9000, paquete: 'plus', ds: '2027-01-11' }) },
    ],
    abonos: [{ viajero_id: U(2), monto: 1500, fecha: '2026-10-01' }],
  };
}
function limpiaCache() { Object.keys(require.cache).filter((k) => /netlify\/functions/.test(k)).forEach((k) => delete require.cache[k]); }
async function correr(archivo) {
  limpiaCache();
  const h = require(archivo || path.join(RAIZ, 'netlify/functions/portal-mi-plan-migrado.js')).handler;
  const r = await h({ httpMethod: 'POST', headers: { authorization: 'Bearer jwt' }, body: '{}' });
  return { status: r.statusCode, j: JSON.parse(r.body) };
}
(async () => {
  USER = { id: 'auth-1', email: 'sintotal@correo.mx', email_confirmed_at: sello };

  DB = semilla();
  const A = await correr();
  af(() => A.status === 200, () => 'HEAD (árbol): contesta 200 con la fila sin total (dio ' + A.status + (A.j.error ? ' · ' + A.j.error + ': ' + A.j.detail : '') + ')');
  const tours = A.j.tours || [];
  af(() => tours.length === 2, () => 'viajan los DOS tours de la persona (dio ' + tours.length + ')');
  const sinTotal = tours.find((t) => t.evento_id === 'juniorh');
  const conTotal = tours.find((t) => t.evento_id === 'fuerzaregida#0');
  af(() => sinTotal && sinTotal.sugerido === null, () => 'la fila sin total viaja con `sugerido` null (no hay resta de qué sugerir): ' + JSON.stringify(sinTotal && sinTotal.sugerido));
  af(() => sinTotal && (sinTotal.total == null || sinTotal.total === 0) && sinTotal.plan && sinTotal.plan.estado === 'sin_total', () => 'y su plan sigue diciendo «sin_total» por su nombre (dio ' + (sinTotal && sinTotal.plan && sinTotal.plan.estado) + ')');
  af(() => conTotal && typeof conTotal.sugerido === 'number' && conTotal.sugerido > 0, () => 'REGRESIÓN: la fila sana sigue trayendo su `sugerido` del rol fijo ($' + (conTotal && conTotal.sugerido) + ')');
  af(() => !DB.escrituras.length, 'cero escrituras: el handler solo lee');

  // 🔒 CONTROL POSITIVO POR COMMIT: el handler de HEAD (el que está SERVIDO en
  // producción) con la MISMA semilla tiene que caer en 502 por `s.resta`. Si no
  // cae, este careo no está reproduciendo el defecto.
  const tmp = path.join(RAIZ, 'netlify/functions', '.mide-portal-hotfix-1-base.js');
  try {
    const src = execSync('git show ' + BASE_HF + ':netlify/functions/portal-mi-plan-migrado.js', { cwd: RAIZ, encoding: 'utf8' });
    af(() => /PF\.tocaHoy\(plan,\s*s\.resta\)/.test(src), 'HEAD lee `s.resta` a secas (es el defecto, no otra cosa)');
    fs.writeFileSync(tmp, src);
    DB = semilla();
    const B = await correr(tmp);
    af(() => B.status === 502, () => 'CONTROL POSITIVO: HEAD contesta 502 con la misma semilla (dio ' + B.status + ')');
    af(() => B.status === 502 && /resta/.test(String(B.j.detail || '')), () => 'y el detalle nombra `resta`: «' + (B.j.detail || '') + '»');
    // Y la fila SANA tampoco salva al handler viejo: un solo null tumba a todos.
    DB = semilla(); DB.v = [DB.v[0]];
    const B2 = await correr(tmp);
    af(() => B2.status === 502, 'con SOLO la fila sin total, HEAD también cae: la persona ve el Portal vacío');
  } finally { try { fs.unlinkSync(tmp); } catch (_) {} }

  // ═══ [B] `money` tiene UN dueño de módulo ═════════════════════════════════
  console.log('\n[B] portal.html: _migPagoMp y _migPagoDesgToggle ya encuentran `money`');
  const srcMp = rebana(PORTAL, 'async function _migPagoMp(id, btn){');
  const srcMonto = rebana(PORTAL, 'function _migPagoMonto(id){');
  const srcMoney = rebana(PORTAL, 'function money(n){');
  const srcDesg = rebana(PORTAL, 'function _migPagoDesgToggle(id){');
  const srcDesglose = rebana(PORTAL, 'function _migPagoDesglose(id){');
  af(() => /^function money\(n\)\{ return '\$' \+ Number\(n \|\| 0\)\.toLocaleString\('es-MX'\); \}$/.test(srcMoney), 'el dueño de módulo tiene EXACTAMENTE el formato de las copias locales');
  // La misma forma que la copia local de _migPlanPintar: si divergen, un monto
  // se pintaría distinto según quién lo pinte.
  const copiasLocales = (PORTAL.match(/const money = \(n\) => '\$' \+ Number\(n \|\| 0\)\.toLocaleString\('es-MX'\);/g) || []).length;
  af(() => copiasLocales >= 2, () => 'las copias locales siguen con el MISMO formato (' + copiasLocales + ' — la sombra es inocua porque dicen lo mismo)');
  af(() => /\bmoney\(/.test(srcMp) && /\bmoney\(/.test(srcDesg), 'las dos funciones SÍ usan `money` (si no, el bloque mediría la nada)');

  function dom() {
    const nodos = {};
    const el = (id) => (nodos[id] = nodos[id] || { id, textContent: '', value: '', style: {}, dataset: {}, checked: false, disabled: false, querySelectorAll: () => [], addEventListener() {} });
    return { getElementById: (id) => el(id), _el: el, querySelectorAll: () => [] };
  }
  async function correrMp(conDueno) {
    const d = dom();
    d._el('mig-pago-monto-X').value = '500';
    const ctx = { document: d, console, window: { location: {} }, setTimeout: (f) => f(), CSS: { escape: (s) => s }, Number, String, JSON,
      _migPost: async () => ({ ok: true, url: 'https://mp.test/pref', total: 519, neto: 500, comision: 19 }) };
    vm.createContext(ctx);
    vm.runInContext('"use strict";\n' + (conDueno ? srcMoney + '\n' : '') + srcMonto + '\n' + srcMp + '\n', ctx);
    const btn = { disabled: false };
    await ctx._migPagoMp('X', btn);
    return { msg: d._el('mig-mp-msg-X').textContent, href: ctx.window.location.href, btn };
  }
  const conD = await correrMp(true), sinD = await correrMp(false);
  af(() => conD.href === 'https://mp.test/pref', () => 'con el dueño, _migPagoMp ABRE Mercado Pago (href = ' + conD.href + ')');
  af(() => /Te cobra \$519 \(tu abono \$500 \+ \$19 de comisión\)/.test(conD.msg), () => 'y dice los montos: «' + conD.msg + '»');
  af(() => conD.btn.disabled === true, 'el botón queda deshabilitado mientras redirige');
  af(() => sinD.href === undefined && /No se pudo generar tu link/.test(sinD.msg), () => 'CONTROL: sin el dueño, el catch se traga el ReferenceError y el cliente lee «' + sinD.msg + '» — el defecto exacto de producción');
  af(() => sinD.btn.disabled === false, 'CONTROL: y el botón se re-habilita como si MP hubiera rechazado (nadie se enteraba)');

  function correrDesg(conDueno) {
    const d = dom();
    d._el('mig-desg-on-X').checked = true;
    const ctx = { document: d, console, CSS: { escape: (s) => s }, Number, String, Array, JSON };
    vm.createContext(ctx);
    const srcDesgOn = srcDesg;
    vm.runInContext('"use strict";\n' + (conDueno ? srcMoney + '\n' : '') + srcDesglose + '\n' + srcDesgOn + '\n', ctx);
    let err = null;
    try { ctx._migPagoDesgToggle('X'); } catch (e) { err = e; }
    return { err, suma: d._el('mig-desg-suma-X').textContent };
  }
  const dC = correrDesg(true), dS = correrDesg(false);
  af(() => dC.err === null && dC.suma === '$0', () => 'con el dueño, el desglose pinta su suma sin tronar (suma «' + dC.suma + '»' + (dC.err ? ' · ' + dC.err.message : '') + ')');
  af(() => dS.err && /money is not defined/.test(dS.err.message), () => 'CONTROL: sin el dueño truena «' + (dS.err && dS.err.message) + '»');
  // El `on` del desglose se lee del DOM: la caja necesita existir con checked.
  af(() => /getElementById\('mig-desg-on-'/.test(srcDesg), 'el toggle lee la casilla por id (la premisa del caso)');

  // ═══ [C] el perfil recién guardado pide sus viajes ════════════════════════
  console.log('\n[C] el submit del perfil corre los mismos lectores que cargarClienteYRutear');
  const iSubmit = PORTAL.indexOf("$('#form-profile').addEventListener('submit'");
  af(() => iSubmit > 0, 'existe el submit del perfil');
  const bloqueSubmit = PORTAL.slice(iSubmit, PORTAL.indexOf('\n});', iSubmit) + 4);
  const srcRutear = rebana(PORTAL, 'async function cargarClienteYRutear(session){');
  // Los lectores se DERIVAN del dueño (cargarClienteYRutear), no de una lista.
  const lectores = [...new Set((srcRutear.match(/\b(renderToursList|renderMisViajesAcomp|loadContratosEstado)\(\)/g) || []).map((s) => s.replace('()', '')))];
  af(() => lectores.length === 3, () => 'cargarClienteYRutear corre 3 lectores: ' + lectores.join(', '));
  const sinComentarios = (s) => s.replace(/\/\/[^\n]*/g, '');
  const faltan = lectores.filter((f) => !new RegExp('\\b' + f + '\\(\\)').test(sinComentarios(bloqueSubmit)));
  af(() => faltan.length === 0, () => 'el submit del perfil corre los TRES (faltan: ' + (faltan.join(', ') || 'ninguno') + ')');
  // Y en el ORDEN correcto: después de showView('dashboard'), antes de las
  // invitaciones/reservas pendientes — como el camino normal.
  const sc = sinComentarios(bloqueSubmit);
  af(() => sc.indexOf("showView('dashboard')") < sc.indexOf('renderToursList()') && sc.indexOf('renderToursList()') < sc.indexOf('_procesarInvitacionPendiente()'), 'y en orden: tras showView(dashboard), antes de las invitaciones pendientes');
  // Control por commit: HEAD no los corría ahí.
  const submitHead = (() => { const h = execSync('git show ' + BASE_HF + ':portal.html', { cwd: RAIZ, encoding: 'utf8' }); const i = h.indexOf("$('#form-profile').addEventListener('submit'"); return sinComentarios(h.slice(i, h.indexOf('\n});', i) + 4)); })();
  af(() => !/renderToursList\(\)/.test(submitHead), 'CONTROL POSITIVO: en HEAD el submit del perfil NO pedía los viajes');

  console.log('\n[F] PASADO-FUERA-1 · un evento realizado que salió del catálogo');
  { const PR = require('../netlify/functions/_lib/portal-revision');
    const n = PR.nombreEvento([], 'palnorte2026');
    af(() => n.ds === '2026-03-27' && /Pa'l Norte 2026/.test(n.nombre), 'palnorte2026 fuera del catálogo trae su fecha y nombre (la bandeja lo ve PASADO)');
    af(() => !PR.nombreEvento([], 'natanael').ds, 'control: un CANCELADO (natanael) NO es recuerdo — sigue sin fecha');
    const src = require('fs').readFileSync(require('path').join(__dirname, '../netlify/functions/portal-mi-plan-migrado.js'), 'utf8');
    af(() => /FUERA_CATALOGO\[/.test(src), 'el Portal pregunta a la MISMA lista (FUERA_CATALOGO) para marcar `pasado`'); }
  console.log('\n' + (R ? '🔴' : '✅') + ' mide:portal-hotfix-1 · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(2); });
