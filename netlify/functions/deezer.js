// Deezer proxy.
// Default:        /.netlify/functions/deezer?q=<artista>              → search artist (fotos)
// Track preview:  /.netlify/functions/deezer?q=<artista>&type=track   → {preview, title, artist}

function cleanQuery(raw) {
  return String(raw || '')
    .replace(/ - .*/i, '')
    .replace(/ en .*/i, '')
    .replace(/ tour\b.*/i, '')
    .replace(/ world\b.*/i, '')
    .replace(/ mexico.*/i, '')
    .trim();
}

exports.handler = async function(event) {
  const qs = event.queryStringParameters || {};
  const q = qs.q;
  if (!q) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing q parameter' }) };
  }

  const type = (qs.type || '').toLowerCase();

  try {
    // === Track preview mode ===
    if (type === 'track') {
      const query = cleanQuery(q);
      const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=10`;
      const res = await fetch(url);
      if (!res.ok) {
        return {
          statusCode: res.status,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Deezer search failed' })
        };
      }
      const data = await res.json();
      const items = (data && data.data) || [];
      const qLower = query.toLowerCase();
      let hit = items.find(t => t.preview && t.artist && (qLower.includes(t.artist.name.toLowerCase()) || t.artist.name.toLowerCase().includes(qLower)));
      if (!hit) hit = items.find(t => t.preview);

      if (!hit) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
          body: JSON.stringify({ preview: null })
        };
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        body: JSON.stringify({
          preview: hit.preview,
          preview_url: hit.preview,   // alias for client convenience
          title: hit.title,
          artist: hit.artist && hit.artist.name
        })
      };
    }

    // === Default: artist search (backward compat — usado por loadArtistImg) ===
    const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=1`;
    const response = await fetch(url);
    const data = await response.json();
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to reach Deezer API', details: err.message })
    };
  }
};
