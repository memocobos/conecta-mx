exports.handler = async function(event) {
  const artist = event.queryStringParameters.q;
  if (!artist) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing q parameter' }) };
  }

  const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=1`;

  try {
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
      body: JSON.stringify({ error: 'Failed to reach Deezer API' })
    };
  }
};
