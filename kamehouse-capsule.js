// =============================================================================
// kamehouse-capsule.js — Capsule Corp, sacada del tronco (MONO-10)
// =============================================================================
// La pantalla de clientes y solicitudes: fichas, pagos, contratos y sus modales.
// La frontera MÁS ANCHA de la serie hasta ahora.
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

// Crea una notif vía la función (accion:'crear'). Fails-soft: NUNCA lanza, para
// no bloquear la acción principal (email/strike) si la notif falla.
async function _crearNotif(payload) {
  try {
    await khAdminFetch('/.netlify/functions/notificaciones', {
      method: 'POST', body: JSON.stringify(Object.assign({ accion: 'crear' }, payload)),
    });
  } catch (e) { /* fails-soft */ }
}
function _migEl(id) { return document.getElementById(id); }
function _migSlug() {
  const base = _ccEventoActual;
  if (!base) return null;
  return (_migFechaIdx == null) ? base : `${base}#${_migFechaIdx}`;
}
// ═══════════════════════════════════════════════════════════════════════════
// [FLUJO-UX-8] LA PUERTA NUEVA DEL ALTA — «+ Registrar cliente» desde Resumen
// ═══════════════════════════════════════════════════════════════════════════
// El wizard ya existía y ya capturaba las NUEVE columnas del Excel; lo que le
// faltaba era ROTULO y LUGAR. Aquí va el lugar: la tira de acciones rápidas de
// Resumen, medida como el punto cero (los tres roles aterrizan ahí y la tira se
// ve sin scroll). Esto NO reimplementa nada — pregunta el evento y le entrega
// el mando al MISMO `migAbrir()` de siempre.
//
// 🔒 REGISTRAR UN CLIENTE EMPIEZA POR EL EVENTO, y esa elección es del
// capturista: selector de papel MANDO (nace vacío, «— Elige un evento —»,
// `required`), la pieza de FLUJO-UX-4. Un default aquí ATRIBUIRÍA un cliente al
// evento que el orden de la lista puso primero — el defecto de `kmt-prov`, que
// mandó 3 compras a «Hotel».
//
// ⚠️ `expandirFechas:false` a propósito: el wizard resuelve la multifecha
// ADENTRO (`_migFechaIdx`, «la fecha se elige UNA vez»), igual que el Palacio.
// Y `_ccEventoActual` tiene que ser el slug BASE, porque `migAbrir` busca con
// `e.id === _ccEventoActual`; un `slug#idx` no casaría con ningún evento.
async function vjAltaAbrir() {
  if (typeof _vjPuedeAlta === 'function' && !_vjPuedeAlta()) return;
  const cont = document.getElementById('modal-vj-alta');
  if (!cont) return;
  cont.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">Registrar cliente</div>
        <button class="modal-close" onclick="closeModal('modal-vj-alta')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Evento *</label>
          <select class="cot-input" id="vj-alta-ev" style="width:100%"></select>
          <div class="fld-help">El separo y el boleto son de un evento: primero se elige cuál.</div>
        </div>
        <div id="vj-alta-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-vj-alta')">Cancelar</button>
        <button class="btn btn-primary" id="vj-alta-ir" onclick="vjAltaIr()">Continuar</button>
      </div>
    </div>`;
  const sel = document.getElementById('vj-alta-ev');
  let lista = [];
  try { lista = await _fetchEVFromIndex(); } catch (_) { lista = []; }
  // `_fetchEVFromIndex` NO LANZA: devuelve [] y hace console.warn. Un catálogo
  // vacío aquí no es «no hay eventos», es «no cargó», y se dice.
  if (!lista.length) {
    const a = document.getElementById('vj-alta-alert');
    if (a) a.innerHTML = '<div class="alert alert-error">No se pudo cargar el catálogo de eventos. Intenta de nuevo.</div>';
  }
  evSelectorPintar(sel, lista, { papel: 'mando', expandirFechas: false });
  openModal('modal-vj-alta');
  setTimeout(() => { if (sel) sel.focus(); }, 60);
}

// Lleva al MISMO sitio de siempre, en un paso: la ficha del evento, su pestaña
// de Viajeros, y el wizard abierto. El camino viejo no se toca ni se duplica.
async function vjAltaIr() {
  const sel = document.getElementById('vj-alta-ev');
  const id = sel && sel.value;
  const alerta = document.getElementById('vj-alta-alert');
  if (!id) {
    // El vacío del MANDO no es un valor: la pantalla no funciona sin él.
    if (alerta) alerta.innerHTML = '<div class="alert alert-error">Elige el evento para continuar.</div>';
    if (sel) sel.focus();
    return;
  }
  closeModal('modal-vj-alta');
  showPage('capsule');
  await abrirDetalleEvento(id);
  const sub = document.getElementById('cc-sub-btn-viajeros');
  // [FLUJO-UX-9b] `true` = la eligió la casa. Este salto a Viajeros es parte del
  // camino del alta, NO la costumbre de quien navega: registrarlo cambiaría el
  // aterrizaje de TODOS los eventos siguientes —a Roshi, además, de equipo a
  // viajeros— por haber usado una vez «+ Registrar cliente».
  if (typeof showCCSubTab === 'function') showCCSubTab('viajeros', sub, true);
  await migAbrir();
}

async function migAbrir() {
  const panel = _migEl('mig-panel');
  if (!panel || !_ccEventoActual) return;
  panel.style.display = '';
  _migCapturados = [];
  _migPendiente = null;
  _migFechaIdx = null;
  _migPintarCapturados();

  // El catálogo del evento: de ahí salen las zonas REALES. Escribirlas a mano
  // sería inventar una llave que después no casa con el stock ni con lo que el
  // cliente eligió en el sitio.
  _migEV = null;
  try {
    const ev = await _fetchEVFromIndex();
    _migEV = (ev || []).find(e => e && e.id === _ccEventoActual) || null;
  } catch (_) { /* fails-soft: se avisa abajo */ }

  const fw = _migEl('mig-fecha-wrap');
  const lista = _migEV && Array.isArray(_migEV.dsList) && _migEV.dsList.length > 1 ? _migEV.dsList : null;
  if (lista) {
    // Multifecha: la fecha se elige UNA vez y se captura la tanda (firmado).
    const sel = _migEl('mig-fecha');
    sel.innerHTML = lista.map((d, i) => `<option value="${i}">${_esfEsc(_migFechaTxt(d))}</option>`).join('');
    _migFechaIdx = 0;
    if (fw) fw.style.display = '';
  } else if (fw) { fw.style.display = 'none'; }

  const sub = _migEl('mig-sub');
  if (sub && !_migEV) {
    sub.textContent = 'No se pudo leer el catálogo del evento: las zonas se escriben a mano y podrían no casar con el stock.';
    sub.style.color = '#ff5f56';
  }
  migZonas();
  _migEl('mig-nombre') && _migEl('mig-nombre').focus();
}
function _migFechaTxt(ds) {
  if (!ds) return '(sin fecha)';
  const M = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const p = String(ds).split('-');
  return `${parseInt(p[2], 10)} ${M[parseInt(p[1], 10) - 1]} ${p[0]}`;
}
function migFechaElegida() {
  const sel = _migEl('mig-fecha');
  _migFechaIdx = sel ? parseInt(sel.value, 10) : null;
}
function migCerrar() {
  const p = _migEl('mig-panel');
  if (p) p.style.display = 'none';
  // Al cerrar se recarga la lista de migrados: lo capturado ya vive en la base.
  if (typeof _vj2Cargar === 'function') _vj2Cargar();
}
// Las zonas dependen del paquete: CHEAP tiene su propia lista de precios, y en
// varios eventos son OTROS nombres. Tomarlas de la lista equivocada guardaría
// una zona que el stock no reconoce.
function migZonas() {
  const paq = (_migEl('mig-paquete') || {}).value || '';
  const sel = _migEl('mig-zona');
  if (!sel) return;
  if (!paq) { sel.innerHTML = '<option value="">— elige paquete primero —</option>'; _migCuenta(); return; }
  const fuente = (paq === 'cheap')
    ? ((_migEV && _migEV.cheapZonas) || [])
    : ((_migEV && _migEV.zonas) || []);
  if (!fuente.length) {
    sel.innerHTML = '<option value="">— sin zonas en el catálogo —</option>';
  } else {
    sel.innerHTML = '<option value="">— elegir —</option>' + fuente.map(z =>
      `<option value="${_esfEsc(z.n)}">${_esfEsc(z.n)}${z.p ? ' · $' + Number(z.p).toLocaleString('es-MX') : ''}${z.ag ? ' (agotada)' : ''}</option>`
    ).join('');
  }
  _migCuenta();
}
// A qué cuenta va su dinero. NO se decide aquí: se muestra lo que decide la
// regla del negocio, para que quien captura vea a dónde cae antes de guardar.
// El espejo de `cuentaParaPaquete`: CHEAP → Banamex · el resto → el banco del
// evento o BBVA.
function _migCuenta() {
  const el = _migEl('mig-cuenta');
  if (!el) return;
  const paq = (_migEl('mig-paquete') || {}).value || '';
  if (!paq) { el.textContent = ''; return; }
  const banco = (paq === 'cheap')
    ? 'Banamex'
    : ((_migEV && _migEV.banco && _migEV.banco.nombre) || 'BBVA Bancomer');
  const viaja = (paq === 'plus' || paq === 'ride');
  const duerme = (paq === 'plus' || paq === 'ride' || paq === 'stay');
  el.innerHTML = `Su dinero se clasifica en <b style="color:var(--orange)">${_esfEsc(banco)}</b>` +
    ` · ${viaja ? 'viaja' : 'no viaja'} · ${duerme ? 'duerme' : 'no duerme'}`;
}
function _migLeer() {
  const g = id => ((_migEl(id) || {}).value || '').trim();
  return {
    evento_id: _migSlug(),
    nombre: g('mig-nombre'),
    correo: g('mig-correo'),
    celular: g('mig-celular'),
    tipo_paquete: g('mig-paquete'),
    zona_boleto: g('mig-zona'),
    total_contrato: g('mig-total'),
    abonado_previo: g('mig-abonado'),
    talla_playera: g('mig-talla'),
    // [CAP-MIG-FIX] Las dos columnas ya existían en `viajeros_evento`; solo
    // faltaba pedirlas en la pantalla.
    emergencia_nombre: g('mig-emerg-nombre'),
    num_emergencia: g('mig-emerg-num'),
    // El DESCUENTO se guarda en la NOTA para no perder el dato: `viajeros_evento`
    // no tiene columna propia, y añadir una migración de base por un renglón de
    // texto de transición es caro. Va con su rótulo, no suelto.
    notas: _migNotasConDescuento(g('mig-notas'), g('mig-desc')),
  };
}
// [CAP-MIG-FIX] El descuento no se pierde: si lo hay, se antepone a la nota con
// su rótulo. Hay que DECIRLO porque el total ya viene descontado, y sin esto
// nadie podría reconstruir de dónde salió el número.
function _migNotasConDescuento(nota, desc) {
  const d = Number(String(desc || '').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(d) || d <= 0) return nota;
  const t = `descuento aplicado: $${d.toLocaleString('es-MX')}`;
  return nota ? `${t} · ${nota}` : t;
}
async function _migSugerirCosto(soloDescuento) {
  const pista = _migEl('mig-sug');
  const campo = _migEl('mig-total');
  if (!campo) return;
  if (soloDescuento) { _migPintaSugerencia(); return; }   // mover el descuento no re-pregunta

  const evento_id = _migSlug();
  const tipo_paquete = ((_migEl('mig-paquete') || {}).value || '').trim();
  const zona = ((_migEl('mig-zona') || {}).value || '').trim();
  _migSugBase = null;
  if (!evento_id || !tipo_paquete) { _migPintaSugerencia(); return; }
  if (pista) pista.textContent = 'calculando…';
  try {
    const j = await khViajeros.precioSugerido({ evento_id, tipo_paquete, zona });
    _migSugBase = (j && Number.isFinite(Number(j.sugerido))) ? Number(j.sugerido) : null;
    if (_migSugBase == null) {
      // Honesto: se dice el motivo. Un cero se leería como "cuesta cero".
      if (pista) pista.textContent = 'sin sugerencia: ' + ((j && j.motivo) || 'el catálogo no alcanza');
      return;
    }
  } catch (_) {
    _migSugBase = null;
    if (pista) pista.textContent = 'sin sugerencia (no se pudo consultar)';
    return;
  }
  _migPintaSugerencia(true);
}
function _migPintaSugerencia(rellenar) {
  const pista = _migEl('mig-sug');
  const campo = _migEl('mig-total');
  if (!pista || !campo) return;
  if (_migSugBase == null) { pista.textContent = ''; return; }
  const d = Number(String(((_migEl('mig-desc') || {}).value || '')).replace(/[^0-9.-]/g, ''));
  const desc = (Number.isFinite(d) && d > 0) ? d : 0;
  const sug = Math.max(0, _migSugBase - desc);
  pista.textContent = desc > 0
    ? `sugerido del catálogo: $${_migSugBase.toLocaleString('es-MX')} − $${desc.toLocaleString('es-MX')} de descuento = $${sug.toLocaleString('es-MX')} · editable`
    : `sugerido del catálogo: $${sug.toLocaleString('es-MX')} · editable`;
  // ⚠️ Solo se rellena si el campo está VACÍO o si trae la sugerencia anterior.
  // Pisar un número que Memo escribió a mano sería perder el dato del Excel —
  // justo lo que la regla de oro de VJ-3 protege.
  const actual = String(campo.value || '').trim();
  const eraSug = actual === '' || actual === String(campo.dataset.sug || '');
  if ((rellenar || desc > 0) && eraSug) {
    campo.value = String(sug);
    campo.dataset.sug = String(sug);
  }
}
function _migError(msg) {
  const e = _migEl('mig-error');
  if (!e) return;
  if (!msg) { e.style.display = 'none'; e.textContent = ''; return; }
  e.style.display = ''; e.textContent = msg;
}
async function migGuardar() {
  _migError('');
  _migEl('mig-parecido').style.display = 'none';
  const d = _migLeer();
  if (!d.evento_id) return _migError('No hay evento abierto.');
  if (!d.nombre) return _migError('El nombre es obligatorio.');
  if (!d.tipo_paquete) return _migError('Elige el paquete.');
  if (!d.zona_boleto) return _migError('Elige la zona del boleto.');
  if (d.total_contrato === '') return _migError('Falta el costo del paquete.');

  // El deduplicado que Memo pidió proponer. NO cuelga del correo: muchos del
  // Excel no lo traen, y en Postgres NULL != NULL deja pasar TODOS los
  // duplicados sin decir nada. Se compara el nombre normalizado dentro del
  // MISMO evento, y lo confirma un humano — dos personas con el mismo nombre
  // existen; un duplicado silencioso también.
  let parecidos = [];
  try { parecidos = await khViajeros.buscarParecido(d.evento_id, d.nombre, d.correo); } catch (_) {}
  if (parecidos.length) {
    _migPendiente = d;
    _migEl('mig-parecido-list').innerHTML = parecidos.map(v =>
      `· <b>${_esfEsc(v.nombre)}</b>${v.correo ? ' · ' + _esfEsc(v.correo) : ''}` +
      `${v.tipo_paquete ? ' · ' + _esfEsc(String(v.tipo_paquete).toUpperCase()) : ''}` +
      `${v.zona_boleto ? ' · ' + _esfEsc(v.zona_boleto) : ''}` +
      `${v.total_contrato != null ? ' · ' + _vj3Money(v.total_contrato) : ''}`
    ).join('<br>');
    _migEl('mig-parecido').style.display = '';
    return;
  }
  await _migEnviar(d);
}
function migCancelarParecido() {
  _migPendiente = null;
  _migEl('mig-parecido').style.display = 'none';
  _migEl('mig-nombre') && _migEl('mig-nombre').focus();
}
async function migGuardarIgual() {
  const d = _migPendiente;
  _migPendiente = null;
  _migEl('mig-parecido').style.display = 'none';
  if (d) await _migEnviar(d);
}
async function _migEnviar(d) {
  const btn = _migEl('mig-guardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const r = await khViajeros.migrar(d);
    const v = r && r.viajero;
    if (!v) throw new Error('el servidor no devolvió el viajero');
    _migCapturados.unshift(v);
    _migPintarCapturados();
    // [MIG-1b] El aviso del DOBLE DESCUENTO. No se traga: si esta gente ya
    // estaba en el corte del Excel que Memo capturó como "vendidos fuera",
    // ahora se descuenta dos veces y el semáforo cierra zonas que sí tienen
    // boletos. Se dice con el número exacto y el ajuste lo confirma él.
    _migAvisoDoble(r && r.aviso_doble_descuento);
    // Uno tras otro: se limpia lo de la persona y se CONSERVA paquete y zona,
    // que en una tanda del Excel se repiten. El foco vuelve al nombre.
    ['mig-nombre','mig-correo','mig-celular','mig-total','mig-abonado','mig-talla','mig-notas']
      .forEach(id => { const el = _migEl(id); if (el) el.value = ''; });
    _migEl('mig-nombre') && _migEl('mig-nombre').focus();
    _migError('');
  } catch (e) {
    _migError((e && e.message) || 'No se pudo guardar.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar y seguir →'; }
  }
}
function _migAvisoDoble(aviso) {
  const box = _migEl('mig-aviso-doble');
  if (!box) return;
  if (!aviso || !aviso.zona) { box.style.display = 'none'; box.innerHTML = ''; _migAvisoZona = null; return; }
  _migAvisoZona = aviso;
  box.style.display = '';
  box.innerHTML = `<div class="mig-doble">
    <div class="mig-doble-t">⚠️ Cuidado: se podría descontar dos veces</div>
    <div class="mig-doble-d">${_esfEsc(aviso.mensaje)}</div>
    <div class="mig-doble-btns">
      <button type="button" class="btn btn-primary btn-sm" onclick="_migAjustarFuera()">Bajar a ${aviso.sugerido}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="_migAvisoDoble(null)">Son personas distintas</button>
    </div>
  </div>`;
}
// El ajuste REUSA la misma puerta que la casilla del Palacio (`ajuste_guardar`
// de admin-compras): no nace un segundo camino para escribir el mismo dato.
async function _migAjustarFuera() {
  const a = _migAvisoZona;
  if (!a) return;
  const evId = _migSlug();
  if (!evId) { _migError('No hay evento abierto.'); return; }
  if (!confirm(`¿Bajar "vendidos fuera" de ${a.zona} de ${a.vendidos_fuera} a ${a.sugerido}?\n\nHazlo SOLO si esa gente ya está migrada: baja el número, o sea ABRE stock.`)) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-compras', {
      method: 'POST',
      body: JSON.stringify({ accion: 'ajuste_guardar', evento_id: evId, zona: a.zona, vendidos_fuera: a.sugerido,
                             nota: `ajustado al migrar ${a.migrados_en_zona} viajero(s) — MIG-1b` }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo ajustar');
    _migAvisoDoble(null);
    _migError('');
  } catch (e) { _migError((e && e.message) || 'No se pudo ajustar.'); }
}
function _migPintarCapturados() {
  const cnt = _migEl('mig-cnt');
  if (cnt) cnt.textContent = String(_migCapturados.length);
  const box = _migEl('mig-capturados');
  if (!box) return;
  if (!_migCapturados.length) {
    box.innerHTML = '<div style="font-size:11px;color:var(--ts)">Todavía no capturas a nadie en esta tanda.</div>';
    return;
  }
  box.innerHTML = _migCapturados.map(v => {
    // La MISMA fórmula sellada que usa el resto del Palacio y el servidor.
    const s = _vj3Saldo(v, []);
    const dinero = s
      ? `${_vj3Money(s.total)} · abonó ${_vj3Money(s.abonado)} · ${s.aFavor ? 'a favor ' : 'resta '}${_vj3Money(s.resta)}`
      : 'sin dinero';
    return `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);font-size:11px">
      <span style="color:var(--green)">✓</span>
      <b style="min-width:150px">${_esfEsc(v.nombre)}</b>
      <span style="color:var(--orange);font-family:'JetBrains Mono',monospace">${_esfEsc(String(v.tipo_paquete || '').toUpperCase())}</span>
      <span style="color:var(--ts)">${_esfEsc(v.zona_boleto || '')}</span>
      <span style="margin-left:auto;color:var(--ts);font-family:'JetBrains Mono',monospace">${dinero}</span>
    </div>`;
  }).join('');
}
// ── Filtro eventos (fecha + buscador, combinados) ────────────
function filtrarCCEventos(filtro, btn) {
  document.querySelectorAll('#page-capsule .gz-filter[id^="ccf-"]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _ccFiltroFecha = filtro;        // recuerda el filtro de fecha activo
  filtrarCapsule();               // re-aplica fecha + texto del buscador
}
// Buscador por nombre; se combina con el filtro de fecha activo (_ccFiltroFecha).
// Texto vacío → solo aplica el filtro de fecha (igual que antes).
function filtrarCapsule() {
  const q = (document.getElementById('cc-buscar')?.value || '').trim().toLowerCase();
  const lista = q
    ? _ccEventosCache.filter(e => String(e.nombre || '').toLowerCase().includes(q))
    : _ccEventosCache;
  renderCCEventos(lista, _ccFiltroFecha);
}
// ── Crear / Editar evento ────────────────────────────────────
function abrirModalCrearEvento() { abrirModalEvento(null); }
async function abrirModalAsignarCoordi() {
  const rolesAsignables = ['coordinador','cc','mister_popo','maestro_roshi','bulma'];
  let usuarios = [];
  try { usuarios = await khUsuarios.listar({ activos: true, orden: 'nombre' }); } // [sec-usuarios]
  catch(e) {}
  // Excluir ya asignados
  const asignadosIds = _ccAsignados.map(a=>a.coordi_id);
  usuarios = usuarios.filter(u => rolesAsignables.includes(u.rol) && !asignadosIds.includes(u.id));
  // Cargar deudas pendientes de cada usuario para advertir
  const deudasPend = await khCoordi.deudasListar({ pagado: false }).catch(()=>[]); // [sec-sensibles]
  const deudasPorUser = {};
  deudasPend.forEach(d => {
    if (!deudasPorUser[d.coordi_id]) deudasPorUser[d.coordi_id] = 0;
    deudasPorUser[d.coordi_id] += (d.monto||0);
  });

  const opts = usuarios.map(u => {
    const deuda = deudasPorUser[u.id]||0;
    const warn = deuda > 0 ? ` <svg class="ic"><use href="#ic-alerta"/></svg> debe ${formatMXN(deuda)}` : '';
    const strike = u.strikes >= 2 ? ` <svg class="ic"><use href="#ic-alerta"/></svg> ${u.strikes} strikes` : '';
    return `<option value="${u.id}">${_esfEsc(u.nombre)} · ${u.rol}${warn}${strike}</option>`;
  }).join('');
  document.getElementById('modal-asignar-coordi').innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">Asignar persona al evento</div>
        <button class="modal-close" onclick="closeModal('modal-asignar-coordi')">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Persona *</label>
          <select class="cot-input" id="ac-coordi-sel" style="width:100%">
            <option value="">— Selecciona —</option>${opts}
          </select>
        </div>
        <div class="form-group">
          <label>Indicaciones especiales</label>
          <textarea class="cot-input" id="ac-indicaciones" rows="3" placeholder="Punto de encuentro, responsabilidades, horario…" style="width:100%;resize:vertical"></textarea>
        </div>
        <div style="background:rgba(255,183,3,.06);border:1px solid rgba(255,183,3,.15);border-radius:var(--r-sm,8px);padding:12px;font-size:11px;color:var(--gold);font-family:'JetBrains Mono',monospace">
          Se enviará un correo con link para aceptar o declinar
        </div>
        <div id="ac-alert" style="margin-top:8px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-asignar-coordi')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarAsignacionCoordi()">Asignar y notificar →</button>
      </div>
    </div>`;
  openModal('modal-asignar-coordi');
}
async function guardarAsignacionCoordi() {
  const coordiId     = document.getElementById('ac-coordi-sel')?.value;
  const indicaciones = document.getElementById('ac-indicaciones')?.value.trim()||null;
  const alertEl      = document.getElementById('ac-alert');
  if (!coordiId) { alertEl.innerHTML='<div class="alert alert-error">Selecciona una persona</div>'; return; }
  alertEl.innerHTML='<div class="alert" style="border-color:var(--border)">Guardando…</div>';
  try {
    const asig = await khAsignaciones.crear({ // [sec-coordi]
      evento_id: _ccEventoActual,
      coordi_id: coordiId,
      indicaciones,
    });
    // Correo con link aceptar/declinar
    const ev = _ccEventosCache.find(e=>e.id===_ccEventoActual);
    const usuario = await khUsuarios.obtener(coordiId); // [sec-usuarios]
    const asigId = asig?.asignacion?.id; // [sec-coordi]
    const baseUrl = window.location.origin + window.location.pathname;
    const linkAceptar = `${baseUrl}?accion=aceptar&asig=${asigId}`;
    const linkDeclinar = `${baseUrl}?accion=declinar&asig=${asigId}`;
    if (usuario?.correo_notif || usuario?.correo) {
      await khAdminFetch('/.netlify/functions/send-invite', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          to: usuario.correo_notif || usuario.correo,
          subject: `Tour asignado: ${ev?.nombre||'Evento'}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px">
            <h2 style="color:#FF6B00;margin-bottom:8px">Tour Asignado</h2>
            <p>Hola <strong>${_esfEsc(usuario.nombre)}</strong>,</p>
            <p>Se te ha asignado el siguiente tour:</p>
            <div style="background:#1a1a24;border-left:3px solid #FF6B00;padding:16px 20px;border-radius:8px;margin:20px 0">
              <div style="font-size:20px;font-weight:700">${_esfEsc(ev?.nombre||'')}</div>
              <div style="color:#888899;font-size:13px">${ev?.artista?_esfEsc(ev.artista)+' · ':''}${_esfEsc(ev?.ciudad||'')}</div>
              <div style="color:#888899;font-size:13px">${ev?.fecha?new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):''}</div>
            </div>
            ${indicaciones?`<p><strong>Indicaciones:</strong><br><span style="color:#888899">${_esfEsc(indicaciones)}</span></p>`:''}
            <div style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap">
              <a href="${linkAceptar}" style="background:#FF6B00;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">✅ Aceptar tour</a>
              <a href="${linkDeclinar}" style="background:#1a1a24;color:#f0f0f5;padding:12px 24px;border-radius:8px;text-decoration:none;border:1px solid #333">❌ Declinar</a>
            </div>
            <p style="color:#888899;font-size:12px;margin-top:32px">Conecta Reynosa · conectareynosa.mx</p>
          </div>`,
        }),
      });
    }
    // Notificación in-app al coordi (además del email). Fails-soft.
    await _crearNotif({
      usuario_id: coordiId, tipo: 'asignacion', titulo: 'Nuevo evento asignado',
      mensaje: `Te asignaron: ${ev?.nombre || 'un evento'}. Entra a tu perfil para verlo.`,
      link: 'perfil',
    });
    alertEl.innerHTML='<div class="alert alert-success">✓ Asignado y notificado</div>';
    setTimeout(async ()=>{ closeModal('modal-asignar-coordi'); await loadCCEquipo(); }, 900);
  } catch(e) { alertEl.innerHTML=`<div class="alert alert-error">${e.message}</div>`; }
}
// Notificar a todo el equipo que las listas están listas
async function notificarEquipoListas() {
  if (!_ccEventoActual) return;
  const aceptados = _ccAsignados.filter(a => a.status === 'aceptado');
  if (!aceptados.length) { alert('No hay equipo que haya aceptado aún'); return; }
  const ev = _ccEventosCache.find(e=>e.id===_ccEventoActual);
  const usuarios = await khUsuarios.listar({ ids: aceptados.map(a=>a.coordi_id) }); // [sec-usuarios]
  let enviados = 0;
  for (const u of usuarios) {
    const email = u.correo_notif || u.correo;
    if (!email) continue;
    await khAdminFetch('/.netlify/functions/send-invite', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        to: email,
        subject: `Listas listas: ${ev?.nombre||'Evento'}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px">
          <h2 style="color:#FF6B00">Listas actualizadas</h2>
          <p>Hola <strong>${_esfEsc(u.nombre)}</strong>,</p>
          <p>Las listas del evento <strong>${_esfEsc(ev?.nombre||'')}</strong> ya están listas.</p>
          <ul style="color:#888899;line-height:2">
            <li>Lista de viajeros</li>
            <li>Rooming list</li>
          </ul>
          <p>Entra al Kamehouse y revisa tu perfil para descargarlas.</p>
          <p style="margin-top:16px">No olvides pasar a <strong>Torre de Karin</strong> a recoger los kits antes del evento.</p>
          <p style="color:#888899;font-size:12px;margin-top:32px">Conecta Reynosa · conectareynosa.mx</p>
        </div>`,
      }),
    });
    // Notificación in-app (además del email). Fails-soft.
    await _crearNotif({
      usuario_id: u.id, tipo: 'listas', titulo: 'Listas actualizadas',
      mensaje: `Las listas de ${ev?.nombre || 'tu evento'} ya están listas. Descárgalas en tu perfil.`,
      link: 'perfil',
    });
    enviados++;
  }
  alert(`✓ Notificación enviada a ${enviados} persona${enviados!==1?'s':''}`);
}
// Descarga un blob HTML como archivo. Reemplaza window.open()+win.print(),
// que es bloqueado por Safari iOS y popup-blockers cuando la invocación
// ocurre tras un await async. El archivo descargado se abre en el navegador
// del usuario y desde ahí pueden imprimir/guardar como PDF.
function _descargarHTML(filename, html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}
function filtrarViajerosCC(filtro, btn) {
  _ccViajerosFiltro = filtro;
  document.querySelectorAll('#cc-sub-viajeros .gz-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _renderViajerosTabla();
}
// Las descargas del coordi, reusadas tal cual con el evento que ya está abierto.
function _vj2Descargar(cual) {
  if (!_ccEventoActual) { alert('Elige un evento primero'); return; }
  if (cual === 'rooming') return descargarRoomingList(_ccEventoActual);
  return descargarListaViajeros(_ccEventoActual);
}
// Formato básico: algo@algo.tld con TLD de 2+ letras, sin espacios.
function correoFormatoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(correo == null ? '' : correo).trim());
}
// Devuelve una corrección sugerida (string) o null. Conserva la parte local tal
// como se escribió; solo corrige el dominio/TLD.
function sugerenciaCorreo(correo) {
  const raw = String(correo == null ? '' : correo).trim();
  const at = raw.lastIndexOf('@');
  if (at < 1 || at === raw.length - 1) return null;
  const local = raw.slice(0, at);
  const dominio = raw.slice(at + 1).toLowerCase();
  if (_VJ_DOMINIOS_MALOS[dominio]) return local + '@' + _VJ_DOMINIOS_MALOS[dominio];
  const dot = dominio.lastIndexOf('.');
  if (dot > 0 && _VJ_TLD_MALOS[dominio.slice(dot + 1)]) {
    return local + '@' + dominio.slice(0, dot) + '.com';
  }
  return null;
}
function _vjLimpiarCorreoHint() {
  const el = document.getElementById('vj-correo-hint');
  if (el) el.innerHTML = '';
}
// Cualquier edición invalida una confirmación previa y limpia el aviso.
function _vjOnCorreoInput() {
  _vjCorreoConfirmado = false;
  _vjLimpiarCorreoHint();
}
// Feedback temprano al salir del campo (no bloquea; solo informa).
function _vjChequeoCorreoBlur() {
  const correo = (document.getElementById('vj-correo')?.value || '').trim();
  if (!correo) { _vjLimpiarCorreoHint(); return; }
  if (!correoFormatoValido(correo)) { _vjMostrarCorreoError('El correo no parece válido. Revísalo.'); return; }
  const sug = sugerenciaCorreo(correo);
  if (sug && !_vjCorreoConfirmado) { _vjMostrarCorreoSugerencia(sug); }
  else { _vjLimpiarCorreoHint(); }
}
function _vjMostrarCorreoError(msg) {
  const el = document.getElementById('vj-correo-hint');
  if (el) el.innerHTML = `<div style="font-size:12px;color:var(--red);padding:6px 8px;border:1px solid rgba(255,68,68,.3);border-radius:var(--r-sm,8px);background:rgba(255,68,68,.08)">${_spEscape(msg)}</div>`;
}
// Aviso amable con la sugerencia y dos opciones: corregir / usarlo igual.
function _vjMostrarCorreoSugerencia(sug) {
  _vjSugActual = sug;
  const el = document.getElementById('vj-correo-hint');
  if (!el) return;
  el.innerHTML = `<div style="font-size:12px;color:var(--text);padding:8px 10px;border:1px solid var(--border2);border-radius:var(--r-sm,8px);background:rgba(255,107,0,.06)">
    ¿Quisiste decir <b style="color:var(--orange)">${_spEscape(sug)}</b>?
    <div style="display:flex;gap:8px;margin-top:8px">
      <button type="button" class="btn btn-primary btn-sm" style="font-size:11px" onclick="_vjAceptarSugerencia()">Sí, corregir</button>
      <button type="button" class="btn btn-ghost btn-sm" style="font-size:11px" onclick="_vjUsarDeTodosModos()">Usarlo de todos modos</button>
    </div>
  </div>`;
}
function _vjAceptarSugerencia() {
  const inp = document.getElementById('vj-correo');
  if (inp && _vjSugActual) inp.value = _vjSugActual;
  _vjCorreoConfirmado = false;   // el corregido ya no tendrá sugerencia
  _vjLimpiarCorreoHint();
}
function _vjUsarDeTodosModos() {
  _vjCorreoConfirmado = true;
  const el = document.getElementById('vj-correo-hint');
  if (el) el.innerHTML = `<div style="font-size:11px;color:var(--ts)">Se usará el correo tal como lo escribiste — presiona “Guardar viajero”.</div>`;
}
function abrirModalViajero(id) {
  _vjCorreoConfirmado = false;
  const eventos = _ccEventosCache || [];
  const opcionesEvento = eventos
    .map(e => `<option value="${_spEscape(e.id)}" ${e.id===_ccEventoActual?'selected':''}>${_spEscape(e.nombre || e.id)}</option>`)
    .join('');
  const HABS = ['compartida','triple','doble','individual'];
  document.getElementById('modal-viajero').innerHTML = `
    <div class="modal" style="max-width:580px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">Nuevo viajero (walk-in)</div>
        <button class="modal-close" onclick="closeModal('modal-viajero')">×</button>
      </div>
      <div class="modal-body">
        <div style="font-size:11px;color:var(--ts);margin-bottom:14px;font-family:'JetBrains Mono',monospace">// Cliente de WhatsApp sin cuenta de portal. Se crea con su plan de pagos al instante.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="grid-column:1/-1">
            <label>Nombre completo *</label>
            <input class="cot-input" id="vj-nombre" placeholder="Nombre y apellido…" style="width:100%">
          </div>
          <div class="form-group">
            <label>Celular *</label>
            <input class="cot-input" id="vj-celular" placeholder="811…">
          </div>
          <div class="form-group">
            <label>Correo</label>
            <input class="cot-input" id="vj-correo" type="email" placeholder="correo@…" oninput="_vjOnCorreoInput()" onblur="_vjChequeoCorreoBlur()">
            <div style="font-size:10px;color:var(--ts);margin-top:4px">Opcional — necesario para invitarlo al portal después</div>
            <div id="vj-correo-hint" style="margin-top:6px"></div>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Evento *</label>
            <select class="cot-input" id="vj-evento" style="width:100%">
              ${opcionesEvento || '<option value="">— Sin eventos —</option>'}
            </select>
          </div>
          <div class="form-group">
            <label>Paquete *</label>
            <select class="cot-input" id="vj-paquete">
              <option value="PLUS">PLUS</option>
              <option value="RIDE">RIDE</option>
              <option value="STAY">STAY</option>
              <option value="CHEAP">CHEAP</option>
            </select>
          </div>
          <div class="form-group">
            <label>Zona / boleto *</label>
            <input class="cot-input" id="vj-zona" placeholder="Floor, GA, VIP…">
          </div>
          <div class="form-group">
            <label>Personas</label>
            <input class="cot-input" id="vj-personas" type="number" min="1" max="12" value="1">
          </div>
          <div class="form-group">
            <label>Habitación</label>
            <select class="cot-input" id="vj-habitacion">
              <option value="">— Sin habitación —</option>
              ${HABS.map(h=>`<option value="${h}">${h.charAt(0).toUpperCase()+h.slice(1)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Precio total * (MXN)</label>
            <input class="cot-input" id="vj-precio" type="number" min="0" step="1" placeholder="5000">
          </div>
          <div class="form-group">
            <label>Separo * (MXN)</label>
            <input class="cot-input" id="vj-separo" type="number" min="0" step="1" placeholder="1000">
          </div>
        </div>
        <div id="vj-alert" style="margin-top:6px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-viajero')">Cancelar</button>
        <button class="btn btn-primary" id="vj-guardar-btn" onclick="guardarViajero()">Guardar viajero</button>
      </div>
    </div>`;
  openModal('modal-viajero');
}
async function guardarViajero() {
  const alertEl = document.getElementById('vj-alert');
  const btn = document.getElementById('vj-guardar-btn');
  const err = (m) => { if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${m}</div>`; };

  const nombre   = (document.getElementById('vj-nombre')?.value||'').trim();
  const celular  = (document.getElementById('vj-celular')?.value||'').trim();
  const correo   = (document.getElementById('vj-correo')?.value||'').trim();
  const eventoId = document.getElementById('vj-evento')?.value || '';
  const paquete  = document.getElementById('vj-paquete')?.value || '';
  const zona     = (document.getElementById('vj-zona')?.value||'').trim();
  const personas = parseInt(document.getElementById('vj-personas')?.value, 10) || 1;
  const habitacion = document.getElementById('vj-habitacion')?.value || '';
  const precioTotal = Number(document.getElementById('vj-precio')?.value);
  const montoSeparo = Number(document.getElementById('vj-separo')?.value);

  if (!nombre)  return err('El nombre es obligatorio');
  if (!celular) return err('El celular es obligatorio');
  if (!eventoId) return err('Selecciona un evento');
  if (!['PLUS','RIDE','STAY','CHEAP'].includes(paquete)) return err('Selecciona un paquete');
  if (!zona) return err('La zona es obligatoria');
  if (!isFinite(precioTotal) || precioTotal < 0) return err('Precio total inválido');
  if (!isFinite(montoSeparo) || montoSeparo < 0) return err('Separo inválido');
  if (montoSeparo > precioTotal) return err('El separo no puede ser mayor que el total');

  // Validación del correo (opcional). Formato malo → bloquea. Formato bueno pero
  // con typo probable → sugiere y espera que el humano acepte o lo use igual.
  if (correo) {
    if (!correoFormatoValido(correo)) {
      _vjMostrarCorreoError('El correo no parece válido. Revísalo.');
      return err('El correo no parece válido. Revísalo.');
    }
    const sug = sugerenciaCorreo(correo);
    if (sug && !_vjCorreoConfirmado) {
      _vjMostrarCorreoSugerencia(sug);
      return;  // espera la decisión del humano (aceptar / usar de todos modos)
    }
  }

  const ev = (_ccEventosCache || []).find(e => e.id === eventoId) || {};
  const eventoNombre = ev.nombre || eventoId;

  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  let solicitudId = null;
  try {
    // 1. Crear cliente + solicitud (en_pagos) en el modelo del portal.
    if (alertEl) alertEl.innerHTML = '<div class="alert" style="border-color:var(--border)">Creando viajero…</div>';
    const r = await khAdminFetch('/.netlify/functions/admin-crear-viajero', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({
        cliente:   { nombre_completo: nombre, celular, correo: correo || undefined },
        solicitud: { evento_id: eventoId, evento_nombre: eventoNombre, paquete, zona,
                     num_personas: personas, tipo_habitacion: habitacion || undefined,
                     precio_total: precioTotal, monto_separo: montoSeparo },
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo crear el viajero');
    solicitudId = data.solicitud_id;

    // 2. Generar el plan de pagos reusando la MISMA lógica que al aprobar una
    //    solicitud (separo #1 'pendiente' + quincenas). Generar-después-de-crear.
    if (alertEl) alertEl.innerHTML = '<div class="alert" style="border-color:var(--border)">Generando plan de pagos…</div>';
    const plan = await _spCalcularPlanPagos({
      evento_id: eventoId, evento_nombre: eventoNombre, paquete,
      precio_total: precioTotal, monto_separo: montoSeparo,
    });
    if (!plan.ok) throw new Error(plan.error || 'No se pudo calcular el plan de pagos');
    const rp = await khAdminFetch('/.netlify/functions/admin-generar-plan-pagos', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({ solicitud_id: solicitudId, pagos: plan.pagos }),
    });
    const dataP = await rp.json();
    if (!rp.ok) throw new Error(dataP.error || 'Falló la generación del plan de pagos');

    closeModal('modal-viajero');
    let extraCorreo = '';
    if (dataP.correo_enviado) extraCorreo = ' <svg class="ic"><use href="#ic-correo"/></svg> Plan enviado al cliente por correo.';
    else if (dataP.correo_error || dataP.correo_enviado === false) extraCorreo = ' <svg class="ic"><use href="#ic-alerta"/></svg> El plan se creó pero el correo no salió.';
    showToast('Viajero dado de alta con su plan de pagos.' + extraCorreo, 'success');
    await loadViajeros();
  } catch(e) {
    if (solicitudId) {
      // El cliente+solicitud YA se crearon; reintentar duplicaría el cliente.
      // Cerramos y refrescamos (el viajero ya aparece) y avisamos del plan.
      closeModal('modal-viajero');
      showToast('Viajero creado, pero el plan de pagos falló: ' + e.message + '. Regenéralo desde Solicitudes Portal (cambiar estado a “En pagos”).', 'error');
      await loadViajeros();
    } else {
      err(e.message);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar viajero'; }
  }
}
async function exportarViajeros(formato) {
  if (!_ccViajeros.length) { alert('No hay viajeros para exportar'); return; }
  const excluirStaff = !!document.getElementById('cc-export-excluir-staff')?.checked;
  const lista = excluirStaff ? _ccViajeros.filter(v => !_esStaff(v)) : _ccViajeros;
  if (!lista.length) { alert('No hay clientes para exportar (todos son staff)'); return; }
  const ev = _ccEventosCache.find(e => e.id === _ccEventoActual);
  const sufijoTitulo = excluirStaff ? ' (sin staff)' : '';
  const titulo = `Viajeros — ${ev?.nombre||'Evento'}${sufijoTitulo}`;
  const _vNombre = v => (v.clientes || {}).nombre_completo || '';
  const _vCel    = v => (v.clientes || {}).celular || '';
  const _vCorreo = v => (v.clientes || {}).correo || '';
  const _vPago   = v => v.pago || {};
  if (formato === 'pdf') {
    const sufijoFile = excluirStaff ? '-sin-staff' : '';
    const html = `<html><head><meta charset="utf-8"><title>${_esfEsc(titulo)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px 12px;font-size:13px}th{background:#f5f5f5}td.num{text-align:right}</style></head><body>
    <h2>${_esfEsc(titulo)}</h2>
    <table><thead><tr><th>#</th><th>Nombre</th><th>Celular</th><th>Correo</th><th>Paquete</th><th>Zona</th><th>Pers.</th><th>Total</th><th>Abonado</th><th>Restante</th><th>Estado</th></tr></thead>
    <tbody>${lista.map((v,i)=>`<tr><td>${i+1}</td><td>${_vNombre(v)}</td><td>${_vCel(v)}</td><td>${_vCorreo(v)}</td><td>${v.paquete||''}</td><td>${_esfEsc(v.zona||'')}</td><td>${v.num_personas||1}</td><td class="num">${_spFmtMxn(_vPago(v).total)}</td><td class="num">${_spFmtMxn(_vPago(v).abonado)}</td><td class="num">${_spFmtMxn(_vPago(v).restante)}</td><td>${v.estado||''}</td></tr>`).join('')}</tbody>
    </table></body></html>`;
    _descargarHTML(`viajeros-${ev?.nombre||'evento'}${sufijoFile}.html`, html);
  } else {
    const headers = ['#','Nombre','Celular','Correo','Paquete','Zona','Personas','Total','Abonado','Restante','Estado'];
    const rows = lista.map((v,i) => [i+1,_vNombre(v),_vCel(v),_vCorreo(v),v.paquete||'',v.zona||'',v.num_personas||1,_vPago(v).total||0,_vPago(v).abonado||0,_vPago(v).restante||0,v.estado||''].map(c=>`"${String(c).replace(/"/g,'""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
    const sufijoFile = excluirStaff ? '-sin-staff' : '';
    a.download = `viajeros-${ev?.nombre||'evento'}${sufijoFile}.csv`;
    a.click();
  }
}
// Helper reusable (la t2 lo reusa): ventana mínima imprimible, sin el CSS de KH.
function _printVentana(titulo, htmlCuerpo) {
  const w = window.open('', '_blank');
  if (!w) { alert('Permite las ventanas emergentes para generar la lista.'); return; }
  const generado = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey', dateStyle: 'long', timeStyle: 'short' });
  const doc = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${_esfEsc(titulo)}</title>
<style>
  @page { size: letter; margin: 14mm; }
  *,*::before,*::after { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Arial, sans-serif; color:#000; background:#fff; margin:0; font-size:12px; line-height:1.4; }
  .cx-eyebrow { font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:#666; margin-bottom:6px }
  .cx-eyebrow b { color:#ff283b; font-weight:900 }
  h1 { font-size:18px; margin:0 0 2px }
  .cx-sub { color:#555; font-size:11px; margin:0 0 18px }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.05em; border-bottom:2px solid #000; padding-bottom:4px; margin:22px 0 10px }
  table { width:100%; border-collapse:collapse; margin:0 0 12px }
  th,td { text-align:left; padding:6px 8px; border-bottom:1px solid #ccc; vertical-align:top }
  th { font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:#444; border-bottom:1px solid #000 }
  section, tr, h2, .cx-grupo { break-inside: avoid }
  .cx-resumen { margin-top:20px; padding-top:10px; border-top:2px solid #000; font-size:12px }
  .cx-muted { color:#888 }
</style></head>
<body>
  <div class="cx-eyebrow"><b>Conecta</b> MX</div>
  <h1>${_esfEsc(titulo)}</h1>
  <div class="cx-sub">Generado el ${_esfEsc(generado)}</div>
  ${htmlCuerpo}
  <script>window.onload=function(){setTimeout(function(){window.print();},120);};<\/script>
</body></html>`;
  w.document.open(); w.document.write(doc); w.document.close();
}
// Etiqueta capitalizada del tipo de cuarto (Sección 2 usa minúsculas).
function _rgTipoLabel(t) {
  const s = String(t || '').toLowerCase();
  return ({ compartida: 'Compartida', doble: 'Doble', triple: 'Triple', individual: 'Individual', cuadruple: 'Cuádruple' }[s]) || (t || '—');
}
async function imprimirListaHotel() {
  if (!_ccEventoActual) { alert('Selecciona un evento primero.'); return; }
  const ev = _ccEventosCache.find(e => e.id === _ccEventoActual) || {};
  const eventoNombre = ev.nombre || _ccEventoActual;

  // ── Datos frescos ──
  let grupos = [];
  try { grupos = await khRoomingGrupos.listar(_ccEventoActual); } catch (e) { grupos = []; }
  const viajeros = Array.isArray(_ccViajeros) ? _ccViajeros : [];

  // Conteo de cuartos por tipo (Sección 1, cuartos reales del puzzle) + personas.
  const cuartosPorTipo = {}; // 'Compartida' → n
  let personasGrupos = 0, personasStaff = 0;

  // ── SECCIÓN 1 — Cuartos de grupos (Portal) ──
  const filasCuartos = [];
  const sinAcomodar = []; // { titular, personas:[nombre] }
  grupos.forEach(g => {
    const titular = (g.titular_nombre && String(g.titular_nombre).trim()) || 'Titular';
    // Multifecha: chip "Fecha N" en la etiqueta del grupo (fecha única → '').
    const _fi = _rgFechaIdx(g.evento_id);
    const fechaChip = _fi === null ? '' : ` <span style="font-size:11px;color:#555;border:1px solid #bbb;border-radius:var(--r-sm,8px);padding:0 6px">Fecha ${_fi + 1}</span>`;
    const activos = (g.lugares || []).filter(l => l.estado === 'activo');
    personasGrupos += activos.length;
    const nombreDe = (l) => (l.nombre && String(l.nombre).trim()) ? l.nombre : ('Lugar #' + l.numero + ' — por confirmar');
    const ocupPorHab = {};
    activos.forEach(l => { if (l.habitacion_grupo_id) { (ocupPorHab[l.habitacion_grupo_id] = ocupPorHab[l.habitacion_grupo_id] || []).push(l); } });
    (g.habitaciones || []).forEach(h => {
      const ocup = ocupPorHab[h.id] || [];
      const lbl = _rgTipoLabel(h.tipo);
      cuartosPorTipo[lbl] = (cuartosPorTipo[lbl] || 0) + 1;
      const nombres = ocup.length ? ocup.map(nombreDe).map(_esfEsc).join(', ') : '<span class="cx-muted">(vacío)</span>';
      filasCuartos.push(`<tr>
        <td>${_esfEsc('Grupo de ' + titular + ' · Cuarto ' + h.orden)}${fechaChip}</td>
        <td>${_esfEsc(lbl)}</td>
        <td>${nombres}</td>
        <td>${ocup.length}/${_esfEsc(h.capacidad)}</td>
      </tr>`);
    });
    // Personas activas sin cuarto asignado → SIN ACOMODAR.
    const sc = activos.filter(l => !l.habitacion_grupo_id);
    if (sc.length) sinAcomodar.push({ titular, fechaChip, personas: sc.map(nombreDe) });
  });

  let seccion1 = `<h2>Cuartos de grupos</h2>`;
  if (filasCuartos.length) {
    seccion1 += `<table><thead><tr><th>Cuarto</th><th>Tipo</th><th>Ocupantes</th><th>Ocup.</th></tr></thead><tbody>${filasCuartos.join('')}</tbody></table>`;
  } else {
    seccion1 += `<div class="cx-muted">Sin cuartos armados por los grupos.</div>`;
  }
  if (sinAcomodar.length) {
    seccion1 += `<h2>Sin acomodar</h2>` + sinAcomodar.map(s =>
      `<div class="cx-grupo" style="margin-bottom:8px"><b>Grupo de ${_esfEsc(s.titular)}:</b>${s.fechaChip || ''} ${s.personas.map(_esfEsc).join(', ')}</div>`
    ).join('');
  }

  // ── SECCIÓN 2 — Staff / rooming interno (KH), agrupado por tipo (como loadRooming) ──
  const VALIDOS = ['compartida', 'doble', 'triple', 'individual'];
  const porTipo = { compartida: [], doble: [], triple: [], individual: [], _sin: [] };
  viajeros.forEach(v => {
    const t = VALIDOS.includes(v.tipo_habitacion) ? v.tipo_habitacion : '_sin';
    porTipo[t].push(v);
    personasStaff += Number(v.num_personas) > 0 ? Number(v.num_personas) : 1;
    // El resumen de "cuartos por tipo" cuenta solo cuartos REALES (Sección 1); el
    // rooming KH agrupa por tipo pedido, no forma cuartos discretos → no suma aquí.
  });
  const filasStaff = [];
  [...VALIDOS, '_sin'].forEach(t => {
    (porTipo[t] || []).forEach(v => {
      const c = v.clientes || {};
      const meta = [v.paquete, v.zona, (Number(v.num_personas) > 1) ? (v.num_personas + ' pers.') : null].filter(Boolean).join(' · ');
      filasStaff.push(`<tr>
        <td>${_esfEsc(t === '_sin' ? 'Sin habitación' : _rgTipoLabel(t))}</td>
        <td>${_esfEsc(c.nombre_completo || '—')}</td>
        <td>${_esfEsc(meta)}</td>
      </tr>`);
    });
  });
  let seccion2 = `<h2>Staff / rooming interno</h2>`;
  seccion2 += filasStaff.length
    ? `<table><thead><tr><th>Tipo</th><th>Viajero</th><th>Paquete · Zona</th></tr></thead><tbody>${filasStaff.join('')}</tbody></table>`
    : `<div class="cx-muted">Sin viajeros en el rooming interno.</div>`;

  // ── Resumen ──
  const tiposResumen = Object.keys(cuartosPorTipo).filter(k => cuartosPorTipo[k] > 0)
    .map(k => `${cuartosPorTipo[k]} ${k}${cuartosPorTipo[k] !== 1 ? 's' : ''}`).join(' · ');
  const resumen = `<div class="cx-resumen">
    <div><b>Cuartos de grupos por tipo:</b> ${tiposResumen ? _esfEsc(tiposResumen) : '<span class="cx-muted">ninguno</span>'}</div>
    <div style="margin-top:4px"><b>Total de personas:</b> ${personasGrupos + personasStaff} <span class="cx-muted">(${personasGrupos} en grupos · ${personasStaff} en rooming interno)</span></div>
  </div>`;

  _printVentana('Lista para hotel — ' + eventoNombre, seccion1 + seccion2 + resumen);
}
// < 18 años cumplidos HOY a partir de 'YYYY-MM-DD'. Falso sin fecha.
function _rgEsMenor(fnac) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fnac || '').slice(0, 10));
  if (!m) return false;
  const hoy = new Date();
  let edad = hoy.getFullYear() - Number(m[1]);
  const mm = hoy.getMonth() + 1, dd = hoy.getDate();
  if (mm < Number(m[2]) || (mm === Number(m[2]) && dd < Number(m[3]))) edad--;
  return edad < 18;
}
// [F6-t2] LISTA PARA COORDIS: TODO viajero del evento (grupos, individuales y staff)
// con contacto, cuarto, paquete/zona y bandera de menor. Reusa _printVentana (#242).
async function imprimirListaCoordis() {
  if (!_ccEventoActual) { alert('Selecciona un evento primero.'); return; }
  const ev = _ccEventosCache.find(e => e.id === _ccEventoActual) || {};
  const eventoNombre = ev.nombre || _ccEventoActual;

  let grupos = [];
  try { grupos = await khRoomingGrupos.listar(_ccEventoActual, { todos: true }); } catch (e) { grupos = []; }
  const viajeros = Array.isArray(_ccViajeros) ? _ccViajeros : [];

  let totalPersonas = 0, totalMenores = 0;

  // ── Filas de grupos/individuales (solo lugares ACTIVOS), ordenadas por titular y numero ──
  const gruposOrd = [...grupos].sort((a, b) => String(a.titular_nombre || '').localeCompare(String(b.titular_nombre || ''), 'es'));
  const filas = [];
  gruposOrd.forEach(g => {
    const esIndividual = (g.lugares || []).length === 1;
    const grupoLbl = esIndividual ? 'Individual' : ('Grupo de ' + (g.titular_nombre || 'Titular'));
    // Multifecha: chip "Fecha N" junto a la etiqueta del grupo (fecha única → '').
    const _fi = _rgFechaIdx(g.evento_id);
    const fechaChip = _fi === null ? '' : ` <span style="font-size:11px;color:#555;border:1px solid #bbb;border-radius:var(--r-sm,8px);padding:0 6px">Fecha ${_fi + 1}</span>`;
    const habById = {};
    (g.habitaciones || []).forEach(h => { habById[h.id] = h; });
    (g.lugares || []).filter(l => l.estado === 'activo').forEach(l => {
      totalPersonas++;
      const nombre = (l.nombre && String(l.nombre).trim()) ? l.nombre : ('Lugar #' + l.numero + ' — por confirmar');
      const contacto = (l.celular && String(l.celular).trim()) || (l.correo && String(l.correo).trim()) || '—';
      const hab = l.habitacion_grupo_id ? habById[l.habitacion_grupo_id] : null;
      const cuarto = hab ? (_rgTipoLabel(hab.tipo) + ' #' + hab.orden) : '—';
      const pz = [l.paquete, l.zona].filter(v => v != null && String(v).trim() !== '').join(' · ');
      const menor = _rgEsMenor(l.fecha_nacimiento);
      if (menor) totalMenores++;
      filas.push(`<tr>
        <td>${_esfEsc(nombre)}</td>
        <td>${_esfEsc(contacto)}</td>
        <td>${_esfEsc(grupoLbl)}${fechaChip}</td>
        <td>${_esfEsc(cuarto)}</td>
        <td>${_esfEsc(pz)}</td>
        <td>${menor ? '<b>MENOR</b>' : ''}</td>
      </tr>`);
    });
  });
  let cuerpo = `<h2>Viajeros del evento</h2>`;
  cuerpo += filas.length
    ? `<table><thead><tr><th>Nombre</th><th>Contacto</th><th>Grupo</th><th>Cuarto</th><th>Paquete · Zona</th><th>Notas</th></tr></thead><tbody>${filas.join('')}</tbody></table>`
    : `<div class="cx-muted">Sin viajeros de grupos/individuales en este evento.</div>`;

  // ── Sección STAFF (rooming KH, _ccViajeros) con su celular ──
  const filasStaff = [];
  let personasStaff = 0;
  viajeros.forEach(v => {
    const c = v.clientes || {};
    const nP = Number(v.num_personas) > 0 ? Number(v.num_personas) : 1;
    personasStaff += nP;
    const contacto = (c.celular && String(c.celular).trim()) || (c.correo && String(c.correo).trim()) || '—';
    const pz = [v.paquete, v.zona, (nP > 1 ? nP + ' pers.' : null)].filter(Boolean).join(' · ');
    filasStaff.push(`<tr>
      <td>${_esfEsc(c.nombre_completo || '—')}</td>
      <td>${_esfEsc(contacto)}</td>
      <td>${_esfEsc(v.tipo_habitacion ? _rgTipoLabel(v.tipo_habitacion) : '—')}</td>
      <td>${_esfEsc(pz)}</td>
    </tr>`);
  });
  cuerpo += `<h2>Staff / rooming interno</h2>`;
  cuerpo += filasStaff.length
    ? `<table><thead><tr><th>Viajero</th><th>Contacto</th><th>Tipo</th><th>Paquete · Zona</th></tr></thead><tbody>${filasStaff.join('')}</tbody></table>`
    : `<div class="cx-muted">Sin viajeros en el rooming interno.</div>`;

  // ── Resumen ──
  cuerpo += `<div class="cx-resumen">
    <div><b>Total de viajeros:</b> ${totalPersonas + personasStaff} <span class="cx-muted">(${totalPersonas} en grupos/individuales · ${personasStaff} en rooming interno)</span></div>
    <div style="margin-top:4px"><b>Menores de edad:</b> ${totalMenores}</div>
  </div>`;

  _printVentana('Lista para coordis — ' + eventoNombre, cuerpo);
}
async function exportarRooming(formato) {
  if (!_ccHabitaciones.length) { alert('No hay habitaciones para exportar'); return; }
  const excluirStaff = !!document.getElementById('cc-rooming-excluir-staff')?.checked;
  // Set de nombres staff del evento — solo necesario cuando se quiere filtrar.
  let staffNames = new Set();
  if (excluirStaff) {
    // El staff que ocupa cuartos viene de _ccAsignados (equipo coordi/cc, con
    // a._usuario.nombre), NO de _ccViajeros (clientes del Portal, nunca staff).
    // El chofer NO se excluye (es huésped real del hotel).
    staffNames = new Set(
      (_ccAsignados || [])
        .map(a => (a._usuario?.nombre || '').trim().toLowerCase())
        .filter(Boolean)
    );
  }
  const filtrarOcp = ocp => excluirStaff
    ? ocp.filter(n => !staffNames.has(String(n || '').trim().toLowerCase()))
    : ocp;
  const ev = _ccEventosCache.find(e => e.id === _ccEventoActual);
  const hotel = document.getElementById('cc-hotel-nombre')?.value || '';
  const sufijoTitulo = excluirStaff ? ' (sin staff)' : '';
  const titulo = `Rooming List — ${ev?.nombre||'Evento'}${hotel?' · '+hotel:''}${sufijoTitulo}`;
  const tipoLabel = {individual:'Individual',doble:'Doble',triple:'Triple',cuadruple:'Cuádruple'};
  if (formato === 'pdf') {
    const sufijoFile = excluirStaff ? '-sin-staff' : '';
    const html = `<html><head><meta charset="utf-8"><title>${_esfEsc(titulo)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px 12px;font-size:13px;vertical-align:top}th{background:#f5f5f5}</style></head><body>
    <h2>${_esfEsc(titulo)}</h2>
    <table><thead><tr><th>Habitación</th><th>Tipo</th><th>Ocupantes</th></tr></thead>
    <tbody>${_ccHabitaciones.map(h=>{
      const ocp = filtrarOcp(h.ocupantes?(typeof h.ocupantes==='string'?JSON.parse(h.ocupantes):h.ocupantes):[]);
      return `<tr><td>${_esfEsc(h.numero_hab||'—')}</td><td>${tipoLabel[h.tipo]||h.tipo}</td><td>${ocp.join('<br>')||'—'}</td></tr>`;
    }).join('')}</tbody></table></body></html>`;
    _descargarHTML(`rooming-${ev?.nombre||'evento'}${sufijoFile}.html`, html);
  } else {
    const headers = ['Habitación','Tipo','Ocupantes'];
    const rows = _ccHabitaciones.map(h => {
      const ocp = filtrarOcp(h.ocupantes?(typeof h.ocupantes==='string'?JSON.parse(h.ocupantes):h.ocupantes):[]);
      return [h.numero_hab||'',tipoLabel[h.tipo]||h.tipo,ocp.join(' | ')].map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',');
    });
    const csv = [headers.join(','),...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
    const sufijoFile = excluirStaff ? '-sin-staff' : '';
    a.download = `rooming-${ev?.nombre||'evento'}${sufijoFile}.csv`;
    a.click();
  }
}
// ── Descargar listas desde perfil del coordi ─────────────────
async function descargarListaViajeros(eventoId) {
  try {
    const [ev, viajeros] = await Promise.all([
      khEventosMeta.porSlug(eventoId).then(m=>m||{}), // [sec-eventos]
      khViajeros.listar(eventoId), // [sec-coordi]
    ]);
    if (!viajeros.length) { alert('No hay viajeros registrados para este evento'); return; }
    const titulo = `Viajeros — ${ev.nombre||'Evento'}`;
    const html = `<html><head><meta charset="utf-8"><title>${_esfEsc(titulo)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:4px}p{color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px 12px;font-size:13px}th{background:#f5f5f5}</style></head><body>
    <h2>${_esfEsc(titulo)}</h2><p>${ev.artista?_esfEsc(ev.artista)+' · ':''}${_esfEsc(ev.ciudad||'')} ${ev.fecha?'· '+new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'}):''}</p>
    <table><thead><tr><th>#</th><th>Nombre</th><th>Paquete</th><th>Zona</th><th>Talla</th><th>Celular</th><th>Emergencia</th><th>Notas</th></tr></thead>
    <tbody>${viajeros.map((v,i)=>`<tr><td>${i+1}</td><td><strong>${_esfEsc(v.nombre)}</strong></td><td>${_esfEsc(v.tipo_paquete||'—')}</td><td>${_esfEsc(v.zona_boleto||'—')}</td><td>${_esfEsc(v.talla_playera||'—')}</td><td>${_esfEsc(v.celular||'—')}</td><td>${_esfEsc(v.num_emergencia||'—')}</td><td>${_esfEsc(v.notas||'—')}</td></tr>`).join('')}</tbody>
    </table></body></html>`;
    _descargarHTML(`viajeros-${(ev.nombre||'evento').replace(/[^a-zA-Z0-9-_]+/g,'_')}.html`, html);
  } catch(e) { alert('Error: ' + e.message); }
}
async function descargarRoomingList(eventoId) {
  try {
    const [ev, habs] = await Promise.all([
      khEventosMeta.porSlug(eventoId).then(m=>m||{}), // [sec-eventos]
      khRooming.listar(eventoId), // [sec-sensibles]
    ]);
    if (!habs.length) { alert('No hay rooming list para este evento'); return; }
    const tipoLabels = {individual:'Individual',doble:'Doble',triple:'Triple',cuadruple:'Cuádruple'};
    const titulo = `Rooming List — ${ev.nombre||'Evento'}`;
    const html = `<html><head><meta charset="utf-8"><title>${_esfEsc(titulo)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:4px}p{color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px 12px;font-size:13px;vertical-align:top}th{background:#f5f5f5}</style></head><body>
    <h2>${_esfEsc(titulo)}</h2>
    <p>${_esfEsc(habs[0]?.hotel_nombre||'')}${habs[0]?.hotel_direccion?' · '+_esfEsc(habs[0].hotel_direccion):''}${habs[0]?.incluye_desayuno?' · ✓ Incluye desayuno':''}</p>
    <table><thead><tr><th>Habitación</th><th>Tipo</th><th>Ocupantes</th></tr></thead>
    <tbody>${habs.map((h,i)=>{
      const ocp = h.ocupantes?(typeof h.ocupantes==='string'?JSON.parse(h.ocupantes):h.ocupantes):[];
      return `<tr><td>Habitación ${i+1}</td><td>${tipoLabels[h.tipo]||h.tipo}</td><td>${ocp.join('<br>')||'—'}</td></tr>`;
    }).join('')}</tbody></table></body></html>`;
    _descargarHTML(`rooming-${(ev.nombre||'evento').replace(/[^a-zA-Z0-9-_]+/g,'_')}.html`, html);
  } catch(e) { alert('Error: ' + e.message); }
}