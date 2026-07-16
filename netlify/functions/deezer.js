// Deezer proxy.
// Default:        /.netlify/functions/deezer?q=<artista>                  → search artist (fotos)
// Track preview:  /.netlify/functions/deezer?q=<artista>&type=track       → {preview, title, artist}
// Track by id:    /.netlify/functions/deezer?id=<track_id>                → {preview, title, artist}
// Track list:     /.netlify/functions/deezer?q=<artista>&type=tracklist   → {results:[{id,title,artist,album,cover,preview}]}

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
  const trackId = qs.id;

  // === Track by id mode (exact track, no search) ===
  if (trackId && /^\d+$/.test(trackId)) {
    try {
      const url = `https://api.deezer.com/track/${trackId}`;
      const res = await fetch(url);
      if (!res.ok) {
        return { statusCode: res.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Deezer track fetch failed' }) };
      }
      const t = await res.json();
      // No shared/CDN cache: Deezer signed `preview` URLs expire in ~15-30 min,
      // pero el JSON queda guardado 24h en Netlify Edge → MP3 muerto al reproducir.
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' },
        body: JSON.stringify({
          preview: t.preview || null,
          preview_url: t.preview || null,
          title: t.title,
          artist: t.artist && t.artist.name
        })
      };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to reach Deezer API', details: err.message }) };
    }
  }

  if (!q) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing q or id parameter' }) };
  }

  const type = (qs.type || '').toLowerCase();

  try {
    // === Track list mode (buscador de música del panel — elegir una pista) ===
    if (type === 'tracklist') {
      const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=8`;
      const res = await fetch(url);
      if (!res.ok) {
        return { statusCode: res.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Deezer search failed' }) };
      }
      const data = await res.json();
      const results = ((data && data.data) || []).slice(0, 8).map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist && t.artist.name,
        album: t.album && t.album.title,
        cover: t.album && t.album.cover_small,
        preview: t.preview || null,
      }));
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' },
        body: JSON.stringify({ results }),
      };
    }

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
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' },
          body: JSON.stringify({ preview: null })
        };
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' },
        body: JSON.stringify({
          preview: hit.preview,
          preview_url: hit.preview,   // alias for client convenience
          title: hit.title,
          artist: hit.artist && hit.artist.name
        })
      };
    }

    // === Default: artist search (backward compat — usado por loadArtistImg) ===
    // Deezer NO ordena por popularidad y su match es DIFUSO, así que con limit=1 el
    // primer resultado suele ser el artista equivocado. Se piden varios y se elige:
    //   1) entre los de NOMBRE EXACTO (sin acentos/mayúsculas) con foto real, el más
    //      seguido — esto evita dos trampas a la vez: el homónimo oscuro (buscar
    //      "Rosalia" traía "Rosal-IA" de 49 fans en vez de ROSALÍA de 1M) y el
    //      parecido difuso (buscar "Aitana" traía "Ariana Grande" de 13M por letras
    //      similares, tapando a la Aitana real).
    //   2) si nadie coincide exacto, el más seguido con foto real (mejor esfuerzo).
    //   3) si nadie tiene foto, el orden de Deezer (data[0]) para no romper el
    //      fallback del front (AudioDB/iniciales).
    const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=15`;
    const response = await fetch(url);
    const data = await response.json();
    const lista = (data && Array.isArray(data.data)) ? data.data : [];
    const PLACEHOLDER = 'd41d8cd98f00b204e9800998ecf8427e'; // MD5 del string vacío = foto ausente
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const qn = norm(q);
    const conFoto = lista.filter(a => a && a.picture_xl && a.picture_xl.indexOf(PLACEHOLDER) === -1);
    const exactos = conFoto.filter(a => norm(a.name) === qn);
    const pool = exactos.length ? exactos : conFoto;
    const mejor = pool.slice().sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0))[0];
    const salida = mejor
      ? { data: [mejor, ...lista.filter(a => a !== mejor)], total: data.total }
      : data;
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(salida)
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to reach Deezer API', details: err.message })
    };
  }
};
