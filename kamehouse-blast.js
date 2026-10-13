// =============================================================================
// kamehouse-blast.js — PN27 · la pantalla del BLAST de preventa (14-oct-2026)
//
// La pluma es de maestro_roshi (PERMISOS_TABS). La pantalla NO manda nada por
// su cuenta: cada tanda es un clic de Memo («tú me vas diciendo cada tanto
// para ir enviando» — la pantalla es ese botón). El bucle de tandas es la
// forma de khExcelRecorrer: el navegador orquesta llamadas chicas (tope 25,
// presupuesto del servidor 8 s) y la BITÁCORA del servidor evita repetir.
// El ENSAYO enseña el correo REAL (el html que saldría, derivado del sitio
// servido) en un iframe — ver antes de mandar, la ley del consuelo.
// =============================================================================
/* global khAdminFetch, showToast, khErrorCarga */

let _blastFreno = false;

async function _blastApi(body) {
  const r = await khAdminFetch('/.netlify/functions/admin-preventa-blast', {
    method: 'POST', body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { st: r.status, j };
}

async function loadBlast() {
  const cont = document.getElementById('blast-cont');
  if (!cont) return;
  cont.innerHTML = '<div class="loading-state">Leyendo la bitácora…</div>';
  try {
    const { st, j } = await _blastApi({ accion: 'estado' });
    if (st !== 200 || !j.ok) { cont.innerHTML = '<div class="err-box">' + _blastEsc(j.error || ('HTTP ' + st)) + '</div>'; return; }
    const fuentes = Object.entries(j.por_fuente || {}).map(([f, n]) => `<span style="margin-right:12px;color:var(--ts)">${_blastEsc(f)}: <b style="color:var(--text)">${n}</b></span>`).join('');
    cont.innerHTML =
      '<div class="card" style="margin-bottom:12px"><div style="display:flex;gap:22px;flex-wrap:wrap">' +
        _blastKpi('En la lista', j.total) +
        _blastKpi('Pendientes', j.pendientes) +
        _blastKpi('🔥 Calientes por salir', j.calientes_pendientes) +
        _blastKpi('Enviados', j.enviados) +
        _blastKpi('Errores', j.errores) +
      '</div><div style="margin-top:8px;font-size:12px">' + fuentes + '</div></div>' +
      '<div class="card" style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<button class="btn btn-ghost btn-sm" onclick="blastSembrar()">1 · Sembrar giveaway</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="blastEnsayo()">2 · Ver el correo (ensayo)</button>' +
        '<label style="font-size:12px;color:var(--ts)">Tanda: <input id="blast-n" type="number" value="150" min="1" max="500" style="width:70px;padding:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.2);border-radius:6px;color:var(--text)"></label>' +
        '<button class="btn btn-sm" id="blast-go" onclick="blastEnviarTanda()">3 · 📣 Enviar tanda</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="_blastFreno=true" title="Termina el correo en curso y se detiene">⏸ Detener</button>' +
      '</div>' +
      '<div id="blast-prog" style="font-family:monospace;font-size:12px;color:var(--ts);margin-bottom:10px"></div>' +
      '<div id="blast-preview"></div>';
  } catch (e) {
    if (typeof khErrorCarga === 'function') khErrorCarga(cont, 'el blast de preventa', 'loadBlast', e);
    else cont.innerHTML = '<div class="err-box">' + _blastEsc(e.message) + '</div>';
  }
}

function _blastKpi(lbl, n) {
  return `<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">${lbl}</div><div style="font-family:'Zen Dots',sans-serif;font-size:20px;color:var(--text)">${Number(n || 0).toLocaleString()}</div></div>`;
}

async function blastSembrar() {
  if (!confirm('¿Traer los correos del giveaway (Portal) a la lista? Es re-corrible y no manda nada.')) return;
  const { st, j } = await _blastApi({ accion: 'sembrar_giveaway', confirmar: true });
  showToast(st === 200 ? ('Sembrados: ' + j.insertados + (j.nota ? ' · ' + j.nota : '')) : (j.error || 'falló la siembra'), st === 200 ? 'success' : 'error');
  loadBlast();
}

async function blastEnsayo() {
  const prev = document.getElementById('blast-preview');
  prev.innerHTML = '<div class="loading-state">Armando el correo contra el sitio servido…</div>';
  const { st, j } = await _blastApi({ accion: 'seco' });
  if (st !== 200 || !j.ok) { prev.innerHTML = '<div class="err-box">' + _blastEsc(j.error || ('HTTP ' + st)) + '</div>'; return; }
  const sig = (j.siguientes || []).map((s) => _blastEsc(s.correo) + (s.caliente ? ' 🔥' : '')).join(' · ');
  prev.innerHTML =
    '<div class="card"><div style="font-size:12px;color:var(--ts);margin-bottom:6px">ENSAYO — nada se mandó. Asunto: <b style="color:var(--text)">' + _blastEsc(j.asunto) + '</b></div>' +
    '<div style="font-size:11px;color:var(--ts);margin-bottom:8px">Siguientes en la cola: ' + (sig || '—') + '</div>' +
    '<iframe style="width:100%;height:560px;border:1px solid rgba(255,255,255,.15);border-radius:10px;background:#000" sandbox="" srcdoc="' + j.html.replace(/"/g, '&quot;') + '"></iframe></div>';
}

async function blastEnviarTanda() {
  const meta = Math.min(Math.max(1, Number((document.getElementById('blast-n') || {}).value || 150)), 500);
  if (!confirm('¿Mandar la siguiente tanda de hasta ' + meta + ' correos REALES? (calientes primero)')) return;
  _blastFreno = false;
  const btn = document.getElementById('blast-go');
  const prog = document.getElementById('blast-prog');
  if (btn) btn.disabled = true;
  let total = 0, errores = 0, restantes = null;
  try {
    while (total < meta && !_blastFreno) {
      const { st, j } = await _blastApi({ accion: 'enviar', tope: Math.min(25, meta - total), confirmar: true });
      if (st !== 200 || !j.ok) { prog.textContent = '🔴 se detuvo: ' + (j.error || ('HTTP ' + st)) + ' · enviados ' + total; showToast(j.error || 'el envío se detuvo', 'error'); break; }
      total += j.enviados; errores += (j.errores || 0); restantes = j.restantes;
      if (j.avisos) j.avisos.forEach((a) => showToast(a, 'error'));
      prog.textContent = '📣 enviados ' + total + ' de ' + meta + ' · errores ' + errores + ' · quedan ' + (restantes == null ? '?' : restantes) + ' en la lista…';
      if (j.enviados === 0 && (j.errores || 0) === 0) break;   // cola vacía
      if (restantes === 0) break;
    }
    prog.textContent = (_blastFreno ? '⏸ detenido por ti · ' : '✅ tanda completa · ') + 'enviados ' + total + ' · errores ' + errores + ' · quedan ' + (restantes == null ? '?' : restantes);
  } finally {
    if (btn) btn.disabled = false;
    loadBlast();
  }
}

function _blastEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
