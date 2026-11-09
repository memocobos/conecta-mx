// =============================================================================
// _lib/grupo-whatsapp — GRUPO-WA-1 (13-oct-2026). El dueño del link del grupo
// de WhatsApp por evento (tabla privada `grupos_whatsapp` en KameHouse).
// Lo usan: la captura en KameHouse, el correo de confirmación y el Portal.
// 🔒 Nunca va al index ni a esferas_eventos: es un link que deja ENTRAR, y el
//    index es público.
//
// [GRUPO-WA-2, 9-nov-2026] DOS grupos por evento, palabra de Memo: «los cheap
// en un grupo y PLUS/STAY/RIDE en otro, que cada quien se vaya a su grupo».
//   · `link`       = el grupo del VIAJE (PLUS · STAY · RIDE)
//   · `link_cheap` = el grupo de los CHEAP (solo boleto)
// `linkPara(fila, paquete)` es el ÚNICO que decide cuál le toca a quién; los
// tres bebedores (correo · Portal · panel del coordi) le preguntan. Si el evento
// solo trae UNO capturado, ese es el grupo de todos — exactamente lo que pasaba
// antes de esta tuerca, así que nada cambia hasta que Bulma/Milk peguen el 2º.
// =============================================================================

const CAMPOS = ['link', 'link_cheap'];

function baseSlug(id) { return String(id || '').split('#')[0]; }

// Acepta lo que la gente pega (con espacios, con ?mode=... de la app) y lo deja
// en su forma canónica. Devuelve null si no es un link de grupo de WhatsApp.
function normalizarLink(crudo) {
  const s = String(crudo || '').trim();
  const m = s.match(/^(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{10,40})(?:[/?#].*)?$/i);
  return m ? 'https://chat.whatsapp.com/' + m[1] : null;
}

// ¿Este paquete va al grupo CHEAP? Solo el CHEAP (la preventa a ciegas viaja
// por dentro como cheap y hoy comparte grupo con los CHEAP: un solo criterio).
function esCheap(paquete) { return String(paquete || '').trim().toLowerCase() === 'cheap'; }

// El link que le toca a un paquete dentro de la fila resuelta de un evento.
// CHEAP → link_cheap; los demás → link. El que falte cae al otro: con un solo
// grupo capturado, ese es el grupo de todos.
function linkPara(fila, paquete) {
  if (!fila) return null;
  const orden = esCheap(paquete) ? [fila.link_cheap, fila.link] : [fila.link, fila.link_cheap];
  return orden.find((x) => !!x) || null;
}

// Mapa evento_id → { link, link_cheap } para los eventos pedidos, resolviendo la
// herencia CAMPO por CAMPO: la fecha (slug#N) usa el suyo; el campo que no
// tenga lo toma del evento base. Nunca lanza: si la tabla no se puede leer
// devuelve {} (el correo y el Portal simplemente no muestran el botón — no se
// inventa un link).
async function gruposDe(eventoIds, { KH_URL, KH_KEY }) {
  const ids = [...new Set((eventoIds || []).filter(Boolean).map(String))];
  if (!ids.length || !KH_URL || !KH_KEY) return {};
  const llaves = [...new Set(ids.concat(ids.map(baseSlug)))];
  try {
    const lista = llaves.map((x) => '"' + x.replace(/"/g, '') + '"').join(',');
    const r = await fetch(`${KH_URL}/rest/v1/grupos_whatsapp?evento_id=in.(${encodeURIComponent(lista)})&select=evento_id,${CAMPOS.join(',')}`, {
      headers: { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY },
    });
    if (!r.ok) return {};
    const filas = await r.json();
    const por = {};
    (filas || []).forEach((f) => { if (f && f.evento_id) por[f.evento_id] = f; });
    const out = {};
    ids.forEach((id) => {
      const propia = por[id] || {}, base = por[baseSlug(id)] || {};
      const fila = {};
      CAMPOS.forEach((c) => { fila[c] = propia[c] || base[c] || null; });
      if (CAMPOS.some((c) => fila[c])) out[id] = fila;
    });
    return out;
  } catch (_) { return {}; }
}

module.exports = { normalizarLink, gruposDe, baseSlug, linkPara, esCheap, CAMPOS };
