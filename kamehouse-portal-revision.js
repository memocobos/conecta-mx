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
    + `<div style="font-size:12px;color:var(--ts);margin:-4px 0 10px">El cliente NO ve nada hasta que aquí se publique. Si un número está mal, corrígelo en <b>Viajeros del evento</b> (➕ Abono / editar) y luego publica.</div>`
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

function _prvFilaHtml(rev, v, i) {
  const c = v.cuenta || {};
  const sello = v.portal_revisado_at ? '<span class="rq-tag" style="color:var(--green);border-color:var(--green)">✓ ya publicada</span>' : '<span class="rq-tag" style="color:var(--yellow);border-color:var(--yellow)">sin revisar</span>';
  const abonos = (v.abonos_lista || []).map((a) => `<div>${_prvEsc(a.fecha || '—')} · <b>${_prvMxn(a.monto)}</b>${a.nota ? ' · <span style="color:var(--ts)">' + _prvEsc(String(a.nota).slice(0, 90)) + '</span>' : ''}</div>`).join('') || '<div style="color:var(--ts)">Sin abonos capturados</div>';
  return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin:8px 0">
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline">
      <div><b>${_prvEsc(v.nombre || '—')}</b> · ${_prvEsc(v.evento_nombre || v.evento_id)}${v.evento_fecha ? ' <span style="color:var(--ts)">(' + _prvEsc(v.evento_fecha) + ')</span>' : ''}</div>${sello}
    </div>
    <div style="font-size:13px;margin:4px 0">${_prvEsc([String(v.tipo_paquete || '').toUpperCase(), v.zona_boleto, Number(v.boletos) > 1 ? v.boletos + ' lugares' : ''].filter(Boolean).join(' · ') || '—')}</div>
    <div style="font-size:13px">Total <b>${_prvMxn(c.total)}</b> · Pagado <b style="color:var(--green)">${_prvMxn(c.abonado)}</b> · Resta <b>${_prvMxn(c.resta)}</b>${Number(v.abonado_previo) ? ` <span style="color:var(--ts)">(incluye ${_prvMxn(v.abonado_previo)} de antes)</span>` : ''}</div>
    <details style="margin-top:6px;font-size:12px"><summary style="cursor:pointer;color:var(--ts)">Abonos (${(v.abonos_lista || []).length})</summary>${abonos}</details>
    <div style="margin-top:8px"><button class="rq-btn" onclick="_prvExcel('${rev.id}', ${i})">📊 Ver qué dice el Excel</button></div>
    <div id="prv-excel-${rev.id}-${i}" style="font-size:12px;margin-top:6px"></div>
  </div>`;
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
    cuerpo += `<div style="font-size:12px;color:var(--ts);margin:6px 0">Se registró en el Portal con este correo. Revisa que cada número esté bien antes de publicar.</div>`
      + (rev.filas || []).map((v, i) => _prvFilaHtml(rev, v, i)).join('');
  }
  return `<div class="rq-cambio" id="prv-${rev.id}">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap">
      <div class="rq-name">${_prvEsc(rev.correo)}</div><span class="rq-tag">${tag}</span>
    </div>
    <div class="rq-ev">Pidió ${_prvEsc(_prvFecha(rev.creado_en))}${rev.sin_revisar ? ' · ' + rev.sin_revisar + ' sin revisar' : ''}</div>
    ${cuerpo}
    <textarea id="prv-nota-${rev.id}" rows="2" placeholder="¿Qué revisaste o corregiste? (queda en la bitácora: pago faltante, pago de más, zona, etc.)" style="width:100%;margin:10px 0 6px;font:inherit;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text)"></textarea>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${wa.length === 10 ? `<a class="rq-btn wa" target="_blank" rel="noopener" href="https://wa.me/52${wa}">💬 WhatsApp</a>` : ''}
      <button class="rq-btn pri" onclick="_prvPublicar('${rev.id}')">✓ Revisado, publicar</button>
      <button class="rq-btn dan" onclick="_prvRechazarAbrir('${rev.id}')">No procede</button>
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
