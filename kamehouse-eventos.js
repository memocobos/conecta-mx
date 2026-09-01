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
  // [FLUJO-UX-1] NO TENÍA CATCH. Si el catálogo no bajaba, la promesa se
  // rechazaba sin dueño y el selector se quedaba con su «Selecciona un
  // evento…» para siempre: indistinguible de un catálogo vacío.
  let ev;
  try { ev = await _fetchEVFromIndex(); }
  catch (e) {
    // `evt-desglose` es el contenedor visible más cercano al selector, y nace
    // oculto: se destapa aquí. El id se LEYÓ del marcado — la primera versión
    // usó uno inventado («evt-tabla-wrap») que no existe en ningún lado.
    const caja = document.getElementById('evt-desglose');
    if (caja) caja.style.display = '';
    khErrorCarga(caja, 'la lista de eventos', '_evtPoblarSelector', e);
    return;
  }
  // [ORD-1] Antes: DESCENDENTE por ds — el más LEJANO primero y el próximo a
  // media lista. Ahora la regla compartida: próximos · sin fecha · pasados.
  const eventos = _evOrdenarPorFecha((ev || []).filter(e => e && e.id && e.a));
  while (sel.options.length > 1) sel.remove(1);
  eventos.forEach(e => {
    if (Array.isArray(e.multifecha) && e.multifecha.length) {
      e.multifecha.forEach((mf, i) => {
        const lbl = (mf && mf.lbl) ? mf.lbl : ('Fecha ' + (i + 1));
        const opt = document.createElement('option');
        opt.value = e.id + '#' + i;
        opt.textContent = e.a + ' · ' + lbl;
        sel.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.a;
      sel.appendChild(opt);
    }
  });
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
// Excel. Pinta cuatro montones por nombre: NUEVOS · PAGOS · BAJAS · IGUALES.
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
function _evtMxn(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
// Los cuatro montones. IGUALES va colapsado y con su cuenta: es el montón que
// no hay que mirar, y ocupar la pantalla con él escondería los otros tres.
function _excelCareoHtml(d) {
  const t = d.totales || {};
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
    <div style="font-size:12px;color:var(--ts);margin-bottom:4px">
      Excel: <b style="color:var(--tp)">${d.excel.personas}</b> persona(s) · Sistema: <b style="color:var(--tp)">${d.base.viajeros}</b> viajero(s)
    </div>
    ${pest}
    ${cab('nuevos — en el Excel, no en el sistema', t.nuevos, 'var(--green)')}
    ${lista(d.nuevos, n => fila(`${_evtEsc(n.nombre)} <span style="color:var(--ts);font-size:11px">${_evtEsc(n.zona || '')} ${_evtEsc(n.paquete || '')}</span>`, _evtMxn(n.abonado)))}
    ${cab('pagos — montos distintos', t.pagos, 'var(--orange)')}
    ${lista(d.pagos, p => fila(_evtEsc(p.nombre), `${_evtMxn(p.base)} → ${_evtMxn(p.excel)} <b style="color:${p.diferencia > 0 ? 'var(--green)' : 'var(--red)'}">${p.diferencia > 0 ? '+' : ''}${_evtMxn(p.diferencia)}</b>`))}
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
    <details style="margin-top:14px">
      <summary style="cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ts)">iguales · ${t.iguales}</summary>
      <div style="padding-top:8px">${lista(d.iguales, i => fila(_evtEsc(i.nombre), _evtMxn(i.abonado)))}</div>
    </details>
  </div>`;
}
