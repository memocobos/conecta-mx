#!/usr/bin/env node
// =============================================================================
// mide-prueba-archivo-1 — PRUEBA-ARCHIVO-1 (13-oct-2026): «🗑 Era prueba».
// Entra por el handler REAL (admin-requisiciones, acción archivar_prueba) con
// una base falsa que respeta filtros (eq / like / in) y guarda estado. Mide:
//   · solo maestro_roshi (Bulma → 403) y pide confirmar:true;
//   · COPIA al archivo ANTES de quitar (y si copiar falla, no quita nada);
//   · aprobada → se van la requisición, SUS viajeros y SUS abonos; un viajero
//     ajeno del mismo evento queda intacto;
//   · si la persona tiene un pago capturado APARTE → 409 y nada se mueve.
// Sin ancla de commit a propósito (carga del árbol de trabajo).
// =============================================================================
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };

const REQ = 'aaaaaaaa-0000-4000-8000-000000000001';
const VT = 'bbbbbbbb-0000-4000-8000-000000000001';
const VA = 'bbbbbbbb-0000-4000-8000-000000000002';
const VX = 'bbbbbbbb-0000-4000-8000-000000000099';
function base(o) {
  o = o || {};
  return {
    requisiciones: [{ id: REQ, folio: 'R-TEST1', evento_id: 'palnorte', estado: o.estado || 'aprobada', nombre: 'Ximena Prueba', viajero_id: VT }],
    viajeros_evento: [
      { id: VT, evento_id: 'palnorte', nombre: 'Ximena Prueba', notas: 'Requisición R-TEST1 · transferencia' },
      { id: VA, evento_id: 'palnorte', nombre: 'Acompa Prueba', notas: 'Requisición R-TEST1 · transferencia · acompañante de Ximena' },
      { id: VX, evento_id: 'palnorte', nombre: 'Cliente Real', notas: 'Requisición R-OTRA1 · transferencia' },
    ],
    abonos_viajero: [
      { id: 'c1', viajero_id: VT, monto: 300, nota: 'Requisición R-TEST1 · comprobante' },
      { id: 'c2', viajero_id: VA, monto: 300, nota: 'Requisición R-TEST1 · comprobante' },
      { id: 'c9', viajero_id: VX, monto: 300, nota: 'Requisición R-OTRA1 · comprobante' },
    ].concat(o.abonoAjeno ? [{ id: 'c3', viajero_id: VT, monto: 500, nota: 'abono capturado a mano' }] : []),
    pruebas_archivo_requisiciones: [], pruebas_archivo_viajeros: [], pruebas_archivo_abonos: [],
    log: [], falla: o.falla || null,
  };
}
let DB;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
const casa = (row, sp) => { for (const [k, v] of sp) {
  if (['select', 'order', 'limit'].includes(k)) continue;
  const val = String(row[k] == null ? '' : row[k]);
  if (v.startsWith('eq.')) { if (val !== v.slice(3)) return false; continue; }
  if (v.startsWith('like.')) { if (!val.startsWith(v.slice(5).replace(/\*$/, ''))) return false; continue; }
  if (v.startsWith('in.(')) { if (!v.slice(4, -1).split(',').includes(val)) return false; continue; }
  throw new Error('filtro no modelado ' + k + '=' + v);
} return true; };
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase();
  const u = new URL(url);
  if (!u.pathname.startsWith('/rest/v1/')) throw new Error('red no modelada ' + url);
  const t = u.pathname.replace('/rest/v1/', '');
  DB.log.push(m + ' ' + t);
  if (DB.falla === m + ' ' + t) return resp(500, { error: 'falla sembrada' });
  const sp = [...u.searchParams.entries()];
  const T = DB[t]; if (!T) throw new Error('tabla ' + t);
  if (m === 'GET') return resp(200, T.filter((r) => casa(r, sp)).map((r) => Object.assign({}, r)));
  if (m === 'POST') { [].concat(JSON.parse(init.body)).forEach((f) => T.push(f)); return resp(201, []); }
  if (m === 'DELETE') { const fuera = T.filter((r) => casa(r, sp)); DB[t] = T.filter((r) => !casa(r, sp)); return resp(200, fuera); }
  throw new Error('método ' + m);
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
// el portero vivo pregunta a usuarios: se responde activo
const va = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const tok = (rol) => jwtSign({ id: 'u-' + rol, rol, correo: rol + '@x.mx', nombre: rol }, process.env.JWT_SECRET, 3600);
const ev = (b, t) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + t }, body: JSON.stringify(b) });

(async () => {
  console.log('══ mide:prueba-archivo-1 · «🗑 Era prueba» ══');
  const _f = global.fetch;
  global.fetch = async (url, init) => (String(url).includes('/rest/v1/usuarios') ? resp(200, [{ id: 'u', activo: true, rol: String(url).includes('bulma') ? 'bulma' : 'maestro_roshi' }]) : _f(url, init));
  DB = base();
  let r = await H(ev({ accion: 'archivar_prueba', id: REQ, confirmar: true }, tok('bulma')));
  af(r.statusCode === 403 && DB.requisiciones.length === 1, `[A1] Bulma no puede (403) y nada se mueve (${r.statusCode})`);
  r = await H(ev({ accion: 'archivar_prueba', id: REQ }, tok('maestro_roshi')));
  af(r.statusCode === 400 && DB.requisiciones.length === 1, '[A2] sin confirmar:true → 400');
  r = await H(ev({ accion: 'archivar_prueba', id: REQ, confirmar: true, motivo: 'prueba de Ximena' }, tok('maestro_roshi')));
  const j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.viajeros === 2 && j.abonos === 2, `[A3] aprobada → se van 2 viajeros y 2 abonos (${r.statusCode} ${r.body.slice(0, 120)})`);
  af(DB.requisiciones.length === 0 && DB.viajeros_evento.length === 1 && DB.viajeros_evento[0].id === VX && DB.abonos_viajero.length === 1 && DB.abonos_viajero[0].id === 'c9', '[A4] el cliente REAL del mismo evento queda intacto con su pago');
  af(DB.pruebas_archivo_requisiciones.length === 1 && DB.pruebas_archivo_viajeros.length === 2 && DB.pruebas_archivo_abonos.length === 2 && DB.pruebas_archivo_requisiciones[0].motivo_archivo === 'prueba de Ximena', '[A5] todo quedó COPIADO al archivo con su motivo');
  const iCopia = DB.log.findIndex((l) => l.startsWith('POST pruebas_archivo')), iBorra = DB.log.findIndex((l) => l.startsWith('DELETE'));
  af(iCopia > -1 && iBorra > iCopia, '[A6] se copia ANTES de quitar');
  DB = base({ abonoAjeno: true });
  r = await H(ev({ accion: 'archivar_prueba', id: REQ, confirmar: true }, tok('maestro_roshi')));
  af(r.statusCode === 409 && DB.requisiciones.length === 1 && DB.abonos_viajero.length === 4 && !DB.log.some((l) => l.startsWith('DELETE')), '[A7] con un pago capturado aparte → 409 y NADA se mueve');
  DB = base({ falla: 'POST pruebas_archivo_viajeros' });
  r = await H(ev({ accion: 'archivar_prueba', id: REQ, confirmar: true }, tok('maestro_roshi')));
  af(r.statusCode === 502 && DB.requisiciones.length === 1 && !DB.log.some((l) => l.startsWith('DELETE')), '[A8] si copiar al archivo falla → 502 y no se quita nada');
  DB = base({ estado: 'rechazada' });
  r = await H(ev({ accion: 'archivar_prueba', id: REQ, confirmar: true }, tok('maestro_roshi')));
  af(r.statusCode === 200 && DB.requisiciones.length === 0 && DB.viajeros_evento.length === 3 && DB.abonos_viajero.length === 3, '[A9] rechazada → solo se va la solicitud; viajeros y pagos ni se tocan');
  console.log(`\n${R === 0 ? (V ? '✅ VERDE' : '⚠️ NADA MEDIDO · esto NO es un verde') : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + e.stack); process.exit(1); });
