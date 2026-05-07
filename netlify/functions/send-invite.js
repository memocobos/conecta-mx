exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST', 'Content-Type': 'application/json' };
  
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };

  const RESEND_KEY = process.env.RESEND_KEY;
  if (!RESEND_KEY) return { statusCode: 500, headers, body: '{"error":"RESEND_KEY not configured in Netlify"}' };

  try {
    const { to, subject, html } = JSON.parse(event.body);
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Kamehouse <noreply@conectareynosa.mx>', to: Array.isArray(to) ? to : [to], subject, html })
    });
    const data = await resp.json();
    return { statusCode: resp.ok ? 200 : resp.status, headers, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
