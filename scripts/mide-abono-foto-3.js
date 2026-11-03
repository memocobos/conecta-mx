// [ABONO-FOTO-3 · 3-nov-2026] El comprobante de KameHouse: el lector achica,
// acepta PDF, y DICE cuando no puede (antes: foto cruda de 4-8 MB que el gateway
// rebotaba antes de la function, y errores tragados). Sin ancla — árbol.
'use strict';
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
  af(/abonoCrear\(\{ viajero_id: v\.id, monto: montoFoto, foto, nota: 'Comprobante del alta manual', avisar: false \}\)/.test(caps), 'con foto el abonado entra como abono con ticket, sin correo');
  af(/abonado_previo: ''/.test(caps), 'y NO se cuenta dos veces como pagado-antes');

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
