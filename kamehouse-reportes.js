// =============================================================================
// kamehouse-reportes.js — los reportes, sacados del tronco (MONO-8)
// =============================================================================
// 26 funciones y 697 líneas: la pantalla de reportes y su modal. 50% de
// aislamiento, comparte 26 funciones con el tronco.
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

function _salChipEstado(e) {
  const map = {
    solicitada: { txt: 'solicitada', c: '#ffb020', bg: 'rgba(255,176,32,.14)', bd: 'rgba(255,176,32,.4)' },
    autorizada: { txt: 'autorizada', c: '#3ddc84', bg: 'rgba(61,220,132,.14)', bd: 'rgba(61,220,132,.4)' },
    rechazada:  { txt: 'rechazada',  c: '#ff6666', bg: 'rgba(255,68,68,.14)',  bd: 'rgba(255,68,68,.4)' },
    cancelada:  { txt: 'cancelada',  c: 'var(--ts)', bg: 'rgba(255,255,255,.05)', bd: 'var(--border)' },
    cerrada:    { txt: 'cerrada',    c: '#7cc4ff', bg: 'rgba(124,196,255,.14)', bd: 'rgba(124,196,255,.4)' },
  };
  const x = map[e] || map.solicitada;
  return `<span style="display:inline-block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;padding:2px 7px;border-radius:4px;color:${x.c};background:${x.bg};border:1px solid ${x.bd}">${x.txt}</span>`;
}
// Vista de la zona de Reportes: 'reportes' (default) o 'salidas'.
function repVista(v) {
  const rep = v === 'reportes';
  const f = document.getElementById('rep-filtros'); if (f) f.style.display = rep ? 'flex' : 'none';
  const l = document.getElementById('reportes-list'); if (l) l.style.display = rep ? '' : 'none';
  const hb = document.getElementById('reportes-header-btns'); if (hb) hb.style.display = rep ? 'flex' : 'none';
  const z = document.getElementById('salidas-zona'); if (z) z.style.display = rep ? 'none' : '';
  const tr = document.getElementById('rep-tab-reportes'), ts = document.getElementById('rep-tab-salidas');
  [[tr, rep], [ts, !rep]].forEach(([b, on]) => { if (b) { b.style.background = on ? 'rgba(255,107,0,.12)' : 'transparent'; b.style.color = on ? 'var(--orange)' : 'var(--ts)'; } });
  if (!rep) loadSalidasZona();
}
async function loadSalidasZona() {
  // Evento del catálogo (vivos, patrón _fetchEVFromIndex).
  const sel = document.getElementById('sal-evento');
  if (sel && sel.options.length <= 1) {
    try {
      const ev = await _fetchEVFromIndex();
      // ⚠️ [ORD-1] Aquí decía `new Date().toISOString()`, que es la fecha de
      // GREENWICH: pasadas las 6 de la tarde de acá ya es MAÑANA allá, y el
      // evento de HOY se caía de la lista por "pasado". El helper de la casa
      // es `_mxFechaStr()`. No es un cambio de orden: es un bug de frontera.
      const hoy = _mxFechaStr();
      const vivos = _evOrdenarPorFecha((ev || []).filter(e => e && e.id && e.a && (!e.ds || e.ds >= hoy)));
      vivos.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.a + (e.f ? ' · ' + e.f : ''); sel.appendChild(o); });
    } catch (e) { /* select vacío: sin catálogo */ }
  }
  await loadSalPiezas();
  loadMisSalidas();
}
async function loadSalPiezas() {
  const box = document.getElementById('sal-piezas');
  if (!box) return;
  try {
    _salPiezas = await khKits.listar(); // [sec-kits] el backend omite costos a no-admins
    if (!_salPiezas.length) { box.innerHTML = '<div style="font-size:12px;color:var(--ts)">Sin piezas en el inventario</div>'; return; }
    box.innerHTML = _salPiezas.map((p, i) => `
      <div style="display:flex;align-items:center;gap:10px">
        <input type="number" id="sal-cant-${i}" min="0" value="0" class="cot-input" style="width:80px">
        <div style="flex:1;font-size:13px">${_salEsc(p.pieza)}${p.retornable ? ' <span style="font-size:9px;letter-spacing:.06em;text-transform:uppercase;font-weight:800;padding:1px 6px;border-radius:4px;color:#7cc4ff;background:rgba(124,196,255,.12);border:1px solid rgba(124,196,255,.35)">↻ siempre vuelve</span>' : ''}</div>
        <div style="font-size:11px;color:var(--ts)">${Number(p.cantidad) || 0} disp.</div>
      </div>`).join('');
  } catch (e) { box.innerHTML = `<div class="alert alert-error">${_salEsc(e.message)}</div>`; }
}
function _salAlert(m, err) {
  const a = document.getElementById('sal-alert');
  if (a) a.innerHTML = m ? `<div class="alert ${err ? 'alert-error' : 'alert-success'}">${_salEsc(m)}</div>` : '';
}
async function crearSalidaBodega() {
  const eid = (document.getElementById('sal-evento') || {}).value || '';
  if (!eid) return _salAlert('Elige un evento', true);
  const detalle = [];
  _salPiezas.forEach((p, i) => {
    const n = parseInt((document.getElementById('sal-cant-' + i) || {}).value, 10) || 0;
    if (n > 0) detalle.push({ pieza_id: p.id, cantidad: n });
  });
  if (!detalle.length) return _salAlert('Pon cantidad a al menos una pieza', true);
  const notas = ((document.getElementById('sal-notas') || {}).value || '').trim() || null;
  const btn = document.getElementById('sal-btn-crear');
  if (btn) btn.disabled = true;
  try {
    const j = await khSalidas.crear(eid, detalle, notas);
    _salAlert('Salida solicitada — el cuidador ya tiene tu lista' + (j.correo_enviado === false ? ' (el correo no salió; avísale tú)' : ''), false);
    _salPiezas.forEach((p, i) => { const el = document.getElementById('sal-cant-' + i); if (el) el.value = '0'; });
    const nt = document.getElementById('sal-notas'); if (nt) nt.value = '';
    loadMisSalidas();
  } catch (e) {
    const extra = (e.data && e.data.sin_stock)
      ? ' — ' + e.data.sin_stock.map(x => `${x.pieza}: ${x.disponible} disp.`).join(', ')
      : '';
    _salAlert(e.message + extra, true);
  } finally { if (btn) btn.disabled = false; }
}
async function loadMisSalidas() {
  const box = document.getElementById('sal-mis');
  if (!box) return;
  try {
    const salidas = await khSalidas.listar({ limit: 50 }); // el backend acota: el viajero SOLO ve lo suyo
    if (!salidas.length) { box.innerHTML = '<div style="font-size:12px;color:var(--ts);letter-spacing:.08em;text-transform:uppercase;text-align:center;padding:18px">Sin salidas todavía</div>'; return; }
    box.innerHTML = salidas.map(s => `
      <div style="border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:10px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="font-size:13px"><b>${_salEsc(s.evento_id)}</b> ${_salChipEstado(s.estado)}</div>
          <div style="font-size:11px;color:var(--ts)">${_salEsc(String(s.creado_en || '').slice(0, 10))}</div>
        </div>
        <div style="font-size:12px;color:var(--ts);margin-top:6px">${_salResumenDetalle(s.detalle)}</div>
        ${Number(s.faltantes_monto) > 0 ? _salFaltantesHtml(s) : ''}
        ${s.estado === 'rechazada' ? '<div style="font-size:11px;color:#ff6666;margin-top:4px">Rechazada — el motivo te llegó por correo</div>' : ''}
        ${s.estado === 'solicitada' ? `<div style="margin-top:8px"><button class="btn btn-ghost btn-sm" style="color:#ff6666;border-color:rgba(255,68,68,.3)" onclick="cancelarSalidaBodega('${_salEsc(s.id)}')">Cancelar</button></div>` : ''}
      </div>`).join('');
  } catch (e) { box.innerHTML = `<div class="alert alert-error">${_salEsc(e.message)}</div>`; }
}
// [TORRE v2 F4b] Faltantes cobrados del viajero: monto, vence y la cuenta de
// LA EMPRESA para liquidar (viene del backend; sin cuenta → pide el dato).
function _salFaltantesHtml(s) {
  const pagado = !!s.faltantes_pagado_at;
  const vence = String(s.faltantes_vence || '').slice(0, 10);
  const c = khSalidas.ultimaCuentaEmpresa;
  const cuentaTxt = pagado ? '' : c
    ? `Paga a: <b>${_salEsc(c.nombre || 'BBVA')}</b>${c.tarjeta ? ' · tarjeta ' + _salEsc(c.tarjeta) : ''}${c.clabe ? ' · CLABE ' + _salEsc(c.clabe) : ''}${c.titular ? ' · ' + _salEsc(c.titular) : ''} — y manda tu comprobante a Conecta`
    : 'Pide a Conecta la cuenta para depositar';
  return `<div style="margin-top:6px;padding:8px 10px;border:1px solid ${pagado ? 'rgba(61,220,132,.35)' : 'rgba(255,176,32,.35)'};border-radius:var(--r-sm,8px);background:${pagado ? 'rgba(61,220,132,.06)' : 'rgba(255,176,32,.06)'}">
    <div style="font-size:12px;font-weight:700;color:${pagado ? 'var(--green)' : '#ffb020'}">Faltantes cobrados: ${formatMXN(Number(s.faltantes_monto) || 0)}${pagado ? ' — PAGADO' : vence ? ' · vence el ' + _salEsc(vence) : ''}</div>
    ${cuentaTxt ? `<div style="font-size:11px;color:var(--ts);margin-top:3px">${cuentaTxt}</div>` : ''}
  </div>`;
}
async function cancelarSalidaBodega(id) {
  if (!confirm('¿Cancelar esta salida? Una salida enviada no se edita — cancela y crea otra.')) return;
  try { await khSalidas.cancelar(id); showToast('Salida cancelada', 'success'); loadMisSalidas(); }
  catch (e) { showToast(e.message, 'error'); }
}
// ── Carga principal ──────────────────────────────────────────
async function loadReportes() {
  const container = document.getElementById('reportes-list');
  const headerBtns = document.getElementById('reportes-header-btns');
  const rol = currentUser?.rol;

  // Mostrar botón según rol
  if (headerBtns) {
    if (rol === 'coordinador') {
      headerBtns.innerHTML = `<button class="btn btn-primary" onclick="abrirModalReporte(null)">+ Nuevo Reporte</button>`;
    } else if (['maestro_roshi','bulma'].includes(rol)) {
      headerBtns.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="loadReportes()" style="font-family:'JetBrains Mono',monospace;font-size:10px">↺ ACTUALIZAR</button>`;
    } else {
      headerBtns.innerHTML = '';
    }
  }

  container.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
  try {
    // Cargar piezas de bodega (para el formulario)
    _bodegaPiezasCache = await khKits.listar().then(r => r.map(x => ({...x, nombre: x.nombre||x.pieza}))).catch(() => []); // [sec-kits]

    // [sec-reportes] El backend acota por rol: si es coordinador, fuerza
    // coordi_id = su id (ve SOLO sus reportes). No mandamos coordi_id desde aquí.
    _reportesCache = await khReportes.listar({ limit: 100 });

    // Join manual con eventos y coordis
    if (_reportesCache.length) {
      const eIds = [...new Set(_reportesCache.map(r => r.evento_id).filter(Boolean))];
      const uIds = [...new Set(_reportesCache.map(r => r.coordi_id).filter(Boolean))];
      const [evs, users] = await Promise.all([
        eIds.length ? khEventosMeta.porSlugs(eIds) : [], // [sec-eventos]
        uIds.length ? khUsuarios.listar({ ids: uIds }) : [], // [sec-usuarios]
      ]);
      const evMap = Object.fromEntries(evs.map(e => [e.slug, e]));
      const uMap  = Object.fromEntries(users.map(u => [u.id, u]));
      _reportesCache = _reportesCache.map(r => ({
        ...r,
        _evento: evMap[r.evento_id] || null,
        _coordi: uMap[r.coordi_id] || null,
      }));
    }

    renderReportes(_reportesCache, _reportesFiltroActual);
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error" style="margin-top:20px">Error: ${e.message}</div>`;
  }
}
function filtrarReportes(status, btn) {
  _reportesFiltroActual = status;
  document.querySelectorAll('#page-reportes .gz-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderReportes(_reportesCache, status);
}
function renderReportes(lista, filtro) {
  const container = document.getElementById('reportes-list');
  const filtrada = filtro === 'todos' ? lista : lista.filter(r => r.status === filtro);

  if (!filtrada.length) {
    // [FLUJO-UX-5] Esta pantalla YA distinguía los dos casos con un ternario;
    // la pieza lo hace con el TIPO, que es lo mismo dicho una sola vez.
    khVacio(container, 'reportes', filtro === 'todos'
      ? { }
      : { tipo: 'filtro', frase: 'Ningún reporte con este estado' });
    return;
  }

  const statusInfo = {
    borrador:       { label:'Borrador',          color:'var(--ts)',    icon:'⎘' },
    enviado:        { label:'Pendiente revisión', color:'var(--gold)',  icon:'⏳' },
    rechazado:      { label:'Rechazado',          color:'var(--red)',   icon:'✕' },
    aprobado_popo:  { label:'En revisión Roshi',  color:'var(--blue)',  icon:'<svg class="ic"><use href="#ic-lupa"/></svg>' },
    aprobado_memo:  { label:'Aprobado',           color:'var(--green)', icon:'✓' },
  };

  container.innerHTML = filtrada.map(r => {
    const s = statusInfo[r.status] || { label: r.status, color:'var(--ts)', icon:'<svg class="ic"><use href="#ic-documento"/></svg>' };
    const ev = r._evento;
    const coo = r._coordi;
    const dif = r.diferencia ?? 0;
    const difColor = dif >= 0 ? 'var(--green)' : 'var(--red)';
    const difLabel = dif >= 0 ? `Sobró ${formatMXN(Math.abs(dif))}` : `Debe ${formatMXN(Math.abs(dif))}`;
    const gastos = r.gastos_detalle ? JSON.parse(typeof r.gastos_detalle === 'string' ? r.gastos_detalle : JSON.stringify(r.gastos_detalle)) : [];
    const kits   = r.kits_detalle   ? JSON.parse(typeof r.kits_detalle   === 'string' ? r.kits_detalle   : JSON.stringify(r.kits_detalle))   : [];

    // Botones según rol y status
    const rol = currentUser?.rol;
    let btns = '';
    if (rol === 'coordinador' && (r.status === 'borrador' || r.status === 'rechazado')) {
      btns = `<button class="btn btn-primary btn-sm" onclick="abrirModalReporte('${r.id}')">Editar</button>
              <button class="btn btn-ghost btn-sm" onclick="enviarReporte('${r.id}')">Enviar →</button>`;
    }
    if (rol === 'mister_popo' && r.status === 'enviado') {
      btns = `<button class="btn btn-primary btn-sm" onclick="aprobarReportePopo('${r.id}')">✓ Aprobar</button>
              <button class="btn btn-red btn-sm" onclick="rechazarReporte('${r.id}')">✗ Rechazar</button>`;
    }
    if (['maestro_roshi','bulma'].includes(rol) && ['aprobado_popo','enviado'].includes(r.status)) {
      btns = `<button class="btn btn-primary btn-sm" onclick="aprobarReporteMemo('${r.id}')">✓ Aprobar${r.status==='enviado'?' directo':' Definitivo'}</button>
              <button class="btn btn-red btn-sm" onclick="rechazarReporte('${r.id}')">✗ Rechazar</button>`;
    }
    // Popo: marcar kits recibidos cuando aprobado_memo
    if (rol === 'mister_popo' && r.status === 'aprobado_memo' && kits.some(k => (k.cantidad_sobrante||0) > 0 && !k.recibido)) {
      btns += `<button class="btn btn-ghost btn-sm" onclick="marcarKitsRecibidos('${r.id}')" style="border-color:rgba(62,220,132,.4);color:var(--green)">Marcar Recibido</button>`;
    }
    if (btns) btns = `<div class="modal-footer" style="padding:0;margin-top:12px;justify-content:flex-end;gap:8px;flex-wrap:wrap">${btns}</div>`;

    // Kits sobrantes resumen
    const kitsSob = kits.filter(k => (k.cantidad_sobrante||0) > 0);
    const kitsHtml = kitsSob.length ? `<div style="margin-top:8px;font-size:11px;color:var(--ts);font-family:'JetBrains Mono',monospace">
      SOBRANTES: ${kitsSob.map(k => `${_esfEsc(k.nombre||k.pieza_nombre||k.pieza_id)} ×${Number(k.cantidad_sobrante)||0}`).join(' · ')}
    </div>` : '';

    return `<div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${s.color};border-radius:var(--radius);padding:16px 20px;margin-bottom:12px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:700;margin-bottom:2px">${_esfEsc(ev ? ev.nombre : (r.evento_id || '—'))}</div>
          ${r.status === 'rechazado' ? '<span style="display:inline-block;background:var(--red);color:#fff;font-size:9px;font-weight:900;letter-spacing:.05em;padding:2px 8px;border-radius:4px;margin-bottom:6px;font-family:\'JetBrains Mono\',monospace">RECHAZADO · CORREGIR</span>' : ''}
          <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ts);margin-bottom:8px">
            ${ev ? new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : ''}
            ${coo ? ` · ${_esfEsc(coo.nombre)}` : ''} · <span style="color:${s.color}">${s.icon} ${s.label}</span>
          </div>
          <div style="display:flex;gap:20px;flex-wrap:wrap">
            <div><div style="font-size:10px;letter-spacing:.12em;color:var(--ts)">ENTREGADO</div><div style="font-family:'Zen Dots',sans-serif;font-size:16px">${formatMXN(r.dinero_recibido||0)}</div></div>
            <div><div style="font-size:10px;letter-spacing:.12em;color:var(--ts)">GASTADO</div><div style="font-family:'Zen Dots',sans-serif;font-size:16px">${formatMXN(r.total_gastado||0)}</div></div>
            <div><div style="font-size:10px;letter-spacing:.12em;color:var(--ts)">DIFERENCIA</div><div style="font-family:'Zen Dots',sans-serif;font-size:16px;color:${difColor}">${difLabel}</div></div>
          </div>
          ${kitsHtml}
          ${r.rechazo_motivo ? `<div style="margin-top:8px;font-size:11px;padding:6px 10px;background:rgba(255,68,68,.08);border-left:2px solid var(--red);color:var(--red)">Motivo rechazo: ${_esfEsc(r.rechazo_motivo)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="verDetalleReporte('${r.id}')" style="font-family:'JetBrains Mono',monospace;font-size:10px">VER DETALLE</button>
        </div>
      </div>
      ${btns}
    </div>`;
  }).join('');
}
// ── Abrir modal crear/editar reporte ────────────────────────
async function abrirModalReporte(reporteId) {
  // El coordi SOLO puede reportar eventos a los que está asignado (decisión de
  // Memo). Leemos sus asignaciones (evento_id = slug, Fase A) y resolvemos el
  // nombre/fecha bonita desde el EV ya cargado en cliente. value del option =
  // slug. Si un slug no está en el EV, mostramos el slug crudo (fallback). Ya
  // NO consultamos la tabla `eventos` (UUID).
  let evAsig = [];
  try {
    const asigs = await khAsignaciones.listar({ coordi_id: currentUser.id }); // [sec-coordi]
    const slugs = [...new Set((asigs || []).map(a => a.evento_id).filter(Boolean))];
    if (slugs.length) {
      const evArr = await _fetchEVFromIndex().catch(() => []);
      const evMap = {};
      (evArr || []).forEach(e => { if (e && e.id) evMap[e.id] = e; });
      evAsig = slugs.map(slug => {
        const ev = evMap[slug];
        const fecha = ev
          ? (ev.ds || (Array.isArray(ev.multifecha) && ev.multifecha[0] && ev.multifecha[0].ds) || '')
          : '';
        return { id: slug, nombre: ev ? (ev.a || slug) : slug, fecha };
      });
    }
  } catch(e) {
    evAsig = [];
  }
  _eventosAsignadosCache = evAsig;

  // Piezas bodega
  const piezas = _bodegaPiezasCache;

  let reporte = null;
  if (reporteId) {
    [reporte] = _reportesCache.filter(r => r.id === reporteId);
  }

  // Construir kits existentes
  const kitsActuales = reporte?.kits_detalle
    ? (typeof reporte.kits_detalle === 'string' ? JSON.parse(reporte.kits_detalle) : reporte.kits_detalle)
    : [];
  const gastosActuales = reporte?.gastos_detalle
    ? (typeof reporte.gastos_detalle === 'string' ? JSON.parse(reporte.gastos_detalle) : reporte.gastos_detalle)
    : [];

  // Opciones select piezas
  const piezasOptions = piezas.map(p =>
    `<option value="${p.id}">${_esfEsc(p.nombre || p.pieza)}</option>`
  ).join('');

  // Render kits rows
  function kitRow(k, idx) {
    const sel = piezas.map(p => `<option value="${p.id}" ${p.id===k.pieza_id?'selected':''}>${_esfEsc(p.nombre||p.pieza)}</option>`).join('');
    return `<div class="kit-row" data-idx="${idx}" style="display:grid;grid-template-columns:1fr 100px 100px 28px;gap:8px;align-items:center;margin-bottom:8px">
      <select class="cot-input kit-pieza-sel" style="font-size:12px;padding:7px 10px"><option value="">— Pieza —</option>${sel}</select>
      <input type="number" class="cot-input kit-sacada" placeholder="Sacada" min="0" value="${k.cantidad_sacada||''}" style="font-size:12px;padding:7px 10px">
      <input type="number" class="cot-input kit-sobrante" placeholder="Sobra" min="0" value="${k.cantidad_sobrante||''}" style="font-size:12px;padding:7px 10px">
      <button onclick="this.closest('.kit-row').remove()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;padding:0">×</button>
    </div>`;
  }
  function gastoRow(g, idx) {
    return `<div class="gasto-row" style="display:grid;grid-template-columns:1fr 130px 28px;gap:8px;align-items:center;margin-bottom:8px">
      <input type="text" class="cot-input gasto-concepto" placeholder="Concepto" value="${_esfEsc(g.concepto||'')}" style="font-size:12px;padding:7px 10px">
      <input type="number" class="cot-input gasto-monto" placeholder="Monto" min="0" value="${g.monto||''}" style="font-size:12px;padding:7px 10px" oninput="recalcReporte()">
      <button onclick="this.closest('.gasto-row').remove();recalcReporte()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;padding:0">×</button>
    </div>`;
  }

  const kitsHtml   = kitsActuales.map(kitRow).join('') || kitRow({},0);
  const gastosHtml = gastosActuales.map(gastoRow).join('') || gastoRow({},0);

  const evOptions = evAsig.map(e => {
    const f = e.fecha ? new Date(e.fecha + 'T12:00:00') : null;
    const fTxt = (f && !isNaN(f)) ? ' · ' + f.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : '';
    return `<option value="${e.id}" ${e.id===reporte?.evento_id?'selected':''}>${_esfEsc(e.nombre)}${fTxt}</option>`;
  }).join('');

  // CAMBIO 4: aviso de rechazo visible al reabrir un reporte rechazado
  const rechazoBanner = (reporte && reporte.status === 'rechazado')
    ? '<div class="alert alert-error" style="margin-bottom:16px"><svg class="ic"><use href="#ic-alerta"/></svg> Reporte rechazado. ' + (reporte.rechazo_motivo ? 'Motivo: ' + reporte.rechazo_motivo : 'Corrígelo y reenvíalo.') + '</div>'
    : '';

  document.getElementById('modal-reporte').innerHTML = `
    <div class="modal" style="max-width:680px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:16px">${reporteId ? 'Editar Reporte' : 'Nuevo Reporte Post-Evento'}</div>
        <button class="modal-close" onclick="closeModal('modal-reporte')">×</button>
      </div>
      <div class="modal-body" style="max-height:75vh;overflow-y:auto">
        <input type="hidden" id="rep-id" value="${reporte?.id||''}">
        ${rechazoBanner}

        <div class="form-group" style="margin-bottom:16px">
          <label>Evento *</label>
          <select class="cot-input" id="rep-evento" style="width:100%" onchange="repEventoCheck(this.value)">
            <option value="">Selecciona un evento…</option>
            ${evOptions}
          </select>
        </div>

        <!-- Dinero recibido -->
        <div style="background:rgba(255,183,3,.06);border:1px solid rgba(255,183,3,.2);border-radius:var(--r-sm,8px);padding:16px;margin-bottom:20px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.15em;color:var(--gold);margin-bottom:10px">// DINERO RECIBIDO DE MEMO</div>
          <div class="form-group" style="margin:0">
            <label>Memo me entregó <span style="color:var(--ts);font-weight:400">(0 si no recibió efectivo)</span></label>
            <input type="number" class="cot-input" id="rep-dinero" placeholder="0.00" min="0" value="${reporte?.dinero_recibido||''}" oninput="recalcReporte()" style="width:220px">
          </div>
        </div>

        <!-- Kits -->
        <div style="margin-bottom:20px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.15em;color:var(--ts);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
            <span>// CONTROL DE KITS</span>
            <button class="btn btn-ghost btn-sm" onclick="agregarKitRow()" style="font-size:10px">+ Agregar item</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 100px 100px 28px;gap:8px;margin-bottom:6px">
            <div style="font-size:10px;color:var(--ts)">PIEZA</div>
            <div style="font-size:10px;color:var(--ts)">SACADOS</div>
            <div style="font-size:10px;color:var(--ts)">SOBRAN</div>
            <div></div>
          </div>
          <div id="kits-rows">${kitsHtml}</div>
        </div>

        <!-- Gastos -->
        <div style="margin-bottom:20px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.15em;color:var(--ts);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
            <span>// GASTOS DEL EVENTO</span>
            <button class="btn btn-ghost btn-sm" onclick="agregarGastoRow()" style="font-size:10px">+ Agregar gasto</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 130px 28px;gap:8px;margin-bottom:6px">
            <div style="font-size:10px;color:var(--ts)">CONCEPTO</div>
            <div style="font-size:10px;color:var(--ts)">MONTO</div>
            <div></div>
          </div>
          <div id="gastos-rows">${gastosHtml}</div>
        </div>

        <!-- Resumen financiero -->
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:16px;margin-bottom:16px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.15em;color:var(--ts);margin-bottom:12px">// RESUMEN</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center">
            <div><div style="font-size:10px;color:var(--ts)">ENTREGADO</div><div style="font-family:'Zen Dots',sans-serif;font-size:18px;color:var(--gold)" id="rep-total-entregado">$0</div></div>
            <div><div style="font-size:10px;color:var(--ts)">GASTADO</div><div style="font-family:'Zen Dots',sans-serif;font-size:18px" id="rep-total-gastado">$0</div></div>
            <div><div style="font-size:10px;color:var(--ts)">DIFERENCIA</div><div style="font-family:'Zen Dots',sans-serif;font-size:18px" id="rep-diferencia">$0</div></div>
          </div>
          <!-- CLABE si gastó de más -->
          <div id="rep-clabe-section" style="display:none;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
            <div style="font-size:11px;color:var(--red);margin-bottom:8px"><svg class="ic"><use href="#ic-alerta"/></svg> Gastaste más de lo recibido. Ingresa tu cuenta para que Memo te reembolse.</div>
            <div class="form-group" style="margin:0">
              <label>CLABE / Cuenta bancaria</label>
              <input type="text" class="cot-input" id="rep-clabe" placeholder="18 dígitos o datos bancarios" value="${_esfEsc(reporte?.cuenta_bancaria_coordi||'')}" style="width:100%">
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>Notas adicionales</label>
          <textarea class="cot-input" id="rep-notas" rows="3" placeholder="Algo importante que Memo deba saber…" style="width:100%;resize:vertical">${_esfEsc(reporte?.notas||'')}</textarea>
        </div>

        <div id="rep-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-reporte')">Cancelar</button>
        <button class="btn btn-ghost" id="rep-btn-borrador" onclick="guardarReporte('borrador')">Guardar borrador</button>
        <button class="btn btn-primary" id="rep-btn-enviar" onclick="guardarReporte('enviado')">Enviar reporte →</button>
      </div>
    </div>`;

  openModal('modal-reporte');
  recalcReporte();
}
function agregarKitRow() {
  const container = document.getElementById('kits-rows');
  const piezas = _bodegaPiezasCache;
  const sel = piezas.map(p => `<option value="${p.id}">${_esfEsc(p.nombre||p.pieza)}</option>`).join('');
  const div = document.createElement('div');
  div.className = 'kit-row';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 100px 100px 28px;gap:8px;align-items:center;margin-bottom:8px';
  div.innerHTML = `
    <select class="cot-input kit-pieza-sel" style="font-size:12px;padding:7px 10px"><option value="">— Pieza —</option>${sel}</select>
    <input type="number" class="cot-input kit-sacada" placeholder="Sacada" min="0" style="font-size:12px;padding:7px 10px">
    <input type="number" class="cot-input kit-sobrante" placeholder="Sobra" min="0" style="font-size:12px;padding:7px 10px">
    <button onclick="this.closest('.kit-row').remove()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;padding:0">×</button>`;
  container.appendChild(div);
}
function agregarGastoRow() {
  const container = document.getElementById('gastos-rows');
  const div = document.createElement('div');
  div.className = 'gasto-row';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 130px 28px;gap:8px;align-items:center;margin-bottom:8px';
  div.innerHTML = `
    <input type="text" class="cot-input gasto-concepto" placeholder="Concepto" style="font-size:12px;padding:7px 10px">
    <input type="number" class="cot-input gasto-monto" placeholder="Monto" min="0" style="font-size:12px;padding:7px 10px" oninput="recalcReporte()">
    <button onclick="this.closest('.gasto-row').remove();recalcReporte()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;padding:0">×</button>`;
  container.appendChild(div);
}
function recalcReporte() {
  const entregado = parseFloat(document.getElementById('rep-dinero')?.value) || 0;
  const montos = Array.from(document.querySelectorAll('.gasto-monto')).map(i => parseFloat(i.value)||0);
  const gastado = montos.reduce((a,b) => a+b, 0);
  const dif = entregado - gastado;

  document.getElementById('rep-total-entregado').textContent = formatMXN(entregado);
  document.getElementById('rep-total-gastado').textContent   = formatMXN(gastado);
  const difEl = document.getElementById('rep-diferencia');
  if (difEl) {
    difEl.textContent = formatMXN(Math.abs(dif));
    difEl.style.color = dif >= 0 ? 'var(--green)' : 'var(--red)';
  }
  const clabeSection = document.getElementById('rep-clabe-section');
  if (clabeSection) clabeSection.style.display = dif < 0 ? 'block' : 'none';
}
function leerKitsForm() {
  const rows = document.querySelectorAll('.kit-row');
  const result = [];
  rows.forEach(row => {
    const piezaId   = row.querySelector('.kit-pieza-sel')?.value;
    const sacada    = parseInt(row.querySelector('.kit-sacada')?.value) || 0;
    const sobrante  = parseInt(row.querySelector('.kit-sobrante')?.value) || 0;
    if (piezaId) {
      const pieza = _bodegaPiezasCache.find(p => p.id === piezaId);
      result.push({ pieza_id: piezaId, pieza_nombre: pieza?.nombre || pieza?.pieza || '', cantidad_sacada: sacada, cantidad_sobrante: sobrante, recibido: false });
    }
  });
  return result;
}
function leerGastosForm() {
  const rows = document.querySelectorAll('.gasto-row');
  const result = [];
  rows.forEach(row => {
    const concepto = row.querySelector('.gasto-concepto')?.value.trim();
    const monto    = parseFloat(row.querySelector('.gasto-monto')?.value) || 0;
    if (concepto || monto) result.push({ concepto: concepto || '—', monto });
  });
  return result;
}
function repEventoCheck(eventoId) {
  // CAMBIO 1: si el coordi ya tiene fila para este evento, reusarla en vez de crear (evita 23505).
  if (!eventoId) return;
  const mine = (_reportesCache || []).filter(r =>
    String(r.evento_id) === String(eventoId) && String(r.coordi_id) === String(currentUser.id));
  if (!mine.length) return;
  const existing = mine[0];
  const repIdEl = document.getElementById('rep-id');
  const curId = repIdEl ? repIdEl.value : '';
  if (curId && String(curId) === String(existing.id)) return;  // ya lo estamos editando
  const locked = { enviado:'Pendiente revisión', aprobado_popo:'En revisión Roshi', aprobado_memo:'Aprobado' };
  if (locked[existing.status]) {
    alert('Ya tienes un reporte de este evento (estado: ' + locked[existing.status] + '). Lo abriré para editarlo.');
  }
  abrirModalReporte(existing.id);
}
async function guardarReporte(nuevoStatus) {
  const alert = document.getElementById('rep-alert');
  const id = document.getElementById('rep-id')?.value;
  const eventoId = document.getElementById('rep-evento')?.value;
  const dinero = parseFloat(document.getElementById('rep-dinero')?.value) || 0;
  const notas = document.getElementById('rep-notas')?.value.trim() || '';
  const clabe = document.getElementById('rep-clabe')?.value.trim() || null;

  if (nuevoStatus === 'enviado' && !eventoId) {
    alert.innerHTML = '<div class="alert alert-error">Selecciona un evento</div>'; return;
  }
  // dinero puede ser 0 (tours donde Memo no entrega efectivo)

  const kits   = leerKitsForm();
  const gastos = leerGastosForm();
  const totalGastado = gastos.reduce((a,b) => a + b.monto, 0);
  const diferencia = dinero - totalGastado;

  if (nuevoStatus === 'enviado' && dinero > 0 && diferencia < 0 && !clabe) {
    alert.innerHTML = '<div class="alert alert-error">Ingresa tu CLABE: gastaste más de lo recibido</div>'; return;
  }

  const body = {
    evento_id: eventoId || null,
    coordi_id: currentUser.id,
    status: nuevoStatus,
    kits_detalle: JSON.stringify(kits),
    gastos_detalle: JSON.stringify(gastos),
    dinero_recibido: dinero,
    total_gastado: totalGastado,
    diferencia,
    cuenta_bancaria_coordi: clabe,
    notas: notas || null,
  };
  // CAMBIO 5: al reenviar, limpiar el motivo de rechazo viejo
  if (nuevoStatus === 'enviado') body.rechazo_motivo = null;

  // CAMBIO 3: anti doble-submit
  const btnB = document.getElementById('rep-btn-borrador');
  const btnE = document.getElementById('rep-btn-enviar');
  if (btnB) btnB.disabled = true;
  if (btnE) btnE.disabled = true;

  try {
    alert.innerHTML = '<div class="alert" style="border-color:var(--border)">Guardando…</div>';
    // [sec-reportes] guardar_mio: el backend FUERZA coordi_id = su JWT y solo
    // acepta status borrador|enviado. Con id → PATCH (verifica propiedad);
    // sin id → upsert on_conflict(evento_id,coordi_id). Mismo shape de body.
    const _res = await khReportes.guardarMio(id ? { ...body, id } : body);
    if (!id) {
      const newId = _res && _res.id;
      if (newId) { const rf = document.getElementById('rep-id'); if (rf) rf.value = newId; }
    }
    alert.innerHTML = `<div class="alert alert-success">${nuevoStatus === 'enviado' ? '✓ Reporte enviado' : '✓ Borrador guardado'}</div>`;
    setTimeout(() => { closeModal('modal-reporte'); loadReportes(); }, 900);
  } catch(e) {
    alert.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    if (btnB) btnB.disabled = false;
    if (btnE) btnE.disabled = false;
  }
}
async function enviarReporte(id) {
  // Enviar directamente desde la lista (shortcut)
  const r = _reportesCache.find(x => x.id === id);
  if (!r) return;
  if (!confirm('¿Confirmas enviar este reporte para revisión?')) return;
  try {
    await khReportes.enviarMio(id); // [sec-reportes]
    loadReportes();
  } catch(e) { alert(e.message); }
}
async function aprobarReportePopo(id) {
  if (!confirm('¿Aprobar este reporte y enviarlo a Memo para revisión final?')) return;
  try {
    await khReportes.aprobarPopo(id); // [sec-reportes]
    loadReportes();
  } catch(e) {
    const d = e.data || {};
    // [TORRE v2 F4b] descuadre de bodega: si es COBRABLE, el cuidador puede
    // aprobar con FALTANTES COBRADOS (al costo de reposición, queda registro;
    // los 15 días arrancan cuando Memo dé la autorización final).
    if (Array.isArray(d.diferencias) && d.diferencias.length) {
      const det = d.diferencias.map(_difTxt).join('\n');
      if (d.cobrable) {
        const monto = (d.faltantes_monto_estimado != null) ? formatMXN(d.faltantes_monto_estimado) : 'el costo de reposición';
        if (confirm(`La salida de bodega y el reporte NO cuadran:\n\n${det}\n\n¿Aprobar con FALTANTES COBRADOS?\nSe le cobrará ${monto} (costo de reposición). Tendrá 15 días naturales para liquidar desde la aprobación final de Memo.`)) {
          try {
            const j = await khReportes.aprobarPopoCobrando(id); // [sec-reportes]
            alert(`✓ Aprobado con faltantes cobrados: ${formatMXN(j.faltantes_monto || 0)}.\nEl registro quedó en la salida de bodega.`);
            loadReportes();
          } catch(e2) { alert(e2.message); }
        }
        return;
      }
      alert(`La salida y el reporte NO cuadran y hay errores de captura (no cobrables) — corrige el reporte:\n\n${det}`);
      return;
    }
    alert(e.message);
  }
}
async function aprobarReporteMemo(id) {
  const r = _reportesCache.find(x => x.id === id);
  if (!r) return;
  if (!confirm('¿Aprobar definitivamente este reporte? Se descontará el stock de Torre de Karin.')) return;
  try {
    await ejecutarAprobacionFinal(id, r);
    loadReportes();
    // Refrescar inventario si está visible
    if (document.getElementById('page-inventario')?.classList.contains('active')) loadInventario();
  } catch(e) { alert(e.message); }
}
async function rechazarReporte(id) {
  const motivo = prompt('Motivo del rechazo (el coordi lo verá):');
  if (!motivo) return;
  try {
    await khReportes.rechazar(id, motivo); // [sec-reportes]
    // Alerta a Memo
    const r = _reportesCache.find(x=>x.id===id);
    await enviarAlertaMemo('reporte_rechazado', { coordi: r?._coordi?.nombre||'Coordi', motivo });
    loadReportes();
  } catch(e) { alert(e.message); }
}
async function marcarKitsRecibidos(id) {
  const r = _reportesCache.find(x => x.id === id);
  if (!r) return;
  if (!confirm('¿Confirmar que recibiste los kits sobrantes? Se agregarán al inventario de bodega.')) return;
  try {
    // Marcar kits como recibidos en el reporte
    const kits = typeof r.kits_detalle === 'string' ? JSON.parse(r.kits_detalle) : (r.kits_detalle || []);
    const kitsActualizados = kits.map(k => ({ ...k, recibido: true }));
    await khReportes.marcarKitsRecibidos(id, JSON.stringify(kitsActualizados)); // [sec-reportes]

    alert('✓ Kits marcados como recibidos y actualizados en bodega.');
    loadReportes();
    // Refrescar inventario si está activo
    if (document.getElementById('page-inventario').classList.contains('active')) loadInventario();
  } catch(e) { alert(e.message); }
}
// ── Ver detalle completo ──────────────────────────────────────
function verDetalleReporte(id) {
  const r = _reportesCache.find(x => x.id === id);
  if (!r) return;
  const kits   = typeof r.kits_detalle   === 'string' ? JSON.parse(r.kits_detalle)   : (r.kits_detalle   || []);
  const gastos = typeof r.gastos_detalle === 'string' ? JSON.parse(r.gastos_detalle) : (r.gastos_detalle || []);
  const dif    = r.diferencia || 0;
  const difColor = dif >= 0 ? 'var(--green)' : 'var(--red)';

  const kitsHtml = kits.length ? kits.map(k =>
    `<tr>
      <td style="font-weight:600">${_esfEsc(k.pieza_nombre || k.pieza_id)}</td>
      <td>${k.cantidad_sacada || 0}</td>
      <td>${k.cantidad_sobrante || 0}</td>
      <td style="color:${k.recibido ? 'var(--green)' : 'var(--ts)'}">${k.recibido ? '✓ Recibido' : '—'}</td>
    </tr>`
  ).join('') : '<tr><td colspan="4" style="color:var(--ts)">Sin kits registrados</td></tr>';

  const gastosHtml = gastos.length ? gastos.map(g =>
    `<tr><td>${_esfEsc(g.concepto)}</td><td style="text-align:right;font-weight:600">${formatMXN(g.monto)}</td></tr>`
  ).join('') : '<tr><td colspan="2" style="color:var(--ts)">Sin gastos</td></tr>';

  document.getElementById('modal-reporte').innerHTML = `
    <div class="modal" style="max-width:620px">
      <div class="modal-header">
        <div>
          <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">DETALLE REPORTE</div>
          <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ts)">${_esfEsc(r._evento?.nombre || r.evento_id)} · ${_esfEsc(r._coordi?.nombre || '')}</div>
        </div>
        <button class="modal-close" onclick="closeModal('modal-reporte')">×</button>
      </div>
      <div class="modal-body" style="max-height:75vh;overflow-y:auto">
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.15em;color:var(--ts);margin-bottom:10px">// KITS</div>
        <div class="table-wrap" style="margin-bottom:20px">
          <table>
            <thead><tr><th>Pieza</th><th>Sacados</th><th>Sobran</th><th>Status</th></tr></thead>
            <tbody>${kitsHtml}</tbody>
          </table>
        </div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.15em;color:var(--ts);margin-bottom:10px">// GASTOS</div>
        <div class="table-wrap" style="margin-bottom:20px">
          <table>
            <thead><tr><th>Concepto</th><th style="text-align:right">Monto</th></tr></thead>
            <tbody>${gastosHtml}</tbody>
          </table>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center;background:var(--bg3);padding:16px;border-radius:var(--r-sm,8px);margin-bottom:16px">
          <div><div style="font-size:10px;color:var(--ts)">ENTREGADO</div><div style="font-family:'Zen Dots',sans-serif;font-size:18px;color:var(--gold)">${formatMXN(r.dinero_recibido||0)}</div></div>
          <div><div style="font-size:10px;color:var(--ts)">GASTADO</div><div style="font-family:'Zen Dots',sans-serif;font-size:18px">${formatMXN(r.total_gastado||0)}</div></div>
          <div><div style="font-size:10px;color:var(--ts)">DIFERENCIA</div><div style="font-family:'Zen Dots',sans-serif;font-size:18px;color:${difColor}">${formatMXN(Math.abs(dif))}</div></div>
        </div>
        ${r.cuenta_bancaria_coordi ? `<div style="padding:10px 14px;background:rgba(255,68,68,.06);border-left:2px solid var(--red);margin-bottom:12px;font-size:12px">Cuenta coordi: <strong>${_esfEsc(r.cuenta_bancaria_coordi)}</strong></div>` : ''}
        ${r.notas ? `<div style="padding:10px 14px;background:var(--bg3);border-left:2px solid var(--border2);font-size:12px;color:var(--ts)">Notas: ${_esfEsc(r.notas)}</div>` : ''}
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal('modal-reporte')">Cerrar</button></div>
    </div>`;
  openModal('modal-reporte');
}