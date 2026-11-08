#!/usr/bin/env node
// =============================================================================
// mide-yajirobe-1.js — [YAJIROBE-1 · 6-nov-2026]
// Palabra de Memo: «un perfil similar a bulma o milk pero para Yajirobe, para
// que se dedique a ayudar a milk a ingresar viajeros, revisar capsule corps y
// requisiciones». Sus respuestas: aprueba/rechaza requisiciones; en Capsule
// registra abonos, corrige el viaje, cancela lugares y elimina viajeros.
//   [A] servidor por los handlers REALES con rol VIVO yajirobe: le abren las
//       puertas de su trabajo y le cierran las del dinero de la casa.
//       Control positivo: un rol inexistente rebota en las mismas puertas.
//   [B] KameHouse: sus pantallas, su aterrizaje, sus gemelos de listas.
//   [C] la base: el CHECK del acta = ROLES_VALIDOS del servidor, y Montaña Pai
//       ofrece los mismos roles (si no, editar a alguien lo cambia de rol).
// SIN ANCLA a propósito (árbol de trabajo).
// =============================================================================
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.PORTAL_SUPABASE_URL = 'https://portal.falso.test';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'svc';
process.env.CORREOS_MODO = 'real';
process.env.CONTRATO_CLIENTE_APAGAR_ARNES = '1';

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {}
  const t = typeof m === 'function' ? (() => { try { return m(); } catch (e) { return '(msg) ' + e.message; } })() : m;
  if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });

let ROL_VIVO = 'yajirobe';
global.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u-' + ROL_VIVO, activo: true, rol: ROL_VIVO, sesion_desde: null, sesiones_cerradas_at: null }]);
  return resp(200, []);
};
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
async function llamar(fn, body, rol) {
  ROL_VIVO = rol;
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/') && !k.includes('verify-admin')) delete require.cache[k];
  const H = require(path.join(RAIZ, 'netlify/functions', fn + '.js')).handler;
  // La sesión viva se cachea POR USUARIO dentro de verify-admin: un id por rol, o el
  // control positivo heredaría el rol vivo del primer llamado (pasó en la 1ª corrida).
  const jw = jwtSign({ id: 'u-' + rol, rol, correo: 'y@x.mx', nombre: 'Yajirobe' }, process.env.JWT_SECRET, 3600);
  let r;
  // `path` como lo manda Netlify: la puerta del director (DIRECTOR-1) reconoce la
  // función por ahí; sin él, un director rebota en todo y el arnés mide su propia falta.
  try { r = await H({ httpMethod: 'POST', path: '/.netlify/functions/' + fn, headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify(body), queryStringParameters: {} }); }
  catch (e) { return { s: 'TRONÓ', err: e.message }; }
  let j = {}; try { j = JSON.parse(r.body || '{}'); } catch (_) {}
  return { s: r.statusCode, j };
}
const sinPermiso = (r) => r.s === 403 && /sin permiso|no autorizado|permiso/i.test(r.j.error || '');

(async () => {
  console.log('[A] servidor — las puertas de su trabajo, abiertas');
  const ABIERTAS = [
    ['admin-requisiciones', { accion: 'listar', estado: 'pendiente' }, 'bandeja de requisiciones'],
    ['admin-coordi-asignaciones', { accion: 'capsule_resumen' }, 'Capsule (resumen)'],
    ['admin-coordi-asignaciones', { accion: 'abono_crear' }, '➕ Abono'],
    ['admin-coordi-asignaciones', { accion: 'viajero_editar_full' }, '✏️ Corregir viaje'],
    ['admin-coordi-asignaciones', { accion: 'viajero_cancelar' }, '⛔ Cancelar lugar'],
    ['admin-coordi-asignaciones', { accion: 'viajero_eliminar' }, 'eliminar viajero'],
    ['admin-coordi-asignaciones', { accion: 'viajero_migrar' }, 'alta manual'],
    ['admin-portal-revision', { accion: 'listar' }, 'tarjetas 🪪 del Portal'],
    ['admin-rooming', { accion: 'listar', evento_id: 'karolg#0' }, 'Rooming'],
    ['admin-rooming-grupos', { accion: 'listar', evento_id: 'karolg#0' }, 'grupos del rooming'],
    ['admin-transporte', { accion: 'listar', evento_id: 'karolg#0' }, 'Transporte'],
    ['admin-compras', { accion: 'semaforo', evento_id: 'karolg#0' }, 'marcador de boletos por zona'],
  ];
  for (const [fn, body, que] of ABIERTAS) {
    const r = await llamar(fn, body, 'yajirobe');
    af(r.s !== 'TRONÓ' && !sinPermiso(r) && r.s !== 401, () => `${que} (${fn}/${body.accion}) le abre: ${r.s} ${r.j.error || r.err || ''}`);
    const c = await llamar(fn, body, 'rol_inventado');
    af(sinPermiso(c), () => `control: un rol inventado rebota en ${que}: ${c.s}`);
  }

  console.log('[A2] servidor — el dinero de la casa, cerrado');
  const CERRADAS = [
    ['admin-coordi-asignaciones', { accion: 'crear' }, 'asignar coordis a un evento'],
    ['admin-cuenta-evento', { evento_id: 'karolg' }, 'Números del evento'],
    ['admin-utilidad-evento', {}, 'Resumen / utilidad'],
    ['admin-compras', { accion: 'listar' }, 'pedidos de boletos'],
    ['admin-gasto-crear', { monto: 1 }, 'capturar gastos'],
    ['admin-saldos', {}, 'saldos'],
    ['admin-excel-aplicar', { evento_id: 'karolg#0' }, 'careo del Excel'],
    ['esferas-publicar', {}, 'publicar Esferas'],
  ];
  for (const [fn, body, que] of CERRADAS) {
    if (!fs.existsSync(path.join(RAIZ, 'netlify/functions', fn + '.js'))) { af(false, `${fn} no existe`); continue; }
    const r = await llamar(fn, body, 'yajirobe');
    af(sinPermiso(r), () => `${que} (${fn}) le dice que no: ${r.s} ${r.j.error || r.err || ''}`);
  }
  // [A3 · YAJIROBE-1b, 8-nov] Lo que Yajirobe vio en su primera noche (captura de
  // Memo): «No se pudo cargar la lista de viajeros: No tienes asignación a este
  // evento». La red falsa no devuelve asignaciones (eventos_coordi vacío), así que
  // ÉSTE es exactamente el caso: la lista le abre por ser quien EDITA viajeros, no
  // por una asignación de coordi; el coordi sin asignación sigue rebotando.
  console.log('[A3] la lista de viajeros y «Mi perfil» le abren sin asignación de coordi');
  {
    const r = await llamar('admin-coordi-asignaciones', { accion: 'viajero_listar', evento_id: 'fuerzaregida#0' }, 'yajirobe');
    af(r.s !== 403, () => `viajero_listar como yajirobe no dice «No tienes asignación»: ${r.s} ${r.j.error || ''}`);
    const d = await llamar('admin-coordi-asignaciones', { accion: 'viajero_listar', evento_id: 'fuerzaregida#0' }, 'director');
    af(d.s !== 403, () => `viajero_listar como director (DIRECTOR-1) tampoco: ${d.s} ${d.j.error || ''}`);
    const c = await llamar('admin-coordi-asignaciones', { accion: 'viajero_listar', evento_id: 'fuerzaregida#0' }, 'coordinador');
    af(c.s === 403 && /asignación/i.test(c.j.error || ''), () => `control: un coordinador SIN asignación sigue rebotando: ${c.s} ${c.j.error || ''}`);
    const m = await llamar('admin-contratos', { accion: 'mio' }, 'yajirobe');
    af(!sinPermiso(m), () => `admin-contratos/mio (su contrato en «Mi perfil») le abre: ${m.s} ${m.j.error || ''}`);
    const ml = await llamar('admin-contratos', { accion: 'listar' }, 'yajirobe');
    af(sinPermiso(ml), () => `control: admin-contratos/listar (todos los contratos) le sigue diciendo que no: ${ml.s}`);
  }

  // [A4 · REP-MULTIFECHA-1, 8-nov] El reporte post-evento de un coordi de
  // multifecha (reno.ava, omar#0 — captura de Memo: «evento_id inválido»).
  console.log('[A4] el reporte post-evento acepta el evento_id con fecha (omar#0)');
  {
    const body = { accion: 'guardar_mio', status: 'borrador', evento_id: 'omar#0', kits_detalle: [], gastos_detalle: [] };
    const r = await llamar('admin-reportes', body, 'coordinador');
    af(!(r.s === 400 && /evento_id inválido/.test(r.j.error || '')), () => `guardar_mio con omar#0 ya no rebota con «evento_id inválido»: ${r.s} ${r.j.error || ''}`);
    const raro = await llamar('admin-reportes', { ...body, evento_id: 'omar#x' }, 'coordinador');
    af(raro.s === 400 && /evento_id inválido/.test(raro.j.error || ''), () => `control: un evento_id raro (omar#x) sigue rebotando: ${raro.s}`);
    const src = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-reportes.js'), 'utf8');
    af(/salidas_bodega\?evento_id=in\.\(\$\{llaves\}\)/.test(src) && /split\('#'\)\[0\]/.test(src.slice(src.indexOf('async function salidasAutorizadasDe'), src.indexOf('async function salidasAutorizadasDe') + 900)),
      'el puente salida↔reporte pregunta por la fecha Y por el evento base (las salidas viven en `omar`, el reporte en `omar#0`)');
  }

  const inv = await llamar('admin-usuarios', { accion: 'crear', rol: 'yajirobe', nombre: 'X', correo: 'x@x.mx' }, 'bulma');
  af(inv.s === 403, () => 'solo Maestro Roshi crea un Yajirobe (bulma → 403): ' + inv.s);

  console.log('[B] KameHouse');
  const kj = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const sacar = (nombre) => { const i = kj.indexOf('const ' + nombre + ' = '); const j = kj.indexOf('\n};', i); return vm.runInNewContext('(' + kj.slice(kj.indexOf('{', i), j + 2) + ')'); };
  const PT = sacar('PERMISOS_TABS');
  af(JSON.stringify(PT.yajirobe) === JSON.stringify(['requisiciones', 'capsule', 'equipo']), () => 'sus pantallas: ' + JSON.stringify(PT.yajirobe));
  const DINERO = ['resumen', 'gastos', 'ingresos', 'saldos', 'inventario', 'reportes', 'kamisama', 'radar', 'montana', 'yamcha', 'esferas', 'herramientas', 'cotizador', 'nube'];
  af(!DINERO.some((t) => PT.yajirobe.includes(t)), 'ninguna pantalla del dinero de la casa');
  const HP = sacar('HOME_PREFERIDO');
  af(HP.yajirobe === 'requisiciones' && PT.yajirobe.includes(HP.yajirobe), 'aterriza en Requisiciones (y la puede ver)');
  af(JSON.stringify(sacar('GZ_TABS_PERMITIDAS').yajirobe) === '["miperfil"]', 'en Guerreros Z solo su perfil');
  af(/const VJ_ROLES_ALTA = \[[^\]]*'yajirobe'/.test(kj) && /const VJ_ROLES_ELIMINAR = \[[^\]]*'yajirobe'/.test(kj), 'alta y eliminar viajero: gemelos con yajirobe');
  af(/const CC_SUB_OCULTAS = \{ yajirobe: \['numeros'\] \}/.test(kj), 'la sub-pestaña Números se le esconde');
  af(/CC_SUB_POR_ROL = \{[^}]*yajirobe: 'viajeros'/.test(kj), 'en Capsule abre en Viajeros');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(/<option value="yajirobe">/.test(html), 'se puede invitar desde Guerreros Z');

  console.log('[C] la base y Montaña Pai');
  const acta = fs.readFileSync(path.join(RAIZ, 'migraciones/YAJIROBE-1.sql'), 'utf8');
  const delActa = (acta.match(/array\[([^\]]+)\]/) || [])[1].split(',').map((x) => x.trim().replace(/'/g, '')).sort();
  const us = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-usuarios.js'), 'utf8');
  const validos = vm.runInNewContext(us.match(/const ROLES_VALIDOS = (\[[^\]]+\])/)[1]).sort();
  // [DIRECTOR-1 · 7-nov] El acta de YAJIROBE-1 es la FOTO de los 7 roles de su
  // día; el CHECK vivo lo reescribió DIRECTOR-1 con 8. Lo que sigue siendo cierto
  // y se vigila: los 7 de esta acta SIGUEN en ROLES_VALIDOS (nadie los quitó) y
  // el acta MÁS RECIENTE que toca usuarios_rol_check es igual a ROLES_VALIDOS.
  af(delActa.every((r) => validos.includes(r)), () => 'los 7 roles del acta YAJIROBE-1 siguen en ROLES_VALIDOS: ' + delActa.join(','));
  const actaDir = fs.readFileSync(path.join(RAIZ, 'migraciones/DIRECTOR-1.sql'), 'utf8');
  const delActaDir = ((actaDir.match(/usuarios_rol_check\s*\n?\s*check \(rol = any \(array\[([^\]]+)\]/) || [])[1] || '').split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean).sort();
  af(JSON.stringify(delActaDir) === JSON.stringify(validos), () => 'el CHECK vigente (acta DIRECTOR-1) = ROLES_VALIDOS: ' + delActaDir.join(','));
  const mt = fs.readFileSync(path.join(RAIZ, 'kamehouse-montana.js'), 'utf8');
  const opts = vm.runInNewContext(mt.match(/const rolOpts = (\[[^\]]+\])/)[1]).sort();
  af(JSON.stringify(opts) === JSON.stringify(validos), () => 'Montaña Pai ofrece los mismos roles (si falta uno, editar a esa persona la cambia de rol): ' + opts.join(','));
  af(/if \(u\.rol && !rolOpts\.includes\(u\.rol\)\) rolOpts\.push\(u\.rol\)/.test(mt), 'un rol que no esté en la lista se agrega: el select nace en el rol real');

  console.log(`\n${R ? '🔴' : '✅'} ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})();
