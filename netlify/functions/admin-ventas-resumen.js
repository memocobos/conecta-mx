// =============================================================================
// admin-ventas-resumen.js — Lecturas server-side de ventas (KH + Portal)
//
// Dos acciones:
//  · 'listar'     → vista `resumen_eventos` (KH), finanzas por evento. SOLO admin
//                   (maestro_roshi/bulma). Whitelist COLS. Sin cambios de conducta.
//  · 'mis_ventas' → (VENDEDORES F3) ventas del Portal `solicitudes_tour` con
//                   vendedor_id. Rol VENDEDOR → SOLO sus ventas (vendedor_id =
//                   su usuarios.id del JWT, forzado server-side; jamás ve ajenas
//                   ni las del portal con vendedor_id null). Admin → TODAS las de
//                   vendedor (+ nombre del vendedor resuelto desde usuarios KH).
//
// Seguridad: Authorization Bearer <JWT> (verifyAdminAuth) + corsCheck. service_role
// nunca se expone. El filtro por vendedor sale del JWT, NUNCA del request.
//
// Env: SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE (resumen_eventos + usuarios),
//      PORTAL_SUPABASE_URL/SERVICE_KEY (solicitudes_tour, solo para mis_ventas),
//      JWT_SECRET (verifyAdminAuth).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const ROLES_ADMIN = ['maestro_roshi', 'bulma'];
const ROLES_VENTAS = ['vendedor', 'maestro_roshi', 'bulma'];

// Whitelist de la vista resumen_eventos (finanzas por evento). NO select=*.
const COLS = [
  'id', 'nombre', 'artista', 'fecha', 'ciudad', 'status', 'total_viajeros',
  'total_cobrar', 'total_cobrado', 'total_pendiente', 'total_costos', 'utilidad_actual',
].join(',');

// Columnas de una venta (solicitudes_tour) que viajan a "Mis Ventas".
const VENTA_COLS = [
  'id', 'evento_id', 'evento_nombre', 'zona', 'paquete', 'num_personas',
  'precio_total', 'monto_separo', 'estado', 'vende_limite', 'vendedor_id',
  'precio_sellado', 'created_at', 'clientes(nombre_completo,correo)',
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
  const json = (s, b) => ({ statusCode: s, headers, body: JSON.stringify(b) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!__origin) return json(403, { error: 'Origen no permitido' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  const accion = body.accion;
  if (accion !== 'listar' && accion !== 'mis_ventas') return json(400, { error: 'accion inválida' });

  // Gate por acción: listar = admin; mis_ventas = vendedor + admin.
  const auth = verifyAdminAuth(event, accion === 'mis_ventas' ? ROLES_VENTAS : ROLES_ADMIN);
  if (!auth.valid) return json(auth.status, { error: auth.error });

  const env = readEnv();
  if (env.error) return json(500, { error: env.error });

  const khHeaders = { apikey: env.KH_SB_SERVICE, Authorization: 'Bearer ' + env.KH_SB_SERVICE, 'Content-Type': 'application/json' };

  try {
    // ── listar (finanzas por evento) — INTACTO ────────────────────────────
    if (accion === 'listar') {
      const r = await fetch(`${env.KH_SB_URL}/rest/v1/resumen_eventos?select=${COLS}&order=fecha.desc&limit=50`, { headers: khHeaders });
      if (!r.ok) return json(502, { error: 'KH rechazó la consulta', detail: await r.text() });
      const eventos = await r.json();
      return json(200, { ok: true, eventos: Array.isArray(eventos) ? eventos : [] });
    }

    // ── mis_ventas (VENDEDORES F3) ────────────────────────────────────────
    if (!env.PORTAL_SB_URL || !env.PORTAL_SB_SERVICE) return json(500, { error: 'Faltan env vars Portal (PORTAL_SUPABASE_URL/SERVICE_KEY)' });
    const portalHeaders = { apikey: env.PORTAL_SB_SERVICE, Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE };

    const esAdmin = ROLES_ADMIN.includes(auth.user.rol);
    const sp = new URLSearchParams();
    sp.set('select', VENTA_COLS);
    if (esAdmin) {
      sp.append('vendedor_id', 'not.is.null');           // admin: TODAS las de vendedor
    } else {
      sp.append('vendedor_id', `eq.${auth.user.id}`);    // vendedor: SOLO las suyas (del JWT)
    }
    sp.set('order', 'created_at.desc');
    sp.set('limit', '200');

    const vr = await fetch(`${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?${sp.toString()}`, { headers: portalHeaders });
    if (!vr.ok) return json(502, { error: 'Portal rechazó la consulta', detail: await vr.text() });
    let ventas = await vr.json();
    ventas = Array.isArray(ventas) ? ventas : [];

    // Admin: resolver el NOMBRE del vendedor (usuarios KH) por su id.
    if (esAdmin && ventas.length) {
      const ids = [...new Set(ventas.map(v => v.vendedor_id).filter(Boolean))];
      if (ids.length) {
        const inList = ids.map(encodeURIComponent).join(',');
        const ur = await fetch(`${env.KH_SB_URL}/rest/v1/usuarios?id=in.(${inList})&select=id,nombre`, { headers: khHeaders });
        if (ur.ok) {
          const nombrePorId = {};
          (await ur.json().catch(() => [])).forEach(u => { if (u && u.id) nombrePorId[u.id] = u.nombre || null; });
          ventas.forEach(v => { v.vendedor_nombre = nombrePorId[v.vendedor_id] || null; });
        }
      }
    }

    // 🔒 PRIVACIDAD DURA (F5a): el VENDEDOR jamás ve el desglose CHEAP. En sus
    // ventas CHEAP, separo = comisión de Memo → se OMITE (separo/resto). Solo ve el
    // costo final (precio_total). Para admin no se toca (conoce el modelo).
    if (!esAdmin) {
      ventas.forEach(v => {
        if (String(v.paquete || '').toUpperCase() === 'CHEAP') {
          v.monto_separo = null;
          if (v.precio_sellado && typeof v.precio_sellado === 'object') {
            const s = { ...v.precio_sellado };
            delete s.separo; delete s.resto;
            v.precio_sellado = s;
          }
        }
      });
    }

    return json(200, { ok: true, es_admin: esAdmin, ventas });
  } catch (e) {
    return json(502, { error: 'Error en admin-ventas-resumen', detail: e.message });
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
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  return { KH_SB_URL, KH_SB_SERVICE, PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
