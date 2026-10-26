#!/usr/bin/env node
/* [REP-TICKET-1 + GZ-HIST-1 · 25-oct-2026] Los dos reportes de los coordis:
 * «no tienen cómo subir los tickets de los gastos» y «en su perfil no pueden
 * subir sus tours pasados».
 * [A] admin-reportes REAL: ticket_subir (magia de bytes, path bajo el id del
 *     JWT) y ticket_ver (URL firmada; un coordi SOLO firma paths propios).
 * [B] admin-tours REAL: el coordi crea SU historial (el backend ya lo
 *     permitía) y el servidor SELLA la fila; a otro usuario sigue 403.
 * [C] los cables del front (hechos sobre el fuente).
 * ⚠️ SIN ANCLA (árbol de trabajo, como mide:kaio-v3): mide lo que acabas de
 * escribir y no puede traer control positivo por commit — dicho aquí.
 * ⚠️ El guard de sesión-viva pega a la URL KH falsa y hace FAIL-OPEN con el
 * 404 de la red falsa (ruido esperado en consola). Los conteos «sin red» se
 * hacen SOLO sobre llamadas /storage/ — la lección de PET-DEL-1. */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

process.env.JWT_SECRET = 'secreto-del-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';

let ok = 0, ko = 0;
const af = (c, m) => { try { c = typeof c === 'function' ? c() : c; } catch (e) { c = false; m += ' · EXC: ' + e.message; } if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

// ── Red falsa: registra método/ruta/headers/body; respeta filtros ────────────
function redNueva() {
  const st = { llamadas: [] };
  st.storage = () => st.llamadas.filter(c => c.u.includes('/storage/'));
  st.fetch = async (url, init) => {
    const U = String(url), m = ((init || {}).method || 'GET').toUpperCase();
    const h = (init || {}).headers || {};
    let body = null;
    if (init && init.body != null) {
      if (Buffer.isBuffer(init.body)) body = { _buf: init.body.length };
      else { try { body = JSON.parse(init.body); } catch { body = String(init.body).slice(0, 80); } }
    }
    st.llamadas.push({ m, u: U, h, body });
    const resp = (s, o) => ({ ok: s < 400, status: s, json: async () => o, text: async () => JSON.stringify(o) });
    if (U.includes('/storage/v1/object/sign/')) return resp(200, { signedURL: '/object/sign/firmado?token=abc' });
    if (U.includes('/storage/v1/object/reportes-tickets/') && m === 'POST') return resp(200, { Key: 'ok' });
    if (U.includes('/rest/v1/tours_pasados') && m === 'POST') return resp(201, [{ id: 'tttttttt-1111-2222-3333-444444444444', ...(body || {}) }]);
    return resp(404, { error: 'ruta no esperada: ' + U });
  };
  return st;
}
function H(archivo) {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return { h: require(path.join(RAIZ, 'netlify/functions/' + archivo)).handler,
           jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign };
}
const ev = (body, tok) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });

const COORDI_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OTRO_ID   = '11111111-2222-3333-4444-555555555555';
// Un JPG de mentira con magia REAL (0xFF 0xD8) — el tipo se decide por bytes.
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, 3)]);

(async function main() {
  console.log('[A] REP-TICKET-1: admin-reportes real — subir y ver tickets');
  const red = redNueva(); global.fetch = red.fetch;
  const { h, jwtSign } = H('admin-reportes.js');
  const coordi = jwtSign({ id: COORDI_ID, rol: 'coordinador' }, process.env.JWT_SECRET, 3600);
  const bulma  = jwtSign({ id: 'bbbbbbbb-0000-0000-0000-000000000001', rol: 'bulma' }, process.env.JWT_SECRET, 3600);

  let antes = red.storage().length;
  let r = await h(ev({ accion: 'ticket_subir', archivo: Buffer.from('soy texto, no imagen').toString('base64') }, coordi));
  af(r.statusCode === 400 && /imagen/.test(JSON.parse(r.body).error) && red.storage().length === antes,
    '🔒 lo que no es imagen POR SUS BYTES rebota 400 sin pegarle al storage');

  r = await h(ev({ accion: 'ticket_subir', archivo: JPG.toString('base64'), path: 'otro/lado.jpg' }, coordi));
  let j = JSON.parse(r.body);
  let up = red.storage().slice(-1)[0] || {};
  af(r.statusCode === 200 && j.ok === true && typeof j.path === 'string', 'un JPG real sube y devuelve su path');
  af(j.path.startsWith(COORDI_ID + '/'), '🔒 el path LO ARMA EL SERVIDOR bajo el id del JWT — el `path` que mandó el cliente se IGNORA');
  af(up.m === 'POST' && up.u.includes('/storage/v1/object/reportes-tickets/' + COORDI_ID + '/') && up.h['Content-Type'] === 'image/jpeg',
    'y el POST va al bucket reportes-tickets con el Content-Type de la magia');
  const pathPropio = j.path;

  r = await h(ev({ accion: 'ticket_ver', path: pathPropio }, coordi));
  j = JSON.parse(r.body);
  const sg = red.storage().slice(-1)[0] || {};
  af(r.statusCode === 200 && /storage\/v1\/object\/sign/.test(j.url || ''), 'ver el ticket PROPIO contesta URL firmada');
  af(/\/object\/sign\/reportes-tickets\//.test(sg.u) && sg.body && sg.body.expiresIn === 600, 'la firma va al endpoint de sign con vigencia dicha');

  antes = red.storage().length;
  r = await h(ev({ accion: 'ticket_ver', path: OTRO_ID + '/123-abcd.jpg' }, coordi));
  af(r.statusCode === 403 && red.storage().length === antes,
    '🔒 un coordinador NO firma tickets AJENOS: 403 sin pedir firma — sin esto cualquier coordi vería los tickets de los demás');
  r = await h(ev({ accion: 'ticket_ver', path: OTRO_ID + '/123-abcd.jpg' }, bulma));
  af(r.statusCode === 200, 'bulma (modera) sí ve cualquiera');
  antes = red.storage().length;
  r = await h(ev({ accion: 'ticket_ver', path: '../../etc/passwd' }, bulma));
  af(r.statusCode === 400 && red.storage().length === antes, 'un path que no es <uuid>/<archivo> rebota 400 sin red');
  r = await h(ev({ accion: 'ticket_subir', archivo: JPG.toString('base64') }, bulma));
  af(r.statusCode === 403, 'subir es de quien LLENA el reporte (coordinador/popo): bulma rebota');

  console.log('\n[B] GZ-HIST-1: admin-tours real — el coordi captura SU historial');
  const { h: ht } = H('admin-tours.js');
  r = await ht(ev({ accion: 'crear', usuario_id: COORDI_ID, artista: 'Bad Bunny', fecha_aprox: '2024-05-10', notas: 'tour viejo' }, coordi));
  j = JSON.parse(r.body);
  let ins = red.llamadas.filter(c => c.u.includes('tours_pasados') && c.m === 'POST').slice(-1)[0] || {};
  af(r.statusCode === 200 && j.ok === true, 'el coordi crea un tour pasado en SU PROPIO perfil (el backend ya lo permitía — faltaba la puerta)');
  af(() => ins.body && /capturado por la persona desde su perfil/.test(ins.body.notas || '') && /tour viejo/.test(ins.body.notas || ''),
    '🔒 el SELLO lo pone el SERVIDOR y se ANEXA a las notas propias — auditabilidad que el front no puede quitar');
  const antesT = red.llamadas.filter(c => c.u.includes('tours_pasados') && c.m === 'POST').length;
  r = await ht(ev({ accion: 'crear', usuario_id: OTRO_ID, artista: 'Feid' }, coordi));
  af(r.statusCode === 403 && red.llamadas.filter(c => c.u.includes('tours_pasados') && c.m === 'POST').length === antesT,
    'regresión: agregarle un tour a OTRO sigue siendo 403 sin INSERT');
  const roshi = jwtSign({ id: 'cccccccc-0000-0000-0000-000000000002', rol: 'maestro_roshi' }, process.env.JWT_SECRET, 3600);
  r = await ht(ev({ accion: 'crear', usuario_id: COORDI_ID, artista: 'Morat' }, roshi));
  ins = red.llamadas.filter(c => c.u.includes('tours_pasados') && c.m === 'POST').slice(-1)[0] || {};
  af(r.statusCode === 200 && !/capturado por la persona/.test((ins.body && ins.body.notas) || ''),
    'un admin capturando NO lleva sello (el sello distingue quién lo metió)');

  console.log('\n[C] los cables del front (hechos sobre el fuente)');
  const rep = fs.readFileSync(path.join(RAIZ, 'kamehouse-reportes.js'), 'utf8');
  const gz = fs.readFileSync(path.join(RAIZ, 'kamehouse-gz.js'), 'utf8');
  const eq = fs.readFileSync(path.join(RAIZ, 'kamehouse-equipo.js'), 'utf8');
  const mon = fs.readFileSync(path.join(RAIZ, 'kamehouse-montana.js'), 'utf8');
  const reqc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/requisicion-crear.js'), 'utf8');

  af(rep.includes('data-ticket=') && rep.includes('repTicketClick(this)'), '[tickets] cada renglón de gasto trae su 📎 con el path en data-ticket');
  af(rep.includes('row.dataset && row.dataset.ticket') && rep.includes('g.ticket_path = ticket'), 'leerGastosForm lleva el path DENTRO de gastos_detalle — cero columnas nuevas');
  af((() => { const b = rep.slice(rep.indexOf('function _repFotoB64'), rep.indexOf('function _repFotoB64') + 1400); return b.includes('FileReader') && b.includes('toDataURL') && !b.includes('createObjectURL'); })(),
    '🔒 la foto va por FileReader→canvas→data: — cero createObjectURL (la lección REQ-FOTO-1: el CSP no trae blob:)');
  af((rep.match(/repTicketAbrir\(/g) || []).length >= 3 && mon.includes("repTicketAbrir('"), 'el 🧾 se pinta en el detalle del coordi Y en Montaña — el revisor VE el ticket');
  af(rep.includes("accion: 'ticket_subir'") && rep.includes("accion: 'ticket_ver'"), 'el front habla las dos acciones del servidor');

  af(reqc.includes("require('./_lib/imagen-magia')") && !/function tipoPorMagia\(buf\) \{\n  if/.test(reqc),
    'la magia de imagen ganó UN dueño (_lib/imagen-magia): requisicion-crear la PIDE — dos copias serían dos listas que todavía no divergen');

  af(gz.includes('khTours.listar({ usuario_id: _histUid })') && gz.includes('Fuera del sistema'), '[historial] la pestaña Tours del GZ pinta el historial fuera del sistema');
  af(gz.includes("abrirAgregarTour('${_attrJs(_histUid)}')"), 'el botón REUSA el modal de Equipo — cero segundo formulario (catálogo de tipos/puntos con un dueño)');
  af((() => { const b = gz.slice(gz.indexOf('const anioHoy'), gz.indexOf('const anioHoy') + 120); return b.includes('getFullYear()'); })(),
    '🔒 el año que suma puntos se DERIVA del reloj, no se teclea — el hint no caduca en enero');
  af(gz.includes('solo historial (no suma puntos este año)'), 'un tour de otro año se ROTULA: se registra sin prometer puntos (regla de Memo)');
  af(gz.includes('async function gzHistEliminar') && gz.includes('khTours.eliminar(tourId)'), 'borrar el propio delega en el dueño (khTours) — el candado de propiedad vive en el servidor');
  af((() => { const b = gz.slice(gz.indexOf('function gzHistEliminar'), gz.indexOf('function gzHistEliminar') + 400); return b.includes('_gzVerComoId()') && b.includes('confirm('); })(),
    'en «Ver como» no se borra nada, y borrar pide confirmar');
  af(eq.includes("if (typeof loadGzTours === 'function' && document.getElementById('gzt-lista')) loadGzTours();"),
    'guardar desde el modal refresca la pestaña GZ, y el refresh de Equipo quedó en try (para el coordi esas pantallas no existen)');

  console.log('\n' + (ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
  process.exit(ko ? 1 : 0);
})();
