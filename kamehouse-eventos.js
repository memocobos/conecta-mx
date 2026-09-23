// =============================================================================
// kamehouse-eventos.js — la pantalla de eventos, sacada del tronco (MONO-12)
// =============================================================================
// El selector de evento y su tablero.
//
// Mismas reglas de la serie: SOLO funciones, en el MISMO ORDEN, con su
// comentario pegado, y cero código de nivel superior.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

// ¿El tour pertenece al evento del filtro? Mismo criterio que la Fase 3.1:
// valor con '#': match exacto (fecha de multifecha); valor base: base o base#idx.
function _cobTourMatchEvento(t, evId) {
  if (!evId) return true;
  if (evId.indexOf('#') >= 0) return t.evento_id === evId;
  return t.evento_id === evId || (typeof t.evento_id === 'string' && t.evento_id.startsWith(evId + '#'));
}
// Pinta el banner de caja total de empresa y el bloque Caja/Proyectado/Falta del
// evento (por BASE del slug), desde el cache. Visibilidad propia (no depende de
// tours.length). Si no hay datos, oculta los bloques nuevos.
function _renderUtilidadEvento(evBase) {
  // [SAL-1] El banner de caja se retiró (decisión de Jane): dos "caja total de
  // la empresa" con dos fuentes se habrían separado en cuanto Saldos viera el
  // dinero migrado. En su lugar queda el letrero que dice a dónde se fue.
  // `_lib/utilidad-evento` NO se toca — de ahí comen las liquidaciones.
  const nota0  = document.getElementById('evt-caja-nota');
  const nota1  = document.getElementById('evt-caja-nota-sal1');
  const cache = _utilG3Cache;
  if (!cache) {
    if (nota0) nota0.style.display = 'none';
    if (nota1) nota1.style.display = 'none';
    return;
  }
  if (nota1) nota1.style.display = '';

  // [AUD-1e] Caja / Proyectado / Falta del EVENTO se retiraron: sus tres
  // fórmulas restaban gastos de los DOS mundos a ingresos de UNO solo, y la
  // cuenta buena está arriba desde FIN-1c. En su lugar queda el letrero que
  // dice a dónde se fue cada una.
  const nota = document.getElementById('evt-caja-nota');
  if (nota) nota.style.display = evBase ? '' : 'none';
}
function _evtAplicarPendiente() {
  if (!_evtPendingSelect) return;
  const sel = document.getElementById('selector-evento');
  if (!sel) return;
  const base = String(_evtPendingSelect);
  _evtPendingSelect = null;
  let match = '';
  for (let i = 0; i < sel.options.length; i++) {
    const v = sel.options[i].value;
    if (v && (v === base || v.split('#')[0] === base)) { match = v; break; }
  }
  if (match) { sel.value = match; sel.dispatchEvent(new Event('change')); }
}
async function _evtPoblarSelector() {
  if (_evtSelectorPoblado) { _evtAplicarPendiente(); return; }
  const sel = document.getElementById('selector-evento');
  if (!sel) return;
  // [FLUJO-UX-2] Señal de vida mientras baja el catálogo. Su contenedor nace
  // oculto —igual que para el error— así que se destapa; si no, el spinner se
  // pinta donde nadie lo ve, que es justo lo que le pasaba a Esferas.
  const _caja = document.getElementById('evt-desglose');
  if (_caja) { _caja.style.display = ''; khCargando(_caja, 'los eventos'); }
  // [FLUJO-UX-1] NO TENÍA CATCH. Si el catálogo no bajaba, la promesa se
  // rechazaba sin dueño y el selector se quedaba con su «Selecciona un
  // evento…» para siempre: indistinguible de un catálogo vacío.
  let ev;
  try {
    ev = await _fetchEVFromIndex();
    // [FLUJO-UX-1b] `_fetchEVFromIndex` NO LANZA: devuelve [] y manda el fallo a
    // la consola. Sin esta pregunta, el `catch` de abajo era INALCANZABLE y una
    // caída se veía igual que un catálogo vacío.
    const fallo = (typeof evCatalogoFallo === 'function') ? evCatalogoFallo() : null;
    if (fallo) throw fallo;
  }
  catch (e) {
    // `evt-desglose` es el contenedor visible más cercano al selector, y nace
    // oculto: se destapa aquí. El id se LEYÓ del marcado — la primera versión
    // usó uno inventado («evt-tabla-wrap») que no existe en ningún lado.
    const caja = document.getElementById('evt-desglose');
    if (caja) caja.style.display = '';
    khErrorCarga(caja, 'la lista de eventos', '_evtPoblarSelector', e);
    return;
  }
  // [FLUJO-UX-4] Con la pieza de la casa, y con papel de MANDO: esta pantalla
  // NO FUNCIONA sin evento y no lo decía — su vacío era «Selecciona un evento…»
  // sin marca de obligatorio. Ahora lo dice con la misma voz que el Palacio, y
  // `required`/`aria-required` lo hacen decible también para un lector de
  // pantalla.
  evSelectorPintar(sel, ev, { papel: 'mando' });
  _evtSelectorPoblado = true;
  _evtAplicarPendiente();
}
// PURO: recibe viajeros KH + sus abonos y devuelve el agregado. Sin DOM ni
// fetch, para que el arnés lo pueda interrogar directo.
function _capfix2Agregado(viajeros, abonos) {
  const porViajero = {};
  (abonos || []).forEach((a) => {
    const k = a && a.viajero_id;
    if (!k) return;
    porViajero[k] = (porViajero[k] || 0) + (Number(a.monto) || 0);
  });
  const out = { filas: 0, conDinero: 0, sinDinero: 0, vendido: 0, cobrado: 0, deben: 0, aFavor: 0 };
  (viajeros || []).forEach((v) => {
    out.filas++;
    // La condición EXACTA de _vj3Saldo: sin total_contrato no hay saldo que sumar.
    if (!v || v.total_contrato == null) { out.sinDinero++; return; }
    const saldo = _vj3Saldo(v, (porViajero[v.id] ? [{ monto: porViajero[v.id] }] : []));
    if (!saldo) { out.sinDinero++; return; }
    out.conDinero++;
    out.vendido += saldo.total;
    out.cobrado += saldo.abonado;
    if (saldo.resta > 0) out.deben += saldo.resta;
    else out.aFavor += -saldo.resta;
  });
  return out;
}
// Carga el mundo KH del evento con las acciones que YA existen. Fails-soft: si
// truena, `_evtKH` queda en null y la pantalla es la de antes de esta tuerca —
// null NO es cero, y por eso no se pinta un total a medias.
async function _capfix2CargarKH(evId) {
  const base = String(evId || '').split('#')[0];
  if (!base) { _evtKH = null; return; }
  try {
    const [viajeros, abonos] = await Promise.all([
      khViajeros.listar(base),                       // [sec-coordi] ya existía
      khViajeros.abonosDeEvento(base).catch(() => []), // [VJ-3] ya existía
    ]);
    const ag = _capfix2Agregado(viajeros || [], abonos || []);
    // Sin una sola fila con dinero no hay nada que decir del mundo migrado —
    // y puede ser porque el rol no lo puede ver, no porque no exista.
    _evtKH = ag.conDinero > 0 ? ag : null;
  } catch (_) { _evtKH = null; }
}
async function loadPorEvento() {
  const evId = document.getElementById('selector-evento').value;
  const tbody = document.getElementById('tabla-viajeros');
  const stats = document.getElementById('evt-stats');
  const desg  = document.getElementById('evt-desglose');
  if (!tbody) return;

  if (!evId) {
    _evtTours = []; _evtFiltrados = [];
    _fin1cBodega = null;                                  // [FIN-1c] del evento anterior
    _fin1cPasado = false;                                 // [MER-1d] y su fecha
    const _f1c = document.getElementById('fin1c-resumen');
    if (_f1c) { _f1c.style.display = 'none'; _f1c.innerHTML = ''; }
    if (stats) stats.style.display = 'none';
    if (desg)  desg.style.display = 'none';
    const cajaNota = document.getElementById('evt-caja-nota');        // [AUD-1e]
    const cajaSal1 = document.getElementById('evt-caja-nota-sal1');   // [SAL-1]
    if (cajaNota) cajaNota.style.display = 'none';
    if (cajaSal1) cajaSal1.style.display = 'none';
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">·</div>Selecciona un evento para ver los viajeros</div></td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="8"><div class="loading-state"><div class="spinner"></div>Cargando…</div></td></tr>';
  try {
    const { activos } = await _cobCargarTodo();
    // Gastos (para _renderPorEvento) + utilidad por evento, en paralelo. Best-effort.
    // [CAP-FIX-2] …y el mundo migrado de KH, que hasta hoy no se miraba.
    // [FIN-1c] …y lo que hace falta para la cuenta completa: la bodega (semáforo
    // + precios del catálogo) y la deuda a proveedores. Las dos con acciones que
    // ya existían y las dos fails-soft.
    const _evBase = String(evId).split('#')[0];
    await Promise.all([
      _cobCargarGastos(), _utilCargar(), _capfix2CargarKH(evId),
      _fin1cCargarBodega(_evBase),
      _fin1aCargarDeuda(_evBase).catch(() => {}),
    ]);
    _evtTours = (activos || []).filter(t => _cobTourMatchEvento(t, evId));
    _renderPorEvento();
  } catch (e) {
    if (stats) stats.style.display = 'none';
    if (desg)  desg.style.display = 'none';
    tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert-error">${_spEscape(e.message)}</div></td></tr>`;
  }
}
// PURO: la bodega en dinero. `sem` = zonas del semáforo, `precios` = {zona: p}
// del index de HOY. Una zona SIN precio no suma y se cuenta aparte: un cero
// diría "no vale nada", que es una afirmación que no tenemos.
// [MER-1] …y en COSTO además de en precio, porque un evento que ya pasó no tiene
// bodega sino MERMA, y la merma se mide por lo que costó. El costo unitario sale
// del MISMO renglón del semáforo (`costo_unit`, que _lib/disponibilidad deriva de
// las compras): ni una consulta nueva ni una segunda idea de cuánto costó.
function _fin1cBodegaCalc(sem, precios) {
  const out = { boletos: 0, valor: 0, sinPrecio: 0, zonasSinPrecio: [], costo: 0, sinCosto: 0, zonasSinCosto: [] };
  (sem || []).forEach((z) => {
    const disp = Number(z && z.disponibles);
    if (!Number.isFinite(disp) || disp <= 0) return;
    const p = Number((precios || {})[String(z.zona).trim()]);
    out.boletos += disp;
    if (Number.isFinite(p) && p > 0) out.valor += disp * p;
    else { out.sinPrecio += disp; out.zonasSinPrecio.push(String(z.zona)); }
    const c = Number(z && z.costo_unit);
    if (Number.isFinite(c) && c > 0) out.costo += disp * c;
    else { out.sinCosto += disp; out.zonasSinCosto.push(String(z.zona)); }
  });
  return out;
}
// Carga la bodega del evento con acciones que YA existen: el semáforo del
// Palacio y el catálogo del index. Fails-soft — sin bodega, el bloque lo dice
// en vez de sumar un cero.
async function _fin1cCargarBodega(evBase) {
  _fin1cPasado = false;
  try {
    const [rs, ev] = await Promise.all([
      khAdminFetch('/.netlify/functions/admin-compras', {
        method: 'POST', body: JSON.stringify({ accion: 'semaforo', evento_id: evBase }),
      }).then((r) => r.json()).catch(() => ({})),
      (typeof _fetchEVFromIndex === 'function' ? _fetchEVFromIndex() : Promise.resolve([])).catch(() => []),
    ]);
    // [MER-1] Del catálogo, con el evento completo (multifecha incluida). Si el
    // evento no está en el catálogo NO se declara pasado: sin fecha no hay merma.
    // [MER-1d] Se resuelve ANTES de mirar el semáforo: la fecha del evento no
    // depende de que el inventario haya cargado.
    const evt = (ev || []).find((e) => e && e.id === evBase);
    _fin1cPasado = _mermaPasado(evt);
    if (!rs || !rs.ok || !Array.isArray(rs.zonas)) { _fin1cBodega = null; return; }
    const precios = {};
    ((evt && evt.zonas) || []).forEach((z) => { if (z && z.n != null) precios[String(z.n).trim()] = Number(z.p); });
    _fin1cBodega = _fin1cBodegaCalc(rs.zonas, precios);
    _fin1cBodega.pasado = _fin1cPasado;
  } catch (_) { _fin1cBodega = null; }
}
function _fin1cPintar(evBase) {
  const cont = document.getElementById('fin1c-resumen');
  if (!cont) return;
  const util = (_utilG3Cache && _utilG3Cache.eventos && _utilG3Cache.eventos[evBase]) || null;
  const kh = _evtKH;
  // Sin ninguno de los dos libros no hay resumen que pintar. Callar es correcto.
  if (!util && !kh) { cont.style.display = 'none'; cont.innerHTML = ''; return; }

  const ventasPortal = Number((util || {}).cobrado || 0);
  const ventasKH = kh ? Number(kh.cobrado || 0) : 0;
  const ventas = ventasPortal + ventasKH;
  const gastos = Number((util || {}).gastos || 0);
  const ganancia = ventas - gastos;

  const bod = _fin1cBodega;
  const deudaProv = _fin1cDeudaProveedores();

  const money = (n) => _spFmtMxn(n);
  const linea = (lbl, val, cls, sub) => `
    <div class="fin1c-l ${cls || ''}">
      <span class="fin1c-lbl">${_esfEsc(lbl)}</span>
      <span class="fin1c-val">${val}</span>
      ${sub ? `<span class="fin1c-sub">${sub}</span>` : ''}
    </div>`;

  // La ganancia negativa se dice con palabras (patrón CAP-FIX-2d): un "−10,781"
  // a secas se lee como pérdida, y con bodega llena no lo es.
  //
  // [MER-1d] …pero cuando el evento YA PASÓ sí lo es. "Falta por recuperar —
  // todavía no recuperas lo invertido" promete un futuro que ya no existe: no
  // queda nada por vender que pueda recuperarlo. Ahí se llama PÉRDIDA, a secas,
  // con el número en positivo (patrón de signos de la casa: el signo se dice con
  // palabras, no con un menos). En un evento por venir no cambia una coma.
  // [UTIL-C-4] ESTE NÚMERO YA NO SE LLAMA GANANCIA. Lo que calcula esta
  // pantalla es `ventas − gastos`: la CAJA (la fórmula A de FIN-1). Bajo la
  // fórmula C la utilidad resta además la INVERSIÓN TOTAL EN BOLETOS, que esta
  // pantalla no tiene y no puede inventar — con calle24 diría "Ganancia
  // $23,600" al lado de la utilidad real de −$28,720, un error de $52,320 en la
  // palabra más importante del sistema.
  //
  // No se le pone un endpoint nuevo: se le pone el NOMBRE CORRECTO. Es caja, se
  // llama caja, y se dice dónde vive la utilidad. Renombrar es más barato que
  // calcular, y aquí además es lo veraz.
  const gLbl = ganancia < 0 ? 'Falta en caja' : 'En caja';
  const gCls = ganancia < 0 ? 'fin1c-neg' : 'fin1c-pos';
  const gSub = 'ventas menos gastos · la UTILIDAD resta además los boletos, y vive en Kamisama';

  cont.style.display = '';
  cont.innerHTML = `
    <div class="fin1c-t">// el evento en una cuenta</div>
    ${linea('Ventas', money(ventas), '', ventasKH
      ? `${money(ventasPortal)} del Portal + ${money(ventasKH)} de migrados`
      : 'cobrado del Portal')}
    ${linea('− Gastos', money(gastos), '', 'boletos, hotel, transporte, kits…')}
    <div class="fin1c-sep"></div>
    ${linea(`= ${gLbl}`, money(Math.abs(ganancia)), gCls, gSub)}
    ${_fin1cBodegaHtml(bod)}
    <div class="fin1c-sep"></div>
    ${linea('Deuda a proveedores', deudaProv == null ? '—' : money(deudaProv), 'fin1c-info',
      deudaProv == null ? 'no se pudo calcular' : 'lo que FALTA por pagar — no entra en la ganancia')}`;
}
// La bodega: lo que ya se pagó y todavía está en forma de boleto.
//
// [MER-1] …salvo que el evento YA HAYA PASADO, y entonces no es bodega: es
// MERMA. Los mismos boletos, otra pregunta. Antes decía «7 boletos por vender ≈
// $40,100 · Si se vende todo: +$29,319» sobre un concierto del día anterior:
// una salida que no existe. Ahora dice lo que sí pasó — cuántos se quedaron y
// cuánto costaron — y la línea de "si se vende todo" DESAPARECE, porque no hay
// nadie a quien vendérselos.
// [UTIL-C-4] Y se le cae el "si se vende todo" también aquí, por la misma razón
// que en el Resumen: sumarle a una caja el precio de lo que queda promete un
// cierre que ni resta lo que falta por gastar ni suma lo que falta por cobrar.
// La respuesta completa está en el panel de escenarios de Kamisama.
function _fin1cBodegaHtml(bod) {
  if (!bod) {
    return `<div class="fin1c-bod fin1c-bod-mudo">No pude leer el inventario, así que no sé cuántos boletos quedan por vender.</div>`;
  }
  if (!bod.boletos) {
    return bod.pasado
      ? `<div class="fin1c-bod">Sin merma: no quedó ni un boleto sin vender.</div>`
      : `<div class="fin1c-bod">Sin boletos por vender: la cuenta de arriba ya es la final.</div>`;
  }
  if (bod.pasado) {
    const conCosto = bod.boletos - bod.sinCosto;
    return `
      <div class="fin1c-bod fin1c-merma">
        <div class="fin1c-bod-l"><b>Merma:</b> <b>${bod.boletos}</b> boleto${bod.boletos === 1 ? '' : 's'} sin vender
          ${conCosto > 0 ? `· <b>${_spFmtMxn(bod.costo)}</b> de costo hundido` : ''}
        </div>
        ${conCosto > 0 ? `<div class="fin1c-bod-tot"><span class="fin1c-est">el evento ya pasó: ese dinero ya se gastó y ya está dentro de los gastos de arriba</span></div>` : ''}
        ${bod.sinCosto ? `<div class="fin1c-aviso">${bod.sinCosto} de ellos NO suman: su zona no tiene costo capturado en las compras (${_esfEsc(bod.zonasSinCosto.join(', '))}).</div>` : ''}
      </div>`;
  }
  const conPrecio = bod.boletos - bod.sinPrecio;
  return `
    <div class="fin1c-bod">
      <div class="fin1c-bod-l"><b>${bod.boletos}</b> boleto${bod.boletos === 1 ? '' : 's'} por vender
        ${conPrecio > 0 ? `≈ <b>${_spFmtMxn(bod.valor)}</b> <span class="fin1c-est">a precio de hoy (estimado)</span>` : ''}
      </div>
      ${bod.sinPrecio ? `<div class="fin1c-aviso">${bod.sinPrecio} de ellos NO suman: su zona no tiene precio en el catálogo (${_esfEsc(bod.zonasSinPrecio.join(', '))}).</div>` : ''}
    </div>`;
}
// La deuda con proveedores, de la caché que FIN-1a ya llena (compras + servicios
// − abonos). null = todavía no se sabe; NO se pinta un cero.
function _fin1cDeudaProveedores() {
  const pp = (_fin1aDeuda || {}).porProv;
  if (!pp) return null;
  return Object.keys(pp).reduce((a, k) => a + (Number(pp[k].deuda) || 0), 0);
}
// [CAP-FIX-2] La franja que dice DE DÓNDE viene cada número. Sin ella, un total
// mezclado es peor que un total incompleto: se lee como si toda la información
// viniera del mismo sitio.
//
// Y el "por cobrar" del mundo migrado es un NETO de obligaciones opuestas
// (lección de VJ-3): en melanie hay quien debe y hay saldos A FAVOR reales. Un
// solo número escondería las dos mitades, así que se imprimen las dos.
function _capfix2Rotular(nPortal, kh) {
  const cont = document.getElementById('evt-origen');
  if (!cont) return;
  if (!kh) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
  const trozo = (lbl, val, cls) => `<span class="evt-org-i"><b class="${cls || ''}">${_esfEsc(val)}</b> ${_esfEsc(lbl)}</span>`;
  cont.style.display = '';
  cont.innerHTML = `
    <span class="evt-org-t">// de dónde sale</span>
    ${trozo('del Portal', String(nPortal))}
    ${trozo('migrados del Excel', String(kh.filas))}
    ${kh.sinDinero ? trozo('migrados SIN contrato capturado (no suman)', String(kh.sinDinero), 'evt-org-ojo') : ''}
    ${kh.deben ? trozo('deben los migrados', _spFmtMxn(kh.deben)) : ''}
    ${kh.aFavor ? trozo('a favor de migrados', _spFmtMxn(kh.aFavor), 'evt-org-fav') : ''}`;
}
// Pinta resumen financiero (sobre TODO el evento), desglose por paquete/zona y la
// tabla (sujeta a los filtros de paquete y saldo). _evtTours = tours del evento.
function _renderPorEvento() {
  const tbody = document.getElementById('tabla-viajeros');
  const stats = document.getElementById('evt-stats');
  const desg  = document.getElementById('evt-desglose');
  if (!tbody) return;
  const tours = _evtTours || [];

  // Resumen financiero del evento (no depende de los filtros de la tabla).
  const vendido   = tours.reduce((a, t) => a + Number((t.pago || {}).total    || 0), 0);
  const cobrado   = tours.reduce((a, t) => a + Number((t.pago || {}).abonado  || 0), 0);
  const porCobrar = tours.reduce((a, t) => a + Number((t.pago || {}).restante || 0), 0);
  const atrasados = tours.filter(_cobEsAtrasado).length;
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  // [CAP-FIX-2] Los dos mundos, sumados y ROTULADOS. Sin migrados con dinero
  // (`_evtKH` en null) todo queda exactamente como estaba: mismos números,
  // mismo markup, ni una etiqueta de más.
  const kh = _evtKH;
  setTxt('evt-vendido',   _spFmtMxn(vendido   + (kh ? kh.vendido : 0)));
  setTxt('evt-cobrado',   _spFmtMxn(cobrado   + (kh ? kh.cobrado : 0)));
  // [CAP-FIX-2d] EL SIGNO, DICHO CON PALABRAS. Un "Por cobrar: $-793" se lee al
  // revés de lo que significa: nadie debe nada, la agencia trae 793 a favor de
  // los viajeros. Mismo número, misma verdad, etiqueta correcta — y vale para
  // los dos mundos, porque el neto es uno solo.
  const neto = porCobrar + (kh ? kh.deben - kh.aFavor : 0);
  setTxt('evt-porcobrar', _spFmtMxn(Math.abs(neto)));
  setTxt('evt-porcobrar-lbl', neto < 0 ? 'A favor' : 'Por cobrar');
  setTxt('evt-viajeros',  String(tours.length + (kh ? kh.filas : 0)));
  setTxt('evt-atrasados', String(atrasados));
  _capfix2Rotular(tours.length, kh);
  // [FIN-1c] La cuenta completa, con el evento ya resuelto.
  _fin1cPintar(String(((document.getElementById('selector-evento') || {}).value) || '').split('#')[0]);

  // Gastos + Utilidad del evento (G2). Match por BASE del evento_id (cuenta aunque el
  // evento sea multifecha). Los "General" (evento_id null) NO se incluyen aquí. Usa la
  // lista ya cacheada por _cobCargarGastos — sin llamada extra por evento.
  const evIdSel = (document.getElementById('selector-evento') || {}).value || '';
  const evBase  = evIdSel.split('#')[0];
  const gastosLista = (_gastosG2Cache && _gastosG2Cache.lista) || [];
  const gastosEvt = evBase
    ? gastosLista.reduce((a, g) => {
        const gBase = String(g.evento_id || '').split('#')[0];
        return (g.evento_id && gBase === evBase) ? a + Number(g.monto || 0) : a;
      }, 0)
    : 0;
  setTxt('evt-gastos', _spFmtMxn(gastosEvt));
  const evtUtil = vendido - gastosEvt;
  setTxt('evt-utilidad', _spFmtMxn(evtUtil));
  const elEvtUtil = document.getElementById('evt-utilidad');
  if (elEvtUtil) elEvtUtil.className = 'cob-stat-val ' + (evtUtil >= 0 ? 'green' : 'red');

  // Capa 3: Caja / Proyectado / Falta del evento + caja total empresa (admin-utilidad-evento).
  // Bloque aditivo, con visibilidad propia (independiente de tours.length).
  _renderUtilidadEvento(evBase);

  // [CAP-FIX-2] Los totales se muestran si hay ALGO que contar — del Portal o
  // del Excel. Atado solo a `tours.length`, un evento solo-KH calculaba bien sus
  // cifras y las dejaba en un bloque `display:none`: existían y no se veían, que
  // para Memo es exactamente lo mismo que no existir.
  // El DESGLOSE por paquete/zona sigue atado al Portal a propósito: se arma de
  // campos que las filas migradas no traen, y pintarlo vacío sería peor.
  const hayQueContar = tours.length || !!_evtKH;
  if (stats) stats.style.display = hayQueContar ? '' : 'none';
  if (desg)  desg.style.display  = tours.length ? '' : 'none';

  // Desglose por paquete (# viajeros + cobrado) y por zona (# viajeros).
  const porPaq = {};
  const porZona = {};
  tours.forEach(t => {
    const paq = t.paquete || '—';
    porPaq[paq] = porPaq[paq] || { n: 0, cobrado: 0 };
    porPaq[paq].n++;
    porPaq[paq].cobrado += Number((t.pago || {}).abonado || 0);
    const z = t.zona || '—';
    porZona[z] = (porZona[z] || 0) + 1;
  });
  const elPaq = document.getElementById('evt-por-paquete');
  if (elPaq) {
    const orden = ['PLUS', 'STAY', 'RIDE', 'CHEAP'];
    const claves = Object.keys(porPaq).sort((a, b) => {
      const ia = orden.indexOf(a), ib = orden.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    elPaq.innerHTML = claves.map(k => {
      const bg = _COB_PAQ_BG[k] || 'rgba(255,255,255,.06)';
      const fg = _COB_PAQ_FG[k] || 'var(--ts)';
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:4px;background:${bg};color:${fg}">${_spEscape(k)}</span>
        <span style="font-size:12px;color:var(--ts)">${porPaq[k].n} viaj. · <span style="color:var(--green)">${_spFmtMxn(porPaq[k].cobrado)}</span></span>
      </div>`;
    }).join('') || '<div style="font-size:12px;color:var(--ts)">—</div>';
  }
  const elZona = document.getElementById('evt-por-zona');
  if (elZona) {
    const claves = Object.keys(porZona).sort((a, b) => porZona[b] - porZona[a]);
    elZona.innerHTML = claves.map(z =>
      `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:12px">${_spEscape(z)}</span>
        <span style="font-size:12px;color:var(--ts)">${porZona[z]} viaj.</span>
      </div>`
    ).join('') || '<div style="font-size:12px;color:var(--ts)">—</div>';
  }

  // Tabla (con filtros de paquete y saldo).
  const paquete = document.getElementById('filtro-paquete').value;
  const saldo   = document.getElementById('filtro-saldo').value;
  let rows = tours.slice();
  if (paquete) rows = rows.filter(t => t.paquete === paquete);
  if (saldo === 'pendiente') rows = rows.filter(t => Number((t.pago || {}).restante || 0) > 0);
  if (saldo === 'liquidado') rows = rows.filter(t => Number((t.pago || {}).restante || 0) <= 0);
  _evtFiltrados = rows;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">·</div>Sin viajeros con esos filtros</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(t => {
    const c = t.clientes || {};
    const pago = t.pago || {};
    const paq = t.paquete || '';
    const atr = _cobEsAtrasado(t);
    const wa = _cobWaHref(t);
    const waCell = wa
      ? `<a class="btn btn-green btn-sm" href="${wa}" target="_blank" rel="noopener" style="font-size:11px;text-decoration:none">WhatsApp</a>`
      : `<span style="font-size:11px;color:var(--ts)">${_spEscape(c.celular || '—')}</span>`;
    const rowCls = atr ? 'cob-atrasado' : (t.estado === 'pagado' ? 'cob-pagado' : '');
    return `<tr class="${rowCls}">
      <td><div style="font-weight:600;font-size:13px">${_spEscape(c.nombre_completo || '—')}</div><div style="font-size:10px;color:var(--ts)">${_spEscape(c.correo || '')}</div></td>
      <td>${paq ? `<span style="font-size:10px;font-weight:700;padding:2px 10px;border-radius:4px;background:${_COB_PAQ_BG[paq]||'rgba(255,255,255,.06)'};color:${_COB_PAQ_FG[paq]||'var(--ts)'}">${_spEscape(paq)}</span>` : '—'}</td>
      <td style="font-size:12px">${_spEscape(t.zona || '—')}</td>
      <td style="font-weight:600">${_spFmtMxn(pago.total)}</td>
      <td style="color:var(--green)">${_spFmtMxn(pago.abonado)}</td>
      <td style="color:${(pago.restante||0) > 0 ? 'var(--orange)' : 'var(--green)'}">${_spFmtMxn(pago.restante)}</td>
      <td style="white-space:nowrap">${_spBadgeEstado(t.estado)}${atr ? '<span class="cob-badge-atraso">Atrasado</span>' : ''}</td>
      <td>${waCell}</td>
    </tr>`;
  }).join('');
}
// Exporta la tabla filtrada del evento reusando _cobExportCSV (mismo shape de tour).
function _evtExportCSV() {
  _cobFiltrados = _evtFiltrados || [];
  _cobExportCSV();
}
// ═══ [EXCEL-BOTÓN-1b] EL CAREO CONTRA EL EXCEL ═══════════════════════════════
// La herramienta que pone parejos al Excel y al sistema para poder apagar el
// Excel. Pinta SIETE montones por nombre: NUEVOS · PAGOS · BAJAS · IGUALES ·
// APARTADOS · AMBIGUOS · TOTALES DE CONTRATO (CUADRE-1a).
//
// SOLO LEE. Ni marca las bajas ni aplica los pagos: aplicar es otra tuerca, y
// tiene que serlo — una baja es una persona.
//
// Todo el protocolo (el encabezado, el separo sin nombre, los pagos 1…10, la
// chatarra, los nombres normalizados) vive en el servidor, en `_lib/excel-careo`,
// donde un arnés puede carearlo contra filas reales. Aquí solo se pinta.
async function excelCarear() {
  const eventoId = (document.getElementById('selector-evento') || {}).value || '';
  const panel = document.getElementById('excel-careo-panel');
  const btn = document.getElementById('excel-careo-btn');
  if (!eventoId) { showToast('Elige primero un evento', 'error'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Comparando…'; }
  if (panel) panel.innerHTML = '<div class="loading-state"><div class="spinner"></div>Leyendo el Excel…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-excel-careo', {
      method: 'POST', body: JSON.stringify({ evento_id: eventoId }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) {
      // El error se pinta ENTERO, con su código: «no hay pestaña mapeada» y «no
      // pude leer la hoja» se arreglan en lugares distintos, y un mensaje
      // genérico manda a buscar en el equivocado.
      panel.innerHTML = `<div class="alert alert-error">${_evtEsc(d.error || ('Error ' + r.status))}`
        + (d.codigo ? ` <span style="opacity:.7">[${_evtEsc(d.codigo)}]</span>` : '')
        + (Array.isArray(d.pestanas) && d.pestanas.length
            ? `<div style="margin-top:8px;font-size:12px">Pestañas que sí hay: ${d.pestanas.slice(0, 40).map(_evtEsc).join(' · ')}</div>` : '')
        + `</div>`;
      return;
    }
    panel.innerHTML = _excelCareoHtml(d);
  } catch (e) {
    panel.innerHTML = `<div class="alert alert-error">${_evtEsc(e.message)}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Comparar con Excel'; }
  }
}
function _evtEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// [CUADRE-2a] EL ESTADO DE LA TERCERA FUENTE, SIEMPRE DICHO.
// Que no esté configurada NO es un error del careo — pero callarlo sí sería un
// hueco: el careo se vería igual de verde con el libro de Memo dentro que
// fuera, y ésa es exactamente la ceguera que costó $1,081,021 invisibles
// durante siete días. Un careo verde no ve lo que ninguno de sus dos lados
// tiene, así que la pantalla dice CUÁNTOS lados está mirando.
function _excelFuenteNumerologia(n) {
  if (!n) return '';
  const caja = (color, txt) => `<div style="font-size:11px;color:var(--ts);padding:4px 0;border-left:2px solid ${color};padding-left:8px;margin:6px 0">${txt}</div>`;
  if (n.configurada === false) {
    return caja('var(--ts)', `<b style="color:var(--tp)">Numerología (los CHEAP que cobra Memo) todavía NO entra a este careo.</b>
      Este careo mira DOS lados: la pestaña de las chicas y el sistema.
      <span style="opacity:.8">${_evtEsc(n.motivo || '')}</span>`);
  }
  if (n.error) {
    return caja('var(--red)', `<b style="color:var(--red)">La hoja de Numerología no contestó bien</b>
      [${_evtEsc(n.error.codigo || '')}] ${_evtEsc(n.error.mensaje || '')}`);
  }
  if (n.sin_siembra) {
    return caja('var(--ts)', `<b style="color:var(--tp)">Numerología no se leyó para este evento</b> —
      ${_evtEsc(n.motivo || '')} <span style="opacity:.8">Se siembra en <code>numerologia_eventos</code>.</span>`);
  }
  if (n.parser_pendiente) {
    return caja('var(--orange)', `<b style="color:var(--orange)">La hoja de Numerología ya responde</b>
      (${n.filas_libro} fila(s) en el libro, ${n.mapeos} mapeo(s) sembrado(s)) —
      falta el lector del libro corrido. <span style="opacity:.8">${_evtEsc(n.motivo || '')}</span>`);
  }
  const sm = n.sin_mapeo || [];
  return caja('var(--green)', `<b style="color:var(--green)">Numerología DENTRO del careo</b> —
    ${(n.personas || []).length} persona(s) de este evento salen del libro de Memo.
    ${sm.length ? `<br><b style="color:var(--orange)">${sm.length}</b> grupo(s) del libro sin mapear a ningún evento
      (${sm.map(x => _evtEsc(x.evento_libro + (x.fecha_libro ? ' / ' + x.fecha_libro : '')) + ' ×' + x.filas).join(' · ')})
      — no se carean ni se inventan: se siembran en <code>numerologia_eventos</code>.` : ''}`);
}

// El chip de procedencia. Solo se pinta cuando la fila trae LAS DOS fuentes:
// ahí es donde el número de la pantalla no cuadra con ninguna de las dos hojas
// por separado, y no decirlo mandaría a Bulma a buscar el error en la pestaña.
function _excelChipFuentes(fuentes) {
  if (!Array.isArray(fuentes) || fuentes.length < 2) return '';
  return ` <span data-chip="fuentes" style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ts);border:1px solid currentColor;border-radius:3px;padding:0 4px;margin-left:4px">pestaña + numerología</span>`;
}

function _evtMxn(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
// Los siete montones. IGUALES va colapsado y con su cuenta: es el montón que
// no hay que mirar, y ocupar la pantalla con él escondería a los demás.
// ⚠️ `d.totales` NO es un montón: es el objeto de CONTEOS (`t`). El montón de
// CUADRE-1a se llama `d.totales_contrato`, y se llama así justamente porque el
// nombre corto ya estaba ocupado por esta línea de aquí abajo.
function _excelCareoHtml(d) {
  const t = d.totales || {};
  // [CUADRE-5] Los conteos por clase del $0 tecleado. 🔒 NO se recuentan aquí:
  // se leen del objeto que arma el lib que APLICA la regla. Contar de este lado
  // sería la segunda fórmula de «cuántos caen en la regla», y la que divergiera
  // pintaría un montón de un tamaño que nadie calculó.
  const c5 = d.cuadre5 || {};
  const cab = (titulo, n, color) =>
    `<div style="display:flex;align-items:baseline;gap:8px;margin:14px 0 6px">
       <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${color}">${titulo}</span>
       <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ts)">${n}</span></div>`;
  const lista = (arr, pinta) => arr.length
    ? `<div style="display:grid;gap:4px">${arr.map(pinta).join('')}</div>`
    : `<div style="font-size:12px;color:var(--ts)">— ninguno</div>`;
  const fila = (izq, der) =>
    `<div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)">
       <span>${izq}</span><span style="font-family:'JetBrains Mono',monospace;white-space:nowrap">${der}</span></div>`;

  // El mapa de columnas de cada pestaña, a la vista: si una pestaña se leyó con
  // el mapa raro, se ve aquí en vez de dar números mal en silencio.
  const pest = (d.pestanas || []).map(p =>
    `<div style="font-size:12px;color:var(--ts);padding:2px 0">
       <b style="color:var(--tp)">${_evtEsc(p.pestana)}</b>${p.regla_zona ? ` <span style="color:var(--orange)">· solo zona «${_evtEsc(p.regla_zona)}»</span>` : ''}
       — ${p.personas} persona(s) · columnas de dinero: ${(p.mapa && p.mapa.dinero || []).length}
       · descartes: ${p.descartes.chatarra} chatarra, ${p.descartes.sinNombre} sin nombre${p.descartes.otraZona ? `, ${p.descartes.otraZona} de otra zona` : ''}
     </div>`).join('');

  return `<div class="card" style="padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="font-size:12px;color:var(--ts);margin-bottom:4px">
        Excel: <b style="color:var(--tp)">${d.excel.personas}</b> persona(s) · Sistema: <b style="color:var(--tp)">${d.base.viajeros}</b> viajero(s)
      </div>
      <button class="btn" id="excel-aplicar-btn" onclick="excelAplicarVistaPrevia()">Aplicar el careo…</button>
    </div>
    <div id="excel-aplicar-panel"></div>
    ${pest}
    ${_excelFuenteNumerologia(d.numerologia)}
    ${cab('nuevos — en el Excel, no en el sistema', t.nuevos, 'var(--green)')}
    ${lista(d.nuevos, n => fila(`${_evtEsc(n.nombre)} <span style="color:var(--ts);font-size:11px">${_evtEsc(n.zona || '')} ${_evtEsc(n.paquete || '')}</span>`, _evtMxn(n.abonado)))}
    ${cab('pagos — montos distintos', t.pagos, 'var(--orange)')}
    ${lista(d.pagos, p => fila(_evtEsc(p.nombre) + _excelChipFuentes(p.fuentes), `${_evtMxn(p.base)} → ${_evtMxn(p.excel)} <b style="color:${p.diferencia > 0 ? 'var(--green)' : 'var(--red)'}">${p.diferencia > 0 ? '+' : ''}${_evtMxn(p.diferencia)}</b>`))}
    ${cab('bajas — en el sistema, ya no en el Excel', t.bajas, 'var(--red)')}
    ${lista(d.bajas, b => fila(_evtEsc(b.nombre), _evtMxn(b.abonado)))}
    <div style="font-size:11px;color:var(--ts);margin-top:4px">Una baja NO se borra ni se marca desde aquí: se nombra y espera firma.</div>

    ${cab('sin abonar — en el padrón, sin un peso todavía', t.apartados, 'var(--yellow,#e8ff4c)')}
    ${lista(d.apartados || [], a => fila(
      `${_evtEsc(a.nombre)} <span style="color:var(--ts);font-size:11px">${_evtEsc(a.zona || 'sin zona')} ${_evtEsc(a.paquete || '')}${a.filas > 1 ? ` · ${a.filas} filas` : ''}${a.talla ? ` · talla ${_evtEsc(a.talla)}` : ' · sin talla'}</span>`,
      a.en_sistema ? 'ya en el sistema' : 'no está en el sistema'))}
    <div style="font-size:11px;color:var(--ts);margin-top:4px">
      <b style="color:var(--tp)">Si está en el Excel, va.</b> Son viajeros, no una lista por aprobar:
      simplemente no han abonado todavía. Salen aparte para que no se confundan con altas que sí pagaron —
      y para que <b style="color:var(--tp)">sigan viéndose</b> ya dados de alta con $0, que es donde antes
      caían en «iguales» y dejaban de leerse aunque debieran.
      ${t.apartados ? `De los ${t.apartados}, <b style="color:var(--tp)">${t.apartados_zona_sin_talla}</b> traen zona y no traen talla (${t.apartados_filas} filas en total).` : ''}
    </div>

    ${cab('ambiguos — un nombre, varios viajeros en el sistema', t.ambiguos, 'var(--orange)')}
    ${lista(d.ambiguos || [], a => fila(
      `${_evtEsc(a.nombre)} <span style="color:var(--ts);font-size:11px">${a.viajeros.length} viajeros con ese nombre</span>`,
      `Excel ${_evtMxn(a.excel)} · sistema ${a.viajeros.map(v => _evtMxn(v.abonado)).join(' / ')}`))}
    <div style="font-size:11px;color:var(--ts);margin-top:4px">
      El careo NO elige por ti: adivinar cuál de los dos es sería inventar el dato que falta.
      Antes, el sistema se quedaba con UNO y el otro desaparecía del careo — con su deuda dentro.
    </div>
    ${cab('totales de contrato — lo que la persona DEBE, no lo que ha pagado', t.totales_contrato, 'var(--blue,#0000cd)')}
    ${lista(d.totales_contrato || [], x => fila(
      `${_evtEsc(x.nombre)} <span style="color:var(--ts);font-size:11px">${_evtEsc(x.zona || 'sin zona')} ${_evtEsc(x.paquete || '')}${x.filas > 1 ? ` · ${x.filas} filas` : ''}</span>`
      + (x.derivado
          ? ` <span data-chip="derivado" style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ts);border:1px solid currentColor;border-radius:3px;padding:0 4px;margin-left:4px">derivado</span>`
          : ''),
      `${x.sistema_total == null ? '<span style="color:var(--ts)">sin total</span>' : _evtMxn(x.sistema_total)} → ${_evtMxn(x.excel_total)} `
      + `<b style="color:${x.derivado ? 'var(--ts)' : 'var(--orange)'}">${x.diferencia > 0 ? '+' : ''}${_evtMxn(x.diferencia)}</b>`
      // El clic global solo toca los DERIVADOS con monto. A los otros dos —el
      // «$0» tecleado y el EXACTO de la libreta— se les pone su propio botón:
      // se aplican de uno en uno y con un humano mirando, que es justo lo que
      // los saca del montón global.
      + ((x.derivado && x.excel_total > 0) ? ''
          : ` <button class="btn btn-sm" data-aplicar-uno="${_evtEsc(x.nombre)}" style="margin-left:8px;font-size:10px;padding:1px 6px"
                 onclick="excelAplicarUno('totales', this.dataset.aplicarUno)">aplicar</button>`)))}
    <div style="font-size:11px;color:var(--ts);margin-top:4px">
      <b style="color:var(--tp)">La verdad es la columna «Total» de la pestaña</b> — trae el hotel y los upgrades adentro.
      ${t.totales_contrato ? `De los ${t.totales_contrato}, <b style="color:var(--tp)">${t.totales_contrato_derivados}</b> son sobre un total <b>derivado</b> del catálogo:
      ésos son un PISO y que difieran es lo ESPERADO. Los otros
      <b style="color:var(--orange)">${t.totales_contrato - t.totales_contrato_derivados}</b> salen de la libreta de Memo — ahí una diferencia es un cambio real que hay que mirar.` : ''}
      Quien no trae total en la pestaña NO sale aquí: un hueco no es una diferencia de dinero.
      ${t.totales_contrato_en_cero ? `<br><b style="color:var(--orange)">${t.totales_contrato_en_cero}</b> de ellos traen <b>$0</b> tecleado en la pestaña — casi siempre una fórmula sin llenar, no un contrato de cero pesos.
      ⚠️ Desde CUADRE-5 <b style="color:var(--tp)">éstos son los que la regla del $0 NO cubre</b>: los cubiertos ya salieron de este montón y se cuentan abajo.` : ''}
      <b style="color:var(--tp)">Esta fase SOLO LEE</b>: no corrige ningún total.
    </div>

    <div style="font-size:11px;color:var(--ts);margin-top:10px;border-top:1px solid rgba(255,255,255,.07);padding-top:8px">
      <span data-chip="cuadre5"
            title="Un $0 tecleado en la columna Total deja de ser diferencia cuando el index PUEDE saber el total completo: evento fuera de CDMX, o paquete CHEAP en cualquier lado. El total del sistema, derivado del catálogo, es el bueno."
            style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--yellow,#e8ff4c);border:1px solid currentColor;border-radius:3px;padding:0 4px">regla del $0 · ${_evtEsc(c5.fecha || 'sin fecha')}</span>
      <br><b style="color:var(--tp)">El total del sistema es el bueno por decreto</b> cuando el index PUEDE saberlo
      completo: evento <b>fuera de CDMX</b>, o paquete <b>CHEAP</b> en cualquier lado. Esos $0 salen del montón
      de arriba y se cuentan aquí — <b style="color:var(--tp)">no se borran</b>, y no traen botón de «aplicar»:
      aplicarlos escribiría el $0 encima de un total bueno.
      <br><b style="color:var(--tp)">${c5.en_regla || 0}</b> caen en la regla ·
      <b style="color:var(--orange)">${c5.fuera_cdmx || 0}</b> quedan FUERA por ser <b>CDMX en paquete con
      transporte</b> — el autobús son $2,500 pero el avión se cotiza a mano, así que el index no sabe el vuelo ·
      <b style="color:var(--orange)">${c5.fuera_libreta || 0}</b> son <b>exactos de libreta</b> y tampoco entran:
      ahí un $0 enfrente es un cambio real.
      ${c5.catalogo_error ? `<br><b style="color:var(--red)">El catálogo no se pudo leer (${_evtEsc(c5.catalogo_error)})</b>,
      así que el careo asumió CDMX y NO tapó ningún $0: ante la duda, la diferencia se sigue viendo.` : ''}
    </div>
    <details style="margin-top:8px">
      <summary style="cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ts)">$0 cubiertos por la regla · ${c5.en_regla || 0}</summary>
      <div style="padding-top:8px">${lista(d.totales_cero_regla || [], x => fila(
        `${_evtEsc(x.nombre)} <span style="color:var(--ts);font-size:11px">${_evtEsc(x.zona || 'sin zona')} ${_evtEsc(x.paquete || '')}${x.filas > 1 ? ` · ${x.filas} filas` : ''}</span>`,
        // El total que MANDA es el del sistema, así que se pinta él y se dice de
        // dónde salió: de la base, del catálogo vivo (porque venía NULL o en 0)
        // o de ningún lado, y entonces se dice el motivo en vez de un número.
        (x.sistema_total == null
          ? `<span style="color:var(--orange)">sin total — ${_evtEsc(x.sistema_total_motivo || 'el catálogo no dio precio')}</span>`
          : `${_evtMxn(x.sistema_total)} <span style="color:var(--ts);font-size:11px">${x.sistema_total_origen === 'catalogo' ? 'del catálogo vivo' : 'de la base'}</span>`)))}</div>
    </details>

    <details style="margin-top:14px">
      <summary style="cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ts)">iguales · ${t.iguales}</summary>
      <div style="padding-top:8px">${lista(d.iguales, i => fila(_evtEsc(i.nombre), _evtMxn(i.abonado)))}</div>
    </details>
  </div>`;
}

// ═══ [CUADRE-1b] EL BOTÓN QUE APLICA ════════════════════════════════════════
// Dos clics SIEMPRE: el primero PREGUNTA (vista previa con nombres y montos),
// el segundo escribe. El patrón del puente al Portal — un número pelón no se
// confirma, y aquí lo que se confirma es dinero de personas con nombre.
//
// 🔒 AQUÍ NO VIAJA NI UN MONTO. Se manda `evento_id` y, si acaso, qué montón y
// qué nombres. El servidor vuelve a correr el careo COMPLETO y escribe sobre
// SU resultado: un JSON viejo de esta pantalla diciendo «págale $5,000 a
// Fulano» llegaría firmado por un admin de verdad y nadie podría distinguirlo
// del bueno. Por eso la vista previa que se pinta abajo es informativa, y el
// aplicar NO se la devuelve al servidor.
async function _excelAplicar(cuerpo) {
  const eventoId = (document.getElementById('selector-evento') || {}).value || '';
  if (!eventoId) { showToast('Elige primero un evento', 'error'); return null; }
  const panel = document.getElementById('excel-aplicar-panel');
  if (panel) panel.innerHTML = '<div class="loading-state"><div class="spinner"></div>Recalculando el careo…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-excel-aplicar', {
      method: 'POST', body: JSON.stringify({ evento_id: eventoId, ...cuerpo }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) {
      if (panel) panel.innerHTML = `<div class="alert alert-error">${_evtEsc(d.error || ('Error ' + r.status))}`
        + (d.codigo ? ` <span style="opacity:.7">[${_evtEsc(d.codigo)}]</span>` : '') + `</div>`;
      return null;
    }
    return d;
  } catch (e) {
    if (panel) panel.innerHTML = `<div class="alert alert-error">${_evtEsc(e.message)}</div>`;
    return null;
  }
}

async function excelAplicarVistaPrevia() {
  const d = await _excelAplicar({});
  if (!d) return;
  const panel = document.getElementById('excel-aplicar-panel');
  panel.innerHTML = _excelAplicarPreviaHtml(d, {});
}

// El segundo clic. Solo aquí se escribe.
//
// 🔒 EL ALCANCE VIAJA EN EL BOTÓN QUE PINTÓ LA VISTA PREVIA, no en una variable
// de módulo. Si se perdiera, el segundo clic mandaría el plan GLOBAL después de
// haber enseñado UN renglón — enseñar uno y escribir diez es peor que no
// preguntar. Al leerlo del `dataset` del botón que el usuario acaba de ver, lo
// que se confirma es exactamente lo que se enseñó.
async function excelAplicarConfirmar(btn) {
  const b = btn || document.getElementById('excel-aplicar-ok');
  let alcance = {};
  try { alcance = JSON.parse((b && b.dataset && b.dataset.alcance) || '{}'); } catch (_) { alcance = {}; }
  if (b) { b.disabled = true; b.textContent = 'Aplicando…'; }
  const d = await _excelAplicar({ confirmar: true, ...alcance });
  if (!d) return;
  document.getElementById('excel-aplicar-panel').innerHTML = _excelAplicarHechoHtml(d);
  // El careo se vuelve a pintar: después de escribir, lo que había en pantalla
  // ya es el pasado.
  excelCarear();
}

// El botón de renglón: un solo nombre, un solo montón — Y LOS MISMOS DOS CLICS.
//
// 🔴 ASÍ NO ERA. Esta función llamaba a `_excelAplicar({confirmar:true, …})` de
// un golpe, tres líneas debajo del comentario que dice «Dos clics SIEMPRE». Es
// la forma más cara del comentario que se contradice con el código que explica
// — y aquí escribía DINERO.
//
// Y pesa justo aquí más que en el botón global: el renglón existe SOLO para la
// clase que se SACÓ del clic global por pedir mirada humana —el «$0» tecleado
// sobre un total bueno y el EXACTO de la libreta—. El botón que más tenía que
// preguntar era el único que no preguntaba.
async function excelAplicarUno(monton, nombre) {
  if (!nombre) return;
  const alcance = { solo: monton, claves: [nombre] };
  const d = await _excelAplicar(alcance);          // SIN `confirmar`: solo pregunta.
  if (!d) return;
  const panel = document.getElementById('excel-aplicar-panel');
  if (panel) panel.innerHTML = _excelAplicarPreviaHtml(d, alcance);
}

function _excelAplicarPreviaHtml(d, alcance) {
  const p = d.plan || {}, r = d.resumen || {};
  const unRenglon = !!(alcance && alcance.claves && alcance.claves.length);
  const fila = (izq, der) =>
    `<div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:2px 0">
       <span>${izq}</span><span style="font-family:'JetBrains Mono',monospace;white-space:nowrap">${der}</span></div>`;
  const grupo = (titulo, arr, pinta, color) => `
    <div style="margin-top:10px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${color}">${titulo} · ${arr.length}</div>
      ${arr.length ? arr.map(pinta).join('') : '<div style="font-size:12px;color:var(--ts)">— ninguno</div>'}
    </div>`;
  return `<div class="card" style="padding:14px;margin-top:12px;border:1px solid var(--orange)">
    <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--orange)">
      esto es lo que va a pasar — todavía NO se ha escrito nada
    </div>
    ${grupo('abonos a registrar', p.abonos || [], (x) => fila(_evtEsc(x.nombre), `${_evtMxn(x.sistema)} → ${_evtMxn(x.excel)}  <b style="color:var(--green)">+${_evtMxn(x.monto)}</b>`), 'var(--green)')}
    ${grupo('totales a corregir', p.totales || [], (x) => fila(_evtEsc(x.nombre) + ' <span style="font-size:10px;color:var(--ts)">derivado</span>', `${x.sistema_total == null ? 'sin total' : _evtMxn(x.sistema_total)} → ${_evtMxn(x.excel_total)}`), 'var(--blue,#0000cd)')}
    ${grupo('altas', p.altas || [], (x) => fila(`${_evtEsc(x.nombre)} <span style="font-size:11px;color:var(--ts)">${_evtEsc(x.zona_boleto)} ${_evtEsc(x.tipo_paquete)}${x.origen === 'apartado' ? ' · apartado' : ''}</span>`, `total ${_evtMxn(x.total_contrato)} · abonado ${_evtMxn(x.abonado_previo)}`), 'var(--yellow,#e8ff4c)')}
    ${grupo('NO se van a aplicar (el sistema va adelante del Excel)', p.negativas || [], (x) => fila(
        `${_evtEsc(x.nombre)}${x.numerologia ? ` <span data-chip="numerologia" style="font-size:10px;color:var(--tp);border:1px solid currentColor;border-radius:3px;padding:0 4px">Numerología${x.numerologia_por === 'nota' ? ' (por la nota del 19-sep)' : ''}</span>` : ''}`,
        `${_evtMxn(x.sistema)} vs Excel ${_evtMxn(x.excel)} <b style="color:var(--red)">${_evtMxn(x.diferencia)}</b>`), 'var(--red)')}
    ${grupo('se saltan, con su motivo', p.saltados || [], (x) => fila(_evtEsc(x.nombre), `<span style="font-size:11px;color:var(--ts)">${_evtEsc(x.motivo)}</span>`), 'var(--ts)')}
    <div style="font-size:11px;color:var(--ts);margin:10px 0">
      <b style="color:var(--tp)">Las BAJAS y los AMBIGUOS no se aplican nunca</b> — ni desde aquí ni por renglón.
      Una baja es una persona y espera firma; elegir entre dos homónimos sería inventar el dato que falta.
      Al confirmar, el servidor <b>vuelve a correr el careo</b> y escribe sobre ese resultado, no sobre esta lista.
    </div>
    <button class="btn btn-primary" id="excel-aplicar-ok"
            data-alcance="${_evtEsc(JSON.stringify(alcance || {}))}"
            onclick="excelAplicarConfirmar(this)">
      ${unRenglon
        ? `Sí, aplicar solo a ${_evtEsc(alcance.claves[0])}`
        : `Sí, aplicar: ${r.abonos} abono(s) por ${_evtMxn(r.monto_abonos)} · ${r.totales} total(es) · ${r.altas} alta(s)`}
    </button>
  </div>`;
}

// ═══ [CUADRE-3] «ACTUALIZAR TODO» ═══════════════════════════════════════════
// Un clic, todos los eventos. Los mismos DOS clics de siempre: el primero
// recorre y PREGUNTA, el segundo recorre y escribe.
//
// ⏱ EL BUCLE VIVE AQUÍ, y lo impuso el reloj: medido contra producción, el
// recorrido completo son ~496 s en serie y Netlify corta a los 10. El servidor
// atiende TANDAS DE 10 EN PARALELO (~5 s cada una) y este bucle las va pidiendo
// con `desde`. ~11 vueltas, ~60 s, con la barra avanzando.
//
// 🔒 LO ÚNICO QUE SUBE DE AQUÍ ES UN ÍNDICE. Jamás montos: el plan que se
// acumula abajo es para PINTAR, y no se le devuelve al servidor. Cada tanda
// recalcula su careo y escribe sobre ESE resultado.
let _excelTodoCorriendo = false;

async function _excelTodoRecorrer(confirmar, alAvanzar) {
  const acc = { eventos: [], total: null, vueltas: 0 };
  let desde = 0;
  for (;;) {
    const r = await khAdminFetch('/.netlify/functions/admin-excel-actualizar-todo', {
      method: 'POST', body: JSON.stringify({ desde, tanda: 10, confirmar }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || ('Error ' + r.status));
    acc.eventos.push(...(d.eventos || []));
    acc.total = d.total; acc.vueltas++;
    if (alAvanzar) alAvanzar(acc.eventos.length, d.total);
    if (d.hecho) return acc;
    // 🔒 Si la continuación no avanzara, esto sería un bucle infinito contra
    // producción. Se corta con nombre en vez de girar para siempre.
    if (d.siguiente <= desde) throw new Error('La continuación no avanzó (desde ' + desde + '): se corta para no girar en vacío.');
    desde = d.siguiente;
  }
}

function _excelTodoSumar(eventos) {
  const s = { abonos: 0, monto: 0, totales: 0, altas: 0, negativas: 0, saltados: 0, errores: 0,
              esc_abonos: 0, esc_totales: 0, esc_altas: 0, esc_errores: 0 };
  for (const e of eventos) {
    if (e.error) { s.errores++; continue; }
    const p = e.plan || {}, r = e.resultado || null;
    s.abonos += (p.abonos || []).length;
    s.monto += (p.abonos || []).reduce((a, x) => a + x.monto, 0);
    s.totales += (p.totales || []).length;
    s.altas += (p.altas || []).length;
    s.negativas += (p.negativas || []).length;
    s.saltados += (p.saltados || []).length;
    if (r) { s.esc_abonos += (r.abonos || []).length; s.esc_totales += (r.totales || []).length;
             s.esc_altas += (r.altas || []).length; s.esc_errores += (r.errores || []).length; }
  }
  return s;
}

async function excelActualizarTodo() {
  if (_excelTodoCorriendo) return;
  const panel = document.getElementById('excel-todo-panel');
  const btn = document.getElementById('excel-todo-btn');
  _excelTodoCorriendo = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Recorriendo…'; }
  try {
    const acc = await _excelTodoRecorrer(false, (n, t) => {
      if (panel) panel.innerHTML = `<div class="loading-state"><div class="spinner"></div>
        Recorriendo los eventos… <b>${n}</b> de <b>${t || '?'}</b>. Todavía no se ha escrito nada.</div>`;
    });
    if (panel) panel.innerHTML = _excelTodoPreviaHtml(acc);
  } catch (e) {
    if (panel) panel.innerHTML = `<div class="alert alert-error">${_evtEsc(e.message)}</div>`;
  } finally {
    _excelTodoCorriendo = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Actualizar TODO'; }
  }
}

async function excelActualizarTodoConfirmar() {
  if (_excelTodoCorriendo) return;
  const panel = document.getElementById('excel-todo-panel');
  const b = document.getElementById('excel-todo-ok');
  _excelTodoCorriendo = true;
  if (b) { b.disabled = true; b.textContent = 'Aplicando…'; }
  try {
    const acc = await _excelTodoRecorrer(true, (n, t) => {
      if (panel) panel.innerHTML = `<div class="loading-state"><div class="spinner"></div>
        Aplicando… <b>${n}</b> de <b>${t || '?'}</b> evento(s).</div>`;
    });
    if (panel) panel.innerHTML = _excelTodoHechoHtml(acc);
  } catch (e) {
    if (panel) panel.innerHTML = `<div class="alert alert-error">${_evtEsc(e.message)}
      <div style="font-size:11px;margin-top:6px">Lo que ya se aplicó, aplicado está: vuelve a correr «Actualizar TODO» — el segundo clic no repite nada porque el careo se recalcula.</div></div>`;
  } finally {
    _excelTodoCorriendo = false;
  }
}

// La tabla por evento. Solo se listan los que TIENEN algo que hacer: con 106
// eventos, pintar los 90 que ya cuadran escondería los 16 que importan.
function _excelTodoTabla(eventos, conResultado) {
  const filas = eventos.filter((e) => e.error
    || ((e.plan.abonos || []).length + (e.plan.totales || []).length + (e.plan.altas || []).length) > 0);
  if (!filas.length) return `<div style="font-size:12px;color:var(--ts);padding:6px 0">— ningún evento tiene nada que aplicar. Todo cuadra.</div>`;
  return `<div style="display:grid;gap:3px;margin-top:6px">` + filas.map((e) => {
    if (e.error) return `<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05)">
      <span style="color:var(--red)">${_evtEsc(e.evento_id)}</span>
      <span style="font-size:11px;color:var(--red)">[${_evtEsc(e.error.codigo || '')}] ${_evtEsc(String(e.error.mensaje || '').slice(0, 90))}</span></div>`;
    const p = e.plan, r = e.resultado;
    const monto = (p.abonos || []).reduce((a, x) => a + x.monto, 0);
    return `<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05)">
      <span><b style="color:var(--tp)">${_evtEsc(e.evento_id)}</b></span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:12px">
        ${(p.abonos || []).length ? `<span style="color:var(--green)">${(p.abonos || []).length} abono(s) ${_evtMxn(monto)}</span>` : ''}
        ${(p.totales || []).length ? ` · <span style="color:var(--blue,#0000cd)">${(p.totales || []).length} total(es)</span>` : ''}
        ${(p.altas || []).length ? ` · <span style="color:var(--yellow,#e8ff4c)">${(p.altas || []).length} alta(s)</span>` : ''}
        ${conResultado && r && (r.errores || []).length ? ` · <span style="color:var(--red)">${(r.errores || []).length} error(es)</span>` : ''}
      </span></div>`;
  }).join('') + `</div>`;
}

function _excelTodoPreviaHtml(acc) {
  const s = _excelTodoSumar(acc.eventos);
  return `<div class="card" style="padding:14px;border:1px solid var(--orange)">
    <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--orange)">
      esto es lo que va a pasar en los ${acc.total} eventos — todavía NO se ha escrito nada
    </div>
    <div style="font-size:13px;margin:8px 0">
      <b style="color:var(--green)">${s.abonos}</b> abono(s) por <b>${_evtMxn(s.monto)}</b> ·
      <b style="color:var(--blue,#0000cd)">${s.totales}</b> total(es) ·
      <b style="color:var(--yellow,#e8ff4c)">${s.altas}</b> alta(s)
      ${s.errores ? ` · <b style="color:var(--red)">${s.errores}</b> evento(s) que no se pudieron leer` : ''}
    </div>
    <div style="font-size:11px;color:var(--ts)">
      No se aplican: <b>${s.negativas}</b> diferencia(s) negativa(s) (el sistema va adelante del Excel) y
      <b>${s.saltados}</b> renglón(es) saltado(s) —los «$0» tecleados y los totales EXACTOS de la libreta,
      que van uno por uno desde el careo de su evento.
      <b style="color:var(--tp)">Las bajas y los ambiguos no se aplican nunca.</b>
    </div>
    ${_excelTodoTabla(acc.eventos, false)}
    <button class="btn btn-primary" id="excel-todo-ok" style="margin-top:10px" onclick="excelActualizarTodoConfirmar()">
      Sí, aplicar en los ${acc.total} eventos
    </button>
  </div>`;
}

function _excelTodoHechoHtml(acc) {
  const s = _excelTodoSumar(acc.eventos);
  return `<div class="card" style="padding:14px;border:1px solid var(--green)">
    <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--green)">hecho · ${acc.total} eventos</div>
    <div style="font-size:13px;margin:8px 0">
      <b>${s.esc_abonos}</b> abono(s) por <b>${_evtMxn(s.monto)}</b> ·
      <b>${s.esc_totales}</b> total(es) corregido(s) · <b>${s.esc_altas}</b> alta(s).
      ${s.esc_errores ? `<span style="color:var(--red)"> · ${s.esc_errores} error(es) al escribir</span>` : ''}
      ${s.errores ? `<span style="color:var(--red)"> · ${s.errores} evento(s) no se pudieron leer</span>` : ''}
    </div>
    ${_excelTodoTabla(acc.eventos, true)}
  </div>`;
}

function _excelAplicarHechoHtml(d) {
  const r = d.resultado || {}, s = d.resumen || {};
  const li = (x) => `<div style="font-size:13px;padding:2px 0">· ${_evtEsc(x.nombre)}</div>`;
  return `<div class="card" style="padding:14px;margin-top:12px;border:1px solid var(--green)">
    <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--green)">hecho</div>
    <div style="font-size:13px;margin:6px 0">
      ${s.abonos} abono(s) por <b>${_evtMxn(s.monto_abonos)}</b> · ${s.totales} total(es) corregido(s) · ${s.altas} alta(s).
    </div>
    ${(r.abonos || []).map(li).join('')}
    ${(r.altas || []).map((x) => `<div style="font-size:13px;padding:2px 0">· alta: ${_evtEsc(x.nombre)}${x.aviso_doble_descuento ? ` <span style="color:var(--orange);font-size:11px">⚠ ${_evtEsc(x.aviso_doble_descuento.mensaje)}</span>` : ''}</div>`).join('')}
    ${(r.errores || []).length ? `<div class="alert alert-error" style="margin-top:8px">${(r.errores).map((e) => _evtEsc(e.paso + (e.nombre ? ' · ' + e.nombre : '') + ': ' + (e.detalle || ''))).join('<br>')}</div>` : ''}
  </div>`;
}
