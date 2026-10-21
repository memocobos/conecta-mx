#!/usr/bin/env node
// =============================================================================
// mide:staff-boleto-1 — el boleto de un coordi/staff en un tour (13-oct).
// Por el HANDLER REAL (`staff_boleto`), base falsa con filtros + valor esperado:
//   [A] sin lugar todavía → nace su fila de staff con la zona; NO toca
//       `vendidos_fuera` (STAFF-BOLETO-2: la fila ES el boleto)
//   [B] 2º clic con la misma zona → CERO escrituras
//   [C] cambiar de zona → la fila cambia, el inventario sigue intacto
//   [D] quitar ('') → la zona en NULL
//   [H] zona AGOTADA en Kamisama → 409 sin escribir · zona sin compras → 409
//   [E] zona que no es de la ficha → 400 y CERO escrituras
//   [F] persona no asignada → 409 · fila de cliente → 409
//   [G] la asignación al evento BASE sirve para una fecha (`omar#0`)
// Sin ancla de commit a propósito: carga del árbol de trabajo.
// =============================================================================
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.PORTAL_SUPABASE_URL = 'https://portal.falso.test';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'psvc';

// La puerta de zonas sin red: la ficha de mentira de Soy Luna.
const zf = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/zona-ficha.js'));
const ZONAS = ['VIP', 'Platino', 'Luneta', 'Plata'];
require.cache[zf] = { id: zf, filename: zf, loaded: true, exports: {
  puertaZona: async (ev, z) => {
    const c = ZONAS.find((x) => x.toLowerCase() === String(z).trim().toLowerCase());
    return c ? { estado: c === z ? 'exacta' : 'canonizada', zona: c, canonicas: ZONAS } : { estado: 'desconocida', zona: z, canonicas: ZONAS };
  },
  zonasCanonicasDe: () => ZONAS, resolverZonaFicha: () => ({}),
} };

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };
const C1 = 'cccccccc-0000-4000-8000-000000000001', C2 = 'cccccccc-0000-4000-8000-000000000002', C3 = 'cccccccc-0000-4000-8000-000000000003';
let DB, ESC = 0, SEQ = 0;
const base = () => ({
  usuarios: [{ id: C1, nombre: 'Coordi Uno', rol: 'coordinador', correo: 'c1@x.mx', talla_playera: 'M', activo: true },
             { id: C3, nombre: 'Coordi Tres', rol: 'coordinador', correo: 'c3@x.mx', activo: true },
             { id: 'u-roshi', nombre: 'Memo', rol: 'maestro_roshi', activo: true }],
  eventos_coordi: [{ id: 'a1', evento_id: 'soyluna', coordi_id: C1, status: 'aceptado' }, { id: 'a3', evento_id: 'omar', coordi_id: C3, status: 'pendiente' }],
  viajeros_evento: [{ id: 'cli', evento_id: 'soyluna', nombre: 'Cliente', usuario_id: C2, tipo_viajero: 'cliente', zona_boleto: 'VIP' }],
  stock_ajustes: [{ id: 's-pl', evento_id: 'soyluna', zona: 'Platino', vendidos_fuera: 7, nota: 'n' }, { id: 's-lu', evento_id: 'soyluna', zona: 'Luneta', vendidos_fuera: 1, nota: 'n' }],
  // Kamisama: Platino 10 (7 fuera → 3 libres) · Luneta 1 (1 fuera → AGOTADA) · VIP 5 · sin compras de Plata
  compras: [{ evento_id: 'soyluna', zona: 'Platino', cantidad: 10 }, { evento_id: 'soyluna', zona: 'Luneta', cantidad: 1 },
            { evento_id: 'soyluna', zona: 'VIP', cantidad: 5 }, { evento_id: 'omar#0', zona: 'VIP', cantidad: 5 }],
  solicitudes_tour: [],
});
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
const casa = (row, k, v) => {
  const val = row[k] == null ? null : String(row[k]);
  if (v === 'is.null') return val === null;
  if (v.startsWith('eq.')) return val === decodeURIComponent(v.slice(3));
  if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(decodeURIComponent).includes(val);
  throw new Error('filtro no modelado ' + k + '=' + v);
};
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase();
  const u = new URL(url); const t = u.pathname.replace('/rest/v1/', '');
  const T = DB[t]; if (!T) throw new Error('tabla no modelada ' + t);
  if (m === 'DELETE') throw new Error('DELETE prohibido');
  const sel = (r) => { for (const [k, v] of u.searchParams.entries()) { if (['select', 'order', 'limit'].includes(k)) continue; if (!casa(r, k, v)) return false; } return true; };
  if (m === 'GET') return resp(200, T.filter(sel).map((r) => ({ ...r })));
  ESC++;
  const b = JSON.parse(init.body);
  if (m === 'POST') { const f = Object.assign({ id: 'n' + (++SEQ) }, b); T.push(f); return resp(201, [f]); }
  if (m === 'PATCH') { const fs = T.filter(sel); fs.forEach((r) => Object.assign(r, b)); return resp(200, fs); }
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const tok = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'memo@x.mx' }, process.env.JWT_SECRET, 3600);
const pedir = async (b) => { const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(Object.assign({ accion: 'staff_boleto' }, b)) }); return { s: r.statusCode, j: JSON.parse(r.body) }; };
const st = (z, ev = 'soyluna') => { const f = DB.stock_ajustes.find((x) => x.evento_id === ev && x.zona === z); return f ? f.vendidos_fuera : 0; };
const filaDe = (c, ev = 'soyluna') => DB.viajeros_evento.find((v) => v.usuario_id === c && v.evento_id === ev);

(async () => {
  console.log('══ mide:staff-boleto-1 ══');
  DB = base();
  let r = await pedir({ evento_id: 'soyluna', coordi_id: C1, zona: 'platino' });
  af(r.s === 200 && filaDe(C1) && filaDe(C1).zona_boleto === 'Platino' && filaDe(C1).tipo_viajero === 'coordinador' && filaDe(C1).talla_playera === 'M', `[A1] nace su fila de staff con la zona canónica (${r.s}) ${JSON.stringify(r.j)}`);
  af(st('Platino') === 7, `[A2] vendidos_fuera de Platino NO se toca (${st('Platino')})`);
  ESC = 0; r = await pedir({ evento_id: 'soyluna', coordi_id: C1, zona: 'Platino' });
  af(r.j.ya === true && ESC === 0, `[B] 2º clic misma zona → 0 escrituras (${ESC})`);
  ESC = 0; r = await pedir({ evento_id: 'soyluna', coordi_id: C1, zona: 'Luneta' });
  af(r.s === 409 && r.j.agotada === true && ESC === 0 && filaDe(C1).zona_boleto === 'Platino', `[H1] Luneta AGOTADA en Kamisama → 409 sin escribir (${r.s}) ${r.j.error || ''}`);
  ESC = 0; r = await pedir({ evento_id: 'soyluna', coordi_id: C1, zona: 'Plata' });
  af(r.s === 409 && r.j.sin_stock === true && ESC === 0, `[H2] Plata sin compras cargadas → 409 (${r.s})`);
  r = await pedir({ evento_id: 'soyluna', coordi_id: C1, zona: 'VIP' });
  af(r.s === 200 && filaDe(C1).zona_boleto === 'VIP' && st('Platino') === 7, `[C] cambio a VIP: la fila cambia, el inventario guardado no (${r.s})`);
  r = await pedir({ evento_id: 'soyluna', coordi_id: C1, zona: '' });
  af(r.s === 200 && filaDe(C1).zona_boleto === null, `[D] quitar: zona null (${r.s})`);
  ESC = 0; r = await pedir({ evento_id: 'soyluna', coordi_id: C1, zona: 'Balcón X' });
  af(r.s === 400 && ESC === 0 && /Zonas: VIP/.test(r.j.error), `[E] zona inventada → 400 nombrando las zonas, 0 escrituras (${r.s}, ${ESC})`);
  ESC = 0; r = await pedir({ evento_id: 'soyluna', coordi_id: C2, zona: 'VIP' });
  af(r.s === 409 && ESC === 0, `[F1] no asignado → 409 (${r.s})`);
  DB.eventos_coordi.push({ id: 'a2', evento_id: 'soyluna', coordi_id: C2, status: 'aceptado' });
  ESC = 0; r = await pedir({ evento_id: 'soyluna', coordi_id: C2, zona: 'Platino' });
  af(r.s === 409 && ESC === 0 && filaDe(C2).zona_boleto === 'VIP', `[F2] fila de CLIENTE → 409 sin tocarla (${r.s})`);
  r = await pedir({ evento_id: 'omar#0', coordi_id: C3, zona: 'VIP' });
  af(r.s === 200 && filaDe(C3, 'omar#0') && filaDe(C3, 'omar#0').zona_boleto === 'VIP', `[G] asignación base abre la fecha omar#0 (${r.s}) ${r.j.error || ''}`);
  // [S] STAFF-SINBOLETO-1 (20-oct): «va sin boleto» = zona NULL + marca; no mide inventario.
  r = await pedir({ evento_id: 'soyluna', coordi_id: C1, zona: 'VIP' });
  ESC = 0; r = await pedir({ evento_id: 'soyluna', coordi_id: C1, zona: '__sin_boleto__' });
  af(r.s === 200 && r.j.sin_boleto === true && filaDe(C1).zona_boleto === null && filaDe(C1).sin_boleto === true && ESC === 1,
    `[S1] VIP → «va sin boleto»: zona NULL, sin_boleto=true, 1 escritura (${r.s}, ${ESC})`);
  ESC = 0; r = await pedir({ evento_id: 'soyluna', coordi_id: C1, zona: '__sin_boleto__' });
  af(r.j.ya === true && ESC === 0, `[S2] 2º clic «sin boleto» → 0 escrituras (${ESC})`);
  r = await pedir({ evento_id: 'soyluna', coordi_id: C1, zona: 'Platino' });
  af(r.s === 200 && filaDe(C1).zona_boleto === 'Platino' && filaDe(C1).sin_boleto === false, `[S3] volver a asignar zona apaga la marca (${r.s})`);
  DB.eventos_coordi.push({ id: 'a4', evento_id: 'soyluna', coordi_id: C3, status: 'aceptado' });
  ESC = 0; r = await pedir({ evento_id: 'soyluna', coordi_id: C3, zona: '__sin_boleto__' });
  af(r.s === 200 && filaDe(C3) && filaDe(C3).zona_boleto === null && filaDe(C3).sin_boleto === true && ESC === 1,
    `[S4] sin fila previa: nace su fila de staff marcada «sin boleto», sin medir inventario (${r.s}, ${ESC})`);
  // [I] la fila de staff con zona OCUPA lugar en la disponibilidad (la regla de su dueño)
  const { ocupaLugar, consumeBoleto } = require(path.join(RAIZ, 'netlify/functions/_lib/paquete-viaje.js'));
  af(ocupaLugar('PLUS', 'coordinador') === true && ocupaLugar('CHEAP', 'creadora') === true && ocupaLugar('RIDE', 'cliente') === false && ocupaLugar('PLUS', null) === true && consumeBoleto('PLUS', 'coordinador') === false,
    '[I] ocupaLugar: staff y creadora SÍ, RIDE no, cliente como siempre; consumeBoleto intacto');
  console.log(`\n${R ? '🔴' : '🟢'} ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(2); });
