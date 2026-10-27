// =============================================================================
// kamehouse-gz.js — [GZ-INICIO-2 · GZ-TOURS-1 · 14-oct-2026] LA PLATAFORMA
// DEL GUERRERO Z: su Inicio y su pestaña de Tours.
// Palabra de Memo: «cuando entran a inicio dice mi contrato pero no dice nada …
// un reloj contando meses, días, semanas, horas … su foto de perfil … tours
// separar activos o próximos de los pasados … ranking en qué número y cuántos
// puntos … sistema de alertas … una pestaña de Tours para ver su tour
// asignado, lista de viajeros, rooming list».
//
// Mismas reglas que los otros módulos: SOLO funciones, cero estado de nivel
// superior (el reloj vive en window._gzRelojT y se apaga solo).
// Todo es LECTURA y le pregunta a los dueños que ya existen:
//   · gz-panel (servidor): contrato, asignaciones, salidas, reportes, deudas.
//   · _rankingCalcular (kamehouse-equipo.js): la MISMA cuenta del modal.
//   · fechaFinAsignacion (kamehouse-equipo.js): cuándo termina un tour.
//   · viajero_listar (admin-coordi-asignaciones): la vista de coordi de la
//     lista de viajeros, decidida en el servidor (COORDI-LISTA-1).
// =============================================================================

// ── «Ver como» de verdad ────────────────────────────────────────────────────
// Montaña Pai solo cambiaba la PANTALLA: el servidor seguía viendo el JWT de
// Memo y su Inicio decía «no encontré un contrato a tu correo». Si hay sesión
// de Ver como, se le pide al servidor que conteste COMO esa persona (gz-panel
// solo lo acepta de maestro_roshi).
function _gzVerComoId() {
  // [SES-CRUCE-1] Solo cuenta si el respaldo es de quien firma el JWT (Memo):
  // un respaldo viejo colgado en la pestaña no vuelve «Ver como» a nadie.
  try {
    const b = JSON.parse(sessionStorage.getItem('_roshi_session_backup') || 'null');
    const uid = (typeof _khJwtUid === 'function') ? _khJwtUid(khGetJwt()) : null;
    return (b && b.user && uid && b.user.id === uid && currentUser && currentUser.id !== uid) ? currentUser.id : null;
  } catch (e) { return null; }
}
async function _gzCall(payload) {
  const r = await khAdminFetch('/.netlify/functions/gz-panel', {
    method: 'POST', body: JSON.stringify(Object.assign({}, payload, { ver_como: _gzVerComoId() })),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || ('gz-panel ' + r.status));
  return j;
}

// ── fechas de un tour (slug o slug#N) contra el catálogo ────────────────────
function _gzEvDe(slug, evMap) {
  const base = String(slug || '').split('#')[0];
  return evMap[base] || null;
}
function _gzNombreTour(slug, evMap) {
  const ev = _gzEvDe(slug, evMap);
  if (!ev) return String(slug || '');
  const idx = String(slug).split('#')[1];
  const mf = (idx != null && Array.isArray(ev.multifecha)) ? ev.multifecha[idx] : null;
  return (ev.a || slug) + (mf && mf.lbl ? ' · ' + mf.lbl : '');
}
function _gzInicioTour(slug, evMap) {
  const ev = _gzEvDe(slug, evMap);
  if (!ev) return null;
  const idx = String(slug).split('#')[1];
  const ds = (idx != null ? ((ev.dsList && ev.dsList[idx]) || (ev.multifecha && ev.multifecha[idx] && ev.multifecha[idx].ds)) : null) || ev.ds;
  return ds || null;
}
function _gzFinTour(slug, evMap) {
  // Date (mediodía del último día) o null — del dueño de kamehouse-equipo.js.
  return (typeof fechaFinAsignacion === 'function') ? fechaFinAsignacion(slug, evMap) : null;
}
// El reloj del regreso arranca a las 00:00 del día SIGUIENTE al último día del
// tour (la regla del cron de strikes) y dura 5 días; el del reporte, 48 horas.
function _gzRelojDesde(fin) {
  if (!fin) return null;
  const d = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1, 0, 0, 0);
  return d;
}
function _gzFechaCorta(ds) {
  if (!ds) return 'fecha por confirmar';
  const d = ds instanceof Date ? ds : new Date(String(ds).slice(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function _gzFechaHora(d) {
  return d.toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── el desglose del reloj: meses · semanas · días · horas · min · seg ───────
function _gzDesglose(desde, hasta) {
  if (hasta <= desde) return null;
  let meses = 0;
  const sumarMeses = (n) => { const d = new Date(desde); d.setMonth(d.getMonth() + n); return d; };
  while (sumarMeses(meses + 1) <= hasta) meses++;
  let resto = hasta - sumarMeses(meses);
  const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
  const semanas = Math.floor(resto / (7 * D)); resto -= semanas * 7 * D;
  const dias = Math.floor(resto / D); resto -= dias * D;
  const horas = Math.floor(resto / H); resto -= horas * H;
  const min = Math.floor(resto / M); resto -= min * M;
  const seg = Math.floor(resto / S);
  return { meses, semanas, dias, horas, min, seg };
}
function _gzRelojHtml(x) {
  const caja = (n, l) => `<div style="flex:1;min-width:52px;text-align:center;background:var(--bg3,rgba(255,255,255,.04));border:1px solid var(--border);border-radius:10px;padding:8px 4px">
    <div style="font-family:'Zen Dots',sans-serif;font-size:22px;line-height:1">${String(n).padStart(2, '0')}</div>
    <div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--ts);margin-top:4px">${l}</div></div>`;
  return `<div style="display:flex;gap:6px;flex-wrap:wrap">${caja(x.meses, x.meses === 1 ? 'mes' : 'meses')}${caja(x.semanas, x.semanas === 1 ? 'semana' : 'semanas')}${caja(x.dias, x.dias === 1 ? 'día' : 'días')}${caja(x.horas, 'horas')}${caja(x.min, 'min')}${caja(x.seg, 'seg')}</div>`;
}
// Un solo intervalo para todos los relojes de la pantalla: cada elemento con
// [data-gz-hasta] se repinta solo. Si ya no hay ninguno en el DOM, se apaga.
function _gzRelojArrancar() {
  if (window._gzRelojT) clearInterval(window._gzRelojT);
  const tic = () => {
    const els = document.querySelectorAll('[data-gz-hasta]');
    if (!els.length) { clearInterval(window._gzRelojT); window._gzRelojT = null; return; }
    const ahora = new Date();
    els.forEach((el) => {
      const hasta = new Date(Number(el.dataset.gzHasta));
      const x = _gzDesglose(ahora, hasta);
      if (el.dataset.gzModo === 'corto') {
        el.textContent = x ? ((x.meses ? x.meses + 'm ' : '') + (x.semanas * 7 + x.dias) + 'd ' + String(x.horas).padStart(2, '0') + 'h ' + String(x.min).padStart(2, '0') + 'm ' + String(x.seg).padStart(2, '0') + 's') : 'VENCIDO';
      } else {
        el.innerHTML = x ? _gzRelojHtml(x) : '<b style="color:var(--red)">VENCIDO</b>';
      }
    });
  };
  tic();
  window._gzRelojT = setInterval(tic, 1000);
}

const _GZ_PLANTILLA_TXT = { coordinador: 'Coordinador(a) de tours', creadora_team: 'Creadora de contenido (team)', creadora: 'Creadora de contenido', auxiliar_admin: 'Auxiliar administrativo', giveaway: 'Giveaway' };

// ═══ INICIO ══════════════════════════════════════════════════════════════════
async function gzInicioPintar(cont) {
  const [panel, evs, rank, kits] = await Promise.all([
    _gzCall({ accion: 'panel' }),
    (typeof _fetchEVFromIndex === 'function' ? _fetchEVFromIndex() : Promise.resolve([])).catch(() => []),
    (typeof _rankingCalcular === 'function' ? _rankingCalcular() : Promise.reject(new Error('sin ranking'))).catch((e) => ({ _err: e.message })),
    (typeof khKits !== 'undefined' ? khKits.listar() : Promise.resolve([])).catch(() => []),
  ]);
  const evMap = {}; (evs || []).forEach((e) => { if (e && e.id) evMap[e.id] = e; });
  const ahora = new Date();
  const hoy = _iniHoy();
  const u = panel.usuario || {};
  const yoId = u.id || (currentUser && currentUser.id);
  const soloVer = !!panel.ver_como;
  const retornableDe = {}; (kits || []).forEach((k) => { retornableDe[k.id] = !!k.retornable; });

  // ── contrato principal: el de coordinador firmado con la vigencia más larga;
  // si no hay firmado, el pendiente más reciente.
  const ctrs = panel.contratos || [];
  const finDe = (c) => {
    if (c.vigencia_fin) return c.vigencia_fin;
    if (c.vigencia_inicio && c.vigencia_meses) { const d = new Date(c.vigencia_inicio + 'T12:00:00'); d.setMonth(d.getMonth() + Number(c.vigencia_meses)); return d.toISOString().slice(0, 10); }
    return null;
  };
  const firmados = ctrs.filter((c) => c.estado === 'firmado').sort((a, b) => String(finDe(b) || '').localeCompare(String(finDe(a) || '')));
  const pendientes = ctrs.filter((c) => c.estado === 'pendiente');
  const principal = firmados.find((c) => finDe(c)) || firmados[0] || null;

  // ── tours: asignaciones con fechas del catálogo ──
  const asigs = (panel.asignaciones || []).map((a) => {
    const fin = _gzFinTour(a.evento_id, evMap);
    return { ...a, nombre: _gzNombreTour(a.evento_id, evMap), ini: _gzInicioTour(a.evento_id, evMap), fin, pasado: !!(fin && fin < new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())) };
  });
  const proximos = asigs.filter((a) => !a.pasado && a.status !== 'declinado').sort((a, b) => String(a.ini || '9').localeCompare(String(b.ini || '9')));
  const pasados = asigs.filter((a) => a.pasado && a.status === 'aceptado').sort((a, b) => String(b.ini || '').localeCompare(String(a.ini || '')));

  // ── préstamos: retornables de salidas autorizadas que no se han cerrado ──
  const reportes = panel.reportes || [];
  const prestamos = [];
  (panel.salidas || []).filter((s) => s.estado === 'autorizada').forEach((s) => {
    const items = (Array.isArray(s.detalle) ? s.detalle : []).filter((d) => d.retornable || retornableDe[d.pieza_id]);
    if (!items.length) return;
    const fin = _gzFinTour(s.evento_id, evMap);
    const desde = _gzRelojDesde(fin);
    const vence = desde ? new Date(desde.getTime() + 5 * 864e5) : null;
    if (s.devolucion_recibida_at) return; // Popo ya lo tiene: deja de ser pendiente
    prestamos.push({ salida: s, items, fin, vence, avisado: !!s.devolucion_avisada_at, nombre: _gzNombreTour(s.evento_id, evMap) });
  });

  // ── ALERTAS: una sola lista, del lado de quien la lee ──
  const alertas = [];
  const al = (nivel, txt, boton) => alertas.push({ nivel, txt, boton });
  pendientes.forEach((c) => al('rojo', `Te falta FIRMAR tu contrato de ${_iniEsc(_GZ_PLANTILLA_TXT[c.plantilla] || c.plantilla)}.`, c.token ? `<a class="btn btn-primary btn-sm" href="/contrato?t=${encodeURIComponent(c.token)}" target="_blank" rel="noopener">Firmar ahora</a>` : ''));
  if (!ctrs.length) al('naranja', 'No encontramos un contrato a tu correo. Coméntalo con Memo.');
  if (principal && finDe(principal)) {
    const dias = _iniDias(hoy, finDe(principal));
    if (dias < 0) al('rojo', `Tu contrato VENCIÓ el ${_iniEsc(finDe(principal))}. Habla con Memo para renovarlo.`);
    else if (dias <= 30) al('naranja', `Tu contrato vence en ${dias} día${dias === 1 ? '' : 's'} (${_iniEsc(finDe(principal))}).`);
  }
  asigs.filter((a) => a.status === 'pendiente' && !a.pasado).forEach((a) => al('naranja', `Te asignaron <b>${_iniEsc(a.nombre)}</b> (${_iniEsc(_gzFechaCorta(a.ini))}). Acéptalo o declínalo.`, `<button class="btn btn-primary btn-sm" onclick="showPage('tours')">Responder</button>`));
  const salidasDe = (ev) => (panel.salidas || []).filter((s) => s.evento_id === ev && ['solicitada', 'autorizada', 'cerrada'].includes(s.estado));
  proximos.filter((a) => a.status === 'aceptado' && a.ini).forEach((a) => {
    const dias = _iniDias(hoy, a.ini);
    if (dias >= 0 && dias <= 7 && !salidasDe(a.evento_id).length) al('info', `<b>${_iniEsc(a.nombre)}</b> es en ${dias === 0 ? 'HOY' : dias + ' día' + (dias === 1 ? '' : 's')}. ¿Ya pediste tu material de la Torre de Karin?`, `<button class="btn btn-ghost btn-sm" onclick="showPage('inventario')">Pedir salida</button>`);
  });
  (panel.salidas || []).filter((s) => s.estado === 'solicitada').forEach((s) => al('info', `Tu salida de bodega para <b>${_iniEsc(_gzNombreTour(s.evento_id, evMap))}</b> espera que Popo la autorice.`));
  pasados.forEach((a) => {
    const rep = reportes.find((r) => r.evento_id === a.evento_id);
    if (rep && rep.status === 'rechazado') { al('rojo', `Tu reporte de <b>${_iniEsc(a.nombre)}</b> fue RECHAZADO${rep.rechazo_motivo ? ': «' + _iniEsc(rep.rechazo_motivo) + '»' : ''}. Corrígelo y vuelve a mandarlo.`, `<button class="btn btn-primary btn-sm" onclick="showPage('reportes')">Ir a reportes</button>`); return; }
    if (rep && rep.status !== 'borrador') return;
    const desde = _gzRelojDesde(a.fin);
    const limite = desde ? new Date(desde.getTime() + 48 * 3600e3) : null;
    if (!limite || ahora - limite > 30 * 864e5) return; // un olvido de hace meses ya no es «pendiente de hoy»
    al(limite < ahora ? 'rojo' : 'naranja', `Manda tu reporte post-evento de <b>${_iniEsc(a.nombre)}</b>. ${limite < ahora ? 'El plazo de 48 h ya venció.' : 'Te quedan <b data-gz-hasta="' + limite.getTime() + '" data-gz-modo="corto"></b>.'}`, `<button class="btn btn-primary btn-sm" onclick="showPage('reportes')">Hacer reporte</button>`);
  });
  prestamos.filter((p) => p.vence && p.fin && p.fin < ahora && !p.avisado).forEach((p) => {
    al(p.vence < ahora ? 'rojo' : 'naranja', `Regresa a la bodega lo que te prestaron para <b>${_iniEsc(p.nombre)}</b>: ${p.items.map((d) => `${Number(d.cantidad) || 0}× ${_iniEsc(d.pieza)}`).join(', ')}. ${p.vence < ahora ? 'El plazo de 5 días ya venció — riesgo de strike.' : 'Te quedan <b data-gz-hasta="' + p.vence.getTime() + '" data-gz-modo="corto"></b>.'}`);
  });
  (panel.salidas || []).filter((s) => Number(s.faltantes_monto) > 0 && !s.faltantes_pagado_at).forEach((s) => al('rojo', `Tienes faltantes de bodega por pagar: <b>${formatMXN(Number(s.faltantes_monto))}</b>${s.faltantes_vence ? ' · vence el ' + _iniEsc(s.faltantes_vence) : ''}. Mientras no se paguen no puedes pedir otra salida.`));
  (panel.deudas || []).filter((d) => !d.pagado).forEach((d) => al('rojo', `Deuda pendiente: ${_iniEsc(d.concepto || d.tipo)} — <b>${formatMXN(Number(d.monto) || 0)}</b>.`));
  if (Number(u.strikes) > 0) al(Number(u.strikes) >= 2 ? 'rojo' : 'naranja', `Llevas <b>${Number(u.strikes)} strike${Number(u.strikes) === 1 ? '' : 's'}</b> de 3. Con 3 se pausa tu cuenta.`);
  // Popo (cuidador): lo que espera de él en la Torre.
  if (currentUser && currentUser.rol === 'mister_popo' && typeof khSalidas !== 'undefined') {
    try {
      const [porAut, aut] = await Promise.all([khSalidas.listar({ estado: 'solicitada' }), khSalidas.listar({ estado: 'autorizada' })]);
      if (porAut.length) al('naranja', `Tienes <b>${porAut.length}</b> reporte${porAut.length === 1 ? '' : 's'} de salida por autorizar en la Torre de Karin.`, `<button class="btn btn-primary btn-sm" onclick="showPage('inventario')">Ir a la Torre</button>`);
      const devs = aut.filter((x) => x.devolucion_avisada_at && !x.devolucion_recibida_at);
      if (devs.length) al('naranja', `<b>${devs.length}</b> devolución${devs.length === 1 ? '' : 'es'} por confirmar: te avisaron que ya regresaron el préstamo.`, `<button class="btn btn-primary btn-sm" onclick="showPage('inventario')">Confirmar</button>`);
    } catch (e) { /* la Torre tiene su propia pantalla; aquí es un atajo */ }
  }
  const faltaPerfil = [!u.foto_url && 'foto', !u.celular && 'celular', !u.talla_playera && 'talla de playera'].filter(Boolean);
  if (faltaPerfil.length) al('info', `Completa tu perfil: falta ${faltaPerfil.join(', ')}.`, `<button class="btn btn-ghost btn-sm" onclick="gzEditarPerfil()">Completar</button>`);

  const COL = { rojo: ['rgba(255,68,68,.10)', 'rgba(255,68,68,.45)', '#ff6666', '⛔'], naranja: ['rgba(255,176,32,.10)', 'rgba(255,176,32,.45)', '#ffb020', '⚠️'], info: ['rgba(124,196,255,.08)', 'rgba(124,196,255,.35)', '#7cc4ff', 'ℹ️'] };
  const orden = { rojo: 0, naranja: 1, info: 2 };
  alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  const alertasHtml = alertas.length
    ? `<div style="grid-column:1/-1;border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:var(--panel)">
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ts);margin-bottom:10px">🔔 Alertas · ${alertas.length}</div>
        ${alertas.map((a) => { const c = COL[a.nivel]; return `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:9px 12px;margin-bottom:6px;border-radius:8px;background:${c[0]};border:1px solid ${c[1]}"><div style="font-size:13px;line-height:1.45;flex:1;min-width:200px"><span style="margin-right:6px">${c[3]}</span>${a.txt}</div>${a.boton || ''}</div>`; }).join('')}
      </div>`
    : `<div style="grid-column:1/-1;border:1px solid rgba(61,220,132,.35);border-radius:12px;padding:12px 16px;background:rgba(61,220,132,.06);font-size:13px">✅ Todo en orden: no tienes pendientes.</div>`;

  // ── ① MI CONTRATO: el reloj ──
  let ctrHtml;
  if (principal && finDe(principal)) {
    const fin = finDe(principal);
    const hasta = new Date(fin + 'T23:59:59');
    ctrHtml = _iniCard('📄 Mi contrato · tiempo para ser coordinador',
      `<div style="font-size:13px;margin-bottom:10px"><b>${_iniEsc(_GZ_PLANTILLA_TXT[principal.plantilla] || principal.plantilla)}</b> · <span style="color:var(--green)">firmado</span>${principal.firmado_at ? ' el ' + _iniEsc(String(principal.firmado_at).slice(0, 10)) : ''}</div>
       <div data-gz-hasta="${hasta.getTime()}"></div>
       <div style="font-size:11px;color:var(--ts);margin-top:8px">Vence el <b>${_iniEsc(_gzFechaCorta(fin))}</b></div>`,
      principal.token ? `<a class="btn btn-ghost btn-sm" href="/contrato?t=${encodeURIComponent(principal.token)}" target="_blank" rel="noopener">Ver mi contrato</a>` : '');
  } else if (principal) {
    ctrHtml = _iniCard('📄 Mi contrato', `<div style="font-size:13px"><b>${_iniEsc(_GZ_PLANTILLA_TXT[principal.plantilla] || principal.plantilla)}</b> · firmado — sin fecha de vencimiento capturada.</div>`,
      principal.token ? `<a class="btn btn-ghost btn-sm" href="/contrato?t=${encodeURIComponent(principal.token)}" target="_blank" rel="noopener">Ver mi contrato</a>` : '');
  } else if (pendientes.length) {
    const c = pendientes[0];
    ctrHtml = _iniCard('📄 Mi contrato', `<div style="font-size:13px;margin-bottom:6px">Tu contrato de <b>${_iniEsc(_GZ_PLANTILLA_TXT[c.plantilla] || c.plantilla)}</b> está <b style="color:#ffb020">pendiente de firma</b>.</div><div style="font-size:12px;color:var(--ts)">El reloj de tu vigencia empieza cuando lo firmes.</div>`,
      c.token ? `<a class="btn btn-primary btn-sm" href="/contrato?t=${encodeURIComponent(c.token)}" target="_blank" rel="noopener">Firmar mi contrato</a>` : '');
  } else {
    ctrHtml = _iniCard('📄 Mi contrato', '<div style="color:var(--ts);font-size:12px">No encontramos un contrato a tu correo. Coméntalo con Memo.</div>');
  }

  // ── ② MI PERFIL: foto (se cambia aquí) + datos ──
  const iniciales = String(u.nombre || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const foto = u.foto_url ? `<img src="${_urlSegura(u.foto_url)}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<span style="font-family:'Zen Dots',sans-serif;font-size:26px">${_iniEsc(iniciales)}</span>`;
  const datoFila = (k, v) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px"><span style="color:var(--ts)">${k}</span><b>${_iniEsc(v || '—')}</b></div>`;
  const perfilHtml = _iniCard('🪪 Mi perfil',
    `<div style="display:flex;gap:14px;align-items:center;margin-bottom:10px">
       <div ${soloVer ? '' : `onclick="gzCambiarFoto()" title="Cambiar foto"`} style="width:84px;height:84px;flex:0 0 84px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;border:2px solid var(--gold,#ffb703);background:var(--bg3,#111);${soloVer ? '' : 'cursor:pointer'}">${foto}</div>
       <div style="min-width:0">
         <div style="font-weight:700;font-size:15px">${_iniEsc(u.nombre)}</div>
         ${soloVer ? '' : `<button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="gzCambiarFoto()">📷 ${u.foto_url ? 'Cambiar foto' : 'Subir foto'}</button>`}
       </div>
     </div>` + datoFila('Correo', u.correo) + datoFila('Celular', u.celular) + datoFila('Talla', u.talla_playera),
    soloVer ? `<span style="font-size:11px;color:var(--ts)">✏️ Aquí la persona edita su perfil y su plantilla (en «Ver como» no se edita)</span>` : `<button class="btn btn-primary btn-sm" onclick="gzEditarPerfil()">✏️ Editar mi perfil y plantilla</button>`);

  // ── ③ MIS TOURS: próximos y pasados, separados ──
  const stChip = (s) => s === 'aceptado' ? '<b style="color:var(--green)">aceptado</b>' : (s === 'declinado' ? '<b style="color:var(--red)">declinado</b>' : '<b style="color:var(--orange)">por responder</b>');
  const filaTour = (a) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px"><span>${_iniEsc(a.nombre)}<i style="color:var(--ts)"> · ${_iniEsc(_gzFechaCorta(a.ini))}</i></span>${stChip(a.status)}</div>`;
  const toursHtml = _iniCard(`🎤 Mis tours`,
    `<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--green);margin-bottom:4px">Próximos · ${proximos.length}</div>
     ${proximos.length ? proximos.map(filaTour).join('') : '<div style="color:var(--ts);font-size:12px;margin-bottom:6px">Sin tours próximos asignados.</div>'}
     <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ts);margin:12px 0 4px">Pasados · ${pasados.length}</div>
     ${pasados.length ? pasados.slice(0, 8).map(filaTour).join('') + (pasados.length > 8 ? `<div style="font-size:11px;color:var(--ts);margin-top:4px">y ${pasados.length - 8} más…</div>` : '') : '<div style="color:var(--ts);font-size:12px">Todavía no tienes tours pasados.</div>'}`,
    `<button class="btn btn-ghost btn-sm" onclick="showPage('tours')">Ver mis tours →</button>`);

  // ── ④ RANKING: posición y puntos, con la cuenta del modal ──
  let rankHtml;
  if (rank && rank.rankingData) {
    const lista = rank.rankingData;
    const yo = lista.find((x) => x.id === yoId);
    const pts = yo ? yo.ptsAnio : 0;
    const pos = 1 + lista.filter((x) => x.ptsAnio > pts).length;
    const arriba = lista.filter((x) => x.ptsAnio > pts).sort((a, b) => a.ptsAnio - b.ptsAnio)[0];
    rankHtml = _iniCard(`🏆 Ranking ${rank.anioActual}`,
      `<div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
         <div style="font-family:'Zen Dots',sans-serif;font-size:34px;line-height:1">#${pos}<span style="font-size:13px;color:var(--ts)"> de ${lista.length}</span></div>
         <div style="font-family:'Zen Dots',sans-serif;font-size:22px;color:var(--gold,#ffb703)">${pts} <span style="font-size:11px;color:var(--ts)">pts</span></div>
       </div>
       <div style="font-size:12px;color:var(--ts);margin-top:6px">${yo ? yo.numTours : 0} tour${yo && yo.numTours === 1 ? '' : 's'} sumando este año${arriba ? ` · te faltan <b style="color:var(--text)">${arriba.ptsAnio - pts} pts</b> para alcanzar a ${_iniEsc(String(arriba.nombre || '').split(' ')[0])}` : pos === 1 && pts > 0 ? ' · ¡vas en primer lugar!' : ''}</div>`,
      `<button class="btn btn-ghost btn-sm" onclick="abrirRanking()">Ver ranking completo</button>`);
  } else {
    rankHtml = _iniCard('🏆 Ranking', `<div style="color:var(--ts);font-size:12px">No se pudo calcular el ranking${rank && rank._err ? ': ' + _iniEsc(rank._err) : ''}.</div>`);
  }

  // ── ⑤ PRÉSTAMOS: lo que traes de la bodega y cuánto tiempo tienes ──
  const prestHtml = prestamos.length ? _iniCard('🔁 Préstamos de la Torre de Karin',
    prestamos.map((p) => {
      const lista = p.items.map((d) => `${Number(d.cantidad) || 0}× ${_iniEsc(d.pieza)}`).join(', ');
      let estado;
      if (p.avisado) estado = '<span style="color:#7cc4ff">Avisaste que ya lo regresaste · Popo lo confirma</span>';
      else if (p.fin && p.fin < ahora && !soloVer) estado = (p.vence < ahora ? '<b style="color:var(--red)">Plazo vencido — regrésalo ya</b>' : `Regrésalo en <b data-gz-hasta="${p.vence.getTime()}" data-gz-modo="corto"></b>`) + ` <button class="btn btn-primary btn-sm" style="margin-left:6px" onclick="gzDevolucionAvisar('${_attrJs(p.salida.id)}')">Ya lo regresé</button>`;
      else if (!p.fin) estado = '<span style="color:var(--ts)">El reloj empieza al terminar el tour</span>';
      else if (p.fin > ahora) estado = `<span style="color:var(--ts)">Tienes 5 días para regresarlo a partir del ${_iniEsc(_gzFechaCorta(_gzRelojDesde(p.fin)))}</span>`;
      else estado = p.vence < ahora ? '<b style="color:var(--red)">Plazo vencido — regrésalo ya</b>' : `Regrésalo en <b data-gz-hasta="${p.vence.getTime()}" data-gz-modo="corto"></b>`;
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px"><div><b>${_iniEsc(p.nombre)}</b></div><div style="color:var(--ts);margin:2px 0">${lista}</div><div>${estado}</div></div>`;
    }).join(''),
    `<button class="btn btn-ghost btn-sm" onclick="showPage('inventario')">Ir a la Torre</button>`) : '';

  // ── ⑥ RADIO CONECTA: el mismo reproductor de la barra de arriba ──
  const radioHtml = _iniCard('📻 Radio Conecta · en vivo',
    `<div style="display:flex;gap:12px;align-items:center">
       <div id="gz-radio-art" style="width:64px;height:64px;flex:0 0 64px;border-radius:10px;background:var(--bg3,#111) center/cover;border:1px solid var(--border)"></div>
       <div style="min-width:0;flex:1">
         <div id="gz-radio-tit" style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Sonando ahora…</div>
         <div id="gz-radio-art2" style="font-size:12px;color:var(--ts);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
         <div id="gz-radio-oy" style="font-size:11px;color:var(--ts);margin-top:2px"></div>
       </div>
       <button class="btn btn-primary" id="gz-radio-btn" onclick="gzRadioToggle()" style="border-radius:50%;width:48px;height:48px;padding:0;font-size:18px">${(typeof _tbPlaying !== 'undefined' && _tbPlaying) ? '⏸' : '▶'}</button>
     </div>`,
    `<a class="btn btn-ghost btn-sm" href="/radio" target="_blank" rel="noopener">🎶 Pide una canción</a>`);

  cont.innerHTML = `${soloVer ? '<div style="margin-bottom:12px;font-size:12px;color:var(--gold,#ffb703)">👁 Modo «Ver como»: estos son los datos reales de esta persona. Solo lectura.</div>' : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">${alertasHtml}${ctrHtml}${perfilHtml}${prestHtml}${toursHtml}${rankHtml}${radioHtml}</div>`;
  _gzRelojArrancar();
  gzRadioAhora();
}

// [GZ-INICIO-3] Radio Conecta en su Inicio. Comparte el <audio> de la barra de
// arriba (un solo reproductor: si cambian de pantalla, sigue sonando).
async function gzRadioAhora() {
  if (typeof RADIO_NOWPLAYING === 'undefined') return;
  try {
    const r = await fetch(RADIO_NOWPLAYING, { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    const s = (d && d.now_playing && d.now_playing.song) || {};
    const t = document.getElementById('gz-radio-tit'); if (t) t.textContent = s.title || 'En vivo';
    const a = document.getElementById('gz-radio-art2'); if (a) a.textContent = s.artist || '';
    const o = document.getElementById('gz-radio-oy'); const n = d && d.listeners && d.listeners.current;
    if (o) o.textContent = (n != null) ? `${n} escuchando ahora` : '';
    const img = document.getElementById('gz-radio-art');
    if (img && s.art && /^https:\/\//.test(s.art)) img.style.backgroundImage = `url("${String(s.art).replace(/"/g, '')}")`;
  } catch (e) { /* la radio no tumba el Inicio */ }
}
function gzRadioToggle() {
  if (typeof _tbRadioToggle !== 'function') return;
  _tbRadioToggle();
  const b = document.getElementById('gz-radio-btn');
  if (b) b.textContent = (typeof _tbPlaying !== 'undefined' && _tbPlaying) ? '⏸' : '▶';
  setTimeout(gzRadioAhora, 400);
}
function gzCambiarFoto() {
  if (_gzVerComoId()) return;
  if (typeof subirFoto !== 'function') return;
  // subirFoto repinta Guerreros Z al terminar; aquí se repinta el Inicio.
  const antes = currentUser && currentUser.foto_url;
  subirFoto(currentUser.id);
  let n = 0;
  const t = setInterval(() => {
    n++;
    if ((currentUser && currentUser.foto_url) !== antes || n > 120) {
      clearInterval(t);
      if (document.getElementById('page-inicio')?.classList.contains('active')) loadInicio();
    }
  }, 1000);
}
async function gzDevolucionAvisar(id) {
  if (_gzVerComoId()) return;
  if (!confirm('¿Ya dejaste el préstamo en la bodega? Le avisamos a Popo para que lo confirme.')) return;
  try { await khSalidas.devolucionAvisar(id); showToast('Listo — Popo ya sabe que lo regresaste', 'success'); loadInicio(); }
  catch (e) { showToast(e.message, 'error'); }
}
// [GZ-INICIO-3 · 14-oct] «En su inicio, en lo de perfil, deben poder editar su
// perfil» (Memo): el MISMO formulario de Mi Perfil (un dueño: renderFormPerfil
// + guardarMiPerfil), abierto en una ventana aquí mismo. Incluye la plantilla
// de su Kamehouse, el color, emergencia y contraseña.
async function gzEditarPerfil() {
  if (_gzVerComoId()) { showToast('En «Ver como» no se edita el perfil de otra persona', 'error'); return; }
  if (typeof renderFormPerfil !== 'function') return;
  crearModal('gz-perfil', 'Mi perfil', '<div id="gz-perfil-form" style="max-height:78vh;overflow-y:auto"></div>');
  const box = document.getElementById('gz-perfil-form');
  if (!box) return;
  const md = box.closest('.modal'); if (md) md.style.maxWidth = '760px';
  box.innerHTML = renderFormPerfil();
  // Guardar → regresa al Inicio; Cancelar → deshace la vista previa y cierra.
  box.querySelectorAll('button').forEach((b) => {
    const oc = b.getAttribute('onclick') || '';
    if (/guardarMiPerfil\(/.test(oc)) b.setAttribute('onclick', 'guardarMiPerfil({inicio:true})');
    else if (/renderMiPerfil\(false\)/.test(oc)) b.setAttribute('onclick', "_plantillaRestaurar();cerrarModal('gz-perfil')");
  });
  const card = box.querySelector('.perfil-card'); if (card) card.style.maxWidth = '100%';
  try {
    const u = (await khUsuarios.obtener(currentUser.id)) || currentUser;
    ['nombre', 'correo_notif', 'celular', 'num_emergencia', 'nombre_emergencia', 'parentesco_emergencia', 'talla_playera', 'fecha_nacimiento', 'template_sugerido', 'username'].forEach((campo) => {
      const inp = document.getElementById('mp-' + campo);
      if (inp && u[campo]) inp.value = u[campo];
    });
  } catch (e) { /* se queda con lo que la sesión trae */ }
}

// ═══ TOURS ═══════════════════════════════════════════════════════════════════
async function loadGzTours() {
  const cont = document.getElementById('gzt-lista');
  if (!cont) return;
  cont.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando tus tours…</div>';
  try {
    // [GZ-HIST-1] uid de quien se mira: el propio, o el «ver como» del admin.
    const _histUid = (typeof _gzVerComoId === 'function' && _gzVerComoId()) || (currentUser && currentUser.id);
    const [panel, evs, histTours] = await Promise.all([
      _gzCall({ accion: 'panel' }),
      (typeof _fetchEVFromIndex === 'function' ? _fetchEVFromIndex() : Promise.resolve([])).catch(() => []),
      // Historial fuera del sistema (tours_pasados): el backend ya deja a cada
      // quien crear/borrar LOS SUYOS; fallar aquí no tumba la pestaña.
      khTours.listar({ usuario_id: _histUid }).catch(() => null),
    ]);
    const evMap = {}; (evs || []).forEach((e) => { if (e && e.id) evMap[e.id] = e; });
    window._gzEvMap = evMap;
    const ahora = new Date();
    const hoyCero = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const asigs = (panel.asignaciones || []).map((a) => {
      const fin = _gzFinTour(a.evento_id, evMap);
      return { ...a, nombre: _gzNombreTour(a.evento_id, evMap), ini: _gzInicioTour(a.evento_id, evMap), fin, pasado: !!(fin && fin < hoyCero) };
    });
    const prox = asigs.filter((a) => !a.pasado && a.status !== 'declinado').sort((a, b) => String(a.ini || '9').localeCompare(String(b.ini || '9')));
    const pas = asigs.filter((a) => a.pasado && a.status === 'aceptado').sort((a, b) => String(b.ini || '').localeCompare(String(a.ini || '')));
    const soloVer = !!panel.ver_como;
    const card = (a, esPasado) => {
      const st = a.status === 'aceptado' ? '<span style="color:var(--green);font-weight:700">✓ aceptado</span>' : a.status === 'pendiente' ? '<span style="color:var(--orange);font-weight:700">por responder</span>' : '<span style="color:var(--red)">declinado</span>';
      const dias = a.ini ? _iniDias(_iniHoy(), a.ini) : null;
      const cuando = esPasado ? '' : dias == null ? '' : dias === 0 ? ' · <b style="color:var(--gold,#ffb703)">¡ES HOY!</b>' : dias > 0 ? ` · faltan <b>${dias}</b> día${dias === 1 ? '' : 's'}` : '';
      const resp = (!esPasado && a.status === 'pendiente' && !soloVer)
        ? `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="gzTourResponder('${_attrJs(a.id)}','aceptar')">✓ Acepto el tour</button><button class="btn btn-ghost btn-sm" style="color:#ff6666;border-color:rgba(255,68,68,.35)" onclick="gzTourResponder('${_attrJs(a.id)}','declinar')">No puedo</button></div>` : '';
      const abrir = a.status === 'aceptado' ? `<button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="gzTourAbrir('${_attrJs(a.evento_id)}')">Ver viajeros y rooming →</button>` : '';
      return `<div style="border:1px solid var(--border);border-left:3px solid ${esPasado ? 'var(--ts)' : 'var(--orange)'};border-radius:10px;padding:12px 14px;background:var(--panel);margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div style="font-weight:700;font-size:15px">${_iniEsc(a.nombre)}</div>${st}</div>
        <div style="font-size:12px;color:var(--ts);margin-top:2px">${_iniEsc(_gzFechaCorta(a.ini))}${cuando}</div>
        ${a.indicaciones ? `<div style="font-size:12px;margin-top:6px;padding:6px 9px;border-radius:6px;background:rgba(255,183,3,.06);border:1px solid rgba(255,183,3,.2)">📝 ${_iniEsc(a.indicaciones)}</div>` : ''}
        ${resp}${abrir}
        <div id="gzt-det-${_iniEsc(String(a.evento_id).replace(/[^A-Za-z0-9_-]/g, '_'))}"></div>
      </div>`;
    };
    // [GZ-HIST-1] «Fuera del sistema»: tours que la persona coordinó antes de
    // que existieran las asignaciones. Los captura ella misma (el backend ya lo
    // permitía — faltaba ESTA puerta). 🔒 Solo los del año en curso suman
    // puntos al ranking (regla de Memo, 25-oct); los anteriores quedan como
    // historial — y eso ya lo hace calcularPuntosAnio por construcción.
    const anioHoy = new Date().getFullYear();
    const hist = Array.isArray(histTours) ? histTours : null;
    const filaHist = (t) => `<div style="border:1px solid var(--border);border-left:3px solid var(--gold,#ffb703);border-radius:10px;padding:10px 14px;background:var(--panel);margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
        <div><div style="font-weight:700;font-size:14px">${_iniEsc(t.artista || '—')}</div>
        <div style="font-size:11px;color:var(--ts)">${_iniEsc([t.ciudad, t.fecha_aprox, t.rol_en_tour].filter(Boolean).join(' · ') || 'sin detalle')}${t.fecha_aprox && new Date(t.fecha_aprox).getFullYear() !== anioHoy ? ' · <i>solo historial (no suma puntos este año)</i>' : ''}</div></div>
        ${soloVer ? '' : `<button class="btn btn-ghost btn-sm" style="font-size:11px;color:#ff6666" onclick="gzHistEliminar('${_attrJs(t.id)}')">🗑</button>`}
      </div>`;
    const histHtml = hist === null
      ? '<div style="color:var(--ts);font-size:12px">No se pudo cargar tu historial.</div>'
      : (hist.length ? hist.map(filaHist).join('') : '<div style="color:var(--ts);font-size:12px">Nada capturado todavía.</div>');
    cont.innerHTML = `${soloVer ? '<div style="margin-bottom:12px;font-size:12px;color:var(--gold,#ffb703)">👁 Modo «Ver como»: solo lectura.</div>' : ''}
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--green);margin:4px 0 8px">Próximos y activos · ${prox.length}</div>
      ${prox.length ? prox.map((a) => card(a, false)).join('') : '<div style="color:var(--ts);font-size:13px;margin-bottom:14px">Sin tours próximos asignados.</div>'}
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ts);margin:18px 0 8px">Pasados · ${pas.length}</div>
      ${pas.length ? pas.map((a) => card(a, true)).join('') : '<div style="color:var(--ts);font-size:13px">Todavía no tienes tours pasados.</div>'}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:18px 0 8px;flex-wrap:wrap">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ts)">Fuera del sistema · ${hist ? hist.length : '?'}</div>
        ${soloVer ? '' : `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="abrirAgregarTour('${_attrJs(_histUid)}')">+ Agregar tour pasado</button>`}
      </div>
      <div style="font-size:11px;color:var(--ts);margin-bottom:8px">Tours que coordinaste antes de que existiera el sistema. Solo los de ${anioHoy} suman puntos al ranking; los anteriores quedan en tu historial.</div>
      ${histHtml}`;
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">No se pudieron cargar tus tours: ${_iniEsc(e.message)}</div>`;
  }
}

// [GZ-HIST-1] Borrar un tour del historial propio. El backend ya tiene el
// candado: solo el dueño (o admin) puede borrarlo — aquí no se re-implementa.
async function gzHistEliminar(tourId) {
  if (_gzVerComoId()) return;
  if (!confirm('¿Quitar este tour de tu historial?')) return;
  try {
    await khTours.eliminar(tourId); // [sec-tours]
    showToast('Tour quitado del historial', 'success');
    loadGzTours();
  } catch (e) { showToast(e.message, 'error'); }
}

async function gzTourResponder(asigId, decision) {
  if (_gzVerComoId()) return;
  if (decision === 'declinar') {
    const motivo = prompt('¿Por qué no puedes asistir? (opcional):');
    if (motivo === null) return;
    try {
      const r = await khAsignaciones.responder(asigId, 'declinar', motivo || '');
      const a = (r && r.asignacion) || {};
      try {
        const evN = a.evento_id ? await khEventosMeta.porSlug(String(a.evento_id).split('#')[0]).then((m) => (m && m.nombre) || a.evento_id).catch(() => a.evento_id) : '';
        if (typeof enviarAlertaMemo === 'function') await enviarAlertaMemo('tour_declinado', { nombre: currentUser.nombre, evento: evN, motivo: motivo || '' });
      } catch (e) { /* el aviso a Memo es de cortesía */ }
      showToast('Respuesta registrada — Memo será notificado', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  } else {
    try {
      await khAsignaciones.responder(asigId, 'aceptar');
      try { await khViajeros.upsertStaff(asigId); } catch (e) { console.warn('[viajero-staff]', e.message); }
      showToast('¡Tour aceptado!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  }
  loadGzTours();
}

async function gzTourAbrir(eventoId) {
  const box = document.getElementById('gzt-det-' + String(eventoId).replace(/[^A-Za-z0-9_-]/g, '_'));
  if (!box) return;
  if (box.dataset.abierto === '1') { box.innerHTML = ''; box.dataset.abierto = ''; return; }
  box.dataset.abierto = '1';
  box.innerHTML = '<div class="loading-state" style="padding:14px"><div class="spinner"></div>Cargando…</div>';
  const evMap = window._gzEvMap || {};
  const ev = _gzEvDe(eventoId, evMap);
  // Un multifecha asignado al evento base guarda su lista POR FECHA.
  const mf = (!String(eventoId).includes('#') && ev && Array.isArray(ev.multifecha) && ev.multifecha.length > 1) ? ev.multifecha : null;
  const partes = mf ? mf.map((f, i) => ({ slug: `${eventoId}#${i}`, titulo: (f && f.lbl) || `Fecha ${i + 1}` })) : [{ slug: eventoId, titulo: null }];
  try {
    const [listas, tour] = await Promise.all([
      Promise.all(partes.map((p) => khViajeros.listarConEquipo(p.slug).catch((e) => ({ _err: e.message, viajeros: [] })))),
      _gzCall({ accion: 'tour', evento_id: eventoId }).catch((e) => ({ _err: e.message })),
    ]);
    const esc = _iniEsc;
    let html = '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">';
    if (tour && tour.grupo_whatsapp) html += `<a class="btn btn-ghost btn-sm" style="color:#25d366;border-color:rgba(37,211,102,.4);margin-bottom:10px" href="${esc(tour.grupo_whatsapp)}" target="_blank" rel="noopener">💬 Grupo de WhatsApp del tour</a>`;
    // ── viajeros ──
    let total = 0, equipo = [];
    let tablas = '';
    listas.forEach((j, k) => {
      const lista = (j.viajeros || []).filter((v) => (typeof _clEsViajero === 'function' ? _clEsViajero(v) : true));
      total += lista.reduce((s, v) => s + (Number(v.boletos) > 0 ? Number(v.boletos) : 1), 0);
      const eq = Array.isArray(j.equipo) ? j.equipo : [];
      eq.forEach((p) => { if (!equipo.some((x) => x.nombre === p.nombre && x.papel === p.papel)) equipo.push(p); });
      const titulo = partes[k].titulo ? `<div style="font-weight:700;margin:10px 0 6px">${esc(partes[k].titulo)}</div>` : '';
      tablas += titulo + (j._err ? `<div class="alert alert-error">${esc(j._err)}</div>` : lista.length
        ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Nombre</th><th>Paquete</th><th>Zona</th><th>Talla</th><th>Emergencia</th></tr></thead><tbody>${lista.map((v, i) => `<tr><td>${i + 1}</td><td><b>${esc(v.nombre || '')}</b>${Number(v.boletos) > 1 ? ` <span style="color:var(--ts)">(${v.boletos} lugares)</span>` : ''}</td><td>${esc(khPaqueteTexto(v) || '—')}</td><td>${esc(v.zona_boleto || '—')}</td><td>${esc(v.talla_playera || '—')}</td><td style="font-size:11px">${esc(v.emergencia_nombre || '—')}${v.emergencia_parentesco ? ' (' + esc(v.emergencia_parentesco) + ')' : ''}${v.num_emergencia ? '<br>' + esc(v.num_emergencia) : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<div style="font-size:12px;color:var(--ts)">Sin viajeros con paquete PLUS / STAY / RIDE todavía.</div>');
    });
    html += `<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ts);margin:6px 0">🧳 Lista de viajeros · ${total}</div>${tablas}`;
    html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 14px"><button class="btn btn-ghost btn-sm" onclick="descargarListaViajeros('${_attrJs(eventoId)}')">↓ Descargar lista</button></div>`;
    // ── equipo ──
    if (equipo.length) {
      const ASIG = { aceptado: 'aceptó', pendiente: 'por aceptar', declinado: 'declinó' };
      html += `<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ts);margin:6px 0">👥 Equipo del tour</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">${equipo.map((p) => `<span style="font-size:12px;padding:4px 9px;border:1px solid var(--border);border-radius:999px">${esc(p.nombre || '—')} · <i style="color:var(--ts)">${esc(p.papel || '')}${p.asignacion ? ' · ' + esc(ASIG[p.asignacion] || p.asignacion) : ''}</i></span>`).join('')}</div>`;
    }
    // ── rooming ──
    html += `<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ts);margin:6px 0">🛏 Rooming list</div>`;
    if (tour && tour._err) html += `<div class="alert alert-error">${esc(tour._err)}</div>`;
    else if (!tour || !tour.rooming || !tour.rooming.length) html += '<div style="font-size:12px;color:var(--ts)">Bulma y Milk todavía no arman el rooming de este tour. Aquí aparecerá en cuanto lo capturen.</div>';
    else {
      const T = { individual: 'Individual', doble: 'Doble', triple: 'Triple', cuadruple: 'Cuádruple' };
      const h0 = tour.rooming[0];
      html += `${h0.hotel_nombre ? `<div style="font-size:12px;margin-bottom:6px">🏨 <b>${esc(h0.hotel_nombre)}</b>${h0.hotel_direccion ? ' · ' + esc(h0.hotel_direccion) : ''}${h0.incluye_desayuno ? ' · ✓ desayuno' : ''}</div>` : ''}
        <div class="table-wrap"><table><thead><tr><th>Habitación</th><th>Tipo</th><th>Ocupantes</th></tr></thead><tbody>${tour.rooming.map((h, i) => `<tr><td>${esc(h.numero_hab || 'Hab. ' + (i + 1))}</td><td>${esc(T[h.tipo] || h.tipo || '—')}</td><td>${h.ocupantes.length ? h.ocupantes.map(esc).join('<br>') : '<span style="color:var(--ts)">—</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    }
    html += '</div>';
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = `<div class="alert alert-error" style="margin-top:10px">${_iniEsc(e.message)}</div>`;
  }
}
