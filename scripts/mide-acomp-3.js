#!/usr/bin/env node
// =============================================================================
// mide-acomp-3 — ACOMP-3 (10-nov-2026): «👥 Repartir» desde Capsule.
// Caso Karina (Pa'l Norte): 3 lugares en una fila, datos por Messenger.
// Entra por el HANDLER REAL de admin-coordi-asignaciones (`viajero_repartir`)
// con la MISMA base falsa de mide:acomp-2 (respeta filtros, guarda estado,
// truena ante DELETE). Mide:
//   [C] el reparto al peso + talla/emergencia/género por acompañante + sello
//       heredado + grupo + 2º clic rechazado + validaciones que no escriben
//   [P] el dueño es UNO: portal-viajero ya no lleva cuerpo propio
//   [X] un coordi no entra (403)
// Sin ancla de commit (árbol de trabajo).
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
    // [PORTAL-SOLO-1] Las filas del fixture nacen SELLADAS: desde el 27-oct el Portal solo toca lo revisado (la fila sin sello es 404, medido en mide:portal-solo-1). El arnés se actualiza a la verdad nueva.
      { id: 'aaaaaaaa-0000-4000-8000-000000000001', portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'palnorte', nombre: 'Karina Ramírez', correo: 'karina@x.com', boletos: 3, total_contrato: 900, abonado_previo: 0, tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', tipo_viajero: null, grupo_viaje: null, notas: 'Requisición R-RMZ5P' },
      { id: 'aaaaaaaa-0000-4000-8000-000000000002', portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'palnorte', nombre: 'Uno Solo', correo: 'solo@x.com', boletos: 1, total_contrato: 300, abonado_previo: 0, grupo_viaje: null },
      { id: 'aaaaaaaa-0000-4000-8000-000000000003', portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'karolg', nombre: 'Mixta', correo: 'mixta@x.com', boletos: 3, total_contrato: 10000, abonado_previo: 1000, tipo_paquete: 'plus', zona_boleto: 'General', grupo_viaje: null },
      { id: 'aaaaaaaa-0000-4000-8000-000000000010', portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'palnorte', nombre: 'Ana', correo: 'ana@x.com', boletos: 1, grupo_viaje: null },
      { id: 'aaaaaaaa-0000-4000-8000-000000000011', portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'palnorte', nombre: 'Bety', correo: 'bety@x.com', boletos: 1, grupo_viaje: 'ggggggg1-0000-4000-8000-000000000000' },
      { id: 'aaaaaaaa-0000-4000-8000-000000000012', portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'palnorte', nombre: 'Caro', correo: 'caro@x.com', boletos: 1, grupo_viaje: 'ggggggg1-0000-4000-8000-000000000000' },
      { id: 'aaaaaaaa-0000-4000-8000-000000000013', portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'karolg', nombre: 'Otra', correo: 'o@x.com', boletos: 1, grupo_viaje: null },
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

const fs = require('fs');
const V = (id) => DB.viajeros_evento.find((v) => v.id === id);
const abonosDe = (id) => DB.abonos_viajero.filter((a) => a.viajero_id === id);
const cobrado = (id) => (Number(V(id).abonado_previo) || 0) + abonosDe(id).reduce((x, a) => x + Number(a.monto), 0);

(async () => {
  const aut = require.resolve(path.join(FN, '_lib', 'verify-admin'));
  const va = require(aut);
  let ROL = 'bulma';
  va.verifyAdminAuthLive = async () => ({ valid: true, user: { id: 'u-' + ROL, rol: ROL, correo: ROL + '@x', nombre: 'Ximena' } });
  const ac = require(path.join(FN, 'admin-coordi-asignaciones'));
  const kh = async (body) => {
    const r = await ac.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer x', origin: 'https://conectareynosa.mx' }, body: JSON.stringify(body) });
    return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
  };
  const K = 'aaaaaaaa-0000-4000-8000-000000000001';

  console.log('[C] Capsule reparte a Karina');
  semilla(); CORREOS.length = 0;
  const escr0 = () => LOG.filter((l) => l.m !== 'GET').length;
  let r = await kh({ accion: 'viajero_repartir', id: K, acompanantes: [{ nombre: 'Kaleb B', talla_playera: 'XXXL' }] });
  af(() => r.status === 400 && /talla/i.test(r.body.error) && escr0() === 0, () => 'talla fuera de la lista → 400 sin escribir · ' + JSON.stringify(r.body));
  r = await kh({ accion: 'viajero_repartir', id: K, acompanantes: [{ nombre: 'Kaleb B', celular: '8148061376', num_emergencia: '8148061376' }] });
  af(() => r.status === 400 && /OTRA persona/.test(r.body.error) && escr0() === 0, 'emergencia = su celular → 400 sin escribir');
  r = await kh({ accion: 'viajero_repartir', id: K, acompanantes: [{ nombre: 'A a' }, { nombre: 'B b' }, { nombre: 'C c' }] });
  af(() => r.status === 400 && escr0() === 0, '3 acompañantes sobre 3 lugares → 400 (máx 2)');

  r = await kh({ accion: 'viajero_repartir', id: K, acompanantes: [
    { nombre: 'Kaleb Nahum Biraghi Treviño', correo: '', celular: '81 4806 1376', talla_playera: 'l', num_emergencia: '(956) 820-0852', genero: 'H' },
    { nombre: 'Brihana Astrid Biraghi Treviño', correo: '', celular: '782 195 3184', talla_playera: 'xs', num_emergencia: '(956) 820-0852', genero: 'M' },
  ] });
  af(() => r.status === 200 && r.body.ok, () => 'reparte · ' + r.status + ' ' + JSON.stringify(r.body));
  const nuevos = DB.viajeros_evento.filter((v) => /Biraghi/.test(v.nombre));
  af(() => nuevos.length === 2 && V(K).boletos === 1, 'nacen 2 y Karina queda con 1 lugar');
  af(() => V(K).total_contrato + nuevos.reduce((x, v) => x + v.total_contrato, 0) === 900 && nuevos.every((v) => v.total_contrato === 300), 'contrato $300 c/u, suma $900 al peso');
  af(() => cobrado(K) === 300 && nuevos.every((v) => cobrado(v.id) === 300), 'pagado $300 c/u (ni se crea ni se pierde)');
  const kal = nuevos.find((v) => /Kaleb/.test(v.nombre)), bri = nuevos.find((v) => /Brihana/.test(v.nombre));
  af(() => kal.talla_playera === 'L' && bri.talla_playera === 'XS', 'tallas en mayúsculas de la lista');
  af(() => kal.num_emergencia === '9568200852' && kal.celular === '8148061376' && bri.celular === '7821953184', 'celular y emergencia a dígitos');
  af(() => kal.genero === 'H' && bri.genero === 'M', 'género por acompañante');
  af(() => nuevos.every((v) => v.correo === 'karina@x.com'), 'correo vacío → el del titular');
  af(() => CORREOS.length === 0, 'mismo correo que el titular → cero invitaciones nuevas');
  af(() => nuevos.every((v) => v.portal_revisado_at && v.grupo_viaje === V(K).grupo_viaje && v.zona_boleto === 'Preventa a ciegas'), 'sellados (titular sellado), mismo grupo, heredan la preventa');
  af(() => /desde Capsule \(Ximena\)/.test(V(K).notas), 'la nota del titular dice quién repartió y desde dónde');
  af(() => abonosDe(kal.id)[0].capturado_por === 'bulma@x', 'el abono de su parte lo firma quien capturó');
  af(() => LOG.every((l) => l.m !== 'DELETE'), 'cero DELETEs');
  r = await kh({ accion: 'viajero_repartir', id: K, acompanantes: [{ nombre: 'Otra Vez' }] });
  af(() => r.status === 400 && !DB.viajeros_evento.some((v) => v.nombre === 'Otra Vez'), '2º clic: ya es 1 lugar → rechazado y nada nace');

  console.log('[X] coordi no entra');
  ROL = 'coordinador'; semilla();
  r = await kh({ accion: 'viajero_repartir', id: K, acompanantes: [{ nombre: 'X y' }] });
  af(() => r.status === 403 && LOG.filter((l) => l.m !== 'GET').length === 0, () => 'coordinador → 403 sin escribir · ' + r.status);

  console.log('[P] un solo dueño');
  const pvSrc = fs.readFileSync(path.join(FN, 'portal-viajero.js'), 'utf8');
  af(() => /require\('\.\/_lib\/repartir-lugares'\)/.test(pvSrc) && !/abonado_previo=eq\./.test(pvSrc), 'portal-viajero delega en _lib/repartir-lugares (sin cuerpo propio)');
  const kjs = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  af(() => /accion: 'viajero_repartir'/.test(kjs) && /👥 Repartir/.test(kjs), 'Capsule tiene el botón y llama a la acción');

  console.log(`\n${rojos ? '🔴' : '✅'} mide:acomp-3 · ${verdes} en verde · ${rojos} en rojo`);
  process.exit(rojos ? 1 : 0);
})().catch((e) => { console.log('ARNÉS CAÍDO', e); process.exit(2); });
