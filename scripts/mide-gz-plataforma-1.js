#!/usr/bin/env node
// mide:gz-plataforma-1 — la plataforma del Guerrero Z (14-oct-2026):
//   [P] gz-panel: «yo» sale del JWT; «Ver como» SOLO para maestro_roshi;
//       contrato por correo sin importar mayúsculas; tour con candado de
//       asignación; rooming con nombres de viajeros_evento (bajas fuera).
//   [K] admin-kits: el coordinador recibe SOLO id/pieza/cantidad/retornable.
//   [D] admin-salidas: devolución en dos llaves (avisa el dueño, recibe Popo);
//       recibir NO suma stock.
//   [F] admin-reportes: aprobar_final SOLO Memo; si Popo ya recibió, la
//       aprobación recarga la bodega UNA vez (el 2º intento no re-suma).
// Handlers REALES, base falsa con filtros + estado, cero DELETEs.
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.RESEND_API_KEY = 're_falso';
process.env.CORREOS_MODO = 'real';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };

const ROSHI = 'aaaaaaaa-0000-4000-8000-000000000001', LESLY = 'aaaaaaaa-0000-4000-8000-000000000002', POPO = 'aaaaaaaa-0000-4000-8000-000000000003', OTRO = 'aaaaaaaa-0000-4000-8000-000000000004', BULMA = 'aaaaaaaa-0000-4000-8000-000000000005';
const HAB1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const SAL1 = 'cccccccc-0000-4000-8000-000000000001', REP1 = 'dddddddd-0000-4000-8000-000000000001';
const KBOC = 'eeeeeeee-0000-4000-8000-000000000001', KVASO = 'eeeeeeee-0000-4000-8000-000000000002';
let DB, MAILS, ESCRITURAS;
const base = () => ({
  usuarios: [
    { id: ROSHI, nombre: 'Memo', rol: 'maestro_roshi', correo: 'memo@x.mx', activo: true },
    { id: LESLY, nombre: 'Lesly G', rol: 'coordinador', correo: 'Lesly@X.mx', correo_notif: null, celular: '8990000000', talla_playera: 'M', foto_url: null, strikes: 1, activo: true },
    { id: POPO, nombre: 'Allan', rol: 'mister_popo', correo: 'popo@x.mx', activo: true },
    { id: OTRO, nombre: 'Otro', rol: 'coordinador', correo: 'otro@x.mx', activo: true },
    { id: BULMA, nombre: 'Sofi', rol: 'bulma', correo: 'bulma@x.mx', activo: true },
  ],
  contratos_creadores: [
    { id: 'c1', token: 'tokLesly', plantilla: 'coordinador', estado: 'firmado', firmado_at: '2026-08-05T10:00:00Z', vigencia_fin: '2027-08-06', creador_email: 'lesly@x.mx' },
    { id: 'c2', token: 'tokOtro', plantilla: 'coordinador', estado: 'pendiente', creador_email: 'otro@x.mx' },
  ],
  eventos_coordi: [
    { id: 'a1', evento_id: 'alfredito', coordi_id: LESLY, status: 'aceptado', indicaciones: 'Llega 6am', asignado_en: '2026-10-01T00:00:00Z' },
    { id: 'a2', evento_id: 'soyluna', coordi_id: OTRO, status: 'pendiente', asignado_en: '2026-10-02T00:00:00Z' },
  ],
  salidas_bodega: [
    { id: SAL1, evento_id: 'alfredito', solicitante_id: LESLY, solicitante_rol: 'coordinador', estado: 'autorizada', creado_en: '2026-10-13T00:00:00Z',
      detalle: [{ pieza_id: KBOC, pieza: 'Bocina', cantidad: 1, retornable: true }, { pieza_id: KVASO, pieza: 'Vaso', cantidad: 10, retornable: false }] },
  ],
  reportes_evento: [
    { id: REP1, evento_id: 'alfredito', coordi_id: LESLY, status: 'aprobado_popo', created_at: '2026-10-16T00:00:00Z',
      kits_detalle: [{ pieza_id: KBOC, cantidad_sacada: 1, cantidad_sobrante: 1 }, { pieza_id: KVASO, cantidad_sacada: 10, cantidad_sobrante: 2 }] },
  ],
  deudas_coordi: [],
  kits_inventario: [
    { id: KBOC, pieza: 'Bocina', cantidad: 2, costo_unitario: 900, stock_minimo: 0, proveedor: 'Memo', retornable: true },
    { id: KVASO, pieza: 'Vaso', cantidad: 241, costo_unitario: 20, stock_minimo: 100, proveedor: 'Matriz', retornable: false },
  ],
  rooming_habitaciones: [
    { id: HAB1, evento_slug: 'alfredito', numero_hab: '101', tipo: 'doble', orden: 1, ocupantes: ['Lesly G'], hotel_nombre: 'Hotel X' },
    { id: 'bbbbbbbb-0000-4000-8000-000000000002', evento_slug: 'alfredito2', numero_hab: '999', tipo: 'doble', orden: 1, ocupantes: ['Ajeno'] },
  ],
  viajeros_evento: [
    { id: 'v1', evento_id: 'alfredito', nombre: 'Claudia', habitacion_id: HAB1, boletos: 1, zona_boleto: 'Oro' },
    { id: 'v2', evento_id: 'alfredito', nombre: 'Baja Roja', habitacion_id: HAB1, boletos: 0, zona_boleto: null },
  ],
  grupos_whatsapp: [{ evento_id: 'alfredito', link: 'https://chat.whatsapp.com/ABCDEFGHIJKL' }],
  eventos_meta: [],
});
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
const casa = (row, k, v) => {
  const val = row[k] == null ? null : String(row[k]);
  if (v === 'is.null') return val === null;
  if (v === 'not.is.null') return val !== null;
  if (v.startsWith('eq.')) return val === decodeURIComponent(v.slice(3));
  if (v.startsWith('neq.')) return val !== null && val !== decodeURIComponent(v.slice(4));
  if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((x) => decodeURIComponent(x).replace(/^"|"$/g, '')).includes(val);
  if (v.startsWith('ilike.')) { const p = decodeURIComponent(v.slice(6)).toLowerCase(); return val !== null && (p.includes('*') ? val.toLowerCase().includes(p.replace(/\*/g, '')) : val.toLowerCase() === p); }
  if (v.startsWith('like.')) { const p = decodeURIComponent(v.slice(5)); return val !== null && (p.endsWith('*') ? val.startsWith(p.slice(0, -1)) : val === p); }
  throw new Error('filtro no modelado ' + k + '=' + v);
};
let ULTIMO_SELECT = {};
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase();
  if (String(url).startsWith('https://api.resend.com')) { MAILS.push(JSON.parse(init.body)); return resp(200, { id: 'em_' + MAILS.length }); }
  const u = new URL(url); const t = u.pathname.replace('/rest/v1/', ''); const T = DB[t]; if (!T) return resp(404, { message: 'no table ' + t });
  if (m === 'DELETE') throw new Error('DELETE prohibido');
  const sel = (r) => { for (const [k, v] of u.searchParams.entries()) { if (['select', 'order', 'limit', 'or'].includes(k)) continue; if (!casa(r, k, v)) return false; } return true; };
  if (m === 'GET') {
    ULTIMO_SELECT[t] = u.searchParams.get('select');
    const cols = (u.searchParams.get('select') || '*').split(',');
    return resp(200, T.filter(sel).map((r) => { if (cols[0] === '*') return JSON.parse(JSON.stringify(r)); const o = {}; cols.forEach((c) => { if (c in r) o[c] = JSON.parse(JSON.stringify(r[c])); }); return o; }));
  }
  const b = JSON.parse(init.body);
  ESCRITURAS.push({ t, m, b });
  if (m === 'POST') { const f = Object.assign({ id: require('crypto').randomUUID() }, b); T.push(f); return resp(201, [f]); }
  if (m === 'PATCH') { const fs = T.filter(sel); fs.forEach((r) => Object.assign(r, b)); return resp(200, JSON.parse(JSON.stringify(fs))); }
};
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const fn = (n) => require(path.join(RAIZ, 'netlify/functions', n)).handler;
const GZ = fn('gz-panel.js'), KITS = fn('admin-kits.js'), SAL = fn('admin-salidas.js'), REP = fn('admin-reportes.js');
const llamar = async (H, b, id, rol, correo) => {
  const tok = jwtSign({ id, rol, correo: correo || 'x@x.mx' }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(b) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};
const reset = () => { DB = base(); MAILS = []; ESCRITURAS = []; };
(async () => {
  console.log('══ mide:gz-plataforma-1 ══');
  // ── [P] gz-panel ──
  reset();
  let r = await llamar(GZ, { accion: 'panel' }, LESLY, 'coordinador', 'lesly@x.mx');
  af(r.s === 200 && r.j.usuario.id === LESLY, '[P1] la coordi recibe SU panel');
  af(r.j.contratos.length === 1 && r.j.contratos[0].vigencia_fin === '2027-08-06' && r.j.contratos[0].token === 'tokLesly', '[P2] su contrato se encuentra aunque su correo de acceso tenga MAYÚSCULAS (y trae el token para verlo/firmarlo)');
  af(r.j.asignaciones.length === 1 && r.j.salidas.length === 1 && r.j.reportes.length === 1, '[P3] asignaciones, salidas y reportes suyos');
  af(!('correo_notif' in r.j.usuario) && r.j.contratos.every((c) => !('creador_email' in c) && !('id' in c)), '[P4] no viajan correos de más ni ids de contrato');
  r = await llamar(GZ, { accion: 'panel', ver_como: OTRO }, LESLY, 'coordinador');
  af(r.s === 200 && r.j.usuario.id === LESLY && r.j.ver_como === false, '[P5] una coordi NO puede «ver como» otra (se ignora: sigue siendo ella)');
  r = await llamar(GZ, { accion: 'panel', ver_como: OTRO }, ROSHI, 'maestro_roshi', 'memo@x.mx');
  af(r.s === 200 && r.j.usuario.id === OTRO && r.j.ver_como === true && r.j.contratos[0].estado === 'pendiente', '[P6] Memo «viendo como» ve el contrato REAL de esa persona (el bug de «no dice nada»)');
  r = await llamar(GZ, { accion: 'panel', ver_como: OTRO }, BULMA, 'bulma');
  af(r.j.usuario.id === BULMA, '[P7] Bulma no tiene «ver como»');
  r = await llamar(GZ, { accion: 'tour', evento_id: 'soyluna' }, LESLY, 'coordinador');
  af(r.s === 403, '[P8] tour ajeno → 403');
  r = await llamar(GZ, { accion: 'tour', evento_id: 'alfredito' }, LESLY, 'coordinador');
  af(r.s === 200 && r.j.rooming.length === 1, '[P9] rooming de SU tour (el de «alfredito2» no se cuela por el prefijo)');
  af(r.j.rooming[0] && r.j.rooming[0].ocupantes.includes('Claudia') && r.j.rooming[0].ocupantes.includes('Lesly G') && !r.j.rooming[0].ocupantes.includes('Baja Roja'), '[P10] ocupantes = viajeros con ese cuarto + nombres capturados; la BAJA no duerme');
  af(r.j.grupo_whatsapp === 'https://chat.whatsapp.com/ABCDEFGHIJKL', '[P11] link del grupo de WhatsApp');
  af(ESCRITURAS.length === 0, '[P12] gz-panel no escribe NADA');

  // ── [K] admin-kits ──
  reset();
  r = await llamar(KITS, { accion: 'listar' }, LESLY, 'coordinador');
  af(r.s === 200 && ULTIMO_SELECT.kits_inventario === 'id,pieza,cantidad,retornable', '[K1] al coordinador se le pide SOLO id,pieza,cantidad,retornable');
  af((r.j.items || r.j.kits || []).every((k) => !('proveedor' in k) && !('stock_minimo' in k) && !('costo_unitario' in k)), '[K2] y eso es lo único que recibe');
  r = await llamar(KITS, { accion: 'listar' }, POPO, 'mister_popo');
  af(/stock_minimo/.test(ULTIMO_SELECT.kits_inventario) && !/costo/.test(ULTIMO_SELECT.kits_inventario), '[K3] Popo sigue viendo stock mínimo y proveedor (sin costos)');
  r = await llamar(KITS, { accion: 'crear', pieza: 'X', cantidad: 1 }, LESLY, 'coordinador');
  af(r.s === 403, '[K4] el coordinador no puede agregar piezas');

  // ── [D] devolución ──
  reset();
  r = await llamar(SAL, { accion: 'devolucion_avisar', id: SAL1 }, OTRO, 'coordinador');
  af(r.s === 403, '[D1] otro coordi no puede avisar la devolución ajena');
  r = await llamar(SAL, { accion: 'devolucion_avisar', id: SAL1 }, LESLY, 'coordinador');
  af(r.s === 200 && DB.salidas_bodega[0].devolucion_avisada_at, '[D2] la dueña avisa «ya lo regresé»');
  af(MAILS.length === 1 && MAILS[0].to.includes('popo@x.mx') && /Lesly G/.test(MAILS[0].html), '[D3] a Popo le llega el correo, con el NOMBRE de quien regresó');
  const n1 = ESCRITURAS.length;
  r = await llamar(SAL, { accion: 'devolucion_avisar', id: SAL1 }, LESLY, 'coordinador');
  af(r.s === 200 && r.j.ya && ESCRITURAS.length === n1 && MAILS.length === 1, '[D4] avisar dos veces no escribe ni manda otro correo');
  r = await llamar(SAL, { accion: 'devolucion_recibir', id: SAL1 }, LESLY, 'coordinador');
  af(r.s === 403, '[D5] la coordi no puede «recibir» su propia devolución');
  const stockAntes = DB.kits_inventario.map((k) => k.cantidad).join(',');
  r = await llamar(SAL, { accion: 'devolucion_recibir', id: SAL1 }, POPO, 'mister_popo', 'popo@x.mx');
  af(r.s === 200 && DB.salidas_bodega[0].devolucion_recibida_at && r.j.recargar_ahora === false, '[D6] Popo recibe; el reporte aún no tiene aprobación final → recargar_ahora=false');
  af(DB.kits_inventario.map((k) => k.cantidad).join(',') === stockAntes && !ESCRITURAS.some((e) => e.t === 'kits_inventario'), '[D7] RECIBIR NO SUMA STOCK (un solo camino suma)');
  DB.salidas_bodega.push({ id: 'cccccccc-0000-4000-8000-000000000009', evento_id: 'dalemix', solicitante_id: POPO, solicitante_rol: 'mister_popo', estado: 'autorizada', detalle: [] });
  r = await llamar(SAL, { accion: 'listar', mias: true }, POPO, 'mister_popo');
  af(r.s === 200 && r.j.salidas.length === 1 && r.j.salidas[0].solicitante_id === POPO, '[D8] «Mis salidas» de Popo trae SOLO las suyas (aunque él vea todas en su bandeja)');
  r = await llamar(SAL, { accion: 'listar' }, POPO, 'mister_popo');
  af(r.j.salidas.length === 2, '[D9] sin `mias`, Popo sigue viendo todas (su bandeja)');

  // ── [F] aprobación final ──
  r = await llamar(REP, { accion: 'aprobar_final', id: REP1 }, LESLY, 'coordinador');
  af(r.s === 403, '[F1] el coordinador no puede dar la aprobación final');
  // [GZ-INICIO-3] corrección de Memo: Bulma y Milk SÍ aprueban.
  r = await llamar(REP, { accion: 'aprobar_final', id: REP1 }, BULMA, 'bulma', 'bulma@x.mx');
  const boc = DB.kits_inventario.find((k) => k.id === KBOC), vas = DB.kits_inventario.find((k) => k.id === KVASO);
  af(r.s === 200 && DB.reportes_evento[0].status === 'aprobado_memo', '[F2] Bulma aprueba (también Memo y Milk)');
  af(boc.cantidad === 3 && vas.cantidad === 243, `[F3] como Popo ya recibió, la bodega se recarga EN ESE ACTO (bocina 2→3, vasos 241→243: ${boc.cantidad}/${vas.cantidad})`);
  af(DB.salidas_bodega[0].estado === 'cerrada' && (DB.reportes_evento[0].kits_detalle || []).every((k) => k.recibido), '[F4] la salida queda cerrada y el reporte palomeado');
  r = await llamar(REP, { accion: 'aprobar_final', id: REP1 }, ROSHI, 'maestro_roshi', 'memo@x.mx');
  af(boc.cantidad === 3 && vas.cantidad === 243, '[F5] aprobar otra vez NO re-suma');
  // sin recibir → no recarga
  reset();
  r = await llamar(REP, { accion: 'aprobar_final', id: REP1 }, ROSHI, 'maestro_roshi', 'memo@x.mx');
  af(r.s === 200 && DB.kits_inventario.find((k) => k.id === KBOC).cantidad === 2 && DB.salidas_bodega[0].estado === 'autorizada', '[F6] si Popo NO ha recibido, aprobar no recarga nada (espera su «lo recibí»)');
  r = await llamar(SAL, { accion: 'devolucion_recibir', id: SAL1 }, POPO, 'mister_popo', 'popo@x.mx');
  af(r.s === 200 && r.j.recargar_ahora === true && r.j.reporte_id === REP1, '[F7] y si Popo recibe DESPUÉS, la respuesta le dice que recargue ya (la pantalla palomea el reporte)');

  af(!ESCRITURAS.some((e) => e.m === 'DELETE'), '[Z] cero DELETEs');
  console.log(`\n${R ? '🔴' : '🟢'} ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
