// =============================================================================
// sistema-alertas-write
//
// Escrituras a sistema_alertas vía service_role. Al endurecer RLS la tabla quedó
// sin INSERT/UPDATE para el cliente anon, así que esas escrituras daban 401.
// El SELECT del cliente sigue funcionando directo; solo INSERT/UPDATE pasan aquí.
//
// Body JSON: { accion, ... }
//   - accion='crear'              : cualquier usuario logueado. { tipo, mensaje }
//                                   INSERT { tipo, mensaje, leida:false, created_at }
//   - accion='marcar_leida'       : solo maestro_roshi. { id } → leida=true
//   - accion='marcar_todas_leidas': solo maestro_roshi. UPDATE las no leídas → leida=true
//
// Seguridad:
//   - Authorization: Bearer <JWT> firmado por auth-login.js
//   - verifyAdminAuth (roles según acción) + corsCheck
//   - INSERT/UPDATE a Supabase con service_role (bypass RLS)
//
// Env vars:
//   - SUPABASE_SERVICE_KEY_KAMEHOUSE
//   - JWT_SECRET (lo lee verifyAdminAuthLive)
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

// 'crear' lo puede disparar cualquier usuario logueado (lista completa de roles).
const ROLES_CREAR = ['maestro_roshi', 'bulma', 'mister_popo', 'coordinador', 'cc', 'vendedor'];
// Marcar leídas es exclusivo de Montaña Pai (maestro_roshi).
const ROLES_MARCAR = ['maestro_roshi'];

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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const accion = body.accion;
  const rolesPermitidos = accion === 'crear' ? ROLES_CREAR : ROLES_MARCAR;

  const auth = await verifyAdminAuthLive(event, rolesPermitidos);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  if (!SB_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };
  }

  const sbHeaders = {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
  };

  try {
    if (accion === 'crear') {
      const tipo = typeof body.tipo === 'string' ? body.tipo.trim() : '';
      const mensaje = typeof body.mensaje === 'string' ? body.mensaje.trim() : '';
      if (!tipo || !mensaje) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'tipo y mensaje son obligatorios' }) };
      }
      const r = await fetch(`${SB_URL}/rest/v1/sistema_alertas`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ tipo, mensaje, leida: false, created_at: new Date().toISOString() }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó el insert', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (accion === 'marcar_leida') {
      const id = body.id;
      if (id === undefined || id === null || id === '') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id es obligatorio' }) };
      }
      const r = await fetch(`${SB_URL}/rest/v1/sistema_alertas?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ leida: true }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (accion === 'marcar_todas_leidas') {
      const r = await fetch(`${SB_URL}/rest/v1/sistema_alertas?leida=eq.false`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ leida: true }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error escribiendo a Supabase', detail: e.message }) };
  }
};
