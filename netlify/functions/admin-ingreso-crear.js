// =============================================================================
// admin-ingreso-crear  (S2 — pestaña Ingresos sobre el PORTAL, ESCRITURA)
//
// Inserta un ingreso (entrada suelta) en public.ingresos del PORTAL. Clon de
// admin-gasto-crear pero con cliente_id opcional. El cliente NUNCA escribe
// ingresos; todo pasa por esta función con service_role.
//
// Body JSON: { cliente_id?, evento_id?, concepto, monto, fecha, categoria,
//              cuenta, metodo_pago, notas }
//   - Obligatorios: concepto, monto (>= 0), fecha.
//   - cliente_id: uuid o vacío/ausente = null (sin cliente).
//   - evento_id: base o base#idx del EV; vacío/ausente = sin evento (null).
//   - cuenta: BBVA | Banamex | Efectivo | Otro si viene.
//   - registrado_por se toma del JWT (correo del admin), NO del body.
//
// Seguridad: verifyAdminAuth(['maestro_roshi','bulma']) + corsCheck.
// service_role SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const CUENTAS = ['BBVA', 'Banamex', 'Efectivo', 'Otro'];
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

  const auth = verifyAdminAuth(event, ['maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  // ── Validación ───────────────────────────────────────────────────────────
  const concepto = (typeof body.concepto === 'string') ? body.concepto.trim() : '';
  const fecha    = (typeof body.fecha === 'string') ? body.fecha.trim() : '';
  const monto    = Number(body.monto);

  if (!concepto)                       return { statusCode: 400, headers, body: JSON.stringify({ error: 'El concepto es obligatorio' }) };
  if (!Number.isFinite(monto) || monto < 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El monto debe ser un número mayor o igual a 0' }) };
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

  // Cuenta a la que entró el ingreso (para el futuro visor de saldos). Opcional,
  // pero si viene debe ser uno de los 4 valores permitidos.
  const cuenta = (typeof body.cuenta === 'string' && body.cuenta.trim()) ? body.cuenta.trim() : null;
  if (cuenta && !CUENTAS.includes(cuenta)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'cuenta inválida' }) };
  }
  const notas      = (typeof body.notas === 'string' && body.notas.trim()) ? body.notas.trim().slice(0, 1000) : null;

  const registradoPor = (auth.user && (auth.user.correo || auth.user.rol)) || null;

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  try {
    const r = await fetch(`${env.PORTAL_SB_URL}/rest/v1/ingresos`, {
      method: 'POST',
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
        registrado_por: registradoPor,
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó el insert', detail }) };
    }
    const inserted = await r.json();
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ingreso: Array.isArray(inserted) ? inserted[0] : inserted }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error registrando el ingreso', detail: e.message }) };
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
