// =============================================================================
// admin-radio-stats  (Kaio-sama — estadísticas de Radio Conecta)
//
// Números que el RPC público no da. El RPC radio_top_semana() regresa solo 10
// (NO se toca): aquí se consulta radio_likes DIRECTO con service_role y se
// agrega en la function.
//
//   GET ?accion=top20 → { ok:true, top:[{song_id,titulo,artista,art,likes}] }
//     Filas de los últimos 7 días, agregadas por song_id (count + titulo/artista/
//     art del registro MÁS RECIENTE), orden likes desc, máx 20. Para monitorear
//     el Top 10 público Y las 10 siguientes (11-20).
//
// Seguridad: mismo patrón que admin-radio-peticiones — origin crudo (GET
// same-origin sin header Origin pasa; cross-origin no permitido se bloquea) +
// verifyAdminAuth (solo maestro_roshi). Supabase PORTAL service_role.
//
// Columnas radio_likes (verificadas contra la base): id, song_id, titulo,
// artista, art, creado (timestamptz).
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const DIAS = 7;
const TOP_N = 20;

exports.handler = async (event) => {
  // Origin CRUDO: un GET same-origin no manda Origin → no se bloquea; el JWT es
  // el candado real. Cross-origin no permitido (Origin presente sin match) → 403.
  const __rawOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (s, b) => ({ statusCode: s, headers, body: JSON.stringify(b) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  if (__rawOrigin && !__origin) return json(403, { error: 'Origen no permitido' });

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) return json(auth.status, { error: auth.error });

  const env = readEnv();
  if (env.error) return json(500, { error: env.error });

  const accion = (event.queryStringParameters && event.queryStringParameters.accion) || '';
  if (accion !== 'top20') return json(400, { error: 'accion inválida (usa ?accion=top20)' });

  const sbHeaders = { apikey: env.PORTAL_SB_SERVICE, Authorization: `Bearer ${env.PORTAL_SB_SERVICE}` };

  try {
    // Likes de los últimos 7 días, más recientes primero (así el PRIMER registro
    // visto de cada song_id trae la metadata más fresca).
    const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString();
    const url = `${env.PORTAL_SB_URL}/rest/v1/radio_likes?select=song_id,titulo,artista,art&creado=gte.${encodeURIComponent(desde)}&order=creado.desc&limit=10000`;
    const r = await fetch(url, { headers: sbHeaders });
    if (!r.ok) return json(502, { error: 'Supabase rechazó la consulta', detail: await r.text() });
    const rows = await r.json();

    // Agregar por song_id en la function (el RPC público solo da 10; no se toca).
    const porSong = {};
    for (const row of (Array.isArray(rows) ? rows : [])) {
      const sid = row && row.song_id ? String(row.song_id) : '';
      if (!sid) continue;
      if (!porSong[sid]) {
        porSong[sid] = {
          song_id: sid,
          titulo: row.titulo || '',
          artista: row.artista || '',
          art: row.art || '',   // metadata del registro más reciente (orden desc)
          likes: 0,
        };
      }
      porSong[sid].likes += 1;
    }
    const top = Object.values(porSong)
      .sort((a, b) => b.likes - a.likes)
      .slice(0, TOP_N);

    return json(200, { ok: true, top });
  } catch (e) {
    return json(502, { error: 'Error consultando likes', detail: e.message });
  }
};

function readEnv() {
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
