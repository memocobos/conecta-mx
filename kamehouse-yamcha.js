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
      </div>`;

    if (!filas.length) {
      // [FLUJO-UX-5] SIN ACCIÓN a propósito: un reembolso no se captura, NACE
      // de una cancelación. Un botón aquí prometería una salida que no existe.
      khVacio(lista, 'reembolsos', { nota: 'Los reembolsos nacen al cancelar una solicitud; no se capturan a mano.' });
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