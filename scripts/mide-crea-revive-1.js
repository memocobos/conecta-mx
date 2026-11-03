// [CREA-REVIVE-1 · 3-nov-2026] Revivir una colaboración dada de baja: el
// contrato vuelve a su estado previo y el −20 del ranking se va SOLO (lo deriva
// _lib/creadoras de estado==='cancelado'). Por el handler REAL. Sin ancla — árbol.
'use strict';
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
let v = 0, r = 0; const af = (c, m) => { if (c) v++; else { r++; console.log('  ✗ ' + m); } };
const resp = (st, b) => ({ ok: st < 300, status: st, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });

const ID = '11111111-2222-3333-4444-555555555555';
let CTR, ESCRITURAS, ROL = 'maestro_roshi';   // la base dice el rol VIVO (verifyAdminAuthLive), no el JWT — y sesion-viva lo cachea por id: cada rol con su id
function semilla(extra) {
  CTR = Object.assign({ id: ID, creador_nombre: 'Ana Prueba', plantilla: 'creadora', estado: 'cancelado', evento_nombre: 'Karol G',
    firmado_at: '2026-10-01T10:00:00Z', datos: { talla: 'M', estado_previo: 'firmado',
      cancelacion: { motivo: 'no entregó', por: 'u', at: '2026-10-20T00:00:00Z', email_id: 'e1' },
      cortesia: { evento_id: 'karolg#0', zona: 'Oro', boletos: 2 } } }, extra || {});
  ESCRITURAS = [];
}
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = decodeURIComponent(String(url));
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: ROL }]);
  if (u.includes('/rest/v1/contratos_creadores')) {
    if (m === 'GET') return resp(200, u.includes('id=eq.' + ID) ? [JSON.parse(JSON.stringify(CTR))] : []);
    if (m === 'PATCH') {
      const est = (u.match(/estado=eq\.([^&]+)/) || [])[1];
      if (est && CTR.estado !== est) return resp(200, []);   // valor esperado, como PostgREST
      const b = JSON.parse(init.body); ESCRITURAS.push(b); Object.assign(CTR, b); return resp(200, [CTR]);
    }
  }
  if (u.includes('api.resend.com')) { ESCRITURAS.push('resend'); return resp(200, { id: 'x' }); }
  if (u.includes('/rest/v1/viajeros_evento')) { if (m !== 'GET') ESCRITURAS.push('viajeros'); return resp(200, []); }
  return resp(200, []);
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const { evaluarContrato } = require(path.join(RAIZ, 'netlify/functions/_lib/creadoras.js'));
const llama = (rol, b) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx',
  authorization: 'Bearer ' + jwtSign({ id: 'u-' + rol, rol, correo: 'x@x.mx', nombre: 'X' }, process.env.JWT_SECRET, 3600) },
  body: JSON.stringify(Object.assign({ accion: 'contrato_revivir', contrato_id: ID, motivo: 'sí entregó el reel' }, b)) });

(async () => {
  console.log('[A] seco por default: enseña, no escribe');
  semilla();
  let res = await llama('maestro_roshi', {}); let j = JSON.parse(res.body);
  af(res.statusCode === 200 && j.seco && j.plan.estado_nuevo === 'firmado', 'seco dice que vuelve a firmado: ' + res.body.slice(0, 160));
  af(ESCRITURAS.length === 0, 'seco: cero escrituras');

  console.log('[B] revivir: estado previo, historial, cortesía liberada, sin correo');
  const antes = evaluarContrato(CTR, [], '2026-11-03').puntos;
  res = await llama('maestro_roshi', { confirmar: true }); j = JSON.parse(res.body);
  af(res.statusCode === 200 && j.revivido && CTR.estado === 'firmado', 'el contrato vuelve a firmado: ' + res.body);
  af(!CTR.datos.cancelacion && !CTR.datos.estado_previo, 'la baja viva se quita (una baja futura vuelve a mandar su correo)');
  af(Array.isArray(CTR.datos.cancelaciones) && CTR.datos.cancelaciones[0].motivo === 'no entregó' && CTR.datos.cancelaciones[0].reactivacion.motivo === 'sí entregó el reel', 'la baja queda en el historial con su reactivación');
  af(!CTR.datos.cortesia && CTR.datos.cortesia_anterior && CTR.datos.cortesia_anterior.zona === 'Oro', 'la cortesía se libera para reasignar (no se re-escribe sola)');
  af(CTR.datos.talla === 'M', 'el resto de datos intacto');
  af(!ESCRITURAS.includes('resend') && !ESCRITURAS.includes('viajeros'), 'cero correos y cero escrituras a viajeros');
  const despues = evaluarContrato(CTR, [], '2026-11-03').puntos;
  af(antes === -20 && despues === 0, `el ranking: ${antes} → ${despues} (el −20 se va solo)`);

  console.log('[C] candados');
  ESCRITURAS = [];
  res = await llama('maestro_roshi', { confirmar: true });
  af(res.statusCode === 409 && ESCRITURAS.length === 0, '2º clic → 409 sin escribir');
  semilla(); ROL = 'bulma'; res = await llama('bulma', { confirmar: true }); ROL = 'maestro_roshi';
  af(res.statusCode === 403 && CTR.estado === 'cancelado', 'solo maestro_roshi: ' + res.statusCode);
  semilla(); res = await llama('maestro_roshi', { confirmar: true, motivo: '' });
  af(res.statusCode === 400 && CTR.estado === 'cancelado', 'sin motivo → 400');
  semilla({ plantilla: 'coordinador' }); res = await llama('maestro_roshi', { confirmar: true });
  af(res.statusCode === 400, 'solo creadoras');
  semilla({ firmado_at: null, datos: { cancelacion: { motivo: 'x' } } }); res = await llama('maestro_roshi', { confirmar: true });
  af(CTR.estado === 'pendiente', 'sin estado_previo y sin firma → pendiente (jamás se inventa un firmado): ' + CTR.estado);

  console.log('[D] la pantalla');
  const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8'), kc = fs.readFileSync(path.join(RAIZ, 'kamehouse-contratos.js'), 'utf8');
  af(/ctrReviveAbrir\('\$\{_escCtr\(c\.id\)\}'\)/.test(kh), 'el renglón cancelado pinta ♻️ Revivir');
  af(/function ctrReviveAbrir\(/.test(kc) && /accion: 'contrato_revivir'/.test(kc), 'el modal llama a la acción');

  console.log(`\n${r ? '🔴' : '✅'} mide:crea-revive-1 · ${v} en verde · ${r} en rojo`);
  process.exit(r ? 1 : 0);
})();
