// =============================================================================
// kamehouse-operacion.js — las cuatro chicas de operación (MONO-16)
// =============================================================================
// Inventario, gastos, ingresos y pagos en UN archivo. Cuatro archivos de una
// pantalla chica cada uno serían ruido: la tuerca las junta.
//
// Ojo con el plan: esta tuerca iba a ser "las TRES pantallas de una función",
// y para cuando le tocó el turno ya no existían. Al vaciarse el tronco, las
// chicas crecieron —inventario 13 funciones, gastos 7, ingresos 7, pagos 3—
// porque lo que compartían con las pantallas ya extraídas se quedó sin el otro
// dueño. El mapa es una foto, no una constante.
//
// Mismas reglas: SOLO funciones, en el MISMO ORDEN, con su comentario pegado, y
// cero código de nivel superior.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

// Cambia la columna/dirección de orden y re-pinta. Texto asc por defecto;
// montos/saldo arrancan desc (lo más grande primero); próximo pago asc (lo más cercano).
function _cobSort(key) {
  if (_cobSortKey === key) {
    _cobSortDir = (_cobSortDir === 'asc') ? 'desc' : 'asc';
  } else {
    _cobSortKey = key;
    _cobSortDir = (key === 'resta') ? 'desc' : 'asc';
  }
  _renderCobranza();
}
function _cobCsvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
// Exporta la lista FILTRADA actual a CSV (mismas columnas que la tabla).
function _cobExportCSV() {
  const rows = _cobFiltrados || [];
  if (!rows.length) { showToast('No hay filas que exportar', 'error'); return; }
  const head = ['Viajero','Telefono','Evento','Fecha','Zona','Paquete','Proximo_monto','Proximo_fecha','Abonado','Resta','Estado','Atrasado'];
  const lines = [head.join(',')];
  rows.forEach(t => {
    const c = t.clientes || {};
    const pago = t.pago || {};
    const prox = pago.proximo;
    const evL = _cobEventoLabel(t);
    lines.push([
      _cobCsvCell(c.nombre_completo || ''),
      _cobCsvCell(c.celular || ''),
      _cobCsvCell(evL.nombre),
      _cobCsvCell(evL.fecha),
      _cobCsvCell(t.zona || ''),
      _cobCsvCell(t.paquete || ''),
      _cobCsvCell(prox ? prox.monto : ''),
      _cobCsvCell(prox ? prox.fecha_esperada : ''),
      _cobCsvCell(pago.abonado || 0),
      _cobCsvCell(pago.restante || 0),
      _cobCsvCell(t.estado || ''),
      _cobCsvCell(_cobEsAtrasado(t) ? 'Si' : 'No'),
    ].join(','));
  });
  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cobranza.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
// Puebla filtro-evento-gastos y gasto-evento desde EV (con multifecha), igual que
// Pagos/Por Evento. Conserva la primera opción de cada select (Todos / General) y
// llena _gastosEVMap para resolver el nombre del evento en la tabla.
async function _poblarSelectsGastos() {
  if (_gastosSelectsPoblado) return;
  const ev = await _fetchEVFromIndex();
  // [FLUJO-UX-4] LOS DOS SELECTORES, CON LA PIEZA DE LA CASA — y con papeles
  // DISTINTOS a propósito: el de la tabla FILTRA (vacío = todos) y el del modal
  // ATRIBUYE (vacío = gasto general, que resta de la utilidad de toda la
  // empresa). Antes decían «Todos» y «General (no ligado a evento)» por dos
  // caminos que armaban las mismas opciones byte a byte.
  const opciones = evSelectorPintar(document.getElementById('filtro-evento-gastos'), ev, { papel: 'filtro' });
  evSelectorPintar(document.getElementById('gasto-evento'), ev, { papel: 'atribucion' });
  opciones.forEach((o) => { _gastosEVMap[o.value] = { nombre: o.nombre, fecha: o.fecha }; });
  _gastosSelectsPoblado = true;
}
// Nombre del evento para la tabla, resuelto desde EV. evento_id vacío = General.
function _gastoEventoLabel(eventoId) {
  if (!eventoId) return 'General';
  const map = _gastosEVMap[eventoId];
  if (!map) return eventoId;
  return map.fecha ? (map.nombre + ' · ' + map.fecha) : map.nombre;
}
async function loadGastos() {
 const tbody = document.getElementById('tabla-gastos');
 if (!tbody) return;
 await _poblarSelectsGastos();
 tbody.innerHTML = '<tr><td colspan="8"><div class="loading-state"><div class="spinner"></div>Cargando…</div></td></tr>';

 const evId = document.getElementById('filtro-evento-gastos').value;
 const cat = document.getElementById('filtro-cat-gastos').value;

 try {
 const r = await khAdminFetch('/.netlify/functions/admin-gastos-list', {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify({ evento_id: evId || undefined, categoria: cat || undefined }),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los gastos');
 // [AUD-1g] El catálogo llega del servidor, de la MISMA fuente que valida el
 // alta. El <select> del modal está vacío en el HTML a propósito.
 _gastoPoblarCategorias(d.categorias);
 _poblarCuentas(d.cuentas);
 const gastos = Array.isArray(d.gastos) ? d.gastos : [];
 _gastosListCache = gastos;   // para que editarGasto pre-llene desde memoria

 document.getElementById('g-total').textContent = _spFmtMxn(d.total || 0);
 document.getElementById('g-mes').textContent = _spFmtMxn(d.total_mes || 0);

 if (!gastos.length) {
 // [FLUJO-UX-5] A la pieza de la casa, con su salida: el botón de capturar
 // vive en el encabezado, lejos de la tabla vacía que te está diciendo que no
 // hay nada. `khVacio` sólo lo pinta si la función existe.
 khVacio(tbody, 'gastos capturados', { colspan: 8, accion: { fn: 'nuevoGasto', texto: '+ Registrar gasto' } });
 return;
 }

 tbody.innerHTML = gastos.map(g => `<tr>
 <td style="font-size:12px">${fmtFecha(g.fecha)}</td>
 <td style="font-weight:600">${_spEscape(g.concepto)}</td>
 <td><span class="badge badge-gray">${_spEscape(g.categoria||'—')}</span></td>
 <td style="font-size:12px;color:var(--ts)">${_spEscape(_gastoEventoLabel(g.evento_id))}</td>
 <td style="color:var(--red);font-weight:600">${_spFmtMxn(g.monto)}</td>
 <td>${g.cuenta ? `<span class="badge badge-gray">${_spEscape(g.cuenta)}</span>` : '<span style="font-size:12px;color:var(--ts)">—</span>'}</td>
 <td style="font-size:12px">${_spEscape(g.metodo_pago||'—')}</td>
 <td style="white-space:nowrap">
 <button class="btn btn-ghost btn-sm" onclick="editarGasto('${g.id}')"><svg class="ic"><use href="#ic-lapiz"/></svg> Editar</button>
 ${_puedeBorrarAdmin() ? `<button class="btn btn-red btn-sm" onclick="eliminarGasto('${g.id}')"></button>` : ''}
 </td>
 </tr>`).join('');
 } catch(e) {
 tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert-error">${_spEscape(e.message)}</div></td></tr>`;
 }
}
function _gastoPoblarCategorias(cats) {
  if (Array.isArray(cats) && cats.length) _gastoCategorias = cats.slice();
  const lista = _gastoCategorias || [];
  const sel = document.getElementById('gasto-categoria');
  if (sel) {
    const antes = sel.value;
    // [DEFAULTS-1] La primera va vacía. Sin ella el navegador elegía sola la
    // primera del catálogo —hoy **Transporte**— y un gasto capturado sin mirar
    // nacía clasificado ahí. No es cosmético: bajo la fórmula UTIL-C la CATEGORÍA
    // decide si el gasto entra en la utilidad (`Boletos` se excluye y se trata
    // como salida de caja), así que un default silencioso puede mover el número
    // más importante del sistema.
    sel.innerHTML = '<option value="">— elige categoría —</option>'
      + lista.map((c) => `<option>${_esfEsc(c)}</option>`).join('');
    // Se conserva lo que hubiera; si no había nada, se queda en la vacía.
    sel.value = (antes && lista.includes(antes)) ? antes : '';
  }
  // El filtro de la tabla conserva su primera opción ("Todas").
  const filtro = document.getElementById('filtro-cat-gastos');
  if (filtro) {
    const antes = filtro.value;
    while (filtro.options.length > 1) filtro.remove(1);
    lista.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; filtro.appendChild(o); });
    if (antes) filtro.value = antes;
  }
}
// [BANCO-SELECT-1] EL POBLADOR DE CUENTAS — hermano de `_gastoPoblarCategorias`
// y por la misma razón. El HTML traía `BBVA` y `Banamex` a mano en los DOS
// modales mientras `_lib/cuentas-dinero` aceptaba CUATRO (`Efectivo` y `Otro`
// además): el catálogo con dos dueños, que es EXACTAMENTE el defecto que ese
// lib nació para matar. Ya había divergido, sólo que del lado callado — no
// rebotaba nada, simplemente no se podían elegir dos de las cuatro.
//
// 🔒 LO QUE **NO** SE UNIFICA, y está escrito en el encabezado del lib: las
// listas de TRES de `admin-saldos` y `admin-reembolsos`. Para ellas la lista
// son las CUBETAS QUE SE PINTAN, no los valores que se aceptan — un gasto con
// cuenta `Otro` sí entra en su `caja_total` (por `otrosTotal`); lo que no tiene
// es cubeta propia. Son dos preguntas distintas sobre la misma columna y
// unificarlas por simetría cambiaría una pantalla de dinero sin medirla.
// 🔒 Tampoco se toca `ev-banco`: ése es OTRO catálogo (`default`/`hey`, los
// BANCOS_VALIDOS del evento) y su etiqueta DICE «BBVA (Default)» — un default
// anunciado, firmado por DEFAULTS-1.
let _cuentasDinero = null;
function _poblarCuentas(cuentas) {
  if (Array.isArray(cuentas) && cuentas.length) _cuentasDinero = cuentas.slice();
  const lista = _cuentasDinero || [];
  if (!lista.length) return;                  // sin catálogo no se toca nada
  ['gasto-cuenta', 'ingreso-cuenta'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const antes = sel.value;
    // [UTIL-C-3] La opción extra de una edición sobrevive al repoblado: es la
    // cuenta que ESE movimiento tiene y que el catálogo ya no representa.
    const extra = sel.querySelector('option[data-extra]');
    // [DEFAULTS-1] La primera va VACÍA. Un selector de dato nace vacío: aquí la
    // cuenta decide de qué caja sale el dinero, que es una atribución, no una
    // forma.
    sel.innerHTML = '<option value="">— elige la cuenta —</option>'
      + lista.map((c) => `<option>${_esfEsc(c)}</option>`).join('');
    if (extra) sel.appendChild(extra);
    sel.value = (antes && (lista.includes(antes) || (extra && extra.value === antes))) ? antes : '';
  });
}

function nuevoGasto() {
 _gastoEditId = null;
 ['gasto-concepto', 'gasto-monto', 'gasto-fecha', 'gasto-notas'].forEach(id => {
   const el = document.getElementById(id); if (el) el.value = '';
 });
 // [FIN-1e-c] La fecha es OBLIGATORIA y llegaba vacía: el primer guardado de
 // cualquiera rebotaba. Default = HOY en hora de Monterrey con el helper de la
 // casa. JAMÁS toISOString: da la fecha de Greenwich, y pasadas las 6 de la
 // tarde de acá ya es mañana allá — en esta casa se trabaja de noche.
 const _gf = document.getElementById('gasto-fecha');
 if (_gf) _gf.value = _mxFechaStr();
 ['gasto-categoria', 'gasto-metodo', 'gasto-cuenta'].forEach(id => {
   const el = document.getElementById(id); if (el) el.selectedIndex = 0;
 // [UTIL-C-3] Un alta nueva no hereda la opción extra ni la marca de "elegida
 // a mano" que pudo dejar una edición anterior: si no se limpian, el siguiente
 // gasto general nace con la cuenta del gasto que se editó hace un minuto.
 const _ctaNueva = document.getElementById('gasto-cuenta');
 if (_ctaNueva) {
  const _ex = _ctaNueva.querySelector('option[data-extra]'); if (_ex) _ex.remove();
  _ctaNueva.dataset.tocado = '';
 }
 });
 // Método por default (Transferencia) con Banco (BBVA) visible.
 _gastoOnMetodoChange();
 const ev = document.getElementById('gasto-evento'); if (ev) ev.value = '';
 _fin1aOnEvento();   // [FIN-1a] sin evento elegido, el bloque de proveedor no existe
 const tit = document.getElementById('gasto-modal-title'); if (tit) tit.textContent = 'Registrar Gasto';
 const btn = document.getElementById('gasto-save-btn');   if (btn) btn.textContent = 'Guardar Gasto';
 openModal('modal-gasto');
}
// Abre el modal en modo EDICIÓN, pre-llenado con el gasto (desde _gastosListCache).
// Guarda el id en _gastoEditId para que guardarGasto haga UPDATE en vez de INSERT.
async function editarGasto(id) {
 await _poblarSelectsGastos();   // garantiza que gasto-evento tenga las opciones
 const g = (_gastosListCache || []).find(x => String(x.id) === String(id));
 if (!g) { alert('No se encontró el gasto a editar'); return; }
 _gastoEditId = id;
 const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = (v == null ? '' : v); };
 set('gasto-concepto', g.concepto);
 set('gasto-monto',    g.monto);
 set('gasto-fecha',    g.fecha);
 set('gasto-categoria', g.categoria);
 // Método: solo los 3 válidos; si la cuenta fue 'Efectivo', el método queda en Efectivo.
 const _metodosGasto = ['Transferencia', 'Depósito', 'Efectivo'];
 let _metodoSel = _metodosGasto.includes(g.metodo_pago) ? g.metodo_pago : 'Transferencia';
 if (g.cuenta === 'Efectivo') _metodoSel = 'Efectivo';
 set('gasto-metodo', _metodoSel);
 // Banco: pre-selecciona la cuenta que el gasto TIENE.
 // [UTIL-C-3] Antes, una cuenta que el selector no podía representar (`Otro`)
 // caía en `selectedIndex = 0` = BBVA, y al guardar el gasto SALÍA DE OTRO
 // BANCO sin que nadie lo pidiera. Ahora se le hace lugar en la lista: la
 // edición no puede cambiar un dato que nadie tocó.
 const _ctaEl = document.getElementById('gasto-cuenta');
 if (_ctaEl) {
 const _prev = _ctaEl.querySelector('option[data-extra]');
 if (_prev) _prev.remove();
 const _c = (typeof g.cuenta === 'string') ? g.cuenta.trim() : '';
 // 🔴 [BANCO-SELECT-1] AQUÍ VIVÍA LA TERCERA COPIA DE LA LISTA, y mordía:
 // `!['BBVA','Banamex'].includes(_c) && _c !== 'Efectivo'` dejaba a `Efectivo`
 // sin opción extra Y sin poder seleccionarse, así que editar un gasto pagado
 // en efectivo lo VACIABA en silencio — el defecto exacto que UTIL-C-3 vino a
 // matar («la edición no puede cambiar un dato que nadie tocó»), reaparecido
 // en el único valor que la lista de dos no podía nombrar. Sin víctimas vivas:
 // el Portal tiene UNA fila y es BBVA. Ahora se le pregunta al catálogo.
 const _lista = _cuentasDinero || [];
 if (_c && !_lista.includes(_c)) {
 const o = document.createElement('option');
 o.value = _c; o.textContent = _c; o.setAttribute('data-extra', '1');
 _ctaEl.appendChild(o);
 }
 _ctaEl.value = _c;
 // Se marca como elegida a mano para que abrir el modal no la vacíe.
 _ctaEl.dataset.tocado = _ctaEl.value ? '1' : '';
 }
 _gastoOnMetodoChange();  // muestra/oculta el Banco según el método elegido
 set('gasto-evento',   g.evento_id || '');
 set('gasto-notas',    g.notas);
 const tit = document.getElementById('gasto-modal-title'); if (tit) tit.textContent = 'Editar Gasto';
 const btn = document.getElementById('gasto-save-btn');   if (btn) btn.textContent = 'Guardar Cambios';
 openModal('modal-gasto');
}
async function eliminarGasto(id) {
 if (!confirm('¿Eliminar este gasto?')) return;
 try {
 const r = await khAdminFetch('/.netlify/functions/admin-gasto-eliminar', {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify({ id }),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || 'No se pudo eliminar el gasto');
 loadGastos();
 } catch(e) { alert(e.message); }
}
// Puebla los selects de evento (filtro + modal) desde EV y el select de cliente
// desde admin-clientes-min; llena los mapas para resolver nombres en la tabla.
async function _poblarSelectsIngresos() {
  if (_ingresosSelectsPoblado) return;

  // ── Eventos desde EV (igual que gastos) ──
  const ev = await _fetchEVFromIndex();
  // [FLUJO-UX-4] Gemelo del de gastos, y con los mismos dos papeles: la tabla
  // FILTRA, el modal ATRIBUYE. El orden sigue siendo el de ORD-1 — ahora
  // porque la pieza lo aplica, no porque este lazo lo repita.
  const opciones = evSelectorPintar(document.getElementById('filtro-evento-ingresos'), ev, { papel: 'filtro' });
  evSelectorPintar(document.getElementById('ingreso-evento'), ev, { papel: 'atribucion' });
  opciones.forEach((o) => { _ingresosEVMap[o.value] = { nombre: o.nombre, fecha: o.fecha }; });

  // ── Clientes desde admin-clientes-min (solo para el select del modal) ──
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-clientes-min', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({}),
    });
    const d = await r.json();
    if (r.ok) {
      const clientes = Array.isArray(d.clientes) ? d.clientes : [];
      const selCli = document.getElementById('ingreso-cliente');
      clientes.forEach(c => {
        _ingresosClientesMap[c.id] = { nombre: c.nombre_completo, celular: c.celular };
        if (selCli) {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = (c.nombre_completo || 'Cliente') + (c.celular ? (' — ' + c.celular) : '');
          selCli.appendChild(opt);
        }
      });
    }
  } catch (e) { /* el select de cliente queda solo con "— (ninguno) —" */ }

  _ingresosSelectsPoblado = true;
}
// Nombre del evento para la tabla, resuelto desde EV. evento_id vacío = sin evento.
function _ingresoEventoLabel(eventoId) {
  if (!eventoId) return '—';
  const map = _ingresosEVMap[eventoId];
  if (!map) return eventoId;
  return map.fecha ? (map.nombre + ' · ' + map.fecha) : map.nombre;
}
// Nombre del cliente para la tabla, resuelto desde la lista de clientes.
function _ingresoClienteLabel(clienteId) {
  if (!clienteId) return '—';
  const c = _ingresosClientesMap[clienteId];
  return c ? c.nombre : '—';
}
async function loadIngresos() {
 const tbody = document.getElementById('tabla-ingresos');
 if (!tbody) return;
 await _poblarSelectsIngresos();
 tbody.innerHTML = '<tr><td colspan="9"><div class="loading-state"><div class="spinner"></div>Cargando…</div></td></tr>';

 const evId = document.getElementById('filtro-evento-ingresos').value;
 const cat = document.getElementById('filtro-cat-ingresos').value;

 try {
 const r = await khAdminFetch('/.netlify/functions/admin-ingresos-list', {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify({ evento_id: evId || undefined, categoria: cat || undefined }),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los ingresos');
 _poblarCuentas(d.cuentas);          // [BANCO-SELECT-1] el catálogo, del servidor
 const ingresos = Array.isArray(d.ingresos) ? d.ingresos : [];
 _ingresosListCache = ingresos;   // para que editarIngreso pre-llene desde memoria

 document.getElementById('i-total').textContent = _spFmtMxn(d.total || 0);
 document.getElementById('i-mes').textContent = _spFmtMxn(d.total_mes || 0);

 if (!ingresos.length) {
 // [FLUJO-UX-5] Gemelo del de gastos.
 khVacio(tbody, 'ingresos capturados', { colspan: 9, accion: { fn: 'nuevoIngreso', texto: '+ Registrar ingreso' } });
 return;
 }

 tbody.innerHTML = ingresos.map(g => `<tr>
 <td style="font-size:12px">${fmtFecha(g.fecha)}</td>
 <td style="font-weight:600">${_spEscape(g.concepto)}</td>
 <td><span class="badge badge-gray">${_spEscape(g.categoria||'—')}</span></td>
 <td style="font-size:12px;color:var(--ts)">${_spEscape(_ingresoClienteLabel(g.cliente_id))}</td>
 <td style="font-size:12px;color:var(--ts)">${_spEscape(_ingresoEventoLabel(g.evento_id))}</td>
 <td style="color:var(--green);font-weight:600">${_spFmtMxn(g.monto)}</td>
 <td>${g.cuenta ? `<span class="badge badge-gray">${_spEscape(g.cuenta)}</span>` : '<span style="font-size:12px;color:var(--ts)">—</span>'}</td>
 <td style="font-size:12px">${_spEscape(g.metodo_pago||'—')}</td>
 <td style="white-space:nowrap">
 <button class="btn btn-ghost btn-sm" onclick="editarIngreso('${g.id}')"><svg class="ic"><use href="#ic-lapiz"/></svg> Editar</button>
 ${_puedeBorrarAdmin() ? `<button class="btn btn-red btn-sm" onclick="eliminarIngreso('${g.id}')"></button>` : ''}
 </td>
 </tr>`).join('');
 } catch(e) {
 tbody.innerHTML = `<tr><td colspan="9"><div class="alert alert-error">${_spEscape(e.message)}</div></td></tr>`;
 }
}
// Abre el modal en modo CREAR: limpia el id de edición, vacía el form y restablece
// los textos del modal. Lo dispara el botón "+ Registrar Ingreso".
// [ET4] La captura rápida de ingresos. Tres cambios, y los tres son de dinero:
//
//  1. ABRE AL INSTANTE. Antes la última línea era
//     `_poblarSelectsIngresos().then(() => openModal(...))`: el modal esperaba a
//     que bajaran el catálogo (index.html entero) y la lista de clientes.
//     Medido con red lenta y picando el botón en cuanto aparece —que es como se
//     captura cuando hay prisa— tardaba 740 ms en verse. Ahora se pinta PRIMERO
//     y los catálogos llegan detrás, igual que el modal de gasto.
//  2. FECHA = HOY en hora de México, con `_mxFechaStr()`. JAMÁS `toISOString`:
//     da la de Greenwich y en esta casa se trabaja de noche. Queda editable.
//  3. EVENTO y CUENTA SIN DEFAULT. Un default silencioso mete el dinero en el
//     evento —o en el banco— equivocado sin que nadie lo note. Se eligen a mano.
function nuevoIngreso() {
 _ingresoEditId = null;
 ['ingreso-concepto', 'ingreso-monto', 'ingreso-notas'].forEach(id => {
   const el = document.getElementById(id); if (el) el.value = '';
 });
 const _if = document.getElementById('ingreso-fecha');
 if (_if) _if.value = _mxFechaStr();
 ['ingreso-categoria', 'ingreso-metodo'].forEach(id => {
   const el = document.getElementById(id); if (el) el.selectedIndex = 0;
 });
 // Método por default (Transferencia) con el Banco visible… pero SIN banco
 // elegido: la cuenta se escoge a mano (su primera opción es el marcador vacío).
 const cta = document.getElementById('ingreso-cuenta'); if (cta) cta.value = '';
 _ingresoOnMetodoChange();
 const ev = document.getElementById('ingreso-evento'); if (ev) ev.value = '';
 const cli = document.getElementById('ingreso-cliente'); if (cli) cli.value = '';
 const nw = document.getElementById('ingreso-notas-wrap'); if (nw) nw.open = false;
 const tit = document.getElementById('ingreso-modal-title'); if (tit) tit.textContent = 'Registrar Ingreso';
 const btn = document.getElementById('ingreso-save-btn');   if (btn) btn.textContent = 'Guardar Ingreso';
 openModal('modal-ingreso');
 // Los catálogos, DETRÁS del pintado. Si ya estaban poblados no cuesta nada; si
 // no, las opciones aparecen solas en un parpadeo y el capturador ya está
 // escribiendo el concepto. Fails-soft: un tropiezo aquí no cierra el modal.
 _poblarSelectsIngresos().catch(() => {});
}
// Abre el modal en modo EDICIÓN, pre-llenado con el ingreso (desde _ingresosListCache).
// Guarda el id en _ingresoEditId para que guardarIngreso haga UPDATE en vez de INSERT.
async function editarIngreso(id) {
 await _poblarSelectsIngresos();   // garantiza que evento/cliente tengan opciones
 const g = (_ingresosListCache || []).find(x => String(x.id) === String(id));
 if (!g) { alert('No se encontró el ingreso a editar'); return; }
 _ingresoEditId = id;
 const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = (v == null ? '' : v); };
 set('ingreso-concepto', g.concepto);
 set('ingreso-monto',    g.monto);
 set('ingreso-fecha',    g.fecha);
 set('ingreso-categoria', g.categoria);
 // Método: solo los 3 válidos; si la cuenta fue 'Efectivo', el método queda en Efectivo.
 const _metodosIngreso = ['Transferencia', 'Depósito', 'Efectivo'];
 let _metodoSel = _metodosIngreso.includes(g.metodo_pago) ? g.metodo_pago : 'Transferencia';
 if (g.cuenta === 'Efectivo') _metodoSel = 'Efectivo';
 set('ingreso-metodo', _metodoSel);
 // [ET4] Banco: pre-selecciona BBVA/Banamex si así se guardó. Si no, cae en el
 // MARCADOR VACÍO — porque desde ET4 la primera opción del select ya no es BBVA
 // sino "— elige la cuenta —". El comentario viejo decía "default (BBVA)" y
 // dejó de ser cierto en el momento en que se agregó el marcador: hoy un
 // ingreso viejo sin cuenta reconocible NO cae a un banco en silencio, se queda
 // sin elegir y el guardado lo exige. (El comentario gemelo de GASTOS sigue
 // diciendo "default (BBVA)" y ahí SÍ es verdad: ese select no tiene marcador.)
 if (g.cuenta === 'BBVA' || g.cuenta === 'Banamex') set('ingreso-cuenta', g.cuenta);
 else document.getElementById('ingreso-cuenta').selectedIndex = 0;
 _ingresoOnMetodoChange();  // muestra/oculta el Banco según el método elegido
 set('ingreso-evento',  g.evento_id || '');
 set('ingreso-cliente', g.cliente_id || '');
 set('ingreso-notas',   g.notas);
 const tit = document.getElementById('ingreso-modal-title'); if (tit) tit.textContent = 'Editar Ingreso';
 const btn = document.getElementById('ingreso-save-btn');   if (btn) btn.textContent = 'Guardar Cambios';
 openModal('modal-ingreso');
}
async function eliminarIngreso(id) {
 if (!confirm('¿Eliminar este ingreso?')) return;
 try {
 const r = await khAdminFetch('/.netlify/functions/admin-ingreso-eliminar', {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify({ id }),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || 'No se pudo eliminar el ingreso');
 loadIngresos();
 } catch(e) { alert(e.message); }
}
// ═══════════════════════════════════════════════════════════════
// INVENTARIO
// ═══════════════════════════════════════════════════════════════
async function loadInventario() {
 const tbody = document.getElementById('tabla-inventario');
 const verCostos = !['mister_popo','coordinador','cc'].includes(currentUser?.rol);
 try {
 const items = await khKits.listar(); // [sec-kits]
 const valorTotal = items.reduce((s, i) => s + (i.cantidad * i.costo_unitario), 0);
 const piezasTotal = items.reduce((s, i) => s + (i.cantidad || 0), 0);
 const invValorEl = document.getElementById('inv-valor');
 const invValorWrap = document.getElementById('inv-valor-wrap');
 if (invValorWrap) invValorWrap.style.display = verCostos ? '' : 'none';
 if (invValorEl) invValorEl.textContent = formatMXN(valorTotal);
 document.getElementById('inv-piezas').textContent = piezasTotal.toLocaleString('es-MX');

 // Ajustar headers de tabla
 const thead = document.querySelector('#tabla-inventario')?.closest('table')?.querySelector('thead tr');
 if (thead) {
   const ths = thead.querySelectorAll('th');
   // th[2]=costo_unitario, th[3]=valor_total
   if (ths[2]) ths[2].style.display = verCostos ? '' : 'none';
   if (ths[3]) ths[3].style.display = verCostos ? '' : 'none';
 }

 if (!items.length) {
 // [FLUJO-UX-5] Sin acción: el alta de bodega no cuelga de esta tabla.
 khVacio(tbody, 'items en la bodega', { colspan: verCostos ? 7 : 5 });
 return;
 }
 const puedeEditarKarin = ['maestro_roshi','bulma','mister_popo','milk'].includes(currentUser?.rol);
 tbody.innerHTML = items.map(i => {
 const valor = i.cantidad * i.costo_unitario;
 const alerta = i.cantidad <= i.stock_minimo;
 return `<tr>
 <td style="font-weight:600"><button type="button" class="kdx-link" onclick="abrirKardex('${_salEsc(i.id)}')" title="Ver el expediente de esta pieza: cada salida, quién se la llevó y si regresó">${_esfEsc(i.pieza)}</button>${i.retornable ? ' <span style="font-size:9px;letter-spacing:.06em;text-transform:uppercase;font-weight:800;padding:1px 6px;border-radius:4px;color:#7cc4ff;background:rgba(124,196,255,.12);border:1px solid rgba(124,196,255,.35)" title="Retornable: en las salidas queda como PRESTADA y la comparación del regreso la exige de vuelta siempre">↻ siempre vuelve</span>' : ''}${alerta ? ' <span style="color:var(--red)"><svg class="ic"><use href="#ic-alerta"/></svg></span>' : ''}</td>
 <td style="color:${alerta ? 'var(--red)' : 'var(--text)'};font-weight:600">${i.cantidad}</td>
 ${verCostos ? `<td>${formatMXN(i.costo_unitario)}</td><td style="font-weight:600">${formatMXN(valor)}</td>` : ''}
 <td style="color:var(--ts)">${i.stock_minimo}</td>
 <td style="font-size:12px;color:var(--ts)">${_esfEsc(i.proveedor||'—')}</td>
 <td>${puedeEditarKarin ? `
 <button class="btn btn-ghost btn-sm" onclick="editarKit('${i.id}')">⎘</button>
 <button class="btn btn-red btn-sm" onclick="eliminarKit('${i.id}')">✕</button>
 ` : '—'}</td>
 </tr>`;
 }).join('');
 } catch(e) {
 tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-error">${e.message}</div></td></tr>`;
 }
 loadTorreSalidas(); // [TORRE v2 F3] bandeja + prestado (fails-soft, solo cuidador/admins)
}
async function editarKit(id) {
  // Limpiar form y abrir modal primero
  document.getElementById('kit-id').value = '';
  document.getElementById('kit-pieza').value = '';
  document.getElementById('kit-cantidad').value = '';
  document.getElementById('kit-costo').value = '';
  document.getElementById('kit-minimo').value = '';
  document.getElementById('kit-proveedor').value = '';
  const retChk = document.getElementById('kit-retornable'); if (retChk) retChk.checked = false;
  openModal('modal-kit');
  try {
    const item = await khKits.obtener(id); // [sec-kits]
    if (!item) { closeModal('modal-kit'); showToast('Kit no encontrado'); return; }
    // Llenar con datos reales
    document.getElementById('kit-id').value = item.id;
    document.getElementById('kit-pieza').value = item.pieza;
    document.getElementById('kit-cantidad').value = item.cantidad;
    document.getElementById('kit-costo').value = item.costo_unitario;
    document.getElementById('kit-minimo').value = item.stock_minimo || 0;
    document.getElementById('kit-proveedor').value = item.proveedor || '';
    const retChk2 = document.getElementById('kit-retornable'); if (retChk2) retChk2.checked = !!item.retornable;
  } catch(e) { closeModal('modal-kit'); showToast(e.message); }
}
async function eliminarKit(id) {
 if (!confirm('¿Eliminar esta pieza del inventario?')) return;
 try { await khKits.eliminar(id); loadInventario(); } // [sec-kits]
 catch(e) { alert(e.message); }
}
function _salResumenDetalle(detalle) {
  return (Array.isArray(detalle) ? detalle : [])
    .map(d => `${Number(d.cantidad) || 0}× ${_salEsc(d.pieza)}${d.retornable ? ' <span style="color:#7cc4ff;font-weight:700">↻</span>' : ''}`)
    .join(' · ');
}
async function loadTorreSalidas() {
  const esCuidador = ['mister_popo', 'maestro_roshi', 'bulma', 'milk'].includes(currentUser?.rol);
  const bc = document.getElementById('torre-bandeja-card'), pc = document.getElementById('torre-prestado-card'), fc = document.getElementById('torre-faltantes-card');
  if (!esCuidador) { if (bc) bc.style.display = 'none'; if (pc) pc.style.display = 'none'; if (fc) fc.style.display = 'none'; return; }
  if (bc) bc.style.display = '';
  if (pc) pc.style.display = '';
  if (fc) fc.style.display = '';
  const bb = document.getElementById('torre-bandeja'), pp = document.getElementById('torre-prestado');
  try {
    const [pendientes, autorizadas, todas] = await Promise.all([
      khSalidas.listar({ estado: 'solicitada' }),
      khSalidas.listar({ estado: 'autorizada' }),
      khSalidas.listar({ limit: 200 }), // [F4b] faltantes viven en autorizadas Y cerradas
    ]);
    _torreBandeja = pendientes;
    const conFaltantes = (todas || []).filter(x => Number(x.faltantes_monto) > 0);
    // Nombres de solicitantes (best-effort: sin nombres, cae al rol).
    let uMap = {};
    try {
      const ids = [...new Set(pendientes.concat(autorizadas).concat(conFaltantes).map(s => s.solicitante_id).filter(Boolean))];
      if (ids.length) (await khUsuarios.listar({ ids })).forEach(u => { uMap[u.id] = u; }); // [sec-usuarios]
    } catch (e) { uMap = {}; }
    const quien = s => { const u = uMap[s.solicitante_id]; return u && u.nombre ? u.nombre : (s.solicitante_rol || '?'); };

    if (bb) {
      bb.innerHTML = !pendientes.length
        ? '<div style="font-size:12px;color:var(--ts);letter-spacing:.08em;text-transform:uppercase;text-align:center;padding:18px">Nada por autorizar</div>'
        : pendientes.map(s => `
          <div style="border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:10px 14px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
              <div style="font-size:13px"><b>${_salEsc(quien(s))}</b> · ${_salEsc(s.evento_id)}</div>
              <div style="font-size:11px;color:var(--ts)">${_salEsc(String(s.creado_en || '').slice(0, 10))}</div>
            </div>
            <div style="font-size:12px;color:var(--ts);margin-top:6px">${_salResumenDetalle(s.detalle)}</div>
            ${s.notas ? `<div style="font-size:11px;color:var(--ts);margin-top:4px">Notas: ${_salEsc(s.notas)}</div>` : ''}
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-primary btn-sm" onclick="darSalidaUI('${_salEsc(s.id)}')">Dar salida</button>
              <button class="btn btn-ghost btn-sm" style="color:#ff6666;border-color:rgba(255,68,68,.3)" onclick="rechazarSalidaUI('${_salEsc(s.id)}')">Rechazar</button>
            </div>
          </div>`).join('');
    }

    if (pp) {
      const filas = [];
      autorizadas.forEach(s => (Array.isArray(s.detalle) ? s.detalle : []).forEach(d => {
        if (d.retornable) filas.push({ pieza: d.pieza, cantidad: d.cantidad, quien: quien(s), evento: s.evento_id, desde: String(s.autorizada_en || '').slice(0, 10) });
      }));
      pp.innerHTML = !filas.length
        ? '<div style="font-size:12px;color:var(--ts);letter-spacing:.08em;text-transform:uppercase;text-align:center;padding:18px">Nada prestado ahorita</div>'
        : `<div class="table-wrap"><table><thead><tr>
            <th>Pieza</th><th>Cant.</th><th>Quién la trae</th><th>Evento</th><th>Desde</th>
          </tr></thead><tbody>${filas.map(f => `<tr>
            <td style="font-weight:600">${_salEsc(f.pieza)}</td>
            <td>${Number(f.cantidad) || 0}</td>
            <td>${_salEsc(f.quien)}</td>
            <td style="font-size:12px;color:var(--ts)">${_salEsc(f.evento)}</td>
            <td style="font-size:12px;color:var(--ts)">${_salEsc(f.desde)}</td>
          </tr>`).join('')}</tbody></table></div>`;
    }

    // [TORRE v2 F4b] Faltantes por cobrar: monto, quién, vence, estado, y el
    // botón "Marcar pagado" SOLO para Memo (descongela al instante).
    const ff = document.getElementById('torre-faltantes');
    if (ff) {
      const hoyMX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
      const esRoshi = currentUser?.rol === 'maestro_roshi';
      ff.innerHTML = !conFaltantes.length
        ? '<div style="font-size:12px;color:var(--ts);letter-spacing:.08em;text-transform:uppercase;text-align:center;padding:18px">Sin faltantes cobrados</div>'
        : conFaltantes.map(x => {
            const pagado = !!x.faltantes_pagado_at;
            const vence = String(x.faltantes_vence || '').slice(0, 10);
            const vencido = !pagado && vence && vence < hoyMX;
            const chip = pagado
              ? '<span style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;padding:2px 7px;border-radius:4px;color:#3ddc84;background:rgba(61,220,132,.14);border:1px solid rgba(61,220,132,.4)">pagado</span>'
              : vencido
                ? '<span style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;padding:2px 7px;border-radius:4px;color:#ff6666;background:rgba(255,68,68,.14);border:1px solid rgba(255,68,68,.4)">vencido — congelado</span>'
                : '<span style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;padding:2px 7px;border-radius:4px;color:#ffb020;background:rgba(255,176,32,.14);border:1px solid rgba(255,176,32,.4)">por cobrar</span>';
            const piezasTxt = (Array.isArray(x.faltantes) ? x.faltantes : []).map(f => `${f.cantidad}× ${_salEsc(f.pieza)}`).join(' · ');
            return `
          <div style="border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:10px 14px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
              <div style="font-size:13px"><b>${_salEsc(quien(x))}</b> · ${_salEsc(x.evento_id)} ${chip}</div>
              <div style="font-family:'Zen Dots',sans-serif;font-size:15px;color:${pagado ? 'var(--green)' : vencido ? 'var(--red)' : 'var(--gold)'}">${formatMXN(Number(x.faltantes_monto) || 0)}</div>
            </div>
            ${piezasTxt ? `<div style="font-size:12px;color:var(--ts);margin-top:6px">${piezasTxt}</div>` : ''}
            <div style="font-size:11px;color:var(--ts);margin-top:4px">${pagado ? 'Pagado el ' + _salEsc(String(x.faltantes_pagado_at).slice(0, 10)) : vence ? 'Vence el ' + _salEsc(vence) : 'El plazo de 15 días arranca con la aprobación final de Memo'}</div>
            ${(!pagado && esRoshi) ? `<div style="margin-top:8px"><button class="btn btn-primary btn-sm" onclick="marcarFaltantesPagadoUI('${_salEsc(x.id)}')">Marcar pagado</button></div>` : ''}
          </div>`;
          }).join('');
    }
  } catch (e) {
    if (bb) bb.innerHTML = `<div class="alert alert-error">${_salEsc(e.message)}</div>`;
    if (pp) pp.innerHTML = '';
  }
}
// ── 🗼 O2: EXPEDIENTE DE LA PIEZA (kardex) ─────────────────────────────────
// Click en el nombre de cualquier pieza de la Torre → modal con su historia
// completa: cada salida, quién se la llevó, para qué evento, si regresó y si
// faltó (y si ya se cobró). Solo lectura. Los importes los pinta el backend
// SOLO a quien ve costos; aquí no se inventa dinero.
function _kdxFecha(iso) {
  const s = String(iso || '').slice(0, 10);
  return s || '—';
}
function _kdxDias(desdeISO) {
  const t = Date.parse(desdeISO || '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}
function _kdxChip(h) {
  if (h.faltante) {
    const txt = h.faltante.pagado ? 'faltó · pagado' : (h.faltante.cobrado ? 'faltó · cobrado' : 'faltó');
    return `<span class="kdx-chip kdx-chip-falto">${txt}</span>`;
  }
  if (h.regreso) return '<span class="kdx-chip kdx-chip-ok">regresó</span>';
  if (h.fuera) {
    const d = _kdxDias(h.salio_en);
    return `<span class="kdx-chip kdx-chip-fuera">anda fuera${d != null ? ` · ${d}d` : ''}</span>`;
  }
  if (h.estado === 'solicitada') return '<span class="kdx-chip kdx-chip-espera">por autorizar</span>';
  return `<span class="kdx-chip kdx-chip-nula">${_salEsc(h.estado)}</span>`;
}
async function abrirKardex(piezaId) {
  const cuerpo = document.getElementById('kardex-cuerpo');
  const titulo = document.getElementById('kardex-titulo');
  if (titulo) titulo.textContent = 'Expediente de la pieza';
  if (cuerpo) cuerpo.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando expediente…</div>';
  openModal('modal-kardex');
  try {
    const j = await khSalidas.kardex(piezaId);
    const p = j.pieza || {};
    const r = j.resumen || { salio: 0, regreso: 0, falto: 0, fuera: 0, veces: 0 };
    const hist = Array.isArray(j.historial) ? j.historial : [];
    if (titulo) titulo.textContent = p.pieza || 'Expediente de la pieza';

    const cabecera = `
      <div class="kdx-head">
        <div class="kdx-nombre">${_salEsc(p.pieza || '—')}
          ${p.retornable ? '<span class="kdx-tag-ret">↻ retornable</span>' : '<span class="kdx-tag-con">consumible</span>'}
          ${p.borrada ? '<span class="kdx-tag-del">ya no está en el inventario</span>' : ''}
        </div>
        ${p.retornable ? `
        <div class="kdx-resumen">
          <div class="kdx-r"><span class="kdx-r-n">${r.salio}</span><span class="kdx-r-l">salió</span></div>
          <div class="kdx-r"><span class="kdx-r-n kdx-ok">${r.regreso}</span><span class="kdx-r-l">regresó</span></div>
          <div class="kdx-r"><span class="kdx-r-n kdx-mal">${r.falto}</span><span class="kdx-r-l">faltó</span></div>
          ${r.fuera ? `<div class="kdx-r"><span class="kdx-r-n kdx-fuera">${r.fuera}</span><span class="kdx-r-l">anda fuera</span></div>` : ''}
        </div>` : ''}
      </div>`;

    if (!hist.length) {
      cuerpo.innerHTML = cabecera + `
        <div class="kdx-vacio">
          <div class="kdx-vacio-t">Esta pieza nunca ha salido de la bodega</div>
          <div class="kdx-vacio-s">Cuando alguien levante una salida que la incluya, aquí va a quedar su historia completa.</div>
        </div>`;
      return;
    }

    cuerpo.innerHTML = cabecera + `
      <div class="kdx-lista">
        ${hist.map(h => `
          <div class="kdx-item">
            <div class="kdx-item-top">
              <div class="kdx-item-ev">${_salEsc(h.evento_id)}</div>
              ${_kdxChip(h)}
            </div>
            <div class="kdx-item-l">
              <b>${Number(h.cantidad) || 0}×</b> · se la llevó <b>${_salEsc(h.responsable)}</b>
            </div>
            <div class="kdx-item-f">
              ${h.salio_en ? `Salió el ${_kdxFecha(h.salio_en)}` : `Solicitada el ${_kdxFecha(h.solicitado_en)}`}${h.cerrada_en ? ` · regresó el ${_kdxFecha(h.cerrada_en)}` : ''}
            </div>
            ${h.faltante ? `<div class="kdx-item-falta">Faltaron ${Number(h.faltante.cantidad) || 0}${h.faltante.importe ? ` · ${formatMXN(h.faltante.importe)}` : ''}${h.faltante.pagado ? ' · ya pagado' : (h.faltante.cobrado ? ' · cobrado, pendiente de pago' : '')}</div>` : ''}
          </div>`).join('')}
      </div>`;
  } catch (e) {
    if (cuerpo) cuerpo.innerHTML = `<div class="alert alert-error">${_salEsc(e.message)}</div>`;
  }
}
async function darSalidaUI(id) {
  const s = _torreBandeja.find(x => x.id === id);
  const detalleTxt = s ? (Array.isArray(s.detalle) ? s.detalle : []).map(d => `${d.cantidad}× ${d.pieza}`).join(', ') : '';
  if (!confirm(`¿Dar salida?${detalleTxt ? '\n\n' + detalleTxt : ''}\n\nEl stock se descuenta en automático y Maestro Roshi recibe el FYI.`)) return;
  try {
    const j = await khSalidas.darSalida(id);
    showToast('Salida autorizada — stock descontado' + (j.correo_solicitante === false ? ' (el correo al solicitante no salió)' : ''), 'success');
    loadInventario(); // stock cambió: refresca tabla + bandeja + prestado
  } catch (e) {
    const extra = (e.data && e.data.sin_stock)
      ? ' — ' + e.data.sin_stock.map(x => `${x.pieza}: ${x.disponible} disp.`).join(', ')
      : '';
    showToast(e.message + extra, 'error'); // los 409 del backend, tal cual
  }
}
async function rechazarSalidaUI(id) {
  const motivo = prompt('Motivo del rechazo (le llega por correo al solicitante):');
  if (motivo === null) return;
  try {
    await khSalidas.rechazar(id, motivo.trim() || null);
    showToast('Salida rechazada', 'success');
    loadTorreSalidas();
  } catch (e) { showToast(e.message, 'error'); }
}
// [TORRE v2 F4b] "Marcar pagado" — SOLO Memo. Sella el pago y DESCONGELA
// (el candado de crear salidas se calcula en vivo, así que basta con esto).
async function marcarFaltantesPagadoUI(id) {
  if (!confirm('¿Marcar estos faltantes como PAGADOS? Se descongela al instante y el cron ya no aplicará strike por este cobro.')) return;
  try {
    await khSalidas.faltantesPagado(id);
    showToast('Faltantes pagados ✓ — descongelado', 'success');
    loadTorreSalidas();
  } catch (e) { showToast(e.message, 'error'); }
}
// ═══════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════
function formatMXN(n) {
 if (n === null || n === undefined || n === '') return '—';
 return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n);
}