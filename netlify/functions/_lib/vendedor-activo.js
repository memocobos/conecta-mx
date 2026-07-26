// =============================================================================
// _lib/vendedor-activo  —  Candado de inactividad de VENDEDORES (F6)
//
// 🔄 REGLA RODANTE (decisión de Memo, jul-2026). Antes la regla era "3 meses
// desde el REGISTRO y cero ventas EN LA VIDA": una sola venta —aunque fuera
// cancelada— volvía al vendedor inmortal. Ahora el reloj cuenta desde su
// ÚLTIMA VENTA:
//
//   ACTIVO  si  vendedor_bloqueado_at es NULL  Y
//               ( hay una venta en los últimos 3 meses   ó
//                 aún no cumple 3 meses desde su registro/reactivación )
//
// Las dos ramas son la MISMA regla: se toma la fecha de referencia = la más
// reciente entre (registro | reactivación) y (última venta), y se pregunta si
// ya pasaron 3 meses. El periodo de gracia inicial sale gratis de ahí: un
// vendedor recién dado de alta trae referencia = su registro.
//
// 🚪 PUERTA CERRADA: al bloquearse se SELLA usuarios.vendedor_bloqueado_at y
// el vendedor NO se auto-desbloquea aunque después venda. El único camino de
// vuelta es que Memo lo reactive (admin-vendedor-inactividad 'reactivar' o
// reactivar su cuenta en Guerreros Z), que limpia el sello y reinicia el reloj.
//
// ⚠️ CAMBIO DE NATURALEZA: este candado ERA solo-lectura. Ahora ESCRIBE una
// vez, al sellar. La escritura es BEST-EFFORT: si el PATCH falla, el veredicto
// de bloqueo IGUAL aplica en esa request (solo se pierde la persistencia, y el
// siguiente request lo vuelve a intentar). Nunca al revés: un error de red
// jamás bloquea a nadie.
//
// BEST-EFFORT ESTRICTO en la LECTURA: cualquier error (env faltante, usuarios
// caído, Portal caído) → ACTIVO, con console.warn para que quede rastro. Jamás
// se deja fuera a un vendedor por un error de red. Solo los resultados
// calculados con datos completos se cachean (TTL corto, por instancia warm).
//
// NO destructivo: el usuario no se borra ni cambia de rol — solo la puerta.
//
// ¿Qué cuenta como "venta"? Solicitudes del Portal con su vendedor_id en
// estado NO cancelado (ESTADOS_CUENTAN), por su created_at. Es la MISMA
// definición que ya usan la liquidación, el stock y el resumen de ventas —
// una venta cancelada no le sostiene el acceso a nadie.
//
// Uso (tras verifyAdminAuth, SOLO para rol vendedor):
//   const { verificarVendedorActivo, AVISO_INACTIVO } = require('./_lib/vendedor-activo');
//   const chk = await verificarVendedorActivo(auth.user);
//   if (!chk.activo) return json(403, { error: AVISO_INACTIVO, codigo: 'vendedor_inactivo' });
//
// Env (las mismas del sitio): SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE +
// PORTAL_SUPABASE_URL/PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

const AVISO_INACTIVO = 'Tu acceso de vendedor está pausado por inactividad (3 meses sin ventas) — contacta a Conecta para reactivarlo';
const MESES_LIMITE = 3;
const TTL_MS = 5 * 60 * 1000; // 5 min — el candado no necesita ser al segundo

// Estados de solicitudes_tour que cuentan como venta viva. Misma lista que
// admin-liquidacion / admin-vendidos-evento / _lib/disponibilidad: 'cancelado'
// queda FUERA a propósito.
const ESTADOS_CUENTAN = ['pendiente', 'en_pagos', 'pagado'];

// cache por instancia warm: userId → { activo, expira }
const _cache = new Map();

// 'YYYY-MM-DD' ± N meses con recorte de fin de mes (mismo manejo que _masMeses
// de contrato-firmar: 30-nov + 3 → 28/29-feb). Acepta meses negativos.
function _masMesesFecha(iso, meses) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const totalM = (m - 1) + meses;
  const y2 = y + Math.floor(totalM / 12);
  const m2 = (((totalM % 12) + 12) % 12) + 1; // módulo positivo: soporta meses < 0
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

// Referencia RODANTE: la más reciente entre el arranque del reloj y la última
// venta. Es el corazón de la regla nueva.
function _referenciaRodante(inicioISO, ultimaVentaISO) {
  const a = String(inicioISO || '').slice(0, 10);
  const b = String(ultimaVentaISO || '').slice(0, 10);
  if (!b) return a;
  if (!a) return b;
  return b > a ? b : a;
}

// ¿Ya pasó el límite de 3 meses desde `inicioISO` a hoy MX? (puro, para reusar)
function _pasoLimite(inicioISO, hoyISO) {
  if (!inicioISO) return false; // sin fecha de registro → no se puede afirmar; no bloquear
  return (hoyISO || _hoyMX()) > _masMesesFecha(inicioISO, MESES_LIMITE);
}

// Sella la puerta. BEST-EFFORT: si falla, se avisa y el veredicto igual aplica.
async function _sellarBloqueo(KH_URL, KH_KEY, uid) {
  try {
    const r = await fetch(`${KH_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      headers: {
        apikey: KH_KEY, Authorization: `Bearer ${KH_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ vendedor_bloqueado_at: new Date().toISOString() }),
    });
    if (!r.ok) console.warn('[vendedor-activo] no se pudo sellar el bloqueo de', uid, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) {
    console.warn('[vendedor-activo] error al sellar el bloqueo de', uid, e && e.message);
    return false;
  }
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
  if (!KH_URL || !KH_KEY) {
    console.warn('[vendedor-activo] faltan env de KameHouse — se deja pasar (fail-open)');
    return { activo: true };
  }

  try {
    // 1) Reloj + sello en usuarios (KH).
    const uR = await fetch(
      `${KH_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(uid)}&select=creado_en,vendedor_reactivado_at,vendedor_bloqueado_at&limit=1`,
      { headers: { apikey: KH_KEY, Authorization: `Bearer ${KH_KEY}` } }
    );
    if (!uR.ok) {
      console.warn('[vendedor-activo] usuarios respondió', uR.status, '— se deja pasar (fail-open)');
      return { activo: true };
    }
    const [row] = await uR.json();
    if (!row) return { activo: true };

    // 🚪 PUERTA CERRADA: ya sellado → bloqueado, punto. No se re-evalúa nada
    //    (aunque hoy tenga ventas) y no se toca Portal. Solo Memo abre.
    if (row.vendedor_bloqueado_at) {
      _cache.set(uid, { activo: false, expira: Date.now() + TTL_MS });
      return { activo: false, aviso: AVISO_INACTIVO, sellado: true };
    }

    const hoy = _hoyMX();
    const inicio = _inicioVendedor(row);

    // 2) Gracia inicial: aún no cumple 3 meses desde registro/reactivación.
    //    Se resuelve sin tocar Portal (el 99% de los requests cae aquí).
    if (!_pasoLimite(inicio, hoy)) {
      _cache.set(uid, { activo: true, expira: Date.now() + TTL_MS });
      return { activo: true };
    }

    // 3) Pasó la gracia → ¿vendió en los últimos 3 meses? (Portal, no cancelado)
    if (!P_URL || !P_KEY) {
      console.warn('[vendedor-activo] faltan env de Portal — se deja pasar (fail-open)');
      return { activo: true };
    }
    const vR = await fetch(
      `${P_URL}/rest/v1/solicitudes_tour?vendedor_id=eq.${encodeURIComponent(uid)}` +
      `&estado=in.(${ESTADOS_CUENTAN.join(',')})&select=created_at&order=created_at.desc&limit=1`,
      { headers: { apikey: P_KEY, Authorization: `Bearer ${P_KEY}` } }
    );
    if (!vR.ok) {
      console.warn('[vendedor-activo] Portal respondió', vR.status, '— se deja pasar (fail-open)');
      return { activo: true };
    }
    const ventas = await vR.json();
    const ultima = (Array.isArray(ventas) && ventas[0] && ventas[0].created_at) || '';

    // Misma regla que la gracia, con la referencia rodante.
    if (!_pasoLimite(_referenciaRodante(inicio, ultima), hoy)) {
      _cache.set(uid, { activo: true, expira: Date.now() + TTL_MS });
      return { activo: true };
    }

    // 4) Inactivo → sellar la puerta (best-effort) y bloquear.
    await _sellarBloqueo(KH_URL, KH_KEY, uid);
    _cache.set(uid, { activo: false, expira: Date.now() + TTL_MS });
    return { activo: false, aviso: AVISO_INACTIVO };
  } catch (e) {
    console.warn('[vendedor-activo] error inesperado — se deja pasar (fail-open):', e && e.message);
    return { activo: true }; // red caída → jamás dejar fuera a un activo
  }
}

// Solo para el arnés: limpiar el cache entre escenarios.
function _resetCacheVendedorActivo() { _cache.clear(); }

module.exports = {
  verificarVendedorActivo,
  AVISO_INACTIVO,
  MESES_LIMITE,
  ESTADOS_CUENTAN,
  _masMesesFecha,
  _inicioVendedor,
  _referenciaRodante,
  _pasoLimite,
  _resetCacheVendedorActivo,
};
