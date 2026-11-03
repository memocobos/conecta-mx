// [CREA-BAJA-JUST-1 · 3-nov-2026] Baja JUSTIFICADA (avisó con anticipación):
// sin −20 en el ranking, correo amable, y un botón para justificar bajas ya
// hechas. Por el handler REAL con red falsa. Sin ancla — árbol de trabajo.
'use strict';
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.RESEND_API_KEY = 're_arnes';
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
let v = 0, r = 0; const af = (c, m) => { if (c) v++; else { r++; console.log('  ✗ ' + m); } };
const resp = (st, b) => ({ ok: st < 300, status: st, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
const ID = '22222222-3333-4444-5555-666666666666';
let CTR, ESC, ROL = 'maestro_roshi', CORREO = null;
function semilla(extra) {
  CTR = Object.assign({ id: ID, creador_nombre: 'Renata Prueba', creador_email: 'r@prueba.mx', plantilla: 'creadora', estado: 'firmado',
    evento_nombre: 'Grupo Frontera', evento_fecha: '2026-12-17', firmado_at: '2026-10-01T10:00:00Z', expectativas: ['reel previo'], ofrecimiento: ['2 boletos'],
    datos: { talla: 'M' } }, extra || {});
  ESC = []; CORREO = null;
}
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = decodeURIComponent(String(url));
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: ROL }]);
  if (u.includes('/rest/v1/contratos_creadores')) {
    if (m === 'GET') return resp(200, u.includes('id=eq.' + ID) ? [JSON.parse(JSON.stringify(CTR))] : []);
    if (m === 'PATCH') {
      const est = (u.match(/estado=eq\.([^&]+)/) || [])[1];
      if (est && CTR.estado !== est) return resp(200, []);
      const b = JSON.parse(init.body); ESC.push(b); Object.assign(CTR, b); return resp(200, [CTR]);
    }
  }
  if (u.includes('api.resend.com')) { ESC.push('resend'); CORREO = JSON.parse(init.body); return resp(200, { id: 'em-1' }); }
  if (u.includes('/rest/v1/viajeros_evento')) { if (m !== 'GET') ESC.push('viajeros'); return resp(200, []); }
  return resp(200, []);
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const { evaluarContrato } = require(path.join(RAIZ, 'netlify/functions/_lib/creadoras.js'));
const llama = (rol, b) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx',
  authorization: 'Bearer ' + jwtSign({ id: 'u-' + rol, rol, correo: 'x@x.mx', nombre: 'X' }, process.env.JWT_SECRET, 3600) }, body: JSON.stringify(b) });

(async () => {
  console.log('[R] el ranking');
  const ev = (datos) => evaluarContrato({ estado: 'cancelado', evento_fecha: '2026-12-17', datos }, [], '2026-11-03');
  af(ev({ cancelacion: { motivo: 'x' } }).puntos === -20 && ev({ cancelacion: { motivo: 'x' } }).baja === true, 'baja normal: −20');
  const j0 = ev({ cancelacion: { motivo: 'x', justificada: true } });
  af(j0.puntos === 0 && j0.baja === false && j0.baja_justificada === true, 'baja justificada: 0 y contada aparte');
  af(ev({ cancelacion: { motivo: 'x', justificada: 'true' } }).puntos === -20, 'solo true booleano justifica (un texto no)');
  af(evaluarContrato({ estado: 'firmado', evento_fecha: '2026-12-17', datos: {} }, [], '2026-11-03').puntos === 0, 'un firmado sin entregables sigue en 0');

  console.log('[B] dar de baja justificada');
  semilla();
  let res = await llama('maestro_roshi', { accion: 'contrato_cancelar', contrato_id: ID, motivo: 'Avisó que sale de la ciudad', justificada: true });
  let j = JSON.parse(res.body);
  af(res.statusCode === 200 && j.seco && j.plan.justificada === true && ESC.length === 0, 'seco: enseña justificada y no escribe');
  af(/Gracias por avisarnos/.test(j.plan.correo.html) && !/cláusula 5/.test(j.plan.correo.html), 'correo amable, sin citar la cláusula de incumplimiento');
  res = await llama('maestro_roshi', { accion: 'contrato_cancelar', contrato_id: ID, motivo: 'Avisó que sale de la ciudad', justificada: true, confirmar: true });
  j = JSON.parse(res.body);
  af(res.statusCode === 200 && CTR.estado === 'cancelado' && CTR.datos.cancelacion.justificada === true, 'escribe la marca: ' + res.body.slice(0, 160));
  af(CORREO && /Gracias por avisarnos/.test(CORREO.html), 'el correo que SALIÓ es el amable');
  af(evaluarContrato(CTR, [], '2026-11-03').puntos === 0, 'y el ranking no resta');

  console.log('[N] baja normal sigue igual');
  semilla();
  res = await llama('maestro_roshi', { accion: 'contrato_cancelar', contrato_id: ID, motivo: 'No entregó el reel previo', confirmar: true });
  af(CTR.datos.cancelacion.justificada === undefined && /cláusula 5/.test(CORREO.html), 'sin la casilla: correo de siempre y sin marca');
  af(evaluarContrato(CTR, [], '2026-11-03').puntos === -20, 'y resta −20');

  console.log('[J] justificar una baja ya hecha (caso Renata)');
  semilla({ estado: 'cancelado', datos: { talla: 'M', cancelacion: { motivo: 'sale de la ciudad', email_id: 'e0' } } });
  res = await llama('maestro_roshi', { accion: 'contrato_baja_justificar', contrato_id: ID, justificada: true });
  af(res.statusCode === 200 && CTR.datos.cancelacion.justificada === true && CTR.datos.cancelacion.email_id === 'e0' && CTR.datos.talla === 'M', 'marca sin pisar lo demás');
  af(!ESC.includes('resend') && !ESC.includes('viajeros'), 'cero correos y cero viajeros');
  af(Array.isArray(CTR.datos.cancelacion.justificaciones) && CTR.datos.cancelacion.justificaciones.length === 1, 'rastro de quién y cuándo');
  af(evaluarContrato(CTR, [], '2026-11-03').puntos === 0, 'el −20 se va');
  ESC = []; res = await llama('maestro_roshi', { accion: 'contrato_baja_justificar', contrato_id: ID, justificada: true });
  af(JSON.parse(res.body).sin_cambio && ESC.length === 0, '2º clic: sin cambio, cero escrituras');
  res = await llama('maestro_roshi', { accion: 'contrato_baja_justificar', contrato_id: ID, justificada: false });
  af(CTR.datos.cancelacion.justificada === undefined && CTR.datos.cancelacion.justificaciones.length === 2 && evaluarContrato(CTR, [], '2026-11-03').puntos === -20, 'deshacer: vuelve el −20 con rastro');
  semilla(); res = await llama('maestro_roshi', { accion: 'contrato_baja_justificar', contrato_id: ID, justificada: true });
  af(res.statusCode === 409 && ESC.length === 0, 'un contrato vivo no se «justifica»: 409');
  semilla({ estado: 'cancelado' }); ROL = 'bulma'; res = await llama('bulma', { accion: 'contrato_baja_justificar', contrato_id: ID, justificada: true }); ROL = 'maestro_roshi';
  af(res.statusCode === 403 && ESC.length === 0, 'solo maestro_roshi');
  res = await llama('maestro_roshi', { accion: 'contrato_baja_justificar', contrato_id: ID });
  af(res.statusCode === 400, 'sin justificada → 400');

  console.log('[D] pantalla');
  const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8'), kc = fs.readFileSync(path.join(RAIZ, 'kamehouse-contratos.js'), 'utf8');
  const ac = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-contratos.js'), 'utf8');
  af(/baja_justificada:datos->cancelacion->>justificada/.test(ac), 'la lista proyecta la marca');
  af(/ctrBajaJustificar\('\$\{_escCtr\(c\.id\)\}'/.test(kh) && /🤝 Justificada · sin −20/.test(kh), 'el renglón cancelado pinta el botón y el sello');
  af(/id="baja-justificada"/.test(kc) && /justificada: !!\(\(_bajaEl\('baja-justificada'\)/.test(kc), 'la casilla viaja en la baja');
  af(/accion: 'contrato_baja_justificar'/.test(kc), 'el botón llama a la acción');

  console.log(`\n${r ? '🔴' : '✅'} mide:crea-baja-just-1 · ${v} en verde · ${r} en rojo`);
  process.exit(r ? 1 : 0);
})();
