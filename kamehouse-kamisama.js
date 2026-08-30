// =============================================================================
// kamehouse-kamisama.js — Kami-sama, sacado del tronco (MONO-7)
// =============================================================================
// 45 funciones y 1,293 líneas: el panel del Palacio —compras a proveedores,
// liquidaciones y comisiones—. 51% de aislamiento; comparte 44 funciones, así
// que es la primera de la serie que deja una frontera ancha con el tronco.
//
// Mismas reglas: SOLO funciones, en el MISMO ORDEN, con su comentario pegado, y
// cero código de nivel superior — el estado global se queda en el tronco.
//
// Va ANTES del tronco por la regla del sentido único (ver MONO-2), y el careo
// exige ningún error NUEVO respecto a su BASE.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

// ── Palacio de Kamisama — Capa 1 ─────────────────────────────────────────────
// 1b: catálogo de Proveedores (admin-proveedores). 1c: compras por evento/zona
// (admin-compras). loadKamisama() se invoca desde loadPage().
function loadKamisama() {
  _kamProveedoresLoad();
  // [VEN-BORRA-1c] Queda UN populate. Llena el selector original (hoy oculto),
  // y un <select> no acepta un .value que no exista entre sus <option>: sin él
  // el mando no pegaría. Los otros dos se fueron con Comisiones y Liquidaciones.
  _kamPopulateEventos();
  _kmsPopulate();
  _kmsPaso(_kmsPasoActivo);
  _kmsVacios();
  _kmsMandoSticky();   // [KMS-6] el mando de una línea al desplazarse
}
async function _kmsPopulate() {
  const sel = document.getElementById('kms-evt');
  if (!sel) return;
  try {
    const ev = await _fetchEVFromIndex();
    _kmsEVCache = Array.isArray(ev) ? ev : [];
    _kmsPintaOpciones();
  } catch (_) { /* deja el placeholder */ }
}
function _kmsPintaOpciones() {
  const sel = document.getElementById('kms-evt');
  if (!sel) return;
  const elegido = sel.value;
  const q = _kmNorm(String((document.getElementById('kms-ebusca') || {}).value || '').trim());
  // [ORD-1] Antes era fecha ASCENDENTE a secas, que pone los PASADOS primero.
  // Ahora la regla compartida: próximos · sin fecha · pasados.
  const lista = _evOrdenarPorFecha(_kmsEVCache
    .filter((e) => e && e.id)
    .filter((e) => !q || _kmNorm(String(e.a || e.id)).includes(q) || _kmNorm(String(e.v || '')).includes(q)));
  sel.innerHTML = '<option value="">— Elige un evento —</option>' + lista
    .map((e) => `<option value="${_esfEsc(e.id)}">${_esfEsc(e.a || e.id)}${e.f ? ' · ' + _esfEsc(e.f) : ''}</option>`)
    .join('');
  // Se conserva lo elegido si el filtro no lo dejó fuera: filtrar no debe
  // deshacer la selección de quien ya estaba trabajando un evento.
  if (elegido && lista.some((e) => e.id === elegido)) sel.value = elegido;
  const vacio = document.getElementById('kms-ebusca-vacio');
  if (vacio) vacio.style.display = (q && !lista.length) ? '' : 'none';
}
function _kmsBuscarEvento() { _kmsPintaOpciones(); }
// La lista de fechas se lee del MISMO EV que el resto del Palacio, así que el
// 'slug#idx' que compone aquí es el mismo que compone Compras. Si se poblara
// distinto, dos partes del Palacio hablarían de eventos distintos — y eso es
// dinero.
function _kmsOnEvento() {
  const id = (document.getElementById('kms-evt') || {}).value || '';
  const fsel = document.getElementById('kms-fecha');
  const ev = _kmsEVCache.find((e) => e && e.id === id);
  if (fsel) {
    fsel.innerHTML = '';
    if (ev && Array.isArray(ev.multifecha) && ev.multifecha.length) {
      ev.multifecha.forEach((m, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = (m && m.lbl) ? m.lbl : ('Fecha ' + (i + 1));
        fsel.appendChild(o);
      });
      fsel.style.display = '';
    } else {
      fsel.style.display = 'none';
    }
  }
  _kmsAplicar();
}
function _kmsOnFecha() { _kmsAplicar(); }
// Escribe el evento en los tres selectores originales y dispara sus cargadores.
function _kmsAplicar() {
  const id = (document.getElementById('kms-evt') || {}).value || '';
  const fsel = document.getElementById('kms-fecha');
  const idx = (fsel && fsel.style.display !== 'none' && fsel.value !== '') ? fsel.value : '';

  // [VEN-BORRA-1c] El "espejo" de KMS-1 escribía en TRES selectores; quedan
  // Compras y su selector. Un espejo de uno ya no es un espejo, pero se
  // conserva la escritura POR VALOR: es lo que hace que el reorden de ORD-1 le
  // dé igual, y lo que se rompería si alguien lo cambiara por selectedIndex.
  const e = document.getElementById('kam-evt-sel');
  if (e) e.value = id;

  _kmsVacios();
  _kmsTableroLimpiar();
  // [KMS-SIMP-2] La cuenta del evento se pide aquí, donde ya se decide el
  // evento para todo lo demás. Fails-soft: si truena, el Palacio es el de antes.
  if (typeof _kmsCuentaCargar === 'function') { try { _kmsCuentaCargar(); } catch (_) {} }
  if (!id) {
    // Sin evento: se limpian los cuerpos para que no quede el del anterior.
    ['kam-compras'].forEach((k) => { const el = document.getElementById(k); if (el) el.innerHTML = ''; });
    return;
  }

  // ② compras, y con ellas el tablero.
  _kamComprasLoad();
}
// Estado vacío de cada sección — claro y en su lugar.
function _kmsVacios() {
  const hay = !!((document.getElementById('kms-evt') || {}).value);
  ['compras', 'com', 'liq'].forEach((k) => {
    const e = document.getElementById('kms-vacio-' + k);
    if (e) e.style.display = hay ? 'none' : '';
  });
}
function _kmsPaso(paso) {
  _kmsPasoActivo = paso;
  document.querySelectorAll('#kms-pasos .kms-paso').forEach((b) => {
    const act = b.dataset.paso === paso;
    // aria-current es el estado REAL: el CSS pinta desde él, así que lo que se
    // ve y lo que anuncia un lector de pantalla no pueden divergir.
    if (act) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  });
  ['prov', 'compras'].forEach((k) => {
    const p = document.getElementById('kms-panel-' + k);
    if (p) p.style.display = (k === paso) ? '' : 'none';
  });
}
function _kmsMandoSticky() {
  const sent = document.getElementById('kms-sentinela');
  const mando = document.querySelector('.kms-mando');
  if (!sent || !mando || !('IntersectionObserver' in window)) return;
  if (_kmsMandoObs) _kmsMandoObs.disconnect();   // idempotente: una sola instancia por visita
  _kmsMandoObs = new IntersectionObserver(
    ([e]) => { mando.classList.toggle('kms-mando-mini', !e.isIntersecting); },
    { threshold: 0 }
  );
  _kmsMandoObs.observe(sent);
}
function _kmsTableroLimpiar() {
  _kmsDatos = null;
  const c = document.getElementById('kms-tablero'); if (c) c.innerHTML = '';
  _kmsAlertasViajero = null;  // [KMS-5] del evento anterior: no sobreviven al cambio
  const a = document.getElementById('kms-alarmas'); if (a) a.innerHTML = '';
}
// PURO: recibe el tablero y las alertas, devuelve la lista de hallazgos. Sin
// DOM, sin fetch — para que el arnés pueda interrogarlo directo.
function _kmsAlarmasCalc(d, alertas) {
  const out = [];
  if (!d) return out;

  (d.zonas || []).forEach((z) => {
    // El semáforo no llegó para esta zona: no sabemos nada de ella. Callar es
    // correcto; inventar un cero sería afirmar que no hay nada raro.
    if (z.fuera == null && z.disponibles == null) return;

    // (1) Vendiste lo que no has comprado. Ojo: esta zona SOLO aparece desde el
    // arreglo del semáforo de esta misma tuerca — antes ni siquiera existía.
    if ((z.fuera || 0) > 0 && !(z.compradas > 0)) {
      out.push({
        clase: 'roja', tipo: 'zona_sin_compra', zona: z.zona,
        txt: `${z.zona}: vendiste ${z.fuera} que no has comprado`,
        pista: 'hay ventas fuera del sistema y cero boletos comprados en esta zona',
      });
      return; // no se acusa dos veces a la misma zona por lo mismo
    }
    // (2) Sobreventa de verdad: compraste, y aun así debes más de lo que tienes.
    if (z.disponibles != null && z.disponibles < 0 && z.compradas > 0) {
      out.push({
        clase: 'roja', tipo: 'sobreventa', zona: z.zona,
        txt: `${z.zona}: sobreventa de ${Math.abs(z.disponibles)}`,
        pista: `${z.compradas} compradas y ${z.compradas - z.disponibles} comprometidas`,
      });
    }
  });

  // (3) Saldo con proveedores. SOLO cuando los abonos ya llegaron: antes, un
  // saldo calculado con abonado=0 acusaría de deber todo a quien ya pagó.
  if (d.abonado != null && d.provs) {
    Object.keys(d.provs).forEach((pid) => {
      const p = d.provs[pid] || {};
      const abonado = (d.abonadoProv && d.abonadoProv[pid]) || 0;
      const saldo = (Number(p.deuda) || 0) - abonado;
      if (saldo > 0.5) {  // centavos de redondeo no son una deuda
        out.push({
          clase: 'ambar', tipo: 'saldo_proveedor', pid,
          txt: `Le debes ${_kamMoney(saldo)} a ${p.nombre || '—'}`,
          pista: abonado > 0 ? `de ${_kamMoney(p.deuda)}, ya abonaste ${_kamMoney(abonado)}` : 'sin ningún abono todavía',
        });
      }
    });
  }

  // (4) Viajeros con datos faltantes (las alertas datos_viajero de ESTE evento).
  (alertas || []).forEach((a) => {
    out.push({
      clase: 'ambar', tipo: 'datos_viajero', id: a.id,
      txt: `Faltan datos de ${(a.ref && a.ref.nombre) || 'un viajero'}`,
      pista: 'sin correo ni celular no se le puede mandar nada',
    });
  });

  return out;
}
function _kmsAlarmasPintar() {
  const cont = document.getElementById('kms-alarmas');
  if (!cont) return;
  if (!_kmsDatos) { cont.innerHTML = ''; return; }
  const items = _kmsAlarmasCalc(_kmsDatos, _kmsAlertasViajero);

  // Sin hallazgos NO se deja el hueco vacío: un panel en blanco se lee como
  // "todavía no reviso", que es justo lo contrario de lo que pasó.
  if (!items.length) {
    const esperando = (_kmsDatos.abonado == null) || (_kmsAlertasViajero == null);
    cont.innerHTML = `<div class="card kms-alm kms-alm-ok">
      <span class="kms-alm-ico" aria-hidden="true">✓</span>
      <span class="kms-alm-oktxt">Todo cuadra${esperando ? ' <span class="kms-alm-parcial">— falta terminar de revisar</span>' : ''}</span>
    </div>`;
    return;
  }

  const rojas = items.filter((i) => i.clase === 'roja').length;
  const linea = (i) => {
    const acc = i.tipo === 'zona_sin_compra' || i.tipo === 'sobreventa'
      ? `_kmsIrAZona('${_attrJs(i.zona)}')`
      : (i.tipo === 'saldo_proveedor' ? '_kmsIrAAbonos()' : `_kmsIrAViajero('${_attrJs(i.id)}')`);
    return `<button type="button" class="kms-alm-i kms-alm-${i.clase}" onclick="${acc}"
        title="Ir a donde se resuelve">
      <span class="kms-alm-t">${_esfEsc(i.txt)}</span>
      <span class="kms-alm-p">${_esfEsc(i.pista)}</span>
      <span class="kms-alm-ch" aria-hidden="true">›</span>
    </button>`;
  };

  cont.innerHTML = `<div class="card kms-alm ${rojas ? 'kms-alm-hay' : ''}">
    <div class="kms-alm-h">
      <span class="kms-alm-lbl">// NO CUADRA</span>
      <span class="kms-alm-n">${items.length} ${items.length === 1 ? 'cosa' : 'cosas'}${rojas ? ` · ${rojas} urgente${rojas === 1 ? '' : 's'}` : ''}</span>
    </div>
    <div class="kms-alm-list">${items.map(linea).join('')}</div>
  </div>`;
}
// Llevar al lugar donde se resuelve (patrón de [alertas clickeables]).
function _kmsIrAAbonos() {
  _kmsPaso('compras');
  const el = document.getElementById('kam-abonos');
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
// El viajero se captura con el MISMO modal de VJ-1. No se duplica: se alimenta
// su caché con las alertas que ya trajimos y se le pasa el id.
function _kmsIrAViajero(alertaId) {
  const a = (_kmsAlertasViajero || []).find((x) => String(x.id) === String(alertaId));
  if (!a) return;
  _vjAlertasCache = (_vjAlertasCache || []).concat(
    (_vjAlertasCache || []).some((x) => String(x.id) === String(a.id)) ? [] : [a]
  );
  _vjAbrir(alertaId);
}
// Las alertas de datos faltantes DE ESTE EVENTO. Acción que ya existía
// (sistema_alertas_listar); fails-soft: si truena, las otras alarmas siguen.
async function _kmsAlertasViajeroLoad(evId) {
  try {
    const todas = await khCoordi.alertasListar();   // [sec-sensibles]
    _kmsAlertasViajero = (todas || []).filter((a) =>
      a && a.tipo === 'datos_viajero' && !a.leida && _vjAccionable(a) && a.ref.evento_id === evId);
  } catch (e) {
    _kmsAlertasViajero = [];   // [] = "revisado, no hay"; null = "no sé todavía"
  }
  _kmsAlarmasPintar();
}
function _kmsReducido() {
  try { return window.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (_) { return false; }
}
// ═══════════════════════════════════════════════════════════════════════════
// [KMS-3] ELEGIR ZONA SIN BUSCARLA
//
// Lista clickeable + buscador + filas del tablero clickeables. Todo client-side:
// las zonas ya están pintadas, esto solo decide cuál se mira.
//
// EL ÍNDICE `zi` ES SAGRADO. El preview (KMS-2), la captura (_kamCompraCrear) y
// el ajuste de "vendidos fuera" llavean por `kam-c-*-{zi}` y `_kamZonasMap[zi]`.
// Por eso el filtro solo ESCONDE filas y jamás re-numera, y todo lo que entra
// desde fuera —el tablero— resuelve el índice POR NOMBRE contra _kamZonasMap.
// Es la mordida de renderZonas vs buildZonaButtons: agarrar "la primera que
// aparece" es una moneda al aire, y aquí la moneda decide en qué zona se guarda
// una compra.
// ═══════════════════════════════════════════════════════════════════════════
function _kmsZona(zi) {
  const panel = document.getElementById('kam-z-panel-' + zi);
  if (!panel) return;
  const lista = document.getElementById('kms-lista-wrap');
  const wrap = document.getElementById('kms-zona-wrap');
  if (lista) lista.style.display = 'none';
  if (wrap) wrap.style.display = '';
  document.querySelectorAll('#kms-zona-wrap .kms-zpanel').forEach((p) => { p.style.display = 'none'; });
  panel.style.display = '';
  try { panel.scrollIntoView({ block: 'nearest', behavior: _kmsReducido() ? 'auto' : 'smooth' }); } catch (_) {}
}
function _kmsZonasVolver() {
  const lista = document.getElementById('kms-lista-wrap');
  const wrap = document.getElementById('kms-zona-wrap');
  if (wrap) wrap.style.display = 'none';
  if (lista) lista.style.display = '';
  document.querySelectorAll('#kms-zona-wrap .kms-zpanel').forEach((p) => { p.style.display = 'none'; });
}
// Filtra la lista pintada. Cero red: compara contra el data-zona que ya viaja
// en cada fila. Sin resultados NO deja la pantalla en blanco: lo dice.
function _kmsZonaFiltrar() {
  // `_kmNorm` es el normalizador de la casa (minúsculas + sin acentos), el
  // mismo que usan los otros buscadores del Palacio: buscar "balcon" encuentra
  // "Balcón". Se reusa en vez de repetir el regex de combinantes — dos copias
  // de una normalización acaban divergiendo.
  const q = _kmNorm(String((document.getElementById('kms-zbusca') || {}).value || '').trim());
  let vivas = 0;
  document.querySelectorAll('#kms-zlista .kms-zrow').forEach((r) => {
    const n = String(r.dataset.zona || '');   // ya viene normalizado del render
    const ok = !q || n.includes(q);
    r.style.display = ok ? '' : 'none';
    if (ok) vivas++;
  });
  const v = document.getElementById('kms-zvacio');
  if (v) v.style.display = vivas === 0 ? '' : 'none';
}
// Entrada desde el TABLERO: llega un NOMBRE de zona y se resuelve su índice.
// Por nombre y no por posición — el orden del tablero y el de la lista salen de
// la misma fuente hoy, pero "hoy" no es una garantía sobre la que se guarde
// dinero.
function _kmsIrAZona(zona) {
  _kmsPaso('compras');
  const m = _kamZonasMap || {};
  const zi = Object.keys(m).find((k) => m[k] === zona);
  if (zi == null) return;
  const b = document.getElementById('kms-zbusca');
  if (b && b.value) { b.value = ''; _kmsZonaFiltrar(); }   // el filtro no debe esconder a la que vienes a ver
  _kmsZona(zi);
}
function _kmsTableroPintar(parcial) {
  const cont = document.getElementById('kms-tablero');
  if (!cont) return;
  _kmsDatos = Object.assign({ zonas: [], inversion: 0, abonado: null }, _kmsDatos || {}, parcial || {});
  const d = _kmsDatos;
  if (!d.zonas.length && !d.inversion) { cont.innerHTML = ''; return; }

  // "Deuda a proveedores" = inversión − abonado, que es el mismo saldo que ya
  // muestra la sección de abonos. Mientras los abonos no llegan se dice, en vez
  // de pintar un cero que se leería como "no debes nada".
  const abonado = d.abonado;
  // [KMS-SIMP-4] La deuda es de BOLETOS: inversión − abonado. Aquí se le sumaba
  // un tercer término, `servicios`, que ya no existe — un servicio se paga al
  // momento y por eso es un gasto, no un pasivo.
  const deuda = (abonado == null) ? null : (d.inversion - abonado);

  const tarjeta = (lbl, val, sub, cls) => `<div class="kms-tab-c ${cls || ''}">
    <div class="kms-tab-c-lbl">${_esfEsc(lbl)}</div>
    <div class="kms-tab-c-val">${val}</div>
    ${sub ? `<div class="kms-tab-c-sub">${_esfEsc(sub)}</div>` : ''}
  </div>`;

  // [FIN-1d] LA ZONA EN DINERO. Se EXTIENDE la tabla que ya existía en vez de
  // poner otra: la misma información dos veces en la misma pantalla es cómo se
  // llega a dos cifras que no cuadran.
  //
  // TRES REGLAS DE HONESTIDAD, del diseño:
  //  1. "Resta $" es ESTIMADO: disponibles × precio de HOY. El precio cambia y
  //     nadie ha pagado ese dinero todavía.
  //  2. "Vendido $" TAMBIÉN es estimado. Lo cobrado de verdad son los contratos
  //     de los viajeros, y esa cifra vive en Por Evento. Esta tabla no compite
  //     con ella: lo dice en su nota.
  //  3. Zona SIN precio en el catálogo → renglón sin estimados, NO ceros. Un
  //     cero diría "no vale nada", que es una afirmación que no tenemos.
  //
  // [MER-1] Y UNA CUARTA, la que llegó con melanie: si el evento YA PASÓ, "Resta
  // $" deja de ser una promesa y pasa a ser una pérdida. La columna cambia de
  // nombre a "Merma $" y de número: disponibles × COSTO, no × precio de venta.
  // Nadie va a pagar el precio de venta de un boleto de un concierto que ya fue.
  //
  // El costo unitario se toma de `costo_unit` (el que deriva _lib/disponibilidad
  // de las compras) y NO del promedio local `prom`: los dos casi siempre valen lo
  // mismo, pero difieren en cuanto una compra viene sin `costo_unitario` —`prom`
  // la cuenta como gratis y `costo_unit` la deja fuera del promedio. La merma que
  // se enseña aquí tiene que ser la MISMA que la del Resumen y la de Por Evento,
  // así que se lee de la misma fuente que ellas.
  const pasado = !!d.pasado;
  const precios = d.precios || {};
  const tot = { compradas: 0, costo: 0, vendidas: 0, vendido: 0, disp: 0, resta: 0, sinPrecio: 0, sinCosto: 0 };
  const filas = d.zonas.map((z) => {
    const prom = z.compradas > 0 ? (z.inversion / z.compradas) : 0;
    const dispCls = (z.disponibles == null) ? 'kms-z-cero' : (z.disponibles < 0 ? 'kms-z-neg' : '');
    const precio = precios[String(z.zona).trim()];
    const hayPrecio = Number.isFinite(precio) && precio > 0;
    const costoU = Number(z.costo_unit);
    const hayCosto = Number.isFinite(costoU) && costoU > 0;
    const vendidas = z.vendidas;
    // [CAP-MIG-FIX] MENOS ESTIMACIÓN. La nota al pie ya confesaba que "Vendido $"
    // era `vendidas × precio de hoy`. De los migrados SÍ sabemos el dinero real
    // —su `total_contrato`, que viaja en la misma consulta del semáforo—, así
    // que esa parte deja de estimarse: se estima solo lo que no se sabe.
    //   vendido = (vendidas − migrados con dinero) × precio  +  dinero REAL
    const migCon = Number(z.migrado_con_dinero) || 0;
    const migDin = Number(z.migrado_dinero) || 0;
    const estimadas = (vendidas == null) ? null : Math.max(0, vendidas - migCon);
    const vendidoD = (vendidas == null) ? null
      : (hayPrecio ? estimadas * precio + migDin : (migCon > 0 ? migDin : null));
    // ¿Cuánto de este renglón es dinero REAL y cuánto sigue siendo estimación?
    const todoReal = vendidas != null && vendidas > 0 && migCon === vendidas;
    const quedan = (z.disponibles != null && z.disponibles > 0) ? z.disponibles : null;
    const restaD = pasado
      ? ((hayCosto && quedan != null) ? quedan * costoU : null)
      : ((hayPrecio && quedan != null) ? quedan * precio : null);
    tot.compradas += z.compradas || 0;
    tot.costo += z.inversion || 0;
    if (vendidas != null) tot.vendidas += vendidas;
    if (vendidoD != null) tot.vendido += vendidoD;
    if (quedan != null) tot.disp += quedan;
    if (restaD != null) tot.resta += restaD;
    if (!hayPrecio) tot.sinPrecio++;
    if (pasado && quedan != null && !hayCosto) tot.sinCosto++;
    const guion = '<span class="kms-z-cero">—</span>';
    // [KMS-3] La fila lleva a su zona en el paso ②. Se manda el NOMBRE, no el
    // índice: quien resuelve el índice es _kmsIrAZona contra _kamZonasMap.
    // tabindex + Enter para que también se llegue con el teclado.
    return `<tr class="kms-z-clic" tabindex="0" role="button"
        title="Ver y capturar compras de ${_esfEsc(z.zona)}"
        onclick="_kmsIrAZona('${_attrJs(z.zona)}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_kmsIrAZona('${_attrJs(z.zona)}')}">
      <td class="kms-z-nom">${_esfEsc(z.zona)}</td>
      <td>${z.compradas || 0}</td>
      <td>${z.compradas > 0 ? _kamMoney(prom) : guion}</td>
      <td>${z.inversion > 0 ? _kamMoney(z.inversion) : guion}</td>
      <td>${vendidas == null ? guion : vendidas}</td>
      <td>${hayPrecio ? _kamMoney(precio) : guion}</td>
      <td>${vendidoD == null ? guion
            : `${_kamMoney(vendidoD)}${todoReal ? '<span class="kms-z-real" title="dinero real de los contratos, no estimado"> real</span>' : ''}`}</td>
      <td class="${dispCls}">${z.disponibles == null ? '—' : z.disponibles}</td>
      <td class="${pasado ? 'mer1-merma' : 'kms-z-resta'}">${restaD == null ? guion : _kamMoney(restaD)}</td>
    </tr>`;
  }).join('');

  // El renglón TOTAL. Solo se pinta si hay algo que totalizar.
  const totalFila = d.zonas.length ? `
    <tr class="kms-z-tot">
      <td class="kms-z-nom">TOTAL</td>
      <td>${tot.compradas}</td>
      <td></td>
      <td>${_kamMoney(tot.costo)}</td>
      <td>${tot.vendidas}</td>
      <td></td>
      <td>${_kamMoney(tot.vendido)}</td>
      <td>${tot.disp}</td>
      <td class="${pasado ? 'mer1-merma' : 'kms-z-resta'}">${_kamMoney(tot.resta)}</td>
    </tr>` : '';

  cont.innerHTML = `<div class="card kms-tab">
    <div class="kms-tab-tot">
      ${tarjeta('Inversión en boletos', _kamMoney(d.inversion), 'lo que costaron las compras')}
      ${tarjeta('Abonado', abonado == null ? '…' : _kamMoney(abonado), abonado == null ? 'cargando abonos' : 'ya le pagaste a proveedores', 'kms-abonado')}
      ${tarjeta('Deuda a proveedores', deuda == null ? '…' : _kamMoney(deuda), deuda == null ? 'cargando abonos' : 'inversión − abonado', 'kms-deuda')}
    </div>
    <div class="kms-tab-wrap"><table class="kms-tab-z">
      <thead><tr><th>Zona</th><th>Compradas</th><th>Costo u.</th><th>Costo total</th><th>Vendidas</th><th title="Precio de venta del paquete PLUS de esa zona, tal como está HOY en el catálogo del sitio">Precio PLUS hoy</th><th>Vendido $</th><th>Disp.</th><th>${pasado ? 'Merma $' : 'Resta $'}</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="9" class="kms-z-cero">Sin compras registradas</td></tr>'}${totalFila}</tbody>
    </table></div>
    ${d.zonas.length ? `<div class="kms-z-nota">
      ${pasado
        ? `<b>Merma $</b> es lo que COSTARON los boletos que se quedaron sin vender: disponibles × su costo de compra.
           <b>El evento ya pasó</b>, así que esa columna no es dinero por cobrar — es dinero que ya se gastó, y ya está contado en los gastos del evento.
           <b>Vendido $</b> sigue siendo un estimado a precio de catálogo; lo <b>cobrado de verdad</b> son los contratos de los viajeros, en <b>Por Evento</b>.
           ${tot.sinCosto ? `<span class="kms-z-aviso">${tot.sinCosto} zona${tot.sinCosto === 1 ? '' : 's'} con boletos sin vender y sin costo capturado: su renglón va sin merma.</span>` : ''}`
        : `<b>Precio PLUS hoy</b> es el precio de venta del paquete <b>PLUS</b> de esa zona en el catálogo — un CHEAP o un STAY de la misma zona cuestan otra cosa.
           <b>Resta $</b> es <b>estimada</b>: disponibles × ese precio. <b>Vendido $</b> ya usa el dinero REAL de los contratos migrados y estima solo el resto; cuando todo el renglón es real lo dice.
           El precio cambia y lo de la derecha nadie lo ha pagado todavía.
           Lo <b>cobrado de verdad</b> son los contratos de los viajeros, y esa cifra vive en <b>Por Evento</b>.
           ${tot.sinPrecio ? `<span class="kms-z-aviso">${tot.sinPrecio} zona${tot.sinPrecio === 1 ? '' : 's'} sin precio en el catálogo: su renglón va sin estimados.</span>` : ''}`}
    </div>` : ''}
  </div>`;

  // [KMS-5] Las alarmas salen de lo MISMO que acaba de pintarse. Se repinta en
  // los dos tiempos porque el saldo de proveedores solo existe cuando llegan
  // los abonos.
  _kmsAlarmasPintar();
}
async function _kamProveedoresLoad() {
  const cont = document.getElementById('kam-prov-list');
  if (!cont) return;
  cont.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-proveedores', {
      method: 'POST', body: JSON.stringify({ accion: 'listar' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudieron cargar los proveedores');
    const provs = d.proveedores || [];
    // [PRV-1] Esta lista es la MISMA que necesitan los <select> del paso ②, así
    // que se publica aquí en vez de volver a pedirla. Una sola fuente: si algún
    // día divergieran, el paso ① mostraría un proveedor que el ② no ofrece.
    _kamProvCache = provs;
    if (!provs.length) {
      cont.innerHTML = '<div class="empty-state"><div class="empty-icon"></div>Sin proveedores todavía</div>';
      return;
    }
    cont.innerHTML =
      '<table style="width:100%;border-collapse:collapse"><tbody>' +
      provs.map((p) =>
        '<tr style="border-top:1px solid var(--border)"><td style="padding:8px 4px;font-size:13px">' +
        _esfEsc(p.nombre) + '</td></tr>'
      ).join('') +
      '</tbody></table>';
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
  }
}
async function _kamProveedorCrear() {
  const inp = document.getElementById('kam-prov-nombre');
  const alertEl = document.getElementById('kam-prov-alert');
  if (alertEl) alertEl.innerHTML = '';
  const nombre = (inp?.value || '').trim();
  if (!nombre) {
    if (alertEl) alertEl.innerHTML = '<div class="alert alert-error">Escribe el nombre del proveedor.</div>';
    return;
  }
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-proveedores', {
      method: 'POST', body: JSON.stringify({ accion: 'crear', nombre }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo agregar el proveedor');
    if (inp) inp.value = '';
    // [PRV-1] El proveedor nuevo tiene que existir YA en el paso ②. Antes solo
    // se recargaba la lista del paso ① y el select de las zonas se quedaba con
    // el catálogo viejo: Memo daba de alta al proveedor, iba a capturar la
    // compra y no estaba. Había que re-elegir el evento para que apareciera.
    //
    // Se ESPERA la recarga (antes no se esperaba) porque de ella sale el
    // _kamProvCache con el que se repintan los selects.
    await _kamProveedoresLoad();
    _kamProvSelectsRefrescar((d.proveedor && d.proveedor.id) || null);
  } catch (e) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
  }
}
// [PRV-1] Repinta SOLO los <select> de proveedor de las zonas.
//
// Se repintan los selects en vez de recargar el paso ② entero: _kamComprasLoad
// vuelve a construir todo el HTML, y con él se irían la cantidad y el costo que
// Memo ya llevaba tecleados. Dar de alta un proveedor a media captura es
// justamente el caso donde eso pasa — perder lo escrito para "arreglar" el
// select sería cambiar un estorbo por otro peor.
//
// Cada select CONSERVA lo que tuviera elegido. Si no tenía nada (el caso de
// "no había ningún proveedor todavía"), se queda con el recién creado, que es
// lo que Memo venía a usar.
function _kamProvSelectsRefrescar(nuevoId) {
  // [KMS-SIMP-5] La vacía se re-pinta aquí también. Si solo estuviera en el
  // markup inicial, el primer alta desde el botón "+" la habría borrado —esta
  // función reescribe el `innerHTML` entero— y el default silencioso volvería
  // en silencio, que es la forma más cara de arreglar algo.
  const opts = '<option value="">— elige proveedor —</option>'
    + (_kamProvCache || [])
    .map((p) => `<option value="${_esfEsc(p.id)}">${_esfEsc(p.nombre)}</option>`).join('');
  // [KMS-SIMP-2] `kmt-prov` es el de la tabla de tanda: un proveedor dado de
  // alta desde ahí tiene que aparecer AHÍ, que es donde se acaba de pedir.
  // [KMS-SIMP-3] Y ya es el único: el barrido también alcanzaba
  // `select[id^="kam-c-prov-"]`, los del formulario por zona que murió. Un
  // selector que apunta a lo que no existe no falla — no hace nada, que es
  // peor: se lee como si siguiera cubriendo algo.
  document.querySelectorAll('#kmt-prov').forEach((sel) => {
    const antes = sel.value;
    sel.innerHTML = opts;
    // Si lo de antes sigue existiendo, se respeta; si no, el nuevo.
    if (antes && (_kamProvCache || []).some((p) => String(p.id) === String(antes))) sel.value = antes;
    else if (nuevoId) sel.value = String(nuevoId);
  });
}
function _kamComprasAlert(msg) {
  const a = document.getElementById('kam-compras-alert');
  if (a) a.innerHTML = `<div class="alert alert-error">${_esfEsc(msg)}</div>`;
}
// Puebla el <select> de eventos desde el EV del index (solo zonas raíz en Capa 1).
async function _kamPopulateEventos() {
  const sel = document.getElementById('kam-evt-sel');
  if (!sel) return;
  try {
    const ev = await _fetchEVFromIndex();
      // [ORD-1] Por FECHA, con la regla compartida. Antes iba por NOMBRE.
    const opts = _evOrdenarPorFecha((Array.isArray(ev) ? ev : []).filter((e) => e && e.id))
      .map((e) => `<option value="${_esfEsc(e.id)}">${_esfEsc(e.a || e.id)}</option>`)
      .join('');
    sel.innerHTML = '<option value="">— Elige un evento —</option>' + opts;
  } catch (_) { /* deja el placeholder */ }
}
// ── Liquidaciones de vendedores (F5c — pantalla de Memo, solo maestro_roshi) ──
// Cierre MANUAL. Todo vive en el mundo SLUG: el evento del catálogo da paquetes,
// ventas de vendedor Y la caja real (cobrado + ingresos − gastos = utilidad). Se
// eliminó el puente slug↔uuid del Palacio. Flujo: elegir evento → Previsualizar
// (sin escribir) → "Cerrar y liquidar" (congela) → Marcar pagada.
// Carga y pinta las compras del evento elegido, agrupadas por zona, con stock y
// deuda por zona y total del evento. Recalcula en cada carga (alta/borrado).
async function _kamComprasLoad() {
  const sel = document.getElementById('kam-evt-sel');
  const cont = document.getElementById('kam-compras');
  if (!sel || !cont) return;
  const evId = sel.value;
  if (!evId) { cont.innerHTML = ''; return; }
  cont.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
  try {
    const evArr = await _fetchEVFromIndex();
    const ev = (Array.isArray(evArr) ? evArr : []).find((e) => e && e.id === evId);
    const zonasEV = (ev && Array.isArray(ev.zonas)) ? ev.zonas : [];

    const [cRes, pRes, sRes] = await Promise.all([
      khAdminFetch('/.netlify/functions/admin-compras', { method: 'POST', body: JSON.stringify({ accion: 'listar', evento_id: evId }) }),
      khAdminFetch('/.netlify/functions/admin-proveedores', { method: 'POST', body: JSON.stringify({ accion: 'listar' }) }),
      khAdminFetch('/.netlify/functions/admin-compras', { method: 'POST', body: JSON.stringify({ accion: 'semaforo', evento_id: evId }) }),
    ]);
    const cData = await cRes.json().catch(() => ({}));
    const pData = await pRes.json().catch(() => ({}));
    const sData = await sRes.json().catch(() => ({}));
    if (!cRes.ok || !cData.ok) throw new Error(cData.error || 'No se pudieron cargar las compras');
    if (!pRes.ok || !pData.ok) throw new Error(pData.error || 'No se pudieron cargar los proveedores');
    const compras = cData.compras || [];
    _kamProvCache = pData.proveedores || [];

    // [FASE B t3] Semáforo por zona (desglose real: compradas/fuera/seguras/apartadas/
    // disponibles + color). Si el endpoint falla (p.ej. Portal caído), se degrada a
    // null → se muestra el inventario sin la película, sin romper el Palacio.
    const semMap = {};
    const semOk = sRes.ok && sData.ok && Array.isArray(sData.zonas);
    if (semOk) sData.zonas.forEach((z) => { semMap[String(z.zona).trim()] = z; });

    // Deuda agrupada POR PROVEEDOR (cantidad × costo_unitario de sus compras).
    const deudaPorProveedor = {};
    compras.forEach((c) => {
      const pid = c.proveedor_id;
      if (!pid) return;
      const sub = (parseInt(c.cantidad, 10) || 0) * (Number(c.costo_unitario) || 0);
      if (!deudaPorProveedor[pid]) deudaPorProveedor[pid] = { nombre: c.proveedor_nombre || '—', deuda: 0 };
      deudaPorProveedor[pid].deuda += sub;
    });

    // ⚠️ [KMS-SIMP-4] Aquí se le sumaban los SERVICIOS a la deuda del proveedor,
    // y con eso un transportista aparecía en el selector de abonos. Ya no: un
    // servicio se paga al momento, así que es un GASTO y se captura en Gastos.
    // La única deuda del negocio es la de BOLETOS a crédito. El selector de
    // abonos ofrece exactamente a quien se le deben boletos.

    if (!zonasEV.length && !compras.length) {
      cont.innerHTML = '<div class="empty-state"><div class="empty-icon"></div>Este evento aún no tiene zonas</div>';
      return;
    }
    // Unión de zonas: las del EV (orden + permiten captura) + las que ya tengan
    // compras (por si una zona se renombró en el index después de comprar).
    const zonaNames = [];
    zonasEV.forEach((z) => { const n = (z && z.n != null) ? String(z.n) : ''; if (n && !zonaNames.includes(n)) zonaNames.push(n); });
    compras.forEach((c) => { const n = String(c.zona || ''); if (n && !zonaNames.includes(n)) zonaNames.push(n); });
    // [KMS-5] …y las zonas que SOLO tiene el semáforo (las que tienen ajuste y
    // ninguna compra). Arreglar el endpoint no bastaba: si la zona no está en
    // el catálogo del evento ni en las compras, esta lista la dejaba fuera y el
    // número seguía sin verse. En melanie la Barrera SÍ estaba en el catálogo —
    // por eso el síntoma fue un "—" y no una fila ausente— pero una zona
    // inventada al vuelo en un ajuste no tendría dónde aparecer.
    Object.keys(semMap).forEach((n) => { if (n && !zonaNames.includes(n)) zonaNames.push(n); });

    _kamZonasMap = {};
    let totalEvento = 0;
    let html = '';
    // [KMS-3] Dos piezas: la LISTA clickeable (para elegir sin scroll) y los
    // PANELES de cada zona (historial + captura), todos pintados pero ocultos.
    // Se pintan todos a propósito en vez de generar el de la zona elegida al
    // vuelo: así los ids `kam-c-*-{zi}` existen desde el principio y ni el
    // preview de KMS-2 ni _kamCompraCrear ni _kamAjusteGuardar se enteran del
    // cambio. El índice zi NUNCA se recalcula al filtrar — el buscador solo
    // esconde filas, jamás re-numera.
    let listaHtml = '';
    // [KMS-SIMP-1] El stock ya cargado por zona, para el renglón de la tanda.
    // NO se recalcula: se publica el MISMO número que el bucle usa para pintar
    // "N compradas". Dos cuentas del mismo dato acabarían divergiendo.
    const stockPorZi = {};
    zonaNames.forEach((zona, zi) => {
      _kamZonasMap[zi] = zona;
      const cz = compras.filter((c) => String(c.zona) === zona);
      const stock = cz.reduce((s, c) => s + (parseInt(c.cantidad, 10) || 0), 0);
      stockPorZi[zi] = stock;
      const deuda = cz.reduce((s, c) => s + (parseInt(c.cantidad, 10) || 0) * (Number(c.costo_unitario) || 0), 0);
      totalEvento += deuda;
      const sem = semMap[String(zona).trim()] || null;
      const filas = cz.length
        ? cz.map((c) => {
            const sub = (parseInt(c.cantidad, 10) || 0) * (Number(c.costo_unitario) || 0);
            return `<tr>
              <td class="kzt-q">${parseInt(c.cantidad, 10) || 0} × ${_kamMoney(c.costo_unitario)}</td>
              <td class="kzt-a">${_esfEsc(c.proveedor_nombre || '—')}</td>
              <td class="kzt-a">${_esfEsc(c.fecha || '')}</td>
              <td class="kzt-s">${_kamMoney(sub)}</td>
              <td><button class="btn btn-ghost btn-sm" type="button" onclick="_kamCompraEliminar('${_attrJs(c.id)}')">×</button></td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="5" class="kzt-a">Sin compras en esta zona</td></tr>';

      // [KMS-3] Fila de la lista: lo justo para decidir de un vistazo.
      // `data-zona` lleva el NOMBRE en minúsculas para que el buscador filtre
      // sin volver a leer el DOM pintado, y `data-zi` el índice canónico.
      listaHtml += `<button type="button" class="kms-zrow" data-zi="${zi}" data-zona="${_esfEsc(_kmNorm(zona))}" onclick="_kmsZona(${zi})">
        <span class="kms-zrow-n">${_esfEsc(zona)}</span>
        <span class="kms-zrow-d">
          <span class="kms-zrow-c">${stock} compradas</span>
          ${sem ? (sem.disponibles == null
              ? '<span class="kms-zrow-disp kms-zrow-sinstock">sin stock cargado</span>'
              : `<span class="kms-zrow-disp ${sem.disponibles < 0 ? 'kms-zrow-neg' : ''}">${sem.disponibles} disp.</span>`) : ''}
          ${deuda > 0 ? `<span class="kms-zrow-deu">${_kamMoney(deuda)}</span>` : ''}
        </span>
        <span class="kms-zrow-ch" aria-hidden="true">›</span>
      </button>`;

      // [KMS-SIMP-3] LA ZONA DEJA DE SER PUERTA DE CAPTURA.
      //
      // Memo cayó en esta pantalla y la sintió compleja, con razón: tenía ONCE
      // controles y un formulario de seis campos a todo lo ancho —el select de
      // proveedor solo ocupaba 1134px— para hacer lo que la tabla de tanda hace
      // de golpe para las doce zonas.
      //
      // Aquí se quedan SOLO las dos cosas que no viven en ningún otro lado: el
      // historial de compras DE ESTA ZONA y su semáforo. Los abonos y la deuda
      // del evento NO se duplican: ya viven en el modo lista desde KMS-3.
      html += `<div class="kms-zpanel" id="kam-z-panel-${zi}" style="display:none">
        <div class="kms-zp-head">
          <div class="kms-zp-nom">${_esfEsc(zona)}</div>
          <div class="kms-zp-deu">Deuda: <b>${_kamMoney(deuda)}</b></div>
        </div>
        ${_kamSemaforoHtml(sem)}
        <div class="kms-zp-h">Compras de esta zona</div>
        <div class="kms-zp-tabla"><table><tbody>${filas}</tbody></table></div>
        ${_kamAjusteHtml(sem, zi)}
        <div class="kms-zp-pie">Para capturar boletos, usa <b>Cargar pedido en tanda</b> en la lista de zonas: las ${zonaNames.length} zonas en una sola pantalla.</div>
      </div>`;
    });
    // [KMS-SIMP-2] La cuenta se re-pinta DESPUÉS del tablero, porque el punto
    // de quiebre necesita la inversión y los disponibles que el tablero acaba
    // de calcular. Si la cuenta aún no llegó del servidor, no pinta nada y se
    // pintará sola cuando llegue.
    setTimeout(() => { if (typeof _kmsCuentaPintar === 'function') _kmsCuentaPintar(); }, 0);
    // [KMS-1] El tablero de arriba se pinta con lo que ESTA función ya calculó
    // (compras + semáforo). Ni un endpoint nuevo ni una llamada extra.
    _kmsTableroPintar({
      inversion: totalEvento,
      // [KMS-2] La deuda POR PROVEEDOR, para el preview de compra. Ya estaba
      // calculada arriba; solo se publica.
      provs: deudaPorProveedor,
      // [FIN-1d] El precio de venta de HOY sale del catálogo del index, que esta
      // función YA tenía cargado (`zonasEV`). Cero endpoints nuevos.
      precios: (() => {
        const m = {};
        zonasEV.forEach((z) => { if (z && z.n != null && Number.isFinite(Number(z.p))) m[String(z.n).trim()] = Number(z.p); });
        return m;
      })(),
      // [MER-1] ¿ya pasó? Se decide con el EVENTO del catálogo (multifecha
      // incluida), no con `ds` a secas, y con el reloj de la casa.
      pasado: _mermaPasado(ev),
      zonas: zonaNames.map((zona) => {
        const cz = compras.filter((c) => String(c.zona) === zona);
        const sem = semMap[String(zona).trim()] || null;
        return {
          zona,
          // [MER-1] El costo unitario de la MISMA fuente que usan las otras tres
          // pantallas (_lib/disponibilidad), para que la merma no pueda divergir
          // entre el Palacio y el Resumen.
          costo_unit: sem ? sem.costo_unit : null,
          compradas: cz.reduce((s, c) => s + (parseInt(c.cantidad, 10) || 0), 0),
          inversion: cz.reduce((s, c) => s + (parseInt(c.cantidad, 10) || 0) * (Number(c.costo_unitario) || 0), 0),
          // null (no 0) cuando el semáforo no vino: un 0 se leería como
          // "cero vendidos fuera", que es una afirmación que no tenemos.
          fuera: sem ? sem.fuera : null,
          disponibles: sem ? sem.disponibles : null,
          // [FIN-1d] VENDIDAS = todo lo que ya no está disponible, venga de donde
          // venga: fuera del sistema + seguras + apartadas. Es la definición que
          // usa el propio semáforo para restar (disponibles = compradas − las
          // tres), así que cualquier otra cosa no cuadraría con su propia resta.
          // [CAP-MIG-FIX] ⚠️ AQUÍ FALTABAN LOS MIGRADOS y la tabla se contradecía
          // sola: "Disp." SÍ los restaba (10−1=9, porque sale del semáforo, que
          // desde MIG-1b los cuenta) pero "Vendidas" decía 0. Un migrado ES una
          // venta. La definición no cambia —VENDIDAS = todo lo que ya no está
          // disponible— solo que ahora la resta y la suma miran lo mismo, y por
          // eso `vendidas + disponibles = compradas` en todos los casos.
          vendidas: sem ? (Number(sem.fuera || 0) + Number(sem.seguras || 0)
                         + Number(sem.apartadas || 0) + Number(sem.migrados || 0)) : null,
        };
      }),
    });
    // [KMS-3] MODO LISTA (el evento) y MODO ZONA (una sola zona).
    // Memo: "está muy larga la lista para buscar cada boleto". Antes se pintaban
    // TODAS las zonas apiladas con su historial y su formulario, y encontrar la
    // que querías era puro scroll.
    // El buscador solo aparece cuando de verdad estorba la lista: con cuatro
    // zonas un campo de búsqueda es ruido, no ayuda.
    const buscador = zonaNames.length >= 6
      ? `<input class="cot-input kms-zbusca" id="kms-zbusca" type="search" placeholder="Buscar zona…" autocomplete="off" oninput="_kmsZonaFiltrar()" aria-label="Buscar zona">`
      : '';
    // La deuda del evento y los abonos viven en el MODO LISTA: son del evento,
    // no de una zona. Al entrar a una zona se ven sus números; para lo del
    // evento, un clic atrás. No desaparecen.
    // ═══ [KMS-SIMP-1] EL PEDIDO EN TANDA ══════════════════════════════════
    // Medido antes de construirla: cargar calle24 completo costaba ≈48 clics y
    // ≈60 campos — 12 zonas, y entrar y salir de cada una. De esos 60 campos,
    // 48 eran EL MISMO DATO repetido: proveedor, fecha y nota no cambian entre
    // zonas. Solo cantidad y costo sí.
    //
    // La tabla captura lo común UNA vez arriba y deja un renglón por zona con
    // los dos campos que de verdad cambian. Un solo Guardar.
    //
    // ⚠️ AGREGAR, NUNCA SOBRESCRIBIR (firmado por Memo): cada renglón lleno
    // crea UNA compra nueva con su propio precio. Por eso el renglón muestra lo
    // que YA hay ("40 cargadas") en vez de traerlo al campo: un campo
    // pre-llenado invita a corregirlo, y corregir aquí sería perder a qué
    // precio compraste la vez pasada.
    //
    // Las zonas y los renglones salen de lo que esta misma función ya calculó
    // (`zonaNames`, `_kamZonasMap`, el stock por zona): ni un endpoint nuevo.
    const tandaFilas = zonaNames.map((zona, zi) => {
      // zi es el índice del map, NO un indexOf: dos zonas con el mismo nombre
      // apuntarían todas a la primera, y el buscador de KMS-3 ya advierte que
      // el índice canónico no se recalcula nunca.
      const yaHay = stockPorZi[zi] || 0;
      return `<tr data-zi="${zi}">
        <td class="kmt-z">${_esfEsc(zona)}${yaHay > 0 ? `<span class="kmt-ya">${yaHay} cargadas</span>` : ''}</td>
        <td><input class="cot-input kmt-in" id="kmt-cant-${zi}" type="number" min="0" step="1" placeholder="—" oninput="_kmtCalc()" aria-label="Cantidad para ${_esfEsc(zona)}"></td>
        <td><input class="cot-input kmt-in" id="kmt-costo-${zi}" type="number" min="0" step="0.01" placeholder="—" oninput="_kmtCalc()" aria-label="Costo unitario para ${_esfEsc(zona)}"></td>
        <td class="kmt-sub" id="kmt-sub-${zi}">—</td>
      </tr>`;
    }).join('');
    // [KMS-SIMP-5] LA PRIMERA OPCIÓN VA VACÍA, y no es cosmética: sin ella el
    // navegador elige sola la primera del catálogo, y el catálogo llega ordenado
    // `nombre.asc` desde `admin-proveedores`. Con los 4 proveedores de hoy eso es
    // **Hotel**, así que una tanda guardada sin mirar el selector nacía "comprada
    // a Hotel". Le pasó a calle24: 3 compras de Matriz quedaron a nombre de Hotel
    // (Jane ya corrigió el dato en la base).
    // Es la lección de ETAPA 4 con la cuenta, otra vez: un default silencioso no
    // ahorra un clic, INVENTA un dato — y encima uno que apunta a un TERCERO, así
    // que la deuda a proveedores también salía mal.
    const provOptsTanda = '<option value="">— elige proveedor —</option>'
      + _kamProvCache.map((pv) => `<option value="${_esfEsc(pv.id)}">${_esfEsc(pv.nombre)}</option>`).join('');
    const tanda = `<details class="kmt-wrap" id="kmt-wrap">
      <summary class="kmt-sum">↥ Cargar pedido en tanda <span class="kmt-hint">— las ${zonaNames.length} zonas en una sola pantalla</span></summary>
      <div class="kmt-body">
        <div class="kmt-comun">
          <label class="kmt-lbl">PROVEEDOR<span class="kmt-prov-fila">
            <select class="cot-input" id="kmt-prov">${provOptsTanda}</select>
            <!-- [KMS-SIMP-2] Agregar un proveedor SIN salir de la tabla. Reusa
                 admin-proveedores accion crear (el mismo alta del paso 1), asi
                 que queda guardado para siempre y aparece en todos lados. Antes
                 habia que volver al paso 1, darlo de alta y regresar.
                 Ojo: sin acentos ni comillas invertidas — este comentario vive
                 DENTRO de un template literal, y un backtick lo cerraria. -->
            <button type="button" class="btn btn-ghost btn-sm kmt-prov-mas" onclick="_kmtProvNuevo()" title="Agregar proveedor">+</button>
          </span></label>
          <label class="kmt-lbl">FECHA<input class="cot-input" id="kmt-fecha" type="date" value="${_kamToday()}"></label>
          <label class="kmt-lbl" style="flex:1;min-width:180px">NOTA DE LA TANDA<input class="cot-input" id="kmt-nota" placeholder="opcional — ej. pedido inicial" maxlength="500"></label>
        </div>
        <div class="kmt-tabla-wrap">
          <table class="kmt-tabla"><thead><tr>
            <th>Zona</th><th style="width:110px">Cantidad</th><th style="width:130px">Costo unit.</th><th style="width:120px">Subtotal</th>
          </tr></thead><tbody>${tandaFilas}</tbody></table>
        </div>
        <div class="kmt-pie">
          <div id="kmt-resumen" class="kmt-resumen">Ninguna zona capturada todavía.</div>
          <button class="btn btn-primary btn-sm" type="button" id="kmt-guardar" onclick="_kmtGuardar()">Guardar el pedido</button>
        </div>
        <div id="kmt-error" class="kmt-error" style="display:none"></div>
      </div>
    </details>`;

    const lista = `<div id="kms-lista-wrap">
      ${tanda}
      ${buscador}
      <div id="kms-zlista" class="kms-zlista">${listaHtml}</div>
      <div id="kms-zvacio" class="kms-vacio" style="display:none">Ninguna zona se llama así.</div>
      <div style="text-align:right;font-size:14px;font-weight:700;margin-top:10px">Deuda del evento: ${_kamMoney(totalEvento)}</div>
      <div id="kam-abonos" style="margin-top:12px"></div>
    </div>`;
    const zonaWrap = `<div id="kms-zona-wrap" style="display:none">
      <button type="button" class="btn btn-ghost btn-sm kms-zvolver" onclick="_kmsZonasVolver()">‹ Todas las zonas</button>
      ${html}
    </div>`;
    // La alerta queda FUERA de los dos modos y siempre montada: _kamCompraCrear
    // escribe ahí, y KMS-2b decide si el botón revive mirando el DOM. Si la
    // alerta viviera dentro de un modo, un fallo podría no verse.
    cont.innerHTML = lista + zonaWrap + '<div id="kam-compras-alert" style="margin-top:10px"></div>';
    _kmsZonasVolver();
    _kamAbonosLoad(evId, deudaPorProveedor);
    // [KMS-5] Las alertas de datos faltantes, en paralelo y fails-soft: si
    // tardan o truenan, el resto de las alarmas ya se pintó.
    _kmsAlertasViajeroLoad(evId);
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
  }
}
async function _kamAbonosLoad(slug, deudaPorProveedor) {
  const cont = document.getElementById('kam-abonos');
  if (!cont) return;
  cont.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando abonos…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-abonos', {
      method: 'POST', body: JSON.stringify({ accion: 'listar', evento_id: slug }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudieron cargar los abonos');
    const abonos = d.abonos || [];

    // Abonado por proveedor.
    const abonadoPorProveedor = {};
    abonos.forEach((a) => {
      const pid = a.proveedor_id;
      if (!pid) return;
      abonadoPorProveedor[pid] = (abonadoPorProveedor[pid] || 0) + (Number(a.monto) || 0);
    });

    // Unión de proveedores con deuda o con abonos.
    const pids = [];
    Object.keys(deudaPorProveedor || {}).forEach((pid) => { if (!pids.includes(pid)) pids.push(pid); });
    Object.keys(abonadoPorProveedor).forEach((pid) => { if (!pids.includes(pid)) pids.push(pid); });

    const nombreDe = (pid) => (deudaPorProveedor[pid] && deudaPorProveedor[pid].nombre)
      || (abonos.find((a) => a.proveedor_id === pid) || {}).proveedor_nombre || '—';

    let deudaTotal = 0, abonadoTotal = 0;
    const lineas = pids.map((pid) => {
      const deuda = (deudaPorProveedor[pid] && deudaPorProveedor[pid].deuda) || 0;
      const abonado = abonadoPorProveedor[pid] || 0;
      deudaTotal += deuda; abonadoTotal += abonado;
      const saldo = deuda - abonado;
      return `<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;padding:3px 0;border-top:1px solid var(--border)">
        <span style="font-weight:700">${_esfEsc(nombreDe(pid))}</span>
        <span style="color:var(--ts)">Deuda ${_kamMoney(deuda)} · Abonado ${_kamMoney(abonado)} · Saldo <b style="color:var(--fg)">${_kamMoney(saldo)}</b></span>
      </div>`;
    }).join('');

    // [FIN-1e] AQUÍ VIVÍA EL FORMULARIO DE ABONO, y se retira del todo (decisión
    // de Memo). El dinero que sale tiene UNA sola puerta: el gasto. Lo que queda
    // no es un hueco: es el letrero que dice a dónde ir, con el brinco puesto.
    const form = `<div class="fin1e-puerta">
        <span class="fin1e-txt">Los pagos a proveedores se registran en <b>Gastos</b>, marcando
          <b>"Abonar también a su deuda"</b>: así el pago queda en la caja del evento y en la
          deuda del proveedor con una sola captura.</span>
        <button class="btn btn-primary btn-sm" type="button" onclick="_fin1eIrAGastos('${_attrJs(slug)}')">Ir a Gastos ›</button>
      </div>`;

    const filasAbonos = abonos.length
      ? abonos.map((a) => `<tr style="border-top:1px solid var(--border)">
          <td style="padding:3px 4px;font-size:12px;color:var(--ts)">${_esfEsc(a.fecha || '')}</td>
          <td style="padding:3px 4px;font-size:12px">${_esfEsc(a.proveedor_nombre || '—')}</td>
          <td style="padding:3px 4px;font-size:12px">${_kamMoney(a.monto)}</td>
          <td style="padding:3px 4px;font-size:12px;color:var(--ts)">${_esfEsc(a.nota || '')}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" style="padding:3px 4px;font-size:12px;color:var(--ts)">Sin abonos registrados</td></tr>';

    const saldoTotal = deudaTotal - abonadoTotal;
    // [KMS-1] El abonado llega en este segundo tiempo y completa el tablero.
    // [KMS-2] …y con él lo abonado POR PROVEEDOR, que es lo que vuelve un
    // "saldo" el número del preview de compra. Ya estaba calculado; se publica.
    _kmsTableroPintar({ abonado: abonadoTotal, abonadoProv: abonadoPorProveedor });
    cont.innerHTML = `<div style="border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:9px 11px">
      <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;margin-bottom:6px">Abonos a proveedores</div>
      ${lineas || '<div style="font-size:12px;color:var(--ts)">Sin deuda ni abonos todavía.</div>'}
      ${form}
      <div id="kam-abonos-alert" style="margin-bottom:8px"></div>
      <table style="width:100%;border-collapse:collapse"><tbody>${filasAbonos}</tbody></table>
      <div style="text-align:right;font-size:13px;font-weight:700;margin-top:8px">Deuda total ${_kamMoney(deudaTotal)} · Abonado total ${_kamMoney(abonadoTotal)} · Saldo total ${_kamMoney(saldoTotal)}</div>
    </div>`;
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
  }
}
// [FIN-1e] AQUÍ VIVÍAN _kamAbonoCrear Y _kamAbonoEliminar. Se retiran enteras:
// sus dos acciones del backend están cerradas, y dejar funciones que solo saben
// pedir un 403 es plantarle una trampa al siguiente que las lea.
//
// El brinco a la puerta buena: lleva a Gastos CON EL EVENTO YA PUESTO y el modal
// abierto. Sin el evento, el bloque de proveedor de FIN-1a no aparece —la deuda
// es por evento— y el viaje no habría servido de nada.
async function _fin1eIrAGastos(slug) {
  showPage('gastos');
  const base = String(slug || '').split('#')[0];
  // El modal limpia el evento al abrir, así que primero se abre y luego se pone.
  if (typeof nuevoGasto === 'function') nuevoGasto();
  const sel = document.getElementById('gasto-evento');
  if (!sel || !base) return;
  // Las opciones de este select las puebla _poblarSelectsGastos, que es ASÍNCRONA
  // y puede no haber corrido nunca (si Memo no ha entrado a Gastos en esta
  // sesión). Poner el value antes de que existan las opciones no truena: se
  // queda en '' y el viaje llega sin evento — que fue justo lo que cazó el
  // arnés. Se espera a que estén.
  if (typeof _poblarSelectsGastos === 'function') { try { await _poblarSelectsGastos(); } catch (_) {} }
  // Si el select trae la fecha exacta (multifecha) se elige ésa; si no, la base.
  const opt = [...sel.options].find((o) => o.value === slug)
           || [...sel.options].find((o) => String(o.value).split('#')[0] === base);
  if (opt) { sel.value = opt.value; if (typeof _fin1aOnEvento === 'function') _fin1aOnEvento(); }
}
async function _kmsCuentaCargar() {
  const sel = document.getElementById('kam-evt-sel');   // la MISMA fuente que el resto
  const evId = sel ? sel.value : '';
  const cont = document.getElementById('kms-cuenta');
  if (!cont) return;
  _kmsCuenta = null;
  if (!evId) { cont.innerHTML = ''; return; }
  cont.innerHTML = '<div class="kmc-cargando">Sacando la cuenta del evento…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-cuenta-evento', {
      method: 'POST', body: JSON.stringify({ evento_id: evId }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo sacar la cuenta');
    _kmsCuenta = d.cuenta || null;
  } catch (e) {
    // Fails-soft: sin la cuenta, el Palacio es el de antes. Se DICE que no se
    // pudo, en vez de pintar ceros — un cero aquí se leería como "no vendiste".
    cont.innerHTML = `<div class="kmc-cargando">No se pudo sacar la cuenta del evento (${_esfEsc(e.message)}). Lo demás del Palacio sigue funcionando.</div>`;
    return;
  }
  _kmsCuentaPintar();
}
// El importe o, si no se puede saber, la palabra. Un `null` de la cuenta
// significa "no se puede afirmar" (p.ej. sin permiso para ver migrados), y eso
// NO es cero.
function _kmcVal(v) { return v == null ? '<span class="kmc-nd">sin dato</span>' : _kmcMoney(v); }
// [UTIL-C-2] El signo VA AFUERA del peso. `_kamMoney` lo mete adentro y produce
// "$-28,720", que se lee mal y en esta pantalla va a ser lo NORMAL: bajo la
// fórmula C un evento recién cargado nace en rojo y se endereza cobrando. No se
// toca `_kamMoney` —lo usan decenas de lugares que no he medido—: se formatea
// aquí, donde el negativo es el caso de todos los días.
function _kmcMoney(n) {
  const v = Number(n) || 0;
  return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('es-MX', { maximumFractionDigits: 2 });
}
function _kmsCuentaPintar() {
  const cont = document.getElementById('kms-cuenta');
  if (!cont) return;
  const c = _kmsCuenta;
  if (!c) { cont.innerHTML = ''; return; }
  const d = _kmsDatos || {};
  const esc = _kmsEscenarios(c, d);
  const util = c.ganancia;
  const cls = util == null ? '' : (util >= 0 ? 'kmc-hero-ok' : 'kmc-hero-mal');

  cont.innerHTML = `
    <!-- [UTIL-C-2] LA UTILIDAD, GRANDE Y SOLA. Bajo UTIL-B la tarjeta tenía
         cinco celdas del mismo tamaño y la utilidad era una de cinco: Memo
         tenía que buscarla. Es EL número de la pantalla, así que se pinta como
         tal, con su fórmula escrita debajo — el número cambió de significado
         dos veces en agosto y una cifra grande sin fórmula se lee con la
         definición que cada quien recuerde. -->
    <div class="kmc-hero ${cls}">
      <div class="kmc-hero-l">UTILIDAD DEL EVENTO</div>
      <div class="kmc-hero-v">${_kmcVal(util)}</div>
      <div class="kmc-hero-f">${_kmcVal(c.en_mano)} cobrado − ${_kmcVal(c.inversion_boletos)} de boletos − ${_kmcVal(c.gastos)} de gastos${c.inversion_parcial ? ' · <b>incompleta</b>' : ''}</div>
    </div>
    <div class="kmc-grid">
      <div class="kmc-c"><div class="kmc-l">COBRADO</div><div class="kmc-v">${_kmcVal(c.en_mano)}</div>
        <div class="kmc-s">dinero que ya entró</div></div>
      <div class="kmc-c"><div class="kmc-l">INVERSIÓN EN BOLETOS</div><div class="kmc-v">${_kmcVal(c.inversion_boletos)}</div>
        <div class="kmc-s">${c.inversion_parcial ? 'INCOMPLETA: hay compras sin costo capturado' : 'TODOS los del evento, vendidos o no'}</div></div>
      <div class="kmc-c"><div class="kmc-l">GASTOS</div><div class="kmc-v">${_kmcVal(c.gastos)}</div>
        <div class="kmc-s">del evento, sin boletos</div></div>
      <div class="kmc-c"><div class="kmc-l">VENDIDO</div><div class="kmc-v">${_kmcVal(c.facturado)}</div>
        <div class="kmc-s">contratado · ${_kmcVal(c.pendiente)} por cobrar</div></div>
      <div class="kmc-c"><div class="kmc-l">DEUDA A PROVEEDORES</div><div class="kmc-v">${_kmcVal(c.deuda_proveedores)}</div>
        <div class="kmc-s">boletos por pagar · no resta de la utilidad</div></div>
    </div>
    ${esc.html}`;
}
// ═══ [UTIL-C-2] EL PANEL DE ESCENARIOS ═════════════════════════════════════
// Reemplaza al PUNTO DE QUIEBRE de UTIL-B-3, y no por gusto: aquél era una
// cuenta propia —`(gastos + inversión) − cobrado`— que bajo la fórmula C es
// exactamente `−utilidad`. Mantenerlo sería tener la misma cifra calculada en
// dos lugares, que es de lo que trata la mitad de este libro.
//
// Aquí ya no se calcula una utilidad paralela: se PROYECTA la que la fuente
// única ya dio, contestando las cuatro preguntas que Memo se hace frente a esta
// pantalla:
//
//   (a) para verdes, ¿cuánto falta?        → −utilidad
//   (b) si todos los que ya compraron pagan → utilidad + por cobrar
//   (c) y si con eso no basta, ¿cuántos boletos son?
//   (d) si no vendo uno más, ¿en cuánto cierro?
//
// ⚠️ (c) SE CUENTA DESDE (b), no desde (a). Cobrar lo ya vendido y vender de
// nuevo son dos dineros distintos: pedirle a la venta nueva que cubra los
// $28,720 completos cuando $23,100 ya están contratados haría que la pantalla
// pidiera casi el doble de boletos de los que hacen falta.
//
// Y todo va con palabras, no solo con cifras: es una PROYECCIÓN, y una
// proyección sin la condición escrita al lado se lee como dinero que ya existe.
function _kmsEscenarios(c, d) {
  const util = c.ganancia;
  const nd = (t) => `<div class="kmc-esc"><div class="kmc-e kmc-e-nd">${t}</div></div>`;
  if (util == null) return { html: nd('No se pueden calcular los escenarios sin ver el dinero de los migrados.') };

  const porCobrar = Number(c.pendiente) || 0;
  const filas = [];
  const fila = (clase, txt, nota) => filas.push(
    `<div class="kmc-e kmc-e-${clase}">${txt}${nota ? `<div class="kmc-e-nota">${nota}</div>` : ''}</div>`);

  // ── (a) ¿cuánto falta para verdes?
  if (util >= 0) {
    fila('ok', `Este evento <b>ya gana</b>: ${_kmcMoney(util)}.`,
      'De aquí en adelante, cada boleto que cobres completo suma completo.');
  } else {
    fila('mal', `Para verdes te faltan <b>${_kmcMoney(-util)}</b>.`,
      'Entre cobrar lo que ya vendiste y vender lo que queda.');
  }

  // ── (b) si todos los que ya compraron te pagan
  const b = util + porCobrar;
  if (porCobrar > 0) {
    fila(b >= 0 ? 'ok' : 'cerca',
      `Si <b>todos</b> los que ya compraron te pagan sus ${_kmcMoney(porCobrar)}: <b>${_kmcMoney(b)}</b>.`,
      b >= 0 ? 'Con eso solo, el evento cierra en verde.' : 'Sigue faltando, pero ya es otra cifra.');
  } else {
    fila('nd', 'No hay nada por cobrar: quien compró, ya pagó.');
  }

  // ── (c) el mínimo de venta NUEVA — solo si con cobrar todo no basta
  if (b < 0) {
    const falta = -b;
    const precios = d.precios || {};
    const conPrecio = (d.zonas || [])
      .filter((z) => z && Number(z.disponibles) > 0)
      .map((z) => ({ n: z.zona, disp: Number(z.disponibles), p: Number(precios[String(z.zona).trim()]) }))
      .filter((z) => Number.isFinite(z.p) && z.p > 0);

    if (!conPrecio.length) {
      fila('nd', `Faltarían <b>${_kmcMoney(falta)}</b> de venta nueva, pero no hay zonas con lugares y precio para decir cuántos boletos son.`);
    } else {
      const techo = conPrecio.reduce((a, z) => a + z.disp * z.p, 0);
      if (techo < falta) {
        fila('mal', `Ni vendiendo <b>todo</b> lo que queda (${_kmcMoney(techo)}) llegas a los <b>${_kmcMoney(falta)}</b> que faltarían.`,
          'Aquí la salida no es vender más: es el precio, una promoción, o asumir el evento en rojo.');
      } else {
        // Las zonas que alcanzan SOLAS, de menos boletos a más. Se muestran
        // hasta tres: Memo elige por lo que de verdad se está moviendo, y una
        // sola opción impuesta se lee como una orden.
        const solas = conPrecio
          .filter((z) => z.disp * z.p >= falta)
          .map((z) => Object.assign({}, z, { req: Math.ceil(falta / z.p) }))
          .sort((a, b2) => a.req - b2.req || b2.p - a.p)
          .slice(0, 3);
        if (solas.length) {
          const opts = solas.map((z) => `<b>${z.req}</b> de ${_esfEsc(z.n)} <span class="kmc-e-p">(${_kmcMoney(z.p)} c/u)</span>`).join(' · ');
          fila('cerca', `Mínimo de venta nueva: <b>${_kmcMoney(falta)}</b> — ${opts}.`,
            'Cobrados COMPLETOS: un boleto apartado todavía no es dinero.');
        } else {
          // Ninguna zona alcanza sola, pero el techo sí: se arma la combinación
          // que pide menos boletos (de la más cara a la más barata).
          let resto = falta;
          const plan = [];
          conPrecio.slice().sort((a, b2) => b2.p - a.p).forEach((z) => {
            if (resto <= 0) return;
            const cuantos = Math.min(z.disp, Math.ceil(resto / z.p));
            if (cuantos > 0) { plan.push({ n: z.n, cuantos, p: z.p }); resto -= cuantos * z.p; }
          });
          const txt = plan.map((z) => `<b>${z.cuantos}</b> de ${_esfEsc(z.n)}`).join(' + ');
          fila('cerca', `Mínimo de venta nueva: <b>${_kmcMoney(falta)}</b> — ninguna zona alcanza sola: ${txt}.`,
            'Cobrados COMPLETOS: un boleto apartado todavía no es dinero.');
        }
      }
    }
  }

  // ── (d) el cierre si no se vende un boleto más
  fila(b >= 0 ? 'ok' : 'mal',
    `Si <b>no vendes ni un boleto más</b> y todos los de hoy te pagan, cierras en <b>${_kmcMoney(b)}</b>.`,
    'Menos lo que te falte por gastar: hotel, camión y lo que todavía no capturas no están en este número.');

  return { html: `<div class="kmc-esc"><div class="kmc-esc-l">SI PASA ESTO, PASA ESTO OTRO</div>${filas.join('')}</div>` };
}
// ═══ [KMS-SIMP-1] LA TABLA DE TANDA ════════════════════════════════════════
// Lee los renglones llenos, calcula a la vista y guarda una compra POR RENGLÓN.
// No hay endpoint nuevo: usa `admin-compras` con accion 'crear', que es una
// fila por compra — por eso "agregar, nunca sobrescribir" ya es lo nativo.
function _kmtFilas() {
  const out = [];
  document.querySelectorAll('#kmt-wrap tbody tr[data-zi]').forEach((tr) => {
    const zi = parseInt(tr.getAttribute('data-zi'), 10);
    const cant = (document.getElementById('kmt-cant-' + zi) || {}).value;
    const costo = (document.getElementById('kmt-costo-' + zi) || {}).value;
    const sc = String(cant == null ? '' : cant).trim();
    const su = String(costo == null ? '' : costo).trim();
    const c = parseInt(sc, 10);
    // ⚠️ VACÍO NO ES CERO. `Number('')` da **0**, y con eso un renglón con
    // cantidad y SIN costo pasaba como válido: habría creado una compra de $0
    // en silencio. Se mira la CADENA antes de convertir. (La misma trampa que
    // `_numDinero` evita en MIG-1a; aquí se me había colado.)
    const u = su === '' ? NaN : Number(su);
    // Un renglón vacío simplemente NO se guarda: no hay que borrarlo ni entrar
    // a decir que no. Vacío en LOS DOS campos es "esta zona no va en la tanda".
    const vacio = sc === '' && su === '';
    out.push({ zi, zona: _kamZonasMap[zi], cant: c, costo: u, vacio,
      valido: !vacio && Number.isInteger(c) && c > 0 && Number.isFinite(u) && u >= 0 });
  });
  return out;
}
function _kmtCalc() {
  const filas = _kmtFilas();
  let boletos = 0, dinero = 0, zonas = 0, malas = 0;
  filas.forEach((f) => {
    const el = document.getElementById('kmt-sub-' + f.zi);
    if (f.vacio) { if (el) { el.textContent = '—'; el.classList.remove('kmt-mal'); } return; }
    if (!f.valido) { if (el) { el.textContent = 'revisar'; el.classList.add('kmt-mal'); } malas++; return; }
    const sub = f.cant * f.costo;
    if (el) { el.textContent = _kamMoney(sub); el.classList.remove('kmt-mal'); }
    boletos += f.cant; dinero += sub; zonas++;
  });
  const r = document.getElementById('kmt-resumen');
  if (r) {
    r.innerHTML = zonas
      ? `<b>${zonas}</b> zona${zonas !== 1 ? 's' : ''} · <b>${boletos}</b> boleto${boletos !== 1 ? 's' : ''} · <b>${_kamMoney(dinero)}</b>` +
        (malas ? ` <span class="kmt-mal">· ${malas} por revisar</span>` : '')
      : (malas ? `<span class="kmt-mal">${malas} renglón${malas !== 1 ? 'es' : ''} por revisar</span>` : 'Ninguna zona capturada todavía.');
  }
  return { filas, zonas, malas, boletos, dinero };
}
// [KMS-SIMP-2] Alta de proveedor desde la tabla. NO duplica el endpoint ni la
// regla: llama al MISMO `admin-proveedores` accion 'crear' que el paso ①, y
// después al MISMO `_kamProveedoresLoad` + `_kamProvSelectsRefrescar`, para que
// el proveedor nuevo quede elegido aquí y exista en todas las demás pantallas.
async function _kmtProvNuevo() {
  const nombre = (window.prompt('Nombre del proveedor nuevo:') || '').trim();
  if (!nombre) return;
  _kmtError('');
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-proveedores', {
      method: 'POST', body: JSON.stringify({ accion: 'crear', nombre }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo agregar el proveedor');
    await _kamProveedoresLoad();
    _kamProvSelectsRefrescar((d.proveedor && d.proveedor.id) || null);
    // ⚠️ `_kamProvSelectsRefrescar` CONSERVA lo que ya estaba elegido si sigue
    // existiendo — es la regla de PRV-1 y está bien para un refresco cualquiera.
    // Pero aquí el proveedor se acaba de crear DESDE ESTE BOTÓN, y quien lo creó
    // es porque lo va a usar. Se elige aquí, en local, sin tocar la función
    // compartida (que otras pantallas siguen necesitando como está).
    const nuevo = (d.proveedor && d.proveedor.id) || null;
    const selT = document.getElementById('kmt-prov');
    if (nuevo && selT && [...selT.options].some((o) => o.value === String(nuevo))) selT.value = String(nuevo);
    if (typeof showToast === 'function') showToast('Proveedor agregado ✓', 'success');
  } catch (e) {
    _kmtError((e && e.message) || 'No se pudo agregar el proveedor.');
  }
}
function _kmtError(msg) {
  const e = document.getElementById('kmt-error');
  if (!e) return;
  if (!msg) { e.style.display = 'none'; e.textContent = ''; return; }
  e.style.display = ''; e.textContent = msg;
}
async function _kmtGuardar() {
  _kmtError('');
  // ⚠️ SE LEE `kam-evt-sel`, EL MISMO QUE `_kamCompraCrear`. Es el selector
  // espejo que KMS-1 dejó oculto, y es de donde toma el evento el guardado que
  // ya existía. Leer `kms-evt` (el mando visible) parecería más natural y sería
  // una SEGUNDA fuente del mismo dato: el día que el espejo cambie de forma,
  // la tabla y el alta de una zona guardarían en eventos distintos.
  // (Mi primer intento llamaba a `_kmsEventoId()`, que NO EXISTE — y un
  // identificador no declarado no da undefined: LANZA.)
  const sel = document.getElementById('kam-evt-sel');
  const evId = sel ? sel.value : '';
  if (!evId) return _kmtError('Elige un evento primero.');
  const prov = (document.getElementById('kmt-prov') || {}).value || '';
  const fecha = (document.getElementById('kmt-fecha') || {}).value || '';
  const nota = ((document.getElementById('kmt-nota') || {}).value || '').trim();
  // [KMS-SIMP-5] ESTE CANDADO YA EXISTÍA Y ERA INALCANZABLE. Sin la opción
  // vacía, `prov` NUNCA venía vacío: traía el primer proveedor del catálogo.
  // Una guarda que no puede fallar se lee como protección y no protege nada —
  // la misma trampa que la rama `force` bajo un `schedule` en WL-2.
  //
  // Y ojo con lo que el servidor SÍ hacía bien: `admin-compras` valida que el
  // `proveedor_id` sea un UUID y que exista. No era el hoyo. El navegador le
  // mandaba un id **válido pero equivocado**, y eso ningún servidor lo puede
  // distinguir: a quién le compraste solo lo sabe quien capturó.
  if (!prov) {
    const selP = document.getElementById('kmt-prov');
    if (selP) { try { selP.focus(); } catch (_) { /* sin foco, igual se ve el error */ } }
    return _kmtError('Elige el proveedor de la tanda: sin él no se sabe a quién le compraste ni a quién le debes.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return _kmtError('La fecha de la tanda no es válida.');
  const { filas, zonas, malas } = _kmtCalc();
  if (malas) return _kmtError('Hay ' + malas + ' renglón(es) a medias: la cantidad va entera y mayor que cero, y el costo no puede ser negativo.');
  if (!zonas) return _kmtError('No capturaste ninguna zona.');

  const btn = document.getElementById('kmt-guardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  const buenas = filas.filter((f) => f.valido);
  const fallaron = [];
  let hechas = 0;
  // Una a una y EN SERIE: si el servidor rechaza la quinta, las cuatro
  // primeras ya quedaron guardadas y hay que poder decir CUÁLES. Un
  // Promise.all escondería cuál falló detrás del primer error.
  for (const f of buenas) {
    try {
      const r = await khAdminFetch('/.netlify/functions/admin-compras', {
        method: 'POST',
        body: JSON.stringify({ accion: 'crear', evento_id: evId, zona: f.zona,
          cantidad: f.cant, costo_unitario: f.costo, proveedor_id: prov, fecha, nota: nota || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || 'no se pudo');
      hechas++;
      // Se limpia el renglón que YA quedó: si algo truena a medias, en la
      // pantalla se queda exactamente lo que falta por guardar.
      const a = document.getElementById('kmt-cant-' + f.zi); if (a) a.value = '';
      const b2 = document.getElementById('kmt-costo-' + f.zi); if (b2) b2.value = '';
    } catch (e) {
      fallaron.push(f.zona + ' (' + ((e && e.message) || 'error') + ')');
    }
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Guardar el pedido'; }
  _kmtCalc();
  if (fallaron.length) {
    _kmtError('Se guardaron ' + hechas + ' de ' + buenas.length + '. NO se guardaron: ' + fallaron.join(' · ') +
      '. Lo que quedó en la tabla es lo que falta.');
  } else {
    if (typeof showToast === 'function') showToast(hechas + ' zona' + (hechas !== 1 ? 's' : '') + ' cargada' + (hechas !== 1 ? 's' : '') + ' ✓', 'success');
  }
  // ⚠️ `_kamComprasLoad` RE-PINTA la lista entera, y con ella la tabla: el
  // <details> se cierra y los renglones que quedaban pendientes se pierden.
  // Se guardan antes y se reponen después. Sin esto, un guardado parcial
  // borraba de la pantalla justo lo que faltaba por capturar.
  const pendientes = _kmtFilas()
    .filter((f) => !f.vacio)
    .map((f) => ({ zi: f.zi,
      cant: (document.getElementById('kmt-cant-' + f.zi) || {}).value || '',
      costo: (document.getElementById('kmt-costo-' + f.zi) || {}).value || '' }));
  // Recargar SIEMPRE, aunque algo haya fallado: lo que sí entró tiene que verse.
  await _kamComprasLoad();
  const w = document.getElementById('kmt-wrap');
  if (w) w.setAttribute('open', '');
  pendientes.forEach((x) => {
    const a = document.getElementById('kmt-cant-' + x.zi); if (a) a.value = x.cant;
    const b3 = document.getElementById('kmt-costo-' + x.zi); if (b3) b3.value = x.costo;
  });
  _kmtCalc();
}
async function _kamCompraEliminar(id) {
  if (!confirm('¿Eliminar esta compra?')) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-compras', { method: 'POST', body: JSON.stringify({ accion: 'eliminar', id }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo eliminar la compra');
    _kamComprasLoad();
  } catch (e) { _kamComprasAlert(e.message); }
}
// [FASE B t3] ¿Puede editar el offset "vendidos fuera"? roshi/bulma.
function _kamPuedeStock() { return ['maestro_roshi', 'bulma'].includes(currentUser && currentUser.rol); }
// [FASE B t3 · KMS-SIMP-3] La PELÍCULA de stock de una zona. Antes esta función
// devolvía la película Y la casilla de "vendidos fuera" pegadas. Se parten
// porque ahora van a sitios distintos: la película arriba, a la vista, y la
// casilla plegada abajo — es un puente de transición, no una cifra del día.
function _kamSemaforoHtml(sem) {
  let film = '';
  if (sem) {
    const est = sem.estado; // verde | amarillo | rojo | negativo
    const alerta = est === 'negativo'
      ? '<span class="kam-sem-alerta">⚠ SOBREVENTA — revisa ya</span>' : '';
    film = `<div class="kam-sem kam-sem-${_esfEsc(est)}">
      <span class="kam-sem-i">Compradas <b>${sem.compradas}</b></span>
      <span class="kam-sem-i">Vendidas fuera <b>${sem.fuera}</b></span>
      ${sem.migrados ? `<span class="kam-sem-i">Migrados <b>${sem.migrados}</b></span>` : ''}
      <span class="kam-sem-i">Seguras <b>${sem.seguras}</b></span>
      <span class="kam-sem-i">Apartadas <span class="kam-sem-clk">⏱</span> <b>${sem.apartadas}</b></span>
      <span class="kam-sem-i kam-sem-disp">${sem.disponibles == null
        ? 'Sin stock cargado <b>—</b>'
        : `Disponibles <b>${sem.disponibles}</b>`}</span>
      ${alerta}
    </div>`;
  }
  return film;
}
// [KMS-SIMP-3] La casilla de "vendidos fuera", ahora PLEGADA y con su letrero.
//
// No se borra —y por eso el letrero lo dice en voz alta—: hoy es lo ÚNICO que
// alimenta el semáforo con las ventas que no pasaron por el sistema. Cuando
// MIG-1b sume `viajeros_evento` como cuarto término de la disponibilidad, este
// puente sobra. Mientras tanto, pasa a segundo plano: se abre solo si lo buscas.
function _kamAjusteHtml(sem, zi) {
  if (!_kamPuedeStock()) return '';   // el resto solo ve la película
  const fuera = sem ? sem.fuera : 0;
  const nota = (sem && sem.ajuste && sem.ajuste.nota) ? sem.ajuste.nota : '';
  const meta = (sem && sem.ajuste && sem.ajuste.updated_por)
    ? `<span class="kam-sem-meta">último ajuste: ${_esfEsc(sem.ajuste.updated_por)}</span>` : '';
  return `<details class="kam-ajuste-wrap">
    <summary class="kam-ajuste-sum">Vendidos fuera del sistema${fuera > 0 ? ` <b>${fuera}</b>` : ''}</summary>
    <div class="kam-ajuste">
      <input class="cot-input kam-ajuste-num" id="kam-fuera-${zi}" type="number" min="0" value="${fuera}" aria-label="Vendidos fuera del sistema">
      <input class="cot-input kam-ajuste-nota" id="kam-fuera-nota-${zi}" placeholder="Nota (ej. corte Excel 24-jul)" maxlength="500" value="${_esfEsc(nota)}">
      <button class="btn btn-ghost btn-sm" type="button" onclick="_kamAjusteGuardar(${zi})">Guardar</button>
    </div>
    <div class="kam-ajuste-nota-pie">Puente de transición: es lo único que le cuenta al semáforo las ventas que no pasaron por el sistema. Se retira cuando MIG-1b sume los viajeros migrados a la disponibilidad.${meta ? ' · ' + meta : ''}</div>
  </details>`;
}
// [FASE B t3] Guarda el offset "vendidos fuera" (stock_ajustes) por zona.
async function _kamAjusteGuardar(zi) {
  const sel = document.getElementById('kam-evt-sel');
  const evId = sel ? sel.value : '';
  const zona = _kamZonasMap[zi];
  if (!evId || zona == null) return;
  _kamComprasAlert('');
  const v = parseInt(document.getElementById('kam-fuera-' + zi)?.value, 10);
  if (!Number.isInteger(v) || v < 0) { _kamComprasAlert('Vendidos fuera: entero >= 0.'); return; }
  const nota = (document.getElementById('kam-fuera-nota-' + zi)?.value || '').trim();
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-compras', {
      method: 'POST',
      body: JSON.stringify({ accion: 'ajuste_guardar', evento_id: evId, zona, vendidos_fuera: v, nota: nota || null }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo guardar el ajuste');
    _kamComprasLoad(); // recarga con el semáforo recalculado
  } catch (e) { _kamComprasAlert(e.message); }
}