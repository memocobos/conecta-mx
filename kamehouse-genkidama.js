// =============================================================================
// kamehouse-genkidama.js — GENKIDAMA-1 (13-oct-2026). La pantalla del concentrado
// de correos y las campañas. Solo maestro_roshi (PERMISOS_TABS).
//
// Arriba la ENERGÍA del día (lo que ya salió vs el límite que fija Memo), luego
// el concentrado (cuántos correos únicos y de dónde), el WIZARD de 4 pasos
// (tipo → tour y fecha → código y slogan → ensayo y crear) y las campañas con
// su botón de tanda. La pantalla no manda nada sola: cada tanda es un clic.
// =============================================================================
/* global khAdminFetch, showToast, khErrorCarga */

let _gkEstado = null;
let _gkFreno = false;
const _gkW = { tipo: '', evento_id: '', fecha_idx: '', codigo: '', slogan: '', asunto: '', mensaje: '', excluir_blast: true };

async function _gkApi(body) {
  const r = await khAdminFetch('/.netlify/functions/admin-genkidama', { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { st: r.status, j };
}
function _gkEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _gkN(n) { return Number(n || 0).toLocaleString('es-MX'); }

async function loadGenkidama() {
  const cont = document.getElementById('gk-cont');
  if (!cont) return;
  cont.innerHTML = '<div class="loading-state">Juntando la energía…</div>';
  try {
    const { st, j } = await _gkApi({ accion: 'estado' });
    if (st !== 200 || !j.ok) { cont.innerHTML = '<div class="err-box">' + _gkEsc(j.error || ('HTTP ' + st)) + '</div>'; return; }
    _gkEstado = j;
    cont.innerHTML = _gkEnergiaHtml(j.energia, j.concentrado) + _gkConcentradoHtml(j.concentrado) + _gkWizardHtml(j) + _gkCampanasHtml(j.campanas);
  } catch (e) {
    if (typeof khErrorCarga === 'function') khErrorCarga(cont, 'Genkidama', 'loadGenkidama', e);
    else cont.innerHTML = '<div class="err-box">' + _gkEsc(e.message) + '</div>';
  }
}

// ── La energía: barra que se llena con lo que ya salió hoy ───────────────────
function _gkEnergiaHtml(en, conc) {
  const lim = en.limite || 0, env = en.enviados_hoy || 0, rest = en.restante || 0;
  const pct = lim ? Math.min(100, Math.round(env * 100 / lim)) : 100;
  const color = rest === 0 ? 'var(--red)' : (pct >= 75 ? '#ffb020' : 'var(--accent, #e8ff4c)');
  const dias = rest > 0 || lim > 0 ? Math.ceil((conc && conc.total ? conc.total : 0) / Math.max(1, lim)) : null;
  return '<div class="card" style="margin-bottom:12px">' +
    '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px">' +
      '<div style="font-family:\'Zen Dots\',sans-serif;font-size:13px;letter-spacing:.06em">⚡ ENERGÍA DE HOY</div>' +
      '<div style="font-size:13px;color:var(--ts)">Hoy puedes enviar <b style="color:var(--text);font-size:18px">' + _gkN(rest) + '</b> correos más · ya salieron ' + _gkN(env) + ' de ' + _gkN(lim) + '</div>' +
    '</div>' +
    '<div style="margin:10px 0 6px;height:18px;border-radius:9px;background:rgba(255,255,255,.08);overflow:hidden;border:1px solid rgba(255,255,255,.12)">' +
      '<div style="height:100%;width:' + pct + '%;background:' + color + ';transition:width .4s"></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--ts)">' +
      '<span>Genkidama ' + _gkN(en.genkidama_hoy) + ' · Blast PN27 ' + _gkN(en.blast_hoy) + ' · se recarga a medianoche (Reynosa)' + (dias ? ' · a este ritmo recorres el concentrado en ~' + dias + ' día' + (dias === 1 ? '' : 's') : '') + '</span>' +
      '<span>Límite diario: <input id="gk-limite" type="number" min="0" max="5000" value="' + lim + '" style="width:80px;padding:4px 6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.2);border-radius:6px;color:var(--text)"> ' +
      '<button class="btn btn-ghost btn-sm" onclick="gkGuardarEnergia()">Guardar</button></span>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--ts);margin-top:6px">Para no caer en spam: arranca con ~300 al día y súbelo poco a poco (p. ej. +100 cada 2-3 días) mientras no reboten ni haya quejas. Cada persona recibe máximo un correo masivo por día.</div>' +
  '</div>';
}

function _gkConcentradoHtml(c) {
  const f = Object.entries(c.por_fuente || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => '<span style="margin-right:12px">' + _gkEsc(k) + ': <b style="color:var(--text)">' + _gkN(n) + '</b></span>').join('');
  return '<div class="card" style="margin-bottom:12px">' +
    '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">' +
      '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">El concentrado (sin repetidos)</div>' +
      '<div style="font-family:\'Zen Dots\',sans-serif;font-size:22px">' + _gkN(c.total) + ' <span style="font-size:12px;color:var(--ts)">correos · ' + _gkN(c.bajas) + ' dados de baja</span></div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" onclick="gkSembrar()">↻ Juntar correos de todos lados</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="gkBajas()">✋ Dar de baja…</button></div>' +
    '</div>' +
    '<div style="margin-top:8px;font-size:12px;color:var(--ts)">' + (f || 'Todavía vacío: aprieta «Juntar correos».') + '</div>' +
  '</div>';
}

// ── El wizard ─────────────────────────────────────────────────────────────────
const _GK_TIPOS = [
  ['promocion', '📣 Promoción', 'Anuncia un tour o una fase de precio'],
  ['descuento', '💸 Descuento', 'Un monto o % de descuento con su código'],
  ['codigo', '🎟️ Código', 'El código grande al centro, listo para usar'],
  ['ultimos', '⏳ Últimos lugares', 'Urgencia: quedan pocos'],
  ['libre', '✍️ Mensaje libre', 'Tú escribes asunto y mensaje'],
];
function _gkWizardHtml(j) {
  if (!j.wizard) return '<div class="card" style="margin-bottom:12px"><div class="err-box">' + _gkEsc(j.aviso_sitio || 'No pude leer el sitio.') + '</div></div>';
  const evs = j.wizard.eventos || [];
  const ev = evs.find((e) => e.id === _gkW.evento_id);
  const tipos = _GK_TIPOS.map(([k, t, d]) => '<button type="button" class="btn ' + (_gkW.tipo === k ? '' : 'btn-ghost ') + 'btn-sm" style="text-align:left" onclick="gkSet(\'tipo\',\'' + k + '\')"><b>' + t + '</b><br><span style="font-size:11px;opacity:.75">' + d + '</span></button>').join('');
  const opEv = '<option value="">— elige tour —</option>' + evs.map((e) => '<option value="' + _gkEsc(e.id) + '"' + (e.id === _gkW.evento_id ? ' selected' : '') + '>' + _gkEsc(e.a) + ' · ' + _gkEsc(e.f) + '</option>').join('');
  const fechas = ev && ev.fechas.length
    ? '<select id="gk-fecha" onchange="gkSet(\'fecha_idx\',this.value)" style="padding:8px;border-radius:8px;background:rgba(255,255,255,.07);color:var(--text);border:1px solid rgba(255,255,255,.2)"><option value="">Todas las fechas</option>' +
      ev.fechas.filter((f) => f.vendible).map((f) => '<option value="' + f.idx + '"' + (String(f.idx) === String(_gkW.fecha_idx) ? ' selected' : '') + '>' + _gkEsc(f.lbl) + '</option>').join('') + '</select>'
    : '<span style="font-size:12px;color:var(--ts)">' + (ev ? 'Una sola fecha: ' + _gkEsc(ev.f) : '') + '</span>';
  const cods = (j.wizard.codigos || []).filter((c) => !ev || !c.eventos || c.eventos.map((x) => String(x).split('#')[0]).includes(ev.id.split('#')[0]));
  const opCod = '<option value="">' + (_gkW.tipo === 'descuento' || _gkW.tipo === 'codigo' ? '— elige código —' : 'Sin código') + '</option>' +
    cods.map((c) => '<option value="' + _gkEsc(c.codigo) + '"' + (c.codigo === _gkW.codigo ? ' selected' : '') + '>' + _gkEsc(c.codigo) + (c.monto ? ' · ' + _gkEsc(c.monto) : '') + (c.desc ? ' · ' + _gkEsc(c.desc) : '') + '</option>').join('');
  const inp = 'padding:8px;border-radius:8px;background:rgba(255,255,255,.07);color:var(--text);border:1px solid rgba(255,255,255,.2)';
  return '<div class="card" style="margin-bottom:12px">' +
    '<div style="font-family:\'Zen Dots\',sans-serif;font-size:13px;letter-spacing:.06em;margin-bottom:10px">🌀 NUEVA CAMPAÑA</div>' +
    '<div style="font-size:11px;color:var(--ts);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">1 · Tipo de correo</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:12px">' + tipos + '</div>' +
    '<div style="font-size:11px;color:var(--ts);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">2 · Tour y fecha</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><select id="gk-evento" onchange="gkSet(\'evento_id\',this.value)" style="' + inp + ';min-width:260px">' + opEv + '</select>' + fechas + '</div>' +
    '<div style="font-size:11px;color:var(--ts);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">3 · Código y slogan</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px"><select id="gk-codigo" onchange="gkSet(\'codigo\',this.value)" style="' + inp + ';min-width:200px">' + opCod + '</select>' +
    '<input id="gk-slogan" maxlength="140" placeholder="Slogan · p. ej. «Recibe un descuento de $500»" value="' + _gkEsc(_gkW.slogan) + '" oninput="_gkW.slogan=this.value" style="' + inp + ';flex:1;min-width:260px"></div>' +
    '<div style="font-size:11px;color:var(--ts);margin-bottom:12px">Solo salen códigos VIVOS en el sitio y que aplican a ese tour. Si el texto menciona un monto, tiene que ser el mismo del código.' + (_gkW.tipo === 'libre' ? ' En el mensaje libre el slogan es el <b>título grande</b> del correo.' : '') + '</div>' +
    (_gkW.tipo === 'libre'
      ? '<div style="font-size:11px;color:var(--ts);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">3b · Tu mensaje</div>' +
        '<input id="gk-asunto" maxlength="120" placeholder="Asunto del correo · p. ej. «Pa’l Norte 2027: aparta tu lugar con $300»" value="' + _gkEsc(_gkW.asunto) + '" oninput="_gkW.asunto=this.value" style="' + inp + ';width:100%;box-sizing:border-box;margin-bottom:6px">' +
        '<textarea id="gk-mensaje" maxlength="2000" rows="7" placeholder="Escribe tu mensaje. Deja una línea en blanco para separar párrafos." oninput="_gkW.mensaje=this.value" style="' + inp + ';width:100%;box-sizing:border-box;font:inherit;margin-bottom:12px">' + _gkEsc(_gkW.mensaje) + '</textarea>'
      : '') +
    (String(_gkW.evento_id || '').split('#')[0] === 'palnorte'
      ? '<label style="display:flex;gap:6px;align-items:center;font-size:12px;margin-bottom:12px"><input type="checkbox" id="gk-exblast"' + (_gkW.excluir_blast ? ' checked' : '') + ' onchange="_gkW.excluir_blast=this.checked"> No mandarle a quien ya recibió el blast de la preventa</label>'
      : '') +
    '<div style="font-size:11px;color:var(--ts);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">4 · Ver y crear</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" onclick="gkEnsayo()">👁 Ver el correo (ensayo)</button>' +
    '<button class="btn btn-sm" onclick="gkCrear()">🌀 Crear campaña</button></div>' +
    '<div id="gk-preview" style="margin-top:10px"></div>' +
  '</div>';
}
function _gkLeerCampos() {
  const s = document.getElementById('gk-slogan'); if (s) _gkW.slogan = s.value;
  const a = document.getElementById('gk-asunto'); if (a) _gkW.asunto = a.value;
  const m = document.getElementById('gk-mensaje'); if (m) _gkW.mensaje = m.value;
  const x = document.getElementById('gk-exblast'); if (x) _gkW.excluir_blast = x.checked;
}
function gkSet(k, v) {
  _gkLeerCampos();
  _gkW[k] = v;
  if (k === 'evento_id') { _gkW.fecha_idx = ''; _gkW.codigo = ''; }
  if (_gkEstado) {
    const cont = document.getElementById('gk-cont');
    cont.innerHTML = _gkEnergiaHtml(_gkEstado.energia, _gkEstado.concentrado) + _gkConcentradoHtml(_gkEstado.concentrado) + _gkWizardHtml(_gkEstado) + _gkCampanasHtml(_gkEstado.campanas);
  }
}
function _gkDatos() {
  _gkLeerCampos();
  if (!_gkW.tipo) return 'Elige el tipo de correo';
  if (!_gkW.evento_id) return 'Elige el tour';
  if ((_gkW.tipo === 'descuento' || _gkW.tipo === 'codigo') && !_gkW.codigo) return 'Este tipo de correo necesita un código';
  if (String(_gkW.slogan || '').trim().length < 3) return _gkW.tipo === 'libre' ? 'Escribe el título (slogan)' : 'Escribe el slogan';
  if (_gkW.tipo === 'libre' && String(_gkW.asunto || '').trim().length < 5) return 'Escribe el asunto del correo';
  if (_gkW.tipo === 'libre' && String(_gkW.mensaje || '').trim().length < 10) return 'Escribe tu mensaje';
  return null;
}
// El excluir_blast solo viaja para Pa'l Norte (en otro tour no significa nada).
function _gkPayload() {
  const p = Object.assign({}, _gkW);
  p.excluir_blast = String(p.evento_id || '').split('#')[0] === 'palnorte' && !!p.excluir_blast;
  if (p.tipo !== 'libre') { delete p.asunto; delete p.mensaje; }
  return p;
}
async function gkEnsayo() {
  const falta = _gkDatos(); const prev = document.getElementById('gk-preview');
  if (falta) { prev.innerHTML = '<div class="err-box">' + _gkEsc(falta) + '</div>'; return; }
  prev.innerHTML = '<div class="loading-state">Armando el correo contra el sitio servido…</div>';
  const { st, j } = await _gkApi(Object.assign({ accion: 'seco' }, _gkPayload()));
  if (st !== 200 || !j.ok) { prev.innerHTML = '<div class="err-box">' + _gkEsc(j.error || ('HTTP ' + st)) + '</div>'; return; }
  prev.innerHTML = '<div style="font-size:12px;color:var(--ts);margin-bottom:6px">ENSAYO — nada se mandó. Asunto: <b style="color:var(--text)">' + _gkEsc(j.asunto) + '</b> · Le llegaría a <b style="color:var(--text)">' + _gkN(j.audiencia) + '</b> personas (' + _gkN(j.excluidos_ya_van) + ' fuera porque ya van a ese tour' + (j.excluidos_blast ? ' · ' + _gkN(j.excluidos_blast) + ' fuera porque ya recibieron el blast de la preventa' : '') + ').</div>' +
    ((j.avisos || []).length ? '<div style="font-size:12px;color:var(--yellow);margin-bottom:6px">⚠️ ' + j.avisos.map(_gkEsc).join(' · ') + '</div>' : '') +
    '<iframe style="width:100%;height:620px;border:1px solid rgba(255,255,255,.15);border-radius:10px;background:#000" sandbox="" srcdoc="' + j.html.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></iframe>';
}
async function gkCrear() {
  const falta = _gkDatos(); const prev = document.getElementById('gk-preview');
  if (falta) { prev.innerHTML = '<div class="err-box">' + _gkEsc(falta) + '</div>'; return; }
  if (!confirm('¿Crear la campaña? Todavía NO se manda nada: después eliges cuándo y cuántos enviar.')) return;
  const { st, j } = await _gkApi(Object.assign({ accion: 'crear', confirmar: true }, _gkPayload()));
  if (st !== 200 || !j.ok) { prev.innerHTML = '<div class="err-box">' + _gkEsc(j.error || ('HTTP ' + st)) + '</div>'; return; }
  showToast('Campaña creada: ' + _gkN(j.campana.pendientes) + ' correos en fila', 'success');
  Object.assign(_gkW, { tipo: '', evento_id: '', fecha_idx: '', codigo: '', slogan: '', asunto: '', mensaje: '', excluir_blast: true });
  loadGenkidama();
}

// ── Las campañas y sus tandas ─────────────────────────────────────────────────
function _gkCampanasHtml(cs) {
  if (!cs || !cs.length) return '<div class="card"><div style="font-size:13px;color:var(--ts)">Aún no hay campañas.</div></div>';
  const tipoLbl = { promocion: '📣 Promoción', descuento: '💸 Descuento', codigo: '🎟️ Código', ultimos: '⏳ Últimos lugares', libre: '✍️ Mensaje libre' };
  return '<div class="card"><div style="font-family:\'Zen Dots\',sans-serif;font-size:13px;letter-spacing:.06em;margin-bottom:10px">CAMPAÑAS</div>' +
    cs.map((c) => {
      const tot = c.audiencia || (c.enviados + c.pendientes + c.errores);
      const pct = tot ? Math.round(c.enviados * 100 / tot) : 0;
      return '<div style="padding:10px 0;border-top:1px solid rgba(255,255,255,.08)">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>' + _gkEsc(c.asunto) + '</b><div style="font-size:11px;color:var(--ts)">' + (tipoLbl[c.tipo] || c.tipo) + ' · ' + _gkEsc(c.evento_id) + (c.codigo ? ' · ' + _gkEsc(c.codigo) : '') + ' · ' + new Date(c.creado_at).toLocaleDateString('es-MX') + '</div></div>' +
        '<div style="font-size:12px;color:var(--ts);text-align:right">' + _gkN(c.enviados) + ' de ' + _gkN(tot) + ' enviados' + (c.errores ? ' · ' + _gkN(c.errores) + ' errores' : '') + '</div></div>' +
        '<div style="margin:6px 0;height:8px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden"><div style="height:100%;width:' + pct + '%;background:var(--accent, #e8ff4c)"></div></div>' +
        (c.pendientes ? '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label style="font-size:12px;color:var(--ts)">Mandar ahora: <input id="gk-n-' + c.id + '" type="number" min="1" max="2000" value="' + Math.min(c.pendientes, (_gkEstado && _gkEstado.energia.restante) || 0) + '" style="width:80px;padding:4px 6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.2);border-radius:6px;color:var(--text)"></label>' +
          '<button class="btn btn-sm" id="gk-go-' + c.id + '" onclick="gkEnviar(\'' + c.id + '\')">⚡ Lanzar tanda</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="_gkFreno=true">⏸ Detener</button>' +
          '<span id="gk-prog-' + c.id + '" style="font-family:monospace;font-size:12px;color:var(--ts)"></span></div>'
          : '<div style="font-size:12px;color:var(--ts)">✅ Campaña completa</div>') +
      '</div>';
    }).join('') + '</div>';
}
async function gkEnviar(id) {
  const meta = Math.max(1, Number((document.getElementById('gk-n-' + id) || {}).value || 0));
  if (!confirm('¿Mandar hasta ' + meta + ' correos REALES de esta campaña ahora?')) return;
  _gkFreno = false;
  const btn = document.getElementById('gk-go-' + id); const prog = document.getElementById('gk-prog-' + id);
  if (btn) btn.disabled = true;
  let total = 0, errores = 0, hoy = 0;
  try {
    while (total < meta && !_gkFreno) {
      const { st, j } = await _gkApi({ accion: 'enviar', campana_id: id, tope: Math.min(25, meta - total), confirmar: true });
      if (st !== 200 || !j.ok) { prog.textContent = (st === 429 ? '⚡ ' : '🔴 ') + (j.error || ('HTTP ' + st)) + ' · enviados ' + total; if (st !== 429) showToast(j.error || 'la tanda se detuvo', 'error'); break; }
      total += j.enviados; errores += (j.errores || 0); hoy = j.saltados_hoy || 0;
      if (j.avisos) j.avisos.forEach((a) => showToast(a, 'error'));
      prog.textContent = '⚡ ' + total + ' de ' + meta + ' · errores ' + errores + ' · quedan ' + _gkN(j.restantes) + ' · energía ' + _gkN(j.energia && j.energia.restante);
      if (j.enviados === 0 && (j.errores || 0) === 0) { if (hoy) prog.textContent += ' · los que siguen ya recibieron un correo hoy: siguen mañana'; break; }
      if (!j.restantes || (j.energia && j.energia.restante <= 0)) break;
    }
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(loadGenkidama, 1200);
  }
}

async function gkGuardarEnergia() {
  const v = Number((document.getElementById('gk-limite') || {}).value);
  if (!Number.isFinite(v) || v < 0) return showToast('Pon un número válido', 'error');
  if (!confirm('¿Dejar la energía diaria en ' + v + ' correos?')) return;
  const { st, j } = await _gkApi({ accion: 'energia', limite: v, confirmar: true });
  showToast(st === 200 ? 'Energía diaria: ' + v : (j.error || 'no se guardó'), st === 200 ? 'success' : 'error');
  loadGenkidama();
}
async function gkSembrar() {
  if (!confirm('¿Juntar los correos de viajeros, lista de espera, requisiciones, Portal y giveaways? No manda nada; solo agrega los que falten.')) return;
  const { st, j } = await _gkApi({ accion: 'sembrar', confirmar: true });
  showToast(st === 200 ? ('Nuevos en el concentrado: ' + _gkN(j.insertados) + (j.nota ? ' · ' + j.nota : '')) : (j.error || 'falló'), st === 200 ? 'success' : 'error');
  loadGenkidama();
}
async function gkBajas() {
  const txt = prompt('Pega los correos que pidieron BAJA (separados por coma, espacio o renglón):');
  if (!txt) return;
  const { st, j } = await _gkApi({ accion: 'bajas', correos: txt, confirmar: true });
  showToast(st === 200 ? ('Dados de baja: ' + j.dados_de_baja + '. Ya no recibirán nada.') : (j.error || 'falló'), st === 200 ? 'success' : 'error');
  loadGenkidama();
}
