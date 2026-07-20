// =============================================================================
// admin-radio-control  (Kaio-sama Fase 3 — control remoto de Radio Conecta)
//
// Habla directo con AzuraCast (https://radio.conectareynosa.mx) usando la API
// key de admin (X-API-Key). Solo lo usa el módulo Kaio-sama en Kamehouse
// (maestro_roshi). Ninguna de estas acciones toca Supabase.
//
//   GET  ?accion=cola     → GET  /api/station/1/queue → { ok:true, cola:[...] } (máx 10)
//   POST { accion:"saltar"   } → POST /api/station/1/backend/skip → { ok:true }
//   POST { accion:"recargar"  } → POST /api/station/1/reload       → { ok:true }
//   POST { accion:"reiniciar" } → POST /api/station/1/restart      → { ok:true }
//
// Seguridad: MISMO patrón que admin-radio-peticiones (corregido en #253) —
// distingue "cross-origin real" (Origin presente y no permitido → 403) de
// "same-origin sin header Origin" (GET de kamehouse); el JWT (verifyAdminAuth,
// solo maestro_roshi) es el candado real.
//
// Variables de entorno: AZURACAST_API_KEY, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const AZ_BASE   = 'https://radio.conectareynosa.mx';
const STATION   = '1';
const TIMEOUT_MS = 8000;

// accion POST → { method, path } en AzuraCast. Whitelist estricta.
const ACCIONES_POST = {
  saltar:    { path: `/api/station/${STATION}/backend/skip` },
  recargar:  { path: `/api/station/${STATION}/reload` },
  reiniciar: { path: `/api/station/${STATION}/restart` },
};

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
  // Bloquear SOLO cuando vino un Origin y no está permitido (cross-origin real).
  if (__rawOrigin && !__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const API_KEY = process.env.AZURACAST_API_KEY;
  if (!API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta env var AZURACAST_API_KEY' }) };

  const azHeaders = { 'X-API-Key': API_KEY, Accept: 'application/json' };

  try {
    // ---- GET ?accion=cola ----
    if (event.httpMethod === 'GET') {
      const accion = (event.queryStringParameters && event.queryStringParameters.accion) || '';
      if (accion !== 'cola') return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };

      const r = await azFetch(`${AZ_BASE}/api/station/${STATION}/queue`, { headers: azHeaders });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'AzuraCast rechazó la cola', detail }) };
      }
      const raw = await r.json().catch(() => []);
      // AzuraCast devuelve los datos bajo item.song; algunas versiones los
      // aplanan al nivel del item. Aceptamos ambas formas.
      const cola = (Array.isArray(raw) ? raw : []).slice(0, 10).map(item => {
        const s = (item && item.song) || item || {};
        return {
          titulo:  s.title  || '',
          artista: s.artist || '',
          caratula: s.art   || '',
        };
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, cola }) };
    }

    // ---- POST { accion } ----
    let body = {};
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

    const accion = (body && body.accion) ? String(body.accion) : '';
    const spec = ACCIONES_POST[accion];
    if (!spec) return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };

    const r = await azFetch(`${AZ_BASE}${spec.path}`, { method: 'POST', headers: azHeaders });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'AzuraCast rechazó la acción', detail }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    const msg = (e && e.name === 'AbortError') ? 'AzuraCast no respondió (timeout)' : (e.message || 'Error');
    return { statusCode: 502, headers, body: JSON.stringify({ error: msg }) };
  }
};

// ----- helpers -----

// fetch con timeout duro de 8s (AbortController). Node 18+ (fetch/AbortController globales en Netlify).
async function azFetch(url, options) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
