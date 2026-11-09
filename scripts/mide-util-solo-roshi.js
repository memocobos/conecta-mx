#!/usr/bin/env node
/* mide-util-solo-roshi — UTIL-SOLO-ROSHI (9-nov-2026)
 * Palabra de Memo: «ni milk ni bulma ven utilidad».
 *   [S] El handler REAL de admin-utilidad-evento, con red falsa y rol vivo:
 *       roshi/director reciben la utilidad; bulma y milk reciben la cuenta
 *       operativa SIN ninguna pieza de utilidad (el dato no VIAJA). La deuda a
 *       proveedores sigue con sus dueños de antes (roshi · bulma · director).
 *       Milk entra (antes 403). CONTROL POSITIVO POR COMMIT: el handler de HEAD
 *       le manda la utilidad a bulma y le cierra la puerta a milk.
 *   [E] Espejos: las listas del navegador = las del servidor.
 *   [P] La pantalla REAL (_audUtilidadPintar en vm): con utilidad_oculta la card
 *       grande se esconde; sin ella se pinta como siempre.
 * Sin ancla (árbol de trabajo) — el control es por `git show HEAD`. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.PORTAL_SUPABASE_URL = 'https://portal.falso.test';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'svc';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {}
  const t = typeof m === 'function' ? (() => { try { return m(); } catch (e) { return '(msg) ' + e.message; } })() : m;
  if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
let ROL_VIVO = 'maestro_roshi';
global.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u-' + ROL_VIVO, activo: true, rol: ROL_VIVO, sesion_desde: null, sesiones_cerradas_at: null }]);
  return resp(200, []);
};
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
async function llamar(archivo, rol) {
  ROL_VIVO = rol;
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/') && !k.includes('verify-admin')) delete require.cache[k];
  const H = require(archivo).handler;
  const jw = jwtSign({ id: 'u-' + rol + '-' + Math.random(), rol, correo: 'x@x.mx', nombre: 'X' }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', path: '/.netlify/functions/admin-utilidad-evento', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: '{}', queryStringParameters: {} });
  let j = {}; try { j = JSON.parse(r.body || '{}'); } catch (_) {}
  return { s: r.statusCode, j };
}
const ARBOL = path.join(RAIZ, 'netlify/functions/admin-utilidad-evento.js');
const M = require(ARBOL);
const piezas = (j) => { const t = (j.cuenta && j.cuenta.totales) || {}; return M.CAMPOS_UTILIDAD.filter((k) => k in t); };

(async () => {
  console.log('[S] el servidor proyecta por rol');
  const roshi = await llamar(ARBOL, 'maestro_roshi');
  af(roshi.s === 200 && roshi.j.cuenta && roshi.j.cuenta.totales, () => 'roshi: 200 con su cuenta (' + roshi.s + (roshi.j.cuenta_error ? ' · ' + roshi.j.cuenta_error : '') + ')');
  af(piezas(roshi.j).includes('ganancia_empresa') && piezas(roshi.j).includes('inversion_boletos'), () => 'roshi recibe la utilidad (premisa: el fixture SÍ produce esas piezas: ' + piezas(roshi.j).join(',') + ')');
  af(roshi.j.utilidad_oculta === false, 'roshi: utilidad_oculta false');
  for (const rol of ['bulma', 'milk']) {
    const r = await llamar(ARBOL, rol);
    af(r.s === 200, () => rol + ': entra (200; dio ' + r.s + ' ' + (r.j.error || '') + ')');
    af(r.j.cuenta && piezas(r.j).length === 0, () => rol + ': CERO piezas de utilidad en el total (viajaron: ' + piezas(r.j).join(',') + ')');
    af(r.j.cuenta && Object.values(r.j.cuenta.eventos || {}).every((e) => M.CAMPOS_UTILIDAD.every((k) => !(k in e))), rol + ': cero piezas de utilidad por evento');
    af(r.j.utilidad_oculta === true && r.j.cuenta.utilidad_oculta === true, rol + ': utilidad_oculta true (la pantalla no pinta el hueco)');
    af(r.j.cuenta && 'ventas' in r.j.cuenta.totales && 'gastos' in r.j.cuenta.totales, rol + ': la cuenta OPERATIVA sí viaja (ventas · gastos)');
    const t = r.j.totales || {};
    af(!('caja_total_empresa' in t) && !('proyectado_total' in t), rol + ': sin caja/proyectado de empresa (bloque Portal-puro)');
    const veDeuda = r.j.cuenta && 'deuda_proveedores' in r.j.cuenta.totales;
    af(rol === 'bulma' ? veDeuda : !veDeuda, rol + (rol === 'bulma' ? ': la DEUDA a proveedores SÍ le llega (no es utilidad, dueños de antes)' : ': la deuda NO le llega (como antes)'));
  }
  const dir = await llamar(ARBOL, 'director');
  af(dir.s === 200 && piezas(dir.j).includes('ganancia_empresa'), () => 'director (solo lectura de todo): ve la utilidad (' + dir.s + ')');
  const yaj = await llamar(ARBOL, 'yajirobe');
  af(yaj.s === 403, 'yajirobe sigue fuera (403)');

  // CONTROL POSITIVO POR COMMIT
  const tmp = path.join(RAIZ, 'netlify/functions', '.mide-util-solo-roshi-base.js');
  try {
    fs.writeFileSync(tmp, execSync('git show HEAD:netlify/functions/admin-utilidad-evento.js', { cwd: RAIZ, encoding: 'utf8' }));
    const bB = await llamar(tmp, 'bulma');
    af(bB.s === 200 && piezas(bB.j).includes('ganancia_empresa'), 'CONTROL POSITIVO: el handler de HEAD sí le mandaba la utilidad a bulma');
    const mB = await llamar(tmp, 'milk');
    af(mB.s === 403, 'CONTROL POSITIVO: el handler de HEAD le cerraba la puerta a milk (403 → su Resumen caía al cálculo Portal-puro)');
  } finally { try { fs.unlinkSync(tmp); } catch (_) {} }

  console.log('\n[E] espejos del navegador = dueños del servidor');
  const KH = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const lista = (n) => (KH.match(new RegExp('const ' + n + " = \\[([^\\]]*)\\]")) || [])[1];
  const arr = (x) => (x || '').split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean).sort().join(',');
  af(arr(lista('KH_UTILIDAD_ROLES')) === M.ROLES_UTILIDAD.slice().sort().join(','), () => 'KH_UTILIDAD_ROLES = ROLES_UTILIDAD (' + arr(lista('KH_UTILIDAD_ROLES')) + ')');
  af(arr(lista('RESUMEN_DEUDA_ROLES')) === M.ROLES_DEUDA.slice().sort().join(','), () => 'RESUMEN_DEUDA_ROLES = ROLES_DEUDA (' + arr(lista('RESUMEN_DEUDA_ROLES')) + ')');

  console.log('\n[P] la pantalla real');
  const RES = fs.readFileSync(path.join(RAIZ, 'kamehouse-resumen.js'), 'utf8');
  const i = RES.indexOf('function _audUtilidadPintar(');
  let d = 0, k = RES.indexOf('{', i); for (; k < RES.length; k++) { if (RES[k] === '{') d++; else if (RES[k] === '}') { d--; if (!d) { k++; break; } } }
  const src = RES.slice(i, k);
  function pinta(rol, util) {
    const nodos = {};
    const el = (id) => (nodos[id] = nodos[id] || { id, textContent: '', innerHTML: '', className: '', style: {} });
    const ctx = { document: { getElementById: el }, currentUser: { rol }, KH_UTILIDAD_ROLES: ['maestro_roshi', 'director'], _spFmtMxn: (n) => '$' + n, Number, Math, String };
    vm.createContext(ctx); vm.runInContext(src, ctx);
    try { ctx._audUtilidadPintar(-5000, {}, util); } catch (_) {}
    return nodos;
  }
  const nB = pinta('bulma', { utilidad_oculta: true, cuenta: { utilidad_oculta: true } });
  af(nB.resumen_utilidad === undefined && nB['resumen-utilidad'].style.display === 'none', 'bulma: la card grande de utilidad se ESCONDE');
  af(!nB['m-utilidad'] || nB['m-utilidad'].textContent === '', 'bulma: no se escribe ni un número de utilidad');
  const nR = pinta('maestro_roshi', { cuenta: {} });
  af(nR['resumen-utilidad'].style.display === '' && nR['m-utilidad'].textContent === '$5000', () => 'roshi: la card se pinta como siempre (' + nR['m-utilidad'].textContent + ')');
  const RES2 = RES.slice(RES.indexOf('async function _renderResumenUtilidad('));
  af(/resumen-utilidad-card/.test(RES2.slice(0, 1200)) && /KH_UTILIDAD_ROLES/.test(RES2.slice(0, 1200)), 'la tabla «Ganancia por evento» también se esconde por rol');

  console.log('\n' + (R ? '🔴' : '✅') + ' mide:util-solo-roshi · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(2); });
