// =============================================================================
// kamehouse-resumen.js — el Resumen, la última de la serie (MONO-17)
// =============================================================================
// La pantalla de inicio: el tablero de conexiones, el saludo, la utilidad y los
// avisos. Se dejó para el final a propósito —es tejido— para extraerla con el
// tronco ya chico y sus dependencias a la vista.
//
// Mismas reglas: SOLO funciones, en el MISMO ORDEN, con su comentario pegado, y
// cero código de nivel superior. La orden era DETENERSE y reportar si el
// extractor o el humo pedían mover estado: no lo pidieron.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

// Pinta los atajos que el usuario puede usar. Si no le queda ninguno, el bloque
// se queda oculto: un contenedor vacío anuncia algo que no va a llegar.
function _renderAtajosHome() {
  const cont = document.getElementById('resumen-atajos');
  if (!cont || !currentUser) return;
  const visibles = (ATAJOS_HOME[currentUser.rol] || []).filter(a => _puedeVerTab(a.tab));
  if (!visibles.length) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
  cont.innerHTML = '<div class="k-mono" style="margin-bottom:10px">// ACCIONES RÁPIDAS</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px">'
    + visibles.map(a => {
        // Sin segundo parámetro: todos estos destinos SÍ tienen botón de menú, así
        // que showPage saca el rótulo móvil de ahí. Pasarlo sería argumento muerto.
        const abrir = a.herramienta ? `showHerramienta('${a.tab}')` : `showPage('${a.tab}')`;
        return `<button class="btn btn-ghost btn-sm" onclick="${abrir}">${a.etiqueta}</button>`;
      }).join('')
    + '</div>';
  cont.style.display = '';
}
// Trae TODA la cobranza (activos por default + cancelados) una sola vez. La pestaña
// Pagos mantiene su propia _cobranzaCache; esta cache es para Resumen/Por Evento.
async function _cobCargarTodo(force) {
  if (_cobTodoCache && !force) return _cobTodoCache;
  await _poblarFiltroEventoPagos();   // garantiza _cobEVMap (multifecha) poblado
  const hdrs = _spAdminHeaders();
  const pedir = (estado) => khAdminFetch('/.netlify/functions/admin-cobranza-list', {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify(estado ? { estado } : {}),
  }).then(r => r.json().then(d => ({ ok: r.ok, d })));
  const [act, can] = await Promise.all([pedir(null), pedir('cancelado')]);
  if (!act.ok) throw new Error((act.d && act.d.error) || 'No se pudo cargar la cobranza');
  const activos    = Array.isArray(act.d.tours) ? act.d.tours : [];
  const cancelados = (can.ok && Array.isArray(can.d.tours)) ? can.d.tours : [];
  // admin-cobranza-list topa en 300; si llegamos al tope, los totales podrían estar
  // incompletos (avisamos en Resumen en vez de mostrar números silenciosamente cortos).
  _cobTodoCache = { activos, cancelados, capHit: activos.length >= 300 };
  return _cobTodoCache;
}
// Trae TODOS los gastos una sola vez (cache en memoria, estilo _cobTodoCache) para
// sumarlos en Resumen y Por Evento. admin-gastos-list con body {} = todos (incluye los
// "General"). Si la función falla, devolvemos 0 y NO cacheamos (reintenta a la próxima)
// para no tronar el Resumen: los demás números deben seguir saliendo.
async function _cobCargarGastos(force) {
  if (_gastosG2Cache && !force) return _gastosG2Cache;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-gastos-list', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify({}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los gastos');
    const lista = Array.isArray(d.gastos) ? d.gastos : [];
    const total = Number(d.total || 0) || lista.reduce((a, g) => a + Number(g.monto || 0), 0);
    _gastosG2Cache = { lista, total };
    return _gastosG2Cache;
  } catch (e) {
    return { lista: [], total: 0 };
  }
}
// Trae la utilidad por evento (todos los eventos) una sola vez. Best-effort: si
// falla devuelve null y NO cachea — la vista sigue pintando lo demás (igual
// criterio que _cobCargarGastos).
// ═══════════════════════════════════════════════════════════════════════════
// [MER-1] ¿EL EVENTO YA PASÓ? — UNA sola respuesta para las cuatro pantallas
//
// Memo, del 7-ago sobre melanie (el concierto fue el 6): "se quedaron sin
// vender". Y las pantallas seguían diciendo «7 boletos por vender ≈ $40,100 ·
// si se vende todo: +$29,319». Eso no es una estimación optimista: es una
// imposibilidad. Un boleto de un concierto que ya ocurrió no se vende nunca, y
// una pantalla que ofrece una salida inexistente es peor que una que calla.
//
// MANDA LA ÚLTIMA FECHA, NO LA PRIMERA. `ds` de un evento multifecha es el
// PRIMER día — harry trae `ds:'2026-08-01'` con funciones el 7 y el 8 de
// agosto — así que compararlo contra hoy declararía merma sobre boletos que
// todavía se pueden vender. Ése es el error caro de los dos: apagaría la bodega
// de un evento VIVO y pintaría de rojo un semáforo que debía estar ámbar. Las
// fechas extra viven en `dsList` en unos eventos y en `multifecha[].ds` en
// otros (weeknd y straykids usan la primera; morat y caifanes la segunda): se
// leen las dos y gana la mayor.
//
// HOY EN HORA MX, con `_mxFechaStr()`, el helper de la casa. Jamás
// `toISOString()`: pasadas las 6 de la tarde de acá ya es el día siguiente en
// Greenwich, y en esta casa se trabaja de noche — el evento de HOY se
// declararía pasado a media jornada, con boletos todavía en venta.
//
// Y la frontera es estricta (`<`): el día del evento NO es pasado. Mientras el
// concierto no ocurre hay taquilla.
//
// Sin fecha legible NO se afirma nada: `false`, y la bodega se queda con su cara
// de siempre. Una merma inventada es peor que una esperanza vieja.
function _mermaUltimaFecha(ev) {
  const iso = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '');
  if (!ev || typeof ev !== 'object') return iso(ev);   // también acepta 'YYYY-MM-DD' pelado
  const fechas = [iso(ev.ds)];
  if (Array.isArray(ev.dsList)) ev.dsList.forEach((d) => fechas.push(iso(d)));
  if (Array.isArray(ev.multifecha)) ev.multifecha.forEach((m) => fechas.push(iso(m && m.ds)));
  const buenas = fechas.filter(Boolean).sort();
  return buenas.length ? buenas[buenas.length - 1] : '';
}
function _mermaPasado(ev) {
  const f = _mermaUltimaFecha(ev);
  return !!f && f < _mxFechaStr();
}
// [AUD-1c] LA UTILIDAD, CON LA BODEGA AL LADO — el requisito que Memo firmó:
// EL ROJO NUNCA SOLO. Una ganancia negativa con boletos sin vender no es una
// pérdida: es dinero que todavía está en forma de boleto. Enseñar el rojo sin la
// bodega asusta sin razón, y con melanie el rojo es real (−$10,781 contra 7
// boletos que valen ≈$40,100).
function _audUtilidadPintar(utilidad, cta, util) {
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  // [UTIL-C-2] `null` = NO SE PUEDE SABER, y se dice. Antes esta función no
  // distinguía el desconocido del cero: `Number(null) || 0` pinta $0 en verde
  // con el rótulo "Utilidad", que es una afirmación —"este evento no gana ni
  // pierde"— hecha justo cuando no hay con qué afirmarla. Es el mismo cero que
  // AUD-1 encontró diciendo "Cobrado $0" sobre $136,391 cobrados.
  const sinDato = (utilidad == null);
  const neg = !sinDato && Number(utilidad) < 0;
  // El signo, en palabras (patrón CAP-FIX-2d/AUD-1b).
  setTxt('m-utilidad', sinDato ? '—' : _spFmtMxn(Math.abs(Number(utilidad) || 0)));
  const lbl = document.getElementById('m-utilidad-lbl');
  if (lbl) lbl.textContent = sinDato ? 'Sin dato' : (neg ? 'Falta por recuperar' : 'Utilidad');
  const elUtil = document.getElementById('m-utilidad');
  if (elUtil) elUtil.className = 'metric-value ' + (sinDato ? '' : (neg ? 'red' : 'green'));

  // [UTIL-B-3] "En mano": la caja, subordinada al margen. Se pinta SIEMPRE que
  // se sepa; si no se sabe, se dice — un guion es una afirmación menos peligrosa
  // que un cero.
  const mano = document.getElementById('m-enmano');
  if (mano) {
    const v = (cta || {}).en_mano;
    mano.innerHTML = (v == null)
      ? 'en mano: <b>—</b>'
      : `en mano: <b>${_spFmtMxn(Number(v))}</b>`;
  }

  const bod = document.getElementById('m-bodega');
  if (!bod) return;
  const b = cta || {};
  const boletos = b.bodega_boletos;
  const valor = b.bodega_valor;
  // [MER-1] Los dos montones llegan SEPARADOS del servidor y aquí no se vuelven
  // a mezclar: lo de los eventos por venir se puede vender, lo de los pasados no.
  const mBoletos = b.merma_boletos;
  const mCosto = b.merma_costo;
  // Sin cuenta o sin inventario NO se pinta una bodega vacía: se calla o se
  // dice, pero no se afirma "0 boletos" que nadie midió.
  if (!cta || (boletos == null && mBoletos == null)) {
    bod.style.display = 'none'; bod.innerHTML = '';
    if (util && util.cuenta_error) {
      bod.style.display = ''; bod.innerHTML = `<span class="aud-bod-mudo">No pude leer el inventario, así que no sé cuántos boletos quedan por vender.</span>`;
    }
    return;
  }
  if (!boletos && !mBoletos) {
    bod.style.display = ''; bod.innerHTML = '<span class="aud-bod-mudo">Sin boletos por vender: la cuenta de arriba ya es la final.</span>';
    return;
  }
  const partes = [];
  // La ESPERANZA: solo de eventos por venir, y solo ahí vive el "si se vende
  // todo".
  //
  // ⚠️ [UTIL-B-3] ESTE COMENTARIO DECÍA LO CONTRARIO, y era cierto bajo la
  // fórmula A: "la utilidad de arriba ya trae el costo de TODO lo comprado
  // dentro de gastos, así que sumarle el valor de venta de lo que aún se puede
  // vender sigue siendo la cuenta correcta". Bajo B **el costo de lo NO vendido
  // ya no está en la utilidad** —es inventario, y espera a venderse—, así que
  // sumar solo el precio prometería una ganancia sin su costo. Ahora se suma el
  // MARGEN: valor de venta − lo que costaron.
  //
  // Y la bodega cambia de papel: bajo A existía como CONTRAPESO (AUD-1c, "el
  // rojo nunca solo") porque un boleto comprado y no vendido hacía rojo a la
  // ganancia sin ser una pérdida. Bajo B ese rojo YA NO NACE. La bodega deja de
  // ser una disculpa y pasa a ser INFORMACIÓN: cuánto te queda por vender y
  // cuánto ganarías si lo vendieras.
  // Va SIN envolver, exactamente el markup de AUD-1c: en un evento por venir esta
  // pantalla tiene que quedar byte a byte como estaba. La merma que viene abajo
  // es un <div> —bloque— así que cuando existen las dos se separan solas.
  if (boletos) {
    // [UTIL-C-4] LA BODEGA ES INFORMACIÓN, NO UN CONTRAPESO. Aquí vivía
    // «Si se vende todo: $X», y bajo la fórmula C esa línea era DOBLE CONTEO:
    // hacía `utilidad + (valor − costo)`, pero el costo de esos boletos ya está
    // restado dentro de la INVERSIÓN TOTAL. Los descontaba dos veces.
    //
    // Y arreglarle la aritmética tampoco era la respuesta. La bodega nació como
    // disculpa del rojo (AUD-1c, "el rojo nunca solo"): bajo la fórmula A un
    // boleto comprado y no vendido ensuciaba la ganancia sin ser una pérdida.
    // Bajo C ese rojo es LA VERDAD —los boletos ya son de Memo, se vendan o
    // no—, así que la bodega deja de tener que defenderlo. Lo que sí contesta,
    // y por eso se queda, es "¿qué me queda por vender y cuánto vale?".
    //
    // El "¿en cuánto cerraría?" no se pierde: vive en el PANEL DE ESCENARIOS de
    // Kamisama (UTIL-C-2), que además cuenta lo que falta por COBRAR — algo que
    // esta línea nunca miró.
    const bCosto = b.bodega_costo;
    const conCosto = Number.isFinite(Number(bCosto));
    partes.push(`<b>${boletos}</b> boleto${boletos === 1 ? '' : 's'} por vender`
      + (valor == null
          ? ' <span class="aud-bod-mudo">— sin precio en el catálogo, no se puede estimar</span>'
          : ` ≈ <b>${_spFmtMxn(valor)}</b> <span class="aud-bod-est">a precio de hoy (estimado)</span>`
            + (conCosto
                ? ` · costaron <b>${_spFmtMxn(Number(bCosto))}</b> <span class="aud-bod-mudo">— ya restados en la utilidad</span>`
                : ' <span class="aud-bod-mudo">— sin costo capturado</span>')));
  }
  // La MERMA: eventos que ya ocurrieron. Se mide en lo que COSTARON, no en lo
  // que se iban a vender, y NUNCA lleva "si se vende todo" — no hay a quién.
  if (mBoletos) {
    partes.push(`<div class="aud-merma"><b>Merma:</b> <b>${mBoletos}</b> boleto${mBoletos === 1 ? '' : 's'} sin vender`
      + (mCosto == null
          ? ' <span class="aud-bod-mudo">— sin costo capturado, no se puede valorar</span>'
          : ` · <b class="mer1-merma">${_spFmtMxn(mCosto)}</b> de costo hundido`)
      + ' <span class="aud-bod-est">de eventos que ya pasaron</span></div>');
  }
  // El acento del bloque es ORO, que en esta casa significa "esto todavía se
  // puede cobrar". Cuando lo único que hay es merma, esa promesa es falsa hasta
  // en el color: se pasa a rojo. Con bodega vendible presente el bloque se queda
  // EXACTAMENTE como estaba, clase incluida.
  bod.className = 'aud-bodega' + ((mBoletos && !boletos) ? ' aud-bodega-merma' : '');
  bod.style.display = '';
  bod.innerHTML = partes.join('');
}
// [AUD-1c] LOS PRECIOS SE INYECTAN DESDE AQUÍ (decisión de Jane).
//
// El catálogo de precios vive en `index.html` y el servidor NO lo tiene — se
// verificó en AUD-1a: `eventos_meta` no guarda precios y la tabla legacy
// `eventos` ni siquiera tiene a melanie. Darle al servidor una fuente propia
// sería una divergencia más esperando nacer, así que se los manda el navegador,
// que ya carga ese catálogo (el MISMO `_fetchEVFromIndex` que usa FIN-1d).
//
// Si el catálogo no cargó, se mandan `null` y la bodega se queda en su conteo
// con `valor_estimado: null` — nunca un cero que diría "no vale nada".
async function _audPreciosPorEvento() {
  try {
    const ev = await _fetchEVFromIndex();
    if (!Array.isArray(ev) || !ev.length) return null;
    const out = {};
    ev.forEach((e) => {
      if (!e || !e.id || !Array.isArray(e.zonas)) return;
      const z = {};
      e.zonas.forEach((x) => {
        const p = Number(x && x.p);
        if (x && x.n != null && Number.isFinite(p) && p > 0) z[String(x.n).trim()] = p;
      });
      if (Object.keys(z).length) out[e.id] = z;
    });
    return Object.keys(out).length ? out : null;
  } catch (_) { return null; }
}
// [MER-1] Y QUÉ EVENTOS YA PASARON, por el MISMO camino y la misma razón: la
// fecha vive en el catálogo de index.html, que el servidor no tiene. El reloj es
// uno solo y es éste; el servidor solo recibe la clasificación ya hecha.
// Sin catálogo se mandan `null` y NINGÚN evento se marca pasado: la bodega se
// queda con su cara de siempre, que es el lado seguro de equivocarse.
async function _audEventosPasados() {
  try {
    const ev = await _fetchEVFromIndex();
    if (!Array.isArray(ev) || !ev.length) return null;
    const out = ev.filter((e) => e && e.id && _mermaPasado(e)).map((e) => String(e.id));
    return out.length ? out : null;
  } catch (_) { return null; }
}
async function _utilCargar(force) {
  if (_utilG3Cache && !force) return _utilG3Cache;
  try {
    // Los dos salen del MISMO catálogo cacheado (_fetchEVFromIndex): dos lecturas,
    // una sola descarga.
    const [precios, pasados] = await Promise.all([_audPreciosPorEvento(), _audEventosPasados()]);
    const cuerpo = {};
    if (precios) cuerpo.precios_por_evento = precios;
    if (pasados) cuerpo.eventos_pasados = pasados;
    const r = await khAdminFetch('/.netlify/functions/admin-utilidad-evento', {
      method: 'POST',
      headers: _spAdminHeaders(),
      body: JSON.stringify(cuerpo),
    });
    const d = await r.json();
    if (!r.ok || d.ok === false) throw new Error(d.error || 'No se pudo cargar la utilidad');
    _utilG3Cache = {
      eventos:    (d.eventos && typeof d.eventos === 'object') ? d.eventos : {},
      sin_evento: d.sin_evento || null,
      totales:    d.totales || {},
      // [AUD-1c] La cuenta de los DOS mundos, aditiva. `null` si el servidor no
      // la pudo calcular: quien la consuma tiene que distinguir "no hay" de
      // "no sé", y por eso no se rellena con un objeto vacío.
      cuenta:     d.cuenta || null,
      cuenta_error: d.cuenta_error || null,
    };
    return _utilG3Cache;
  } catch (e) {
    return null;
  }
}
// Normaliza las dos formas a UNA. Las columnas se leyeron de la base:
// radar_alertas trae {tipo, severidad, titulo, mensaje, vista, created_at} y
// sistema_alertas solo {tipo, mensaje, leida, created_at, ref} — sin título.
function _rahNormalizar(radar, sistema) {
  const uno = (a, fuente) => {
    // `_tsToDate` existe porque algunos timestamps llegan SIN zona; se usa para
    // no depender de que PostgREST siempre mande el offset.
    const d = _tsToDate(a && a.created_at);
    const sev = fuente === 'radar'
      ? (a.severidad || 'info')
      : (_RAH_SEV_SISTEMA[a.tipo] || 'info');
    return {
      fuente, tipo: a.tipo || '',
      sev,
      titulo: (fuente === 'radar' && a.titulo) ? a.titulo : '',
      texto: a.mensaje || '',
      // ⚠️ Cada tabla nombra distinto lo mismo: `vista` en el Radar, `leida`
      // en sistema. Leerlas con el nombre de la otra daría siempre `undefined`,
      // o sea "todo sin leer", que es una afirmación falsa pintada de urgente.
      leida: fuente === 'radar' ? a.vista === true : a.leida === true,
      ts: d ? d.getTime() : 0,
      iso: d ? d.toISOString() : '',
    };
  };
  return []
    .concat((Array.isArray(radar) ? radar : []).map(a => uno(a, 'radar')))
    .concat((Array.isArray(sistema) ? sistema : []).map(a => uno(a, 'sistema')))
    .filter(a => a.texto || a.titulo)
    .sort((x, y) => y.ts - x.ts)
    .slice(0, _RAH_TOPE);
}
function _rahRender(lista) {
  const arriba = lista.slice(0, _RAH_VISIBLES);
  const resto = lista.slice(_RAH_VISIBLES);
  const sinLeer = lista.filter(a => !a.leida).length;
  return `<div class="card rah-card">
    <div class="rah-head">
      <span class="rah-h">Lo que pide atención</span>
      <span class="rah-n">${lista.length}${sinLeer ? ` · <b>${sinLeer} sin ver</b>` : ''}</span>
    </div>
    <div class="rah-list">${arriba.map(_rahFila).join('')}</div>
    ${resto.length ? `<details class="rah-mas">
      <summary>ver las ${lista.length}</summary>
      <div class="rah-list">${resto.map(_rahFila).join('')}</div>
    </details>` : ''}
  </div>`;
}
async function _loadAlertasHome() {
  const el = document.getElementById('resumen-alertas');
  if (!el) return;
  if (!currentUser || currentUser.rol !== 'maestro_roshi') { el.style.display = 'none'; return; }
  // Fails-soft POR FUENTE, no en bloque: un `Promise.all` que rechaza dejaría
  // el panel vacío aunque la otra fuente hubiera contestado bien.
  const [radar, sistema] = await Promise.all([
    khRadar.alertasListar().catch(() => []),
    khCoordi.alertasListar().catch(() => []),
  ]);
  const lista = _rahNormalizar(radar, sistema);
  if (!lista.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = _rahRender(lista);
}
// [RES-2] Renglones a la vista antes del desplegable. En teléfono son menos:
// medido, con 6 el primer número de dinero caía en y=882 y el pliegue de un
// 390×844 está en 844 — 38px de más. Con 4 entra. Se decide AL PINTAR; girar
// el teléfono no lo recalcula hasta la siguiente carga, y eso es aceptable
// para un tablero que se abre, se mira y se cierra.
function _cnxVisibles() { return (window.innerWidth || 1200) <= 640 ? 4 : 6; }
async function _loadConexiones() {
  const el = document.getElementById('resumen-conexiones');
  if (!el) return;
  if (!currentUser || currentUser.rol !== 'maestro_roshi') { el.style.display = 'none'; return; }
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-conexiones', { method: 'POST', body: JSON.stringify({ accion: 'hoy' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { el.style.display = 'none'; return; }   // fails-soft: sin panel
    el.style.display = '';
    el.innerHTML = _renderConexiones(j);
  } catch (_) { el.style.display = 'none'; }
}
function _conexChip(u, tol) {
  const esAux = _CONEX_AUX.includes(u.rol);
  if (!esAux) return '';   // sin juicio de horario para roles sin entrada contractual
  const chip = (txt, color) => `<span style="display:inline-block;font-size:10px;font-weight:800;padding:2px 8px;border-radius:var(--r-sm,8px);color:${color};border:1px solid ${color}66;white-space:nowrap">${txt}</span>`;
  if (u.primera_min == null) return chip('sin conexión aún', 'var(--ts)');
  const puntual = u.primera_min <= (9 * 60 + (tol || 15));
  return chip(_esfEsc(u.primera) + (puntual ? ' ✓' : ''), puntual ? 'var(--green)' : 'var(--orange)');
}
function _renderConexiones(j) {
  const tol = j.tolerancia_min || 15;
  const us = Array.isArray(j.usuarios) ? j.usuarios : [];
  // Auxiliares primero (las que Memo vigila), luego el resto por nombre.
  const orden = us.slice().sort((a, b) => {
    const aa = _CONEX_AUX.includes(a.rol) ? 0 : 1, bb = _CONEX_AUX.includes(b.rol) ? 0 : 1;
    return aa !== bb ? aa - bb : String(a.nombre).localeCompare(String(b.nombre));
  });
  // [RES-2] Con 14 usuarios activos la tabla medía 571px: media pantalla de
  // alto. Se muestran los primeros — que por el orden de arriba son los AUX,
  // los que Memo vigila — y el resto va detrás del mismo desplegable que usa
  // la tira de alertas.
  const fila = (u) => {
    const idS = _esfEsc(u.id);
    const chip = _conexChip(u, tol);
    return `<tr style="border-top:1px solid var(--border);cursor:pointer" onclick="_conexHistorial('${idS}','${_attrJs(u.nombre)}')" title="Ver últimos 14 días">
      <td style="padding:7px 4px;font-size:13px;color:var(--text);border:none">${_esfEsc(u.nombre)}${_CONEX_AUX.includes(u.rol) ? ' <span style="font-size:9px;color:var(--ts);text-transform:uppercase;letter-spacing:.06em">aux</span>' : ''}</td>
      <td style="padding:7px 4px;text-align:center;font-size:13px;color:var(--text);border:none">${u.primera ? _esfEsc(u.primera) : '<span style="color:var(--ts)">—</span>'}</td>
      <td style="padding:7px 4px;text-align:center;font-size:13px;color:var(--text);border:none">${u.ultima ? _esfEsc(u.ultima) : '<span style="color:var(--ts)">—</span>'}</td>
      <td style="padding:7px 4px;text-align:right;border:none">${chip}</td>
    </tr>`;
  };
  const vis = _cnxVisibles();
  const arriba = orden.slice(0, vis).map(fila).join('');
  const resto = orden.slice(vis);
  const filas = arriba;
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="font-family:'Barlow Condensed','Montserrat',sans-serif;font-weight:800;font-size:16px;text-transform:uppercase;color:var(--text)">🕘 Conexiones de hoy</div>
      <div style="font-size:10px;color:var(--ts)">Hora Monterrey · entrada aux 09:00 (tolerancia ${tol} min) · privado</div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:transparent">
      <thead><tr style="font-size:10px;color:var(--ts);text-transform:uppercase;letter-spacing:.08em">
        <th style="text-align:left;padding:4px;background:transparent;border:none;color:var(--ts)">Usuario</th><th style="padding:4px;background:transparent;border:none;color:var(--ts)">Primera</th><th style="padding:4px;background:transparent;border:none;color:var(--ts)">Última</th><th style="text-align:right;padding:4px;background:transparent;border:none;color:var(--ts)">Puntualidad</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--ts);font-size:12px">Sin conexiones registradas aún</td></tr>'}</tbody>
      ${resto.length ? `<tbody id="cnx-resto" data-vis="${vis}" hidden>${resto.map(fila).join('')}</tbody>` : ''}
    </table>
    ${resto.length ? `<button type="button" class="cnx-mas" aria-expanded="false" aria-controls="cnx-resto"
      onclick="_cnxMas(this)">ver los ${orden.length}</button>` : ''}
  </div>`;
}
// [RES-2] El resto de las conexiones va en un SEGUNDO <tbody>, no en un
// <details>: un <details> no puede envolver <tr> sin romper la tabla, y dos
// tablas apiladas pierden la alineación de columnas. Dos tbody en la misma
// tabla la conservan.
function _cnxMas(btn) {
  const t = document.getElementById('cnx-resto');
  if (!t) return;
  const abrir = t.hidden;
  t.hidden = !abrir;
  btn.setAttribute('aria-expanded', String(abrir));
  btn.textContent = abrir ? 'ver menos' : ('ver los ' + (t.rows.length + (parseInt(t.dataset.vis, 10) || 0)));
}
async function _conexHistorial(uid, nombre) {
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-conexiones', { method: 'POST', body: JSON.stringify({ accion: 'historial', usuario_id: uid }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { showToast('No se pudo cargar el historial', 'error'); return; }
    const tol = j.tolerancia_min || 15;
    const dias = Array.isArray(j.dias) ? j.dias : [];
    const filas = dias.length ? dias.map((d) => {
      const puntual = d.primera_min != null && d.primera_min <= (9 * 60 + tol);
      const dow = new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short' });
      return `<tr style="border-top:1px solid var(--border)">
        <td style="padding:3px 4px;font-size:12px">${_esfEsc(d.fecha)} <span style="color:var(--ts);font-size:10px;text-transform:capitalize">${_esfEsc(dow)}</span></td>
        <td style="padding:3px 4px;text-align:right;font-size:13px;color:${puntual ? 'var(--green)' : 'var(--orange)'};font-weight:700">${_esfEsc(d.primera)}${puntual ? ' ✓' : ''}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="2" style="padding:12px;text-align:center;color:var(--ts);font-size:12px">Sin conexiones en los últimos 14 días</td></tr>';
    const cont = document.getElementById('_conexHistBody');
    const titEl = document.getElementById('_conexHistTitulo');
    if (titEl) titEl.textContent = 'Conexiones · ' + (nombre || '');
    if (cont) cont.innerHTML = `<div style="font-size:10px;color:var(--ts);margin-bottom:8px">Primera conexión por día (hora Monterrey) · últimos 14 días · entrada 09:00 (tol. ${tol} min)</div>
      <table style="width:100%;border-collapse:collapse"><tbody>${filas}</tbody></table>`;
    openModal('modal-conex-hist');
  } catch (e) { showToast(e.message || 'Error', 'error'); }
}
async function loadResumen() {
  _loadAlertasHome();       // [RES-1] lo que pide atención, arriba de todo (solo Memo; fails-soft)
  _renderAtajosHome();      // [E5-5] atajos del home, filtrados por _puedeVerTab
  _loadConexiones();        // 🕘 tablero de conexiones (solo Memo; fails-soft)
  _loadRadarHome();         // [RES-4] el monitoreo del sitio (solo Memo; fails-soft)
  const atrEl  = document.getElementById('atrasados-lista');
  if (atrEl)  atrEl.innerHTML  = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';

  try {
    const { activos, cancelados, capHit } = await _cobCargarTodo(true);  // siempre fresco al entrar

    // [AUD-1c] LAS 5 MÉTRICAS SALEN DE LA FUENTE ÚNICA, no de un reduce propio.
    //
    // Antes se calculaban aquí sobre `activos` —solo el Portal—, así que con
    // melanie decían cobrado $0, facturado $0, 0 viajeros y 0 eventos, y la
    // "utilidad" era facturado(Portal) − gastos(TODOS): los gastos de un mundo
    // restados a las ventas de otro. Un cero es una afirmación, y ésa era falsa.
    //
    // Si la cuenta no llega (fails-soft del endpoint), se cae al cálculo viejo
    // ANTES que dejar la pantalla en blanco — pero se DICE, con su aviso.
    const util = await _utilCargar(true);
    const cta = util && util.cuenta ? util.cuenta.totales : null;
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const { total: totalGastos } = await _cobCargarGastos(true);

    // `porCobrar` lo consume _renderResumenDinero más abajo (la franja del
    // dinero). Al meter el cálculo viejo dentro del `else` lo dejé fuera de
    // alcance y la franja tronaba con "porCobrar is not defined" — un error que
    // la pantalla atrapaba y pintaba en rojo, sin llegar a `pageerror`. Se
    // declara ARRIBA, con el valor de la fuente que toque.
    let utilidad, porCobrar;
    if (cta) {
      setTxt('m-cobrado',   _spFmtMxn(cta.ventas));
      setTxt('m-facturado', _spFmtMxn(cta.facturado));
      setTxt('m-viajeros',  String(cta.viajeros == null ? '—' : cta.viajeros));
      setTxt('m-eventos',   String(cta.eventos_con_movimiento));
      // El signo, dicho con palabras (patrón CAP-FIX-2d): un "Por cobrar −$793"
      // se lee al revés de lo que significa.
      const pend = Number(cta.pendiente || 0);
      porCobrar = pend;
      setTxt('m-porcobrar', _spFmtMxn(Math.abs(pend)));
      const lblPc = document.getElementById('m-porcobrar-lbl');
      if (lblPc) lblPc.textContent = pend < 0 ? 'A favor' : 'Por cobrar';
      // [UTIL-C-3] Los gastos que se pintan son los de TODA la empresa: los de
      // los eventos más los generales. Antes decían solo los de eventos, y la
      // tabla de abajo sumaba los generales — dos cifras de "gastos" en la
      // misma pantalla.
      setTxt('m-gastos', _spFmtMxn(Number(cta.gastos || 0) + Number(cta.gastos_sin_evento || 0)));
      // [UTIL-C-3] Y la utilidad es `ganancia_empresa`, LEÍDA del servidor:
      // Σ utilidades por evento − gastos sin evento. Antes esta línea pintaba
      // `cta.ganancia` (solo eventos) mientras la tabla de abajo restaba los
      // generales por su cuenta. Con cero gastos generales daban igual; con el
      // primero se habrían separado en silencio.
      utilidad = (cta.ganancia_empresa === undefined) ? Number(cta.ganancia || 0) : cta.ganancia_empresa;
    } else {
      // Cálculo viejo, Portal-puro, y se avisa de que lo es.
      const cobrado   = activos.reduce((a, t) => a + Number((t.pago || {}).abonado  || 0), 0);
      porCobrar       = activos.reduce((a, t) => a + Number((t.pago || {}).restante || 0), 0);
      const facturado = activos.reduce((a, t) => a + Number((t.pago || {}).total    || 0), 0);
      setTxt('m-cobrado',   _spFmtMxn(cobrado));
      setTxt('m-porcobrar', _spFmtMxn(porCobrar));
      setTxt('m-facturado', _spFmtMxn(facturado));
      setTxt('m-viajeros',  String(activos.length));
      setTxt('m-eventos',   String(new Set(activos.map(t => t.evento_id)).size));
      setTxt('m-gastos', _spFmtMxn(totalGastos));
      // [UTIL-C-2] AQUÍ HABÍA UNA FÓRMULA PROPIA: `facturado − totalGastos`.
      // Era el "cálculo viejo, Portal-puro" del que la pantalla avisaba, y bajo
      // la fórmula A se parecía bastante al número bueno. Bajo C ya no se
      // parece a nada: le falta la inversión en boletos (que vive en KH, no en
      // el Portal) y encima arranca de lo VENDIDO en vez de lo cobrado. Con
      // `calle24` habría pintado +$46,700 donde la verdad es −$28,720.
      //
      // Una pantalla que no puede saber la utilidad tiene que DECIR que no la
      // sabe. `null` viaja hasta `_audUtilidadPintar`, que ya sabe pintar el
      // desconocido — un cero, o peor, un número plausible, es una afirmación.
      utilidad = null;
    }
    _audUtilidadPintar(utilidad, cta, util);

    const aviso = document.getElementById('resumen-cap-aviso');
    if (aviso) {
      if (capHit) {
        aviso.textContent = 'Mostrando los primeros 300 tours activos — los totales podrían estar incompletos. (Pendiente: paginación cuando se superen 300.)';
        aviso.style.display = '';
      } else {
        aviso.style.display = 'none';
      }
    }

    const ev = await _fetchEVFromIndex();
    // 1) Primero lo que NO depende de la utilidad, para que aparezca rápido:
    //    Franja 3 (atrasados) + Franja 1 (dinero — prioridad #1, no debe esperar).
    _renderResumenAtrasados(activos, cancelados);
    _renderResumenRiesgoBaja(activos);
    _renderResumenDinero(porCobrar);  // reusa el porCobrar ya calculado (= m-porcobrar)
    // [E5-2] La deuda va con la cuenta que ya se cargó arriba (`cta` viene de
    // _utilCargar). No dispara una llamada nueva: se pinta con lo que ya llegó.
    _renderResumenDeuda(util && util.cuenta ? util.cuenta : null);
    // 2) Carga la utilidad UNA sola vez (compartida, fresca). Best-effort: si falla,
    //    _utilG3Cache queda null → salud neutra y lo de abajo igual pinta.
    await _utilCargar(true);
    // 3) Ya con la cache lista: la tabla de ganancia por evento.
    _renderResumenUtilidad(ev);
  } catch (e) {
    // [FLUJO-UX-1] Antes esto vaciaba el contenedor y NO DECÍA NADA. El Resumen
    // es la pantalla de aterrizaje: al fallar, sus tarjetas se quedaban en cero
    // y un cero aquí no es «no hay», es «no cargó» — la lección de AUD-1, donde
    // «Cobrado $0» con $136,391 cobrados no era un dato que faltaba sino uno
    // falso. Ahora lo dice, con el nombre de lo que falló y con reintento.
    khErrorCarga(atrEl, 'el Resumen', 'loadResumen', e);
  }
}
async function _saldosCargar(force) {
  if (_resumenSaldosCache && !force) return _resumenSaldosCache;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-saldos', {
      method: 'POST', headers: _spAdminHeaders(), body: JSON.stringify({}),
    });
    const d = await r.json();
    if (!r.ok || d.ok === false) throw new Error(d.error || 'No se pudieron cargar los saldos');
    _resumenSaldosCache = d;
    return _resumenSaldosCache;
  } catch (e) {
    return null;
  }
}
function _renderResumenDeuda(cuenta) {
  const cont = document.getElementById('resumen-deuda');
  if (!cont) return;
  const puede = !!(currentUser && RESUMEN_DEUDA_ROLES.includes(currentUser.rol));
  const tot = (cuenta && cuenta.totales) || null;
  if (!puede || !tot || tot.deuda_proveedores == null) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
  const deuda = Number(tot.deuda_proveedores) || 0;
  cont.style.display = '';
  // [RES-3] Mismo tamaño que sus dos hermanas, y el TEXTO SELLADO se queda:
  // es la frase que impide que alguien "corrija" la ganancia restándole la
  // deuda, que es otra cosa y es falsa.
  cont.className = 'res-big dash-click';
  cont.setAttribute('onclick', "showPage('kamisama')");
  cont.setAttribute('title', 'Ver el stock y las compras');
  cont.innerHTML = `
    <div class="metric-label">Deuda de boletos</div>
    <div class="res-big-val" style="color:var(--orange)">${_spFmtMxn(deuda)}</div>
    <div class="metric-sub">Compras + servicios − abonos · <b>no se resta</b> de la ganancia</div>`;
}
// [RES-3] Esta función pinta AHORA EN DOS SITIOS con UNA sola lectura: el
// número grande de la caja va arriba, con los otros dos de Memo, y el desglose
// por cuenta se queda abajo, en "el resto". No se pide `_saldosCargar` dos
// veces ni se recalcula nada: es el mismo `d`, repartido.
async function _renderResumenDinero(porCobrar) {
  const cont = document.getElementById('resumen-dinero');
  const heroEl = document.getElementById('resumen-caja');
  if (!cont) return;
  const d = await _saldosCargar(true);  // fresco al entrar al Resumen
  if (!d) {
    if (heroEl) { heroEl.style.display = 'none'; heroEl.innerHTML = ''; }
    cont.style.display = '';
    cont.innerHTML = '<div style="font-size:12px;color:var(--ts);padding:10px 0">No se pudo cargar el dinero (saldos).</div>';
    return;
  }
  const cuentas = d.cuentas || {};
  const orden = ['BBVA', 'Banamex', 'Efectivo'];
  const otros = Number(d.otros_total || 0);
  // [E5-1] La caja total la DICE la fuente (`admin-saldos.caja_total`). Aquí
  // vivía un `reduce` sobre las tres cuentas + otros: una fórmula de dinero
  // naciendo en la pantalla, que es como empezaron las once de AUD-1. El día
  // que el servidor reconozca una cuarta cuenta, esta línea no se entera —
  // ahora sí, porque no cuenta nada: imprime lo que le mandan.
  const cajaTotal = Number(d.caja_total || 0);

  // stat de cuenta → navega a Saldos (click-through).
  const stat = (lbl, val) => {
    const color = Number(val) < 0 ? 'var(--red)' : '';
    return `<div class="cob-stat dash-click" onclick="showPage('saldos')" title="Ver Saldos"><div class="cob-stat-lbl">${lbl}</div><div class="cob-stat-val" style="${color ? 'color:' + color : ''}">${_spFmtMxn(Number(val || 0))}</div></div>`;
  };
  const cuentasHTML = orden.map(n => stat(n, (cuentas[n] || {}).saldo || 0)).join('') +
    // [AUD-1c] El signo, en palabras también aquí: con el neto de los dos mundos
    // este número puede salir negativo, y "Por cobrar −$793" se lee al revés.
    `<div class="cob-stat dash-click" onclick="showPage('pagos')" title="Ver cobranza"><div class="cob-stat-lbl">${Number(porCobrar || 0) < 0 ? 'A favor' : 'Por cobrar'}</div><div class="cob-stat-val" style="color:var(--orange)">${_spFmtMxn(Math.abs(Number(porCobrar || 0)))}</div></div>` +
    (otros !== 0 ? stat('Otros (sin cuenta)', otros) : '');

  const heroColor = cajaTotal < 0 ? 'var(--red)' : 'var(--green)';
  if (heroEl) {
    heroEl.style.display = '';
    heroEl.className = 'res-big dash-click';
    heroEl.setAttribute('onclick', "showPage('saldos')");
    heroEl.setAttribute('title', 'Ver Saldos');
    heroEl.innerHTML = `
      <div class="metric-label">Caja total de la empresa</div>
      <div class="res-big-val" style="color:${heroColor}">${_spFmtMxn(cajaTotal)}</div>
      <div class="metric-sub">Lo que hay hoy, sumando cuentas</div>`;
  }
  cont.style.display = '';
  cont.innerHTML = `<div class="cob-stats" style="margin-bottom:0">${cuentasHTML}</div>`;
}
async function _renderResumenUtilidad(ev) {
  const cont = document.getElementById('resumen-utilidad-tabla');
  if (!cont) return;
  const util = await _utilCargar();  // usa la cache que loadResumen ya cargó (sin doble fetch)
  if (!util) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--ts)">No se pudo cargar la utilidad por evento.</div>';
    return;
  }
  // baseSlug (e.id) -> { nombre, fecha, ds } desde EV (patrón _gastosEVMap).
  const evMap = {};
  // [MER-1] `pasado` se resuelve con el EVENTO ENTERO, no con `r.ds`: la fila
  // solo guarda la primera fecha, y en un multifecha ésa miente (ver
  // _mermaUltimaFecha). Se decide aquí, donde todavía se tiene el objeto.
  (ev || []).forEach(e => { if (e && e.id) evMap[e.id] = { nombre: e.a || e.id, fecha: e.f || '', ds: e.ds || '', pasado: _mermaPasado(e) }; });
  const evs = util.eventos || {};
  // [AUD-1d] LAS FILAS SALEN DE LA CUENTA VERDADERA, no de la caja.
  //
  // Esta tabla leía `util.eventos`, que es la caja Portal-pura: con melanie
  // decía cobrado $0 y caja −$147,172, y por eso llevaba un letrero avisando de
  // lo que omitía. Ya no omite, así que el letrero también se va.
  //
  // Si la cuenta no llegó (fails-soft del endpoint), se cae a la caja de antes
  // ANTES que dejar la tabla vacía — pero las columnas lo dicen.
  const cta = util.cuenta && util.cuenta.eventos ? util.cuenta.eventos : null;
  const fuente = cta || evs;
  _resumenUtilConCuenta = !!cta;
  // [E5-3] El total de deuda lo DICE la fuente (`totales.deuda_proveedores`,
  // que agregó E5-2). No se acumula aquí: la fila Total suma las demás columnas
  // porque esa aritmética de presentación ya existía, pero una suma de dinero
  // NUEVA en pantalla es justo lo que esta etapa vino a no hacer.
  _resumenUtilDeudaTotal = (util.cuenta && util.cuenta.totales && util.cuenta.totales.deuda_proveedores != null)
    ? Number(util.cuenta.totales.deuda_proveedores) : null;
  _resumenUtilRows = Object.keys(fuente).map(slug => {
    const d = fuente[slug] || {};
    const meta = evMap[slug];
    const m = meta || { nombre: slug, fecha: '', ds: '', pasado: false };
    const ventas = Number((cta ? d.ventas : d.cobrado) || 0);
    const facturado = Number((cta ? d.facturado : d.vendido) || 0);
    const gastos = Number(d.gastos || 0);
    const ganancia = cta ? Number(d.ganancia || 0) : (Number(d.caja || 0));
    const bod = (cta && d.bodega) ? d.bodega : null;
    return {
      slug, nombre: m.nombre, fecha: m.fecha, ds: m.ds || '',
      desconocido: !meta,                     // typo de captura: slug que no existe en el EV
      ventas, facturado, gastos, ganancia,
      // [E5-3] La deuda a proveedores de ESE evento, tal como la manda la lib.
      // Va como una columna más, ROTULADA APARTE: no entra en `ganancia` ni se
      // resta de nada. La caja vieja (`evs`) no la conoce, y ahí sale null —
      // que se pinta como "—", no como cero: un cero diría "no debe nada".
      deuda: cta ? Number(d.deuda_proveedores || 0) : null,
      // [UTIL-C-4] Lo vendido que falta por cobrar, LEÍDO de la lib (`pendiente`)
      // y no restado aquí de dos columnas: la pantalla no saca sus propias
      // cuentas. La caja vieja no lo conoce y ahí va null — que no es cero.
      por_cobrar: cta ? (d.pendiente == null ? null : Number(d.pendiente)) : null,
      bodega_boletos: bod ? bod.boletos : null,
      bodega_valor: bod ? bod.valor_estimado : null,
      // [MER-1] `pasado` sale del catálogo (evMap) y NO del servidor: es el mismo
      // reloj que clasificó la lista que se le mandó, así que las dos puntas
      // coinciden por construcción. Un evento que el catálogo no conoce
      // (`desconocido`) NO se declara pasado: sin fecha no hay afirmación.
      pasado: !!m.pasado,
      merma_boletos: bod ? bod.boletos : null,
      merma_costo: bod ? bod.costo_hundido : null,
      pct: facturado > 0 ? (ventas / facturado) : 0,
    };
  });
  // [AUD-1d] Con la cuenta nueva, "sin evento" son solo los gastos General.
  _resumenUtilSin = cta
    ? ((util.cuenta.sin_evento && Number(util.cuenta.sin_evento.gastos)) ? { gastos: Number(util.cuenta.sin_evento.gastos) } : null)
    : (util.sin_evento || null);
  // [UTIL-C-3] La utilidad de la empresa, del servidor. Sin la cuenta nueva
  // (camino viejo) se queda en null y la tabla usa su respaldo local.
  const _tt = cta && util.cuenta ? util.cuenta.totales : null;
  _resumenUtilGananciaEmpresa = (_tt && _tt.ganancia_empresa != null) ? Number(_tt.ganancia_empresa) : null;
  _resumenUtilPintar();
}
// [AUD-1d] Semáforo de salud, sobre la GANANCIA (no la caja):
//   verde  = ya ganas
//   ámbar  = todavía no, pero la bodega alcanza para darle la vuelta
//   rojo   = ni vendiendo todo lo que queda
// Sin bodega conocida no se puede afirmar el ámbar: una ganancia negativa sin
// saber qué queda por vender es roja hasta que se demuestre lo contrario.
//
// [MER-1] Y en un evento YA PASADO el ámbar deja de existir: el ámbar dice "la
// bodega alcanza para darle la vuelta", y en un concierto que ya ocurrió no hay
// bodega que dé vuelta a nada. Ganancia negativa + evento pasado = ROJO, sin
// consultar la bodega. Positivo sigue verde, pasado o no: ganar ya se ganó.
// [UTIL-C-4] EL ÁMBAR SE MIDE COMO EL PANEL DE ESCENARIOS, no de otra forma.
//
// Le faltaba un término entero: **lo que ya está vendido y no se ha cobrado**.
// Preguntaba "¿alcanza con vender lo que queda?" e ignoraba los contratos
// firmados sin pagar, así que pintaba ROJO eventos que solo tenían que cobrar.
// Con calle24: −$28,720 + $0 de bodega = rojo… teniendo $23,100 contratados por
// cobrar y apenas $5,620 de faltante real.
//
// Ahora usa las MISMAS dos palancas que los escenarios (b) y (c) de Kamisama
// —cobrar lo vendido y vender lo que queda— para que las dos pantallas no
// puedan decir cosas distintas del mismo evento.
//
// La bodega sigue apareciendo aquí y NO contradice a "la bodega es
// información": esto es una PROYECCIÓN rotulada ("todavía puede"), no una cifra
// que compense a la utilidad. Lo que se retiró en esta misma tuerca fue sumarla
// A LA UTILIDAD; usarla para decir si el rojo tiene salida es su papel.
function _resumenUtilSemaforo(ganancia, bodegaValor, pasado, porCobrar) {
  if (Number(ganancia) >= 0) return 'var(--green)';
  const pc = Number(porCobrar) || 0;
  // Un evento pasado ya no vende, pero SÍ puede cobrar: los contratos no se
  // vencen porque el concierto haya ocurrido.
  if (Number(ganancia) + pc >= 0) return 'var(--gold)';
  if (pasado) return 'var(--red)';
  const b = Number(bodegaValor);
  if (Number.isFinite(b) && (Number(ganancia) + pc + b) >= 0) return 'var(--gold)';
  return 'var(--red)';
}
// El texto del semáforo, junto a su color para que no puedan divergir.
function _resumenUtilSemaforoTitulo(r) {
  if (Number(r.ganancia) >= 0) return 'Ya gana';
  const pc = Number(r.por_cobrar) || 0;
  if (Number(r.ganancia) + pc >= 0) return 'Todavía no, pero con cobrar lo que ya vendiste alcanza';
  if (r.pasado) return 'El evento ya pasó y ni cobrando todo alcanza: no queda nada por vender';
  return (Number.isFinite(Number(r.bodega_valor)) && r.ganancia + pc + Number(r.bodega_valor) >= 0)
    ? 'Todavía no: hay que cobrar lo vendido Y vender parte de lo que queda'
    : 'Ni cobrando todo y vendiendo lo que queda';
}
function _resumenUtilMxnCell(v, align) {
  const col = (Number(v) < 0) ? 'var(--red)' : '';
  return `<td style="text-align:${align || 'right'};font-variant-numeric:tabular-nums;${col ? 'color:' + col : ''}">${_spFmtMxn(Number(v || 0))}</td>`;
}
function _resumenUtilPintar() {
  const cont = document.getElementById('resumen-utilidad-tabla');
  if (!cont) return;
  const rows = _resumenUtilRows.slice();
  if (!rows.length && !_resumenUtilSin) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--ts)">Sin datos de utilidad por evento todavía.</div>';
    return;
  }

  // [AUD-1d] GANANCIA acumulada: running-sum de ganancia en orden CRONOLÓGICO,
  // SOLO sobre filas con fecha (ds). Los desconocidos / sin fecha NO entran al
  // acumulado → su celda va "—". (Antes acumulaba caja, y el encabezado se
  // quedó diciendo "Caja acum." cuando la suma ya era otra: lo cazó el arnés.)
  const acum = {};
  let run = 0;
  rows.filter(r => r.ds).sort((a, b) => String(a.ds).localeCompare(String(b.ds))).forEach(r => { run += r.ganancia; acum[r.slug] = run; });

  // Orden de 2 niveles: primario los DESCONOCIDOS siempre al final; secundario la
  // columna elegida (la columna 'fecha' ordena por ds).
  const s = _resumenUtilSort;
  const key = (r) => (s.col === 'fecha') ? r.ds : r[s.col];
  rows.sort((a, b) => {
    const da = a.desconocido ? 1 : 0, db = b.desconocido ? 1 : 0;
    if (da !== db) return da - db;            // conocidos primero, desconocidos al final
    const ka = key(a), kb = key(b);
    let c;
    if (typeof ka === 'number' && typeof kb === 'number') c = ka - kb;
    else c = String(ka).localeCompare(String(kb));
    return s.dir === 'asc' ? c : -c;
  });

  // [AUD-1d] Las columnas de la CUENTA, no las de la caja. Memo no usa el CSV
  // (lo confirmó), así que no hay compatibilidad que cuidar y las columnas
  // dicen lo que de verdad importa.
  const COLS = [
    { k: 'nombre', lbl: 'Evento', num: false },
    { k: 'fecha',  lbl: 'Fecha',  num: false },
    { k: 'facturado', lbl: 'Facturado', num: true },
    { k: 'ventas', lbl: 'Ventas', num: true },
    { k: 'gastos', lbl: 'Gastos', num: true },
    { k: 'ganancia', lbl: 'Ganancia', num: true },
    { k: 'bodega_valor', lbl: 'Bodega', num: true },
    // [E5-3] La deuda, en su propia columna. Al lado de la ganancia, jamás
    // dentro: es dinero comprometido con los proveedores, no una merma de lo
    // ganado. Ver la nota de _renderResumenDeuda.
    { k: 'deuda', lbl: 'Deuda prov.', num: true },
    { k: 'pct', lbl: '% cob', num: true },
  ];
  const arrow = (k) => (s.col === k || (k === 'fecha' && s.col === 'fecha')) ? (s.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const thStyle = 'padding:7px 8px;border-bottom:1px solid var(--border);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ts);white-space:nowrap;cursor:pointer';
  const head = COLS.map(c =>
    `<th style="${thStyle};text-align:${c.num ? 'right' : 'left'}" onclick="_resumenUtilSortBy('${c.k}')">${c.lbl}${arrow(c.k)}</th>`
  ).join('') +
    `<th style="${thStyle};text-align:center;cursor:default">Salud</th>` +
    `<th style="${thStyle};text-align:right;cursor:default">Ganancia acum.</th>`;

  const acumCell = (r) => (r.slug in acum)
    ? _resumenUtilMxnCell(acum[r.slug])
    : '<td style="text-align:right;color:var(--ts)">—</td>';
  const marcaDesc = '<span style="color:var(--orange);font-size:10px;font-weight:700;white-space:nowrap"> <svg class="ic"><use href="#ic-alerta"/></svg> evento desconocido</span>';

  // La bodega: boletos ≈ valor. Sin valor conocido NO se pinta un cero.
  // [MER-1] En un evento pasado la misma celda cambia de cara: deja de decir lo
  // que se puede cobrar y dice lo que se perdió, en COSTO y rotulado "merma".
  const bodCell = (r) => {
    if (r.pasado) {
      if (r.merma_costo == null) {
        return `<td style="text-align:right;color:var(--ts)" title="${r.merma_boletos == null ? 'No se pudo leer el inventario' : 'Sin costo capturado en las compras'}">${r.merma_boletos == null ? '—' : 'merma ' + r.merma_boletos + ' bol.'}</td>`;
      }
      // La palabra "merma" va IMPRESA, no solo en el `title`: una columna que
      // cambia de significado por renglón tiene que decirlo donde se ve. El
      // título de la columna sigue siendo "Bodega" porque para la mayoría de los
      // renglones eso es lo que es.
      return `<td class="mer1-merma" style="text-align:right;font-variant-numeric:tabular-nums" title="Merma: ${r.merma_boletos} boleto${r.merma_boletos === 1 ? '' : 's'} sin vender · el costo ya se pagó">merma ${_spFmtMxn(r.merma_costo)}</td>`;
    }
    if (r.bodega_valor == null) {
      return `<td style="text-align:right;color:var(--ts)" title="${r.bodega_boletos == null ? 'No se pudo leer el inventario' : 'Sin precio en el catálogo'}">${r.bodega_boletos == null ? '—' : r.bodega_boletos + ' bol.'}</td>`;
    }
    return `<td style="text-align:right;font-variant-numeric:tabular-nums" title="${r.bodega_boletos} boletos por vender, a precio de hoy (estimado)">${_spFmtMxn(r.bodega_valor)}</td>`;
  };
  const fila = (r) => {
    const sem = _resumenUtilSemaforo(r.ganancia, r.bodega_valor, r.pasado, r.por_cobrar);
    const semTitle = _resumenUtilSemaforoTitulo(r);
    // Desconocido: NO clickable (no hay a dónde ir); conocidos siguen → Por evento.
    const rowAttrs = r.desconocido ? '' : ` class="dash-click" onclick="_evtIrA('${r.slug}')" title="Ver en Por evento"`;
    return `<tr${rowAttrs} style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px;font-weight:600;white-space:nowrap">${_spEscape(r.nombre)}${r.desconocido ? marcaDesc : ''}</td>
      <td style="padding:6px 8px;font-size:11px;color:var(--ts);white-space:nowrap">${_spEscape(r.fecha || '—')}</td>
      ${_resumenUtilMxnCell(r.facturado)}${_resumenUtilMxnCell(r.ventas)}${_resumenUtilMxnCell(r.gastos)}${_resumenUtilMxnCell(r.ganancia)}${bodCell(r)}
      ${r.deuda == null
        ? '<td style="text-align:right;color:var(--ts)" title="La caja Portal-pura no conoce la deuda">—</td>'
        : `<td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--orange)" title="Compras + servicios − abonos. No se resta de la ganancia.">${_spFmtMxn(r.deuda)}</td>`}
      <td style="text-align:right;font-variant-numeric:tabular-nums">${Math.round(r.pct * 100)}%</td>
      <td style="text-align:center"><span title="${semTitle}" style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${sem}"></span></td>
      ${acumCell(r)}
    </tr>`;
  };

  // Fila "Sin evento" (dinero real sin evento_id), separada antes de totales.
  let sinFila = '';
  let totVentas = 0, totFact = 0, totGas = 0, totGan = 0, totBod = 0, totBodOk = false;
  // [MER-1] Los dos montones se totalizan APARTE. Sumarlos daría un número que
  // no significa nada: la mitad se puede cobrar y la otra mitad ya se perdió.
  let totMerma = 0, totMermaOk = false;
  rows.forEach(r => {
    totFact += r.facturado; totVentas += r.ventas; totGas += r.gastos; totGan += r.ganancia;
    if (r.pasado) { if (r.merma_costo != null) { totMerma += Number(r.merma_costo); totMermaOk = true; } return; }
    if (r.bodega_valor != null) { totBod += Number(r.bodega_valor); totBodOk = true; }
  });
  // Sin merma, la celda es la de siempre — la misma llamada, no una copia: en un
  // universo sin eventos pasados esta tabla queda byte a byte como estaba.
  const totBodCell = totMermaOk
    ? `<td style="text-align:right;font-variant-numeric:tabular-nums">${totBodOk ? _spFmtMxn(totBod) : '<span style="color:var(--ts)">—</span>'}<div class="mer1-merma" style="font-weight:400;font-size:10px">merma ${_spFmtMxn(totMerma)}</div></td>`
    : (totBodOk ? _resumenUtilMxnCell(totBod) : '<td style="text-align:right;color:var(--ts)">—</td>');
  if (_resumenUtilSin) {
    // Sin evento: hoy solo GASTOS. No se le inventan ventas ni bodega — sus
    // celdas van vacías, no en cero.
    // [UTIL-C-3] La resta ya NO se hace aquí. `totGan` se toma del servidor
    // (`ganancia_empresa`) unas líneas abajo: esta línea era la fórmula número
    // doce, y encima la única de la pantalla que la hacía.
    const sinG = Number(_resumenUtilSin.gastos || 0);
    totGas += sinG;
    sinFila = `<tr style="border-bottom:1px solid var(--border);opacity:.85">
      <td style="padding:6px 8px;font-style:italic;color:var(--ts)">Sin evento</td>
      <td style="padding:6px 8px"></td>
      <td></td><td></td>
      ${_resumenUtilMxnCell(sinG)}
      ${_resumenUtilMxnCell(-sinG)}
      <td></td><td></td><td></td><td></td>
    </tr>`;
  }
  // [UTIL-C-3] El total de utilidad viene del servidor. La suma local se
  // conserva como RESPALDO —si el servidor no la mandó, la pantalla sigue
  // dando un número— y se CAREA: si las dos difieren, es que alguien volvió a
  // sacar su propia cuenta y hay que enterarse, no promediarlas.
  if (_resumenUtilGananciaEmpresa != null) {
    const local = totGan - (_resumenUtilSin ? Number(_resumenUtilSin.gastos || 0) : 0);
    if (Math.abs(local - _resumenUtilGananciaEmpresa) > 0.5) {
      console.warn('[UTIL-C-3] la utilidad local y la del servidor NO coinciden:', local, 'vs', _resumenUtilGananciaEmpresa);
    }
    totGan = _resumenUtilGananciaEmpresa;
  } else if (_resumenUtilSin) {
    totGan -= Number(_resumenUtilSin.gastos || 0);
  }
  const totPct = totFact > 0 ? Math.round(totVentas / totFact * 100) : 0;
  const totFila = `<tr style="border-top:2px solid var(--border);font-weight:800">
    <td style="padding:8px;text-transform:uppercase;font-size:11px;letter-spacing:.06em">Total</td>
    <td></td>
    ${_resumenUtilMxnCell(totFact)}${_resumenUtilMxnCell(totVentas)}${_resumenUtilMxnCell(totGas)}${_resumenUtilMxnCell(totGan)}
    ${totBodCell}
    ${_resumenUtilDeudaTotal == null
      ? '<td style="text-align:right;color:var(--ts)">—</td>'
      : `<td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--orange)" title="Deuda total a proveedores, según el servidor">${_spFmtMxn(_resumenUtilDeudaTotal)}</td>`}
    <td style="text-align:right">${totPct}%</td>
    <td></td><td></td>
  </tr>`;

  // Tabla (web ≥640px): HTML idéntico al de #144, solo envuelto en .util-table-view abajo.
  const tableHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:880px">
    <thead><tr>${head}</tr></thead>
    <tbody>${rows.map(fila).join('')}${sinFila}${totFila}</tbody>
  </table>`;

  // ── Vista de TARJETAS (móvil <640px) — MISMA data (rows/acum/totales), otra presentación ──
  const mny = _resumenUtilMxn;
  // [MER-1] La misma casilla de la tarjeta, con la misma regla que la celda de la
  // tabla: en evento pasado se rotula "Merma" y lleva el costo, no el precio.
  const bodCard = (r) => {
    if (r.pasado) {
      return `<div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">Merma</div><div class="mer1-merma" style="font-size:16px;font-weight:700">${r.merma_costo == null ? (r.merma_boletos == null ? '—' : r.merma_boletos + ' bol.') : _spFmtMxn(r.merma_costo)}</div></div>`;
    }
    return `<div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">Bodega</div><div style="font-size:16px;font-weight:700;color:var(--gold)">${r.bodega_valor == null ? (r.bodega_boletos == null ? '—' : r.bodega_boletos + ' bol.') : _spFmtMxn(r.bodega_valor)}</div></div>`;
  };
  const card = (r) => {
    const sem = _resumenUtilSemaforo(r.ganancia, r.bodega_valor, r.pasado, r.por_cobrar);
    const cardAttrs = r.desconocido ? '' : ` class="dash-click" onclick="_evtIrA('${r.slug}')" title="Ver en Por evento"`;
    return `<div${cardAttrs} style="background:var(--bg2);border:1px solid var(--border);border-left:4px solid ${sem};border-radius:var(--radius);padding:12px 14px;margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px">
        <div><div style="font-weight:700;font-size:14px">${_spEscape(r.nombre)}${r.desconocido ? marcaDesc : ''}</div><div style="font-size:11px;color:var(--ts)">${_spEscape(r.fecha || '—')}</div></div>
        <span style="display:inline-block;width:13px;height:13px;border-radius:50%;background:${sem};flex-shrink:0;margin-top:3px"></span>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">${r.ganancia < 0 ? 'Falta recuperar' : 'Ganancia'}</div><div style="font-family:'Zen Dots',sans-serif;font-size:19px;color:${r.ganancia < 0 ? 'var(--red)' : 'var(--green)'}">${_spFmtMxn(Math.abs(r.ganancia))}</div></div>
        <div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">Ventas</div><div style="font-size:16px;font-weight:700">${_spFmtMxn(r.ventas)}</div></div>
        ${r.deuda == null ? '' : `<div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ts)">Deuda prov.</div><div style="font-weight:700;color:var(--orange)">${_spFmtMxn(r.deuda)}</div></div>`}
        ${bodCard(r)}
      </div>
      <div style="display:flex;gap:6px 14px;flex-wrap:wrap;font-size:11px;color:var(--ts);border-top:1px solid var(--border);padding-top:8px">
        <span>Facturado ${mny(r.facturado)}</span><span>Gastos ${mny(r.gastos)}</span><span>% cob ${Math.round(r.pct * 100)}%</span><span>Ganancia acum ${(r.slug in acum) ? mny(acum[r.slug]) : '—'}</span>
      </div>
    </div>`;
  };
  // Tarjeta especial (Sin evento / Total): sin borde-semáforo, estilo distinto.
  const cardEsp = (titulo, dashed, gan, ventas, fact, gas, bod, merma) => {
    const pct = fact > 0 ? Math.round(ventas / fact * 100) : 0;
    return `<div style="background:var(--bg2);border:${dashed ? '1px dashed' : '2px solid'} var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px">
      <div style="text-transform:uppercase;font-size:11px;letter-spacing:.06em;font-weight:800;color:var(--ts);margin-bottom:10px">${_esfEsc(titulo)}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;color:var(--ts)">${gan < 0 ? 'Falta recuperar' : 'Ganancia'}</div><div style="font-family:'Zen Dots',sans-serif;font-size:18px;color:${gan < 0 ? 'var(--red)' : 'var(--green)'}">${_spFmtMxn(Math.abs(gan))}</div></div>
        <div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;color:var(--ts)">Ventas</div><div style="font-size:15px;font-weight:700">${_spFmtMxn(ventas)}</div></div>
        <div style="flex:1 1 92px"><div style="font-size:10px;text-transform:uppercase;color:var(--ts)">Bodega</div><div style="font-size:15px;font-weight:700;color:var(--gold)">${bod == null ? '—' : _spFmtMxn(bod)}</div>${merma == null ? '' : `<div class="mer1-merma" style="font-size:11px;font-weight:700">merma ${_spFmtMxn(merma)}</div>`}</div>
      </div>
      <div style="display:flex;gap:6px 14px;flex-wrap:wrap;font-size:11px;color:var(--ts);border-top:1px solid var(--border);padding-top:8px">
        <span>Facturado ${mny(fact)}</span><span>Gastos ${mny(gas)}</span><span>% cob ${pct}%</span>
      </div>
    </div>`;
  };
  const SORT_OPTS = [
    { v: 'fecha', l: 'Fecha' }, { v: 'ganancia', l: 'Ganancia' }, { v: 'ventas', l: 'Ventas' },
    { v: 'facturado', l: 'Facturado' }, { v: 'gastos', l: 'Gastos' },
    { v: 'bodega_valor', l: 'Bodega' }, { v: 'pct', l: '% cobrado' },
  ];
  const selCol = (s.col === 'ds') ? 'fecha' : s.col;  // el default 'ds' equivale a 'fecha' en el selector
  const selectorHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
    <label style="font-size:11px;color:var(--ts);white-space:nowrap">Ordenar por:</label>
    <select onchange="_resumenUtilSortBy(this.value)" style="flex:1;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:var(--r-sm,8px);padding:7px 9px;font-size:12px">
      ${SORT_OPTS.map(o => `<option value="${o.v}"${selCol === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}
    </select>
  </div>`;
  const sinG2 = _resumenUtilSin ? Number(_resumenUtilSin.gastos || 0) : 0;
  const sinCard = _resumenUtilSin ? cardEsp('Sin evento', true, -sinG2, 0, 0, sinG2, null) : '';
  const totCard = cardEsp('Total', false, totGan, totVentas, totFact, totGas, totBodOk ? totBod : null, totMermaOk ? totMerma : null);
  const cardsHTML = selectorHTML + rows.map(card).join('') + sinCard + totCard;

  cont.innerHTML = `<div class="util-table-view">${tableHTML}</div><div class="util-cards-view">${cardsHTML}</div>`;
}
function _resumenUtilSortBy(col) {
  const s = _resumenUtilSort;
  if (s.col === col) s.dir = (s.dir === 'asc' ? 'desc' : 'asc');
  else { s.col = col; s.dir = (col === 'nombre' || col === 'fecha') ? 'asc' : 'desc'; }
  _resumenUtilPintar();
}
// Export CSV (orden actual + Sin evento + Total). Patrón vanilla del repo.
function _resumenUtilCSV() {
  if (!_resumenUtilRows.length && !_resumenUtilSin) return;
  // [AUD-1d] Las columnas de la CUENTA. Memo confirmó que no usa este CSV, así
  // que no hay compatibilidad que cuidar: dice lo mismo que la tabla.
  // [MER-1] La bodega y la merma llevan COLUMNAS PROPIAS. Compartir una sola las
  // volvería a mezclar en la hoja de cálculo: quien sume esa columna estaría
  // sumando dinero por cobrar con dinero ya perdido. Cada renglón llena una de
  // las dos y deja la otra VACÍA (no en cero: un cero se suma, una celda vacía no).
  const head = ['Evento', 'Fecha', 'Facturado', 'Ventas', 'Gastos', 'Ganancia', 'Deuda_proveedores', 'Bodega_estimada', 'Bodega_boletos', 'Merma_costo_hundido', 'Merma_boletos', 'Pct_cobrado'];
  const cell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // Reusa el mismo orden visible.
  const rows = _resumenUtilRows.slice();
  const s = _resumenUtilSort;
  const key = (r) => (s.col === 'fecha') ? r.ds : r[s.col];
  rows.sort((a, b) => { const da = a.desconocido ? 1 : 0, db = b.desconocido ? 1 : 0; if (da !== db) return da - db; const ka = key(a), kb = key(b); let c = (typeof ka === 'number' && typeof kb === 'number') ? ka - kb : String(ka).localeCompare(String(kb)); return s.dir === 'asc' ? c : -c; });
  const lines = [head.map(cell).join(',')];
  let tf = 0, tv = 0, tg = 0, tgan = 0, tb = 0, tbOk = false, tm = 0, tmOk = false;
  rows.forEach(r => {
    tf += r.facturado; tv += r.ventas; tg += r.gastos; tgan += r.ganancia;
    if (r.pasado) { if (r.merma_costo != null) { tm += Number(r.merma_costo); tmOk = true; } }
    else if (r.bodega_valor != null) { tb += Number(r.bodega_valor); tbOk = true; }
    const nom = r.desconocido ? (r.nombre + ' (evento desconocido)') : r.nombre;
    // Celda vacía, NO cero, cuando la bodega no se pudo estimar: en una hoja de
    // cálculo un 0 se suma y una celda vacía no.
    lines.push([nom, r.fecha, r.facturado, r.ventas, r.gastos, r.ganancia,
                // [E5-3] La deuda va en su columna. Vacía —no cero— cuando no se
                // conoce: en una hoja de cálculo un 0 se suma y dice "no debe".
                r.deuda == null ? '' : r.deuda,
                (r.pasado || r.bodega_valor == null) ? '' : r.bodega_valor,
                (r.pasado || r.bodega_boletos == null) ? '' : r.bodega_boletos,
                (!r.pasado || r.merma_costo == null) ? '' : r.merma_costo,
                (!r.pasado || r.merma_boletos == null) ? '' : r.merma_boletos,
                Math.round(r.pct * 100) + '%'].map(cell).join(','));
  });
  if (_resumenUtilSin) {
    const xg = Number(_resumenUtilSin.gastos || 0);
    tg += xg;
    lines.push(['Sin evento', '', '', '', xg, -xg, '', '', '', '', '', ''].map(cell).join(','));
  }
  // [UTIL-C-4] El CSV se quedó fuera del arreglo de UTIL-C-3: seguía restando
  // los gastos generales POR SU CUENTA mientras la tabla ya los leía del
  // servidor. Dos totales de utilidad para los mismos renglones — la tabla en
  // pantalla y la hoja que se descarga— es exactamente la divergencia que la
  // serie vino a cerrar, y encima la peor de detectar: nadie carea un CSV
  // contra la pantalla de la que salió.
  if (_resumenUtilGananciaEmpresa != null) tgan = _resumenUtilGananciaEmpresa;
  else if (_resumenUtilSin) tgan -= Number(_resumenUtilSin.gastos || 0);
  // [E5-3] El total de deuda sale del SERVIDOR (_resumenUtilDeudaTotal), no de
  // sumar la columna: la misma regla que en la fila Total de la tabla.
  lines.push(['TOTAL', '', tf, tv, tg, tgan, _resumenUtilDeudaTotal == null ? '' : _resumenUtilDeudaTotal,
              tbOk ? tb : '', '', tmOk ? tm : '', '', tf > 0 ? Math.round(tv / tf * 100) + '%' : '0%'].map(cell).join(','));
  const csv = '\ufeff' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'utilidad-por-evento.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
// [RAD-1a] Pide la ventana al calendario, no se la inventa. Era la cuarta
// aritmética de la pantalla: `ahora − 14×24h` con `toISOString()`.
// Sigue siendo una RODANTE a propósito —la portada enseña «los últimos 14
// días», no «esta quincena»— pero ahora arranca a MEDIANOCHE DE REYNOSA, no a
// la hora en que abriste el panel.
function _radarHomeSince() {
  const hoy = _radCalHoy();
  return _radCalMasDias(hoy, -(RADAR_HOME_DIAS - 1)).toISOString();
}
// Barra proporcional al mayor, como la del Radar. El divisor nunca es 0.
function _rdhBarra(n, max) {
  const pct = Math.max(2, Math.round((Number(n) || 0) / Math.max(1, max) * 100));
  return `<span class="rdh-bar" style="width:${pct}%"></span>`;
}
function _rdhVistos(top) {
  if (!top.length) return '<div class="rdh-vacio">Sin visitas registradas en estos ' + RADAR_HOME_DIAS + ' días</div>';
  const max = Math.max(1, ...top.map(e => Number(e.sesiones) || 0));
  return top.map((e, i) => `<button type="button" class="rdh-row" onclick="_evtIrA('${_attrJs(e.evento_id || '')}')"
      title="Ver ${_esfEsc(e.nombre || e.evento_id || '')} en Por evento">
    <span class="rdh-pos">${i + 1}</span>
    <span class="rdh-nom">${_esfEsc(e.nombre || e.evento_id || '—')}${_rdhBarra(e.sesiones, max)}</span>
    <span class="rdh-n">${(Number(e.sesiones) || 0).toLocaleString('es-MX')}</span>
  </button>`).join('');
}
function _rdhVentas(vt) {
  if (!vt.length) return '<div class="rdh-vacio">Sin datos de ventas en estos ' + RADAR_HOME_DIAS + ' días</div>';
  return `<table class="rdh-tabla"><thead><tr>
      <th>Evento</th><th class="rdh-der">Visitas</th><th class="rdh-der">Ventas</th><th class="rdh-der">Conv.</th>
    </tr></thead><tbody>${vt.map(r => {
      // ⚠️ La conversión la CALCULA el endpoint (`conv`). No se recalcula aquí:
      // dos divisiones del mismo par en dos pantallas es como empezaron las
      // once fórmulas de dinero que AUD-1 tuvo que recoger.
      const conv = Number(r.conv);
      return `<tr class="rdh-clic" onclick="_evtIrA('${_attrJs(r.evento_id || '')}')" title="Ver en Por evento">
        <td class="rdh-nom2">${_esfEsc(r.evento_nombre || r.evento_id || '—')}</td>
        <td class="rdh-der">${(Number(r.visitas) || 0).toLocaleString('es-MX')}</td>
        <td class="rdh-der">${(Number(r.ventas) || 0).toLocaleString('es-MX')}</td>
        <td class="rdh-der ${Number.isFinite(conv) && conv > 0 ? 'rdh-conv' : ''}">${Number.isFinite(conv) ? conv.toFixed(1) + '%' : '—'}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}
async function _loadRadarHome() {
  const el = document.getElementById('resumen-radar');
  if (!el) return;
  if (!currentUser || currentUser.rol !== 'maestro_roshi') { el.style.display = 'none'; return; }
  const since = _radarHomeSince();
  // Fails-soft POR FUENTE, no en bloque: un `Promise.all` que rechaza dejaría
  // el panel entero vacío aunque la otra mitad hubiera contestado bien.
  const [met, vt] = await Promise.all([
    khRadar.mainMetrics(since).catch(() => null),
    khRadar.ventasTrafico({ since }).catch(() => []),
  ]);
  const top = ((met && met.top_vistos) || []).slice(0, RADAR_HOME_TOP);
  const ventas = (Array.isArray(vt) ? vt : []).slice(0, RADAR_HOME_TOP);
  if (!top.length && !ventas.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `<div class="card rdh-card">
    <div class="rdh-head">
      <span class="rdh-h">Radar · qué se está mirando</span>
      <span class="rdh-win">últimos ${RADAR_HOME_DIAS} días · <button type="button" class="rdh-ver" onclick="showPage('radar')">ver el Radar completo →</button></span>
    </div>
    <div class="rdh-cols">
      <div class="rdh-col">
        <div class="rdh-sub">Más vistos</div>
        ${_rdhVistos(top)}
      </div>
      <div class="rdh-col">
        <div class="rdh-sub">De visita a venta</div>
        ${_rdhVentas(ventas)}
      </div>
    </div>
  </div>`;
}
// [RES-4] Aquí vivían `_diasHasta` y `_renderResumenProximos`, que pintaban
// la tarjeta de "Próximos Eventos". Se van con ella: medido, `_diasHasta` no
// tenía otro consumidor y `_renderResumenProximos` se llamaba desde un solo
// sitio. Dejar código que ya no pinta nada es peor que borrarlo — pero se
// borra DESPUÉS de contar los usos, no antes.
// Días de atraso = hoy − fecha_esperada (ambos a mediodía para evitar bordes DST,
// como "próximos"). >=0; nunca negativo (los atrasados ya filtran fecha < hoy).
function _cobDiasAtraso(fechaISO) {
  if (!fechaISO) return 0;
  const hoy = Date.parse(_cobHoyISO() + 'T12:00:00');
  const f = Date.parse(String(fechaISO) + 'T12:00:00');
  if (isNaN(hoy) || isNaN(f)) return 0;
  return Math.max(0, Math.round((hoy - f) / 86400000));
}
// Atrasados (Franja 3 del dashboard): tours activos con pago vencido. Header de
// conteo en ámbar (N>0), días de atraso, evento, saldo y WhatsApp. Orden días DESC
// (más atrasado arriba). Máx 10 + "ver todos en Pagos". Fila clickable → Pagos
// (el botón WhatsApp hace stopPropagation para no navegar). Reusa la cobranza ya
// cargada (activos); no re-fetch.
function _renderResumenAtrasados(activos, cancelados) {
  const el = document.getElementById('atrasados-lista');
  if (!el) return;
  const atr = (activos || []).filter(_cobEsAtrasado)
    .map(t => ({ t, dias: _cobDiasAtraso(((t.pago || {}).proximo || {}).fecha_esperada) }))
    .sort((a, b) => b.dias - a.dias);  // más atrasado arriba
  const nCanc = (cancelados || []).length;
  const pie = nCanc ? `<div style="margin-top:12px;font-size:11px;color:var(--ts)">${nCanc} tour${nCanc === 1 ? '' : 's'} cancelado${nCanc === 1 ? '' : 's'} (no cuentan en los totales).</div>` : '';

  if (!atr.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div>Nadie atrasado — todos al corriente.</div>' + pie;
    return;
  }

  const N = atr.length;
  const header = `<div style="display:flex;align-items:center;gap:8px;color:var(--orange);font-weight:700;font-size:13px;margin-bottom:8px"><svg class="ic"><use href="#ic-alerta"/></svg> ${N} viajero${N === 1 ? '' : 's'} atrasado${N === 1 ? '' : 's'}</div>`;
  const LIMITE = 10;
  const visibles = atr.slice(0, LIMITE);

  const filas = visibles.map(({ t, dias }) => {
    const c = t.clientes || {};
    const pago = t.pago || {};
    const evL = _cobEventoLabel(t);
    const prox = pago.proximo;
    const wa = _cobWaHref(t);
    const waBtn = wa
      ? `<a class="btn btn-green btn-sm" href="${wa}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:11px;text-decoration:none">WhatsApp</a>`
      : `<span style="font-size:11px;color:var(--ts)">${_spEscape(c.celular || 's/tel')}</span>`;
    const venceTxt = prox ? ('Venció ' + _spEscape(prox.fecha_esperada)) : '';
    const diasTxt = `${dias} día${dias === 1 ? '' : 's'} de atraso`;
    return `
    <div class="dash-click" onclick="showPage('pagos')" title="Gestionar en Pagos" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-weight:600;font-size:14px">${_spEscape(c.nombre_completo || '—')}</div>
        <div style="font-size:11px"><span style="color:var(--orange);font-weight:700">${diasTxt}</span><span style="color:var(--ts)"> · ${_spEscape(evL.nombre)}${evL.fecha ? ' · ' + _spEscape(evL.fecha) : ''}${venceTxt ? ' · ' + venceTxt : ''}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;white-space:nowrap">
        <div style="text-align:right">
          <div style="font-size:13px;color:var(--orange)">${_spFmtMxn(pago.restante)}</div>
          <div style="font-size:10px;color:var(--ts)">saldo</div>
        </div>
        ${waBtn}
      </div>
    </div>`;
  }).join('');

  const verTodos = (N > LIMITE)
    ? `<div class="dash-click" onclick="showPage('pagos')" style="text-align:center;padding:10px 0;font-size:12px;color:var(--orange);font-weight:700">ver todos (${N}) en Pagos →</div>`
    : '';

  el.innerHTML = header + filas + verTodos + pie;
}
// En riesgo de baja (Nivel 3 morosidad): clientes con 3+ quincenas vencidas.
// Solo visibilidad — clickea al plan; NO da de baja ni manda correos (eso es
// humano en el modal). Reusa los mismos helpers y molde de fila que atrasados.
function _renderResumenRiesgoBaja(activos) {
  const card = document.getElementById('riesgo-baja-card');
  const el = document.getElementById('riesgo-baja-lista');
  if (!card || !el) return;
  const enRiesgo = (activos || [])
    .filter(t => Number((t.pago || {}).vencidos || 0) >= 3)
    .sort((a, b) => Number((b.pago||{}).vencidos||0) - Number((a.pago||{}).vencidos||0));
  if (!enRiesgo.length) { card.style.display = 'none'; el.innerHTML = ''; return; }
  card.style.display = '';
  const N = enRiesgo.length;
  const header = `<div style="display:flex;align-items:center;gap:8px;color:var(--red);font-weight:700;font-size:13px;margin-bottom:8px"><svg class="ic"><use href="#ic-alerta"/></svg> ${N} en riesgo de baja</div>`;
  const filas = enRiesgo.map(t => {
    const c = t.clientes || {};
    const pago = t.pago || {};
    const nv = Number(pago.vencidos || 0);
    const evL = _cobEventoLabel(t);
    const wa = _cobWaHref(t);
    const waBtn = wa
      ? `<a class="btn btn-green btn-sm" href="${wa}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:11px;text-decoration:none">WhatsApp</a>`
      : `<span style="font-size:11px;color:var(--ts)">${_spEscape(c.celular || 's/tel')}</span>`;
    return `
    <div class="dash-click" onclick="abrirPlanCobranza('${_spEscape(t.id)}')" title="Ver plan y decidir" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-weight:600;font-size:14px">${_spEscape(c.nombre_completo || '—')}</div>
        <div style="font-size:11px"><span style="color:var(--red);font-weight:700">${nv} quincena${nv===1?'':'s'} vencida${nv===1?'':'s'}</span><span style="color:var(--ts)"> · ${_spEscape(evL.nombre)}${evL.fecha ? ' · ' + _spEscape(evL.fecha) : ''}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;white-space:nowrap">
        <div style="text-align:right">
          <div style="font-size:13px;color:var(--red)">${_spFmtMxn(pago.restante)}</div>
          <div style="font-size:10px;color:var(--ts)">saldo</div>
        </div>
        ${waBtn}
      </div>
    </div>`;
  }).join('');
  el.innerHTML = header + filas;
}
function _evtIrA(slug) { _evtPendingSelect = slug || null; showPage('eventos'); }
// El desfase de la zona EN ESE INSTANTE (los husos con horario de verano no
// tienen UN desfase: tienen el de ese día). Se pregunta al motor de Intl, que
// es quien tiene la tabla, en vez de escribir un número.
function _radCalDesfase(instante) {
  const iso = new Date(instante).toLocaleString('sv-SE', { timeZone: RAD_TZ });
  return Date.parse(iso + 'Z') - new Date(instante).getTime();
}
// Las piezas del reloj de pared de Reynosa en ese instante.
function _radCalPartes(instante) {
  const s = new Date(instante).toLocaleString('sv-SE', { timeZone: RAD_TZ });
  const [f, h] = s.split(' ');
  const [y, m, d] = f.split('-').map(Number);
  return { y, m, d, hora: h, dow: new Date(f + 'T00:00:00Z').getUTCDay() };  // 0=dom
}
// El INSTANTE en que empieza ese día de pared en Reynosa.
// ⚠️ Dos pasadas: el desfase que aplica al resultado puede no ser el del punto
// de partida — es justo lo que pasa el día que cambia el horario.
function _radCalMedianoche(y, m, d) {
  const tentativa = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  let t = tentativa - _radCalDesfase(tentativa);
  t = tentativa - _radCalDesfase(t);
  return new Date(t);
}
function _radCalHoy() { const p = _radCalPartes(Date.now()); return _radCalMedianoche(p.y, p.m, p.d); }
// ⚠️ LA ARITMÉTICA DE DÍAS VA EN EL CALENDARIO, NO EN MILISEGUNDOS.
// Esto sumaba `n * 86400000` y lo cazó el careo contra Postgres en UN solo
// instante de los 18: el 15-mar-2027, el día después de que entra el horario
// de verano. Seis días de 24 horas hacia atrás desde el 15 caen una hora
// CORTOS —porque uno de esos días duró 23— y aterrizan a las 23:00 del día
// anterior: «últimos 7 días» arrancaba el 8 en vez del 9.
// Un día al año, invisible el resto. Sumando componentes de fecha en UTC (que
// no tiene horario de verano) y pidiendo después la medianoche de Reynosa, el
// salto es exacto siempre.
function _radCalMasDias(fecha, n) {
  const p = _radCalPartes(fecha.getTime());
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return _radCalMedianoche(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}