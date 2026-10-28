#!/usr/bin/env node
/* mide-contrato-cliente-2 — CONTRATO-CLIENTE-2 (27-oct-2026)
 * La firma del contrato del cliente vive en el PORTAL y NADIE elige quién firma.
 * Palabra de Memo: «si les das la opción de elegir quién firma pueden empezar a
 * falsificarnos». Se mide por el handler REAL (portal-contrato) con red falsa:
 *   [E] la edad (puro): cumpleaños exacto, un día antes, sin fecha.
 *   [A] apagado: firmar → 409 sin escribir; listar sí funciona.
 *   [F] la fecha: una sola vez (2º intento 409), futura/rara 400, ajena 404.
 *   [M] adulto: firma el VIAJERO con el nombre de su ficha aunque el cuerpo
 *       diga «madre» y traiga otro nombre; sin INE no firma; bytes que no son
 *       imagen rebotan; 2º clic idempotente.
 *   [m] menor: sin parentesco o sin nombre del tutor rebota; con ellos firma
 *       el tutor; el rol lo deriva la edad.
 *   [X] ajeno: contrato de otro correo → 404 sin escribir; sin correo
 *       verificado → 403.
 * ⚠️ SIN ANCLA (árbol de trabajo). */
'use strict';
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} const t = typeof m === 'function' ? m() : m; if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const JPG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]).toString('base64');
const TXT = 'data:image/jpeg;base64,' + Buffer.from('esto no es una imagen, es texto plano').toString('base64');
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
const hace = (anios, dias) => { const d = new Date(hoy + 'T12:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - anios); d.setUTCDate(d.getUTCDate() + (dias || 0)); return d.toISOString().slice(0, 10); };

let DB, USER;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
const dec = (u) => decodeURIComponent(u);
const eq = (q, c) => { const m = q.match(new RegExp('[?&]' + c + '=eq\\.([^&]*)')); return m ? m[1] : null; };
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = dec(String(url));
  if (u.includes('/auth/v1/user')) return USER ? resp(200, USER) : resp(401, {});
  if (u.includes('/storage/v1/object/contratos-cliente-ine/')) { DB.subidas.push(u); return resp(200, {}); }
  if (u.includes('/rest/v1/viajeros_evento')) {
    if (m === 'PATCH') {
      const id = eq(u, 'id'); const b = JSON.parse(init.body); DB.escrituras.push(['viajero', b]);
      const f = DB.v.filter((v) => v.id === id && (!/fecha_nacimiento=is\.null/.test(u) || v.fecha_nacimiento == null));
      f.forEach((v) => Object.assign(v, b)); return resp(200, f);
    }
    const il = (u.match(/correo=ilike\.([^&]*)/) || [])[1];
    return resp(200, DB.v.filter((v) => !il || String(v.correo || '').toLowerCase() === il.toLowerCase()));
  }
  if (u.includes('/rest/v1/contratos_cliente')) {
    let f = DB.c.slice();
    const id = eq(u, 'id'); if (id) f = f.filter((c) => c.id === id);
    const est = eq(u, 'estado'); if (est) f = f.filter((c) => c.estado === est);
    const ins = (u.match(/viajero_id=in\.\(([^)]*)\)/) || [])[1]; if (ins) { const l = ins.split(',').map((x) => x.replace(/"/g, '')); f = f.filter((c) => l.includes(c.viajero_id)); }
    if (/estado=neq\.anulado/.test(u)) f = f.filter((c) => c.estado !== 'anulado');
    if (m === 'PATCH') { const b = JSON.parse(init.body); DB.escrituras.push(['contrato', b]); f.forEach((c) => Object.assign(c, b)); return resp(200, f); }
    return resp(200, f);
  }
  return resp(200, []);
};
const semilla = () => ({ escrituras: [], subidas: [],
  v: [
    // [PORTAL-SOLO-1] Las filas del fixture nacen SELLADAS: desde el 27-oct el Portal solo toca lo revisado (la fila sin sello es 404, medido en mide:portal-solo-1). El arnés se actualiza a la verdad nueva.
    { id: U(1), portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'nsqkmty', nombre: 'Ana Pérez López', correo: 'Ana@Correo.mx', fecha_nacimiento: null },
    { id: U(2), portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'nsqkmty', nombre: 'Beto Pérez', correo: 'ana@correo.mx', fecha_nacimiento: null },
    { id: U(3), portal_revisado_at: '2026-10-27T00:00:00Z', evento_id: 'nsqkmty', nombre: 'Otra Persona', correo: 'otra@x.mx', fecha_nacimiento: hace(30) },
  ],
  c: [
    { id: U(11), viajero_id: U(1), estado: 'pendiente', datos: { nombre: 'Ana Pérez López', evento: 'NSQK', paquete_txt: 'PLUS', incluye: ['Boleto'], total: 5300, pagado: 300, saldo: 5000 } },
    { id: U(12), viajero_id: U(2), estado: 'pendiente', datos: { nombre: 'Beto Pérez', evento: 'NSQK', paquete_txt: 'CHEAP', incluye: ['Boleto'], total: 3600, pagado: 300, saldo: 3300 } },
    { id: U(13), viajero_id: U(3), estado: 'pendiente', datos: { nombre: 'Otra Persona', evento: 'NSQK' } },
  ] });
const cargar = (vivo) => {
  if (vivo) process.env.CONTRATO_CLIENTE_ARNES = '1'; else delete process.env.CONTRATO_CLIENTE_ARNES;
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  return require(path.join(RAIZ, 'netlify/functions/portal-contrato.js')).handler;
};
const llamar = async (H, b) => { const r = await H({ httpMethod: 'POST', headers: { authorization: 'Bearer jwt', 'user-agent': 'ua' }, body: JSON.stringify(b) }); return { s: r.statusCode, j: JSON.parse(r.body) }; };
const escritasC = () => DB.escrituras.filter((e) => e[0] === 'contrato').length;

(async () => {
  console.log('══ mide:contrato-cliente-2 ══\n[E] la edad');
  const cc = require(path.join(RAIZ, 'netlify/functions/_lib/contrato-cliente.js'));
  af(cc.edadEn('2008-10-27', '2026-10-27') === 18 && cc.edadEn('2008-10-28', '2026-10-27') === 17 && cc.edadEn(null, '2026-10-27') === null, 'cumple 18 HOY = 18 · un día antes = 17 · sin fecha = null');

  console.log('\n[A] apagado');
  DB = semilla(); USER = { email: 'ANA@correo.mx', email_confirmed_at: 'x' };
  let H = cargar(false);
  let r = await llamar(H, { accion: 'listar' });
  af(r.s === 200 && r.j.contratos.length === 2 && r.j.vivo === false, () => 'listar ve SUS 2 contratos (correo en mayúsculas casa) y dice vivo:false — ' + r.s);
  af(r.j.contratos.every((c) => c.firma === null && /Cancelaciones/.test(c.html)), 'sin fecha: la firma no se decide aún; el texto viene del servidor');
  r = await llamar(H, { accion: 'firmar', contrato_id: U(11), acepto: true, ine_frente: JPG, ine_reverso: JPG });
  af(r.s === 409 && escritasC() === 0 && DB.subidas.length === 0, 'apagado: firmar → 409, cero escrituras y cero fotos subidas');

  console.log('\n[F] la fecha de nacimiento (una sola vez)');
  H = cargar(true); DB = semilla();
  r = await llamar(H, { accion: 'fecha', viajero_id: U(1), fecha: '2999-01-01' });
  af(r.s === 400, 'fecha futura → 400');
  r = await llamar(H, { accion: 'fecha', viajero_id: U(3), fecha: '1990-01-01' });
  af(r.s === 404 && DB.v[2].fecha_nacimiento === hace(30), 'viajero de OTRA cuenta → 404, no se toca');
  r = await llamar(H, { accion: 'fecha', viajero_id: U(1), fecha: hace(30) });
  af(r.s === 200 && r.j.firma === 'titular' && DB.v[0].fecha_nacimiento === hace(30), 'adulto: se guarda y la firma queda «titular»');
  r = await llamar(H, { accion: 'fecha', viajero_id: U(1), fecha: hace(10) });
  af(r.s === 409 && DB.v[0].fecha_nacimiento === hace(30), '2º intento de cambiarla → 409 (ya no se mueve desde el Portal)');
  r = await llamar(H, { accion: 'fecha', viajero_id: U(2), fecha: hace(15) });
  af(r.s === 200 && r.j.firma === 'tutor', 'menor: la firma queda «tutor»');

  console.log('\n[M] adulto');
  r = await llamar(H, { accion: 'firmar', contrato_id: U(11), acepto: true, ine_frente: JPG });
  af(r.s === 400 && escritasC() === 0, 'sin INE de reverso → 400, nada se firma');
  r = await llamar(H, { accion: 'firmar', contrato_id: U(11), acepto: true, ine_frente: TXT, ine_reverso: JPG });
  af(r.s === 400 && /no es una imagen/.test(r.j.error) && escritasC() === 0, 'bytes que no son imagen → 400 (la extensión es una opinión)');
  r = await llamar(H, { accion: 'firmar', contrato_id: U(11), acepto: true, ine_frente: JPG, ine_reverso: JPG, parentesco: 'madre', tutor_nombre: 'Alguien Más', rol: 'madre' });
  const cA = DB.c[0];
  af(r.s === 200 && cA.estado === 'firmado' && cA.firmante_rol === 'titular' && cA.firmante_nombre === 'Ana Pérez López', 'firma el VIAJERO con el nombre de su ficha aunque el cuerpo diga «madre» — el rol NO se elige');
  af(cA.ine_frente_path && cA.ine_reverso_path && cA.edad_al_firmar === 30 && cA.fecha_nacimiento_usada === hace(30) && cA.firmado_por_correo === 'ana@correo.mx', 'queda la INE (2 fotos), la edad, la fecha usada y el correo VERIFICADO');
  const antes = escritasC();
  r = await llamar(H, { accion: 'firmar', contrato_id: U(11), acepto: true, ine_frente: JPG, ine_reverso: JPG });
  af(r.s === 200 && r.j.ya && escritasC() === antes, '2º clic: idempotente, cero escrituras');

  console.log('\n[m] menor');
  r = await llamar(H, { accion: 'firmar', contrato_id: U(12), acepto: true, ine_frente: JPG, ine_reverso: JPG, tutor_nombre: 'Laura Pérez' });
  af(r.s === 400 && DB.c[1].estado === 'pendiente', 'menor sin parentesco → 400');
  r = await llamar(H, { accion: 'firmar', contrato_id: U(12), acepto: true, ine_frente: JPG, ine_reverso: JPG, parentesco: 'madre', tutor_nombre: 'Laura' });
  af(r.s === 400 && DB.c[1].estado === 'pendiente', 'menor con nombre del tutor incompleto → 400');
  r = await llamar(H, { accion: 'firmar', contrato_id: U(12), acepto: true, ine_frente: JPG, ine_reverso: JPG, parentesco: 'madre', tutor_nombre: 'Laura  Pérez Gómez' });
  af(r.s === 200 && DB.c[1].firmante_rol === 'madre' && DB.c[1].firmante_nombre === 'Laura Pérez Gómez' && DB.c[1].edad_al_firmar === 15, 'menor: firma la mamá, con su nombre y la edad del viajero');

  console.log('\n[X] ajenos y sesión');
  r = await llamar(H, { accion: 'firmar', contrato_id: U(13), acepto: true, ine_frente: JPG, ine_reverso: JPG });
  af(r.s === 404 && DB.c[2].estado === 'pendiente', 'contrato de otro correo → 404 sin escribir');
  USER = { email: 'ana@correo.mx', email_confirmed_at: null };
  r = await llamar(H, { accion: 'listar' });
  af(r.s === 403, 'correo SIN verificar → 403');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('💥 el arnés se cayó: ' + e.stack); process.exit(1); });
