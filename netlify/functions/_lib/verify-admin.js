// =============================================================================
// verify-admin.js — Helper de verificación de JWT para Netlify Functions admin
//
// JWT HS256 firmado con JWT_SECRET. Payload mínimo:
//   { id, correo, rol, exp (segundos UTC) }
//
// Uso:
//   const { verifyAdminAuth, jsonError, corsCheck } = require('./_lib/verify-admin');
//   const auth = verifyAdminAuth(event, ['maestro_roshi', 'bulma']);
//   if (!auth.valid) return jsonError(auth.status, auth.error);
//   // auth.user.id, auth.user.correo, auth.user.rol disponibles
//
// Está en `_lib/` (subcarpeta) — Netlify NO auto-registra como function,
// es solo módulo helper requerido por las functions reales.
// =============================================================================

const crypto = require('crypto');
const { verificarSesionViva } = require('./sesion-viva');

const JWT_SECRET = process.env.JWT_SECRET;

// Producción. En dev local, NETLIFY_DEV=true se setea automáticamente por
// `netlify dev` y agregamos los orígenes localhost en corsCheck().
const ALLOWED_ORIGINS = [
  'https://conectareynosa.mx',
  'https://www.conectareynosa.mx',
];

const ALLOWED_ORIGINS_DEV = [
  'http://localhost:8888',
  'http://localhost:3999',
  'http://127.0.0.1:8888',
];

// Subdominios `<branch-o-pr>--conectareynosa.netlify.app` que Netlify genera
// para deploy previews y branch deploys. Regex anclado a inicio/fin para
// rechazar sufijos maliciosos (p.ej. https://evil--conectareynosa.netlify.app.attacker.com).
const NETLIFY_PREVIEW_RE = /^https:\/\/[a-z0-9-]+--conectareynosa\.netlify\.app$/;

// ───────────────────────────────────────────────────────────────────────
// JWT helpers (HS256 manual — sin dependencias externas)
// ───────────────────────────────────────────────────────────────────────

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(str) {
  let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function jwtSign(payload, secret, ttlSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(fullPayload));
  const sig = crypto.createHmac('sha256', secret).update(h + '.' + p).digest();
  return h + '.' + p + '.' + b64url(sig);
}

function jwtVerify(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sigStr] = parts;
  let expectedSig, providedSig;
  try {
    expectedSig = crypto.createHmac('sha256', secret).update(h + '.' + p).digest();
    providedSig = b64urlDecode(sigStr);
  } catch (e) { return null; }
  if (expectedSig.length !== providedSig.length) return null;
  if (!crypto.timingSafeEqual(expectedSig, providedSig)) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(p).toString('utf8'));
  } catch (e) { return null; }
  // [ses-1] `exp` se EXIGE, no se consulta si viene: un token sin caducidad no
  // es un token, es una llave eterna — y con `payload.exp &&` bastaba omitir el
  // campo para saltarse la expiración. `auth-login` es el único firmante y
  // siempre pasa TTL (8 h, constante en el código), así que ningún token
  // legítimo pierde validez por esto.
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ───────────────────────────────────────────────────────────────────────
// Helpers de uso público
// ───────────────────────────────────────────────────────────────────────

// Origen permitido. Devuelve el origin para usar en CORS, o null si bloquea.
// En dev (NETLIFY_DEV=true seteado por `netlify dev`) acepta localhost.
// También acepta deploy previews y branch deploys del site Netlify (regex).
// 🔒 TRES ESTADOS, NO DOS. Aquí estuvo el bug de HER-1h-FIX:
//
//   ''      → la petición NO trae header `Origin`. Es MISMA-ORIGEN.
//   <origen>→ trae `Origin` y está permitido. Se devuelve para hacerle eco.
//   null    → trae `Origin` y NO está permitido. Se rechaza.
//
// ⚠️ Por qué importa: **el navegador NO manda `Origin` en un GET mismo-origen.**
// Sí lo manda en un POST mismo-origen, y siempre en cualquier cosa cruzada. Con
// solo dos estados, "sin header" caía en el mismo cajón que "origen prohibido",
// así que la guarda rechazaba EXACTAMENTE a su propia página: `waitlist-conteo`
// devolvía 403 a `/diseno`. Se midió cambiando SOLO el método contra el mismo
// endpoint — GET 403, POST 405 con el origen de vuelta en la cabecera.
//
// Y no se pierde nada de seguridad: lo que esta guarda protege es que OTRO SITIO
// llame desde el navegador de un usuario, y en ese caso el `Origin` SIEMPRE
// viaja. Un cliente que no es navegador (curl, un servidor) puede inventarse el
// header, así que nunca estuvo tapado por aquí.
//
// Este contrato NO es nuevo: es el que `_lib/giveaway.js` ya usaba —y por eso
// los seis endpoints del giveaway nunca tuvieron este problema—. Lo que se
// arregla es que había DOS contratos en la casa y este archivo tenía el malo.
//
// ⚠️ Los 100 llamadores que gatean con `if (!__origin)` NO cambian de conducta:
// `''` es falsy, así que siguen exigiendo un `Origin` de navegador. Quien quiera
// aceptar mismo-origen compara `=== null`. Las dos políticas son legítimas; lo
// que no era legítimo es que no se pudieran distinguir.
function corsCheck(event) {
  const crudo = (event && event.headers && (event.headers.origin || event.headers.Origin));
  if (crudo == null || crudo === '') return '';   // misma-origen
  if (ALLOWED_ORIGINS.includes(crudo)) return crudo;
  if (NETLIFY_PREVIEW_RE.test(crudo)) return crudo;
  if (process.env.NETLIFY_DEV === 'true' && ALLOWED_ORIGINS_DEV.includes(crudo)) return crudo;
  return null;
}

function jsonError(status, error, extra) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'null',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: JSON.stringify({ ok: false, error, ...(extra || {}) }),
  };
}

// Devuelve headers de CORS para la response basados en el origen actual.
// Si el origen está permitido, usa ese; si no, fija 'null' para que el browser rechace.
function corsHeaders(event) {
  const origin = corsCheck(event);
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

// Verifica JWT del header Authorization. `allowedRoles` opcional — si se pasa,
// solo retorna valid:true cuando user.rol está en la lista.
//
// Retorna:
//   { valid: true, user: { id, correo, rol, exp, iat } }
//   { valid: false, status: 401|403, error: '...' }
function verifyAdminAuth(event, allowedRoles) {
  if (!JWT_SECRET) {
    return { valid: false, status: 500, error: 'JWT_SECRET no configurado en el servidor' };
  }
  const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { valid: false, status: 401, error: 'Falta Authorization: Bearer <token>' };
  }
  const token = authHeader.slice(7).trim();
  const payload = jwtVerify(token, JWT_SECRET);
  if (!payload) {
    return { valid: false, status: 401, error: 'Token inválido o expirado' };
  }
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    if (!allowedRoles.includes(payload.rol)) {
      return { valid: false, status: 403, error: `Rol '${payload.rol}' sin permiso para este endpoint` };
    }
  }
  return { valid: true, user: payload };
}

// ── 🔐 CAP2-3: verificación de SESIÓN VIVA ───────────────────────────────────
//
// POR QUÉ UNA FUNCIÓN NUEVA Y NO `verifyAdminAuth` ASYNC (decisión de forma):
// hay 92 llamadas a verifyAdminAuth, todas con la misma forma
// `const auth = verifyAdminAuth(event, roles); if (!auth.valid) return 401`.
// Si la volviera async, un call site al que se me olvide el `await` recibe una
// Promise: `auth.valid` es undefined → ese endpoint responde 401 SIEMPRE, o sea
// queda MUERTO. Con una función nueva, olvidar un call site significa que ese
// endpoint sigue comportándose EXACTAMENTE como hoy (sin revocación) — degrada
// al status quo en vez de romperse. Mismo número de ediciones, muchísimo mejor
// modo de falla. Por eso `verifyAdminAuth` queda intacta y firmada igual.
//
// Qué hace de más:
//   1. valida la firma del token (reusa verifyAdminAuth SIN chequear roles);
//   2. pregunta por el estado VIVO del usuario (_lib/sesion-viva, caché 60 s);
//   3. si está inactivo o su sesión fue revocada → 401 "Tu sesión terminó";
//   4. el ROL VIVO manda: se usa para el chequeo de allowedRoles y se escribe en
//      auth.user.rol. Así una degradación (bulma→vendedor) surte efecto de
//      inmediato, y una promoción también, sin esperar a que expire el token.
async function verifyAdminAuthLive(event, allowedRoles) {
  // 1) Firma primero, SIN roles: el rol se evalúa más abajo contra el vivo.
  const base = verifyAdminAuth(event, null);
  if (!base.valid) return base;

  const payload = base.user || {};
  const userId = payload.id || payload.sub;

  // 2) Estado vivo (fail-open estricto dentro de la lib).
  let viva;
  try {
    viva = await verificarSesionViva({ userId, jwtIat: payload.iat, jwtRol: payload.rol });
  } catch (e) {
    console.warn('[verify-admin] FAIL-OPEN: sesion-viva lanzó —', e.message);
    viva = { ok: true, rolVivo: payload.rol };
  }

  if (!viva.ok) {
    return {
      valid: false,
      status: 401,
      error: 'Tu sesión terminó, vuelve a entrar',
      motivo: viva.motivo,
    };
  }

  // 3) El rol VIVO manda para el permiso y para el resto del handler.
  const rolVivo = viva.rolVivo || payload.rol;
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    if (!allowedRoles.includes(rolVivo)) {
      return { valid: false, status: 403, error: `Rol '${rolVivo}' sin permiso para este endpoint` };
    }
  }
  return { valid: true, user: { ...payload, rol: rolVivo } };
}

module.exports = {
  jwtSign,
  jwtVerify,
  verifyAdminAuth,
  verifyAdminAuthLive,
  corsCheck,
  corsHeaders,
  jsonError,
  ALLOWED_ORIGINS,
};

