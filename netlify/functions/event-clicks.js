// Migrado al proyecto KameHouse (npgnhsmwpcipxgvfxrho): event_clicks y la RPC
// increment_event_click ya viven ahi con firmas identicas y datos migrados.
// Patron de la casa: llaves canonicas KAMEHOUSE (sin fallbacks).
const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
const KH_SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

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

  if (!KH_SB_URL || !KH_SB_KEY) {
    console.error('Missing SUPABASE_URL_KAMEHOUSE or SUPABASE_SERVICE_KEY_KAMEHOUSE env vars');
    return jsonRes(500, { error: 'Server not configured' });
  }

  const headers = {
    apikey: KH_SB_KEY,
    Authorization: `Bearer ${KH_SB_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    if (event.httpMethod === 'POST') {
      const { eventId, eventName } = JSON.parse(event.body || '{}');
      if (!eventId) return jsonRes(400, { error: 'Missing eventId' });

      const rpcRes = await fetch(`${KH_SB_URL}/rest/v1/rpc/increment_event_click`, {
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
      const url = `${KH_SB_URL}/rest/v1/event_clicks?select=event_id,event_name,clicks,updated_at&order=clicks.desc&limit=10`;
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
