// =============================================================================
// kamehouse-nube.js — LA NUBE VOLADORA · la cotización semanal a CDMX (NUBE-1)
// =============================================================================
// La pluma de Bulma y Milk: cada lunes cotizan el transporte a CDMX —bus y
// avión— y suben el costo POR PERSONA con su vigencia. El sitio lo bebe de
// `nube-vigente`; aquí se captura y se ve el historial.
//
// 🔒 LOS DOS MODOS SIEMPRE A LA VISTA, con su estado dicho con palabras. Un
// modo SIN cotización vigente no se deja en blanco: dice «sin cotización
// vigente» y explica qué pasa en el sitio (cae a WhatsApp). Un renglón vacío y
// un renglón vencido se ven igual si nadie los nombra, y esta casa ya pagó esa.
//
// 🔒 DEFAULTS-1, aplicado con su excepción ESCRITA:
//   · el MODO nace VACÍO («— elige —»). Es una ATRIBUCIÓN: un default silencioso
//     pondría el precio del bus en el avión, que es el caso `kmt-prov` con otro
//     nombre (tres compras a nombre de «Hotel» porque el selector eligió solo).
//   · el PRECIO nace VACÍO y el guardado lo exige.
//   · la VIGENCIA sí trae default —el domingo que viene a las 23:59— porque es
//     una FORMA, no una atribución, y va **ANUNCIADA en la etiqueta**: las dos
//     razones que DEFAULTS-1 permite, y por eso está aquí por escrito.
//
// 🔴 EL HUSO SE DERIVA, NO SE TECLEA, y esto se midió: `ESF_FLASH_TZ` es un
// `-05:00` a mano, y la cadencia SEMANAL de la nube cruza el cambio de horario
// —el domingo **1-nov-2026** Reynosa ya va en −06:00—. Con el literal, una
// cotización capturada el lunes 26-oct habría vencido **una hora antes** de lo
// que dice la pantalla, y así todos los domingos del invierno. Aquí la hora de
// pared de Reynosa se resuelve preguntándole al huso.
// =============================================================================

const NUBE_TZ = 'America/Matamoros';   // Reynosa: SÍ cambia con EE.UU.
const NUBE_MODOS = [
  { k: 'bus',   nombre: 'Autobús', emoji: '🚌' },
  { k: 'avion', nombre: 'Avión',   emoji: '✈️' },
];

// ── EL INSTANTE DE UNA HORA DE PARED EN REYNOSA ─────────────────────────────
// Se prueban los dos husos posibles y se queda el que REPRODUCE la hora de
// pared pedida. Es el mismo truco con el que se midió el problema, y no
// depende de saber las fechas del cambio de horario: se las pregunta al huso.
function _nubeInstante(fechaISO, hhmm) {
  for (const off of ['-05:00', '-06:00']) {
    const t = Date.parse(fechaISO + 'T' + hhmm + ':00' + off);
    if (!Number.isFinite(t)) continue;
    let pared = '';
    try { pared = new Date(t).toLocaleString('sv-SE', { timeZone: NUBE_TZ }).slice(0, 16); } catch (_) { return t; }
    if (pared === fechaISO + ' ' + hhmm) return t;
  }
  // Ninguno reprodujo la pared (hora inexistente del salto de primavera):
  // se devuelve el primero en vez de inventar. La pantalla lo enseña y un
  // humano decide.
  return Date.parse(fechaISO + 'T' + hhmm + ':00-05:00');
}
// [NUBE-6] LA VIGENCIA POR DEFAULT YA NO ES «el domingo que viene».
// Medido el 9-nov-2026: en toda la vida de la nube hubo 5 capturas con
// vigencias de 2-5 días, y la cadencia semanal × 18 eventos × 2 modos no la
// sostuvo nadie — el sitio pasaba casi siempre en «cotiza por WhatsApp».
// [NUBE-6b] Y ES POR MODO — palabra de Memo: «renovación cada 15 días el del
// vuelo, el bus cada 30 porque sí cambia». ESPEJO con nombre de `VIGENCIA_DIAS`
// de `_lib/nube` (el navegador no puede hacer require); el careo los carea.
// Sigue siendo una FORMA con default ANUNCIADO en la etiqueta (DEFAULTS-1 b).
const NUBE_DIAS = { bus: 30, avion: 15 };
// [NUBE-6b] EL AVIÓN NO TIENE GENERAL (espejo de `MODOS_SIN_GENERAL` del dueño):
// cambia con cada fecha. La pantalla no ofrece capturarlo ni renovarlo como
// general; el servidor lo rebota igual si alguien lo intenta por otra puerta.
const NUBE_SIN_GENERAL = ['avion'];
function _nubeAdmiteGeneral(modo) { return !NUBE_SIN_GENERAL.includes(String(modo)); }
function _nubeDias(modo) { return NUBE_DIAS[modo] || NUBE_DIAS.bus; }
function _nubeDefaultHastaISO(modo) {
  const hoyR = new Date().toLocaleString('sv-SE', { timeZone: NUBE_TZ }).slice(0, 10);
  const [a, m, d] = hoyR.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  base.setUTCDate(base.getUTCDate() + _nubeDias(modo));
  return base.toISOString().slice(0, 10);
}
// ⚰️ `_nubeProximoDomingoISO` murió con la cadencia semanal; el nombre se
// conserva como alias por si algún llamador viejo lo pide.
function _nubeProximoDomingoISO() { return _nubeDefaultHastaISO('bus'); }
// [NUBE-6b] Al elegir el modo, la vigencia por default se acomoda a SU cadencia
// (bus 30 · avión 15) y la etiqueta lo dice. Si la persona ya tecleó una fecha
// a mano, no se le pisa.
function nubeModoCambio() {
  const modo = (document.getElementById('nube-modo')?.value || '').trim();
  const f = document.getElementById('nube-hasta-fecha');
  if (f && (!f.value || f.dataset.auto === '1')) { f.value = _nubeDefaultHastaISO(modo || 'bus'); f.dataset.auto = '1'; }
  const lbl = document.getElementById('nube-hasta-default');
  if (lbl) lbl.textContent = modo ? ('(por default, ' + _nubeDias(modo) + ' días)') : '(por default, 30 días bus · 15 avión)';
  const av = document.getElementById('nube-aviso-general');
  if (av) {
    const sel = _nubeSel();
    av.style.display = (modo && !_nubeAdmiteGeneral(modo) && sel.elegido && sel.eventoId == null) ? '' : 'none';
  }
  _nubePreviaVigencia();
}
function _nubeEnReynosa(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  try { return new Date(t).toLocaleString('sv-SE', { timeZone: NUBE_TZ }).slice(0, 16); }
  catch (_) { return '—'; }
}
function _nubeMxn(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function _nubeEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let _nubeDatos = null;
let _nubeEventos = null;         // la lista DERIVADA del catálogo (null = aún no se pidió)

// [NUBE-4] 🔒 TRES VALORES, NO DOS, y el centinela existe por eso: `''` es
// «todavía no elegí» y `NUBE_GENERAL` es «ELEGÍ la general». Aplastarlos en
// el vacío haría que no elegir se guardara como cotización general — un default
// silencioso sobre una ATRIBUCIÓN, que es justo lo que DEFAULTS-1 prohíbe: el
// precio general rige para TODOS los eventos sin uno propio.
const NUBE_GENERAL = '__general__';
// Lo que el selector dice hoy. Devuelve `{ elegido, eventoId }`:
//   elegido=false  → nadie eligió (no se lista, no se guarda, no se consulta)
//   eventoId=null  → la GENERAL, elegida a propósito
function _nubeSel() {
  const v = (document.getElementById('nube-evento')?.value || '').trim();
  if (!v) return { elegido: false, eventoId: null };
  return { elegido: true, eventoId: (v === NUBE_GENERAL) ? null : v };
}
// Cómo se NOMBRA lo elegido, para que ningún letrero diga «null» ni se quede
// mudo. La general se nombra con palabras porque es un caso real.
function _nubeNombre(eventoId) {
  if (eventoId == null) return 'General CDMX (todos)';
  const e = (_nubeEventos || []).find((x) => x.id === eventoId);
  return e ? (e.nombre + (e.ds ? (' · ' + e.ds) : '')) : eventoId;
}

// La lista de eventos se PIDE al servidor, que la DERIVA del catálogo. Aquí no
// se teclea ni se filtra por nuestra cuenta: una segunda regla de «qué evento
// usa el paso del transporte» acabaría contestando distinto que el index.
async function _nubeCargarEventos() {
  const sel = document.getElementById('nube-evento');
  if (!sel) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-nube', {
      method: 'POST', body: JSON.stringify({ accion: 'eventos' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || ('Error ' + r.status));
    _nubeEventos = Array.isArray(d.eventos) ? d.eventos : [];
    const previo = sel.value;
    sel.innerHTML = '<option value="">— elige —</option>'
      // 🔒 ANUNCIADA CON PALABRAS y primera de las de verdad: la cotización
      // general NO es «sin evento», es la que rige para los que no tienen una
      // propia. Que se pueda elegir a propósito es la mitad del diseño.
      + '<option value="' + NUBE_GENERAL + '">— General CDMX (todos) —</option>'
      + _nubeEventos.map((e) => '<option value="' + _nubeEsc(e.id) + '">'
          + _nubeEsc(e.nombre) + (e.ds ? (' · ' + _nubeEsc(e.ds)) : '')
          + (e.st ? (' [' + _nubeEsc(e.st) + ']') : '') + '</option>').join('');
    if (previo) sel.value = previo;             // no se le pierde lo elegido al refrescar
  } catch (e) {
    // 🔒 NO SE DEJA UN SELECTOR CON SOLO LA GENERAL: eso se leería como «no hay
    // eventos de CDMX» y mandaría toda cotización al cajón general. Se DICE.
    _nubeEventos = null;
    sel.innerHTML = '<option value="">— no se pudo leer la lista de eventos —</option>';
    const ayuda = document.getElementById('nube-evento-ayuda');
    if (ayuda) ayuda.innerHTML = '<b style="color:var(--orange)">No se pudo leer el catálogo</b>, '
      + 'así que la lista de eventos no está. Refresca: capturar sin saber a qué evento va sería peor.';
  }
}
function nubeEventoCambio() {
  const ayuda = document.getElementById('nube-evento-ayuda');
  const { elegido, eventoId } = _nubeSel();
  if (ayuda && _nubeEventos) {
    ayuda.innerHTML = elegido
      ? ('Hablando de <b style="color:var(--tp)">' + _nubeEsc(_nubeNombre(eventoId)) + '</b>. '
         + (eventoId == null
            ? 'La general rige para <b>todos</b> los eventos de CDMX que no tengan una propia — <b>solo autobús</b>: el avión se captura por evento.'
            : 'Su cotización propia de autobús le <b>gana</b> a la general; el avión solo existe aquí, por evento.'))
      : 'Manda sobre las tres cosas de esta pantalla: lo que se lista, lo que se guarda y lo que se consulta.';
  }
  // El historial de la consulta anterior era de OTRO evento: se borra en vez de
  // quedarse ahí pareciendo de éste.
  const q = document.getElementById('nube-q-res');
  if (q) q.innerHTML = '';
  // [NUBE-6b] El aviso «el avión no tiene general» depende del evento Y del modo.
  try { nubeModoCambio(); } catch (_) {}
  if (elegido) loadNube();
  else _nubePanorama();
}

// ═══ [NUBE-6] EL PANORAMA: lo que se ve al entrar, sin elegir nada ═════════
// Antes la pantalla decía «elige arriba de qué se habla» y la general era una
// opción más del selector — se capturaba por evento, 2-5 días cada una, y nadie
// aguantó el ritmo. Hoy, sin elegir nada, se ve LA GENERAL (bus y avión, con su
// vencimiento y «↻ Renovar») y debajo la lista de los eventos de CDMX vivos con
// su estado por modo: hereda · propio · sin precio. Una captura de la general
// cubre a todos; por evento solo se captura la excepción, y se ve cuál es.
// 🔒 Nada se calcula aquí: la cobertura la contesta `admin-nube · cobertura`,
// que a su vez le pregunta al dueño (`resolver`) evento por evento.
async function _nubePanorama() {
  const cont = document.getElementById('nube-cuerpo');
  if (!cont) return;
  cont.innerHTML = '<div class="loading-state">Leyendo la cobertura…</div>';
  _nubeFormReset();
  let d = null;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-nube', {
      method: 'POST', body: JSON.stringify({ accion: 'cobertura' }),
    });
    d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || ('Error ' + r.status));
  } catch (e) {
    khErrorCarga(cont, 'la cobertura de la nube', '_nubePanorama', e);
    return;
  }
  cont.innerHTML = _nubePanoramaHtml(d);
}
// Puro: recibe la respuesta de `cobertura` y arma el HTML. Separado para que
// el careo lo corra con una respuesta sembrada.
function _nubePanoramaHtml(d) {
  const ahora = Number(d.ahora) || Date.now();
  const general = d.general || {};
  const detalle = Array.isArray(d.detalle) ? d.detalle : [];
  const tarjetasGen = NUBE_MODOS.map((m) => {
    const g = general[m.k];
    let cuerpo;
    if (!_nubeAdmiteGeneral(m.k)) {
      // [NUBE-6b] El avión no tiene general: la tarjeta dice el método y cuenta.
      const conPropio = detalle.filter((e) => e[m.k] && e[m.k].estado === 'propio').length;
      const sinNada = detalle.filter((e) => !e[m.k] || e[m.k].estado === 'sin').length;
      cuerpo = '<div style="font-size:12px;color:var(--tp)"><b>SIEMPRE POR EVENTO</b> · vigencia ' + _nubeDias(m.k) + ' días</div>'
        + '<div style="font-size:11px;color:var(--ts);margin-top:4px">El vuelo cambia con cada fecha, así que no hay tarifa general: '
        + 'se captura en cada evento y se renueva con «↻ Sigue igual». Sin cotización propia, ese evento manda al WhatsApp de vuelos.</div>'
        + '<div style="font-size:12px;margin-top:8px"><b style="color:var(--green)">' + conPropio + '</b> con avión propio · '
        + '<b style="color:' + (sinNada ? 'var(--orange)' : 'var(--green)') + '">' + sinNada + '</b> sin avión</div>';
      return '<div class="card" style="padding:14px"><div class="card-lbl">' + m.emoji + ' ' + m.nombre + ' · POR EVENTO</div>' + cuerpo + '</div>';
    }
    if (g) {
      const diasQuedan = Math.ceil((Date.parse(g.vigente_hasta) - ahora) / 86400000);
      const porVencer = Number.isFinite(diasQuedan) && diasQuedan <= 5;
      cuerpo = '<b style="color:var(--tp);font-size:22px">' + _nubeMxn(g.precio) + '</b>'
        + ' <span style="font-size:11px;color:var(--ts)">por persona</span>'
        + '<div style="font-size:11px;color:' + (porVencer ? 'var(--orange)' : 'var(--ts)') + ';margin-top:4px">'
        + (porVencer ? '⚠️ ' : '') + 'rige hasta <b>' + _nubeEnReynosa(g.vigente_hasta) + '</b>'
        + (Number.isFinite(diasQuedan) ? (' · ' + (diasQuedan <= 0 ? 'vence hoy' : ('quedan ' + diasQuedan + ' día' + (diasQuedan === 1 ? '' : 's')))) : '') + '</div>'
        + (g.horarios ? ('<div style="font-size:11px;color:var(--tp);margin-top:2px">🕓 ' + _nubeEsc(g.horarios) + '</div>') : '')
        + '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
        + '<button class="btn btn-ghost btn-sm" onclick="nubeRenovar(\'' + m.k + '\',null)">↻ Sigue igual · renovar ' + _nubeDias(m.k) + ' días</button>'
        + '<button class="btn btn-ghost btn-sm" onclick="nubeIrA(\'' + NUBE_GENERAL + '\',\'' + m.k + '\')">✏️ Cambiar precio</button>'
        + '</div>';
    } else {
      cuerpo = '<div style="font-size:12px;color:var(--orange)"><b>SIN TARIFA GENERAL</b></div>'
        + '<div style="font-size:11px;color:var(--ts);margin-top:4px">Los eventos sin cotización propia caen al WhatsApp en este modo. '
        + 'Captura UNA general y los cubre a todos.</div>'
        + '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
        + '<button class="btn btn-ghost btn-sm" onclick="nubeRenovar(\'' + m.k + '\',null)">↻ Revivir la última ' + _nubeDias(m.k) + ' días</button>'
        + '<button class="btn btn-primary btn-sm" onclick="nubeIrA(\'' + NUBE_GENERAL + '\',\'' + m.k + '\')">➕ Capturar general</button>'
        + '</div>';
    }
    return '<div class="card" style="padding:14px"><div class="card-lbl">' + m.emoji + ' ' + m.nombre + ' · TARIFA GENERAL CDMX</div>' + cuerpo + '</div>';
  }).join('');

  const chip = (x) => {
    if (!x || x.estado === 'sin') return '<span style="color:var(--orange)">— sin precio</span>';
    if (x.estado === 'propio') return '<span style="color:var(--green)">' + _nubeMxn(x.precio) + ' <span style="font-size:10px">propio</span></span>';
    return '<span style="color:var(--ts)">' + _nubeMxn(x.precio) + ' <span style="font-size:10px">general</span></span>';
  };
  const filas = detalle.map((e) => '<div style="display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer" onclick="nubeIrA(\'' + _nubeEsc(e.id) + '\',\'\')" title="Abrir ' + _nubeEsc(e.nombre) + '">'
    + '<span><b style="color:var(--tp)">' + _nubeEsc(e.nombre) + '</b>' + (e.ds ? (' <span style="color:var(--ts)">· ' + _nubeEsc(e.ds) + '</span>') : '') + '</span>'
    + '<span style="white-space:nowrap">🚌 ' + chip(e.bus) + '</span>'
    + '<span style="white-space:nowrap">✈️ ' + chip(e.avion) + '</span>'
    + '</div>').join('');
  const sinBus = ((d.sin && d.sin.bus) || []).length, sinAvion = ((d.sin && d.sin.avion) || []).length;
  const propiosBus = (d.propios && d.propios.bus) || 0, propiosAvion = (d.propios && d.propios.avion) || 0;
  return '<div style="font-size:11px;color:var(--ts);margin-bottom:8px;text-transform:uppercase;letter-spacing:.1em">la tarifa general cubre a todos los eventos sin una propia</div>'
    + '<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">' + tarjetasGen + '</div>'
    + '<div class="card" style="padding:14px;margin-top:12px">'
    + '<div class="card-lbl">📡 Cobertura · ' + Number(d.total || 0) + ' eventos de CDMX vivos</div>'
    + '<div style="font-size:11px;color:var(--ts);margin-bottom:8px">'
    + '🚌 ' + propiosBus + ' con precio propio · ' + (Number(d.total || 0) - propiosBus - sinBus) + ' heredan la general · <b style="color:' + (sinBus ? 'var(--orange)' : 'var(--green)') + '">' + sinBus + ' sin precio</b>'
    + ' &nbsp;·&nbsp; ✈️ ' + propiosAvion + ' propio · ' + (Number(d.total || 0) - propiosAvion - sinAvion) + ' general · <b style="color:' + (sinAvion ? 'var(--orange)' : 'var(--green)') + '">' + sinAvion + ' sin precio</b>'
    + '<br>Toca un evento para ver sus cotizaciones o capturarle una propia (la excepción, no la regla).</div>'
    + (filas || '<div style="font-size:12px;color:var(--ts)">No hay eventos de CDMX vivos en el catálogo.</div>')
    + '</div>';
}
// Lleva el selector a un evento (o a la general) y, si se pide, deja el modo
// elegido en el formulario para que capturar sea un paso menos.
function nubeIrA(valor, modo) {
  const sel = document.getElementById('nube-evento');
  if (sel) sel.value = valor;
  nubeEventoCambio();
  if (modo) { const m = document.getElementById('nube-modo'); if (m) m.value = modo; }
}
// [NUBE-6] «Sigue igual»: renueva la cotización de ESTA llave (la elegida, o la
// general con `eventoId === null`) por los días de SU modo (bus 30 · avión 15).
// El servidor inserta la fila nueva con la nota «renovada sin cambio» — el
// historial queda.
async function nubeRenovar(modo, eventoId) {
  const quien = eventoId === undefined ? _nubeSel().eventoId : eventoId;
  // [NUBE-6b] El avión no tiene general: no hay nada que renovar ahí.
  if (quien == null && !_nubeAdmiteGeneral(modo)) { showToast('El avión se cotiza por evento: elige el evento.', 'error'); return; }
  const etiqueta = _nubeNombre(quien);
  const dias = _nubeDias(modo);
  if (!confirm('¿Renovar la cotización de ' + (modo === 'bus' ? 'autobús' : 'avión') + ' de «' + etiqueta + '» por ' + dias + ' días más, con el MISMO precio?')) return;
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-nube', {
      method: 'POST', body: JSON.stringify({ accion: 'renovar', modo, evento_id: quien || undefined, dias }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || ('Error ' + r.status));
    showToast('Renovada · ' + _nubeMxn(d.fila && d.fila.precio) + ' hasta ' + _nubeEnReynosa(d.fila && d.fila.vigente_hasta), 'success');
    if (_nubeSel().elegido) await loadNube(); else await _nubePanorama();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadNube() {
  const cont = document.getElementById('nube-cuerpo');
  if (!cont) return;
  // La lista de eventos se pide UNA vez por carga de pantalla.
  if (_nubeEventos == null) await _nubeCargarEventos();
  const { elegido } = _nubeSel();
  // [NUBE-6] Sin elección, el PANORAMA — no un letrero que manda a elegir.
  if (!elegido) { await _nubePanorama(); return; }
  const { eventoId } = _nubeSel();
  cont.innerHTML = '<div class="loading-state">Leyendo la nube…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-nube', {
      method: 'POST', body: JSON.stringify({ accion: 'listar', evento_id: eventoId || undefined }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || ('Error ' + r.status));
    _nubeDatos = d;
    _nubePintar(d);
  } catch (e) {
    khErrorCarga(cont, 'la nube voladora', 'loadNube', e);
  }
}

function _nubePintar(d) {
  const cont = document.getElementById('nube-cuerpo');
  if (!cont) return;
  const ahora = Number(d.ahora) || Date.now();
  const tarjetas = NUBE_MODOS.map((m) => {
    const info = (d.modos && d.modos[m.k]) || {};
    const v = info.vigente;
    // 🔒 TRES ESTADOS, dichos con palabras. «Sin cotización» y «vencida» no son
    // lo mismo y las dos tienen la MISMA consecuencia en el sitio, así que la
    // consecuencia se dice en los dos casos: nadie tiene que deducirla.
    // [NUBE-4] La RESOLUCIÓN con herencia, que es OTRA pregunta que «mis filas»:
    // este evento puede no tener cotización propia y aun así tener precio — el
    // de la general. Decir «sin cotización» ahí sería falso.
    const res = (d.resuelto && d.resuelto[m.k]) || null;
    let estado, detalle;
    if (v) {
      estado = '<span style="color:var(--green)">VIGENTE</span>';
      detalle = '<b style="color:var(--tp);font-size:19px">' + _nubeMxn(v.precio) + '</b>'
        + ' <span style="font-size:11px;color:var(--ts)">por persona</span>'
        + '<div style="font-size:11px;color:var(--ts);margin-top:4px">rige hasta <b>' + _nubeEnReynosa(v.vigente_hasta) + '</b>'
        + ' (hora de Reynosa) · la subió ' + _nubeEsc(v.capturado_por || '—') + '</div>'
        + (v.horarios ? '<div style="font-size:11px;color:var(--tp);margin-top:2px">🕓 ' + _nubeEsc(v.horarios) + '</div>' : '')
        + (v.nota ? '<div style="font-size:11px;color:var(--ts);margin-top:2px">' + _nubeEsc(v.nota) + '</div>' : '')
        // [NUBE-6] «Sigue igual» a un clic: renueva ESTA llave con el mismo precio.
        + '<div style="margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="nubeRenovar(\'' + m.k + '\')">↻ Sigue igual · renovar ' + _nubeDias(m.k) + ' días</button></div>';
    } else if (res && res.heredado) {
      // 🔒 CUATRO ESTADOS AHORA, Y EL NUEVO SE ROTULA: «este evento no tiene
      // cotización propia, y rige la GENERAL». Sin este renglón la pantalla
      // diría «sin cotización → WhatsApp» mientras el sitio SÍ vende — la
      // pantalla mintiendo en el sentido contrario, que es el peor.
      estado = '<span style="color:var(--blue,var(--ts))">HEREDA LA GENERAL</span>';
      detalle = '<b style="color:var(--tp);font-size:19px">' + _nubeMxn(res.precio) + '</b>'
        + ' <span style="font-size:11px;color:var(--ts)">por persona</span>'
        + '<div style="font-size:11px;color:var(--ts);margin-top:4px">Este evento <b>no tiene cotización propia</b>: '
        + 'rige la <b style="color:var(--tp)">general de CDMX</b>, hasta <b>' + _nubeEnReynosa(res.vigente_hasta) + '</b> (hora de Reynosa).</div>'
        + (res.horarios ? ('<div style="font-size:11px;color:var(--ts);margin-top:2px">🕓 ' + _nubeEsc(res.horarios) + '</div>') : '')
        + '<div style="font-size:11px;color:var(--ts);margin-top:2px">Captura una aquí y le gana, aunque la general sea más nueva.</div>';
    } else {
      const ultima = (info.ultimas || [])[0];
      estado = '<span style="color:var(--orange)">' + (ultima ? 'VENCIDA' : 'SIN COTIZACIÓN') + '</span>';
      detalle = '<div style="font-size:12px;color:var(--ts)">'
        + (ultima
            ? ('La última venció el <b>' + _nubeEnReynosa(ultima.vigente_hasta) + '</b> ('
               + _nubeMxn(ultima.precio) + ', la subió ' + _nubeEsc(ultima.capturado_por || '—') + ').')
            : 'Este modo nunca se ha cotizado.')
        + (_nubeSel().eventoId != null ? (_nubeAdmiteGeneral(m.k) ? ' <b>Y la general tampoco rige hoy.</b>' : ' <b>El avión no tiene general: solo rige lo que se capture aquí, para este evento.</b>') : '')
        + ' <b style="color:var(--tp)">En el sitio, este modo manda al WhatsApp</b> — no se pinta ningún precio.'
        + '</div>'
        // [NUBE-6] Si hubo una, revivirla con el mismo precio es un clic.
        + (ultima ? ('<div style="margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="nubeRenovar(\'' + m.k + '\')">↻ Revivir la última (' + _nubeMxn(ultima.precio) + ') por ' + _nubeDias(m.k) + ' días</button></div>') : '');
    }
    const filas = (info.ultimas || []).slice(0, 6).map((f) => {
      const viva = Date.parse(f.vigente_desde) <= ahora && ahora < Date.parse(f.vigente_hasta);
      return '<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
        + '<span>' + _nubeEnReynosa(f.vigente_desde) + ' → ' + _nubeEnReynosa(f.vigente_hasta)
        + (viva ? ' <span style="color:var(--green);font-size:10px">· rige</span>' : '') + '</span>'
        + '<span style="font-family:\'JetBrains Mono\',monospace;white-space:nowrap">' + _nubeMxn(f.precio) + '</span>'
        + '</div>';
    }).join('');
    return '<div class="card" style="padding:14px">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">'
      + '<div class="card-lbl">' + m.emoji + ' ' + m.nombre + '</div>' + estado + '</div>'
      + detalle
      + (filas ? ('<details style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;color:var(--ts);text-transform:uppercase;letter-spacing:.1em">historial · ' + (info.ultimas || []).length + '</summary><div style="padding-top:6px">' + filas + '</div></details>') : '')
      + '</div>';
  }).join('');

  // 🔒 EL ENCABEZADO DICE DE QUIÉN SON ESTAS TARJETAS. Con un selector que
  // manda sobre tres cosas, unas tarjetas sin dúeño escrito se leen como «la
  // nube» y se capturó sobre otro evento — la atribución se ve, no se recuerda.
  cont.innerHTML = '<div style="font-size:11px;color:var(--ts);margin-bottom:8px;text-transform:uppercase;letter-spacing:.1em">'
    + 'cotizaciones de <b style="color:var(--tp)">' + _nubeEsc(_nubeNombre(_nubeSel().eventoId)) + '</b></div>'
    + '<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">' + tarjetas + '</div>'
    + '<div style="font-size:11px;color:var(--ts);margin-top:10px">'
    + '<b style="color:var(--tp)">La tabla es el historial.</b> Una captura nueva NO corrige la anterior: '
    + 'agrega una fila. Así, el día que alguien diga «a mí me dijeron $X», la respuesta se lee — no se recuerda.'
    + '</div>';
  _nubeFormReset();
}

// ── LA CAPTURA ──────────────────────────────────────────────────────────────
function _nubeFormReset() {
  const sel = document.getElementById('nube-modo');
  if (sel) sel.value = '';                       // nace VACÍO: es una atribución
  const p = document.getElementById('nube-precio');
  if (p) p.value = '';
  const n = document.getElementById('nube-nota');
  if (n) n.value = '';
  const ho = document.getElementById('nube-horarios');
  if (ho) ho.value = '';
  // ⚠️ EL SELECTOR DE EVENTO **NO** SE LIMPIA AQUÍ, y es a propósito: es el
  // MANDO de la pantalla, no un campo del formulario. Borrarlo tras guardar
  // dejaría la lista y el historial sin dúeño y obligaría a re-elegirlo para
  // capturar el segundo modo del mismo evento — que es justo lo que se hace
  // los lunes: bus y avión, uno tras otro.
  // La vigencia SÍ trae default, y va anunciada en su etiqueta.
  const f = document.getElementById('nube-hasta-fecha');
  if (f && (!f.value || f.dataset.auto === '1')) { f.value = _nubeDefaultHastaISO('bus'); f.dataset.auto = '1'; }
  const h = document.getElementById('nube-hasta-hora');
  if (h && !h.value) h.value = '23:59';
  nubeModoCambio();
}
// El letrero de «esto vence el…» se DERIVA de lo capturado y dice el instante
// en hora de Reynosa: el que teclea ve exactamente lo que va a guardar.
function _nubePreviaVigencia() {
  const el = document.getElementById('nube-previa');
  if (!el) return;
  const f = (document.getElementById('nube-hasta-fecha')?.value || '').trim();
  const h = (document.getElementById('nube-hasta-hora')?.value || '').trim() || '23:59';
  if (!f) { el.textContent = 'Falta hasta cuándo rige.'; return; }
  const t = _nubeInstante(f, h);
  const pasado = t <= Date.now();
  el.innerHTML = pasado
    ? '<b style="color:var(--orange)">Esa vigencia ya pasó:</b> la cotización nacería vencida y no regiría nunca.'
    : 'Regirá hasta <b style="color:var(--tp)">' + _nubeEnReynosa(new Date(t).toISOString()) + '</b> (hora de Reynosa).';
}

async function nubeGuardar() {
  const modo = (document.getElementById('nube-modo')?.value || '').trim();
  const precio = (document.getElementById('nube-precio')?.value || '').trim();
  const f = (document.getElementById('nube-hasta-fecha')?.value || '').trim();
  const h = (document.getElementById('nube-hasta-hora')?.value || '').trim() || '23:59';
  const nota = (document.getElementById('nube-nota')?.value || '').trim();
  const horarios = (document.getElementById('nube-horarios')?.value || '').trim();
  const { elegido, eventoId } = _nubeSel();
  // 🔒 EL GUARDADO EXIGE LO QUE NACIÓ VACÍO. Y estas guardas NO son decorativas
  // ni «por si acaso»: el selector nace sin valor a propósito, así que ésta es
  // la rama que de verdad se alcanza — no la guarda dormida de `kmt-prov`.
  // [NUBE-4] Y el evento es lo PRIMERO que se exige: sin él no se sabe de quién
  // es el precio, y «General CDMX» tiene su propia opción para poder elegirse.
  if (!elegido) return showToast('Elige arriba de qué se habla: un evento o «General CDMX»', 'error');
  if (!modo) return showToast('Elige el modo: autobús o avión', 'error');
  // [NUBE-6b] El avión no tiene general: se rebota ANTES de pedir (el servidor
  // también lo rebota — el candado vive allá; esto es la palabra a tiempo).
  if (eventoId == null && !_nubeAdmiteGeneral(modo)) return showToast('El avión se cotiza POR EVENTO (cambia con cada fecha): elige el evento arriba. La general solo existe para el autobús.', 'error');
  if (!precio || !(Number(precio) > 0)) return showToast('Escribe el precio por persona', 'error');
  if (!f) return showToast('Escribe hasta cuándo rige', 'error');
  const hasta = _nubeInstante(f, h);
  if (!(hasta > Date.now())) return showToast('Esa vigencia ya pasó: la cotización nacería vencida', 'error');

  const btn = document.getElementById('nube-guardar-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-nube', {
      method: 'POST',
      body: JSON.stringify({
        accion: 'cotizar', modo,
        evento_id: eventoId || undefined,
        precio_pp: Number(precio),
        vigente_hasta: new Date(hasta).toISOString(),
        horarios: horarios || undefined,
        nota: nota || undefined,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || ('Error ' + r.status));
    showToast('Cotización guardada · ' + _nubeNombre(eventoId), 'success');
    await loadNube();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar cotización'; }
  }
}

// ═══ [NUBE-3] EL HISTORIAL CONSULTABLE ════════════════════════════════════
// «¿Qué cotización regía el día que reservó?» — la pregunta que resuelve una
// disputa de dinero LEYENDO en vez de recordando. Y por eso la tabla es
// INSERT-only desde NUBE-1: el precio al que alguien cotizó es un hecho con
// fecha, y un hecho con fecha no puede cambiar debajo.
//
// 🔒 LOS TRES ESTADOS SE ROTULAN, no se aplastan en «no hay». «Vigente ese
// día», «vencida ese día» y «ANTERIOR AL NACIMIENTO» no son grados de lo
// mismo: la cicatriz de Omar Courtz fue exactamente confundir «yo todavía no
// existía» con «nunca cambió», y contestar el precio de HOY para un separo
// pasado.
//
// 🔒 Y LA PREGUNTA NO SE RE-IMPLEMENTA AQUÍ: la pantalla pide y pinta. Quien
// decide qué regía es `regiaEl` del lib, por su endpoint.
var NUBE_EST = {
  vigente:              { t: 'REGÍA ESE DÍA',            c: 'var(--green)' },
  vencida:              { t: 'VENCIDA ESE DÍA',          c: 'var(--orange)' },
  antes_del_nacimiento: { t: 'LA NUBE AÚN NO EXISTÍA',   c: 'var(--ts)' },
  sin_datos:            { t: 'ESTE MODO NUNCA SE COTIZÓ', c: 'var(--ts)' },
};
async function nubeConsultar() {
  var dia = (document.getElementById('nube-q-dia') || {}).value || '';
  var caja = document.getElementById('nube-q-res');
  if (!caja) return;
  if (!_nubeSel().elegido) { caja.innerHTML = '<div style="font-size:12px;color:var(--orange)">Elige arriba de qué se habla antes de consultar: la respuesta cambia por evento.</div>'; return; }
  if (!dia) { caja.innerHTML = '<div style="font-size:12px;color:var(--orange)">Elige el día que quieres consultar.</div>'; return; }
  caja.innerHTML = '<div class="loading-state">Leyendo el historial…</div>';
  try {
    var r = await khAdminFetch('/.netlify/functions/admin-nube', {
      method: 'POST', body: JSON.stringify({ accion: 'historial', dia: dia, evento_id: _nubeSel().eventoId || undefined }),
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok || d.ok === false) throw new Error(d.error || ('Error ' + r.status));
    caja.innerHTML = _nubeHistHtml(d, dia);
  } catch (e) {
    khErrorCarga(caja, 'el historial de la nube', 'nubeConsultar', e);
  }
}
function _nubeHistHtml(d, dia) {
  var partes = NUBE_MODOS.map(function (m) {
    var r = (d.modos && d.modos[m.k]) || {};
    var est = NUBE_EST[r.estado] || { t: String(r.estado || '—').toUpperCase(), c: 'var(--ts)' };
    var cuerpo;
    if (r.estado === 'vigente' && r.fila) {
      // El DATO que resuelve la disputa: el precio, su vigencia completa y
      // QUIÉN la capturó. Los tres juntos, porque por separado no prueban nada.
      cuerpo = '<b style="color:var(--tp);font-size:18px">' + _nubeMxn(r.fila.precio) + '</b>'
        + ' <span style="font-size:11px;color:var(--ts)">por persona</span>'
        // 🔒 LA HERENCIA SE ROTULA TAMBIÉN AQUÍ. Un precio de la general
        // presentado como el del evento es un dato BUENO con la etiqueta
        // equivocada — y este renglón existe para resolver disputas.
        + (r.heredado ? '<div style="font-size:11px;color:var(--orange);margin-top:4px">Era la cotización <b>GENERAL de CDMX</b>: ese día este evento no tenía una propia.</div>' : '')
        + (r.fila.horarios ? '<div style="font-size:11px;color:var(--tp);margin-top:2px">🕓 ' + _nubeEsc(r.fila.horarios) + '</div>' : '')
        + '<div style="font-size:11px;color:var(--ts);margin-top:4px">vigencia: <b>' + _nubeEnReynosa(r.fila.vigente_desde)
        + '</b> → <b>' + _nubeEnReynosa(r.fila.vigente_hasta) + '</b> (hora de Reynosa)</div>'
        + '<div style="font-size:11px;color:var(--ts)">la subió <b>' + _nubeEsc(r.fila.capturado_por || '—') + '</b>'
        + ' el ' + _nubeEnReynosa(r.fila.creado_en) + '</div>'
        + (r.fila.nota ? '<div style="font-size:11px;color:var(--ts);margin-top:2px">' + _nubeEsc(r.fila.nota) + '</div>' : '');
    } else if (r.estado === 'vencida') {
      cuerpo = '<div style="font-size:12px;color:var(--ts)">Ese día <b style="color:var(--tp)">no había cotización vigente</b>: '
        + 'el sitio mandaba al WhatsApp y el precio lo puso un humano.'
        + (r.fila ? ('<br>La última antes de ese día fue ' + _nubeMxn(r.fila.precio) + ', vencida el '
                     + _nubeEnReynosa(r.fila.vigente_hasta) + ' (la subió ' + _nubeEsc(r.fila.capturado_por || '—') + ').')
                  : '')
        + '</div>';
    } else if (r.estado === 'antes_del_nacimiento') {
      cuerpo = '<div style="font-size:12px;color:var(--ts)">Ese día <b style="color:var(--tp)">la nube todavía no existía</b> para este modo'
        + (r.nacimiento ? (': la primera cotización empezó a regir el <b>' + _nubeEnReynosa(new Date(r.nacimiento).toISOString()) + '</b>') : '')
        + '. No es que no cambiara de precio — es que no había ninguno, y el sitio mandaba al WhatsApp.</div>';
    } else {
      cuerpo = '<div style="font-size:12px;color:var(--ts)">Este modo <b style="color:var(--tp)">nunca se ha cotizado</b>.</div>';
    }
    return '<div class="card" style="padding:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">'
      + '<div class="card-lbl">' + m.emoji + ' ' + m.nombre + '</div>'
      + '<span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;letter-spacing:.1em;color:' + est.c + '">' + est.t + '</span>'
      + '</div>' + cuerpo + '</div>';
  }).join('');
  return '<div style="font-size:11px;color:var(--ts);margin-bottom:8px">Lo que regía el <b style="color:var(--tp)">'
    + _nubeEsc(dia) + '</b> para <b style="color:var(--tp)">' + _nubeEsc(_nubeNombre(_nubeSel().eventoId))
    + '</b> (leído por vigencia, no por «la última capturada»):</div>'
    + '<div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">' + partes + '</div>';
}
