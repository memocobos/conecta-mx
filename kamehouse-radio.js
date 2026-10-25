// =============================================================================
// kamehouse-radio.js — Radio Conecta y Kaio-sama, sacados del tronco (MONO-2)
// =============================================================================
// 90 funciones y 1,094 líneas: la segunda más aislada de KameHouse (90% de lo
// que usa es suyo, y solo toca 10 funciones compartidas). Aquí viven el
// reproductor de la topbar, la pantalla de Radio y el admin Kaio-sama.
//
// Mismas reglas que MONO-1: SOLO funciones, en el MISMO ORDEN en que vivían,
// con su comentario pegado. Cero código de nivel superior — el estado global se
// queda íntegro en el tronco, que es otra tuerca con su propia medición.
//
// ⚠️ El orden de carga NO se supone: se comprueba CARGANDO la página. En MONO-1
// escribí que daba igual, «medido», y era falso —el tronco guardaba una función
// extraída como valor en una constante de nivel superior—. Para preguntas de
// tiempo de carga la autoridad es el navegador, no contar identificadores; por
// eso este archivo va donde el humo dice, y el arnés exige cero errores al
// cargar.
//
// ⚠️ Careo de RECONSTRUCCIÓN: volver a intercalar estos bloques en el tronco
// devuelve el `kamehouse.js` de su commit BYTE A BYTE. Ordenar es otra tuerca.
// =============================================================================

function _radioFecha(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', { timeZone: 'America/Matamoros', dateStyle: 'short', timeStyle: 'short' });
}
// Carga ambas listas al entrar (patrón de las demás loadX). Fails-soft.
async function loadRadio() {
  _loadRadioHero();       // el hero vive fuera del try: se pinta aunque el admin falle
  _radioHeroStart();      // auto-refresh cada 15s (una sola vez)
  _avisosCargar();        // avisos inteligentes (fail-soft por fuente)
  try {
    const [rp, rm] = await Promise.all([
      khAdminFetch('/.netlify/functions/admin-radio-peticiones'),
      khAdminFetch('/.netlify/functions/admin-radio-muro'),
    ]);
    const jp = await rp.json().catch(() => ({}));
    const jm = await rm.json().catch(() => ({}));
    if (!rp.ok || jp.ok === false) throw new Error(jp.error || ('peticiones ' + rp.status));
    if (!rm.ok || jm.ok === false) throw new Error(jm.error || ('muro ' + rm.status));
    _radioPeticiones = Array.isArray(jp.peticiones) ? jp.peticiones : [];
    _radioMuro = Array.isArray(jm.mensajes) ? jm.mensajes : [];
    _renderRadioPeticiones();
    _renderRadioMuro();
  } catch (e) {
    showToast('Error cargando Radio: ' + e.message, 'error');
    const p = document.getElementById('radio-pet-tbody');
    const m = document.getElementById('radio-muro-tbody');
    if (p) p.innerHTML = `<tr><td colspan="5" style="color:#FF6B6B">Error: ${_spEscape(e.message)}</td></tr>`;
    if (m) m.innerHTML = `<tr><td colspan="5" style="color:#FF6B6B">Error: ${_spEscape(e.message)}</td></tr>`;
  }
}
function showRadioTab(sub, btn) {
  document.querySelectorAll('#page-radio .ks-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  ['peticiones', 'muro', 'cabina', 'cartelera', 'numeros', 'control', 'biblioteca'].forEach(s => {
    const el = document.getElementById('radio-tab-' + s);
    if (el) el.style.display = s === sub ? '' : 'none';
  });
  if (sub === 'cabina') loadRadioCabina();
  if (sub === 'cartelera') loadRadioCartelera();
  if (sub === 'numeros') loadRadioNumeros();
  if (sub === 'control') loadRadioControl();
  if (sub === 'biblioteca') loadRadioBiblioteca();
}
// ── HERO "Sonando ahora" — centro de control, visible en todos los tabs ──────
// Carátula difuminada de fondo + ficha nítida + oyentes en vivo. API pública
// nowplaying (misma que Números). Auto-refresh cada 15s, pausado si la página no
// está visible. Sin functions nuevas.
function _radioHeroStart() {
  if (_radioHeroTimer) return;
  _radioHeroTimer = setInterval(() => {
    const pg = document.getElementById('page-radio');
    if (document.hidden || !pg || !pg.classList.contains('active')) return;
    _loadRadioHero();
  }, 15000);
}
function _loadRadioHero() {
  fetch(RADIO_NOWPLAYING)
    .then(r => r.json())
    .then(d => {
      const s = (d && d.now_playing && d.now_playing.song) || {};
      const oy = (d && d.listeners && Number(d.listeners.current)) || 0;
      const t = document.getElementById('ks-hero-titulo');
      const a = document.getElementById('ks-hero-artista');
      const o = document.getElementById('ks-hero-oyentes');
      const ph = document.getElementById('ks-hero-ph');
      if (t) t.textContent = s.title || 'Sin datos';
      if (a) a.textContent = s.artist || '';
      if (o) o.textContent = oy;
      if (ph) ph.textContent = _radioInicialesArt(s.artist || s.title);
      _radioSetArt(document.getElementById('ks-hero-art'), document.getElementById('ks-hero-bg'), s.art);
    })
    .catch(() => {
      const t = document.getElementById('ks-hero-titulo');
      const o = document.getElementById('ks-hero-oyentes');
      if (t) t.textContent = 'No disponible';
      if (o) o.textContent = '—';
    });
}
// Pinta la carátula nítida sobre el placeholder y usa la misma imagen difuminada
// de fondo. Si la imagen falla (onerror), se oculta y quedan placeholder + fondo
// neutro — nunca se ve el ícono de imagen rota.
function _radioSetArt(artEl, bgEl, url) {
  if (!artEl) return;
  const prev = artEl.querySelector('img');
  if (prev) prev.remove();
  if (!url) {
    if (bgEl) { bgEl.style.backgroundImage = ''; bgEl.classList.add('is-empty'); }
    return;
  }
  const img = document.createElement('img');
  img.alt = '';
  img.onload = () => { if (bgEl) { bgEl.style.backgroundImage = 'url("' + url + '")'; bgEl.classList.remove('is-empty'); } };
  img.onerror = () => { img.remove(); if (bgEl) { bgEl.style.backgroundImage = ''; bgEl.classList.add('is-empty'); } };
  img.src = url;
  artEl.appendChild(img);
}
// Tab "Números" — 3 tarjetas con endpoints EXISTENTES (sin functions nuevas).
// Peticiones pendientes sale de lo ya cargado por loadRadio; oyentes y likes se
// piden aquí (fail-soft, cada card independiente). Cada dato muestra su tendencia
// (▲/▼) contra la última carga guardada en memoria de sesión.
async function loadRadioNumeros() {
  // ── Peticiones pendientes (reutiliza admin-radio-peticiones vía _radioPeticiones) ──
  const pend = _radioPeticiones.filter(p => !p.atendida).length;
  _radioSetNum('peticiones', pend, true); // neutral: más pendientes no es "bueno/malo"

  // ── Top 20 semanal (admin-radio-stats; fail-soft, panel independiente) ──
  _radioTop20Load();

  // ── Reportes (lazy al abrir el tab; cada tarjeta es independiente) ──
  _rnOyentes(); _rnUnicos(); _rnHoras(); _rnMasTocadas(); _rnLikesDias(); _rnPeticionesResumen();

  // ── Oyentes ahora + canción sonando (API pública de la radio, fetch cliente) ──
  fetch(RADIO_NOWPLAYING)
    .then(r => r.json())
    .then(d => {
      const oy = (d && d.listeners && Number(d.listeners.current)) || 0;
      _radioSetNum('oyentes', oy);
      const s = d && d.now_playing && d.now_playing.song;
      const elSon = document.getElementById('radio-num-sonando');
      if (elSon) elSon.textContent = (s && (s.title || s.artist))
        ? '' + [s.title, s.artist].filter(Boolean).join(' — ')
        : 'sin datos';
    })
    .catch(() => {
      const elOy = document.getElementById('radio-num-oyentes');
      const elSon = document.getElementById('radio-num-sonando');
      if (elOy) elOy.textContent = '—';
      if (elSon) elSon.textContent = 'no disponible';
    });

  // ── Likes esta semana: GET público del top → suma counts + top 3 ──
  fetch('/.netlify/functions/radio-like')
    .then(r => r.json())
    .then(d => {
      const top = (d && Array.isArray(d.top)) ? d.top : [];
      const total = top.reduce((a, t) => a + (Number(t.likes) || 0), 0);
      _radioSetNum('likes', total);
      const elT3 = document.getElementById('radio-num-top3');
      if (elT3) elT3.innerHTML = top.length
        ? top.slice(0, 3).map((t, i) => {
            const label = [(t.titulo || ''), (t.artista || '')].filter(Boolean).join(' — ') || 'sin título';
            return (i + 1) + '. ' + _spEscape(label) + ' · <svg class="ic"><use href="#ic-corazon"/></svg> ' + (Number(t.likes) || 0);
          }).join('<br>')
        : 'aún sin likes';
    })
    .catch(() => {
      const elLk = document.getElementById('radio-num-likes');
      const elT3 = document.getElementById('radio-num-top3');
      if (elLk) elLk.textContent = '—';
      if (elT3) elT3.textContent = 'no disponible';
    });
}
function _avisosCargar() {
  const box = document.getElementById('ks-avisos');
  if (box) box.innerHTML = '';
  _avisoRadioCheck();   // crítica (con 1 reintento) + alimenta el pico de oyentes
  if (!_avisoCaidaTimer) _avisoCaidaTimer = setInterval(_avisoRadioCheck, 60000);
  _avisoRepetidas();
  _avisoPeticionesAnejas();
  _avisoRachaLikes();
}
// Fila compacta con severidad (warn amarillo / good verde). onclick opcional.
function _avisoAdd(sev, tag, html, onClick) {
  const box = document.getElementById('ks-avisos');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'ks-aviso ' + sev + (onClick ? ' click' : '');
  div.innerHTML = '<span class="ks-aviso-tag">' + tag + '</span><span>' + html + '</span>';
  if (onClick) div.addEventListener('click', onClick);
  box.appendChild(div);
}
// 1. RADIO CAÍDA (crítica): nowplaying con 1 reintento; banner rojo arriba de
//    todo; re-chequeo cada 60s y se quita solo al volver.
async function _avisoRadioCheck() {
  const banner = document.getElementById('ks-aviso-caida');
  if (!banner) return;
  const intento = () => fetch(RADIO_NOWPLAYING).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  try {
    let d;
    try { d = await intento(); }
    catch (e) { await new Promise(res => setTimeout(res, 2000)); d = await intento(); }
    banner.style.display = 'none';
    _avisoOyentesPico(d);
  } catch (e) {
    banner.style.display = '';
  }
}
// 3. OYENTES ARRIBA DE LO NORMAL: promedio móvil (EMA) en localStorage de visitas
//    previas; alerta si los actuales superan el DOBLE del promedio (mínimo 5) y
//    ya hay 3+ visitas de historia (evita falsos positivos al estrenar).
function _avisoOyentesPico(d) {
  if (_avisoPicoHecho) return;
  _avisoPicoHecho = true;
  const cur = (d && d.listeners && Number(d.listeners.current)) || 0;
  let st = null;
  try { st = JSON.parse(localStorage.getItem('ks-oyentes-avg') || 'null'); } catch (e) {}
  const avg = st ? Number(st.avg) : NaN;
  const n = (st && Number(st.n)) || 0;
  if (n >= 3 && Number.isFinite(avg) && cur >= 5 && cur > avg * 2) {
    _avisoAdd('good', 'Pico', 'Pico de oyentes: <b>' + cur + '</b> conectados (promedio ' + Math.round(avg) + ')');
  }
  const nuevoAvg = (Number.isFinite(avg) && n > 0) ? (avg + (cur - avg) * 0.3) : cur;
  try { localStorage.setItem('ks-oyentes-avg', JSON.stringify({ avg: nuevoAvg, n: Math.min(n + 1, 50) })); } catch (e) {}
}
// 2. CANCIÓN REPETIDA: 3+ veces en 24h (history de AzuraCast, agregado server-side).
async function _avisoRepetidas() {
  try {
    const d = await _rnGet('repetidas');
    (Array.isArray(d.repetidas) ? d.repetidas : []).forEach(c => {
      _avisoAdd('warn', 'Repetida',
        '<b>' + _spEscape(c.titulo) + '</b>' + (c.artista ? ' — ' + _spEscape(c.artista) : '') + ' sonó <b>' + (Number(c.veces) || 0) + '</b> veces en 24h',
        () => radioMediaAbrirPorNombre(c.titulo, c.artista));
    });
  } catch (e) { /* fail-soft */ }
}
// 4. PETICIONES AÑEJAS: pendientes con 3+ días → click al tab Peticiones.
async function _avisoPeticionesAnejas() {
  try {
    const d = await _rnGet('peticiones_resumen');
    const v = Number(d.viejas_3d) || 0;
    if (v > 0) {
      _avisoAdd('warn', 'Peticiones',
        '<b>' + v + '</b> peticion' + (v === 1 ? '' : 'es') + ' lleva' + (v === 1 ? '' : 'n') + ' más de 3 días sin atender',
        () => showRadioTab('peticiones', document.getElementById('radio-tab-btn-peticiones')));
    }
  } catch (e) { /* fail-soft */ }
}
// 5. RACHA DE LIKES: 5+ likes HOY (día MX) → click al modal de edición.
async function _avisoRachaLikes() {
  try {
    const d = await _rnGet('likes_hoy');
    (Array.isArray(d.rachas) ? d.rachas : []).forEach(c => {
      _avisoAdd('good', 'Likes',
        '<b>' + _spEscape(c.titulo || 'sin título') + '</b>' + (c.artista ? ' — ' + _spEscape(c.artista) : '') + ' está recibiendo likes hoy (' + (Number(c.likes) || 0) + ')',
        () => radioMediaAbrirPorNombre(c.titulo, c.artista));
    });
  } catch (e) { /* fail-soft */ }
}
// ── Reportes de Números (admin-radio-stats) — todos fail-soft por tarjeta ────
async function _rnGet(accion) {
  const r = await khAdminFetch('/.netlify/functions/admin-radio-stats?accion=' + accion);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.error || ('Error ' + r.status));
  return d;
}
function _rnSinDatos(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '<div style="color:var(--ts);font-size:12px;padding:4px 0">Sin datos</div>';
}
function _rnTiempo(seg) {
  seg = Number(seg) || 0;
  if (seg < 60) return seg + ' s';
  const min = Math.floor(seg / 60);
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
}
// Barras CSS puras. titulos[i] va al title (tooltip). La barra máxima resalta.
function _rnBarras(data, titulos) {
  const max = Math.max.apply(null, data.concat([1]));
  const maxVal = Math.max.apply(null, data);
  const maxIdx = data.indexOf(maxVal);
  return '<div class="ks-bars">' + data.map((v, i) =>
    `<div class="kb${(i === maxIdx && v > 0) ? ' max' : ''}" style="height:${Math.max(3, Math.round(v / max * 100))}%" title="${_spEscape((titulos[i] || '') + ': ' + v)}"></div>`
  ).join('') + '</div>';
}
// 1. Oyentes conectados AHORA (tarjeta expandible con la lista).
async function _rnOyentes() {
  const el = document.getElementById('rn-oyentes');
  if (!el) return;
  try {
    const d = await _rnGet('oyentes');
    const resumen = (d.por_lugar || []).map(p => p.n + ' en ' + String(p.lugar).split(',')[0]).join(' · ') || 'nadie conectado ahora';
    const lista = (d.oyentes || []).map(o =>
      `<div class="rn-oy"><span>${_spEscape(o.lugar)}</span><span class="rn-oy-t">${_rnTiempo(o.tiempo_seg)}</span></div>`).join('');
    el.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
        <span class="ks-stat-num green" style="font-size:30px">${Number(d.total) || 0}</span>
        <span style="color:var(--ts);font-size:12px">${_spEscape(resumen)}</span>
      </div>
      ${d.total ? `<button class="btn btn-ghost btn-sm" style="font-size:11px;margin-top:8px" onclick="_rnToggleOyentes(this)">Ver lista</button>
      <div id="rn-oyentes-lista" style="display:none;margin-top:8px">${lista}</div>` : ''}`;
  } catch (e) { _rnSinDatos('rn-oyentes'); }
}
function _rnToggleOyentes(btn) {
  const l = document.getElementById('rn-oyentes-lista');
  if (!l) return;
  const abierto = l.style.display !== 'none';
  l.style.display = abierto ? 'none' : '';
  btn.textContent = abierto ? 'Ver lista' : 'Ocultar lista';
}
// 2. Oyentes ÚNICOS (report mode de AzuraCast): hoy y últimos 7 días.
async function _rnUnicos() {
  const el = document.getElementById('rn-unicos');
  if (!el) return;
  try {
    const d = await _rnGet('unicos');
    el.innerHTML = `<div style="display:flex;gap:26px;flex-wrap:wrap">
      <div><div class="ks-stat-label">Hoy</div><div class="ks-stat-num" style="font-size:30px">${Number(d.hoy) || 0}</div></div>
      <div><div class="ks-stat-label">Últimos 7 días</div><div class="ks-stat-num" style="font-size:30px">${Number(d.semana) || 0}</div></div>
    </div>`;
  } catch (e) { _rnSinDatos('rn-unicos'); }
}
// 3. Horas pico: barras de oyentes por hora del día.
async function _rnHoras() {
  const el = document.getElementById('rn-horas');
  if (!el) return;
  try {
    const d = await _rnGet('horas');
    const data = Array.isArray(d.data) ? d.data : [];
    if (!data.length) { _rnSinDatos('rn-horas'); return; }
    const labels = (Array.isArray(d.labels) && d.labels.length === data.length)
      ? d.labels : data.map((_, i) => i + 'h');
    const maxVal = Math.max.apply(null, data);
    const maxIdx = data.indexOf(maxVal);
    const pico = maxVal > 0 ? `<div style="margin-top:6px;font-size:11px;color:var(--ts)">Pico: <b style="color:var(--text)">${_spEscape(String(labels[maxIdx]))}</b> · ${maxVal} oyentes</div>` : '';
    el.innerHTML = _rnBarras(data, labels) +
      '<div class="ks-bars-lbl"><span>' + _spEscape(String(labels[0] || '')) + '</span><span>' + _spEscape(String(labels[Math.floor(labels.length / 2)] || '')) + '</span><span>' + _spEscape(String(labels[labels.length - 1] || '')) + '</span></div>' + pico;
  } catch (e) { _rnSinDatos('rn-horas'); }
}
async function _rnMasTocadas() {
  const el = document.getElementById('rn-mas-tocadas');
  if (!el) return;
  try {
    const d = await _rnGet('mas_tocadas');
    _rnMasTocadasData = Array.isArray(d.canciones) ? d.canciones : [];
    if (!_rnMasTocadasData.length) { _rnSinDatos('rn-mas-tocadas'); return; }
    el.innerHTML = _rnMasTocadasData.map((c, i) => `<div class="ks-result" onclick="_rnMasTocadasAbrir(${i})" title="Editar esta canción">
      <div class="ks-top-pos">${i + 1}</div>
      <div class="ks-track-txt">
        <div class="ks-track-t">${_spEscape(c.titulo || 'sin título')}</div>
        <div class="ks-track-a">${_spEscape(c.artista || '')}</div>
      </div>
      <div class="ks-top-likes">${Number(c.veces) || 0}×</div>
    </div>`).join('');
  } catch (e) { _rnSinDatos('rn-mas-tocadas'); }
}
function _rnMasTocadasAbrir(i) {
  const c = _rnMasTocadasData[i];
  if (c) radioMediaAbrirPorNombre(c.titulo, c.artista);
}
// 5. Likes por día (mini-barras de 7 días, agrupado en la function).
async function _rnLikesDias() {
  const el = document.getElementById('rn-likes-dias');
  if (!el) return;
  try {
    const d = await _rnGet('likes_dias');
    const dias = Array.isArray(d.dias) ? d.dias : [];
    if (!dias.length) { _rnSinDatos('rn-likes-dias'); return; }
    const data = dias.map(x => Number(x.likes) || 0);
    const lbls = dias.map(x => {
      try { return new Date(x.dia + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'short', timeZone: 'UTC' }); }
      catch (e) { return x.dia; }
    });
    el.innerHTML = _rnBarras(data, dias.map(x => x.dia)) +
      '<div class="ks-bars-lbl cols">' + lbls.map(l => '<span>' + _spEscape(l) + '</span>').join('') + '</div>' +
      `<div style="margin-top:6px;font-size:11px;color:var(--ts)">Total: <b style="color:var(--text)">${data.reduce((a, b) => a + b, 0)}</b> likes en 7 días</div>`;
  } catch (e) { _rnSinDatos('rn-likes-dias'); }
}
// 6. Peticiones: pendientes vs atendidas (histórico) + pendientes con 3+ días.
async function _rnPeticionesResumen() {
  const el = document.getElementById('rn-peticiones');
  if (!el) return;
  try {
    const d = await _rnGet('peticiones_resumen');
    const viejas = Number(d.viejas_3d) || 0;
    el.innerHTML = `<div style="display:flex;gap:26px;flex-wrap:wrap">
      <div><div class="ks-stat-label">Pendientes</div><div class="ks-stat-num red" style="font-size:30px">${Number(d.pendientes) || 0}</div></div>
      <div><div class="ks-stat-label">Atendidas (histórico)</div><div class="ks-stat-num green" style="font-size:30px">${Number(d.atendidas) || 0}</div></div>
    </div>
    ${viejas ? `<div style="margin-top:8px;font-size:12px;color:#FF6B6B">${viejas} pendiente${viejas === 1 ? '' : 's'} lleva${viejas === 1 ? '' : 'n'} 3+ días sin atender</div>` : ''}`;
  } catch (e) { _rnSinDatos('rn-peticiones'); }
}
async function _radioTop20Load() {
  const box = document.getElementById('radio-top20');
  if (!box) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-radio-stats?accion=top20');
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || ('Error ' + r.status));
    _radioTop20Data = Array.isArray(d.top) ? d.top : [];
    if (!_radioTop20Data.length) {
      box.innerHTML = '<div style="color:var(--ts);font-size:13px;padding:6px 0">Aún sin likes esta semana.</div>';
      return;
    }
    let html = '';
    _radioTop20Data.forEach((t, i) => {
      const pos = i + 1;
      if (pos === 11) html += '<div class="ks-top-cut">línea de corte del Top público</div>';
      const ini = _radioInicialesArt(t.artista || t.titulo);
      const img = t.art ? `<img src="${_spEscape(t.art)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
      html += `<div class="ks-result${pos > 10 ? ' ks-dim' : ''}" onclick="_radioTop20Abrir(${i})" title="Editar esta canción">
        <div class="ks-top-pos">${pos}</div>
        <div class="ks-art"><div class="ks-art-ph">${_spEscape(ini)}</div>${img}</div>
        <div class="ks-track-txt">
          <div class="ks-track-t">${_spEscape(t.titulo || 'sin título')}</div>
          <div class="ks-track-a">${_spEscape(t.artista || '')}</div>
        </div>
        <div class="ks-top-likes"><svg class="ic"><use href="#ic-corazon"/></svg> ${Number(t.likes) || 0}</div>
      </div>`;
    });
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = '<div style="color:#FF6B6B;font-size:13px">Error: ' + _spEscape(e.message) + '</div>';
  }
}
function _radioTop20Abrir(i) {
  const t = _radioTop20Data[i];
  if (t) radioMediaAbrirPorNombre(t.titulo, t.artista);
}
// Actualiza el número grande + su indicador de tendencia contra la carga previa.
// neutral=true muestra el cambio en tono apagado (sin verde/rojo de valor).
function _radioSetNum(key, val, neutral) {
  const numEl = document.getElementById('radio-num-' + key);
  const trEl = document.getElementById('radio-num-' + key + '-tr');
  if (numEl) numEl.textContent = val;
  if (trEl) {
    const prev = _radioNumPrev[key];
    let cls = 'flat', txt = '';
    if (prev != null && val !== prev) {
      const up = val > prev;
      cls = neutral ? 'flat' : (up ? 'up' : 'down');
      txt = up ? ('▲ +' + (val - prev)) : ('▼ −' + (prev - val));
    } else if (prev != null) {
      txt = '– sin cambio';
    }
    trEl.className = 'ks-stat-trend ' + cls;
    trEl.textContent = txt;
  }
  _radioNumPrev[key] = val;
}
// ── TAB "Control" — control remoto de la estación (Fase 3) ──────────────────
// La cola y las acciones (saltar/recargar/reiniciar) pasan por admin-radio-control
// (API key server-side). "Recién sonaron" sale de song_history de nowplaying
// pública. El "Sonando ahora" ya vive en el hero. Cada bloque falla-soft.
function loadRadioControl() {
  _loadRadioCola();
  _loadRadioHistorial();
}
// "Recién sonaron" — últimas 5 de song_history (nowplaying pública).
function _loadRadioHistorial() {
  const box = document.getElementById('radio-ctrl-historial');
  if (!box) return;
  fetch(RADIO_NOWPLAYING)
    .then(r => r.json())
    .then(d => {
      const hist = (d && Array.isArray(d.song_history)) ? d.song_history.slice(0, 5) : [];
      if (!hist.length) { box.innerHTML = `<div style="color:var(--ts);font-size:13px">Sin historial todavía.</div>`; return; }
      box.innerHTML = hist.map(h => {
        const s = (h && h.song) || {};
        return _radioTrackHtml(s.title, s.artist, _radioArtHost(s.art), null);
      }).join('');
    })
    .catch(() => { box.innerHTML = `<div style="color:var(--ts);font-size:13px">No disponible.</div>`; });
}
// Normaliza una URL de arte al host público conservando path+query (que ya trae
// el unique_id correcto). NO inventa /art/{id}. Sin URL → '' (placeholder).
function _radioArtHost(url) {
  const raw = String(url || '');
  if (!raw) return '';
  try {
    const u = new URL(raw, 'https://radio.conectareynosa.mx');
    return 'https://radio.conectareynosa.mx' + u.pathname + u.search;
  } catch (e) {
    return (raw.charAt(0) === '/') ? ('https://radio.conectareynosa.mx' + raw) : raw;
  }
}
// Hasta 2 iniciales del artista (o título) para el placeholder de la carátula.
function _radioInicialesArt(txt) {
  const w = String(txt || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[1][0]).toUpperCase();
}
// Fila de track (cola / recién sonaron). Placeholder con iniciales SIEMPRE detrás;
// la carátula va encima con onerror que la oculta — nunca se ve la imagen rota.
// idx = número de orden (cola) o null (historial). Clickeable → editar (Fase 4):
// busca por título+artista en la biblioteca y abre el resultado más parecido.
function _radioTrackHtml(titulo, artista, art, idx) {
  titulo = titulo || 'sin título';
  artista = artista || '';
  const ini = _radioInicialesArt(artista || titulo);
  const ph = `<div class="ks-art-ph">${_spEscape(ini)}</div>`;
  const img = art
    ? `<img src="${_spEscape(art)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '';
  const idxHtml = (idx != null) ? `<span class="ks-track-idx">${idx}</span>` : '';
  const oc = `radioMediaAbrirPorNombre('${_radioJs(titulo)}','${_radioJs(artista)}')`;
  return `<div class="ks-track ks-track-click" onclick="${oc}" title="Editar esta canción">${idxHtml}<div class="ks-art">${ph}${img}</div>
    <div class="ks-track-txt">
      <div class="ks-track-t">${_spEscape(titulo)}</div>
      <div class="ks-track-a">${_spEscape(artista)}</div>
    </div></div>`;
}
async function _loadRadioCola() {
  const box = document.getElementById('radio-ctrl-cola');
  if (!box) return;
  box.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-radio-control?accion=cola');
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('Error ' + r.status));
    const cola = Array.isArray(j.cola) ? j.cola : [];
    if (!cola.length) {
      box.innerHTML = `<div style="color:var(--ts);font-size:13px">La cola está vacía.</div>`;
      return;
    }
    box.innerHTML = cola.map((c, i) => _radioTrackHtml(c.titulo, c.artista, _radioArtHost(c.caratula), i + 1)).join('');
  } catch (e) {
    box.innerHTML = `<div style="color:#FF6B6B;font-size:13px">Error: ${_spEscape(e.message)}</div>`;
  }
}
// Copia el link del stream al portapapeles con confirmación visual en el botón.
function radioCopiarStream(btn) {
  const done = () => {
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copiado';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1800);
    }
    showToast('Link del stream copiado.', 'success');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(RADIO_STREAM_URL).then(done).catch(() => _radioCopyFallback(RADIO_STREAM_URL, done));
  } else {
    _radioCopyFallback(RADIO_STREAM_URL, done);
  }
}
function _radioCopyFallback(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand('copy'); ta.remove();
    done();
  } catch (e) {
    showToast('No se pudo copiar. Link: ' + text, 'error');
  }
}
// Escape para incrustar texto dentro de un onclick='fn("...")' (contexto JS + HTML).
function _radioJs(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    .replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/[\r\n]+/g, ' ');
}
// GET ?buscar= → biblioteca de AzuraCast. Devuelve array de archivos.
async function _radioMediaSearch(q) {
  const r = await khAdminFetch('/.netlify/functions/admin-radio-media?buscar=' + encodeURIComponent(q));
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || ('Error ' + r.status));
  return Array.isArray(j.archivos) ? j.archivos : [];
}
// Buscador del tab Control.
// Biblioteca: buscador global por CANCIÓN (mismo GET ?buscar= del Control, que
// busca en títulos/rutas). Reusa _radioMediaResults + _radioResultHtml → el click
// abre el mismo modal de edición, sin navegar carpetas.
async function bibBuscarCancion() {
  const inp = document.getElementById('bib-song-q');
  const box = document.getElementById('bib-song-res');
  const q = (inp ? inp.value : '').trim();
  if (!box) return;
  if (!q) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="loading-state"><div class="spinner"></div>Buscando…</div>';
  try {
    _radioMediaResults = await _radioMediaSearch(q);
    box.innerHTML = _radioMediaResults.length
      ? _radioMediaResults.map((a, i) => _radioResultHtml(a, i)).join('')
      : '<div style="color:var(--ts);font-size:13px;padding:6px 0">Sin resultados en la biblioteca.</div>';
  } catch (e) {
    box.innerHTML = '<div style="color:#FF6B6B;font-size:13px">Error: ' + _spEscape(e.message) + '</div>';
  }
}
async function radioMediaBuscar() {
  const inp = document.getElementById('radio-media-q');
  const box = document.getElementById('radio-media-res');
  const q = (inp ? inp.value : '').trim();
  if (!box) return;
  if (!q) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="loading-state"><div class="spinner"></div>Buscando…</div>';
  try {
    _radioMediaResults = await _radioMediaSearch(q);
    if (!_radioMediaResults.length) {
      box.innerHTML = '<div style="color:var(--ts);font-size:13px;padding:6px 0">Sin resultados en la biblioteca.</div>';
      return;
    }
    box.innerHTML = _radioMediaResults.map((a, i) => _radioResultHtml(a, i)).join('');
  } catch (e) {
    box.innerHTML = '<div style="color:#FF6B6B;font-size:13px">Error: ' + _spEscape(e.message) + '</div>';
  }
}
function _radioResultHtml(a, i) {
  const ini = _radioInicialesArt(a.artista || a.titulo);
  const ph = `<div class="ks-art-ph">${_spEscape(ini)}</div>`;
  const img = a.art
    ? `<img src="${_spEscape(a.art)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '';
  const sub = [a.artista, a.album].filter(Boolean).join(' · ');
  return `<div class="ks-result" onclick="radioMediaAbrirModalIdx(${i})" title="Editar esta canción">
    <div class="ks-art">${ph}${img}</div>
    <div class="ks-track-txt">
      <div class="ks-track-t">${_spEscape(a.titulo || 'sin título')}</div>
      <div class="ks-track-a">${_spEscape(sub)}</div>
    </div></div>`;
}
// Click en un track de cola / historial / hero → busca por nombre y abre el mejor.
async function radioMediaAbrirPorNombre(titulo, artista) {
  const tit = String(titulo || '').trim();
  const art = String(artista || '').trim();
  if (!tit) return;
  // AzuraCast matchea substring sobre "Artista - Título"; mandar título+artista
  // concatenados no coincide con ese orden → 0 filas. Buscamos SOLO por título.
  try {
    let arch = await _radioMediaSearch(tit);
    let best = _radioMediaMejorPorArtista(arch, art);
    // Fallback: si el título no trajo nada, busca por artista y filtra por título.
    if (!best && art) {
      const porArtista = await _radioMediaSearch(art);
      best = _radioMediaMejorPorTitulo(porArtista, tit);
    }
    if (best) { radioMediaAbrirModal(best); return; }
    // Nada automático: deja que Memo elija a mano con el buscador precargado.
    _radioMediaEnfocarBuscador(tit);
  } catch (e) {
    showToast('Error buscando: ' + e.message, 'error');
  }
}
function _ciIncluye(a, b) {
  a = String(a || '').toLowerCase().trim();
  b = String(b || '').toLowerCase().trim();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}
// De los resultados, el de artista más parecido (includes en ambos sentidos);
// si no hay artista de referencia, el primero. null si la lista viene vacía.
function _radioMediaMejorPorArtista(arch, artista) {
  if (!arch || !arch.length) return null;
  if (!artista) return arch[0];
  return arch.find(a => _ciIncluye(a.artista, artista)) || arch[0];
}
// De los resultados (buscados por artista), el de título más parecido.
function _radioMediaMejorPorTitulo(arch, titulo) {
  if (!arch || !arch.length) return null;
  return arch.find(a => _ciIncluye(a.titulo, titulo)) || null;
}
// Salta al tab Control, precarga el buscador con el título y lo enfoca.
function _radioMediaEnfocarBuscador(titulo) {
  const btn = document.getElementById('radio-tab-btn-control');
  if (btn) showRadioTab('control', btn);
  const inp = document.getElementById('radio-media-q');
  if (inp) {
    inp.value = titulo;
    inp.focus();
    inp.select();
    radioMediaBuscar();
  }
  showToast('No encontré esa canción sola. Búscala y elígela a mano.', 'error');
}
// Click en "Sonando ahora" (hero) → edita la canción al aire.
function radioMediaAbrirSonando() {
  const t = document.getElementById('ks-hero-titulo');
  const a = document.getElementById('ks-hero-artista');
  const tit = t ? t.textContent.trim() : '';
  const art = a ? a.textContent.trim() : '';
  if (!tit || tit === 'Cargando…' || tit === 'Sin datos' || tit === 'No disponible') return;
  radioMediaAbrirPorNombre(tit, art);
}
function radioMediaAbrirModalIdx(i) {
  const a = _radioMediaResults[i];
  if (a) radioMediaAbrirModal(a);
}
// Abre el modal con los datos del archivo y refina con los tags reales (/leer).
async function radioMediaAbrirModal(a) {
  if (!a || !a.ruta) { showToast('Esa canción no tiene ruta editable.', 'error'); return; }
  _radioMediaNuevaPortada = null;
  // openModal PRIMERO: limpia el primer input[type=hidden] del modal (que es
  // #rm-ruta). Si abriéramos DESPUÉS de fijar la ruta, la borraría y el guardado
  // fallaría con "Falta la ruta del archivo" (bug que afectaba a búsqueda y a
  // Biblioteca por igual). Abrir antes de poblar deja la ruta intacta.
  openModal('modal-radio-media');
  document.getElementById('rm-ruta').value = a.ruta;
  document.getElementById('rm-titulo').value = a.titulo || '';
  document.getElementById('rm-artista').value = a.artista || '';
  document.getElementById('rm-album').value = a.album || '';
  document.getElementById('rm-artista-album').value = a.artista || ''; // provisional hasta /leer
  const fileInp = document.getElementById('rm-file'); if (fileInp) fileInp.value = '';
  _radioMediaSetCover(a.art, a.artista || a.titulo);
  _radioMediaAlert('', false);
  radioMediaBorrarCancelar(); // resetea la advertencia de eliminar (modal reusado)
  // Refinar con los tags REALES del archivo (incluye artista_album).
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-radio-media?leer=' + encodeURIComponent(a.ruta));
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok !== false) {
      if (j.titulo)  document.getElementById('rm-titulo').value = j.titulo;
      if (j.artista) document.getElementById('rm-artista').value = j.artista;
      if (j.album != null)  document.getElementById('rm-album').value = j.album;
      // Artista del álbum: lo que devuelva /leer, o igual al artista si viene vacío.
      const aa = (j.artista_album && j.artista_album.trim()) ? j.artista_album : (j.artista || a.artista || '');
      document.getElementById('rm-artista-album').value = aa;
    }
  } catch (e) { /* nos quedamos con los valores del resultado de búsqueda */ }
}
function _radioMediaSetCover(url, nombre) {
  const box = document.getElementById('rm-cover');
  if (!box) return;
  const prev = box.querySelector('img'); if (prev) prev.remove();
  const ph = document.getElementById('rm-cover-ph'); if (ph) ph.textContent = _radioInicialesArt(nombre);
  if (url) {
    const img = document.createElement('img');
    img.alt = ''; img.onerror = () => img.remove(); img.src = url;
    box.appendChild(img);
  }
}
// Elige nueva portada: valida, redimensiona a máx 1000px en cliente, guarda base64.
function radioMediaPreviewPortada(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  if (!/^image\/(jpeg|png)$/.test(f.type)) { showToast('Usa una imagen JPG o PNG.', 'error'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const im = new Image();
    im.onload = () => {
      const max = 1000;
      let w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
      if (w > max || h > max) { const s = Math.min(max / w, max / h); w = Math.round(w * s); h = Math.round(h * s); }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(im, 0, 0, w, h);
      const mime = (f.type === 'image/png') ? 'image/png' : 'image/jpeg';
      const dataUrl = cv.toDataURL(mime, mime === 'image/jpeg' ? 0.9 : undefined);
      const b64 = (dataUrl.split(',')[1]) || '';
      _radioMediaNuevaPortada = { imagen: b64, mime };
      const box = document.getElementById('rm-cover');
      if (box) { const prev = box.querySelector('img'); if (prev) prev.remove(); const img = document.createElement('img'); img.alt = ''; img.src = dataUrl; box.appendChild(img); }
    };
    im.onerror = () => showToast('No pude leer esa imagen.', 'error');
    im.src = e.target.result;
  };
  reader.onerror = () => showToast('No pude leer el archivo.', 'error');
  reader.readAsDataURL(f);
}
// Guarda tags (y portada si hay una nueva). Escribe DENTRO del archivo original.
async function radioMediaGuardar() {
  const btn = document.getElementById('rm-guardar');
  const ruta = document.getElementById('rm-ruta').value;
  if (!ruta) { _radioMediaAlert('Falta la ruta del archivo.', true); return; }
  const titulo        = document.getElementById('rm-titulo').value.trim();
  const artista       = document.getElementById('rm-artista').value.trim();
  const album         = document.getElementById('rm-album').value.trim();
  const artista_album = document.getElementById('rm-artista-album').value.trim();
  if (btn) btn.disabled = true;
  _radioMediaAlert('Guardando…', false);
  try {
    // 1) Tags
    const r = await khAdminFetch('/.netlify/functions/admin-radio-media', {
      method: 'POST', body: JSON.stringify({ accion: 'editar', ruta, titulo, artista, album, artista_album }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('Error ' + r.status));
    // 2) Portada (solo si el usuario eligió una nueva)
    if (_radioMediaNuevaPortada) {
      const rp = await khAdminFetch('/.netlify/functions/admin-radio-media', {
        method: 'POST', body: JSON.stringify({ accion: 'portada', ruta, imagen: _radioMediaNuevaPortada.imagen, mime: _radioMediaNuevaPortada.mime }),
      });
      const jp = await rp.json().catch(() => ({}));
      if (!rp.ok || jp.ok === false) throw new Error(jp.error || ('Portada: error ' + rp.status));
    }
    showToast('Cambios guardados en el archivo.', 'success');
    _radioMediaNuevaPortada = null;
    closeModal('modal-radio-media');
    setTimeout(() => { _loadRadioHero(); }, 600); // refresca la vista (la radio tarda ~5 min)
  } catch (e) {
    _radioMediaAlert('No se pudo guardar: ' + e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}
function _radioMediaAlert(msg, isErr) {
  const el = document.getElementById('radio-media-alert');
  if (!el) return;
  if (!msg) { el.innerHTML = ''; return; }
  const style = isErr
    ? 'border:1px solid rgba(255,90,77,.4);color:var(--red);background:rgba(255,90,77,.1)'
    : 'border:1px solid var(--border);color:var(--ts);background:rgba(255,255,255,.03)';
  el.innerHTML = `<div style="padding:9px 12px;border-radius:var(--r-sm,8px);font-size:12px;margin-bottom:14px;${style}">${_spEscape(msg)}</div>`;
}
// ── Eliminar canción (doble confirmación fuerte) ──────────────────────────
// Primer click: advertencia inline. "Sí, eliminar" → borra del disco PARA
// SIEMPRE vía admin-radio-media {accion:'borrar'} (editor del NAS /borrar +
// aviso best-effort a AzuraCast). Tras eliminar: cierra el modal, toast y
// refresca la vista de donde vino (Biblioteca o buscador).
function radioMediaBorrarPedir() {
  const box = document.getElementById('rm-borrar-confirm');
  const btn = document.getElementById('rm-borrar');
  if (box) box.style.display = 'block';
  if (btn) btn.style.display = 'none';
}
function radioMediaBorrarCancelar() {
  const box = document.getElementById('rm-borrar-confirm');
  const btn = document.getElementById('rm-borrar');
  if (box) box.style.display = 'none';
  if (btn) btn.style.display = '';
}
async function radioMediaBorrar() {
  const ruta = document.getElementById('rm-ruta').value;
  if (!ruta) { _radioMediaAlert('Falta la ruta del archivo.', true); return; }
  const btn = document.getElementById('rm-borrar-si');
  if (btn) btn.disabled = true;
  _radioMediaAlert('Eliminando…', false);
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-radio-media', {
      method: 'POST', body: JSON.stringify({ accion: 'borrar', ruta }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('Error ' + r.status));
    closeModal('modal-radio-media');
    showToast('Canción eliminada', 'success');
    _radioMediaRefrescarOrigen();
  } catch (e) {
    _radioMediaAlert('No se pudo eliminar: ' + e.message, true);
  } finally {
    if (btn) btn.disabled = false;
    radioMediaBorrarCancelar();
  }
}
// Refresca la vista de donde vino la canción eliminada: la carpeta abierta de
// Biblioteca y/o los resultados vivos del buscador. Fails-soft.
function _radioMediaRefrescarOrigen() {
  try {
    if (Array.isArray(_bibCrumbs) && _bibCrumbs.length) {
      _bibMostrarDir(_bibCrumbs[_bibCrumbs.length - 1].ruta, _bibPagina);
    }
    const q = document.getElementById('radio-media-q');
    const res = document.getElementById('radio-media-res');
    if (q && q.value.trim() && res && res.innerHTML.trim()) radioMediaBuscar();
  } catch (e) { /* fails-soft */ }
}
async function loadRadioBiblioteca() {
  _bibCrumbs = [];
  _bibRenderCrumbs();
  if (_bibArtistas) { _bibRenderRaiz(); return; }
  const cont = document.getElementById('bib-contenido');
  _bibToggleRaizUI(true);
  if (cont) cont.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando biblioteca…</div>';
  try {
    _bibArtistas = await _bibCargarRaizTodo();
    _bibRenderRaiz();
  } catch (e) {
    if (cont) cont.innerHTML = `<div style="color:#FF6B6B;font-size:13px">Error: ${_spEscape(e.message)}</div>`;
  }
}
// GET ?dir= de una carpeta (una página).
async function _bibFetchDir(ruta, page) {
  const r = await khAdminFetch('/.netlify/functions/admin-radio-media?dir=' + encodeURIComponent(ruta) + '&page=' + (page || 1));
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || ('Error ' + r.status));
  return {
    carpetas: Array.isArray(j.carpetas) ? j.carpetas : [],
    archivos: Array.isArray(j.archivos) ? j.archivos : [],
    pagina: j.pagina || 1,
    total_paginas: j.total_paginas || 1,
  };
}
// Carga TODAS las páginas de la raíz (solo carpetas → ligero) y ordena A-Z.
async function _bibCargarRaizTodo() {
  let page = 1, carpetas = [], guard = 0;
  while (guard++ < 50) {
    const d = await _bibFetchDir('', page);
    carpetas = carpetas.concat(d.carpetas);
    if (page >= d.total_paginas) break;
    page++;
  }
  carpetas.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
  return carpetas;
}
// Primera letra normalizada (sin acentos): A-Z o '#'.
function _bibLetraDe(nombre) {
  const c = String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().charAt(0).toUpperCase();
  return (c >= 'A' && c <= 'Z') ? c : '#';
}
function _bibArtistasFiltrados() {
  let arr = _bibArtistas || [];
  if (_bibLetra) arr = arr.filter(a => _bibLetraDe(a.nombre) === _bibLetra);
  if (_bibBusqueda) {
    const q = _bibBusqueda.toLowerCase();
    arr = arr.filter(a => String(a.nombre || '').toLowerCase().includes(q));
  }
  return arr;
}
function _bibAbecedarioHtml() {
  const letras = ['Todas'];
  for (let i = 65; i <= 90; i++) letras.push(String.fromCharCode(i));
  letras.push('#');
  return letras.map(l => {
    const val = (l === 'Todas') ? '' : l;
    const activo = (_bibLetra === val) ? ' active' : '';
    return `<button class="ks-abc-btn${activo}" onclick="_bibFiltrarLetra('${val}')">${l}</button>`;
  }).join('');
}
function _bibFiltrarLetra(l) {
  _bibLetra = l || '';
  _bibRenderRaiz();
}
function _bibOnBuscar(v) {
  _bibBusqueda = String(v || '').trim();
  _bibRenderRaiz();
}
function _bibRenderRaiz() {
  _bibRenderCrumbs();
  _bibToggleRaizUI(true);
  const abc = document.getElementById('bib-abc'); if (abc) abc.innerHTML = _bibAbecedarioHtml();
  const pager = document.getElementById('bib-paginacion'); if (pager) pager.innerHTML = '';
  const cont = document.getElementById('bib-contenido'); if (!cont) return;
  const arts = _bibArtistasFiltrados();
  if (!arts.length) {
    cont.innerHTML = '<div style="color:var(--ts);font-size:13px;padding:12px 0">Sin artistas para ese filtro.</div>';
    return;
  }
  cont.innerHTML = '<div class="ks-folder-grid">' + arts.map(a => _bibFolderHtml(a)).join('') + '</div>';
}
function _bibFolderHtml(a) {
  const oc = `_bibIrDir('${_radioJs(a.ruta)}','${_radioJs(a.nombre)}')`;
  return `<div class="ks-folder" onclick="${oc}" title="Abrir">
    <div class="ks-folder-name">${_spEscape(a.nombre || nombreCorto(a.ruta))}</div>
    <span class="ks-folder-chev">›</span>
  </div>`;
}
function nombreCorto(p) { const s = String(p || '').replace(/\/+$/, ''); const i = s.lastIndexOf('/'); return i >= 0 ? s.slice(i + 1) : s; }
// Entrar a una carpeta (artista o álbum): agrega migaja y carga.
async function _bibIrDir(ruta, nombre) {
  _bibCrumbs.push({ nombre, ruta });
  await _bibMostrarDir(ruta, 1);
}
async function _bibMostrarDir(ruta, page) {
  _bibRenderCrumbs();
  _bibToggleRaizUI(false);
  const cont = document.getElementById('bib-contenido');
  const pager = document.getElementById('bib-paginacion'); if (pager) pager.innerHTML = '';
  if (cont) cont.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
  try {
    const d = await _bibFetchDir(ruta, page);
    _bibArchivos = d.archivos;
    _bibPagina = d.pagina;
    _bibTotalPaginas = d.total_paginas;
    _bibRenderDir(d, ruta);
  } catch (e) {
    if (cont) cont.innerHTML = `<div style="color:#FF6B6B;font-size:13px">Error: ${_spEscape(e.message)}</div>`;
  }
}
function _bibRenderDir(d, ruta) {
  const cont = document.getElementById('bib-contenido'); if (!cont) return;
  let html = '';
  if (d.carpetas.length) {
    html += '<div class="ks-folder-grid">' + d.carpetas.map(c => _bibFolderHtml(c)).join('') + '</div>';
  }
  if (d.archivos.length) {
    html += `<div class="ks-results" style="margin-top:${d.carpetas.length ? '14px' : '0'}">`
      + d.archivos.map((a, i) => _bibTrackHtml(a, i)).join('') + '</div>';
  }
  if (!d.carpetas.length && !d.archivos.length) {
    html = '<div style="color:var(--ts);font-size:13px;padding:12px 0">Esta carpeta está vacía.</div>';
  }
  cont.innerHTML = html;
  _bibRenderPaginacion(ruta);
}
// Canción de la biblioteca: miniatura + metadata + badges de auxilio + abre modal.
function _bibTrackHtml(a, i) {
  const ini = _radioInicialesArt(a.artista || a.titulo);
  const ph = `<div class="ks-art-ph">${_spEscape(ini)}</div>`;
  const img = a.art
    ? `<img src="${_spEscape(a.art)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '';
  const badges = [];
  if (!String(a.titulo || '').trim())  badges.push('<span class="badge badge-red">sin título</span>');
  if (!String(a.artista || '').trim()) badges.push('<span class="badge badge-orange">sin artista</span>');
  if (!String(a.album || '').trim())   badges.push('<span class="badge badge-orange">sin álbum</span>');
  const sub = [a.artista, a.album].filter(Boolean).join(' · ');
  return `<div class="ks-result" onclick="_bibAbrirArchivo(${i})" title="Editar esta canción">
    <div class="ks-art">${ph}${img}</div>
    <div class="ks-track-txt">
      <div class="ks-track-t">${_spEscape(a.titulo || '(sin título)')}</div>
      <div class="ks-track-a">${_spEscape(sub || '—')}</div>
      ${badges.length ? `<div class="ks-badges">${badges.join('')}</div>` : ''}
    </div></div>`;
}
function _bibAbrirArchivo(i) {
  const a = _bibArchivos[i];
  if (a) radioMediaAbrirModal(a); // ruta directa, sin pasar por búsqueda
}
// Migajas: Artistas > Artista > Álbum …
function _bibRenderCrumbs() {
  const el = document.getElementById('bib-crumbs'); if (!el) return;
  const parts = [`<span class="ks-crumb${_bibCrumbs.length ? ' ks-crumb-link' : ''}" onclick="_bibVolverRaiz()">Artistas</span>`];
  _bibCrumbs.forEach((c, idx) => {
    const last = (idx === _bibCrumbs.length - 1);
    parts.push('<span class="ks-crumb-sep">›</span>');
    parts.push(`<span class="ks-crumb${last ? '' : ' ks-crumb-link'}"${last ? '' : ` onclick="_bibVolverA(${idx})"`}>${_spEscape(c.nombre)}</span>`);
  });
  el.innerHTML = parts.join('');
}
function _bibVolverRaiz() {
  _bibCrumbs = [];
  _bibRenderRaiz(); // conserva el filtro de letra/búsqueda activo
}
function _bibVolverA(idx) {
  const target = _bibCrumbs[idx];
  _bibCrumbs = _bibCrumbs.slice(0, idx + 1);
  _bibMostrarDir(target.ruta, 1);
}
function _bibRenderPaginacion(ruta) {
  const el = document.getElementById('bib-paginacion'); if (!el) return;
  if (_bibTotalPaginas <= 1) { el.innerHTML = ''; return; }
  const prev = _bibPagina > 1, next = _bibPagina < _bibTotalPaginas;
  el.innerHTML =
    `<button class="btn btn-ghost btn-sm" ${prev ? '' : 'disabled'} onclick="_bibPaginar('${_radioJs(ruta)}',${_bibPagina - 1})" style="font-size:11px">Anterior</button>`
    + `<span class="ks-pager-info">Página ${_bibPagina} de ${_bibTotalPaginas}</span>`
    + `<button class="btn btn-ghost btn-sm" ${next ? '' : 'disabled'} onclick="_bibPaginar('${_radioJs(ruta)}',${_bibPagina + 1})" style="font-size:11px">Siguiente</button>`;
}
function _bibPaginar(ruta, page) {
  _bibMostrarDir(ruta, page);
}
function _bibToggleRaizUI(show) {
  const abc = document.getElementById('bib-abc');
  const tb = document.getElementById('bib-toolbar');
  if (abc) abc.style.display = show ? '' : 'none';
  if (tb) tb.style.display = show ? '' : 'none';
}
// Acción POST genérica al control. btnId se deshabilita mientras corre.
async function _radioControlAccion(accion, btnId, okMsg) {
  const btn = btnId && document.getElementById(btnId);
  if (btn) btn.disabled = true;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-radio-control', {
      method: 'POST', body: JSON.stringify({ accion }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('Error ' + r.status));
    showToast(okMsg, 'success');
    return true;
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
    return false;
  } finally {
    if (btn) btn.disabled = false;
  }
}
async function radioControlSaltar() {
  if (!confirm('¿Saltar la canción que está sonando ahora?')) return;
  const ok = await _radioControlAccion('saltar', 'ks-hero-saltar', 'Canción saltada.');
  if (ok) { setTimeout(() => { _loadRadioHero(); _loadRadioCola(); _loadRadioHistorial(); }, 1500); }
}
async function radioControlRecargar() {
  await _radioControlAccion('recargar', 'radio-ctrl-recargar', 'Playlists recargadas.');
}
// Asigna todas las carpetas raíz a la playlist Todo Aleatorio (para que los
// artistas nuevos entren a la rotación). Lee la cuenta de carpetas del response.
async function radioControlSincronizar() {
  if (!confirm('¿Sincronizar la playlist Todo Aleatorio con todas las carpetas de la biblioteca?\n\nMete los artistas nuevos a la rotación (no duplica los que ya estaban).')) return;
  const btn = document.getElementById('radio-ctrl-sincronizar');
  const res = document.getElementById('radio-ctrl-sync-res');
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando…'; }
  if (res) res.style.display = 'none';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-radio-control', {
      method: 'POST', body: JSON.stringify({ accion: 'sincronizar_playlist' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('Error ' + r.status));
    const n = Number(j.carpetas) || 0;
    showToast(n + ' carpeta' + (n !== 1 ? 's' : '') + ' sincronizada' + (n !== 1 ? 's' : '') + '.', 'success');
    if (res) { res.textContent = n + ' carpeta' + (n !== 1 ? 's' : '') + ' sincronizada' + (n !== 1 ? 's' : '') + ' con Todo Aleatorio.'; res.style.display = ''; }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}
async function radioControlReiniciar() {
  if (!confirm('Reiniciar la transmisión DESCONECTA a todos los oyentes unos segundos.\n\n¿Seguro que quieres reiniciar?')) return;
  if (!confirm('Confirmación final: la transmisión se corta y vuelve sola en unos segundos. ¿Reiniciar ahora?')) return;
  await _radioControlAccion('reiniciar', 'radio-ctrl-reiniciar', 'Transmisión reiniciándose…');
}
function toggleRadioPetFiltro(btn) {
  _radioSoloPend = !_radioSoloPend;
  if (btn) btn.textContent = _radioSoloPend ? 'Solo pendientes' : 'Todas';
  if (btn) btn.classList.toggle('active', _radioSoloPend);
  _renderRadioPeticiones();
}
function _renderRadioPeticiones() {
  const tb = document.getElementById('radio-pet-tbody');
  if (!tb) return;
  const pendientes = _radioPeticiones.filter(p => !p.atendida).length;
  const badge = document.getElementById('radio-pet-badge');
  if (badge) { badge.textContent = pendientes; badge.classList.toggle('show', pendientes > 0); }
  const rows = _radioSoloPend ? _radioPeticiones.filter(p => !p.atendida) : _radioPeticiones;
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="5" style="color:var(--ts)">${_radioSoloPend ? 'Sin peticiones pendientes' : 'Sin peticiones todavía'}</td></tr>`;
    return;
  }
  tb.innerHTML = rows.map(p => {
    const id = _spEscape(p.id);
    const estado = p.atendida
      ? '<span class="badge badge-green">Atendida</span>'
      : '<span class="badge badge-orange">Pendiente</span>';
    const accion = p.atendida
      ? `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="radioAtender('${id}',false)">Reabrir</button>`
      : `<button class="btn btn-primary btn-sm" style="font-size:11px" onclick="radioAtender('${id}',true)">Atender</button>`;
    return `<tr${p.atendida ? ' style="opacity:.55"' : ''}>
      <td data-label="Fecha" style="white-space:nowrap">${_spEscape(_radioFecha(p.creado))}</td>
      <td data-label="Nombre">${_spEscape(p.nombre || '—')}</td>
      <td data-label="Petición">${_spEscape(p.peticion || '')}</td>
      <td data-label="Estado">${estado}</td>
      <td data-label="Acción">${accion}</td>
    </tr>`;
  }).join('');
}
function _renderRadioMuro() {
  const tb = document.getElementById('radio-muro-tbody');
  if (!tb) return;
  if (!_radioMuro.length) {
    tb.innerHTML = `<tr><td colspan="5" style="color:var(--ts)">El muro está vacío</td></tr>`;
    return;
  }
  tb.innerHTML = _radioMuro.map(m => {
    const id = _spEscape(m.id);
    const estado = m.visible
      ? '<span class="badge badge-green"><svg class="ic"><use href="#ic-ojo"/></svg> Visible</span>'
      : '<span class="badge badge-gray">Oculto</span>';
    const accion = m.visible
      ? `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="radioMuroVisible('${id}',false)">Ocultar</button>`
      : `<button class="btn btn-primary btn-sm" style="font-size:11px" onclick="radioMuroVisible('${id}',true)">Mostrar</button>`;
    return `<tr${m.visible ? '' : ' style="opacity:.45"'}>
      <td data-label="Fecha" style="white-space:nowrap">${_spEscape(_radioFecha(m.creado))}</td>
      <td data-label="Nombre">${_spEscape(m.nombre || '—')}</td>
      <td data-label="Mensaje">${_spEscape(m.mensaje || '')}</td>
      <td data-label="Estado">${estado}</td>
      <td data-label="Acción">${accion}</td>
    </tr>`;
  }).join('');
}
async function radioAtender(id, atendida) {
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-radio-peticiones', {
      method: 'POST', body: JSON.stringify({ id, atendida }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('Error ' + r.status));
    const it = _radioPeticiones.find(p => String(p.id) === String(id));
    if (it) it.atendida = atendida;
    _renderRadioPeticiones();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
async function radioMuroVisible(id, visible) {
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-radio-muro', {
      method: 'POST', body: JSON.stringify({ id, visible }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || ('Error ' + r.status));
    const it = _radioMuro.find(m => String(m.id) === String(id));
    if (it) it.visible = visible;
    _renderRadioMuro();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
// ═════════════════════════════════════════════════════════════════════════════
// [RADIO-V2a · 24-oct-2026] CARTELERA — la parrilla de programas de Kaio-sama
// ═════════════════════════════════════════════════════════════════════════════
// Serie RADIO-V2 (palabra de Memo: «transmitir programas en vivo, tener
// cartelera, entrevistas»): V2a = la parrilla (esta captura + radio-cartelera
// público) · V2b = el rediseño de /radio · V2c = locutores y cabina.
// Un programa es SEMANAL (día 0-6) o ESPECIAL (fecha) — exactamente uno; las
// horas van en tiempo de Reynosa y quién resuelve «qué está al aire» es
// _lib/radio-cartelera en el servidor, no esta pantalla.

const _RC_DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
let _rcProgramas = [];
let _rcEditando = null;   // id del programa en edición, o null = crear
// [RADIO-V2a2] La foto del programa: _rcFotoB64 = data-uri nueva por subir;
// _rcFotoQuitar = true cuando Memo pide quitar la existente. Reescalada en el
// navegador a ≤900px (la forma de _reqArchivoB64: FileReader→canvas, jamás blob:).
let _rcFotoB64 = null;
let _rcFotoQuitar = false;

function _rcEl(id) { return document.getElementById(id); }
function _rcEsc(s) { const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
async function _rcApi(body) {
  const r = await khAdminFetch('/.netlify/functions/admin-radio-cartelera', { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { st: r.status, j };
}

async function loadRadioCartelera() {
  const box = _rcEl('rc-lista');
  if (!box) return;
  box.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando la cartelera…</div>';
  const { st, j } = await _rcApi({ accion: 'listar' });
  if (st !== 200 || !j.ok) { box.innerHTML = `<div class="alert alert-error">${_rcEsc(j.error || ('HTTP ' + st))}</div>`; return; }
  _rcProgramas = j.programas || [];
  _rcPintar();
}

function _rcFilaHtml(p) {
  const cuando = p.fecha != null
    ? `📅 ${_rcEsc(String(p.fecha).slice(0, 10))}`
    : _rcEsc(_RC_DIAS[Number(p.dia_semana)] || '¿?');
  // [RADIO-V2a2] fin null = CIERRE LIBRE: se dice «desde las HH:MM», no se inventa un fin.
  const horas = p.hora_fin == null || p.hora_fin === ''
    ? `desde ${_rcEsc(String(p.hora_inicio).slice(0, 5))} · cierre libre`
    : `${_rcEsc(String(p.hora_inicio).slice(0, 5))}–${_rcEsc(String(p.hora_fin).slice(0, 5))}`;
  const foto = p.foto_url
    ? `<img src="${_rcEsc(p.foto_url)}" alt="" style="width:34px;height:34px;border-radius:8px;object-fit:cover;flex-shrink:0">`
    : `<span style="width:8px;height:8px;border-radius:50%;background:${p.color ? _rcEsc(p.color) : 'var(--ts)'};flex-shrink:0"></span>`;
  return `<div style="display:flex;gap:10px;align-items:center;padding:9px 6px;border-bottom:1px solid var(--border);${p.archivado ? 'opacity:.45' : ''}">
    ${foto}
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700">${_rcEsc(p.nombre)}${p.archivado ? ' <span style="font-size:10px;color:var(--ts)">(archivado)</span>' : ''}</div>
      <div style="font-size:11px;color:var(--ts)">${cuando} · ${horas}${p.conductor ? ' · ' + _rcEsc(p.conductor) : ''}</div>
    </div>
    ${p.archivado
      ? `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="radioCartArchivar('${_rcEsc(p.id)}', false)">↩ Restaurar</button>`
      : `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="radioCartEditar('${_rcEsc(p.id)}')">Editar</button>
         <button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--red)" onclick="radioCartArchivar('${_rcEsc(p.id)}', true)">Archivar</button>`}
    <button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--red)" title="Eliminar para siempre" onclick="radioCartEliminar('${_rcEsc(p.id)}')">🗑</button>
  </div>`;
}

function _rcPintar() {
  const box = _rcEl('rc-lista');
  if (!box) return;
  const vivos = _rcProgramas.filter((p) => !p.archivado);
  const semanales = vivos.filter((p) => p.fecha == null)
    .sort((a, b) => (Number(a.dia_semana) - Number(b.dia_semana)) || String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
  const especiales = vivos.filter((p) => p.fecha != null)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
  const archivados = _rcProgramas.filter((p) => p.archivado);
  const bloque = (titulo, lista) => lista.length
    ? `<div class="card" style="margin-bottom:12px"><div style="font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ts);margin-bottom:6px">${titulo}</div>${lista.map(_rcFilaHtml).join('')}</div>`
    : '';
  box.innerHTML = (vivos.length || archivados.length)
    ? bloque('Programas semanales', semanales) + bloque('Especiales (fecha puntual)', especiales) +
      (archivados.length ? `<details style="margin-top:4px"><summary style="cursor:pointer;font-size:12px;color:var(--ts)">Archivados (${archivados.length})</summary>${archivados.map(_rcFilaHtml).join('')}</details>` : '')
    : '<div class="empty-state"><div class="empty-icon">📻</div>La cartelera está vacía — captura el primer programa arriba.</div>';
}

function radioCartTipoCambia() {
  const tipo = (_rcEl('rc-tipo') || {}).value || '';
  const dia = _rcEl('rc-dia'), fecha = _rcEl('rc-fecha');
  if (dia) dia.style.display = tipo === 'semanal' ? '' : 'none';
  if (fecha) fecha.style.display = tipo === 'especial' ? '' : 'none';
}

function _rcMsg(txt, esError) {
  const m = _rcEl('rc-form-msg');
  if (m) m.innerHTML = txt ? `<span style="color:${esError ? 'var(--red)' : 'var(--green)'}">${_rcEsc(txt)}</span>` : '';
}

// [RADIO-V2a2] La foto se lee por FileReader (jamás blob: — REQ-FOTO-1: el CSP
// no lo deja) y se reescala en canvas a ≤900px, JPEG. El payload viaja chico.
function radioCartFotoCambia(input) {
  _rcFotoQuitar = false;
  const f = input && input.files && input.files[0];
  if (!f) { _rcFotoB64 = null; _rcFotoPrev(null); return; }
  const rd = new FileReader();
  rd.onload = () => {
    const img = new Image();
    img.onload = () => {
      const esc = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      _rcFotoB64 = c.toDataURL('image/jpeg', 0.85);
      _rcFotoPrev(_rcFotoB64);
    };
    img.onerror = () => { _rcFotoB64 = null; _rcMsg('Esa imagen no se pudo abrir', true); };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
}
function radioCartFotoQuitar() {
  _rcFotoB64 = null; _rcFotoQuitar = true;
  const inp = _rcEl('rc-foto'); if (inp) inp.value = '';
  _rcFotoPrev(null);
}
function _rcFotoPrev(url) {
  const box = _rcEl('rc-foto-prev');
  if (!box) return;
  box.innerHTML = url
    ? `<img src="${_rcEsc(url)}" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover"><button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="radioCartFotoQuitar()">Quitar foto</button>`
    : '';
}

function radioCartLimpiar() {
  _rcEditando = null;
  _rcFotoB64 = null; _rcFotoQuitar = false;
  const inp = _rcEl('rc-foto'); if (inp) inp.value = '';
  _rcFotoPrev(null);
  ['rc-nombre', 'rc-conductor', 'rc-desc', 'rc-inicio', 'rc-fin', 'rc-fecha'].forEach((id) => { const e = _rcEl(id); if (e) e.value = ''; });
  const t = _rcEl('rc-tipo'); if (t) t.value = '';
  const d = _rcEl('rc-dia'); if (d) d.value = '';
  radioCartTipoCambia();
  const ti = _rcEl('rc-form-titulo'); if (ti) ti.textContent = 'Nuevo programa';
  const g = _rcEl('rc-guardar'); if (g) g.textContent = 'Guardar programa';
  const c = _rcEl('rc-cancelar'); if (c) c.style.display = 'none';
  _rcMsg('');
}

function radioCartEditar(id) {
  const p = _rcProgramas.find((x) => String(x.id) === String(id));
  if (!p) return;
  _rcEditando = p.id;
  _rcEl('rc-nombre').value = p.nombre || '';
  _rcEl('rc-conductor').value = p.conductor || '';
  _rcEl('rc-desc').value = p.descripcion || '';
  _rcEl('rc-inicio').value = String(p.hora_inicio).slice(0, 5);
  _rcEl('rc-fin').value = p.hora_fin == null || p.hora_fin === '' ? '' : String(p.hora_fin).slice(0, 5);
  _rcFotoB64 = null; _rcFotoQuitar = false;
  const fi = _rcEl('rc-foto'); if (fi) fi.value = '';
  _rcFotoPrev(p.foto_url || null);
  _rcEl('rc-tipo').value = p.fecha != null ? 'especial' : 'semanal';
  radioCartTipoCambia();
  if (p.fecha != null) _rcEl('rc-fecha').value = String(p.fecha).slice(0, 10);
  else _rcEl('rc-dia').value = String(p.dia_semana);
  const ti = _rcEl('rc-form-titulo'); if (ti) ti.textContent = 'Editando: ' + p.nombre;
  const g = _rcEl('rc-guardar'); if (g) g.textContent = 'Guardar cambios';
  const c = _rcEl('rc-cancelar'); if (c) c.style.display = '';
  _rcMsg('');
}

async function radioCartGuardar() {
  const tipo = (_rcEl('rc-tipo') || {}).value || '';
  if (!tipo) { _rcMsg('Elige si el programa es semanal o especial', true); return; }
  const programa = {
    nombre: (_rcEl('rc-nombre') || {}).value || '',
    conductor: (_rcEl('rc-conductor') || {}).value || '',
    descripcion: (_rcEl('rc-desc') || {}).value || '',
    hora_inicio: (_rcEl('rc-inicio') || {}).value || '',
    hora_fin: (_rcEl('rc-fin') || {}).value || '',
  };
  if (tipo === 'semanal') programa.dia_semana = (_rcEl('rc-dia') || {}).value;
  else programa.fecha = (_rcEl('rc-fecha') || {}).value;
  if (tipo === 'semanal' && programa.dia_semana === '') { _rcMsg('Elige el día de la semana', true); return; }
  const btn = _rcEl('rc-guardar');
  if (btn) btn.disabled = true;
  const cuerpo = _rcEditando ? { accion: 'editar', id: _rcEditando, programa } : { accion: 'crear', programa };
  if (_rcFotoB64) cuerpo.foto_b64 = _rcFotoB64;
  if (_rcFotoQuitar && _rcEditando) cuerpo.foto_quitar = true;
  const { st, j } = await _rcApi(cuerpo);
  if (btn) btn.disabled = false;
  if (st !== 200 || !j.ok) { _rcMsg(j.error || ('HTTP ' + st), true); return; }
  // La foto jamás tumba el programa — pero si falló, SE DICE (no un verde a medias).
  _rcMsg(j.foto_error
    ? `Programa guardado, pero la foto no entró: ${j.foto_error}`
    : (_rcEditando ? 'Programa actualizado ✓' : 'Programa creado ✓'), !!j.foto_error);
  radioCartLimpiar();
  loadRadioCartelera();
}

// [RADIO-V2a2] Eliminar DE VERDAD (palabra de Memo). El confirm() es cortesía:
// el candado real es el confirmar:true que exige el servidor.
async function radioCartEliminar(id) {
  const p = _rcProgramas.find((x) => String(x.id) === String(id));
  if (!confirm(`¿ELIMINAR «${(p || {}).nombre || 'este programa'}» para siempre?\n\nEsto no se puede deshacer (si solo quieres pausarlo, usa Archivar).`)) return;
  const { st, j } = await _rcApi({ accion: 'eliminar', id, confirmar: true });
  if (st !== 200 || !j.ok) { showToast(j.error || ('HTTP ' + st), 'error'); return; }
  showToast('Programa eliminado', 'success');
  loadRadioCartelera();
}

async function radioCartArchivar(id, archivado) {
  const p = _rcProgramas.find((x) => String(x.id) === String(id));
  if (archivado && !confirm(`¿Archivar «${(p || {}).nombre || 'este programa'}»? Deja de salir en la cartelera pública (se puede restaurar).`)) return;
  const { st, j } = await _rcApi({ accion: 'archivar', id, archivado });
  if (st !== 200 || !j.ok) { showToast(j.error || ('HTTP ' + st), 'error'); return; }
  showToast(archivado ? 'Programa archivado' : 'Programa restaurado', 'success');
  loadRadioCartelera();
}

// ═════════════════════════════════════════════════════════════════════════════
// [KAIO-CABINA-1 · 24-oct-2026] LA CABINA — transmitir desde Kaio-sama
// ═════════════════════════════════════════════════════════════════════════════
// Palabra de Memo: «transmitir desde ahí, meter audios como samplers de ruido
// como risas grabadas y poder cambiar esos audios, buscar y reproducir música
// de nuestro catálogo». La forma:
//   · UNA mezcladora Web Audio con tres canales (mic · samplers · música) que
//     alimentan el bus MASTER. Lo que sale al aire es LA MEZCLA.
//   · El uplink es el protocolo WEBCAST de AzuraCast (wss://…/webdj/<estación>):
//     hello JSON con las credenciales del LOCUTOR + frames MP3 codificados en
//     el navegador con lamejs (vendorizado en /vendor/lame.min.js, carga
//     PEREZOSA — 156 KB que solo paga quien abre la cabina).
//   · El monitor local toca samplers+música; el MIC jamás se monitorea (se
//     acopla con las bocinas). El soundboard vive en radio_samplers + bucket
//     público; la búsqueda de música es la de admin-radio-media (?buscar=) —
//     la que ya usan Control y Biblioteca: no se gemelea.
// Las funciones cabinaWsUrl/cabinaHello/cabF32aI16/cabMMSS son PURAS a
// propósito: mide:kaio-cabina-1 las rebana y las corre en vm.

const _cb = {
  ctx: null, master: null, buses: {}, monitorGain: null, analyser: null,
  micStream: null, micSrc: null,
  ws: null, enc: null, proc: null, procSink: null, reloj: null, aireDesde: 0,
  samplers: [], cacheAudio: {}, vivos: [],
  mus: { buffer: null, src: null, nombre: '', offset: 0, inicioCtx: 0, sonando: false },
  vuRAF: null, lamePromesa: null,
};
function _cbEl(id) { return document.getElementById(id); }
function _cbMsg(id, txt, esError) {
  const m = _cbEl(id);
  if (m) m.innerHTML = txt ? `<span style="color:${esError ? 'var(--red)' : 'var(--green)'}">${_rcEsc(txt)}</span>` : '';
}
async function _cbApi(body) {
  const r = await khAdminFetch('/.netlify/functions/admin-radio-cabina', { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { st: r.status, j };
}

// ── Las PURAS del uplink ─────────────────────────────────────────────────────
// La URL del webcast: el shortcode es el MISMO del nowplaying público
// (/api/nowplaying/radioconecta) — una estación, un nombre.
function cabinaWsUrl() { return 'wss://radio.conectareynosa.mx/webdj/radioconecta/'; }
// El hello del protocolo webcast (webcast.js): mime + credenciales del locutor
// + la ficha del audio. Sin user/password AzuraCast rechaza la conexión.
function cabinaHello(usuario, contrasena, sampleRate) {
  return { type: 'hello', data: { mime: 'audio/mpeg', user: String(usuario || ''), password: String(contrasena || ''),
    audio: { channels: 2, samplerate: Number(sampleRate) || 44100, bitrate: 192, encoder: 'lamejs' } } };
}
// [KAIO-CABINA-6] La METADATA del show viaja por el MISMO webcast, después del
// hello. Sin ella AzuraCast sigue reportando la última canción del AutoDJ y la
// página pública se queda con el álbum y el título viejos mientras el show
// suena (reporte de Memo, primera transmisión real). El título sale de la
// PARRILLA cuando hay programa al aire; sin programa, «Transmisión en vivo» —
// jamás se inventa un show que la cartelera no dice.
function cabinaMetadata(cartelera, locutor) {
  const p = cartelera && cartelera.al_aire;
  return { type: 'metadata', data: {
    title: (p && p.nombre) ? String(p.nombre) : 'Transmisión en vivo',
    artist: (p && p.conductor) ? String(p.conductor) : (String(locutor || '') || 'Radio Conecta')
  } };
}
// Float32 [-1,1] → Int16 para lamejs, con clamp (un pico >1.0 sin clamp da wrap).
function cabF32aI16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const v = Math.max(-1, Math.min(1, f32[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}
function cabMMSS(seg) {
  const s = Math.max(0, Math.floor(Number(seg) || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ── El grafo de audio (nace al primer uso) ───────────────────────────────────
function cabCtx() {
  if (_cb.ctx) return _cb.ctx;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  _cb.ctx = ctx;
  _cb.master = ctx.createGain();
  ['mic', 'sam', 'mus'].forEach((b) => { _cb.buses[b] = ctx.createGain(); _cb.buses[b].connect(_cb.master); });
  _cb.analyser = ctx.createAnalyser(); _cb.analyser.fftSize = 512;
  _cb.master.connect(_cb.analyser);
  // Monitor local: SOLO samplers y música — el mic a las bocinas se acopla.
  _cb.monitorGain = ctx.createGain(); _cb.monitorGain.gain.value = 0;
  _cb.buses.sam.connect(_cb.monitorGain); _cb.buses.mus.connect(_cb.monitorGain);
  _cb.monitorGain.connect(ctx.destination);
  // [KAIO-CABINA-4] El mic-monitor es un canal APARTE y opt-in: la radio trae
  // 15-30 s de delay (buffers de liquidsoap/Icecast/reproductor — normal en
  // toda radio por internet) y un locutor se monitorea LOCAL, al instante,
  // CON AUDÍFONOS. Jamás se conecta al monitorGain general: esa separación es
  // la que impide que el checkbox de sam+mus acople el mic con las bocinas.
  _cb.micMonitorGain = ctx.createGain(); _cb.micMonitorGain.gain.value = 0;
  _cb.buses.mic.connect(_cb.micMonitorGain);
  _cb.micMonitorGain.connect(ctx.destination);
  _cbVuLoop();
  return ctx;
}
function cabVol(bus, v) { if (_cb.buses[bus]) _cb.buses[bus].gain.value = Number(v) / 100; }
function cabMonitor(on) { cabCtx(); _cb.monitorGain.gain.value = on ? 1 : 0; }
function cabMicMonitor(on) { cabCtx(); _cb.micMonitorGain.gain.value = on ? 1 : 0; }
function _cbVuLoop() {
  const cv = _cbEl('cab-vu');
  if (!cv || !_cb.analyser) return;
  const g = cv.getContext('2d');
  const datos = new Uint8Array(_cb.analyser.fftSize);
  const paso = () => {
    _cb.analyser.getByteTimeDomainData(datos);
    let max = 0;
    for (let i = 0; i < datos.length; i++) max = Math.max(max, Math.abs(datos[i] - 128));
    const nivel = max / 128;
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = nivel > 0.9 ? '#ff283b' : (nivel > 0.7 ? '#e8ff4c' : '#88ea4e');
    g.fillRect(0, 0, Math.round(cv.width * nivel), cv.height);
    // El reloj del aire y el progreso de la música viven en el mismo latido.
    if (_cb.ws && _cb.aireDesde) { const r = _cbEl('cab-reloj'); if (r) r.textContent = '· ' + cabMMSS((Date.now() - _cb.aireDesde) / 1000) + ' al aire'; }
    const p = _cbEl('cab-mus-prog');
    if (p && _cb.mus.buffer) {
      const pos = _cb.mus.sonando ? (_cb.ctx.currentTime - _cb.mus.inicioCtx) : _cb.mus.offset;
      p.textContent = cabMMSS(pos) + ' / ' + cabMMSS(_cb.mus.buffer.duration);
    }
    _cb.vuRAF = requestAnimationFrame(paso);
  };
  if (!_cb.vuRAF) _cb.vuRAF = requestAnimationFrame(paso);
}

// ── Micrófono ────────────────────────────────────────────────────────────────
async function cabMicToggle() {
  const btn = _cbEl('cab-mic-btn');
  if (_cb.micStream) {
    _cb.micStream.getTracks().forEach((t) => t.stop());
    if (_cb.micSrc) try { _cb.micSrc.disconnect(); } catch (e) {}
    _cb.micStream = null; _cb.micSrc = null;
    if (btn) { btn.textContent = '🎤 Activar micrófono'; btn.style.color = ''; }
    return;
  }
  try {
    const ctx = cabCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    // [KAIO-CABINA-3, medido en la primera transmisión real: el stream llevaba
    // SILENCIO DIGITAL (pico 0.0000 en 12.7 s) con el icono del mic prendido]
    // Chrome puede entregar un track MUERTO — el micrófono equivocado (uno
    // virtual, un iPhone desconectado) o macOS dándole ceros. Por eso: (1) se
    // puede ELEGIR el micrófono, (2) el nombre del dispositivo capturado se
    // DICE, (3) un track muted se grita con su remedio.
    const audio = { echoCancellation: true, noiseSuppression: true };
    if (_cb.micDevice) audio.deviceId = { exact: _cb.micDevice };
    const stream = await navigator.mediaDevices.getUserMedia({ audio });
    _cb.micStream = stream;
    _cb.micSrc = ctx.createMediaStreamSource(stream);
    _cb.micSrc.connect(_cb.buses.mic);
    if (btn) { btn.textContent = '🎤 Micrófono VIVO (clic para apagar)'; btn.style.color = 'var(--red)'; }
    const track = stream.getAudioTracks()[0];
    const etiqueta = (track && track.label) || 'micrófono sin nombre';
    if (track && track.muted) {
      _cbMsg('cab-msg', '⚠️ «' + etiqueta + '» está entregando SILENCIO (el sistema lo tiene mudo). En Mac: Ajustes del Sistema → Privacidad y seguridad → Micrófono → activa tu navegador y vuelve a intentar.', true);
    } else {
      _cbMsg('cab-msg', 'Capturando «' + etiqueta + '» — habla y revisa que el medidor se mueva; si no se mueve, elige otro micrófono en el selector.');
    }
    if (track) track.addEventListener('mute', () => _cbMsg('cab-msg', '⚠️ El sistema ENMUDECIÓ el micrófono «' + etiqueta + '»: la radio está recibiendo silencio.', true));
    _cbLlenarMics();
  } catch (e) {
    // [KAIO-CABINA-2, cazado por Memo: «Permission denied» pelado no dice el
    // CAMINO] El nombre del error distingue las tres causas reales y cada una
    // trae su remedio — un mensaje sin remedio manda a adivinar.
    let como;
    if (e.name === 'NotAllowedError' || /denied/i.test(e.message)) {
      como = 'El navegador tiene BLOQUEADO el micrófono para este sitio. Desbloquéalo: clic en el candado 🔒 junto a la dirección → Micrófono → Permitir, y recarga la página. En Mac revisa también Ajustes del Sistema → Privacidad y seguridad → Micrófono → activa tu navegador.';
    } else if (e.name === 'NotFoundError') {
      como = 'No se encontró ningún micrófono conectado.';
    } else if (e.name === 'NotReadableError') {
      como = 'Otro programa tiene tomado el micrófono (Zoom, OBS, etc.) — ciérralo y vuelve a intentar.';
    } else {
      como = e.message;
    }
    _cbMsg('cab-msg', 'El micrófono no se pudo abrir: ' + como, true);
  }
}

// [KAIO-CABINA-3] El selector de micrófono: los nombres de los dispositivos
// solo existen DESPUÉS de un getUserMedia exitoso, así que se llena al capturar.
async function _cbLlenarMics() {
  const sel = _cbEl('cab-mic-sel');
  if (!sel || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId);
    if (!devs.length) return;
    const actual = _cb.micDevice || '';
    sel.innerHTML = '<option value="">— micrófono del sistema —</option>' +
      devs.map((d) => `<option value="${_rcEsc(d.deviceId)}"${d.deviceId === actual ? ' selected' : ''}>${_rcEsc(d.label || 'Micrófono')}</option>`).join('');
    sel.style.display = '';
  } catch (e) {}
}
async function cabMicCambiar(sel) {
  _cb.micDevice = (sel && sel.value) || '';
  if (_cb.micStream) {
    // Re-capturar EN VIVO con el dispositivo elegido: apagar y volver a prender.
    _cb.micStream.getTracks().forEach((t) => t.stop());
    if (_cb.micSrc) try { _cb.micSrc.disconnect(); } catch (e) {}
    _cb.micStream = null; _cb.micSrc = null;
    await cabMicToggle();
  }
}

// ── El uplink (webcast → AzuraCast) ─────────────────────────────────────────
function _cbCargarLame() {
  if (window.lamejs) return Promise.resolve();
  if (_cb.lamePromesa) return _cb.lamePromesa;
  _cb.lamePromesa = new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = '/vendor/lame.min.js';
    s.onload = () => ok();
    s.onerror = () => { _cb.lamePromesa = null; mal(new Error('No se pudo cargar el codificador (vendor/lame.min.js)')); };
    document.head.appendChild(s);
  });
  return _cb.lamePromesa;
}
async function cabAire() {
  if (_cb.ws) { cabCortar('Cortaste la transmisión'); return; }
  const usuario = (_cbEl('cab-dj') || {}).value || '';
  const pass = (_cbEl('cab-pass') || {}).value || '';
  if (!usuario) { _cbMsg('cab-msg', 'Elige tu cuenta de locutor', true); return; }
  if (!pass) { _cbMsg('cab-msg', 'Teclea la contraseña del locutor', true); return; }
  const btn = _cbEl('cab-aire');
  if (btn) btn.disabled = true;
  try {
    await _cbCargarLame();
    const ctx = cabCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    _cbMsg('cab-msg', 'Conectando con la estación…');
    // [KAIO-CABINA-6] La parrilla se pide ANTES de conectar para que el título
    // del show viaje como metadata en cuanto abra el WS. Si la parrilla no
    // contesta, se transmite igual con metadata genérica — la cartelera caída
    // jamás frena el aire.
    let cart6 = null;
    const pCart6 = fetch('/.netlify/functions/radio-cartelera')
      .then((r) => r.json()).then((j) => { if (j && j.ok) cart6 = j; }).catch(() => {});
    const ws = new WebSocket(cabinaWsUrl(), 'webcast');
    ws.binaryType = 'arraybuffer';
    let abrio = false;
    ws.onopen = () => {
      abrio = true;
      ws.send(JSON.stringify(cabinaHello(usuario, pass, ctx.sampleRate)));
      // [KAIO-CABINA-6] METADATA tras el hello (el hello SIEMPRE va primero:
      // registrar el envío aquí adentro garantiza el orden aunque la parrilla
      // ya hubiera contestado). Con esto la web pública cambia título/artista
      // al show en vez de quedarse con la última canción del AutoDJ.
      pCart6.then(() => {
        try { if (_cb.ws === ws && ws.readyState === 1) ws.send(JSON.stringify(cabinaMetadata(cart6, usuario))); } catch (e) {}
      });
      _cb.enc = new lamejs.Mp3Encoder(2, ctx.sampleRate, 192);
      // ScriptProcessor: el master entra, se codifica a MP3 y viaja por el WS.
      // Va conectado a un sink en silencio (gain 0) porque un processor suelto
      // no procesa — y a destination directo DUPLICARÍA el monitor.
      _cb.proc = ctx.createScriptProcessor(4096, 2, 2);
      _cb.procSink = ctx.createGain(); _cb.procSink.gain.value = 0;
      _cb.master.connect(_cb.proc);
      _cb.proc.connect(_cb.procSink); _cb.procSink.connect(ctx.destination);
      _cb.silencioDesde = 0; _cb.silencioAvisado = false;
      _cb.proc.onaudioprocess = (e) => {
        if (!_cb.ws || _cb.ws.readyState !== 1 || !_cb.enc) return;
        const L = e.inputBuffer.getChannelData(0);
        const mp3 = _cb.enc.encodeBuffer(cabF32aI16(L), cabF32aI16(e.inputBuffer.getChannelData(1)));
        if (mp3.length) _cb.ws.send(mp3);
        // [KAIO-CABINA-3, medido en la primera transmisión real: 12.7 s de
        // stream con pico 0.0000] El SILENCIO AL AIRE SE DICE: un micrófono
        // vivo mete ruido de piso aunque nadie hable — el cero digital
        // sostenido es un track muerto o una ganancia en cero, y desde la
        // cabina no se oye (el monitor no toca el mic a propósito).
        let pico = 0;
        for (let i = 0; i < L.length; i += 16) { const a = Math.abs(L[i]); if (a > pico) pico = a; }
        if (pico < 0.0004) {
          if (!_cb.silencioDesde) _cb.silencioDesde = Date.now();
          else if (!_cb.silencioAvisado && Date.now() - _cb.silencioDesde > 7000) {
            _cb.silencioAvisado = true;
            _cbMsg('cab-msg', '⚠️ Estás AL AIRE pero la radio está recibiendo PURO SILENCIO desde hace varios segundos. Si tu micrófono está activo, Chrome está capturando un micrófono muerto: elige otro en el selector de micrófono, y en Mac revisa Ajustes del Sistema → Privacidad y seguridad → Micrófono → que tu navegador esté activado.', true);
          }
        } else if (_cb.silencioDesde) {
          _cb.silencioDesde = 0;
          if (_cb.silencioAvisado) { _cb.silencioAvisado = false; _cbMsg('cab-msg', '✓ Ya entra audio a la transmisión.'); }
        }
      };
      _cb.ws = ws;
      _cb.aireDesde = Date.now();
      const est = _cbEl('cab-estado');
      if (est) { est.textContent = '🔴 AL AIRE'; est.style.background = 'var(--red)'; est.style.color = '#fff'; }
      if (btn) { btn.disabled = false; btn.textContent = '⏹ Cortar transmisión'; }
      _cbMsg('cab-msg', 'Al aire. Lo que suena en la mezcladora está saliendo en la radio.');
    };
    // Un cierre/error se DICE con su motivo — el silencio se leería como «sigo al aire».
    ws.onclose = (ev) => { if (_cb.ws === ws || !abrio) cabCortar(abrio ? ('La estación cerró la conexión (código ' + ev.code + '). ¿La contraseña del locutor es la buena? ¿Hay otro DJ conectado?') : 'No se pudo conectar con la estación — revisa tu internet o usa el Web DJ (plan B)'); };
    ws.onerror = () => {};   // onclose llega después con el código; ahí se habla
  } catch (e) {
    if (btn) btn.disabled = false;
    _cbMsg('cab-msg', e.message, true);
  }
}
function cabCortar(motivo) {
  if (_cb.proc) { try { _cb.master.disconnect(_cb.proc); } catch (e) {} try { _cb.proc.disconnect(); } catch (e) {} _cb.proc.onaudioprocess = null; _cb.proc = null; }
  if (_cb.procSink) { try { _cb.procSink.disconnect(); } catch (e) {} _cb.procSink = null; }
  if (_cb.ws) {
    const ws = _cb.ws; _cb.ws = null;
    try { if (_cb.enc && ws.readyState === 1) { const fin = _cb.enc.flush(); if (fin.length) ws.send(fin); } } catch (e) {}
    try { ws.onclose = null; ws.close(); } catch (e) {}
    // [KAIO-CABINA-6] Y se le AVISA a la estación (best-effort): liquidsoap
    // puede sostener la sesión del DJ unos momentos tras el close del socket,
    // y mientras tanto AzuraCast reporta is_live=true — el banner AL AIRE de
    // /radio se queda pegado (reporte de Memo). backend/disconnect lo suelta
    // al instante. Si falla, el cierre del WS basta solo que más lento — el
    // corte local JAMÁS se frena por esto.
    try { _cbApi({ accion: 'dj_desconectar' }).catch(() => {}); } catch (e) {}
  }
  _cb.enc = null; _cb.aireDesde = 0;
  const est = _cbEl('cab-estado');
  if (est) { est.textContent = 'FUERA DEL AIRE'; est.style.background = 'var(--border)'; est.style.color = 'var(--ts)'; }
  const btn = _cbEl('cab-aire'); if (btn) { btn.disabled = false; btn.textContent = '🔴 Salir al aire'; }
  const r = _cbEl('cab-reloj'); if (r) r.textContent = '';
  if (motivo) _cbMsg('cab-msg', motivo, /cerró|No se pudo|no se pudo/.test(motivo));
}

// ── Soundboard ───────────────────────────────────────────────────────────────
async function loadRadioCabina() {
  _cbSamplersPintar();
  _cbDjsPintar();
  const { st, j } = await _cbApi({ accion: 'samplers_listar' });
  if (st === 200 && j.ok) { _cb.samplers = j.samplers || []; _cbSamplersPintar(); }
  else { const box = _cbEl('cab-pads'); if (box) box.innerHTML = `<div class="alert alert-error">${_rcEsc(j.error || ('HTTP ' + st))}</div>`; }
  const d = await _cbApi({ accion: 'streamers_listar' });
  if (d.st === 200 && d.j.ok) _cbDjsPintar(d.j.streamers || []);
}
function _cbSamplersPintar() {
  const box = _cbEl('cab-pads'), lista = _cbEl('cab-sam-lista');
  if (!box) return;
  if (!_cb.samplers.length) {
    box.innerHTML = '<div style="color:var(--ts);font-size:13px">Sin samplers todavía — sube el primero abajo (risas, aplausos, cortinillas…).</div>';
  } else {
    box.innerHTML = _cb.samplers.map((s) => `<button class="btn" style="padding:14px 8px;font-weight:800;border:2px solid ${_rcEsc(s.color || 'var(--border)')};border-radius:12px;background:transparent;color:var(--text);cursor:pointer" onclick="cabPad('${_rcEsc(s.id)}')">${_rcEsc(s.nombre)}</button>`).join('');
  }
  if (lista) lista.innerHTML = _cb.samplers.map((s) => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
    <span style="width:10px;height:10px;border-radius:50%;background:${_rcEsc(s.color || 'var(--ts)')}"></span>
    <span style="flex:1">${_rcEsc(s.nombre)}</span>
    <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="cabSamplerRenombrar('${_rcEsc(s.id)}')">Renombrar</button>
    <button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--red)" onclick="cabSamplerEliminar('${_rcEsc(s.id)}')">🗑</button>
  </div>`).join('') || '<div style="color:var(--ts);font-size:12px">Nada que administrar.</div>';
}
async function cabPad(id) {
  const s = _cb.samplers.find((x) => String(x.id) === String(id));
  if (!s) return;
  try {
    const ctx = cabCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    if (!_cb.cacheAudio[s.audio_url]) {
      const r = await fetch(s.audio_url);
      if (!r.ok) throw new Error('el audio no bajó (HTTP ' + r.status + ')');
      _cb.cacheAudio[s.audio_url] = await ctx.decodeAudioData(await r.arrayBuffer());
    }
    const src = ctx.createBufferSource();
    src.buffer = _cb.cacheAudio[s.audio_url];
    src.connect(_cb.buses.sam);
    src.onended = () => { _cb.vivos = _cb.vivos.filter((v) => v !== src); };
    src.start();
    _cb.vivos.push(src);
  } catch (e) { _cbMsg('cab-sam-msg', 'Ese sampler no sonó: ' + e.message, true); }
}
function cabPadsStop() { _cb.vivos.forEach((s) => { try { s.stop(); } catch (e) {} }); _cb.vivos = []; }
function _cbArchivoB64(input) {
  return new Promise((ok, mal) => {
    const f = input && input.files && input.files[0];
    if (!f) return mal(new Error('Elige un archivo de audio'));
    const rd = new FileReader();
    rd.onload = () => ok(rd.result);
    rd.onerror = () => mal(new Error('No se pudo leer el archivo'));
    rd.readAsDataURL(f);
  });
}
async function cabSamplerSubir() {
  try {
    const nombre = (_cbEl('cab-sam-nombre') || {}).value || '';
    if (!nombre.trim()) { _cbMsg('cab-sam-msg', 'Ponle nombre al sampler', true); return; }
    const b64 = await _cbArchivoB64(_cbEl('cab-sam-file'));
    _cbMsg('cab-sam-msg', 'Subiendo…');
    const { st, j } = await _cbApi({ accion: 'sampler_crear', nombre: nombre.trim(), color: (_cbEl('cab-sam-color') || {}).value || null, audio_b64: b64 });
    if (st !== 200 || !j.ok) { _cbMsg('cab-sam-msg', j.error || ('HTTP ' + st), true); return; }
    _cbMsg('cab-sam-msg', 'Sampler listo ✓');
    const n = _cbEl('cab-sam-nombre'); if (n) n.value = '';
    const f = _cbEl('cab-sam-file'); if (f) f.value = '';
    loadRadioCabina();
  } catch (e) { _cbMsg('cab-sam-msg', e.message, true); }
}
async function cabSamplerRenombrar(id) {
  const s = _cb.samplers.find((x) => String(x.id) === String(id));
  const nombre = prompt('Nuevo nombre del sampler:', (s || {}).nombre || '');
  if (!nombre || !nombre.trim()) return;
  const { st, j } = await _cbApi({ accion: 'sampler_editar', id, nombre: nombre.trim() });
  if (st !== 200 || !j.ok) { showToast(j.error || ('HTTP ' + st), 'error'); return; }
  loadRadioCabina();
}
async function cabSamplerEliminar(id) {
  const s = _cb.samplers.find((x) => String(x.id) === String(id));
  if (!confirm(`¿ELIMINAR el sampler «${(s || {}).nombre || ''}» para siempre?`)) return;
  const { st, j } = await _cbApi({ accion: 'sampler_eliminar', id, confirmar: true });
  if (st !== 200 || !j.ok) { showToast(j.error || ('HTTP ' + st), 'error'); return; }
  showToast('Sampler eliminado', 'success');
  loadRadioCabina();
}

// ── Música (catálogo + archivo local) ───────────────────────────────────────
async function cabBuscar() {
  const q = ((_cbEl('cab-q') || {}).value || '').trim();
  const box = _cbEl('cab-resultados');
  if (!q || !box) return;
  box.innerHTML = '<div class="loading-state"><div class="spinner"></div>Buscando…</div>';
  try {
    // La búsqueda es la de admin-radio-media (?buscar=) — la MISMA del Control
    // y la Biblioteca: un catálogo, un buscador.
    const r = await khAdminFetch('/.netlify/functions/admin-radio-media?buscar=' + encodeURIComponent(q));
    const j = await r.json().catch(() => ({}));
    const archivos = (j && j.archivos) || [];
    box.innerHTML = archivos.length
      ? archivos.map((a) => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">${_rcEsc(a.titulo || a.ruta)}</div>
          <div style="font-size:11px;color:var(--ts)">${_rcEsc(a.artista || '')}</div></div>
          <button class="btn btn-ghost btn-sm" onclick='cabTocarRuta(${JSON.stringify(String(a.ruta))},${JSON.stringify(String(a.titulo || a.ruta))})'>▶ Tocar en cabina</button>
        </div>`).join('')
      : '<div style="color:var(--ts);font-size:13px">Sin resultados en el catálogo.</div>';
  } catch (e) { box.innerHTML = `<div class="alert alert-error">${_rcEsc(e.message)}</div>`; }
}
async function cabTocarRuta(ruta, titulo) {
  const box = _cbEl('cab-mus-nombre');
  if (box) box.textContent = 'Bajando «' + titulo + '»…';
  try {
    // [KAIO-CABINA-2] La canción baja por REBANADAS (el 413 de 4.2 MB murió):
    // se pide {desde} en bucle hasta `completo` y se concatena aquí.
    const pedazos = [];
    let desde = 0, total = 0;
    for (let i = 0; i < 12; i++) {
      const { st, j } = await _cbApi({ accion: 'cancion_descargar', ruta, desde });
      if (st !== 200 || !j.ok) { if (box) box.textContent = '— nada cargado —'; showToast(j.error || ('HTTP ' + st), 'error'); return; }
      const bin = atob(j.b64);
      const buf = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
      pedazos.push(buf);
      total = j.bytes_total || (desde + buf.length);
      desde += buf.length;
      if (j.completo) break;
      if (box) box.textContent = 'Bajando «' + titulo + '»… ' + Math.round((desde / total) * 100) + '%';
    }
    if (desde < total) { if (box) box.textContent = '— nada cargado —'; showToast('La descarga quedó incompleta (' + desde + ' de ' + total + ' bytes)', 'error'); return; }
    const todo = new Uint8Array(total);
    let pos = 0;
    for (const p of pedazos) { todo.set(p, pos); pos += p.length; }
    const ctx = cabCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    _cbMusCargar(await ctx.decodeAudioData(todo.buffer), titulo);
  } catch (e) { if (box) box.textContent = '— nada cargado —'; showToast('Ese audio no se pudo decodificar: ' + e.message, 'error'); }
}
async function cabMusLocal(input) {
  const f = input && input.files && input.files[0];
  if (!f) return;
  try {
    const ctx = cabCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    _cbMusCargar(await ctx.decodeAudioData(await f.arrayBuffer()), f.name);
  } catch (e) { showToast('Ese archivo no se pudo decodificar: ' + e.message, 'error'); }
  input.value = '';
}
function _cbMusCargar(buffer, nombre) {
  cabMusStop();
  _cb.mus.buffer = buffer; _cb.mus.nombre = nombre; _cb.mus.offset = 0;
  const n = _cbEl('cab-mus-nombre'); if (n) n.textContent = nombre;
  cabMusPlayPausa();
}
function cabMusPlayPausa() {
  const m = _cb.mus;
  if (!m.buffer) return;
  const ctx = cabCtx();
  if (m.sonando) {           // pausa
    m.offset = ctx.currentTime - m.inicioCtx;
    try { m.src.onended = null; m.src.stop(); } catch (e) {}
    m.src = null; m.sonando = false;
    const b = _cbEl('cab-mus-play'); if (b) b.textContent = '▶';
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = m.buffer;
  src.connect(_cb.buses.mus);
  src.onended = () => { if (_cb.mus.src === src) { _cb.mus.sonando = false; _cb.mus.offset = 0; _cb.mus.src = null; const b = _cbEl('cab-mus-play'); if (b) b.textContent = '▶'; } };
  src.start(0, Math.min(m.offset, Math.max(0, m.buffer.duration - 0.05)));
  m.src = src; m.inicioCtx = ctx.currentTime - m.offset; m.sonando = true;
  const b = _cbEl('cab-mus-play'); if (b) b.textContent = '⏸';
}
function cabMusStop() {
  const m = _cb.mus;
  if (m.src) { try { m.src.onended = null; m.src.stop(); } catch (e) {} }
  m.src = null; m.sonando = false; m.offset = 0;
  const b = _cbEl('cab-mus-play'); if (b) b.textContent = '▶';
}

// ── Locutores ────────────────────────────────────────────────────────────────
function _cbDjsPintar(streamers) {
  const sel = _cbEl('cab-dj'), lista = _cbEl('cab-djs-lista');
  if (streamers === undefined) { if (lista) lista.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>'; return; }
  if (sel) {
    const elegido = sel.value;
    sel.innerHTML = '<option value="">— elige tu cuenta de locutor —</option>' +
      streamers.map((s) => `<option value="${_rcEsc(s.usuario)}">${_rcEsc(s.nombre)} (${_rcEsc(s.usuario)})</option>`).join('');
    if (elegido) sel.value = elegido;
  }
  if (lista) lista.innerHTML = streamers.length
    ? streamers.map((s) => `<div style="display:flex;gap:8px;align-items:center;padding:4px 0">
        <span style="flex:1">${_rcEsc(s.nombre)} · <code>${_rcEsc(s.usuario)}</code>${s.activo ? '' : ' <span style="color:var(--ts)">(inactivo)</span>'}</span>
        <button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--red)" onclick="cabDjEliminar(${Number(s.id)},'${_rcEsc(s.usuario)}')">🗑</button>
      </div>`).join('')
    : '<div style="color:var(--ts);font-size:12px">Sin locutores — crea el primero abajo (tu cuenta de DJ).</div>';
}
async function cabDjCrear() {
  const usuario = ((_cbEl('cab-dj-user') || {}).value || '').trim();
  const contrasena = (_cbEl('cab-dj-pass') || {}).value || '';
  const nombre = ((_cbEl('cab-dj-nombre') || {}).value || '').trim();
  const { st, j } = await _cbApi({ accion: 'streamer_crear', usuario, contrasena, nombre });
  if (st !== 200 || !j.ok) { showToast(j.error || ('HTTP ' + st), 'error'); return; }
  showToast('Locutor creado: ' + usuario, 'success');
  // [KAIO-CABINA-2] Si el servidor tuvo que encender la puerta de DJs y
  // reiniciar la estación, se DICE — el silencio se leería como radio caída.
  if (j.nota) _cbMsg('cab-msg', j.nota, false);
  ['cab-dj-user', 'cab-dj-pass', 'cab-dj-nombre'].forEach((id) => { const e = _cbEl(id); if (e) e.value = ''; });
  loadRadioCabina();
}
async function cabDjEliminar(id, usuario) {
  if (!confirm(`¿Eliminar la cuenta de locutor «${usuario}»? Ya no podrá conectarse a transmitir.`)) return;
  const { st, j } = await _cbApi({ accion: 'streamer_eliminar', id, confirmar: true });
  if (st !== 200 || !j.ok) { showToast(j.error || ('HTTP ' + st), 'error'); return; }
  showToast('Locutor eliminado', 'success');
  loadRadioCabina();
}
