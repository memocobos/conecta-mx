// =============================================================================
// admin-gastos-list  (G1 — pestaña Gastos sobre el PORTAL, LECTURA)
//
// Lista los gastos (egresos) del portal para la pestaña Gastos de Kamehouse.
// Reemplaza la vieja consulta a gastos_generales (Supabase de KH). Aquí los
// gastos viven en la tabla public.gastos del PORTAL, ligados a eventos del EV
// por evento_id de texto (base o base#idx). El nombre del evento lo resuelve el
// front desde EV — esta función devuelve evento_id crudo, sin joins.
//
// Body JSON (todo opcional): { evento_id?, categoria? }
//   - evento_id: match EXACTO contra gastos.evento_id (el front manda el value
//     del select, base o base#idx). Vacío = sin filtro de evento.
//   - categoria: una de las categorías de la UI. Vacío = todas.
//
// Devuelve: { ok, count, gastos:[...], total, total_mes }
//   - gastos: order fecha desc, limit 200, evento_id CRUDO.
//   - total: suma de monto de los gastos devueltos (ya filtrados).
//   - total_mes: suma de monto del mes en curso (entre los devueltos).
//
// Seguridad: verifyAdminAuth(['maestro_roshi','bulma']) + corsCheck.
// service_role SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas.
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

  const auth = verifyAdminAuth(event, ['maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  // ── Filtros ────────────────────────────────────────────────────────────────
  const eventoId = (typeof body.evento_id === 'string' && body.evento_id.trim()) ? body.evento_id.trim() : '';
  if (eventoId && (eventoId.length > 80 || !/^[A-Za-z0-9_.#\-]+$/.test(eventoId))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
  }
  const categoria = (typeof body.categoria === 'string' && body.categoria.trim()) ? body.categoria.trim() : '';
  if (categoria && categoria.length > 60) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'categoria inválida' }) };
  }

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    const sp = new URLSearchParams();
    sp.set('select', 'id,evento_id,concepto,monto,categoria,metodo_pago,fecha,notas,registrado_por,created_at');
    if (eventoId)  sp.append('evento_id', `eq.${eventoId}`);
    if (categoria) sp.append('categoria', `eq.${categoria}`);
    sp.set('order', 'fecha.desc');
    sp.set('limit', '200');

    const url = `${env.PORTAL_SB_URL}/rest/v1/gastos?${sp.toString()}`;
    const r = await fetch(url, { headers: sbHeaders });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de gastos', detail }) };
    }
    let gastos = await r.json();
    gastos = Array.isArray(gastos) ? gastos : [];

    // Totales (sobre los gastos ya filtrados/devueltos).
    const total = gastos.reduce((s, g) => s + Number(g.monto || 0), 0);
    const mesActual = new Date().toISOString().slice(0, 7);  // 'YYYY-MM'
    const totalMes = gastos
      .filter(g => String(g.fecha || '').slice(0, 7) === mesActual)
      .reduce((s, g) => s + Number(g.monto || 0), 0);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, count: gastos.length, gastos, total, total_mes: totalMes }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error consultando gastos', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
