// =============================================================================
// _lib/grupo-whatsapp — GRUPO-WA-1 (13-oct-2026). El dueño del link del grupo
// de WhatsApp por evento (tabla privada `grupos_whatsapp` en KameHouse).
// Lo usan: la captura en KameHouse, el correo de confirmación y el Portal.
// 🔒 Nunca va al index ni a esferas_eventos: es un link que deja ENTRAR, y el
//    index es público.
// =============================================================================

function baseSlug(id) { return String(id || '').split('#')[0]; }

// Acepta lo que la gente pega (con espacios, con ?mode=... de la app) y lo deja
// en su forma canónica. Devuelve null si no es un link de grupo de WhatsApp.
function normalizarLink(crudo) {
  const s = String(crudo || '').trim();
  const m = s.match(/^(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{10,40})(?:[/?#].*)?$/i);
  return m ? 'https://chat.whatsapp.com/' + m[1] : null;
}

// Mapa evento_id → link para los eventos pedidos, resolviendo la herencia:
// la fecha (slug#N) usa el suyo; si no tiene, el del evento base.
// Nunca lanza: si la tabla no se puede leer devuelve {} (el correo y el Portal
// simplemente no muestran el botón — no se inventa un link).
async function gruposDe(eventoIds, { KH_URL, KH_KEY }) {
  const ids = [...new Set((eventoIds || []).filter(Boolean).map(String))];
  if (!ids.length || !KH_URL || !KH_KEY) return {};
  const llaves = [...new Set(ids.concat(ids.map(baseSlug)))];
  try {
    const lista = llaves.map((x) => '"' + x.replace(/"/g, '') + '"').join(',');
    const r = await fetch(`${KH_URL}/rest/v1/grupos_whatsapp?evento_id=in.(${encodeURIComponent(lista)})&select=evento_id,link`, {
      headers: { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY },
    });
    if (!r.ok) return {};
    const filas = await r.json();
    const por = {};
    (filas || []).forEach((f) => { if (f && f.link) por[f.evento_id] = f.link; });
    const out = {};
    ids.forEach((id) => { const l = por[id] || por[baseSlug(id)]; if (l) out[id] = l; });
    return out;
  } catch (_) { return {}; }
}

module.exports = { normalizarLink, gruposDe, baseSlug };
