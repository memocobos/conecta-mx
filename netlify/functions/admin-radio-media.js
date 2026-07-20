// =============================================================================
// admin-radio-media  (Kaio-sama Fase 4 — editor PERMANENTE de metadata/portadas)
//
// Gateway entre Kamehouse y dos servicios:
//   · AzuraCast (https://radio.conectareynosa.mx) — API de archivos (X-API-Key
//     de AZURACAST_API_KEY) para BUSCAR en la biblioteca y reprocesar.
//   · Editor del NAS (https://editor.conectareynosa.mx) — escribe tags y
//     portadas DENTRO del archivo original (X-Editor-Key de RADIO_EDITOR_KEY).
// La "ruta" es la misma ruta relativa que AzuraCast maneja (media root y library
// son la misma carpeta), así que sirve igual para AzuraCast y para el editor.
//
//   GET ?buscar={texto}  → files/list?searchPhrase → { ok, archivos:[{ruta,titulo,artista,album,art}] } (máx 20)
//   GET ?leer={ruta}     → editor /leer → { ok, titulo, artista, album, artista_album }
//   POST { accion:"editar",  ruta, titulo, artista, album, artista_album } → editor /editar (+ reprocess best-effort) → { ok }
//   POST { accion:"portada", ruta, imagen(base64), mime }                  → editor /portada (base64 ≤2MB, jpeg/png) (+ reprocess) → { ok }
//
// Seguridad: MISMO patrón que admin-radio-control (guard #253) — cross-origin
// real → 403; GET same-origin sin Origin pasa; JWT admin (maestro_roshi) es el
// candado real. Timeout 8s en cada salto.
//
// Variables de entorno: AZURACAST_API_KEY, RADIO_EDITOR_KEY, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const AZ_BASE     = 'https://radio.conectareynosa.mx';
const EDITOR_BASE = 'https://editor.conectareynosa.mx';
const STATION     = '1';
const TIMEOUT_MS  = 8000;
const MAX_IMG_BYTES = 2 * 1024 * 1024; // 2MB
const MIME_OK = { 'image/jpeg': 1, 'image/png': 1 };
const PUBLIC_ART_PREFIX = `${AZ_BASE}/api/station/${STATION}/art/`;

exports.handler = async (event) => {
  // Origin CRUDO para distinguir "cross-origin no permitido" de "sin Origin".
  const __rawOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (__rawOrigin && !__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const AZ_KEY = process.env.AZURACAST_API_KEY;
  const ED_KEY = process.env.RADIO_EDITOR_KEY;
  if (!AZ_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta env var AZURACAST_API_KEY' }) };
  if (!ED_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta env var RADIO_EDITOR_KEY' }) };

  const azHeaders = { 'X-API-Key': AZ_KEY, Accept: 'application/json' };
  const edHeaders = { 'X-Editor-Key': ED_KEY, 'Content-Type': 'application/json', Accept: 'application/json' };

  try {
    // ───────────────────────── GET ─────────────────────────
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};

      // GET ?buscar= → biblioteca de AzuraCast (files/list con searchPhrase)
      if (q.buscar != null) {
        const texto = String(q.buscar).trim();
        if (!texto) return { statusCode: 400, headers, body: JSON.stringify({ error: 'buscar vacío' }) };
        const url = `${AZ_BASE}/api/station/${STATION}/files/list?searchPhrase=${encodeURIComponent(texto)}`;
        const r = await httpFetch(url, { headers: azHeaders });
        if (!r.ok) {
          const detail = await r.text().catch(() => '');
          return { statusCode: 502, headers, body: JSON.stringify({ error: 'AzuraCast rechazó la búsqueda', detail }) };
        }
        const raw = await r.json().catch(() => []);
        const archivos = (Array.isArray(raw) ? raw : []).map(it => {
          const m = (it && it.media) || it || {};
          return {
            ruta:    it.path || it.path_short || m.path || '',
            titulo:  m.title  || '',
            artista: m.artist || '',
            album:   m.album  || '',
            art:     artPublica(m),
          };
        }).filter(a => a.ruta).slice(0, 20);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, archivos }) };
      }

      // GET ?leer= → tags actuales DENTRO del archivo (editor /leer)
      if (q.leer != null) {
        const ruta = String(q.leer);
        if (!rutaValida(ruta)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'ruta inválida' }) };
        const r = await httpFetch(`${EDITOR_BASE}/leer?ruta=${encodeURIComponent(ruta)}`, { headers: edHeaders });
        if (!r.ok) {
          const detail = await r.text().catch(() => '');
          return { statusCode: 502, headers, body: JSON.stringify({ error: 'El editor no pudo leer el archivo', detail }) };
        }
        const j = await r.json().catch(() => ({}));
        return { statusCode: 200, headers, body: JSON.stringify({
          ok: true,
          titulo:         j.titulo         || '',
          artista:        j.artista        || '',
          album:          j.album          || '',
          artista_album:  j.artista_album  || '',
        }) };
      }

      return { statusCode: 400, headers, body: JSON.stringify({ error: 'falta buscar o leer' }) };
    }

    // ───────────────────────── POST ─────────────────────────
    let body = {};
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

    const accion = (body && body.accion) ? String(body.accion) : '';
    const ruta = (body && body.ruta != null) ? String(body.ruta) : '';
    if (!rutaValida(ruta)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'ruta inválida' }) };

    // POST editar → escribe tags en el archivo
    if (accion === 'editar') {
      const payload = {
        ruta,
        titulo:        campo(body.titulo),
        artista:       campo(body.artista),
        album:         campo(body.album),
        artista_album: campo(body.artista_album),
      };
      const r = await httpFetch(`${EDITOR_BASE}/editar`, { method: 'POST', headers: edHeaders, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j || j.ok !== true) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: (j && j.error) || 'El editor no pudo guardar los tags' }) };
      }
      await azReprocess(ruta, azHeaders); // best-effort: que la radio lo refleje pronto
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // POST portada → escribe la carátula en el archivo
    if (accion === 'portada') {
      const mime = (body && body.mime) ? String(body.mime) : '';
      if (!MIME_OK[mime]) return { statusCode: 400, headers, body: JSON.stringify({ error: 'mime no permitido (jpeg/png)' }) };
      let imagen = (body && body.imagen != null) ? String(body.imagen) : '';
      imagen = imagen.replace(/\s/g, ''); // sin saltos de línea ni prefijo data:
      if (!imagen || !/^[A-Za-z0-9+/]+={0,2}$/.test(imagen)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'imagen base64 inválida' }) };
      }
      const bytes = Buffer.from(imagen, 'base64');
      if (!bytes.length) return { statusCode: 400, headers, body: JSON.stringify({ error: 'imagen vacía' }) };
      if (bytes.length > MAX_IMG_BYTES) return { statusCode: 400, headers, body: JSON.stringify({ error: 'la imagen supera 2MB' }) };

      const r = await httpFetch(`${EDITOR_BASE}/portada`, { method: 'POST', headers: edHeaders, body: JSON.stringify({ ruta, imagen, mime }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j || j.ok !== true) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: (j && j.error) || 'El editor no pudo guardar la portada' }) };
      }
      await azReprocess(ruta, azHeaders);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    const msg = (e && e.name === 'AbortError') ? 'El servicio no respondió (timeout)' : (e.message || 'Error');
    return { statusCode: 502, headers, body: JSON.stringify({ error: msg }) };
  }
};

// ----- helpers -----

function campo(v) { return (v == null) ? '' : String(v); }

// Ruta relativa segura: sin traversal, sin raíz absoluta, sin nulos.
function rutaValida(r) {
  if (typeof r !== 'string' || !r || r.length > 1024) return false;
  if (r.includes('..') || r.startsWith('/') || r.indexOf('\0') !== -1) return false;
  return true;
}

// Carátula pública (mismo criterio del fix 4c365ec): si `art` ya apunta al host
// público la usamos; si no, la reconstruimos desde el id/unique_id del media.
function artPublica(s) {
  const raw = (s && s.art) ? String(s.art) : '';
  if (raw && raw.indexOf(`${AZ_BASE}/`) === 0) return raw;
  const id = (s && (s.unique_id || s.id)) ? String(s.unique_id || s.id) : '';
  if (id) return PUBLIC_ART_PREFIX + encodeURIComponent(id);
  return '';
}

// Reprocesar el archivo en AzuraCast para que relea los tags/portada nuevos.
// Best-effort: cualquier fallo se traga (el guardado en el archivo ya ocurrió).
async function azReprocess(ruta, azHeaders) {
  try {
    await httpFetch(`${AZ_BASE}/api/station/${STATION}/files/batch`, {
      method: 'PUT',
      headers: { ...azHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ do: 'reprocess', files: [ruta] }),
    });
  } catch (e) { /* best-effort, ignorar */ }
}

// fetch con timeout duro de 8s (AbortController). Node 18+ en Netlify.
async function httpFetch(url, options) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...(options || {}), signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
