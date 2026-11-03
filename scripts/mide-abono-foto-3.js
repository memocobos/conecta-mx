// [ABONO-FOTO-3 · 3-nov-2026] El comprobante de KameHouse: el lector achica,
// acepta PDF, y DICE cuando no puede (antes: foto cruda de 4-8 MB que el gateway
// rebotaba antes de la function, y errores tragados). Sin ancla — árbol.
'use strict';
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let v = 0, r = 0; const af = (c, m) => { if (c) v++; else { r++; console.log('  ✗ ' + m); } };
const src = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
const corta = (n) => { const i = src.indexOf(n); let j = src.indexOf('{', i), d = 0; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; } return src.slice(i, j + 1); };
const codigo = 'const _VJ3_ORIGINAL_MAX = 4.2*1024*1024;\n' + corta('function _vj3LienzoVacio(') + '\n' + corta('function _vj3LeerFoto(');
function mundo({ tipo, nombre, size, data, decodeFalla, imgFalla, pinta }) {
  const ctx = { Promise, Math, Number, String, Error };
  ctx.FileReader = function () { this.readAsDataURL = () => setTimeout(() => { this.result = data; this.onload(); }, 0); };
  ctx.Image = function () { const self = this; this.naturalWidth = 4000; this.naturalHeight = 3000;
    Object.defineProperty(this, 'src', { set() { setTimeout(() => imgFalla ? self.onerror() : self.onload(), 0); } });
    this.decode = () => decodeFalla ? Promise.reject(new Error('x')) : Promise.resolve(); };
  ctx.document = { createElement: () => { const c = { width: 0, height: 0, getContext: () => ({ drawImage() { c.pintado = true; }, getImageData: () => ({ data: new Uint8ClampedArray(c.width * c.height * 4).fill(pinta ? 200 : 0) }) }), toDataURL: () => 'data:image/jpeg;base64,CHICA' }; return c; } };
  vm.createContext(ctx); vm.runInContext(codigo, ctx);
  return ctx._vj3LeerFoto({ files: [{ type: tipo, name: nombre, size }] });
}
(async () => {
  console.log('[A] el lector de KameHouse');
  af((await (async () => { const ctx = { Promise }; vm.createContext(ctx); vm.runInContext(codigo, ctx); return ctx._vj3LeerFoto({ files: [] }); })()) === null, 'sin archivo → null');
  const big = await mundo({ tipo: 'image/jpeg', name: 'a.jpg', size: 7e6, data: 'data:image/jpeg;base64,GRANDE', pinta: true });
  af(big === 'data:image/jpeg;base64,CHICA', 'una foto de 7 MB se manda ACHICADA, no cruda: ' + big);
  let e1 = null; try { await mundo({ tipo: 'image/heic', name: 'a.heic', size: 3e6, data: 'data:image/heic;base64,X', imgFalla: true }); } catch (e) { e1 = e.message; }
  af(/HEIC|captura/.test(e1 || ''), 'HEIC que no abre → mensaje con palabras, no null: ' + e1);
  const neg = await mundo({ tipo: 'image/jpeg', name: 'a.jpg', size: 1e6, data: 'data:image/jpeg;base64,ORIG', pinta: false });
  af(neg === 'data:image/jpeg;base64,ORIG', 'lienzo sin pintar + original chico → manda el ORIGINAL (FOTO-NEGRA-1)');
  let e2 = null; try { await mundo({ tipo: 'image/jpeg', name: 'a.jpg', size: 6e6, data: 'data:image/jpeg;base64,ORIG', pinta: false }); } catch (e) { e2 = e.message; }
  af(/captura/.test(e2 || ''), 'lienzo sin pintar + original grande → rechaza, jamás negro: ' + e2);
  const pdf = await mundo({ tipo: 'application/pdf', name: 'c.pdf', size: 2e5, data: 'data:application/pdf;base64,JVBERi0=' });
  af(/^data:application\/pdf;base64,/.test(pdf), 'PDF chico viaja tal cual');
  let e3 = null; try { await mundo({ tipo: 'application/pdf', name: 'c.pdf', size: 9e6, data: 'data:application/pdf;base64,X' }); } catch (e) { e3 = e.message; }
  af(/PDF pesa/.test(e3 || ''), 'PDF grande → se dice');
  const sinDecode = await mundo({ tipo: 'image/png', name: 'a.png', size: 1e5, data: 'data:image/png;base64,P', decodeFalla: true, pinta: true });
  af(sinDecode === 'data:image/jpeg;base64,CHICA', 'decode() que falla igual dibuja');

  console.log('[B] los tres lectores atrapan el rechazo');
  const mont = fs.readFileSync(path.join(RAIZ, 'kamehouse-montana.js'), 'utf8'), caps = fs.readFileSync(path.join(RAIZ, 'kamehouse-capsule.js'), 'utf8');
  const todos = src + mont + caps;
  af(!/const foto = await _vj3LeerFoto/.test(todos), 'ningún lector sin try (el rechazo sería una promesa perdida)');
  af((todos.match(/try \{ foto = await _vj3LeerFoto/g) || []).length === 4, 'abono · cobranza · montaña · alta manual');
  af((src.match(/accept="image\/\*,application\/pdf"/g) || []).length === 2 && /accept="image\/\*,application\/pdf"/.test(mont), 'los inputs aceptan PDF');

  console.log('[C] el alta manual');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(/id="mig-foto" type="file"/.test(html), 'el formulario trae COMPROBANTE');
  af(/d = Object\.assign\(\{\}, d, \{ foto \}\)/.test(caps) && !/abonoCrear\(\{ viajero_id: v\.id/.test(caps), 'la pantalla manda la foto DENTRO del alta (no un segundo abono después)');

  console.log('[E] el alta con comprobante, por el handler REAL: el abono nace ANTES del contrato');
  const INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const resp = (st, b) => ({ ok: st < 300, status: st, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
  let SEQ = [];
  global.fetch = async (url, init) => {
    init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = String(url);
    if (u.includes('/index.html') || /conectareynosa\.mx\/?$/.test(u)) return resp(200, INDEX);
    if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'maestro_roshi' }]);
    if (u.includes('/rest/v1/eventos_meta')) return resp(200, [{ slug: 'juniorh' }]);
    if (u.includes('/rest/v1/stock_ajustes')) return resp(200, []);
    if (u.includes('/storage/v1/object/')) { SEQ.push('storage:' + m); return resp(200, {}); }
    if (u.includes('/rest/v1/abonos_viajero')) { SEQ.push('abonos:' + m); if (m === 'POST') { const f = Object.assign({ id: 'a-1' }, JSON.parse(init.body)); SEQ.abono = f; return resp(201, [f]); } return resp(200, SEQ.abono ? [SEQ.abono] : []); }
    if (u.includes('/rest/v1/contratos_cliente')) { SEQ.push('contratos:' + m); return resp(200, []); }
    if (u.includes('/rest/v1/viajeros_evento')) { if (m === 'POST') { const f = Object.assign({ id: '11111111-2222-3333-4444-555555555555' }, JSON.parse(init.body)); SEQ.push('viajero:POST'); SEQ.viajero = f; return resp(201, [f]); } return resp(200, SEQ.viajero ? [SEQ.viajero] : []); }
    if (u.includes('api.resend.com')) { SEQ.push('resend'); return resp(200, { id: 'x' }); }
    return resp(200, []);
  };
  const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const tok = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'memo@x.mx', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
  const jpg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).toString('base64');
  const migrar = (x) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok },
    body: JSON.stringify(Object.assign({ accion: 'viajero_migrar', evento_id: 'juniorh', nombre: 'Prueba Arnés', correo: 'prueba@x.mx', tipo_paquete: 'ride', total_contrato: 2700, abonado_previo: '500' }, x)) });
  let res = await migrar({ foto: jpg });
  let j = JSON.parse(res.body);
  af(res.statusCode === 200 && SEQ.viajero && SEQ.viajero.abonado_previo === 0, 'con foto el viajero nace con pagado-antes 0 (no se cuenta dos veces): ' + res.statusCode + ' ' + res.body.slice(0, 120));
  af(SEQ.abono && SEQ.abono.monto === 500 && /^juniorh\/11111111-2222-3333-4444-555555555555\/.+\.jpg$/.test(SEQ.abono.foto_path), 'nace UN abono de $500 con su foto: ' + JSON.stringify(SEQ.abono || null));
  const iA = SEQ.indexOf('abonos:POST'), iC = SEQ.findIndex((x) => /^contratos/.test(x));
  af(iA >= 0 && iC >= 0 && iA < iC, 'el abono se escribe ANTES de que el contrato se emita: ' + SEQ.join(' → ') + ' · contrato=' + JSON.stringify(j.contrato));
  af(j.abono && !j.abono_error, 'la respuesta trae el abono y ningún error');
  SEQ = [];
  res = await migrar({ foto: jpg, abonado_previo: '' });
  af(res.statusCode === 400 && !SEQ.includes('viajero:POST'), 'foto sin monto → 400 y NO nace el viajero');
  SEQ = [];
  res = await migrar({ foto: 'data:image/jpeg;base64,' + Buffer.from('<html>').toString('base64') });
  af(res.statusCode === 400 && !SEQ.includes('viajero:POST'), 'comprobante basura → 400 y NO nace el viajero');
  SEQ = [];
  res = await migrar({});
  af(res.statusCode === 200 && SEQ.viajero.abonado_previo === 500 && !SEQ.includes('abonos:POST'), 'regresión: SIN foto, todo como siempre (pagado-antes $500, cero abonos)');

  console.log('[D] el servidor');
  const s = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');
  const fn = s.slice(s.indexOf('function _decodeImagen('), s.indexOf('\n}\n', s.indexOf('function _decodeImagen(')) + 2);
  const ctx = { Buffer, require: (p) => require(path.join(RAIZ, 'netlify/functions', p)), FOTO_MAX_BYTES: 6 * 1024 * 1024 };
  vm.createContext(ctx); vm.runInContext(fn, ctx);
  const b64 = (buf) => buf.toString('base64');
  af(ctx._decodeImagen('data:application/pdf;base64,' + b64(Buffer.from('%PDF-1.4 hola mundo'))).ext === 'pdf', 'PDF entra');
  af(ctx._decodeImagen('data:image/jpeg;base64,' + b64(Buffer.from([0xff, 0xd8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).ext === 'jpg', 'JPG entra');
  af(!!ctx._decodeImagen('data:image/jpeg;base64,' + b64(Buffer.from('<html>no soy foto</html>'))).error, 'texto con rótulo de foto rebota por BYTES');
  console.log(`\n${r ? '🔴' : '✅'} ${v} en verde · ${r} en rojo`); process.exit(r ? 1 : 0);
})();
