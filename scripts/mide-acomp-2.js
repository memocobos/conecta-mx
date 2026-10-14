#!/usr/bin/env node
// =============================================================================
// mide-acomp-2 — ACOMP-2 + GRUPO-VIAJE-1 (13-oct-2026)
// =============================================================================
// Entra por los HANDLERS REALES (portal-viajero `repartir`, admin-coordi
// `grupo_viaje_juntar/separar`) con una base falsa que RESPETA filtros
// (eq / is.null / in) y guarda estado. Mide:
//   [R] el reparto: contrato y dinero AL PESO, sumas intactas, cero DELETEs,
//       valores esperados en el filtro (2º clic = 409), ajena = 404,
//       el correo único va SOLO a correos distintos del titular.
//   [F] si poner el dinero falla, lo quitado VUELVE (jamás dinero inflado ni
//       perdido en silencio) y la respuesta lo dice (207).
//   [G] juntar / separar: mismo evento, funde grupos, separar suelta al último.
// Sin ancla de commit a propósito (carga del árbol de trabajo).
// =============================================================================
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const FN = path.join(RAIZ, 'netlify', 'functions');

let verdes = 0, rojos = 0;
function af(c, m) { try { if (c()) { verdes++; } else { rojos++; console.log('  ✗', typeof m === 'function' ? m() : m); } } catch (e) { rojos++; console.log('  ✗ (truena)', typeof m === 'function' ? '' : m, e.message); } }

// ── base falsa ──────────────────────────────────────────────────────────────
let DB, LOG, FALLAR;
function semilla() {
  DB = {
    viajeros_evento: [
      { id: 'aaaaaaaa-0000-4000-8000-000000000001', evento_id: 'palnorte', nombre: 'Karina Ramírez', correo: 'karina@x.com', boletos: 3, total_contrato: 900, abonado_previo: 0, tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', tipo_viajero: null, grupo_viaje: null, notas: 'Requisición R-RMZ5P' },
      { id: 'aaaaaaaa-0000-4000-8000-000000000002', evento_id: 'palnorte', nombre: 'Uno Solo', correo: 'solo@x.com', boletos: 1, total_contrato: 300, abonado_previo: 0, grupo_viaje: null },
      { id: 'aaaaaaaa-0000-4000-8000-000000000003', evento_id: 'karolg', nombre: 'Mixta', correo: 'mixta@x.com', boletos: 3, total_contrato: 10000, abonado_previo: 1000, tipo_paquete: 'plus', zona_boleto: 'General', grupo_viaje: null },
      { id: 'aaaaaaaa-0000-4000-8000-000000000010', evento_id: 'palnorte', nombre: 'Ana', correo: 'ana@x.com', boletos: 1, grupo_viaje: null },
      { id: 'aaaaaaaa-0000-4000-8000-000000000011', evento_id: 'palnorte', nombre: 'Bety', correo: 'bety@x.com', boletos: 1, grupo_viaje: 'ggggggg1-0000-4000-8000-000000000000' },
      { id: 'aaaaaaaa-0000-4000-8000-000000000012', evento_id: 'palnorte', nombre: 'Caro', correo: 'caro@x.com', boletos: 1, grupo_viaje: 'ggggggg1-0000-4000-8000-000000000000' },
      { id: 'aaaaaaaa-0000-4000-8000-000000000013', evento_id: 'karolg', nombre: 'Otra', correo: 'o@x.com', boletos: 1, grupo_viaje: null },
    ],
    abonos_viajero: [
      { id: 'bbbbbbbb-0000-4000-8000-000000000001', viajero_id: 'aaaaaaaa-0000-4000-8000-000000000001', monto: 900, fecha: '2026-10-12', nota: 'Requisición R-RMZ5P', foto_path: 'req/k.jpg' },
      { id: 'bbbbbbbb-0000-4000-8000-000000000002', viajero_id: 'aaaaaaaa-0000-4000-8000-000000000003', monto: 2000, fecha: '2026-09-01', nota: 'abono 1', foto_path: 'a/1.jpg' },
      { id: 'bbbbbbbb-0000-4000-8000-000000000003', viajero_id: 'aaaaaaaa-0000-4000-8000-000000000003', monto: 500, fecha: '2026-09-15', nota: 'abono 2', foto_path: null },
    ],
  };
  LOG = []; FALLAR = {};
}
function filtra(filas, qs) {
  const sp = new URLSearchParams(qs);
  let out = filas;
  for (const [k, v] of sp.entries()) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    if (v.startsWith('eq.')) { const x = decodeURIComponent(v.slice(3)); out = out.filter((f) => String(f[k]) === x); }
    else if (v === 'is.null') out = out.filter((f) => f[k] == null);
    else if (v.startsWith('in.(')) { const xs = v.slice(4, -1).split(',').map((z) => z.replace(/"/g, '')); out = out.filter((f) => xs.includes(String(f[k]))); }
    else if (v.startsWith('ilike.')) { const x = decodeURIComponent(v.slice(6)).toLowerCase(); out = out.filter((f) => String(f[k] || '').toLowerCase() === x); }
    else throw new Error('filtro no modelado: ' + k + '=' + v);
  }
  return out;
}
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
let nid = 100;
global.fetch = async (url, init = {}) => {
  const m = init.method || 'GET';
  if (url.includes('/auth/v1/user')) return resp(200, { id: 'u1', email: global.__JWT_CORREO, email_confirmed_at: '2026-10-01' });
  if (url.includes('/auth/v1/') || url.includes('verify')) return resp(200, {});
  const mm = /\/rest\/v1\/([a-z_]+)\??(.*)$/.exec(url);
  if (!mm) throw new Error('red no modelada: ' + url);
  const [, tabla, qs] = mm;
  LOG.push({ m, tabla, qs, body: init.body });
  if (m === 'DELETE') throw new Error('DELETE prohibido: ' + url);
  if (FALLAR[`${m} ${tabla}`]) return resp(500, { error: 'falla sembrada' });
  const T = DB[tabla] = DB[tabla] || [];
  if (m === 'GET') return resp(200, JSON.parse(JSON.stringify(filtra(T, qs))));
  if (m === 'POST') {
    const filas = [].concat(JSON.parse(init.body)).map((f) => Object.assign({ id: 'cccccccc-0000-4000-8000-' + String(nid++).padStart(12, '0') }, f));
    T.push(...filas); return resp(201, filas);
  }
  if (m === 'PATCH') {
    const hit = filtra(T, qs); const c = JSON.parse(init.body);
    hit.forEach((f) => Object.assign(f, c)); return resp(200, hit);
  }
  throw new Error('método ' + m);
};

process.env.PORTAL_SUPABASE_URL = 'https://pt.x';
process.env.PORTAL_SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.x';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';

// El correo único se ESPÍA (su propio careo es mide:confirma-1).
const CORREOS = [];
const libCorreo = require.resolve(path.join(FN, '_lib', 'correo-confirmacion'));
require.cache[libCorreo] = { id: libCorreo, filename: libCorreo, loaded: true,
  exports: { enviarCorreoPago: async (o) => { CORREOS.push(o); return { ok: true, enviados: ['x'] }; } } };

const pv = require(path.join(FN, 'portal-viajero'));
const llamar = async (correo, body) => {
  global.__JWT_CORREO = correo;
  const r = await pv.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer jwt' }, body: JSON.stringify(body) });
  return { status: r.statusCode, body: JSON.parse(r.body) };
};
const V = (id) => DB.viajeros_evento.find((v) => v.id === id);
const abonosDe = (id) => DB.abonos_viajero.filter((a) => a.viajero_id === id);
const cobrado = (id) => (Number(V(id).abonado_previo) || 0) + abonosDe(id).reduce((x, a) => x + Number(a.monto), 0);

(async () => {
  const K = 'aaaaaaaa-0000-4000-8000-000000000001';
  // ── [R] el caso Karina: 3 lugares, $900 contrato, $900 pagado ──────────────
  console.log('[R] reparto de Karina');
  semilla(); CORREOS.length = 0;
  const r1 = await llamar('karina@x.com', { accion: 'repartir', viajero_id: K, acompanantes: [
    { nombre: 'Sofía López', correo: 'Sofia@Y.com', celular: '8111111111' },
    { nombre: 'Lupita Pérez', correo: '' },
  ] });
  af(() => r1.status === 200 && r1.body.ok, () => 'status ' + r1.status + ' ' + JSON.stringify(r1.body));
  const nuevos = DB.viajeros_evento.filter((v) => /Sofía|Lupita/.test(v.nombre));
  af(() => nuevos.length === 2, 'nacen 2 acompañantes');
  af(() => V(K).boletos === 1, 'el titular queda con 1 lugar');
  af(() => V(K).total_contrato + nuevos.reduce((x, v) => x + v.total_contrato, 0) === 900, 'el contrato suma $900 al peso');
  af(() => nuevos.every((v) => v.total_contrato === 300 && v.boletos === 1), 'cada acompañante: contrato $300, 1 lugar');
  af(() => cobrado(K) + nuevos.reduce((x, v) => x + cobrado(v.id), 0) === 900, 'lo pagado suma $900 al peso (ni se crea ni se pierde)');
  af(() => nuevos.every((v) => cobrado(v.id) === 300), 'cada acompañante ve $300 pagados');
  af(() => cobrado(K) === 300, 'el titular queda con $300 pagados');
  const g = V(K).grupo_viaje;
  af(() => g && nuevos.every((v) => v.grupo_viaje === g), 'los tres en el MISMO grupo de viaje');
  af(() => nuevos.every((v) => v.evento_id === 'palnorte' && v.zona_boleto === 'Preventa a ciegas' && v.tipo_paquete === 'cheap'), 'heredan evento, zona y paquete');
  af(() => nuevos.find((v) => /Sofía/.test(v.nombre)).correo === 'sofia@y.com', 'correo propio en minúsculas');
  af(() => nuevos.find((v) => /Lupita/.test(v.nombre)).correo === 'karina@x.com', 'correo vacío → el del titular');
  af(() => /pagado por Karina/i.test(abonosDe(nuevos[0].id)[0].nota), 'la nota del abono dice quién pagó');
  af(() => abonosDe(nuevos[0].id)[0].foto_path === 'req/k.jpg' && abonosDe(nuevos[0].id)[0].fecha === '2026-10-12', 'heredan comprobante y fecha del pago original');
  af(() => /ACOMP-2/.test(DB.abonos_viajero[0].nota) && /antes \$900/.test(DB.abonos_viajero[0].nota), 'la nota del abono del titular dice a dónde se fue el dinero');
  af(() => CORREOS.length === 1 && CORREOS[0].viajeroIds.length === 1 && CORREOS[0].tipo === 'reserva', 'UN correo, solo para Sofía (Lupita va al correo de Karina)');
  af(() => CORREOS[0] && CORREOS[0].recibidoPorViajero[CORREOS[0].viajeroIds[0]] === 300, 'el correo dice su parte: $300');
  const parches = LOG.filter((l) => l.m === 'PATCH' && l.tabla === 'viajeros_evento');
  af(() => /boletos=eq\.3/.test(parches[0].qs) && /total_contrato=eq\.900/.test(parches[0].qs), 'el reclamo lleva sus valores esperados');
  af(() => LOG.filter((l) => l.m === 'PATCH' && l.tabla === 'abonos_viajero').every((l) => /monto=eq\./.test(l.qs)), 'cada abono tocado lleva su monto esperado');

  // 2º clic: ya no tiene 3 lugares → no reparte de nuevo
  const r2 = await llamar('karina@x.com', { accion: 'repartir', viajero_id: K, acompanantes: [{ nombre: 'Otra Vez', correo: 'z@z.com' }] });
  af(() => r2.status === 400 && DB.viajeros_evento.filter((v) => v.nombre === 'Otra Vez').length === 0, '2º clic sobre 1 lugar: rechazado y nada nace');

  // carrera: el reclamo no casa → 409, cero filas
  semilla();
  const pre = DB.viajeros_evento.length;
  const orig = global.fetch;
  global.fetch = async (url, init) => { if ((init || {}).method === 'PATCH' && url.includes('boletos=eq.3')) V(K).boletos = 2; return orig(url, init); };
  const r3 = await llamar('karina@x.com', { accion: 'repartir', viajero_id: K, acompanantes: [{ nombre: 'Sofía', correo: 's@s.com' }] });
  global.fetch = orig;
  af(() => r3.status === 409 && DB.viajeros_evento.length === pre, 'carrera: 409 y nadie nace');

  // ajena e inexistente contestan igual
  semilla();
  const r4 = await llamar('otra@x.com', { accion: 'repartir', viajero_id: K, acompanantes: [{ nombre: 'X Y', correo: '' }] });
  af(() => r4.status === 404, 'fila ajena → 404');
  // un solo lugar
  const r5 = await llamar('solo@x.com', { accion: 'repartir', viajero_id: 'aaaaaaaa-0000-4000-8000-000000000002', acompanantes: [{ nombre: 'X Y' }] });
  af(() => r5.status === 400, 'fila de 1 lugar → 400');
  // de más
  const r6 = await llamar('karina@x.com', { accion: 'repartir', viajero_id: K, acompanantes: [{ nombre: 'A A' }, { nombre: 'B B' }, { nombre: 'C C' }] });
  af(() => r6.status === 400 && V(K).boletos === 3, 'más acompañantes que lugares → 400, nada cambia');
  // correo malo
  const r7 = await llamar('karina@x.com', { accion: 'repartir', viajero_id: K, acompanantes: [{ nombre: 'A A', correo: 'no-es-correo' }] });
  af(() => r7.status === 400 && V(K).boletos === 3, 'correo inválido → 400');

  // ── [M] dinero mixto: previo $1,000 + abonos $2,000 y $500, contrato $10,000 ─
  console.log('[M] reparto con previo + varios abonos');
  semilla(); CORREOS.length = 0;
  const M = 'aaaaaaaa-0000-4000-8000-000000000003';
  const r8 = await llamar('mixta@x.com', { accion: 'repartir', viajero_id: M, acompanantes: [{ nombre: 'Uno Uno', correo: 'u1@x.com' }, { nombre: 'Dos Dos', correo: 'u2@x.com' }] });
  const nm = DB.viajeros_evento.filter((v) => /Uno Uno|Dos Dos/.test(v.nombre));
  af(() => r8.status === 200, 'status 200');
  af(() => V(M).total_contrato === 10000 - 3333 * 2 && nm.every((v) => v.total_contrato === 3333), 'contrato: 3,333 c/u y el residuo al titular (3,334)');
  af(() => cobrado(M) + nm.reduce((x, v) => x + cobrado(v.id), 0) === 3500, 'pagado total $3,500 intacto');
  af(() => nm.every((v) => cobrado(v.id) === 1166) && cobrado(M) === 3500 - 2332, 'pagado: 1,166 c/u, residuo al titular');
  af(() => V(M).abonado_previo === 0, 'se toma primero del previo');
  af(() => DB.abonos_viajero.find((a) => a.id === 'bbbbbbbb-0000-4000-8000-000000000002').monto === 2000 - 1332, 'luego del abono más grande');
  af(() => CORREOS[0] && CORREOS[0].evento_id === 'karolg', 'el correo se pide a la lib (ella decide si el evento manda)');

  // ── [F] poner el dinero falla → lo quitado vuelve, 207 ─────────────────────
  console.log('[F] falla al poner el dinero');
  semilla(); FALLAR['POST abonos_viajero'] = true;
  const r9 = await llamar('karina@x.com', { accion: 'repartir', viajero_id: K, acompanantes: [{ nombre: 'Sofía López', correo: 's@y.com' }] });
  af(() => r9.status === 207 && /equipo/.test(r9.body.aviso || ''), 'responde 207 y lo DICE');
  af(() => DB.abonos_viajero[0].monto === 900, 'el abono del titular VOLVIÓ a $900 (jamás dinero perdido)');
  af(() => DB.abonos_viajero.length === 3, 'no nació ningún abono a medias');
  af(() => DB.abonos_viajero[0].nota === 'Requisición R-RMZ5P', 'y su nota volvió a la original');
  // falla al nacer → el reclamo se revierte
  semilla(); FALLAR['POST viajeros_evento'] = true;
  const r10 = await llamar('karina@x.com', { accion: 'repartir', viajero_id: K, acompanantes: [{ nombre: 'Sofía López', correo: 's@y.com' }] });
  af(() => r10.status === 502 && V(K).boletos === 3 && V(K).total_contrato === 900, 'si no nacen, el titular vuelve a 3 lugares y $900');

  // ── [G] juntar / separar desde KameHouse ───────────────────────────────────
  console.log('[G] grupos a mano');
  semilla();
  const aut = require.resolve(path.join(FN, '_lib', 'verify-admin'));
  try { require(aut); } catch (_) {}
  const va = require(aut);
  const origLive = va.verifyAdminAuthLive;
  va.verifyAdminAuthLive = async () => ({ valid: true, user: { id: 'u-bulma', rol: 'bulma', correo: 'bulma@x' } });
  process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.x';
  let ac;
  try { ac = require(path.join(FN, 'admin-coordi-asignaciones')); } catch (e) { af(() => false, 'no carga admin-coordi: ' + e.message); }
  const kh = async (body) => {
    const r = await ac.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer x', origin: 'https://conectareynosa.mx' }, body: JSON.stringify(body) });
    return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
  };
  const A = 'aaaaaaaa-0000-4000-8000-000000000010', Bt = 'aaaaaaaa-0000-4000-8000-000000000011', Ca = 'aaaaaaaa-0000-4000-8000-000000000012', O = 'aaaaaaaa-0000-4000-8000-000000000013';
  const j1 = await kh({ accion: 'grupo_viaje_juntar', evento_id: 'palnorte', ids: [A, Bt] });
  af(() => j1.status === 200, () => 'juntar ok ' + j1.status + ' ' + JSON.stringify(j1));
  af(() => V(A).grupo_viaje && V(A).grupo_viaje === V(Bt).grupo_viaje && V(Ca).grupo_viaje === V(A).grupo_viaje, 'juntar Ana+Bety funde el grupo de Bety: las tres juntas');
  const j2 = await kh({ accion: 'grupo_viaje_juntar', evento_id: 'palnorte', ids: [A, O] });
  af(() => j2.status === 400 && V(O).grupo_viaje == null, 'otro evento → 400, nada se toca');
  const j3 = await kh({ accion: 'grupo_viaje_juntar', evento_id: 'palnorte', ids: [A] });
  af(() => j3.status === 400, 'una sola persona no es grupo → 400');
  await kh({ accion: 'grupo_viaje_separar', id: Ca });
  af(() => V(Ca).grupo_viaje == null && V(A).grupo_viaje != null, 'separar a Caro: Ana y Bety siguen juntas');
  await kh({ accion: 'grupo_viaje_separar', id: Bt });
  af(() => V(Bt).grupo_viaje == null && V(A).grupo_viaje == null, 'separar a Bety: Ana ya no es «grupo de uno»');
  va.verifyAdminAuthLive = origLive;

  console.log(`\n${rojos ? '🔴' : '✅'} mide:acomp-2 · ${verdes} en verde · ${rojos} en rojo`);
  if (!verdes) console.log('NADA MEDIDO · esto NO es un verde');
  process.exit(rojos || !verdes ? 1 : 0);
})().catch((e) => { console.error('TRUENA', e); process.exit(1); });
