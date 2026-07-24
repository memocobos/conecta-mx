// =============================================================================
// admin-waitlist.js — Acceso server-side a la lista de espera (KH)
//
// Cierra la exposición a anon: kamehouse.html ya NO lee/borra `eventos_waitlist`
// ni lee `eventos_estado_snapshot` con la anon key (helper _wlSb). Todo pasa por
// aquí con service_role + verifyAdminAuth. Mismo patrón que admin-tours/admin-kits.
//
// Body JSON: { accion, ... }   (Rol: maestro_roshi — misma área admin que el Radar)
//   - 'listar'   → eventos_waitlist (order created_at.desc). ⚠️ incluye PII
//        (nombre, email) — whitelist explícita; solo llega a admin autenticado.
//   - 'snapshot' → eventos_estado_snapshot select=evento_id,estado.
//   - 'eliminar' { evento_id } → DELETE eventos_waitlist por evento_id (slug).
//   - 'reset_notificado' { evento_id } → PATCH notificado=false/notificado_at=null
//        de ese evento (para reenviar la notificación a todos).
//
// Seguridad: verifyAdminAuth (maestro_roshi) + corsCheck. service_role para la query.
//   El alta pública a la waitlist va por waitlist-subscribe (service_role) y NO se
//   rompe con el cierre. NUNCA se expone la service key.
//
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

// La pantalla de Waitlist la operan maestro_roshi y bulma (espejo del gate de
// wlEliminarEvento en el front). El Radar, en cambio, es solo maestro_roshi.
const ROLES_ADMIN = ['maestro_roshi', 'bulma', 'milk'];
const SLUG_RE = /^[a-zA-Z0-9_-]{1,80}$/;

// Whitelist de columnas de la waitlist (incluye PII porque el panel la necesita;
// ya solo llega a admin autenticado — antes era anon-público).
const WL_COLS = 'id,evento_id,evento_nombre,nombre,email,notificado,notificado_at,created_at';

const ACCIONES = { listar: ROLES_ADMIN, snapshot: ROLES_ADMIN, eliminar: ROLES_ADMIN, reset_notificado: ROLES_ADMIN };

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
  if (!(accion in ACCIONES)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  }

  const auth = verifyAdminAuth(event, ACCIONES[accion]);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const restBase = `${env.KH_SB_URL}/rest/v1`;

  try {
    // ── listar (waitlist con PII) ─────────────────────────────────────────────
    if (accion === 'listar') {
      const r = await fetch(`${restBase}/eventos_waitlist?select=${WL_COLS}&order=created_at.desc`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, rows: await r.json() }) };
    }

    // ── snapshot ───────────────────────────────────────────────────────────────
    if (accion === 'snapshot') {
      const r = await fetch(`${restBase}/eventos_estado_snapshot?select=evento_id,estado`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, rows: await r.json() }) };
    }

    // ── eliminar (por evento_id, tras notificar) ───────────────────────────────
    if (accion === 'eliminar') {
      const eventoId = String(body.evento_id || '').trim();
      if (!SLUG_RE.test(eventoId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
      }
      const r = await fetch(`${restBase}/eventos_waitlist?evento_id=eq.${encodeURIComponent(eventoId)}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el delete', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── reset_notificado (reenvío: limpia el flag de notificación) ─────────────
    if (accion === 'reset_notificado') {
      const eventoId = String(body.evento_id || '').trim();
      if (!SLUG_RE.test(eventoId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
      }
      const r = await fetch(`${restBase}/eventos_waitlist?evento_id=eq.${encodeURIComponent(eventoId)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ notificado: false, notificado_at: null }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-waitlist', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
