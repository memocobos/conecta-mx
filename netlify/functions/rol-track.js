// =============================================================================
// rol-track
//
// Endpoint público de tracking anónimo para /rol. Recibe un evento desde el
// frontend e inserta una fila en rol_eventos_uso.
//
// Rate-limit: máximo 100 eventos por session_id por hora. Si se excede, devuelve
// 429 silenciosamente y el frontend no muestra error (es analytics, no flujo).
//
// Privacidad: NO persiste IP, email, ni nombres. Solo lo que el cliente manda
// + user_agent + pathname.
//
// Variables de entorno requeridas (proyecto Kamehouse).
// Aceptamos varias convenciones porque el repo tiene un mosaico:
//   URL: SUPABASE_URL_KAMEHOUSE → SUPABASE_URL
//   KEY: SUPABASE_SERVICE_KEY_KAMEHOUSE → SUPABASE_SERVICE_KEY → SUPABASE_SERVICE_ROLE_KEY
// Mismo patrón que chat.js, rol-recordatorios.js y otras Functions del repo.
// =============================================================================

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE
              || process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
              || process.env.SUPABASE_SERVICE_KEY
              || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_URL || !SB_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({
      error: 'env vars no configuradas',
      hint: 'Define SUPABASE_URL (o SUPABASE_URL_KAMEHOUSE) y SUPABASE_SERVICE_KEY (o variantes) en Netlify.'
    }) };
  }

  // ---- Parse y validación mínima ----
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const sessionId = String(body.session_id || '').slice(0, 64);
  const accion = String(body.accion || '').slice(0, 60);
  if (!sessionId || !accion) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'session_id y accion requeridos' }) };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'session_id inválido' }) };
  }

  // ---- Rate-limit: count en la última hora para este session_id ----
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const countResp = await fetch(
      `${SB_URL}/rest/v1/rol_eventos_uso?session_id=eq.${encodeURIComponent(sessionId)}&created_at=gte.${encodeURIComponent(since)}&select=id`,
      {
        method: 'HEAD',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          Prefer: 'count=exact',
        },
      }
    );
    const cr = countResp.headers.get('content-range') || '*/0';
    const total = parseInt(cr.split('/')[1] || '0', 10);
    if (total >= 100) {
      // No es error del cliente, es flood — respondemos 429 sin detalle.
      return { statusCode: 429, headers, body: JSON.stringify({ error: 'rate_limited' }) };
    }
  } catch (e) {
    // Si el count falla, no bloqueamos el insert — preferimos perder el rate-limit
    // a perder analytics. Loggeamos en cloudwatch.
    console.warn('[rol-track] rate-limit check falló', e.message);
  }

  // ---- Sanitizar payload (whitelist de columnas + truncar texto) ----
  const clip = (v, max = 200) => v == null ? null : String(v).slice(0, max);
  const num = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const userAgent = (event.headers['user-agent'] || event.headers['User-Agent'] || '').slice(0, 300);

  const row = {
    session_id:    sessionId,
    accion,
    evento_id:     clip(body.evento_id, 80),
    evento_nombre: clip(body.evento_nombre, 200),
    paquete:       clip(body.paquete, 16),
    zona:          clip(body.zona, 120),
    precio_zona:   num(body.precio_zona),
    habitacion:    clip(body.habitacion, 40),
    transporte:    clip(body.transporte, 40),
    precio_total:  num(body.precio_total),
    tipo_compra:   clip(body.tipo_compra, 24),
    user_agent:    userAgent || null,
    pathname:      clip(body.pathname, 200),
  };

  // ---- Insert ----
  try {
    const insResp = await fetch(`${SB_URL}/rest/v1/rol_eventos_uso`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!insResp.ok) {
      const txt = await insResp.text().catch(() => '');
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'insert_failed', detail: txt.slice(0, 200) }) };
    }
    return { statusCode: 204, headers, body: '' };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'network', detail: e.message }) };
  }
};
