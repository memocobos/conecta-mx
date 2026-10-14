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
// [CREA-3] El servidor encontró a alguien con nombre parecido en el evento y
// NO escribió nada. Se enseña quién es y se elige: completar esa fila o crear
// una nueva porque es otra persona. Nada se decide solo.
function _cortDuplicadoHtml(j) {
  const fila = (v, conBoton) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--border)">
      <span style="font-size:12px"><b>${_escCtr(v.nombre)}</b> · ${_escCtr(v.paquete || '—')} · ${_escCtr(v.zona || 'sin zona')} · ${_escCtr(String(v.boletos || 1))} boleto(s) · contrato $${Number(v.contrato || 0).toLocaleString('es-MX')} · ${_escCtr(v.tipo || 'cliente')}</span>
      ${conBoton ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;white-space:nowrap" onclick="cortGuardar({viajero_existente_id:'${_escCtr(v.id)}'})">Es ella: usar esta fila</button>` : ''}
    </div>`;
  // [CREA-3b] Una fila que es COMPRA (cliente con dinero) no se ofrece como
  // «es ella»: la cortesía va aparte o se contarían mal los boletos.
  const esCompra = (v) => (!v.tipo || v.tipo === 'cliente') && (Number(v.contrato || 0) > 0 || Number(v.pagado_previo || 0) > 0);
  const ella = (j.creadora || []).map((v) => fila(v, !esCompra(v)) + (esCompra(v) ? '<div style="font-size:11px;color:var(--ts);padding-bottom:4px">Ésta es una COMPRA suya: se queda como está y la cortesía se registra aparte.</div>' : '')).join('');
  const el = (j.acompanante || []).map((v) => fila(v, false)).join('');
  return `<div style="background:rgba(255,176,32,.08);border:1px solid rgba(255,176,32,.4);border-radius:6px;padding:10px 12px;margin-bottom:10px">
    <div style="color:#ffb020;font-size:12px;font-weight:700;margin-bottom:4px">⚠ Puede que ya esté en la lista de viajeros de este evento. No se guardó nada.</div>
    ${ella ? `<div style="font-size:11px;color:var(--ts);margin-top:6px">Parecida a ella:</div>${ella}` : ''}
    ${el ? `<div style="font-size:11px;color:var(--ts);margin-top:6px">Parecido a su acompañante:</div>${el}` : ''}
    <button class="btn" style="margin-top:10px;width:100%;font-size:12px" onclick="cortGuardar({es_otra_persona:true})">No, son otras personas: crear nuevos</button>
  </div>`;
}

async function cortGuardar(opcion) {
  if (!_cortCtr) return;
  opcion = opcion || {};
  const btn = _cortEl('cort-guardar');
  const alert = _cortEl('cort-alert');
  const evento_id = (_cortEl('cort-evento') || {}).value || '';
  const zona = (_cortEl('cort-zona') || {}).value || '';
  const boletos = parseInt((_cortEl('cort-boletos') || {}).value || '0', 10);
  const talla = (_cortEl('cort-talla') || {}).value || '';
  const faltaTalla = !_cortCtr.talla_contrato;
  // [CREA-2] Con 2+ boletos y un nombre, el acompañante nace viajero: su talla
  // es obligatoria (el kit va por persona). Sin nombre, el boleto extra solo
  // se aparta, como antes.
  const acNombre = boletos >= 2 ? ((_cortEl('cort-acomp-nombre') || {}).value || '').trim() : '';
  const acTalla = acNombre ? ((_cortEl('cort-acomp-talla') || {}).value || '') : '';
  const falta = !evento_id ? 'el evento' : !zona ? 'la zona' : (faltaTalla && !talla) ? 'la talla'
    : (acNombre && !acTalla) ? 'la talla del acompañante' : '';
  if (falta) { alert.innerHTML = `<div style="color:#ff5f56;font-size:12px;margin-bottom:8px">Falta ${falta}.</div>`; return; }

  btn.disabled = true; btn.textContent = 'Asignando…';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-coordi-asignaciones', {
      method: 'POST',
      body: JSON.stringify({ accion: 'cortesia_asignar', contrato_id: _cortCtr.id, evento_id, zona, boletos, talla: talla || undefined,
        // null EXPLÍCITO = «sin acompañante» (lo borró quien asigna): el
        // servidor no cae a lo del contrato. undefined (1 boleto) sí cae.
        acompanante: acNombre ? { nombre: acNombre, talla: acTalla } : (boletos >= 2 ? null : undefined),
        viajero_existente_id: opcion.viajero_existente_id || undefined,
        es_otra_persona: opcion.es_otra_persona === true ? true : undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409 && j.posible_duplicado) { alert.innerHTML = _cortDuplicadoHtml(j); return; }
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    alert.innerHTML = j.ya
      ? `<div style="color:#ffb020;font-size:12px;margin-bottom:8px">Ya estaba asignada — no se tocó nada.</div>`
      : `<div style="color:#3ddc84;font-size:12px;margin-bottom:8px">Listo: ${boletos} boleto${boletos > 1 ? 's' : ''} apartado${boletos > 1 ? 's' : ''} en ${_escCtr(zona)}${j.creada ? ' y viajero registrado' : ' (el viajero ya existía: se le puso la zona)'}${j.acompanante ? ` · ${_escCtr(j.acompanante.nombre || acNombre)} también quedó en viajeros, viajando con ella` : ''}.</div>`;
    if (typeof cargarContratos === 'function') cargarContratos();
  } catch (e) {
    alert.innerHTML = `<div style="color:#ff5f56;font-size:12px;margin-bottom:8px">No se pudo: ${_escCtr(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Asignar cortesía';
  }
}
// ═══ [CREA-BAJA-1] DAR DE BAJA LA COLABORACIÓN DE UNA CREADORA ════════════
// Palabra de Memo (14-oct): si una creadora no cumple lo pactado antes del
// evento, se cancela la colaboración y se le avisa por correo que el contrato
// queda sin efecto. Primero se ENSEÑA el correo exacto (seco) y solo con
// «Cancelar y enviar» se escribe y se manda. Solo maestro_roshi.
const _BAJA_MOTIVOS = [
  'No entregaste el contenido previo al evento acordado en el contrato (reel previo e historias de promoción).',
  'No respondiste a nuestros mensajes para coordinar el contenido previo al evento.',
  'El contenido entregado no cumple los requisitos acordados en el contrato.',
];
let _bajaCtr = null;
function _bajaEl(id) { return document.getElementById(id); }
function ctrBajaAbrir(contratoId) {
  _bajaCtr = (typeof _contratosCache !== 'undefined' ? _contratosCache : []).find((c) => c.id === contratoId) || { id: contratoId };
  let bg = _bajaEl('baja-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.id = 'baja-bg';
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    bg.addEventListener('click', (e) => { if (e.target === bg) ctrBajaCerrar(); });
    document.body.appendChild(bg);
  }
  bg.style.display = 'flex';
  bg.innerHTML = `<div style="background:var(--bg2,#121214);border:1px solid var(--border,#333);border-radius:14px;max-width:620px;width:100%;max-height:90vh;overflow:auto;padding:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <b style="font-size:16px">⛔ Dar de baja la colaboración</b>
      <button class="btn btn-ghost btn-sm" onclick="ctrBajaCerrar()">✕</button>
    </div>
    <div style="font-size:12px;color:var(--ts);margin-bottom:14px">${_escCtr(_bajaCtr.creador_nombre || '')} · ${_escCtr(_bajaCtr.evento_nombre || '')} — el contrato queda <b>cancelado</b> (no se borra), si tenía cortesía sus lugares regresan al inventario, y le llega un correo diciendo que el contrato queda sin efecto.</div>
    <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ts);margin-bottom:6px">Motivo (lo va a leer ella)</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">${_BAJA_MOTIVOS.map((m, i) => `<button type="button" class="btn btn-ghost btn-sm" style="text-align:left;white-space:normal;line-height:1.35" onclick="document.getElementById('baja-motivo').value=_BAJA_MOTIVOS[${i}]">${_escCtr(m)}</button>`).join('')}</div>
    <textarea id="baja-motivo" rows="3" maxlength="600" placeholder="Toca un motivo o escríbelo" style="width:100%;box-sizing:border-box;background:var(--bg3,#18181b);border:1px solid var(--border,#333);border-radius:8px;color:var(--text,#fff);padding:10px;font:inherit;font-size:13px"></textarea>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-primary" id="baja-ver" onclick="ctrBajaVer()">Ver el correo antes de enviar</button>
      <button class="btn btn-ghost" onclick="ctrBajaCerrar()">Cancelar</button>
    </div>
    <div id="baja-res" style="margin-top:12px"></div>
  </div>`;
}
function ctrBajaCerrar() { const bg = _bajaEl('baja-bg'); if (bg) bg.style.display = 'none'; }
async function _bajaLlamar(confirmar) {
  const motivo = ((_bajaEl('baja-motivo') || {}).value || '').trim();
  if (motivo.length < 5) throw new Error('Escribe el motivo');
  const r = await khAdminFetch('/.netlify/functions/admin-coordi-asignaciones', {
    method: 'POST',
    body: JSON.stringify({ accion: 'contrato_cancelar', contrato_id: _bajaCtr.id, motivo, confirmar: confirmar === true }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
async function ctrBajaVer() {
  const res = _bajaEl('baja-res'), btn = _bajaEl('baja-ver');
  btn.disabled = true; btn.textContent = 'Preparando…';
  try {
    const j = await _bajaLlamar(false);
    const p = j.plan || {};
    const cort = (p.cortesia_baja || []);
    res.innerHTML = `
      <div style="font-size:12px;margin-bottom:8px">Para: <b>${_escCtr(p.correo && p.correo.para)}</b><br>Asunto: <b>${_escCtr(p.correo && p.correo.asunto)}</b></div>
      <div style="font-size:12px;color:var(--ts);margin-bottom:8px">${cort.length ? `Se dan de baja de la lista de viajeros: ${cort.map((v) => `<b>${_escCtr(v.nombre)}</b> (${_escCtr(v.zona || '—')})`).join(', ')} — sus lugares regresan al inventario.` : 'No tenía cortesía asignada: no se mueve ningún boleto.'}</div>
      <div style="background:#fff;border-radius:8px;overflow:hidden;margin-bottom:12px">${(p.correo && p.correo.html) || ''}</div>
      ${j.ya_cancelado ? '<div style="font-size:12px;color:#ffb020;margin-bottom:8px">Este contrato ya estaba cancelado: si el correo no había salido, se reintenta.</div>' : ''}
      <button class="btn" id="baja-go" style="background:#ff4444;color:#fff;border-color:#ff4444" onclick="ctrBajaConfirmar()">Cancelar la colaboración y enviar el correo</button>`;
  } catch (e) {
    res.innerHTML = `<div style="color:#ff5f56;font-size:12px">No se pudo: ${_escCtr(e.message)}</div>`;
  } finally { btn.disabled = false; btn.textContent = 'Ver el correo antes de enviar'; }
}
async function ctrBajaConfirmar() {
  if (!confirm(`¿Seguro? Se cancela la colaboración de ${_bajaCtr.creador_nombre || 'esta creadora'} y le llega el correo.`)) return;
  const res = _bajaEl('baja-res'), btn = _bajaEl('baja-go');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const j = await _bajaLlamar(true);
    const c = j.correo || {};
    res.innerHTML = `<div style="color:#3ddc84;font-size:13px;font-weight:700">✓ Colaboración cancelada.</div>
      <div style="font-size:12px;margin-top:4px">${(j.bajas || []).length ? `Bajas de viajeros: ${(j.bajas).map((b) => _escCtr(b.nombre) + (b.ok ? ' ✓' : ' ⚠️ no se pudo')).join(', ')}. ` : ''}${c.enviado ? (c.ya ? 'El correo ya había salido antes.' : 'Correo enviado ✓') : `<span style="color:#ff5f56">⚠️ El correo NO salió (${_escCtr(c.error || 'sin respuesta')}). Vuelve a abrir «Dar de baja» para reintentarlo.</span>`}</div>`;
    if (typeof cargarContratos === 'function') cargarContratos();
    else if (typeof loadContratosList === 'function') loadContratosList();
  } catch (e) {
    res.innerHTML = `<div style="color:#ff5f56;font-size:12px">No se pudo: ${_escCtr(e.message)}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = 'Cancelar la colaboración y enviar el correo'; }
  }
}
