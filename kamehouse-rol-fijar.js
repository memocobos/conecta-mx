/* =============================================================================
 * kamehouse-rol-fijar.js — el trabajo «🗓 Rol por fijar» de la bandeja de
 * Requisiciones. [ROL-AVISOS-1 · 4-nov] + [ROL-2027-1 · 13-nov-2026].
 *
 * Lista a quien YA está publicado en el Portal, no tiene rol fijo, debe algo y
 * su evento viene: hoy su Portal le dice «Estamos preparando tu calendario».
 *
 * [ROL-2027-1] Palabra de Memo: «TODOS LOS TOURS 2027 QUE SE SEPAREN, EL DÍA QUE
 * HAGAMOS REGISTRO ES EL DÍA QUE SE CUENTA PARA SU ROL DE PAGOS … PARA NO ESTAR
 * METIENDO UNO POR UNO MANUAL». Los que se registran o publican desde hoy ya
 * nacen con su rol (el servidor: `_lib/rol-auto`); aquí queda:
 *   · «⚡ Fijar los N de una vez» → los de tours 2027 que ya estaban publicados;
 *   · por fila, «⚡ Fijar desde hoy» (un clic, la propuesta viene escrita) o
 *     «con su fecha de separo real» (lo normal en un tour 2026 del Excel).
 * 🔒 La pantalla no arma una quincena: la propuesta y el rol los manda el
 * servidor (plan-fijo, el dueño). Aquí solo se elige y se pide.
 *
 * Endpoints (admin-coordi-asignaciones): plan_pendientes (solo LEE) ·
 * rol_auto_fijar · plan_fijar. El ensayo de recordatorios vive plegado al final.
 * ========================================================================== */

let _rfRows = [];
const _rfEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _rfMxn = (n) => (n == null || n === '') ? '—' : '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');

function _rfCaja() {
  let box = document.getElementById('req-rol-fijar');
  if (!box) {
    const lista = document.getElementById('req-bdj-lista');
    if (!lista) return null;
    box = document.createElement('div'); box.id = 'req-rol-fijar';
    const ancla = document.getElementById('req-portal') || document.getElementById('req-cambios') || lista;
    ancla.parentNode.insertBefore(box, ancla);
  }
  return box;
}
function _rfSecH(n) {
  const t = '🗓 Rol de pagos por fijar';
  const q = 'Ya ven su viaje en el Portal, pero su calendario dice «Estamos preparando». Los tours 2027 nacen con su rol al registrarlos o publicarlos; aquí queda lo que falta.';
  if (typeof _reqSecH === 'function') return _reqSecH(t, q, n);
  return `<div class="rq-section">${t}${n ? ` <span class="rq-pill pend">${n}</span>` : ''}</div><div class="rq-nota">${q}</div>`;
}
function _rfContar(n) { try { if (typeof _reqContar === 'function') _reqContar('rol', n); } catch (_) {} }

function _rfFila(p) {
  const s = p.sugerido;
  const es27 = !!p.es2027;
  const manual = `<div class="rq-linea" style="margin-top:8px">
      <label style="font-size:12px">Fecha de separo <input type="date" class="rq-in" id="rf-f-${p.viajero_id}" value="${s ? _rfEsc(s.fecha) : ''}"></label>
      <label style="font-size:12px">Separo $ <input type="number" class="rq-in" min="0" step="1" id="rf-m-${p.viajero_id}" value="${s ? Number(s.monto) : ''}" style="width:100px"></label>
      <button class="rq-btn${es27 ? '' : ' pri'}" onclick="_rfFijar('${p.viajero_id}')">🗓 Fijar con esta fecha</button>
    </div>
    <div class="rq-nota">${s ? `Sugerido: ${_rfEsc(s.origen)} (${_rfEsc(s.fecha)} · ${_rfMxn(s.monto)}). Confírmalo con su comprobante o el Excel.` : 'Sin abonos con fecha: pon la fecha y el monto de su separo.'}</div>`;
  const auto = p.auto
    ? `<div class="rq-linea" style="margin-top:8px">
        <span style="font-size:13px">Desde hoy: <b>${_rfEsc(p.auto.texto)}</b></span><span class="rq-sp"></span>
        <button class="rq-btn${es27 ? ' pri' : ''}" onclick="_rfFijarHoy('${p.viajero_id}')">⚡ Fijar desde hoy</button>
      </div>`
    : `<div class="rq-aviso ojo">Desde hoy no se puede armar: ${_rfEsc(p.auto_motivo || 'sin motivo')}</div>`;
  return `<div class="rq-cambio rf-fila" id="rf-${p.viajero_id}">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
      <div class="rq-name">${_rfEsc(p.nombre || 'Sin nombre')}</div>
      <span class="rq-tag">${es27 ? '⚡ tour 2027' : 'tour 2026 · del Excel'}</span>
    </div>
    <div class="rq-ev">${_rfEsc(p.evento)}${p.fecha ? ' · ' + _rfEsc(p.fecha) : ''}${p.paquete ? ' · ' + _rfEsc(String(p.paquete).toUpperCase()) : ''} · total ${_rfMxn(p.total)} · pagado ${_rfMxn(p.abonado)} · <b>falta ${_rfMxn(p.resta)}</b></div>
    ${es27
      ? auto + `<details style="margin-top:6px"><summary class="rq-nota" style="cursor:pointer">…o con su fecha de separo real</summary>${manual}</details>`
      : `<div class="rq-nota" style="margin-top:6px">Viene del Excel: lo normal es ponerle su fecha de separo real (su calendario empezó entonces).</div>${manual}${auto}`}
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
  _rfEnsayoCaja();
  if (!j || !j.ok) {
    box.innerHTML = _rfSecH(0) + `<div class="rq-aviso mal">No se pudo leer quién falta de fijar su rol: ${_rfEsc((j && j.error) || 'sin respuesta')}</div>`;
    _rfContar(-1);
    return;
  }
  _rfRows = j.pendientes || [];
  const n27 = _rfRows.filter((p) => p.es2027 && p.auto).length;
  const sinFecha = Number(j.sin_fecha) || 0;
  const notaSinFecha = sinFecha ? `<div class="rq-nota">${sinFecha} viaje${sinFecha === 1 ? '' : 's'} de un evento que aún no tiene fecha en el catálogo: su rol se arma cuando la tenga.</div>` : '';
  if (!_rfRows.length) {
    box.innerHTML = _rfSecH(0) + '<div class="rq-aldia">✓ Todos los que ya ven su viaje tienen su rol de pagos.</div>' + notaSinFecha;
    _rfContar(0);
    return;
  }
  const todos = n27 >= 2
    ? `<div class="rq-aviso ok"><div class="rq-linea"><span><b>⚡ ${n27} son de tours 2027.</b> Su rol cuenta desde HOY: lo que les falta, parejo en las quincenas que quedan.</span><span class="rq-sp"></span>
        <button class="rq-btn pri" onclick="_rfFijarHoyTodos(${n27})">Fijar los ${n27} de una vez</button></div></div>`
    : '';
  box.innerHTML = _rfSecH(_rfRows.length) + todos + _rfRows.map(_rfFila).join('') + notaSinFecha;
  _rfContar(_rfRows.length);
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

// [ROL-2027-1] «⚡ Fijar desde hoy» para UNA persona (del año que sea: la eligió
// un humano). El rol lo arma el servidor: hoy + lo que lleva pagado.
async function _rfFijarHoy(id) {
  const p = _rfRows.find((x) => x.viajero_id === id);
  try {
    const j = await khViajeros.rolAutoFijar([id], true);
    const f = j && (j.fijados || [])[0];
    if (!f) throw new Error(((j && (j.saltados || [])[0]) || {}).motivo || (j && j.error) || 'No se pudo fijar');
    showToast('✓ Rol fijo desde hoy' + (p && p.nombre ? ' · ' + p.nombre : '') + ' · ' + f.texto, 'success');
    loadRolPendientes();
  } catch (e) { showToast('No se pudo fijar el rol: ' + ((e && e.message) || ''), 'error'); }
}

// [ROL-2027-1] La regla, de un clic: TODOS los ya publicados de tours 2027.
// (Sin ids el servidor toma solo esos; los de 2026 no se tocan.)
async function _rfFijarHoyTodos(n) {
  if (!confirm(`¿Fijar el rol de pagos de ${n} viajeros de tours 2027 contando desde hoy?\n\nCada quien verá su calendario en su Portal y le llegarán sus recordatorios en esas fechas. Un rol fijo ya no se mueve solo.`)) return;
  try {
    const j = await khViajeros.rolAutoFijar(null, true);
    const ok = (j && j.fijados || []).length, no = (j && j.saltados || []).length;
    showToast(`✓ ${ok} con su rol fijo desde hoy` + (no ? ` · ${no} no se pudieron (${((j.saltados[0] || {}).motivo) || 'sin motivo'})` : '') + (j && j.faltan ? ` · faltan ${j.faltan}: vuelve a apretar` : ''), no ? 'warning' : 'success');
    loadRolPendientes();
  } catch (e) { showToast('No se pudo fijar: ' + ((e && e.message) || ''), 'error'); }
}

// [ROL-AVISOS-1] El ensayo EN SECO de los recordatorios: a quién le tocaría el
// correo ese día y cómo se ve. [REQ-SIMPLE-1] Vive plegado al final de la
// bandeja (antes iba arriba de todo, siempre a la vista).
function _rfEnsayoCaja() {
  const ext = (typeof _prvExtra === 'function') ? _prvExtra('req-extras-ens') : null;
  if (!ext || ext.dataset.listo) return;
  ext.dataset.listo = '1';
  ext.innerHTML = `<details style="margin:0 0 10px"><summary style="cursor:pointer;font-size:12px;color:var(--ts)">📨 Recordatorios del rol de pagos · ensayo (no manda nada)</summary>
    <div style="font-size:12px;color:var(--ts);margin:8px 0">Elige un día y mira a quién le llegaría el correo y cómo se ve:
      <input type="date" id="rf-ens-dia" style="font-size:12px"> <button class="btn btn-sm" onclick="_rfEnsayo()">👁 Ver el ensayo</button>
      <div id="rf-ens-out"></div></div></details>`;
}
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
