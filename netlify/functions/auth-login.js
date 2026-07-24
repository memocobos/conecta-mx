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
//   - SUPABASE_URL_KAMEHOUSE  (fallback SUPABASE_URL)
//   - SUPABASE_SERVICE_KEY_KAMEHOUSE  (fallback SUPABASE_SERVICE_KEY / _ROLE_KEY)
//   - JWT_SECRET  (generar con: openssl rand -hex 32)
// =============================================================================

const { jwtSign, corsCheck, corsHeaders, jsonError, ALLOWED_ORIGINS } = require('./_lib/verify-admin');
const bcrypt = require('bcryptjs');

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
            || process.env.SUPABASE_SERVICE_KEY
            || process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const JWT_TTL_SECONDS = 8 * 60 * 60;          // 8 horas
const RATE_LIMIT_MAX = 5;                      // 5 intentos
const RATE_LIMIT_WINDOW_SEC = 15 * 60;         // ventana de 15 minutos

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

  // ── Rate limit check: 5 intentos en ventana de 15 min ──
  // La tabla kh_auth_attempts (ver supabase-stop-the-bleed.sql) tiene
  // (ip PRIMARY KEY, attempts int, window_start timestamptz).
  // Si attempts >= MAX y la ventana no ha vencido → bloquear.
  const rl = await checkAndIncrementRateLimit(ip);
  if (rl.blocked) {
    return {
      statusCode: 429,
      headers: { ...corsHeaders(event), 'Retry-After': String(rl.retryAfterSec) },
      body: JSON.stringify({
        ok: false,
        error: 'Demasiados intentos. Intenta de nuevo en ' + Math.ceil(rl.retryAfterSec / 60) + ' minutos.',
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
  if (!user || !(await passwordMatches(password, user.password_hash || ''))) {
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

  // ── Reset rate limit del IP en login exitoso ──
  resetRateLimit(ip).catch(() => {});

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

// Incrementa el contador. Si excede MAX dentro de la ventana, devuelve blocked.
async function checkAndIncrementRateLimit(ip) {
  if (ip === 'unknown') return { blocked: false }; // no rate-limitamos sin IP
  const now = Date.now();
  const windowStartMs = now - RATE_LIMIT_WINDOW_SEC * 1000;
  const nowIso = new Date(now).toISOString();

  try {
    // Lee el registro actual
    const r = await fetch(
      `${SB_URL}/rest/v1/kh_auth_attempts?ip=eq.${encodeURIComponent(ip)}&select=*&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    );
    if (!r.ok) {
      // Si la tabla no existe (404) o falla, permitimos el login pero logueamos.
      // Stop the Bleed: no quiero que rate-limit roto bloquee logins legítimos.
      console.warn('[auth-login] rate-limit table lookup', r.status);
      return { blocked: false };
    }
    const rows = await r.json();
    const existing = rows[0];

    if (!existing) {
      // Primer intento — insert
      await fetch(`${SB_URL}/rest/v1/kh_auth_attempts`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ ip, attempts: 1, window_start: nowIso }),
      });
      return { blocked: false };
    }

    const windowStart = new Date(existing.window_start).getTime();
    if (windowStart < windowStartMs) {
      // Ventana expirada — reiniciar contador
      await fetch(`${SB_URL}/rest/v1/kh_auth_attempts?ip=eq.${encodeURIComponent(ip)}`, {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY,
          Authorization: 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attempts: 1, window_start: nowIso }),
      });
      return { blocked: false };
    }

    if (existing.attempts >= RATE_LIMIT_MAX) {
      const retryAfterSec = Math.max(1, Math.ceil((windowStart + RATE_LIMIT_WINDOW_SEC * 1000 - now) / 1000));
      return { blocked: true, retryAfterSec };
    }

    // Incrementar
    await fetch(`${SB_URL}/rest/v1/kh_auth_attempts?ip=eq.${encodeURIComponent(ip)}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ attempts: existing.attempts + 1 }),
    });
    return { blocked: false };
  } catch (e) {
    console.warn('[auth-login] rate-limit exception', e.message);
    return { blocked: false }; // fail-open
  }
}

// Resetea contador tras login exitoso.
async function resetRateLimit(ip) {
  if (ip === 'unknown') return;
  await fetch(`${SB_URL}/rest/v1/kh_auth_attempts?ip=eq.${encodeURIComponent(ip)}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
  });
}
