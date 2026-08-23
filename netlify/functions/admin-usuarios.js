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
//   - accion='cerrar_sesiones' : SOLO maestro_roshi/bulma (contra otro admin,
//        solo maestro_roshi). { id } → marca sesiones_invalidas_antes = ahora:
//        todos sus tokens vigentes dejan de servir en ≤60 s. 🔐 CAP2-3.
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
//   - SUPABASE_URL_KAMEHOUSE
//   - SUPABASE_SERVICE_KEY_KAMEHOUSE
//   - JWT_SECRET (lo lee verifyAdminAuthLive)
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const BCRYPT_COST = 10;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ROLES_VALIDOS = ['maestro_roshi', 'bulma', 'mister_popo', 'coordinador', 'cc', 'milk'];
const ROLES_ADMIN = ['maestro_roshi', 'bulma'];
// Roles de alto privilegio cuya CREACIÓN (invitación) queda reservada a
// maestro_roshi (anti escalación). Incluye `milk` aunque NO sea ROLES_ADMIN:
// milk vive justo debajo de bulma y un bulma no debe poder crear ni un bulma ni
// un milk. Ojo: se usa SOLO para gatear 'crear' — NO cambia la semántica de
// ROLES_ADMIN (editar/borrar a terceros), que milk sigue sin tener.
const ROLES_INVITA_SOLO_ROSHI = ['maestro_roshi', 'bulma', 'milk'];

// Whitelist de columnas que SÍ pueden viajar al navegador. password_hash,
// invite_token, invite_usado e invite_expires_at quedan EXCLUIDOS a propósito.
const COLS_ADMIN_ARR = [
  'id', 'nombre', 'username', 'correo', 'correo_notif', 'celular', 'rol',
  'activo', 'strikes', 'foto_url', 'talla_playera', 'fecha_nacimiento',
  'num_emergencia', 'nombre_emergencia', 'parentesco_emergencia', 'template_sugerido', 'tema_acento',
  'perfil_completo', 'permisos_extra', 'creado_en', 'ultimo_acceso',
];
const COLS = COLS_ADMIN_ARR.join(',');   // (nombre histórico; sigue siendo la query)

// 🔐 CAP2-1 — PRIVACIDAD DEL DIRECTORIO.
// `listar`/`obtener` NO exigen rol admin a propósito: los usan los mapas de
// nombres de medio KameHouse (Torre, reportes, asignaciones, Guerreros Z…). El
// efecto colateral era que CUALQUIER usuario logueado recibía correo, celular,
// fecha_nacimiento, num_emergencia, nombre_emergencia y strikes de TODO el
// equipo. No es escalada ni fuga externa: es privacidad interna.
//
// Ahora la respuesta se PROYECTA POR ROL en el servidor (nunca en el cliente):
//   · rol administrativo → todas las columnas de la whitelist;
//   · cualquier otro rol → solo lo mínimo para pintar nombres y vistas de
//     equipo… salvo SU PROPIA fila, que llega completa (cada quien ve lo suyo).
const COLS_BASICO_ARR = [
  'id', 'nombre', 'username', 'rol', 'activo', 'foto_url', 'tema_acento',
  'perfil_completo', 'template_sugerido',
];
const COLS_BASICO = new Set(COLS_BASICO_ARR);

// Quién ve el directorio completo: los admins de verdad + milk (paridad
// operativa con bulma) + mister_popo (cuidador: necesita contactar a quien trae
// material de bodega).
const ROLES_VE_DIRECTORIO = [...ROLES_ADMIN, 'milk', 'mister_popo'];

// 🎂 CAP2-1 (decisión de Memo) — el pastelito de cumpleaños sobrevive para
// TODOS, pero la fecha de nacimiento NO viaja. En vez del dato crudo, la
// proyección básica lleva un BOOLEANO calculado aquí, en hora de Monterrey.
//
// Se manda SOLO `cumple_hoy` a propósito: es lo único que la UI pregunta (¿pinto
// el 🎂?). Mandar también mes/día permitiría reconstruir la fecha completa
// juntando respuestas de días distintos — justo lo que se quiere evitar.
function _hoyMesDiaMx() {
  // 'YYYY-MM-DD' en Monterrey → 'MM-DD'.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' }).slice(5);
}
function esCumpleHoyMx(fechaNac, hoyMesDia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaNac || ''));
  if (!m) return false;
  return `${m[2]}-${m[3]}` === (hoyMesDia || _hoyMesDiaMx());
}

// Recorta una fila a COLS_BASICO. La fila del PROPIO usuario pasa completa.
function proyectarUsuario(u, jwtUserId, hoyMesDia) {
  if (!u || typeof u !== 'object') return u;
  if (jwtUserId && String(u.id) === String(jwtUserId)) return u;
  const out = {};
  for (const k of COLS_BASICO_ARR) {
    if (Object.prototype.hasOwnProperty.call(u, k)) out[k] = u[k];
  }
  // Derivado NO sensible: sustituye a fecha_nacimiento para el 🎂.
  out.cumple_hoy = esCumpleHoyMx(u.fecha_nacimiento, hoyMesDia);
  return out;
}

// Proyecta una lista según el rol del JWT.
function proyectarLista(filas, jwtRol, jwtUserId) {
  if (ROLES_VE_DIRECTORIO.includes(jwtRol)) return filas;
  // El 'MM-DD' de hoy se calcula UNA sola vez por request (no por fila) para que
  // toda la lista sea coherente aunque la corrida cruce la medianoche.
  const hoyMesDia = _hoyMesDiaMx();
  return (Array.isArray(filas) ? filas : []).map((u) => proyectarUsuario(u, jwtUserId, hoyMesDia));
}

// Formato de correo razonable para el filtro de `listar` (higiene: no mandar
// basura al operador eq. de PostgREST).
const CORREO_RE = /^[^\s@,()<>]+@[^\s@,()<>]+\.[a-z]{2,}$/i;

// Campos que un usuario puede editar de SU PROPIO perfil.
const SELF_FIELDS = [
  'nombre', 'username', 'celular', 'talla_playera', 'fecha_nacimiento',
  'correo_notif', 'nombre_emergencia', 'num_emergencia', 'parentesco_emergencia', 'template_sugerido',
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

  const auth = await verifyAdminAuthLive(event, rolesPermitidos);
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
        // 🔐 CAP2-1 (higiene): formato razonable ANTES de mandarlo a PostgREST.
        if (!CORREO_RE.test(correo)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'correo inválido' }) };
        }
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
      // 🔐 CAP2-1: una sola query (COLS_ADMIN) y RECORTE aquí según el rol del
      // JWT. Se eligió una query en vez de dos porque el viaje a la BD es el
      // mismo con o sin columnas sensibles, y así la regla de privacidad vive
      // en UN solo lugar auditable en vez de repartida en dos SELECTs que
      // podrían desincronizarse. La fila propia nunca se recorta.
      const proyectados = proyectarLista(usuarios, jwtRol, jwtUserId);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, usuarios: proyectados }) };
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
      // 🔐 CAP2-1: `obtener` tenía EXACTAMENTE el mismo hueco que `listar`
      // (cualquier rol logueado podía pedir la ficha completa de cualquier id,
      // de uno en uno). Mismo criterio: admins ven todo, el resto solo lo
      // básico, y la ficha propia siempre completa.
      const uno = rows[0] || null;
      const unoProyectado = (uno && !ROLES_VE_DIRECTORIO.includes(jwtRol))
        ? proyectarUsuario(uno, jwtUserId)
        : uno;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, usuario: unoProyectado }) };
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
      // Solo maestro_roshi puede invitar roles de alto privilegio (bulma/milk).
      // Anti escalación: un bulma no puede crear otro bulma ni un milk.
      if (ROLES_INVITA_SOLO_ROSHI.includes(rol) && jwtRol !== 'maestro_roshi') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo maestro_roshi puede crear ese rol' }) };
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
      let targetRol = null, targetActivo = null;
      if (!esSelf) {
        const tr = await fetch(`${base}?id=eq.${id}&select=rol,activo&limit=1`, { headers: sbHeaders });
        if (tr.ok) {
          const trows = await tr.json();
          targetRol = (trows[0] && trows[0].rol) || null;
          targetActivo = trows[0] ? !!trows[0].activo : null;
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
        // 🔐 CAP2-2: mínimo unificado a 8 (igual que reset-password y
        // registro-invitado). Este es el tercer punto de cambio de contraseña:
        // auto-edición de perfil y edición de un admin sobre otra persona.
        if (plain.length < 8 || plain.length > 200) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'La contraseña debe tener 8-200 caracteres' }) };
        }
        update.password_hash = await bcrypt.hash(plain, BCRYPT_COST);
      }

      // 🔐 CAP2-3: desactivar a alguien DEBE sacarlo de sus sesiones abiertas. Sin
      // esto, activo:false no surtía efecto hasta que expirara su token (8 h).
      if (Object.prototype.hasOwnProperty.call(update, 'activo') && update.activo === false) {
        update.sesiones_invalidas_antes = new Date().toISOString();
      }

      // [VEN-BORRA-1e] Aquí se limpiaba el sello de inactividad al reactivar a un
      // vendedor, escribiendo `vendedor_bloqueado_at` y `vendedor_reactivado_at`.
      // Esas DOS COLUMNAS las suelta VEN-BORRA-1d: dejar el escribo habría hecho
      // fallar el PATCH entero —o sea, reactivar a CUALQUIER usuario— la primera
      // vez que alguien reactivara una cuenta después de la migración.

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

    // ── 🔐 CAP2-3 cerrar_sesiones: el botón de "sácalo de todos lados" ──────
    // Marca sesiones_invalidas_antes = ahora SIN desactivar la cuenta: todo token
    // emitido antes de este instante deja de servir en ≤60 s (la caché de
    // _lib/sesion-viva). Para un celular perdido, una salida en malos términos o
    // una contraseña comprometida.
    if (accion === 'cerrar_sesiones') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      if (!ROLES_ADMIN.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Sin permiso para cerrar sesiones' }) };
      }
      // MISMA jerarquía que editar a otro: contra otro admin, solo maestro_roshi.
      if (id !== jwtUserId) {
        const tr = await fetch(`${base}?id=eq.${id}&select=rol&limit=1`, { headers: sbHeaders });
        if (tr.ok) {
          const trows = await tr.json().catch(() => []);
          const targetRol = trows[0] && trows[0].rol;
          if (ROLES_ADMIN.includes(targetRol) && jwtRol !== 'maestro_roshi') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo maestro_roshi puede cerrar las sesiones de otro admin' }) };
          }
        }
      }
      const ahora = new Date().toISOString();
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ sesiones_invalidas_antes: ahora }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudieron cerrar las sesiones', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sesiones_invalidas_antes: ahora }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-usuarios', detail: e.message }) };
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

// Expuestos para el arnés (patrón de la casa).
module.exports.__COLS_ADMIN = COLS_ADMIN_ARR;
module.exports.__COLS_BASICO = COLS_BASICO_ARR;
module.exports.__ROLES_VE_DIRECTORIO = ROLES_VE_DIRECTORIO;
module.exports.__proyectarUsuario = proyectarUsuario;
module.exports.__esCumpleHoyMx = esCumpleHoyMx;
