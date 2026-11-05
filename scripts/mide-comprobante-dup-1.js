#!/usr/bin/env node
/* =============================================================================
 * mide-comprobante-dup-1 — un comprobante YA registrado no vuelve a entrar
 * (COMPROBANTE-DUP-1, 5-nov-2026). Palabra de Memo: «es para evitar estafas».
 * Caso real: Erik Rivera Cruz re-subió desde su Portal el archivo de su separo.
 * Entra por el handler REAL de portal-viajero (subir_pago) con una red falsa que
 * modela el storage y la función de la base `comprobante_duplicado` con su MISMA
 * regla (lo vivo cuenta; lo RECHAZADO no). requisicion-crear se carea por su
 * cableado (orden: huella ANTES de subir; la huella viaja en la fila).
 * ⚠️ SIN ANCLA (árbol de trabajo): controles positivos por construcción.
 * ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
function af(ok, msg) { try { ok = typeof ok === 'function' ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } }

process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.JWT_SECRET = 'secreto';

const VK = 'aaaaaaaa-0000-4000-8000-000000000001';
const png = (n) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, n]);
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');

function red(opt) {
  opt = opt || {};
  const st = {
    viajeros: [{ id: VK, portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'fuerzaregida#1', nombre: 'Erik R', correo: 'erik@prueba.mx', tipo_paquete: 'plus', total_contrato: 5900, abonado_previo: 0 }],
    cambios: [], storage: {}, rpc: 0,
    registrados: new Set(opt.registrados || []),   // huellas de comprobantes YA vivos (requisición/abono)
    usuarios: { 'jwt-erik': { id: 'u1', email: 'erik@prueba.mx', email_confirmed_at: '2026-10-13' } },
  };
  let seq = 1;
  const resp = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const f = (url) => { const o = {}; for (const [k, v] of new URL(url).searchParams) o[k] = decodeURIComponent(v); return o; };
  const casa = (row, fl) => Object.entries(fl).every(([k, v]) => {
    if (['select', 'limit', 'order'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('ilike.')) return String(row[k] || '').toLowerCase() === v.slice(6).toLowerCase();
    return true; });
  st.fetch = async (url, init) => {
    init = init || {}; const m = (init.method || 'GET').toUpperCase(); url = String(url);
    if (url.startsWith('https://pt.falso.test/auth/v1/user')) {
      const t = ((init.headers || {}).Authorization || '').slice(7); return st.usuarios[t] ? resp(200, st.usuarios[t]) : resp(401, {}); }
    if (url.includes('/rest/v1/rpc/comprobante_duplicado')) {
      st.rpc++;
      if (opt.rpcCaido) return resp(500, { message: 'caído' });
      const h = JSON.parse(init.body).p_md5;
      // La MISMA regla del acta: cuenta lo vivo; una solicitud RECHAZADA no.
      const out = [];
      if (st.registrados.has(h)) out.push({ origen: 'requisicion', ref: 'R-BXTAF', creado: '2026-10-31' });
      st.cambios.filter((c) => c.tipo === 'pago' && c.estado !== 'rechazada' && c.foto_md5 === h)
        .forEach((c) => out.push({ origen: 'pago_portal', ref: c.estado, creado: 'hoy' }));
      return resp(200, out);
    }
    if (url.includes('/rest/v1/usuarios')) return resp(200, [{ activo: true, rol: 'bulma', sesiones_invalidas_antes: null }]);
    if (url.includes('/storage/v1/object/')) {
      const p = decodeURI(url.split('/storage/v1/object/')[1]);
      st.storage[p] = { bytes: init.body }; return resp(200, { Key: p });
    }
    const tabla = url.includes('/viajeros_evento') ? 'viajeros' : url.includes('/cambios_viajero') ? 'cambios' : null;
    if (!tabla) throw new Error('URL no contemplada ' + m + ' ' + url);
    const fl = f(url); const T = st[tabla];
    if (m === 'GET') return resp(200, T.filter((r) => casa(r, fl)).map((r) => Object.assign({}, r)));
    if (m === 'POST') { const row = Object.assign({ id: 'c-' + seq++, estado: 'pendiente' }, JSON.parse(init.body)); T.push(row); return resp(201, [row]); }
    throw new Error('método ' + m);
  };
  return st;
}
function fresco() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions')) delete require.cache[k]; });
  return require(path.join(RAIZ, 'netlify/functions/portal-viajero.js')).handler;
}
const ev = (body) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer jwt-erik' }, body: JSON.stringify(body) });
const subir = (pv, buf) => pv(ev({ accion: 'subir_pago', viajero_id: VK, comprobante_base64: buf.toString('base64') }));

(async () => {
  console.log('══ mide:comprobante-dup-1 ══\n[L] la huella');
  const CH = require(path.join(RAIZ, 'netlify/functions/_lib/comprobante-huella.js'));
  af(CH.huella(png(1)) === md5(png(1)), '[L1] huella = md5 de los BYTES');
  af(CH.huella(png(1)) !== CH.huella(png(2)), '[L2] un byte distinto → otra huella');
  af(CH.huella(null) === null && CH.huella(Buffer.alloc(0)) === null, '[L3] sin bytes → null (no se busca nada)');
  af(!/R-|folio|nombre/i.test(CH.MSG_PORTAL) && !/R-|nombre/i.test(CH.MSG_RESERVA), '[L4] 🔒 los mensajes al cliente son GENÉRICOS (no dicen de quién es el otro registro)');

  console.log('[P] Portal · subir_pago por el handler REAL');
  let st = red(); global.fetch = st.fetch; let pv = fresco();
  let r = await subir(pv, png(1));
  af(r.statusCode === 200 && st.cambios.length === 1 && Object.keys(st.storage).length === 1, `[P1] primera vez → 200, nace la solicitud y su objeto (${r.statusCode})`);
  af(st.cambios[0] && st.cambios[0].foto_md5 === md5(png(1)), '[P2] la solicitud guarda SU huella (foto_md5)');
  r = await subir(pv, png(1)); let j = JSON.parse(r.body);
  af(r.statusCode === 409 && j.duplicado === true && j.error === CH.MSG_PORTAL, `[P3] 🔒 el MISMO archivo otra vez → 409 duplicado con el mensaje genérico (${r.statusCode})`);
  af(st.cambios.length === 1 && Object.keys(st.storage).length === 1, '[P4] 🔒 el repetido NO sube objeto ni crea fila (la huella va ANTES de subir: cero huérfanos)');
  r = await subir(pv, png(2));
  af(r.statusCode === 200 && st.cambios.length === 2, '[P5] un comprobante DISTINTO entra normal');
  st.cambios[0].estado = 'rechazada';
  r = await subir(pv, png(1));
  af(r.statusCode === 200 && st.cambios.length === 3, '[P6] lo que el equipo RECHAZÓ ya no cuenta: el mismo archivo puede volver a entrar (la regla del acta)');

  st = red({ registrados: [md5(png(7))] }); global.fetch = st.fetch; pv = fresco();
  r = await subir(pv, png(7));
  af(r.statusCode === 409 && st.cambios.length === 0 && Object.keys(st.storage).length === 0, '[P7] 🔒 caso Erik: el archivo de su SEPARO (vivo en una requisición) → 409, sin fila ni objeto');

  st = red({ rpcCaido: true, registrados: [md5(png(7))] }); global.fetch = st.fetch; pv = fresco();
  const warn = console.warn; let avisos = 0; console.warn = () => { avisos++; };
  r = await subir(pv, png(7));
  console.warn = warn;
  af(r.statusCode === 200 && st.rpc === 1 && avisos >= 1, '[P8] base caída → el comprobante ENTRA (fail-open) y se registra en el log — lo revisa una persona igual');

  console.log('[Q] requisicion-crear · el cableado');
  const rc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/requisicion-crear.js'), 'utf8');
  const iDup = rc.indexOf('buscarDuplicado('), iUp = rc.indexOf('/storage/v1/object/${BUCKET}');
  af(iDup > 0 && iUp > 0 && iDup < iUp, '[Q1] la huella se busca ANTES de subir el comprobante');
  af(/comprobante_path, comprobante_tipo, comprobante_md5,/.test(rc), '[Q2] la fila guarda comprobante_md5');
  af(/MSG_RESERVA/.test(rc) && /json\(409/.test(rc.slice(iDup, iUp)), '[Q3] repetido → 409 con el mensaje de reservación');
  const sql = fs.readFileSync(path.join(RAIZ, 'migraciones/COMPROBANTE-DUP-1.sql'), 'utf8');
  af(/estado <> 'rechazada'/.test(sql) && /monto > 0/.test(sql), '[Q4] el acta: lo rechazado y lo anulado en $0 NO cuentan (re-mandar tras «zona agotada» sigue funcionando)');
  af(/grant execute on function public\.comprobante_duplicado\(text\) to service_role/.test(sql) && /revoke all .* anon, authenticated/.test(sql), '[Q5] la función solo la llama el servidor (service_role)');

  console.log(`\n${R ? '🔴' : '🟢'} ${V} en verde · ${R} en rojo`);
  if (!V) console.log('NADA MEDIDO · esto NO es un verde');
  process.exit(R || !V ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(1); });
