#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// mide:rol-avisos-1 — recordatorios en las fechas del ROL FIJO + la bandeja
// «🗓 Fijar rol» (ROL-AVISOS-1, 4-nov-2026). Sin ancla: carga del árbol.
//   [A] qué aviso le toca a quién y QUÉ DÍA (Sahid: 9-nov abre · 16-nov vence ·
//       17-nov vencido si no pagó · nada si pagó · y control: un día cualquiera nada)
//   [B] la bandeja: sellados, sin plan, con saldo y evento por venir (y nadie más)
//   [C] la corrida con red falsa: seco no escribe · real aparta → manda → sella ·
//       2ª corrida no repite · correo caído libera · bitácora caída NO manda
//   [D] un buzón con dos viajes recibe UN correo · el correo dice montos y fechas
//   [E] el cron nace APAGADO y apagado no lee nada · las acciones están en ACCIONES
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const LIB = path.join(RAIZ, 'netlify/functions/_lib/rol-avisos.js');
const RA = require(LIB);
const PF = require(path.join(RAIZ, 'netlify/functions/_lib/plan-fijo.js'));

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = typeof c === 'function' ? !!c() : !!c; } catch (_) { ok = false; }
  const msg = typeof m === 'function' ? (() => { try { return m(); } catch (e) { return '(msg) ' + e.message; } })() : m;
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } };
const dia = (s) => new Date(s + 'T18:00:00Z');

const plan = PF.armarPlanFijo({ separo_fecha: '2026-10-29', separo_monto: 300, total: 4200, paquete: 'stay', ds: '2027-01-11' });
const SAHID = { id: '11111111-1111-1111-1111-111111111111', nombre: 'Sahid Prueba', correo: 'Sahid@Correo.com', evento_id: 'fuerzaregida#0',
  tipo_paquete: 'stay', boletos: 1, total_contrato: 4200, abonado_previo: 300, portal_revisado_at: '2026-10-29T00:00:00Z', plan_pagos: plan };
const AMIGA = Object.assign({}, SAHID, { id: '22222222-2222-2222-2222-222222222222', nombre: 'Amiga Prueba', correo: 'sahid@correo.com' });
const EV = [{ id: 'fuerzaregida', a: 'Fuerza Regida', ds: '2027-01-11', multifecha: [{ ds: '2027-01-11', f: '11 Enero' }] }];

console.log('[A] el aviso cae en SU fecha');
const av = (d, filas, ab) => RA.avisosDeHoy(filas || [SAHID], ab || {}, dia(d));
af(() => av('2026-11-09').length === 1 && av('2026-11-09')[0].tipo === 'apertura' && av('2026-11-09')[0].cuota.n === 1, 'el 9-nov abre su pago 1 → apertura');
af(() => av('2026-11-16')[0].tipo === 'vence_hoy', 'el 16-nov es su último día → vence_hoy');
af(() => av('2026-11-17')[0].tipo === 'vencido' && av('2026-11-17')[0].cuota.falta === 975, 'el 17-nov no pagó → vencido $975');
af(() => av('2026-11-17', [SAHID], { [SAHID.id]: [{ monto: 975, fecha: '2026-11-12' }] }).length === 0, 'si pagó su $975, el 17-nov no le llega nada');
af(() => av('2026-11-12').length === 0, 'CONTROL: un día sin fecha de su rol no manda nada');
af(() => av('2026-11-18').length === 0, 'el vencido sale UNA vez (el día siguiente), no todos los días');
af(() => av('2026-11-09', [Object.assign({}, SAHID, { portal_revisado_at: null })]).length === 0, 'sin publicar en el Portal no le llega nada');
af(() => av('2026-11-09', [Object.assign({}, SAHID, { usuario_id: 'x' })]).length === 0, 'del equipo no le llega nada');
af(() => av('2026-11-09', [Object.assign({}, SAHID, { correo: 'mal..correo@x.com' })]).length === 0, 'correo inválido no recibe');

console.log('[B] la bandeja «🗓 Fijar rol»');
const MIG = { id: '33333333-3333-3333-3333-333333333333', nombre: 'Migrado Viejo', correo: 'm@x.com', evento_id: 'fuerzaregida#0', tipo_paquete: 'plus',
  total_contrato: 6500, abonado_previo: 500, portal_revisado_at: '2026-10-01T00:00:00Z', plan_pagos: null };
const pd = RA.pendientesDeFijar([MIG, SAHID, Object.assign({}, MIG, { id: '4', portal_revisado_at: null }), Object.assign({}, MIG, { id: '5', abonado_previo: 6500 }),
  Object.assign({}, MIG, { id: '6', evento_id: 'pasado' }), Object.assign({}, MIG, { id: '7', tipo_viajero: 'coordinador' })],
  { [MIG.id]: [{ monto: 200, fecha: '2026-09-20' }] }, EV.concat([{ id: 'pasado', a: 'Pasado', ds: '2026-10-01' }]), dia('2026-11-04'));
af(pd.lista.length === 1 && pd.lista[0].viajero_id === MIG.id, () => 'solo el migrado publicado, sin plan, con saldo, evento por venir y no del equipo (' + pd.lista.length + ')');
af(pd.lista[0].sugerido && pd.lista[0].sugerido.fecha === '2026-09-20' && pd.lista[0].resta === 5800, 'trae su sugerido (primer abono) y lo que falta');

console.log('[C] la corrida con red falsa');
function red(o) {
  o = o || {};
  const st = { bit: [], escr: 0, mails: 0 };
  const fetch = async (url, init) => {
    init = init || {}; const m = (init.method || 'GET').toUpperCase();
    const res = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
    if (/viajeros_evento/.test(url)) return res(200, o.filas || [SAHID]);
    if (/abonos_viajero/.test(url)) return res(200, []);
    if (/rol_avisos/.test(url)) {
      if (m !== 'GET') st.escr++;
      if (o.bitCaida && (o.bitCaida === true || (init.body && JSON.parse(init.body).viajero_id === o.bitCaida))) return res(500, { message: 'relation does not exist' });
      if (m === 'POST') { const b = JSON.parse(init.body);
        if (st.bit.some((x) => x.viajero_id === b.viajero_id && x.cuota_n === b.cuota_n && x.tipo === b.tipo)) return res(409, { code: '23505' });
        const f = Object.assign({ id: 'b' + st.bit.length }, b); st.bit.push(f); return res(201, [f]); }
      if (m === 'DELETE') { const id = url.split('id=eq.')[1]; st.bit = st.bit.filter((x) => x.id !== id); return res(204, null); }
      if (m === 'PATCH') { const id = url.split('id=eq.')[1]; const f = st.bit.find((x) => x.id === id); if (f) Object.assign(f, JSON.parse(init.body)); return res(204, null); }
    }
    throw new Error('red falsa no entiende ' + url);
  };
  return { st, fetch };
}
async function corre(o, args) {
  const n = red(o); global.fetch = n.fetch;
  const env = async () => { n.st.mails++; return o.mailCaido ? { ok: false } : { ok: true, id: 'em' + n.st.mails }; };
  const r = await RA.correrAvisos(Object.assign({ url: 'https://kh', headers: {}, EV, ahora: dia('2026-11-09'), seco: true, enviar: env }, args || {}));
  return { r, st: n.st, n };
}
(async () => {
  const s1 = await corre({});
  af(s1.r.seco && s1.r.avisos === 1 && s1.st.escr === 0 && s1.st.mails === 0 && /Es momento de tu abono/.test(s1.r.muestra[0].asunto), () => 'seco: 1 aviso, CERO escrituras y CERO correos · «' + s1.r.muestra[0].asunto + '»');
  const n = red({}); global.fetch = n.fetch; let mails = 0;
  const env = async () => { mails++; return { ok: true, id: 'em' + mails }; };
  const r1 = await RA.correrAvisos({ url: 'https://kh', headers: {}, EV, ahora: dia('2026-11-09'), seco: false, enviar: env });
  af(r1.enviados === 1 && mails === 1 && n.st.bit.length === 1 && n.st.bit[0].email_id === 'em1' && n.st.bit[0].correo === 'sahid@correo.com', 'real: aparta → manda → sella el email_id (correo en minúsculas)');
  const r2 = await RA.correrAvisos({ url: 'https://kh', headers: {}, EV, ahora: dia('2026-11-09'), seco: false, enviar: env });
  af(r2.enviados === 0 && r2.duplicados === 1 && mails === 1, '2ª corrida el mismo día (doble disparo) NO repite el correo');
  const c = await corre({ mailCaido: true }, { seco: false });
  af(c.r.fallidos === 1 && c.st.bit.length === 0, 'correo caído → la bitácora se LIBERA (el reintento sale limpio)');
  const b = await corre({ bitCaida: true }, { seco: false });
  af(b.r.sin_bitacora === 1 && b.st.mails === 0, '🔒 bitácora caída → NO se manda (un cron sin memoria repetiría el correo)');
  const bp = await corre({ filas: [SAHID, AMIGA], bitCaida: AMIGA.id }, { seco: false });
  af(bp.r.sin_bitacora === 1 && bp.st.mails === 0 && bp.st.bit.length === 0, () => '🔒 bitácora caída a MEDIAS (un viaje sí se apartó, el otro no) → NO se manda y lo apartado se libera (mails ' + bp.st.mails + ', bit ' + bp.st.bit.length + ')');

  console.log('[D] un buzón, un correo');
  const g = await corre({ filas: [SAHID, AMIGA] });
  af(g.r.avisos === 2 && g.r.correos === 1 && g.r.muestra[0].viajes.length === 2, 'dos viajes con el mismo correo → UN correo con los dos');
  const h = g.r.muestra[0].html;
  af(/\$975/.test(h) && /16 nov/.test(h) && /Fuerza Regida/.test(h) && /fijas desde tu separo/.test(h) && /conectareynosa\.mx\/portal/.test(h), 'el correo dice el monto, hasta cuándo, el evento, que es fijo y el Portal');
  af(/Cuenta para tu depósito/.test(h), 'trae la caja de la cuenta de su paquete (el dueño del Portal decide el banco)');

  console.log('[E] el cableo');
  const sc = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  delete process.env.ROL_AVISOS_ARNES; delete require.cache[LIB];
  af(require(LIB).ROL_AVISOS_VIVO === false, 'el interruptor nace APAGADO (encender = palabra de Memo)');
  let leyo = 0; global.fetch = async () => { leyo++; throw new Error('no debía leer'); };
  delete require.cache[path.join(RAIZ, 'netlify/functions/rol-fijo-recordatorios-diario.js')];
  const cron = require(path.join(RAIZ, 'netlify/functions/rol-fijo-recordatorios-diario.js'));
  const cr = await cron.handler();
  af(JSON.parse(cr.body).apagado === true && leyo === 0, 'apagado el cron no lee ni manda nada');
  af(/rol-fijo-recordatorios-diario[\s\S]{0,40}schedule/.test(fs.readFileSync(path.join(RAIZ, 'netlify.toml'), 'utf8')), 'el cron está en netlify.toml');
  const coordi = sc('netlify/functions/admin-coordi-asignaciones.js');
  af(/plan_pendientes: ROLES_EDITA_VIAJERO/.test(coordi) && /rol_avisos_ensayo: ROLES_EDITA_VIAJERO/.test(coordi), 'plan_pendientes y rol_avisos_ensayo están en ACCIONES');
  const ens = coordi.slice(coordi.indexOf("accion === 'rol_avisos_ensayo'"), coordi.indexOf("accion === 'rol_avisos_ensayo'") + 1200);
  af(/seco: true/.test(ens) && !/enviar:/.test(ens), 'el ensayo corre SIEMPRE en seco (no recibe con qué mandar)');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(/kamehouse-rol-fijar\.js/.test(html) && /loadRolPendientes/.test(sc('kamehouse-portal-revision.js')), 'la tarjeta vive en la bandeja de Requisiciones');
  const sql = fs.readFileSync(path.join(RAIZ, 'migraciones/ROL-AVISOS-1.sql'), 'utf8');
  af(/unique \(viajero_id, cuota_n, tipo\)/.test(sql) && /grant select, insert, update, delete on public\.rol_avisos to service_role/.test(sql), 'la bitácora: UNIQUE por cuota y tipo + GRANT a service_role');

  console.log('\n' + (V === 0 ? 'NADA MEDIDO · esto NO es un verde' : (R ? '🔴 ROJO' : '✅ VERDE')) + ' · ' + V + ' en verde, ' + R + ' en rojo');
  process.exit(R || !V ? 1 : 0);
})();
