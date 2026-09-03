// =============================================================================
// kamehouse-esferas.js — la pantalla de Esferas, sacada del tronco (MONO-1)
// =============================================================================
// 216 funciones y 3,573 líneas: la pantalla más grande de KameHouse y la más
// aislada —93% de lo que usa es suyo—. Por eso va primera: si el método
// funciona aquí, funciona.
//
// Este archivo contiene SOLO funciones, en el MISMO ORDEN en que vivían en
// `kamehouse.js`, con su comentario pegado. Cero código de nivel superior: el
// estado global —166 `let`, 122 `const`— se queda íntegro en el tronco, que es
// otra tuerca con su propia medición. Extraer funciones y migrar estado son dos
// peligros distintos y no se mezclan.
//
// Los `<script>` son clásicos, no módulos: las funciones se izan y siguen
// siendo globales, así que los `onclick` del HTML no se enteran.
//
// ⚠️ EL ORDEN DE CARGA IMPORTA: este archivo va ANTES del tronco. El nivel
// superior del tronco guarda `_esfEsPorConfirmar` como VALOR dentro de
// `_ESF_MINIMO`, y una función declarada en un script posterior todavía no
// existe para el anterior. Lo cazó el humo de navegador; mi detector estático
// dijo DOS VECES que no había dependencia de evaluación y las dos se equivocó.
// La autoridad aquí es cargar la página, no contar identificadores.
//
// ⚠️ El careo de esta tuerca es de RECONSTRUCCIÓN: volver a intercalar estos
// bloques en el tronco tiene que devolver el `kamehouse.js` original BYTE A
// BYTE. Si mueves una línea de lugar, el arnés lo dice. Por eso el orden no se
// "mejora" aquí: ordenar es otra tuerca.
// =============================================================================

// SEG-1 · Las acciones de la fila. Los pendientes de la última posposición se
// pintan AQUÍ porque un pendiente que no se ve es un pendiente que no existe:
// `pos` viene de la bitácora (esferas-listar), así que sobrevive a recargar y
// se ve igual desde cualquier equipo.
// El ↻ dejó de ser un botón de siempre: volver a mover cuotas ya movidas es un
// error de dinero silencioso, así que sólo aparece como REINTENTO de lo que falló.
// ═══ [ESF-UX-1f] AGOTAR DESDE LA FILA ═════════════════════════════════════
// Agotar era: abrir el evento, ir a la pestaña "Qué vende", bajar al selector
// de status, elegir Agotado y guardar. Aquí es un clic.
//
// Dos verbos explícitos —Agotar y Reabrir— en vez de un botón que alterna,
// que es como ya lo resuelve el bloque de multifecha. Un botón que cambia de
// significado según un estado que no se ve obliga a leerlo dos veces.
//
// ⚠️ Manda `{slug, status}` Y NADA MÁS. Es la primera llamada PARCIAL a
// `esferas-actualizar`; el saneador del servidor tuvo que dejar de inventar
// una llave que nadie mandó (ver `_sanePkg` allá).
async function agotarEsferaFila(slug, agotar, btn) {
  if (!slug || (btn && btn.disabled)) return;
  const antes = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = agotar ? 'Agotando…' : 'Reabriendo…'; }
  try {
    const r = await khAdminFetch('/.netlify/functions/esferas-actualizar', {
      method: 'POST',
      body: JSON.stringify({ slug: slug, status: agotar ? 'agotado' : '' }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(d.error || 'No se pudo cambiar el status');
    }
    _esfAviso(agotar
      ? '✓ <b>' + slug + '</b> quedó agotado. Se ve en el sitio al publicar.'
      : '✓ <b>' + slug + '</b> volvió a la venta. Se ve en el sitio al publicar.');
    loadEsferasEventos();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.innerHTML = antes; }
    _esfAviso(err.message, 'error');
  }
}
function _esfAcciones(e) {
  const s = _esfEsc(e.slug);
  // [ESF-ARCHIVO-1] Un archivado es un registro de algo que YA PASÓ. Posponer una
  // fecha vencida no significa nada, y Cancelar manda correos de reembolso a
  // clientes de un evento que ya ocurrió. "Solo consulta" tiene que ser verdad
  // en los botones, no solo en el letrero. Editar SÍ se queda: corregir un
  // nombre en un registro es legítimo — el veto es publicar, no tocar.
  if (e.archivado) {
    return `<button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="editarEsfera('${s}')"><svg class="ic"><use href="#ic-lapiz"/></svg> Editar</button>`;
  }
  const pos = e.pos || null;
  const faltaAvisar = !!(pos && pos.aviso_pendiente);
  const atoradas = pos ? (pos.pagos_fallidos_n || 0) : 0;
  return `
    <button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="editarEsfera('${s}')"><svg class="ic"><use href="#ic-lapiz"/></svg> Editar</button>
    ${e.status === 'agotado'
      ? `<button class="btn btn-ghost btn-sm" data-agotar="reabrir" style="font-size:10px" onclick="agotarEsferaFila('${s}', false, this)" title="Vuelve a ponerlo a la venta">↺ Reabrir</button>`
      : `<button class="btn btn-ghost btn-sm" data-agotar="agotar" style="font-size:10px" onclick="agotarEsferaFila('${s}', true, this)" title="Marca el evento agotado. Se ve en el sitio al publicar. Se deshace con Reabrir.">● Agotar</button>`}
    <button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="posponerEsfera('${s}')"><svg class="ic"><use href="#ic-eventos"/></svg> Posponer</button>
    <button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="avisarPosposicion('${s}')"><svg class="ic"><use href="#ic-correo"/></svg> Avisar</button>
    ${faltaAvisar ? `<span data-seg1="falta-avisar" style="display:inline-block;padding:2px 8px;border-radius:var(--r-sm,8px);background:rgba(255,165,0,.15);color:var(--orange);font-size:11px;font-weight:700" title="Se pospuso al ${_esfEsc(pos.fecha_nueva)} y todavía no se avisa a los clientes">⚠ falta avisar</span>` : ''}
    ${atoradas > 0 ? `<button data-seg1="reintentar" class="btn btn-ghost btn-sm" style="font-size:10px;color:var(--orange)" onclick="recalcularPagosPosposicion('${s}')" title="${atoradas} cuota(s) no se pudieron recorrer al posponer">↻ Reintentar ${atoradas}</button>` : ''}
    <button class="btn btn-ghost btn-sm" style="font-size:10px;color:var(--red)" onclick="cancelarEventoCompleto('${s}')"><svg class="ic"><use href="#ic-prohibido"/></svg> Cancelar</button>`;
}
// El orden lo pone `_evOrdenarPorFecha`, la fuente de ORD-1 — no un sort nuevo.
// Pero esa función lee `dsList`/`ds`/`fecha`, y una fila de Esferas trae
// `fecha_inicio`/`fechas_extra`/`multifecha`: pasarla tal cual las mandaría a
// TODAS al grupo "sin fecha" y las ordenaría por nombre. Por eso se adapta la
// fila a la forma que la regla ya sabe leer, en vez de escribir una regla nueva.
function _esfComoEvento(e) {
  const f = [];
  const add = (v) => { if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) f.push(v.trim()); };
  add((e.fecha_inicio || '').slice(0, 10));
  let ex = e.fechas_extra;
  if (typeof ex === 'string') { try { ex = JSON.parse(ex); } catch (_) { ex = null; } }
  if (Array.isArray(ex)) ex.forEach(add);
  let mf = e.multifecha;
  if (typeof mf === 'string') { try { mf = JSON.parse(mf); } catch (_) { mf = null; } }
  if (Array.isArray(mf)) mf.forEach((m) => add(m && m.ds));
  return { dsList: f.sort(), nombre: e.nombre || e.slug, __slug: e.slug };
}
// El veredicto sale de `_evGrupoOrden`, el MISMO que usa el orden: si el filtro
// juzgara distinto que el sort, un "pasado" podría aparecer entre los próximos.
// 0 = próximo · 1 = sin fecha · 2 = pasado.
//
// SIN FECHA CUENTA COMO PRÓXIMO. Un evento por confirmar está pendiente, no es
// historia — y esconderlo detrás de "pasados" es donde se pierde.
function _esfPasaFiltro(adaptado, filtro, hoy, fila) {
  const g = _evGrupoOrden(adaptado, hoy);
  if (filtro === 'pasado') return g === 2;
  if (filtro === 'proximo') return g !== 2;
  // [ESF-LISTA-2] AGOTADOS, y SOLO entre los próximos: un pasado agotado es
  // historia, no una decisión pendiente. Memo lo usa para revisar si revive el
  // evento o compra más boletos — y eso solo tiene sentido si aún no ocurre.
  if (filtro === 'agotado') return g !== 2 && String((fila && fila.status) || '') === 'agotado';
  // [ESF-UX-2] PROMOS. Corte de CAPTURA: trae promo escrita en Esferas.
  //
  // ⚠️ Los ARCHIVADOS quedan fuera, y no por estética: un archivo es el registro
  // de un evento cuyo `index.html` sigue siendo la fuente de verdad — no se
  // puede publicar ni gobernar desde aquí, así que ofrecer "edita su promo"
  // sería ofrecer una edición que no llega a ninguna parte.
  //
  // Los PASADOS no archivados SÍ entran: son filas gobernables de verdad, y una
  // promo colgada de un evento que ya ocurrió es justo lo que hay que ver para
  // retirarla. Si algún día estorban, el chip // pasados ya existe para eso.
  if (filtro === 'promo') return !(fila && fila.archivado) && _esfTienePromo(fila);
  return true;
}
// ═══ [ESF-UX-2] QUÉ PROMO TRAE UNA FILA ═══════════════════════════════════
// UNA sola función contesta las dos preguntas del chip —¿cuenta? y ¿qué dice?—
// porque son la misma pregunta: si hay algo que enseñar, cuenta. Partirlas en
// un "tienePromo" y un "pintaPromo" independientes es como se llega a un chip
// que dice (6) y a una lista que enseña 5 letreros.
//
// Tres campos, tres formas: `promo_code` es texto, `promo_label` es texto, y
// `flash_promo` es un JSON que llega como string desde Supabase y como objeto
// recién guardado desde el formulario. Los tres se leen aquí; nadie más los
// interpreta para la lista.
function _esfPromoFlashObj(raw) {
  let o = raw;
  if (typeof o === 'string') {
    const t = o.trim();
    if (!t || t === 'null') return null;
    try { o = JSON.parse(t); } catch (_) { return null; }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  return Object.keys(o).length ? o : null;
}
// El vencimiento del flash se lee EN REYNOSA (−05:00 todo el año), la misma
// regla con la que se teclea en el formulario. Pintarlo en la hora del
// navegador enseñaría un vencimiento distinto al que Memo escribió.
function _esfEnReynosa(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n)) return '';
  try {
    return new Date(n).toLocaleString('sv-SE', { timeZone: TZ_REYNOSA }).slice(0, 16);
  } catch (_) { return ''; }
}
function _esfPromoFlashVence(o) { return _esfEnReynosa(o && o.expiresTs); }
// Devuelve [] si no trae promo, o los pedazos de letrero que la fila enseña.
// El texto es el CAPTURADO, recortado, nunca un veredicto: esta función no
// sabe —ni puede saber— si la promo sigue viva.
// `opts.sinVence` quita el vencimiento del pedacito del flash: cuando arriba ya
// va el renglón de ESTADO (que lo dice con todas sus letras), repetirlo abajo
// es la misma fecha dos veces en dos renglones pegados. Se midió mirando la
// captura, no el diff.
function _esfPromoPartes(fila, opts) {
  if (!fila) return [];
  const partes = [];
  const code = String(fila.promo_code == null ? '' : fila.promo_code).trim();
  const label = String(fila.promo_label == null ? '' : fila.promo_label).trim();
  const flash = _esfPromoFlashObj(fila.flash_promo);
  if (code) partes.push('⚑ ' + code);
  if (label) partes.push(label.length > 72 ? label.slice(0, 71) + '…' : label);
  if (flash) {
    const fc = String(flash.code == null ? '' : flash.code).trim();
    let t = '⚡ ' + (fc || 'flash');
    if (Number.isFinite(Number(flash.pct)) && Number(flash.pct)) t += ' −' + Number(flash.pct) + '%';
    else if (Number.isFinite(Number(flash.amount)) && Number(flash.amount)) t += ' −$' + Number(flash.amount);
    const v = (opts && opts.sinVence) ? '' : _esfPromoFlashVence(flash);
    if (v) t += ' · vence ' + v;
    partes.push(t);
  }
  return partes;
}
function _esfTienePromo(fila) { return _esfPromoPartes(fila).length > 0; }
async function _esfPromosAsegurar() {
  if (_esfPromosCarga === 'listo' || _esfPromosCarga === 'cargando') return;
  _esfPromosCarga = 'cargando';
  _esfPintarLista();
  try {
    const r = await fetch('/index.html?p=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = _khCortarLiteral(await r.text(), /var\s+PROMOS\s*=\s*\{/, '{', '}');
    if (!txt) throw new Error('no encontré var PROMOS en index.html');
    // El literal usa `Date.parse(...)` en varios vencimientos; es global, así
    // que no hace falta ningún stub. Nada más se evalúa de esa página.
    const obj = new Function('return ' + txt + ';')();
    if (!obj || typeof obj !== 'object') throw new Error('PROMOS no es un objeto');
    _esfPromosCat = obj;
    _esfPromosCarga = 'listo';
  } catch (e) {
    console.warn('[Esferas] no pude leer PROMOS del catálogo:', e.message);
    _esfPromosCat = null;
    _esfPromosCarga = 'error';
  }
  _esfPintarLista();
}
// El veredicto de UN código de pareja contra el registro.
// ⚠️ Si el catálogo no se pudo leer NO se dice "sin registro": eso sería acusar
// a una promo buena de estar mal dada de alta por una falla de red.
function _esfEstadoPareja(code, slug, ahora) {
  if (_esfPromosCarga === 'cargando') return { k: 'cargando', t: 'leyendo el catálogo…' };
  if (_esfPromosCarga !== 'listo' || !_esfPromosCat) return { k: 'nose', t: 'catálogo no leído' };
  const p = _esfPromosCat[String(code).toUpperCase().trim()];
  if (!p) return { k: 'malo', t: 'SIN REGISTRO en PROMOS' };
  // El código existe pero está amarrado a OTRO evento: al cliente de ESTE le
  // rebota igual que si no existiera. Misma familia que "sin registro".
  const soloEn = p.onlyEvents || (p.onlyEvent ? [p.onlyEvent] : null);
  if (soloEn && slug && soloEn.indexOf(slug) < 0) {
    return { k: 'malo', t: 'REGISTRADO PARA ' + String(soloEn.join(', ')).toUpperCase() };
  }
  if (Number.isFinite(Number(p.startTs)) && ahora < Number(p.startTs)) {
    return { k: 'pronto', t: 'PROGRAMADA · desde ' + _esfEnReynosa(p.startTs) };
  }
  if (Number.isFinite(Number(p.expiresTs))) {
    return Number(p.expiresTs) < ahora
      ? { k: 'muerta', t: 'VENCIDA · el ' + _esfEnReynosa(p.expiresTs) }
      : { k: 'viva', t: 'ACTIVA · hasta ' + _esfEnReynosa(p.expiresTs) };
  }
  return { k: 'viva', t: 'ACTIVA · sin vencimiento' };
}
// El del flash sale de la propia fila: su `expiresTs` ya vive en Esferas.
// Misma regla que el sitio (`!fp.expiresTs || fp.expiresTs > Date.now()`).
function _esfEstadoFlash(flash, ahora) {
  const ts = Number(flash && flash.expiresTs);
  if (!Number.isFinite(ts)) return { k: 'viva', t: 'ACTIVA · sin vencimiento' };
  return ts < ahora
    ? { k: 'muerta', t: 'VENCIDA · el ' + _esfEnReynosa(ts) }
    : { k: 'viva', t: 'ACTIVA · hasta ' + _esfEnReynosa(ts) };
}
// Los estados de una fila: uno por promo que traiga. Una fila puede traer las
// dos (pareja y flash) y entonces enseña las dos — hoy ninguna lo hace, pero
// enseñar solo la primera sería esconder media verdad.
function _esfPromoEstados(fila, ahora) {
  const t = Number.isFinite(Number(ahora)) ? Number(ahora) : Date.now();
  const out = [];
  const code = String((fila && fila.promo_code) == null ? '' : fila.promo_code).trim();
  const label = String((fila && fila.promo_label) == null ? '' : fila.promo_label).trim();
  const flash = _esfPromoFlashObj(fila && fila.flash_promo);
  // El letrero SIN código no se puede carear contra nada: no hay llave que
  // buscar en PROMOS. Se dice, en vez de callarlo o de inventarle un estado.
  if (code) out.push(Object.assign({ fuente: 'pareja', code: code }, _esfEstadoPareja(code, fila && fila.slug, t)));
  else if (label) out.push({ fuente: 'pareja', code: '', k: 'nose', t: 'letrero SIN código — no hay qué verificar' });
  if (flash) out.push(Object.assign({ fuente: 'flash', code: String(flash.code || '').trim() }, _esfEstadoFlash(flash, t)));
  return out;
}
// El letrero DENTRO de la fila, y SOLO en la vista de promos. La lista tiene
// cinco columnas fijas; meter una sexta que aparece y desaparece movería las
// otras cuatro cada vez que Memo cambia de chip. El texto va debajo del nombre,
// en la misma celda: la tabla no se mueve y el dato se ve sin abrir la fila —
// que es para lo que se pidió el chip.
// ═══ [ESF-UX-3c] LA COLUMNA HABLA DE LA PROMO ═════════════════════════════
// ESF-UX-3 puso el estado bajo el nombre, y la captura enseñó lo que faltaba:
// la columna Status seguía diciendo "Disponible" a la derecha de un "○ VENCIDA"
// — los dos hechos ciertos, uno al lado del otro, y justo la confusión que la
// tuerca venía a quitar.
//
// En ESTA vista la columna habla de la PROMO y el tour baja a un renglón chico.
// No se agrega una sexta columna: se le cambia el CONTENIDO a la que ya está,
// así las cinco siguen alineadas al cambiar de chip.
//
// ⚠️ EL DEL TOUR NO SE BORRA, se subordina. Sigue siendo un dato que Memo
// necesita —una promo viva sobre un evento agotado es una decisión— y esconderlo
// sería cambiar una confusión por una pérdida.
function _esfPromoColumna(e) {
  const tour = (e.status === 'agotado') ? 'agotado' : (e.status || 'disponible');
  const arriba = _esfPromoEstados(e).map((s) => {
    const p = _ESF_PROMO_PINTA[s.k] || _ESF_PROMO_PINTA.nose;
    // El veredicto arriba, en grande; el "hasta cuándo" abajo, en gris. Leído
    // en columna, lo que se escanea es la primera palabra.
    const t = String(s.t).split(' · ');
    return '<div data-esf-promo-estado="' + s.k + '" data-esf-promo-fuente="' + s.fuente + '"' +
      ' style="color:' + p.color + ';font-weight:700;white-space:nowrap">' +
      p.punto + ' ' + _esfEsc(t[0]) + '</div>' +
      (t.length > 1
        ? '<div style="color:var(--ts);font-weight:400;font-size:10px;white-space:nowrap">' + _esfEsc(t.slice(1).join(' · ')) + '</div>'
        : '');
  }).join('');
  return arriba +
    '<div data-esf-tour style="color:var(--ts2);font-size:10px;margin-top:5px;white-space:nowrap">tour: ' + _esfEsc(tour) + '</div>';
}
function _esfPromoFila(e) {
  if (_esfFiltroFecha !== 'promo') return '';
  const partes = _esfPromoPartes(e, { sinVence: true });
  if (!partes.length) return '';
  // [ESF-UX-3] El ESTADO va primero y en su propio renglón. Antes del código:
  // la pregunta de Memo al abrir esta vista es "¿cuál sigue viva?", no "¿cómo
  // se llama?". El letrero capturado va debajo, en el lime de siempre.
  const mono = 'font-family:\'JetBrains Mono\',monospace;font-size:10px;font-weight:400;line-height:1.5;white-space:normal';
  const estados = _esfPromoEstados(e).map((s) => {
    const p = _ESF_PROMO_PINTA[s.k] || _ESF_PROMO_PINTA.nose;
    const quien = s.fuente === 'flash' ? '⚡' : '⚑';
    return '<span data-esf-promo-estado="' + s.k + '" data-esf-promo-fuente="' + s.fuente + '"' +
      ' style="color:' + p.color + ';font-weight:700;margin-right:10px;white-space:nowrap">' +
      p.punto + ' ' + quien + (s.code ? ' ' + _esfEsc(s.code) : '') + ' ' + _esfEsc(s.t) + '</span>';
  }).join('');
  // [ESF-UX-3c] El estado se MUDÓ a la columna. Dejarlo también aquí sería el
  // mismo veredicto dos veces en la misma fila.
  return '<div style="' + mono + ';color:var(--orange);margin-top:3px">' + partes.map(_esfEsc).join(' · ') + '</div>';
}
// [ESF-LISTA-2] La coincidencia del buscador. Mira NOMBRE, SLUG y TÍTULO: son
// los tres textos con los que Memo llama a un evento, y buscar "arre" tiene que
// encontrarlo aunque el nombre en la tabla sea "Festival Arre".
function _esfCoincide(fila, q) {
  if (!q) return true;
  const t = (String(fila.nombre || '') + ' ' + String(fila.slug || '') + ' ' + String(fila.titulo || '')).toLowerCase();
  return t.includes(q);
}
function _esfBuscarEnLista() {
  _esfBusca = (document.getElementById('esf-buscar')?.value || '').trim().toLowerCase();
  _esfPintarLista();
}
function _esfSeccionAbierta() {
  try {
    const v = localStorage.getItem(_ESF_SEC_KEY);
    // Sin preferencia guardada → CERRADA, que es para lo que Memo la pidió.
    // En cuanto la abre o la cierra una vez, manda su elección.
    return v === null ? false : v !== '1';
  } catch (_) { return true; }   // storage bloqueado: mejor verla que perderla
}
function _esfSeccionPintar(abierta) {
  const body = document.getElementById('esf-listado-body');
  const head = document.getElementById('esf-listado-head');
  const chev = document.getElementById('esf-listado-chev');
  if (body) body.style.display = abierta ? '' : 'none';
  if (head) head.setAttribute('aria-expanded', abierta ? 'true' : 'false');
  if (chev) chev.textContent = abierta ? '▾' : '▸';
}
function _esfSeccionToggle() {
  const abierta = !_esfSeccionAbierta();
  try { localStorage.setItem(_ESF_SEC_KEY, abierta ? '0' : '1'); } catch (_) {}
  _esfSeccionPintar(abierta);
}
// El número del encabezado. Es el TOTAL registrado, no el filtrado: los chips ya
// dicen cuántos hay de cada clase, y aquí la pregunta es otra —"¿cuántos eventos
// guarda esta sección?"— que no debe cambiar al mover un filtro.
function _esfSeccionConteo(n) {
  const el = document.getElementById('esf-listado-n');
  if (el) el.textContent = '(' + n + ')';
}
// [ESF-LISTA-2] Colapsar / desplegar una fila. El detalle vive en su PROPIO
// <tr>, no dentro de la celda: así las columnas del resumen siguen alineadas y
// el alto del contenedor lo manda el navegador, no un número calculado a mano.
function _esfFilaToggle(slug) {
  const det = document.querySelector('#esf-listado .esf-detalle[data-slug="' + slug + '"]');
  const res = document.querySelector('#esf-listado .esf-fila[data-slug="' + slug + '"]');
  if (!det || !res) return;
  const abierto = det.style.display !== 'none';
  det.style.display = abierto ? 'none' : '';
  res.setAttribute('aria-expanded', abierto ? 'false' : 'true');
  const ch = res.querySelector('.esf-chev');
  if (ch) ch.textContent = abierto ? '▸' : '▾';
}
function filtrarEsferasFecha(filtro, btn) {
  document.querySelectorAll('#page-esferas .gz-filter[id^="esff-"]').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _esfFiltroFecha = filtro;
  _esfPintarLista();
  // [ESF-UX-3] El registro `PROMOS` se pide al ENTRAR a esta vista, no al abrir
  // la pantalla: es una descarga del `index.html` entero y las otras cuatro
  // vistas no la necesitan. La lista se pinta ya (con "leyendo…") y se repinta
  // sola al llegar — nunca se queda esperando.
  if (filtro === 'promo') _esfPromosAsegurar();
}
function _esfPintarLista() {
  const cont = document.getElementById('esf-listado');
  if (!cont) return;
  const filas = window._esfRows || [];
  const hoy = _mxFechaStr();
  const porSlug = {};
  filas.forEach((e) => { porSlug[e.slug] = e; });
  const ordenados = _evOrdenarPorFecha(filas.map(_esfComoEvento), hoy);
  // [ESF-LISTA-2] Dos cortes que se COMBINAN: primero el chip, después el
  // texto. Aplicarlos por separado haría que "agotados" ignorara la búsqueda.
  const visibles = ordenados
    .filter((a) => _esfPasaFiltro(a, _esfFiltroFecha, hoy, porSlug[a.__slug]))
    .map((a) => porSlug[a.__slug]).filter(Boolean)
    .filter((e) => _esfCoincide(e, _esfBusca));

  // Los conteos van EN los chips: sin ellos, "próximos" vacío se lee como "la
  // lista no cargó" en vez de "no hay ninguno". Se cuentan SIN el buscador:
  // el chip dice cuántos hay de cada clase, no cuántos sobreviven al texto.
  const cuenta = { proximo: 0, pasado: 0, agotado: 0, promo: 0 };
  ordenados.forEach((a) => {
    const g = _evGrupoOrden(a, hoy);
    const fila = porSlug[a.__slug] || {};
    // [ESF-UX-2] El conteo de promos sale del MISMO juez que el filtro
    // (`_esfPasaFiltro`), no de una copia de la regla escrita aquí: dos reglas
    // gemelas es como el chip acaba diciendo un número que la lista no enseña.
    if (_esfPasaFiltro(a, 'promo', hoy, fila)) cuenta.promo++;
    if (g === 2) { cuenta.pasado++; return; }
    cuenta.proximo++;
    if (String(fila.status || '') === 'agotado') cuenta.agotado++;
  });
  // [ESF-LISTA-3] El conteo del encabezado, visible aun con la sección cerrada.
  _esfSeccionConteo(filas.length);
  _esfSeccionPintar(_esfSeccionAbierta());
  const rot = (id, txt, n) => { const b = document.getElementById(id); if (b) b.textContent = txt + ' (' + n + ')'; };
  rot('esff-proximos', '// próximos', cuenta.proximo);
  rot('esff-agotados', '// agotados', cuenta.agotado);
  rot('esff-promos', '// promos', cuenta.promo);
  rot('esff-pasados', '// pasados', cuenta.pasado);
  rot('esff-todos', '// todos', ordenados.length);

  if (!filas.length) {
    cont.innerHTML = '<div class="empty-state"><div class="empty-icon">·</div>Sin eventos registrados</div>';
    return;
  }
  if (!visibles.length) {
    // Se dice CUÁNTOS hay del otro lado: una lista vacía es una afirmación, y
    // sin el número no se sabe si no hay, o si el filtro o el texto los taparon.
    const etq = { pasado: 'pasado', agotado: 'próximo y agotado', proximo: 'próximo', promo: 'con promo capturada', todos: '' };
    const total = cuenta.proximo + cuenta.pasado;
    cont.innerHTML = '<div class="empty-state"><div class="empty-icon">·</div>' +
      (_esfBusca
        ? 'Ningún evento ' + (etq[_esfFiltroFecha] ? etq[_esfFiltroFecha] + ' ' : '') + 'dice "' + _esfEsc(_esfBusca) + '" — hay ' + total + ' en total.'
        : 'Ningún evento ' + (etq[_esfFiltroFecha] || 'registrado') + '.') +
      '</div>';
    return;
  }

  // [ESF-LISTA-2] FILAS DESPLEGABLES. La página era larguísima: cada evento
  // ocupaba una fila con siete columnas y cuatro botones. Ahora el resumen es
  // un renglón —nombre · fecha · status · publicado— y el detalle vive en su
  // PROPIO <tr>, oculto, que se abre al picar.
  //
  // ⚠️ Lo de adentro NO desaparece: sigue en el DOM y sigue funcionando. Por eso
  // el arnés no se conforma con `click()` —que dispara igual sobre lo oculto,
  // como enseñó COB-MIG-1— sino que mide el ALTO REAL de la fila de detalle y
  // pregunta a `elementFromPoint` si de verdad se ve.
  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th style="width:34px"></th><th>Nombre</th><th>Fecha</th><th>${_esfFiltroFecha === 'promo' ? 'Promo' : 'Status'}</th><th>Publicado</th></tr></thead>
    <tbody>${visibles.map(e => {
      const s = _esfEsc(e.slug);
      const pasado = _evGrupoOrden(_esfComoEvento(e), hoy) === 2;
      return `<tr class="esf-fila" data-slug="${s}" tabindex="0" role="button" aria-expanded="false"
          style="cursor:pointer" onclick="_esfFilaToggle('${s}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_esfFilaToggle('${s}')}">
        <td class="esf-chev" style="color:var(--ts);font-size:13px">▸</td>
        <td style="font-weight:600">${_esfEsc(e.nombre)}${_esfPromoFila(e)}</td>
        <td style="font-size:12px${pasado ? ';color:var(--ts)' : ''}">${_esfEsc(e.fecha_inicio) || '—'}</td>
        <td style="font-size:11px;color:${(e.status === 'agotado') ? 'var(--red)' : 'var(--orange)'}">${_esfFiltroFecha === 'promo' ? _esfPromoColumna(e) : (_esfEsc(e.status) || 'Disponible')}</td>
        <td>${e.archivado
          ? '<span class="badge badge-gray" style="border-color:var(--orange);color:var(--orange)" title="Registro de un evento ya ocurrido. No se puede publicar.">archivo</span>'
          : (e.publicado ? '<span class="badge badge-green">publicado</span>' : '<span class="badge badge-gray">borrador</span>')}</td>
      </tr>
      <tr class="esf-detalle" data-slug="${s}" style="display:none">
        <td colspan="5" style="background:var(--bg);padding:12px 16px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ts);margin-bottom:8px">
            ${s}${e.ciudad ? ' · ' + _esfEsc(e.ciudad) : ''}${e.venue ? ' · ' + _esfEsc(e.venue) : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            ${_esfAcciones(e)}
            ${e.archivado
              // [ESF-ARCHIVO-1] TEXTO, no un botón apagado. Un control deshabilitado
              // invita a picarlo y no explica nada; una frase dice qué es y por qué.
              ? `<span style="font-size:11px;color:var(--orange)">archivo — solo consulta. El <code>index.html</code> sigue siendo la fuente de verdad de este evento.</span>`
              : (e.publicado
                ? `<button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="despublicarEsfera('${s}')"><svg class="ic"><use href="#ic-basura"/></svg> Despublicar</button>`
                : `<button class="btn btn-ghost btn-sm" style="font-size:10px;color:var(--red)" onclick="eliminarEsfera('${s}')"><svg class="ic"><use href="#ic-basura"/></svg> Eliminar</button>`)}
          </div>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}
async function loadEsferasEventos() {
  _esfPreviewInit();
  _esfLoadVenuesCat(); // best-effort, no bloquea el listado
  const cont = document.getElementById('esf-listado');
  if (!cont) return;
  // [ESF-LISTA-3] El estado guardado se aplica ANTES del fetch. Si esperara al
  // pintado, la sección aparecería abierta y se plegaría sola medio segundo
  // después — un parpadeo que se lee como un error de la pantalla.
  _esfSeccionPintar(_esfSeccionAbierta());
  // [FLUJO-UX-2] EL SPINNER YA EXISTÍA — lo que faltaba era que se viera.
  // `#esf-listado-body` está en `display:none` con la lista plegada, así que
  // esto se pintaba donde nadie lo ve y la pantalla salía como «sin indicador».
  // Agregarle un spinner nuevo habría sido duplicar el que ya tenía: lo dijo la
  // VALIDACIÓN DEL INSTRUMENTO, no la lectura del código.
  const _cuerpo = document.getElementById('esf-listado-body');
  if (_cuerpo) _cuerpo.style.display = '';
  cont.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/esferas-listar', { method:'POST' });
    if (!r.ok) {
      const d = await r.json().catch(()=>({ error: r.statusText }));
      throw new Error(d.error || 'Error cargando');
    }
    const { eventos } = await r.json();
    const filas = eventos || [];
    window._esfRows = filas; // cache para el modo edición
    // El pintado vive aparte para que los chips repinten sin volver a pedir la
    // lista al servidor.
    _esfPintarLista();
  } catch(e) {
    // [FLUJO-UX-1] Mismo cambio que en Capsule: el mensaje crudo pasa a ser el
    // patrón con nombre y reintento.
    // [FLUJO-UX-1b] SE DESTAPA EL PADRE ANTES DE PINTAR. `#esf-listado-body`
    // está en `display:none` cuando la lista viene plegada, así que el aviso se
    // pintaba DENTRO de un contenedor oculto: medido, la caja quedaba con
    // alto 0. «Existe» no es «se ve», y un error que no se ve no es un error:
    // es la pantalla en blanco de siempre.
    const cuerpo = document.getElementById('esf-listado-body');
    if (cuerpo) cuerpo.style.display = '';
    khErrorCarga(cont, 'la lista de Esferas', 'loadEsferasEventos', e);
  }
}
// ── Posponer evento (SEG-1: preview + confirmación con slug) ─────────────────
// Dos pasos a propósito: primero se PREGUNTA qué va a pasar (sin escribir nada)
// y sólo con ese resumen a la vista se puede confirmar tecleando el slug — el
// mismo candado que ya usa Cancelar. NO republica ni avisa: eso va aparte.
function posponerEsfera(slug) {
  const ev = (window._esfRows || []).find(e => e && e.slug === slug);
  if (!ev) { alert('No se encontró el evento en la lista. Recarga e intenta de nuevo.'); return; }
  window._ppPreview = null;
  const fechaActual = ev.fecha_inicio || '';
  const hoyMx = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  document.getElementById('modal-posponer').innerHTML = `
    <div class="modal" style="max-width:440px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px"><svg class="ic"><use href="#ic-eventos"/></svg> Posponer evento</div>
        <button class="modal-close" onclick="closeModal('modal-posponer')">×</button>
      </div>
      <div class="modal-body">
        <div style="font-size:13px;margin-bottom:12px">
          <b>${_esfEsc(ev.nombre)}</b><br>
          <span style="font-size:12px;color:var(--ts)">Fecha actual: ${_esfEsc(fechaActual) || '—'}</span>
        </div>
        <div class="form-group">
          <label>Fecha nueva *</label>
          <input type="date" class="cot-input" id="pp-fecha-nueva" value="${_esfEsc(fechaActual)}" min="${hoyMx}" style="width:100%" onchange="_ppInvalidar()" oninput="_ppInvalidar()">
        </div>
        <div class="form-group">
          <label>Motivo (opcional)</label>
          <input type="text" class="cot-input" id="pp-motivo" placeholder="Motivo (opcional)" maxlength="200" style="width:100%">
        </div>
        <div id="pp-resumen"></div>
        <div id="pp-confirmacion"></div>
        <div id="pp-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-posponer')">Cerrar</button>
        <button class="btn btn-primary" id="pp-ver" onclick="_ppVerPreview('${_esfEsc(slug)}')">Ver qué va a pasar</button>
      </div>
    </div>`;
  openModal('modal-posponer');
}
// Cambiar la fecha después de ver el resumen tira el resumen: lo que se
// confirma tiene que ser exactamente lo que se enseñó.
function _ppInvalidar() {
  window._ppPreview = null;
  const res = document.getElementById('pp-resumen');
  const con = document.getElementById('pp-confirmacion');
  const btn = document.getElementById('pp-confirmar');
  const alertEl = document.getElementById('pp-alert');
  if (res) res.innerHTML = '';
  if (con) con.innerHTML = '';
  if (alertEl) alertEl.innerHTML = '';
  if (btn) btn.remove();
}
// Paso 1: preguntar. `preview:true` corta en el endpoint antes de la primera
// escritura, así que esto no mueve ni una fecha de pago.
async function _ppVerPreview(slug) {
  const alertEl = document.getElementById('pp-alert');
  const resEl = document.getElementById('pp-resumen');
  const fechaNueva = (document.getElementById('pp-fecha-nueva')?.value || '').trim();
  if (alertEl) alertEl.innerHTML = '';
  if (!fechaNueva) {
    if (alertEl) alertEl.innerHTML = '<div class="alert alert-error">Elige la fecha nueva</div>';
    return;
  }
  if (resEl) resEl.innerHTML = '<div class="alert alert-info">Consultando…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-posponer-evento', {
      method: 'POST',
      body: JSON.stringify({ slug, fecha_nueva: fechaNueva, preview: true }),
    });
    const d = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok) {
      if (resEl) resEl.innerHTML = '';
      if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(d.error || 'No se pudo consultar')}</div>`;
      return;
    }
    const motivo = (document.getElementById('pp-motivo')?.value || '').trim();
    window._ppPreview = { slug, fecha_nueva: fechaNueva, motivo, clientes: d.clientes, cuotas: d.cuotas, delta_dias: d.delta_dias };
    const signo = (d.delta_dias > 0 ? '+' : '') + d.delta_dias;
    if (resEl) resEl.innerHTML = `
      <div style="border:1px solid var(--bd,rgba(255,255,255,.15));border-radius:var(--r-sm,8px);padding:12px 14px;margin-bottom:12px;font-size:13px;line-height:1.6">
        <div><b>${_esfEsc(d.fecha_anterior)}</b> → <b style="color:var(--yellow,#e8ff4c)">${_esfEsc(d.fecha_nueva)}</b> <span style="color:var(--ts)">(${_esfEsc(signo)} días)</span></div>
        <div style="margin-top:6px">Afecta a <b>${d.clientes} cliente${d.clientes === 1 ? '' : 's'}</b> activo${d.clientes === 1 ? '' : 's'}.</div>
        <div>Se recorrerán <b>${d.cuotas} cuota${d.cuotas === 1 ? '' : 's'}</b> pendiente${d.cuotas === 1 ? '' : 's'} los mismos días. Los montos NO cambian.</div>
        <div style="margin-top:6px;color:var(--ts);font-size:12px">Nadie recibe correo todavía: al terminar te pregunto si aviso.</div>
        ${d.f_texto_accion === 'actualizado'
          ? `<div style="margin-top:6px">El letrero de la card pasará de <b>${_esfEsc(d.f_texto_anterior)}</b> a <b style="color:var(--yellow,#e8ff4c)">${_esfEsc(d.f_texto_nuevo)}</b>.</div>`
          : ''}
        ${d.f_texto_aviso ? `<div style="margin-top:6px;color:var(--orange,#ff8c00)">⚠ ${_esfEsc(d.f_texto_aviso)}</div>` : ''}
      </div>`;
    const conEl = document.getElementById('pp-confirmacion');
    if (conEl) conEl.innerHTML = `
      <div class="form-group">
        <label>Para confirmar, escribe el slug: <b>${_esfEsc(slug)}</b></label>
        <input type="text" class="cot-input" id="pp-confirm" placeholder="Escribe: ${_esfEsc(slug)}" autocomplete="off" style="width:100%">
      </div>`;
    const pie = document.querySelector('#modal-posponer .modal-footer');
    if (pie && !document.getElementById('pp-confirmar')) {
      const b = document.createElement('button');
      b.className = 'btn btn-primary';
      b.id = 'pp-confirmar';
      b.textContent = 'Posponer';
      b.onclick = () => confirmarPosponer(slug);
      pie.appendChild(b);
    }
  } catch (e) {
    if (resEl) resEl.innerHTML = '';
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
  }
}
// Paso 2: escribir. Sin resumen aprobado y sin el slug tecleado, no se escribe
// — ni llamando a esta función a mano desde la consola.
async function confirmarPosponer(slug) {
  const alertEl = document.getElementById('pp-alert');
  const prev = window._ppPreview;
  if (!prev || prev.slug !== slug) {
    if (alertEl) alertEl.innerHTML = '<div class="alert alert-error">Primero pica "Ver qué va a pasar"</div>';
    return;
  }
  const fechaNueva = (document.getElementById('pp-fecha-nueva')?.value || '').trim();
  if (fechaNueva !== prev.fecha_nueva) {
    if (alertEl) alertEl.innerHTML = '<div class="alert alert-error">La fecha cambió: vuelve a picar "Ver qué va a pasar"</div>';
    return;
  }
  const tecleado = (document.getElementById('pp-confirm')?.value || '').trim();
  if (tecleado !== slug) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">El slug no coincide; escribe '${_esfEsc(slug)}' para confirmar</div>`;
    return;
  }
  const btn = document.getElementById('pp-confirmar');
  const motivo = (document.getElementById('pp-motivo')?.value || '').trim();
  if (btn) { btn.disabled = true; btn.textContent = 'Posponiendo…'; }
  if (alertEl) alertEl.innerHTML = '<div class="alert alert-info">Posponiendo…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-posponer-evento', {
      method: 'POST',
      body: JSON.stringify({ slug, fecha_nueva: fechaNueva, motivo: motivo || undefined }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({ error: r.statusText }));
      if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(d.error || 'No se pudo posponer')}</div>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Posponer'; }
      return;
    }
    const d = await r.json();
    window._ppPreview = null;
    _ppExito(slug, d);
  } catch (e) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = 'Posponer'; }
  }
}
// El final de la posposición. El correo ya NO sale solo (SEG-1, opción A): aquí
// se OFRECE. Y si se dice "ahora no", el pendiente NO se pierde — vive en la
// bitácora y se pinta en la fila del evento hasta que se avise.
function _ppExito(slug, d) {
  const alertEl = document.getElementById('pp-alert');
  const resEl = document.getElementById('pp-resumen');
  const conEl = document.getElementById('pp-confirmacion');
  const verBtn = document.getElementById('pp-ver');
  const btn = document.getElementById('pp-confirmar');
  if (btn) btn.remove();
  if (verBtn) verBtn.remove();
  if (conEl) conEl.innerHTML = '';
  if (alertEl) alertEl.innerHTML = '';
  let extra = '';
  if (d.pagos_recorridos > 0) {
    const signo = (d.delta_dias > 0 ? '+' : '') + d.delta_dias;
    extra += ` Se recorrieron ${d.pagos_recorridos} cuota${d.pagos_recorridos === 1 ? '' : 's'} pendiente${d.pagos_recorridos === 1 ? '' : 's'} (${signo} días).`;
  }
  const atoradas = d.pagos_fallidos > 0 || d.pagos_error;
  const n = d.clientes || 0;
  if (resEl) resEl.innerHTML = `
    <div class="alert alert-success">✓ Pospuesto de ${_esfEsc(d.fecha_anterior)} a ${_esfEsc(d.fecha_nueva)}.${_esfEsc(extra)} ${_esfEsc(d.recordatorio || '')}</div>
    ${d.f_texto_aviso ? `<div class="alert alert-info" style="margin-top:8px"><svg class="ic"><use href="#ic-alerta"/></svg> ${_esfEsc(d.f_texto_aviso)}</div>` : ''}
    ${atoradas ? `<div class="alert alert-error" style="margin-top:8px"><svg class="ic"><use href="#ic-alerta"/></svg> ${d.pagos_fallidos || ''} cuota(s) no se pudieron recorrer. Úsalo con <b>↻ Reintentar</b> en la fila del evento: sólo mueve las que faltaron.</div>` : ''}
    <div style="border:1px solid var(--bd,rgba(255,255,255,.15));border-radius:var(--r-sm,8px);padding:12px 14px;margin-top:10px;font-size:13px;line-height:1.6">
      <div style="margin-bottom:10px">Nadie ha recibido correo. <b>¿Aviso a ${n} cliente${n === 1 ? '' : 's'} ahora?</b><br>
        <span style="font-size:12px;color:var(--ts)">Republica el evento en Esferas antes de avisar.</span></div>
      <button class="btn btn-primary btn-sm" onclick="_ppAvisarAhora('${_esfEsc(slug)}')"><svg class="ic"><use href="#ic-correo"/></svg> Avisar ahora</button>
      <button class="btn btn-ghost btn-sm" onclick="_ppAhoraNo()">Ahora no</button>
    </div>`;
}
function _ppAvisarAhora(slug) {
  closeModal('modal-posponer');
  loadEsferasEventos();
  avisarPosposicion(slug);          // el modal de siempre, que sí manda
}
function _ppAhoraNo() {
  const resEl = document.getElementById('pp-resumen');
  if (resEl) resEl.innerHTML = '<div class="alert alert-info">Listo. Te queda pendiente avisar: lo verás marcado <b>⚠ falta avisar</b> en la fila del evento hasta que lo hagas.</div>';
  setTimeout(() => { closeModal('modal-posponer'); loadEsferasEventos(); }, 2200);
}
// ── Avisar a clientes de la posposición (Fase 2) ─────────────────────────────
// Dispara admin-avisar-posposicion (usa la última posposición registrada).
function avisarPosposicion(slug) {
  const ev = (window._esfRows || []).find(e => e && e.slug === slug);
  if (!ev) { alert('No se encontró el evento en la lista. Recarga e intenta de nuevo.'); return; }
  document.getElementById('modal-avisar').innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px"><svg class="ic"><use href="#ic-correo"/></svg> Avisar a clientes</div>
        <button class="modal-close" onclick="closeModal('modal-avisar')">×</button>
      </div>
      <div class="modal-body">
        <div style="font-size:13px;margin-bottom:12px">
          <b>${_esfEsc(ev.nombre)}</b>
        </div>
        <div style="font-size:12px;color:var(--ts);line-height:1.55;margin-bottom:12px">
          Se enviará el aviso del cambio de fecha a los clientes <b>activos</b> (no cancelados) de este evento, usando la última posposición registrada. Asegúrate de haber republicado el evento en Esferas antes de avisar.
        </div>
        <div id="av-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-avisar')">Cancelar</button>
        <button class="btn btn-primary" id="av-enviar-btn" onclick="confirmarAviso('${_esfEsc(slug)}')">Enviar avisos</button>
      </div>
    </div>`;
  openModal('modal-avisar');
}
async function confirmarAviso(slug) {
  const alertEl = document.getElementById('av-alert');
  const btn = document.getElementById('av-enviar-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  if (alertEl) alertEl.innerHTML = '<div class="alert alert-info">Enviando…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-avisar-posposicion', {
      method: 'POST',
      body: JSON.stringify({ slug }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({ error: r.statusText }));
      if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${d.error || 'No se pudo avisar'}</div>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar avisos'; }
      return;
    }
    const d = await r.json();
    const msg = (d.total === 0)
      ? 'No hay clientes activos para avisar.'
      : `✓ ${d.enviados} aviso(s) enviado(s)${d.fallidos ? ` · ${d.fallidos} fallido(s)` : ''}`;
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-success">${msg}</div>`;
    setTimeout(() => closeModal('modal-avisar'), 2000);
  } catch (e) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar avisos'; }
  }
}
// ── Reintentar las cuotas que no se recorrieron (SEG-1) ──────────────────────
// Dispara admin-recalcular-pagos-posposicion, que hoy mueve ÚNICAMENTE las
// cuotas marcadas como fallidas en la bitácora. Ya no es un botón de siempre:
// sólo se pinta en la fila cuando quedó algo atorado.
function recalcularPagosPosposicion(slug) {
  const ev = (window._esfRows || []).find(e => e && e.slug === slug);
  if (!ev) { alert('No se encontró el evento en la lista. Recarga e intenta de nuevo.'); return; }
  document.getElementById('modal-recalcular').innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px">↻ Reintentar cuotas</div>
        <button class="modal-close" onclick="closeModal('modal-recalcular')">×</button>
      </div>
      <div class="modal-body">
        <div style="font-size:13px;margin-bottom:12px">
          <b>${_esfEsc(ev.nombre)}</b>
        </div>
        <div style="font-size:12px;color:var(--ts);line-height:1.55;margin-bottom:12px">
          Se reintentarán <b>sólo</b> las cuotas que no se pudieron recorrer al posponer, el mismo número de días que se movió el evento. Las que ya se movieron <b>no se vuelven a mover</b> y los montos NO cambian.
        </div>
        <div id="rec-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-recalcular')">Cancelar</button>
        <button class="btn btn-primary" id="rec-enviar-btn" onclick="confirmarRecalculo('${_esfEsc(slug)}')">Recalcular</button>
      </div>
    </div>`;
  openModal('modal-recalcular');
}
async function confirmarRecalculo(slug) {
  const alertEl = document.getElementById('rec-alert');
  const btn = document.getElementById('rec-enviar-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Recalculando…'; }
  if (alertEl) alertEl.innerHTML = '<div class="alert alert-info">Recalculando…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-recalcular-pagos-posposicion', {
      method: 'POST',
      body: JSON.stringify({ slug }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({ error: r.statusText }));
      if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${d.error || 'No se pudo recalcular'}</div>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Recalcular'; }
      return;
    }
    const d = await r.json();
    const msg = (d.movidos === 0)
      ? 'No había cuotas pendientes que mover.'
      : `✓ ${d.movidos} cuota(s) movida(s) · offset ${d.offset_dias} días${d.fallidos ? ` · ${d.fallidos} fallida(s)` : ''}`;
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-success">${msg}</div>`;
    setTimeout(() => { closeModal('modal-recalcular'); loadEsferasEventos(); }, 2500);
  } catch (e) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = 'Recalcular'; }
  }
}
// ── Cancelar evento (Fase 1, DESTRUCTIVO) ────────────────────────────────────
// Dispara admin-cancelar-evento. Confirmación reforzada: hay que teclear el slug.
function cancelarEventoCompleto(slug) {
  const ev = (window._esfRows || []).find(e => e && e.slug === slug);
  if (!ev) { alert('No se encontró el evento en la lista. Recarga e intenta de nuevo.'); return; }
  document.getElementById('modal-cancelar-evento').innerHTML = `
    <div class="modal" style="max-width:440px">
      <div class="modal-header">
        <div class="modal-title" style="font-family:'Zen Dots',sans-serif;font-size:15px;color:var(--red)"><svg class="ic"><use href="#ic-prohibido"/></svg> Cancelar evento</div>
        <button class="modal-close" onclick="closeModal('modal-cancelar-evento')">×</button>
      </div>
      <div class="modal-body">
        <div style="border:1px solid var(--red);border-radius:var(--r-sm,8px);padding:12px 14px;margin-bottom:14px;font-size:13px;line-height:1.55;color:var(--red)">
          Vas a <b>CANCELAR</b> <b>${_esfEsc(ev.nombre)}</b>. Esto da de baja a TODOS los clientes activos y genera la lista de reembolsos por todo lo que pagaron. Es <b>IRREVERSIBLE</b>.
        </div>
        <div class="form-group">
          <label>Motivo (opcional)</label>
          <input type="text" class="cot-input" id="ce-motivo" placeholder="Motivo (opcional)" maxlength="200" style="width:100%">
        </div>
        <div class="form-group">
          <label>Para confirmar, escribe el slug: <b>${_esfEsc(slug)}</b></label>
          <input type="text" class="cot-input" id="ce-confirm" placeholder="Escribe: ${_esfEsc(slug)}" autocomplete="off" style="width:100%">
        </div>
        <div id="ce-alert"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-cancelar-evento')">Cerrar</button>
        <button class="btn btn-primary" id="ce-enviar-btn" style="background:var(--red);border-color:var(--red)" onclick="confirmarCancelacionEvento('${_esfEsc(slug)}')">Cancelar evento</button>
      </div>
    </div>`;
  openModal('modal-cancelar-evento');
}
async function confirmarCancelacionEvento(slug) {
  const alertEl = document.getElementById('ce-alert');
  const btn = document.getElementById('ce-enviar-btn');
  const confirm = (document.getElementById('ce-confirm')?.value || '').trim();
  if (confirm !== slug) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">El slug no coincide; escribe '${_esfEsc(slug)}' para confirmar</div>`;
    return;
  }
  const motivo = (document.getElementById('ce-motivo')?.value || '').trim();
  if (btn) { btn.disabled = true; btn.textContent = 'Cancelando…'; }
  if (alertEl) alertEl.innerHTML = '<div class="alert alert-info">Cancelando…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-cancelar-evento', {
      method: 'POST',
      body: JSON.stringify({ slug, motivo: motivo || undefined }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({ error: r.statusText }));
      if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${d.error || 'No se pudo cancelar'}</div>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Cancelar evento'; }
      return;
    }
    const d = await r.json();
    const msg = `✓ Evento cancelado · ${d.solicitudes_baja} baja(s) · ${d.reembolsos_creados} reembolso(s) · total ${formatMXN(d.monto_total)}${d.bajas_fallidas ? ` · <svg class="ic"><use href="#ic-alerta"/></svg> ${d.bajas_fallidas} fallida(s)` : ''}`;
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-success">${msg}</div>`;
    setTimeout(() => { closeModal('modal-cancelar-evento'); loadEsferasEventos(); }, 3000);
  } catch (e) {
    if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = 'Cancelar evento'; }
  }
}
async function crearEsferaEvento() {
  // [ESF-UX-2a] Una sola lectura de las zonas por guardado: derivada si el
  // evento tiene fechas, del mago si no.
  const _esfZG = _esfZonasParaGuardar();
  const body = {
    slug:         document.getElementById('esf-slug')?.value.trim().toLowerCase() || '',
    nombre:       document.getElementById('esf-nombre')?.value.trim() || '',
    titulo:       document.getElementById('esf-titulo')?.value.trim() || null,
    fecha_inicio: document.getElementById('esf-fecha')?.value || null,
    ciudad:       _esfCiudadValue() || null,
    tipo:         document.getElementById('esf-tipo')?.value || null,
    status:       document.getElementById('esf-status')?.value || '',
    venue:        document.getElementById('esf-venue')?.value.trim() || null,
    music:        document.getElementById('esf-music')?.value.trim() || null,
    fechas_extra: _esfGetFechasExtra(),
    zonas: _esfZG.zonas,
    // [ESF-E1c] `null` = sin lista capturada (el compilador usa su rampa).
    // Una lista, aunque sea vacía, es una afirmación sobre el evento.
    cheap_zonas: (() => { const c = _esfZG.cheapZonas; return c == null ? null : JSON.stringify(c); })(),
    // [ESF-E3a] NIVEL 4. `null` = el evento no es multifecha.
    multifecha: (() => { const m = _esfGetMultifecha(); return m == null ? null : JSON.stringify(m); })(),
    // [ESF-E1g] `null` = el evento no dice banco (y el sitio cae a BBVA solo).
    banco: document.getElementById('esf-banco')?.value || null,
    // [ESF-CAMPOS-1] Los tres apuntes.
    promo: !!document.getElementById('esf-promo')?.checked,
    static_img: document.getElementById('esf-static-img')?.value.trim() || null,
    img_texto: document.getElementById('esf-img-texto')?.value.trim() || null,
    img_omitir: !!document.getElementById('esf-img-omitir')?.checked,
    fecha_fin: document.getElementById('esf-fecha-fin')?.value || null,
    f_texto: document.getElementById('esf-f-texto')?.value.trim() || null,
    lineup: document.getElementById('esf-lineup')?.value.trim() || null,
    flash_promo: _esfGetFlash(),
    promo_code: document.getElementById('esf-promo-code')?.value.trim() || null,
    promo_label: document.getElementById('esf-promo-label')?.value.trim() || null,
    deporte: !!document.getElementById('esf-deporte')?.checked,
    music_search: document.getElementById('esf-music-search')?.value.trim() || null,
    hotel: _esfGetHotel(),
    mapa: _esfGetMapa(),
    mapa_null: _esfMapaApagado,
    foto: _esfGetFoto(),
    inc: _esfGetInc(),
    sep: _esfGetSep(),
    sep_cheap: _esfGetSepCheap(),
    ride: _esfGetRide(),
    sep_ride: _esfGetSepRide(),
    ...(_esfGetPaquetes()),
    nota: _esfGetNota(),
    festival: _esfGetFestival(),
  };
  const alertEl = document.getElementById('esf-alert');
  try {
    const r = await khAdminFetch('/.netlify/functions/esferas-crear', {
      method:'POST', body: JSON.stringify(body),
    });
    if (!r.ok) {
      const detail = await r.json().catch(()=>({ error: r.statusText }));
      throw new Error(detail.error || 'Error creando');
    }
    alertEl.innerHTML = '';   // un error de un intento anterior no sobrevive
    _esfPanelCerrar();
    _esfAviso('✓ Evento creado');   // [ESF-UX-1e] fuera del panel: se cerró
    setTimeout(()=>alertEl.innerHTML='', 2000);
    // Auto-guardado a la libreta: suma a venues_catalogo los NOMBRES de zona usados
    // (best-effort; usa body porque el DOM se limpia abajo). Nunca precios.
    _esfAutoGuardarLibreta(body.venue, body.zonas);
    ['esf-slug','esf-nombre','esf-titulo','esf-fecha','esf-venue','esf-music'].forEach(id => { const el=document.getElementById(id); if (el) el.value=''; });
    _esfClearFechasExtra();
    _esfClearZonas();
    _esfClearMultifecha();
    { const b = document.getElementById('esf-banco'); if (b) b.value = ''; }
    { const p = document.getElementById('esf-promo'); if (p) p.checked = false;
      const d = document.getElementById('esf-deporte'); if (d) d.checked = false;
      const m = document.getElementById('esf-music-search'); if (m) m.value = '';
      const pc = document.getElementById('esf-promo-code'); if (pc) pc.value = '';
      const pl = document.getElementById('esf-promo-label'); if (pl) pl.value = ''; 
      _esfFlashClear(); _esfLineupClear();
      const ff = document.getElementById('esf-fecha-fin'); if (ff) ff.value = '';
      const ft = document.getElementById('esf-f-texto'); if (ft) ft.value = '';
      const si = document.getElementById('esf-static-img'); if (si) si.value = '';
      const it = document.getElementById('esf-img-texto'); if (it) it.value = '';
      const io_ = document.getElementById('esf-img-omitir'); if (io_) io_.checked = false;
      _esfCorridoPreview(); _esfExtrasCerrar(); _esfExtrasContar();
      _esfTabsVigilar(); _esfTab('datos'); _esfSyncGuardar(); }
    _esfClearHotel();
    _esfMapaClear();
    _esfFotoClear();
    _esfSeedDefaults();
    const _fchk = document.getElementById('esf-es-festival'); if (_fchk) _fchk.checked = false;
    _esfToggleFestival();
    _esfFestivalPopulate({});   // cache + switches a default
    const chosenEl = document.getElementById('esf-music-chosen'); if (chosenEl) chosenEl.textContent = '';
    const resEl = document.getElementById('esf-music-results'); if (resEl) resEl.innerHTML = '';
    loadEsferasEventos();
  } catch(e) { alertEl.innerHTML=`<div class="alert alert-error">${e.message}</div>`; }
}
// Ciudad: MTY / CDMX / "Otra ciudad…" (texto libre). El valor guardado en `ciudad`
// es 'MTY', 'CDMX' o el texto escrito. cdmx:true solo lo emite generarObj para CDMX.
function _esfCiudadToggle() {
  const sel = document.getElementById('esf-ciudad');
  const otra = document.getElementById('esf-ciudad-otra');
  if (!sel || !otra) return;
  otra.style.display = (sel.value === '__otra') ? '' : 'none';
  _esfCityChanged();
}
function _esfCiudadValue() {
  const sel = document.getElementById('esf-ciudad');
  if (!sel) return '';
  if (sel.value === '__otra') return (document.getElementById('esf-ciudad-otra')?.value || '').trim();
  return sel.value;
}
function _esfCiudadSet(ciudad) {
  const sel = document.getElementById('esf-ciudad');
  const otra = document.getElementById('esf-ciudad-otra');
  if (!sel) return;
  const c = ciudad || 'MTY';
  if (c === 'MTY' || c === 'CDMX') {
    sel.value = c;
    if (otra) { otra.value = ''; otra.style.display = 'none'; }
  } else {
    sel.value = '__otra';
    if (otra) { otra.value = c; otra.style.display = ''; }
  }
}
// CDMX si la ciudad es 'CDMX' o el venue menciona CDMX.
function _esfIsCDMX() {
  if (_esfCiudadValue().toUpperCase() === 'CDMX') return true;
  const v = (document.getElementById('esf-venue')?.value || '').toUpperCase();
  return v.indexOf('CDMX') >= 0;
}
function _esfIncDefaultList() { return (_esfIsCDMX() ? _ESF_INC_CDMX : _ESF_INC_MTY).slice(); }
function _esfAddInc(text) {
  const cont = document.getElementById('esf-inc');
  if (!cont) return;
  const row = document.createElement('div');
  row.className = 'esf-inc-row';
  row.style.cssText = 'display:flex;gap:6px;margin-top:6px;align-items:center';
  row.innerHTML =
    '<input class="cot-input esf-inc-t" placeholder="ej. Boleto zona elegida" style="flex:1;min-width:160px">' +
    '<button type="button" class="btn btn-ghost esf-inc-del" title="Quitar">✕</button>';
  row.querySelector('.esf-inc-t').value = (typeof text === 'string') ? text : '';
  row.querySelector('.esf-inc-del').onclick = () => { row.remove(); };
  cont.appendChild(row);
}
function _esfGetInc() {
  return Array.from(document.querySelectorAll('#esf-inc .esf-inc-row'))
    .map((row) => (row.querySelector('.esf-inc-t')?.value || '').trim())
    .filter(Boolean);
}
function _esfClearInc() {
  const cont = document.getElementById('esf-inc');
  if (cont) cont.innerHTML = '';
}
// Regenera la lista con el default de la ciudad actual (botón "Restaurar default").
function _esfIncDefault() {
  _esfClearInc();
  _esfIncDefaultList().forEach((t) => _esfAddInc(t));
}
// ¿La lista actual es "intacta" (vacía o igual a uno de los defaults conocidos)?
// Si sí, se puede re-generar al cambiar de ciudad sin pisar ediciones manuales.
function _esfIncEsDefault() {
  const cur = _esfGetInc();
  if (!cur.length) return true;
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  return eq(cur, _ESF_INC_MTY) || eq(cur, _ESF_INC_CDMX);
}
// Disparado al cambiar ciudad/venue. Solo re-llena inc/nota si están "intactos"
// (default o vacío) — respeta cualquier edición manual.
function _esfCityChanged() {
  if (_esfIncEsDefault()) _esfIncDefault();
  const notaEl = document.getElementById('esf-nota');
  if (notaEl) {
    const v = notaEl.value.trim();
    if (v === '' || v === _ESF_NOTA_CDMX) notaEl.value = _esfIsCDMX() ? _ESF_NOTA_CDMX : '';
  }
}
function _esfGetSep() {
  const v = document.getElementById('esf-sep')?.value;
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n >= 0) ? n : 500;
}
function _esfGetSepCheap() {
  const v = document.getElementById('esf-sep-cheap')?.value;
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n >= 0) ? n : 500;
}
function _esfGetPaquetes() {
  const o = {};
  Object.keys(_ESF_PKG).forEach((k) => { o[k] = !!document.getElementById(_ESF_PKG[k])?.checked; });
  if (!o.ride_only) o.cheap_also_ok = false;
  if (o.ride_only) o.cheap_only = false;      // excluyentes, igual que el servidor
  return o;
}
function _esfSetPaquetes(row) {
  Object.keys(_ESF_PKG).forEach((k) => {
    const el = document.getElementById(_ESF_PKG[k]); if (el) el.checked = !!(row && row[k]);
  });
  _esfPkgSync();
}
// «Solo RIDE» y «Solo CHEAP» se desmarcan entre sí, y el matiz de CHEAP solo
// aparece cuando tiene sentido.
function _esfPkgSync() {
  const r = document.getElementById('esf-pkg-rideonly');
  const c = document.getElementById('esf-pkg-cheaponly');
  if (r && c) { if (r.checked) c.checked = false; }
  const w = document.getElementById('esf-pkg-alsook-wrap');
  if (w) w.style.display = (r && r.checked) ? 'flex' : 'none';
  if (r && !r.checked) { const a = document.getElementById('esf-pkg-alsook'); if (a) a.checked = false; }
  if (typeof renderEsferaPreview === 'function') renderEsferaPreview();
}
function _esfGetRide() {
  const v = document.getElementById('esf-ride')?.value;
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n > 0) ? n : null;
}
function _esfGetSepRide() {
  const v = document.getElementById('esf-sep-ride')?.value;
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n >= 0) ? n : null;
}
function _esfGetNota() { return (document.getElementById('esf-nota')?.value || '').trim(); }
// Modo festival: interruptor + box. Apagado → _esfGetFestival()=null → concierto,
// flujo idéntico a hoy. 2b: switches de módulos; 2c/2d agregan portada/lineup/paquetes.
function _esfToggleFestival() {
  const on = !!document.getElementById('esf-es-festival')?.checked;
  const box = document.getElementById('esf-festival-box');
  if (box) box.style.display = on ? '' : 'none';
  if (typeof _esfTabSync === 'function') setTimeout(_esfTabSync, 0);
  // R1: en festival, ocultar los grupos de CONCIERTO (música/zonas/hotel) — el
  // festival los tiene en sus paquetes. '' = display natural del form-group.
  // [ESF-E3a] `esf-grp-multifecha` entra a la lista: en festival las fechas
  // viven en `festival.paquetes`, que es OTRA familia (noches, música, hotel
  // por entrada). Dejar las dos bocas abiertas invita a capturar la misma
  // fecha en dos modelos que no se hablan.
  // [ESF-UX-2b] `esf-grp-zonas` y `esf-grp-cheapzonas` salieron de esta lista:
  // los gobierna `_esfTabSync`, que también los esconde cuando hay fechas. Dos
  // dueños del mismo `display` es una pelea que gana el último que corre.
  ['esf-grp-music', 'esf-grp-hotel', 'esf-grp-multifecha'].forEach((id) => {
    const g = document.getElementById(id);
    if (g) g.style.display = on ? 'none' : '';
  });
}
// Elegir tipo "Festival" enciende el interruptor (y muestra el box). Elegir otro
// tipo NO lo apaga a la fuerza: el interruptor manda.
function _esfTipoChange() {
  if (document.getElementById('esf-tipo')?.value === 'festival') {
    const chk = document.getElementById('esf-es-festival');
    if (chk) chk.checked = true;
    _esfToggleFestival();
  }
}
// Puebla los 4 controles desde fest.switches con defaults (cheap/stay ON, ride OFF,
// transporte cdmx). fest = objeto ya parseado o null/{}.
function _esfFestivalPopulate(fest) {
  window._esfFestival = (fest && typeof fest === 'object') ? fest : {};
  const sw = (window._esfFestival.switches && typeof window._esfFestival.switches === 'object') ? window._esfFestival.switches : {};
  const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
  setChk('esf-fest-cheap', sw.cheap !== undefined ? !!sw.cheap : true);
  setChk('esf-fest-stay',  sw.stay  !== undefined ? !!sw.stay  : true);
  setChk('esf-fest-ride',  sw.ride  !== undefined ? !!sw.ride  : false);
  const tr = document.getElementById('esf-fest-transporte'); if (tr) tr.value = (sw.transporte === 'local') ? 'local' : 'cdmx';
  // Portada + lineup: preview desde las URLs guardadas (o limpiar).
  _esfFestImgShow('portada', window._esfFestival.portada || '');
  _esfFestImgShow('lineup',  window._esfFestival.lineup  || '');
  setChk('esf-fest-lineup-show', window._esfFestival.lineup_mostrar !== undefined ? !!window._esfFestival.lineup_mostrar : true);
  // Música rotativa: precargar la lista guardada.
  _esfMusicaLista = Array.isArray(window._esfFestival.musica) ? window._esfFestival.musica.slice() : [];
  _esfMusicaRender();
  // Paquetes: precargar preservando zonas/cheapZonas/hotel (2e-ii/iii los llenan).
  _esfPaquetes = Array.isArray(window._esfFestival.paquetes) ? window._esfFestival.paquetes.map(p => ({
    lbl: p.lbl || '', ds: p.ds || '', noches: p.noches || 0, ride: p.ride || 0,
    zonas: Array.isArray(p.zonas) ? p.zonas : [], cheapZonas: Array.isArray(p.cheapZonas) ? p.cheapZonas : [],
    hotel: Array.isArray(p.hotel) ? p.hotel : [], hotelTotal: Number(p.hotelTotal) || 0,
  })) : [];
  _esfPaqRender();
}
function _esfGetFestival() {
  // Apagado → concierto (null). Encendido → parte del cache (preserva llaves de
  // 2c/2d) y reescribe solo .switches con el estado actual de los controles.
  if (!document.getElementById('esf-es-festival')?.checked) return null;
  const base = window._esfFestival || {};
  base.switches = {
    cheap:      !!document.getElementById('esf-fest-cheap')?.checked,
    stay:       !!document.getElementById('esf-fest-stay')?.checked,
    ride:       !!document.getElementById('esf-fest-ride')?.checked,
    transporte: document.getElementById('esf-fest-transporte')?.value || 'cdmx',
  };
  base.portada = _esfPortadaUrl || null;
  base.lineup = _esfLineupUrl || null;
  base.lineup_mostrar = !!document.getElementById('esf-fest-lineup-show')?.checked;
  base.musica = _esfMusicaLista.slice();
  base.paquetes = _esfPaquetes;   // ya trae zonas/cheapZonas/hotel (vacíos en 2e-i)
  return base;
}
// Estado "nuevo evento": siembra inc default de la ciudad + separo 500.
function _esfSeedDefaults() {
  _esfIncDefault();
  const sep = document.getElementById('esf-sep'); if (sep) sep.value = 500;
  const sepC = document.getElementById('esf-sep-cheap'); if (sepC) sepC.value = 500;
  // [ESF-E1a] Los de RIDE arrancan VACÍOS, no en un número: un evento nuevo no
  // vende RIDE hasta que alguien diga que sí y a cuánto.
  if (typeof _esfClearCheapZonas === 'function') _esfClearCheapZonas();
  _esfSetPaquetes(null);
  const rd = document.getElementById('esf-ride'); if (rd) rd.value = '';
  const sr = document.getElementById('esf-sep-ride'); if (sr) sr.value = '';
  const nota = document.getElementById('esf-nota'); if (nota) nota.value = _esfIsCDMX() ? _ESF_NOTA_CDMX : '';
}
// Modo editar: re-poblar inc (array/JSON) + sep/sep_cheap + nota desde la fila.
function _esfIncSepNotaPopulate(row) {
  _esfClearInc();
  let inc = row.inc;
  if (typeof inc === 'string') { try { inc = JSON.parse(inc); } catch { inc = []; } }
  if (Array.isArray(inc)) inc.forEach((t) => { if (typeof t === 'string' && t.trim()) _esfAddInc(t); });
  const sep = document.getElementById('esf-sep');
  if (sep) sep.value = (row.sep != null && row.sep !== '') ? row.sep : 500;
  const sepC = document.getElementById('esf-sep-cheap');
  if (sepC) sepC.value = (row.sep_cheap != null && row.sep_cheap !== '') ? row.sep_cheap : 500;
  // [ESF-E1a] Al editar, se refleja lo que la fila TIENE. Vacío = sin RIDE, y
  // se pinta vacío: rellenarlo con 0 haría que el evento anunciara un RIDE
  // gratis en cuanto alguien guardara sin mirar.
  _esfSetPaquetes(row);
  const rd = document.getElementById('esf-ride');
  if (rd) rd.value = (row.ride != null && row.ride !== '') ? row.ride : '';
  const sr = document.getElementById('esf-sep-ride');
  if (sr) sr.value = (row.sep_ride != null && row.sep_ride !== '') ? row.sep_ride : '';
  const nota = document.getElementById('esf-nota');
  if (nota) nota.value = (typeof row.nota === 'string') ? row.nota : '';
}
// ── Fechas adicionales (multifecha-ficha: varias fechas del mismo artista) ───
// Inputs date extra bajo "Fecha inicio". Se guardan como JSON array en
// `fechas_extra` (solo las no vacías). NO tocan precios/zonas.
function _esfAddFechaExtra(value) {
  const cont = document.getElementById('esf-fechas-extra');
  if (!cont) return;
  const row = document.createElement('div');
  row.className = 'esf-fecha-extra-row';
  row.style.cssText = 'display:flex;gap:8px;margin-top:8px';
  const inp = document.createElement('input');
  inp.type = 'date';
  inp.className = 'cot-input esf-fecha-extra';
  inp.style.flex = '1';
  if (value) inp.value = String(value).slice(0, 10);
  inp.addEventListener('input', renderEsferaPreview);
  inp.addEventListener('change', renderEsferaPreview);
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-ghost';
  del.textContent = '✕';
  del.title = 'Quitar esta fecha';
  del.onclick = () => { row.remove(); renderEsferaPreview(); };
  row.appendChild(inp);
  row.appendChild(del);
  cont.appendChild(row);
  renderEsferaPreview();
}
function _esfGetFechasExtra() {
  return Array.from(document.querySelectorAll('#esf-fechas-extra .esf-fecha-extra'))
    .map((el) => (el.value || '').trim())
    .filter(Boolean);
}
function _esfClearFechasExtra() {
  const cont = document.getElementById('esf-fechas-extra');
  if (cont) cont.innerHTML = '';
}
async function _esfLoadVenuesCat() {
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-venues-catalogo', {
      method: 'POST', body: JSON.stringify({ accion: 'listar' }),
    });
    if (!r.ok) return;
    const d = await r.json().catch(() => ({}));
    _esfVenuesCat = Array.isArray(d.venues) ? d.venues : [];
  } catch (e) { /* best-effort: sin catálogo, el venue sigue siendo texto libre */ }
}
function _esfVenueSugg() {
  const box = document.getElementById('esf-venue-sugg');
  const inp = document.getElementById('esf-venue');
  if (!box || !inp) return;
  const q = (inp.value || '').trim().toLowerCase();
  if (!q || !_esfVenuesCat.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const m = [];
  _esfVenuesCat.forEach((v, idx) => {
    if (String(v.venue || '').toLowerCase().includes(q)) m.push({ v, idx });
  });
  const top = m.slice(0, 8);
  if (!top.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  // Pasamos el ÍNDICE (no el texto) al handler → evita problemas de escape con
  // venues que traen comillas. El texto visible va escapado con _esfEsc.
  box.innerHTML = top.map(({ v, idx }) => {
    const nz = Array.isArray(v.zonas) ? v.zonas.length : 0;
    return `<div style="padding:8px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)" onmousedown="_esfPickVenueIdx(${idx})">${_esfEsc(v.venue)} <span style="color:var(--ts);font-size:11px">· ${nz} zona${nz !== 1 ? 's' : ''}</span></div>`;
  }).join('');
  box.style.display = 'block';
}
function _esfVenueSuggHide() {
  const box = document.getElementById('esf-venue-sugg');
  if (box) box.style.display = 'none';
}
function _esfPickVenueIdx(idx) {
  // Solo completa el NOMBRE del venue y cierra el dropdown. La precarga masiva de
  // zonas del #138 se retiró: ahora las zonas se eligen una por una desde el
  // dropdown por fila (_esfZonaSugg), que lee la libreta de este venue.
  const cat = _esfVenuesCat[idx];
  if (!cat) return;
  const inp = document.getElementById('esf-venue');
  if (inp) { inp.value = cat.venue; _esfCityChanged(); }
  _esfVenueSuggHide();
}
async function _esfGuardarVenueZonas() {
  const msg = document.getElementById('esf-venue-cat-msg');
  const setMsg = (color, txt) => { if (msg) { msg.style.color = color; msg.textContent = txt; } };
  const venue = (document.getElementById('esf-venue')?.value || '').trim();
  if (!venue) { setMsg('var(--red)', 'Captura el venue primero.'); return; }
  const nombres = _esfGetZonas().map(z => z.n).filter(n => n && n.trim());
  if (!nombres.length) { setMsg('var(--red)', 'No hay zonas con nombre para guardar.'); return; }
  setMsg('var(--ts)', 'Guardando…');
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-venues-catalogo', {
      method: 'POST', body: JSON.stringify({ accion: 'guardar', venue, zonas: nombres }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || ('admin-venues-catalogo ' + r.status));
    setMsg('var(--green)', `✓ Zonas guardadas para "${d.venue || venue}".`);
    await _esfLoadVenuesCat();
    setTimeout(() => setMsg('var(--ts)', ''), 2500);
  } catch (e) {
    setMsg('var(--red)', e.message);
  }
}
// Zonas de la libreta para el venue tecleado en #esf-venue. Match por nombre
// (trim, case-insensitive exacto — NO fuzzy). [] si el venue no está en la libreta.
function _esfVenueZonas() {
  const venue = (document.getElementById('esf-venue')?.value || '').trim().toLowerCase();
  if (!venue || !Array.isArray(_esfVenuesCat)) return [];
  const hit = _esfVenuesCat.find((v) => String(v.venue || '').trim().toLowerCase() === venue);
  return (hit && Array.isArray(hit.zonas)) ? hit.zonas.filter((n) => typeof n === 'string' && n.trim()) : [];
}
// Dropdown por fila: sugiere las zonas guardadas del venue actual, filtradas por
// lo tecleado. Clic en una la pone en el campo; la ✕ la borra de la LIBRETA.
function _esfZonaSugg(inp) {
  if (!inp || !inp.parentNode) return;
  const box = inp.parentNode.querySelector('.esf-zona-sugg');
  if (!box) return;
  const venue = (document.getElementById('esf-venue')?.value || '').trim();
  const zonas = _esfVenueZonas();
  const q = (inp.value || '').trim().toLowerCase();
  const matches = zonas.filter((n) => !q || n.toLowerCase().includes(q)).slice(0, 12);
  if (!matches.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.innerHTML = '';
  const hint = document.createElement('div');
  hint.textContent = '✕ quita de la libreta (sugerencias), no del evento';
  hint.style.cssText = 'padding:5px 10px;font-size:10px;color:var(--ts);border-bottom:1px solid var(--border)';
  box.appendChild(hint);
  matches.forEach((name) => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;padding:7px 10px;border-bottom:1px solid var(--border)';
    const label = document.createElement('span');
    label.textContent = name;
    label.style.cssText = 'flex:1;cursor:pointer;font-size:13px';
    label.addEventListener('mousedown', (e) => { e.preventDefault(); inp.value = name; _esfZonaSuggHide(inp); renderEsferaPreview(); });
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '✕';
    del.title = 'Quitar de la libreta (sugerencias), no del evento';
    del.style.cssText = 'background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;flex-shrink:0';
    del.addEventListener('mousedown', (e) => { e.preventDefault(); _esfZonaBorrar(venue, name, inp); });
    item.appendChild(label);
    item.appendChild(del);
    box.appendChild(item);
  });
  box.style.display = 'block';
}
function _esfZonaSuggHide(inp) {
  const box = (inp && inp.parentNode) ? inp.parentNode.querySelector('.esf-zona-sugg') : null;
  if (box) box.style.display = 'none';
}
// Borra UNA zona de la libreta del venue (no toca el evento). Refresca caché y
// re-pinta el dropdown. Best-effort.
async function _esfZonaBorrar(venue, zona, inp) {
  if (!venue || !zona) return;
  await khAdminFetch('/.netlify/functions/admin-venues-catalogo', {
    method: 'POST', body: JSON.stringify({ accion: 'borrar_zona', venue, zona }),
  }).then((r) => r && r.json().catch(() => ({}))).catch(() => null);
  await _esfLoadVenuesCat();
  if (inp) _esfZonaSugg(inp);
}
// Auto-guardado a la libreta tras crear un evento: suma los NOMBRES usados al
// venue (upsert hace merge+dedup). Best-effort (no rompe la creación). Nunca precios.
async function _esfAutoGuardarLibreta(venue, zonasObjs) {
  const v = (venue || '').trim();
  if (!v) return;
  const nombres = (Array.isArray(zonasObjs) ? zonasObjs : [])
    .map((z) => (z && z.n) ? String(z.n).trim() : '').filter(Boolean);
  if (!nombres.length) return;
  await khAdminFetch('/.netlify/functions/admin-venues-catalogo', {
    method: 'POST', body: JSON.stringify({ accion: 'guardar', venue: v, zonas: nombres }),
  }).then((r) => r && r.json().catch(() => ({}))).catch(() => null);
  await _esfLoadVenuesCat();
}
// [E1] Con PRÓXIMAMENTE marcada los precios pueden quedar vacíos sin queja —
// es su caso de uso, no un descuido. Se atenúan para que se lea de un vistazo
// que esa zona todavía no cotiza. Solo apariencia: NO se deshabilitan, para que
// Memo pueda ir escribiendo el costo y desmarcar la casilla cuando lo tenga.
function _esfProxPintaFila(row) {
  const prox = !!row.querySelector('.esf-zona-prox')?.checked;
  row.querySelectorAll('.esf-zona-p,.esf-zona-pc').forEach((inp) => {
    inp.style.opacity = prox ? '.45' : '';
    inp.placeholder = prox
      ? (inp.classList.contains('esf-zona-p') ? 'sin costo aún' : 'sin costo aún')
      : (inp.classList.contains('esf-zona-p') ? '$ PLUS' : '$ CHEAP');
  });
}
// ═══ [ESF-E1c] LAS ZONAS CHEAP · su propia lista ═══════════════════════════
// No es un reflejo de las de arriba. Medido sobre los 78 eventos que tienen
// cheap: 64 son espejo perfecto, pero 14 divergen de verdad —otro número de
// zonas (machaca 3 vs 2, mendivil 11 vs 4), otros nombres, otro orden, o
// `sepEspecial` propio— y un espejo no puede decir nada de eso.
//
// Deliberadamente MÁS SIMPLE que la fila PLUS: aquí no hay `pc` (el precio ES el
// cheap) ni sugeridor de venue. Lo que sí lleva es lo que el catálogo usa:
// precio, VIP, agotada, próximamente y el separo especial.
function _esfAddCheapZona(data) {
  const cont = document.getElementById('esf-cheapzonas');
  if (!cont) return;
  const d = data || {};
  const row = document.createElement('div');
  row.className = 'esf-cz-row';
  row.style.cssText = 'display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap';
  row.innerHTML =
    '<input class="cot-input esf-cz-n" placeholder="Zona" style="flex:2;min-width:110px" autocomplete="off">' +
    '<input class="cot-input esf-cz-p" type="number" min="0" placeholder="$ CHEAP" style="flex:1;min-width:82px">' +
    '<label style="font-size:11px;display:flex;align-items:center;gap:3px;white-space:nowrap" title="Zona preferente"><input type="checkbox" class="esf-cz-vip">VIP</label>' +
    '<label style="font-size:11px;display:flex;align-items:center;gap:3px;white-space:nowrap"><input type="checkbox" class="esf-cz-ag">Agotada</label>' +
    '<label style="font-size:11px;display:flex;align-items:center;gap:3px;white-space:nowrap" title="Se anuncia sin precio"><input type="checkbox" class="esf-cz-prox">Próx.</label>' +
    '<input class="cot-input esf-cz-sep" type="number" min="0" placeholder="separo esp." title="Separo especial de esta zona. Vacío = el separo normal del evento." style="flex:1;min-width:92px">' +
    '<button type="button" class="btn btn-ghost esf-cz-del" title="Quitar zona">✕</button>';
  row.querySelector('.esf-cz-n').value = (typeof d.n === 'string') ? d.n : '';
  if (d.p) row.querySelector('.esf-cz-p').value = d.p;
  if (d.vip) row.querySelector('.esf-cz-vip').checked = true;
  if (d.ag) row.querySelector('.esf-cz-ag').checked = true;
  if (d.prox) row.querySelector('.esf-cz-prox').checked = true;
  if (d.sepEspecial) row.querySelector('.esf-cz-sep').value = d.sepEspecial;
  row.querySelectorAll('input').forEach((el) => {
    el.addEventListener('input', renderEsferaPreview);
    el.addEventListener('change', renderEsferaPreview);
  });
  // Agotada y Próximamente son excluyentes, igual que arriba: una nunca estuvo
  // a la venta y la otra se acabó.
  const cbA = row.querySelector('.esf-cz-ag'), cbP = row.querySelector('.esf-cz-prox');
  cbA.addEventListener('change', () => { if (cbA.checked) cbP.checked = false; });
  cbP.addEventListener('change', () => { if (cbP.checked) cbA.checked = false; });
  row.querySelector('.esf-cz-del').addEventListener('click', () => { row.remove(); renderEsferaPreview(); });
  cont.appendChild(row);
}
// Lee la lista. Devuelve `null` cuando NO hay ni una fila: null significa "este
// evento no tiene lista capturada" y deja que el compilador use su rampa de
// derivación. Una lista con filas —aunque queden todas sin nombre— es una
// afirmación: "estas son las zonas cheap".
function _esfGetCheapZonas() {
  const filas = Array.from(document.querySelectorAll('#esf-cheapzonas .esf-cz-row'));
  if (!filas.length) return null;
  return filas.map((row) => {
    const n = (row.querySelector('.esf-cz-n')?.value || '').trim();
    const p = parseInt(row.querySelector('.esf-cz-p')?.value || '0', 10) || 0;
    const prox = row.querySelector('.esf-cz-prox')?.checked ? 1 : 0;
    const ag = (!prox && row.querySelector('.esf-cz-ag')?.checked) ? 1 : 0;
    const vip = row.querySelector('.esf-cz-vip')?.checked ? 1 : 0;
    const se = parseInt(row.querySelector('.esf-cz-sep')?.value || '', 10);
    const o = { n, p, ag, prox, vip };
    if (Number.isFinite(se) && se > 0) o.sepEspecial = se;
    return o;
  }).filter((z) => z.n);
}
function _esfClearCheapZonas() {
  const c = document.getElementById('esf-cheapzonas');
  if (c) c.innerHTML = '';
}
// El botón: PRE-LLENA con las zonas de arriba y su precio CHEAP. Es conveniencia
// de captura — después se edita libre y la lista es suya. Se pregunta antes de
// pisar lo que ya hubiera: copiar no debe borrar trabajo.
function _esfCopiarDePlus() {
  const plus = (typeof _esfGetZonas === 'function') ? _esfGetZonas() : [];
  if (!plus.length) { showToast('Primero captura las zonas PLUS', 'error'); return; }
  const hay = document.querySelectorAll('#esf-cheapzonas .esf-cz-row').length;
  if (hay && !confirm('Esto reemplaza las ' + hay + ' zona(s) CHEAP que ya capturaste. ¿Seguir?')) return;
  _esfClearCheapZonas();
  plus.forEach((z) => _esfAddCheapZona({ n: z.n, p: z.pc || 0, vip: z.vip, ag: z.ag, prox: z.prox }));
  renderEsferaPreview();
  showToast(plus.length + ' zona(s) copiadas — ahora edítalas libremente', 'success');
}
// [ESF-ARCHIVO-1] Traer los PASADOS como archivo. Es otra puerta, no una
// variante de sembrar: entran SIN pasar el juez —cerrar brechas de eventos
// muertos no paga— y nacen bloqueados para publicar, porque su fila está
// incompleta a propósito y compilarla degradaría su entrada del index.
//
// El index sigue siendo la fuente de verdad de un pasado. Esferas guarda el 94%
// de sus campos (medido sobre los 42 del catálogo) para poder consultarlos.
async function archivarPasados() {
  const btn = document.getElementById('esf-archivar');
  if (!confirm('Se traerán los eventos YA OCURRIDOS a Esferas como ARCHIVO.\n\n' +
               '· NO pasan el juez: su ficha queda incompleta a propósito.\n' +
               '· Quedan BLOQUEADOS para publicar — el index sigue siendo su fuente de verdad.\n' +
               '· No se toca ninguno de los que ya están aquí.')) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Archivando…'; }
  try {
    const r = await khAdminFetch('/.netlify/functions/esferas-importar', {
      method: 'POST', body: JSON.stringify({ accion: 'archivar' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || ('Error ' + r.status));
    const panel = _esfImportPanel();
    const fall = d.fallidos || [];
    if (panel) {
      panel.innerHTML = '<div style="padding:14px;border:1px solid var(--border);border-radius:var(--r-sm,8px);font-size:12px;line-height:1.6">' +
        '<div style="font-size:20px;font-weight:800">' + (d.insertados || []).length + ' archivados</div>' +
        '<div style="color:var(--ts);margin-top:4px">Sin publicar y <b>bloqueados para publicar</b>. Aparecen en la lista con el sello <b>archivo</b>.</div>' +
        ((d.insertados || []).length ? '<div style="color:var(--ts);margin-top:8px">' + d.insertados.map(_esfEsc).join(' · ') + '</div>' : '') +
        (fall.length ? '<div style="color:var(--red);margin-top:10px"><b>' + fall.length + ' no se pudieron traer:</b>' +
          fall.map((f) => '<div style="margin-top:2px">· ' + _esfEsc(f.slug) + ' — ' + _esfEsc(f.detail || '') + '</div>').join('') + '</div>' : '') +
        '</div>';
    }
    showToast((d.insertados || []).length + ' evento(s) archivados', 'success');
    if (typeof loadEsferasEventos === 'function') loadEsferasEventos();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ic"><use href="#ic-eventos"/></svg> Archivar los pasados'; }
  }
}
function _esfImportPanel() { return document.getElementById('esf-import-panel'); }
async function importarDelCatalogo() {
  const panel = _esfImportPanel();
  if (panel) panel.innerHTML = '<div class="loading-state"><div class="spinner"></div>Leyendo el catálogo…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/esferas-importar', {
      method: 'POST', body: JSON.stringify({ accion: 'diagnostico' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || ('Error ' + r.status));
    _esfImportDiag = d;
    _esfImportPintar(d);
  } catch (e) {
    _esfImportDiag = null;
    if (panel) panel.innerHTML = '<div style="color:var(--red);font-size:12px">' + _esfEsc(e.message) + '</div>';
  }
}
function _esfImportPintar(d) {
  const panel = _esfImportPanel();
  if (!panel) return;
  const R = d.resumen || {};
  const nuevos = (d.gobernables || []).filter((g) => !g.ya_esta);
  const cel = (n, t) => '<div style="flex:1;min-width:104px"><div style="font-size:22px;font-weight:800;line-height:1.1">' + n +
    '</div><div style="font-size:10px;color:var(--ts);text-transform:uppercase;letter-spacing:.08em;margin-top:2px">' + t + '</div></div>';
  let h = '<div style="display:flex;gap:14px;flex-wrap:wrap;padding:14px;border:1px solid var(--border);border-radius:var(--r-sm,8px)">' +
    cel(R.total || 0, 'en el catálogo') +
    cel(R.por_sembrar || 0, 'se pueden traer') +
    cel(R.ya_en_esferas || 0, 'ya están aquí') +
    cel(R.con_brecha || 0, 'se quedan a mano') +
    '</div>' +
    // Lo que se dejó fuera se DICE, no se calla: sin esta línea, "19 se pueden
    // traer" se lee como "eso es todo lo que hay".
    (R.pasados_omitidos ? '<div style="font-size:11px;color:var(--ts);margin-top:8px">' + R.pasados_omitidos +
      ' evento(s) <b>ya pasaron</b> y no se traen. Un evento pasado no se gobierna, se recuerda — enciende <b>incluir pasados</b> si los quieres para historia.</div>' : '') +
    (R.pasados_omitidos ? '<div style="font-size:11px;color:var(--ts);margin-top:4px">Para traerlos como registro, usa <b>Archivar los pasados</b>.</div>' : '');

  if (nuevos.length) {
    h += '<div style="margin-top:14px;font-size:12px"><b>Se traerían ' + nuevos.length + ':</b> ' +
      nuevos.map((g) => '<span style="display:inline-block;padding:2px 8px;margin:2px 3px 0 0;border-radius:var(--r-sm,8px);background:var(--bg);border:1px solid var(--border);font-size:11px">' +
        _esfEsc(g.slug) + (g.byte_igual ? '' : ' <span title="El compilador lo reproduce con los mismos valores, en otro orden de llaves. Publicar lo canonicaliza." style="color:var(--ts)">≈</span>') +
        '</span>').join('') + '</div>' +
      // El `≈` se explica A LA VISTA, no solo en un tooltip: un símbolo que hay
      // que descubrir pasando el mouse es un símbolo que nadie lee.
      (nuevos.some((g) => !g.byte_igual) ? '<div style="font-size:11px;color:var(--ts);margin-top:6px">Los marcados <b>≈</b> se reproducen con los <b>mismos valores</b> en otro orden de llaves; publicar los deja parejos.</div>' : '') +
      '<div style="font-size:11px;color:var(--ts);margin-top:8px;line-height:1.5">Nacen <b>sin publicar</b>: aparecen en la lista de arriba para revisarlos, y el sitio no cambia hasta que tú publiques. Los que ya están aquí <b>no se tocan</b>.</div>' +
      '<button class="btn btn-primary" type="button" id="esf-import-sembrar" style="margin-top:12px" onclick="sembrarDelCatalogo()">Traer los ' + nuevos.length + ' a Esferas</button>';
  } else {
    h += '<div style="margin-top:14px;font-size:12px;color:var(--ts)">No hay nada nuevo que traer: los ' + (R.gobernables || 0) +
      ' eventos que el compilador sabe reproducir ya están en Esferas.</div>';
  }

  // Las brechas se PINTAN, no se resumen en un número. "75 se quedan a mano" no
  // dice nada; "harry pierde las fechas del texto" sí, y es lo que se arregla
  // en la siguiente tuerca.
  if ((d.con_brecha || []).length) {
    h += '<div style="margin-top:18px"><div style="font-family:\'JetBrains Mono\',monospace;font-size:10px;letter-spacing:.15em;color:var(--ts);margin-bottom:6px">// SE QUEDAN A MANO — QUÉ SE PERDERÍA</div>' +
      '<div style="max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:var(--r-sm,8px)">' +
      d.con_brecha.map((b) =>
        '<div style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:11px">' +
        '<b>' + _esfEsc(b.slug) + '</b> <span style="color:var(--ts)">— ' + (b.cuantas || 0) + ' dato(s)</span>' +
        (b.motivo ? ' <span style="color:var(--orange)">' + _esfEsc(b.motivo) + '</span>' : '') +
        (b.brechas || []).map((x) => '<div style="color:var(--ts);margin-top:2px">· <code>' + _esfEsc(x.campo) + '</code> — ' + _esfEsc(x.que) + '</div>').join('') +
        ((b.cuantas || 0) > (b.brechas || []).length ? '<div style="color:var(--ts);margin-top:2px">· …y ' + (b.cuantas - b.brechas.length) + ' más</div>' : '') +
        '</div>').join('') + '</div></div>';
  }
  panel.innerHTML = h;
}
async function sembrarDelCatalogo() {
  const nuevos = ((_esfImportDiag || {}).gobernables || []).filter((g) => !g.ya_esta);
  if (!nuevos.length) { showToast('No hay nada que traer', 'error'); return; }
  if (!confirm('Se van a traer ' + nuevos.length + ' evento(s) a Esferas, SIN publicar.\n\n' +
               'No se toca ninguno de los que ya están aquí, y el sitio no cambia hasta que publiques.')) return;
  const btn = document.getElementById('esf-import-sembrar');
  if (btn) { btn.disabled = true; btn.textContent = 'Trayendo…'; }
  try {
    const r = await khAdminFetch('/.netlify/functions/esferas-importar', {
      // [SIEMBRA-DIAG] Viaja LO QUE ESTA PANTALLA PROMETIÓ. Sin eso el servidor
      // no puede saber que prometí 10, y "entraron 8" se queda sin explicación.
      method: 'POST', body: JSON.stringify({
        accion: 'sembrar',
        esperados: nuevos.map((g) => g.slug),
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || ('Error ' + r.status));
    const panel = _esfImportPanel();
    const fall = d.fallidos || [];
    if (panel) {
      panel.innerHTML =
        '<div style="padding:14px;border:1px solid var(--border);border-radius:var(--r-sm,8px);font-size:12px;line-height:1.6">' +
        '<div style="font-size:20px;font-weight:800">' + (d.insertados || []).length + ' traídos, sin publicar</div>' +
        ((d.insertados || []).length ? '<div style="color:var(--ts);margin-top:4px">' + d.insertados.map(_esfEsc).join(' · ') + '</div>' : '') +
        // [SIEMBRA-DIAG] Los que NO llegaron van ARRIBA y en color, no en la
        // línea gris del final. El 25-ago el botón prometió 10, entraron 8, y la
        // única pista vivía en una nota gris que nadie tenía por qué leer.
        (((d.no_traidos || []).length) ? '<div style="margin-top:12px;padding:10px;border:1px solid var(--orange);border-radius:var(--r-sm,8px);background:rgba(255,165,0,.08)">' +
          '<b style="color:var(--orange)">Prometí ' + (d.esperados || 0) + ' y entraron ' + (d.insertados || []).length + '. Los ' + d.no_traidos.length + ' que faltan:</b>' +
          d.no_traidos.map((x) => '<div style="margin-top:4px">· <b>' + _esfEsc(x.slug) + '</b> — ' + _esfEsc(x.motivo) +
            (x.detail ? ' <span style="color:var(--ts)">(' + _esfEsc(x.detail) + ')</span>' : '') + '</div>').join('') +
          '</div>' : '') +
        // Los fallidos se dicen SIEMPRE que los haya, con su detalle. Un import
        // que solo cuenta éxitos se lee como completo cuando no lo es.
        (fall.length ? '<div style="color:var(--red);margin-top:10px"><b>' + fall.length + ' no se pudieron traer:</b>' +
          fall.map((f) => '<div style="margin-top:2px">· ' + _esfEsc(f.slug) + ' — ' + _esfEsc(f.detail || '') + '</div>').join('') + '</div>' : '') +
        '<div style="color:var(--ts);margin-top:10px">' + _esfEsc(d.nota || '') + '</div></div>';
    }
    showToast((d.insertados || []).length + ' evento(s) traídos sin publicar', 'success');
    if (typeof loadEsferasEventos === 'function') loadEsferasEventos();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Traer los ' + nuevos.length + ' a Esferas'; }
    showToast(e.message, 'error');
  }
}
// Una fila de zona dentro de un bloque de fecha. Sirve para las dos listas
// —PLUS y CHEAP— porque en el modelo de la fecha son la misma forma.
// ═══ [ESF-UX-2b · ESF-UX-3-1b] EL TABLERO DE ZONAS ═════════════════════════
// UN solo tablero de precios para CUALQUIER evento: filas = unión de zonas,
// columnas = fechas, y en cada intersección PLUS y CHEAP juntos y a la vista.
// Un evento de una sola fecha usa el MISMO tablero con UNA columna — mismo
// modelo mental en las 23 sucursales, que es el requisito de producto.
//
// Antes había dos listas por fecha más el mago de arriba: karolg pedía recorrer
// OCHO listas y 128 casillas, y la sección CHEAP vivía al fondo de cada bloque
// —Memo batalló media hora sin encontrarla y su CHEAP por fecha se terminó
// escribiendo por SQL. Una capacidad que el dueño no encuentra en 30 minutos no
// existe.
//
// EL TABLERO ES VISTA, NO ALMACÉN, y ahora sobre DOS almacenes:
//   · multifecha → los bloques de fecha (`box._esfZonas` / `box._esfCheap`),
//     con sus objetos ORIGINALES, mutados en su sitio. Eso conserva llaves
//     desconocidas, la forma exacta (`ag` ausente vs `ag:0`) y el ORDEN propio
//     de cada fecha: morat/PLUS no es subsecuencia de la unión —medido—, así
//     que guardar en orden de unión le reordenaría las zonas a tres eventos.
//   · una fecha  → el mago que ya existía, escondido pero VIVO. Sigue siendo el
//     único lector (`_esfGetZonas`), así que el sugeridor de venue, el preview
//     y «guardar zonas de este venue» no se enteran del cambio. Convertirlo en
//     multifecha-de-1 habría sido lo cómodo, y está MEDIDO que no se puede: le
//     agrega el campo `multifecha` al catálogo (130 → 214 bytes) y el index le
//     estrena el paso de elegir día a 73 eventos que tienen uno solo.
function _esfTabBloques() {
  return Array.from(document.querySelectorAll('#esf-multifecha .esf-mf-fecha'));
}
// Las COLUMNAS del tablero. Con fechas, una por fecha; sin fechas, una sola
// respaldada por el mago. Todo lo de abajo habla con columnas, no con bloques.
function _esfTabColumnas() {
  const b = _esfTabBloques();
  if (b.length) return b.map((box, i) => ({ box: box, i: i, fecha: true }));
  return [{ mago: true, i: 0 }];
}
function _esfTabEtq(col) {
  if (col.mago) return 'Precios del evento';
  return (col.box.querySelector('.esf-mf-lbl')?.value || '').trim() || ('Fecha ' + (col.i + 1));
}
// Filas del mago: `#esf-zonas` para PLUS, `#esf-cheapzonas` para la lista CHEAP
// propia (la que manda cuando existe: ESF-E1c).
function _esfMagoFilas(cual) {
  return Array.from(document.querySelectorAll(
    cual === 'zonas' ? '#esf-zonas .esf-zona-row' : '#esf-cheapzonas .esf-cz-row'));
}
function _esfMagoNombre(row) {
  return (row.querySelector('.esf-zona-n, .esf-cz-n')?.value || '').trim();
}
// ESPEJO: un evento de una fecha SIN lista CHEAP propia deriva su cheap del
// `pc` de la fila PLUS, y el compilador copia de ahí `vip`, `prox` y `ag`
// (la rampa de ESF-E1c). O sea: el CHEAP no se puede agotar aparte. El tablero
// lo DICE en la celda en vez de fingir un switch que arrastraría al PLUS.
function _esfTabEspejo(col) {
  return !!col.mago && _esfMagoFilas('cheapZonas').length === 0;
}
// Una fecha HEREDA su CHEAP cuando no declara lista propia (index.html:5498:
// `mf.cheapZonas || cur.cheapZonas || mf.zonas`). No es lo mismo que no tener
// la zona: por eso la celda lo dice.
function _esfTabHereda(col) {
  if (col.mago) return false;               // el mago tiene su propio nombre: espejo
  return !Array.isArray(col.box._esfCheap) || !col.box._esfCheap.length;
}
// Puente al mago: un objeto que se LEE y se ESCRIBE como una zona normal, pero
// que por debajo toca los campos del formulario. Así `_esfTabCelda` no sabe con
// cuál de los dos almacenes está hablando, y el mago sigue siendo la fuente.
function _esfProxyZona(row, campos) {
  const el = (k) => (campos[k] ? row.querySelector(campos[k]) : null);
  const disparar = (e) => {
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  };
  return new Proxy({}, {
    get(_, k) {
      const e = el(k);
      if (!e) return undefined;
      if (e.type === 'checkbox') return e.checked ? 1 : 0;
      if (k === 'n') return e.value.trim();
      const v = parseInt(e.value || '', 10);
      return Number.isFinite(v) ? v : 0;
    },
    set(_, k, v) {
      const e = el(k);
      if (!e) return true;
      if (e.type === 'checkbox') e.checked = !!v; else e.value = v;
      disparar(e);
      return true;
    },
    deleteProperty(_, k) {
      const e = el(k);
      if (!e) return true;
      if (e.type === 'checkbox') e.checked = false; else e.value = '';
      disparar(e);
      return true;
    },
    has(_, k) { return !!el(k); },
    ownKeys() { return Object.keys(campos); },
    getOwnPropertyDescriptor() { return { enumerable: true, configurable: true }; },
  });
}
function _esfTabZona(col, cual, n) {
  if (!col.mago) {
    const l = (cual === 'zonas') ? col.box._esfZonas : col.box._esfCheap;
    return Array.isArray(l) ? l.find((z) => z && z.n === n) : null;
  }
  if (cual === 'zonas') {
    const row = _esfMagoFilas('zonas').find((r) => _esfMagoNombre(r) === n);
    return row ? _esfProxyZona(row, _MAGO_PLUS) : null;
  }
  if (_esfTabEspejo(col)) {
    const row = _esfMagoFilas('zonas').find((r) => _esfMagoNombre(r) === n);
    return row ? _esfProxyZona(row, _MAGO_ESPEJO) : null;
  }
  const row = _esfMagoFilas('cheapZonas').find((r) => _esfMagoNombre(r) === n);
  return row ? _esfProxyZona(row, _MAGO_CHEAP) : null;
}
function _esfTabLista(col, cual) {
  if (col.mago) return null;                       // el mago se agrega por su propia boca
  if (cual === 'zonas') { if (!Array.isArray(col.box._esfZonas)) col.box._esfZonas = []; return col.box._esfZonas; }
  if (!Array.isArray(col.box._esfCheap)) col.box._esfCheap = [];
  return col.box._esfCheap;
}
// La unión, en orden de aparición: primero lo que trae cada columna en PLUS y
// luego lo que solo existe en CHEAP.
function _esfTabUnion() {
  const orden = [], vistas = new Set();
  const meter = (n) => { if (n && !vistas.has(n)) { vistas.add(n); orden.push(n); } };
  const cols = _esfTabColumnas();
  cols.forEach((c) => (c.mago ? _esfMagoFilas('zonas').map(_esfMagoNombre) : (c.box._esfZonas || []).map((z) => z && z.n)).forEach(meter));
  cols.forEach((c) => (c.mago ? _esfMagoFilas('cheapZonas').map(_esfMagoNombre) : (c.box._esfCheap || []).map((z) => z && z.n)).forEach(meter));
  return orden;
}
function _esfTableroPintar() {
  const cont = document.getElementById('esf-tablero');
  if (!cont) return;
  const cols = _esfTabColumnas();
  cont.innerHTML = '';
  const union = _esfTabUnion();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'overflow-x:auto;border:1px solid var(--border);border-radius:var(--r-sm,8px)';
  const t = document.createElement('table');
  t.style.cssText = 'border-collapse:collapse;width:100%;min-width:' + (170 + cols.length * 210) + 'px';

  const h1 = document.createElement('tr');
  h1.innerHTML = '<th style="' + _TAB_CSS.zn + '"></th>';
  cols.forEach((c) => {
    const th = document.createElement('th');
    th.colSpan = 2;
    th.style.cssText = _TAB_CSS.th + ';border-left:1px solid var(--border);border-bottom:1px solid var(--border)';
    const nom = document.createElement('div');
    nom.style.cssText = 'font-size:11px;color:var(--tx);text-transform:uppercase';
    nom.textContent = _esfTabEtq(c);
    const acc = document.createElement('div');
    acc.style.cssText = 'display:flex;gap:4px;justify-content:center;margin-top:3px';
    const mk = (txt, tit, fn) => {
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'btn btn-ghost';
      x.style.cssText = 'font-size:10px;padding:2px 6px'; x.textContent = txt; x.title = tit;
      x.addEventListener('click', fn); return x;
    };
    acc.appendChild(mk('Agotar', 'Marca agotadas todas las zonas de esta columna, y el RIDE si lo tiene', () => _esfTabAgotar(c, true)));
    acc.appendChild(mk('Reabrir', 'Quita el agotado de todas las zonas de esta columna', () => _esfTabAgotar(c, false)));
    th.appendChild(nom); th.appendChild(acc);
    h1.appendChild(th);
  });
  const h2 = document.createElement('tr');
  h2.innerHTML = '<th style="' + _TAB_CSS.zn + ';font-size:10px;font-family:\'JetBrains Mono\',monospace;letter-spacing:.08em;color:var(--ts)">ZONA</th>';
  cols.forEach((c) => {
    const a = document.createElement('th'); a.style.cssText = _TAB_CSS.th + ';border-left:1px solid var(--border)'; a.textContent = 'PLUS';
    const ch = document.createElement('th'); ch.style.cssText = _TAB_CSS.th;
    if (_esfTabHereda(c)) { ch.textContent = 'CHEAP · hereda'; ch.title = 'Esta fecha no declara zonas CHEAP propias: el sitio usa las del evento.'; }
    else if (_esfTabEspejo(c)) { ch.textContent = 'CHEAP · espejo'; ch.title = 'Sin lista CHEAP propia, el sitio copia el estado del PLUS y solo cambia el precio. Dale lista propia para poder agotar el CHEAP aparte.'; }
    else ch.textContent = 'CHEAP';
    h2.appendChild(a); h2.appendChild(ch);
  });
  const thead = document.createElement('thead');
  thead.appendChild(h1); thead.appendChild(h2);
  t.appendChild(thead);
  const tb = document.createElement('tbody');
  union.forEach((n) => tb.appendChild(_esfTabFila(n, cols)));
  tb.appendChild(_esfTabFilaStay(cols));
  tb.appendChild(_esfTabFilaRide(cols));
  t.appendChild(tb);
  wrap.appendChild(t);
  cont.appendChild(wrap);

  const pie = document.createElement('div');
  pie.style.cssText = 'font-size:11px;color:var(--ts);margin-top:6px;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
  const txt = document.createElement('span');
  txt.textContent = union.length + ' zona(s) × ' + cols.length + ' ' + (cols[0].mago ? 'columna' : 'fecha(s)') +
    (cols[0].mago ? '. Agrega una fecha y esta columna se convierte en la primera noche.'
                  : '. Las zonas del evento se calculan de aquí: una zona se vende si se vende en alguna fecha.');
  pie.appendChild(txt);
  if (_esfTabEspejo(cols[0])) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-ghost';
    b.style.cssText = 'font-size:11px';
    b.textContent = 'Dar lista CHEAP propia';
    b.title = 'Copia las zonas PLUS a una lista CHEAP independiente, para poder agotarla aparte.';
    b.addEventListener('click', () => { _esfTabEstrenarCheapMago(); _esfTabSync(); });
    pie.appendChild(b);
  }
  cont.appendChild(pie);
}
function _esfTabStayDesde(col) {
  const libres = _esfTabUnion()
    .map((n) => _esfTabZona(col, 'zonas', n))
    .filter((z) => z && !z.ag && !z.prox && z.p > 0)
    .map((z) => z.p);
  return libres.length ? (Math.min.apply(null, libres) - _TAB_STAY_DESC) : 0;
}
function _esfTabFilaStay(cols) {
  const tr = document.createElement('tr');
  tr.style.cssText = 'border-top:2px solid var(--border);background:var(--bg2,transparent)';
  const th = document.createElement('td');
  th.style.cssText = _TAB_CSS.zn;
  const t1 = document.createElement('div');
  t1.style.cssText = 'font-weight:600;font-size:12px';
  t1.textContent = 'STAY';
  const t2 = document.createElement('div');
  t2.style.cssText = 'font-size:10px;color:var(--ts);margin-top:1px';
  t2.textContent = 'se calcula solo: PLUS − $' + _TAB_STAY_DESC;
  th.appendChild(t1); th.appendChild(t2);
  // `noStay` no se duplica: esta casilla ESCRIBE en la del bloque de paquetes,
  // que sigue siendo su casa. Es la misma pieza vista desde donde se necesita.
  const chk = document.getElementById('esf-pkg-nostay');
  // `.chk-linea` es la clase que esta casa ya tiene para esto: sin ella,
  // `.form-group label` la pinta como RÓTULO (block, 9px, mayúsculas) y el
  // texto suelto se despega del cuadrito. Y el texto va dentro de UN <span>,
  // porque un label flex hace de cada nodo de texto un ítem y el gap los separa
  // —está escrito en kamehouse.css y aun así caí.
  const lab = document.createElement('label');
  lab.className = 'chk-linea';
  lab.style.cssText = 'font-size:11px;margin-top:4px';
  lab.title = 'Este evento no vende STAY. Es la misma casilla que «Sin STAY» del bloque de paquetes.';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!(chk && chk.checked);
  cb.addEventListener('change', () => {
    if (chk) { chk.checked = cb.checked; chk.dispatchEvent(new Event('change', { bubbles: true })); }
    _esfTableroPintar();
  });
  const sp = document.createElement('span'); sp.textContent = 'No vende STAY';
  lab.appendChild(cb); lab.appendChild(sp);
  th.appendChild(lab);
  tr.appendChild(th);
  const apagado = !!(chk && chk.checked);
  cols.forEach((c) => {
    const td = document.createElement('td');
    td.colSpan = 2;
    td.style.cssText = _TAB_CSS.td + ';text-align:center;font-size:11px;color:var(--ts)';
    if (apagado) { td.textContent = 'no se vende'; td.style.opacity = '.6'; }
    else {
      const v = _esfTabStayDesde(c);
      td.textContent = v > 0 ? ('desde $' + v.toLocaleString('en-US')) : '—';
      td.title = v > 0 ? 'La zona PLUS más barata que se vende en esta columna, menos $' + _TAB_STAY_DESC : 'Sin zonas PLUS a la venta en esta columna';
    }
    tr.appendChild(td);
  });
  return tr;
}
// RIDE: éste SÍ se captura, y por fecha. El global NO es un duplicado: el index
// lo usa como BASE de las fechas que no traen el suyo —`m.ride || cur.ride` en
// index.html:4956 y :5998, medido—, así que ni se esconde ni se deriva; se
// ANUNCIA, para que una celda vacía no parezca un cero.
function _esfTabFilaRide(cols) {
  const tr = document.createElement('tr');
  tr.style.cssText = 'border-top:1px solid var(--border)';
  const th = document.createElement('td');
  th.style.cssText = _TAB_CSS.zn;
  const t1 = document.createElement('div');
  t1.style.cssText = 'font-weight:600;font-size:12px';
  t1.textContent = 'RIDE';
  const global = parseInt(document.getElementById('esf-ride')?.value || '', 10);
  const t2 = document.createElement('div');
  t2.style.cssText = 'font-size:10px;color:var(--ts);margin-top:1px';
  t2.textContent = Number.isFinite(global) && global > 0
    ? ('vacío = el del evento, $' + global.toLocaleString('en-US'))
    : 'sin precio del evento: captúralo en Separo';
  th.appendChild(t1); th.appendChild(t2);
  tr.appendChild(th);
  cols.forEach((c) => {
    const td = document.createElement('td');
    td.colSpan = 2;
    td.style.cssText = _TAB_CSS.td;
    if (c.mago) {
      // Un evento de una fecha no tiene RIDE por noche ni `rideAgotado`: el
      // catálogo no lo conoce a nivel evento (medido: 0 de 107). Se dice dónde
      // vive en vez de estrenar un control que el sitio no leería.
      td.style.cssText += ';text-align:center;font-size:11px;color:var(--ts)';
      td.textContent = (Number.isFinite(global) && global > 0)
        ? ('$' + global.toLocaleString('en-US') + ' · se captura en Separo')
        : 'sin RIDE';
      td.title = 'El precio del RIDE del evento vive en el bloque Separo. Un evento de una sola fecha no tiene RIDE por noche.';
      tr.appendChild(td);
      return;
    }
    const caja = document.createElement('div');
    caja.style.cssText = 'display:flex;gap:4px;align-items:center';
    const inp = c.box.querySelector('.esf-mf-ride');
    const rag = c.box.querySelector('.esf-mf-rideag');
    const p = document.createElement('input');
    p.className = 'cot-input'; p.type = 'number'; p.min = '0';
    p.placeholder = (Number.isFinite(global) && global > 0) ? String(global) : '$ RIDE';
    p.style.cssText = 'flex:1;min-width:62px;font-size:11px;padding:2px 5px';
    if (inp && inp.value) p.value = inp.value;
    p.addEventListener('input', () => {
      if (!inp) return;
      inp.value = p.value;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const lab = document.createElement('label');
    lab.style.cssText = 'font-size:10px;display:flex;align-items:center;gap:2px;white-space:nowrap';
    lab.title = 'RIDE agotado en esta fecha';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!(rag && rag.checked);
    const pinta = () => {
      td.style.background = cb.checked ? 'color-mix(in srgb, var(--red) 12%, transparent)' : 'transparent';
      lab.style.color = cb.checked ? 'var(--red)' : 'var(--ts)';
    };
    cb.addEventListener('change', () => {
      if (rag) { rag.checked = cb.checked; rag.dispatchEvent(new Event('change', { bubbles: true })); }
      pinta();
    });
    lab.appendChild(cb); lab.appendChild(document.createTextNode('ag'));
    caja.appendChild(p); caja.appendChild(lab);
    td.appendChild(caja);
    pinta();
    tr.appendChild(td);
  });
  return tr;
}
function _esfTabFila(n, cols) {
  const tr = document.createElement('tr');
  tr.style.cssText = 'border-top:1px solid var(--border)';
  const th = document.createElement('td');
  th.style.cssText = _TAB_CSS.zn;
  // [ESF-UX-3-1b] El nombre se teclea AQUÍ. Antes vivía en un `prompt()`, que
  // para dar de alta un evento de diez zonas son diez ventanitas: en 23
  // sucursales eso no se aguanta. Renombrar cambia la zona en TODAS las
  // columnas —es lo que significa una fila de tablero.
  const nom = document.createElement('input');
  nom.className = 'cot-input';
  nom.style.cssText = 'font-weight:600;font-size:12px;padding:2px 5px;width:100%;min-width:150px';
  nom.placeholder = 'Nombre de la zona';
  nom.value = n;
  // [ESF-UX-5] El gancho para llegar a ESTA fila desde fuera. Sin él, «agregar
  // zona» tenía que adivinar cuál es la fila nueva contando filas — y contaba
  // mal: la última del tbody es RIDE, no una zona.
  nom.dataset.zona = n;
  nom.addEventListener('change', () => {
    const nuevo = (nom.value || '').trim();
    if (nuevo === n) return;
    if (!nuevo) { nom.value = n; return; }                       // vaciar no borra: para eso está la ✕
    if (_esfTabUnion().includes(nuevo)) { showToast('Ya hay una zona con ese nombre', 'error'); nom.value = n; return; }
    cols.forEach((c) => ['zonas', 'cheapZonas'].forEach((k) => {
      const z = _esfTabZona(c, k, n);
      if (z) z.n = nuevo;
    }));
    _esfTableroPintar();
  });
  const cab = document.createElement('div');
  cab.style.cssText = 'display:flex;gap:4px;align-items:center';
  cab.appendChild(nom);
  const quitar = document.createElement('button');
  quitar.type = 'button'; quitar.className = 'btn btn-ghost';
  quitar.style.cssText = 'font-size:11px;padding:2px 6px;color:var(--red)';
  quitar.textContent = '✕';
  quitar.title = 'Quitar esta zona de TODAS las columnas';
  quitar.addEventListener('click', () => _esfTabQuitarZona(n));
  cab.appendChild(quitar);
  th.appendChild(cab);
  const fila = document.createElement('div');
  fila.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:2px';
  const todas = () => {
    const out = [];
    cols.forEach((c) => { ['zonas', 'cheapZonas'].forEach((k) => { const z = _esfTabZona(c, k, n); if (z) out.push(z); }); });
    return out;
  };
  const tri = (etiqueta, llave, titulo) => {
    const lab = document.createElement('label');
    lab.style.cssText = 'font-size:10px;display:flex;align-items:center;gap:2px;color:var(--ts)';
    lab.title = titulo;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    const vals = [...new Set(todas().map((z) => (z[llave] ? 1 : 0)))];
    cb.checked = vals.length === 1 && vals[0] === 1;
    // Indeterminada = las columnas no dicen lo mismo. Mientras no se toque, cada
    // una conserva el suyo: el tablero no promedia lo que no gobierna.
    cb.indeterminate = vals.length > 1;
    cb.addEventListener('change', () => {
      cb.indeterminate = false;
      todas().forEach((z) => { if (cb.checked) z[llave] = 1; else delete z[llave]; });
      _esfTableroPintar();
    });
    lab.appendChild(cb); lab.appendChild(document.createTextNode(etiqueta));
    return lab;
  };
  fila.appendChild(tri('VIP', 'vip', 'Zona preferente. Si las columnas no coinciden, la casilla nace a medias y no las toca hasta que la aprietes.'));
  fila.appendChild(tri('Próx.', 'prox', 'Se anuncia sin precio. No varía entre fechas en ningún evento del catálogo.'));
  const sep = document.createElement('input');
  sep.className = 'cot-input'; sep.type = 'number'; sep.min = '0';
  sep.placeholder = 'separo esp.';
  sep.title = 'Separo especial de esta zona en CHEAP. Vacío = el separo normal del evento.';
  sep.style.cssText = 'flex:0 0 88px;font-size:11px;padding:2px 5px';
  const conSep = cols.map((c) => _esfTabZona(c, 'cheapZonas', n)).filter(Boolean).find((z) => z.sepEspecial);
  if (conSep) sep.value = conSep.sepEspecial;
  sep.addEventListener('change', () => {
    const v = parseInt(sep.value || '', 10);
    cols.forEach((c) => {
      const z = _esfTabZona(c, 'cheapZonas', n);
      if (!z || !('sepEspecial' in z)) return;
      if (Number.isFinite(v) && v > 0) z.sepEspecial = v; else delete z.sepEspecial;
    });
  });
  fila.appendChild(sep);
  th.appendChild(fila);
  tr.appendChild(th);
  cols.forEach((c) => {
    tr.appendChild(_esfTabCelda(c, 'zonas', n));
    tr.appendChild(_esfTabCelda(c, 'cheapZonas', n));
  });
  return tr;
}
// Una media celda. Los estados VISIBLES, cada uno dicho con todas sus letras:
// libre · agotada · hereda · espejo · «— agregar». Un switch que no distingue
// «apagado» de «no aplica» repetiría la trampa que este tablero vino a quitar.
function _esfTabCelda(col, cual, n) {
  const td = document.createElement('td');
  td.style.cssText = _TAB_CSS.td;
  const hereda = (cual === 'cheapZonas') && _esfTabHereda(col);
  const z = _esfTabZona(col, cual, n);
  if (hereda || !z) {
    const vacia = document.createElement('button');
    vacia.type = 'button'; vacia.className = 'btn btn-ghost';
    vacia.style.cssText = 'width:100%;font-size:10px;padding:3px;color:var(--ts);opacity:.75';
    vacia.textContent = hereda ? 'hereda' : '— agregar';
    vacia.title = hereda
      ? 'Esta fecha no tiene lista CHEAP propia: usa la del evento. Apriétalo para darle la suya, copiada de sus zonas PLUS.'
      : 'Esta zona no existe en esta columna. Apriétalo para agregarla.';
    vacia.addEventListener('click', () => {
      if (hereda) _esfTabEstrenarCheap(col);
      else if (col.mago) { if (cual === 'zonas') _esfAddZona({ n: n }); else _esfAddCheapZona({ n: n }); }
      else _esfTabLista(col, cual).push({ n: n, p: 0 });
      _esfTableroPintar();
    });
    td.appendChild(vacia);
    return td;
  }
  const espejo = (cual === 'cheapZonas') && _esfTabEspejo(col);
  const caja = document.createElement('div');
  caja.style.cssText = 'display:flex;gap:4px;align-items:center';
  const p = document.createElement('input');
  p.className = 'cot-input'; p.type = 'number'; p.min = '0'; p.placeholder = '$';
  p.style.cssText = 'flex:1;min-width:62px;font-size:11px;padding:2px 5px';
  if (z.p) p.value = z.p;
  p.addEventListener('input', () => { z.p = parseInt(p.value || '0', 10) || 0; });
  caja.appendChild(p);
  if (espejo) {
    // Sin lista propia el estado del CHEAP lo pone el PLUS: se dice, no se
    // finge un switch que arrastraría a la otra mitad de la fila.
    const marca = document.createElement('span');
    marca.style.cssText = 'font-size:10px;color:var(--ts);white-space:nowrap;opacity:.8';
    marca.textContent = z.ag ? 'espejo·ag' : 'espejo';
    marca.title = 'El agotado del CHEAP sigue al del PLUS. Para agotarlo aparte, dale lista CHEAP propia (botón abajo).';
    caja.appendChild(marca);
    td.style.background = z.ag ? 'color-mix(in srgb, var(--red) 12%, transparent)' : 'transparent';
    td.appendChild(caja);
    return td;
  }
  const lab = document.createElement('label');
  lab.style.cssText = 'font-size:10px;display:flex;align-items:center;gap:2px;white-space:nowrap';
  lab.title = 'Agotada en esta columna';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!z.ag;
  const pinta = () => {
    td.style.background = z.ag ? 'color-mix(in srgb, var(--red) 12%, transparent)' : 'transparent';
    lab.style.color = z.ag ? 'var(--red)' : 'var(--ts)';
  };
  cb.addEventListener('change', () => {
    if (cb.checked) { z.ag = 1; delete z.prox; } else { delete z.ag; }
    pinta();
  });
  lab.appendChild(cb); lab.appendChild(document.createTextNode('ag'));
  caja.appendChild(lab);
  td.appendChild(caja);
  pinta();
  return td;
}
// Darle a una FECHA su propia lista CHEAP: nace copiada de sus PLUS, que es de
// donde el sitio la sacaba por herencia. Copiar no inventa precios nuevos.
function _esfTabEstrenarCheap(col) {
  if (col.mago) return _esfTabEstrenarCheapMago();
  col.box._esfCheap = (col.box._esfZonas || []).map((z) => {
    const o = { n: z.n, p: z.p || 0 };
    if (z.ag) o.ag = 1;
    if (z.vip) o.vip = 1;
    return o;
  });
}
// Y al EVENTO de una fecha: su lista CHEAP propia nace del `pc` que ya tenían
// sus zonas —el mismo número que el sitio venía usando por la rampa—, así que
// estrenarla no cambia un solo precio publicado.
function _esfTabEstrenarCheapMago() {
  const filas = _esfMagoFilas('zonas');
  if (!filas.length) { showToast('Primero captura las zonas', 'error'); return; }
  filas.forEach((r) => {
    const z = _esfProxyZona(r, _MAGO_PLUS);
    const pc = parseInt(r.querySelector('.esf-zona-pc')?.value || '0', 10) || 0;
    _esfAddCheapZona({ n: z.n, p: pc, ag: z.ag, prox: z.prox, vip: z.vip });
  });
}
// 🔒 [ESF-DICE-1] LA ACCIÓN QUE NO TIENE NADA QUE HACER, LO DICE.
//
// Caso real del 1-sep: Memo quiso agotar una zona de julion que YA estaba
// agotada en la ficha. El botón hizo su trabajo —volver a poner `ag:1` donde ya
// estaba— y se quedó MUDO. Memo se fue creyendo que el sistema había fallado,
// cuando el sistema estaba de acuerdo con él.
//
// Es la familia de los errores mudos de FLUJO-UX-1, aplicada al ÉXITO VACÍO: un
// «no hice nada porque no hacía falta» y un «no hice nada porque me rompí» se
// ven EXACTAMENTE igual desde fuera, y el segundo es el que la gente supone.
//
// Así que se CUENTA lo que de verdad cambió. Las dos respuestas son buenas —
// «cerré cinco» y «ya estaban las cinco»—; lo que no puede pasar es el silencio.
function _esfTabAgotar(col, agotar) {
  let tocadas = 0, total = 0;
  if (col.mago) {
    _esfMagoFilas('zonas').concat(_esfMagoFilas('cheapZonas')).forEach((r) => {
      const ag = r.querySelector('.esf-zona-ag, .esf-cz-ag');
      const px = r.querySelector('.esf-zona-prox, .esf-cz-prox');
      if (!ag) return;
      total++;
      if (ag.checked !== !!agotar) tocadas++;
      ag.checked = !!agotar;
      if (agotar && px) px.checked = false;
      ag.dispatchEvent(new Event('change', { bubbles: true }));
    });
  } else {
    ['zonas', 'cheapZonas'].forEach((c) => {
      const l = (c === 'zonas') ? col.box._esfZonas : col.box._esfCheap;
      (Array.isArray(l) ? l : []).forEach((z) => {
        total++;
        const antes = !!z.ag;
        if (agotar) { z.ag = 1; delete z.prox; } else { delete z.ag; }
        if (antes !== !!z.ag) tocadas++;
      });
    });
    const ride = col.box.querySelector('.esf-mf-ride'), rag = col.box.querySelector('.esf-mf-rideag');
    if (agotar) { if (ride && ride.value && rag) { if (!rag.checked) tocadas++; rag.checked = true; } }
    else if (rag) { if (rag.checked) tocadas++; rag.checked = false; }
  }
  _esfTableroPintar();
  const donde = col.mago ? 'el evento' : ('«' + (col.lbl || 'esta fecha') + '»');
  if (!total) { _esfAviso('No hay zonas en ' + donde + ' que agotar.', 'info'); return; }
  if (!tocadas) {
    _esfAviso(agotar
      ? 'Las ' + total + ' zona(s) de ' + donde + ' YA estaban agotadas — no había nada que cambiar.'
      : 'Las ' + total + ' zona(s) de ' + donde + ' YA estaban a la venta — no había nada que cambiar.', 'info');
    return;
  }
  _esfAviso(agotar
    ? '✓ ' + tocadas + ' de ' + total + ' zona(s) de ' + donde + ' quedaron agotadas. Se ve en el sitio al publicar.'
    : '✓ ' + tocadas + ' de ' + total + ' zona(s) de ' + donde + ' volvieron a la venta. Se ve en el sitio al publicar.');
}
// [ESF-UX-5] El primer «Zona N» que no choque con lo que ya hay. El tablero
// DEDUPLICA por nombre —dos zonas que se llaman igual son una sola fila—, así
// que un nombre repetido volvería a tragarse el clic por otra puerta.
function _esfTabNombreLibre() {
  const usados = new Set(_esfTabUnion());
  let i = 1;
  while (usados.has('Zona ' + i)) i++;
  return 'Zona ' + i;
}
// Agregar una zona nueva: entra en TODAS las columnas, que es lo que una fila
// de tablero significa. Si alguna no la quiere, se le quita en su celda.
function _esfTabAddZona() {
  // [ESF-UX-5] NACE CON NOMBRE, y no es cosmético: el tablero se pinta desde
  // `_esfTabUnion()`, cuyo `meter` descarta los nombres vacíos. Una fila sin
  // nombre NO SE PUEDE REPRESENTAR en un tablero llaveado por nombre, así que
  // el «nace sin nombre y se teclea en la fila» que decía aquí describía una
  // fila que nunca existió: el clic escribía `{n:'',p:0}` en cada fecha —eso
  // sí funcionaba— y el pintado la tiraba, sin error y sin aviso. En multifecha
  // y en single por igual; el mago de single la recibía, pero UX-3 lo dejó
  // escondido para siempre, así que ahí tampoco había dónde teclearla.
  // Con nombre provisional la fila aparece, se puede renombrar encima, y el
  // botón deja de tragarse el clic.
  const n = _esfTabNombreLibre();
  _esfTabColumnas().forEach((c) => {
    if (c.mago) {
      _esfAddZona({ n: n });
      if (!_esfTabEspejo(c)) _esfAddCheapZona({ n: n });
      return;
    }
    _esfTabLista(c, 'zonas').push({ n: n, p: 0 });
    if (!_esfTabHereda(c)) _esfTabLista(c, 'cheapZonas').push({ n: n, p: 0 });
  });
  _esfTableroPintar();
  // [ESF-UX-5] El cursor va al NOMBRE de la fila que se acaba de crear, y de
  // paso lo deja seleccionado para teclear encima. Antes agarraba
  // `filas[filas.length-1]`, que es la fila RIDE —STAY y RIDE van después de
  // las zonas—: el clic mandaba el cursor al precio del transporte.
  const inp = Array.from(document.querySelectorAll('#esf-tablero tbody input'))
    .find((i) => i.dataset.zona === n);
  if (inp) { inp.focus(); inp.select(); }
}
// Quita la zona de todas las columnas. Se pregunta: borrar una fila del tablero
// borra tantas casillas como columnas haya.
function _esfTabQuitarZona(n) {
  const cuantas = _esfTabColumnas().length;
  if (n && cuantas > 1 && !confirm('Quitar «' + n + '» la borra en las ' + cuantas + ' fechas. ¿Seguir?')) return;
  _esfTabColumnas().forEach((c) => {
    if (c.mago) {
      _esfMagoFilas('zonas').concat(_esfMagoFilas('cheapZonas'))
        .filter((r) => _esfMagoNombre(r) === n).forEach((r) => r.remove());
      return;
    }
    ['_esfZonas', '_esfCheap'].forEach((k) => {
      if (Array.isArray(c.box[k])) c.box[k] = c.box[k].filter((z) => z.n !== n);
    });
  });
  _esfTableroPintar();
}
// El mago de arriba deja de pintarse SIEMPRE: con fechas porque el global se
// deriva (UX-2a/2c), y sin fechas porque el tablero lo edita por dentro. Es la
// raíz de lo que Memo describió —"hay 3 listas de precios… ¿en cuál hago los
// cambios?"— y de las dos verdades que mordieron a Omar.
function _esfTabSync() {
  const fest = !!document.getElementById('esf-es-festival')?.checked;
  // [ESF-UX-4] Los dos almacenes ya nacen `hidden` en el marcado y salieron de
  // `data-esf`, así que la pestaña no los toca. Se les sigue poniendo el
  // `display:none` aquí por si alguien los abre a mano desde la consola o desde
  // un camino viejo: dos candados baratos para lo que hoy solo tiene uno.
  ['esf-grp-zonas', 'esf-grp-cheapzonas'].forEach((id) => {
    const g = document.getElementById(id);
    if (g) { g.style.display = 'none'; g.hidden = true; }
  });
  const grp = document.getElementById('esf-grp-tablero');
  if (grp) grp.style.display = fest ? 'none' : '';   // en festival mandan sus paquetes
  _esfTableroPintar();
}
function _esfMfHotelPintar(cont, hotel) {
  if (!cont) return;
  cont.innerHTML = '';
  const filas = Array.isArray(hotel) ? hotel.filter((h) => h && typeof h === 'object') : [];
  cont._esfFilas = filas.map((h) => Object.assign({}, h));
  if (!filas.length) return;   // sin hotel capturado no se inventa uno
  const tit = document.createElement('div');
  tit.style.cssText = "font-size:10px;font-family:'JetBrains Mono',monospace;letter-spacing:.1em;color:var(--ts);margin:0 0 2px";
  tit.textContent = 'HOTEL DE ESTA NOCHE — $ POR PERSONA';
  cont.appendChild(tit);
  filas.forEach((h) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:6px;align-items:center';
    const et = document.createElement('div');
    et.style.cssText = 'flex:1;font-size:12px';
    et.textContent = (h && h.n) ? String(h.n) : '—';   // textContent: el nombre es dato, no HTML
    const inp = document.createElement('input');
    inp.className = 'cot-input esf-mf-hotel-e';
    inp.type = 'number'; inp.min = '0'; inp.placeholder = '$ por persona';
    inp.style.cssText = 'flex:0 0 120px';
    const e = Number(h && h.e);
    if (Number.isFinite(e)) inp.value = e;
    row.appendChild(et); row.appendChild(inp);
    cont.appendChild(row);
  });
}
// Devuelve las filas con el precio tecleado, o null si la fecha no traía hotel.
function _esfMfLeerHotel(cont, noches) {
  if (!cont || !Array.isArray(cont._esfFilas) || !cont._esfFilas.length) return null;
  const inputs = Array.from(cont.querySelectorAll('.esf-mf-hotel-e'));
  return cont._esfFilas.map((h, i) => {
    const out = Object.assign({}, h);
    const e = parseInt((inputs[i] && inputs[i].value) || '', 10);
    // `pp` es SIEMPRE igual a `e` (medido: 36 de 36 filas finas del catálogo),
    // pero solo se toca si la fila ya lo traía.
    if (Number.isFinite(e) && e >= 0) { out.e = e; if ('pp' in out) out.pp = e; }
    // El sufijo de noches se recalcula desde el texto base: si Memo cambia las
    // noches la descripción lo sigue; si no las toca, vuelve byte-igual.
    if (typeof out.desc === 'string') {
      out.desc = out.desc.replace(_MF_DESC_NOCHES, '') + ((noches > 1) ? (' · ' + noches + ' noches') : '');
    }
    return out;
  });
}
function _esfMfAddFecha(data) {
  const cont = document.getElementById('esf-multifecha');
  if (!cont) return;
  const d = data || {};
  // [ESF-UX-3-1a] LA CONVERSIÓN MIGRA LOS DATOS. Convertir un evento sencillo
  // en multifecha es apretar «+ Agregar fecha» con el mago lleno: la fecha 1
  // NACE con las zonas que ya tenía el evento, en vez de nacer vacía. Sin esto,
  // la fecha nueva no tiene nada que decir y el candado de ESF-FECHA-VACIA la
  // deja fuera del gobierno —el evento no se rompe, pero tampoco se convierte:
  // Memo capturaría a mano las mismas zonas que ya estaban dos centímetros
  // arriba, y en 23 sucursales eso se hace mal una de cada tres veces.
  //
  // Solo al CONVERTIR: si ya hay bloques de fecha, la fecha nueva nace limpia
  // (es una noche más, no la misma), y si el mago está vacío no hay nada que
  // migrar.
  if (!data && !_esfTabBloques().length && typeof _esfGetZonas === 'function') {
    // `pc` se queda fuera a propósito: el CHEAP de una fecha vive en su
    // `cheapZonas`, no en un precio colgado de la zona PLUS.
    const limpia = (z) => {
      const o = { n: z.n, p: z.p || 0 };
      if (z.ag) o.ag = 1;
      if (z.prox) o.prox = 1;
      if (z.vip) o.vip = 1;
      if (z.sepEspecial) o.sepEspecial = z.sepEspecial;
      return o;
    };
    const gz = _esfGetZonas().filter((z) => z && z.n);
    if (gz.length) {
      d.zonas = gz.map(limpia);
      const gc = (typeof _esfGetCheapZonas === 'function') ? _esfGetCheapZonas() : null;
      if (gc && gc.length) d.cheapZonas = gc.filter((z) => z && z.n).map(limpia);
    }
  }
  const box = document.createElement('div');
  box.className = 'esf-mf-fecha';
  box.style.cssText = 'margin-top:10px;padding:12px;border:1px solid var(--border);border-radius:var(--r-sm,8px);background:var(--bg)';
  box.innerHTML =
    '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
      '<input class="cot-input esf-mf-lbl" placeholder="Etiqueta (ej. 20 Abril)" style="flex:2;min-width:150px" autocomplete="off">' +
      '<input class="cot-input esf-mf-ds" type="date" title="Fecha real de esta noche. Vacía = el sitio solo muestra la etiqueta." style="flex:1;min-width:140px">' +
      '<button type="button" class="btn btn-ghost esf-mf-agotar" style="font-size:11px" title="Marca agotadas TODAS las zonas de esta noche, y el RIDE si lo tiene">Agotar la noche</button>' +
      '<button type="button" class="btn btn-ghost esf-mf-reabrir" style="font-size:11px" title="Quita el agotado de todas las zonas de esta noche">Reabrir</button>' +
      // `margin-left:auto` lo manda al extremo: borrar la noche entera no puede
      // quedar pegado a Reabrir, que es lo contrario y se aprieta seguido.
      '<button type="button" class="btn btn-ghost esf-mf-del" style="color:var(--red);margin-left:auto" title="Quitar esta fecha">✕</button>' +
    '</div>' +
    // [ESF-UX-1] Las cuatro llaves que `parseMultifecha` conserva y este bloque
    // no pintaba: `sublbl`, `noches`, `music` y `hotel`. Sin boca de captura,
    // abrir y guardar las BORRABA —24 valores vivos entre coronacapital y
    // flowfest, que son CONCIERTOS con entradas de forma festival (el propio
    // compilador lo dice en ESF-CIERRE-FINAL). El parser dejó de recortar ahí;
    // faltaba que el editor dejara de borrar.
    '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px">' +
      '<input class="cot-input esf-mf-sublbl" placeholder="Subtítulo (ej. 28 o 29 nov)" title="Renglón chico bajo la etiqueta. Vacío = no se muestra." style="flex:2;min-width:150px" autocomplete="off">' +
      '<input class="cot-input esf-mf-noches" type="number" min="1" placeholder="Noches" title="Noches de hotel de esta entrada. Vacío = el sitio no las anuncia." style="flex:0 0 105px">' +
      '<input class="cot-input esf-mf-music" placeholder="ID de música" title="Pista propia de esta noche. Vacío = usa la del evento." style="flex:1;min-width:130px" autocomplete="off">' +
    '</div>' +
    '<div class="esf-mf-hotelbox" style="margin-top:12px"></div>' +
    // [ESF-UX-3-1c] Los inputs del RIDE se quedan como ALMACÉN pero dejan de
    // verse aquí: el tablero es el único editor visible, y les escribe por
    // dentro. Igual que el mago en 1b — una sola fuente, una sola pantalla.
    '<div style="display:none">' +
      '<input class="cot-input esf-mf-ride" type="number" min="0" placeholder="$ RIDE de esta noche" style="flex:1;min-width:150px">' +
      '<label style="font-size:11px;display:flex;align-items:center;gap:3px;white-space:nowrap"><input type="checkbox" class="esf-mf-rideag">RIDE agotado</label>' +
    '</div>';
  box.querySelector('.esf-mf-lbl').value = (typeof d.lbl === 'string') ? d.lbl : '';
  if (typeof d.ds === 'string' && d.ds) box.querySelector('.esf-mf-ds').value = d.ds.slice(0, 10);
  if (d.ride) box.querySelector('.esf-mf-ride').value = d.ride;
  if (d.rideAgotado) box.querySelector('.esf-mf-rideag').checked = true;
  // [ESF-UX-1] La ficha original se guarda TAL CUAL. Al leer de vuelta, toda
  // llave que este bloque no administre se re-emite intacta: el editor no borra
  // lo que no entiende.
  box._esfMfOrig = (data && typeof data === 'object') ? data : {};
  const _mfSet = (sel, v) => {
    const el = box.querySelector(sel);
    if (el && v !== null && v !== undefined && v !== '') el.value = v;
  };
  _mfSet('.esf-mf-sublbl', (typeof d.sublbl === 'string') ? d.sublbl : '');
  const _mfN = Number(d.noches);
  _mfSet('.esf-mf-noches', (Number.isFinite(_mfN) && _mfN > 0) ? _mfN : '');
  _mfSet('.esf-mf-music', (typeof d.music === 'string') ? d.music : '');
  _esfMfHotelPintar(box.querySelector('.esf-mf-hotelbox'), d.hotel);
  // [ESF-UX-2b] Las zonas de la fecha ya no se pintan aquí: viven en el bloque
  // como los objetos ORIGINALES y el tablero las edita en su sitio. Mutarlos
  // en vez de reconstruirlos es lo que conserva llaves desconocidas, el orden
  // propio de cada fecha (morat NO sigue el de la unión) y la forma exacta.
  box._esfZonas = Array.isArray(d.zonas) ? d.zonas : [];
  box._esfCheap = Array.isArray(d.cheapZonas) ? d.cheapZonas : null;
  box.querySelector('.esf-mf-del').addEventListener('click', () => { box.remove(); _esfTabSync(); });
  box.querySelector('.esf-mf-lbl').addEventListener('input', () => _esfTableroPintar());
  // [ESF-UX-2b] «Copiar de arriba» se retiró con el mago: en un multifecha ya
  // no hay una lista de arriba que copiar —se DERIVA de estas fechas—. El
  // tablero trae en su lugar «hereda», que copia las PLUS de la propia fecha.
  // Agotar / reabrir la noche entera. Dos verbos explícitos en vez de un botón
  // que adivine el modo: un control que cambia de significado según un estado
  // que no se ve es un control que miente la mitad de las veces.
  const _col = () => ({ box: box, fecha: true, i: _esfTabBloques().indexOf(box) });
  box.querySelector('.esf-mf-agotar').addEventListener('click', () => _esfTabAgotar(_col(), true));
  box.querySelector('.esf-mf-reabrir').addEventListener('click', () => _esfTabAgotar(_col(), false));
  cont.appendChild(box);
  _esfTabSync();
}
// Devuelve `null` cuando no hay ni un bloque: null significa "este evento no es
// multifecha" y el compilador no emite el campo. Un arreglo, aunque sea de una
// sola noche, es una afirmación sobre el evento.
// ═══ [ESF-UX-2a] EL GLOBAL DE UN MULTIFECHA SE DERIVA, NO SE CAPTURA ═══════
// Dos listas que dicen cosas distintas sobre la misma zona son dos verdades, y
// el catálogo tenía 32 contradicciones vivas en 5 eventos: 23 zonas que ARRIBA
// se venden y están agotadas en TODAS sus fechas, y 9 al revés —inventario
// escondido—. Eso no lo arregla capturar mejor: lo arregla no capturarlo.
//
// El index nunca mira el global solo. Para el semáforo y para el "desde $X"
// CONCATENA `ev.zonas` con las zonas de todas las fechas (index.html:3686,
// 3951, `minP`), así que una mentira arriba infla la disponibilidad de la
// tarjeta. La compra, en cambio, sí usa la fecha (index.html:5341-5344): nadie
// podía comprar lo inexistente, pero la tarjeta lo ofrecía.
//
// La regla, con sus tres salidas —medidas sobre el catálogo, no supuestas:
//   · libre en ALGUNA fecha             → libre, con el precio de esa fecha
//   · nunca libre pero `prox` en alguna → prox (coronacapital/General, 5 de 6)
//   · en ninguna                        → agotada
function _esfDerivarZonasGlobales(mf, cual) {
  const orden = [], vistas = new Set();
  const de = (f) => ((cual === 'zonas' ? f.zonas : f.cheapZonas) || []);
  (mf || []).forEach((f) => de(f).forEach((z) => {
    if (z && z.n && !vistas.has(z.n)) { vistas.add(z.n); orden.push(z.n); }
  }));
  return orden.map((n) => {
    const filas = (mf || []).map((f) => de(f).find((z) => z && z.n === n)).filter(Boolean);
    const libre = filas.find((z) => !z.ag && !z.prox);
    const prox  = libre ? null : filas.find((z) => z.prox);
    const src   = libre || prox || filas[0];
    const o = { n, p: src.p || 0, ag: (libre || prox) ? 0 : 1, prox: (prox ? 1 : 0), vip: src.vip || 0 };
    // El separo especial viaja con la zona de la que se leyó el precio.
    if (src.sepEspecial) o.sepEspecial = src.sepEspecial;
    return o;
  });
}
// Lo que se GUARDA como global. Fuente única: si el evento tiene fechas, sale
// de ellas; si no, del mago de arriba, que ahí no confunde a nadie.
//
// El CHEAP tiene un matiz MEDIDO: cuando ninguna fecha declara `cheapZonas`, la
// lista de arriba NO es una segunda verdad —es LA verdad, porque la fecha
// hereda de ella ("vacías = usa las de arriba"). Derivar ahí borraría las 14
// zonas cheap de karolcdmx, que es justo el único evento en ese caso.
// [ESF-FECHA-VACIA] Una fecha SIN zonas no gobierna nada. Antes de este
// candado, apretar «+ Agregar fecha» en un evento sencillo y ponerle nombre a
// la fecha nueva dejaba el global derivado en CERO zonas —la fecha nace vacía—
// y el siguiente guardado le borraba al evento sus zonas PLUS. Medido con
// emmanuel: 8 PLUS antes, 0 después, y el CHEAP sobreviviendo, que es lo que lo
// hacía difícil de ver: el estado quedaba inconsistente, no roto.
//
// Es la MISMA forma que la excepción del cheap (`hayCheapPorFecha`): se deriva
// de las fechas solo cuando las fechas tienen algo que decir. Va en los dos
// calculadores —aquí y en `zonasSegmento` del compilador— porque si solo se
// arregla éste, la ficha queda con una fecha vacía y el compilador la deriva
// igual en el próximo publish.
function hayZonasPorFecha(mf) {
  return !!(mf || []).some((f) => Array.isArray(f.zonas) && f.zonas.length);
}
function _esfZonasParaGuardar() {
  const mf = _esfGetMultifecha();
  if (!mf || !hayZonasPorFecha(mf)) return { zonas: _esfGetZonas(), cheapZonas: _esfGetCheapZonas() };
  const hayCheapPorFecha = mf.some((f) => Array.isArray(f.cheapZonas) && f.cheapZonas.length);
  return {
    zonas: _esfDerivarZonasGlobales(mf, 'zonas'),
    cheapZonas: hayCheapPorFecha ? _esfDerivarZonasGlobales(mf, 'cheapZonas') : _esfGetCheapZonas(),
  };
}
function _esfGetMultifecha() {
  const bloques = Array.from(document.querySelectorAll('#esf-multifecha .esf-mf-fecha'));
  if (!bloques.length) return null;
  const out = bloques.map((b) => {
    const lbl = (b.querySelector('.esf-mf-lbl')?.value || '').trim();
    const ds = (b.querySelector('.esf-mf-ds')?.value || '').trim();
    // [ESF-UX-2b] Del estado del bloque, que es donde el tablero las edita.
    const cheap = (Array.isArray(b._esfCheap) ? b._esfCheap : []).filter((z) => z && z.n);
    const ride = parseInt(b.querySelector('.esf-mf-ride')?.value || '', 10);
    const sublbl = (b.querySelector('.esf-mf-sublbl')?.value || '').trim();
    const nochesN = parseInt(b.querySelector('.esf-mf-noches')?.value || '', 10);
    const noches = (Number.isFinite(nochesN) && nochesN > 0) ? nochesN : null;
    const music = (b.querySelector('.esf-mf-music')?.value || '').trim();
    const hotel = _esfMfLeerHotel(b.querySelector('.esf-mf-hotelbox'), noches || 1);
    // Las llaves se arman en el ORDEN DEL CATÁLOGO —lbl · sublbl · ds · noches ·
    // music · zonas · cheapZonas · ride · hotel · rideAgotado— para que la
    // columna se lea igual que lo compilado. No cambia nada: el juez es
    // semántico y `multifechaTexto` emite en su propio orden pase lo que pase.
    // Es legibilidad, no contrato.
    const o = { lbl };
    if (sublbl) o.sublbl = sublbl;
    if (ds) o.ds = ds;
    if (noches != null) o.noches = noches;
    if (music) o.music = music;
    o.zonas = (Array.isArray(b._esfZonas) ? b._esfZonas : []).filter((z) => z && z.n);
    if (cheap.length) o.cheapZonas = cheap;
    if (Number.isFinite(ride) && ride > 0) o.ride = ride;
    if (hotel) o.hotel = hotel;
    if (b.querySelector('.esf-mf-rideag')?.checked) {
      // [ESF-UX-1] El TIPO se conserva. El catálogo escribe `true` en morat#3 y
      // `1` en los demás, y `multifechaTexto` los emite DISTINTO
      // (`=== true ? 'true' : '1'`). Si la casilla ya venía prendida, vuelve el
      // valor original; si Memo la prendió ahora, es 1.
      const previo = (b._esfMfOrig || {}).rideAgotado;
      o.rideAgotado = previo ? previo : 1;
    }
    // [ESF-UX-1] PRESERVACIÓN. Toda llave de la ficha que este bloque no
    // administra vuelve intacta. Sin esto, una llave que el parser aprenda
    // mañana la borraría el primer guardado —que es justo lo que pasó con
    // `sublbl`, `noches`, `music` y `hotel` desde ESF-CIERRE-FINAL.
    const previa = b._esfMfOrig || {};
    Object.keys(previa).forEach((k) => {
      if (!MF_ADMINISTRADAS.has(k) && !(k in o)) o[k] = previa[k];
    });
    return o;
  // Sin etiqueta el compilador descarta la fecha (`if (!lbl) continue`), así que
  // se descarta aquí también: mandar una que el otro lado tira es mentirle a
  // quien captura.
  }).filter((f) => f.lbl);
  return out.length ? out : null;
}
function _esfClearMultifecha() {
  // [ESF-UX-2b] Al vaciarse las fechas, el tablero se va y el mago vuelve.
  setTimeout(_esfTabSync, 0);
  const c = document.getElementById('esf-multifecha');
  if (c) c.innerHTML = '';
}
// Puebla desde la fila (texto JSON o arreglo). Sin esto, abrir un evento
// sembrado y guardarlo le BORRARÍA las fechas: el payload mandaría null.
function _esfMfPopulate(raw) {
  _esfClearMultifecha();
  let m = raw;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch (_) { m = null; } }
  if (Array.isArray(m)) m.forEach((f) => { if (f && typeof f === 'object') _esfMfAddFecha(f); });
  _esfTabSync();
}
function _esfAddZona(data) {
  const cont = document.getElementById('esf-zonas');
  if (!cont) return;
  const d = data || {};
  const row = document.createElement('div');
  row.className = 'esf-zona-row';
  row.style.cssText = 'display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap';
  row.innerHTML =
    '<div class="esf-zona-nwrap" style="position:relative;flex:2;min-width:110px">' +
      '<input class="cot-input esf-zona-n" placeholder="Zona" style="width:100%" autocomplete="off">' +
      '<div class="esf-zona-sugg" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:30;background:var(--bg2);border:1px solid var(--border);border-top:none;border-radius:0 0 var(--radius) var(--radius);max-height:200px;overflow:auto"></div>' +
    '</div>' +
    '<input class="cot-input esf-zona-p" type="number" min="0" placeholder="$ PLUS" style="flex:1;min-width:78px">' +
    '<input class="cot-input esf-zona-pc" type="number" min="0" placeholder="$ CHEAP" style="flex:1;min-width:78px">' +
    // [ESF-E1b] VIP va ANTES de Agotada, igual que en el EV (`n·p·vip·ag`). Es
    // propiedad de la ZONA: dónde te sientas, no cómo lo compraste.
    '<label style="font-size:11px;display:flex;align-items:center;gap:3px;white-space:nowrap" title="Zona preferente: el sitio la marca VIP en PLUS y en CHEAP"><input type="checkbox" class="esf-zona-vip">VIP</label>' +
    '<label style="font-size:11px;display:flex;align-items:center;gap:3px;white-space:nowrap"><input type="checkbox" class="esf-zona-ag">Agotada</label>' +
    // [E1] PRÓXIMAMENTE: la zona se anuncia sin costo todavía. El index ya la
    // pinta deshabilitada en cursiva y minP la ignora, así que "desde $X" no la
    // toma. Excluyente con Agotada (abajo), porque son estados distintos: una
    // nunca estuvo a la venta, la otra se acabó.
    '<label style="font-size:11px;display:flex;align-items:center;gap:3px;white-space:nowrap" title="Se anuncia sin precio: el sitio la muestra como Próximamente"><input type="checkbox" class="esf-zona-prox">Próx.</label>' +
    '<button type="button" class="btn btn-ghost esf-zona-del" title="Quitar zona">✕</button>';
  row.querySelector('.esf-zona-n').value = (typeof d.n === 'string') ? d.n : '';
  if (d.p) row.querySelector('.esf-zona-p').value = d.p;
  if (d.pc) row.querySelector('.esf-zona-pc').value = d.pc;
  if (d.vip) row.querySelector('.esf-zona-vip').checked = true;
  if (d.ag) row.querySelector('.esf-zona-ag').checked = true;
  if (d.prox) row.querySelector('.esf-zona-prox').checked = true;
  row.querySelectorAll('input').forEach((el) => {
    el.addEventListener('input', renderEsferaPreview);
    el.addEventListener('change', renderEsferaPreview);
  });
  // [E1] Agotada y Próximamente son excluyentes: marcar una desmarca la otra.
  // Se hace aquí y no con un radio porque las dos tienen que poder quedar en
  // blanco (una zona normal, a la venta, no es ninguna de las dos).
  const _cbAg = row.querySelector('.esf-zona-ag');
  const _cbProx = row.querySelector('.esf-zona-prox');
  _cbAg.addEventListener('change', () => { if (_cbAg.checked) _cbProx.checked = false; _esfProxPintaFila(row); renderEsferaPreview(); });
  _cbProx.addEventListener('change', () => { if (_cbProx.checked) _cbAg.checked = false; _esfProxPintaFila(row); renderEsferaPreview(); });
  if (d.prox && d.ag) _cbAg.checked = false;   // por si llegara basura de la DB
  _esfProxPintaFila(row);
  // Dropdown de la libreta en el campo de nombre (sin romper renderEsferaPreview).
  const _nInp = row.querySelector('.esf-zona-n');
  _nInp.addEventListener('focus', () => _esfZonaSugg(_nInp));
  _nInp.addEventListener('input', () => _esfZonaSugg(_nInp));
  _nInp.addEventListener('blur', () => setTimeout(() => _esfZonaSuggHide(_nInp), 150));
  row.querySelector('.esf-zona-del').onclick = () => { row.remove(); renderEsferaPreview(); };
  cont.appendChild(row);
  renderEsferaPreview();
}
function _esfGetZonas() {
  return Array.from(document.querySelectorAll('#esf-zonas .esf-zona-row')).map((row) => {
    const n = (row.querySelector('.esf-zona-n')?.value || '').trim();
    const p = parseInt(row.querySelector('.esf-zona-p')?.value || '0', 10) || 0;
    const pc = parseInt(row.querySelector('.esf-zona-pc')?.value || '0', 10) || 0;
    const prox = row.querySelector('.esf-zona-prox')?.checked ? 1 : 0;
    // prox manda: nunca se guardan las dos (la UI ya lo impide, esto es el
    // cinturón por si alguien llega con datos viejos).
    const ag = (!prox && row.querySelector('.esf-zona-ag')?.checked) ? 1 : 0;
    // [ESF-E1b] VIP es INDEPENDIENTE de agotada y de próximamente: una zona
    // preferente lo sigue siendo aunque se haya acabado.
    const vip = row.querySelector('.esf-zona-vip')?.checked ? 1 : 0;
    return { n, p, pc, ag, prox, vip };
  }).filter((z) => z.n);
}
function _esfClearZonas() {
  const cont = document.getElementById('esf-zonas');
  if (cont) cont.innerHTML = '';
}
function _esfHotelExtra(total, pers) {
  const base = (total || 0) / 4;
  return Math.ceil((4 - pers) * base / pers);
}
function _esfHotelRenderRows() {
  const cont = document.getElementById('esf-hotel-items');
  if (!cont) return;
  cont.innerHTML = '';
  _ESF_HOTEL_TIPOS.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'esf-hotel-row';
    row.dataset.n = t.n;
    row.dataset.viaj = t.viaj.join(',');
    row.dataset.k = t.k;
    row.dataset.desc = t.desc;
    row.style.cssText = 'display:flex;gap:8px;margin-top:6px;align-items:center';
    row.innerHTML =
      '<div style="flex:1;font-size:12px">' + t.n + ' <span style="color:var(--ts)">(' + t.pers + 'p)</span></div>' +
      '<input class="cot-input esf-hotel-e" type="number" min="0" style="flex:0 0 120px" placeholder="$ por persona">';
    cont.appendChild(row);
  });
}
// Recalcula los 4 extras desde el costo total (sobrescribe — incluidos ajustes
// manuales; ese es el único momento en que se reescriben, como pide el spec).
function _esfHotelRecalc() {
  const total = parseInt(document.getElementById('esf-hotel-total')?.value || '0', 10) || 0;
  document.querySelectorAll('#esf-hotel-items .esf-hotel-row').forEach((row) => {
    const t = _ESF_HOTEL_TIPOS.find((x) => x.n === row.dataset.n);
    row.querySelector('.esf-hotel-e').value = _esfHotelExtra(total, t ? t.pers : 4);
  });
}
function _esfHotelToggle() {
  const on = !!document.getElementById('esf-hotel-custom')?.checked;
  const onBox = document.getElementById('esf-hotel-on');
  const offBox = document.getElementById('esf-hotel-off');
  if (onBox) onBox.style.display = on ? '' : 'none';
  if (offBox) offBox.style.display = on ? 'none' : '';
  if (on && !document.querySelector('#esf-hotel-items .esf-hotel-row')) {
    _esfHotelRenderRows();
    _esfHotelRecalc();
  }
}
// Devuelve el objeto {custom,total,items} o null (toggle apagado = default ciudad).
// ═══ [ESF-UX-1d] LOS TRES VERBOS DE LA BARRA ══════════════════════════════
// ESF-UX-1 midió que traer del catálogo costaba 7 pantallas de scroll y publicar
// otras 7. No eran trabajos difíciles: estaban LEJOS, debajo de todo.
//
// ⚠️ ESTOS BOTONES NO DUPLICAN LÓGICA. Llaman a las mismas funciones de siempre
// y bajan a su panel para que el resultado se VEA — un botón que dispara algo
// cuyo resultado se pinta 5,000px más abajo se siente roto aunque funcione.
// Duplicar el disparador está bien; duplicar la regla, nunca.
// ═══ [ESF-UX-1e] El editor en panel ═══════════════════════════════════════
// Abrir y cerrar son SOLO eso: mover el panel. Ninguno de los dos toca un
// campo. Lo que borra el formulario sigue siendo `cancelarEdicionEsfera`, y se
// llama desde donde el usuario lo pidió — nunca desde un cierre.
function _esfPanelAbrir() {
  const ov = document.getElementById('esf-panel-ov');
  if (!ov) return;
  // El título del panel se LEE del rótulo del formulario, que ya lo escriben
  // editar y cancelar: un solo dueño del texto, no dos que se desincronizan.
  const src = document.getElementById('esf-form-titulo');
  const tit = document.getElementById('esf-panel-tit');
  if (src && tit) tit.textContent = src.textContent;
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
  const body = document.getElementById('esf-panel-body');
  if (body) body.scrollTop = 0;
}
function _esfPanelCerrar() {
  const ov = document.getElementById('esf-panel-ov');
  if (!ov) return;
  ov.classList.remove('open');
  ov.setAttribute('aria-hidden', 'true');
}
function _esfPanelAbierto() {
  const ov = document.getElementById('esf-panel-ov');
  return !!(ov && ov.classList.contains('open'));
}
// El aviso de PÁGINA. Con el editor en panel, un "✓ guardado" escrito dentro
// del formulario se escribiría en una caja que acaba de cerrarse: nadie lo
// vería. El éxito sale aquí, junto a la lista que se acaba de refrescar; el
// error se queda DENTRO del panel, que es donde está el campo a corregir.
function _esfAviso(msg, tipo) {
  const el = document.getElementById('esf-aviso');
  if (!el) return;
  el.innerHTML = '<div class="alert alert-' + (tipo || 'success') + '">' + msg + '</div>';
  clearTimeout(window._esfAvisoT);
  window._esfAvisoT = setTimeout(() => { const e = document.getElementById('esf-aviso'); if (e) e.innerHTML = ''; }, 4000);
}
function _esfIrAlFormulario() {
  // Si venía de editar, se limpia: "Nuevo evento" tiene que dar un evento nuevo.
  if (window._esfEditSlug && typeof cancelarEdicionEsfera === 'function') cancelarEdicionEsfera();
  _esfPanelAbrir();
  const slug = document.getElementById('esf-slug');
  if (slug) setTimeout(() => slug.focus(), 60);
}
// Cancelar edición = "ya no estoy editando": limpia Y cierra. Son dos actos y
// se llaman los dos, en vez de darle a `cancelarEdicionEsfera` un segundo
// oficio que nadie esperaría al llamarla desde otro lado.
function _esfCancelarYCerrar() {
  cancelarEdicionEsfera();
  _esfPanelCerrar();
}
function _esfBarraTraer() {
  const caja = document.getElementById('esf-import-caja');
  if (caja) caja.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (typeof importarDelCatalogo === 'function') importarDelCatalogo();
}
function _esfBarraPublicar() {
  const panel = document.getElementById('esf-dryrun-panel');
  if (panel) panel.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (typeof publicarEsferas === 'function') publicarEsferas();
}
function _esfTab(cual) {
  _esfTabActual = cual;
  document.querySelectorAll('#page-esferas .esf-tab').forEach((b) => {
    const on = b.dataset.ir === cual;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('#page-esferas [data-esf]').forEach((g) => {
    g.style.display = (g.dataset.esf === cual) ? '' : 'none';
  });
  if (cual === 'revisar') _esfRevisarPintar();
}
// Lo que FALTA para poder guardar. Es la razón de que "Revisar" exista, y por eso
// NO se apaga: apagar la pestaña que dice qué falta es esconder la respuesta.
//
// 🔒 AQUÍ ME APARTÉ DE LO FIRMADO, y lo digo: el diseño decía "Revisar apagada
// hasta que lo mínimo esté puesto". Al construirlo se ve que es al revés — quien
// no sabe qué le falta necesita JUSTO esa pestaña. Lo que sí se apaga es el
// botón de GUARDAR, que es lo que la concesión quería evitar: crear medio evento.
// 🔒 [ESF-UX-4] EL VENUE NO ES MÍNIMO EN UN "PRÓXIMAMENTE".
// Un evento por confirmar legítimamente todavía no tiene sede: `jisoo` y `muse`
// viven así en el padrón —los dos publicados, los dos gobernables— y hasta hoy
// el candado le pedía a Memo INVENTAR un venue para poder guardarles cualquier
// otra cosa. Es la misma razón por la que las zonas avisan sin bloquear: un
// dato que todavía no existe no se exige, se anuncia.
//
// ⚠️ EN CUALQUIER OTRO STATUS SIGUE SIENDO MÍNIMO. Un evento a la venta sin
// sede es un error de captura, no una etapa; ahí el candado se queda.
//
// Medido el 26-ago sobre las 103 filas: 2 sin venue, las DOS `proximamente`,
// CERO con otro status. La regla no le abre la puerta a nadie más.
function _esfEsPorConfirmar() {
  return (document.getElementById('esf-status')?.value || '').trim() === 'proximamente';
}
function _esfFalta() {
  const faltan = _ESF_MINIMO.filter((c) =>
    !(c.salvoSi && c.salvoSi()) && !(document.getElementById(c.id)?.value || '').trim());
  // Una zona sin capturar no impide guardar un evento "por confirmar", así que
  // se AVISA sin bloquear: son dos cosas distintas y mezclarlas obligaría a
  // inventar precios para poder guardar.
  const sinZonas = document.querySelectorAll('#esf-zonas .esf-zona-row').length === 0;
  // [ESF-UX-4] El venue exonerado NO se calla. Que no bloquee no quiere decir
  // que esté bien: es un pendiente, y un pendiente que nadie enseña se olvida.
  const venuePendiente = _esfEsPorConfirmar() &&
    !(document.getElementById('esf-venue')?.value || '').trim();
  return { faltan, sinZonas, venuePendiente };
}
function _esfRevisarPintar() {
  const el = document.getElementById('esf-revisar');
  if (!el) return;
  const { faltan, sinZonas, venuePendiente } = _esfFalta();
  let h = '';
  if (faltan.length) {
    h += '<div style="color:var(--red);font-weight:700;margin-bottom:6px">No se puede guardar todavía:</div>' +
      faltan.map((c) => '<div>· falta <b>' + c.q + '</b></div>').join('');
  } else {
    h += '<div style="color:var(--green,#3ddc84);font-weight:700">Lo mínimo está puesto.</div>';
  }
  if (venuePendiente) {
    h += '<div data-esf-aviso="venue" style="margin-top:10px;color:var(--ts)">· <b>sin venue</b> — se puede guardar igual ' +
      'porque el status es <b>Próximamente</b>. En cualquier otro status el venue es obligatorio.</div>';
  }
  if (sinZonas) {
    h += '<div data-esf-aviso="zonas" style="margin-top:10px;color:var(--ts)">· <b>sin zonas capturadas</b> — se puede guardar igual ' +
      '(un evento por confirmar no tiene precios todavía), pero el sitio no lo va a poder vender.</div>';
  }
  const n = (typeof _esfExtrasContar === 'function') ? _esfExtrasContar() : 0;
  if (n) h += '<div style="margin-top:10px;color:var(--ts)">· <b>' + n + '</b> grupo(s) con dato en <b>Extras</b>.</div>';
  el.innerHTML = h;
}
// El botón de guardar se apaga si falta lo mínimo, y DICE por qué: un botón
// apagado sin explicación manda a adivinar.
function _esfSyncGuardar() {
  const btn = document.getElementById('esf-submit-btn');
  if (!btn) return;
  const { faltan, venuePendiente } = _esfFalta();
  btn.disabled = faltan.length > 0;
  btn.style.opacity = faltan.length ? '.5' : '';
  // [ESF-UX-4] El tooltip DICE LA REGLA, no solo el veredicto. Un botón que se
  // enciende sin venue después de haber estado apagado por el venue se lee como
  // un bug si no explica qué cambió.
  btn.title = faltan.length
    ? ('Falta ' + faltan.map((c) => c.q).join(', '))
    : (venuePendiente
      ? 'Se guarda sin venue porque el status es Próximamente. En cualquier otro status el venue es obligatorio.'
      : '');
  const bd = document.getElementById('esf-tab-revisar-n');
  if (bd) { bd.textContent = faltan.length ? ('(' + faltan.length + ')') : ''; bd.classList.toggle('falta', faltan.length > 0); }
  const be = document.getElementById('esf-tab-extras-n');
  if (be && typeof _esfExtrasContar === 'function') {
    const n = _esfExtrasContar();
    be.textContent = n ? ('(' + n + ')') : '';
    be.classList.toggle('hay', n > 0);
  }
  if (_esfTabActual === 'revisar') _esfRevisarPintar();
}
// Se vigila TODO el formulario: el estado del botón tiene que seguir al dato,
// no a que alguien se acuerde de llamarlo.
function _esfTabsVigilar() {
  const col = document.querySelector('#page-esferas .esf-col-form');
  if (!col || col.dataset.vigilado) return;
  col.dataset.vigilado = '1';
  col.addEventListener('input', _esfSyncGuardar);
  col.addEventListener('change', _esfSyncGuardar);
}
// ═══ [ESF-UX-1b] EL PLIEGUE DE LO AVANZADO ════════════════════════════════
// Seis grupos —apuntes, imagen, corrido, cartel, flash, banco— que ESF-UX-1
// midió como 849px y 18 de los 48 campos, y que casi nunca se tocan.
//
// ⚠️ NACE CERRADO Y NO RECUERDA su estado, al revés que el pliegue de la lista.
// Si recordara, la primera vez que alguien lo abriera quedaría abierto para
// siempre y el pliegue dejaría de servir. Un pliegue de FORMULARIO se cierra
// con cada evento; uno de SECCIÓN es una preferencia de pantalla. No son lo
// mismo aunque se vean igual.
//
// 🔒 Y ANUNCIA SI TRAE CONTENIDO. Es la lección de `promo_code`: lo plegado SE
// OLVIDA al editar, y un evento con promo que se guarda sin que nadie mire el
// pliegue sale igual — pero el que lo edita no tiene forma de saber que estaba.
// El encabezado dice "(2 con dato)" y el badge se pinta con el acento de la casa.
function _esfExtrasToggle() {
  const body = document.getElementById('esf-extras-body');
  const head = document.getElementById('esf-extras-head');
  const chev = document.getElementById('esf-extras-chev');
  if (!body) return;
  const abierto = body.style.display !== 'none';
  body.style.display = abierto ? 'none' : '';
  if (head) head.setAttribute('aria-expanded', abierto ? 'false' : 'true');
  if (chev) chev.textContent = abierto ? '▸' : '▾';
}
function _esfExtrasCerrar() {
  const body = document.getElementById('esf-extras-body');
  if (body) body.style.display = 'none';
  const head = document.getElementById('esf-extras-head');
  if (head) head.setAttribute('aria-expanded', 'false');
  const chev = document.getElementById('esf-extras-chev');
  if (chev) chev.textContent = '▸';
}
function _esfExtrasContar() {
  _esfExtrasVigilar();
  let n = 0;
  for (const g of _ESF_EXTRAS_GRUPOS) {
    const conTexto = g.txt.some((id) => (document.getElementById(id)?.value || '').trim() !== '');
    const conChk = g.chk.some((id) => !!document.getElementById(id)?.checked);
    if (conTexto || conChk) n++;
  }
  const el = document.getElementById('esf-extras-cuenta');
  if (el) {
    el.textContent = n ? ('(' + n + ' con dato)') : '';
    el.classList.toggle('hay', n > 0);
  }
  return n;
}
// Se recuenta con CUALQUIER cambio dentro del pliegue: si no, el badge diría
// una cosa mientras el formulario dice otra.
//
// ⚠️ Se engancha PEREZOSAMENTE, desde el primer conteo, y no en un IIFE al
// cargar el script: cuando `kamehouse.js` se evalúa, el markup de Esferas puede
// no existir todavía, y un vigilante que no encuentra su nodo no vuelve a
// intentarlo — se quedaría mudo para siempre sin decir nada.
function _esfExtrasVigilar() {
  const body = document.getElementById('esf-extras-body');
  if (!body || body.dataset.vigilado) return;
  body.dataset.vigilado = '1';
  body.addEventListener('input', _esfExtrasContar);
  body.addEventListener('change', _esfExtrasContar);
}
// ═══ [ESF-CIERRE-FECHA] EL EVENTO DE CORRIDO ══════════════════════════════
// Dura varios días SEGUIDOS y no se elige noche: se va a los tres. Es distinto
// de las "fechas adicionales", que SÍ estrenan selector de día en el sitio —
// por eso el rango NO emite `dsList`.
//
// El campo de texto libre es el override para cuando el cartel dice algo que
// ninguna regla genera (`warped` escribe "12-13 sep 2026", no "12 y 13"). Gana
// sobre el rango, y la vista previa lo dice para que no se use sin querer.
function _esfCorridoPreview() {
  const el = document.getElementById('esf-corrido-preview');
  if (!el) return;
  const ini = (document.getElementById('esf-fecha')?.value || '').trim();
  const fin = (document.getElementById('esf-fecha-fin')?.value || '').trim();
  const txt = (document.getElementById('esf-f-texto')?.value || '').trim();
  if (txt) { el.innerHTML = 'El sitio dirá <b>' + _esfEsc(txt) + '</b> — texto tal cual, <b>gana sobre el rango</b>.'; return; }
  if (!fin) { el.innerHTML = 'Vacío = el evento es de <b>un solo día</b> (o usa las fechas adicionales de arriba, que sí dejan elegir noche).'; return; }
  if (!ini) { el.innerHTML = '<span style="color:var(--orange)">Falta la fecha de inicio.</span>'; return; }
  if (fin < ini) { el.innerHTML = '<span style="color:var(--red)">El fin es <b>antes</b> del inicio. Revisa cuál está al revés.</span>'; return; }
  const dias = [];
  const d = new Date(ini + 'T12:00:00Z'), tope = new Date(fin + 'T12:00:00Z');
  while (d <= tope && dias.length < 60) { dias.push(d.getUTCDate()); d.setUTCDate(d.getUTCDate() + 1); }
  el.innerHTML = 'Dura <b>' + dias.length + ' día(s) seguidos</b>. El sitio lo anunciará con los días ' +
    dias.join(', ') + ' — <b>sin</b> selector de noche.';
}
// ═══ [ESF-CIERRE-LINEUP] EL CARTEL ════════════════════════════════════════
// Un solo campo que acepta las DOS formas del catálogo: una llave de
// `lineups.js` o una URL. Subir una imagen solo RELLENA el campo con su URL —
// el dato sigue siendo uno, y así los 12 eventos que hoy usan llave siguen
// funcionando sin tocarse.
function _esfLineupShow(v) {
  const val = (v || '').trim();
  const prev = document.getElementById('esf-lineup-preview');
  const img = document.getElementById('esf-lineup-img');
  const clr = document.getElementById('esf-lineup-clear');
  const esUrl = /^(https?:|data:)/.test(val);
  if (img) img.src = esUrl ? val : '';
  if (prev) prev.style.display = esUrl ? '' : 'none';
  if (clr) clr.style.display = val ? '' : 'none';
}
function _esfLineupClear() {
  const el = document.getElementById('esf-lineup'); if (el) el.value = '';
  const st = document.getElementById('esf-lineup-status'); if (st) st.textContent = '';
  _esfLineupShow('');
}
// Reusa `esferas-subir-imagen` tipo:'lineup' —el mismo del panel de festival— y
// su re-escalado. No hay endpoint nuevo que auditar.
async function _esfLineupPick(event) {
  const f = event && event.target && event.target.files && event.target.files[0];
  if (!f) return;
  const slug = (document.getElementById('esf-slug')?.value || '').trim().toLowerCase();
  if (!slug) { showToast('Primero pon el slug del evento', 'error'); event.target.value = ''; return; }
  const st = document.getElementById('esf-lineup-status');
  if (st) st.textContent = 'Subiendo…';
  try {
    const dataUrl = await _esfMapaResize(f);
    const r = await khAdminFetch('/.netlify/functions/esferas-subir-imagen', {
      method: 'POST', body: JSON.stringify({ slug, dataUrl, tipo: 'lineup' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.error || ('Error ' + r.status));
    const el = document.getElementById('esf-lineup'); if (el) el.value = d.url;
    _esfLineupShow(d.url);
    if (st) st.textContent = 'Listo';
  } catch (e) {
    if (st) st.textContent = '';
    showToast(e.message, 'error');
  } finally { event.target.value = ''; }
}
function _esfFlashInstante() {
  const f = (document.getElementById('esf-flash-fecha')?.value || '').trim();
  const h = (document.getElementById('esf-flash-hora')?.value || '').trim();
  if (!f) return null;
  const ts = Date.parse(f + 'T' + (h || '00:00:00') + ESF_FLASH_TZ);
  return Number.isFinite(ts) ? ts : null;
}
function _esfGetFlash() {
  const code = (document.getElementById('esf-flash-code')?.value || '').trim();
  const valor = parseInt(document.getElementById('esf-flash-valor')?.value || '', 10);
  const ts = _esfFlashInstante();
  // Sin código, sin valor o sin vencimiento NO hay promo: `null`, que es
  // distinto de un objeto a medias. El servidor lo rechazaría igual, pero
  // mandarlo sería pedirle que adivine.
  if (!code || !(Number.isFinite(valor) && valor > 0) || ts == null) return null;
  const base = (window._esfFlashCache && typeof window._esfFlashCache === 'object')
    ? Object.assign({}, window._esfFlashCache) : {};
  delete base.pct; delete base.amount;              // son excluyentes: se reescribe el elegido
  base.code = code;
  base[(document.getElementById('esf-flash-tipo')?.value === 'amount') ? 'amount' : 'pct'] = valor;
  // Los MILISEGUNDOS del original se conservan si el reloj de pared no cambió.
  // Un `input type="time"` solo llega al segundo, así que el redondo de un
  // vencimiento importado (`…035`) devolvía `…000` y editar CUALQUIER otro
  // campo le movía el vencimiento a un evento que nadie tocó. Si Memo sí cambia
  // la fecha o la hora, manda lo que tecleó — al segundo, como lo escribió.
  const previo = Number(base.expiresTs);
  base.expiresTs = (Number.isFinite(previo) && Math.floor(previo / 1000) === Math.floor(ts / 1000))
    ? previo : ts;
  if (document.getElementById('esf-flash-soloplus')?.checked) base.excludePkg = ['ride', 'stay', 'cheap'];
  else delete base.excludePkg;
  return JSON.stringify(base);
}
// Puebla desde la fila y GUARDA el objeto entero en el cache.
function _esfFlashPopulate(raw) {
  let o = raw;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (_) { o = null; } }
  window._esfFlashCache = (o && typeof o === 'object' && !Array.isArray(o)) ? o : null;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  const c = window._esfFlashCache;
  set('esf-flash-code', c ? (c.code || '') : '');
  set('esf-flash-tipo', (c && c.amount != null && c.pct == null) ? 'amount' : 'pct');
  set('esf-flash-valor', c ? String((c.amount != null && c.pct == null) ? c.amount : (c.pct || '')) : '');
  const cb = document.getElementById('esf-flash-soloplus');
  if (cb) cb.checked = !!(c && Array.isArray(c.excludePkg) && c.excludePkg.length);
  if (c && Number.isFinite(Number(c.expiresTs))) {
    // El instante se vuelve a mostrar EN REYNOSA, no en la hora del navegador:
    // si se pintara en local, alguien en otro huso vería otra hora y al guardar
    // movería el vencimiento sin tocarlo.
    const d = new Date(Number(c.expiresTs));
    const en = d.toLocaleString('sv-SE', { timeZone: TZ_REYNOSA });  // [TZ-UNIF-1] el reloj real de Reynosa
    set('esf-flash-fecha', en.slice(0, 10));
    set('esf-flash-hora', en.slice(11, 19));
  } else { set('esf-flash-fecha', ''); set('esf-flash-hora', ''); }
  _esfFlashPreview();
}
function _esfFlashClear() { window._esfFlashCache = null; _esfFlashPopulate(null); }
// Dice EN PALABRAS qué se va a guardar. Un epoch de 13 cifras no se puede
// revisar de un vistazo, y este campo apaga descuentos.
function _esfFlashPreview() {
  const el = document.getElementById('esf-flash-preview');
  if (!el) return;
  const j = _esfGetFlash();
  if (!j) { el.innerHTML = 'Vacío = <b>este evento no tiene código flash</b>. Hacen falta código, valor y vencimiento.'; return; }
  const o = JSON.parse(j);
  const d = new Date(o.expiresTs);
  const en = d.toLocaleString('sv-SE', { timeZone: TZ_REYNOSA });
  el.innerHTML = 'Código <b>' + _esfEsc(o.code) + '</b> · ' +
    (o.pct != null ? o.pct + '% de descuento' : '$' + o.amount + ' de descuento') +
    (o.excludePkg ? ' · <b>solo PLUS</b>' : '') +
    '<br>vence el <b>' + en.slice(0, 10) + '</b> a las <b>' + en.slice(11, 19) + '</b> hora de Reynosa (−05:00)';
}
function _esfGetHotel() {
  if (!document.getElementById('esf-hotel-custom')?.checked) return null;
  const total = parseInt(document.getElementById('esf-hotel-total')?.value || '0', 10) || 0;
  // [ESF-CIERRE-HOTEL] El detalle es OPT-IN. Emitirlo siempre le estrenaría
  // `k`/`pp`/`desc` a las 109 filas simples del catálogo — la lección de #585:
  // una condición más laxa cambia datos que nadie pidió cambiar.
  const fino = !!document.getElementById('esf-hotel-fino')?.checked;
  const noches = parseInt(document.getElementById('esf-hotel-noches')?.value || '1', 10) || 1;
  const items = Array.from(document.querySelectorAll('#esf-hotel-items .esf-hotel-row')).map((row) => {
    const e = parseInt(row.querySelector('.esf-hotel-e')?.value || '0', 10) || 0;
    const base = {
      n: row.dataset.n, e,
      viaj: row.dataset.viaj.split(',').map((x) => parseInt(x, 10)).filter((x) => !isNaN(x)),
    };
    if (!fino) return base;
    // `pp` es el mismo número que `e` (medido: 36 de 36) y `desc` sale del tipo,
    // con el sufijo de noches cuando el paquete trae más de una.
    return Object.assign({ k: row.dataset.k }, base, {
      pp: e,
      desc: row.dataset.desc + (noches > 1 ? (' · ' + noches + ' noches') : ''),
    });
  });
  return { custom: true, total, items };
}
function _esfClearHotel() {
  const chk = document.getElementById('esf-hotel-custom');
  if (chk) chk.checked = false;
  const total = document.getElementById('esf-hotel-total');
  if (total) total.value = '';
  const items = document.getElementById('esf-hotel-items');
  if (items) items.innerHTML = '';
  // [ESF-CIERRE-HOTEL] El detalle y las noches también se limpian: si no, el
  // siguiente evento nacería con el detalle del anterior.
  const fino = document.getElementById('esf-hotel-fino'); if (fino) fino.checked = false;
  const noches = document.getElementById('esf-hotel-noches'); if (noches) noches.value = '1';
  _esfHotelToggle();
}
// Re-poblar en modo editar desde `hotel` (texto JSON u objeto). custom:false → off.
function _esfHotelPopulate(raw) {
  _esfClearHotel();
  let h = raw;
  if (typeof h === 'string') { try { h = JSON.parse(h); } catch { h = null; } }
  if (!h || !h.custom || !Array.isArray(h.items) || !h.items.length) return;
  const chk = document.getElementById('esf-hotel-custom');
  if (chk) chk.checked = true;
  _esfHotelToggle();              // muestra el panel y crea las 4 filas
  const totalEl = document.getElementById('esf-hotel-total');
  if (totalEl) totalEl.value = (h.total != null) ? h.total : '';
  const byName = {};
  h.items.forEach((it) => { if (it && typeof it.n === 'string') byName[it.n.trim()] = it.e; });
  document.querySelectorAll('#esf-hotel-items .esf-hotel-row').forEach((row) => {
    if (byName[row.dataset.n] != null) row.querySelector('.esf-hotel-e').value = byName[row.dataset.n];
  });
  // [ESF-CIERRE-HOTEL] El detalle y las noches se re-pueblan, o abrir un hotel
  // fino y guardarlo lo DEGRADARÍA a simple sin que nadie lo pidiera — la misma
  // trampa que E3 con las noches de multifecha.
  const fino = h.items.some((it) => it && typeof it.k === 'string' && it.k);
  const chkF = document.getElementById('esf-hotel-fino');
  if (chkF) chkF.checked = fino;
  const nEl = document.getElementById('esf-hotel-noches');
  if (nEl) {
    // Las noches se LEEN del sufijo de la descripción, que es donde viven hoy.
    let noches = 1;
    for (const it of h.items) {
      const m = (it && typeof it.desc === 'string') ? /· (\d+) noches/.exec(it.desc) : null;
      if (m) { noches = parseInt(m[1], 10) || 1; break; }
    }
    nEl.value = String(noches);
  }
}
// [ESF-MAPA-2] ¿Esto es una imagen que el navegador puede pintar, o una CLAVE
// CORTA heredada de la tabla vieja de `mapas.js` (`caifanes`, `calle24`)?
function _esfMapaEsUrl(v) {
  const s = String(v == null ? '' : v).trim();
  return /^https?:\/\//.test(s) || s.charAt(0) === '/' || s.startsWith('data:');
}
function _esfMapaShow(url) {
  _esfMapaUrl = url || '';
  const prev = document.getElementById('esf-mapa-preview');
  const img = document.getElementById('esf-mapa-img');
  const clr = document.getElementById('esf-mapa-clear');
  const her = document.getElementById('esf-mapa-heredado');
  // [ESF-MAPA-2] Una clave corta NO se mete en un `<img>`: el navegador la
  // resuelve contra nuestro origen, da 404, y la ficha enseña una imagen rota
  // JUNTO A UN BOTÓN DE «QUITAR». El mapa está bien; lo que estaba mal era la
  // pantalla — y esa invitación a borrar es la mejor explicación que hay de los
  // mapas que se perdieron. Se pinta como lo que es: una clave heredada, que
  // el sitio sabe resolver y el editor no sabe dibujar.
  const esUrl = _esfMapaEsUrl(_esfMapaUrl);
  if (_esfMapaUrl && esUrl) {
    if (img) img.src = _esfMapaUrl;
    if (prev) prev.style.display = '';
    if (her) her.style.display = 'none';
    if (clr) clr.style.display = '';
  } else if (_esfMapaUrl) {
    if (img) img.src = '';
    if (prev) prev.style.display = 'none';
    if (her) {
      her.textContent = 'Mapa heredado: «' + _esfMapaUrl + '» — lo resuelve el sitio con la tabla vieja. Se conserva al guardar; sube una imagen si quieres reemplazarlo.';
      her.style.display = '';
    }
    if (clr) clr.style.display = '';
  } else {
    if (img) img.src = '';
    if (prev) prev.style.display = 'none';
    if (her) her.style.display = 'none';
    if (clr) clr.style.display = 'none';
  }
}
// [ESF-MAPA-2] «Quitar» APAGA el mapa de verdad: además de vaciar la URL,
// levanta `mapa_null`, que es lo que hace que el compilador emita `mapa:null`
// EXPLÍCITO y MEDIA-GUARD deje pasar el publish. Antes vaciaba y nada más, y el
// publish se rehusaba sin salida: el botón decía «quitar» y no podía quitar.
let _esfMapaApagado = false;
function _esfMapaClear() {
  _esfMapaShow('');
  _esfMapaApagado = true;
  const f = document.getElementById('esf-mapa-file');
  if (f) f.value = '';
  const st = document.getElementById('esf-mapa-status');
  if (st) st.textContent = 'Sin mapa. Al guardar queda dicho que este evento NO lleva — así el sitio lo puede quitar.';
}
function _esfGetMapa() { return _esfMapaUrl || ''; }
function _esfFotoShow(url) {
  _esfFotoUrl = url || '';
  const prev = document.getElementById('esf-foto-preview');
  const img  = document.getElementById('esf-foto-img');
  const clr  = document.getElementById('esf-foto-clear');
  if (_esfFotoUrl) { if (img) img.src = _esfFotoUrl; if (prev) prev.style.display = ''; if (clr) clr.style.display = ''; }
  else { if (img) img.src = ''; if (prev) prev.style.display = 'none'; if (clr) clr.style.display = 'none'; }
  // [E2] Subir o QUITAR la portada repinta la vista previa al instante: sin
  // esto había que tocar otro campo para que se enterara.
  try { if (typeof renderEsferaPreview === 'function') renderEsferaPreview(); } catch (e) {}
}
function _esfFotoClear() {
  _esfFotoShow('');
  const f = document.getElementById('esf-foto-file'); if (f) f.value = '';
  const st = document.getElementById('esf-foto-status'); if (st) st.textContent = '';
}
// Modo editar: re-poblar preview desde la URL guardada en `foto` (o limpiar).
function _esfFotoPopulate(url) {
  _esfFotoShow((typeof url === 'string' && url.trim()) ? url.trim() : '');
}
function _esfGetFoto() { return _esfFotoUrl || ''; }
async function _esfFotoPick(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const slug = (document.getElementById('esf-slug')?.value || '').trim().toLowerCase();
  if (!slug) { alert('Primero pon el slug del evento (nombra el archivo).'); event.target.value = ''; return; }
  const st = document.getElementById('esf-foto-status'); if (st) st.textContent = 'Subiendo…';
  try {
    const dataUrl = await _esfMapaResize(file);
    const r = await khAdminFetch('/.netlify/functions/esferas-subir-imagen', {
      method: 'POST', body: JSON.stringify({ slug, dataUrl, tipo: 'portada' }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok || !data.url) throw new Error(data.error || 'No se pudo subir la foto');
    _esfFotoShow(data.url);
    const img = document.getElementById('esf-foto-img');
    if (img) img.src = data.url + '?t=' + (img._t = (img._t || 0) + 1); // cache-bust (upsert mismo path)
    if (st) st.textContent = 'Subida ✓';
  } catch (e) {
    if (st) st.textContent = 'Error: ' + e.message;
  } finally {
    event.target.value = '';
  }
}
// kind ∈ {'portada','lineup'}. Muestra/oculta preview + guarda la URL en su var.
function _esfFestImgShow(kind, url) {
  const u = url || '';
  if (kind === 'portada') _esfPortadaUrl = u; else _esfLineupUrl = u;
  const prev = document.getElementById('esf-fest-' + kind + '-preview');
  const img  = document.getElementById('esf-fest-' + kind + '-img');
  const clr  = document.getElementById('esf-fest-' + kind + '-clear');
  if (u) { if (img) img.src = u; if (prev) prev.style.display = ''; if (clr) clr.style.display = ''; }
  else   { if (img) img.src = ''; if (prev) prev.style.display = 'none'; if (clr) clr.style.display = 'none'; }
}
function _esfFestPortadaPick(event) { return _esfFestImgPick('portada', event); }
function _esfFestPortadaClear() { _esfFestImgClear('portada'); }
function _esfFestLineupPick(event) { return _esfFestImgPick('lineup', event); }
function _esfFestLineupClear() { _esfFestImgClear('lineup'); }
// Modo editar: re-poblar preview desde el `mapa` guardado (URL) o limpiar.
function _esfMapaPopulate(url, apagado) {
  _esfMapaApagado = !!apagado;   // [ESF-MAPA-2] el apagado nace del dato, no del clic anterior
  _esfMapaShow((typeof url === 'string' && url.trim()) ? url.trim() : '');
}
// Redimensiona el archivo a máx 1400px de ancho y devuelve un dataUrl webp ~0.85.
function _esfMapaResize(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1400;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/webp', 0.85));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function _esfMapaPick(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const slug = (document.getElementById('esf-slug')?.value || '').trim().toLowerCase();
  if (!slug) {
    alert('Primero pon el slug del evento (nombra el archivo del mapa).');
    event.target.value = '';
    return;
  }
  const st = document.getElementById('esf-mapa-status');
  if (st) st.textContent = 'Subiendo…';
  try {
    const dataUrl = await _esfMapaResize(file);
    const r = await khAdminFetch('/.netlify/functions/esferas-subir-mapa', {
      method: 'POST', body: JSON.stringify({ slug, dataUrl }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok || !data.url) throw new Error(data.error || 'No se pudo subir el mapa');
    // Cache-bust en el preview: el bucket hace upsert sobre el mismo path.
    _esfMapaShow(data.url);
    _esfMapaApagado = false;   // [ESF-MAPA-2] subir un mapa deshace el apagado
    const img = document.getElementById('esf-mapa-img');
    if (img) img.src = data.url + '?t=' + (img._t = (img._t || 0) + 1);
    if (st) st.textContent = 'Mapa subido ✓';
  } catch (e) {
    if (st) st.textContent = 'Error: ' + e.message;
  } finally {
    event.target.value = '';
  }
}
// minP del preview = espeja la card real del index: menor precio PLUS (p>0,
// no agotada). 0 si no hay zonas vendibles.
function _esfPreviewMinP() {
  // [E1] !z.prox espeja a minP() de index.html: una zona sin costo todavía no
  // puede ser el "desde $X" de la tarjeta.
  // [ESF-UX-2a] En multifecha el index concatena el global con las zonas de
  // TODAS las fechas (`minP` de index.html). El preview miraba solo el mago y
  // por eso podía anunciar otro "desde $X" que la tarjeta.
  const _mf = _esfGetMultifecha();
  const _base = _mf ? _esfDerivarZonasGlobales(_mf, 'zonas') : _esfGetZonas();
  const _todas = _mf ? _mf.reduce((a, f) => a.concat(f.zonas || []), _base.slice()) : _base;
  const avail = _todas.filter((z) => !z.ag && !z.prox && z.p > 0);
  if (!avail.length) return 0;
  return Math.min.apply(null, avail.map((z) => z.p));
}
function _esfFmtMoney(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-MX');
}
function submitEsferaForm() {
  if (window._esfEditSlug) guardarCambiosEsfera();
  else crearEsferaEvento();
}
function editarEsfera(slug) {
  const row = (window._esfRows || []).find(r => r && r.slug === slug);
  if (!row) return;
  window._esfEditSlug = slug;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const sEl = document.getElementById('esf-slug');
  if (sEl) { sEl.value = row.slug || ''; sEl.readOnly = true; sEl.style.opacity = '0.6'; }
  set('esf-nombre', row.nombre || '');
  set('esf-titulo', row.titulo || '');
  set('esf-fecha', (row.fecha_inicio || '').slice(0, 10));
  // Fechas adicionales: re-crear inputs desde fechas_extra (texto JSON o array).
  _esfClearFechasExtra();
  let _fe = row.fechas_extra;
  if (typeof _fe === 'string') { try { _fe = JSON.parse(_fe); } catch { _fe = []; } }
  if (Array.isArray(_fe)) _fe.forEach((d) => { if (typeof d === 'string') _esfAddFechaExtra(d); });
  // Zonas: re-crear filas desde `zonas` (texto JSON o array).
  _esfClearZonas();
  let _zs = row.zonas;
  if (typeof _zs === 'string') { try { _zs = JSON.parse(_zs); } catch { _zs = []; } }
  if (Array.isArray(_zs)) _zs.forEach((z) => { if (z && typeof z === 'object') _esfAddZona(z); });
  // [ESF-E1c] La lista CHEAP se llena de su PROPIA columna. Si la fila no la
  // tiene, la lista queda vacía y el compilador sigue derivando — la rampa.
  if (typeof _esfClearCheapZonas === 'function') _esfClearCheapZonas();
  let _cz = row.cheap_zonas;
  if (typeof _cz === 'string') { try { _cz = JSON.parse(_cz); } catch (_) { _cz = null; } }
  if (Array.isArray(_cz)) _cz.forEach((z) => { if (z && typeof z === 'object') _esfAddCheapZona(z); });
  set('esf-banco', row.banco || '');
  { const p = document.getElementById('esf-promo'); if (p) p.checked = !!row.promo; }
  set('esf-static-img', row.static_img || '');
  set('esf-img-texto', row.img_texto || '');
  { const io_ = document.getElementById('esf-img-omitir'); if (io_) io_.checked = !!row.img_omitir; }
  set('esf-fecha-fin', (row.fecha_fin || '').slice(0, 10));
  set('esf-f-texto', row.f_texto || '');
  _esfCorridoPreview();
  { const l = document.getElementById('esf-lineup'); if (l) l.value = row.lineup || ''; _esfLineupShow(row.lineup || ''); }
  _esfFlashPopulate(row.flash_promo);
  { _esfExtrasCerrar(); _esfExtrasContar(); }   // [ESF-UX-1b] cerrado, pero anunciando
  { _esfTabsVigilar(); _esfTab('datos'); _esfSyncGuardar(); }   // [ESF-UX-1c] editar SIEMPRE abre en Datos
  set('esf-promo-code', row.promo_code || '');
  set('esf-promo-label', row.promo_label || '');
  { const d = document.getElementById('esf-deporte'); if (d) d.checked = !!row.deporte; }
  set('esf-music-search', row.music_search || '');
  // [ESF-E3a] Las fechas del nivel 4. Poblarlas es OBLIGATORIO, no cosmético:
  // sin esto, abrir un evento multifecha y guardarlo mandaría `multifecha:null`
  // y le borraría las noches con sus zonas.
  _esfMfPopulate(row.multifecha);
  // Hotel custom: re-poblar desde `hotel` (texto JSON u objeto); custom:false → off.
  _esfHotelPopulate(row.hotel);
  // Mapa: re-poblar preview desde la URL guardada (o limpiar si no hay).
  _esfMapaPopulate(row.mapa, row.mapa_null);
  // Foto de portada (concierto): re-poblar preview desde `foto` (o limpiar).
  _esfFotoPopulate(row.foto);
  // Qué incluye + separo + nota: re-poblar desde la fila.
  _esfIncSepNotaPopulate(row);
  _esfCiudadSet(row.ciudad || 'MTY');
  set('esf-tipo', row.tipo || 'concierto');
  // Modo festival: encender el interruptor si el evento tiene `festival` no-null,
  // y poblar los switches desde el objeto guardado (parseado).
  const festOn = row.festival != null && row.festival !== '';
  const fchk = document.getElementById('esf-es-festival'); if (fchk) fchk.checked = festOn;
  _esfToggleFestival();
  let _fest = row.festival;
  if (typeof _fest === 'string') { try { _fest = JSON.parse(_fest); } catch { _fest = null; } }
  _esfFestivalPopulate(_fest);
  set('esf-status', row.status || '');
  set('esf-venue', row.venue || '');
  set('esf-music', row.music || '');
  const chosenEl = document.getElementById('esf-music-chosen'); if (chosenEl) chosenEl.textContent = '';
  const resEl = document.getElementById('esf-music-results'); if (resEl) resEl.innerHTML = '';
  const tit = document.getElementById('esf-form-titulo'); if (tit) tit.textContent = '// EDITAR EVENTO: ' + slug;
  const btn = document.getElementById('esf-submit-btn'); if (btn) btn.textContent = 'Guardar cambios';
  const cancel = document.getElementById('esf-cancel-edit'); if (cancel) cancel.style.display = '';
  const al = document.getElementById('esf-alert'); if (al) al.innerHTML = '';
  renderEsferaPreview();
  _esfPanelAbrir();   // [ESF-UX-1e] antes bajaba 3,165px hasta el formulario
}
function cancelarEdicionEsfera() {
  window._esfEditSlug = null;
  const sEl = document.getElementById('esf-slug');
  if (sEl) { sEl.readOnly = false; sEl.style.opacity = ''; sEl.value = ''; }
  ['esf-nombre','esf-titulo','esf-fecha','esf-venue','esf-music'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  _esfClearFechasExtra();
  _esfClearZonas();
  _esfClearMultifecha();
  { const b = document.getElementById('esf-banco'); if (b) b.value = ''; }
    { const p = document.getElementById('esf-promo'); if (p) p.checked = false;
      const d = document.getElementById('esf-deporte'); if (d) d.checked = false;
      const m = document.getElementById('esf-music-search'); if (m) m.value = '';
      const pc = document.getElementById('esf-promo-code'); if (pc) pc.value = '';
      const pl = document.getElementById('esf-promo-label'); if (pl) pl.value = ''; 
      _esfFlashClear(); _esfLineupClear();
      const ff = document.getElementById('esf-fecha-fin'); if (ff) ff.value = '';
      const ft = document.getElementById('esf-f-texto'); if (ft) ft.value = '';
      const si = document.getElementById('esf-static-img'); if (si) si.value = '';
      const it = document.getElementById('esf-img-texto'); if (it) it.value = '';
      const io_ = document.getElementById('esf-img-omitir'); if (io_) io_.checked = false;
      _esfCorridoPreview(); _esfExtrasCerrar(); _esfExtrasContar();
      _esfTabsVigilar(); _esfTab('datos'); _esfSyncGuardar(); }
  _esfClearHotel();
  _esfMapaClear();
  _esfFotoClear();
  _esfCiudadSet('MTY');
  _esfSeedDefaults();
  const tipo = document.getElementById('esf-tipo'); if (tipo) tipo.value = 'concierto';
  const _fchk2 = document.getElementById('esf-es-festival'); if (_fchk2) _fchk2.checked = false;
  _esfToggleFestival();
  _esfFestivalPopulate({});   // festival off + switches a default
  const status = document.getElementById('esf-status'); if (status) status.value = '';
  const chosenEl = document.getElementById('esf-music-chosen'); if (chosenEl) chosenEl.textContent = '';
  const resEl = document.getElementById('esf-music-results'); if (resEl) resEl.innerHTML = '';
  const tit = document.getElementById('esf-form-titulo'); if (tit) tit.textContent = '// NUEVO EVENTO';
  const btn = document.getElementById('esf-submit-btn'); if (btn) btn.textContent = 'Crear evento';
  const cancel = document.getElementById('esf-cancel-edit'); if (cancel) cancel.style.display = 'none';
  const al = document.getElementById('esf-alert'); if (al) al.innerHTML = '';
  renderEsferaPreview();
}
async function guardarCambiosEsfera() {
  const _esfZG = _esfZonasParaGuardar();
  const slug = window._esfEditSlug;
  if (!slug) return;
  const body = {
    slug,
    nombre:       document.getElementById('esf-nombre')?.value.trim() || '',
    titulo:       document.getElementById('esf-titulo')?.value.trim() || null,
    fecha_inicio: document.getElementById('esf-fecha')?.value || null,
    ciudad:       _esfCiudadValue() || null,
    tipo:         document.getElementById('esf-tipo')?.value || null,
    status:       document.getElementById('esf-status')?.value || '',
    venue:        document.getElementById('esf-venue')?.value.trim() || null,
    music:        document.getElementById('esf-music')?.value.trim() || null,
    fechas_extra: _esfGetFechasExtra(),
    zonas: _esfZG.zonas,
    // [ESF-E1c] `null` = sin lista capturada (el compilador usa su rampa).
    // Una lista, aunque sea vacía, es una afirmación sobre el evento.
    cheap_zonas: (() => { const c = _esfZG.cheapZonas; return c == null ? null : JSON.stringify(c); })(),
    // [ESF-E3a] NIVEL 4. `null` = el evento no es multifecha.
    multifecha: (() => { const m = _esfGetMultifecha(); return m == null ? null : JSON.stringify(m); })(),
    // [ESF-E1g] `null` = el evento no dice banco (y el sitio cae a BBVA solo).
    banco: document.getElementById('esf-banco')?.value || null,
    // [ESF-CAMPOS-1] Los tres apuntes.
    promo: !!document.getElementById('esf-promo')?.checked,
    static_img: document.getElementById('esf-static-img')?.value.trim() || null,
    img_texto: document.getElementById('esf-img-texto')?.value.trim() || null,
    img_omitir: !!document.getElementById('esf-img-omitir')?.checked,
    fecha_fin: document.getElementById('esf-fecha-fin')?.value || null,
    f_texto: document.getElementById('esf-f-texto')?.value.trim() || null,
    lineup: document.getElementById('esf-lineup')?.value.trim() || null,
    flash_promo: _esfGetFlash(),
    promo_code: document.getElementById('esf-promo-code')?.value.trim() || null,
    promo_label: document.getElementById('esf-promo-label')?.value.trim() || null,
    deporte: !!document.getElementById('esf-deporte')?.checked,
    music_search: document.getElementById('esf-music-search')?.value.trim() || null,
    hotel: _esfGetHotel(),
    mapa: _esfGetMapa(),
    mapa_null: _esfMapaApagado,
    foto: _esfGetFoto(),
    inc: _esfGetInc(),
    sep: _esfGetSep(),
    sep_cheap: _esfGetSepCheap(),
    ride: _esfGetRide(),
    sep_ride: _esfGetSepRide(),
    ...(_esfGetPaquetes()),
    nota: _esfGetNota(),
    festival: _esfGetFestival(),
  };
  const alertEl = document.getElementById('esf-alert');
  try {
    const r = await khAdminFetch('/.netlify/functions/esferas-actualizar', { method:'POST', body: JSON.stringify(body) });
    if (!r.ok) {
      const detail = await r.json().catch(()=>({ error: r.statusText }));
      throw new Error(detail.error || 'Error guardando');
    }
    cancelarEdicionEsfera();
    _esfPanelCerrar();
    _esfAviso('✓ Cambios guardados');   // [ESF-UX-1e] fuera del panel: se cerró
    loadEsferasEventos();
  } catch(e) { if (alertEl) alertEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}
function _esfPreviewFDisplay(fi) {
  if (!fi) return 'Por confirmar';
  const m = String(fi).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 'Por confirmar';
  const mes = ESF_PREVIEW_MESES[parseInt(m[2], 10) - 1];
  if (!mes) return 'Por confirmar';
  return parseInt(m[3], 10) + ' ' + mes + ' ' + m[1];
}
// Display combinado para 2+ fechas (ordenadas, 'YYYY-MM-DD'). Espejo de
// fDisplayMulti en _lib/esferas-compile.js: mismo mes → "7, 9 y 10 may 2026";
// cruzan meses → "30 nov y 2 dic 2026"; cruzan años → año en cada una.
function _esfPreviewFDisplayMulti(fechas) {
  const parts = fechas.map((s) => ({
    y: s.slice(0, 4), mo: parseInt(s.slice(5, 7), 10), d: parseInt(s.slice(8, 10), 10),
  }));
  const joinHuman = (items) => (items.length <= 1
    ? (items[0] || '')
    : items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1]);
  const sameYear = parts.every((p) => p.y === parts[0].y);
  const sameMonth = sameYear && parts.every((p) => p.mo === parts[0].mo);
  if (sameMonth) {
    const mes = ESF_PREVIEW_MESES[parts[0].mo - 1] || '';
    return joinHuman(parts.map((p) => String(p.d))) + ' ' + mes + ' ' + parts[0].y;
  }
  if (sameYear) {
    const items = parts.map((p) => String(p.d) + ' ' + (ESF_PREVIEW_MESES[p.mo - 1] || ''));
    return joinHuman(items) + ' ' + parts[0].y;
  }
  const items = parts.map((p) => String(p.d) + ' ' + (ESF_PREVIEW_MESES[p.mo - 1] || '') + ' ' + p.y);
  return joinHuman(items);
}
// Junta la fecha base + las extra → array ordenado y dedupe de 'YYYY-MM-DD'.
function _esfPreviewFechas() {
  const base = document.getElementById('esf-fecha')?.value || '';
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const seen = {};
  const out = [];
  [base].concat(_esfGetFechasExtra()).forEach((d) => {
    const s = String(d || '').slice(0, 10);
    if (re.test(s) && !seen[s]) { seen[s] = 1; out.push(s); }
  });
  out.sort();
  return out;
}
// status del form → {txt, cls (clase del tag), cardCls (overlay)}
function _esfPreviewStatus(st) {
  switch (st) {
    case 'agotado':       return { txt:'Agotado',         cls:'tag',     cardCls:'agotado' };
    case 'proceso':       return { txt:'En Proceso',      cls:'tproc',   cardCls:'proceso' };
    case 'proximamente':  return { txt:'Próximamente',    cls:'tpronto', cardCls:'proxi' };
    case 'por-confirmar': return { txt:'Por confirmar',   cls:'tpc',     cardCls:'' };
    case 'ultimos':       return { txt:'Últimos lugares', cls:'tu',      cardCls:'' };
    default:              return { txt:'Disponible',       cls:'td',      cardCls:'' };
  }
}
// Zona inferior (.ev-bottom) tal como la arma el index según status. Con zonas
// con precio (desde>0) muestra "Desde $X" como la card real; sin zonas cae a
// "Informes / Cotiza por WA". SOLO VISUAL en el preview (sin onclick).
function _esfPreviewBottom(status, desde) {
  if (status === 'proximamente') {
    return '<div class="ev-bottom"><div class="ev-prox-badge">AVÍSAME<span class="ev-prox-sub">Lista de espera</span></div></div>';
  }
  if (status === 'agotado' || status === 'proceso') {
    return ''; // el overlay cubre la card; el bottom real queda vacío
  }
  if (desde > 0) {
    return '<div class="ev-bottom"><div><div class="ev-price-lbl">Desde</div><div class="ev-price">' + _esfFmtMoney(desde) + '</div></div><span class="ev-cta ev-cta-wa">WhatsApp</span></div>';
  }
  const cta = (status === 'por-confirmar') ? '' : '<span class="ev-cta ev-cta-wa">WhatsApp</span>';
  return '<div class="ev-bottom"><div><div class="ev-price-lbl">Informes</div><div class="ev-price-wa">Cotiza por WA</div></div>' + cta + '</div>';
}
// [E2] El pie decía SIEMPRE "Foto vía Deezer", aunque hubiera portada manual.
// Ahora dice cuál se está viendo. Solo texto: no toca la tubería.
function _esfPreviewPie(hayManual, hayDeezer) {
  const el = document.getElementById('esf-preview-pie');
  if (!el) return;
  el.textContent = hayManual
    ? 'Portada manual (la que subiste). Solo vista previa — no crea ni publica.'
    : (hayDeezer
        ? 'Foto vía Deezer (búsqueda por nombre). Solo vista previa — no crea ni publica.'
        : 'Sin portada todavía. Solo vista previa — no crea ni publica.');
}
function renderEsferaPreview() {
  const cont = document.getElementById('esf-preview-card');
  if (!cont) return;
  const nombre = (document.getElementById('esf-nombre')?.value || '').trim();
  const titulo = (document.getElementById('esf-titulo')?.value || '').trim();
  const fecha  = document.getElementById('esf-fecha')?.value || '';
  const fechas = _esfPreviewFechas();
  const fDisp  = (fechas.length >= 2) ? _esfPreviewFDisplayMulti(fechas) : _esfPreviewFDisplay(fechas[0] || fecha);
  const status = document.getElementById('esf-status')?.value || '';
  const venue  = (document.getElementById('esf-venue')?.value || '').trim();
  const st = _esfPreviewStatus(status);
  const initials = (nombre || '··').substring(0, 2).toUpperCase();
  // [E2] La vista previa arma su imagen con la MISMA prioridad que el sitio:
  // la portada manual (columna `foto` → staticImg del compilador, TUERCA A)
  // GANA sobre Deezer, que queda de respaldo. Antes el preview solo miraba el
  // caché de Deezer, así que subías portada, decía "Subida ✓" y la tarjeta
  // seguía enseñando la foto del artista.
  const manual = (typeof _esfGetFoto === 'function') ? _esfGetFoto() : '';
  const cached = _esfPreviewImgCache[nombre];
  const src = manual || cached;      // manual primero, Deezer de respaldo
  const imgHTML = src
    ? `<div class="ev-img-wrap"><img class="ev-img" src="${_esfEsc(src)}" alt=""></div>`
    : `<div class="ev-img-placeholder"><span class="ev-img-initials">${_esfEsc(initials)}</span></div>`;
  _esfPreviewPie(!!manual, !!cached);
  cont.innerHTML =
    `<div class="ev-card ${st.cardCls}">` +
      imgHTML +
      `<span class="ev-tag ${st.cls}">${_esfEsc(st.txt)}</span>` +
      `<div class="ev-body"><div class="ev-top">` +
        `<div class="ev-fecha">${_esfEsc(fDisp)}</div>` +
        `<div class="ev-artist">${_esfEsc(titulo || nombre || 'Nombre del evento')}</div>` +
        `<div class="ev-venue">${_esfEsc(venue)}</div>` +
      `</div>` + _esfPreviewBottom(status, _esfPreviewMinP()) + `</div>` +
    `</div>`;
  // Foto: debounce 500ms; solo si el nombre aún no se consultó.
  if (nombre && cached === undefined) {
    clearTimeout(_esfPreviewImgTimer);
    _esfPreviewImgTimer = setTimeout(() => _esfPreviewLoadFoto(nombre), 500);
  }
}
function _esfPreviewLoadFoto(nombre) {
  fetch('/.netlify/functions/deezer?q=' + encodeURIComponent(nombre))
    .then(r => r.json())
    .then(d => {
      let src = null;
      if (d && d.data && d.data[0] && d.data[0].picture_xl &&
          d.data[0].picture_xl.indexOf('d41d8cd98f00b204e9800998ecf8427e') === -1) {
        src = d.data[0].picture_xl;
      }
      _esfPreviewImgCache[nombre] = src;
      const actual = (document.getElementById('esf-nombre')?.value || '').trim();
      if (actual === nombre) renderEsferaPreview();
    })
    .catch(() => { _esfPreviewImgCache[nombre] = null; });
}
function _esfPreviewInit() {
  if (!window._esfPreviewBound) {
    window._esfPreviewBound = true;
    ['esf-nombre','esf-titulo','esf-fecha','esf-status','esf-venue'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.addEventListener('input', renderEsferaPreview); el.addEventListener('change', renderEsferaPreview); }
    });
  }
  // Estado inicial = nuevo evento: sembrar inc default + separo 500 (sin pisar edición).
  if (!window._esfEditSlug && !document.querySelector('#esf-inc .esf-inc-row')) _esfSeedDefaults();
  renderEsferaPreview();
}
function _esfMusicStopAudio() {
  if (_esfMusicAudio) { try { _esfMusicAudio.pause(); } catch(_){} _esfMusicAudio = null; }
}
// Buscador Deezer reusable: fetch + render de filas en `cont`; "Elegir" llama
// onPick(id, label). Lo usan conciertos (buscarMusicaEsfera) y la lista rotativa
// del festival (_esfFestMusicBuscar) sin cambiar el comportamiento de conciertos.
async function _esfMusicBuscar(query, cont, onPick) {
  if (!cont) return;
  cont.innerHTML = '<div class="loading-state"><div class="spinner"></div>Buscando…</div>';
  try {
    const r = await fetch('/.netlify/functions/deezer?type=tracklist&q=' + encodeURIComponent(query));
    const d = await r.json().catch(() => ({}));
    const items = (d && d.results) || [];
    cont.innerHTML = '';
    if (!items.length) { cont.innerHTML = '<div style="font-size:11px;color:var(--ts)">Sin resultados.</div>'; return; }
    items.forEach(t => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px;border:1px solid var(--border);border-radius:var(--r-sm,8px);margin-bottom:6px';
      const cover = document.createElement(t.cover ? 'img' : 'div');
      cover.style.cssText = 'width:36px;height:36px;border-radius:4px;flex-shrink:0;background:var(--bg);object-fit:cover';
      if (t.cover) cover.src = t.cover;
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0';
      const ti = document.createElement('div');
      ti.style.cssText = 'font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      ti.textContent = t.title || '';
      const su = document.createElement('div');
      su.style.cssText = 'font-size:10px;color:var(--ts);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      su.textContent = (t.artist || '') + (t.album ? ' · ' + t.album : '');
      info.appendChild(ti); info.appendChild(su);
      row.appendChild(cover); row.appendChild(info);
      if (t.preview) {
        const play = document.createElement('button');
        play.type = 'button'; play.className = 'btn btn-ghost btn-sm'; play.style.fontSize = '11px'; play.textContent = '▶';
        play.addEventListener('click', () => _esfMusicPlay(t.preview, play));
        row.appendChild(play);
      }
      const pick = document.createElement('button');
      pick.type = 'button'; pick.className = 'btn btn-primary btn-sm'; pick.style.fontSize = '10px'; pick.textContent = 'Elegir';
      pick.addEventListener('click', () => onPick(String(t.id), (t.title || '') + ' — ' + (t.artist || '')));
      row.appendChild(pick);
      cont.appendChild(row);
    });
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-error">${_esfEsc(e.message)}</div>`;
  }
}
// Conciertos: busca por el Nombre/Artista y pone UN track id en #esf-music.
function buscarMusicaEsfera() {
  const nombre = (document.getElementById('esf-nombre')?.value || '').trim();
  const cont = document.getElementById('esf-music-results');
  if (!cont) return;
  if (!nombre) { cont.innerHTML = '<div style="font-size:11px;color:var(--orange)">Escribe primero el Nombre / Artista.</div>'; return; }
  _esfMusicBuscar(nombre, cont, _esfMusicElegir);
}
// Festival: mini-buscador que ARMA la lista rotativa (festival.musica).
function _esfFestMusicBuscar() {
  const q = (document.getElementById('esf-fest-music-q')?.value || '').trim();
  const cont = document.getElementById('esf-fest-music-results');
  if (!cont) return;
  if (!q) { cont.innerHTML = '<div style="font-size:11px;color:var(--orange)">Escribe un artista.</div>'; return; }
  _esfMusicBuscar(q, cont, _esfMusicaAdd);
}
function _esfMusicaRemove(id) {
  _esfMusicaLista = _esfMusicaLista.filter(m => m.id !== id);
  _esfMusicaRender();
}
function _esfMusicaRender() {
  const el = document.getElementById('esf-fest-music-list');
  if (!el) return;
  if (!_esfMusicaLista.length) { el.innerHTML = '<div style="font-size:11px;color:var(--ts)">Sin canciones aún.</div>'; return; }
  el.innerHTML = _esfMusicaLista.map(m => `
    <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-card,16px);margin:0 6px 6px 0;font-size:12px">
      <span>${_esfEsc(m.label)}</span>
      <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;padding:0 5px" onclick="_esfMusicaRemove('${_esfEsc(m.id)}')">✕</button>
    </div>`).join('');
}
function _esfPaqAdd() {
  _esfPaquetes.push({ lbl: '', ds: '', noches: 1, ride: 0, zonas: [], cheapZonas: [], hotel: [] });
  _esfPaqRender();
}
function _esfPaqRemove(idx) {
  _esfPaquetes.splice(idx, 1);
  _esfPaqRender();
}
function _esfPaqRender() {
  const el = document.getElementById('esf-fest-paq-list');
  if (!el) return;
  if (!_esfPaquetes.length) { el.innerHTML = '<div style="font-size:11px;color:var(--ts)">Sin paquetes aún.</div>'; return; }
  const cheapOn = !!document.getElementById('esf-fest-cheap')?.checked;  // el precio cheap (pc) solo si el switch cheap está encendido
  const stayOn = !!document.getElementById('esf-fest-stay')?.checked;    // hoteles solo si el switch stay está encendido
  if (stayOn) _esfPaquetes.forEach((_, i) => _esfPaqHotelEnsure(i));     // asegura los 4 tipos fijos por paquete
  el.innerHTML = _esfPaquetes.map((p, i) => `
    <div style="border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:10px;margin-bottom:8px;background:var(--bg2)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
        <span style="font-size:11px;color:var(--ts)">Paquete ${i + 1}</span>
        <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px" onclick="_esfPaqRemove(${i})">Quitar</button>
      </div>
      <label style="font-size:11px">Etiqueta</label>
      <input class="cot-input" style="width:100%;margin-bottom:6px" placeholder="Vie 20 nov · 1 día" value="${_esfEsc(p.lbl)}" oninput="_esfPaquetes[${i}].lbl = this.value">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">
          <label style="font-size:11px">Fecha</label>
          <input class="cot-input" type="date" style="width:100%" value="${_esfEsc(p.ds)}" oninput="_esfPaquetes[${i}].ds = this.value">
        </div>
        <div style="flex:1;min-width:90px">
          <label style="font-size:11px">Noches</label>
          <input class="cot-input" type="number" min="0" style="width:100%" value="${Number(p.noches) || 0}" oninput="_esfPaquetes[${i}].noches = Number(this.value)">
        </div>
        <div style="flex:1;min-width:90px">
          <label style="font-size:11px">Ride / transporte</label>
          <input class="cot-input" type="number" min="0" style="width:100%" value="${Number(p.ride) || 0}" oninput="_esfPaquetes[${i}].ride = Number(this.value)">
        </div>
      </div>
      <div style="margin-top:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
          <span style="font-size:11px;color:var(--ts)">Zonas</span>
          <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px" onclick="_esfPaqZonaAdd(${i})">+ Agregar zona</button>
        </div>
        ${(Array.isArray(p.zonas) && p.zonas.length) ? p.zonas.map((z, zi) => `
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap">
            <input class="cot-input" style="flex:2;min-width:100px" placeholder="Zona" value="${_esfEsc(z.n)}" oninput="_esfPaquetes[${i}].zonas[${zi}].n = this.value">
            <input class="cot-input" type="number" min="0" style="flex:1;min-width:70px" placeholder="$" value="${Number(z.p) || 0}" oninput="_esfPaquetes[${i}].zonas[${zi}].p = Number(this.value)">
            ${cheapOn ? `<input class="cot-input" type="number" min="0" style="flex:1;min-width:70px" placeholder="$ cheap" value="${Number(z.pc) || 0}" oninput="_esfPaquetes[${i}].zonas[${zi}].pc = Number(this.value)">` : ''}
            <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px" onclick="_esfPaqZonaRemove(${i}, ${zi})">✕</button>
          </div>`).join('') : '<div style="font-size:11px;color:var(--ts)">Sin zonas.</div>'}
      </div>
      ${stayOn ? `
      <div style="margin-top:8px">
        <div style="font-size:11px;color:var(--ts);margin-bottom:4px">Hoteles</div>
        <label style="font-size:11px">Costo total de la habitación</label>
        <input class="cot-input" type="number" min="0" style="width:100%;margin-bottom:6px" value="${Number(p.hotelTotal) || 0}" oninput="_esfPaqHotelTotal(${i}, this.value)">
        ${(Array.isArray(p.hotel) ? p.hotel : []).map((h, hi) => {
          const t = _ESF_HOTEL_TIPOS.find(x => x.n === h.n);
          const pers = t ? t.pers : 4;
          return `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap">
            <span style="flex:1;min-width:110px;font-size:12px">${_esfEsc(h.n)} (${pers}p)</span>
            <input class="cot-input" type="number" min="0" style="flex:1;min-width:80px" placeholder="$ extra" value="${Number(h.e) || 0}" oninput="_esfPaquetes[${i}].hotel[${hi}].e = Number(this.value)">
          </div>`;
        }).join('')}
        <div style="font-size:11px;color:var(--ts);margin-top:2px">Compartida = base; el sistema calcula los extras; puedes ajustarlos a mano.</div>
      </div>` : ''}
    </div>`).join('');
}
// Asegura los 4 tipos fijos de hotel en el paquete, preservando extras ya puestos
// (match por n). Reusa _ESF_HOTEL_TIPOS de conciertos (n/pers/viaj).
function _esfPaqHotelEnsure(pi) {
  if (!_esfPaquetes[pi]) return;
  const prev = Array.isArray(_esfPaquetes[pi].hotel) ? _esfPaquetes[pi].hotel : [];
  _esfPaquetes[pi].hotel = _ESF_HOTEL_TIPOS.map((t) => {
    const found = prev.find((h) => h && h.n === t.n);
    return { n: t.n, e: found ? (Number(found.e) || 0) : 0, viaj: t.viaj.slice() };
  });
}
// Recalcula los extras de los 4 tipos desde el costo total (misma fórmula que
// conciertos: _esfHotelExtra). El admin puede ajustarlos a mano después.
function _esfPaqHotelTotal(pi, val) {
  if (!_esfPaquetes[pi]) return;
  _esfPaquetes[pi].hotelTotal = Number(val) || 0;
  _esfPaqHotelEnsure(pi);
  _esfPaquetes[pi].hotel.forEach((h) => {
    const t = _ESF_HOTEL_TIPOS.find((x) => x.n === h.n);
    h.e = _esfHotelExtra(_esfPaquetes[pi].hotelTotal, t ? t.pers : 4);
  });
  _esfPaqRender();
}
function _esfPaqZonaAdd(pi) {
  if (!_esfPaquetes[pi]) return;
  if (!Array.isArray(_esfPaquetes[pi].zonas)) _esfPaquetes[pi].zonas = [];
  _esfPaquetes[pi].zonas.push({ n: '', p: 0, pc: 0 });
  _esfPaqRender();
}
function _esfPaqZonaRemove(pi, zi) {
  if (_esfPaquetes[pi] && Array.isArray(_esfPaquetes[pi].zonas)) _esfPaquetes[pi].zonas.splice(zi, 1);
  _esfPaqRender();
}
function _esfMusicPlay(url, btn) {
  if (_esfMusicAudio && _esfMusicAudio._url === url && !_esfMusicAudio.paused) {
    _esfMusicStopAudio(); if (btn) btn.textContent = '▶'; return;
  }
  _esfMusicStopAudio();
  document.querySelectorAll('#esf-music-results button').forEach(b => { if (b.textContent === '⏸') b.textContent = '▶'; });
  const a = new Audio(url); a._url = url; _esfMusicAudio = a;
  a.play().catch(() => {});
  if (btn) btn.textContent = '⏸';
  a.onended = () => { if (btn) btn.textContent = '▶'; _esfMusicAudio = null; };
}
// Pieza 2a · dry-run del compilador. Solo lectura/preview: la function NO escribe
// al repo (sin PUT). Renderiza cuántos se insertarían, la validación
// kamehouse/portal, los objetos generados y el preview del var EV resultante.
async function probarCompiladoDryRun() {
  const panel = document.getElementById('esf-dryrun-panel');
  if (!panel) return;
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div>Compilando (dry-run)…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/esferas-compilar-dryrun', { method:'POST' });
    const data = await r.json().catch(()=>({}));
    if (!r.ok || !data.ok) throw new Error(data.error || ('Error ' + r.status));
    window._esfUltimoDryRun = data;
    const v = data.validacion || {};
    const aIns = data.a_insertar || [];
    const aAct = data.a_actualizar || [];
    const badge = (ok) => ok
      ? '<span class="badge badge-green">OK</span>'
      : '<span class="badge badge-red">FALLÓ</span>';
    const preBox = (txt) => `<pre style="background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm,8px);padding:10px;overflow:auto;font-size:11px;white-space:pre-wrap;word-break:break-all;margin:0 0 8px">${_esfEsc(txt)}</pre>`;
    let html = '';
    html += `<div style="font-size:13px;margin-bottom:6px">Insertar: <b>${aIns.length}</b> · Actualizar: <b>${aAct.length}</b>${data.sin_cambios ? ' · <b>sin cambios</b>' : ''}</div>`;
    html += `<div style="font-size:13px;margin-bottom:6px">Validación portal: ${badge(v.portal_ok)} &nbsp; kamehouse: ${badge(v.kamehouse_ok)}</div>`;
    html += `<div style="font-size:12px;color:var(--ts);margin-bottom:8px">EV antes: ${v.ev_antes} → después: ${v.ev_despues} · presentes: ${(v.nuevos_encontrados||[]).map(_esfEsc).join(', ') || '—'}</div>`;
    if (v.error) html += `<div class="alert alert-error" style="margin-bottom:8px">${_esfEsc(v.error)}</div>`;
    if (aIns.length) {
      html += `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--ts);margin:10px 0 6px">// objetos a insertar</div>`;
      html += aIns.map(it => preBox(it.obj)).join('');
    }
    if (aAct.length) {
      html += `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--ts);margin:10px 0 6px">// objetos a actualizar (reemplazo en su lugar)</div>`;
      html += aAct.map(it => preBox(it.obj)).join('');
    }
    if (data.preview) {
      html += `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--ts);margin:10px 0 6px">// preview var EV=[ resultante</div>`;
      html += preBox(data.preview);
    }
    panel.innerHTML = html;
  } catch(e) {
    panel.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}
// Pieza 2b · escritura real al index (a main, sin branch). El candado de
// validación vive en la function esferas-publicar (422 si no pasa) — aquí solo
// confirmamos y mostramos el resultado. Tras éxito recarga el listado.
async function publicarEsferas() {
  const panel = document.getElementById('esf-dryrun-panel');
  const ult = window._esfUltimoDryRun;
  const n = (ult && (Array.isArray(ult.a_insertar) || Array.isArray(ult.a_actualizar)))
    ? ((ult.a_insertar || []).length + (ult.a_actualizar || []).length)
    : null;
  const msg = (n != null)
    ? `Esto escribirá ${n} evento(s) al index.html de producción y hará un commit. ¿Continuar?`
    : 'Esto escribirá los eventos nuevos/editados al index.html de producción y hará un commit. ¿Continuar?';
  if (!window.confirm(msg)) return;
  if (panel) panel.innerHTML = '<div class="loading-state"><div class="spinner"></div>Publicando…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/esferas-publicar', { method:'POST', body: JSON.stringify({}) });
    const data = await r.json().catch(()=>({}));
    if (r.status === 422) {
      const v = data.validacion || {};
      panel.innerHTML = `<div class="alert alert-error">Validación falló — no se escribió nada.${v.error ? (' ' + _esfEsc(v.error)) : ''}</div>`;
      return;
    }
    if (!r.ok || !data.ok) throw new Error(data.error || ('Error ' + r.status));
    const pub = data.publicados || [];
    if (data.sin_cambios || !pub.length) {
      panel.innerHTML = '<div class="alert alert-success">Sin cambios — el index ya estaba al día.</div>';
    } else {
      panel.innerHTML = `<div class="alert alert-success">✓ Publicados ${pub.length}: ${pub.map(_esfEsc).join(', ')} · commit ${_esfEsc(data.commit || '')}</div>`;
    }
    // [BABA-UX-2] Los letreros que no se emitieron se dicen SIEMPRE, aunque la
    // publicación haya salido bien: uno que desaparece en silencio es un
    // descuento que el cliente deja de ver sin que nadie se entere.
    if (Array.isArray(data.avisos_letrero) && data.avisos_letrero.length) {
      panel.innerHTML += `<div class="alert alert-error" style="margin-top:8px">`
        + `<b>${data.avisos_letrero.length} letrero(s) NO se emitieron:</b>`
        + `<div style="margin-top:6px;font-size:12px;display:grid;gap:3px">`
        + data.avisos_letrero.map(a => `<div>· ${_esfEsc(a)}</div>`).join('')
        + `</div></div>`;
    }
    // ═══ [AG-STOCK-2] LO QUE EL PUBLISH HIZO CON LAS ZONAS, Y LO QUE HAY QUE
    // COMPRAR ══════════════════════════════════════════════════════════════
    // AG-STOCK-1 ya mandaba su reporte en el JSON y NADIE LO PINTABA: un
    // informe que sólo vive en la respuesta es un informe que no existe. Va
    // aquí, junto al de los letreros, con la misma forma.
    //
    // Los dos hablan de cosas distintas a propósito:
    //   · SIMETRÍA = lo que este publish CERRÓ. Es una acción, y una acción
    //     sobre el catálogo se dice.
    //   · AVISOS = lo que sigue A LA VENTA sin pedido capturado. NO es una
    //     acción: es la lista de compras del negocio que vende sobre pedido.
    if (data.simetria && data.simetria.cerradas) {
      const sm = data.simetria;
      panel.innerHTML += `<div class="alert alert-success" style="margin-top:8px">`
        + `<b>Simetría: ${sm.cerradas} zona(s) cerradas para emparejar PLUS y CHEAP</b>`
        + `<div style="margin-top:6px;font-size:12px;display:grid;gap:3px">`
        + sm.eventos.map(x => `<div>· <b>${_esfEsc(x.slug)}</b>: ${_esfEsc(x.zonas.join(', '))}</div>`).join('')
        + `</div></div>`;
    }
    if (data.simetria && Array.isArray(data.simetria.ilegibles) && data.simetria.ilegibles.length) {
      panel.innerHTML += `<div class="alert alert-error" style="margin-top:8px">`
        + `<b>${data.simetria.ilegibles.length} ficha(s) con zonas ILEGIBLES — no se sincronizaron:</b> `
        + _esfEsc(data.simetria.ilegibles.join(', ')) + `</div>`;
    }
    const av = data.avisos_stock;
    if (av && av.total) {
      panel.innerHTML += `<div class="alert alert-info" style="margin-top:8px">`
        + `<b>📣 ${av.total} zona(s) a la venta sin boletos comprados</b>`
        + `<div style="margin-top:4px;font-size:11px;opacity:.8">Aviso, no cierre: se venden sobre pedido. Compra cuando te las pidan.</div>`
        + `<div style="margin-top:6px;font-size:12px;display:grid;gap:3px">`
        + av.eventos.map(x => `<div>· <b>${_esfEsc(x.slug)}</b>: `
            + x.zonas.map(z => (z.fecha ? _esfEsc(z.fecha) + ' — ' : '') + _esfEsc(z.zona)
            + (z.motivo === 'sin pedido capturado' ? '' : ` (${_esfEsc(z.motivo)})`)).join(', ')
            + `</div>`).join('')
        + `</div></div>`;
    }
    if (av && av.error) {
      panel.innerHTML += `<div class="alert alert-error" style="margin-top:8px">`
        + `No pude leer el stock del Palacio, así que esta vez no hay aviso de compras: `
        + _esfEsc(av.error) + `</div>`;
    }
    loadEsferasEventos();
  } catch(e) {
    panel.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}
// Despublicar: quita el evento del index de producción (PUT a main) y marca
// publicado=false. El candado/salvaguarda viven en la function esferas-despublicar
// (422 si no valida, 403 si el slug no es de Esferas). Tras éxito recarga el listado.
async function despublicarEsfera(slug) {
  if (!window.confirm(`Esto quitará ${slug} del index de producción. ¿Continuar?`)) return;
  const panel = document.getElementById('esf-dryrun-panel');
  if (panel) panel.innerHTML = `<div class="loading-state"><div class="spinner"></div>Despublicando ${_esfEsc(slug)}…</div>`;
  try {
    const r = await khAdminFetch('/.netlify/functions/esferas-despublicar', { method:'POST', body: JSON.stringify({ slug }) });
    const data = await r.json().catch(()=>({}));
    if (r.status === 403) {
      panel.innerHTML = `<div class="alert alert-error">${_esfEsc(data.error || 'No gestionado por Esferas')}</div>`;
      return;
    }
    if (r.status === 422) {
      const v = data.validacion || {};
      panel.innerHTML = `<div class="alert alert-error">Validación falló — no se escribió nada.${v.error ? (' ' + _esfEsc(v.error)) : ''}</div>`;
      return;
    }
    if (!r.ok || !data.ok) throw new Error(data.error || ('Error ' + r.status));
    if (data.encontrado === false) {
      panel.innerHTML = `<div class="alert alert-success">${_esfEsc(slug)} ya no estaba en el index.</div>`;
    } else {
      panel.innerHTML = `<div class="alert alert-success">✓ Despublicado ${_esfEsc(slug)} · commit ${_esfEsc(data.commit || '')}</div>`;
    }
    loadEsferasEventos();
  } catch(e) {
    panel.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}
async function eliminarEsfera(slug) {
  if (!window.confirm(`¿Eliminar DEFINITIVAMENTE '${slug}' de la lista de Esferas? Borra el borrador del evento. (Debe estar despublicado.)`)) return;
  const panel = document.getElementById('esf-dryrun-panel');
  if (panel) panel.innerHTML = `<div class="loading-state"><div class="spinner"></div>Eliminando ${_esfEsc(slug)}…</div>`;
  try {
    const r = await khAdminFetch('/.netlify/functions/esferas-eliminar', { method:'POST', body: JSON.stringify({ slug }) });
    const data = await r.json().catch(()=>({}));
    if (r.status === 409 || r.status === 404) {
      if (panel) panel.innerHTML = `<div class="alert alert-error">${_esfEsc(data.error || ('Error ' + r.status))}</div>`;
      return;
    }
    if (!r.ok || !data.ok) throw new Error(data.error || ('Error ' + r.status));
    if (panel) panel.innerHTML = `<div class="alert alert-success"><svg class="ic"><use href="#ic-basura"/></svg> Eliminado ${_esfEsc(slug)} de la lista de Esferas.</div>`;
    loadEsferasEventos();
  } catch(e) {
    if (panel) panel.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}
/** Motivo por el que una noticia no se puede publicar, o '' si está bien. */
function n1Problema(t) {
  const s = String(t == null ? '' : t).trim();
  if (!s) return '';                                  // vacía: se ignora al publicar
  if (s.length > N1_LARGO) return `pasa de ${N1_LARGO} caracteres`;
  if (/[<>]/.test(s)) return 'no puede llevar < ni >';
  if (/&#|&[a-z]+;/i.test(s)) return 'no puede llevar entidades HTML';
  if (s.includes('\\')) return 'no puede llevar diagonal invertida';
  return '';
}
function n1Limpias() {
  return n1Noticias.map(t => String(t || '').trim()).filter(Boolean);
}
function n1Agregar() {
  if (n1Noticias.length >= N1_MAX) { n1Estado(`Máximo ${N1_MAX} noticias`, 'error'); return; }
  n1Noticias.push('');
  n1Pintar();
  const inputs = document.querySelectorAll('#n1-lista .n1-input');
  if (inputs.length) inputs[inputs.length - 1].focus();
}
function n1Borrar(i) { n1Noticias.splice(i, 1); n1Pintar(); }
function n1Mover(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= n1Noticias.length) return;
  const t = n1Noticias[i]; n1Noticias[i] = n1Noticias[j]; n1Noticias[j] = t;
  n1Pintar();
}
function n1Editar(i, valor) {
  n1Noticias[i] = valor;
  // Solo se repinta la previa y el contador: repintar la lista entera le
  // quitaría el foco al input en cada tecla.
  const fila = document.querySelectorAll('#n1-lista .n1-fila')[i];
  if (fila) {
    const problema = n1Problema(valor);
    const cuenta = fila.querySelector('.n1-cuenta');
    const input = fila.querySelector('.n1-input');
    if (cuenta) { cuenta.textContent = `${String(valor || '').trim().length}/${N1_LARGO}`; cuenta.classList.toggle('n1-mal', !!problema); }
    if (input) { input.classList.toggle('n1-mal', !!problema); input.title = problema; }
  }
  n1Previa();
}
function n1Pintar() {
  const cont = document.getElementById('n1-lista');
  const vacio = document.getElementById('n1-vacio');
  if (!cont) return;
  cont.textContent = '';
  n1Noticias.forEach((t, i) => {
    const problema = n1Problema(t);
    const fila = document.createElement('div');
    fila.className = 'n1-fila';

    const orden = document.createElement('div');
    orden.className = 'n1-orden';
    [['▲', -1, i === 0], ['▼', 1, i === n1Noticias.length - 1]].forEach(([txt, d, off]) => {
      const b = document.createElement('button');
      b.className = 'n1-mini'; b.textContent = txt; b.disabled = !!off;
      b.title = d < 0 ? 'Subir' : 'Bajar';
      b.onclick = () => n1Mover(i, d);
      orden.appendChild(b);
    });

    const input = document.createElement('input');
    input.className = 'n1-input' + (problema ? ' n1-mal' : '');
    input.value = String(t || '');
    input.placeholder = 'Ej: Preventa Bad Bunny este viernes 10am';
    input.maxLength = N1_LARGO + 20;   // deja escribir de más para que VEA el aviso
    input.title = problema;
    input.oninput = (e) => n1Editar(i, e.target.value);

    const der = document.createElement('div');
    der.style.cssText = 'display:flex;align-items:center;gap:8px';
    const cuenta = document.createElement('span');
    cuenta.className = 'n1-cuenta' + (problema ? ' n1-mal' : '');
    cuenta.textContent = `${String(t || '').trim().length}/${N1_LARGO}`;
    const borrar = document.createElement('button');
    borrar.className = 'n1-borrar'; borrar.textContent = '✕'; borrar.title = 'Borrar';
    borrar.onclick = () => n1Borrar(i);
    der.appendChild(cuenta); der.appendChild(borrar);

    fila.appendChild(orden); fila.appendChild(input); fila.appendChild(der);
    cont.appendChild(fila);
  });
  if (vacio) vacio.style.display = n1Limpias().length ? 'none' : '';
  n1Previa();
}
/** La vista previa espeja lo que se publicaría: mismas noticias, duplicadas
 *  para el loop sin costura, con textContent igual que el index. */
function n1Previa() {
  const track = document.getElementById('n1-previa-track');
  if (!track) return;
  track.textContent = '';
  const lista = n1Limpias();
  const pintar = lista.length ? lista : ['Conecta Reynosa · 13 años de experiencia · Tours a conciertos'];
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    pintar.forEach(t => {
      const sp = document.createElement('span');
      sp.textContent = t;                       // nunca innerHTML
      track.appendChild(sp);
    });
  }
  track.style.animationDuration = Math.min(90, Math.max(26, pintar.length * 5)) + 's';
}
/** Lee las noticias que HOY están publicadas, del index.html en vivo.
 *  Sin esto el editor abriría vacío y el primer "Publicar" borraría el banner
 *  sin que Memo se entere: el peor error posible de esta tuerca. Si la lectura
 *  falla, se dice y NO se finge una lista vacía. */
async function n1Cargar() {
  n1Estado('Leyendo el banner publicado…');
  try {
    const r = await fetch('/index.html?n1=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    const m = html.match(/ {2}var NOTICIAS = \[([\s\S]*?)\n {2}\];/);
    if (!m) throw new Error('no encontré el bloque NOTICIAS en el index');
    // Una cadena entre comillas simples por renglón; se desescapan las \'
    n1Noticias = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x => x[1].replace(/\\'/g, "'"));
    n1Pintar();
    n1Estado(n1Noticias.length ? `${n1Noticias.length} noticia(s) publicadas hoy.` : 'El banner está vacío: se ve el lema de siempre.');
  } catch (e) {
    // Se deja la lista intacta y se BLOQUEA publicar: escribir a ciegas sobre
    // algo que no pudiste leer es cómo se pierden las noticias de alguien.
    const btn = document.getElementById('n1-publicar');
    if (btn) btn.disabled = true;
    n1Estado('No pude leer el banner publicado (' + (e && e.message || e) + '). No publiques hasta recargar.', 'error');
  }
}
function n1Estado(msg, clase) {
  const el = document.getElementById('n1-estado');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'n1-estado' + (clase ? ' n1-' + clase : '');
}
async function n1Publicar() {
  const lista = n1Limpias();
  const malas = n1Noticias.map((t, i) => ({ i, p: n1Problema(t) })).filter(x => x.p);
  if (malas.length) { n1Estado(`La noticia ${malas[0].i + 1} ${malas[0].p}`, 'error'); return; }
  if (lista.length > N1_MAX) { n1Estado(`Máximo ${N1_MAX} noticias`, 'error'); return; }
  const aviso = lista.length
    ? `¿Publicar ${lista.length} noticia(s) al banner del sitio?`
    : '¿Publicar el banner VACÍO? La marquesina volverá al lema de siempre.';
  if (!confirm(aviso)) return;

  const btn = document.getElementById('n1-publicar');
  if (btn) btn.disabled = true;
  n1Estado('Publicando…');
  try {
    const r = await khAdminFetch('/.netlify/functions/noticias-publicar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noticias: lista }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) { n1Estado(d.error || `Error ${r.status}`, 'error'); return; }
    n1Estado(d.sin_cambios
      ? 'Sin cambios: el banner ya decía eso.'
      : `Publicado (${d.commit}). Netlify deploya en ~1 minuto.`, 'ok');
  } catch (e) {
    n1Estado('No se pudo publicar: ' + (e && e.message || e), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}