// =============================================================================
// admin-tours.js — Acceso server-side a la tabla `tours_pasados` (KH)
//
// Cierra la exposición a anon: kamehouse.html ya NO lee/escribe `tours_pasados`
// directo con la anon key. Todo pasa por aquí con service_role + verifyAdminAuth.
// Mismo patrón que admin-usuarios.js / admin-contratos.js / admin-reportes.js.
//
// tours_pasados = historial de tours/eventos por usuario (perfil + ranking).
// evento NO es FK; artista/ciudad son texto libre. Ninguna columna sensible.
//
// Body JSON: { accion, ... }
//   - 'listar' { usuario_id?, desde? (fecha_aprox gte YYYY-MM-DD), limit? }
//        Roles: cualquier rol logueado (perfil/ranking son visibles al equipo).
//        → { ok, tours:[...] }  (whitelist de columnas)
//   - 'crear'  { usuario_id, artista, ciudad?, fecha_aprox?, tipo_tour?, rol_en_tour?, notas? }
//        Anti-escalación: si usuario_id !== jwtUserId, exige rol admin.
//        → { ok, tour }
//   - 'eliminar' { id }
//        Anti-escalación: el tour debe ser del jwtUserId, salvo admin. → { ok }
//
// Seguridad:
//   - Authorization: Bearer <JWT> (verifyAdminAuth) + corsCheck.
//   - SELECT/escritura con whitelist explícita de columnas.
//   - Ninguna función backend toca tours_pasados (el front era el único acceso anon).
//
// Env vars (reusa las de KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE,
//   JWT_SECRET (lo lee verifyAdminAuthLive).
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROLES_ADMIN = ['maestro_roshi', 'bulma'];

// Acciones válidas → roles permitidos (null = cualquier rol logueado).
const ACCIONES = { listar: null, crear: null, eliminar: null };

// Whitelist de columnas que SÍ viajan al navegador / se pueden setear.
const COLS = [
  'id', 'usuario_id', 'artista', 'ciudad', 'fecha_aprox',
  // [GR-1] `creado_en`, NO `created_at`: así se llama la columna en
  // tours_pasados. PostgREST responde 400 a un select con una columna que no
  // existe, así que la lista de tours moría ENTERA — y con ella Mi Perfil y el
  // Ranking, para TODO el equipo. Una palabra.
  'tipo_tour', 'rol_en_tour', 'notas', 'creado_en',
].join(',');

// Campos que el cliente puede setear al crear (usuario_id se valida aparte).
const CREATE_FIELDS = ['artista', 'ciudad', 'fecha_aprox', 'tipo_tour', 'rol_en_tour', 'notas'];

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

  const auth = await verifyAdminAuthLive(event, ACCIONES[accion] || undefined);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const jwtUserId = auth.user && (auth.user.id || auth.user.sub);
  const jwtRol = auth.user && auth.user.rol;
  if (!jwtUserId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JWT sin id de usuario' }) };
  }
  const esAdmin = ROLES_ADMIN.includes(jwtRol);

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const base = `${env.KH_SB_URL}/rest/v1/tours_pasados`;

  try {
    // ── listar ────────────────────────────────────────────────────────────
    if (accion === 'listar') {
      const sp = new URLSearchParams();
      sp.set('select', COLS);

      if (typeof body.usuario_id === 'string' && body.usuario_id.trim()) {
        const uid = body.usuario_id.trim();
        if (!UUID_RE.test(uid)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'usuario_id inválido' }) };
        }
        sp.append('usuario_id', `eq.${uid}`);
      }
      if (typeof body.desde === 'string' && ISO_DATE_RE.test(body.desde.trim())) {
        sp.append('fecha_aprox', `gte.${body.desde.trim()}`);
      }

      let limit = parseInt(body.limit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) limit = 200;
      sp.set('limit', String(limit));
      sp.set('order', 'fecha_aprox.desc');

      const r = await fetch(`${base}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      const tours = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, tours }) };
    }

    // ── crear ─────────────────────────────────────────────────────────────
    if (accion === 'crear') {
      const usuario_id = String(body.usuario_id || '').trim();
      if (!UUID_RE.test(usuario_id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'usuario_id inválido' }) };
      }
      // Anti-escalación: agregar tour a OTRO usuario exige rol admin.
      if (usuario_id !== jwtUserId && !esAdmin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo puedes agregar tours a tu propio perfil' }) };
      }
      const artista = String(body.artista || '').trim();
      if (!artista) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'artista requerido' }) };
      }
      if (body.fecha_aprox != null && body.fecha_aprox !== '' && !ISO_DATE_RE.test(String(body.fecha_aprox).trim())) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'fecha_aprox inválida (YYYY-MM-DD)' }) };
      }

      const fila = { usuario_id, artista: artista.slice(0, 200) };
      for (const k of CREATE_FIELDS) {
        if (k === 'artista') continue;
        if (Object.prototype.hasOwnProperty.call(body, k)) {
          const v = body[k];
          fila[k] = (typeof v === 'string') ? (v.trim() ? v.trim().slice(0, 500) : null) : v;
        }
      }

      const r = await fetch(base, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el insert', detail }) };
      }
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, tour: rows[0] || null }) };
    }

    // ── eliminar ────────────────────────────────────────────────────────────
    if (accion === 'eliminar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      // Anti-escalación: el tour debe ser del propio usuario, salvo admin.
      if (!esAdmin) {
        const cr = await fetch(`${base}?id=eq.${id}&select=usuario_id&limit=1`, { headers: sbHeaders });
        if (!cr.ok) {
          const detail = await cr.text();
          return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
        }
        const rows = await cr.json();
        if (!rows[0]) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Tour no encontrado' }) };
        if (rows[0].usuario_id !== jwtUserId) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes borrar el tour de otro usuario' }) };
        }
      }
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el delete', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-tours', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
