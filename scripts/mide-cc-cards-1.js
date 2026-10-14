#!/usr/bin/env node
// =============================================================================
// mide:cc-cards-1 — el resumen que pinta las tarjetas de Capsule (13-oct).
// Handler REAL (`capsule_resumen`), base falsa con filtros. SOLO LEE.
// =============================================================================
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };
const U1 = 'aaaaaaaa-0000-4000-8000-000000000001', U2 = 'aaaaaaaa-0000-4000-8000-000000000002', U3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const DB = {
  viajeros_evento: [
    { evento_id: 'soyluna', tipo_viajero: 'cliente', tipo_paquete: 'PLUS', zona_boleto: 'VIP', boletos: 1 },
    { evento_id: 'soyluna', tipo_viajero: null, tipo_paquete: 'CHEAP', zona_boleto: 'VIP', boletos: 2 },
    { evento_id: 'soyluna', tipo_viajero: 'cliente', tipo_paquete: 'PLUS', zona_boleto: null, boletos: 0 },   // baja
    { evento_id: 'soyluna', tipo_viajero: 'coordinador', tipo_paquete: 'PLUS', zona_boleto: 'Platino', boletos: 1, usuario_id: U1 },
    { evento_id: 'soyluna', tipo_viajero: 'creadora', tipo_paquete: 'CHEAP', zona_boleto: 'VIP', boletos: 1 },
    { evento_id: 'omar#0', tipo_viajero: 'cliente', tipo_paquete: 'RIDE', zona_boleto: null, boletos: 1 },
  ],
  eventos_coordi: [
    { evento_id: 'soyluna', coordi_id: U1, status: 'aceptado' },
    { evento_id: 'soyluna', coordi_id: U2, status: 'pendiente' },
    { evento_id: 'soyluna', coordi_id: U3, status: 'declinado' },
    { evento_id: 'karolg', coordi_id: U2, status: 'aceptado' },
  ],
  usuarios: [{ id: U1, nombre: 'Renata Itzel', rol: 'coordinador' }, { id: U2, nombre: 'Reginna V', rol: 'coordinador' }, { id: U3, nombre: 'Declinó', rol: 'coordinador' }],
  contratos_creadores: [
    { id: 'c1', creador_nombre: 'Marietta', creador_email: 'm@x', estado: 'firmado', evento_nombre: 'Soy Luna', evento_fecha: '2026-10-21', plantilla: 'creadora', datos: { cortesia: { evento_id: 'soyluna', zona: 'VIP', boletos: 2, acompanante: 'Alanna' } } },
    { id: 'c2', creador_nombre: 'Day', creador_email: 'd@x', estado: 'firmado', evento_nombre: 'Alfredo Olivas', evento_fecha: '2026-10-15', plantilla: 'creadora', datos: { acompanante: { nombre: 'Dilan' } } },
    { id: 'c3', creador_nombre: 'Day', creador_email: 'd@x', estado: 'pendiente', evento_nombre: 'Alfredo Olivas', evento_fecha: '2026-10-15', plantilla: 'creadora', datos: {} },
  ],
};
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
global.fetch = async (url, init) => {
  if (((init || {}).method || 'GET').toUpperCase() !== 'GET') throw new Error('ESCRITURA en un endpoint que solo lee');
  const u = new URL(url); const t = u.pathname.replace('/rest/v1/', ''); const T = DB[t]; if (!T) throw new Error('tabla ' + t);
  return resp(200, T.filter((r) => { for (const [k, v] of u.searchParams.entries()) { if (['select', 'order', 'limit'].includes(k)) continue;
    if (v.startsWith('eq.')) { if (String(r[k]) !== v.slice(3)) return false; continue; } throw new Error('filtro ' + k); } return true; }));
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const pedir = (rol) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jwtSign({ id: 'u', rol, correo: 'x@x.mx' }, process.env.JWT_SECRET, 3600) }, body: JSON.stringify({ accion: 'capsule_resumen' }) });
(async () => {
  console.log('══ mide:cc-cards-1 ══');
  const r = await pedir('bulma'); const j = JSON.parse(r.body); const sl = (j.tours || {}).soyluna || {};
  af(r.statusCode === 200, `[0] 200 (${r.statusCode}) ${r.statusCode !== 200 ? r.body : ''}`);
  af(sl.viajeros === 3, `[A1] viajeros = clientes con sus boletos (1+2), sin bajas ni staff (${sl.viajeros})`);
  af(sl.por_paquete && sl.por_paquete.PLUS === 1 && sl.por_paquete.CHEAP === 2, `[A2] por paquete ${JSON.stringify(sl.por_paquete)}`);
  const ren = (sl.equipo || []).find((p) => p.nombre === 'Renata Itzel'); const reg = (sl.equipo || []).find((p) => p.nombre === 'Reginna V');
  af(ren && ren.boleto === 'Platino' && ren.status === 'aceptado', '[B1] coordi aceptada con su boleto');
  af(reg && reg.status === 'pendiente' && reg.boleto === null, '[B2] coordi pendiente, sin boleto');
  af(!(sl.equipo || []).some((p) => p.nombre === 'Declinó'), '[B3] la que declinó no sale');
  af(((j.tours || {}).karolg || {}).equipo[0].base === true, '[B4] asignación al evento base marcada base (la tarjeta la reparte a sus fechas)');
  af((sl.creadoras || []).length === 1 && sl.creadoras[0].acompanante === 'Alanna' && sl.creadoras[0].cortesia.zona === 'VIP', '[C1] creadora con cortesía cuelga de SU tour, con acompañante');
  const day = (j.creadoras_por_fecha || []).filter((c) => c.nombre === 'Day');
  af(day.length === 1 && day[0].firmado === true && day[0].acompanante === 'Dilan', `[C2] creadora firmada sin cortesía va por fecha, UNA vez (gana la firmada) (${day.length})`);
  af(((j.tours || {})['omar#0'] || {}).viajeros === 1, '[D] la fecha de un multifecha se cuenta en su llave');
  const rc = await pedir('coordinador');
  af(rc.statusCode === 403, `[E] un coordi no lo ve (${rc.statusCode})`);
  console.log(`\n${R ? '🔴' : '🟢'} ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(2); });
