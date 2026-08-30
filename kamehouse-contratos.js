// =============================================================================
// kamehouse-contratos.js — los contratos, sacados del tronco (MONO-13)
// =============================================================================
// Mismas reglas de la serie: SOLO funciones, en el MISMO ORDEN, con su
// comentario pegado, y cero código de nivel superior.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

// — VÍA B (F5): cláusulas de COORDINADOR (12) y GIVEAWAY (6) para la vista previa
//   admin. Texto FIEL de contratos-viaB-v3.1-TEXTO-OFICIAL.md (mismo que renderiza
//   contrato.html en la firma). {{campos}} se inyectan vía el ctx de _viaBCtxKh.
// VIGENCIA CONFIGURABLE: meses → "seis (6)" (mismo helper que contrato.html).
function _vigenciaLetraKh(n) {
  const map = { 3: 'tres (3)', 6: 'seis (6)', 9: 'nueve (9)', 12: 'doce (12)' };
  return map[n] || (n + ' (' + n + ')');
}
function _viaBCtxKh(c) {
  const firmado = c.estado === 'firmado';
  const d = c.datos || {};
  const em = (d.emergencia && typeof d.emergencia === 'object') ? d.emergencia : {};
  const _fb = v => (v == null || String(v).trim() === '') ? '__________' : _escCtr(String(v));
  const vigMeses = Math.round(Number(c.vigencia_meses)) || (c.plantilla === 'creadora_team' ? 3 : 12);
  // [T1] Mismo gate que contrato.html: la vista previa muestra el texto que el
  // backend va a sellar, no uno distinto.
  const exclusivaDura = d.exclusividad_dura === true;
  return {
    exclusivaDura,
    nombre: _escCtr(c.creador_nombre || ''), fnac: _fb(d.fecha_nacimiento),
    vigMeses,
    vigDura: _vigenciaLetraKh(vigMeses).toUpperCase() + ' MESES',
    vigLetra: _vigenciaLetraKh(vigMeses),
    firmaTxt: firmado ? _escCtr(_fmtFechaLargaCtr((c.vigencia_inicio||'').slice(0,10))) : 'tu firma',
    finTxt:   firmado ? _escCtr(_fmtFechaLargaCtr((c.vigencia_fin||'').slice(0,10)))    : `${_vigenciaLetraKh(vigMeses)} meses después`,
    vigResumen: firmado
      ? `del ${_escCtr(_fmtFechaLargaCtr((c.vigencia_inicio||'').slice(0,10)))} al ${_escCtr(_fmtFechaLargaCtr((c.vigencia_fin||'').slice(0,10)))}`
      : `${_vigenciaLetraKh(vigMeses)} meses a partir de tu firma`,
    emNom: _fb(em.nombre), emTel: _fb(em.telefono), emPar: _fb(em.parentesco),
    evento: _escCtr(c.evento_nombre || ''), fechaEvento: _escCtr(_fmtFechaCortaCtr(c.evento_fecha)),
    desglose: _escCtr(String(d.desglose_premio || '__________')),
    valor: (d.valor_premio && Number(d.valor_premio)) ? Number(d.valor_premio).toLocaleString('es-MX') : '__________',
  };
}
function _renderContratoTeamKh(c) {
  const x = _viaBCtxKh(c);
  const titulos = _CTR_TEAM_TITULOS.map(([ord, t]) => `
    <div style="padding:7px 0 7px 12px;border-left:4px solid #e8ff4c;margin-top:8px;font-size:13px;color:#000">
      <span style="color:#ff283b;font-weight:900;margin-right:8px">${_escCtr(ord)}</span><b>${_escCtr(t)}</b>
    </div>`).join('');
  return `
    <div style="display:flex;flex-wrap:wrap;gap:18px 28px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;font-weight:700"><span><b style="color:#000">Creadora (Imagen Oficial):</b> ${_esfEsc(x.nombre)}</span><span><b style="color:#000">Vigencia:</b> ${x.vigLetra} meses</span></div>
    <h2 style="font-family:'Barlow Condensed','Montserrat',sans-serif;font-size:34px;line-height:.92;text-transform:uppercase;margin:14px 0 0;color:#000">Contrato marco · Creadora TEAM<small style="display:block;font-size:13px;color:#ff283b;font-weight:800;letter-spacing:.18em;margin-top:6px">Imagen Oficial · periodo de prueba</small></h2>
    <p style="font-size:13.5px;line-height:1.6;color:#222;margin-top:14px">Entre <b>CONECTA REYNOSA</b> (Guillermo Cobos Vizcarra, Director General) y <b>${_esfEsc(x.nombre)}</b> ("LA CREADORA"), con vigencia de <b>${x.vigLetra} meses</b> a partir de la firma. Al firmar, la creadora completa sus datos del proemio y el <b>Anexo C (Declaración Discreta, confidencial)</b>.</p>
    <div style="margin-top:16px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#666;font-weight:800">18 cláusulas — texto oficial v1.1</div>
    ${titulos}
    <p style="margin-top:16px;font-size:12px;color:#666">El texto completo (fiel a contrato-team-v1-TEXTO-OFICIAL.md) se muestra en la página de firma /contrato — esta vista previa solo resume.</p>`;
}
function _renderContratoViaBHTML(c) {
  if (c && c.plantilla === 'creadora_team') return _renderContratoTeamKh(c);
  const x = _viaBCtxKh(c);
  const esCoord = c.plantilla === 'coordinador';
  const set = esCoord ? _CTR_COORDINADOR : _CTR_GIVE;
  const tituloDoc = esCoord ? 'Contrato de colaboración · Coordinadores' : 'Contrato de aceptación de premio · Giveaway';
  const meta = esCoord
    ? `<div style="display:flex;flex-wrap:wrap;gap:18px 28px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;font-weight:700"><span><b style="color:#000">Coordinador(a):</b> ${_esfEsc(x.nombre)}</span><span><b style="color:#000">Nacimiento:</b> ${x.fnac}</span><span><b style="color:#000">Vigencia:</b> ${x.vigResumen}</span></div>`
    : `<div style="display:flex;flex-wrap:wrap;gap:18px 28px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;font-weight:700"><span><b style="color:#000">Ganador(a):</b> ${_esfEsc(x.nombre)}</span><span><b style="color:#000">Evento:</b> ${x.evento}</span><span><b style="color:#000">Fecha:</b> ${x.fechaEvento}</span></div>`;
  const clausulas = set.map(cl => `
    <div style="margin-top:22px">
      <h3 style="font-family:'Barlow Condensed','Montserrat',sans-serif;text-transform:uppercase;font-size:20px;letter-spacing:.04em;margin:0 0 10px;border-left:5px solid #e8ff4c;background:linear-gradient(90deg,rgba(232,255,76,.2),transparent 60%);padding:6px 0 6px 12px;color:#000">
        <span style="color:#ff283b;font-weight:900;font-size:18px;margin-right:10px">${_escCtr(cl.ord)}</span>${_escCtr(cl.t)}
      </h3>
      <div style="font-size:13.5px;line-height:1.65;color:#222">${cl.body(x)}</div>
    </div>`).join('');
  return `
    ${meta}
    <h2 style="font-family:'Barlow Condensed','Montserrat',sans-serif;font-size:34px;line-height:.92;text-transform:uppercase;margin:14px 0 0;color:#000">${_escCtr(tituloDoc)}<small style="display:block;font-size:13px;color:#ff283b;font-weight:800;letter-spacing:.18em;margin-top:6px">${_escCtr(c.evento_nombre || '')}</small></h2>
    ${clausulas}
  `;
}
function _fmtFechaLargaCtr(iso) {
  if (!iso) return '—';
  const [y,m,d] = String(iso).slice(0,10).split('-'); if (!y || !m || !d) return iso;
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d,10)} de ${meses[parseInt(m,10)-1] || ''} de ${y}`;
}
function onCtrNombreInput() {
  const v = (document.getElementById('ctr-nombre').value || '').trim().toLowerCase();
  const match = _contratosCreadorasNombre2Email[v];
  if (match) {
    const emailEl = document.getElementById('ctr-email');
    if (emailEl && !emailEl.value) emailEl.value = match.email;
  }
}
function onCtrEmailInput() {
  const v = (document.getElementById('ctr-email').value || '').trim().toLowerCase();
  const match = _contratosCreadorasEmail2Nombre[v];
  if (match) {
    const nombreEl = document.getElementById('ctr-nombre');
    if (nombreEl && !nombreEl.value) nombreEl.value = match.nombre;
  }
}
function onContratoEventoChange() {
  const sel = document.getElementById('ctr-evento-select');
  const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
  if (!opt || !opt.value) return;
  const nombreInput = document.getElementById('ctr-evento-nombre');
  const fechaInput = document.getElementById('ctr-evento-fecha');
  if (nombreInput && opt.dataset.nombre) nombreInput.value = opt.dataset.nombre;
  if (fechaInput && opt.dataset.fecha) fechaInput.value = opt.dataset.fecha;
}
// Estilo NOTARIAL, idéntico a contrato.html: "a los quince (15) días del mes de
// junio de dos mil veintiséis (2026)"; día 1 → "al primer (1) día…". Incluye el
// "a los"/"al" (el proemio no lo antepone).
function _fechaTextoDiasKh(iso){ const p=String(iso||'').split('-'); if(p.length<3) return '—'; const y=parseInt(p[0],10), m=parseInt(p[1],10), d=parseInt(p[2],10); const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']; const mes=meses[m-1]||''; const anio=`${_anioEspKh(y)} (${y})`; return d===1 ? `al primer (1) día del mes de ${mes} de ${anio}` : `a los ${_numEspKh(d)} (${d}) días del mes de ${mes} de ${anio}`; }
function _masUnAnioKh(iso){ const p=String(iso||'').split('-'); if(p.length<3) return iso; return `${parseInt(p[0],10)+1}-${p[1]}-${p[2]}`; }
function _renderContratoAuxiliarHTML(c) {
  const sueldoN = (c.datos && Number(c.datos.sueldo_semanal)) || 0;
  const x = {
    nombre: _escCtr(c.creador_nombre || ''),
    sueldo: sueldoN ? '$' + sueldoN.toLocaleString('es-MX') : '__________',
    aniversario: _escCtr(_fmtFechaLargaCtr(_masUnAnioKh(c.contrato_fecha))),
    firmaTexto: _escCtr(_fechaTextoDiasKh(c.contrato_fecha)),
  };
  const meta = `
    <div style="display:flex;flex-wrap:wrap;gap:18px 28px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;font-weight:700">
      <span><b style="color:#000">Trabajadora:</b> ${_esfEsc(x.nombre)}</span>
      <span><b style="color:#000">Puesto:</b> Auxiliar administrativo</span>
      <span><b style="color:#000">Fecha del contrato:</b> ${_escCtr(_fmtFechaLargaCtr(c.contrato_fecha))}</span>
    </div>`;
  const intro = `
    <div style="border-top:3px solid #000;border-bottom:1px solid #ddd;padding:18px 0;margin:20px 0;font-size:14px;line-height:1.6">
      En la ciudad de Monterrey, Nuevo León, ${x.firmaTexto}, comparecen por una parte <b>CONECTA REYNOSA</b>, representada por el C. Guillermo Alexander Cobos Vizcarra, en su calidad de responsable operativo ("LA EMPRESA"), y por la otra parte la C. <b>${_esfEsc(x.nombre)}</b> ("LA TRABAJADORA"), quienes celebran el presente Contrato Individual de Trabajo por Tiempo Indefinido.
    </div>`;
  const clausulas = _CTR_CLAUSULAS_AUX.map(cl => `
    <div style="margin-top:22px">
      <h3 style="font-family:'Barlow Condensed','Montserrat',sans-serif;text-transform:uppercase;font-size:20px;letter-spacing:.04em;margin:0 0 10px;border-left:5px solid #e8ff4c;background:linear-gradient(90deg,rgba(232,255,76,.2),transparent 60%);padding:6px 0 6px 12px;color:#000">
        <span style="color:#ff283b;font-weight:900;font-size:24px;margin-right:10px">${cl.num}.</span>${_escCtr(cl.t)}
      </h3>
      <div style="font-size:13.5px;line-height:1.65;color:#222">${cl.body(x)}</div>
    </div>`).join('');
  return `
    ${meta}
    <h2 style="font-family:'Barlow Condensed','Montserrat',sans-serif;font-size:34px;line-height:.92;text-transform:uppercase;margin:14px 0 0;color:#000">Contrato Individual de Trabajo<small style="display:block;font-size:13px;color:#ff283b;font-weight:800;letter-spacing:.18em;margin-top:6px">Por Tiempo Indefinido · Auxiliar administrativo</small></h2>
    ${intro}
    ${clausulas}
    <p style="font-style:italic;color:#666;font-size:12px;margin-top:22px">Cada una de las hojas del presente contrato deberá ser rubricada por ambas partes. La firma se captura en el enlace que se envía a la trabajadora.</p>
  `;
}
function _renderContratoHTML(c) {
  // VÍA B (F5): coordinador/giveaway/creadora_team van por su propia vista
  // previa; auxiliar_admin por la laboral; 'creadora' (default) sigue EXACTAMENTE
  // igual que siempre.
  if (c && c.plantilla === 'auxiliar_admin') return _renderContratoAuxiliarHTML(c);
  if (c && (c.plantilla === 'coordinador' || c.plantilla === 'giveaway' || c.plantilla === 'creadora_team')) return _renderContratoViaBHTML(c);
  const partes = `
    <div style="border-top:3px solid #000;border-bottom:1px solid #ddd;padding:18px 0;margin:20px 0">
      <p style="margin:0 0 8px;font-size:14px"><b>Conecta MX</b> · Agencia organizadora de viajes a conciertos y festivales · representada por Guillermo Alexander Cobos Vizcarra (Reynosa, Tamaulipas).</p>
      <p style="color:#ff283b;font-weight:900;letter-spacing:.2em;font-size:11px;text-transform:uppercase;margin:8px 0">—— y ——</p>
      <p style="margin:0;font-size:14px"><b>${_escCtr(c.creador_nombre)}</b> · Creador(a) de contenido · ${_escCtr(c.creador_email)}.</p>
    </div>`;
  const meta = `
    <div style="display:flex;flex-wrap:wrap;gap:18px 28px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;font-weight:700">
      <span><b style="color:#000">Fecha del contrato:</b> ${_escCtr(_fmtFechaLargaCtr(c.contrato_fecha))}</span>
      <span><b style="color:#000">Evento:</b> ${_escCtr(c.evento_nombre)}</span>
      <span><b style="color:#000">Fecha del evento:</b> ${_escCtr(_fmtFechaLargaCtr(c.evento_fecha))}</span>
    </div>`;
  const clausulas = _CTR_CLAUSULAS.map(cl => `
    <div style="margin-top:22px">
      <h3 style="font-family:'Barlow Condensed','Montserrat',sans-serif;text-transform:uppercase;font-size:20px;letter-spacing:.04em;margin:0 0 10px;border-left:5px solid #e8ff4c;background:linear-gradient(90deg,rgba(232,255,76,.2),transparent 60%);padding:6px 0 6px 12px;color:#000">
        <span style="color:#ff283b;font-weight:900;font-size:24px;margin-right:10px">${cl.num}.</span>${_escCtr(cl.t)}
      </h3>
      <div style="font-size:13.5px;line-height:1.65;color:#222">${cl.body(c)}</div>
    </div>`).join('');

  return `
    ${meta}
    <h2 style="font-family:'Barlow Condensed','Montserrat',sans-serif;font-size:34px;line-height:.92;text-transform:uppercase;margin:14px 0 0;color:#000">Contrato de colaboración<small style="display:block;font-size:13px;color:#ff283b;font-weight:800;letter-spacing:.18em;margin-top:6px">Creadores · ${_escCtr(c.evento_nombre)}</small></h2>
    ${partes}
    ${clausulas}
  `;
}
function previewContrato() {
  const d = _ctrFormData();
  const err = _validateCtrForm(d);
  const alert = document.getElementById('ctr-alert');
  if (err) {
    alert.innerHTML = `<div style="padding:10px 14px;background:rgba(255,68,68,.12);border:1px solid rgba(255,68,68,.4);color:#ffb3b3;border-radius:var(--r-sm,8px);margin-bottom:14px;font-size:13px"><svg class="ic"><use href="#ic-alerta"/></svg> ${err}</div>`;
    return;
  }
  alert.innerHTML = '';
  document.getElementById('ctr-preview-body').innerHTML = _renderContratoHTML(d);
  openModal('modal-contrato-preview');
}
function cancelarEdicionContrato() {
  _contratosEditingToken = null;
  _resetFormUI();
  switchContratoView('listado');
}
function filtrarContratos(filtro, btn) {
  document.querySelectorAll('#page-contratos .gz-filter[id^="ctrf-"]').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _ctrFiltro = filtro;
  _ctrPintarLista();
}
function _ctrBuscarEnLista() {
  _ctrBusca = (document.getElementById('ctr-buscar')?.value || '').trim().toLowerCase();
  _ctrPintarLista();
}
function cortCerrar() {
  const p = _cortEl('cort-panel');
  if (p) p.style.display = 'none';
  _cortCtr = null;
}
async function cortGuardar() {
  if (!_cortCtr) return;
  const btn = _cortEl('cort-guardar');
  const alert = _cortEl('cort-alert');
  const evento_id = (_cortEl('cort-evento') || {}).value || '';
  const zona = (_cortEl('cort-zona') || {}).value || '';
  const boletos = parseInt((_cortEl('cort-boletos') || {}).value || '0', 10);
  const talla = (_cortEl('cort-talla') || {}).value || '';
  const faltaTalla = !_cortCtr.talla_contrato;
  const falta = !evento_id ? 'el evento' : !zona ? 'la zona' : (faltaTalla && !talla) ? 'la talla' : '';
  if (falta) { alert.innerHTML = `<div style="color:#ff5f56;font-size:12px;margin-bottom:8px">Falta ${falta}.</div>`; return; }

  btn.disabled = true; btn.textContent = 'Asignando…';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-coordi-asignaciones', {
      method: 'POST',
      body: JSON.stringify({ accion: 'cortesia_asignar', contrato_id: _cortCtr.id, evento_id, zona, boletos, talla: talla || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    alert.innerHTML = j.ya
      ? `<div style="color:#ffb020;font-size:12px;margin-bottom:8px">Ya estaba asignada — no se tocó nada.</div>`
      : `<div style="color:#3ddc84;font-size:12px;margin-bottom:8px">Listo: ${boletos} boleto${boletos > 1 ? 's' : ''} apartado${boletos > 1 ? 's' : ''} en ${_escCtr(zona)}${j.creada ? ' y viajero registrado' : ' (el viajero ya existía: se le puso la zona)'}.</div>`;
    if (typeof cargarContratos === 'function') cargarContratos();
  } catch (e) {
    alert.innerHTML = `<div style="color:#ff5f56;font-size:12px;margin-bottom:8px">No se pudo: ${_escCtr(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Asignar cortesía';
  }
}