// =============================================================================
// admin-cuenta-evento  —  [KMS-SIMP-2] LA CUENTA DE UN EVENTO, PARA EL PALACIO
//
// Puerta HTTP FINA sobre `_lib/cuenta-evento.cuentaDeEvento`. La librería existía
// desde AUD-1 y era la fuente única de "cuánto dinero hay en este evento", pero
// **no tenía ninguna puerta**: la usaban otros libs por dentro y el navegador no
// podía preguntarle nada. Kamisama pintaba la inversión en boletos y la deuda a
// proveedores, y para lo demás no había con qué.
//
// ⚠️ POR QUÉ NO SE REUSA `admin-utilidad-evento`. Ése envuelve
// `_lib/utilidad-evento`, que es **solo Portal** y lo dice en su encabezado
// ("NO cruza KH"). Desde MIG-1a hay viajeros migrados capturándose en
// `viajeros_evento`, y su dinero **no está en el Portal**: preguntar por ahí
// daría una cuenta que ignora a la gente que Memo acaba de capturar. Ésa es la
// diferencia entre las dos librerías, y por eso ésta necesita su propia puerta.
//
// NO calcula nada. Devuelve lo que `cuentaDeEvento` arma, tal cual — si algún
// día la cuenta cambia, cambia en un solo lugar. Aquí solo va la autorización,
// las env vars y los precios por zona que la librería pide para la bodega.
//
// Body: { evento_id }   ·   Respuesta: { ok, cuenta: {...} }
// Seguridad: corsCheck + verifyAdminAuthLive(['maestro_roshi','bulma']) — los
// mismos roles que `admin-utilidad-evento`, leídos de ahí, porque es el mismo
// dinero. `rol` viaja a la librería: ella decide si se ven los migrados (VJ-3).
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { cuentaDeEvento } = require('./_lib/cuenta-evento');
const { fetchCatalogo } = require('./_lib/catalogo-index');

const ROLES = ['maestro_roshi', 'bulma'];

exports.handler = async (event) => {
  // ⚠️ `corsCheck` devuelve EL ORIGEN o null — NO una respuesta. Mi primer
  // borrador hacía `if (cors) return cors`, que con un origen permitido habría
  // devuelto una CADENA como resultado del handler. El patrón real (copiado de
  // admin-saldos, no recordado) es: el origen alimenta el header, y si no lo
  // hay se contesta 403.
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Origen no permitido' }) };

  // Y `verifyAdminAuthLive` devuelve `{ valid, user }` o `{ valid:false, status,
  // error }` — se pregunta por `valid`, no por `error`.
  const auth = await verifyAdminAuthLive(event, ROLES);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ ok: false, error: auth.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) { /* queda {} */ }
  const evento_id = String(body.evento_id || '').trim();
  if (!evento_id) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'evento_id requerido' }) };

  const PORTAL_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!PORTAL_URL || !PORTAL_KEY || !KH_URL || !KH_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Faltan env vars de Portal o KameHouse' }) };
  }

  // ⚠️ `cuentaDeEvento` NO recibe el catálogo — verificado leyendo su cuerpo,
  // no suponiéndolo: lo que sí le sirve son los PRECIOS POR ZONA, para valorar
  // la bodega. (`migradosPorCuenta`, la otra función del mismo lib, sí pide el
  // catálogo; casi se lo mando por parecido.)
  // `fetchCatalogo` es best-effort y NUNCA lanza: sin él la bodega se queda sin
  // valorar, que es lo correcto — un cero diría "no vale nada".
  const catalogo = await fetchCatalogo();

  // Los precios de venta por zona salen del MISMO catálogo que ve el cliente en
  // el sitio, no de una segunda fuente.
  let preciosPorZona = null;
  let pasado = false;
  try {
    const ev = catalogo && catalogo[String(evento_id).split('#')[0]];
    if (ev && Array.isArray(ev.zonas)) {
      preciosPorZona = {};
      ev.zonas.forEach((z) => {
        if (z && z.n != null && Number.isFinite(Number(z.p))) preciosPorZona[String(z.n).trim()] = Number(z.p);
      });
    }
    if (ev && ev.ds) pasado = new Date(ev.ds + 'T23:59:59') < new Date();
  } catch (_) { /* sin precios la bodega no se valora, que es lo correcto */ }

  const cuenta = await cuentaDeEvento({
    evento_id,
    portalUrl: PORTAL_URL, portalService: PORTAL_KEY,
    khUrl: KH_URL, khService: KH_KEY,
    rol: (auth.user || {}).rol,
    preciosPorZona, pasado,
  });
  if (cuenta && cuenta.error) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: cuenta.error, detail: cuenta.detail || null }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, cuenta }) };
};
