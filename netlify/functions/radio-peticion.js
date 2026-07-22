// =============================================================================
// radio-peticion  (Radio v3 — peticiones de canción)
//
// Endpoint PÚBLICO de la página /radio. Conexión directa al Supabase del PORTAL
// con service_role (mismo patrón que radio-muro / portal-mis-lugares).
//
//   POST { nombre, peticion } → inserta en radio_peticiones y responde { ok:true }
//     valida: peticion 1-120 chars (requerida); nombre máx 30 (puede ir vacío).
//     Si no cumple → 400 { ok:false, error }.
//   GET → { ok:true, atendidas:[{nombre,peticion}] } — últimas 8 ATENDIDAS
//     (atendida=true), creado desc. SOLO nombre + peticion. Mismo endpoint público.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

const SB_URL     = process.env.PORTAL_SUPABASE_URL;
const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;

const MAX_NOMBRE   = 30;
const MAX_PETICION = 120;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  const json = (statusCode, payload) => ({ statusCode, headers, body: JSON.stringify(payload) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (!SB_URL || !SB_SERVICE) return json(500, { ok: false, error: 'Portal Supabase no configurado' });

  const sbAuth = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE };

  // GET → últimas 8 ATENDIDAS (solo nombre + peticion), creado desc. Público, igual que el POST.
  if (event.httpMethod === 'GET') {
    try {
      const url = `${SB_URL}/rest/v1/radio_peticiones?atendida=eq.true&select=nombre,peticion&order=creado.desc&limit=8`;
      const r = await fetch(url, { headers: sbAuth });
      if (!r.ok) return json(502, { ok: false, error: 'No se pudieron leer las peticiones', detail: await r.text() });
      const rows = await r.json();
      const atendidas = (Array.isArray(rows) ? rows : []).map((p) => ({
        nombre:   (p && p.nombre)   ? String(p.nombre)   : '',
        peticion: (p && p.peticion) ? String(p.peticion) : '',
      }));
      return json(200, { ok: true, atendidas });
    } catch (e) {
      return json(502, { ok: false, error: 'Error leyendo las peticiones', detail: e.message });
    }
  }

  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { ok: false, error: 'JSON inválido' }); }

  const nombre   = (body && body.nombre   != null) ? String(body.nombre).trim()   : '';
  const peticion = (body && body.peticion != null) ? String(body.peticion).trim() : '';

  if (peticion.length < 1 || peticion.length > MAX_PETICION) {
    return json(400, { ok: false, error: `La petición debe tener entre 1 y ${MAX_PETICION} caracteres` });
  }
  if (nombre.length > MAX_NOMBRE) {
    return json(400, { ok: false, error: `El nombre no puede pasar de ${MAX_NOMBRE} caracteres` });
  }

  const sbHeaders = {
    apikey: SB_SERVICE,
    Authorization: 'Bearer ' + SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    const ins = await fetch(`${SB_URL}/rest/v1/radio_peticiones`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ nombre, peticion }),
    });
    if (!ins.ok) return json(502, { ok: false, error: 'No se pudo enviar', detail: await ins.text() });
    return json(200, { ok: true });
  } catch (e) {
    return json(502, { ok: false, error: 'Error enviando la petición', detail: e.message });
  }
};
