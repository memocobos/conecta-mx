#!/usr/bin/env node
/* mide-portal-solo-1 — PORTAL-SOLO-1 (27-oct-2026)
 * «El Portal enseña SOLO lo que alguien revisó, y ya no vende.»
 *   [A] portal-mi-plan-migrado (handler REAL): una fila SIN sello no viaja (ni
 *       su dinero); su evento sale en `en_revision`; abre UNA revisión en la
 *       bandeja con la foto ANTES; la 2ª visita no abre otra. Control: sellada,
 *       sí viaja.
 *   [B] portal-viajero / portal-contrato: fila sin sello = 404 igual que ajena.
 *   [C] portal-revision: eventos que vienen; «ligar» valida y no duplica.
 *   [D] admin-portal-revision: ligar (correo ajeno NO se pisa sin reemplazar),
 *       publicar (sella, guarda ANTES/DESPUÉS, 2º clic 409, UN correo con los
 *       números), rechazar (motivo tal cual), adelanto (sella + bitácora).
 *   [E] la venta del Portal cerrada: 410 en el servidor + PORTAL_VENDE=false.
 *   [F] lo que nace de requisición y de ACOMP-2 nace sellado.
 * ⚠️ SIN ANCLA (árbol de trabajo): no sufre la trampa del commit y no puede
 * traer control positivo por commit — sus controles son por construcción. */
'use strict';
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_ANON_KEY = 'anon';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'svc-pt';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.RESEND_API_KEY = 're_falso';
process.env.CORREOS_MODO = 'real';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} const t = typeof m === 'function' ? m() : m; if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

// ── La base de mentira: filtros de PostgREST que el código USA, con estado ──
let DB, USER;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
function filtrar(rows, qs) {
  let out = rows.slice();
  for (const [k, v0] of qs.entries()) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    const v = v0;
    const [op, ...resto] = v.split('.'); const val = resto.join('.');
    const get = (r) => r[k];
    if (op === 'eq') out = out.filter((r) => String(get(r)) === val);
    else if (op === 'neq') out = out.filter((r) => String(get(r)) !== val);
    else if (op === 'in') { const set = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')); out = out.filter((r) => set.includes(String(get(r)))); }
    else if (op === 'is') out = out.filter((r) => (val === 'null' ? get(r) == null : String(get(r)) === val));
    else if (op === 'ilike') out = out.filter((r) => String(get(r) || '').toLowerCase() === val.toLowerCase());
    else if (op === 'like') { const pre = val.replace(/\*$/, ''); out = out.filter((r) => String(get(r) || '').startsWith(pre)); }
    else if (op === 'gte') out = out.filter((r) => String(get(r) || '') >= val);
    else throw new Error('filtro no modelado: ' + k + '=' + v);
  }
  return out;
}
const TABLAS = { viajeros_evento: 'v', abonos_viajero: 'abonos', portal_revisiones: 'rev', usuarios: 'usu', contratos_cliente: 'ctr', cambios_viajero: 'cambios' };
const CHECK_REV = (b) => {
  if (!['revisar', 'ligar', 'adelanto'].includes(b.tipo)) return 'tipo';
  if (b.correo !== String(b.correo).toLowerCase()) return 'correo_min';
  if (b.tipo === 'ligar' && (!b.evento_id || !b.nombre_dado)) return 'ligar_datos';
  if (b.estado === 'rechazada' && !(b.motivo && b.motivo.trim().length >= 3)) return 'motivo';
  return null;
};
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = new URL(String(url));
  if (u.hostname === 'conectareynosa.mx' || u.pathname.includes('index.html')) return resp(200, INDEX);
  if (u.pathname.includes('/auth/v1/user')) return USER ? resp(200, USER) : resp(401, {});
  if (u.hostname === 'api.resend.com') { DB.correos.push(JSON.parse(init.body)); return resp(200, { id: 'em_' + DB.correos.length }); }
  const mt = u.pathname.match(/\/rest\/v1\/([a-z_]+)/); if (!mt) return resp(404, {});
  const key = TABLAS[mt[1]]; if (!key) return resp(200, []);
  DB[key] = DB[key] || [];
  if (m === 'GET') {
    // PostgREST PROYECTA el select: sin esto el arnés dejaría viajar columnas
    // que la consulta real nunca trae (y acusaría al código de fugarlas).
    const sel = u.searchParams.get('select');
    const rows = filtrar(DB[key], u.searchParams);
    if (!sel || sel === '*') return resp(200, rows);
    const cols = sel.split(',');
    return resp(200, rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))));
  }
  if (m === 'POST') {
    let b = JSON.parse(init.body); const arr = Array.isArray(b) ? b : [b];
    for (const x of arr) {
      if (key === 'rev') {
        x.estado = x.estado || 'pendiente';
        const ch = CHECK_REV(x); if (ch) return resp(400, { code: '23514', message: ch });
        if (x.estado === 'pendiente' && DB.rev.some((r) => r.estado === 'pendiente' && r.correo === x.correo && r.tipo === x.tipo && (x.tipo !== 'ligar' || r.evento_id === x.evento_id))) return resp(409, { code: '23505' });
      }
    }
    const nacidas = arr.map((x, i) => Object.assign({ id: U(5000 + DB[key].length + i), creado_en: new Date().toISOString(), viajero_ids: [] }, x));
    DB[key].push(...nacidas); DB.escrituras.push(m + ' ' + mt[1]);
    return resp(201, nacidas);
  }
  if (m === 'PATCH') {
    const f = filtrar(DB[key], u.searchParams); const b = JSON.parse(init.body);
    if (key === 'rev') { for (const r of f) { const ch = CHECK_REV(Object.assign({}, r, b)); if (ch) return resp(400, { code: '23514', message: ch }); } }
    f.forEach((r) => Object.assign(r, b)); DB.escrituras.push(m + ' ' + mt[1]);
    return resp(200, f);
  }
  if (m === 'DELETE') { DB.escrituras.push('DELETE ' + mt[1]); return resp(500, { error: 'DELETE no permitido en el arnés' }); }
  return resp(400, {});
};
const ahora = new Date().toISOString();
const semilla = () => ({ correos: [], escrituras: [], usu: [{ id: 'u-bulma', activo: true, rol: 'bulma' }], rev: [], ctr: [], cambios: [],
  v: [
    { id: U(1), evento_id: 'juniorh', nombre: 'Laura Gómez Ruiz', correo: 'Laura@Correo.mx', tipo_paquete: 'plus', zona_boleto: 'General', total_contrato: 9000, abonado_previo: 2000, boletos: 1, portal_revisado_at: null },
    { id: U(2), evento_id: 'nsqkmty', nombre: 'Laura Gómez Ruiz', correo: 'laura@correo.mx', tipo_paquete: 'cheap', zona_boleto: 'General', total_contrato: 3600, abonado_previo: 0, boletos: 1, portal_revisado_at: ahora, portal_revisado_por: 'requisición R-X' },
    { id: U(3), evento_id: 'juniorh', nombre: 'Pedro Sin Correo López', correo: null, celular: '8991112233', tipo_paquete: 'plus', zona_boleto: 'General', total_contrato: 8000, abonado_previo: 1000, boletos: 1, portal_revisado_at: null },
    { id: U(4), evento_id: 'juniorh', nombre: 'Pedro Otro Correo', correo: 'pedro.viejo@x.mx', tipo_paquete: 'plus', zona_boleto: 'General', total_contrato: 8000, abonado_previo: 0, boletos: 1, portal_revisado_at: null },
  ],
  abonos: [{ id: U(80), viajero_id: U(1), monto: 1500, fecha: '2026-10-01', nota: 'abono' }],
});
const call = async (file, b, extraH) => {
  const H = require(path.join(RAIZ, 'netlify/functions', file)).handler;
  const r = await H({ httpMethod: 'POST', headers: Object.assign({ authorization: 'Bearer jwt', origin: 'https://conectareynosa.mx' }, extraH || {}), body: JSON.stringify(b || {}) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};

(async () => {
  console.log('══ mide:portal-solo-1 ══\n[A] el plan del Portal solo enseña lo revisado');
  DB = semilla(); USER = { id: 'au-laura', email: 'laura@correo.mx', email_confirmed_at: 'x' };
  let r = await call('portal-mi-plan-migrado.js', {});
  af(() => r.s === 200 && r.j.ok, () => 'contesta 200 · ' + JSON.stringify(r.j).slice(0, 140));
  af(() => r.j.tours.length === 1 && r.j.tours[0].viajero_id === U(2), 'solo viaja la fila SELLADA (nsqk); la de juniorh no');
  af(() => !JSON.stringify(r.j).includes('9000') && !JSON.stringify(r.j).includes(U(1)), 'ni el dinero ni el id de la fila sin revisar viajan al cliente');
  af(() => JSON.stringify(r.j.en_revision) === JSON.stringify(['juniorh']), () => 'su evento sale «en revisión»: ' + JSON.stringify(r.j.en_revision));
  const rv = DB.rev.filter((x) => x.tipo === 'revisar');
  af(() => rv.length === 1 && rv[0].correo === 'laura@correo.mx' && JSON.stringify(rv[0].viajero_ids) === JSON.stringify([U(1)]), 'abre UNA revisión en la bandeja, por correo en minúsculas, con la fila sin sello');
  af(() => rv[0] && rv[0].antes && rv[0].antes[0].total === 9000 && rv[0].antes[0].abonado === 3500, () => 'la foto ANTES la cuenta saldoMigrado (2000 previo + 1500 abono = 3500): ' + JSON.stringify(rv[0] && rv[0].antes));
  r = await call('portal-mi-plan-migrado.js', {});
  af(() => DB.rev.filter((x) => x.tipo === 'revisar').length === 1, '2ª visita: NO abre otra revisión');
  af(() => (r.j.solicitudes || []).some((x) => x.tipo === 'revisar' && x.estado === 'pendiente'), 'el Portal recibe su solicitud pendiente para decir «estamos revisando»');
  // control: con todo sellado, viajan las dos
  const DBc = DB; DB = semilla(); DB.v[0].portal_revisado_at = ahora;
  r = await call('portal-mi-plan-migrado.js', {});
  af(() => r.j.tours.length === 2 && !r.j.en_revision.length && !DB.rev.length, 'control: sellada, la fila SÍ viaja y no se abre revisión');
  DB = DBc;

  console.log('\n[B] lo no revisado no se toca desde el Portal');
  r = await call('portal-viajero.js', { accion: 'editar', viajero_id: U(1), celular: '8990000000' });
  af(() => r.s === 404, () => 'editar una fila sin sello → 404 (igual que ajena): ' + r.s);
  const escAntes = DB.escrituras.length;
  r = await call('portal-viajero.js', { accion: 'editar', viajero_id: U(2), celular: '8990000000' });
  af(() => r.s !== 404, () => 'control: la fila sellada sí se puede editar (' + r.s + ')');
  const pc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/portal-contrato.js'), 'utf8');
  af(() => /portal_revisado_at,usuario_id,tipo_viajero&limit=200/.test(pc) && /&& !!v\.portal_revisado_at && !require\('\.\/_lib\/portal-revision'\)\.esDelEquipo\(v\)\)/.test(pc), 'portal-contrato: sus viajeros = solo los REVISADOS y que no son tours de trabajo (PRV-EQUIPO-1 actualizó el literal)');

  console.log('\n[C] «Aún no vemos tu viaje» (portal-revision)');
  USER = { id: 'au-pedro', email: 'pedro.nuevo@x.mx', email_confirmed_at: 'x' };
  r = await call('portal-revision.js', { accion: 'eventos' });
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
  af(() => r.s === 200 && r.j.eventos.length > 5 && r.j.eventos.every((e) => e.ds >= hoy), () => 'eventos: solo los que vienen (' + (r.j.eventos || []).length + '), ninguno pasado');
  af(() => r.j.eventos.some((e) => e.id === 'juniorh') && r.j.eventos.some((e) => /#\d+$/.test(e.id)), 'trae juniorh y las multifecha fecha por fecha (slug#N, como vive la fila)');
  r = await call('portal-revision.js', { accion: 'ligar', evento_id: 'eventoinventado', nombre: 'Pedro López', celular: '8991112233' });
  af(() => r.s === 400 && !DB.rev.some((x) => x.tipo === 'ligar'), 'evento fuera de la lista → 400 sin escribir');
  r = await call('portal-revision.js', { accion: 'ligar', evento_id: 'juniorh', nombre: 'Pedro', celular: '8991112233' });
  af(() => r.s === 400, 'nombre sin apellido → 400');
  r = await call('portal-revision.js', { accion: 'ligar', evento_id: 'juniorh', nombre: 'Pedro López', celular: '89911' });
  af(() => r.s === 400, 'WhatsApp corto → 400');
  r = await call('portal-revision.js', { accion: 'ligar', evento_id: 'juniorh', nombre: 'Pedro López', celular: '899 111 2233', nota: 'reservé por Messenger' });
  const lg = DB.rev.find((x) => x.tipo === 'ligar') || {};
  af(() => r.s === 200 && lg.correo === 'pedro.nuevo@x.mx' && lg.celular === '8991112233' && lg.evento_id === 'juniorh', () => 'nace la solicitud «ligar» · ' + JSON.stringify(lg).slice(0, 140));
  r = await call('portal-revision.js', { accion: 'ligar', evento_id: 'juniorh', nombre: 'Pedro López', celular: '8991112233' });
  af(() => r.s === 409 && DB.rev.filter((x) => x.tipo === 'ligar').length === 1, '2º envío del mismo evento → 409, una sola');

  console.log('\n[D] la bandeja (admin-portal-revision)');
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const tok = jwtSign({ id: 'u-bulma', rol: 'bulma', correo: 'bulma@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const adm = (b) => call('admin-portal-revision.js', b, { authorization: 'Bearer ' + tok });
  r = await adm({ accion: 'listar' });
  const itL = (r.j.pendientes || []).find((x) => x.tipo === 'ligar') || {};
  const itR = (r.j.pendientes || []).find((x) => x.tipo === 'revisar') || {};
  af(() => r.s === 200 && r.j.total === 2, () => 'listar: las 2 pendientes · ' + r.s + ' ' + (r.j.error || ''));
  af(() => itR.filas && itR.filas.length === 2 && itR.sin_revisar === 1 && itR.filas.find((v) => v.id === U(1)).abonos_lista.length === 1, 'revisar: sus filas, cuántas sin revisar y sus abonos');
  af(() => itR.filas && itR.filas.find((v) => v.id === U(1)).nombre === 'Laura Gómez Ruiz' && itR.filas.find((v) => v.id === U(1)).evento_nombre, 'el nombre del evento NO pisa el nombre de la persona');
  af(() => (itL.candidatos || [])[0] && itL.candidatos[0].id === U(3) && itL.candidatos[0].mismo_celular, () => 'ligar: el mismo WhatsApp gana el primer lugar · ' + JSON.stringify((itL.candidatos || []).map((c) => c.nombre)));
  r = await adm({ accion: 'ligar', id: itL.id, viajero_id: U(4) });
  af(() => r.s === 409 && r.j.pide_reemplazar && DB.v[3].correo === 'pedro.viejo@x.mx', 'una fila con OTRO correo no se pisa sin «reemplazar» (409, nada escrito)');
  r = await adm({ accion: 'publicar', id: itL.id });
  af(() => r.s === 409, 'publicar un «ligar» sin fila ligada → 409');
  r = await adm({ accion: 'ligar', id: itL.id, viajero_id: U(3) });
  af(() => r.s === 200 && DB.v[2].correo === 'pedro.nuevo@x.mx' && /PORTAL-SOLO-1/.test(DB.v[2].notas || ''), 'ligar: el correo de su cuenta queda en esa fila, con nota de quién');
  af(() => !DB.v[2].portal_revisado_at, 'ligar NO publica: todavía falta revisar sus números');
  DB.correos = [];
  r = await adm({ accion: 'publicar', id: itL.id, nota: 'cuadra con el Excel' });
  const revL = DB.rev.find((x) => x.id === itL.id);
  af(() => r.s === 200 && DB.v[2].portal_revisado_at && revL.estado === 'publicada' && revL.nota_staff === 'cuadra con el Excel', 'publicar: sella la fila y guarda la nota en la bitácora');
  af(() => revL.despues && revL.despues[0].total === 8000 && revL.despues[0].abonado === 1000, () => 'la bitácora guarda los números DESPUÉS: ' + JSON.stringify(revL.despues));
  const c1 = DB.correos[0] || {};
  af(() => DB.correos.length === 1 && c1.to[0] === 'pedro.nuevo@x.mx' && /\$8,000/.test(c1.html) && /\$7,000/.test(c1.html), 'UN correo «ya puedes ver tu viaje» con total y lo que falta (de saldoMigrado)');
  r = await adm({ accion: 'publicar', id: itL.id });
  af(() => r.s === 409 && DB.correos.length === 1, '2º clic → 409, sin segundo correo');
  // Laura: le corrigen un abono y publican → antes ≠ después
  DB.abonos.push({ id: U(81), viajero_id: U(1), monto: 500, fecha: '2026-10-20', nota: 'faltaba' });
  DB.correos = [];
  r = await adm({ accion: 'publicar', id: itR.id, nota: 'faltaba un abono de $500' });
  const revR = DB.rev.find((x) => x.id === itR.id);
  af(() => r.s === 200 && DB.v[0].portal_revisado_at && revR.antes[0].abonado === 3500 && revR.despues[0].abonado === 4000, () => 'antes $3,500 → después $4,000 queda escrito (la historia de esa persona)');
  USER = { id: 'au-laura', email: 'laura@correo.mx', email_confirmed_at: 'x' };
  r = await call('portal-mi-plan-migrado.js', {});
  af(() => r.j.tours.length === 2 && !r.j.en_revision.length, 'ya publicada, Laura ve sus 2 viajes y nada en revisión');
  // rechazar
  DB.rev.push({ id: U(7001), tipo: 'ligar', estado: 'pendiente', correo: 'nadie@x.mx', evento_id: 'juniorh', nombre_dado: 'Nadie Nunca', viajero_ids: [], creado_en: ahora });
  DB.correos = [];
  r = await adm({ accion: 'rechazar', id: U(7001), motivo: 'x' });
  af(() => r.s === 400, 'rechazar sin motivo → 400');
  r = await adm({ accion: 'rechazar', id: U(7001), motivo: 'No encontramos un viaje a tu nombre en Junior H' });
  af(() => r.s === 200 && DB.correos.length === 1 && /No encontramos un viaje a tu nombre en Junior H/.test(DB.correos[0].html), 'rechazar: el motivo le llega TAL CUAL');
  // adelanto
  DB.v.push({ id: U(9), evento_id: 'juniorh', nombre: 'Por Adelantado Uno', correo: null, total_contrato: 5000, abonado_previo: 0, portal_revisado_at: null });
  r = await adm({ accion: 'adelanto', viajero_ids: [U(9)], nota: 'revisado con Ximena' });
  const bitA = DB.rev.find((x) => x.tipo === 'adelanto');
  af(() => r.s === 200 && DB.v[DB.v.length - 1].portal_revisado_at && bitA && bitA.correo === 'sin-correo' && bitA.nota_staff === 'revisado con Ximena', 'adelanto: sella y deja su renglón en la bitácora (sin correo al cliente)');
  af(() => !DB.escrituras.some((e) => e.startsWith('DELETE')), 'CERO DELETEs en todo el recorrido');

  console.log('\n[E] el Portal ya no vende');
  r = await call('portal-nueva-solicitud.js', { evento_id: 'juniorh' });
  af(() => r.s === 410 && r.j.cerrado, 'portal-nueva-solicitud → 410 en el servidor (esconder el botón no basta)');
  const ph = fs.readFileSync(path.join(RAIZ, 'portal.html'), 'utf8');
  af(() => /const PORTAL_VENDE = false;/.test(ph), 'portal.html: PORTAL_VENDE = false');
  af(() => /if \(!PORTAL_VENDE\) \{ _invToast/.test(ph) && /PORTAL_VENDE && name === 'dashboard'/.test(ph), 'el wizard no abre y el FAB no se enseña');
  af(() => /Aún no vemos tu viaje/.test(ph) && /data-mig-act="ps-enviar"/.test(ph) && /act === 'ps-enviar'/.test(ph), '«Aún no vemos tu viaje» con su formulario por delegación (script MÓDULO)');
  af(() => /Estamos revisando tu viaje/.test(ph), 'el Portal dice «estamos revisando tu viaje» (sin números)');

  console.log('\n[F] lo que ya nació revisado');
  const ar = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js'), 'utf8');
  af(() => /portal_revisado_at: new Date\(\)\.toISOString\(\), portal_revisado_por: 'requisición '/.test(ar) && /\]\)\.map\(\(f\) => Object\.assign\(f, sello\)\)/.test(ar), 'aprobar una requisición sella las filas que nacen (aprobar ES revisar)');
  const pv = fs.readFileSync(path.join(RAIZ, 'netlify/functions/portal-viajero.js'), 'utf8');
  af(() => /portal_revisado_por: 'heredado del titular \(ACOMP-2\)'/.test(pv), 'los acompañantes repartidos heredan el sello del titular');
  const acta = fs.readFileSync(path.join(RAIZ, 'migraciones/PORTAL-SOLO-1.sql'), 'utf8');
  af(() => /grant select, insert, update, delete on public\.portal_revisiones to service_role/.test(acta) && /enable row level security/.test(acta), 'el acta trae RLS + GRANT service_role (regla del 30-oct)');

  console.log('\n[G] PRV-FILA-1 · viaje por viaje: editar, publicar uno, «no procede» uno');
  DB = semilla();
  DB.v.push(
    { id: U(21), evento_id: 'juniorh', nombre: 'Lesly Prueba Medellin', correo: 'lesly@x.mx', tipo_paquete: 'PLUS', zona_boleto: 'General', total_contrato: null, abonado_previo: 2000, boletos: 1, portal_revisado_at: null },
    { id: U(22), evento_id: 'alfredito', nombre: 'Lesly Prueba Medellin', correo: 'lesly@x.mx', tipo_paquete: 'PLUS', zona_boleto: null, total_contrato: null, abonado_previo: null, boletos: 1, portal_revisado_at: null },
    { id: U(23), evento_id: 'juniorh', nombre: 'Lesly Prueba Medellin', correo: 'lesly@x.mx', tipo_paquete: 'plus', zona_boleto: 'General', total_contrato: 7000, abonado_previo: 500, boletos: 1, portal_revisado_at: null });
  USER = { id: 'au-lesly', email: 'lesly@x.mx', email_confirmed_at: 'x' };
  await call('portal-mi-plan-migrado.js', {});
  r = await adm({ accion: 'listar' });
  const itG = (r.j.pendientes || []).find((x) => x.correo === 'lesly@x.mx') || {};
  af(() => itG.filas && itG.filas.length === 3 && itG.sin_revisar === 3, () => 'listar: sus 3 viajes por revisar · ' + JSON.stringify((itG.filas || []).map((f) => [f.evento_id, f.evento_pasado])));
  af(() => (itG.filas || []).find((f) => f.id === U(22)).evento_pasado === true && (itG.filas || []).find((f) => f.id === U(21)).evento_pasado === false, 'marca el evento PASADO (alfredito) y no el que viene');
  af(() => itG.filas[itG.filas.length - 1].id === U(22), 'lo pasado va al final: primero lo que hay que decidir hoy');
  r = await adm({ accion: 'fila_editar', id: itG.id, viajero_id: U(21), campos: { total_contrato: '9,500', abonado_previo: '2500' } });
  const v21 = DB.v.find((v) => v.id === U(21));
  af(() => r.s === 200 && v21.total_contrato === 9500 && v21.abonado_previo === 2500 && /\[PORTAL-REV .*total —→\$9500; pagado antes \$2000→\$2500 · Bulma/.test(v21.notas || ''), () => 'editar: total y pagado-antes quedan, con su rastro en las notas · ' + r.s + ' ' + (r.j.error || '') + ' ' + v21.notas);
  af(() => !v21.portal_revisado_at, 'editar NO publica');
  r = await adm({ accion: 'fila_editar', id: itG.id, viajero_id: U(21), campos: { zona_boleto: 'Zona Que No Existe XYZ' } });
  af(() => r.s === 400 && /no es zona/.test(r.j.error || '') && v21.zona_boleto === 'General', () => 'la zona pasa por LA PUERTA de la ficha (inventada → 400, nada escrito): ' + r.s + ' ' + (r.j.error || ''));
  r = await adm({ accion: 'fila_editar', id: itG.id, viajero_id: U(21), campos: { total_contrato: '' } });
  af(() => r.s === 400 && v21.total_contrato === 9500, 'el total no se puede vaciar');
  r = await adm({ accion: 'fila_editar', id: itG.id, viajero_id: U(1), campos: { nombre: 'Intruso Ajeno' } });
  af(() => r.s === 409 && DB.v[0].nombre === 'Laura Gómez Ruiz', 'una fila de OTRO correo no se edita desde esta revisión (409)');
  DB.correos = [];
  r = await adm({ accion: 'fila_publicar', id: itG.id, viajero_id: U(21) });
  af(() => r.s === 200 && v21.portal_revisado_at && r.j.cierre && r.j.cierre.cerrada === false && r.j.cierre.restantes === 2 && !DB.correos.length, () => 'publicar UNO: se sella solo ése, quedan 2 y todavía NO sale correo · ' + JSON.stringify(r.j.cierre));
  r = await adm({ accion: 'fila_publicar', id: itG.id, viajero_id: U(21) });
  af(() => r.s === 409, '2º clic sobre el mismo viaje → 409');
  r = await adm({ accion: 'fila_editar', id: itG.id, viajero_id: U(21), campos: { nombre: 'Otro Nombre' } });
  af(() => r.s === 409, 'lo ya publicado no se edita aquí (409)');
  r = await adm({ accion: 'fila_no_procede', id: itG.id, viajero_id: U(22), motivo: 'x' });
  af(() => r.s === 400, '«no procede» sin motivo → 400');
  r = await adm({ accion: 'fila_no_procede', id: itG.id, viajero_id: U(22), motivo: 'Ese viaje ya pasó y no aparece pagado' });
  const npRow = DB.rev.find((x) => x.estado === 'rechazada' && (x.viajero_ids || []).includes(U(22)));
  af(() => r.s === 200 && npRow && npRow.evento_id === 'alfredito' && r.j.cierre.restantes === 1 && !DB.v.find((v) => v.id === U(22)).portal_revisado_at, 'no procede UNO: queda en la bitácora con su motivo, sin sellarse, y queda 1');
  r = await call('portal-mi-plan-migrado.js', {});
  af(() => r.j.tours.length === 1 && JSON.stringify(r.j.en_revision) === JSON.stringify(['juniorh']) && (r.j.solicitudes || []).some((x) => x.estado === 'rechazada' && /ya pasó/.test(x.motivo)), () => 'el Portal: ve el publicado, «en revisión» ya no dice alfredito, y le dice el motivo · ' + JSON.stringify(r.j.en_revision));
  r = await adm({ accion: 'publicar', id: itG.id });
  af(() => r.s === 200 && !DB.v.find((v) => v.id === U(22)).portal_revisado_at && DB.v.find((v) => v.id === U(23)).portal_revisado_at, '«publicar las que faltan» NO sella lo marcado «no procede»');
  const revG = DB.rev.find((x) => x.id === itG.id);
  af(() => revG.estado === 'publicada' && DB.correos.length === 1 && !/Alfredo|alfredito/i.test(DB.correos[0].html.split('Sobre otros')[0]), 'se cierra y sale UN correo sin el viaje que no procedió en la lista de publicados');
  // El cierre automático: otra persona, decide sus 2 viajes uno por uno.
  DB.v.push({ id: U(31), evento_id: 'juniorh', nombre: 'Ana Dos Viajes', correo: 'ana@x.mx', tipo_paquete: 'PLUS', zona_boleto: 'General', total_contrato: 6000, abonado_previo: 1000, boletos: 1, portal_revisado_at: null },
    { id: U(32), evento_id: 'alfredito', nombre: 'Ana Dos Viajes', correo: 'ana@x.mx', tipo_paquete: 'PLUS', zona_boleto: null, total_contrato: null, abonado_previo: null, boletos: 1, portal_revisado_at: null });
  USER = { id: 'au-ana', email: 'ana@x.mx', email_confirmed_at: 'x' };
  await call('portal-mi-plan-migrado.js', {});
  const revA = DB.rev.find((x) => x.correo === 'ana@x.mx' && x.estado === 'pendiente');
  DB.correos = [];
  await adm({ accion: 'fila_no_procede', id: revA.id, viajero_id: U(32), motivo: 'Ese viaje ya pasó' });
  r = await adm({ accion: 'fila_publicar', id: revA.id, viajero_id: U(31) });
  const co = DB.correos[0] || {};
  af(() => r.j.cierre && r.j.cierre.cerrada === true && revA.estado === 'publicada' && DB.correos.length === 1, () => 'al decidir el ÚLTIMO, la revisión se cierra sola y sale UN correo · ' + JSON.stringify(r.j.cierre));
  af(() => /\$6,000/.test(co.html || '') && /Sobre otros viajes/.test(co.html || '') && /Ese viaje ya pasó/.test(co.html || ''), 'el correo trae lo publicado con sus números y, aparte, lo que no procedió con su motivo');
  await call('portal-mi-plan-migrado.js', {});
  af(() => !DB.rev.some((x) => x.correo === 'ana@x.mx' && x.estado === 'pendiente'), 'la siguiente visita NO reabre revisión por el viaje que no procedió');
  af(() => !DB.escrituras.some((e) => e.startsWith('DELETE')), 'CERO DELETEs');

  console.log('\n[H] PRV-EQUIPO-1 · los tours que trabaja una coordinadora no van al Portal');
  DB = semilla();
  DB.v.push(
    { id: U(41), evento_id: 'juniorh', nombre: 'Coordi Que Compra', correo: 'coordi@x.mx', tipo_paquete: 'PLUS', zona_boleto: 'General', total_contrato: 7000, abonado_previo: 500, boletos: 1, tipo_viajero: 'cliente', portal_revisado_at: null },
    { id: U(42), evento_id: 'alfredito', nombre: 'Coordi Que Compra', correo: 'coordi@x.mx', tipo_paquete: 'PLUS', total_contrato: null, abonado_previo: null, boletos: 1, tipo_viajero: 'coordinador', usuario_id: 'u-coordi', portal_revisado_at: null },
    { id: U(43), evento_id: 'nsqkmty', nombre: 'Coordi Que Compra', correo: 'coordi@x.mx', tipo_paquete: 'PLUS', total_contrato: null, abonado_previo: null, boletos: 1, tipo_viajero: 'coordinador', usuario_id: 'u-coordi', portal_revisado_at: ahora },
    { id: U(44), evento_id: 'juniorh', nombre: 'Creadora Invitada', correo: 'crea@x.mx', tipo_paquete: 'CHEAP', zona_boleto: 'General', total_contrato: 0, abonado_previo: 0, boletos: 1, tipo_viajero: 'creadora', portal_revisado_at: null });
  USER = { id: 'au-coordi', email: 'coordi@x.mx', email_confirmed_at: 'x' };
  r = await call('portal-mi-plan-migrado.js', {});
  af(() => r.j.tours.length === 0 && JSON.stringify(r.j.en_revision) === JSON.stringify(['juniorh']), () => 'Portal: su tour de trabajo (aunque traiga sello) NO viaja y no sale «en revisión»; solo lo que compró · ' + JSON.stringify([r.j.tours.length, r.j.en_revision]));
  const revC = DB.rev.find((x) => x.correo === 'coordi@x.mx') || {};
  af(() => JSON.stringify(revC.viajero_ids) === JSON.stringify([U(41)]), () => 'la revisión nace SOLO con lo que compró · ' + JSON.stringify(revC.viajero_ids));
  // control: una revisión vieja que ya traía el tour de trabajo (como la de Lesly)
  revC.viajero_ids = [U(41), U(42)];
  r = await adm({ accion: 'listar' });
  const itC = (r.j.pendientes || []).find((x) => x.correo === 'coordi@x.mx') || {};
  af(() => itC.filas && itC.filas.length === 1 && itC.filas[0].id === U(41) && itC.sin_revisar === 1, () => 'la bandeja ya no enseña sus tours de trabajo (revisiones viejas incluidas) · ' + JSON.stringify((itC.filas || []).map((f) => f.evento_id)));
  r = await adm({ accion: 'fila_publicar', id: itC.id, viajero_id: U(42) });
  af(() => r.s === 409 && !DB.v.find((v) => v.id === U(42)).portal_revisado_at, 'publicar un tour de trabajo → 409, nada se sella');
  r = await adm({ accion: 'fila_publicar', id: itC.id, viajero_id: U(41) });
  af(() => r.s === 200 && r.j.cierre && r.j.cierre.cerrada === true, () => 'con lo que compró publicado, la revisión se cierra (el tour de trabajo no cuenta como pendiente) · ' + JSON.stringify(r.j.cierre));
  r = await call('portal-viajero.js', { accion: 'editar', viajero_id: U(43), celular: '8990000000' });
  af(() => r.s === 404, () => 'portal-viajero: su tour de trabajo es ajeno (404) aunque tenga sello · ' + r.s);
  r = await adm({ accion: 'adelanto', viajero_ids: [U(42)], nota: 'x' });
  af(() => r.s === 200 && !DB.v.find((v) => v.id === U(42)).portal_revisado_at, 'adelanto: salta los tours de trabajo');
  USER = { id: 'au-crea', email: 'crea@x.mx', email_confirmed_at: 'x' };
  await call('portal-mi-plan-migrado.js', {});
  af(() => DB.rev.some((x) => x.correo === 'crea@x.mx' && (x.viajero_ids || []).includes(U(44))), 'control: una CREADORA sí se revisa como clienta (su cortesía es su viaje)');

  // ── [R] PRV-EDITA-1a · «✓ Ya quedó»: cerrar sin mentirle al cliente ───────
  // 🔴 El caso REAL (Frida, 28-oct): pidió revisión, su viaje ya estaba ligado y
  // publicado, y la tarjeta se quedó pegada porque los únicos botones eran
  // WhatsApp y «No procede» — que le habría mandado un «tu solicitud no
  // procedió» FALSO. `resuelta` es su propio estado, no un rechazo disfrazado.
  console.log('\n[R] PRV-EDITA-1a · «✓ Ya quedó» cierra el pendiente sin decir que no procedió');
  DB = semilla();
  DB.v.push({ id: U(61), evento_id: 'juniorh', nombre: 'Ya Quedo Uno', correo: 'yaquedo@x.mx', tipo_paquete: 'PLUS',
    zona_boleto: 'General', total_contrato: 6000, abonado_previo: 1000, boletos: 1, tipo_viajero: 'cliente', portal_revisado_at: ahora });
  DB.rev.push({ id: U(7101), tipo: 'ligar', estado: 'pendiente', correo: 'yaquedo@x.mx', evento_id: 'juniorh',
    nombre_dado: 'Ya Quedo Uno', viajero_ids: [], creado_en: ahora });
  DB.correos = [];
  r = await adm({ accion: 'cerrar_resuelta', id: U(7101), nota: 'ok' });
  af(() => r.s === 400 && DB.rev.find((x) => x.id === U(7101)).estado === 'pendiente',
    () => 'sin nota de verdad → 400 y la solicitud SIGUE pendiente (no se cierra a medias) · ' + r.s);
  r = await adm({ accion: 'cerrar_resuelta', id: U(7101), nota: 'Su viaje ya estaba bien; se le movió la fecha y se le avisó por WhatsApp.' });
  const cerr = DB.rev.find((x) => x.id === U(7101)) || {};
  af(() => r.s === 200 && cerr.estado === 'resuelta', () => 'queda en «resuelta», que NO es «rechazada» · ' + cerr.estado);
  af(() => cerr.estado !== 'rechazada' && !cerr.motivo,
    'no se guarda motivo: un motivo es lo que le llega al cliente cuando NO procede, y aquí sí procedió');
  af(() => /se le movió la fecha/.test(cerr.nota_staff || ''), 'la nota del staff queda en la bitácora');
  af(() => cerr.atendida_por && cerr.atendida_at, 'queda QUIÉN la cerró y CUÁNDO');
  af(() => DB.correos.length === 1 && !/no proced/i.test(DB.correos[0].html),
    () => 'sale UN correo y NO le dice que no procedió · ' + DB.correos.length);
  af(() => cerr.correo_enviado_at, 'y se sella que el correo salió');
  // 2º clic: idempotente de verdad, no «parece que sí».
  const correosAntes = DB.correos.length;
  r = await adm({ accion: 'cerrar_resuelta', id: U(7101), nota: 'otra vez' });
  af(() => r.s === 409 && DB.correos.length === correosAntes, () => '2º clic → 409 y CERO correos de más · ' + r.s);

  // La casilla apagada: se respeta y no se sella un envío que no ocurrió.
  DB.rev.push({ id: U(7102), tipo: 'ligar', estado: 'pendiente', correo: 'yaquedo@x.mx', evento_id: 'alfredito',
    nombre_dado: 'Ya Quedo Uno', viajero_ids: [], creado_en: ahora });
  DB.correos = [];
  r = await adm({ accion: 'cerrar_resuelta', id: U(7102), nota: 'Resuelto por WhatsApp, ya no hace falta correo.', avisar: false });
  const sinAviso = DB.rev.find((x) => x.id === U(7102)) || {};
  af(() => r.s === 200 && DB.correos.length === 0 && sinAviso.estado === 'resuelta',
    () => 'con la casilla apagada cierra y NO manda correo · ' + DB.correos.length);
  af(() => !sinAviso.correo_enviado_at,
    'y NO sella `correo_enviado_at`: sellar sin haber mandado deja a alguien marcado como avisado');

  // 🔒 Nada publicado = nada que contarle. Un cero es una afirmación.
  DB.v.push({ id: U(62), evento_id: 'juniorh', nombre: 'Sin Nada', correo: 'sinnada@x.mx', tipo_paquete: 'PLUS',
    zona_boleto: 'General', total_contrato: 4000, abonado_previo: 0, boletos: 1, tipo_viajero: 'cliente', portal_revisado_at: null });
  DB.rev.push({ id: U(7103), tipo: 'ligar', estado: 'pendiente', correo: 'sinnada@x.mx', evento_id: 'juniorh',
    nombre_dado: 'Sin Nada', viajero_ids: [], creado_en: ahora });
  DB.correos = [];
  r = await adm({ accion: 'cerrar_resuelta', id: U(7103), nota: 'Se le explicó por WhatsApp que falta revisar su pago.' });
  af(() => r.s === 200 && DB.correos.length === 0 && r.j.correo && /ningún viaje publicado/.test(r.j.correo.aviso || ''),
    () => 'sin nada publicado NO se manda «ya puedes verlo», y la bandeja DICE por qué · ' + JSON.stringify((r.j.correo || {}).aviso));
  af(() => !DB.escrituras.some((e) => e.startsWith('DELETE')), 'CERO DELETEs en todo el bloque');

  // El botón existe de verdad en la pantalla y llama a la acción real.
  const kprv = fs.readFileSync(path.join(RAIZ, 'kamehouse-portal-revision.js'), 'utf8');
  af(() => /_prvResueltaAbrir\('\$\{rev\.id\}'\)/.test(kprv), 'el botón «✓ Ya quedó» está en la tarjeta');
  af(() => /accion: 'cerrar_resuelta'/.test(kprv), 'y llama a la acción que el servidor despacha');
  af(() => /id="prv-ok-avisar-\$\{revId\}" checked/.test(kprv), 'la casilla de aviso nace PRENDIDA (palabra de Memo)');
  const srv = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-portal-revision.js'), 'utf8');
  af(() => /ACCIONES = \[[^\]]*'cerrar_resuelta'/.test(srv),
    'la acción está en ACCIONES o el portero la rechaza antes de llegar (la ley de RAD-FIX-CAMINO)');

  console.log(`\n${R ? '🔴' : (V ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('💥 el arnés se cayó:', e); process.exit(2); });
