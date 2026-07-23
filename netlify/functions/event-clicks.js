// Migrado al proyecto KameHouse (npgnhsmwpcipxgvfxrho): event_clicks y la RPC
// increment_event_click ya viven ahi con firmas identicas y datos migrados.
// Patron de la casa: env KAMEHOUSE primero, fallback a las variables viejas.
const SUPABASE_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function jsonRes(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY env vars');
    return jsonRes(500, { error: 'Server not configured' });
  }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    if (event.httpMethod === 'POST') {
      const { eventId, eventName } = JSON.parse(event.body || '{}');
      if (!eventId) return jsonRes(400, { error: 'Missing eventId' });

      const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_event_click`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_event_id: eventId, p_event_name: eventName || eventId })
      });

      if (!rpcRes.ok) {
        const details = await rpcRes.text();
        console.error('Supabase RPC error:', details);
        return jsonRes(500, { error: 'RPC failed', details });
      }

      return jsonRes(200, { success: true });
    }

    if (event.httpMethod === 'GET') {
      const url = `${SUPABASE_URL}/rest/v1/event_clicks?select=event_id,event_name,clicks,updated_at&order=clicks.desc&limit=10`;
      const listRes = await fetch(url, { headers });
      if (!listRes.ok) {
        const details = await listRes.text();
        console.error('Supabase GET error:', details);
        return jsonRes(500, { error: 'GET failed', details });
      }
      const data = await listRes.json();
      return jsonRes(200, { top: data });
    }

    return jsonRes(405, { error: 'Method Not Allowed' });
  } catch (err) {
    console.error('event-clicks handler error:', err);
    return jsonRes(500, { error: err.message });
  }
};
