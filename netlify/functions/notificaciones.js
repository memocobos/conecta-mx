// =============================================================================
// notificaciones  (DC2c-A — notificaciones in-app por usuario)
//
// Capa in-app que acompaña (NO reemplaza) los emails existentes. Tabla
// public.notificaciones por-usuario; todo el acceso pasa por aquí con
// service_role (la tabla tiene RLS sin policies para anon).
//
// Body JSON: { accion, ... }
//   - accion='list'          : cualquier rol logueado. Lee usuario_id DEL JWT.
//       → { ok, notificaciones:[...], no_leidas }
//   - accion='marcar_leida'  : { id }. UPDATE leida=true WHERE id AND usuario_id=<jwt>.
//   - accion='marcar_todas'  : UPDATE leida=true WHERE usuario_id=<jwt> AND leida=false.
//   - accion='crear'         : SOLO maestro_roshi/bulma/mister_popo.
//       Body { usuario_id|usuario_ids[], tipo, titulo?, mensaje, link? }.
//       INSERT una fila por destinatario. Lo llaman los disparadores.
//
// Seguridad:
//   - Authorization: Bearer <JWT> (verifyAdminAuth) + corsCheck.
//   - list/marcar SIEMPRE scopeados por el usuario del JWT (no del body).
//
// Env vars (reusa las existentes):
//   - SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE
//   - JWT_SECRET (lo lee verifyAdminAuth)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const TIPOS_VALIDOS = ['asignacion', 'listas', 'strike'];
const ROLES_CREAR = ['maestro_roshi', 'bulma', 'mister_popo'];
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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const accion = body.accion;
  // 'crear' está restringido a Montaña Pai / coordinación; el resto lo puede
  // hacer cualquier usuario logueado (sobre SUS propias notificaciones).
  const rolesPermitidos = accion === 'crear' ? ROLES_CREAR : undefined;

  const auth = verifyAdminAuth(event, rolesPermitidos);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const jwtUserId = auth.user && auth.user.id;
  if (!jwtUserId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JWT sin id de usuario' }) };
  }

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const base = `${env.KH_SB_URL}/rest/v1/notificaciones`;

  try {
    // ── list ────────────────────────────────────────────────────────────────
    if (accion === 'list') {
      const sp = new URLSearchParams();
      sp.set('select', 'id,tipo,titulo,mensaje,link,leida,created_at');
      sp.append('usuario_id', `eq.${jwtUserId}`);
      sp.set('order', 'created_at.desc');
      sp.set('limit', '40');

      const r = await fetch(`${base}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      const notificaciones = await r.json();

      // Conteo exacto de no leídas (no depende del límite de 40).
      const cp = new URLSearchParams();
      cp.set('select', 'id');
      cp.append('usuario_id', `eq.${jwtUserId}`);
      cp.append('leida', 'eq.false');
      const cr = await fetch(`${base}?${cp.toString()}`, {
        headers: { ...sbHeaders, Prefer: 'count=exact', Range: '0-0' },
      });
      let no_leidas = 0;
      const range = cr.headers.get('content-range') || '';
      const m = range.split('/')[1];
      if (m && m !== '*') no_leidas = parseInt(m, 10) || 0;

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, notificaciones, no_leidas }) };
    }

    // ── marcar_leida ──────────────────────────────────────────────────────────
    if (accion === 'marcar_leida') {
      const id = body.id;
      if (!id || !UUID_RE.test(String(id))) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      // El AND usuario_id=<jwt> es la seguridad: no marcas notificaciones ajenas.
      const sp = new URLSearchParams();
      sp.append('id', `eq.${id}`);
      sp.append('usuario_id', `eq.${jwtUserId}`);
      const r = await fetch(`${base}?${sp.toString()}`, {
        method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ leida: true }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── marcar_todas ──────────────────────────────────────────────────────────
    if (accion === 'marcar_todas') {
      const sp = new URLSearchParams();
      sp.append('usuario_id', `eq.${jwtUserId}`);
      sp.append('leida', 'eq.false');
      const r = await fetch(`${base}?${sp.toString()}`, {
        method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ leida: true }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── crear ───────────────────────────────────────────────────────────────
    if (accion === 'crear') {
      const tipo = typeof body.tipo === 'string' ? body.tipo.trim() : '';
      const mensaje = typeof body.mensaje === 'string' ? body.mensaje.trim() : '';
      const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : null;
      const link = typeof body.link === 'string' ? body.link.trim() : null;
      if (!TIPOS_VALIDOS.includes(tipo)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'tipo inválido' }) };
      }
      if (!mensaje) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'mensaje es obligatorio' }) };
      }
      // Acepta usuario_id (uno) o usuario_ids[] (varios).
      let destinatarios = [];
      if (Array.isArray(body.usuario_ids)) destinatarios = body.usuario_ids;
      else if (body.usuario_id) destinatarios = [body.usuario_id];
      destinatarios = destinatarios
        .map(x => String(x || '').trim())
        .filter(x => UUID_RE.test(x));
      // Dedupe.
      destinatarios = Array.from(new Set(destinatarios));
      if (!destinatarios.length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'usuario_id/usuario_ids inválido' }) };
      }

      const filas = destinatarios.map(uid => ({
        usuario_id: uid, tipo, titulo, mensaje, link, leida: false,
      }));
      const r = await fetch(base, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(filas),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el insert', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, creadas: filas.length }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en notificaciones', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_SB_URL     = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
