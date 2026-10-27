#!/usr/bin/env node
/* mide-contrato-cliente-1 — CONTRATO-CLIENTE-1 (27-oct-2026)
 * El contrato del cliente: texto con punto final de Memo, emisión por los tres
 * caminos, correo con link, firma por token.
 *   [T] el TEXTO dice lo que Memo firmó (posposición sin reembolso, menores,
 *       anexo de preventa SOLO para preventa, cláusula del viaje).
 *   [E] emitirContratos: crea, un correo por DIRECCIÓN, sin correo → link,
 *       preventa a ciegas y staff NO, no reenvía solo, firmado no se reescribe.
 *   [F] contrato-cliente (handler REAL): ver · firmar exige rol/nombre/acepto ·
 *       2º clic idempotente · anulado 410 · token malo 400.
 *   [H] los tres caminos le preguntan al dueño (handler real de elegir paquete
 *       devuelve `contrato`).
 * 🔒 Ni un correo real: Resend se cuenta en la red falsa, con control positivo.
 * ⚠️ SIN ANCLA (árbol de trabajo). */
'use strict';
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.RESEND_API_KEY = 're_falsa';
process.env.CORREOS_MODO = 'real';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + (typeof m === 'function' ? m() : m)); } else { R++; console.log('  ✗ ' + (typeof m === 'function' ? m() : m)); } };

const INDEX = `<script>var EV=[{id:'nsqkmty',a:'NSQK - Mosca World Tour',f:'9 abr 2027',ds:'2027-04-09',v:'Arena Monterrey, Mty',st:'',inc:['Boleto zona elegida','Transporte Reynosa-Mty','Hospedaje compartido','Kit Conecta'],sep:300,sepCheap:300,ride:2700,zonas:[{n:'Oro',p:5500},{n:'General',p:5300}],cheapZonas:[{n:'Oro',p:3800},{n:'General',p:3600}],hotel:[]}];</script>`;
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
let DB, RESEND;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
const dec = (u) => decodeURIComponent(u);
const inIds = (q, campo) => { const m = q.match(new RegExp(campo + '=in\\.\\(([^)]*)\\)')); return m ? m[1].split(',').map((x) => x.replace(/"/g, '')) : null; };
const eq = (q, campo) => { const m = q.match(new RegExp('[?&]' + campo + '=eq\\.([^&]*)')); return m ? m[1] : null; };
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = dec(String(url));
  if (u.includes('api.resend.com')) { RESEND.push(JSON.parse(init.body)); return resp(200, { id: 'em_' + RESEND.length }); }
  if (u.includes('/index.html') || /conectareynosa\.mx\/?($|\?)/.test(u)) return resp(200, INDEX);
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'maestro_roshi' }]);
  if (u.includes('/rest/v1/viajeros_evento')) {
    const ids = inIds(u, 'id'); const id1 = eq(u, 'id');
    let f = DB.v.filter((x) => (!ids || ids.includes(x.id)) && (!id1 || x.id === id1));
    if (m === 'PATCH') {
      const q = u; f = f.filter((x) => (!eq(q, 'tipo_paquete') || x.tipo_paquete === eq(q, 'tipo_paquete')) && (!eq(q, 'total_contrato') || Number(x.total_contrato) === Number(eq(q, 'total_contrato'))));
      const b = JSON.parse(init.body); f.forEach((x) => Object.assign(x, b)); return resp(200, f);
    }
    return resp(200, f);
  }
  if (u.includes('/rest/v1/abonos_viajero')) { const ids = inIds(u, 'viajero_id'); return resp(200, DB.ab.filter((a) => !ids || ids.includes(a.viajero_id))); }
  if (u.includes('/rest/v1/contratos_cliente')) {
    if (m === 'POST') {
      const b = JSON.parse(init.body);
      if (!/^[a-f0-9]{48}$/.test(b.token)) return resp(400, { message: 'check token' });
      if (DB.c.some((c) => c.viajero_id === b.viajero_id && c.estado !== 'anulado')) return resp(409, { code: '23505' });
      const fila = Object.assign({ id: U(900 + DB.c.length), envios: 0, firmado_at: null }, b); DB.c.push(fila); return resp(201, [fila]);
    }
    let f = DB.c.slice();
    const ids = inIds(u, 'viajero_id'); if (ids) f = f.filter((c) => ids.includes(c.viajero_id));
    if (/estado=neq\.anulado/.test(u)) f = f.filter((c) => c.estado !== 'anulado');
    const est = eq(u, 'estado'); if (est) f = f.filter((c) => c.estado === est);
    const id = eq(u, 'id'); if (id) f = f.filter((c) => c.id === id);
    const tk = eq(u, 'token'); if (tk) f = f.filter((c) => c.token === tk);
    if (m === 'PATCH') { const b = JSON.parse(init.body); DB.patchC.push(b); f.forEach((c) => Object.assign(c, b)); return resp(200, f); }
    if (m === 'DELETE') throw new Error('DELETE prohibido');
    return resp(200, f);
  }
  if (u.includes('/rest/v1/compras') || u.includes('/rest/v1/stock_ajustes')) return resp(200, []);
  return resp(200, []);
};
const semilla = () => ({ patchC: [], ab: [{ viajero_id: U(1), monto: 300 }], c: [], v: [
  { id: U(1), evento_id: 'nsqkmty', nombre: 'Ana Pérez', correo: 'Ana@Correo.mx', tipo_paquete: 'plus', zona_boleto: 'Oro', boletos: 1, total_contrato: 5500, abonado_previo: 0 },
  { id: U(2), evento_id: 'nsqkmty', nombre: 'Beto Pérez', correo: 'ana@correo.mx', tipo_paquete: 'plus', zona_boleto: 'Oro', boletos: 1, total_contrato: 5500, abonado_previo: 0 },
  { id: U(3), evento_id: 'nsqkmty', nombre: 'Caro Sin Correo', correo: null, tipo_paquete: 'cheap', zona_boleto: 'General', boletos: 1, total_contrato: 3600, abonado_previo: 1000 },
  { id: U(4), evento_id: 'nsqkmty', nombre: 'Dani Preventa', correo: 'dani@x.mx', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', boletos: 1, total_contrato: 300, abonado_previo: 300 },
  { id: U(5), evento_id: 'nsqkmty', nombre: 'Coordi Staff', correo: 'staff@x.mx', tipo_paquete: 'plus', zona_boleto: 'Oro', boletos: 1, total_contrato: 0, tipo_viajero: 'coordinador' },
] });
const L = () => { for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k]; return require(path.join(RAIZ, 'netlify/functions/_lib/contrato-cliente.js')); };
const KH = { KH_URL: 'https://kh.falso.test', KH_KEY: 'svc' };

(async () => {
  console.log('══ mide:contrato-cliente-1 ══\n[I] el interruptor APAGADO (CONTRATO-CLIENTE-1b)');
  {
    delete process.env.CONTRATO_CLIENTE_ARNES;
    DB = semilla(); RESEND = []; const l0 = L();
    const r0 = await l0.emitirContratos(Object.assign({ viajeroIds: [U(1), U(2), U(3)] }, KH));
    af(r0.apagado === true && DB.c.length === 0 && RESEND.length === 0, 'apagado: no nace NINGÚN contrato ni sale correo');
    // ⚰️ La firma pública (contrato-cliente.js) se RETIRÓ en CONTRATO-CLIENTE-2:
    // se firma en el Portal; su careo vive en mide:contrato-cliente-2.
    af(!fs.existsSync(path.join(RAIZ, 'netlify/functions/contrato-cliente.js')) && !fs.existsSync(path.join(RAIZ, 'contrato-cliente.html')), 'la firma pública por token ya no existe (se firma en el Portal)');
    const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
    af(/const KH_CONTRATO_CLIENTE_VIVO = false;/.test(kh), 'la pantalla también lo esconde (espejo apagado)');
  }
  process.env.CONTRATO_CLIENTE_ARNES = '1';
  console.log('\n[T] el texto (de aquí en adelante, camino ENCENDIDO solo para el arnés)');
  let lib = L();
  const base = { nombre: 'Ana', paquete: 'plus', paquete_txt: 'PLUS', incluye: ['Boleto'], con_transporte: true, total: 5500, pagado: 300, saldo: 5200, evento: 'NSQK', folio: 'X' };
  const txt = (d) => lib.clausulas(d).map((c) => c.t + ' ' + c.items.join(' ')).join(' ');
  const t0 = txt(base);
  af(/pospone.*no hay reembolso/i.test(t0) && /única opción es <b>transferir tu lugar/.test(t0), 'posposición: sin reembolso, solo transferir (palabra de Memo)');
  af(/mamá, papá o tutor/.test(t0), 'menores: firma mamá, papá o tutor');
  af(/punto de reunión/.test(t0) && /objetos personales/.test(t0), 'la cláusula del viaje se queda');
  af(!/Preventa a ciegas/.test(t0), 'sin preventa NO sale el anexo');
  const tp = txt(Object.assign({}, base, { preventa: true }));
  af(/\$300<\/b> de la preventa <b>cuenta como abono/.test(tp) && /segunda persona/.test(tp) && /otra zona del mismo precio/.test(tp), 'con preventa SÍ sale el anexo (los 3 puntos)');
  af(!/punto de reunión/.test(txt(Object.assign({}, base, { paquete: 'cheap', paquete_txt: 'CHEAP', con_transporte: false }))), 'CHEAP sin transporte no promete punto de reunión');
  af(JSON.stringify(lib.incluyeDe({ inc: ['Boleto zona elegida', 'Transporte Reynosa-Mty', 'Hospedaje compartido', 'Kit Conecta'] }, 'cheap')) === '["Boleto zona elegida","Kit Conecta"]', 'el «incluye» de CHEAP es el mismo filtro que el sitio');
  af(lib.motivoSinContrato({ tipo_viajero: 'coordinador', total_contrato: 5 }) && lib.motivoSinContrato({ total_contrato: 300, zona_boleto: 'Preventa a ciegas' }) && !lib.motivoSinContrato({ total_contrato: 5500, zona_boleto: 'Oro', boletos: 1 }), 'staff y preventa a ciegas no llevan contrato; cliente normal sí');
  af(!/<script/i.test(lib.renderContratoHTML(Object.assign({}, base, { nombre: '<script>x</script>' }))), 'el nombre se escapa en el HTML');

  console.log('\n[E] la emisión');
  DB = semilla(); RESEND = []; lib = L();
  let r = await lib.emitirContratos(Object.assign({ viajeroIds: [U(1), U(2), U(3), U(4), U(5)], creado_por: 'bulma@x' }, KH));
  af(r.creados === 3, () => 'nacen 3 contratos (Ana, Beto, Caro) — salió ' + r.creados);
  af(RESEND.length === 1 && RESEND[0].to[0] === 'ana@correo.mx', () => 'UN correo para la dirección compartida (control positivo: el contador ve envíos) — ' + RESEND.length);
  af(RESEND.length === 1 && /conectareynosa\.mx\/portal/.test(RESEND[0].html) && /Ana Pérez/.test(RESEND[0].html) && /Beto Pérez/.test(RESEND[0].html), 'ese correo lleva al PORTAL y nombra a los DOS (Ana y Beto)');
  af(r.sin_correo.length === 1 && r.sin_correo[0].nombre === 'Caro Sin Correo', 'sin correo → se DICE (sin correo no hay Portal donde firmar)');
  af(r.saltados.length === 2 && r.saltados.some((s) => /preventa/.test(s.motivo)) && r.saltados.some((s) => /cliente/.test(s.motivo)), 'preventa a ciegas y staff: saltados CON motivo');
  const cAna = DB.c.find((c) => c.viajero_id === U(1));
  af(cAna && cAna.correo === 'ana@correo.mx' && cAna.datos.total === 5500 && cAna.datos.pagado === 300 && cAna.datos.saldo === 5200, 'la foto: correo en minúsculas, total/pagado/saldo por saldoMigrado');
  af(cAna && cAna.envios === 1 && cAna.enviado_at, 'se sella enviado DESPUÉS del envío');
  RESEND = [];
  r = await lib.emitirContratos(Object.assign({ viajeroIds: [U(1)] }, KH));
  af(RESEND.length === 0 && r.creados === 0 && r.refrescados === 1, 'segunda emisión: refresca el pendiente y NO reenvía solo');
  r = await lib.emitirContratos(Object.assign({ viajeroIds: [U(1)], reenviar: true }, KH));
  af(RESEND.length === 1, 'reenviar:true sí manda');
  cAna.estado = 'firmado'; cAna.firmado_at = 'x'; cAna.firmante_nombre = 'Ana Pérez'; cAna.firmante_rol = 'titular';
  DB.v[0].total_contrato = 6000; RESEND = []; const nPatch = DB.patchC.length;
  r = await lib.emitirContratos(Object.assign({ viajeroIds: [U(1)], reenviar: true }, KH));
  af(RESEND.length === 0 && DB.patchC.length === nPatch && cAna.datos.total === 5500, 'un contrato FIRMADO no se reescribe ni se reenvía');
  af(r.errores.length === 1 && /ya FIRMÓ/.test(r.errores[0].aviso), 'y el cambio de total después de firmar se DICE');
  DB = semilla(); RESEND = [];
  const real = global.fetch; global.fetch = async (u, i) => (String(u).includes('api.resend.com') ? resp(500, {}) : real(u, i));
  r = await lib.emitirContratos(Object.assign({ viajeroIds: [U(1)] }, KH));
  global.fetch = real;
  af(!r.ok && r.creados === 1 && DB.c[0].envios === 0, 'Resend caído: contrato creado, NO sellado como enviado, y se dice');

  console.log('\n[H] los tres caminos');
  let x, jb;
  const req = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js'), 'utf8');
  const asg = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');
  af(/emitirContratos\(\{\s*viajeroIds: nacidos\.map/.test(req) && /return j\(200, headers, \{\s*contrato,/.test(req), 'aprobar requisición → emite y la respuesta trae `contrato`');
  af(/if \(creado && body\.contrato !== false\)/.test(asg) && /viajero: creado, aviso_doble_descuento: avisoDoble, zona_aviso: zonaAvisoMig, contrato/.test(asg), 'alta manual → emite (apagable con contrato:false)');
  af(/contrato_cliente_estado: ROLES_EDITA_VIAJERO/.test(asg) && /contrato_cliente_enviar: ROLES_EDITA_VIAJERO/.test(asg), 'las acciones de KameHouse viven en ACCIONES');
  // Elegir paquete por el handler REAL: el de preventa pasa a PLUS y nace su contrato CON anexo.
  DB = semilla(); RESEND = [];
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  const HA = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const jw = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'memo@x.mx', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
  x = await HA({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify({ accion: 'viajero_elegir_paquete', id: U(4), tipo_paquete: 'plus', zona_boleto: 'Oro', total_contrato: 5200 }) });
  jb = JSON.parse(x.body);
  const cDani = DB.c.find((c) => c.viajero_id === U(4));
  af(x.statusCode === 200 && jb.contrato && cDani && cDani.datos.preventa === true && cDani.datos.total === 5200, () => 'elegir paquete → contrato con anexo de preventa y total real (' + x.statusCode + ' ' + x.body.slice(0, 120) + ')');
  af(RESEND.length === 1 && RESEND[0].to[0] === 'dani@x.mx', 'y le llega UN correo con su link');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('💥 el arnés se cayó: ' + e.stack); process.exit(1); });
