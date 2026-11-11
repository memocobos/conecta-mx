#!/usr/bin/env node
/* mide-preventa-auto-1 — PREVENTA-AUTO-1 (10-nov-2026)
 * Palabra de Memo: «si el paquete cuesta 5600 para todo mundo, para ella cuesta
 * 5300 y sus 300 de reserva cuentan como pago: ya solo debe $5000» + «le debe
 * de llegar un correo con ya hay paquetes».
 *   [D] el dueño del descuento: totalPreventa (lista − 300 por lugar, nunca ≤ 0)
 *   [E] «¡Ya hay paquetes!» por el handler REAL de la bandeja: seco por default,
 *       candado «el evento ya vende paquetes» (donomar en preventa → 409,
 *       nsqkmty a la venta → pasa), bitácora antes de mandar, nadie dos veces.
 *   [A] el anexo del contrato dice el beneficio nuevo.
 * El camino del Portal (aplicar solo) lo mide mide:preventa-portal-1.
 * ⚠️ SIN ANCLA (árbol de trabajo). */
'use strict';
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.JWT_SECRET = 'secreto-de-arnes'; process.env.RESEND_API_KEY = 're_falso'; process.env.CORREOS_MODO = 'real';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} const t = typeof m === 'function' ? m() : m; if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
let DB;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
const eq = (q, c) => { const m = q.match(new RegExp('[?&]' + c + '=eq\\.([^&]*)')); return m ? decodeURIComponent(m[1]) : null; };
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = String(url);
  if (u.includes('/index.html') || /conectareynosa\.mx\/?($|\?)/.test(u)) return resp(200, INDEX);
  if (u.includes('api.resend.com')) { DB.correos.push(JSON.parse(init.body)); return resp(200, { id: 'em_' + DB.correos.length }); }
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u-roshi', activo: true, rol: 'maestro_roshi' }]);
  if (u.includes('/rest/v1/viajeros_evento')) return resp(200, DB.v);
  if (u.includes('/rest/v1/portal_recordatorios')) {
    if (m === 'POST') { DB.bit.push(JSON.parse(init.body)); return resp(201, {}); }
    const c = eq(u, 'campana'); return resp(200, DB.bit.filter((b) => b.campana === c));
  }
  return resp(200, []);
};

(async () => {
  console.log('\n[D] el dueño del descuento');
  const OP = require(path.join(RAIZ, 'netlify/functions/_lib/opciones-paquete.js'));
  af(OP.PREVENTA_DESCUENTO === 300, 'PREVENTA_DESCUENTO = 300');
  af(OP.totalPreventa(5600, 1) === 5300, 'el ejemplo de Memo: lista 5600 → 5300 (y con sus 300 pagados debe 5000)');
  af(OP.totalPreventa(5600, 2) === 10600, '2 lugares: (5600 − 300) × 2');
  af(OP.totalPreventa(300, 1) === null && OP.totalPreventa(0, 1) === null, 'jamás un contrato en $0 o negativo');
  const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  af(/const KH_PREVENTA_DESCUENTO = 300;/.test(kh), 'el espejo de KameHouse dice lo mismo que el dueño');

  console.log('\n[E] «¡Ya hay paquetes!» por la bandeja');
  const HR = require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const tok = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'memo@x.mx', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
  const bandeja = async (b) => { const x = await HR({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(b) }); return { s: x.statusCode, j: JSON.parse(x.body) }; };
  DB = { correos: [], bit: [], v: [
    { id: U(1), evento_id: 'nsqkmty', nombre: 'Ana Pérez', correo: 'ana@correo.mx', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', portal_revisado_at: '2026-10-27T00:00:00Z' },
    { id: U(2), evento_id: 'nsqkmty', nombre: 'Sin Publicar', correo: 'sp@correo.mx', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', portal_revisado_at: null },
    { id: U(3), evento_id: 'donomar', nombre: 'Leslie', correo: 'leslie@correo.mx', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', portal_revisado_at: '2026-11-10T00:00:00Z' },
  ] };
  let r = await bandeja({ accion: 'preventa_costos_lista' });
  const nsq = (r.j.eventos || []).find((e) => e.evento_id === 'nsqkmty') || {};
  const don = (r.j.eventos || []).find((e) => e.evento_id === 'donomar') || {};
  af(r.s === 200 && nsq.con_paquetes === true && don.con_paquetes === false, () => 'lista: nsqkmty ya vende paquetes, donomar (aún en preventa en el index) no · ' + JSON.stringify(r.j).slice(0, 200));
  r = await bandeja({ accion: 'preventa_costos', evento_id: 'donomar', seco: false, confirmar: true });
  af(r.s === 409 && DB.correos.length === 0, () => 'control: sin paquetes reales NO se manda nada (409) · ' + r.s);
  r = await bandeja({ accion: 'preventa_costos', evento_id: 'nsqkmty' });
  af(r.s === 200 && r.j.seco && r.j.a_quien.length === 1 && r.j.a_quien[0].correo === 'ana@correo.mx' && DB.correos.length === 0, () => 'seco por default: enseña a quién (solo la publicada) y no manda · ' + JSON.stringify(r.j.a_quien));
  af(r.j.ejemplo && /ya hay paquetes/i.test(r.j.ejemplo.subject) && /\$300 de descuento/.test(r.j.ejemplo.html) && /conectareynosa\.mx\/portal/.test(r.j.ejemplo.html), 'el correo dice el descuento, que sus $300 cuentan y manda al Portal');
  af(!/\$\d{1,2},\d{3}/.test(r.j.ejemplo.html), 'el correo NO trae precios (viven en el Portal)');
  af((r.j.saltados || []).some((x) => /sin publicar/.test(x)), 'quien no está publicado en el Portal se nombra y no recibe');
  r = await bandeja({ accion: 'preventa_costos', evento_id: 'nsqkmty', seco: false });
  af(r.s === 400 && DB.correos.length === 0, 'mandar sin confirmar:true → 400 sin enviar');
  r = await bandeja({ accion: 'preventa_costos', evento_id: 'nsqkmty', seco: false, confirmar: true });
  af(r.s === 200 && DB.correos.length === 1 && DB.bit.length === 1 && DB.bit[0].campana === 'preventa-costos-nsqkmty' && DB.bit[0].email_id === 'em_1', () => 'manda UNO y lo asienta en la bitácora con su email_id · ' + JSON.stringify(r.j));
  r = await bandeja({ accion: 'preventa_costos', evento_id: 'nsqkmty', seco: false, confirmar: true });
  af(r.s === 200 && DB.correos.length === 1 && r.j.enviados.length === 0, '2º clic: nadie lo recibe dos veces');

  console.log('\n[A] el contrato dice el beneficio nuevo');
  const CC = require(path.join(RAIZ, 'netlify/functions/_lib/contrato-cliente.js'));
  const src = fs.readFileSync(path.join(RAIZ, 'netlify/functions/_lib/contrato-cliente.js'), 'utf8');
  af(/\$300 de descuento por lugar sobre el precio de lista/.test(src) && !/segunda persona en el mismo viaje/.test(src), 'anexo: $300 menos sobre SU paquete (fuera la «segunda persona»)');
  af(typeof CC.renderContratoHTML === 'function', 'el render del contrato sigue vivo');

  console.log('\n══ RESULTADO ══');
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ` · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('ARNÉS CAÍDO', e); process.exit(2); });
