// [ABONO-FOTO-4 · 3-nov-2026] Subir o CAMBIAR el comprobante de un abono que ya
// existe (Capsule · 📎 Pagos). Por el handler REAL con red falsa que respeta el
// filtro del valor esperado. Sin ancla — árbol.
'use strict';
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
let v = 0, r = 0; const af = (c, m) => { try { if (typeof c === 'function' ? c() : c) v++; else { r++; console.log('  ✗ ' + m); } } catch (e) { r++; console.log('  ✗ ' + m + ' · truena: ' + e.message); } };
const resp = (st, b) => ({ ok: st < 300, status: st, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });

const AB = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', VJ = '11111111-2222-3333-4444-555555555555';
let DB, LOG, ROL = 'bulma';
function semilla(foto) { DB = { abono: { id: AB, viajero_id: VJ, monto: 300, fecha: '2026-11-02', foto_path: foto, nota: 'Requisición R-B3DRX' } }; LOG = []; }
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = decodeURIComponent(String(url));
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u-roshi', activo: true, rol: ROL }]);
  if (u.includes('/storage/v1/object/')) { LOG.push('storage:' + m + ':' + u.split('/abonos-viajeros/')[1]); return resp(200, {}); }
  if (u.includes('/rest/v1/viajeros_evento')) { LOG.push('viajeros:' + m); return resp(200, [{ evento_id: 'frontera#0' }]); }
  if (u.includes('/rest/v1/abonos_viajero')) {
    LOG.push('abonos:' + m);
    if (m === 'GET') return resp(200, [Object.assign({}, DB.abono)]);
    if (m === 'PATCH') {
      // Respeta el valor esperado como PostgREST.
      const mm = /foto_path=(is\.null|eq\.([^&]+))/.exec(u);
      const casa = !mm ? true : (mm[1] === 'is.null' ? DB.abono.foto_path == null : DB.abono.foto_path === mm[2]);
      if (!casa) return resp(200, []);
      const p = JSON.parse(init.body); LOG.patch = p;
      Object.assign(DB.abono, p); return resp(200, [Object.assign({}, DB.abono)]);
    }
  }
  if (u.includes('api.resend.com')) { LOG.push('resend'); return resp(200, { id: 'x' }); }
  return resp(200, []);
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const tok = (rol) => jwtSign({ id: rol === 'coordinador' ? 'u-coordi' : 'u-roshi', rol, correo: 'bulma@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
const jpg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).toString('base64');
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 comprobante').toString('base64');
const call = (b, rol) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok(rol || 'bulma') }, body: JSON.stringify(Object.assign({ accion: 'abono_foto', abono_id: AB }, b)) });

(async () => {
  console.log('[A] subir a un abono SIN comprobante');
  semilla(null);
  let res = await call({ foto: jpg }), j = JSON.parse(res.body);
  af(res.statusCode === 200 && j.ok && j.reemplazo === false, 'contesta 200 y no es reemplazo: ' + res.statusCode + ' ' + res.body.slice(0, 160));
  af(/^frontera#0\/11111111-2222-3333-4444-555555555555\/.+\.jpg$/.test(DB.abono.foto_path), 'el path nuevo vive bajo evento/viajero: ' + DB.abono.foto_path);
  af(LOG.some((x) => /^storage:POST/.test(x)) && LOG.indexOf('abonos:PATCH') > LOG.findIndex((x) => /^storage:POST/.test(x)), 'sube primero, luego el PATCH: ' + LOG.join(' → '));
  af(LOG.patch && Object.keys(LOG.patch).sort().join(',') === 'foto_path,nota', 'el PATCH toca SOLO foto_path + nota (cero dinero): ' + JSON.stringify(Object.keys(LOG.patch || {})));
  af(DB.abono.monto === 300 && DB.abono.fecha === '2026-11-02', 'monto y fecha intactos');
  af(/^Requisición R-B3DRX · \[FOTO \d{4}-\d{2}-\d{2}\] comprobante agregado · Bulma$/.test(DB.abono.nota), 'la nota ANEXA (no pisa): ' + DB.abono.nota);
  af(!LOG.includes('resend'), 'cero correos');

  console.log('[B] cambiar un comprobante (la foto negra)');
  semilla('frontera#0/' + VJ + '/negra.jpg');
  res = await call({ foto: pdf }); j = JSON.parse(res.body);
  af(res.statusCode === 200 && j.reemplazo === true && j.antes === 'frontera#0/' + VJ + '/negra.jpg', 'reemplazo dicho con el path de antes');
  af(/\.pdf$/.test(DB.abono.foto_path) && DB.abono.foto_path !== 'frontera#0/' + VJ + '/negra.jpg', 'PDF entra con su objeto PROPIO (uuid nuevo)');
  af(/comprobante CAMBIADO \(antes: frontera#0\/.+\/negra\.jpg\)/.test(DB.abono.nota), 'el path viejo queda anotado en la nota');
  af(!LOG.some((x) => /^storage:DELETE/.test(x)) && !LOG.includes('abonos:DELETE'), 'la foto vieja NO se borra del bucket');

  console.log('[C] el valor esperado (carrera / doble clic)');
  semilla(null);
  const orig = global.fetch;
  global.fetch = async (url, init) => { const x = await orig(url, init); if (((init || {}).method || 'GET') === 'GET' && String(url).includes('abonos_viajero')) DB.abono.foto_path = 'otro/la/puso.jpg'; return x; };
  res = await call({ foto: jpg }); j = JSON.parse(res.body);
  global.fetch = orig;
  af(res.statusCode === 409 && j.huerfano, 'alguien puso foto entre la lectura y el PATCH → 409 y el huérfano DICHO: ' + res.statusCode);
  af(DB.abono.foto_path === 'otro/la/puso.jpg', 'no se pisó la foto del otro');

  console.log('[D] rebotes');
  semilla(null);
  res = await call({});
  af(res.statusCode === 400 && !LOG.some((x) => /^storage/.test(x)), 'sin foto → 400, nada sube');
  res = await call({ foto: 'data:image/jpeg;base64,' + Buffer.from('<html>no</html>').toString('base64') });
  af(res.statusCode === 400 && DB.abono.foto_path == null, 'basura con rótulo de foto → 400 por bytes');
  res = await call({ foto: jpg, abono_id: 'nope' });
  af(res.statusCode === 400, 'abono_id inválido → 400');
  // El rol VIVO se lee de la fila de usuarios (sesion-viva, cacheada POR id: otro id), no del token.
  ROL = 'coordinador';
  res = await call({ foto: jpg }, 'coordinador');
  ROL = 'bulma';
  af(res.statusCode === 403 || res.statusCode === 401, 'un coordinador no cambia comprobantes: ' + res.statusCode);

  console.log('[E] la pantalla');
  const src = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  af(/abonoFoto\(abono_id, foto\) \{ return this\._call\(\{ accion: 'abono_foto'/.test(src), 'khViajeros.abonoFoto existe y llama a abono_foto');
  const ini = src.indexOf('async function _vjAbonoFoto('), cuerpo = src.slice(ini, src.indexOf('\n}\n', ini));
  af(ini > 0 && /try \{ foto = await _vj3LeerFoto\(input\); \}/.test(cuerpo), 'usa el MISMO lector (_vj3LeerFoto) con try');
  af(/onchange="_vjAbonoFoto\(this,/.test(src) && /📎 Subir comprobante/.test(src) && /🔁 Cambiar comprobante/.test(src), 'el panel 📎 Pagos pinta Subir/Cambiar por abono');
  const acc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');
  af(/\n  abono_foto: ROLES_EDITA_VIAJERO,/.test(acc), 'la acción está en ACCIONES (si no, el portero la rechaza)');
  console.log(`\n${r ? '🔴' : '✅'} ${v} en verde · ${r} en rojo`); process.exit(r ? 1 : 0);
})();
