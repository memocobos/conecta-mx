// [ABONO-HASH-1 · 4-nov-2026] El «#» del multifecha se comía el comprobante.
// Reporte de Bulma/Milk: «los comprobantes sí suben y guardan, pero cuando
// vuelves a buscar al cliente ya no aparecen». Medido en la base: 0 abonos de
// Capsule con foto, 1 objeto huérfano llamado «fuerzaregida» (sin carpeta) y
// 2 altas de FR con su abono PERDIDO (abonado 0, sin abonos).
//
// 🔴 LA LECCIÓN DEL INSTRUMENTO: los careos de ABONO-FOTO-3/4 tenían una red
// falsa que hacía decodeURIComponent(url) y partía por el bucket — o sea que el
// «#» llegaba INTACTO al «storage» y el arnés afirmaba como CORRECTO un path
// «frontera#0/…». Un fetch real trata el «#» como FRAGMENTO y lo corta. Aquí el
// storage falso se modela como el real: `new URL(url).pathname` (el fragmento
// muere), nombre del objeto = el pathname decodificado, y un POST a un nombre
// que ya existe REBOTA (sin x-upsert).
//
// Control positivo: el árbol de BASE (2639ad9) reproduce el defecto con ESTA
// red — el objeto nace «fuerzaregida» y no casa con el foto_path guardado.
'use strict';
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const RAIZ = path.join(__dirname, '..');
const BASE = process.env.BASE_SHA || '2639ad9';
let v = 0, r = 0; const af = (c, m) => { try { if (typeof c === 'function' ? c() : c) v++; else { r++; console.log('  ✗ ' + m); } } catch (e) { r++; console.log('  ✗ ' + m + ' · truena: ' + e.message); } };
const resp = (st, b) => ({ ok: st < 300, status: st, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });

const VJ = '11111111-2222-3333-4444-555555555555';
let W;
function mundo(evento) {
  W = { evento, objetos: new Map(), abonos: [], viajero: null, patches: [], storageCaido: false };
}
const INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const s = String(url);
  if (s.includes('/index.html') || /conectareynosa\.mx\/?$/.test(s)) return resp(200, INDEX);
  if (s.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'maestro_roshi' }]);
  if (s.includes('/rest/v1/eventos_meta')) return resp(200, [{ slug: 'fuerzaregida' }]);
  if (s.includes('/rest/v1/stock_ajustes') || s.includes('/rest/v1/contratos_cliente')) return resp(200, []);
  if (s.includes('/storage/v1/object/')) {
    // EL STORAGE COMO EL REAL: el fragmento (#…) no viaja en la petición.
    const pn = new URL(s).pathname;
    const firma = pn.includes('/object/sign/');
    const nombre = decodeURIComponent(pn.split(firma ? '/object/sign/abonos-viajeros/' : '/object/abonos-viajeros/')[1] || '');
    if (firma) return W.objetos.has(nombre) ? resp(200, { signedURL: '/object/sign/abonos-viajeros/' + encodeURIComponent(nombre) + '?token=t' }) : resp(400, { error: 'not_found' });
    if (m === 'POST') {
      if (W.storageCaido) return resp(500, { error: 'caído' });
      if (W.objetos.has(nombre)) return resp(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      W.objetos.set(nombre, true); return resp(200, { Key: nombre });
    }
    return resp(200, {});
  }
  if (s.includes('/rest/v1/abonos_viajero')) {
    if (m === 'POST') { const f = Object.assign({ id: 'ab-' + (W.abonos.length + 1) }, JSON.parse(init.body)); W.abonos.push(f); return resp(201, [f]); }
    return resp(200, W.abonos.slice());
  }
  if (s.includes('/rest/v1/viajeros_evento')) {
    if (m === 'POST') { W.viajero = Object.assign({ id: VJ, notas: null }, JSON.parse(init.body)); return resp(201, [Object.assign({}, W.viajero)]); }
    if (m === 'PATCH') {
      const u = decodeURIComponent(s); const p = JSON.parse(init.body); W.patches.push({ u, p });
      if (/abonado_previo=eq\.0/.test(u) && Number(W.viajero.abonado_previo) !== 0) return resp(200, []);
      Object.assign(W.viajero, p); return resp(200, [Object.assign({}, W.viajero)]);
    }
    return resp(200, [Object.assign({ id: VJ, evento_id: W.evento }, W.viajero || {})]);
  }
  if (s.includes('api.resend.com')) return resp(200, { id: 'x' });
  return resp(200, []);
};

function cargar(dir) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(dir)) delete require.cache[k];
  return require(path.join(dir, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
}
function arbolBase() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ahash-'));
  cp.execSync(`git -C "${RAIZ}" archive ${BASE} netlify/functions | tar -x -C "${tmp}"`);
  return tmp;
}
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const tok = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'bulma@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
const jpg = (n) => 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, n, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).toString('base64');
const llamar = (H, b) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(b) });
const crearAbono = (H, n) => llamar(H, { accion: 'abono_crear', viajero_id: VJ, monto: 300, foto: jpg(n), avisar: false });
const alta = (H, x) => llamar(H, Object.assign({ accion: 'viajero_migrar', evento_id: 'fuerzaregida#0', nombre: 'Prueba Arnés', correo: 'prueba@x.mx', tipo_paquete: 'ride', total_contrato: 2700, abonado_previo: '500', foto: jpg(9), contrato: false }, x));

(async () => {
  console.log('[0] control positivo: BASE (' + BASE + ') reproduce el defecto con esta red');
  const dirB = arbolBase();
  const HB = cargar(dirB);
  mundo('fuerzaregida#0');
  let res = await crearAbono(HB, 1);
  const fpB = (W.abonos[0] || {}).foto_path || '';
  af(res.statusCode === 200 && fpB.includes('#'), 'BASE guarda un foto_path con «#»: ' + fpB);
  af(W.objetos.has('fuerzaregida') && !W.objetos.has(fpB), 'BASE: el objeto nace «fuerzaregida» y el path guardado NO existe (el comprobante «desaparece»)');
  res = await crearAbono(HB, 2);
  af(res.statusCode === 502, 'BASE: el SEGUNDO comprobante del mismo evento choca con el huérfano → 502: ' + res.statusCode);
  mundo('fuerzaregida#0');
  W.objetos.set('fuerzaregida', true); // el huérfano que ya existe en producción
  res = await alta(HB);
  af(res.statusCode === 200 && W.viajero && Number(W.viajero.abonado_previo) === 0 && W.abonos.length === 0, 'BASE: alta con foto en FR → abonado 0 y CERO abonos (el dinero se pierde) — como Jessica y Veronica');

  console.log('[A] HEAD: el comprobante de un multifecha vive donde dice su fila');
  const H = cargar(RAIZ);
  mundo('fuerzaregida#0');
  res = await crearAbono(H, 1);
  const fp = (W.abonos[0] || {}).foto_path || '';
  af(res.statusCode === 200 && !fp.includes('#'), 'el foto_path ya no lleva «#»: ' + fp);
  af(/^fuerzaregida_0\/11111111-2222-3333-4444-555555555555\/.+\.jpg$/.test(fp), 'la carpeta es «fuerzaregida_0»: ' + fp);
  af(W.objetos.has(fp), 'el objeto existe CON EL MISMO nombre que guarda la fila');
  res = await crearAbono(H, 2);
  const fp2 = (W.abonos[1] || {}).foto_path || '';
  af(res.statusCode === 200 && W.objetos.has(fp2) && fp2 !== fp, 'el segundo comprobante del mismo evento también sube (objeto propio)');
  mundo('nsqkmty');
  res = await crearAbono(H, 3);
  af(/^nsqkmty\//.test((W.abonos[0] || {}).foto_path || ''), 'regresión: un evento de una fecha conserva su carpeta tal cual');

  console.log('[B] HEAD: el alta en FR con foto (el caso de Jessica y Veronica)');
  mundo('fuerzaregida#0');
  W.objetos.set('fuerzaregida', true);
  res = await alta(H);
  let j = JSON.parse(res.body);
  af(res.statusCode === 200 && W.abonos.length === 1 && W.abonos[0].monto === 500 && W.objetos.has(W.abonos[0].foto_path), 'nace UN abono de $500 cuyo objeto existe: ' + JSON.stringify(W.abonos[0] || null));
  af(Number(W.viajero.abonado_previo) === 0 && !j.abono_error, 'pagado-antes 0 (el dinero vive en el abono, no doble)');

  console.log('[C] HEAD: si el storage se cae, el DINERO no se pierde');
  mundo('fuerzaregida#0');
  W.storageCaido = true;
  res = await alta(H); j = JSON.parse(res.body);
  af(res.statusCode === 200 && W.abonos.length === 0, 'sin storage no nace abono');
  af(Number(W.viajero.abonado_previo) === 500, 'el monto queda como pagado-antes: ' + (W.viajero && W.viajero.abonado_previo));
  af(W.patches.length === 1 && /abonado_previo=eq\.0/.test(W.patches[0].u), 'el respaldo va con VALOR ESPERADO (abonado_previo=eq.0)');
  af(/pagado-antes/.test(W.viajero.notas || '') && /SÍ quedó guardado/.test(j.abono_error || ''), 'la nota y la respuesta lo DICEN: ' + j.abono_error);
  W.storageCaido = false;
  mundo('fuerzaregida#0');
  res = await alta(H, { foto: undefined });
  af(Number(W.viajero.abonado_previo) === 500 && W.patches.length === 0, 'regresión: sin foto, pagado-antes como siempre y cero parches');

  console.log('[D] la fuente');
  const src = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');
  const sinCom = src.replace(/\/\/.*$/gm, '');
  af(!/storage\/v1\/object\/[^`]*\$\{encodeURI\(/.test(sinCom), 'ninguna URL de storage del archivo usa encodeURI (no escapa «#»)');
  af((sinCom.match(/_carpetaEvento\(/g) || []).length >= 4, 'los tres paths de abono piden la carpeta al dueño');
  const pv = fs.readFileSync(path.join(RAIZ, 'netlify/functions/portal-viajero.js'), 'utf8');
  af(!/sign\/abonos-viajeros\/\$\{encodeURI\(/.test(pv), 'el Portal firma el comprobante escapando por segmento');
  const cap = fs.readFileSync(path.join(RAIZ, 'kamehouse-capsule.js'), 'utf8');
  af(/SÍ quedó guardado/.test(cap), 'la pantalla del alta distingue «dinero guardado, falta la foto»');

  console.log(`\n${r ? '🔴' : '✅'} ${v} en verde · ${r} en rojo`); process.exit(r ? 1 : 0);
})();
