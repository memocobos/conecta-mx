// =============================================================================
// admin-usuarios.js — Acceso server-side a la tabla `usuarios` (KH)
//
// Cierra la exposición a anon: kamehouse.html ya NO lee/escribe `usuarios`
// directo con la anon key. Todo pasa por aquí con service_role + verifyAdminAuth.
// Mismo patrón que notificaciones.js / coordi-mis-grupos.js / reset-password.js.
//
// Body JSON: { accion, ... }
//   - accion='listar'   : cualquier rol logueado.
//        params opcionales: { activos?:bool, ids?:[uuid], rol?, correo?, orden? }
//        → { ok, usuarios:[...] }  (SIEMPRE con whitelist de columnas, sin password)
//   - accion='obtener'  : cualquier rol logueado. { id } → { ok, usuario|null }
//   - accion='verificar_username' : cualquier rol logueado.
//        { username, excludeId? } → { ok, disponible:bool }
//   - accion='crear'    : SOLO maestro_roshi/bulma. { correo, rol }
//        El server genera invite_token + expiración. → { ok, usuario:{id,invite_token,...} }
//   - accion='actualizar' : { id, patch:{...} }
//        · Si id === <jwt.id> (auto-edición): cualquier rol, SOLO campos self.
//        · Si id de otro: SOLO maestro_roshi/bulma, incluye rol/activo/strikes.
//        · password: SIEMPRE se hashea server-side con bcrypt (NUNCA texto plano).
//
// Seguridad:
//   - Authorization: Bearer <JWT> (verifyAdminAuth) + corsCheck.
//   - SELECT con whitelist explícita COLS (sin password_hash ni invite_token).
//   - El flujo de registro por invitación (pre-JWT) vive en registro-invitado.js.
//
// Env vars (reusa las existentes de KH):
//   - SUPABASE_URL_KAMEHOUSE (|| SUPABASE_URL)
//   - SUPABASE_SERVICE_KEY_KAMEHOUSE (|| SUPABASE_SERVICE_KEY / _ROLE_KEY)
//   - JWT_SECRET (lo lee verifyAdminAuth)
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const BCRYPT_COST = 10;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ROLES_VALIDOS = ['maestro_roshi', 'bulma', 'mister_popo', 'coordinador', 'cc', 'vendedor', 'milk'];
const ROLES_ADMIN = ['maestro_roshi', 'bulma'];

// Whitelist de columnas que SÍ pueden viajar al navegador. password_hash,
// invite_token, invite_usado e invite_expires_at quedan EXCLUIDOS a propósito.
const COLS = [
  'id', 'nombre', 'username', 'correo', 'correo_notif', 'celular', 'rol',
  'activo', 'strikes', 'foto_url', 'talla_playera', 'fecha_nacimiento',
  'num_emergencia', 'nombre_emergencia', 'template_sugerido', 'tema_acento',
  'perfil_completo', 'permisos_extra', 'creado_en', 'ultimo_acceso',
].join(',');

// Campos que un usuario puede editar de SU PROPIO perfil.
const SELF_FIELDS = [
  'nombre', 'username', 'celular', 'talla_playera', 'fecha_nacimiento',
  'correo_notif', 'nombre_emergencia', 'num_emergencia', 'template_sugerido',
  'tema_acento', 'foto_url', 'perfil_completo',
];
// Campos extra que SOLO un admin (maestro_roshi/bulma) puede tocar de otros.
const ADMIN_FIELDS = ['rol', 'activo', 'strikes', 'correo'];

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
  // 'crear' y la edición de OTROS usuarios exigen rol admin. La verificación
  // fina de admin-vs-self para 'actualizar' se hace abajo (depende del id).
  const rolesPermitidos = accion === 'crear' ? ROLES_ADMIN : undefined;

  const auth = verifyAdminAuth(event, rolesPermitidos);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const jwtUserId = auth.user && (auth.user.id || auth.user.sub);
  const jwtRol = auth.user && auth.user.rol;
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
  const base = `${env.KH_SB_URL}/rest/v1/usuarios`;

  try {
    // ── listar ────────────────────────────────────────────────────────────
    if (accion === 'listar') {
      const sp = new URLSearchParams();
      sp.set('select', COLS);

      if (body.activos === true) sp.append('activo', 'eq.true');

      if (Array.isArray(body.ids)) {
        const ids = body.ids.map(x => String(x || '').trim()).filter(x => UUID_RE.test(x));
        if (!ids.length) {
          // No hay ids válidos → devolver vacío sin pegarle a la BD.
          return { statusCode: 200, headers, body: JSON.stringify({ ok: true, usuarios: [] }) };
        }
        sp.append('id', `in.(${ids.join(',')})`);
      }

      if (typeof body.rol === 'string' && ROLES_VALIDOS.includes(body.rol)) {
        sp.append('rol', `eq.${body.rol}`);
      }
      if (typeof body.correo === 'string' && body.correo.trim()) {
        const correo = body.correo.trim().toLowerCase().slice(0, 160);
        sp.append('correo', `eq.${correo}`);
      }

      const orden = body.orden === 'strikes' ? 'strikes.desc' : 'nombre.asc';
      sp.set('order', orden);

      // [PERF v1] Límite de seguridad para el listar global. Antes traía la
      // tabla completa sin tope (causa del "a veces no cargan los usuarios" en
      // red lenta). El equipo real son decenas, así que 500 muestra lo mismo
      // que hoy con margen de sobra. Reglas:
      //   · Si viene `ids`, NO se topa por debajo de la cantidad pedida — los
      //     mapas de nombres por id nunca se truncan (in.(...) ya acota).
      //   · `body.limit` explícito manda (cap duro 2000) para callers que
      //     necesiten más de forma consciente.
      let limit = parseInt(body.limit, 10);
      if (!Number.isInteger(limit) || limit < 1) limit = 500;
      if (limit > 2000) limit = 2000;
      if (Array.isArray(body.ids) && body.ids.length > limit) limit = Math.min(body.ids.length, 2000);
      sp.set('limit', String(limit));

      const r = await fetch(`${base}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      const usuarios = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, usuarios }) };
    }

    // ── obtener ───────────────────────────────────────────────────────────
    if (accion === 'obtener') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const sp = new URLSearchParams();
      sp.set('select', COLS);
      sp.append('id', `eq.${id}`);
      sp.set('limit', '1');
      const r = await fetch(`${base}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, usuario: rows[0] || null }) };
    }

    // ── verificar_username ────────────────────────────────────────────────
    if (accion === 'verificar_username') {
      const username = String(body.username || '').trim().toLowerCase();
      if (!username) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'username requerido' }) };
      }
      const sp = new URLSearchParams();
      sp.set('select', 'id');
      sp.append('username', `eq.${encodeURIComponent(username)}`);
      sp.set('limit', '1');
      const r = await fetch(`${base}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      const rows = await r.json();
      const excludeId = String(body.excludeId || '').trim();
      const tomadoPorOtro = rows.some(u => u.id !== excludeId);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, disponible: !tomadoPorOtro }) };
    }

    // ── crear (invitación) ────────────────────────────────────────────────
    if (accion === 'crear') {
      const correo = String(body.correo || '').trim().toLowerCase();
      const rol = String(body.rol || '').trim();
      if (!correo || correo.length > 160 || !correo.includes('@')) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'correo inválido' }) };
      }
      if (!ROLES_VALIDOS.includes(rol)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'rol inválido' }) };
      }
      // Solo maestro_roshi puede invitar a otro admin (anti escalación).
      if (ROLES_ADMIN.includes(rol) && jwtRol !== 'maestro_roshi') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo maestro_roshi puede crear admins' }) };
      }
      const invite_token = crypto.randomUUID();
      const invite_expires_at = new Date(Date.now() + 48 * 3600000).toISOString();
      const fila = {
        correo, nombre: correo.split('@')[0], rol, activo: false,
        invite_token, invite_usado: false, invite_expires_at, password_hash: null,
      };
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
      const u = rows[0] || {};
      // Devolvemos invite_token SOLO en la creación, para que el front arme el
      // link de la invitación. No es lectura de PII de un tercero.
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ ok: true, usuario: { id: u.id, correo: u.correo, nombre: u.nombre, rol: u.rol, invite_token } }),
      };
    }

    // ── actualizar ────────────────────────────────────────────────────────
    if (accion === 'actualizar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const patch = (body.patch && typeof body.patch === 'object') ? body.patch : {};
      const esSelf = id === jwtUserId;

      // Editar a OTRO usuario exige rol admin.
      if (!esSelf && !ROLES_ADMIN.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Sin permiso para editar a otro usuario' }) };
      }

      // Si el objetivo es un admin distinto, solo maestro_roshi puede tocarlo.
      if (!esSelf) {
        const tr = await fetch(`${base}?id=eq.${id}&select=rol&limit=1`, { headers: sbHeaders });
        if (tr.ok) {
          const trows = await tr.json();
          const targetRol = trows[0] && trows[0].rol;
          if (ROLES_ADMIN.includes(targetRol) && jwtRol !== 'maestro_roshi') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo maestro_roshi puede editar a otro admin' }) };
          }
        }
      }

      const allowed = esSelf ? SELF_FIELDS : SELF_FIELDS.concat(ADMIN_FIELDS);
      const update = {};
      for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) update[k] = patch[k];
      }

      // Validaciones de campos sensibles.
      if (Object.prototype.hasOwnProperty.call(update, 'rol') && !ROLES_VALIDOS.includes(update.rol)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'rol inválido' }) };
      }
      // Guard de jerarquía (server-side, defensa en profundidad): SOLO maestro_roshi
      // puede otorgar/cambiar un rol ADMIN (maestro_roshi/bulma), y NADIE salvo
      // maestro_roshi cambia su PROPIO rol. Blinda contra escalada aunque a un rol
      // no-admin (p.ej. milk) se le abriera algún permiso por error.
      if (Object.prototype.hasOwnProperty.call(update, 'rol')) {
        if (esSelf && jwtRol !== 'maestro_roshi') {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes cambiar tu propio rol' }) };
        }
        if (ROLES_ADMIN.includes(update.rol) && jwtRol !== 'maestro_roshi') {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo maestro_roshi puede otorgar el rol de maestro_roshi/bulma' }) };
        }
      }
      if (Object.prototype.hasOwnProperty.call(update, 'strikes')) {
        const s = Number(update.strikes);
        if (!Number.isInteger(s) || s < 0 || s > 3) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'strikes fuera de rango (0-3)' }) };
        }
        update.strikes = s;
      }
      if (Object.prototype.hasOwnProperty.call(update, 'activo')) {
        update.activo = !!update.activo;
      }

      // username: normaliza y verifica unicidad server-side.
      if (Object.prototype.hasOwnProperty.call(update, 'username')) {
        const uname = String(update.username || '').trim().toLowerCase().replace(/\s+/g, '');
        if (!uname) {
          delete update.username;
        } else {
          const cr = await fetch(`${base}?username=eq.${encodeURIComponent(uname)}&select=id&limit=1`, { headers: sbHeaders });
          if (cr.ok) {
            const crows = await cr.json();
            if (crows.some(u => u.id !== id)) {
              return { statusCode: 409, headers, body: JSON.stringify({ error: 'Ese nombre de usuario ya está tomado' }) };
            }
          }
          update.username = uname;
        }
      }

      // password: acepta SOLO texto plano en `patch.password`, se hashea aquí.
      // Cualquier password_hash que mande el cliente se ignora (anti texto-plano).
      if (patch.password) {
        const plain = String(patch.password);
        if (plain.length < 6 || plain.length > 200) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'La contraseña debe tener 6-200 caracteres' }) };
        }
        update.password_hash = await bcrypt.hash(plain, BCRYPT_COST);
      }

      if (!Object.keys(update).length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nada que actualizar' }) };
      }

      const r = await fetch(`${base}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(update),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-usuarios', detail: e.message }) };
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
