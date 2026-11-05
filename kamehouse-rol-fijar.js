/* =============================================================================
 * kamehouse-rol-fijar.js — [ROL-AVISOS-1] la tarjeta «🗓 Fijar rol de pagos»
 * en la bandeja de Requisiciones (4-nov-2026).
 *
 * Palabra de Memo: «ponme en alertas o requisiciones los que vienen de los tours
 * viejos para poner su fecha de separo y les aparezca su rol». Lista a quien YA
 * está publicado en el Portal, no tiene rol fijo, debe algo y su evento viene.
 * Hoy en su Portal dice «Estamos preparando tu calendario». La fecha y el monto
 * del separo vienen SUGERIDOS (su primer abono registrado) y un humano los
 * confirma. Quien se registre en el Portal y se publique entra solo.
 *
 * Endpoint: admin-coordi-asignaciones · plan_pendientes (solo LEE) y
 * plan_fijar (el dueño de siempre). Se calla en cero.
 * ========================================================================== */

let _rfRows = [];
const _rfEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _rfMxn = (n) => (n == null || n === '') ? '—' : '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');

function _rfCaja() {
  const lista = document.getElementById('req-bdj-lista');
  if (!lista) return null;
  let box = document.getElementById('req-rol-fijar');
  if (!box) {
    box = document.createElement('div'); box.id = 'req-rol-fijar';
    const ancla = document.getElementById('req-portal') || document.getElementById('req-cambios') || lista;
    ancla.parentNode.insertBefore(box, ancla);
  }
  return box;
}

function _rfFila(p) {
  const s = p.sugerido;
  const sug = s ? `<div style="font-size:11px;color:var(--ts);margin-top:4px">Sugerido: ${_rfEsc(s.origen)} (${_rfEsc(s.fecha)} · ${_rfMxn(s.monto)}). Confírmalo con su comprobante.</div>`
    : `<div style="font-size:11px;color:var(--ts);margin-top:4px">Sin abonos con fecha: pon la fecha y el monto de su separo.</div>`;
  return `<div class="rf-fila" id="rf-${p.viajero_id}" style="border-top:1px solid var(--border);padding:10px 0">
    <div style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline">
      <b>${_rfEsc(p.nombre || 'Sin nombre')}</b>
      <span style="font-size:12px;color:var(--ts)">${_rfEsc(p.evento)}${p.fecha ? ' · ' + _rfEsc(p.fecha) : ''}${p.paquete ? ' · ' + _rfEsc(String(p.paquete).toUpperCase()) : ''}</span>
      <span style="font-size:12px">Total ${_rfMxn(p.total)} · pagado ${_rfMxn(p.abonado)} · <b>falta ${_rfMxn(p.resta)}</b></span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px">
      <label style="font-size:12px">Fecha de separo <input type="date" id="rf-f-${p.viajero_id}" value="${s ? _rfEsc(s.fecha) : ''}"></label>
      <label style="font-size:12px">Separo $ <input type="number" min="0" step="1" id="rf-m-${p.viajero_id}" value="${s ? Number(s.monto) : ''}" style="width:90px"></label>
      <button class="btn btn-sm btn-primary" onclick="_rfFijar('${p.viajero_id}')">🗓 Fijar su rol</button>
    </div>${sug}
  </div>`;
}

async function loadRolPendientes() {
  const box = _rfCaja();
  if (!box) return;
  let j;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-coordi-asignaciones', { method: 'POST', body: JSON.stringify({ accion: 'plan_pendientes' }) });
    j = await r.json().catch(() => ({}));
    if (!r.ok && !j.error) j.error = 'HTTP ' + r.status;
  } catch (e) { j = { error: e.message }; }
  if (!j || !j.ok) {
    box.innerHTML = `<div style="color:var(--red);font-size:12px;margin-bottom:10px">No se pudo leer quién falta de fijar su rol: ${_rfEsc((j && j.error) || 'sin respuesta')}</div>`;
    return;
  }
  _rfRows = j.pendientes || [];
  // El ensayo de los recordatorios del rol fijo vive siempre a la vista (en seco).
  const ens = `<div style="font-size:12px;color:var(--ts);margin:0 0 12px">📨 Recordatorios del rol fijo:
      <input type="date" id="rf-ens-dia" style="font-size:12px"> <button class="btn btn-sm" onclick="_rfEnsayo()">👁 Ensayo (no manda nada)</button>
      <div id="rf-ens-out"></div></div>`;
  if (!_rfRows.length) { box.innerHTML = ens; return; }
  box.innerHTML = ens + `<details open style="margin:0 0 14px">
    <summary class="rq-section" style="cursor:pointer">🗓 Fijar rol de pagos <span class="rq-pill pend">${_rfRows.length}</span></summary>
    <div style="font-size:12px;color:var(--ts);margin:-2px 0 6px">Ya ven su viaje en el Portal pero su calendario dice «Estamos preparando». Pon la fecha de su separo y su rol queda FIJO (las quincenas de siempre desde esa fecha).</div>
    ${_rfRows.map(_rfFila).join('')}
  </details>`;
}

async function _rfFijar(id) {
  const p = _rfRows.find((x) => x.viajero_id === id);
  const f = (document.getElementById('rf-f-' + id) || {}).value || '';
  const mRaw = (document.getElementById('rf-m-' + id) || {}).value;
  const m = Number(mRaw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) { showToast('Pon la fecha de separo', 'error'); return; }
  if (mRaw === '' || !Number.isFinite(m) || m < 0) { showToast('Pon el monto del separo (0 si no dio separo)', 'error'); return; }
  try {
    const j = await khViajeros.planFijar(id, f, m, false);
    if (!j || !j.ok) throw new Error((j && j.error) || 'No se pudo fijar');
    showToast('✓ Rol fijo' + (p && p.nombre ? ' · ' + p.nombre : ''), 'success');
    loadRolPendientes();
  } catch (e) { showToast('No se pudo fijar el rol: ' + ((e && e.message) || ''), 'error'); }
}

// [ROL-AVISOS-1] Ensayo EN SECO: a quién le tocaría el correo ese día y cómo se ve.
async function _rfEnsayo() {
  const out = document.getElementById('rf-ens-out'); if (!out) return;
  const d = (document.getElementById('rf-ens-dia') || {}).value || '';
  out.innerHTML = '<div style="margin-top:6px">Calculando…</div>';
  let j;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-coordi-asignaciones', { method: 'POST', body: JSON.stringify({ accion: 'rol_avisos_ensayo', dia: d || undefined }) });
    j = await r.json().catch(() => ({}));
    if (!r.ok && !j.error) j.error = 'HTTP ' + r.status;
  } catch (e) { j = { error: e.message }; }
  if (!j || !j.ok) { out.innerHTML = `<div style="color:var(--red);margin-top:6px">${_rfEsc((j && j.error) || 'sin respuesta')}</div>`; return; }
  const tipos = { apertura: 'abre su ventana', vence_hoy: 'último día', vencido: 'quedó vencido', antes_evento: 'liquidar antes del evento' };
  const pt = Object.keys(j.por_tipo || {}).map((k) => `${tipos[k] || k}: ${j.por_tipo[k]}`).join(' · ') || 'nadie';
  const filas = (j.muestra || []).map((m) => `<div style="border-top:1px solid var(--border);padding:4px 0">${_rfEsc(m.correo)} — ${_rfEsc(m.asunto)}<br><span style="opacity:.75">${m.viajes.map((v) => `${_rfEsc(v.nombre)} · pago ${v.cuota} (${_rfEsc(v.lbl)}) ${_rfMxn(v.falta)}`).join(' / ')}</span></div>`).join('');
  const prim = (j.muestra || []).find((m) => m.html);
  out.innerHTML = `<div style="margin-top:6px"><b>${_rfEsc(j.dia)}</b> · ${j.vivo ? '🟢 ENCENDIDO' : '⚪ APAGADO (no sale nada hasta la palabra de Memo)'} · ${j.correos} correo(s) · ${_rfEsc(pt)}</div>${filas}`
    + (prim ? `<iframe style="width:100%;max-width:560px;height:520px;border:1px solid var(--border);margin-top:8px;background:#000" srcdoc="${_rfEsc(prim.html)}"></iframe>` : '');
}
