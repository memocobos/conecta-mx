// =============================================================================
// admin-recalcular-pagos-posposicion  (Módulo Posponer — Fase 3)
//
// Tras posponer, el admin dispara este recálculo. Mueve SOLO las cuotas en estado
// 'pendiente' (el cron marcar-vencidos-diario garantiza que esas son las
// no-vencidas-no-pagadas) de las solicitudes ACTIVAS del evento, sumándoles el
// mismo offset de días que se movió el evento. NO toca pagados ni vencidos, NO
// cambia montos. Idempotente vía el flag `pagos_recalculados` de la bitácora.
// Cruza KH (bitácora) + Portal (solicitudes/pagos). Solo escribe pagos.fecha_esperada
// del Portal y el flag en KH.
//
// Body JSON: { slug }
//
// Seguridad/molde de admin-avisar-posposicion: corsCheck + verifyAdminAuth(['maestro_roshi']).
//
// Env vars:
//   - KH:     SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE  (bitácora)
//   - Portal: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY        (solicitudes/pagos)
//   (No usa Resend.)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const slug = (body && typeof body.slug === 'string') ? body.slug.trim().toLowerCase() : '';
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El slug es requerido' }) };

  const khHeaders     = { apikey: env.KH_KEY,     Authorization: `Bearer ${env.KH_KEY}`,     'Content-Type': 'application/json' };
  const portalHeaders = { apikey: env.PORTAL_KEY, Authorization: `Bearer ${env.PORTAL_KEY}`, 'Content-Type': 'application/json' };

  // Marca la posposición como ya-recalculada (idempotencia). Se llama SIEMPRE tras
  // intentar mover los pagos: el flag previene el doble-movimiento aunque haya fallidos.
  async function marcarRecalculada(posId) {
    await fetch(`${env.KH_URL}/rest/v1/eventos_posposiciones?id=eq.${encodeURIComponent(posId)}`, {
      method: 'PATCH',
      headers: { ...khHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ pagos_recalculados: new Date().toISOString() }),
    }).catch(() => {});
  }

  try {
    // 1. KH: última posposición del evento.
    const posRes = await fetch(
      `${env.KH_URL}/rest/v1/eventos_posposiciones?evento_slug=eq.${encodeURIComponent(slug)}`
      + `&select=id,fecha_anterior,fecha_nueva,pagos_recalculados&order=creado_en.desc&limit=1`,
      { headers: khHeaders }
    );
    if (!posRes.ok) {
      const detail = await posRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta de la bitácora', detail }) };
    }
    const posRows = await posRes.json();
    const pos = Array.isArray(posRows) ? posRows[0] : null;
    if (!pos) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No hay una posposición registrada para este evento (pospónlo primero)' }) };
    }

    // 2. Idempotencia: si ya se recalculó, no repetir.
    if (pos.pagos_recalculados != null) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Los pagos de esta posposición ya se recalcularon' }) };
    }

    // 3. Offset en días, TODO en UTC (sin new Date(str) con zona local).
    const [a0, m0, d0] = String(pos.fecha_anterior).split('-').map(Number);
    const [a1, m1, d1] = String(pos.fecha_nueva).split('-').map(Number);
    const offsetDias = Math.round((Date.UTC(a1, m1 - 1, d1) - Date.UTC(a0, m0 - 1, d0)) / 86400000);
    if (offsetDias === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'El offset de días es 0 (no hay nada que mover)' }) };
    }

    // 4. Portal: solicitudes ACTIVAS del evento.
    const solRes = await fetch(
      `${env.PORTAL_URL}/rest/v1/solicitudes_tour?evento_id=eq.${encodeURIComponent(slug)}&estado=neq.cancelado&select=id`,
      { headers: portalHeaders }
    );
    if (!solRes.ok) {
      const detail = await solRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Portal rechazó la consulta de solicitudes', detail }) };
    }
    const solRows = await solRes.json();
    const solIds = [...new Set((Array.isArray(solRows) ? solRows : []).map(s => s.id).filter(Boolean))];
    if (!solIds.length) {
      await marcarRecalculada(pos.id);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, offset_dias: offsetDias, solicitudes: 0, movidos: 0, fallidos: 0 }) };
    }

    // 5. Portal: cuotas PENDIENTES de esas solicitudes (no toca pagado/vencido).
    const pagRes = await fetch(
      `${env.PORTAL_URL}/rest/v1/pagos?solicitud_id=in.(${solIds.join(',')})&estado=eq.pendiente&select=id,fecha_esperada`,
      { headers: portalHeaders }
    );
    if (!pagRes.ok) {
      const detail = await pagRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Portal rechazó la consulta de pagos', detail }) };
    }
    const pagos = await pagRes.json();
    const pendientes = Array.isArray(pagos) ? pagos : [];
    if (!pendientes.length) {
      await marcarRecalculada(pos.id);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, offset_dias: offsetDias, solicitudes: solIds.length, movidos: 0, fallidos: 0 }) };
    }

    // 6. Mover cada cuota pendiente por offsetDias (cálculo en UTC).
    const resultados = await Promise.allSettled(pendientes.map(p => {
      const nuevaFecha = sumarDias(p.fecha_esperada, offsetDias);
      return fetch(`${env.PORTAL_URL}/rest/v1/pagos?id=eq.${encodeURIComponent(p.id)}`, {
        method: 'PATCH',
        headers: { ...portalHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ fecha_esperada: nuevaFecha }),
      });
    }));

    let movidos = 0, fallidos = 0;
    for (const r of resultados) {
      if (r.status === 'fulfilled' && r.value && r.value.ok) movidos++;
      else fallidos++;
    }

    // 7. Marcar la posposición como recalculada (SIEMPRE, aunque haya fallidos).
    await marcarRecalculada(pos.id);

    // 8. Listo.
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, offset_dias: offsetDias, solicitudes: solIds.length, movidos, fallidos }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error recalculando los pagos', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_URL     = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY     = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const PORTAL_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!KH_URL || !KH_KEY || !PORTAL_URL || !PORTAL_KEY) {
    return { error: 'Faltan env vars (KH + Portal Supabase)' };
  }
  return { KH_URL, KH_KEY, PORTAL_URL, PORTAL_KEY };
}

// 'YYYY-MM-DD' + offsetDias → 'YYYY-MM-DD', TODO en UTC (sin zona local).
function sumarDias(ds, offsetDias) {
  const [ay, am, ad] = String(ds).split('-').map(Number);
  const t = Date.UTC(ay, am - 1, ad) + offsetDias * 86400000;
  const nf = new Date(t);
  return `${nf.getUTCFullYear()}-${String(nf.getUTCMonth() + 1).padStart(2, '0')}-${String(nf.getUTCDate()).padStart(2, '0')}`;
}
