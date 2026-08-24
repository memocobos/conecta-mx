// =============================================================================
// admin-ingreso-editar  (S2 — pestaña Ingresos sobre el PORTAL, ESCRITURA)
//
// Actualiza un ingreso existente en public.ingresos del PORTAL. Mismo patrón que
// admin-ingreso-crear pero con UPDATE (PATCH). El cliente NUNCA escribe ingresos;
// todo pasa por esta función con service_role.
//
// Body JSON: { id, cliente_id?, evento_id?, concepto, monto, fecha, categoria,
//              cuenta, metodo_pago, notas }
//   - Obligatorios: id, concepto, monto (>= 0), fecha.
//   - cliente_id: uuid o vacío/ausente = null (sin cliente).
//   - evento_id: base o base#idx del EV; vacío/ausente = sin evento (null).
//   - NO se tocan registrado_por ni created_at (se conservan los originales).
//
// Seguridad: verifyAdminAuth(['maestro_roshi','bulma']) + corsCheck.
// service_role SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { validarMonto } = require('./_lib/monto-limites');

// [UTIL-C-3] La lista, de su dueño. La regla del evento NO aplica a un
// ingreso: lo que se exige aquí es lo mismo de siempre.
const { normCuenta, errorCuentaDeIngreso } = require('./_lib/cuentas-dinero');
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
  if (!UUID_RE.test(id)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
  }

  const concepto = (typeof body.concepto === 'string') ? body.concepto.trim() : '';
  const fecha    = (typeof body.fecha === 'string') ? body.fecha.trim() : '';
  const monto    = Number(body.monto);

  if (!concepto)                       return { statusCode: 400, headers, body: JSON.stringify({ error: 'El concepto es obligatorio' }) };
  // 💰 CAP3-1: mismo tope al editar.
  const _vm = validarMonto(monto);
  if (!_vm.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: _vm.error }) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'La fecha es obligatoria (YYYY-MM-DD)' }) };

  const clienteId = (typeof body.cliente_id === 'string' && body.cliente_id.trim()) ? body.cliente_id.trim() : null;
  if (clienteId && !UUID_RE.test(clienteId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'cliente_id inválido' }) };
  }
  const eventoId = (typeof body.evento_id === 'string' && body.evento_id.trim()) ? body.evento_id.trim() : null;
  if (eventoId && (eventoId.length > 80 || !/^[A-Za-z0-9_.#\-]+$/.test(eventoId))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
  }
  const categoria  = (typeof body.categoria === 'string' && body.categoria.trim()) ? body.categoria.trim().slice(0, 60) : null;
  const metodoPago = (typeof body.metodo_pago === 'string' && body.metodo_pago.trim()) ? body.metodo_pago.trim().slice(0, 60) : null;

  // Cuenta a la que entró el ingreso. Opcional, pero si viene debe ser uno de los 4.
  const cuenta = (typeof body.cuenta === 'string' && body.cuenta.trim()) ? body.cuenta.trim() : null;
  const errCuenta = errorCuentaDeIngreso(cuenta);
  if (errCuenta) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: errCuenta }) };
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
    const r = await fetch(`${env.PORTAL_SB_URL}/rest/v1/ingresos?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({
        cliente_id: clienteId,
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
    const ingreso = Array.isArray(updated) ? updated[0] : updated;
    if (!ingreso) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No se encontró el ingreso a editar' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ingreso }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error actualizando el ingreso', detail: e.message }) };
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
