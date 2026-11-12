// [RESGUARDO-1 · 12-nov-2026] Comprobantes de RESGUARDO por viajero (Capsule ·
// 📎 Pagos): se guardan, NO suman. Handler REAL con red falsa. Sin ancla — árbol.
'use strict';
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
let v = 0, r = 0; const af = (c, m) => { try { if (typeof c === 'function' ? c() : c) { v++; console.log('  ✓ ' + m); } else { r++; console.log('  ✗ ' + m); } } catch (e) { r++; console.log('  ✗ ' + m + ' · truena: ' + e.message); } };
const resp = (st, b) => ({ ok: st < 300, status: st, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
const VJ = '11111111-2222-3333-4444-555555555555';
let RG, LOG, ROL = 'milk';
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = decodeURIComponent(String(url));
  LOG.push(m + ' ' + u.replace('https://kh.falso.test', ''));
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u-x', activo: true, rol: ROL }]);
  if (u.includes('/storage/v1/object/sign/')) return resp(200, { signedURL: '/object/sign/firmada' });
  if (u.includes('/storage/v1/object/')) return resp(200, {});
  if (u.includes('/rest/v1/viajeros_evento')) return resp(200, u.includes(VJ) ? [{ evento_id: 'juniorh' }] : []);
  if (u.includes('/rest/v1/comprobantes_resguardo')) {
    if (m === 'POST') { const f = JSON.parse(init.body); f.id = 'abcdef12-0000-4000-8000-' + String(RG.length + 1).padStart(12, '0'); RG.push(f); return resp(201, [f]); }
    if (m === 'GET') return resp(200, RG.filter((x) => !x.archivado_at).map((x) => Object.assign({}, x)));
    if (m === 'PATCH') { const id = /id=eq\.([^&]+)/.exec(u)[1]; const x = RG.find((y) => y.id === id && !y.archivado_at); if (!x) return resp(200, []); Object.assign(x, JSON.parse(init.body)); return resp(200, [x]); }
  }
  return resp(200, []);
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const tok = (rol) => jwtSign({ id: 'u-' + rol, rol, correo: rol + '@x.mx', nombre: 'Milk' }, process.env.JWT_SECRET, 3600);
const jpg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).toString('base64');
const call = (b, rol) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok(rol || 'milk') }, body: JSON.stringify(b) });
(async () => {
  RG = []; LOG = [];
  console.log('[A] subir');
  let res = await call({ accion: 'resguardo_subir', viajero_id: VJ, foto: jpg, fecha_pago: '2026-07-01', nota: 'Pago 2' }), j = JSON.parse(res.body);
  af(res.statusCode === 200 && j.ok && RG.length === 1, 'sube y registra: ' + res.statusCode + ' ' + res.body.slice(0, 120));
  af(/^resguardo\/juniorh\/11111111-.+\.jpg$/.test(RG[0].foto_path), 'path bajo resguardo/evento/viajero: ' + RG[0].foto_path);
  af(RG[0].fecha_pago === '2026-07-01' && RG[0].nota === 'Pago 2' && RG[0].subido_por, 'fecha, nota y quién');
  af(!LOG.some((x) => /abonos_viajero/.test(x)) && !LOG.some((x) => /^(PATCH|POST) \/rest\/v1\/viajeros_evento/.test(x)), '🔒 CERO escrituras a abonos o viajeros (no suma dinero)');
  res = await call({ accion: 'resguardo_subir', viajero_id: VJ, foto: jpg });
  af(res.statusCode === 200 && RG.length === 2 && RG[1].fecha_pago == null, 'fecha y nota son opcionales');
  console.log('[B] listar');
  res = await call({ accion: 'resguardo_listar', viajero_id: VJ }); j = JSON.parse(res.body);
  af(res.statusCode === 200 && j.resguardos.length === 2 && j.resguardos[0].foto_url && !('foto_path' in j.resguardos[0]), 'lista con URL firmada y SIN path');
  console.log('[C] quitar = archivar');
  res = await call({ accion: 'resguardo_quitar', resguardo_id: RG[0].id });
  af(res.statusCode === 400, 'sin confirmar → 400');
  res = await call({ accion: 'resguardo_quitar', resguardo_id: RG[0].id, confirmar: true });
  af(res.statusCode === 200 && RG[0].archivado_at && RG.length === 2, 'se archiva, no se borra');
  res = await call({ accion: 'resguardo_quitar', resguardo_id: RG[0].id, confirmar: true });
  af(res.statusCode === 409, '2º clic → 409');
  af(!LOG.some((x) => /^DELETE/.test(x)), 'cero DELETEs');
  console.log('[D] rebotes');
  res = await call({ accion: 'resguardo_subir', viajero_id: VJ });
  af(res.statusCode === 400, 'sin foto → 400');
  res = await call({ accion: 'resguardo_subir', viajero_id: VJ, foto: 'data:image/jpeg;base64,' + Buffer.from('<html>').toString('base64') });
  af(res.statusCode === 400, 'basura → 400 por bytes');
  res = await call({ accion: 'resguardo_subir', viajero_id: VJ, foto: jpg, fecha_pago: '2026-13-45' });
  af(res.statusCode === 400, 'fecha imposible → 400');
  res = await call({ accion: 'resguardo_subir', viajero_id: '99999999-2222-3333-4444-555555555555', foto: jpg });
  af(res.statusCode === 404, 'viajero inexistente → 404');
  ROL = 'coordinador';
  res = await call({ accion: 'resguardo_subir', viajero_id: VJ, foto: jpg }, 'coordinador');
  ROL = 'milk';
  af(res.statusCode === 403 || res.statusCode === 401, 'un coordinador no sube: ' + res.statusCode);
  console.log('[E] pantalla');
  const src = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  af(/khViajeros\.resguardosDe\(id\)/.test(src) && /_vjResguardoHtml\(id, nombre, resg\)/.test(src), 'el panel 📎 Pagos pide y pinta los resguardos');
  af(/multiple style="display:none" onchange="_vjResguardoSubir/.test(src), 'sube VARIOS de una vez');
  af(/no suman al saldo/.test(src), 'dice que no suman');
  console.log(`\n${r ? '🔴' : '✅'} ${v} en verde · ${r} en rojo`); process.exit(r ? 1 : 0);
})();
