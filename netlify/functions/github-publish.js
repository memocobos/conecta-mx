const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

exports.handler = async (event) => {
  // ─── Origin + Admin auth (Stop the Bleed) ───
  // CRÍTICO: este endpoint escribe directamente al repo de GitHub con
  // GITHUB_TOKEN. Sin gate, cualquiera con curl podía modificar precios
  // o status de eventos. Solo maestro_roshi por restricción máxima.
  const __origin = corsCheck(event);
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': __origin || 'null',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Vary': 'Origin',
      },
      body: '',
    };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  if (!__origin) return { statusCode: 403, body: JSON.stringify({ ok: false, error: 'Origen no permitido' }) };
  const __auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!__auth.valid) return { statusCode: __auth.status, body: JSON.stringify({ ok: false, error: __auth.error }) };

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = 'memocobos/conecta-mx';
  const FILE = 'index.html';

  try {
    const { eventoId, zonas, cheapZonas, status } = JSON.parse(event.body);

    // 1. Get current file
    const fileRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    const fileData = await fileRes.json();
    const sha = fileData.sha;
    const cleanContent = fileData.content.replace(/\n/g, ''); let content = Buffer.from(cleanContent, 'base64').toString('utf8');

    // 2. Find the event by id and update zonas + status
    // Replace zonas prices for this event
    const zonasStr = zonas.map(z => `{n:'${z.n}',p:${z.p}${z.ag?',ag:1':''}${z.vip?',vip:1':''}}`).join(',');
    const cheapStr = cheapZonas.map(z => `{n:'${z.n}',p:${z.p}}`).join(',');

    // Find event block by id and update
    const evRegex = new RegExp(`(id:'${eventoId}'[^}]*?st:')[^']*(')`,'s');
    if(status && evRegex.test(content)){
      content = content.replace(evRegex, `$1${status}$2`);
    }

    // Update zonas — find pattern zonas:[...] near the event id
    const zonasRegex = new RegExp(
      `(id:'${eventoId}'(?:[^]*?)zonas:\\[)([^\\]]*)(\\])`,
      's'
    );
    if(zonasRegex.test(content)){
      content = content.replace(zonasRegex, `$1${zonasStr}$3`);
    }

    // Update cheapZonas
    const cheapRegex = new RegExp(
      `(id:'${eventoId}'(?:[^]*?)cheapZonas:\\[)([^\\]]*)(\\])`,
      's'
    );
    if(cheapRegex.test(content)){
      content = content.replace(cheapRegex, `$1${cheapStr}$3`);
    }

    // 3. Push updated file
    const encoded = Buffer.from(content).toString('base64');
    const pushRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Cotizador: publica precios evento ${eventoId}`,
        content: encoded,
        sha
      })
    });

    const pushData = await pushRes.json();
    if(pushData.commit){
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, commit: pushData.commit.sha.slice(0,7) })
      };
    } else {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: pushData.message }) };
    }

  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
