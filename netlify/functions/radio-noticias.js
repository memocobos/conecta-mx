// =============================================================================
// radio-noticias  (Radio v5 — ticker de noticias musicales)
//
// Endpoint PÚBLICO de la página /radio. Hace fetch server-side al RSS de Google
// News (música/conciertos en español) y devuelve los titulares ya limpios para
// el ticker. Server-side para esquivar CORS y cachear.
//
//   GET → { titulares: [...] }  (hasta 8, sin el sufijo " - <fuente>")
//         Si el fetch falla → { titulares: [] } con 200 (nunca error al cliente).
//
// Cache en memoria del módulo por 30 min (se comparte entre invocaciones mientras
// la lambda siga caliente). Guard de origen estilo #253 (solo bloquea un Origin
// cross-origin no permitido; el GET same-origin del ticker pasa).
// =============================================================================

const { corsCheck } = require('./_lib/verify-admin');

const RSS_URL = 'https://news.google.com/rss/search?q=m%C3%BAsica%20conciertos%20artistas&hl=es-419&gl=MX&ceid=MX:es-419';
const TTL_MS  = 30 * 60 * 1000; // 30 minutos
const MAX     = 8;

// Cache a nivel de módulo (persiste mientras la lambda esté caliente).
let _cache = { ts: 0, titulares: [] };

exports.handler = async (event) => {
  // Origin CRUDO: distinguir "cross-origin no permitido" de "sin Origin" (#253).
  const __rawOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (statusCode, payload) => ({ statusCode, headers, body: JSON.stringify(payload) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { titulares: [] });
  // Bloquear SOLO cuando vino un Origin y no está permitido (cross-origin real).
  if (__rawOrigin && !__origin) return json(403, { titulares: [] });

  // Cache fresca → servir sin re-fetch.
  if (_cache.titulares.length && (Date.now() - _cache.ts) < TTL_MS) {
    return json(200, { titulares: _cache.titulares });
  }

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    let xml;
    try {
      const r = await fetch(RSS_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (conecta-radio-noticias)' },
        signal: ac.signal,
      });
      if (!r.ok) throw new Error('rss ' + r.status);
      xml = await r.text();
    } finally {
      clearTimeout(timer);
    }

    const titulares = parseTitulares(xml);
    if (titulares.length) _cache = { ts: Date.now(), titulares };
    // Si el parseo vino vacío pero hay cache previa (aunque sea vieja), servirla.
    return json(200, { titulares: titulares.length ? titulares : _cache.titulares });
  } catch (e) {
    // Nunca error al cliente: cache vieja si existe, o lista vacía.
    return json(200, { titulares: _cache.titulares });
  }
};

// ----- helpers -----

// Parseo simple del RSS (sin librería XML): titles de cada <item>, primeros 8,
// sin el sufijo " - <fuente>" que Google News añade.
function parseTitulares(xml) {
  const out = [];
  if (!xml || typeof xml !== 'string') return out;
  // Cada <item> tiene su <title>. Partimos por <item> y descartamos el 0 (canal).
  const items = xml.split('<item>').slice(1);
  for (const it of items) {
    const m = it.match(/<title>([\s\S]*?)<\/title>/);
    if (!m) continue;
    let t = m[1]
      .replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '') // quita CDATA si lo hay
      .trim();
    t = decodeEntities(t);
    // Quita el sufijo " - Fuente" (Google News lo agrega al final).
    const idx = t.lastIndexOf(' - ');
    if (idx > 0) t = t.slice(0, idx).trim();
    if (t) out.push(t);
    if (out.length >= MAX) break;
  }
  return out;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // &amp; al final para no re-decodificar
}
