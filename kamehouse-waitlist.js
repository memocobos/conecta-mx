// =============================================================================
// kamehouse-waitlist.js — la lista de espera, sacada del tronco (MONO-4)
// =============================================================================
// 16 funciones y 425 líneas: la pantalla que avisa a quien se apuntó cuando un
// evento se publica o reabre. 64% de aislamiento, comparte 9 funciones.
//
// Mismas reglas que las anteriores: SOLO funciones, en el MISMO ORDEN, con su
// comentario pegado, y cero código de nivel superior — el estado global se queda
// íntegro en el tronco.
//
// Va ANTES del tronco por la regla del sentido único (ver MONO-2), y el arnés
// exige cero errores al CARGAR la página, que es la única autoridad sobre orden
// de carga.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

function copiarLinkProximos(btn) {
  const url = 'https://conectareynosa.mx/proximos';
  const restore = () => { if (btn) { btn.textContent = 'Copiar link de próximos tours'; btn.disabled = false; } };
  const ok = () => { if (btn) { btn.textContent = '✓ Copiado'; btn.disabled = true; setTimeout(restore, 2000); } };
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      ok();
    } catch (e) {
      if (btn) { btn.textContent = 'Copia manual: ' + url; setTimeout(restore, 3500); }
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(ok).catch(fallback);
  } else {
    fallback();
  }
}
async function loadWaitlist() {
  const summary = document.getElementById('wl-summary');
  const groups = document.getElementById('wl-groups');
  // [FLUJO-UX-2] Señal de vida ANTES de esperar. Sin esto, en conexión lenta
  // esta pantalla se veía igual que una rota — y desde WL-1 ya sabe decir su
  // error, así que callar mientras carga era lo único que la volvía ambigua.
  if (summary) summary.textContent = 'Cargando…';
  khCargando(groups, 'la lista de espera');
  if (summary) summary.textContent = 'Cargando…';
  if (groups) groups.innerHTML = '';

  let rows = [], snap = [];
  try {
    [rows, snap] = await Promise.all([
      khWaitlist.listar(),   // [sec-radar-wl]
      khWaitlist.snapshot(), // [sec-radar-wl]
    ]);
  } catch (e) {
    // [EQ-8] El mensaje técnico a la consola; a la pantalla, algo que se pueda
    // hacer. Antes pegaba `e.message` crudo en el resumen — mismo mal que el
    // radar, en otra pantalla.
    console.error('[waitlist]', e);
    if (summary) summary.textContent = 'No se pudo cargar';
    if (groups) groups.innerHTML = '<div class="err-box wl-error-box">'
      + '<strong class="err-titulo">No se pudo cargar la lista de espera.</strong><br>'
      + 'Puede ser la conexión. Vuelve a intentar en un momento.'
      + '<div class="err-pie"><button class="btn btn-ghost btn-sm err-btn" onclick="loadWaitlist()">↻ Reintentar</button></div>'
      + '<div class="err-detalle">detalle técnico: ' + _esfEsc(String(e && e.message || '').slice(0, 200)) + '</div>'
      + '</div>';
    return;
  }
  _waitlistCache = rows || [];
  _snapshotCache = {};
  for (const s of (snap || [])) _snapshotCache[s.evento_id] = s.estado;
  _wlPintar();
}
function _wlArchivado(g) {
  return g.rows.length > 0 && g.rows.every((r) => !!r.notificado);
}
function filtrarWaitlist(filtro, btn) {
  document.querySelectorAll('#page-waitlist .gz-filter[id^="wlf-"]').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _wlFiltro = filtro;
  _wlPintar();
}
function wlVolverAActivos(eventoId) {
  _wlReabiertos.add(eventoId);
  _wlFiltro = 'activos';
  document.querySelectorAll('#page-waitlist .gz-filter[id^="wlf-"]').forEach((b) =>
    b.classList.toggle('active', b.id === 'wlf-activos'));
  _wlPintar();
}
// Mira EVENTO, NOMBRE y CORREO. Buscar el nombre del evento trae a toda su
// gente; buscar un correo lo encuentra sin importar en qué evento esté.
function _wlCoincide(r, q) {
  if (!q) return true;
  return (String(r.evento_nombre || '') + ' ' + String(r.nombre || '') + ' ' + String(r.email || ''))
    .toLowerCase().includes(q);
}
function _wlBuscarEnLista() {
  _wlBusca = (document.getElementById('wl-buscar')?.value || '').trim().toLowerCase();
  _wlPintar();
}
function _wlPintar() {
  const groups = document.getElementById('wl-groups');
  const summary = document.getElementById('wl-summary');
  if (!groups) return;

  // Agrupar por evento_id, usar el evento_nombre más reciente por evento
  const byEv = {};
  for (const r of _waitlistCache) {
    if (!byEv[r.evento_id]) byEv[r.evento_id] = { evento_id: r.evento_id, evento_nombre: r.evento_nombre, rows: [] };
    byEv[r.evento_id].rows.push(r);
  }
  const todos = Object.values(byEv).sort((a,b) => b.rows.length - a.rows.length);
  // [HER-1g] El veredicto de archivo, y el veto manual de «Volver a activos».
  todos.forEach((g) => { g.arch = _wlArchivado(g) && !_wlReabiertos.has(g.evento_id); });
  const nArch = todos.filter((g) => g.arch).reduce((a, g) => a + g.rows.length, 0);
  const nAct = _waitlistCache.length - nArch;

  // [HER-1g] Los conteos van en PERSONAS, que es la unidad del resumen de
  // arriba, y se cuentan SIN el buscador: el chip dice cuántos hay de cada
  // clase, no cuántos sobreviven al texto.
  const rot = (id, txt, n) => { const b = document.getElementById(id); if (b) b.textContent = txt + ' (' + n + ')'; };
  rot('wlf-activos', '// activos', nAct);
  rot('wlf-archivo', '// archivo', nArch);
  rot('wlf-todos', '// todos', _waitlistCache.length);

  // Dos cortes que se COMBINAN: primero el chip, luego el texto.
  const delChip = todos.filter((g) => _wlFiltro === 'todos' || (_wlFiltro === 'archivo' ? g.arch : !g.arch));
  const eventos = delChip
    .map((g) => Object.assign({}, g, { hit: g.rows.filter((r) => _wlCoincide(r, _wlBusca)) }))
    .filter((g) => g.hit.length);
  const total = _waitlistCache.length;
  const enCorte = delChip.reduce((a, g) => a + g.rows.length, 0);

  if (summary) {
    const etq = { activos: 'Activos', archivo: 'Archivo', todos: 'Total' };
    summary.textContent = _wlBusca
      ? `${eventos.reduce((a, g) => a + g.hit.length, 0)} de ${enCorte} personas · ${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'}`
      : `${etq[_wlFiltro]}: ${enCorte} ${enCorte === 1 ? 'persona' : 'personas'} en ${delChip.length} ${delChip.length === 1 ? 'evento' : 'eventos'}` +
        (_wlFiltro === 'activos' && nArch ? ` · ${nArch} archivadas` : '');
  }

  if (_wlBusca && !eventos.length) {
    // Una lista vacía es una afirmación: se dice cuántos hay del otro lado.
    groups.innerHTML = '<div class="empty-state" style="padding:34px;text-align:center;color:var(--ts);border:1px dashed var(--border);border-radius:var(--r-sm,8px)">' +
      'Nadie dice "' + _wlEsc(_wlBusca) + '" — hay ' + enCorte + ' en este corte y ' + total + ' en total.</div>';
    return;
  }

  if (!eventos.length) {
    const dice = _wlFiltro === 'archivo'
      ? 'Nada en el archivo todavía. Un evento se archiva solo cuando TODA su gente ya fue notificada — y nada se borra.'
      : (_wlFiltro === 'activos' && nArch
        ? 'Ningún evento activo: los ' + nArch + ' registros que hay están en el archivo.'
        : 'No hay registros todavía. Cuando alguien se registre en un evento &laquo;Próximamente&raquo;, aparecerá aquí.');
    groups.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;color:var(--ts);border:1px dashed var(--border);border-radius:var(--r-sm,8px)"><div style="font-size:36px;margin-bottom:8px"><svg class="ic"><use href="#ic-campana"/></svg></div><div style="font-size:13px;letter-spacing:.06em">' + dice + '</div></div>';
    return;
  }

  groups.innerHTML = eventos.map(g => {
    const estadoSnap = _snapshotCache[g.evento_id];
    const isActivo = estadoSnap === '' || estadoSnap == null;
    // ⚠️ LOS PENDIENTES SE CUENTAN SOBRE EL GRUPO COMPLETO, NO SOBRE LO FILTRADO.
    // El botón notifica al EVENTO entero; si el número siguiera al buscador,
    // diría "Notificar a 3" y mandaría 269 correos. Filtrar cambia lo que se ve,
    // nunca lo que el botón hace.
    const pendientes = g.rows.filter(r => !r.notificado).length;
    const hit = g.hit || g.rows;
    const tagBg = estadoSnap === 'proximamente' ? 'rgba(232,255,76,.15)' : 'rgba(136,234,78,.15)';
    const tagBorder = estadoSnap === 'proximamente' ? 'rgba(232,255,76,.5)' : 'rgba(136,234,78,.5)';
    const tagColor = estadoSnap === 'proximamente' ? '#e8ff4c' : '#88ea4e';
    const tagText = estadoSnap === 'proximamente' ? 'PRÓXIMAMENTE' : (isActivo ? 'ACTIVO ✓' : (estadoSnap || '—').toUpperCase());
    const notifLabel = (pendientes > 0) ? `Notificar a ${pendientes} ahora` : 'Reenviar notificación';
    return `<div data-wl-archivado="${g.arch ? '1' : '0'}" style="background:var(--bg2,#0a0a0a);border:1px solid var(--border);border-left:4px solid ${g.arch ? 'var(--ts2)' : '#e8ff4c'};border-radius:var(--r-sm,8px);padding:18px 20px${g.arch ? ';opacity:.65' : ''}">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px">
        <div style="font-size:15px;font-weight:800;color:#fff;flex:1 1 auto"><svg class="ic"><use href="#ic-eventos"/></svg> ${_wlEsc(g.evento_nombre)}</div>
        <span style="font-size:10px;letter-spacing:.14em;padding:4px 10px;border-radius:4px;background:${g.arch ? 'rgba(255,255,255,.06)' : tagBg};border:1px solid ${g.arch ? 'var(--border)' : tagBorder};color:${g.arch ? 'var(--ts)' : tagColor};font-weight:800">${g.arch ? 'ARCHIVADO' : tagText}</span>
      </div>
      <div style="font-size:12px;color:var(--ts);margin-bottom:12px;letter-spacing:.04em">
        ${hit.length === g.rows.length
          ? `${g.rows.length} ${g.rows.length === 1 ? 'persona registrada' : 'personas registradas'}`
          : `<b style="color:var(--text)">${hit.length}</b> de ${g.rows.length} personas coinciden`}
        ${pendientes > 0 ? ` · <span style="color:#e8ff4c;font-weight:700">${pendientes} sin notificar</span>` : (g.arch ? ' · <span style="color:var(--ts)">todos notificados · archivado</span>' : ' · <span style="color:#88ea4e">todos notificados</span>')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="wlVerRegistrados('${_wlEsc(g.evento_id)}')">Ver registrados</button>
        ${g.arch
          ? `<button class="btn btn-ghost btn-sm" data-wl-volver onclick="wlVolverAActivos('${_wlEsc(g.evento_id)}')">↩ Volver a activos</button>`
          : `<button class="btn btn-primary btn-sm" onclick="wlNotificar('${_wlEsc(g.evento_id)}', ${g.rows.length}, ${pendientes})">${notifLabel}</button>`}
        ${['maestro_roshi','bulma'].includes(currentUser?.rol) ? `<button class="btn btn-ghost btn-sm" style="color:#ff6666;border-color:rgba(255,68,68,.3)" onclick="wlEliminarEvento('${_wlEsc(g.evento_id)}', ${g.rows.length})"><svg class="ic"><use href="#ic-basura"/></svg> Eliminar evento de la lista</button>` : ''}
      </div>
    </div>`;
  }).join('');
}
function _wlEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function _wlFmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      day:'2-digit', month:'short', year:'2-digit',
      hour:'2-digit', minute:'2-digit', hour12:true,
      timeZone:'America/Monterrey'
    }).format(_tsToDate(iso));
  } catch { return iso; }
}
function wlVerRegistrados(eventoId) {
  const rows = _waitlistCache.filter(r => r.evento_id === eventoId);
  const nombreEv = rows[0] ? rows[0].evento_nombre : eventoId;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `<div style="background:#0a0a1a;border:1px solid var(--border);border-radius:14px;max-width:800px;width:100%;max-height:88vh;overflow:auto;padding:0">
    <div style="position:sticky;top:0;background:#0a0a1a;padding:18px 22px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">
      <div style="flex:1 1 auto">
        <div style="font-size:10px;letter-spacing:.16em;color:var(--ts);text-transform:uppercase;margin-bottom:4px">Lista de espera</div>
        <div style="font-size:16px;font-weight:800;color:#fff">${_wlEsc(nombreEv)}</div>
        <div style="font-size:11px;color:var(--ts);margin-top:4px" id="wl-mod-conteo">${rows.length} registro${rows.length===1?'':'s'}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="wlExportarCSV('${_wlEsc(eventoId)}')">Exportar CSV</button>
      <button onclick="this.closest('[data-wl-overlay]').remove()" style="background:rgba(255,255,255,.1);border:none;color:#fff;font-size:18px;width:32px;height:32px;border-radius:50%;cursor:pointer">✕</button>
    </div>
    <!-- [HER-1f] El buscador DENTRO del modal. Aquí es donde de verdad duele:
         badbunny solo tiene 269 filas en esta tabla. -->
    <div style="padding:12px 22px 0">
      <input type="search" id="wl-mod-buscar" class="cot-input" placeholder="Buscar por nombre o correo…"
             autocomplete="off" oninput="_wlModBuscar()" aria-label="Buscar en los registrados"
             style="width:100%;font-size:13px">
    </div>
    <div style="padding:0">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:rgba(255,255,255,.04);border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:10px 16px;font-size:10px;color:var(--ts);letter-spacing:.12em;text-transform:uppercase">Nombre</th>
          <th style="text-align:left;padding:10px 16px;font-size:10px;color:var(--ts);letter-spacing:.12em;text-transform:uppercase">Email</th>
          <th style="text-align:left;padding:10px 16px;font-size:10px;color:var(--ts);letter-spacing:.12em;text-transform:uppercase">Registro</th>
          <th style="text-align:center;padding:10px 16px;font-size:10px;color:var(--ts);letter-spacing:.12em;text-transform:uppercase">Notificado</th>
        </tr></thead>
        <tbody id="wl-mod-tbody">
          ${rows.map(r => `<tr style="border-bottom:1px solid rgba(255,255,255,.06)">
            <td style="padding:10px 16px;color:#fff;font-weight:600">${_wlEsc(r.nombre)}</td>
            <td style="padding:10px 16px;color:rgba(255,255,255,.75)"><a href="mailto:${_wlEsc(r.email)}" style="color:inherit;text-decoration:none">${_wlEsc(r.email)}</a></td>
            <td style="padding:10px 16px;color:rgba(255,255,255,.6);font-size:11px">${_wlFmtDate(r.created_at)}</td>
            <td style="padding:10px 16px;text-align:center">${r.notificado ? '<span style="color:#88ea4e">✓</span>' : '<span style="color:rgba(255,255,255,.3)">✗</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
  overlay.setAttribute('data-wl-overlay', '1');
  overlay.dataset.wlEvento = eventoId;
  document.body.appendChild(overlay);
}
// [HER-1f] Re-pinta las filas del modal con el texto tecleado. Vive del caché,
// como todo lo demás: no le pide nada al servidor.
function _wlModBuscar() {
  const ov = document.querySelector('[data-wl-overlay]');
  if (!ov) return;
  const q = (document.getElementById('wl-mod-buscar')?.value || '').trim().toLowerCase();
  const rows = _waitlistCache.filter(r => r.evento_id === ov.dataset.wlEvento);
  const vis = rows.filter(r => !q ||
    (String(r.nombre || '') + ' ' + String(r.email || '')).toLowerCase().includes(q));
  const tb = document.getElementById('wl-mod-tbody');
  const cn = document.getElementById('wl-mod-conteo');
  if (cn) cn.textContent = q
    ? (vis.length + ' de ' + rows.length + ' registros')
    : (rows.length + ' registro' + (rows.length === 1 ? '' : 's'));
  if (!tb) return;
  if (!vis.length) {
    tb.innerHTML = '<tr><td colspan="4" style="padding:26px;text-align:center;color:var(--ts);font-size:12px">' +
      'Nadie dice "' + _wlEsc(q) + '" — hay ' + rows.length + ' en esta lista.</td></tr>';
    return;
  }
  tb.innerHTML = vis.map(r => `<tr style="border-bottom:1px solid rgba(255,255,255,.06)">
    <td style="padding:10px 16px;color:#fff;font-weight:600">${_wlEsc(r.nombre)}</td>
    <td style="padding:10px 16px;color:rgba(255,255,255,.75)"><a href="mailto:${_wlEsc(r.email)}" style="color:inherit;text-decoration:none">${_wlEsc(r.email)}</a></td>
    <td style="padding:10px 16px;color:rgba(255,255,255,.6);font-size:11px">${_wlFmtDate(r.created_at)}</td>
    <td style="padding:10px 16px;text-align:center">${r.notificado ? '<span style="color:#88ea4e">✓</span>' : '<span style="color:rgba(255,255,255,.3)">✗</span>'}</td>
  </tr>`).join('');
}
function wlExportarCSV(eventoId) {
  const rows = _waitlistCache.filter(r => r.evento_id === eventoId);
  if (!rows.length) return;
  const header = ['Nombre','Email','Fecha registro','Notificado','Notificado at'];
  const lines = [header.join(',')].concat(rows.map(r => [
    JSON.stringify(r.nombre || ''),
    JSON.stringify(r.email || ''),
    JSON.stringify(r.created_at || ''),
    r.notificado ? '1' : '0',
    JSON.stringify(r.notificado_at || ''),
  ].join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `waitlist-${eventoId}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}
async function wlEliminarEvento(eventoId, total) {
  // Defensa en profundidad: el botón ya está gated, pero un usuario podría
  // invocar la función desde la consola — re-chequeamos el rol.
  if (!['maestro_roshi','bulma'].includes(currentUser?.rol)) {
    alert('No tienes permisos para eliminar eventos de la lista de espera.');
    return;
  }
  const grupo = _waitlistCache.find(r => r.evento_id === eventoId);
  const nombreEv = grupo ? grupo.evento_nombre : eventoId;
  if (!confirm(`¿Eliminar a las ${total} personas registradas para "${nombreEv}"? Esta acción no se puede deshacer.`)) return;

  try {
    // RLS de eventos_waitlist no expone DELETE al anon key — pasamos por la
    // Netlify Function que tiene service key. khAdminFetch adjunta el JWT admin
    // (Authorization: Bearer) que verifyAdminAuth valida en el backend.
    const r = await khAdminFetch('/.netlify/functions/waitlist-delete', {
      method: 'POST',
      body: JSON.stringify({ evento_id: eventoId }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || ('HTTP ' + r.status));
    alert(`Eliminados ${d.deleted ?? total} registros de "${nombreEv}".`);
    loadWaitlist();
  } catch (e) {
    alert('No se pudo eliminar: ' + e.message);
  }
}
async function wlNotificar(eventoId, totalRegs, pendientes) {
  // Abre el modal de configuración. El admin puede elegir mandar correo normal
  // o incluir un código de descuento exclusivo (bloque amarillo en el email).
  const params = await wlAbrirModalNotif(eventoId, totalRegs, pendientes);
  if (!params) return; // cancelado

  // Si es reenvío, primero reset notificado=false para los que ya fueron notificados.
  if (pendientes === 0 && totalRegs > 0) {
    try {
      await khWaitlist.resetNotificado(eventoId); // [sec-radar-wl]
    } catch (e) { alert('No se pudo resetear el flag: ' + e.message); return; }
  }

  // Disparar la función. Si hay código, viaja en el body.
  const payload = { evento_id: eventoId };
  if (params.codigo) {
    payload.codigo = params.codigo;
    payload.descuento = params.descuento;
    payload.horas = params.horas;
  }
  try {
    // [WL-2] Va a `admin-waitlist-notify`, NO a `waitlist-notify`: esa segunda
    // es función PROGRAMADA y Netlify bloquea su HTTP antes de que el handler
    // corra — el botón devolvía 403 de plataforma, no del código. La puerta real
    // llama al MISMO núcleo (_lib/waitlist-core), así que el correo no cambia.
    // POST con body JSON, familia admin-*: el header Origin viaja y corsCheck pasa.
    const r = await khAdminFetch('/.netlify/functions/admin-waitlist-notify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) { alert('Error: ' + (d.error || r.status)); return; }
    const suffix = params.codigo ? ` (con código ${params.codigo} · ${params.descuento}% · ${params.horas}h)` : '';
    alert(`Enviados ${d.sent || 0} de ${d.total || 0} emails${suffix}.`);
    loadWaitlist();
  } catch (e) {
    alert('Error de red: ' + e.message);
  }
}
// ── Modal de configuración de notificación ──────────────────
// Resuelve a `{codigo, descuento, horas}` o `null` si el admin cancela.
// Si el checkbox NO está marcado, los 3 campos llegan vacíos y se manda
// el email sin la sección de código.
function wlAbrirModalNotif(eventoId, totalRegs, pendientes) {
  return new Promise(resolve => {
    const modal = document.getElementById('modal-wl-notif');
    const $cb   = document.getElementById('wl-notif-usar-codigo');
    const $box  = document.getElementById('wl-notif-codigo-fields');
    const $cod  = document.getElementById('wl-notif-codigo');
    const $desc = document.getElementById('wl-notif-descuento');
    const $hrs  = document.getElementById('wl-notif-horas');
    const $err  = document.getElementById('wl-notif-error');
    const $okBtn   = document.getElementById('wl-notif-submit');
    const $cancel  = document.getElementById('wl-notif-cancel');
    const $closeX  = document.getElementById('wl-notif-close');
    const $evName  = document.getElementById('wl-notif-evento');
    const $target  = document.getElementById('wl-notif-target');

    // Resolver nombre del evento desde el cache de waitlist (_waitlistCache lo
    // tiene poblado por loadWaitlist; cada row trae evento_nombre).
    let evNombre = eventoId;
    try {
      if (typeof _waitlistCache !== 'undefined') {
        const row = (_waitlistCache || []).find(r => r.evento_id === eventoId);
        if (row && row.evento_nombre) evNombre = row.evento_nombre;
      }
    } catch {}
    $evName.textContent = evNombre;
    const target = pendientes > 0 ? pendientes : totalRegs;
    const verbo  = pendientes > 0 ? 'mandar email a' : 'reenviar email a';
    $target.textContent = `Vas a ${verbo} ${target} ${target === 1 ? 'persona' : 'personas'} registradas.`;

    // Reset estado
    $cb.checked = false;
    $box.style.display = 'none';
    $cod.value = '';
    $desc.value = '';
    $hrs.value = '24';
    $err.style.display = 'none';
    $err.textContent = '';

    // Wire (idempotente: reemplazamos handlers cada vez para evitar leaks)
    function cleanup() {
      modal.classList.remove('open');
      $cb.removeEventListener('change', onToggle);
      $okBtn.removeEventListener('click', onOk);
      $cancel.removeEventListener('click', onCancel);
      $closeX.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
    }
    function onToggle() {
      $box.style.display = $cb.checked ? 'block' : 'none';
      $err.style.display = 'none';
      if ($cb.checked) setTimeout(() => $cod.focus(), 50);
    }
    function onCancel() { cleanup(); resolve(null); }
    function onBackdrop(e) { if (e.target === modal) onCancel(); }
    function onKey(e) { if (e.key === 'Escape') onCancel(); }
    function onOk() {
      if (!$cb.checked) { cleanup(); resolve({ codigo: '', descuento: 0, horas: 0 }); return; }
      const cod = ($cod.value || '').trim().toUpperCase();
      const desc = parseInt($desc.value, 10);
      const hrs  = parseInt($hrs.value, 10) || 24;
      if (!cod || !/^[A-Z0-9_-]{2,24}$/.test(cod)) {
        $err.textContent = 'Código inválido: solo letras, números, _ o − (2-24 chars).';
        $err.style.display = 'block'; $cod.focus(); return;
      }
      if (!Number.isFinite(desc) || desc < 1 || desc > 99) {
        $err.textContent = 'Descuento debe ser entre 1 y 99.';
        $err.style.display = 'block'; $desc.focus(); return;
      }
      if (!Number.isFinite(hrs) || hrs < 1 || hrs > 168) {
        $err.textContent = 'Horas debe ser entre 1 y 168.';
        $err.style.display = 'block'; $hrs.focus(); return;
      }
      cleanup();
      resolve({ codigo: cod, descuento: desc, horas: hrs });
    }
    $cb.addEventListener('change', onToggle);
    $okBtn.addEventListener('click', onOk);
    $cancel.addEventListener('click', onCancel);
    $closeX.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);

    modal.classList.add('open');
  });
}