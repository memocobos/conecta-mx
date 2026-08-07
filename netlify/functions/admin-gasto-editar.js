// =============================================================================
// admin-gasto-editar  (pestaña Gastos sobre el PORTAL, ESCRITURA)
//
// Actualiza un gasto existente en public.gastos del PORTAL. Mismo patrón que
// admin-gasto-crear pero con UPDATE (PATCH). El cliente NUNCA escribe gastos;
// todo pasa por esta función con service_role.
//
// Body JSON: { id, concepto, monto, fecha, categoria, cuenta, metodo_pago,
//              evento_id, notas }
//   - Obligatorios: id, concepto, monto (>= 0), fecha.
//   - evento_id: base o base#idx del EV; vacío/ausente = General (null).
//   - NO se tocan registrado_por ni created_at (se conservan los originales).
//
// Seguridad: verifyAdminAuth(['maestro_roshi','bulma']) + corsCheck.
// service_role SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { validarMonto } = require('./_lib/monto-limites');
// [AUD-1g] El catálogo de categorías vive en UN solo lugar.
const { esValida: esValidaCategoria, errorCategoria } = require('./_lib/categorias-gasto');

const CUENTAS = ['BBVA', 'Banamex', 'Efectivo', 'Otro'];

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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma', 'milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  // ── Validación ───────────────────────────────────────────────────────────
  const id = (typeof body.id === 'string') ? body.id.trim() : '';
  if (!id || id.length > 60 || !/^[A-Za-z0-9\-]+$/.test(id)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
  }

  const concepto = (typeof body.concepto === 'string') ? body.concepto.trim() : '';
  const fecha    = (typeof body.fecha === 'string') ? body.fecha.trim() : '';
  const monto    = Number(body.monto);

  if (!concepto)                       return { statusCode: 400, headers, body: JSON.stringify({ error: 'El concepto es obligatorio' }) };
  // 💰 CAP3-1: mismo tope al editar (si no, el dedazo entra por la puerta de atrás).
  const _vm = validarMonto(monto);
  if (!_vm.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: _vm.error }) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'La fecha es obligatoria (YYYY-MM-DD)' }) };

  const eventoId = (typeof body.evento_id === 'string' && body.evento_id.trim()) ? body.evento_id.trim() : null;
  if (eventoId && (eventoId.length > 80 || !/^[A-Za-z0-9_.#\-]+$/.test(eventoId))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
  }
  const categoria  = (typeof body.categoria === 'string' && body.categoria.trim()) ? body.categoria.trim().slice(0, 60) : null;
  // [AUD-1g] Mismo candado que en el alta: editar no es una puerta trasera.
  if (!esValidaCategoria(categoria)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: errorCategoria(categoria) }) };
  }
  const metodoPago = (typeof body.metodo_pago === 'string' && body.metodo_pago.trim()) ? body.metodo_pago.trim().slice(0, 60) : null;

  // Cuenta de la que salió el gasto. Opcional, pero si viene debe ser uno de los 4.
  const cuenta = (typeof body.cuenta === 'string' && body.cuenta.trim()) ? body.cuenta.trim() : null;
  if (cuenta && !CUENTAS.includes(cuenta)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'cuenta inválida' }) };
  }
  const notas = (typeof body.notas === 'string' && body.notas.trim()) ? body.notas.trim().slice(0, 1000) : null;

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  try {
    // NO se incluyen registrado_por ni created_at: se conservan los del insert.
    const r = await fetch(`${env.PORTAL_SB_URL}/rest/v1/gastos?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({
        evento_id: eventoId,
        concepto,
        monto,
        categoria,
        cuenta,
        metodo_pago: metodoPago,
        fecha,
        notas,
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó el update', detail }) };
    }
    const updated = await r.json();
    const gasto = Array.isArray(updated) ? updated[0] : updated;
    if (!gasto) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No se encontró el gasto a editar' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, gasto }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error actualizando el gasto', detail: e.message }) };
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
