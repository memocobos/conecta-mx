// =============================================================================
// _lib/sesion-viva.js — 🔐 CAP2-3: ¿esta sesión sigue siendo válida AHORA?
//
// EL HUECO QUE CIERRA: el JWT dura 8 horas y lleva el rol escrito adentro. Hasta
// hoy, desactivar a alguien o cambiarle el rol NO surtía efecto hasta que su
// token expirara — podía seguir entrando con permisos de bulma media jornada
// después de dejar de serlo. Aquí se consulta el estado VIVO del usuario y el
// guardia (verify-admin) actúa en consecuencia.
//
//   verificarSesionViva({ userId, jwtIat, jwtRol })
//     → { ok:true,  rolVivo }                    la sesión sigue válida
//     → { ok:false, motivo:'inactivo'|'revocado' }
//
// REGLA DE ORO — FAIL-OPEN ESTRICTO. Env faltante, HTTP no-ok, red caída, fila
// no encontrada: TODO devuelve ok:true con el rol del token. Este candado existe
// para cerrar una ventana de horas, NO para dejar a la gente fuera de su propio
// sistema por un hipo de red. Cada fail-open deja un console.warn: un candado
// que se apaga en silencio es peor que no tenerlo, porque nadie se entera de que
// dejó de proteger (lección heredada del candado de vendedores, ya retirado).
//
// INTERRUPTOR DE EMERGENCIA: si `SESION_VIVA_MODO === 'off'` la verificación se
// salta por completo (ni siquiera consulta). La variable NO existe en Netlify a
// propósito: su ausencia = candado activo. Si algún día algo truena, se crea en
// un minuto y el candado queda desactivado sin necesidad de un deploy.
//
// CACHÉ de 60 s por usuario: una
// desactivación surte efecto en ≤1 minuto y no se le pega a la BD en cada
// request. Se cachea la FILA, no el veredicto: el veredicto depende del `iat`
// del token que llega, que cambia por sesión.
//
// Env: SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE.
// =============================================================================

const CACHE_MS = 60 * 1000;

// userId → { expira, fila:{ activo, rol, sesiones_invalidas_antes } }
const _cache = new Map();

// Para el arnés: vaciar la caché entre casos.
function _resetCache() { _cache.clear(); }

async function verificarSesionViva({ userId, jwtIat, jwtRol }) {
  const abierto = { ok: true, rolVivo: jwtRol };

  // Interruptor de emergencia (ausencia = activo).
  if (String(process.env.SESION_VIVA_MODO || '').toLowerCase() === 'off') {
    return { ...abierto, apagado: true };
  }
  const uid = String(userId || '');
  if (!uid) return abierto;                       // token sin id → nada que consultar

  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_URL || !KH_KEY) {
    console.warn('[sesion-viva] FAIL-OPEN: faltan env vars KH — la revocación de sesión NO está protegiendo');
    return abierto;
  }

  let fila = null;
  const hit = _cache.get(uid);
  if (hit && hit.expira > Date.now()) {
    fila = hit.fila;
  } else {
    try {
      const r = await fetch(
        `${KH_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(uid)}&select=activo,rol,sesiones_invalidas_antes&limit=1`,
        { headers: { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY } }
      );
      if (!r.ok) {
        console.warn('[sesion-viva] FAIL-OPEN: KH respondió', r.status, '— la sesión se deja pasar');
        return abierto;
      }
      const rows = await r.json().catch(() => []);
      fila = (Array.isArray(rows) && rows[0]) || null;
      if (!fila) {
        console.warn('[sesion-viva] FAIL-OPEN: usuario', uid, 'no encontrado — la sesión se deja pasar');
        return abierto;
      }
      _cache.set(uid, { expira: Date.now() + CACHE_MS, fila });
    } catch (e) {
      console.warn('[sesion-viva] FAIL-OPEN: excepción de red —', e.message);
      return abierto;
    }
  }

  // ── Veredicto (se calcula SIEMPRE, aunque la fila venga de caché) ──
  if (fila.activo === false) return { ok: false, motivo: 'inactivo' };

  const corte = fila.sesiones_invalidas_antes ? Date.parse(fila.sesiones_invalidas_antes) : NaN;
  if (Number.isFinite(corte)) {
    const emitidoMs = Number(jwtIat) * 1000;
    // Un token emitido ANTES del corte quedó revocado. Sin `iat` utilizable no
    // se puede afirmar nada → se deja pasar (fail-open).
    if (Number.isFinite(emitidoMs) && emitidoMs > 0 && emitidoMs < corte) {
      return { ok: false, motivo: 'revocado' };
    }
  }

  return { ok: true, rolVivo: fila.rol || jwtRol };
}

module.exports = { verificarSesionViva, _resetCache, CACHE_MS };
