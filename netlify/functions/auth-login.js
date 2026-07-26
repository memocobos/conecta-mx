// =============================================================================
// auth-login.js — Login de Kamehouse migrado a Netlify Function
//
// Reemplaza la query directa con anon key que hacía kamehouse.html → usuarios.
// Acá:
//   - service_role hace el lookup (anon ya no necesita acceso a usuarios)
//   - rate limiting básico por IP en tabla kh_auth_attempts (5 intentos / 15 min)
//   - JWT HS256 firmado, expira en 8 horas
//
// Body JSON: { credentials: <correo o username>, password: <string> }
// Devuelve : { ok: true, token: '<JWT>', user: { id, correo, nombre, rol, ... } }
//
// Passwords: solo bcrypt.
//   La columna `usuarios.password_hash` está migrada a bcrypt cost 10
//   (verificado en vivo: 17/17 usuarios con hash '$2…'). Solo bcrypt.compare
//   es válido; cualquier hash que no empiece con '$2' = no match (login
//   rechazado). El fallback temporal de texto plano ya fue eliminado.
//
// Env vars requeridas:
//   - SUPABASE_URL_KAMEHOUSE
//   - SUPABASE_SERVICE_KEY_KAMEHOUSE
//   - JWT_SECRET  (generar con: openssl rand -hex 32)
// =============================================================================

const { jwtSign, corsCheck, corsHeaders, jsonError, ALLOWED_ORIGINS } = require('./_lib/verify-admin');
const bcrypt = require('bcryptjs');

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const JWT_SECRET = process.env.JWT_SECRET;

const JWT_TTL_SECONDS = 8 * 60 * 60;          // 8 horas
const RATE_LIMIT_WINDOW_SEC = 15 * 60;         // ventana de 15 minutos

// 🔐 CAP2-2 — RATE LIMIT DOBLE.
// Antes solo se contaba por IP, con el mismo tope de 5 para todo. Dos problemas:
//   · un ataque contra UNA cuenta desde muchas IPs (botnet, VPN rotativa) no
//     tocaba el contador: 5 intentos por IP × N IPs = intentos ilimitados;
//   · una oficina con NAT compartido se bloqueaba sola: 5 personas
//     equivocándose una vez cada una tumbaban el login de todas.
// Ahora se cuenta por IP **y** por USUARIO OBJETIVO, con topes distintos:
// el de IP sube (la IP es un identificador burdo y compartido), el de usuario
// se queda apretado (identifica a UNA cuenta). Bloquea si CUALQUIERA excede.
const RATE_LIMIT_MAX_IP   = 20;                // 20 intentos / 15 min por IP
const RATE_LIMIT_MAX_USER = 5;                 // 5 intentos / 15 min por cuenta

// Config de cada contador: tabla, columna llave y tope.
const RL_IP   = { tabla: 'kh_auth_attempts',      col: 'ip',   max: RATE_LIMIT_MAX_IP };
const RL_USER = { tabla: 'kh_auth_attempts_user', col: 'cred', max: RATE_LIMIT_MAX_USER };

// 🔐 CAP2-2 — HASH SEÑUELO contra la ENUMERACIÓN DE USUARIOS.
// Antes, si el usuario no existía se respondía SIN ejecutar bcrypt: la respuesta
// volvía en milisegundos contra las ~60-80 ms de un compare real, así que
// cronometrando se podía averiguar qué cuentas existen. Ahora el camino
// "usuario inexistente" gasta el MISMO trabajo: compara contra este hash, que es
// un bcrypt cost 10 real de una contraseña aleatoria que nadie conoce. El
// resultado se descarta; el mensaje es siempre el mismo.
const HASH_SENUELO = '$2b$10$.K6FKLZ86q2HK9L9ibF88eIswBKBnJU4T2pBQgehj8LKoRmCNo94a';

function badRequest(event, status, error) {
  return {
    statusCode: status,
    headers: corsHeaders(event),
    body: JSON.stringify({ ok: false, error }),
  };
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return badRequest(event, 405, 'Método no permitido');
  }

  // Origin check — solo conectareynosa.mx puede hacer login.
  // Bloquea curl scripted / sitios maliciosos haciendo CSRF.
  if (!corsCheck(event)) {
    return badRequest(event, 403, 'Origen no permitido');
  }

  if (!SB_URL || !SB_KEY) return badRequest(event, 500, 'Supabase no configurado');
  if (!JWT_SECRET)        return badRequest(event, 500, 'JWT_SECRET no configurado');

  // ── Parse body ──
  let data;
  try { data = JSON.parse(event.body || '{}'); }
  catch (e) { return badRequest(event, 400, 'JSON inválido'); }

  const credentials = String(data.credentials || '').trim().toLowerCase();
  const password    = String(data.password || '');
  if (!credentials || credentials.length < 3 || credentials.length > 120) {
    return badRequest(event, 400, 'credentials inválido');
  }
  if (!password || password.length < 1 || password.length > 200) {
    return badRequest(event, 400, 'password inválido');
  }

  // ── IP del cliente para rate limiting ──
  const ip = event.headers['x-nf-client-connection-ip']
          || event.headers['client-ip']
          || (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || 'unknown';

  // ── Rate limit DOBLE: por IP y por usuario objetivo ──
  // Los dos contadores se evalúan SIEMPRE (no se corta en el primero) para que
  // el intento quede registrado en ambos lados. Si cualquiera excede su tope,
  // se responde 429. La respuesta es IDÉNTICA en los dos casos —mismo status,
  // mismo cuerpo, mismo Retry-After— para no revelar cuál disparó: decir "te
  // bloqueé por usuario" ya confirmaría que la cuenta existe.
  const [rlIp, rlUser] = await Promise.all([
    checkAndIncrementRateLimit(RL_IP, ip),
    checkAndIncrementRateLimit(RL_USER, credentials),
  ]);
  if (rlIp.blocked || rlUser.blocked) {
    const retryAfterSec = Math.max(rlIp.retryAfterSec || 0, rlUser.retryAfterSec || 0) || 60;
    return {
      statusCode: 429,
      headers: { ...corsHeaders(event), 'Retry-After': String(retryAfterSec) },
      body: JSON.stringify({
        ok: false,
        error: 'Demasiados intentos. Intenta de nuevo en ' + Math.ceil(retryAfterSec / 60) + ' minutos.',
      }),
    };
  }

  // ── Lookup en usuarios con service_role ──
  // Buscar por correo O username, activo=true.
  // El campo `credentials` puede ser un email o un username — probamos ambos.
  const isEmail = credentials.includes('@');
  const filterField = isEmail ? 'correo' : 'username';
  const lookupUrl = `${SB_URL}/rest/v1/usuarios?${filterField}=eq.${encodeURIComponent(credentials)}&activo=eq.true&select=id,correo,nombre,rol,password_hash,strikes,username,permisos_extra,tema_acento&limit=1`;

  let user;
  try {
    const r = await fetch(lookupUrl, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
    });
    if (!r.ok) {
      console.error('[auth-login] lookup error', r.status, await r.text());
      return badRequest(event, 502, 'Error consultando usuarios');
    }
    const rows = await r.json();
    user = rows[0];
  } catch (e) {
    console.error('[auth-login] lookup exception', e.message);
    return badRequest(event, 502, 'Error de red consultando usuarios');
  }

  // ── Compare password ──
  // Solo bcrypt: si password_hash empieza con '$2' → bcrypt.compare.
  // Cualquier otro valor = no match (login rechazado).
  //
  // 🔐 CAP2-2: si el usuario NO existe se compara igual contra el hash señuelo y
  // se tira el resultado. Cuesta lo mismo que un compare real, así que el
  // atacante ya no puede distinguir "cuenta inexistente" de "contraseña mala"
  // cronometrando la respuesta. Mismo mensaje en ambos casos.
  if (!user) {
    try { await bcrypt.compare(password, HASH_SENUELO); } catch (_) { /* se descarta */ }
    return badRequest(event, 401, 'Credenciales inválidas');
  }
  if (!(await passwordMatches(password, user.password_hash || ''))) {
    return badRequest(event, 401, 'Credenciales inválidas');
  }

  // ── Marcar ultimo_acceso (fire-and-forget) ──
  fetch(`${SB_URL}/rest/v1/usuarios?id=eq.${user.id}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ultimo_acceso: new Date().toISOString() }),
  }).catch(() => {});

  // ── Registrar la conexión (append-only) para el tablero de conexiones del
  //    Resumen (solo Memo lo ve). ultimo_acceso se sobrescribe; esta tabla
  //    conserva CADA login → permite "primera del día" + historial. Fire-and-
  //    forget: JAMÁS bloquea ni rompe el login si la tabla no existe/falla. ──
  fetch(`${SB_URL}/rest/v1/kh_conexiones`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ usuario_id: user.id, ts: new Date().toISOString() }),
  }).catch(() => {});

  // ── Reset de AMBOS contadores en login exitoso ──
  // Quien entra bien limpia su cuenta Y la IP desde la que entró: un tecleo
  // torpe no debe dejar castigada ni a la persona ni a la oficina.
  resetRateLimit(RL_IP, ip).catch(() => {});
  resetRateLimit(RL_USER, credentials).catch(() => {});

  // ── Firmar JWT ──
  const tokenPayload = {
    id: user.id,
    correo: user.correo,
    rol: user.rol,
    sub: user.id,
  };
  const token = jwtSign(tokenPayload, JWT_SECRET, JWT_TTL_SECONDS);

  return {
    statusCode: 200,
    headers: corsHeaders(event),
    body: JSON.stringify({
      ok: true,
      token,
      ttl: JWT_TTL_SECONDS,
      user: {
        id: user.id,
        correo: user.correo,
        nombre: user.nombre,
        rol: user.rol,
        username: user.username,
        strikes: user.strikes,
        permisos_extra: user.permisos_extra,
        tema_acento: user.tema_acento,
      },
    }),
  };
};

// ───────────────────────────────────────────────────────────────────────
// Rate limiting helpers
// ───────────────────────────────────────────────────────────────────────

// Compara password contra hash bcrypt. Solo se acepta bcrypt: si el hash no
// empieza con '$2' (caso que ya no debería ocurrir — todos migrados) devuelve
// false en vez de lanzar, para rechazar el login limpiamente.
async function passwordMatches(plain, stored) {
  if (!stored || !stored.startsWith('$2')) return false;
  try { return await bcrypt.compare(plain, stored); }
  catch (_) { return false; }
}

// Incrementa el contador de UN eje (IP o usuario). Si excede su tope dentro de
// la ventana, devuelve { blocked:true, retryAfterSec }.
//
// FAIL-OPEN a propósito (igual que antes): si la tabla no existe o la consulta
// falla, se permite el intento. Un rate-limit roto NO debe dejar a nadie fuera
// de su propio sistema; el candado real es la contraseña.
//
// 🔐 CAP2-2 — SIN UPSERT ENCUBIERTO. El insert usaba
// `Prefer: resolution=merge-duplicates`, que ES un upsert (on_conflict) con otro
// nombre: exactamente el patrón que la casa prohíbe porque tapa carreras y
// muerde con 42P10 cuando el índice no es el que PostgREST supone. Ahora:
// INSERT directo → si choca (409/23505) es que otro request ganó la carrera →
// se relee y se hace PATCH. Lo mismo en las DOS tablas.
async function checkAndIncrementRateLimit(cfg, clave) {
  const key = String(clave || '');
  if (!key || key === 'unknown') return { blocked: false }; // sin llave no se cuenta
  const now = Date.now();
  const windowStartMs = now - RATE_LIMIT_WINDOW_SEC * 1000;
  const nowIso = new Date(now).toISOString();
  const base = `${SB_URL}/rest/v1/${cfg.tabla}`;
  const filtro = `${cfg.col}=eq.${encodeURIComponent(key)}`;
  const h = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  const hJson = { ...h, 'Content-Type': 'application/json' };

  try {
    const existing = await leerFila(base, filtro, h);
    if (existing === undefined) return { blocked: false };   // tabla caída → fail-open

    if (!existing) {
      // Primer intento en la ventana → INSERT DIRECTO (jamás merge-duplicates).
      const ins = await fetch(base, {
        method: 'POST',
        headers: { ...hJson, Prefer: 'return=minimal' },
        body: JSON.stringify({ [cfg.col]: key, attempts: 1, window_start: nowIso, last_attempt: nowIso }),
      });
      if (!ins.ok) {
        const detail = await ins.text().catch(() => '');
        // Carrera: otro request insertó primero. Se relee y se incrementa.
        if (ins.status === 409 || /23505|duplicate key/i.test(detail)) {
          const fila = await leerFila(base, filtro, h);
          if (fila) await patchFila(base, filtro, hJson, { attempts: (fila.attempts || 0) + 1, last_attempt: nowIso });
        } else {
          console.warn(`[auth-login] rate-limit insert ${cfg.tabla}`, ins.status);
        }
      }
      return { blocked: false };
    }

    const windowStart = new Date(existing.window_start).getTime();
    if (!Number.isFinite(windowStart) || windowStart < windowStartMs) {
      // Ventana vencida → arranca uno nuevo.
      await patchFila(base, filtro, hJson, { attempts: 1, window_start: nowIso, last_attempt: nowIso });
      return { blocked: false };
    }

    if ((existing.attempts || 0) >= cfg.max) {
      const retryAfterSec = Math.max(1, Math.ceil((windowStart + RATE_LIMIT_WINDOW_SEC * 1000 - now) / 1000));
      return { blocked: true, retryAfterSec };
    }

    await patchFila(base, filtro, hJson, { attempts: (existing.attempts || 0) + 1, last_attempt: nowIso });
    return { blocked: false };
  } catch (e) {
    console.warn(`[auth-login] rate-limit exception ${cfg.tabla}`, e.message);
    return { blocked: false }; // fail-open
  }
}

// Fila actual o null si no hay. `undefined` = no se pudo leer (fail-open).
async function leerFila(base, filtro, h) {
  const r = await fetch(`${base}?${filtro}&select=*&limit=1`, { headers: h });
  if (!r.ok) {
    console.warn('[auth-login] rate-limit lookup', r.status);
    return undefined;
  }
  const rows = await r.json().catch(() => []);
  return (Array.isArray(rows) && rows[0]) || null;
}

async function patchFila(base, filtro, hJson, patch) {
  return fetch(`${base}?${filtro}`, {
    method: 'PATCH',
    headers: { ...hJson, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
}

// Resetea un contador tras login exitoso.
async function resetRateLimit(cfg, clave) {
  const key = String(clave || '');
  if (!key || key === 'unknown') return;
  await fetch(`${SB_URL}/rest/v1/${cfg.tabla}?${cfg.col}=eq.${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
  });
}

// Expuestos para el arnés (patrón de la casa).
module.exports.__RL_IP = RL_IP;
module.exports.__RL_USER = RL_USER;
module.exports.__HASH_SENUELO = HASH_SENUELO;
