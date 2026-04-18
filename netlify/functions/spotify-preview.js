// Spotify preview proxy — mantiene el Client Secret en el servidor.
// Endpoint: /.netlify/functions/spotify-preview?q=<artista>
// Devuelve { preview_url, name, artists } o { preview_url: null } si no hay.

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '62e53b0844094729992184f69d0ad1d6';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '3aae0679ecf945eb9bf598fe9c78377b';

// Cache de token en memoria del contenedor (Spotify tokens duran 1h).
let _tokenCache = { value: null, exp: 0 };

async function getToken() {
  if (_tokenCache.value && Date.now() < _tokenCache.exp) return _tokenCache.value;
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`token ${res.status}: ${txt}`);
  }
  const data = await res.json();
  _tokenCache = {
    value: data.access_token,
    exp: Date.now() + (data.expires_in - 60) * 1000
  };
  return _tokenCache.value;
}

function cleanQuery(raw) {
  // "Rosalía - Lux Tour" → "Rosalía"
  // "J Balvin en Monterrey" → "J Balvin"
  return String(raw || '')
    .replace(/ - .*/i, '')
    .replace(/ en .*/i, '')
    .replace(/ tour\b.*/i, '')
    .replace(/ world\b.*/i, '')
    .replace(/ mexico.*/i, '')
    .trim();
}

exports.handler = async (event) => {
  const raw = event.queryStringParameters?.q || '';
  const q = cleanQuery(raw);
  if (!q) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing q' })
    };
  }

  try {
    const token = await getToken();
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10&market=MX`;
    const res = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const txt = await res.text();
      return {
        statusCode: res.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'search failed', details: txt })
      };
    }
    const data = await res.json();
    const tracks = (data && data.tracks && data.tracks.items) || [];
    // Preferir el primer track con preview_url que matchee loosely al artista buscado
    const qLower = q.toLowerCase();
    let hit = tracks.find(t => t.preview_url && (t.artists || []).some(a => qLower.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(qLower)));
    if (!hit) hit = tracks.find(t => t.preview_url);

    if (!hit) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        body: JSON.stringify({ preview_url: null })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({
        preview_url: hit.preview_url,
        name: hit.name,
        artists: (hit.artists || []).map(a => a.name).join(', ')
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
