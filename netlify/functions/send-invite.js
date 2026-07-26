const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

exports.handler = async (event) => {
  // ─── Origin + Admin auth (Stop the Bleed) ───
  // CRÍTICO: este endpoint envía emails desde noreply@conectareynosa.mx.
  // Sin gate, cualquiera podía hacer phishing usando el dominio oficial.
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };
  if (!__origin) return { statusCode: 403, headers, body: '{"error":"Origen no permitido"}' };
  const __auth = await verifyAdminAuthLive(event, ['maestro_roshi','bulma']);
  if (!__auth.valid) return { statusCode: __auth.status, headers, body: JSON.stringify({ error: __auth.error }) };

  const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return { statusCode: 500, headers, body: '{"error":"RESEND_KEY not configured in Netlify"}' };

  try {
    const { to, subject, html } = JSON.parse(event.body);
    const __mp = aplicarModoPrueba({ to: Array.isArray(to) ? to : [to], subject });
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Kamehouse <noreply@conectareynosa.mx>', to: __mp.to, subject: __mp.subject, html })
    });
    const data = await resp.json();
    return { statusCode: resp.ok ? 200 : resp.status, headers, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
