// =============================================================================
// _lib/vendedor-activo  —  Candado de inactividad de VENDEDORES (F6)
//
// Regla de Memo: vendedor con 3 meses registrado y CERO ventas pierde acceso.
// El candado vive EN LA PUERTA (se evalúa en vivo en cada function de ventas),
// no en un robot nocturno — ningún cron escribe nada por esta regla.
//
// Cálculo: inicio = la MÁS RECIENTE entre usuarios.creado_en y
// usuarios.vendedor_reactivado_at ("Dar otra oportunidad" de Memo reinicia el
// reloj). Si hoy (MX) > inicio + 3 meses Y cero solicitudes_tour con su
// vendedor_id (Portal, cualquier estado) → BLOQUEADO con aviso claro.
//
// BEST-EFFORT ESTRICTO: cualquier error (env faltante, usuarios caído, Portal
// caído) → ACTIVO. Jamás se deja fuera a un vendedor por un error de red.
// Solo los resultados calculados con datos completos se cachean (TTL corto,
// por instancia warm) para no encarecer cada request.
//
// NO destructivo: el usuario no se borra ni cambia de rol — solo la puerta.
//
// Uso (tras verifyAdminAuth, SOLO para rol vendedor):
//   const { verificarVendedorActivo, AVISO_INACTIVO } = require('./_lib/vendedor-activo');
//   const chk = await verificarVendedorActivo(auth.user);
//   if (!chk.activo) return json(403, { error: AVISO_INACTIVO, codigo: 'vendedor_inactivo' });
//
// Env (las mismas del sitio): SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE +
// PORTAL_SUPABASE_URL/PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

const AVISO_INACTIVO = 'Tu cuenta de vendedor está inactiva por no registrar ventas en 3 meses — contacta a Conecta para reactivarla';
const MESES_LIMITE = 3;
const TTL_MS = 5 * 60 * 1000; // 5 min — el candado no necesita ser al segundo

// cache por instancia warm: userId → { activo, expira }
const _cache = new Map();

// 'YYYY-MM-DD' + N meses con recorte de fin de mes (mismo manejo que _masMeses
// de contrato-firmar: 30-nov + 3 → 28/29-feb).
function _masMesesFecha(iso, meses) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const totalM = (m - 1) + meses;
  const y2 = y + Math.floor(totalM / 12);
  const m2 = (totalM % 12) + 1;
  const ultimoDia = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
  const dd = Math.min(d, ultimoDia);
  return `${y2}-${String(m2).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function _hoyMX() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
}

// Fecha de arranque del reloj: la MÁS RECIENTE entre registro y reactivación.
function _inicioVendedor(row) {
  const creado = String(row.creado_en || '').slice(0, 10);
  const react = String(row.vendedor_reactivado_at || '').slice(0, 10);
  if (react && (!creado || react > creado)) return react;
  return creado;
}

// ¿Ya pasó el límite de 3 meses desde `inicioISO` a hoy MX? (puro, para reusar)
function _pasoLimite(inicioISO, hoyISO) {
  if (!inicioISO) return false; // sin fecha de registro → no se puede afirmar; no bloquear
  return (hoyISO || _hoyMX()) > _masMesesFecha(inicioISO, MESES_LIMITE);
}

async function verificarVendedorActivo(user) {
  if (!user || user.rol !== 'vendedor') return { activo: true };
  const uid = String(user.id || '');
  if (!uid) return { activo: true };

  const hit = _cache.get(uid);
  if (hit && hit.expira > Date.now()) return { activo: hit.activo, aviso: hit.activo ? undefined : AVISO_INACTIVO };

  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const P_URL = process.env.PORTAL_SUPABASE_URL;
  const P_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!KH_URL || !KH_KEY) return { activo: true }; // best-effort: sin env no se bloquea

  try {
    // 1) Reloj: registro/reactivación en usuarios (KH).
    const uR = await fetch(
      `${KH_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(uid)}&select=creado_en,vendedor_reactivado_at&limit=1`,
      { headers: { apikey: KH_KEY, Authorization: `Bearer ${KH_KEY}` } }
    );
    if (!uR.ok) return { activo: true };
    const [row] = await uR.json();
    if (!row) return { activo: true };

    if (!_pasoLimite(_inicioVendedor(row))) {
      _cache.set(uid, { activo: true, expira: Date.now() + TTL_MS });
      return { activo: true };
    }

    // 2) Pasó el límite → ¿tiene AL MENOS una venta registrada? (Portal;
    //    cualquier estado cuenta como actividad).
    if (!P_URL || !P_KEY) return { activo: true }; // best-effort
    const vR = await fetch(
      `${P_URL}/rest/v1/solicitudes_tour?vendedor_id=eq.${encodeURIComponent(uid)}&select=id&limit=1`,
      { headers: { apikey: P_KEY, Authorization: `Bearer ${P_KEY}` } }
    );
    if (!vR.ok) return { activo: true }; // conteo falló → NO bloquear
    const ventas = await vR.json();
    const activo = Array.isArray(ventas) && ventas.length > 0;
    _cache.set(uid, { activo, expira: Date.now() + TTL_MS });
    return activo ? { activo: true } : { activo: false, aviso: AVISO_INACTIVO };
  } catch (e) {
    return { activo: true }; // red caída → jamás dejar fuera a un activo
  }
}

// Solo para el arnés: limpiar el cache entre escenarios.
function _resetCacheVendedorActivo() { _cache.clear(); }

module.exports = {
  verificarVendedorActivo,
  AVISO_INACTIVO,
  MESES_LIMITE,
  _masMesesFecha,
  _inicioVendedor,
  _pasoLimite,
  _resetCacheVendedorActivo,
};
