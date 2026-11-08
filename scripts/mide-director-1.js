#!/usr/bin/env node
// =============================================================================
// mide-director-1.js — [DIRECTOR-1 · 7-nov-2026]
// Palabra de Memo: su jefe quiere VER KameHouse — «ver todo, sin poder cambiar
// nada», nombres profesionales solo para él, tema «Ejecutivo» claro.
//   [A] la puerta central (verify-admin): `director` entra SOLO por
//       LECTURAS_DIRECTOR, ignora la lista del handler y lo demás es 403.
//   [B] los handlers REALES con rol VIVO director: lecturas abiertas,
//       escrituras cerradas — por el hecho (status), no por grep. Control
//       positivo: un rol inventado rebota igual; roshi sigue entrando.
//   [C] la lista de lecturas no contiene ninguna acción que ESCRIBA: se
//       carea cada (fn, accion) contra el cuerpo del handler buscando los
//       verbos de escritura (PATCH/POST/DELETE a rest/v1, storage, Resend).
//   [D] KameHouse: PERMISOS_TABS/GZ/HOME/etiquetas, el diccionario de nombres
//       es ESTABLE (ningún resultado contiene una llave), el CSS esconde los
//       controles de escritura, la plantilla existe en JS y CSS.
//   [E] la base: el CHECK del acta = ROLES_VALIDOS del servidor = PERMISOS_TABS.
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

let ROL_VIVO = 'director';
const ESCRITURAS = []; // toda llamada con verbo de escritura, para afirmar que el director no produce ninguna
global.fetch = async (url, init) => {
  const u = decodeURIComponent(String(url));
  const m = (init && init.method) || 'GET';
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u-' + ROL_VIVO, activo: true, rol: ROL_VIVO, sesion_desde: null, sesiones_cerradas_at: null }]);
  if (m !== 'GET') ESCRITURAS.push({ m, u: u.slice(0, 120) });
  return resp(200, []);
};
const VA = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const { jwtSign, LECTURAS_DIRECTOR, rolPermitido } = VA;
const ev = (fn, body, q) => ({ httpMethod: 'POST', path: '/.netlify/functions/' + fn, headers: { origin: 'https://conectareynosa.mx' }, body: body ? JSON.stringify(body) : '', queryStringParameters: q || {} });

async function llamar(fn, body, rol) {
  ROL_VIVO = rol;
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/') && !k.includes('verify-admin')) delete require.cache[k];
  const H = require(path.join(RAIZ, 'netlify/functions', fn + '.js')).handler;
  const jw = jwtSign({ id: 'u-' + rol, rol, correo: 'd@x.mx', nombre: 'Director' }, process.env.JWT_SECRET, 3600);
  const e = ev(fn, body); e.headers.authorization = 'Bearer ' + jw;
  let r;
  try { r = await H(e); } catch (x) { return { s: 'TRONÓ', err: x.message }; }
  let j = {}; try { j = JSON.parse(r.body || '{}'); } catch (_) {}
  return { s: r.statusCode, j };
}
const sinPermiso = (r) => r.s === 403;

(async () => {
  console.log('[A] la puerta central');
  af(rolPermitido('director', ['maestro_roshi'], ev('admin-saldos')) === true, 'director entra a una lectura listada aunque el handler no lo nombre');
  af(rolPermitido('director', undefined, ev('esferas-publicar')) === false, 'director NO entra a una function fuera de la lista (sin lista del handler = antes "cualquier rol")');
  af(rolPermitido('director', [], ev('admin-compras', { accion: 'crear' })) === false, 'director NO entra a una acción no listada de una function listada');
  af(rolPermitido('director', [], ev('admin-compras', { accion: 'listar' })) === true, 'director entra a la acción listada (listar)');
  af(rolPermitido('director', [], ev('admin-radar', null, { accion: 'alerta_vista' })) === false, 'la accion por query también se lee: alerta_vista (escribe) cerrada');
  af(rolPermitido('director', [], ev('admin-radar', null, { accion: 'tops' })) === true, 'tops por query abierta');
  af(rolPermitido('bulma', ['maestro_roshi'], ev('admin-saldos')) === false && rolPermitido('bulma', undefined, ev('x')) === true && rolPermitido('maestro_roshi', ['maestro_roshi'], ev('x')) === true, 'los demás roles siguen EXACTO como antes (lista del handler; sin lista = cualquiera)');
  af(rolPermitido('director', [], ev('admin-coordi-asignaciones', { accion: 'capsule_resumen' })) === true && rolPermitido('director', [], ev('admin-coordi-asignaciones', { accion: 'abono_crear' })) === false, 'Capsule: resumen sí, abono no');
  // sabotaje: si la lista dejara de consultarse, esto se pondría rojo
  af(rolPermitido('director', ['director'], ev('admin-compras', { accion: 'crear' })) === false, '🔒 ni poniendo "director" en la lista del handler entra a una escritura: la lista central MANDA');

  console.log('[B] handlers reales con rol vivo director');
  const ABIERTAS = [
    ['admin-saldos', {}, 'saldos'],
    ['admin-utilidad-evento', {}, 'resumen (utilidad)'],
    ['admin-gastos-list', {}, 'gastos'],
    ['admin-coordi-asignaciones', { accion: 'capsule_resumen' }, 'Capsule resumen'],
    ['admin-coordi-asignaciones', { accion: 'contrato_cliente_lista' }, 'contratos de cliente (lista)'],
    ['admin-compras', { accion: 'listar' }, 'Kamisama listar'],
    ['admin-compras', { accion: 'semaforo', evento_id: 'x' }, 'Kamisama semáforo'],
    ['admin-requisiciones', { accion: 'listar', estado: 'pendiente' }, 'bandeja listar'],
    ['esferas-listar', {}, 'Esferas listar'],
    ['admin-radar', { accion: 'tops' }, 'Radar tops'],
    ['admin-reportes', { accion: 'listar' }, 'reportes listar'],
    ['admin-usuarios', { accion: 'listar' }, 'equipo listar'],
    ['admin-mas-alla', { accion: 'listar' }, 'Más Allá listar'],
    ['admin-cotizador', { accion: 'opciones' }, 'cotizador'],
  ];
  for (const [fn, body, nom] of ABIERTAS) {
    const r = await llamar(fn, body, 'director');
    af(!sinPermiso(r) && r.s !== 401 && r.s !== 'TRONÓ', () => `${nom}: NO es 401/403 (fue ${r.s}${r.err ? ' ' + r.err : ''})`);
  }
  const CERRADAS = [
    ['admin-compras', { accion: 'crear' }, 'crear compra'],
    ['admin-compras', { accion: 'ajuste_guardar' }, 'vendidos fuera'],
    ['admin-coordi-asignaciones', { accion: 'abono_crear' }, 'abono'],
    ['admin-coordi-asignaciones', { accion: 'viajero_editar_full' }, 'corregir viajero'],
    ['admin-coordi-asignaciones', { accion: 'viajero_cancelar' }, 'cancelar lugar'],
    ['admin-coordi-asignaciones', { accion: 'viajero_eliminar' }, 'eliminar viajero'],
    ['admin-coordi-asignaciones', { accion: 'contrato_cliente_enviar' }, 'enviar contrato'],
    ['admin-coordi-asignaciones', { accion: 'contrato_cliente_ine' }, 'ver INE (sensible: fuera)'],
    ['admin-requisiciones', { accion: 'aprobar' }, 'aprobar requisición'],
    ['admin-requisiciones', { accion: 'rechazar' }, 'rechazar requisición'],
    ['admin-radar', { accion: 'alerta_vista' }, 'marcar alerta vista'],
    ['admin-usuarios', { accion: 'crear' }, 'crear usuario'],
    ['admin-usuarios', { accion: 'actualizar', id: '11111111-1111-1111-1111-111111111111' }, 'editar usuario'],
    ['admin-reportes', { accion: 'aprobar_final' }, 'aprobar reporte'],
    ['admin-mas-alla', { accion: 'marcar' }, 'Más Allá marcar'],
    ['admin-reembolsos', { accion: 'marcar_transferido' }, 'reembolso transferido'],
    ['admin-reembolsos', { accion: 'listar' }, 'Yamcha listar (pantalla no asignada: fuera)'],
    ['esferas-publicar', {}, 'publicar al sitio'],
    ['esferas-actualizar', {}, 'guardar ficha'],
    ['esferas-cancelar', { confirmar: true }, 'cancelar evento'],
    ['admin-excel-aplicar', {}, 'aplicar careo Excel'],
    ['admin-gasto-eliminar', {}, 'eliminar gasto'],
    ['admin-nube', { accion: 'guardar' }, 'guardar cotización de la Nube'],
    ['admin-promos', { accion: 'crear' }, 'Baba crear código'],
    ['admin-promos', { accion: 'listar' }, 'Baba listar (pantalla no asignada: fuera)'],
    ['admin-radio-control', { accion: 'saltar' }, 'radio'],
  ];
  const antes = ESCRITURAS.length;
  for (const [fn, body, nom] of CERRADAS) {
    const r = await llamar(fn, body, 'director');
    af(sinPermiso(r), () => `${nom}: 403 (fue ${r.s}${r.err ? ' ' + r.err : ''})`);
  }
  af(ESCRITURAS.length === antes, () => `🔒 por el HECHO: con rol director ninguna de las ${CERRADAS.length} puertas llegó a escribir en la base (${ESCRITURAS.length - antes} escrituras)`);
  // control positivo del contador: roshi SÍ escribe por una de esas puertas (o el cero no dice nada)
  const antes2 = ESCRITURAS.length;
  await llamar('admin-radar', { accion: 'alerta_vista', id: '11111111-1111-1111-1111-111111111111' }, 'maestro_roshi');
  af(ESCRITURAS.length > antes2, 'control positivo: el contador de escrituras SÍ ve escribir a roshi por alerta_vista');
  // control positivo del rol: uno inventado rebota en una puerta ABIERTA para director
  const rx = await llamar('admin-saldos', {}, 'gerente_inventado');
  af(sinPermiso(rx), `control positivo: un rol inventado rebota en saldos (fue ${rx.s})`);
  const rr = await llamar('admin-saldos', {}, 'maestro_roshi');
  af(!sinPermiso(rr) && rr.s !== 401, `roshi sigue entrando a saldos (fue ${rr.s})`);

  console.log('[C] la lista de lecturas no contiene acciones que escriban');
  // Para cada function listada con acciones: la rama de ESA acción no debe
  // tener PATCH/POST/DELETE a rest/v1 ni Resend. Se corta la rama por el
  // `if (accion === '...')` siguiente (aprox. suficiente: un rojo aquí manda a leer).
  const FUNCS = Object.keys(LECTURAS_DIRECTOR);
  let faltan = [];
  for (const fn of FUNCS) { if (!fs.existsSync(path.join(RAIZ, 'netlify/functions', fn + '.js'))) faltan.push(fn); }
  af(faltan.length === 0, 'todas las functions listadas existen: ' + (faltan.join(', ') || 'ok'));
  const VERBOS = /method:\s*['"](PATCH|POST|DELETE|PUT)['"]|resend\.com\/emails|\/storage\/v1\/object\//;
  // Los regex literales con comillas adentro (`/"/g`) desincronizan al lector de
  // strings; se neutralizan ANTES de caminar las llaves (solo en posición de regex).
  const sinRegex = (s) => s.replace(/([=(,:?\[!&|]\s*)\/(?:[^\/\\\n]|\\.)+\/[gimsuy]*/g, '$1/re/');
  function ramaPorLlaves(src0, desde) {
    const src = sinRegex(src0);
    const o = src.indexOf('{', desde); if (o < 0) return src.slice(desde);
    let bal = 0, i = o, str = null;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (str) { if (ch === '\\') { i++; continue; } if (ch === str) str = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { str = ch; continue; }
      if (ch === '{') bal++; else if (ch === '}') { bal--; if (bal === 0) return src.slice(desde, i + 1); }
    }
    return src.slice(desde);
  }
  let sospechosas = [];
  for (const fn of FUNCS) {
    const regla = LECTURAS_DIRECTOR[fn];
    const src = fs.readFileSync(path.join(RAIZ, 'netlify/functions', fn + '.js'), 'utf8');
    if (regla === '*') {
      // function sin despacho: su cuerpo entero debe ser de lectura
      if (VERBOS.test(src.replace(/\/\/.*$/gm, ''))) sospechosas.push(fn + ':*');
      continue;
    }
    for (const acc of regla) {
      const re = new RegExp("accion\\s*===\\s*'" + acc + "'");
      const m = re.exec(sinRegex(src));
      if (!m) {
        // Sin `if` propio = es el camino por default del handler (admin-concilia:reporte):
        // entonces el archivo ENTERO tiene que ser de lectura.
        if (VERBOS.test(src.replace(/\/\/.*$/gm, ''))) sospechosas.push(fn + ':' + acc + ' (sin if propio y el archivo escribe)');
        continue;
      }
      // La rama se corta por BALANCE DE LLAVES desde el `{` del if (la ley de la
      // casa): cortar "hasta el siguiente accion ===" se tragaba el código que
      // vive después del último if (el `guardar` por default de admin-nube).
      const rama = ramaPorLlaves(src, m.index);
      if (VERBOS.test(rama.replace(/\/\/.*$/gm, ''))) sospechosas.push(fn + ':' + acc);
    }
  }
  // Lecturas que legítimamente firman URLs de storage (ver, no escribir) se declaran aquí con su razón:
  const PERMITIDAS = new Set([
    'admin-reportes:ticket_ver',        // firma URL de LECTURA del ticket (no sube)
    'admin-requisiciones:detalle',      // firma URL de LECTURA del comprobante (no sube)
    // RPCs de LECTURA de métricas: PostgREST exige POST para llamar una función; las cuatro solo leen.
    'admin-radar:metricas', 'admin-radar:main_metrics', 'admin-radar:dia', 'admin-radar:tops', 'admin-radar:giru',
  ]);
  sospechosas = sospechosas.filter((s) => !PERMITIDAS.has(s));
  af(sospechosas.length === 0, 'ninguna (fn, accion) listada tiene verbos de escritura en su rama: ' + (sospechosas.join(' · ') || 'ok'));
  // control positivo del detector: una acción que SÍ escribe lo dispara
  const srcC = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-compras.js'), 'utf8');
  const mC = /accion\s*===\s*'crear'/.exec(srcC);
  af(mC && VERBOS.test(srcC.slice(mC.index, mC.index + 4000)), 'control positivo: el detector ve escribir a admin-compras:crear');
  af(!Object.values(LECTURAS_DIRECTOR).flat().some((a) => /crear|guardar|eliminar|aprobar|rechazar|publicar|marcar|editar|cancelar|enviar|asignar|subir|fijar|recordar|aplicar|sembrar|importar|archivar/i.test(String(a))),
    'ningún nombre de acción listado suena a escritura');

  console.log('[D] KameHouse');
  const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const sinCom = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const cut = (src, ini, fin) => { const i = src.indexOf(ini); return src.slice(i, src.indexOf(fin, i)); };
  const PT = cut(kh, 'const PERMISOS_TABS = {', '\n};');
  af(/director:\s*\[/.test(PT), 'PERMISOS_TABS tiene director');
  const tabsDir = (PT.match(/director:\s*\[([^\]]*)\]/) || ['', ''])[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  af(['resumen', 'capsule', 'kamisama', 'esferas', 'saldos', 'reportes', 'radar', 'contratos'].every((t) => tabsDir.includes(t)), 'director ve resumen, capsule, kamisama, esferas, saldos, reportes, radar y contratos');
  af(!['radio', 'baba', 'genkidama', 'emma', 'diseno', 'yamcha', 'montana'].some((t) => tabsDir.includes(t)), 'director NO ve radio, baba, genkidama, emma, diseño, yamcha ni montaña (el editor de usuarios)');
  af(/director:\s*\['lista','miperfil'\]/.test(cut(kh, 'const GZ_TABS_PERMITIDAS', '\n};')), 'GZ: director ve lista y su perfil, no invita');
  af(/director:\s*'resumen'/.test(cut(kh, 'const HOME_PREFERIDO', '\n};')), 'aterriza en resumen');
  af((kh.match(/director:\s*'Director'/g) || []).length >= 3, '≥3 mapas de etiquetas de rol conocen director (enterApp, ROL_LABELS, ROL)');
  af(/function _aplicarSoloLectura/.test(kh) && /_aplicarSoloLectura\(\);/.test(cut(kh, 'function enterApp()', '\n}')), 'enterApp aplica solo-lectura');
  af(/_aplicarNombresPro\(\);/.test(cut(kh, 'function enterApp()', '\n}')), 'enterApp aplica nombres profesionales');
  af(/classList\.remove\('kh-solo-lectura'\)/.test(cut(kh, 'function doLogout', '\n}')), 'el logout quita la clase (el siguiente login en la misma pestaña nace con botones)');
  // el diccionario, EJECUTADO: estable y con las etiquetas de Memo
  const ctx = { document: { createTreeWalker() {} }, NodeFilter: {} }; vm.createContext(ctx);
  vm.runInContext(kh.slice(kh.indexOf('const NOMBRES_PRO'), kh.indexOf('let _npObs')) + ';this.NP=NOMBRES_PRO;this.tx=_npTexto;', ctx);
  const inestables = ctx.NP.filter(([, b]) => ctx.tx(b) !== b);
  af(inestables.length === 0, '🔒 el diccionario es ESTABLE: ningún resultado vuelve a casar (si no, el observador se perseguiría la cola)');
  af(ctx.tx('KAMEHOUSE — Conecta Reynosa') === 'PANEL DE CONTROL — Conecta Reynosa' && ctx.tx('Capsule Corp') === 'Viajeros' && ctx.tx('Guerreros Z') === 'Equipo' && ctx.tx('Esferas del Dragón') === 'Eventos' && ctx.tx('Palacio de Kamisama') === 'Inventario de boletos', 'los cinco nombres que Memo citó se traducen');
  af(ctx.tx('Milkshake') === 'Milkshake' && ctx.tx('Capsules') === 'Capsules', 'límite de palabra: no muerde dentro de otra palabra');
  af(/nombres_pro/.test(fs.readFileSync(path.join(RAIZ, 'netlify/functions/auth-login.js'), 'utf8')), 'auth-login manda nombres_pro en el usuario');
  const mont = fs.readFileSync(path.join(RAIZ, 'kamehouse-montana.js'), 'utf8');
  af(/mtu-nombres-pro/.test(mont) && /nombres_pro:/.test(mont), 'Montaña Pai ofrece la casilla y la manda al guardar');
  const css = fs.readFileSync(path.join(RAIZ, 'kamehouse.css'), 'utf8');
  af(/body\.tema-ejecutivo\s*\{/.test(css) && /id: 'tema-ejecutivo'/.test(kh), 'la plantilla Ejecutivo existe en CSS y en PLANTILLAS_KH');
  af(/body\.kh-solo-lectura \[onclick\*="aprobar" i\]/.test(css) && /body\.kh-solo-lectura \[onclick\*="guardar" i\]/.test(css) && /body\.kh-solo-lectura \[onclick\*="eliminar" i\]/.test(css), 'el CSS esconde aprobar/guardar/eliminar al rol de solo lectura');
  af(!/body\.kh-solo-lectura form button\[type="submit"\]/.test(css) && /#app form button\[type="submit"\]/.test(css), 'el botón de LOGIN no se esconde (la regla de submit está acotada a #app)');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(/<option value="director">/.test(html), 'el select de invitación ofrece director');

  console.log('[E] la base y las tres listas');
  const acta = fs.readFileSync(path.join(RAIZ, 'migraciones/DIRECTOR-1.sql'), 'utf8');
  const checkRoles = (acta.match(/usuarios_rol_check\s*\n?\s*check \(rol = any \(array\[([^\]]+)\]/) || ['', ''])[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  const usr = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-usuarios.js'), 'utf8');
  const rolesValidos = (usr.match(/const ROLES_VALIDOS = \[([^\]]+)\]/) || ['', ''])[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  const rolesTabs = [...PT.matchAll(/^\s*([a-z_]+):\s*\[/gm)].map((m) => m[1]);
  af(checkRoles.length === 8 && [...checkRoles].sort().join() === [...rolesValidos].sort().join(), 'CHECK del acta = ROLES_VALIDOS (8 roles)');
  af([...rolesValidos].sort().join() === [...rolesTabs].sort().join(), 'ROLES_VALIDOS = roles de PERMISOS_TABS');
  af(/ROLES_INVITA_SOLO_ROSHI = \[[^\]]*'director'/.test(usr), 'solo roshi invita a un director (ve todo el dinero)');
  af(/tema-ejecutivo/.test(acta) && /nombres_pro boolean not null default false/.test(acta), 'el acta trae la plantilla y la columna');

  console.log(`\n${R === 0 ? '✅ VERDE' : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})();
