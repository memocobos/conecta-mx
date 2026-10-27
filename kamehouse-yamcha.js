// =============================================================================
// kamehouse-yamcha.js — Yamcha, sacado del tronco (MONO-14)
// =============================================================================
// Mismas reglas de la serie: SOLO funciones, en el MISMO ORDEN, con su
// comentario pegado, y cero código de nivel superior.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

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
        ${t.traspasado_n ? `<div class="metric">
          <div class="metric-label">🔁 Se quedó en casa (pasó a otro tour)</div>
          <div class="metric-value" style="color:var(--baba2,#a78bfa)">${formatMXN(t.traspasado_monto)}</div>
          <div style="font-size:11px;color:var(--ts)">${t.traspasado_n} cliente(s)</div>
        </div>` : ''}
      </div>`;

    if (!filas.length) {
      // [FLUJO-UX-5] SIN ACCIÓN a propósito: un reembolso no se captura, NACE
      // de una cancelación. Un botón aquí prometería una salida que no existe.
      khVacio(lista, 'reembolsos', { nota: 'Los reembolsos nacen al cancelar una solicitud; no se capturan a mano.' });
      return;
    }

    _yamchaPintar();
  } catch (e) {
    lista.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
  }
}
// [YAMCHA-UX-1] Estado de la pantalla (lazy, regla MONO: cero código de nivel
// superior). Sobrevive a cada recarga de la lista dentro de la sesión, así que
// marcar un transferido NO te reabre el evento que habías minimizado ni te
// borra lo que buscabas.
//   q        → texto del buscador
//   cerrados → slugs minimizados A MANO
//   abiertos → slugs abiertos A MANO (le gana al auto-minimizado de «todo
//              reembolsado»: si lo abriste, se queda abierto)
function _yamchaSt() {
  if (!window.__yamcha) window.__yamcha = { q: '', cerrados: new Set(), abiertos: new Set() };
  return window.__yamcha;
}
function _yamchaNorm(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function yamchaBuscar(q) {
  _yamchaSt().q = String(q || '');
  _yamchaPintar();
}
function yamchaToggle(slug) {
  const st = _yamchaSt();
  const el = document.querySelector(`[data-yamcha-grupo="${CSS.escape(slug)}"]`);
  const estabaAbierto = el ? el.dataset.abierto === '1' : true;
  if (estabaAbierto) { st.cerrados.add(slug); st.abiertos.delete(slug); }
  else { st.cerrados.delete(slug); st.abiertos.add(slug); }
  _yamchaPintar();
}
function _yamchaPintar() {
  const lista = document.getElementById('yamcha-lista');
  if (!lista) return;
  const st = _yamchaSt();
  const filas = Array.isArray(window._yamchaRows) ? window._yamchaRows : [];
  const q = _yamchaNorm(st.q).trim();
  const casa = (rb) => !q || [rb.cliente_nombre, rb.cliente_correo, rb.datos_bancarios, rb.notas]
    .some((v) => _yamchaNorm(v).includes(q));

  // Agrupar por evento_slug (conserva el orden creado_en.desc del backend).
  // Los números del encabezado se cuentan sobre TODO el evento, no sobre lo
  // filtrado: el buscador esconde filas, no cambia cuánto se debe.
  const grupos = [];
  const idx = {};
  for (const f of filas) {
    if (!(f.evento_slug in idx)) { idx[f.evento_slug] = grupos.length; grupos.push({ slug: f.evento_slug, nombre: f.evento_nombre, rows: [], vis: [] }); }
    const g = grupos[idx[f.evento_slug]];
    g.rows.push(f);
    if (casa(f)) g.vis.push(f);
  }
  const visibles = grupos.filter((g) => g.vis.length);
  if (!visibles.length) {
    lista.innerHTML = `<div class="card" style="text-align:center;color:var(--ts);font-size:13px">Nadie coincide con «${_esfEsc(st.q)}».</div>`;
    return;
  }

  lista.innerHTML = visibles.map(g => {
      const pend = g.rows.filter((r) => r.estado === 'pendiente');
      const pendMonto = pend.reduce((s, r) => s + (Number(r.monto) || 0), 0);
      const todoListo = pend.length === 0;
      // Abierto: buscando, SIEMPRE (si no, un resultado se escondería dentro de
      // un evento minimizado). Si no: lo que diga la mano; y sin mano, un
      // evento ya reembolsado completo nace minimizado.
      const abierto = q ? true
        : st.cerrados.has(g.slug) ? false
        : st.abiertos.has(g.slug) ? true
        : !todoListo;
      const resumen = todoListo
        ? `<span style="color:#3DDC84;font-weight:700">✓ Todo resuelto</span> · ${g.rows.length} cliente(s)${g.rows.some((r) => r.estado === 'traspasado') ? ` · ${g.rows.filter((r) => r.estado === 'traspasado').length} pasaron a otro tour` : ''}`
        : `<span style="color:var(--orange);font-weight:700">${pend.length} pendiente(s) · ${formatMXN(pendMonto)}</span> · ${g.rows.length - pend.length} de ${g.rows.length} resueltos`;
      // [YAMCHA-UX-2] Palabra de Memo: pendientes ARRIBA, transferidos ABAJO,
      // siempre. Orden ESTABLE: dentro de cada bloque se conserva el orden del
      // backend (creado_en.desc), así nadie brinca de lugar al marcar a otro.
      const peso = (r) => (r.estado === 'pendiente' ? 0 : 1);
      const ordenadas = g.vis.map((r, i) => [r, i]).sort((a, b) => (peso(a[0]) - peso(b[0])) || (a[1] - b[1])).map((x) => x[0]);
      const filasHtml = ordenadas.map(rb => {
        const esPend = rb.estado === 'pendiente';
        // [YAMCHA-TRASPASO-1] Tercer estado: el dinero pasó a otro tour.
        const esTrasp = rb.estado === 'traspasado';
        const destTrasp = esTrasp ? ((String(rb.notas || '').match(/\[TRASPASO→([^\]]+)\]/) || [])[1] || '') : '';
        const badge = esPend
          ? '<span style="display:inline-block;padding:2px 8px;border-radius:var(--r-sm,8px);background:rgba(255,165,0,.15);color:var(--orange);font-size:11px;font-weight:700">pendiente</span>'
          : esTrasp
          ? `<span style="display:inline-block;padding:2px 8px;border-radius:var(--r-sm,8px);background:rgba(167,139,250,.15);color:var(--baba2,#a78bfa);font-size:11px;font-weight:700" title="No se reembolsó: su dinero pasó a otro tour">🔁 traspasado${destTrasp ? ' → ' + _esfEsc(destTrasp) : ''}</span>`
          : '<span style="display:inline-block;padding:2px 8px;border-radius:var(--r-sm,8px);background:rgba(61,220,132,.15);color:#3DDC84;font-size:11px;font-weight:700">transferido</span>';
        const accionEstado = esPend
          ? `<button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="transferirReembolso('${_esfEsc(rb.id)}')">✓ Marcar transferido</button> <button class="btn btn-ghost btn-sm" style="font-size:10px" title="El cliente no quiere su dinero: lo pasa a otro tour" onclick="traspasarReembolso('${_esfEsc(rb.id)}')">🔁 Pasar a otro tour</button>`
          : esTrasp ? ''
          : `<button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="desmarcarReembolso('${_esfEsc(rb.id)}')">↩️ Desmarcar</button>`
            + (rb.cliente_correo ? ` <button class="btn btn-ghost btn-sm" style="font-size:10px" title="Manda otra vez «Tu reembolso fue enviado». No toca el dinero." onclick="reenviarCorreoReembolso('${_esfEsc(rb.id)}')"><svg class="ic"><use href="#ic-correo"/></svg> Reenviar aviso</button>` : '');
        return `<tr>
          <td><div style="font-weight:600">${_esfEsc(rb.cliente_nombre || '—')}</div><div style="font-size:11px;color:var(--ts)">${_esfEsc(rb.cliente_correo || '')}</div></td>
          <td style="font-weight:700">${formatMXN(rb.monto)}</td>
          <td style="font-size:12px;max-width:220px;white-space:pre-wrap">${_esfEsc(rb.datos_bancarios || '—')}</td>
          <td>${badge}</td>
          <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="editarDatosReembolso('${_esfEsc(rb.id)}')"><svg class="ic"><use href="#ic-lapiz"/></svg> Datos</button> ${accionEstado}</td>
        </tr>`;
      }).join('');
      const nota = (q && g.vis.length !== g.rows.length)
        ? `<div style="font-size:11px;color:var(--ts);margin-bottom:6px">Mostrando ${g.vis.length} de ${g.rows.length} por la búsqueda.</div>` : '';
      return `<div class="card" style="margin-bottom:16px" data-yamcha-grupo="${_esfEsc(g.slug)}" data-abierto="${abierto ? '1' : '0'}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap${abierto ? ';margin-bottom:10px' : ''}">
          <button type="button" onclick="yamchaToggle('${_esfEsc(g.slug)}')" title="${abierto ? 'Minimizar' : 'Abrir'}" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;flex:1;min-width:200px">
            <span style="display:inline-block;width:14px;font-size:12px;color:var(--ts)">${abierto ? '▾' : '▸'}</span>
            <span>
              <span style="display:block;font-weight:700;font-size:15px">${_esfEsc(g.nombre || g.slug)}</span>
              <span style="display:block;font-size:12px;color:var(--ts);margin-top:2px">${resumen}</span>
            </span>
          </button>
          ${abierto && !todoListo ? `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="avisarReembolsos('${_esfEsc(g.slug)}')"><svg class="ic"><use href="#ic-correo"/></svg> Avisar a clientes</button>` : ''}
        </div>
        ${abierto ? `${nota}<div class="table-wrap"><table>
          <thead><tr><th>Cliente</th><th>Monto</th><th>Datos bancarios</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>${filasHtml}</tbody>
        </table></div>` : ''}
      </div>`;
    }).join('');
}
// [YAMCHA-TRASPASO-1] «🔁 Pasar a otro tour»: el cliente no quiere su dinero,
// lo pasa a otro evento. Se mueve su FILA con sus abonos (la caja no se mueve)
// y su contrato queda en lo cobrado (saldo 0) hasta que elija paquete con
// precio real. El servidor revalida TODO; esta pantalla solo pregunta.
function _yamchaZonasDe(ev) {
  const l = (a) => (Array.isArray(a) ? a : []).filter((z) => z && z.n).map((z) => String(z.n));
  const mf = Array.isArray(ev && ev.multifecha) ? ev.multifecha : [];
  return {
    cheap: [...new Set([...l(ev && ev.cheapZonas), ...mf.flatMap((m) => l(m.cheapZonas))])],
    plus: [...new Set([...l(ev && ev.zonas), ...mf.flatMap((m) => l(m.zonas))])],
  };
}
function _yamchaEsUnico(ev) { return !!(ev && ev.cheapOnly && _yamchaZonasDe(ev).cheap.length === 1); }
async function traspasarReembolso(id) {
  const rb = (window._yamchaRows || []).find(x => x && x.id === id);
  if (!rb) { alert('No se encontró el reembolso. Recarga e intenta de nuevo.'); return; }
  const cont = document.getElementById('modal-yamcha-transferir');
  cont.innerHTML = '<div class="modal" style="max-width:460px"><div class="modal-body"><div class="loading-state"><div class="spinner"></div>Cargando tours…</div></div></div>';
  openModal('modal-yamcha-transferir');
  const evs = await _fetchEVFromIndex();
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
  const vivos = (evs || []).filter((e) => e && e.id && e.a && e.id !== rb.evento_slug && (!e.ds || String(e.ds).slice(0, 10) >= hoy))
    .sort((a, b) => (a.ds || '9999').localeCompare(b.ds || '9999'));
  window.__yamchaEvs = vivos;
  if (!vivos.length) {
    cont.innerHTML = `<div class="modal" style="max-width:460px"><div class="modal-body"><div class="alert alert-error">No se pudo leer el catálogo de tours. Recarga e intenta de nuevo.</div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-yamcha-transferir')">Cerrar</button></div></div>`;
    return;
  }
  cont.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">🔁 Pasar a otro tour</div>
        <button class="modal-close" onclick="closeModal('modal-yamcha-transferir')">×</button>
      </div>
      <div class="modal-body">
        <div style="font-size:13px;margin-bottom:12px"><b>${_esfEsc(rb.cliente_nombre || 'cliente')}</b> · ${formatMXN(rb.monto)} en <b>${_esfEsc(rb.evento_nombre || rb.evento_slug)}</b> (cancelado)</div>
        <div class="form-group">
          <label>¿A qué tour pasa su dinero?</label>
          <select class="cot-input" id="ya-tp-dest" style="width:100%" onchange="_yamchaTpDestino()">
            <option value="">— elige el tour —</option>
            ${vivos.map((e) => `<option value="${_esfEsc(e.id)}">${_esfEsc(e.a)}${e.f ? ' · ' + _esfEsc(e.f) : ''}</option>`).join('')}
          </select>
        </div>
        <div id="ya-tp-extra"></div>
        <div style="font-size:11px;color:var(--ts);line-height:1.55;margin:8px 0">Se mueve al viajero con TODOS sus pagos. No sale dinero del banco ni se crea gasto. Su contrato queda igual a lo que ya pagó (saldo $0) hasta que elija paquete con el precio real.</div>
        <div id="ya-tp-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-yamcha-transferir')">Cancelar</button>
        <button class="btn btn-primary" id="ya-tp-btn" onclick="confirmarTraspaso('${_esfEsc(id)}')">Pasar</button>
      </div>
    </div>`;
}
function _yamchaTpDestino() {
  const slug = document.getElementById('ya-tp-dest').value;
  const extra = document.getElementById('ya-tp-extra');
  const ev = (window.__yamchaEvs || []).find((e) => e.id === slug);
  if (!ev) { extra.innerHTML = ''; return; }
  if (_yamchaEsUnico(ev)) {
    extra.innerHTML = `<div style="font-size:12px;margin-bottom:8px">Entra como <b>CHEAP · ${_esfEsc(_yamchaZonasDe(ev).cheap[0])}</b> (es el único lugar que vende este tour).</div>`;
    return;
  }
  // Paquete y zona nacen VACÍOS (DEFAULTS-1: es una atribución).
  extra.innerHTML = `
    <div class="form-group"><label>Paquete en el destino</label>
      <select class="cot-input" id="ya-tp-paq" style="width:100%" onchange="_yamchaTpZonas()">
        <option value="">— elige paquete —</option>
        ${['PLUS', 'STAY', 'RIDE', 'CHEAP'].map((p) => `<option>${p}</option>`).join('')}
      </select></div>
    <div class="form-group" id="ya-tp-zona-wrap"></div>`;
}
function _yamchaTpZonas() {
  const ev = (window.__yamchaEvs || []).find((e) => e.id === document.getElementById('ya-tp-dest').value);
  const paq = document.getElementById('ya-tp-paq').value;
  const wrap = document.getElementById('ya-tp-zona-wrap');
  if (!ev || !paq || paq === 'RIDE') { wrap.innerHTML = ''; return; }
  const zs = paq === 'CHEAP' ? _yamchaZonasDe(ev).cheap : _yamchaZonasDe(ev).plus;
  wrap.innerHTML = `<label>Zona</label><select class="cot-input" id="ya-tp-zona" style="width:100%"><option value="">— elige zona —</option>${zs.map((z) => `<option>${_esfEsc(z)}</option>`).join('')}</select>`;
}
async function confirmarTraspaso(id) {
  const rb = (window._yamchaRows || []).find(x => x && x.id === id);
  const alertEl = document.getElementById('ya-tp-alert');
  const btn = document.getElementById('ya-tp-btn');
  const destino = document.getElementById('ya-tp-dest').value;
  const ev = (window.__yamchaEvs || []).find((e) => e.id === destino);
  if (!ev) { alertEl.innerHTML = '<div class="alert alert-error">Elige el tour de destino</div>'; return; }
  const body = { accion: 'traspasar', id, destino };
  if (!_yamchaEsUnico(ev)) {
    body.paquete = (document.getElementById('ya-tp-paq') || {}).value || '';
    body.zona = (document.getElementById('ya-tp-zona') || {}).value || '';
    if (!body.paquete) { alertEl.innerHTML = '<div class="alert alert-error">Elige el paquete</div>'; return; }
    if (body.paquete !== 'RIDE' && !body.zona) { alertEl.innerHTML = '<div class="alert alert-error">Elige la zona</div>'; return; }
  }
  if (!confirm(`¿Pasar a ${rb ? rb.cliente_nombre : 'este cliente'} con ${rb ? formatMXN(rb.monto) : 'su dinero'} a ${ev.a}?\n\nNo sale dinero del banco. Ya no se le reembolsa.`)) return;
  btn.disabled = true; btn.textContent = 'Pasando…';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-reembolsos', { method: 'POST', body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok) {
      alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(d.error || 'No se pudo pasar')}</div>`;
      btn.disabled = false; btn.textContent = 'Pasar';
      return;
    }
    closeModal('modal-yamcha-transferir');
    showToast(`🔁 ${_esfEsc(rb ? rb.cliente_nombre : 'Cliente')} pasó a ${_esfEsc(d.destino_nombre)} con ${formatMXN(d.cobrado)}${d.diferencia_vs_reembolso ? ' (ojo: difiere ' + formatMXN(d.diferencia_vs_reembolso) + ' del reembolso)' : ''}`, 'success');
    loadYamcha();
  } catch (e) {
    alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
    btn.disabled = false; btn.textContent = 'Pasar';
  }
}
// [YAMCHA-UX-2] Reenviar «Tu reembolso fue enviado» a un transferido — solo
// correo, el dinero no se toca (lo garantiza el servidor).
async function reenviarCorreoReembolso(id) {
  const rb = (window._yamchaRows || []).find(x => x && x.id === id);
  if (!rb) { alert('No se encontró el reembolso. Recarga e intenta de nuevo.'); return; }
  if (!confirm(`¿Mandar «Tu reembolso fue enviado» a ${rb.cliente_nombre || 'este cliente'} (${rb.cliente_correo}) por ${formatMXN(rb.monto)}?`)) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-reembolsos', {
      method: 'POST', body: JSON.stringify({ accion: 'reenviar_correo', id }),
    });
    const d = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok) { showToast(d.error || 'No se pudo enviar', 'error'); return; }
    showToast(`Aviso enviado a ${_esfEsc(d.para || rb.cliente_correo)} ✓`, 'success');
  } catch (e) { showToast(e.message, 'error'); }
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