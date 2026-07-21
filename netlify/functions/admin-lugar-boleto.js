// =============================================================================
// admin-lugar-boleto  (Contratos F3b — marcar/des-marcar "boleto entregado")
//
// Regla de Memo: "sin firma no hay servicio". El CANDADO ES SERVER-SIDE: marcar
// un boleto como entregado EXIGE que el contrato del lugar esté 'firmado'. Aunque
// alguien fuerce la casilla por consola, el servidor la rebota con 409.
//
//   POST { lugar_id: uuid, entregado: true|false }
//     entregado=true  → exige contrato 'firmado'; escribe boleto_entregado_at=now()
//                       · si no está firmado → 409 con el mensaje que la UI muestra
//     entregado=false → limpia boleto_entregado_at (des-marcar SIEMPRE permitido)
//
// Auditoría: se anexa una línea a lugares.notas (mismo patrón que admin-lugar-baja;
// NO se inventa tabla nueva).
//
// Seguridad: verifyAdminAuth (maestro_roshi/bulma) + corsCheck. NUNCA on_conflict.
// Env vars: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const MSG_SIN_FIRMA = '⛔ Sin contrato firmado no se entrega boleto.';

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = verifyAdminAuth(event, ['maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const PORTAL_URL = process.env.PORTAL_SUPABASE_URL;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_URL || !SB_SERVICE) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars (PORTAL_SUPABASE_*)' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const lugarId = body.lugar_id;
  if (!lugarId || !/^[0-9a-f-]{36}$/i.test(lugarId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'lugar_id inválido' }) };
  }
  if (typeof body.entregado !== 'boolean') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'entregado debe ser booleano' }) };
  }
  const entregado = body.entregado;

  const sb = { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' };
  const enc = encodeURIComponent;

  try {
    // ---- El lugar (notas para la auditoría) ----
    const lr = await fetch(`${PORTAL_URL}/rest/v1/lugares?id=eq.${enc(lugarId)}&select=id,notas&limit=1`, { headers: sb });
    if (!lr.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta del lugar', detail: await lr.text() }) };
    const lugar = (await lr.json().catch(() => []))[0];
    if (!lugar) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lugar no encontrado' }) };

    // ---- CANDADO: marcar entregado exige contrato 'firmado' ----
    if (entregado) {
      const cr = await fetch(
        `${PORTAL_URL}/rest/v1/contratos_viajeros?lugar_id=eq.${enc(lugarId)}&estado=neq.anulado&select=estado&limit=1`,
        { headers: sb }
      );
      const ct = cr.ok ? (await cr.json().catch(() => []))[0] : null;
      if (!ct || ct.estado !== 'firmado') {
        return { statusCode: 409, headers, body: JSON.stringify({ error: MSG_SIN_FIRMA }) };
      }
    }

    // ---- PATCH (nunca on_conflict) + auditoría en notas ----
    const nowISO = new Date().toISOString();
    const quien = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';
    const nota = '[BOLETO ' + (entregado ? 'ENTREGADO' : 'DES-MARCADO') + ' ' + hoyMx() + ' · ' + quien + ']';
    const notasNuevas = (lugar.notas && String(lugar.notas).trim())
      ? (String(lugar.notas).trim() + '\n' + nota)
      : nota;

    const patch = {
      boleto_entregado_at: entregado ? nowISO : null,
      notas: notasNuevas,
      updated_at: nowISO,
    };
    const up = await fetch(`${PORTAL_URL}/rest/v1/lugares?id=eq.${enc(lugarId)}`, {
      method: 'PATCH',
      headers: { ...sb, Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    if (!up.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo actualizar el boleto', detail: await up.text() }) };

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, boleto_entregado_at: entregado ? nowISO : null }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error actualizando el boleto', detail: e.message }) };
  }
};

// Fecha corta Monterrey (DD/MM/YYYY) para la nota de auditoría.
function hoyMx() {
  try {
    return new Date().toLocaleDateString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}
