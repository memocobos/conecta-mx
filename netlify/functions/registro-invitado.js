// =============================================================================
// registro-invitado.js — Alta de cuenta por invitación (flujo PRE-JWT)
//
// El usuario invitado todavía NO tiene sesión/JWT: la autenticación de este
// endpoint es el `invite_token` (UUID secreto del link). Reemplaza los fetch
// directos con anon key que hacía kamehouse.html (mostrarRegistroInvitado /
// completarRegistro) para poder cerrar el RLS de `usuarios` a anon.
//
// Body JSON: { accion, ... }
//   - accion='validar'   : { token } → { ok, usuario:{id,nombre,rol} } | { ok:false, reason }
//        Verifica que el token exista, no esté usado y no haya expirado.
//        NUNCA devuelve password_hash.
//   - accion='completar' : { token, nombre, username, password, celular?, talla_playera? }
//        Re-valida el token server-side (el id sale del token, NO del cliente),
//        verifica unicidad de username, hashea la password con bcrypt (cost 10,
//        igual que auth-login) y activa la cuenta. → { ok, user:{whitelist} }
//
// Seguridad:
//   - corsCheck (solo conectareynosa.mx / previews) — el link se abre ahí.
//   - service_role para la query. El token es la credencial; se re-valida en cada acción.
//   - El password viaja por HTTPS y se hashea AQUÍ. Nunca se guarda texto plano.
//
// Env vars (reusa las de KH):
//   - SUPABASE_URL_KAMEHOUSE
//   - SUPABASE_SERVICE_KEY_KAMEHOUSE
// =============================================================================

const { corsCheck } = require('./_lib/verify-admin');
const bcrypt = require('bcryptjs');

const BCRYPT_COST = 10;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Whitelist devuelta tras completar (misma idea que admin-usuarios COLS).
const COLS = [
  'id', 'nombre', 'username', 'correo', 'correo_notif', 'celular', 'rol',
  'activo', 'strikes', 'foto_url', 'talla_playera', 'fecha_nacimiento',
  'num_emergencia', 'nombre_emergencia', 'template_sugerido', 'tema_acento',
  'perfil_completo', 'permisos_extra',
].join(',');

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

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const base = `${env.KH_SB_URL}/rest/v1/usuarios`;

  const token = String(body.token || '').trim();
  if (!UUID_RE.test(token)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, reason: 'token inválido' }) };
  }

  try {
    // Lookup del token (incluye campos internos solo del lado server).
    const lk = await fetch(
      `${base}?invite_token=eq.${token}&invite_usado=eq.false&select=id,nombre,rol,invite_expires_at&limit=1`,
      { headers: sbHeaders }
    );
    if (!lk.ok) {
      const detail = await lk.text();
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'KH rechazó la consulta', detail }) };
    }
    const rows = await lk.json();
    const invitado = rows[0];

    if (!invitado) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'invalido' }) };
    }
    if (invitado.invite_expires_at && new Date(invitado.invite_expires_at) < new Date()) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'expirado' }) };
    }

    // ── validar ─────────────────────────────────────────────────────────────
    if (body.accion === 'validar') {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ ok: true, usuario: { id: invitado.id, nombre: invitado.nombre, rol: invitado.rol } }),
      };
    }

    // ── completar ─────────────────────────────────────────────────────────────
    if (body.accion === 'completar') {
      const nombre = String(body.nombre || '').trim();
      const username = String(body.username || '').trim().toLowerCase().replace(/\s+/g, '');
      const password = String(body.password || '');
      if (!nombre) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'El nombre es obligatorio' }) };
      }
      if (!username) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Elige un nombre de usuario' }) };
      }
      // 🔐 CAP2-2: mínimo unificado a 8 en TODO el sistema (reset-password ya
      // exigía 8; aquí y en admin-usuarios se pedían 6, así que una cuenta nueva
      // podía nacer más débil de lo que el propio sistema permite al cambiarla).
      if (password.length < 8 || password.length > 200) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'La contraseña debe tener mínimo 8 caracteres' }) };
      }

      // Unicidad de username (excluyendo al propio invitado).
      const cr = await fetch(`${base}?username=eq.${encodeURIComponent(username)}&select=id&limit=1`, { headers: sbHeaders });
      if (cr.ok) {
        const crows = await cr.json();
        if (crows.some(u => u.id !== invitado.id)) {
          return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Ese usuario ya está tomado, elige otro' }) };
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // [EQ-7] SIN DATOS DE SEGURIDAD NO HAY SELLO.
      //
      // Esta puerta estampaba perfil_completo=true con nombre, usuario y
      // contraseña. Fecha de nacimiento y contacto de emergencia ni se pedían
      // — y como el perfil ya decía "completo", NADIE los volvía a pedir
      // nunca. Caso real del estreno: una cuenta nueva con los tres en null y
      // el sello puesto.
      //
      // No son datos de perfil: son a quién le hablamos si algo pasa en la
      // carretera, y la fecha que va IMPRESA en el contrato de coordinador.
      // El sello miente si no están, así que el sello no se pone sin ellos.
      // ═══════════════════════════════════════════════════════════════════
      const fecha_nacimiento = String(body.fecha_nacimiento || '').trim();
      const nombre_emergencia = String(body.nombre_emergencia || '').trim();
      const num_emergencia = String(body.num_emergencia || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_nacimiento)) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Falta tu fecha de nacimiento' }) };
      }
      // Hoy en Monterrey, no en UTC: después de las 6pm de acá, toISOString ya
      // es mañana allá y una fecha de hoy pasaría por futura.
      const hoyMx = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
      if (fecha_nacimiento >= hoyMx) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Revisa tu fecha de nacimiento' }) };
      }
      if (!nombre_emergencia) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Falta el nombre de tu contacto de emergencia' }) };
      }
      if (num_emergencia.replace(/\D/g, '').length < 10) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'El teléfono de emergencia va a 10 dígitos' }) };
      }

      const password_hash = await bcrypt.hash(password, BCRYPT_COST);
      const update = {
        nombre, username, password_hash,
        activo: true, invite_usado: true, invite_token: null,
        fecha_nacimiento, nombre_emergencia, num_emergencia,
        perfil_completo: true,
      };
      const cel = String(body.celular || '').trim();
      const talla = String(body.talla_playera || '').trim();
      if (cel) update.celular = cel;
      if (talla) update.talla_playera = talla;

      // El id sale del token (no del cliente) → no se puede secuestrar otra cuenta.
      const r = await fetch(`${base}?id=eq.${invitado.id}&invite_token=eq.${token}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(update),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'KH rechazó el alta', detail }) };
      }
      const urows = await r.json();
      const full = urows[0] || {};
      // Reproyectar a la whitelist (la PATCH con return=representation trae todo).
      const user = {};
      COLS.split(',').forEach(c => { if (c in full) user[c] = full[c]; });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, user }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Error en registro-invitado', detail: e.message }) };
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
