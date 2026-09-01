// =============================================================================
// kamehouse-radar.js — el Radar del Dragón, sacado del tronco (MONO-5)
// =============================================================================
// 41 funciones y 1,320 líneas: el tablero de alertas y el calendario del radar.
// Es la MÁS AISLADA de las que quedaban —87%, solo toca 6 funciones
// compartidas—, y llega en este punto de la serie por una corrección: el mapa de
// MONO-0 la clasificaba en 14% por un span desbordado del instrumento, no por
// cómo está escrita.
//
// Mismas reglas: SOLO funciones, en el MISMO ORDEN, con su comentario pegado, y
// cero código de nivel superior — el estado global se queda en el tronco.
//
// Va ANTES del tronco por la regla del sentido único (ver MONO-2). El arnés
// exige cero errores al CARGAR la página.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

async function loadRolAnalytics(silent){
  try {
    // KPIs, tops, paquetes, embudo y métodos de compartir salen del RPC (cacheado por rango).
    const data = await _radarGetMetricas(_radarRange);
    // Sparklines (7d) y actividad por hora (24h) siguen de un fetch liviano de 7 días.
    // [RAD-1c] LA SEXTA aritmética de calendario de esta pantalla, encontrada al
  // construir la franja del día: `now − 7×24h` arranca a la hora del clic, así
  // que la cubeta más vieja del sparkline salía siempre a medias. Se pide al
  // calendario, y se traen OCHO días para que la franja tenga con qué comparar.
  const since7d = _radCalMasDias(_radCalHoy(), -7).toISOString();
    const select = 'select=session_id,accion,created_at';
    const rows7 = await _radarFetch('rol_eventos_uso?' + select, since7d).catch(() => []);
    renderRolAnalytics(data, rows7 || []);
  } catch (e) {
    console.error('[rolan]', e);
  }
}
function renderRolAnalytics(data, rows7){
  rows7 = rows7 || [];
  const rAct  = (data && data.rol && data.rol.act)  || {};
  const rPrev = (data && data.rol && data.rol.prev) || {};
  const num = v => Number(v) || 0;

  // ── KPI counters (desde el RPC) ──
  const sesiones       = num(rAct.sesiones);
  const sesionesP      = num(rPrev.sesiones);
  const planes         = num(rAct.planes);
  const planesP        = num(rPrev.planes);
  const sesionesConPlan = num(rAct.sesiones_con_plan);
  const sesionesQueVisitan = num(rAct.sesiones_visitan);
  const baseConv  = sesionesQueVisitan || sesiones;
  const conv      = baseConv > 0 ? (sesionesConPlan / baseConv * 100) : 0;
  const sesConPlanP = num(rPrev.sesiones_con_plan);
  const sesVisitanP = num(rPrev.sesiones_visitan);
  const baseConvP = sesVisitanP || sesionesP;
  const convP     = baseConvP > 0 ? (sesConPlanP / baseConvP * 100) : 0;
  const recordatorios  = num(rAct.recordatorios);
  const recordatoriosP = num(rPrev.recordatorios);
  const comprobantes   = num(rAct.comprobantes);
  const comprobantesP  = num(rPrev.comprobantes);
  const toursGuardados  = num(rAct.tours);
  const toursGuardadosP = num(rPrev.tours);
  const icsDescargas = num(rAct.ics);
  const pngDescargas = num(rAct.png);
  const sharedCount  = num(rAct.shared);

  // ── Set KPI helper con trend ──
  const setKpi = (id, val, prev, isPercent) => {
    const el = document.getElementById(id);
    if (el) el.textContent = isPercent ? (typeof val === 'number' ? val.toFixed(1) + '%' : String(val))
                                        : (typeof val === 'number' ? val.toLocaleString('es-MX') : String(val));
    const tr = document.getElementById(id + '-tr');
    if (tr) {
      const t = _trendArrow(typeof val === 'number' ? val : parseFloat(val) || 0, prev || 0);
      tr.textContent = t.html;
      tr.className = 'rdr-kpi-trend ' + t.cls;
    }
  };
  setKpi('rro-sesiones',      sesiones,       sesionesP);
  setKpi('rro-planes',        planes,         planesP);
  setKpi('rro-conv',          conv,           convP, true);
  setKpi('rro-recordatorios', recordatorios,  recordatoriosP);
  setKpi('rro-comprobantes',  comprobantes,   comprobantesP);
  setKpi('rro-tours',         toursGuardados, toursGuardadosP);

  // Extras (sin trend)
  const extras = [['rro-ics', icsDescargas], ['rro-png', pngDescargas], ['rro-shared', sharedCount]];
  extras.forEach(([id, n]) => { const e = document.getElementById(id); if (e) e.textContent = n.toLocaleString('es-MX'); });

  // ── Sparklines (últimos 7 días) ──
  _rdrPaintSpark(document.getElementById('rro-sesiones-spark'),
    _rdrSeries7d(rows7, () => true).map((_, i, arr) => {
      // sesiones únicas por día
      const today0 = new Date(new Date().setHours(0,0,0,0));
      const dayStart = new Date(today0); dayStart.setDate(dayStart.getDate() - (arr.length - 1 - i));
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
      return new Set(rows7.filter(r => {
        const t = new Date(r.created_at);
        return t >= dayStart && t < dayEnd;
      }).map(r => r.session_id)).size;
    }));
  _rdrPaintSpark(document.getElementById('rro-planes-spark'),
    _rdrSeries7d(rows7, r => r.accion === 'rol_plan_generado'));
  // Conv: planes únicos / visitas únicas por día
  const sparkConv = (() => {
    const today0 = new Date(new Date().setHours(0,0,0,0));
    const days = 7;
    const out = [];
    for (let i = 0; i < days; i++) {
      const dayStart = new Date(today0); dayStart.setDate(dayStart.getDate() - (days - 1 - i));
      const dayEnd   = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
      const inDay = rows7.filter(r => { const t = new Date(r.created_at); return t >= dayStart && t < dayEnd; });
      const v = new Set(inDay.filter(r => r.accion === 'rol_visita').map(r => r.session_id)).size;
      const p = new Set(inDay.filter(r => r.accion === 'rol_plan_generado').map(r => r.session_id)).size;
      out.push(v > 0 ? (p / v * 100) : 0);
    }
    return out;
  })();
  _rdrPaintSpark(document.getElementById('rro-conv-spark'), sparkConv);
  _rdrPaintSpark(document.getElementById('rro-recordatorios-spark'),
    _rdrSeries7d(rows7, r => r.accion === 'rol_recordatorios_activados'));
  _rdrPaintSpark(document.getElementById('rro-comprobantes-spark'),
    _rdrSeries7d(rows7, r => r.accion === 'rol_comprobante_subido'));
  _rdrPaintSpark(document.getElementById('rro-tours-spark'),
    _rdrSeries7d(rows7, r => r.accion === 'rol_tour_guardado'));

  // ── Eventos más consultados (por planes generados) — del RPC ──
  const evTop = (rAct.top_eventos || []).map(e => ({ nombre: e.nombre || e.evento_id, n: num(e.planes) }));
  const olEv = document.getElementById('rro-eventos-top');
  const metaEv = document.getElementById('rro-eventos-meta');
  if (metaEv) metaEv.textContent = `${evTop.length} ${evTop.length===1?'evento':'eventos'}`;
  const maxEv = Math.max(1, ...evTop.map(x => x.n));
  if (olEv) {
    olEv.innerHTML = evTop.length === 0
      ? '<li class="rdr-empty">Aún no hay planes generados en este rango</li>'
      : evTop.map((x, i) => {
          const nm = _radarEsc(x.nombre);
          const n = x.n;
          const pct = (n / maxEv * 100).toFixed(0);
          return `<li>
            <span class="rk-pos">#${i+1}</span>
            <span class="rk-name">${nm}<span class="rk-bar" style="width:${pct}%;animation-delay:${(0.04*i).toFixed(2)}s"></span></span>
            <span class="rk-val">${n}<span class="unit">${n===1?'plan':'planes'}</span></span>
          </li>`;
        }).join('');
  }

  // ── Paquetes más elegidos (última elección por sesión) → donut (del RPC) ──
  const pkgSrc = rAct.paquetes || {};
  const pkgCount = { PLUS:num(pkgSrc.PLUS), RIDE:num(pkgSrc.RIDE), STAY:num(pkgSrc.STAY), CHEAP:num(pkgSrc.CHEAP) };
  const pkgTotal = Object.values(pkgCount).reduce((a,b) => a+b, 0);
  const pkgItems = Object.entries(pkgCount)
    .filter(([,n]) => n > 0)
    .sort((a,b) => b[1]-a[1])
    .map(([k,n]) => ({ label:k, value:n }));
  const pkgPalette = ['#e8ff4c', '#0000cd', '#88ea4e', '#ff283b'];
  const metaPk = document.getElementById('rro-paquetes-meta');
  if (metaPk) metaPk.textContent = pkgTotal === 0 ? 'Sin datos' : `${pkgTotal} ${pkgTotal===1?'elección':'elecciones'}`;
  const donutCenter = document.getElementById('rro-donut-center');
  const donutLegend = document.getElementById('rro-donut-legend');
  if (pkgTotal === 0) {
    const segs = document.getElementById('rro-donut-segs');
    if (segs) segs.innerHTML = '';
    if (donutCenter) donutCenter.textContent = '—';
    if (donutLegend) donutLegend.innerHTML = '<div class="rdr-empty">Aún no hay paquetes elegidos</div>';
  } else {
    _rdrPaintDonut('rro-donut-segs', pkgItems, pkgPalette);
    if (donutCenter) donutCenter.textContent = pkgTotal.toLocaleString('es-MX');
    if (donutLegend) donutLegend.innerHTML = pkgItems.map((it, i) => {
      const pct = (it.value / pkgTotal * 100).toFixed(1);
      return `<div class="lg">
        <span class="dot" style="background:${pkgPalette[i % pkgPalette.length]}"></span>
        <span class="lbl">${it.label}</span>
        <span class="pct">${pct}%</span>
      </div>`;
    }).join('');
  }

  // ── Embudo de conversión (sesiones únicas por cada paso) — del RPC ──
  const emb = rAct.embudo || {};
  const visitas      = num(emb.visitas) || sesiones;
  const ev           = num(emb.evento);
  const pkg          = num(emb.paquete);
  const zona         = num(emb.zona);
  const planGen      = num(emb.plan);
  const recordOk     = num(emb.recordatorios);
  const pasos = [
    ['Visitas', visitas],
    ['Eligen evento', ev],
    ['Eligen paquete', pkg],
    ['Eligen zona', zona],
    ['Generan plan', planGen],
    ['Activan recordatorios', recordOk]
  ];
  const olEmb = document.getElementById('rro-embudo');
  if (olEmb) {
    if (visitas === 0) {
      olEmb.innerHTML = '<li class="rdr-empty">Sin actividad en este rango</li>';
    } else {
      olEmb.innerHTML = pasos.map(([k, n]) => {
        const pct = (n / visitas * 100);
        const fillStyle = `background:linear-gradient(90deg, rgba(232,255,76,.16) ${pct.toFixed(1)}%, rgba(255,255,255,.02) ${pct.toFixed(1)}%)`;
        return `<li style="${fillStyle}">
          <span class="step">${k}</span>
          <span class="count">${n.toLocaleString('es-MX')}</span>
          <span class="pct">${pct.toFixed(0)}%</span>
        </li>`;
      }).join('');
    }
  }

  // ── Métodos de compartir (del RPC: share_metodos) ──
  const shareSrc = rAct.share_metodos || {};
  const shareCount = { copy:num(shareSrc.copy), whatsapp:num(shareSrc.whatsapp), email:num(shareSrc.email), otro:num(shareSrc.otro) };
  const shareTotal = Object.values(shareCount).reduce((a,b) => a+b, 0);
  const shareWrap = document.getElementById('rro-share');
  if (shareWrap) {
    shareWrap.innerHTML = shareTotal === 0
      ? '<div class="rdr-empty">Sin compartidos en el rango</div>'
      : Object.entries(shareCount).filter(([,n]) => n > 0)
          .sort((a,b) => b[1]-a[1])
          .map(([k,n]) => {
            const pct = (n / shareTotal * 100).toFixed(1);
            const lbl = { copy:'Link copiado', whatsapp:'WhatsApp', email:'Email', otro:'Otro' }[k] || k;
            return `<div class="row">
              <span class="k">${lbl}</span>
              <div class="t"><div class="f" style="width:${pct}%"></div></div>
              <span class="p">${pct}%</span>
            </div>`;
          }).join('');
  }

  // ── Actividad por hora (últimas 24h) ──
  const now = Date.now();
  const dayAgo = now - 24*60*60*1000;
  const buckets = new Array(24).fill(0);
  rows7.forEach(r => {
    const t = new Date(r.created_at).getTime();
    if (t < dayAgo || t > now) return;
    const hoursAgo = Math.floor((now - t) / (60*60*1000));
    if (hoursAgo >= 0 && hoursAgo < 24) buckets[23 - hoursAgo]++;
  });
  const maxBucket = Math.max(1, ...buckets);
  const wrapH = document.getElementById('rro-actividad');
  const baseHour = new Date(now - 23*60*60*1000);
  const fmtH = (i) => {
    const d = new Date(baseHour.getTime() + i*60*60*1000);
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute:'2-digit', hour12: false });
  };
  if (wrapH) {
    if (buckets.every(b => b === 0)) {
      wrapH.innerHTML = '<div class="rdr-empty">Sin actividad en las últimas 24h</div>';
    } else {
      wrapH.innerHTML = buckets.map((n, i) => {
        const pct = (n / maxBucket * 100);
        return `<div class="hr">
          <span class="h">${fmtH(i)}</span>
          <div class="track"><div class="fill" style="width:${pct.toFixed(1)}%"></div></div>
          <span class="n">${n}</span>
        </div>`;
      }).join('');
    }
  }
}
async function exportRolAnalyticsCSV(){
  // On-demand: trae las filas crudas del rango solo al exportar (ya no se cachean).
  const select = 'select=session_id,accion,evento_id,evento_nombre,paquete,zona,precio_total,created_at';
  let rows = [];
  try { rows = await _radarFetch('rol_eventos_uso?' + select, _radarSinceISO()) || []; }
  catch (e){ alert('Error al exportar: ' + e.message); return; }
  if (!rows.length){ alert('No hay datos en el rango actual.'); return; }
  const cols = ['created_at','session_id','accion','evento_id','evento_nombre','paquete','zona','precio_total'];
  const esc = v => v == null ? '' : '"' + String(v).replace(/"/g,'""') + '"';
  const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rol-analytics-${_rolanRange}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function _radarGetMetricas(rango){
  if (_radarRpcCache[rango]) return _radarRpcCache[rango];
  // [sec-radar-wl] antes db.rpc('radar_metricas') con anon. Ahora admin-radar
  // ejecuta el RPC con service_role y reenvía la respuesta TAL CUAL.
  const data = await khRadar.metricas(rango);
  _radarRpcCache[rango] = data;
  return data;
}
// Cuenta cuántos eventos del array EV en producción están "activos"
// (no agotados, no próximamente). Hace fetch a /index.html y extrae el array
// con el mismo truco que rol.html (regex + balanceo de llaves).
async function _radarContarEventosActivos(){
  const TTL_MS = 5 * 60 * 1000;
  if (_radarEvCache.count != null && (Date.now() - _radarEvCache.ts) < TTL_MS) {
    return _radarEvCache.count;
  }
  try {
    const r = await fetch('https://conectareynosa.mx/index.html?nc=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    const html = await r.text();
    const start = html.indexOf("var EV=[");
    if (start < 0) return null;
    // Balanceo de [ ] empezando en el '[' que sigue al '=' (ignorando strings).
    let i = html.indexOf('[', start);
    let depth = 0, end = -1, inStr = false, strCh = '';
    for (; i < html.length; i++) {
      const c = html[i], prev = html[i-1];
      if (inStr) { if (c === strCh && prev !== '\\') inStr = false; continue; }
      if (c === "'" || c === '"') { inStr = true; strCh = c; continue; }
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') { depth--; if (depth === 0 && c === ']') { end = i; break; } }
    }
    if (end < 0) return null;
    // Para cada objeto top-level, mira su campo st:
    const arr = html.slice(html.indexOf('[', start), end + 1);
    const objRe = /\{[^{}]*?id:\s*'[^']+'[^{}]*?\}/g;
    // El regex anterior NO permite llaves anidadas (eventos con zonas:[{...}]
    // no caben). Solo capta objetos planos — esos son los placeholders agotado
    // o proximamente. Para los demás, recurrimos a parser balanceado:
    let count = 0;
    let depth2 = 0, oStart = -1, ins = false, sc = '';
    for (let j = 0; j < arr.length; j++) {
      const c = arr[j], prev = arr[j-1];
      if (ins) { if (c === sc && prev !== '\\') ins = false; continue; }
      if (c === "'" || c === '"') { ins = true; sc = c; continue; }
      if (c === '{') { if (depth2 === 0) oStart = j; depth2++; }
      else if (c === '}') {
        depth2--;
        if (depth2 === 0 && oStart >= 0) {
          const blob = arr.slice(oStart, j + 1);
          const stM = blob.match(/(?:^|[,{])\s*st\s*:\s*'([^']*)'/);
          const st = stM ? stM[1] : '';
          // Activo = no agotado y no próximamente. Eventos con st:'' o
          // st:'ultimos' / st:'proceso' cuentan como activos.
          if (st !== 'agotado' && st !== 'proximamente' && st !== 'por-confirmar') count++;
          oStart = -1;
        }
      }
    }
    _radarEvCache.count = count;
    _radarEvCache.ts = Date.now();
    return count;
  } catch (e) {
    console.warn('[radar] contarEventos falló', e.message);
    return null;
  }
}
// 🔒 LA VENTANA. Todo el Radar la pide aquí y a nadie más.
// Devuelve instantes (Date) + la leyenda que la pantalla imprime, para que el
// rótulo NO pueda decir algo distinto de lo que el corte hace.
// La cruda arma el tramo actual; el envoltorio iguala el previo. Una sola
// puerta: quien añada un rango mañana entra por aquí y hereda la regla.
function _radCalVentana(rango) { return _radCalMismoLargo(_radCalVentanaCruda(rango)); }
// ═══════════════════════════════════════════════════════════════════════════
// [RAD-1b] EL RÓTULO LO ESCRIBE EL CALENDARIO
//
// Los chips tenían su texto escrito a mano en el HTML: «Esta semana», «Este
// mes». El corte estaba en otro archivo y hacía otra cosa —`ahora − 7 días`,
// `ahora − 30 días`— así que el rótulo llevaba meses mintiendo sin que nada
// pudiera cazarlo: son dos objetos distintos y nadie los carea.
//
// 🔒 Ahora el texto SALE DE `_radCalVentana(r).leyenda`, el mismo objeto que
// trae el `since`. No es que coincidan: es que son lo mismo. Para que el chip
// vuelva a mentir habría que hacer mentir al corte, y eso el arnés lo caza.
//
// Y debajo van las FECHAS de verdad. Un rótulo se puede leer por encima; una
// fecha no: «1 ago → 27 ago» se carea de un vistazo con lo que uno esperaba.
function _radFechaCorta(d) {
  const p = _radCalPartes(d.getTime());
  const M = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return p.d + ' ' + M[p.m - 1];
}
// [RAD-1g] El encabezado del bloque acumulado. Se llena del MISMO
// `_radCalVentana` que los chips, así que el rótulo, las fechas y el corte son
// el mismo objeto — la lección de RAD-1b aplicada al segundo bloque.
function _radRangoHeadPintar() {
  const el = document.getElementById('radar-rango-meta');
  if (!el) return '';
  const v = _radCalVentana(_radarRange);
  if (_radarRange === 'all') { el.textContent = 'Todo lo que hay medido'; return el.textContent; }
  const hasta = v.until ? _radFechaCorta(new Date(v.until.getTime() - 1)) : _radFechaCorta(_radCalHoy());
  el.textContent = `${v.leyenda} · ${_radFechaCorta(v.since)} → ${hasta}`;
  return el.textContent;
}
function _radChipsPintar() {
  const cont = document.getElementById('radar-range');
  if (!cont) return 0;
  let n = 0;
  cont.querySelectorAll('button[data-r]').forEach((b) => {
    const v = _radCalVentana(b.dataset.r);
    b.textContent = v.leyenda;
    b.title = v.leyenda;
    n++;
  });
  _radRangoHeadPintar();
  const el = document.getElementById('radar-ventana');
  if (el) {
    const v = _radCalVentana(_radarRange);
    if (_radarRange === 'all') {
      el.innerHTML = 'Todo lo que hay medido';
    } else {
      const hasta = v.until ? _radFechaCorta(new Date(v.until.getTime() - 1)) : _radFechaCorta(_radCalHoy());
      // «En curso» no es un adorno: es la advertencia de que este tramo NO se
      // puede comparar contra uno completo. Es de lo que depende que Giru
      // (RAD-1e) no diga que todo bajó cuando la semana apenas va en el jueves.
      const curso = (v.completa === false && v.dias)
        ? ` · <span class="rdr-encurso">en curso · ${v.dias} ${v.dias === 1 ? 'día' : 'días'}</span>` : '';
      el.innerHTML = `<b>${_radFechaCorta(v.since)} → ${hasta}</b> · hora de Reynosa${curso}`;
    }
  }
  return n;
}
// Compatibilidad: lo que el resto de la pantalla ya llamaba. Una sola fuente
// debajo — si alguien añade un quinto consumidor, cae aquí y no en su propia
// aritmética.
function _radarSinceISO(r){ return _radCalVentana(r || _radarRange).since.toISOString(); }
function _trendArrow(actual, anterior){
  if (!anterior || anterior === 0) return { html: '', cls: 'flat' };
  const diff = ((actual - anterior) / anterior) * 100;
  if (Math.abs(diff) < 1) return { html: '→ 0%', cls: 'flat' };
  const arrow = diff > 0 ? '↑' : '↓';
  const cls = diff > 0 ? 'up' : 'down';
  return { html: `${arrow} ${Math.abs(diff).toFixed(0)}%`, cls };
}
function _radarInjectHelpBtn(host, text){
  if (!host || !text || host.querySelector(':scope > .rdr-help-btn')) return;
  // Asegurar contenedor relativo
  const cs = getComputedStyle(host);
  if (cs.position === 'static') host.style.position = 'relative';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rdr-help-btn';
  btn.setAttribute('aria-label', 'Explicar esta métrica');
  btn.setAttribute('aria-expanded', 'false');
  btn.textContent = '?';
  const tip = document.createElement('div');
  tip.className = 'rdr-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.textContent = text;
  host.appendChild(btn);
  host.appendChild(tip);

  function close(){
    tip.classList.remove('visible','tip-above');
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded','false');
  }
  function open(){
    // Cerrar otros tooltips abiertos
    document.querySelectorAll('.rdr-tooltip.visible').forEach(t => {
      if (t !== tip) {
        t.classList.remove('visible','tip-above');
        const pb = t.parentElement && t.parentElement.querySelector('.rdr-help-btn');
        if (pb) { pb.classList.remove('active'); pb.setAttribute('aria-expanded','false'); }
      }
    });
    tip.classList.add('visible');
    btn.classList.add('active');
    btn.setAttribute('aria-expanded','true');
    // Voltear arriba si no hay espacio abajo
    const rect = tip.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) tip.classList.add('tip-above');
  }

  // Desktop: hover
  btn.addEventListener('mouseenter', open);
  host.addEventListener('mouseleave', e => {
    if (!host.contains(e.relatedTarget)) close();
  });
  // Mobile/keyboard: toggle on click + tap-outside-to-close
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (tip.classList.contains('visible')) close(); else open();
  });
  btn.addEventListener('focus', open);
  btn.addEventListener('blur', () => setTimeout(close, 150));
}
function initRadarHelpButtons(){
  const page = document.getElementById('page-radar');
  if (!page) return;
  // KPIs — clave por id de .rdr-kpi-val
  page.querySelectorAll('.rdr-kpi').forEach(kpi => {
    const val = kpi.querySelector('.rdr-kpi-val');
    const id = val && val.id;
    const text = id && RADAR_HELP_KPIS[id];
    if (text) _radarInjectHelpBtn(kpi, text);
  });
  // Cards — clave por texto del title
  page.querySelectorAll('.rdr-card').forEach(card => {
    const titleEl = card.querySelector('.rdr-card-title');
    if (!titleEl) return;
    const titleText = (titleEl.textContent || '').trim();
    for (const key in RADAR_HELP_CARDS) {
      if (titleText.toLowerCase().includes(key.toLowerCase())) {
        _radarInjectHelpBtn(card, RADAR_HELP_CARDS[key]);
        break;
      }
    }
  });
  // Sub-pestañas sin KPIs/cards visibles (Alertas, Comparativas) — botón a nivel sección
  for (const sub in RADAR_HELP_SECTIONS) {
    const sec = page.querySelector('.radar-sub[data-sub="' + sub + '"]');
    if (sec) _radarInjectHelpBtn(sec, RADAR_HELP_SECTIONS[sub]);
  }
  // Cerrar tooltips al tap fuera (idempotente — solo registrar una vez)
  if (!page.dataset.helpClickBound) {
    page.dataset.helpClickBound = '1';
    document.addEventListener('click', e => {
      if (e.target.closest('.rdr-help-btn, .rdr-tooltip')) return;
      document.querySelectorAll('#page-radar .rdr-tooltip.visible').forEach(t => {
        t.classList.remove('visible','tip-above');
        const pb = t.parentElement && t.parentElement.querySelector('.rdr-help-btn');
        if (pb) { pb.classList.remove('active'); pb.setAttribute('aria-expanded','false'); }
      });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('#page-radar .rdr-tooltip.visible').forEach(t => {
          t.classList.remove('visible','tip-above');
          const pb = t.parentElement && t.parentElement.querySelector('.rdr-help-btn');
          if (pb) { pb.classList.remove('active'); pb.setAttribute('aria-expanded','false'); }
        });
      }
    });
  }
}
function initRadarTab(){
  // Gate por rol (también está protegido por allTabs)
  if (!['maestro_roshi'].includes(currentUser?.rol)) {
    const page = document.getElementById('page-radar');
    if (page) page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ts)">Acceso restringido</div>';
    return;
  }
  // Wire sub-tabs (idempotente)
  // [FLUJO-UX-2b] AQUÍ NO HACE FALTA NINGUNA SEÑAL: EL RADAR YA AVISA.
  // `loadRadar` pone `status.textContent = 'Cargando…'` en `#radar-status`.
  // Mi arnés lo daba por mudo porque sólo buscaba `[class*=load]` y `spinner`,
  // y ésta es una señal de TEXTO. Se intentó dos veces meterle un spinner: la
  // primera se quedó pegado y le comió 6 de sus 25 botones; la segunda se
  // borraba antes de verse. Las dos sobraban.
  const subs = document.getElementById('radar-subs');
  if (subs && !subs.dataset.wired) {
    subs.dataset.wired = '1';
    subs.querySelectorAll('button[data-sub]').forEach(btn => {
      btn.addEventListener('click', () => {
        subs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _radarSub = btn.dataset.sub;
        document.querySelectorAll('#page-radar .radar-sub').forEach(s => {
          s.style.display = (s.dataset.sub === _radarSub) ? 'block' : 'none';
        });
        loadRadar();
      });
    });
  }
  const range = document.getElementById('radar-range');
  if (range && !range.dataset.wired) {
    range.dataset.wired = '1';
    range.querySelectorAll('button[data-r]').forEach(btn => {
      btn.addEventListener('click', () => {
        range.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _radarRange = btn.dataset.r;
        _radarRpcCache = {};   // rango nuevo → datos frescos
        _radChipsPintar();
        loadRadar();
      });
    });
  }
  _radChipsPintar();
  // Filtros de alertas
  const af = document.querySelector('#page-radar .radar-sub[data-sub="alertas"] .radar-range');
  if (af && !af.dataset.wired) {
    af.dataset.wired = '1';
    af.querySelectorAll('button[data-af]').forEach(btn => {
      btn.addEventListener('click', () => {
        af.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderAlertasFiltered(btn.dataset.af);
      });
    });
  }
  // Selector de comparativas (modo + mes para 'month_yoy')
  const sel = document.getElementById('rcm-modo');
  if (sel && !sel.dataset.wired) {
    sel.dataset.wired = '1';
    sel.addEventListener('change', loadRadarComparativas);
  }
  const selMes = document.getElementById('rcm-mes-yoy');
  if (selMes && !selMes.dataset.wired) {
    selMes.dataset.wired = '1';
    selMes.addEventListener('change', loadRadarComparativas);
    // Preset al mes anterior (más útil que el actual incompleto)
    const m = new Date().getMonth();
    selMes.value = String(((m - 1) + 12) % 12);
  }
  initRadarHelpButtons();
  loadRadar();
  // Auto-refresh cada 60s mientras estemos en la pestaña
  if (_radarRefreshId) clearInterval(_radarRefreshId);
  _radarRefreshId = setInterval(() => {
    const p = document.getElementById('page-radar');
    if (p && p.classList.contains('active')) loadRadar(true);
    else { clearInterval(_radarRefreshId); _radarRefreshId = null; }
  }, 60000);
  // El conteo de alertas no leídas se actualiza siempre (no depende de la sub-tab)
  refreshAlertasBadge();
}
async function loadRadar(silent){
  // El auto-refresh (silent=true) invalida el cache del RPC para traer datos frescos.
  if (silent) _radarRpcCache = {};
  const status = document.getElementById('radar-status');
  if (status && !silent) status.textContent = 'Cargando…';
  try {
    if (_radarSub === 'resumen')      await loadRadarResumen();
    if (_radarSub === 'sitio')        await loadRadarSitio();
    if (_radarSub === 'rol')          { loadRolAnalytics(); }
    if (_radarSub === 'pagos')        await loadRadarPagos();
    if (_radarSub === 'alertas')      await loadRadarAlertas();
    if (_radarSub === 'comparativas') await loadRadarComparativas();
    // Cargó bien: si había un aviso de error de antes, se va. Un error que se
    // queda pegado después de que la cosa ya funciona miente igual que uno que
    // no aparece.
    document.querySelectorAll('.radar-error-box').forEach(x => x.remove());
    if (status) {
      const hora = new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
      status.textContent = `Última act: ${hora}`;
    }
  } catch (e) {
    // [EQ-8] El mensaje técnico va a la CONSOLA; a la pantalla va algo que se
    // pueda leer y hacer. Antes se pintaba `e.message` tal cual, así que el
    // Palacio le enseñaba "Cannot read properties of undefined (reading
    // 'main')" a quien solo quería ver sus números. Un stack no es un aviso:
    // es una confesión que no le sirve a quien la lee.
    console.error('[radar]', e);
    if (status) status.textContent = 'No se pudo cargar';
    _radarPintarError(e);
  }
}
// [EQ-8] El aviso legible del radar, con su salida. Se pinta ARRIBA del panel
// activo y se quita solo en la siguiente carga buena.
function _radarPintarError(e) {
  // Los sub-paneles del radar no llevan id propio (se cambian con data-sub),
  // así que el aviso vive arriba de la página entera. Verificado en el HTML:
  // el único contenedor con id es #page-radar.
  const cont = document.getElementById('page-radar');
  if (!cont) return;
  document.querySelectorAll('.radar-error-box').forEach(x => x.remove());
  // [EQ-8b] El estilo vive en kamehouse.css, no aquí. El contador de color en
  // línea de este archivo está CONGELADO por la vigilancia de KH-4: no crece
  // sin permiso, y para dos cajas de error no hace falta pedirlo.
  // (Y el comentario evita escribir la propiedad con sus dos puntos: la
  //  vigilancia es un grep, y hasta una cita en prosa le suma uno.)
  const caja = document.createElement('div');
  caja.className = 'err-box radar-error-box';
  const detalle = String((e && e.message) || '').slice(0, 200);
  caja.innerHTML = '<strong class="err-titulo">No se pudieron cargar los números.</strong><br>'
    + 'Puede ser la conexión o que el servidor esté tardando. Vuelve a intentar en un momento.'
    + '<div class="err-pie">'
    + '<button class="btn btn-ghost btn-sm err-btn" onclick="loadRadar()">↻ Reintentar</button>'
    + '<span class="err-detalle">detalle técnico: ' + _esfEsc(detalle) + '</span>'
    + '</div>';
  cont.insertBefore(caja, cont.firstChild);
}
async function _radarFetch(table, sinceISO, untilISO){
  // [sec-radar-wl] Antes leía /rest/v1 con la anon key + paginación Range/Content-Range
  // aquí en el cliente. Ahora delega en admin-radar (service_role), que reproduce
  // EXACTAMENTE los mismos filtros (created_at gte/lt), order y paginación, y devuelve
  // el array completo. Conservamos la firma (table, sinceISO, untilISO) para no tocar
  // los 6 call sites. `table` puede traer '?select=...'.
  const qi = table.indexOf('?');
  const tbl = qi >= 0 ? table.slice(0, qi) : table;
  let select;
  if (qi >= 0) {
    const params = new URLSearchParams(table.slice(qi + 1));
    select = params.get('select') || undefined;
  }
  return khRadar.fetch({ table: tbl, select, since: sinceISO, until: untilISO || undefined });
}
// ── Helpers visuales del Radar ────────────────────────────
// Bucketing por día: devuelve array de N valores (uno por día) terminando en HOY.
// [RAD-1a] LA QUINTA aritmética de calendario que tenía esta pantalla, y la
// más escondida: los sparklines agrupaban por día usando la medianoche DEL
// NAVEGADOR, tanto para «hoy» como para cada fila. Desde un teléfono en otro
// huso, las barritas se corrían de cubeta sin que nada se viera roto.
// Ahora el día es el de Reynosa, el mismo que el resto del Radar.
function _rdrSeries7d(rows, predicate, days){
  days = days || 7;
  const clave = (t) => { const p = _radCalPartes(t); return p.y * 10000 + p.m * 100 + p.d; };
  // Las N claves de día que terminan en HOY, en orden.
  const hoy = _radCalHoy();
  const orden = [];
  for (let i = days - 1; i >= 0; i--) orden.push(clave(_radCalMasDias(hoy, -i).getTime()));
  const idx = new Map(orden.map((k, i) => [k, i]));
  const buckets = new Array(days).fill(0);
  for (const r of rows || []) {
    if (predicate && !predicate(r)) continue;
    const i = idx.get(clave(new Date(r.created_at).getTime()));
    if (i != null) buckets[i]++;
  }
  return buckets;
}
// Genera el path SVG de un sparkline + área debajo, dado un array de valores.
// viewBox fijo 240x32 (matchea el HTML).
function _rdrSparkPath(values, w, h){
  w = w || 240; h = h || 32;
  if (!values || values.length < 2) {
    return { line: `M0 ${h-2} L${w} ${h-2}`, area: '', dot: { cx:w, cy:h-2 } };
  }
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = h - 4 - ((v - min) / range) * (h - 8);
    return [x, y];
  });
  const line = 'M ' + points.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ');
  const last = points[points.length - 1];
  const area = line + ` L ${w} ${h} L 0 ${h} Z`;
  return { line, area, dot: { cx: last[0], cy: last[1] } };
}
function _rdrPaintSpark(svgEl, values){
  if (!svgEl) return;
  const { line, area, dot } = _rdrSparkPath(values);
  // Limpiar y dibujar de nuevo
  svgEl.innerHTML =
    `<path class="spark-area" d="${area}"/>` +
    `<path class="spark-path" d="${line}"/>` +
    `<circle class="spark-dot" cx="${dot.cx.toFixed(1)}" cy="${dot.cy.toFixed(1)}" r="2.5"/>`;
}
// Donut: genera segmentos <path> con stroke-dasharray (animados).
function _rdrPaintDonut(svgGroupId, items, palette){
  const g = document.getElementById(svgGroupId);
  if (!g) return;
  const total = items.reduce((a, it) => a + it.value, 0);
  if (total === 0) { g.innerHTML = ''; return; }
  const r = 46, c = 2 * Math.PI * r;
  let acc = 0;
  g.innerHTML = items.map((it, i) => {
    const portion = it.value / total;
    const dash = (portion * c).toFixed(2);
    const gap  = (c - portion * c).toFixed(2);
    const offset = (-acc * c).toFixed(2);
    acc += portion;
    const color = palette[i % palette.length];
    return `<circle cx="60" cy="60" r="${r}" fill="none"
      stroke="${color}" stroke-width="14"
      stroke-dasharray="${dash} ${gap}"
      stroke-dashoffset="${offset}"
      style="transition:stroke-dasharray .9s cubic-bezier(.2,.85,.3,1)"/>`;
  }).join('');
  // Texto central: muestra el total
  const t = document.getElementById('rgr-donut-center');
  if (t) t.textContent = total.toLocaleString('es-MX');
}
// ── RESUMEN GENERAL ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// [RAD-1c] LA FRANJA DEL DÍA
//
// 🔒 NINGÚN CONTADOR NUEVO. Las visitas se miden desde el 19-may-2026 en
// `main_eventos_uso` —33,563 filas de `main_visita`— y el Radar ya las leía:
// «Visitas totales» es la primera tarjeta del Resumen. Lo que faltaba era la
// lectura DE HOY, porque esa tarjeta enseña el RANGO ELEGIDO y el default es el
// mes: decía 11,779 y nunca 190. Un contador nuevo habría sido una segunda
// fuente del mismo número.
//
// 🔒 Y LA COMPARACIÓN VA CONTRA EL MISMO TRAMO HORARIO. Medido hoy a las 14:35
// de Reynosa: 285 visitas. Contra la media de 7 días COMPLETOS son −53% («día
// desastroso»); contra la media al MISMO TRAMO son +8% («día por encima»). El
// signo se invierte. Es la lección de RAD-1a-FIX aplicada antes de repetirla —
// y la maqueta del diagnóstico decía −76% justamente por calcularlo mal.
//
// El número lo computa el RPC, no esta función: son ~15,000 filas para ocho
// días. Aquí solo se pinta.
// ═══════════════════════════════════════════════════════════════════════════
function _radPct(hoy, media) {
  if (!media || media <= 0) return null;
  return Math.round((hoy - media) * 100 / media);
}
function _radDiaTarjeta(rot, valor, pct, pie) {
  const flecha = pct == null ? ''
    : `<span class="rdia-tr ${pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'}">${pct > 0 ? '↑' : pct < 0 ? '↓' : '→'} ${Math.abs(pct)}%</span>`;
  return `<div class="rdia-card">
      <div class="rdia-rot">${_radarEsc(rot)}</div>
      <div class="rdia-val">${valor == null ? '—' : Number(valor).toLocaleString('es-MX')}${flecha}</div>
      <div class="rdia-pie">${pie}</div>
    </div>`;
}
async function _radDiaCargar() {
  const el = document.getElementById('radar-dia');
  if (!el) return null;
  let d;
  try { d = await khRadar.dia(); }
  catch (e) {
    // 🔒 Falla RUIDOSO y con el porqué. Un cero silencioso aquí diría «hoy no
    // vino nadie», que es una afirmación, no un dato que falta.
    el.innerHTML = `<div class="rdia-error">No pude leer el día de hoy. <span>${_radarEsc(e.message || '')}</span></div>`;
    return null;
  }
  if (!d) { el.innerHTML = ''; return null; }
  const m = d.media7 || {};
  const cl = d.clicks || {};
  el.innerHTML = `
    <div class="rdia-head">
      <span class="rdia-tit">EL DÍA DE HOY</span>
      <span class="rdia-linea"></span>
      <span class="rdia-meta">${_radarEsc(String(d.hoy || ''))} · corte 00:00 Reynosa · van ${_radarEsc(String(d.corrido || ''))}</span>
    </div>
    <div class="rdia-grid">
      ${_radDiaTarjeta('Visitas hoy', d.visitas, _radPct(d.visitas, m.visitas),
        `vs ${Number(m.visitas || 0).toLocaleString('es-MX')} de media · ${_radarEsc(String(m.tramo || ''))}`)}
      ${_radDiaTarjeta('Vieron un evento', d.vieron, _radPct(d.vieron, m.vieron),
        d.visitas ? `${Math.round((d.vieron || 0) * 100 / d.visitas)}% de las visitas` : '—')}
      ${_radDiaTarjeta('Cotizaron', d.cotizaron, _radPct(d.cotizaron, m.cotizaron),
        d.visitas ? `${Math.round((d.cotizaron || 0) * 100 / d.visitas)}% de las visitas` : '—')}
      ${/* 🔒 Los clicks van SIN flecha. `event_clicks_diario` guarda un total por
            día sin marca de tiempo, así que no hay forma de recortarlo al tramo
            corrido: solo se podría comparar hoy-a-medias contra días enteros,
            que es justo lo que esta tuerca prohíbe. Se enseña el número y ya. */''}
      ${_radDiaTarjeta('Clicks en eventos', cl.n, null,
        `${Number(cl.eventos || 0)} eventos distintos · sin comparación`)}
    </div>`;
  return d;
}
// El detalle de la ventana, compuesto DEL DATO que mandó el RPC. Si el rótulo
// y las fechas se separaran, volveríamos al problema que arregló RAD-1b.
function _radTopDetalle(v) {
  if (!v || !v.desde) return '';
  const d0 = _radFechaCorta(new Date(v.desde + 'T12:00:00Z'));
  const d1 = _radFechaCorta(new Date(v.hasta + 'T12:00:00Z'));
  if (v.tipo === 'hoy')  return d0;
  if (v.tipo === 'mes')  return `${d0} → ${d1}`;
  return `${d0} → hoy · ${v.dias} días`;
}
async function _radTopsCargar() {
  const el = document.getElementById('radar-tops');
  if (!el) return null;
  let t;
  try { t = await khRadar.tops(5); }
  catch (e) {
    el.innerHTML = `<div class="rdia-error">No pude leer los tops. <span>${_radarEsc(e.message || '')}</span></div>`;
    return null;
  }
  if (!t) { el.innerHTML = ''; return null; }
  const ven = t.ventanas || {}, tops = t.tops || {};
  el.innerHTML = _RAD_TOPS.map(([k, rot]) => {
    const filas = tops[k] || [];
    const cuerpo = filas.length
      ? filas.map((f) => `<div class="rtop-fila">
            <span class="rtop-pos">${f.pos}</span>
            <span class="rtop-nom" title="${_radarEsc(f.nombre || f.id)}">${_radarEsc(f.nombre || f.id)}</span>
            <span class="rtop-n">${Number(f.sesiones).toLocaleString('es-MX')}</span>
          </div>`).join('')
      // 🔒 Un top vacío es un HECHO, no un hueco: hoy a las 6am nadie ha visto
      // nada todavía, y eso hay que decirlo en vez de dejar la caja en blanco.
      : '<div class="rtop-vacio">Todavía nadie · sesiones únicas</div>';
    return `<div class="rtop-caja">
        <div class="rtop-head">
          <span class="rtop-rot">${_radarEsc(rot)}</span>
          <span class="rtop-ven">${_radarEsc(_radTopDetalle(ven[k]))}</span>
        </div>
        <div class="rtop-body">${cuerpo}</div>
      </div>`;
  }).join('');
  return t;
}
// ═══════════════════════════════════════════════════════════════════════════
// [RAD-1e] GIRU 🤖 · LA CARA
//
// 🔒 GIRU NO OPINA, GIRU LEE. Aquí no se calcula NADA: el motor vive en el RPC
// y esto solo pinta lo que llegó, con su fuente debajo. Si la lectura y su
// fuente se calcularan en sitios distintos, la fuente dejaría de ser una
// prueba y pasaría a ser una etiqueta.
//
// 🔒 Y SI NO HAY NADA QUE DECIR, GIRU SE CALLA — pero lo DICE. Una tarjeta que
// desaparece se lee como «se rompió»; una que dice «hoy no hay nada que
// señalar» es información. Medido: hoy dispara 3 de 5 reglas; con umbrales
// imposibles, 0.
// ═══════════════════════════════════════════════════════════════════════════
async function _radGiruCargar() {
  const el = document.getElementById('radar-giru');
  if (!el) return null;
  let g;
  try { g = await khRadar.giru(); }
  catch (e) {
    el.innerHTML = `<div class="rdia-error">Giru no pudo leer el radar. <span>${_radarEsc(e.message || '')}</span></div>`;
    return null;
  }
  if (!g) { el.innerHTML = ''; return null; }
  const L = Array.isArray(g.lecturas) ? g.lecturas : [];
  const cuerpo = L.length
    ? L.map((l) => `<div class="rgiru-fila">
          <span class="rgiru-ico">${_radarEsc(l.icono || '•')}</span>
          <div class="rgiru-txt">
            <div class="rgiru-frase">${_radarEsc(l.texto || '')}</div>
            <div class="rgiru-fuente">↳ ${_radarEsc(l.fuente || '')}</div>
          </div>
        </div>`).join('')
    : `<div class="rgiru-callado">Hoy no hay nada que señalar. Los números van dentro de lo normal.</div>`;
  // ⚠️ «Semana en curso» se dice cuando la semana no ha cerrado, porque las
  // lecturas de eventos comparan lun→hoy contra lun→el mismo día. El tramo es
  // el mismo a los dos lados —eso lo garantiza el RPC— pero el lector merece
  // saber que está mirando media semana.
  const curso = g.semana_en_curso
    ? `<span class="rgiru-curso">semana en curso · se compara contra el mismo tramo</span>` : '';
  el.innerHTML = `
    <div class="rgiru">
      <div class="rgiru-head">
        <span class="rgiru-bot">🤖</span>
        <span class="rgiru-nom">GIRU</span>
        <span class="rgiru-meta">lee el radar · ${L.length} ${L.length === 1 ? 'lectura' : 'lecturas'} · ${_radarEsc(String(g.corrido || ''))}</span>
        <span class="rgiru-sello">computado, no opinado</span>
      </div>
      ${curso ? `<div class="rgiru-aviso">${curso}</div>` : ''}
      <div class="rgiru-body">${cuerpo}</div>
    </div>`;
  return g;
}
async function loadRadarResumen(){
  // [RAD-1c] La franja del día va PRIMERO y en paralelo: es lo que Memo mira al
  // entrar, y no depende del rango elegido — «hoy» es hoy aunque estés viendo
  // el mes. Falla en blando: si el día no carga, el resto del Resumen entra.
  _radDiaCargar();
  _radTopsCargar();   // [RAD-1d] los tres tops, también independientes del rango
  _radGiruCargar();   // [RAD-1e] las lecturas de Giru
  // KPIs, top de eventos y donut de orígenes salen del RPC agregado (cacheado por rango).
  // Esto reemplaza la descarga de ~52k filas + conteo client-side que hacía timeout.
  const data  = await _radarGetMetricas(_radarRange);
  const mAct  = (data.main || {}).act  || {};
  const mPrev = (data.main || {}).prev || {};
  const rAct  = (data.rol  || {}).act  || {};
  const rPrev = (data.rol  || {}).prev || {};

  // Sparklines (7 días) y actividad por hora (24h) son series temporales: siguen
  // saliendo de un fetch liviano de los últimos 7 días (nunca fue el cuello de botella).
  // [RAD-1c] LA SEXTA aritmética de calendario de esta pantalla, encontrada al
  // construir la franja del día: `now − 7×24h` arranca a la hora del clic, así
  // que la cubeta más vieja del sparkline salía siempre a medias. Se pide al
  // calendario, y se traen OCHO días para que la franja tenga con qué comparar.
  const since7d = _radCalMasDias(_radCalHoy(), -7).toISOString();
  const [waitlist, main7, rol7] = await Promise.all([
    _radarFetch('eventos_waitlist?select=evento_id,evento_nombre,created_at', '1970-01-01T00:00:00Z').catch(() => []),
    _radarFetch('main_eventos_uso', since7d).catch(() => []),
    _radarFetch('rol_eventos_uso',  since7d).catch(() => [])
  ]);

  // ── KPIs (desde el RPC) ──
  const num = v => Number(v) || 0;
  const visitas    = num(mAct.visitas),      visitasP   = num(mPrev.visitas);
  const cot        = num(mAct.cotizaciones), cotP       = num(mPrev.cotizaciones);
  const modal      = num(mAct.modal),        modalP     = num(mPrev.modal);
  const compro     = num(mAct.comprobante),  comproP    = num(mPrev.comprobante);
  // Conversión global = comprobantes / visitas × 100 (misma fórmula que antes).
  const conv       = visitas  ? (compro  / visitas  * 100) : 0;
  const convP      = visitasP ? (comproP / visitasP * 100) : 0;
  const planes     = num(rAct.planes),       planesP    = num(rPrev.planes);
  const codigosOk  = num(mAct.codigos_ok),   codigosOkP = num(mPrev.codigos_ok);
  const wlTotal    = num(data.waitlist_total);

  // Set KPI val + trend pill
  const setKpi = (id, val, prev, isPercent) => {
    const el = document.getElementById(id);
    if (el) el.textContent = isPercent ? (typeof val === 'number' ? val.toFixed(1)+'%' : String(val))
                                       : (typeof val === 'number' ? val.toLocaleString('es-MX') : String(val));
    const tr = document.getElementById(id+'-tr');
    if (tr) {
      const t = _trendArrow(typeof val === 'number' ? val : parseFloat(val) || 0, prev || 0);
      tr.textContent = t.html;
      tr.className = 'rdr-kpi-trend ' + t.cls;
    }
  };
  setKpi('rgr-visitas',     visitas, visitasP);
  setKpi('rgr-cotizaciones', cot,    cotP);
  setKpi('rgr-modal',       modal,   modalP);
  setKpi('rgr-comprobante', compro,  comproP);
  setKpi('rgr-conv',        conv,    convP, true);
  setKpi('rgr-planes',      planes,  planesP);
  setKpi('rgr-codigos',     codigosOk, codigosOkP);
  // Eventos activos: fetch async desde /index.html (cache 5 min interno)
  _radarContarEventosActivos().then(n => {
    const el = document.getElementById('rgr-eventos-act');
    if (el) el.textContent = (n == null ? '—' : n.toLocaleString('es-MX'));
  });
  document.getElementById('rgr-waitlist').textContent = wlTotal.toLocaleString('es-MX');

  // ── Sparklines (7 días móviles) ──
  _rdrPaintSpark(document.getElementById('rgr-visitas-spark'),     _rdrSeries7d(main7, r => r.accion==='main_visita'));
  _rdrPaintSpark(document.getElementById('rgr-cotizaciones-spark'),_rdrSeries7d(main7, r => r.accion==='main_cotizacion_generada'));
  _rdrPaintSpark(document.getElementById('rgr-modal-spark'),       _rdrSeries7d(main7, r => r.accion==='main_modal_pago_abierto'));
  _rdrPaintSpark(document.getElementById('rgr-comprobante-spark'), _rdrSeries7d(main7, r => r.accion==='main_comprobante_enviado'));
  _rdrPaintSpark(document.getElementById('rgr-codigos-spark'),     _rdrSeries7d(main7, r => r.accion==='main_codigo_intentado' && r.codigo_valido));
  _rdrPaintSpark(document.getElementById('rgr-planes-spark'),      _rdrSeries7d(rol7, r => r.accion==='rol_plan_generado'));
  // Conv como % por día — eviata división por cero si no hay visitas ese día.
  // Misma fórmula que el KPI: comprobantes / visitas, NO modal_pago_abierto.
  const sparkConv = (() => {
    const v = _rdrSeries7d(main7, r => r.accion==='main_visita');
    const c = _rdrSeries7d(main7, r => r.accion==='main_comprobante_enviado');
    return v.map((vi, i) => vi > 0 ? (c[i] / vi * 100) : 0);
  })();
  _rdrPaintSpark(document.getElementById('rgr-conv-spark'), sparkConv);
  _rdrPaintSpark(document.getElementById('rgr-waitlist-spark'),
    _rdrSeries7d(waitlist, () => true));

  // ── Top eventos cotizados (con barras inline) — por sesiones únicas (del RPC) ──
  const olTop = document.getElementById('rgr-top-cot');
  const arr = (mAct.top_cotizados || []).map(e => ({ nombre: e.nombre || e.evento_id, n: num(e.sesiones) }));
  const metaTop = document.getElementById('rgr-top-cot-meta');
  if (metaTop) metaTop.textContent = `${arr.length} ${arr.length===1?'evento':'eventos'}`;
  const maxCot = Math.max(1, ...arr.map(x => x.n));
  olTop.innerHTML = arr.length === 0
    ? '<li class="rdr-empty">Sin cotizaciones en el rango</li>'
    : arr.map((x, i) => {
        const n = x.n;
        const pct = (n / maxCot * 100).toFixed(0);
        const delay = (0.05 + i*0.04).toFixed(2);
        return `<li>
          <span class="rk-pos">#${i+1}</span>
          <span class="rk-name">${_radarEsc(x.nombre)}<span class="rk-bar" style="width:${pct}%;animation-delay:${delay}s"></span></span>
          <span class="rk-val">${n}<span class="unit">${n===1?'sesión':'sesiones'}</span></span>
        </li>`;
      }).join('');

  // ── Donut: orígenes de tráfico (del RPC) ──
  const orig = mAct.origenes || {};
  const origArr = Object.entries(orig).sort((a,b) => b[1]-a[1]).map(([k,n]) => ({ label:k, value:num(n) }));
  const origTotal = origArr.reduce((a,b) => a+b.value, 0);
  const palette = ['#e8ff4c', '#ff283b', '#0000cd', '#88ea4e', '#ff4bd1', '#7be0ff', '#a4ff7b'];
  _rdrPaintDonut('rgr-donut-segs', origArr, palette);
  const metaOrig = document.getElementById('rgr-origenes-meta');
  if (metaOrig) metaOrig.textContent = origTotal === 0 ? '—' : `${origTotal} sesiones`;
  const legend = document.getElementById('rgr-donut-legend');
  legend.innerHTML = origTotal === 0
    ? '<div class="rdr-empty">Sin sesiones</div>'
    : origArr.map((it, i) => {
        const pct = (it.value / origTotal * 100).toFixed(1);
        return `<div class="lg">
          <span class="dot" style="background:${palette[i % palette.length]}"></span>
          <span class="lbl">${_radarEsc(it.label)}</span>
          <span class="pct">${pct}%</span>
        </div>`;
      }).join('');

  // ── Actividad por hora (últimas 24h sobre main7) ──
  const nowMs = Date.now(), dayAgoMs = nowMs - 24 * 3600 * 1000;
  const buckets = new Array(24).fill(0);
  for (const r of (main7 || [])) {
    const t = new Date(r.created_at).getTime();
    if (t < dayAgoMs || t > nowMs) continue;
    const hoursAgo = Math.floor((nowMs - t) / (3600 * 1000));
    if (hoursAgo >= 0 && hoursAgo < 24) buckets[23 - hoursAgo]++;
  }
  const maxBucket = Math.max(1, ...buckets);
  const baseHour = new Date(nowMs - 23 * 3600 * 1000);
  const fmtH = (i) => {
    const d = new Date(baseHour.getTime() + i * 3600 * 1000);
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute:'2-digit', hour12: false });
  };
  const actWrap = document.getElementById('rgr-actividad');
  if (buckets.every(b => b === 0)) {
    actWrap.innerHTML = '<div class="rdr-empty">Sin actividad en las últimas 24h</div>';
  } else {
    actWrap.innerHTML = buckets.map((n, i) => {
      const pct = (n / maxBucket * 100).toFixed(1);
      const delay = (i * 0.015).toFixed(2);
      return `<div class="hr">
        <span class="h">${fmtH(i)}</span>
        <div class="track"><div class="fill" style="width:${pct}%;animation-delay:${delay}s"></div></div>
        <span class="n">${n}</span>
      </div>`;
    }).join('');
  }
}
// ── SITIO PRINCIPAL ────────────────────────────────────────
async function loadRadarSitio(){
  // Todo el panel sale del RPC agregado (cacheado por rango). Sin tendencias aquí.
  const data = await _radarGetMetricas(_radarRange);
  const mAct = (data.main || {}).act || {};
  const num = v => Number(v) || 0;
  // KPIs por sesión única (del RPC).
  const visitas       = num(mAct.visitas);
  const eventosVistos = num(mAct.eventos_vistos);
  const cot           = num(mAct.cotizaciones);
  const codigos       = num(mAct.codigos);
  const musica        = num(mAct.musica);
  const devs = mAct.devices || {};
  const devTotal = num(mAct.total_rows) || 1;
  const devStr = Object.entries(devs).map(([k,n])=>`${k.charAt(0).toUpperCase()+k.slice(1)} ${Math.round(num(n)/devTotal*100)}%`).join(' · ') || '—';
  document.getElementById('rsi-sesiones').textContent = visitas.toLocaleString('es-MX');
  document.getElementById('rsi-eventos-vistos').textContent = eventosVistos.toLocaleString('es-MX');
  document.getElementById('rsi-cotizaciones').textContent = cot.toLocaleString('es-MX');
  document.getElementById('rsi-codigos').textContent = codigos.toLocaleString('es-MX');
  document.getElementById('rsi-devices').textContent = devStr;
  document.getElementById('rsi-musica').textContent = musica.toLocaleString('es-MX');

  // Top eventos vistos — por sesiones únicas (del RPC).
  const arr = (mAct.top_vistos || []).map(e => ({ nombre: e.nombre || e.evento_id, n: num(e.sesiones) }));
  const maxClicks = Math.max(1, ...arr.map(x => x.n));
  document.getElementById('rsi-eventos-top').innerHTML = arr.length === 0
    ? '<li class="rdr-empty">Sin eventos vistos en el rango</li>'
    : arr.map((x, i) => {
        const n = x.n;
        const pct = (n / maxClicks * 100).toFixed(0);
        return `<li>
          <span class="rk-pos">#${i+1}</span>
          <span class="rk-name">${_radarEsc(x.nombre)}<span class="rk-bar" style="width:${pct}%;animation-delay:${(0.04*i).toFixed(2)}s"></span></span>
          <span class="rk-val">${n}<span class="unit">${n===1?'sesión':'sesiones'}</span></span>
        </li>`;
      }).join('');

  // Paquetes (última elección por sesión) — del RPC.
  const pkgSrc = mAct.paquetes || {};
  const pkgCount = { PLUS:num(pkgSrc.PLUS), RIDE:num(pkgSrc.RIDE), STAY:num(pkgSrc.STAY), CHEAP:num(pkgSrc.CHEAP) };
  const pkgTotal = Object.values(pkgCount).reduce((a,b) => a+b, 0);
  document.getElementById('rsi-paquetes').innerHTML = pkgTotal === 0
    ? '<div class="rdr-empty">Sin paquetes elegidos</div>'
    : Object.entries(pkgCount).sort((a,b)=>b[1]-a[1]).map(([k,n]) => {
        const pct = n/pkgTotal*100;
        return `<div class="row"><span class="k">${k}</span><div class="t"><div class="f" style="width:${pct.toFixed(1)}%"></div></div><span class="p">${pct.toFixed(1)}%</span></div>`;
      }).join('');

  // Embudo (del RPC).
  const emb = mAct.embudo || {};
  const pasos = [
    ['Visitas',          num(emb.visitas) || visitas],
    ['Vieron evento',    num(emb.evento_visto)],
    ['Eligen paquete',   num(emb.paquete)],
    ['Eligen zona',      num(emb.zona)],
    ['Generan cotización', num(emb.cotizacion)],
    ['Abren modal pago', num(emb.modal)],
    ['Envían comprobante', num(emb.comprobante)]
  ];
  const base = pasos[0][1] || 1;
  document.getElementById('rsi-embudo').innerHTML = pasos.map(([k,n]) => {
    const pct = n/base*100;
    const fill = `background:linear-gradient(90deg, rgba(232,255,76,.16) ${pct.toFixed(1)}%, rgba(255,255,255,.02) ${pct.toFixed(1)}%)`;
    return `<li style="${fill}"><span class="step">${k}</span><span class="count">${n.toLocaleString('es-MX')}</span><span class="pct">${pct.toFixed(0)}%</span></li>`;
  }).join('');

  // Filtros (del RPC, top 10).
  const farr = (mAct.filtros || []).map(e => [e.filtro, num(e.n)]);
  const maxFiltro = Math.max(1, ...farr.map(([,n]) => n));
  document.getElementById('rsi-filtros').innerHTML = farr.length === 0
    ? '<li class="rdr-empty">Sin filtros usados</li>'
    : farr.map(([k,n], i) => {
        const pct = (n / maxFiltro * 100).toFixed(0);
        return `<li>
          <span class="rk-pos">#${i+1}</span>
          <span class="rk-name">${_radarEsc(k)}<span class="rk-bar" style="width:${pct}%;animation-delay:${(0.04*i).toFixed(2)}s"></span></span>
          <span class="rk-val">${n}</span>
        </li>`;
      }).join('');

  // Códigos validos vs no (del RPC).
  const cod = { validos: num(mAct.codigos_ok_n), invalidos: num(mAct.codigos_no_n) };
  const codTotal = cod.validos + cod.invalidos;
  document.getElementById('rsi-codigos-detalle').innerHTML = codTotal === 0
    ? '<div class="rdr-empty">Sin intentos de código</div>'
    : `<div class="row"><span class="k">Válidos</span><div class="t"><div class="f" style="width:${(cod.validos/codTotal*100).toFixed(1)}%"></div></div><span class="p">${cod.validos}</span></div>
       <div class="row"><span class="k">No vál.</span><div class="t"><div class="f alt" style="width:${(cod.invalidos/codTotal*100).toFixed(1)}%"></div></div><span class="p" style="color:var(--rdr-red)">${cod.invalidos}</span></div>`;

  // Origen tráfico (del RPC).
  const orig = mAct.origenes || {};
  const oTotal = Object.values(orig).reduce((a,b)=>a+Number(b),0);
  document.getElementById('rsi-origenes').innerHTML = oTotal === 0
    ? '<div class="rdr-empty">Sin sesiones</div>'
    : Object.entries(orig).sort((a,b)=>b[1]-a[1]).map(([k,n]) => {
        const pct = n/oTotal*100;
        return `<div class="row"><span class="k">${_radarEsc(k)}</span><div class="t"><div class="f" style="width:${pct.toFixed(1)}%"></div></div><span class="p">${pct.toFixed(1)}%</span></div>`;
      }).join('');

  // Ventas vs tráfico — cruce KH visitas × Portal ventas por evento. Mismo
  // since/until (rango) que el resto de la pestaña. Falla suave (su propia card).
  const vtEl = document.getElementById('rsi-ventas-trafico');
  if (vtEl) {
    try {
      const vt = await khRadar.ventasTrafico({ since: _radarSinceISO() });
      vtEl.innerHTML = (!vt.length)
        ? '<div class="rdr-empty">Sin datos en el rango</div>'
        : `<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:420px">
             <thead><tr style="text-align:left;color:var(--ts);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase">
               <th style="padding:6px 8px">Evento</th>
               <th style="padding:6px 8px;text-align:right">Visitas</th>
               <th style="padding:6px 8px;text-align:right">Ventas</th>
               <th style="padding:6px 8px;text-align:right">Conversión</th>
             </tr></thead>
             <tbody>${vt.map(r => {
               const visitas = Number(r.visitas) || 0;
               const ventas  = Number(r.ventas) || 0;
               const convPct = (r.conv == null) ? '—' : (r.conv * 100).toFixed(1) + '%';
               const alerta  = (visitas >= 50 && ventas === 0);   // mucho ojo: tráfico sin venta
               const buena   = (r.conv != null && r.conv >= 0.03); // conversión sana
               const convColor = buena ? 'var(--gold)' : (alerta ? 'var(--red)' : 'inherit');
               return `<tr style="border-top:1px solid var(--rdr-border)${alerta ? ';color:var(--red)' : ''}">
                 <td style="padding:6px 8px">${_esfEsc(r.evento_nombre)}</td>
                 <td style="padding:6px 8px;text-align:right">${visitas.toLocaleString('es-MX')}</td>
                 <td style="padding:6px 8px;text-align:right">${ventas.toLocaleString('es-MX')}</td>
                 <td style="padding:6px 8px;text-align:right;font-weight:700;color:${convColor}">${_esfEsc(convPct)}</td>
               </tr>`;
             }).join('')}</tbody>
           </table>`;
    } catch (e) {
      vtEl.innerHTML = `<div class="rdr-empty">No se pudo cargar: ${_esfEsc(e.message)}</div>`;
    }
  }
}
// ── /PAGOS ─────────────────────────────────────────────────
async function loadRadarPagos(){
  // Todo el panel sale del RPC agregado (cacheado por rango). Sin tendencias aquí.
  const data = await _radarGetMetricas(_radarRange);
  const p = (data.pagos || {}).act || {};
  const num = v => Number(v) || 0;
  const visitas = num(p.visitas);
  const copias  = num(p.copias);
  const wa      = num(p.wa);
  document.getElementById('rpa-sesiones').textContent = visitas.toLocaleString('es-MX');
  document.getElementById('rpa-copias').textContent = copias.toLocaleString('es-MX');
  document.getElementById('rpa-wa').textContent = wa.toLocaleString('es-MX');
  // Cuentas más copiadas (top 10, del RPC): [{cuenta, n}]
  const carr = (p.cuentas || []).map(e => [e.cuenta, num(e.n)]);
  const maxCuenta = Math.max(1, ...carr.map(([,n]) => n));
  document.getElementById('rpa-cuentas').innerHTML = carr.length === 0
    ? '<li class="rdr-empty">Sin copias registradas</li>'
    : carr.map(([k,n], i) => {
        const pct = (n / maxCuenta * 100).toFixed(0);
        return `<li>
          <span class="rk-pos">#${i+1}</span>
          <span class="rk-name">${_radarEsc(k)}<span class="rk-bar" style="width:${pct}%;animation-delay:${(0.04*i).toFixed(2)}s"></span></span>
          <span class="rk-val">${n}</span>
        </li>`;
      }).join('');
  // Orígenes (bucket por referrer, del RPC): {bucket: n}
  const orig = p.origenes || {};
  const oTotal = Object.values(orig).reduce((a,b)=>a+Number(b),0);
  document.getElementById('rpa-origenes').innerHTML = oTotal === 0
    ? '<div class="rdr-empty">Sin sesiones</div>'
    : Object.entries(orig).sort((a,b)=>b[1]-a[1]).map(([k,n]) => {
        const pct = n/oTotal*100;
        return `<div class="row"><span class="k">${_radarEsc(k)}</span><div class="t"><div class="f" style="width:${pct.toFixed(1)}%"></div></div><span class="p">${pct.toFixed(1)}%</span></div>`;
      }).join('');
}
// ── ALERTAS ────────────────────────────────────────────────
async function loadRadarAlertas(){
  _radarCache.alertas = await khRadar.alertasListar(); // [sec-radar-wl]
  renderAlertasFiltered('all');
  refreshAlertasBadge();
}
function renderAlertasFiltered(filtro){
  const arr = (_radarCache.alertas || []).filter(a => {
    if (filtro === 'unread') return !a.vista;
    if (filtro === 'critical') return a.severidad === 'alta';
    return true;
  });
  const list = document.getElementById('ral-list');
  if (!list) return;
  if (arr.length === 0) { list.innerHTML = '<div class="rdr-empty">Sin alertas en este filtro</div>'; return; }
  list.innerHTML = arr.map(a => {
    // 🔒 [RAD-1i] LA SÉPTIMA ARITMÉTICA DE CALENDARIO de esta pantalla, y la
    // más callada: sin `timeZone`, `toLocaleString` usa el huso de LA MÁQUINA
    // de quien mira. La alerta del 24-ago 02:00 UTC se veía como «23 ago, 8:00
    // p.m.» (Monterrey) cuando en Reynosa fueron las 9:00 p.m. — y desde otra
    // computadora se habría visto otra hora distinta.
    // `RAD_TZ` es la MISMA constante del calendario del Radar, no un literal.
    const fecha = new Date(a.created_at).toLocaleString('es-MX', { dateStyle:'medium', timeStyle:'short', timeZone: RAD_TZ });
    const dest = _radarAlertaDestino(a.tipo);
    return `<div class="rdr-alert sev-${a.severidad} ${a.vista?'vista':'no-vista'}" data-id="${a.id}" data-tipo="${_radarEsc(a.tipo)}"${dest ? ' style="cursor:pointer"' : ''}>
      <div class="dot"></div>
      <div class="body">
        <div class="titulo">${_radarEsc(a.titulo)}</div>
        <div class="mensaje">${_radarEsc(a.mensaje)}</div>
      </div>
      <div class="meta">${fecha}<br><span class="tipo">${_radarEsc(a.tipo)}</span>${dest ? `<br><span class="rdr-ir">Ir a resolver →</span>` : ''}</div>
    </div>`;
  }).join('');
  // Al click: marca vista (si aplica) y LLEVA a donde se resuelve (por tipo).
  list.querySelectorAll('.rdr-alert').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.dataset.id;
      if (item.classList.contains('no-vista')) {
        await khRadar.alertaVista(id).catch(() => {}); // [sec-radar-wl]
        const a = _radarCache.alertas.find(x => x.id === id); if (a) a.vista = true;
        item.classList.remove('no-vista'); item.classList.add('vista');
        refreshAlertasBadge();
      }
      _radarAlertaIr(item.dataset.tipo);   // navega al destino (si el tipo tiene uno)
    });
  });
}
// Mapa tipo de alerta → dónde se RESUELVE. null = informativa sin destino claro
// (solo marca vista). waitlist_hito → el tab de Lista de espera (avisar a la lista);
// tráfico/cotizaciones/códigos → sub-tab "Sitio" del Radar (sus métricas).
function _radarAlertaDestino(tipo) {
  if (tipo === 'waitlist_hito') return { herramienta: 'waitlist' };
  if (['trafico_pico', 'trafico_caida', 'cotizacion_caida', 'codigo_intentos_falla'].includes(tipo)) return { radarSub: 'sitio' };
  return null;
}
function _radarAlertaIr(tipo) {
  const dest = _radarAlertaDestino(tipo);
  if (!dest) return;
  if (dest.herramienta) { showHerramienta(dest.herramienta); return; }
  if (dest.radarSub) _radarGoSub(dest.radarSub);
}
// Cambia de sub-tab del Radar reutilizando el handler del botón (setea _radarSub,
// alterna secciones y dispara el loader de esa vista).
function _radarGoSub(sub) {
  const btn = document.querySelector('#radar-subs button[data-sub="' + sub + '"]');
  if (btn) btn.click();
}
async function refreshAlertasBadge(){
  try {
    const rows = await khRadar.alertasNoVistas(); // [sec-radar-wl]
    const badge = document.getElementById('radar-alertas-badge');
    if (!badge) return;
    if (rows.length > 0) { badge.style.display = 'inline-flex'; badge.textContent = rows.length; }
    else badge.style.display = 'none';
  } catch (e) {}
}
async function markAllAlertsRead(){
  if (!confirm('¿Marcar TODAS las alertas como leídas?')) return;
  try {
    await khRadar.alertasVistaTodas(); // [sec-radar-wl]
    (_radarCache.alertas || []).forEach(a => a.vista = true);
    renderAlertasFiltered('all');
    refreshAlertasBadge();
  } catch (e) { alert('Error: ' + e.message); }
}
// [RAD-1a] Comparativas ya usaba meses y años de CALENDARIO —bien— pero los
// construía con `new Date(y, mes, 1)`, que es medianoche EN LA MÁQUINA de quien
// mira. Desde Reynosa y desde un teléfono en otro huso salían dos «1 de agosto»
// distintos. Ahora las fechas se piden al calendario de la casa.
//
// 🔒 Y AQUÍ VIVE LA REGLA DE LAS VENTANAS DEL MISMO LARGO, que es de lo que
// depende que Giru (RAD-1e) no mienta: al comparar un periodo EN CURSO contra
// el anterior, el anterior se recorta al MISMO número de días. Medido el
// 27-ago (jueves): comparando 4 días contra 7, «el que más subió» salía −9%;
// con tramos iguales, el mismo evento con el mismo dato sale +26%.
function _rcmRangosPara(modo, opts){
  // Devuelve { actSince, actUntil, prevSince, prevUntil, leyenda }
  const p = _radCalPartes(Date.now());
  const hoy = _radCalHoy();
  const finHoy = _radCalMasDias(hoy, 1);   // el periodo en curso incluye HOY entero
  if (modo === 'week') {
    const v = _radCalVentana('rolling7');
    return { actSince: v.since, actUntil: null, prevSince: v.prevSince, prevUntil: v.prevUntil,
             leyenda: 'Últimos 7 días vs los 7 anteriores' };
  }
  if (modo === 'year') {
    const actSince  = _radCalMedianoche(p.y, 1, 1);
    const prevSince = _radCalMedianoche(p.y - 1, 1, 1);
    // MISMO LARGO: el año pasado se corta el mismo día y mes, no el 31-dic.
    const prevUntil = _radCalMedianoche(p.y - 1, p.m, p.d);
    return { actSince, actUntil: null, prevSince, prevUntil,
             leyenda: `${p.y} (a la fecha) vs ${p.y - 1} (mismo periodo)` };
  }
  if (modo === 'month_yoy') {
    const mes = (opts && opts.mesIdx != null) ? opts.mesIdx + 1 : p.m;
    const sig = mes === 12 ? { y: 1, m: 1 } : { y: 0, m: mes + 1 };
    const actSince  = _radCalMedianoche(p.y, mes, 1);
    const actUntil  = _radCalMedianoche(p.y + sig.y, sig.m, 1);
    const prevSince = _radCalMedianoche(p.y - 1, mes, 1);
    let   prevUntil = _radCalMedianoche(p.y - 1 + sig.y, sig.m, 1);
    // [RAD-1a-FIX] El MES EN CURSO también arrastraba el sesgo: agosto de este
    // año va hasta HOY, y el de el año pasado iba COMPLETO. Un mes pasado se
    // compara entero contra entero —eso está bien— pero el actual se recorta.
    const enCurso = (mes === p.m && actUntil.getTime() > Date.now());
    if (enCurso) prevUntil = new Date(prevSince.getTime() + (Date.now() - actSince.getTime()));
    return { actSince, actUntil: enCurso ? null : actUntil, prevSince, prevUntil,
             leyenda: `${_RCM_MESES[mes - 1]} ${p.y} vs ${_RCM_MESES[mes - 1]} ${p.y - 1}` +
                      (enCurso ? ' (mismo tramo)' : '') };
  }
  const v = _radCalVentana('rolling30');
  return { actSince: v.since, actUntil: null, prevSince: v.prevSince, prevUntil: v.prevUntil,
           leyenda: 'Últimos 30 días vs los 30 anteriores' };
}
async function loadRadarComparativas(){
  const modo = document.getElementById('rcm-modo')?.value || 'month';
  const mesIdx = parseInt(document.getElementById('rcm-mes-yoy')?.value, 10);
  // Mostrar/ocultar el dropdown de mes según el modo
  const mesSel = document.getElementById('rcm-mes-yoy');
  if (mesSel) mesSel.style.display = (modo === 'month_yoy') ? '' : 'none';

  const r = _rcmRangosPara(modo, { mesIdx: Number.isFinite(mesIdx) ? mesIdx : (new Date()).getMonth() });
  const ley = document.getElementById('rcm-leyenda');
  if (ley) ley.textContent = r.leyenda;

  // Comparativas usa ventanas propias (no los 5 rangos fijos), así que llama al
  // helper radar_main_metrics con fechas explícitas — sin pasar por _radarRpcCache.
  // OJO: usa los campos _n (COUNT de filas), NO los DISTINCT, para igualar el histórico.
  const [act, prev] = await Promise.all([ // [sec-radar-wl] antes db.rpc anon → admin-radar service_role
    khRadar.mainMetrics(r.actSince.toISOString(),  r.actUntil  ? r.actUntil.toISOString()  : null),
    khRadar.mainMetrics(r.prevSince.toISOString(), r.prevUntil ? r.prevUntil.toISOString() : null)
  ]);
  const num = v => Number(v) || 0;
  const items = [
    { lbl:'Visitas',         a:num(act.visitas),        p:num(prev.visitas) },
    { lbl:'Cotizaciones',    a:num(act.cotizaciones_n), p:num(prev.cotizaciones_n) },
    { lbl:'Modal pago',      a:num(act.modal_n),        p:num(prev.modal_n) },
    { lbl:'Comprobante',     a:num(act.comprobante_n),  p:num(prev.comprobante_n) },
    { lbl:'Códigos válidos', a:num(act.codigos_ok_n),   p:num(prev.codigos_ok_n) },
  ];
  const wrap = document.getElementById('rcm-kpis');
  wrap.innerHTML = items.map((it, i) => {
    const dir = it.a > it.p ? 'up' : it.a < it.p ? 'down' : 'flat';
    const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
    const delta = it.p === 0 ? (it.a === 0 ? '0%' : '+∞') :
                  ((it.a - it.p) / it.p * 100).toFixed(0) + '%';
    return `<div class="rdr-cmp-row" style="animation-delay:${(0.05*i).toFixed(2)}s">
      <div class="rdr-cmp-side">
        <span class="lbl">${it.lbl} · Actual</span>
        <span class="val">${it.a.toLocaleString('es-MX')}</span>
      </div>
      <div class="rdr-cmp-arrow ${dir}">${arrow}<br>${delta}</div>
      <div class="rdr-cmp-side right">
        <span class="lbl">Anterior</span>
        <span class="val">${it.p.toLocaleString('es-MX')}</span>
      </div>
    </div>`;
  }).join('');
}
function _radarEsc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function exportRadarCSV(tipo){
  const since = _radarSinceISO();
  const table = tipo === 'main' ? 'main_eventos_uso' : 'pagos_eventos_uso';
  const rows = await _radarFetch(table, since);
  if (!rows || rows.length === 0) { alert('Sin datos en el rango'); return; }
  const cols = Object.keys(rows[0]);
  const esc = v => v == null ? '' : '"' + String(v).replace(/"/g,'""') + '"';
  const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `radar-${tipo}-${_radarRange}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}