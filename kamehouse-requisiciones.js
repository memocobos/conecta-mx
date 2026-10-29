/* =============================================================================
 * kamehouse-requisiciones.js — FASE B del rumbo (12-oct-2026): LA BANDEJA.
 *
 * Las requisiciones que levanta el index (cotización + forma de pago +
 * comprobante) caen aquí. Bulma/Milk/Memo las revisan:
 *   · VER el comprobante (URL firmada de 1 h, pedida al servidor al momento)
 *   · APROBAR — y ahí nace el viajero por la puerta de zonas, con su abono.
 *     El MONTO lo teclea quien VIO el comprobante (pre-llenado con el separo
 *     del sistema, editable): la captura es manual, nada automático decide
 *     dinero.
 *   · RECHAZAR con motivo (obligatorio).
 *   · WHATSAPP al cliente con mensaje redactado (confirmación o faltante) —
 *     abre wa.me, no manda nada solo.
 *
 * Endpoint: admin-requisiciones (listar / detalle / aprobar / rechazar).
 * Roles: maestro_roshi, bulma, milk (PERMISOS_TABS gobierna el botón).
 * ========================================================================== */

let _reqBdjRows = [];
let _reqBdjFiltro = 'pendiente';
let _reqBdjCargando = false;

function _reqBdjEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _reqBdjMxn(n) {
  if (n == null || n === '') return '—';
  try { return '$' + Number(n).toLocaleString('es-MX'); } catch (_) { return '$' + n; }
}
function _reqBdjFecha(iso) {
  try { return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Matamoros', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
  catch (_) { return String(iso || ''); }
}

async function _reqBdjCall(body) {
  const r = await khAdminFetch('/.netlify/functions/admin-requisiciones', {
    method: 'POST', body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !j.error) j.error = 'HTTP ' + r.status;
  j._status = r.status;
  return j;
}

async function loadRequisiciones(filtro) {
  if (filtro) _reqBdjFiltro = filtro;
  try { loadCambiosPortal(); } catch (_) {}
  // [PORTAL-SOLO-1] Arriba de todo: lo que el cliente espera ver en su Portal.
  try { if (typeof loadRevisionesPortal === 'function') loadRevisionesPortal(); } catch (_) {}
  const cont = document.getElementById('req-bdj-lista');
  if (!cont) return;
  if (_reqBdjCargando) return;
  _reqBdjCargando = true;
  cont.innerHTML = '<div class="rq-empty">Cargando la bandeja…</div>';
  const j = await _reqBdjCall({ accion: 'listar', estado: _reqBdjFiltro }).catch((e) => ({ error: e.message }));
  _reqBdjCargando = false;
  // Los tabs pintan su estado activo SIEMPRE (también en error).
  document.querySelectorAll('#req-bdj-tabs .tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.filtro === _reqBdjFiltro);
  });
  if (!j || !j.ok) {
    cont.innerHTML = `<div class="rq-empty" style="color:var(--red)"><b>No se pudo leer la bandeja</b>${_reqBdjEsc((j && j.error) || 'sin respuesta')}</div>`;
    return;
  }
  _reqBdjRows = j.requisiciones || [];
  const badge = document.getElementById('req-bdj-pend');
  // j.pendientes en null = «no se pudo contar», que NO es cero.
  if (badge) badge.textContent = (j.pendientes == null) ? '?' : String(j.pendientes);
  if (!_reqBdjRows.length) {
    cont.innerHTML = `<div class="rq-empty"><b>${_reqBdjFiltro === 'pendiente' ? 'Bandeja al día ✓' : 'Nada por aquí'}</b>No hay requisiciones ${_reqBdjFiltro === 'todas' ? '' : _reqBdjEsc(_reqBdjFiltro + 's')} por ahora. Las que lleguen del sitio caen aquí solas.</div>`;
    return;
  }
  cont.innerHTML = _reqBdjRows.map(_reqBdjCard).join('');
}

// ── [PORTAL-EDIT-1] Solicitudes de cambio que el cliente manda desde el Portal ──
// Viven ARRIBA de las requisiciones. No cambian nada solas: se atienden a mano
// (el cambio se hace en el viajero) y se cierran aquí. Se calla en cero.
async function loadCambiosPortal() {
  const lista = document.getElementById('req-bdj-lista');
  if (!lista) return;
  let box = document.getElementById('req-cambios');
  if (!box) { box = document.createElement('div'); box.id = 'req-cambios'; lista.parentNode.insertBefore(box, lista); }
  const j = await _reqBdjCall({ accion: 'cambios_listar', estado: 'pendiente' }).catch((e) => ({ error: e.message }));
  if (!j || !j.ok) { box.innerHTML = `<div style="color:var(--red);font-size:12px;margin-bottom:10px">No se pudieron leer las solicitudes de cambio del Portal: ${_reqBdjEsc((j && j.error) || 'sin respuesta')}</div>`; return; }
  const rows = j.cambios || [];
  if (!rows.length) { box.innerHTML = ''; return; }
  const TIPO = { hotel: 'Habitación / hotel', zona: 'Zona', fecha: 'Fecha', otro: 'Otro', paquete: '🎟 Elige su paquete (preventa)', pago: '💳 Comprobante de pago' };
  _reqCambiosRows = rows;
  box.innerHTML = `<div class="rq-section">Cambios pedidos desde el Portal <span class="rq-pill pend">${rows.length}</span></div>`
    + rows.map((c) => {
      const v = c.viajero || {};
      const wa = String(v.celular || '').replace(/\D/g, '');
      // [PREVENTA-PORTAL-1] La elección de paquete de la preventa se APLICA desde
      // aquí: «Aplicar» llama a viajero_elegir_paquete (el mismo dueño que el
      // botón 🎟 de la lista: puerta de zonas, inventario, contrato) y cierra.
      if (c.tipo === 'paquete') {
        return `<div class="rq-cambio" id="rq-cambio-${c.id}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
          <div class="rq-name">${_reqBdjEsc(c.nombre || v.nombre || '—')}</div>
          <span class="rq-tag">${_reqBdjEsc(TIPO.paquete)}</span>
        </div>
        <div class="rq-ev">${_reqBdjEsc(c.evento_id)} · hoy: ${_reqBdjEsc([v.tipo_paquete, v.zona_boleto].filter(Boolean).join(' · ') || '—')} · ${_reqBdjEsc(c.correo)}${wa ? ' · WA ' + _reqBdjEsc(wa) : ''}</div>
        <div style="font-size:14px;margin:6px 0"><b>${_reqBdjEsc(String(c.paquete_pedido || '').toUpperCase())}</b>${c.zona_pedida ? ' · ' + _reqBdjEsc(c.zona_pedida) : ''}${c.hotel_pedido ? ' · ' + _reqBdjEsc(c.hotel_pedido) : ''}${c.precio_lista != null ? ' · lista $' + Number(c.precio_lista).toLocaleString('es-MX') : ''}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${wa.length === 10 ? `<a class="rq-btn wa" target="_blank" rel="noopener" href="https://wa.me/52${wa}">💬 WhatsApp</a>` : ''}
          <button class="rq-btn pri" onclick="_reqPaqAbrir('${c.id}')">✓ Aplicar paquete</button>
          <button class="rq-btn dan" onclick="_reqCambioCerrar('${c.id}','rechazada')">No procede</button>
        </div>
        <div id="rq-cambio-form-${c.id}"></div></div>`;
      }
      // [PAGOS-PORTAL-2] El comprobante que el cliente subió desde el Portal:
      // «Ver comprobante» (URL firmada por el servidor) y «➕ Capturar abono» con
      // el monto TECLEADO por quien lo vio. «No procede» sigue para lo que no
      // es un pago de verdad (foto equivocada, pago de otra cosa).
      if (c.tipo === 'pago') {
        return `<div class="rq-cambio" id="rq-cambio-${c.id}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
          <div class="rq-name">${_reqBdjEsc(c.nombre || v.nombre || '—')}</div>
          <span class="rq-tag">${_reqBdjEsc(TIPO.pago)}</span>
        </div>
        <div class="rq-ev">${_reqBdjEsc(c.evento_id)} · hoy: ${_reqBdjEsc([v.tipo_paquete, v.zona_boleto].filter(Boolean).join(' · ') || '—')} · ${_reqBdjEsc(c.correo)}${wa ? ' · WA ' + _reqBdjEsc(wa) : ''}</div>
        <q>${_reqBdjEsc(c.detalle)}</q>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="rq-btn" onclick="_reqPagoVer('${c.id}')">📎 Ver comprobante</button>
          <button class="rq-btn pri" onclick="_reqPagoAbrir('${c.id}')">➕ Capturar abono</button>
          ${wa.length === 10 ? `<a class="rq-btn wa" target="_blank" rel="noopener" href="https://wa.me/52${wa}">💬 WhatsApp</a>` : ''}
          <button class="rq-btn dan" onclick="_reqCambioCerrar('${c.id}','rechazada')">No procede</button>
        </div>
        <div id="rq-cambio-form-${c.id}"></div></div>`;
      }
      return `<div class="rq-cambio" id="rq-cambio-${c.id}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
          <div class="rq-name">${_reqBdjEsc(c.nombre || v.nombre || '—')}</div>
          <span class="rq-tag">${_reqBdjEsc(TIPO[c.tipo] || c.tipo)}</span>
        </div>
        <div class="rq-ev">${_reqBdjEsc(c.evento_id)} · hoy: ${_reqBdjEsc([v.tipo_paquete, v.zona_boleto].filter(Boolean).join(' · ') || '—')} · ${_reqBdjEsc(c.correo)}${wa ? ' · WA ' + _reqBdjEsc(wa) : ''}</div>
        <q>${_reqBdjEsc(c.detalle)}</q>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${wa.length === 10 ? `<a class="rq-btn wa" target="_blank" rel="noopener" href="https://wa.me/52${wa}">💬 WhatsApp</a>` : ''}
          <button class="rq-btn pri" onclick="_reqCambioCerrar('${c.id}','atendida')">✓ Ya lo atendí</button>
          <button class="rq-btn dan" onclick="_reqCambioCerrar('${c.id}','rechazada')">No procede</button>
        </div>
        <div id="rq-cambio-form-${c.id}"></div></div>`;
    }).join('');
}
// [PREVENTA-PORTAL-1] Aplicar la elección: el TOTAL lo confirma quien aplica
// (nace con el precio de lista; si va el descuento de la preventa, se resta aquí).
let _reqCambiosRows = [];
function _reqPaqAbrir(id) {
  const box = document.getElementById('rq-cambio-form-' + id);
  const c = _reqCambiosRows.find((x) => x.id === id);
  if (!box || !c) return;
  if (box.dataset.abierto === 'paq') { box.innerHTML = ''; box.dataset.abierto = ''; return; }
  box.dataset.abierto = 'paq';
  box.innerHTML = `<div class="rq-panel" style="margin:10px 0 0">
    <label class="rq-field">Costo TOTAL del paquete para esta persona (sus $300 de preventa ya están abonados aparte) *
      <input type="number" min="1" step="1" id="rq-paq-tot-${id}" value="${c.precio_lista != null ? Number(c.precio_lista) : ''}"></label>
    <div style="font-size:11px;opacity:.75;margin-top:4px">Nace con el precio de lista. Si le toca el descuento de la preventa, réstalo aquí.${c.hotel_pedido ? ' Habitación pedida: <b>' + _reqBdjEsc(c.hotel_pedido) + '</b> — asígnala en Rooming.' : ''} Al aplicar nace su contrato.</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="rq-btn pri" id="rq-paq-go-${id}" onclick="_reqPaqAplicar('${id}')">Aplicar y cerrar</button>
      <button class="rq-btn quiet" onclick="_reqPaqAbrir('${id}')">Cancelar</button>
    </div><div class="rq-msg" id="rq-cambio-msg-${id}"></div></div>`;
}
async function _reqPaqAplicar(id) {
  const c = _reqCambiosRows.find((x) => x.id === id); if (!c) return;
  const msg = document.getElementById('rq-cambio-msg-' + id);
  const say = (t, ok) => { if (msg) { msg.textContent = t; msg.style.color = ok ? 'var(--green, #88ea4e)' : 'var(--red)'; } };
  const total = Number((document.getElementById('rq-paq-tot-' + id) || {}).value);
  if (!(total > 0)) return say('Escribe el costo total.');
  const btn = document.getElementById('rq-paq-go-' + id); if (btn) btn.disabled = true;
  say('Aplicando…', true);
  let aviso = [];
  try {
    // contrato_sin_correo: el aviso al cliente es UNO, el de «paquete confirmado».
    const j = await khViajeros._call({ accion: 'viajero_elegir_paquete', id: c.viajero_id, tipo_paquete: c.paquete_pedido, zona_boleto: c.zona_pedida || '', total_contrato: total, contrato_sin_correo: true });
    [j && j.zona_aviso, j && j.stock_aviso].filter(Boolean).forEach((a) => aviso.push(a));
    const k = (j && j.contrato) || {};
    if (k.aviso) aviso.push('contrato: ' + k.aviso);
  } catch (e) {
    // «ya no está en preventa» = alguien lo aplicó antes (p. ej. desde la lista):
    // la solicitud se puede cerrar igual. Cualquier otro error se DICE y no se cierra.
    if (!/ya no est[aá] en preventa/i.test(String(e && e.message))) { say((e && e.message) || 'No se pudo aplicar'); if (btn) btn.disabled = false; return; }
    aviso.push('ya tenía paquete aplicado');
  }
  const j2 = await _reqBdjCall({ accion: 'cambio_cerrar', id, estado: 'atendida', respuesta: `Paquete aplicado: ${String(c.paquete_pedido).toUpperCase()}${c.zona_pedida ? ' · ' + c.zona_pedida : ''} · total $${total}` }).catch((e) => ({ error: e.message }));
  if (j2 && j2.ok) {
    aviso.push(_reqCorreoTxt(j2.correo));
    showToast(_reqBdjEsc('Paquete aplicado · ' + aviso.join(' · ')), (j2.correo && j2.correo.ok) && aviso.length === 1 ? 'success' : 'warning');
    loadCambiosPortal();
  }
  else say('El paquete SÍ se aplicó, pero no se pudo cerrar la solicitud: ' + ((j2 && j2.error) || 'sin respuesta') + '. Ciérrala con «No procede»/recarga.');
}
// [PAGOS-PORTAL-2] Ver el comprobante del Portal: la URL la FIRMA el servidor
// (bucket privado, 1 h) — la pantalla solo la abre.
async function _reqPagoVer(id) {
  try {
    const j = await _reqBdjCall({ accion: 'cambio_foto', id });
    if (j && j.ok && j.signed_url) window.open(j.signed_url, '_blank', 'noopener');
    else showToast(_reqBdjEsc((j && j.error) || 'No se pudo abrir el comprobante'), 'error');
  } catch (e) { showToast(_reqBdjEsc(e.message || 'No se pudo abrir el comprobante'), 'error'); }
}
// [PAGOS-PORTAL-2] Capturar el abono: el monto lo TECLEA quien vio el
// comprobante (el «declara $X» del detalle es del cliente y no se prellena a
// ciegas — se prellena solo como AYUDA visible, editable, jamás se manda solo).
function _reqPagoAbrir(id) {
  const box = document.getElementById('rq-cambio-form-' + id);
  const c = _reqCambiosRows.find((x) => x.id === id);
  if (!box || !c) return;
  if (box.dataset.abierto === 'pago') { box.innerHTML = ''; box.dataset.abierto = ''; return; }
  box.dataset.abierto = 'pago';
  // Si el cliente declaró un monto, se PRELLENA como punto de partida — pero el
  // número que entra es el que quede en la caja tras mirar el comprobante.
  const dec = (String(c.detalle || '').match(/declara \$([\d,]+)/) || [])[1];
  box.innerHTML = `<div class="rq-panel" style="margin:10px 0 0">
    <label class="rq-field">Monto del abono — el que DICE el comprobante, no el que declaró *
      <input type="number" min="1" step="1" id="rq-pago-monto-${id}" value="${dec ? dec.replace(/,/g, '') : ''}"></label>
    <div style="font-size:11px;opacity:.75;margin-top:4px">Abre el 📎 comprobante y teclea lo que el banco dice. Al capturar: nace el abono (con el comprobante ligado), la solicitud se cierra y al cliente le llega «Recibimos tu pago» si su evento manda correo.</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="rq-btn pri" id="rq-pago-go-${id}" onclick="_reqPagoCapturar('${id}')">Capturar y cerrar</button>
      <button class="rq-btn quiet" onclick="_reqPagoAbrir('${id}')">Cancelar</button>
    </div><div class="rq-msg" id="rq-cambio-msg-${id}"></div></div>`;
  const inp = document.getElementById('rq-pago-monto-' + id); if (inp) inp.focus();
}
async function _reqPagoCapturar(id) {
  const msg = document.getElementById('rq-cambio-msg-' + id);
  const say = (t, ok) => { if (msg) { msg.textContent = t; msg.style.color = ok ? 'var(--green, #88ea4e)' : 'var(--red)'; } };
  const monto = Number((document.getElementById('rq-pago-monto-' + id) || {}).value);
  if (!(monto > 0)) return say('Teclea el monto que dice el comprobante.');
  const btn = document.getElementById('rq-pago-go-' + id); if (btn) btn.disabled = true;
  say('Capturando…', true);
  const j = await _reqBdjCall({ accion: 'cambio_pago_capturar', id, monto }).catch((e) => ({ error: e.message }));
  if (j && j.ok) {
    showToast(_reqBdjEsc('Abono capturado: $' + Math.round(monto).toLocaleString('es-MX') + ' · ' + (_reqCorreoTxt(j.correo) || 'sin correo (evento fuera de la lista)')), 'success');
    loadCambiosPortal();
  } else {
    // El 207 del servidor: la solicitud quedó cerrada pero el abono NO entró —
    // el texto trae el monto y el camino (➕ Abono). No se reintenta solo.
    say((j && j.error) || 'No se pudo capturar'); if (btn) btn.disabled = false;
  }
}
// [PREVENTA-PORTAL-2] Lo que pasó con el correo al cliente, dicho en el aviso.
function _reqCorreoTxt(c) {
  if (!c) return '';
  return c.ok ? 'correo enviado a ' + c.enviado : 'el correo NO salió (' + (c.aviso || 'sin detalle') + '): avísale por WhatsApp';
}
// Cerrar un cambio: la nota/motivo se pide EN LÍNEA (antes era prompt()).
function _reqCambioCerrar(id, estado) {
  const box = document.getElementById('rq-cambio-form-' + id);
  if (!box) return;
  if (box.dataset.abierto === estado) { box.innerHTML = ''; box.dataset.abierto = ''; return; }
  box.dataset.abierto = estado;
  const no = estado === 'rechazada';
  const esPaq = ((_reqCambiosRows || []).find((x) => x.id === id) || {}).tipo === 'paquete';
  box.innerHTML = `<div class="rq-panel" style="margin:10px 0 0">
    <label class="rq-field">${no ? (esPaq ? '¿Por qué no procede? (le llega TAL CUAL por correo y en su Portal) *' : '¿Por qué no procede? (el cliente lo va a preguntar) *') : 'Nota opcional: qué se cambió'}
      <input type="text" id="rq-cambio-txt-${id}" maxlength="300" placeholder="${no ? 'Ej. ya no hay habitaciones dobles' : 'Ej. pasó a habitación doble'}"></label>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="rq-btn ${no ? 'dan full' : 'pri'}" id="rq-cambio-go-${id}" onclick="_reqCambioCerrarGo('${id}','${estado}')">${no ? 'Cerrar como «no procede»' : 'Cerrar como atendida'}</button>
      <button class="rq-btn quiet" onclick="_reqCambioCerrar('${id}','${estado}')">Cancelar</button>
    </div><div class="rq-msg" id="rq-cambio-msg-${id}"></div></div>`;
  const inp = document.getElementById('rq-cambio-txt-' + id); if (inp) inp.focus();
}
async function _reqCambioCerrarGo(id, estado) {
  const respuesta = ((document.getElementById('rq-cambio-txt-' + id) || {}).value || '').trim();
  const msg = document.getElementById('rq-cambio-msg-' + id);
  if (estado === 'rechazada' && respuesta.length < 3) { if (msg) { msg.textContent = 'Escribe el motivo.'; msg.style.color = 'var(--red)'; } return; }
  const btn = document.getElementById('rq-cambio-go-' + id); if (btn) btn.disabled = true;
  const j = await _reqBdjCall({ accion: 'cambio_cerrar', id, estado, respuesta }).catch((e) => ({ error: e.message }));
  if (j && j.ok) { if (j.correo) showToast(_reqBdjEsc('Cerrada · ' + _reqCorreoTxt(j.correo)), j.correo.ok ? 'success' : 'warning'); loadCambiosPortal(); }
  else { if (msg) { msg.textContent = 'No se pudo cerrar: ' + ((j && j.error) || 'sin respuesta'); msg.style.color = 'var(--red)'; } if (btn) btn.disabled = false; }
}

function _reqBdjCard(r) {
  const esPend = r.estado === 'pendiente';
  const cls = r.estado === 'aprobada' ? 'ok' : r.estado === 'rechazada' ? 'no' : 'pend';
  const formaTxt = { transferencia: 'Transferencia', deposito: 'Depósito', oxxo: 'OXXO', link_pago: '🔗 Pide link de pago' }[r.forma_pago] || r.forma_pago || '—';
  const cel = String(r.celular || '').replace(/\D/g, '');
  const ini = String(r.nombre || '?').trim().charAt(0).toUpperCase() || '?';
  const np = r.num_personas || 1;
  const tag = (t, c) => t ? `<span class="rq-tag${c ? ' ' + c : ''}">${_reqBdjEsc(t)}</span>` : '';
  const esRoshi = typeof currentUser !== 'undefined' && currentUser && currentUser.rol === 'maestro_roshi';
  const acomp = Array.isArray(r.acompanantes) && r.acompanantes.length ? `<div>
      <div class="rq-sub">Acompañantes · al aprobar nace un viajero por persona${Array.isArray(r.desglose) ? ', con lo que declaró cada quien' : ', el pago repartido'}</div>
      <div class="rq-acomp">${r.acompanantes.map((a, i) => `<div>${i + 2}. <b>${_reqBdjEsc(a.nombre)}</b> · ${_reqBdjEsc(a.correo)}${a.celular ? ' · WA ' + _reqBdjEsc(a.celular) : ''}${a.talla_playera ? ' · talla ' + _reqBdjEsc(a.talla_playera) : ''}${a.num_emergencia ? ' · emerg. ' + _reqBdjEsc(a.num_emergencia) : ''}</div>`).join('')}</div>
    </div>` : '';
  // [REQ-DUP-1] El aviso de gemelas que el servidor derivó (mismo evento +
  // mismo celular o correo). Nació del caso Virginia Moguel: la misma solicitud
  // aprobada dos veces. El candado real vive en el servidor; esto es la señal.
  const dup = Array.isArray(r.dup_de) && r.dup_de.length
    ? `<div style="margin:6px 0;padding:6px 10px;border:1px solid var(--red);border-radius:8px;font-size:11px;color:var(--red)">⚠️ Posible duplicado: este celular/correo ya tiene ${r.dup_de.map((d) => `<b>${_reqBdjEsc(d.folio)}</b> (${_reqBdjEsc(d.estado)})`).join(', ')} en este mismo evento. Compara los comprobantes antes de aprobar.</div>`
    : '';
  return `
  <div class="rq-card is-${cls}" id="req-card-${r.id}">
    ${dup}
    <div class="rq-head">
      <div class="rq-av">${_reqBdjEsc(ini)}</div>
      <div class="rq-who">
        <div class="rq-name">${_reqBdjEsc(r.nombre)}</div>
        <div class="rq-ev">${_reqBdjEsc(r.evento_nombre || r.evento_id)}</div>
      </div>
      <div class="rq-meta"><span class="rq-pill ${cls}">${_reqBdjEsc(r.estado)}</span><br>${_reqBdjEsc(r.folio)} · ${_reqBdjFecha(r.creado_en)}</div>
    </div>
    <div class="rq-tags">
      ${tag(khPaqueteTexto({ tipo_paquete: r.paquete, zona_boleto: r.zona, evento_id: r.evento_id }), 'pk')}${tag(r.zona)}${tag(np + (np > 1 ? ' personas' : ' persona'))}${tag(r.hotel)}${tag(r.transporte)}
    </div>
    <div class="rq-nums">
      <div class="rq-num"><small>Separo</small><b>${_reqBdjMxn(r.separo_sistema)}</b></div>
      <div class="rq-num"><small>Total</small><b>${_reqBdjMxn(r.total_sistema)}</b>${(r.transporte && r.total_sistema != null) ? '<i>sin transporte CDMX</i>' : ''}</div>
      <div class="rq-num"><small>Pagó por</small><b style="font-size:14px">${_reqBdjEsc(formaTxt)}</b>${r.comprobante_path ? '<i>📎 con comprobante</i>' : '<i>sin comprobante</i>'}</div>
    </div>
    <div class="rq-body">
      <div class="rq-contact">
        <span>WhatsApp <b>${_reqBdjEsc(r.celular)}</b></span>
        ${r.correo ? `<span>Correo <b>${_reqBdjEsc(r.correo)}</b></span>` : ''}
        ${r.talla_playera ? `<span>Talla <b>${_reqBdjEsc(r.talla_playera)}</b></span>` : ''}
        ${r.num_emergencia ? `<span>Emergencia <b>${_reqBdjEsc(r.num_emergencia)}</b></span>` : ''}
      </div>
      ${acomp}
      ${r.cotizacion_texto ? `<details><summary>Ver la cotización que el cliente vio</summary><pre>${_reqBdjEsc(r.cotizacion_texto)}</pre></details>` : ''}
      ${r.estado === 'rechazada' && r.motivo_rechazo ? `<div class="rq-note no">Motivo del rechazo: ${_reqBdjEsc(r.motivo_rechazo)}</div>` : ''}
      ${/* [RECHAZO-AVISO-1] ¿se enteró el cliente? Un rechazo sin aviso se veía
            EXACTAMENTE igual que uno avisado — por eso cuatro personas que ya
            habían transferido quedaron esperando. Ahora se distinguen. */ ''}
      ${r.estado === 'rechazada' && r.motivo_clave === 'whatsapp' && !r.aviso_at
        ? '<div style="font-size:11px;color:var(--ts)">💬 Cierre por WhatsApp — este motivo no lleva correo</div>'
        : r.estado === 'rechazada' ? (r.aviso_at
        ? `<div style="font-size:11px;color:var(--green)">✓ Avisado por correo el ${_reqBdjEsc(_tsToDate(r.aviso_at).toLocaleDateString('es-MX', { timeZone: 'America/Matamoros', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}</div>`
        : `<div style="font-size:11px;color:#ffb020">⚠️ Sin avisar — este cliente no sabe que no se pudo${cel.length === 10 ? `. <a href="https://wa.me/52${cel}?text=${encodeURIComponent('Hola ' + (String(r.nombre || '').split(' ')[0]) + ', te escribimos de Conecta Reynosa por tu solicitud ' + r.folio + '. ' + (r.motivo_rechazo || 'No pudimos confirmar tu lugar.') + ' Tu pago queda a tu favor: dinos qué zona o fecha prefieres y lo aplicamos ahí.')}" target="_blank" rel="noopener" style="color:#25d366;font-weight:700">Avisarle por WhatsApp →</a>` : ''}</div>`) : ''}
      ${r.estado !== 'pendiente' && r.revisada_por ? `<div style="font-size:11px">Revisada por ${_reqBdjEsc(r.revisada_por)}${r.nota_staff ? ' · ' + _reqBdjEsc(r.nota_staff) : ''}</div>` : ''}
    </div>
    <div class="rq-actions">
      ${esPend ? `<button class="rq-btn pri" onclick="_reqBdjAprobarUI('${r.id}')">✓ Aprobar</button>` : ''}
      ${r.comprobante_path ? `<button class="rq-btn" onclick="_reqBdjVerComprobante('${r.id}')">📎 Comprobante</button>` : ''}
      ${cel.length === 10 ? `<a class="rq-btn wa" target="_blank" rel="noopener" href="https://wa.me/52${cel}?text=${encodeURIComponent('¡Hola ' + (String(r.nombre || '').split(' ')[0]) + '! Te escribimos de Conecta Reynosa por tu reservación ' + r.folio + ' 😄')}">💬 WhatsApp</a>` : ''}
      ${r.estado === 'aprobada' && r.viajero_id ? '<span class="rq-done">✓ Viajero creado</span>' : ''}
      <span class="rq-sp"></span>
      ${esPend ? `<button class="rq-btn dan" onclick="_reqBdjRechazar('${r.id}')">Rechazar</button>` : ''}
      ${esRoshi ? `<button class="rq-btn quiet" title="Quitar esta solicitud de la bandeja (era de prueba). Se guarda una copia en el archivo." onclick="_reqBdjArchivarPrueba('${r.id}','${_reqBdjEsc(r.folio)}','${r.estado}')">🗑 Era prueba</button>` : ''}
    </div>
    <div id="req-apr-${r.id}" class="rq-panel" style="display:none"></div>
    <div id="req-rch-${r.id}" class="rq-panel" style="display:none"></div>
  </div>`;
}

async function _reqBdjVerComprobante(id) {
  const j = await _reqBdjCall({ accion: 'detalle', id }).catch((e) => ({ error: e.message }));
  if (j && j.ok && j.signed_url) { window.open(j.signed_url, '_blank', 'noopener'); return; }
  alert('No se pudo abrir el comprobante: ' + ((j && j.error) || 'la firma no llegó. Reintenta.'));
}

// ── Aprobar: el formulario del humano. Pre-llenado con lo del sistema,
// EDITABLE — la autoridad es quien vio el comprobante. ───────────────────────
function _reqBdjAprobarUI(id) {
  const r = _reqBdjRows.find((x) => x.id === id);
  const box = document.getElementById('req-apr-' + id);
  if (!r || !box) return;
  if (box.style.display !== 'none') { box.style.display = 'none'; return; }
  const rch = document.getElementById('req-rch-' + id); if (rch) rch.style.display = 'none';
  const esRide = r.paquete === 'ride';
  box.innerHTML = `
    <h4>Al aprobar nace el viajero con su abono</h4>
    <div class="rq-grid">
      <label class="rq-field">Abono verificado (lo que dice el comprobante) *<input type="number" id="req-apr-monto-${id}" value="${_reqBdjMontoInicial(r)}" min="1" step="1" oninput="_reqBdjDesgloseSuma('${id}')"></label>
      <label class="rq-field">Total del contrato *<input type="number" id="req-apr-total-${id}" value="${r.total_sistema != null ? Math.round(Number(r.total_sistema)) : ''}" min="1" step="1"></label>
      ${esRide ? '' : `<label class="rq-field">Zona del boleto *<input type="text" id="req-apr-zona-${id}" value="${_reqBdjEsc(r.zona || '')}"></label>`}
    </div>
    ${_reqBdjDesgloseHtml(r, id)}
    <label class="rq-field">Nota (opcional)<input type="text" id="req-apr-nota-${id}" maxlength="500"></label>
    ${(r.transporte && r.total_sistema != null) ? '<div class="rq-tag warn" style="display:block;margin-top:8px">⚠️ El total del sistema NO incluye el transporte a CDMX — ajústalo si aplica (la cotización del cliente lo trae).</div>' : ''}
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="rq-btn pri" id="req-apr-go-${id}" onclick="_reqBdjAprobar('${id}')">Confirmar — crear viajero</button>
      <button class="rq-btn quiet" onclick="document.getElementById('req-apr-${id}').style.display='none'">Cancelar</button>
    </div>
    <div id="req-apr-msg-${id}" class="rq-msg"></div>`;
  box.style.display = 'block';
  _reqBdjDesgloseSuma(id);
}

// [DESGLOSE-1] Cuánto pagó cada quien: prellenado con lo que DECLARÓ el
// cliente (o parejo si no lo mandó), EDITABLE. Tiene que sumar el abono
// verificado; si no cuadra, se corrige aquí (después de hablar por WhatsApp)
// en vez de rechazar. Solo con acompañantes: es lo que hace nacer un viajero
// por persona.
// El abono se prellena con lo que el cliente DECLARÓ pagar (suma de su
// desglose) y, sin desglose, con el separo del sistema. Bulma lo carea contra
// el comprobante: el prellenado es ayuda, no verdad.
function _reqBdjMontoInicial(r) {
  const ps = _reqBdjPersonas(r);
  if (ps && Array.isArray(r.desglose) && r.desglose.length === ps.length) {
    const s = r.desglose.reduce((a, b) => a + (Math.round(Number(b)) || 0), 0);
    if (s > 0) return s;
  }
  return r.separo_sistema != null ? Math.round(Number(r.separo_sistema)) : '';
}
function _reqBdjPersonas(r) {
  const a = Array.isArray(r.acompanantes) ? r.acompanantes : [];
  if (!a.length || a.length !== Math.max(0, (r.num_personas || 1) - 1)) return null;
  return [r.nombre].concat(a.map((x) => x.nombre));
}
function _reqBdjDesgloseHtml(r, id) {
  const ps = _reqBdjPersonas(r);
  if (!ps) return '';
  const n = ps.length;
  const dec = Array.isArray(r.desglose) && r.desglose.length === n ? r.desglose.map((x) => Math.round(Number(x) || 0)) : null;
  const base = Math.round(Number(r.separo_sistema || 0));
  const parejo = Array.from({ length: n }, (_, i) => Math.floor(base / n) + (i === 0 ? base - Math.floor(base / n) * n : 0));
  const vals = dec || parejo;
  const sumaDec = dec ? dec.reduce((a, b) => a + b, 0) : null;
  return `<div class="rq-desg">
    <div class="rq-sub">¿Cuánto pagó cada quien?</div>
    <div style="font-size:11px;color:var(--ts);margin-bottom:8px">${dec ? 'Lo que declaró el cliente (suma ' + _reqBdjMxn(sumaDec) + ').' : 'El cliente no mandó desglose: viene parejo.'} Corrígelo si no cuadra con el comprobante — tiene que sumar el abono verificado.</div>
    ${ps.map((nom, i) => `<div class="rq-desg-row">
      <span>${i === 0 ? '👤 ' : ''}${_reqBdjEsc(nom)}</span>
      <input type="number" class="req-apr-pago-${id}" value="${vals[i]}" min="0" step="1" oninput="_reqBdjDesgloseSuma('${id}')">
    </div>`).join('')}
    <div id="req-apr-suma-${id}" style="font-size:12px;text-align:right;margin-top:4px"></div>
  </div>`;
}
function _reqBdjDesgloseLeer(id) {
  const els = document.querySelectorAll('.req-apr-pago-' + id);
  if (!els.length) return null;
  return Array.prototype.map.call(els, (x) => Math.round(Number(x.value)));
}
function _reqBdjDesgloseSuma(id) {
  const d = _reqBdjDesgloseLeer(id); const el = document.getElementById('req-apr-suma-' + id);
  if (!d || !el) return;
  const s = d.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const monto = Math.round(Number((document.getElementById('req-apr-monto-' + id) || {}).value));
  const ok = s === monto;
  el.innerHTML = 'Suma ' + _reqBdjMxn(s) + (ok ? ' <span style="color:var(--green)">✓ cuadra</span>' : ' <span style="color:var(--red)">≠ abono ' + _reqBdjMxn(monto || 0) + '</span>');
}

async function _reqBdjAprobar(id) {
  const $ = (suf) => document.getElementById('req-apr-' + suf + '-' + id);
  const msg = $('msg');
  const monto = Math.round(Number(($('monto') || {}).value));
  const total = Math.round(Number(($('total') || {}).value));
  const zonaEl = $('zona');
  const nota = (($('nota') || {}).value || '').trim();
  if (!(monto > 0)) { if (msg) { msg.textContent = 'El abono va en pesos, mayor a cero.'; msg.style.color = 'var(--red)'; } return; }
  if (!(total > 0)) { if (msg) { msg.textContent = 'Falta el total del contrato.'; msg.style.color = 'var(--red)'; } return; }
  const btn = $('go');
  if (btn) { btn.disabled = true; btn.textContent = 'Creando…'; }
  const body = { accion: 'aprobar', id, monto, total_contrato: total, nota };
  const desglose = _reqBdjDesgloseLeer(id);
  if (desglose) {
    if (desglose.some((x) => !Number.isFinite(x) || x < 0)) { if (msg) { msg.textContent = 'Revisa el desglose: cada monto en pesos, sin negativos (puede ser 0).'; msg.style.color = 'var(--red)'; } if (btn) { btn.disabled = false; btn.textContent = 'Confirmar — crear viajero'; } return; }
    const s = desglose.reduce((a, b) => a + b, 0);
    if (s !== monto) { if (msg) { msg.textContent = 'El desglose suma ' + _reqBdjMxn(s) + ' y el abono verificado es ' + _reqBdjMxn(monto) + ': ajusta hasta que cuadren.'; msg.style.color = 'var(--red)'; } if (btn) { btn.disabled = false; btn.textContent = 'Confirmar — crear viajero'; } return; }
    body.desglose = desglose;
  }
  // [DESGLOSE-1] Pagó de más: se confirma con palabras, el excedente queda a favor.
  if (monto > total) {
    if (!confirm('El abono (' + _reqBdjMxn(monto) + ') es mayor que el total (' + _reqBdjMxn(total) + '). ¿El cliente sí pagó de más? Los ' + _reqBdjMxn(monto - total) + ' quedan como saldo a favor.')) { if (btn) { btn.disabled = false; btn.textContent = 'Confirmar — crear viajero'; } return; }
    body.saldo_favor = true;
  }
  if (zonaEl) body.zona = zonaEl.value;
  let j = await _reqBdjCall(body).catch((e) => ({ error: e.message }));
  // [REQ-DUP-1] El servidor rebotó por duplicado: se confirma CON PALABRAS y se
  // reintenta con la marca. Solo quien comparó los comprobantes puede decirlo.
  if (j && !j.ok && Array.isArray(j.duplicado) && j.duplicado.length) {
    if (confirm('⚠️ ' + (j.error || 'Posible duplicado') + '\n\n¿Es una compra NUEVA (otro pago, otro comprobante)? Acepta para aprobarla de todos modos.')) {
      body.duplicado_ok = true;
      j = await _reqBdjCall(body).catch((e) => ({ error: e.message }));
    }
  }
  if (j && j.ok) {
    // [ACOMP-1] Cuántos viajeros nacieron y qué pasó con el Portal — dicho, no supuesto.
    const nv = Array.isArray(j.viajeros) ? j.viajeros.length : 1;
    let txt = '✓ ' + (nv > 1 ? nv + ' viajeros creados' : 'Viajero creado') + ' con ' + _reqBdjMxn(j.monto) + ' cobrados. Confírmale al cliente por WhatsApp.';
    const pt = j.portal;
    // [CONFIRMA-1] el correo único: confirmación + invitación al Portal adentro.
    if (pt && (pt.enviados || []).length) txt += ' · Correo de confirmación enviado (' + pt.enviados.length + ')' + ((pt.invitados || []).length ? ', con invitación al Portal' : '') + ((pt.errores || []).length ? ' · ⚠️ ' + pt.errores.length + ' con error' : '') + (pt.aviso ? ' · ⚠️ ' + pt.aviso : '');
    else if (pt) txt += ' · ⚠️ El correo no salió: ' + (pt.aviso || ((pt.errores && pt.errores[0] && pt.errores[0].paso) || 'sin respuesta'));
    // [CONTRATO-CLIENTE-1] El contrato para firmar — dicho, no supuesto.
    const ct = j.contrato;
    if (ct && (ct.enviados || []).length) txt += ' · Contrato enviado para firmar (' + ct.enviados.length + ')';
    if (ct && (ct.sin_correo || []).length) txt += ' · ⚠️ ' + ct.sin_correo.length + ' sin correo: manda su contrato con «📜 Contrato» en la lista';
    if (ct && ct.aviso) txt += ' · ⚠️ Contrato: ' + ct.aviso;
    if (ct && (ct.errores || []).length) txt += ' · ⚠️ Contrato: ' + ct.errores.map((e) => e.aviso).join(' · ');
    if (msg) { msg.textContent = txt; msg.style.color = 'var(--green)'; }
    setTimeout(() => loadRequisiciones(), (pt || ct) ? 5000 : 900);
  } else {
    // El 207 trae instrucción exacta (viajero creado, abono no) — se enseña TAL CUAL.
    if (msg) { msg.textContent = (j && j.error) || 'No se pudo aprobar'; msg.style.color = 'var(--red)'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar — crear viajero'; }
    if (j && j._status === 207) setTimeout(() => loadRequisiciones(), 4000);
  }
}

// [PRUEBA-ARCHIVO-1] Quitar una solicitud de PRUEBA (solo Memo). Si estaba
// aprobada, se van también su viajero y su pago de prueba. Todo se copia antes
// a un archivo aparte; si la persona ya tiene pagos capturados a mano, el
// servidor se rehúsa (eso ya es dinero real).
async function _reqBdjArchivarPrueba(id, folio, estado) {
  const extra = estado === 'aprobada' ? '\n\nEstaba APROBADA: también se quita el viajero y el pago que nacieron de ella.' : '';
  const motivo = prompt('¿Quitar la solicitud ' + folio + ' por ser de PRUEBA?' + extra + '\n\nEscribe un motivo corto (ej. «prueba de Ximena»):', 'prueba');
  if (motivo == null) return;
  const j = await _reqBdjCall({ accion: 'archivar_prueba', id, motivo: String(motivo).trim() || 'prueba', confirmar: true }).catch((e) => ({ error: e.message }));
  if (j && j.ok) {
    showToast('Solicitud ' + folio + ' quitada' + (j.viajeros ? ' (con ' + j.viajeros + ' viajero' + (j.viajeros === 1 ? '' : 's') + ' y ' + j.abonos + ' pago' + (j.abonos === 1 ? '' : 's') + ' de prueba)' : ''), 'success');
    loadRequisiciones();
  } else alert('No se pudo quitar: ' + ((j && j.error) || 'sin respuesta'));
}

// ── [RECHAZO-AVISO-1] RECHAZAR ES AVISAR ────────────────────────────────────
// Antes: cinco atajos de texto y un PATCH mudo. El cliente nunca se enteraba —
// medido: 4 personas que YA habían transferido quedaron rechazadas sin aviso.
//
// Hoy son TRES cosas en la misma caja, y en este orden a propósito:
//   1. los 5 motivos de la casa (los mismos en todos los eventos),
//   2. el texto que se llena solo y SE PUEDE EDITAR (palabra de Memo),
//   3. la VISTA PREVIA del correo exacto que va a recibir.
// Y el botón dice lo que hace: «Rechazar y avisar».
//
// 🔒 La lista NO se teclea aquí: la sirve el servidor desde _lib/correo-rechazo,
//    que es su dueño. Dos listas acabarían diciendo cosas distintas, y ésta es
//    la que el cliente lee.
const _reqMotivos = {};   // id → [motivos]  (lo que contestó el servidor)
function _reqBdjRechazar(id) {
  const box = document.getElementById('req-rch-' + id);
  if (!box) return;
  if (box.style.display !== 'none') { box.style.display = 'none'; return; }
  const apr = document.getElementById('req-apr-' + id); if (apr) apr.style.display = 'none';
  box.innerHTML = '<div class="loading-state"><div class="spinner"></div>Abriendo…</div>';
  box.style.display = 'block';
  _reqBdjRchPintar(id, null);
}
async function _reqBdjRchPintar(id, clave) {
  const box = document.getElementById('req-rch-' + id);
  if (!box) return;
  const txtPrevio = (document.getElementById('req-rch-txt-' + id) || {}).value;
  const j = await _reqBdjCall({ accion: 'rechazo_preview', id, motivo_clave: clave, motivo: txtPrevio || '' })
    .catch((e) => ({ error: e.message }));
  if (!j || !j.ok) {
    box.innerHTML = `<div class="alert alert-error">No se pudo abrir: ${_reqBdjEsc((j && j.error) || 'sin respuesta')}</div>`;
    return;
  }
  _reqMotivos[id] = j.motivos || [];
  const sel = (j.motivos || []).find((m) => m.clave === clave) || null;
  // Al elegir un motivo se PRELLENA su texto; si ya había algo escrito a mano
  // se respeta. 🔒 Lo que viaja es el textarea, nunca la plantilla.
  const texto = txtPrevio != null && txtPrevio !== '' && clave === null ? txtPrevio : (sel ? sel.texto : (txtPrevio || ''));
  const chips = (j.motivos || []).map((m) => `<button type="button" class="rq-chip${m.clave === clave ? ' on' : ''}"`
    + ` style="${m.clave === clave ? 'background:var(--red);color:#fff;border-color:var(--red)' : ''}"`
    + ` onclick="_reqBdjRchElegir('${id}','${m.clave}')">${_reqBdjEsc(m.etiqueta)}</button>`).join('');
  const p = j.preview || {};
  let previa;
  if (!p.avisa) {
    previa = `<div class="rq-note" style="border-left:3px solid var(--ts)">💬 <b>Este motivo no manda correo.</b> ${_reqBdjEsc(p.razon || '')}</div>`;
  } else if (p.error) {
    previa = `<div class="rq-note no">⚠️ <b>No se le puede mandar correo:</b> ${_reqBdjEsc(p.razon)}.`
      + (j.wa ? ` <a href="${_reqBdjEsc(j.wa)}" target="_blank" rel="noopener" style="color:#25d366;font-weight:700">Avísale por WhatsApp →</a>` : '')
      + '</div>';
  } else {
    previa = `<details open style="margin-top:10px">
        <summary style="cursor:pointer;color:#e8ff4c;font-weight:700;font-size:12px">👁 Así le va a llegar — para: ${_reqBdjEsc(p.to)}</summary>
        <div style="font-size:11px;color:var(--ts);margin:6px 0 4px">Asunto: <b style="color:var(--text)">${_reqBdjEsc(p.subject)}</b></div>
        <iframe srcdoc="${_reqBdjEsc(p.html)}" style="width:100%;height:380px;border:1px solid var(--border);border-radius:8px;background:#000"></iframe>
        ${p.catalogo_ok === false ? '<div style="font-size:11px;color:#ffb020;margin-top:4px">No se pudo leer el catálogo: el correo sale sin la fecha ni el link del evento. Se manda igual.</div>' : ''}
      </details>`;
  }
  // [RECHAZO-AVISO-1b] El aviso se calla si esta persona YA viaja: decirle «no
  // pudimos confirmar tu lugar» a quien lo tiene es asustarla sin razón. Pasó
  // con una clienta el 28-oct, y la causa NO fue el envío a mano: aprobar la
  // segunda solicitud y rechazar la primera minutos después lo reproduce solo.
  const ya = j.ya_viaja || {};
  const avisoYaViaja = ya.viaja
    ? `<div class="rq-note" style="border-left:3px solid var(--green)">✅ <b>Ya viaja:</b> ${_reqBdjEsc(ya.razon || '')} <b>No se le va a mandar correo.</b></div>`
    : (ya.comprobado === false
      ? `<div class="rq-note" style="border-left:3px solid #ffb020">⚠️ No se pudo revisar si ya viaja (${_reqBdjEsc(ya.razon || 'el padrón no respondió')}). El correo SÍ sale — revisa que no tenga ya su lugar en otra fecha.</div>`
      : '');
  const puedeAvisar = !!(p.avisa && !p.error && !ya.viaja);
  box.innerHTML = `
    <h4 style="color:var(--red)">Rechazar la solicitud</h4>
    <div style="font-size:11.5px;color:var(--ts);margin:0 0 8px">1 · Elige el motivo &nbsp;·&nbsp; 2 · Edítalo si quieres &nbsp;·&nbsp; 3 · Revisa el correo y manda</div>
    <div class="rq-chips">${chips}</div>
    <label class="rq-field">Lo que va a leer el cliente *
      <textarea id="req-rch-txt-${id}" maxlength="500" rows="2" placeholder="Toca un motivo arriba o escríbelo tú"
        oninput="_reqBdjRchRefrescar('${id}')" style="width:100%;box-sizing:border-box;resize:vertical">${_reqBdjEsc(texto)}</textarea></label>
    ${avisoYaViaja}
    ${j.pago && !ya.viaja ? '<div class="rq-note" style="border-left:3px solid var(--green)">💚 Ya transfirió: el correo le dice que <b>su pago queda a su favor</b> y que no tiene que volver a pagar.</div>' : ''}
    ${ya.viaja ? '' : previa}
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="rq-btn dan full" id="req-rch-go-${id}" onclick="_reqBdjRechazarGo('${id}')">${puedeAvisar ? 'Rechazar y avisar' : 'Rechazar (sin correo)'}</button>
      <button class="rq-btn quiet" onclick="document.getElementById('req-rch-${id}').style.display='none'">Cancelar</button>
    </div>
    <div id="req-rch-msg-${id}" class="rq-msg"></div>`;
}
function _reqBdjRchElegir(id, clave) {
  const t = document.getElementById('req-rch-txt-' + id);
  const m = (_reqMotivos[id] || []).find((x) => x.clave === clave);
  if (t && m) t.value = m.texto;          // prellena; sigue siendo editable
  _reqBdjRchPintar(id, clave);
}
// Mientras teclea no se le pide al servidor en cada letra: se espera a que pare.
let _reqRchTimer = null;
function _reqBdjRchRefrescar(id) {
  clearTimeout(_reqRchTimer);
  const clave = ((_reqMotivos[id] || []).find((m) => {
    const b = document.querySelector('#req-rch-' + id + ' .rq-chip.on'); return b && b.textContent.trim() === m.etiqueta;
  }) || {}).clave || null;
  _reqRchTimer = setTimeout(() => _reqBdjRchPintar(id, clave), 700);
}
async function _reqBdjRechazarGo(id) {
  const motivo = ((document.getElementById('req-rch-txt-' + id) || {}).value || '').trim();
  const msg = document.getElementById('req-rch-msg-' + id);
  if (motivo.length < 3) { if (msg) { msg.textContent = 'Escribe qué va a leer el cliente.'; msg.style.color = 'var(--red)'; } return; }
  const chipOn = document.querySelector('#req-rch-' + id + ' .rq-chip.on');
  const clave = chipOn ? ((_reqMotivos[id] || []).find((m) => m.etiqueta === chipOn.textContent.trim()) || {}).clave || null : null;
  const btn = document.getElementById('req-rch-go-' + id); if (btn) { btn.disabled = true; btn.textContent = 'Rechazando…'; }
  const j = await _reqBdjCall({ accion: 'rechazar', id, motivo, motivo_clave: clave }).catch((e) => ({ error: e.message }));
  if (j && j.ok) {
    // 🔒 El aviso se DICE: que el rechazo haya salido bien no significa que el
    //    cliente se haya enterado, y confundirlos es el defecto original.
    const a = j.aviso || {};
    if (a.avisado) showToast('Rechazada · correo enviado a ' + (a.to || ''), 'success');
    else if (a.razon && /cierre interno/i.test(a.razon)) showToast('Rechazada (ese motivo no manda correo)', 'success');
    else showToast('Rechazada, PERO no se le avisó: ' + (a.razon || 'sin razón') + (a.wa ? ' — avísale por WhatsApp desde su renglón' : ''), 'warning');
    loadRequisiciones();
  } else { if (msg) { msg.textContent = 'No se pudo rechazar: ' + ((j && j.error) || 'sin respuesta'); msg.style.color = 'var(--red)'; } if (btn) { btn.disabled = false; btn.textContent = 'Rechazar y avisar'; } }
}
