#!/usr/bin/env node
/* ===========================================================================
 * mide-sep-300-1 — SEP-300-1 · EL SEPARO ES $300 EN TODOS LOS TOURS VIVOS
 *                   + los 6 CDMX 2027 abren a requisición
 *
 * Palabra de Memo (9-nov-2026): «todos los tours baja su separo a $300 no
 * importa cual sea 2026 o 2027 y abre cdmx 2027».
 *
 *   [A] el index del ÁRBOL: los 56 vivos del 9-nov (lista FIJA, no derivada
 *       del reloj — así el careo no caduca cuando un evento pase) traen
 *       sep=300 y, si lo emiten, sepCheap=300 y sepRide=300. Ninguno trae
 *       sepZonas ni sepEspecial (no hay separo escondido por zona).
 *   [B] control positivo: en BASE (el commit anterior) ≥ 29 de esos 56 traían
 *       otro separo — si BASE también diera 300, el careo no mediría nada.
 *   [C] el DUEÑO (`resolverPrecioVenta` con el index del árbol servido por red
 *       falsa) cotiza separo $300 × personas en PLUS/CHEAP/RIDE de eventos que
 *       antes tenían 1000/800/500, con el reloj a más de 15 días (la regla del
 *       50 % a ≤15 días es otra y sigue viva: se afirma con control).
 *   [D] las dos listas de la puerta 2027 traen los 6 CDMX nuevos, y la
 *       cotización de un CDMX abierto nace SIN transporte (requiere_transporte).
 * ⚠️ SIN ANCLA de HEAD a propósito (árbol de trabajo). BASE se busca por el
 *    mensaje de su commit (NUBE-6b), no por sha tecleado.
 * ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let V = 0, R = 0;
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}

// Los 56 vivos medidos el 9-nov-2026 (base = index, coincidían). Lista FIJA.
const VIVOS = ['feid','soylunadic','ozzfest','donomar','nortex','dialibre','pitbull','fuerzaregida','nsqkmty','mexicojamaica','u2','anagabriel','madero','oreja','niall','humbecdmx','luismiguel','frontera','palnorte','prevail','edc27','vivelatino','sleeping','payasonicos','warning','bahidora','sabrina','txt','emmanuel','interpol','muse','jisoo','yandel','mariajose','julion','scorpions','anuelaa','siddharta','karolcdmx','monlaferte','morat','brunomars','knotfest','arjona','edenmunoz','edsheeran','babymetal','caifanes','hilary','coronacapital','flowfest','tecatecomuna','badbunny','juniorh','louist','trueno'];
const CDMX_NUEVOS = ['warning', 'hilary', 'edc27', 'u2', 'louist', 'niall'];

function evDe(html) {
  const m = html.match(/var EV\s*=\s*(\[[\s\S]*?\]);\s*\n/);
  if (!m) throw new Error('no encontré var EV');
  // Las constantes del index (BANCO_DEFAULT, HOTEL_*) no importan para el separo:
  // un Proxy las contesta con un marcador sin tronar.
  const P = new Proxy({}, { has: (t, k) => !(k in globalThis), get: (t, k) => (k === Symbol.unscopables ? undefined : '<' + String(k) + '>') });
  return vm.runInNewContext('(function(P){ with(P){ return ' + m[1] + ' } })', { Symbol })(P);
}
function separosRaros(EV) {
  const mal = [];
  for (const id of VIVOS) {
    const e = EV.find((x) => x && x.id === id);
    if (!e) { mal.push(id + ':AUSENTE'); continue; }
    for (const k of ['sep', 'sepCheap', 'sepRide']) if (e[k] !== undefined && e[k] !== 300) mal.push(id + '.' + k + '=' + e[k]);
    if (e.sepZonas) mal.push(id + '.sepZonas');
    const zs = [...(e.zonas || []), ...(e.cheapZonas || [])];
    for (const mf of (e.multifecha || [])) zs.push(...(mf.zonas || []), ...(mf.cheapZonas || []));
    if (zs.some((z) => z && z.sepEspecial != null)) mal.push(id + '.sepEspecial');
  }
  return mal;
}

(async () => {
  console.log('══ mide-sep-300-1 · separo $300 en todos los vivos + CDMX 2027 abiertos ══');
  const INDEX_HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const EV = evDe(INDEX_HTML);
  af(EV.length > 100, 'premisa: el index del árbol parsea (' + EV.length + ' eventos)');
  af(VIVOS.length === 56 && new Set(VIVOS).size === 56, 'premisa: la lista fija trae 56 ids sin repetir');
  const presentes = VIVOS.filter((id) => EV.some((e) => e && e.id === id));
  af(presentes.length === 56, 'cardinalidad: los 56 existen en el index (' + presentes.length + ')');

  console.log('\n[A] el index del árbol');
  const malHead = separosRaros(EV);
  af(malHead.length === 0, 'los 56 vivos traen sep/sepCheap/sepRide = 300 y ningún separo escondido por zona' + (malHead.length ? ' · RAROS: ' + malHead.join(' ') : ''));
  const conSep = VIVOS.filter((id) => { const e = EV.find((x) => x.id === id); return e && e.sep === 300; });
  af(conSep.length >= 54, 'cardinalidad: ≥54 de los 56 emiten sep:300 (' + conSep.length + '; badbunny no lo emite hasta el publish)');
  const conRide = VIVOS.filter((id) => { const e = EV.find((x) => x.id === id); return e && e.sepRide !== undefined; });
  af(conRide.length === 3 && conRide.every((id) => EV.find((x) => x.id === id).sepRide === 300), 'los 3 con sepRide (caifanes · scorpions · tecatecomuna) lo traen en 300: ' + conRide.join(' '));

  console.log('\n[B] control positivo: BASE traía otros separos');
  let baseHtml = null;
  try {
    const sha = execSync('git log --format=%H --grep="^NUBE-6b" -n 1', { cwd: RAIZ }).toString().trim();
    af(/^[0-9a-f]{40}$/.test(sha), 'BASE encontrado por su mensaje (NUBE-6b): ' + sha.slice(0, 7));
    baseHtml = execSync('git show ' + sha + ':index.html', { cwd: RAIZ, maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (e) { af(false, 'no pude leer BASE: ' + e.message); }
  if (baseHtml) {
    const malBase = separosRaros(evDe(baseHtml));
    af(malBase.length >= 29, 'en BASE ≥29 de los 56 traían otro separo (' + malBase.length + ') — el careo SÍ distingue');
    af(malBase.some((x) => x === 'louist.sep=1000') && malBase.some((x) => x === 'brunomars.sepCheap=100'), 'BASE traía louist.sep=1000 y brunomars.sepCheap=100 (los extremos)');
    const lBase = (baseHtml.match(/var REQUISICION_EVENTOS=(\[[^\]]*\]);/) || [])[1];
    af(lBase && CDMX_NUEVOS.every((id) => !vm.runInNewContext(lBase).includes(id)), 'BASE no traía ninguno de los 6 CDMX en REQUISICION_EVENTOS');
  }

  console.log('\n[C] el dueño cotiza separo $300 (reloj a más de 15 días)');
  process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
  global.fetch = async (url) => {
    const u = String(url);
    const resp = (status, body) => ({ ok: status < 400, status, text: async () => body, json: async () => JSON.parse(body), headers: { get: () => null } });
    if (u.includes('/index.html') || /conectareynosa\.mx\/?$/.test(u)) return resp(200, INDEX_HTML);
    return resp(200, '[]');
  };
  const { resolverPrecioVenta } = require(path.join(RAIZ, 'netlify/functions/_lib/precio-zona.js'));
  const HOY = '2026-11-09';
  const zonaViva = (e, lista) => ((lista || []).find((z) => z && !z.ag && !z.prox && Number(z.p) > 0) || {}).n;
  async function cotiza(id, paquete, n, extra) {
    const e = EV.find((x) => x.id === id.split('#')[0]);
    const idx = Number(id.split('#')[1] || 0);
    const fuente = (e.multifecha && e.multifecha[idx]) || e;
    const zona = paquete === 'ride' ? undefined : zonaViva(e, paquete === 'cheap' ? (fuente.cheapZonas || e.cheapZonas) : (fuente.zonas || e.zonas));
    return resolverPrecioVenta(Object.assign({ evento_id: id, paquete, zona, num_personas: n, hoyISO: HOY, hotel_nombre: 'Compartida' }, extra || {}));
  }
  const casos = [
    ['louist', 'plus', 1, 300, 'louist PLUS (antes $1,000)'],
    ['louist', 'cheap', 2, 600, 'louist CHEAP ×2 (antes $1,000)'],
    ['arjona', 'plus', 1, 300, 'arjona PLUS (antes $800)'],
    ['brunomars', 'cheap', 1, 300, 'brunomars CHEAP (antes $100 — SUBE a 300)'],
    ['anagabriel', 'plus', 1, 300, 'anagabriel PLUS (antes $200 — SUBE a 300)'],
    ['niall', 'cheap', 1, 300, 'niall CHEAP (antes $500)'],
    ['caifanes#0', 'ride', 1, 300, 'caifanes#0 RIDE (sepRide antes $500)'],
    ['scorpions', 'ride', 2, 600, 'scorpions RIDE ×2 (sepRide antes $500)'],
    ['juniorh', 'cheap', 1, 300, 'juniorh CHEAP (antes $800)'],
  ];
  for (const [id, paq, n, esperado, txt] of casos) {
    const r = await cotiza(id, paq, n);
    af(r && r.ok && r.separo === esperado, txt + ' → separo ' + esperado + (r ? (r.ok ? ' (salió ' + r.separo + ', total ' + r.total + ')' : ' · RECHAZÓ: ' + r.motivo) : ''));
  }
  // Control: la regla de ≤15 días sigue viva y es OTRA (no la toca esta tuerca).
  const cerca = await cotiza('siddharta', 'plus', 1);
  af(cerca && cerca.ok && cerca.separo === Math.ceil(cerca.precio_unit * 0.5) && cerca.separo !== 300, 'control: siddharta (12-nov, ≤15 días) PLUS cotiza el 50 %, no 300 (' + (cerca && cerca.separo) + ')');

  console.log('\n[D] los 6 CDMX 2027 abiertos por las dos puertas');
  const lista = vm.runInNewContext((INDEX_HTML.match(/var REQUISICION_EVENTOS=(\[[^\]]*\]);/) || [])[1] || '[]');
  const C = require(path.join(RAIZ, 'netlify/functions/_lib/correo-confirmacion.js'));
  af(CDMX_NUEVOS.every((id) => lista.includes(id)), 'REQUISICION_EVENTOS trae los 6: ' + CDMX_NUEVOS.join(' '));
  af(CDMX_NUEVOS.every((id) => C.RESERVA_2027.includes(id)), 'RESERVA_2027 trae los 6');
  af(new Set(lista).size === lista.length, 'sin repetidos en REQUISICION_EVENTOS');
  for (const id of CDMX_NUEVOS) {
    const r = await cotiza(id, 'plus', 1);
    af(r && r.ok && r.separo === 300 && r.requiere_transporte === true && r.desglose.transportCost === 0,
       id + ' PLUS cotiza separo 300, SIN transporte en el total (requiere_transporte) · total ' + (r && r.total) + (r && !r.ok ? ' · ' + r.motivo : ''));
  }
  af(await C.correoDebeSalir('edc27#0', 'reserva'), 'edc27#0 al aprobar → el correo único SÍ sale');
  af(await C.correoDebeSalir('edc27', 'abono'), 'edc27 captura manual → SÍ sale [CORREO-ABONO-2027: la lista y la fecha mandan, no el tipo]');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();
