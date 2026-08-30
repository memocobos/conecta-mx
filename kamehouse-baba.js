// =============================================================================
// kamehouse-baba.js — La Casa de Uranai Baba, sacada del tronco (MONO-3)
// =============================================================================
// 21 funciones y 548 líneas: la pestaña de códigos de promoción y el oráculo.
// 68% de aislamiento — solo toca 10 funciones compartidas.
//
// Mismas reglas que MONO-1 y MONO-2: SOLO funciones, en el MISMO ORDEN, con su
// comentario pegado. Cero código de nivel superior: el estado global se queda
// íntegro en el tronco.
//
// Va ANTES del tronco por la regla del sentido único: una pantalla no necesita
// al tronco al cargar, pero el tronco puede guardar una función de pantalla como
// valor en una constante de nivel superior —así rompió MONO-1—. El arnés exige
// cero errores al CARGAR la página, que es la única autoridad en esto.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

// El cortador de literales, contando llaves y saltando comillas. Un regex no
// sabe dónde termina un objeto con objetos adentro.
// ⏳ Anotado: `_fetchEVFromIndex` y `_evDeclaracionesHotel` traen su propia
// copia de este mismo caminado. Unificarlas es una chiquita aparte — no se
// toca la ruta de contratos en esta tuerca.
function _khCortarLiteral(html, re, abre, cierra) {
  const m = String(html).match(re);
  if (!m) return null;
  const ini = m.index + m[0].length - 1;
  let hondo = 0, enTexto = false, comilla = '', escapa = false;
  for (let i = ini; i < html.length; i++) {
    const ch = html[i];
    if (escapa) { escapa = false; continue; }
    if (enTexto) { if (ch === '\\') { escapa = true; continue; } if (ch === comilla) enTexto = false; continue; }
    if (ch === '"' || ch === "'") { enTexto = true; comilla = ch; continue; }
    if (ch === abre) hondo++;
    else if (ch === cierra) { hondo--; if (!hondo) return html.slice(ini, i + 1); }
  }
  return null;
}
// `datetime-local` → instante. Se calcula el desfase de Reynosa EN ESA FECHA,
// no hoy: un vencimiento de diciembre tecleado en agosto lleva otro offset.
function _babaLocalAInstante(txt) {
  if (!txt) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(txt);
  if (!m) return null;
  const [, Y, M, D, h, mi] = m.map(Number);
  const comoUTC = Date.UTC(Y, M - 1, D, h, mi);
  // Cuánto se corre Reynosa respecto a UTC en ese instante aproximado.
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: BABA_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(comoUTC)).reduce((a, x) => (a[x.type] = x.value, a), {});
  const leidoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? 0 : p.hour), +p.minute);
  return new Date(comoUTC + (comoUTC - leidoUTC)).toISOString();
}
// instante → lo que el `datetime-local` debe mostrar, EN REYNOSA.
function _babaInstanteALocal(iso) {
  if (!iso) return '';
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: BABA_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(iso)).reduce((a, x) => (a[x.type] = x.value, a), {});
  const hh = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hh}:${p.minute}`;
}
function _babaFechaTxt(iso) {
  if (!iso) return 'sin vencimiento';
  return new Date(iso).toLocaleString('es-MX', {
    timeZone: BABA_TZ, day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' (Reynosa)';
}
// El estado de un código, en una sola función: la lista y la ficha preguntan
// aquí, para que no haya dos criterios de «vigente».
function _babaEstado(c) {
  const ahora = Date.now();
  if (c.archivado) return { k: 'murio', t: 'archivado' };
  if (c.starts_at && Date.parse(c.starts_at) > ahora) return { k: 'pronto', t: 'por empezar' };
  if (!c.expires_at) return { k: 'siempre', t: 'sin vencimiento' };
  return Date.parse(c.expires_at) > ahora
    ? { k: 'vive', t: 'vigente' }
    : { k: 'murio', t: 'vencido' };
}
function _babaUnidadDe(c) {
  if (c.segundo_pax) return { k: 'pareja', t: 'pareja' };
  if (c.monto != null) return { k: 'pesos', t: '$' + Number(c.monto).toLocaleString('es-MX') };
  return { k: 'pct', t: Number(c.pct) + '%' };
}
async function babaCargar() {
  const cont = document.getElementById('baba-lista');
  cont.innerHTML = '<div class="loading-state"><div class="spinner"></div>Consultando las esferas…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-promos', {
      method: 'POST', body: JSON.stringify({ accion: 'listar' }),
    });
    const j = await r.json();
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    _babaCodigos = j.codigos || [];
    _babaPintar();
  } catch (e) {
    cont.innerHTML = `<div class="empty-state">No pude leer los códigos: ${_escCtr(e.message)}</div>`;
  }
}
function babaFiltrar(f, btn) {
  _babaFiltro = f;
  document.querySelectorAll('#page-baba .gz-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _babaPintar();
}
function _babaPintar() {
  const cont = document.getElementById('baba-lista');
  const cuenta = { vigentes: 0, pronto: 0, sinfecha: 0, vencidos: 0 };
  for (const c of _babaCodigos) {
    const k = _babaEstado(c).k;
    if (k === 'vive') cuenta.vigentes++;
    else if (k === 'pronto') cuenta.pronto++;
    else if (k === 'siempre') cuenta.sinfecha++;
    else cuenta.vencidos++;
  }
  const rot = (id, txt, n) => { const b = document.getElementById(id); if (b) b.textContent = `${txt} (${n})`; };
  rot('babaf-vigentes', '// vigentes', cuenta.vigentes);
  rot('babaf-pronto', '// por empezar', cuenta.pronto);
  rot('babaf-sinfecha', '// sin vencimiento', cuenta.sinfecha);
  rot('babaf-vencidos', '// vencidos', cuenta.vencidos);
  rot('babaf-todos', '// todos', _babaCodigos.length);

  const mapa = { vigentes: 'vive', pronto: 'pronto', sinfecha: 'siempre', vencidos: 'murio' };
  const visibles = _babaFiltro === 'todos'
    ? _babaCodigos
    : _babaCodigos.filter(c => _babaEstado(c).k === mapa[_babaFiltro]);

  if (!visibles.length) {
    // Una lista vacía es una AFIRMACIÓN: se dice cuántos hay del otro lado,
    // porque si no, no se sabe si no existe o si el filtro lo tapó.
    cont.innerHTML = `<div class="empty-state">` +
      (_babaCodigos.length
        ? `Ningún código en este filtro — hay ${_babaCodigos.length} en total.`
        : `La casa está vacía. Aprieta <b>Traer del catálogo</b> para sembrar los que el sitio ya usa.`) +
      `</div>`;
    return;
  }

  cont.innerHTML = '<div style="display:grid;gap:10px">' + visibles.map(c => {
    const e = _babaEstado(c), u = _babaUnidadDe(c);
    const alcance = c.all_events
      ? 'todos los eventos'
      : (c.only_events || []).join(' · ') || '—';
    const pkg = (c.exclude_pkg || []).length ? `sin ${(c.exclude_pkg || []).join('/')}` : 'todos los paquetes';
    return `<div class="baba-card"><div class="baba-card-in">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
        <span class="baba-codigo">${_escCtr(c.codigo)}</span>
        <span class="baba-unidad ${u.k}">${_escCtr(u.t)}</span>
        <span class="baba-estado ${e.k}">${e.t}</span>
        <span style="flex:1"></span>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" onclick="babaFichaAbrir('${_escCtr(c.codigo)}')">Editar</button>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;color:var(--baba2);border-color:rgba(160,107,255,.35)" onclick="babaLetrero('${_escCtr(c.codigo)}')">Encender letrero</button>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;color:var(--ts)" onclick="babaArchivar('${_escCtr(c.codigo)}',${!c.archivado})">${c.archivado ? 'Revivir' : 'Archivar'}</button>
      </div>
      <div style="font-size:12.5px;color:var(--ts);line-height:1.6">
        ${_escCtr(c.desc_texto || '')}<br>
        <span style="font-size:11.5px">${_escCtr(alcance)} · ${_escCtr(pkg)} · ${_escCtr(_babaFechaTxt(c.expires_at))}</span>
      </div>
    </div></div>`;
  }).join('') + '</div>';
}
async function babaArchivar(codigo, archivar) {
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-promos', {
      method: 'POST', body: JSON.stringify({ accion: 'archivar', codigo, archivado: archivar }),
    });
    const j = await r.json();
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    showToast(archivar ? `${codigo} archivado` : `${codigo} de vuelta`, 'ok');
    babaCargar();
  } catch (e) { showToast(e.message, 'error'); }
}
// ── LA FICHA ───────────────────────────────────────────────────────────────
// Panel EN LÍNEA, no `.modal-overlay`: los cerradores globales de esa clase
// borran campos al vuelo (la mordida de ESF-UX-1) y aquí hay una ficha larga.
function babaFichaAbrir(codigo) {
  const c = codigo ? _babaCodigos.find(x => x.codigo === codigo) : null;
  _babaEditando = c ? c.codigo : null;
  _babaUnidad = c ? _babaUnidadDe(c).k : null;

  // ⚠️ `_contratosEVCache` es un `let` DE NIVEL SUPERIOR: NO vive en `window`.
  // Leerlo como `window._contratosEVCache` daba siempre null y la ficha se
  // llamaba a sí misma para siempre. Tercera vez que muerde en esta casa —
  // la variable, a secas.
  const evs = (typeof _contratosEVCache !== 'undefined' && (_contratosEVCache || []).length)
    ? _contratosEVCache : null;
  const cont = document.getElementById('baba-lista');
  cont.innerHTML = `
   <div class="baba-card" style="margin-bottom:14px"><div class="baba-card-in" style="padding:20px">
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px">
      <div class="baba-codigo" style="font-size:17px">${c ? _escCtr(c.codigo) : 'CÓDIGO NUEVO'}</div>
      <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" onclick="babaCargar()">Cerrar</button>
    </div>

    <div class="form-row">
     <div class="form-group">
      <label>Código</label>
      <input id="baba-codigo" value="${c ? _escCtr(c.codigo) : ''}" ${c ? 'disabled' : ''}
             placeholder="NATA" oninput="this.value=this.value.toUpperCase()" autocomplete="off">
      <div style="font-size:11px;color:var(--ts);margin-top:5px">Mayúsculas, sin espacios. Es la llave: no se puede cambiar después.</div>
     </div>
     <div class="form-group">
      <label>Lo que lee el cliente</label>
      <input id="baba-desc" value="${c ? _escCtr(c.desc_texto || '') : ''}" placeholder="$500 de descuento con código NATA" autocomplete="off">
     </div>
    </div>

    <label style="display:block;margin:16px 0 8px">¿Cómo descuenta?</label>
    <div class="baba-unidades">
     <button type="button" class="baba-uni" id="baba-uni-pesos" onclick="babaUnidad('pesos')">
       <span class="baba-uni-t">💵 Pesos</span>
       <span class="baba-uni-d">Una cantidad fija, por persona. Como NATA: $500.</span></button>
     <button type="button" class="baba-uni" id="baba-uni-pct" onclick="babaUnidad('pct')">
       <span class="baba-uni-t">% Porcentaje</span>
       <span class="baba-uni-d">Sobre el precio de la zona. Como CAIFAN: 5%.</span></button>
     <button type="button" class="baba-uni" id="baba-uni-pareja" onclick="babaUnidad('pareja')">
       <span class="baba-uni-t">👥 Pareja</span>
       <span class="baba-uni-d">El segundo viajero paga un precio fijo. Como TINI: $2,700.</span></button>
    </div>
    <div class="baba-aviso" style="margin-bottom:14px">
     🔒 <b>Una sola forma por código.</b> Elegir una apaga las otras dos — y la base también lo exige.
     Así nació el «500% de descuento»: alguien escribió 500 en el campo del porcentaje queriendo decir $500.
    </div>

    <div id="baba-campo-pesos" style="display:none" class="form-group">
      <label>Pesos de descuento (por persona)</label>
      <input id="baba-monto" type="number" min="1" step="1" value="${c && c.monto != null ? c.monto : ''}" autocomplete="off">
    </div>
    <div id="baba-campo-pct" style="display:none">
     <div class="form-row">
      <div class="form-group"><label>Porcentaje</label>
       <input id="baba-pct" type="number" min="1" max="100" step="1" value="${c && c.pct != null ? c.pct : ''}" autocomplete="off"></div>
      <div class="form-group"><label>Porcentaje para CHEAP <span style="color:var(--ts);font-weight:400">(opcional)</span></label>
       <input id="baba-pctcheap" type="number" min="1" max="100" step="1" value="${c && c.pct_cheap != null ? c.pct_cheap : ''}" autocomplete="off"></div>
     </div>
    </div>
    <div id="baba-campo-pareja" style="display:none">
     <div class="form-row">
      <div class="form-group"><label>El segundo paga, en PLUS</label>
       <input id="baba-sp-plus" type="number" min="0" step="1" value="${c && c.segundo_pax ? (c.segundo_pax.plus ?? '') : ''}" autocomplete="off"></div>
      <div class="form-group"><label>El segundo paga, en CHEAP <span style="color:var(--ts);font-weight:400">(opcional)</span></label>
       <input id="baba-sp-cheap" type="number" min="0" step="1" value="${c && c.segundo_pax && c.segundo_pax.cheap != null ? c.segundo_pax.cheap : ''}" autocomplete="off"></div>
      <div class="form-group"><label>Para grupos de exactamente</label>
       <select id="baba-exact">${[2,3,4,5,6,7,8,9].map(n => `<option value="${n}"${c && c.exact_personas === n ? ' selected' : ''}>${n} personas</option>`).join('')}</select></div>
     </div>
    </div>

    <div class="form-row" style="margin-top:6px">
     <div class="form-group">
      <label>Evento</label>
      <select id="baba-evento" ${c && c.all_events ? 'disabled' : ''}>
        <option value="">— elegir evento —</option>
        ${(evs || []).filter(e => e && e.id).map(e =>
          `<option value="${_escCtr(e.id)}"${c && (c.only_events || []).includes(e.id) ? ' selected' : ''}>${_escCtr(e.a || e.id)}</option>`).join('')}
      </select>
      <div style="font-size:11px;color:var(--ts);margin-top:5px">
        ${evs ? 'Nace vacío a propósito: el evento se elige, no se hereda del orden de la lista.' : '⚠️ No pude leer el catálogo — abre y cierra la pestaña.'}
      </div>
     </div>
     <div class="form-group" style="align-self:end">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="baba-todos" style="width:auto;margin:0" ${c && c.all_events ? 'checked' : ''} onchange="babaTodosEventos()">
        <span>Vale en TODOS los eventos</span></label>
      <div style="font-size:11px;color:var(--ts);margin-top:5px">Elección deliberada, nunca el default. Hoy solo GOL la usa.</div>
     </div>
    </div>

    <div class="form-row">
     <div class="form-group">
      <label>Vence el <span style="color:var(--ts);font-weight:400">— hora de Reynosa</span></label>
      <input id="baba-vence" type="datetime-local" value="${c ? _babaInstanteALocal(c.expires_at) : ''}" ${c && !c.expires_at ? 'disabled' : ''}>
     </div>
     <div class="form-group" style="align-self:end">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="baba-sinvence" style="width:auto;margin:0" ${c && !c.expires_at ? 'checked' : ''} onchange="babaSinVence()">
        <span>Sin vencimiento</span></label>
      <div style="font-size:11px;color:var(--ts);margin-top:5px">Elección legítima: AIT-1 no tiene fecha a propósito.</div>
     </div>
    </div>

    <details style="margin:14px 0 12px">
     <summary style="cursor:pointer;font-family:Rajdhani,sans-serif;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:12.5px;color:var(--baba2)">Avanzado</summary>
     <div style="padding:12px 0 0">
      <div class="form-row">
       <div class="form-group"><label>Paquetes donde NO aplica</label>
        <div style="display:flex;gap:14px;flex-wrap:wrap;padding-top:6px">
        ${['plus','ride','stay','cheap'].map(pk => `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="checkbox" class="baba-pkg" value="${pk}" style="width:auto;margin:0"${c && (c.exclude_pkg || []).includes(pk) ? ' checked' : ''}>${pk.toUpperCase()}</label>`).join('')}
        </div></div>
       <div class="form-group"><label>Empieza el <span style="color:var(--ts);font-weight:400">— opcional, hora de Reynosa</span></label>
        <input id="baba-inicia" type="datetime-local" value="${c ? _babaInstanteALocal(c.starts_at) : ''}"></div>
      </div>
      <div class="form-row">
       <div class="form-group"><label>Tope de usos</label>
        <input id="baba-maxusos" type="number" min="1" step="1" value="${c ? (c.max_usos ?? 9999) : 9999}"></div>
       <div class="form-group" style="align-self:end">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="baba-single" style="width:auto;margin:0" ${c && c.single_use ? 'checked' : ''}>
          <span>Una vez por navegador</span></label></div>
      </div>
      <div class="form-group"><label>Mensaje a medida al aplicarlo <span style="color:var(--ts);font-weight:400">(opcional)</span></label>
       <input id="baba-custom" value="${c ? _escCtr(c.custom_msg || '') : ''}" autocomplete="off"></div>
     </div>
    </details>

    <div id="baba-alert"></div>
    <button class="btn" id="baba-guardar" onclick="babaGuardar()" style="width:100%">${c ? 'Guardar cambios' : 'Crear código'}</button>
   </div></div>`;

  if (_babaUnidad) babaUnidad(_babaUnidad);
  // Y con freno: si tras traer el catálogo sigue vacío, se pinta el aviso y se
  // para. Un reintento sin condición de salida es el bucle de arriba otra vez.
  if (!evs && !_babaReintento) {
    _babaReintento = true;
    _fetchEVFromIndex().then(() => { _babaReintento = false; babaFichaAbrir(codigo); })
                       .catch(() => { _babaReintento = false; });
  }
}
// 🔒 LA ELECCIÓN EXCLUYENTE, hecha visible: encender una APAGA las otras dos y
// LIMPIA sus campos. Si solo se escondieran, un valor viejo viajaría al
// servidor y el CHECK lo rebotaría con un mensaje que nadie entiende.
function babaUnidad(cual) {
  _babaUnidad = cual;
  for (const k of ['pesos', 'pct', 'pareja']) {
    const btn = document.getElementById('baba-uni-' + k);
    const campo = document.getElementById('baba-campo-' + k);
    const on = k === cual;
    if (btn) btn.classList.toggle('on', on);
    if (campo) campo.style.display = on ? '' : 'none';
    if (!on) {
      const ids = { pesos: ['baba-monto'], pct: ['baba-pct', 'baba-pctcheap'], pareja: ['baba-sp-plus', 'baba-sp-cheap'] }[k];
      ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    }
  }
}
function babaTodosEventos() {
  const on = document.getElementById('baba-todos').checked;
  const sel = document.getElementById('baba-evento');
  sel.disabled = on;
  if (on) sel.value = '';
}
function babaSinVence() {
  const on = document.getElementById('baba-sinvence').checked;
  const inp = document.getElementById('baba-vence');
  inp.disabled = on;
  if (on) inp.value = '';
}
async function babaGuardar() {
  const g = id => (document.getElementById(id) || {}).value || '';
  const chk = id => !!(document.getElementById(id) || {}).checked;
  const alert = document.getElementById('baba-alert');
  const btn = document.getElementById('baba-guardar');
  const err = m => { alert.innerHTML = `<div style="color:var(--red);font-size:12px;margin-bottom:8px">${_escCtr(m)}</div>`; };
  alert.innerHTML = '';

  if (!_babaUnidad) return err('Elige cómo descuenta: pesos, porcentaje o pareja.');
  const sp = {};
  if (_babaUnidad === 'pareja') {
    if (g('baba-sp-plus') === '') return err('Di cuánto paga el segundo viajero en PLUS.');
    sp.plus = Number(g('baba-sp-plus'));
    if (g('baba-sp-cheap') !== '') sp.cheap = Number(g('baba-sp-cheap'));
  }
  const cuerpo = {
    accion: _babaEditando ? 'editar' : 'crear',
    codigo: _babaEditando || g('baba-codigo').trim().toUpperCase(),
    desc_texto: g('baba-desc'),
    custom_msg: g('baba-custom') || null,
    monto: _babaUnidad === 'pesos' ? Number(g('baba-monto')) : null,
    pct: _babaUnidad === 'pct' ? Number(g('baba-pct')) : null,
    pct_cheap: _babaUnidad === 'pct' && g('baba-pctcheap') ? Number(g('baba-pctcheap')) : null,
    segundo_pax: _babaUnidad === 'pareja' ? sp : null,
    exact_personas: _babaUnidad === 'pareja' ? Number(g('baba-exact')) : null,
    all_events: chk('baba-todos'),
    only_events: chk('baba-todos') ? [] : (g('baba-evento') ? [g('baba-evento')] : []),
    exclude_pkg: [...document.querySelectorAll('.baba-pkg:checked')].map(x => x.value),
    starts_at: _babaLocalAInstante(g('baba-inicia')),
    expires_at: chk('baba-sinvence') ? null : _babaLocalAInstante(g('baba-vence')),
    max_usos: Number(g('baba-maxusos')) || 9999,
    single_use: chk('baba-single'),
  };
  if (!cuerpo.desc_texto.trim()) return err('Falta el texto que ve el cliente.');
  if (!cuerpo.all_events && !cuerpo.only_events.length) return err('Elige el evento, o marca «todos los eventos».');
  if (!chk('baba-sinvence') && !cuerpo.expires_at) return err('Pon la fecha de vencimiento, o marca «sin vencimiento».');

  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-promos', { method: 'POST', body: JSON.stringify(cuerpo) });
    const j = await r.json();
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    showToast(`${cuerpo.codigo} guardado`, 'ok');
    babaCargar();
  } catch (e) { err(e.message); }
  finally { btn.disabled = false; btn.textContent = _babaEditando ? 'Guardar cambios' : 'Crear código'; }
}
// ── TRAER DEL CATÁLOGO ─────────────────────────────────────────────────────
// Lee el `var PROMOS` del index publicado con `_khCortarLiteral`, EL MISMO
// cortador que usa Esferas (balance de llaves, respetando literales de texto).
// No se llama a `_esfPromosAsegurar` aunque haga justo esto: esa función
// REPINTA la lista de Esferas como efecto colateral, y traer códigos aquí no
// tiene por qué mover otra pantalla. Se comparte el cortador, no el efecto.
async function _babaPromosDelIndex() {
  const r = await fetch('/index.html?p=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('no pude bajar el index (HTTP ' + r.status + ')');
  const txt = _khCortarLiteral(await r.text(), /var\s+PROMOS\s*=\s*\{/, '{', '}');
  if (!txt) throw new Error('no encontré `var PROMOS` en index.html');
  // El literal usa `Date.parse(...)` en varios vencimientos; es global, así que
  // no hace falta stub. Nada más de esa página se evalúa.
  const obj = new Function('return ' + txt + ';')();
  if (!obj || typeof obj !== 'object') throw new Error('PROMOS no es un objeto');
  return obj;
}
// Lee el `var PROMOS` del index PUBLICADO —la misma fuente que Esferas usa para
// su diagnóstico— y siembra los que aquí faltan. No pisa los que ya están: el
// que manda, una vez sembrado, es esta pantalla.
async function babaImportar() {
  const btn = document.getElementById('baba-btn-traer');
  btn.disabled = true; btn.textContent = 'Leyendo el catálogo…';
  try {
    const P = await _babaPromosDelIndex();
    const codigos = Object.entries(P).map(([codigo, v]) => ({
      codigo,
      monto: v.amount ?? null,
      pct: v.pct ?? null,
      pct_cheap: v.pctCheap ?? null,
      desc_texto: v.desc || codigo,
      custom_msg: v.customMsg ?? null,
      hide_amount: v.hideAmount === true,
      only_events: v.onlyEvents || (v.onlyEvent ? [v.onlyEvent] : []),
      all_events: v.allEvents === true,
      only_zones: v.onlyZones || null,
      exclude_zones: v.excludeZones || null,
      exclude_pkg: v.excludePkg || [],
      // 🔒 Los instantes viajan TAL CUAL. El catálogo ya los guarda como epoch,
      // así que no hay huso que reinterpretar — y reinterpretarlo sería moverlos.
      starts_at: v.startTs ? new Date(v.startTs).toISOString() : null,
      expires_at: v.expiresTs ? new Date(v.expiresTs).toISOString() : null,
      max_usos: v.maxUsos ?? 9999,
      single_use: v.singleUse === true,
      segundo_pax: v.segundoPax || null,
      exact_personas: v.exactPersonas ?? null,
    }));
    if (!codigos.length) throw new Error('El catálogo no trae códigos');
    const r = await khAdminFetch('/.netlify/functions/admin-promos', {
      method: 'POST', body: JSON.stringify({ accion: 'importar', codigos }),
    });
    const j = await r.json();
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    // La promesa de una pantalla no es un contrato: se dice lo que ENTRÓ, lo que
    // ya estaba y lo que falló, con su motivo.
    const partes = [`${j.creados.length} nuevos`];
    if (j.saltados.length) partes.push(`${j.saltados.length} ya estaban`);
    if (j.fallidos.length) partes.push(`${j.fallidos.length} FALLARON`);
    showToast(`De ${j.pedidos} del catálogo: ${partes.join(' · ')}`, j.fallidos.length ? 'error' : 'ok');
    if (j.fallidos.length) console.error('[baba] no entraron:', j.fallidos);
    babaCargar();
  } catch (e) {
    showToast('No pude traerlos: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Traer del catálogo';
  }
}
// ── [UB-3] LAS TRES PIEZAS JUNTAS ──────────────────────────────────────────
// Una promoción vive en tres sitios: el CAJERO (`var PROMOS`, que es lo que
// cobra), el LETRERO (`flash_promo` de Esferas → el badge con cronómetro) y el
// BADGE (`promo`/`promoCode`/`promoLabel`). NATA nació con letrero y badge y
// sin cajero: 47 minutos y 6 clientes rechazados.
//
// 🔒 DOS REGLAS DE ESTA FUNCIÓN, y las dos son de la casa:
//   1. LA UNIDAD NO SE RECAPTURA. El payload lo DERIVA EL SERVIDOR desde la
//      fila de `promos_codigos`. Aquí no hay ni un campo que teclear: volver a
//      escribir el monto para el letrero es la puerta de vuelta de la mordida
//      NATA.
//   2. QUIEN ESCRIBE ES `esferas-actualizar`, el mismo endpoint que usa
//      Esferas. Baba no toca `esferas_eventos`: un segundo escritor sobre la
//      misma tabla es la fórmula número doce esperando a divergir.
async function babaLetrero(codigo) {
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-promos', {
      method: 'POST', body: JSON.stringify({ accion: 'letrero_payload', codigo }),
    });
    const j = await r.json();
    if (!r.ok || j.ok === false) {
      // Un «no cabe» NO es un error del sistema: es una respuesta con su razón.
      showToast(j.error || ('HTTP ' + r.status), j.no_cabe ? 'info' : 'error');
      return;
    }
    const fp = j.flashPromo;
    const cifra = fp.pct != null ? fp.pct + '%' : '$' + Number(fp.amount).toLocaleString('es-MX');
    const donde = j.payloads.map(p => p.slug).join(', ');
    const cuando = new Date(fp.expiresTs).toLocaleString('es-MX', {
      timeZone: BABA_TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    if (!confirm(
      `Encender el letrero de ${codigo}\n\n` +
      `· ${cifra} de descuento\n· en: ${donde}\n· hasta el ${cuando} (Reynosa)\n\n` +
      `Se escribe en la ficha de Esferas. El badge y el cronómetro salen al sitio ` +
      `en la próxima publicación de Esferas.`)) return;

    const fallos = [];
    // try/catch POR EVENTO: un lote que revienta por uno pierde los buenos y no
    // dice cuál falló.
    for (const p of j.payloads) {
      try {
        const rr = await khAdminFetch('/.netlify/functions/esferas-actualizar', {
          method: 'POST', body: JSON.stringify(p),
        });
        const jj = await rr.json();
        if (!rr.ok || jj.ok === false) fallos.push(`${p.slug}: ${jj.error || rr.status}`);
      } catch (e) { fallos.push(`${p.slug}: ${e.message}`); }
    }
    if (fallos.length) {
      showToast(`Letrero encendido a medias — falló: ${fallos.join(' · ')}`, 'error');
      console.error('[baba] letrero:', fallos);
    } else {
      showToast(`Letrero de ${codigo} encendido en ${j.payloads.length} evento(s). Publica Esferas para que salga.`, 'ok');
    }
  } catch (e) { showToast('No pude: ' + e.message, 'error'); }
}
async function babaOraculo() {
  const btn = document.getElementById('baba-btn-oraculo');
  const cont = document.getElementById('baba-lista');
  btn.disabled = true; btn.textContent = '🔮 Mirando…';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-promos', {
      method: 'POST', body: JSON.stringify({ accion: 'oraculo' }),
    });
    const j = await r.json();
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    _babaPintarOraculo(j.oraculo);
  } catch (e) {
    cont.innerHTML = `<div class="empty-state">Las esferas no contestaron: ${_escCtr(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '🔮 Consultar a Baba';
  }
}
function _babaPintarOraculo(o) {
  const cont = document.getElementById('baba-lista');
  const lecturas = (o && o.lecturas) || [];
  const hablan = lecturas.filter(l => !l.nublado);
  const nubladas = lecturas.filter(l => l.nublado);

  const tarjeta = (l) => {
    const items = (l.items || []).map((it, i) => {
      const v = BABA_VOZ[l.regla] && BABA_VOZ[l.regla](it);
      if (!v) return '';
      const id = `${l.regla}-${i}`;
      _babaPropuestas[id] = v.pre || null;
      return `<div style="padding:12px 0;border-top:1px solid var(--border)">
        <div style="font-size:14px;line-height:1.6;color:var(--text)">🔮 ${_escCtr(v.dice)}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--ts);margin-top:6px;letter-spacing:.04em">
          ${_escCtr(v.cifras)}</div>
        <div style="margin-top:8px">${
          v.pre ? `<button class="btn btn-ghost" style="padding:4px 12px;font-size:11px;color:var(--baba2);border-color:rgba(160,107,255,.35)" onclick="babaPreparar('${id}')">Preparar el código…</button>`
          : v.revisar ? `<button class="btn btn-ghost" style="padding:4px 12px;font-size:11px" onclick="babaFichaAbrir('${_escCtr(v.revisar)}')">Revisar ${_escCtr(v.revisar)}</button>`
          : v.esperar ? `<button class="btn btn-ghost" style="padding:4px 12px;font-size:11px" onclick="showPage('esferas')">Ver ${_escCtr(v.esperar)} en Esferas</button>`
          : ''
        }</div></div>`;
    }).join('');
    return `<div class="baba-card" style="margin-bottom:12px"><div class="baba-card-in">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
        <span class="baba-codigo" style="font-size:13px">${_escCtr(l.titulo)}</span>
        <span class="baba-estado ${l.nublado ? 'murio' : 'vive'}">${l.nublado ? 'nublado' : (l.items || []).length + ' ' + ((l.items||[]).length === 1 ? 'señal' : 'señales')}</span>
      </div>
      ${l.nublado
        ? `<div style="font-size:13.5px;color:var(--ts);line-height:1.6;margin-top:8px;font-style:italic">🔮 ${_escCtr(l.motivo || 'mis esferas están nubladas')}</div>`
        : items}
      ${l.regla === 'R4' && l.ciegos ? `<div style="font-size:11.5px;color:var(--gold);margin-top:8px">⚠️ Y de otros ${l.ciegos} eventos que se acercan no puedo decir nada: no tienen inventario capturado.</div>` : ''}
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ts);margin-top:10px;opacity:.75">
        fuente: ${_escCtr(l.fuente || '—')}</div>
    </div></div>`;
  };

  cont.innerHTML =
    `<div class="baba-aviso" style="margin-bottom:14px">
      🔮 <b>Baba propone, nunca crea.</b> Cada lectura sale de datos de la casa —sin inventar nada— y
      «Preparar» solo abre la ficha con los campos llenos: el botón de crear sigue siendo tuyo.
      <span style="color:var(--ts)">Leído el ${_escCtr(new Date(o.generado_en).toLocaleString('es-MX',{timeZone:BABA_TZ,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}))} (Reynosa).</span>
     </div>
     ${hablan.map(tarjeta).join('')}
     ${nubladas.length ? `<div style="font-family:Rajdhani,sans-serif;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:12px;color:var(--ts);margin:18px 0 10px">Lo que Baba no puede ver todavía</div>` : ''}
     ${nubladas.map(tarjeta).join('')}
     <button class="btn btn-ghost" style="width:100%;margin-top:10px" onclick="babaCargar()">← Volver a los códigos</button>`;
}
// 🔒 PREPARAR NO CREA. Abre la ficha de UB-1 con los campos puestos y ahí se
// queda: el clic de «Crear código» es de Memo, con todo a la vista y editable.
function babaPreparar(id) {
  const p = _babaPropuestas[id];
  if (!p) return;
  babaFichaAbrir(null);
  setTimeout(() => {
    babaUnidad(p.unidad);
    const set = (el, v) => { const e = document.getElementById(el); if (e && v != null) e.value = v; };
    if (p.unidad === 'pct') set('baba-pct', p.pct);
    if (p.unidad === 'pesos') set('baba-monto', p.monto);
    set('baba-desc', p.desc);
    const sel = document.getElementById('baba-evento');
    if (sel) sel.value = p.evento;
    // El código y la fecha los pone Memo: son las dos decisiones que no se
    // adivinan, y un default ahí sería inventarle un dato.
    const inp = document.getElementById('baba-codigo');
    if (inp) inp.focus();
    const al = document.getElementById('baba-alert');
    if (al) al.innerHTML = `<div class="baba-aviso" style="margin-bottom:10px">🔮 Baba dejó la ficha lista para <b>${_escCtr(p.evento)}</b>. Falta que le pongas <b>código</b> y <b>vencimiento</b> — ésas no las adivina.</div>`;
  }, 120);
}