// =============================================================================
// radio-cartelera  (RADIO-V2a · 24-oct-2026 — la parrilla pública)
//
// Endpoint PÚBLICO de la página /radio: la cartelera de programas + qué está
// al aire AHORA y qué sigue, calculado en hora de REYNOSA por el dueño
// (_lib/radio-cartelera — huso derivado, jamás tecleado).
//
//   GET → { ok:true, al_aire, siguiente, semanales:[...], especiales:[...] }
//
// 🔒 UN CERO ES UNA AFIRMACIÓN: si la tabla no se puede leer contesta 502 con
// ok:false y `no-store` — un 200 con parrilla vacía diría «no hay programas»
// el día que la base tosa, y la página pintaría una mentira.
// Cache de CDN cuando SÍ se pudo: la portada de la radio pide esto en cada
// visita y la parrilla cambia poco (s-maxage 120 + stale-while-revalidate).
// Guard de origen estilo #253 (solo bloquea un Origin cross-origin no
// permitido; el GET same-origin de /radio pasa).
// =============================================================================

const { corsCheck } = require('./_lib/verify-admin');
const { alAireYSiguiente, parrilla } = require('./_lib/radio-cartelera');

exports.handler = async (event) => {
  const __rawOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  if (__rawOrigin && !__origin) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Origen no permitido' }) };

  const URL_ = process.env.SUPABASE_URL_KAMEHOUSE, KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!URL_ || !KEY) {
    return { statusCode: 500, headers: { ...headers, 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok: false, error: 'Faltan env vars' }) };
  }
  try {
    const r = await fetch(`${URL_}/rest/v1/radio_programas?archivado=is.false&select=id,nombre,descripcion,conductor,dia_semana,fecha,hora_inicio,hora_fin,color,activo,archivado&limit=500`,
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    if (!r.ok) throw new Error('Supabase ' + r.status);
    const programas = await r.json();
    const ahora = Date.now();
    const { al_aire, siguiente } = alAireYSiguiente(programas, ahora);
    const { semanales, especiales } = parrilla(programas, ahora, 14);
    return { statusCode: 200,
      headers: { ...headers, 'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=300' },
      body: JSON.stringify({ ok: true, al_aire, siguiente, semanales, especiales }) };
  } catch (e) {
    return { statusCode: 502, headers: { ...headers, 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: 'No se pudo leer la cartelera: ' + e.message }) };
  }
};
