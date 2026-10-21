// =============================================================================
// kamehouse-emma.js — EMMA KAIOSAMA · el correo del sistema (EMMA-1, 21-oct-2026)
//
// El juez que despacha: Memo escribe el mensaje y elige a quién —
// equipo, creadoras vigentes o los viajeros de un evento. La pluma es SOLO de
// maestro_roshi (PERMISOS_TABS) y el candado real vive en el servidor
// (admin-emma): seco por default, mandar exige dos gestos, tandas de 30.
//
// 🔒 La pantalla NO manda nada por su cuenta: primero la VISTA PREVIA (la
// lista y el correo renderizado) y solo después, con confirm, se envía —
// tanda por tanda, con botón de detener. Botones SIN nombres temáticos
// (palabra de Memo, 21-oct). Sin bitácora a propósito
// (dicho en el aviso): para campañas masivas con dedup/energía está GENKIDAMA.
// =============================================================================
/* global khAdminFetch, showToast, _fetchEVFromIndex */

let _emFreno = false;
let _emSeco = null;   // la última invocación (para enviar exactamente eso)

function _emEsc(s) { const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
async function _emApi(body) {
  const r = await khAdminFetch('/.netlify/functions/admin-emma', { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { st: r.status, j };
}
function _emEl(id) { return document.getElementById(id); }

async function loadEmma() {
  // El selector de eventos se llena del EV servido (la misma fuente que el
  // sitio), ordenado por fecha — próximos primero, pasados después.
  const sel = _emEl('em-evento');
  if (sel && sel.options.length <= 1) {
    try {
      const evArr = await _fetchEVFromIndex();
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
      const lista = (evArr || []).filter((e) => e && e.id && e.a)
        .map((e) => ({ id: e.id, a: e.a, ds: e.ds || '' }))
        .sort((x, y) => {
          const fx = x.ds >= hoy ? '0' + x.ds : '1' + (x.ds ? String(9e12 - Date.parse(x.ds)) : 'z');
          const fy = y.ds >= hoy ? '0' + y.ds : '1' + (y.ds ? String(9e12 - Date.parse(y.ds)) : 'z');
          return fx.localeCompare(fy);
        });
      sel.innerHTML = '<option value="">— elige el evento —</option>' +
        lista.map((e) => `<option value="${_emEsc(e.id)}">${_emEsc(e.a)}${e.ds ? ' · ' + _emEsc(e.ds) : ''}</option>`).join('');
    } catch (e) {
      sel.innerHTML = '<option value="">(no se pudo leer el catálogo)</option>';
    }
  }
  emAudienciaCambia();
}

// UN selector, una voz: lo elegido decide qué controles se enseñan.
function emAudienciaCambia() {
  const a = (_emEl('em-aud') || {}).value || '';
  const roles = _emEl('em-roles-wrap'), evento = _emEl('em-evento-wrap');
  if (roles) roles.style.display = a === 'equipo' ? '' : 'none';
  if (evento) evento.style.display = a === 'evento' ? '' : 'none';
  // Cambiar la audiencia INVALIDA la invocación anterior: lo que se manda es
  // exactamente lo que se enseñó, nunca una mezcla.
  _emSeco = null;
  const res = _emEl('em-resultado');
  if (res) res.innerHTML = '';
}

function _emPayloadBase() {
  const a = (_emEl('em-aud') || {}).value || '';
  const asunto = ((_emEl('em-asunto') || {}).value || '').trim();
  const mensaje = ((_emEl('em-mensaje') || {}).value || '').trim();
  const p = { audiencia: a, asunto, mensaje };
  if (a === 'equipo') {
    const roles = [...document.querySelectorAll('.em-rol:checked')].map((x) => x.value);
    if (roles.length) p.roles = roles;
  }
  if (a === 'evento') p.evento_id = (_emEl('em-evento') || {}).value || '';
  return p;
}

// ── INVOCAR: la vista previa (seco) ─────────────────────────────────────────
async function emVistaPrevia() {
  const res = _emEl('em-resultado');
  const p = _emPayloadBase();
  if (!p.audiencia) { showToast('Elige la audiencia primero', 'error'); return; }
  if (p.audiencia === 'evento' && !p.evento_id) { showToast('Elige el evento', 'error'); return; }
  if (res) res.innerHTML = '<div class="loading-state"><div class="spinner"></div>Armando la vista previa…</div>';
  const { st, j } = await _emApi(p);
  if (st !== 200 || !j.ok) {
    _emSeco = null;
    if (res) res.innerHTML = `<div class="err-box">${_emEsc(j.error || ('HTTP ' + st))}</div>`;
    return;
  }
  _emSeco = { payload: p, total: j.total, tanda: j.tanda };
  const grandes = j.total > 150 && p.audiencia === 'evento';
  if (res) res.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-left:4px solid var(--green);border-radius:var(--r-sm,8px);padding:16px 18px;margin-top:14px">
      <div style="font-size:13px;font-weight:800;margin-bottom:8px">Vista previa: <b>${j.total}</b> destinatario${j.total === 1 ? '' : 's'}</div>
      ${grandes ? '<div style="font-size:11px;color:#ffb020;margin-bottom:8px">⚠️ Audiencia grande. Emma no lleva bitácora: si repites el envío, les llega doble. Para campañas masivas con dedup y energía usa GENKIDAMA.</div>' : ''}
      <div style="max-height:180px;overflow:auto;font-size:11px;color:var(--ts);line-height:1.8;border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:10px">
        ${(j.audiencia || []).map((u) => `<div><b style="color:var(--text)">${_emEsc(u.nombre || '—')}</b> · ${_emEsc(u.correo)}</div>`).join('')}
        ${j.total > (j.audiencia || []).length ? `<div>… y ${j.total - j.audiencia.length} más</div>` : ''}
      </div>
      <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ts);margin-bottom:6px">Así se ve el correo</div>
      <iframe id="em-prev" sandbox="" style="width:100%;height:300px;border:1px solid var(--border);border-radius:6px;background:#fff"></iframe>
      <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-primary" id="em-enviar" onclick="emEnviar()">Enviar a ${j.total}</button>
        <button class="btn btn-ghost btn-sm" onclick="_emFreno=true" title="Detiene las tandas que falten">Detener</button>
        <span id="em-progreso" style="font-size:12px;color:var(--ts)"></span>
      </div>
      <div id="em-errores" style="margin-top:8px;font-size:11px;color:var(--red)"></div>
    </div>`;
  // 🔴 [EMMA-1b] El HTML del correo entra por PROPIEDAD, jamás interpolado en
  // el atributo srcdoc: _emEsc escapa <>& pero NO comillas, y el correo está
  // lleno de style="…" — la primera comilla rompía el atributo y Memo veía la
  // vista previa VACÍA. Asignar la propiedad no pasa por el parser de atributos.
  const prev = _emEl('em-prev');
  if (prev) prev.srcdoc = j.html_muestra;
}

// ── CONCEDER: las tandas (30 por llamada, el patrón del blast) ──────────────
async function emEnviar() {
  if (!_emSeco) { showToast('Primero genera la vista previa', 'error'); return; }
  const { payload, total } = _emSeco;
  if (!confirm(`¿Mandar este correo a ${total} persona${total === 1 ? '' : 's'}? Sale DE VERDAD desde el correo del sistema y no se puede deshacer.`)) return;
  _emFreno = false;
  const btn = _emEl('em-enviar'), prog = _emEl('em-progreso'), errBox = _emEl('em-errores');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  let desde = 0, enviados = 0;
  const errores = [];
  try {
    while (desde !== null) {
      if (_emFreno) { if (prog) prog.textContent = `Detenido en ${enviados} de ${total}.`; break; }
      const { st, j } = await _emApi({ ...payload, seco: false, confirmar: true, desde });
      if (st !== 200 || !j.ok) { errores.push({ correo: `tanda desde=${desde}`, error: j.error || ('HTTP ' + st) }); break; }
      enviados += j.enviados || 0;
      (j.errores || []).forEach((e) => errores.push(e));
      desde = j.siguiente;
      if (prog) prog.textContent = `Enviados ${enviados} de ${j.total}…`;
    }
    if (desde === null && !_emFreno) {
      if (prog) prog.textContent = `✅ Enviados ${enviados} de ${total}.`;
      showToast(`${enviados} correo${enviados === 1 ? '' : 's'} enviado${enviados === 1 ? '' : 's'}`, 'success');
      if (btn) btn.textContent = 'Enviado';
    } else if (btn) { btn.disabled = false; btn.textContent = `Enviar a ${total}`; }
  } finally {
    if (errBox && errores.length) {
      // [EMMA-1c] Los fallidos se pueden REINTENTAR solos (param `solo` del
      // servidor: estrecha la audiencia derivada, jamás mete a nadie nuevo).
      // Nació del primer envío real: 6 de 20 rebotaron por el límite de Resend.
      const correosFallidos = errores.map((e) => e.correo).filter((c) => /@/.test(String(c)));
      _emFallidos = correosFallidos;
      errBox.innerHTML = '<b>' + errores.length + ' con error:</b> ' + errores.map((e) => _emEsc(e.correo) + ' (' + _emEsc(e.error) + ')').join(' · ') +
        (correosFallidos.length ? ' <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="emReintentarFallidos()">↻ Reintentar los ' + correosFallidos.length + '</button>' : '');
    }
  }
}

// [EMMA-1c] Reenvía SOLO a los que fallaron (los demás ya lo recibieron y Emma
// no lleva bitácora: reenviar a todos los duplicaría).
let _emFallidos = [];
async function emReintentarFallidos() {
  if (!_emSeco || !_emFallidos.length) { showToast('No hay fallidos que reintentar', 'error'); return; }
  if (!confirm(`¿Reintentar el envío SOLO a los ${_emFallidos.length} que fallaron?`)) return;
  const prog = _emEl('em-progreso'), errBox = _emEl('em-errores');
  if (prog) prog.textContent = 'Reintentando a los fallidos…';
  const { st, j } = await _emApi({ ..._emSeco.payload, seco: false, confirmar: true, desde: 0, solo: _emFallidos });
  if (st !== 200 || !j.ok) { if (errBox) errBox.innerHTML = '<b>No se pudo:</b> ' + _emEsc(j.error || ('HTTP ' + st)); return; }
  const quedan = (j.errores || []).map((e) => e.correo);
  _emFallidos = quedan;
  if (prog) prog.textContent = `↻ Reintento: ${j.enviados} enviados${quedan.length ? ', ' + quedan.length + ' siguen fallando' : ' — todos entregados ✅'}.`;
  if (errBox) errBox.innerHTML = quedan.length
    ? '<b>' + quedan.length + ' siguen con error:</b> ' + (j.errores || []).map((e) => _emEsc(e.correo) + ' (' + _emEsc(e.error) + ')').join(' · ') +
      ' <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="emReintentarFallidos()">↻ Reintentar</button>'
    : '';
}
