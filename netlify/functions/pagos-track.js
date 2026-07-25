// =============================================================================
// pagos-track
// POST endpoint anónimo para tracking de /pagos. Estructura más simple que
// main-track porque la página tiene muy pocas interacciones (copiar cuenta,
// click WhatsApp). Rate-limit: 50 eventos/hora por session_id.
// =============================================================================

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!SB_URL || !SB_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'env vars no configuradas' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const sessionId = String(body.session_id || '').slice(0, 64);
  const accion = String(body.accion || '').slice(0, 60);
  if (!sessionId || !accion || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'session_id/accion inválidos' }) };
  }

  // Rate limit
  try {
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const r = await fetch(
      `${SB_URL}/rest/v1/pagos_eventos_uso?session_id=eq.${encodeURIComponent(sessionId)}&created_at=gte.${encodeURIComponent(since)}&select=id`,
      { method: 'HEAD', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=exact' } }
    );
    const total = parseInt((r.headers.get('content-range') || '*/0').split('/')[1] || '0', 10);
    if (total >= 50) return { statusCode: 429, headers, body: JSON.stringify({ error: 'rate_limited' }) };
  } catch (e) {}

  const clip = (v, max = 200) => v == null ? null : String(v).slice(0, max);
  const userAgent = (event.headers['user-agent'] || event.headers['User-Agent'] || '').slice(0, 300);

  const row = {
    session_id:     sessionId,
    accion,
    cuenta_copiada: clip(body.cuenta_copiada, 40),
    origen:         clip(body.origen, 80),
    device:         clip(body.device, 16),
    user_agent:     userAgent || null,
    referrer:       clip(body.referrer, 300),
  };

  try {
    const r = await fetch(`${SB_URL}/rest/v1/pagos_eventos_uso`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'insert_failed', detail: txt.slice(0, 200) }) };
    }
    return { statusCode: 204, headers, body: '' };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'network', detail: e.message }) };
  }
};
