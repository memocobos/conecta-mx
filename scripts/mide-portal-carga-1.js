#!/usr/bin/env node
/* mide-portal-carga-1 — PORTAL-CARGA-1 (9-nov-2026)
 * Medido en los logs de Netlify el día del estreno del pago desde el Portal:
 * cada entrada disparaba `portal-mi-plan-migrado` TRES veces en el mismo segundo
 * (0.3–3.8 s cada una). renderPlanMigrado comparte hoy el pedido EN VUELO.
 *   [A] Tres llamadas concurrentes → UN fetch al plan (y UNO al contrato), y
 *       las tres reciben la MISMA promesa.
 *   [B] Al terminar se suelta: una llamada posterior SÍ vuelve a pedir (los
 *       refrescos tras guardar/firmar/subir pago siguen vivos).
 *   [C] Un fallo en vuelo también suelta (nunca se queda pegado un pedido roto).
 *   [D] El cuerpo real sigue llamando al servidor con el Bearer (no se perdió
 *       nada en la mudanza a _migPlanPintar), y los llamadores del árbol
 *       siguen invocando `renderPlanMigrado` (nadie se saltó la puerta).
 *   [S] Control positivo por construcción: la misma puerta SIN el candado
 *       (la forma vieja) hace 3 fetch.
 * ⚠️ SIN ANCLA (árbol de trabajo, como mide:portal-vivo-1). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (e) { ok = false; } if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };

const PORTAL = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');

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
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// La puerta + el cuerpo REALES. El cuerpo necesita su mundo: sesión, fetch y un
// DOM mínimo. Con `tours: []` el pintor toma la rama corta (_psEstadoHtml) y no
// hace falta el resto de la casa.
function mundo({ fallaPlan = false } = {}) {
  const sb = {
    console,
    _migGrupoVisto: null,
    __fetches: [],
    _toursCache: [],
    _psEstadoHtml: () => '',
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'TOKEN-DE-PRUEBA' } } }) } },
    document: { getElementById: (id) => (id === 'tours-migrados' ? { style: {}, innerHTML: '' } : null) },
    setTimeout,
  };
  sb.window = sb;
  sb.fetch = async (url, init) => {
    sb.__fetches.push({ url, auth: init && init.headers && init.headers.Authorization });
    await new Promise((r) => setTimeout(r, 15));   // tarda, como el real: así las tres llegan en vuelo
    if (fallaPlan && /portal-mi-plan-migrado/.test(url)) throw new Error('red caída');
    if (/portal-mi-plan-migrado/.test(url)) return { ok: true, json: async () => ({ ok: true, tours: [], solicitudes: [], en_revision: [] }) };
    return { ok: true, json: async () => ({ ok: true, contratos: [] }) };
  };
  vm.createContext(sb);
  const puerta = rebana(PORTAL, 'function renderPlanMigrado(){');
  const decl = PORTAL.slice(PORTAL.indexOf('let _migPlanEnVuelo'), PORTAL.indexOf('function renderPlanMigrado(){'));
  const cuerpo = rebana(PORTAL, 'async function _migPlanPintar(){');
  vm.runInContext(decl + '\n' + puerta + '\n' + cuerpo, sb);
  return sb;
}
const planes = (sb) => sb.__fetches.filter((f) => /portal-mi-plan-migrado/.test(f.url)).length;

(async () => {
  console.log('\n[A] tres llamadas en el mismo tick → un solo pedido');
  {
    const sb = mundo();
    const p1 = sb.renderPlanMigrado(), p2 = sb.renderPlanMigrado(), p3 = sb.renderPlanMigrado();
    af(p1 === p2 && p2 === p3, 'las tres reciben la MISMA promesa');
    await Promise.all([p1, p2, p3]);
    af(planes(sb) === 1, 'UN fetch a portal-mi-plan-migrado (había 3): ' + planes(sb));
    af(sb.__fetches.filter((f) => /portal-contrato/.test(f.url)).length <= 1, 'y a lo más UNO a portal-contrato');
    af(sb.__fetches.every((f) => f.auth === 'Bearer TOKEN-DE-PRUEBA'), '[D] el cuerpo real sigue mandando el Bearer');
  }

  console.log('\n[B] al terminar se suelta: la siguiente llamada SÍ pide');
  {
    const sb = mundo();
    await sb.renderPlanMigrado();
    // un `let` de nivel superior NO es propiedad del contexto en vm (lección de NUBE-6): se lee corriendo la expresión
    af(vm.runInContext('_migPlanEnVuelo', sb) === null, 'el pedido en vuelo quedó en null al terminar');
    await sb.renderPlanMigrado();
    af(planes(sb) === 2, 'dos llamadas SEPARADAS = dos fetch (los refrescos tras guardar siguen vivos): ' + planes(sb));
  }

  console.log('\n[C] un fallo en vuelo también suelta');
  {
    const sb = mundo({ fallaPlan: true });
    let revento = false;
    try { await sb.renderPlanMigrado(); } catch (e) { revento = true; }
    af(!revento, 'la puerta no lanza (fail-soft del pintor)');
    af(vm.runInContext('_migPlanEnVuelo', sb) === null, 'y el pedido roto no se queda pegado');
    await sb.renderPlanMigrado();
    af(planes(sb) === 2, 'la siguiente llamada vuelve a intentar');
  }

  console.log('\n[D] los llamadores del árbol siguen entrando por la puerta');
  {
    // ⚠️ sinComentarios sobre portal.html ENTERO se come ~180 KB (un `/*` suelto
    // traga hasta el `*/` lejano — la lección de PAGOS-PORTAL-2): se cuenta por
    // LÍNEAS de código, saltando las que son comentario y la declaración. Y los
    // refrescos van como `setTimeout(renderPlanMigrado, 800)` — sin paréntesis —
    // así que se cuenta el NOMBRE.
    const lineas = PORTAL.split('\n').map((l) => l.trim()).filter((l) => !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'));
    const llam = lineas.filter((l) => /\brenderPlanMigrado\b/.test(l) && !/^function renderPlanMigrado/.test(l)).length;
    const directos = lineas.filter((l) => /\b_migPlanPintar\b/.test(l)).length;
    af(llam >= 5, 'renderPlanMigrado se usa desde ≥5 sitios del Portal (' + llam + ')');
    af(directos === 2, '_migPlanPintar aparece EXACTAMENTE 2 veces: su declaración y la puerta (' + directos + ') — nadie se salta el candado');
    af(PORTAL.indexOf('_migPlanPintar().catch(() => {}).then(() => { _migPlanEnVuelo = null; })') !== -1, 'la puerta suelta el vuelo en éxito Y en fallo');
  }

  console.log('\n[S] control positivo: la forma vieja (sin candado) hace 3 fetch');
  {
    const sb = mundo();
    vm.runInContext('function renderPlanMigradoViejo(){ return _migPlanPintar(); }', sb);
    await Promise.all([sb.renderPlanMigradoViejo(), sb.renderPlanMigradoViejo(), sb.renderPlanMigradoViejo()]);
    af(planes(sb) === 3, 'sin el candado: 3 fetch (' + planes(sb) + ') — el instrumento ve el defecto');
  }

  console.log('\n' + (R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();
