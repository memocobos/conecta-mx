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
//      JWT_SECRET (verifyAdminAuthLive).
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { verificarVendedorActivo, AVISO_INACTIVO } = require('./_lib/vendedor-activo');
// [AUD-1b] La cuenta de un evento sale de UNA fuente: _lib/cuenta-evento.
//
// El import de `utilidad-evento` se retira porque esta función ya no lo usa:
// `listar` pasó al lib nuevo y `mis_ventas` —la pantalla del vendedor, que NO
// se toca en esta tuerca— nunca lo usó: consulta `solicitudes_tour` directo.
// Lo VERIFIQUÉ leyendo su cuerpo, después de escribir un comentario que decía
// lo contrario. El lib sigue vivo y lo usan admin-utilidad-evento y
// admin-liquidacion; lo que se va de aquí es un import muerto.
const { cuentasDeTodos } = require('./_lib/cuenta-evento');
let fetchCatalogo = null;
try { ({ fetchCatalogo } = require('./_lib/catalogo-index')); } catch (_) { fetchCatalogo = null; }

const ROLES_ADMIN = ['maestro_roshi', 'bulma'];
const ROLES_VENTAS = ['vendedor', 'maestro_roshi', 'bulma'];

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
  const auth = await verifyAdminAuthLive(event, accion === 'mis_ventas' ? ROLES_VENTAS : ROLES_ADMIN);
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
      // [AUD-1b] LA CUENTA DE LOS DOS MUNDOS, de la fuente única.
      //
      // Antes esta pantalla leía SOLO el Portal, así que melanie —cuyos 30
      // viajeros vienen del Excel— salía con 0 viajeros, $0 facturado, $0
      // cobrado y una "utilidad" de −$147,172: los gastos de un mundo restados
      // a las ventas de otro. No le faltaba la mitad; tenía dos mitades que no
      // se corresponden.
      //
      // Y la Utilidad deja de ser la CAJA para ser la GANANCIA (ventas −
      // gastos). La caja sigue existiendo en su lib, para quien pregunte por
      // ella; aquí la pregunta es otra.
      const util = await cuentasDeTodos({
        portalUrl: env.PORTAL_SB_URL, portalService: env.PORTAL_SB_SERVICE,
        khUrl: env.KH_SB_URL, khService: env.KH_SB_SERVICE,
        rol: (auth.user || {}).rol,
      });
      if (util.error) return json(502, { error: util.error, detail: util.detail });

      // Metadata (nombre/fecha/ciudad) del catálogo. Los viajeros ya NO se cuentan
      // aparte: los da el lib, sumando los dos mundos.
      let cat = null;
      if (fetchCatalogo) { try { cat = await fetchCatalogo(); } catch (_) { cat = null; } }


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
          total_viajeros: f.viajeros,       // los DOS mundos
          total_cobrar: f.facturado,        // Facturado (contratado)
          total_cobrado: f.ventas,          // Cobrado (dinero que existe)
          total_pendiente: f.pendiente,     // facturado − cobrado (puede ser negativo)
          total_costos: f.gastos,           // Costos
          utilidad_actual: f.ganancia,      // Utilidad = GANANCIA (ventas − gastos)
          // [AUD-1b] De dónde sale cada número, para que la pantalla lo pueda
          // rotular sin volver a preguntar (y para que el arnés lo carée).
          origen: { portal: f.ventas_portal, migrados: f.ventas_kh, ve_migrados: f.ve_migrados },
          bodega_boletos: f.bodega ? f.bodega.boletos : null,
          deuda_proveedores: f.deuda_proveedores,
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
// [AUD-1b] AQUÍ VIVÍA `contarViajeros`, que contaba SOLO las solicitudes del
// Portal. La cuenta de viajeros ahora la da _lib/cuenta-evento sumando los dos
// mundos, así que ésta se quedó sin llamadores. Se retira entera: una función
// que cuenta medio universo, viva y sin usar, es una trampa esperando a que
// alguien la llame de nuevo.

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  return { KH_SB_URL, KH_SB_SERVICE, PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
