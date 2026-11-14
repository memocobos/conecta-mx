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

// ═══════════════════════════════════════════════════════════════════════════
// [REQ-SIMPLE-1 · 13-nov-2026] EL MAPA DE LA BANDEJA
// Palabra de Memo: «son muchos clicks, muchas cosas que poner atención, hay
// momentos en los que no sé qué estoy haciendo … si yo no la entiendo, cómo le
// explico a mi team». Lo que había: cinco cajas distintas bajo un solo título
// («las reservaciones del sitio»), en el orden en que contestaba cada lectura, y
// un contador «PENDIENTES 0» que solo contaba UNA de las cinco.
// Lo que hay: UNA tarjeta por TRABAJO, con su número y qué se hace ahí. Tocar una
// enseña solo ese trabajo; el contador de arriba es la suma de todos.
// 🔒 Cada número lo cuenta su propia lectura (la misma lista que se pinta abajo:
// el número y la lista no pueden decir cosas distintas). null = cargando ·
// -1 = no se pudo leer — que NO es cero y se pinta «?».
// 🔒 El orden es de urgencia y es FIJO: primero el dinero (reservaciones y
// pagos), luego quien no ve su viaje, luego publicar, el rol y los cambios.
// ═══════════════════════════════════════════════════════════════════════════
const _REQ_SECS = [
  { k: 'sitio', ico: '🧾', t: 'Reservaciones nuevas', q: 'Revisar el comprobante y aprobar' },
  { k: 'pagos', ico: '💳', t: 'Pagos por capturar', q: 'Ver el comprobante y capturar el abono' },
  { k: 'ligar', ico: '🔗', t: 'No ven su viaje', q: 'Decir quién es: «Es esta persona»' },
  { k: 'portal', ico: '🪪', t: 'Viajes por publicar', q: 'Revisar sus números y publicar' },
  { k: 'rol', ico: '🗓', t: 'Rol por fijar', q: 'Fijar su calendario de pagos' },
  { k: 'cambios', ico: '🔁', t: 'Cambios pedidos', q: 'Atender y cerrar' },
];
const _reqConteo = { sitio: null, pagos: null, ligar: null, portal: null, rol: null, cambios: null };
let _reqFoco = null;          // el trabajo a la vista ('todo' = todos)
let _reqFocoManual = false;   // ya eligió una tarjeta: no se le mueve sola
function _reqContar(sec, n) {
  const antes = _reqConteo[sec];
  _reqConteo[sec] = (n == null) ? -1 : n;
  // Acabó el último de ESE trabajo (pasó de algo a cero): se suelta la elección
  // para que la bandeja lo lleve sola al siguiente trabajo con pendientes.
  if (_reqFocoManual && _reqFoco === sec && antes > 0 && n === 0) _reqFocoManual = false;
  _reqMapaPintar();
}
function _reqEnfocar(sec) { _reqFoco = sec; _reqFocoManual = true; _reqMapaPintar(); }
function _reqMapaHtml(foco) {
  return _REQ_SECS.map((s) => {
    const n = _reqConteo[s.k];
    const cls = 'rq-tile' + (foco === s.k ? ' on' : '') + (n === 0 ? ' cero' : '') + (n === -1 ? ' err' : '');
    const num = n == null ? '…' : n === -1 ? '?' : n === 0 ? '✓ al día' : String(n);
    return `<button type="button" class="${cls}" onclick="_reqEnfocar('${s.k}')"><span class="rq-tile-t">${s.ico} ${s.t}</span><span class="rq-tile-n">${num}</span><span class="rq-tile-q">${s.q}</span></button>`;
  }).join('')
    + `<button type="button" class="rq-tile todo${foco === 'todo' ? ' on' : ''}" onclick="_reqEnfocar('todo')"><span class="rq-tile-t">📋 Ver todo junto</span><span class="rq-tile-n">Todo</span><span class="rq-tile-q">Todos los trabajos, uno tras otro</span></button>`;
}
function _reqMapaPintar() {
  const vals = _REQ_SECS.map((s) => _reqConteo[s.k]);
  const listos = vals.every((n) => n != null);
  // Sin elección del usuario: el primer trabajo con algo pendiente (orden de
  // urgencia). Mientras alguna lectura no contesta, todo a la vista: no se
  // enfoca a ciegas para brincar medio segundo después.
  if (!_reqFocoManual) {
    if (listos) { const p = _REQ_SECS.find((s) => _reqConteo[s.k] > 0 || _reqConteo[s.k] === -1); _reqFoco = p ? p.k : 'sitio'; }
    else _reqFoco = null;
  }
  const foco = _reqFoco || 'todo';
  const mapa = document.getElementById('req-mapa');
  if (mapa) mapa.innerHTML = _reqMapaHtml(foco);
  const secs = document.querySelectorAll ? document.querySelectorAll('#page-requisiciones .rq-sec') : [];
  Array.prototype.forEach.call(secs, (el) => {
    const k = el.dataset ? el.dataset.sec : null;
    // «extras» (bitácora, ensayo de recordatorios) va siempre al final, plegado.
    el.hidden = !(foco === 'todo' || k === foco || k === 'extras');
  });
  const badge = document.getElementById('req-bdj-pend');
  if (badge) {
    const tot = vals.reduce((a, n) => a + (n > 0 ? n : 0), 0);
    // Un trabajo que no se pudo leer NO es cero: el total lo dice con «+?».
    badge.textContent = !listos ? '…' : String(tot) + (vals.some((n) => n === -1) ? '+?' : '');
  }
}

async function loadRequisiciones(filtro) {
  // Cambiar de pestaña (Pendientes/Aprobadas/…) solo recarga las reservaciones
  // del sitio: los otros trabajos no dependen de ese filtro.
  const soloPestana = !!filtro && filtro !== _reqBdjFiltro && _reqConteo.sitio != null;
  if (filtro) _reqBdjFiltro = filtro;
  if (!soloPestana) {
    try { loadCambiosPortal(); } catch (_) {}
    try { loadPreventaCostos(); } catch (_) {}
    // [PORTAL-SOLO-1] Lo que el cliente espera ver en su Portal (y, dentro, el rol).
    try { if (typeof loadRevisionesPortal === 'function') loadRevisionesPortal(); } catch (_) {}
  }
  _reqMapaPintar();
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
    _reqContar('sitio', -1);
    return;
  }
  _reqBdjRows = j.requisiciones || [];
  // j.pendientes en null = «no se pudo contar», que NO es cero (el mapa pinta «?»).
  _reqContar('sitio', j.pendientes);
  if (!_reqBdjRows.length) {
    cont.innerHTML = `<div class="rq-empty"><b>${_reqBdjFiltro === 'pendiente' ? 'Bandeja al día ✓' : 'Nada por aquí'}</b>No hay requisiciones ${_reqBdjFiltro === 'todas' ? '' : _reqBdjEsc(_reqBdjFiltro + 's')} por ahora. Las que lleguen del sitio caen aquí solas.</div>`;
    return;
  }
  cont.innerHTML = _reqBdjRows.map(_reqBdjCard).join('');
}

// ── [PORTAL-EDIT-1] Solicitudes de cambio que el cliente manda desde el Portal ──
// Viven ARRIBA de las requisiciones. No cambian nada solas: se atienden a mano
// (el cambio se hace en el viajero) y se cierran aquí. Se calla en cero.
// [PREVENTA-AUTO-1] «📣 ¡Ya hay paquetes!» a la preventa a ciegas de un evento
// que ya salió a la venta. Solo se pinta si hay alguien en preventa en un evento
// que YA vende paquetes reales. Ver el correo primero (seco), luego mandar.
async function loadPreventaCostos() {
  const lista = document.getElementById('req-bdj-lista');
  if (!lista) return;
  let box = document.getElementById('req-prev-costos');
  if (!box) { box = document.createElement('div'); box.id = 'req-prev-costos'; lista.parentNode.insertBefore(box, lista); }
  const j = await _reqBdjCall({ accion: 'preventa_costos_lista' }).catch(() => null);
  const evs = ((j && j.eventos) || []).filter((e) => e.con_paquetes && e.correos > (e.enviados || 0));
  // [REQ-SIMPLE-1] Cuenta dentro del trabajo «🔁 Cambios pedidos» (vive en su sección).
  _reqPrevN = evs.length;
  if (_reqCambiosN != null) _reqContar('cambios', _reqCambiosN + _reqPrevN);
  if (!evs.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="rq-section">📣 Preventa a ciegas · ya hay paquetes <span class="rq-pill pend">${evs.length}</span></div>`
    + evs.map((e) => `<div class="rq-cambio">
      <div class="rq-name">${_reqBdjEsc(e.evento)}</div>
      <div class="rq-ev">${e.personas} en preventa · ${e.correos} correos · ${e.enviados == null ? '?' : e.enviados} ya avisados</div>
      <div style="font-size:12px;opacity:.85;margin:4px 0">Les llega «¡Ya hay paquetes!»: $300 de descuento + sus $300 cuentan como pago; eligen en su Portal y queda confirmado solo.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="rq-btn" onclick="_reqPrevCostos('${_reqBdjEsc(e.evento_id)}', false)">👁 Ver el correo y a quién</button>
        <button class="rq-btn pri" onclick="_reqPrevCostos('${_reqBdjEsc(e.evento_id)}', true)">📨 Mandar</button>
      </div>
      <div id="req-prev-out-${_reqBdjEsc(e.evento_id)}" style="margin-top:8px"></div></div>`).join('');
}
async function _reqPrevCostos(slug, mandar) {
  const out = document.getElementById('req-prev-out-' + slug);
  if (mandar && !confirm('¿Mandar el correo «¡Ya hay paquetes!» a la preventa de este evento? Es un correo REAL.')) return;
  if (out) out.textContent = mandar ? 'Mandando…' : 'Cargando…';
  const j = await _reqBdjCall(mandar ? { accion: 'preventa_costos', evento_id: slug, seco: false, confirmar: true } : { accion: 'preventa_costos', evento_id: slug });
  if (!out) return;
  if (!j || !j.ok) { out.innerHTML = `<span style="color:var(--red)">${_reqBdjEsc((j && j.error) || 'No se pudo')}</span>`; return; }
  if (j.seco) {
    out.innerHTML = `<div style="font-size:12px">A quién (${j.a_quien.length}): ${j.a_quien.map((x) => _reqBdjEsc(x.nombre || x.correo)).join(', ') || '—'}`
      + (j.ya_recibieron ? ` · ya lo recibieron ${j.ya_recibieron}` : '')
      + (j.saltados.length ? `<br>Sin correo usable / sin publicar: ${j.saltados.map(_reqBdjEsc).join(', ')}` : '') + '</div>'
      + (j.ejemplo ? `<iframe style="width:100%;height:520px;border:1px solid var(--border,#333);border-radius:8px;margin-top:6px;background:#000" srcdoc="${_reqBdjEsc('<meta charset="utf-8">' + j.ejemplo.html)}"></iframe>` : '');
    return;
  }
  const sinBit = (j.enviados || []).filter((x) => !x.bitacora).length;
  showToast(_reqBdjEsc(`Mandados ${j.enviados.length}` + (j.errores.length ? ` · ${j.errores.length} fallaron` : '') + (sinBit ? ` · ${sinBit} sin bitácora` : '') + (j.faltan ? ` · faltan ${j.faltan}: vuelve a apretar` : '')), j.errores.length || sinBit ? 'warning' : 'success');
  loadPreventaCostos();
}
// [REQ-SIMPLE-1] El encabezado de cada trabajo: título + número + qué se hace ahí.
function _reqSecH(titulo, que, n) {
  return `<div class="rq-sec-h"><b>${titulo}${n ? ` <span class="rq-pill pend">${n}</span>` : ''}</b><span class="rq-sec-q">${que}</span></div>`;
}
let _reqCambiosN = null, _reqPrevN = null;   // las dos mitades del trabajo «Cambios pedidos»
function _reqCajaDe(id) {
  let b = document.getElementById(id);
  if (!b) {
    const lista = document.getElementById('req-bdj-lista');
    if (!lista) return null;
    b = document.createElement('div'); b.id = id; lista.parentNode.insertBefore(b, lista);
  }
  return b;
}
// Una lectura, DOS trabajos: los comprobantes de pago van a «💳 Pagos por
// capturar» (dinero: lo primero) y lo demás a «🔁 Cambios pedidos».
async function loadCambiosPortal() {
  const box = _reqCajaDe('req-cambios'), boxPagos = _reqCajaDe('req-pagos');
  if (!box || !boxPagos) return;
  const j = await _reqBdjCall({ accion: 'cambios_listar', estado: 'pendiente' }).catch((e) => ({ error: e.message }));
  if (!j || !j.ok) {
    const err = `<div class="rq-aviso mal">No se pudieron leer las solicitudes del Portal: ${_reqBdjEsc((j && j.error) || 'sin respuesta')}</div>`;
    boxPagos.innerHTML = _reqSecH('💳 Pagos por capturar', 'Los comprobantes que suben los clientes desde su Portal.') + err;
    box.innerHTML = _reqSecH('🔁 Cambios pedidos desde el Portal', 'Lo que el cliente pide cambiar de su viaje.') + err;
    _reqContar('pagos', -1); _reqCambiosN = null; _reqContar('cambios', -1);
    return;
  }
  const rows = j.cambios || [];
  _reqCambiosRows = rows;
  const pagos = rows.filter((c) => c.tipo === 'pago');
  const otros = rows.filter((c) => c.tipo !== 'pago');
  boxPagos.innerHTML = _reqSecH('💳 Pagos por capturar', 'El cliente subió su comprobante (o pagó en Mercado Pago). Mira el comprobante junto a su cuenta, teclea lo que dice el banco y captura: nace su abono y le llega «Recibimos tu pago».', pagos.length)
    + (pagos.length ? pagos.map(_reqPagoCard).join('') : '<div class="rq-aldia">✓ Ningún comprobante esperando. Cuando un cliente suba su pago desde el Portal, cae aquí solo.</div>');
  box.innerHTML = _reqSecH('🔁 Cambios pedidos desde el Portal', 'El cliente pidió cambiar algo de su viaje (fecha, paquete, zona, habitación). «✏️ Hacer el cambio» lo aplica AQUÍ mismo: se guarda en su viaje, la solicitud queda aprobada y a él le llega un correo. «No procede» le avisa con tu motivo.', otros.length)
    + (otros.length ? otros.map(_reqCambioCard).join('') : '<div class="rq-aldia">✓ Nadie ha pedido cambios.</div>')
    + _reqCambiosHistCaja();
  _reqContar('pagos', pagos.length);
  _reqCambiosN = otros.length;
  _reqContar('cambios', otros.length + (_reqPrevN || 0));
  _reqPagoFotos(pagos);
}
const _REQ_TIPO = { hotel: 'Habitación / hotel', zona: 'Zona', fecha: 'Fecha', otro: 'Otro', paquete: '🎟 Elige su paquete (preventa)', pago: '💳 Comprobante de pago' };
// El evento con su NOMBRE y la fecha de su #N (los pone el servidor); sin
// catálogo cae al identificador, que es lo que había.
function _reqEvTxt(c) {
  return _reqBdjEsc(c.evento_nombre || c.evento_id || '—') + (c.evento_fecha ? ' · ' + _reqBdjEsc(c.evento_fecha) : '');
}
function _reqCambioCard(c) {
  const TIPO = _REQ_TIPO;
  const v = c.viajero || {};
  const wa = String(v.celular || '').replace(/\D/g, '');
  // [CAMBIO-APLICA-1] Cómo está HOY, completo: quien pide «habitación doble»
  // se atiende sabiendo en cuál está (y cuántos lugares trae su fila).
  const hoy = _reqBdjEsc([v.tipo_paquete ? String(v.tipo_paquete).toUpperCase() : null, v.zona_boleto,
    v.hotel_tipo ? 'hab. ' + v.hotel_tipo : null, Number(v.boletos) > 1 ? v.boletos + ' lugares' : null].filter(Boolean).join(' · ') || '—');
  // [PREVENTA-PORTAL-1] La elección de paquete de la preventa se APLICA desde
  // aquí: «Aplicar» llama a viajero_elegir_paquete (el mismo dueño que el
  // botón 🎟 de la lista: puerta de zonas, inventario, contrato) y cierra.
  if (c.tipo === 'paquete') {
    return `<div class="rq-cambio" id="rq-cambio-${c.id}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
          <div class="rq-name">${_reqBdjEsc(c.nombre || v.nombre || '—')}</div>
          <span class="rq-tag">${_reqBdjEsc(TIPO.paquete)}</span>
        </div>
        <div class="rq-ev">${_reqEvTxt(c)} · hoy: ${hoy} · ${_reqBdjEsc(c.correo)}${wa ? ' · WA ' + _reqBdjEsc(wa) : ''}</div>
        <div style="font-size:14px;margin:6px 0"><b>${_reqBdjEsc(String(c.paquete_pedido || '').toUpperCase())}</b>${c.zona_pedida ? ' · ' + _reqBdjEsc(c.zona_pedida) : ''}${c.hotel_pedido ? ' · ' + _reqBdjEsc(c.hotel_pedido) : ''}${c.precio_lista != null ? ' · lista $' + Number(c.precio_lista).toLocaleString('es-MX') : ''}</div>
        <div class="rq-linea">
          <button class="rq-btn pri" onclick="_reqPaqAbrir('${c.id}')">✓ Aplicar paquete</button>
          ${wa.length === 10 ? `<a class="rq-btn wa" target="_blank" rel="noopener" href="https://wa.me/52${wa}">💬 WhatsApp</a>` : ''}
          <span class="rq-sp"></span>
          <button class="rq-btn dan" onclick="_reqCambioCerrar('${c.id}','rechazada')">No procede</button>
        </div>
        <div id="rq-cambio-form-${c.id}"></div></div>`;
  }
  return `<div class="rq-cambio" id="rq-cambio-${c.id}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
          <div class="rq-name">${_reqBdjEsc(c.nombre || v.nombre || '—')}</div>
          <span class="rq-tag">${_reqBdjEsc(TIPO[c.tipo] || c.tipo)}</span>
        </div>
        <div class="rq-ev">${_reqEvTxt(c)} · hoy: ${hoy} · ${_reqBdjEsc(c.correo)}${wa ? ' · WA ' + _reqBdjEsc(wa) : ''}</div>
        <q>${_reqBdjEsc(c.detalle)}</q>
        <div class="rq-linea">
          <button class="rq-btn pri" onclick="_reqCambioAplicarAbrir('${c.id}')">✏️ Hacer el cambio</button>
          ${wa.length === 10 ? `<a class="rq-btn wa" target="_blank" rel="noopener" href="https://wa.me/52${wa}">💬 WhatsApp</a>` : ''}
          <span class="rq-sp"></span>
          <button class="rq-btn quiet" title="Solo si ya se resolvió por otro lado o no había nada que cambiar en su viaje" onclick="_reqCambioCerrar('${c.id}','atendida')">Ya lo atendí por fuera</button>
          <button class="rq-btn dan" onclick="_reqCambioCerrar('${c.id}','rechazada')">No procede</button>
        </div>
        <div id="rq-cambio-form-${c.id}"></div></div>`;
}

// ── [PAGO-CLARO-1 · 13-nov-2026] EL COMPROBANTE CON SU CUENTA ENFRENTE ──────
// Palabra de Memo: «lo de los comprobantes de pago de los abonos también siento
// que les falta más». La tarjeta enseñaba un nombre, un identificador de evento
// y un botón que abría la foto EN OTRA PESTAÑA: para saber si el monto tenía
// sentido había que irse a Capsule a buscar a la persona. Ahora, sin salir:
//   · el comprobante A LA VISTA (clic = verlo grande ahí mismo);
//   · su cuenta: total · pagado · le falta · lo que LE TOCA hoy por su rol;
//   · lo que declaró, sus últimos abonos y un aviso si ya hay uno reciente por
//     el mismo monto (el archivo idéntico ya lo frena COMPROBANTE-DUP-1; esto
//     caza la foto re-tomada del mismo ticket).
// 🔒 Los números los manda el servidor (saldoMigrado / estadoPlan): aquí no se
// suma ni se resta un peso. Y es AYUDA: quien captura sigue tecleando el monto.
// [PAGOS-PORTAL-2] «Ver comprobante» (URL firmada por el servidor) y «➕ Capturar
// abono» con el monto TECLEADO por quien lo vio. [PORTAL-PAGO-2] Dos caras más:
// el pago en MERCADO PAGO ya acreditado (chip verde con bruto/comisión/neto — el
// pago ES el comprobante) y el DESGLOSE que el cliente declaró.
const _REQ_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function _reqDiaCorto(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Number(m[3]) + ' ' + _REQ_MES[Number(m[2]) - 1] : '';
}
function _reqPagoCuentaHtml(c) {
  const ct = c.cuenta || null;
  if (!ct) return `<div class="rq-aviso ojo">${_reqBdjEsc(c.cuenta_error || 'No se pudo leer su cuenta: revisa su saldo en Capsule antes de capturar.')}</div>`;
  if (ct.total == null) return '<div class="rq-aviso ojo">Este viaje <b>no trae total de contrato</b>: el abono se puede capturar, pero ponle su total con ✏️ en Capsule para que su cuenta y su rol salgan bien.</div>';
  const caja = (cls, lbl, val) => `<div${cls ? ' class="' + cls + '"' : ''}><small>${lbl}</small><b>${_reqBdjMxn(Math.round(val))}</b></div>`;
  let h = `<div class="rq-cta">${caja('', 'Total', ct.total)}${caja('', 'Pagado', ct.abonado)}${caja('falta', 'Le falta', Math.max(0, ct.resta))}`
    + (ct.toca ? caja('toca', 'Le toca hoy', ct.toca.monto) : '')
    + (ct.declarado ? caja('', 'Declaró', ct.declarado) : '') + '</div>';
  if (ct.toca) {
    h += `<div class="rq-nota">Por su rol le toca <b>${_reqBdjEsc(ct.toca.etiqueta || 'su siguiente pago')}</b>${ct.toca.hasta ? ' (hasta el ' + _reqBdjEsc(_reqDiaCorto(ct.toca.hasta)) + ')' : ''}${ct.toca.atrasado > 0 ? ' · incluye ' + _reqBdjMxn(ct.toca.atrasado) + ' de un pago atrasado' : ''}.</div>`;
  } else if (ct.sin_rol) {
    h += '<div class="rq-nota">Todavía no tiene su rol de pagos fijo (está en «🗓 Rol por fijar»).</div>';
  } else if (ct.resta <= 0) {
    h += '<div class="rq-aviso ojo">Su viaje ya aparece <b>liquidado</b>: si este pago es real, va a quedar con saldo a favor. Revísalo antes de capturar.</div>';
  }
  if (ct.posible_repetido) {
    h += `<div class="rq-aviso mal">⚠️ <b>Ojo, puede ser repetido:</b> ya tiene un abono de ${_reqBdjMxn(ct.posible_repetido.monto)} capturado el ${_reqBdjEsc(_reqDiaCorto(ct.posible_repetido.fecha))}. Compara este comprobante con el de ese abono (📎 Pagos en Capsule) antes de capturar.</div>`;
  } else if (ct.declarado && ct.resta > 0 && ct.declarado > ct.resta + 1) {
    h += `<div class="rq-aviso ojo">Declaró <b>más de lo que le falta</b>: quedaría con ${_reqBdjMxn(ct.declarado - ct.resta)} a favor. Confírmalo con el comprobante.</div>`;
  }
  const ult = (ct.ultimos || []).map((a) => `<b>${_reqBdjMxn(a.monto)}</b> · ${_reqBdjEsc(_reqDiaCorto(a.fecha) || 'sin fecha')}${a.tiene_foto ? ' 📎' : ''}`).join(' &nbsp;|&nbsp; ');
  h += `<div class="rq-ult">${ult ? 'Sus últimos abonos: ' + ult : 'Todavía no tiene abonos capturados en el sistema.'}</div>`;
  return h;
}
function _reqPagoCard(c) {
  const v = c.viajero || {};
  const wa = String(v.celular || '').replace(/\D/g, '');
  const mpNeto = c.mp_pago_id ? Math.round((Number(c.mp_monto) || 0) - Math.max(0, (Number(c.mp_monto_cobrar) || 0) - (Number(c.mp_neto) || 0))) : null;
  const chipMp = c.mp_pago_id
    ? `<div class="rq-aviso ok"><b>💳 Pagado en Mercado Pago</b> · cobró $${(Number(c.mp_monto) || 0).toLocaleString('es-MX')} (incluye $${Math.max(0, (Number(c.mp_monto) || 0) - mpNeto).toLocaleString('es-MX')} de comisión → abono <b>$${mpNeto.toLocaleString('es-MX')}</b>) · #${_reqBdjEsc(c.mp_pago_id)}</div>`
    : '';
  const desg = Array.isArray(c.desglose) && c.desglose.length > 1
    ? `<div class="rq-nota">👥 El cliente reparte: ${c.desglose.map((d) => _reqBdjEsc(d.nombre || String(d.viajero_id || '').slice(0, 8)) + ' <b>$' + (Number(d.monto) || 0).toLocaleString('es-MX') + '</b>').join(' · ')}</div>`
    : (v.grupo && v.grupo.length > 1
      ? `<div class="rq-aviso ojo">👥 Viaja con ${v.grupo.filter((m) => m.id !== c.viajero_id).map((m) => _reqBdjEsc(m.nombre)).join(', ')} — revisa si el comprobante cubre a alguien más (al capturar puedes repartir).</div>`
      : '');
  const comp = c.foto_path
    ? `<button type="button" class="rq-comp" id="rq-comp-${c.id}" onclick="_reqPagoZoom('${c.id}')" title="Clic: verlo grande aquí mismo">Cargando comprobante…</button>`
    : `<div class="rq-comp" style="cursor:default">${c.mp_pago_id ? '💳 Pago en línea: no hay foto, el pago de Mercado Pago es el comprobante' : 'Sin comprobante'}</div>`;
  return `<div class="rq-cambio" id="rq-cambio-${c.id}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
          <div class="rq-name">${_reqBdjEsc(c.nombre || v.nombre || '—')}</div>
          <span class="rq-tag">${_reqBdjEsc(_REQ_TIPO.pago)}</span>
        </div>
        <div class="rq-ev">${_reqEvTxt(c)} · ${_reqBdjEsc([v.tipo_paquete, v.zona_boleto].filter(Boolean).join(' · ') || '—')} · ${_reqBdjEsc(c.correo)}${wa ? ' · WA ' + _reqBdjEsc(wa) : ''}</div>
        ${chipMp}
        <div class="rq-pago">
          ${comp}
          <div>
            ${_reqPagoCuentaHtml(c)}
            <q>${_reqBdjEsc(c.detalle)}</q>
            ${desg}
          </div>
        </div>
        <div class="rq-linea">
          <button class="rq-btn pri" onclick="_reqPagoAbrir('${c.id}')">➕ Capturar abono</button>
          ${c.foto_path ? `<button class="rq-btn" onclick="_reqPagoVer('${c.id}')">📎 Abrir aparte</button>` : ''}
          ${wa.length === 10 ? `<a class="rq-btn wa" target="_blank" rel="noopener" href="https://wa.me/52${wa}">💬 WhatsApp</a>` : ''}
          <span class="rq-sp"></span>
          <button class="rq-btn dan" onclick="_reqCambioCerrar('${c.id}','rechazada')">No procede</button>
        </div>
        <div id="rq-cambio-form-${c.id}"></div></div>`;
}
// Las miniaturas: una URL firmada por comprobante (el servidor firma el path DE
// LA FILA, 1 h). Una que falle no tumba a las demás: su cuadro lo DICE y el
// botón «📎 Abrir aparte» sigue ahí. Un PDF no se pinta: se abre aparte.
const _reqPagoUrl = {};
async function _reqPagoFotos(pagos) {
  for (const c of (pagos || [])) {
    if (!c.foto_path) continue;
    const el = () => document.getElementById('rq-comp-' + c.id);
    if (/\.pdf$/i.test(String(c.foto_path))) { const e = el(); if (e) e.textContent = '📄 Es un PDF — clic para abrirlo'; _reqPagoUrl[c.id] = 'pdf'; continue; }
    let j = null;
    try { j = await _reqBdjCall({ accion: 'cambio_foto', id: c.id }); } catch (_) { j = null; }
    const e = el();
    if (!e) continue;
    if (j && j.ok && j.signed_url) {
      _reqPagoUrl[c.id] = j.signed_url;
      e.innerHTML = `<img alt="Comprobante de ${_reqBdjEsc(c.nombre || 'cliente')}" src="${_reqBdjEsc(j.signed_url)}" onerror="this.parentNode.textContent='No se pudo pintar: usa «📎 Abrir aparte»'">`;
    } else e.textContent = 'No se pudo cargar: usa «📎 Abrir aparte»';
  }
}
// Clic en la miniatura: grande ahí mismo (otro clic la regresa). PDF o sin URL: aparte.
function _reqPagoZoom(id) {
  const e = document.getElementById('rq-comp-' + id);
  const u = _reqPagoUrl[id];
  if (!e || !u || u === 'pdf') { _reqPagoVer(id); return; }
  e.classList.toggle('grande');
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
      <input type="number" min="1" step="1" id="rq-paq-tot-${id}" value="${c.precio_lista != null ? Math.max(0, Number(c.precio_lista) - KH_PREVENTA_DESCUENTO) : ''}"></label>
    <div style="font-size:11px;opacity:.75;margin-top:4px">Nace con el precio de lista${c.precio_lista != null ? ' ($' + Number(c.precio_lista).toLocaleString('es-MX') + ')' : ''} MENOS los $${KH_PREVENTA_DESCUENTO} del beneficio de preventa (por lugar: si son varios lugares, multiplícalo).${c.hotel_pedido ? ' Habitación pedida: <b>' + _reqBdjEsc(c.hotel_pedido) + '</b> — asígnala en Rooming.' : ''} Al aplicar nace su contrato.</div>
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
    const j = await khViajeros._call({ accion: 'viajero_elegir_paquete', id: c.viajero_id, tipo_paquete: c.paquete_pedido, zona_boleto: c.zona_pedida || '', total_contrato: total, contrato_sin_correo: true, evento_destino: /#\d+$/.test(String(c.evento_id || '')) ? c.evento_id : null });   // [PN-MULTI-1] la fecha que eligió
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
  // [PORTAL-PAGO-2] Con pago en MP el monto es un HECHO (el neto) y se pinta
  // fijo; con desglose del cliente, una caja por persona PRELLENADA y editable
  // (el humano confirma o corrige: nada se captura solo).
  const dec = (String(c.detalle || '').match(/declara \$([\d,]+)/) || [])[1];
  const mpNeto = c.mp_pago_id ? Math.round((Number(c.mp_monto) || 0) - Math.max(0, (Number(c.mp_monto_cobrar) || 0) - (Number(c.mp_neto) || 0))) : null;
  let desg = Array.isArray(c.desglose) && c.desglose.length > 1 ? c.desglose : null;
  // [PAGO-GRUPO-1] El cliente no repartió, pero viaja en grupo: una caja por
  // persona igual — la suya prellenada con lo que declaró, las de sus
  // compañeros vacías. Quien mira el comprobante decide (caso Yesenia: subió
  // $1,300 de ella y Giovanna y solo declaró $650). Cajas vacías no capturan.
  const grupoVj = c.viajero && Array.isArray(c.viajero.grupo) ? c.viajero.grupo : [];
  if (!desg && grupoVj.length > 1) {
    const yo = grupoVj.find((m) => m.id === c.viajero_id);
    const resto = grupoVj.filter((m) => m.id !== c.viajero_id);
    desg = [{ viajero_id: c.viajero_id, nombre: (yo && yo.nombre) || c.nombre, monto: dec ? Number(dec.replace(/,/g, '')) : '' }]
      .concat(resto.map((m) => ({ viajero_id: m.id, nombre: m.nombre, monto: '' })));
  }
  const ayuda = mpNeto != null
    ? `Mercado Pago ya cobró: el abono es el NETO ($${mpNeto.toLocaleString('es-MX')}) y no se mueve${desg ? ' — repártelo entre las personas; la suma tiene que dar ese neto' : ''}. Al capturar: nace el abono con el pago de MP ligado, la solicitud se cierra y al cliente le llega «Recibimos tu pago» si su evento manda correo.`
    : 'Abre el 📎 comprobante y teclea lo que el banco dice. Al capturar: nace el abono (con el comprobante ligado), la solicitud se cierra y al cliente le llega «Recibimos tu pago» si su evento manda correo.';
  const campos = desg
    ? `<div style="font-size:12px;margin-bottom:4px">👥 Reparto — una caja por persona (${Array.isArray(c.desglose) && c.desglose.length > 1 ? 'lo que el cliente declaró, corrígelo si el comprobante dice otra cosa' : 'viaja en grupo: si el comprobante cubre a alguien más, pon su parte; deja vacío a quien no'}):</div>` +
      desg.map((d, i) => `<label class="rq-field" style="display:flex;gap:8px;align-items:center;margin:4px 0"><span style="flex:1">${_reqBdjEsc(d.nombre || String(d.viajero_id || '').slice(0, 8))}</span>
        <input type="number" min="1" step="1" class="rq-pago-rep-${id}" data-vid="${_reqBdjEsc(d.viajero_id)}" value="${Number(d.monto) || ''}" style="width:120px"></label>`).join('') +
      `<div style="font-size:12px;margin-top:4px">Suma: <b id="rq-pago-suma-${id}">—</b>${mpNeto != null ? ' · tiene que dar $' + mpNeto.toLocaleString('es-MX') : ''}</div>`
    : `<label class="rq-field">Monto del abono — el que DICE el comprobante, no el que declaró *
      <input type="number" min="1" step="1" id="rq-pago-monto-${id}" value="${mpNeto != null ? mpNeto : (dec ? dec.replace(/,/g, '') : '')}" ${mpNeto != null ? 'readonly' : ''}></label>`;
  box.innerHTML = `<div class="rq-panel" style="margin:10px 0 0">
    ${campos}
    <div style="font-size:11px;opacity:.75;margin-top:4px">${ayuda}</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="rq-btn pri" id="rq-pago-go-${id}" onclick="_reqPagoCapturar('${id}')">Capturar y cerrar</button>
      <button class="rq-btn quiet" onclick="_reqPagoAbrir('${id}')">Cancelar</button>
    </div><div class="rq-msg" id="rq-cambio-msg-${id}"></div></div>`;
  if (desg) {
    const suma = () => { const s = _reqPagoReparto(id).reduce((a, r) => a + r.monto, 0); const el = document.getElementById('rq-pago-suma-' + id); if (el) el.textContent = '$' + s.toLocaleString('es-MX'); };
    box.querySelectorAll('.rq-pago-rep-' + id).forEach((i) => i.addEventListener('input', suma)); suma();
  }
  const inp = document.getElementById('rq-pago-monto-' + id) || box.querySelector('.rq-pago-rep-' + id); if (inp) inp.focus();
}
// [PORTAL-PAGO-2] Lee las cajas del reparto (solo las que traen monto > 0).
function _reqPagoReparto(id) {
  return Array.from(document.querySelectorAll('.rq-pago-rep-' + id))
    .map((i) => ({ viajero_id: i.dataset.vid, monto: Number(i.value) }))
    .filter((r) => r.viajero_id && r.monto > 0);
}
async function _reqPagoCapturar(id) {
  const msg = document.getElementById('rq-cambio-msg-' + id);
  const say = (t, ok) => { if (msg) { msg.textContent = t; msg.style.color = ok ? 'var(--green, #88ea4e)' : 'var(--red)'; } };
  const reparto = _reqPagoReparto(id);
  const monto = reparto.length ? reparto.reduce((a, r) => a + r.monto, 0) : Number((document.getElementById('rq-pago-monto-' + id) || {}).value);
  if (!(monto > 0)) return say(reparto.length || document.querySelector('.rq-pago-rep-' + id) ? 'Teclea cuánto va a cada persona.' : 'Teclea el monto que dice el comprobante.');
  const btn = document.getElementById('rq-pago-go-' + id); if (btn) btn.disabled = true;
  say('Capturando…', true);
  const cuerpo = reparto.length ? { accion: 'cambio_pago_capturar', id, reparto } : { accion: 'cambio_pago_capturar', id, monto };
  const j = await _reqBdjCall(cuerpo).catch((e) => ({ error: e.message }));
  if (j && j.ok) {
    // [PAGO-CLARO-1] Y se dice cómo quedó su cuenta (con UNA persona: la resta
    // que mandó el servidor menos lo que se acaba de capturar; con reparto no
    // se adivina la de cada quien).
    const fila = _reqCambiosRows.find((x) => x.id === id) || {};
    const cx = fila.cuenta || null;
    const soloTitular = !reparto.length || (reparto.length === 1 && reparto[0].viajero_id === fila.viajero_id);
    const queda = (cx && cx.resta != null && soloTitular) ? ' · le quedan por pagar $' + Math.max(0, Math.round(cx.resta - monto)).toLocaleString('es-MX') : '';
    showToast(_reqBdjEsc('Abono capturado: $' + Math.round(monto).toLocaleString('es-MX') + (reparto.length > 1 ? ' entre ' + reparto.length : '') + queda + ' · ' + (_reqCorreoTxt(j.correo) || 'sin correo (evento fuera de la lista)')), 'success');
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
    <label class="rq-field">${no ? ('¿Por qué no procede? (le llega TAL CUAL por correo' + (esPaq ? ' y en su Portal' : '') + ') *') : 'Nota opcional: qué se cambió'}
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

// ═════════════════════════════════════════════════════════════════════════════
// [CAMBIO-APLICA-1 · 13-nov-2026] «✏️ HACER EL CAMBIO» — aquí mismo
// ═════════════════════════════════════════════════════════════════════════════
// Palabra de Memo: «lo único que cambiaría es en cambios pedidos poder hacer el
// cambio desde requisiciones y aprobar y que quede guardado».
// Lo que había: «✓ Ya lo atendí» solo CERRABA la solicitud; el cambio había que
// hacerlo en Capsule (buscar el evento, buscar a la persona, ✏️ Corregir o 📅
// Mover fecha) y regresar a cerrarla tecleando qué se hizo. Medido (13-nov): 13
// atendidas así, y una se cerró diciendo «pasó a PLUS» con la fila aún en CHEAP.
//
// Hoy la tarjeta abre un panel con lo que la persona TIENE (fecha, paquete,
// zona, habitación, total) ya puesto; se cambia lo que pidió y UN botón:
//   1. guarda el cambio en su viaje por los DUEÑOS de siempre —
//      `viajero_editar_full` (paquete · zona · habitación · total) y, si cambia
//      de día, `viajero_mudar_fecha` — con su puerta de zonas, su valor
//      esperado, su nota y su correo;
//   2. cierra la solicitud como atendida, y lo que queda escrito en ella son
//      las FRASES DEL DUEÑO («zona «A» → «B»; total $x → $y»), no un texto
//      tecleado: lo guardado y lo que se dice que se guardó son lo mismo.
// 🔒 Esta pantalla NO calcula un peso: listas, precios, cupo y la diferencia
// vienen del servidor (`cambio_opciones`). El total SUGERIDO cae en la caja
// solo cuando es confiable y nadie la ha tecleado — lo tecleado MANDA.
// 🔒 Si el viaje se guardó y la solicitud no se pudo cerrar, se DICE con lo que
// sí quedó; el segundo intento no vuelve a escribir (el dueño contesta «no
// cambiaste nada») y solo la cierra.
const _reqCam = {};
const _REQ_CAM_NOTA = 'Aplicamos el cambio que pediste desde tu Portal.';
function _reqCamTxt(x) {
  if (!x) return '—';
  return [x.fecha, _REQ_PAQ_TXT[x.paquete] || (x.paquete ? String(x.paquete).toUpperCase() : null), x.zona,
    x.hotel_tipo ? 'hab. ' + x.hotel_tipo : null, Number(x.lugares) > 1 ? x.lugares + ' lugares' : null].filter(Boolean).join(' · ') || '—';
}
async function _reqCambioAplicarAbrir(id) {
  const box = document.getElementById('rq-cambio-form-' + id);
  const c = _reqCambiosRows.find((x) => x.id === id);
  if (!box || !c) return;
  if (box.dataset.abierto === 'aplicar') { box.innerHTML = ''; box.dataset.abierto = ''; delete _reqCam[id]; return; }
  box.dataset.abierto = 'aplicar';
  _reqCam[id] = { tok: 0, op: null, sel: null, tocado: false, revalidar: false, cargando: false, err: '' };
  // El esqueleto se pinta UNA vez: las cajas que se teclean (total, mensaje) no
  // se vuelven a crear cuando llegan las listas — un repintado a media tecla
  // se come lo escrito (la lección de RECHAZO-EDITA-1).
  box.innerHTML = `<div class="rq-panel" style="margin:10px 0 0">
    <div class="rq-sub">✏️ Hacer el cambio · se guarda en su viaje y la solicitud queda aprobada</div>
    <div class="rq-nota" id="rq-cam-hoy-${id}">Leyendo cómo está hoy su viaje…</div>
    <div class="rq-grid" id="rq-cam-sel-${id}"></div>
    <div class="rq-grid">
      <label class="rq-field">Total de su viaje (lo confirmas tú)
        <input type="number" min="0" step="1" id="rq-cam-tot-${id}" oninput="_reqCambioAplicarTotal('${id}')" placeholder="sin capturar"></label>
      <label class="rq-field" style="grid-column:1/-1">Qué le decimos (sale en su correo)
        <input type="text" id="rq-cam-nota-${id}" maxlength="300" value="${_reqBdjEsc(_REQ_CAM_NOTA)}"></label>
    </div>
    <div class="rq-nota" id="rq-cam-sug-${id}"></div>
    <div id="rq-cam-avi-${id}"></div>
    <div class="rq-nota" id="rq-cam-avw-${id}"><label style="cursor:pointer"><input type="checkbox" id="rq-cam-av-${id}" checked> 📨 Avisarle por correo lo que cambió (con su total y lo que le falta)</label></div>
    <div class="rq-aviso" id="rq-cam-res-${id}">Aún no cambias nada.</div>
    <div class="rq-linea" style="margin-top:10px">
      <button class="rq-btn pri" id="rq-cam-go-${id}" onclick="_reqCambioAplicarGo('${id}')">✓ Guardar el cambio y aprobar</button>
      <button class="rq-btn quiet" onclick="_reqCambioAplicarAbrir('${id}')">Cancelar</button>
    </div>
    <div class="rq-msg" id="rq-cambio-msg-${id}"></div></div>`;
  await _reqCambioAplicarCargar(id);
}
// Pide al servidor lo que hay (y, con una elección completa, la diferencia).
async function _reqCambioAplicarCargar(id) {
  const st = _reqCam[id]; if (!st) return;
  const tok = ++st.tok;
  const q = { accion: 'cambio_opciones', id };
  if (st.sel && st.sel.evento_id) q.evento_id = st.sel.evento_id;
  // Tras cambiar de FECHA se piden primero las listas de esa fecha (la zona de
  // antes puede no existir ese día): la elección se manda ya revalidada.
  if (st.sel && st.sel.paquete && !st.revalidar) { q.paquete = st.sel.paquete; q.zona = st.sel.zona; q.hotel = st.sel.hotel; }
  st.cargando = true;
  const j = await _reqBdjCall(q).catch((e) => ({ error: e.message }));
  if (!_reqCam[id] || _reqCam[id].tok !== tok) return;   // llegó tarde: ya se eligió otra cosa
  st.cargando = false;
  if (!j || !j.ok) { st.err = (j && j.error) || 'No se pudo leer lo disponible'; _reqCambioAplicarPintar(id); return; }
  st.err = ''; st.op = j;
  const tot = document.getElementById('rq-cam-tot-' + id);
  if (!st.sel) {
    // Primera carga: el panel nace con lo que la persona TIENE hoy.
    const h = j.hoy || {};
    st.sel = { evento_id: j.fecha || '', paquete: h.paquete || '', zona: h.zona || '', hotel: h.hotel_tipo || '' };
    if (tot) tot.value = h.total != null ? h.total : '';
  } else if (st.revalidar) {
    // Llegaron las listas de la fecha nueva: lo elegido se revalida contra ellas.
    st.revalidar = false;
    const pq = (j.paquetes || []).find((p) => p.paquete === st.sel.paquete) || null;
    if (!pq) { st.sel.paquete = ''; st.sel.zona = ''; st.sel.hotel = ''; }
    else {
      if (!pq.zonas || !pq.zonas.some((z) => z.zona === st.sel.zona)) st.sel.zona = '';
      if (!pq.duerme) st.sel.hotel = '';
    }
    _reqCambioAplicarPintar(id);
    if (st.sel.paquete) return _reqCambioAplicarCargar(id);   // ahora sí: la diferencia
    return;
  }
  // El sugerido cae a la caja SOLO si es confiable y nadie la ha tecleado.
  const e = j.eleccion;
  if (e && e.confiable && e.total_sugerido != null && !st.tocado && tot) tot.value = e.total_sugerido;
  _reqCambioAplicarPintar(id);
}
function _reqCambioAplicarPintar(id) {
  const st = _reqCam[id]; if (!st) return;
  const el = (k) => document.getElementById('rq-cam-' + k + '-' + id);
  const hoyBox = el('hoy'), selBox = el('sel'), aviBox = el('avi'), avw = el('avw');
  if (!hoyBox || !selBox) return;
  const e = _reqBdjEsc;
  if (!st.op) {
    // Ni siquiera se pudo leer su viaje (o no se puede cambiar por aquí): el
    // panel se vuelve el porqué — un botón de «Guardar» sin nada detrás confunde.
    const box = document.getElementById('rq-cambio-form-' + id);
    // (solo si ESTE panel sigue abierto: una respuesta tardía no pisa el «No procede» que se abrió después)
    if (box && box.dataset.abierto === 'aplicar') box.innerHTML = `<div class="rq-panel" style="margin:10px 0 0"><div class="rq-aviso mal">⚠️ ${e(st.err || 'No se pudo leer su viaje')}</div>
      <div class="rq-linea"><button class="rq-btn quiet" onclick="_reqCambioAplicarAbrir('${id}')">Cerrar</button></div></div>`;
    return;
  }
  const op = st.op, h = op.hoy || {}, s = st.sel || {};
  hoyBox.innerHTML = `Hoy tiene: <b>${e(_reqCamTxt(h))}</b> · total <b>${h.total != null ? _reqBdjMxn(h.total) : 'sin capturar'}</b>`
    + (h.abonado != null ? ` · pagado <b>${_reqBdjMxn(h.abonado)}</b>` : '')
    + (h.resta != null ? ` · le falta <b>${_reqBdjMxn(Math.max(0, h.resta))}</b>` : '');
  const fSel = (op.fechas || []).find((f) => f.evento_id === s.evento_id) || null;
  const pq = (op.paquetes || []).find((p) => p.paquete === s.paquete) || null;
  const campo = (rot, k, opts) => `<label class="rq-field">${rot}<select class="rq-in" onchange="_reqCambioAplicarSel('${id}','${k}',this.value)">${opts}</select></label>`;
  const fijo = (rot, txt) => `<div class="rq-field">${rot}<div class="rq-in" style="opacity:.7">${txt}</div></div>`;
  const elige = '<option value="">— elige —</option>';
  // FECHA (solo si el evento tiene más de una)
  const selF = (op.fechas || []).length > 1 ? campo('Fecha', 'evento_id', (s.evento_id ? '' : elige)
    + op.fechas.map((f) => `<option value="${e(f.evento_id)}"${f.evento_id === s.evento_id ? ' selected' : ''}${f.pasada && !f.actual ? ' disabled' : ''}>${e(f.etiqueta)}${f.actual ? ' (la suya)' : ''}${f.pasada ? ' · ya pasó' : ''}${f.prox ? ' · próximamente' : ''}</option>`).join('')) : '';
  // PAQUETE
  const selP = campo('Paquete', 'paquete', (s.paquete ? '' : elige)
    + (op.paquetes || []).map((p) => `<option value="${e(p.paquete)}"${p.paquete === s.paquete ? ' selected' : ''}>${e(p.nombre)}${p.paquete === h.paquete ? ' (el suyo)' : ''}</option>`).join(''));
  // ZONA: las de la ficha para esa fecha y paquete, con precio y cupo del Palacio.
  let selZ = '';
  if (pq && pq.zonas) {
    const esSuFecha = !!(fSel && fSel.actual);
    const zs = pq.zonas.slice();
    // Su zona de hoy no se pierde aunque la ficha ya no la traiga (zona vieja).
    if (esSuFecha && h.zona && s.paquete === h.paquete && !zs.some((z) => z.zona === h.zona)) zs.unshift({ zona: h.zona, precio: null, quedan: null, fuera: true });
    selZ = campo('Zona', 'zona', (s.zona ? '' : elige) + zs.map((z) => {
      const cupo = z.quedan == null ? '' : (z.quedan <= 0 ? ' · sin lugares' : ' · quedan ' + z.quedan);
      const suya = esSuFecha && z.zona === h.zona;
      return `<option value="${e(z.zona)}"${z.zona === s.zona ? ' selected' : ''}>${e(z.zona)}${z.precio != null ? ' · ' + _reqBdjMxn(z.precio) : ''}${cupo}${z.ag ? ' · agotada en la ficha' : ''}${z.prox ? ' · próximamente' : ''}${z.fuera ? ' · ya no está en la ficha' : ''}${suya ? ' (la suya)' : ''}</option>`;
    }).join(''));
  } else if (pq) selZ = fijo('Zona', 'Sin boleto (RIDE)');
  // HABITACIÓN: solo si el paquete duerme.
  let selH = '';
  if (pq && pq.duerme && (op.habitaciones || []).length) {
    selH = campo('Habitación', 'hotel', `<option value=""${s.hotel ? '' : ' selected'}>— sin dato —</option>`
      + op.habitaciones.map((x) => `<option value="${e(x.tipo)}"${x.tipo === s.hotel ? ' selected' : ''}>${e(x.tipo)}${x.tipo === h.hotel_tipo ? ' (la suya)' : ''}</option>`).join(''));
  } else if (pq && !pq.duerme) selH = fijo('Habitación', 'Sin habitación (' + e(_REQ_PAQ_TXT[pq.paquete] || pq.paquete) + ')');
  selBox.innerHTML = selF + selP + selZ + selH;
  if (aviBox) aviBox.innerHTML = (st.err ? [st.err] : []).concat(op.avisos || []).map((a) => `<div class="rq-aviso ojo">⚠️ ${e(a)}</div>`).join('');
  // El aviso por correo solo existe si el viaje está publicado y tiene correo.
  if (avw && !avw.dataset.listo) {
    avw.dataset.listo = '1';
    if (!h.publicado) avw.innerHTML = '🪪 Su viaje no está publicado en su Portal: no se le puede avisar por correo — avísale por WhatsApp.';
    else if (!h.con_correo) avw.innerHTML = 'Esta persona no tiene correo: avísale por WhatsApp.';
  }
  _reqCambioAplicarSug(id);
  _reqCambioAplicarResumen(id);
}
// La línea del total sugerido (de dónde sale el número; el número lo da el servidor).
function _reqCambioAplicarSug(id) {
  const st = _reqCam[id]; const box = document.getElementById('rq-cam-sug-' + id);
  if (!st || !box || !st.op) return;
  const x = st.op.eleccion, m = _reqBdjMxn;
  if (!x) { box.innerHTML = st.op.guia ? _reqBdjEsc(st.op.guia) : (st.cargando ? 'Calculando…' : ''); return; }
  const tot = document.getElementById('rq-cam-tot-' + id);
  const enCaja = tot && String(tot.value) !== '' && Number(tot.value) === Number(x.total_sugerido);
  const usar = x.total_sugerido != null && !enCaja ? ` <a href="#" onclick="_reqCambioAplicarUsar('${id}');return false" style="color:var(--yellow)">usar ${m(x.total_sugerido)}</a>` : '';
  if (x.modo === 'diferencia') {
    const d = Number(x.diferencia) || 0;
    box.innerHTML = d === 0
      ? `De lista cuesta lo mismo (${m(x.lista_nueva)}): su total se queda en <b>${m(x.total_sugerido)}</b>.${usar}`
      : `De lista: lo que tiene ${m(x.lista_actual)} → lo nuevo ${m(x.lista_nueva)}, diferencia <b>${d > 0 ? '+' : '−'}${m(Math.abs(d))}</b>. Su total de hoy ${m(x.total_hoy)} ${d > 0 ? '+' : '−'} la diferencia = <b>${m(x.total_sugerido)}</b>${enCaja ? ' (ya está en «Total»; ajústalo si acordaron otra cosa).' : '.'}${usar}`;
  } else if (x.modo === 'lista') box.innerHTML = `No tenía total capturado. De lista, lo nuevo cuesta <b>${m(x.total_sugerido)}</b>${enCaja ? ' (ya está en «Total»).' : '.'}${usar}`;
  else if (x.modo === 'lista_sin_base') box.innerHTML = `De lista, lo nuevo cuesta ${m(x.total_sugerido)} — no se puso solo porque no pude cotizar lo que tiene hoy.${usar}`;
  else box.innerHTML = '';
}
// Lo que cambia: lo elegido contra lo que tiene. Lo usan el resumen y el guardar.
function _reqCamDif(id) {
  const st = _reqCam[id]; if (!st || !st.op || !st.sel) return null;
  const h = st.op.hoy || {}, s = st.sel;
  const inp = document.getElementById('rq-cam-tot-' + id);
  const txt = String(inp && inp.value != null ? inp.value : '').trim();
  const total = txt === '' ? null : Number(txt);   // vacío = «no lo toco», no «$0»
  const d = {
    fecha: !!s.evento_id && s.evento_id !== h.evento_id,
    paquete: !!s.paquete && s.paquete !== (h.paquete || ''),
    zona: (s.zona || '') !== (h.zona || ''),
    hotel: (s.hotel || '') !== (h.hotel_tipo || ''),
    totalNuevo: total,
    total: total != null && Number.isFinite(total) && total !== (h.total == null ? null : Number(h.total)),
  };
  d.nada = !d.fecha && !d.paquete && !d.zona && !d.hotel && !d.total;
  return d;
}
function _reqCambioAplicarResumen(id) {
  const st = _reqCam[id]; const box = document.getElementById('rq-cam-res-' + id);
  if (!st || !box || !st.op || !st.sel) return;
  const d = _reqCamDif(id), h = st.op.hoy || {}, s = st.sel, e = _reqBdjEsc, m = _reqBdjMxn;
  if (!d || d.nada) { box.className = 'rq-aviso'; box.innerHTML = 'Aún no cambias nada: elige lo que el cliente pidió.'; return; }
  const fe = (id2) => ((st.op.fechas || []).find((f) => f.evento_id === id2) || {}).etiqueta || id2 || '—';
  const partes = [];
  if (d.fecha) partes.push(`fecha ${e(h.fecha || '—')} → <b>${e(fe(s.evento_id))}</b>`);
  if (d.paquete) partes.push(`paquete ${e(_REQ_PAQ_TXT[h.paquete] || '—')} → <b>${e(_REQ_PAQ_TXT[s.paquete] || s.paquete)}</b>`);
  if (d.zona) partes.push(`zona ${e(h.zona || '—')} → <b>${e(s.zona || 'sin boleto')}</b>`);
  if (d.hotel) partes.push(`habitación ${e(h.hotel_tipo || '—')} → <b>${e(s.hotel || '—')}</b>`);
  if (d.total) partes.push(`total ${h.total != null ? m(h.total) : '—'} → <b>${m(d.totalNuevo)}</b>`);
  const totFin = d.totalNuevo != null && Number.isFinite(d.totalNuevo) ? d.totalNuevo : h.total;
  let cuenta = '';
  if (totFin != null && h.abonado != null) {
    const r = Math.round(Number(totFin) - Number(h.abonado));
    cuenta = ` · lleva pagado ${m(h.abonado)}: ${r >= 0 ? 'le faltarán <b>' + m(r) + '</b>' : 'queda con <b>' + m(-r) + ' a favor</b>'}`;
  }
  // Lo que este cambio arrastra, dicho ANTES de guardar.
  const ojo = [];
  if (d.fecha && (h.con_cuarto || h.con_grupo)) ojo.push('al moverlo de fecha se le suelta ' + [h.con_cuarto ? 'su cuarto del rooming' : null, h.con_grupo ? 'su grupo «viaja con»' : null].filter(Boolean).join(' y ') + ' (eran de la fecha anterior)');
  if (d.hotel && h.con_grupo && !d.fecha) ojo.push('viaja en grupo: si su acompañante tiene fila propia, cámbiale también la habitación (en Capsule)');
  box.className = 'rq-aviso ok';
  box.innerHTML = `Va a cambiar: ${partes.join(' · ')}${d.total ? '' : ' · su total se queda igual'}${cuenta}${h.con_rol && d.total ? ' · su rol de pagos se re-reparte solo' : ''}`
    + ojo.map((x) => `<br>⚠️ ${e(x)}`).join('');
}
function _reqCambioAplicarSel(id, campo, valor) {
  const st = _reqCam[id]; if (!st || !st.sel || !st.op) return;
  st.sel[campo] = valor;
  if (campo === 'evento_id') st.revalidar = true;
  if (campo === 'paquete') {
    const pq = (st.op.paquetes || []).find((p) => p.paquete === valor) || null;
    if (!pq || !pq.zonas || !pq.zonas.some((z) => z.zona === st.sel.zona)) st.sel.zona = '';   // RIDE va sin boleto; otra lista de zonas → se elige
    if (!pq || !pq.duerme) st.sel.hotel = '';                                                  // CHEAP no lleva habitación
  }
  st.op.eleccion = null; st.op.guia = null; st.err = '';
  _reqCambioAplicarPintar(id);   // se pinta YA con lo elegido; la diferencia llega del servidor
  _reqCambioAplicarCargar(id);
}
function _reqCambioAplicarTotal(id) {
  const st = _reqCam[id]; if (!st) return;
  st.tocado = true;               // lo tecleado MANDA: el sugerido ya no pisa la caja
  _reqCambioAplicarSug(id); _reqCambioAplicarResumen(id);
}
function _reqCambioAplicarUsar(id) {
  const st = _reqCam[id]; const tot = document.getElementById('rq-cam-tot-' + id);
  const x = st && st.op && st.op.eleccion;
  if (!st || !tot || !x || x.total_sugerido == null) return;
  tot.value = x.total_sugerido; st.tocado = false;
  _reqCambioAplicarSug(id); _reqCambioAplicarResumen(id);
}
async function _reqCambioAplicarGo(id) {
  const st = _reqCam[id]; const c = _reqCambiosRows.find((x) => x.id === id);
  if (!st || !c) return;
  const msg = document.getElementById('rq-cambio-msg-' + id);
  const say = (t, ok) => { if (msg) { msg.textContent = t; msg.style.color = ok ? 'var(--green, #88ea4e)' : 'var(--red)'; } };
  if (!st.op || !st.sel) return say('Todavía no carga su viaje: espera un segundo.');
  // Con una lectura en vuelo las listas en pantalla pueden ser las de la fecha
  // anterior: no se guarda hasta que lleguen las de la que se eligió.
  if (st.cargando || st.revalidar) return say('Espera un segundo: estoy leyendo lo que hay en esa fecha.');
  const d = _reqCamDif(id), h = st.op.hoy || {}, s = st.sel;
  if (!d || d.nada) return say('Aún no cambias nada. Elige lo que el cliente pidió — o usa «Ya lo atendí por fuera» si se resolvió de otra forma.');
  const pq = (st.op.paquetes || []).find((p) => p.paquete === s.paquete) || null;
  if ((st.op.fechas || []).length > 1 && !s.evento_id) return say('Elige la fecha.');
  if (!pq) return say('Elige el paquete.');
  if (pq.zonas && !s.zona) return say('Elige la zona.');
  if (d.totalNuevo != null && !(Number.isFinite(d.totalNuevo) && d.totalNuevo >= 0)) return say('El total no es válido.');
  const nota = String((document.getElementById('rq-cam-nota-' + id) || {}).value || '').trim();
  const avisar = !!h.publicado && !!h.con_correo && !!(document.getElementById('rq-cam-av-' + id) || {}).checked;
  const btn = document.getElementById('rq-cam-go-' + id); if (btn) btn.disabled = true;
  say('Guardando el cambio en su viaje…', true);
  const vid = c.viajero_id, frases = [], avisos = [];
  let correo = null;
  // «no cambiaste nada» / «ya está en esa fecha» = el cambio YA está en su viaje
  // (un intento anterior a medias, o alguien lo hizo en Capsule): no es error,
  // la solicitud se cierra igual.
  const yaHecho = (er) => /no cambiaste nada|ya est[aá] en esa fecha/i.test(String((er && er.message) || ''));
  const anota = (j) => { (j.cambios || []).forEach((x) => frases.push(x)); [j.zona_aviso, j.stock_aviso, j.total_aviso].filter(Boolean).forEach((a) => avisos.push(a)); if ((j.sueltos || []).length) avisos.push('se soltó ' + j.sueltos.join(' y ')); };
  try {
    if (!d.fecha) {
      const campos = {};
      if (d.paquete) campos.tipo_paquete = s.paquete;
      if (d.zona) campos.zona_boleto = s.zona || '';
      if (d.hotel) campos.hotel_tipo = s.hotel || '';
      if (d.total) campos.total_contrato = d.totalNuevo;
      try { const j = await khViajeros.editarFull(vid, campos, { avisar, nota_cliente: nota }); anota(j); correo = j.aviso || null; }
      catch (er) { if (!yaHecho(er)) throw er; }
    } else {
      // Cambia de FECHA. El dueño de la mudanza mueve fecha + zona + total; lo
      // que él no toca (paquete, habitación) va ANTES por su dueño y SIN correo:
      // el aviso al cliente es UNO, el de la mudanza, y nombra lo demás.
      if (d.paquete || d.hotel) {
        const c1 = {};
        if (d.paquete) { c1.tipo_paquete = s.paquete; if (!pq.zonas) c1.zona_boleto = ''; else if (!h.zona) c1.zona_boleto = s.zona; }
        if (d.hotel) c1.hotel_tipo = s.hotel || '';
        try { anota(await khViajeros.editarFull(vid, c1, { avisar: false })); }
        catch (er) { if (!yaHecho(er)) throw er; }
      }
      const previas = frases.slice();
      try {
        const j2 = await khViajeros.mudarFecha({ id: vid, destino: s.evento_id, zona_boleto: s.zona || '',
          total_contrato: d.totalNuevo != null ? d.totalNuevo : undefined, motivo: 'cambio pedido desde su Portal', avisar,
          nota_cliente: [nota, previas.length ? 'También: ' + previas.join('; ') + '.' : ''].filter(Boolean).join(' ').slice(0, 300) });
        anota(j2); correo = j2.aviso || null;
      } catch (er) {
        if (!yaHecho(er)) throw new Error((previas.length ? 'Sí se guardó: ' + previas.join('; ') + '. Pero la FECHA no se movió: ' : '') + ((er && er.message) || 'no se pudo mover la fecha'));
      }
    }
  } catch (er) { say((er && er.message) || 'No se pudo guardar el cambio'); if (btn) btn.disabled = false; return; }
  // Lo que queda escrito en la solicitud: las frases del DUEÑO.
  const hecho = frases.length ? frases.join('; ') : 'ya estaba aplicado en su viaje';
  const j3 = await _reqBdjCall({ accion: 'cambio_cerrar', id, estado: 'atendida', respuesta: ('Cambio aplicado: ' + hecho).slice(0, 500) }).catch((e) => ({ error: e.message }));
  if (j3 && j3.ok) {
    const partes = ['✓ Cambio guardado y aprobado', hecho];
    partes.push(correo ? _reqCorreoTxt(correo) : (avisar ? 'sin correo (no hubo nada nuevo que avisar)' : 'sin correo al cliente'));
    avisos.forEach((a) => partes.push('⚠️ ' + a));
    showToast(_reqBdjEsc(partes.join(' · ')), (avisos.length || (correo && !correo.ok)) ? 'warning' : 'success');
    delete _reqCam[id];
    loadCambiosPortal();
  } else {
    say('El cambio SÍ quedó guardado en su viaje (' + hecho + '), pero la solicitud no se pudo cerrar: ' + ((j3 && j3.error) || 'sin respuesta') + '. Vuelve a apretar el botón o ciérrala con «Ya lo atendí por fuera».');
    if (btn) btn.disabled = false;
  }
}

// ── «Cambios ya atendidos»: lo que se le cambió a quién (se pide al abrirlo) ──
function _reqCambiosHistCaja() {
  return `<details class="rq-nota" style="margin-top:10px" ontoggle="if(this.open)_reqCambiosHist()">
    <summary style="cursor:pointer">Ver los cambios ya atendidos</summary><div id="req-cambios-hist" style="margin-top:8px">Cargando…</div></details>`;
}
async function _reqCambiosHist() {
  const box = document.getElementById('req-cambios-hist'); if (!box) return;
  const j = await _reqBdjCall({ accion: 'cambios_listar', estado: 'todas', solo_cambios: true }).catch((e) => ({ error: e.message }));
  if (!j || !j.ok) { box.innerHTML = `<span style="color:var(--red)">No se pudo leer: ${_reqBdjEsc((j && j.error) || 'sin respuesta')}</span>`; return; }
  const filas = (j.cambios || []).filter((c) => c.estado !== 'pendiente').slice(0, 30);
  if (!filas.length) { box.textContent = 'Todavía no hay cambios atendidos.'; return; }
  box.innerHTML = filas.map((c) => {
    const no = c.estado === 'rechazada';
    return `<div class="rq-ult" style="padding:6px 0;border-top:1px solid var(--border)">
      <b>${_reqBdjEsc(c.nombre || (c.viajero && c.viajero.nombre) || '—')}</b> · ${_reqEvTxt(c)} · ${_reqBdjEsc(_REQ_TIPO[c.tipo] || c.tipo)}
      <br>Pidió: «${_reqBdjEsc(String(c.detalle || '').slice(0, 160))}»
      <br><span style="color:${no ? 'var(--red)' : 'var(--green)'}">${no ? '✗ No procedió' : '✓ Atendido'}</span>${c.respuesta ? ': ' + _reqBdjEsc(c.respuesta) : (no ? '' : ' (sin nota de qué se hizo)')}
      · ${_reqBdjEsc(c.atendida_por || '—')}${c.atendida_at ? ' · ' + _reqBdjEsc(_reqBdjFecha(c.atendida_at)) : ''}</div>`;
  }).join('');
}

// [REQ-FICHA-1 · 4-nov-2026] LA FICHA de la solicitud, a la vista sin abrir
// nada. Palabra de Memo: «tengo que abrir el botón de ver la cotización para
// ver el tipo de boleto, habitación, paquete… dame esa info desde que veo la
// requisición». Los datos ya viajaban en columnas (paquete, zona, hotel,
// transporte); lo que faltaba era DECIRLOS con su rótulo — y la FECHA, que en
// un multifecha (Fuerza Regida: 4 fechas) era lo que más obligaba a abrir la
// cotización. La fecha la deriva el SERVIDOR (fecha_txt, el dueño
// fechaDeEventoId); sin ella se DICE «sin fecha en el catálogo», no se adivina.
function _reqFichaHtml(r, np) {
  const fila = (ico, lbl, val, fuerte) => `<div class="rq-fi"><small>${ico} ${lbl}</small><b${fuerte ? ' class="pk"' : ''}>${val}</b></div>`;
  const vac = '<span style="color:var(--ts);font-weight:400">—</span>';
  const paq = khPaqueteTexto({ tipo_paquete: r.paquete, zona_boleto: r.zona, evento_id: r.evento_id });
  const fecha = r.fecha_txt ? _reqBdjEsc(r.fecha_txt) + (r.venue_txt ? `<i>${_reqBdjEsc(r.venue_txt)}</i>` : '')
    : '<span style="color:var(--ts);font-weight:400">sin fecha en el catálogo · ver cotización</span>';
  const porPersona = (np > 1 && r.total_sistema != null && Number(r.total_sistema) > 0) ? `<i>${_reqBdjMxn(Number(r.total_sistema) / np)} por persona</i>` : '';
  return `<div class="rq-ficha">
      ${fila('📅', 'Fecha', fecha)}
      ${fila('🎟', 'Paquete', paq ? _reqBdjEsc(paq) : vac, true)}
      ${fila('🎫', 'Boleto / zona', r.zona ? _reqBdjEsc(r.zona) : (String(r.paquete || '').toLowerCase() === 'ride' ? 'Sin boleto (RIDE)' : vac))}
      ${fila('🏨', 'Habitación', r.hotel ? _reqBdjEsc(r.hotel) : (String(r.paquete || '').toLowerCase() === 'cheap' ? 'Sin hotel (CHEAP)' : vac))}
      ${fila('👥', 'Personas', np + (np > 1 ? ' personas' : ' persona') + porPersona)}
      ${r.transporte ? fila('🚌', 'Transporte', _reqBdjEsc(r.transporte)) : ''}
    </div>`;
}

// [MP-LINK-1] Un pago APROBADO en Mercado Pago (lo marcó el webhook) cuenta
// como comprobante: el id del pago es el ticket. El NETO es lo que MP cobró
// menos la comisión que el link le cargó al cliente — es lo que entra como
// abono (espejo de la fórmula del servidor en admin-requisiciones · aprobar).
function _reqTieneComprobante(r) { return !!(r && (r.comprobante_path || r.mp_pago_id)); }
function _reqMpNeto(r) {
  if (!r || !r.mp_pago_id) return null;
  const bruto = Math.round(Number(r.mp_monto) || 0);
  const com = (r.mp_monto_cobrar != null && r.separo_sistema != null) ? Math.max(0, Math.round(Number(r.mp_monto_cobrar) - Number(r.separo_sistema))) : 0;
  return { bruto, comision: com, neto: Math.max(0, bruto - com) };
}
function _reqMpChip(r) {
  if (r.mp_pago_id) {
    const m = _reqMpNeto(r);
    return `<div style="margin:6px 0;padding:6px 10px;border:1px solid var(--green);border-radius:8px;font-size:11px;color:var(--green)">💳 <b>Pagado en Mercado Pago</b> · cobró ${_reqBdjMxn(m.bruto)}${m.comision ? ` (incluye ${_reqBdjMxn(m.comision)} de comisión al cliente → abono ${_reqBdjMxn(m.neto)})` : ''} · pago #${_reqBdjEsc(r.mp_pago_id)}${r.mp_pagado_at ? ' · ' + _reqBdjEsc(_tsToDate(r.mp_pagado_at).toLocaleDateString('es-MX', { timeZone: 'America/Matamoros', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) : ''}${r.estado !== 'pendiente' ? ' · ⚠️ la requisición ya estaba ' + _reqBdjEsc(r.estado) + ' cuando cayó el pago' : ''}</div>`;
  }
  if (r.forma_pago === 'link_pago' && r.estado === 'pendiente') {
    return `<div style="margin:6px 0;padding:6px 10px;border:1px dashed var(--ts);border-radius:8px;font-size:11px;color:var(--ts)">🔗 Pidió link de pago${r.mp_init_point ? ` · el link ya salió por ${_reqBdjMxn(r.mp_monto_cobrar)} (separo + comisión) y <b>todavía no paga</b>` : ' · <b>sin link generado</b> (Mercado Pago apagado o sin tarifa cuando reservó)'}. <button class="rq-btn" style="padding:2px 8px;font-size:11px" onclick="_reqBdjMpLink('${r.id}')">🔗 ${r.mp_init_point ? 'Ver / copiar link' : 'Generar link'}</button><span id="req-mpl-${r.id}"></span></div>`;
  }
  return '';
}
async function _reqBdjMpLink(id, regenerar) {
  const out = document.getElementById('req-mpl-' + id);
  if (out) out.textContent = ' …';
  const j = await _reqBdjCall({ accion: 'mp_link', id, regenerar: !!regenerar }).catch((e) => ({ error: e.message }));
  if (!out) return;
  if (!j || !j.ok) { out.innerHTML = ' <span style="color:var(--red)">' + _reqBdjEsc((j && j.error) || 'no se pudo') + '</span>'; return; }
  const r = _reqBdjRows.find((x) => x.id === id);
  if (r) { r.mp_init_point = j.url; r.mp_monto_cobrar = j.monto; }
  const cel = String((r && r.celular) || '').replace(/\D/g, '');
  const txt = 'Hola ' + (String((r && r.nombre) || '').split(' ')[0]) + ', aquí está tu link de pago de Conecta Reynosa (reservación ' + ((r && r.folio) || '') + ') por ' + _reqBdjMxn(j.monto) + ' — incluye la comisión de Mercado Pago. Pagas con tarjeta, OXXO o transferencia: ' + j.url;
  out.innerHTML = ` <a href="${_reqBdjEsc(j.url)}" target="_blank" rel="noopener" style="color:var(--green);font-weight:700">abrir</a> · <a href="#" data-u="${_reqBdjEsc(j.url)}" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.dataset.u);this.textContent='copiado ✓';return false" style="color:var(--green)">copiar</a>${cel.length === 10 ? ` · <a href="https://wa.me/52${cel}?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener" style="color:#25d366;font-weight:700">mandar por WhatsApp</a>` : ''} · <a href="#" onclick="_reqBdjMpLink('${id}',true);return false" style="color:var(--ts)">regenerar</a> <span style="color:var(--ts)">(${_reqBdjMxn(j.monto)}${j.comision ? ', comisión ' + _reqBdjMxn(j.comision) : ''})</span>`;
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
      <div class="rq-acomp">${r.acompanantes.map((a, i) => `<div>${i + 2}. <b>${_reqBdjEsc(a.nombre)}</b> · ${_reqBdjEsc(a.correo)}${a.celular ? ' · WA ' + _reqBdjEsc(a.celular) : ''}${a.genero ? ' · ' + (a.genero === 'M' ? '♀ mujer' : '♂ hombre') : ''}${a.talla_playera ? ' · talla ' + _reqBdjEsc(a.talla_playera) : ''}${a.num_emergencia ? ' · emerg. ' + _reqBdjEsc(a.num_emergencia) : ''}</div>`).join('')}</div>
    </div>` : '';
  // [REQ-DUP-1] El aviso de gemelas que el servidor derivó (mismo evento +
  // mismo celular o correo). Nació del caso Virginia Moguel: la misma solicitud
  // aprobada dos veces. El candado real vive en el servidor; esto es la señal.
  const dup = Array.isArray(r.dup_de) && r.dup_de.length
    ? `<div style="margin:6px 0;padding:6px 10px;border:1px solid var(--red);border-radius:8px;font-size:11px;color:var(--red)">⚠️ Posible duplicado: este celular/correo ya tiene ${r.dup_de.map((d) => `<b>${_reqBdjEsc(d.folio)}</b> (${_reqBdjEsc(d.estado)})`).join(', ')} en este mismo evento. Compara los comprobantes antes de aprobar.</div>`
    : '';
  // [CORREO-PUNTOS-1] Correo con forma rota (lo nombra el servidor): sin
  // arreglarlo, al aprobar NO le llega ni la confirmación ni el contrato.
  const malCorreo = Array.isArray(r.correo_problema) && r.correo_problema.length
    ? `<div style="margin:6px 0;padding:6px 10px;border:1px solid var(--red);border-radius:8px;font-size:11px;color:var(--red)">⚠️ <b>Correo mal escrito:</b> ${r.correo_problema.map((m) => `${_reqBdjEsc(m.quien)} — «${_reqBdjEsc(m.correo)}» ${_reqBdjEsc(m.problema)}`).join(' · ')}. Si apruebas así, <b>no le llega la confirmación ni el contrato</b>: pídele el correo bueno por WhatsApp y corrígelo después en ✏️ de su viajero.</div>`
    : '';
  return `
  <div class="rq-card is-${cls}" id="req-card-${r.id}">
    ${dup}${malCorreo}
    <div class="rq-head">
      <div class="rq-av">${_reqBdjEsc(ini)}</div>
      <div class="rq-who">
        <div class="rq-name">${_reqBdjEsc(r.nombre)}</div>
        <div class="rq-ev">${_reqBdjEsc(r.evento_nombre || r.evento_id)}</div>
      </div>
      <div class="rq-meta"><span class="rq-pill ${cls}">${_reqBdjEsc(r.estado)}</span><br>${_reqBdjEsc(r.folio)} · ${_reqBdjFecha(r.creado_en)}</div>
    </div>
    ${_reqFichaHtml(r, np)}
    <div class="rq-nums">
      <div class="rq-num"><small>Separo</small><b>${_reqBdjMxn(r.separo_sistema)}</b></div>
      <div class="rq-num"><small>Total</small><b>${_reqBdjMxn(r.total_sistema)}</b>${r.codigo ? `<i style="color:var(--green)">🎟 ${_reqBdjEsc(r.codigo)} −${_reqBdjMxn(r.descuento)}${r.total_lista != null ? ' (lista ' + _reqBdjMxn(r.total_lista) + ')' : ''}</i>` : ''}${(r.transporte && r.total_sistema != null) ? '<i>sin transporte CDMX</i>' : ''}</div>
      <div class="rq-num"><small>Pagó por</small><b style="font-size:14px">${_reqBdjEsc(formaTxt)}</b>${r.comprobante_path ? '<i>📎 con comprobante</i>' : (r.mp_pago_id ? '<i style="color:var(--green)">💳 pagado en MP</i>' : '<i>sin comprobante</i>')}</div>
    </div>
    ${_reqMpChip(r)}
    <div class="rq-body">
      <div class="rq-contact">
        <span>WhatsApp <b>${_reqBdjEsc(r.celular)}</b></span>
        ${r.correo ? `<span>Correo <b>${_reqBdjEsc(r.correo)}</b></span>` : ''}
        ${r.genero ? `<span>${r.genero === 'M' ? '♀ Mujer' : '♂ Hombre'}</span>` : ''}
        ${r.talla_playera ? `<span>Talla <b>${_reqBdjEsc(r.talla_playera)}</b></span>` : ''}
        ${r.num_emergencia ? `<span>Emergencia <b>${_reqBdjEsc(r.num_emergencia)}</b></span>` : ''}
      </div>
      ${acomp}
      ${r.cotizacion_texto ? `<details><summary>📄 Ver la cotización completa (tal como la vio el cliente)</summary><pre>${_reqBdjEsc(r.cotizacion_texto)}</pre></details>` : ''}
      ${r.estado === 'rechazada' && r.motivo_rechazo ? `<div class="rq-note no">Motivo del rechazo: ${_reqBdjEsc(r.motivo_rechazo)}</div>` : ''}
      ${/* [RECHAZO-AVISO-1] ¿se enteró el cliente? Un rechazo sin aviso se veía
            EXACTAMENTE igual que uno avisado — por eso cuatro personas que ya
            habían transferido quedaron esperando. Ahora se distinguen. */ ''}
      ${r.estado === 'rechazada' && r.motivo_clave === 'whatsapp' && !r.aviso_at
        ? '<div style="font-size:11px;color:var(--ts)">💬 Cierre por WhatsApp — este motivo no lleva correo</div>'
        : r.estado === 'rechazada' ? (r.aviso_at
        ? `<div style="font-size:11px;color:var(--green)">✓ Avisado por correo el ${_reqBdjEsc(_tsToDate(r.aviso_at).toLocaleDateString('es-MX', { timeZone: 'America/Matamoros', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}</div>`
        : `<div style="font-size:11px;color:#ffb020">⚠️ Sin avisar — este cliente no sabe que no se pudo${cel.length === 10 ? `. <a href="https://wa.me/52${cel}?text=${encodeURIComponent('Hola ' + (String(r.nombre || '').split(' ')[0]) + ', te escribimos de Conecta Reynosa por tu solicitud ' + r.folio + '. ' + (r.motivo_rechazo || 'No pudimos confirmar tu lugar.') + ' Tu pago queda a tu favor: dinos qué zona o fecha prefieres y lo aplicamos ahí.')}" target="_blank" rel="noopener" style="color:#25d366;font-weight:700">Avisarle por WhatsApp →</a>` : ''}</div>`) : ''}
      ${r.correccion && r.correccion.despues ? `<div style="font-size:11px;color:var(--yellow,#e8ff4c)">🔁 Aprobada CORREGIDA: pidió ${_reqBdjEsc(_reqCorTxt(r.correccion.antes))} → quedó en <b>${_reqBdjEsc(_reqCorTxt(r.correccion.despues))}</b>${r.correccion.motivo ? ' · «' + _reqBdjEsc(r.correccion.motivo) + '»' : ''}</div>` : ''}
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
    <h4>Al aprobar nace el viajero${_reqTieneComprobante(r) ? ' con su abono' : ''}</h4>
    ${r.mp_pago_id ? `<div style="margin:0 0 8px;padding:8px 10px;border:1px solid var(--green);border-radius:8px;font-size:12px;color:var(--green)">💳 <b>Pagado en Mercado Pago</b> (pago #${_reqBdjEsc(r.mp_pago_id)}): el abono se prellena con el NETO (${_reqBdjMxn(_reqMpNeto(r).neto)} — lo cobrado menos la comisión que pagó el cliente). Revisa que cuadre con el separo antes de confirmar.</div>` : ''}
    ${_reqTieneComprobante(r) ? '' : `<div style="margin:0 0 8px;padding:8px 10px;border:1px solid var(--red);border-radius:8px;font-size:12px;color:var(--red)">⚠️ <b>SIN COMPROBANTE</b> (${_reqBdjEsc(r.forma_pago === 'link_pago' ? 'pidió link de pago: todavía no paga' : 'no subió comprobante')}). Si aún no hay pago, <b>deja el monto vacío</b>: el viajero nace SIN abono, debiendo todo, y el pago se captura cuando llegue. Solo teclea un monto si verificaste el pago por otro lado.</div>`}
    <div class="rq-grid">
      <label class="rq-field">${r.comprobante_path ? 'Abono verificado (lo que dice el comprobante) *' : (r.mp_pago_id ? 'Abono (neto del pago en Mercado Pago) *' : 'Abono (vacío = sin pago todavía)')}<input type="number" id="req-apr-monto-${id}" value="${_reqBdjMontoInicial(r)}" min="0" step="1" oninput="_reqBdjDesgloseSuma('${id}')"></label>
      <label class="rq-field">Total del contrato *<input type="number" id="req-apr-total-${id}" value="${r.total_sistema != null ? Math.round(Number(r.total_sistema)) : ''}" min="1" step="1"></label>
      ${esRide ? '' : `<label class="rq-field">Zona del boleto *<input type="text" id="req-apr-zona-${id}" value="${_reqBdjEsc(r.zona || '')}"></label>`}
    </div>
    <div style="margin:8px 0">
      <button class="rq-btn" id="req-cor-btn-${id}" onclick="_reqCorAbrir('${id}')" title="No hay lugar o el cliente cambió de opinión: elige fecha, zona o paquete y el cliente recibe el correo con el ajuste">🔁 Cambiar fecha / zona / paquete</button>
      <div id="req-cor-${id}" style="display:none"></div>
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
  delete _reqCor[id];
  _reqBdjDesgloseSuma(id);
}

// ═════════════════════════════════════════════════════════════════════════════
// [REQ-CORRIGE-1] «🔁 Corregir y aprobar» — palabra de Memo (31-oct): cuando
// no hay lugar en la zona/fecha que pidió, se le acomoda en lo que SÍ hay sin
// que tenga que volver a meter la solicitud, y le llega el correo de siempre
// con el ajuste dicho. 🔒 Esta pantalla NO calcula un peso ni decide qué se
// vende: todo lo contesta el servidor (`correccion_opciones`, los dueños del
// precio y del inventario). El total sugerido se pone en «Total del contrato»
// y sigue siendo EDITABLE (un descuento negociado es palabra humana).
// ═════════════════════════════════════════════════════════════════════════════
const _reqCor = {};
const _REQ_PAQ_TXT = { plus: 'PLUS', stay: 'STAY', ride: 'RIDE', cheap: 'CHEAP' };
function _reqCorTxt(x) {
  if (!x) return '';
  const f = String(x.evento_id || '').includes('#') ? 'fecha #' + (Number(String(x.evento_id).split('#')[1]) + 1) : '';
  return [f, _REQ_PAQ_TXT[x.paquete] || x.paquete, x.zona, x.hotel].filter(Boolean).join(' · ');
}
function _reqCorZonaCampo(id, mostrar) {
  const z = document.getElementById('req-apr-zona-' + id);
  const lab = z && z.closest ? z.closest('label') : null;
  if (lab) lab.style.display = mostrar ? '' : 'none';
}
async function _reqCorAbrir(id) {
  const box = document.getElementById('req-cor-' + id);
  const btn = document.getElementById('req-cor-btn-' + id);
  if (!box) return;
  if (_reqCor[id] && _reqCor[id].on) {
    _reqCor[id].on = false; box.style.display = 'none';
    if (btn) btn.textContent = '🔁 Cambiar fecha / zona / paquete';
    _reqCorZonaCampo(id, true);
    const r = _reqBdjRows.find((x) => x.id === id);
    const t = document.getElementById('req-apr-total-' + id);
    if (t && r) t.value = r.total_sistema != null ? Math.round(Number(r.total_sistema)) : '';
    return;
  }
  _reqCor[id] = { on: true, sel: { evento_id: null, paquete: '', zona: '', hotel: '' },
    motivo: 'Ya no había lugares disponibles en lo que pediste, así que te acomodamos en esta opción que sí tenemos.', op: null, tok: 0 };
  if (btn) btn.textContent = '✕ Quitar el cambio (aprobar lo que pidió)';
  _reqCorZonaCampo(id, false);
  box.style.display = 'block';
  box.innerHTML = '<div style="font-size:12px;color:var(--ts)">Buscando lo que sí hay…</div>';
  await _reqCorCargar(id);
}
async function _reqCorCargar(id) {
  const st = _reqCor[id]; if (!st || !st.on) return;
  const tok = ++st.tok;
  const q = { accion: 'correccion_opciones', id };
  if (st.sel.evento_id) q.evento_id = st.sel.evento_id;
  if (st.sel.paquete) { q.paquete = st.sel.paquete; q.zona = st.sel.zona; q.hotel = st.sel.hotel; }
  let j = await _reqBdjCall(q).catch((e) => ({ error: e.message }));
  if (!_reqCor[id] || _reqCor[id].tok !== tok) return; // llegó tarde: el humano ya cambió algo
  // Una elección a medias (falta zona/habitación) contesta 400: se pide la
  // lista sola y el error se enseña como guía, no como falla.
  let guia = '';
  if (j && !j.ok && st.sel.paquete && (j._status === 400 || j._status === 409)) {
    guia = j.error || '';
    const q2 = { accion: 'correccion_opciones', id }; if (st.sel.evento_id) q2.evento_id = st.sel.evento_id;
    j = await _reqBdjCall(q2).catch((e) => ({ error: e.message }));
    if (!_reqCor[id] || _reqCor[id].tok !== tok) return;
  }
  st.op = (j && j.ok) ? j : null; st.guia = guia; st.err = (j && j.ok) ? '' : ((j && j.error) || 'No se pudo leer lo disponible');
  if (st.op && !st.sel.evento_id) st.sel.evento_id = st.op.evento.evento_id;
  const t = document.getElementById('req-apr-total-' + id);
  if (st.op && st.op.total_sugerido && t) t.value = st.op.total_sugerido;
  _reqCorPintar(id);
}
function _reqCorPintar(id) {
  const box = document.getElementById('req-cor-' + id); const st = _reqCor[id];
  if (!box || !st) return;
  if (!st.op) { box.innerHTML = `<div style="font-size:12px;color:var(--red)">⚠️ ${_reqBdjEsc(st.err)}</div>`; return; }
  const op = st.op; const e = _reqBdjEsc;
  const pidio = op.pidio || {};
  const pq = (op.paquetes || []).find((p) => p.paquete === st.sel.paquete) || null;
  const selF = op.fechas.length > 1 ? `<label class="rq-field">Fecha<select onchange="_reqCorSel('${id}','evento_id',this.value)">${op.fechas.map((f) => `<option value="${e(f.evento_id)}"${f.evento_id === st.sel.evento_id ? ' selected' : ''}>${e(f.lbl)}${f.evento_id === pidio.evento_id ? ' (la que pidió)' : ''}</option>`).join('')}</select></label>` : '';
  const selP = `<label class="rq-field">Paquete<select onchange="_reqCorSel('${id}','paquete',this.value)"><option value="">— elige —</option>${(op.paquetes || []).map((p) => `<option value="${e(p.paquete)}"${p.paquete === st.sel.paquete ? ' selected' : ''}>${e(p.nombre)}${p.paquete === pidio.paquete ? ' (el que pidió)' : ''}</option>`).join('')}</select></label>`;
  const selZ = pq && pq.zonas ? `<label class="rq-field">Zona<select onchange="_reqCorSel('${id}','zona',this.value)"><option value="">— elige —</option>${pq.zonas.map((z) => `<option value="${e(z.zona)}"${z.zona === st.sel.zona ? ' selected' : ''}${z.sin_cupo ? ' disabled' : ''}>${e(z.zona)} · ${_reqBdjMxn(z.precio)} c/u${z.quedan != null ? ' · quedan ' + z.quedan : ''}${z.sin_cupo ? ' · SIN CUPO' : ''}${z.zona === pidio.zona ? ' (la que pidió)' : ''}</option>`).join('')}</select></label>` : '';
  const selH = pq && pq.duerme && (op.habitaciones || []).length ? `<label class="rq-field">Habitación (${pidio.num_personas || 1} pers.)<select onchange="_reqCorSel('${id}','hotel',this.value)"><option value="">— elige —</option>${op.habitaciones.map((h) => `<option value="${e(h.nombre)}"${h.nombre === st.sel.hotel ? ' selected' : ''}>${e(h.nombre)}${h.extra ? ' · +' + _reqBdjMxn(h.extra) : ''}</option>`).join('')}</select></label>` : '';
  const listo = !!op.eleccion;
  box.innerHTML = `<div style="margin-top:8px;padding:10px 12px;border:1px solid var(--yellow,#e8ff4c);border-radius:10px">
    <div class="rq-sub">🔁 Acomodarlo en lo que SÍ hay — pidió: ${e(_reqCorTxt(pidio))}</div>
    <div class="rq-grid">${selF}${selP}${selZ}${selH}</div>
    <label class="rq-field">Qué le decimos (sale en su correo)<input type="text" id="req-cor-motivo-${id}" maxlength="300" value="${e(st.motivo)}" oninput="_reqCor['${id}'].motivo=this.value"></label>
    ${st.guia && !listo ? `<div style="font-size:11px;color:var(--ts)">${e(st.guia)}</div>` : ''}
    ${listo ? `<div style="font-size:12px;color:var(--green)">✓ Queda en <b>${e(_reqCorTxt(op.eleccion))}</b> · total sugerido ${_reqBdjMxn(op.total_sugerido)} (ya está en «Total del contrato», puedes ajustarlo).</div>` : ''}
    ${(op.avisos || []).map((a) => `<div style="font-size:11px;color:#ffb020">⚠️ ${e(a)}</div>`).join('')}
  </div>`;
}
function _reqCorSel(id, campo, valor) {
  const st = _reqCor[id]; if (!st) return;
  st.sel[campo] = valor;
  if (campo === 'evento_id') { st.sel.paquete = ''; st.sel.zona = ''; st.sel.hotel = ''; }
  if (campo === 'paquete') { st.sel.zona = ''; st.sel.hotel = ''; }
  if (st.op) { st.op.eleccion = null; st.op.total_sugerido = null; }
  _reqCorCargar(id);
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
  // [REQ-LINK-1] Sin comprobante NO se prellena nada: el prellenado del separo
  // fue exactamente cómo nació el abono fantasma de Daniela (link_pago, 30-oct)
  // — un número ya puesto se acepta sin mirar. El monto lo teclea quien tenga
  // el pago enfrente; si aún no hay pago, se aprueba con el campo VACÍO.
  // [MP-LINK-1] Con pago APROBADO en MP el prellenado es el NETO del pago —
  // aquí sí hay un pago verificado por el webhook (GET autenticado), no un
  // separo supuesto: la lección de Daniela no aplica.
  if (r.mp_pago_id) { const m = _reqMpNeto(r); return m && m.neto > 0 ? m.neto : ''; }
  if (!r.comprobante_path) return '';
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
  // [MP-DESG-1] Pagado en MP: la base es el NETO que cayó, y un desglose
  // declarado que no suma eso se ignora (el cliente lo tecleó antes de pagar).
  const mpNeto = r.mp_pago_id ? ((_reqMpNeto(r) || {}).neto || 0) : 0;
  let dec = Array.isArray(r.desglose) && r.desglose.length === n ? r.desglose.map((x) => Math.round(Number(x) || 0)) : null;
  if (dec && mpNeto > 0 && dec.reduce((a, b) => a + b, 0) !== mpNeto) dec = null;
  const base = mpNeto > 0 ? mpNeto : Math.round(Number(r.separo_sistema || 0));
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
  // [REQ-LINK-1] Sin comprobante se puede aprobar SIN abono (monto vacío/0) —
  // con confirm explícito: el viajero nace debiendo todo y el pago se captura
  // cuando llegue. CON comprobante el monto sigue siendo obligatorio.
  const rFila = _reqBdjRows.find((x) => x.id === id);
  const sinComp = !_reqTieneComprobante(rFila);   // [MP-LINK-1] el pago en MP cuenta
  if (!(monto > 0)) {
    if (!sinComp) { if (msg) { msg.textContent = 'El abono va en pesos, mayor a cero.'; msg.style.color = 'var(--red)'; } return; }
    if (!confirm('SIN COMPROBANTE Y SIN MONTO: el viajero nace SIN ningún abono, debiendo el total completo. El pago se captura cuando llegue (➕ Abono o su Portal).\n\n¿Aprobar así?')) return;
  }
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
  // [REQ-CORRIGE-1] Aprobar CORREGIDA: la elección viaja y el servidor la vuelve
  // a validar (fecha, paquete, zona con cupo, habitación). Sin elección completa
  // no se manda nada a medias.
  const cor = _reqCor[id] && _reqCor[id].on ? _reqCor[id] : null;
  if (cor) {
    const motivo = String(cor.motivo || '').trim();
    if (!cor.op || !cor.op.eleccion) { if (msg) { msg.textContent = 'Termina de elegir la fecha/paquete/zona/habitación del cambio (o quítalo).'; msg.style.color = 'var(--red)'; } if (btn) { btn.disabled = false; btn.textContent = 'Confirmar — crear viajero'; } return; }
    if (motivo.length < 3) { if (msg) { msg.textContent = 'Escribe qué le decimos al cliente del cambio.'; msg.style.color = 'var(--red)'; } if (btn) { btn.disabled = false; btn.textContent = 'Confirmar — crear viajero'; } return; }
    const e2 = cor.op.eleccion;
    if (!confirm('Se aprueba CORREGIDA:\n\nPidió: ' + _reqCorTxt(cor.op.pidio) + '\nQueda: ' + _reqCorTxt(e2) + '\nTotal: ' + _reqBdjMxn(total) + '\n\nEl cliente recibe el correo de confirmación con este ajuste. ¿Seguimos?')) { if (btn) { btn.disabled = false; btn.textContent = 'Confirmar — crear viajero'; } return; }
    body.correccion = { evento_id: e2.evento_id, paquete: e2.paquete, zona: e2.zona, hotel: e2.hotel, motivo };
  } else if (zonaEl) body.zona = zonaEl.value;
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
    // [REQ-LINK-1] Sin abono se DICE con todas sus letras, no «$0 cobrados».
    let txt = j.sin_abono
      ? '✓ ' + (nv > 1 ? nv + ' viajeros creados' : 'Viajero creado') + ' SIN ABONO (sin comprobante): debe el total completo. Captura el pago cuando llegue.'
      : '✓ ' + (nv > 1 ? nv + ' viajeros creados' : 'Viajero creado') + ' con ' + _reqBdjMxn(j.monto) + ' cobrados. Confírmale al cliente por WhatsApp.';
    if (j.correccion) txt += ' · 🔁 Corregida: quedó en ' + _reqCorTxt(j.correccion.despues);
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
// [RECHAZO-EDITA-1] La clave del chip elegido vive AQUÍ, no en el DOM: leerla
// del `.rq-chip.on` por su texto era frágil y obligaba a repintar los chips
// para recordarla — y ese repintado era el que borraba el mensaje manual.
const _reqClaveSel = {};  // id → clave elegida (null = ninguna / texto manual)
function _reqBdjRechazar(id) {
  const box = document.getElementById('req-rch-' + id);
  if (!box) return;
  if (box.style.display !== 'none') { box.style.display = 'none'; return; }
  const apr = document.getElementById('req-apr-' + id); if (apr) apr.style.display = 'none';
  box.innerHTML = '<div class="loading-state"><div class="spinner"></div>Abriendo…</div>';
  box.style.display = 'block';
  _reqClaveSel[id] = null;
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
  // [RECHAZO-EDITA-1] LO TECLEADO MANDA, SIEMPRE. La versión vieja decía «si hay
  // chip elegido → el texto de la plantilla», así que el repintado de los 700 ms
  // REVERTÍA el mensaje personal de Memo a la plantilla — el comentario prometía
  // respetar lo escrito a mano y el código no lo hacía. El prellenado del chip
  // sigue existiendo, pero vive en _reqBdjRchElegir (que pone el texto ANTES de
  // llegar aquí): este render jamás decide pisar al humano.
  const texto = (txtPrevio != null && txtPrevio !== '') ? txtPrevio : (sel ? sel.texto : '');
  const chips = (j.motivos || []).map((m) => `<button type="button" class="rq-chip${m.clave === clave ? ' on' : ''}"`
    + ` style="${m.clave === clave ? 'background:var(--red);color:#fff;border-color:var(--red)' : ''}"`
    + ` onclick="_reqBdjRchElegir('${id}','${m.clave}')">${_reqBdjEsc(m.etiqueta)}</button>`).join('');
  const previa = _reqBdjRchPreviaHtml(j);
  // [RECHAZO-AVISO-1b] El aviso se calla si esta persona YA viaja: decirle «no
  // pudimos confirmar tu lugar» a quien lo tiene es asustarla sin razón. Pasó
  // con una clienta el 28-oct, y la causa NO fue el envío a mano: aprobar la
  // segunda solicitud y rechazar la primera minutos después lo reproduce solo.
  const ya = j.ya_viaja || {};
  // [REEMBOLSO-AVISO-1] El reembolso SÍ avisa aunque ya viaje en otra fecha.
  const reemb = !!(sel && sel.reembolso);
  const calla = !!(ya.viaja && !reemb);
  const yaTxt = ya.fila ? `${ya.fila.evento_id || ''}${ya.fila.zona_boleto ? ' · ' + ya.fila.zona_boleto : ''}` : '';
  const avisoYaViaja = ya.viaja
    ? (reemb
      ? `<div class="rq-note" style="border-left:3px solid #e8ff4c">ℹ️ <b>Ya viaja en otra compra</b> (${_reqBdjEsc(yaTxt)}). El correo del reembolso SÍ sale y le dice que <b>ese otro lugar sigue confirmado</b>.</div>`
      : `<div class="rq-note" style="border-left:3px solid var(--green)">✅ <b>Ya viaja:</b> ${_reqBdjEsc(ya.razon || '')} <b>No se le va a mandar correo.</b> Si pidió su dinero de ESTA solicitud, elige «💸 Pidió su reembolso».</div>`)
    : (ya.comprobado === false
      ? `<div class="rq-note" style="border-left:3px solid #ffb020">⚠️ No se pudo revisar si ya viaja (${_reqBdjEsc(ya.razon || 'el padrón no respondió')}). El correo SÍ sale — revisa que no tenga ya su lugar en otra fecha.</div>`
      : '');
  const p = j.preview || {};
  const puedeAvisar = !!(p.avisa && !p.error && !calla);
  box.innerHTML = `
    <h4 style="color:var(--red)">Rechazar la solicitud</h4>
    <div style="font-size:11.5px;color:var(--ts);margin:0 0 8px">1 · Elige el motivo &nbsp;·&nbsp; 2 · Edítalo si quieres &nbsp;·&nbsp; 3 · Revisa el correo y manda</div>
    <div class="rq-chips">${chips}</div>
    <label class="rq-field">Lo que va a leer el cliente *
      <textarea id="req-rch-txt-${id}" maxlength="500" rows="2" placeholder="Toca un motivo arriba o escríbelo tú"
        oninput="_reqBdjRchRefrescar('${id}')" style="width:100%;box-sizing:border-box;resize:vertical">${_reqBdjEsc(texto)}</textarea></label>
    ${avisoYaViaja}
    ${j.pago && !calla ? (reemb
      ? '<div class="rq-note" style="border-left:3px solid var(--green)">💸 Ya transfirió: el correo le promete su <b>reembolso en menos de 24 horas</b>. La transferencia la haces tú.</div>'
      : '<div class="rq-note" style="border-left:3px solid var(--green)">💚 Ya transfirió: el correo le dice que <b>su pago queda a su favor</b> y que no tiene que volver a pagar.</div>') : ''}
    <div id="req-rch-prev-${id}">${calla ? '' : previa}</div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="rq-btn dan full" id="req-rch-go-${id}" onclick="_reqBdjRechazarGo('${id}')">${puedeAvisar ? 'Rechazar y avisar' : 'Rechazar (sin correo)'}</button>
      <button class="rq-btn quiet" onclick="document.getElementById('req-rch-${id}').style.display='none'">Cancelar</button>
    </div>
    <div id="req-rch-msg-${id}" class="rq-msg"></div>`;
}
// [RECHAZO-EDITA-1] El HTML de la vista previa tiene UN dueño: lo piden el
// render completo (abrir / tocar un chip) y el refresco de tecleo. Dos copias
// habrían sido dos listas que todavía no divergen.
function _reqBdjRchPreviaHtml(j) {
  const p = j.preview || {};
  if (!p.avisa) {
    return `<div class="rq-note" style="border-left:3px solid var(--ts)">💬 <b>Este motivo no manda correo.</b> ${_reqBdjEsc(p.razon || '')}</div>`;
  }
  if (p.error) {
    return `<div class="rq-note no">⚠️ <b>No se le puede mandar correo:</b> ${_reqBdjEsc(p.razon)}.`
      + (j.wa ? ` <a href="${_reqBdjEsc(j.wa)}" target="_blank" rel="noopener" style="color:#25d366;font-weight:700">Avísale por WhatsApp →</a>` : '')
      + '</div>';
  }
  return `<details open style="margin-top:10px">
      <summary style="cursor:pointer;color:#e8ff4c;font-weight:700;font-size:12px">👁 Así le va a llegar — para: ${_reqBdjEsc(p.to)}</summary>
      <div style="font-size:11px;color:var(--ts);margin:6px 0 4px">Asunto: <b style="color:var(--text)">${_reqBdjEsc(p.subject)}</b></div>
      <iframe srcdoc="${_reqBdjEsc(p.html)}" style="width:100%;height:380px;border:1px solid var(--border);border-radius:8px;background:#000"></iframe>
      ${p.catalogo_ok === false ? '<div style="font-size:11px;color:#ffb020;margin-top:4px">No se pudo leer el catálogo: el correo sale sin la fecha ni el link del evento. Se manda igual.</div>' : ''}
    </details>`;
}
function _reqBdjRchElegir(id, clave) {
  _reqClaveSel[id] = clave;
  const t = document.getElementById('req-rch-txt-' + id);
  const m = (_reqMotivos[id] || []).find((x) => x.clave === clave);
  // Tocar un chip PRELLENA su plantilla a propósito (es el gesto de «dame el
  // texto de la casa»); de ahí en adelante lo tecleado manda y nadie lo pisa.
  if (t && m) t.value = m.texto;
  _reqBdjRchPintar(id, clave);
}
// Mientras teclea no se le pide al servidor en cada letra: se espera a que pare.
let _reqRchTimer = null;
function _reqBdjRchRefrescar(id) {
  clearTimeout(_reqRchTimer);
  _reqRchTimer = setTimeout(() => _reqBdjRchPreview(id), 700);
}
// [RECHAZO-EDITA-1] El refresco de tecleo actualiza SOLO la vista previa.
// La versión vieja repintaba el box ENTERO (_reqBdjRchPintar) a los 700 ms:
// destruía el textarea a media frase (el foco se iba) y, con chip elegido,
// re-decidía el texto desde la plantilla — el mensaje personal de Memo se
// borraba solo. La familia de «una bandera sobre un nodo que se repinta»
// (PS-EVENTOS-1), cara de textarea.
async function _reqBdjRchPreview(id) {
  const prev = document.getElementById('req-rch-prev-' + id);
  const t = document.getElementById('req-rch-txt-' + id);
  if (!prev || !t) return;
  const texto = t.value || '';
  const clave = _reqClaveSel[id] || null;
  const j = await _reqBdjCall({ accion: 'rechazo_preview', id, motivo_clave: clave, motivo: texto })
    .catch(() => null);
  // Falló la previa → se queda la anterior; lo que VIAJA al rechazar es el
  // textarea, nunca la vista previa, así que no se pierde nada.
  if (!j || !j.ok) return;
  // Carrera: si siguió tecleando mientras el servidor contestaba, esta previa
  // ya habla de un texto viejo — la pasada que viene pinta la buena.
  const t2 = document.getElementById('req-rch-txt-' + id);
  if (!t2 || (t2.value || '') !== texto) return;
  if (Array.isArray(j.motivos) && j.motivos.length) _reqMotivos[id] = j.motivos;
  const ya = j.ya_viaja || {};
  const reemb = !!((j.motivos || []).find((m) => m.clave === clave) || {}).reembolso;
  prev.innerHTML = (ya.viaja && !reemb) ? '' : _reqBdjRchPreviaHtml(j);
}
async function _reqBdjRechazarGo(id) {
  const motivo = ((document.getElementById('req-rch-txt-' + id) || {}).value || '').trim();
  const msg = document.getElementById('req-rch-msg-' + id);
  if (motivo.length < 3) { if (msg) { msg.textContent = 'Escribe qué va a leer el cliente.'; msg.style.color = 'var(--red)'; } return; }
  // [RECHAZO-EDITA-1] La clave sale del store, no de leer el chip por su texto.
  const clave = _reqClaveSel[id] || null;
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
