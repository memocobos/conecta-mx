// =============================================================================
// admin-gasto-eliminar  (G1 — pestaña Gastos sobre el PORTAL, ESCRITURA)
//
// Borra un gasto de public.gastos del PORTAL por id. La confirmación va en el
// front. El cliente NUNCA borra gastos; todo pasa por esta función con
// service_role.
//
// Body JSON: { id }  (uuid del gasto)
//
// Seguridad: verifyAdminAuth(['maestro_roshi','bulma']) + corsCheck.
// service_role SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const id = (typeof body.id === 'string') ? body.id.trim() : '';
  if (!UUID_RE.test(id)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
  }

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  // [FIN-1a] BORRAR UN GASTO QUE ABONÓ, BORRA TAMBIÉN SU ABONO (condición de Jane).
  //
  // El orden es el INVERSO al del alta, y por la misma razón: el estado
  // prohibido es "un gasto que DICE que abonó sin su abono existiendo". Si
  // borráramos el abono primero y el gasto fallara, ese estado prohibido sería
  // exactamente lo que queda. Así que:
  //   1) se LEE el gasto (para saber su abono_id)
  //   2) se BORRA el gasto en Portal
  //   3) se BORRA su abono en KH
  //   4) si (3) falla → 200 con aviso EXPLÍCITO: el gasto ya no está, el abono
  //      sí, y se dice su id. Se devuelve 200 porque el gasto SÍ se borró:
  //      mentir con un 502 haría que la pantalla lo siguiera mostrando.
  try {
    // (1) ¿Este gasto abonó algo?
    const rg = await fetch(`${env.PORTAL_SB_URL}/rest/v1/gastos?id=eq.${id}&select=id,abono_id&limit=1`, { headers: sbHeaders });
    if (!rg.ok) {
      const detail = await rg.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta del gasto', detail }) };
    }
    const filas = await rg.json();
    const fila = Array.isArray(filas) ? filas[0] : null;
    const abonoId = fila && fila.abono_id ? String(fila.abono_id) : null;

    // (2) El gasto.
    const r = await fetch(`${env.PORTAL_SB_URL}/rest/v1/gastos?id=eq.${id}`, {
      method: 'DELETE',
      headers: sbHeaders,
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó el delete', detail }) };
    }

    // (3) Su abono, si tenía. Sin abono_id NO se toca KH: ni una llamada.
    if (abonoId) {
      const envKH = readEnvKH();
      const borrado = envKH.error ? { ok: false } : await _borrarAbono(envKH, abonoId);
      if (!borrado.ok) {
        return { statusCode: 200, headers, body: JSON.stringify({
          ok: true,
          aviso: 'El gasto se eliminó, pero su abono al proveedor NO se pudo borrar y sigue vivo. '
               + `Bórralo a mano en el Palacio (abono ${abonoId}): mientras tanto, la deuda de ese proveedor se ve más baja de lo real.`,
          abono_huerfano: abonoId,
        }) };
      }
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, abono_borrado: abonoId }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error eliminando el gasto', detail: e.message }) };
  }
};

async function _borrarAbono(envKH, abonoId) {
  try {
    const r = await fetch(`${envKH.KH_SB_URL}/rest/v1/abonos?id=eq.${abonoId}`, {
      method: 'DELETE',
      headers: {
        apikey: envKH.KH_SB_SERVICE,
        Authorization: 'Bearer ' + envKH.KH_SB_SERVICE,
        Prefer: 'return=minimal',
      },
    });
    return { ok: r.ok };
  } catch (_) { return { ok: false }; }
}

function readEnvKH() {
  const KH_SB_URL     = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) return { error: 'Faltan env vars KH' };
  return { KH_SB_URL, KH_SB_SERVICE };
}

// ----- helpers -----

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
