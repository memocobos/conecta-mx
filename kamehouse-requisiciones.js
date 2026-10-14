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
  const cont = document.getElementById('req-bdj-lista');
  if (!cont) return;
  if (_reqBdjCargando) return;
  _reqBdjCargando = true;
  cont.innerHTML = '<div style="color:var(--ts);padding:20px">Cargando la bandeja…</div>';
  const j = await _reqBdjCall({ accion: 'listar', estado: _reqBdjFiltro }).catch((e) => ({ error: e.message }));
  _reqBdjCargando = false;
  // Los tabs pintan su estado activo SIEMPRE (también en error).
  document.querySelectorAll('#req-bdj-tabs .tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.filtro === _reqBdjFiltro);
  });
  if (!j || !j.ok) {
    cont.innerHTML = `<div style="color:var(--red);padding:20px">No se pudo leer la bandeja: ${_reqBdjEsc((j && j.error) || 'sin respuesta')}</div>`;
    return;
  }
  _reqBdjRows = j.requisiciones || [];
  const badge = document.getElementById('req-bdj-pend');
  // j.pendientes en null = «no se pudo contar», que NO es cero.
  if (badge) badge.textContent = (j.pendientes == null) ? '?' : String(j.pendientes);
  if (!_reqBdjRows.length) {
    cont.innerHTML = `<div style="color:var(--ts);padding:24px;text-align:center">No hay requisiciones ${_reqBdjFiltro === 'todas' ? '' : _reqBdjEsc(_reqBdjFiltro + 's')} por ahora.<br><span style="font-size:11px">Las que lleguen del sitio caen aquí solas.</span></div>`;
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
  const TIPO = { hotel: 'Habitación / hotel', zona: 'Zona', fecha: 'Fecha', otro: 'Otro' };
  box.innerHTML = `<div style="font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin:0 0 8px">Cambios pedidos desde el Portal · ${rows.length}</div>`
    + rows.map((c) => {
      const v = c.viajero || {};
      const wa = String(v.celular || '').replace(/\D/g, '');
      return `<div class="card" style="padding:12px 14px;margin-bottom:10px;border-left:3px solid var(--yellow, #e8ff4c)">
        <div style="font-weight:800">${_reqBdjEsc(c.nombre || v.nombre || '—')} · ${_reqBdjEsc(c.evento_id)}</div>
        <div style="font-size:12px;color:var(--ts);margin:2px 0 6px">${_reqBdjEsc(TIPO[c.tipo] || c.tipo)} · hoy: ${_reqBdjEsc([v.tipo_paquete, v.zona_boleto].filter(Boolean).join(' · ') || '—')} · ${_reqBdjEsc(c.correo)}${wa ? ' · WA ' + _reqBdjEsc(wa) : ''}</div>
        <div style="font-size:13px;margin-bottom:8px">«${_reqBdjEsc(c.detalle)}»</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${wa.length === 10 ? `<a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/52${wa}">WhatsApp</a>` : ''}
          <button class="btn btn-sm" onclick="_reqCambioCerrar('${c.id}','atendida')">Ya lo atendí</button>
          <button class="btn btn-sm" onclick="_reqCambioCerrar('${c.id}','rechazada')">No procede</button>
        </div></div>`;
    }).join('');
}
async function _reqCambioCerrar(id, estado) {
  let respuesta = '';
  if (estado === 'rechazada') {
    respuesta = prompt('¿Por qué no procede? (el cliente lo va a preguntar)');
    if (respuesta == null) return;
  } else {
    respuesta = prompt('Nota opcional (qué se cambió):') || '';
  }
  const j = await _reqBdjCall({ accion: 'cambio_cerrar', id, estado, respuesta }).catch((e) => ({ error: e.message }));
  if (j && j.ok) loadCambiosPortal();
  else alert('No se pudo cerrar: ' + ((j && j.error) || 'sin respuesta'));
}

function _reqBdjCard(r) {
  const esPend = r.estado === 'pendiente';
  const colorEstado = r.estado === 'aprobada' ? 'var(--green)' : r.estado === 'rechazada' ? 'var(--red)' : 'var(--yellow, #e8ff4c)';
  const chip = (t) => t ? `<span style="display:inline-block;padding:2px 8px;border:1px solid var(--border);border-radius:999px;font-size:10.5px;color:var(--ts);margin:2px 4px 2px 0">${_reqBdjEsc(t)}</span>` : '';
  const formaTxt = { transferencia: 'Transferencia', deposito: 'Depósito', oxxo: 'OXXO', link_pago: '🔗 PIDE LINK DE PAGO' }[r.forma_pago] || r.forma_pago;
  const cel = String(r.celular || '').replace(/\D/g, '');
  return `
  <div class="card" style="margin-bottom:12px;padding:14px" id="req-card-${r.id}">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">
      <div>
        <b style="font-size:15px">${_reqBdjEsc(r.nombre)}</b>
        <span style="color:var(--ts);font-size:12px"> · ${_reqBdjEsc(r.evento_nombre || r.evento_id)}</span>
      </div>
      <div style="font-size:11px;letter-spacing:.06em"><b style="color:${colorEstado};text-transform:uppercase">${_reqBdjEsc(r.estado)}</b> <span style="color:var(--ts)">· ${_reqBdjEsc(r.folio)} · ${_reqBdjFecha(r.creado_en)}</span></div>
    </div>
    <div style="margin:8px 0 6px">
      ${chip(String(r.paquete || '').toUpperCase())}${chip(r.zona)}${chip((r.num_personas || 1) + (r.num_personas > 1 ? ' personas' : ' persona'))}${chip(r.hotel)}${chip(r.transporte)}${chip(formaTxt)}
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--ts);margin-bottom:10px">
      <span>Separo del sistema: <b style="color:var(--text)">${_reqBdjMxn(r.separo_sistema)}</b></span>
      <span>Total del sistema: <b style="color:var(--text)">${_reqBdjMxn(r.total_sistema)}</b>${(r.transporte && r.total_sistema != null) ? ' <i style="font-size:10px">(sin transporte CDMX)</i>' : ''}</span>
      <span>WhatsApp: <b style="color:var(--text)">${_reqBdjEsc(r.celular)}</b></span>
      ${r.correo ? `<span>Correo: <b style="color:var(--text)">${_reqBdjEsc(r.correo)}</b></span>` : ''}
      ${r.talla_playera ? `<span>Talla: <b style="color:var(--text)">${_reqBdjEsc(r.talla_playera)}</b></span>` : ''}
      ${r.num_emergencia ? `<span>Emergencia: <b style="color:var(--text)">${_reqBdjEsc(r.num_emergencia)}</b></span>` : ''}
    </div>
    ${Array.isArray(r.acompanantes) && r.acompanantes.length ? `<div style="font-size:12px;color:var(--ts);margin-bottom:10px;line-height:1.6">
      <div style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px">Acompañantes (al aprobar nace un viajero por persona${Array.isArray(r.desglose) ? ', con el pago que declaró cada quien' : ', el pago repartido'})</div>
      ${r.acompanantes.map((a, i) => `<div>${i + 1}. <b style="color:var(--text)">${_reqBdjEsc(a.nombre)}</b> · ${_reqBdjEsc(a.correo)}${a.celular ? ' · WA ' + _reqBdjEsc(a.celular) : ''}${a.talla_playera ? ' · talla ' + _reqBdjEsc(a.talla_playera) : ''}${a.num_emergencia ? ' · emerg. ' + _reqBdjEsc(a.num_emergencia) : ''}</div>`).join('')}
    </div>` : ''}
    ${r.cotizacion_texto ? `<details style="margin-bottom:10px"><summary style="cursor:pointer;font-size:11px;color:var(--ts)">Ver la cotización que el cliente vio</summary><pre style="white-space:pre-wrap;font-size:11px;color:var(--ts);background:rgba(255,255,255,.04);padding:10px;border-radius:8px;margin:6px 0 0">${_reqBdjEsc(r.cotizacion_texto)}</pre></details>` : ''}
    ${r.estado === 'rechazada' && r.motivo_rechazo ? `<div style="font-size:12px;color:var(--red);margin-bottom:8px">Motivo: ${_reqBdjEsc(r.motivo_rechazo)}</div>` : ''}
    ${r.estado !== 'pendiente' && r.revisada_por ? `<div style="font-size:11px;color:var(--ts);margin-bottom:8px">Revisada por ${_reqBdjEsc(r.revisada_por)}${r.nota_staff ? ' · ' + _reqBdjEsc(r.nota_staff) : ''}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${r.comprobante_path ? `<button class="btn btn-ghost btn-sm" onclick="_reqBdjVerComprobante('${r.id}')">📎 Ver comprobante</button>` : '<span style="font-size:11px;color:var(--ts);align-self:center">Sin comprobante (pide link de pago)</span>'}
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/52${cel}?text=${encodeURIComponent('¡Hola ' + (String(r.nombre || '').split(' ')[0]) + '! Te escribimos de Conecta Reynosa por tu reservación ' + r.folio + ' 😄')}">💬 WhatsApp</a>
      ${esPend ? `<button class="btn btn-primary btn-sm" onclick="_reqBdjAprobarUI('${r.id}')">✓ Aprobar…</button>` : ''}
      ${esPend ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="_reqBdjRechazar('${r.id}')">✕ Rechazar</button>` : ''}
      ${r.estado === 'aprobada' && r.viajero_id ? '<span style="font-size:11px;color:var(--green);align-self:center">Viajero creado ✓</span>' : ''}
      ${(typeof currentUser !== 'undefined' && currentUser && currentUser.rol === 'maestro_roshi') ? `<button class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:10px;color:var(--ts)" title="Quitar esta solicitud de la bandeja (era de prueba). Se guarda una copia en el archivo." onclick="_reqBdjArchivarPrueba('${r.id}','${_reqBdjEsc(r.folio)}','${r.estado}')">🗑 Era prueba</button>` : ''}
    </div>
    <div id="req-apr-${r.id}" style="display:none;margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:10px"></div>
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
  const esRide = r.paquete === 'ride';
  box.innerHTML = `
    <div style="font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px">Al aprobar NACE el viajero con su abono</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:8px">
      <label style="font-size:11px;color:var(--ts)">Abono verificado (lo que dice el comprobante) *<input type="number" id="req-apr-monto-${id}" value="${_reqBdjMontoInicial(r)}" min="1" step="1" oninput="_reqBdjDesgloseSuma('${id}')" style="width:100%;margin-top:4px"></label>
      <label style="font-size:11px;color:var(--ts)">Total del contrato *<input type="number" id="req-apr-total-${id}" value="${r.total_sistema != null ? Math.round(Number(r.total_sistema)) : ''}" min="1" step="1" style="width:100%;margin-top:4px"></label>
      ${esRide ? '' : `<label style="font-size:11px;color:var(--ts)">Zona del boleto *<input type="text" id="req-apr-zona-${id}" value="${_reqBdjEsc(r.zona || '')}" style="width:100%;margin-top:4px"></label>`}
    </div>
    ${_reqBdjDesgloseHtml(r, id)}
    <label style="font-size:11px;color:var(--ts)">Nota (opcional)<input type="text" id="req-apr-nota-${id}" maxlength="500" style="width:100%;margin-top:4px"></label>
    ${(r.transporte && r.total_sistema != null) ? '<div style="font-size:11px;color:var(--orange,#ffb020);margin-top:6px">⚠️ El total del sistema NO incluye el transporte a CDMX — ajústalo si aplica (la cotización del cliente lo trae).</div>' : ''}
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-primary btn-sm" id="req-apr-go-${id}" onclick="_reqBdjAprobar('${id}')">Confirmar — crear viajero</button>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('req-apr-${id}').style.display='none'">Cancelar</button>
    </div>
    <div id="req-apr-msg-${id}" style="font-size:12px;margin-top:8px"></div>`;
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
  return `<div style="margin:4px 0 10px;padding:10px;border:1px dashed var(--border);border-radius:8px">
    <div style="font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px">¿Cuánto pagó cada quien?</div>
    <div style="font-size:11px;color:var(--ts);margin-bottom:8px">${dec ? 'Lo que declaró el cliente (suma ' + _reqBdjMxn(sumaDec) + ').' : 'El cliente no mandó desglose: viene parejo.'} Corrígelo si no cuadra con el comprobante — tiene que sumar el abono verificado.</div>
    ${ps.map((nom, i) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="flex:1;font-size:12px">${i === 0 ? '👤 ' : ''}${_reqBdjEsc(nom)}</span>
      <input type="number" class="req-apr-pago-${id}" value="${vals[i]}" min="0" step="1" oninput="_reqBdjDesgloseSuma('${id}')" style="width:110px">
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
  const j = await _reqBdjCall(body).catch((e) => ({ error: e.message }));
  if (j && j.ok) {
    // [ACOMP-1] Cuántos viajeros nacieron y qué pasó con el Portal — dicho, no supuesto.
    const nv = Array.isArray(j.viajeros) ? j.viajeros.length : 1;
    let txt = '✓ ' + (nv > 1 ? nv + ' viajeros creados' : 'Viajero creado') + ' con ' + _reqBdjMxn(j.monto) + ' cobrados. Confírmale al cliente por WhatsApp.';
    const pt = j.portal;
    // [CONFIRMA-1] el correo único: confirmación + invitación al Portal adentro.
    if (pt && (pt.enviados || []).length) txt += ' · Correo de confirmación enviado (' + pt.enviados.length + ')' + ((pt.invitados || []).length ? ', con invitación al Portal' : '') + ((pt.errores || []).length ? ' · ⚠️ ' + pt.errores.length + ' con error' : '') + (pt.aviso ? ' · ⚠️ ' + pt.aviso : '');
    else if (pt) txt += ' · ⚠️ El correo no salió: ' + (pt.aviso || ((pt.errores && pt.errores[0] && pt.errores[0].paso) || 'sin respuesta'));
    if (msg) { msg.textContent = txt; msg.style.color = 'var(--green)'; }
    setTimeout(() => loadRequisiciones(), pt ? 4000 : 900);
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

async function _reqBdjRechazar(id) {
  const motivo = prompt('¿Por qué se rechaza? (el cliente lo va a preguntar)');
  if (motivo == null) return;
  if (String(motivo).trim().length < 3) { alert('Escribe el motivo.'); return; }
  const j = await _reqBdjCall({ accion: 'rechazar', id, motivo: String(motivo).trim() }).catch((e) => ({ error: e.message }));
  if (j && j.ok) loadRequisiciones();
  else alert('No se pudo rechazar: ' + ((j && j.error) || 'sin respuesta'));
}
