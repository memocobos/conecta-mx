// =============================================================================
// kamehouse-diseno.js — el laboratorio de diseño, sacado del tronco (MONO-11)
// =============================================================================
// La pantalla de pruebas visuales de KameHouse.
//
// Mismas reglas de la serie: SOLO funciones, en el MISMO ORDEN, con su
// comentario pegado, y cero código de nivel superior — el estado global se
// queda en el tronco.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

function populateEventoSelects() {
 const selects = [
 // 'filtro-evento-pagos' lo puebla _poblarFiltroEventoPagos() desde EV (Fase 3 cobranza).
 // 'selector-evento' lo puebla _evtPoblarSelector() desde EV (Fase 4 Por Evento).
 // 'filtro-evento-gastos'/'gasto-evento' los puebla _poblarSelectsGastos() desde EV (G1).
 'pago-evento'
 ];
 selects.forEach(id => {
 const el = document.getElementById(id);
 if (!el) return;
 const firstOpt = el.options[0];
 el.innerHTML = '';
 if (firstOpt) el.appendChild(firstOpt.cloneNode(true));
 _eventosCache.forEach(ev => {
 const opt = document.createElement('option');
 opt.value = ev.id;
 opt.textContent = `${ev.artista}${ev.tour ? ' — '+ev.tour : ''} · ${fmtFecha(ev.fecha)}`;
 el.appendChild(opt);
 });
 });
}
function _kmHash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
// Saludo por hora MX: 05:00–11:59 días · 12:00–18:59 tardes · 19:00–04:59 noches.
function _saludoHora() { const h = _mxHoraNum(); return (h >= 19 || h < 5) ? 'Buenas noches' : (h < 12 ? 'Buenos días' : 'Buenas tardes'); }
function _moodDeHoy() { const r = _moodRaw(); return (r && r.fecha === _mxFechaStr() && ['poder', 'foco', 'animo'].includes(r.mood)) ? r.mood : null; }
function _moodGuardar(mood) { try { localStorage.setItem(_moodKey(), JSON.stringify({ fecha: _mxFechaStr(), mood: mood })); } catch (_) {} } // solo local, NUNCA al servidor
// 🎬 Saludo del día "de cine" — TODOS los roles, en el shell (arriba de su panel
// de inicio). Determinista por día+usuario (fija todo el día). Con check-in de
// ánimo, la frase sale del bucket del tono; sin él, del banco completo.
function _renderSaludo() {
  const el = document.getElementById('kh-saludo');
  if (!el || !currentUser) return;
  const banco = (typeof window !== 'undefined' && Array.isArray(window.FRASES_CINE)) ? window.FRASES_CINE : [];
  if (!banco.length) { el.innerHTML = ''; return; }   // fails-soft: sin banco, sin saludo
  const nombre = _esfEsc((String(currentUser.nombre || '').trim().split(/\s+/)[0]) || 'crack');
  const dia = _mxFechaStr();
  const mood = _moodDeHoy();   // 'poder'|'foco'|'animo' o null
  const pool = mood ? banco.filter((x) => x && x.t === mood) : banco;
  const lista = pool.length ? pool : banco;
  const item = lista[_kmHash(dia + '|' + (currentUser.id || '')) % lista.length] || banco[0];
  el.innerHTML = `
    <div class="kh-saludo">
      <svg class="ic kh-saludo-ic"><use href="#ic-resumen"/></svg>
      <div class="kh-saludo-body">
        <div class="kh-saludo-head">${_saludoHora()}, ${_esfEsc(nombre)}</div>
        <div class="kh-saludo-frase">${_esfEsc(item.f || '')}</div>
        <div class="kh-saludo-cred">${_esfEsc(item.c || '')} · <i>${_esfEsc(item.p || '')}</i></div>
      </div>
    </div>`;
}
function _checkinResponder(mood) {
  if (!['poder', 'foco', 'animo'].includes(mood)) mood = 'foco';
  _moodGuardar(mood);
  closeModal('modal-checkin');
  _renderSaludo();   // re-pinta con la frase del bucket elegido
}
function _checkinDismiss() {
  _moodGuardar('dismissed');   // marca el día para no insistir; el saludo usa el banco completo
  closeModal('modal-checkin');
}
function _gastoOnCuentaChange() {
  const cta = document.getElementById('gasto-cuenta');
  if (cta) cta.dataset.tocado = cta.value ? '1' : '';
}
function _montoFueraDeRango(monto) {
  if (!Number.isFinite(monto) || monto <= MONTO_MAX_MXN) return null;
  const f = (n) => '$' + Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  return `${f(monto)} se ve fuera de rango (máximo ${f(MONTO_MAX_MXN)} por partida). `
       + 'Revisa el monto — si de verdad es correcto, captúralo en dos partidas.';
}
// La cajita de verdad. Se pinta con lo que YA se cargó: cero llamadas al elegir.
function _fin1aOnProveedor() {
  const caja = document.getElementById('fin1a-caja');
  const pid = (document.getElementById('gasto-proveedor') || {}).value || '';
  if (!caja) return;
  if (!pid) { caja.style.display = 'none'; caja.innerHTML = ''; return; }
  const info = (_fin1aDeuda.porProv || {})[pid] || null;
  const monto = parseFloat((document.getElementById('gasto-monto') || {}).value);
  const hayMonto = Number.isFinite(monto) && monto > 0;
  caja.style.display = '';

  // Sin dato de deuda NO se inventa un cero: se dice que no se pudo saber.
  if (!info) {
    caja.innerHTML = `<div class="fin1a-l">No pude leer la deuda de este proveedor en el evento.</div>
      <label class="fin1a-chk"><input type="checkbox" id="gasto-abonar" checked> Abonar también a su deuda</label>`;
    return;
  }
  const queda = info.deuda - (hayMonto ? monto : 0);
  caja.innerHTML = `
    <div class="fin1a-l"><b>${_esfEsc(info.nombre)}</b> tiene <b class="fin1a-n">${_kamMoney(info.deuda)}</b> de deuda en este evento.
      ${hayMonto ? `Con este gasto quedaría en <b class="fin1a-n ${queda < 0 ? 'fin1a-neg' : ''}">${_kamMoney(queda)}</b>.` : '<span class="fin1a-op">Escribe el monto para ver cómo queda.</span>'}
      ${queda < 0 ? '<div class="fin1a-aviso">Le estarías pagando más de lo que le debes en este evento.</div>' : ''}
    </div>
    <label class="fin1a-chk"><input type="checkbox" id="gasto-abonar" checked> Abonar también a su deuda</label>`;
}
async function guardarGasto() {
 const concepto = document.getElementById('gasto-concepto').value.trim();
 const monto = parseFloat(document.getElementById('gasto-monto').value);
 const _fdr = _montoFueraDeRango(monto);
 if (_fdr) { showToast(_fdr, 'error'); return; }   // [CAP3-1] espejo del servidor
 const fecha = document.getElementById('gasto-fecha').value;
 const categoria = document.getElementById('gasto-categoria').value;
 const evId = document.getElementById('gasto-evento').value;
 const metodo = document.getElementById('gasto-metodo').value;
 // Cuenta = a dónde entró el dinero: Efectivo → 'Efectivo'; si no, el Banco elegido.
 const banco = document.getElementById('gasto-cuenta').value;
 const cuenta = (metodo === 'Efectivo') ? 'Efectivo' : banco;
 const notas = document.getElementById('gasto-notas').value;
 const alerta = document.getElementById('gasto-alert');

 if (!concepto || !(monto >= 0) || !fecha) {
 alerta.innerHTML = '<div class="alert alert-error">Concepto, monto y fecha son obligatorios</div>';
 return;
 }
 // [UTIL-C-3] Espejo del servidor, palabra por palabra: un gasto sin evento
 // resta de la utilidad de toda la empresa, así que tiene que decir de qué caja
 // salió. El servidor rechaza igual; esto solo evita el viaje.
 // [DEFAULTS-1] La categoría se elige. El servidor la acepta VACÍA a propósito
 // (`_lib/categorias-gasto` dice "la categoría es opcional", decisión de AUD-1g
 // que NO se toca: hay filas viejas sin ella). Esta guarda es del CAPTURISTA y
 // puede ser más estricta que el servidor sin contradecirlo: no se prohíbe que
 // EXISTA un gasto sin categoría, se prohíbe que nazca uno HOY sin que nadie
 // haya elegido.
 if (!categoria) {
  alerta.innerHTML = '<div class="alert alert-error">Elige la categoría: es la que decide si este gasto entra en la utilidad del evento.</div>';
  const _c = document.getElementById('gasto-categoria'); if (_c) { try { _c.focus(); } catch (_) { /* igual se ve el error */ } }
  return;
 }

 if (!evId && !cuenta) {
 alerta.innerHTML = '<div class="alert alert-error">Un gasto sin evento resta de la utilidad de toda la empresa: hay que decir de qué cuenta salió.</div>';
 return;
 }

 const editando = !!_gastoEditId;
 const url = editando ? '/.netlify/functions/admin-gasto-editar' : '/.netlify/functions/admin-gasto-crear';
 const payload = {
 concepto, monto, fecha, categoria, metodo_pago: metodo,
 cuenta: cuenta || undefined,
 evento_id: evId || undefined, notas: notas || undefined
 };
 // [FIN-1a] El proveedor solo viaja si de verdad hay uno elegido: sin él, el
 // cuerpo es byte-idéntico al de siempre y el servidor no toca KH.
 const _f1Prov = (document.getElementById('gasto-proveedor') || {}).value || '';
 if (_f1Prov && !editando) {
   payload.proveedor_id = _f1Prov;
   payload.abonar = !!(document.getElementById('gasto-abonar') || {}).checked;
 }
 if (editando) payload.id = _gastoEditId;

 try {
 const r = await fetch(url, {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify(payload),
 });
 const d = await r.json();
 if (!r.ok) {
   // [UTIL-B-2] El servidor puede decir CUÁL campo falta (el proveedor en un
   // pago de boletos). Si lo dice, se enseña con su detalle en vez del error
   // pelón: "falta algo" no le dice a nadie qué hacer.
   const msg = d.detalle ? `${d.error} ${d.detalle}` : (d.error || (editando ? 'No se pudo actualizar el gasto' : 'No se pudo registrar el gasto'));
   throw new Error(msg);
 }
 // [UTIL-B-3] El aviso de "no aparecerá en Gastos" se retira con la supresión
 // que lo motivaba: el pago de boletos SÍ vuelve a dejar su fila. Lo que se
 // conserva es decir que ADEMÁS abonó, porque eso sigue siendo cierto y es la
 // mitad que no se ve en esta pantalla.
 alerta.innerHTML = `<div class="alert alert-success">${editando ? 'Gasto actualizado' : 'Gasto registrado'}${(!editando && d.abono_id) ? ' · <b>abonado</b> a la deuda del proveedor' : ''}</div>`;
 _gastoEditId = null;
 setTimeout(() => { closeModal('modal-gasto'); loadGastos(); }, 1000);
 } catch(e) {
 alerta.innerHTML = `<div class="alert alert-error">${_spEscape(e.message)}</div>`;
 }
}
async function guardarIngreso() {
 const concepto = document.getElementById('ingreso-concepto').value.trim();
 const monto = parseFloat(document.getElementById('ingreso-monto').value);
 const _fdr = _montoFueraDeRango(monto);
 if (_fdr) { showToast(_fdr, 'error'); return; }   // [CAP3-1] espejo del servidor
 const fecha = document.getElementById('ingreso-fecha').value;
 const categoria = document.getElementById('ingreso-categoria').value;
 const evId = document.getElementById('ingreso-evento').value;
 const clienteId = document.getElementById('ingreso-cliente').value;
 const metodo = document.getElementById('ingreso-metodo').value;
 // Cuenta = a dónde entró el dinero: Efectivo → 'Efectivo'; si no, el Banco elegido.
 const banco = document.getElementById('ingreso-cuenta').value;
 const cuenta = (metodo === 'Efectivo') ? 'Efectivo' : banco;
 const notas = document.getElementById('ingreso-notas').value;
 const alerta = document.getElementById('ingreso-alert');

 if (!concepto || !(monto >= 0) || !fecha) {
 alerta.innerHTML = '<div class="alert alert-error">Concepto, monto y fecha son obligatorios</div>';
 return;
 }
 // [DEFAULTS-1] La categoría se elige. Aquí la guarda del navegador es la
 // ÚNICA que hay: `admin-ingreso-crear` NO valida la categoría contra ningún
 // catálogo —solo la recorta a 60— así que un vacío se guardaría como null sin
 // avisar. Queda dicho en el reporte: el catálogo de ingresos no tiene lib.
 if (!categoria) {
  alerta.innerHTML = '<div class="alert alert-error">Elige la categoría del ingreso.</div>';
  const _c = document.getElementById('ingreso-categoria'); if (_c) { try { _c.focus(); } catch (_) { /* igual se ve el error */ } }
  return;
 }

 // [ET4] La cuenta ya no llega preseleccionada, así que ahora se EXIGE: sin
 // esto, quitar el default habría dejado pasar ingresos sin banco — cambiar un
 // default silencioso por un hueco silencioso no arregla nada.
 if (metodo !== 'Efectivo' && !banco) {
 alerta.innerHTML = '<div class="alert alert-error">Elige la cuenta donde entró el dinero</div>';
 return;
 }

 const editando = !!_ingresoEditId;
 const url = editando ? '/.netlify/functions/admin-ingreso-editar' : '/.netlify/functions/admin-ingreso-crear';
 const payload = {
 concepto, monto, fecha, categoria, metodo_pago: metodo,
 cuenta: cuenta || undefined,
 evento_id: evId || undefined, cliente_id: clienteId || undefined, notas: notas || undefined
 };
 if (editando) payload.id = _ingresoEditId;

 try {
 const r = await fetch(url, {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify(payload),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || (editando ? 'No se pudo actualizar el ingreso' : 'No se pudo registrar el ingreso'));
 alerta.innerHTML = `<div class="alert alert-success">${editando ? 'Ingreso actualizado' : 'Ingreso registrado'}</div>`;
 _ingresoEditId = null;
 setTimeout(() => { closeModal('modal-ingreso'); loadIngresos(); }, 1000);
 } catch(e) {
 alerta.innerHTML = `<div class="alert alert-error">${_spEscape(e.message)}</div>`;
 }
}
async function guardarKit() {
 const id = document.getElementById('kit-id').value;
 const pieza = document.getElementById('kit-pieza').value.trim();
 const cantidad = parseInt(document.getElementById('kit-cantidad').value);
 const costo = parseFloat(document.getElementById('kit-costo').value);
 const minimo = parseInt(document.getElementById('kit-minimo').value) || 0;
 const proveedor= document.getElementById('kit-proveedor').value.trim();
 const retornable = !!document.getElementById('kit-retornable')?.checked;
 const alerta = document.getElementById('kit-alert');

 if (!pieza || isNaN(cantidad) || isNaN(costo)) {
 alerta.innerHTML = '<div class="alert alert-error">Pieza, cantidad y costo son obligatorios</div>';
 return;
 }
 try {
 const body = { pieza, cantidad, costo_unitario: costo, stock_minimo: minimo, proveedor: proveedor || null, retornable };
 if (id) await khKits.actualizar(id, body); // [sec-kits]
 else await khKits.crear(body); // [sec-kits]
 alerta.innerHTML = '<div class="alert alert-success"> Guardado</div>';
 setTimeout(() => { closeModal('modal-kit'); loadInventario(); }, 900);
 } catch(e) {
 alerta.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
 }
}
async function guardarEvento() {
 const id = document.getElementById('evento-id').value;
 const artista = document.getElementById('ev-artista').value.trim();
 const tour = document.getElementById('ev-tour').value.trim();
 const fecha = document.getElementById('ev-fecha').value;
 const fechaFin = document.getElementById('ev-fecha-fin').value;
 const ciudad = document.getElementById('ev-ciudad').value.trim();
 const venue = document.getElementById('ev-venue').value.trim();
 const tipo = document.getElementById('ev-tipo').value;
 const color = document.getElementById('ev-color').value;
 const promotor = document.getElementById('ev-promotor').value.trim();
 const nota = document.getElementById('ev-nota').value.trim();
 const status = document.getElementById('ev-status').value || 'Disponible';
 const banco = document.getElementById('ev-banco').value;
 const cdmx = document.getElementById('ev-cdmx').checked;
 const traslados = document.getElementById('ev-traslados').checked;
 const transporte = document.getElementById('ev-transporte').checked;
 const promo = document.getElementById('ev-promo').checked;
 const rideOnly = document.getElementById('ev-rideonly').checked;
 const cheapOnly = document.getElementById('ev-cheaponly').checked;
 const listOnly = document.getElementById('ev-listonly').checked;
 const sep = parseFloat(document.getElementById('ev-sep').value) || 0;
 const ride = parseFloat(document.getElementById('ev-ride').value) || 0;
 const imagen = document.getElementById('ev-imagen').value.trim();
 const notas = document.getElementById('ev-notas').value.trim();
 const dscCodigo = document.getElementById('ev-dsc-codigo').value.trim();
 const dscPct = parseFloat(document.getElementById('ev-dsc-pct').value) || 0;
 const dscExp = document.getElementById('ev-dsc-exp').value;
 const alerta = document.getElementById('evento-alert');

 if (!artista || !fecha || !ciudad || !venue) {
 alerta.innerHTML = '<div class="alert alert-error">Artista, fecha, ciudad y venue son obligatorios</div>';
 return;
 }

 // Leer listas dinámicas
 const incluye = leerIncluye();
 const zonas_plus = leerZonas('plus');
 const zonas_cheap = leerZonas('cheap');
 const hotel = leerHotel();
 const pagos_cal = leerPagos();
 const flash_promo = dscCodigo ? { code: dscCodigo, pct: dscPct, expiresTs: dscExp ? new Date(dscExp).getTime() : null } : null;

 try {
 const body = {
 artista, nombre: artista,
 tour: tour || null,
 fecha,
 fecha_fin: fechaFin || null,
 ciudad, venue, tipo,
 color: color || 'azul',
 promotor: promotor || null,
 nota_cliente: nota || null,
 status,
 banco,
 cdmx,
 tiene_traslados_internos: traslados,
 tiene_transporte_largo: transporte,
 promo,
 ride_only: rideOnly,
 cheap_only: cheapOnly,
 list_only: listOnly,
 separo: sep,
 ride_precio: ride,
 imagen_url: imagen || null,
 notas: notas || null,
 incluye: JSON.stringify(incluye),
 zonas_plus: JSON.stringify(zonas_plus),
 zonas_cheap: JSON.stringify(zonas_cheap),
 hotel_opciones: JSON.stringify(hotel),
 pagos_calendario: JSON.stringify(pagos_cal),
 flash_promo: flash_promo ? JSON.stringify(flash_promo) : null
 };
 if (id) await khEventos.actualizar(id, body); // [sec-eventos]
 else await khEventos.crear(body); // [sec-eventos]
 alerta.innerHTML = '<div class="alert alert-success">Evento guardado</div>';
 _eventosCache = await khEventos.listar(); // [sec-eventos]
 populateEventoSelects();
 setTimeout(() => { closeModal('modal-evento'); loadCapsule(); }, 900);
 } catch(e) {
 alerta.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
 }
}
function agregarIncluye() { agregarIncluyeItem(''); }
function leerIncluye() {
 return Array.from(document.querySelectorAll('#ev-incluye-lista input'))
 .map(i => i.value.trim()).filter(Boolean);
}
function agregarZona(tipo) { agregarZonaItem(tipo, {}); }
function leerZonas(tipo) {
 return Array.from(document.querySelectorAll(`#ev-zonas-${tipo} > div`)).map(d => {
 const inputs = d.querySelectorAll('input');
 const checks = d.querySelectorAll('input[type=checkbox]');
 const n = inputs[0].value.trim();
 const p = parseFloat(inputs[1].value) || 0;
 if (!n) return null;
 const obj = { n, p };
 if (checks[0].checked) obj.vip = 1;
 if (checks[1].checked) obj.ag = 1;
 return obj;
 }).filter(Boolean);
}
function agregarHotel() { agregarHotelItem({n:'', e:0}); }
function leerHotel() {
 return Array.from(document.querySelectorAll('#ev-hotel-lista > div')).map(d => {
 const inputs = d.querySelectorAll('input');
 const n = inputs[0].value.trim();
 if (!n) return null;
 return { n, e: parseFloat(inputs[1].value) || 0 };
 }).filter(Boolean);
}
function agregarPago() { agregarPagoItem({l:'', d:''}); }
function leerPagos() {
 return Array.from(document.querySelectorAll('#ev-pagos-lista > div')).map(d => {
 const inputs = d.querySelectorAll('input');
 const l = inputs[0].value.trim();
 if (!l) return null;
 return { l, d: inputs[1].value.trim(), s: l.toLowerCase() === 'separo' ? 1 : 0 };
 }).filter(Boolean);
}
function _kamMoney(n) { return '$' + (Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 }); }
// ── Tools bottom-sheet (móvil) ───────────────────────────────────
// Construido al vuelo a partir de los items reales del dropdown, así
// agregar/quitar items en un solo lugar (el HTML del dropdown) se refleja
// automáticamente en el sheet sin duplicar markup.
function openToolsSheet() {
  const sheet = document.getElementById('tools-sheet');
  const list  = document.getElementById('tools-sheet-list');
  if (!sheet || !list) return;
  // Repoblar cada vez por si el rol del usuario filtró visibilidad de items
  const src = document.querySelectorAll('#nav-dropdown-herramientas .nav-dropdown-item');
  list.innerHTML = '';
  src.forEach(srcBtn => {
    if (srcBtn.offsetParent === null && getComputedStyle(srcBtn).display === 'none') return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tools-sheet-item' + (srcBtn.classList.contains('active') ? ' active' : '');
    b.dataset.itemId = srcBtn.id;
    b.innerHTML = `<span>${srcBtn.textContent.trim()}</span><span class="ts-chevron" aria-hidden="true">›</span>`;
    b.addEventListener('click', () => {
      closeToolsSheet();
      // Pequeño delay para que la animación de cierre se vea y el sheet no
      // tape la transición a la nueva página
      setTimeout(() => srcBtn.click(), 80);
    });
    list.appendChild(b);
  });
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';
  cerrarNavMobile(); // por si el wrapper hamburguesa estaba abierto detrás
}
function closeToolsSheet() {
  const sheet = document.getElementById('tools-sheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  document.body.style.overflow = '';
}
function cerrarNavMobile() {
  const wrapper = document.getElementById('nav-items-wrapper');
  const btn = document.getElementById('nav-hamburger-btn');
  if (wrapper) wrapper.classList.remove('open');
  if (btn) btn.classList.remove('open');
}
// ── D2: SIDEBAR (drawer móvil) + BARRA INFERIOR ─────────────
// Abrir/cerrar el sidebar como drawer off-canvas en móvil.
function khAbrirMenu() {
  const sb = document.getElementById('kh-sidebar');
  const sc = document.getElementById('kh-scrim');
  if (sb) sb.classList.add('drawer-open');
  if (sc) sc.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function khCerrarMenu() {
  const sb = document.getElementById('kh-sidebar');
  const sc = document.getElementById('kh-scrim');
  if (sb) sb.classList.remove('drawer-open');
  if (sc) sc.classList.remove('show');
  document.body.style.overflow = '';
}
function _ctrReenvioAtras() { if (_ctrReenvio) { _ctrReenvio.paso = 1; _ctrReenvioPintar(); } }
async function _ctrReenvioSeguir() {
  if (!_ctrReenvio) return;
  // PASO 1 → PASO 2. Aquí NO sale nada: solo se avanza la ceremonia.
  if (_ctrReenvio.paso === 1) { _ctrReenvio.paso = 2; _ctrReenvioPintar(); return; }
  const btn = document.getElementById('ctr-re-seguir');
  const fecha = document.getElementById('ctr-re-fecha').value;
  btn.disabled = true;
  btn.textContent = 'Mandando…';
  try {
    const r = await khAdminFetch('/.netlify/functions/contrato-reenviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: _ctrReenvio.token, fecha_limite: fecha }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'Error al reenviar');
    closeModal('modal-contrato-reenviar');
    _ctrReenvio = null;
    showToast('Correo reenviado con fecha límite', 'success');
  } catch (e) {
    // El error se dice DENTRO del modal, no en un alert que tapa lo que se
    // estaba haciendo: aquí se puede corregir la fecha y reintentar.
    document.getElementById('ctr-re-destino').innerHTML =
      '<span style="color:var(--red)">No se pudo mandar: ' + _escCtr(e.message) + '</span>';
    btn.disabled = false;
    btn.textContent = 'Sí, mandar el correo';
  }
}