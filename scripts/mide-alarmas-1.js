#!/usr/bin/env node
// =============================================================================
// mide:alarmas-1 — la logística del equipo en el Resumen (13-oct). Por el
// HANDLER REAL (`alarmas_operacion`), base falsa con filtros; el catálogo se
// sustituye en el require. SOLO LEE: la red falsa truena ante cualquier escritura.
// =============================================================================
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
const dia = (n) => new Date(Date.parse(hoy + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const ci = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/catalogo-index.js'));
require.cache[ci] = { id: ci, filename: ci, loaded: true, exports: { fetchEventosRaw: async () => [
  { id: 'soyluna', a: 'Soy Luna', ds: dia(5) },
  { id: 'omar', a: 'Omar Courtz', multifecha: [{ lbl: '6 Nov', ds: dia(20) }, { lbl: '7 Nov', ds: dia(21) }] },
  { id: 'viejo', a: 'Evento pasado', ds: dia(-3) },
] } };

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };
const A = 'aaaaaaaa-0000-4000-8000-00000000000';
const DB = {
  usuarios: [
    { id: A + '1', nombre: 'Rena', rol: 'coordinador', correo: 'rena@x.mx', talla_playera: 'XS' },
    { id: A + '2', nombre: 'Lau', rol: 'coordinador', correo: 'lau@x.mx', talla_playera: null },
    { id: A + '3', nombre: 'Sin Contrato', rol: 'coordinador', correo: 'sc@x.mx', talla_playera: 'M' },
  ],
  eventos_coordi: [
    { id: 'e1', evento_id: 'soyluna', coordi_id: A + '1', status: 'aceptado' },      // con boleto → nada
    { id: 'e2', evento_id: 'omar#0', coordi_id: A + '2', status: 'pendiente' },      // por aceptar + sin boleto + sin talla
    { id: 'e3', evento_id: 'soyluna', coordi_id: A + '3', status: 'aceptado' },      // sin contrato + sin boleto
    { id: 'e4', evento_id: 'viejo', coordi_id: A + '2', status: 'pendiente' },       // pasado → nada
    { id: 'e5', evento_id: 'soyluna', coordi_id: A + '2', status: 'declinado' },     // declinó → nada
  ],
  contratos_creadores: [
    { id: 'c1', creador_nombre: 'Rena', creador_email: 'rena@x.mx', plantilla: 'coordinador', estado: 'firmado', evento_fecha: dia(0), datos: {} },
    { id: 'c2', creador_nombre: 'Lau', creador_email: 'lau@x.mx', plantilla: 'coordinador', estado: 'firmado', evento_fecha: dia(0), datos: {} },
    { id: 'c3', creador_nombre: 'Crea Firmó', creador_email: 'cf@x.mx', plantilla: 'creadora', estado: 'firmado', evento_nombre: 'Soy Luna', evento_fecha: dia(5), datos: { talla: 'S' } },
    { id: 'c4', creador_nombre: 'Crea Dup', creador_email: 'cd@x.mx', plantilla: 'creadora', estado: 'pendiente', evento_nombre: 'Soy Luna', evento_fecha: dia(5), datos: {} },
    { id: 'c5', creador_nombre: 'Crea Dup', creador_email: 'cd@x.mx', plantilla: 'creadora', estado: 'pendiente', evento_nombre: 'Soy Luna', evento_fecha: dia(5), datos: {} },
    { id: 'c6', creador_nombre: 'Crea Lista', creador_email: 'cl@x.mx', plantilla: 'creadora', estado: 'firmado', evento_nombre: 'Soy Luna', evento_fecha: dia(5), datos: { talla: 'M', cortesia: { evento_id: 'soyluna' } } },
  ],
  viajeros_evento: [
    { id: 'v1', evento_id: 'soyluna', usuario_id: A + '1', nombre: 'Rena', zona_boleto: 'Platino', talla_playera: 'XS', tipo_viajero: 'coordinador' },
    { id: 'v3', evento_id: 'soyluna', usuario_id: A + '3', nombre: 'Sin Contrato', zona_boleto: null, talla_playera: 'M', tipo_viajero: 'coordinador' },
  ],
  requisiciones: [{ id: 'r1', estado: 'pendiente' }, { id: 'r2', estado: 'aprobada' }],
  cambios_viajero: [{ id: 'x1', estado: 'pendiente' }],
  salidas_bodega: [{ id: 's1', estado: 'solicitada' }, { id: 's2', estado: 'autorizada' }],
};
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
global.fetch = async (url, init) => {
  if (((init || {}).method || 'GET').toUpperCase() !== 'GET') throw new Error('ESCRITURA en un endpoint que solo lee');
  const u = new URL(url); const t = u.pathname.replace('/rest/v1/', ''); const T = DB[t];
  if (!T) throw new Error('tabla no modelada ' + t);
  return resp(200, T.filter((r) => { for (const [k, v] of u.searchParams.entries()) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    const val = r[k] == null ? null : String(r[k]);
    if (v === 'not.is.null') { if (val === null) return false; continue; }
    if (v.startsWith('neq.')) { if (val === v.slice(4)) return false; continue; }
    if (v.startsWith('eq.')) { if (val !== v.slice(3)) return false; continue; }
    throw new Error('filtro ' + k + '=' + v);
  } return true; }));
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const pedir = (rol) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jwtSign({ id: 'u', rol, correo: 'x@x.mx' }, process.env.JWT_SECRET, 3600) }, body: JSON.stringify({ accion: 'alarmas_operacion' }) });

(async () => {
  console.log('══ mide:alarmas-1 ══');
  const r = await pedir('maestro_roshi'); const j = JSON.parse(r.body);
  const de = (p, t) => (j.alarmas || []).filter((a) => a.persona === p && (!t || a.tipo === t));
  af(r.statusCode === 200, `[0] 200 (${r.statusCode}) ${r.statusCode !== 200 ? r.body : ''}`);
  af(de('Rena').length === 0, `[A] coordi aceptada con boleto, talla y contrato → ninguna alarma (${de('Rena').length})`);
  af(de('Lau', 'por_aceptar').length === 1 && de('Lau', 'por_aceptar')[0].evento === 'Omar Courtz · 6 Nov', '[B1] pendiente de aceptar, con el nombre de SU fecha');
  af(de('Lau', 'sin_boleto').length === 1 && de('Lau', 'sin_talla').length === 1, '[B2] sin boleto y sin talla');
  af(de('Lau').every((a) => a.evento_id !== 'viejo' && a.evento_id !== 'soyluna'), '[B3] el tour pasado y el declinado NO alarman');
  af(de('Sin Contrato', 'sin_contrato').length === 1 && de('Sin Contrato', 'sin_contrato')[0].nivel === 'rojo', '[C1] asignada sin contrato firmado → ROJO');
  af(de('Sin Contrato', 'sin_boleto')[0] && de('Sin Contrato', 'sin_boleto')[0].nivel === 'rojo', '[C2] sin boleto a 5 días → rojo');
  af(de('Crea Firmó', 'creadora_sin_boleto').length === 1, '[D1] creadora firmó sin cortesía → alarma');
  af(de('Crea Dup', 'creadora_sin_firma').length === 1, `[D2] contrato reenviado (2 filas) → UNA alarma (${de('Crea Dup').length})`);
  af(de('Crea Lista').length === 0, '[D3] creadora con cortesía y talla → nada');
  af(j.bandejas && j.bandejas.requisiciones === 1 && j.bandejas.cambios === 1 && j.bandejas.salidas === 1, `[E] bandejas: ${JSON.stringify(j.bandejas)}`);
  af(j.alarmas[0].nivel === 'rojo', '[F] las rojas van primero');
  const rc = await pedir('coordinador');
  af(rc.statusCode === 403, `[G] un coordi NO ve las alarmas (${rc.statusCode})`);
  console.log(`\n${R ? '🔴' : '🟢'} ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(2); });
