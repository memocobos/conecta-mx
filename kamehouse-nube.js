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
// El domingo que viene, en Reynosa. Si HOY es domingo, es el de dentro de 7
// días: la cotización del lunes tiene que cubrir la semana entera.
function _nubeProximoDomingoISO() {
  const hoyR = new Date().toLocaleString('sv-SE', { timeZone: NUBE_TZ }).slice(0, 10);
  const [a, m, d] = hoyR.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  const dow = base.getUTCDay();                 // 0 = domingo
  base.setUTCDate(base.getUTCDate() + (dow === 0 ? 7 : (7 - dow)));
  return base.toISOString().slice(0, 10);
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

async function loadNube() {
  const cont = document.getElementById('nube-cuerpo');
  if (!cont) return;
  cont.innerHTML = '<div class="loading-state">Leyendo la nube…</div>';
  try {
    const r = await khAdminFetch('/.netlify/functions/admin-nube', {
      method: 'POST', body: JSON.stringify({ accion: 'listar' }),
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
    let estado, detalle;
    if (v) {
      estado = '<span style="color:var(--green)">VIGENTE</span>';
      detalle = '<b style="color:var(--tp);font-size:19px">' + _nubeMxn(v.precio) + '</b>'
        + ' <span style="font-size:11px;color:var(--ts)">por persona</span>'
        + '<div style="font-size:11px;color:var(--ts);margin-top:4px">rige hasta <b>' + _nubeEnReynosa(v.vigente_hasta) + '</b>'
        + ' (hora de Reynosa) · la subió ' + _nubeEsc(v.capturado_por || '—') + '</div>'
        + (v.nota ? '<div style="font-size:11px;color:var(--ts);margin-top:2px">' + _nubeEsc(v.nota) + '</div>' : '');
    } else {
      const ultima = (info.ultimas || [])[0];
      estado = '<span style="color:var(--orange)">' + (ultima ? 'VENCIDA' : 'SIN COTIZACIÓN') + '</span>';
      detalle = '<div style="font-size:12px;color:var(--ts)">'
        + (ultima
            ? ('La última venció el <b>' + _nubeEnReynosa(ultima.vigente_hasta) + '</b> ('
               + _nubeMxn(ultima.precio) + ', la subió ' + _nubeEsc(ultima.capturado_por || '—') + ').')
            : 'Este modo nunca se ha cotizado.')
        + ' <b style="color:var(--tp)">En el sitio, este modo manda al WhatsApp</b> — no se pinta ningún precio.'
        + '</div>';
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

  cont.innerHTML = '<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">' + tarjetas + '</div>'
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
  // La vigencia SÍ trae default, y va anunciada en su etiqueta.
  const f = document.getElementById('nube-hasta-fecha');
  if (f && !f.value) f.value = _nubeProximoDomingoISO();
  const h = document.getElementById('nube-hasta-hora');
  if (h && !h.value) h.value = '23:59';
  _nubePreviaVigencia();
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
  // 🔒 EL GUARDADO EXIGE LO QUE NACIÓ VACÍO. Y estas guardas NO son decorativas
  // ni «por si acaso»: el selector nace sin valor a propósito, así que ésta es
  // la rama que de verdad se alcanza — no la guarda dormida de `kmt-prov`.
  if (!modo) return showToast('Elige el modo: autobús o avión', 'error');
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
        precio_pp: Number(precio),
        vigente_hasta: new Date(hasta).toISOString(),
        nota: nota || undefined,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || ('Error ' + r.status));
    showToast('Cotización guardada', 'success');
    await loadNube();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar cotización'; }
  }
}
