// =============================================================================
// admin-ventas-resumen.js — Lecturas server-side de ventas (KH + Portal)
//
// Dos acciones:
//  · 'listar'     → finanzas REALES por evento (CAJA), desde `_lib/utilidad-evento`
//                   (Portal: cobrado + ingresos − gastos por slug). SOLO admin
//                   (maestro_roshi/bulma). Antes leía la vista MUERTA `resumen_eventos`
//                   (calculaba de reservaciones/costos_evento, tablas con CERO filas
//                   → SIEMPRE $0). Nombre/fecha/ciudad se enriquecen del catálogo.
//                   ⚠️ NOTA: este panel duplica el de Caja/Proyectado/Falta del Palacio
//                   (admin-utilidad-evento); ahora ambos muestran la MISMA caja real.
//  · 'mis_ventas' → (VENDEDORES F3) ventas del Portal `solicitudes_tour` con
//                   vendedor_id. Rol VENDEDOR → SOLO sus ventas (vendedor_id =
//                   su usuarios.id del JWT, forzado server-side; jamás ve ajenas
//                   ni las del portal con vendedor_id null). Admin → TODAS las de
//                   vendedor (+ nombre del vendedor resuelto desde usuarios KH).
//
// Seguridad: Authorization Bearer <JWT> (verifyAdminAuth) + corsCheck. service_role
// nunca se expone. El filtro por vendedor sale del JWT, NUNCA del request.
//
// Env: SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE (usuarios),
//      PORTAL_SUPABASE_URL/SERVICE_KEY (solicitudes_tour + caja real por evento),
//      JWT_SECRET (verifyAdminAuth).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { verificarVendedorActivo, AVISO_INACTIVO } = require('./_lib/vendedor-activo');
const { calcularUtilidadPorEvento, baseSlug } = require('./_lib/utilidad-evento');
let fetchCatalogo = null;
try { ({ fetchCatalogo } = require('./_lib/catalogo-index')); } catch (_) { fetchCatalogo = null; }

const ROLES_ADMIN = ['maestro_roshi', 'bulma'];
const ROLES_VENTAS = ['vendedor', 'maestro_roshi', 'bulma'];
const ESTADOS_CUENTAN = ['pendiente', 'en_pagos', 'pagado'];   // viajeros no cancelados

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

  // 💤 F6: candado de inactividad — vendedor con 3+ meses y CERO ventas queda
  // bloqueado EN LA PUERTA (evaluado en vivo, best-effort: en error entra).
  if (auth.user.rol === 'vendedor') {
    const chk = await verificarVendedorActivo(auth.user);
    if (!chk.activo) return json(403, { error: AVISO_INACTIVO, codigo: 'vendedor_inactivo' });
  }

  const env = readEnv();
  if (env.error) return json(500, { error: env.error });

  const khHeaders = { apikey: env.KH_SB_SERVICE, Authorization: 'Bearer ' + env.KH_SB_SERVICE, 'Content-Type': 'application/json' };

  try {
    // ── listar (finanzas REALES por evento — CAJA, desde el lib) ───────────
    if (accion === 'listar') {
      if (!env.PORTAL_SB_URL || !env.PORTAL_SB_SERVICE) return json(500, { error: 'Faltan env vars Portal (PORTAL_SUPABASE_URL/SERVICE_KEY)' });
      const util = await calcularUtilidadPorEvento({ portalUrl: env.PORTAL_SB_URL, portalService: env.PORTAL_SB_SERVICE });
      if (util.error) return json(502, { error: util.error, detail: util.detail });

      // Metadata (nombre/fecha/ciudad) del catálogo + viajeros reales por slug (best-effort).
      let cat = null;
      if (fetchCatalogo) { try { cat = await fetchCatalogo(); } catch (_) { cat = null; } }
      const viajeros = await contarViajeros(env);   // { slug: nº viajeros no cancelados }

      const eventos = Object.keys(util.eventos || {}).map(slug => {
        const f = util.eventos[slug];
        const c = (cat && cat[slug]) || {};
        return {
          id: slug,
          nombre: c.nombre || slug,
          artista: c.nombre || slug,
          fecha: c.ds || null,          // ISO (fmtFecha lo entiende); humano vive en c.fecha
          ciudad: c.ciudad || null,
          status: null,                 // la vista muerta lo daba; ya no hay fuente real
          total_viajeros: viajeros[slug] || 0,
          total_cobrar: f.vendido,          // Facturado
          total_cobrado: f.cobrado,         // Cobrado
          total_pendiente: f.falta_por_cobrar,   // Pendiente (= vendido − cobrado)
          total_costos: f.gastos,           // Costos
          utilidad_actual: f.caja,          // Utilidad = CAJA REAL
        };
      }).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
      return json(200, { ok: true, eventos });
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

// Viajeros (num_personas) NO cancelados por slug base, de todos los canales. Best-
// effort: si falla, devuelve {} (el panel muestra 0, no rompe). No es dinero.
async function contarViajeros(env) {
  try {
    const portalHeaders = { apikey: env.PORTAL_SB_SERVICE, Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE };
    const r = await fetch(`${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?estado=in.(${ESTADOS_CUENTAN.join(',')})&select=evento_id,num_personas&limit=20000`, { headers: portalHeaders });
    if (!r.ok) return {};
    const rows = (await r.json().catch(() => [])) || [];
    const out = {};
    for (const s of rows) {
      const base = baseSlug(s.evento_id);
      if (!base) continue;
      const n = parseInt(s.num_personas, 10);
      out[base] = (out[base] || 0) + (Number.isInteger(n) && n > 0 ? n : 0);
    }
    return out;
  } catch (_) { return {}; }
}

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
