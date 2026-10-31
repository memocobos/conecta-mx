// =============================================================================
// kamehouse-cotizador.js — [COTIZA-VEND-1 · 30-oct-2026] 🧮 EL COTIZADOR DE VENDEDOR
// =============================================================================
// Bulma, Milk y Memo cotizan con lo que el index vende HOY (zonas, habitaciones,
// la Nube de CDMX) y le mandan al cliente una IMAGEN con su paquete y su rol de
// quincenas. 🔒 Esta pantalla NO calcula un peso: pinta lo que contesta
// `admin-cotizador`, que se lo pregunta a los dueños de siempre. /rol sigue
// vivo por su link; ya no es la herramienta de trabajo.
// =============================================================================

const _ct = { eventos: null, op: null, paquete: '', ultima: null };
const _ctEl = (id) => document.getElementById(id);
const _ctEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _ctMoney = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
const _CT_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function _ctFecha(ds) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ds || '')); return m ? (Number(m[3]) + ' ' + _CT_MES[Number(m[2]) - 1] + ' ' + m[1]) : ''; }

async function _ctPost(body) {
  const r = await khAdminFetch('/.netlify/functions/admin-cotizador', { method: 'POST', body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (_) {}
  if (!r.ok || !j.ok) throw new Error(j.error || ('Error ' + r.status));
  return j;
}

async function loadCotizador() {
  const sel = _ctEl('ct-evento');
  if (!sel) return;
  if (_ct.eventos) return;
  sel.innerHTML = '<option value="">cargando eventos…</option>';
  try {
    const j = await _ctPost({ accion: 'eventos' });
    _ct.eventos = j.eventos || [];
    sel.innerHTML = '<option value="">— elige el evento —</option>' + _ct.eventos.map((e) => {
      const d = (e.fechas[0] || {}).ds;
      return `<option value="${_ctEsc(e.id)}">${_ctEsc(e.nombre)}${d ? ' · ' + _ctEsc(_ctFecha(d)) : ''}${e.cdmx ? ' · CDMX' : ''}${e.st === 'agotado' ? ' · agotado' : ''}</option>`;
    }).join('');
  } catch (e) {
    _ct.eventos = null;
    sel.innerHTML = '<option value="">(no se pudo leer el catálogo — recarga)</option>';
    showToast(e.message, 'error');
  }
}

function ctEventoCambia() {
  const id = (_ctEl('ct-evento') || {}).value || '';
  const ev = (_ct.eventos || []).find((e) => e.id === id);
  const fsel = _ctEl('ct-fecha'), fw = _ctEl('ct-fecha-wrap');
  _ct.op = null; _ct.paquete = ''; _ctLimpiarResultado(); _ctPintarOpciones();
  if (!ev) { fw.style.display = 'none'; return; }
  if (ev.fechas.length > 1 || /#\d+$/.test(ev.fechas[0].evento_id)) {
    fw.style.display = '';
    fsel.innerHTML = '<option value="">— elige la fecha —</option>' + ev.fechas.map((f) => `<option value="${_ctEsc(f.evento_id)}">${_ctEsc(f.lbl)}${f.ds ? ' · ' + _ctEsc(_ctFecha(f.ds)) : ''}</option>`).join('');
    if (ev.fechas.length === 1) { fsel.value = ev.fechas[0].evento_id; ctFechaCambia(); }
  } else {
    fw.style.display = 'none';
    _ctCargarOpciones(ev.fechas[0].evento_id);
  }
}
function ctFechaCambia() {
  const v = (_ctEl('ct-fecha') || {}).value || '';
  _ct.op = null; _ct.paquete = ''; _ctLimpiarResultado(); _ctPintarOpciones();
  if (v) _ctCargarOpciones(v);
}

async function _ctCargarOpciones(eventoId) {
  const box = _ctEl('ct-opciones');
  box.innerHTML = '<div style="color:var(--muted);padding:8px 0">Leyendo lo que vende el sitio…</div>';
  try {
    _ct.op = await _ctPost({ accion: 'opciones', evento_id: eventoId });
  } catch (e) {
    _ct.op = null;
    box.innerHTML = `<div class="err-box">${_ctEsc(e.message)}</div>`;
    return;
  }
  _ctPintarOpciones();
}

function _ctPintarOpciones() {
  const box = _ctEl('ct-opciones');
  if (!box) return;
  const op = _ct.op;
  if (!op) { if (!box.querySelector('.err-box')) box.innerHTML = ''; return; }
  const per = Number((_ctEl('ct-personas') || {}).value) || 1;
  const chips = op.paquetes.map((p) => `<button type="button" class="btn ${_ct.paquete === p.paquete ? 'btn-primary' : 'btn-ghost'}" style="margin:0 6px 6px 0" onclick="ctPaquete('${p.paquete}')">${_ctEsc(p.nombre)}</button>`).join('');
  const p = op.paquetes.find((x) => x.paquete === _ct.paquete);
  let det = '';
  if (p) {
    if (p.zonas) {
      det += `<div class="form-group"><label>Zona (precio de lista por persona)</label><select id="ct-zona" class="cot-input" onchange="_ctLimpiarResultado()"><option value="">— elige la zona —</option>${p.zonas.map((z) => `<option value="${_ctEsc(z.zona)}">${_ctEsc(z.zona)} · ${_ctMoney(z.precio)}</option>`).join('')}</select></div>`;
    } else if (p.precio) {
      det += `<div style="color:var(--muted);margin-bottom:8px">Precio de lista: ${_ctMoney(p.precio)} por persona</div>`;
    }
    if (p.paquete !== 'cheap' && op.hoteles && op.hoteles.length) {
      const habs = op.hoteles.filter((h) => !h.viaj || h.viaj.includes(per));
      det += `<div class="form-group"><label>Habitación</label><select id="ct-hotel" class="cot-input" onchange="_ctLimpiarResultado()"><option value="">— elige la habitación —</option>${habs.map((h) => `<option value="${_ctEsc(h.nombre)}">${_ctEsc(h.nombre)}${h.extra ? ' · +' + _ctMoney(h.extra) + (op.hotel_pp ? ' pp' : '') : ''}</option>`).join('')}</select>${habs.length < op.hoteles.length ? '<div style="font-size:12px;color:var(--muted);margin-top:4px">Solo salen las habitaciones que valen para ' + per + (per === 1 ? ' persona' : ' personas') + '.</div>' : ''}</div>`;
    }
    if (op.evento.cdmx && p.paquete !== 'cheap') {
      const n = op.nube || {};
      const o = (m, lbl) => n[m] ? `<option value="${m}">${lbl} · ${_ctMoney(n[m].precio)} pp${n[m].heredado ? ' (tarifa general)' : ''}</option>` : `<option value="${m}" disabled>${lbl} · sin cotización vigente</option>`;
      det += `<div class="form-group"><label>Transporte a CDMX</label><select id="ct-trans" class="cot-input" onchange="ctTransCambia()"><option value="">— elige el transporte —</option>${o('bus', '🚌 Autobús')}${o('avion', '✈️ Avión')}<option value="manual">✍️ Monto manual</option><option value="ninguno">Sin transporte</option></select>
        <input id="ct-trans-monto" class="cot-input" type="number" min="1" placeholder="Transporte por persona" style="display:none;margin-top:6px" oninput="_ctLimpiarResultado()">
        ${n.error ? '<div style="font-size:12px;color:var(--gold);margin-top:4px">La Nube no se pudo leer: ' + _ctEsc(n.error) + '. Usa «monto manual».</div>' : ''}
        ${!n.bus || !n.avion ? '<div style="font-size:12px;color:var(--muted);margin-top:4px">Lo que no tenga cotización vigente se captura en Nube voladora.</div>' : ''}</div>`;
    }
    det += `<button class="btn btn-primary" onclick="ctCotizar()">🧮 Cotizar</button>`;
  }
  box.innerHTML = `<div style="margin:6px 0 10px;color:var(--muted);font-size:13px">${_ctEsc(op.evento.nombre)} · ${_ctEsc(op.evento.fecha || _ctFecha(op.evento.ds))}${op.evento.venue ? ' · ' + _ctEsc(op.evento.venue) : ''}${op.dias_al_evento != null ? ' · faltan ' + op.dias_al_evento + ' días' : ''}</div>
    <div style="margin-bottom:6px">${chips}</div>${det}`;
}

function ctPaquete(p) { _ct.paquete = p; _ctLimpiarResultado(); _ctPintarOpciones(); }
function ctPersonasCambia() { _ctLimpiarResultado(); if (_ct.op && _ct.paquete) _ctPintarOpciones(); }
function ctTransCambia() {
  const v = (_ctEl('ct-trans') || {}).value;
  const m = _ctEl('ct-trans-monto'); if (m) m.style.display = v === 'manual' ? '' : 'none';
  _ctLimpiarResultado();
}
function _ctLimpiarResultado() { _ct.ultima = null; const r = _ctEl('ct-resultado'); if (r) r.innerHTML = ''; }

async function ctCotizar() {
  const op = _ct.op; if (!op || !_ct.paquete) return;
  const body = {
    accion: 'cotizar', evento_id: op.evento.evento_id, paquete: _ct.paquete,
    personas: Number((_ctEl('ct-personas') || {}).value),
    zona: (_ctEl('ct-zona') || {}).value || undefined,
    hotel: (_ctEl('ct-hotel') || {}).value || undefined,
    transporte: (_ctEl('ct-trans') || {}).value || undefined,
    transporte_monto: (_ctEl('ct-trans-monto') || {}).value || undefined,
  };
  const out = _ctEl('ct-resultado');
  out.innerHTML = '<div style="color:var(--muted)">Cotizando…</div>';
  try {
    const j = await _ctPost(body);
    _ct.ultima = j;
    out.innerHTML = _ctResultadoHtml(j);
  } catch (e) {
    out.innerHTML = `<div class="err-box">${_ctEsc(e.message)}</div>`;
  }
}

// Las líneas del rol: el separo primero y luego lo que mande el plan.
function _ctLineasRol(j) {
  const c = j.cotizacion, pl = j.plan || {};
  const l = [{ lbl: 'Separo (para apartar)', fecha: 'hoy', monto: c.separo, sep: true }];
  if (pl.estado === 'calendario' || pl.estado === 'liquidar') (pl.cuotas || []).forEach((q) => l.push({ lbl: 'Pago ' + q.n, fecha: q.lbl, monto: q.monto }));
  return l;
}
function _ctPlanNota(pl) {
  if (!pl) return '';
  if (pl.estado === 'liquidar') return 'Ya no caben quincenas: el resto se liquida antes del evento.';
  if (pl.estado === 'liquidado') return 'El separo cubre el total.';
  if (pl.estado === 'sin_fecha') return 'El catálogo no trae la fecha: el rol se arma al confirmar.';
  if (pl.estado === 'evento_pasado') return 'La fecha ya pasó.';
  return '';
}

function _ctResultadoHtml(j) {
  const c = j.cotizacion;
  const filas = _ctLineasRol(j).map((x) => `<tr><td>${_ctEsc(x.lbl)}</td><td>${_ctEsc(x.fecha)}</td><td style="text-align:right;font-weight:700">${_ctMoney(x.monto)}</td></tr>`).join('');
  const t = c.transporte;
  return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:16px;margin-top:14px">
    <div style="font-weight:800;font-size:18px">${_ctEsc(c.evento.nombre)}</div>
    <div style="color:var(--muted);font-size:13px;margin-bottom:10px">${_ctEsc(c.evento.fecha || _ctFecha(c.evento.ds))}${c.evento.venue ? ' · ' + _ctEsc(c.evento.venue) : ''}</div>
    <div>${_ctEsc(c.paquete_nombre)}${c.zona ? ' · ' + _ctEsc(c.zona) : ''}${c.hotel ? ' · ' + _ctEsc(c.hotel) : ''} · ${c.personas} ${c.personas === 1 ? 'persona' : 'personas'}</div>
    ${t ? `<div style="font-size:13px;color:var(--muted)">Transporte: ${t.modo === 'ninguno' ? 'no incluido' : _ctMoney(t.precio) + ' por persona (' + _ctEsc(t.fuente) + ')'}${t.horarios ? ' · ' + _ctEsc(t.horarios) : ''}</div>` : ''}
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin:12px 0">
      <div><div style="font-size:12px;color:var(--muted)">Por persona</div><div style="font-size:20px;font-weight:800">${_ctMoney(c.precio_unit)}</div></div>
      <div><div style="font-size:12px;color:var(--muted)">Total</div><div style="font-size:20px;font-weight:800">${_ctMoney(c.total)}</div></div>
      <div><div style="font-size:12px;color:var(--muted)">Separo</div><div style="font-size:20px;font-weight:800;color:var(--gold)">${_ctMoney(c.separo)}</div></div>
    </div>
    <table class="cob-table" style="width:100%"><thead><tr><th>Pago</th><th>Cuándo</th><th style="text-align:right">Monto</th></tr></thead><tbody>${filas}</tbody></table>
    ${_ctPlanNota(j.plan) ? `<div style="font-size:13px;color:var(--muted);margin-top:8px">${_ctEsc(_ctPlanNota(j.plan))}</div>` : ''}
    ${(j.avisos || []).map((a) => `<div style="font-size:13px;color:var(--gold);margin-top:6px">⚠️ ${_ctEsc(a)}</div>`).join('')}
    <div style="font-size:12px;color:var(--muted);margin-top:8px">Precios del catálogo de hoy (${_ctEsc(_ctFecha(c.hoy))}). Se respetan al apartar con el separo.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn btn-primary" onclick="ctDescargarPng()">⬇️ Descargar imagen (PNG)</button>
      <button class="btn btn-ghost" onclick="ctCopiarTexto()">📋 Copiar texto para WhatsApp</button>
    </div>
  </div>`;
}

function _ctTexto(j) {
  const c = j.cotizacion;
  const l = [`*${c.evento.nombre}*`, `${c.evento.fecha || _ctFecha(c.evento.ds)}${c.evento.venue ? ' · ' + c.evento.venue : ''}`, '',
    `${c.paquete_nombre}${c.zona ? ' · ' + c.zona : ''}${c.hotel ? ' · ' + c.hotel : ''}`,
    `${c.personas} ${c.personas === 1 ? 'persona' : 'personas'} · ${_ctMoney(c.precio_unit)} por persona`,
    `*Total: ${_ctMoney(c.total)}*`, ''];
  if (c.transporte && c.transporte.modo !== 'ninguno') l.splice(5, 0, `Incluye transporte a CDMX (${_ctMoney(c.transporte.precio)} por persona)`);
  l.push('*Tu rol de pagos*');
  _ctLineasRol(j).forEach((x) => l.push(`• ${x.lbl} (${x.fecha}): ${_ctMoney(x.monto)}`));
  const n = _ctPlanNota(j.plan); if (n) l.push(n);
  l.push('', 'Aparta tu lugar en conectareynosa.mx · Conecta Reynosa');
  return l.join('\n');
}
async function ctCopiarTexto() {
  if (!_ct.ultima) return;
  try { await navigator.clipboard.writeText(_ctTexto(_ct.ultima)); showToast('Texto copiado', 'success'); }
  catch (_) { showToast('No se pudo copiar — selecciona el texto a mano', 'error'); }
}

// La IMAGEN: un lienzo 1080 de ancho con los colores de la marca.
function ctDescargarPng() {
  const j = _ct.ultima; if (!j) return;
  const c = j.cotizacion, filas = _ctLineasRol(j);
  const W = 1080, H = Math.max(1350, 900 + filas.length * 64);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0000cd'; g.fillRect(0, 0, W, 16);
  const F = (peso, px) => `${peso} ${px}px Montserrat, Arial, sans-serif`;
  const txt = (s, x, y, f, col, al) => { g.font = f; g.fillStyle = col; g.textAlign = al || 'left'; g.fillText(String(s), x, y); };
  const wrap = (s, x, y, maxW, f, col, lh) => {
    g.font = f; const pal = String(s).split(' '); let lin = '', yy = y;
    for (const w of pal) { const t = lin ? lin + ' ' + w : w; if (g.measureText(t).width > maxW && lin) { txt(lin, x, yy, f, col); lin = w; yy += lh; } else lin = t; }
    if (lin) txt(lin, x, yy, f, col); return yy;
  };
  let y = 110;
  txt('CONECTA REYNOSA', 70, y, F(800, 30), '#e8ff4c'); txt('Cotización', W - 70, y, F(500, 28), '#ffffff', 'right');
  y = wrap(c.evento.nombre.toUpperCase(), 70, 220, W - 140, F(900, 72), '#ffffff', 80) + 60;
  txt(`${c.evento.fecha || _ctFecha(c.evento.ds)}${c.evento.venue ? ' · ' + c.evento.venue : ''}`, 70, y, F(500, 32), '#bbbbbb'); y += 70;
  y = wrap(`${c.paquete_nombre}${c.zona ? ' · ' + c.zona : ''}${c.hotel ? ' · ' + c.hotel : ''}`, 70, y, W - 140, F(700, 36), '#ffffff', 46) + 50;
  txt(`${c.personas} ${c.personas === 1 ? 'persona' : 'personas'} · ${_ctMoney(c.precio_unit)} por persona`, 70, y, F(500, 32), '#bbbbbb'); y += 50;
  if (c.transporte && c.transporte.modo !== 'ninguno') { txt(`Incluye transporte a CDMX · ${_ctMoney(c.transporte.precio)} por persona`, 70, y, F(500, 28), '#88ea4e'); y += 46; }
  y += 30;
  g.fillStyle = '#111111'; g.fillRect(50, y, W - 100, 170);
  txt('TOTAL', 90, y + 60, F(600, 28), '#bbbbbb'); txt(_ctMoney(c.total), 90, y + 135, F(900, 64), '#ffffff');
  txt('SEPARO', W - 90, y + 60, F(600, 28), '#bbbbbb', 'right'); txt(_ctMoney(c.separo), W - 90, y + 135, F(900, 64), '#e8ff4c', 'right');
  y += 240;
  txt('TU ROL DE PAGOS', 70, y, F(800, 32), '#e8ff4c'); y += 30;
  filas.forEach((x, i) => {
    y += 64;
    if (i % 2 === 0) { g.fillStyle = '#0d0d0d'; g.fillRect(50, y - 44, W - 100, 62); }
    txt(x.lbl, 80, y, F(700, 30), x.sep ? '#e8ff4c' : '#ffffff');
    txt(x.fecha, 520, y, F(500, 28), '#bbbbbb');
    txt(_ctMoney(x.monto), W - 80, y, F(800, 32), '#ffffff', 'right');
  });
  y += 70;
  const nota = _ctPlanNota(j.plan); if (nota) { y = wrap(nota, 70, y, W - 140, F(500, 26), '#bbbbbb', 36) + 46; }
  wrap(`Precios del catálogo del ${_ctFecha(c.hoy)}. Aparta con tu separo en conectareynosa.mx`, 70, H - 110, W - 140, F(500, 24), '#888888', 32);
  g.fillStyle = '#ff283b'; g.fillRect(0, H - 16, W, 16);
  cv.toBlob((b) => {
    if (!b) { showToast('No se pudo generar la imagen', 'error'); return; }
    const a = document.createElement('a');
    a.download = 'cotizacion-' + String(c.evento.evento_id).replace(/[^a-z0-9]+/gi, '-') + '.png';
    a.href = URL.createObjectURL(b); document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }, 'image/png');
}
