// =============================================================================
// admin-vendidos-evento.js — Lectora de VENDIDOS desde el Portal (Capa 2 del
// Palacio de Kamisama, Tuerca 2a). READ-ONLY total: solo SELECT.
//
// La fuente de "vendidos" es `solicitudes_tour` del proyecto PORTAL
// (Supabase conecta-portal), NO el KH legacy donde viven compras/abonos.
// Copia la forma de conexión de admin-solicitudes-list.js (env vars del Portal).
//
// Conservador para no sobrevender: cuentan los estados pendiente + en_pagos +
// pagado; solo `cancelado` libera el boleto (se excluye).
//
// Body JSON: { evento_id }  (slug del evento, igual que el inventario)
// Respuesta: { ok:true, evento_id, vendidos:{ "<zona>": <suma num_personas> }, total }
//
// Auth: SOLO maestro_roshi (el Palacio es de él).
// Env vars (Portal): PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY. + JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const EVENTO_RE = /^[A-Za-z0-9_.#-]+$/;            // slug del EV (id del array)
const ESTADOS_CUENTAN = ['pendiente', 'en_pagos', 'pagado']; // cancelado libera

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const evento_id = String(body.evento_id || '').trim();
  if (!evento_id || !EVENTO_RE.test(evento_id) || evento_id.length > 120) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
  }

  let solicitudes;
  try {
    const params = new URLSearchParams();
    params.set('select', 'zona,num_personas,estado');
    params.append('evento_id', `eq.${evento_id}`);
    params.append('estado', `in.(${ESTADOS_CUENTAN.join(',')})`); // excluye cancelado
    params.set('limit', '10000');
    const url = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?${params.toString()}`;
    const r = await fetch(url, {
      headers: {
        apikey: env.PORTAL_SB_SERVICE,
        Authorization: `Bearer ${env.PORTAL_SB_SERVICE}`,
      },
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la query', detail }) };
    }
    solicitudes = await r.json();
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando Supabase', detail: e.message }) };
  }

  // Agrupa por zona y suma num_personas.
  const vendidos = {};
  let total = 0;
  for (const s of (Array.isArray(solicitudes) ? solicitudes : [])) {
    const zona = (s && s.zona != null) ? String(s.zona) : '';
    if (!zona) continue;
    const n = parseInt(s.num_personas, 10);
    if (!Number.isInteger(n) || n <= 0) continue;
    vendidos[zona] = (vendidos[zona] || 0) + n;
    total += n;
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, evento_id, vendidos, total }) };
};

// ----- helpers -----

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
