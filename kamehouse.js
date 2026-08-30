
// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZ25oc213cGNpcHhndmZ4cmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEwNTMsImV4cCI6MjA5Mjg3NzA1M30.08Fp0YaIkD1okEWB8ao3HoPpdaq6rFi2kzAYGZ72jQg';

// ═══════════════════════════════════════════════════════════════
// AUTH — Login simple con Netlify Function
// ═══════════════════════════════════════════════════════════════
// Credenciales hardcodeadas aquí solo como fallback de desarrollo.
// En producción, esto se valida en Netlify Function.
// ═══════════════════════════════════════════════════════════════
// AUTH — Multi-usuario con roles
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// 🔒 [TZ-UNIF-1] EL RELOJ DE REYNOSA, EN UNA SOLA CONSTANTE
//
// `America/Matamoros`. No es un proxy: **es** el huso de Reynosa. Matamoros
// está a 90 km y las dos ciudades siguen el horario de EE.UU. por su condición
// fronteriza.
//
// ⚠️ LA CREENCIA QUE HABÍA ERA AL REVÉS. La casa usaba `America/Cancun` como
// «proxy de −05:00 todo el año», suponiendo que la frontera ya no cambia de
// horario. Es Monterrey la que dejó de cambiar (decreto de 2022); Reynosa SÍ
// cambia — su ayuntamiento anunció el horario de verano el 8-mar y su fin el
// 1-nov, y la base de husos coincide **al día**:
//
//     dom 8-mar-2026   Matamoros pasa de −06:00 a −05:00   ← arranca el verano
//     dom 1-nov-2026   Matamoros pasa de −05:00 a −06:00   ← termina
//
// Del 1-nov-2026 al 13-mar-2027 —133 días— Cancún se habría quedado una hora
// adelantado respecto al reloj de la pared en Reynosa. Hoy las dos dan lo
// mismo, que es justo por lo que el error era invisible.
//
// 🔒 LOS INSTANTES GUARDADOS NO SE TOCAN. Un `expiresTs` es un epoch: no tiene
// huso. Lo único que cambia es CÓMO SE PINTA. Nada en la base se reescribe.
// ═══════════════════════════════════════════════════════════════════════════
const TZ_REYNOSA = 'America/Matamoros';

const SESSION_KEY = 'kh_session_v2';
const SESSION_HOURS = 8;

let currentUser = null;
let _karinCatFilter = 'all';
let _karinPiezasCache = [];
let recibosLoaded = false;
let disenoLoaded = false;

// [SEG-2] LAS HERRAMIENTAS Y ESFERAS ENTRAN A LA TABLA, no a parches aparte.
// Antes vivían fuera: `aplicarPermisosUI` recorría una lista de 18 mientras el
// HTML tenía 23 pantallas, así que contratos/waitlist/recibos/diseno/esferas
// NUNCA pasaban por el barrido. A esferas se le puso candado propio en T7 —
// después de descubrir que su botón se veía para TODOS los roles— y a diseno
// otro para milk. Dos parches para el mismo hueco. Aquí se absorben los dos y
// el hueco se cierra en la fuente: la lista del barrido se DERIVA de las
// pantallas que existen, no se escribe a mano al lado.
// ═══ [MONO-1] LA FRONTERA PÚBLICA DEL TRONCO ═══════════════════════════════
// Estas veinte funciones las usan ONCE PANTALLAS O MÁS. Son el único núcleo
// real del archivo: todo lo demás que parecía "compartido" lo comparten dos,
// tres o cuatro pantallas —vecindarios, no núcleo—.
//
// Al ir sacando pantallas a su propio archivo, ÉSTAS SE QUEDAN aquí y se tratan
// como contrato: si una cambia de firma, cambia para todos. Renombrarlas o
// moverlas es su propia tuerca, nunca "de paso" en una extracción.
//
//   showToast (21)            khGetJwt (20)             khSetJwt (20)
//   khAdminFetch (20)         _khGuardarSesion (20)     _khAvisarSinPermiso (20)
//   doLogout (20)             _esfEsc (18)              _mxFechaStr (15)
//   openModal (15)            _evDeclaracionesHotel (15) _fetchEVFromIndex (15)
//   _evFechaOrden (14)        _evGrupoOrden (14)        _evOrdenarPorFecha (14)
//   _spEscape (13)            _spAdminHeaders (12)      _spFmtMxn (12)
//   _salEsc (11)              _attrJs (11)
//
// ⚠️ `_esfEsc` tiene nombre de Esferas y NO es de Esferas: la usan 18 pantallas.
// Se queda en el tronco. El prefijo miente sobre su casa —pasa cuando algo nace
// en una pantalla y se vuelve de todos—, y por eso la pertenencia se midió con
// el grafo de llamadas y no con los nombres.
// ═══════════════════════════════════════════════════════════════════════════

const PERMISOS_TABS = {
  maestro_roshi: ['resumen','pagos','eventos','gastos','ingresos','saldos','inventario','reportes','capsule','solicitudes_portal','equipo','kamisama','herramientas','radar','montana','yamcha','radio','esferas','baba','contratos','waitlist','recibos','diseno'],
  bulma:         ['resumen','pagos','eventos','gastos','ingresos','saldos','inventario','reportes','capsule','solicitudes_portal','equipo','herramientas'],
  mister_popo:   ['inventario','reportes','equipo'],
  coordinador:   ['inventario','reportes','equipo'],
  cc:            ['equipo'],
  // Milk (2ª auxiliar administrativa): paridad operativa con Bulma (F2) + finanzas
  // operativas (gastos/ingresos/saldos). SIN: 'ventas' (utilidad maestra), 'inventario'
  // (Torre → F3), ni kamisama/radar/montana/yamcha/radio (vetados / roshi-only).
  milk:          ['resumen','pagos','eventos','gastos','ingresos','saldos','inventario','reportes','capsule','solicitudes_portal','equipo','herramientas']
};

// Qué tabs de Guerreros Z puede ver cada rol
const GZ_TABS_PERMITIDAS = {
  maestro_roshi: ['lista','invitar','miperfil'],
  bulma:         ['lista','invitar','miperfil'],
  mister_popo:   ['lista','miperfil'],
  coordinador:   ['lista','miperfil'],
  cc:            ['lista','miperfil'],
  milk:          ['lista','miperfil'],   // ve el equipo y su perfil; NO 'invitar' (crear cuentas vetado)
};

// F5 Milk: gate de UI para botones DESTRUCTIVOS que milk tiene VETADOS en el
// backend (eliminar gastos/ingresos/eventos/contratos). Solo roshi/bulma → para
// ellos el render es byte-igual (siempre pudieron borrar); para milk se ocultan.
function _puedeBorrarAdmin() { return ['maestro_roshi', 'bulma'].includes(currentUser && currentUser.rol); }

// ── TOAST ──
function showToast(msg, tipo) {
  tipo = tipo || 'error';
  var col = tipo === 'error' ? '#FF4444' : tipo === 'success' ? '#3DDC84' : '#FFD700';
  var t = document.getElementById('_kh_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_kh_toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;max-width:420px;width:90%;pointer-events:none;transition:opacity .3s';
    document.body.appendChild(t);
  }
  t.innerHTML = '<div style="background:rgba(20,20,30,.95);border:1px solid '+col+';border-radius:var(--r-sm,8px);padding:12px 18px;font-size:13px;color:'+col+'">'+msg+'</div>';
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(function(){ t.style.opacity = '0'; }, 3500);
}

// JWT del backend tras login exitoso. Se manda como Authorization Bearer en
// requests a admin functions (contrato-*, send-invite, github-publish, etc.).
// Se preserva en localStorage para sobrevivir reloads.
const KH_JWT_KEY = 'kh_jwt_v1';
function khGetJwt() { try { return localStorage.getItem(KH_JWT_KEY) || ''; } catch (e) { return ''; } }
function khSetJwt(t) { try { if (t) localStorage.setItem(KH_JWT_KEY, t); else localStorage.removeItem(KH_JWT_KEY); } catch (e) {} }
// [sec-401] guarda para no disparar logout-storm cuando varios fetch caen 401 a la vez
let _khSessionExpired = false;

// Wrapper de fetch que agrega Authorization Bearer automáticamente.
// Usar para endpoints admin (contrato-*, send-invite, github-publish, etc.)
// que ahora requieren JWT. Si el JWT expiró/es inválido, el endpoint devolverá
// 401 y el caller debe manejar el re-login.
async function khAdminFetch(url, options) {
  options = options || {};
  const jwt = khGetJwt();
  const baseHeaders = { 'Content-Type': 'application/json' };
  options.headers = Object.assign(
    {},
    baseHeaders,
    options.headers || {},
    jwt ? { 'Authorization': 'Bearer ' + jwt } : {}
  );
  const resp = await fetch(url, options);
  await _khGuardarSesion(resp);
  return resp;
}

// [ses-1] El servidor NO es ambiguo, y hay que leerlo tal cual en vez de
// adivinar (verificado ejecutando el guardia real con un token vencido, con un
// rol sin permiso y sin header):
//   401 → SESIÓN: falta el token, está vencido/inválido, o la sesión se revocó.
//   403 → PERMISO del rol, o una regla de negocio. NUNCA es la sesión.
// Por eso el 401 expulsa al login con aviso —seguir picando botones con una
// sesión muerta sólo produce errores secos— y el 403 JAMÁS expulsa: sacar a
// alguien por un permiso lo deja creyendo que se le venció la sesión, vuelve a
// entrar y se encuentra exactamente lo mismo.
// Se devuelve la resp intacta en los dos casos, para no romper al caller en vuelo.
async function _khGuardarSesion(resp) {
  if (resp.status === 401) {
    if (_khSessionExpired) return;          // guarda anti logout-storm
    _khSessionExpired = true;
    showToast('Tu sesión expiró. Vuelve a entrar.', 'error');
    doLogout();
    return;
  }
  if (resp.status === 403) await _khAvisarSinPermiso(resp);
}

// El 403 del guardia trae este texto EXACTO en sus dos ramas de rol
// (`_lib/verify-admin.js`: "Rol 'X' sin permiso para este endpoint"). Se compara
// contra ÉL para no confundirlo con los 403 de regla de negocio —puerta cerrada
// de gastos, vendedor inactivo, origen no permitido—, que cada pantalla ya
// explica a su manera. Se lee de un clon: el cuerpo original es del caller.
const KH_403_PERMISO = 'sin permiso para este endpoint';
async function _khAvisarSinPermiso(resp) {
  try {
    const d = await resp.clone().json();
    if (d && typeof d.error === 'string' && d.error.includes(KH_403_PERMISO)) {
      showToast('Tu rol no tiene permiso para esta acción.', 'error');
    }
  } catch (e) { /* cuerpo no-JSON: la pantalla mostrará lo suyo */ }
}

// ── NOTIFICACIONES IN-APP (DC2c-A) ──────────────────────────────────────────
// Capa in-app que acompaña los emails. Lecturas/marcado scopeados por el JWT.
let _notifCache = [];

async function _cargarNotificaciones() {
  try {
    const r = await khAdminFetch('/.netlify/functions/notificaciones', {
      method: 'POST', body: JSON.stringify({ accion: 'list' }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || 'fail');
    _notifCache = data.notificaciones || [];
    _pintarBadgeNotif(data.no_leidas || 0);
    _renderNotifPanel();
  } catch (e) {
    _pintarBadgeNotif(0); // fails-soft: oculta badge, no rompe el panel
  }
}

function _pintarBadgeNotif(n) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (n > 0) { badge.textContent = n > 99 ? '99+' : String(n); badge.style.display = 'flex'; }
  else { badge.style.display = 'none'; }
}

function _toggleNotifPanel(ev) {
  if (ev) ev.stopPropagation();
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  if (panel.style.display === 'block') { _closeNotifPanel(); return; }
  _renderNotifPanel();
  panel.style.display = 'block';
  setTimeout(() => document.addEventListener('click', _notifOutsideHandler), 0);
}

function _notifOutsideHandler(ev) {
  const wrap = document.getElementById('notif-wrap');
  if (wrap && wrap.contains(ev.target)) return; // click dentro del wrap: ignora
  _closeNotifPanel();
}

function _closeNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (panel) panel.style.display = 'none';
  document.removeEventListener('click', _notifOutsideHandler);
}

function _renderNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const items = _notifCache.length ? _notifCache.map(n => {
    // [CAP5-1] doble capa (JS + HTML): el valor entra en un onclick.
    const linkArg = n.link ? `'${_attrJs(n.link)}'` : 'null';
    return `
    <div class="notif-item ${n.leida ? '' : 'unread'}" onclick="_marcarNotifLeida('${n.id}', ${linkArg})">
      <div class="notif-dot ${n.leida ? 'read' : ''}"></div>
      <div class="notif-item-body">
        ${n.titulo ? `<div class="notif-item-title">${_escNotif(n.titulo)}</div>` : ''}
        <div class="notif-item-msg">${_escNotif(n.mensaje)}</div>
        <div class="notif-item-time">${_haceCuanto(n.created_at)}</div>
      </div>
    </div>`;
  }).join('') : '<div class="notif-empty">// sin notificaciones</div>';
  panel.innerHTML = `
    <div class="notif-panel-head">
      <div class="notif-panel-title">Notificaciones</div>
      ${_notifCache.some(n => !n.leida) ? '<button class="notif-mark-all" onclick="_marcarTodasNotif(event)">Marcar todas leídas</button>' : ''}
    </div>
    ${items}`;
}

async function _marcarNotifLeida(id, link) {
  try {
    await khAdminFetch('/.netlify/functions/notificaciones', {
      method: 'POST', body: JSON.stringify({ accion: 'marcar_leida', id }),
    });
  } catch (e) {}
  await _cargarNotificaciones();
  if (link) { _closeNotifPanel(); _notifNav(link); }
}

// Navega al destino de una notificación. Tokens internos (p.ej. 'perfil') abren
// el tab IN-APP sin recargar; una URL http/https navega normal. Fails-soft.
function _notifNav(link) {
  try {
    const l = String(link || '').trim();
    if (!l) return;
    if (/^https?:\/\//i.test(l)) { window.location.href = l; return; }
    if (l === 'perfil' || l === 'app:perfil') {
      showPage('equipo');
      const btn = document.querySelector('.gz-tab-btn[onclick*="miperfil"]');
      showGZTab('miperfil', btn || null);
      return;
    }
    // Fallback: trátalo como ruta/URL.
    window.location.href = l;
  } catch (_) { /* fails-soft: no rompe el panel */ }
}

async function _marcarTodasNotif(ev) {
  if (ev) ev.stopPropagation();
  try {
    await khAdminFetch('/.netlify/functions/notificaciones', {
      method: 'POST', body: JSON.stringify({ accion: 'marcar_todas' }),
    });
  } catch (e) {}
  await _cargarNotificaciones();
}

// Crea una notif vía la función (accion:'crear'). Fails-soft: NUNCA lanza, para
// no bloquear la acción principal (email/strike) si la notif falla.
async function _crearNotif(payload) {
  try {
    await khAdminFetch('/.netlify/functions/notificaciones', {
      method: 'POST', body: JSON.stringify(Object.assign({ accion: 'crear' }, payload)),
    });
  } catch (e) { /* fails-soft */ }
}

function _escNotif(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _haceCuanto(ts) {
  if (!ts) return '';
  const then = new Date(ts).getTime();
  if (isNaN(then)) return '';
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return 'hace un momento';
  const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24); if (d < 7) return `hace ${d} d`;
  return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

async function doLogin() {
  const credentials = document.getElementById('login-user').value.trim().toLowerCase();
  const pass        = document.getElementById('login-pass').value.trim();
  const errEl       = document.getElementById('login-error');
  const btn         = document.getElementById('login-btn');
  if (!credentials || !pass) {
    errEl.textContent = 'Ingresa correo y contraseña';
    errEl.style.display = 'block';
    setTimeout(() => errEl.style.display = 'none', 3000);
    return;
  }
  btn.textContent = 'Entrando…'; btn.disabled = true;
  try {
    // Login pasa por Netlify Function que usa service_role — el cliente
    // ya NO consulta usuarios directamente con anon key. Service Stop the Bleed.
    const resp = await fetch('/.netlify/functions/auth-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials, password: pass }),
    });
    let data;
    try { data = await resp.json(); } catch (e) { data = {}; }
    if (resp.status === 429) {
      throw new Error(data.error || 'Demasiados intentos. Intenta más tarde.');
    }
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Credenciales inválidas');
    }
    currentUser = data.user;
    khSetJwt(data.token);
    _khSessionExpired = false; // [sec-401] sesión fresca, rearma el manejador
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      user: data.user,
      expires: Date.now() + (data.ttl ? data.ttl * 1000 : SESSION_HOURS * 3600000),
    }));
    enterApp();
  } catch(e) {
    errEl.textContent = e.message || 'Error al iniciar sesión';
    errEl.style.display = 'block';
    setTimeout(() => errEl.style.display = 'none', 4000);
  } finally {
    btn.textContent = 'Entrar'; btn.disabled = false;
  }
}

function doLogout() {
  currentUser = null;
  sessionStorage.removeItem(SESSION_KEY);
  khSetJwt(null);
  document.getElementById('app').classList.remove('visible');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-pass').value = '';
}

function checkSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    if (Date.now() > s.expires) {
      sessionStorage.removeItem(SESSION_KEY);
      khSetJwt(null);
      return false;
    }
    // Si la sesión vive pero perdimos el JWT (ej. localStorage clearado),
    // forzamos re-login. Sin JWT no podemos invocar admin functions.
    if (!khGetJwt()) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    currentUser = s.user;
    return true;
  } catch { return false; }
}

function enterApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
  const roleLabels = { maestro_roshi:'Maestro Roshi', bulma:'Bulma', mister_popo:'Maestro Karin', coordinador:'Coordinador', cc:'CC', milk:'Milk' };
  document.getElementById('topbar-user-info').textContent = `${currentUser.nombre} · ${roleLabels[currentUser.rol] || currentUser.rol}`;
  aplicarPermisosUI();
  aplicarTemaCoordi();
  applyTema(currentUser.tema_acento);
  // [PERF v1] Boot mínimo: el CRITICAL PATH carga solo sesión/permisos (arriba,
  // sin fetch) + la pestaña visible (bootApp → loadResumen). Los badges de
  // chrome (notificaciones, pendientes) NO bloquean el primer render: se
  // difieren a idle para que la vista aparezca antes. Siguen fails-soft.
  bootApp();
  _renderSaludo();   // 🎬 saludo del día "de cine" — TODOS los roles, instantáneo
  _maybeCheckin();   // 😮‍💨 check-in de ánimo (solo admins, 1 vez/día, localStorage)
  const _idle = window.requestIdleCallback || (fn => setTimeout(fn, 200));
  _idle(() => {
    _cargarNotificaciones(); // badge de no leídas
    _spContarPendientes();   // [Bandeja-T2] badge de pendientes en el nav
    checkMensajeDia();       // banner mensaje del día (chrome)
    _kmSearchInit();         // buscadores universales en las listas de datos
  });
}

// ═══════════════════════════════════════════════════════════════
// BUSCADORES UNIVERSALES (client-side) — una barrita por panel que filtra por
// TEXTO las filas/tarjetas YA renderizadas. NO toca datos, queries ni backend
// (cero riesgo). Un MutationObserver re-aplica el filtro tras cualquier
// re-render del contenedor (sort, filtros, refresco). Idempotente: se monta
// una sola vez por contenedor. Los paneles con buscador propio (Capsule/cc-buscar,
// Guerreros Z, equipo, biblioteca, cobranza) NO se tocan.
// ═══════════════════════════════════════════════════════════════
const _KM_SEARCH = [
  ['atrasados-lista',  '.dash-click', 'Buscar viajero atrasado…'],
  ['tabla-pagos',      'tr',          'Buscar viajero, evento, teléfono…'],
  ['tabla-viajeros',   'tr',          'Buscar viajero, zona, estado…'],
  ['tabla-gastos',     'tr',          'Buscar gasto, concepto, evento…'],
  ['tabla-ingresos',   'tr',          'Buscar ingreso, cliente, evento…'],
  ['tabla-inventario', 'tr',          'Buscar pieza…'],
  ['saldos-content',   '.saldo-card', 'Buscar cuenta…'],
  ['ventas-content',   '.card',       'Buscar evento…'],
  ['reportes-list',    '',            'Buscar reporte, evento, coordinador…'],
  ['sp-table',         'tbody tr',    'Buscar solicitud, cliente, evento…'],
];

// Normaliza para búsqueda insensible a acentos/mayúsculas: "Julión"→"julion",
// "PEÑA"→"pena". Así la gente teclea sin acentos y encuentra igual.
function _kmNorm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// Filtra por texto visible las filas/tarjetas del contenedor (itemSel vacío =
// hijos directos). Solo cambia display → no dispara el observer de childList.
function _kmBuscar(contId, itemSel) {
  const cont = document.getElementById(contId);
  if (!cont) return;
  const inp = document.getElementById('kmb-' + contId);
  const q = _kmNorm((inp ? inp.value : '').trim());
  const items = itemSel ? cont.querySelectorAll(itemSel) : cont.children;
  Array.prototype.forEach.call(items, (node) => {
    const hit = !q || _kmNorm(node.textContent).includes(q);
    node.style.display = hit ? '' : 'none';
  });
}

// Monta (idempotente) la barrita antes de la tabla/lista y engancha el observer.
function _kmSearchMount(contId, itemSel, placeholder) {
  const cont = document.getElementById(contId);
  if (!cont || cont._kmWired) return;
  cont._kmWired = true;
  const anchor = cont.closest('.table-wrap') || cont.closest('table') || cont;
  if (!anchor.parentNode) return;   // contenedor sin padre en el DOM → no monta
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin:0 0 10px';
  const esc = _attrJs(itemSel || '');   // [CAP5-1] doble capa (va dentro de oninput)
  wrap.innerHTML = `<input type="text" id="kmb-${contId}" class="cot-input" autocomplete="off" placeholder="${_esfEsc(placeholder)}" oninput="_kmBuscar('${contId}','${esc}')" style="width:100%;max-width:340px;box-sizing:border-box">`;
  anchor.parentNode.insertBefore(wrap, anchor);
  new MutationObserver(() => _kmBuscar(contId, itemSel)).observe(cont, { childList: true });
  _kmBuscar(contId, itemSel);   // re-aplica si quedó texto de antes
}

function _kmSearchInit() {
  // Fail-safe POR PANEL: un contenedor problemático no debe tumbar los demás.
  _KM_SEARCH.forEach(([id, sel, ph]) => { try { _kmSearchMount(id, sel, ph); } catch (_) {} });
}



// ── TEMA DE ACENTO PERSONALIZADO (DC1) ──
// Cada usuario elige su color de acento; se guarda en usuarios.tema_acento.
// Solo presets brillantes (texto oscuro legible encima). null = lima por defecto.
const TEMA_PRESETS = [
  { hex: '#e8ff4c', nombre: 'Lima' },
  { hex: '#ff3ea5', nombre: 'Magenta' },
  { hex: '#3ee0ff', nombre: 'Cyan' },
  { hex: '#ffa033', nombre: 'Ámbar' },
  { hex: '#ff6b4c', nombre: 'Coral' },
];



// [E5-4] QUÉ PANTALLAS LLEVAN CANDADO. Se DERIVA de PERMISOS_TABS —la tabla que
// ya existe— en vez de preguntarle al menú.
//
// Antes, showPage decidía "¿la filtro?" con `document.getElementById('nav-'+name)`:
// o sea, una pantalla tenía candado sólo si tenía BOTÓN. Mientras el menú y los
// permisos coincidieran no se notaba, pero ata la seguridad a la decoración —
// y E5-4 saca dos pantallas del menú justamente. Borrar el botón de Saldos
// habría apagado su chequeo de permiso de paso, en silencio: un vendedor
// entrando a finanzas por un cambio cosmético.
//
// Medido al hacer el cambio: los 23 ids `nav-*` que son pantalla están dentro de
// esta unión, así que nadie pierde candado al mudar la fuente. El arnés lo
// assertea para que siga siendo cierto: una pantalla con botón pero fuera de
// PERMISOS_TABS quedaría sin candado, y eso tiene que tronar.
const TABS_CON_PERMISO = new Set(Object.values(PERMISOS_TABS).flat());


// [E5-5] EL ATERRIZAJE POR ROL — la preferencia PROPONE, _puedeVerTab DISPONE.
//
// Antes no había aterrizaje: `page-resumen` nacía con class="active" en el HTML
// y bootApp llamaba loadResumen() sin preguntar. Medido contra PERMISOS_TABS,
// eso dejaba a CUATRO de siete roles cayendo en una pantalla que no tienen —
// mister_popo, coordinador, cc y vendedor no llevan 'resumen'— y loadResumen
// arranca con _cobCargarTodo(true), o sea carga de cobranza de verdad.
//
// HOME_PREFERIDO no es un permiso y no amplía ninguno: solo elige ENTRE LO QUE
// EL ROL YA PUEDE VER. Ejemplo firmado: milk SÍ tiene 'resumen', pero su
// aterrizaje es su captura. Si la preferencia no pasa el candado —le bloquearon
// esa pantalla— se cae sola a la siguiente permitida.
const HOME_PREFERIDO = {
  maestro_roshi: 'resumen',
  bulma: 'pagos',
  milk: 'pagos',
};

// Primera pantalla que este usuario SÍ puede ver: su preferencia, luego el
// orden en que su rol trae sus tabs, luego sus tabs_extra. Todo pasa por
// _puedeVerTab — la misma fuente única de SEG-2, sin lista nueva al lado.
// Devuelve null si no le queda NINGUNA (todo bloqueado): ese caso se dice con
// palabras en page-sin_acceso, ni en blanco ni en una pantalla ajena.
function _homeDeRol() {
  if (!currentUser) return null;
  const candidatos = [
    HOME_PREFERIDO[currentUser.rol],
    ...(PERMISOS_TABS[currentUser.rol] || []),
    ...(currentUser.permisos_extra?.tabs_extra || []),
  ];
  return candidatos.find(t => t && _puedeVerTab(t)) || null;
}

// Los atajos del home. El ROL decide qué es RELEVANTE (qué hace esa persona a
// diario); _puedeVerTab decide qué está PERMITIDO. Son dos preguntas distintas
// y se mantienen separadas: aquí NO se consulta ningún rol para permitir, solo
// para ordenar la vitrina. Por eso milk no ve "Ventas" —no tiene 'ventas'— sin
// que este catálogo tenga que saberlo.
const ATAJOS_HOME = {
  maestro_roshi: [
    { tab: 'esferas',  etiqueta: 'Crear evento' },
    { tab: 'kamisama', etiqueta: 'Pedido de boletos' },   // FIRMADO: el stock por evento
    { tab: 'gastos',   etiqueta: 'Registrar gasto' },
    { tab: 'radar',    etiqueta: 'Radar' },
    { tab: 'recibos',  etiqueta: 'Recibos',  herramienta: true },
    { tab: 'diseno',   etiqueta: 'Diseño',   herramienta: true },
  ],
  bulma: [
    // [E5-6] 'solicitudes_portal' acaba de perder su entrada del menú: un atajo
    // rescata un destino real, no repite uno que ya tiene puerta. Por eso NO
    // hay atajo "Cobranza": aterrizaría en la misma pantalla que "Registrar
    // pago", y dos botones al mismo sitio no son dos atajos.
    { tab: 'solicitudes_portal', etiqueta: 'Por aprobar' },
    { tab: 'pagos',    etiqueta: 'Registrar pago' },
    { tab: 'ingresos', etiqueta: 'Registrar ingreso' },
    { tab: 'ventas',   etiqueta: 'Ventas' },
  ],
  milk: [
    // [E5-6] 'solicitudes_portal' acaba de perder su entrada del menú: un atajo
    // rescata un destino real, no repite uno que ya tiene puerta. Por eso NO
    // hay atajo "Cobranza": aterrizaría en la misma pantalla que "Registrar
    // pago", y dos botones al mismo sitio no son dos atajos.
    { tab: 'solicitudes_portal', etiqueta: 'Por aprobar' },
    { tab: 'pagos',    etiqueta: 'Registrar pago' },
    { tab: 'ingresos', etiqueta: 'Registrar ingreso' },
    { tab: 'ventas',   etiqueta: 'Ventas' },   // milk NO tiene 'ventas': el filtro lo quita
  ],
};

// Pinta los atajos que el usuario puede usar. Si no le queda ninguno, el bloque
// se queda oculto: un contenedor vacío anuncia algo que no va a llegar.
function _renderAtajosHome() {
  const cont = document.getElementById('resumen-atajos');
  if (!cont || !currentUser) return;
  const visibles = (ATAJOS_HOME[currentUser.rol] || []).filter(a => _puedeVerTab(a.tab));
  if (!visibles.length) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
  cont.innerHTML = '<div class="k-mono" style="margin-bottom:10px">// ACCIONES RÁPIDAS</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px">'
    + visibles.map(a => {
        // Sin segundo parámetro: todos estos destinos SÍ tienen botón de menú, así
        // que showPage saca el rótulo móvil de ahí. Pasarlo sería argumento muerto.
        const abrir = a.herramienta ? `showHerramienta('${a.tab}')` : `showPage('${a.tab}')`;
        return `<button class="btn btn-ghost btn-sm" onclick="${abrir}">${a.etiqueta}</button>`;
      }).join('')
    + '</div>';
  cont.style.display = '';
}

// [SEG-2] FUENTE ÚNICA del permiso de pantalla. La usan el barrido de la UI,
// showPage y showHerramienta — para que "lo que se ve" y "a dónde se puede
// entrar" no puedan separarse nunca. Sin sesión no se ve nada: el lado seguro.
function _puedeVerTab(tab) {
  if (!currentUser) return false;
  const base = PERMISOS_TABS[currentUser.rol] || [];
  const extras = currentUser.permisos_extra?.tabs_extra || [];
  const bloqueados = currentUser.permisos_extra?.tabs_bloqueados || [];
  return [...base, ...extras].includes(tab) && !bloqueados.includes(tab);
}

function aplicarPermisosUI() {
  if (!currentUser) return;
  const rol = currentUser.rol;
  const base = PERMISOS_TABS[rol] || [];
  const extras = currentUser.permisos_extra?.tabs_extra || [];
  // [VEN-PAUSA-1] El filtro pasa por _puedeVerTab en vez de re-derivar
  // base+extras−bloqueados por su cuenta. Re-derivarlo era una SEGUNDA fuente
  // del mismo permiso —justo lo que SEG-2 combate— y además se saltaría la
  // pausa: los botones del módulo seguirían pintándose en el menú.
  const tabsPermitidos = [...new Set([...base, ...extras])].filter(t => _puedeVerTab(t));
  // [SEG-2] LA LISTA SE DERIVA DEL DOM, no se escribe al lado. Dos listas iguales
  // no existen: solo listas que todavía no divergen, y ésta ya había divergido
  // (18 contra 23). Si mañana nace una pantalla nueva, entra al barrido sola —
  // y si nadie le da permiso a nadie, nace CERRADA, que es el lado correcto
  // para fallar.
  const allTabs = [...document.querySelectorAll('[id^="page-"]')]
    .map(p => p.id.slice(5))
    .filter(id => document.getElementById('nav-' + id));
  allTabs.forEach(tab => {
    const btn = document.getElementById('nav-' + tab);
    if (btn) btn.style.display = tabsPermitidos.includes(tab) ? '' : 'none';
  });
  // El desplegable de Herramientas obedece la MISMA fuente: se ve si al rol le
  // queda al menos una herramienta. Antes llevaba su propia lista de roles a
  // mano, que es la tercera copia del mismo permiso.
  const HERRAMIENTAS = ['recibos','contratos','waitlist','diseno'];
  const dropdownHerr = document.getElementById('nav-dropdown-herramientas');
  if (dropdownHerr) dropdownHerr.style.display = HERRAMIENTAS.some(h => tabsPermitidos.includes(h)) ? '' : 'none';
  const karinAdminBtns = document.getElementById('karin-admin-btns');
  if (karinAdminBtns) karinAdminBtns.style.display = ['maestro_roshi','mister_popo'].includes(rol) ? 'flex' : 'none';

  // Ocultar botones de tabs de Guerreros Z segun rol
  const gzPermitidas = GZ_TABS_PERMITIDAS[rol] || ['lista','miperfil'];
  const btnLista   = document.querySelector('.gz-tab-btn[onclick*=\'lista\']');
  const btnInvitar = document.querySelector('.gz-tab-btn[onclick*=\'invitar\']');
  const btnPerfil  = document.querySelector('.gz-tab-btn[onclick*=\'miperfil\']');
  if (btnLista)   btnLista.style.display   = gzPermitidas.includes('lista')    ? '' : 'none';
  if (btnInvitar) btnInvitar.style.display = gzPermitidas.includes('invitar')  ? '' : 'none';
  if (btnPerfil)  btnPerfil.style.display  = gzPermitidas.includes('miperfil') ? '' : 'none';

  // [fix/invitar-milk] El select de invitación ofrece los dos roles de más alto
  // privilegio (bulma y milk — milk va justo debajo de bulma) SOLO a maestro_roshi.
  // El backend (admin-usuarios 'crear') ya rechaza con 403 que un bulma los cree;
  // esto es el candado visual espejo. Para no-roshi: ocultar+deshabilitar esas dos
  // opciones y, si alguna quedó seleccionada, saltar a la primera opción visible.
  const selInv = document.getElementById('inv-rol');
  if (selInv) {
    const soloRoshi = rol === 'maestro_roshi';
    Array.from(selInv.options).forEach(opt => {
      if (opt.value === 'bulma' || opt.value === 'milk') {
        opt.hidden = !soloRoshi;
        opt.disabled = !soloRoshi;
      }
    });
    const actual = selInv.options[selInv.selectedIndex];
    if (actual && (actual.hidden || actual.disabled)) {
      const primeraVisible = Array.from(selInv.options).find(o => !o.hidden && !o.disabled);
      if (primeraVisible) selInv.value = primeraVisible.value;
    }
  }

  // Ranking: todos los que llegan a GZ lo pueden ver
  const btnRanking = document.querySelector('[onclick*=\'abrirRanking\']');
  if (btnRanking) btnRanking.style.display = '';
  // Filtros de Guerreros Z: solo admins
  const gzFiltros = document.getElementById('gz-filtros-admin');
  if (gzFiltros) gzFiltros.style.display = ['maestro_roshi','bulma'].includes(rol) ? 'flex' : 'none';
  // [EQ-2] Activos | Pausados: mismo candado. Que alguien esté pausado es un
  // asunto de personal — el resto del equipo no lo ve, y renderGZ además fuerza
  // la vista de activos para no-admins (el botón oculto no es un candado).
  const gzVistaEl = document.getElementById('gz-vista-admin');
  if (gzVistaEl) gzVistaEl.style.display = ['maestro_roshi','bulma'].includes(rol) ? 'flex' : 'none';
  // Etiqueta de solo lectura para roles no-admin en la lista
  const soloLecturaLabel = document.getElementById('gz-solo-lectura-label');
  const esAdmin = ['maestro_roshi','bulma'].includes(rol);
  if (soloLecturaLabel) soloLecturaLabel.style.display = esAdmin ? 'none' : 'flex';

  showPage(tabsPermitidos[0] || 'resumen');
}

const _loginPassEl = document.getElementById('login-pass');
if (_loginPassEl) _loginPassEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
const loginUserEl = document.getElementById('login-user');
if (loginUserEl) loginUserEl.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-pass').focus(); });

// ═══════════════════════════════════════════════════════════════
// SUPABASE — Capa de datos
// ═══════════════════════════════════════════════════════════════
const db = {
 headers: {
 'apikey': SB_KEY,
 'Authorization': 'Bearer ' + SB_KEY,
 'Content-Type': 'application/json',
 'Prefer': 'return=representation'
 },

 async get(table, params = '') {
 const r = await fetch(`${SB_URL}/rest/v1/${table}${params}`, { headers: db.headers });
 if (!r.ok) throw new Error(await r.text());
 return r.json();
 },

 async post(table, body) {
 const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
 method: 'POST', headers: db.headers, body: JSON.stringify(body)
 });
 if (!r.ok) throw new Error(await r.text());
 return r.json();
 },

 async upsert(table, body, onConflict) {
 const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
 method: 'POST',
 headers: Object.assign({}, db.headers, { 'Prefer': 'resolution=merge-duplicates,return=representation' }),
 body: JSON.stringify(body)
 });
 if (!r.ok) throw new Error(await r.text());
 return r.json();
 },

 async patch(table, id, body) {
 const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
 method: 'PATCH', headers: db.headers, body: JSON.stringify(body)
 });
 if (!r.ok) throw new Error(await r.text());
 return r.json();
 },

 async delete(table, id) {
 const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
 method: 'DELETE', headers: db.headers
 });
 if (!r.ok) throw new Error(await r.text());
 return true;
 },

 // Llama una función Postgres vía PostgREST: POST /rest/v1/rpc/<fn> con body {args}.
 async rpc(fn, body) {
 const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
 method: 'POST', headers: db.headers, body: JSON.stringify(body || {})
 });
 if (!r.ok) throw new Error(await r.text());
 return r.json();
 }
};

// [sec-usuarios] Acceso a la tabla `usuarios` vía Netlify Function (service_role).
// Reemplaza db.get/post/patch('usuarios', ...). El RLS de `usuarios` ya NO expone
// PII (nombre/correo/rol/password_hash) a la anon key. La función whitelistea
// columnas (nunca devuelve password_hash) y hashea cualquier password con bcrypt.
const khUsuarios = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-usuarios', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-usuarios ' + r.status));
    return j;
  },
  // listar({ activos?, ids?, rol?, correo?, orden? }) → array de usuarios (sin password)
  listar(opts) { return this._call(Object.assign({ accion: 'listar' }, opts || {})).then(j => j.usuarios || []); },
  // obtener(id) → un usuario (objeto) o null
  obtener(id) { return this._call({ accion: 'obtener', id }).then(j => j.usuario || null); },
  // verificarUsername(username, excludeId?) → bool disponible
  verificarUsername(username, excludeId) { return this._call({ accion: 'verificar_username', username, excludeId }).then(j => j.disponible); },
  // crear(correo, rol) → { id, correo, nombre, rol, invite_token }
  crear(correo, rol) { return this._call({ accion: 'crear', correo, rol }).then(j => j.usuario); },
  // actualizar(id, patch) → ok (password en patch.password se hashea server-side)
  actualizar(id, patch) { return this._call({ accion: 'actualizar', id, patch }); },
  // [CAP2-3] cerrarSesiones(id) → invalida TODOS sus tokens vigentes (≤60 s)
  cerrarSesiones(id) { return this._call({ accion: 'cerrar_sesiones', id }); },
};

// [sec-contratos] Acceso a contratos_creadores vía Netlify Function con
// service_role (cerramos la lectura anon). Solo maestro_roshi/bulma.
// firma_data/ine/ip_firma NUNCA viajan al front (excluidos en admin-contratos.js).
const khContratos = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-contratos', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-contratos ' + r.status));
    return j;
  },
  // listar({ estado?, evento_fecha?, creador?, evento?, limit? }) → array de contratos
  listar(opts) { return this._call(Object.assign({ accion: 'listar' }, opts || {})).then(j => j.contratos || []); },
  // obtener(id) → un contrato (objeto) o null
  obtener(id) { return this._call({ accion: 'obtener', id }).then(j => j.contrato || null); },
};

// [TORRE v2 F3] Salidas de bodega vía admin-salidas (service_role en el backend).
// El error conserva j (e.data) para pintar los 409 del backend tal cual (sin_stock).
const khSalidas = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-salidas', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) {
      const e = new Error(j.error || ('admin-salidas ' + r.status));
      e.data = j; e.status = r.status;
      throw e;
    }
    return j;
  },
  crear(evento_id, detalle, notas) { return this._call({ accion: 'crear', evento_id, detalle, notas }); },
  // [F4b] listar guarda la cuenta de LA EMPRESA (si el backend la mandó) para
  // pintarla junto a los faltantes pendientes del viajero.
  listar(opts) { return this._call(Object.assign({ accion: 'listar' }, opts || {})).then(j => { khSalidas.ultimaCuentaEmpresa = j.cuenta_empresa || null; return j.salidas || []; }); },
  darSalida(id) { return this._call({ accion: 'dar_salida', id }); },
  rechazar(id, motivo) { return this._call({ accion: 'rechazar', id, motivo }); },
  cancelar(id) { return this._call({ accion: 'cancelar', id }); },
  faltantesPagado(id) { return this._call({ accion: 'faltantes_pagado', id }); }, // [F4b] SOLO Memo
  // [O2] expediente de una pieza → { pieza, resumen, historial, ve_costos }
  kardex(pieza_id) { return this._call({ accion: 'kardex', pieza_id }); },
  // [O4] quién trae retornables sin regresar → { [usuario_id]: {piezas,total} }
  prestadoEquipo() { return this._call({ accion: 'prestado_equipo' }).then(j => j.prestado || {}); },
  ultimaCuentaEmpresa: null,
};

// [sec-reportes] Acceso a reportes_evento vía Netlify Function con service_role
// (cerramos lectura/escritura anon). El backend hace cumplir los roles y el
// anti-escalación: el coordi SOLO ve/edita SU reporte y nunca cambia el estado
// de aprobación. evento_id es slug (no uuid).
const khReportes = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-reportes', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) {
      // [TORRE v2 F4b] e.data conserva el JSON del 409 (diferencias/cobrable)
      const e = new Error(j.error || ('admin-reportes ' + r.status));
      e.data = j; e.status = r.status;
      throw e;
    }
    return j;
  },
  // listar({ estado?, evento_id?, coordi_id?, limit? }) → array de reportes
  // (el backend fuerza coordi_id al del JWT cuando el rol es coordinador)
  listar(opts) { return this._call(Object.assign({ accion: 'listar' }, opts || {})).then(j => j.reportes || []); },
  // guardarMio(body) → { ok, id } — coordi crea/edita SU reporte (status borrador|enviado)
  guardarMio(body) { return this._call(Object.assign({ accion: 'guardar_mio' }, body || {})); },
  // enviarMio(id) → coordi pone SU reporte en 'enviado'
  enviarMio(id) { return this._call({ accion: 'enviar_mio', id }); },
  // moderación
  aprobarPopo(id) { return this._call({ accion: 'aprobar_popo', id }); },
  // [F4b] destranca el 409 de comparación COBRANDO los faltantes (queda registro)
  aprobarPopoCobrando(id) { return this._call({ accion: 'aprobar_popo', id, cobrar_faltantes: true }); },
  aprobarFinal(id) { return this._call({ accion: 'aprobar_final', id }); },
  rechazar(id, motivo) { return this._call({ accion: 'rechazar', id, motivo }); },
  marcarKitsRecibidos(id, kits_detalle) { return this._call({ accion: 'marcar_kits_recibidos', id, kits_detalle }); },
  eliminar(id) { return this._call({ accion: 'eliminar', id }); },
};
// [sec-tours] Acceso a tours_pasados vía Netlify Function con service_role
// (cerramos lectura/escritura anon). Lectura: cualquier logueado. Crear/eliminar:
// el backend exige que el tour sea del propio usuario salvo admin (maestro_roshi/bulma).
const khTours = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-tours', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-tours ' + r.status));
    return j;
  },
  // listar({ usuario_id?, desde?, limit? }) → array de tours
  listar(opts) { return this._call(Object.assign({ accion: 'listar' }, opts || {})).then(j => j.tours || []); },
  // crear(tour) → { ok, tour }
  crear(tour) { return this._call(Object.assign({ accion: 'crear' }, tour || {})); },
  // eliminar(id) → { ok }
  eliminar(id) { return this._call({ accion: 'eliminar', id }); },
};

// [sec-kits] Acceso a kits_inventario vía Netlify Function con service_role
// (cerramos lectura/escritura anon). Lectura: popo/coordi/admins (costo oculto a
// no-admins). Crear/editar/eliminar: mister_popo + admins (verifyAdminAuth lo exige).
const khKits = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-kits', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-kits ' + r.status));
    return j;
  },
  // listar() → array de piezas (order pieza.asc)
  listar() { return this._call({ accion: 'listar' }).then(j => j.kits || []); },
  // obtener(id) → una pieza (con costo) o null
  obtener(id) { return this._call({ accion: 'obtener', id }).then(j => j.kit || null); },
  // crear(body) → { ok, kit }
  crear(body) { return this._call(Object.assign({ accion: 'crear' }, body || {})); },
  // actualizar(id, patch) → { ok }
  actualizar(id, patch) { return this._call({ accion: 'actualizar', id, patch }); },
  // eliminar(id) → { ok }
  eliminar(id) { return this._call({ accion: 'eliminar', id }); },
};

// [sec-radar-wl] Radar del Dragón vía Netlify Function con service_role (cerramos
// anon de main/pagos/rol_eventos_uso + radar_alertas + el RPC radar_metricas).
// Solo maestro_roshi. La función reenvía el RPC tal cual y reproduce la paginación.
const khRadar = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-radar', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-radar ' + r.status));
    return j;
  },
  // metricas(rango) → respuesta del RPC radar_metricas TAL CUAL
  metricas(rango) { return this._call({ accion: 'metricas', rango }).then(j => j.metricas); },
  // [RAD-1c] dia() → la franja del día. Sin parámetros: el día lo decide la base.
  dia() { return this._call({ accion: 'dia' }).then(j => j.dia); },
  // [RAD-1d] tops(n) → los tres tops. Las ventanas las decide la base.
  tops(n) { return this._call({ accion: 'tops', n: n || 5 }).then(j => j.tops); },
  // [RAD-1e] giru() → las lecturas. Sin parámetros: los umbrales viven en la base.
  giru() { return this._call({ accion: 'giru' }).then(j => j.giru); },
  // mainMetrics(sinceISO, untilISO|null) → RPC radar_main_metrics TAL CUAL (comparativas)
  mainMetrics(since, until) { return this._call({ accion: 'main_metrics', since, until: until || undefined }).then(j => j.metricas); },
  // fetch({ table, select?, since, until? }) → array de filas (paginado server-side)
  fetch(opts) { return this._call(Object.assign({ accion: 'fetch' }, opts || {})).then(j => j.rows || []); },
  // ventasTrafico({ since, until? }) → [{ evento_id, evento_nombre, visitas, ventas, conv }]
  ventasTrafico(opts) { return this._call(Object.assign({ accion: 'ventas_trafico' }, opts || {})).then(j => j.rows || []); },
  alertasListar() { return this._call({ accion: 'alertas_listar' }).then(j => j.rows || []); },
  alertasNoVistas() { return this._call({ accion: 'alertas_no_vistas' }).then(j => j.rows || []); },
  alertaVista(id) { return this._call({ accion: 'alerta_vista', id }); },
  alertasVistaTodas() { return this._call({ accion: 'alertas_vista_todas' }); },
};

// [sec-radar-wl] Lista de espera vía Netlify Function con service_role (cerramos anon
// de eventos_waitlist + eventos_estado_snapshot). Solo maestro_roshi. PII (email/nombre)
// whitelisteada server-side y solo llega a admin autenticado.
const khWaitlist = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-waitlist', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-waitlist ' + r.status));
    return j;
  },
  listar() { return this._call({ accion: 'listar' }).then(j => j.rows || []); },
  snapshot() { return this._call({ accion: 'snapshot' }).then(j => j.rows || []); },
  eliminar(eventoId) { return this._call({ accion: 'eliminar', evento_id: eventoId }); },
  resetNotificado(eventoId) { return this._call({ accion: 'reset_notificado', evento_id: eventoId }); },
};

// [sec-sensibles] rooming_habitaciones vía Netlify Function con service_role
// (maestro_roshi + bulma). Cierra lectura/escritura anon.
const khRooming = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-rooming', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-rooming ' + r.status));
    return j;
  },
  listar(eventoId) { return this._call({ accion: 'listar', evento_id: eventoId }).then(j => j.habitaciones || []); },
  crear(body) { return this._call(Object.assign({ accion: 'crear' }, body || {})); },
  actualizar(id, patch) { return this._call({ accion: 'actualizar', id, patch }); },
  eliminar(id) { return this._call({ accion: 'eliminar', id }); },
};

// ═══════════════════════════════════════════════════════════════
// [acompañantes F4-t4] ROOMING DE GRUPOS (Portal) — sección NUEVA del sub-tab
// Rooming de Capsule, DEBAJO del rooming KH (que NO se toca). Muestra y ajusta los
// cuartos que los titulares armaron en el Portal, vía admin-rooming-grupos (#235
// espejo con auth admin). Mismo lenguaje visual del puzzle del portal (#237).
// ═══════════════════════════════════════════════════════════════
const khRoomingGrupos = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-rooming-grupos', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-rooming-grupos ' + r.status));
    return j;
  },
  listar(eventoId, opts) { const p = { accion: 'listar', evento_id: eventoId }; if (opts && opts.todos) p.todos = true; return this._call(p).then(j => j.grupos || []); },
  accion(payload) { return this._call(payload); },
};

const _RG_TIPOS = [ // orden del negocio: Compartida (base) → Individual.
  { tipo: 'Compartida', cap: 4 }, { tipo: 'Triple', cap: 3 },
  { tipo: 'Doble', cap: 2 }, { tipo: 'Individual', cap: 1 },
];
let _rgGrupos = [];        // último listado (para re-render en colapso sin re-fetch)
let _rgAbiertos = {};      // solicitud_id → bool (card colapsable)

// Carga best-effort junto a loadRooming. Fails-soft: si truena, muestra el error;
// si el evento no tiene grupos, muestra la nota vacía.
async function loadGruposPortal() {
  const cont = document.getElementById('cc-grupos-portal');
  if (!cont) return;
  if (!_ccEventoActual) { cont.innerHTML = ''; return; }
  cont.innerHTML = '<div style="color:var(--ts);font-size:12px">Cargando cuartos de los grupos…</div>';
  let grupos;
  try {
    grupos = await khRoomingGrupos.listar(_ccEventoActual);
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error" style="font-size:12px">${_esfEsc(e.message || 'Error')}</div>`;
    return;
  }
  _rgGrupos = Array.isArray(grupos) ? grupos : [];
  _rgRender();
}

function _rgRender() {
  const cont = document.getElementById('cc-grupos-portal');
  if (!cont) return;
  if (!_rgGrupos.length) {
    cont.innerHTML = '<div style="color:var(--ts);font-size:12px">Sin grupos con acompañantes en este evento.</div>';
    return;
  }
  cont.innerHTML = _rgGrupos.map(_rgGrupoHtml).join('');
}

// Multifecha: índice de fecha (0-based) de un evento_id 'slug#idx', o null en
// fecha única. El chip visible es "Fecha <idx+1>". [rooming-multifecha]
function _rgFechaIdx(eventoId) {
  const p = String(eventoId || '').split('#');
  if (p.length < 2 || p[1] === '') return null;
  const n = parseInt(p[1], 10);
  return (Number.isFinite(n) && n >= 0) ? n : null;
}

function _rgGrupoHtml(g) {
  const solSafe = _esfEsc(g.solicitud_id);
  const activos = (g.lugares || []).filter(l => l.estado === 'activo');
  const N = activos.length;
  const nombreDe = (l) => (l.nombre && String(l.nombre).trim()) ? l.nombre : ('Lugar #' + l.numero);
  const ocupPorHab = {};
  activos.forEach(l => { if (l.habitacion_grupo_id) { (ocupPorHab[l.habitacion_grupo_id] = ocupPorHab[l.habitacion_grupo_id] || []).push(l); } });
  const asignados = activos.filter(l => l.habitacion_grupo_id).length;
  const sinCuarto = activos.filter(l => !l.habitacion_grupo_id);
  const sumaCap = (g.habitaciones || []).reduce((a, h) => a + (Number(h.capacidad) || 0), 0);
  const cubre = sumaCap >= N;
  const abierto = !!_rgAbiertos[g.solicitud_id];
  // Multifecha: chip "Fecha N" junto al título (fecha única → sin chip).
  const _fi = _rgFechaIdx(g.evento_id);
  const fechaChip = _fi === null ? '' : `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ts);border:1px solid var(--border);border-radius:var(--r-card,16px);padding:1px 8px;letter-spacing:.06em">Fecha ${_fi + 1}</span>`;

  const header = `
    <button type="button" data-rg-toggle="${solSafe}" style="width:100%;display:flex;align-items:center;gap:10px;background:transparent;border:none;color:var(--ink);cursor:pointer;text-align:left;padding:0">
      <span style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:16px">Grupo de ${_esfEsc(g.titular_nombre)}</span>${fechaChip}
      <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ts);letter-spacing:.08em">asignados ${asignados} de ${N}</span>
      <span style="margin-left:auto;color:var(--ts);font-size:12px">${abierto ? '▴' : '▾'}</span>
    </button>`;

  if (!abierto) {
    return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;margin-bottom:10px">${header}</div>`;
  }

  const pickerHtml = (habId) => sinCuarto.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${sinCuarto.map(l => `<button type="button" data-rg-asignar="${_esfEsc(l.id)}" data-rg-hab="${_esfEsc(habId)}" style="padding:5px 12px;border-radius:var(--r-card,16px);border:1px solid var(--border);background:var(--bg3);color:var(--ink);font-size:12px;cursor:pointer">${_esfEsc(nombreDe(l))}</button>`).join('')}</div>`
    : `<div style="font-size:12px;color:var(--ts)">Ya no hay personas sin cuarto.</div>`;

  const cuartos = (g.habitaciones || []).map(h => {
    const ocup = ocupPorHab[h.id] || [];
    const lleno = ocup.length >= Number(h.capacidad || 0);
    const chips = ocup.map(l => `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 6px 3px 10px;margin:2px 4px 0 0;border-radius:var(--r-card,16px);background:var(--bg3);border:1px solid var(--border);font-size:12px">${_esfEsc(nombreDe(l))}<button type="button" data-rg-quitar="${_esfEsc(l.id)}" title="Quitar" style="border:none;background:transparent;color:var(--ts);font-size:14px;line-height:1;cursor:pointer;padding:0 2px">×</button></span>`).join('');
    return `
      <div style="border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:10px 12px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="font-size:13px">Cuarto ${_esfEsc(h.orden)} · ${_esfEsc(h.tipo)}</b>
          <span style="font-size:12px;color:${lleno ? 'var(--green)' : 'var(--ts)'}">(${ocup.length}/${_esfEsc(h.capacidad)})</span>
          <button type="button" data-rg-del="${_esfEsc(h.id)}" title="Eliminar cuarto" style="margin-left:auto;border:none;background:transparent;font-size:15px;cursor:pointer"><svg class="ic"><use href="#ic-basura"/></svg></button>
        </div>
        <div style="margin-top:8px">${chips || '<span style="font-size:12px;color:var(--ts)">Cuarto vacío</span>'}</div>
        ${(!lleno && sinCuarto.length) ? `<div style="margin-top:8px"><button type="button" data-rg-add="${_esfEsc(h.id)}" style="padding:5px 12px;border-radius:var(--r-card,16px);border:1px dashed var(--border);background:transparent;color:var(--ts);font-size:12px;cursor:pointer">+ Asignar</button></div>` : ''}
        <div id="rg-picker-${_esfEsc(h.id)}" style="display:none;margin-top:8px">${pickerHtml(h.id)}</div>
      </div>`;
  }).join('');

  const agregar = cubre
    ? `<button type="button" disabled style="width:100%;padding:10px;border-radius:var(--r-sm,8px);border:1px solid var(--border);background:transparent;color:var(--ts);font-size:12px;cursor:not-allowed">Los cuartos ya cubren a todo el grupo</button>`
    : `<button type="button" data-rg-addroom="${solSafe}" style="width:100%;padding:10px;border-radius:var(--r-sm,8px);border:1px dashed var(--border);background:transparent;color:var(--ink);font-size:12px;font-weight:700;cursor:pointer">＋ Agregar cuarto</button>
       <div id="rg-tipos-${solSafe}" style="display:none;margin-top:8px"><div style="display:flex;flex-wrap:wrap;gap:6px">${_RG_TIPOS.map(x => `<button type="button" data-rg-crear="${x.tipo}" data-rg-sol="${solSafe}" style="padding:6px 14px;border-radius:var(--r-card,16px);border:1px solid var(--border);background:var(--bg3);color:var(--ink);font-size:12px;cursor:pointer">${x.tipo} (${x.cap})</button>`).join('')}</div></div>`;

  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;margin-bottom:10px">
      ${header}
      <div style="margin-top:12px">${cuartos}<div style="margin-top:4px">${agregar}</div></div>
    </div>`;
}

// Escritura → admin-rooming-grupos; éxito re-fetch+re-pinta, error a #rg-err.
async function _rgAccion(payload, btn) {
  const errEl = document.getElementById('rg-err');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  const prev = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await khRoomingGrupos.accion(payload);
    loadGruposPortal();
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'No se pudo.'; errEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = prev; }
  }
}

// Delegación única de los controles del rooming de grupos.
document.body.addEventListener('click', (e) => {
  const tg = e.target.closest('[data-rg-toggle]');
  if (tg) { const id = tg.getAttribute('data-rg-toggle'); _rgAbiertos[id] = !_rgAbiertos[id]; _rgRender(); return; }
  const add = e.target.closest('[data-rg-add]');
  if (add) { const p = document.getElementById('rg-picker-' + add.getAttribute('data-rg-add')); if (p) p.style.display = (p.style.display === 'none' ? '' : 'none'); return; }
  const addRoom = e.target.closest('[data-rg-addroom]');
  if (addRoom) { const tp = document.getElementById('rg-tipos-' + addRoom.getAttribute('data-rg-addroom')); if (tp) tp.style.display = (tp.style.display === 'none' ? 'block' : 'none'); return; }
  const asg = e.target.closest('[data-rg-asignar]');
  if (asg) { _rgAccion({ accion: 'asignar', lugar_id: asg.getAttribute('data-rg-asignar'), habitacion_id: asg.getAttribute('data-rg-hab') }, asg); return; }
  const qt = e.target.closest('[data-rg-quitar]');
  if (qt) { _rgAccion({ accion: 'quitar', lugar_id: qt.getAttribute('data-rg-quitar') }, qt); return; }
  const cr = e.target.closest('[data-rg-crear]');
  if (cr) { _rgAccion({ accion: 'crear_habitacion', solicitud_id: cr.getAttribute('data-rg-sol'), tipo: cr.getAttribute('data-rg-crear') }, cr); return; }
  const dl = e.target.closest('[data-rg-del]');
  if (dl) { if (confirm('¿Eliminar este cuarto? Las personas asignadas quedarán sin cuarto.')) _rgAccion({ accion: 'eliminar_habitacion', habitacion_id: dl.getAttribute('data-rg-del') }, dl); return; }
});

// ═══════════════════════════════════════════════════════════════════
// NUBE VOLADORA F3 — sub-tab "Transporte" (UI de Bulma)
//
// Backend: admin-transporte (#264). REGLA DE ORO: Bulma asigna POR CUARTO —
// tocar un ladrillo (cuarto/suelto/personaje) arma un LOTE y las unidades se
// vuelven botones para elegir destino ("¿a cuál unidad?").
// Molde visual: khRoomingGrupos + la sección de cuartos de grupos (#238).
// ═══════════════════════════════════════════════════════════════════
const khTransporte = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-transporte', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-transporte ' + r.status));
    return j;
  },
  listar(eventoId, fecha) {
    const p = { accion: 'listar', evento_id: eventoId };
    if (fecha) p.fecha = fecha; // [v2] día activo; sin fecha = evento simple
    return this._call(p);
  },
  accion(payload) { return this._call(payload); },
};

const _TR_TIPOS = ['Van', 'Autobús', 'Otro'];
let _trData = null;       // último 'listar' (unidades + universo + resumen)
let _trSel = null;        // lote elegido: { label, lote:[{tipo,ref}] } | null
let _trFormAbierto = false;
let _trSinCoordi = [];    // [F4] órdenes que el último envío no pudo mandar (sin coordi)
let _trDia = null;        // [v2] fecha del pill activo (null = evento simple)
let _trClonAbierto = null; // [v2] unidad_id con el picker de clonar desplegado
let _trCobertura = null;  // [v2] idx → { lbl, dias:[fecha] } del EV (chip de cobertura)

// Carga + pinta. Fails-soft: el error se queda en la sección, no tumba el detalle.
// [v2] `fecha` = el pill activo. Si no se pasa y el evento va por días, se hace un
// primer listar SIN fecha solo para saber cuáles son los días, y se recarga con el
// primero. Evento simple: una sola llamada, exactamente como antes.
async function loadTransporte(eventoId, fecha) {
  const cont = document.getElementById('cc-transporte');
  if (!cont) return;
  const ev = eventoId || _ccEventoActual;
  if (!ev) { cont.innerHTML = ''; return; }
  cont.innerHTML = '<div style="color:var(--ts);font-size:12px">Cargando transporte…</div>';
  try {
    let d = await khTransporte.listar(ev, fecha || undefined);
    // Festival por días sin día elegido → arrancar en el primero.
    if (!fecha && Array.isArray(d.dias) && d.dias.length) {
      _trDia = d.dias[0].fecha;
      d = await khTransporte.listar(ev, _trDia);
    } else {
      _trDia = Array.isArray(d.dias) && d.dias.length ? (fecha || null) : null;
    }
    _trData = d;
  } catch (e) {
    _trData = null;
    cont.innerHTML = `<div class="alert alert-error" style="font-size:12px">${_esfEsc(e.message || 'No se pudo cargar el transporte')}</div>`;
    return;
  }
  _trSel = null;          // toda recarga cancela la selección en curso
  _trClonAbierto = null;
  await _trCargarCobertura(ev); // best-effort: alimenta el chip de cobertura
  _trRender();
}

// [v2] Cobertura de cada idx (lbl + días) desde el EV — el backend manda el
// `evento_id` de cada persona ('slug#idx') y los días del evento, pero NO el lbl
// del idx ni cuántos días cubre. Eso vive en el catálogo, que la UI ya sabe leer
// (`_fetchEVFromIndex`, cacheado). Best-effort: sin esto solo se pierde el chip.
async function _trCargarCobertura(eventoId) {
  _trCobertura = null;
  if (!_trEsPorDias()) return;
  try {
    const arr = await _fetchEVFromIndex();
    const e = (arr || []).find(x => x && x.id === String(eventoId).split('#')[0]);
    if (!e || !Array.isArray(e.multifecha)) return;
    const out = {};
    e.multifecha.forEach((m, i) => {
      const noches = Number(m && m.noches);
      if (!m || !m.ds || !Number.isInteger(noches) || noches < 1) return;
      const dias = [];
      for (let k = 0; k < noches; k++) dias.push(_trSumaDias(m.ds, k));
      out[i] = { lbl: m.lbl ? String(m.lbl) : null, dias };
    });
    _trCobertura = out;
  } catch (e) { /* sin catálogo: el chip simplemente no sale */ }
}

// Mismo cálculo que el backend (ds .. ds+noches-1), anclado a mediodía UTC.
function _trSumaDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ¿El evento cargado va por días? (el backend solo manda `dias` en ese caso)
function _trEsPorDias() {
  return !!(_trData && Array.isArray(_trData.dias) && _trData.dias.length);
}

function _trDiasHtml() {
  if (!_trEsPorDias()) return '';
  const pills = _trData.dias.map(d => {
    const activo = d.fecha === _trDia;
    return `<button type="button" data-tr-dia="${_esfEsc(d.fecha)}" class="gz-filter${activo ? ' active' : ''}" style="font-size:11px">${_esfEsc(d.label)}</button>`;
  }).join('');
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${pills}</div>`;
}

// ── Render (remove-then-append: una sola escritura de innerHTML) ──────
function _trRender() {
  const cont = document.getElementById('cc-transporte');
  if (!cont || !_trData) return;
  const d = _trData;
  const unidades = d.unidades || [];
  const uni = d.universo || {};
  const pendientes = _trPendientes(uni);
  const vacio = !unidades.length && !pendientes.total;

  cont.innerHTML = [
    _trDiasHtml(),            // [v2] pills de día (vacío en evento simple)
    _trCabeceraHtml(d.resumen || {}),
    _trFormHtml(),
    _trBarraSeleccionHtml(),
    vacio ? _trVacioHtml() : '',
    unidades.length ? `<div style="margin-top:14px">${unidades.map(_trUnidadHtml).join('')}</div>` : '',
    (!vacio && pendientes.total) ? _trLadrillosHtml(uni, pendientes) : '',
    (!vacio && !pendientes.total && unidades.length)
      ? '<div style="margin-top:16px;padding:14px;border:1px dashed var(--border);border-radius:var(--radius);text-align:center;color:var(--green);font-size:12px">✓ Todos tienen lugar. Los personajes que falten súbelos desde aquí cuando los necesites.</div>'
      : '',
  ].join('');
}

function _trVacioHtml() {
  return `<div class="empty-state" style="padding:36px">
    <div class="empty-icon" style="font-size:28px"><svg class="ic"><use href="#ic-bus"/></svg></div>
    <div style="margin-top:6px">Crea la primera unidad — si caben todos, se suben solos.</div>
  </div>`;
}

function _trCabeceraHtml(r) {
  const porDias = _trEsPorDias();
  const deficit = Number(r.deficit || 0);
  // En festival el resumen y el déficit son DEL DÍA activo (el backend ya los
  // calcula así) — se dice, para que no se lea como global.
  const banner = deficit > 0
    ? `<div class="alert alert-error" style="margin:10px 0 0;font-size:12px"><svg class="ic"><use href="#ic-alerta"/></svg> Faltan ${deficit} asiento${deficit === 1 ? '' : 's'}${porDias ? ' este día' : ''} — agrega unidades</div>`
    : '';
  return `
    <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <div style="display:flex;gap:14px;flex-wrap:wrap;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.08em;color:var(--ts)">
        <span><svg class="ic"><use href="#ic-equipo"/></svg> ${Number(r.total_pasajeros || 0)} pasajeros</span>
        <span>${Number(r.total_asientos_netos || 0)} asientos netos</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button type="button" class="btn btn-ghost btn-sm" data-tr-print="1" style="font-size:10px"><svg class="ic"><use href="#ic-impresora"/></svg> Lista por unidad</button>
        <button type="button" class="btn btn-ghost btn-sm" data-tr-enviar="1" style="font-size:10px"><svg class="ic"><use href="#ic-correo"/></svg> Enviar su lista a cada coordi</button>
        ${porDias ? '<button type="button" class="btn btn-ghost btn-sm" data-tr-enviar-todos="1" style="font-size:10px"><svg class="ic"><use href="#ic-correo"/></svg> Enviar TODOS los días</button>' : ''}
        <button type="button" class="btn btn-primary btn-sm" data-tr-form="1">${_trFormAbierto ? '× Cancelar' : '＋ Agregar unidad'}</button>
      </div>
    </div>
    ${banner}`;
}

// Mini-form inline (nada de modal): el alta es parte de la sección.
// [v2] En festival la fecha NO se pregunta: es la del pill activo. Se dice en el
// encabezado para que Bulma sepa a qué día está agregando.
function _trFormHtml() {
  if (!_trFormAbierto) return '';
  const dia = _trEsPorDias() ? (_trData.dias.find(d => d.fecha === _trDia) || {}).label : null;
  const encabezado = dia
    ? `<div style="font-size:11px;color:var(--ts);margin-bottom:10px">Nueva unidad para <b style="color:var(--text)">${_esfEsc(dia)}</b></div>`
    : '';
  return `
    <div style="margin-top:12px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px">
      ${encabezado}
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--ts)">Tipo
          <select id="tr-f-tipo" class="cot-input" style="min-width:120px">
            ${_TR_TIPOS.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--ts)">Capacidad
          <input id="tr-f-cap" class="cot-input" type="number" min="1" max="100" step="1" value="15" style="width:100px">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--ts)">Chofer (opcional)
          <input id="tr-f-chofer" class="cot-input" type="text" maxlength="120" placeholder="Nombre" style="min-width:160px">
        </label>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px">
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--ts);cursor:pointer">
          <input type="checkbox" id="tr-f-chofer-ocupa" checked style="accent-color:var(--orange)">
          <span>el chofer ocupa asiento</span>
        </label>
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--ts);cursor:pointer">
          <input type="checkbox" id="tr-f-auto" checked style="accent-color:var(--orange)">
          <span><svg class="ic"><use href="#ic-magia"/></svg> ${dia ? 'Subir a todos los de este día si caben' : 'Subir a todos si caben'}</span>
        </label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button type="button" class="btn btn-ghost btn-sm" data-tr-form="0">Cancelar</button>
        <button type="button" class="btn btn-primary btn-sm" data-tr-crear="1">Crear unidad</button>
      </div>
    </div>`;
}

// Modo "¿a cuál unidad?": barra arriba con el lote elegido y su salida.
// Sin unidades no hay a dónde subirlos: en vez de "elige la unidad ↓" sobre una
// lista vacía (callejón sin salida), la barra dice qué falta hacer.
function _trBarraSeleccionHtml() {
  if (!_trSel) return '';
  const n = _trSel.lote.length;
  const hayUnidades = !!(_trData && (_trData.unidades || []).length);
  const texto = hayUnidades
    ? `Subiendo <b>${_esfEsc(_trSel.label)}</b> · ${n} persona${n === 1 ? '' : 's'} — elige la unidad ↓`
    : `<b>${_esfEsc(_trSel.label)}</b> · ${n} persona${n === 1 ? '' : 's'} — primero crea una unidad para subirlos.`;
  return `
    <div style="margin-top:12px;background:rgba(200,226,58,.08);border:1px solid var(--border2);border-radius:var(--radius);padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:12px">${texto}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-tr-cancelar="1" style="margin-left:auto;font-size:11px">Cancelar</button>
    </div>`;
}

function _trUnidadHtml(u) {
  const pax = Number(u.pasajeros_count || 0);
  const neta = Number(u.capacidad_neta || 0);
  const libres = Number(u.libres || 0);
  const lleno = pax >= neta;
  const idSafe = _esfEsc(u.id);

  // En modo selección la unidad ENTERA es el botón de destino.
  const enSeleccion = !!_trSel;
  const cabe = enSeleccion ? _trCabenEnUnidad(u, _trSel.lote) : true;

  const chofer = u.chofer_ocupa || u.chofer_nombre
    ? `<span style="font-size:11px;color:var(--ts)">chofer: ${_esfEsc(u.chofer_nombre || 'ocupa asiento')}</span>`
    : '';

  const coordis = (_trData && _trData.universo && _trData.universo.personajes) || [];
  const selCoordi = `
    <select data-tr-coordi="${idSafe}" class="cot-input" style="font-size:11px;padding:4px 8px;min-width:150px" ${enSeleccion ? 'disabled' : ''}>
      <option value="">— sin coordinador —</option>
      ${coordis.map(c => `<option value="${_esfEsc(c.ref)}"${u.coordi_id === c.ref ? ' selected' : ''}>${_esfEsc(c.nombre)}${c.rol ? ' · ' + _esfEsc(c.rol) : ''}</option>`).join('')}
    </select>`;

  // [CAP-FIX-1] El chip de quien no viaja se marca ENTERO, no solo con una
  // etiqueta al lado: entre 29 chips iguales, un borde rojo es lo que hace que
  // el ojo caiga ahí sin leer los 29.
  const chips = (u.pasajeros || []).map(p => {
    const noViaja = p.pasajero_tipo === 'viajero' ? _trNoViajaDeRef(p.pasajero_ref) : null;
    return `
    <span class="${noViaja ? 'cap-chip-noviaja' : ''}" style="display:inline-flex;align-items:center;gap:6px;padding:3px 6px 3px 10px;margin:2px 4px 0 0;border-radius:var(--r-card,16px);background:var(--bg3);border:1px solid var(--border);font-size:12px">
      ${_esfEsc(p.nombre_cache || 'Sin nombre')}${p.pasajero_tipo === 'viajero' ? _trTipoChip(_trTipoDeRef(p.pasajero_ref)) : ''}${_trNoViajaChip(noViaja)}
      <button type="button" data-tr-quitar="${_esfEsc(p.pasajero_ref)}" data-tr-ptipo="${_esfEsc(p.pasajero_tipo)}" data-tr-unidad="${idSafe}" title="Quitar de la unidad" style="border:none;background:transparent;color:var(--ts);font-size:14px;line-height:1;cursor:pointer;padding:0 2px">×</button>
    </span>`;
  }).join('');

  // [CAP-FIX-1] Cuántos de los que están aquí no deberían. El contador de la
  // cabecera (29/37) cuenta ASIENTOS OCUPADOS, y ése no puede mentir; éste
  // explica la diferencia con el total de arriba, que sí descuenta a los cheap.
  const nNoViajan = (u.pasajeros || []).filter(p => p.pasajero_tipo === 'viajero' && _trNoViajaDeRef(p.pasajero_ref)).length;
  const notaNoViajan = nNoViajan
    ? `<span class="cap-noviaja" title="Ocupan asiento pero su paquete no incluye transporte">${nNoViajan} no ${nNoViajan === 1 ? 'viaja' : 'viajan'}</span>`
    : '';

  // [F4] El último envío no pudo mandar esta: se resalta hasta que tenga coordi.
  const faltaCoordi = _trSinCoordi.indexOf(u.orden) !== -1 && !u.coordi_id;
  const notaCoordi = faltaCoordi
    ? '<span style="font-size:11px;color:var(--red);border:1px solid var(--red);border-radius:var(--r-card,16px);padding:1px 8px">asigna coordinador</span>'
    : '';

  const cabecera = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:14px">Unidad ${_esfEsc(u.orden)} · ${_esfEsc(u.tipo)}</b>
      <span style="font-size:12px;color:${lleno ? 'var(--green)' : 'var(--ts)'}">(${pax}/${neta})</span>
      ${_trFechaChip(u.evento_id)}${notaCoordi}${notaNoViajan}
      ${chofer}
      ${enSeleccion ? '' : `<span style="margin-left:auto;display:flex;gap:6px;align-items:center">
        ${selCoordi}
        ${_trEsPorDias() ? `<button type="button" data-tr-clonar="${idSafe}" title="Clonar a otros días" style="border:none;background:transparent;font-size:14px;cursor:pointer">⧉</button>` : ''}
        <button type="button" data-tr-cap="${idSafe}" title="Editar capacidad" style="border:none;background:transparent;font-size:14px;cursor:pointer"><svg class="ic"><use href="#ic-lapiz"/></svg></button>
        <button type="button" data-tr-del="${idSafe}" title="Eliminar unidad" style="border:none;background:transparent;font-size:15px;cursor:pointer"><svg class="ic"><use href="#ic-basura"/></svg></button>
      </span>`}
    </div>
    <div style="margin-top:8px">${chips || '<span style="font-size:12px;color:var(--ts)">Unidad vacía</span>'}</div>`;

  if (!enSeleccion) {
    return `<div style="background:var(--bg2);border:1px solid ${faltaCoordi ? 'var(--red)' : 'var(--border)'};border-radius:var(--radius);padding:12px 16px;margin-bottom:10px">${cabecera}${_trClonPickerHtml(u)}</div>`;
  }

  // Botón de destino: deshabilitado si el LOTE completo no cabe.
  const motivo = cabe ? '' : `<div style="margin-top:6px;font-size:11px;color:var(--red)">solo caben ${libres}</div>`;
  return `
    <button type="button" ${cabe ? `data-tr-destino="${idSafe}"` : 'disabled'}
      style="display:block;width:100%;text-align:left;background:var(--bg2);border:1px solid ${cabe ? 'var(--border2)' : 'var(--border)'};border-radius:var(--radius);padding:12px 16px;margin-bottom:10px;color:var(--text);cursor:${cabe ? 'pointer' : 'not-allowed'};opacity:${cabe ? '1' : '.5'};font:inherit">
      ${cabecera}${_esfEsc(motivo)}
    </button>`;
}

// [v2] Picker de clonado: los OTROS días del evento. Copia el molde de la unidad
// (tipo/capacidad/chofer/coordi/notas) — NUNCA los pasajeros, y se dice.
function _trClonPickerHtml(u) {
  if (_trClonAbierto !== u.id || !_trEsPorDias()) return '';
  const otros = _trData.dias.filter(d => d.fecha !== u.fecha);
  if (!otros.length) {
    return '<div style="margin-top:10px;font-size:11px;color:var(--ts)">No hay otros días a los que clonar.</div>';
  }
  const checks = otros.map(d => `
    <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-right:12px">
      <input type="checkbox" data-tr-clon-fecha="${_esfEsc(d.fecha)}" style="accent-color:var(--orange)">
      <span>${_esfEsc(d.label)}</span>
    </label>`).join('');
  return `
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <div style="font-size:11px;color:var(--ts);margin-bottom:8px">Copiar esta unidad (tipo, capacidad, chofer y coordinador) a otros días. <b>Va sin pasajeros</b>: cada día se llena aparte.</div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
        ${checks}
        <button type="button" class="btn btn-primary btn-sm" data-tr-clon-ok="${_esfEsc(u.id)}" style="font-size:11px">⧉ Clonar</button>
        <button type="button" class="btn btn-ghost btn-sm" data-tr-clon-cancel="1" style="font-size:11px">Cancelar</button>
      </div>
    </div>`;
}

// ── Ladrillos sin asignar ────────────────────────────────────────────
// Solo PENDIENTES: los ya asignados viven como chips dentro de su unidad.
function _trPendientes(uni) {
  const pend = (arr) => (arr || []).filter(p => !p.unidad_id);
  const cuartos = [
    ...(uni.cuartos_portal || []).map(c => ({ ...c, _mundo: 'portal', _tipoPax: 'lugar' })),
    ...(uni.cuartos_kh || []).map(c => ({ ...c, _mundo: 'kh', _tipoPax: 'viajero' })),
  ].map(c => ({ ...c, _pend: pend(c.ocupantes) })).filter(c => c._pend.length);
  const sueltos = [
    ...pend(uni.lugares_sueltos).map(p => ({ ...p, _tipoPax: 'lugar' })),
    ...pend(uni.viajeros_sueltos).map(p => ({ ...p, _tipoPax: 'viajero' })),
  ];
  const personajes = pend(uni.personajes).map(p => ({ ...p, _tipoPax: 'usuario' }));
  return { cuartos, sueltos, personajes, total: cuartos.length + sueltos.length + personajes.length };
}

// Chip del ladrillo. En multifecha NORMAL (Harry Styles) sigue siendo "Fecha N"
// (#255). En festival POR DÍAS ese número no le dice nada a Bulma —lo que le sirve
// es saber que a esa persona la va a volver a ver en otros pills—, así que se
// reemplaza por su COBERTURA ("Vie + Sáb · 2 días"), y SOLO si cubre más días
// que el activo: si solo viene a este día, el chip sería ruido.
function _trFechaChip(eventoId) {
  if (_trEsPorDias()) return _trCoberturaChip(eventoId);
  const i = _rgFechaIdx(eventoId);
  if (i === null) return '';
  return `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ts);border:1px solid var(--border);border-radius:var(--r-card,16px);padding:1px 8px;letter-spacing:.06em;margin-left:6px">Fecha ${i + 1}</span>`;
}

function _trCoberturaChip(eventoId) {
  const i = _rgFechaIdx(eventoId);
  if (i === null || !_trCobertura) return '';
  const cob = _trCobertura[i];
  if (!cob || cob.dias.length <= 1) return ''; // solo este día → sin chip
  const txt = cob.lbl || (cob.dias.length + ' días');
  return `<span title="También aparece en los otros días que cubre" style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--orange);border:1px solid var(--border2);border-radius:var(--r-card,16px);padding:1px 8px;letter-spacing:.06em;margin-left:6px"><svg class="ic"><use href="#ic-boleto"/></svg> ${_esfEsc(txt)}</span>`;
}

function _trLadrillosHtml(uni, pend) {
  const bloque = (titulo, ayuda, cuerpo) => `
    <div style="margin-top:20px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--ts);margin-bottom:4px">// ${_esfEsc(titulo)}</div>
      <div style="font-size:11px;color:var(--ts);margin-bottom:10px">${ayuda}</div>
      ${cuerpo}
    </div>`;

  const out = [];

  if (pend.cuartos.length) {
    const chips = pend.cuartos.map((c, i) => {
      const n = c._pend.length;
      const total = (c.ocupantes || []).length;
      const yaN = total - n;
      const nombres = c._pend.map(p => _trCorto(p.nombre)).join(' · ');
      // [T2 · T3] Si en el cuarto va alguien etiquetado (creadora externa o
      // ganador de giveaway), se avisa en el lote.
      const tipoEtiquetado = (c._pend.find(p => _trTipoChip(p.tipo_viajero)) || {}).tipo_viajero || null;
      const etiqueta = c._mundo === 'kh'
        ? `Cuarto ${_esfEsc(c.numero_hab || c.orden || '')}${c.hotel_nombre ? ' · ' + _esfEsc(c.hotel_nombre) : ''}`
        : `Cuarto ${_esfEsc(c.orden || (i + 1))} · ${_esfEsc(c.tipo || '')}`;
      return `
        <button type="button" data-tr-lote="cuarto:${i}" style="text-align:left;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin:0 8px 8px 0;color:var(--text);cursor:pointer;font:inherit;min-width:220px;max-width:100%">
          <div style="display:flex;align-items:center;flex-wrap:wrap">
            <b style="font-size:13px">${etiqueta}</b>${_trFechaChip(c.evento_id)}${_trTipoChip(tipoEtiquetado)}
          </div>
          <div style="font-size:11px;color:var(--ts);margin-top:3px">${n} persona${n === 1 ? '' : 's'}${yaN ? ` · (${yaN} de ${total} ya asignados)` : ''}</div>
          <div style="font-size:12px;margin-top:4px">${_esfEsc(nombres)}</div>
        </button>`;
    }).join('');
    out.push(bloque('<svg class="ic"><use href="#ic-cama"/></svg> CUARTOS', 'Toca un cuarto y elige su unidad — sube el cuarto completo de un jalón.', `<div style="display:flex;flex-wrap:wrap">${chips}</div>`));
  }

  if (pend.sueltos.length) {
    const chips = pend.sueltos.map((p, i) => _trChipPersona(`suelto:${i}`, p.nombre, _trFechaChip(p.evento_id) + _trTipoChip(p.tipo_viajero))).join('');
    out.push(bloque('<svg class="ic"><use href="#ic-persona"/></svg> SUELTOS', 'Personas sin cuarto asignado.', `<div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>`));
  }

  if (pend.personajes.length) {
    const chips = pend.personajes.map((p, i) =>
      _trChipPersona(`personaje:${i}`, p.nombre,
        `<span style="font-size:10px;color:var(--ts);margin-left:6px">${_esfEsc(p.rol || '')}</span>`)
    ).join('');
    out.push(bloque('<svg class="ic"><use href="#ic-persona"/></svg> PERSONAJES', 'Coordis y creadoras. Nunca se suben solos — tú decides en qué unidad viajan.', `<div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>`));
  }

  return out.join('');
}

// [T2] Etiqueta de creadora externa que toma el viaje. Vacío para todos los
// viajeros de siempre (tipo_viajero null), así que la lista no cambia en nada
// salvo cuando hay una externa.
function _trTipoChip(tipo) {
  const TIPOS = {
    creadora_externa: { txt: 'creadora ext.', bg: 'var(--yellow,#e8ff4c)', tip: 'Creadora externa que toma el viaje — no es coordinadora' },
    ganador_giveaway: { txt: 'premio', bg: 'var(--blue,#0000cd)', fg: '#fff', tip: 'Ganador de giveaway — el premio incluye el viaje' },
  };
  const t = TIPOS[tipo];
  if (!t) return '';
  return `<span title="${t.tip}" style="font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:${t.fg || '#000'};background:${t.bg};border-radius:var(--r-card,16px);padding:1px 7px;margin-left:6px">${t.txt}</span>`;
}
// Los pasajeros YA asignados vienen de la tabla de asignaciones (nombre_cache),
// que NO guarda ni el paquete ni el tipo: lo único que viaja con ellos es el
// nombre. Todo lo demás se busca por `ref` en el universo KH que trajo el listar.
function _trPersonaDeRef(ref) {
  const u = _trData && _trData.universo;
  if (!u) return null;
  const pools = [...(u.viajeros_sueltos || [])];
  (u.cuartos_kh || []).forEach(c => pools.push(...(c.ocupantes || [])));
  return pools.find(p => p && p.ref === ref) || null;
}
function _trTipoDeRef(ref) {
  const hit = _trPersonaDeRef(ref);
  return hit ? (hit.tipo_viajero || null) : null;
}
// [CAP-FIX-1] VJ-4 dejó la marca a medio camino: el backend la manda en
// `no_viaja` de cada persona del universo y NADIE la leía. El resultado en la
// pantalla de Memo: los 5 cheap de melanie sentados entre los 29 chips de la
// Unidad 1, idénticos a los demás, mientras el contador de arriba ya decía 24.
// El descuento se veía; la razón, no.
function _trNoViajaDeRef(ref) {
  const hit = _trPersonaDeRef(ref);
  return hit ? (hit.no_viaja || null) : null;
}
// El motivo lo redacta el backend ("no viaja: cheap"): dice el paquete, así que
// además de avisar, enseña la regla. Con `title` para el porqué, pero el texto
// se lee SIN pasar el mouse — quien tiene que verlo está mirando la lista, no
// cazando tooltips.
function _trNoViajaChip(motivo) {
  if (!motivo) return '';
  return `<span class="cap-noviaja" title="Su paquete no incluye transporte. Está asignado de todos modos — quítalo con la × si sobra.">${_esfEsc(motivo)}</span>`;
}

function _trChipPersona(key, nombre, extra) {
  return `<button type="button" data-tr-lote="${key}" style="display:inline-flex;align-items:center;padding:6px 12px;border-radius:var(--r-card,16px);border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:12px;cursor:pointer;font-family:inherit">${_esfEsc(nombre)}${extra || ''}</button>`;
}

// ['Sáb 21','Dom 22'] → 'Sáb 21 y Dom 22'
function _trListaEs(xs) {
  if (xs.length <= 1) return xs[0] || '';
  return xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];
}

function _trCorto(n) {
  const s = String(n || '').trim();
  const p = s.split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || '—');
}

// ¿Cabe el LOTE completo? Los que ya están en ESA unidad no ocupan asiento nuevo.
function _trCabenEnUnidad(u, lote) {
  const yaAqui = new Set((u.pasajeros || []).map(p => `${p.pasajero_tipo}:${p.pasajero_ref}`));
  const nuevos = lote.filter(p => !yaAqui.has(`${p.tipo}:${p.ref}`)).length;
  return nuevos <= Number(u.libres || 0);
}

// ── Acciones ─────────────────────────────────────────────────────────
async function _trAccion(payload, btn, okMsg) {
  const errEl = document.getElementById('tr-err');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  const prev = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const j = await khTransporte.accion(payload);
    if (okMsg) showToast(okMsg(j), 'success');
    // [v2] Se recarga EN EL MISMO DÍA: perder el pill activo tras cada acción
    // sería desorientador (y en clonar, la unidad nueva vive en OTRO día).
    await loadTransporte(_ccEventoActual, _trDia || undefined);
  } catch (e) {
    // El 409 del backend (cupo / "Primero baja pasajeros") se muestra TAL CUAL.
    if (errEl) { errEl.textContent = e.message || 'No se pudo.'; errEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = prev; }
  }
}

// ── [F4] Lista imprimible POR UNIDAD ─────────────────────────────────
// Se arma con los datos YA cargados del listar (sin fetch). Una sección por
// unidad; las grandes abren página nueva para que cada coordi se lleve la suya.
function _trImprimir() {
  if (!_trData) return;
  const unidades = _trData.unidades || [];
  if (!unidades.length) { showToast('No hay unidades que imprimir.', 'error'); return; }
  let ev = (_ccEventosCache.find(e => e.id === _ccEventoActual) || {}).nombre || _ccEventoActual;
  // [v2] `unidades` ya viene solo del día activo (el listar se hizo con fecha) →
  // el documento es el de ESE día y el título lo dice.
  const dia = _trEsPorDias() ? (_trData.dias.find(d => d.fecha === _trDia) || {}).label : null;
  if (dia) ev += ' · ' + dia;
  const totalPax = unidades.reduce((a, u) => a + Number(u.pasajeros_count || 0), 0);

  const secciones = unidades.map((u, i) => {
    const pax = u.pasajeros || [];
    // Salto de página antes de una unidad grande (salvo la primera): break-inside
    // avoid sola no basta cuando la tabla no cabe en lo que queda de hoja.
    const salto = (i > 0 && pax.length > 12) ? 'break-before:page;page-break-before:always;' : '';
    const meta = [
      u.coordi ? `Coordinador: <b>${_esfEsc(u.coordi.nombre)}</b>` : '<span class="cx-muted">Sin coordinador</span>',
      (u.chofer_nombre || u.chofer_ocupa) ? `Chofer: <b>${_esfEsc(u.chofer_nombre || 'sí, ocupa asiento')}</b>` : '',
    ].filter(Boolean).join(' · ');
    const fi = _rgFechaIdx(u.evento_id);
    const fecha = fi === null ? '' : ` · Fecha ${fi + 1}`;

    const tabla = pax.length
      ? `<table><thead><tr><th style="width:34px">#</th><th>Pasajero</th></tr></thead><tbody>
           ${pax.map((p, n) => `<tr><td>${n + 1}</td><td>${_esfEsc(p.nombre_cache || 'Sin nombre')}</td></tr>`).join('')}
         </tbody></table>
         <div style="font-size:11px;color:#555">Total de la unidad: <b>${pax.length}</b></div>`
      : '<div class="cx-muted">(sin pasajeros asignados)</div>';

    return `<section style="${salto}">
      <h2>Unidad ${_esfEsc(u.orden)} · ${_esfEsc(u.tipo)} (${Number(u.ocupados || 0)}/${_esfEsc(u.capacidad)})${fecha}</h2>
      <div style="font-size:11px;color:#555;margin:0 0 10px">${meta}</div>
      ${tabla}
    </section>`;
  }).join('');

  const pie = `<div class="cx-resumen">Total ${dia ? 'del día' : 'del evento'}: <b>${totalPax}</b> pasajero${totalPax === 1 ? '' : 's'} en <b>${unidades.length}</b> unidad${unidades.length === 1 ? '' : 'es'}.</div>`;
  _printVentana(`Transporte — ${ev}`, secciones + pie);
}

// ── [F4] Enviar a cada coordi la lista de SU unidad ──────────────────
// No re-fetch: el envío no cambia datos. Solo repinta para resaltar las que
// quedaron sin coordi.
// [v2] `todos` = mandar las corridas de TODOS los días (sin fecha). Por default
// manda solo el día activo, que es lo que Bulma está viendo.
async function _trEnviarListas(btn, todos) {
  const dia = _trEsPorDias() ? (_trData.dias.find(d => d.fecha === _trDia) || {}).label : null;
  const aviso = (todos && _trEsPorDias())
    ? 'Se enviará a cada coordinador el correo con la lista de SU unidad, de TODOS los días del evento. ¿Continuar?'
    : (dia
        ? `Se enviará a cada coordinador el correo con la lista de SU unidad del ${dia}. ¿Continuar?`
        : 'Se enviará a cada coordinador el correo con la lista de SU unidad. ¿Continuar?');
  if (!confirm(aviso)) return;
  const errEl = document.getElementById('tr-err');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  const prev = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const payload = { accion: 'enviar_listas', evento_id: _ccEventoActual };
    if (!todos && _trDia) payload.fecha = _trDia; // sin fecha = todos los días
    const j = await khTransporte.accion(payload);
    _trSinCoordi = j.sin_coordi || [];
    const partes = [`${j.enviadas || 0} enviada${j.enviadas === 1 ? '' : 's'}`];
    if (_trSinCoordi.length) partes.push(`${_trSinCoordi.length} sin coordinador`);
    if ((j.sin_correo || []).length) partes.push(`${j.sin_correo.length} sin correo`);
    if ((j.vacias || []).length) partes.push(`${j.vacias.length} vacía${j.vacias.length === 1 ? '' : 's'}`);
    if (j.errores) partes.push(`${j.errores} con error`);
    showToast(partes.join(' · '), (j.errores || !j.enviadas) ? 'error' : 'success');
    _trRender();
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'No se pudieron enviar las listas.'; errEl.style.display = 'block'; }
  }
  if (btn) { btn.disabled = false; btn.textContent = prev; }
}

function _trLoteDe(key) {
  if (!_trData) return null;
  const pend = _trPendientes(_trData.universo || {});
  const [clase, iRaw] = String(key).split(':');
  const i = parseInt(iRaw, 10);
  if (clase === 'cuarto') {
    const c = pend.cuartos[i]; if (!c) return null;
    const etiqueta = c._mundo === 'kh' ? `Cuarto ${c.numero_hab || c.orden || ''}` : `Cuarto ${c.orden || (i + 1)} · ${c.tipo || ''}`;
    return { label: etiqueta.trim(), lote: c._pend.map(p => ({ tipo: c._tipoPax, ref: p.ref })) };
  }
  const p = clase === 'suelto' ? pend.sueltos[i] : pend.personajes[i];
  if (!p) return null;
  return { label: p.nombre, lote: [{ tipo: p._tipoPax, ref: p.ref }] };
}

// Delegación única de los controles del transporte (molde del rooming de grupos).
document.body.addEventListener('click', (e) => {
  const pr = e.target.closest('[data-tr-print]');
  if (pr) { _trImprimir(); return; }

  const env = e.target.closest('[data-tr-enviar]');
  if (env) { _trEnviarListas(env, false); return; }

  // [v2] Días
  const envTodos = e.target.closest('[data-tr-enviar-todos]');
  if (envTodos) { _trEnviarListas(envTodos, true); return; }

  const pill = e.target.closest('[data-tr-dia]');
  if (pill) {
    const f = pill.getAttribute('data-tr-dia');
    if (f !== _trDia) { _trFormAbierto = false; loadTransporte(_ccEventoActual, f); }
    return;
  }

  const clon = e.target.closest('[data-tr-clonar]');
  if (clon) {
    const id = clon.getAttribute('data-tr-clonar');
    _trClonAbierto = (_trClonAbierto === id) ? null : id;
    _trSel = null; _trRender();
    return;
  }
  if (e.target.closest('[data-tr-clon-cancel]')) { _trClonAbierto = null; _trRender(); return; }

  const clonOk = e.target.closest('[data-tr-clon-ok]');
  if (clonOk) {
    const fechas = [...document.querySelectorAll('[data-tr-clon-fecha]')]
      .filter(c => c.checked).map(c => c.getAttribute('data-tr-clon-fecha'));
    if (!fechas.length) {
      const errEl = document.getElementById('tr-err');
      if (errEl) { errEl.textContent = 'Elige al menos un día al cual clonar.'; errEl.style.display = 'block'; }
      return;
    }
    const labels = fechas.map(f => (_trData.dias.find(d => d.fecha === f) || {}).label || f);
    _trClonAbierto = null;
    _trAccion({ accion: 'clonar_unidad', unidad_id: clonOk.getAttribute('data-tr-clon-ok'), fechas }, clonOk,
      () => `Unidad clonada a ${_trListaEs(labels)} — va sin pasajeros`);
    return;
  }

  const form = e.target.closest('[data-tr-form]');
  if (form) { _trFormAbierto = form.getAttribute('data-tr-form') === '1' ? !_trFormAbierto : false; _trSel = null; _trRender(); return; }

  const crear = e.target.closest('[data-tr-crear]');
  if (crear) {
    const cap = parseInt((document.getElementById('tr-f-cap') || {}).value, 10);
    if (!Number.isInteger(cap) || cap < 1 || cap > 100) {
      const errEl = document.getElementById('tr-err');
      if (errEl) { errEl.textContent = 'La capacidad debe ser un número entero entre 1 y 100.'; errEl.style.display = 'block'; }
      return;
    }
    _trFormAbierto = false;
    _trAccion({
      accion: 'crear_unidad',
      evento_id: _ccEventoActual,
      // [v2] La fecha NO se pregunta: es la del pill activo (null en evento simple,
      // donde el backend además la rechaza).
      ...(_trDia ? { fecha: _trDia } : {}),
      tipo: (document.getElementById('tr-f-tipo') || {}).value,
      capacidad: cap,
      chofer_ocupa: !!(document.getElementById('tr-f-chofer-ocupa') || {}).checked,
      chofer_nombre: (document.getElementById('tr-f-chofer') || {}).value || null,
      autollenar: !!(document.getElementById('tr-f-auto') || {}).checked,
    }, crear, (j) => j.auto_asignados
      ? `Unidad creada — se subieron ${j.auto_asignados} pasajeros <svg class="ic"><use href="#ic-magia"/></svg>`
      : 'Unidad creada');
    return;
  }

  const lote = e.target.closest('[data-tr-lote]');
  if (lote) { _trSel = _trLoteDe(lote.getAttribute('data-tr-lote')); _trFormAbierto = false; _trRender(); return; }

  const cancelar = e.target.closest('[data-tr-cancelar]');
  if (cancelar) { _trSel = null; _trRender(); return; }

  const destino = e.target.closest('[data-tr-destino]');
  if (destino && _trSel) {
    const sel = _trSel;
    _trAccion({ accion: 'asignar', unidad_id: destino.getAttribute('data-tr-destino'), pasajeros: sel.lote }, null,
      (j) => j.movidos ? `Listo — ${j.asignados} subidos, ${j.movidos} movidos` : `${sel.label} a bordo`);
    return;
  }

  const quitar = e.target.closest('[data-tr-quitar]');
  if (quitar) {
    _trAccion({
      accion: 'quitar',
      unidad_id: quitar.getAttribute('data-tr-unidad'),
      pasajeros: [{ tipo: quitar.getAttribute('data-tr-ptipo'), ref: quitar.getAttribute('data-tr-quitar') }],
    }, quitar);
    return;
  }

  const cap = e.target.closest('[data-tr-cap]');
  if (cap) {
    const u = (_trData.unidades || []).find(x => x.id === cap.getAttribute('data-tr-cap'));
    if (!u) return;
    const v = prompt(`Capacidad de la Unidad ${u.orden} (1-100).\nHoy: ${u.capacidad} · van ${u.pasajeros_count}`, String(u.capacidad));
    if (v === null) return;
    const n = parseInt(v, 10);
    if (!Number.isInteger(n)) return;
    _trAccion({ accion: 'editar_unidad', unidad_id: u.id, capacidad: n }, cap);
    return;
  }

  const del = e.target.closest('[data-tr-del]');
  if (del) {
    const u = (_trData.unidades || []).find(x => x.id === del.getAttribute('data-tr-del'));
    const aviso = u && u.pasajeros_count
      ? `¿Eliminar la Unidad ${u.orden}? Sus ${u.pasajeros_count} pasajeros quedarán sin asignar.`
      : '¿Eliminar esta unidad?';
    if (confirm(aviso)) _trAccion({ accion: 'eliminar_unidad', unidad_id: del.getAttribute('data-tr-del') }, del,
      (j) => j.desasignados ? `Unidad eliminada — ${j.desasignados} quedaron sin asignar` : 'Unidad eliminada');
    return;
  }
});

// Coordinador: el <select> no es click, es change.
document.body.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-tr-coordi]');
  if (sel) { _trAccion({ accion: 'editar_unidad', unidad_id: sel.getAttribute('data-tr-coordi'), coordi_id: sel.value || null }, null); return; }
  // Default de Memo: al elegir Van el chofer ocupa asiento; en lo demás no.
  // Queda editable — esto solo mueve el default al cambiar el tipo.
  const tipo = e.target.closest('#tr-f-tipo');
  if (tipo) {
    const ck = document.getElementById('tr-f-chofer-ocupa');
    if (ck) ck.checked = tipo.value === 'Van';
  }
});

// [sec-eventos] Tabla `eventos` (UUID legacy del cotizador/capsule) vía Netlify
// Function con service_role. Lectura: cualquier logueado (boot/ping/selects).
// Crear/editar/eliminar: maestro_roshi + bulma (lo exige verifyAdminAuth). NO es
// el catálogo público (ese es el array EV de index.html).
const khEventos = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-eventos', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-eventos ' + r.status));
    return j;
  },
  // listar({ limit? }) → array de eventos (order fecha.desc)
  listar(opts) { return this._call(Object.assign({ accion: 'listar' }, opts || {})).then(j => j.eventos || []); },
  // obtener(id) → un evento (objeto) o null
  obtener(id) { return this._call({ accion: 'obtener', id }).then(j => j.evento || null); },
  // crear(datos) → { ok, evento } (el cotizador necesita evento.id)
  crear(datos) { return this._call({ accion: 'crear', datos }); },
  // actualizar(id, datos) → { ok }
  actualizar(id, datos) { return this._call({ accion: 'actualizar', id, datos }); },
  // eliminar(id) → { ok }
  eliminar(id) { return this._call({ accion: 'eliminar', id }); },
  // ping() keep-alive Supabase (fails-soft, no rompe nada)
  ping() { return this._call({ accion: 'listar', limit: 1 }).catch(() => {}); },
};

// [sec-eventos] Lookup `eventos_meta` por slug vía la misma Function (service_role).
// SOLO lectura (la escritura es vía eventos-meta-sync.js). Cualquier logueado.
// Replica EXACTO el shape de hoy: por_slug → row {nombre}; por_slugs → array
// de {slug,nombre,fecha,fecha_fin}.
const khEventosMeta = {
  _call(payload) { return khEventos._call(payload); },
  // porSlug(slug) → row {nombre} o null
  porSlug(slug) { return this._call({ accion: 'meta_por_slug', slug }).then(j => j.meta || null); },
  // porSlugs([slug,...]) → array de {slug,nombre,fecha,fecha_fin}
  porSlugs(slugs) { return this._call({ accion: 'meta_por_slugs', slugs }).then(j => j.metas || []); },
};

// [sec-coordi] Asignaciones (eventos_coordi) vía Netlify Function con service_role.
// Lectura: cualquier logueado (listas del panel). crear/eliminar: maestro_roshi+bulma.
// responder (aceptar/declinar): el backend EXIGE que la asignación sea del jwtUserId
// (salvo admin) — cierra el hueco del UUID enumerable del email-link.
const khAsignaciones = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-coordi-asignaciones', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-coordi-asignaciones ' + r.status));
    return j;
  },
  // listar({ coordi_id?, evento_id?, status? }) → array de asignaciones
  listar(opts) { return this._call(Object.assign({ accion: 'listar' }, opts || {})).then(j => j.asignaciones || []); },
  // crear({ evento_id, coordi_id, indicaciones? }) → { ok, asignacion } (necesita asignacion.id)
  crear(datos) { return this._call(Object.assign({ accion: 'crear' }, datos || {})); },
  // eliminar(id) → { ok }
  eliminar(id) { return this._call({ accion: 'eliminar', id }); },
  // responder(id, 'aceptar'|'declinar', motivo?) → { ok, asignacion:{evento_id,coordi_id,status} }
  responder(id, decision, motivo) { return this._call({ accion: 'responder', id, decision, motivo }); },
};

// [sec-coordi] viajeros_evento (KH, PII) vía la misma Function (service_role).
// upsert_staff: identidad del coordi sale de `usuarios` server-side (anti-spoof);
// owner-coordi o admin. listar/descargar: admin o coordi del evento. eliminar: admin.
// (El tab Viajeros del panel y el alta manual son del proyecto PORTAL, no de aquí.)
const khViajeros = {
  _call(payload) { return khAsignaciones._call(payload); },
  // upsertStaff(asigId) → { ok, viajero } — best-effort (el caller envuelve en try/catch)
  upsertStaff(asigId) { return this._call({ accion: 'viajero_upsert_staff', asig_id: asigId }).then(j => j.viajero || null); },
  // listar(eventoId) → array de viajeros (whitelist PII)
  listar(eventoId) { return this._call({ accion: 'viajero_listar', evento_id: eventoId }).then(j => j.viajeros || []); },
  // eliminar(id) → { ok }
  eliminar(id) { return this._call({ accion: 'viajero_eliminar', id }); },
  // [VJ-1] editar(id, campos) → { ok, viajero, tocadas } — whitelist server-side
  editar(id, campos) { return this._call({ accion: 'viajero_editar', id, campos }); },
  // [VJ-3] dinero de los migrados
  abonosDe(viajero_id) { return this._call({ accion: 'abonos_listar', viajero_id }).then(j => j.abonos || []); },
  abonosDeEvento(evento_id) { return this._call({ accion: 'abonos_listar', evento_id }).then(j => j.abonos || []); },
  abonoCrear(payload) { return this._call(Object.assign({ accion: 'abono_crear' }, payload)); },
  // [VJ-5] poner/quitar cuarto a un migrado
  habitacion(id, habitacion_id) { return this._call({ accion: 'viajero_habitacion', id, habitacion_id }); },
  // [MIG-1a] alta de un viajero del Excel, y la búsqueda de parecidos previa
  migrar(payload) { return this._call(Object.assign({ accion: 'viajero_migrar' }, payload)); },
  // [CAP-MIG-FIX] Solo SUGIERE: no escribe nada.
  precioSugerido(p) { return this._call(Object.assign({ accion: 'precio_sugerido' }, p)); },
  buscarParecido(evento_id, nombre, correo) {
    return this._call({ accion: 'viajero_buscar_parecido', evento_id, nombre, correo }).then(j => j.parecidos || []);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// [MIG-1a] EL WIZARD DE MIGRACIÓN — captura del Excel, uno tras otro.
//
// Llena el hueco que la medición encontró: `viajero_upsert_staff` crea filas
// tomando la identidad de un COORDINADOR, así que no servía para capturar a una
// persona del Excel. Esto es lo único que da de alta un viajero arbitrario.
//
// ⚠️ LA REGLA DE ORO DE VJ-3 NO SE TOCA. Aquí se capturan `total_contrato` y
// `abonado_previo` TAL CUAL vienen del Excel y quedan CONGELADOS. El costo NO se
// calcula del catálogo aunque el catálogo tenga el precio de la zona: el total
// del Excel ya trae adentro hotel, transporte y lo que se haya negociado. Lo que
// se cobre de aquí en adelante entra como ABONO, y el saldo lo resuelve
// `_vj3Saldo`, que es la MISMA fórmula que el servidor.
//
// Decisión firmada por Memo (23-ago): el abonado entra como UNA SUMA. El Excel
// se queda como archivo histórico de los pagos viejos; no se replica.
// ═══════════════════════════════════════════════════════════════════════════
let _migEV = null;          // el evento del catálogo (zonas, multifecha)
let _migCapturados = [];    // lo capturado en ESTA sesión, para la lista de abajo
let _migPendiente = null;   // payload esperando confirmación de parecido
let _migFechaIdx = null;    // multifecha: la fecha se elige UNA vez

function _migEl(id) { return document.getElementById(id); }
function _migSlug() {
  const base = _ccEventoActual;
  if (!base) return null;
  return (_migFechaIdx == null) ? base : `${base}#${_migFechaIdx}`;
}

async function migAbrir() {
  const panel = _migEl('mig-panel');
  if (!panel || !_ccEventoActual) return;
  panel.style.display = '';
  _migCapturados = [];
  _migPendiente = null;
  _migFechaIdx = null;
  _migPintarCapturados();

  // El catálogo del evento: de ahí salen las zonas REALES. Escribirlas a mano
  // sería inventar una llave que después no casa con el stock ni con lo que el
  // cliente eligió en el sitio.
  _migEV = null;
  try {
    const ev = await _fetchEVFromIndex();
    _migEV = (ev || []).find(e => e && e.id === _ccEventoActual) || null;
  } catch (_) { /* fails-soft: se avisa abajo */ }

  const fw = _migEl('mig-fecha-wrap');
  const lista = _migEV && Array.isArray(_migEV.dsList) && _migEV.dsList.length > 1 ? _migEV.dsList : null;
  if (lista) {
    // Multifecha: la fecha se elige UNA vez y se captura la tanda (firmado).
    const sel = _migEl('mig-fecha');
    sel.innerHTML = lista.map((d, i) => `<option value="${i}">${_esfEsc(_migFechaTxt(d))}</option>`).join('');
    _migFechaIdx = 0;
    if (fw) fw.style.display = '';
  } else if (fw) { fw.style.display = 'none'; }

  const sub = _migEl('mig-sub');
  if (sub && !_migEV) {
    sub.textContent = 'No se pudo leer el catálogo del evento: las zonas se escriben a mano y podrían no casar con el stock.';
    sub.style.color = '#ff5f56';
  }
  migZonas();
  _migEl('mig-nombre') && _migEl('mig-nombre').focus();
}

function _migFechaTxt(ds) {
  if (!ds) return '(sin fecha)';
  const M = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const p = String(ds).split('-');
  return `${parseInt(p[2], 10)} ${M[parseInt(p[1], 10) - 1]} ${p[0]}`;
}
function migFechaElegida() {
  const sel = _migEl('mig-fecha');
  _migFechaIdx = sel ? parseInt(sel.value, 10) : null;
}
function migCerrar() {
  const p = _migEl('mig-panel');
  if (p) p.style.display = 'none';
  // Al cerrar se recarga la lista de migrados: lo capturado ya vive en la base.
  if (typeof _vj2Cargar === 'function') _vj2Cargar();
}

// Las zonas dependen del paquete: CHEAP tiene su propia lista de precios, y en
// varios eventos son OTROS nombres. Tomarlas de la lista equivocada guardaría
// una zona que el stock no reconoce.
function migZonas() {
  const paq = (_migEl('mig-paquete') || {}).value || '';
  const sel = _migEl('mig-zona');
  if (!sel) return;
  if (!paq) { sel.innerHTML = '<option value="">— elige paquete primero —</option>'; _migCuenta(); return; }
  const fuente = (paq === 'cheap')
    ? ((_migEV && _migEV.cheapZonas) || [])
    : ((_migEV && _migEV.zonas) || []);
  if (!fuente.length) {
    sel.innerHTML = '<option value="">— sin zonas en el catálogo —</option>';
  } else {
    sel.innerHTML = '<option value="">— elegir —</option>' + fuente.map(z =>
      `<option value="${_esfEsc(z.n)}">${_esfEsc(z.n)}${z.p ? ' · $' + Number(z.p).toLocaleString('es-MX') : ''}${z.ag ? ' (agotada)' : ''}</option>`
    ).join('');
  }
  _migCuenta();
}

// A qué cuenta va su dinero. NO se decide aquí: se muestra lo que decide la
// regla del negocio, para que quien captura vea a dónde cae antes de guardar.
// El espejo de `cuentaParaPaquete`: CHEAP → Banamex · el resto → el banco del
// evento o BBVA.
function _migCuenta() {
  const el = _migEl('mig-cuenta');
  if (!el) return;
  const paq = (_migEl('mig-paquete') || {}).value || '';
  if (!paq) { el.textContent = ''; return; }
  const banco = (paq === 'cheap')
    ? 'Banamex'
    : ((_migEV && _migEV.banco && _migEV.banco.nombre) || 'BBVA Bancomer');
  const viaja = (paq === 'plus' || paq === 'ride');
  const duerme = (paq === 'plus' || paq === 'ride' || paq === 'stay');
  el.innerHTML = `Su dinero se clasifica en <b style="color:var(--orange)">${_esfEsc(banco)}</b>` +
    ` · ${viaja ? 'viaja' : 'no viaja'} · ${duerme ? 'duerme' : 'no duerme'}`;
}

function _migLeer() {
  const g = id => ((_migEl(id) || {}).value || '').trim();
  return {
    evento_id: _migSlug(),
    nombre: g('mig-nombre'),
    correo: g('mig-correo'),
    celular: g('mig-celular'),
    tipo_paquete: g('mig-paquete'),
    zona_boleto: g('mig-zona'),
    total_contrato: g('mig-total'),
    abonado_previo: g('mig-abonado'),
    talla_playera: g('mig-talla'),
    // [CAP-MIG-FIX] Las dos columnas ya existían en `viajeros_evento`; solo
    // faltaba pedirlas en la pantalla.
    emergencia_nombre: g('mig-emerg-nombre'),
    num_emergencia: g('mig-emerg-num'),
    // El DESCUENTO se guarda en la NOTA para no perder el dato: `viajeros_evento`
    // no tiene columna propia, y añadir una migración de base por un renglón de
    // texto de transición es caro. Va con su rótulo, no suelto.
    notas: _migNotasConDescuento(g('mig-notas'), g('mig-desc')),
  };
}

// [CAP-MIG-FIX] El descuento no se pierde: si lo hay, se antepone a la nota con
// su rótulo. Hay que DECIRLO porque el total ya viene descontado, y sin esto
// nadie podría reconstruir de dónde salió el número.
function _migNotasConDescuento(nota, desc) {
  const d = Number(String(desc || '').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(d) || d <= 0) return nota;
  const t = `descuento aplicado: $${d.toLocaleString('es-MX')}`;
  return nota ? `${t} · ${nota}` : t;
}

// ═══ [CAP-MIG-FIX] EL COSTO SUGERIDO ═══════════════════════════════════════
//
// Al elegir paquete+zona se PRE-LLENA el costo desde el catálogo. La aritmética
// NO vive aquí: se le pide al endpoint, que llama a `resolverPrecioVenta` —la
// misma que sella el precio de una venta del Portal—. Una copia de la regla de
// precios en el navegador sería la cuarta, y la casa lleva tres tuercas
// evitando justo eso.
//
// ⚠️ ES SUGERENCIA, NO CANDADO. El campo queda EDITABLE y lo que se guarda es
// lo que él diga: el total del Excel ya trae dentro hotel, transporte y lo
// negociado. Si difieren, MANDA EL EXCEL (regla de oro de VJ-3).
let _migSugBase = null;   // la sugerencia SIN descuento, para poder re-restar

async function _migSugerirCosto(soloDescuento) {
  const pista = _migEl('mig-sug');
  const campo = _migEl('mig-total');
  if (!campo) return;
  if (soloDescuento) { _migPintaSugerencia(); return; }   // mover el descuento no re-pregunta

  const evento_id = _migSlug();
  const tipo_paquete = ((_migEl('mig-paquete') || {}).value || '').trim();
  const zona = ((_migEl('mig-zona') || {}).value || '').trim();
  _migSugBase = null;
  if (!evento_id || !tipo_paquete) { _migPintaSugerencia(); return; }
  if (pista) pista.textContent = 'calculando…';
  try {
    const j = await khViajeros.precioSugerido({ evento_id, tipo_paquete, zona });
    _migSugBase = (j && Number.isFinite(Number(j.sugerido))) ? Number(j.sugerido) : null;
    if (_migSugBase == null) {
      // Honesto: se dice el motivo. Un cero se leería como "cuesta cero".
      if (pista) pista.textContent = 'sin sugerencia: ' + ((j && j.motivo) || 'el catálogo no alcanza');
      return;
    }
  } catch (_) {
    _migSugBase = null;
    if (pista) pista.textContent = 'sin sugerencia (no se pudo consultar)';
    return;
  }
  _migPintaSugerencia(true);
}

function _migPintaSugerencia(rellenar) {
  const pista = _migEl('mig-sug');
  const campo = _migEl('mig-total');
  if (!pista || !campo) return;
  if (_migSugBase == null) { pista.textContent = ''; return; }
  const d = Number(String(((_migEl('mig-desc') || {}).value || '')).replace(/[^0-9.-]/g, ''));
  const desc = (Number.isFinite(d) && d > 0) ? d : 0;
  const sug = Math.max(0, _migSugBase - desc);
  pista.textContent = desc > 0
    ? `sugerido del catálogo: $${_migSugBase.toLocaleString('es-MX')} − $${desc.toLocaleString('es-MX')} de descuento = $${sug.toLocaleString('es-MX')} · editable`
    : `sugerido del catálogo: $${sug.toLocaleString('es-MX')} · editable`;
  // ⚠️ Solo se rellena si el campo está VACÍO o si trae la sugerencia anterior.
  // Pisar un número que Memo escribió a mano sería perder el dato del Excel —
  // justo lo que la regla de oro de VJ-3 protege.
  const actual = String(campo.value || '').trim();
  const eraSug = actual === '' || actual === String(campo.dataset.sug || '');
  if ((rellenar || desc > 0) && eraSug) {
    campo.value = String(sug);
    campo.dataset.sug = String(sug);
  }
}
function _migError(msg) {
  const e = _migEl('mig-error');
  if (!e) return;
  if (!msg) { e.style.display = 'none'; e.textContent = ''; return; }
  e.style.display = ''; e.textContent = msg;
}

async function migGuardar() {
  _migError('');
  _migEl('mig-parecido').style.display = 'none';
  const d = _migLeer();
  if (!d.evento_id) return _migError('No hay evento abierto.');
  if (!d.nombre) return _migError('El nombre es obligatorio.');
  if (!d.tipo_paquete) return _migError('Elige el paquete.');
  if (!d.zona_boleto) return _migError('Elige la zona del boleto.');
  if (d.total_contrato === '') return _migError('Falta el costo del paquete.');

  // El deduplicado que Memo pidió proponer. NO cuelga del correo: muchos del
  // Excel no lo traen, y en Postgres NULL != NULL deja pasar TODOS los
  // duplicados sin decir nada. Se compara el nombre normalizado dentro del
  // MISMO evento, y lo confirma un humano — dos personas con el mismo nombre
  // existen; un duplicado silencioso también.
  let parecidos = [];
  try { parecidos = await khViajeros.buscarParecido(d.evento_id, d.nombre, d.correo); } catch (_) {}
  if (parecidos.length) {
    _migPendiente = d;
    _migEl('mig-parecido-list').innerHTML = parecidos.map(v =>
      `· <b>${_esfEsc(v.nombre)}</b>${v.correo ? ' · ' + _esfEsc(v.correo) : ''}` +
      `${v.tipo_paquete ? ' · ' + _esfEsc(String(v.tipo_paquete).toUpperCase()) : ''}` +
      `${v.zona_boleto ? ' · ' + _esfEsc(v.zona_boleto) : ''}` +
      `${v.total_contrato != null ? ' · ' + _vj3Money(v.total_contrato) : ''}`
    ).join('<br>');
    _migEl('mig-parecido').style.display = '';
    return;
  }
  await _migEnviar(d);
}
function migCancelarParecido() {
  _migPendiente = null;
  _migEl('mig-parecido').style.display = 'none';
  _migEl('mig-nombre') && _migEl('mig-nombre').focus();
}
async function migGuardarIgual() {
  const d = _migPendiente;
  _migPendiente = null;
  _migEl('mig-parecido').style.display = 'none';
  if (d) await _migEnviar(d);
}

async function _migEnviar(d) {
  const btn = _migEl('mig-guardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const r = await khViajeros.migrar(d);
    const v = r && r.viajero;
    if (!v) throw new Error('el servidor no devolvió el viajero');
    _migCapturados.unshift(v);
    _migPintarCapturados();
    // [MIG-1b] El aviso del DOBLE DESCUENTO. No se traga: si esta gente ya
    // estaba en el corte del Excel que Memo capturó como "vendidos fuera",
    // ahora se descuenta dos veces y el semáforo cierra zonas que sí tienen
    // boletos. Se dice con el número exacto y el ajuste lo confirma él.
    _migAvisoDoble(r && r.aviso_doble_descuento);
    // Uno tras otro: se limpia lo de la persona y se CONSERVA paquete y zona,
    // que en una tanda del Excel se repiten. El foco vuelve al nombre.
    ['mig-nombre','mig-correo','mig-celular','mig-total','mig-abonado','mig-talla','mig-notas']
      .forEach(id => { const el = _migEl(id); if (el) el.value = ''; });
    _migEl('mig-nombre') && _migEl('mig-nombre').focus();
    _migError('');
  } catch (e) {
    _migError((e && e.message) || 'No se pudo guardar.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar y seguir →'; }
  }
}

// ═══ [MIG-1b] EL AVISO DEL DOBLE DESCUENTO ═════════════════════════════════
//
// `vendidos_fuera` fue el puente mientras la migración no existía: Memo escribía
// ahí su corte del Excel para que el semáforo no sobrevendiera. Migrar a esa
// misma gente la hace descontar POR SU CUENTA, como cuarto término — y los
// mismos boletos se restan dos veces.
//
// ⚠️ NO SE AJUSTA SOLO. `vendidos_fuera` lo escribió Memo a mano, y bajarlo sin
// permiso decide por él en el sentido peligroso: ABRE stock. Se dice, con el
// número exacto y las dos salidas ("son los mismos" / "son distintos"), y el
// ajuste lo confirma él. Lo único inaceptable es el silencio.
let _migAvisoZona = null;

function _migAvisoDoble(aviso) {
  const box = _migEl('mig-aviso-doble');
  if (!box) return;
  if (!aviso || !aviso.zona) { box.style.display = 'none'; box.innerHTML = ''; _migAvisoZona = null; return; }
  _migAvisoZona = aviso;
  box.style.display = '';
  box.innerHTML = `<div class="mig-doble">
    <div class="mig-doble-t">⚠️ Cuidado: se podría descontar dos veces</div>
    <div class="mig-doble-d">${_esfEsc(aviso.mensaje)}</div>
    <div class="mig-doble-btns">
      <button type="button" class="btn btn-primary btn-sm" onclick="_migAjustarFuera()">Bajar a ${aviso.sugerido}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="_migAvisoDoble(null)">Son personas distintas</button>
    </div>
  </div>`;
}

// El ajuste REUSA la misma puerta que la casilla del Palacio (`ajuste_guardar`
// de admin-compras): no nace un segundo camino para escribir el mismo dato.
async function _migAjustarFuera() {
  const a = _migAvisoZona;
  if (!a) return;
  const evId = _migSlug();
  if (!evId) { _migError('No hay evento abierto.'); return; }
  if (!confirm(`¿Bajar "vendidos fuera" de ${a.zona} de ${a.vendidos_fuera} a ${a.sugerido}?\n\nHazlo SOLO si esa gente ya está migrada: baja el número, o sea ABRE stock.`)) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-compras', {
      method: 'POST',
      body: JSON.stringify({ accion: 'ajuste_guardar', evento_id: evId, zona: a.zona, vendidos_fuera: a.sugerido,
                             nota: `ajustado al migrar ${a.migrados_en_zona} viajero(s) — MIG-1b` }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo ajustar');
    _migAvisoDoble(null);
    _migError('');
  } catch (e) { _migError((e && e.message) || 'No se pudo ajustar.'); }
}

function _migPintarCapturados() {
  const cnt = _migEl('mig-cnt');
  if (cnt) cnt.textContent = String(_migCapturados.length);
  const box = _migEl('mig-capturados');
  if (!box) return;
  if (!_migCapturados.length) {
    box.innerHTML = '<div style="font-size:11px;color:var(--ts)">Todavía no capturas a nadie en esta tanda.</div>';
    return;
  }
  box.innerHTML = _migCapturados.map(v => {
    // La MISMA fórmula sellada que usa el resto del Palacio y el servidor.
    const s = _vj3Saldo(v, []);
    const dinero = s
      ? `${_vj3Money(s.total)} · abonó ${_vj3Money(s.abonado)} · ${s.aFavor ? 'a favor ' : 'resta '}${_vj3Money(s.resta)}`
      : 'sin dinero';
    return `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);font-size:11px">
      <span style="color:var(--green)">✓</span>
      <b style="min-width:150px">${_esfEsc(v.nombre)}</b>
      <span style="color:var(--orange);font-family:'JetBrains Mono',monospace">${_esfEsc(String(v.tipo_paquete || '').toUpperCase())}</span>
      <span style="color:var(--ts)">${_esfEsc(v.zona_boleto || '')}</span>
      <span style="margin-left:auto;color:var(--ts);font-family:'JetBrains Mono',monospace">${dinero}</span>
    </div>`;
  }).join('');
}

// Enter guarda, sin salir de la pantalla. Se engancha al panel entero y no a
// cada campo: los campos nacen y mueren, el panel no.
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  const panel = _migEl('mig-panel');
  if (!panel || panel.style.display === 'none') return;
  if (!panel.contains(e.target)) return;
  if (e.target && e.target.tagName === 'SELECT') return;   // Enter en un select lo cierra
  e.preventDefault();
  if (_migEl('mig-parecido').style.display !== 'none') return;  // hay que decidir el parecido
  migGuardar();
});


// ═══════════════════════════════════════════════════════════════════════════
// [VJ-4] ESPEJO de netlify/functions/_lib/paquete-viaje.js
//
// La regla de quién viaja y quién duerme es UNA, y su original vive en el lib
// del backend. Aquí está su espejo porque el navegador no puede importar aquel
// archivo — y el arnés CAREA los dos: si alguien cambia uno, truena.
//
//   viaja  → plus · ride · null        duerme → plus · ride · stay · null
//   cheap  → ninguna de las dos        stay   → duerme sí, viaja no
//
// null = staff / intercambio / ganadora: DISPONIBLES, Memo decide.
// Sin distinguir mayúsculas: los migrados traen 'plus' y el alta de staff 'PLUS'.
// ═══════════════════════════════════════════════════════════════════════════
const VJ4_VIAJAN = ['plus', 'ride'];
const VJ4_DUERMEN = ['plus', 'ride', 'stay'];
function _vj4Norm(tp) { const x = String(tp == null ? '' : tp).trim().toLowerCase(); return x || null; }
function _vj4Duerme(tp) { const p = _vj4Norm(tp); return p === null || VJ4_DUERMEN.includes(p); }

// ═══════════════════════════════════════════════════════════════════════════
// [VJ-3] LA REGLA DE ORO DEL SALDO DE UN MIGRADO
//
//   resta = total_contrato − abonado_previo − suma(abonos_viajero)
//
// NUNCA se recalcula de paquete + habitación + vuelo: el total que vino del
// Excel YA traía todo eso adentro, y volver a armarlo daría otro número.
// `total_contrato` y `abonado_previo` están CONGELADOS.
//
// Vive en UNA sola función porque la usan dos pantallas (la ficha y la tabla).
// Dos copias de una regla de dinero acaban divergiendo, y el síntoma sería que
// la misma persona debe cosas distintas según dónde la mires.
//
// SALDOS A FAVOR: hay 15 personas reales con abonado > total (Laura, −$652.5).
// NO son error y no se corrigen: se dicen "a favor".
// ═══════════════════════════════════════════════════════════════════════════
function _vj3Saldo(v, abonos) {
  if (!v || v.total_contrato == null) return null;   // fila sin dinero
  const total = Number(v.total_contrato) || 0;
  const previo = Number(v.abonado_previo) || 0;
  const extra = (abonos || []).reduce((s, a) => s + (Number(a.monto) || 0), 0);
  const abonado = previo + extra;
  return { total, abonado, resta: total - abonado, aFavor: (total - abonado) < 0 };
}

function _vj3Money(n) {
  return '$' + Math.abs(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// [sec-sensibles] deudas_coordi + strikes_log + sistema_alertas vía Netlify Function
// con service_role. deudas: maestro_roshi+bulma · strikes/alertas: maestro_roshi.
// strikes_log.por_quien lo fuerza el backend al jwt (anti-spoofing).
const khCoordi = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-coordi-control', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-coordi-control ' + r.status));
    return j;
  },
  // deudas
  deudasListar(opts) { return this._call(Object.assign({ accion: 'deudas_listar' }, opts || {})).then(j => j.deudas || []); },
  deudasMarcarPagada(id) { return this._call({ accion: 'deudas_marcar_pagada', id }); },
  deudasEliminar(id) { return this._call({ accion: 'deudas_eliminar', id }); },
  // strikes (por_quien lo pone el backend)
  strikeCrear(coordi_id, accionStrike, motivo, evento_id) { return this._call({ accion: 'strike_crear', coordi_id, tipo_accion: accionStrike, motivo, evento_id }); },
  // sistema_alertas (solo lectura)
  alertasListar() { return this._call({ accion: 'sistema_alertas_listar' }).then(j => j.alertas || []); },
};

// [sec-usuarios] Registro por invitación (flujo PRE-JWT): el invite_token es la
// credencial. fetch directo (no khAdminFetch) porque el invitado aún no tiene JWT.
async function khRegistroInvitado(payload) {
  const r = await fetch('/.netlify/functions/registro-invitado', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  return r.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor' }));
}

// Cache local (para no re-fetchear todo el tiempo)
let _eventosCache = [];

// ═══════════════════════════════════════════════════════════════
// NAVEGACIÓN
// ═══════════════════════════════════════════════════════════════
// `etiqueta`: nombre legible del destino, para las pantallas que YA NO tienen
// botón de menú (Saldos y Por Evento, desde E5-4). Sin botón no hay de dónde
// sacar el rótulo de la barra móvil, y no vamos a escribir una lista de nombres
// al lado: lo pone quien navega, que es el único que sabe a dónde va.
function showPage(name, etiqueta) {
 // [SEG-2] Mismo candado que showHerramienta, misma fuente.
 // [E5-4] La pregunta "¿esta pantalla lleva candado?" se le hace a
 // PERMISOS_TABS, no al menú. Las pantallas que no aparecen en NINGÚN rol son
 // las que se abren desde otra y no tienen permiso propio: ésas siguen sin
 // filtrarse aquí, igual que antes. La diferencia es que ahora quitar un botón
 // ya no puede quitar un candado.
 if (TABS_CON_PERMISO.has(name) && !_puedeVerTab(name)) {
   showToast('No tienes acceso a esta sección', 'error');
   return;
 }
 document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
 document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
 document.getElementById(`page-${name}`).classList.add('active');
 const navBtn = document.getElementById(`nav-${name}`);
 if (!navBtn && etiqueta) actualizarLabelNavMobile(etiqueta);
 if (navBtn) {
   navBtn.classList.add('active');
   actualizarLabelNavMobile(navBtn.textContent.trim());
   // No esconder dónde estás: si la vista activa cae en un grupo colapsado, ábrelo.
   const grp = navBtn.closest('.nav-group');
   if (grp) grp.classList.remove('collapsed');
 }
 cerrarNavMobile();
 loadPage(name);
 // D2: sincroniza la barra inferior móvil (estado activo + visibilidad por rol)
 // y oculta grupos del sidebar que quedaron vacíos. Única adición a showPage.
 if (typeof _khNavSync === 'function') _khNavSync(name);
}

function loadPage(name) {
 if (name === 'resumen') loadResumen();
 if (name === 'pagos') loadPagos();
 if (name === 'eventos') _evtPoblarSelector();
 if (name === 'gastos') loadGastos();
 if (name === 'ingresos') loadIngresos();
 if (name === 'saldos') loadSaldos();
 if (name === 'inventario') loadInventario();
 if (name === 'reportes') loadReportes();
 if (name === 'capsule') loadCapsule();
 if (name === 'equipo') loadEquipo();
 if (name === 'capsule') loadCapsule();
 if (name === 'solicitudes_portal') loadSolicitudesPortal();
 if (name === 'kamisama') loadKamisama();
 if (name === 'montana') loadMontana();
 if (name === 'radar') initRadarTab();
 if (name === 'esferas') { loadEsferasEventos(); n1Cargar(); }
 if (name === 'baba') babaCargar();
 if (name === 'yamcha') loadYamcha();
 if (name === 'radio') loadRadio();
}

// ═══════════════════════════════════════════════════════════════
// KAIO-SAMA — Admin de Radio Conecta (peticiones + muro). Solo maestro_roshi.
// Lee/escribe radio_peticiones y radio_muro (Portal) vía admin-radio-* (service_role).
// ═══════════════════════════════════════════════════════════════
let _radioPeticiones = [], _radioMuro = [], _radioSoloPend = true;
const RADIO_NOWPLAYING = 'https://radio.conectareynosa.mx/api/nowplaying/radioconecta';
const RADIO_STREAM_URL = 'https://radio.conectareynosa.mx/listen/radioconecta/radio.mp3';

// ═══════════════════════════════════════════════════════════════
// 📻 Reproductor compacto de Radio Conecta en la topbar (todos los roles).
// El <audio> se crea al PRIMER play (NUNCA autoplay) y vive en la barra superior
// → sigue sonando al cambiar de panel. El "ahora suena" reusa RADIO_NOWPLAYING
// (misma API que la página de radio); sondea cada 30s SOLO mientras reproduce y
// se detiene al pausar. Fails-soft: si el stream/API falla, no rompe la app.
// ═══════════════════════════════════════════════════════════════
let _tbAudio = null, _tbRadioTimer = null, _tbPlaying = false;

function _tbSetBtn(playing) {
  _tbPlaying = playing;
  const b = document.getElementById('tb-radio-btn');
  if (b) { b.textContent = playing ? '⏸' : '▶'; b.setAttribute('aria-label', playing ? 'Pausar Radio Conecta' : 'Reproducir Radio Conecta'); }
  const r = document.getElementById('tb-radio');
  if (r) r.classList.toggle('is-playing', playing);
}

async function _tbRadioNow() {
  try {
    const r = await fetch(RADIO_NOWPLAYING, { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    const s = (d && d.now_playing && d.now_playing.song) || {};
    const txt = [s.title, s.artist].filter(Boolean).join(' · ') || 'En vivo';
    const el = document.getElementById('tb-radio-song');
    if (el) el.textContent = txt;   // textContent → a prueba de XSS (títulos de terceros)
  } catch (_) { /* fails-soft: conserva el último título */ }
}

function _tbRadioPausar() {
  if (_tbAudio) { try { _tbAudio.pause(); } catch (_) {} }
  _tbSetBtn(false);
  if (_tbRadioTimer) { clearInterval(_tbRadioTimer); _tbRadioTimer = null; }   // detén el sondeo al pausar
}

function _tbRadioTocar() {
  if (!_tbAudio) {
    // Se crea SOLO en el primer play (jamás autoplay). Vive en la topbar.
    _tbAudio = new Audio(RADIO_STREAM_URL);
    _tbAudio.preload = 'none';
    _tbAudio.addEventListener('pause', () => { if (_tbPlaying) _tbRadioPausar(); });
    _tbAudio.addEventListener('error', _tbRadioPausar);
    const host = document.getElementById('tb-radio');
    if (host) host.appendChild(_tbAudio);
  }
  const p = _tbAudio.play();
  if (p && p.catch) p.catch(() => _tbRadioPausar());   // si el navegador bloquea, revierte la UI
  _tbSetBtn(true);
  _tbRadioNow();                                        // título inmediato
  if (!_tbRadioTimer) _tbRadioTimer = setInterval(_tbRadioNow, 30000);   // sondea SOLO mientras suena
}

function _tbRadioToggle() { if (_tbPlaying) _tbRadioPausar(); else _tbRadioTocar(); }

let _radioHeroTimer = null;
// Snapshot en memoria (sesión) para la tendencia de las tarjetas de Números.
let _radioNumPrev = { oyentes: null, likes: null, peticiones: null };








// ── Avisos inteligentes (bloque bajo el hero; solo aparecen cuando existen) ──
// Cada fuente es independiente y fail-soft: si falla, ese aviso no aparece.
let _avisoCaidaTimer = null;
let _avisoPicoHecho = false;   // el pico de oyentes se evalúa UNA vez por carga












// 4. Las más tocadas del AutoDJ (7 días) — clickeables al modal de edición.
let _rnMasTocadasData = [];



// ── Top 20 semanal (admin-radio-stats?accion=top20) ─────────────────────────
// El Top 10 público + las 10 siguientes (11-20, atenuadas tras la línea de
// corte) para ver cómo se moverá la semana. Cada fila abre el modal de edición
// con el MISMO resolver del click-to-edit de Control (radioMediaAbrirPorNombre).
let _radioTop20Data = [];











// ═══════════════════════════════════════════════════════════════
// KAIO-SAMA FASE 4 — Editor permanente de metadata y portadas.
// Todo pasa por admin-radio-media (AzuraCast files + editor del NAS server-side).
// El cambio se escribe DENTRO del archivo original.
// ═══════════════════════════════════════════════════════════════
let _radioMediaResults = [];    // últimos resultados de búsqueda (índice → archivo)
let _radioMediaNuevaPortada = null; // { imagen(base64), mime } elegida en el modal






















// ═══════════════════════════════════════════════════════════════
// KAIO-SAMA — Tab BIBLIOTECA: explorador de toda la música.
// Navega files/list por carpeta (admin-radio-media ?dir=). Raíz = artistas
// (carpetas), luego álbumes, luego canciones. Cada canción abre el modal de
// edición existente con su ruta directa. Reutiliza toda la infraestructura.
// ═══════════════════════════════════════════════════════════════
let _bibArtistas = null;   // cache de carpetas raíz [{nombre,ruta}] (todas las páginas)
let _bibCrumbs = [];       // profundidad actual [{nombre,ruta}] (vacío = raíz/artistas)
let _bibLetra = '';        // filtro de letra activo ('' = todas)
let _bibBusqueda = '';     // filtro de búsqueda de artista (client-side)
let _bibArchivos = [];     // archivos del nivel actual (para abrir modal por índice)
let _bibPagina = 1;
let _bibTotalPaginas = 1;
































// ═══════════════════════════════════════════════════════════════
// BOOT — Arranca todo
// ═══════════════════════════════════════════════════════════════
async function bootApp() {
 // [PERF v1] Se eliminó del boot la carga de TODOS los eventos
 // (khEventos.listar + populateEventoSelects): populateEventoSelects es un
 // no-op —su único destino, el <select id="pago-evento">, ya no existe en el
 // DOM— y _eventosCache no lo lee nadie más en el arranque (el flujo de
 // guardar evento re-carga por su cuenta). Era un fetch de tabla completa
 // puro desperdicio en cada entrada.
 // Establecer fecha de hoy en formularios
 const today = new Date().toISOString().split('T')[0];
 ['pago-fecha','gasto-fecha','ev-fecha'].forEach(id => {
 const el = document.getElementById(id);
 if (el) el.value = today;
 });
 // [E5-5] El aterrizaje. Ya no es "siempre el Resumen": es la primera pantalla
 // que este usuario PUEDE ver. showPage se encarga del candado y de llamar a su
 // cargador, así que el critical path sigue siendo una sola pantalla.
 const _home = _homeDeRol();
 if (_home) showPage(_home);
 else showPage('sin_acceso');   // todo bloqueado: se dice con palabras
 // Manejar links de aceptar/declinar tour desde correo (barato + intención
 // directa del usuario: se queda en el critical path).
 manejarAccionAsignacion();
 // [PERF v1] checkMensajeDia (banner de chrome, no la vista) se difirió a idle
 // en enterApp, junto con los badges — fuera del critical path del arranque.
}

function populateEventoSelects() {
 const selects = [
 // 'filtro-evento-pagos' lo puebla _poblarFiltroEventoPagos() desde EV (Fase 3 cobranza).
 // 'selector-evento' lo puebla _evtPoblarSelector() desde EV (Fase 4 Por Evento).
 // 'filtro-evento-gastos'/'gasto-evento' los puebla _poblarSelectsGastos() desde EV (G1).
 'pago-evento'
 ];
 selects.forEach(id => {
 const el = document.getElementById(id);
 if (!el) return;
 const firstOpt = el.options[0];
 el.innerHTML = '';
 if (firstOpt) el.appendChild(firstOpt.cloneNode(true));
 _eventosCache.forEach(ev => {
 const opt = document.createElement('option');
 opt.value = ev.id;
 opt.textContent = `${ev.artista}${ev.tour ? ' — '+ev.tour : ''} · ${fmtFecha(ev.fecha)}`;
 el.appendChild(opt);
 });
 });
}

// ═══════════════════════════════════════════════════════════════
// RESUMEN
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// FASE 4 — Resumen y Por Evento sobre el MODELO DEL PORTAL
// Reusan admin-cobranza-list (mismos helpers que la Fase 3.1). Solo LEEN y suman.
// Los TOTALES de dinero EXCLUYEN cancelados; estos se cuentan aparte.
// ═══════════════════════════════════════════════════════════════
let _cobTodoCache = null;   // { activos:[], cancelados:[], capHit:bool } | null
let _gastosG2Cache = null;  // { lista:[], total:Number } | null — gastos para Resumen/Por Evento
let _evtTours = [];         // tours ACTIVOS del evento seleccionado en Por Evento
let _evtFiltrados = [];     // subconjunto filtrado de la tabla (para CSV)

// Trae TODA la cobranza (activos por default + cancelados) una sola vez. La pestaña
// Pagos mantiene su propia _cobranzaCache; esta cache es para Resumen/Por Evento.
async function _cobCargarTodo(force) {
  if (_cobTodoCache && !force) return _cobTodoCache;
  await _poblarFiltroEventoPagos();   // garantiza _cobEVMap (multifecha) poblado
  const hdrs = _spAdminHeaders();
  const pedir = (estado) => khAdminFetch('/.netlify/functions/admin-cobranza-list', {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify(estado ? { estado } : {}),
  }).then(r => r.json().then(d => ({ ok: r.ok, d })));
  const [act, can] = await Promise.all([pedir(null), pedir('cancelado')]);
  if (!act.ok) throw new Error((act.d && act.d.error) || 'No se pudo cargar la cobranza');
  const activos    = Array.isArray(act.d.tours) ? act.d.tours : [];
  const cancelados = (can.ok && Array.isArray(can.d.tours)) ? can.d.tours : [];
  // admin-cobranza-list topa en 300; si llegamos al tope, los totales podrían estar
  // incompletos (avisamos en Resumen en vez de mostrar números silenciosamente cortos).
  _cobTodoCache = { activos, cancelados, capHit: activos.length >= 300 };
  return _cobTodoCache;
}

// ¿El tour pertenece al evento del filtro? Mismo criterio que la Fase 3.1:
// valor con '#': match exacto (fecha de multifecha); valor base: base o base#idx.
function _cobTourMatchEvento(t, evId) {
  if (!evId) return true;
  if (evId.indexOf('#') >= 0) return t.evento_id === evId;
  return t.evento_id === evId || (typeof t.evento_id === 'string' && t.evento_id.startsWith(evId + '#'));
}

// Trae TODOS los gastos una sola vez (cache en memoria, estilo _cobTodoCache) para
// sumarlos en Resumen y Por Evento. admin-gastos-list con body {} = todos (incluye los
// "General"). Si la función falla, devolvemos 0 y NO cacheamos (reintenta a la próxima)
// para no tronar el Resumen: los demás números deben seguir saliendo.
async function _cobCargarGastos(force) {
  if (_gastosG2Cache && !force) return _gastosG2Cache;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-gastos-list', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los gastos');
    const lista = Array.isArray(d.gastos) ? d.gastos : [];
    const total = Number(d.total || 0) || lista.reduce((a, g) => a + Number(g.monto || 0), 0);
    _gastosG2Cache = { lista, total };
    return _gastosG2Cache;
  } catch (e) {
    return { lista: [], total: 0 };
  }
}

// ── Capa 3: utilidad por evento (admin-utilidad-evento) ──────────────────────
let _utilG3Cache = null;  // { eventos, sin_evento, totales } | null

// Trae la utilidad por evento (todos los eventos) una sola vez. Best-effort: si
// falla devuelve null y NO cachea — la vista sigue pintando lo demás (igual
// criterio que _cobCargarGastos).
// ═══════════════════════════════════════════════════════════════════════════
// [MER-1] ¿EL EVENTO YA PASÓ? — UNA sola respuesta para las cuatro pantallas
//
// Memo, del 7-ago sobre melanie (el concierto fue el 6): "se quedaron sin
// vender". Y las pantallas seguían diciendo «7 boletos por vender ≈ $40,100 ·
// si se vende todo: +$29,319». Eso no es una estimación optimista: es una
// imposibilidad. Un boleto de un concierto que ya ocurrió no se vende nunca, y
// una pantalla que ofrece una salida inexistente es peor que una que calla.
//
// MANDA LA ÚLTIMA FECHA, NO LA PRIMERA. `ds` de un evento multifecha es el
// PRIMER día — harry trae `ds:'2026-08-01'` con funciones el 7 y el 8 de
// agosto — así que compararlo contra hoy declararía merma sobre boletos que
// todavía se pueden vender. Ése es el error caro de los dos: apagaría la bodega
// de un evento VIVO y pintaría de rojo un semáforo que debía estar ámbar. Las
// fechas extra viven en `dsList` en unos eventos y en `multifecha[].ds` en
// otros (weeknd y straykids usan la primera; morat y caifanes la segunda): se
// leen las dos y gana la mayor.
//
// HOY EN HORA MX, con `_mxFechaStr()`, el helper de la casa. Jamás
// `toISOString()`: pasadas las 6 de la tarde de acá ya es el día siguiente en
// Greenwich, y en esta casa se trabaja de noche — el evento de HOY se
// declararía pasado a media jornada, con boletos todavía en venta.
//
// Y la frontera es estricta (`<`): el día del evento NO es pasado. Mientras el
// concierto no ocurre hay taquilla.
//
// Sin fecha legible NO se afirma nada: `false`, y la bodega se queda con su cara
// de siempre. Una merma inventada es peor que una esperanza vieja.
function _mermaUltimaFecha(ev) {
  const iso = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '');
  if (!ev || typeof ev !== 'object') return iso(ev);   // también acepta 'YYYY-MM-DD' pelado
  const fechas = [iso(ev.ds)];
  if (Array.isArray(ev.dsList)) ev.dsList.forEach((d) => fechas.push(iso(d)));
  if (Array.isArray(ev.multifecha)) ev.multifecha.forEach((m) => fechas.push(iso(m && m.ds)));
  const buenas = fechas.filter(Boolean).sort();
  return buenas.length ? buenas[buenas.length - 1] : '';
}
function _mermaPasado(ev) {
  const f = _mermaUltimaFecha(ev);
  return !!f && f < _mxFechaStr();
}

// [AUD-1c] LA UTILIDAD, CON LA BODEGA AL LADO — el requisito que Memo firmó:
// EL ROJO NUNCA SOLO. Una ganancia negativa con boletos sin vender no es una
// pérdida: es dinero que todavía está en forma de boleto. Enseñar el rojo sin la
// bodega asusta sin razón, y con melanie el rojo es real (−$10,781 contra 7
// boletos que valen ≈$40,100).
function _audUtilidadPintar(utilidad, cta, util) {
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  // [UTIL-C-2] `null` = NO SE PUEDE SABER, y se dice. Antes esta función no
  // distinguía el desconocido del cero: `Number(null) || 0` pinta $0 en verde
  // con el rótulo "Utilidad", que es una afirmación —"este evento no gana ni
  // pierde"— hecha justo cuando no hay con qué afirmarla. Es el mismo cero que
  // AUD-1 encontró diciendo "Cobrado $0" sobre $136,391 cobrados.
  const sinDato = (utilidad == null);
  const neg = !sinDato && Number(utilidad) < 0;
  // El signo, en palabras (patrón CAP-FIX-2d/AUD-1b).
  setTxt('m-utilidad', sinDato ? '—' : _spFmtMxn(Math.abs(Number(utilidad) || 0)));
  const lbl = document.getElementById('m-utilidad-lbl');
  if (lbl) lbl.textContent = sinDato ? 'Sin dato' : (neg ? 'Falta por recuperar' : 'Utilidad');
  const elUtil = document.getElementById('m-utilidad');
  if (elUtil) elUtil.className = 'metric-value ' + (sinDato ? '' : (neg ? 'red' : 'green'));

  // [UTIL-B-3] "En mano": la caja, subordinada al margen. Se pinta SIEMPRE que
  // se sepa; si no se sabe, se dice — un guion es una afirmación menos peligrosa
  // que un cero.
  const mano = document.getElementById('m-enmano');
  if (mano) {
    const v = (cta || {}).en_mano;
    mano.innerHTML = (v == null)
      ? 'en mano: <b>—</b>'
      : `en mano: <b>${_spFmtMxn(Number(v))}</b>`;
  }

  const bod = document.getElementById('m-bodega');
  if (!bod) return;
  const b = cta || {};
  const boletos = b.bodega_boletos;
  const valor = b.bodega_valor;
  // [MER-1] Los dos montones llegan SEPARADOS del servidor y aquí no se vuelven
  // a mezclar: lo de los eventos por venir se puede vender, lo de los pasados no.
  const mBoletos = b.merma_boletos;
  const mCosto = b.merma_costo;
  // Sin cuenta o sin inventario NO se pinta una bodega vacía: se calla o se
  // dice, pero no se afirma "0 boletos" que nadie midió.
  if (!cta || (boletos == null && mBoletos == null)) {
    bod.style.display = 'none'; bod.innerHTML = '';
    if (util && util.cuenta_error) {
      bod.style.display = ''; bod.innerHTML = `<span class="aud-bod-mudo">No pude leer el inventario, así que no sé cuántos boletos quedan por vender.</span>`;
    }
    return;
  }
  if (!boletos && !mBoletos) {
    bod.style.display = ''; bod.innerHTML = '<span class="aud-bod-mudo">Sin boletos por vender: la cuenta de arriba ya es la final.</span>';
    return;
  }
  const partes = [];
  // La ESPERANZA: solo de eventos por venir, y solo ahí vive el "si se vende
  // todo".
  //
  // ⚠️ [UTIL-B-3] ESTE COMENTARIO DECÍA LO CONTRARIO, y era cierto bajo la
  // fórmula A: "la utilidad de arriba ya trae el costo de TODO lo comprado
  // dentro de gastos, así que sumarle el valor de venta de lo que aún se puede
  // vender sigue siendo la cuenta correcta". Bajo B **el costo de lo NO vendido
  // ya no está en la utilidad** —es inventario, y espera a venderse—, así que
  // sumar solo el precio prometería una ganancia sin su costo. Ahora se suma el
  // MARGEN: valor de venta − lo que costaron.
  //
  // Y la bodega cambia de papel: bajo A existía como CONTRAPESO (AUD-1c, "el
  // rojo nunca solo") porque un boleto comprado y no vendido hacía rojo a la
  // ganancia sin ser una pérdida. Bajo B ese rojo YA NO NACE. La bodega deja de
  // ser una disculpa y pasa a ser INFORMACIÓN: cuánto te queda por vender y
  // cuánto ganarías si lo vendieras.
  // Va SIN envolver, exactamente el markup de AUD-1c: en un evento por venir esta
  // pantalla tiene que quedar byte a byte como estaba. La merma que viene abajo
  // es un <div> —bloque— así que cuando existen las dos se separan solas.
  if (boletos) {
    // [UTIL-C-4] LA BODEGA ES INFORMACIÓN, NO UN CONTRAPESO. Aquí vivía
    // «Si se vende todo: $X», y bajo la fórmula C esa línea era DOBLE CONTEO:
    // hacía `utilidad + (valor − costo)`, pero el costo de esos boletos ya está
    // restado dentro de la INVERSIÓN TOTAL. Los descontaba dos veces.
    //
    // Y arreglarle la aritmética tampoco era la respuesta. La bodega nació como
    // disculpa del rojo (AUD-1c, "el rojo nunca solo"): bajo la fórmula A un
    // boleto comprado y no vendido ensuciaba la ganancia sin ser una pérdida.
    // Bajo C ese rojo es LA VERDAD —los boletos ya son de Memo, se vendan o
    // no—, así que la bodega deja de tener que defenderlo. Lo que sí contesta,
    // y por eso se queda, es "¿qué me queda por vender y cuánto vale?".
    //
    // El "¿en cuánto cerraría?" no se pierde: vive en el PANEL DE ESCENARIOS de
    // Kamisama (UTIL-C-2), que además cuenta lo que falta por COBRAR — algo que
    // esta línea nunca miró.
    const bCosto = b.bodega_costo;
    const conCosto = Number.isFinite(Number(bCosto));
    partes.push(`<b>${boletos}</b> boleto${boletos === 1 ? '' : 's'} por vender`
      + (valor == null
          ? ' <span class="aud-bod-mudo">— sin precio en el catálogo, no se puede estimar</span>'
          : ` ≈ <b>${_spFmtMxn(valor)}</b> <span class="aud-bod-est">a precio de hoy (estimado)</span>`
            + (conCosto
                ? ` · costaron <b>${_spFmtMxn(Number(bCosto))}</b> <span class="aud-bod-mudo">— ya restados en la utilidad</span>`
                : ' <span class="aud-bod-mudo">— sin costo capturado</span>')));
  }
  // La MERMA: eventos que ya ocurrieron. Se mide en lo que COSTARON, no en lo
  // que se iban a vender, y NUNCA lleva "si se vende todo" — no hay a quién.
  if (mBoletos) {
    partes.push(`<div class="aud-merma"><b>Merma:</b> <b>${mBoletos}</b> boleto${mBoletos === 1 ? '' : 's'} sin vender`
      + (mCosto == null
          ? ' <span class="aud-bod-mudo">— sin costo capturado, no se puede valorar</span>'
          : ` · <b class="mer1-merma">${_spFmtMxn(mCosto)}</b> de costo hundido`)
      + ' <span class="aud-bod-est">de eventos que ya pasaron</span></div>');
  }
  // El acento del bloque es ORO, que en esta casa significa "esto todavía se
  // puede cobrar". Cuando lo único que hay es merma, esa promesa es falsa hasta
  // en el color: se pasa a rojo. Con bodega vendible presente el bloque se queda
  // EXACTAMENTE como estaba, clase incluida.
  bod.className = 'aud-bodega' + ((mBoletos && !boletos) ? ' aud-bodega-merma' : '');
  bod.style.display = '';
  bod.innerHTML = partes.join('');
}

// [AUD-1c] LOS PRECIOS SE INYECTAN DESDE AQUÍ (decisión de Jane).
//
// El catálogo de precios vive en `index.html` y el servidor NO lo tiene — se
// verificó en AUD-1a: `eventos_meta` no guarda precios y la tabla legacy
// `eventos` ni siquiera tiene a melanie. Darle al servidor una fuente propia
// sería una divergencia más esperando nacer, así que se los manda el navegador,
// que ya carga ese catálogo (el MISMO `_fetchEVFromIndex` que usa FIN-1d).
//
// Si el catálogo no cargó, se mandan `null` y la bodega se queda en su conteo
// con `valor_estimado: null` — nunca un cero que diría "no vale nada".
async function _audPreciosPorEvento() {
  try {
    const ev = await _fetchEVFromIndex();
    if (!Array.isArray(ev) || !ev.length) return null;
    const out = {};
    ev.forEach((e) => {
      if (!e || !e.id || !Array.isArray(e.zonas)) return;
      const z = {};
      e.zonas.forEach((x) => {
        const p = Number(x && x.p);
        if (x && x.n != null && Number.isFinite(p) && p > 0) z[String(x.n).trim()] = p;
      });
      if (Object.keys(z).length) out[e.id] = z;
    });
    return Object.keys(out).length ? out : null;
  } catch (_) { return null; }
}

// [MER-1] Y QUÉ EVENTOS YA PASARON, por el MISMO camino y la misma razón: la
// fecha vive en el catálogo de index.html, que el servidor no tiene. El reloj es
// uno solo y es éste; el servidor solo recibe la clasificación ya hecha.
// Sin catálogo se mandan `null` y NINGÚN evento se marca pasado: la bodega se
// queda con su cara de siempre, que es el lado seguro de equivocarse.
async function _audEventosPasados() {
  try {
    const ev = await _fetchEVFromIndex();
    if (!Array.isArray(ev) || !ev.length) return null;
    const out = ev.filter((e) => e && e.id && _mermaPasado(e)).map((e) => String(e.id));
    return out.length ? out : null;
  } catch (_) { return null; }
}

async function _utilCargar(force) {
  if (_utilG3Cache && !force) return _utilG3Cache;
  try {
    // Los dos salen del MISMO catálogo cacheado (_fetchEVFromIndex): dos lecturas,
    // una sola descarga.
    const [precios, pasados] = await Promise.all([_audPreciosPorEvento(), _audEventosPasados()]);
    const cuerpo = {};
    if (precios) cuerpo.precios_por_evento = precios;
    if (pasados) cuerpo.eventos_pasados = pasados;
    const r = await khAdminFetch('/.netlify/functions/admin-utilidad-evento', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify(cuerpo),
    });
    const d = await r.json();
    if (!r.ok || d.ok === false) throw new Error(d.error || 'No se pudo cargar la utilidad');
    _utilG3Cache = {
      eventos:    (d.eventos && typeof d.eventos === 'object') ? d.eventos : {},
      sin_evento: d.sin_evento || null,
      totales:    d.totales || {},
      // [AUD-1c] La cuenta de los DOS mundos, aditiva. `null` si el servidor no
      // la pudo calcular: quien la consuma tiene que distinguir "no hay" de
      // "no sé", y por eso no se rellena con un objeto vacío.
      cuenta:     d.cuenta || null,
      cuenta_error: d.cuenta_error || null,
    };
    return _utilG3Cache;
  } catch (e) {
    return null;
  }
}

// Pinta el banner de caja total de empresa y el bloque Caja/Proyectado/Falta del
// evento (por BASE del slug), desde el cache. Visibilidad propia (no depende de
// tours.length). Si no hay datos, oculta los bloques nuevos.
function _renderUtilidadEvento(evBase) {
  // [SAL-1] El banner de caja se retiró (decisión de Jane): dos "caja total de
  // la empresa" con dos fuentes se habrían separado en cuanto Saldos viera el
  // dinero migrado. En su lugar queda el letrero que dice a dónde se fue.
  // `_lib/utilidad-evento` NO se toca — de ahí comen las liquidaciones.
  const nota0  = document.getElementById('evt-caja-nota');
  const nota1  = document.getElementById('evt-caja-nota-sal1');
  const cache = _utilG3Cache;
  if (!cache) {
    if (nota0) nota0.style.display = 'none';
    if (nota1) nota1.style.display = 'none';
    return;
  }
  if (nota1) nota1.style.display = '';

  // [AUD-1e] Caja / Proyectado / Falta del EVENTO se retiraron: sus tres
  // fórmulas restaban gastos de los DOS mundos a ingresos de UNO solo, y la
  // cuenta buena está arriba desde FIN-1c. En su lugar queda el letrero que
  // dice a dónde se fue cada una.
  const nota = document.getElementById('evt-caja-nota');
  if (nota) nota.style.display = evBase ? '' : 'none';
}

// ═══════════════════════════════════════════════════════════════
// 🌅 SALUDO MATUTINO — banner de bienvenida cultura pop 80s/90s/2000s.
// Frases ORIGINALES inspiradas (guiños, no citas largas). Rotación
// determinística por día+usuario (misma frase todo el día, cambia mañana).
// Cero backend, cero fetch → aparece al instante.
// ═══════════════════════════════════════════════════════════════

function _kmHash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function _mxHoraNum() { return parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/Monterrey', hour: 'numeric', hour12: false }), 10) || 0; }
function _mxFechaStr() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' }); }

// ═══════════════════════════════════════════════════════════════════════════
// [ORD-1] EL ORDEN DE LOS EVENTOS — UNA SOLA REGLA, UN SOLO LUGAR
//
// Medido antes de escribirla: había SIETE listas de eventos y CUATRO órdenes
// distintos conviviendo.
//   · cobranza, Por Evento y gastos ordenaban DESCENDENTE por fecha, o sea el
//     más LEJANO primero — el próximo evento quedaba a media lista;
//   · los tres selectores del Palacio (kam-evt-sel, kam-com-evt, kam-liq-evt)
//     ordenaban POR NOMBRE;
//   · y el mando de Kamisama que hice en KMS-SIMP-1 ordenaba ASCENDENTE a
//     secas, que pone los PASADOS primero. Ése también estaba mal, y lo estaba
//     yo: la aserción que escribí ("la primera es la más cercana") pasaba
//     porque comparaba contra 2027, y un evento de abril también cumple eso.
//
// La regla de Memo es una: PRÓXIMOS PRIMERO (el más cercano arriba), los sin
// fecha después, y los PASADOS al final. Vive aquí y solo aquí.
//
// `hoy` se pregunta en hora de MÉXICO: `new Date()` a secas pasadas las 6 de la
// tarde ya es mañana en Greenwich, y un evento de hoy se iría a "pasados".

// La fecha que ordena a un evento es la PRIMERA de dsList si es multifecha —
// la misma convención que usa el resto de la casa.
function _evFechaOrden(e) {
  const l = (e && Array.isArray(e.dsList) && e.dsList.length) ? e.dsList : (e && e.ds ? [e.ds] : []);
  // Capsule guarda su lista con la forma de la BD (`fecha`, `nombre`), no la
  // del catálogo (`ds`, `a`). Se acepta aquí para que siga habiendo UNA regla:
  // un segundo sort "casi igual" es justo lo que esta tuerca vino a quitar.
  return l[0] || (e && e.fecha) || '';
}

// 0 = próximo · 1 = sin fecha (por confirmar) · 2 = pasado
function _evGrupoOrden(e, hoy) {
  const f = _evFechaOrden(e);
  if (!f) return 1;
  return f >= hoy ? 0 : 2;
}

// Devuelve una COPIA ordenada. No muta la lista que le pasan: varias pantallas
// comparten el mismo array cacheado del catálogo, y ordenarlo en el sitio le
// cambiaría el orden a quien no lo pidió.
function _evOrdenarPorFecha(lista, hoyISO) {
  const hoy = hoyISO || _mxFechaStr();
  return (Array.isArray(lista) ? lista : []).slice().sort((a, b) => {
    const ga = _evGrupoOrden(a, hoy), gb = _evGrupoOrden(b, hoy);
    if (ga !== gb) return ga - gb;
    const fa = _evFechaOrden(a), fb = _evFechaOrden(b);
    // Próximos: el más cercano arriba. Pasados: el más reciente arriba (el de
    // hace un mes se trabaja más que el del año pasado). Sin fecha: por nombre,
    // que es lo único que los distingue.
    if (ga === 0) return fa.localeCompare(fb);
    if (ga === 2) return fb.localeCompare(fa);
    return String(a.a || a.nombre || a.id).localeCompare(String(b.a || b.nombre || b.id), 'es', { sensitivity: 'base' });
  });
}
// Saludo por hora MX: 05:00–11:59 días · 12:00–18:59 tardes · 19:00–04:59 noches.
function _saludoHora() { const h = _mxHoraNum(); return (h >= 19 || h < 5) ? 'Buenas noches' : (h < 12 ? 'Buenos días' : 'Buenas tardes'); }

// El banco de 200 frases del cine vive en frases-cine.js (window.FRASES_CINE),
// cargado ANTES de kamehouse.js. Campos: f=frase · p=película · c=personaje · t=tono.
// Check-in de ánimo (solo admins) elige el bucket de tono; sin check-in = banco completo.
const _ADMIN_CHECKIN = ['maestro_roshi', 'bulma', 'milk', 'mister_popo']; // roshi/bulma/milk + cuidador de bodega (Karin), por ROL no por nombre
function _esAdminCheckin() { return !!(currentUser && _ADMIN_CHECKIN.includes(currentUser.rol)); }
function _moodKey() { return 'kh_animo_' + ((currentUser && currentUser.id) || 'x'); }
function _moodRaw() { try { return JSON.parse(localStorage.getItem(_moodKey()) || 'null'); } catch (_) { return null; } }
function _moodDeHoy() { const r = _moodRaw(); return (r && r.fecha === _mxFechaStr() && ['poder', 'foco', 'animo'].includes(r.mood)) ? r.mood : null; }
function _moodGuardar(mood) { try { localStorage.setItem(_moodKey(), JSON.stringify({ fecha: _mxFechaStr(), mood: mood })); } catch (_) {} } // solo local, NUNCA al servidor

// 🎬 Saludo del día "de cine" — TODOS los roles, en el shell (arriba de su panel
// de inicio). Determinista por día+usuario (fija todo el día). Con check-in de
// ánimo, la frase sale del bucket del tono; sin él, del banco completo.
function _renderSaludo() {
  const el = document.getElementById('kh-saludo');
  if (!el || !currentUser) return;
  const banco = (typeof window !== 'undefined' && Array.isArray(window.FRASES_CINE)) ? window.FRASES_CINE : [];
  if (!banco.length) { el.innerHTML = ''; return; }   // fails-soft: sin banco, sin saludo
  const nombre = _esfEsc((String(currentUser.nombre || '').trim().split(/\s+/)[0]) || 'crack');
  const dia = _mxFechaStr();
  const mood = _moodDeHoy();   // 'poder'|'foco'|'animo' o null
  const pool = mood ? banco.filter((x) => x && x.t === mood) : banco;
  const lista = pool.length ? pool : banco;
  const item = lista[_kmHash(dia + '|' + (currentUser.id || '')) % lista.length] || banco[0];
  el.innerHTML = `
    <div class="kh-saludo">
      <svg class="ic kh-saludo-ic"><use href="#ic-resumen"/></svg>
      <div class="kh-saludo-body">
        <div class="kh-saludo-head">${_saludoHora()}, ${_esfEsc(nombre)}</div>
        <div class="kh-saludo-frase">${_esfEsc(item.f || '')}</div>
        <div class="kh-saludo-cred">${_esfEsc(item.c || '')} · <i>${_esfEsc(item.p || '')}</i></div>
      </div>
    </div>`;
}

// Check-in de ánimo: solo admins, UNA vez por día. La respuesta se guarda en
// localStorage (con la fecha) — jamás al servidor. Cerrar sin contestar = banco
// completo, sin insistir. La pregunta se pinta con textContent (a prueba de XSS).
function _maybeCheckin() {
  if (!_esAdminCheckin()) return;
  const r = _moodRaw();
  if (r && r.fecha === _mxFechaStr()) return;   // ya contestó o cerró hoy → no insistir
  const nombre = (String(currentUser.nombre || '').trim().split(/\s+/)[0]) || '';
  const q = document.getElementById('_checkinQ');
  if (q) q.textContent = `¿Cómo pinta tu día, ${nombre}?`;
  _moodGuardar('dismissed');   // marca el día AL ABRIR → cualquier cierre (X/backdrop/Esc) = no insistir hoy
  openModal('modal-checkin');
}
function _checkinResponder(mood) {
  if (!['poder', 'foco', 'animo'].includes(mood)) mood = 'foco';
  _moodGuardar(mood);
  closeModal('modal-checkin');
  _renderSaludo();   // re-pinta con la frase del bucket elegido
}
function _checkinDismiss() {
  _moodGuardar('dismissed');   // marca el día para no insistir; el saludo usa el banco completo
  closeModal('modal-checkin');
}

// ═══════════════════════════════════════════════════════════════
// 🕘 TABLERO DE CONEXIONES DE HOY — SOLO maestro_roshi. Fails-soft total.
// ═══════════════════════════════════════════════════════════════
// [RES-1] LO QUE PIDE ATENCIÓN — la tira de alertas, arriba de todo
//
// Medido antes de escribirla: el Resumen NO tenía alertas. Vivían en dos
// lugares distintos y ninguno es el Resumen:
//   · `radar_alertas` (22 filas) — la señal del negocio: picos y caídas de
//     tráfico, caída de cotizaciones, hitos de lista de espera. Viva: la
//     última es del 19-ago.
//   · `sistema_alertas` (54 filas) — el equipo: strikes, suspensiones,
//     reportes rechazados, altas. 51 de las 54 son `nuevo_usuario` y la más
//     reciente es del 6-ago.
//
// Memo firmó fundirlas por RECENCIA y mostrar las más recientes estén leídas
// o no: "el Resumen es la computadora de la nave". Una tira que se vacía
// cuando todo va bien no monitorea nada.
//
// Las DOS puertas son `maestro_roshi` a secas (ROLES_MAESTRO y ROLES_RADAR,
// leídos de los endpoints), así que la tira entera lo es. Fails-soft POR
// FUENTE: si una truena, la otra se pinta igual — no un panel en blanco.
// ═══════════════════════════════════════════════════════════════
const _RAH_VISIBLES = 3;    // las que Memo ve sin desplegar
const _RAH_TOPE = 20;       // cuántas se guardan detrás del desplegable

// El color dice la severidad. El Radar la trae en `severidad`; sistema_alertas
// no tiene columna, así que sale del tipo (leído de `tipoInfo` en loadMTAlertas,
// para que la misma alerta no cambie de color según dónde se mire).
const _RAH_SEV_SISTEMA = {
  strike_auto: 'media', strike_manual: 'media', strikes: 'media',
  tour_declinado: 'alta', reporte_rechazado: 'alta', suspension: 'alta',
  usuario_desactivado: 'alta', advertencia: 'media',
  nuevo_usuario: 'info', datos_viajero: 'info',
};
const _RAH_COLOR = { alta: 'var(--red)', media: 'var(--gold)', info: 'var(--ts)' };

// Normaliza las dos formas a UNA. Las columnas se leyeron de la base:
// radar_alertas trae {tipo, severidad, titulo, mensaje, vista, created_at} y
// sistema_alertas solo {tipo, mensaje, leida, created_at, ref} — sin título.
function _rahNormalizar(radar, sistema) {
  const uno = (a, fuente) => {
    // `_tsToDate` existe porque algunos timestamps llegan SIN zona; se usa para
    // no depender de que PostgREST siempre mande el offset.
    const d = _tsToDate(a && a.created_at);
    const sev = fuente === 'radar'
      ? (a.severidad || 'info')
      : (_RAH_SEV_SISTEMA[a.tipo] || 'info');
    return {
      fuente, tipo: a.tipo || '',
      sev,
      titulo: (fuente === 'radar' && a.titulo) ? a.titulo : '',
      texto: a.mensaje || '',
      // ⚠️ Cada tabla nombra distinto lo mismo: `vista` en el Radar, `leida`
      // en sistema. Leerlas con el nombre de la otra daría siempre `undefined`,
      // o sea "todo sin leer", que es una afirmación falsa pintada de urgente.
      leida: fuente === 'radar' ? a.vista === true : a.leida === true,
      ts: d ? d.getTime() : 0,
      iso: d ? d.toISOString() : '',
    };
  };
  return []
    .concat((Array.isArray(radar) ? radar : []).map(a => uno(a, 'radar')))
    .concat((Array.isArray(sistema) ? sistema : []).map(a => uno(a, 'sistema')))
    .filter(a => a.texto || a.titulo)
    .sort((x, y) => y.ts - x.ts)
    .slice(0, _RAH_TOPE);
}

// A dónde lleva cada alerta. Las del Radar reusan `_radarAlertaDestino`, el
// mapa que ya existía desde la tuerca de alertas clickeables — no se escribe
// un segundo mapa que se despeine del primero.
function _rahIr(fuente, tipo) {
  if (fuente === 'radar') { _radarAlertaIr(tipo); return; }
  showPage('maestro');
  const b = document.getElementById('mt-tab-btn-alertas');
  if (b) b.click();
}

function _rahFila(a) {
  const col = _RAH_COLOR[a.sev] || _RAH_COLOR.info;
  const dest = a.fuente === 'radar' ? _radarAlertaDestino(a.tipo) : { mt: true };
  const txt = a.titulo || a.texto;
  const sub = (a.titulo && a.texto && a.texto !== a.titulo) ? a.texto : '';
  return `<button type="button" class="rah-row${a.leida ? '' : ' rah-nueva'}"
      style="--rah-c:${col}" onclick="_rahIr('${_attrJs(a.fuente)}','${_attrJs(a.tipo)}')"
      ${dest ? '' : 'disabled'} title="${dest ? 'Ir a donde se resuelve' : 'Informativa'}">
    <span class="rah-dot" aria-hidden="true"></span>
    <span class="rah-txt">
      <span class="rah-t">${_esfEsc(txt)}</span>
      ${sub ? `<span class="rah-s">${_esfEsc(sub)}</span>` : ''}
    </span>
    <span class="rah-when">${_esfEsc(_khHaceRel(a.iso))}</span>
  </button>`;
}

function _rahRender(lista) {
  const arriba = lista.slice(0, _RAH_VISIBLES);
  const resto = lista.slice(_RAH_VISIBLES);
  const sinLeer = lista.filter(a => !a.leida).length;
  return `<div class="card rah-card">
    <div class="rah-head">
      <span class="rah-h">Lo que pide atención</span>
      <span class="rah-n">${lista.length}${sinLeer ? ` · <b>${sinLeer} sin ver</b>` : ''}</span>
    </div>
    <div class="rah-list">${arriba.map(_rahFila).join('')}</div>
    ${resto.length ? `<details class="rah-mas">
      <summary>ver las ${lista.length}</summary>
      <div class="rah-list">${resto.map(_rahFila).join('')}</div>
    </details>` : ''}
  </div>`;
}

async function _loadAlertasHome() {
  const el = document.getElementById('resumen-alertas');
  if (!el) return;
  if (!currentUser || currentUser.rol !== 'maestro_roshi') { el.style.display = 'none'; return; }
  // Fails-soft POR FUENTE, no en bloque: un `Promise.all` que rechaza dejaría
  // el panel vacío aunque la otra fuente hubiera contestado bien.
  const [radar, sistema] = await Promise.all([
    khRadar.alertasListar().catch(() => []),
    khCoordi.alertasListar().catch(() => []),
  ]);
  const lista = _rahNormalizar(radar, sistema);
  if (!lista.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = _rahRender(lista);
}

// Auxiliares (bulma/milk) con chip de puntualidad vs 09:00 MX (tolerancia 15 min):
//   ≤ 09:15 → verde "✓" · > 09:15 → ámbar · sin conexión hoy → gris.
// Los demás roles: sin juicio de horario (no tienen entrada contractual).
// ═══════════════════════════════════════════════════════════════
const _CONEX_AUX = ['bulma', 'milk'];   // roles con horario contractual de entrada
// [RES-2] Renglones a la vista antes del desplegable. En teléfono son menos:
// medido, con 6 el primer número de dinero caía en y=882 y el pliegue de un
// 390×844 está en 844 — 38px de más. Con 4 entra. Se decide AL PINTAR; girar
// el teléfono no lo recalcula hasta la siguiente carga, y eso es aceptable
// para un tablero que se abre, se mira y se cierra.
function _cnxVisibles() { return (window.innerWidth || 1200) <= 640 ? 4 : 6; }

async function _loadConexiones() {
  const el = document.getElementById('resumen-conexiones');
  if (!el) return;
  if (!currentUser || currentUser.rol !== 'maestro_roshi') { el.style.display = 'none'; return; }
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-conexiones', { method: 'POST', body: JSON.stringify({ accion: 'hoy' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { el.style.display = 'none'; return; }   // fails-soft: sin panel
    el.style.display = '';
    el.innerHTML = _renderConexiones(j);
  } catch (_) { el.style.display = 'none'; }
}

function _conexChip(u, tol) {
  const esAux = _CONEX_AUX.includes(u.rol);
  if (!esAux) return '';   // sin juicio de horario para roles sin entrada contractual
  const chip = (txt, color) => `<span style="display:inline-block;font-size:10px;font-weight:800;padding:2px 8px;border-radius:var(--r-sm,8px);color:${color};border:1px solid ${color}66;white-space:nowrap">${txt}</span>`;
  if (u.primera_min == null) return chip('sin conexión aún', 'var(--ts)');
  const puntual = u.primera_min <= (9 * 60 + (tol || 15));
  return chip(_esfEsc(u.primera) + (puntual ? ' ✓' : ''), puntual ? 'var(--green)' : 'var(--orange)');
}

function _renderConexiones(j) {
  const tol = j.tolerancia_min || 15;
  const us = Array.isArray(j.usuarios) ? j.usuarios : [];
  // Auxiliares primero (las que Memo vigila), luego el resto por nombre.
  const orden = us.slice().sort((a, b) => {
    const aa = _CONEX_AUX.includes(a.rol) ? 0 : 1, bb = _CONEX_AUX.includes(b.rol) ? 0 : 1;
    return aa !== bb ? aa - bb : String(a.nombre).localeCompare(String(b.nombre));
  });
  // [RES-2] Con 14 usuarios activos la tabla medía 571px: media pantalla de
  // alto. Se muestran los primeros — que por el orden de arriba son los AUX,
  // los que Memo vigila — y el resto va detrás del mismo desplegable que usa
  // la tira de alertas.
  const fila = (u) => {
    const idS = _esfEsc(u.id);
    const chip = _conexChip(u, tol);
    return `<tr style="border-top:1px solid var(--border);cursor:pointer" onclick="_conexHistorial('${idS}','${_attrJs(u.nombre)}')" title="Ver últimos 14 días">
      <td style="padding:7px 4px;font-size:13px;color:var(--text);border:none">${_esfEsc(u.nombre)}${_CONEX_AUX.includes(u.rol) ? ' <span style="font-size:9px;color:var(--ts);text-transform:uppercase;letter-spacing:.06em">aux</span>' : ''}</td>
      <td style="padding:7px 4px;text-align:center;font-size:13px;color:var(--text);border:none">${u.primera ? _esfEsc(u.primera) : '<span style="color:var(--ts)">—</span>'}</td>
      <td style="padding:7px 4px;text-align:center;font-size:13px;color:var(--text);border:none">${u.ultima ? _esfEsc(u.ultima) : '<span style="color:var(--ts)">—</span>'}</td>
      <td style="padding:7px 4px;text-align:right;border:none">${chip}</td>
    </tr>`;
  };
  const vis = _cnxVisibles();
  const arriba = orden.slice(0, vis).map(fila).join('');
  const resto = orden.slice(vis);
  const filas = arriba;
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="font-family:'Barlow Condensed','Montserrat',sans-serif;font-weight:800;font-size:16px;text-transform:uppercase;color:var(--text)">🕘 Conexiones de hoy</div>
      <div style="font-size:10px;color:var(--ts)">Hora Monterrey · entrada aux 09:00 (tolerancia ${tol} min) · privado</div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:transparent">
      <thead><tr style="font-size:10px;color:var(--ts);text-transform:uppercase;letter-spacing:.08em">
        <th style="text-align:left;padding:4px;background:transparent;border:none;color:var(--ts)">Usuario</th><th style="padding:4px;background:transparent;border:none;color:var(--ts)">Primera</th><th style="padding:4px;background:transparent;border:none;color:var(--ts)">Última</th><th style="text-align:right;padding:4px;background:transparent;border:none;color:var(--ts)">Puntualidad</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--ts);font-size:12px">Sin conexiones registradas aún</td></tr>'}</tbody>
      ${resto.length ? `<tbody id="cnx-resto" data-vis="${vis}" hidden>${resto.map(fila).join('')}</tbody>` : ''}
    </table>
    ${resto.length ? `<button type="button" class="cnx-mas" aria-expanded="false" aria-controls="cnx-resto"
      onclick="_cnxMas(this)">ver los ${orden.length}</button>` : ''}
  </div>`;
}

// [RES-2] El resto de las conexiones va en un SEGUNDO <tbody>, no en un
// <details>: un <details> no puede envolver <tr> sin romper la tabla, y dos
// tablas apiladas pierden la alineación de columnas. Dos tbody en la misma
// tabla la conservan.
function _cnxMas(btn) {
  const t = document.getElementById('cnx-resto');
  if (!t) return;
  const abrir = t.hidden;
  t.hidden = !abrir;
  btn.setAttribute('aria-expanded', String(abrir));
  btn.textContent = abrir ? 'ver menos' : ('ver los ' + (t.rows.length + (parseInt(t.dataset.vis, 10) || 0)));
}

async function _conexHistorial(uid, nombre) {
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-conexiones', { method: 'POST', body: JSON.stringify({ accion: 'historial', usuario_id: uid }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { showToast('No se pudo cargar el historial', 'error'); return; }
    const tol = j.tolerancia_min || 15;
    const dias = Array.isArray(j.dias) ? j.dias : [];
    const filas = dias.length ? dias.map((d) => {
      const puntual = d.primera_min != null && d.primera_min <= (9 * 60 + tol);
      const dow = new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short' });
      return `<tr style="border-top:1px solid var(--border)">
        <td style="padding:3px 4px;font-size:12px">${_esfEsc(d.fecha)} <span style="color:var(--ts);font-size:10px;text-transform:capitalize">${_esfEsc(dow)}</span></td>
        <td style="padding:3px 4px;text-align:right;font-size:13px;color:${puntual ? 'var(--green)' : 'var(--orange)'};font-weight:700">${_esfEsc(d.primera)}${puntual ? ' ✓' : ''}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="2" style="padding:12px;text-align:center;color:var(--ts);font-size:12px">Sin conexiones en los últimos 14 días</td></tr>';
    const cont = document.getElementById('_conexHistBody');
    const titEl = document.getElementById('_conexHistTitulo');
    if (titEl) titEl.textContent = 'Conexiones · ' + (nombre || '');
    if (cont) cont.innerHTML = `<div style="font-size:10px;color:var(--ts);margin-bottom:8px">Primera conexión por día (hora Monterrey) · últimos 14 días · entrada 09:00 (tol. ${tol} min)</div>
      <table style="width:100%;border-collapse:collapse"><tbody>${filas}</tbody></table>`;
    openModal('modal-conex-hist');
  } catch (e) { showToast(e.message || 'Error', 'error'); }
}

async function loadResumen() {
  _loadAlertasHome();       // [RES-1] lo que pide atención, arriba de todo (solo Memo; fails-soft)
  _renderAtajosHome();      // [E5-5] atajos del home, filtrados por _puedeVerTab
  _loadConexiones();        // 🕘 tablero de conexiones (solo Memo; fails-soft)
  _loadRadarHome();         // [RES-4] el monitoreo del sitio (solo Memo; fails-soft)
  const atrEl  = document.getElementById('atrasados-lista');
  if (atrEl)  atrEl.innerHTML  = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';

  try {
    const { activos, cancelados, capHit } = await _cobCargarTodo(true);  // siempre fresco al entrar

    // [AUD-1c] LAS 5 MÉTRICAS SALEN DE LA FUENTE ÚNICA, no de un reduce propio.
    //
    // Antes se calculaban aquí sobre `activos` —solo el Portal—, así que con
    // melanie decían cobrado $0, facturado $0, 0 viajeros y 0 eventos, y la
    // "utilidad" era facturado(Portal) − gastos(TODOS): los gastos de un mundo
    // restados a las ventas de otro. Un cero es una afirmación, y ésa era falsa.
    //
    // Si la cuenta no llega (fails-soft del endpoint), se cae al cálculo viejo
    // ANTES que dejar la pantalla en blanco — pero se DICE, con su aviso.
    const util = await _utilCargar(true);
    const cta = util && util.cuenta ? util.cuenta.totales : null;
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const { total: totalGastos } = await _cobCargarGastos(true);

    // `porCobrar` lo consume _renderResumenDinero más abajo (la franja del
    // dinero). Al meter el cálculo viejo dentro del `else` lo dejé fuera de
    // alcance y la franja tronaba con "porCobrar is not defined" — un error que
    // la pantalla atrapaba y pintaba en rojo, sin llegar a `pageerror`. Se
    // declara ARRIBA, con el valor de la fuente que toque.
    let utilidad, porCobrar;
    if (cta) {
      setTxt('m-cobrado',   _spFmtMxn(cta.ventas));
      setTxt('m-facturado', _spFmtMxn(cta.facturado));
      setTxt('m-viajeros',  String(cta.viajeros == null ? '—' : cta.viajeros));
      setTxt('m-eventos',   String(cta.eventos_con_movimiento));
      // El signo, dicho con palabras (patrón CAP-FIX-2d): un "Por cobrar −$793"
      // se lee al revés de lo que significa.
      const pend = Number(cta.pendiente || 0);
      porCobrar = pend;
      setTxt('m-porcobrar', _spFmtMxn(Math.abs(pend)));
      const lblPc = document.getElementById('m-porcobrar-lbl');
      if (lblPc) lblPc.textContent = pend < 0 ? 'A favor' : 'Por cobrar';
      // [UTIL-C-3] Los gastos que se pintan son los de TODA la empresa: los de
      // los eventos más los generales. Antes decían solo los de eventos, y la
      // tabla de abajo sumaba los generales — dos cifras de "gastos" en la
      // misma pantalla.
      setTxt('m-gastos', _spFmtMxn(Number(cta.gastos || 0) + Number(cta.gastos_sin_evento || 0)));
      // [UTIL-C-3] Y la utilidad es `ganancia_empresa`, LEÍDA del servidor:
      // Σ utilidades por evento − gastos sin evento. Antes esta línea pintaba
      // `cta.ganancia` (solo eventos) mientras la tabla de abajo restaba los
      // generales por su cuenta. Con cero gastos generales daban igual; con el
      // primero se habrían separado en silencio.
      utilidad = (cta.ganancia_empresa === undefined) ? Number(cta.ganancia || 0) : cta.ganancia_empresa;
    } else {
      // Cálculo viejo, Portal-puro, y se avisa de que lo es.
      const cobrado   = activos.reduce((a, t) => a + Number((t.pago || {}).abonado  || 0), 0);
      porCobrar       = activos.reduce((a, t) => a + Number((t.pago || {}).restante || 0), 0);
      const facturado = activos.reduce((a, t) => a + Number((t.pago || {}).total    || 0), 0);
      setTxt('m-cobrado',   _spFmtMxn(cobrado));
      setTxt('m-porcobrar', _spFmtMxn(porCobrar));
      setTxt('m-facturado', _spFmtMxn(facturado));
      setTxt('m-viajeros',  String(activos.length));
      setTxt('m-eventos',   String(new Set(activos.map(t => t.evento_id)).size));
      setTxt('m-gastos', _spFmtMxn(totalGastos));
      // [UTIL-C-2] AQUÍ HABÍA UNA FÓRMULA PROPIA: `facturado − totalGastos`.
      // Era el "cálculo viejo, Portal-puro" del que la pantalla avisaba, y bajo
      // la fórmula A se parecía bastante al número bueno. Bajo C ya no se
      // parece a nada: le falta la inversión en boletos (que vive en KH, no en
      // el Portal) y encima arranca de lo VENDIDO en vez de lo cobrado. Con
      // `calle24` habría pintado +$46,700 donde la verdad es −$28,720.
      //
      // Una pantalla que no puede saber la utilidad tiene que DECIR que no la
      // sabe. `null` viaja hasta `_audUtilidadPintar`, que ya sabe pintar el
      // desconocido — un cero, o peor, un número plausible, es una afirmación.
      utilidad = null;
    }
    _audUtilidadPintar(utilidad, cta, util);

    const aviso = document.getElementById('resumen-cap-aviso');
    if (aviso) {
      if (capHit) {
        aviso.textContent = 'Mostrando los primeros 300 tours activos — los totales podrían estar incompletos. (Pendiente: paginación cuando se superen 300.)';
        aviso.style.display = '';
      } else {
        aviso.style.display = 'none';
      }
    }

    const ev = await _fetchEVFromIndex();
    // 1) Primero lo que NO depende de la utilidad, para que aparezca rápido:
    //    Franja 3 (atrasados) + Franja 1 (dinero — prioridad #1, no debe esperar).
    _renderResumenAtrasados(activos, cancelados);
    _renderResumenRiesgoBaja(activos);
    _renderResumenDinero(porCobrar);  // reusa el porCobrar ya calculado (= m-porcobrar)
    // [E5-2] La deuda va con la cuenta que ya se cargó arriba (`cta` viene de
    // _utilCargar). No dispara una llamada nueva: se pinta con lo que ya llegó.
    _renderResumenDeuda(util && util.cuenta ? util.cuenta : null);
    // 2) Carga la utilidad UNA sola vez (compartida, fresca). Best-effort: si falla,
    //    _utilG3Cache queda null → salud neutra y lo de abajo igual pinta.
    await _utilCargar(true);
    // 3) Ya con la cache lista: la tabla de ganancia por evento.
    _renderResumenUtilidad(ev);
  } catch (e) {
    if (atrEl)  atrEl.innerHTML  = '';
  }
}

// ── Franja 1 del dashboard: el dinero (caja total + cuentas + por cobrar) ────
// Reusa admin-saldos (misma fuente que la página Saldos). Best-effort: si falla,
// la franja muestra un aviso y el resto del Resumen sigue (mirror de _utilCargar).
let _resumenSaldosCache = null;  // respuesta de admin-saldos | null

async function _saldosCargar(force) {
  if (_resumenSaldosCache && !force) return _resumenSaldosCache;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-saldos', {
      method: 'POST', headers: _spAdminHeaders(), body: JSON.stringify({}),
    });
    const d = await r.json();
    if (!r.ok || d.ok === false) throw new Error(d.error || 'No se pudieron cargar los saldos');
    _resumenSaldosCache = d;
    return _resumenSaldosCache;
  } catch (e) {
    return null;
  }
}

// Pinta la franja: caja total (héroe, full-width) + fila de cuentas + por cobrar
// (+ otros si != 0). `porCobrar` viene de loadResumen (mismo valor que m-porcobrar).
// [E5-2] ¿CUÁNTO DEBO? — la segunda pregunta de la mañana.
//
// LA DEUDA VA AL LADO, JAMÁS RESTANDO. Es dinero comprometido con los
// proveedores de boletos (compras + servicios − abonos, mundo KH), y la
// ganancia se calcula con gastos, no con deuda: restarla convertiría "lo que
// debo" en "lo que gané de menos", que es otra cosa y es falsa. El texto del
// bloque lo dice en voz alta para que nadie lo "corrija" después.
//
// El total lo hace el SERVIDOR (`totales.deuda_proveedores`): aquí no se suma
// nada. Si un día hay un evento más, esta función no se entera — y así debe ser.
//
// QUIÉN LO VE: los mismos roles que el endpoint deja pasar
// (`admin-utilidad-evento` → ['maestro_roshi','bulma'], leído de ahí). A milk el
// bloque NI SE LE OFRECE: no se pinta el hueco ni un aviso de permiso, porque
// anunciar un dato que no va a llegar es peor que no anunciarlo.
const RESUMEN_DEUDA_ROLES = ['maestro_roshi', 'bulma'];
function _renderResumenDeuda(cuenta) {
  const cont = document.getElementById('resumen-deuda');
  if (!cont) return;
  const puede = !!(currentUser && RESUMEN_DEUDA_ROLES.includes(currentUser.rol));
  const tot = (cuenta && cuenta.totales) || null;
  if (!puede || !tot || tot.deuda_proveedores == null) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
  const deuda = Number(tot.deuda_proveedores) || 0;
  cont.style.display = '';
  // [RES-3] Mismo tamaño que sus dos hermanas, y el TEXTO SELLADO se queda:
  // es la frase que impide que alguien "corrija" la ganancia restándole la
  // deuda, que es otra cosa y es falsa.
  cont.className = 'res-big dash-click';
  cont.setAttribute('onclick', "showPage('kamisama')");
  cont.setAttribute('title', 'Ver el stock y las compras');
  cont.innerHTML = `
    <div class="metric-label">Deuda de boletos</div>
    <div class="res-big-val" style="color:var(--orange)">${_spFmtMxn(deuda)}</div>
    <div class="metric-sub">Compras + servicios − abonos · <b>no se resta</b> de la ganancia</div>`;
}

// [RES-3] Esta función pinta AHORA EN DOS SITIOS con UNA sola lectura: el
// número grande de la caja va arriba, con los otros dos de Memo, y el desglose
// por cuenta se queda abajo, en "el resto". No se pide `_saldosCargar` dos
// veces ni se recalcula nada: es el mismo `d`, repartido.
async function _renderResumenDinero(porCobrar) {
  const cont = document.getElementById('resumen-dinero');
  const heroEl = document.getElementById('resumen-caja');
  if (!cont) return;
  const d = await _saldosCargar(true);  // fresco al entrar al Resumen
  if (!d) {
    if (heroEl) { heroEl.style.display = 'none'; heroEl.innerHTML = ''; }
    cont.style.display = '';
    cont.innerHTML = '<div style="font-size:12px;color:var(--ts);padding:10px 0">No se pudo cargar el dinero (saldos).</div>';
    return;
  }
  const cuentas = d.cuentas || {};
  const orden = ['BBVA', 'Banamex', 'Efectivo'];
  const otros = Number(d.otros_total || 0);
  // [E5-1] La caja total la DICE la fuente (`admin-saldos.caja_total`). Aquí
  // vivía un `reduce` sobre las tres cuentas + otros: una fórmula de dinero
  // naciendo en la pantalla, que es como empezaron las once de AUD-1. El día
  // que el servidor reconozca una cuarta cuenta, esta línea no se entera —
  // ahora sí, porque no cuenta nada: imprime lo que le mandan.
  const cajaTotal = Number(d.caja_total || 0);

  // stat de cuenta → navega a Saldos (click-through).
  const stat = (lbl, val) => {
    const color = Number(val) < 0 ? 'var(--red)' : '';
    return `<div class="cob-stat dash-click" onclick="showPage('saldos','Saldos')" title="Ver Saldos"><div class="cob-stat-lbl">${lbl}</div><div class="cob-stat-val" style="${color ? 'color:' + color : ''}">${_spFmtMxn(Number(val || 0))}</div></div>`;
  };
  const cuentasHTML = orden.map(n => stat(n, (cuentas[n] || {}).saldo || 0)).join('') +
    // [AUD-1c] El signo, en palabras también aquí: con el neto de los dos mundos
    // este número puede salir negativo, y "Por cobrar −$793" se lee al revés.
    `<div class="cob-stat dash-click" onclick="showPage('pagos')" title="Ver cobranza"><div class="cob-stat-lbl">${Number(porCobrar || 0) < 0 ? 'A favor' : 'Por cobrar'}</div><div class="cob-stat-val" style="color:var(--orange)">${_spFmtMxn(Math.abs(Number(porCobrar || 0)))}</div></div>` +
    (otros !== 0 ? stat('Otros (sin cuenta)', otros) : '');

  const heroColor = cajaTotal < 0 ? 'var(--red)' : 'var(--green)';
  if (heroEl) {
    heroEl.style.display = '';
    heroEl.className = 'res-big dash-click';
    heroEl.setAttribute('onclick', "showPage('saldos','Saldos')");
    heroEl.setAttribute('title', 'Ver Saldos');
    heroEl.innerHTML = `
      <div class="metric-label">Caja total de la empresa</div>
      <div class="res-big-val" style="color:${heroColor}">${_spFmtMxn(cajaTotal)}</div>
      <div class="metric-sub">Lo que hay hoy, sumando cuentas</div>`;
  }
  cont.style.display = '';
  cont.innerHTML = `<div class="cob-stats" style="margin-bottom:0">${cuentasHTML}</div>`;
}

// ── Franja 2 del dashboard: tabla "Utilidad por evento" (web) ────────────────
// Reusa _utilCargar (#143) + el mapa de nombres/fechas de _fetchEVFromIndex.
// Best-effort: si la utilidad no carga, la card muestra un aviso y el resto del
// Resumen queda intacto. Agrupa por BASE (el backend ya suma multifecha en base).
let _resumenUtilRows = [];                       // filas de eventos (con datos)
let _resumenUtilConCuenta = false;               // [AUD-1d] ¿las filas salen de la cuenta de los dos mundos?
let _resumenUtilDeudaTotal = null;   // [E5-3] lo manda el servidor; la pantalla no lo suma
let _resumenUtilSin = null;                      // bloque sin_evento
let _resumenUtilGananciaEmpresa = null;          // [UTIL-C-3] Σ eventos − generales, del servidor
let _resumenUtilSort = { col: 'ds', dir: 'asc' }; // orden por defecto: fecha asc

async function _renderResumenUtilidad(ev) {
  const cont = document.getElementById('resumen-utilidad-tabla');
  if (!cont) return;
  const util = await _utilCargar();  // usa la cache que loadResumen ya cargó (sin doble fetch)
  if (!util) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--ts)">No se pudo cargar la utilidad por evento.</div>';
    return;
  }
  // baseSlug (e.id) -> { nombre, fecha, ds } desde EV (patrón _gastosEVMap).
  const evMap = {};
  // [MER-1] `pasado` se resuelve con el EVENTO ENTERO, no con `r.ds`: la fila
  // solo guarda la primera fecha, y en un multifecha ésa miente (ver
  // _mermaUltimaFecha). Se decide aquí, donde todavía se tiene el objeto.
  (ev || []).forEach(e => { if (e && e.id) evMap[e.id] = { nombre: e.a || e.id, fecha: e.f || '', ds: e.ds || '', pasado: _mermaPasado(e) }; });
  const evs = util.eventos || {};
  // [AUD-1d] LAS FILAS SALEN DE LA CUENTA VERDADERA, no de la caja.
  //
  // Esta tabla leía `util.eventos`, que es la caja Portal-pura: con melanie
  // decía cobrado $0 y caja −$147,172, y por eso llevaba un letrero avisando de
  // lo que omitía. Ya no omite, así que el letrero también se va.
  //
  // Si la cuenta no llegó (fails-soft del endpoint), se cae a la caja de antes
  // ANTES que dejar la tabla vacía — pero las columnas lo dicen.
  const cta = util.cuenta && util.cuenta.eventos ? util.cuenta.eventos : null;
  const fuente = cta || evs;
  _resumenUtilConCuenta = !!cta;
  // [E5-3] El total de deuda lo DICE la fuente (`totales.deuda_proveedores`,
  // que agregó E5-2). No se acumula aquí: la fila Total suma las demás columnas
  // porque esa aritmética de presentación ya existía, pero una suma de dinero
  // NUEVA en pantalla es justo lo que esta etapa vino a no hacer.
  _resumenUtilDeudaTotal = (util.cuenta && util.cuenta.totales && util.cuenta.totales.deuda_proveedores != null)
    ? Number(util.cuenta.totales.deuda_proveedores) : null;
  _resumenUtilRows = Object.keys(fuente).map(slug => {
    const d = fuente[slug] || {};
    const meta = evMap[slug];
    const m = meta || { nombre: slug, fecha: '', ds: '', pasado: false };
    const ventas = Number((cta ? d.ventas : d.cobrado) || 0);
    const facturado = Number((cta ? d.facturado : d.vendido) || 0);
    const gastos = Number(d.gastos || 0);
    const ganancia = cta ? Number(d.ganancia || 0) : (Number(d.caja || 0));
    const bod = (cta && d.bodega) ? d.bodega : null;
    return {
      slug, nombre: m.nombre, fecha: m.fecha, ds: m.ds || '',
      desconocido: !meta,                     // typo de captura: slug que no existe en el EV
      ventas, facturado, gastos, ganancia,
      // [E5-3] La deuda a proveedores de ESE evento, tal como la manda la lib.
      // Va como una columna más, ROTULADA APARTE: no entra en `ganancia` ni se
      // resta de nada. La caja vieja (`evs`) no la conoce, y ahí sale null —
      // que se pinta como "—", no como cero: un cero diría "no debe nada".
      deuda: cta ? Number(d.deuda_proveedores || 0) : null,
      // [UTIL-C-4] Lo vendido que falta por cobrar, LEÍDO de la lib (`pendiente`)
      // y no restado aquí de dos columnas: la pantalla no saca sus propias
      // cuentas. La caja vieja no lo conoce y ahí va null — que no es cero.
      por_cobrar: cta ? (d.pendiente == null ? null : Number(d.pendiente)) : null,
      bodega_boletos: bod ? bod.boletos : null,
      bodega_valor: bod ? bod.valor_estimado : null,
      // [MER-1] `pasado` sale del catálogo (evMap) y NO del servidor: es el mismo
      // reloj que clasificó la lista que se le mandó, así que las dos puntas
      // coinciden por construcción. Un evento que el catálogo no conoce
      // (`desconocido`) NO se declara pasado: sin fecha no hay afirmación.
      pasado: !!m.pasado,
      merma_boletos: bod ? bod.boletos : null,
      merma_costo: bod ? bod.costo_hundido : null,
      pct: facturado > 0 ? (ventas / facturado) : 0,
    };
  });
  // [AUD-1d] Con la cuenta nueva, "sin evento" son solo los gastos General.
  _resumenUtilSin = cta
    ? ((util.cuenta.sin_evento && Number(util.cuenta.sin_evento.gastos)) ? { gastos: Number(util.cuenta.sin_evento.gastos) } : null)
    : (util.sin_evento || null);
  // [UTIL-C-3] La utilidad de la empresa, del servidor. Sin la cuenta nueva
  // (camino viejo) se queda en null y la tabla usa su respaldo local.
  const _tt = cta && util.cuenta ? util.cuenta.totales : null;
  _resumenUtilGananciaEmpresa = (_tt && _tt.ganancia_empresa != null) ? Number(_tt.ganancia_empresa) : null;
  _resumenUtilPintar();
}

// [AUD-1d] Semáforo de salud, sobre la GANANCIA (no la caja):
//   verde  = ya ganas
//   ámbar  = todavía no, pero la bodega alcanza para darle la vuelta
//   rojo   = ni vendiendo todo lo que queda
// Sin bodega conocida no se puede afirmar el ámbar: una ganancia negativa sin
// saber qué queda por vender es roja hasta que se demuestre lo contrario.
//
// [MER-1] Y en un evento YA PASADO el ámbar deja de existir: el ámbar dice "la
// bodega alcanza para darle la vuelta", y en un concierto que ya ocurrió no hay
// bodega que dé vuelta a nada. Ganancia negativa + evento pasado = ROJO, sin
// consultar la bodega. Positivo sigue verde, pasado o no: ganar ya se ganó.
// [UTIL-C-4] EL ÁMBAR SE MIDE COMO EL PANEL DE ESCENARIOS, no de otra forma.
//
// Le faltaba un término entero: **lo que ya está vendido y no se ha cobrado**.
// Preguntaba "¿alcanza con vender lo que queda?" e ignoraba los contratos
// firmados sin pagar, así que pintaba ROJO eventos que solo tenían que cobrar.
// Con calle24: −$28,720 + $0 de bodega = rojo… teniendo $23,100 contratados por
// cobrar y apenas $5,620 de faltante real.
//
// Ahora usa las MISMAS dos palancas que los escenarios (b) y (c) de Kamisama
// —cobrar lo vendido y vender lo que queda— para que las dos pantallas no
// puedan decir cosas distintas del mismo evento.
//
// La bodega sigue apareciendo aquí y NO contradice a "la bodega es
// información": esto es una PROYECCIÓN rotulada ("todavía puede"), no una cifra
// que compense a la utilidad. Lo que se retiró en esta misma tuerca fue sumarla
// A LA UTILIDAD; usarla para decir si el rojo tiene salida es su papel.
function _resumenUtilSemaforo(ganancia, bodegaValor, pasado, porCobrar) {
  if (Number(ganancia) >= 0) return 'var(--green)';
  const pc = Number(porCobrar) || 0;
  // Un evento pasado ya no vende, pero SÍ puede cobrar: los contratos no se
  // vencen porque el concierto haya ocurrido.
  if (Number(ganancia) + pc >= 0) return 'var(--gold)';
  if (pasado) return 'var(--red)';
  const b = Number(bodegaValor);
  if (Number.isFinite(b) && (Number(ganancia) + pc + b) >= 0) return 'var(--gold)';
  return 'var(--red)';
}
// El texto del semáforo, junto a su color para que no puedan divergir.
function _resumenUtilSemaforoTitulo(r) {
  if (Number(r.ganancia) >= 0) return 'Ya gana';
  const pc = Number(r.por_cobrar) || 0;
  if (Number(r.ganancia) + pc >= 0) return 'Todavía no, pero con cobrar lo que ya vendiste alcanza';
  if (r.pasado) return 'El evento ya pasó y ni cobrando todo alcanza: no queda nada por vender';
  return (Number.isFinite(Number(r.bodega_valor)) && r.ganancia + pc + Number(r.bodega_valor) >= 0)
    ? 'Todavía no: hay que cobrar lo vendido Y vender parte de lo que queda'
    : 'Ni cobrando todo y vendiendo lo que queda';
}
function _resumenUtilMxnCell(v, align) {
  const col = (Number(v) < 0) ? 'var(--red)' : '';
  return `<td style="text-align:${align || 'right'};font-variant-numeric:tabular-nums;${col ? 'color:' + col : ''}">${_spFmtMxn(Number(v || 0))}</td>`;
}
// Monto para TARJETAS (móvil): span con rojo si negativo (el _resumenUtilMxnCell devuelve <td>).
function _resumenUtilMxn(v) {
  const n = Number(v || 0);
  return `<span style="${n < 0 ? 'color:var(--red)' : ''}">${_spFmtMxn(n)}</span>`;
}

function _resumenUtilPintar() {
  const cont = document.getElementById('resumen-utilidad-tabla');
  if (!cont) return;
  const rows = _resumenUtilRows.slice();
  if (!rows.length && !_resumenUtilSin) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--ts)">Sin datos de utilidad por evento todavía.</div>';
    return;
  }

  // [AUD-1d] GANANCIA acumulada: running-sum de ganancia en orden CRONOLÓGICO,
  // SOLO sobre filas con fecha (ds). Los desconocidos / sin fecha NO entran al
  // acumulado → su celda va "—". (Antes acumulaba caja, y el encabezado se
  // quedó diciendo "Caja acum." cuando la suma ya era otra: lo cazó el arnés.)
  const acum = {};
  let run = 0;
  rows.filter(r => r.ds).sort((a, b) => String(a.ds).localeCompare(String(b.ds))).forEach(r => { run += r.ganancia; acum[r.slug] = run; });

  // Orden de 2 niveles: primario los DESCONOCIDOS siempre al final; secundario la
  // columna elegida (la columna 'fecha' ordena por ds).
  const s = _resumenUtilSort;
  const key = (r) => (s.col === 'fecha') ? r.ds : r[s.col];
  rows.sort((a, b) => {
    const da = a.desconocido ? 1 : 0, db = b.desconocido ? 1 : 0;
    if (da !== db) return da - db;            // conocidos primero, desconocidos al final
    const ka = key(a), kb = key(b);
    let c;
    if (typeof ka === 'number' && typeof kb === 'number') c = ka - kb;
    else c = String(ka).localeCompare(String(kb));
    return s.dir === 'asc' ? c : -c;
  });

  // [AUD-1d] Las columnas de la CUENTA, no las de la caja. Memo no usa el CSV
  // (lo confirmó), así que no hay compatibilidad que cuidar y las columnas
  // dicen lo que de verdad importa.
  const COLS = [
    { k: 'nombre', lbl: 'Evento', num: false },
    { k: 'fecha',  lbl: 'Fecha',  num: false },
    { k: 'facturado', lbl: 'Facturado', num: true },
    { k: 'ventas', lbl: 'Ventas', num: true },
    { k: 'gastos', lbl: 'Gastos', num: true },
    { k: 'ganancia', lbl: 'Ganancia', num: true },
    { k: 'bodega_valor', lbl: 'Bodega', num: true },
    // [E5-3] La deuda, en su propia columna. Al lado de la ganancia, jamás
    // dentro: es dinero comprometido con los proveedores, no una merma de lo
    // ganado. Ver la nota de _renderResumenDeuda.
    { k: 'deuda', lbl: 'Deuda prov.', num: true },
    { k: 'pct', lbl: '% cob', num: true },
  ];
  const arrow = (k) => (s.col === k || (k === 'fecha' && s.col === 'fecha')) ? (s.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const thStyle = 'padding:7px 8px;border-bottom:1px solid var(--border);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ts);white-space:nowrap;cursor:pointer';
  const head = COLS.map(c =>
    `<th style="${thStyle};text-align:${c.num ? 'right' : 'left'}" onclick="_resumenUtilSortBy('${c.k}')">${c.lbl}${arrow(c.k)}</th>`
  ).join('') +
    `<th style="${thStyle};text-align:center;cursor:default">Salud</th>` +
    `<th style="${thStyle};text-align:right;cursor:default">Ganancia acum.</th>`;

  const acumCell = (r) => (r.slug in acum)
    ? _resumenUtilMxnCell(acum[r.slug])
    : '<td style="text-align:right;color:var(--ts)">—</td>';
  const marcaDesc = '<span style="color:var(--orange);font-size:10px;font-weight:700;white-space:nowrap"> <svg class="ic"><use href="#ic-alerta"/></svg> evento desconocido</span>';

  // La bodega: boletos ≈ valor. Sin valor conocido NO se pinta un cero.
  // [MER-1] En un evento pasado la misma celda cambia de cara: deja de decir lo
  // que se puede cobrar y dice lo que se perdió, en COSTO y rotulado "merma".
  const bodCell = (r) => {
    if (r.pasado) {
      if (r.merma_costo == null) {
        return `<td style="text-align:right;color:var(--ts)" title="${r.merma_boletos == null ? 'No se pudo leer el inventario' : 'Sin costo capturado en las compras'}">${r.merma_boletos == null ? '—' : 'merma ' + r.merma_boletos + ' bol.'}</td>`;
      }
      // La palabra "merma" va IMPRESA, no solo en el `title`: una columna que
      // cambia de significado por renglón tiene que decirlo donde se ve. El
      // título de la columna sigue siendo "Bodega" porque para la mayoría de los
      // renglones eso es lo que es.
      return `<td class="mer1-merma" style="text-align:right;font-variant-numeric:tabular-nums" title="Merma: ${r.merma_boletos} boleto${r.merma_boletos === 1 ? '' : 's'} sin vender · el costo ya se pagó">merma ${_spFmtMxn(r.merma_costo)}</td>`;
    }
    if (r.bodega_valor == null) {
      return `<td style="text-align:right;color:var(--ts)" title="${r.bodega_boletos == null ? 'No se pudo leer el inventario' : 'Sin precio en el catálogo'}">${r.bodega_boletos == null ? '—' : r.bodega_boletos + ' bol.'}</td>`;
    }
    return `<td style="text-align:right;font-variant-numeric:tabular-nums" title="${r.bodega_boletos} boletos por vender, a precio de hoy (estimado)">${_spFmtMxn(r.bodega_valor)}</td>`;
  };
  const fila = (r) => {
    const sem = _resumenUtilSemaforo(r.ganancia, r.bodega_valor, r.pasado, r.por_cobrar);
    const semTitle = _resumenUtilSemaforoTitulo(r);
    // Desconocido: NO clickable (no hay a dónde ir); conocidos siguen → Por evento.
    const rowAttrs = r.desconocido ? '' : ` class="dash-click" onclick="_evtIrA('${r.slug}')" title="Ver en Por evento"`;
    return `<tr${rowAttrs} style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px;font-weight:600;white-space:nowrap">${_spEscape(r.nombre)}${r.desconocido ? marcaDesc : ''}</td>
      <td style="padding:6px 8px;font-size:11px;color:var(--ts);white-space:nowrap">${_spEscape(r.fecha || '—')}</td>
      ${_resumenUtilMxnCell(r.facturado)}${_resumenUtilMxnCell(r.ventas)}${_resumenUtilMxnCell(r.gastos)}${_resumenUtilMxnCell(r.ganancia)}${bodCell(r)}
      ${r.deuda == null
        ? '<td style="text-align:right;color:var(--ts)" title="La caja Portal-pura no conoce la deuda">—</td>'
        : `<td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--orange)" title="Compras + servicios − abonos. No se resta de la ganancia.">${_spFmtMxn(r.deuda)}</td>`}
      <td style="text-align:right;font-variant-numeric:tabular-nums">${Math.round(r.pct * 100)}%</td>
      <td style="text-align:center"><span title="${semTitle}" style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${sem}"></span></td>
      ${acumCell(r)}
    </tr>`;
  };

  // Fila "Sin evento" (dinero real sin evento_id), separada antes de totales.
  let sinFila = '';
  let totVentas = 0, totFact = 0, totGas = 0, totGan = 0, totBod = 0, totBodOk = false;
  // [MER-1] Los dos montones se totalizan APARTE. Sumarlos daría un número que
  // no significa nada: la mitad se puede cobrar y la otra mitad ya se perdió.
  let totMerma = 0, totMermaOk = false;
  rows.forEach(r => {
    totFact += r.facturado; totVentas += r.ventas; totGas += r.gastos; totGan += r.ganancia;
    if (r.pasado) { if (r.merma_costo != null) { totMerma += Number(r.merma_costo); totMermaOk = true; } return; }
    if (r.bodega_valor != null) { totBod += Number(r.bodega_valor); totBodOk = true; }
  });
  // Sin merma, la celda es la de siempre — la misma llamada, no una copia: en un
  // universo sin eventos pasados esta tabla queda byte a byte como estaba.
  const totBodCell = totMermaOk
    ? `<td style="text-align:right;font-variant-numeric:tabular-nums">${totBodOk ? _spFmtMxn(totBod) : '<span style="color:var(--ts)">—</span>'}<div class="mer1-merma" style="font-weight:400;font-size:10px">merma ${_spFmtMxn(totMerma)}</div></td>`
    : (totBodOk ? _resumenUtilMxnCell(totBod) : '<td style="text-align:right;color:var(--ts)">—</td>');
  if (_resumenUtilSin) {
    // Sin evento: hoy solo GASTOS. No se le inventan ventas ni bodega — sus
    // celdas van vacías, no en cero.
    // [UTIL-C-3] La resta ya NO se hace aquí. `totGan` se toma del servidor
    // (`ganancia_empresa`) unas líneas abajo: esta línea era la fórmula número
    // doce, y encima la única de la pantalla que la hacía.
    const sinG = Number(_resumenUtilSin.gastos || 0);
    totGas += sinG;
    sinFila = `<tr style="border-bottom:1px solid var(--border);opacity:.85">
      <td style="padding:6px 8px;font-style:italic;color:var(--ts)">Sin evento</td>
      <td style="padding:6px 8px"></td>
      <td></td><td></td>
      ${_resumenUtilMxnCell(sinG)}
      ${_resumenUtilMxnCell(-sinG)}
      <td></td><td></td><td></td><td></td>
    </tr>`;
  }
  // [UTIL-C-3] El total de utilidad viene del servidor. La suma local se
  // conserva como RESPALDO —si el servidor no la mandó, la pantalla sigue
  // dando un número— y se CAREA: si las dos difieren, es que alguien volvió a
  // sacar su propia cuenta y hay que enterarse, no promediarlas.
  if (_resumenUtilGananciaEmpresa != null) {
    const local = totGan - (_resumenUtilSin ? Number(_resumenUtilSin.gastos || 0) : 0);
    if (Math.abs(local - _resumenUtilGananciaEmpresa) > 0.5) {
      console.warn('[UTIL-C-3] la utilidad local y la del servidor NO coinciden:', local, 'vs', _resumenUtilGananciaEmpresa);
    }
    totGan = _resumenUtilGananciaEmpresa;
  } else if (_resumenUtilSin) {
    totGan -= Number(_resumenUtilSin.gastos || 0);
  }
  const totPct = totFact > 0 ? Math.round(totVentas / totFact * 100) : 0;
  const totFila = `<tr style="border-top:2px solid var(--border);font-weight:800">
    <td style="padding:8px;text-transform:uppercase;font-size:11px;letter-spacing:.06em">Total</td>
    <td></td>
    ${_resumenUtilMxnCell(totFact)}${_resumenUtilMxnCell(totVentas)}${_resumenUtilMxnCell(totGas)}${_resumenUtilMxnCell(totGan)}
    ${totBodCell}
    ${_resumenUtilDeudaTotal == null
      ? '<td style="text-align:right;color:var(--ts)">—</td>'
      : `<td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--orange)" title="Deuda total a proveedores, según el servidor">${_spFmtMxn(_resumenUtilDeudaTotal)}</td>`}
    <td style="text-align:right">${totPct}%</td>
    <td></td><td></td>
  </tr>`;

  // Tabla (web ≥640px): HTML idéntico al de #144, solo envuelto en .util-table-view abajo.
  const tableHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:880px">
    <thead><tr>${head}</tr></thead>
    <tbody>${rows.map(fila).join('')}${sinFila}${totFila}</tbody>
  </table>`;

  // ── Vista de TARJETAS (móvil <640px) — MISMA data (rows/acum/totales), otra presentación ──
  const mny = _resumenUtilMxn;
  // [MER-1] La misma casilla de la tarjeta, con la misma regla que la celda de la
  // tabla: en evento pasado se rotula "Merma" y lleva el costo, no el precio.
  const bodCard = (r) => {
    if (r.pasado) {
      return `<div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">Merma</div><div class="mer1-merma" style="font-size:16px;font-weight:700">${r.merma_costo == null ? (r.merma_boletos == null ? '—' : r.merma_boletos + ' bol.') : _spFmtMxn(r.merma_costo)}</div></div>`;
    }
    return `<div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">Bodega</div><div style="font-size:16px;font-weight:700;color:var(--gold)">${r.bodega_valor == null ? (r.bodega_boletos == null ? '—' : r.bodega_boletos + ' bol.') : _spFmtMxn(r.bodega_valor)}</div></div>`;
  };
  const card = (r) => {
    const sem = _resumenUtilSemaforo(r.ganancia, r.bodega_valor, r.pasado, r.por_cobrar);
    const cardAttrs = r.desconocido ? '' : ` class="dash-click" onclick="_evtIrA('${r.slug}')" title="Ver en Por evento"`;
    return `<div${cardAttrs} style="background:var(--bg2);border:1px solid var(--border);border-left:4px solid ${sem};border-radius:var(--radius);padding:12px 14px;margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px">
        <div><div style="font-weight:700;font-size:14px">${_spEscape(r.nombre)}${r.desconocido ? marcaDesc : ''}</div><div style="font-size:11px;color:var(--ts)">${_spEscape(r.fecha || '—')}</div></div>
        <span style="display:inline-block;width:13px;height:13px;border-radius:50%;background:${sem};flex-shrink:0;margin-top:3px"></span>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">${r.ganancia < 0 ? 'Falta recuperar' : 'Ganancia'}</div><div style="font-family:'Zen Dots',sans-serif;font-size:19px;color:${r.ganancia < 0 ? 'var(--red)' : 'var(--green)'}">${_spFmtMxn(Math.abs(r.ganancia))}</div></div>
        <div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">Ventas</div><div style="font-size:16px;font-weight:700">${_spFmtMxn(r.ventas)}</div></div>
        ${r.deuda == null ? '' : `<div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">Deuda prov.</div><div style="font-weight:700;color:var(--orange)">${_spFmtMxn(r.deuda)}</div></div>`}
        ${bodCard(r)}
      </div>
      <div style="display:flex;gap:6px 14px;flex-wrap:wrap;font-size:11px;color:var(--ts);border-top:1px solid var(--border);padding-top:8px">
        <span>Facturado ${mny(r.facturado)}</span><span>Gastos ${mny(r.gastos)}</span><span>% cob ${Math.round(r.pct * 100)}%</span><span>Ganancia acum ${(r.slug in acum) ? mny(acum[r.slug]) : '—'}</span>
      </div>
    </div>`;
  };
  // Tarjeta especial (Sin evento / Total): sin borde-semáforo, estilo distinto.
  const cardEsp = (titulo, dashed, gan, ventas, fact, gas, bod, merma) => {
    const pct = fact > 0 ? Math.round(ventas / fact * 100) : 0;
    return `<div style="background:var(--bg2);border:${dashed ? '1px dashed' : '2px solid'} var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px">
      <div style="text-transform:uppercase;font-size:11px;letter-spacing:.06em;font-weight:800;color:var(--ts);margin-bottom:10px">${_esfEsc(titulo)}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;color:var(--ts)">${gan < 0 ? 'Falta recuperar' : 'Ganancia'}</div><div style="font-family:'Zen Dots',sans-serif;font-size:18px;color:${gan < 0 ? 'var(--red)' : 'var(--green)'}">${_spFmtMxn(Math.abs(gan))}</div></div>
        <div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;color:var(--ts)">Ventas</div><div style="font-size:15px;font-weight:700">${_spFmtMxn(ventas)}</div></div>
        <div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;color:var(--ts)">Bodega</div><div style="font-size:15px;font-weight:700;color:var(--gold)">${bod == null ? '—' : _spFmtMxn(bod)}</div>${merma == null ? '' : `<div class="mer1-merma" style="font-size:11px;font-weight:700">merma ${_spFmtMxn(merma)}</div>`}</div>
      </div>
      <div style="display:flex;gap:6px 14px;flex-wrap:wrap;font-size:11px;color:var(--ts);border-top:1px solid var(--border);padding-top:8px">
        <span>Facturado ${mny(fact)}</span><span>Gastos ${mny(gas)}</span><span>% cob ${pct}%</span>
      </div>
    </div>`;
  };
  const SORT_OPTS = [
    { v: 'fecha', l: 'Fecha' }, { v: 'ganancia', l: 'Ganancia' }, { v: 'ventas', l: 'Ventas' },
    { v: 'facturado', l: 'Facturado' }, { v: 'gastos', l: 'Gastos' },
    { v: 'bodega_valor', l: 'Bodega' }, { v: 'pct', l: '% cobrado' },
  ];
  const selCol = (s.col === 'ds') ? 'fecha' : s.col;  // el default 'ds' equivale a 'fecha' en el selector
  const selectorHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
    <label style="font-size:11px;color:var(--ts);white-space:nowrap">Ordenar por:</label>
    <select onchange="_resumenUtilSortBy(this.value)" style="flex:1;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:var(--r-sm,8px);padding:7px 9px;font-size:12px">
      ${SORT_OPTS.map(o => `<option value="${o.v}"${selCol === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}
    </select>
  </div>`;
  const sinG2 = _resumenUtilSin ? Number(_resumenUtilSin.gastos || 0) : 0;
  const sinCard = _resumenUtilSin ? cardEsp('Sin evento', true, -sinG2, 0, 0, sinG2, null) : '';
  const totCard = cardEsp('Total', false, totGan, totVentas, totFact, totGas, totBodOk ? totBod : null, totMermaOk ? totMerma : null);
  const cardsHTML = selectorHTML + rows.map(card).join('') + sinCard + totCard;

  cont.innerHTML = `<div class="util-table-view">${tableHTML}</div><div class="util-cards-view">${cardsHTML}</div>`;
}

function _resumenUtilSortBy(col) {
  const s = _resumenUtilSort;
  if (s.col === col) s.dir = (s.dir === 'asc' ? 'desc' : 'asc');
  else { s.col = col; s.dir = (col === 'nombre' || col === 'fecha') ? 'asc' : 'desc'; }
  _resumenUtilPintar();
}

// Export CSV (orden actual + Sin evento + Total). Patrón vanilla del repo.
function _resumenUtilCSV() {
  if (!_resumenUtilRows.length && !_resumenUtilSin) return;
  // [AUD-1d] Las columnas de la CUENTA. Memo confirmó que no usa este CSV, así
  // que no hay compatibilidad que cuidar: dice lo mismo que la tabla.
  // [MER-1] La bodega y la merma llevan COLUMNAS PROPIAS. Compartir una sola las
  // volvería a mezclar en la hoja de cálculo: quien sume esa columna estaría
  // sumando dinero por cobrar con dinero ya perdido. Cada renglón llena una de
  // las dos y deja la otra VACÍA (no en cero: un cero se suma, una celda vacía no).
  const head = ['Evento', 'Fecha', 'Facturado', 'Ventas', 'Gastos', 'Ganancia', 'Deuda_proveedores', 'Bodega_estimada', 'Bodega_boletos', 'Merma_costo_hundido', 'Merma_boletos', 'Pct_cobrado'];
  const cell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // Reusa el mismo orden visible.
  const rows = _resumenUtilRows.slice();
  const s = _resumenUtilSort;
  const key = (r) => (s.col === 'fecha') ? r.ds : r[s.col];
  rows.sort((a, b) => { const da = a.desconocido ? 1 : 0, db = b.desconocido ? 1 : 0; if (da !== db) return da - db; const ka = key(a), kb = key(b); let c = (typeof ka === 'number' && typeof kb === 'number') ? ka - kb : String(ka).localeCompare(String(kb)); return s.dir === 'asc' ? c : -c; });
  const lines = [head.map(cell).join(',')];
  let tf = 0, tv = 0, tg = 0, tgan = 0, tb = 0, tbOk = false, tm = 0, tmOk = false;
  rows.forEach(r => {
    tf += r.facturado; tv += r.ventas; tg += r.gastos; tgan += r.ganancia;
    if (r.pasado) { if (r.merma_costo != null) { tm += Number(r.merma_costo); tmOk = true; } }
    else if (r.bodega_valor != null) { tb += Number(r.bodega_valor); tbOk = true; }
    const nom = r.desconocido ? (r.nombre + ' (evento desconocido)') : r.nombre;
    // Celda vacía, NO cero, cuando la bodega no se pudo estimar: en una hoja de
    // cálculo un 0 se suma y una celda vacía no.
    lines.push([nom, r.fecha, r.facturado, r.ventas, r.gastos, r.ganancia,
                // [E5-3] La deuda va en su columna. Vacía —no cero— cuando no se
                // conoce: en una hoja de cálculo un 0 se suma y dice "no debe".
                r.deuda == null ? '' : r.deuda,
                (r.pasado || r.bodega_valor == null) ? '' : r.bodega_valor,
                (r.pasado || r.bodega_boletos == null) ? '' : r.bodega_boletos,
                (!r.pasado || r.merma_costo == null) ? '' : r.merma_costo,
                (!r.pasado || r.merma_boletos == null) ? '' : r.merma_boletos,
                Math.round(r.pct * 100) + '%'].map(cell).join(','));
  });
  if (_resumenUtilSin) {
    const xg = Number(_resumenUtilSin.gastos || 0);
    tg += xg;
    lines.push(['Sin evento', '', '', '', xg, -xg, '', '', '', '', '', ''].map(cell).join(','));
  }
  // [UTIL-C-4] El CSV se quedó fuera del arreglo de UTIL-C-3: seguía restando
  // los gastos generales POR SU CUENTA mientras la tabla ya los leía del
  // servidor. Dos totales de utilidad para los mismos renglones — la tabla en
  // pantalla y la hoja que se descarga— es exactamente la divergencia que la
  // serie vino a cerrar, y encima la peor de detectar: nadie carea un CSV
  // contra la pantalla de la que salió.
  if (_resumenUtilGananciaEmpresa != null) tgan = _resumenUtilGananciaEmpresa;
  else if (_resumenUtilSin) tgan -= Number(_resumenUtilSin.gastos || 0);
  // [E5-3] El total de deuda sale del SERVIDOR (_resumenUtilDeudaTotal), no de
  // sumar la columna: la misma regla que en la fila Total de la tabla.
  lines.push(['TOTAL', '', tf, tv, tg, tgan, _resumenUtilDeudaTotal == null ? '' : _resumenUtilDeudaTotal,
              tbOk ? tb : '', '', tmOk ? tm : '', '', tf > 0 ? Math.round(tv / tf * 100) + '%' : '0%'].map(cell).join(','));
  const csv = '\ufeff' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'utilidad-por-evento.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ═══════════════════════════════════════════════════════════════
// [RES-4] EL RADAR DENTRO DEL RESUMEN — qué se está mirando y qué se vende
//
// Dos preguntas que ninguna otra parte del Resumen contesta: QUÉ EVENTO ESTÁN
// VIENDO y CUÁNTO DE ESAS VISITAS SE VUELVE VENTA. Las dos salen del Radar,
// que ya las calcula: `mainMetrics().top_vistos` y `ventasTrafico()`. Aquí no
// se cuenta nada — se pide y se pinta.
//
// LA VENTANA SON 14 DÍAS, la misma que "los más buscados" del sitio público
// (CAT-4). ⚠️ Es una constante ESPEJO, no compartida: la original vive en
// `netlify/functions/event-clicks.js` (`DIAS_VENTANA = 14`) y ese archivo es
// del servidor, no lo puede leer el navegador. Si alguna cambia, la otra hay
// que cambiarla a mano — por eso está dicho aquí en voz alta.
//
// QUIÉN LO VE: `ROLES_RADAR` es ['maestro_roshi'] a secas, leído del endpoint.
// Fails-soft POR FUENTE: si una de las dos truena, la otra se pinta igual.
// ═══════════════════════════════════════════════════════════════
const RADAR_HOME_DIAS = 14;
const RADAR_HOME_TOP = 5;

// [RAD-1a] Pide la ventana al calendario, no se la inventa. Era la cuarta
// aritmética de la pantalla: `ahora − 14×24h` con `toISOString()`.
// Sigue siendo una RODANTE a propósito —la portada enseña «los últimos 14
// días», no «esta quincena»— pero ahora arranca a MEDIANOCHE DE REYNOSA, no a
// la hora en que abriste el panel.
function _radarHomeSince() {
  const hoy = _radCalHoy();
  return _radCalMasDias(hoy, -(RADAR_HOME_DIAS - 1)).toISOString();
}

// Barra proporcional al mayor, como la del Radar. El divisor nunca es 0.
function _rdhBarra(n, max) {
  const pct = Math.max(2, Math.round((Number(n) || 0) / Math.max(1, max) * 100));
  return `<span class="rdh-bar" style="width:${pct}%"></span>`;
}

function _rdhVistos(top) {
  if (!top.length) return '<div class="rdh-vacio">Sin visitas registradas en estos ' + RADAR_HOME_DIAS + ' días</div>';
  const max = Math.max(1, ...top.map(e => Number(e.sesiones) || 0));
  return top.map((e, i) => `<button type="button" class="rdh-row" onclick="_evtIrA('${_attrJs(e.evento_id || '')}')"
      title="Ver ${_esfEsc(e.nombre || e.evento_id || '')} en Por evento">
    <span class="rdh-pos">${i + 1}</span>
    <span class="rdh-nom">${_esfEsc(e.nombre || e.evento_id || '—')}${_rdhBarra(e.sesiones, max)}</span>
    <span class="rdh-n">${(Number(e.sesiones) || 0).toLocaleString('es-MX')}</span>
  </button>`).join('');
}

function _rdhVentas(vt) {
  if (!vt.length) return '<div class="rdh-vacio">Sin datos de ventas en estos ' + RADAR_HOME_DIAS + ' días</div>';
  return `<table class="rdh-tabla"><thead><tr>
      <th>Evento</th><th class="rdh-der">Visitas</th><th class="rdh-der">Ventas</th><th class="rdh-der">Conv.</th>
    </tr></thead><tbody>${vt.map(r => {
      // ⚠️ La conversión la CALCULA el endpoint (`conv`). No se recalcula aquí:
      // dos divisiones del mismo par en dos pantallas es como empezaron las
      // once fórmulas de dinero que AUD-1 tuvo que recoger.
      const conv = Number(r.conv);
      return `<tr class="rdh-clic" onclick="_evtIrA('${_attrJs(r.evento_id || '')}')" title="Ver en Por evento">
        <td class="rdh-nom2">${_esfEsc(r.evento_nombre || r.evento_id || '—')}</td>
        <td class="rdh-der">${(Number(r.visitas) || 0).toLocaleString('es-MX')}</td>
        <td class="rdh-der">${(Number(r.ventas) || 0).toLocaleString('es-MX')}</td>
        <td class="rdh-der ${Number.isFinite(conv) && conv > 0 ? 'rdh-conv' : ''}">${Number.isFinite(conv) ? conv.toFixed(1) + '%' : '—'}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

async function _loadRadarHome() {
  const el = document.getElementById('resumen-radar');
  if (!el) return;
  if (!currentUser || currentUser.rol !== 'maestro_roshi') { el.style.display = 'none'; return; }
  const since = _radarHomeSince();
  // Fails-soft POR FUENTE, no en bloque: un `Promise.all` que rechaza dejaría
  // el panel entero vacío aunque la otra mitad hubiera contestado bien.
  const [met, vt] = await Promise.all([
    khRadar.mainMetrics(since).catch(() => null),
    khRadar.ventasTrafico({ since }).catch(() => []),
  ]);
  const top = ((met && met.top_vistos) || []).slice(0, RADAR_HOME_TOP);
  const ventas = (Array.isArray(vt) ? vt : []).slice(0, RADAR_HOME_TOP);
  if (!top.length && !ventas.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `<div class="card rdh-card">
    <div class="rdh-head">
      <span class="rdh-h">Radar · qué se está mirando</span>
      <span class="rdh-win">últimos ${RADAR_HOME_DIAS} días · <button type="button" class="rdh-ver" onclick="showPage('radar')">ver el Radar completo →</button></span>
    </div>
    <div class="rdh-cols">
      <div class="rdh-col">
        <div class="rdh-sub">Más vistos</div>
        ${_rdhVistos(top)}
      </div>
      <div class="rdh-col">
        <div class="rdh-sub">De visita a venta</div>
        ${_rdhVentas(ventas)}
      </div>
    </div>
  </div>`;
}

// [RES-4] Aquí vivían `_diasHasta` y `_renderResumenProximos`, que pintaban
// la tarjeta de "Próximos Eventos". Se van con ella: medido, `_diasHasta` no
// tenía otro consumidor y `_renderResumenProximos` se llamaba desde un solo
// sitio. Dejar código que ya no pinta nada es peor que borrarlo — pero se
// borra DESPUÉS de contar los usos, no antes.
// Días de atraso = hoy − fecha_esperada (ambos a mediodía para evitar bordes DST,
// como "próximos"). >=0; nunca negativo (los atrasados ya filtran fecha < hoy).
function _cobDiasAtraso(fechaISO) {
  if (!fechaISO) return 0;
  const hoy = Date.parse(_cobHoyISO() + 'T12:00:00');
  const f = Date.parse(String(fechaISO) + 'T12:00:00');
  if (isNaN(hoy) || isNaN(f)) return 0;
  return Math.max(0, Math.round((hoy - f) / 86400000));
}

// Atrasados (Franja 3 del dashboard): tours activos con pago vencido. Header de
// conteo en ámbar (N>0), días de atraso, evento, saldo y WhatsApp. Orden días DESC
// (más atrasado arriba). Máx 10 + "ver todos en Pagos". Fila clickable → Pagos
// (el botón WhatsApp hace stopPropagation para no navegar). Reusa la cobranza ya
// cargada (activos); no re-fetch.
function _renderResumenAtrasados(activos, cancelados) {
  const el = document.getElementById('atrasados-lista');
  if (!el) return;
  const atr = (activos || []).filter(_cobEsAtrasado)
    .map(t => ({ t, dias: _cobDiasAtraso(((t.pago || {}).proximo || {}).fecha_esperada) }))
    .sort((a, b) => b.dias - a.dias);  // más atrasado arriba
  const nCanc = (cancelados || []).length;
  const pie = nCanc ? `<div style="margin-top:12px;font-size:11px;color:var(--ts)">${nCanc} tour${nCanc === 1 ? '' : 's'} cancelado${nCanc === 1 ? '' : 's'} (no cuentan en los totales).</div>` : '';

  if (!atr.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div>Nadie atrasado — todos al corriente.</div>' + pie;
    return;
  }

  const N = atr.length;
  const header = `<div style="display:flex;align-items:center;gap:8px;color:var(--orange);font-weight:700;font-size:13px;margin-bottom:8px"><svg class="ic"><use href="#ic-alerta"/></svg> ${N} viajero${N === 1 ? '' : 's'} atrasado${N === 1 ? '' : 's'}</div>`;
  const LIMITE = 10;
  const visibles = atr.slice(0, LIMITE);

  const filas = visibles.map(({ t, dias }) => {
    const c = t.clientes || {};
    const pago = t.pago || {};
    const evL = _cobEventoLabel(t);
    const prox = pago.proximo;
    const wa = _cobWaHref(t);
    const waBtn = wa
      ? `<a class="btn btn-green btn-sm" href="${wa}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:11px;text-decoration:none">WhatsApp</a>`
      : `<span style="font-size:11px;color:var(--ts)">${_spEscape(c.celular || 's/tel')}</span>`;
    const venceTxt = prox ? ('Venció ' + _spEscape(prox.fecha_esperada)) : '';
    const diasTxt = `${dias} día${dias === 1 ? '' : 's'} de atraso`;
    return `
    <div class="dash-click" onclick="showPage('pagos')" title="Gestionar en Pagos" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-weight:600;font-size:14px">${_spEscape(c.nombre_completo || '—')}</div>
        <div style="font-size:11px"><span style="color:var(--orange);font-weight:700">${diasTxt}</span><span style="color:var(--ts)"> · ${_spEscape(evL.nombre)}${evL.fecha ? ' · ' + _spEscape(evL.fecha) : ''}${venceTxt ? ' · ' + venceTxt : ''}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;white-space:nowrap">
        <div style="text-align:right">
          <div style="font-size:13px;color:var(--orange)">${_spFmtMxn(pago.restante)}</div>
          <div style="font-size:10px;color:var(--ts)">saldo</div>
        </div>
        ${waBtn}
      </div>
    </div>`;
  }).join('');

  const verTodos = (N > LIMITE)
    ? `<div class="dash-click" onclick="showPage('pagos')" style="text-align:center;padding:10px 0;font-size:12px;color:var(--orange);font-weight:700">ver todos (${N}) en Pagos →</div>`
    : '';

  el.innerHTML = header + filas + verTodos + pie;
}

// En riesgo de baja (Nivel 3 morosidad): clientes con 3+ quincenas vencidas.
// Solo visibilidad — clickea al plan; NO da de baja ni manda correos (eso es
// humano en el modal). Reusa los mismos helpers y molde de fila que atrasados.
function _renderResumenRiesgoBaja(activos) {
  const card = document.getElementById('riesgo-baja-card');
  const el = document.getElementById('riesgo-baja-lista');
  if (!card || !el) return;
  const enRiesgo = (activos || [])
    .filter(t => Number((t.pago || {}).vencidos || 0) >= 3)
    .sort((a, b) => Number((b.pago||{}).vencidos||0) - Number((a.pago||{}).vencidos||0));
  if (!enRiesgo.length) { card.style.display = 'none'; el.innerHTML = ''; return; }
  card.style.display = '';
  const N = enRiesgo.length;
  const header = `<div style="display:flex;align-items:center;gap:8px;color:var(--red);font-weight:700;font-size:13px;margin-bottom:8px"><svg class="ic"><use href="#ic-alerta"/></svg> ${N} en riesgo de baja</div>`;
  const filas = enRiesgo.map(t => {
    const c = t.clientes || {};
    const pago = t.pago || {};
    const nv = Number(pago.vencidos || 0);
    const evL = _cobEventoLabel(t);
    const wa = _cobWaHref(t);
    const waBtn = wa
      ? `<a class="btn btn-green btn-sm" href="${wa}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:11px;text-decoration:none">WhatsApp</a>`
      : `<span style="font-size:11px;color:var(--ts)">${_spEscape(c.celular || 's/tel')}</span>`;
    return `
    <div class="dash-click" onclick="abrirPlanCobranza('${_spEscape(t.id)}')" title="Ver plan y decidir" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-weight:600;font-size:14px">${_spEscape(c.nombre_completo || '—')}</div>
        <div style="font-size:11px"><span style="color:var(--red);font-weight:700">${nv} quincena${nv===1?'':'s'} vencida${nv===1?'':'s'}</span><span style="color:var(--ts)"> · ${_spEscape(evL.nombre)}${evL.fecha ? ' · ' + _spEscape(evL.fecha) : ''}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;white-space:nowrap">
        <div style="text-align:right">
          <div style="font-size:13px;color:var(--red)">${_spFmtMxn(pago.restante)}</div>
          <div style="font-size:10px;color:var(--ts)">saldo</div>
        </div>
        ${waBtn}
      </div>
    </div>`;
  }).join('');
  el.innerHTML = header + filas;
}

// ═══════════════════════════════════════════════════════════════
// PAGOS
// ═══════════════════════════════════════════════════════════════
// ── PAGOS = CENTRO DE COBRANZA sobre el portal (Fase 3) ───────────────────
// loadPagos lista los tours activos (solicitudes_tour en_pagos/pagado) vía
// admin-cobranza-list, con su avance de cobranza. "Registrar pago" reusa el
// flujo de la 2.3c (cargarPlanPagosSP/marcarPagoSP/revertirPagoSP) en un modal.
let _cobranzaCache = [];          // todos los tours cargados (activos + cancelados)
let _cobFiltrados = [];           // última lista filtrada (para CSV)
let _cobranzaEventoSelectPoblado = false;
let _cobEVMap = {};               // evento_id (base o base#idx) -> { nombre, fecha }
let _cobSortKey = 'proximo';      // nombre | evento | resta | proximo
let _cobSortDir = 'asc';

const _COB_PAQ_BG = { 'PLUS':'rgba(255,183,3,.15)','STAY':'rgba(94,167,255,.15)','RIDE':'rgba(61,220,132,.15)','CHEAP':'rgba(255,107,0,.12)' };
const _COB_PAQ_FG = { 'PLUS':'var(--gold)','STAY':'var(--blue)','RIDE':'var(--green)','CHEAP':'var(--orange)' };

// Puebla el filtro de Evento desde EV (index.html) y arma _cobEVMap para resolver
// nombre/fecha por evento_id. Multifecha: una opción por fecha (valor base#idx,
// ej. "Karol G · 6 Noviembre"); evento normal usa el id base. Corre una sola vez.
async function _poblarFiltroEventoPagos() {
  if (_cobranzaEventoSelectPoblado) return;
  const sel = document.getElementById('filtro-evento-pagos');
  const ev = await _fetchEVFromIndex();
  // [ORD-1] Antes: DESCENDENTE por ds — el más LEJANO primero y el próximo a
  // media lista. Ahora la regla compartida: próximos · sin fecha · pasados.
  const eventos = _evOrdenarPorFecha((ev || []).filter(e => e && e.id && e.a));
  const opciones = [];
  eventos.forEach(e => {
    if (Array.isArray(e.multifecha) && e.multifecha.length) {
      e.multifecha.forEach((mf, i) => {
        const lbl = (mf && mf.lbl) ? mf.lbl : ('Fecha ' + (i + 1));
        const id = e.id + '#' + i;
        _cobEVMap[id] = { nombre: e.a, fecha: lbl };
        opciones.push({ value: id, label: e.a + ' · ' + lbl });
      });
    } else {
      _cobEVMap[e.id] = { nombre: e.a, fecha: '' };
      opciones.push({ value: e.id, label: e.a });
    }
  });
  if (sel) {
    while (sel.options.length > 1) sel.remove(1);
    opciones.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
  }
  _cobranzaEventoSelectPoblado = true;
}

// Carga UNA vez la lista completa (activos por defecto + cancelados) en
// _cobranzaCache y delega todo el filtrado/orden a _renderCobranza (client-side,
// instantáneo). El refresh tras marcar un pago vuelve a llamar a loadPagos.
async function loadPagos() {
  // [COB-MIG-1] Volver a COBRANZA apaga la CAJA. El botón de esa pestaña llama
  // a `showPage('pagos')` → `loadPagos()`, así que el interruptor vive aquí y
  // no en el `onclick`: si mañana se entra a Pagos por otro camino (la barra
  // móvil, un deep-link), la caja no se queda encendida encima.
  if (typeof _cobCajaMostrar === 'function') _cobCajaMostrar(false);
  _pgSyncTabs('pagos');   // [E5-6] la franja de la puerta única
  const tbody = document.getElementById('tabla-pagos');
  if (!tbody) return;
  await _poblarFiltroEventoPagos();
  tbody.innerHTML = '<tr><td colspan="10"><div class="loading-state"><div class="spinner"></div>Cargando…</div></td></tr>';

  try {
    const hdrs = _spAdminHeaders();
    const pedir = (estado) => khAdminFetch('/.netlify/functions/admin-cobranza-list', {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify(estado ? { estado } : {}),
    }).then(r => r.json().then(d => ({ ok: r.ok, d })));
    const [act, can] = await Promise.all([pedir(null), pedir('cancelado')]);
    if (!act.ok) throw new Error((act.d && act.d.error) || 'No se pudo cargar la cobranza');
    const activos    = Array.isArray(act.d.tours) ? act.d.tours : [];
    const cancelados = (can.ok && Array.isArray(can.d.tours)) ? can.d.tours : [];
    _cobranzaCache = activos.concat(cancelados);
    _renderCobranza();
  } catch (e) {
    _cobranzaCache = [];
    _cobFiltrados = [];
    ['pagos-cnt-viajeros','pagos-cnt-atrasados','pagos-ingresado','pagos-porcobrar']
      .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    tbody.innerHTML = `<tr><td colspan="10"><div class="alert alert-error">${_spEscape(e.message)}</div></td></tr>`;
  }
}

function _cobHoyISO() {
  // Hoy en hora MX (America/Monterrey), formato YYYY-MM-DD.
  // NO usar toISOString(): es UTC y cerca de medianoche MX marca atrasados
  // un día antes (MX = UTC-6). Patrón consistente con _kamToday() y demás.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
}

// Atrasado: tiene un próximo pago pendiente con fecha_esperada anterior a hoy.
// Cancelado/liquidado nunca cuenta como atrasado.
function _cobEsAtrasado(t) {
  if (!t || t.estado === 'cancelado') return false;
  const p = (t.pago || {}).proximo;
  return !!(p && p.fecha_esperada && String(p.fecha_esperada) < _cobHoyISO());
}

// Nombre del evento + fecha (solo si es multifecha y la fecha no está ya en el nombre).
function _cobEventoLabel(t) {
  const nombre = t.evento_nombre || t.evento_id || '—';
  const map = _cobEVMap[t.evento_id];
  if (map && map.fecha && !String(nombre).toLowerCase().includes(String(map.fecha).toLowerCase())) {
    return { nombre, fecha: map.fecha };
  }
  return { nombre, fecha: '' };
}

function _cobDigits(s) { return String(s || '').replace(/\D/g, ''); }

// Enlace WhatsApp al cliente con recordatorio prellenado. Devuelve null si el
// celular no resuelve a 10 dígitos (entonces se muestra sin enlace).
function _cobWaHref(t) {
  const c = t.clientes || {};
  let d = _cobDigits(c.celular);
  if (d.length === 13 && d.startsWith('521')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
  if (d.length !== 10) return null;
  const primer = (String(c.nombre_completo || '').trim().split(/\s+/)[0]) || 'viajero';
  const prox = (t.pago || {}).proximo;
  const evN = t.evento_nombre || 'tu tour';
  let msg;
  if (prox) {
    msg = 'Hola ' + primer + ', te recordamos tu pago de Conecta Reynosa para ' + evN +
          '. Tu próximo pago es de ' + _spFmtMxn(prox.monto) + ' antes del ' + prox.fecha_esperada +
          '. Cuando lo realices, mándanos tu comprobante. ¡Gracias!';
  } else {
    msg = 'Hola ' + primer + ', te saludamos de Conecta Reynosa. ¡Gracias por viajar con nosotros!';
  }
  return 'https://wa.me/52' + d + '?text=' + encodeURIComponent(msg);
}

// Aplica búsqueda/filtros/orden sobre _cobranzaCache (sin re-fetch) y pinta tabla,
// contadores y flechas de orden.
function _renderCobranza() {
  const tbody = document.getElementById('tabla-pagos');
  if (!tbody) return;
  const evId   = (document.getElementById('filtro-evento-pagos') || {}).value || '';
  const estado = (document.getElementById('filtro-status-pagos') || {}).value || '';
  const q      = ((document.getElementById('filtro-nombre-pagos') || {}).value || '').trim().toLowerCase();
  const soloAtr = !!(document.getElementById('filtro-atrasados-pagos') || {}).checked;

  let lista = (_cobranzaCache || []).slice();

  if (estado) lista = lista.filter(t => t.estado === estado);

  if (evId) {
    if (evId.indexOf('#') >= 0) lista = lista.filter(t => t.evento_id === evId);
    else lista = lista.filter(t => t.evento_id === evId || (typeof t.evento_id === 'string' && t.evento_id.startsWith(evId + '#')));
  }

  if (q) {
    lista = lista.filter(t => {
      const c = t.clientes || {};
      const hay = [c.nombre_completo, t.evento_nombre, t.zona, c.celular]
        .map(x => String(x || '').toLowerCase()).join(' ');
      return hay.indexOf(q) >= 0;
    });
  }

  if (soloAtr) lista = lista.filter(_cobEsAtrasado);

  const dir = _cobSortDir === 'desc' ? -1 : 1;
  lista.sort((a, b) => {
    if (_cobSortKey === 'nombre') {
      return String((a.clientes||{}).nombre_completo||'').localeCompare(String((b.clientes||{}).nombre_completo||''), 'es', { sensitivity:'base' }) * dir;
    }
    if (_cobSortKey === 'evento') {
      return String(a.evento_nombre||'').localeCompare(String(b.evento_nombre||''), 'es', { sensitivity:'base' }) * dir;
    }
    if (_cobSortKey === 'resta') {
      return (Number((a.pago||{}).restante||0) - Number((b.pago||{}).restante||0)) * dir;
    }
    const fa = ((a.pago||{}).proximo && a.pago.proximo.fecha_esperada) || '9999-12-31';
    const fb = ((b.pago||{}).proximo && b.pago.proximo.fecha_esperada) || '9999-12-31';
    if (fa === fb) return 0;
    return (fa < fb ? -1 : 1) * dir;
  });

  _cobFiltrados = lista;

  // Contadores de la lista filtrada.
  const nAtr = lista.filter(_cobEsAtrasado).length;
  const ingresado = lista.reduce((a, t) => a + Number((t.pago||{}).abonado||0), 0);
  const porCobrar = lista.reduce((a, t) => a + Number((t.pago||{}).restante||0), 0);
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('pagos-cnt-viajeros', String(lista.length));
  setTxt('pagos-cnt-atrasados', String(nAtr));
  setTxt('pagos-ingresado', _spFmtMxn(ingresado));
  setTxt('pagos-porcobrar', _spFmtMxn(porCobrar));

  // Flechas de orden.
  document.querySelectorAll('.cob-arrow').forEach(s => { s.textContent = ''; });
  const arr = document.querySelector('.cob-arrow[data-k="' + _cobSortKey + '"]');
  if (arr) arr.textContent = _cobSortDir === 'asc' ? '▲' : '▼';

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">·</div>Sin tours que coincidan con los filtros</div></td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(t => {
    const c = t.clientes || {};
    const pago = t.pago || {};
    const paq = t.paquete || '';
    const prox = pago.proximo;
    const atr = _cobEsAtrasado(t);
    const evL = _cobEventoLabel(t);
    const wa = _cobWaHref(t);
    const telTxt = _spEscape(c.celular || '—');
    const telCell = wa
      ? `<a href="${wa}" target="_blank" rel="noopener" style="color:var(--green);text-decoration:none;white-space:nowrap" title="Enviar recordatorio por WhatsApp">${telTxt} ↗</a>`
      : `<span style="color:var(--ts)">${telTxt}</span>`;
    const proxCell = prox
      ? `<div style="white-space:nowrap"><b>${_spFmtMxn(prox.monto)}</b></div><div style="font-size:11px;color:${atr?'var(--red)':'var(--ts)'}">${_spEscape(prox.fecha_esperada)}</div>`
      : '<span style="color:var(--ts)">—</span>';
    const rowCls = atr ? 'cob-atrasado' : (t.estado === 'pagado' ? 'cob-pagado' : '');
    return `<tr class="${rowCls}">
      <td><div style="font-weight:600">${_spEscape(c.nombre_completo || '—')}</div><div style="margin-top:3px">${_badgeCliente(c)}</div></td>
      <td style="font-size:12px">${telCell}</td>
      <td style="font-size:12px">${_spEscape(evL.nombre)}${evL.fecha?`<br><span style="color:var(--ts);font-size:11px">${_spEscape(evL.fecha)}</span>`:''}</td>
      <td style="font-size:12px">${_spEscape(t.zona || '—')}</td>
      <td>${paq ? `<span style="font-size:10px;font-weight:700;padding:2px 10px;border-radius:4px;background:${_COB_PAQ_BG[paq]||'rgba(255,255,255,.06)'};color:${_COB_PAQ_FG[paq]||'var(--ts)'}">${_spEscape(paq)}</span>` : '—'}</td>
      <td>${proxCell}</td>
      <td style="color:var(--green)">${_spFmtMxn(pago.abonado)}</td>
      <td style="color:${(pago.restante||0) > 0 ? 'var(--orange)' : 'var(--green)'}">${_spFmtMxn(pago.restante)}</td>
      <td style="white-space:nowrap">${_spBadgeEstado(t.estado)}${atr?'<span class="cob-badge-atraso">Atrasado</span>':''}</td>
      <td><button class="btn btn-primary btn-sm" style="font-size:11px" onclick="abrirPlanCobranza('${_spEscape(t.id)}')">Registrar pago</button></td>
    </tr>`;
  }).join('');
}

// Cambia la columna/dirección de orden y re-pinta. Texto asc por defecto;
// montos/saldo arrancan desc (lo más grande primero); próximo pago asc (lo más cercano).
function _cobSort(key) {
  if (_cobSortKey === key) {
    _cobSortDir = (_cobSortDir === 'asc') ? 'desc' : 'asc';
  } else {
    _cobSortKey = key;
    _cobSortDir = (key === 'resta') ? 'desc' : 'asc';
  }
  _renderCobranza();
}

function _cobCsvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Exporta la lista FILTRADA actual a CSV (mismas columnas que la tabla).
function _cobExportCSV() {
  const rows = _cobFiltrados || [];
  if (!rows.length) { showToast('No hay filas que exportar', 'error'); return; }
  const head = ['Viajero','Telefono','Evento','Fecha','Zona','Paquete','Proximo_monto','Proximo_fecha','Abonado','Resta','Estado','Atrasado'];
  const lines = [head.join(',')];
  rows.forEach(t => {
    const c = t.clientes || {};
    const pago = t.pago || {};
    const prox = pago.proximo;
    const evL = _cobEventoLabel(t);
    lines.push([
      _cobCsvCell(c.nombre_completo || ''),
      _cobCsvCell(c.celular || ''),
      _cobCsvCell(evL.nombre),
      _cobCsvCell(evL.fecha),
      _cobCsvCell(t.zona || ''),
      _cobCsvCell(t.paquete || ''),
      _cobCsvCell(prox ? prox.monto : ''),
      _cobCsvCell(prox ? prox.fecha_esperada : ''),
      _cobCsvCell(pago.abonado || 0),
      _cobCsvCell(pago.restante || 0),
      _cobCsvCell(t.estado || ''),
      _cobCsvCell(_cobEsAtrasado(t) ? 'Si' : 'No'),
    ].join(','));
  });
  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cobranza.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Abre el plan de una solicitud en un modal, reusando el render de la 2.3c.
// El render apunta a #sp-plan-<id>; marcarPagoSP/revertirPagoSP refrescan ese
// div y, al detectar este modal abierto, también loadPagos() (ver _spRefrescarPlanYLista).
function abrirPlanCobranza(solicitudId) {
  const t = (_cobranzaCache || []).find(x => x.id === solicitudId)
    || ((_cobTodoCache ? _cobTodoCache.activos.concat(_cobTodoCache.cancelados) : []).find(x => x.id === solicitudId));
  const c = (t && t.clientes) || {};
  const eventoNombre = (t && t.evento_nombre) || '';
  const contenido = `
    <div style="font-size:12px;color:var(--ts);margin-bottom:12px">Viajero <b style="color:var(--ink)">${_spEscape(c.nombre_completo || '—')}</b> · ${_spEscape(eventoNombre)}</div>
    <div id="sp-plan-${_spEscape(solicitudId)}" style="font-size:13px;color:var(--ts)">Cargando plan…</div>`;
  crearModal('cobranza-plan', 'Plan de pagos · ' + eventoNombre, contenido);
  const m = document.getElementById('modal-cobranza-plan');
  if (m) { const inner = m.querySelector('.modal'); if (inner) inner.style.maxWidth = '640px'; }
  cargarPlanPagosSP(solicitudId, t ? t.estado : 'en_pagos', t ? t.paquete : undefined);
}

// ═══════════════════════════════════════════════════════════════
// POR EVENTO — Análisis financiero por evento (Fase 4, sobre el portal)
// ═══════════════════════════════════════════════════════════════
let _evtSelectorPoblado = false;

// Puebla #selector-evento desde EV (index.html), con multifecha por separado
// (base#idx), igual que el filtro de la Fase 3.1. Corre una sola vez.
// Click-through → "Por evento": el click guarda el slug pendiente y navega; el
// auto-select se aplica cuando el selector ya está poblado (sin setTimeout).
let _evtPendingSelect = null;
function _evtIrA(slug) { _evtPendingSelect = slug || null; showPage('eventos', 'Por Evento'); }
function _evtAplicarPendiente() {
  if (!_evtPendingSelect) return;
  const sel = document.getElementById('selector-evento');
  if (!sel) return;
  const base = String(_evtPendingSelect);
  _evtPendingSelect = null;
  let match = '';
  for (let i = 0; i < sel.options.length; i++) {
    const v = sel.options[i].value;
    if (v && (v === base || v.split('#')[0] === base)) { match = v; break; }
  }
  if (match) { sel.value = match; sel.dispatchEvent(new Event('change')); }
}

async function _evtPoblarSelector() {
  if (_evtSelectorPoblado) { _evtAplicarPendiente(); return; }
  const sel = document.getElementById('selector-evento');
  if (!sel) return;
  const ev = await _fetchEVFromIndex();
  // [ORD-1] Antes: DESCENDENTE por ds — el más LEJANO primero y el próximo a
  // media lista. Ahora la regla compartida: próximos · sin fecha · pasados.
  const eventos = _evOrdenarPorFecha((ev || []).filter(e => e && e.id && e.a));
  while (sel.options.length > 1) sel.remove(1);
  eventos.forEach(e => {
    if (Array.isArray(e.multifecha) && e.multifecha.length) {
      e.multifecha.forEach((mf, i) => {
        const lbl = (mf && mf.lbl) ? mf.lbl : ('Fecha ' + (i + 1));
        const opt = document.createElement('option');
        opt.value = e.id + '#' + i;
        opt.textContent = e.a + ' · ' + lbl;
        sel.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.a;
      sel.appendChild(opt);
    }
  });
  _evtSelectorPoblado = true;
  _evtAplicarPendiente();
}

// Carga los tours ACTIVOS del evento elegido (filtra la cache de cobranza) y pinta.
// ═══════════════════════════════════════════════════════════════════════════
// [CAP-FIX-2] EL MUNDO MIGRADO EN "POR EVENTO".
//
// El análisis financiero leía SOLO el Portal (solicitudes/pagos), así que
// melanie —cuyos 30 viajeros vienen del Excel— salía en $0. No era un cero: era
// una pantalla mirando al mundo equivocado.
//
// Se suma con la MISMA regla de oro de VJ-3, que no se re-implementa aquí:
//   resta = total_contrato − abonado_previo − suma(abonos_viajero)
// y JAMÁS se recalcula de paquete+habitación+vuelo.
//
// CERO DINERO INVENTADO: una fila SIN total_contrato no suma nada — ni en
// vendido ni en cobrado ni en el conteo de dinero. En melanie son 4 de 30, y
// contarlas como cero diría "no deben nada", que es una afirmación que no
// tenemos. El gate de rol es el de VJ-3 y vive en el SERVIDOR: si quien mira no
// es admin, `viajero_listar` no manda total_contrato ni abonado_previo, aquí no
// llega dinero y el bloque entero no se pinta.
// ═══════════════════════════════════════════════════════════════════════════
let _evtKH = null;   // null = no se ha consultado · {…} = ya se sabe

// PURO: recibe viajeros KH + sus abonos y devuelve el agregado. Sin DOM ni
// fetch, para que el arnés lo pueda interrogar directo.
function _capfix2Agregado(viajeros, abonos) {
  const porViajero = {};
  (abonos || []).forEach((a) => {
    const k = a && a.viajero_id;
    if (!k) return;
    porViajero[k] = (porViajero[k] || 0) + (Number(a.monto) || 0);
  });
  const out = { filas: 0, conDinero: 0, sinDinero: 0, vendido: 0, cobrado: 0, deben: 0, aFavor: 0 };
  (viajeros || []).forEach((v) => {
    out.filas++;
    // La condición EXACTA de _vj3Saldo: sin total_contrato no hay saldo que sumar.
    if (!v || v.total_contrato == null) { out.sinDinero++; return; }
    const saldo = _vj3Saldo(v, (porViajero[v.id] ? [{ monto: porViajero[v.id] }] : []));
    if (!saldo) { out.sinDinero++; return; }
    out.conDinero++;
    out.vendido += saldo.total;
    out.cobrado += saldo.abonado;
    if (saldo.resta > 0) out.deben += saldo.resta;
    else out.aFavor += -saldo.resta;
  });
  return out;
}

// Carga el mundo KH del evento con las acciones que YA existen. Fails-soft: si
// truena, `_evtKH` queda en null y la pantalla es la de antes de esta tuerca —
// null NO es cero, y por eso no se pinta un total a medias.
async function _capfix2CargarKH(evId) {
  const base = String(evId || '').split('#')[0];
  if (!base) { _evtKH = null; return; }
  try {
    const [viajeros, abonos] = await Promise.all([
      khViajeros.listar(base),                       // [sec-coordi] ya existía
      khViajeros.abonosDeEvento(base).catch(() => []), // [VJ-3] ya existía
    ]);
    const ag = _capfix2Agregado(viajeros || [], abonos || []);
    // Sin una sola fila con dinero no hay nada que decir del mundo migrado —
    // y puede ser porque el rol no lo puede ver, no porque no exista.
    _evtKH = ag.conDinero > 0 ? ag : null;
  } catch (_) { _evtKH = null; }
}

async function loadPorEvento() {
  const evId = document.getElementById('selector-evento').value;
  const tbody = document.getElementById('tabla-viajeros');
  const stats = document.getElementById('evt-stats');
  const desg  = document.getElementById('evt-desglose');
  if (!tbody) return;

  if (!evId) {
    _evtTours = []; _evtFiltrados = [];
    _fin1cBodega = null;                                  // [FIN-1c] del evento anterior
    _fin1cPasado = false;                                 // [MER-1d] y su fecha
    const _f1c = document.getElementById('fin1c-resumen');
    if (_f1c) { _f1c.style.display = 'none'; _f1c.innerHTML = ''; }
    if (stats) stats.style.display = 'none';
    if (desg)  desg.style.display = 'none';
    const cajaNota = document.getElementById('evt-caja-nota');        // [AUD-1e]
    const cajaSal1 = document.getElementById('evt-caja-nota-sal1');   // [SAL-1]
    if (cajaNota) cajaNota.style.display = 'none';
    if (cajaSal1) cajaSal1.style.display = 'none';
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">·</div>Selecciona un evento para ver los viajeros</div></td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="8"><div class="loading-state"><div class="spinner"></div>Cargando…</div></td></tr>';
  try {
    const { activos } = await _cobCargarTodo();
    // Gastos (para _renderPorEvento) + utilidad por evento, en paralelo. Best-effort.
    // [CAP-FIX-2] …y el mundo migrado de KH, que hasta hoy no se miraba.
    // [FIN-1c] …y lo que hace falta para la cuenta completa: la bodega (semáforo
    // + precios del catálogo) y la deuda a proveedores. Las dos con acciones que
    // ya existían y las dos fails-soft.
    const _evBase = String(evId).split('#')[0];
    await Promise.all([
      _cobCargarGastos(), _utilCargar(), _capfix2CargarKH(evId),
      _fin1cCargarBodega(_evBase),
      _fin1aCargarDeuda(_evBase).catch(() => {}),
    ]);
    _evtTours = (activos || []).filter(t => _cobTourMatchEvento(t, evId));
    _renderPorEvento();
  } catch (e) {
    if (stats) stats.style.display = 'none';
    if (desg)  desg.style.display = 'none';
    tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert-error">${_spEscape(e.message)}</div></td></tr>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// [FIN-1c] EL RESUMEN QUE JUNTA TODO — Ventas − Gastos = Ganancia
//
// El modelo de Memo, en sus palabras: "sumar todo el dinero que entra de ventas;
// sumar el dinero de los boletos que nos vende el proveedor (esa es nuestra
// deuda); y yo solo voy marcando los gastos. Al final sabemos la ganancia".
//
//   VENTAS   = cobrado del Portal + abonado de migrados (regla _vj3Saldo)
//   GASTOS   = la tabla `gastos` del evento (desde FIN-1b ya trae boletos/hotel/bus)
//   GANANCIA = VENTAS − GASTOS
//
// Y AL LADO, LA BODEGA — el requisito que Memo firmó. Una ganancia negativa con
// boletos sin vender NO es una pérdida: es dinero que todavía está en forma de
// boleto. Enseñar la ganancia sin la bodega asusta sin razón, y es justo lo que
// pasa desde que FIN-1b metió los $147,172 en gastos.
//
// LA DEUDA VA APARTE, nunca dentro de la ganancia: es lo que FALTA por gastar.
// Meterla contaría dos veces lo mismo el día que se pague.
// ═══════════════════════════════════════════════════════════════════════════
let _fin1cBodega = null;   // null = no se ha podido saber · {…} = calculada
// [MER-1d] ¿el evento de la pantalla ya pasó? Vive APARTE de la bodega a
// propósito: si el inventario no carga, la bodega se queda en null pero la fecha
// del evento se sigue sabiendo, y la etiqueta de la ganancia no tiene por qué
// depender del stock para decir la verdad.
let _fin1cPasado = false;

// PURO: la bodega en dinero. `sem` = zonas del semáforo, `precios` = {zona: p}
// del index de HOY. Una zona SIN precio no suma y se cuenta aparte: un cero
// diría "no vale nada", que es una afirmación que no tenemos.
// [MER-1] …y en COSTO además de en precio, porque un evento que ya pasó no tiene
// bodega sino MERMA, y la merma se mide por lo que costó. El costo unitario sale
// del MISMO renglón del semáforo (`costo_unit`, que _lib/disponibilidad deriva de
// las compras): ni una consulta nueva ni una segunda idea de cuánto costó.
function _fin1cBodegaCalc(sem, precios) {
  const out = { boletos: 0, valor: 0, sinPrecio: 0, zonasSinPrecio: [], costo: 0, sinCosto: 0, zonasSinCosto: [] };
  (sem || []).forEach((z) => {
    const disp = Number(z && z.disponibles);
    if (!Number.isFinite(disp) || disp <= 0) return;
    const p = Number((precios || {})[String(z.zona).trim()]);
    out.boletos += disp;
    if (Number.isFinite(p) && p > 0) out.valor += disp * p;
    else { out.sinPrecio += disp; out.zonasSinPrecio.push(String(z.zona)); }
    const c = Number(z && z.costo_unit);
    if (Number.isFinite(c) && c > 0) out.costo += disp * c;
    else { out.sinCosto += disp; out.zonasSinCosto.push(String(z.zona)); }
  });
  return out;
}

// Carga la bodega del evento con acciones que YA existen: el semáforo del
// Palacio y el catálogo del index. Fails-soft — sin bodega, el bloque lo dice
// en vez de sumar un cero.
async function _fin1cCargarBodega(evBase) {
  _fin1cPasado = false;
  try {
    const [rs, ev] = await Promise.all([
      khAdminFetch('/.netlify/functions/admin-compras', {
        method: 'POST', body: JSON.stringify({ accion: 'semaforo', evento_id: evBase }),
      }).then((r) => r.json()).catch(() => ({})),
      (typeof _fetchEVFromIndex === 'function' ? _fetchEVFromIndex() : Promise.resolve([])).catch(() => []),
    ]);
    // [MER-1] Del catálogo, con el evento completo (multifecha incluida). Si el
    // evento no está en el catálogo NO se declara pasado: sin fecha no hay merma.
    // [MER-1d] Se resuelve ANTES de mirar el semáforo: la fecha del evento no
    // depende de que el inventario haya cargado.
    const evt = (ev || []).find((e) => e && e.id === evBase);
    _fin1cPasado = _mermaPasado(evt);
    if (!rs || !rs.ok || !Array.isArray(rs.zonas)) { _fin1cBodega = null; return; }
    const precios = {};
    ((evt && evt.zonas) || []).forEach((z) => { if (z && z.n != null) precios[String(z.n).trim()] = Number(z.p); });
    _fin1cBodega = _fin1cBodegaCalc(rs.zonas, precios);
    _fin1cBodega.pasado = _fin1cPasado;
  } catch (_) { _fin1cBodega = null; }
}

function _fin1cPintar(evBase) {
  const cont = document.getElementById('fin1c-resumen');
  if (!cont) return;
  const util = (_utilG3Cache && _utilG3Cache.eventos && _utilG3Cache.eventos[evBase]) || null;
  const kh = _evtKH;
  // Sin ninguno de los dos libros no hay resumen que pintar. Callar es correcto.
  if (!util && !kh) { cont.style.display = 'none'; cont.innerHTML = ''; return; }

  const ventasPortal = Number((util || {}).cobrado || 0);
  const ventasKH = kh ? Number(kh.cobrado || 0) : 0;
  const ventas = ventasPortal + ventasKH;
  const gastos = Number((util || {}).gastos || 0);
  const ganancia = ventas - gastos;

  const bod = _fin1cBodega;
  const deudaProv = _fin1cDeudaProveedores();

  const money = (n) => _spFmtMxn(n);
  const linea = (lbl, val, cls, sub) => `
    <div class="fin1c-l ${cls || ''}">
      <span class="fin1c-lbl">${_esfEsc(lbl)}</span>
      <span class="fin1c-val">${val}</span>
      ${sub ? `<span class="fin1c-sub">${sub}</span>` : ''}
    </div>`;

  // La ganancia negativa se dice con palabras (patrón CAP-FIX-2d): un "−10,781"
  // a secas se lee como pérdida, y con bodega llena no lo es.
  //
  // [MER-1d] …pero cuando el evento YA PASÓ sí lo es. "Falta por recuperar —
  // todavía no recuperas lo invertido" promete un futuro que ya no existe: no
  // queda nada por vender que pueda recuperarlo. Ahí se llama PÉRDIDA, a secas,
  // con el número en positivo (patrón de signos de la casa: el signo se dice con
  // palabras, no con un menos). En un evento por venir no cambia una coma.
  // [UTIL-C-4] ESTE NÚMERO YA NO SE LLAMA GANANCIA. Lo que calcula esta
  // pantalla es `ventas − gastos`: la CAJA (la fórmula A de FIN-1). Bajo la
  // fórmula C la utilidad resta además la INVERSIÓN TOTAL EN BOLETOS, que esta
  // pantalla no tiene y no puede inventar — con calle24 diría "Ganancia
  // $23,600" al lado de la utilidad real de −$28,720, un error de $52,320 en la
  // palabra más importante del sistema.
  //
  // No se le pone un endpoint nuevo: se le pone el NOMBRE CORRECTO. Es caja, se
  // llama caja, y se dice dónde vive la utilidad. Renombrar es más barato que
  // calcular, y aquí además es lo veraz.
  const gLbl = ganancia < 0 ? 'Falta en caja' : 'En caja';
  const gCls = ganancia < 0 ? 'fin1c-neg' : 'fin1c-pos';
  const gSub = 'ventas menos gastos · la UTILIDAD resta además los boletos, y vive en Kamisama';

  cont.style.display = '';
  cont.innerHTML = `
    <div class="fin1c-t">// el evento en una cuenta</div>
    ${linea('Ventas', money(ventas), '', ventasKH
      ? `${money(ventasPortal)} del Portal + ${money(ventasKH)} de migrados`
      : 'cobrado del Portal')}
    ${linea('− Gastos', money(gastos), '', 'boletos, hotel, transporte, kits…')}
    <div class="fin1c-sep"></div>
    ${linea(`= ${gLbl}`, money(Math.abs(ganancia)), gCls, gSub)}
    ${_fin1cBodegaHtml(bod)}
    <div class="fin1c-sep"></div>
    ${linea('Deuda a proveedores', deudaProv == null ? '—' : money(deudaProv), 'fin1c-info',
      deudaProv == null ? 'no se pudo calcular' : 'lo que FALTA por pagar — no entra en la ganancia')}`;
}

// La bodega: lo que ya se pagó y todavía está en forma de boleto.
//
// [MER-1] …salvo que el evento YA HAYA PASADO, y entonces no es bodega: es
// MERMA. Los mismos boletos, otra pregunta. Antes decía «7 boletos por vender ≈
// $40,100 · Si se vende todo: +$29,319» sobre un concierto del día anterior:
// una salida que no existe. Ahora dice lo que sí pasó — cuántos se quedaron y
// cuánto costaron — y la línea de "si se vende todo" DESAPARECE, porque no hay
// nadie a quien vendérselos.
// [UTIL-C-4] Y se le cae el "si se vende todo" también aquí, por la misma razón
// que en el Resumen: sumarle a una caja el precio de lo que queda promete un
// cierre que ni resta lo que falta por gastar ni suma lo que falta por cobrar.
// La respuesta completa está en el panel de escenarios de Kamisama.
function _fin1cBodegaHtml(bod) {
  if (!bod) {
    return `<div class="fin1c-bod fin1c-bod-mudo">No pude leer el inventario, así que no sé cuántos boletos quedan por vender.</div>`;
  }
  if (!bod.boletos) {
    return bod.pasado
      ? `<div class="fin1c-bod">Sin merma: no quedó ni un boleto sin vender.</div>`
      : `<div class="fin1c-bod">Sin boletos por vender: la cuenta de arriba ya es la final.</div>`;
  }
  if (bod.pasado) {
    const conCosto = bod.boletos - bod.sinCosto;
    return `
      <div class="fin1c-bod fin1c-merma">
        <div class="fin1c-bod-l"><b>Merma:</b> <b>${bod.boletos}</b> boleto${bod.boletos === 1 ? '' : 's'} sin vender
          ${conCosto > 0 ? `· <b>${_spFmtMxn(bod.costo)}</b> de costo hundido` : ''}
        </div>
        ${conCosto > 0 ? `<div class="fin1c-bod-tot"><span class="fin1c-est">el evento ya pasó: ese dinero ya se gastó y ya está dentro de los gastos de arriba</span></div>` : ''}
        ${bod.sinCosto ? `<div class="fin1c-aviso">${bod.sinCosto} de ellos NO suman: su zona no tiene costo capturado en las compras (${_esfEsc(bod.zonasSinCosto.join(', '))}).</div>` : ''}
      </div>`;
  }
  const conPrecio = bod.boletos - bod.sinPrecio;
  return `
    <div class="fin1c-bod">
      <div class="fin1c-bod-l"><b>${bod.boletos}</b> boleto${bod.boletos === 1 ? '' : 's'} por vender
        ${conPrecio > 0 ? `≈ <b>${_spFmtMxn(bod.valor)}</b> <span class="fin1c-est">a precio de hoy (estimado)</span>` : ''}
      </div>
      ${bod.sinPrecio ? `<div class="fin1c-aviso">${bod.sinPrecio} de ellos NO suman: su zona no tiene precio en el catálogo (${_esfEsc(bod.zonasSinPrecio.join(', '))}).</div>` : ''}
    </div>`;
}

// La deuda con proveedores, de la caché que FIN-1a ya llena (compras + servicios
// − abonos). null = todavía no se sabe; NO se pinta un cero.
function _fin1cDeudaProveedores() {
  const pp = (_fin1aDeuda || {}).porProv;
  if (!pp) return null;
  return Object.keys(pp).reduce((a, k) => a + (Number(pp[k].deuda) || 0), 0);
}

// [CAP-FIX-2] La franja que dice DE DÓNDE viene cada número. Sin ella, un total
// mezclado es peor que un total incompleto: se lee como si toda la información
// viniera del mismo sitio.
//
// Y el "por cobrar" del mundo migrado es un NETO de obligaciones opuestas
// (lección de VJ-3): en melanie hay quien debe y hay saldos A FAVOR reales. Un
// solo número escondería las dos mitades, así que se imprimen las dos.
function _capfix2Rotular(nPortal, kh) {
  const cont = document.getElementById('evt-origen');
  if (!cont) return;
  if (!kh) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
  const trozo = (lbl, val, cls) => `<span class="evt-org-i"><b class="${cls || ''}">${_esfEsc(val)}</b> ${_esfEsc(lbl)}</span>`;
  cont.style.display = '';
  cont.innerHTML = `
    <span class="evt-org-t">// de dónde sale</span>
    ${trozo('del Portal', String(nPortal))}
    ${trozo('migrados del Excel', String(kh.filas))}
    ${kh.sinDinero ? trozo('migrados SIN contrato capturado (no suman)', String(kh.sinDinero), 'evt-org-ojo') : ''}
    ${kh.deben ? trozo('deben los migrados', _spFmtMxn(kh.deben)) : ''}
    ${kh.aFavor ? trozo('a favor de migrados', _spFmtMxn(kh.aFavor), 'evt-org-fav') : ''}`;
}

// Pinta resumen financiero (sobre TODO el evento), desglose por paquete/zona y la
// tabla (sujeta a los filtros de paquete y saldo). _evtTours = tours del evento.
function _renderPorEvento() {
  const tbody = document.getElementById('tabla-viajeros');
  const stats = document.getElementById('evt-stats');
  const desg  = document.getElementById('evt-desglose');
  if (!tbody) return;
  const tours = _evtTours || [];

  // Resumen financiero del evento (no depende de los filtros de la tabla).
  const vendido   = tours.reduce((a, t) => a + Number((t.pago || {}).total    || 0), 0);
  const cobrado   = tours.reduce((a, t) => a + Number((t.pago || {}).abonado  || 0), 0);
  const porCobrar = tours.reduce((a, t) => a + Number((t.pago || {}).restante || 0), 0);
  const atrasados = tours.filter(_cobEsAtrasado).length;
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  // [CAP-FIX-2] Los dos mundos, sumados y ROTULADOS. Sin migrados con dinero
  // (`_evtKH` en null) todo queda exactamente como estaba: mismos números,
  // mismo markup, ni una etiqueta de más.
  const kh = _evtKH;
  setTxt('evt-vendido',   _spFmtMxn(vendido   + (kh ? kh.vendido : 0)));
  setTxt('evt-cobrado',   _spFmtMxn(cobrado   + (kh ? kh.cobrado : 0)));
  // [CAP-FIX-2d] EL SIGNO, DICHO CON PALABRAS. Un "Por cobrar: $-793" se lee al
  // revés de lo que significa: nadie debe nada, la agencia trae 793 a favor de
  // los viajeros. Mismo número, misma verdad, etiqueta correcta — y vale para
  // los dos mundos, porque el neto es uno solo.
  const neto = porCobrar + (kh ? kh.deben - kh.aFavor : 0);
  setTxt('evt-porcobrar', _spFmtMxn(Math.abs(neto)));
  setTxt('evt-porcobrar-lbl', neto < 0 ? 'A favor' : 'Por cobrar');
  setTxt('evt-viajeros',  String(tours.length + (kh ? kh.filas : 0)));
  setTxt('evt-atrasados', String(atrasados));
  _capfix2Rotular(tours.length, kh);
  // [FIN-1c] La cuenta completa, con el evento ya resuelto.
  _fin1cPintar(String(((document.getElementById('selector-evento') || {}).value) || '').split('#')[0]);

  // Gastos + Utilidad del evento (G2). Match por BASE del evento_id (cuenta aunque el
  // evento sea multifecha). Los "General" (evento_id null) NO se incluyen aquí. Usa la
  // lista ya cacheada por _cobCargarGastos — sin llamada extra por evento.
  const evIdSel = (document.getElementById('selector-evento') || {}).value || '';
  const evBase  = evIdSel.split('#')[0];
  const gastosLista = (_gastosG2Cache && _gastosG2Cache.lista) || [];
  const gastosEvt = evBase
    ? gastosLista.reduce((a, g) => {
        const gBase = String(g.evento_id || '').split('#')[0];
        return (g.evento_id && gBase === evBase) ? a + Number(g.monto || 0) : a;
      }, 0)
    : 0;
  setTxt('evt-gastos', _spFmtMxn(gastosEvt));
  const evtUtil = vendido - gastosEvt;
  setTxt('evt-utilidad', _spFmtMxn(evtUtil));
  const elEvtUtil = document.getElementById('evt-utilidad');
  if (elEvtUtil) elEvtUtil.className = 'cob-stat-val ' + (evtUtil >= 0 ? 'green' : 'red');

  // Capa 3: Caja / Proyectado / Falta del evento + caja total empresa (admin-utilidad-evento).
  // Bloque aditivo, con visibilidad propia (independiente de tours.length).
  _renderUtilidadEvento(evBase);

  // [CAP-FIX-2] Los totales se muestran si hay ALGO que contar — del Portal o
  // del Excel. Atado solo a `tours.length`, un evento solo-KH calculaba bien sus
  // cifras y las dejaba en un bloque `display:none`: existían y no se veían, que
  // para Memo es exactamente lo mismo que no existir.
  // El DESGLOSE por paquete/zona sigue atado al Portal a propósito: se arma de
  // campos que las filas migradas no traen, y pintarlo vacío sería peor.
  const hayQueContar = tours.length || !!_evtKH;
  if (stats) stats.style.display = hayQueContar ? '' : 'none';
  if (desg)  desg.style.display  = tours.length ? '' : 'none';

  // Desglose por paquete (# viajeros + cobrado) y por zona (# viajeros).
  const porPaq = {};
  const porZona = {};
  tours.forEach(t => {
    const paq = t.paquete || '—';
    porPaq[paq] = porPaq[paq] || { n: 0, cobrado: 0 };
    porPaq[paq].n++;
    porPaq[paq].cobrado += Number((t.pago || {}).abonado || 0);
    const z = t.zona || '—';
    porZona[z] = (porZona[z] || 0) + 1;
  });
  const elPaq = document.getElementById('evt-por-paquete');
  if (elPaq) {
    const orden = ['PLUS', 'STAY', 'RIDE', 'CHEAP'];
    const claves = Object.keys(porPaq).sort((a, b) => {
      const ia = orden.indexOf(a), ib = orden.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    elPaq.innerHTML = claves.map(k => {
      const bg = _COB_PAQ_BG[k] || 'rgba(255,255,255,.06)';
      const fg = _COB_PAQ_FG[k] || 'var(--ts)';
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:4px;background:${bg};color:${fg}">${_spEscape(k)}</span>
        <span style="font-size:12px;color:var(--ts)">${porPaq[k].n} viaj. · <span style="color:var(--green)">${_spFmtMxn(porPaq[k].cobrado)}</span></span>
      </div>`;
    }).join('') || '<div style="font-size:12px;color:var(--ts)">—</div>';
  }
  const elZona = document.getElementById('evt-por-zona');
  if (elZona) {
    const claves = Object.keys(porZona).sort((a, b) => porZona[b] - porZona[a]);
    elZona.innerHTML = claves.map(z =>
      `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:12px">${_spEscape(z)}</span>
        <span style="font-size:12px;color:var(--ts)">${porZona[z]} viaj.</span>
      </div>`
    ).join('') || '<div style="font-size:12px;color:var(--ts)">—</div>';
  }

  // Tabla (con filtros de paquete y saldo).
  const paquete = document.getElementById('filtro-paquete').value;
  const saldo   = document.getElementById('filtro-saldo').value;
  let rows = tours.slice();
  if (paquete) rows = rows.filter(t => t.paquete === paquete);
  if (saldo === 'pendiente') rows = rows.filter(t => Number((t.pago || {}).restante || 0) > 0);
  if (saldo === 'liquidado') rows = rows.filter(t => Number((t.pago || {}).restante || 0) <= 0);
  _evtFiltrados = rows;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">·</div>Sin viajeros con esos filtros</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(t => {
    const c = t.clientes || {};
    const pago = t.pago || {};
    const paq = t.paquete || '';
    const atr = _cobEsAtrasado(t);
    const wa = _cobWaHref(t);
    const waCell = wa
      ? `<a class="btn btn-green btn-sm" href="${wa}" target="_blank" rel="noopener" style="font-size:11px;text-decoration:none">WhatsApp</a>`
      : `<span style="font-size:11px;color:var(--ts)">${_spEscape(c.celular || '—')}</span>`;
    const rowCls = atr ? 'cob-atrasado' : (t.estado === 'pagado' ? 'cob-pagado' : '');
    return `<tr class="${rowCls}">
      <td><div style="font-weight:600;font-size:13px">${_spEscape(c.nombre_completo || '—')}</div><div style="font-size:10px;color:var(--ts)">${_spEscape(c.correo || '')}</div></td>
      <td>${paq ? `<span style="font-size:10px;font-weight:700;padding:2px 10px;border-radius:4px;background:${_COB_PAQ_BG[paq]||'rgba(255,255,255,.06)'};color:${_COB_PAQ_FG[paq]||'var(--ts)'}">${_spEscape(paq)}</span>` : '—'}</td>
      <td style="font-size:12px">${_spEscape(t.zona || '—')}</td>
      <td style="font-weight:600">${_spFmtMxn(pago.total)}</td>
      <td style="color:var(--green)">${_spFmtMxn(pago.abonado)}</td>
      <td style="color:${(pago.restante||0) > 0 ? 'var(--orange)' : 'var(--green)'}">${_spFmtMxn(pago.restante)}</td>
      <td style="white-space:nowrap">${_spBadgeEstado(t.estado)}${atr ? '<span class="cob-badge-atraso">Atrasado</span>' : ''}</td>
      <td>${waCell}</td>
    </tr>`;
  }).join('');
}

// Exporta la tabla filtrada del evento reusando _cobExportCSV (mismo shape de tour).
function _evtExportCSV() {
  _cobFiltrados = _evtFiltrados || [];
  _cobExportCSV();
}

// ═══════════════════════════════════════════════════════════════
// GASTOS — reconstruido sobre el PORTAL (G1)
// Tabla public.gastos del portal, ligada a eventos del EV (igual que ingresos).
// Todo pasa por funciones admin con service_role; el cliente NO accede.
// ═══════════════════════════════════════════════════════════════
let _gastosSelectsPoblado = false;
let _gastosEVMap = {};   // evento_id (base o base#idx) -> { nombre, fecha }
let _gastosListCache = [];   // últimos gastos pintados (para editarGasto)
let _gastoEditId = null;     // id del gasto en edición; null = modo crear

// Puebla filtro-evento-gastos y gasto-evento desde EV (con multifecha), igual que
// Pagos/Por Evento. Conserva la primera opción de cada select (Todos / General) y
// llena _gastosEVMap para resolver el nombre del evento en la tabla.
async function _poblarSelectsGastos() {
  if (_gastosSelectsPoblado) return;
  const ev = await _fetchEVFromIndex();
  // [ORD-1] Antes: DESCENDENTE por ds — el más LEJANO primero y el próximo a
  // media lista. Ahora la regla compartida: próximos · sin fecha · pasados.
  const eventos = _evOrdenarPorFecha((ev || []).filter(e => e && e.id && e.a));
  const opciones = [];
  eventos.forEach(e => {
    if (Array.isArray(e.multifecha) && e.multifecha.length) {
      e.multifecha.forEach((mf, i) => {
        const lbl = (mf && mf.lbl) ? mf.lbl : ('Fecha ' + (i + 1));
        const id = e.id + '#' + i;
        _gastosEVMap[id] = { nombre: e.a, fecha: lbl };
        opciones.push({ value: id, label: e.a + ' · ' + lbl });
      });
    } else {
      _gastosEVMap[e.id] = { nombre: e.a, fecha: '' };
      opciones.push({ value: e.id, label: e.a });
    }
  });
  ['filtro-evento-gastos', 'gasto-evento'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);   // conserva la 1ª opción (Todos / General)
    opciones.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
  });
  _gastosSelectsPoblado = true;
}

// Nombre del evento para la tabla, resuelto desde EV. evento_id vacío = General.
function _gastoEventoLabel(eventoId) {
  if (!eventoId) return 'General';
  const map = _gastosEVMap[eventoId];
  if (!map) return eventoId;
  return map.fecha ? (map.nombre + ' · ' + map.fecha) : map.nombre;
}

async function loadGastos() {
 const tbody = document.getElementById('tabla-gastos');
 if (!tbody) return;
 await _poblarSelectsGastos();
 tbody.innerHTML = '<tr><td colspan="8"><div class="loading-state"><div class="spinner"></div>Cargando…</div></td></tr>';

 const evId = document.getElementById('filtro-evento-gastos').value;
 const cat = document.getElementById('filtro-cat-gastos').value;

 try {
 const r = await khAdminFetch('/.netlify/functions/admin-gastos-list', {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify({ evento_id: evId || undefined, categoria: cat || undefined }),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los gastos');
 // [AUD-1g] El catálogo llega del servidor, de la MISMA fuente que valida el
 // alta. El <select> del modal está vacío en el HTML a propósito.
 _gastoPoblarCategorias(d.categorias);
 const gastos = Array.isArray(d.gastos) ? d.gastos : [];
 _gastosListCache = gastos;   // para que editarGasto pre-llene desde memoria

 document.getElementById('g-total').textContent = _spFmtMxn(d.total || 0);
 document.getElementById('g-mes').textContent = _spFmtMxn(d.total_mes || 0);

 if (!gastos.length) {
 tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon"></div>Sin gastos registrados</div></td></tr>';
 return;
 }

 tbody.innerHTML = gastos.map(g => `<tr>
 <td style="font-size:12px">${fmtFecha(g.fecha)}</td>
 <td style="font-weight:600">${_spEscape(g.concepto)}</td>
 <td><span class="badge badge-gray">${_spEscape(g.categoria||'—')}</span></td>
 <td style="font-size:12px;color:var(--ts)">${_spEscape(_gastoEventoLabel(g.evento_id))}</td>
 <td style="color:var(--red);font-weight:600">${_spFmtMxn(g.monto)}</td>
 <td>${g.cuenta ? `<span class="badge badge-gray">${_spEscape(g.cuenta)}</span>` : '<span style="font-size:12px;color:var(--ts)">—</span>'}</td>
 <td style="font-size:12px">${_spEscape(g.metodo_pago||'—')}</td>
 <td style="white-space:nowrap">
 <button class="btn btn-ghost btn-sm" onclick="editarGasto('${g.id}')"><svg class="ic"><use href="#ic-lapiz"/></svg> Editar</button>
 ${_puedeBorrarAdmin() ? `<button class="btn btn-red btn-sm" onclick="eliminarGasto('${g.id}')"></button>` : ''}
 </td>
 </tr>`).join('');
 } catch(e) {
 tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert-error">${_spEscape(e.message)}</div></td></tr>`;
 }
}

// Abre el modal en modo CREAR: limpia el id de edición, vacía el form y restablece
// los textos del modal. Lo dispara el botón "+ Registrar Gasto".
// [AUD-1g] EL CATÁLOGO DE CATEGORÍAS, DE UNA SOLA FUENTE.
//
// La migración de FIN-1b escribió `boletos`, `hotel` y `transporte` en
// minúscula —y `hotel` ni siquiera existía en el catálogo—, así que los filtros
// por categoría los dejaban fuera EN SILENCIO. El servidor ahora los rechaza, y
// para que el select no pueda ofrecer algo que el servidor rechace, se llena con
// lo que el servidor manda.
//
// Si el catálogo no llegó, el select se queda VACÍO: sin categoría el gasto se
// guarda igual (es opcional), pero NO se puede elegir una inventada. Fail-closed.
let _gastoCategorias = null;
function _gastoPoblarCategorias(cats) {
  if (Array.isArray(cats) && cats.length) _gastoCategorias = cats.slice();
  const lista = _gastoCategorias || [];
  const sel = document.getElementById('gasto-categoria');
  if (sel) {
    const antes = sel.value;
    // [DEFAULTS-1] La primera va vacía. Sin ella el navegador elegía sola la
    // primera del catálogo —hoy **Transporte**— y un gasto capturado sin mirar
    // nacía clasificado ahí. No es cosmético: bajo la fórmula UTIL-C la CATEGORÍA
    // decide si el gasto entra en la utilidad (`Boletos` se excluye y se trata
    // como salida de caja), así que un default silencioso puede mover el número
    // más importante del sistema.
    sel.innerHTML = '<option value="">— elige categoría —</option>'
      + lista.map((c) => `<option>${_esfEsc(c)}</option>`).join('');
    // Se conserva lo que hubiera; si no había nada, se queda en la vacía.
    sel.value = (antes && lista.includes(antes)) ? antes : '';
  }
  // El filtro de la tabla conserva su primera opción ("Todas").
  const filtro = document.getElementById('filtro-cat-gastos');
  if (filtro) {
    const antes = filtro.value;
    while (filtro.options.length > 1) filtro.remove(1);
    lista.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; filtro.appendChild(o); });
    if (antes) filtro.value = antes;
  }
}

function nuevoGasto() {
 _gastoEditId = null;
 ['gasto-concepto', 'gasto-monto', 'gasto-fecha', 'gasto-notas'].forEach(id => {
   const el = document.getElementById(id); if (el) el.value = '';
 });
 // [FIN-1e-c] La fecha es OBLIGATORIA y llegaba vacía: el primer guardado de
 // cualquiera rebotaba. Default = HOY en hora de Monterrey con el helper de la
 // casa. JAMÁS toISOString: da la fecha de Greenwich, y pasadas las 6 de la
 // tarde de acá ya es mañana allá — en esta casa se trabaja de noche.
 const _gf = document.getElementById('gasto-fecha');
 if (_gf) _gf.value = _mxFechaStr();
 ['gasto-categoria', 'gasto-metodo', 'gasto-cuenta'].forEach(id => {
   const el = document.getElementById(id); if (el) el.selectedIndex = 0;
 // [UTIL-C-3] Un alta nueva no hereda la opción extra ni la marca de "elegida
 // a mano" que pudo dejar una edición anterior: si no se limpian, el siguiente
 // gasto general nace con la cuenta del gasto que se editó hace un minuto.
 const _ctaNueva = document.getElementById('gasto-cuenta');
 if (_ctaNueva) {
  const _ex = _ctaNueva.querySelector('option[data-extra]'); if (_ex) _ex.remove();
  _ctaNueva.dataset.tocado = '';
 }
 });
 // Método por default (Transferencia) con Banco (BBVA) visible.
 _gastoOnMetodoChange();
 const ev = document.getElementById('gasto-evento'); if (ev) ev.value = '';
 _fin1aOnEvento();   // [FIN-1a] sin evento elegido, el bloque de proveedor no existe
 const tit = document.getElementById('gasto-modal-title'); if (tit) tit.textContent = 'Registrar Gasto';
 const btn = document.getElementById('gasto-save-btn');   if (btn) btn.textContent = 'Guardar Gasto';
 openModal('modal-gasto');
}

// [UTIL-C-3] La cuenta de un gasto SIN EVENTO se elige, no se hereda. Un
// default silencioso cumple la letra de "cuenta obligatoria" y produce el dato
// equivocado: todos los gastos generales saldrían de BBVA porque nadie miró el
// selector. Es la lección de ETAPA 4 — quitar el default OBLIGÓ a exigirla.
// Si el capturista YA eligió una a mano, no se le pisa.
function _utilC3CuentaSegunEvento(ev) {
  const cta = document.getElementById('gasto-cuenta');
  const pista = document.getElementById('gasto-cuenta-pista');
  if (!cta) return;
  const sinEvento = !ev;
  if (sinEvento) {
    if (!cta.dataset.tocado) cta.value = '';
  } else if (!cta.value) {
    cta.value = 'BBVA';
  }
  if (pista) pista.style.display = sinEvento ? '' : 'none';
}

function _gastoOnCuentaChange() {
  const cta = document.getElementById('gasto-cuenta');
  if (cta) cta.dataset.tocado = cta.value ? '1' : '';
}

// [DEFAULTS-1] `gasto-metodo` e `ingreso-metodo` SE QUEDAN con su default
// («Transferencia»), y queda escrito por qué para que nadie los "arregle" por
// parecido con los otros tres:
//   · Un método de pago es una FORMA, no una atribución. Equivocarlo no le
//     imputa dinero a un tercero (como el proveedor), ni cambia si el gasto
//     entra en la utilidad (como la categoría), ni reparte permisos (el rol).
//   · Transferencia es lo que se usa casi siempre, y el campo está a la vista
//     con el selector de Banco colgando de él: si dijera Efectivo sin serlo, el
//     Banco desaparecería de la pantalla y se notaría al momento.
//   · `ev-banco` se queda por otra razón: su etiqueta DICE "BBVA (Default)". Un
//     default anunciado no es un default silencioso — el problema nunca fue que
//     hubiera un valor, sino que nadie supiera que lo había.
// Si algún día se re-litiga, que sea midiendo capturas reales, no por simetría.
//
// Muestra/oculta el selector de Banco según el método (igual que pagos): Transferencia
// y Depósito lo muestran (el dinero entra a un banco); Efectivo lo oculta (cuenta = 'Efectivo').
function _gastoOnMetodoChange() {
 const metodo = (document.getElementById('gasto-metodo') || {}).value || '';
 const wrap = document.getElementById('gasto-banco-wrap');
 if (wrap) wrap.style.display = (metodo === 'Efectivo') ? 'none' : '';
}

// Abre el modal en modo EDICIÓN, pre-llenado con el gasto (desde _gastosListCache).
// Guarda el id en _gastoEditId para que guardarGasto haga UPDATE en vez de INSERT.
async function editarGasto(id) {
 await _poblarSelectsGastos();   // garantiza que gasto-evento tenga las opciones
 const g = (_gastosListCache || []).find(x => String(x.id) === String(id));
 if (!g) { alert('No se encontró el gasto a editar'); return; }
 _gastoEditId = id;
 const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = (v == null ? '' : v); };
 set('gasto-concepto', g.concepto);
 set('gasto-monto',    g.monto);
 set('gasto-fecha',    g.fecha);
 set('gasto-categoria', g.categoria);
 // Método: solo los 3 válidos; si la cuenta fue 'Efectivo', el método queda en Efectivo.
 const _metodosGasto = ['Transferencia', 'Depósito', 'Efectivo'];
 let _metodoSel = _metodosGasto.includes(g.metodo_pago) ? g.metodo_pago : 'Transferencia';
 if (g.cuenta === 'Efectivo') _metodoSel = 'Efectivo';
 set('gasto-metodo', _metodoSel);
 // Banco: pre-selecciona la cuenta que el gasto TIENE.
 // [UTIL-C-3] Antes, una cuenta que el selector no podía representar (`Otro`)
 // caía en `selectedIndex = 0` = BBVA, y al guardar el gasto SALÍA DE OTRO
 // BANCO sin que nadie lo pidiera. Ahora se le hace lugar en la lista: la
 // edición no puede cambiar un dato que nadie tocó.
 const _ctaEl = document.getElementById('gasto-cuenta');
 if (_ctaEl) {
 const _prev = _ctaEl.querySelector('option[data-extra]');
 if (_prev) _prev.remove();
 const _c = (typeof g.cuenta === 'string') ? g.cuenta.trim() : '';
 if (_c && !['BBVA', 'Banamex'].includes(_c) && _c !== 'Efectivo') {
 const o = document.createElement('option');
 o.value = _c; o.textContent = _c; o.setAttribute('data-extra', '1');
 _ctaEl.appendChild(o);
 }
 _ctaEl.value = _c && _c !== 'Efectivo' ? _c : '';
 // Se marca como elegida a mano para que abrir el modal no la vacíe.
 _ctaEl.dataset.tocado = _ctaEl.value ? '1' : '';
 }
 _gastoOnMetodoChange();  // muestra/oculta el Banco según el método elegido
 set('gasto-evento',   g.evento_id || '');
 set('gasto-notas',    g.notas);
 const tit = document.getElementById('gasto-modal-title'); if (tit) tit.textContent = 'Editar Gasto';
 const btn = document.getElementById('gasto-save-btn');   if (btn) btn.textContent = 'Guardar Cambios';
 openModal('modal-gasto');
}

// 💰 CAP3-1 — ESPEJO del tope del servidor (_lib/monto-limites, $500,000 por
// partida). El servidor sigue siendo la autoridad; esto solo evita que el
// usuario reciba un error crudo del backend después de teclear todo el formulario.
// Si algún día cambia el tope, se cambia en los DOS lados.
const MONTO_MAX_MXN = 500000;
function _montoFueraDeRango(monto) {
  if (!Number.isFinite(monto) || monto <= MONTO_MAX_MXN) return null;
  const f = (n) => '$' + Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  return `${f(monto)} se ve fuera de rango (máximo ${f(MONTO_MAX_MXN)} por partida). `
       + 'Revisa el monto — si de verdad es correcto, captúralo en dos partidas.';
}

// ═══════════════════════════════════════════════════════════════════════════
// [FIN-1a] EL GASTO QUE ALIMENTA LOS DOS LIBROS
//
// Memo: "hoy el Palacio me pide meter el gasto del proveedor y luego su pago:
// es trabajar el doble". Un movimiento de dinero real = una captura. Si el gasto
// va dirigido a un proveedor con deuda, este mismo guardado la abona.
//
// La deuda se calcula con las acciones que YA existen (compras + servicios −
// abonos, igual que el Palacio) y se cachea por evento: elegir proveedor no
// dispara llamadas nuevas.
// ═══════════════════════════════════════════════════════════════════════════
let _fin1aProvs = null;          // catálogo KH (se pide una vez por sesión)
let _fin1aDeuda = { ev: null };  // { ev, porProv:{pid:{nombre,deuda}} }

function _fin1aPuede() { return (currentUser || {}).rol === 'maestro_roshi'; }

// Elegir evento manda: sin evento no hay deuda que abonar (la deuda es POR
// evento), así que el bloque entero desaparece en vez de ofrecer algo imposible.
async function _fin1aOnEvento() {
  const wrap = document.getElementById('fin1a-wrap');
  const sel = document.getElementById('gasto-proveedor');
  const caja = document.getElementById('fin1a-caja');
  if (!wrap || !sel) return;
  const ev = (document.getElementById('gasto-evento') || {}).value || '';
  if (caja) { caja.style.display = 'none'; caja.innerHTML = ''; }
  // [UTIL-C-3] Sin evento, la cuenta se vacía para que se elija a mano; con
  // evento vuelve el default de siempre. El servidor rechaza igual — esto solo
  // hace que el rechazo no llegue por sorpresa.
  _utilC3CuentaSegunEvento(ev);
  sel.value = '';
  if (!ev || !_fin1aPuede()) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  try {
    if (!_fin1aProvs) {
      // La MISMA llamada que usa el Palacio (no hay helper `khProveedores`:
      // lo comprobé en vez de suponerlo).
      const rp = await khAdminFetch('/.netlify/functions/admin-proveedores', {
        method: 'POST', body: JSON.stringify({ accion: 'listar' }),
      });
      const dp = await rp.json().catch(() => ({}));
      if (!rp.ok || !dp.ok) throw new Error(dp.error || 'No se pudo cargar el catálogo');
      _fin1aProvs = dp.proveedores || [];
    }
    sel.innerHTML = '<option value="">— No va a ningún proveedor —</option>'
      + (_fin1aProvs || []).map((p) => `<option value="${_esfEsc(p.id)}">${_esfEsc(p.nombre)}</option>`).join('');
    await _fin1aCargarDeuda(ev.split('#')[0]);
  } catch (e) {
    sel.innerHTML = '<option value="">— No se pudo cargar el catálogo —</option>';
  }
}

// Deuda por proveedor del evento: COMPRAS − ABONOS. La MISMA aritmética que el
// Palacio y que `_lib/cuenta-evento`; si divergiera, el número de la cajita
// mentiría. [KMS-SIMP-4] Ya no suma servicios: se pagan al momento, son gastos.
async function _fin1aCargarDeuda(evBase) {
  if (_fin1aDeuda.ev === evBase) return;
  const post = (accion, extra) => khAdminFetch('/.netlify/functions/admin-compras', {
    method: 'POST', body: JSON.stringify(Object.assign({ accion, evento_id: evBase }, extra || {})),
  }).then((r) => r.json()).catch(() => ({}));
  const [c, ab] = await Promise.all([
    post('listar'),
    khAdminFetch('/.netlify/functions/admin-abonos', {
      method: 'POST', body: JSON.stringify({ accion: 'listar', evento_id: evBase }),
    }).then((r) => r.json()).catch(() => ({})),
  ]);
  const porProv = {};
  const suma = (pid, nombre, monto) => {
    if (!pid) return;
    if (!porProv[pid]) porProv[pid] = { nombre: nombre || '—', deuda: 0 };
    porProv[pid].deuda += monto;
  };
  (c.compras || []).forEach((x) => suma(x.proveedor_id, x.proveedor_nombre, (parseInt(x.cantidad, 10) || 0) * (Number(x.costo_unitario) || 0)));
  (ab.abonos || []).forEach((x) => suma(x.proveedor_id, x.proveedor_nombre, -(Number(x.monto) || 0)));
  _fin1aDeuda = { ev: evBase, porProv };
}

// La cajita de verdad. Se pinta con lo que YA se cargó: cero llamadas al elegir.
function _fin1aOnProveedor() {
  const caja = document.getElementById('fin1a-caja');
  const pid = (document.getElementById('gasto-proveedor') || {}).value || '';
  if (!caja) return;
  if (!pid) { caja.style.display = 'none'; caja.innerHTML = ''; return; }
  const info = (_fin1aDeuda.porProv || {})[pid] || null;
  const monto = parseFloat((document.getElementById('gasto-monto') || {}).value);
  const hayMonto = Number.isFinite(monto) && monto > 0;
  caja.style.display = '';

  // Sin dato de deuda NO se inventa un cero: se dice que no se pudo saber.
  if (!info) {
    caja.innerHTML = `<div class="fin1a-l">No pude leer la deuda de este proveedor en el evento.</div>
      <label class="fin1a-chk"><input type="checkbox" id="gasto-abonar" checked> Abonar también a su deuda</label>`;
    return;
  }
  const queda = info.deuda - (hayMonto ? monto : 0);
  caja.innerHTML = `
    <div class="fin1a-l"><b>${_esfEsc(info.nombre)}</b> tiene <b class="fin1a-n">${_kamMoney(info.deuda)}</b> de deuda en este evento.
      ${hayMonto ? `Con este gasto quedaría en <b class="fin1a-n ${queda < 0 ? 'fin1a-neg' : ''}">${_kamMoney(queda)}</b>.` : '<span class="fin1a-op">Escribe el monto para ver cómo queda.</span>'}
      ${queda < 0 ? '<div class="fin1a-aviso">Le estarías pagando más de lo que le debes en este evento.</div>' : ''}
    </div>
    <label class="fin1a-chk"><input type="checkbox" id="gasto-abonar" checked> Abonar también a su deuda</label>`;
}

async function guardarGasto() {
 const concepto = document.getElementById('gasto-concepto').value.trim();
 const monto = parseFloat(document.getElementById('gasto-monto').value);
 const _fdr = _montoFueraDeRango(monto);
 if (_fdr) { showToast(_fdr, 'error'); return; }   // [CAP3-1] espejo del servidor
 const fecha = document.getElementById('gasto-fecha').value;
 const categoria = document.getElementById('gasto-categoria').value;
 const evId = document.getElementById('gasto-evento').value;
 const metodo = document.getElementById('gasto-metodo').value;
 // Cuenta = a dónde entró el dinero: Efectivo → 'Efectivo'; si no, el Banco elegido.
 const banco = document.getElementById('gasto-cuenta').value;
 const cuenta = (metodo === 'Efectivo') ? 'Efectivo' : banco;
 const notas = document.getElementById('gasto-notas').value;
 const alerta = document.getElementById('gasto-alert');

 if (!concepto || !(monto >= 0) || !fecha) {
 alerta.innerHTML = '<div class="alert alert-error">Concepto, monto y fecha son obligatorios</div>';
 return;
 }
 // [UTIL-C-3] Espejo del servidor, palabra por palabra: un gasto sin evento
 // resta de la utilidad de toda la empresa, así que tiene que decir de qué caja
 // salió. El servidor rechaza igual; esto solo evita el viaje.
 // [DEFAULTS-1] La categoría se elige. El servidor la acepta VACÍA a propósito
 // (`_lib/categorias-gasto` dice "la categoría es opcional", decisión de AUD-1g
 // que NO se toca: hay filas viejas sin ella). Esta guarda es del CAPTURISTA y
 // puede ser más estricta que el servidor sin contradecirlo: no se prohíbe que
 // EXISTA un gasto sin categoría, se prohíbe que nazca uno HOY sin que nadie
 // haya elegido.
 if (!categoria) {
  alerta.innerHTML = '<div class="alert alert-error">Elige la categoría: es la que decide si este gasto entra en la utilidad del evento.</div>';
  const _c = document.getElementById('gasto-categoria'); if (_c) { try { _c.focus(); } catch (_) { /* igual se ve el error */ } }
  return;
 }

 if (!evId && !cuenta) {
 alerta.innerHTML = '<div class="alert alert-error">Un gasto sin evento resta de la utilidad de toda la empresa: hay que decir de qué cuenta salió.</div>';
 return;
 }

 const editando = !!_gastoEditId;
 const url = editando ? '/.netlify/functions/admin-gasto-editar' : '/.netlify/functions/admin-gasto-crear';
 const payload = {
 concepto, monto, fecha, categoria, metodo_pago: metodo,
 cuenta: cuenta || undefined,
 evento_id: evId || undefined, notas: notas || undefined
 };
 // [FIN-1a] El proveedor solo viaja si de verdad hay uno elegido: sin él, el
 // cuerpo es byte-idéntico al de siempre y el servidor no toca KH.
 const _f1Prov = (document.getElementById('gasto-proveedor') || {}).value || '';
 if (_f1Prov && !editando) {
   payload.proveedor_id = _f1Prov;
   payload.abonar = !!(document.getElementById('gasto-abonar') || {}).checked;
 }
 if (editando) payload.id = _gastoEditId;

 try {
 const r = await fetch(url, {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify(payload),
 });
 const d = await r.json();
 if (!r.ok) {
   // [UTIL-B-2] El servidor puede decir CUÁL campo falta (el proveedor en un
   // pago de boletos). Si lo dice, se enseña con su detalle en vez del error
   // pelón: "falta algo" no le dice a nadie qué hacer.
   const msg = d.detalle ? `${d.error} ${d.detalle}` : (d.error || (editando ? 'No se pudo actualizar el gasto' : 'No se pudo registrar el gasto'));
   throw new Error(msg);
 }
 // [UTIL-B-3] El aviso de "no aparecerá en Gastos" se retira con la supresión
 // que lo motivaba: el pago de boletos SÍ vuelve a dejar su fila. Lo que se
 // conserva es decir que ADEMÁS abonó, porque eso sigue siendo cierto y es la
 // mitad que no se ve en esta pantalla.
 alerta.innerHTML = `<div class="alert alert-success">${editando ? 'Gasto actualizado' : 'Gasto registrado'}${(!editando && d.abono_id) ? ' · <b>abonado</b> a la deuda del proveedor' : ''}</div>`;
 _gastoEditId = null;
 setTimeout(() => { closeModal('modal-gasto'); loadGastos(); }, 1000);
 } catch(e) {
 alerta.innerHTML = `<div class="alert alert-error">${_spEscape(e.message)}</div>`;
 }
}

async function eliminarGasto(id) {
 if (!confirm('¿Eliminar este gasto?')) return;
 try {
 const r = await khAdminFetch('/.netlify/functions/admin-gasto-eliminar', {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify({ id }),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || 'No se pudo eliminar el gasto');
 loadGastos();
 } catch(e) { alert(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// INGRESOS (S2 — entradas sueltas; clon del módulo Gastos)
// ═══════════════════════════════════════════════════════════════
let _ingresosSelectsPoblado = false;
let _ingresosEVMap = {};       // evento_id (base o base#idx) -> { nombre, fecha }
let _ingresosClientesMap = {}; // cliente_id (uuid) -> { nombre, celular }
let _ingresosListCache = [];   // últimos ingresos pintados (para editarIngreso)
let _ingresoEditId = null;     // id del ingreso en edición; null = modo crear

// Puebla los selects de evento (filtro + modal) desde EV y el select de cliente
// desde admin-clientes-min; llena los mapas para resolver nombres en la tabla.
async function _poblarSelectsIngresos() {
  if (_ingresosSelectsPoblado) return;

  // ── Eventos desde EV (igual que gastos) ──
  const ev = await _fetchEVFromIndex();
  // [ORD-1] Antes: DESCENDENTE por ds — el más LEJANO primero y el próximo a
  // media lista. Ahora la regla compartida: próximos · sin fecha · pasados.
  const eventos = _evOrdenarPorFecha((ev || []).filter(e => e && e.id && e.a));
  const opciones = [];
  eventos.forEach(e => {
    if (Array.isArray(e.multifecha) && e.multifecha.length) {
      e.multifecha.forEach((mf, i) => {
        const lbl = (mf && mf.lbl) ? mf.lbl : ('Fecha ' + (i + 1));
        const id = e.id + '#' + i;
        _ingresosEVMap[id] = { nombre: e.a, fecha: lbl };
        opciones.push({ value: id, label: e.a + ' · ' + lbl });
      });
    } else {
      _ingresosEVMap[e.id] = { nombre: e.a, fecha: '' };
      opciones.push({ value: e.id, label: e.a });
    }
  });
  ['filtro-evento-ingresos', 'ingreso-evento'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);   // conserva la 1ª opción (Todos / Sin evento)
    opciones.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
  });

  // ── Clientes desde admin-clientes-min (solo para el select del modal) ──
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-clientes-min', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({}),
    });
    const d = await r.json();
    if (r.ok) {
      const clientes = Array.isArray(d.clientes) ? d.clientes : [];
      const selCli = document.getElementById('ingreso-cliente');
      clientes.forEach(c => {
        _ingresosClientesMap[c.id] = { nombre: c.nombre_completo, celular: c.celular };
        if (selCli) {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = (c.nombre_completo || 'Cliente') + (c.celular ? (' — ' + c.celular) : '');
          selCli.appendChild(opt);
        }
      });
    }
  } catch (e) { /* el select de cliente queda solo con "— (ninguno) —" */ }

  _ingresosSelectsPoblado = true;
}

// Nombre del evento para la tabla, resuelto desde EV. evento_id vacío = sin evento.
function _ingresoEventoLabel(eventoId) {
  if (!eventoId) return '—';
  const map = _ingresosEVMap[eventoId];
  if (!map) return eventoId;
  return map.fecha ? (map.nombre + ' · ' + map.fecha) : map.nombre;
}

// Nombre del cliente para la tabla, resuelto desde la lista de clientes.
function _ingresoClienteLabel(clienteId) {
  if (!clienteId) return '—';
  const c = _ingresosClientesMap[clienteId];
  return c ? c.nombre : '—';
}

async function loadIngresos() {
 const tbody = document.getElementById('tabla-ingresos');
 if (!tbody) return;
 await _poblarSelectsIngresos();
 tbody.innerHTML = '<tr><td colspan="9"><div class="loading-state"><div class="spinner"></div>Cargando…</div></td></tr>';

 const evId = document.getElementById('filtro-evento-ingresos').value;
 const cat = document.getElementById('filtro-cat-ingresos').value;

 try {
 const r = await khAdminFetch('/.netlify/functions/admin-ingresos-list', {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify({ evento_id: evId || undefined, categoria: cat || undefined }),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los ingresos');
 const ingresos = Array.isArray(d.ingresos) ? d.ingresos : [];
 _ingresosListCache = ingresos;   // para que editarIngreso pre-llene desde memoria

 document.getElementById('i-total').textContent = _spFmtMxn(d.total || 0);
 document.getElementById('i-mes').textContent = _spFmtMxn(d.total_mes || 0);

 if (!ingresos.length) {
 tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon"></div>Sin ingresos registrados</div></td></tr>';
 return;
 }

 tbody.innerHTML = ingresos.map(g => `<tr>
 <td style="font-size:12px">${fmtFecha(g.fecha)}</td>
 <td style="font-weight:600">${_spEscape(g.concepto)}</td>
 <td><span class="badge badge-gray">${_spEscape(g.categoria||'—')}</span></td>
 <td style="font-size:12px;color:var(--ts)">${_spEscape(_ingresoClienteLabel(g.cliente_id))}</td>
 <td style="font-size:12px;color:var(--ts)">${_spEscape(_ingresoEventoLabel(g.evento_id))}</td>
 <td style="color:var(--green);font-weight:600">${_spFmtMxn(g.monto)}</td>
 <td>${g.cuenta ? `<span class="badge badge-gray">${_spEscape(g.cuenta)}</span>` : '<span style="font-size:12px;color:var(--ts)">—</span>'}</td>
 <td style="font-size:12px">${_spEscape(g.metodo_pago||'—')}</td>
 <td style="white-space:nowrap">
 <button class="btn btn-ghost btn-sm" onclick="editarIngreso('${g.id}')"><svg class="ic"><use href="#ic-lapiz"/></svg> Editar</button>
 ${_puedeBorrarAdmin() ? `<button class="btn btn-red btn-sm" onclick="eliminarIngreso('${g.id}')"></button>` : ''}
 </td>
 </tr>`).join('');
 } catch(e) {
 tbody.innerHTML = `<tr><td colspan="9"><div class="alert alert-error">${_spEscape(e.message)}</div></td></tr>`;
 }
}

// Abre el modal en modo CREAR: limpia el id de edición, vacía el form y restablece
// los textos del modal. Lo dispara el botón "+ Registrar Ingreso".
// [ET4] La captura rápida de ingresos. Tres cambios, y los tres son de dinero:
//
//  1. ABRE AL INSTANTE. Antes la última línea era
//     `_poblarSelectsIngresos().then(() => openModal(...))`: el modal esperaba a
//     que bajaran el catálogo (index.html entero) y la lista de clientes.
//     Medido con red lenta y picando el botón en cuanto aparece —que es como se
//     captura cuando hay prisa— tardaba 740 ms en verse. Ahora se pinta PRIMERO
//     y los catálogos llegan detrás, igual que el modal de gasto.
//  2. FECHA = HOY en hora de México, con `_mxFechaStr()`. JAMÁS `toISOString`:
//     da la de Greenwich y en esta casa se trabaja de noche. Queda editable.
//  3. EVENTO y CUENTA SIN DEFAULT. Un default silencioso mete el dinero en el
//     evento —o en el banco— equivocado sin que nadie lo note. Se eligen a mano.
function nuevoIngreso() {
 _ingresoEditId = null;
 ['ingreso-concepto', 'ingreso-monto', 'ingreso-notas'].forEach(id => {
   const el = document.getElementById(id); if (el) el.value = '';
 });
 const _if = document.getElementById('ingreso-fecha');
 if (_if) _if.value = _mxFechaStr();
 ['ingreso-categoria', 'ingreso-metodo'].forEach(id => {
   const el = document.getElementById(id); if (el) el.selectedIndex = 0;
 });
 // Método por default (Transferencia) con el Banco visible… pero SIN banco
 // elegido: la cuenta se escoge a mano (su primera opción es el marcador vacío).
 const cta = document.getElementById('ingreso-cuenta'); if (cta) cta.value = '';
 _ingresoOnMetodoChange();
 const ev = document.getElementById('ingreso-evento'); if (ev) ev.value = '';
 const cli = document.getElementById('ingreso-cliente'); if (cli) cli.value = '';
 const nw = document.getElementById('ingreso-notas-wrap'); if (nw) nw.open = false;
 const tit = document.getElementById('ingreso-modal-title'); if (tit) tit.textContent = 'Registrar Ingreso';
 const btn = document.getElementById('ingreso-save-btn');   if (btn) btn.textContent = 'Guardar Ingreso';
 openModal('modal-ingreso');
 // Los catálogos, DETRÁS del pintado. Si ya estaban poblados no cuesta nada; si
 // no, las opciones aparecen solas en un parpadeo y el capturador ya está
 // escribiendo el concepto. Fails-soft: un tropiezo aquí no cierra el modal.
 _poblarSelectsIngresos().catch(() => {});
}

// Muestra/oculta el selector de Banco según el método (igual que gastos): Transferencia
// y Depósito lo muestran; Efectivo lo oculta (cuenta = 'Efectivo').
function _ingresoOnMetodoChange() {
 const metodo = (document.getElementById('ingreso-metodo') || {}).value || '';
 const wrap = document.getElementById('ingreso-banco-wrap');
 if (wrap) wrap.style.display = (metodo === 'Efectivo') ? 'none' : '';
}

// Abre el modal en modo EDICIÓN, pre-llenado con el ingreso (desde _ingresosListCache).
// Guarda el id en _ingresoEditId para que guardarIngreso haga UPDATE en vez de INSERT.
async function editarIngreso(id) {
 await _poblarSelectsIngresos();   // garantiza que evento/cliente tengan opciones
 const g = (_ingresosListCache || []).find(x => String(x.id) === String(id));
 if (!g) { alert('No se encontró el ingreso a editar'); return; }
 _ingresoEditId = id;
 const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = (v == null ? '' : v); };
 set('ingreso-concepto', g.concepto);
 set('ingreso-monto',    g.monto);
 set('ingreso-fecha',    g.fecha);
 set('ingreso-categoria', g.categoria);
 // Método: solo los 3 válidos; si la cuenta fue 'Efectivo', el método queda en Efectivo.
 const _metodosIngreso = ['Transferencia', 'Depósito', 'Efectivo'];
 let _metodoSel = _metodosIngreso.includes(g.metodo_pago) ? g.metodo_pago : 'Transferencia';
 if (g.cuenta === 'Efectivo') _metodoSel = 'Efectivo';
 set('ingreso-metodo', _metodoSel);
 // [ET4] Banco: pre-selecciona BBVA/Banamex si así se guardó. Si no, cae en el
 // MARCADOR VACÍO — porque desde ET4 la primera opción del select ya no es BBVA
 // sino "— elige la cuenta —". El comentario viejo decía "default (BBVA)" y
 // dejó de ser cierto en el momento en que se agregó el marcador: hoy un
 // ingreso viejo sin cuenta reconocible NO cae a un banco en silencio, se queda
 // sin elegir y el guardado lo exige. (El comentario gemelo de GASTOS sigue
 // diciendo "default (BBVA)" y ahí SÍ es verdad: ese select no tiene marcador.)
 if (g.cuenta === 'BBVA' || g.cuenta === 'Banamex') set('ingreso-cuenta', g.cuenta);
 else document.getElementById('ingreso-cuenta').selectedIndex = 0;
 _ingresoOnMetodoChange();  // muestra/oculta el Banco según el método elegido
 set('ingreso-evento',  g.evento_id || '');
 set('ingreso-cliente', g.cliente_id || '');
 set('ingreso-notas',   g.notas);
 const tit = document.getElementById('ingreso-modal-title'); if (tit) tit.textContent = 'Editar Ingreso';
 const btn = document.getElementById('ingreso-save-btn');   if (btn) btn.textContent = 'Guardar Cambios';
 openModal('modal-ingreso');
}

async function guardarIngreso() {
 const concepto = document.getElementById('ingreso-concepto').value.trim();
 const monto = parseFloat(document.getElementById('ingreso-monto').value);
 const _fdr = _montoFueraDeRango(monto);
 if (_fdr) { showToast(_fdr, 'error'); return; }   // [CAP3-1] espejo del servidor
 const fecha = document.getElementById('ingreso-fecha').value;
 const categoria = document.getElementById('ingreso-categoria').value;
 const evId = document.getElementById('ingreso-evento').value;
 const clienteId = document.getElementById('ingreso-cliente').value;
 const metodo = document.getElementById('ingreso-metodo').value;
 // Cuenta = a dónde entró el dinero: Efectivo → 'Efectivo'; si no, el Banco elegido.
 const banco = document.getElementById('ingreso-cuenta').value;
 const cuenta = (metodo === 'Efectivo') ? 'Efectivo' : banco;
 const notas = document.getElementById('ingreso-notas').value;
 const alerta = document.getElementById('ingreso-alert');

 if (!concepto || !(monto >= 0) || !fecha) {
 alerta.innerHTML = '<div class="alert alert-error">Concepto, monto y fecha son obligatorios</div>';
 return;
 }
 // [DEFAULTS-1] La categoría se elige. Aquí la guarda del navegador es la
 // ÚNICA que hay: `admin-ingreso-crear` NO valida la categoría contra ningún
 // catálogo —solo la recorta a 60— así que un vacío se guardaría como null sin
 // avisar. Queda dicho en el reporte: el catálogo de ingresos no tiene lib.
 if (!categoria) {
  alerta.innerHTML = '<div class="alert alert-error">Elige la categoría del ingreso.</div>';
  const _c = document.getElementById('ingreso-categoria'); if (_c) { try { _c.focus(); } catch (_) { /* igual se ve el error */ } }
  return;
 }

 // [ET4] La cuenta ya no llega preseleccionada, así que ahora se EXIGE: sin
 // esto, quitar el default habría dejado pasar ingresos sin banco — cambiar un
 // default silencioso por un hueco silencioso no arregla nada.
 if (metodo !== 'Efectivo' && !banco) {
 alerta.innerHTML = '<div class="alert alert-error">Elige la cuenta donde entró el dinero</div>';
 return;
 }

 const editando = !!_ingresoEditId;
 const url = editando ? '/.netlify/functions/admin-ingreso-editar' : '/.netlify/functions/admin-ingreso-crear';
 const payload = {
 concepto, monto, fecha, categoria, metodo_pago: metodo,
 cuenta: cuenta || undefined,
 evento_id: evId || undefined, cliente_id: clienteId || undefined, notas: notas || undefined
 };
 if (editando) payload.id = _ingresoEditId;

 try {
 const r = await fetch(url, {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify(payload),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || (editando ? 'No se pudo actualizar el ingreso' : 'No se pudo registrar el ingreso'));
 alerta.innerHTML = `<div class="alert alert-success">${editando ? 'Ingreso actualizado' : 'Ingreso registrado'}</div>`;
 _ingresoEditId = null;
 setTimeout(() => { closeModal('modal-ingreso'); loadIngresos(); }, 1000);
 } catch(e) {
 alerta.innerHTML = `<div class="alert alert-error">${_spEscape(e.message)}</div>`;
 }
}

async function eliminarIngreso(id) {
 if (!confirm('¿Eliminar este ingreso?')) return;
 try {
 const r = await khAdminFetch('/.netlify/functions/admin-ingreso-eliminar', {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify({ id }),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || 'No se pudo eliminar el ingreso');
 loadIngresos();
 } catch(e) { alert(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SALDOS (S3 — visor de saldos por cuenta; solo LECTURA vía admin-saldos)
// ═══════════════════════════════════════════════════════════════
let _saldosData = null;
let _saldoDetalleActivo = null;   // nombre de la cuenta con detalle abierto, o null

async function loadSaldos() {
 const el = document.getElementById('saldos-content');
 if (!el) return;
 _saldoDetalleActivo = null;
 const panel = document.getElementById('saldo-detalle-panel');
 if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
 el.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
 try {
 const r = await khAdminFetch('/.netlify/functions/admin-saldos', {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify({}),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los saldos');
 _saldosData = d;
 _renderSaldos(d);
 } catch(e) {
 el.innerHTML = `<div class="alert alert-error">${_spEscape(e.message)}</div>`;
 }
}

function _renderSaldos(d) {
 const el = document.getElementById('saldos-content');
 if (!el) return;
 const cuentas = d.cuentas || {};
 const orden = ['BBVA', 'Banamex', 'Efectivo'];
 const cards = orden.map(nombre => {
   const c = cuentas[nombre] || { entradas: 0, salidas: 0, saldo: 0 };
   const saldoColor = (Number(c.saldo) >= 0) ? 'var(--green)' : 'var(--red)';
   return `<div class="card saldo-card" style="cursor:pointer" onclick="_toggleSaldoDetalle('${nombre}')">
     <div style="display:flex;justify-content:space-between;align-items:center">
       <div style="font-weight:700;letter-spacing:.04em">${_esfEsc(nombre)}</div>
       <span style="font-size:11px;color:var(--ts)">ver detalle ▾</span>
     </div>
     <div style="font-size:28px;font-weight:800;color:${saldoColor};margin:10px 0 6px">${_spFmtMxn(c.saldo)}</div>
     <div style="font-size:12px;color:var(--ts)">Entradas ${_spFmtMxn(c.entradas)} · Salidas ${_spFmtMxn(c.salidas)}</div>
   </div>`;
 }).join('');
 const grid = `<div class="metrics-grid">${cards}</div>`;

 let pie = '';
 if (Number(d.otros_total || 0) !== 0) {
   pie = `<div style="font-size:12px;color:var(--ts);margin-top:12px">${_spFmtMxn(d.otros_total)} en Otro/sin cuenta (no mostrado en las tarjetas).</div>`;
 }

 // [SAL-1] DOS LETREROS QUE NO SE PUEDEN CALLAR.
 //
 // (1) Si el dinero migrado no se pudo leer, estas tarjetas están incompletas —
 //     y una tarjeta incompleta que se presenta como completa es exactamente el
 //     bug de esta tuerca. Se dice.
 // (2) Lo que no se pudo repartir a una cuenta NO se reparte a ciegas: se
 //     imprime, con su monto, sus filas y el motivo. Si algún día deja de valer
 //     $0, se ve — que es lo contrario de desaparecer.
 const m = d.migrados;
 if (d.migrados_error) {
   pie += `<div class="sal1-aviso">No pude leer el dinero de los migrados del Excel, así que estos saldos están <b>incompletos</b> (solo el Portal).</div>`;
 } else if (m && m.ve_migrados) {
   const sc = m.sin_clasificar || {};
   if (Number(sc.monto || 0) !== 0 || Number(sc.filas || 0) !== 0) {
     pie += `<div class="sal1-aviso"><b>${_spFmtMxn(sc.monto || 0)}</b> de migrados sin cuenta identificada
       (${sc.filas} ${sc.filas === 1 ? 'viajero' : 'viajeros'}) — <b>no</b> están repartidos en las tarjetas de arriba.
       ${(sc.motivos || []).length ? 'Motivo: ' + _esfEsc(sc.motivos.join(' · ')) : ''}</div>`;
   }
   if (Number(m.total || 0) !== 0) {
     pie += `<div style="font-size:12px;color:var(--ts);margin-top:8px">Incluye <b>${_spFmtMxn(m.total)}</b> cobrado a migrados del Excel, repartido por paquete (CHEAP a Banamex, los demás al banco del evento).</div>`;
   }
 }
 const stamp = d.generado_at ? `<div style="font-size:11px;color:var(--ts);margin-top:6px">Actualizado: ${_spFmtFechaAbs(d.generado_at)}</div>` : '';
 el.innerHTML = grid + pie + stamp;
}

// Abre/cierra el panel de detalle (compartido, debajo de las tarjetas) para una cuenta.
function _toggleSaldoDetalle(nombre) {
 const panel = document.getElementById('saldo-detalle-panel');
 if (!panel || !_saldosData) return;
 if (_saldoDetalleActivo === nombre) {   // clic en la misma → cerrar
   panel.style.display = 'none';
   panel.innerHTML = '';
   _saldoDetalleActivo = null;
   return;
 }
 const c = (_saldosData.cuentas || {})[nombre];
 if (!c) return;
 _saldoDetalleActivo = nombre;
 panel.innerHTML = `<div style="font-weight:700;margin-bottom:12px">Detalle · ${_esfEsc(nombre)}</div>` + _renderSaldoDetalle(c);
 panel.style.display = '';
}

function _renderSaldoDetalle(c) {
 const linea = (izq, monto, color) =>
   `<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;padding:3px 0">
      <span>${izq}</span><span style="color:${color};white-space:nowrap">${monto}</span>
    </div>`;
 const seccion = (titulo, subtotal, color, filas) =>
   `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-weight:600;font-size:13px;margin-bottom:4px">
        <span>${_esfEsc(titulo)}</span><span style="color:${color}">${subtotal}</span>
      </div>${filas}
    </div>`;

 const pagosFilas = (c.pagos || []).length
   ? c.pagos.map(p => linea(`${fmtFecha(p.fecha)} · ${_spEscape(p.cliente || '—')}${p.evento ? (' · ' + _spEscape(p.evento)) : ''}`, _spFmtMxn(p.monto), 'var(--green)')).join('')
   : '<div style="font-size:12px;color:var(--ts)">Sin pagos cobrados</div>';
 const ingFilas = (c.ingresos || []).length
   ? c.ingresos.map(i => linea(`${fmtFecha(i.fecha)} · ${_spEscape(i.concepto || '—')}`, _spFmtMxn(i.monto), 'var(--green)')).join('')
   : '<div style="font-size:12px;color:var(--ts)">Sin ingresos sueltos</div>';
 const gasFilas = (c.gastos || []).length
   ? c.gastos.map(g => linea(`${fmtFecha(g.fecha)} · ${_spEscape(g.concepto || '—')}`, '−' + _spFmtMxn(g.monto), 'var(--red)')).join('')
   : '<div style="font-size:12px;color:var(--ts)">Sin gastos</div>';

 // [SAL-1] Los migrados NO traen renglones: `abonos_viajero` no guarda la cuenta,
 // así que el reparto se DEDUCE del paquete de cada viajero. Se dice de dónde
 // sale en vez de inventar un detalle fila por fila que no existe. La sección
 // solo aparece cuando hay dinero migrado en ESTA cuenta: sin migrados, el panel
 // queda exactamente como estaba.
 const mig = Number(c.entradas_migrados || 0);
 const migSeccion = mig
   ? seccion('+ Cobrado a migrados del Excel', _spFmtMxn(mig), 'var(--green)',
       '<div style="font-size:12px;color:var(--ts)">Repartido por paquete: CHEAP a Banamex, los demás al banco del evento. El detalle por viajero vive en <b>Por evento</b>.</div>')
   : '';

 return seccion('+ Pagos cobrados', _spFmtMxn(c.entradas_pagos), 'var(--green)', pagosFilas)
   + seccion('+ Ingresos sueltos', _spFmtMxn(c.entradas_ingresos), 'var(--green)', ingFilas)
   + migSeccion
   + seccion('− Gastos', '−' + _spFmtMxn(c.salidas_gastos), 'var(--red)', gasFilas)
   + `<div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
        <span>= Saldo</span><span style="color:${Number(c.saldo) >= 0 ? 'var(--green)' : 'var(--red)'}">${_spFmtMxn(c.saldo)}</span>
      </div>`;
}
// ═══════════════════════════════════════════════════════════════
// INVENTARIO
// ═══════════════════════════════════════════════════════════════
async function loadInventario() {
 const tbody = document.getElementById('tabla-inventario');
 const verCostos = !['mister_popo','coordinador','cc'].includes(currentUser?.rol);
 try {
 const items = await khKits.listar(); // [sec-kits]
 const valorTotal = items.reduce((s, i) => s + (i.cantidad * i.costo_unitario), 0);
 const piezasTotal = items.reduce((s, i) => s + (i.cantidad || 0), 0);
 const invValorEl = document.getElementById('inv-valor');
 const invValorWrap = document.getElementById('inv-valor-wrap');
 if (invValorWrap) invValorWrap.style.display = verCostos ? '' : 'none';
 if (invValorEl) invValorEl.textContent = formatMXN(valorTotal);
 document.getElementById('inv-piezas').textContent = piezasTotal.toLocaleString('es-MX');

 // Ajustar headers de tabla
 const thead = document.querySelector('#tabla-inventario')?.closest('table')?.querySelector('thead tr');
 if (thead) {
   const ths = thead.querySelectorAll('th');
   // th[2]=costo_unitario, th[3]=valor_total
   if (ths[2]) ths[2].style.display = verCostos ? '' : 'none';
   if (ths[3]) ths[3].style.display = verCostos ? '' : 'none';
 }

 if (!items.length) {
 tbody.innerHTML = `<tr><td colspan="${verCostos ? 7 : 5}"><div class="empty-state"><div class="empty-icon"></div>Sin items en inventario</div></td></tr>`;
 return;
 }
 const puedeEditarKarin = ['maestro_roshi','bulma','mister_popo','milk'].includes(currentUser?.rol);
 tbody.innerHTML = items.map(i => {
 const valor = i.cantidad * i.costo_unitario;
 const alerta = i.cantidad <= i.stock_minimo;
 return `<tr>
 <td style="font-weight:600"><button type="button" class="kdx-link" onclick="abrirKardex('${_salEsc(i.id)}')" title="Ver el expediente de esta pieza: cada salida, quién se la llevó y si regresó">${_esfEsc(i.pieza)}</button>${i.retornable ? ' <span style="font-size:9px;letter-spacing:.06em;text-transform:uppercase;font-weight:800;padding:1px 6px;border-radius:4px;color:#7cc4ff;background:rgba(124,196,255,.12);border:1px solid rgba(124,196,255,.35)" title="Retornable: en las salidas queda como PRESTADA y la comparación del regreso la exige de vuelta siempre">↻ siempre vuelve</span>' : ''}${alerta ? ' <span style="color:var(--red)"><svg class="ic"><use href="#ic-alerta"/></svg></span>' : ''}</td>
 <td style="color:${alerta ? 'var(--red)' : 'var(--text)'};font-weight:600">${i.cantidad}</td>
 ${verCostos ? `<td>${formatMXN(i.costo_unitario)}</td><td style="font-weight:600">${formatMXN(valor)}</td>` : ''}
 <td style="color:var(--ts)">${i.stock_minimo}</td>
 <td style="font-size:12px;color:var(--ts)">${_esfEsc(i.proveedor||'—')}</td>
 <td>${puedeEditarKarin ? `
 <button class="btn btn-ghost btn-sm" onclick="editarKit('${i.id}')">⎘</button>
 <button class="btn btn-red btn-sm" onclick="eliminarKit('${i.id}')">✕</button>
 ` : '—'}</td>
 </tr>`;
 }).join('');
 } catch(e) {
 tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-error">${e.message}</div></td></tr>`;
 }
 loadTorreSalidas(); // [TORRE v2 F3] bandeja + prestado (fails-soft, solo cuidador/admins)
}

async function guardarKit() {
 const id = document.getElementById('kit-id').value;
 const pieza = document.getElementById('kit-pieza').value.trim();
 const cantidad = parseInt(document.getElementById('kit-cantidad').value);
 const costo = parseFloat(document.getElementById('kit-costo').value);
 const minimo = parseInt(document.getElementById('kit-minimo').value) || 0;
 const proveedor= document.getElementById('kit-proveedor').value.trim();
 const retornable = !!document.getElementById('kit-retornable')?.checked;
 const alerta = document.getElementById('kit-alert');

 if (!pieza || isNaN(cantidad) || isNaN(costo)) {
 alerta.innerHTML = '<div class="alert alert-error">Pieza, cantidad y costo son obligatorios</div>';
 return;
 }
 try {
 const body = { pieza, cantidad, costo_unitario: costo, stock_minimo: minimo, proveedor: proveedor || null, retornable };
 if (id) await khKits.actualizar(id, body); // [sec-kits]
 else await khKits.crear(body); // [sec-kits]
 alerta.innerHTML = '<div class="alert alert-success"> Guardado</div>';
 setTimeout(() => { closeModal('modal-kit'); loadInventario(); }, 900);
 } catch(e) {
 alerta.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
 }
}

async function editarKit(id) {
  // Limpiar form y abrir modal primero
  document.getElementById('kit-id').value = '';
  document.getElementById('kit-pieza').value = '';
  document.getElementById('kit-cantidad').value = '';
  document.getElementById('kit-costo').value = '';
  document.getElementById('kit-minimo').value = '';
  document.getElementById('kit-proveedor').value = '';
  const retChk = document.getElementById('kit-retornable'); if (retChk) retChk.checked = false;
  openModal('modal-kit');
  try {
    const item = await khKits.obtener(id); // [sec-kits]
    if (!item) { closeModal('modal-kit'); showToast('Kit no encontrado'); return; }
    // Llenar con datos reales
    document.getElementById('kit-id').value = item.id;
    document.getElementById('kit-pieza').value = item.pieza;
    document.getElementById('kit-cantidad').value = item.cantidad;
    document.getElementById('kit-costo').value = item.costo_unitario;
    document.getElementById('kit-minimo').value = item.stock_minimo || 0;
    document.getElementById('kit-proveedor').value = item.proveedor || '';
    const retChk2 = document.getElementById('kit-retornable'); if (retChk2) retChk2.checked = !!item.retornable;
  } catch(e) { closeModal('modal-kit'); showToast(e.message); }
}

async function eliminarKit(id) {
 if (!confirm('¿Eliminar esta pieza del inventario?')) return;
 try { await khKits.eliminar(id); loadInventario(); } // [sec-kits]
 catch(e) { alert(e.message); }
}

// ═══════════════════════════════════════════════════════════════
// TORRE v2 F3 — SALIDAS DE BODEGA (permiso previo, D1)
// La zona de Reportes pide; la Torre autoriza. El backend (admin-salidas F2)
// es quien manda: aquí solo se pinta y los 409 se muestran tal cual.
// ═══════════════════════════════════════════════════════════════
function _salEsc(s) { return _esfEsc(s); }
function _salResumenDetalle(detalle) {
  return (Array.isArray(detalle) ? detalle : [])
    .map(d => `${Number(d.cantidad) || 0}× ${_salEsc(d.pieza)}${d.retornable ? ' <span style="color:#7cc4ff;font-weight:700">↻</span>' : ''}`)
    .join(' · ');
}


let _salPiezas = [];







// ── Torre: bandeja del cuidador + prestado ahorita ─────────────────────
let _torreBandeja = [];
async function loadTorreSalidas() {
  const esCuidador = ['mister_popo', 'maestro_roshi', 'bulma', 'milk'].includes(currentUser?.rol);
  const bc = document.getElementById('torre-bandeja-card'), pc = document.getElementById('torre-prestado-card'), fc = document.getElementById('torre-faltantes-card');
  if (!esCuidador) { if (bc) bc.style.display = 'none'; if (pc) pc.style.display = 'none'; if (fc) fc.style.display = 'none'; return; }
  if (bc) bc.style.display = '';
  if (pc) pc.style.display = '';
  if (fc) fc.style.display = '';
  const bb = document.getElementById('torre-bandeja'), pp = document.getElementById('torre-prestado');
  try {
    const [pendientes, autorizadas, todas] = await Promise.all([
      khSalidas.listar({ estado: 'solicitada' }),
      khSalidas.listar({ estado: 'autorizada' }),
      khSalidas.listar({ limit: 200 }), // [F4b] faltantes viven en autorizadas Y cerradas
    ]);
    _torreBandeja = pendientes;
    const conFaltantes = (todas || []).filter(x => Number(x.faltantes_monto) > 0);
    // Nombres de solicitantes (best-effort: sin nombres, cae al rol).
    let uMap = {};
    try {
      const ids = [...new Set(pendientes.concat(autorizadas).concat(conFaltantes).map(s => s.solicitante_id).filter(Boolean))];
      if (ids.length) (await khUsuarios.listar({ ids })).forEach(u => { uMap[u.id] = u; }); // [sec-usuarios]
    } catch (e) { uMap = {}; }
    const quien = s => { const u = uMap[s.solicitante_id]; return u && u.nombre ? u.nombre : (s.solicitante_rol || '?'); };

    if (bb) {
      bb.innerHTML = !pendientes.length
        ? '<div style="font-size:12px;color:var(--ts);letter-spacing:.08em;text-transform:uppercase;text-align:center;padding:18px">Nada por autorizar</div>'
        : pendientes.map(s => `
          <div style="border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:10px 14px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
              <div style="font-size:13px"><b>${_salEsc(quien(s))}</b> · ${_salEsc(s.evento_id)}</div>
              <div style="font-size:11px;color:var(--ts)">${_salEsc(String(s.creado_en || '').slice(0, 10))}</div>
            </div>
            <div style="font-size:12px;color:var(--ts);margin-top:6px">${_salResumenDetalle(s.detalle)}</div>
            ${s.notas ? `<div style="font-size:11px;color:var(--ts);margin-top:4px">Notas: ${_salEsc(s.notas)}</div>` : ''}
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-primary btn-sm" onclick="darSalidaUI('${_salEsc(s.id)}')">Dar salida</button>
              <button class="btn btn-ghost btn-sm" style="color:#ff6666;border-color:rgba(255,68,68,.3)" onclick="rechazarSalidaUI('${_salEsc(s.id)}')">Rechazar</button>
            </div>
          </div>`).join('');
    }

    if (pp) {
      const filas = [];
      autorizadas.forEach(s => (Array.isArray(s.detalle) ? s.detalle : []).forEach(d => {
        if (d.retornable) filas.push({ pieza: d.pieza, cantidad: d.cantidad, quien: quien(s), evento: s.evento_id, desde: String(s.autorizada_en || '').slice(0, 10) });
      }));
      pp.innerHTML = !filas.length
        ? '<div style="font-size:12px;color:var(--ts);letter-spacing:.08em;text-transform:uppercase;text-align:center;padding:18px">Nada prestado ahorita</div>'
        : `<div class="table-wrap"><table><thead><tr>
            <th>Pieza</th><th>Cant.</th><th>Quién la trae</th><th>Evento</th><th>Desde</th>
          </tr></thead><tbody>${filas.map(f => `<tr>
            <td style="font-weight:600">${_salEsc(f.pieza)}</td>
            <td>${Number(f.cantidad) || 0}</td>
            <td>${_salEsc(f.quien)}</td>
            <td style="font-size:12px;color:var(--ts)">${_salEsc(f.evento)}</td>
            <td style="font-size:12px;color:var(--ts)">${_salEsc(f.desde)}</td>
          </tr>`).join('')}</tbody></table></div>`;
    }

    // [TORRE v2 F4b] Faltantes por cobrar: monto, quién, vence, estado, y el
    // botón "Marcar pagado" SOLO para Memo (descongela al instante).
    const ff = document.getElementById('torre-faltantes');
    if (ff) {
      const hoyMX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
      const esRoshi = currentUser?.rol === 'maestro_roshi';
      ff.innerHTML = !conFaltantes.length
        ? '<div style="font-size:12px;color:var(--ts);letter-spacing:.08em;text-transform:uppercase;text-align:center;padding:18px">Sin faltantes cobrados</div>'
        : conFaltantes.map(x => {
            const pagado = !!x.faltantes_pagado_at;
            const vence = String(x.faltantes_vence || '').slice(0, 10);
            const vencido = !pagado && vence && vence < hoyMX;
            const chip = pagado
              ? '<span style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;padding:2px 7px;border-radius:4px;color:#3ddc84;background:rgba(61,220,132,.14);border:1px solid rgba(61,220,132,.4)">pagado</span>'
              : vencido
                ? '<span style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;padding:2px 7px;border-radius:4px;color:#ff6666;background:rgba(255,68,68,.14);border:1px solid rgba(255,68,68,.4)">vencido — congelado</span>'
                : '<span style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;padding:2px 7px;border-radius:4px;color:#ffb020;background:rgba(255,176,32,.14);border:1px solid rgba(255,176,32,.4)">por cobrar</span>';
            const piezasTxt = (Array.isArray(x.faltantes) ? x.faltantes : []).map(f => `${f.cantidad}× ${_salEsc(f.pieza)}`).join(' · ');
            return `
          <div style="border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:10px 14px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
              <div style="font-size:13px"><b>${_salEsc(quien(x))}</b> · ${_salEsc(x.evento_id)} ${chip}</div>
              <div style="font-family:'Zen Dots',sans-serif;font-size:15px;color:${pagado ? 'var(--green)' : vencido ? 'var(--red)' : 'var(--gold)'}">${formatMXN(Number(x.faltantes_monto) || 0)}</div>
            </div>
            ${piezasTxt ? `<div style="font-size:12px;color:var(--ts);margin-top:6px">${piezasTxt}</div>` : ''}
            <div style="font-size:11px;color:var(--ts);margin-top:4px">${pagado ? 'Pagado el ' + _salEsc(String(x.faltantes_pagado_at).slice(0, 10)) : vence ? 'Vence el ' + _salEsc(vence) : 'El plazo de 15 días arranca con la aprobación final de Memo'}</div>
            ${(!pagado && esRoshi) ? `<div style="margin-top:8px"><button class="btn btn-primary btn-sm" onclick="marcarFaltantesPagadoUI('${_salEsc(x.id)}')">Marcar pagado</button></div>` : ''}
          </div>`;
          }).join('');
    }
  } catch (e) {
    if (bb) bb.innerHTML = `<div class="alert alert-error">${_salEsc(e.message)}</div>`;
    if (pp) pp.innerHTML = '';
  }
}

// ── 🗼 O2: EXPEDIENTE DE LA PIEZA (kardex) ─────────────────────────────────
// Click en el nombre de cualquier pieza de la Torre → modal con su historia
// completa: cada salida, quién se la llevó, para qué evento, si regresó y si
// faltó (y si ya se cobró). Solo lectura. Los importes los pinta el backend
// SOLO a quien ve costos; aquí no se inventa dinero.
function _kdxFecha(iso) {
  const s = String(iso || '').slice(0, 10);
  return s || '—';
}
function _kdxDias(desdeISO) {
  const t = Date.parse(desdeISO || '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}
function _kdxChip(h) {
  if (h.faltante) {
    const txt = h.faltante.pagado ? 'faltó · pagado' : (h.faltante.cobrado ? 'faltó · cobrado' : 'faltó');
    return `<span class="kdx-chip kdx-chip-falto">${txt}</span>`;
  }
  if (h.regreso) return '<span class="kdx-chip kdx-chip-ok">regresó</span>';
  if (h.fuera) {
    const d = _kdxDias(h.salio_en);
    return `<span class="kdx-chip kdx-chip-fuera">anda fuera${d != null ? ` · ${d}d` : ''}</span>`;
  }
  if (h.estado === 'solicitada') return '<span class="kdx-chip kdx-chip-espera">por autorizar</span>';
  return `<span class="kdx-chip kdx-chip-nula">${_salEsc(h.estado)}</span>`;
}

async function abrirKardex(piezaId) {
  const cuerpo = document.getElementById('kardex-cuerpo');
  const titulo = document.getElementById('kardex-titulo');
  if (titulo) titulo.textContent = 'Expediente de la pieza';
  if (cuerpo) cuerpo.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando expediente…</div>';
  openModal('modal-kardex');
  try {
    const j = await khSalidas.kardex(piezaId);
    const p = j.pieza || {};
    const r = j.resumen || { salio: 0, regreso: 0, falto: 0, fuera: 0, veces: 0 };
    const hist = Array.isArray(j.historial) ? j.historial : [];
    if (titulo) titulo.textContent = p.pieza || 'Expediente de la pieza';

    const cabecera = `
      <div class="kdx-head">
        <div class="kdx-nombre">${_salEsc(p.pieza || '—')}
          ${p.retornable ? '<span class="kdx-tag-ret">↻ retornable</span>' : '<span class="kdx-tag-con">consumible</span>'}
          ${p.borrada ? '<span class="kdx-tag-del">ya no está en el inventario</span>' : ''}
        </div>
        ${p.retornable ? `
        <div class="kdx-resumen">
          <div class="kdx-r"><span class="kdx-r-n">${r.salio}</span><span class="kdx-r-l">salió</span></div>
          <div class="kdx-r"><span class="kdx-r-n kdx-ok">${r.regreso}</span><span class="kdx-r-l">regresó</span></div>
          <div class="kdx-r"><span class="kdx-r-n kdx-mal">${r.falto}</span><span class="kdx-r-l">faltó</span></div>
          ${r.fuera ? `<div class="kdx-r"><span class="kdx-r-n kdx-fuera">${r.fuera}</span><span class="kdx-r-l">anda fuera</span></div>` : ''}
        </div>` : ''}
      </div>`;

    if (!hist.length) {
      cuerpo.innerHTML = cabecera + `
        <div class="kdx-vacio">
          <div class="kdx-vacio-t">Esta pieza nunca ha salido de la bodega</div>
          <div class="kdx-vacio-s">Cuando alguien levante una salida que la incluya, aquí va a quedar su historia completa.</div>
        </div>`;
      return;
    }

    cuerpo.innerHTML = cabecera + `
      <div class="kdx-lista">
        ${hist.map(h => `
          <div class="kdx-item">
            <div class="kdx-item-top">
              <div class="kdx-item-ev">${_salEsc(h.evento_id)}</div>
              ${_kdxChip(h)}
            </div>
            <div class="kdx-item-l">
              <b>${Number(h.cantidad) || 0}×</b> · se la llevó <b>${_salEsc(h.responsable)}</b>
            </div>
            <div class="kdx-item-f">
              ${h.salio_en ? `Salió el ${_kdxFecha(h.salio_en)}` : `Solicitada el ${_kdxFecha(h.solicitado_en)}`}${h.cerrada_en ? ` · regresó el ${_kdxFecha(h.cerrada_en)}` : ''}
            </div>
            ${h.faltante ? `<div class="kdx-item-falta">Faltaron ${Number(h.faltante.cantidad) || 0}${h.faltante.importe ? ` · ${formatMXN(h.faltante.importe)}` : ''}${h.faltante.pagado ? ' · ya pagado' : (h.faltante.cobrado ? ' · cobrado, pendiente de pago' : '')}</div>` : ''}
          </div>`).join('')}
      </div>`;
  } catch (e) {
    if (cuerpo) cuerpo.innerHTML = `<div class="alert alert-error">${_salEsc(e.message)}</div>`;
  }
}

async function darSalidaUI(id) {
  const s = _torreBandeja.find(x => x.id === id);
  const detalleTxt = s ? (Array.isArray(s.detalle) ? s.detalle : []).map(d => `${d.cantidad}× ${d.pieza}`).join(', ') : '';
  if (!confirm(`¿Dar salida?${detalleTxt ? '\n\n' + detalleTxt : ''}\n\nEl stock se descuenta en automático y Maestro Roshi recibe el FYI.`)) return;
  try {
    const j = await khSalidas.darSalida(id);
    showToast('Salida autorizada — stock descontado' + (j.correo_solicitante === false ? ' (el correo al solicitante no salió)' : ''), 'success');
    loadInventario(); // stock cambió: refresca tabla + bandeja + prestado
  } catch (e) {
    const extra = (e.data && e.data.sin_stock)
      ? ' — ' + e.data.sin_stock.map(x => `${x.pieza}: ${x.disponible} disp.`).join(', ')
      : '';
    showToast(e.message + extra, 'error'); // los 409 del backend, tal cual
  }
}

async function rechazarSalidaUI(id) {
  const motivo = prompt('Motivo del rechazo (le llega por correo al solicitante):');
  if (motivo === null) return;
  try {
    await khSalidas.rechazar(id, motivo.trim() || null);
    showToast('Salida rechazada', 'success');
    loadTorreSalidas();
  } catch (e) { showToast(e.message, 'error'); }
}

// [TORRE v2 F4b] "Marcar pagado" — SOLO Memo. Sella el pago y DESCONGELA
// (el candado de crear salidas se calcula en vivo, así que basta con esto).
async function marcarFaltantesPagadoUI(id) {
  if (!confirm('¿Marcar estos faltantes como PAGADOS? Se descongela al instante y el cron ya no aplicará strike por este cobro.')) return;
  try {
    await khSalidas.faltantesPagado(id);
    showToast('Faltantes pagados ✓ — descongelado', 'success');
    loadTorreSalidas();
  } catch (e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// CAPSULE CORP — EVENTOS
// ═══════════════════════════════════════════════════════════════


async function guardarEvento() {
 const id = document.getElementById('evento-id').value;
 const artista = document.getElementById('ev-artista').value.trim();
 const tour = document.getElementById('ev-tour').value.trim();
 const fecha = document.getElementById('ev-fecha').value;
 const fechaFin = document.getElementById('ev-fecha-fin').value;
 const ciudad = document.getElementById('ev-ciudad').value.trim();
 const venue = document.getElementById('ev-venue').value.trim();
 const tipo = document.getElementById('ev-tipo').value;
 const color = document.getElementById('ev-color').value;
 const promotor = document.getElementById('ev-promotor').value.trim();
 const nota = document.getElementById('ev-nota').value.trim();
 const status = document.getElementById('ev-status').value || 'Disponible';
 const banco = document.getElementById('ev-banco').value;
 const cdmx = document.getElementById('ev-cdmx').checked;
 const traslados = document.getElementById('ev-traslados').checked;
 const transporte = document.getElementById('ev-transporte').checked;
 const promo = document.getElementById('ev-promo').checked;
 const rideOnly = document.getElementById('ev-rideonly').checked;
 const cheapOnly = document.getElementById('ev-cheaponly').checked;
 const listOnly = document.getElementById('ev-listonly').checked;
 const sep = parseFloat(document.getElementById('ev-sep').value) || 0;
 const ride = parseFloat(document.getElementById('ev-ride').value) || 0;
 const imagen = document.getElementById('ev-imagen').value.trim();
 const notas = document.getElementById('ev-notas').value.trim();
 const dscCodigo = document.getElementById('ev-dsc-codigo').value.trim();
 const dscPct = parseFloat(document.getElementById('ev-dsc-pct').value) || 0;
 const dscExp = document.getElementById('ev-dsc-exp').value;
 const alerta = document.getElementById('evento-alert');

 if (!artista || !fecha || !ciudad || !venue) {
 alerta.innerHTML = '<div class="alert alert-error">Artista, fecha, ciudad y venue son obligatorios</div>';
 return;
 }

 // Leer listas dinámicas
 const incluye = leerIncluye();
 const zonas_plus = leerZonas('plus');
 const zonas_cheap = leerZonas('cheap');
 const hotel = leerHotel();
 const pagos_cal = leerPagos();
 const flash_promo = dscCodigo ? { code: dscCodigo, pct: dscPct, expiresTs: dscExp ? new Date(dscExp).getTime() : null } : null;

 try {
 const body = {
 artista, nombre: artista,
 tour: tour || null,
 fecha,
 fecha_fin: fechaFin || null,
 ciudad, venue, tipo,
 color: color || 'azul',
 promotor: promotor || null,
 nota_cliente: nota || null,
 status,
 banco,
 cdmx,
 tiene_traslados_internos: traslados,
 tiene_transporte_largo: transporte,
 promo,
 ride_only: rideOnly,
 cheap_only: cheapOnly,
 list_only: listOnly,
 separo: sep,
 ride_precio: ride,
 imagen_url: imagen || null,
 notas: notas || null,
 incluye: JSON.stringify(incluye),
 zonas_plus: JSON.stringify(zonas_plus),
 zonas_cheap: JSON.stringify(zonas_cheap),
 hotel_opciones: JSON.stringify(hotel),
 pagos_calendario: JSON.stringify(pagos_cal),
 flash_promo: flash_promo ? JSON.stringify(flash_promo) : null
 };
 if (id) await khEventos.actualizar(id, body); // [sec-eventos]
 else await khEventos.crear(body); // [sec-eventos]
 alerta.innerHTML = '<div class="alert alert-success">Evento guardado</div>';
 _eventosCache = await khEventos.listar(); // [sec-eventos]
 populateEventoSelects();
 setTimeout(() => { closeModal('modal-evento'); loadCapsule(); }, 900);
 } catch(e) {
 alerta.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
 }
}

async function editarEvento(id) {
 try {
 const ev = await khEventos.obtener(id); // [sec-eventos]
 document.getElementById('evento-id').value = ev.id;
 document.getElementById('ev-artista').value = ev.artista || '';
 document.getElementById('ev-tour').value = ev.tour || '';
 document.getElementById('ev-fecha').value = ev.fecha || '';
 document.getElementById('ev-fecha-fin').value = ev.fecha_fin || '';
 document.getElementById('ev-ciudad').value = ev.ciudad || '';
 document.getElementById('ev-venue').value = ev.venue || '';
 document.getElementById('ev-tipo').value = ev.tipo || 'Concierto';
 document.getElementById('ev-color').value = ev.color || 'azul';
 document.getElementById('ev-promotor').value = ev.promotor || '';
 document.getElementById('ev-nota').value = ev.nota_cliente || '';
 document.getElementById('ev-status').value = ev.status || '';
 document.getElementById('ev-banco').value = ev.banco || 'default';
 document.getElementById('ev-cdmx').checked = !!ev.cdmx;
 document.getElementById('ev-traslados').checked = !!ev.tiene_traslados_internos;
 document.getElementById('ev-transporte').checked = !!ev.tiene_transporte_largo;
 document.getElementById('ev-promo').checked = !!ev.promo;
 document.getElementById('ev-rideonly').checked = !!ev.ride_only;
 document.getElementById('ev-cheaponly').checked = !!ev.cheap_only;
 document.getElementById('ev-listonly').checked = !!ev.list_only;
 document.getElementById('ev-sep').value = ev.separo || '';
 document.getElementById('ev-ride').value = ev.ride_precio || '';
 document.getElementById('ev-imagen').value = ev.imagen_url || '';
 document.getElementById('ev-notas').value = ev.notas || '';
 // Flash promo
 const fp = ev.flash_promo ? (typeof ev.flash_promo === 'string' ? JSON.parse(ev.flash_promo) : ev.flash_promo) : null;
 document.getElementById('ev-dsc-codigo').value = fp?.code || '';
 document.getElementById('ev-dsc-pct').value = fp?.pct || '';
 document.getElementById('ev-dsc-exp').value = fp?.expiresTs ? new Date(fp.expiresTs).toISOString().slice(0,16) : '';
 // Listas dinámicas
 iniciarIncluye(ev.incluye ? JSON.parse(ev.incluye) : []);
 iniciarZonas('plus', ev.zonas_plus ? JSON.parse(ev.zonas_plus) : []);
 iniciarZonas('cheap', ev.zonas_cheap ? JSON.parse(ev.zonas_cheap) : []);
 iniciarHotel(ev.hotel_opciones ? JSON.parse(ev.hotel_opciones) : []);
 iniciarPagos(ev.pagos_calendario ? JSON.parse(ev.pagos_calendario) : []);
 document.getElementById('modal-evento-title').textContent = 'Editar: ' + ev.artista;
 openModal('modal-evento');
 } catch(e) { alert('Error al cargar evento: ' + e.message); }
}

async function eliminarEvento(id) {
 if (!confirm('¿Eliminar este evento? Se borrarán también sus reservaciones.')) return;
 try { await khEventos.eliminar(id); loadCapsule(); } // [sec-eventos]
 catch(e) { alert(e.message); }
}

// ─── LISTAS DINÁMICAS DEL FORMULARIO ───

function iniciarIncluye(items) {
 const c = document.getElementById('ev-incluye-lista');
 c.innerHTML = '';
 (items.length ? items : ['']).forEach(v => agregarIncluyeItem(v));
}
function agregarIncluye() { agregarIncluyeItem(''); }
function agregarIncluyeItem(val) {
 const c = document.getElementById('ev-incluye-lista');
 const d = document.createElement('div');
 d.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
 d.innerHTML = `<input type="text" placeholder="Ej: Boleto zona elegida" value="${val}"
 style="flex:1;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r-sm,8px);
 padding:8px 10px;color:var(--text);font-family:Montserrat,sans-serif;font-size:12px;outline:none">
 <button class="btn btn-red btn-sm" onclick="this.parentElement.remove()">X</button>`;
 c.appendChild(d);
}
function leerIncluye() {
 return Array.from(document.querySelectorAll('#ev-incluye-lista input'))
 .map(i => i.value.trim()).filter(Boolean);
}

function iniciarZonas(tipo, items) {
 const c = document.getElementById(`ev-zonas-${tipo}`);
 c.innerHTML = '';
 (items.length ? items : []).forEach(z => agregarZonaItem(tipo, z));
}
function agregarZona(tipo) { agregarZonaItem(tipo, {}); }
function agregarZonaItem(tipo, z) {
 const c = document.getElementById(`ev-zonas-${tipo}`);
 const d = document.createElement('div');
 d.style.cssText = 'display:grid;grid-template-columns:2fr 1fr auto auto auto;gap:6px;margin-bottom:6px;align-items:center';
 d.innerHTML = `
 <input type="text" placeholder="Nombre zona" value="${z.n||''}"
 style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r-sm,8px);
 padding:8px 10px;color:var(--text);font-family:Montserrat,sans-serif;font-size:12px;outline:none">
 <input type="number" placeholder="Precio" value="${z.p||''}" min="0"
 style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r-sm,8px);
 padding:8px 10px;color:var(--text);font-family:Montserrat,sans-serif;font-size:12px;outline:none">
 <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;white-space:nowrap">
 <input type="checkbox" ${z.vip?'checked':''}> VIP
 </label>
 <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;white-space:nowrap">
 <input type="checkbox" ${z.ag?'checked':''}> Agotado
 </label>
 <button class="btn btn-red btn-sm" onclick="this.parentElement.remove()">X</button>`;
 c.appendChild(d);
}
function leerZonas(tipo) {
 return Array.from(document.querySelectorAll(`#ev-zonas-${tipo} > div`)).map(d => {
 const inputs = d.querySelectorAll('input');
 const checks = d.querySelectorAll('input[type=checkbox]');
 const n = inputs[0].value.trim();
 const p = parseFloat(inputs[1].value) || 0;
 if (!n) return null;
 const obj = { n, p };
 if (checks[0].checked) obj.vip = 1;
 if (checks[1].checked) obj.ag = 1;
 return obj;
 }).filter(Boolean);
}

function iniciarHotel(items) {
 const c = document.getElementById('ev-hotel-lista');
 c.innerHTML = '';
 (items.length ? items : [
 {n:'Compartida', e:0},
 {n:'Triple', e:250},
 {n:'Doble', e:650},
 {n:'Individual', e:1960}
 ]).forEach(h => agregarHotelItem(h));
}
function agregarHotel() { agregarHotelItem({n:'', e:0}); }
function agregarHotelItem(h) {
 const c = document.getElementById('ev-hotel-lista');
 const d = document.createElement('div');
 d.style.cssText = 'display:grid;grid-template-columns:2fr 1fr auto;gap:6px;margin-bottom:6px;align-items:center';
 d.innerHTML = `
 <input type="text" placeholder="Tipo habitación" value="${h.n||''}"
 style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r-sm,8px);
 padding:8px 10px;color:var(--text);font-family:Montserrat,sans-serif;font-size:12px;outline:none">
 <input type="number" placeholder="Extra $" value="${h.e||0}" min="0"
 style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r-sm,8px);
 padding:8px 10px;color:var(--text);font-family:Montserrat,sans-serif;font-size:12px;outline:none">
 <button class="btn btn-red btn-sm" onclick="this.parentElement.remove()">X</button>`;
 c.appendChild(d);
}
function leerHotel() {
 return Array.from(document.querySelectorAll('#ev-hotel-lista > div')).map(d => {
 const inputs = d.querySelectorAll('input');
 const n = inputs[0].value.trim();
 if (!n) return null;
 return { n, e: parseFloat(inputs[1].value) || 0 };
 }).filter(Boolean);
}

function iniciarPagos(items) {
 const c = document.getElementById('ev-pagos-lista');
 c.innerHTML = '';
 (items.length ? items : [
 {l:'Separo', d:'Hoy'},
 {l:'Pago 1', d:''}
 ]).forEach(p => agregarPagoItem(p));
}
function agregarPago() { agregarPagoItem({l:'', d:''}); }
function agregarPagoItem(p) {
 const c = document.getElementById('ev-pagos-lista');
 const d = document.createElement('div');
 d.style.cssText = 'display:grid;grid-template-columns:1fr 2fr auto;gap:6px;margin-bottom:6px;align-items:center';
 d.innerHTML = `
 <input type="text" placeholder="Label (Separo, Pago 1...)" value="${p.l||''}"
 style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r-sm,8px);
 padding:8px 10px;color:var(--text);font-family:Montserrat,sans-serif;font-size:12px;outline:none">
 <input type="text" placeholder="Fechas (ej: 9-16 abr)" value="${p.d||''}"
 style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r-sm,8px);
 padding:8px 10px;color:var(--text);font-family:Montserrat,sans-serif;font-size:12px;outline:none">
 <button class="btn btn-red btn-sm" onclick="this.parentElement.remove()">X</button>`;
 c.appendChild(d);
}
function leerPagos() {
 return Array.from(document.querySelectorAll('#ev-pagos-lista > div')).map(d => {
 const inputs = d.querySelectorAll('input');
 const l = inputs[0].value.trim();
 if (!l) return null;
 return { l, d: inputs[1].value.trim(), s: l.toLowerCase() === 'separo' ? 1 : 0 };
 }).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════
function formatMXN(n) {
 if (n === null || n === undefined || n === '') return '—';
 return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n);
}

function fmtFecha(d) {
 if (!d) return '—';
 const date = new Date(d + 'T12:00:00');
 return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function badgeStatus(s) {
 const map = {
 'Disponible':'badge-green','Últimos Lugares':'badge-orange',
 'Pocos Lugares':'badge-orange','En Proceso':'badge-blue',
 'Agotado':'badge-red','Pasado':'badge-gray','Por Confirmar':'badge-gold'
 };
 return `<span class="badge ${map[s]||'badge-gray'}">${s||'—'}</span>`;
}

function openModal(id) {
 // Limpiar alertas
 const alerta = document.querySelector(`#${id} [id$="-alert"]`);
 if (alerta) alerta.innerHTML = '';
 // Reset hidden ids
 const hiddenId = document.querySelector(`#${id} input[type=hidden]`);
 if (hiddenId) hiddenId.value = '';
 document.getElementById(id).classList.add('open');
}

function closeModal(id) {
 document.getElementById(id).classList.remove('open');
 if (id === 'modal-gasto') _gastoEditId = null;   // sal de modo edición al cerrar
 if (id === 'modal-ingreso') _ingresoEditId = null;   // sal de modo edición al cerrar
}

// ─── Modal dinámico (creado en JS, no en HTML) ───
function crearModal(nombre, titulo, contenidoHTML) {
  const modalId = 'modal-' + nombre;
  // Si ya existe, actualiza contenido
  let el = document.getElementById(modalId);
  if (!el) {
    el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = modalId;
    el.innerHTML = `<div class="modal" style="max-width:640px;width:95%">
      <div class="modal-header" id="${modalId}-header">
        <span id="${modalId}-title"></span>
        <button class="modal-close" onclick="cerrarModal('${nombre}')">✕</button>
      </div>
      <div class="modal-body" id="${modalId}-body"></div>
    </div>`;
    el.addEventListener('click', function(e) {
      if (e.target === this) cerrarModal(nombre);
    });
    document.body.appendChild(el);
  }
  const titleEl = document.getElementById(modalId + '-title');
  const bodyEl  = document.getElementById(modalId + '-body');
  if (titleEl) titleEl.textContent = titulo;
  if (bodyEl)  bodyEl.innerHTML = contenidoHTML;
  el.classList.add('open');
}

function cerrarModal(nombre) {
  const el = document.getElementById('modal-' + nombre);
  if (el) el.classList.remove('open');
}

// Cerrar modales al click en overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
 overlay.addEventListener('click', function(e) {
 if (e.target === this) this.classList.remove('open');
 });
});

// ESC cierra modales
document.addEventListener('keydown', e => {
 if (e.key === 'Escape') {
 document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
 }
});


// ═══════════════════════════════════════════════════════════════════════════
// [KMS-1] EL MANDO ÚNICO DEL PALACIO
//
// Memo: "está muy confuso el Palacio de Kamisama". Eran cuatro tarjetas
// apiladas y TRES selectores de evento — el mismo evento elegido tres veces, y
// lo económico regado entre tarjetas.
//
// Este mando escribe su valor en los tres selectores originales (que siguen en
// el DOM, ocultos) y llama a los mismos cargadores. NO se cambia de dónde leen
// las funciones de Comisiones CHEAP (F5a) ni las de Liquidaciones: están
// SELLADAS, y cambiarles el elemento del que leen sería reescribirlas. Espejar
// el valor las deja byte-idénticas — el precio es un `select` oculto por
// sección, que es barato y reversible.
// ═══════════════════════════════════════════════════════════════════════════
let _kmsEVCache = [];
let _kmsPasoActivo = 'prov';


// ═══ [KMS-SIMP-1] EL SELECTOR: BUSCADOR + ORDEN POR FECHA ═══════════════════
// Medido: 101 opciones ordenadas por NOMBRE y sin forma de buscar. Para cargar
// el pedido de un evento de septiembre había que recorrer el alfabeto entero.
//
// Dos cambios, ninguno de mecanismo:
//   · el orden pasa a ser POR FECHA (el más cercano primero) — trabajar el
//     Palacio es trabajar lo que viene, no lo que empieza con A;
//   · una caja de búsqueda FILTRA las opciones del mismo <select>.
// El <select> sigue siendo el mismo elemento con el mismo id y el mismo
// onchange: `_kmsOnEvento` y los tres selectores espejo de KMS-1 no se enteran.
function _kmsFechaDe(e) {
  // La fecha que ordena es la PRIMERA de dsList si el evento es multifecha,
  // igual que en el resto de la casa. Sin fecha va al final, no al principio:
  // un evento por confirmar no es lo más urgente.
  const l = (e && Array.isArray(e.dsList) && e.dsList.length) ? e.dsList : (e && e.ds ? [e.ds] : []);
  return l[0] || '9999-99-99';
}






// ═══════════════════════════════════════════════════════════════════════════
// [KMS-6] EL MANDO SE ENCOGE AL DESPLAZARSE.
//
// Pegado arriba, el mando era un tarjetón de 114 px tapando contenido todo el
// rato. Ahora, en cuanto el centinela sale de pantalla, pasa a una sola línea.
//
// Se usa IntersectionObserver a propósito y NO un listener de scroll: avisa al
// CRUZAR el umbral —dos veces por viaje— en vez de una vez por frame. Y la
// clase solo cambia padding y tipografía: no anima nada, así que la regla de
// "solo transform/opacity por frame" no aplica aquí — no hay frames.
// ═══════════════════════════════════════════════════════════════════════════
let _kmsMandoObs = null;

// ── Tablero económico ────────────────────────────────────────────────────────
// Se pinta con lo que _kamComprasLoad y _kamAbonosLoad YA calcularon: cero
// endpoints nuevos y cero llamadas extra. Por eso llega en dos tiempos (las
// compras primero, el abonado cuando terminan los abonos) y cada quien pinta
// lo que tiene.
let _kmsDatos = null;

// ═══════════════════════════════════════════════════════════════════════════
// [KMS-5] LAS ALARMAS DEL PALACIO — lo que no cuadra, arriba de todo.
//
// Memo: "siento que falta un sistema de alarmas: cosas que no cuadren, datos
// faltantes, etc.". El principio es que ninguna de estas líneas se calcula con
// datos nuevos: TODAS salen de lo que el tablero ya tiene (`_kmsDatos`) más las
// alertas de datos faltantes, que se piden con la acción que ya existía.
//
// SE LLAMA "ALARMAS" Y NO "RADAR" a propósito: en este archivo ya vive un radar
// —`khRadar`/`_radarCache`/`.rdr-*`, el de sesiones y seguridad— y dos cosas con
// el mismo nombre en el mismo archivo es la receta de agarrar la equivocada.
//
// Lo que NO se puede saber hoy, y por eso NO se inventa: "compras de hoy sin
// abono si el proveedor exige pago". La tabla `proveedores` tiene tres columnas
// —id, nombre, created_at— y ninguna dice si exige pago inmediato. Pintarlo
// sería adivinar quién cobra al contado.
// ═══════════════════════════════════════════════════════════════════════════

let _kmsAlertasViajero = null;  // alertas datos_viajero del evento (null = aún no llegan)






// ═══════════════════════════════════════════════════════════════════════════
// [KMS-2] MINI-WIZARD DE COMPRA — ver el efecto ANTES de guardar.
//
// Memo capturaba a ciegas: llenaba cinco campos, picaba "Agregar compra" y el
// efecto en su dinero aparecía DESPUÉS. Ahora el botón abre un preview que se
// calcula con lo que la pantalla YA tiene (_kmsDatos), sin una sola llamada
// nueva, y de ahí se confirma o se cancela.
//
// `_kamCompraCrear` NO se toca: confirmar la llama tal cual, así "es la misma
// llamada de siempre" es cierto por construcción y no por promesa.
// ═══════════════════════════════════════════════════════════════════════════

// Marca y enfoca el campo culpable — mismo patrón que _regFalla de GR-12.
function _kmsMal(zi, msg, campoId) {
  document.querySelectorAll('.kms-mal').forEach((e) => { e.classList.remove('kms-mal'); e.removeAttribute('aria-invalid'); });
  _kamComprasAlert(msg);
  const c = campoId ? document.getElementById(campoId) : null;
  if (c) {
    c.classList.add('kms-mal');
    c.setAttribute('aria-invalid', 'true');
    try { c.focus({ preventScroll: true }); } catch (_) { try { c.focus(); } catch (__) {} }
    const limpia = () => { c.classList.remove('kms-mal'); c.removeAttribute('aria-invalid'); };
    c.addEventListener('input', limpia, { once: true });
    c.addEventListener('change', limpia, { once: true });
  }
  return false;
}











// ── Inventario de boletos (compras por evento/zona) ──────────────────────────
let _kamProvCache = [];   // proveedores para los <select> de las zonas
let _kamZonasMap = {};    // índice de zona (zi) -> nombre de zona (para el alta)

function _kamMoney(n) { return '$' + (Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 }); }
function _kamToday() { try { return new Date().toLocaleDateString('en-CA'); } catch (_) { return ''; } }


// ── Comisiones CHEAP por zona (F5a — pantalla de Memo, solo maestro_roshi) ────
// El evento_id que se guarda/consulta DEBE ser idéntico al que usa el vendedor al
// cotizar (_vtaEventoId): 'slug' o 'slug#idx' para multifecha. Por eso el selector
// espeja esa lógica (evento + fecha).
// Fecha relativa corta para frescura ("hace 3 h", "hace 2 días"). '' si inválida.
function _khHaceRel(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'hace un momento';
  if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
  if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
  const d = Math.floor(s / 86400);
  return 'hace ' + d + (d === 1 ? ' día' : ' días');
}





// ═══ [KMS-SIMP-2] LA CUENTA DEL EVENTO, A LA VISTA ═════════════════════════
// Todo sale de `_lib/cuenta-evento` por su puerta nueva (`admin-cuenta-evento`).
// AQUÍ NO SE CALCULA DINERO: se pinta lo que la cuenta ya sabe. La única cuenta
// propia es el PUNTO DE QUIEBRE, y está declarada abajo con su fórmula a la
// vista, porque es una PROYECCIÓN, no un saldo.
let _kmsCuenta = null;




// ═══ [COB-MIG-1] LA CAJA ÚNICA · los que deben, de los DOS mundos ══════════
//
// POR QUÉ EXISTE. Memo lo descubrió en vivo: la gente de calle24 empezó a
// depositar y NO HABÍA DÓNDE CAPTURARLO. El formulario de abono existe desde
// VJ-3 y el endpoint `abono_crear` está construido y validado — pero **nadie
// podía llegarles**: el bloque colgaba de `_vjAbrir(alertaId)`, y la única
// puerta era una alerta `datos_viajero`. Medido en la base: existen 3 alertas
// accionables en toda la historia y **las 3 son de `melanie`**, un evento
// borrado. Para `calle24`, con 10 migrados vivos, había CERO puertas. Por eso
// `abonos_viajero` lleva 0 filas: no es que nadie haya pagado, es que nadie
// podía registrarlo.
//
// Es la hermana de "una función sin llamadores es una función muerta", pero con
// una pantalla entera detrás — y del candado inalcanzable de KMS-SIMP-5: aquí
// no era una guarda la que no podía dispararse, era una puerta que no se podía
// abrir.
//
// QUÉ NO HACE: no calcula un solo peso. La resta la manda el servidor con la
// fórmula sellada de VJ-3 (`saldoMigrado`, en `_lib/cuenta-evento`); esta
// pantalla ordena, filtra y pinta. Cada `reduce` de dinero que apareciera aquí
// sería la fórmula número doce.
let _cobCajaDeudores = null;   // los migrados que deben, del servidor
let _cobCajaUltimos = [];      // el feed de actividad
let _cobCajaTotal = 0;         // cuántos abonos hay en total (no solo el feed)
let _cobCajaEvMap = {};        // slug -> nombre bonito, del catálogo del index

// ⚠️ No existe ningún `_evNombre` en esta casa — lo di por hecho y lo escribí
// tres veces antes de comprobarlo. El patrón real (el de `_gastosEVMap` y el de
// la tabla de utilidad) es pedir el catálogo con `_fetchEVFromIndex()` y armar
// el mapa `id -> e.a`. Un helper inventado con guarda `typeof` no truena: se
// queda callado pintando slugs, que es peor.
function _cobCajaEvNombre(slug) {
  return _cobCajaEvMap[String(slug || '').split('#')[0]] || slug || '';
}

function _cobCajaMostrar(ver) {
  const caja = document.getElementById('cob-caja');
  if (!caja) return;
  // Los hermanos de la pestaña: todo lo que vive en page-pagos MENOS la barra
  // de tabs y la caja. Se apagan por exclusión y no por lista, para que sumar
  // un bloque a Cobranza mañana no lo deje huérfano fuera del interruptor.
  const page = document.getElementById('page-pagos');
  if (page) {
    [...page.children].forEach((el) => {
      if (el.id === 'cob-caja' || el.id === 'pg-tabs-pagos' || el.classList.contains('page-header')) return;
      el.style.display = ver ? 'none' : '';
    });
  }
  caja.style.display = ver ? '' : 'none';
  document.querySelectorAll('#pg-tabs-pagos .pg-tab-btn').forEach((b) => {
    b.classList.toggle('active', ver ? b.dataset.tab === 'caja' : b.dataset.tab === 'pagos');
  });
  if (ver) _cobCajaCargar();
}

async function _cobCajaCargar() {
  const cont = document.getElementById('cob-caja-lista');
  try {
    // El catálogo se pide en PARALELO con los deudores: es la misma espera.
    const [j, ev] = await Promise.all([
      khViajeros._call({ accion: 'deudores_migrados' }),
      (typeof _fetchEVFromIndex === 'function' ? _fetchEVFromIndex() : Promise.resolve([])).catch(() => []),
    ]);
    _cobCajaEvMap = {};
    (ev || []).forEach((e) => { if (e && e.id) _cobCajaEvMap[e.id] = e.a || e.id; });
    _cobCajaDeudores = j.deudores || [];
    _cobCajaUltimos = j.ultimos || [];
    _cobCajaTotal = Number(j.total_abonos) || 0;
    _cobCajaPoblarEventos();
    _cobCajaPintar();
    _cobCajaFeed();
  } catch (e) {
    if (cont) cont.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
  }
}

// El selector de evento se llena con los eventos QUE TIENEN deudores, no con el
// catálogo entero: 101 opciones para filtrar entre dos es la pantalla vieja.
function _cobCajaPoblarEventos() {
  const sel = document.getElementById('cob-caja-ev');
  if (!sel) return;
  const antes = sel.value;
  const evs = [...new Set((_cobCajaDeudores || []).map((d) => d.evento_id).filter(Boolean))];
  const nom = (slug) => _cobCajaEvNombre(slug);
  sel.innerHTML = '<option value="">Todos los eventos</option>'
    + evs.sort().map((e) => `<option value="${_esfEsc(e)}">${_esfEsc(nom(e))}</option>`).join('');
  if (antes && evs.includes(antes)) sel.value = antes;
}

// [ORD-1] El orden: por EVENTO y, dentro, por quien más debe. La regla de la
// casa dice que el orden lo decide una sola fuente; aquí el criterio es de
// cobranza —a quién hay que llamar primero— y se declara entero en un lugar.
function _cobCajaOrden(a, b) {
  const ea = String(a.evento_id || ''), eb = String(b.evento_id || '');
  if (ea !== eb) return ea.localeCompare(eb);
  if (b.resta !== a.resta) return b.resta - a.resta;
  return String(a.nombre || '').localeCompare(String(b.nombre || ''));
}

function _cobCajaPintar() {
  const cont = document.getElementById('cob-caja-lista');
  if (!cont || !_cobCajaDeudores) return;
  const q = _kmNorm(((document.getElementById('cob-caja-q') || {}).value || '').trim());
  const ev = (document.getElementById('cob-caja-ev') || {}).value || '';
  const soloDeben = !!(document.getElementById('cob-caja-solo-deben') || {}).checked;

  let lista = _cobCajaDeudores.slice();
  if (ev) lista = lista.filter((d) => d.evento_id === ev);
  if (q) lista = lista.filter((d) => _kmNorm(String(d.nombre || '')).indexOf(q) >= 0);
  if (soloDeben) lista = lista.filter((d) => Number(d.resta) > 0);
  lista.sort(_cobCajaOrden);

  // Los contadores salen de la lista VISIBLE: si dijeran el total de la base
  // mientras la pantalla muestra un filtro, serían dos verdades a la vez.
  const deuda = lista.reduce((s, d) => s + Math.max(0, Number(d.resta) || 0), 0);
  const cobrado = lista.reduce((s, d) => s + (Number(d.abonado) || 0), 0);
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('cob-caja-cnt', String(lista.length));
  set('cob-caja-deuda', _spFmtMxn(deuda));
  set('cob-caja-cobrado', _spFmtMxn(cobrado));
  set('cob-caja-abonos', String(_cobCajaTotal));
  const badge = document.getElementById('cob-caja-badge');
  if (badge) {
    const deben = (_cobCajaDeudores || []).filter((d) => Number(d.resta) > 0).length;
    badge.textContent = String(deben);
    badge.style.display = deben ? '' : 'none';
  }

  if (!lista.length) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon"></div>${
      _cobCajaDeudores.length ? 'Nadie coincide con el filtro.' : 'Todavía no hay viajeros con contrato capturado.'}</div>`;
    return;
  }

  let evActual = null;
  cont.innerHTML = lista.map((d) => {
    const cabecera = (d.evento_id !== evActual)
      ? `<div class="cob-caja-ev">${_esfEsc(_cobCajaEvNombre(d.evento_id))}</div>` : '';
    evActual = d.evento_id;
    const wa = _cobCajaWaHref(d);
    const neg = Number(d.resta) < 0;
    return cabecera + `
      <div class="cob-caja-fila" id="cbf-${_esfEsc(d.id)}">
        <div class="cob-caja-h">
          <div>
            <div class="cob-caja-n">${_esfEsc(d.nombre || 'sin nombre')}</div>
            <div class="cob-caja-z">${_esfEsc(d.zona_boleto || 'sin zona')}${d.tipo_paquete ? ' · ' + _esfEsc(String(d.tipo_paquete).toUpperCase()) : ''}${d.abonos ? ` · ${d.abonos} abono${d.abonos === 1 ? '' : 's'}` : ''}</div>
          </div>
          <div class="cob-caja-m">
            <div class="cob-caja-resta ${neg ? 'cob-caja-favor' : ''}">${_spFmtMxn(Math.abs(Number(d.resta) || 0))}</div>
            <div class="cob-caja-sub">${neg ? 'a favor' : 'debe'} · de ${_spFmtMxn(d.total)}</div>
          </div>
        </div>
        <div class="cob-caja-acc">
          <button class="btn btn-primary btn-sm" type="button" onclick="_cobCajaAbrir('${_attrJs(d.id)}')">Registrar abono</button>
          ${wa ? `<a class="btn btn-ghost btn-sm" href="${_esfEsc(wa)}" target="_blank" rel="noopener">WhatsApp</a>`
               : '<span class="cob-caja-nowa">sin celular</span>'}
        </div>
        <div class="cob-caja-form" id="cbform-${_esfEsc(d.id)}" style="display:none"></div>
      </div>`;
  }).join('');
}

// El WhatsApp REUSA `_cobWaHref`: no se escribe un segundo redactor. Lo que se
// arma es el objeto que esa función espera (`clientes`, `pago.proximo`,
// `evento_nombre`) — adaptar la entrada es reuso; copiar el texto sería la
// segunda copia que acaba divergiendo.
function _cobCajaWaHref(d) {
  if (!d || !d.celular) return null;
  const resta = Number(d.resta) || 0;
  return _cobWaHref({
    clientes: { celular: d.celular, nombre_completo: d.nombre },
    evento_nombre: _cobCajaEvNombre(d.evento_id),
    pago: resta > 0 ? { proximo: { monto: resta, fecha_esperada: 'la fecha acordada' } } : {},
  });
}

// El formulario de captura, desplegado EN LA FILA. Mismos campos y mismas
// reglas que el bloque de VJ-3 —monto > 0, fecha opcional, nota, foto
// opcional— porque le pega al MISMO endpoint validado.
function _cobCajaAbrir(id) {
  const caja = document.getElementById(`cbform-${id}`);
  if (!caja) return;
  if (caja.style.display !== 'none') { caja.style.display = 'none'; caja.innerHTML = ''; return; }
  caja.style.display = '';
  caja.innerHTML = `
    <div class="cob-caja-campos">
      <label class="cob-caja-c"><span>MONTO</span>
        <input class="cot-input" id="cbm-${_esfEsc(id)}" type="number" min="0" step="0.01" placeholder="0.00"></label>
      <label class="cob-caja-c"><span>FECHA</span>
        <input class="cot-input" id="cbf2-${_esfEsc(id)}" type="date" value="${_esfEsc(_mxFechaStr ? _mxFechaStr() : '')}"></label>
      <label class="cob-caja-c" style="flex:1;min-width:150px"><span>NOTA</span>
        <input class="cot-input" id="cbn-${_esfEsc(id)}" placeholder="opcional — ej. depósito BBVA" maxlength="500"></label>
      <label class="cob-caja-c"><span>COMPROBANTE</span>
        <input class="cot-input" id="cbfoto-${_esfEsc(id)}" type="file" accept="image/*"></label>
    </div>
    <div class="cob-caja-acc" style="margin-top:8px">
      <button class="btn btn-primary btn-sm" type="button" id="cbbtn-${_esfEsc(id)}" onclick="_cobCajaGuardar('${_attrJs(id)}')">Guardar abono</button>
      <button class="btn btn-ghost btn-sm" type="button" onclick="_cobCajaAbrir('${_attrJs(id)}')">Cancelar</button>
    </div>`;
  const m = document.getElementById(`cbm-${id}`); if (m) { try { m.focus(); } catch (_) {} }
}

async function _cobCajaGuardar(id) {
  const al = document.getElementById('cob-caja-alert');
  const mal = (msg) => { if (al) al.innerHTML = `<div class="alert alert-error">${_esfEsc(msg)}</div>`; };
  if (al) al.innerHTML = '';
  const monto = Number((document.getElementById(`cbm-${id}`) || {}).value);
  // > 0 estricto, ESPEJO del servidor (`abono_crear` rechaza <= 0). El servidor
  // sigue siendo la autoridad; esto solo evita el viaje.
  if (!Number.isFinite(monto) || monto <= 0) return mal('El monto del abono tiene que ser mayor que cero.');
  const fecha = String((document.getElementById(`cbf2-${id}`) || {}).value || '').trim();
  const nota = String((document.getElementById(`cbn-${id}`) || {}).value || '').trim();
  // La foto se lee con el MISMO helper de VJ-3: un segundo lector sería otra
  // forma de leer el mismo archivo, y ya sabemos cómo termina eso.
  const foto = await _vj3LeerFoto(document.getElementById(`cbfoto-${id}`));

  const btn = document.getElementById(`cbbtn-${id}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    await khViajeros.abonoCrear({
      viajero_id: id, monto,
      fecha: fecha || undefined, nota: nota || undefined, foto: foto || undefined,
    });
    showToast(`Abono de ${_spFmtMxn(monto)} registrado`, 'success');
    // Se RECARGA todo desde el servidor: la resta que queda en pantalla sale de
    // los datos, no de restar aquí y confiar. Es la misma decisión de VJ-3.
    await _cobCajaCargar();
  } catch (e) {
    mal(e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar abono'; }
  }
}

// El feed: Memo quiere VER la actividad, no solo capturarla. Va tal como lo
// manda el servidor (`created_at.desc`), sin re-ordenar aquí.
function _cobCajaFeed() {
  const cont = document.getElementById('cob-caja-feed');
  if (!cont) return;
  if (!_cobCajaUltimos.length) {
    cont.innerHTML = '<div class="cob-feed-vacio">Todavía no se registra ningún pago.</div>';
    return;
  }
  cont.innerHTML = _cobCajaUltimos.map((a) => `
    <div class="cob-feed-i">
      <div class="cob-feed-m">${_spFmtMxn(a.monto)}${a.tiene_foto ? ' <span class="cob-feed-foto" title="Tiene comprobante">📎</span>' : ''}</div>
      <div class="cob-feed-n">${_esfEsc(a.nombre || 'viajero')}</div>
      <div class="cob-feed-d">${_esfEsc(a.fecha || (a.created_at || '').slice(0, 10))}${a.capturado_por ? ' · ' + _esfEsc(a.capturado_por) : ''}</div>
      ${a.nota ? `<div class="cob-feed-x">${_esfEsc(a.nota)}</div>` : ''}
    </div>`).join('');
}










// ═══════════════════════════════════════════════════════════════
// GUERREROS Z — Sistema de perfiles, invitaciones, ranking
// ═══════════════════════════════════════════════════════════════
const EMAIL_ENDPOINT = '/.netlify/functions/send-invite';

const APP_URL = 'https://conectareynosa.mx/kamehouse';

let _gzCache = [];
let _gzFilter = 'todos';

const ROL_LABELS = {
  maestro_roshi: 'Maestro Roshi',
  bulma: 'Bulma',
  milk: 'Milk',
  mister_popo: 'Maestro Karin',
  coordinador: 'Coordinador',
  cc: 'Creador de Contenido',
};

const PUNTOS_TOUR = {
  concierto: 3,
  festival_1d: 5,
  festival_2d: 7,
  festival_3d: 10
};

// Festivales (multi-día) por SLUG del EV → nº de días. Todo lo demás (incl. multifecha)
// cuenta como concierto. Usado para derivar puntos AUTO de los tours asignados (DC2d).
const FESTIVALES = {
  palnorte: 3, edc2026: 3, coronacapital: 3,
  emblema: 2, arre: 2, ultramexico: 2, flowfest: 2
};

const TIPO_TOUR_LABEL = {
  concierto: 'Concierto',
  festival_1d: 'Festival 1 día',
  festival_2d: 'Festival 2 días',
  festival_3d: 'Festival 3 días'
};





// ── Puntos AUTO desde tours asignados (DC2d) ────────────────────────────────
// Las asignaciones (eventos_coordi.evento_id) son SLUGS del EV (ej. 'palnorte',
// 'karolg#2'). Derivamos tipo y fecha desde el EV — no desde la tabla 'eventos' de KH.







// ═══════════════════════════════════════════════════════════════════════════
// [EQ-1] EL MAPA rol → contratos. SELLADO POR MEMO el 31-jul-2026.
// [KAR-1] RE-SELLADO POR MEMO el 5-ago-2026: mister_popo pasa a llevar los DOS
// contratos. El Maestro Karin también coordina, así que su paquete es el mismo
// de bulma/milk. Eso reencuadró la custodia de bodega: no hacía falta llevar la
// casilla al contrato laboral —se intentó y se retiró— porque el anexo viaja en
// el de coordinador, que es justo donde su texto oficial ("EL COORDINADOR", el
// régimen de strikes) dice la verdad. El texto v1 se queda como está.
//
// Nace del re-onboarding en vivo: para saber qué le tocaba firmar a cada
// persona había que acordarse. Aquí queda escrito UNA vez y lo leen la tarjeta,
// el perfil y el botón que prellena el formulario.
//
// Las dos listas VACÍAS son decisiones, no huecos, y por eso llevan nota propia
// abajo: maestro_roshi es Memo (no se firma a sí mismo) y vendedor es
// COMISIONISTA — no hay vínculo laboral que firmar. Si algún día alguien ve la
// tarjeta de un vendedor sin contratos y "corrige" el mapa, deshace una
// decisión sin enterarse.
//
// La custodia de bodega NO aparece como plantilla porque NO ES UNA: es la
// casilla `datos.cuidador_bodega` DENTRO del contrato de coordinador. Un solo
// contrato con casilla, no dos contratos.
// ═══════════════════════════════════════════════════════════════════════════
const ROL_CONTRATOS = {
  maestro_roshi: [],
  bulma:         ['auxiliar_admin', 'coordinador'], // Sofía también coordina
  milk:          ['auxiliar_admin', 'coordinador'], // Ximena igual: auxiliar Y coordinadora
  mister_popo:   ['auxiliar_admin', 'coordinador'], // Maestro Karin: auxiliar Y coordinador; la custodia va como casilla en su contrato de coordinador
  coordinador:   ['coordinador'],
  cc:            ['creadora_team'],
};
// Por qué un rol NO firma. Vacío = el rol sí firma (o no aplica el aviso).
const ROL_SIN_CONTRATO = {
  maestro_roshi: 'no aplica: es la dirección',
};
// [EQ-6] Las plantillas que NO cuelgan de un evento. Decisión de negocio de
// Memo: el contrato de coordinador es ANUAL (cubre los eventos que le toquen
// durante su vigencia), igual que el laboral. Por evento quedan tres:
// creadora externa, creadora_team y giveaway.
//
// Una sola lista para que el formulario, el paquete y el relleno de columnas
// no puedan opinar distinto — que fue justo lo que pasó cuando el laboral era
// el único caso y cada quien lo escribía a mano.
const SIN_EVENTO = ['auxiliar_admin', 'coordinador'];

const PLANTILLA_LABELS = {
  creadora:       'Creadora de contenido',
  coordinador:    'Coordinador(a)',
  giveaway:       'Giveaway (premio)',
  creadora_team:  'Creadora del team',
  auxiliar_admin: 'Auxiliar administrativo',
};

// ⏳ Contratos de Guerreros Z (solo admin, best-effort). Reusa khContratos.listar
// (patrón #288/#309 — jamás service_role al navegador).
//
// [EQ-1] ANTES guardaba UN contrato por correo (el firmado de vigencia más
// lejana, solo coordinador/creadora_team). Ahora guarda TODOS —cualquier
// plantilla, firmados Y pendientes— porque la tarjeta ya no responde "¿cuándo
// vence?" sino "¿qué le falta?", y un contrato mandado sin firmar NO es un
// hueco: es un pendiente del otro lado, y se ve distinto.
//
// Fails-soft: si contratos no responde, _gzContratos queda null y las cards
// salen como antes (sin chip, ni siquiera "sin contrato") — mejor mudo que
// mintiendo "le falta todo" por una llamada caída.
let _gzContratos = null;





// 🧊 [TORRE O4] "Trae prestado": quién anda con piezas RETORNABLES que aún no
// regresan. Mismo molde que _gzCargarContratos — cómputo
// server-side (admin-salidas prestado_equipo, roles del cuidador) y fails-soft
// ESTRICTO: si el cálculo truena, _gzPrestado se queda en {} y Guerreros Z
// carga exactamente como hoy, sin un solo chip. Nunca viajan costos.
let _gzPrestado = null;






// ═══════════════════════════════════════════════════════════════════════════
// [EQ-2] LOS PAUSADOS EXISTEN.
//
// Dar de baja a alguien lo borraba de la pantalla: `loadEquipo` pedía solo
// activos y no había NINGÚN lugar en el Palacio donde volver a verlo. El
// historial seguía ahí, la cuenta seguía ahí — pero para la vista, la persona
// dejaba de existir. Reactivar a los cinco del re-onboarding fue eso.
// ═══════════════════════════════════════════════════════════════════════════
let _gzVista = 'activos';



















// [EQ-6] Aquí vivía _gzPaquetePoblarEventos, que llenaba un selector de eventos
// para el contrato de coordinador. Se va entero con el campo: el contrato es
// ANUAL y ya no cuelga de un evento. Se borra en vez de dejarlo sin llamar —
// una función que nadie llama es la que un arnés acaba midiendo por error.















// ═══════════════════════════════════════════════════════════════
// PING anti-pausa Supabase (cada 6 días = 518400000 ms)
// ═══════════════════════════════════════════════════════════════
function pingSupabase() {
 khEventos.ping(); // [sec-eventos]
}
setInterval(pingSupabase, 518400000);

// ═══════════════════════════════════════════════════════════════
// REGISTRO POR INVITACIÓN
// ═══════════════════════════════════════════════════════════════
// [EQ-7b] LA SALIDA DE LOS TRES LETREROS DE LINK MUERTO. Antes los tres decían
// "pídele a Memo que te mande uno nuevo" y ahí acababa la pantalla: ninguno
// daba POR DÓNDE pedírselo. Quien recibe dos invitaciones seguidas —lo normal
// en un re-onboarding— abre la vieja y se queda parado.
function _regBotonWA(asunto) {
  const url = 'https://wa.me/528119771072?text=' + encodeURIComponent('Hola, ' + asunto);
  return `<a href="${url}" target="_blank" rel="noopener"
    style="display:block;margin-top:18px;padding:13px 18px;background:var(--green,#57e389);color:#000;
           text-align:center;font-weight:800;font-size:13px;letter-spacing:.04em;text-decoration:none;
           border-radius:var(--r-btn,12px)">Escríbenos por WhatsApp →</a>`;
}

async function mostrarRegistroInvitado(token) {
  const screen = document.getElementById('login-screen');
  screen.style.display = 'flex';

  // Verificar token vía Netlify Function (pre-JWT; el invite_token es la credencial).
  let usuario = null;
  let _regReason = '';
  try {
    const vr = await khRegistroInvitado({ accion: 'validar', token }); // [sec-usuarios]
    if (vr.ok) usuario = vr.usuario; else _regReason = vr.reason || 'invalido';
  } catch(e) { _regReason = 'invalido'; }

  if (!usuario && _regReason === 'expirado') {
    screen.innerHTML = `
      <div class="login-bg"></div>
      <div class="login-card">
        <div class="login-logo">KAME<span>·</span>HOUSE</div>
        <div class="login-sub" style="color:var(--red)">Link expirado</div>
        <p style="color:var(--ts);font-size:13px;text-align:center;margin-top:12px;line-height:1.6">
          Este link venció (duran 48 horas).<br>Pídenos el nuevo y entras en un minuto.
        </p>
        ${_regBotonWA('Mi link de KameHouse expiró')}
      </div>`;
    return;
  }

  if (!usuario) {
    screen.innerHTML = `
      <div class="login-bg"></div>
      <div class="login-card">
        <div class="login-logo">KAME<span>·</span>HOUSE</div>
        <div class="login-sub" style="color:var(--red)">${_regReason === 'usado' ? 'Este link ya se usó' : 'Este link ya no sirve'}</div>
        <p style="color:var(--ts);font-size:13px;text-align:center;margin-top:12px;line-height:1.6">
          ${_regReason === 'usado'
            ? 'Con este link ya creaste tu cuenta. Entra normal con tu usuario y contraseña.<br>Si no te acuerdas de la contraseña, escríbenos y te la reponemos.'
            : 'Seguramente te mandamos uno más nuevo y este quedó muerto.<br>Pídenos el vigente y entras en un minuto.'}
        </p>
        ${_regBotonWA(_regReason === 'usado' ? 'No puedo entrar a KameHouse' : 'Necesito mi link nuevo de KameHouse')}
      </div>`;
    return;
  }

  // Mostrar formulario completo
  screen.innerHTML = `
    <div class="login-bg"></div>
    <div class="login-card" style="max-width:420px">
      <div class="login-logo">KAME<span>·</span>HOUSE</div>
      <div class="login-sub">Bienvenido al equipo</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--gold);text-align:center;margin-bottom:20px;text-transform:uppercase">
        ${ROL_LABELS[usuario.rol] || usuario.rol} · Conecta Reynosa
      </div>
      <div class="login-field">
        <label>Tu nombre completo *</label>
        <input type="text" id="reg-nombre" placeholder="Juan Pérez" autocomplete="name">
      </div>
      <div class="login-field">
        <label>Usuario (para iniciar sesión) *</label>
        <input type="text" id="reg-username" placeholder="juanpz · mipopo · lo que quieras" autocomplete="username">
      </div>
      <div class="login-field">
        <label>Contraseña *</label>
        <input type="password" id="reg-pass" placeholder="Mínimo 8 caracteres" autocomplete="new-password">
      </div>
      <div class="login-field">
        <label>Confirmar contraseña *</label>
        <input type="password" id="reg-pass2" placeholder="Repite tu contraseña" autocomplete="new-password">
      </div>
      <div class="login-field">
        <label>Celular</label>
        <input type="tel" id="reg-cel" placeholder="81 1234 5678">
      </div>

      <!-- [EQ-7] LOS DATOS DE SEGURIDAD EN VIAJE. No son "datos de perfil":
           son a quién le hablamos si algo pasa en la carretera, y la fecha que
           va impresa en el contrato de coordinador. La cuenta se estampaba
           perfil_completo=true sin ellos, así que nadie los volvía a pedir. -->
      <div style="border-top:1px solid var(--border);margin:18px 0 14px 0;padding-top:14px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--gold);text-transform:uppercase;margin-bottom:4px">Datos de seguridad</div>
        <div style="font-size:11px;color:var(--ts);line-height:1.5">Viajas con nosotros: necesitamos saber a quién avisarle si algo pasa. Tu fecha de nacimiento también va en tu contrato.</div>
      </div>
      <div class="login-field">
        <label>Fecha de nacimiento *</label>
        <input type="date" id="reg-fnac" max="${_mxFechaStr()}">
      </div>
      <div class="login-field">
        <label>Contacto de emergencia — nombre *</label>
        <input type="text" id="reg-em-nombre" placeholder="Mamá, pareja, hermano…" autocomplete="off">
      </div>
      <div class="login-field">
        <label>Contacto de emergencia — teléfono *</label>
        <input type="tel" id="reg-em-tel" placeholder="81 1234 5678" autocomplete="off">
      </div>
      <!-- [EQ-7b] El parentesco tiene su propio campo porque el documento lo
           imprime aparte: "NOMBRE (PARENTESCO) · TEL". Sin él la gente lo
           escribe DENTRO del nombre —"Memo Cobos (Esposo)"— y el contrato sale
           con "Memo Cobos (Esposo) (__________)". Pasó de verdad. -->
      <div class="login-field">
        <label>¿Qué es tuyo? *</label>
        <input type="text" id="reg-em-par" placeholder="Mamá, esposo, hermana…" autocomplete="off">
      </div>
      <div class="login-field">
        <label>Talla playera</label>
        <select id="reg-talla" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:10px 12px;font-size:14px;width:100%">
          <option value="">— Selecciona —</option>
          <option>XS</option><option>S</option><option>M</option><option>L</option><option>XL</option><option>XXL</option>
        </select>
      </div>
      <button class="login-btn" id="reg-btn" onclick="completarRegistro('${usuario.id}','${token}')">Crear mi cuenta →</button>
      <!-- [GR-12] role=alert: el que no ve la pantalla tampoco veía el aviso. -->
      <div id="reg-error" role="alert" aria-live="assertive" style="color:var(--red);font-size:13px;text-align:center;min-height:20px;margin-top:8px"></div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// [GR-12] EL AVISO DEL REGISTRO SE ESCONDÍA DE QUIEN LO NECESITA.
// `#reg-error` se pinta DEBAJO del botón, al fondo de una tarjeta de diez
// campos. Reproducido con el token real de Milk en móvil (390×844): el mensaje
// caía en y≈867 con 692 de viewport — fuera de pantalla, sin scroll ni marca.
// El usuario picaba "Crear mi cuenta" y veía que NO PASABA NADA.
// Cada `return` de validación ya sabía cuál campo falló; solo no lo decía.
// Esta es la pantalla por la que entra todo el equipo, así que el aviso ahora
// se trae a la vista y el campo culpable se marca y se enfoca.
// ═══════════════════════════════════════════════════════════════
function _regReducido() {
  try { return window.matchMedia('(prefers-reduced-motion:reduce)').matches; }
  catch (e) { return false; }
}

function _regLimpiarCulpable() {
  document.querySelectorAll('.reg-culpable').forEach(el => {
    el.classList.remove('reg-culpable');
    el.removeAttribute('aria-invalid');
  });
}

// Devuelve false SIEMPRE: cada validación es `return _regFalla(msg, campoId)`,
// así ningún return puede olvidarse de marcar el campo.
// campoId null = error del servidor, que no apunta a ningún campo.
function _regFalla(msg, campoId) {
  const errEl = document.getElementById('reg-error');
  if (errEl) errEl.textContent = msg;

  _regLimpiarCulpable();
  const campo = campoId ? document.getElementById(campoId) : null;
  if (campo) {
    campo.classList.add('reg-culpable');
    campo.setAttribute('aria-invalid', 'true');
    // preventScroll: enfocar arrastra el scroll por su cuenta, y ese arrastre
    // se llevaría de pantalla justo el aviso que vamos a centrar abajo.
    try { campo.focus({ preventScroll: true }); } catch (e) { campo.focus(); }
    // Al corregir, el rojo se va solo: dejarlo puesto convierte la marca en
    // ruido y el siguiente error ya no se distingue.
    const limpiar = () => {
      campo.classList.remove('reg-culpable');
      campo.removeAttribute('aria-invalid');
    };
    campo.addEventListener('input',  limpiar, { once: true });
    campo.addEventListener('change', limpiar, { once: true });
  }

  // El aviso se mueve AL FINAL, en el frame siguiente: si un navegador ignora
  // preventScroll (Safari viejo) y arrastra el scroll al enfocar, este scroll
  // corre después y gana. El mensaje es lo último que se posiciona.
  if (errEl) requestAnimationFrame(() => {
    try { errEl.scrollIntoView({ block: 'center', behavior: _regReducido() ? 'auto' : 'smooth' }); }
    catch (e) { errEl.scrollIntoView(); }
  });
  return false;
}

async function completarRegistro(userId, token) {
  const nombre   = (document.getElementById('reg-nombre').value || '').trim();
  const username = (document.getElementById('reg-username').value || '').trim().toLowerCase().replace(/\s+/g,'');
  const pass     = document.getElementById('reg-pass').value;
  const pass2    = document.getElementById('reg-pass2').value;
  const btn      = document.getElementById('reg-btn');

  // [GR-12] cada return nombra su campo culpable — ver _regFalla.
  if (!nombre)    { _regFalla('El nombre es obligatorio', 'reg-nombre'); return; }
  if (!username)  { _regFalla('Elige un nombre de usuario', 'reg-username'); return; }
  // 🔐 CAP2-2: espejo del mínimo del servidor (8). Si el cliente pidiera 6, el
  // usuario teclearía una de 7 y recibiría un error crudo del backend en vez de
  // este aviso amable.
  if (pass.length < 8) { _regFalla('La contraseña debe tener mínimo 8 caracteres', 'reg-pass'); return; }
  if (pass !== pass2)  { _regFalla('Las contraseñas no coinciden', 'reg-pass2'); return; }
  // [EQ-7] Los datos de seguridad son OBLIGATORIOS. Espejo del candado del
  // servidor: si solo estuviera allá, el aviso llegaría crudo y hasta el final.
  const fnac  = (document.getElementById('reg-fnac').value || '').trim();
  const emNom = (document.getElementById('reg-em-nombre').value || '').trim();
  const emTel = (document.getElementById('reg-em-tel').value || '').trim();
  if (!fnac) { _regFalla('Falta tu fecha de nacimiento', 'reg-fnac'); return; }
  if (!emNom) { _regFalla('Falta el nombre de tu contacto de emergencia', 'reg-em-nombre'); return; }
  if (emTel.replace(/\D/g, '').length < 10) { _regFalla('El teléfono de emergencia va a 10 dígitos', 'reg-em-tel'); return; }
  const emPar = (document.getElementById('reg-em-par').value || '').trim();
  if (!emPar) { _regFalla('¿Qué es tuyo esa persona? (mamá, esposo, hermana…)', 'reg-em-par'); return; }
  if (fnac >= _mxFechaStr()) { _regFalla('Revisa tu fecha de nacimiento', 'reg-fnac'); return; }

  btn.textContent = 'Creando cuenta…'; btn.disabled = true;

  try {
    const cel   = document.getElementById('reg-cel').value.trim();
    const talla = document.getElementById('reg-talla').value;
    // [sec-usuarios] El alta (re-valida token + username, hashea con bcrypt y activa
    // la cuenta) ocurre server-side. El id se deriva del token, no del cliente.
    const res = await khRegistroInvitado({
      accion: 'completar', token, nombre, username, password: pass,
      celular: cel || undefined, talla_playera: talla || undefined,
      // [EQ-7] sin estos tres el servidor rechaza: no hay sello sin seguridad
      fecha_nacimiento: fnac, nombre_emergencia: emNom, num_emergencia: emTel,
      parentesco_emergencia: emPar,
    });
    if (!res.ok) {
      // Sin campo culpable: el servidor manda el motivo, no el renglón.
      _regFalla(res.error || 'Error al crear la cuenta', null);
      btn.textContent = 'Crear mi cuenta →'; btn.disabled = false;
      return;
    }
    currentUser = res.user;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: currentUser, expires: Date.now() + SESSION_HOURS * 3600000 }));
    window.history.replaceState({}, '', window.location.pathname);
    enterApp();
  } catch(e) {
    _regFalla(e.message || 'Error al crear la cuenta', null);
    btn.textContent = 'Crear mi cuenta →'; btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// INIT — MOVIDO AL FINAL DEL ARCHIVO (hotfix 24-jul-2026).
// El arranque vivía aquí (mitad del archivo) porque era el final del PRIMER
// <script> inline; al unificar los bloques en kamehouse.js (V2 #326), un boot
// con sesión ejecutaba rutas síncronas que tocaban `let`/`const` declarados
// MÁS ABAJO → TDZ ("Cannot access '_contratosEVCache' before initialization")
// y la evaluación moría a media página. El boot SIEMPRE debe correr después
// de que TODO el archivo declaró. Ver el bloque INIT al final.
// ═══════════════════════════════════════════════════════════════

// Cerrar dropdown desktop al hacer click fuera (no aplica al bottom-sheet)
document.addEventListener('click', function(e) {
  const dd = document.getElementById('nav-dropdown-herramientas');
  if (dd && !dd.contains(e.target)) dd.classList.remove('open');
});

// ── Tools bottom-sheet (móvil) ───────────────────────────────────
// Construido al vuelo a partir de los items reales del dropdown, así
// agregar/quitar items en un solo lugar (el HTML del dropdown) se refleja
// automáticamente en el sheet sin duplicar markup.
function openToolsSheet() {
  const sheet = document.getElementById('tools-sheet');
  const list  = document.getElementById('tools-sheet-list');
  if (!sheet || !list) return;
  // Repoblar cada vez por si el rol del usuario filtró visibilidad de items
  const src = document.querySelectorAll('#nav-dropdown-herramientas .nav-dropdown-item');
  list.innerHTML = '';
  src.forEach(srcBtn => {
    if (srcBtn.offsetParent === null && getComputedStyle(srcBtn).display === 'none') return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tools-sheet-item' + (srcBtn.classList.contains('active') ? ' active' : '');
    b.dataset.itemId = srcBtn.id;
    b.innerHTML = `<span>${srcBtn.textContent.trim()}</span><span class="ts-chevron" aria-hidden="true">›</span>`;
    b.addEventListener('click', () => {
      closeToolsSheet();
      // Pequeño delay para que la animación de cierre se vea y el sheet no
      // tape la transición a la nueva página
      setTimeout(() => srcBtn.click(), 80);
    });
    list.appendChild(b);
  });
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';
  cerrarNavMobile(); // por si el wrapper hamburguesa estaba abierto detrás
}

function closeToolsSheet() {
  const sheet = document.getElementById('tools-sheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  document.body.style.overflow = '';
}

// Wire de los triggers del sheet (idempotente — corre solo una vez)
(function wireToolsSheet() {
  const sheet = document.getElementById('tools-sheet');
  if (!sheet || sheet.dataset.wired) return;
  sheet.dataset.wired = '1';
  sheet.addEventListener('click', (e) => {
    // Backdrop click (no panel interno)
    if (e.target === sheet) closeToolsSheet();
  });
  const closeBtn = document.getElementById('tools-sheet-close');
  if (closeBtn) closeBtn.addEventListener('click', closeToolsSheet);
  // ESC cierra (útil para usuarios con teclado / orientación landscape con teclado)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('open')) closeToolsSheet();
  });
  // Si el usuario rota a desktop con el sheet abierto, lo cerramos para
  // evitar que quede un overlay raro encima del dropdown desktop.
  let _toolsResizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(_toolsResizeT);
    _toolsResizeT = setTimeout(() => {
      if (!window.matchMedia('(max-width: 768px)').matches && sheet.classList.contains('open')) {
        closeToolsSheet();
      }
    }, 150);
  });
})();

// HTML del recibos embebido
// RECIBOS_HTML → base64


function showHerramienta(name) {
  // [SEG-2] ESCONDER NO ES IMPEDIR. El botón oculto solo tapa el camino del
  // ratón; showHerramienta('recibos') desde la consola, un enlace viejo o el
  // historial entraban igual. Aquí se rebota.
  if (!_puedeVerTab(name)) { showToast('No tienes acceso a esta herramienta', 'error'); return; }
  // Cerrar dropdown
  document.getElementById('nav-dropdown-herramientas').classList.remove('open');

  // Deactivate all pages and nav buttons
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .nav-dropdown-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-dropdown-item').forEach(b => b.classList.remove('active'));

  // Activate page
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  // Mark dropdown btn active
  document.getElementById('nav-herramientas').classList.add('active');
  const item = document.getElementById('nav-' + name);
  if (item) item.classList.add('active');
  // [HER-1a] Y se DESPLIEGA el grupo si estaba plegado. Es la misma cortesía que
  // `showPage` le hace a los otros cuatro: marcar como activo un item escondido
  // deja la pantalla abierta y el menú sin decir dónde estás.
  const grpHerr = document.getElementById('nav-dropdown-herramientas');
  if (grpHerr) grpHerr.classList.remove('collapsed');

  if (name === 'recibos') {
    if (!recibosLoaded) {
      const frame = document.getElementById('frame-recibos');
      if (frame) {
        frame.removeAttribute('srcdoc');
        frame.src = './recibos_v6.html';
        recibosLoaded = true;
      }
    }
  }
  if (name === 'diseno') {
    if (!disenoLoaded) {
      const frame = document.getElementById('frame-diseno');
      if (frame) {
        frame.removeAttribute('srcdoc');
        frame.src = './diseno.html';
        disenoLoaded = true;
      }
    }
  }
  if (name === 'contratos') {
    loadContratos();
  }
  if (name === 'waitlist') {
    loadWaitlist();
  }
  // ROL Analytics se mudó a la pestaña RADAR DEL DRAGÓN como sub-pestaña.
  // Si el admin sale de cualquier herramienta, paramos los timers del Radar.
  stopRolAnalyticsAutoRefresh();
}


function cerrarNavMobile() {
  const wrapper = document.getElementById('nav-items-wrapper');
  const btn = document.getElementById('nav-hamburger-btn');
  if (wrapper) wrapper.classList.remove('open');
  if (btn) btn.classList.remove('open');
}

// Actualizar label de sección activa en mobile
function actualizarLabelNavMobile(nombre) {
  const label = document.getElementById('nav-mobile-section-label');
  if (label) label.textContent = nombre.toUpperCase();
}

// ── D2: SIDEBAR (drawer móvil) + BARRA INFERIOR ─────────────
// Abrir/cerrar el sidebar como drawer off-canvas en móvil.
function khAbrirMenu() {
  const sb = document.getElementById('kh-sidebar');
  const sc = document.getElementById('kh-scrim');
  if (sb) sb.classList.add('drawer-open');
  if (sc) sc.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function khCerrarMenu() {
  const sb = document.getElementById('kh-sidebar');
  const sc = document.getElementById('kh-scrim');
  if (sb) sb.classList.remove('drawer-open');
  if (sc) sc.classList.remove('show');
  document.body.style.overflow = '';
}

// Sincroniza la barra inferior y limpia grupos vacíos del sidebar.
// NO toca permisos: solo refleja el estado de display que ya aplicó
// aplicarPermisosUI sobre cada #nav-<tab>.
function _khNavSync(name) {
  // Al navegar a una pestaña normal, limpiar el resaltado de items de Herramientas
  // (showHerramienta lo vuelve a poner cuando se abre una herramienta).
  document.querySelectorAll('.nav-dropdown-item.active, #nav-herramientas.active')
    .forEach(b => b.classList.remove('active'));
  // Barra inferior: marcar destino activo + ocultar los que el rol no permite.
  document.querySelectorAll('.kh-bb-item[data-tab]').forEach(b => {
    const tab = b.dataset.tab;
    b.classList.toggle('active', tab === name);
    const src = document.getElementById('nav-' + tab);
    b.style.display = (src && src.style.display !== 'none') ? '' : 'none';
  });
  // Ocultar encabezado de grupos del sidebar que quedaron sin items visibles.
  // El grupo Herramientas se omite: su visibilidad la maneja aplicarPermisosUI.
  document.querySelectorAll('#kh-sidebar .nav-group').forEach(g => {
    if (g.id === 'nav-dropdown-herramientas') return;
    const items = g.querySelectorAll('.nav-btn');
    const algunoVisible = Array.from(items).some(b => b.style.display !== 'none');
    g.style.display = algunoVisible ? '' : 'none';
  });
}

// Colapsar/expandir un grupo del nav por su título. Persiste en localStorage por
// texto del título. Solo la CLASE 'collapsed' (los botones se ocultan por CSS),
// nunca el style.display individual → no rompe el gating por rol.
function toggleNavGroup(titleEl) {
  const group = titleEl.parentElement;
  const colapsado = group.classList.toggle('collapsed');
  try { localStorage.setItem('navcol:' + titleEl.textContent.trim(), colapsado ? '1' : '0'); } catch (e) {}
}

// Restaura el estado colapsado guardado (solo los títulos colapsables llevan onclick).
(function restoreNavGroups() {
  document.querySelectorAll('#kh-sidebar .nav-group-title[onclick]').forEach(t => {
    try { if (localStorage.getItem('navcol:' + t.textContent.trim()) === '1') t.parentElement.classList.add('collapsed'); } catch (e) {}
  });
})();

// En móvil, cualquier click dentro del sidebar (pestaña o herramienta) cierra el drawer.
(function wireSidebarDrawer() {
  const sb = document.getElementById('kh-sidebar');
  if (!sb || sb.dataset.wiredDrawer) return;
  sb.dataset.wiredDrawer = '1';
  sb.addEventListener('click', e => {
    if (e.target.closest('.nav-btn, .nav-dropdown-item')) khCerrarMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') khCerrarMenu();
  });
})();


// CAPSULE CORPS — reemplazado abajo


// ═══════════════════════════════════════════════════════════════
// CAPSULE CORPS — COMPLETO
// ═══════════════════════════════════════════════════════════════
let _ccEventoActual = null;
let _ccViajeros = [];
let _ccHabitaciones = [];
let _vj5KH = [];   // [VJ-5] viajeros KH del evento (para acomodarlos en cuartos)
let _ccEventosCache = [];
let _ccAsignados = [];
let _ccFiltroFecha = 'todos';   // filtro de fecha activo (todos/proximo/pasado); se combina con el buscador

const TIPOS_EVENTO = {
  concierto: 'Concierto',
  festival_1d: 'Festival 1 día',
  festival_2d: 'Festival 2 días',
  festival_3d: 'Festival 3 días',
};



async function loadCapsule() {
  const g = document.getElementById('cc-eventos-grid');
  try {
    const ev = await _fetchEVFromIndex();
    _ccEventosCache = (ev || [])
      .filter(e => e && e.id && e.a)
      .map(_ccEvFromEV);
    // [ORD-1] Ordenaba DESCENDENTE: el evento más lejano arriba y el próximo a
    // media lista. Es la parrilla de eventos de Capsule, la misma regla que
    // todo lo demás.
    _ccEventosCache = _evOrdenarPorFecha(_ccEventosCache);
    renderCCEventos(_ccEventosCache, 'todos');
  } catch(e) {
    if (g) g.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

// ── Tabs ────────────────────────────────────────────────────
function showCCTab(tab, btn) {
  document.querySelectorAll('#page-capsule .gz-filter[id^="cc-tab-btn"]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('cc-tab-lista').style.display   = tab === 'lista'   ? '' : 'none';
  document.getElementById('cc-tab-detalle').style.display = tab === 'detalle' ? '' : 'none';
}

function showCCSubTab(sub, btn) {
  document.querySelectorAll('#page-capsule .gz-filter[id^="cc-sub-btn"]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  ['equipo','viajeros','rooming','transporte','pagos'].forEach(s => {
    const el = document.getElementById(`cc-sub-${s}`);
    if (el) el.style.display = s === sub ? '' : 'none';
  });
  // [F3] Transporte carga LAZY al abrir su sub-tab (no encarece abrirDetalleEvento)
  // y se refresca en cada visita. Fails-soft: no bloquea al resto del detalle.
  if (sub === 'transporte' && _ccEventoActual) loadTransporte(_ccEventoActual);
  // [Pagos-T1] Bandeja de separos: carga LAZY al abrir, se refresca en cada visita.
  if (sub === 'pagos' && _ccEventoActual) loadCCPagos(_ccEventoActual);
}

// ═══════════════════════════════════════════════════════════════════════════
// [Pagos-T1] Sub-tab "Pagos" de Capsule Corp — bandeja de separos.
// La casa nueva de las solicitudes APROBADAS (en_pagos + pagado) de un evento.
// Reusa admin-solicitudes-list (flags multifecha+con_pagos) y el MISMO modal
// global de detalle de solicitud.
//
// [E5-6] LA T2 YA OCURRIÓ: "Solicitudes Portal" quedó en pendientes/canceladas
// (su <select> no ofrece otra cosa) y las aprobadas viven AQUÍ. El comentario
// viejo prometía una convivencia "hasta la T2" que ya terminó, y el próximo que
// lo leyera creería que Solicitudes Portal está en camino de morir. No lo está:
// desde E5-6 es la pestaña "Por aprobar" de la puerta única de Pagos.
//
// ⚠️ COLISIÓN DE NOMBRES, anotada a propósito donde se va a leer: hay DOS cosas
// llamadas "Pagos" y no son la misma. Ésta es un SUB-TAB de Capsule, vive dentro
// del contexto de UN evento y muestra separos aprobados. La otra es la PUERTA
// del menú (page-pagos), que es cobranza de tours activos del portal. Si alguien
// dice "está en Pagos", hay que preguntar en cuál. No es bloqueante — los
// contextos son distintos — pero que nadie lo descubra depurando.
// ═══════════════════════════════════════════════════════════════════════════
let _ccPagos = [];              // filas aprobadas del evento actual (con pagos embebidos)
let _ccPagosCtx = false;        // true = el modal de solicitud se abrió DESDE este sub-tab
let _ccPagosLoading = false;

// Abonado/Total de una solicitud desde sus cuotas embebidas (pagos). Fórmula
// IDÉNTICA al modal / admin-cobranza-list: total = Σ monto del plan; abonado =
// Σ (monto_pagado ?? monto) de las cuotas 'pagado'. Sin plan aún → total cae a
// precio_total para que la barra tenga denominador.
function _ccPagoStats(s) {
  const pagos = Array.isArray(s.pagos) ? s.pagos : [];
  const total = pagos.reduce((a, p) => a + Number(p.monto || 0), 0) || Number(s.precio_total || 0) || 0;
  const abonado = pagos.filter(p => p.estado === 'pagado')
    .reduce((a, p) => a + (Number(p.monto_pagado ?? p.monto) || 0), 0);
  return { total, abonado };
}

// Pill de estado — en_pagos amarillo · pagado verde (colores de la spec T1).
function _ccPagoEstadoPill(estado) {
  const map = {
    en_pagos: { t: 'En pagos', c: '#e8a800', bg: 'rgba(232,168,0,.12)', bd: 'rgba(232,168,0,.35)' },
    pagado:   { t: 'Pagado',   c: '#3DDC84', bg: 'rgba(61,220,132,.12)', bd: 'rgba(61,220,132,.35)' },
  };
  const m = map[estado] || { t: estado || '—', c: 'var(--ts)', bg: 'var(--bg3)', bd: 'var(--border)' };
  return `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 8px;border-radius:var(--r-card,16px);color:${m.c};background:${m.bg};border:1px solid ${m.bd};white-space:nowrap">${m.t}</span>`;
}

// [F3b] Contador compacto "N/M firmados" por solicitud (verde si todos firmados,
// ámbar si faltan). Sin contratos (solicitud vieja) → nada.
function _ccContratosPill(c) {
  if (!c || !Number(c.total)) return '';
  const firmados = Number(c.firmados) || 0, total = Number(c.total) || 0;
  const todos = firmados >= total;
  const col = todos ? { c: '#3DDC84', bg: 'rgba(61,220,132,.12)', bd: 'rgba(61,220,132,.35)' }
                    : { c: '#e8a800', bg: 'rgba(232,168,0,.12)', bd: 'rgba(232,168,0,.35)' };
  return `<span title="Contratos firmados del grupo" style="display:inline-block;margin-left:6px;font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 8px;border-radius:var(--r-card,16px);color:${col.c};background:${col.bg};border:1px solid ${col.bd};white-space:nowrap"><svg class="ic" style="width:11px;height:11px;vertical-align:-1px"><use href="#ic-boleto"/></svg> ${firmados}/${total} firmados</span>`;
}

async function loadCCPagos(eventoId) {
  if (_ccPagosLoading) return;
  _ccPagosLoading = true;
  const listEl = document.getElementById('cc-pagos-list');
  const headEl = document.getElementById('cc-pagos-header');
  if (listEl) listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ts);font-family:\'JetBrains Mono\',monospace;font-size:11px">// cargando pagos…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-solicitudes-list', {
      method: 'POST',
      headers: _spAdminHeaders(),
      // multifecha: trae el slug base + todas sus fechas (festival). con_pagos:
      // embebe las cuotas para calcular abonado/total sin llamada por fila.
      body: JSON.stringify({ evento_id: eventoId, multifecha: true, con_pagos: true, con_contratos: true, limit: 500 }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error cargando pagos');
    // SOLO aprobadas: en_pagos + pagado (las pendientes se quedan en la T2).
    _ccPagos = (data.solicitudes || []).filter(s => s.estado === 'en_pagos' || s.estado === 'pagado');
    // Puente al modal global: el modal y sus sub-acciones buscan por _spCache.find.
    // Unimos (por id) las filas de Capsule a _spCache para que funcionen invocadas
    // desde aquí. Es transitorio: entrar a Solicitudes Portal recarga _spCache.
    const byId = new Map((_spCache || []).map(x => [x.id, x]));
    _ccPagos.forEach(s => byId.set(s.id, s));
    _spCache = Array.from(byId.values());
    // [CAP-FIX-2] Si no hay nada del Portal, el vacío quiere decir cuántos
    // viajeros SÍ tiene el evento — y eso vive en el mundo KH. Solo se pide
    // cuando hace falta: con solicitudes del Portal, ni se consulta.
    if (!_ccPagos.length) { await _vj5Cargar(); }
    _renderCCPagos();
  } catch (e) {
    if (listEl) listEl.innerHTML = `<div style="padding:20px;text-align:center;color:#FF6B6B">Error: ${_spEscape(e.message)}</div>`;
    if (headEl) headEl.textContent = '';
    showToast('No se pudieron cargar los pagos: ' + e.message, 'error');
  } finally {
    _ccPagosLoading = false;
  }
}

function _renderCCPagos() {
  const listEl = document.getElementById('cc-pagos-list');
  const headEl = document.getElementById('cc-pagos-header');
  if (!listEl) return;

  if (!_ccPagos.length) {
    if (headEl) headEl.textContent = '';
    // [CAP-FIX-2] Un evento SOLO-KH (melanie: cero solicitudes del Portal) no
    // está vacío — es que esta pantalla mira al otro mundo. Decirlo en humano,
    // y decir dónde SÍ está su dinero, en vez de dejar un vacío que parece un
    // error. El conteo sale de lo que Capsule ya cargó; si no hay nada cargado,
    // se usa el texto de siempre en vez de afirmar un número que no tenemos.
    const nKH = (_vj5KH || []).length;
    listEl.innerHTML = nKH
      ? `<div class="empty-state"><div class="empty-icon">·</div>
           Este evento no tiene solicitudes del Portal.<br>
           Sus <b>${nKH}</b> viajeros vienen del Excel: su dinero se lleva en
           <b>Detalle</b> (saldos y abonos) y el total del evento en <b>Por Evento</b>.
         </div>`
      : '<div class="empty-state"><div class="empty-icon">·</div>Aún no hay solicitudes aprobadas en este evento.</div>';
    return;
  }

  // Cabecera: N solicitudes · $X abonado de $Y (suma de la lista).
  let sumAbon = 0, sumTotal = 0;
  _ccPagos.forEach(s => { const st = _ccPagoStats(s); sumAbon += st.abonado; sumTotal += st.total; });
  if (headEl) {
    const n = _ccPagos.length;
    headEl.innerHTML = `<b style="color:var(--ink)">${n}</b> solicitud${n === 1 ? '' : 'es'} aprobada${n === 1 ? '' : 's'} · <b style="color:#3DDC84">${_spFmtMxn(sumAbon)}</b> abonado de <b style="color:var(--ink)">${_spFmtMxn(sumTotal)}</b>`;
  }

  const head = `
    <thead>
      <tr style="background:var(--bg3);text-align:left">
        <th style="padding:9px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts)">Cliente</th>
        <th style="padding:9px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts);white-space:nowrap">Solicitud</th>
        <th style="padding:9px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts)">Paquete / Zona</th>
        <th style="padding:9px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts);text-align:center">Pers.</th>
        <th style="padding:9px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts);min-width:160px">Abonado / Total</th>
        <th style="padding:9px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts)">Estado</th>
        <th style="padding:9px 8px"></th>
      </tr>
    </thead>`;

  const body = _ccPagos.map(s => {
    const c = s.clientes || {};
    const st = _ccPagoStats(s);
    const pct = st.total > 0 ? Math.min(100, Math.round(st.abonado / st.total * 100)) : 0;
    const barColor = s.estado === 'pagado' ? '#3DDC84' : 'var(--orange)';
    // Chip multifecha "Fecha N" (fecha única → sin chip). Reusa _rgFechaIdx.
    const fi = _rgFechaIdx(s.evento_id);
    const chip = fi === null ? '' : `<span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--ts);border:1px solid var(--border);border-radius:var(--r-card,16px);padding:1px 7px;letter-spacing:.06em;margin-left:6px">Fecha ${fi + 1}</span>`;
    return `
      <tr style="border-top:1px solid var(--border)">
        <td style="padding:9px 8px;font-size:13px">${_spEscape(c.nombre_completo || '—')}<br><span style="font-family:'JetBrains Mono',monospace;color:var(--orange);font-size:11px">#${_spEscape(c.numero_cliente || '—')}</span></td>
        <td style="padding:9px 8px;font-size:12px;color:var(--ts);white-space:nowrap" title="${_spEscape(_spFmtFechaAbs(s.created_at))}">${_spEscape(_spFmtFechaRel(s.created_at))}${chip}</td>
        <td style="padding:9px 8px;font-size:12px"><b>${_spEscape(s.paquete || '—')}</b>${s.zona ? `<br><span style="color:var(--ts)">${_spEscape(s.zona)}</span>` : ''}</td>
        <td style="padding:9px 8px;font-size:13px;text-align:center">${Number(s.num_personas || 0) || '—'}</td>
        <td style="padding:9px 8px;font-size:12px">
          <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:3px"><b style="color:#3DDC84">${_spFmtMxn(st.abonado)}</b><span style="color:var(--ts)">${_spFmtMxn(st.total)}</span></div>
          <div style="height:5px;background:var(--bg3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px"></div></div>
        </td>
        <td style="padding:9px 8px">${_ccPagoEstadoPill(s.estado)}${_ccContratosPill(s.contratos)}</td>
        <td style="padding:9px 8px;text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="verSolicitudPagosCC('${_spEscape(s.id)}')" style="font-size:11px">Ver detalles</button></td>
      </tr>`;
  }).join('');

  listEl.innerHTML = `<div class="table-wrap"><table style="width:100%;border-collapse:collapse">${head}<tbody>${body}</tbody></table></div>`;
}

// "Ver detalles" desde el sub-tab Pagos: marca el contexto para que los refrescos
// del modal actualicen ESTA lista (no la página Solicitudes Portal) y abre el
// MISMO modal global de siempre.
function verSolicitudPagosCC(id) {
  _ccPagosCtx = true;
  verSolicitudPortal(id);
}

// Refresco de la lista de fondo tras una acción del modal de solicitud. Si el
// modal se abrió desde el sub-tab Pagos (T1) → refresca ESE sub-tab (y re-mergea
// a _spCache); si no → la página Solicitudes Portal, como siempre. [Pagos-T1]
function _spRefrescarLista() {
  if (_ccPagosCtx && _ccEventoActual) { loadCCPagos(_ccEventoActual); return; }
  loadSolicitudesPortal();
}

// ── Filtro eventos (fecha + buscador, combinados) ────────────
function filtrarCCEventos(filtro, btn) {
  document.querySelectorAll('#page-capsule .gz-filter[id^="ccf-"]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _ccFiltroFecha = filtro;        // recuerda el filtro de fecha activo
  filtrarCapsule();               // re-aplica fecha + texto del buscador
}

// Buscador por nombre; se combina con el filtro de fecha activo (_ccFiltroFecha).
// Texto vacío → solo aplica el filtro de fecha (igual que antes).
function filtrarCapsule() {
  const q = (document.getElementById('cc-buscar')?.value || '').trim().toLowerCase();
  const lista = q
    ? _ccEventosCache.filter(e => String(e.nombre || '').toLowerCase().includes(q))
    : _ccEventosCache;
  renderCCEventos(lista, _ccFiltroFecha);
}

function renderCCEventos(lista, filtro) {
  const grid = document.getElementById('cc-eventos-grid');
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  let filtrada = lista;
  if (filtro === 'proximo') filtrada = lista.filter(e => new Date(e.fecha+'T12:00:00') >= hoy);
  if (filtro === 'pasado')  filtrada = lista.filter(e => new Date(e.fecha+'T12:00:00') < hoy);

  if (!filtrada.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">·</div>Sin eventos — crea el primero con "+ Nuevo Evento"</div>';
    return;
  }
  grid.innerHTML = filtrada.map(e => {
    const fecha = new Date(e.fecha+'T12:00:00');
    const pasado = fecha < hoy;
    const tipoLabel = TIPOS_EVENTO[e.tipo_evento] || e.tipo_tour || 'Concierto';
    return `<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${pasado?'var(--border)':'var(--orange)'};border-radius:var(--radius);padding:16px 20px;margin-bottom:10px;cursor:pointer;transition:border-color .2s" onclick="abrirDetalleEvento('${e.id}')" onmouseenter="this.style.borderColor='var(--orange)'" onmouseleave="this.style.borderColor='${pasado?'var(--border)':'var(--orange)'}'"">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:20px;margin-bottom:2px">${_esfEsc(e.nombre)}</div>
          <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ts)">
            ${e.artista ? _esfEsc(e.artista) + ' · ' : ''}${_esfEsc(e.ciudad||'')} · ${fecha.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})}
          </div>
          <div style="margin-top:6px">
            <span style="font-size:10px;padding:2px 8px;background:rgba(255,107,0,.12);border:1px solid rgba(255,107,0,.25);border-radius:4px;color:var(--orange);font-family:'JetBrains Mono',monospace">${tipoLabel}</span>
            ${pasado ? `<span style="font-size:10px;padding:2px 8px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:4px;color:var(--ts);font-family:'JetBrains Mono',monospace;margin-left:6px">pasado</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <!-- Editar/eliminar OCULTOS: los eventos vienen de index.html (no de la tabla
               vieja 'eventos'), estos botones apuntan al sistema viejo. Editar eventos =
               Palacio de Kamisama. Código conservado por si se reusa.
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();abrirModalEditarEvento('${e.id}')" style="font-size:11px">⎘</button>
          ${_puedeBorrarAdmin() ? `<button class="btn btn-red btn-sm" onclick="event.stopPropagation();eliminarEventoCC('${e.id}')" style="font-size:11px">✕</button>` : ''}
          -->
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();abrirDetalleEvento('${e.id}')" style="font-size:11px">Ver →</button>
        </div>
      </div>
      ${e.notas_internas ? `<div style="margin-top:10px;font-size:11px;color:var(--ts);padding:8px 12px;background:rgba(255,255,255,.03);border-radius:var(--r-sm,8px);border-left:2px solid var(--border)">${_esfEsc(e.notas_internas)}</div>` : ''}
    </div>`;
  }).join('');
}

// ── Crear / Editar evento ────────────────────────────────────
function abrirModalCrearEvento() { abrirModalEvento(null); }
function abrirModalEditarEvento(id) { abrirModalEvento(id); }

function abrirModalEvento(id) {
  const e = id ? _ccEventosCache.find(x => x.id === id) : {};
  document.getElementById('modal-cc-evento').innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">${id ? 'Editar Evento' : 'Nuevo Evento'}</div>
        <button class="modal-close" onclick="closeModal('modal-cc-evento')">×</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="ccev-id" value="${e?.id||''}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="grid-column:1/-1">
            <label>Nombre del tour *</label>
            <input class="cot-input" id="ccev-nombre" value="${_esfEsc(e?.nombre||'')}" placeholder="Ej: RAMMSTEIN CDMX…" style="width:100%">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Artista</label>
            <input class="cot-input" id="ccev-artista" value="${_esfEsc(e?.artista||'')}" placeholder="Nombre del artista…" style="width:100%">
          </div>
          <div class="form-group">
            <label>Ciudad *</label>
            <input class="cot-input" id="ccev-ciudad" value="${_esfEsc(e?.ciudad||'')}" placeholder="CDMX, MTY…">
          </div>
          <div class="form-group">
            <label>Fecha *</label>
            <input class="cot-input" type="date" id="ccev-fecha" value="${e?.fecha||''}">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Tipo de evento</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${Object.entries(TIPOS_EVENTO).map(([k,v]) =>
                `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;padding:6px 12px;border:1px solid var(--border);border-radius:var(--r-sm,8px);background:${(e?.tipo_evento||'concierto')===k?'rgba(255,107,0,.12)':'transparent'}">
                  <input type="radio" name="ccev-tipo" value="${k}" ${(e?.tipo_evento||'concierto')===k?'checked':''} style="accent-color:var(--orange)"> ${v}
                </label>`
              ).join('')}
            </div>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Zonas / tipos de boleto</label>
            <input class="cot-input" id="ccev-zonas" value="${(e?.zonas_boleto||[]).join(', ')}" placeholder="Floor, GA, VIP, Diamante, Palco… (separadas por coma)" style="width:100%">
            <div style="font-size:10px;color:var(--ts);margin-top:4px">Escribe las zonas separadas por coma — aparecerán como opciones al agregar viajeros</div>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Notas internas para el equipo</label>
            <textarea class="cot-input" id="ccev-notas" rows="3" placeholder="Punto de encuentro, indicaciones generales, dress code…" style="width:100%;resize:vertical">${_esfEsc(e?.notas_internas||'')}</textarea>
          </div>
        </div>
        <div id="ccev-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-cc-evento')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarEventoCC()">Guardar evento</button>
      </div>
    </div>`;
  openModal('modal-cc-evento');
}

async function eliminarEventoCC(id) {
  const ev = _ccEventosCache.find(e => e.id === id);
  const nombre = ev?.nombre || 'este evento';
  if (!confirm(`¿Eliminar "${nombre}"?\n\nEsto también eliminará viajeros y rooming list. No se puede deshacer.`)) return;
  try {
    await khEventos.eliminar(id); // [sec-eventos]
    await loadCapsule();
  } catch(e) { alert('Error al eliminar: ' + e.message); }
}

async function guardarEventoCC() {
  const id     = document.getElementById('ccev-id')?.value;
  const nombre = document.getElementById('ccev-nombre')?.value.trim();
  const ciudad = document.getElementById('ccev-ciudad')?.value.trim();
  const fecha  = document.getElementById('ccev-fecha')?.value;
  const alert  = document.getElementById('ccev-alert');
  if (!nombre) { alert.innerHTML='<div class="alert alert-error">El nombre es obligatorio</div>'; return; }
  if (!fecha)  { alert.innerHTML='<div class="alert alert-error">La fecha es obligatoria</div>'; return; }
  const tipo = document.querySelector('input[name="ccev-tipo"]:checked')?.value || 'concierto';
  const body = {
    nombre,
    artista:         document.getElementById('ccev-artista')?.value.trim()||null,
    ciudad:          ciudad||null,
    fecha,
    tipo_evento:     tipo,
    notas_internas:  document.getElementById('ccev-notas')?.value.trim()||null,
    zonas_boleto:    (document.getElementById('ccev-zonas')?.value||'').split(',').map(s=>s.trim()).filter(Boolean),
  };
  alert.innerHTML='<div class="alert" style="border-color:var(--border)">Guardando…</div>';
  try {
    if (id) await khEventos.actualizar(id, body); // [sec-eventos]
    else    await khEventos.crear(body); // [sec-eventos]
    alert.innerHTML='<div class="alert alert-success">✓ Evento guardado</div>';
    setTimeout(async () => { closeModal('modal-cc-evento'); await loadCapsule(); }, 700);
  } catch(e) { alert.innerHTML=`<div class="alert alert-error">${e.message}</div>`; }
}

// ── Detalle de evento ────────────────────────────────────────
async function abrirDetalleEvento(id) {
  _ccEventoActual = id;
  const ev = _ccEventosCache.find(e => e.id === id);
  if (!ev) return;

  // Mostrar tab detalle
  const btnDetalle = document.getElementById('cc-tab-btn-detalle');
  if (btnDetalle) btnDetalle.style.display = '';
  showCCTab('detalle', btnDetalle);

  // Header
  const header = document.getElementById('cc-detalle-header');
  if (header) {
    const fecha = new Date(ev.fecha+'T12:00:00');
    header.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:22px">${_esfEsc(ev.nombre)}</div>
          <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ts);margin-top:2px">
            ${ev.artista?_esfEsc(ev.artista)+' · ':''}${_esfEsc(ev.ciudad||'')} · ${fecha.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · ${_esfEsc(TIPOS_EVENTO[ev.tipo_evento]||'Concierto')}
          </div>
          ${ev.notas_internas?`<div style="margin-top:8px;font-size:11px;color:var(--ts);padding:6px 10px;background:rgba(255,255,255,.03);border-left:2px solid var(--border)">${_esfEsc(ev.notas_internas)}</div>`:''}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="showCCTab('lista', document.getElementById('cc-tab-btn-lista'))" style="font-size:10px">← Todos los eventos</button>
      </div>`;
  }

  // Cargar datos. Rooming agrupa _ccViajeros, así que corre DESPUÉS de loadViajeros.
  showCCSubTab('equipo', document.getElementById('cc-sub-btn-equipo'));
  await Promise.all([loadCCEquipo(), loadViajeros()]);
  await loadRooming();
}

// ── EQUIPO ASIGNADO ──────────────────────────────────────────
async function loadCCEquipo() {
  if (!_ccEventoActual) return;
  const container = document.getElementById('cc-coordis-asignados');
  const countEl   = document.getElementById('cc-equipo-count');
  try {
    const ev = _ccEventosCache.find(e => e.id === _ccEventoActual) || {};
    const asigs = await khAsignaciones.listar({ evento_id: _ccEventoActual }); // [sec-coordi]
    _ccAsignados = asigs;

    let usuarios = [];
    let uMap = {};
    if (asigs.length) {
      usuarios = await khUsuarios.listar({ ids: asigs.map(a=>a.coordi_id) }); // [sec-usuarios]
      uMap = Object.fromEntries(usuarios.map(u=>[u.id,u]));
      // Guardar referencia de usuario en cada asignación (para rooming)
      _ccAsignados = asigs.map(a => ({ ...a, _usuario: uMap[a.coordi_id]||{} }));
      // Backfill: auto-agregar a viajeros_evento a quienes ya están aceptados
      // pero no aparecen en la lista (idempotente, best-effort).
      _backfillStaffViajeros().then(() => { if (document.getElementById('cc-viajeros-list')) loadViajeros(); });
    }

    // ── Contratos pendientes de firma ────────────────────────────
    // Match: fecha exacta + nombre fuzzy (mismo criterio que
    // _autoAsignarEvento en contrato-firmar.js:277-303). Solo se listan
    // creadoras que ya tienen perfil rol='cc' en usuarios — las que no,
    // se omiten silenciosamente (caso Tipo B, otra sesión).
    let pendientesFirma = [];
    try {
      if (ev.fecha) {
        // [sec-contratos] antes db.get('contratos_creadores', ...) con anon key.
        const ctos = await khContratos.listar({ estado: 'pendiente', evento_fecha: ev.fecha });
        const evNombre  = (ev.nombre||'').toLowerCase().trim();
        const evArtista = (ev.artista||'').toLowerCase().trim();
        const matched = ctos.filter(c => {
          const target = (c.evento_nombre||'').toLowerCase().trim();
          if (!target || !evNombre) return false;
          return target.includes(evNombre) || evNombre.includes(target) || (evArtista && target.includes(evArtista));
        });
        if (matched.length) {
          // Dedupe contra eventos_coordi por correo: si ya firmó y se creó
          // la asignación, la versión confirmada gana.
          const correosAsignados = new Set(
            usuarios.map(u => (u.correo||'').toLowerCase()).filter(Boolean)
          );
          const sinAsignacion = matched.filter(c =>
            !correosAsignados.has((c.creador_email||'').toLowerCase())
          );
          // Lookup de perfiles rol='cc' por correo. Sin perfil → skip.
          const correosUnicos = [...new Set(
            sinAsignacion.map(c => (c.creador_email||'').toLowerCase()).filter(Boolean)
          )];
          const lookups = await Promise.all(correosUnicos.map(c =>
            khUsuarios.listar({ correo: c, rol: 'cc' }).catch(()=>[]) // [sec-usuarios]
          ));
          const ccMap = {};
          lookups.forEach((arr, i) => { if (arr[0]) ccMap[correosUnicos[i]] = arr[0]; });
          // Dedupe interno: si la misma creadora tiene varios contratos
          // pendientes al mismo evento, gana el más reciente (orden desc).
          const seen = new Set();
          pendientesFirma = sinAsignacion.filter(c => {
            const em = (c.creador_email||'').toLowerCase();
            if (!ccMap[em] || seen.has(em)) return false;
            seen.add(em);
            return true;
          }).map(c => ({
            _contrato: c,
            _usuario:  ccMap[(c.creador_email||'').toLowerCase()],
          }));
        }
      }
    } catch(e) { console.warn('[Capsule] contratos pendientes:', e.message); }

    const total = asigs.length + pendientesFirma.length;
    if (countEl) countEl.textContent = `${total} asignado${total!==1?'s':''}`;

    if (!total) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">·</div>Sin equipo asignado</div>';
      return;
    }

    const statusCol = { pendiente:'var(--gold)', aceptado:'var(--green)', declinado:'var(--red)' };
    const statusLabel = { pendiente:'Pendiente', aceptado:'Aceptó', declinado:'Declinó' };
    const COLOR_PEND_FIRMA = '#e8ff4c';

    const htmlAsigs = asigs.map(a => {
      const u = uMap[a.coordi_id]||{};
      const st = a.status||'pendiente';
      const esCC = u.rol === 'cc';
      // CC: no mostrar el bloque de expectativas (la descripción larga del
      // contrato vive en su perfil → panel "Material Entregado").
      const indicacionesHtml = (!esCC && a.indicaciones)
        ? `<div style="font-size:11px;color:var(--ts);margin-top:3px;font-style:italic">${_esfEsc(a.indicaciones)}</div>`
        : '';
      return `<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${statusCol[st]||'var(--ts)'};border-radius:var(--radius);padding:14px 18px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--bg3);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center">
              ${u.foto_url ? `<img src="${_urlSegura(u.foto_url)}" style="width:100%;height:100%;object-fit:cover">` :
              `<span style="font-family:'Zen Dots',sans-serif;font-size:15px;color:var(--orange)">${_esfEsc((u.nombre||'?')[0])}</span>`}
            </div>
            <div>
              <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:16px">${_esfEsc(u.nombre||'—')}</div>
              <div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--ts)">${u.rol||''} · <span style="color:${statusCol[st]||'var(--ts)'}">${statusLabel[st]||st}</span></div>
              ${indicacionesHtml}
              ${a.motivo_declinacion ? `<div style="font-size:11px;color:var(--red);margin-top:3px">Motivo: ${_esfEsc(a.motivo_declinacion)}</div>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${st==='pendiente' ? `<button class="btn btn-ghost btn-sm" onclick="reenviarNotificacion('${a.id}')" style="font-size:10px">↺ Reenviar</button>` : ''}
            <button class="btn btn-red btn-sm" onclick="desasignarCoordi('${a.id}')">✕</button>
          </div>
        </div>
      </div>`;
    }).join('');

    const htmlPend = pendientesFirma.map(p => {
      const u = p._usuario;
      const c = p._contrato;
      const nombre = u.nombre || c.creador_nombre || '—';
      return `<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${COLOR_PEND_FIRMA};border-radius:var(--radius);padding:14px 18px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--bg3);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center">
              ${u.foto_url ? `<img src="${_urlSegura(u.foto_url)}" style="width:100%;height:100%;object-fit:cover">` :
              `<span style="font-family:'Zen Dots',sans-serif;font-size:15px;color:${COLOR_PEND_FIRMA}">${_esfEsc((nombre||'?')[0])}</span>`}
            </div>
            <div>
              <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:16px">${_esfEsc(nombre)}</div>
              <div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--ts)">cc · <span style="color:${COLOR_PEND_FIRMA};font-weight:700"><svg class="ic"><use href="#ic-lapiz"/></svg> PENDIENTE DE FIRMA</span></div>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = htmlAsigs + htmlPend;
  } catch(e) { container.innerHTML=`<div class="alert alert-error">${e.message}</div>`; }
}

async function abrirModalAsignarCoordi() {
  const rolesAsignables = ['coordinador','cc','mister_popo','maestro_roshi','bulma'];
  let usuarios = [];
  try { usuarios = await khUsuarios.listar({ activos: true, orden: 'nombre' }); } // [sec-usuarios]
  catch(e) {}
  // Excluir ya asignados
  const asignadosIds = _ccAsignados.map(a=>a.coordi_id);
  usuarios = usuarios.filter(u => rolesAsignables.includes(u.rol) && !asignadosIds.includes(u.id));
  // Cargar deudas pendientes de cada usuario para advertir
  const deudasPend = await khCoordi.deudasListar({ pagado: false }).catch(()=>[]); // [sec-sensibles]
  const deudasPorUser = {};
  deudasPend.forEach(d => {
    if (!deudasPorUser[d.coordi_id]) deudasPorUser[d.coordi_id] = 0;
    deudasPorUser[d.coordi_id] += (d.monto||0);
  });

  const opts = usuarios.map(u => {
    const deuda = deudasPorUser[u.id]||0;
    const warn = deuda > 0 ? ` <svg class="ic"><use href="#ic-alerta"/></svg> debe ${formatMXN(deuda)}` : '';
    const strike = u.strikes >= 2 ? ` <svg class="ic"><use href="#ic-alerta"/></svg> ${u.strikes} strikes` : '';
    return `<option value="${u.id}">${_esfEsc(u.nombre)} · ${u.rol}${warn}${strike}</option>`;
  }).join('');
  document.getElementById('modal-asignar-coordi').innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">Asignar persona al evento</div>
        <button class="modal-close" onclick="closeModal('modal-asignar-coordi')">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Persona *</label>
          <select class="cot-input" id="ac-coordi-sel" style="width:100%">
            <option value="">— Selecciona —</option>${opts}
          </select>
        </div>
        <div class="form-group">
          <label>Indicaciones especiales</label>
          <textarea class="cot-input" id="ac-indicaciones" rows="3" placeholder="Punto de encuentro, responsabilidades, horario…" style="width:100%;resize:vertical"></textarea>
        </div>
        <div style="background:rgba(255,183,3,.06);border:1px solid rgba(255,183,3,.15);border-radius:var(--r-sm,8px);padding:12px;font-size:11px;color:var(--gold);font-family:'JetBrains Mono',monospace">
          Se enviará un correo con link para aceptar o declinar
        </div>
        <div id="ac-alert" style="margin-top:8px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-asignar-coordi')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarAsignacionCoordi()">Asignar y notificar →</button>
      </div>
    </div>`;
  openModal('modal-asignar-coordi');
}

async function guardarAsignacionCoordi() {
  const coordiId     = document.getElementById('ac-coordi-sel')?.value;
  const indicaciones = document.getElementById('ac-indicaciones')?.value.trim()||null;
  const alertEl      = document.getElementById('ac-alert');
  if (!coordiId) { alertEl.innerHTML='<div class="alert alert-error">Selecciona una persona</div>'; return; }
  alertEl.innerHTML='<div class="alert" style="border-color:var(--border)">Guardando…</div>';
  try {
    const asig = await khAsignaciones.crear({ // [sec-coordi]
      evento_id: _ccEventoActual,
      coordi_id: coordiId,
      indicaciones,
    });
    // Correo con link aceptar/declinar
    const ev = _ccEventosCache.find(e=>e.id===_ccEventoActual);
    const usuario = await khUsuarios.obtener(coordiId); // [sec-usuarios]
    const asigId = asig?.asignacion?.id; // [sec-coordi]
    const baseUrl = window.location.origin + window.location.pathname;
    const linkAceptar = `${baseUrl}?accion=aceptar&asig=${asigId}`;
    const linkDeclinar = `${baseUrl}?accion=declinar&asig=${asigId}`;
    if (usuario?.correo_notif || usuario?.correo) {
      await khAdminFetch('/.netlify/functions/send-invite', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          to: usuario.correo_notif || usuario.correo,
          subject: `Tour asignado: ${ev?.nombre||'Evento'}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px">
            <h2 style="color:#FF6B00;margin-bottom:8px">Tour Asignado</h2>
            <p>Hola <strong>${_esfEsc(usuario.nombre)}</strong>,</p>
            <p>Se te ha asignado el siguiente tour:</p>
            <div style="background:#1a1a24;border-left:3px solid #FF6B00;padding:16px 20px;border-radius:8px;margin:20px 0">
              <div style="font-size:20px;font-weight:700">${_esfEsc(ev?.nombre||'')}</div>
              <div style="color:#888899;font-size:13px">${ev?.artista?_esfEsc(ev.artista)+' · ':''}${_esfEsc(ev?.ciudad||'')}</div>
              <div style="color:#888899;font-size:13px">${ev?.fecha?new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):''}</div>
            </div>
            ${indicaciones?`<p><strong>Indicaciones:</strong><br><span style="color:#888899">${_esfEsc(indicaciones)}</span></p>`:''}
            <div style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap">
              <a href="${linkAceptar}" style="background:#FF6B00;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">✅ Aceptar tour</a>
              <a href="${linkDeclinar}" style="background:#1a1a24;color:#f0f0f5;padding:12px 24px;border-radius:8px;text-decoration:none;border:1px solid #333">❌ Declinar</a>
            </div>
            <p style="color:#888899;font-size:12px;margin-top:32px">Conecta Reynosa · conectareynosa.mx</p>
          </div>`,
        }),
      });
    }
    // Notificación in-app al coordi (además del email). Fails-soft.
    await _crearNotif({
      usuario_id: coordiId, tipo: 'asignacion', titulo: 'Nuevo evento asignado',
      mensaje: `Te asignaron: ${ev?.nombre || 'un evento'}. Entra a tu perfil para verlo.`,
      link: 'perfil',
    });
    alertEl.innerHTML='<div class="alert alert-success">✓ Asignado y notificado</div>';
    setTimeout(async ()=>{ closeModal('modal-asignar-coordi'); await loadCCEquipo(); }, 900);
  } catch(e) { alertEl.innerHTML=`<div class="alert alert-error">${e.message}</div>`; }
}

async function desasignarCoordi(asigId) {
  if (!confirm('¿Desasignar esta persona del evento?')) return;
  try { await khAsignaciones.eliminar(asigId); await loadCCEquipo(); } // [sec-coordi]
  catch(e) { alert(e.message); }
}

async function reenviarNotificacion(asigId) {
  // Reenviar correo de asignación
  const asig = _ccAsignados.find(a=>a.id===asigId);
  if (!asig) return;
  const ev = _ccEventosCache.find(e=>e.id===_ccEventoActual);
  try {
    const usuario = await khUsuarios.obtener(asig.coordi_id); // [sec-usuarios]
    const baseUrl = window.location.origin + window.location.pathname;
    const linkAceptar = `${baseUrl}?accion=aceptar&asig=${asigId}`;
    const linkDeclinar = `${baseUrl}?accion=declinar&asig=${asigId}`;
    if (usuario?.correo_notif || usuario?.correo) {
      await khAdminFetch('/.netlify/functions/send-invite', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          to: usuario.correo_notif || usuario.correo,
          subject: `Recordatorio — Tour asignado: ${ev?.nombre||''}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px">
            <h2 style="color:#FFB703">Recordatorio de asignación</h2>
            <p>Hola <strong>${_esfEsc(usuario.nombre)}</strong>, aún no has respondido a tu asignación:</p>
            <div style="background:#1a1a24;border-left:3px solid #FF6B00;padding:16px 20px;border-radius:8px;margin:20px 0">
              <div style="font-size:18px;font-weight:700">${_esfEsc(ev?.nombre||'')}</div>
              <div style="color:#888899">${_esfEsc(ev?.ciudad||'')} · ${ev?.fecha?new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'}):''}</div>
            </div>
            <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap">
              <a href="${linkAceptar}" style="background:#FF6B00;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">✅ Aceptar</a>
              <a href="${linkDeclinar}" style="background:#1a1a24;color:#f0f0f5;padding:12px 24px;border-radius:8px;text-decoration:none;border:1px solid #333">❌ Declinar</a>
            </div>
          </div>`,
        }),
      });
      alert('✓ Recordatorio enviado');
    }
  } catch(e) { alert(e.message); }
}

// Manejar aceptar/declinar desde URL params al cargar
async function manejarAccionAsignacion() {
  const params = new URLSearchParams(window.location.search);
  const accion = params.get('accion');
  const asigId = params.get('asig');
  if (!accion || !asigId) return;

  if (accion === 'aceptar') {
    try {
      await khAsignaciones.responder(asigId, 'aceptar'); // [sec-coordi] (anti-escalación: el backend exige que sea TU asignación)
      // Auto-agregar al usuario aceptante como viajero del evento (best-effort).
      // Si falla, la aceptación del tour se completa igual.
      try { await _upsertViajeroStaff(asigId); }
      catch(e) { console.warn('[viajero-staff] upsert falló:', e.message); }
      // Limpiar URL
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => alert('✓ ¡Tour aceptado! Aparecerá en tu perfil.'), 500);
    } catch(e) { console.warn(e); }
  }

  if (accion === 'declinar') {
    const motivo = prompt('¿Por qué no puedes asistir? (opcional):') || '';
    try {
      const _resp = await khAsignaciones.responder(asigId, 'declinar', motivo); // [sec-coordi] (anti-escalación)
      const _asigD = _resp?.asignacion || {}; // [sec-coordi] el backend devuelve evento_id/coordi_id (sin GET extra)
      window.history.replaceState({}, '', window.location.pathname);
      // Notificar a Memo
      const _evD = _asigD?.evento_id ? await khEventosMeta.porSlug(_asigD.evento_id).then(m=>m?.nombre||'').catch(()=>'') : ''; // [sec-eventos]
      const _uD  = _asigD?.coordi_id ? await khUsuarios.obtener(_asigD.coordi_id).then(u=>u?.nombre||'').catch(()=>'') : ''; // [sec-usuarios]
      await enviarAlertaMemo('tour_declinado', { nombre: _uD, evento: _evD, motivo });
      setTimeout(() => alert('Respuesta registrada. Memo será notificado.'), 500);
    } catch(e) { console.warn(e); }
  }
}

// [sec-coordi] Inserta al usuario aceptante como viajero del evento (staff).
// Toda la lógica (lookup del asig, identidad desde `usuarios`, idempotencia por
// correo, fallback de columnas tipo_viajero/usuario_id) vive ahora server-side en
// admin-coordi-asignaciones.js con service_role + anti-escalación (owner o admin).
// Best-effort — el caller envuelve en try/catch para que la aceptación nunca falle.
async function _upsertViajeroStaff(asigId) {
  return await khViajeros.upsertStaff(asigId); // [sec-coordi]
}

// Backfill: asegura que todo CC con status='aceptado' tenga su fila en
// viajeros_evento. Se llama al cargar el detalle del evento en Capsule Corp
// para auto-curar a quienes aceptaron antes de que existiera _upsertViajeroStaff.
async function _backfillStaffViajeros() {
  if (!_ccEventoActual || !Array.isArray(_ccAsignados)) return;
  const aceptados = _ccAsignados.filter(a => a.status === 'aceptado');
  if (!aceptados.length) return;
  for (const a of aceptados) {
    try { await _upsertViajeroStaff(a.id); }
    catch(e) { console.warn('[backfill] viajero-staff falló:', e.message); }
  }
}

// Notificar a todo el equipo que las listas están listas
async function notificarEquipoListas() {
  if (!_ccEventoActual) return;
  const aceptados = _ccAsignados.filter(a => a.status === 'aceptado');
  if (!aceptados.length) { alert('No hay equipo que haya aceptado aún'); return; }
  const ev = _ccEventosCache.find(e=>e.id===_ccEventoActual);
  const usuarios = await khUsuarios.listar({ ids: aceptados.map(a=>a.coordi_id) }); // [sec-usuarios]
  let enviados = 0;
  for (const u of usuarios) {
    const email = u.correo_notif || u.correo;
    if (!email) continue;
    await khAdminFetch('/.netlify/functions/send-invite', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        to: email,
        subject: `Listas listas: ${ev?.nombre||'Evento'}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px">
          <h2 style="color:#FF6B00">Listas actualizadas</h2>
          <p>Hola <strong>${_esfEsc(u.nombre)}</strong>,</p>
          <p>Las listas del evento <strong>${_esfEsc(ev?.nombre||'')}</strong> ya están listas.</p>
          <ul style="color:#888899;line-height:2">
            <li>Lista de viajeros</li>
            <li>Rooming list</li>
          </ul>
          <p>Entra al Kamehouse y revisa tu perfil para descargarlas.</p>
          <p style="margin-top:16px">No olvides pasar a <strong>Torre de Karin</strong> a recoger los kits antes del evento.</p>
          <p style="color:#888899;font-size:12px;margin-top:32px">Conecta Reynosa · conectareynosa.mx</p>
        </div>`,
      }),
    });
    // Notificación in-app (además del email). Fails-soft.
    await _crearNotif({
      usuario_id: u.id, tipo: 'listas', titulo: 'Listas actualizadas',
      mensaje: `Las listas de ${ev?.nombre || 'tu evento'} ya están listas. Descárgalas en tu perfil.`,
      link: 'perfil',
    });
    enviados++;
  }
  alert(`✓ Notificación enviada a ${enviados} persona${enviados!==1?'s':''}`);
}


// ════════════════════════════════
// VIAJEROS
// ════════════════════════════════
let _ccViajerosFiltro = 'todos';   // todos | cliente | staff

function _esStaff(v) {
  if (!v) return false;
  if (v.tipo_viajero && v.tipo_viajero !== 'cliente') return true;
  // Fallback: marker en notas (cuando la columna tipo_viajero no existe aún).
  if (typeof v.notas === 'string' && /\[STAFF:/i.test(v.notas)) return true;
  return false;
}

// Descarga un blob HTML como archivo. Reemplaza window.open()+win.print(),
// que es bloqueado por Safari iOS y popup-blockers cuando la invocación
// ocurre tras un await async. El archivo descargado se abre en el navegador
// del usuario y desde ahí pueden imprimir/guardar como PDF.
function _descargarHTML(filename, html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}


function filtrarViajerosCC(filtro, btn) {
  _ccViajerosFiltro = filtro;
  document.querySelectorAll('#cc-sub-viajeros .gz-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _renderViajerosTabla();
}

// Badges de ESTADO DE CUENTA del cliente (adicionales a los de pago). Reusa la
// paleta de .badge del CSS. Combina: walk-in sin cuenta → "Walk-in" + "Sin cuenta";
// walk-in que ya reclamó → "Walk-in" + "En portal"; cliente del portal → "En portal".
function _badgeCliente(c) {
  c = c || {};
  const badges = [];
  if (c.creado_por_admin) badges.push('<span class="badge badge-gray">Walk-in</span>');
  if (c.auth_user_id)     badges.push('<span class="badge badge-green">En portal</span>');
  else                    badges.push('<span class="badge badge-gray" style="opacity:.7">Sin cuenta</span>');
  return badges.join(' ');
}

function _renderViajerosTabla() {
  const list = document.getElementById('cc-viajeros-list');
  if (!list) return;
  const todos   = _ccViajeros;
  const staff   = todos.filter(_esStaff);
  const clientes = todos.filter(v => !_esStaff(v));
  // Actualizar contadores en las pestañas
  const cT = document.getElementById('cc-cnt-todos');   if (cT) cT.textContent = `(${todos.length})`;
  const cC = document.getElementById('cc-cnt-cliente'); if (cC) cC.textContent = `(${clientes.length})`;
  const cS = document.getElementById('cc-cnt-staff');   if (cS) cS.textContent = `(${staff.length})`;
  // Aplicar filtro
  const filas = _ccViajerosFiltro === 'staff' ? staff
              : _ccViajerosFiltro === 'cliente' ? clientes
              : todos;
  if (!filas.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">·</div>${_ccViajerosFiltro==='todos'?'Sin viajeros aprobados para este evento':'Sin viajeros con ese filtro'}</div>`;
    return;
  }
  const paqCol = { 'PLUS':'rgba(255,183,3,.15)','STAY':'rgba(94,167,255,.15)','RIDE':'rgba(61,220,132,.15)','CHEAP':'rgba(255,107,0,.12)' };
  const paqFg  = { 'PLUS':'var(--gold)','STAY':'var(--blue)','RIDE':'var(--green)','CHEAP':'var(--orange)' };
  list.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Nombre</th><th>Celular</th><th>Paquete</th><th>Zona</th><th style="text-align:center">Pers.</th><th style="text-align:right">Total</th><th style="text-align:right">Abonado</th><th style="text-align:right">Restante</th><th>Estado</th></tr></thead>
    <tbody>${filas.map(v => {
      const c = v.clientes || {};
      const pago = v.pago || {};
      const paq = v.paquete || '';
      const esWalkinSinCuenta = c.creado_por_admin && !c.auth_user_id;
      const botonInvitar = (esWalkinSinCuenta && c.correo)
        ? `<br><button class="btn btn-ghost btn-sm" style="font-size:10px;margin-top:5px" onclick="invitarWalkin('${_spEscape(c.id)}', this)"><svg class="ic"><use href="#ic-correo"/></svg> Invitar al portal</button>`
        : '';
      return `<tr>
      <td style="font-weight:600">${_esfEsc(c.nombre_completo || '—')} ${_badgeCliente(c)}${c.correo ? `<br><span style="color:var(--ts);font-size:11px;font-weight:400">${_esfEsc(c.correo)}</span>` : ''}${botonInvitar}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px">${_esfEsc(c.celular || '—')}</td>
      <td>${paq ? `<span style="font-size:10px;font-weight:700;padding:2px 10px;border-radius:4px;background:${paqCol[paq]||'rgba(255,255,255,.06)'};color:${paqFg[paq]||'var(--ts)'}">${paq}</span>` : '—'}</td>
      <td style="font-size:11px;color:var(--orange);white-space:nowrap">${_esfEsc(v.zona || '—')}</td>
      <td style="text-align:center">${v.num_personas || 1}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px">${_spFmtMxn(pago.total)}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--green)">${_spFmtMxn(pago.abonado)}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:${(pago.restante||0) > 0 ? 'var(--orange)' : 'var(--ts)'}">${_spFmtMxn(pago.restante)}</td>
      <td>${_spBadgeEstado(v.estado)}</td>
    </tr>`; }).join('')}</tbody>
  </table></div>`;
}

// Invita por correo a un walk-in (cliente sin cuenta de portal) para que reclame
// su cuenta. El enlace real lo hace portal-reclamar-cuenta cuando el cliente se
// registra con correo verificado. Solo aparece para walk-ins con correo.
async function invitarWalkin(clienteId, btn) {
  if (!clienteId) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-invitar-walkin', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ cliente_id: clienteId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo invitar');
    showToast('Invitación enviada a ' + (data.to || 'su correo'), 'success');
    if (btn) btn.textContent = '✓ Invitado';
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Invitar al portal'; }
  }
}

async function loadViajeros() {
  if (!_ccEventoActual) return;
  const list = document.getElementById('cc-viajeros-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
  try {
    // Viajeros = solicitudes del portal (en_pagos/pagado) de este evento, con
    // su resumen de pago. service_role vive en la función; aquí va el JWT admin.
    const r = await khAdminFetch('/.netlify/functions/admin-viajeros-evento', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ evento_id: _ccEventoActual }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudieron cargar los viajeros');
    _ccViajeros = Array.isArray(data.viajeros) ? data.viajeros : [];
    _renderViajerosTabla();
    // [VJ-2] El segundo mundo. Va DESPUÉS de pintar el Portal y en su propio
    // try: si viajeros_evento fallara, la pestaña de siempre ya está en
    // pantalla y no se cae por una lista que es un extra.
    await _vj2Cargar();
  } catch(e) { list.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

// ═══════════════════════════════════════════════════════════════════════════
// [VJ-2] LOS DOS MUNDOS DE VIAJEROS
//
// El Portal (solicitudes, con su dinero) y KH `viajeros_evento` (los que
// migraron del Excel y el staff). Los segundos existían sin ninguna pantalla de
// admin: Memo los buscó por todo KameHouse y no aparecían.
//
// Se pintan APARTE y sin montos. La contabilidad de los migrados vive en el
// Excel, y poner una columna de dinero aquí obligaría a inventar una cifra —
// que es exactamente lo que no se debe hacer en una pantalla de dinero.
//
// Lectura con `viajero_listar`, que ya existía y ya admite admin. Cero
// endpoints nuevos.
// ═══════════════════════════════════════════════════════════════════════════
let _vj2Filas = [];

// [ET3-b] Quién puede ver el botón de eliminar. Espeja ROLES_ADMIN de
// `admin-coordi-asignaciones.js` (línea 47), leído de ahí y no de memoria: el
// servidor es el candado, esto sólo evita ofrecer un botón que daría 403.
const VJ_ROLES_ELIMINAR = ['maestro_roshi', 'bulma', 'milk'];
function _vjPuedeEliminar() {
  return !!(currentUser && VJ_ROLES_ELIMINAR.includes(currentUser.rol));
}

async function _vj2Cargar() {
  const wrap = document.getElementById('cc-kh-wrap');
  const list = document.getElementById('cc-kh-list');
  const cnt = document.getElementById('cc-kh-count');
  const countEl = document.getElementById('cc-viajeros-count');
  const nPortal = _ccViajeros.length;
  // Texto de siempre, por si no hay migrados o la consulta falla.
  const soloPortal = () => { if (countEl) countEl.textContent = `${nPortal} viajero${nPortal !== 1 ? 's' : ''}`; };

  _vj2Filas = [];
  if (wrap) wrap.style.display = 'none';
  soloPortal();
  if (!wrap || !list) return;

  try {
    _vj2Filas = await khViajeros.listar(_ccEventoActual) || [];   // [sec-coordi]
  } catch (_) {
    // Fails-soft a propósito: sin este bloque la pestaña es la de siempre.
    return;
  }
  if (!_vj2Filas.length) return;   // sin migrados = idéntico a hoy

  // [VJ-3] Los abonos de TODO el evento en UNA llamada: 29 filas no pueden
  // hacer 29 consultas. Fails-soft — sin abonos el saldo sale del congelado.
  let porViajero = {};
  try {
    (await khViajeros.abonosDeEvento(_ccEventoActual)).forEach((a) => {   // [sec-coordi]
      (porViajero[a.viajero_id] = porViajero[a.viajero_id] || []).push(a);
    });
  } catch (_) { porViajero = {}; }

  const n = _vj2Filas.length;
  if (cnt) cnt.textContent = `${n} ${n === 1 ? 'viajero' : 'viajeros'}`;
  // El total, DICHO: que nadie tenga que sumarlo de cabeza ni suponer si el
  // número de arriba ya incluía a los de abajo.
  if (countEl) countEl.textContent = `${nPortal} del Portal + ${n} migrados = ${nPortal + n}`;

  // [VJ-3] El dinero del evento, separado en sus dos naturalezas.
  //
  // OJO CON LA ETIQUETA: el neto NO es "lo que voy a cobrar". En melanie hoy
  // son 2 personas que deben $6,800 y 15 que tienen $2,917 a favor; el neto de
  // $3,883 sale de restarlas entre sí, y son obligaciones opuestas — el crédito
  // de una no paga la deuda de otra. Decir solo "Por cobrar: $3,883" haría
  // pensar que se van a cobrar 3,883 cuando lo cobrable son 6,800.
  let deuda = 0, favor = 0, nDeben = 0, nFavor = 0, conDinero = 0;
  _vj2Filas.forEach((v) => {
    const s = _vj3Saldo(v, porViajero[v.id]);
    if (!s) return;
    conDinero++;
    if (s.resta > 0) { deuda += s.resta; nDeben++; }
    else if (s.resta < 0) { favor += -s.resta; nFavor++; }
  });
  // Total y abonado del evento, además del desglose: son las dos cifras que se
  // carean contra el Excel, y sin ellas no hay contra qué cuadrar.
  let totalEv = 0, abonadoEv = 0;
  _vj2Filas.forEach((v) => {
    const s = _vj3Saldo(v, porViajero[v.id]);
    if (!s) return;
    totalEv += s.total; abonadoEv += s.abonado;
  });
  const dineroHtml = conDinero ? `<div class="vj3-tot">
      <span class="vj3-tot-i">Total <b>${_vj3Money(totalEv)}</b><i>${conDinero} con contrato</i></span>
      <span class="vj3-tot-i">Abonado <b class="vj3-ok">${_vj3Money(abonadoEv)}</b><i>previo + abonos</i></span>
      <span class="vj3-tot-i">Por cobrar <b class="vj3-debe">${_vj3Money(deuda)}</b><i>${nDeben} ${nDeben === 1 ? 'persona' : 'personas'}</i></span>
      <span class="vj3-tot-i">A favor <b class="vj3-favor">${_vj3Money(favor)}</b><i>${nFavor} ${nFavor === 1 ? 'persona' : 'personas'}</i></span>
      <span class="vj3-tot-i vj3-tot-neto">Neto <b>${_vj3Money(deuda - favor)}</b><i>cobrar − a favor</i></span>
    </div>` : '';

  list.innerHTML = dineroHtml + `<div class="vj2-wrap"><table class="vj2-tabla">
    <thead><tr>
      <th>Nombre</th><th>Paquete</th><th>Zona</th><th>Talla</th><th>Contacto</th>
      ${conDinero ? '<th class="vj3-col">Total</th><th class="vj3-col">Abonado</th><th class="vj3-col">Resta</th>' : ''}
      <th>Notas</th>${_vjPuedeEliminar() ? '<th></th>' : ''}
    </tr></thead>
    <tbody>${_vj2Filas.map((v) => {
      // El origen, visible por fila: `tipo_viajero` lo pone el alta de staff;
      // lo que viene del Excel no lo trae. Sin la etiqueta, las dos clases de
      // fila se leerían igual y son cosas distintas.
      const staff = v.tipo_viajero && String(v.tipo_viajero) !== 'cliente';
      const contacto = [v.celular, v.correo].filter(Boolean).map(_esfEsc).join('<br>') || '<span class="vj2-vacio">—</span>';
      const emerg = [v.emergencia_nombre, v.num_emergencia].filter(Boolean).join(' · ');
      return `<tr>
        <td><b>${_esfEsc(v.nombre || '—')}</b>
            <span class="vj2-tag ${staff ? 'vj2-tag-staff' : ''}">${staff ? _esfEsc(v.tipo_viajero) : 'migrado'}</span></td>
        <td>${_esfEsc(v.tipo_paquete || '—')}</td>
        <td>${_esfEsc(v.zona_boleto || '—')}</td>
        <td>${v.talla_playera ? _esfEsc(v.talla_playera) : '<span class="vj2-vacio">—</span>'}</td>
        <td>${contacto}${emerg ? `<div class="vj2-emerg">SOS ${_esfEsc(emerg)}</div>` : ''}</td>
        ${(() => {
          // [VJ-3] Las columnas de dinero solo EXISTEN si el payload trae
          // dinero. A un coordi el servidor no le manda total_contrato, así que
          // ni siquiera ve los encabezados: sin esto la tabla le pintaba tres
          // columnas de "—" y le contaba que hay un dinero que no puede ver.
          if (!conDinero) return '';
          // Y dentro de una tabla CON dinero, la fila sin contrato lleva "—":
          // un "$0" diría "no debe nada" cuando lo cierto es que no aplica
          // (staff, la ganadora del sorteo, intercambios).
          const s = _vj3Saldo(v, porViajero[v.id]);
          if (!s) return '<td class="vj3-col vj2-vacio">—</td><td class="vj3-col vj2-vacio">—</td><td class="vj3-col vj2-vacio">—</td>';
          return `<td class="vj3-col">${_vj3Money(s.total)}</td>
                  <td class="vj3-col vj3-ok">${_vj3Money(s.abonado)}</td>
                  <td class="vj3-col ${s.aFavor ? 'vj3-favor' : (s.resta > 0 ? 'vj3-debe' : '')}">${_vj3Money(s.resta)}${s.aFavor ? '<i class="vj3-af"> a favor</i>' : ''}</td>`;
        })()}
        <td class="vj2-notas">${v.notas ? _esfEsc(v.notas) : '<span class="vj2-vacio">—</span>'}</td>
        ${_vjPuedeEliminar() ? `<td><button class="btn btn-ghost btn-sm" data-et3b="eliminar" style="font-size:10px;color:var(--red)"
          title="Eliminar a ${_esfEsc(v.nombre || '')} de este evento"
          onclick="eliminarViajero('${_attrJs(v.id)}', '${_attrJs(v.nombre || '')}')">Eliminar</button></td>` : ''}
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
  wrap.style.display = '';
}

// Las descargas del coordi, reusadas tal cual con el evento que ya está abierto.
function _vj2Descargar(cual) {
  if (!_ccEventoActual) { alert('Elige un evento primero'); return; }
  if (cual === 'rooming') return descargarRoomingList(_ccEventoActual);
  return descargarListaViajeros(_ccEventoActual);
}

// Alta de walk-in (Fase 2a): captura un cliente de WhatsApp (sin cuenta de
// portal) y lo da de alta en el MODELO DEL PORTAL (cliente + solicitud en_pagos
// + plan de pagos). No es edición — el id se ignora; sirve solo para "nuevo".
// ═══════════════════════════════════════════════════════════════
// VALIDACIÓN DE CORREO (walk-in) — mismo criterio que el backend
// (admin-crear-viajero / admin-invitar-walkin). Tapa el hueco de correos mal
// escritos (ej. "gmail.con") que Resend acepta pero rebotan en silencio.
// ═══════════════════════════════════════════════════════════════
let _vjCorreoConfirmado = false;   // el humano eligió "usarlo de todos modos"
let _vjSugActual = '';             // sugerencia mostrada actualmente

// Formato básico: algo@algo.tld con TLD de 2+ letras, sin espacios.
function correoFormatoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(correo == null ? '' : correo).trim());
}

// TLD mal escrito → se asume .com.
const _VJ_TLD_MALOS = { con:1, cm:1, comm:1, ocm:1, cmo:1, vom:1, xom:1, col:1, om:1 };
// Dominios populares mal escritos → su forma correcta.
const _VJ_DOMINIOS_MALOS = {
  'gmial.com':'gmail.com', 'gmai.com':'gmail.com', 'gmail.co':'gmail.com', 'gmaill.com':'gmail.com', 'gnail.com':'gmail.com',
  'hotmial.com':'hotmail.com', 'hotmal.com':'hotmail.com', 'hotmil.com':'hotmail.com', 'hotmai.com':'hotmail.com',
  'yaho.com':'yahoo.com', 'yahooo.com':'yahoo.com', 'yhaoo.com':'yahoo.com',
  'outlok.com':'outlook.com', 'outloo.com':'outlook.com', 'outlock.com':'outlook.com',
};

// Devuelve una corrección sugerida (string) o null. Conserva la parte local tal
// como se escribió; solo corrige el dominio/TLD.
function sugerenciaCorreo(correo) {
  const raw = String(correo == null ? '' : correo).trim();
  const at = raw.lastIndexOf('@');
  if (at < 1 || at === raw.length - 1) return null;
  const local = raw.slice(0, at);
  const dominio = raw.slice(at + 1).toLowerCase();
  if (_VJ_DOMINIOS_MALOS[dominio]) return local + '@' + _VJ_DOMINIOS_MALOS[dominio];
  const dot = dominio.lastIndexOf('.');
  if (dot > 0 && _VJ_TLD_MALOS[dominio.slice(dot + 1)]) {
    return local + '@' + dominio.slice(0, dot) + '.com';
  }
  return null;
}

function _vjLimpiarCorreoHint() {
  const el = document.getElementById('vj-correo-hint');
  if (el) el.innerHTML = '';
}

// Cualquier edición invalida una confirmación previa y limpia el aviso.
function _vjOnCorreoInput() {
  _vjCorreoConfirmado = false;
  _vjLimpiarCorreoHint();
}

// Feedback temprano al salir del campo (no bloquea; solo informa).
function _vjChequeoCorreoBlur() {
  const correo = (document.getElementById('vj-correo')?.value || '').trim();
  if (!correo) { _vjLimpiarCorreoHint(); return; }
  if (!correoFormatoValido(correo)) { _vjMostrarCorreoError('El correo no parece válido. Revísalo.'); return; }
  const sug = sugerenciaCorreo(correo);
  if (sug && !_vjCorreoConfirmado) { _vjMostrarCorreoSugerencia(sug); }
  else { _vjLimpiarCorreoHint(); }
}

function _vjMostrarCorreoError(msg) {
  const el = document.getElementById('vj-correo-hint');
  if (el) el.innerHTML = `<div style="font-size:12px;color:var(--red);padding:6px 8px;border:1px solid rgba(255,68,68,.3);border-radius:var(--r-sm,8px);background:rgba(255,68,68,.08)">${_spEscape(msg)}</div>`;
}

// Aviso amable con la sugerencia y dos opciones: corregir / usarlo igual.
function _vjMostrarCorreoSugerencia(sug) {
  _vjSugActual = sug;
  const el = document.getElementById('vj-correo-hint');
  if (!el) return;
  el.innerHTML = `<div style="font-size:12px;color:var(--text);padding:8px 10px;border:1px solid var(--border2);border-radius:var(--r-sm,8px);background:rgba(255,107,0,.06)">
    ¿Quisiste decir <b style="color:var(--orange)">${_spEscape(sug)}</b>?
    <div style="display:flex;gap:8px;margin-top:8px">
      <button type="button" class="btn btn-primary btn-sm" style="font-size:11px" onclick="_vjAceptarSugerencia()">Sí, corregir</button>
      <button type="button" class="btn btn-ghost btn-sm" style="font-size:11px" onclick="_vjUsarDeTodosModos()">Usarlo de todos modos</button>
    </div>
  </div>`;
}

function _vjAceptarSugerencia() {
  const inp = document.getElementById('vj-correo');
  if (inp && _vjSugActual) inp.value = _vjSugActual;
  _vjCorreoConfirmado = false;   // el corregido ya no tendrá sugerencia
  _vjLimpiarCorreoHint();
}

function _vjUsarDeTodosModos() {
  _vjCorreoConfirmado = true;
  const el = document.getElementById('vj-correo-hint');
  if (el) el.innerHTML = `<div style="font-size:11px;color:var(--ts)">Se usará el correo tal como lo escribiste — presiona “Guardar viajero”.</div>`;
}

function abrirModalViajero(id) {
  _vjCorreoConfirmado = false;
  const eventos = _ccEventosCache || [];
  const opcionesEvento = eventos
    .map(e => `<option value="${_spEscape(e.id)}" ${e.id===_ccEventoActual?'selected':''}>${_spEscape(e.nombre || e.id)}</option>`)
    .join('');
  const HABS = ['compartida','triple','doble','individual'];
  document.getElementById('modal-viajero').innerHTML = `
    <div class="modal" style="max-width:580px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">Nuevo viajero (walk-in)</div>
        <button class="modal-close" onclick="closeModal('modal-viajero')">×</button>
      </div>
      <div class="modal-body">
        <div style="font-size:11px;color:var(--ts);margin-bottom:14px;font-family:'JetBrains Mono',monospace">// Cliente de WhatsApp sin cuenta de portal. Se crea con su plan de pagos al instante.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="grid-column:1/-1">
            <label>Nombre completo *</label>
            <input class="cot-input" id="vj-nombre" placeholder="Nombre y apellido…" style="width:100%">
          </div>
          <div class="form-group">
            <label>Celular *</label>
            <input class="cot-input" id="vj-celular" placeholder="811…">
          </div>
          <div class="form-group">
            <label>Correo</label>
            <input class="cot-input" id="vj-correo" type="email" placeholder="correo@…" oninput="_vjOnCorreoInput()" onblur="_vjChequeoCorreoBlur()">
            <div style="font-size:10px;color:var(--ts);margin-top:4px">Opcional — necesario para invitarlo al portal después</div>
            <div id="vj-correo-hint" style="margin-top:6px"></div>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Evento *</label>
            <select class="cot-input" id="vj-evento" style="width:100%">
              ${opcionesEvento || '<option value="">— Sin eventos —</option>'}
            </select>
          </div>
          <div class="form-group">
            <label>Paquete *</label>
            <select class="cot-input" id="vj-paquete">
              <option value="PLUS">PLUS</option>
              <option value="RIDE">RIDE</option>
              <option value="STAY">STAY</option>
              <option value="CHEAP">CHEAP</option>
            </select>
          </div>
          <div class="form-group">
            <label>Zona / boleto *</label>
            <input class="cot-input" id="vj-zona" placeholder="Floor, GA, VIP…">
          </div>
          <div class="form-group">
            <label>Personas</label>
            <input class="cot-input" id="vj-personas" type="number" min="1" max="12" value="1">
          </div>
          <div class="form-group">
            <label>Habitación</label>
            <select class="cot-input" id="vj-habitacion">
              <option value="">— Sin habitación —</option>
              ${HABS.map(h=>`<option value="${h}">${h.charAt(0).toUpperCase()+h.slice(1)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Precio total * (MXN)</label>
            <input class="cot-input" id="vj-precio" type="number" min="0" step="1" placeholder="5000">
          </div>
          <div class="form-group">
            <label>Separo * (MXN)</label>
            <input class="cot-input" id="vj-separo" type="number" min="0" step="1" placeholder="1000">
          </div>
        </div>
        <div id="vj-alert" style="margin-top:6px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-viajero')">Cancelar</button>
        <button class="btn btn-primary" id="vj-guardar-btn" onclick="guardarViajero()">Guardar viajero</button>
      </div>
    </div>`;
  openModal('modal-viajero');
}

async function guardarViajero() {
  const alertEl = document.getElementById('vj-alert');
  const btn = document.getElementById('vj-guardar-btn');
  const err = (m) => { if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${m}</div>`; };

  const nombre   = (document.getElementById('vj-nombre')?.value||'').trim();
  const celular  = (document.getElementById('vj-celular')?.value||'').trim();
  const correo   = (document.getElementById('vj-correo')?.value||'').trim();
  const eventoId = document.getElementById('vj-evento')?.value || '';
  const paquete  = document.getElementById('vj-paquete')?.value || '';
  const zona     = (document.getElementById('vj-zona')?.value||'').trim();
  const personas = parseInt(document.getElementById('vj-personas')?.value, 10) || 1;
  const habitacion = document.getElementById('vj-habitacion')?.value || '';
  const precioTotal = Number(document.getElementById('vj-precio')?.value);
  const montoSeparo = Number(document.getElementById('vj-separo')?.value);

  if (!nombre)  return err('El nombre es obligatorio');
  if (!celular) return err('El celular es obligatorio');
  if (!eventoId) return err('Selecciona un evento');
  if (!['PLUS','RIDE','STAY','CHEAP'].includes(paquete)) return err('Selecciona un paquete');
  if (!zona) return err('La zona es obligatoria');
  if (!isFinite(precioTotal) || precioTotal < 0) return err('Precio total inválido');
  if (!isFinite(montoSeparo) || montoSeparo < 0) return err('Separo inválido');
  if (montoSeparo > precioTotal) return err('El separo no puede ser mayor que el total');

  // Validación del correo (opcional). Formato malo → bloquea. Formato bueno pero
  // con typo probable → sugiere y espera que el humano acepte o lo use igual.
  if (correo) {
    if (!correoFormatoValido(correo)) {
      _vjMostrarCorreoError('El correo no parece válido. Revísalo.');
      return err('El correo no parece válido. Revísalo.');
    }
    const sug = sugerenciaCorreo(correo);
    if (sug && !_vjCorreoConfirmado) {
      _vjMostrarCorreoSugerencia(sug);
      return;  // espera la decisión del humano (aceptar / usar de todos modos)
    }
  }

  const ev = (_ccEventosCache || []).find(e => e.id === eventoId) || {};
  const eventoNombre = ev.nombre || eventoId;

  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  let solicitudId = null;
  try {
    // 1. Crear cliente + solicitud (en_pagos) en el modelo del portal.
    if (alertEl) alertEl.innerHTML = '<div class="alert" style="border-color:var(--border)">Creando viajero…</div>';
    const r = await khAdminFetch('/.netlify/functions/admin-crear-viajero', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({
        cliente:   { nombre_completo: nombre, celular, correo: correo || undefined },
        solicitud: { evento_id: eventoId, evento_nombre: eventoNombre, paquete, zona,
                     num_personas: personas, tipo_habitacion: habitacion || undefined,
                     precio_total: precioTotal, monto_separo: montoSeparo },
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo crear el viajero');
    solicitudId = data.solicitud_id;

    // 2. Generar el plan de pagos reusando la MISMA lógica que al aprobar una
    //    solicitud (separo #1 'pendiente' + quincenas). Generar-después-de-crear.
    if (alertEl) alertEl.innerHTML = '<div class="alert" style="border-color:var(--border)">Generando plan de pagos…</div>';
    const plan = await _spCalcularPlanPagos({
      evento_id: eventoId, evento_nombre: eventoNombre, paquete,
      precio_total: precioTotal, monto_separo: montoSeparo,
    });
    if (!plan.ok) throw new Error(plan.error || 'No se pudo calcular el plan de pagos');
    const rp = await khAdminFetch('/.netlify/functions/admin-generar-plan-pagos', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ solicitud_id: solicitudId, pagos: plan.pagos }),
    });
    const dataP = await rp.json();
    if (!rp.ok) throw new Error(dataP.error || 'Falló la generación del plan de pagos');

    closeModal('modal-viajero');
    let extraCorreo = '';
    if (dataP.correo_enviado) extraCorreo = ' <svg class="ic"><use href="#ic-correo"/></svg> Plan enviado al cliente por correo.';
    else if (dataP.correo_error || dataP.correo_enviado === false) extraCorreo = ' <svg class="ic"><use href="#ic-alerta"/></svg> El plan se creó pero el correo no salió.';
    showToast('Viajero dado de alta con su plan de pagos.' + extraCorreo, 'success');
    await loadViajeros();
  } catch(e) {
    if (solicitudId) {
      // El cliente+solicitud YA se crearon; reintentar duplicaría el cliente.
      // Cerramos y refrescamos (el viajero ya aparece) y avisamos del plan.
      closeModal('modal-viajero');
      showToast('Viajero creado, pero el plan de pagos falló: ' + e.message + '. Regenéralo desde Solicitudes Portal (cambiar estado a “En pagos”).', 'error');
      await loadViajeros();
    } else {
      err(e.message);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar viajero'; }
  }
}

// [ET3-b] Borrar a una persona de un evento no puede costar un clic de reflejo.
// Se retira el confirm() de una línea y entra el candado de la casa: TECLEAR EL
// NOMBRE, el mismo patrón de Cancelar evento y de Posponer.
//
// OJO CON LA TABLA: esto borra de `viajeros_evento` (Supabase KH) vía la acción
// `viajero_eliminar`, así que el botón vive en la tabla de MIGRADOS
// (#cc-kh-list, la que llena `khViajeros.listar`) y NO en #cc-viajeros-list,
// que muestra solicitudes_tour del PORTAL — otra tabla, en otra base, con otros
// ids. Colgarlo allá habría mandado un id del Portal a un DELETE de KH: un
// botón que no borra nada y un arnés en verde. Son los dos mundos de siempre.
function eliminarViajero(id, nombre) {
  const quien = String(nombre || '').trim();
  crearModal('vj-eliminar', 'Eliminar viajero', `
    <div style="border:1px solid var(--red);border-radius:var(--r-sm,8px);padding:12px 14px;margin-bottom:14px;font-size:13px;line-height:1.55;color:var(--red)">
      Vas a <b>ELIMINAR</b> a <b>${_esfEsc(quien || 'este viajero')}</b> de este evento.
      Se borra su registro y lo que traía capturado. Es <b>IRREVERSIBLE</b>.
    </div>
    <div class="form-group">
      <label>Para confirmar, escribe el nombre: <b>${_esfEsc(quien)}</b></label>
      <input type="text" class="cot-input" id="vjel-confirm" placeholder="Escribe: ${_esfEsc(quien)}" autocomplete="off" style="width:100%">
    </div>
    <div id="vjel-alert"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-ghost" onclick="cerrarModal('vj-eliminar')">Cerrar</button>
      <button class="btn btn-primary" id="vjel-btn" style="background:var(--red);border-color:var(--red)"
        onclick="_vjEliminarConfirmar('${_attrJs(id)}', '${_attrJs(quien)}')">Eliminar viajero</button>
    </div>`);
}

async function _vjEliminarConfirmar(id, nombre) {
  const alertEl = document.getElementById('vjel-alert');
  const btn = document.getElementById('vjel-btn');
  const tecleado = (document.getElementById('vjel-confirm')?.value || '').trim();
  if (tecleado !== String(nombre || '').trim()) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">El nombre no coincide; escribe '${_esfEsc(nombre)}' para confirmar</div>`;
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Eliminando…'; }
  try {
    await khViajeros.eliminar(id);   // [sec-coordi] accion 'viajero_eliminar', el servidor exige rol admin
    cerrarModal('vj-eliminar');
    await loadViajeros();            // recarga las dos listas (adentro llama a _vj2Cargar)
    showToast('Viajero eliminado', 'success');
  } catch (e) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = 'Eliminar viajero'; }
  }
}

async function exportarViajeros(formato) {
  if (!_ccViajeros.length) { alert('No hay viajeros para exportar'); return; }
  const excluirStaff = !!document.getElementById('cc-export-excluir-staff')?.checked;
  const lista = excluirStaff ? _ccViajeros.filter(v => !_esStaff(v)) : _ccViajeros;
  if (!lista.length) { alert('No hay clientes para exportar (todos son staff)'); return; }
  const ev = _ccEventosCache.find(e => e.id === _ccEventoActual);
  const sufijoTitulo = excluirStaff ? ' (sin staff)' : '';
  const titulo = `Viajeros — ${ev?.nombre||'Evento'}${sufijoTitulo}`;
  const _vNombre = v => (v.clientes || {}).nombre_completo || '';
  const _vCel    = v => (v.clientes || {}).celular || '';
  const _vCorreo = v => (v.clientes || {}).correo || '';
  const _vPago   = v => v.pago || {};
  if (formato === 'pdf') {
    const sufijoFile = excluirStaff ? '-sin-staff' : '';
    const html = `<html><head><meta charset="utf-8"><title>${_esfEsc(titulo)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px 12px;font-size:13px}th{background:#f5f5f5}td.num{text-align:right}</style></head><body>
    <h2>${_esfEsc(titulo)}</h2>
    <table><thead><tr><th>#</th><th>Nombre</th><th>Celular</th><th>Correo</th><th>Paquete</th><th>Zona</th><th>Pers.</th><th>Total</th><th>Abonado</th><th>Restante</th><th>Estado</th></tr></thead>
    <tbody>${lista.map((v,i)=>`<tr><td>${i+1}</td><td>${_vNombre(v)}</td><td>${_vCel(v)}</td><td>${_vCorreo(v)}</td><td>${v.paquete||''}</td><td>${_esfEsc(v.zona||'')}</td><td>${v.num_personas||1}</td><td class="num">${_spFmtMxn(_vPago(v).total)}</td><td class="num">${_spFmtMxn(_vPago(v).abonado)}</td><td class="num">${_spFmtMxn(_vPago(v).restante)}</td><td>${v.estado||''}</td></tr>`).join('')}</tbody>
    </table></body></html>`;
    _descargarHTML(`viajeros-${ev?.nombre||'evento'}${sufijoFile}.html`, html);
  } else {
    const headers = ['#','Nombre','Celular','Correo','Paquete','Zona','Personas','Total','Abonado','Restante','Estado'];
    const rows = lista.map((v,i) => [i+1,_vNombre(v),_vCel(v),_vCorreo(v),v.paquete||'',v.zona||'',v.num_personas||1,_vPago(v).total||0,_vPago(v).abonado||0,_vPago(v).restante||0,v.estado||''].map(c=>`"${String(c).replace(/"/g,'""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
    const sufijoFile = excluirStaff ? '-sin-staff' : '';
    a.download = `viajeros-${ev?.nombre||'evento'}${sufijoFile}.csv`;
    a.click();
  }
}

// ════════════════════════════════
// ROOMING LIST
// ════════════════════════════════
let _hotelSaveTimer = null;
let _ccHotelInfo = null;

const CAPACIDAD_HAB = { individual: 1, doble: 2, triple: 3, cuadruple: 4 };
const TIPO_LABELS   = { individual: 'Individual', doble: 'Doble', triple: 'Triple', cuadruple: 'Cuádruple' };
const TIPO_COL      = { individual: 'var(--ts)', doble: 'var(--blue)', triple: 'var(--gold)', cuadruple: 'var(--orange)' };

// Rooming básico (lectura): agrupa los viajeros del portal (_ccViajeros) por
// tipo_habitacion. La asignación fina cuarto-por-cuarto es fase futura. Los
// tipos válidos del portal son compartida|doble|triple|individual; los viajeros
// sin habitación (paquetes sin hotel, p.ej. RIDE/CHEAP) caen en "Sin habitación".
// [VJ-5] Trae los viajeros KH del evento. Fails-soft: sin ellos la pantalla de
// rooming es exactamente la de antes de esta tuerca.
async function _vj5Cargar() {
  try { _vj5KH = await khViajeros.listar(_ccEventoActual) || []; }   // [sec-coordi]
  catch (_) { _vj5KH = []; }
}

async function loadRooming() {
  if (!_ccEventoActual) return;
  await _vj5Cargar();  // [VJ-5] los migrados, para poder acomodarlos
  loadGruposPortal(); // [F4-t4] cuartos del Portal (best-effort, fails-soft, no bloquea)
  const list    = document.getElementById('cc-rooming-list');
  const resumen = document.getElementById('cc-rooming-resumen');
  if (!list) return;

  // [CAP-FIX-1] LOS CUARTOS DEL EVENTO, que nunca se cargaban.
  // `_ccHabitaciones` se declaraba y se leía en cinco lugares y NADIE la
  // llenaba: por eso el rooming no mostraba cuartos, "↓ CSV/PDF" siempre decía
  // "no hay habitaciones" y el modal de editar no encontraba nada. Fails-soft
  // igual que los grupos del Portal: si esto truena, el resto de la pantalla
  // sigue viva. El error se PINTA — un catch mudo fue lo que dejó este agujero
  // invisible tanto tiempo.
  let errCuartos = null;
  try {
    _ccHabitaciones = await khRooming.listar(_ccEventoActual); // [sec-sensibles]
  } catch (e) {
    _ccHabitaciones = [];
    errCuartos = e.message || 'No se pudieron cargar los cuartos.';
  }

  // [CAP-FIX-1] El hotel se guarda EN CADA CUARTO (guardarHotel escribe
  // hotel_nombre en todas las filas). Como los cuartos nunca se cargaban, esto
  // ponía null a ciegas y lo capturado se perdía al volver a entrar. Se lee del
  // primer cuarto que lo traiga; sin cuartos, sigue vacío como antes.
  const conHotel = (_ccHabitaciones || []).find(h => h.hotel_nombre) || null;
  _ccHotelInfo = conHotel ? {
    nombre: conHotel.hotel_nombre,
    direccion: conHotel.hotel_direccion || null,
    incluye_desayuno: !!conHotel.incluye_desayuno,
  } : null;
  renderHotelInfo();

  const GRUPOS = [
    { key: 'compartida', label: 'Compartida', col: 'var(--green)' },
    { key: 'doble',      label: 'Doble',      col: 'var(--blue)' },
    { key: 'triple',     label: 'Triple',     col: 'var(--gold)' },
    { key: 'individual', label: 'Individual', col: 'var(--orange)' },
    { key: '_sin',       label: 'Sin habitación', col: 'var(--ts)' },
  ];
  const VALIDOS = ['compartida','doble','triple','individual'];
  const porTipo = {};
  GRUPOS.forEach(g => { porTipo[g.key] = []; });
  (_ccViajeros || []).forEach(v => {
    const t = VALIDOS.includes(v.tipo_habitacion) ? v.tipo_habitacion : '_sin';
    porTipo[t].push(v);
  });

  if (resumen) {
    resumen.innerHTML = GRUPOS.filter(g => porTipo[g.key].length).map(g =>
      `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:8px 14px;text-align:center;min-width:80px">
        <div style="font-family:'Zen Dots',sans-serif;font-size:22px;color:${g.col}">${porTipo[g.key].length}</div>
        <div style="font-size:10px;color:var(--ts)">${g.label}</div>
      </div>`).join('');
  }

  // [CAP-FIX-1] Los cuartos REALES van primero: son lo que existe. Lo de abajo
  // es el agrupado por el tipo de cuarto que PIDIÓ cada viajero del Portal —
  // demanda, no cuartos— y se queda tal cual estaba.
  const bloqueCuartos = _capCuartosHtml(errCuartos);

  const conData = GRUPOS.filter(g => porTipo[g.key].length);
  if (!conData.length) {
    // [CAP-FIX-1] En un evento SOLO-KH (melanie: cero solicitudes del Portal)
    // este vacío ocupaba la pantalla entera y decía "sin viajeros" con los
    // cuartos ya armados arriba. El vacío grande es correcto SOLO cuando no hay
    // nada; con cuartos, se dice en una línea de qué está hablando.
    list.innerHTML = bloqueCuartos + ((_ccHabitaciones || []).length
      ? '<div class="cap-cuartos-d">Sin viajeros del Portal en este evento — el rooming se arma con los cuartos de arriba.</div>'
      : '<div class="empty-state"><div class="empty-icon">·</div>Sin viajeros aprobados para armar rooming</div>');
    return;
  }

  list.innerHTML = bloqueCuartos + conData.map(g => {
    const miembros = porTipo[g.key];
    const chips = miembros.map(v => {
      const c = v.clientes || {};
      const meta = [v.paquete, v.zona, (v.num_personas && v.num_personas > 1) ? (v.num_personas + ' pers.') : null].filter(Boolean).join(' · ');
      return `<div style="background:rgba(255,255,255,.07);border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:6px 14px;font-size:13px">
        <span style="font-weight:600">${_esfEsc(c.nombre_completo || '—')}</span>
        ${meta ? `<span style="font-size:10px;color:var(--ts);margin-left:8px;font-family:'JetBrains Mono',monospace">${meta}</span>` : ''}
      </div>`;
    }).join('');
    return `<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${g.col};border-radius:var(--radius);padding:14px 18px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <span style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:18px">${g.label}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:${g.col};letter-spacing:.1em">${miembros.length} ${miembros.length===1?'viajero':'viajeros'}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>
    </div>`;
  }).join('');
}

// [CAP-FIX-1] Los cuartos KH del evento, con sus ocupantes. Los migrados se
// rotulan: en la lista conviven con los del Portal y su cuarto se escribe en
// OTRA tabla (viajeros_evento.habitacion_id), así que saber cuál es cuál no es
// decoración.
function _capCuartosHtml(err) {
  const cabecera = `
    <div class="cap-cuartos-t">// CUARTOS DEL EVENTO</div>
    <div class="cap-cuartos-d">Los armas aquí con el botón <b>+ Habitación</b>. Los <b>migrados</b> del Excel se marcan aparte: su cuarto se guarda en su propia ficha.</div>`;
  if (err) {
    return `<div class="cap-cuartos">${cabecera}<div class="alert alert-error" style="font-size:12px">${_esfEsc(err)}</div></div>`;
  }
  const habs = _ccHabitaciones || [];
  if (!habs.length) {
    return `<div class="cap-cuartos">${cabecera}<div class="cap-cuarto-vacio">Todavía no hay cuartos. Créalos con <b>+ Habitación</b>.</div></div>`;
  }
  // Nombre → migrado, para rotular sin adivinar por parecido de texto.
  const migPorNombre = new Map();
  (_vj5KH || []).forEach(v => { if (v.habitacion_id) migPorNombre.set(v.nombre, v.habitacion_id); });

  const filas = habs.map((h) => {
    const ocp = h.ocupantes ? (typeof h.ocupantes === 'string' ? JSON.parse(h.ocupantes) : h.ocupantes) : [];
    const cap = CAPACIDAD_HAB[h.tipo] || 1;
    const lleno = ocp.length >= cap;
    const chips = ocp.map(n => {
      const esMig = migPorNombre.get(n) === h.id;
      return `<span class="cap-ocp${esMig ? ' cap-ocp-mig' : ''}">${_esfEsc(n)}${esMig ? '<span class="cap-mig">migrado</span>' : ''}</span>`;
    }).join('');
    return `
      <div class="cap-cuarto">
        <div class="cap-cuarto-h">
          <span class="cap-cuarto-n">Habitación ${_esfEsc(h.numero_hab || h.orden || '')} · ${_esfEsc(TIPO_LABELS[h.tipo] || h.tipo || '')}</span>
          <span class="cap-cuarto-c${lleno ? ' cap-cuarto-lleno' : ''}">(${ocp.length}/${cap})</span>
          <span class="cap-cuarto-acc">
            <button type="button" onclick="abrirModalHabitacion('${_esfEsc(h.id)}')" title="Editar habitación"><svg class="ic"><use href="#ic-lapiz"/></svg></button>
            <button type="button" onclick="eliminarHabitacion('${_esfEsc(h.id)}')" title="Eliminar habitación"><svg class="ic"><use href="#ic-basura"/></svg></button>
          </span>
        </div>
        <div class="cap-cuarto-ocp">${chips || '<span class="cap-cuarto-vacio">Cuarto vacío</span>'}</div>
      </div>`;
  }).join('');
  return `<div class="cap-cuartos">${cabecera}${filas}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// [acompañantes F6-t1] LISTA PARA EL HOTEL imprimible. Solo lectura: junta los
// grupos del Portal (khRoomingGrupos) + el rooming KH (_ccViajeros por tipo) y
// abre una ventana MÍNIMA en NEGRO SOBRE BLANCO que dispara print() (el usuario
// elige "Guardar como PDF"), patrón del PDF de contratos (#227). Sin dinero.
// ═══════════════════════════════════════════════════════════════

// Helper reusable (la t2 lo reusa): ventana mínima imprimible, sin el CSS de KH.
function _printVentana(titulo, htmlCuerpo) {
  const w = window.open('', '_blank');
  if (!w) { alert('Permite las ventanas emergentes para generar la lista.'); return; }
  const generado = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey', dateStyle: 'long', timeStyle: 'short' });
  const doc = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${_esfEsc(titulo)}</title>
<style>
  @page { size: letter; margin: 14mm; }
  *,*::before,*::after { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Arial, sans-serif; color:#000; background:#fff; margin:0; font-size:12px; line-height:1.4; }
  .cx-eyebrow { font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:#666; margin-bottom:6px }
  .cx-eyebrow b { color:#ff283b; font-weight:900 }
  h1 { font-size:18px; margin:0 0 2px }
  .cx-sub { color:#555; font-size:11px; margin:0 0 18px }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.05em; border-bottom:2px solid #000; padding-bottom:4px; margin:22px 0 10px }
  table { width:100%; border-collapse:collapse; margin:0 0 12px }
  th,td { text-align:left; padding:6px 8px; border-bottom:1px solid #ccc; vertical-align:top }
  th { font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:#444; border-bottom:1px solid #000 }
  section, tr, h2, .cx-grupo { break-inside: avoid }
  .cx-resumen { margin-top:20px; padding-top:10px; border-top:2px solid #000; font-size:12px }
  .cx-muted { color:#888 }
</style></head>
<body>
  <div class="cx-eyebrow"><b>Conecta</b> MX</div>
  <h1>${_esfEsc(titulo)}</h1>
  <div class="cx-sub">Generado el ${_esfEsc(generado)}</div>
  ${htmlCuerpo}
  <script>window.onload=function(){setTimeout(function(){window.print();},120);};<\/script>
</body></html>`;
  w.document.open(); w.document.write(doc); w.document.close();
}

// Etiqueta capitalizada del tipo de cuarto (Sección 2 usa minúsculas).
function _rgTipoLabel(t) {
  const s = String(t || '').toLowerCase();
  return ({ compartida: 'Compartida', doble: 'Doble', triple: 'Triple', individual: 'Individual', cuadruple: 'Cuádruple' }[s]) || (t || '—');
}

async function imprimirListaHotel() {
  if (!_ccEventoActual) { alert('Selecciona un evento primero.'); return; }
  const ev = _ccEventosCache.find(e => e.id === _ccEventoActual) || {};
  const eventoNombre = ev.nombre || _ccEventoActual;

  // ── Datos frescos ──
  let grupos = [];
  try { grupos = await khRoomingGrupos.listar(_ccEventoActual); } catch (e) { grupos = []; }
  const viajeros = Array.isArray(_ccViajeros) ? _ccViajeros : [];

  // Conteo de cuartos por tipo (Sección 1, cuartos reales del puzzle) + personas.
  const cuartosPorTipo = {}; // 'Compartida' → n
  let personasGrupos = 0, personasStaff = 0;

  // ── SECCIÓN 1 — Cuartos de grupos (Portal) ──
  const filasCuartos = [];
  const sinAcomodar = []; // { titular, personas:[nombre] }
  grupos.forEach(g => {
    const titular = (g.titular_nombre && String(g.titular_nombre).trim()) || 'Titular';
    // Multifecha: chip "Fecha N" en la etiqueta del grupo (fecha única → '').
    const _fi = _rgFechaIdx(g.evento_id);
    const fechaChip = _fi === null ? '' : ` <span style="font-size:11px;color:#555;border:1px solid #bbb;border-radius:var(--r-sm,8px);padding:0 6px">Fecha ${_fi + 1}</span>`;
    const activos = (g.lugares || []).filter(l => l.estado === 'activo');
    personasGrupos += activos.length;
    const nombreDe = (l) => (l.nombre && String(l.nombre).trim()) ? l.nombre : ('Lugar #' + l.numero + ' — por confirmar');
    const ocupPorHab = {};
    activos.forEach(l => { if (l.habitacion_grupo_id) { (ocupPorHab[l.habitacion_grupo_id] = ocupPorHab[l.habitacion_grupo_id] || []).push(l); } });
    (g.habitaciones || []).forEach(h => {
      const ocup = ocupPorHab[h.id] || [];
      const lbl = _rgTipoLabel(h.tipo);
      cuartosPorTipo[lbl] = (cuartosPorTipo[lbl] || 0) + 1;
      const nombres = ocup.length ? ocup.map(nombreDe).map(_esfEsc).join(', ') : '<span class="cx-muted">(vacío)</span>';
      filasCuartos.push(`<tr>
        <td>${_esfEsc('Grupo de ' + titular + ' · Cuarto ' + h.orden)}${fechaChip}</td>
        <td>${_esfEsc(lbl)}</td>
        <td>${nombres}</td>
        <td>${ocup.length}/${_esfEsc(h.capacidad)}</td>
      </tr>`);
    });
    // Personas activas sin cuarto asignado → SIN ACOMODAR.
    const sc = activos.filter(l => !l.habitacion_grupo_id);
    if (sc.length) sinAcomodar.push({ titular, fechaChip, personas: sc.map(nombreDe) });
  });

  let seccion1 = `<h2>Cuartos de grupos</h2>`;
  if (filasCuartos.length) {
    seccion1 += `<table><thead><tr><th>Cuarto</th><th>Tipo</th><th>Ocupantes</th><th>Ocup.</th></tr></thead><tbody>${filasCuartos.join('')}</tbody></table>`;
  } else {
    seccion1 += `<div class="cx-muted">Sin cuartos armados por los grupos.</div>`;
  }
  if (sinAcomodar.length) {
    seccion1 += `<h2>Sin acomodar</h2>` + sinAcomodar.map(s =>
      `<div class="cx-grupo" style="margin-bottom:8px"><b>Grupo de ${_esfEsc(s.titular)}:</b>${s.fechaChip || ''} ${s.personas.map(_esfEsc).join(', ')}</div>`
    ).join('');
  }

  // ── SECCIÓN 2 — Staff / rooming interno (KH), agrupado por tipo (como loadRooming) ──
  const VALIDOS = ['compartida', 'doble', 'triple', 'individual'];
  const porTipo = { compartida: [], doble: [], triple: [], individual: [], _sin: [] };
  viajeros.forEach(v => {
    const t = VALIDOS.includes(v.tipo_habitacion) ? v.tipo_habitacion : '_sin';
    porTipo[t].push(v);
    personasStaff += Number(v.num_personas) > 0 ? Number(v.num_personas) : 1;
    // El resumen de "cuartos por tipo" cuenta solo cuartos REALES (Sección 1); el
    // rooming KH agrupa por tipo pedido, no forma cuartos discretos → no suma aquí.
  });
  const filasStaff = [];
  [...VALIDOS, '_sin'].forEach(t => {
    (porTipo[t] || []).forEach(v => {
      const c = v.clientes || {};
      const meta = [v.paquete, v.zona, (Number(v.num_personas) > 1) ? (v.num_personas + ' pers.') : null].filter(Boolean).join(' · ');
      filasStaff.push(`<tr>
        <td>${_esfEsc(t === '_sin' ? 'Sin habitación' : _rgTipoLabel(t))}</td>
        <td>${_esfEsc(c.nombre_completo || '—')}</td>
        <td>${_esfEsc(meta)}</td>
      </tr>`);
    });
  });
  let seccion2 = `<h2>Staff / rooming interno</h2>`;
  seccion2 += filasStaff.length
    ? `<table><thead><tr><th>Tipo</th><th>Viajero</th><th>Paquete · Zona</th></tr></thead><tbody>${filasStaff.join('')}</tbody></table>`
    : `<div class="cx-muted">Sin viajeros en el rooming interno.</div>`;

  // ── Resumen ──
  const tiposResumen = Object.keys(cuartosPorTipo).filter(k => cuartosPorTipo[k] > 0)
    .map(k => `${cuartosPorTipo[k]} ${k}${cuartosPorTipo[k] !== 1 ? 's' : ''}`).join(' · ');
  const resumen = `<div class="cx-resumen">
    <div><b>Cuartos de grupos por tipo:</b> ${tiposResumen ? _esfEsc(tiposResumen) : '<span class="cx-muted">ninguno</span>'}</div>
    <div style="margin-top:4px"><b>Total de personas:</b> ${personasGrupos + personasStaff} <span class="cx-muted">(${personasGrupos} en grupos · ${personasStaff} en rooming interno)</span></div>
  </div>`;

  _printVentana('Lista para hotel — ' + eventoNombre, seccion1 + seccion2 + resumen);
}

// < 18 años cumplidos HOY a partir de 'YYYY-MM-DD'. Falso sin fecha.
function _rgEsMenor(fnac) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fnac || '').slice(0, 10));
  if (!m) return false;
  const hoy = new Date();
  let edad = hoy.getFullYear() - Number(m[1]);
  const mm = hoy.getMonth() + 1, dd = hoy.getDate();
  if (mm < Number(m[2]) || (mm === Number(m[2]) && dd < Number(m[3]))) edad--;
  return edad < 18;
}

// [F6-t2] LISTA PARA COORDIS: TODO viajero del evento (grupos, individuales y staff)
// con contacto, cuarto, paquete/zona y bandera de menor. Reusa _printVentana (#242).
async function imprimirListaCoordis() {
  if (!_ccEventoActual) { alert('Selecciona un evento primero.'); return; }
  const ev = _ccEventosCache.find(e => e.id === _ccEventoActual) || {};
  const eventoNombre = ev.nombre || _ccEventoActual;

  let grupos = [];
  try { grupos = await khRoomingGrupos.listar(_ccEventoActual, { todos: true }); } catch (e) { grupos = []; }
  const viajeros = Array.isArray(_ccViajeros) ? _ccViajeros : [];

  let totalPersonas = 0, totalMenores = 0;

  // ── Filas de grupos/individuales (solo lugares ACTIVOS), ordenadas por titular y numero ──
  const gruposOrd = [...grupos].sort((a, b) => String(a.titular_nombre || '').localeCompare(String(b.titular_nombre || ''), 'es'));
  const filas = [];
  gruposOrd.forEach(g => {
    const esIndividual = (g.lugares || []).length === 1;
    const grupoLbl = esIndividual ? 'Individual' : ('Grupo de ' + (g.titular_nombre || 'Titular'));
    // Multifecha: chip "Fecha N" junto a la etiqueta del grupo (fecha única → '').
    const _fi = _rgFechaIdx(g.evento_id);
    const fechaChip = _fi === null ? '' : ` <span style="font-size:11px;color:#555;border:1px solid #bbb;border-radius:var(--r-sm,8px);padding:0 6px">Fecha ${_fi + 1}</span>`;
    const habById = {};
    (g.habitaciones || []).forEach(h => { habById[h.id] = h; });
    (g.lugares || []).filter(l => l.estado === 'activo').forEach(l => {
      totalPersonas++;
      const nombre = (l.nombre && String(l.nombre).trim()) ? l.nombre : ('Lugar #' + l.numero + ' — por confirmar');
      const contacto = (l.celular && String(l.celular).trim()) || (l.correo && String(l.correo).trim()) || '—';
      const hab = l.habitacion_grupo_id ? habById[l.habitacion_grupo_id] : null;
      const cuarto = hab ? (_rgTipoLabel(hab.tipo) + ' #' + hab.orden) : '—';
      const pz = [l.paquete, l.zona].filter(v => v != null && String(v).trim() !== '').join(' · ');
      const menor = _rgEsMenor(l.fecha_nacimiento);
      if (menor) totalMenores++;
      filas.push(`<tr>
        <td>${_esfEsc(nombre)}</td>
        <td>${_esfEsc(contacto)}</td>
        <td>${_esfEsc(grupoLbl)}${fechaChip}</td>
        <td>${_esfEsc(cuarto)}</td>
        <td>${_esfEsc(pz)}</td>
        <td>${menor ? '<b>MENOR</b>' : ''}</td>
      </tr>`);
    });
  });
  let cuerpo = `<h2>Viajeros del evento</h2>`;
  cuerpo += filas.length
    ? `<table><thead><tr><th>Nombre</th><th>Contacto</th><th>Grupo</th><th>Cuarto</th><th>Paquete · Zona</th><th>Notas</th></tr></thead><tbody>${filas.join('')}</tbody></table>`
    : `<div class="cx-muted">Sin viajeros de grupos/individuales en este evento.</div>`;

  // ── Sección STAFF (rooming KH, _ccViajeros) con su celular ──
  const filasStaff = [];
  let personasStaff = 0;
  viajeros.forEach(v => {
    const c = v.clientes || {};
    const nP = Number(v.num_personas) > 0 ? Number(v.num_personas) : 1;
    personasStaff += nP;
    const contacto = (c.celular && String(c.celular).trim()) || (c.correo && String(c.correo).trim()) || '—';
    const pz = [v.paquete, v.zona, (nP > 1 ? nP + ' pers.' : null)].filter(Boolean).join(' · ');
    filasStaff.push(`<tr>
      <td>${_esfEsc(c.nombre_completo || '—')}</td>
      <td>${_esfEsc(contacto)}</td>
      <td>${_esfEsc(v.tipo_habitacion ? _rgTipoLabel(v.tipo_habitacion) : '—')}</td>
      <td>${_esfEsc(pz)}</td>
    </tr>`);
  });
  cuerpo += `<h2>Staff / rooming interno</h2>`;
  cuerpo += filasStaff.length
    ? `<table><thead><tr><th>Viajero</th><th>Contacto</th><th>Tipo</th><th>Paquete · Zona</th></tr></thead><tbody>${filasStaff.join('')}</tbody></table>`
    : `<div class="cx-muted">Sin viajeros en el rooming interno.</div>`;

  // ── Resumen ──
  cuerpo += `<div class="cx-resumen">
    <div><b>Total de viajeros:</b> ${totalPersonas + personasStaff} <span class="cx-muted">(${totalPersonas} en grupos/individuales · ${personasStaff} en rooming interno)</span></div>
    <div style="margin-top:4px"><b>Menores de edad:</b> ${totalMenores}</div>
  </div>`;

  _printVentana('Lista para coordis — ' + eventoNombre, cuerpo);
}

function renderHotelInfo() {
  const el = document.getElementById('cc-hotel-info');
  if (!el) return;
  if (!_ccHotelInfo?.nombre) {
    el.innerHTML = `<div style="color:var(--ts);font-size:12px">Sin hotel — <button class="btn btn-ghost btn-sm" onclick="abrirModalHotel()" style="font-size:11px">+ Agregar hotel</button></div>`;
    return;
  }
  el.innerHTML = `<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
    <div>
      <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:18px">${_esfEsc(_ccHotelInfo.nombre)}</div>
      ${_ccHotelInfo.direccion?`<div style="font-size:12px;color:var(--ts);margin-top:2px">${_esfEsc(_ccHotelInfo.direccion)}</div>`:''}
    </div>
    <div style="font-size:11px;padding:4px 12px;border-radius:var(--r-card,16px);border:1px solid ${_ccHotelInfo.incluye_desayuno?'rgba(61,220,132,.3)':'var(--border)'};color:${_ccHotelInfo.incluye_desayuno?'var(--green)':'var(--ts)'}">
      ${_ccHotelInfo.incluye_desayuno?'✓ Con desayuno':'✗ Sin desayuno'}
    </div>
  </div>`;
}

function abrirModalHotel() {
  const h = _ccHotelInfo || {};
  document.getElementById('modal-habitacion').innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">Información del Hotel</div>
        <button class="modal-close" onclick="closeModal('modal-habitacion')">×</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div class="form-group">
          <label>Nombre del hotel *</label>
          <input class="cot-input" id="hot-nombre" value="${_esfEsc(h.nombre||'')}" placeholder="Hotel Camino Real…" style="width:100%">
        </div>
        <div class="form-group">
          <label>Dirección</label>
          <input class="cot-input" id="hot-dir" value="${_esfEsc(h.direccion||'')}" placeholder="Calle, colonia, ciudad…" style="width:100%">
        </div>
        <label style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--bg3);border-radius:var(--r-sm,8px);cursor:pointer;border:1px solid var(--border)">
          <input type="checkbox" id="hot-desayuno" ${h.incluye_desayuno?'checked':''} style="accent-color:var(--green);width:16px;height:16px;cursor:pointer">
          <span style="font-size:13px">Incluye desayuno</span>
        </label>
        <div id="hot-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-habitacion')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarHotel()">Guardar hotel</button>
      </div>
    </div>`;
  openModal('modal-habitacion');
}

async function guardarHotel() {
  const nombre = document.getElementById('hot-nombre')?.value.trim();
  if (!nombre) { document.getElementById('hot-alert').innerHTML='<div class="alert alert-error">El nombre es obligatorio</div>'; return; }
  _ccHotelInfo = {
    nombre,
    direccion:        document.getElementById('hot-dir')?.value.trim()||null,
    incluye_desayuno: document.getElementById('hot-desayuno')?.checked||false,
  };
  for (const h of _ccHabitaciones) {
    await khRooming.actualizar(h.id, { // [sec-sensibles]
      hotel_nombre:    _ccHotelInfo.nombre,
      hotel_direccion: _ccHotelInfo.direccion,
      incluye_desayuno:_ccHotelInfo.incluye_desayuno,
    }).catch(()=>{});
  }
  renderHotelInfo();
  closeModal('modal-habitacion');
}

// [CAP-FIX-1] UNA SOLA PLANTILLA DE OCUPANTES, y no dos.
//
// Esta función vivía DUPLICADA dentro de abrirModalHabitacion y otra vez en
// actualizarOcupantesHab (la que corre al cambiar el tipo de cuarto). La copia
// de allá nunca supo de VJ-4 ni de VJ-5: ofrecía cheap y BORRABA a los migrados
// en cuanto Memo cambiaba "Doble" por "Triple". Es la misma mordida de las
// funciones gemelas — la de abajo se quedó atrás sin que nadie lo viera porque
// nadie podía abrir el modal.
function _capSelectsHab(tipo, ocsActuales, habId) {
  const cap = CAPACIDAD_HAB[tipo] || 1;
  const idRef = habId || '__none__';

  // [VJ-4] Quien no duerme NO se ofrece. Se filtra EN LA FUENTE de la lista, no
  // al pintar: un CHEAP es solo boleto y no tiene hospedaje.
  const nombresViajeros = (_ccViajeros || [])
    .filter(v => _vj4Duerme(v.paquete))
    .map(v => v.clientes?.nombre_completo).filter(Boolean);
  const nombresEquipo = (_ccAsignados || []).map(a => a._usuario?.nombre || '').filter(Boolean);
  const khDuermen = (_vj5KH || []).filter(v => _vj4Duerme(v.tipo_paquete));

  // Personas ya asignadas en OTROS cuartos (no se vuelven a ofrecer).
  const yaAsignados = new Set(
    (_ccHabitaciones || [])
      .filter(x => x.id !== idRef)
      .flatMap(x => x.ocupantes ? (typeof x.ocupantes === 'string' ? JSON.parse(x.ocupantes) : x.ocupantes) : [])
      .filter(n => n && n !== 'Chofer')
  );
  const disp = (lista) => lista.filter(n => !yaAsignados.has(n));

  return Array.from({ length: cap }).map((_, i) => {
    const dispViajeros = disp(nombresViajeros);
    const dispEquipo = disp(nombresEquipo);
    const actual = ocsActuales[i];
    // [VJ-5] Los MIGRADOS del Excel. Las NOTAS ("Hab Doble - comparte con X")
    // viajan junto al nombre: son la guía con la que Memo arma los cuartos, y
    // perderlas convierte el acomodo en adivinanza. El value lleva el ID y no el
    // nombre — dos personas pueden llamarse igual, y aquí el id decide en qué
    // fila se escribe el cuarto.
    const libres = khDuermen.filter(v => !v.habitacion_id || v.habitacion_id === idRef);
    const grupoMigrados = libres.length
      ? `<optgroup label="Migrados del Excel">${libres.map(v => {
          const nota = v.notas ? ` — ${String(v.notas).slice(0, 70)}` : '';
          return `<option value="kh:${_esfEsc(v.id)}" ${actual === ('kh:' + v.id) ? 'selected' : ''}>${_esfEsc(v.nombre)}${_esfEsc(nota)}</option>`;
        }).join('')}</optgroup>`
      : '';
    return `
      <div style="margin-bottom:8px">
        <div style="font-size:10px;color:var(--ts);margin-bottom:4px">Lugar ${i + 1}</div>
        <select class="cot-input ocp-select" style="width:100%">
          <option value="">— Lugar libre —</option>
          <optgroup label="Viajeros disponibles">
            ${dispViajeros.map(n => `<option value="${n}" ${actual === n ? 'selected' : ''}>${n}</option>`).join('')}
            ${actual && !dispViajeros.includes(actual) && nombresViajeros.includes(actual) ? `<option value="${actual}" selected>${actual} ✓</option>` : ''}
          </optgroup>
          ${grupoMigrados}
          ${dispEquipo.length ? `<optgroup label="Equipo disponible">${dispEquipo.map(n => `<option value="${n}" ${actual === n ? 'selected' : ''}>${n}</option>`).join('')}</optgroup>` : ''}
          <optgroup label="Otros"><option value="Chofer" ${actual === 'Chofer' ? 'selected' : ''}>Chofer</option></optgroup>
        </select>
      </div>`;
  }).join('');
}

function abrirModalHabitacion(id) {
  const h = id ? (_ccHabitaciones.find(x => x.id === id) || {}) : {};
  const ocupantes = h?.ocupantes ? (typeof h.ocupantes === 'string' ? JSON.parse(h.ocupantes) : h.ocupantes) : [];
  const tipoActual = h.tipo || 'doble';
  // Solo para el aviso de "no hay a quién asignar": la lista real la arma
  // _capSelectsHab, que es la única plantilla.
  const hayAQuienAsignar = (_ccViajeros || []).some(v => _vj4Duerme(v.paquete))
    || (_vj5KH || []).some(v => _vj4Duerme(v.tipo_paquete))
    || (_ccAsignados || []).length > 0;

  document.getElementById('modal-habitacion').innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">${id?'Editar Habitación':'Nueva Habitación'}</div>
        <button class="modal-close" onclick="closeModal('modal-habitacion')">×</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="hab-id" value="${h?.id||''}">
        <div class="form-group">
          <label>Tipo de habitación *</label>
          <select class="cot-input" id="hab-tipo" onchange="actualizarOcupantesHab(this.value)">
            ${Object.entries(TIPO_LABELS).map(([k,v])=>`<option value="${k}" ${tipoActual===k?'selected':''}>${v} — máx ${CAPACIDAD_HAB[k]} persona${CAPACIDAD_HAB[k]>1?'s':''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Asignar ocupantes</label>
          <div id="hab-ocupantes-container">${_capSelectsHab(tipoActual, ocupantes, id)}</div>
          ${!hayAQuienAsignar?'<div style="font-size:11px;color:var(--ts);margin-top:4px"><svg class="ic"><use href="#ic-alerta"/></svg> Agrega viajeros primero para poder asignarlos</div>':''}
        </div>
        <div id="hab-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-habitacion')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarHabitacion()">Guardar</button>
      </div>
    </div>`;
  openModal('modal-habitacion');
}

// Cambiar el tipo de cuarto RE-PINTA los lugares. Antes tenía su propia copia de
// la plantilla —sin migrados y sin el filtro de VJ-4—, así que pasar de Doble a
// Triple borraba a los migrados ya elegidos. Ahora llama a la única que hay.
function actualizarOcupantesHab(tipo) {
  const container = document.getElementById('hab-ocupantes-container');
  if (!container) return;
  const habId = document.getElementById('hab-id')?.value || '';
  // Lo ya elegido se conserva al cambiar de tipo: los primeros `cap` lugares.
  const elegidos = Array.from(document.querySelectorAll('.ocp-select')).map(x => x.value);
  container.innerHTML = _capSelectsHab(tipo, elegidos, habId);
}

async function guardarHabitacion() {
  const id   = document.getElementById('hab-id')?.value;
  const tipo = document.getElementById('hab-tipo')?.value;
  const crudos = Array.from(document.querySelectorAll('.ocp-select')).map(s=>s.value).filter(Boolean);
  // [VJ-5] Los migrados vienen como `kh:<uuid>`. En `ocupantes` se guarda su
  // NOMBRE, igual que siempre, para que la rooming list y su descarga sigan
  // leyéndose sin cambiar de forma; el vínculo real se escribe aparte en
  // viajeros_evento.habitacion_id.
  const khIds = crudos.filter(v => v.startsWith('kh:')).map(v => v.slice(3));
  const ocupantes = crudos.map(v => {
    if (!v.startsWith('kh:')) return v;
    const m = (_vj5KH || []).find(x => x.id === v.slice(3));
    return m ? m.nombre : null;
  }).filter(Boolean);
  const cap = CAPACIDAD_HAB[tipo] || 1;
  if (ocupantes.length > cap) {
    document.getElementById('hab-alert').innerHTML=`<div class="alert alert-error">Máximo ${cap} persona${cap>1?'s':''} en habitación ${TIPO_LABELS[tipo]}</div>`;
    return;
  }
  const orden = id ? (_ccHabitaciones.find(h=>h.id===id)?.orden||0) : _ccHabitaciones.length + 1;
  const body = {
    evento_id:       _ccEventoActual,
    tipo, orden,
    numero_hab:      String(id ? (_ccHabitaciones.find(h=>h.id===id)?.orden||orden) : orden),
    ocupantes:       JSON.stringify(ocupantes),
    hotel_nombre:    _ccHotelInfo?.nombre||null,
    hotel_direccion: _ccHotelInfo?.direccion||null,
    incluye_desayuno:_ccHotelInfo?.incluye_desayuno||false,
  };
  try {
    let habId = id;
    if (id) await khRooming.actualizar(id, body); // [sec-sensibles]
    else {
      const creado = await khRooming.crear(body); // [sec-sensibles]
      // El id del cuarto recién creado hace falta para escribirlo en las filas
      // de los migrados: sin él quedarían acomodados "en ninguna parte".
      // [CAP-FIX-1] El campo se llama `hab` — así lo devuelve admin-rooming
      // ({ ok, hab }). VJ-5 leía `habitacion`, un nombre que solo existía en el
      // mock de su arnés: en producción `habId` habría salido null SIEMPRE y el
      // migrado se habría quedado sin cuarto en silencio. Se aceptan los tres
      // por si algún día cambia, pero el bueno es el primero.
      habId = (creado && (creado.hab?.id || creado.habitacion?.id || creado.id)) || null;
    }
    // [VJ-5] Sincroniza el cuarto de los migrados: los elegidos APUNTAN a este
    // cuarto, y los que estaban aquí y ya no se eligieron se QUEDAN SIN cuarto.
    // Sin esa segunda mitad, sacar a alguien de un cuarto lo dejaría marcado
    // como si siguiera dentro.
    if (habId) {
      const antes = (_vj5KH || []).filter(v => v.habitacion_id === habId).map(v => v.id);
      const quitar = antes.filter(x => !khIds.includes(x));
      for (const vid of khIds) { try { await khViajeros.habitacion(vid, habId); } catch (e) { console.warn('[VJ-5]', e.message); } }
      for (const vid of quitar) { try { await khViajeros.habitacion(vid, null); } catch (e) { console.warn('[VJ-5]', e.message); } }
      await _vj5Cargar();
    }
    closeModal('modal-habitacion');
    await loadRooming();
  } catch(e) { document.getElementById('hab-alert').innerHTML=`<div class="alert alert-error">${e.message}</div>`; }
}

async function eliminarHabitacion(id) {
  if (!confirm('¿Eliminar esta habitación?')) return;
  try { await khRooming.eliminar(id); await loadRooming(); } // [sec-sensibles]
  catch(e) { alert(e.message); }
}
async function exportarRooming(formato) {
  if (!_ccHabitaciones.length) { alert('No hay habitaciones para exportar'); return; }
  const excluirStaff = !!document.getElementById('cc-rooming-excluir-staff')?.checked;
  // Set de nombres staff del evento — solo necesario cuando se quiere filtrar.
  let staffNames = new Set();
  if (excluirStaff) {
    // El staff que ocupa cuartos viene de _ccAsignados (equipo coordi/cc, con
    // a._usuario.nombre), NO de _ccViajeros (clientes del Portal, nunca staff).
    // El chofer NO se excluye (es huésped real del hotel).
    staffNames = new Set(
      (_ccAsignados || [])
        .map(a => (a._usuario?.nombre || '').trim().toLowerCase())
        .filter(Boolean)
    );
  }
  const filtrarOcp = ocp => excluirStaff
    ? ocp.filter(n => !staffNames.has(String(n || '').trim().toLowerCase()))
    : ocp;
  const ev = _ccEventosCache.find(e => e.id === _ccEventoActual);
  const hotel = document.getElementById('cc-hotel-nombre')?.value || '';
  const sufijoTitulo = excluirStaff ? ' (sin staff)' : '';
  const titulo = `Rooming List — ${ev?.nombre||'Evento'}${hotel?' · '+hotel:''}${sufijoTitulo}`;
  const tipoLabel = {individual:'Individual',doble:'Doble',triple:'Triple',cuadruple:'Cuádruple'};
  if (formato === 'pdf') {
    const sufijoFile = excluirStaff ? '-sin-staff' : '';
    const html = `<html><head><meta charset="utf-8"><title>${_esfEsc(titulo)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px 12px;font-size:13px;vertical-align:top}th{background:#f5f5f5}</style></head><body>
    <h2>${_esfEsc(titulo)}</h2>
    <table><thead><tr><th>Habitación</th><th>Tipo</th><th>Ocupantes</th></tr></thead>
    <tbody>${_ccHabitaciones.map(h=>{
      const ocp = filtrarOcp(h.ocupantes?(typeof h.ocupantes==='string'?JSON.parse(h.ocupantes):h.ocupantes):[]);
      return `<tr><td>${_esfEsc(h.numero_hab||'—')}</td><td>${tipoLabel[h.tipo]||h.tipo}</td><td>${ocp.join('<br>')||'—'}</td></tr>`;
    }).join('')}</tbody></table></body></html>`;
    _descargarHTML(`rooming-${ev?.nombre||'evento'}${sufijoFile}.html`, html);
  } else {
    const headers = ['Habitación','Tipo','Ocupantes'];
    const rows = _ccHabitaciones.map(h => {
      const ocp = filtrarOcp(h.ocupantes?(typeof h.ocupantes==='string'?JSON.parse(h.ocupantes):h.ocupantes):[]);
      return [h.numero_hab||'',tipoLabel[h.tipo]||h.tipo,ocp.join(' | ')].map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',');
    });
    const csv = [headers.join(','),...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
    const sufijoFile = excluirStaff ? '-sin-staff' : '';
    a.download = `rooming-${ev?.nombre||'evento'}${sufijoFile}.csv`;
    a.click();
  }
}


// ── Descargar listas desde perfil del coordi ─────────────────
async function descargarListaViajeros(eventoId) {
  try {
    const [ev, viajeros] = await Promise.all([
      khEventosMeta.porSlug(eventoId).then(m=>m||{}), // [sec-eventos]
      khViajeros.listar(eventoId), // [sec-coordi]
    ]);
    if (!viajeros.length) { alert('No hay viajeros registrados para este evento'); return; }
    const titulo = `Viajeros — ${ev.nombre||'Evento'}`;
    const html = `<html><head><meta charset="utf-8"><title>${_esfEsc(titulo)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:4px}p{color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px 12px;font-size:13px}th{background:#f5f5f5}</style></head><body>
    <h2>${_esfEsc(titulo)}</h2><p>${ev.artista?_esfEsc(ev.artista)+' · ':''}${_esfEsc(ev.ciudad||'')} ${ev.fecha?'· '+new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'}):''}</p>
    <table><thead><tr><th>#</th><th>Nombre</th><th>Paquete</th><th>Zona</th><th>Talla</th><th>Celular</th><th>Emergencia</th><th>Notas</th></tr></thead>
    <tbody>${viajeros.map((v,i)=>`<tr><td>${i+1}</td><td><strong>${_esfEsc(v.nombre)}</strong></td><td>${_esfEsc(v.tipo_paquete||'—')}</td><td>${_esfEsc(v.zona_boleto||'—')}</td><td>${_esfEsc(v.talla_playera||'—')}</td><td>${_esfEsc(v.celular||'—')}</td><td>${_esfEsc(v.num_emergencia||'—')}</td><td>${_esfEsc(v.notas||'—')}</td></tr>`).join('')}</tbody>
    </table></body></html>`;
    _descargarHTML(`viajeros-${(ev.nombre||'evento').replace(/[^a-zA-Z0-9-_]+/g,'_')}.html`, html);
  } catch(e) { alert('Error: ' + e.message); }
}

async function descargarRoomingList(eventoId) {
  try {
    const [ev, habs] = await Promise.all([
      khEventosMeta.porSlug(eventoId).then(m=>m||{}), // [sec-eventos]
      khRooming.listar(eventoId), // [sec-sensibles]
    ]);
    if (!habs.length) { alert('No hay rooming list para este evento'); return; }
    const tipoLabels = {individual:'Individual',doble:'Doble',triple:'Triple',cuadruple:'Cuádruple'};
    const titulo = `Rooming List — ${ev.nombre||'Evento'}`;
    const html = `<html><head><meta charset="utf-8"><title>${_esfEsc(titulo)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:4px}p{color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px 12px;font-size:13px;vertical-align:top}th{background:#f5f5f5}</style></head><body>
    <h2>${_esfEsc(titulo)}</h2>
    <p>${_esfEsc(habs[0]?.hotel_nombre||'')}${habs[0]?.hotel_direccion?' · '+_esfEsc(habs[0].hotel_direccion):''}${habs[0]?.incluye_desayuno?' · ✓ Incluye desayuno':''}</p>
    <table><thead><tr><th>Habitación</th><th>Tipo</th><th>Ocupantes</th></tr></thead>
    <tbody>${habs.map((h,i)=>{
      const ocp = h.ocupantes?(typeof h.ocupantes==='string'?JSON.parse(h.ocupantes):h.ocupantes):[];
      return `<tr><td>Habitación ${i+1}</td><td>${tipoLabels[h.tipo]||h.tipo}</td><td>${ocp.join('<br>')||'—'}</td></tr>`;
    }).join('')}</tbody></table></body></html>`;
    _descargarHTML(`rooming-${(ev.nombre||'evento').replace(/[^a-zA-Z0-9-_]+/g,'_')}.html`, html);
  } catch(e) { alert('Error: ' + e.message); }
}


let _reportesFiltroActual = 'todos';

// ═══════════════════════════════════════════════════════════════
// SOLICITUDES PORTAL (Fase 2.2b)
// Vista admin de solicitudes_tour del Supabase NUEVO (conecta-portal).
// Las queries pasan por Netlify Functions con service_role — el frontend
// nunca ve la service key. Auth se valida lookup-de-usuario en cada call.
// ═══════════════════════════════════════════════════════════════
let _spCache = [];
let _spLoading = false;
// Acumulador de eventos vistos en cualquier carga (no se reduce al filtrar) —
// alimenta el dropdown de filtro de evento. Clave: evento_id, valor: evento_nombre.
let _spEventosVistos = new Map();
// Cache del plan de pagos por solicitud abierta en el modal de detalle.
// Clave: solicitud_id, valor: array de pagos. Lo llena cargarPlanPagosSP y lo
// re-renderiza renderPlanPagosSP tras marcar/revertir (Fase 2.3c).
let _spPlanCache = {};
// Lugares de cada solicitud (F3-t4b): para agrupar el plan por lugar y etiquetar.
let _spLugaresCache = {};
// Contexto del pago grupal en curso por solicitud: { monto, fecha, metodo, referencia, propuesta:[] }.
let _spGrupoCache = {};

// Headers para las 3 admin-* functions. Antes mandaba x-kh-user-id +
// x-kh-correo (validados con anon key contra usuarios). Tras Security Phase 2
// usa Authorization: Bearer <JWT> como las otras admin functions.
// Se conserva esta función porque hay 3 call sites con fetch + headers
// explícitos. (khAdminFetch sería más limpio pero requeriría refactor de
// los 3 sites.)
function _spAdminHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + (khGetJwt() || ''),
  };
}

function _spFmtMxn(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

function _spFmtFechaRel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1)  return 'Hace unos segundos';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24)   return `Hace ${h} h`;
  const dd = Math.round(h / 24);
  if (dd < 30)  return `Hace ${dd} d`;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function _spFmtFechaAbs(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Monterrey', dateStyle: 'medium', timeStyle: 'short' });
}

function _spEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _spBadgeEstado(estado) {
  const map = {
    pendiente:  { bg: '#fff3cd', fg: '#856404', label: 'Pendiente' },
    en_pagos:   { bg: '#d1ecf1', fg: '#0c5460', label: 'En pagos' },
    pagado:     { bg: '#d4edda', fg: '#155724', label: 'Pagado' },
    cancelado:  { bg: '#f8d7da', fg: '#721c24', label: 'Cancelado' },
  };
  const e = map[estado] || { bg: '#eee', fg: '#333', label: estado || '—' };
  return `<span style="display:inline-block;padding:3px 9px;border-radius:var(--r-btn,12px);background:${e.bg};color:${e.fg};font-size:11px;font-weight:700;letter-spacing:.04em">${e.label}</span>`;
}

function _spPoblarDropdownEventos() {
  // El portal guarda evento_id con el slug del sitio público (ev. "morat-dic-3#0"),
  // que NO coincide con los UUIDs de la tabla eventos de Kamehouse. Por eso el
  // dropdown se arma a partir de los evento_id/evento_nombre acumulados en
  // _spEventosVistos. Importante: el acumulador NUNCA se reduce — si la
  // armáramos solo desde _spCache, al filtrar por un evento desaparecerían los
  // demás del dropdown.
  const sel = document.getElementById('sp-filtro-evento');
  if (!sel) return;
  (_spCache || []).forEach(s => {
    if (s.evento_id && !_spEventosVistos.has(s.evento_id)) {
      _spEventosVistos.set(s.evento_id, s.evento_nombre || s.evento_id);
    }
  });
  const valorActual = sel.value;
  const opciones = Array.from(_spEventosVistos.entries())
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .map(([id, nombre]) => `<option value="${_spEscape(id)}">${_spEscape(nombre)}</option>`)
    .join('');
  sel.innerHTML = `<option value="">Todos</option>${opciones}`;
  // Conservar la selección actual aunque el filtro haya escondido el resto.
  if (valorActual && _spEventosVistos.has(valorActual)) sel.value = valorActual;
}

// [Bandeja-T2] Badge de pendientes en el nav. Pinta el número; 0 → sin badge.
// [E5-6] El badge vivía DENTRO del botón de menú `nav-solicitudes_portal`. Al
// salir esa entrada del menú, el contador se habría ido con ella en silencio —
// y es justo el dato que hace útil la puerta. Ahora vive en la pestaña "Por
// aprobar", que está duplicada en las dos páginas (cada una pinta su franja),
// así que se escriben las dos: la que se vea, ya está al día.
function _spPintarBadgePendientes(n) {
  const badges = ['sp-nav-badge', 'sp-nav-badge-pagos']
    .map(id => document.getElementById(id)).filter(Boolean);
  if (!badges.length) return;
  for (const b of badges) {
    if (n > 0) { b.textContent = n > 99 ? '99+' : String(n); b.style.display = 'flex'; }
    else { b.style.display = 'none'; }
  }
}

// [E5-6] La franja de pestañas obedece la MISMA fuente única que el menú. La
// pestaña de una pantalla que este usuario no puede ver NO se pinta: no se
// ofrece lo que daría 403 (decisión 1 de ETAPA 5, dicha en pestañas). El
// permiso `solicitudes_portal` no cambió — solo dejó de tener botón de menú.
function _pgSyncTabs(activa) {
  document.querySelectorAll('.pg-tabs .pg-tab-btn').forEach(b => {
    const tab = b.dataset.tab;
    // [COB-MIG-1b] EL PERMISO Y EL TOGGLE SON DOS COSAS DISTINTAS, y hasta hoy
    // compartían la misma llave. `data-tab` sirve para saber cuál pestaña está
    // activa; `data-permiso` dice de quién HEREDA el derecho a verse. Cuando no
    // hay `data-permiso`, se cae a `data-tab` — así los dos botones de siempre
    // se comportan byte a byte igual que antes.
    //
    // Sin esto, la CAJA de COB-MIG-1 fue INVISIBLE PARA TODOS en producción:
    // su `data-tab="caja"` no es un permiso de `PERMISOS_TABS`, así que
    // `_puedeVerTab` decía que no y esta línea la apagaba. El diseño decía "la
    // caja hereda el permiso de pagos" y el código no tenía cómo expresarlo.
    //
    // ⚠️ La alternativa —agregar 'caja' a PERMISOS_TABS— es justo lo que la
    // casa NO hace: sería un permiso nuevo para una pestaña que no es una
    // pantalla aparte, y habría que mantenerlo en los 3 roles para siempre.
    // Heredar no inventa listas.
    const permiso = b.dataset.permiso || tab;
    b.style.display = _puedeVerTab(permiso) ? '' : 'none';
    b.classList.toggle('active', tab === activa);
  });
}

// Cuenta las solicitudes PENDIENTES (independiente del filtro activo, para que el
// badge sea correcto aun viendo "Canceladas"). Reusa admin-solicitudes-list (sin
// tocar backend). Fails-soft: si truena (p.ej. rol sin permiso), no pinta ni rompe.
async function _spContarPendientes() {
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-solicitudes-list', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ estado: 'pendiente', limit: 500 }),
    });
    if (!r.ok) return;
    const data = await r.json();
    _spPintarBadgePendientes(Number(data.count) || 0);
  } catch (e) { /* fails-soft */ }
}

async function loadSolicitudesPortal() {
  _pgSyncTabs('solicitudes_portal');   // [E5-6] la franja de la puerta única
  if (_spLoading) return;
  _spLoading = true;
  _ccPagosCtx = false;   // [Pagos-T1] entrar a Solicitudes Portal = contexto SP autoritativo

  const tableEl = document.getElementById('sp-table');
  const contadoresEl = document.getElementById('sp-contadores');
  const btn = document.getElementById('sp-btn-refresh');
  if (btn) { btn.disabled = true; btn.textContent = '↻ Cargando…'; }
  if (tableEl) tableEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--ts);font-family:\'JetBrains Mono\',monospace;font-size:11px">// cargando solicitudes…</div>';

  const payload = {
    estado: document.getElementById('sp-filtro-estado').value || undefined,
    evento_id: document.getElementById('sp-filtro-evento').value || undefined,
    desde: _spDateToIso(document.getElementById('sp-filtro-desde').value, false),
    hasta: _spDateToIso(document.getElementById('sp-filtro-hasta').value, true),
  };

  try {
    const r = await khAdminFetch('/.netlify/functions/admin-solicitudes-list', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error cargando solicitudes');
    _spCache = data.solicitudes || [];
    _spPoblarDropdownEventos();
    if (contadoresEl) {
      const c = data.contadores || {};
      // [Bandeja-T2] Solo pendiente + cancelado (en_pagos/pagado viven en Capsule → Pagos).
      contadoresEl.innerHTML = [
        `<span style="color:#e8a800">⏳ ${c.pendiente || 0} pendiente${(c.pendiente||0)===1?'':'s'}</span>`,
        `<span style="color:#FF6B6B">✕ ${c.cancelado || 0} cancelada${(c.cancelado||0)===1?'':'s'}</span>`,
        `<span style="margin-left:auto">// ${data.count} mostradas</span>`,
      ].join('');
    }
    renderSolicitudesPortal();
    _spContarPendientes();   // [Bandeja-T2] refresca el badge del nav (incl. tras aprobar/rechazar)
  } catch (e) {
    if (tableEl) tableEl.innerHTML = `<div style="padding:24px;text-align:center;color:#FF6B6B">Error: ${_spEscape(e.message)}</div>`;
    showToast('No se pudieron cargar las solicitudes: ' + e.message, 'error');
  } finally {
    _spLoading = false;
    if (btn) { btn.disabled = false; btn.textContent = '↻ Refrescar'; }
  }
}

function _spDateToIso(yyyyMmDd, endOfDay) {
  if (!yyyyMmDd) return undefined;
  // El input <input type="date"> ya viene en formato YYYY-MM-DD. Lo
  // convertimos a ISO en UTC con offset de México para evitar que un día
  // se pierda en el borde de medianoche.
  const t = endOfDay ? 'T23:59:59' : 'T00:00:00';
  return `${yyyyMmDd}${t}-06:00`;
}

// ═══════════════════════════════════════════════════════════════════════════
// [C2-3] LA ETIQUETA DE LA COLA
//
// Espeja etiquetaHold() del backend (_lib/disponibilidad), que es la fuente de
// verdad. Se re-implementa aquí porque el Palacio no importa módulos de Node —
// y por eso el arnés compara las DOS contra la misma tabla de casos: si alguien
// mueve una regla, la comparación truena.
//
// El reloj se DERIVA al pintar. Nadie muta la fila (regla de Fase B).
// ═══════════════════════════════════════════════════════════════════════════
// [C2-8] Mismo número que OXXO_SIN_HOLD_MS del backend. Si uno se mueve y el
// otro no, la cola y el servidor dejan de contar la misma historia.
const C2_OXXO_SIN_HOLD_MS = 48 * 60 * 60 * 1000;

const _C2_ETIQUETAS = {
  separo_pagado:   { txt: 'PAGADA ✓',        cls: 'green' },
  con_comprobante: { txt: 'CON COMPROBANTE', cls: 'blue'  },
  oxxo_pendiente:  { txt: 'OXXO PENDIENTE',  cls: 'gold'  },
  separado:        { txt: 'APARTADA',        cls: 'gold'  },
  vencida:         { txt: 'VENCIDA',         cls: 'red'   },
};

function _c2Etiqueta(s, nowMs) {
  const ahora = Number.isFinite(nowMs) ? nowMs : Date.now();
  if (!s || s.estado !== 'pendiente') return null;
  if (s.separo_pagado_at) return { k: 'separo_pagado', resta: null };
  const comp = s.comprobante_separo_url;
  if (comp != null && String(comp).trim() !== '') return { k: 'con_comprobante', resta: null };
  const h = s.hold_expira_at;
  const sinHold = (h == null || String(h).trim() === '' || !Number.isFinite(Date.parse(h)));
  if (sinHold) {
    // [C2-8] ESPEJO de etiquetaHold: una ficha de OXXO sin candado real se
    // anuncia SIN RELOJ hasta 48 h después de nacer. Sin esto, el cliente que
    // tiene su voucher en la mano no aparecía en la cola. Si esta regla cambia
    // aquí, cambia TAMBIÉN en _lib/disponibilidad — el arnés compara las dos
    // contra la misma tabla de casos y truena si se separan.
    const esOxxoSH = String(s.metodo_separo || '').toLowerCase() === 'oxxo';
    if (esOxxoSH) {
      const nac = Date.parse(s.created_at || '');
      if (Number.isFinite(nac) && (ahora - nac) < C2_OXXO_SIN_HOLD_MS) {
        return { k: 'oxxo_pendiente', resta: null };
      }
    }
    return null;                                              // fila vieja: sin etiqueta
  }
  const t = Date.parse(h);
  const resta = t - ahora;
  if (resta <= 0) return { k: 'vencida', resta: 0 };
  const esOxxo = String(s.metodo_separo || '').toLowerCase() === 'oxxo';
  return { k: esOxxo ? 'oxxo_pendiente' : 'separado', resta };
}

// "14:59" para el reloj corto · "22 h" para la ficha de OXXO. El semáforo
// distingue los dos: un apartado de 15 minutos y una ficha de 24 horas no se
// leen igual aunque los dos ocupen el lugar.
function _c2Reloj(restaMs) {
  if (restaMs == null) return '';
  if (restaMs <= 0) return '00:00';
  if (restaMs >= 3600e3) {
    const h = Math.floor(restaMs / 3600e3);
    return h + ' h';
  }
  const m = Math.floor(restaMs / 60000), sg = Math.floor((restaMs % 60000) / 1000);
  return m + ':' + String(sg).padStart(2, '0');
}

function _c2ChipHtml(s, nowMs) {
  const e = _c2Etiqueta(s, nowMs);
  if (!e) return '';
  const def = _C2_ETIQUETAS[e.k];
  const reloj = (e.k === 'oxxo_pendiente' || e.k === 'separado') ? _c2Reloj(e.resta) : '';
  return '<span class="k-tag ' + def.cls + '" title="' + _salEsc(e.k) + '">' + _salEsc(def.txt)
       + (reloj ? ' · ' + _salEsc(reloj) : '') + '</span>';
}

// [C2-5] EL DINERO, DICHO ANTES DE DECIDIR.
//
// Memo aceptó una solicitud con el separo YA PAGADO por OXXO y la pantalla no
// se lo dijo en ningún lado: la fila decía "Pendiente", la columna del clip
// decía "—" y el modal decía "Sin comprobante subido por el cliente". Aceptó
// por contexto, no porque la pantalla se lo enseñara. Con la bandeja llena eso
// es una decisión de dinero tomada a ciegas.
//
// El MONTO que se muestra es el SEPARO de la fila, no lo que se cobró en la
// tarjeta: el cargo de servicio vive en stripe_checkout_sesiones y esta pantalla
// no lo baja. Se dice cuál es cuál en vez de mostrar una cifra ambigua — un
// número de dinero sin apellido es peor que ninguno.
function _c2SeparoPagadoHtml(s) {
  if (!s || !s.separo_pagado_at) return '';
  const metodo = String(s.metodo_separo || '').toLowerCase() === 'oxxo' ? 'OXXO' : 'tarjeta';
  const cuando = (typeof _spFmtFechaAbs === 'function') ? _spFmtFechaAbs(s.separo_pagado_at) : '';
  const aplicado = s.separo_aplicado_pago_id
    ? 'Ya está aplicado a la cuota 1.'
    : 'Todavía NO se aplica: se aplica solo cuando aceptes.';
  return '<div class="alert alert-success" style="margin:0 0 10px;font-size:12px;line-height:1.5">'
    + '<b>Separo de ' + _salEsc(_spFmtMxn(s.monto_separo)) + ' pagado por ' + _salEsc(metodo) + ' ✓</b>'
    + (cuando ? ' — ' + _salEsc(cuando) : '')
    + '<br>' + _salEsc(aplicado)
    + ' El cargo por usar ' + _salEsc(metodo) + ' lo cobró la pasarela aparte; no es dinero del viaje.'
    + '</div>';
}

function renderSolicitudesPortal() {
  const tableEl = document.getElementById('sp-table');
  if (!tableEl) return;
  const q = (document.getElementById('sp-q').value || '').trim().toLowerCase();
  let rows = _spCache;
  if (q.length >= 2) {
    rows = rows.filter(s => {
      const c = s.clientes || {};
      return (c.nombre_completo || '').toLowerCase().includes(q)
          || (c.correo || '').toLowerCase().includes(q)
          || (s.evento_nombre || '').toLowerCase().includes(q)
          || String(c.numero_cliente || '').includes(q);
    });
  }

  if (!rows.length) {
    tableEl.innerHTML = '<div class="empty-state"><div class="empty-icon">·</div>Sin solicitudes que coincidan con los filtros</div>';
    return;
  }

  const head = `
    <thead>
      <tr style="background:var(--bg3);text-align:left">
        <th style="padding:10px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts);white-space:nowrap">Fecha</th>
        <th style="padding:10px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts);white-space:nowrap">#Cliente</th>
        <th style="padding:10px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts)">Cliente</th>
        <th style="padding:10px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts)">Evento</th>
        <th style="padding:10px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts)">Paquete</th>
        <th style="padding:10px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts)">Zona</th>
        <th style="padding:10px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts);text-align:right">Separo</th>
        <th style="padding:10px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts);text-align:right">Total</th>
        <th style="padding:10px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts)">Estado</th>
        <th style="padding:10px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts);text-align:center"><svg class="ic"><use href="#ic-clip"/></svg></th>
        <th style="padding:10px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ts)"></th>
      </tr>
    </thead>`;

  const body = rows.map(s => {
    const c = s.clientes || {};
    const tieneComprob = !!s.comprobante_separo_url;
    return `
      <tr style="border-top:1px solid var(--border)">
        <td style="padding:10px 8px;font-size:12px;color:var(--ts);white-space:nowrap" title="${_spEscape(_spFmtFechaAbs(s.created_at))}">${_spEscape(_spFmtFechaRel(s.created_at))}</td>
        <td style="padding:10px 8px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--orange);white-space:nowrap">#${_spEscape(c.numero_cliente || '—')}</td>
        <td style="padding:10px 8px;font-size:13px">${_spEscape(c.nombre_completo || '—')}<br><span style="color:var(--ts);font-size:11px">${_spEscape(c.correo || '')}</span></td>
        <td style="padding:10px 8px;font-size:13px">${_spEscape(s.evento_nombre || '')}</td>
        <td style="padding:10px 8px;font-size:13px"><b>${_spEscape(s.paquete || '')}</b></td>
        <td style="padding:10px 8px;font-size:12px">${_spEscape(s.zona || '')}</td>
        <td style="padding:10px 8px;font-size:12px;text-align:right;white-space:nowrap">${_spFmtMxn(s.monto_separo)}</td>
        <td style="padding:10px 8px;font-size:12px;text-align:right;white-space:nowrap"><b>${_spFmtMxn(s.precio_total)}</b></td>
        <td style="padding:10px 8px;white-space:nowrap">${_spBadgeEstado(s.estado)}${_c2ChipHtml(s) ? ' ' + _c2ChipHtml(s) : ''}</td>
        <td style="padding:10px 8px;text-align:center;font-size:14px">${tieneComprob ? '<svg class="ic"><use href="#ic-clip"/></svg>' : '<span style="color:var(--ts)">—</span>'}</td>
        <td style="padding:10px 8px;text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="verSolicitudPortal('${_spEscape(s.id)}')" style="font-size:11px">Ver detalles</button></td>
      </tr>`;
  }).join('');

  tableEl.innerHTML = `<table style="width:100%;border-collapse:collapse">${head}<tbody>${body}</tbody></table>`;
}

async function verSolicitudPortal(id) {
  const s = _spCache.find(x => x.id === id);
  if (!s) { showToast('Solicitud no encontrada en cache, refresca la lista', 'error'); return; }
  const c = s.clientes || {};

  // [C2-5] El título se sigue ESCAPANDO (regla de CAP5-1): por eso el encabezado
  // de la zona de peligro mostraba su <svg> como texto literal. En vez de dejar
  // pasar HTML libre —que sería abrir la puerta que CAP5-1 cerró— el icono va
  // por su propio parámetro, contra una lista de iconos conocidos.
  const ICONOS_OK = { alerta: '#ic-alerta' };
  const seccion = (titulo, html, icono) => `
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--orange);text-transform:uppercase;margin-bottom:10px">// ${ICONOS_OK[icono] ? '<svg class="ic"><use href="' + ICONOS_OK[icono] + '"/></svg> ' : ''}${_esfEsc(titulo)}</div>
      ${html}
    </div>`;

  const row = (k, v) => `<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;padding:4px 0;font-size:13px"><div style="color:var(--ts);font-size:11px;text-transform:uppercase;letter-spacing:.08em">${_spEscape(k)}</div><div>${v == null || v === '' ? '<span style="color:var(--ts)">—</span>' : v}</div></div>`;

  const contenido = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      ${_spBadgeEstado(s.estado)}${_c2ChipHtml(s)}
      <button class="btn btn-primary btn-sm" onclick="abrirCambiarEstadoSP('${_spEscape(s.id)}')" style="font-size:11px">Cambiar estado</button>
      <span style="margin-left:auto;color:var(--ts);font-size:11px;font-family:'JetBrains Mono',monospace">${_spEscape(_spFmtFechaAbs(s.created_at))}</span>
    </div>

    ${seccion('Cliente', `
      ${row('Nombre', _spEscape(c.nombre_completo))}
      ${row('# Cliente', `<span style="font-family:'JetBrains Mono',monospace;color:var(--orange)">#${_spEscape(c.numero_cliente || '—')}</span>`)}
      ${row('Correo', _spEscape(c.correo))}
      ${row('Celular', _spEscape(c.celular))}
      ${row('Talla playera', _spEscape(c.talla_playera))}
      ${row('Contacto emergencia', `${_spEscape(c.contacto_emergencia_nombre || '')} · ${_spEscape(c.contacto_emergencia_telefono || '')}${c.contacto_emergencia_relacion ? ' · ' + _spEscape(c.contacto_emergencia_relacion) : ''}`)}
    `)}

    ${seccion('Tour', `
      ${row('Evento', _spEscape(s.evento_nombre))}
      ${row('Evento ID', `<span style="font-family:'JetBrains Mono',monospace;color:var(--ts);font-size:11px">${_spEscape(s.evento_id)}</span>`)}
      ${row('Paquete', `<b>${_spEscape(s.paquete)}</b>`)}
      ${row('Zona', _spEscape(s.zona))}
      ${row('Personas', String(s.num_personas))}
      ${s.tipo_habitacion ? row('Habitación', _spEscape(s.tipo_habitacion)) : ''}
      ${s.lleva_vuelo ? row('Vuelo propio', s.codigo_vuelo ? _spEscape(s.codigo_vuelo) : 'Sí (sin código)') : ''}
      ${s.codigo_descuento ? row('Código descuento', _spEscape(s.codigo_descuento)) : ''}
      ${s.notas_cliente ? row('Notas del cliente', `<i>${_spEscape(s.notas_cliente)}</i>`) : ''}
    `)}

    ${seccion('Dinero', `
      ${row('Precio total', `<b>${_spFmtMxn(s.precio_total)}</b>`)}
      ${row('Monto separo', `<b style="color:var(--orange)">${_spFmtMxn(s.monto_separo)}</b>`)}
      ${row('Estado actual', _spBadgeEstado(s.estado))}
      ${s.notas_admin ? row('Notas admin', `<i style="color:var(--ts)">${_spEscape(s.notas_admin)}</i>`) : ''}
    `)}

    ${seccion('Plan de pagos', `
      <div id="sp-plan-${_spEscape(s.id)}" style="font-size:13px;color:var(--ts)">Cargando plan…</div>
    `)}

    ${seccion('Comprobante de separo', `
      ${_c2SeparoPagadoHtml(s)}
      <div id="sp-comprobante-${_spEscape(s.id)}" style="font-size:13px;color:var(--ts)">
        ${s.comprobante_separo_url
          ? 'Cargando vista previa…'
          : (s.separo_pagado_at
            ? '<span style="color:var(--ts)">Pagó en línea: no hay comprobante que subir.</span>'
            : '<span style="color:var(--ts)">Sin comprobante subido por el cliente</span>')}
      </div>
    `)}

    ${seccion('Zona de peligro', `
      <div style="font-size:12px;color:var(--ts);margin-bottom:10px;line-height:1.5">Resetea o elimina a <b style="color:var(--ink)">${_spEscape(c.nombre_completo || '—')}</b> del Portal para que pueda empezar de cero (borra tours, pagos, comprobantes y foto).</div>
      <button class="btn btn-red btn-sm" onclick="abrirResetCliente('${_spEscape(s.cliente_id)}')" style="font-size:11px">Resetear / Eliminar cliente</button>
    `, 'alerta')}
  `;

  crearModal('sp-detalle', `Solicitud · ${s.evento_nombre || ''}`, contenido);
  document.getElementById('modal-sp-detalle').querySelector('.modal').style.maxWidth = '720px';

  cargarPlanPagosSP(s.id, s.estado, s.paquete);

  if (s.comprobante_separo_url) {
    cargarComprobanteSP(s.id);
  }
}

// ── Resetear / Eliminar cliente del Portal (herramienta admin destructiva) ──
// Candado: confirmación por nombre + modo. 'total' (borra la cuenta) solo lo ve
// maestro_roshi. El servidor revalida rol + confirmación (no confiamos en el front).
function abrirResetCliente(clienteId) {
  const sols = (_spCache || []).filter(x => x.cliente_id === clienteId);
  const c = (sols[0] && sols[0].clientes) || {};
  const nombre = c.nombre_completo || '';
  const numero = c.numero_cliente || '—';
  const nSol = sols.length;
  const esRoshi = currentUser && currentUser.rol === 'maestro_roshi';

  const modoTotal = esRoshi ? `
      <label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid rgba(255,40,59,.4);border-radius:var(--r-sm,8px);cursor:pointer;background:rgba(255,40,59,.05)">
        <input type="radio" name="rc-modo" value="total" onchange="_rcSync()" style="margin-top:3px">
        <div><div style="font-weight:600;color:var(--red)">Eliminar TODO (borra la cuenta)</div><div style="font-size:11px;color:var(--ts)">Borra también su usuario de acceso. <b style="color:var(--red)">IRREVERSIBLE.</b></div></div>
      </label>` : '';

  const contenido = `
    <div style="font-size:13px;margin-bottom:14px">Cliente <b>${_spEscape(nombre || '—')}</b> · <span style="font-family:'JetBrains Mono',monospace;color:var(--orange)">#${_spEscape(numero)}</span></div>
    <div style="font-size:12px;color:var(--ts);margin-bottom:14px;line-height:1.5">Se borrarán <b style="color:var(--ink)">${nSol}</b> solicitud${nSol === 1 ? '' : 'es'} (con sus pagos), sus comprobantes y su foto de perfil.</div>

    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
      <label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-sm,8px);cursor:pointer">
        <input type="radio" name="rc-modo" value="reset" checked onchange="_rcSync()" style="margin-top:3px">
        <div><div style="font-weight:600">Resetear (conserva la cuenta)</div><div style="font-size:11px;color:var(--ts)">Vacía tours/pagos/comprobantes/foto. El cliente conserva su login y empieza de cero.</div></div>
      </label>
      ${modoTotal}
    </div>

    <div id="rc-confirm-wrap" style="display:none;margin-bottom:14px">
      <div style="font-size:12px;color:var(--red);font-weight:600;margin-bottom:6px">Para confirmar el borrado TOTAL, escribe el nombre exacto del cliente:</div>
      <input id="rc-nombre-input" type="text" oninput="_rcSync()" placeholder="${_spEscape(nombre)}" style="width:100%;padding:9px 11px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--ink);font-size:13px">
    </div>

    <div id="rc-alert" style="margin-bottom:10px"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="cerrarModal('rc')">Cancelar</button>
      <button class="btn btn-red btn-sm" id="rc-confirm-btn" onclick="ejecutarResetCliente('${_spEscape(clienteId)}')">Ejecutar</button>
    </div>`;

  crearModal('rc', 'Resetear / Eliminar cliente', contenido);
  // Guardar el nombre esperado para la validación del front (el server revalida igual).
  window._rcNombre = nombre;
  _rcSync();
}

// Habilita/deshabilita el botón según modo + (para 'total') el nombre escrito.
function _rcSync() {
  const modo = (document.querySelector('input[name="rc-modo"]:checked') || {}).value || 'reset';
  const wrap = document.getElementById('rc-confirm-wrap');
  const btn = document.getElementById('rc-confirm-btn');
  if (wrap) wrap.style.display = modo === 'total' ? 'block' : 'none';
  if (!btn) return;
  if (modo === 'total') {
    const val = (document.getElementById('rc-nombre-input') || {}).value || '';
    btn.disabled = val.trim() !== String(window._rcNombre || '').trim();
    btn.textContent = 'Eliminar TODO';
  } else {
    btn.disabled = false;
    btn.textContent = 'Resetear cliente';
  }
}

async function ejecutarResetCliente(clienteId) {
  const modo = (document.querySelector('input[name="rc-modo"]:checked') || {}).value || 'reset';
  const alertEl = document.getElementById('rc-alert');
  // confirmacion: para 'total' lo que escribió; para 'reset' el nombre conocido (el server revalida).
  const confirmacion = modo === 'total'
    ? ((document.getElementById('rc-nombre-input') || {}).value || '').trim()
    : String(window._rcNombre || '').trim();
  const btn = document.getElementById('rc-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Ejecutando…'; }
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-portal-cliente-reset', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ cliente_id: clienteId, modo, confirmacion }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('Error ' + r.status));
    cerrarModal('rc'); // [fix-404] crearModal usa cerrarModal (closeModal pide id completo y truena con null)
    cerrarModal('sp-detalle');
    const msg = modo === 'total'
      ? `Cliente eliminado (${data.solicitudes_borradas} solicitud(es), cuenta ${data.auth_user_borrado ? 'borrada' : 'no encontrada'}).`
      : `Cliente reseteado (${data.solicitudes_borradas} solicitud(es) y sus pagos borrados).`;
    showToast(msg, 'success');
    _spRefrescarLista();
  } catch (e) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error" style="font-size:12px">${_spEscape(e.message)}</div>`;
    if (btn) { btn.disabled = false; _rcSync(); }
  }
}

async function cargarComprobanteSP(solicitudId) {
  const target = document.getElementById(`sp-comprobante-${solicitudId}`);
  if (!target) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-solicitud-comprobante', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ solicitud_id: solicitudId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo obtener el comprobante');
    const isPdf = data.content_type === 'application/pdf';
    const safeUrl = data.signed_url;
    target.innerHTML = `
      <div style="margin-bottom:8px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ts);letter-spacing:.08em">// firma válida 1 hora — ${_spEscape(data.path)}</div>
      ${isPdf
        ? `<iframe src="${_spEscape(safeUrl)}" style="width:100%;height:480px;border:1px solid var(--border);border-radius:var(--r-sm,8px)"></iframe>`
        : `<a href="${_spEscape(safeUrl)}" target="_blank" rel="noopener"><img src="${_spEscape(safeUrl)}" style="max-width:100%;max-height:480px;border:1px solid var(--border);border-radius:var(--r-sm,8px)" alt="Comprobante"></a>`}
      <div style="margin-top:10px;display:flex;gap:8px">
        <a href="${_spEscape(safeUrl)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="font-size:11px">↗ Abrir en pestaña nueva</a>
        <a href="${_spEscape(safeUrl)}" download class="btn btn-primary btn-sm" style="font-size:11px">↓ Descargar</a>
      </div>
    `;
  } catch (e) {
    target.innerHTML = `<span style="color:#FF6B6B">Error: ${_spEscape(e.message)}</span>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// PLAN DE PAGOS (Fase 2.3c) — marcar / revertir pagos desde Kamehouse
//
// Carga diferida del plan dentro del modal de detalle (mismo patrón que
// cargarComprobanteSP, vía admin-pagos-list). Por cada pago: "Marcar pagado"
// (mini-form con fecha/método/referencia → admin-marcar-pago accion 'pagar') o
// "Revertir" (accion 'revertir'). El backend reconcilia el estado de la
// solicitud (todos pagados → 'pagado'; revertir uno → 'en_pagos'). El cliente
// ve el abono en portal.html en cuanto un pago pasa a 'pagado'.
// ═══════════════════════════════════════════════════════════════

// `metodo` = CÓMO pagó (forma de pago). Ya no mezcla bancos. Los valores viejos
// (bbva/hey/otro) siguen mapeados para mostrar pagos antiguos, pero el <select>
// solo ofrece los 3 nuevos (ver _SP_METODOS_UI).
const _SP_METODO_LBL = { transferencia:'Transferencia', deposito:'Depósito', efectivo:'Efectivo', bbva:'BBVA', hey:'Banamex', otro:'Otro' };
const _SP_METODOS_UI = ['transferencia','deposito','efectivo'];

// `cuenta`/banco = a qué cuenta ENTRÓ el dinero (visor de saldos), DISTINTO de
// método. El selector de BANCO solo ofrece BBVA/Banamex y solo aparece cuando el
// método es Transferencia o Depósito; con Efectivo la cuenta es 'Efectivo'.
const _SP_BANCOS = ['BBVA','Banamex'];
// Paquete de cada solicitud, para el default de cuenta. Lo llena cargarPlanPagosSP
// (el refresh tras marcar/revertir no trae el paquete, así que lo lee de aquí).
let _spPaqueteCache = {};
function _spCuentaDefault(paquete) {
  return String(paquete || '').toUpperCase() === 'CHEAP' ? 'Banamex' : 'BBVA';
}

// Badge de estado de un pago. Reusa _spBadgeEstado, agregando 'vencido' (que la
// tabla pagos permite pero la solicitud no).
function _spBadgePago(estado) {
  if (estado === 'vencido') {
    return `<span style="display:inline-block;padding:3px 9px;border-radius:var(--r-btn,12px);background:#f8d7da;color:#721c24;font-size:11px;font-weight:700;letter-spacing:.04em">Vencido</span>`;
  }
  return _spBadgeEstado(estado);
}

// Carga diferida del plan (lazy load, igual que cargarComprobanteSP).
async function cargarPlanPagosSP(solicitudId, estadoSolicitud, paquete) {
  const target = document.getElementById('sp-plan-' + solicitudId);
  if (!target) return;
  // El paquete solo llega al abrir el modal; el refresh tras marcar/revertir no
  // lo pasa, así que lo cacheamos para el default de cuenta.
  if (paquete != null) _spPaqueteCache[solicitudId] = paquete;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-pagos-list', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ solicitud_id: solicitudId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo obtener el plan de pagos');
    _spPlanCache[solicitudId] = Array.isArray(data.pagos) ? data.pagos : [];
    _spLugaresCache[solicitudId] = Array.isArray(data.lugares) ? data.lugares : [];
    renderPlanPagosSP(solicitudId, estadoSolicitud);
  } catch (e) {
    target.innerHTML = `<span style="color:#FF6B6B">Error: ${_spEscape(e.message)}</span>`;
  }
}

function renderPlanPagosSP(solicitudId, estadoSolicitud) {
  const target = document.getElementById('sp-plan-' + solicitudId);
  if (!target) return;
  const pagos = _spPlanCache[solicitudId] || [];
  if (!pagos.length) {
    if (estadoSolicitud === 'pendiente') {
      target.innerHTML = `<span style="color:var(--ts)">Aún sin plan — aprueba la solicitud (cambia el estado a “En pagos”) para generarlo.</span>`;
      return;
    }
    // 'en_pagos'/'pagado' pueden quedar SIN plan si la generación falló al aprobar
    // (piloto) → botón de recuperación. 'cancelado' u otros estados → solo el
    // mensaje (el plan nace al aprobar, no aquí).
    const solSafe = _spEscape(solicitudId);
    const puedeRecuperar = estadoSolicitud === 'en_pagos' || estadoSolicitud === 'pagado';
    target.innerHTML = `<span style="color:var(--ts)">Sin plan de pagos para esta solicitud.</span>`
      + (puedeRecuperar
        ? `<div style="margin-top:10px"><button id="sp-gen-plan-btn-${solSafe}" class="btn btn-primary btn-sm" style="font-size:11px" onclick="_spGenerarPlanRecuperacion('${solSafe}','${_spEscape(estadoSolicitud)}')"><svg class="ic"><use href="#ic-engrane"/></svg> Generar plan de pagos</button></div>`
        : '');
    return;
  }

  const total   = pagos.reduce((a, p) => a + Number(p.monto || 0), 0);
  // Abonado = monto REAL pagado: COALESCE(monto_pagado, monto), igual que en
  // admin-cobranza-list y el portal del cliente (Fase 3.2). El plan ya trae
  // monto_pagado (admin-pagos-list usa select=*); NULL = monto del plan.
  const abonado = pagos.filter(p => p.estado === 'pagado').reduce((a, p) => a + (Number(p.monto_pagado ?? p.monto) || 0), 0);
  const restante = total - abonado;

  const resumen = `
    <div style="display:flex;gap:22px;flex-wrap:wrap;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px);margin-bottom:12px">
      <div><div style="color:var(--ts);text-transform:uppercase;letter-spacing:.08em;font-size:10px">Total</div><b style="font-size:14px">${_spFmtMxn(total)}</b></div>
      <div><div style="color:var(--ts);text-transform:uppercase;letter-spacing:.08em;font-size:10px">Abonado</div><b style="font-size:14px;color:#3DDC84">${_spFmtMxn(abonado)}</b></div>
      <div><div style="color:var(--ts);text-transform:uppercase;letter-spacing:.08em;font-size:10px">Restante</div><b style="font-size:14px;color:var(--orange)">${_spFmtMxn(restante)}</b></div>
    </div>`;

  // Plan POR LUGAR (#229): si alguna cuota trae lugar_id, se agrupa por lugar y
  // se ofrece el pago grupal. Planes grupales viejos (lugar_id null) → render
  // EXACTO de siempre (lista plana, sin encabezados).
  const porLugar = pagos.some(p => p.lugar_id != null);
  const cuerpo = porLugar
    ? _spRenderPlanPorLugar(solicitudId, pagos)
    : `<div style="display:flex;flex-direction:column;gap:8px">${pagos.map(p => _spRenderFilaPago(solicitudId, p)).join('')}</div>`;
  target.innerHTML = resumen + cuerpo;

  // Bitácora de movimientos (pagos_auditoria) — colapsable, lazy-load.
  target.innerHTML += `
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">
      <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="toggleBitacoraSP('${_spEscape(solicitudId)}')">Ver movimientos ▾</button>
      <div id="sp-audit-${_spEscape(solicitudId)}" style="display:none;margin-top:10px"></div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// [T4] "¿YA MANDÓ SU SEPARO?" — paso opcional justo después de aprobar
//
// El flujo real: el cliente paga por transferencia y manda su ticket ANTES de
// que Memo apruebe. Antes de esta tuerca, aprobar no preguntaba nada y había que
// irse a Pagos a buscar al cliente para marcar el primer abono.
//
// UNA FILA POR LUGAR (decisión de Memo): el plan sale POR LUGAR, así que un
// grupo de 3 tiene TRES cuotas 1, cada una con su monto. Se listan con casilla y
// se marcan solo las palomeadas — así aguanta que solo 2 de 4 hayan mandado su
// separo, y jamás reparte dinero por su cuenta.
//
// MAQUINARIA REUSADA, NO IMITADA: cada lugar se marca con admin-marcar-pago, el
// MISMO endpoint del botón de Pagos, que ya trae la bitácora pagos_auditoria, la
// reconciliación con tolerancia de $1, la exclusión de bajas, el correo
// fail-soft, el modo prueba y validarMonto (el tope de cordura del monto ya vive
// dentro; aquí no se valida aparte).
//
// Por qué NO admin-aplicar-pago-grupo, que parecería el reuso obvio: ese modo
// 'aplicar' es atómico pero NO acepta monto editable ("sin partials") ni cuenta,
// y las dos cosas se piden aquí. El precio de usar marcar-pago es que N llamadas
// no son atómicas — de ahí que el resultado diga lugar por lugar qué sí quedó y
// qué no, en vez de un "listo" que mienta.
// ═══════════════════════════════════════════════════════════════

// Lo que el paso está preguntando ahora mismo: { solicitudId, separos }.
let _spSeparoPend = null;

// Devuelve true si abrió el paso (y entonces él cierra/refresca), false si no
// había nada que preguntar y el caller sigue con su camino de siempre.
async function _spAbrirSeparoAlAceptar(solicitudId, s) {
  // [C2-3] Si el separo YA lo pagó el cliente por Stripe, no hay nada que
  // preguntar: se aplica solo, por la vía auditada, y el paso solo INFORMA.
  // Preguntarle a Memo "¿ya mandó su separo?" sobre un pago que el sistema
  // confirmó sería hacerle dudar de su propio sistema.
  if (s && s.separo_pagado_at) {
    try {
      const r = await khAdminFetch('/.netlify/functions/admin-separo-aplicar', {
        method: 'POST', headers: _spAdminHeaders(),
        body: JSON.stringify({ solicitud_id: solicitudId }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ya_aplicado) {
        showToast('El separo pagado ya estaba aplicado a la cuota 1 ✓', 'success');
      } else if (r.ok && d.aplicado) {
        const metodo = String(d.metodo || '').replace('stripe_', '');
        showToast('Separo pagado por ' + (metodo === 'oxxo' ? 'OXXO' : 'tarjeta') + ' ✓ — aplicado a la cuota 1', 'success');
      } else if (!r.ok) {
        showToast('El separo está pagado pero no se pudo aplicar: ' + (d.error || r.status), 'error');
      }
    } catch (e) {
      showToast('El separo está pagado pero no se pudo aplicar: ' + e.message, 'error');
    }
    return false;   // NO se abre el paso de preguntar: ya está resuelto
  }

  let pagos = [], lugares = [];
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-pagos-list', {
      method: 'POST', headers: _spAdminHeaders(),
      body: JSON.stringify({ solicitud_id: solicitudId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'no se pudo leer el plan');
    pagos = Array.isArray(data.pagos) ? data.pagos : [];
    lugares = Array.isArray(data.lugares) ? data.lugares : [];
  } catch (e) {
    // Sin plan a la vista no hay nada que preguntar: se sigue como hoy.
    console.warn('[T4] no se pudo leer el plan para el paso de separo:', e.message);
    return false;
  }
  // Cachés que el resto del módulo ya usa (así el modal de detalle no re-pide).
  _spPlanCache[solicitudId] = pagos;
  _spLugaresCache[solicitudId] = lugares;
  if (s && s.paquete != null) _spPaqueteCache[solicitudId] = s.paquete;

  // La cuota 1 de cada lugar, solo las que siguen pendientes.
  const separos = pagos
    .filter(p => Number(p.numero_pago) === 1 && p.estado === 'pendiente')
    .sort((a, b) => {
      const na = _spNumLugar(solicitudId, a.lugar_id), nb = _spNumLugar(solicitudId, b.lugar_id);
      return na - nb;
    });
  if (!separos.length) return false;   // ya pagados o plan sin cuota 1 → nada que preguntar

  _spSeparoPend = { solicitudId, separos };
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  const bancoDefault = _spCuentaDefault(_spPaqueteCache[solicitudId]);
  const filas = separos.map((p, i) => {
    const etiqueta = _spEtiquetaLugar(solicitudId, p.lugar_id);
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;cursor:pointer">
        <input type="checkbox" id="t4-chk-${i}" checked style="width:auto;margin:0">
        <span style="flex:1;min-width:0;font-size:13px">${_spEscape(etiqueta)}</span>
        <span style="color:var(--ts);font-size:11px">$</span>
        <input type="number" id="t4-monto-${i}" value="${Number(p.monto || 0)}" min="0" step="1"
               style="width:110px;padding:6px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--tp);font-size:13px;text-align:right">
      </label>`;
  }).join('');

  const contenido = `
    <div style="font-size:12px;color:var(--ts);line-height:1.6;margin-bottom:12px">
      La solicitud <b style="color:var(--tp)">ya quedó aprobada</b>. Si el cliente ya mandó su comprobante, marca aquí su separo y te ahorras la vuelta a Pagos.
      ${separos.length > 1 ? '<br>Palomea solo los lugares cuyo separo ya llegó.' : ''}
    </div>
    ${filas}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <div>
        <label style="display:block;font-size:10px;letter-spacing:.12em;color:var(--ts);text-transform:uppercase;margin-bottom:4px">Método</label>
        <select id="t4-metodo" onchange="_spSeparoToggleBanco()" style="width:100%;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--tp)">
          ${_SP_METODOS_UI.map(m => `<option value="${m}">${_SP_METODO_LBL[m]}</option>`).join('')}
        </select>
      </div>
      <div id="t4-banco-wrap">
        <label style="display:block;font-size:10px;letter-spacing:.12em;color:var(--ts);text-transform:uppercase;margin-bottom:4px">Cuenta</label>
        <select id="t4-banco" style="width:100%;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--tp)">
          ${_SP_BANCOS.map(b => `<option value="${b}"${b === bancoDefault ? ' selected' : ''}>${b}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="margin-top:10px">
      <label style="display:block;font-size:10px;letter-spacing:.12em;color:var(--ts);text-transform:uppercase;margin-bottom:4px">Fecha del pago</label>
      <input type="date" id="t4-fecha" value="${hoy}" style="width:100%;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--tp)">
    </div>
    <div style="margin-top:10px">
      <label style="display:block;font-size:10px;letter-spacing:.12em;color:var(--ts);text-transform:uppercase;margin-bottom:4px">Referencia (opcional)</label>
      <input type="text" id="t4-ref" maxlength="120" placeholder="Folio, últimos 4 dígitos, nota…" style="width:100%;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--tp)">
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" onclick="_spSeparoDespues()">Después</button>
      <button class="btn btn-primary" id="t4-btn" onclick="_spSeparoMarcar()">Marcar separo pagado</button>
    </div>`;
  crearModal('sp-separo', '¿Ya mandó su separo?', contenido);
  const m = document.getElementById('modal-sp-separo');
  if (m) m.querySelector('.modal').style.maxWidth = '520px';
  return true;
}

function _spNumLugar(solicitudId, lugarId) {
  const lg = (_spLugaresCache[solicitudId] || []).find(x => x.id === lugarId);
  return (lg && lg.numero != null) ? Number(lg.numero) : 9999;
}
// Mismo lenguaje que el plan por lugar: nombre real, o "Titular" para el #1.
function _spEtiquetaLugar(solicitudId, lugarId) {
  if (!lugarId) return 'Separo del grupo';
  const lg = (_spLugaresCache[solicitudId] || []).find(x => x.id === lugarId) || {};
  const num = lg.numero != null ? lg.numero : '?';
  const nombre = (lg.nombre && String(lg.nombre).trim())
    ? lg.nombre
    : (Number(num) === 1 ? 'Titular' : 'Por registrar');
  return 'Lugar ' + num + ' · ' + nombre;
}
function _spSeparoToggleBanco() {
  const met = (document.getElementById('t4-metodo') || {}).value;
  const wrap = document.getElementById('t4-banco-wrap');
  if (wrap) wrap.style.visibility = (met === 'efectivo') ? 'hidden' : 'visible';
}
// "Después" = el camino de hoy, tal cual.
function _spSeparoDespues() {
  _spSeparoPend = null;
  cerrarModal('sp-separo');
  cerrarModal('sp-detalle');
  _spRefrescarLista();
}

async function _spSeparoMarcar() {
  if (!_spSeparoPend) return;
  const { solicitudId, separos } = _spSeparoPend;
  const btn = document.getElementById('t4-btn');
  const metodo = (document.getElementById('t4-metodo') || {}).value || '';
  const cuenta = (metodo === 'efectivo') ? 'Efectivo' : ((document.getElementById('t4-banco') || {}).value || '');
  const fecha  = (document.getElementById('t4-fecha') || {}).value || '';
  const ref    = ((document.getElementById('t4-ref') || {}).value || '').trim();
  if (!metodo) { showToast('Elige un método de pago', 'error'); return; }

  // Qué lugares se marcan y con cuánto. El monto va tal cual al backend, que es
  // quien lo valida (validarMonto vive dentro de admin-marcar-pago).
  const elegidos = [];
  for (let i = 0; i < separos.length; i++) {
    if (!(document.getElementById('t4-chk-' + i) || {}).checked) continue;
    const raw = ((document.getElementById('t4-monto-' + i) || {}).value || '').trim();
    let monto;
    if (raw !== '') {
      monto = Number(raw);
      if (!Number.isFinite(monto) || monto < 0) {
        showToast('El monto de ' + _spEtiquetaLugar(solicitudId, separos[i].lugar_id) + ' no es un número válido', 'error');
        return;
      }
    }
    elegidos.push({ pago: separos[i], monto });
  }
  if (!elegidos.length) { showToast('Palomea al menos un lugar, o dale "Después"', 'error'); return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Marcando…'; }
  const ok = [], fallo = [];
  for (const e of elegidos) {
    try {
      const r = await khAdminFetch('/.netlify/functions/admin-marcar-pago', {
        method: 'POST', headers: _spAdminHeaders(),
        body: JSON.stringify({
          pago_id: e.pago.id,
          accion: 'pagar',
          fecha_pagada: fecha || undefined,
          metodo,
          cuenta: cuenta || undefined,
          referencia: ref || undefined,
          monto_pagado: e.monto,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'no se pudo marcar');
      ok.push(_spEtiquetaLugar(solicitudId, e.pago.lugar_id));
    } catch (err) {
      fallo.push(_spEtiquetaLugar(solicitudId, e.pago.lugar_id) + ' (' + err.message + ')');
    }
  }

  // Mensaje HONESTO: la solicitud ya quedó aprobada pase lo que pase aquí, y si
  // algún lugar no se marcó se dice cuál y a dónde ir. Nada de "listo" a medias.
  if (fallo.length && !ok.length) {
    showToast('La solicitud quedó APROBADA, pero el pago no se marcó — márcalo en Pagos. ' + fallo.join(' · '), 'error');
  } else if (fallo.length) {
    showToast('Separo marcado en ' + ok.length + ' de ' + elegidos.length + '. La solicitud quedó aprobada; falta marcar en Pagos: ' + fallo.join(' · '), 'error');
  } else {
    showToast('Separo marcado' + (ok.length > 1 ? ' en ' + ok.length + ' lugares' : '') + ' ✓', 'success');
  }
  _spSeparoPend = null;
  if (btn) { btn.disabled = false; btn.textContent = 'Marcar separo pagado'; }
  cerrarModal('sp-separo');
  cerrarModal('sp-detalle');
  _spRefrescarLista();
}

// ═══════════════════════════════════════════════════════════════
// PLAN POR LUGAR + PAGO GRUPAL (Acompañantes F3-t4b)
// Agrupa las cuotas por lugar y ofrece el flujo grupal (backend #231:
// admin-aplicar-pago-grupo, modos proponer/aplicar). NO toca marcarPagoSP/
// revertirPagoSP: las filas por lugar reusan _spRenderFilaPago sin cambios.
// ═══════════════════════════════════════════════════════════════

// Chip verde "CONECTADO ✓" (el lugar ya tiene cliente_id: el acompañante aceptó).
const _SP_CHIP_CONECTADO = `<span style="display:inline-block;padding:2px 8px;border-radius:var(--r-chip,999px);background:rgba(61,220,132,.15);border:1px solid rgba(61,220,132,.5);font-size:10px;font-weight:800;letter-spacing:.04em;color:#3DDC84">CONECTADO ✓</span>`;

// [F3b] Chip de contrato del lugar (verde firmado / ámbar pendiente). '' si no hay
// contrato vivo (solicitud vieja pre-módulo).
function _spContratoChip(lg){
  const c = lg && lg.contrato; if (!c || !c.estado) return '';
  if (c.estado === 'firmado')
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:var(--r-chip,999px);background:rgba(61,220,132,.15);border:1px solid rgba(61,220,132,.5);font-size:10px;font-weight:800;color:#3DDC84"><svg class="ic" style="width:12px;height:12px"><use href="#ic-boleto"/></svg> Contrato ✓</span>`;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:var(--r-chip,999px);background:rgba(232,168,0,.12);border:1px solid rgba(232,168,0,.4);font-size:10px;font-weight:800;color:#e8a800"><svg class="ic" style="width:12px;height:12px"><use href="#ic-alerta"/></svg> Contrato pendiente</span>`;
}
// [F3b] Botón discreto "copiar link de firma" (solo pendiente + token; Bulma es admin).
function _spCopyLinkBtn(lg){
  const c = lg && lg.contrato; if (!c || c.estado === 'firmado' || !c.token) return '';
  return `<button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="spCopiarLinkFirma('${_spEscape(c.token)}',this)"><svg class="ic"><use href="#ic-enlace"/></svg> Copiar link de firma</button>`;
}
// [F3b] Casilla "Boleto entregado" — SOLO lugares de paquete CHEAP. Deshabilitada
// con tooltip si el contrato no está firmado (el servidor la rebota igual).
function _spBoletoRow(lg, solSafe){
  if (!lg || String(lg.paquete || '').toLowerCase() !== 'cheap') return '';
  const firmado = !!(lg.contrato && lg.contrato.estado === 'firmado');
  const entregado = !!lg.boleto_entregado_at;
  const lgSafe = _spEscape(lg.id);
  const bloqueado = (!firmado && !entregado);
  const fecha = entregado ? _spFmtFechaRel(lg.boleto_entregado_at) : '';
  return `<label style="display:flex;align-items:center;gap:8px;margin:2px 0 8px;font-size:12px;${bloqueado ? 'opacity:.6;' : ''}"${bloqueado ? ' title="Requiere contrato firmado"' : ''}>
    <input type="checkbox" ${entregado ? 'checked' : ''} ${bloqueado ? 'disabled' : ''} onchange="spToggleBoleto('${lgSafe}','${solSafe}',this)" style="width:16px;height:16px;accent-color:var(--gold)">
    <svg class="ic" style="width:14px;height:14px;color:var(--gold)"><use href="#ic-boleto"/></svg>
    <span>Boleto entregado${entregado && fecha ? ` <span style="color:var(--ts)">· ${_spEscape(fecha)}</span>` : ''}</span>
    ${bloqueado ? `<span style="color:var(--ts);font-size:11px">— requiere contrato firmado</span>` : ''}
  </label>`;
}
// [F3b] Copiar el link de firma al portapapeles (para reenviar por WhatsApp).
async function spCopiarLinkFirma(token, btn){
  const url = location.origin + '/contrato-viajero.html?token=' + encodeURIComponent(token);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(url);
    else { const ta = document.createElement('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    if (btn){ const o = btn.innerHTML; btn.innerHTML = 'Copiado ✓'; setTimeout(() => { btn.innerHTML = o; }, 1600); }
    showToast('Link de firma copiado.', 'success');
  } catch (e) { showToast('No se pudo copiar. Link: ' + url, 'error'); }
}
// [F3b] Marcar/des-marcar boleto entregado. El CANDADO está en el server (409 si
// no hay contrato firmado); aquí mostramos el mensaje tal cual y revertimos.
async function spToggleBoleto(lugarId, solicitudId, cb){
  const entregar = !!cb.checked;
  cb.disabled = true;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-lugar-boleto', {
      method: 'POST', headers: _spAdminHeaders(), body: JSON.stringify({ lugar_id: lugarId, entregado: entregar }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false){
      cb.checked = !entregar; cb.disabled = false;
      showToast(j.error || ('Error ' + r.status), 'error'); // 409 → '⛔ Sin contrato firmado...'
      return;
    }
    const lg = (_spLugaresCache[solicitudId] || []).find(x => x.id === lugarId);
    if (lg) lg.boleto_entregado_at = j.boleto_entregado_at || null;
    showToast(entregar ? 'Boleto marcado como entregado.' : 'Se des-marcó el boleto.', 'success');
    renderPlanPagosSP(solicitudId, 'en_pagos'); // re-pinta el plan (fecha/estado)
  } catch (e){
    cb.checked = !entregar; cb.disabled = false; showToast('Error: ' + e.message, 'error');
  }
}

function _spRenderPlanPorLugar(solicitudId, pagos) {
  const solSafe = _spEscape(solicitudId);
  const lugById = {};
  (_spLugaresCache[solicitudId] || []).forEach(l => { lugById[l.id] = l; });

  // Agrupar las cuotas por lugar_id, ordenando los lugares por su numero.
  const grupos = {};
  pagos.forEach(p => { const k = p.lugar_id || '_'; (grupos[k] = grupos[k] || []).push(p); });
  const keys = Object.keys(grupos).sort((a, b) => {
    const na = (lugById[a] && lugById[a].numero != null) ? Number(lugById[a].numero) : 9999;
    const nb = (lugById[b] && lugById[b].numero != null) ? Number(lugById[b].numero) : 9999;
    return na - nb;
  });

  const botonGrupo = `
    <div id="sp-grupo-${solSafe}" style="margin-bottom:12px">
      <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="abrirPagoGrupoSP('${solSafe}')"><svg class="ic"><use href="#ic-dinero"/></svg> Aplicar pago grupal</button>
    </div>`;

  const secciones = keys.map(k => {
    const lg = lugById[k];
    const ps = grupos[k];
    const num = lg && lg.numero != null ? lg.numero : '?';
    // Retroactivo (sin SQL): lugares 1 viejos sin nombre → "Titular" (el #1 es el
    // titular; los nuevos ya nacen con su nombre vía ensureLugares).
    const nombre = (lg && lg.nombre && String(lg.nombre).trim()) ? lg.nombre : (Number(num) === 1 ? 'Titular' : 'Por registrar');
    const conectado = (lg && lg.cliente_id) ? _SP_CHIP_CONECTADO : '';
    // [F5-t1] Estado del lugar: baja (tachado+rojo) / traspasado (ámbar) / activo.
    const estado = (lg && lg.estado) ? lg.estado : 'activo';
    const nombreStyle = estado === 'baja' ? 'text-decoration:line-through;opacity:.6;' : '';
    const etiquetaEstado = estado === 'baja'
      ? `<span style="padding:1px 7px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:.1em;color:#FF6B6B;border:1px solid rgba(255,107,107,.5);background:rgba(255,107,107,.12)">BAJA</span>`
      : (estado === 'traspasado'
        ? `<span style="padding:1px 7px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:.1em;color:#FFB703;border:1px solid rgba(255,183,3,.5);background:rgba(255,183,3,.12)">TRASPASADO</span>`
        : '');
    // Botón "Baja": solo lugares ACTIVOS que no sean el titular (#1).
    const btnBaja = (lg && estado === 'activo' && Number(num) >= 2)
      ? `<button class="btn btn-ghost btn-sm" style="font-size:10px;color:#FF6B6B;border-color:rgba(255,107,107,.4)" onclick="darBajaLugarSP('${_spEscape(lg.id)}','${solSafe}')">↓︎ Baja</button>`
      : '';
    // [F5-t2] Botón "Traspasar": lugares numero>=2 ACTIVOS o en BAJA (revivir para el nuevo).
    const puedeTraspasar = lg && Number(num) >= 2 && (estado === 'activo' || estado === 'baja');
    const lgSafe = lg ? _spEscape(lg.id) : '';
    const btnTraspaso = puedeTraspasar
      ? `<button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="_spToggleTraspaso('${lgSafe}','${solSafe}')">⇄ Traspasar</button>`
      : '';
    const inpTras = 'width:100%;padding:7px 8px;margin-bottom:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--ink);font-size:12px';
    const formTraspaso = puedeTraspasar
      ? `<div id="sp-traspaso-${lgSafe}" style="display:none;margin:0 0 10px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px">
          <div style="font-size:11px;color:var(--ts);margin-bottom:8px">Traspasar a otra persona — conserva lo abonado y lo restante; al nuevo le llega su invitación.</div>
          <input id="sp-tras-nombre-${lgSafe}" type="text" maxlength="120" placeholder="Nombre del nuevo ocupante" style="${inpTras}">
          <input id="sp-tras-correo-${lgSafe}" type="email" placeholder="Correo del nuevo ocupante" style="${inpTras}">
          <input id="sp-tras-motivo-${lgSafe}" type="text" maxlength="500" placeholder="Motivo (opcional)" style="${inpTras}">
          <div id="sp-tras-cargo-${lgSafe}" style="font-size:11px;margin:2px 0 8px;color:var(--ts)">Calculando cargo…</div>
          <label id="sp-tras-forzar-wrap-${lgSafe}" style="display:none;font-size:11px;color:var(--orange);margin-bottom:8px;cursor:pointer;align-items:center;gap:6px">
            <input type="checkbox" id="sp-tras-forzar-${lgSafe}" style="vertical-align:-1px"> Aplicar cargo de $350
          </label>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="_spToggleTraspaso('${lgSafe}')">Cancelar</button>
            <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="traspasarLugarSP('${lgSafe}','${solSafe}')">Confirmar traspaso</button>
          </div>
        </div>`
      : '';
    const subPagado = ps.filter(p => p.estado === 'pagado').reduce((a, p) => a + (Number(p.monto_pagado ?? p.monto) || 0), 0);
    const subTotal = ps.reduce((a, p) => a + Number(p.monto || 0), 0);
    const filas = ps.map(p => _spRenderFilaPago(solicitudId, p)).join('');
    return `
      <div style="border:1px solid var(--border);border-radius:10px;padding:10px 10px 12px;margin-bottom:8px;background:var(--bg2)">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:9px">
          <b style="font-size:13px;${nombreStyle}">Lugar #${_spEscape(num)} · ${_spEscape(nombre)}</b>
          ${etiquetaEstado}${conectado}${_spContratoChip(lg)}
          <span style="margin-left:auto;font-size:11px;color:var(--ts);white-space:nowrap">Pagado ${_spFmtMxn(subPagado)} de ${_spFmtMxn(subTotal)}</span>
          ${btnBaja}${btnTraspaso}${_spCopyLinkBtn(lg)}
        </div>
        ${_spBoletoRow(lg, solSafe)}
        ${formTraspaso}
        <div style="display:flex;flex-direction:column;gap:8px">${filas}</div>
      </div>`;
  }).join('');

  return botonGrupo + secciones;
}

// [F5-t1] Dar de BAJA un lugar (Bulma). Política: cae SOLO ese lugar, sus cuotas
// pendientes se anulan y lo abonado NO se devuelve. El titular queda avisado por
// correo. El nombre/numero se leen del cache (evita romper el onclick con comillas).
async function darBajaLugarSP(lugarId, solicitudId){
  const lg = (_spLugaresCache[solicitudId] || []).find(x => x.id === lugarId) || {};
  const num = (lg.numero != null) ? lg.numero : '?';
  const nombre = (lg.nombre && String(lg.nombre).trim()) ? lg.nombre : ('Lugar #' + num);
  const motivo = prompt('Motivo de la baja (opcional):', '');
  if (motivo === null) return; // canceló el prompt
  if (!confirm(`¿Dar de baja el lugar #${num} (${nombre})? Sus cuotas pendientes se anulan y lo abonado NO se devuelve.`)) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-lugar-baja', {
      method: 'POST',
      body: JSON.stringify({ lugar_id: lugarId, motivo: (motivo && motivo.trim()) ? motivo.trim() : undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-lugar-baja ' + r.status));
    const partes = [`${j.cuotas_anuladas || 0} cuota(s) anulada(s)`];
    if (j.abonado_del_lugar) partes.push(`${_spFmtMxn(j.abonado_del_lugar)} abonado no reembolsable`);
    if (j.correo_titular) partes.push('titular avisado');
    showToast('Lugar dado de baja — ' + partes.join(' · '), 'success');
    await _spRefrescarPlanYLista(solicitudId, undefined);
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// [F5-t2] Abre/cierra el mini-form de traspaso de un lugar. Al ABRIR, calcula el
// cargo por traspaso (Gancho 1) y lo muestra antes de confirmar.
function _spToggleTraspaso(lugarId, solicitudId){
  const f = document.getElementById('sp-traspaso-' + lugarId);
  if (!f) return;
  const abriendo = (f.style.display === 'none');
  f.style.display = abriendo ? '' : 'none';
  if (abriendo && solicitudId) _spPintarCargoTraspaso(lugarId, solicitudId);
}

// [Gancho 1] Días hasta la PRIMERA fecha del evento (ds), hoy en hora MX (patrón
// en-CA/Monterrey del cron F4). null si no se puede parsear.
function _spDiasHastaEvento(dsISO){
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  const a = Date.parse(String(dsISO).slice(0,10) + 'T00:00:00Z');
  const b = Date.parse(hoy + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

// [Gancho 1] Días hasta el evento de una solicitud (best-effort). Usa el evento_id
// del cache sp + el ds del catálogo (EV de index.html, cacheado). Multifecha: slug
// base. null si no se puede calcular → el backend decide (o Bulma con la casilla).
async function _spCalcDiasTraspaso(solicitudId){
  try {
    const sol = (_spCache || []).find(x => x && x.id === solicitudId);
    const evId = sol && sol.evento_id;
    if (!evId) return null;
    const ev = (await _fetchEVFromIndex() || []).find(e => e && e.id === String(evId).split('#')[0]);
    if (!ev || !ev.ds) return null;
    return _spDiasHastaEvento(ev.ds);
  } catch (e) { return null; }
}

// [Gancho 1] Pinta la consecuencia del cargo en el mini-form + muestra la casilla
// manual solo cuando NO se pudo calcular los días.
async function _spPintarCargoTraspaso(lugarId, solicitudId){
  const box = document.getElementById('sp-tras-cargo-' + lugarId);
  const wrap = document.getElementById('sp-tras-forzar-wrap-' + lugarId);
  const chk = document.getElementById('sp-tras-forzar-' + lugarId);
  if (!box) return;
  const dias = await _spCalcDiasTraspaso(solicitudId);
  if (dias == null) {
    box.innerHTML = '⚠️ No pude calcular los días del evento; decide tú si aplicar el cargo.';
    box.style.color = 'var(--orange)';
    if (wrap) wrap.style.display = 'flex';
  } else {
    if (wrap) wrap.style.display = 'none';
    if (chk) chk.checked = false;
    if (dias <= 5) {
      box.innerHTML = `⚠️ Evento en <b>${dias} día${dias === 1 ? '' : 's'}</b> → se sumará un <b>cargo de $350</b> al plan.`;
      box.style.color = 'var(--orange)';
    } else {
      box.innerHTML = `Sin cargo (faltan <b>${dias} días</b> para el evento).`;
      box.style.color = 'var(--ts)';
    }
  }
}

// [F5-t2] Traspasa el lugar a otra persona (Bulma). Conserva lo abonado y lo
// restante; al nuevo le llega su invitación por correo (acepta con #226/#230).
async function traspasarLugarSP(lugarId, solicitudId){
  const nombre = ((document.getElementById('sp-tras-nombre-' + lugarId) || {}).value || '').trim();
  const correo = ((document.getElementById('sp-tras-correo-' + lugarId) || {}).value || '').trim();
  const motivo = ((document.getElementById('sp-tras-motivo-' + lugarId) || {}).value || '').trim();
  if (!nombre) { showToast('Escribe el nombre del nuevo ocupante', 'error'); return; }
  if (!correo || !correo.includes('@')) { showToast('Escribe un correo válido del nuevo ocupante', 'error'); return; }

  const lg = (_spLugaresCache[solicitudId] || []).find(x => x.id === lugarId) || {};
  const num = (lg.numero != null) ? lg.numero : '?';
  // Abonado del lugar (si se conoce, del cache del plan) para el confirm.
  const pagosLugar = (_spPlanCache[solicitudId] || []).filter(p => p.lugar_id === lugarId);
  const abonado = pagosLugar.filter(p => p.estado === 'pagado').reduce((a, p) => a + (Number(p.monto_pagado ?? p.monto) || 0), 0);
  const abonadoTxt = abonado ? ` (${_spFmtMxn(abonado)} abonado)` : '';

  // [Gancho 1] Consecuencia del cargo ANTES de confirmar. La casilla manual solo
  // fuerza el cargo cuando los días son indeterminados.
  const dias = await _spCalcDiasTraspaso(solicitudId);
  const forzar = !!((document.getElementById('sp-tras-forzar-' + lugarId) || {}).checked);
  let cargoMsg;
  if (dias == null) cargoMsg = forzar
    ? '\n\n⚠️ Se aplicará un cargo de $350 (forzado manual).'
    : '\n\n(No se pudieron calcular los días; el sistema decidirá el cargo.)';
  else if (dias <= 5) cargoMsg = `\n\n⚠️ Evento en ${dias} día(s): se sumará un cargo de $350 al plan.`;
  else cargoMsg = `\n\nSin cargo (faltan ${dias} días para el evento).`;
  if (!confirm(`¿Traspasar el lugar #${num} a ${nombre}? Conserva lo abonado${abonadoTxt} y lo restante; al nuevo le llega su invitación por correo.${cargoMsg}`)) return;

  try {
    const r = await khAdminFetch('/.netlify/functions/admin-lugar-traspasar', {
      method: 'POST',
      body: JSON.stringify({ lugar_id: lugarId, nombre, correo, motivo: motivo || undefined, forzar_cargo: forzar || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-lugar-traspasar ' + r.status));
    const partes = [];
    if (j.revivido) partes.push('lugar revivido');
    if (j.cuotas_reactivadas) partes.push(`${j.cuotas_reactivadas} cuota(s) reactivada(s)`);
    partes.push(j.invitacion_enviada ? 'invitación enviada' : 'invitación NO salió (reenvía)');
    // [Gancho 1] Reflejar el cargo en el toast.
    const ct = j.cargo_traspaso;
    if (ct) {
      if (ct.error) partes.push('⚠️ el cargo de $350 NO se pudo sumar');
      else if (ct.aplicado) partes.push(`cargo de $${ct.monto} sumado al plan`);
      else if (ct.indeterminado) partes.push('sin cargo (días indeterminados)');
      else partes.push('sin cargo');
    }
    showToast('Lugar traspasado — ' + partes.join(' · '), j.invitacion_enviada ? 'success' : 'error');
    await _spRefrescarPlanYLista(solicitudId, undefined);
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// Abre el mini-form del pago grupal (monto + fecha + método + referencia).
function abrirPagoGrupoSP(solicitudId) {
  const box = document.getElementById('sp-grupo-' + solicitudId);
  if (!box) return;
  const solSafe = _spEscape(solicitudId);
  const hoy = _spYmd(new Date());
  const opciones = _SP_METODOS_UI.map(k => `<option value="${k}">${_SP_METODO_LBL[k]}</option>`).join('');
  const lbl = 'display:block;font-size:9px;letter-spacing:.1em;color:var(--ts);text-transform:uppercase;margin-bottom:3px';
  const inp = 'padding:7px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--ink);font-size:12px';
  box.innerHTML = `
    <div style="padding:12px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px)">
      <div style="font-size:12px;font-weight:700;margin-bottom:4px"><svg class="ic"><use href="#ic-dinero"/></svg> Pago grupal</div>
      <div style="font-size:11px;color:var(--ts);margin-bottom:10px">Una transferencia del titular se reparte entre las cuotas de los lugares (cascada por fecha). El sistema propone; tú confirmas.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div><label style="${lbl}">Monto recibido</label><input type="number" id="sp-grupo-monto-${solSafe}" min="0" step="0.01" placeholder="0.00" style="width:130px;${inp}"></div>
        <div><label style="${lbl}">Fecha</label><input type="date" id="sp-grupo-fecha-${solSafe}" value="${_spEscape(hoy)}" style="${inp}"></div>
        <div><label style="${lbl}">Método</label><select id="sp-grupo-metodo-${solSafe}" style="${inp}">${opciones}</select></div>
        <div style="flex:1;min-width:150px"><label style="${lbl}">Referencia (opcional)</label><input type="text" id="sp-grupo-ref-${solSafe}" maxlength="120" placeholder="folio, últimos 4 dígitos, etc." style="width:100%;${inp}"></div>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="cerrarPagoGrupoSP('${solSafe}')">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="sp-grupo-btn-${solSafe}" style="font-size:11px" onclick="proponerPagoGrupoSP('${solSafe}')">Proponer reparto</button>
      </div>
      <div id="sp-grupo-prop-${solSafe}" style="margin-top:12px"></div>
    </div>`;
}

// Cancelar: limpia el contexto y restaura el botón (sin escribir nada).
function cerrarPagoGrupoSP(solicitudId) {
  delete _spGrupoCache[solicitudId];
  const box = document.getElementById('sp-grupo-' + solicitudId);
  if (box) box.innerHTML = `<button class="btn btn-primary btn-sm" style="font-size:11px" onclick="abrirPagoGrupoSP('${_spEscape(solicitudId)}')"><svg class="ic"><use href="#ic-dinero"/></svg> Aplicar pago grupal</button>`;
}

// MODO proponer: pide al backend la cascada de cuotas para el monto dado.
async function proponerPagoGrupoSP(solicitudId) {
  const montoRaw = ((document.getElementById('sp-grupo-monto-' + solicitudId) || {}).value || '').trim();
  const monto = Number(montoRaw);
  if (!Number.isFinite(monto) || monto <= 0) { showToast('Escribe un monto válido (> 0)', 'error'); return; }
  const fecha = (document.getElementById('sp-grupo-fecha-' + solicitudId) || {}).value || '';
  const metodo = (document.getElementById('sp-grupo-metodo-' + solicitudId) || {}).value || '';
  const referencia = ((document.getElementById('sp-grupo-ref-' + solicitudId) || {}).value || '').trim();
  const btn = document.getElementById('sp-grupo-btn-' + solicitudId);
  if (btn) { btn.disabled = true; btn.textContent = 'Calculando…'; }
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-aplicar-pago-grupo', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ solicitud_id: solicitudId, modo: 'proponer', monto }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo calcular la propuesta');
    _spGrupoCache[solicitudId] = { monto, fecha, metodo, referencia, propuesta: Array.isArray(data.propuesta) ? data.propuesta : [] };
    _spRenderPropuestaGrupo(solicitudId);
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Proponer reparto'; }
  }
}

// Pinta la propuesta: un checkbox por cuota (pre-palomeadas), pie con la suma en
// vivo, y el botón "Confirmar y aplicar".
function _spRenderPropuestaGrupo(solicitudId) {
  const cont = document.getElementById('sp-grupo-prop-' + solicitudId);
  const ctx = _spGrupoCache[solicitudId];
  if (!cont || !ctx) return;
  const solSafe = _spEscape(solicitudId);
  if (!ctx.propuesta.length) {
    cont.innerHTML = `<div style="border-top:1px solid var(--border);padding-top:10px;font-size:12px;color:var(--orange)">Con ${_spFmtMxn(ctx.monto)} no alcanza para cubrir ninguna cuota completa. Sobrante: ${_spFmtMxn(ctx.monto)}.</div>`;
    return;
  }
  const filas = ctx.propuesta.map(c => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px;cursor:pointer">
      <input type="checkbox" checked data-id="${_spEscape(c.pago_id)}" data-monto="${_spEscape(Number(c.monto || 0))}" onchange="_spGrupoRecalc('${solSafe}')">
      <span>Cuota ${_spEscape(c.numero_pago)} · Lugar #${_spEscape(c.lugar_numero)}${(c.lugar_nombre && String(c.lugar_nombre).trim()) ? ' (' + _spEscape(c.lugar_nombre) + ')' : ''} · ${_spEscape(c.concepto)}</span>
      <span style="margin-left:auto;white-space:nowrap"><b>${_spFmtMxn(c.monto)}</b></span>
    </label>`).join('');
  cont.innerHTML = `
    <div style="border-top:1px solid var(--border);padding-top:10px">
      <div style="font-size:11px;color:var(--ts);margin-bottom:4px">Propuesta (cascada por fecha). Despalomea las que no quieras aplicar:</div>
      <div id="sp-grupo-lista-${solSafe}">${filas}</div>
      <div id="sp-grupo-pie-${solSafe}" style="margin-top:8px;font-size:12px"></div>
      <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="cerrarPagoGrupoSP('${solSafe}')">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="sp-grupo-aplicar-${solSafe}" style="font-size:11px" onclick="aplicarPagoGrupoSP('${solSafe}')">Confirmar y aplicar</button>
      </div>
    </div>`;
  _spGrupoRecalc(solicitudId);
}

// Recalcula en vivo el pie (suma palomeada + sobrante) al palomear/despalomear.
function _spGrupoRecalc(solicitudId) {
  const ctx = _spGrupoCache[solicitudId];
  const lista = document.getElementById('sp-grupo-lista-' + solicitudId);
  const pie = document.getElementById('sp-grupo-pie-' + solicitudId);
  if (!ctx || !lista || !pie) return;
  let suma = 0, n = 0;
  lista.querySelectorAll('input[type=checkbox]').forEach(cb => {
    if (cb.checked) { suma += Number(cb.dataset.monto || 0); n++; }
  });
  suma = Math.round(suma * 100) / 100;
  const sobrante = Math.round((ctx.monto - suma) * 100) / 100;
  pie.innerHTML = `Se aplicarán: <b style="color:#3DDC84">${_spFmtMxn(suma)}</b> (${n} cuota${n !== 1 ? 's' : ''}) · Sobrante sin aplicar: <b style="color:var(--orange)">${_spFmtMxn(sobrante)}</b>`;
  const btn = document.getElementById('sp-grupo-aplicar-' + solicitudId);
  if (btn) btn.disabled = (n === 0);
}

// MODO aplicar: manda las cuotas palomeadas + fecha/método/referencia. En 409
// (algo cambió) muestra el detalle del backend y refresca el plan.
async function aplicarPagoGrupoSP(solicitudId) {
  const ctx = _spGrupoCache[solicitudId];
  const lista = document.getElementById('sp-grupo-lista-' + solicitudId);
  if (!ctx || !lista) return;
  const pagoIds = [];
  lista.querySelectorAll('input[type=checkbox]').forEach(cb => { if (cb.checked) pagoIds.push(cb.dataset.id); });
  if (!pagoIds.length) { showToast('Selecciona al menos una cuota', 'error'); return; }
  const btn = document.getElementById('sp-grupo-aplicar-' + solicitudId);
  if (btn) { btn.disabled = true; btn.textContent = 'Aplicando…'; }
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-aplicar-pago-grupo', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({
        solicitud_id: solicitudId,
        modo: 'aplicar',
        pago_ids: pagoIds,
        fecha_pagada: ctx.fecha || undefined,
        metodo: ctx.metodo || undefined,
        referencia: ctx.referencia || undefined,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const det = data.detalle ? (' (' + _spEscape(JSON.stringify(data.detalle)) + ')') : '';
      showToast('Error: ' + (data.error || 'No se pudo aplicar') + det, 'error');
      if (r.status === 409) { delete _spGrupoCache[solicitudId]; await _spRefrescarPlanYLista(solicitudId, undefined); }
      return;
    }
    delete _spGrupoCache[solicitudId];
    const n = data.aplicados || 0;
    showToast('✓ ' + n + ' cuota' + (n !== 1 ? 's' : '') + ' aplicada' + (n !== 1 ? 's' : '') + ' — ' + (data.solicitud_estado || ''), 'success');
    await _spRefrescarPlanYLista(solicitudId, data.solicitud_estado);
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar y aplicar'; }
  }
}

// Alterna la bitácora colapsable; la primera vez que se abre (div vacío) carga
// los movimientos. Actualiza la flecha ▾/▴ del botón.
function toggleBitacoraSP(solicitudId) {
  const div = document.getElementById('sp-audit-' + solicitudId);
  if (!div) return;
  const abrir = div.style.display === 'none';
  div.style.display = abrir ? '' : 'none';
  const btn = div.parentElement && div.parentElement.querySelector('button');
  if (btn) btn.textContent = abrir ? 'Ver movimientos ▴' : 'Ver movimientos ▾';
  if (abrir && !div.dataset.cargado) cargarBitacoraSP(solicitudId);
}

// Trae la bitácora de pagos_auditoria y la pinta línea por línea (más reciente
// primero, como ya viene del backend). Best-effort: si truena, muestra el error.
async function cargarBitacoraSP(solicitudId) {
  const div = document.getElementById('sp-audit-' + solicitudId);
  if (!div) return;
  div.innerHTML = `<span style="color:var(--ts);font-size:12px">Cargando movimientos…</span>`;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-pagos-auditoria-list', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ solicitud_id: solicitudId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo cargar la bitácora');
    const movs = Array.isArray(data.movimientos) ? data.movimientos : [];
    if (!movs.length) {
      div.innerHTML = `<span style="color:var(--ts);font-size:12px">Sin movimientos registrados aún.</span>`;
      div.dataset.cargado = '1';
      return;
    }
    div.innerHTML = movs.map(m => {
      const esPago = m.accion === 'pagado';
      const color = esPago ? '#3DDC84' : 'var(--orange)';
      const numPago = (m.pagos && m.pagos.numero_pago != null) ? m.pagos.numero_pago : '?';
      const monto = (esPago && m.monto_pagado != null) ? ` · ${_spFmtMxn(m.monto_pagado)}` : '';
      const fecha = m.creado_en
        ? new Date(m.creado_en).toLocaleString('es-MX', { timeZone: 'America/Monterrey', dateStyle: 'medium', timeStyle: 'short' })
        : '';
      return `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px">
        <span style="flex:none;width:8px;height:8px;border-radius:50%;background:${color}"></span>
        <span style="color:var(--ink)">Pago #${numPago} · ${_spEscape(m.accion)} por ${_spEscape(m.actor)}${monto}</span>
        <span style="margin-left:auto;color:var(--ts);white-space:nowrap">${_spEscape(fecha)}</span>
      </div>`;
    }).join('');
    div.dataset.cargado = '1';
  } catch (e) {
    div.innerHTML = `<span style="color:#FF6B6B;font-size:12px">Error: ${_spEscape(e.message)}</span>`;
  }
}

function _spRenderFilaPago(solicitudId, p) {
  const idSafe   = _spEscape(p.id);
  const solSafe  = _spEscape(solicitudId);
  const esPagado = p.estado === 'pagado';

  let accionHtml;
  if (esPagado) {
    // Si se capturó un monto real distinto al del plan, mostrarlo (transparencia).
    const difMonto = (p.monto_pagado != null && Number(p.monto_pagado) !== Number(p.monto))
      ? 'Pagado: ' + _spFmtMxn(p.monto_pagado) + ' (esperado: ' + _spFmtMxn(p.monto) + ')'
      : null;
    const detalle = [
      difMonto,
      p.metodo ? (_SP_METODO_LBL[p.metodo] || p.metodo) : null,
      p.cuenta ? 'Cuenta: ' + _spEscape(p.cuenta) : null,
      p.referencia ? 'Ref: ' + _spEscape(p.referencia) : null,
      p.fecha_pagada ? 'Pagado ' + _spEscape(p.fecha_pagada) : null,
    ].filter(Boolean).join(' · ');
    accionHtml = `
      <div style="margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:11px;color:#3DDC84">${detalle || 'Pagado'}</span>
        <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="revertirPagoSP('${solSafe}','${idSafe}')">Revertir</button>
      </div>`;
  } else {
    const hoy = _spYmd(new Date());
    // Método: solo las 3 formas de pago nuevas.
    const opciones = _SP_METODOS_UI
      .map(k => `<option value="${k}">${_SP_METODO_LBL[k]}</option>`).join('');
    // Banco: default según el paquete de la solicitud (editable). Solo aplica si
    // el método es Transferencia o Depósito; con Efectivo se oculta.
    const bancoDefault = _spCuentaDefault(_spPaqueteCache[solicitudId]);
    const opcionesBanco = _SP_BANCOS
      .map(c => `<option value="${c}"${c === bancoDefault ? ' selected' : ''}>${c}</option>`).join('');
    accionHtml = `
      <div style="margin-top:8px">
        <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="abrirFormPagarSP('${idSafe}')">Marcar pagado</button>
      </div>
      <div id="sp-form-pago-${idSafe}" style="display:none;margin-top:10px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px)">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <label style="display:block;font-size:9px;letter-spacing:.1em;color:var(--ts);text-transform:uppercase;margin-bottom:3px">Monto pagado</label>
            <input type="number" id="sp-pago-monto-${idSafe}" min="0" step="0.01" value="${_spEscape(Number(p.monto || 0))}" style="width:120px;padding:7px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--ink);font-size:12px">
          </div>
          <div>
            <label style="display:block;font-size:9px;letter-spacing:.1em;color:var(--ts);text-transform:uppercase;margin-bottom:3px">Fecha</label>
            <input type="date" id="sp-pago-fecha-${idSafe}" value="${_spEscape(hoy)}" style="padding:7px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--ink);font-size:12px">
          </div>
          <div>
            <label style="display:block;font-size:9px;letter-spacing:.1em;color:var(--ts);text-transform:uppercase;margin-bottom:3px">Método</label>
            <select id="sp-pago-metodo-${idSafe}" onchange="_spOnMetodoChange('${idSafe}')" style="padding:7px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--ink);font-size:12px">${opciones}</select>
          </div>
          <div id="sp-pago-banco-wrap-${idSafe}">
            <label style="display:block;font-size:9px;letter-spacing:.1em;color:var(--ts);text-transform:uppercase;margin-bottom:3px">Banco</label>
            <select id="sp-pago-banco-${idSafe}" style="padding:7px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--ink);font-size:12px">${opcionesBanco}</select>
          </div>
          <div style="flex:1;min-width:150px">
            <label style="display:block;font-size:9px;letter-spacing:.1em;color:var(--ts);text-transform:uppercase;margin-bottom:3px">Referencia (opcional)</label>
            <input type="text" id="sp-pago-ref-${idSafe}" maxlength="120" placeholder="folio, últimos 4 dígitos, etc." style="width:100%;padding:7px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--ink);font-size:12px">
          </div>
        </div>
        <div style="margin-top:6px;font-size:10px;color:var(--ts)">Por defecto el monto del plan — cámbialo si pagó distinto.</div>
        <div style="margin-top:10px">
          <label style="display:block;font-size:9px;letter-spacing:.1em;color:var(--ts);text-transform:uppercase;margin-bottom:3px">Comprobante (opcional)</label>
          <input type="file" id="sp-pago-comprob-${idSafe}" accept="image/jpeg,image/png,image/webp,application/pdf" style="font-size:11px;color:var(--ts);max-width:100%">
          <div style="margin-top:3px;font-size:10px;color:var(--ts)">JPG, PNG, WEBP o PDF · máx 4 MB</div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="cerrarFormPagarSP('${idSafe}')">Cancelar</button>
          <button class="btn btn-primary btn-sm" id="sp-pago-btn-${idSafe}" style="font-size:11px" onclick="marcarPagoSP('${solSafe}','${idSafe}')">Confirmar pago</button>
        </div>
      </div>`;
  }

  // Enlace para ver el comprobante del pago si ya tiene uno (firma on-demand,
  // igual que el del separo). El separo (pago #1) se ve en su propia sección.
  const comprobHtml = (p.comprobante_url && Number(p.numero_pago) !== 1)
    ? `<div style="margin-top:6px"><button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="verComprobantePagoSP('${idSafe}')"><svg class="ic"><use href="#ic-clip"/></svg> Ver comprobante</button></div>`
    : '';

  return `
    <div style="border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:10px 12px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--orange)">#${_spEscape(p.numero_pago)}</span>
        <span style="flex:1;font-size:13px">${_spEscape(p.concepto)}</span>
        <span style="font-size:13px;white-space:nowrap"><b>${_spFmtMxn(p.monto)}</b></span>
        ${_spBadgePago(p.estado)}
      </div>
      <div style="margin-top:3px;font-size:11px;color:var(--ts)">Vence: ${_spEscape(p.fecha_esperada)}${Number(p.numero_pago) === 1 ? ' · Separo (comprobante en la sección de abajo)' : ''}</div>
      ${accionHtml}
      ${comprobHtml}
    </div>`;
}

function abrirFormPagarSP(pagoId) {
  const f = document.getElementById('sp-form-pago-' + pagoId);
  if (f) f.style.display = '';
  _spOnMetodoChange(pagoId);  // sincroniza la visibilidad del banco con el método
}

// Muestra/oculta el selector de banco según el método: Transferencia/Depósito lo
// muestran (el dinero entra a un banco); Efectivo lo oculta (cuenta = 'Efectivo').
function _spOnMetodoChange(pagoId) {
  const metodo = (document.getElementById('sp-pago-metodo-' + pagoId) || {}).value || '';
  const wrap = document.getElementById('sp-pago-banco-wrap-' + pagoId);
  if (wrap) wrap.style.display = (metodo === 'efectivo') ? 'none' : '';
}

function cerrarFormPagarSP(pagoId) {
  const f = document.getElementById('sp-form-pago-' + pagoId);
  if (f) f.style.display = 'none';
}

async function marcarPagoSP(solicitudId, pagoId) {
  const btn = document.getElementById('sp-pago-btn-' + pagoId);
  const fecha  = (document.getElementById('sp-pago-fecha-' + pagoId) || {}).value || '';
  const metodo = (document.getElementById('sp-pago-metodo-' + pagoId) || {}).value || '';
  // Cuenta = a qué cuenta entró el dinero: Efectivo → 'Efectivo'; si no, el banco.
  const cuenta = (metodo === 'efectivo')
    ? 'Efectivo'
    : ((document.getElementById('sp-pago-banco-' + pagoId) || {}).value || '');
  const ref    = ((document.getElementById('sp-pago-ref-' + pagoId) || {}).value || '').trim();
  const montoRaw = ((document.getElementById('sp-pago-monto-' + pagoId) || {}).value || '').trim();
  if (!metodo) { showToast('Elige un método de pago', 'error'); return; }

  // Monto real pagado: prellenado con el del plan, editable. Si queda vacío se
  // manda undefined (el backend deja NULL = monto del plan, compatibilidad).
  let montoPagado;
  if (montoRaw !== '') {
    montoPagado = Number(montoRaw);
    if (!Number.isFinite(montoPagado) || montoPagado < 0) {
      showToast('El monto pagado debe ser un número válido (>= 0)', 'error');
      return;
    }
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-marcar-pago', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({
        pago_id: pagoId,
        accion: 'pagar',
        fecha_pagada: fecha || undefined,
        metodo,
        cuenta: cuenta || undefined,
        referencia: ref || undefined,
        monto_pagado: montoPagado,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo marcar el pago');
    if (data.solicitud_estado_cambio === 'pagado') {
      showToast('Pago registrado — la solicitud quedó totalmente pagada', 'success');
    } else {
      showToast('Pago registrado', 'success');
    }
    // Comprobante OPCIONAL: si se eligió archivo, súbelo después de marcar el pago.
    // Si la subida falla, avisa pero NO se revierte el pago (ya quedó registrado).
    const fileInput = document.getElementById('sp-pago-comprob-' + pagoId);
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (file) {
      try {
        await _spSubirComprobantePago(pagoId, file);
        showToast('Comprobante adjuntado', 'success');
      } catch (e) {
        showToast('Pago registrado, pero el comprobante no se subió: ' + e.message, 'error');
      }
    }
    await _spRefrescarPlanYLista(solicitudId, data.solicitud_estado);
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar pago'; }
  }
}

// Lee un File a base64 (sin el prefijo data:...;base64,).
function _spLeerArchivoBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

// Sube el comprobante de un pago vía la función con service_role (el admin no
// tiene sesión de Supabase). Valida tipo/tamaño en cliente antes de mandar.
async function _spSubirComprobantePago(pagoId, file) {
  const MAX = 4 * 1024 * 1024;
  const OK_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!OK_MIME.includes(file.type)) throw new Error('Tipo no permitido (usa JPG, PNG, WEBP o PDF)');
  if (file.size > MAX) throw new Error('El archivo es muy grande, súbelo más liviano (máx 4 MB)');
  const file_base64 = await _spLeerArchivoBase64(file);
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const r = await khAdminFetch('/.netlify/functions/admin-subir-comprobante-pago', {
    method: 'POST',
    headers: _spAdminHeaders(),
    body: JSON.stringify({ pago_id: pagoId, file_base64, mime: file.type, ext }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'No se pudo subir el comprobante');
  return data;
}

// Abre el comprobante de un pago en pestaña nueva (signed url on-demand, igual
// que el del separo). El bucket es privado: pedimos la firma cada vez.
async function verComprobantePagoSP(pagoId) {
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-pago-comprobante', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ pago_id: pagoId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo obtener el comprobante');
    window.open(data.signed_url, '_blank', 'noopener');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function revertirPagoSP(solicitudId, pagoId) {
  if (!confirm('¿Revertir este pago? Volverá a "pendiente" y se borrarán método, referencia y fecha de pago.')) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-marcar-pago', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ pago_id: pagoId, accion: 'revertir' }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo revertir el pago');
    if (data.solicitud_estado_cambio === 'en_pagos') {
      showToast('Pago revertido — la solicitud volvió a "En pagos"', 'success');
    } else {
      showToast('Pago revertido', 'success');
    }
    await _spRefrescarPlanYLista(solicitudId, data.solicitud_estado);
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// Refresca la sección del plan (re-fetch) y la lista de fondo. estadoSolicitud
// es el estado ya reconciliado por el backend, para la lógica de "sin plan".
async function _spRefrescarPlanYLista(solicitudId, estadoSolicitud) {
  await cargarPlanPagosSP(solicitudId, estadoSolicitud);
  _spRefrescarLista();
  // Si el plan se está viendo desde el modal de la pestaña Pagos (Fase 3),
  // refresca también su tabla para que Total/Abonado/Resta queden al día.
  const cob = document.getElementById('modal-cobranza-plan');
  if (cob && cob.classList.contains('open')) loadPagos();
}

// ═══════════════════════════════════════════════════════════════
// PLAN DE PAGOS (Fase 2.3a) — generación automática al aprobar
//
// Bloque AUTOCONTENIDO. getQuincenas / getPagosManuales son COPIAS fieles de
// rol.html (NO se modificó rol.html). Cuando el admin cambia el estado de una
// solicitud a 'en_pagos', _spCalcularPlanPagos arma el plan (separo + quincenas)
// a partir de precio_total / monto_separo de la solicitud + el evento en
// _contratosEVCache (ds, diasAntes, multifecha). El plan se persiste vía
// admin-generar-plan-pagos ANTES de flipear el estado (generar-primero).
// ═══════════════════════════════════════════════════════════════

// [COT-FIX-2] Gemelo con nombre del default de index.html/_lib/precio-zona/rol.
// Cuatro runtimes que no pueden importarse entre sí; el arnés los carea.
const SEPARO_CHEAP_DEFAULT = 1000;

const _SP_MESES = {'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};

// YYYY-MM-DD en hora local (sin desfase de zona horaria de toISOString).
function _spYmd(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// ── COPIA fiel de rol.html: getPagosManuales (override por subfecha) ──────
function _spGetPagosManuales(ev, fi, fromDate) {
  if (!ev || !ev.multifecha || fi == null) return null;
  var mf = ev.multifecha[fi];
  if (!mf || !Array.isArray(mf.pagos) || mf.pagos.length === 0) return null;
  var sepD = fromDate || new Date();
  var list = mf.pagos.map(function(ds) {
    var d = new Date(ds + 'T12:00:00');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return { lbl: d.getDate() + ' de ' + (_SP_MESES[mm] || ''), d: d, e: d };
  });
  return list.filter(function(p) { return p.d >= sepD; });
}

// ── COPIA fiel de rol.html: getQuincenas (quincenas 9-16 y 24-1) ─────────
// [COT-NORMA-2] El rótulo dice la ventana REAL, ya recortada al margen.
function _spLblVentana(ini, fin, mesIni, mesFin) {
  if (ini.getDate() === fin.getDate() && ini.getMonth() === fin.getMonth()) return 'el ' + ini.getDate() + ' de ' + mesIni;
  if (ini.getMonth() === fin.getMonth()) return ini.getDate() + ' al ' + fin.getDate() + ' de ' + mesIni;
  return ini.getDate() + ' ' + mesIni + ' al ' + fin.getDate() + ' de ' + mesFin;
}

function _spGetQuincenas(from, until, max, diasAntes) {
  // [COT-NORMA-2 · 22-ago-2026] EL MARGEN BAJA DE 14 A 5 DÍAS, para todos los
  // eventos: "damos una fecha más de pago y ayuda a la venta" (Memo).
  //
  // ⚠️ Y CON ÉL CAMBIA QUÉ SE COMPARA. Antes el corte miraba el FIN de la
  // ventana (`q1e<=capped`), así que bajar el número NO bastaba: la ventana
  // "24 sep al 1 oct" termina el 1-oct y para natanael (2-oct) seguía fuera
  // incluso con margen de 5 — medido. Ahora se mira el INICIO y la ventana se
  // RECORTA al margen: natanael gana "24 al 27 de Septiembre".
  //
  // Recortar y no dejarla entera es lo que hace honesto el margen: con la
  // ventana completa el rótulo diría "…al 1 de Octubre", un día antes del
  // evento, violando justo los 5 días que se acaban de fijar. Medido sobre los
  // 54 vigentes: ningún pago termina a menos de 5 días del evento.
  var dias = (diasAntes != null && isFinite(diasAntes)) ? diasAntes : 5;
  var result = [];
  var capped = new Date(until.getTime() - dias * 24 * 3600 * 1000);
  // [COT-FIX-2] EL BUFFER DE 5 DÍAS QUE FALTABA. Esta función se anunciaba como
  // "COPIA fiel de rol.html" y no lo era: sin el buffer arrancaba una quincena
  // ANTES y, con el tope de 4 en CHEAP, perdía la última. Resultado medido: le
  // decía al vendedor un pago con fecha a 4 días que el cliente NUNCA vio en el
  // index. 65% de las cotizaciones vivas discrepaban entre esta cara y /rol.
  // Quien separa el 23 NO paga la del 24: su siguiente cobro es la del 9-16.
  var cutoff = new Date(from.getTime() + 5 * 24 * 3600 * 1000);
  var d = new Date(from); d.setDate(1);
  while (d <= capped && result.length < max) {
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var q1s = new Date(d.getFullYear(), d.getMonth(), 9);
    var q1e = new Date(d.getFullYear(), d.getMonth(), 16);
    if (q1s > cutoff && q1s <= capped) {
      var q1f = (q1e > capped) ? capped : q1e;
      result.push({ lbl: _spLblVentana(q1s, q1f, _SP_MESES[mm] || '', _SP_MESES[mm] || ''), d: q1s, e: q1f });
    }
    var q2s = new Date(d.getFullYear(), d.getMonth(), 24);
    var q2e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    if (q2s > cutoff && q2s <= capped) {
      var q2f = (q2e > capped) ? capped : q2e;
      var mn = String((d.getMonth() + 2 > 12 ? 1 : d.getMonth() + 2)).padStart(2, '0');
      result.push({ lbl: _spLblVentana(q2s, q2f, _SP_MESES[mm] || '', _SP_MESES[mn] || ''), d: q2s, e: q2f });
    }
    d.setMonth(d.getMonth() + 1);
  }
  return result.slice(0, max);
}

// Arma el plan de pagos para una solicitud. Devuelve:
//   { ok:true, pagos:[{numero_pago, concepto, monto, fecha_esperada}], evento_nombre }
//   { ok:false, error:'...' }   (p.ej. evento no encontrado en index.html)
//
// Reglas (mismo modelo que rol.html buildPlanState/buildRows):
//   - pago #1 = Separo: monto = monto_separo, fecha = hoy.
//   - resto = precio_total - monto_separo, repartido en quincenas (pagoQ por
//     quincena, la última absorbe el redondeo para cuadrar con precio_total).
//   - si no caben quincenas (evento muy cercano) y resto > 0 → un solo pago
//     'Liquidación' por el resto con fecha = fecha del evento.
async function _spCalcularPlanPagos(s) {
  const evArr = await _fetchEVFromIndex();
  // evento_id del portal = ev.id + ('#' + multifechaIdx) si es multifecha.
  const raw = String(s.evento_id || '');
  const hashIdx = raw.indexOf('#');
  const baseId = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
  const fi = hashIdx >= 0 ? parseInt(raw.slice(hashIdx + 1), 10) : null;
  const ev = (evArr || []).find(e => e && e.id === baseId);
  if (!ev) {
    return { ok: false, error: 'Evento "' + baseId + '" no está en index.html (no se pudo calcular el plan). Verifica que el evento siga publicado e intenta de nuevo.' };
  }

  const precioTotal = Number(s.precio_total) || 0;
  let montoSeparo = Number(s.monto_separo) || 0;
  if (montoSeparo > precioTotal) montoSeparo = precioTotal;
  if (montoSeparo < 0) montoSeparo = 0;
  const resto = precioTotal - montoSeparo;

  // Fecha del evento: para multifecha, la subfecha elegida; si no, ev.ds.
  const dsEffective = (ev.multifecha && fi != null && ev.multifecha[fi] && ev.multifecha[fi].ds)
    ? ev.multifecha[fi].ds
    : ev.ds;
  if (!dsEffective) {
    return { ok: false, error: 'El evento no tiene fecha (ds) — no se puede calcular el plan.' };
  }
  const eventDate = new Date(dsEffective + 'T12:00:00');

  // Separo = hoy (primer pago). Las quincenas se cuentan desde hoy.
  const hoy = new Date();
  const sepD = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12, 0, 0);

  const esCheap = String(s.paquete || '').toUpperCase() === 'CHEAP';
  const maxPagos = esCheap ? 4 : 10;

  const manualPagos = _spGetPagosManuales(ev, fi, sepD);
  const quincenas = manualPagos
    ? manualPagos.slice(0, maxPagos)
    : _spGetQuincenas(sepD, eventDate, maxPagos, ev.diasAntes);

  const pagos = [];
  // Pago #1 — Separo.
  pagos.push({ numero_pago: 1, concepto: 'Separo', monto: Math.round(montoSeparo), fecha_esperada: _spYmd(sepD) });

  if (resto > 0) {
    if (quincenas.length > 0) {
      const pagoQ = Math.ceil(resto / quincenas.length);
      let acc = montoSeparo;
      for (let i = 0; i < quincenas.length; i++) {
        const m = (i === quincenas.length - 1) ? (precioTotal - acc) : pagoQ;
        acc += m;
        pagos.push({
          numero_pago: i + 2,
          concepto: quincenas[i].lbl,
          monto: Math.round(m),
          fecha_esperada: _spYmd(quincenas[i].e),
        });
      }
    } else {
      // Evento demasiado cercano para quincenas: una sola liquidación.
      pagos.push({ numero_pago: 2, concepto: 'Liquidación', monto: Math.round(resto), fecha_esperada: _spYmd(eventDate) });
    }
  }

  return { ok: true, pagos, evento_nombre: s.evento_nombre || ev.a || baseId };
}

function abrirCambiarEstadoSP(solicitudId) {
  const s = _spCache.find(x => x.id === solicitudId);
  if (!s) { showToast('Solicitud no encontrada', 'error'); return; }
  const contenido = `
    <div style="font-size:12px;color:var(--ts);margin-bottom:14px">Cliente <b style="color:var(--ink)">${_spEscape((s.clientes||{}).nombre_completo || '—')}</b> · ${_spEscape(s.evento_nombre || '')}</div>

    <label style="display:block;font-size:10px;letter-spacing:.12em;color:var(--ts);text-transform:uppercase;margin-bottom:4px">Nuevo estado</label>
    <select id="sp-nuevo-estado" style="width:100%;padding:10px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--ink);font-size:14px;margin-bottom:14px">
      <option value="pendiente" ${s.estado==='pendiente'?'selected':''}>Pendiente</option>
      <option value="en_pagos" ${s.estado==='en_pagos'?'selected':''}>En pagos</option>
      <option value="pagado" ${s.estado==='pagado'?'selected':''}>Pagado</option>
      <option value="cancelado" ${s.estado==='cancelado'?'selected':''}>Cancelado</option>
    </select>

    <label style="display:block;font-size:10px;letter-spacing:.12em;color:var(--ts);text-transform:uppercase;margin-bottom:4px">Notas internas (admin)</label>
    <textarea id="sp-nuevas-notas" rows="3" placeholder="Opcional — solo lo ve el admin" style="width:100%;padding:10px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px);color:var(--ink);font-size:13px;resize:vertical;margin-bottom:6px">${_spEscape(s.notas_admin || '')}</textarea>
    <div style="font-size:11px;color:var(--ts);margin-bottom:14px">El cliente nunca ve estas notas. Dejándolas vacías se conservan las anteriores.</div>

    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-ghost" onclick="cerrarModal('sp-cambiar-estado')">Cancelar</button>
      <button class="btn btn-primary" id="sp-btn-guardar-estado" onclick="guardarCambioEstadoSP('${_spEscape(solicitudId)}')">Guardar</button>
    </div>
  `;
  crearModal('sp-cambiar-estado', 'Cambiar estado de la solicitud', contenido);
  document.getElementById('modal-sp-cambiar-estado').querySelector('.modal').style.maxWidth = '480px';
}

// Camino COMPARTIDO de generación del plan (sin duplicar lógica): calcula el
// plan y lo POSTea al backend idempotente; devuelve la respuesta parseada (dataP)
// o lanza con el mensaje de error. Lo usan el aprobar (generar-primero) y el
// botón de recuperación del modal. Cada caller hace su propio toast de éxito.
// [C2-7] `sinCorreo` lo pide SOLO el aprobar: ahí el correo del plan viaja
// dentro del correo único de la aceptación (que además lleva el link de firma).
// El botón de recuperación NO lo pide, y con razón: ese camino existe porque el
// plan falló al aprobar, así que el cliente se quedó sin la tabla y este correo
// es el que se la entrega.
async function _spGenerarPlanPagosBackend(s, solicitudId, sinCorreo) {
  const plan = await _spCalcularPlanPagos(s);
  if (!plan.ok) throw new Error(plan.error || 'No se pudo calcular el plan de pagos');
  const rp = await khAdminFetch('/.netlify/functions/admin-generar-plan-pagos', {
    method: 'POST',
    headers: _spAdminHeaders(),
    body: JSON.stringify({ solicitud_id: solicitudId, pagos: plan.pagos, sin_correo: sinCorreo === true }),
  });
  const dataP = await rp.json();
  if (!rp.ok) {
    // Adjuntamos el detail del backend al Error sin meterlo al mensaje: el aprobar
    // lo ignora (comportamiento intacto) y la recuperación sí lo muestra.
    const err = new Error(dataP.error || 'Error generando el plan de pagos');
    if (dataP.detail) err.detail = dataP.detail;
    throw err;
  }
  return dataP;
}

// Recuperación (piloto): una solicitud puede quedar en_pagos/pagado SIN plan si
// la generación falló al aprobar. Este botón reusa el MISMO camino del aprobar
// (_spGenerarPlanPagosBackend) para generarlo a mano, sin tocar el flujo de
// aprobar. Al terminar refresca #sp-plan.
async function _spGenerarPlanRecuperacion(solicitudId, estadoSolicitud) {
  if (!confirm('¿Generar el plan de pagos de esta solicitud ahora?')) return;
  const s = _spCache.find(x => x.id === solicitudId);
  if (!s) { showToast('No se encontró la solicitud en memoria', 'error'); return; }
  const btn = document.getElementById('sp-gen-plan-btn-' + solicitudId);
  if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
  try {
    const dataP = await _spGenerarPlanPagosBackend(s, solicitudId);
    if (dataP.ya_existia) {
      showToast('El plan de pagos ya existía — no se duplicó', 'success');
    } else {
      const cuotas = dataP.cuotas_insertadas != null ? dataP.cuotas_insertadas : (dataP.pagos || []).length;
      const lug = dataP.lugares_asegurados || 0;
      showToast('Plan generado: ' + cuotas + ' cuotas' + (lug ? ' · ' + lug + ' lugares asegurados' : '') + '.', 'success');
    }
    // Éxito → refrescar el plan (esto re-renderiza #sp-plan y quita el botón).
    cargarPlanPagosSP(solicitudId, estadoSolicitud);
  } catch (e) {
    const detalle = e && e.detail ? ' — ' + e.detail : '';
    showToast('No se pudo generar el plan: ' + e.message + detalle, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Generar plan de pagos'; }
  }
}

async function guardarCambioEstadoSP(solicitudId) {
  const btn = document.getElementById('sp-btn-guardar-estado');
  const estado = document.getElementById('sp-nuevo-estado').value;
  const notasInput = document.getElementById('sp-nuevas-notas').value.trim();
  // Si el textarea quedó igual a las notas previas (autorrellenado), no las re-enviamos
  // para no spamear el campo con su mismo valor. Solo enviamos cuando cambiaron.
  const s = _spCache.find(x => x.id === solicitudId) || {};
  const notasParaEnviar = notasInput && notasInput !== (s.notas_admin || '') ? notasInput : '';

  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    // GENERAR-PRIMERO: si pasamos a 'en_pagos', creamos el plan de pagos ANTES
    // de flipear el estado. Así nunca queda un tour en_pagos sin plan. La
    // función backend es idempotente, así que re-aprobar NO duplica.
    if (estado === 'en_pagos') {
      if (btn) btn.textContent = 'Generando plan…';
      const dataP = await _spGenerarPlanPagosBackend(s, solicitudId, true);
      if (dataP.ya_existia) {
        showToast('El plan de pagos ya existía — no se duplicó', 'success');
      } else {
        // El correo ya no sale de aquí: lo manda la aceptación, con el plan y el
        // link de firma juntos. Se avisa así para que nadie busque un correo que
        // esta llamada no mandó a propósito.
        showToast('Plan de pagos generado (' + (dataP.pagos || []).length + ' pagos). El correo con el plan y el contrato sale al aprobar.', 'success');
      }
      if (btn) btn.textContent = 'Guardando…';
    }

    const r = await khAdminFetch('/.netlify/functions/admin-solicitud-update-estado', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ solicitud_id: solicitudId, nuevo_estado: estado, notas_admin: notasParaEnviar }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error guardando');
    // [Bandeja-T2] Al aprobar (→ en_pagos) la fila deja la bandeja: el toast dice
    // a dónde se fue. Otros cambios (p.ej. cancelar) conservan el toast genérico.
    if (estado === 'en_pagos') {
      showToast('Aprobada ✓ — ahora vive en Capsule → ' + (s.evento_nombre || 'su evento') + ' → Pagos', 'success');
    } else {
      showToast('Solicitud actualizada', 'success');
    }
    cerrarModal('sp-cambiar-estado');
    // [T4] La aprobación YA ESTÁ HECHA aquí. Lo que sigue es el paso opcional
    // "¿Ya mandó su separo?": si truena o el admin le da "Después", la solicitud
    // se queda aprobada igual y el flujo termina como el de siempre.
    if (estado === 'en_pagos') {
      const abrio = await _spAbrirSeparoAlAceptar(solicitudId, s);
      if (abrio) return;        // el paso se encarga de cerrar y refrescar
    }
    cerrarModal('sp-detalle');
    _spRefrescarLista();
  } catch (e) {
    showToast('No se pudo guardar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ═══════════════════════════════════════════════════════════════
// MONTAÑA PAI — Panel Maestro Roshi
// ═══════════════════════════════════════════════════════════════
const MEMO_EMAIL = 'reynosa@conectamexico.mx';
let _mtUsuariosCache = [];
// ID del usuario que estamos editando — fuente de verdad para guardarUsuarioMT.
// Antes usábamos un input hidden value="${u.id}" pero el template literal
// dentro de innerHTML a veces no popula el .value del input. Variable de
// scope = a prueba de eso.
let _mtEditandoUserId = null;
let _mtConfig = {};

// ── Tabs ────────────────────────────────────────────────────
let _mtReportesCache = [];
let _mtReportesFiltro = 'todos';
let _mtDeudasCache = [];
let _mtDeudasFiltro = 'pendientes';

function showMTTab(tab, btn) {
  document.querySelectorAll('#page-montana .gz-filter[id^="mt-tab-btn"]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  ['resumen','pendientes','reportes','deudas','usuarios','strikes','alertas','config'].forEach(t => {
    const el = document.getElementById(`mt-tab-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'reportes')   loadMTReportes();
  if (tab === 'pendientes') loadMTPendientes();
  if (tab === 'deudas')     loadMTDeudas();
}

async function loadMontana() {
  await Promise.all([loadMTResumen(), loadMTUsuarios(), loadMTStrikes(), loadMTAlertas(), loadMTConfig()]);
}

async function loadMTReportes() {
  const list = document.getElementById('mt-reportes-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando reportes…</div>';
  try {
    _mtReportesCache = await khReportes.listar({ limit: 100 }); // [sec-reportes]
    // Join eventos y coordis
    const eIds = [...new Set(_mtReportesCache.map(r=>r.evento_id).filter(Boolean))];
    const uIds = [...new Set(_mtReportesCache.map(r=>r.coordi_id).filter(Boolean))];
    const [evs, users] = await Promise.all([
      eIds.length ? khEventosMeta.porSlugs(eIds) : [], // [sec-eventos]
      uIds.length ? khUsuarios.listar({ ids: uIds }) : [], // [sec-usuarios]
    ]);
    const evMap = Object.fromEntries(evs.map(e=>[e.slug,e]));
    const uMap  = Object.fromEntries(users.map(u=>[u.id,u]));
    _mtReportesCache = _mtReportesCache.map(r=>({...r, _evento:evMap[r.evento_id]||null, _coordi:uMap[r.coordi_id]||null}));
    renderMTReportes(_mtReportesCache, _mtReportesFiltro);
  } catch(e) { list.innerHTML=`<div class="alert alert-error">${e.message}</div>`; }
}

function filtrarMTReportes(status, btn) {
  _mtReportesFiltro = status;
  document.querySelectorAll('#mt-tab-reportes .gz-filter[id^="mtr-fil"]').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMTReportes(_mtReportesCache, status);
}

function renderMTReportes(lista, filtro) {
  const list = document.getElementById('mt-reportes-list');
  const filtrada = filtro==='todos' ? lista : lista.filter(r=>r.status===filtro);
  if (!filtrada.length) {
    list.innerHTML='<div class="empty-state"><div class="empty-icon">·</div>Sin reportes'+( filtro==='todos'?'':' con este estado')+'</div>';
    return;
  }
  const statusInfo = {
    borrador:      { label:'Borrador',           color:'var(--ts)',    icon:'⎘' },
    enviado:       { label:'Pendiente revisión',color:'var(--gold)', icon:'⏳' },
    rechazado:     { label:'Rechazado',         color:'var(--red)',  icon:'✕' },
    aprobado_popo: { label:'En revisión Roshi', color:'var(--blue)', icon:'<svg class="ic"><use href="#ic-lupa"/></svg>' },
    aprobado_memo: { label:'Aprobado',           color:'var(--green)',icon:'✓' },
  };
  list.innerHTML = filtrada.map(r => {
    const s = statusInfo[r.status]||{label:r.status,color:'var(--ts)',icon:'<svg class="ic"><use href="#ic-documento"/></svg>'};
    const ev = r._evento;
    const coo = r._coordi;
    const dif = r.diferencia||0;
    const difColor = dif>=0?'var(--green)':'var(--red)';
    const difLabel = dif>=0?`Sobró ${formatMXN(Math.abs(dif))}`:`Debe ${formatMXN(Math.abs(dif))}`;
    const rol = currentUser?.rol;
    let btns = '';
    if (['maestro_roshi','bulma'].includes(rol)) {
      if (r.status==='enviado') {
        btns = `<button class="btn btn-primary btn-sm" onclick="mtAprobarReporte('${r.id}','enviado')">✓ Aprobar directo</button>
                <button class="btn btn-red btn-sm" onclick="mtRechazarReporte('${r.id}')">✗ Rechazar</button>`;
      } else if (r.status==='aprobado_popo') {
        btns = `<button class="btn btn-primary btn-sm" onclick="mtAprobarReporte('${r.id}','aprobado_popo')">✓ Aprobar definitivo</button>
                <button class="btn btn-red btn-sm" onclick="mtRechazarReporte('${r.id}')">✗ Rechazar</button>`;
      }
    }
    return `<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${s.color};border-radius:var(--radius);padding:16px 20px;margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px">
        <div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:700">${_esfEsc(ev?ev.nombre:(r.evento_id||'—'))}</div>
          <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ts);margin-top:2px">
            ${coo?_esfEsc(coo.nombre)+' · ':''}<span style="color:${s.color}">${s.icon} ${s.label}</span>
            ${ev?' · '+new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}):''}
          </div>
          ${r.rechazo_motivo?`<div style="margin-top:6px;font-size:11px;padding:5px 10px;background:rgba(255,68,68,.08);border-left:2px solid var(--red);color:var(--red)">Motivo rechazo: ${_esfEsc(r.rechazo_motivo)}</div>`:''}
        </div>
        <div style="display:flex;gap:12px;text-align:right">
          <div><div style="font-size:10px;color:var(--ts)">ENTREGADO</div><div style="font-family:'Zen Dots',sans-serif;font-size:16px;color:var(--gold)">${formatMXN(r.dinero_recibido||0)}</div></div>
          <div><div style="font-size:10px;color:var(--ts)">GASTADO</div><div style="font-family:'Zen Dots',sans-serif;font-size:16px">${formatMXN(r.total_gastado||0)}</div></div>
          <div><div style="font-size:10px;color:var(--ts)">DIFERENCIA</div><div style="font-family:'Zen Dots',sans-serif;font-size:16px;color:${difColor}">${difLabel}</div></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px">
        <button class="btn btn-ghost btn-sm" onclick="mtVerDetalleReporte('${r.id}')" style="font-family:'JetBrains Mono',monospace;font-size:10px">VER DETALLE ↓</button>
        ${btns}
        <button class="btn btn-red btn-sm" onclick="mtEliminarReporte('${r.id}')" style="font-size:10px;opacity:.6" title="Eliminar reporte">✕</button>
      </div>
      <!-- Detalle expandible -->
      <div id="mt-rep-det-${r.id}" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)"></div>
    </div>`;
  }).join('');
}

function mtVerDetalleReporte(id) {
  const el = document.getElementById(`mt-rep-det-${id}`);
  if (!el) return;
  if (el.style.display !== 'none') { el.style.display='none'; return; }
  const r = _mtReportesCache.find(x=>x.id===id);
  if (!r) return;
  const kits   = r.kits_detalle   ? (typeof r.kits_detalle==='string'   ? JSON.parse(r.kits_detalle)   : r.kits_detalle)   : [];
  const gastos = r.gastos_detalle ? (typeof r.gastos_detalle==='string' ? JSON.parse(r.gastos_detalle) : r.gastos_detalle) : [];
  const coo = r._coordi || {};
  const ev  = r._evento || {};

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;flex-wrap:wrap">
      <!-- Info coordi -->
      <div>
        <div class="k-mono" style="margin-bottom:10px">// COORDINADOR</div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--bg3);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center">
            ${coo.foto_url?`<img src="${_urlSegura(coo.foto_url)}" style="width:100%;height:100%;object-fit:cover">`:`<span style="font-family:'Zen Dots',sans-serif;font-size:13px;color:var(--orange)">${_esfEsc((coo.nombre||'?')[0])}</span>`}
          </div>
          <div>
            <div style="font-weight:700;font-size:15px">${_esfEsc(coo.nombre||'—')}</div>
            <div style="font-size:11px;color:var(--ts)">${_esfEsc(coo.correo||coo.username||'')}</div>
            <div style="font-size:11px;color:var(--ts)">${_esfEsc(coo.celular||'')}</div>
          </div>
        </div>
        ${r.cuenta_bancaria_coordi?`<div style="margin-top:10px;font-size:11px;padding:6px 10px;background:rgba(255,68,68,.06);border-left:2px solid var(--red);border-radius:4px">Cuenta: <strong>${_esfEsc(r.cuenta_bancaria_coordi)}</strong></div>`:''}
      </div>
      <!-- Info evento -->
      <div>
        <div class="k-mono" style="margin-bottom:10px">// EVENTO</div>
        <div style="font-weight:700;font-size:15px">${_esfEsc(ev.nombre||'—')}</div>
        <div style="font-size:12px;color:var(--ts)">${ev.artista?_esfEsc(ev.artista)+' · ':''}${_esfEsc(ev.ciudad||'')}</div>
        <div style="font-size:12px;color:var(--ts)">${ev.fecha?new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):''}</div>
      </div>
    </div>

    <!-- Kits -->
    ${kits.length ? `
    <div style="margin-top:16px">
      <div class="k-mono" style="margin-bottom:10px">// KITS</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Pieza</th><th>Sacados</th><th>Sobran</th><th>Recibido</th></tr></thead>
          <tbody>${kits.map(k=>`<tr>
            <td style="font-weight:600">${_esfEsc(k.pieza_nombre||k.pieza_id||'—')}</td>
            <td>${k.cantidad_sacada||0}</td>
            <td>${k.cantidad_sobrante||0}</td>
            <td style="color:${k.recibido?'var(--green)':'var(--ts)'}">${k.recibido?'✓ Recibido':'Pendiente'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : '<div style="margin-top:12px;font-size:11px;color:var(--ts);font-family:JetBrains Mono,monospace">// sin kits registrados</div>'}

    <!-- Gastos -->
    ${gastos.length ? `
    <div style="margin-top:16px">
      <div class="k-mono" style="margin-bottom:10px">// GASTOS</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Concepto</th><th style="text-align:right">Monto</th></tr></thead>
          <tbody>${gastos.map(g=>`<tr><td>${_esfEsc(g.concepto||'—')}</td><td style="text-align:right;font-weight:600">${formatMXN(g.monto||0)}</td></tr>`).join('')}
          <tr style="border-top:2px solid var(--border)"><td style="font-weight:700">TOTAL</td><td style="text-align:right;font-weight:700;font-family:'Zen Dots',sans-serif">${formatMXN(r.total_gastado||0)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>` : '<div style="margin-top:12px;font-size:11px;color:var(--ts);font-family:JetBrains Mono,monospace">// sin gastos registrados</div>'}

    ${r.notas?`<div style="margin-top:12px;padding:10px 14px;background:var(--bg3);border-left:2px solid var(--border2);font-size:12px;color:var(--ts)">${_esfEsc(r.notas)}</div>`:''}
  `;
  el.style.display = 'block';
}

// ── PENDIENTES (cuenta regresiva) ────────────────────────────
async function loadMTPendientes() {
  const el = document.getElementById('mt-pendientes-content');
  if (!el) return;
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const ahora = new Date();
    const [reportes, eventosCoordi] = await Promise.all([
      khReportes.listar({ estado: 'aprobado_memo' }), // [sec-reportes]
      khAsignaciones.listar({ status: 'aceptado' }), // [sec-coordi]
    ]);

    // Cargar eventos y usuarios
    const eIds = [...new Set([...reportes.map(r=>r.evento_id), ...eventosCoordi.map(e=>e.evento_id)].filter(Boolean))];
    const uIds = [...new Set([...reportes.map(r=>r.coordi_id), ...eventosCoordi.map(e=>e.coordi_id)].filter(Boolean))];
    const [evs, usuarios] = await Promise.all([
      eIds.length ? khEventosMeta.porSlugs(eIds) : [], // [sec-eventos]
      uIds.length ? khUsuarios.listar({ ids: uIds }) : [], // [sec-usuarios]
    ]);
    const evMap = Object.fromEntries(evs.map(e=>[e.slug,e]));
    const uMap  = Object.fromEntries(usuarios.map(u=>[u.id,u]));

    // Helpers — misma lógica que el cron check-strikes-diario.js
    // último día del evento = fecha_fin || fecha; contador empieza 00:00 MX día siguiente
    const _ultimoDia = (ev) => ev && (ev.fecha_fin || ev.fecha);
    const _inicioContador = (ev) => {
      const u = _ultimoDia(ev);
      if (!u) return null;
      const d = new Date(u + 'T00:00:00-06:00'); // MX = UTC-6 sin DST
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    };
    const _deadlineReporte = (ev) => {
      const s = _inicioContador(ev);
      return s ? new Date(s.getTime() + 48*60*60*1000) : null;
    };
    const _deadlineDevol = (ev) => {
      const s = _inicioContador(ev);
      return s ? new Date(s.getTime() + 5*24*60*60*1000) : null;
    };
    // Solo Guerreros Z reciben strikes automáticos — excluir creadoras y admins.
    const _aplicaStrike = (u) => !!u && u.rol !== 'cc' && !['maestro_roshi','bulma'].includes(u.rol);

    // ── 1) Reportes pendientes de levantar (evento ya pasó) ──
    const reportesPendientes = [];
    for (const ec of eventosCoordi) {
      const ev = evMap[ec.evento_id];
      if (!ev || !ev.fecha) continue;
      const u = uMap[ec.coordi_id];
      if (!_aplicaStrike(u)) continue;
      const deadline = _deadlineReporte(ev);
      if (!deadline) continue;
      // Solo eventos ya iniciados (no futuros)
      const fechaIni = new Date(ev.fecha + 'T12:00:00');
      if (fechaIni > ahora) continue;
      // ¿ya hay reporte enviado?
      const yaTieneReporte = reportes.some(r => r.evento_id===ec.evento_id && r.coordi_id===ec.coordi_id) ||
        // [sec-reportes]
        await khReportes.listar({ evento_id: ec.evento_id, coordi_id: ec.coordi_id, estado: 'enviado,aprobado_popo,aprobado_memo' }).then(r=>r.length>0).catch(()=>false);
      if (yaTieneReporte) continue;
      const horasRestantes = (deadline - ahora) / (1000*60*60);
      reportesPendientes.push({
        coordi: u,
        evento: ev,
        horasRestantes,
        vencido: horasRestantes < 0,
      });
    }

    // ── 2) Devoluciones pendientes ──
    const devolPendientes = [];
    for (const r of reportes) {
      if (!r.fecha_aprobado) continue;
      const kits = r.kits_detalle ? (typeof r.kits_detalle==='string'?JSON.parse(r.kits_detalle):r.kits_detalle) : [];
      const sobrantes = kits.filter(k => (k.cantidad_sobrante||0) > 0 && !k.recibido);
      if (!sobrantes.length) continue;
      const u = uMap[r.coordi_id];
      if (!_aplicaStrike(u)) continue;
      const ev = evMap[r.evento_id];
      const deadline = _deadlineDevol(ev);
      if (!deadline) continue;
      const diasRestantes = (deadline - ahora) / (1000*60*60*24);
      devolPendientes.push({
        coordi: u,
        evento: ev,
        sobrantes,
        diasRestantes,
        vencido: diasRestantes < 0,
        reporteId: r.id,
      });
    }

    el.innerHTML = `
      <div style="margin-bottom:24px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--ts);margin-bottom:12px">// REPORTES PENDIENTES (límite 48 hrs)</div>
        ${reportesPendientes.length ? reportesPendientes.map(p => {
          const col = p.vencido ? 'var(--red)' : p.horasRestantes < 12 ? 'var(--orange)' : 'var(--gold)';
          const lbl = p.vencido ? `<svg class="ic"><use href="#ic-alerta"/></svg> VENCIDO HACE ${Math.floor(Math.abs(p.horasRestantes))}h` : `${Math.floor(p.horasRestantes)}h restantes`;
          return `<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${col};border-radius:var(--radius);padding:12px 18px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div>
              <div style="font-weight:700;font-size:14px">${_esfEsc(p.coordi?.nombre||'—')}</div>
              <div style="font-size:11px;color:var(--ts);font-family:'JetBrains Mono',monospace">${_esfEsc(p.evento?.nombre||'')} · ${p.evento?.fecha?new Date(p.evento.fecha+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short'}):''}</div>
            </div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${col};font-weight:700">${lbl}</div>
          </div>`;
        }).join('') : '<div style="font-size:12px;color:var(--green)">✓ Sin reportes pendientes</div>'}
      </div>

      <div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--ts);margin-bottom:12px">// SOBRANTES POR DEVOLVER (límite 5 días)</div>
        ${devolPendientes.length ? devolPendientes.map(d => {
          const col = d.vencido ? 'var(--red)' : d.diasRestantes < 1 ? 'var(--orange)' : 'var(--gold)';
          const lbl = d.vencido ? `<svg class="ic"><use href="#ic-alerta"/></svg> VENCIDO HACE ${Math.floor(Math.abs(d.diasRestantes))}d` : `${Math.ceil(d.diasRestantes)}d restantes`;
          return `<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${col};border-radius:var(--radius);padding:12px 18px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
              <div>
                <div style="font-weight:700;font-size:14px">${_esfEsc(d.coordi?.nombre||'—')}</div>
                <div style="font-size:11px;color:var(--ts);font-family:'JetBrains Mono',monospace">${_esfEsc(d.evento?.nombre||'')}</div>
              </div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${col};font-weight:700">${lbl}</div>
            </div>
            <div style="margin-top:8px;font-size:11px;color:var(--ts)">Pendiente: ${d.sobrantes.map(s=>`${_esfEsc(s.pieza_nombre||'kit')} ×${Number(s.cantidad_sobrante)||0}`).join(', ')}</div>
          </div>`;
        }).join('') : '<div style="font-size:12px;color:var(--green)">✓ Sin devoluciones pendientes</div>'}
      </div>`;
  } catch(e) { el.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

// ── DEUDAS ───────────────────────────────────────────────────
async function loadMTDeudas() {
  const list = document.getElementById('mt-deudas-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    _mtDeudasCache = await khCoordi.deudasListar({ limit: 200 }).catch(()=>[]); // [sec-sensibles]
    const uIds = [...new Set(_mtDeudasCache.map(d=>d.coordi_id).filter(Boolean))];
    const eIds = [...new Set(_mtDeudasCache.map(d=>d.evento_id).filter(Boolean))];
    const [usuarios, eventos] = await Promise.all([
      uIds.length ? khUsuarios.listar({ ids: uIds }) : [], // [sec-usuarios]
      eIds.length ? khEventosMeta.porSlugs(eIds) : [], // [sec-eventos]
    ]);
    const uMap = Object.fromEntries(usuarios.map(u=>[u.id,u]));
    const evMap = Object.fromEntries(eventos.map(e=>[e.slug,e]));
    _mtDeudasCache = _mtDeudasCache.map(d=>({...d, _coordi:uMap[d.coordi_id], _evento:evMap[d.evento_id]}));
    renderMTDeudas(_mtDeudasCache, _mtDeudasFiltro);
  } catch(e) { list.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

function filtrarMTDeudas(filtro, btn) {
  _mtDeudasFiltro = filtro;
  document.querySelectorAll('#mt-tab-deudas .gz-filter[id^="mtd-fil"]').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMTDeudas(_mtDeudasCache, filtro);
}

function renderMTDeudas(lista, filtro) {
  const list = document.getElementById('mt-deudas-list');
  let filtrada = lista;
  if (filtro === 'pendientes') filtrada = lista.filter(d=>!d.pagado);
  if (filtro === 'pagadas')    filtrada = lista.filter(d=>d.pagado);

  // Total pendiente
  const totalPend = lista.filter(d=>!d.pagado).reduce((s,d)=>s+(d.monto||0), 0);

  if (!filtrada.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">·</div>Sin deudas ${filtro==='pendientes'?'pendientes':filtro}</div>`;
    return;
  }

  // Agrupar por coordi
  const porCoordi = {};
  filtrada.forEach(d => {
    const k = d.coordi_id;
    if (!porCoordi[k]) porCoordi[k] = { coordi: d._coordi, deudas: [], total: 0 };
    porCoordi[k].deudas.push(d);
    if (!d.pagado) porCoordi[k].total += (d.monto||0);
  });

  list.innerHTML = `
    <div style="background:rgba(255,68,68,.06);border:1px solid rgba(255,68,68,.2);border-radius:var(--r-sm,8px);padding:14px 18px;margin-bottom:16px">
      <div style="font-size:11px;color:var(--ts);font-family:'JetBrains Mono',monospace;letter-spacing:.1em">// TOTAL PENDIENTE DE COBRO</div>
      <div style="font-family:'Zen Dots',sans-serif;font-size:24px;color:var(--red);margin-top:4px">${formatMXN(totalPend)}</div>
    </div>
    ${Object.values(porCoordi).map(g => `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 18px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:16px">${_esfEsc(g.coordi?.nombre||'—')}</div>
            <div style="font-size:11px;color:var(--ts);font-family:'JetBrains Mono',monospace">${_esfEsc(g.coordi?.correo||'')}</div>
          </div>
          <div style="font-family:'Zen Dots',sans-serif;font-size:18px;color:var(--red)">${formatMXN(g.total)}</div>
        </div>
        ${g.deudas.map(d => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);flex-wrap:wrap;gap:8px">
            <div style="flex:1;min-width:200px">
              <div style="font-size:13px">${_esfEsc(d.concepto)}</div>
              <div style="font-size:10px;color:var(--ts);font-family:'JetBrains Mono',monospace">${_esfEsc(d._evento?.nombre||'')} · ${_tsToDate(d.created_at)?.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Monterrey'})||'—'}</div>
            </div>
            <div style="font-family:'Zen Dots',sans-serif;font-size:14px;color:${d.pagado?'var(--green)':'var(--red)'}">${formatMXN(d.monto)}</div>
            <div style="display:flex;gap:6px">
              ${!d.pagado ? `<button class="btn btn-primary btn-sm" onclick="marcarDeudaPagada('${d.id}')" style="font-size:10px">✓ Pagada</button>` : '<span style="font-size:11px;color:var(--green)">✓ Pagada</span>'}
              <button class="btn btn-red btn-sm" onclick="eliminarDeuda('${d.id}')" style="font-size:10px;opacity:.5">✕</button>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('')}`;
}

async function marcarDeudaPagada(id) {
  if (!confirm('¿Marcar esta deuda como pagada?')) return;
  try {
    await khCoordi.deudasMarcarPagada(id); // [sec-sensibles]
    await loadMTDeudas();
  } catch(e) { alert(e.message); }
}

async function eliminarDeuda(id) {
  if (!confirm('¿Eliminar esta deuda?')) return;
  try {
    await khCoordi.deudasEliminar(id); // [sec-sensibles]
    await loadMTDeudas();
  } catch(e) { alert(e.message); }
}

async function mtAprobarReporte(id, desdeStatus) {
  if (!confirm('¿Aprobar este reporte? Se descontará el stock de Torre de Karin.')) return;
  try {
    const r = _mtReportesCache.find(x=>x.id===id);
    await ejecutarAprobacionFinal(id, r);
    await loadMTReportes();
    if (document.getElementById('page-inventario')?.classList.contains('active')) loadInventario();
  } catch(e) { alert(e.message); }
}

async function mtEliminarReporte(id) {
  if (!confirm('¿Eliminar este reporte permanentemente? Esto no se puede deshacer.')) return;
  try {
    await khReportes.eliminar(id); // [sec-reportes]
    await loadMTReportes();
  } catch(e) { alert('Error: ' + e.message); }
}

async function mtRechazarReporte(id) {
  const motivo = prompt('Motivo del rechazo:');
  if (!motivo) return;
  try {
    await khReportes.rechazar(id, motivo); // [sec-reportes]
    const r = _mtReportesCache.find(x=>x.id===id);
    await enviarAlertaMemo('reporte_rechazado', { coordi: r?._coordi?.nombre||'Coordi', motivo });
    await loadMTReportes();
  } catch(e) { alert(e.message); }
}

// ── RESUMEN ──────────────────────────────────────────────────
async function loadMTResumen() {
  const el = document.getElementById('mt-resumen-content');
  if (!el) return;
  try {
    const [usuarios, eventos, reportes, asigs] = await Promise.all([
      khUsuarios.listar({ activos: true }), // [sec-usuarios]
      khEventos.listar({ limit: 5 }), // [sec-eventos]
      khReportes.listar({ estado: 'enviado,aprobado_popo' }), // [sec-reportes]
      khAsignaciones.listar({ status: 'pendiente' }), // [sec-coordi]
    ]);
    const porRol = {};
    usuarios.forEach(u => { porRol[u.rol] = (porRol[u.rol]||0)+1; });
    const rolLabels = { maestro_roshi:'Maestro Roshi', bulma:'Bulma', mister_popo:'Maestro Karin', coordinador:'Coordi', cc:'CC' };

    el.innerHTML = `
      <!-- Métricas rápidas -->
      <div class="metrics-grid" style="margin-bottom:24px">
        <div class="metric"><div class="metric-label">Usuarios activos</div><div class="metric-value">${usuarios.length}</div></div>
        <div class="metric"><div class="metric-label">Reportes pendientes</div><div class="metric-value" style="color:${reportes.length?'var(--gold)':'var(--green)'}">${reportes.length}</div></div>
        <div class="metric"><div class="metric-label">Asignaciones sin respuesta</div><div class="metric-value" style="color:${asigs.length?'var(--gold)':'var(--green)'}">${asigs.length}</div></div>
      </div>

      <!-- Usuarios por rol -->
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px;margin-bottom:16px">
        <div class="k-mono" style="margin-bottom:14px">// EQUIPO POR ROL</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${Object.entries(porRol).map(([rol,count]) =>
            `<div style="text-align:center;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:10px 16px;min-width:90px">
              <div style="font-family:'Zen Dots',sans-serif;font-size:22px;color:var(--orange)">${count}</div>
              <div style="font-size:10px;color:var(--ts)">${rolLabels[rol]||rol}</div>
            </div>`
          ).join('')}
        </div>
      </div>

      <!-- Próximos eventos -->
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px">
        <div class="k-mono" style="margin-bottom:14px">// PRÓXIMOS EVENTOS</div>
        ${eventos.length ? eventos.map(e => {
          const f = new Date(e.fecha+'T12:00:00');
          const hoy = new Date(); hoy.setHours(0,0,0,0);
          const dias = Math.ceil((f-hoy)/(1000*60*60*24));
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
            <div style="font-weight:600;font-size:14px">${_esfEsc(e.nombre)}</div>
            <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:${dias<=7?'var(--orange)':'var(--ts)'}">
              ${dias > 0 ? `en ${dias} día${dias!==1?'s':''}` : dias===0 ? '¡HOY!' : 'pasado'}
            </div>
          </div>`;
        }).join('') : '<div style="color:var(--ts);font-size:12px">Sin eventos próximos</div>'}
      </div>`;
  } catch(e) { el.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

// ── USUARIOS ─────────────────────────────────────────────────
async function loadMTUsuarios() {
  const list = document.getElementById('mt-usuarios-list');
  const countEl = document.getElementById('mt-user-count');
  if (!list) return;
  list.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    _mtUsuariosCache = await khUsuarios.listar({ orden: 'nombre' }); // [sec-usuarios]
    if (countEl) countEl.textContent = `${_mtUsuariosCache.length} usuarios`;
    renderMTUsuarios(_mtUsuariosCache);
  } catch(e) { list.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

function filtrarMTUsuarios() {
  const q = document.getElementById('mt-user-search')?.value.toLowerCase() || '';
  const filtrado = _mtUsuariosCache.filter(u =>
    u.nombre?.toLowerCase().includes(q) || u.correo?.toLowerCase().includes(q) || u.rol?.includes(q)
  );
  renderMTUsuarios(filtrado);
}

function renderMTUsuarios(lista) {
  const list = document.getElementById('mt-usuarios-list');
  if (!lista.length) { list.innerHTML='<div class="empty-state">Sin resultados</div>'; return; }
  const rolLabels = { maestro_roshi:'Maestro Roshi', bulma:'Bulma', mister_popo:'Maestro Karin', coordinador:'Coordinador', cc:'CC' };
  list.innerHTML = lista.map(u => `
    <div style="background:var(--bg2);border:1px solid ${u.activo?'var(--border)':'rgba(255,68,68,.2)'};border-radius:var(--radius);padding:14px 18px;margin-bottom:8px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--bg3);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center">
        ${u.foto_url ? `<img src="${_urlSegura(u.foto_url)}" style="width:100%;height:100%;object-fit:cover">` :
        `<span style="font-family:'Zen Dots',sans-serif;font-size:13px;color:var(--orange)">${_esfEsc((u.nombre||'?')[0])}</span>`}
      </div>
      <div style="flex:1;min-width:140px">
        <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:15px">${_esfEsc(u.nombre||'—')} ${u.activo?'':'<span style="font-size:10px;color:var(--red)">[INACTIVO]</span>'}</div>
        <div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--ts)">${rolLabels[u.rol]||u.rol} · ${_esfEsc(u.correo||u.username||'')}</div>
        ${u.strikes ? `<div style="font-size:10px;color:var(--red);margin-top:2px"><svg class="ic"><use href="#ic-alerta"/></svg> ${u.strikes} strike${u.strikes!==1?'s':''}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="abrirVerComo('${u.id}','${u.rol}')" style="font-size:10px;font-family:'JetBrains Mono',monospace"><svg class="ic"><use href="#ic-ojo"/></svg> Ver como</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirEditarUsuarioMT('${u.id}')" style="font-size:10px">⎘ Editar</button>
        <button class="btn ${u.activo?'btn-red':'btn-green'} btn-sm" onclick="toggleActivoUsuario('${u.id}',${u.activo})" style="font-size:10px">${u.activo?'Desactivar':'Activar'}</button>
        <button class="btn btn-red btn-sm" onclick="eliminarUsuarioMT('${u.id}','${_attrJs(u.nombre)}','${u.rol}')" style="font-size:10px;opacity:.7" title="Eliminar permanentemente">✕</button>
      </div>
    </div>`).join('');
}

async function eliminarUsuarioMT(id, nombre, rol) {
  // [fix-deluser] La acción segura/primaria es DESACTIVAR (toggleActivoUsuario,
  // reversible). El borrado FÍSICO solo procede si el server confirma que el
  // usuario está 100% limpio; si tiene dependientes, el backend responde 409 y
  // aquí lo explicamos y sugerimos desactivar (nunca borramos en cascada).
  if (['maestro_roshi','bulma'].includes(rol)) {
    alert('No puedes eliminar a Maestro Roshi ni a Bulma desde aquí.');
    return;
  }
  if (!confirm(`¿Eliminar permanentemente a "${nombre}"?\n\nSolo se puede si NO tiene historial (deudas, asignaciones, strikes, reportes, viajeros…). Si tiene, desactívalo en vez de borrarlo. Esta acción no se puede deshacer.`)) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-eliminar-usuario', {
      method: 'POST',
      body: JSON.stringify({ userId: id }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409 && j.motivo === 'tiene_dependientes') {
      // [fix-deluser] Mensaje legible del candado de dependientes.
      const d = j.detalle || {};
      const partes = [];
      if (d.deudas) partes.push(`${d.deudas} deuda${d.deudas!==1?'s':''}${d.deudas_pendientes?` (${d.deudas_pendientes} pendiente${d.deudas_pendientes!==1?'s':''})`:''}`);
      if (d.asignaciones) partes.push(`${d.asignaciones} asignación${d.asignaciones!==1?'es':''}`);
      if (d.strikes) partes.push(`${d.strikes} strike${d.strikes!==1?'s':''}`);
      if (d.reportes) partes.push(`${d.reportes} reporte${d.reportes!==1?'s':''}`);
      if (d.viajeros) partes.push(`${d.viajeros} viajero${d.viajeros!==1?'s':''}`);
      if (d.tours) partes.push(`${d.tours} tour${d.tours!==1?'s':''}`);
      if (d.notificaciones) partes.push(`${d.notificaciones} notificación${d.notificaciones!==1?'es':''}`);
      alert(`No se puede eliminar a "${nombre}": tiene ${partes.join(', ')}.\n\n${j.sugerencia || 'Desactívalo en vez de eliminarlo (conserva su historial).'}`);
      return;
    }
    if (!r.ok || j.ok === false) {
      throw new Error(j.error || ('Error ' + r.status));
    }
    await loadMTUsuarios();
  } catch(e) { alert('Error al eliminar: ' + e.message); }
}

async function toggleActivoUsuario(id, activo) {
  const accion = activo ? 'desactivar' : 'activar';
  if (!confirm(`¿${accion.charAt(0).toUpperCase()+accion.slice(1)} este usuario?`)) return;
  try {
    await khUsuarios.actualizar(id, { activo: !activo }); // [sec-usuarios]
    await loadMTUsuarios();
    // Alerta si se desactiva
    if (activo) await enviarAlertaMemo('usuario_desactivado', { id });
  } catch(e) { alert(e.message); }
}

async function abrirEditarUsuarioMT(id) {
  if (!id) { alert('ID de usuario inválido.'); return; }
  let u = _mtUsuariosCache.find(x => x.id === id);
  // Fallback: si la cache no lo tiene (stale, no cargada), traer de DB.
  if (!u) {
    try {
      u = await khUsuarios.obtener(id); // [sec-usuarios]
    } catch(e) { /* u sigue undefined */ }
  }
  if (!u || !u.id) {
    alert('No se pudo cargar el usuario. Refresca la lista y vuelve a intentar.');
    return;
  }
  // Source of truth para guardarUsuarioMT — no dependemos de un input hidden.
  _mtEditandoUserId = u.id;
  const rolOpts = ['maestro_roshi','bulma','mister_popo','coordinador','cc'];
  const rolLabels = { maestro_roshi:'Maestro Roshi', bulma:'Bulma', mister_popo:'Maestro Karin', coordinador:'Coordinador', cc:'CC' };
  // Tabs extra / bloqueadas actuales
  const permisos = u.permisos_extra || {};
  const tabsExtra = permisos.tabs_extra || [];
  const tabsBloq  = permisos.tabs_bloqueados || [];
  const todasTabs = ['resumen','pagos','eventos','gastos','ventas','inventario','reportes','capsule','equipo','kamisama'];

  document.getElementById('modal-mt-usuario').innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">Editar usuario</div>
        <button class="modal-close" onclick="closeModal('modal-mt-usuario')">×</button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label>Nombre</label>
            <input class="cot-input" id="mtu-nombre" value="${_esfEsc(u.nombre||'')}" style="width:100%">
          </div>
          <div class="form-group">
            <label>Rol</label>
            <select class="cot-input" id="mtu-rol" style="width:100%">
              ${rolOpts.map(r=>`<option value="${r}" ${u.rol===r?'selected':''}>${rolLabels[r]}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Username</label>
            <input class="cot-input" id="mtu-username" value="${_esfEsc(u.username||'')}" style="width:100%">
          </div>
          <div class="form-group">
            <label>Nueva contraseña</label>
            <input class="cot-input" id="mtu-pass" placeholder="Dejar vacío para no cambiar" style="width:100%">
          </div>
        </div>
        <!-- Tabs extra -->
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <div class="k-mono" style="margin-bottom:10px">// PERMISOS EXTRA DE TABS</div>
          <div style="font-size:11px;color:var(--ts);margin-bottom:8px">Tabs adicionales que puede ver (además de las de su rol):</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
            ${todasTabs.map(t=>`<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;padding:5px 10px;border:1px solid var(--border);border-radius:var(--r-sm,8px);background:${tabsExtra.includes(t)?'rgba(255,107,0,.1)':'transparent'}">
              <input type="checkbox" class="mt-tab-extra" value="${t}" ${tabsExtra.includes(t)?'checked':''} style="accent-color:var(--orange)"> ${t}
            </label>`).join('')}
          </div>
          <div style="font-size:11px;color:var(--ts);margin-bottom:8px">Tabs bloqueadas (aunque su rol las tenga):</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${todasTabs.map(t=>`<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;padding:5px 10px;border:1px solid var(--border);border-radius:var(--r-sm,8px);background:${tabsBloq.includes(t)?'rgba(255,68,68,.1)':'transparent'}">
              <input type="checkbox" class="mt-tab-bloq" value="${t}" ${tabsBloq.includes(t)?'checked':''} style="accent-color:var(--red)"> ${t}
            </label>`).join('')}
          </div>
        </div>
        <div id="mtu-alert" style="margin-top:12px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-mt-usuario')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarUsuarioMT()">Guardar</button>
      </div>
    </div>`;
  openModal('modal-mt-usuario');
}

async function guardarUsuarioMT() {
  const alertEl = document.getElementById('mtu-alert');
  const showErr = (msg) => { if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${msg}</div>`; };

  // Source of truth: variable de scope (no input hidden — innerHTML no setea value confiable)
  const id = _mtEditandoUserId;
  if (!id) { showErr('Error interno: no se identificó el usuario. Cierra el modal y vuelve a abrirlo.'); return; }

  const nombre   = document.getElementById('mtu-nombre')?.value.trim();
  const rol      = document.getElementById('mtu-rol')?.value;
  if (!nombre) { showErr('El nombre es obligatorio.'); return; }
  if (!rol)    { showErr('El rol es obligatorio.'); return; }

  const username = document.getElementById('mtu-username')?.value.trim();
  const pass     = document.getElementById('mtu-pass')?.value.trim();
  const tabsExtra = Array.from(document.querySelectorAll('.mt-tab-extra:checked')).map(c=>c.value);
  const tabsBloq  = Array.from(document.querySelectorAll('.mt-tab-bloq:checked')).map(c=>c.value);
  const body = {
    nombre, rol, username: username||null,
    permisos_extra: { tabs_extra: tabsExtra, tabs_bloqueados: tabsBloq },
  };
  if (pass) body.password = pass; // [sec-usuarios] texto plano; el server lo hashea (bcrypt)
  try {
    await khUsuarios.actualizar(id, body); // [sec-usuarios]
    if (alertEl) alertEl.innerHTML='<div class="alert alert-success">✓ Guardado</div>';
    setTimeout(()=>{ closeModal('modal-mt-usuario'); loadMTUsuarios(); }, 800);
  } catch(e) { showErr(e.message); }
}

// ── VER COMO ROL ─────────────────────────────────────────────
function abrirVerComo(userId, rol) {
  const u = _mtUsuariosCache.find(x=>x.id===userId);
  if (!u) return;
  document.getElementById('modal-mt-vercomo').innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">Ver como: ${_esfEsc(u.nombre)}</div>
        <button class="modal-close" onclick="closeModal('modal-mt-vercomo')">×</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--ts);margin-bottom:16px">Vas a simular la vista del sistema como si fueras <strong style="color:var(--text)">${_esfEsc(u.nombre)}</strong> (${u.rol}). Tu sesión de Maestro Roshi se restaura al salir.</p>
        <div style="background:rgba(255,183,3,.06);border:1px solid rgba(255,183,3,.2);border-radius:var(--r-sm,8px);padding:12px;font-size:11px;color:var(--gold)">
          <svg class="ic"><use href="#ic-alerta"/></svg> Solo es una vista — no puedes hacer cambios que afecten a ${_esfEsc(u.nombre)}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-mt-vercomo')">Cancelar</button>
        <button class="btn btn-primary" onclick="activarVerComo('${userId}')">Entrar como ${_esfEsc(u.nombre)} →</button>
      </div>
    </div>`;
  openModal('modal-mt-vercomo');
}

function activarVerComo(userId) {
  const u = _mtUsuariosCache.find(x=>x.id===userId);
  if (!u) return;
  // Guardar sesión original
  sessionStorage.setItem('_roshi_session_backup', sessionStorage.getItem(SESSION_KEY));
  // Simular usuario
  const fakeSession = { user: { ...u }, expires: Date.now() + 3600000 };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(fakeSession));
  currentUser = u;
  closeModal('modal-mt-vercomo');
  // Mostrar banner de aviso y aplicar permisos
  mostrarBannerVerComo(u.nombre);
  aplicarPermisosUI();
}

function mostrarBannerVerComo(nombre) {
  let banner = document.getElementById('ver-como-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'ver-como-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:rgba(255,183,3,.95);color:#0a0a0f;padding:10px 20px;font-family:JetBrains Mono,monospace;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:space-between;letter-spacing:.05em';
    document.body.appendChild(banner);
  }
  banner.innerHTML = `<span><svg class="ic"><use href="#ic-ojo"/></svg> MODO VISTA — viendo como: ${_esfEsc(nombre.toUpperCase())}</span>
    <button onclick="salirVerComo()" style="background:var(--bg);border:none;padding:6px 14px;border-radius:var(--r-sm,8px);cursor:pointer;font-family:JetBrains Mono,monospace;font-size:11px;font-weight:700">✕ Salir y volver a Roshi</button>`;
}

function salirVerComo() {
  const backup = sessionStorage.getItem('_roshi_session_backup');
  if (backup) {
    sessionStorage.setItem(SESSION_KEY, backup);
    sessionStorage.removeItem('_roshi_session_backup');
    const s = JSON.parse(backup);
    currentUser = s.user;
  }
  const banner = document.getElementById('ver-como-banner');
  if (banner) banner.remove();
  aplicarPermisosUI();
  showPage('montana');
}

// ── STRIKES ──────────────────────────────────────────────────
async function loadMTStrikes() {
  const list = document.getElementById('mt-strikes-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const usuarios = await khUsuarios.listar({ orden: 'strikes' }); // [sec-usuarios]
    const conStrikes = usuarios.filter(u => (u.strikes||0) > 0);
    const sinStrikes = usuarios.filter(u => (u.strikes||0) === 0);
    const rolLabels = { maestro_roshi:'Maestro Roshi', bulma:'Bulma', mister_popo:'Maestro Karin', coordinador:'Coordinador', cc:'CC' };

    list.innerHTML = `
      <div style="margin-bottom:20px">
        <div class="k-mono" style="margin-bottom:12px">// USUARIOS CON STRIKES</div>
        ${conStrikes.length ? conStrikes.map(u => {
          const col = u.strikes >= 3 ? 'var(--red)' : u.strikes >= 2 ? 'var(--orange)' : 'var(--gold)';
          return `<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${col};border-radius:var(--radius);padding:14px 18px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div>
              <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:16px">${_esfEsc(u.nombre)}</div>
              <div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--ts)">${rolLabels[u.rol]||u.rol}</div>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <div style="font-family:'Zen Dots',sans-serif;font-size:28px;color:${col}">${u.strikes}</div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-primary btn-sm" onclick="ponerStrikeManual('${u.id}','${_attrJs(u.nombre)}',${u.strikes})" style="font-size:10px">+ Strike</button>
                <button class="btn btn-ghost btn-sm" onclick="quitarStrike('${u.id}','${_attrJs(u.nombre)}',${u.strikes})" style="font-size:10px">− Quitar</button>
              </div>
            </div>
          </div>`;
        }).join('') : '<div style="font-size:12px;color:var(--green);padding:12px">✓ Nadie tiene strikes</div>'}
      </div>
      <div>
        <div class="k-mono" style="margin-bottom:12px">// PONER STRIKE A CUALQUIER USUARIO</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div class="form-group" style="margin:0">
            <label>Usuario</label>
            <select class="cot-input" id="mt-strike-user" style="min-width:200px">
              <option value="">— Selecciona —</option>
              ${usuarios.filter(u=>u.activo).map(u=>`<option value="${u.id}">${_esfEsc(u.nombre)} (${u.strikes||0} strikes)</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;flex:1;min-width:160px">
            <label>Motivo</label>
            <input class="cot-input" id="mt-strike-motivo" placeholder="Motivo del strike…">
          </div>
          <button class="btn btn-primary" onclick="ponerStrikeDesdePanel()">Aplicar strike</button>
        </div>
        <div id="mt-strike-alert" style="margin-top:8px"></div>
      </div>`;
  } catch(e) { list.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

async function ponerStrikeManual(userId, nombre, strikesActuales) {
  const motivo = prompt(`Motivo del strike para ${nombre}:`);
  if (!motivo) return;
  await aplicarStrike(userId, nombre, strikesActuales, motivo);
}

async function ponerStrikeDesdePanel() {
  const userId = document.getElementById('mt-strike-user')?.value;
  const motivo = document.getElementById('mt-strike-motivo')?.value.trim();
  const alertEl = document.getElementById('mt-strike-alert');
  if (!userId) { alertEl.innerHTML='<div class="alert alert-error">Selecciona un usuario</div>'; return; }
  if (!motivo) { alertEl.innerHTML='<div class="alert alert-error">Ingresa el motivo</div>'; return; }
  const u = _mtUsuariosCache.find(x=>x.id===userId) || {};
  await aplicarStrike(userId, u.nombre||'Usuario', u.strikes||0, motivo);
  alertEl.innerHTML='<div class="alert alert-success">✓ Strike aplicado</div>';
  setTimeout(()=>{ alertEl.innerHTML=''; loadMTStrikes(); }, 1500);
}

async function aplicarStrike(userId, nombre, strikesActuales, motivo) {
  const nuevos = strikesActuales + 1;
  try {
    await khUsuarios.actualizar(userId, { strikes: nuevos }); // [sec-usuarios]
    // Log del strike
    await khCoordi.strikeCrear(userId, 'strike_manual', motivo).catch(()=>{}); // [sec-sensibles] por_quien lo pone el backend
    // Email al usuario
    const u = await khUsuarios.obtener(userId); // [sec-usuarios]
    const email = u?.correo_notif || u?.correo;
    if (email) {
      await enviarEmailSistema(email, `⚠️ Strike registrado — Kamehouse`,
        `<p>Hola <strong>${_esfEsc(nombre)}</strong>,</p>
         <p>Se ha registrado un strike en tu cuenta.</p>
         <p><strong>Motivo:</strong> ${_esfEsc(motivo)}</p>
         <p><strong>Strikes acumulados:</strong> ${nuevos}/3</p>
         ${nuevos >= 2 ? `<p style="color:#FF4444"><strong>⚠️ Advertencia:</strong> Al llegar a 3 strikes tu cuenta será suspendida.</p>` : ''}
         ${nuevos >= 3 ? `<p style="color:#FF4444"><strong>Tu cuenta ha sido suspendida.</strong></p>` : ''}`
      );
    }
    // Notificación in-app del strike (además del email). Fails-soft.
    await _crearNotif({
      usuario_id: userId, tipo: 'strike', titulo: 'Recibiste un strike',
      mensaje: `Tienes ${nuevos}/3 strikes.`,
      link: 'perfil',
    });
    // Alerta a Memo si llegó a 2 o 3
    if (nuevos >= 2) await enviarAlertaMemo('strikes', { nombre, strikes: nuevos, motivo });
    // Suspender si llegó a 3
    if (nuevos >= 3) {
      await khUsuarios.actualizar(userId, { activo: false }); // [sec-usuarios]
    }
    await loadMTStrikes();
  } catch(e) { alert(e.message); }
}

async function quitarStrike(userId, nombre, strikesActuales) {
  if (!confirm(`¿Quitar 1 strike a ${nombre}?`)) return;
  const nuevos = Math.max(0, strikesActuales - 1);
  try {
    await khUsuarios.actualizar(userId, { strikes: nuevos }); // [sec-usuarios]
    await loadMTStrikes();
  } catch(e) { alert(e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// [VJ-1] DE LA ALERTA A CAPTURAR LOS DATOS
//
// La migración del Excel dejó viajeros CHEAP con nombre y zona nada más, y una
// alerta por persona. Antes había que leer la alerta, acordarse del nombre, ir
// a otra pantalla y buscarlo. Ahora la alerta trae el botón.
//
// La alerta es ACCIONABLE solo si su `ref` trae evento_id Y nombre. Sin los dos
// no se pinta botón: abrir un modal que no sabe a quién buscar es peor que no
// ofrecerlo. Las alertas de siempre traen `ref` en null y se pintan igual que
// antes — el botón simplemente no existe para ellas.
//
// UNA PERSONA PUEDE TENER VARIAS FILAS: en el padrón real Humberto y Elizabeth
// tienen 2 boletos cada uno. Se muestran TODAS con su mini-forma, y cada una se
// guarda por su propio id.
// ═══════════════════════════════════════════════════════════════════════════
let _vjAlertasCache = [];
let _vjFilas = [];        // filas de la persona, tal como vinieron del servidor
let _vjAlertaId = null;
let _vjAbonos = {};       // [VJ-3] viajero_id -> abonos, para el saldo de la ficha

const VJ_CAMPOS = [
  { k: 'correo',            lbl: 'Correo',                 tipo: 'email', ph: 'nombre@correo.com' },
  { k: 'celular',           lbl: 'Celular',                tipo: 'tel',   ph: '81 1234 5678' },
  { k: 'talla_playera',     lbl: 'Talla',                  tipo: 'text',  ph: 'S · M · L · XL' },
  { k: 'num_emergencia',    lbl: 'Tel. de emergencia',     tipo: 'tel',   ph: '81 1234 5678' },
  { k: 'emergencia_nombre', lbl: 'Nombre de emergencia',   tipo: 'text',  ph: 'Mamá, pareja…' },
  { k: 'notas',             lbl: 'Notas',                  tipo: 'text',  ph: 'Lo que haga falta' },
];

function _vjAccionable(a) {
  const r = a && a.ref;
  return !!(r && typeof r === 'object' && r.evento_id && r.nombre);
}

// Marca y enfoca el campo culpable — patrón _regFalla de GR-12.
function _vjMal(msg, campoId) {
  document.querySelectorAll('.vj-mal').forEach((e) => { e.classList.remove('vj-mal'); e.removeAttribute('aria-invalid'); });
  _vjAlert(msg, true);
  const c = campoId ? document.getElementById(campoId) : null;
  if (c) {
    c.classList.add('vj-mal');
    c.setAttribute('aria-invalid', 'true');
    try { c.focus({ preventScroll: true }); } catch (_) { try { c.focus(); } catch (__) {} }
    const limpia = () => { c.classList.remove('vj-mal'); c.removeAttribute('aria-invalid'); };
    c.addEventListener('input', limpia, { once: true });
  }
  return false;
}

function _vjAlert(msg, err) {
  const a = document.getElementById('vj-alert');
  if (a) a.innerHTML = msg ? `<div class="alert ${err ? 'alert-error' : 'alert-success'}">${_esfEsc(msg)}</div>` : '';
}

async function _vjAbrir(alertaId) {
  const a = (_vjAlertasCache || []).find((x) => String(x.id) === String(alertaId));
  if (!a || !_vjAccionable(a)) return;
  _vjAlertaId = alertaId;
  const { evento_id, nombre } = a.ref;

  crearModal('vj-datos', 'Capturar datos del viajero', `
    <div style="font-size:12px;color:var(--ts);line-height:1.6;margin-bottom:12px">
      <b style="color:var(--text)">${_esfEsc(nombre)}</b> · evento <b style="color:var(--text)">${_esfEsc(evento_id)}</b>
    </div>
    <div id="vj-alert" style="margin-bottom:10px"></div>
    <div id="vj-body"><div class="loading-state"><div class="spinner"></div>Buscando sus boletos…</div></div>
  `);

  const body = document.getElementById('vj-body');
  try {
    const todos = await khViajeros.listar(evento_id);   // [sec-coordi] ya existe
    // Filtro CLIENT-SIDE por nombre, normalizado con el helper de la casa: el
    // padrón viene del Excel y "Humberto  Puente" con doble espacio o con
    // acento distinto no puede dejar a nadie fuera.
    const meta = _kmNorm(String(nombre).replace(/\s+/g, ' ').trim());
    _vjFilas = (todos || []).filter((v) => _kmNorm(String(v.nombre || '').replace(/\s+/g, ' ').trim()) === meta);

    if (!_vjFilas.length) {
      body.innerHTML = `<div class="empty-state"><div class="empty-icon">·</div>No se encontró a <b>${_esfEsc(nombre)}</b> en el padrón de ${_esfEsc(evento_id)}.<br><span style="font-size:11px">Quizá el nombre cambió después de la migración.</span></div>`;
      return;
    }

    // [VJ-3] El dinero de cada fila que lo tenga. Se piden los abonos de todas
    // las filas de la persona ANTES de pintar, para que el saldo salga completo
    // de una vez y no aparezca un número que después se corrige solo.
    const conDinero = _vjFilas.filter((v) => v.total_contrato != null);
    _vjAbonos = {};
    if (conDinero.length) {
      const listas = await Promise.all(conDinero.map((v) =>
        khViajeros.abonosDe(v.id).catch(() => [])));   // [sec-coordi]
      conDinero.forEach((v, k) => { _vjAbonos[v.id] = listas[k]; });
    }

    body.innerHTML = _vjFilas.map((v, i) => `
      <div class="vj-fila">
        <div class="vj-fila-h">
          <span class="vj-fila-n">Boleto ${i + 1} de ${_vjFilas.length}</span>
          <span class="vj-fila-z">${_esfEsc(v.zona_boleto || 'sin zona')}${v.tipo_paquete ? ' · ' + _esfEsc(v.tipo_paquete) : ''}</span>
        </div>
        <div class="vj-grid">
          ${VJ_CAMPOS.map((c) => `
            <label class="vj-campo">
              <span>${_esfEsc(c.lbl)}</span>
              <input class="cot-input" id="vj-${c.k}-${i}" type="${c.tipo}" placeholder="${_esfEsc(c.ph)}"
                     value="${_esfEsc(v[c.k] == null ? '' : v[c.k])}" maxlength="500">
            </label>`).join('')}
        </div>
        ${_vj3BloqueHtml(v, i)}
      </div>`).join('') + `
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-ghost" type="button" onclick="cerrarModal('vj-datos')">Cancelar</button>
        <button class="btn btn-primary" type="button" id="vj-guardar" onclick="_vjGuardar()">Guardar</button>
      </div>`;
  } catch (e) {
    body.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
  }
}

// [VJ-3] El bloque de dinero de UNA fila. Si la fila no trae total_contrato
// (staff, intercambio, la ganadora del sorteo) NO se pinta nada: la ficha se ve
// como antes de esta tuerca. Inventarle un "$0" a quien no tiene contrato sería
// afirmar que no debe nada, y lo cierto es que no aplica.
function _vj3BloqueHtml(v, i) {
  const s = _vj3Saldo(v, _vjAbonos[v.id]);
  if (!s) return '';
  const abonos = _vjAbonos[v.id] || [];
  const filas = abonos.length ? abonos.map((a) => `
    <div class="vj3-ab">
      <span class="vj3-ab-f">${_esfEsc(String(a.fecha || '').slice(0, 10))}</span>
      <span class="vj3-ab-m">${_vj3Money(a.monto)}</span>
      <span class="vj3-ab-n">${a.nota ? _esfEsc(a.nota) : ''}${a.capturado_por ? `<span class="vj3-ab-q">· ${_esfEsc(a.capturado_por)}</span>` : ''}</span>
      ${a.foto_url ? `<a class="vj3-ab-foto" href="${_esfEsc(a.foto_url)}" target="_blank" rel="noopener">ver foto</a>` : '<span class="vj3-ab-sf">sin foto</span>'}
    </div>`).join('') : '<div class="vj3-ab-vacio">Sin abonos capturados aquí todavía.</div>';

  return `<div class="vj3-caja">
    <div class="vj3-nums">
      <div class="vj3-n"><span>Total</span><b>${_vj3Money(s.total)}</b></div>
      <div class="vj3-n"><span>Abonado</span><b class="vj3-ok">${_vj3Money(s.abonado)}</b></div>
      <div class="vj3-n">
        <span>${s.aFavor ? 'A favor' : 'Resta'}</span>
        <b class="${s.aFavor ? 'vj3-favor' : 'vj3-debe'}">${_vj3Money(s.resta)}</b>
      </div>
    </div>
    ${s.aFavor ? '<div class="vj3-nota-favor">Abonó de más. NO es un error — se le debe a la persona.</div>' : ''}
    <div class="vj3-abs">${filas}</div>
    <div class="vj3-form">
      <div class="vj3-form-t">Registrar abono</div>
      <div class="vj3-form-g">
        <label class="vj-campo"><span>Monto *</span>
          <input class="cot-input" id="vj3-monto-${i}" type="number" min="0" step="0.01" placeholder="0.00"></label>
        <label class="vj-campo"><span>Fecha</span>
          <input class="cot-input" id="vj3-fecha-${i}" type="date" value="${_kamToday()}"></label>
        <label class="vj-campo"><span>Nota</span>
          <input class="cot-input" id="vj3-nota-${i}" placeholder="Transferencia, OXXO…" maxlength="500"></label>
        <label class="vj-campo"><span>Foto (opcional)</span>
          <input class="cot-input" id="vj3-foto-${i}" type="file" accept="image/*"></label>
      </div>
      <div class="vj3-form-b">
        <button class="btn btn-primary btn-sm" type="button" id="vj3-btn-${i}" onclick="_vj3Abonar(${i})">Registrar abono</button>
      </div>
    </div>
  </div>`;
}

// Lee un <input type=file> a data-URI. Sin archivo → null (la foto es opcional).
function _vj3LeerFoto(input) {
  return new Promise((res) => {
    const f = input && input.files && input.files[0];
    if (!f) return res(null);
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result || '') || null);
    fr.onerror = () => res(null);   // fails-soft: el abono vale sin la foto
    fr.readAsDataURL(f);
  });
}

async function _vj3Abonar(i) {
  _vjAlert('');
  const v = _vjFilas[i];
  if (!v) return;
  const mEl = document.getElementById(`vj3-monto-${i}`);
  const monto = Number((mEl || {}).value);
  // > 0 estricto, igual que el servidor: un abono de cero no es un abono.
  if (!Number.isFinite(monto) || monto <= 0) {
    return _vjMal('El monto del abono tiene que ser mayor que cero.', `vj3-monto-${i}`);
  }
  const fecha = String((document.getElementById(`vj3-fecha-${i}`) || {}).value || '').trim();
  const nota = String((document.getElementById(`vj3-nota-${i}`) || {}).value || '').trim();
  const foto = await _vj3LeerFoto(document.getElementById(`vj3-foto-${i}`));

  const btn = document.getElementById(`vj3-btn-${i}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    await khViajeros.abonoCrear({                      // [sec-coordi]
      viajero_id: v.id, monto,
      fecha: fecha || undefined,
      nota: nota || undefined,
      foto: foto || undefined,
    });
    // Se recarga la ficha entera: así el saldo que queda en pantalla sale de
    // los datos, no de restar en el cliente y confiar.
    await _vjAbrir(_vjAlertaId);
    showToast(`Abono de ${_vj3Money(monto)} registrado`, 'success');
  } catch (e) {
    _vjAlert(e.message, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Registrar abono'; }
  }
}

// Lo que se escribió, por fila, solo si CAMBIÓ respecto a lo que vino.
function _vjCambios() {
  return _vjFilas.map((v, i) => {
    const campos = {};
    VJ_CAMPOS.forEach((c) => {
      const el = document.getElementById(`vj-${c.k}-${i}`);
      if (!el) return;
      const nuevo = String(el.value || '').trim();
      const viejo = v[c.k] == null ? '' : String(v[c.k]).trim();
      // Solo lo que de verdad cambió: mandar todo haría un PATCH por fila
      // aunque nadie tocara nada, y el conteo dejaría de significar algo.
      if (nuevo !== viejo) campos[c.k] = nuevo;
    });
    return { id: v.id, i, campos };
  }).filter((x) => Object.keys(x.campos).length);
}

async function _vjGuardar() {
  _vjAlert('');
  const cambios = _vjCambios();
  if (!cambios.length) { _vjAlert('No cambiaste nada todavía.', true); return; }

  // Validación ANTES de escribir: un correo con forma mala se rebota aquí, no
  // después de haber guardado las otras filas.
  for (const c of cambios) {
    if (Object.prototype.hasOwnProperty.call(c.campos, 'correo')) {
      const v = c.campos.correo;
      if (v !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return _vjMal(`El correo del boleto ${c.i + 1} no tiene forma de correo.`, `vj-correo-${c.i}`);
      }
    }
  }

  const btn = document.getElementById('vj-guardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  let ok = 0; const fallos = [];
  for (const c of cambios) {
    try { await khViajeros.editar(c.id, c.campos); ok++; }      // [sec-coordi]
    catch (e) { fallos.push(`boleto ${c.i + 1}: ${e.message}`); }
  }

  if (fallos.length) {
    _vjAlert(`Se guardaron ${ok} de ${cambios.length}. ${fallos.join(' · ')}`, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    return;
  }

  // Todo bien: la alerta ya no hace falta. Se marca leída con la escritura que
  // ya existía y se repinta la lista.
  try { await marcarAlertaLeida(_vjAlertaId); } catch (_) {}
  cerrarModal('vj-datos');
  showToast(`Datos guardados (${ok} ${ok === 1 ? 'boleto' : 'boletos'})`, 'success');
}

// ── ALERTAS ──────────────────────────────────────────────────
async function loadMTAlertas() {
  const list = document.getElementById('mt-alertas-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const alertas = await khCoordi.alertasListar().catch(()=>[]); // [sec-sensibles]
    if (!alertas.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">·</div>Sin alertas recientes</div>';
      return;
    }
    const tipoInfo = {
      strike_auto:        { icon:'<svg class="ic"><use href="#ic-alerta"/></svg>', color:'var(--orange)', label:'Strike automático' },
      strike_manual:      { icon:'<svg class="ic"><use href="#ic-diana"/></svg>', color:'var(--orange)', label:'Strike manual' },
      strikes:            { icon:'<svg class="ic"><use href="#ic-alerta"/></svg>', color:'var(--orange)', label:'Strike' },
      tour_declinado:     { icon:'✕', color:'var(--red)',    label:'Tour declinado' },
      reporte_rechazado:  { icon:'<svg class="ic"><use href="#ic-portapapeles"/></svg>', color:'var(--red)',    label:'Reporte rechazado' },
      nuevo_usuario:      { icon:'<svg class="ic"><use href="#ic-persona"/></svg>', color:'var(--green)',  label:'Nuevo usuario' },
      advertencia:        { icon:'<svg class="ic"><use href="#ic-alerta"/></svg>', color:'var(--gold)',   label:'Advertencia' },
      suspension:         { icon:'<svg class="ic"><use href="#ic-prohibido"/></svg>', color:'var(--red)',    label:'Suspensión' },
      usuario_desactivado:{ icon:'<svg class="ic"><use href="#ic-candado"/></svg>', color:'var(--red)',    label:'Usuario desactivado' },
    };
    list.innerHTML = alertas.map(a => {
      const ti = tipoInfo[a.tipo] || { icon:'<svg class="ic"><use href="#ic-campana"/></svg>', color:'var(--ts)', label: a.tipo };
      const fecha = _tsToDate(a.created_at) || new Date();
      return `<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${ti.color};border-radius:var(--radius);padding:12px 18px;margin-bottom:8px;${a.leida?'opacity:.5':''}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div>
            <div style="font-size:13px;font-weight:600">${ti.icon} ${_esfEsc(a.mensaje||ti.label)}</div>
            <div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--ts);margin-top:3px">
              ${fecha.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Monterrey'})} ${fecha.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'America/Monterrey'})}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${_vjAccionable(a) ? `<button class="btn btn-primary btn-sm vj-btn" onclick="_vjAbrir('${_attrJs(a.id)}')" style="font-size:10px">Capturar datos</button>` : ''}
            ${!a.leida ? `<button class="btn btn-ghost btn-sm" onclick="marcarAlertaLeida('${a.id}')" style="font-size:10px">✓ Leída</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    _vjAlertasCache = alertas;
  } catch(e) { list.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

async function marcarAlertaLeida(id) {
  // UPDATE vía Netlify Function con service_role (RLS bloquea UPDATE anon).
  try {
    await khAdminFetch('/.netlify/functions/sistema-alertas-write', {
      method: 'POST',
      body: JSON.stringify({ accion: 'marcar_leida', id }),
    });
    await loadMTAlertas();
  }
  catch(e) { alert(e.message); }
}

async function marcarTodasLeidas() {
  // UPDATE de todas las no leídas en una sola llamada (service_role).
  try {
    await khAdminFetch('/.netlify/functions/sistema-alertas-write', {
      method: 'POST',
      body: JSON.stringify({ accion: 'marcar_todas_leidas' }),
    });
    await loadMTAlertas();
  } catch(e) {}
}

// ── CONFIG ───────────────────────────────────────────────────
// sistema_config tiene RLS deny-all desde anon. Todo pasa por Netlify Functions
// con JWT propio: GET filtra columnas por rol, SAVE exige maestro_roshi.
async function loadMTConfig() {
  try {
    const r = await khAdminFetch('/.netlify/functions/sistema-config-get', { method:'POST' });
    if (!r.ok) return;
    const { config: cfg } = await r.json();
    _mtConfig = cfg || {};
    document.getElementById('cfg-clabe')?.setAttribute('value', cfg?.cuenta_clabe||'');
    document.getElementById('cfg-banco')?.setAttribute('value', cfg?.cuenta_banco||'');
    document.getElementById('cfg-titular')?.setAttribute('value', cfg?.cuenta_titular||'');
    if (document.getElementById('cfg-clabe')) document.getElementById('cfg-clabe').value = cfg?.cuenta_clabe||'';
    if (document.getElementById('cfg-banco')) document.getElementById('cfg-banco').value = cfg?.cuenta_banco||'';
    if (document.getElementById('cfg-titular')) document.getElementById('cfg-titular').value = cfg?.cuenta_titular||'';
    if (document.getElementById('cfg-mensaje')) document.getElementById('cfg-mensaje').value = cfg?.mensaje_dia||'';
    if (document.getElementById('cfg-mensaje-activo')) document.getElementById('cfg-mensaje-activo').checked = cfg?.mensaje_activo||false;
  } catch(e) {}
}

async function guardarConfigCuenta() {
  const body = {
    cuenta_clabe:   document.getElementById('cfg-clabe')?.value.trim()||null,
    cuenta_banco:   document.getElementById('cfg-banco')?.value.trim()||null,
    cuenta_titular: document.getElementById('cfg-titular')?.value.trim()||null,
  };
  const alertEl = document.getElementById('cfg-cuenta-alert');
  try {
    const r = await khAdminFetch('/.netlify/functions/sistema-config-save', {
      method:'POST', body: JSON.stringify(body),
    });
    if (!r.ok) {
      const detail = await r.json().catch(()=>({ error: r.statusText }));
      throw new Error(detail.error || 'Error guardando');
    }
    const { config } = await r.json();
    if (config) _mtConfig = config;
    alertEl.innerHTML='<div class="alert alert-success">✓ Cuenta guardada</div>';
    setTimeout(()=>alertEl.innerHTML='', 2000);
  } catch(e) { alertEl.innerHTML=`<div class="alert alert-error">${e.message}</div>`; }
}

// ── ESFERAS DEL DRAGÓN (Pieza 1) ─────────────────────────────────────────────
// Aditivo puro: alta y listado en la tabla nueva esferas_eventos vía Functions
// propias (esferas-crear / esferas-listar). No toca EV, eventos_meta, portal ni
// ninguna otra página. Mismo patrón khAdminFetch + alerts que guardarConfigCuenta.
// 🖥️ CAP5-1 — escape para TEXTO dentro de un MANEJADOR EN LÍNEA (onclick="f('…')").
// Ahí conviven DOS parsers y hay que sobrevivir a los dos, en orden:
//   1) el navegador lee el atributo y DECODIFICA las entidades HTML;
//   2) lo que queda se lo pasa al motor de JS.
// Por eso `_esfEsc` SOLO no sirve: convierte ' en &#39;, el parser lo devuelve a
// ' y el JS ve la comilla que cierra su propia cadena. Y `replace(/'/g,"\\'")`
// tampoco: no toca la comilla DOBLE, que cierra el atributo entero.
// La secuencia correcta es escapar primero para JS y DESPUÉS para HTML.
function _attrJs(s) {
  const js = String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return _esfEsc(js);
}

// 🖥️ CAP5-1 — URL segura para src/href. Una URL `javascript:` en un atributo es
// ejecución directa, así que solo se aceptan https:// y rutas del propio sitio;
// cualquier otra cosa devuelve '' y el atributo NO se pinta.
function _urlSegura(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s) return '';
  if (/^https:\/\//i.test(s) || /^\//.test(s) || /^data:image\//i.test(s)) return _esfEsc(s);
  return '';
}

function _esfEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}



// ═══ [ESF-LISTA-1] LA LISTA, SIN LOS QUE YA PASARON ════════════════════════
// Memo: los pasados "no sirven pa nada" ahí. Medido sobre el catálogo del
// 25-ago-2026: 42 de 102 ya ocurrieron — casi la mitad de la lista era ruido.
//
// No se borran: un pasado sembrado no le estorba al sitio (nace sin publicar y
// el index ya lo tiene). Solo queda detrás del filtro.
let _esfFiltroFecha = 'proximo';   // al abrir, Memo ve SOLO próximos
// [ESF-LISTA-2] El buscador. Se combina con el chip, igual que en Cápsula: son
// dos cortes distintos del mismo padrón, no dos modos que se pisen.
let _esfBusca = '';







// ═══ [ESF-UX-3] EL ESTADO DE LA PROMO, QUE NO ES EL DEL EVENTO ════════════
// Memo leía "Disponible" en la columna Status y lo entendía de la PROMO. Es el
// del tour. Los cinco eventos con promo de pareja decían "Disponible" con su
// promo muerta desde el 25-ago.
//
// 🔒 EL VEREDICTO SALE DEL DATO, NO DEL LETRERO. `promo_label` dice "HASTA EL
// 24 AGO" y adivinarlo de ahí sería heurística sobre un texto que Memo teclea a
// mano. El vencimiento REAL de una promo de pareja vive en el registro `PROMOS`
// del catálogo publicado; el de un flash vive en la propia fila de Esferas.
//
// 🔒 Y LA REGLA ES LA DEL SITIO, copiada de `validarPromo` en index.html — no
// una nueva. Si el admin juzgara distinto que el cotizador, Memo vería ACTIVA
// una promo que al cliente le rebota:
//     sin `expiresTs`  → NO vence (la retira Memo cuando quiera)
//     `startTs` futuro → todavía no arranca
//     `now > expiresTs`→ expirada
// `usos/maxUsos` y `singleUse` NO entran: el contador vive en la memoria de
// CADA navegador y se reinicia al recargar, y `singleUse` se marca en el
// localStorage DEL CLIENTE. Ninguno de los dos es un estado que este panel
// pueda ver, y fingir que sí sería inventar.

// ── El registro PROMOS del catálogo publicado ─────────────────────────────
// Mismo camino que usan `rol.html` y `_fetchEVFromIndex`: se pide el
// `index.html` de verdad y se recorta el literal. NO se cachea entre sesiones:
// Memo edita ese registro a mano y un caché viejo diría "vencida" de una promo
// que acaba de renovar.
let _esfPromosCat = null;
let _esfPromosCarga = 'no';   // 'no' · 'cargando' · 'listo' · 'error'






const _ESF_PROMO_PINTA = {
  viva:     { punto: '●', color: 'var(--green)' },
  muerta:   { punto: '○', color: 'var(--ts)' },     // gris: vencer es normal, no es una falla
  pronto:   { punto: '◷', color: 'var(--blue)' },
  malo:     { punto: '⚠', color: 'var(--red)' },    // rojo: el cliente teclea el código y REBOTA
  nose:     { punto: '·', color: 'var(--ts2)' },
  cargando: { punto: '·', color: 'var(--ts2)' },
};





// ═══ [ESF-LISTA-3] LA SECCIÓN ENTERA SE COLAPSA ═══════════════════════════
// #577 encogió cada FILA; esto quita la LISTA de en medio. La página de Esferas
// es captura arriba, lista en medio, e importador/publicar/noticias abajo: con
// la lista plegada se llega a lo de abajo sin bajar dos mil pixeles.
//
// ⚠️ EL CONTEO SE VE TAMBIÉN CERRADA. Una sección plegada que no dice cuánto
// guarda se lee como una sección vacía — y "Eventos registrados" en blanco
// asusta más que una lista larga.
//
// NACE CERRADA, pero se RECUERDA: la preferencia de Memo gana desde el segundo
// día. Mismo patrón que `toggleNavGroup` del nav (localStorage por clave, y
// envuelto en try/catch porque un navegador con el storage bloqueado no puede
// tirar la pantalla).
const _ESF_SEC_KEY = 'esfcol:listado';






















// ═══════════════════════════════════════════════════════════════
// LA DERROTA DE YAMCHA — Panel de Reembolsos (Cancelar evento · Fase 3b)
// ═══════════════════════════════════════════════════════════════
async function loadYamcha() {
  const lista = document.getElementById('yamcha-lista');
  const totEl = document.getElementById('yamcha-totales');
  if (!lista) return;
  lista.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
  if (totEl) totEl.innerHTML = '';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-reembolsos', {
      method: 'POST', body: JSON.stringify({ accion: 'listar' }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({ error: r.statusText }));
      lista.innerHTML = `<div class="alert alert-error">${_esfEsc(d.error || 'Error cargando reembolsos')}</div>`;
      return;
    }
    const { reembolsos, totales } = await r.json();
    const filas = Array.isArray(reembolsos) ? reembolsos : [];
    window._yamchaRows = filas;
    const t = totales || { pendiente_monto: 0, pendiente_n: 0, transferido_monto: 0, transferido_n: 0 };

    if (totEl) totEl.innerHTML = `
      <div class="metrics-grid">
        <div class="metric">
          <div class="metric-label">Pendiente por reembolsar</div>
          <div class="metric-value red">${formatMXN(t.pendiente_monto)}</div>
          <div style="font-size:11px;color:var(--ts)">${t.pendiente_n} cliente(s)</div>
        </div>
        <div class="metric">
          <div class="metric-label">Ya transferido</div>
          <div class="metric-value" style="color:#3DDC84">${formatMXN(t.transferido_monto)}</div>
          <div style="font-size:11px;color:var(--ts)">${t.transferido_n} cliente(s)</div>
        </div>
      </div>`;

    if (!filas.length) {
      lista.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div>Sin reembolsos registrados</div>';
      return;
    }

    // Agrupar por evento_slug (conserva el orden creado_en.desc del backend).
    const grupos = [];
    const idx = {};
    for (const f of filas) {
      if (!(f.evento_slug in idx)) { idx[f.evento_slug] = grupos.length; grupos.push({ slug: f.evento_slug, nombre: f.evento_nombre, rows: [] }); }
      grupos[idx[f.evento_slug]].rows.push(f);
    }

    lista.innerHTML = grupos.map(g => {
      const filasHtml = g.rows.map(rb => {
        const esPend = rb.estado === 'pendiente';
        const badge = esPend
          ? '<span style="display:inline-block;padding:2px 8px;border-radius:var(--r-sm,8px);background:rgba(255,165,0,.15);color:var(--orange);font-size:11px;font-weight:700">pendiente</span>'
          : '<span style="display:inline-block;padding:2px 8px;border-radius:var(--r-sm,8px);background:rgba(61,220,132,.15);color:#3DDC84;font-size:11px;font-weight:700">transferido</span>';
        const accionEstado = esPend
          ? `<button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="transferirReembolso('${_esfEsc(rb.id)}')">✓ Marcar transferido</button>`
          : `<button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="desmarcarReembolso('${_esfEsc(rb.id)}')">↩️ Desmarcar</button>`;
        return `<tr>
          <td><div style="font-weight:600">${_esfEsc(rb.cliente_nombre || '—')}</div><div style="font-size:11px;color:var(--ts)">${_esfEsc(rb.cliente_correo || '')}</div></td>
          <td style="font-weight:700">${formatMXN(rb.monto)}</td>
          <td style="font-size:12px;max-width:220px;white-space:pre-wrap">${_esfEsc(rb.datos_bancarios || '—')}</td>
          <td>${badge}</td>
          <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="editarDatosReembolso('${_esfEsc(rb.id)}')"><svg class="ic"><use href="#ic-lapiz"/></svg> Datos</button> ${accionEstado}</td>
        </tr>`;
      }).join('');
      return `<div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px">
          <div style="font-weight:700;font-size:15px">${_esfEsc(g.nombre || g.slug)}</div>
          <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="avisarReembolsos('${_esfEsc(g.slug)}')"><svg class="ic"><use href="#ic-correo"/></svg> Avisar a clientes</button>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Cliente</th><th>Monto</th><th>Datos bancarios</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>${filasHtml}</tbody>
        </table></div>
      </div>`;
    }).join('');
  } catch (e) {
    lista.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
  }
}

async function avisarReembolsos(slug) {
  if (!confirm('¿Mandar el correo de cancelación + reembolso a los clientes con reembolso pendiente de este evento?')) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-avisar-cancelacion', {
      method: 'POST', body: JSON.stringify({ slug }),
    });
    const d = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok) { showToast(d.error || 'No se pudo avisar', 'error'); return; }
    showToast(`<svg class="ic"><use href="#ic-correo"/></svg> ${d.enviados || 0} enviado(s)${d.fallidos ? ` · <svg class="ic"><use href="#ic-alerta"/></svg> ${d.fallidos} fallido(s)` : ''}`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function editarDatosReembolso(id) {
  const rb = (window._yamchaRows || []).find(x => x && x.id === id);
  if (!rb) { alert('No se encontró el reembolso. Recarga e intenta de nuevo.'); return; }
  document.getElementById('modal-yamcha-datos').innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px"><svg class="ic"><use href="#ic-lapiz"/></svg> Datos de reembolso</div>
        <button class="modal-close" onclick="closeModal('modal-yamcha-datos')">×</button>
      </div>
      <div class="modal-body">
        <div style="font-size:13px;margin-bottom:12px"><b>${_esfEsc(rb.cliente_nombre || '—')}</b> · ${formatMXN(rb.monto)}<br><span style="font-size:11px;color:var(--ts)">${_esfEsc(rb.cliente_correo || '')}</span></div>
        <div class="form-group">
          <label>Datos bancarios (CLABE, banco, titular)</label>
          <textarea class="cot-input" id="ya-datos" rows="3" style="width:100%" placeholder="Lo que respondió el cliente por correo">${_esfEsc(rb.datos_bancarios || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Notas</label>
          <textarea class="cot-input" id="ya-notas" rows="2" style="width:100%">${_esfEsc(rb.notas || '')}</textarea>
        </div>
        <div id="ya-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-yamcha-datos')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarDatosReembolso('${_esfEsc(id)}')">Guardar</button>
      </div>
    </div>`;
  openModal('modal-yamcha-datos');
}

async function guardarDatosReembolso(id) {
  const alertEl = document.getElementById('ya-alert');
  const datos_bancarios = (document.getElementById('ya-datos')?.value || '').trim();
  const notas = (document.getElementById('ya-notas')?.value || '').trim();
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-reembolsos', {
      method: 'POST', body: JSON.stringify({ accion: 'guardar_datos', id, datos_bancarios, notas }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({ error: r.statusText }));
      if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(d.error || 'No se pudo guardar')}</div>`;
      return;
    }
    closeModal('modal-yamcha-datos');
    loadYamcha();
  } catch (e) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
  }
}

function transferirReembolso(id) {
  const rb = (window._yamchaRows || []).find(x => x && x.id === id);
  if (!rb) { alert('No se encontró el reembolso. Recarga e intenta de nuevo.'); return; }
  document.getElementById('modal-yamcha-transferir').innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">✓ Marcar transferido</div>
        <button class="modal-close" onclick="closeModal('modal-yamcha-transferir')">×</button>
      </div>
      <div class="modal-body">
        <div style="font-size:13px;margin-bottom:14px">Reembolso de <b>${_esfEsc(rb.cliente_nombre || 'cliente')}</b> por <b>${formatMXN(rb.monto)}</b>.</div>
        <div class="form-group">
          <label>¿De qué cuenta salió?</label>
          <select class="cot-input" id="ya-cuenta" style="width:100%">
            <option value="">Elige cuenta…</option>
            <option>BBVA</option>
            <option>Banamex</option>
            <option>Efectivo</option>
          </select>
        </div>
        <div style="font-size:11px;color:var(--ts);line-height:1.5;margin-bottom:8px">Se registra como salida de esa cuenta; la caja del evento bajará por este monto.</div>
        <div id="ya-tr-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-yamcha-transferir')">Cancelar</button>
        <button class="btn btn-primary" id="ya-tr-btn" onclick="confirmarTransferencia('${_esfEsc(id)}')">Confirmar</button>
      </div>
    </div>`;
  openModal('modal-yamcha-transferir');
}

async function confirmarTransferencia(id) {
  const alertEl = document.getElementById('ya-tr-alert');
  const btn = document.getElementById('ya-tr-btn');
  const cuenta = (document.getElementById('ya-cuenta')?.value || '').trim();
  if (!cuenta) {
    if (alertEl) alertEl.innerHTML = '<div class="alert alert-error">Elige una cuenta</div>';
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-reembolsos', {
      method: 'POST', body: JSON.stringify({ accion: 'marcar_transferido', id, cuenta }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({ error: r.statusText }));
      if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(d.error || 'No se pudo marcar')}</div>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar'; }
      return;
    }
    closeModal('modal-yamcha-transferir');
    const d = await r.json().catch(() => ({}));
    if (d.ya) showToast('Ya estaba transferido; no se reenvió correo', 'info');
    else if (d.correo_enviado) showToast('Transferido ✓ y correo enviado al cliente', 'success');
    else showToast('Transferido ✓ pero el correo al cliente NO salió — avísale tú', 'error');
    loadYamcha();
  } catch (e) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar'; }
  }
}

async function desmarcarReembolso(id) {
  if (!confirm('¿Desmarcar este reembolso? Volverá a pendiente.')) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-reembolsos', {
      method: 'POST', body: JSON.stringify({ accion: 'desmarcar', id }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({ error: r.statusText })); showToast(d.error || 'No se pudo desmarcar', 'error'); return; }
    loadYamcha();
  } catch (e) { showToast(e.message, 'error'); }
}


// ── Edición de una Esfera (modo edit del mismo form) ─────────────────────────
// window._esfEditSlug marca el modo: null=crear, '<slug>'=editar. El botón
// despacha a crear o a actualizar según el modo.
window._esfEditSlug = null;




// ── Qué incluye (inc) + separo (sep/sep_cheap) + nota ────────────────────────
// Defaults de la lista "qué incluye" por ciudad y texto de nota para CDMX.
const _ESF_INC_MTY  = ['Boleto zona elegida', 'Transporte Reynosa-Mty', 'Hospedaje compartido', 'Kit Conecta'];
const _ESF_INC_CDMX = ['Boleto zona elegida', 'Traslados CDMX', 'Hospedaje compartido', 'Kit Conecta'];
const _ESF_NOTA_CDMX = 'NO incluye transporte a CDMX.';








// [ESF-E1a] A diferencia de los separos, éstos devuelven NULL cuando el campo
// está vacío, no un default. Un separo sin capturar vale 500 con toda razón;
// un RIDE sin capturar significa que el evento NO VENDE ese paquete, y
// rellenarlo con un número lo pondría a la venta solo.
// [ESF-E1e] Las banderas de paquete. `cheapAlsoOk` solo viaja con `rideOnly`:
// suelta no significa nada, igual que en el compilador.
const _ESF_PKG = {
  ride_only: 'esf-pkg-rideonly', cheap_only: 'esf-pkg-cheaponly',
  no_stay: 'esf-pkg-nostay', no_cheap: 'esf-pkg-nocheap',
  no_bus: 'esf-pkg-nobus', cheap_soon: 'esf-pkg-cheapsoon',
  cheap_also_ok: 'esf-pkg-alsook',
};




// Cache del festival en edición. Preserva llaves futuras (portada/lineup/paquetes
// de 2c/2d) al reescribir solo .switches.
window._esfFestival = {};









// ── Zonas y precios (B1: zonas de venta, sin hotel/pagos) ────────────────────
// Cada fila: [Nombre] [$ PLUS] [$ CHEAP opcional] [○ Agotada] [✕].
// El ORDEN de captura se respeta (es el orden del cotizador). Se guarda como
// JSON en `zonas` (solo filas con nombre).
// ── Catálogo venue→zonas (Esferas) — admin-venues-catalogo (KH, maestro_roshi) ──
// Cachea el catálogo al entrar a Esferas; autocompleta #esf-venue y precarga los
// NOMBRES de zona (precio en blanco → p:0 → el index NO las enciende hasta capturar
// precio real, candado 2c-iii). NO toca el catálogo viejo del cotizador (localStorage,
// huérfano). Guarda/lee SOLO nombres, nunca precios.
let _esfVenuesCat = [];
















// ═══ [ESF-E3b] IMPORTAR DEL CATÁLOGO ══════════════════════════════════════
// La otra mitad de "todos los eventos viven en Esferas": traer los que todavía
// viven a mano en `index.html`.
//
// Dos pasos SEPARADOS a propósito. Diagnosticar no escribe nada y es lo que se
// mira; sembrar escribe y hay que pedirlo aparte. Un solo botón que hiciera las
// dos cosas convertiría "a ver qué hay" en una escritura al catálogo.
//
// Lo que el endpoint garantiza y esta pantalla REPITE en voz alta, porque una
// promesa que solo vive en el servidor no tranquiliza a quien aprieta:
//   · solo entra lo que el juez semántico aprueba —lo demás se queda a mano—
//   · lo sembrado nace SIN PUBLICAR
//   · un slug que ya está en Esferas se SALTA, no se pisa
let _esfImportDiag = null;   // el último diagnóstico, para que Sembrar diga cuántos






// ═══ [ESF-E3a] NIVEL 4 · LA FECHA, UNA POR UNA ═════════════════════════════
// El cuarto nivel de la decisión de Memo: un concierto de tres noches no se
// agota entero — se agota la del viernes y sigue viva la del sábado.
//
// ESF-E1f le enseñó al compilador a EMITIR `multifecha` en conciertos, pero
// nadie lo CAPTURABA: el navegador nunca mandaba el campo. Ocho conciertos
// (straykids, weeknd, bts, karolg, morat, caifanes, harry, alvarodiaz) tenían
// sus fechas gobernadas por un campo que no tenía boca.
//
// ⚠️ SE CAPTURA COMPLETO. Etiqueta, fecha, zonas, cheap, ride y su agotado.
// Guardar a medias no "guarda menos": REEMPLAZA la columna con una versión
// degradada, porque `fusionarConViejo` solo protege el primer nivel. Es la
// misma trampa que E1 midió ocho veces.
//
// Las zonas de una fecha se leen y se escriben con la MISMA forma que las
// CHEAP de arriba (n · p · vip · ag · prox) porque el compilador usa el mismo
// parser para las dos: `parseCheapZonas(f.zonas)`. Un tercer formato aquí
// sería la copia que acaba divergiendo.

const _MAGO_PLUS  = { n: '.esf-zona-n', p: '.esf-zona-p', ag: '.esf-zona-ag', prox: '.esf-zona-prox', vip: '.esf-zona-vip' };
// En espejo, el PRECIO cheap es `pc` de la misma fila y los estados son los del
// PLUS: no se inventa un switch propio (los campos apuntan a los mismos inputs).
const _MAGO_ESPEJO = { n: '.esf-zona-n', p: '.esf-zona-pc', ag: '.esf-zona-ag', prox: '.esf-zona-prox', vip: '.esf-zona-vip' };
const _MAGO_CHEAP  = { n: '.esf-cz-n', p: '.esf-cz-p', ag: '.esf-cz-ag', prox: '.esf-cz-prox', vip: '.esf-cz-vip', sepEspecial: '.esf-cz-sep' };
const _TAB_CSS = {
  th: 'padding:5px 7px;font-size:10px;font-family:\'JetBrains Mono\',monospace;letter-spacing:.08em;color:var(--ts);text-align:center;white-space:nowrap',
  zn: 'padding:5px 7px;font-size:12px;text-align:left;white-space:nowrap;position:sticky;left:0;background:var(--bg);z-index:1',
  td: 'padding:3px 5px;border-left:1px solid var(--border);vertical-align:middle',
};
// ═══ [ESF-UX-3-1c] LOS DOS RENGLONES DE ABAJO ══════════════════════════════
// El tablero cierra con lo que faltaba para no salirse de la pantalla: el STAY,
// que no se captura, y el RIDE, que sí.
//
// STAY es SOLO LECTURA por regla sellada (25-ago): cuesta `PLUS − $500` fijos,
// y ese 500 vive idéntico en los cuatro runtimes (`precio-zona.js`, `rol.html`,
// `portal.html`, `index.html` — verificado). No se vuelve editable por zona: lo
// único que se decide es si el evento lo vende, y eso es `noStay`, uno por
// evento, aquí a la vista.
const _TAB_STAY_DESC = 500;

// [ESF-UX-1] `esCheap` enciende el separo especial, igual que en la lista CHEAP
// de arriba (`esf-cz-sep`). Sin esa boca, straykids perdía el sepEspecial de
// 4000 de su Box Oro en las DOS fechas: la misma enfermedad del bloque de
// fecha, un nivel más adentro.
function _esfMfZonaRow(cont, data, esCheap) {
  if (!cont) return;
  const d = data || {};
  const row = document.createElement('div');
  row.className = 'esf-mfz-row';
  row.style.cssText = 'display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap';
  row.innerHTML =
    '<input class="cot-input esf-mfz-n" placeholder="Zona" style="flex:2;min-width:100px" autocomplete="off">' +
    '<input class="cot-input esf-mfz-p" type="number" min="0" placeholder="$" style="flex:1;min-width:74px">' +
    '<label style="font-size:11px;display:flex;align-items:center;gap:3px;white-space:nowrap" title="Zona preferente"><input type="checkbox" class="esf-mfz-vip">VIP</label>' +
    '<label style="font-size:11px;display:flex;align-items:center;gap:3px;white-space:nowrap"><input type="checkbox" class="esf-mfz-ag">Agotada</label>' +
    '<label style="font-size:11px;display:flex;align-items:center;gap:3px;white-space:nowrap" title="Se anuncia sin precio"><input type="checkbox" class="esf-mfz-prox">Próx.</label>' +
    (esCheap ? '<input class="cot-input esf-mfz-sep" type="number" min="0" placeholder="separo esp." title="Separo especial de esta zona. Vacío = el separo normal del evento." style="flex:1;min-width:92px">' : '') +
    '<button type="button" class="btn btn-ghost esf-mfz-del" title="Quitar zona">✕</button>';
  row.querySelector('.esf-mfz-n').value = (typeof d.n === 'string') ? d.n : '';
  if (d.p) row.querySelector('.esf-mfz-p').value = d.p;
  if (d.vip) row.querySelector('.esf-mfz-vip').checked = true;
  if (d.ag) row.querySelector('.esf-mfz-ag').checked = true;
  if (d.prox) row.querySelector('.esf-mfz-prox').checked = true;
  const _sep = row.querySelector('.esf-mfz-sep');
  if (_sep && d.sepEspecial) _sep.value = d.sepEspecial;
  // La zona original se guarda tal cual: lo que esta fila no administra vuelve
  // intacto (`requiereViajeros` hoy, lo que el parser aprenda mañana).
  row._esfZOrig = (data && typeof data === 'object') ? data : {};
  // Agotada y Próximamente son excluyentes, igual que en las otras dos listas:
  // una nunca estuvo a la venta y la otra se acabó.
  const cbA = row.querySelector('.esf-mfz-ag'), cbP = row.querySelector('.esf-mfz-prox');
  cbA.addEventListener('change', () => { if (cbA.checked) cbP.checked = false; });
  cbP.addEventListener('change', () => { if (cbP.checked) cbA.checked = false; });
  row.querySelector('.esf-mfz-del').addEventListener('click', () => { row.remove(); });
  cont.appendChild(row);
}

// [ESF-UX-1] Las llaves CON boca en la fila de zona. `parseCheapZonas` conserva
// siete; esta fila gobierna seis (`sepEspecial` solo en las CHEAP). La séptima
// —`requiereViajeros`, que hoy solo usa juniorh a nivel evento— se preserva.
const Z_ADMINISTRADAS = new Set(['n', 'p', 'ag', 'prox', 'vip', 'sepEspecial']);
function _esfMfLeerZonas(cont) {
  if (!cont) return [];
  return Array.from(cont.querySelectorAll('.esf-mfz-row')).map((row) => {
    const n = (row.querySelector('.esf-mfz-n')?.value || '').trim();
    const p = parseInt(row.querySelector('.esf-mfz-p')?.value || '0', 10) || 0;
    const prox = row.querySelector('.esf-mfz-prox')?.checked ? 1 : 0;
    const ag = (!prox && row.querySelector('.esf-mfz-ag')?.checked) ? 1 : 0;
    const vip = row.querySelector('.esf-mfz-vip')?.checked ? 1 : 0;
    const se = parseInt(row.querySelector('.esf-mfz-sep')?.value || '', 10);
    const o = { n, p, ag, prox, vip };
    if (Number.isFinite(se) && se > 0) o.sepEspecial = se;
    // [ESF-UX-1] Preservación al nivel de la ZONA, igual que en el de la fecha.
    const previa = row._esfZOrig || {};
    Object.keys(previa).forEach((k) => {
      if (!Z_ADMINISTRADAS.has(k) && !(k in o)) o[k] = previa[k];
    });
    return o;
  }).filter((z) => z.n);
}

// Un bloque = una noche.
// [ESF-UX-1] EL HOTEL POR FECHA. Lo único que Memo edita es el precio por
// persona; `k`, `n`, `viaj` y el texto base de `desc` son de la fila y vuelven
// intactos. Derivarlos de `_ESF_HOTEL_TIPOS` habría cambiado datos que nadie
// pidió cambiar: la tabla dice 'Compartida' y el catálogo dice 'Compartida (4)',
// y el orden tampoco coincide.
const _MF_DESC_NOCHES = / · \d+ noches?$/;
// [ESF-UX-1] Las llaves CON boca de captura en el bloque de fecha. Lo que no
// esté aquí no se administra y por lo tanto no se pisa —el mismo espíritu de
// CAMPOS_DEL_COMPILADOR: lo que no gobiernas, lo devuelves como venía.
const MF_ADMINISTRADAS = new Set(
  ['lbl', 'sublbl', 'ds', 'noches', 'music', 'zonas', 'cheapZonas', 'ride', 'hotel', 'rideAgotado']);










// ── Hotel custom (B2b) ───────────────────────────────────────────────────────
// Toggle apagado → default de ciudad (no se captura nada). Encendido → costo
// total + 4 tipos FIJOS con su viaj interno; el extra POR PERSONA se autocalcula
// con la fórmula (base=total/4; extra=ceil((4-pers)*base/pers)) y es editable.
// [ESF-CIERRE-HOTEL] Cada tipo con su LLAVE y su FRASE, tal como viven en el
// catálogo. Medido sobre las 36 filas finas: `k` son exactamente estos cuatro,
// `desc` es una frase fija por tipo, y `pp` es SIEMPRE igual a `e` (36 de 36).
// Por eso el hotel fino no necesita tres campos nuevos de captura: se DERIVA del
// tipo más un número de noches.
const _ESF_HOTEL_TIPOS = [
  { n: 'Compartida', pers: 4, viaj: [1, 2, 3, 4], k: 'compartida', desc: 'Compartes cuarto con otros viajeros' },
  { n: 'Individual', pers: 1, viaj: [1], k: 'individual', desc: 'Cuarto solo para ti' },
  { n: 'Doble', pers: 2, viaj: [2], k: 'doble', desc: 'Tu parte del cuarto doble' },
  { n: 'Triple', pers: 3, viaj: [3], k: 'triple', desc: 'Tu parte del cuarto triple' },
];






// Cerrar por clic en el fondo y por Escape. Aquí SÍ se puede, porque cerrar no
// descarta nada; en `.modal-overlay` no se podría. Se enganchan tarde (el
// markup del panel puede no existir cuando corre este archivo).
document.addEventListener('click', (e) => {
  const ov = document.getElementById('esf-panel-ov');
  if (ov && e.target === ov) _esfPanelCerrar();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _esfPanelAbierto()) _esfPanelCerrar();
});



// ═══ [ESF-UX-1c] LAS PESTAÑAS DEL FORMULARIO ══════════════════════════════
// Pestañas y NO pasos, y el número lo decidió: ESF-UX-1 midió que EDITAR es el
// trabajo frecuente (b) y CREAR el raro (a). Un asistente por pasos ayuda a
// crear y castiga a editar —obliga a caminar por pantallas que no se van a
// tocar para cambiar un precio—. Con pestañas se salta directo a "Zonas".
//
// ⚠️ GUARDAR VIVE FUERA de las pestañas, siempre visible. Meterlo dentro de
// "Revisar" convertiría cada edición de un campo en un viaje de ida y vuelta,
// y "lo que se usa siempre, siempre visible" es la regla que Memo firmó.
let _esfTabActual = 'datos';



const _ESF_MINIMO = [
  { id: 'esf-slug', q: 'el slug (el nombre corto del evento)' },
  { id: 'esf-nombre', q: 'el nombre / artista' },
  { id: 'esf-venue', q: 'el venue', salvoSi: _esfEsPorConfirmar },
];







// Cuenta GRUPOS con dato, no campos: "3 con dato" se lee como "hay tres cosas
// puestas ahí dentro", que es la pregunta que se hace quien edita. Contar
// campos daría números grandes que no dicen nada ("7 con dato").
const _ESF_EXTRAS_GRUPOS = [
  { n: 'apuntes', txt: ['esf-promo-code', 'esf-promo-label', 'esf-music-search'], chk: ['esf-promo', 'esf-deporte'] },
  { n: 'imagen', txt: ['esf-static-img', 'esf-img-texto'], chk: ['esf-img-omitir'] },
  { n: 'corrido', txt: ['esf-fecha-fin', 'esf-f-texto'], chk: [] },
  { n: 'cartel', txt: ['esf-lineup'], chk: [] },
  { n: 'flash', txt: ['esf-flash-code', 'esf-flash-valor', 'esf-flash-fecha'], chk: [] },
  { n: 'banco', txt: ['esf-banco'], chk: [] },
];







// ═══ [ESF-FLASH-1] EL CÓDIGO DE DESCUENTO FLASH ═══════════════════════════
// 🔒 LA REGLA DEL HUSO, que es de donde salen los errores: lo que Memo teclea se
// lee en hora de REYNOSA (−05:00), que sigue el horario de EE.UU. y NO el de
// Monterrey. Es la regla que quedó escrita al borrar melanie, y aquí es donde
// aplica — el compilador solo guarda el instante ya resuelto.
//
// Careado contra el COMPA de arre: su `expiresTs` 1778427681035 son las
// 10:41:21 del 10-may en Reynosa. Teclear esa fecha y esa hora tiene que dar
// ese número exacto.
//
// Los literales `-06:00` que quedan en el catálogo son de mayo y son LEGACY;
// los nuevos (agosto) ya llevan −05:00.
const ESF_FLASH_TZ = '-05:00';   // Reynosa

// El objeto completo tal como llegó, para no perder las llaves que este
// formulario NO expone (`expiresHours`, `onlyEvent`). Mismo patrón que
// `window._esfFestival`: se reescribe solo lo que el formulario gobierna.
window._esfFlashCache = null;







// ── Mapa del venue (imagen → bucket público mapas-eventos) ───────────────────
// Estado: URL pública del mapa ya subido ('' = sin mapa). Se manda en el campo
// `mapa` al crear/actualizar. La imagen se redimensiona a máx 1400px de ancho y
// se sube como webp antes de mandarla (no inflar el bucket).
var _esfMapaUrl = '';




// ── Concierto: foto de portada (calcado del mapa; reusa _esfMapaResize) ──────
// Sube a esferas-subir-imagen tipo:'portada' (path <slug>-portada); la URL se
// guarda en la columna `foto`. El compilador emite staticImg + img:false, y el
// render de index.html la usa directa (TUERCA A). Reemplaza la foto de Deezer.
var _esfFotoUrl = '';

// ── Festival: portada + lineup (calcado del mapa; reusa _esfMapaResize) ──────
var _esfPortadaUrl = '';
var _esfLineupUrl = '';

function _esfFestImgClear(kind) {
  _esfFestImgShow(kind, '');
  const f = document.getElementById('esf-fest-' + kind + '-file'); if (f) f.value = '';
  const st = document.getElementById('esf-fest-' + kind + '-status'); if (st) st.textContent = '';
}
async function _esfFestImgPick(kind, event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const slug = (document.getElementById('esf-slug')?.value || '').trim().toLowerCase();
  if (!slug) { alert('Primero pon el slug del evento (nombra el archivo).'); event.target.value = ''; return; }
  const st = document.getElementById('esf-fest-' + kind + '-status'); if (st) st.textContent = 'Subiendo…';
  try {
    const dataUrl = await _esfMapaResize(file);
    const r = await khAdminFetch('/.netlify/functions/esferas-subir-imagen', {
      method: 'POST', body: JSON.stringify({ slug, dataUrl, tipo: kind }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok || !data.url) throw new Error(data.error || 'No se pudo subir');
    _esfFestImgShow(kind, data.url);
    const img = document.getElementById('esf-fest-' + kind + '-img');
    if (img) img.src = data.url + '?t=' + (img._t = (img._t || 0) + 1); // cache-bust (upsert mismo path)
    if (st) st.textContent = 'Subido ✓';
  } catch (e) {
    if (st) st.textContent = 'Error: ' + e.message;
  } finally {
    event.target.value = '';
  }
}










// ── Vista previa de la card (UI pura) ────────────────────────────────────────
// Renderiza en vivo cómo se verá la .ev-card del index con los valores del form.
// El único fetch es a /.netlify/functions/deezer (foto), con debounce. No escribe.
const ESF_PREVIEW_MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];





let _esfPreviewImgTimer = null;
const _esfPreviewImgCache = {}; // nombre → src|null (null = sin foto)






// ── Buscador de música Deezer (UI pura: solo lee de /functions/deezer) ────────
// Escribes el artista (campo Nombre), buscas pistas, eliges una → guarda el
// track ID. El ▶ reproduce el preview de 30s. No escribe a repo ni Supabase.
let _esfMusicAudio = null;




// Lista de música rotativa del festival: [{id,label}].
var _esfMusicaLista = [];
function _esfMusicaAdd(id, label) {
  if (!_esfMusicaLista.some(m => m.id === id)) _esfMusicaLista.push({ id: id, label: label });
  _esfMusicaRender();
  const res = document.getElementById('esf-fest-music-results'); if (res) res.innerHTML = '';
  const q = document.getElementById('esf-fest-music-q'); if (q) q.value = '';
}

// ── Festival: paquetes por duración (2e-i, campos básicos) ───────────────────
// zonas/cheapZonas/hotel quedan vacíos aquí; se llenan en 2e-ii/iii. La música NO
// va por paquete (vive en festival.musica).
var _esfPaquetes = [];  // [{ lbl, ds, noches, ride, zonas:[], cheapZonas:[], hotel:[] }]





function _esfMusicElegir(id, label) {
  const inp = document.getElementById('esf-music'); if (inp) inp.value = id;
  const chosen = document.getElementById('esf-music-chosen'); if (chosen) chosen.textContent = '✓ ' + label + ' (id ' + id + ')';
  const cont = document.getElementById('esf-music-results'); if (cont) cont.innerHTML = '';
  _esfMusicStopAudio();
}





// ── U1: sincronizar tabla espejo eventos_meta desde el EV (index.html) ──────
// Lee el EV (client-side, ya lo parsea bien), deriva slug/fecha/fecha_fin/tipo/
// dias por evento y los manda a la función eventos-meta-sync (upsert por slug).
// fecha_fin: festival → fecha + (min(dias,3)-1) días; concierto → la ÚLTIMA
// fecha disponible (max de dsList[]/multifecha[].ds; si no hay, = fecha).
function _fechaMetaToISO(d) {
  // d = 'YYYY-MM-DD' (o más). Devuelve 'YYYY-MM-DD' o null.
  if (typeof d !== 'string' || !d.trim()) return null;
  const s = d.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function _eventoMetaFila(e) {
  const slug = e.id;
  if (!slug) return null;
  const esFest = !!FESTIVALES[slug];
  const dias = FESTIVALES[slug] || 1;
  const tipo = esFest ? 'festival' : 'concierto';

  // Todas las fechas candidatas del evento ('YYYY-MM-DD').
  const cand = [];
  const push = (x) => { const f = _fechaMetaToISO(x); if (f) cand.push(f); };
  push(e.ds);
  if (Array.isArray(e.dsList)) e.dsList.forEach(push);
  if (Array.isArray(e.multifecha)) e.multifecha.forEach(mf => mf && push(mf.ds));

  const fecha = _fechaMetaToISO(e.ds)
    || (Array.isArray(e.multifecha) && e.multifecha[0] ? _fechaMetaToISO(e.multifecha[0].ds) : null)
    || (Array.isArray(e.dsList) ? _fechaMetaToISO(e.dsList[0]) : null)
    || (cand.length ? cand.slice().sort()[0] : null);

  let fecha_fin;
  if (esFest && fecha) {
    const d = new Date(fecha + 'T12:00:00');
    d.setDate(d.getDate() + (Math.min(dias, 3) - 1));
    fecha_fin = d.toISOString().slice(0, 10);
  } else {
    // Concierto: la última fecha disponible (max), o = fecha si no hay más.
    fecha_fin = cand.length ? cand.slice().sort().slice(-1)[0] : fecha;
  }

  return { slug, nombre: e.a || slug, fecha, fecha_fin, tipo, dias };
}

async function _sincronizarEventosMeta(btn) {
  const alertEl = document.getElementById('cfg-eventos-meta-alert');
  if (btn) btn.disabled = true;
  if (alertEl) alertEl.innerHTML = '<div class="alert" style="border-color:var(--border)">Leyendo eventos…</div>';
  try {
    const ev = await _fetchEVFromIndex();
    const eventos = (ev || [])
      .filter(e => e && e.id)
      .map(_eventoMetaFila)
      .filter(Boolean);
    if (!eventos.length) throw new Error('No se encontraron eventos en el EV');

    const r = await khAdminFetch('/.netlify/functions/eventos-meta-sync', {
      method: 'POST', body: JSON.stringify({ eventos }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || 'Error sincronizando');
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-success">✓ ${data.upserted} evento${data.upserted !== 1 ? 's' : ''} sincronizado${data.upserted !== 1 ? 's' : ''}</div>`;
    setTimeout(() => { if (alertEl) alertEl.innerHTML = ''; }, 3000);
  } catch (e) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function guardarConfigMensaje() {
  const body = {
    mensaje_dia:    document.getElementById('cfg-mensaje')?.value.trim()||null,
    mensaje_activo: document.getElementById('cfg-mensaje-activo')?.checked||false,
  };
  const alertEl = document.getElementById('cfg-mensaje-alert');
  try {
    const r = await khAdminFetch('/.netlify/functions/sistema-config-save', {
      method:'POST', body: JSON.stringify(body),
    });
    if (!r.ok) {
      const detail = await r.json().catch(()=>({ error: r.statusText }));
      throw new Error(detail.error || 'Error guardando');
    }
    const { config } = await r.json();
    if (config) _mtConfig = config;
    alertEl.innerHTML='<div class="alert alert-success">✓ Mensaje guardado</div>';
    setTimeout(()=>alertEl.innerHTML='', 2000);
  } catch(e) { alertEl.innerHTML=`<div class="alert alert-error">${e.message}</div>`; }
}

// ── SISTEMA DE ALERTAS Y CORREOS ─────────────────────────────
async function enviarEmailSistema(to, subject, bodyHtml) {
  try {
    await khAdminFetch('/.netlify/functions/send-invite', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        to, subject,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px">
          ${bodyHtml}
          <p style="color:#888899;font-size:12px;margin-top:32px">Kamehouse · Conecta Reynosa</p>
        </div>`,
      }),
    });
  } catch(e) { console.warn('Email error:', e.message); }
}

async function enviarAlertaMemo(tipo, datos = {}) {
  // Guardar en DB
  try {
    let mensaje = '';
    let emailSubject = '';
    let emailBody = '';
    switch(tipo) {
      case 'tour_declinado':
        mensaje = `${datos.nombre||'Un coordi'} declinó el tour: ${datos.evento||''}${datos.motivo?' — Motivo: '+datos.motivo:''}`;
        emailSubject = `❌ Tour declinado — ${datos.evento||''}`;
        emailBody = `<p>${_esfEsc(datos.nombre)} declinó el tour <strong>${datos.evento}</strong>.</p>${datos.motivo?`<p><strong>Motivo:</strong> ${_esfEsc(datos.motivo)}</p>`:''}`;
        break;
      case 'reporte_rechazado':
        mensaje = `Maestro Karin rechazó el reporte de ${datos.coordi||'un coordi'}${datos.motivo?': '+datos.motivo:''}`;
        emailSubject = `Reporte rechazado por Maestro Karin`;
        emailBody = `<p>Maestro Karin rechazó el reporte post-evento de <strong>${_esfEsc(datos.coordi)}</strong>.</p>${datos.motivo?`<p><strong>Motivo:</strong> ${_esfEsc(datos.motivo)}</p>`:''}`;
        break;
      case 'nuevo_usuario':
        mensaje = `Nuevo usuario registrado: ${datos.nombre||''}`;
        // [2026-05-18] Email "Nuevo guerrero Z" desactivado — genera demasiado ruido
        // en admin@conectareynosa.mx. La alerta in-app (sistema_alertas) sigue activa.
        // Si se necesita reactivar, descomentar estas 2 líneas.
        // emailSubject = `👤 Nuevo guerrero Z: ${datos.nombre||''}`;
        // emailBody = `<p>Se registró un nuevo usuario: <strong>${_esfEsc(datos.nombre)}</strong> (${datos.rol||''}).</p>`;
        break;
      case 'strikes':
        mensaje = `${datos.nombre} acumuló ${datos.strikes} strike${datos.strikes!==1?'s':''}${datos.motivo?' — '+datos.motivo:''}`;
        emailSubject = `⚠️ ${datos.strikes >= 3 ? 'SUSPENSIÓN' : 'Advertencia'} — ${datos.nombre}`;
        emailBody = `<p><strong>${_esfEsc(datos.nombre)}</strong> tiene ahora ${datos.strikes} strike${datos.strikes!==1?'s':''}.</p>${datos.motivo?`<p>Motivo: ${_esfEsc(datos.motivo)}</p>`:''}${datos.strikes>=3?'<p style="color:#FF4444"><strong>Cuenta suspendida automáticamente.</strong></p>':''}`;
        break;
      case 'usuario_desactivado':
        mensaje = `Usuario desactivado desde el panel`;
        emailSubject = `🔒 Usuario desactivado`;
        emailBody = `<p>Un usuario fue desactivado desde Montaña Pai.</p>`;
        break;
      default:
        mensaje = JSON.stringify(datos);
        emailSubject = `Alerta Kamehouse: ${tipo}`;
        emailBody = `<p>${_esfEsc(mensaje)}</p>`;
    }
    // INSERT vía Netlify Function con service_role: la tabla tiene RLS que
    // bloquea INSERT desde el cliente anon (daba 401). Mantiene .catch para
    // degradar elegante si la función falla.
    await khAdminFetch('/.netlify/functions/sistema-alertas-write', {
      method: 'POST',
      body: JSON.stringify({ accion: 'crear', tipo, mensaje }),
    }).catch(()=>{});
    // Email a Memo — guard: tipos sin emailSubject (ej. nuevo_usuario desactivado el 2026-05-18) no mandan correo.
    if (emailSubject) await enviarEmailSistema(MEMO_EMAIL, emailSubject, emailBody);
  } catch(e) { console.warn('Alerta error:', e.message); }
}

// Mostrar mensaje del día al entrar — corre post-login para todos los roles.
// Usa la Function sistema-config-get que para roles non-maestro devuelve solo
// mensaje_dia y mensaje_activo (los campos cuenta_* nunca llegan al cliente).
async function checkMensajeDia() {
  try {
    const r = await khAdminFetch('/.netlify/functions/sistema-config-get', { method:'POST' });
    if (!r.ok) return;
    const { config: cfg } = await r.json();
    if (cfg?.mensaje_activo && cfg?.mensaje_dia) {
      let banner = document.getElementById('msg-dia-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'msg-dia-banner';
        banner.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9998;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r-sm,8px);padding:16px 20px;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.5)';
        document.body.appendChild(banner);
      }
      banner.innerHTML = `
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--orange);margin-bottom:8px;letter-spacing:.1em">// MENSAJE DEL DÍA</div>
        <div style="font-size:13px;color:var(--text);line-height:1.5">${_esfEsc(cfg.mensaje_dia)}</div>
        <button onclick="document.getElementById('msg-dia-banner').remove()" style="margin-top:12px;background:none;border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:4px 12px;color:var(--ts);cursor:pointer;font-size:11px;width:100%">Cerrar</button>`;
    }
  } catch(e) {}
}


let _bodegaPiezasCache = [];
let _eventosAsignadosCache = [];













// [F4b] línea legible por diferencia de la comparación salida↔reporte.
function _difTxt(d) {
  if (d.tipo === 'retornable_incompleto') return `• ${d.pieza}: retornable — llevó ${d.llevado}, devolvió ${d.devuelto} (regresan SIEMPRE completas)`;
  if (d.tipo === 'declarado_vs_llevado') return `• ${d.pieza}: llevó ${d.llevado}, declaró ${d.declarado}`;
  if (d.tipo === 'sobrante_mayor_que_sacado') return `• ${d.pieza}: sobrante ${d.sobrante} > sacado ${d.sacado} (error de captura)`;
  if (d.tipo === 'sin_salida_autorizada') return `• ${d.pieza}: declarado ${d.declarado} SIN salida autorizada`;
  return `• ${d.pieza}: diferencia`;
}


// Función compartida — aprueba reporte y descuenta stock
async function ejecutarAprobacionFinal(id, reporte) {
  const jf = await khReportes.aprobarFinal(id); // [sec-reportes]
  // 🗼 TORRE v2 F4a: si el reporte viene de una SALIDA v2 (lo dice el backend),
  // el stock YA se descontó al dar salida y las devoluciones las suma el
  // palomeo de recibido — el descuento legacy de abajo NO corre (evita el
  // DOBLE descuento). Legacy sin salida → flujo de hoy, byte-igual.
  if (jf && jf.salida_v2) {
    const difV2 = reporte?.diferencia || 0;
    const clabeV2 = reporte?.cuenta_bancaria_coordi || 'no registrada';
    let msgV2 = '✓ Aprobado. El stock se movió con la salida de bodega; las devoluciones suman cuando palomees "kits recibidos".';
    if (difV2 > 0) msgV2 += `\n\nSobró ${formatMXN(difV2)}.\nEl coordi debe regresar ese dinero a tu cuenta.`;
    else if (difV2 < 0) msgV2 += `\n\nEl coordi gastó ${formatMXN(Math.abs(difV2))} de más.\nDepositar a: ${clabeV2}`;
    alert(msgV2);
    return;
  }
  // Descontar kits del inventario
  const kits = reporte?.kits_detalle
    ? (typeof reporte.kits_detalle==='string' ? JSON.parse(reporte.kits_detalle) : reporte.kits_detalle)
    : [];
  for (const k of kits.filter(k => (k.cantidad_sacada||0) > 0)) {
    try {
      const pieza = await khKits.obtener(k.pieza_id).catch(()=>null); // [sec-kits]
      if (pieza) {
        const nuevaCantidad = Math.max(0, (pieza.cantidad||0) - (k.cantidad_sacada||0) + (k.cantidad_sobrante||0));
        await khKits.actualizar(k.pieza_id, { cantidad: nuevaCantidad }); // [sec-kits]
      }
    } catch(e) { console.warn('Stock update error:', k.pieza_id, e.message); }
  }
  // Notificación financiera
  const dif = reporte?.diferencia || 0;
  const clabe = reporte?.cuenta_bancaria_coordi || 'no registrada';
  if (dif > 0) {
    alert(`✓ Aprobado y stock actualizado.\n\nSobró ${formatMXN(dif)}.\nEl coordi debe regresar ese dinero a tu cuenta.`);
  } else if (dif < 0) {
    alert(`✓ Aprobado y stock actualizado.\n\nEl coordi gastó ${formatMXN(Math.abs(dif))} de más.\nDepositar a: ${clabe}`);
  } else {
    alert('✓ Reporte aprobado y stock actualizado.');
  }
}





// ═══════════════════════════════════════════════════════════════
// DELIVERABLES · material entregable por evento asignado a creadora
// ═══════════════════════════════════════════════════════════════
const _DELIVERABLES_DEFAULT = [
  "Video Reel (1080x1920)",
  "3-4 menciones en historias",
  "Post collab con fotos",
];

// [sec-deliverables] Acceso a deliverables_creadoras vía Netlify Function con
// service_role (cerramos lectura/escritura anon). El backend hace cumplir el
// candado: cc SOLO ve/edita/borra los deliverables de SUS asignaciones;
// maestro_roshi/bulma todo. Es un checklist (estado/link/notas), no archivos.
const khDeliverables = {
  async _call(payload) {
    const r = await khAdminFetch('/.netlify/functions/admin-deliverables', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('admin-deliverables ' + r.status));
    return j;
  },
  // listar(ids[]) → array de deliverables de esas asignaciones (filtrado server-side por dueño)
  listar(eventoCoordiIds) { return this._call({ accion: 'listar', evento_coordi_ids: eventoCoordiIds }).then(j => j.rows || []); },
  // obtener(id) → un deliverable o null (para prellenar prompts)
  obtener(id) { return this._call({ accion: 'obtener', id }).then(j => j.row || null); },
  // crearDefaults(ecId, [desc,...]) → array insertado
  crearDefaults(eventoCoordiId, descripciones) { return this._call({ accion: 'crear_defaults', evento_coordi_id: eventoCoordiId, descripciones }).then(j => j.rows || []); },
  // addExtra(ecId, desc) → fila insertada
  addExtra(eventoCoordiId, descripcion) { return this._call({ accion: 'add_extra', evento_coordi_id: eventoCoordiId, descripcion }).then(j => j.row || null); },
  // toggle(id) → fila actualizada (estado invertido server-side)
  toggle(id) { return this._call({ accion: 'toggle', id }).then(j => j.row || null); },
  editarLink(id, link) { return this._call({ accion: 'editar_link', id, link_contenido: link }); },
  editarNotas(id, notas) { return this._call({ accion: 'editar_notas', id, notas }); },
  borrar(id) { return this._call({ accion: 'borrar', id }); },
};











// ═══════════════════════════════════════════════════════════════
// CONTRATOS · creadores de contenido
// ═══════════════════════════════════════════════════════════════
let _contratosCache = [];
let _contratosEditingToken = null;        // null = creando, "abc..." = editando
let _contratosEVCache = null;             // EV array fetched from /index.html
let _contratosEVPobladoEnSelect = false;

// — Cláusulas legales (idéntico texto que contrato.html) ——————
const _CTR_CLAUSULAS = [
  { num:1, t:'Objeto del contrato', body: c => `El presente Contrato regula la colaboración entre <b>CONECTA REYNOSA</b> (en adelante, "la Agencia") y <b>${_escCtr(c.creador_nombre)}</b> (en adelante, "el Creador de Contenido"), mediante un intercambio que incluye beneficios detallados en la cláusula 5, a cambio de la generación y entrega de contenido audiovisual bajo las condiciones descritas en este documento.` },
  { num:2, t:'Detalle del intercambio', body: c => `<b>2.1 Lo que ofrece la Agencia:</b>${_ulCtr(c.ofrecimiento)}<b style="display:block;margin-top:10px">2.2 Lo que se espera del Creador de Contenido:</b>${_ulCtr(c.expectativas)}` },
  { num:3, t:'Propiedad del contenido', body: () => `
<ul style="margin:6px 0 0;padding-left:20px">
<li>Todo el contenido generado será de propiedad exclusiva de la Agencia.</li>
<li>Solo la Agencia podrá distribuir, publicar y usar el contenido en sus plataformas.</li>
<li>Cualquier publicación por parte del Creador de Contenido deberá ser etiquetada como colaboración oficial con la Agencia.</li>
</ul>` },
  { num:4, t:'Requisitos del contenido', body: () => `
<b>4.1 Calidad y formato del contenido</b>
<ol style="margin:6px 0 12px;padding-left:22px">
<li><b>Calidad técnica:</b> Material en HD o 4K. Cualquier material de calidad inferior será rechazado.</li>
<li><b>Formato:</b> Videos en formato Reel o video vertical para redes sociales (1080 × 1920 píxeles).</li>
<li><b>Iluminación y presentación:</b> Todo contenido, incluidas las menciones durante el evento, deberá tener buena iluminación, claridad y demostrar que el Creador está disfrutando una experiencia increíble.</li>
</ol>

<b>4.2 Requisitos de la voz</b>
<ol style="margin:6px 0 12px;padding-left:22px">
<li><b>Audición clara:</b> sin ruidos de fondo que interfieran con el mensaje.</li>
<li><b>Buena dicción:</b> hablar de manera clara y entendible.</li>
<li><b>Tono respetuoso:</b> acorde al profesionalismo de la Agencia.</li>
<li><b>Adecuación:</b> ajustarse al propósito del video (experiencia, comercial o contenido extra).</li>
</ol>

<b>4.3 Historias y publicaciones</b>
<ol style="margin:6px 0 12px;padding-left:22px">
<li>Las menciones en el evento deberán publicarse como historias en <b>Instagram y/o TikTok</b>.</li>
<li>Las redes sociales del Creador deberán estar en modo <b>público</b> durante: la duración del evento + un lapso de <b>10 a 15 días</b> posteriores a la publicación del contenido.</li>
<li>Sanciones por incumplimiento: <span style="color:#ff283b;font-weight:800">25%</span> primera infracción · <span style="color:#ff283b;font-weight:800">50%</span> si persiste.</li>
</ol>

<b>4.4 Plazo de entrega</b>
<ol style="margin:6px 0 12px;padding-left:22px">
<li>El contenido debe ser entregado de <b>2 a 3 días</b> después del evento.</li>
<li>Multas por retraso: <span style="color:#ff283b;font-weight:800">25%</span> (1–7 días) · <span style="color:#ff283b;font-weight:800">50%</span> (7–10) · <span style="color:#ff283b;font-weight:800">75%</span> (10–15) · <span style="color:#ff283b;font-weight:800">100%</span> (más de 15 días).</li>
</ol>

<b>4.5 Correcciones</b>
<ol style="margin:6px 0 12px;padding-left:22px">
<li>El Creador tiene <b>24 horas</b> para hacer los ajustes solicitados.</li>
<li>Si no cumple el plazo: <span style="color:#ff283b;font-weight:800">50%</span> del costo del intercambio. Si ningún video cumple con las expectativas: <span style="color:#ff283b;font-weight:800">100%</span>.</li>
</ol>

<b>4.6 Exclusividad durante el evento:</b> Durante el evento, el Creador no podrá promocionar a otras agencias competidoras o servicios similares de viajes a conciertos. El incumplimiento resultará en cancelación inmediata del contrato y cobro del <span style="color:#ff283b;font-weight:800">100%</span> del intercambio.<br>

<b>4.7 Veto de contenido:</b> La Agencia se reserva el derecho de solicitar la eliminación de contenido publicado que no cumpla con los estándares acordados, en un plazo máximo de <b>24 horas</b>. El no cumplimiento resultará en multa del <span style="color:#ff283b;font-weight:800">50%</span> del valor del intercambio.` },
  { num:5, t:'Políticas de cancelación', body: () => `
El contrato podrá cancelarse por las siguientes razones:
<ol style="margin:8px 0 0;padding-left:22px">
<li><b>Incumplimiento de calidad</b> (técnica, iluminación, formato, menciones).</li>
<li><b>Imagen pública:</b> polémicas, problemas legales o comportamientos que afecten la imagen de la Agencia.</li>
<li><b>Redes sociales privadas</b> durante el plazo estipulado.</li>
<li><b>Entregas incumplidas:</b> no entrega en tiempo y forma o no realizar las correcciones solicitadas.</li>
<li><b>Reembolso del intercambio:</b> en caso de incumplimiento total del Creador (no asistencia, no entrega), el Creador deberá reembolsar el valor comercial del intercambio dentro de <b>15 días naturales</b> contados a partir de la fecha del evento.</li>
</ol>` },
  { num:6, t:'Beneficios para el Creador de Contenido', body: () => `
<ol style="margin:6px 0 0;padding-left:22px">
<li><b>Entradas:</b> acceso al evento o festival en zonas de buena ubicación.</li>
<li><b>Viaje y alojamiento</b> (si aplica): transporte, traslados, kit Conecta, hospedaje y otros servicios según la logística del evento.</li>
<li><b>Extras:</b> otros beneficios serán detallados dependiendo del intercambio acordado.</li>
</ol>` },
  { num:7, t:'Compromiso del Creador de Contenido', body: () => `
El Creador de Contenido se compromete a:
<ol style="margin:8px 0 0;padding-left:22px">
<li>Generar contenido que represente positivamente la experiencia del evento.</li>
<li>Aceptar las solicitudes de colaboración etiquetada en redes sociales.</li>
<li>Publicar historias y menciones durante el evento con buena calidad y en redes públicas.</li>
<li>Cumplir con las fechas y plazos establecidos para entrega y correcciones.</li>
</ol>` },
  { num:8, t:'Cláusulas finales', body: () => `
<b>8.1 Hashtags</b>
<ul style="margin:6px 0 12px;padding-left:22px">
<li><b>#Viajaconexpertos</b></li>
<li><b>#Seguimosconectando</b></li>
<li><b>#CMX10</b></li>
</ul>

<b>8.2 Confidencialidad:</b> Toda la información y beneficios otorgados al Creador son confidenciales y no podrán divulgarse sin autorización de la Agencia.<br>

<b>8.3 Datos personales y uso de imagen:</b> El Creador autoriza el uso de su imagen, nombre y contenido generado para fines promocionales de la Agencia por un periodo indefinido, en todas sus plataformas digitales, redes sociales, campañas publicitarias y materiales promocionales presentes y futuros.<br>

<b>8.4 Jurisdicción:</b> Cualquier controversia derivada del presente contrato será resuelta en los tribunales competentes de <b>Reynosa, Tamaulipas, México</b>, renunciando ambas partes a cualquier otro fuero que pudiera corresponderles.` },
  { num:9, t:'Firmas', body: () => `Yo, <b>el Creador de Contenido</b>, he leído, entendido y aceptado los términos y condiciones de este contrato. Por parte de la Agencia firma <b>Guillermo Alexander Cobos Vizcarra</b>, Representante de Conecta Reynosa. La firma digital del Creador y el envío de su INE constituyen la aceptación plena del presente contrato.` },
];

// — VÍA B (F5): cláusulas de COORDINADOR (12) y GIVEAWAY (6) para la vista previa
//   admin. Texto FIEL de contratos-viaB-v3.1-TEXTO-OFICIAL.md (mismo que renderiza
//   contrato.html en la firma). {{campos}} se inyectan vía el ctx de _viaBCtxKh.
// VIGENCIA CONFIGURABLE: meses → "seis (6)" (mismo helper que contrato.html).
function _vigenciaLetraKh(n) {
  const map = { 3: 'tres (3)', 6: 'seis (6)', 9: 'nueve (9)', 12: 'doce (12)' };
  return map[n] || (n + ' (' + n + ')');
}
function _viaBCtxKh(c) {
  const firmado = c.estado === 'firmado';
  const d = c.datos || {};
  const em = (d.emergencia && typeof d.emergencia === 'object') ? d.emergencia : {};
  const _fb = v => (v == null || String(v).trim() === '') ? '__________' : _escCtr(String(v));
  const vigMeses = Math.round(Number(c.vigencia_meses)) || (c.plantilla === 'creadora_team' ? 3 : 12);
  // [T1] Mismo gate que contrato.html: la vista previa muestra el texto que el
  // backend va a sellar, no uno distinto.
  const exclusivaDura = d.exclusividad_dura === true;
  return {
    exclusivaDura,
    nombre: _escCtr(c.creador_nombre || ''), fnac: _fb(d.fecha_nacimiento),
    vigMeses,
    vigDura: _vigenciaLetraKh(vigMeses).toUpperCase() + ' MESES',
    vigLetra: _vigenciaLetraKh(vigMeses),
    firmaTxt: firmado ? _escCtr(_fmtFechaLargaCtr((c.vigencia_inicio||'').slice(0,10))) : 'tu firma',
    finTxt:   firmado ? _escCtr(_fmtFechaLargaCtr((c.vigencia_fin||'').slice(0,10)))    : `${_vigenciaLetraKh(vigMeses)} meses después`,
    vigResumen: firmado
      ? `del ${_escCtr(_fmtFechaLargaCtr((c.vigencia_inicio||'').slice(0,10)))} al ${_escCtr(_fmtFechaLargaCtr((c.vigencia_fin||'').slice(0,10)))}`
      : `${_vigenciaLetraKh(vigMeses)} meses a partir de tu firma`,
    emNom: _fb(em.nombre), emTel: _fb(em.telefono), emPar: _fb(em.parentesco),
    evento: _escCtr(c.evento_nombre || ''), fechaEvento: _escCtr(_fmtFechaCortaCtr(c.evento_fecha)),
    desglose: _escCtr(String(d.desglose_premio || '__________')),
    valor: (d.valor_premio && Number(d.valor_premio)) ? Number(d.valor_premio).toLocaleString('es-MX') : '__________',
  };
}
const _CTR_COORDINADOR = [
  { ord:'PRIMERA', t:'Naturaleza NO laboral, explicada', body:()=>`Esta es una colaboración por intercambio: el coordinador apoya en los viajes y recibe los beneficios de la cláusula Tercera. No hay salario, no hay subordinación laboral, no hay prestaciones ni derechos de una relación de trabajo. Participar es voluntario; los compromisos de este contrato existen porque el coordinador acepta el intercambio, no porque sea empleado.` },
  { ord:'SEGUNDA', t:'Funciones, con estándar de cumplimiento', body:()=>`El coordinador se compromete a: apoyar la logística completa del tour (control de pasajeros, boletos, habitaciones, equipaje y horarios) SIGUIENDO LAS LISTAS Y HERRAMIENTAS DEL SISTEMA que la agencia le proporcione; mantener comunicación constante por los grupos oficiales; entregar los kits y materiales oficiales completos; realizar pagos menores entregando SIEMPRE comprobantes; y velar por la seguridad, imagen y experiencia de los viajeros. El estándar es simple: si está en la lista, se cumple y se registra; lo no registrado se considera no hecho.` },
  { ord:'TERCERA', t:'Beneficios del intercambio', body:()=>`Por cada tour en que participe: transporte (terrestre o aéreo según destino), hospedaje en hotel de categoría cuatro estrellas, boleto en la mejor localidad disponible, y Kit Conecta. En accidente o enfermedad durante el viaje, la agencia cubre los gastos médicos iniciales hasta que reciba atención formal. Estos beneficios no constituyen salario.` },
  { ord:'CUARTA', t:'Comisiones por venta', body:()=>`El coordinador podrá vender boletos de los tours con una comisión del <b>30% sobre la ganancia neta</b> del boleto (no sobre el total de la venta). Las condiciones de pago de la comisión se notifican por escrito o medio digital en cada campaña.` },
  { ord:'QUINTA', t:'Materiales y bodega — con plazo', body:()=>`Todo material, boleto, dinero o equipo confiado queda bajo resguardo personal del coordinador. Los sobrantes y equipos deben devolverse en óptimas condiciones <b>EN UN MÁXIMO DE 5 (CINCO) DÍAS NATURALES</b> después del viaje. Daño, pérdida o no devolución obliga a reponer el costo vigente del artículo. Las salidas y devoluciones se declaran en el sistema de bodega de la agencia.` },
  { ord:'SEXTA', t:'Registro de faltas (strikes)', body:()=>`Las faltas operativas y de conducta se registran en el sistema y se acumulan. La acumulación de <b>3 (tres) faltas</b> causa la suspensión de la colaboración, independientemente de que una sola falta grave pueda causar la terminación inmediata conforme a la cláusula Décima.` },
  { ord:'SÉPTIMA', t:'Imagen, uniforme y redes', body:()=>`La imagen pública y el comportamiento digital del coordinador deben ser coherentes con los valores de la marca. El uso de uniforme o gafete oficial es obligatorio cuando se proporcione. El coordinador mantendrá comunicación activa en los grupos oficiales de WhatsApp; podrá compartir contenido personal del viaje respetando la imagen de Conecta, y compartirá oportunamente el contenido que la agencia requiera para promoción. Todo material audiovisual generado en viajes o eventos podrá ser usado por Conecta para fines promocionales sin pago adicional.` },
  { ord:'OCTAVA', t:'CONDUCTA — tolerancia cero, sin ambigüedades', body:()=>`Durante viajes, eventos y actividades internas queda <b>ESTRICTAMENTE PROHIBIDO</b>, y constituye <b style="color:#ff283b">FALTA GRAVE</b> con terminación inmediata:
<ol style="list-style:lower-alpha;margin:8px 0 0;padding-left:22px">
<li>el <b>ACOSO SEXUAL</b> u hostigamiento en cualquier forma hacia viajeros, compañeros, choferes o terceros;</li>
<li>la <b>EMBRIAGUEZ</b>: el consumo de alcohol solo se permite de manera moderada y NUNCA al grado de afectar la operación, la seguridad o la imagen del grupo — estar ebrio en funciones es falta grave;</li>
<li>el consumo, posesión o distribución de <b>DROGAS</b> o sustancias ilegales;</li>
<li>las <b>RELACIONES ROMÁNTICAS O SEXUALES CON VIAJEROS</b> durante los tours: el coordinador está en función de servicio y de autoridad, y esa línea no se cruza;</li>
<li><b>VINCULAR LA MARCA A CONTENIDO PARA ADULTOS</b>: la agencia respeta la vida privada y las actividades lícitas de cada quien, pero queda prohibido usar uniformes, gafetes, materiales, instalaciones, viajes o el nombre de Conecta en contenido para adultos o plataformas de contenido erótico (OnlyFans u otras), o aprovechar el rol de coordinador para promoverlo;</li>
<li>los <b>ESCÁNDALOS PÚBLICOS ("funas")</b>: protagonizar o provocar conflictos públicos, en persona o en redes, que dañen la reputación de la agencia.</li>
</ol>
Cualquiera de estas conductas termina el contrato de inmediato, sin indemnización, con pérdida de beneficios del viaje en curso y sin perjuicio de las acciones legales que procedan.` },
  { ord:'NOVENA', t:'Respeto, confidencialidad y exclusividad', body:x=>`Trato respetuoso y cordial con viajeros, choferes y compañeros en todo momento — el acoso, la discriminación y la violencia son falta grave. Toda la información interna (estrategias, precios, bases de datos, logística, listas de viajeros, documentación) es <b>CONFIDENCIAL</b> y no puede divulgarse ni usarse para fines ajenos, obligación que SOBREVIVE a la terminación del contrato. ${x.exclusivaDura ? `Durante la vigencia de este contrato, la colaboración del coordinador con la agencia es <b>EXCLUSIVA</b>: el coordinador no podrá trabajar, colaborar ni prestar servicios, directa o indirectamente, de forma pagada o no pagada, con ninguna otra agencia de viajes ni negocio competidor. El incumplimiento de esta exclusividad constituye falta grave y es causa de <b>BAJA INMEDIATA</b> del equipo y de terminación del presente contrato sin necesidad de aviso previo. Si el coordinador no puede asistir a un evento confirmado, propondrá suplente sujeto a aprobación previa.` : `Durante la vigencia, el coordinador no colaborará con agencias competidoras sin autorización escrita; si no puede asistir a un evento confirmado, propondrá suplente sujeto a aprobación previa.`}` },
  { ord:'DÉCIMA', t:'Faltas graves y terminación', body:()=>`Son causa de terminación inmediata y pérdida de derechos: no presentarse a un viaje confirmado; abandonar un tour sin autorización; faltar al respeto a viajeros o compañeros; afectar la imagen o reputación de Conecta; y cualquiera de las conductas de la cláusula Octava. La terminación no genera indemnización ni pago adicional. En las fiestas y eventos internos aplica la misma conducta profesional que en los viajes oficiales.` },
  { ord:'DÉCIMA PRIMERA', t:'Emergencia e identidad', body:x=>`El coordinador designa contacto de emergencia: <b>${_esfEsc(x.emNom)}</b> (${_esfEsc(x.emTel)}, ${_esfEsc(x.emPar)}), asume los riesgos del viaje en los términos de la cláusula Décima del contrato de viajero, autoriza primeros auxilios y atención médica de ser necesario, y anexa su INE como evidencia de identidad.` },
  { ord:'DÉCIMA SEGUNDA', t:'Vigencia y formalidades', body:x=>`Este contrato dura <b>${x.vigDura}</b> desde su firma (${x.firmaTxt} → ${x.finTxt}); su renovación requiere nueva firma. Cualquiera de las partes puede terminarlo antes con aviso escrito de 15 días naturales. Las modificaciones solo valen por escrito; los acuerdos verbales no tienen validez. Las notificaciones por los canales oficiales (correo institucional o WhatsApp autorizado) son legalmente válidas. Jurisdicción: Monterrey, Nuevo León. La firma digital tiene la misma validez que la autógrafa.` },
];
const _CTR_GIVE = [
  { ord:'PRIMERA', t:'Objeto — qué incluye exactamente tu premio', body:x=>`LA AGENCIA otorga a EL GANADOR un viaje gratuito al evento <b>${x.evento}</b> (${x.fechaEvento}) que incluye, sin costo alguno para él: <b>${x.desglose}</b> (por ejemplo: boleto/abono en zona ____; transporte redondo desde ____; traslados internos del itinerario; hospedaje en habitación compartida; Kit Conecta con una comida y artículos promocionales). Lo que NO esté listado aquí no forma parte del premio (consumos personales, compras, gastos extra).` },
  { ord:'SEGUNDA', t:'Condiciones — explicadas una por una', body:x=>`<ol style="list-style:lower-alpha;margin:8px 0 0;padding-left:22px">
<li><b>PERSONAL E INTRANSFERIBLE</b>: el premio es para EL GANADOR y nadie más; no puede cederse, venderse, ni cambiarse por dinero, otro evento, fecha o destino — si no puede asistir, el premio simplemente se pierde.</li>
<li><b>ASISTENCIA COMPLETA</b>: ganar incluye el compromiso de tomar el viaje completo, respetando horarios y actividades del itinerario; el premio es la experiencia entera, no partes de ella.</li>
<li><b>PENALIZACIÓN</b>: si EL GANADOR no se presenta, decide no tomar el viaje completo, o incumple alguna regla del tour, deberá <b style="color:#ff283b">CUBRIR EL COSTO TOTAL DEL VIAJE</b>, equivalente a <b>$${x.valor} MXN</b> — porque ese lugar tuvo un costo real que la agencia absorbió como premio.</li>
<li>A cambio, LA AGENCIA se obliga a entregar el viaje completo tal como se especifica, con todos los servicios incluidos.</li>
</ol>` },
  { ord:'TERCERA', t:'Responsabilidad, conducta y reglas del viaje', body:()=>`El viaje se realiza bajo las condiciones operativas normales del tour. LA AGENCIA no responde por factores externos (retrasos ajenos, clima, eventualidades fuera de su control). EL GANADOR se compromete a comportarse con respeto y seguir las indicaciones del personal durante todo el tour, y queda sujeto a las políticas de terceros, las multas de hotel y el deslinde de responsabilidad en los mismos términos de las cláusulas Novena y Décima del contrato de viajero, que declara conocer (incluido: seguro de viajero DENTRO del autobús; DENTRO del evento la responsabilidad es de los organizadores).` },
  { ord:'CUARTA', t:'Emergencia e identidad', body:x=>`Contacto de emergencia: <b>${_esfEsc(x.emNom)}</b> (${_esfEsc(x.emTel)}, ${_esfEsc(x.emPar)}); INE anexa como evidencia de identidad.` },
  { ord:'QUINTA', t:'Imagen', body:()=>`EL GANADOR autoriza el uso de su nombre e imagen en las publicaciones de la dinámica y del viaje en los canales oficiales de LA AGENCIA, sin pago adicional — es parte natural de ganar una dinámica pública.` },
  { ord:'SEXTA', t:'Aceptación', body:()=>`EL GANADOR firma de conformidad, reconociendo que recibe el premio completo bajo estas condiciones: casilla de términos + firma electrónica + INE anexa.` },
];

// Vista previa admin para VÍA B. Devuelve HTML (mismo look que _renderContratoHTML).
// CREADORA_TEAM: la vista previa muestra proemio + vigencia + los TÍTULOS de las
// 18 cláusulas — el texto completo vive SOLO en contrato.html (fuente:
// contrato-team-v1-TEXTO-OFICIAL.md v1.1); no se transcribe dos veces para que
// jamás diverja del canónico.
const _CTR_TEAM_TITULOS = [
  ['PRIMERA','Objeto, alcance del rol y naturaleza de la relación'],['SEGUNDA','Vigencia, periodo de prueba y posible renovación'],
  ['TERCERA','Entregables semanales, organización y flujo de trabajo'],['CUARTA','Requisitos técnicos, calidad, formato y estándares'],
  ['QUINTA','Beneficios del intercambio'],['SEXTA','Entrega, revisión, aprobación y correcciones'],
  ['SÉPTIMA','Asignación de eventos, avisos y rechazos (45% máx. de rechazos)'],['OCTAVA','Etiquetado, collab, hashtags y redes en modo público'],
  ['NOVENA','Propiedad intelectual, uso de imagen y derechos de explotación'],['DÉCIMA','Imagen pública, contenido sensual, contenido prohibido y reputación'],
  ['DÉCIMA PRIMERA','Conducta, alcohol, drogas y presentación en cámara'],['DÉCIMA SEGUNDA','Confidencialidad y no divulgación'],
  ['DÉCIMA TERCERA','Exclusividad'],['DÉCIMA CUARTA','Incumplimientos, clasificación y sanciones (3 strikes = terminación)'],
  ['DÉCIMA QUINTA','Pérdidas, negligencias y daños'],['DÉCIMA SEXTA','Terminación y rescisión'],
  ['DÉCIMA SÉPTIMA','Modificaciones'],['DÉCIMA OCTAVA','Jurisdicción'],
];
function _renderContratoTeamKh(c) {
  const x = _viaBCtxKh(c);
  const titulos = _CTR_TEAM_TITULOS.map(([ord, t]) => `
    <div style="padding:7px 0 7px 12px;border-left:4px solid #e8ff4c;margin-top:8px;font-size:13px;color:#000">
      <span style="color:#ff283b;font-weight:900;margin-right:8px">${_escCtr(ord)}</span><b>${_escCtr(t)}</b>
    </div>`).join('');
  return `
    <div style="display:flex;flex-wrap:wrap;gap:18px 28px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;font-weight:700"><span><b style="color:#000">Creadora (Imagen Oficial):</b> ${_esfEsc(x.nombre)}</span><span><b style="color:#000">Vigencia:</b> ${x.vigLetra} meses</span></div>
    <h2 style="font-family:'Barlow Condensed','Montserrat',sans-serif;font-size:34px;line-height:.92;text-transform:uppercase;margin:14px 0 0;color:#000">Contrato marco · Creadora TEAM<small style="display:block;font-size:13px;color:#ff283b;font-weight:800;letter-spacing:.18em;margin-top:6px">Imagen Oficial · periodo de prueba</small></h2>
    <p style="font-size:13.5px;line-height:1.6;color:#222;margin-top:14px">Entre <b>CONECTA REYNOSA</b> (Guillermo Cobos Vizcarra, Director General) y <b>${_esfEsc(x.nombre)}</b> ("LA CREADORA"), con vigencia de <b>${x.vigLetra} meses</b> a partir de la firma. Al firmar, la creadora completa sus datos del proemio y el <b>Anexo C (Declaración Discreta, confidencial)</b>.</p>
    <div style="margin-top:16px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#666;font-weight:800">18 cláusulas — texto oficial v1.1</div>
    ${titulos}
    <p style="margin-top:16px;font-size:12px;color:#666">El texto completo (fiel a contrato-team-v1-TEXTO-OFICIAL.md) se muestra en la página de firma /contrato — esta vista previa solo resume.</p>`;
}
function _renderContratoViaBHTML(c) {
  if (c && c.plantilla === 'creadora_team') return _renderContratoTeamKh(c);
  const x = _viaBCtxKh(c);
  const esCoord = c.plantilla === 'coordinador';
  const set = esCoord ? _CTR_COORDINADOR : _CTR_GIVE;
  const tituloDoc = esCoord ? 'Contrato de colaboración · Coordinadores' : 'Contrato de aceptación de premio · Giveaway';
  const meta = esCoord
    ? `<div style="display:flex;flex-wrap:wrap;gap:18px 28px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;font-weight:700"><span><b style="color:#000">Coordinador(a):</b> ${_esfEsc(x.nombre)}</span><span><b style="color:#000">Nacimiento:</b> ${x.fnac}</span><span><b style="color:#000">Vigencia:</b> ${x.vigResumen}</span></div>`
    : `<div style="display:flex;flex-wrap:wrap;gap:18px 28px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;font-weight:700"><span><b style="color:#000">Ganador(a):</b> ${_esfEsc(x.nombre)}</span><span><b style="color:#000">Evento:</b> ${x.evento}</span><span><b style="color:#000">Fecha:</b> ${x.fechaEvento}</span></div>`;
  const clausulas = set.map(cl => `
    <div style="margin-top:22px">
      <h3 style="font-family:'Barlow Condensed','Montserrat',sans-serif;text-transform:uppercase;font-size:20px;letter-spacing:.04em;margin:0 0 10px;border-left:5px solid #e8ff4c;background:linear-gradient(90deg,rgba(232,255,76,.2),transparent 60%);padding:6px 0 6px 12px;color:#000">
        <span style="color:#ff283b;font-weight:900;font-size:18px;margin-right:10px">${_escCtr(cl.ord)}</span>${_escCtr(cl.t)}
      </h3>
      <div style="font-size:13.5px;line-height:1.65;color:#222">${cl.body(x)}</div>
    </div>`).join('');
  return `
    ${meta}
    <h2 style="font-family:'Barlow Condensed','Montserrat',sans-serif;font-size:34px;line-height:.92;text-transform:uppercase;margin:14px 0 0;color:#000">${_escCtr(tituloDoc)}<small style="display:block;font-size:13px;color:#ff283b;font-weight:800;letter-spacing:.18em;margin-top:6px">${_escCtr(c.evento_nombre || '')}</small></h2>
    ${clausulas}
  `;
}

function _escCtr(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function _ulCtr(arr) { if (!Array.isArray(arr) || !arr.length) return ''; return `<ul style="margin:6px 0 0;padding-left:20px">${arr.map(x => `<li>${_escCtr(x)}</li>`).join('')}</ul>`; }
function _fmtFechaLargaCtr(iso) {
  if (!iso) return '—';
  const [y,m,d] = String(iso).slice(0,10).split('-'); if (!y || !m || !d) return iso;
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d,10)} de ${meses[parseInt(m,10)-1] || ''} de ${y}`;
}
function _fmtFechaCortaCtr(iso) {
  if (!iso) return '—';
  const [y,m,d] = String(iso).slice(0,10).split('-'); if (!y || !m || !d) return iso;
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d,10)} ${meses[parseInt(m,10)-1] || ''}`;
}
function _splitLineas(s) {
  return String(s || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

// — Cargar EV array desde /index.html (single source of truth) ———————
// [VEN-BORRA-1b] Esta función NO era del vendedor aunque llevara su prefijo, y
// por poco se va con el bloque: `_fetchEVFromIndex` la usa para armar los STUBS
// con los que evalúa el arreglo EV. Los eventos que escriben `hotel: HOTEL_CDM`
// —la mayoría de CDMX— hacen reventar ese `new Function` si las declaraciones
// no están, y con el catálogo muerto se cae KameHouse entero. Renombrada a
// `_ev*` porque pertenece al cargador del catálogo, no a Ventas.
function _evDeclaracionesHotel(html) {
  const out = [];
  for (const nombre of ['HOTEL_STD', 'HOTEL_MTY', 'HOTEL_CDM']) {
    const m = String(html).match(new RegExp('var\\s+' + nombre + '\\s*=\\s*\\['));
    if (!m) continue;
    const start = m.index + m[0].length - 1;
    let depth = 0, inStr = false, sc = '', esc = false, end = -1;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (esc) { esc = false; continue; }
      if (inStr) { if (ch === '\\') { esc = true; continue; } if (ch === sc) inStr = false; continue; }
      if (ch === '"' || ch === "'") { inStr = true; sc = ch; continue; }
      if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (!depth) { end = i + 1; break; } }
    }
    if (end > 0) out.push('var ' + nombre + '=' + html.slice(start, end) + ';');
  }
  return out.join('');
}

async function _fetchEVFromIndex() {
  if (_contratosEVCache) return _contratosEVCache;
  try {
    const r = await fetch('/index.html', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    const m = html.match(/var\s+EV\s*=\s*\[/);
    if (!m) throw new Error('var EV no encontrado en index.html');
    const start = m.index + m[0].length - 1;
    let depth = 0, inStr = false, sc = '', esc = false, end = -1;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (esc) { esc = false; continue; }
      if (inStr) { if (ch === '\\') { esc = true; continue; } if (ch === sc) inStr = false; continue; }
      if (ch === '"' || ch === "'") { inStr = true; sc = ch; continue; }
      if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (!depth) { end = i + 1; break; } }
    }
    if (end < 0) throw new Error('Array EV sin cerrar');
    const arrText = html.slice(start, end);
    // 🔒 AUD-2: los HOTEL_* ya NO se stubbean a []. Se toma su declaración REAL
    // del mismo index.html, porque los eventos que escriben `hotel:HOTEL_CDM`
    // (la mayoría de CDMX) quedaban con ev.hotel vacío y el cotizador del
    // cotizador no podía resolver ningún hotel. Se siguen necesitando para
    // que el propio `new Function` del EV no truene con `hotel: HOTEL_CDM`.
    const decls = _evDeclaracionesHotel(html);
    const stubs = 'var BANCO_DEFAULT={},BANCO_HEY={};' + decls;
    const ev = new Function(stubs + 'return ' + arrText + ';')();
    if (!Array.isArray(ev)) throw new Error('EV no es array');
    _contratosEVCache = ev;
    return ev;
  } catch (e) {
    console.warn('[Contratos] No se pudo cargar EV de index.html:', e.message);
    return [];
  }
}

async function _poblarSelectEventos() {
  if (_contratosEVPobladoEnSelect) return;
  const sel = document.getElementById('ctr-evento-select');
  if (!sel) return;
  const ev = await _fetchEVFromIndex();
  if (!ev.length) return;
  const today = new Date().toISOString().slice(0, 10);
  // Filtrar: solo fechas futuras o sin fecha. Incluye agotados y por-confirmar:
  // las creadoras son staff y deben poder asociarse a cualquier tour vigente.
  const filtered = ev.filter(e =>
    e && e.id && e.a &&
    (!e.ds || e.ds >= today)
  );
  // Orden cronológico ascendente.
  const sorted = filtered.slice().sort((a, b) => (a.ds || '9999').localeCompare(b.ds || '9999'));
  // Limpiar opciones existentes salvo la primera ("— Selecciona —").
  while (sel.options.length > 1) sel.remove(1);
  sorted.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.dataset.nombre = e.a;
    opt.dataset.fecha = (e.ds || '').slice(0, 10);
    opt.textContent = e.a;
    sel.appendChild(opt);
  });
  _contratosEVPobladoEnSelect = true;
}

// — Autocomplete de creadoras previas ————————————————
// Mapa nombre→email y email→nombre, construido desde _contratosCache (cargado
// por loadContratosList). Dedupe por email (case-insensitive).
let _contratosCreadorasNombre2Email = {};
let _contratosCreadorasEmail2Nombre = {};
function _rebuildCreadorasDatalists() {
  const listN = document.getElementById('ctr-datalist-nombres');
  const listE = document.getElementById('ctr-datalist-emails');
  if (!listN || !listE) return;
  _contratosCreadorasNombre2Email = {};
  _contratosCreadorasEmail2Nombre = {};
  const seen = new Set();
  for (const c of (_contratosCache || [])) {
    const email = (c.creador_email || '').trim().toLowerCase();
    const nombre = (c.creador_nombre || '').trim();
    if (!email || !nombre) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    _contratosCreadorasNombre2Email[nombre.toLowerCase()] = { nombre, email };
    _contratosCreadorasEmail2Nombre[email] = { nombre, email };
  }
  // Ordenar alfabéticamente por nombre.
  const entries = Object.values(_contratosCreadorasEmail2Nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  listN.innerHTML = entries.map(e => `<option value="${_escCtr(e.nombre)}">${_escCtr(e.email)}</option>`).join('');
  listE.innerHTML = entries.map(e => `<option value="${_escCtr(e.email)}">${_escCtr(e.nombre)}</option>`).join('');
}

function onCtrNombreInput() {
  const v = (document.getElementById('ctr-nombre').value || '').trim().toLowerCase();
  const match = _contratosCreadorasNombre2Email[v];
  if (match) {
    const emailEl = document.getElementById('ctr-email');
    if (emailEl && !emailEl.value) emailEl.value = match.email;
  }
}
function onCtrEmailInput() {
  const v = (document.getElementById('ctr-email').value || '').trim().toLowerCase();
  const match = _contratosCreadorasEmail2Nombre[v];
  if (match) {
    const nombreEl = document.getElementById('ctr-nombre');
    if (nombreEl && !nombreEl.value) nombreEl.value = match.nombre;
  }
}

// — Boot principal de la pestaña ——————————————————————
async function loadContratos() {
  switchContratoView('listado');
  _contratosEditingToken = null;
  _resetFormUI();
  await _poblarSelectEventos();
  const fc = document.getElementById('ctr-contrato-fecha');
  if (fc && !fc.value) fc.value = new Date().toISOString().slice(0, 10);
  await loadContratosList();
  _rebuildCreadorasDatalists();
}

function switchContratoView(name) {
  ['listado','nuevo'].forEach(n => {
    const tab = document.getElementById('ctr-tab-'+n);
    const view = document.getElementById('ctr-view-'+n);
    if (!tab || !view) return;
    if (n === name) {
      tab.classList.add('active');
      tab.style.background = 'rgba(255,107,0,.12)';
      tab.style.color = 'var(--orange)';
      view.style.display = '';
    } else {
      tab.classList.remove('active');
      tab.style.background = 'transparent';
      tab.style.color = 'var(--ts)';
      view.style.display = 'none';
    }
  });
  // Cuando el usuario manualmente entra a "Nuevo" desde el tab, asegurar que
  // no estamos en modo edición (a menos que loadContratoEdit ya lo haya seteado).
  if (name === 'nuevo' && !_contratosEditingToken) _resetFormUI();
}

function onContratoEventoChange() {
  const sel = document.getElementById('ctr-evento-select');
  const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
  if (!opt || !opt.value) return;
  const nombreInput = document.getElementById('ctr-evento-nombre');
  const fechaInput = document.getElementById('ctr-evento-fecha');
  if (nombreInput && opt.dataset.nombre) nombreInput.value = opt.dataset.nombre;
  if (fechaInput && opt.dataset.fecha) fechaInput.value = opt.dataset.fecha;
}

// VÍA B (F5): muestra/oculta los campos según la plantilla elegida.
// VIGENCIA CONFIGURABLE: el selector 3/6/9/12 solo aplica a coordinador y
// creadora_team; al cambiar de plantilla se pone su default (coord 12, team 3).
function onCtrPlantillaChange() {
  const p = (document.getElementById('ctr-plantilla') || {}).value || 'creadora';
  const fc = document.getElementById('ctr-fields-creadora');
  const fg = document.getElementById('ctr-fields-giveaway');
  if (fc) fc.style.display = (p === 'creadora') ? '' : 'none';
  if (fg) fg.style.display = (p === 'giveaway') ? '' : 'none';
  const vw = document.getElementById('ctr-vigencia-wrap');
  const vs = document.getElementById('ctr-vigencia');
  const hint = document.getElementById('ctr-plantilla-hint');
  const conVigencia = (p === 'coordinador' || p === 'creadora_team');
  if (vw) vw.style.display = conVigencia ? '' : 'none';
  if (hint) hint.style.display = conVigencia ? 'none' : '';
  // [EQ-3] El apunte decía "Creadora = flujo de siempre" con CUALQUIER
  // plantilla sin vigencia — o sea, también mientras armabas un contrato
  // laboral. Ahora dice lo de la plantilla que está puesta.
  const hintTxt = hint && hint.firstElementChild;
  if (hintTxt) hintTxt.textContent = ({
    creadora: 'Creadora = flujo de siempre',
    giveaway: 'Premio de concurso — no crea cuenta',
    auxiliar_admin: 'Laboral — no cuelga de un evento',
  })[p] || '';
  if (vs && conVigencia) vs.value = (p === 'coordinador') ? '12' : '3';
  // [T3] "¿El premio incluye el viaje?": la casilla solo existe para giveaway.
  const pw = document.getElementById('ctr-premio-viaje-wrap');
  if (pw) pw.style.display = (p === 'giveaway') ? '' : 'none';
  if (p !== 'giveaway') { const pv = document.getElementById('ctr-premio-viaje'); if (pv) pv.checked = false; }
  // [T2] "¿Toma el viaje?": la casilla solo existe para creadora EXTERNA.
  const tw = document.getElementById('ctr-viaje-wrap');
  if (tw) tw.style.display = (p === 'creadora') ? '' : 'none';
  if (p !== 'creadora') { const tv = document.getElementById('ctr-viaje'); if (tv) tv.checked = false; }
  // 🗼 Anexo de custodia: la casilla solo existe para coordinador.
  const cw = document.getElementById('ctr-cuidador-wrap');
  if (cw) cw.style.display = (p === 'coordinador') ? '' : 'none';
  if (p !== 'coordinador') { const cc = document.getElementById('ctr-cuidador'); if (cc) cc.checked = false; }
  // 💼 Auxiliar administrativo (laboral): pide el sueldo neto semanal.
  const sw = document.getElementById('ctr-sueldo-wrap');
  if (sw) sw.style.display = (p === 'auxiliar_admin') ? '' : 'none';
  // [EQ-3] Y ESCONDE los campos de evento. El contrato laboral no cuelga de
  // ningún evento: _ctrFormData PISA lo que se escriba ahí (evento_nombre pasa
  // a 'Auxiliar administrativo' y evento_fecha a la fecha del contrato). El
  // asterisco de "obligatorio" era mentira y el trabajo de llenarlos, tirado.
  // [EQ-6] coordinador se suma al laboral: su contrato es ANUAL, no de un
  // evento. Por evento quedan solo creadora, creadora_team y giveaway.
  const er = document.getElementById('ctr-evento-row');
  if (er) er.style.display = SIN_EVENTO.includes(p) ? 'none' : '';
  onCtrSueldoInput();
}

// [EQ-3] LA GUARDIA ANTI-DEDAZO DEL SUELDO.
//
// El campo pide SEMANAL y la cabeza piensa en MENSUAL. Un cero de más no se
// caza leyendo "13000" — se caza leyendo "$56,333 al mes". Así que la
// traducción va enfrente, en vivo, mientras se teclea.
//
// 52 semanas ÷ 12 meses: es la conversión legal (4.333 semanas al mes), no
// "×4". Con ×4 el número mostrado sería más bajo que el real y la guardia
// tranquilizaría cuando debería alarmar.
const SUELDO_SEM_A_MES = 52 / 12;
// La línea de "levanta la ceja". No es un tope —Memo puede pagar lo que quiera—
// es el punto donde vale la pena preguntar una vez antes de mandar un contrato
// laboral firmable. Si algún día el equipo gana más, se sube el número; la
// prueba NO assertea este valor, solo que la guardia existe y distingue lados.
const SUELDO_MENSUAL_OJO = 40000;

function _sueldoMensual(semanal) {
  const n = Number(semanal);
  if (!(n > 0)) return 0;
  return Math.round(n * SUELDO_SEM_A_MES);
}

function onCtrSueldoInput() {
  const el = document.getElementById('ctr-sueldo-mes');
  if (!el) return;
  const p = (document.getElementById('ctr-plantilla') || {}).value || 'creadora';
  const v = Number((document.getElementById('ctr-sueldo') || {}).value || '0');
  if (p !== 'auxiliar_admin' || !(v > 0)) { el.textContent = ''; el.style.color = 'var(--ts)'; return; }
  const mes = _sueldoMensual(v);
  const fmt = x => '$' + x.toLocaleString('es-MX');
  el.textContent = `${fmt(Math.round(v))} a la semana = ${fmt(mes)} al mes (52 semanas ÷ 12).`;
  el.style.color = mes >= SUELDO_MENSUAL_OJO ? '#ffb020' : 'var(--ts)';
}

function _ctrFormData() {
  const sel = document.getElementById('ctr-evento-select');
  const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
  const evento_nombre = (document.getElementById('ctr-evento-nombre').value || '').trim()
    || (opt && opt.dataset.nombre) || '';
  const plantilla = (document.getElementById('ctr-plantilla') || {}).value || 'creadora';
  let datos = null;
  if (plantilla === 'giveaway') {
    datos = {
      desglose_premio: (document.getElementById('ctr-premio-desglose').value || '').trim(),
      valor_premio: Math.round(Number(document.getElementById('ctr-premio-valor').value || '0')) || 0,
    };
  }
  // VIGENCIA CONFIGURABLE: solo viaja para coordinador/creadora_team.
  let vigencia_meses;
  if (plantilla === 'coordinador' || plantilla === 'creadora_team') {
    vigencia_meses = Math.round(Number((document.getElementById('ctr-vigencia') || {}).value)) || (plantilla === 'coordinador' ? 12 : 3);
  }
  // 🗼 Anexo de custodia: flag en datos, solo coordinador (el backend valida).
  let datosExtra = datos;
  // [T1] Todo contrato NUEVO de coordinador nace con exclusividad dura. Va
  // aquí solo para que la vista previa diga la verdad: la autoridad es
  // contrato-crear, que lo sella del lado del servidor sin preguntar.
  // [T3] "¿El premio incluye el viaje?" — solo giveaway. Se suma al datos del
  // premio que ya armó el bloque de arriba.
  if (plantilla === 'giveaway' && (document.getElementById('ctr-premio-viaje') || {}).checked) {
    datosExtra = Object.assign({}, datosExtra || datos, { premio_incluye_viaje: true });
  }
  // [T2] "¿Toma el viaje?" — solo creadora. El backend decide; esto es para que
  // el payload lleve la intención de Memo.
  if (plantilla === 'creadora' && (document.getElementById('ctr-viaje') || {}).checked) {
    datosExtra = Object.assign({}, datos, { toma_viaje: true });
  }
  if (plantilla === 'coordinador') {
    datosExtra = Object.assign({}, datos, { exclusividad_dura: true });
    if ((document.getElementById('ctr-cuidador') || {}).checked) datosExtra.cuidador_bodega = true;
  }
  // 💼 Auxiliar administrativo (laboral): el único dato variable es el sueldo
  // semanal. No cuelga de un evento → placeholder neutro en evento_* (columnas
  // NOT NULL que el texto legal no usa).
  // [EQ-3] Hoy en MONTERREY, no en UTC. `toISOString()` da la fecha de
  // Greenwich: después de las 6 de la tarde de acá ya es el día siguiente
  // allá, y el contrato salía FECHADO MAÑANA. Memo trabaja de noche.
  const _contratoFecha = (document.getElementById('ctr-contrato-fecha').value || '').trim() || _mxFechaStr();
  let _evNombre = evento_nombre;
  let _evFecha = (document.getElementById('ctr-evento-fecha').value || '').trim();
  if (plantilla === 'auxiliar_admin') {
    datosExtra = { sueldo_semanal: Math.round(Number((document.getElementById('ctr-sueldo') || {}).value || '0')) || 0 };
    _evNombre = 'Auxiliar administrativo';
    _evFecha = _contratoFecha;
  }
  // [EQ-6] El contrato de coordinador es ANUAL: cubre los eventos que le
  // toquen durante su vigencia, no uno. Mismo tratamiento que el laboral —
  // relleno neutro en las columnas NOT NULL que el texto legal no usa.
  //
  // Y NO usa el evento de verdad: verificado que el documento de coordinador
  // no lo imprime por ninguna vía (ni el bloque meta, ni la intro, ni las 12
  // cláusulas, ni el anexo de custodia). Por eso esto NO cambia una sola letra
  // de lo ya firmado: el render ni siquiera mira estas dos columnas.
  if (plantilla === 'coordinador') {
    _evNombre = 'Coordinación anual';
    _evFecha = _contratoFecha;
  }
  return {
    plantilla,
    creador_nombre: (document.getElementById('ctr-nombre').value || '').trim(),
    creador_email: (document.getElementById('ctr-email').value || '').trim().toLowerCase(),
    evento_nombre: _evNombre,
    evento_fecha: _evFecha,
    contrato_fecha: _contratoFecha,
    ofrecimiento: _splitLineas(document.getElementById('ctr-ofrecimiento').value),
    expectativas: _splitLineas(document.getElementById('ctr-expectativas').value),
    datos: datosExtra,
    cuidador_bodega: (plantilla === 'coordinador') ? !!(document.getElementById('ctr-cuidador') || {}).checked : undefined,
    vigencia_meses,
  };
}

function _validateCtrForm(d) {
  if (!d.creador_nombre || d.creador_nombre.length < 2) return 'Nombre inválido';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.creador_email)) return 'Email inválido';
  if (!d.evento_nombre) return 'Falta el evento';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.evento_fecha)) return 'Fecha del evento requerida';
  if (d.plantilla === 'creadora') {
    if (!d.ofrecimiento.length) return 'Agrega al menos un ítem en "Ofrece la agencia"';
    if (!d.expectativas.length) return 'Agrega al menos un ítem en "Se espera del creador"';
  } else if (d.plantilla === 'giveaway') {
    if (!d.datos || !d.datos.desglose_premio || d.datos.desglose_premio.length < 3) return 'Falta el desglose del premio';
    if (!d.datos || !(d.datos.valor_premio > 0)) return 'Valor del premio inválido';
  } else if (d.plantilla === 'auxiliar_admin') {
    if (!d.datos || !(d.datos.sueldo_semanal > 0)) return 'Falta el sueldo neto semanal';
  }
  return null;
}

// 💼 AUXILIAR_ADMIN (vista previa admin) — MISMO texto oficial laboral que
// contrato.html (el documento firmable). Fuente: contrato-auxiliar-admin-v1-
// TEXTO-OFICIAL.md. Variables: {{SUELDO_SEMANAL}}→x.sueldo · {{FECHA_ANIVERSARIO}}
// →x.aniversario · {{FECHA_FIRMA_TEXTO}}→x.firmaTexto · {{NOMBRE}}→x.nombre.
const _CTR_CLAUSULAS_AUX = [
  { num:'PRIMERA', t:'Puesto y funciones', body:()=>`<p>LA TRABAJADORA desempeñará el puesto de AUXILIAR ADMINISTRATIVO, realizando atención a clientes por WhatsApp, llamadas y medios digitales; manejo de listas de viajeros, pagos, bases de datos, reportes administrativos, coordinación operativa de viajes y eventos, así como cualquier actividad relacionada con la naturaleza del puesto.</p>` },
  { num:'SEGUNDA', t:'Periodo de prueba', body:()=>`<p>Las partes acuerdan un periodo de prueba de noventa (90) días naturales para evaluar desempeño, responsabilidad, manejo de información sensible, organización, atención al cliente y adaptación al puesto. Durante dicho periodo LA TRABAJADORA gozará de salario y prestaciones de ley. Concluido satisfactoriamente, la relación continuará por tiempo indeterminado.</p>` },
  { num:'TERCERA', t:'Jornada laboral y modalidad', body:()=>`<p>La jornada será presencial de lunes a viernes de 09:00 a 19:00 horas, con una hora y treinta minutos para alimentos. Cuando la carga laboral lo permita, LA EMPRESA podrá autorizar la salida a las 18:00 horas, sin constituir un derecho adquirido. Los sábados se laborarán cuatro (4) horas en el horario acordado con el área administrativa, pudiendo cubrirse en la mañana o en la tarde, concluyendo a más tardar a las 19:00 horas. Los domingos serán de descanso, salvo que un evento o viaje requiera la presencia de LA TRABAJADORA, en cuyo caso se otorgará descanso compensatorio el lunes inmediato siguiente.</p>` },
  { num:'CUARTA', t:'Sueldo y prestaciones', body:x=>`<p>LA EMPRESA pagará un sueldo neto semanal de <b>${x.sueldo} MXN</b> mediante transferencia bancaria cada viernes. LA TRABAJADORA gozará de las prestaciones de ley, incluyendo aguinaldo, vacaciones, prima vacacional y días festivos pagados.</p>` },
  { num:'QUINTA', t:'Vacaciones', body:x=>`<p>Las vacaciones serán otorgadas al cumplir un año de labores, es decir, a partir del <b>${x.aniversario}</b>. Corresponderán doce (12) días en el primer año, incrementándose conforme a la legislación vigente. Deberán solicitarse con al menos una semana de anticipación.</p>` },
  { num:'SEXTA', t:'Bonos por desempeño', body:()=>`<p>LA EMPRESA podrá otorgar bonos por desempeño de manera discrecional, especialmente después de eventos de alta demanda. El otorgamiento y monto de cualquier bono dependerá de la complejidad del evento, desempeño de LA TRABAJADORA y utilidad o ganancia obtenida por LA EMPRESA. Los bonos no constituyen una prestación fija ni un derecho adquirido.</p>` },
  { num:'SÉPTIMA', t:'Confidencialidad', body:()=>`<p>Toda la información de clientes, proveedores, listas de viajeros, grupos de WhatsApp, bases de datos, contraseñas, estrategias comerciales y documentos internos será considerada estrictamente confidencial. Queda prohibida su divulgación o uso para fines distintos a los de LA EMPRESA.</p>` },
  { num:'OCTAVA', t:'Uso y cuidado del equipo', body:()=>`<p>Todo teléfono, computadora, cuenta, acceso o herramienta entregada por LA EMPRESA es propiedad exclusiva de ésta y deberá ser devuelta al finalizar la relación laboral.</p>` },
  { num:'NOVENA', t:'Entrega de puesto', body:()=>`<p>En caso de renuncia o terminación, LA TRABAJADORA se obliga a entregar contraseñas, archivos, listas de viajeros, reportes, equipos y cualquier información pendiente antes de su separación definitiva.</p>` },
  { num:'DÉCIMA', t:'Terminación del contrato', body:()=>`<p>El contrato podrá darse por terminado por mutuo acuerdo, renuncia voluntaria con aviso previo de siete días naturales o por las causas de rescisión previstas en la Ley Federal del Trabajo.</p>` },
  { num:'DÉCIMA PRIMERA', t:'Jurisdicción', body:()=>`<p>Para la interpretación y cumplimiento del presente contrato, las partes se someten a las leyes y tribunales competentes de Monterrey, Nuevo León.</p>` },
];
function _numEspKh(n){ const u=['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve']; if(n<30) return u[n]||String(n); const t={30:'treinta',40:'cuarenta',50:'cincuenta',60:'sesenta',70:'setenta',80:'ochenta',90:'noventa'}; const d=Math.floor(n/10)*10, r=n%10; return r===0 ? (t[d]||String(n)) : (t[d]||'')+' y '+u[r]; }
function _anioEspKh(y){ const yy=y%100; return 'dos mil'+(yy===0?'':' '+_numEspKh(yy)); }
// Estilo NOTARIAL, idéntico a contrato.html: "a los quince (15) días del mes de
// junio de dos mil veintiséis (2026)"; día 1 → "al primer (1) día…". Incluye el
// "a los"/"al" (el proemio no lo antepone).
function _fechaTextoDiasKh(iso){ const p=String(iso||'').split('-'); if(p.length<3) return '—'; const y=parseInt(p[0],10), m=parseInt(p[1],10), d=parseInt(p[2],10); const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']; const mes=meses[m-1]||''; const anio=`${_anioEspKh(y)} (${y})`; return d===1 ? `al primer (1) día del mes de ${mes} de ${anio}` : `a los ${_numEspKh(d)} (${d}) días del mes de ${mes} de ${anio}`; }
function _masUnAnioKh(iso){ const p=String(iso||'').split('-'); if(p.length<3) return iso; return `${parseInt(p[0],10)+1}-${p[1]}-${p[2]}`; }
function _renderContratoAuxiliarHTML(c) {
  const sueldoN = (c.datos && Number(c.datos.sueldo_semanal)) || 0;
  const x = {
    nombre: _escCtr(c.creador_nombre || ''),
    sueldo: sueldoN ? '$' + sueldoN.toLocaleString('es-MX') : '__________',
    aniversario: _escCtr(_fmtFechaLargaCtr(_masUnAnioKh(c.contrato_fecha))),
    firmaTexto: _escCtr(_fechaTextoDiasKh(c.contrato_fecha)),
  };
  const meta = `
    <div style="display:flex;flex-wrap:wrap;gap:18px 28px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;font-weight:700">
      <span><b style="color:#000">Trabajadora:</b> ${_esfEsc(x.nombre)}</span>
      <span><b style="color:#000">Puesto:</b> Auxiliar administrativo</span>
      <span><b style="color:#000">Fecha del contrato:</b> ${_escCtr(_fmtFechaLargaCtr(c.contrato_fecha))}</span>
    </div>`;
  const intro = `
    <div style="border-top:3px solid #000;border-bottom:1px solid #ddd;padding:18px 0;margin:20px 0;font-size:14px;line-height:1.6">
      En la ciudad de Monterrey, Nuevo León, ${x.firmaTexto}, comparecen por una parte <b>CONECTA REYNOSA</b>, representada por el C. Guillermo Alexander Cobos Vizcarra, en su calidad de responsable operativo ("LA EMPRESA"), y por la otra parte la C. <b>${_esfEsc(x.nombre)}</b> ("LA TRABAJADORA"), quienes celebran el presente Contrato Individual de Trabajo por Tiempo Indefinido.
    </div>`;
  const clausulas = _CTR_CLAUSULAS_AUX.map(cl => `
    <div style="margin-top:22px">
      <h3 style="font-family:'Barlow Condensed','Montserrat',sans-serif;text-transform:uppercase;font-size:20px;letter-spacing:.04em;margin:0 0 10px;border-left:5px solid #e8ff4c;background:linear-gradient(90deg,rgba(232,255,76,.2),transparent 60%);padding:6px 0 6px 12px;color:#000">
        <span style="color:#ff283b;font-weight:900;font-size:24px;margin-right:10px">${cl.num}.</span>${_escCtr(cl.t)}
      </h3>
      <div style="font-size:13.5px;line-height:1.65;color:#222">${cl.body(x)}</div>
    </div>`).join('');
  return `
    ${meta}
    <h2 style="font-family:'Barlow Condensed','Montserrat',sans-serif;font-size:34px;line-height:.92;text-transform:uppercase;margin:14px 0 0;color:#000">Contrato Individual de Trabajo<small style="display:block;font-size:13px;color:#ff283b;font-weight:800;letter-spacing:.18em;margin-top:6px">Por Tiempo Indefinido · Auxiliar administrativo</small></h2>
    ${intro}
    ${clausulas}
    <p style="font-style:italic;color:#666;font-size:12px;margin-top:22px">Cada una de las hojas del presente contrato deberá ser rubricada por ambas partes. La firma se captura en el enlace que se envía a la trabajadora.</p>
  `;
}

function _renderContratoHTML(c) {
  // VÍA B (F5): coordinador/giveaway/creadora_team van por su propia vista
  // previa; auxiliar_admin por la laboral; 'creadora' (default) sigue EXACTAMENTE
  // igual que siempre.
  if (c && c.plantilla === 'auxiliar_admin') return _renderContratoAuxiliarHTML(c);
  if (c && (c.plantilla === 'coordinador' || c.plantilla === 'giveaway' || c.plantilla === 'creadora_team')) return _renderContratoViaBHTML(c);
  const partes = `
    <div style="border-top:3px solid #000;border-bottom:1px solid #ddd;padding:18px 0;margin:20px 0">
      <p style="margin:0 0 8px;font-size:14px"><b>Conecta MX</b> · Agencia organizadora de viajes a conciertos y festivales · representada por Guillermo Alexander Cobos Vizcarra (Reynosa, Tamaulipas).</p>
      <p style="color:#ff283b;font-weight:900;letter-spacing:.2em;font-size:11px;text-transform:uppercase;margin:8px 0">—— y ——</p>
      <p style="margin:0;font-size:14px"><b>${_escCtr(c.creador_nombre)}</b> · Creador(a) de contenido · ${_escCtr(c.creador_email)}.</p>
    </div>`;
  const meta = `
    <div style="display:flex;flex-wrap:wrap;gap:18px 28px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;font-weight:700">
      <span><b style="color:#000">Fecha del contrato:</b> ${_escCtr(_fmtFechaLargaCtr(c.contrato_fecha))}</span>
      <span><b style="color:#000">Evento:</b> ${_escCtr(c.evento_nombre)}</span>
      <span><b style="color:#000">Fecha del evento:</b> ${_escCtr(_fmtFechaLargaCtr(c.evento_fecha))}</span>
    </div>`;
  const clausulas = _CTR_CLAUSULAS.map(cl => `
    <div style="margin-top:22px">
      <h3 style="font-family:'Barlow Condensed','Montserrat',sans-serif;text-transform:uppercase;font-size:20px;letter-spacing:.04em;margin:0 0 10px;border-left:5px solid #e8ff4c;background:linear-gradient(90deg,rgba(232,255,76,.2),transparent 60%);padding:6px 0 6px 12px;color:#000">
        <span style="color:#ff283b;font-weight:900;font-size:24px;margin-right:10px">${cl.num}.</span>${_escCtr(cl.t)}
      </h3>
      <div style="font-size:13.5px;line-height:1.65;color:#222">${cl.body(c)}</div>
    </div>`).join('');

  return `
    ${meta}
    <h2 style="font-family:'Barlow Condensed','Montserrat',sans-serif;font-size:34px;line-height:.92;text-transform:uppercase;margin:14px 0 0;color:#000">Contrato de colaboración<small style="display:block;font-size:13px;color:#ff283b;font-weight:800;letter-spacing:.18em;margin-top:6px">Creadores · ${_escCtr(c.evento_nombre)}</small></h2>
    ${partes}
    ${clausulas}
  `;
}

function previewContrato() {
  const d = _ctrFormData();
  const err = _validateCtrForm(d);
  const alert = document.getElementById('ctr-alert');
  if (err) {
    alert.innerHTML = `<div style="padding:10px 14px;background:rgba(255,68,68,.12);border:1px solid rgba(255,68,68,.4);color:#ffb3b3;border-radius:var(--r-sm,8px);margin-bottom:14px;font-size:13px"><svg class="ic"><use href="#ic-alerta"/></svg> ${err}</div>`;
    return;
  }
  alert.innerHTML = '';
  document.getElementById('ctr-preview-body').innerHTML = _renderContratoHTML(d);
  openModal('modal-contrato-preview');
}

// — Form submit: crea o actualiza según el estado ——————————————
async function enviarContrato() {
  const d = _ctrFormData();
  const err = _validateCtrForm(d);
  const alert = document.getElementById('ctr-alert');
  const btn = document.getElementById('ctr-btn-enviar');
  if (err) {
    alert.innerHTML = `<div style="padding:10px 14px;background:rgba(255,68,68,.12);border:1px solid rgba(255,68,68,.4);color:#ffb3b3;border-radius:6px;margin-bottom:14px;font-size:13px"><svg class="ic"><use href="#ic-alerta"/></svg> ${err}</div>`;
    return;
  }
  // [EQ-3] La segunda mitad de la guardia anti-dedazo: pasada la línea de la
  // ceja se pregunta UNA vez, con el número mensual enfrente. Va DESPUÉS de la
  // validación (no tiene caso preguntar por un formulario que ni se va a
  // mandar) y ANTES de deshabilitar el botón: si dice que no, el formulario
  // queda exactamente como estaba, listo para corregir.
  if (d.plantilla === 'auxiliar_admin' && d.datos && _sueldoMensual(d.datos.sueldo_semanal) >= SUELDO_MENSUAL_OJO) {
    const sem = '$' + Math.round(d.datos.sueldo_semanal).toLocaleString('es-MX');
    const mes = '$' + _sueldoMensual(d.datos.sueldo_semanal).toLocaleString('es-MX');
    if (!confirm(`El sueldo dice ${sem} A LA SEMANA — son ${mes} al mes.\n\n¿Es correcto? El campo pide semanal, no mensual.`)) return;
  }

  alert.innerHTML = '';
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = _contratosEditingToken ? 'Guardando…' : 'Enviando…';
  try {
    let body, endpoint;
    if (_contratosEditingToken) {
      endpoint = '/.netlify/functions/contrato-actualizar';
      body = { token: _contratosEditingToken, ...d };
    } else {
      endpoint = '/.netlify/functions/contrato-crear';
      body = d;
    }
    const r = await khAdminFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || 'Error');

    const okMsg = _contratosEditingToken
      ? `<div style="padding:10px 14px;background:rgba(61,220,132,.12);border:1px solid rgba(61,220,132,.4);color:#7ee9b3;border-radius:6px;margin-bottom:14px;font-size:13px">✓ Contrato actualizado. El link enviado a la creadora ya muestra los datos nuevos.</div>`
      : `<div style="padding:10px 14px;background:rgba(61,220,132,.12);border:1px solid rgba(61,220,132,.4);color:#7ee9b3;border-radius:6px;margin-bottom:14px;font-size:13px">✓ Contrato enviado a <b>${_escCtr(d.creador_email)}</b>${j.emailSent === false ? ' (guardado, pero no se pudo mandar email — revisa RESEND_API_KEY)' : ''}</div>`;
    alert.innerHTML = okMsg;
    _contratosEditingToken = null;
    setTimeout(() => { switchContratoView('listado'); loadContratosList(); _resetFormUI(); }, 1100);
  } catch (e) {
    alert.innerHTML = `<div style="padding:10px 14px;background:rgba(255,68,68,.12);border:1px solid rgba(255,68,68,.4);color:#ffb3b3;border-radius:6px;margin-bottom:14px;font-size:13px"><svg class="ic"><use href="#ic-alerta"/></svg> ${_escCtr(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function _resetFormUI() {
  // Limpia el form + restaura el botón a "Enviar por correo".
  const ids = ['ctr-nombre','ctr-email','ctr-evento-nombre','ctr-evento-select','ctr-evento-fecha','ctr-ofrecimiento','ctr-expectativas','ctr-premio-desglose','ctr-premio-valor'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) { if (el.tagName === 'SELECT') el.value = ''; else el.value = ''; } });
  const _pl = document.getElementById('ctr-plantilla'); if (_pl && !_contratosEditingToken) _pl.value = 'creadora';
  // Restaurar defaults de textareas
  const ofr = document.getElementById('ctr-ofrecimiento');
  const exp = document.getElementById('ctr-expectativas');
  if (ofr && !_contratosEditingToken) ofr.value = '1 boleto en zona general\n1 Kit Conecta\n1 comida gratis dentro del festival';
  if (exp && !_contratosEditingToken) exp.value = '1 Video en formato Reel o video vertical para redes sociales (1080 x 1920 píxeles) sobre el evento al que ha sido invitado y de la experiencia del concierto / festival con Conecta Reynosa (modo collab).\n\n3 o 4 menciones en historias de ig el día del evento a Conecta Reynosa, disfrutando del concierto o festival asignado y la experiencia de Conecta utilizando el hashtag #viajaconexpertos o #Seguimosconectando (SÉ CREATIV@ no grabes solo el artista, graba el ambiente, como te la estas pasando, haznos sentir la experiencia desde tu perspectiva)\n\n1 Post dentro del evento (Fotos donde aparezcas) en las redes del creador agradeciendo a Conecta Reynosa por la experiencia y la invitación al evento (Modo Collab)';
  const fc = document.getElementById('ctr-contrato-fecha');
  if (fc) fc.value = _mxFechaStr(); // [EQ-3] hoy en MX, no en UTC (ver _ctrFormData)
  // Botón principal
  const btn = document.getElementById('ctr-btn-enviar');
  if (btn) btn.textContent = 'Enviar por correo';
  // Toggle cancelar / titulo edición
  const cancelBtn = document.getElementById('ctr-btn-cancelar-edit');
  if (cancelBtn) cancelBtn.style.display = 'none';
  const banner = document.getElementById('ctr-banner-edit');
  if (banner) banner.style.display = 'none';
  const _pvReset = document.getElementById('ctr-premio-viaje');
  if (_pvReset) _pvReset.checked = false;
  const _tvReset = document.getElementById('ctr-viaje');
  if (_tvReset) _tvReset.checked = false;
  const _ccReset = document.getElementById('ctr-cuidador');
  if (_ccReset && !_contratosEditingToken) _ccReset.checked = false; // 🗼 anexo
  if (typeof onCtrPlantillaChange === 'function') onCtrPlantillaChange();
}

function _loadContratoEnForm(c) {
  const _pl = document.getElementById('ctr-plantilla');
  if (_pl) _pl.value = c.plantilla || 'creadora';
  if (c.plantilla === 'giveaway' && c.datos) {
    const dg = document.getElementById('ctr-premio-desglose'); if (dg) dg.value = c.datos.desglose_premio || '';
    const vl = document.getElementById('ctr-premio-valor'); if (vl) vl.value = c.datos.valor_premio || '';
  }
  if (typeof onCtrPlantillaChange === 'function') onCtrPlantillaChange();
  // Vigencia guardada DESPUÉS del change (que pone el default de la plantilla).
  if (c.vigencia_meses) {
    const vs = document.getElementById('ctr-vigencia');
    if (vs) vs.value = String(c.vigencia_meses);
  }
  // 🗼 Anexo de custodia: marca la casilla si el contrato ya lo trae. El flag
  // viaja como c.cuidador_bodega (listar) o c.datos.cuidador_bodega (obtener).
  const _cc = document.getElementById('ctr-cuidador');
  if (_cc) _cc.checked = (c.cuidador_bodega === true) || !!(c.datos && c.datos.cuidador_bodega === true);
  document.getElementById('ctr-nombre').value = c.creador_nombre || '';
  document.getElementById('ctr-email').value = c.creador_email || '';
  document.getElementById('ctr-evento-nombre').value = c.evento_nombre || '';
  document.getElementById('ctr-evento-select').value = '';
  document.getElementById('ctr-evento-fecha').value = (c.evento_fecha || '').slice(0,10);
  document.getElementById('ctr-contrato-fecha').value = (c.contrato_fecha || '').slice(0,10);
  document.getElementById('ctr-ofrecimiento').value = (Array.isArray(c.ofrecimiento) ? c.ofrecimiento : []).join('\n');
  document.getElementById('ctr-expectativas').value = (Array.isArray(c.expectativas) ? c.expectativas : []).join('\n');
  document.getElementById('ctr-btn-enviar').textContent = 'Guardar cambios';
  const cancelBtn = document.getElementById('ctr-btn-cancelar-edit');
  if (cancelBtn) cancelBtn.style.display = '';
  const banner = document.getElementById('ctr-banner-edit');
  if (banner) {
    banner.style.display = '';
    banner.innerHTML = `Editando contrato de <b>${_escCtr(c.creador_nombre)}</b> · token <code style="font-size:11px;background:rgba(255,255,255,.1);padding:2px 6px;border-radius:3px">${_escCtr((c.token || '').slice(0,8))}…</code>`;
  }
}

function cancelarEdicionContrato() {
  _contratosEditingToken = null;
  _resetFormUI();
  switchContratoView('listado');
}

// — VÍA B (F5): chip de plantilla + aviso de vigencia para el listado ————
function _ctrPlantillaChip(p) {
  const map = {
    creadora:      { txt:'Creadora',    c:'#e8ff4c', bg:'rgba(232,255,76,.14)',  bd:'rgba(232,255,76,.4)' },
    coordinador:   { txt:'Coordinador', c:'#7cc4ff', bg:'rgba(124,196,255,.14)', bd:'rgba(124,196,255,.4)' },
    giveaway:      { txt:'Giveaway',    c:'#ff9edb', bg:'rgba(255,158,219,.14)', bd:'rgba(255,158,219,.4)' },
    creadora_team: { txt:'Team',        c:'#c9a2ff', bg:'rgba(201,162,255,.14)', bd:'rgba(201,162,255,.4)' },
  };
  const s = map[p] || map.creadora;
  return `<span style="display:inline-block;font-size:9px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;padding:2px 7px;border-radius:4px;color:${s.c};background:${s.bg};border:1px solid ${s.bd}">${s.txt}</span>`;
}
// 🗼 Chip "cuidador" para coordinadores con el anexo de custodia (flag en
// datos.cuidador_bodega, expuesto como booleano por admin-contratos listar).
function _ctrCuidadorChip(c) {
  if (!c || c.plantilla !== 'coordinador' || c.cuidador_bodega !== true) return '';
  return `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;padding:2px 7px;border-radius:4px;color:#e8ff4c;background:rgba(232,255,76,.14);border:1px solid rgba(232,255,76,.4)" title="También cuidador de bodega — el contrato lleva el Anexo de Custodia (Torre de Karin)"><svg class="ic" style="width:11px;height:11px"><use href="#ic-inventario"/></svg> cuidador</span>`;
}
// Contador de STRIKES (solo lectura) para creadora_team firmada. Reusa los
// puntitos .gz-strike-dot existentes. El dato viene de admin-contratos
// (usuarios.strikes por correo, best-effort) — sin dato, no pinta nada.
function _ctrStrikesChip(c) {
  if (!c || c.plantilla !== 'creadora_team' || c.estado !== 'firmado' || c.strikes === undefined) return '';
  const s = Number(c.strikes) || 0;
  const dots = [1,2,3].map(n => `<div class="gz-strike-dot ${s >= n ? 'active' : ''}"></div>`).join('');
  return `<span style="display:inline-flex;align-items:center;gap:6px;margin-left:6px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:${s >= 3 ? 'var(--red)' : 'var(--ts)'}" title="Strikes del sistema (usuarios.strikes). La baja al llegar a 3 es decisión manual de Memo."><span class="gz-strike-dots" style="display:inline-flex;gap:2px">${dots}</span> ${s}/3</span>`;
}
// Aviso "vence en N días" para coordinadores/team firmados cuando falten ≤30 días.
// ═══ [HER-1c] CUÁNTO LE QUEDA A LA VIGENCIA ═══════════════════════════════
// UNA sola aritmética, dos consumidores: el badge de la fila (que ya existía) y
// el chip // vencidos. Escribir un segundo juez es como se llega a un chip que
// dice (3) sobre una lista que enseña (1).
//
// Devuelve los días que faltan (negativo = ya venció) o `null` cuando el
// contrato no tiene vigencia — que NO es lo mismo que estar vigente. Hoy 12 de
// 25 contratos caen en ese `null`: `creadora` y `auxiliar_admin` nunca llenan
// `vigencia_fin`. Un contrato sin fecha no se puede juzgar, y por eso no cuenta
// como vencido en vez de contarse como bueno por descuido.
function _ctrDiasVigencia(c) {
  if (!c || !c.vigencia_fin) return null;
  const hoy = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' }) + 'T00:00:00');
  const fin = new Date(String(c.vigencia_fin).slice(0, 10) + 'T00:00:00');
  const dias = Math.round((fin - hoy) / 86400000);
  return Number.isFinite(dias) ? dias : null;
}

function _ctrVencido(c) {
  const d = _ctrDiasVigencia(c);
  return d !== null && d < 0;
}

function _ctrVigenciaAviso(c) {
  if (!c || (c.plantilla !== 'coordinador' && c.plantilla !== 'creadora_team') || !c.vigencia_fin) return '';
  const dias = _ctrDiasVigencia(c);
  if (dias === null || dias > 30) return '';
  const vencido = dias < 0;
  const col = vencido ? { c:'#ff6666', bg:'rgba(255,68,68,.14)', bd:'rgba(255,68,68,.4)' }
                      : { c:'#ffb020', bg:'rgba(255,176,32,.14)', bd:'rgba(255,176,32,.4)' };
  const txt = vencido ? 'Vigencia vencida' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`;
  return `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;font-weight:800;padding:2px 7px;border-radius:4px;color:${col.c};background:${col.bg};border:1px solid ${col.bd}"><svg class="ic" style="width:11px;height:11px"><use href="#ic-alerta"/></svg> ${txt}</span>`;
}

// — Tabla listado + acciones ——————————————————————————
// ═══ [HER-1b] EL BUSCADOR DE CONTRATOS ════════════════════════════════════
// Mismo patrón que el de Esferas: filtra EN VIVO lo ya pintado. Por eso CARGAR
// y PINTAR se parten en dos — teclear no puede costar un viaje al servidor, y
// el caché ya estaba ahí (`_contratosCache`), solo que nadie lo repintaba.
let _ctrBusca = '';

// ═══ [HER-1d] LA ANTIGÜEDAD DE UN PENDIENTE ═══════════════════════════════
// "21-jul" no grita nada. "hace 37 días" sí. Un contrato pendiente no se vuelve
// urgente por su fecha de envío sino por lo que lleva esperando, y eso hay que
// restarlo, no leerlo.
//
// 🔒 EN HORA DE REYNOSA, firmado por Memo. Es el mismo huso con el que se
// teclean los vencimientos en Esferas.
// ⚠️ [TZ-UNIF-1] Aquí decía «`America/Cancun`, el proxy de la casa para −05:00
// todo el año». Estaba mal por partida doble: Reynosa NO es −05:00 todo el año
// —cambia con EE.UU., 8-mar a 1-nov— y la que dejó de cambiar es Monterrey.
// La constante es `TZ_REYNOSA`, y no es un proxy: es el huso de la ciudad.
//
// ⏳ ANOTADO, no cambiado: `_ctrDiasVigencia` (HER-1c, heredado del badge que ya
// existía) calcula en Monterrey. Son dos "hoy" distintos en la misma pantalla y
// vale la pena unificarlos, pero cambiar la vigencia no está firmado y a un año
// de distancia la hora no mueve el veredicto. Queda dicho.
const _CTR_DIAS_ALERTA = 7;

function _ctrHoyReynosa() {
  return new Date(new Date().toLocaleDateString('en-CA', { timeZone: TZ_REYNOSA }) + 'T00:00:00');
}

// Días completos desde que se envió. `null` si no hay fecha — que no es cero.
// Se pasa por `_tsToDate` porque `enviado_at` es un `timestamp` SIN zona y
// Postgres lo serializa sin sufijo: sin eso, el navegador lo lee como hora
// local y el conteo se corre un día en media república.
function _ctrDiasEnviado(c) {
  const d = _tsToDate(c && c.enviado_at);
  if (!d || !Number.isFinite(d.getTime())) return null;
  const env = new Date(d.toLocaleDateString('en-CA', { timeZone: TZ_REYNOSA }) + 'T00:00:00');
  const dias = Math.round((_ctrHoyReynosa() - env) / 86400000);
  return Number.isFinite(dias) ? dias : null;
}

// 🔒 La alerta SE ENCIENDE A LOS 7 DÍAS (firmado). Antes de eso el contrato está
// en camino, no atorado: avisar el día uno enseña a ignorar el aviso.
// Un vencido no alerta — ya vive en su propio chip y no hay nada que apurar.
function _ctrAlerta(c) {
  if (!c || String(c.estado || '') !== 'pendiente' || _ctrVencido(c)) return false;
  const d = _ctrDiasEnviado(c);
  return d !== null && d >= _CTR_DIAS_ALERTA;
}

// La antigüedad DENTRO de la fila. Solo para pendientes: en un firmado el dato
// no dice nada. Ámbar únicamente si cruzó el umbral — si todo fuera ámbar, el
// ámbar dejaría de señalar.
function _ctrAntiguedadFila(c) {
  if (!c || String(c.estado || '') !== 'pendiente') return '';
  const d = _ctrDiasEnviado(c);
  if (d === null) return '';
  const alerta = _ctrAlerta(c);
  return '<br><span data-ctr-antiguedad="' + (alerta ? 'alerta' : 'normal') + '"' +
    ' style="font-size:11px;' + (alerta ? 'color:#ffb020;font-weight:700' : 'color:var(--ts)') + '">' +
    _escCtr(_ctrDiasTexto(d)) + '</span>';
}

function _ctrDiasTexto(d) {
  if (d === null) return '';
  if (d <= 0) return 'hoy';
  return 'hace ' + d + (d === 1 ? ' día' : ' días');
}

// La tarjeta de arriba. NO lista todos los pendientes: solo los que cruzaron el
// umbral. Los de esta semana ya se ven en el chip `// pendientes` — repetirlos
// aquí convertiría la alerta en una segunda lista.
function _ctrAlertaPintar() {
  const el = document.getElementById('ctr-alerta');
  if (!el) return;
  const alertados = (_contratosCache || []).filter(_ctrAlerta)
    .sort((a, b) => (_ctrDiasEnviado(b) || 0) - (_ctrDiasEnviado(a) || 0));
  if (!alertados.length) {
    // Sin nada que apurar la tarjeta DESAPARECE. Una alerta permanente deja de
    // ser una alerta y se vuelve decoración.
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = '';
  const n = alertados.length;
  el.innerHTML =
    '<div style="font-size:13px;font-weight:800;color:#ffb020;margin-bottom:8px">' +
      '<svg class="ic"><use href="#ic-alerta"/></svg> ' + n +
      (n === 1 ? ' contrato lleva ' : ' contratos llevan ') + _CTR_DIAS_ALERTA + '+ días sin firmar</div>' +
    '<div style="font-size:12px;color:var(--ts);margin-bottom:12px;line-height:1.7">' +
      alertados.map((c) =>
        '<div data-ctr-alerta="' + _escCtr(c.token) + '"><b style="color:var(--text)">' + _escCtr(c.creador_nombre) +
        '</b> · ' + _escCtr(c.evento_nombre) + ' — enviado <b style="color:#ffb020">' +
        _escCtr(_ctrDiasTexto(_ctrDiasEnviado(c))) + '</b></div>').join('') +
    '</div>' +
    '<span style="font-size:11px;color:var(--ts2)">La alerta sugiere; el reenvío lo decides tú, desde el botón de su fila.</span>';
}

// ═══ [HER-1c] LOS CHIPS ═══════════════════════════════════════════════════
// Arranca en PENDIENTES: de 25 contratos, 23 están firmados y no piden nada.
// Lo que Memo abre esta pantalla a buscar son los 2 que sí.
//
// 🔒 LOS VENCIDOS VIVEN APARTE. No salen en pendientes ni en firmados — es el
// patrón del archivo de Esferas: lo que ya no se gobierna se recuerda en su
// propia vista, no estorbando en la principal. En `// todos` salen todos.
//
// ⚠️ HOY EL CHIP DICE (0) Y VA A SEGUIR DICIENDO (0) casi un año: solo la
// plantilla `coordinador` llena `vigencia_fin` (13 de 13) y todas vencen en
// ago-2027. No es que la regla falle: es que 12 de 25 contratos no tienen con
// qué juzgarse. Firmado por Memo sabiéndolo.
let _ctrFiltro = 'pendiente';

function _ctrPasaFiltro(c, filtro) {
  const vencido = _ctrVencido(c);
  if (filtro === 'vencido') return vencido;
  if (filtro === 'todos') return true;
  if (vencido) return false;                 // fuera de la vista principal
  return String(c.estado || '') === filtro;
}

function filtrarContratos(filtro, btn) {
  document.querySelectorAll('#page-contratos .gz-filter[id^="ctrf-"]').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _ctrFiltro = filtro;
  _ctrPintarLista();
}

// Mira NOMBRE, CORREO y EVENTO: son los tres con los que Memo llama a un
// contrato. Buscar "soy luna" tiene que encontrarlo aunque no recuerde de quién
// era, y buscar un correo tiene que encontrarlo aunque el nombre esté distinto.
function _ctrCoincide(c, q) {
  if (!q) return true;
  const t = (String(c.creador_nombre || '') + ' ' + String(c.creador_email || '') + ' ' +
             String(c.evento_nombre || '')).toLowerCase();
  return t.includes(q);
}

function _ctrBuscarEnLista() {
  _ctrBusca = (document.getElementById('ctr-buscar')?.value || '').trim().toLowerCase();
  _ctrPintarLista();
}

async function loadContratosList() {
  const tbody = document.getElementById('ctr-tbody');
  if (!tbody) return;
  try {
    // [sec-contratos] antes db.get('contratos_creadores', ...) con anon key.
    const rows = await khContratos.listar({ limit: 200 });
    _contratosCache = rows || [];
    _ctrPintarLista();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red);padding:30px;font-size:12px">Error: ${_escCtr(e.message)}</td></tr>`;
  }
}

function _ctrPintarLista() {
  const tbody = document.getElementById('ctr-tbody');
  if (!tbody) return;
  {
    if (!_contratosCache.length) {
      _ctrAlertaPintar();
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ts);padding:30px;font-size:12px;letter-spacing:.1em;text-transform:uppercase">Sin contratos todavía. Crea el primero en "+ Nuevo".</td></tr>`;
      return;
    }
    // [HER-1c] Dos cortes que se COMBINAN: primero el chip, luego el texto.
    const visibles = _contratosCache
      .filter(c => _ctrPasaFiltro(c, _ctrFiltro))
      .filter(c => _ctrCoincide(c, _ctrBusca));
    // Los conteos se cuentan SIN el buscador: el chip dice cuántos hay de cada
    // clase, no cuántos sobreviven al texto.
    const cuenta = { pendiente: 0, firmado: 0, vencido: 0 };
    _contratosCache.forEach((c) => {
      if (_ctrPasaFiltro(c, 'vencido')) { cuenta.vencido++; return; }
      if (_ctrPasaFiltro(c, 'pendiente')) cuenta.pendiente++;
      else if (_ctrPasaFiltro(c, 'firmado')) cuenta.firmado++;
    });
    const rot = (id, txt, n) => { const b = document.getElementById(id); if (b) b.textContent = txt + ' (' + n + ')'; };
    rot('ctrf-pendientes', '// pendientes', cuenta.pendiente);
    rot('ctrf-firmados', '// firmados', cuenta.firmado);
    rot('ctrf-vencidos', '// vencidos', cuenta.vencido);
    rot('ctrf-todos', '// todos', _contratosCache.length);
    _ctrAlertaPintar();
    if (!visibles.length) {
      // Una lista vacía es una AFIRMACIÓN: se dice cuántos hay del otro lado,
      // porque si no, no se sabe si no existe o si el texto lo tapó.
      const etq = { pendiente: 'pendiente', firmado: 'firmado', vencido: 'vencido', todos: '' };
      const q = etq[_ctrFiltro] ? etq[_ctrFiltro] + ' ' : '';
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ts);padding:30px;font-size:12px">` +
        (_ctrBusca
          ? `Ningún contrato ${q}dice "${_escCtr(_ctrBusca)}" — hay ${_contratosCache.length} en total.`
          : `Ningún contrato ${q || 'registrado'} — hay ${_contratosCache.length} en total.`) +
        `</td></tr>`;
      return;
    }
    tbody.innerHTML = visibles.map(c => {
      const firmado = c.estado === 'firmado';
      const badge = firmado
        ? `<span style="background:rgba(61,220,132,.18);color:#3ddc84;border:1px solid rgba(61,220,132,.35);padding:3px 9px;border-radius:4px;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700">✓ Firmado</span>`
        : `<span style="background:rgba(255,176,32,.15);color:#ffb020;border:1px solid rgba(255,176,32,.35);padding:3px 9px;border-radius:4px;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700">⏳ Pendiente</span>`;
      const fechaEnviado = c.enviado_at
        ? _tsToDate(c.enviado_at).toLocaleDateString('es-MX',{day:'2-digit',month:'short',timeZone:'America/Monterrey'})
        : '—';
      const tokenSafe = _escCtr(c.token);
      const nombreSafe = _attrJs(c.creador_nombre);   // [CAP5-1] va dentro de onclick
      const acciones = firmado
        ? `
          <button class="btn btn-ghost" style="padding:5px 10px;font-size:11px" onclick="verContratoFirmado('${tokenSafe}','${nombreSafe}')">Ver</button>
          ${CORT_PAQUETE[c.plantilla] ? `<button class="btn btn-ghost" style="padding:5px 10px;font-size:11px;color:#3ddc84;border-color:rgba(61,220,132,.35)" onclick="cortAbrir('${_escCtr(c.id)}')">${c.cortesia_evento ? '🎟 ✓' : '🎟 Cortesía'}</button>` : ''}
          ${c.plantilla === 'creadora_team' ? `<button class="btn btn-ghost" style="padding:5px 10px;font-size:11px;color:#c9a2ff;border-color:rgba(201,162,255,.3)" onclick="verAnexoC('${_escCtr(c.id)}','${nombreSafe}')">Anexo C</button>` : ''}
          ${_puedeBorrarAdmin() ? `<button class="btn btn-ghost" style="padding:5px 10px;font-size:11px;color:#ff6666;border-color:rgba(255,68,68,.3)" onclick="eliminarContrato('${tokenSafe}','${nombreSafe}',this)">Eliminar</button>` : ''}`
        : `
          <button class="btn btn-ghost" style="padding:5px 10px;font-size:11px" onclick="editarContrato('${tokenSafe}')">Editar</button>
          <button class="btn btn-ghost" style="padding:5px 10px;font-size:11px;color:#ffb020;border-color:rgba(255,176,32,.4)" onclick="reenviarContratoEmail('${tokenSafe}')">✉ Reenviar…</button>
          <button class="btn btn-ghost" style="padding:5px 10px;font-size:11px" onclick="copiarLinkContrato('${tokenSafe}',this)">Copiar link</button>
          ${_puedeBorrarAdmin() ? `<button class="btn btn-ghost" style="padding:5px 10px;font-size:11px;color:#ff6666;border-color:rgba(255,68,68,.3)" onclick="eliminarContrato('${tokenSafe}','${nombreSafe}',this)">Eliminar</button>` : ''}`;
      return `<tr>
        <td><b>${nombreSafe}</b> ${_ctrPlantillaChip(c.plantilla)}${_ctrCuidadorChip(c)}<br><span style="color:var(--ts);font-size:11px">${_escCtr(c.creador_email)}</span></td>
        <td>${_escCtr(c.evento_nombre)}<br><span style="color:var(--ts);font-size:11px">${_fmtFechaCortaCtr(c.evento_fecha)}</span></td>
        <td>${fechaEnviado}${_ctrAntiguedadFila(c)}</td>
        <td>${badge}${_ctrVigenciaAviso(c)}${_ctrStrikesChip(c)}</td>
        <td style="text-align:right;white-space:nowrap">${acciones}</td>
      </tr>`;
    }).join('');
  }
}

// ═══ [CREA-1b] Cortesías: de contrato firmado a boleto apartado ═══════════
// El camino manual de Jane, hecho botón. Nace GENÉRICO: la plantilla del
// contrato decide el paquete (creadora→CHEAP, coordinador/auxiliar→PLUS) y con
// él la lista de zonas — que NO es la misma en los dos (`cheapZonas` vs
// `zonas`). Elegir de la lista equivocada guardaría una zona que el stock no
// reconoce.
let _cortCtr = null;   // el contrato abierto en el panel
let _cortEV = null;    // el catálogo del index, cacheado por _fetchEVFromIndex

// 🔒 La misma tabla del servidor. Si divergen, el arnés lo canta: se asertan
// una contra otra, no contra un número recordado.
const CORT_PAQUETE = {
  creadora:       { paquete: 'CHEAP', etq: 'creadora',    zonasDe: 'cheapZonas' },
  coordinador:    { paquete: 'PLUS',  etq: 'coordinador', zonasDe: 'zonas' },
  auxiliar_admin: { paquete: 'PLUS',  etq: 'staff',       zonasDe: 'zonas' },
};

function _cortEl(id) { return document.getElementById(id); }

async function cortAbrir(contratoId) {
  const c = (_contratosCache || []).find(x => x && x.id === contratoId);
  if (!c) return;
  _cortCtr = c;
  const panel = _cortEl('cort-panel');
  if (!panel) return;
  panel.style.display = '';
  _cortEl('cort-alert').innerHTML = '';
  _cortEl('cort-quien').textContent = c.creador_nombre || '';

  const cfg = CORT_PAQUETE[c.plantilla];
  const sub = _cortEl('cort-sub');
  if (!cfg) {
    // Sin default: una plantilla que no está en la tabla se DICE, no se asume.
    sub.innerHTML = `No sé qué paquete le toca a un contrato «${_escCtr(c.plantilla)}». Captúralo a mano por ahora.`;
    sub.style.color = '#ff5f56';
    _cortEl('cort-guardar').disabled = true;
    return;
  }
  _cortEl('cort-guardar').disabled = false;
  sub.style.color = '';
  sub.innerHTML = `Paquete <b>${cfg.paquete}</b> (${cfg.etq}) · contrato de «${_escCtr(c.evento_nombre)}».`;

  // La talla: se pide a mano SOLO si el contrato no la trae. El predicado es el
  // CAMPO, no el objeto — hoy 26 de 26 firmados traen `datos` y ninguno trae
  // talla, así que preguntar por el objeto dejaría pasar 22 con talla nula.
  const faltaTalla = !c.talla_contrato;
  _cortEl('cort-talla-wrap').style.display = faltaTalla ? '' : 'none';
  if (!faltaTalla) sub.innerHTML += ` Talla <b>${_escCtr(c.talla_contrato)}</b> del contrato.`;

  // Ya asignada: se dice y no se ofrece de nuevo. `stock_ajustes` SUMA — un
  // segundo clic duplicaría boletos en silencio.
  if (c.cortesia_evento) {
    sub.innerHTML = `Ya tiene cortesía asignada en <b>${_escCtr(c.cortesia_evento)}</b>. No se asigna dos veces.`;
    sub.style.color = '#ffb020';
    _cortEl('cort-guardar').disabled = true;
    return;
  }

  // Eventos: los gobernables del catálogo, y el del contrato ADIVINADO arriba
  // — derivado, nunca aplicado solo. El humano confirma.
  const selEv = _cortEl('cort-evento');
  selEv.innerHTML = '<option value="">— cargando catálogo… —</option>';
  try { _cortEV = await _fetchEVFromIndex(); } catch (_) { _cortEV = null; }
  if (!_cortEV || !_cortEV.length) {
    selEv.innerHTML = '<option value="">— no se pudo leer el catálogo —</option>';
    _cortEl('cort-guardar').disabled = true;
    return;
  }
  const sug = _cortSugerido(c, _cortEV);
  selEv.innerHTML = '<option value="">— elegir evento —</option>' + _cortEV
    .filter(e => e && e.id)
    .map(e => `<option value="${_escCtr(e.id)}"${e.id === sug ? ' selected' : ''}>${_escCtr(e.a || e.id)}${e.f ? ' · ' + _escCtr(e.f) : ''}</option>`)
    .join('');
  _cortEl('cort-evento-hint').textContent = sug
    ? 'Derivado del contrato — confírmalo o cámbialo.'
    : 'El contrato no nombra un evento del catálogo: elígelo.';
  _cortEl('cort-boletos').value = '1';
  cortEventoElegido();
}

// El evento se DERIVA del nombre del contrato, y se derive o no, el humano
// confirma. Cotejar por nombre normalizado: "Calle 24" ↔ artista del catálogo.
function _cortSugerido(c, EV) {
  const norm = s => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const meta = norm(c.evento_nombre);
  if (!meta) return '';
  const exacto = EV.find(e => e && norm(e.a) === meta);
  if (exacto) return exacto.id;
  const contiene = EV.find(e => e && meta && norm(e.a) && (norm(e.a).startsWith(meta) || meta.startsWith(norm(e.a))));
  return contiene ? contiene.id : '';
}

function cortEventoElegido() {
  const id = (_cortEl('cort-evento') || {}).value || '';
  const sel = _cortEl('cort-zona');
  const hint = _cortEl('cort-zona-hint');
  const cfg = _cortCtr ? CORT_PAQUETE[_cortCtr.plantilla] : null;
  if (!id || !cfg) { sel.innerHTML = '<option value="">— elige evento primero —</option>'; hint.textContent = ''; return; }
  const ev = (_cortEV || []).find(e => e && e.id === id);
  const fuente = (ev && ev[cfg.zonasDe]) || [];
  if (!fuente.length) {
    sel.innerHTML = '<option value="">— sin zonas en el catálogo —</option>';
    hint.textContent = `Este evento no tiene lista ${cfg.zonasDe} — revisa el catálogo antes de asignar.`;
    return;
  }
  sel.innerHTML = '<option value="">— elegir —</option>' + fuente.map(z =>
    `<option value="${_escCtr(z.n)}">${_escCtr(z.n)}${z.ag ? ' (agotada)' : ''}</option>`).join('');
  hint.textContent = `Zonas del paquete ${cfg.paquete}.`;
}

function cortCerrar() {
  const p = _cortEl('cort-panel');
  if (p) p.style.display = 'none';
  _cortCtr = null;
}

async function cortGuardar() {
  if (!_cortCtr) return;
  const btn = _cortEl('cort-guardar');
  const alert = _cortEl('cort-alert');
  const evento_id = (_cortEl('cort-evento') || {}).value || '';
  const zona = (_cortEl('cort-zona') || {}).value || '';
  const boletos = parseInt((_cortEl('cort-boletos') || {}).value || '0', 10);
  const talla = (_cortEl('cort-talla') || {}).value || '';
  const faltaTalla = !_cortCtr.talla_contrato;
  const falta = !evento_id ? 'el evento' : !zona ? 'la zona' : (faltaTalla && !talla) ? 'la talla' : '';
  if (falta) { alert.innerHTML = `<div style="color:#ff5f56;font-size:12px;margin-bottom:8px">Falta ${falta}.</div>`; return; }

  btn.disabled = true; btn.textContent = 'Asignando…';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-coordi-asignaciones', {
      method: 'POST',
      body: JSON.stringify({ accion: 'cortesia_asignar', contrato_id: _cortCtr.id, evento_id, zona, boletos, talla: talla || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    alert.innerHTML = j.ya
      ? `<div style="color:#ffb020;font-size:12px;margin-bottom:8px">Ya estaba asignada — no se tocó nada.</div>`
      : `<div style="color:#3ddc84;font-size:12px;margin-bottom:8px">Listo: ${boletos} boleto${boletos > 1 ? 's' : ''} apartado${boletos > 1 ? 's' : ''} en ${_escCtr(zona)}${j.creada ? ' y viajero registrado' : ' (el viajero ya existía: se le puso la zona)'}.</div>`;
    if (typeof cargarContratos === 'function') cargarContratos();
  } catch (e) {
    alert.innerHTML = `<div style="color:#ff5f56;font-size:12px;margin-bottom:8px">No se pudo: ${_escCtr(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Asignar cortesía';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// [UB-1] LA CASA DE URANAI BABA — los códigos de promoción, gobernados.
//
// Hoy una promoción vive partida en tres —el CAJERO (`var PROMOS` del index),
// el LETRERO (`flash_promo` de Esferas) y el BADGE— y solo el cajero cobra.
// NATA nació con letrero y badge y sin cajero: 47 minutos y 6 clientes
// rechazados. Esta pantalla gobierna el cajero.
//
// 🔒 LAS TRES UNIDADES SON EXCLUYENTES, y la base ya lo exige
// (`num_nonnulls(monto, pct, segundo_pax) = 1`). La pantalla no lo repite por
// desconfianza: lo DICE, con tres tarjetas y una sola encendida, porque un
// candado que el usuario no ve se siente como un error del sistema cuando
// muerde. De ahí salió el «500% de descuento»: dos campos numéricos hermanos
// sin nada que dijera «elige uno».
// ═══════════════════════════════════════════════════════════════════════════

let _babaCodigos = [];
let _babaFiltro = 'vigentes';
let _babaEditando = null;   // el código abierto en la ficha, o null si es nuevo
let _babaUnidad = null;     // 'pesos' | 'pct' | 'pareja'
let _babaReintento = false; // freno del reintento del catálogo

// 🔒 EL RELOJ DE REYNOSA. Las vigencias se TECLEAN en hora de Reynosa y se
// GUARDAN como instante. Reynosa sigue el horario de EE.UU. (America/Matamoros),
// no el de Monterrey: son 133 días al año de diferencia con Cancún, invisibles
// en verano. Guardar el instante quita la pregunta — no hay literal que
// escribir mal.
const BABA_TZ = 'America/Matamoros';













// ═══ [UB-4] EL ORÁCULO ══════════════════════════════════════════════════════
// Baba habla como adivina pero JURA COMO NOTARIO: cada frase se arma con los
// números que el RPC devolvió, y debajo va su fuente. No hay ni un adjetivo que
// no venga de un dato.
//
// 🔒 BABA PROPONE, JAMÁS CREA NI PUBLICA. Cada lectura ofrece «Preparar», que
// abre la ficha de UB-1 PRE-LLENADA — y el clic de Crear sigue siendo de Memo.
// Sin IA: son reglas medibles sobre datos de la casa.
//
// 🔒 Y SI EL DATO NO ALCANZA, SE DICE. Una lectura nublada trae su motivo y
// CERO propuestas: rellenar sería inventarle a Memo un consejo sin respaldo.

// Las frases. Cada una recibe su item y devuelve texto + la propuesta que
// abriría la ficha. El TEXTO es donde vive el misticismo — no en el CSS.
const BABA_VOZ = {
  R1: it => ({
    dice: `Mmm… ${it.slug} tiene ${it.vistas} miradas en siete días y solo ${it.comprob} ` +
          `${it.comprob === 1 ? 'comprobante' : 'comprobantes'} (${it.pct}%). ` +
          `Tanta mirada sin compra huele a precio… un código podría destrabarlo.`,
    cifras: `${it.vistas} vistas · ${it.cotiz} cotizaciones · ${it.comprob} comprobantes`,
    pre: { unidad: 'pct', pct: 5, evento: it.slug,
           desc: `5% de descuento` },
  }),
  R2: it => ({
    dice: `Veo ${it.espera} almas esperando a ${it.slug}` +
          (it.sin_notif ? `, y ${it.sin_notif} sin avisar todavía` : ', todas ya avisadas') +
          `. Con ${it.vistas} ${it.vistas === 1 ? 'mirada' : 'miradas'} esta semana, un código las traería de vuelta.`,
    cifras: `${it.espera} en lista de espera · ${it.sin_notif} sin notificar · ${it.vistas} vistas 7d`,
    pre: { unidad: 'pct', pct: 5, evento: it.slug, desc: `5% de descuento` },
  }),
  R3: it => ({
    dice: `El código ${it.codigo} se intentó ${it.intentos} veces y solo ${it.validos} ` +
          `${it.validos === 1 ? 'sirvió' : 'sirvieron'} (${it.pct}%). ` +
          `Algo prometido no está cobrando — revísalo antes de prometer más.`,
    cifras: `${it.intentos} intentos · ${it.validos} válidos · ${it.pct}% de acierto`,
    pre: null,   // no se propone un código nuevo: se arregla el que rebota
    revisar: it.codigo,
  }),
  // [ORACULO-FIX-1] La lectura honesta de lo que AÚN NO SE VENDE. No es una
  // promo —no hay precio que descontar— sino la acción que SÍ existe: publicarlo,
  // y entonces la lista de espera avisa sola (WL-1). Ni se omite ni se le receta
  // un código imposible.
  // 🔒 Y «no se vende» son DOS cosas: la voz cambia según cuál. Decirle «cuando
  // lo publiques» a un evento AGOTADO sería la misma mentira que Jane cazó, un
  // piso más abajo — ya está publicado.
  R2B: it => ({
    dice: it.fase === 'aun_no'
      ? `Veo ${it.espera} almas esperando a ${it.nombre || it.slug}, y todavía no sale a la venta` +
        (it.status ? ` (${it.status})` : '') + `. ` +
        `Aquí no hay precio que descontar: cuando lo publiques, la lista de espera les avisará sola.`
      : `Veo ${it.espera} almas esperando a ${it.nombre || it.slug}, pero ya no se está vendiendo` +
        (it.status ? ` (${it.status})` : ' — sin una sola zona libre') + `. ` +
        `Un código no les serviría de nada: lo que esperan es lugar, no descuento.`,
    cifras: `${it.espera} en lista de espera · ${it.sin_notif} sin notificar · ${it.vistas} vistas 7d`,
    pre: null,   // 🔒 NUNCA una propuesta de código sobre algo que no se vende
    esperar: it.slug,
  }),
  R4: it => ({
    dice: `${it.nombre || it.slug} canta en ${it.dias} ${it.dias === 1 ? 'día' : 'días'} y quedan ` +
          `${it.inventario} ${it.inventario === 1 ? 'boleto' : 'boletos'} sin dueño. El tiempo ya no está de tu lado.`,
    cifras: `faltan ${it.dias} días · ${it.inventario} boletos disponibles` +
            (it.zonas_con_lugar ? ` en ${it.zonas_con_lugar} ${it.zonas_con_lugar === 1 ? 'zona' : 'zonas'}` : ''),
    pre: { unidad: 'pesos', monto: 300, evento: it.slug, desc: `$300 de descuento` },
  }),
};



// Las propuestas vivas, por id. Se guardan aparte para no meter un objeto
// entero dentro de un `onclick` — donde una comilla del texto rompería el HTML.
let _babaPropuestas = {};


function verContratoFirmado(token, nombre) {
  document.getElementById('ctr-ver-titulo').textContent = nombre || '';
  document.getElementById('ctr-ver-iframe').src = '/contrato?t=' + encodeURIComponent(token);
  openModal('modal-contrato-ver');
}

// 🔒 ANEXO C (Declaración Discreta) — SOLO ADMIN. El endpoint público de
// contrato lo poda; aquí se pide por admin-contratos (accion 'obtener', que sí
// trae datos) y se pinta en una sección COLAPSADA. Confidencial: gestión de
// riesgo reputacional, sin difusión.
async function verAnexoC(id, nombre) {
  const body = document.getElementById('ctr-preview-body');
  if (!body) return;
  body.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
  openModal('modal-contrato-preview');
  try {
    const c = await khContratos.obtener(id);
    const ax = c && c.datos && c.datos.anexo_c;
    const d = (c && c.datos) || {};
    const CUENTAS = { no: 'No', si: 'Sí' };
    const ESTADOS = { nunca: 'Nunca existió', baja: 'Dada de baja', vigente_sin_uso: 'Vigente (sin uso)', vigente_en_uso: 'Vigente (en uso)' };
    const INTENCION = { no_reactivar: 'No reactivar / no crear', acuerdo: 'Requiere acuerdo especial' };
    const fila = (k, v) => `<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #eee"><div style="flex:1;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#666;font-weight:700">${k}</div><div style="flex:1.4;font-size:13px;color:#000">${_escCtr(v || '—')}</div></div>`;
    const proemio = `
      ${fila('Origen', d.origen)}
      ${fila('Domicilio', d.domicilio)}
      ${fila('Ciudad/Estado', d.ciudad_estado)}`;
    const anexo = !ax
      ? '<p style="font-size:13px;color:#666;margin-top:10px">Este contrato no tiene Anexo C capturado (se llena al firmar).</p>'
      : `
      <details style="margin-top:14px;border:1px solid rgba(201,162,255,.5);border-radius:var(--r-sm,8px);padding:10px 14px;background:rgba(201,162,255,.06)">
        <summary style="cursor:pointer;font-weight:800;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#7a4fc9">🔒 Anexo C — Declaración Discreta (confidencial)</summary>
        <div style="margin-top:10px">
          ${fila('¿Cuentas de contenido adulto?', CUENTAS[ax.cuentas_previas] || ax.cuentas_previas)}
          ${ax.plataformas ? fila('Plataforma y estatus', ax.plataformas) : ''}
          ${fila('Estado actual', ESTADOS[ax.estado_actual] || ax.estado_actual)}
          ${fila('¿Material previo que pueda circular?', CUENTAS[ax.material_previo] || ax.material_previo)}
          ${ax.material_desc ? fila('Descripción general', ax.material_desc) : ''}
          ${fila('Intención futura', INTENCION[ax.intencion] || ax.intencion)}
          ${ax.intencion_det ? fila('Detalle del acuerdo', ax.intencion_det) : ''}
          <p style="font-size:11px;color:#999;margin:10px 0 0">Estrictamente confidencial: solo gestión de riesgo reputacional, sin difusión. Jamás aparece en el contrato público.</p>
        </div>
      </details>`;
    body.innerHTML = `
      <h2 style="font-family:'Barlow Condensed','Montserrat',sans-serif;font-size:28px;text-transform:uppercase;margin:0 0 12px;color:#000">${_escCtr(nombre || (c && c.creador_nombre) || '')}<small style="display:block;font-size:12px;color:#ff283b;font-weight:800;letter-spacing:.18em;margin-top:4px">Datos del contrato TEAM</small></h2>
      ${proemio}
      ${anexo}`;
  } catch (e) {
    body.innerHTML = `<div class="alert alert-error">${_escCtr(e.message)}</div>`;
  }
}

// ═══ [HER-1e] EL REENVÍO, EN DOS PASOS ════════════════════════════════════
// Antes era un `confirm()` de una línea que mandaba el correo de inmediato.
// `CORREOS_MODO` está en REAL desde el 31-jul: lo que se manda, se manda — a
// una persona, a su bandeja. Un botón así merece la misma ceremonia que
// posponer un evento.
//
// 🔒 PASO 1 · se elige la fecha límite y se lee el correo ENTERO antes de que
//    exista un correo. La fecha llega pre-llenada a HOY + 5 DÍAS (firmado) y es
//    EDITABLE: el default es una sugerencia, no una decisión.
// 🔒 PASO 2 · se confirma a quién se le va a escribir. Hasta aquí no ha salido
//    ni una petición.
// 🔒 MANUAL SIEMPRE. Ni `schedule`, ni cron, ni una rama que mande sola. La
//    alerta de 1d sugiere; esto lo aprieta Memo.
const _CTR_LIMITE_DIAS = 5;
let _ctrReenvio = null;   // { token, paso }

// La MITAD NAVEGADOR del texto de la fecha. La otra vive en
// `contrato-reenviar.js` y el arnés las carea letra por letra sobre un abanico
// de fechas: son dos runtimes, no hay forma de compartir la función, y dos
// copias que nadie carea es como se llega a una vista previa que miente.
function _ctrLimiteTexto(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  try {
    const d = new Date(iso + 'T12:00:00-05:00');
    if (!Number.isFinite(d.getTime())) return '';
    // ⚠️ IDA Y VUELTA. La forma no basta: `2026-13-45` pasa el regex y sale
    // "Invalid Date" —que se iría ESCRITA en el correo—, y `2026-02-31` es peor
    // todavía: JavaScript lo rueda EN SILENCIO a "3 de marzo", así que un
    // dedazo se convierte en otra fecha que parece buena. Si la fecha no vuelve
    // a escribirse igual, no es la fecha que alguien tecleó.
    if (d.toLocaleDateString('en-CA', { timeZone: TZ_REYNOSA }) !== iso) return '';
    return d.toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ_REYNOSA,
    });
  } catch (_) { return ''; }
}

function _ctrLimiteDefault() {
  const d = new Date(_ctrHoyReynosa().getTime() + _CTR_LIMITE_DIAS * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: TZ_REYNOSA });
}

function reenviarContratoEmail(token) {
  const c = (_contratosCache || []).find((x) => x && x.token === token);
  if (!c) { alert('No encontré ese contrato en la lista. Recarga e intenta de nuevo.'); return; }
  _ctrReenvio = { token: token, paso: 1 };
  const f = document.getElementById('ctr-re-fecha');
  if (f) { f.value = _ctrLimiteDefault(); f.min = _ctrHoyReynosa().toLocaleDateString('en-CA', { timeZone: TZ_REYNOSA }); }
  _ctrReenvioPintar();
  openModal('modal-contrato-reenviar');
}

function _ctrReenvioPintar() {
  if (!_ctrReenvio) return;
  const c = (_contratosCache || []).find((x) => x && x.token === _ctrReenvio.token);
  if (!c) return;
  const el = (id) => document.getElementById(id);
  const paso = _ctrReenvio.paso;
  const dias = _ctrDiasEnviado(c);
  el('ctr-re-paso').textContent = '// REENVIAR CONTRATO · PASO ' + paso + ' DE 2';
  el('ctr-re-nombre').textContent = c.creador_nombre || '';
  el('ctr-re-sub').textContent = [c.creador_email, c.evento_nombre, dias === null ? '' : ('enviado ' + _ctrDiasTexto(dias))]
    .filter(Boolean).join(' · ');
  el('ctr-re-p1').style.display = paso === 1 ? '' : 'none';
  el('ctr-re-p2').style.display = paso === 2 ? '' : 'none';
  el('ctr-re-atras').style.display = paso === 2 ? '' : 'none';
  el('ctr-re-seguir').textContent = paso === 1 ? 'Continuar →' : 'Sí, mandar el correo';
  el('ctr-re-seguir').disabled = false;
  if (paso === 1) {
    const iso = el('ctr-re-fecha').value;
    const txt = _ctrLimiteTexto(iso);
    // Sin fecha legible NO se avanza: el paso 2 prometería un correo que el
    // servidor va a rechazar en la puerta.
    el('ctr-re-seguir').disabled = !txt;
    el('ctr-re-cuerpo').innerHTML = txt
      ? ('Notamos que aún no has firmado tu contrato de colaboración para <b style="color:var(--orange)">' +
         _escCtr(c.evento_nombre) + '</b>. Te volvemos a mandar el link por si se te traspapeló.<br><br>' +
         '<b style="color:#ffb020">Para poder apartarte el lugar necesitamos tu firma antes del ' + _escCtr(txt) +
         '.</b> Si para esa fecha no está firmado, damos de baja la colaboración y liberamos el lugar.<br><br>' +
         '¿Ya no puedes? Contéstanos este correo y lo vemos.')
      : '<span style="color:var(--red)">Escribe una fecha válida para poder continuar.</span>';
  } else {
    el('ctr-re-destino').innerHTML =
      'Se va a mandar UN correo, ahora, a <b style="color:var(--text)">' + _escCtr(c.creador_email) + '</b>' +
      ' con fecha límite <b style="color:#ffb020">' + _escCtr(_ctrLimiteTexto(el('ctr-re-fecha').value)) + '</b>.' +
      '<br><br>Esto NO cancela nada: si no firma, dar de baja la colaboración sigue siendo tuyo y a mano.';
  }
}

function _ctrReenvioAtras() { if (_ctrReenvio) { _ctrReenvio.paso = 1; _ctrReenvioPintar(); } }

async function _ctrReenvioSeguir() {
  if (!_ctrReenvio) return;
  // PASO 1 → PASO 2. Aquí NO sale nada: solo se avanza la ceremonia.
  if (_ctrReenvio.paso === 1) { _ctrReenvio.paso = 2; _ctrReenvioPintar(); return; }
  const btn = document.getElementById('ctr-re-seguir');
  const fecha = document.getElementById('ctr-re-fecha').value;
  btn.disabled = true;
  btn.textContent = 'Mandando…';
  try {
    const r = await khAdminFetch('/.netlify/functions/contrato-reenviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: _ctrReenvio.token, fecha_limite: fecha }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'Error al reenviar');
    closeModal('modal-contrato-reenviar');
    _ctrReenvio = null;
    showToast('Correo reenviado con fecha límite', 'success');
  } catch (e) {
    // El error se dice DENTRO del modal, no en un alert que tapa lo que se
    // estaba haciendo: aquí se puede corregir la fecha y reintentar.
    document.getElementById('ctr-re-destino').innerHTML =
      '<span style="color:var(--red)">No se pudo mandar: ' + _escCtr(e.message) + '</span>';
    btn.disabled = false;
    btn.textContent = 'Sí, mandar el correo';
  }
}

async function copiarLinkContrato(token, btn) {
  const link = location.origin + '/contrato?t=' + encodeURIComponent(token);
  try {
    await navigator.clipboard.writeText(link);
    const original = btn.textContent;
    btn.textContent = '✓ Copiado';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch (e) {
    prompt('Copia este link manualmente:', link);
  }
}

function editarContrato(token) {
  const c = _contratosCache.find(x => x.token === token);
  if (!c) { alert('Contrato no encontrado en cache'); return; }
  if (c.estado === 'firmado') { alert('No se puede editar un contrato firmado'); return; }
  _contratosEditingToken = token;
  switchContratoView('nuevo');
  _loadContratoEnForm(c);
  document.getElementById('ctr-alert').innerHTML = '';
}

async function eliminarContrato(token, nombre, btn) {
  if (!confirm(`¿Eliminar este contrato${nombre ? ' de ' + nombre : ''}? Esta acción no se puede deshacer.`)) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const r = await khAdminFetch('/.netlify/functions/contrato-eliminar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || 'Error al eliminar');
    loadContratosList();
  } catch (e) {
    alert('No se pudo eliminar: ' + e.message);
    btn.textContent = original;
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// LISTA DE ESPERA (eventos_waitlist + eventos_estado_snapshot)
// ═══════════════════════════════════════════════════════════════
let _waitlistCache = [];
let _snapshotCache = {};
// [sec-radar-wl] _wlSb (lectura anon directa) eliminado → khWaitlist.listar()/snapshot().



// ═══ [HER-1f] EL BUSCADOR DE LA LISTA DE ESPERA ═══════════════════════════
// 438 personas en 12 eventos y ni una caja de búsqueda. Mismo patrón que el de
// Contratos y el de Esferas: filtra EN VIVO lo pintado, sin pedir nada al
// servidor. Por eso `loadWaitlist` se partió en traer y `_wlPintar` en dibujar.
let _wlBusca = '';

// ═══ [HER-1g] EL ARCHIVO DE LA LISTA DE ESPERA ════════════════════════════
// Un evento cuya gente YA fue notificada no pide nada: ocupa el mismo espacio
// que los que sí esperan una decisión. Se va al archivo solo.
//
// 🔒 NADA SE BORRA. Los 400 correos únicos son el activo para las promos que
// vienen — decisión de Memo. Archivar es una VISTA, no un `delete`: las 438
// filas siguen en el caché y en la base después de archivar, y «Volver a
// activos» está a un clic.
//
// 🔒 SE CALCULA AL PINTAR. Cero columnas nuevas, cero migraciones:
// `eventos_waitlist` ya tiene `notificado`, y "archivado" es simplemente
// "todas sus filas lo traen". Un evento a medio notificar NO se archiva —
// todavía le debe correos a alguien.
//
// ⚠️ UN EVENTO SIN GENTE no se archiva: no hay a quién haber notificado.
// `[].every(...)` es `true` y sin este candado un grupo vacío entraría al
// archivo por una regla de lógica, no por un hecho.
let _wlFiltro = 'activos';



// «Volver a activos» es de la VISTA, no de los datos: reabre el evento en la
// pantalla sin tocar una fila. Marcarlos como no-notificados sería reescribir
// la historia de a quién ya se le escribió.
let _wlReabiertos = new Set();





// Construye un Date a prueba de timestamps sin información de zona.
// Si el ISO no termina en 'Z' ni en offset +HH:MM, se asume UTC y se sufija 'Z'
// para que JS no lo interprete como hora local del navegador. Esto neutraliza el
// bug clásico de columnas Postgres `timestamp` (sin time zone) que serializan
// "2026-05-16T14:58:48.099127" sin sufijo. Si la columna está bien tipada como
// `timestamptz`, el regex detecta el offset y no se modifica el string.
function _tsToDate(iso) {
  if (!iso) return null;
  const s = String(iso);
  const fixed = /[Zz]$|[+\-]\d{2}:?\d{2}$/.test(s) ? s : (s + 'Z');
  return new Date(fixed);
}








// ═══════════════════════════════════════════════
// ROL · ANALYTICS — dashboard de uso anónimo de /rol
// ═══════════════════════════════════════════════
var _rolanRange = 'month';
var _rolanRefreshId = null;
var _rolanLastRows = [];


function startRolAnalyticsAutoRefresh(){
  stopRolAnalyticsAutoRefresh();
  _rolanRefreshId = setInterval(() => {
    // Solo refrescar si la pestaña sigue activa
    const page = document.getElementById('page-rol-analytics');
    if (page && page.classList.contains('active')) loadRolAnalytics(true);
  }, 60000);
}
function stopRolAnalyticsAutoRefresh(){
  if (_rolanRefreshId) { clearInterval(_rolanRefreshId); _rolanRefreshId = null; }
}





// ═══════════════════════════════════════════════
// RADAR DEL DRAGÓN — analytics cross-source
// ═══════════════════════════════════════════════
var _radarRange = 'month';     // 'today' | 'week' | 'month' | '3months' | 'all'
var _radarSub   = 'resumen';
var _radarRefreshId = null;
var _radarCache = { main: [], pagos: [], rol: [], waitlist: [], alertas: [] };
var _radarEvCache = { count: null, ts: 0 }; // eventos activos: 5 min TTL

// Cache del RPC radar_metricas, indexado por rango ('today'|'week'|...). Evita
// re-pedir el agregado al cambiar de sub-pestaña con el mismo rango. Se invalida
// al cambiar de rango y en cada auto-refresh (ver loadRadar / handler de rango).
var _radarRpcCache = {};


// ═══════════════════════════════════════════════════════════════════════════
// [RAD-1a] EL CALENDARIO DEL RADAR · LA ÚNICA FUENTE
//
// Antes había CUATRO aritméticas de ventana en esta pantalla, y ninguna
// coincidía con el calendario:
//   · `_radarSinceISO`  → «semana» = ahora−7d, «mes» = ahora−30d, y el «hoy»
//                          cortado a la medianoche DE LA MÁQUINA de quien mira.
//   · `radar_metricas`  → la misma aritmética otra vez, en PL/pgSQL.
//   · `_radarHomeSince` → ahora−14d con toISOString.
//   · `_rcmRangosPara`  → meses y años de calendario… en hora local del navegador.
//
// Medido el 27-ago (jueves), sobre los clicks del diario: la «semana» del radar
// traía 3,090 clicks y la semana de verdad (lun 24→hoy) 1,990. **55% de más.**
// Y el RPC devolvía la ventana del «mes» arrancando a las 17:51 de un 28 de
// julio, porque contaba 30×24 horas hacia atrás desde el instante del clic.
//
// 🔒 LA NORMA, FIRMADA POR MEMO (27-ago-2026):
//   · Semanas de LUNES a domingo. Meses del día 1 al último.
//   · Todo en hora de REYNOSA, y Reynosa es `America/Matamoros`.
//   · JAMÁS `toISOString()` como «hoy»: es la fecha de Greenwich, y aquí se
//     trabaja de noche. Tres mordidas ya.
//   · Las ventanas rodantes NO se borran: se RENOMBRAN. «Últimos 7 días» es un
//     corte legítimo; lo que no puede es llamarse «Esta semana».
//
// ⚠️ POR QUÉ `America/Matamoros` Y NO `America/Cancun`. Las dos dan −05:00 HOY,
// así que hoy son indistinguibles — y **divergen del 1-nov-2026 al 13-mar-2027,
// 133 días**: Matamoros sigue el horario de EE.UU. (pasa a −06:00 en invierno) y
// Cancun es −05:00 fijo. Reynosa es zona FRONTERIZA y sigue a EE.UU., que es
// justo lo que ya razonaron `giveaway-consuelo`, `giveaway-recordatorio` y el
// propio `index.html`. Elegir por lo que se ve hoy habría metido una
// divergencia dormida a 66 días de distancia.
//
// ⚠️ Y no se toca la cubeta `event_clicks_diario`, que lleva 9 días cortados en
// Monterrey: reescribir historia es peor que anotarla. Es legacy, como los
// `-06:00` de mayo en el catálogo.
// ═══════════════════════════════════════════════════════════════════════════
// [TZ-UNIF-1] El mismo reloj que el resto de la casa. Se conserva el nombre
// porque el Radar y sus arneses lo citan, pero ya no es un segundo literal.
const RAD_TZ = TZ_REYNOSA;   // Reynosa. No es Monterrey. No es Cancún.

// El desfase de la zona EN ESE INSTANTE (los husos con horario de verano no
// tienen UN desfase: tienen el de ese día). Se pregunta al motor de Intl, que
// es quien tiene la tabla, en vez de escribir un número.
function _radCalDesfase(instante) {
  const iso = new Date(instante).toLocaleString('sv-SE', { timeZone: RAD_TZ });
  return Date.parse(iso + 'Z') - new Date(instante).getTime();
}
// Las piezas del reloj de pared de Reynosa en ese instante.
function _radCalPartes(instante) {
  const s = new Date(instante).toLocaleString('sv-SE', { timeZone: RAD_TZ });
  const [f, h] = s.split(' ');
  const [y, m, d] = f.split('-').map(Number);
  return { y, m, d, hora: h, dow: new Date(f + 'T00:00:00Z').getUTCDay() };  // 0=dom
}
// El INSTANTE en que empieza ese día de pared en Reynosa.
// ⚠️ Dos pasadas: el desfase que aplica al resultado puede no ser el del punto
// de partida — es justo lo que pasa el día que cambia el horario.
function _radCalMedianoche(y, m, d) {
  const tentativa = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  let t = tentativa - _radCalDesfase(tentativa);
  t = tentativa - _radCalDesfase(t);
  return new Date(t);
}
function _radCalHoy() { const p = _radCalPartes(Date.now()); return _radCalMedianoche(p.y, p.m, p.d); }
// ⚠️ LA ARITMÉTICA DE DÍAS VA EN EL CALENDARIO, NO EN MILISEGUNDOS.
// Esto sumaba `n * 86400000` y lo cazó el careo contra Postgres en UN solo
// instante de los 18: el 15-mar-2027, el día después de que entra el horario
// de verano. Seis días de 24 horas hacia atrás desde el 15 caen una hora
// CORTOS —porque uno de esos días duró 23— y aterrizan a las 23:00 del día
// anterior: «últimos 7 días» arrancaba el 8 en vez del 9.
// Un día al año, invisible el resto. Sumando componentes de fecha en UTC (que
// no tiene horario de verano) y pidiendo después la medianoche de Reynosa, el
// salto es exacto siempre.
function _radCalMasDias(fecha, n) {
  const p = _radCalPartes(fecha.getTime());
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return _radCalMedianoche(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// 🔒 [RAD-1a-FIX] LAS DOS VENTANAS, DEL MISMO LARGO.
//
// RAD-1a cambió los cortes rodantes por cortes de calendario — y con eso ROMPIÓ
// algo que antes estaba bien por accidente. El corte viejo comparaba `ahora−7d`
// contra `ahora−14d..ahora−7d`: dos ventanas de EXACTAMENTE 7 días. Injustas de
// otra manera, pero del mismo largo. Con el calendario, el tramo actual va del
// lunes a AHORA (jueves = 3.57 días) y el previo era la semana pasada ENTERA.
//
// Medido en producción el 27-ago sobre `main_visita`:
//   actual 3.57 días → 2,454 sesiones
//   previo 7.00 días → 4,450 sesiones     → la tarjeta pintaba **−45%**
//   previo del mismo largo → 2,674        → lo honesto es **−8%**
// Treinta y siete puntos, en cada KPI del Resumen.
//
// ⚠️ De dónde salió: la regla «ventanas del mismo largo» la escribí yo para
// Giru, en el diagnóstico de esta misma serie, y la rompí en la tuerca que la
// estableció. Cambiar un corte no es solo mover el `since`: mueve también CON
// QUÉ se compara. Un cambio de ventana tiene dos lados y solo miré uno.
//
// El ajuste está en UNA puerta —no repetido en cada rango— porque cinco copias
// de una regla es exactamente cómo este archivo llegó a tener cinco calendarios.
function _radCalMismoLargo(v) {
  if (!v || !v.prevSince || !v.prevUntil) return v;
  const fin = v.until ? v.until.getTime() : Date.now();
  const largo = fin - v.since.getTime();
  if (!(largo > 0)) return v;                 // 'all' y cualquier ventana vacía
  v.prevUntil = new Date(v.prevSince.getTime() + largo);
  v.largoMs = largo;
  return v;
}

function _radCalVentanaCruda(rango) {
  const hoy = _radCalHoy();
  const p = _radCalPartes(Date.now());
  const finDeHoy = _radCalMasDias(hoy, 1);
  if (rango === 'today') {
    const ayer = _radCalMasDias(hoy, -1);
    return { since: hoy, until: null, prevSince: ayer, prevUntil: hoy,
             leyenda: 'Hoy', completa: false, dias: 1 };
  }
  if (rango === 'week') {
    // Lunes de ESTA semana. dow: 0=domingo → el lunes queda 6 días atrás.
    const atras = (p.dow + 6) % 7;
    const lunes = _radCalMasDias(hoy, -atras);
    return { since: lunes, until: null,
             prevSince: _radCalMasDias(lunes, -7), prevUntil: lunes,
             leyenda: 'Esta semana (lun→hoy)', completa: p.dow === 0, dias: atras + 1 };
  }
  if (rango === 'month') {
    const primero = _radCalMedianoche(p.y, p.m, 1);
    const mesPrev = p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 };
    return { since: primero, until: null,
             prevSince: _radCalMedianoche(mesPrev.y, mesPrev.m, 1), prevUntil: primero,
             leyenda: 'Este mes (1→hoy)', completa: false, dias: p.d };
  }
  if (rango === '3months') {
    // Los TRES meses de calendario que terminan en el actual, no 90×24 horas.
    let y = p.y, m = p.m - 2; while (m < 1) { m += 12; y -= 1; }
    const ini = _radCalMedianoche(y, m, 1);
    let y2 = y, m2 = m - 3; while (m2 < 1) { m2 += 12; y2 -= 1; }
    return { since: ini, until: null, prevSince: _radCalMedianoche(y2, m2, 1), prevUntil: ini,
             leyenda: '3 meses (calendario)', completa: false, dias: null };
  }
  if (rango === 'rolling7' || rango === 'rolling30') {
    // 🔒 Las rodantes SIGUEN EXISTIENDO y son útiles. Solo dejan de mentir con
    // el nombre: se llaman por lo que son.
    const n = rango === 'rolling7' ? 7 : 30;
    const ini = _radCalMasDias(hoy, -(n - 1));
    return { since: ini, until: null, prevSince: _radCalMasDias(ini, -n), prevUntil: ini,
             leyenda: `Últimos ${n} días`, completa: true, dias: n };
  }
  return { since: new Date(0), until: null, prevSince: new Date(0), prevUntil: new Date(0),
           leyenda: 'Todo', completa: true, dias: null };
}



function _radarPrevSinceISO(r){ return _radCalVentana(r || _radarRange).prevSince.toISOString(); }
function _radarLeyenda(r){ return _radCalVentana(r || _radarRange).leyenda; }

// ═══════════════════════════════════════════════════════════════
// Textos de ayuda para botones "?" del Radar del Dragón
// Clave: ID del elemento `.rdr-kpi-val` (para KPIs) o texto exacto del
// `.rdr-card-title` (para cards). Sin entrada = sin botón.
// ═══════════════════════════════════════════════════════════════
const RADAR_HELP_KPIS = {
  // Resumen general
  'rgr-visitas':     'Número de sesiones únicas que entraron al sitio en el rango seleccionado. Una sesión es una visita continua hasta que el usuario cierra el navegador o pasa 30 minutos sin actividad.',
  'rgr-cotizaciones':'Cuántas veces los usuarios llegaron al paso final del wizard y generaron una cotización completa. Incluye paquete + zona + (hotel si aplica) + (transporte si aplica).',
  'rgr-modal':       'Cuántos usuarios llegaron a ver el modal con datos bancarios. Es un indicador fuerte de intención de compra real.',
  'rgr-comprobante': 'Cuántos clicaron el botón "Enviar comprobante por Messenger/WhatsApp". NO confirma que efectivamente reservaron — solo que dieron clic.',
  'rgr-conv':        'Porcentaje calculado como (comprobantes enviados / visitas totales) × 100. Indica qué tan eficiente es el sitio para convertir visitas en intenciones de reserva.',
  'rgr-eventos-act': 'Total de eventos con st: "" o st: "ultimos". Excluye agotados, próximamente y placeholders.',
  'rgr-waitlist':    'Total de personas registradas en eventos con st: "proximamente". Esto es histórico — incluye registros de todos los eventos.',
  'rgr-planes':      'Cuántos planes de pago se generaron en total — un mismo usuario puede crear varios planes diferentes.',
  // /Rol
  'rro-sesiones':    'Visitas únicas a la página /rol. Cada sesión cuenta una vez, sin importar cuántos planes haga el mismo usuario.',
  'rro-planes':      'Cuántos planes de pago completos se crearon. Un usuario puede generar varios planes diferentes.',
  'rro-recordatorios':'Cuántos clientes activaron los recordatorios automáticos por email (un correo el día de cada pago).',
  // /Pagos
  'rpa-sesiones':    'Visitas a la página /pagos donde están los datos bancarios.',
  'rpa-copias':      'Cuáles cuentas bancarias se copiaron al portapapeles más veces. Indica qué paquete está vendiendo más.',
  'rpa-wa':          'Cuántos clicaron el botón de dudas por WhatsApp. Si es alto, podría haber confusión en la información.',
};
const RADAR_HELP_CARDS = {
  // Match por substring del title (case-insensitive). Primer match gana.
  'Top eventos cotizados': 'Lista de los eventos con más cotizaciones completas. Útil para saber dónde está la demanda real.',
  'Origen de tráfico':     'De dónde llegan los visitantes — Direct (escribieron la URL directo o vienen de WhatsApp/SMS), Facebook, Instagram, Google, etc.',
  'Embudo del wizard':     'Indica en qué paso del wizard el usuario abandona más. Si muchos se caen en "Hotel", revisar si las opciones son confusas o caras.',
  'Embudo de conversión':  'Cada paso muestra cuántos llegaron hasta ahí. Las pérdidas grandes entre pasos indican fricción en la UX.',
  'Paquetes más elegidos': 'Distribución porcentual de la última elección de paquete por sesión. Si un usuario cambia de PLUS a RIDE, cuenta solo como RIDE.',
  'Códigos: válidos vs no válidos': 'Códigos intentados con qué frecuencia y cuántos fueron válidos. Si un código tiene muchos intentos fallidos, revisar el flashPromo.',
  'Cuentas más copiadas':  'Cuáles cuentas bancarias se copiaron al portapapeles más veces. Indica qué paquete está vendiendo más.',
  'De dónde llegan':       'De dónde llegan los visitantes a /pagos — útil para entender qué canales mandan tráfico cerca del cierre.',
  'Métodos de compartir':  'Cómo comparten los clientes su plan — WhatsApp, copy link, email. WhatsApp suele dominar.',
};
// Cada sub-pestaña sin cards/kpis puede tener un tooltip "de sección".
const RADAR_HELP_SECTIONS = {
  alertas:      'Tipos de alertas: pico de tráfico (visitas +50% vs ayer), caídas (-30%), hitos de lista de espera (50/100/250 personas), records históricos, anomalías en códigos.',
  comparativas: 'Compara dos rangos de tiempo. Útil para ver tendencias: ¿este mes vendimos más que el pasado?',
};










// ═══════════════════════════════════════════════════════════════════════════
// [RAD-1d] LOS TRES TOPS, CON SU VENTANA EN LA CARA
//
// 🔒 «AÑO» NO SE PUEDE DECIR: el diario de clicks tiene 10 días y los eventos
// vistos 102. El tercer top se llama «desde que medimos» y sus DÍAS SE COMPUTAN
// del `min()` real — el diagnóstico escribió «101» leyendo la fecha en UTC, y
// en Reynosa la medición arranca el 18-may: son **102**. Un rótulo a mano ya
// nació equivocado una vez.
//
// 🔒 EL RPC MANDA EL DATO, LA PANTALLA LO ESCRIBE. Las fechas vienen
// estructuradas porque el `to_char` de Postgres devolvía «27 de August»: su
// locale es inglés. Los meses en español ya viven aquí (`_radFechaCorta`, de
// RAD-1b) y tenerlos también en el SQL sería la séptima lista a mano de esta
// pantalla.
// ═══════════════════════════════════════════════════════════════════════════
const _RAD_TOPS = [
  ['hoy',    'Más vistos HOY'],
  ['mes',    'Top del MES'],
  ['medido', 'Top DESDE QUE MEDIMOS'],
];












// ── COMPARATIVAS ───────────────────────────────────────────
const _RCM_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];






// ═══════════════════════════════════════════════════════════════
// INIT (hotfix 24-jul-2026: movido desde la línea ~7760 al FINAL del archivo
// para que el boot corra cuando TODO ya está declarado — nunca más un TDZ).
// ═══════════════════════════════════════════════════════════════
const _urlParams = new URLSearchParams(window.location.search);
const _inviteToken = _urlParams.get('token');
if (_inviteToken) {
  mostrarRegistroInvitado(_inviteToken);
} else if (checkSession()) {
  enterApp();
  // [KMS-5] AQUÍ VIVÍA LA ALERTA DE "NUEVO USUARIO", y estaba mal por dos lados.
  //
  // Decía el nombre de `currentUser` — o sea, de QUIEN ESTÁ MIRANDO, no de
  // ningún registrado. Y su condición nunca podía ser falsa: `auth-login` NO
  // devuelve `perfil_completo`, así que en el cliente siempre es `undefined` y
  // `!undefined` es true. Resultado: una alerta por CADA carga de página con
  // sesión viva. 51 en la tabla, todas sin leer, y las 14 de la madrugada del
  // 6-ago son recargas de Memo — la de "Lesly Gutierrez Medellin" de las 02:59
  // tampoco fue un registro: es su propio login (ultimo_acceso 02:59:01, alerta
  // 02:59:56, y su perfil_completo en la base dice true).
  //
  // La alerta de verdad ahora nace en registro-invitado.js, que es el único
  // lugar donde alguien se registra — ahí el nombre del nuevo es el único que
  // hay, y suena UNA vez porque el registro ocurre una vez.
}

// ═══════════════════════════════════════════════════════════════════════════
// [N1] NOTICIAS DEL BANNER · editor en Esferas del Dragón
//
// El banner azul del index deja de armarse solo desde el catálogo: lo escribe
// Memo aquí. "Publicar" llama a noticias-publicar, que reescribe SOLO el
// arreglo NOTICIAS de index.html (mismo candado maestro_roshi que las esferas)
// y Netlify deploya solo.
//
// Los topes se avisan aquí Y se validan en el servidor. La UI no es defensa:
// es cortesía.
// ═══════════════════════════════════════════════════════════════════════════
const N1_MAX = 10;
const N1_LARGO = 120;
let n1Noticias = [];











