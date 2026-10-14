#!/usr/bin/env node
// =============================================================================
// mide:coordi-lista-1 — la lista que baja un COORDI (palabra de Memo, 13-oct).
//
// Por el HANDLER REAL (`viajero_listar`) con una base falsa que respeta filtros:
//   [A] un coordi asignado recibe SOLO PLUS/STAY/RIDE (ningún CHEAP) y SOLO
//       las columnas permitidas (sin celular, correo, notas ni dinero);
//   [B] recibe `equipo`: coordis asignados con su estado y creadoras con
//       «viaja / no viaja»;
//   [C] la asignación al evento BASE abre la lista de una FECHA (`omar#1`);
//   [D] un coordi NO asignado → 403;
//   [E] control: un admin (roshi) sigue recibiendo todo, CHEAP y dinero.
// Sin ancla de commit a propósito: carga del árbol de trabajo.
// =============================================================================
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };

const COORDI = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTRA = 'aaaaaaaa-0000-4000-8000-000000000002';
const FUERA = 'aaaaaaaa-0000-4000-8000-000000000009';
const vj = (o) => Object.assign({ evento_id: 'soyluna', correo: 'x@x.mx', celular: '8990000000', notas: 'nota interna con $11,000', total_contrato: 5000, abonado_previo: 1000,
  talla_playera: 'M', num_emergencia: '8991112233', emergencia_nombre: 'Mamá', emergencia_parentesco: 'mamá', boletos: 1, grupo_viaje: null, usuario_id: null, tipo_viajero: null, creado_en: '2026-10-01' }, o);
const DB = {
  usuarios: [
    { id: COORDI, nombre: 'Coordi Uno', rol: 'coordinador', activo: true },
    { id: OTRA, nombre: 'Coordi Dos', rol: 'coordinador', activo: true },
    { id: FUERA, nombre: 'Coordi Fuera', rol: 'coordinador', activo: true },
    { id: 'u-roshi', nombre: 'Memo', rol: 'maestro_roshi', activo: true },
  ],
  eventos_coordi: [
    { id: 'e1', evento_id: 'soyluna', coordi_id: COORDI, status: 'aceptado' },
    { id: 'e2', evento_id: 'soyluna', coordi_id: OTRA, status: 'pendiente' },
    { id: 'e3', evento_id: 'omar', coordi_id: COORDI, status: 'aceptado' },
  ],
  viajeros_evento: [
    vj({ id: 'v1', nombre: 'Ana Plus', tipo_paquete: 'PLUS', zona_boleto: 'VIP' }),
    vj({ id: 'v2', nombre: 'Beto Cheap', tipo_paquete: 'CHEAP', zona_boleto: 'VIP' }),
    vj({ id: 'v3', nombre: 'Caro Stay', tipo_paquete: 'stay', zona_boleto: 'Platino' }),
    vj({ id: 'v4', nombre: 'Dani Ride', tipo_paquete: 'RIDE', zona_boleto: null }),
    vj({ id: 'v5', nombre: 'Coordi Uno', tipo_paquete: 'PLUS', tipo_viajero: 'coordinador', usuario_id: COORDI, zona_boleto: 'General' }),
    vj({ id: 'v6', nombre: 'Marietta', tipo_paquete: 'CHEAP', tipo_viajero: 'creadora', zona_boleto: 'VIP', total_contrato: 0, abonado_previo: 0 }),
    vj({ id: 'v7', evento_id: 'omar#1', nombre: 'Omar Plus', tipo_paquete: 'PLUS', zona_boleto: 'Pista' }),
    vj({ id: 'v8', nombre: 'Fabi Baja', tipo_paquete: 'PLUS', zona_boleto: null, boletos: 0 }),
  ],
};
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
let ULTIMO_SELECT = {};
const casa = (row, k, v) => {
  const val = String(row[k] == null ? '' : row[k]);
  if (v.startsWith('eq.')) return val === v.slice(3);
  if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(decodeURIComponent).includes(val);
  throw new Error('filtro no modelado ' + k + '=' + v);
};
global.fetch = async (url, init) => {
  const m = ((init || {}).method || 'GET').toUpperCase();
  if (m !== 'GET') throw new Error('ESCRITURA inesperada ' + m + ' ' + url);
  const u = new URL(url);
  const t = u.pathname.replace('/rest/v1/', '');
  const T = DB[t]; if (!T) throw new Error('tabla no modelada ' + t);
  const sel = u.searchParams.get('select');
  ULTIMO_SELECT[t] = sel;
  let rows = T.filter((r) => { for (const [k, v] of u.searchParams.entries()) { if (['select', 'order', 'limit'].includes(k)) continue; if (!casa(r, k, v)) return false; } return true; });
  if (sel && sel !== '*') {
    const cols = sel.split(',').map((c) => c.split(':'));
    rows = rows.map((r) => { const o = {}; cols.forEach(([a, b]) => { o[a] = r[b || a]; }); return o; });
  }
  return resp(200, rows);
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const pedir = (id, rol, evento_id) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jwtSign({ id, rol, correo: id + '@x.mx' }, process.env.JWT_SECRET, 3600) },
  body: JSON.stringify({ accion: 'viajero_listar', evento_id }) });

(async () => {
  console.log('══ mide:coordi-lista-1 · la lista del coordi ══');
  let r = await pedir(COORDI, 'coordinador', 'soyluna');
  let j = JSON.parse(r.body);
  const nombres = (j.viajeros || []).map((v) => v.nombre);
  af(r.statusCode === 200 && j.vista === 'coordi', `[A0] coordi asignado → 200 vista coordi (${r.statusCode}) ${r.statusCode !== 200 ? r.body : ''}`);
  af(nombres.length === 3 && ['Ana Plus', 'Caro Stay', 'Dani Ride'].every((n) => nombres.includes(n)), `[A1] solo PLUS/STAY/RIDE de clientes: ${JSON.stringify(nombres)}`);
  af(!nombres.includes('Beto Cheap') && !nombres.includes('Marietta'), '[A2] ningún CHEAP en la lista de viajeros');
  af(!nombres.includes('Fabi Baja'), '[A7] una BAJA (boletos 0, sin zona) no sale en la lista');
  const PROHIBIDAS = ['celular', 'correo', 'notas', 'total_contrato', 'abonado_previo', 'usuario_id', 'tipo_viajero'];
  const llaves = new Set((j.viajeros || []).flatMap((v) => Object.keys(v)));
  af(PROHIBIDAS.every((k) => !llaves.has(k)), `[A3] sin celular/correo/notas/dinero en la respuesta: ${[...llaves].join(',')}`);
  af(!/celular|correo|notas|total_contrato|abonado/.test(ULTIMO_SELECT.viajeros_evento || ''), `[A4] ni siquiera se le PIDEN a la base: ${ULTIMO_SELECT.viajeros_evento}`);
  af(JSON.stringify(j).indexOf('11,000') < 0 && JSON.stringify(j).indexOf('8990000000') < 0, '[A5] ni el monto de la nota ni el celular viajan en el cuerpo');
  const ana = (j.viajeros || []).find((v) => v.nombre === 'Ana Plus') || {};
  af(ana.zona_boleto === 'VIP' && ana.talla_playera === 'M' && ana.emergencia_nombre === 'Mamá' && ana.emergencia_parentesco === 'mamá' && ana.num_emergencia === '8991112233' && ana.tipo_paquete === 'PLUS',
    `[A6] lo permitido SÍ viaja: ${JSON.stringify(ana)}`);

  const eq = j.equipo || [];
  const uno = eq.find((p) => p.nombre === 'Coordi Uno'), dos = eq.find((p) => p.nombre === 'Coordi Dos'), mar = eq.find((p) => p.nombre === 'Marietta');
  af(uno && uno.asignacion === 'aceptado' && uno.viaja === true, `[B1] coordi asignado aceptado y viaja: ${JSON.stringify(uno)}`);
  af(dos && dos.asignacion === 'pendiente' && dos.viaja === null, `[B2] coordi pendiente sin fila → «por confirmar»: ${JSON.stringify(dos)}`);
  af(mar && mar.papel === 'Creadora de contenido' && mar.viaja === false, `[B3] creadora CHEAP → no viaja (solo concierto): ${JSON.stringify(mar)}`);
  af(eq.filter((p) => p.nombre === 'Coordi Uno').length === 1, '[B4] el coordi con asignación Y fila sale UNA vez');

  r = await pedir(COORDI, 'coordinador', 'omar#1');
  j = JSON.parse(r.body);
  af(r.statusCode === 200 && (j.viajeros || []).map((v) => v.nombre).join() === 'Omar Plus', `[C] asignación al evento base abre la fecha omar#1 (${r.statusCode})`);

  r = await pedir(FUERA, 'coordinador', 'soyluna');
  af(r.statusCode === 403, `[D] coordi NO asignado → 403 (${r.statusCode})`);

  r = await pedir('u-roshi', 'maestro_roshi', 'soyluna');
  j = JSON.parse(r.body);
  af(r.statusCode === 200 && !j.vista && (j.viajeros || []).some((v) => v.nombre === 'Beto Cheap') && (j.viajeros || []).some((v) => v.total_contrato != null),
    `[E] control: roshi sigue recibiendo todo (CHEAP y dinero)`);

  console.log(`\n${R ? '🔴' : '🟢'} ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(2); });
