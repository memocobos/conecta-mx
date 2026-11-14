/* =============================================================================
 * kamehouse-portal-revision.js — [PORTAL-SOLO-1] la bandeja «Portal» (27-oct-2026)
 *
 * Palabra de Memo: «antes que se registrara bulma milk o yo podamos revisar su
 * caso para darle la información correcta de su tour … una pequeña revisión
 * manual … lo que se guarde en la revisión manual tú la puedes utilizar».
 *
 * [REQ-SIMPLE-1 · 13-nov] Cada clase vive en SU trabajo de la bandeja (antes iban
 * revueltas bajo un título): 🔗 → «No ven su viaje», 🪪 → «Viajes por publicar».
 * Dos clases de tarjeta:
 *   🪪 Revisar antes del Portal — el cliente se registró y tiene filas sin
 *      revisar: se ven sus filas, sus abonos y (a un clic) lo que dice el Excel;
 *      se corrige con lo de siempre (➕ Abono, editar) y se PUBLICA con nota.
 *   🔗 Ligar Portal — el cliente no ve nada: se elige «Es esta persona» entre
 *      los candidatos del evento y luego se publica igual.
 * Y la bitácora reciente (antes → después + nota), que se queda guardada.
 *
 * Endpoint: admin-portal-revision. Se calla en cero.
 * ========================================================================== */

let _prvRows = [];
const _prvEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _prvMxn = (n) => (n == null || n === '') ? '—' : '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
function _prvFecha(iso) {
  try { return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Matamoros', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
  catch (_) { return String(iso || ''); }
}

async function _prvCall(body) {
  const r = await khAdminFetch('/.netlify/functions/admin-portal-revision', { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !j.error) j.error = 'HTTP ' + r.status;
  j._status = r.status;
  return j;
}

// [REQ-SIMPLE-1] Cada trabajo en SU caja (viven fijas en kamehouse.html; si
// faltaran, se crean antes de la lista como antes).
function _prvCajaDe(id) {
  let b = document.getElementById(id);
  if (!b) {
    const lista = document.getElementById('req-bdj-lista');
    if (!lista) return null;
    b = document.createElement('div'); b.id = id; lista.parentNode.insertBefore(b, lista);
  }
  return b;
}
// Un hijo dentro de «extras» (bitácora, ensayo): cada lector escribe el suyo.
function _prvExtra(idHijo) {
  const ext = _prvCajaDe('req-extras');
  if (!ext) return null;
  let h = document.getElementById(idHijo);
  if (!h) { h = document.createElement('div'); h.id = idHijo; ext.appendChild(h); }
  return h;
}
function _prvSecH(titulo, que, n) {
  if (typeof _reqSecH === 'function') return _reqSecH(titulo, que, n);
  return `<div class="rq-section">${titulo}${n ? ` <span class="rq-pill pend">${n}</span>` : ''}</div><div class="rq-nota">${que}</div>`;
}
function _prvContar(sec, n) { try { if (typeof _reqContar === 'function') _reqContar(sec, n); } catch (_) {} }

// [REQ-SIMPLE-1 · 13-nov-2026] Una lectura, DOS trabajos que antes salían
// revueltos bajo un mismo título:
//   🔗 No ven su viaje  → hay que decir QUIÉN es («✓ Es esta persona»).
//   🪪 Viajes por publicar → ya son suyos; hay que revisar números y publicar.
async function loadRevisionesPortal() {
  // [ROL-AVISOS-1] Al publicar, quien no tiene rol fijo cae a «🗓 Rol por fijar».
  try { if (typeof loadRolPendientes === 'function') loadRolPendientes(); } catch (_) {}
  const box = _prvCajaDe('req-portal'), boxLig = _prvCajaDe('req-ligar');
  if (!box || !boxLig) return;
  const T_LIG = '🔗 No ven su viaje', T_REV = '🪪 Viajes por publicar en el Portal';
  const j = await _prvCall({ accion: 'listar' }).catch((e) => ({ error: e.message }));
  if (!j || !j.ok) {
    const err = `<div class="rq-aviso mal">No se pudieron leer las revisiones del Portal: ${_prvEsc((j && j.error) || 'sin respuesta')}</div>`;
    boxLig.innerHTML = _prvSecH(T_LIG, 'Clientes que entraron al Portal y no encuentran su viaje.') + err;
    box.innerHTML = _prvSecH(T_REV, 'Viajes que el cliente no ve hasta que alguien los revise.') + err;
    _prvContar('ligar', -1); _prvContar('portal', -1);
    return;
  }
  _prvRows = j.pendientes || [];
  const rec = j.recientes || [];
  const ligar = _prvRows.filter((r) => r.tipo === 'ligar');
  const revisar = _prvRows.filter((r) => r.tipo !== 'ligar');
  boxLig.innerHTML = _prvSecH(T_LIG, 'Se registraron en el Portal y no les aparece su viaje — casi siempre porque su viaje no tiene su correo. Busca cuál es entre los parecidos y toca <b>«✓ Es esta persona»</b>: en ese momento el viaje ya es suyo. (Cerrar el pendiente NO lo liga.)', ligar.length)
    + (ligar.length ? ligar.map(_prvCard).join('') : '<div class="rq-aldia">✓ Nadie está esperando que lo encuentren.</div>');
  box.innerHTML = _prvSecH(T_REV, 'El cliente ya entró y su viaje no se le enseña hasta que alguien lo revise. Ve viaje por viaje: si sus números están bien, <b>«✓ Publicar este»</b>; si no, corrígelo ahí mismo (✏️ / ➕ Pago). Al terminar le llega UN correo.', revisar.length)
    + (revisar.length ? revisar.map(_prvCard).join('') : '<div class="rq-aldia">✓ No hay viajes esperando revisión.</div>');
  const bit = _prvExtra('req-extras-bit');
  if (bit) bit.innerHTML = rec.length ? `<details class="prv-bit" style="margin:0 0 10px"><summary style="cursor:pointer;font-size:12px;color:var(--ts)">📒 Bitácora del Portal · últimas ${rec.length}</summary>${rec.map(_prvBitFila).join('')}</details>` : '';
  _prvContar('ligar', ligar.length); _prvContar('portal', revisar.length);
}

function _prvBitFila(r) {
  const suma = (arr, k) => (arr || []).reduce((s, x) => s + (Number(x && x[k]) || 0), 0);
  const a = suma(r.antes, 'abonado'), d = suma(r.despues, 'abonado');
  const ta = suma(r.antes, 'total'), td = suma(r.despues, 'total');
  const cambio = (a !== d || ta !== td) ? ` · <span style="color:var(--yellow)">total ${_prvMxn(ta)}→${_prvMxn(td)} · pagado ${_prvMxn(a)}→${_prvMxn(d)}</span>` : '';
  const est = r.estado === 'publicada' ? '<span style="color:var(--green)">publicada</span>'
    : r.estado === 'resuelta' ? '<span style="color:var(--ts)">cerrada (ya quedó)</span>' : '<span style="color:var(--red)">no procede</span>';
  const tipo = { revisar: '🪪', ligar: '🔗', adelanto: '⏩' }[r.tipo] || '';
  return `<div style="font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)">${tipo} ${_prvEsc(_prvFecha(r.atendida_at))} · ${_prvEsc(r.correo)} · ${est} por ${_prvEsc(r.atendida_por || '—')}${cambio}`
    + `${r.nota_staff ? `<div style="color:var(--ts)">📝 ${_prvEsc(r.nota_staff)}</div>` : ''}${r.motivo ? `<div style="color:var(--ts)">Motivo: ${_prvEsc(r.motivo)}</div>` : ''}</div>`;
}

// [PRV-FILA-1] Palabra de Memo: «no puedo editar nada de lo que dice ella …
// estaría bueno poder editar e ir aceptando uno por uno». Cada viaje se corrige
// (✏️), se le mete un pago (➕), y se PUBLICA o se marca «no procede» SOLO.
// Cuando ya no queda ninguno por decidir, la revisión se cierra sola y le llega
// UN correo al cliente. Lo publicado ya no se edita aquí.
function _prvFilaHtml(rev, v, i) {
  const c = v.cuenta || {};
  const publicada = !!v.portal_revisado_at;
  const np = v.no_procede;
  const decidida = publicada || !!np;
  const sello = publicada ? '<span class="rq-tag" style="color:var(--green);border-color:var(--green)">✓ publicado</span>'
    : np ? '<span class="rq-tag" style="color:var(--red);border-color:var(--red)">✗ no procede</span>'
    : '<span class="rq-tag" style="color:var(--yellow);border-color:var(--yellow)">por revisar</span>';
  const pasado = v.evento_pasado ? ' <span class="rq-tag" style="color:var(--ts)">evento pasado</span>' : '';
  const pagadoSinTotal = (Number(v.abonado_previo) || 0) + (v.abonos_lista || []).reduce((s, a) => s + (Number(a.monto) || 0), 0);
  const abonos = (v.abonos_lista || []).map((a) => `<div>${_prvEsc(a.fecha || '—')} · <b>${_prvMxn(a.monto)}</b>${a.nota ? ' · <span style="color:var(--ts)">' + _prvEsc(String(a.nota).slice(0, 90)) + '</span>' : ''}</div>`).join('') || '<div style="color:var(--ts)">Sin abonos capturados</div>';
  // [PORTAL-RECUERDO-1] Un viaje pasado se publica como RECUERDO: el Portal no
  // le enseña dinero, así que el «Sin total» no aplica (palabra de Memo: «ya no
  // importa el dinero»). El dinero de la base NO se toca.
  const dinero = v.evento_pasado
    ? `<div style="font-size:13px;color:var(--ts)">📸 <b>Viaje pasado</b> — se publica como recuerdo: el cliente ve el tour, sin dinero ni plan. Pagado registrado: <b>${_prvMxn(c.total == null ? pagadoSinTotal : c.abonado)}</b></div>`
    : c.total == null
    // [PRV-SINTOTAL-1] Sin total, saldoMigrado no cuenta (un cero sería falso):
    // se DICE que falta y se enseña lo pagado.
    ? `<div style="font-size:13px;color:var(--yellow)">⚠️ <b>Sin total de contrato</b> — ponlo con ✏️ Editar antes de publicar. Pagado hasta hoy: <b style="color:var(--green)">${_prvMxn(pagadoSinTotal)}</b></div>`
    : `<div style="font-size:13px">Total <b>${_prvMxn(c.total)}</b> · Pagado <b style="color:var(--green)">${_prvMxn(c.abonado)}</b> · Resta <b>${_prvMxn(c.resta)}</b>${Number(v.abonado_previo) ? ` <span style="color:var(--ts)">(incluye ${_prvMxn(v.abonado_previo)} pagado antes del sistema)</span>` : ''}</div>`;
  const k = `${rev.id}-${i}`;
  const acciones = decidida
    ? (np ? `<div style="font-size:12px;color:var(--ts);margin-top:6px">Motivo: ${_prvEsc(np)}</div>` : '')
    // [REQ-SIMPLE-1] El paso de siempre va PRIMERO y en verde; lo demás al lado
    // y «No procede» lejos, a la derecha (los cinco botones pesaban lo mismo).
    : `<div class="rq-linea" style="margin-top:8px">
        <button class="rq-btn pri" onclick="_prvFilaPublicar('${rev.id}', ${i})">${v.evento_pasado ? '📸 Publicar como recuerdo' : '✓ Publicar este'}</button>
        <button class="rq-btn" onclick="_prvEditarAbrir('${rev.id}', ${i})">✏️ Corregir</button>
        <button class="rq-btn" onclick="_prvAbonoAbrir('${rev.id}', ${i})">➕ Pago</button>
        <button class="rq-btn" onclick="_prvExcel('${rev.id}', ${i})">📊 ¿Qué dice el Excel?</button>
        <span class="rq-sp"></span>
        <button class="rq-btn dan" onclick="_prvFilaNoAbrir('${rev.id}', ${i})">✗ No procede</button>
      </div>`;
  return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin:8px 0;${decidida ? 'opacity:.6' : ''}">
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline">
      <div><b>${_prvEsc(v.nombre || '—')}</b> · ${_prvEsc(v.evento_nombre || v.evento_id)}${v.evento_fecha ? ' <span style="color:var(--ts)">(' + _prvEsc(v.evento_fecha) + ')</span>' : ''}${pasado}</div>${sello}
    </div>
    <div style="font-size:13px;margin:4px 0">${_prvEsc([String(v.tipo_paquete || '').toUpperCase(), v.zona_boleto, Number(v.boletos) > 1 ? v.boletos + ' lugares' : ''].filter(Boolean).join(' · ') || '—')}</div>
    ${dinero}
    <details style="margin-top:6px;font-size:12px"><summary style="cursor:pointer;color:var(--ts)">Pagos capturados (${(v.abonos_lista || []).length})</summary>${abonos}</details>
    ${acciones}
    <div id="prv-fila-${k}"></div>
    <div id="prv-excel-${k}" style="font-size:12px;margin-top:6px"></div>
  </div>`;
}

function _prvFila(revId, i) {
  const rev = _prvRows.find((x) => x.id === revId);
  return { rev, v: rev && rev.filas && rev.filas[i], box: document.getElementById(`prv-fila-${revId}-${i}`) };
}
const _prvIn = 'width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:7px 8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text)';
const _prvLb = 'display:block;font-size:11px;color:var(--ts);margin:6px 0 2px';
// Un panel por viaje: volver a tocar el mismo botón lo cierra; otro botón lo cambia.
function _prvToggle(box, clave, html) {
  if (box.dataset.abierto === clave) { box.innerHTML = ''; box.dataset.abierto = ''; return; }
  box.dataset.abierto = clave; box.innerHTML = html;
}

// [PAGADO-CLARO-1] «Pagado antes» NO incluye los pagos capturados (➕ Pago),
// y teclear ahí el pagado TOTAL lo cuenta dos veces (caso Mariana Santibáñez,
// 30-oct: $5,000 + su abono de $500 = $5,500 y resta −$200). Se enseña en vivo
// la cuenta que va a quedar, con la misma suma que pinta la tarjeta.
function _prvPagadoTxt(v, previo) {
  const caps = (v.abonos_lista || []).reduce((s, a) => s + (Number(a.monto) || 0), 0);
  const pre = Number(previo) || 0;
  const tot = pre + caps;
  const resta = v.total_contrato == null ? null : Number(v.total_contrato) - tot;
  return `Va a quedar: <b>${_prvMxn(pre)}</b> antes + <b>${_prvMxn(caps)}</b> capturados = <b>pagado ${_prvMxn(tot)}</b>`
    + (resta == null ? '' : ` · resta <b style="color:${resta < 0 ? 'var(--red)' : 'var(--text)'}">${_prvMxn(resta)}</b>`)
    + (caps ? `<br><span style="color:var(--ts)">Si la clienta pagó ${_prvMxn(tot)} en total, aquí va solo lo que NO está en «Pagos capturados».</span>` : '');
}
function _prvPagadoPintar(revId, i) {
  const { v } = _prvFila(revId, i); if (!v) return;
  const el = document.getElementById(`pe-pt-${revId}-${i}`);
  const inp = document.getElementById(`pe-pre-${revId}-${i}`);
  if (el && inp) el.innerHTML = _prvPagadoTxt(v, inp.value);
}
function _prvEditarAbrir(revId, i) {
  const { v, box } = _prvFila(revId, i); if (!v || !box) return;
  const paq = String(v.tipo_paquete || '').toLowerCase();
  const op = ['plus', 'stay', 'cheap', 'ride'].map((p) => `<option value="${p}"${p === paq ? ' selected' : ''}>${p.toUpperCase()}</option>`).join('');
  _prvToggle(box, 'editar', `<div class="rq-panel" style="margin:8px 0 0">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">
      <div style="grid-column:1/-1"><label style="${_prvLb}">Nombre</label><input id="pe-nom-${revId}-${i}" style="${_prvIn}" value="${_prvEsc(v.nombre || '')}"></div>
      <div><label style="${_prvLb}">Paquete</label><select id="pe-paq-${revId}-${i}" style="${_prvIn}">${paq ? '' : '<option value="">— elige —</option>'}${op}</select></div>
      <div><label style="${_prvLb}">Zona (como en la ficha)</label><input id="pe-zon-${revId}-${i}" style="${_prvIn}" value="${_prvEsc(v.zona_boleto || '')}"></div>
      <div><label style="${_prvLb}">Lugares</label><input id="pe-bol-${revId}-${i}" type="number" min="1" max="20" style="${_prvIn}" value="${Number(v.boletos) || 1}"></div>
      <div><label style="${_prvLb}">Total del contrato ($)</label><input id="pe-tot-${revId}-${i}" inputmode="decimal" style="${_prvIn}" value="${v.total_contrato == null ? '' : _prvEsc(v.total_contrato)}" placeholder="ej. 7200"></div>
      <div style="grid-column:1/-1"><label style="${_prvLb}">Pagado ANTES del sistema ($) — <b>SIN contar los pagos capturados</b></label><input id="pe-pre-${revId}-${i}" inputmode="decimal" style="${_prvIn}" value="${v.abonado_previo == null ? '' : _prvEsc(v.abonado_previo)}" placeholder="0" oninput="_prvPagadoPintar('${revId}', ${i})"></div>
      <div id="pe-pt-${revId}-${i}" style="grid-column:1/-1;font-size:12px;margin-top:4px">${_prvPagadoTxt(v, v.abonado_previo)}</div>
    </div>
    <div style="font-size:11px;color:var(--ts);margin:6px 0">Los pagos nuevos van con <b>➕ Pago</b> (con su fecha). Cada cambio queda anotado en la ficha.</div>
    <button class="rq-btn pri full" onclick="_prvEditarGo('${revId}', ${i})">Guardar cambios</button>
  </div>`);
}
async function _prvEditarGo(revId, i) {
  const { v } = _prvFila(revId, i); if (!v) return;
  const g = (id) => ((document.getElementById(`pe-${id}-${revId}-${i}`) || {}).value || '').trim();
  const campos = {};
  const nom = g('nom'), paq = g('paq'), zon = g('zon'), bol = g('bol'), tot = g('tot'), pre = g('pre');
  if (nom !== String(v.nombre || '')) campos.nombre = nom;
  if (paq && paq !== String(v.tipo_paquete || '').toLowerCase()) campos.tipo_paquete = paq;
  if (zon !== String(v.zona_boleto || '') || (paq && paq !== String(v.tipo_paquete || '').toLowerCase())) campos.zona_boleto = zon;
  if (bol && Number(bol) !== (Number(v.boletos) || 1)) campos.boletos = Number(bol);
  if (tot !== (v.total_contrato == null ? '' : String(v.total_contrato))) campos.total_contrato = tot;
  if (pre !== (v.abonado_previo == null ? '' : String(v.abonado_previo))) campos.abonado_previo = pre;
  if (!Object.keys(campos).length) { showToast('No cambiaste nada', 'warning'); return; }
  const j = await _prvCall({ accion: 'fila_editar', id: revId, viajero_id: v.id, campos });
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo guardar'), 'error'); return; }
  showToast('Guardado' + (j.zona_aviso ? ' · ' + j.zona_aviso : ''), 'success');
  loadRevisionesPortal();
}

function _prvAbonoAbrir(revId, i) {
  const { box } = _prvFila(revId, i); if (!box) return;
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
  _prvToggle(box, 'pago', `<div class="rq-panel" style="margin:8px 0 0">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">
      <div><label style="${_prvLb}">Monto ($)</label><input id="pa-mon-${revId}-${i}" inputmode="decimal" style="${_prvIn}" placeholder="ej. 1500"></div>
      <div><label style="${_prvLb}">Fecha del pago</label><input id="pa-fec-${revId}-${i}" type="date" style="${_prvIn}" value="${hoy}"></div>
      <div style="grid-column:1/-1"><label style="${_prvLb}">Nota (opcional)</label><input id="pa-not-${revId}-${i}" style="${_prvIn}" placeholder="ej. transferencia BBVA, estaba en el Excel y faltaba"></div>
    </div>
    <div style="font-size:11px;color:var(--ts);margin:6px 0">No le manda correo al cliente: el aviso sale cuando publiques.</div>
    <button class="rq-btn pri full" onclick="_prvAbonoGo('${revId}', ${i})">Guardar pago</button>
  </div>`);
}
async function _prvAbonoGo(revId, i) {
  const { v } = _prvFila(revId, i); if (!v) return;
  const g = (id) => ((document.getElementById(`pa-${id}-${revId}-${i}`) || {}).value || '').trim();
  const monto = Number(g('mon').replace(/[$,\s]/g, ''));
  if (!(monto > 0)) { showToast('Escribe el monto', 'error'); return; }
  const r = await khAdminFetch('/.netlify/functions/admin-coordi-asignaciones', { method: 'POST',
    body: JSON.stringify({ accion: 'abono_crear', viajero_id: v.id, monto, fecha: g('fec') || undefined, nota: g('not') || ('Capturado en la revisión del Portal'), avisar: false }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { showToast(_prvEsc(j.error || 'No se pudo guardar el pago'), 'error'); return; }
  showToast('Pago guardado', 'success');
  loadRevisionesPortal();
}

async function _prvFilaPublicar(revId, i) {
  const { v } = _prvFila(revId, i); if (!v) return;
  if (v.cuenta && v.cuenta.total == null && !confirm('Este viaje NO tiene total de contrato: el cliente lo verá sin números. ¿Publicarlo así?')) return;
  const nota = (document.getElementById('prv-nota-' + revId) || {}).value || '';
  const j = await _prvCall({ accion: 'fila_publicar', id: revId, viajero_id: v.id, nota });
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo publicar'), 'error'); return; }
  const ci = j.cierre || {};
  if (ci.cerrada) {
    const co = ci.correo || {};
    showToast(_prvEsc(`Listo: ya no queda nada por revisar · ${co.ok ? 'le llegó el correo' : 'el correo NO salió: ' + (co.aviso || '') + ' — avísale por WhatsApp'}` + _prvRolTxt(j.rol)), co.ok ? 'success' : 'warning');
  } else showToast(_prvEsc(`Publicado · ${ci.restantes || 0} por revisar` + _prvRolTxt(j.rol)), 'success');
  loadRevisionesPortal();
}

function _prvFilaNoAbrir(revId, i) {
  const { box } = _prvFila(revId, i); if (!box) return;
  _prvToggle(box, 'no', `<div class="rq-panel" style="margin:8px 0 0">
    <div style="font-size:12px;color:var(--ts);margin-bottom:6px">El motivo lo ve el cliente en su Portal (y en el correo final).</div>
    <input id="pn-mot-${revId}-${i}" style="${_prvIn}" placeholder="ej. Ese viaje ya pasó · Ese pago es de otro evento · No encontramos ese viaje a tu nombre">
    <button class="rq-btn dan full" style="margin-top:6px" onclick="_prvFilaNoGo('${revId}', ${i})">Marcar «no procede»</button>
  </div>`);
}
async function _prvFilaNoGo(revId, i) {
  const { v } = _prvFila(revId, i); if (!v) return;
  const motivo = ((document.getElementById(`pn-mot-${revId}-${i}`) || {}).value || '').trim();
  if (motivo.length < 3) { showToast('Escribe el motivo', 'error'); return; }
  const j = await _prvCall({ accion: 'fila_no_procede', id: revId, viajero_id: v.id, motivo });
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo guardar'), 'error'); return; }
  const ci = j.cierre || {};
  showToast(ci.cerrada ? `Listo: ya no queda nada por revisar · ${(ci.correo || {}).ok ? 'le llegó el correo' : 'el correo NO salió — avísale por WhatsApp'}` : `Marcado · ${ci.restantes || 0} por revisar`, 'success');
  loadRevisionesPortal();
}

// [ROL-2027-1] Lo que pasó con su rol al publicar, dicho en el aviso.
function _prvRolTxt(rol) {
  if (!rol) return '';
  const f = rol.fijados || [];
  if (f.length === 1) return ' · 🗓 rol fijo desde hoy: ' + f[0].texto;
  if (f.length > 1) return ' · 🗓 ' + f.length + ' con su rol fijo desde hoy';
  if (rol.a_mano) return ' · 🗓 su rol se fija en «Rol por fijar» (tour 2026: con su fecha de separo)';
  return '';
}

// [REQ-SIMPLE-1 · 13-nov-2026] LA TARJETA DICE EN QUÉ ESTADO ESTÁ Y CUÁL ES EL
// SIGUIENTE PASO — uno solo, en verde.
// 🔴 Lo que se midió (13-nov): de 52 «no veo mi viaje» cerradas con «✓ Ya
// quedó», 51 se cerraron SIN tocar «Es esta persona» y 23 de esas personas
// siguen sin ningún viaje a su correo. Los cuatro botones del pie pesaban igual
// y «Ya quedó» sonaba a «confirmar». Hoy:
//   · sin ningún viaje a su correo → se DICE en rojo, y el único verde es
//     «✓ Es esta persona» en cada parecido; cerrar así pide confirmarlo;
//   · con viajes por publicar → el verde es «✓ Publicar»;
//   · ya ve su viaje → el verde es «✓ Cerrar y avisarle» (un clic, sin teclear).
function _prvCard(rev) {
  const ligar = rev.tipo === 'ligar';
  const ev = rev.evento ? `${_prvEsc(rev.evento.nombre)}${rev.evento.fecha ? ' (' + _prvEsc(rev.evento.fecha) + ')' : ''}` : '';
  const wa = String(rev.celular || '').replace(/\D/g, '');
  const filas = rev.filas || [];
  const publicadas = filas.filter((v) => v.portal_revisado_at).length;
  const pasadosPend = filas.filter((v) => !v.portal_revisado_at && !v.no_procede && v.evento_pasado).length;
  const sinNada = ligar && !filas.length;
  const yaVe = filas.length > 0 && !rev.sin_revisar && publicadas > 0;
  let cuerpo = '';
  if (ligar) {
    const cands = rev.candidatos || [];
    cuerpo += `<div style="font-size:13px;margin:6px 0">Dice que es <b>${_prvEsc(rev.nombre_dado)}</b> en <b>${ev}</b>${wa ? ' · WA ' + _prvEsc(wa) : ''}</div>`
      + (rev.nota_cliente ? `<q>${_prvEsc(rev.nota_cliente)}</q>` : '')
      + (sinNada ? '<div class="rq-aviso mal"><b>Hoy NO ve ningún viaje</b> con este correo. Elige abajo cuál es su viaje: al tocar «✓ Es esta persona» ya es suyo.</div>'
        : yaVe ? `<div class="rq-aviso ok">✓ <b>Este correo ya ve su viaje</b> (${publicadas} publicado${publicadas === 1 ? '' : 's'}). Si era el que buscaba, ciérralo y avísale.</div>`
        : rev.sin_revisar ? `<div class="rq-aviso ojo">Ya tiene ${filas.length === 1 ? 'un viaje' : filas.length + ' viajes'} a su correo; falta <b>publicar</b> ${rev.sin_revisar === 1 ? 'uno' : rev.sin_revisar} para que lo vea.</div>`
        : '<div class="rq-aviso ojo">Los viajes de su correo ya se decidieron y ninguno quedó publicado: ciérralo con una nota, o «No procede» con el motivo.</div>')
      + (rev.candidatos_error ? `<div class="rq-aviso mal">${_prvEsc(rev.candidatos_error)}</div>` : '')
      // Si ya ve su viaje y no hay más parecidos, la lista vacía solo estorbaba.
      + ((cands.length || !yaVe) ? `<div class="rq-nota" style="margin-top:8px">Parecidos en ese evento (mismo WhatsApp primero):</div>` : '')
      + (cands.length ? cands.map((v) => {
        const c = v.cuenta || {};
        return `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--border);padding:6px 0;font-size:13px">
          <div><b>${_prvEsc(v.nombre)}</b> · ${_prvEsc(v.evento_fecha || v.evento_id)} · ${_prvEsc([String(v.tipo_paquete || '').toUpperCase(), v.zona_boleto].filter(Boolean).join(' · '))} · total ${_prvMxn(c.total)} · pagado ${_prvMxn(c.abonado)}
            ${v.mismo_celular ? ' <span class="rq-tag" style="color:var(--green);border-color:var(--green)">mismo WhatsApp</span>' : ''}
            <div style="font-size:11px;color:var(--ts)">${v.correo ? 'ya trae otro correo: ' + _prvEsc(v.correo) + ' (te va a pedir confirmar el cambio)' : 'sin correo'}${v.celular ? ' · ' + _prvEsc(v.celular) : ''}</div></div>
          ${v.ya_es_suyo ? '<span class="rq-tag" style="color:var(--green);border-color:var(--green)">✓ ya es suyo</span>' : `<button class="rq-btn pri" onclick="_prvLigar('${rev.id}','${v.id}', ${v.correo ? 'true' : 'false'})">✓ Es esta persona</button>`}
        </div>`;
      }).join('') : (yaVe ? '' : '<div class="rq-nota">No encontramos a nadie parecido en ese evento. Búscala con el 🔎 buscador de clientes de Capsule: si existe, ponle este correo con ✏️ Corregir; si no es clienta, «No procede» con el motivo.</div>'));
    if (filas.length) cuerpo += `<div class="rq-nota" style="margin-top:10px">Los viajes de su correo:</div>` + filas.map((v, i) => _prvFilaHtml(rev, v, i)).join('');
  } else {
    cuerpo += `<div class="rq-nota">Se registró en el Portal con este correo y tiene ${filas.length === 1 ? 'un viaje' : filas.length + ' viajes'} en KameHouse. Los que falta decidir van arriba.</div>`
      + filas.map((v, i) => _prvFilaHtml(rev, v, i)).join('');
  }
  // El pie: UN paso principal según el estado; lo raro, discreto y a la derecha.
  const waBtn = wa.length === 10 ? `<a class="rq-btn wa" target="_blank" rel="noopener" href="https://wa.me/52${wa}">💬 WhatsApp</a>` : '';
  let pie;
  if (sinNada) {
    pie = `${waBtn}<span class="rq-sp"></span>
      <button class="rq-btn quiet" onclick="_prvResueltaAbrir('${rev.id}')">Cerrar sin ligar…</button>
      <button class="rq-btn dan" onclick="_prvRechazarAbrir('${rev.id}')">No procede</button>`;
  } else if (yaVe) {
    pie = `<button class="rq-btn pri" onclick="_prvCerrarAvisar('${rev.id}')">✓ Cerrar y avisarle por correo</button>${waBtn}<span class="rq-sp"></span>
      <button class="rq-btn quiet" onclick="_prvResueltaAbrir('${rev.id}')">Cerrar con nota…</button>`;
  } else {
    pie = `${rev.sin_revisar >= 2 ? `<button class="rq-btn pri" onclick="_prvPublicar('${rev.id}')">✓ Publicar los ${rev.sin_revisar} que faltan</button>` : ''}
      ${pasadosPend >= 2 ? `<button class="rq-btn" onclick="_prvPublicarPasados('${rev.id}')">📸 Publicar los ${pasadosPend} pasados como recuerdo</button>` : ''}
      ${waBtn}<span class="rq-sp"></span>
      <button class="rq-btn quiet" onclick="_prvResueltaAbrir('${rev.id}')">Ya quedó (cerrar con nota)…</button>
      <button class="rq-btn dan" onclick="_prvRechazarAbrir('${rev.id}')">No procede (todo)</button>`;
  }
  return `<div class="rq-cambio" id="prv-${rev.id}">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
      <div class="rq-name">${_prvEsc(rev.correo)}</div><span class="rq-tag">${ligar ? '🔗 No ve su viaje' : '🪪 Por publicar'}</span>
    </div>
    <div class="rq-ev">Pidió ${_prvEsc(_prvFecha(rev.creado_en))}${rev.sin_revisar ? ' · ' + rev.sin_revisar + ' sin revisar' : ''}</div>
    ${cuerpo}
    <details style="margin:10px 0 6px"><summary class="rq-nota" style="cursor:pointer">📝 Nota para la bitácora (opcional)</summary>
      <textarea id="prv-nota-${rev.id}" rows="2" placeholder="Qué revisaste o corregiste (queda en la bitácora; no le llega al cliente)" style="width:100%;margin:6px 0 0;font:inherit;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text)"></textarea></details>
    <div class="rq-linea">${pie}</div>
    <div id="prv-form-${rev.id}"></div>
  </div>`;
}

// [REQ-SIMPLE-1] «¿Qué dice el Excel?» compara SOLO a la persona de la tarjeta.
// Antes comparaba a todo el que se pareciera de nombre contra SUS números: un
// hermano salía «≠ KameHouse» y se leía como descuadre (caso Stephani/Jaime).
// Quién es ELLA lo decide el servidor (`es_ella`); los demás se listan aparte,
// sin compararse con nadie.
async function _prvExcel(revId, i) {
  const rev = _prvRows.find((x) => x.id === revId);
  const v = rev && rev.filas && rev.filas[i];
  const box = document.getElementById(`prv-excel-${revId}-${i}`);
  if (!v || !box) return;
  box.innerHTML = '<span style="color:var(--ts)">Leyendo el Excel de ese evento… (tarda unos segundos)</span>';
  const j = await _prvCall({ accion: 'excel', evento_id: v.evento_id, nombre: v.nombre }).catch((e) => ({ error: e.message }));
  if (!j || j.error) { box.innerHTML = `<span style="color:var(--red)">No se pudo leer el Excel: ${_prvEsc((j && j.error) || '')}</span>`; return; }
  if (!j.ok) { box.innerHTML = `<span style="color:var(--yellow)">El Excel no contestó: ${_prvEsc(j.motivo || '')}</span>`; return; }
  box.innerHTML = _prvExcelHtml(v, j.personas || []);
}
function _prvExcelHtml(v, personas) {
  if (!personas.length) return '<div class="rq-aviso ojo">No aparece en el Excel de ese evento con ese nombre.</div>';
  const c = v.cuenta || {};
  const ella = personas.filter((p) => p.es_ella);
  const otras = personas.filter((p) => !p.es_ella);
  const fuente = (p) => (p.fuentes ? ' <span style="color:var(--ts)">(' + _prvEsc([].concat(p.fuentes).join(' + ')) + ')</span>' : '');
  let h = ella.map((p) => {
    const roja = p.roja ? ' <b style="color:var(--red)">· fila ROJA en el Excel (cancelada)</b>' : '';
    const dT = (p.total != null && c.total != null && Math.round(p.total) !== Math.round(c.total));
    const dA = (p.abonado != null && c.abonado != null && Math.round(p.abonado) !== Math.round(c.abonado));
    if (c.total == null) return `<div class="rq-aviso ojo">El Excel dice de <b>${_prvEsc(p.nombre)}</b>: total <b>${_prvMxn(p.total)}</b> · pagado <b>${_prvMxn(p.abonado)}</b>${fuente(p)}${roja}. Aquí no tiene total: ponlo con ✏️ Corregir.</div>`;
    if (!dT && !dA) return `<div class="rq-aviso ok">✓ <b>Cuadra con el Excel</b>: total ${_prvMxn(p.total)} · pagado ${_prvMxn(p.abonado)}${fuente(p)}${roja}</div>`;
    const pista = dA ? (Math.round(p.abonado) > Math.round(c.abonado)
      ? ` El Excel trae ${_prvMxn(p.abonado - c.abonado)} MÁS de pagado: puede faltar capturar un abono (➕ Pago).`
      : ` Aquí hay ${_prvMxn(c.abonado - p.abonado)} MÁS de pagado que en el Excel: puede ser un pago que el Excel aún no tiene.`) : '';
    return `<div class="rq-aviso mal"><b>≠ No cuadra con el Excel.</b> Excel: total <b>${_prvMxn(p.total)}</b> · pagado <b>${_prvMxn(p.abonado)}</b>${fuente(p)} — KameHouse: total <b>${_prvMxn(c.total)}</b> · pagado <b>${_prvMxn(c.abonado)}</b>.${pista}${roja}</div>`;
  }).join('');
  if (!ella.length) h += '<div class="rq-aviso ojo">No hay una fila del Excel con su nombre exacto: no se puede comparar sola. Revisa abajo si alguna es ella con otro nombre.</div>';
  if (otras.length) {
    h += `<details style="margin-top:4px"><summary class="rq-nota" style="cursor:pointer">Otras personas del Excel con nombre parecido (${otras.length}) — no son ella, no se comparan</summary>`
      + otras.map((p) => `<div class="rq-nota">${_prvEsc(p.nombre)}: total ${_prvMxn(p.total)} · pagado ${_prvMxn(p.abonado)}${p.roja ? ' · fila roja' : ''}</div>`).join('') + '</details>';
  }
  return h;
}

async function _prvLigar(revId, viajeroId, traeCorreo) {
  let j = await _prvCall({ accion: 'ligar', id: revId, viajero_id: viajeroId });
  if (j && j._status === 409 && j.pide_reemplazar) {
    if (!confirm(`${j.error}\n\n¿Reemplazar el correo de esa fila por el de su cuenta del Portal?`)) return;
    j = await _prvCall({ accion: 'ligar', id: revId, viajero_id: viajeroId, reemplazar: true });
  }
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo ligar'), 'error'); return; }
  // [REQ-SIMPLE-1] El siguiente paso se DICE: si su viaje ya estaba publicado,
  // ya lo ve y solo falta cerrar; si no, falta publicarlo.
  showToast(j.sellada ? '✓ Ya es suyo y ya lo ve en su Portal. Toca «Cerrar y avisarle».' : '✓ Ya es suyo. Revisa sus números y toca «Publicar este».', 'success');
  loadRevisionesPortal();
}

async function _prvPublicar(revId) {
  const nota = (document.getElementById('prv-nota-' + revId) || {}).value || '';
  if (!confirm('¿Publicar? El cliente verá en su Portal estos números y le llega un correo de «ya puedes ver tu viaje».')) return;
  const j = await _prvCall({ accion: 'publicar', id: revId, nota });
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo publicar'), 'error'); return; }
  const co = j.correo || {};
  showToast(_prvEsc(`Publicado (${j.publicadas} viaje${j.publicadas === 1 ? '' : 's'}) · ${co.ok ? 'correo enviado' : 'el correo NO salió: ' + (co.aviso || '') + ' — avísale por WhatsApp'}` + _prvRolTxt(j.rol)), co.ok ? 'success' : 'warning');
  loadRevisionesPortal();
}

// [REQ-SIMPLE-1] Los viajes PASADOS de una persona, de un jalón: cada uno por su
// puerta de siempre (`fila_publicar`), uno tras otro. Se publican como recuerdo
// (sin dinero ni plan — PORTAL-RECUERDO-1). Si uno falla, se detiene y lo dice.
async function _prvPublicarPasados(revId) {
  const rev = _prvRows.find((x) => x.id === revId);
  const pend = ((rev && rev.filas) || []).filter((v) => !v.portal_revisado_at && !v.no_procede && v.evento_pasado);
  if (!pend.length) return;
  if (!confirm(`¿Publicar como recuerdo ${pend.length} viajes que ya pasaron? El cliente los verá en su Portal sin dinero ni plan.`)) return;
  let ok = 0, cierre = null;
  for (const v of pend) {
    const j = await _prvCall({ accion: 'fila_publicar', id: revId, viajero_id: v.id, nota: 'recuerdo (viaje pasado)' });
    if (!j || !j.ok) { showToast(_prvEsc(`Se publicaron ${ok} y se detuvo en ${v.evento_nombre || v.evento_id}: ${(j && j.error) || 'sin respuesta'}`), 'error'); loadRevisionesPortal(); return; }
    ok++; cierre = j.cierre || cierre;
  }
  showToast(`${ok} viajes pasados publicados como recuerdo` + (cierre && cierre.cerrada ? ' · ya no queda nada por revisar' : ` · ${(cierre && cierre.restantes) || 0} por revisar`), 'success');
  loadRevisionesPortal();
}

// [REQ-SIMPLE-1] «✓ Cerrar y avisarle»: su correo YA ve su viaje (todo
// publicado) — un clic, sin teclear nada. La nota de la bitácora la escribe el
// sistema con lo que vio.
async function _prvCerrarAvisar(revId) {
  const rev = _prvRows.find((x) => x.id === revId);
  const n = ((rev && rev.filas) || []).filter((v) => v.portal_revisado_at).length;
  const extra = ((document.getElementById('prv-nota-' + revId) || {}).value || '').trim();
  const j = await _prvCall({ accion: 'cerrar_resuelta', id: revId, avisar: true,
    nota: `Ya veía su viaje (${n} publicado${n === 1 ? '' : 's'})` + (extra ? ' · ' + extra : '') });
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo cerrar'), 'error'); return; }
  const co = j.correo || {};
  showToast(co.ok ? 'Cerrada · le llegó el correo de «ya puedes ver tu viaje»' : 'Cerrada, pero el correo NO salió: ' + _prvEsc(co.aviso || '') + ' — avísale por WhatsApp', co.ok ? 'success' : 'warning');
  loadRevisionesPortal();
}

function _prvRechazarAbrir(revId) {
  const box = document.getElementById('prv-form-' + revId);
  if (!box) return;
  if (box.dataset.abierto) { box.innerHTML = ''; box.dataset.abierto = ''; return; }
  box.dataset.abierto = '1';
  box.innerHTML = `<div class="rq-panel" style="margin:10px 0 0">
    <div style="font-size:12px;color:var(--ts);margin-bottom:6px">El motivo le llega <b>tal cual</b> al cliente por correo y en su Portal.</div>
    <textarea id="prv-motivo-${revId}" rows="2" placeholder="Ej.: No encontramos un viaje a tu nombre en ese evento; escríbenos por WhatsApp." style="width:100%;font:inherit;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text)"></textarea>
    <div style="margin-top:6px"><button class="rq-btn dan full" onclick="_prvRechazarGo('${revId}')">Enviar «No procede»</button></div>
  </div>`;
}

// [PRV-EDITA-1a] «✓ Ya quedó»: cierra el pendiente sin mandarle al cliente un
// «no procedió» que sería falso. La casilla de aviso nace PRENDIDA (palabra de
// Memo, 28-oct) y se apaga si ya se le habló por WhatsApp.
function _prvResueltaAbrir(revId) {
  const box = document.getElementById('prv-form-' + revId);
  if (!box) return;
  if (box.dataset.abierto === 'ok') { box.innerHTML = ''; box.dataset.abierto = ''; return; }
  box.dataset.abierto = 'ok';
  // [REQ-SIMPLE-1] Un «no veo mi viaje» cuyo correo sigue sin NINGÚN viaje: cerrar
  // aquí NO lo liga. Se dice antes del clic y el servidor lo exige (`sin_viaje`).
  const rev = _prvRows.find((x) => x.id === revId) || {};
  const sinNada = rev.tipo === 'ligar' && !(rev.filas || []).length;
  box.dataset.sinViaje = sinNada ? '1' : '';
  box.innerHTML = `<div class="rq-panel" style="margin:10px 0 0">
    ${sinNada ? '<div class="rq-aviso mal">⚠️ <b>Este correo sigue sin ningún viaje.</b> Si cierras así, el cliente va a seguir <b>sin ver nada</b> en su Portal (y casi siempre vuelve a pedirlo). Para dárselo, toca «✓ Es esta persona» en el parecido correcto. Cierra sin ligar solo si se resolvió por otro lado: se registró con otro correo, no era cliente, lo atendiste por WhatsApp.</div>' : ''}
    <div style="font-size:12px;color:var(--ts);margin-bottom:6px">Cierra el pendiente. Esta nota es <b>interna</b>: queda en la bitácora, no le llega al cliente.</div>
    <textarea id="prv-ok-nota-${revId}" rows="2" placeholder="${sinNada ? 'Ej.: Se registró con otro correo (el bueno es …) y ya ve su viaje ahí.' : 'Ej.: Ya se le movió su viaje a Vie+Sáb y se le avisó por WhatsApp.'}" style="width:100%;font:inherit;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text)"></textarea>
    ${sinNada ? '' : `<label style="display:flex;gap:8px;align-items:center;margin:8px 0;font-size:13px;cursor:pointer">
      <input type="checkbox" id="prv-ok-avisar-${revId}" checked>
      <span>Avisarle por correo que ya puede ver su viaje en el Portal</span>
    </label>`}
    <div style="margin-top:8px"><button class="rq-btn ${sinNada ? 'dan full' : 'full'}" onclick="_prvResueltaGo('${revId}')">${sinNada ? 'Cerrar SIN ligar (seguirá sin ver su viaje)' : '✓ Ya quedó'}</button></div>
  </div>`;
}

async function _prvResueltaGo(revId) {
  const nota = ((document.getElementById('prv-ok-nota-' + revId) || {}).value || '').trim();
  if (nota.length < 3) { showToast('Escribe qué pasó: queda en la bitácora', 'error'); return; }
  const box = document.getElementById('prv-form-' + revId);
  const sinViaje = !!(box && box.dataset.sinViaje === '1');
  const avisar = sinViaje ? false : !!((document.getElementById('prv-ok-avisar-' + revId) || {}).checked);
  const j = await _prvCall(Object.assign({ accion: 'cerrar_resuelta', id: revId, nota, avisar }, sinViaje ? { sin_viaje: true } : {}));
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo cerrar'), 'error'); if (j && j.pide_confirmar_sin_viaje) loadRevisionesPortal(); return; }
  const co = j.correo || {};
  // Los estados se DICEN distinto: cerrada sin ligar, cerrada+avisada, cerrada
  // sin avisar a propósito, y cerrada pero el correo no salió (hablarle a mano).
  if (sinViaje) showToast('Cerrada SIN ligar: ese correo sigue sin ver ningún viaje', 'warning');
  else if (!avisar) showToast('Cerrada · sin correo, como pediste', 'success');
  else if (co.ok) showToast('Cerrada · correo enviado', 'success');
  else showToast('Cerrada, pero el correo NO salió: ' + _prvEsc(co.aviso || '') + ' — avísale por WhatsApp', 'warning');
  loadRevisionesPortal();
}

async function _prvRechazarGo(revId) {
  const motivo = ((document.getElementById('prv-motivo-' + revId) || {}).value || '').trim();
  if (motivo.length < 3) { showToast('Escribe el motivo', 'error'); return; }
  const j = await _prvCall({ accion: 'rechazar', id: revId, motivo });
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo cerrar'), 'error'); return; }
  const co = j.correo || {};
  showToast('Cerrada · ' + (co.ok ? 'correo enviado' : 'el correo NO salió: ' + (co.aviso || '')), co.ok ? 'success' : 'warning');
  loadRevisionesPortal();
}

// ── Revisar por ADELANTADO desde «Viajeros del evento» ───────────────────────
// Marca con la casilla y aprieta: quedan publicadas para cuando entren (sin
// correo: todavía no se han registrado). Queda en la bitácora.
function prvChip(v) {
  if (!v || !('portal_revisado_at' in v)) return '';
  // [PRV-EQUIPO-1] Un tour que trabaja (coordinador/staff) no va al Portal: sin chip.
  if (v.usuario_id || ['coordinador', 'mister_popo', 'maestro_roshi', 'bulma', 'milk', 'cc'].includes(String(v.tipo_viajero || '').toLowerCase())) return '';
  return v.portal_revisado_at
    ? `<span class="vj2-tag" style="color:var(--green);border-color:var(--green)" title="Revisado para el Portal · ${_prvEsc(v.portal_revisado_por || '')}">🪪 Portal ✓</span>`
    : '<span class="vj2-tag" style="color:var(--ts)" title="Aún nadie revisa sus números: si entra al Portal, verá «estamos revisando tu viaje»">🪪 sin revisar</span>';
}
async function vjPortalAdelanto() {
  const ids = Array.from(document.querySelectorAll('.vj-grp-chk:checked')).map((x) => x.value);
  if (!ids.length) { showToast('Marca con la casilla a quienes ya revisaste', 'warning'); return; }
  const nota = prompt(`¿Qué revisaste de ${ids.length === 1 ? 'esta persona' : 'estas ' + ids.length + ' personas'}? (queda en la bitácora; puedes dejarlo vacío)`, '');
  if (nota === null) return;
  const j = await _prvCall({ accion: 'adelanto', viajero_ids: ids, nota });
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo marcar'), 'error'); return; }
  showToast(j.ya ? 'Esas ya estaban revisadas' : _prvEsc(`${j.publicadas} revisada${j.publicadas === 1 ? '' : 's'} para el Portal${j.bitacora_error ? ' · ' + j.bitacora_error : ''}` + _prvRolTxt(j.rol)), j.bitacora_error ? 'warning' : 'success');
  try { await _vj2Cargar(); } catch (_) {}
}
