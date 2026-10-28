/* =============================================================================
 * kamehouse-portal-revision.js — [PORTAL-SOLO-1] la bandeja «Portal» (27-oct-2026)
 *
 * Palabra de Memo: «antes que se registrara bulma milk o yo podamos revisar su
 * caso para darle la información correcta de su tour … una pequeña revisión
 * manual … lo que se guarde en la revisión manual tú la puedes utilizar».
 *
 * Vive ARRIBA de la bandeja de requisiciones. Dos clases de tarjeta:
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

function _prvCaja() {
  const lista = document.getElementById('req-bdj-lista');
  if (!lista) return null;
  let box = document.getElementById('req-portal');
  if (!box) {
    box = document.createElement('div'); box.id = 'req-portal';
    const ancla = document.getElementById('req-cambios') || lista;
    ancla.parentNode.insertBefore(box, ancla);
  }
  return box;
}

async function loadRevisionesPortal() {
  const box = _prvCaja();
  if (!box) return;
  const j = await _prvCall({ accion: 'listar' }).catch((e) => ({ error: e.message }));
  if (!j || !j.ok) {
    box.innerHTML = `<div style="color:var(--red);font-size:12px;margin-bottom:10px">No se pudieron leer las revisiones del Portal: ${_prvEsc((j && j.error) || 'sin respuesta')}</div>`;
    return;
  }
  _prvRows = j.pendientes || [];
  const rec = j.recientes || [];
  const bit = rec.length ? `<details class="prv-bit" style="margin:0 0 14px"><summary style="cursor:pointer;font-size:12px;color:var(--ts)">📒 Bitácora del Portal · últimas ${rec.length}</summary>${rec.map(_prvBitFila).join('')}</details>` : '';
  if (!_prvRows.length) { box.innerHTML = bit; return; }
  box.innerHTML = `<div class="rq-section">Portal: revisar antes de que el cliente vea su viaje <span class="rq-pill pend">${_prvRows.length}</span></div>`
    + `<div style="font-size:12px;color:var(--ts);margin:-4px 0 10px">El cliente NO ve un viaje hasta que aquí se publique. Ve viaje por viaje: corrígelo aquí mismo (<b>✏️ Editar</b> · <b>➕ Pago</b>) y <b>publícalo</b> o márcalo <b>no procede</b>.</div>`
    + _prvRows.map(_prvCard).join('') + bit;
}

function _prvBitFila(r) {
  const suma = (arr, k) => (arr || []).reduce((s, x) => s + (Number(x && x[k]) || 0), 0);
  const a = suma(r.antes, 'abonado'), d = suma(r.despues, 'abonado');
  const ta = suma(r.antes, 'total'), td = suma(r.despues, 'total');
  const cambio = (a !== d || ta !== td) ? ` · <span style="color:var(--yellow)">total ${_prvMxn(ta)}→${_prvMxn(td)} · pagado ${_prvMxn(a)}→${_prvMxn(d)}</span>` : '';
  const est = r.estado === 'publicada' ? '<span style="color:var(--green)">publicada</span>' : '<span style="color:var(--red)">no procede</span>';
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
  const dinero = c.total == null
    // [PRV-SINTOTAL-1] Sin total, saldoMigrado no cuenta (un cero sería falso):
    // se DICE que falta y se enseña lo pagado.
    ? `<div style="font-size:13px;color:var(--yellow)">⚠️ <b>Sin total de contrato</b> — ponlo con ✏️ Editar antes de publicar. Pagado hasta hoy: <b style="color:var(--green)">${_prvMxn(pagadoSinTotal)}</b></div>`
    : `<div style="font-size:13px">Total <b>${_prvMxn(c.total)}</b> · Pagado <b style="color:var(--green)">${_prvMxn(c.abonado)}</b> · Resta <b>${_prvMxn(c.resta)}</b>${Number(v.abonado_previo) ? ` <span style="color:var(--ts)">(incluye ${_prvMxn(v.abonado_previo)} pagado antes del sistema)</span>` : ''}</div>`;
  const k = `${rev.id}-${i}`;
  const acciones = decidida
    ? (np ? `<div style="font-size:12px;color:var(--ts);margin-top:6px">Motivo: ${_prvEsc(np)}</div>` : '')
    : `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        <button class="rq-btn" onclick="_prvEditarAbrir('${rev.id}', ${i})">✏️ Editar</button>
        <button class="rq-btn" onclick="_prvAbonoAbrir('${rev.id}', ${i})">➕ Pago</button>
        <button class="rq-btn" onclick="_prvExcel('${rev.id}', ${i})">📊 Excel</button>
        <button class="rq-btn pri" onclick="_prvFilaPublicar('${rev.id}', ${i})">✓ Publicar este</button>
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
      <div style="grid-column:1/-1"><label style="${_prvLb}">Pagado ANTES del sistema ($, lo que traía el Excel)</label><input id="pe-pre-${revId}-${i}" inputmode="decimal" style="${_prvIn}" value="${v.abonado_previo == null ? '' : _prvEsc(v.abonado_previo)}" placeholder="0"></div>
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
    showToast(`Listo: ya no queda nada por revisar · ${co.ok ? 'le llegó el correo' : 'el correo NO salió: ' + (co.aviso || '') + ' — avísale por WhatsApp'}`, co.ok ? 'success' : 'warning');
  } else showToast(`Publicado · ${ci.restantes || 0} por revisar`, 'success');
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

function _prvCard(rev) {
  const ligar = rev.tipo === 'ligar';
  const tag = ligar ? '🔗 Ligar Portal: no ve su viaje' : '🪪 Revisar antes del Portal';
  const ev = rev.evento ? `${_prvEsc(rev.evento.nombre)}${rev.evento.fecha ? ' (' + _prvEsc(rev.evento.fecha) + ')' : ''}` : '';
  const wa = String(rev.celular || '').replace(/\D/g, '');
  let cuerpo = '';
  if (ligar) {
    const cands = rev.candidatos || [];
    cuerpo += `<div style="font-size:13px;margin:6px 0">Dice que es <b>${_prvEsc(rev.nombre_dado)}</b> en <b>${ev}</b>${wa ? ' · WA ' + _prvEsc(wa) : ''}</div>`
      + (rev.nota_cliente ? `<q>${_prvEsc(rev.nota_cliente)}</q>` : '')
      + `<div style="font-size:12px;color:var(--ts);margin:8px 0 2px">Parecidos en ese evento:</div>`
      + (rev.candidatos_error ? `<div style="color:var(--red);font-size:12px">${_prvEsc(rev.candidatos_error)}</div>` : '')
      + (cands.length ? cands.map((v) => {
        const c = v.cuenta || {};
        return `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--border);padding:6px 0;font-size:13px">
          <div><b>${_prvEsc(v.nombre)}</b> · ${_prvEsc(v.evento_fecha || v.evento_id)} · ${_prvEsc([String(v.tipo_paquete || '').toUpperCase(), v.zona_boleto].filter(Boolean).join(' · '))} · total ${_prvMxn(c.total)} · pagado ${_prvMxn(c.abonado)}
            ${v.mismo_celular ? ' <span class="rq-tag" style="color:var(--green);border-color:var(--green)">mismo WhatsApp</span>' : ''}
            <div style="font-size:11px;color:var(--ts)">${v.correo ? 'correo actual: ' + _prvEsc(v.correo) : 'sin correo'}${v.celular ? ' · ' + _prvEsc(v.celular) : ''}</div></div>
          ${v.ya_es_suyo ? '<span class="rq-tag" style="color:var(--green);border-color:var(--green)">✓ ligada</span>' : `<button class="rq-btn" onclick="_prvLigar('${rev.id}','${v.id}', ${v.correo ? 'true' : 'false'})">Es esta persona</button>`}
        </div>`;
      }).join('') : '<div style="font-size:12px;color:var(--ts)">No encontramos a nadie parecido. Búscala en «Viajeros del evento»; si no existe, «No procede» con el motivo.</div>');
    if ((rev.filas || []).length) cuerpo += `<div style="font-size:12px;color:var(--ts);margin:10px 0 0">Ya ligado a su cuenta:</div>` + rev.filas.map((v, i) => _prvFilaHtml(rev, v, i)).join('');
  } else {
    cuerpo += `<div style="font-size:12px;color:var(--ts);margin:6px 0">Se registró en el Portal con este correo. Ve viaje por viaje: corrígelo (✏️ / ➕) y luego <b>Publicar este</b> o <b>No procede</b>. Cuando no quede ninguno, le llega UN correo.</div>`
      + (rev.filas || []).map((v, i) => _prvFilaHtml(rev, v, i)).join('');
  }
  return `<div class="rq-cambio" id="prv-${rev.id}">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
      <div class="rq-name">${_prvEsc(rev.correo)}</div><span class="rq-tag">${tag}</span>
    </div>
    <div class="rq-ev">Pidió ${_prvEsc(_prvFecha(rev.creado_en))}${rev.sin_revisar ? ' · ' + rev.sin_revisar + ' sin revisar' : ''}</div>
    ${cuerpo}
    <textarea id="prv-nota-${rev.id}" rows="2" placeholder="Nota para la bitácora (opcional): qué revisaste o corregiste" style="width:100%;margin:10px 0 6px;font:inherit;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text)"></textarea>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${wa.length === 10 ? `<a class="rq-btn wa" target="_blank" rel="noopener" href="https://wa.me/52${wa}">💬 WhatsApp</a>` : ''}
      ${rev.sin_revisar ? `<button class="rq-btn" onclick="_prvPublicar('${rev.id}')">✓ Publicar las ${rev.sin_revisar} que faltan</button>` : ''}
      <button class="rq-btn" onclick="_prvResueltaAbrir('${rev.id}')">✓ Ya quedó</button>
      <button class="rq-btn dan" onclick="_prvRechazarAbrir('${rev.id}')">No procede (todo)</button>
    </div>
    <div style="font-size:11px;color:var(--ts);margin-top:6px">
      <b>✓ Ya quedó</b> cierra el pendiente sin decirle que no procedió — para cuando se resolvió por WhatsApp o su viaje ya estaba bien.
    </div>
    <div id="prv-form-${rev.id}"></div>
  </div>`;
}

async function _prvExcel(revId, i) {
  const rev = _prvRows.find((x) => x.id === revId);
  const v = rev && rev.filas && rev.filas[i];
  const box = document.getElementById(`prv-excel-${revId}-${i}`);
  if (!v || !box) return;
  box.innerHTML = '<span style="color:var(--ts)">Leyendo el Excel de ese evento… (tarda unos segundos)</span>';
  const j = await _prvCall({ accion: 'excel', evento_id: v.evento_id, nombre: v.nombre }).catch((e) => ({ error: e.message }));
  if (!j || j.error) { box.innerHTML = `<span style="color:var(--red)">No se pudo leer el Excel: ${_prvEsc((j && j.error) || '')}</span>`; return; }
  if (!j.ok) { box.innerHTML = `<span style="color:var(--yellow)">El Excel no contestó: ${_prvEsc(j.motivo || '')}</span>`; return; }
  if (!(j.personas || []).length) { box.innerHTML = '<span style="color:var(--yellow)">No aparece en el Excel de ese evento con ese nombre.</span>'; return; }
  const c = v.cuenta || {};
  box.innerHTML = j.personas.map((p) => {
    const dT = (p.total != null && c.total != null && Math.round(p.total) !== Math.round(c.total));
    const dA = (p.abonado != null && c.abonado != null && Math.round(p.abonado) !== Math.round(c.abonado));
    const col = (d) => d ? 'var(--red)' : 'var(--green)';
    return `<div style="padding:4px 0">Excel · <b>${_prvEsc(p.nombre)}</b>${p.roja ? ' <span style="color:var(--red)">fila ROJA (cancelada)</span>' : ''}: `
      + `total <b style="color:${col(dT)}">${_prvMxn(p.total)}</b> · pagado <b style="color:${col(dA)}">${_prvMxn(p.abonado)}</b>`
      + `${(dT || dA) ? ' <span style="color:var(--red)">≠ KameHouse</span>' : ' <span style="color:var(--green)">✓ cuadra</span>'}`
      + `${p.fuentes ? ' <span style="color:var(--ts)">(' + _prvEsc([].concat(p.fuentes).join(' + ')) + ')</span>' : ''}</div>`;
  }).join('');
}

async function _prvLigar(revId, viajeroId, traeCorreo) {
  let j = await _prvCall({ accion: 'ligar', id: revId, viajero_id: viajeroId });
  if (j && j._status === 409 && j.pide_reemplazar) {
    if (!confirm(`${j.error}\n\n¿Reemplazar el correo de esa fila por el de su cuenta del Portal?`)) return;
    j = await _prvCall({ accion: 'ligar', id: revId, viajero_id: viajeroId, reemplazar: true });
  }
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo ligar'), 'error'); return; }
  showToast('Ligada a su cuenta. Revisa sus números y publica.', 'success');
  loadRevisionesPortal();
}

async function _prvPublicar(revId) {
  const nota = (document.getElementById('prv-nota-' + revId) || {}).value || '';
  if (!confirm('¿Publicar? El cliente verá en su Portal estos números y le llega un correo de «ya puedes ver tu viaje».')) return;
  const j = await _prvCall({ accion: 'publicar', id: revId, nota });
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo publicar'), 'error'); return; }
  const co = j.correo || {};
  showToast(`Publicado (${j.publicadas} fila${j.publicadas === 1 ? '' : 's'}) · ${co.ok ? 'correo enviado' : 'el correo NO salió: ' + (co.aviso || '') + ' — avísale por WhatsApp'}`, co.ok ? 'success' : 'warning');
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
  box.innerHTML = `<div class="rq-panel" style="margin:10px 0 0">
    <div style="font-size:12px;color:var(--ts);margin-bottom:6px">Cierra el pendiente. Esta nota es <b>interna</b>: queda en la bitácora, no le llega al cliente.</div>
    <textarea id="prv-ok-nota-${revId}" rows="2" placeholder="Ej.: Ya se le movió su viaje a Vie+Sáb y se le avisó por WhatsApp." style="width:100%;font:inherit;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text)"></textarea>
    <label style="display:flex;gap:8px;align-items:center;margin:8px 0;font-size:13px;cursor:pointer">
      <input type="checkbox" id="prv-ok-avisar-${revId}" checked>
      <span>Avisarle por correo que ya puede ver su viaje en el Portal</span>
    </label>
    <div><button class="rq-btn full" onclick="_prvResueltaGo('${revId}')">✓ Ya quedó</button></div>
  </div>`;
}

async function _prvResueltaGo(revId) {
  const nota = ((document.getElementById('prv-ok-nota-' + revId) || {}).value || '').trim();
  if (nota.length < 3) { showToast('Escribe qué pasó: queda en la bitácora', 'error'); return; }
  const avisar = !!((document.getElementById('prv-ok-avisar-' + revId) || {}).checked);
  const j = await _prvCall({ accion: 'cerrar_resuelta', id: revId, nota, avisar });
  if (!j || !j.ok) { showToast(_prvEsc((j && j.error) || 'No se pudo cerrar'), 'error'); return; }
  const co = j.correo || {};
  // Los tres estados se DICEN distinto: cerrada+avisada, cerrada sin avisar a
  // propósito, y cerrada pero el correo no salió (ahí hay que hablarle a mano).
  if (!avisar) showToast('Cerrada · sin correo, como pediste', 'success');
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
  showToast(j.ya ? 'Esas ya estaban revisadas' : `${j.publicadas} revisada${j.publicadas === 1 ? '' : 's'} para el Portal${j.bitacora_error ? ' · ' + j.bitacora_error : ''}`, j.bitacora_error ? 'warning' : 'success');
  try { await _vj2Cargar(); } catch (_) {}
}
