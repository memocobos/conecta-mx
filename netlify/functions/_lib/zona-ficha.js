// =============================================================================
// _lib/zona-ficha — LA PUERTA de las zonas capturadas (DISPO-NORM-1)
// =============================================================================
// Firmado por Memo el 28-sep-2026: opción A — el dato nace bien. Un «GENERAL»
// tecleado donde la ficha dice «General» se corrige AL CAPTURAR, y una zona
// que la ficha no tiene SE RECHAZA diciendo cuáles sí existen. ZONA-NORM-1
// cerró el casamiento del careo; esto cierra la LLAVE con la que nace el dato.
//
// Lo que costó no tenerla, medido el 28-sep (el mismo día, dos veces):
//   · en la mañana se alinearon a mano 4 filas de stock_ajustes cuya ortografía
//     restaba boletos de una llave fantasma (ultramexico anunciaba 18 Generales
//     teniendo 16);
//   · en la tarde el careo del Excel PROPUSO deshacer esa alineación — crear
//     otra vez «GENERAL»/«Seccion D»/«Retractil Oro» y poner en cero la fila
//     canónica — porque la chatarra también casaba por cadena exacta.
//
// 🔒 EL DUEÑO DE «¿SON LA MISMA?» SIGUE SIENDO `normalizar-zona`. Aquí no se
// re-implementa: se le PIDE. Esta pieza solo agrega el universo (qué zonas
// tiene la ficha) y el veredicto (exacta / canonizada / desconocida).
//
// 🔒 FAIL-SOFT DICHO, NUNCA MUDO: si el catálogo no se puede leer, la puerta
// contesta 'sin-catalogo' con la zona tal cual — el CALLER decide (los
// escritores aceptan y lo DICEN en su respuesta). Una puerta que se cierra
// cuando el CDN tose dejaría a Ximena sin poder capturar una venta real; una
// que finge haber validado es el hoyo otra vez. Se acepta Y se avisa.
//
// ⚠️ «General» ≠ «General Viernes» ≠ «VIP Plus»: la puerta solo canoniza lo
// que normalizado ES LA MISMA cadena. No acerca, no adivina, no funde.
// =============================================================================

const { normalizarZona } = require('./normalizar-zona');
const { fetchEventosRaw } = require('./catalogo-index');

// El universo de zonas de un evento: las globales (zonas + cheapZonas) MÁS las
// de cada fecha de un multifecha — la misma unión que aprendió DESDE-PAQ-1: una
// zona que solo existe en la fecha 2 sigue siendo una zona del evento.
// Devuelve la lista CANÓNICA (ortografía de la ficha), sin repetir.
function zonasCanonicasDe(ev) {
  const out = [];
  const vistas = new Set();
  const mete = (lista) => {
    for (const z of (Array.isArray(lista) ? lista : [])) {
      const n = z && z.n != null ? String(z.n).trim() : '';
      if (!n || vistas.has(n)) continue;
      vistas.add(n); out.push(n);
    }
  };
  if (ev) {
    mete(ev.zonas); mete(ev.cheapZonas);
    for (const mf of (Array.isArray(ev.multifecha) ? ev.multifecha : [])) {
      if (mf) { mete(mf.zonas); mete(mf.cheapZonas); }
    }
  }
  return out;
}

// PURO: el veredicto sobre una zona capturada contra la lista canónica.
//   'exacta'      → ya viene como la ficha; se guarda tal cual.
//   'canonizada'  → normalizada ES una de la ficha; se guarda LA DE LA FICHA.
//   'desconocida' → la ficha no la tiene ni normalizada; el escritor decide
//                   (los de venta RECHAZAN; ver cada llamador).
function resolverZonaFicha(canonicas, capturada) {
  const cap = String(capturada == null ? '' : capturada).trim();
  const lista = Array.isArray(canonicas) ? canonicas : [];
  if (lista.includes(cap)) return { estado: 'exacta', zona: cap };
  const nk = normalizarZona(cap);
  for (const c of lista) {
    if (normalizarZona(c) === nk) return { estado: 'canonizada', zona: c, capturada: cap };
  }
  return { estado: 'desconocida', zona: cap };
}

// IO: la puerta completa para un evento_id (acepta el sufijo `#N`: la ficha es
// la del slug base — las zonas por fecha ya entran por `multifecha`).
// Estados extra del mundo real: 'sin-evento' (el slug no está en el catálogo)
// y 'sin-catalogo' (no se pudo leer). En los dos la zona viaja tal cual.
async function puertaZona(eventoId, capturada) {
  const slug = String(eventoId || '').split('#')[0];
  let EV = null;
  try { EV = await fetchEventosRaw(); } catch (_) { EV = null; }
  if (!Array.isArray(EV) || !EV.length) {
    return { estado: 'sin-catalogo', zona: String(capturada == null ? '' : capturada).trim() };
  }
  const ev = EV.find((e) => e && e.id === slug);
  if (!ev) return { estado: 'sin-evento', zona: String(capturada == null ? '' : capturada).trim() };
  const canonicas = zonasCanonicasDe(ev);
  const r = resolverZonaFicha(canonicas, capturada);
  r.canonicas = canonicas;
  return r;
}

module.exports = { zonasCanonicasDe, resolverZonaFicha, puertaZona };
