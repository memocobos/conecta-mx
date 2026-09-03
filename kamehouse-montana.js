// =============================================================================
// kamehouse-montana.js — la Montaña, sacada del tronco (MONO-9)
// =============================================================================
// La pantalla de la Nube Voladora: transporte, rooming y habitaciones.
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
function _kamToday() { try { return new Date().toLocaleDateString('en-CA'); } catch (_) { return ''; } }
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
  // [VENTAS-RETIRO-1] Sale 'ventas': el panel ya no existe (VEN-BORRA-1), y esta
  // lista es la que pinta las casillas de «tabs extra» por usuario. Ofrecer una
  // pantalla retirada no es cosmético — `_puedeVerTab` SUMA `tabs_extra`, así que
  // conceder 'ventas' encendía un atajo cuyo `showPage` revienta contra un `null`
  // y deja la app en blanco. Las otras nueve se quedan, una por una.
  const todasTabs = ['resumen','pagos','eventos','gastos','inventario','reportes','capsule','equipo','kamisama'];

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