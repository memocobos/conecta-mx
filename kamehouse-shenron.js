// =============================================================================
// kamehouse-shenron.js — 🐉 SHENRON · el mensajero de Memo (SHENRON-1, 21-oct-2026)
//
// «El dragón que concede deseos»: Memo escribe el mensaje y elige a quién —
// equipo, creadoras vigentes o los viajeros de un evento. La pluma es SOLO de
// maestro_roshi (PERMISOS_TABS) y el candado real vive en el servidor
// (admin-shenron): seco por default, mandar exige dos gestos, tandas de 30.
//
// 🔒 La pantalla NO manda nada por su cuenta: primero se INVOCA (vista previa
// con la lista y el correo renderizado) y solo después, con confirm, se
// concede el deseo — tanda por tanda, con freno. Sin bitácora a propósito
// (dicho en el aviso): para campañas masivas con dedup/energía está GENKIDAMA.
// =============================================================================
/* global khAdminFetch, showToast, _fetchEVFromIndex */

let _shFreno = false;
let _shSeco = null;   // la última invocación (para enviar exactamente eso)

function _shEsc(s) { const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
async function _shApi(body) {
  const r = await khAdminFetch('/.netlify/functions/admin-shenron', { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { st: r.status, j };
}
function _shEl(id) { return document.getElementById(id); }

async function loadShenron() {
  // El selector de eventos se llena del EV servido (la misma fuente que el
  // sitio), ordenado por fecha — próximos primero, pasados después.
  const sel = _shEl('sh-evento');
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
        lista.map((e) => `<option value="${_shEsc(e.id)}">${_shEsc(e.a)}${e.ds ? ' · ' + _shEsc(e.ds) : ''}</option>`).join('');
    } catch (e) {
      sel.innerHTML = '<option value="">(no se pudo leer el catálogo)</option>';
    }
  }
  shAudienciaCambia();
}

// UN selector, una voz: lo elegido decide qué controles se enseñan.
function shAudienciaCambia() {
  const a = (_shEl('sh-aud') || {}).value || '';
  const roles = _shEl('sh-roles-wrap'), evento = _shEl('sh-evento-wrap');
  if (roles) roles.style.display = a === 'equipo' ? '' : 'none';
  if (evento) evento.style.display = a === 'evento' ? '' : 'none';
  // Cambiar la audiencia INVALIDA la invocación anterior: lo que se manda es
  // exactamente lo que se enseñó, nunca una mezcla.
  _shSeco = null;
  const res = _shEl('sh-resultado');
  if (res) res.innerHTML = '';
}

function _shPayloadBase() {
  const a = (_shEl('sh-aud') || {}).value || '';
  const asunto = ((_shEl('sh-asunto') || {}).value || '').trim();
  const mensaje = ((_shEl('sh-mensaje') || {}).value || '').trim();
  const p = { audiencia: a, asunto, mensaje };
  if (a === 'equipo') {
    const roles = [...document.querySelectorAll('.sh-rol:checked')].map((x) => x.value);
    if (roles.length) p.roles = roles;
  }
  if (a === 'evento') p.evento_id = (_shEl('sh-evento') || {}).value || '';
  return p;
}

// ── INVOCAR: la vista previa (seco) ─────────────────────────────────────────
async function shInvocar() {
  const res = _shEl('sh-resultado');
  const p = _shPayloadBase();
  if (!p.audiencia) { showToast('Elige la audiencia primero', 'error'); return; }
  if (p.audiencia === 'evento' && !p.evento_id) { showToast('Elige el evento', 'error'); return; }
  if (res) res.innerHTML = '<div class="loading-state"><div class="spinner"></div>Invocando a Shenron…</div>';
  const { st, j } = await _shApi(p);
  if (st !== 200 || !j.ok) {
    _shSeco = null;
    if (res) res.innerHTML = `<div class="err-box">${_shEsc(j.error || ('HTTP ' + st))}</div>`;
    return;
  }
  _shSeco = { payload: p, total: j.total, tanda: j.tanda };
  const grandes = j.total > 150 && p.audiencia === 'evento';
  if (res) res.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-left:4px solid var(--green);border-radius:var(--r-sm,8px);padding:16px 18px;margin-top:14px">
      <div style="font-size:13px;font-weight:800;margin-bottom:8px">🐉 Shenron escuchó tu deseo: <b>${j.total}</b> destinatario${j.total === 1 ? '' : 's'}</div>
      ${grandes ? '<div style="font-size:11px;color:#ffb020;margin-bottom:8px">⚠️ Audiencia grande. Shenron no lleva bitácora: si repites el envío, les llega doble. Para campañas masivas con dedup y energía usa GENKIDAMA.</div>' : ''}
      <div style="max-height:180px;overflow:auto;font-size:11px;color:var(--ts);line-height:1.8;border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:10px">
        ${(j.audiencia || []).map((u) => `<div><b style="color:var(--text)">${_shEsc(u.nombre || '—')}</b> · ${_shEsc(u.correo)}</div>`).join('')}
        ${j.total > (j.audiencia || []).length ? `<div>… y ${j.total - j.audiencia.length} más</div>` : ''}
      </div>
      <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ts);margin-bottom:6px">Así se ve el correo</div>
      <iframe sandbox="" style="width:100%;height:300px;border:1px solid var(--border);border-radius:6px;background:#fff" srcdoc="${_shEsc(j.html_muestra)}"></iframe>
      <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-primary" id="sh-conceder" onclick="shConceder()">✨ Conceder el deseo — enviar a ${j.total}</button>
        <button class="btn btn-ghost btn-sm" onclick="_shFreno=true" title="Detiene las tandas que falten">✋ Freno</button>
        <span id="sh-progreso" style="font-size:12px;color:var(--ts)"></span>
      </div>
      <div id="sh-errores" style="margin-top:8px;font-size:11px;color:var(--red)"></div>
    </div>`;
}

// ── CONCEDER: las tandas (30 por llamada, el patrón del blast) ──────────────
async function shConceder() {
  if (!_shSeco) { showToast('Primero invoca la vista previa', 'error'); return; }
  const { payload, total } = _shSeco;
  if (!confirm(`¿Mandar este correo a ${total} persona${total === 1 ? '' : 's'}? Sale DE VERDAD desde el correo del sistema y no se puede deshacer.`)) return;
  _shFreno = false;
  const btn = _shEl('sh-conceder'), prog = _shEl('sh-progreso'), errBox = _shEl('sh-errores');
  if (btn) { btn.disabled = true; btn.textContent = 'Concediendo…'; }
  let desde = 0, enviados = 0;
  const errores = [];
  try {
    while (desde !== null) {
      if (_shFreno) { if (prog) prog.textContent = `✋ Frenado en ${enviados} de ${total}.`; break; }
      const { st, j } = await _shApi({ ...payload, seco: false, confirmar: true, desde });
      if (st !== 200 || !j.ok) { errores.push({ correo: `tanda desde=${desde}`, error: j.error || ('HTTP ' + st) }); break; }
      enviados += j.enviados || 0;
      (j.errores || []).forEach((e) => errores.push(e));
      desde = j.siguiente;
      if (prog) prog.textContent = `Enviados ${enviados} de ${j.total}…`;
    }
    if (desde === null && !_shFreno) {
      if (prog) prog.textContent = `✅ Deseo concedido: ${enviados} de ${total} enviados.`;
      showToast(`Shenron entregó ${enviados} correo${enviados === 1 ? '' : 's'}`, 'success');
      if (btn) btn.textContent = 'Deseo concedido';
    } else if (btn) { btn.disabled = false; btn.textContent = `✨ Conceder el deseo — enviar a ${total}`; }
  } finally {
    if (errBox && errores.length) {
      errBox.innerHTML = '<b>' + errores.length + ' con error:</b> ' + errores.map((e) => _shEsc(e.correo) + ' (' + _shEsc(e.error) + ')').join(' · ');
    }
  }
}
