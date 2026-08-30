// =============================================================================
// kamehouse-equipo.js — Guerreros Z: el equipo, sacado del tronco (MONO-6)
// =============================================================================
// La pantalla más grande de las que quedaban: la lista del equipo, invitar, mi
// perfil y el ranking.
//
// Llega corregida DOS veces. MONO-0 la clasificaba en 2% de aislamiento —la
// última de la fila, "el tejido del tronco"— por un span desbordado del
// instrumento; bien medida es 72%. Y al extraerla, el candado del extractor se
// negó a mover `abrirRanking` porque su span no parseaba solo: el tope de la
// función siguiente le arrastraba un comentario ajeno. El escáner ganó un tercer
// escalón —caer a la llave de cierre en columna 0— que se VALIDA parseando.
//
// Mismas reglas: SOLO funciones, en el MISMO ORDEN, con su comentario pegado, y
// cero código de nivel superior — el estado global se queda en el tronco.
//
// Va ANTES del tronco por la regla del sentido único (ver MONO-2), y el careo
// exige ningún error NUEVO respecto a su BASE.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

// ── SISTEMA DE TEMAS POR COORDI ──
function aplicarTemaCoordi() {
  if (!currentUser) return;
  const nombre = (currentUser.nombre || '').toLowerCase().trim();
  // Mapa: nombre del coordi → clase CSS del tema
  const temas = {
    'ximena payán': 'tema-ximena',
    'ximena payan': 'tema-ximena',
    'america aglae torruco ibarra': 'tema-america',
    'america torruco': 'tema-america',
    'reginna valencia valencia': 'tema-reginna',
    'reginna valencia': 'tema-reginna',
    'luis alfonso padilla': 'tema-luis',
    'laura montes': 'tema-laura',
    'brittany hernandez': 'tema-brittany',
    'axel francisco estrada gonzalez': 'tema-axel',
    'axel estrada': 'tema-axel',
  };
  // Limpiar temas previos
  document.body.className = document.body.className.replace(/\btema-\w+/g, '').trim();
  // Precedencia DC1: si el usuario eligió acento personal (tema_acento), ESE manda.
  // No aplicamos el tema-coordi viejo (sus colores con !important pisarían el
  // acento que va por variables CSS). El body queda sin clase tema-XXX.
  if (currentUser.tema_acento) return;
  // Aplicar tema si existe
  const clase = temas[nombre];
  if (clase) document.body.classList.add(clase);
}
// Oscurece un hex por un factor (0.12 = 12% más oscuro).
function _hexOscurecer(hex, factor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ajusta = v => Math.round(v * (1 - factor)).toString(16).padStart(2, '0');
  return '#' + ajusta((n >> 16) & 255) + ajusta((n >> 8) & 255) + ajusta(n & 255);
}
// Convierte un hex a rgba(...) con el alpha dado.
function _hexAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}
// Sobrescribe los tokens de acento en :root. Si no hay hex, deja el lima por defecto.
function applyTema(hex) {
  if (!hex) return;
  const root = document.documentElement.style;
  root.setProperty('--gold', hex);
  root.setProperty('--gold2', _hexOscurecer(hex, 0.12));
  root.setProperty('--orange', hex);
  root.setProperty('--orange2', hex);
  root.setProperty('--border2', _hexAlpha(hex, 0.28));
}
// Marca el preset elegido en el formulario de perfil (no guarda hasta "Guardar").
function seleccionarTema(hex, el) {
  const inp = document.getElementById('mp-tema_acento');
  if (inp) inp.value = hex;
  document.querySelectorAll('.tema-dot').forEach(d => d.classList.remove('sel'));
  if (el) el.classList.add('sel');
}
async function sendEmail(to, subject, html) {
  const resp = await khAdminFetch(EMAIL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html })
  });
  if (!resp.ok) {
    let msg = 'Error enviando email';
    try { const err = await resp.json(); msg = err.error || err.message || msg; } catch(e) {}
    throw new Error(msg);
  }
  return true;
}
function calcularEdad(fechaNac) {
  const hoy = new Date();
  const nac = new Date(fechaNac);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}
function esCumple(fechaNac) {
  const hoy = new Date();
  const nac = new Date(fechaNac);
  return hoy.getMonth() === nac.getMonth() && hoy.getDate() === nac.getDate();
}
function calcularPuntosAnio(tours, anio) {
  return tours.reduce((total, t) => {
    if (!t.fecha_aprox) return total;
    if (new Date(t.fecha_aprox).getFullYear() !== anio) return total;
    return total + (PUNTOS_TOUR[t.tipo_tour] || 0);
  }, 0);
}
// Clasifica una asignación por su slug. Festival si el slug base está en FESTIVALES.
function tipoTourDeAsignacion(eventoId, evMap) {
  const base = String(eventoId || '').split('#')[0];
  if (FESTIVALES[base]) {
    const dias = Math.min(FESTIVALES[base], 3);
    return 'festival_' + dias + 'd';
  }
  return 'concierto';
}
// Fecha "fin" de la asignación (para saber si YA PASÓ). null si el slug no está en EV.
function fechaFinAsignacion(eventoId, evMap) {
  const parts = String(eventoId || '').split('#');
  const base = parts[0];
  const idx = parts[1];
  const ev = evMap[base];
  if (!ev) return null;
  if (FESTIVALES[base]) {
    if (!ev.ds) return null;
    const fin = new Date(ev.ds + 'T12:00:00');
    fin.setDate(fin.getDate() + (Math.min(FESTIVALES[base], 3) - 1));
    return fin;
  }
  // Concierto: multifecha (#idx) usa dsList/multifecha[idx].ds; simple usa ev.ds.
  const fechaStr = (idx != null
    ? ((ev.dsList && ev.dsList[idx]) || (ev.multifecha && ev.multifecha[idx] && ev.multifecha[idx].ds))
    : null) || ev.ds;
  if (!fechaStr) return null;
  return new Date(fechaStr + 'T12:00:00');
}
// Suma puntos de las asignaciones aceptadas YA PASADAS que caen en 'anio'.
function puntosAutoDeUsuario(asignacionesAceptadas, evMap, anio) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  let pts = 0;
  const detalle = [];
  (asignacionesAceptadas || []).forEach(a => {
    const fin = fechaFinAsignacion(a.evento_id, evMap);
    if (!fin) return;                       // slug ausente del EV (legacy UUID / borrado) → no cuenta
    if (!(fin < hoy)) return;               // futura o de hoy → no cuenta
    if (fin.getFullYear() !== anio) return; // de otro año → no cuenta aquí
    const base = String(a.evento_id).split('#')[0];
    const ev = evMap[base];
    const tipo = tipoTourDeAsignacion(a.evento_id, evMap);
    const p = PUNTOS_TOUR[tipo] || 0;
    pts += p;
    detalle.push({ nombre: (ev && ev.a) || base, tipo_tour: tipo, pts: p, fecha: fin });
  });
  return { pts, detalle };
}
// Combina puntos manuales (tours_pasados, fuera del sistema) + auto (asignaciones).
// No deduplica: convención = manual son tours fuera del sistema.
function calcularPuntosCombinados(toursPasadosUsuario, asignacionesUsuario, evMap, anio) {
  const manuales = calcularPuntosAnio(toursPasadosUsuario || [], anio);
  const aceptadas = (asignacionesUsuario || []).filter(a => a.status === 'aceptado');
  const auto = puntosAutoDeUsuario(aceptadas, evMap, anio);
  return { total: manuales + auto.pts, manuales, auto: auto.pts, detalleAuto: auto.detalle };
}
async function loadEquipo() {
  const grid = document.getElementById('gz-grid');
  if (!grid) return;
  try {
    // [EQ-2] SIN `activos:true`: los pausados también bajan. Antes eran
    // literalmente invisibles —no había pantalla en todo el Palacio donde
    // aparecieran— y para volver a activar a alguien había que adivinar. Quién
    // se ve en la rejilla lo decide renderGZ (por defecto, los activos: la
    // conducta de siempre). Los cuatro `.find(id)` que leen _gzCache (abrir el
    // perfil, generar contrato) GANAN con esto: antes el perfil de un pausado
    // no abría.
    _gzCache = await khUsuarios.listar({ orden: 'nombre' }); // [sec-usuarios]
    renderGZ();
  } catch(e) {
    grid.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
  // Mostrar la tab correcta según rol al entrar a Guerreros Z
  // Todos los roles ahora pueden ver la lista del equipo (solo lectura)
  const gzPermitidas = GZ_TABS_PERMITIDAS[currentUser?.rol] || ['lista','miperfil'];
  const tabInicial = gzPermitidas.includes('lista') ? 'lista' : 'miperfil';
  const btnInicial = document.querySelector(`.gz-tab-btn[onclick*="${tabInicial}"]`);
  showGZTab(tabInicial, btnInicial);
}
async function _gzCargarContratos() {
  if (!currentUser || (currentUser.rol !== 'maestro_roshi' && currentUser.rol !== 'bulma')) return;
  try {
    const rows = await khContratos.listar({ limit: 500 }); // sin filtro: firmados + pendientes
    const mapa = {};
    (rows || []).forEach(c => {
      if (!c || !c.creador_email || !c.plantilla) return;
      const k = String(c.creador_email).trim().toLowerCase();
      (mapa[k] = mapa[k] || []).push(c);
    });
    _gzContratos = mapa;
  } catch (e) { /* fails-soft: cards como hoy */ }
}
// [EQ-1] El estado de contratos de UNA persona contra el mapa de su rol.
// Devuelve null si todavía no cargaron (fails-soft) — quien pinta decide.
//
// Un contrato FIRMADO tapa al pendiente de la misma plantilla: si mandaste dos
// veces el de auxiliar y firmó uno, no le falta nada. Y "de más" son los que
// tiene fuera de su mapa (una creadora que ascendió a coordinadora conserva su
// contrato viejo): se muestran, no se regañan.
function _gzEstadoContratos(u) {
  if (!u || !_gzContratos) return null;
  const esperados = ROL_CONTRATOS[u.rol] || [];
  const mios = _gzContratos[String(u.correo || '').trim().toLowerCase()] || [];
  const porPlantilla = {};
  mios.forEach(c => {
    const p = c.plantilla;
    const prev = porPlantilla[p];
    // gana el firmado; entre dos del mismo estado, el de vigencia más lejana
    if (!prev) { porPlantilla[p] = c; return; }
    if (prev.estado !== 'firmado' && c.estado === 'firmado') { porPlantilla[p] = c; return; }
    if (prev.estado === c.estado && String(c.vigencia_fin || '') > String(prev.vigencia_fin || '')) porPlantilla[p] = c;
  });
  const firmados = esperados.filter(p => porPlantilla[p] && porPlantilla[p].estado === 'firmado');
  const enviados = esperados.filter(p => porPlantilla[p] && porPlantilla[p].estado !== 'firmado');
  const faltan   = esperados.filter(p => !porPlantilla[p]);
  const extras   = Object.keys(porPlantilla).filter(p => !esperados.includes(p));
  return { esperados, porPlantilla, firmados, enviados, faltan, extras, nota: ROL_SIN_CONTRATO[u.rol] || '' };
}
// 'YYYY-MM-DD' → '15-oct-2026' para el chip.
function _gzFmtVig(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  if (!y || !m || !d) return iso || '?';
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d, 10)}-${meses[parseInt(m, 10) - 1] || '?'}-${y}`;
}
// Días de aquí a una fecha ISO, en calendario de Monterrey. Negativo = pasada.
function _gzDiasA(iso) {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  return Math.round((new Date(String(iso).slice(0, 10) + 'T00:00:00Z') - new Date(hoy + 'T00:00:00Z')) / 86400000);
}
// [EQ-1] Chip de contratos de la tarjeta. ANTES solo hablaba de coordinador/cc
// y solo de vigencias: las tarjetas de bulma, milk y mister_popo callaban aunque
// les faltara su contrato laboral. Ahora contesta la pregunta que se hace quien
// mira la pantalla —"¿a esta persona le falta algo?"— para TODOS los roles.
//
// Prioridad: lo que FALTA grita, lo enviado avisa, lo firmado informa. Y cuando
// todo está firmado el chip vuelve a ser el de vigencias de antes, con una
// diferencia: mira la que vence PRIMERO, no la más lejana. Con dos contratos
// (bulma) la lejana esconde a la que está por caducar, que es justo la que
// importa.
function _gzChipContrato(u) {
  const st = _gzEstadoContratos(u);
  if (!st) return ''; // fails-soft: sin datos, mudo (no "le falta todo")
  const ICO = '<svg class="ic" style="width:11px;height:11px"><use href="#ic-contratos"/></svg>';
  const base = 'display:inline-flex;align-items:center;gap:4px;margin-top:8px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;font-weight:800;padding:2px 8px;border-radius:4px;';
  const DISCRETO = `${base}color:var(--ts);background:rgba(255,255,255,.05);border:1px solid var(--border)`;
  const AMBAR    = `${base}color:#ffb020;background:rgba(255,176,32,.14);border:1px solid rgba(255,176,32,.4)`;
  const ROJO     = `${base}color:#ff6666;background:rgba(255,68,68,.14);border:1px solid rgba(255,68,68,.4)`;

  // Roles que NO firman: se dice POR QUÉ, para que nadie lo lea como hueco.
  if (st.nota) return `<span style="${DISCRETO}">${ICO} ${_esfEsc(st.nota)}</span>`;
  if (!st.esperados.length) return '';

  if (st.faltan.length) {
    const txt = st.faltan.length === 1 ? 'falta 1 contrato' : `faltan ${st.faltan.length} contratos`;
    return `<span style="${ROJO}">${ICO} ${txt}</span>`;
  }
  if (st.enviados.length) {
    const txt = st.enviados.length === 1 ? '1 sin firmar' : `${st.enviados.length} sin firmar`;
    return `<span style="${AMBAR}">${ICO} ${txt}</span>`;
  }
  // Todo firmado → la vigencia que vence PRIMERO (si alguna la tiene).
  const vig = st.firmados
    .map(p => st.porPlantilla[p] && st.porPlantilla[p].vigencia_fin)
    .filter(Boolean)
    .sort()[0];
  if (!vig) return `<span style="${DISCRETO}">${ICO} contratos ✓</span>`;
  const dias = _gzDiasA(vig), fecha = _esfEsc(_gzFmtVig(vig));
  if (dias < 0)   return `<span style="${ROJO}">${ICO} venció ${fecha}</span>`;
  if (dias <= 30) return `<span style="${AMBAR}">${ICO} vence ${fecha}</span>`;
  return `<span style="${DISCRETO}">${ICO} vence ${fecha}</span>`;
}
async function _gzCargarPrestado() {
  if (!currentUser || !['maestro_roshi', 'bulma', 'milk', 'mister_popo'].includes(currentUser.rol)) {
    _gzPrestado = {};
    return;
  }
  try {
    _gzPrestado = await khSalidas.prestadoEquipo() || {};
  } catch (e) { _gzPrestado = {}; /* fails-soft: GZ sin chips */ }
}
// Chip rojo compacto junto al nombre + detalle al hacer click (no navega: el
// click del chip NO debe abrir el perfil de la card).
function _gzChipPrestado(u) {
  if (!u || !_gzPrestado) return '';
  const info = _gzPrestado[u.id];
  if (!info || !(info.total > 0)) return '';
  const piezas = Array.isArray(info.piezas) ? info.piezas : [];
  const tip = piezas.map(p => `${p.cantidad}× ${p.pieza} (${p.evento_id})`).join(' · ');
  const n = piezas.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);
  return `<button type="button" class="gz-prestado" title="${_salEsc(tip)}"
    onclick="event.stopPropagation();gzVerPrestado('${_salEsc(u.id)}')">🧊 debe ${n} pieza${n === 1 ? '' : 's'}</button>`;
}
// Días que lleva fuera una pieza (autosuficiente: O4 no depende de O2).
function _gzpDias(desdeISO) {
  const t = Date.parse(desdeISO || '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}
// Detalle del chip: qué trae, de qué evento y desde cuándo. Modal PROPIO
// (#modal-prestado), sin hidden inputs y poblado DESPUÉS de openModal.
function gzVerPrestado(userId) {
  const info = _gzPrestado && _gzPrestado[userId];
  if (!info) return;
  const u = (_gzCache || []).find(x => x.id === userId);
  const piezas = Array.isArray(info.piezas) ? info.piezas : [];
  const total = piezas.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);
  const cuerpo = document.getElementById('prestado-cuerpo');
  const titulo = document.getElementById('prestado-titulo');
  if (!cuerpo) return;
  if (titulo) titulo.textContent = `${u ? u.nombre : 'Trae prestado'} · sin regresar`;
  openModal('modal-prestado');
  cuerpo.innerHTML = `
    <div class="gzp-head">🧊 <b>${_salEsc(u ? u.nombre : 'Esta persona')}</b> trae ${total} pieza${total === 1 ? '' : 's'} retornable${total === 1 ? '' : 's'} que aún no regresan.</div>
    <div class="gzp-lista">
      ${piezas.map(p => {
        const d = _gzpDias(p.desde);
        return `<div class="gzp-item">
          <div class="gzp-item-top">
            <div class="gzp-pieza"><b>${Number(p.cantidad) || 0}×</b> ${_salEsc(p.pieza)}</div>
            <span class="gzp-chip">${d != null ? `${d} d fuera` : 'fuera'}</span>
          </div>
          <div class="gzp-item-f">${_salEsc(p.evento_id)}${p.desde ? ` · salió el ${_salEsc(String(p.desde).slice(0, 10))}` : ''}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="gzp-pie">Solo informativo. El regreso se palomea en la Torre de Karin, al recibir los kits.</div>`;
}
async function renderGZ() {
  const grid = document.getElementById('gz-grid');
  if (!grid) return;
  if (_gzContratos === null) await _gzCargarContratos();
  if (_gzPrestado === null) await _gzCargarPrestado(); // [O4] fails-soft: {} = sin chips
  // [EQ-2] La vista de pausados es solo de admins. El botón escondido no es un
  // candado: si no es admin, aquí se fuerza la vista de activos aunque _gzVista
  // dijera otra cosa.
  const esAdminGZ = ['maestro_roshi', 'bulma'].includes(currentUser && currentUser.rol);
  const vista = esAdminGZ ? _gzVista : 'activos';
  const activos = _gzCache.filter(u => u.activo !== false);
  const pausados = _gzCache.filter(u => u.activo === false);
  _gzPintarContadores(activos.length, pausados.length);

  let lista = vista === 'pausados' ? pausados : activos;
  if (_gzFilter !== 'todos') lista = lista.filter(u => u.rol === _gzFilter);
  if (!lista.length) { grid.innerHTML = _gzVacio(vista, pausados.length, activos.length); return; }
  // Cargar puntos para todos: manuales (tours_pasados) + auto (tours asignados por
  // slug, DC2d). Fails-soft: si fallan asignaciones o EV, cae a solo manuales.
  let allTours = [];
  try { allTours = await khTours.listar({ desde: '2026-01-01' }); } catch(e){} // [sec-tours]
  let asignacionesDe = {};
  let evMap = {};
  try {
    const asignaciones = await khAsignaciones.listar({ status: 'aceptado' }); // [sec-coordi]
    const evArr = await _fetchEVFromIndex();
    evArr.forEach(e => { if (e && e.id) evMap[e.id] = e; });
    asignaciones.forEach(a => { (asignacionesDe[a.coordi_id] = asignacionesDe[a.coordi_id] || []).push(a); });
  } catch(e){ asignacionesDe = {}; evMap = {}; }
  const anioActual = new Date().getFullYear();
  grid.innerHTML = lista.map((u, _i) => {
    const iniciales = u.nombre.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    // 🔐 CAP2-1: a los roles no-administrativos el backend ya NO les manda
    // `strikes` ni `fecha_nacimiento` de OTRAS personas. En ese caso NO se
    // pintan los puntitos: mostrarlos vacíos afirmaría "cero strikes", que es
    // una mentira. El pastelito de cumpleaños simplemente no aparece (ausencia,
    // no dato falso). Para admins y para la fila PROPIA todo sigue igual.
    const strikes = u.strikes || 0;
    // 🎂 CAP2-1: si la fecha viaja (admins / fila propia) se calcula aquí como
    // siempre; si no, se usa el booleano `cumple_hoy` que manda el servidor ya
    // resuelto en hora de Monterrey. El pastelito sale igual para todos sin que
    // la fecha de nacimiento salga de la base.
    const cumple = u.fecha_nacimiento ? esCumple(u.fecha_nacimiento) : !!u.cumple_hoy;
    const esYo = currentUser && u.id === currentUser.id;
    const partes = u.nombre.split(' ');
    const nombreCorto = partes[0] + (partes[1] ? ' ' + partes[1][0] + '.' : '');
    const misToures = allTours.filter(t => t.usuario_id === u.id);
    const pts = calcularPuntosCombinados(misToures, asignacionesDe[u.id] || [], evMap, anioActual).total;
    // [KH-2] --gzi = el escalón de la cascada de entrada (idioma PF-1). TOPE en
    // 6: sin él, el guerrero 20 esperaría casi un segundo y se leería como bug.
    // Solo escribe una variable CSS; la animación vive en kamehouse.css.
    // [EQ-2] La tarjeta pausada se ve APAGADA, no rota: sigue siendo la misma
    // persona con su historial. El estilo vive en kamehouse.css (regla de la
    // casa), aquí solo va la clase.
    const _pausado = u.activo === false;
    return `<div class="gz-card${_pausado ? ' gz-card-pausado' : ''}" style="--gzi:${Math.min(_i, 6)}" onclick="abrirPerfil('${_attrJs(u.id)}')">
      ${esYo ? '<div class="gz-badge-yo">TÚ</div>' : ''}
      ${cumple ? '<div class="gz-badge-cumple"><svg class="ic"><use href="#ic-pastel"/></svg></div>' : ''}
      <div class="gz-card-inner">
        <div class="gz-avatar">
          ${u.foto_url ? `<img src="${_urlSegura(u.foto_url)}" alt="${_esfEsc(u.nombre)}">` : iniciales}
        </div>
        <div class="gz-name">${nombreCorto}</div>
        ${_gzChipPrestado(u)}
        <div class="gz-rol">${ROL_LABELS[u.rol] || u.rol}</div>
        <div class="gz-stats">
          <div class="gz-stat">
            <div class="gz-stat-value" style="color:var(--gold)">${pts}</div>
            <div class="gz-stat-label">pts ${new Date().getFullYear()}</div>
          </div>
          ${u.strikes === undefined ? '' : `
          <div class="gz-stat">
            <div class="gz-strike-dots">
              <div class="gz-strike-dot ${strikes >= 1 ? 'active' : ''}"></div>
              <div class="gz-strike-dot ${strikes >= 2 ? 'active' : ''}"></div>
              <div class="gz-strike-dot ${strikes >= 3 ? 'active' : ''}"></div>
            </div>
            <div class="gz-stat-label">strikes</div>
          </div>`}
        </div>
        ${_gzChipContrato(u)}${_gzBloquePausado(u)}
      </div>
    </div>`;
  }).join('');
}
function gzVista(vista, btn) {
  _gzVista = vista;
  ['activos', 'pausados'].forEach(v => {
    const b = document.getElementById('gz-vista-' + v);
    if (b) b.classList.toggle('active', v === vista);
  });
  if (btn) btn.classList.add('active');
  renderGZ();
}
// Los contadores de las pestañas. Sin ellos "pausados" es una pestaña muda y
// nadie la abre: el número ES el aviso de que ahí hay gente esperando.
function _gzPintarContadores(nActivos, nPausados) {
  const a = document.getElementById('gz-cnt-activos');
  const p = document.getElementById('gz-cnt-pausados');
  if (a) a.textContent = nActivos ? '(' + nActivos + ')' : '';
  if (p) p.textContent = nPausados ? '(' + nPausados + ')' : '';
}
// El vacío que EXPLICA. Un "// sin miembros en esta categoria" en una pantalla
// donde acabas de pausar a alguien se lee como "se perdieron".
function _gzVacio(vista, nPausados, nActivos) {
  const caja = (txt, extra) => `<div style="grid-column:1/-1;text-align:center;padding:48px 24px;color:var(--ts);font-size:12px;line-height:1.6;max-width:420px;margin:0 auto">${txt}${extra || ''}</div>`;
  const irA = (v, rotulo) => `<div style="margin-top:14px"><button class="btn btn-ghost btn-sm" style="font-family:'JetBrains Mono',monospace;font-size:10px" onclick="gzVista('${v}',document.getElementById('gz-vista-${v}'))">${rotulo}</button></div>`;

  if (vista === 'pausados') {
    if (_gzFilter !== 'todos') return caja('Nadie pausado con ese rol.', irA('activos', '▸ ver los activos'));
    return caja('<strong style="color:var(--text)">Nadie pausado.</strong><br>Cuando das de baja a alguien aparece aquí — con su historial intacto y un botón para reactivarlo.', irA('activos', '▸ ver los activos'));
  }
  // vista de activos y vacía: el caso que asustaba
  if (!nActivos && nPausados) {
    return caja(`<strong style="color:var(--text)">Todo tu equipo está pausado.</strong><br>No se perdió nadie: ${nPausados === 1 ? 'hay 1 persona' : 'hay ' + nPausados + ' personas'} en la pestaña Pausados, con su historial completo.`, irA('pausados', '▸ ver los pausados'));
  }
  if (_gzFilter !== 'todos') {
    return caja(`Nadie activo con ese rol.${nPausados ? ' Puede que esté pausado.' : ''}`, nPausados ? irA('pausados', '▸ buscar en pausados') : '');
  }
  return caja('Todavía no hay nadie en el equipo. Invita a alguien desde la pestaña <strong style="color:var(--text)">Invitar</strong>.');
}
// El bloque de la tarjeta pausada: el sello y la vuelta, con el aviso de los 5
// minutos ESCRITO AHÍ. Es la pregunta que se hace justo después de reactivar
// ("ya está, ¿por qué no puede vender?"), y su respuesta no puede vivir solo en
// el manual.
function _gzBloquePausado(u) {
  if (!u || u.activo !== false) return '';
  // [VEN-BORRA-1b] Antes bifurcaba: el vendedor tenía su propio texto. Sin ese
  // rol la rama era inalcanzable, y una rama muerta se lee como si algo pudiera
  // pasar por ahí.
  const aviso = 'Su acceso vuelve enseguida; si algo se ve viejo, tarda hasta 5 minutos.';
  return `<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;align-items:center">
    <span class="gz-chip-inactivo">pausado</span>
    <span class="gz-chip-nota">${_salEsc(aviso)}</span>
    <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 10px"
      onclick="event.stopPropagation();gzReactivar('${_attrJs(u.id)}','${_attrJs(u.nombre)}')">Reactivar</button>
  </div>`;
}
// La vuelta. El backend ya sabe hacerlo bien: la transición false→true limpia
// el sello del candado de vendedores y reinicia su reloj (admin-usuarios).
// Aquí solo se pide, se avisa y se repinta.
async function gzReactivar(userId, nombre) {
  if (!confirm(`¿Reactivar a ${nombre}?\n\nRecupera su acceso y su historial sigue intacto.`)) return;
  try {
    await khUsuarios.actualizar(userId, { activo: true }); // [sec-usuarios]
    showToast(`${String(nombre).split(' ')[0]} está de vuelta — puede tardar hasta 5 min en poder vender`, 'success');
    _gzVista = 'activos';
    ['activos', 'pausados'].forEach(v => {
      const b = document.getElementById('gz-vista-' + v);
      if (b) b.classList.toggle('active', v === 'activos');
    });
    await loadEquipo();
  } catch (e) { showToast(e.message, 'error'); }
}
function filtrarGZ(filtro, btn) {
  _gzFilter = filtro;
  document.querySelectorAll('.gz-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGZ();
}
// [EQ-7b] `modoEdicion` viaja hasta aquí a propósito. Sin él había una CARRERA
// que cazó el arnés: irAEditarMiPerfil llamaba a showGZTab —que dispara
// renderMiPerfil() en modo LECTURA, asíncrono— y enseguida a renderMiPerfil(true).
// El formulario se pintaba primero y la lectura, más lenta, LO BORRABA al
// terminar. El botón "funcionaba" y el formulario aparecía y se iba. Una sola
// llamada, con el modo correcto desde el principio.
function showGZTab(tab, btn, modoEdicion) {
  ['lista','invitar','miperfil'].forEach(t => {
    const el = document.getElementById('gz-tab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.gz-tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (tab === 'miperfil') renderMiPerfil(!!modoEdicion);
  if (tab === 'lista') renderGZ();
}
// ─── INVITACIONES ───
async function enviarInvitacion() {
  const correo = document.getElementById('inv-correo').value.trim().toLowerCase();
  const rol = document.getElementById('inv-rol').value;
  const alertEl = document.getElementById('gz-invite-alert');
  if (!correo) {
    alertEl.innerHTML = '<div class="alert alert-error">Ingresa el correo</div>';
    setTimeout(() => alertEl.innerHTML = '', 3000);
    return;
  }
  // [DEFAULTS-1] El rol se elige. Antes se heredaba **Bulma** —el de
  // casi-máximos permisos— por ser el primero del markup, así que invitar sin
  // mirar este campo repartía privilegios que nadie eligió. El servidor ya lo
  // valida (`ROLES_VALIDOS`, y bulma/milk reservados a maestro_roshi); lo que
  // esta guarda impide es que la elección la haga el ORDEN DE LAS OPCIONES.
  if (!rol) {
    alertEl.innerHTML = '<div class="alert alert-error">Elige el rol: define a qué puede entrar esta persona.</div>';
    const _r = document.getElementById('inv-rol'); if (_r) { try { _r.focus(); } catch (_) { /* igual se ve el error */ } }
    setTimeout(() => alertEl.innerHTML = '', 4000);
    return;
  }

  let link = ''; // [sec-usuarios] el server genera el invite_token y lo devuelve
  try {
    alertEl.innerHTML = '<div class="alert" style="background:rgba(255,183,3,.1);color:var(--gold)">Enviando invitación…</div>';
    const nuevo = await khUsuarios.crear(correo, rol); // [sec-usuarios]
    link = `${APP_URL}?token=${nuevo.invite_token}`;
    await sendEmail(correo, 'Bienvenido al equipo de Conecta Reynosa', buildInviteEmail(correo.split('@')[0], rol, link));
    alertEl.innerHTML = '<div class="alert" style="background:rgba(45,198,83,.1);color:var(--green)">✓ Invitación enviada a ' + correo + '</div>';
    document.getElementById('inv-correo').value = '';
    setTimeout(() => alertEl.innerHTML = '', 5000);
    loadEquipo();
  } catch(emailErr) {
    // Si el email falla, el usuario YA se creó en Supabase — mostrar el link para copiar
    alertEl.innerHTML = `<div class="alert" style="background:rgba(255,183,3,.08);color:var(--gold);font-size:13px;line-height:1.6">
      <div style="margin-bottom:8px"><svg class="ic"><use href="#ic-alerta"/></svg> El usuario se creó pero el email no se pudo enviar.</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;margin-bottom:8px">Manda este link por WhatsApp:</div>
      <input readonly value="${link}" style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 10px;font-family:'JetBrains Mono',monospace;font-size:11px;cursor:text" onclick="this.select();document.execCommand('copy')">
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--ts);margin-top:6px">// click en el link para copiarlo · expira en 48h</div>
    </div>`;
    document.getElementById('inv-correo').value = '';
    loadEquipo();
  }
}
function buildInviteEmail(nombre, rol, link) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
    + '<body style="margin:0;padding:0;background:#06060A;font-family:Arial,sans-serif">'
    + '<div style="max-width:520px;margin:40px auto;background:#0D0D14;border:1px solid rgba(232,93,4,.25);border-radius:12px;overflow:hidden">'
    + '<div style="background:linear-gradient(135deg,#E85D04,#FFB703);padding:28px 32px">'
    + '<div style="font-size:24px;font-weight:900;letter-spacing:.1em;color:#fff">KAME·HOUSE</div>'
    + '<div style="font-size:12px;color:rgba(255,255,255,.8);margin-top:4px">Conecta Reynosa</div>'
    + '</div><div style="padding:32px">'
    + '<div style="font-size:20px;font-weight:700;color:#EEEEF5;margin-bottom:8px">Hola ' + nombre + ' 👋</div>'
    + '<div style="color:rgba(238,238,245,.6);font-size:14px;line-height:1.7;margin-bottom:24px">'
    + 'Memo Cobos te ha invitado a unirte al equipo de <strong style="color:#EEEEF5">Conecta Reynosa</strong> como <strong style="color:#FFB703">' + (ROL_LABELS[rol] || rol) + '</strong>.<br><br>'
    + 'Haz click en el botón para crear tu perfil. El link expira en <strong>48 horas</strong>.</div>'
    + '<a href="' + link + '" style="display:inline-block;background:linear-gradient(135deg,#E85D04,#FB8500);color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:.08em">Crear mi perfil →</a>'
    + '<div style="margin-top:28px;padding-top:20px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(238,238,245,.3)">Si no esperabas este correo, ignóralo.<br>Link: ' + link + '</div>'
    + '</div></div></body></html>';
}
// ─── STRIKES ───
async function gestionarStrikes(userId, nombre, strikesActuales) {
  const accion = prompt(`Strikes actuales: ${strikesActuales}/3.\n\nEscribe "+" para agregar strike, "-" para quitar, vacío para cancelar:`);
  if (!accion) return;
  const nuevo = accion === '+' ? Math.min(strikesActuales + 1, 3) : Math.max(strikesActuales - 1, 0);
  if (nuevo === strikesActuales) return;
  const motivo = prompt(`Motivo:`);
  if (motivo === null) return;
  try {
    await khUsuarios.actualizar(userId, { strikes: nuevo }); // [sec-usuarios]
    try {
      await khCoordi.strikeCrear(userId, accion === '+' ? 'asignado' : 'quitado', motivo || null); // [sec-sensibles] por_quien lo pone el backend
    } catch(e) {}
    if (nuevo >= 3) {
      const usuario = _gzCache.find(u => u.id === userId);
      if (usuario?.correo_notif || usuario?.correo) {
        await sendEmail(
          usuario.correo_notif || usuario.correo,
          '⚠️ Has acumulado 3 strikes',
          `<div style="font-family:Arial;padding:32px;background:#06060A;color:#EEEEF5"><h2 style="color:#E63946">Aviso importante</h2><p>Has acumulado 3 strikes en el sistema.</p><p>Motivo: <strong>${_esfEsc(motivo)}</strong></p></div>`
        ).catch(() => {});
      }
    }
    await loadEquipo();
    if (document.getElementById('modal-ver-perfil')) {
      cerrarModal('ver-perfil');
      abrirPerfil(userId);
    }
  } catch(e) { alert('Error: ' + e.message); }
}
async function confirmarEliminar(userId, nombre) {
  if (!confirm(`¿Dar de baja a ${nombre}? Esto desactiva su acceso pero conserva su historial.`)) return;
  try {
    await khUsuarios.actualizar(userId, { activo: false }); // [sec-usuarios]
    await loadEquipo();
  } catch(e) { alert('Error: ' + e.message); }
}
async function resetearPassword(userId, nombre) {
  const nueva = prompt(`Nueva contraseña para ${nombre}:\n\nMínimo 8 caracteres`);
  if (!nueva || nueva.length < 8) { alert('Mínimo 8 caracteres'); return; }
  try {
    // La password viaja por HTTPS a la Netlify Function, que la hashea con bcrypt
    // (service_role). NUNCA se guarda en texto plano ni se toca Supabase directo.
    const r = await khAdminFetch('/.netlify/functions/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId, nuevaPassword: nueva }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({ error: 'Error ' + r.status }));
      throw new Error(j.error || 'Error desconocido');
    }
    alert(`Contraseña actualizada.`);
  } catch(e) { alert('Error: ' + e.message); }
}
async function cambiarRol(userId, rolActual) {
  const roles = ['coordinador','mister_popo','bulma','cc'];
  const nuevoRol = prompt(`Rol actual: ${rolActual}\n\nEscribe el nuevo rol:\n${roles.join(', ')}`);
  if (!nuevoRol || !roles.includes(nuevoRol)) return;
  try {
    await khUsuarios.actualizar(userId, { rol: nuevoRol }); // [sec-usuarios]
    cerrarModal('ver-perfil');
    await loadEquipo();
  } catch(e) { alert('Error: ' + e.message); }
}
// ─── VER PERFIL (modal) ───
async function abrirPerfil(userId) {
  const usuario = _gzCache.find(u => u.id === userId);
  if (!usuario) return;

  const esYo = currentUser && usuario.id === currentUser.id;
  const puedeEditar = esYo || currentUser?.rol === 'maestro_roshi';
  const iniciales = usuario.nombre.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const edad = usuario.fecha_nacimiento ? calcularEdad(usuario.fecha_nacimiento) : null;
  // 🎂 CAP2-1: mismo criterio que la tarjeta (fecha propia/admin o cumple_hoy).
  const cumple = usuario.fecha_nacimiento ? esCumple(usuario.fecha_nacimiento) : !!usuario.cumple_hoy;

  let toursPasados = [];
  let evAsignados = [];
  try {
    toursPasados = await khTours.listar({ usuario_id: userId }); // [sec-tours]
  } catch(e) {}
  try {
    // Trae el id de la asignación (necesario para FK de deliverables). El
    // evento_id es slug (Fase A); los datos del evento los adjuntamos desde el
    // EV más abajo (ya no usamos el embed eventos(...), sin FK).
    evAsignados = await khAsignaciones.listar({ coordi_id: userId }); // [sec-coordi]
  } catch(e) {}

  // Si la usuaria es Creador de Contenido, cargar y/o auto-popular deliverables
  // de cada evento asignado. Sin esto, los .deliverables quedan vacíos y el
  // panel renderiza el botón de "iniciar tracking".
  if (usuario.rol === 'cc' && evAsignados.length) {
    await _ensureDeliverables(evAsignados);
  }

  // Puntos combinados: manuales (tours_pasados) + auto (asignaciones por slug, DC2d).
  const _anioPerfil = new Date().getFullYear();
  const _evArrPerfil = await _fetchEVFromIndex();
  const _evMapPerfil = {};
  _evArrPerfil.forEach(e => { if (e && e.id) _evMapPerfil[e.id] = e; });
  _attachEventoDesdeEV(evAsignados, _evMapPerfil);
  const _combPerfil = calcularPuntosCombinados(toursPasados, evAsignados, _evMapPerfil, _anioPerfil);
  const ptsTotal = _combPerfil.total;
  const ptsAnio = _combPerfil.total;
  const _detalleAutoPerfil = _combPerfil.detalleAuto;

  const adminSection = currentUser?.rol === 'maestro_roshi' && !esYo ? `
    <div class="perfil-section-v2" style="border-left-color:var(--red)">
      <div class="perfil-section-title-v2" style="color:var(--red)">// admin · maestro roshi</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="resetearPassword('${userId}','${_attrJs(usuario.nombre)}')" style="font-family:'JetBrains Mono',monospace;font-size:10px">▸ resetear pass</button>
        <button class="btn btn-ghost btn-sm" onclick="cambiarRol('${userId}','${usuario.rol}')" style="font-family:'JetBrains Mono',monospace;font-size:10px">▸ cambiar rol</button>
        <button class="btn btn-ghost btn-sm" onclick="gestionarStrikes('${userId}','${_attrJs(usuario.nombre)}',${usuario.strikes||0})" style="font-family:'JetBrains Mono',monospace;font-size:10px">▸ strikes</button>
        ${usuario.activo === false
          ? `<button class="btn btn-ghost btn-sm" style="color:var(--green);border-color:rgba(87,227,137,.3);font-family:'JetBrains Mono',monospace;font-size:10px" onclick="cerrarModal('ver-perfil');gzReactivar('${_attrJs(userId)}','${_attrJs(usuario.nombre)}')">▸ reactivar</button>`
          : `<button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:rgba(230,57,70,.3);font-family:'JetBrains Mono',monospace;font-size:10px" onclick="cerrarModal('ver-perfil');confirmarEliminar('${_attrJs(userId)}','${_attrJs(usuario.nombre)}')">▸ dar de baja</button>`}
      </div>
    </div>
  ` : '';

  // 🔐 CAP2-3: "cerrar todas sus sesiones". Visible para roshi y bulma (la
  // jerarquía real la impone el backend: contra otro admin, solo roshi). No
  // aparece sobre uno mismo — cerrarte tus propias sesiones te sacaría del
  // sistema en el acto y no es lo que nadie busca desde esta pantalla.
  const puedeCerrarSesiones = ['maestro_roshi', 'bulma'].includes(currentUser?.rol) && !esYo;
  const sesionSection = puedeCerrarSesiones ? `
    <div class="perfil-section-v2" style="border-left-color:var(--gold)">
      <div class="perfil-section-title-v2" style="color:var(--gold)">// sesión</div>
      <div style="font-size:11px;color:var(--ts);margin-bottom:10px;line-height:1.5">
        Si perdió el celular, se fue del equipo o su contraseña anda por ahí: esto invalida
        todas sus sesiones abiertas. Tendrá que volver a entrar (surte efecto en menos de un minuto).
      </div>
      <button class="btn btn-ghost btn-sm" style="font-family:'JetBrains Mono',monospace;font-size:10px"
        onclick="cerrarSesionesUI('${userId}','${_attrJs(usuario.nombre)}')">▸ cerrar todas sus sesiones</button>
    </div>
  ` : '';

  const perfilHtml = renderPerfilCompleto(usuario, toursPasados, evAsignados, iniciales, edad, cumple, ptsTotal, ptsAnio, esYo, _detalleAutoPerfil) + _gzSeccionContratos(usuario) + sesionSection + adminSection;

  crearModal('ver-perfil', '', perfilHtml);
}
// ═══════════════════════════════════════════════════════════════════════════
// [EQ-1] El bloque de contratos del perfil: qué tiene firmado, qué le falta
// según su rol, y el botón que abre el formulario YA PRELLENADO.
//
// Vive en el perfil y no en la tarjeta chica a propósito: en la rejilla caben
// veinte personas y ahí solo cabe el veredicto (el chip). El detalle —y el
// botón, que no puede compartir superficie con el onclick de la tarjeta— vive
// donde uno ya fue a ver a ESA persona.
// ═══════════════════════════════════════════════════════════════════════════
function _gzSeccionContratos(u) {
  const st = _gzEstadoContratos(u);
  if (!st) return ''; // no cargaron / no es admin: nada, como siempre
  const L = p => _esfEsc(PLANTILLA_LABELS[p] || p);
  const fila = (txt, color, extra) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span style="color:${color};font-weight:800;width:14px;text-align:center;flex:none">${extra}</span>
      <span style="flex:1;min-width:0">${txt}</span>
    </div>`;

  // Roles sin contrato: se dice por qué, y NO se ofrece generar nada.
  if (st.nota) {
    return `
    <div class="perfil-section-v2" style="border-left-color:var(--ts)">
      <div class="perfil-section-title-v2" style="color:var(--ts)">// contratos</div>
      <div style="font-size:12px;color:var(--ts);line-height:1.5">${_esfEsc(st.nota[0].toUpperCase() + st.nota.slice(1))}.
        No es un pendiente: este rol no firma contrato.</div>
    </div>`;
  }
  if (!st.esperados.length) return '';

  const filas = st.esperados.map(p => {
    const c = st.porPlantilla[p];
    if (!c) return fila(`${L(p)} <span style="color:var(--red)">— falta</span>`, 'var(--red)', '✗');
    if (c.estado !== 'firmado') {
      return fila(`${L(p)} <span style="color:#ffb020">— enviado, sin firmar</span>`, '#ffb020', '⏳');
    }
    const vig = c.vigencia_fin ? ` <span style="color:var(--ts)">— vence ${_esfEsc(_gzFmtVig(c.vigencia_fin))}</span>` : '';
    const cuid = c.cuidador_bodega ? ' <span style="color:var(--gold);font-size:10px;font-weight:800">+ CUSTODIA</span>' : '';
    return fila(`${L(p)}${vig}${cuid}`, 'var(--green)', '✓');
  }).join('');

  const extras = st.extras.length ? `
    <div style="font-size:11px;color:var(--ts);margin-top:8px;line-height:1.5">
      Además tiene de antes: ${st.extras.map(p => _esfEsc(PLANTILLA_LABELS[p] || p)).join(', ')}.
      No estorban — quedaron de un rol anterior.</div>` : '';

  // El botón lleva la PRIMERA que falte; si no falta ninguna, deja generar de
  // todos modos (renovación) sin plantilla forzada.
  const objetivo = st.faltan[0] || '';
  const rotulo = st.faltan.length
    ? (st.faltan.length === 1 ? `▸ generar el de ${PLANTILLA_LABELS[objetivo] || objetivo}` : '▸ generar contratos')
    : '▸ generar otro contrato';
  // [EQ-4] Con DOS o más faltantes, el camino corto es el paquete: se llenan
  // los datos una vez y salen los dos. El botón de uno-por-uno se queda al
  // lado, más discreto, para el caso de "solo quiero este".
  const paquete = st.faltan.length >= 2 ? `
      <button class="btn btn-primary btn-sm" style="margin-top:12px;margin-right:8px;font-family:'JetBrains Mono',monospace;font-size:10px"
        onclick="_gzPaquete('${_attrJs(u.id)}')">▸ generar los ${st.faltan.length} de un jalón</button>` : '';
  const pendiente = st.enviados.length ? `
    <div style="font-size:11px;color:#ffb020;margin-top:10px;line-height:1.5">
      Ya se le mandó ${st.enviados.length === 1 ? 'uno' : st.enviados.length} y no lo ha firmado.
      Generar otro no cancela el anterior.</div>` : '';

  return `
    <div class="perfil-section-v2" style="border-left-color:var(--orange)">
      <div class="perfil-section-title-v2" style="color:var(--orange)">// contratos</div>
      ${filas}
      ${extras}${pendiente}
      ${paquete}<button class="btn btn-ghost btn-sm" style="margin-top:12px;font-family:'JetBrains Mono',monospace;font-size:10px"
        onclick="_gzGenerarContrato('${_attrJs(u.id)}','${_attrJs(objetivo)}')">${_esfEsc(rotulo)}</button>
    </div>`;
}
// ═══════════════════════════════════════════════════════════════════════════
// [EQ-4] EL PAQUETE POR ROL.
//
// bulma y milk firman DOS contratos (auxiliar_admin + coordinador). Con EQ-1 el
// botón prellenaba UNO; el segundo era volver a la tarjeta, volver a abrir el
// formulario, volver a elegir. "Dos contratos" no debería significar "llena el
// formulario dos veces".
//
// LO QUE ESTA PANTALLA NO HACE: adivinar. El sueldo semanal y la vigencia se
// preguntan aquí porque son datos que solo Memo tiene — el paquete ahorra el
// tecleo repetido (nombre, correo, plantilla, fechas), no la decisión.
//
// Y MANDA DOS CORREOS DE VERDAD. Por eso se envían UNO POR UNO y en orden: si
// el segundo truena, el primero YA SE FUE y el reporte lo dice con esas
// palabras. Un "error al generar el paquete" a secas dejaría a Memo creyendo
// que no se mandó nada, y volvería a darle al botón.
// ═══════════════════════════════════════════════════════════════════════════
function _gzPaquete(userId) {
  const u = (_gzCache || []).find(x => x.id === userId);
  if (!u) return;
  const st = _gzEstadoContratos(u);
  if (!st || !st.faltan.length) return;
  const L = p => _esfEsc(PLANTILLA_LABELS[p] || p);
  const campo = (lbl, html, nota) => `
    <div style="margin-bottom:14px">
      <div class="perfil-field-label" style="margin-bottom:6px">${lbl}</div>
      ${html}
      ${nota ? `<div style="font-size:11px;color:var(--ts);margin-top:6px;line-height:1.5">${nota}</div>` : ''}
    </div>`;

  const filas = st.faltan.map((p, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px">
      <span style="color:var(--orange);font-weight:800;width:16px;flex:none">${i + 1}</span>
      <span>${L(p)}</span>
    </div>`).join('');

  const pideSueldo = st.faltan.includes('auxiliar_admin');
  const pideVigencia = st.faltan.includes('coordinador');

  crearModal('gz-paquete', `Paquete de ${ROL_LABELS[u.rol] || u.rol}`, `
    <div style="font-size:12px;color:var(--ts);line-height:1.6;margin-bottom:14px">
      Se le generan y <strong style="color:var(--text)">se le mandan por correo</strong> a
      ${_esfEsc(u.nombre)} los ${st.faltan.length} contratos que le faltan, en un solo paso:
    </div>
    ${filas}
    <div style="height:1px;background:var(--border);margin:14px 0"></div>
    ${pideSueldo ? campo('Sueldo neto semanal (MXN) *',
      // [ET3-c] Aquí había un `oninput="_gzPaqueteSueldo()"` llamando a una
      // función que NO EXISTE en ningún archivo: cada tecla en este campo
      // lanzaba un ReferenceError. Debajo vivía un <div id="pq-sueldo-mes">
      // que nunca se llenó, y la ayuda prometía "abajo lo ves traducido".
      // Se retiran las TRES piezas juntas: quitar sólo el oninput dejaba la
      // promesa escrita en pantalla, que es la mitad que de verdad molesta.
      // NO se implementa la traducción a mensual — decisión de Memo.
      `<input class="cot-input" type="number" id="pq-sueldo" min="1" step="1" placeholder="Ej: 2500">`,
      'Semanal, no mensual.') : ''}
    ${pideVigencia ? campo('Vigencia del contrato de coordinador',
      `<select class="cot-input" id="pq-vigencia">
         <option value="3">3 meses</option><option value="6">6 meses</option>
         <option value="9">9 meses</option><option value="12" selected>12 meses</option>
       </select>`) : ''}
    ${pideVigencia ? campo('',
      `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px">
         <input type="checkbox" id="pq-cuidador" style="width:auto;margin:0">
         <span>También cuidador de bodega (Torre de Karin)</span>
       </label>`,
      'Suma el Anexo de Custodia al de coordinador. Un solo contrato, una sola firma.') : ''}
    <div id="pq-alert"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-ghost" onclick="cerrarModal('gz-paquete')">Cancelar</button>
      <button class="btn btn-primary" id="pq-btn" onclick="_gzPaqueteEnviar('${_attrJs(userId)}')">Generar y enviar los ${st.faltan.length}</button>
    </div>
  `);
}
async function _gzPaqueteEnviar(userId) {
  const u = (_gzCache || []).find(x => x.id === userId);
  if (!u) return;
  const st = _gzEstadoContratos(u);
  if (!st || !st.faltan.length) return;
  const alert = document.getElementById('pq-alert');
  const btn = document.getElementById('pq-btn');
  const err = m => { if (alert) alert.innerHTML = `<div style="margin-top:12px;padding:10px 14px;background:rgba(255,68,68,.12);border:1px solid rgba(255,68,68,.4);color:#ffb3b3;border-radius:var(--r-sm,8px);font-size:12px;line-height:1.5">${m}</div>`; };

  const sueldo = Math.round(Number((document.getElementById('pq-sueldo') || {}).value || '0')) || 0;
  if (st.faltan.includes('auxiliar_admin') && !(sueldo > 0)) { err('Falta el sueldo neto semanal.'); return; }
  // La misma guardia de EQ-3: pasada la línea, se pregunta una vez.
  if (sueldo > 0 && _sueldoMensual(sueldo) >= SUELDO_MENSUAL_OJO) {
    const s = '$' + sueldo.toLocaleString('es-MX'), m = '$' + _sueldoMensual(sueldo).toLocaleString('es-MX');
    if (!confirm(`El sueldo dice ${s} A LA SEMANA — son ${m} al mes.\n\n¿Es correcto? El campo pide semanal, no mensual.`)) return;
  }
  const vigencia = Math.round(Number((document.getElementById('pq-vigencia') || {}).value)) || 12;
  const custodia = !!(document.getElementById('pq-cuidador') || {}).checked;
  const hoy = _mxFechaStr(); // [EQ-3] hoy en Monterrey, no en UTC

  if (alert) alert.innerHTML = '';
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  const hechos = [], fallo = { plantilla: null, msg: '' };
  for (const p of st.faltan) {
    const body = {
      plantilla: p,
      creador_nombre: u.nombre || '',
      creador_email: String(u.correo || '').trim().toLowerCase(),
      // [EQ-6] Ninguna de las dos plantillas del paquete cuelga de un evento:
      // el laboral nunca colgó y el de coordinador ahora es ANUAL. Mismo
      // relleno neutro que _ctrFormData, de la misma lista SIN_EVENTO.
      evento_nombre: p === 'auxiliar_admin' ? 'Auxiliar administrativo' : 'Coordinación anual',
      evento_fecha: hoy,
      contrato_fecha: hoy,
      ofrecimiento: [],
      expectativas: [],
      datos: p === 'auxiliar_admin'
        ? { sueldo_semanal: sueldo }
        : Object.assign({ exclusividad_dura: true }, custodia ? { cuidador_bodega: true } : {}),
      cuidador_bodega: p === 'coordinador' ? custodia : undefined,
      vigencia_meses: p === 'coordinador' ? vigencia : undefined,
    };
    try {
      const r = await khAdminFetch('/.netlify/functions/contrato-crear', { method: 'POST', body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || ('contrato-crear ' + r.status));
      hechos.push(p);
    } catch (e) {
      fallo.plantilla = p; fallo.msg = e.message;
      break; // no se sigue: si el primero falló, el segundo probablemente igual
    }
  }

  if (btn) { btn.disabled = false; btn.textContent = `Generar y enviar los ${st.faltan.length}`; }
  const nom = p => PLANTILLA_LABELS[p] || p;

  if (!fallo.plantilla) {
    cerrarModal('gz-paquete');
    showToast(`${hechos.length} contratos enviados a ${String(u.nombre).split(' ')[0]} ✓`, 'success');
    _gzContratos = null;      // que la tarjeta vuelva a preguntar
    await loadEquipo();
    return;
  }
  // FALLÓ ALGO. Se dice EXACTAMENTE qué se fue y qué no: los que ya salieron
  // están mandados de verdad, y volver a darle al botón los duplicaría.
  if (hechos.length) {
    err(`Se envió <strong>${_esfEsc(nom(hechos[0]))}</strong> — ese ya está mandado.<br>
         Falló <strong>${_esfEsc(nom(fallo.plantilla))}</strong>: ${_esfEsc(fallo.msg)}<br><br>
         Cierra esta ventana y genera solo el que falta desde la tarjeta: si vuelves a darle aquí, el primero se manda dos veces.`);
    _gzContratos = null;
    loadEquipo();
  } else {
    err(`No se envió ninguno. Falló <strong>${_esfEsc(nom(fallo.plantilla))}</strong>: ${_esfEsc(fallo.msg)}`);
  }
}
// [EQ-1] Abre el formulario de contratos con nombre, correo y plantilla YA
// puestos desde la cuenta. Cero re-tecleo: el correo mal escrito a mano es
// justo lo que manda un contrato a un buzón que no existe.
function _gzGenerarContrato(userId, plantilla) {
  const u = (_gzCache || []).find(x => x.id === userId);
  if (!u) return;
  cerrarModal('ver-perfil');
  showHerramienta('contratos');
  _contratosEditingToken = null;      // por si venía de una edición
  switchContratoView('nuevo');        // llama _resetFormUI: prellenar DESPUÉS
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('ctr-nombre', u.nombre || '');
  set('ctr-email', String(u.correo || '').trim().toLowerCase());
  if (plantilla) {
    set('ctr-plantilla', plantilla);
    onCtrPlantillaChange();           // abre/cierra los campos de esa plantilla
  }
  const el = document.getElementById('ctr-nombre');
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  showToast(`Formulario listo para ${u.nombre.split(' ')[0]} — revisa y envía`, 'success');
}
// 🔐 CAP2-3: cierra todas las sesiones de una persona (invalida sus tokens).
async function cerrarSesionesUI(userId, nombre) {
  if (!confirm(`¿Cerrar todas las sesiones de ${nombre}?\n\nTendrá que volver a entrar.`)) return;
  try {
    await khUsuarios.cerrarSesiones(userId); // [sec-usuarios]
    showToast('Sesiones cerradas ✓ — tendrá que volver a entrar', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}
function abrirAgregarTour(userId) {
  crearModal('add-tour', 'Agregar Tour', `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div><div class="perfil-field-label" style="margin-bottom:6px">Artista / Evento *</div><input class="cot-input" id="tp-artista" placeholder="Bad Bunny, Feid, Arre Tour..."></div>
      <div><div class="perfil-field-label" style="margin-bottom:6px">Ciudad</div><input class="cot-input" id="tp-ciudad" placeholder="Monterrey, CDMX..."></div>
      <div><div class="perfil-field-label" style="margin-bottom:6px">Fecha aproximada</div><input class="cot-input" type="date" id="tp-fecha"></div>
      <div><div class="perfil-field-label" style="margin-bottom:6px">Tipo de tour</div>
        <select class="cot-input" id="tp-tipo">
          <option value="concierto">Concierto (3 pts)</option>
          <option value="festival_1d">Festival 1 día (5 pts)</option>
          <option value="festival_2d">Festival 2 días (7 pts)</option>
          <option value="festival_3d">Festival 3 días (10 pts)</option>
        </select></div>
      <div><div class="perfil-field-label" style="margin-bottom:6px">Tu rol</div>
        <select class="cot-input" id="tp-rol">
          <option>Coordinador</option><option>Auxiliar</option><option>Vendedor</option><option>Creador de Contenido</option><option>Otro</option>
        </select></div>
      <div><div class="perfil-field-label" style="margin-bottom:6px">Notas</div><input class="cot-input" id="tp-notas" placeholder="Algo especial..."></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-ghost" onclick="cerrarModal('add-tour')">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarTourPasado('${userId}')">Guardar</button>
    </div>
  `);
}
async function guardarTourPasado(userId) {
  const artista = document.getElementById('tp-artista').value.trim();
  if (!artista) { alert('El artista es obligatorio'); return; }
  try {
    await khTours.crear({ // [sec-tours]
      usuario_id: userId, artista,
      ciudad: document.getElementById('tp-ciudad').value.trim() || null,
      fecha_aprox: document.getElementById('tp-fecha').value || null,
      tipo_tour: document.getElementById('tp-tipo').value,
      rol_en_tour: document.getElementById('tp-rol').value,
      notas: document.getElementById('tp-notas').value.trim() || null
    });
    cerrarModal('add-tour');
    cerrarModal('ver-perfil');
    if (currentUser && userId === currentUser.id) renderMiPerfil(false);
    else abrirPerfil(userId);
  } catch(e) { alert(e.message); }
}
async function eliminarTourPasado(tourId, userId) {
  if (!confirm('¿Eliminar este tour del historial?')) return;
  try {
    await khTours.eliminar(tourId); // [sec-tours]
    cerrarModal('ver-perfil');
    if (currentUser && userId === currentUser.id) renderMiPerfil(false);
    else abrirPerfil(userId);
  } catch(e) { alert(e.message); }
}
// ═══════════════════════════════════════════════════════════════════════════
// [EQ-7b] EL TAPÓN DE HOY: "Mi perfil no me deja editar".
//
// No era de permisos ni de rol. Quien abre SU PROPIA tarjeta en Guerreros Z
// —la del badge TÚ, que está ahí a la vista— ve el botón EDITAR y lo pulsa. El
// botón llamaba a renderMiPerfil(true), que escribe el formulario dentro de
// #gz-miperfil-content… que vive en la pestaña Mi Perfil, en display:none, y
// además detrás del modal. El formulario SÍ se generaba: se generaba en un
// cajón cerrado. Clic y nada — sin error, sin aviso, sin formulario.
//
// Le pasaba a CUALQUIER rol. No lo cazamos porque quien ya conoce el Palacio
// va directo a la pestaña, donde el mismo botón sí funciona.
//
// La cura es una sola puerta: se cierra el modal, se salta a la pestaña y ahí
// se abre la edición. Un solo formulario y un solo guardado — duplicarlos en
// el modal era la receta de los "asteriscos mentirosos" de EQ-3.
// ═══════════════════════════════════════════════════════════════════════════
function irAEditarMiPerfil() {
  cerrarModal('ver-perfil');
  const btn = document.querySelector('.gz-tab-btn[onclick*="miperfil"]');
  showGZTab('miperfil', btn, /*modoEdicion*/ true);
}
// ─── MI PERFIL ───
async function renderMiPerfil(modoEdicion = false) {
  if (!currentUser) return;
  const el = document.getElementById('gz-miperfil-content');
  if (!el) return;

  if (modoEdicion) {
    el.innerHTML = renderFormPerfil();
    // Fetch fresco para tener todos los campos (incluyendo username)
    try {
      const uFresh = await khUsuarios.obtener(currentUser.id); // [sec-usuarios]
      const u = uFresh || currentUser;
      ['nombre','correo_notif','celular','num_emergencia','nombre_emergencia','parentesco_emergencia','talla_playera','fecha_nacimiento','template_sugerido','username'].forEach(campo => {
        const inp = document.getElementById('mp-' + campo);
        if (inp && u[campo]) inp.value = u[campo];
      });
      // Marca el punto de tema según el valor fresco (por si la sesión venía sin él)
      if (u.tema_acento) {
        const dot = document.querySelector(`.tema-dot[data-hex="${u.tema_acento.toLowerCase()}"]`);
        if (dot) seleccionarTema(u.tema_acento, dot);
      }
    } catch(e) {
      const u = currentUser;
      ['nombre','correo_notif','celular','num_emergencia','nombre_emergencia','parentesco_emergencia','talla_playera','fecha_nacimiento','template_sugerido','username'].forEach(campo => {
        const inp = document.getElementById('mp-' + campo);
        if (inp && u[campo]) inp.value = u[campo];
      });
    }
    return;
  }

  el.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando perfil…</div>';

  try {
    const u = await khUsuarios.obtener(currentUser.id); // [sec-usuarios]
    if (!u) { el.innerHTML = '<div class="alert alert-error">No se encontró el perfil</div>'; return; }
    currentUser = { ...currentUser, ...u };

    const toursPasados = await khTours.listar({ usuario_id: u.id }); // [sec-tours]
    const evAsignados = await khAsignaciones.listar({ coordi_id: u.id }).catch(() => []); // [sec-coordi]
    if (u.rol === 'cc' && evAsignados.length) {
      await _ensureDeliverables(evAsignados);
    }

    const iniciales = u.nombre.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const edad = u.fecha_nacimiento ? calcularEdad(u.fecha_nacimiento) : null;
    // 🎂 CAP2-1: si la fecha viaja (admins / fila propia) se calcula aquí como
    // siempre; si no, se usa el booleano `cumple_hoy` que manda el servidor ya
    // resuelto en hora de Monterrey. El pastelito sale igual para todos sin que
    // la fecha de nacimiento salga de la base.
    const cumple = u.fecha_nacimiento ? esCumple(u.fecha_nacimiento) : !!u.cumple_hoy;
    // Puntos combinados: manuales + auto (asignaciones por slug, DC2d).
    const _evArrMP = await _fetchEVFromIndex();
    const _evMapMP = {};
    _evArrMP.forEach(e => { if (e && e.id) _evMapMP[e.id] = e; });
    _attachEventoDesdeEV(evAsignados, _evMapMP);
    const _combMP = calcularPuntosCombinados(toursPasados, evAsignados, _evMapMP, new Date().getFullYear());
    const ptsTotal = _combMP.total;
    const ptsAnio = _combMP.total;

    el.innerHTML = renderPerfilCompleto(u, toursPasados, evAsignados, iniciales, edad, cumple, ptsTotal, ptsAnio, true, _combMP.detalleAuto);
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}
function renderPerfilCompleto(u, toursPasados, evAsignados, iniciales, edad, cumple, ptsTotal, ptsAnio, esMiPerfil, detalleAuto) {
  const strikes = u.strikes || 0;
  const anioActual = new Date().getFullYear();
  detalleAuto = detalleAuto || [];

  return `
    <div class="perfil-card">
      <div class="perfil-card-header">
        <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
          <div class="perfil-avatar-large" ${esMiPerfil ? `onclick="subirFoto('${u.id}')"` : ''}>
            ${u.foto_url ? `<img src="${_urlSegura(u.foto_url)}" alt="${_esfEsc(u.nombre)}">` : iniciales}
            ${esMiPerfil ? '<div class="upload-hint">Cambiar<br>foto</div>' : ''}
          </div>
          <div style="flex:1;min-width:200px">
            <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.18em;color:var(--ts);margin-bottom:6px">// id_${u.id.slice(0,8)}</div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:30px;font-weight:700;line-height:1;margin-bottom:8px;letter-spacing:-.01em">${_esfEsc(u.nombre)}${cumple ? ' <span style="font-size:24px"><svg class="ic"><use href="#ic-pastel"/></svg></span>' : ''}</div>
            <div style="display:inline-block;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);border:1px solid rgba(255,183,3,.3);padding:4px 10px;margin-bottom:6px">${ROL_LABELS[u.rol] || u.rol}</div>
            ${edad ? `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ts);margin-top:4px">${edad} años</div>` : ''}
          </div>
          <div style="display:flex;gap:24px;flex-wrap:wrap">
            ${u.rol === 'cc' ? (() => {
              const totalDeliv = evAsignados.reduce((s, e) => s + (e.deliverables ? e.deliverables.length : 0), 0);
              const okDeliv = evAsignados.reduce((s, e) => s + (e.deliverables ? e.deliverables.filter(d => d.estado === 'completado').length : 0), 0);
              const ratioColor = totalDeliv === 0 ? 'var(--ts)' : okDeliv === totalDeliv ? 'var(--green)' : okDeliv > 0 ? 'var(--gold)' : 'var(--red)';
              return `
                <div style="text-align:center">
                  <div style="font-family:'Zen Dots',cursive;font-size:24px;line-height:1;color:var(--text)">${evAsignados.length}</div>
                  <div class="pts-label">Tours asig</div>
                </div>
                <div style="text-align:center">
                  <div style="font-family:'Zen Dots',cursive;font-size:24px;line-height:1;color:${ratioColor}">${okDeliv}/${totalDeliv}</div>
                  <div class="pts-label">Material</div>
                </div>
                <div style="text-align:center">
                  <div style="font-family:'Zen Dots',cursive;font-size:24px;line-height:1;color:${strikes >= 3 ? 'var(--red)' : strikes >= 2 ? 'var(--gold)' : 'var(--green)'}">${strikes}/3</div>
                  <div class="pts-label">Strikes</div>
                </div>
              `;
            })() : `
              <div style="text-align:center">
                <div class="pts-display">${ptsAnio}</div>
                <div class="pts-label">PTS ${anioActual}</div>
              </div>
              <div style="text-align:center">
                <div style="font-family:'Zen Dots',cursive;font-size:24px;line-height:1;color:var(--text)">${toursPasados.length + detalleAuto.length}</div>
                <div class="pts-label">Tours</div>
              </div>
              <div style="text-align:center">
                <div style="font-family:'Zen Dots',cursive;font-size:24px;line-height:1;color:${strikes >= 3 ? 'var(--red)' : strikes >= 2 ? 'var(--gold)' : 'var(--green)'}">${strikes}/3</div>
                <div class="pts-label">Strikes</div>
              </div>
            `}
          </div>
        </div>
      </div>

      ${esMiPerfil ? `
        <div class="perfil-section" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="irAEditarMiPerfil()" style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em">▸ EDITAR PERFIL</button>
        </div>
      ` : ''}

      <div class="perfil-section">
        <div class="perfil-section-title">Información personal</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px 28px">
          ${perfilCampo('Correo', u.correo)}
          ${perfilCampo('Celular', u.celular)}
          ${perfilCampo('Correo notif', u.correo_notif)}
          ${perfilCampo('Talla playera', u.talla_playera)}
          ${perfilCampo('Fecha nacimiento', u.fecha_nacimiento ? fmtFecha(u.fecha_nacimiento) : null)}
          ${perfilCampo('Emergencia', u.nombre_emergencia ? `${u.nombre_emergencia} · ${u.num_emergencia}` : u.num_emergencia)}
        </div>
      </div>

      ${u.template_sugerido ? `
        <div class="perfil-section">
          <div class="perfil-section-title">Mi template</div>
          <div style="background:var(--bg3);border-left:2px solid var(--gold);padding:14px 18px;font-family:'Rajdhani',sans-serif;font-size:14px;font-style:italic;color:var(--text);position:relative">
            <span style="font-family:'Zen Dots',cursive;font-size:24px;color:var(--gold);position:absolute;top:-2px;left:8px;background:var(--bg2);padding:0 6px;line-height:1">"</span>
            <div style="padding-top:6px">${u.template_sugerido}</div>
          </div>
        </div>
      ` : ''}

      <div class="perfil-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <div class="perfil-section-title" style="margin-bottom:0">Tours asignados <span style="color:var(--ts);font-weight:400">[${evAsignados.length}]</span></div>
        </div>
        ${evAsignados.length ? evAsignados.map(e => {
          const ev = e.eventos || {};
          const hoy = new Date(); hoy.setHours(0,0,0,0);
          const fechaEv = ev.fecha ? new Date(ev.fecha + 'T12:00:00') : null;
          const esPasado = fechaEv && fechaEv < hoy;
          const stColor = { pendiente:'var(--gold)', aceptado:'var(--green)', declinado:'var(--red)' };
          const stLabel = { pendiente:'Pendiente', aceptado:'Aceptado', declinado:'Declinado' };
          return `<div class="tour-item" style="border-left-color:${esPasado?'var(--ts)':'var(--orange)'}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <div>
                <div class="tour-item-name" style="font-size:16px">${_esfEsc(ev.nombre || ev.artista || '—')}</div>
                <div class="tour-item-meta">${ev.artista?_esfEsc(ev.artista)+' · ':''}${_esfEsc(ev.ciudad||'')} ${fechaEv?'· '+fechaEv.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}):''}</div>
                ${u.rol !== 'cc' && e.indicaciones ? `<div style="font-size:11px;color:var(--ts);margin-top:5px;font-style:italic">${_esfEsc(e.indicaciones)}</div>` : ''}
                ${ev.notas_internas ? `<div style="font-size:11px;color:var(--ts);margin-top:4px"><span class="k-mono-sm" style="margin-right:6px">EQUIPO</span>${_esfEsc(ev.notas_internas)}</div>` : ''}
              </div>
              <span style="font-size:10px;white-space:nowrap;color:${stColor[e.status]||'var(--ts)'}">
                ${stLabel[e.status]||e.status||''}
              </span>
            </div>
            ${esMiPerfil && ev.id ? `
            <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" onclick="descargarListaViajeros('${ev.id}')" style="font-size:10px;font-family:'JetBrains Mono',monospace">↓ Lista viajeros</button>
              <button class="btn btn-ghost btn-sm" onclick="descargarRoomingList('${ev.id}')" style="font-size:10px;font-family:'JetBrains Mono',monospace">↓ Rooming list</button>
            </div>` : ''}
            ${u.rol === 'cc' && Array.isArray(e.deliverables) ? _renderDeliverablesPanel(e, u) : ''}
          </div>`;
        }).join('') : '<div style="font-family:JetBrains Mono,monospace;font-size:11px;color:var(--ts);letter-spacing:.05em">// sin tours asignados</div>'}
      </div>

      <div class="perfil-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <div class="perfil-section-title" style="margin-bottom:0">Historial de tours <span style="color:var(--ts);font-weight:400">[${toursPasados.length + detalleAuto.length}]</span></div>
          <button class="btn btn-ghost btn-sm" onclick="abrirAgregarTour('${u.id}')" style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em">+ Agregar</button>
        </div>
        ${detalleAuto.map(d => `
          <div class="tour-item" style="border-left-color:var(--green)">
            <div class="tour-item-head">
              <div class="tour-item-name">${_esfEsc(d.nombre)} <span style="font-family:JetBrains Mono,monospace;font-size:9px;color:var(--green);letter-spacing:.1em">(asignado)</span></div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                <span class="tour-item-pts">+${d.pts}</span>
              </div>
            </div>
            <div class="tour-item-meta">${_esfEsc(TIPO_TOUR_LABEL[d.tipo_tour]||'Tour')} ${d.fecha ? '· ' + fmtFecha(d.fecha.toISOString().slice(0,10)) : ''}</div>
          </div>`).join('')}
        ${toursPasados.map(t => {
          const año = t.fecha_aprox ? new Date(t.fecha_aprox).getFullYear() : null;
          const sumaPuntos = año && año >= 2026;
          const ptsTour = PUNTOS_TOUR[t.tipo_tour] || 0;
          return `
          <div class="tour-item">
            <div class="tour-item-head">
              <div class="tour-item-name">${_esfEsc(t.artista)}</div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                ${sumaPuntos ? `<span class="tour-item-pts">+${ptsTour}</span>` : '<span style="font-family:JetBrains Mono,monospace;font-size:9px;color:var(--ts);letter-spacing:.1em">PRE-2026</span>'}
                <button onclick="event.stopPropagation();eliminarTourPasado('${t.id}','${u.id}')" style="background:none;border:none;color:var(--ts);cursor:pointer;font-size:18px;padding:0 4px">×</button>
              </div>
            </div>
            <div class="tour-item-meta">${_esfEsc(TIPO_TOUR_LABEL[t.tipo_tour]||'Tour')} · ${_esfEsc(t.ciudad || '')} ${t.fecha_aprox ? '· ' + fmtFecha(t.fecha_aprox) : ''}</div>
            ${t.notas ? `<div style="font-size:11px;color:var(--ts);margin-top:6px;font-style:italic">${_esfEsc(t.notas)}</div>` : ''}
          </div>`;
        }).join('')}
        ${(toursPasados.length + detalleAuto.length) === 0 ? '<div style="font-family:JetBrains Mono,monospace;font-size:11px;color:var(--ts);letter-spacing:.05em">// sin historial. Agrega tus tours pre-sistema para construir tu perfil.</div>' : ''}
      </div>
    </div>
  `;
}

function perfilCampo(label, valor) {
  return `<div class="perfil-field">
    <div class="perfil-field-label">${label}</div>
    <div class="perfil-field-value ${valor ? '' : 'perfil-field-empty'}">${valor ? _esfEsc(valor) : '— sin info'}</div>
  </div>`;
}
function renderFormPerfil() {
  const temaActual = (currentUser.tema_acento || '#e8ff4c').toLowerCase();
  const temaDots = TEMA_PRESETS.map(t =>
    `<button type="button" class="tema-dot${t.hex.toLowerCase() === temaActual ? ' sel' : ''}" style="--c:${t.hex}" data-hex="${t.hex.toLowerCase()}" title="${_esfEsc(t.nombre)}" aria-label="${_esfEsc(t.nombre)}" onclick="seleccionarTema('${t.hex}', this)"></button>`
  ).join('');
  return `
    <div class="perfil-card" style="max-width:920px">
      <div class="perfil-card-header" style="padding:24px 28px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.2em;color:var(--ts);margin-bottom:4px">// EDIT_MODE</div>
        <div style="font-family:'Zen Dots',cursive;font-size:22px;background:linear-gradient(90deg,var(--text),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Editar mi perfil</div>
      </div>
      <div class="perfil-section">
        <div class="perfil-section-title">Información básica</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div style="grid-column:1/-1"><div class="perfil-field-label" style="margin-bottom:6px">Nombre completo</div><input class="cot-input" id="mp-nombre" placeholder="Tu nombre"></div>
          <div><div class="perfil-field-label" style="margin-bottom:6px">Celular</div><input class="cot-input" id="mp-celular" placeholder="8991234567" type="tel"></div>
          <div><div class="perfil-field-label" style="margin-bottom:6px">Talla playera</div><select class="cot-input" id="mp-talla_playera"><option value="">—</option><option>XS</option><option>S</option><option>M</option><option>L</option><option>XL</option><option>XXL</option></select></div>
          <div><div class="perfil-field-label" style="margin-bottom:6px">Fecha de nacimiento</div><input class="cot-input" id="mp-fecha_nacimiento" type="date"></div>
          <div><div class="perfil-field-label" style="margin-bottom:6px">Correo notificaciones</div><input class="cot-input" id="mp-correo_notif" type="email" placeholder="tu@correo.com"></div>
        </div>
      </div>
      <div class="perfil-section">
        <div class="perfil-section-title">Color de tema</div>
        <div style="font-family:JetBrains Mono;font-size:10px;color:var(--ts);margin-bottom:12px;letter-spacing:.04em">// elige el acento de tu Kamehouse</div>
        <input type="hidden" id="mp-tema_acento" value="${temaActual}">
        <div class="tema-dots">${temaDots}</div>
      </div>
      <div class="perfil-section">
        <div class="perfil-section-title">Contacto de emergencia</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div><div class="perfil-field-label" style="margin-bottom:6px">Nombre</div><input class="cot-input" id="mp-nombre_emergencia"></div>
          <div><div class="perfil-field-label" style="margin-bottom:6px">Número</div><input class="cot-input" id="mp-num_emergencia" type="tel"></div>
          <div><div class="perfil-field-label" style="margin-bottom:6px">¿Qué es tuyo?</div><input class="cot-input" id="mp-parentesco_emergencia" placeholder="Mamá, esposo, hermana…"></div>
        </div>
        <div style="font-size:11px;color:var(--ts);margin-top:8px;line-height:1.5">
          Van impresos en tu contrato y es a quien le hablamos si algo pasa en el viaje.
        </div>
      </div>
      <div class="perfil-section">
        <div class="perfil-section-title">Mi template</div>
        <div style="font-family:JetBrains Mono;font-size:10px;color:var(--ts);margin-bottom:10px;letter-spacing:.04em">// describe el tema visual que te gustaría para tu perfil</div>
        <textarea class="cot-input" id="mp-template_sugerido" rows="3" placeholder="ej. Tema azul oscuro con detalles dorados estilo Vegeta"></textarea>
      </div>
      <div class="perfil-section">
        <div class="perfil-section-title">Acceso al sistema</div>
        <div style="font-family:JetBrains Mono;font-size:10px;color:var(--ts);margin-bottom:14px;letter-spacing:.04em">// puedes entrar con tu correo o con tu nombre de usuario</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div style="grid-column:1/-1">
            <div class="perfil-field-label" style="margin-bottom:4px">Nombre de usuario</div>
            <div style="font-family:JetBrains Mono;font-size:10px;color:var(--ts);margin-bottom:6px;letter-spacing:.04em">// elige un alias corto para iniciar sesión más rápido</div>
            <input class="cot-input" id="mp-username" placeholder="ej. memo · mipopo · juanpz" autocomplete="username" style="text-transform:lowercase">
          </div>
          <div>
            <div class="perfil-field-label" style="margin-bottom:4px">Nueva contraseña</div>
            <div style="font-family:JetBrains Mono;font-size:10px;color:var(--ts);margin-bottom:6px;letter-spacing:.04em">// dejar vacío para no cambiarla</div>
            <input class="cot-input" id="mp-pass-nueva" type="password" placeholder="Mínimo 8 caracteres" autocomplete="new-password">
          </div>
          <div>
            <div class="perfil-field-label" style="margin-bottom:4px">Confirmar contraseña</div>
            <div style="font-family:JetBrains Mono;font-size:10px;color:var(--ts);margin-bottom:6px;letter-spacing:.04em">&nbsp;</div>
            <input class="cot-input" id="mp-pass-confirm" type="password" placeholder="Repite la contraseña" autocomplete="new-password">
          </div>
        </div>
      </div>
      <div class="perfil-section">
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="guardarMiPerfil()">Guardar cambios</button>
          <button class="btn btn-ghost" onclick="renderMiPerfil(false)">Cancelar</button>
        </div>
        <div id="mp-alert" style="margin-top:12px"></div>
      </div>
    </div>
  `;
}
async function guardarMiPerfil() {
  const alertEl = document.getElementById('mp-alert');
  const passNueva = document.getElementById('mp-pass-nueva')?.value;
  const passConfirm = document.getElementById('mp-pass-confirm')?.value;
  if (passNueva && passNueva !== passConfirm) {
    alertEl.innerHTML = '<div class="alert alert-error">Las contraseñas no coinciden</div>';
    return;
  }
  // Validar username si lo cambió
  const usernameNuevo = document.getElementById('mp-username')?.value.trim().toLowerCase().replace(/\s+/g,'') || null;
  if (usernameNuevo) {
    // Verificar que no esté tomado por otro usuario
    const disponible = await khUsuarios.verificarUsername(usernameNuevo, currentUser.id); // [sec-usuarios]
    if (!disponible) {
      alertEl.innerHTML = '<div class="alert alert-error">Ese nombre de usuario ya está tomado, elige otro</div>';
      return;
    }
  }

  const body = {
    nombre: document.getElementById('mp-nombre')?.value.trim(),
    celular: document.getElementById('mp-celular')?.value.trim() || null,
    talla_playera: document.getElementById('mp-talla_playera')?.value || null,
    fecha_nacimiento: document.getElementById('mp-fecha_nacimiento')?.value || null,
    correo_notif: document.getElementById('mp-correo_notif')?.value.trim() || null,
    nombre_emergencia: document.getElementById('mp-nombre_emergencia')?.value.trim() || null,
    num_emergencia: document.getElementById('mp-num_emergencia')?.value.trim() || null,
    template_sugerido: document.getElementById('mp-template_sugerido')?.value.trim() || null,
    tema_acento: document.getElementById('mp-tema_acento')?.value || null,
  };
  // [EQ-7] LA TERCERA PUERTA DEL MISMO SELLO. Mi Perfil también estampaba
  // perfil_completo=true a ciegas: guardar con los campos de seguridad vacíos
  // dejaba el sello puesto y la mentira intacta. Ahora el sello es un
  // VEREDICTO, no un adorno — se pone si los tres datos están, y se quita si
  // alguien los borra. Así "perfil completo" significa lo mismo en las tres
  // puertas (registro, Mi Perfil, y el candado de la firma).
  body.parentesco_emergencia = document.getElementById('mp-parentesco_emergencia')?.value.trim() || null;
  body.perfil_completo = !!(body.fecha_nacimiento && body.nombre_emergencia
    && body.num_emergencia && body.parentesco_emergencia);
  if (usernameNuevo) body.username = usernameNuevo;
  if (passNueva) body.password = passNueva; // [sec-usuarios] texto plano; el server lo hashea (bcrypt)
  try {
    await khUsuarios.actualizar(currentUser.id, body); // [sec-usuarios]
    delete body.password; // [sec-usuarios] no propagar la password en claro a currentUser/sessionStorage
    alertEl.innerHTML = '<div class="alert" style="background:rgba(45,198,83,.1);color:var(--green)">Perfil guardado</div>';
    currentUser = { ...currentUser, ...body };
    // Refrescar la sesión guardada para que el tema persista al recargar
    const _sesRaw = sessionStorage.getItem(SESSION_KEY);
    if (_sesRaw) {
      const _ses = JSON.parse(_sesRaw);
      _ses.user = { ..._ses.user, ...body };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(_ses));
    }
    // Re-aplica la precedencia (mismo orden que enterApp): al elegir un acento
    // personal se quita la clase tema-XXX para que el acento se vea al instante.
    aplicarTemaCoordi();
    applyTema(body.tema_acento);
    setTimeout(() => renderMiPerfil(false), 1200);
    loadEquipo();
  } catch(e) {
    alertEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}
// ─── SUBIR FOTO ───
async function subirFoto(userId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { alert('La foto no puede pesar más de 3MB'); return; }

    // Redimensionar y convertir a base64 (funciona sin Storage bucket)
    try {
      const base64url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 400;
            let w = img.width, h = img.height;
            if (w > h) { if (w > MAX) { h = h * MAX / w; w = MAX; } }
            else { if (h > MAX) { w = w * MAX / h; h = MAX; } }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          };
          img.onerror = reject;
          img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Guardar base64 directo en foto_url (sin depender de Storage)
      await khUsuarios.actualizar(userId, { foto_url: base64url }); // [sec-usuarios]

      // Actualizar sesión si es el usuario actual
      if (userId === currentUser.id) {
        currentUser.foto_url = base64url;
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          s.user.foto_url = base64url;
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
        }
      }

      await loadEquipo();
      if (userId === currentUser.id) renderMiPerfil(false);

    } catch(e) {
      alert('Error al procesar la foto: ' + e.message);
    }
  };
  input.click();
}
// ─── RANKING ───
async function abrirRanking() {
  crearModal('ranking', '', '<div class="loading-state"><div class="spinner"></div>Calculando ranking…</div>');
  try {
    const tours = await khTours.listar({ desde: '2026-01-01' }); // [sec-tours]
    const usuarios = await khUsuarios.listar({ activos: true, orden: 'nombre' }); // [sec-usuarios]
    // Tours asignados aceptados (de TODOS) → puntos AUTO derivados del EV por slug (DC2d).
    const asignaciones = await khAsignaciones.listar({ status: 'aceptado' }); // [sec-coordi]
    const evArr = await _fetchEVFromIndex();
    const evMap = {};
    evArr.forEach(e => { if (e && e.id) evMap[e.id] = e; });
    const anioActual = new Date().getFullYear();
    const rankingData = usuarios.map(u => {
      const misToures = tours.filter(t => t.usuario_id === u.id);
      const misAsign = asignaciones.filter(a => a.coordi_id === u.id);
      const comb = calcularPuntosCombinados(misToures, misAsign, evMap, anioActual);
      const ptsAnio = comb.total;
      const numTours = misToures.length + comb.detalleAuto.length;
      const iniciales = u.nombre.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      return { ...u, tours: misToures, ptsAnio, numTours, iniciales };
    });
    rankingData.sort((a, b) => b.ptsAnio - a.ptsAnio);
    const medallaEmoji = ['1°','2°','3°'];
    const tieneTours = rankingData.some(u => u.ptsAnio > 0);

    const modalEl = document.getElementById('modal-ranking');
    if (!modalEl) return;
    const loadingEl = modalEl.querySelector('.loading-state');
    const bodyEl = loadingEl ? loadingEl.parentElement : null;
    if (!bodyEl) return;

    bodyEl.innerHTML = `
      <div style="margin:-24px -24px 0">
        <div class="perfil-card-header" style="padding:24px 28px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.2em;color:var(--ts);margin-bottom:4px">// LEADERBOARD_${anioActual}</div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="font-family:'Zen Dots',cursive;font-size:22px;background:linear-gradient(90deg,var(--orange),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">RANKING ${anioActual}</div>
            <span style="font-size:24px"></span>
          </div>
          <div style="font-family:Rajdhani;font-size:13px;color:var(--gold);margin-top:8px;font-weight:600">El líder al final del año gana un tour gratis</div>
          <div style="font-family:JetBrains Mono;font-size:10px;color:var(--ts);margin-top:4px;letter-spacing:.04em">// concierto: 3pts · festival 1d: 5pts · 2d: 7pts · 3d: 10pts</div>
        </div>
        <div style="padding:20px 28px 28px">
          ${rankingData.map((u, i) => {
            const top = i < 3 ? `top${i+1}` : '';
            const esYo = currentUser && u.id === currentUser.id ? 'is-me' : '';
            const posDisplay = i < 3 ? medallaEmoji[i] : `#${i+1}`;
            return `<div class="rank-row ${top} ${esYo}">
              <div class="rank-pos">${posDisplay}</div>
              <div class="gz-avatar" style="width:44px;height:44px;font-size:14px;flex-shrink:0">${u.foto_url ? `<img src="${_urlSegura(u.foto_url)}">` : u.iniciales}</div>
              <div style="flex:1;min-width:0"><div style="font-family:Rajdhani;font-weight:700;font-size:14px">${_esfEsc(u.nombre)}${esYo ? ' <span style="font-family:JetBrains Mono;font-size:9px;color:var(--orange);letter-spacing:.1em">// TÚ</span>' : ''}</div><div class="gz-rol" style="font-size:9px;margin-bottom:0">${ROL_LABELS[u.rol] || u.rol} · ${u.numTours} tours</div></div>
              <div style="text-align:right"><div class="rank-pts">${u.ptsAnio}</div><div style="font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.18em;color:var(--ts);text-transform:uppercase">PTS</div></div>
            </div>`;
          }).join('')}
          ${!tieneTours ? `<div style="margin-top:20px;text-align:center;padding:20px;background:var(--bg3);border:1px dashed var(--border);font-family:JetBrains Mono;font-size:11px;color:var(--ts);letter-spacing:.04em">// sin tours registrados en ${anioActual} aún<br><span style="font-size:10px">// agrega tus tours desde tu perfil para empezar a sumar puntos</span></div>` : ''}
        </div>
      </div>
    `;
  } catch(e) {
    console.error('Error ranking:', e);
  }
}
// Capsule sobre el portal (Fase feat/capsule-sobre-portal): la lista de eventos
// sale del array EV de index.html (misma fuente que el sitio), NO de la tabla
// vieja `eventos`. _ccEvFromEV mapea cada EV a la forma que espera
// renderCCEventos / abrirDetalleEvento (id base = el evento_id del portal).
function _ccEvFromEV(e) {
  const fecha = e.ds
    || (Array.isArray(e.multifecha) && e.multifecha[0] && e.multifecha[0].ds)
    || '';
  return {
    id:             e.id,
    nombre:         e.a || e.id,
    artista:        '',                       // e.a ya es el nombre; no duplicar
    ciudad:         e.cdmx ? 'CDMX' : 'MTY',
    fecha,
    tipo_evento:    null,                      // → 'Concierto' (fallback de TIPOS_EVENTO)
    notas_internas: null,
    zonas_boleto:   [],
    _ev:            e,
  };
}
// Adjunta a cada asignación (eventos_coordi, por slug) los datos del evento
// tomados del EV ya cargado en cliente (mapa slug→item). Sustituye el viejo
// embed PostgREST eventos(...), que dependía de una FK eventos_coordi→eventos
// que ya NO existe (Fase A). Si el slug no está en el EV, deja un fallback con
// el slug crudo como nombre para no romper el render.
function _attachEventoDesdeEV(evAsignados, evMap) {
  (evAsignados || []).forEach(e => {
    const evItem = e && e.evento_id ? evMap[e.evento_id] : null;
    e.eventos = evItem ? _ccEvFromEV(evItem) : { id: e.evento_id, nombre: e.evento_id };
  });
}
// Anota cada item de evAsignados con su array .deliverables. Si una asignación
// no tiene ninguno, crea los 3 defaults para evento del flujo de contratos.
async function _ensureDeliverables(evAsignados) {
  if (!evAsignados.length) return;
  const ids = evAsignados.map(e => e.id).filter(Boolean);
  if (!ids.length) return;
  let rows = [];
  try {
    rows = await khDeliverables.listar(ids); // [sec-deliverables]
  } catch (e) {
    console.warn('[deliverables] read falló:', e.message);
    return;
  }
  // Group by evento_coordi_id
  const byId = {};
  rows.forEach(r => { (byId[r.evento_coordi_id] = byId[r.evento_coordi_id] || []).push(r); });

  // Para cada asignación, auto-popular si está vacía.
  for (const e of evAsignados) {
    let list = byId[e.id] || [];
    if (!list.length) {
      try {
        list = await khDeliverables.crearDefaults(e.id, _DELIVERABLES_DEFAULT); // [sec-deliverables]
      } catch (err) {
        console.warn('[deliverables] auto-popular falló para', e.id, err.message);
      }
    }
    e.deliverables = list;
  }
}
function _renderDeliverablesPanel(e, u) {
  const dels = e.deliverables || [];
  const ok = dels.filter(d => d.estado === 'completado').length;
  const total = dels.length;
  return `
    <div style="margin-top:14px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.05);border-radius:var(--r-sm,8px);padding:12px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)">▸ Material entregado <span style="color:var(--ts);margin-left:4px">[${ok}/${total}]</span></div>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_delivAdd('${e.id}','${u.id}')" style="font-size:10px;font-family:'JetBrains Mono',monospace">+ deliverable</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${dels.map(d => _renderDeliverableItem(d, u)).join('') || '<div style="font-family:JetBrains Mono,monospace;font-size:10px;color:var(--ts);letter-spacing:.05em">// sin items</div>'}
      </div>
    </div>
  `;
}
function _renderDeliverableItem(d, u) {
  const done = d.estado === 'completado';
  const color = done ? 'var(--green)' : 'var(--gold)';
  const bg = done ? 'rgba(61,220,132,.08)' : 'rgba(255,183,3,.05)';
  const fechaTxt = done && d.completado_at
    ? ' · ' + new Date(d.completado_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
    : '';
  return `
    <div style="background:${bg};border-left:2px solid ${color};padding:8px 10px;font-size:12px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:${color}">${done ? '✓' : '○'}</span>
            <span style="color:var(--text);font-weight:600">${_escDeliv(d.descripcion)}</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:${color};letter-spacing:.1em;text-transform:uppercase">${done ? 'Entregado'+fechaTxt : 'Pendiente'}</span>
          </div>
          ${d.link_contenido ? `<div style="margin-top:4px;font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--ts)">↗ <a href="${_escDeliv(d.link_contenido)}" target="_blank" rel="noopener" style="color:var(--gold)">${_escDeliv(d.link_contenido).slice(0,60)}${d.link_contenido.length>60?'…':''}</a></div>` : ''}
          ${d.notas ? `<div style="margin-top:4px;font-size:10px;color:var(--ts);font-style:italic">${_escDeliv(d.notas)}</div>` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_delivToggle('${d.id}','${u.id}')" style="font-size:9px;font-family:'JetBrains Mono',monospace;padding:3px 7px">${done ? '↻ marcar pendiente' : '✓ marcar entregado'}</button>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_delivEditarLink('${d.id}','${u.id}')" style="font-size:9px;font-family:'JetBrains Mono',monospace;padding:3px 7px" title="Link del contenido"><svg class="ic"><use href="#ic-enlace"/></svg></button>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_delivEditarNotas('${d.id}','${u.id}')" style="font-size:9px;font-family:'JetBrains Mono',monospace;padding:3px 7px" title="Notas"><svg class="ic"><use href="#ic-lapiz"/></svg></button>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_delivBorrar('${d.id}','${u.id}')" style="font-size:9px;font-family:'JetBrains Mono',monospace;padding:3px 7px;color:var(--red);border-color:rgba(230,57,70,.3)" title="Eliminar">×</button>
        </div>
      </div>
    </div>
  `;
}
function _escDeliv(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
async function _delivToggle(id, userId) {
  try {
    await khDeliverables.toggle(id); // [sec-deliverables] estado se invierte server-side
    _delivRefreshProfile(userId);
  } catch (e) { alert('Error: ' + e.message); }
}
async function _delivEditarLink(id, userId) {
  try {
    const actual = await khDeliverables.obtener(id); // [sec-deliverables]
    if (!actual) return;
    const nuevo = prompt('Link del contenido entregado (URL)\n— deja vacío para quitar el link:', actual.link_contenido || '');
    if (nuevo === null) return;
    await khDeliverables.editarLink(id, nuevo.trim() || null); // [sec-deliverables]
    _delivRefreshProfile(userId);
  } catch (e) { alert('Error: ' + e.message); }
}
async function _delivEditarNotas(id, userId) {
  try {
    const actual = await khDeliverables.obtener(id); // [sec-deliverables]
    if (!actual) return;
    const nuevo = prompt('Notas para este deliverable:', actual.notas || '');
    if (nuevo === null) return;
    await khDeliverables.editarNotas(id, nuevo.trim() || null); // [sec-deliverables]
    _delivRefreshProfile(userId);
  } catch (e) { alert('Error: ' + e.message); }
}
async function _delivBorrar(id, userId) {
  if (!confirm('¿Eliminar este deliverable?')) return;
  try {
    await khDeliverables.borrar(id); // [sec-deliverables]
    _delivRefreshProfile(userId);
  } catch (e) { alert('Error: ' + e.message); }
}
async function _delivAdd(eventoCoordiId, userId) {
  const desc = prompt('Descripción del deliverable extra:\n(ej. "Video backstage", "Story con marca patrocinadora")');
  if (!desc || !desc.trim()) return;
  try {
    await khDeliverables.addExtra(eventoCoordiId, desc.trim()); // [sec-deliverables]
    _delivRefreshProfile(userId);
  } catch (e) { alert('Error: ' + e.message); }
}
function _delivRefreshProfile(userId) {
  // Re-abre el mismo modal de perfil. Si es el propio user, renderMiPerfil.
  if (currentUser && userId === currentUser.id && typeof renderMiPerfil === 'function') {
    renderMiPerfil(false);
  } else {
    cerrarModal('ver-perfil');
    abrirPerfil(userId);
  }
}