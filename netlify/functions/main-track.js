// =============================================================================
// main-track
// POST endpoint anónimo para tracking del sitio principal (conectareynosa.mx).
// Rate-limit: 200 eventos/h por session_id (el doble que /rol porque el main
// genera más interacciones por sesión).
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
      `${SB_URL}/rest/v1/main_eventos_uso?session_id=eq.${encodeURIComponent(sessionId)}&created_at=gte.${encodeURIComponent(since)}&select=id`,
      { method: 'HEAD', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=exact' } }
    );
    const total = parseInt((r.headers.get('content-range') || '*/0').split('/')[1] || '0', 10);
    if (total >= 200) return { statusCode: 429, headers, body: JSON.stringify({ error: 'rate_limited' }) };
  } catch (e) { /* no bloqueamos por fallo del rate-limit */ }

  const clip = (v, max = 200) => v == null ? null : String(v).slice(0, max);
  const num  = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  const bool = (v) => v === true || v === false ? v : null;
  const userAgent = (event.headers['user-agent'] || event.headers['User-Agent'] || '').slice(0, 300);

  const row = {
    session_id:     sessionId,
    accion,
    evento_id:      clip(body.evento_id, 80),
    evento_nombre:  clip(body.evento_nombre, 200),
    paquete:        clip(body.paquete, 16),
    zona:           clip(body.zona, 120),
    precio_zona:    num(body.precio_zona),
    habitacion:     clip(body.habitacion, 40),
    transporte:     clip(body.transporte, 40),
    precio_total:   num(body.precio_total),
    paso_wizard:    clip(body.paso_wizard, 30),
    codigo_aplicado: clip(body.codigo_aplicado, 24),
    codigo_valido:  bool(body.codigo_valido),
    filtro_usado:   clip(body.filtro_usado, 30),
    origen_trafico: clip(body.origen_trafico, 30),
    device:         clip(body.device, 16),
    user_agent:     userAgent || null,
    pathname:       clip(body.pathname, 200),
    referrer:       clip(body.referrer, 300),
  };

  try {
    const r = await fetch(`${SB_URL}/rest/v1/main_eventos_uso`, {
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
