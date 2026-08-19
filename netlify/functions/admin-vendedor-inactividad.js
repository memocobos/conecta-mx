// =============================================================================
// admin-vendedor-inactividad.js  (VENDEDORES F6 — panel admin del candado)
//
// La contraparte ADMIN del candado de inactividad (_lib/vendedor-activo):
//   · 'estado'    → maestro_roshi/bulma. Lista de vendedores con su reloj y
//        sus ventas: { id, nombre, correo, inicio, reactivado, ultima_venta,
//        limite, ventas, inactivo, bloqueado, bloqueado_at }.
//        🔄 REGLA RODANTE: el reloj corre desde la ÚLTIMA VENTA (no desde el
//        registro), así que `limite` sale de la referencia rodante — el panel
//        dice EXACTAMENTE lo mismo que la puerta (_lib/vendedor-activo).
//        `bloqueado` = ya tiene el sello puesto (puerta cerrada).
//        Best-effort: si Portal falla, ventas:null e inactivo:false (jamás
//        marcar sin datos); el sello sí se muestra porque vive en KH.
//   · 'reactivar' {usuario_id} → SOLO maestro_roshi ("Dar otra oportunidad").
//        PATCH vendedor_reactivado_at = ahora Y vendedor_bloqueado_at = NULL.
//        Las DOS cosas: limpiar el sello sin reiniciar el reloj no serviría de
//        nada (la puerta lo volvería a sellar en el siguiente request).
//        NO destructivo: ni borra ni cambia rol. Jamás on_conflict.
//
// Env: SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE (usuarios) +
//      PORTAL_SUPABASE_URL/PORTAL_SUPABASE_SERVICE_KEY (ventas).
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { estaPausado, respuestaPausa } = require('./_lib/modulos-pausados');
const {
  MESES_LIMITE, ESTADOS_CUENTAN, _masMesesFecha, _inicioVendedor, _referenciaRodante,
} = require('./_lib/vendedor-activo');

const ACCIONES = {
  estado: ['maestro_roshi', 'bulma'],
  reactivar: ['maestro_roshi'],
};
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

exports.handler = async (event) => {
  // [VEN-PAUSA-1] El módulo está pausado: se rebota ANTES de cualquier trabajo
  // (sin leer body, sin tocar la base, sin verificar sesión). Esconder no es
  // impedir — el candado del navegador no alcanza a quien llama esto a mano.
  if (estaPausado('vendedores')) return respuestaPausa('vendedores');

  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (s, b) => ({ statusCode: s, headers, body: JSON.stringify(b) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!__origin) return json(403, { error: 'Origen no permitido' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  const accion = body.accion;
  if (!(accion in ACCIONES)) return json(400, { error: 'accion inválida' });

  const auth = await verifyAdminAuthLive(event, ACCIONES[accion]);
  if (!auth.valid) return json(auth.status, { error: auth.error });

  const env = readEnv();
  if (env.error) return json(500, { error: env.error });
  const kh = { apikey: env.KH_KEY, Authorization: 'Bearer ' + env.KH_KEY, 'Content-Type': 'application/json' };

  try {
    // ── estado: reloj + ventas de TODOS los vendedores ─────────────────────
    if (accion === 'estado') {
      const uR = await fetch(
        `${env.KH_URL}/rest/v1/usuarios?rol=eq.vendedor&select=id,nombre,correo,creado_en,vendedor_reactivado_at,vendedor_bloqueado_at&limit=2000`,
        { headers: kh }
      );
      if (!uR.ok) return json(502, { error: 'KH rechazó usuarios', detail: await uR.text() });
      const vendedores = (await uR.json().catch(() => [])) || [];

      // Ventas por vendedor (Portal, best-effort). Solo estados NO cancelados:
      // misma definición que la puerta — una cancelada no sostiene el acceso.
      // Se guarda el conteo Y la fecha de la más reciente (regla rodante).
      let ventasPor = null;
      if (env.P_URL && env.P_KEY) {
        try {
          const vR = await fetch(
            `${env.P_URL}/rest/v1/solicitudes_tour?vendedor_id=not.is.null` +
            `&estado=in.(${ESTADOS_CUENTAN.join(',')})&select=vendedor_id,created_at&limit=10000`,
            { headers: { apikey: env.P_KEY, Authorization: 'Bearer ' + env.P_KEY } }
          );
          if (vR.ok) {
            ventasPor = {};
            ((await vR.json().catch(() => [])) || []).forEach(s => {
              const v = s && s.vendedor_id != null ? String(s.vendedor_id) : '';
              if (!v) return;
              const prev = ventasPor[v] || { n: 0, ultima: '' };
              const f = String(s.created_at || '').slice(0, 10);
              ventasPor[v] = { n: prev.n + 1, ultima: f > prev.ultima ? f : prev.ultima };
            });
          }
        } catch (_) { ventasPor = null; }
      }

      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
      const out = vendedores.map(u => {
        const inicio = _inicioVendedor(u);
        const info = ventasPor ? (ventasPor[String(u.id)] || { n: 0, ultima: '' }) : null;
        const ventas = info ? info.n : null;
        const ultima = info ? (info.ultima || null) : null;
        // El límite se mide desde la referencia RODANTE (última venta || inicio).
        const ref = info ? _referenciaRodante(inicio, ultima) : inicio;
        const limite = ref ? _masMesesFecha(ref, MESES_LIMITE) : null;
        // Sin datos de ventas (Portal caído) → NO se marca inactivo (best-effort).
        const inactivo = !!(info && limite && hoy > limite);
        return {
          id: u.id, nombre: u.nombre, correo: u.correo,
          inicio, reactivado: u.vendedor_reactivado_at || null,
          ultima_venta: ultima, limite, ventas, inactivo,
          bloqueado: !!u.vendedor_bloqueado_at,
          bloqueado_at: u.vendedor_bloqueado_at || null,
        };
      });
      return json(200, { ok: true, vendedores: out, ventas_ok: ventasPor !== null });
    }

    // ── reactivar: "Dar otra oportunidad" (reinicia el reloj) ──────────────
    if (accion === 'reactivar') {
      const id = String(body.usuario_id || '').trim();
      if (!UUID_RE.test(id)) return json(400, { error: 'usuario_id inválido' });

      // Solo aplica a vendedores (no tocar otros roles por accidente).
      const uR = await fetch(`${env.KH_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(id)}&select=id,rol,nombre&limit=1`, { headers: kh });
      if (!uR.ok) return json(502, { error: 'KH rechazó la consulta', detail: await uR.text() });
      const [u] = (await uR.json().catch(() => [])) || [];
      if (!u) return json(404, { error: 'Usuario no encontrado' });
      if (u.rol !== 'vendedor') return json(400, { error: 'Ese usuario no es vendedor' });

      // Las DOS cosas juntas: limpiar el sello Y reiniciar el reloj. Solo
      // limpiar el sello sería un no-op — la puerta re-evaluaría la regla
      // rodante (sin ventas recientes) y lo volvería a sellar de inmediato.
      const ahora = new Date().toISOString();
      const pR = await fetch(`${env.KH_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...kh, Prefer: 'return=minimal' },
        body: JSON.stringify({ vendedor_reactivado_at: ahora, vendedor_bloqueado_at: null }),
      });
      if (!pR.ok) return json(502, { error: 'No se pudo reactivar', detail: await pR.text() });
      return json(200, { ok: true, usuario_id: id, vendedor_reactivado_at: ahora, desbloqueado: true });
    }

    return json(400, { error: 'accion inválida' });
  } catch (e) {
    return json(502, { error: 'Error en admin-vendedor-inactividad', detail: e.message });
  }
};

function readEnv() {
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_URL || !KH_KEY) return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  return { KH_URL, KH_KEY, P_URL: process.env.PORTAL_SUPABASE_URL, P_KEY: process.env.PORTAL_SUPABASE_SERVICE_KEY };
}
