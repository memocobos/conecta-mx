// =============================================================================
// admin-utilidad-evento  (Capa 3 del Palacio — utilidad POR EVENTO, LECTURA)
//
// Reúsa el read+stitch de admin-saldos (mismas 3 fuentes del PORTAL) pero acumula
// POR BASE de evento_id en vez de por cuenta. NO toca admin-saldos (saldos por
// cuenta intactos). Todo vive en PORTAL — NO cruza KH (la deuda a proveedores de
// KH es otra cosa y NO entra aquí).
//
// Por cada evento (base slug; multifecha "base#idx" suma en "base"):
//   cobrado    = pagos con estado='pagado' (caja real), monto = COALESCE(monto_pagado,monto).
//                Definido IGUAL que admin-saldos → una sola verdad de caja.
//   ingresos   = suma de la tabla `ingresos` del evento.
//   vendido    = facturado = suma de solicitudes_tour.precio_total ACTIVAS
//                (estado in en_pagos,pagado; mismo criterio que la vista de cobranza).
//   gastos     = suma de la tabla `gastos` del evento.
//   caja       = (cobrado + ingresos) − gastos
//   proyectado = (vendido + ingresos) − gastos
//   falta_por_cobrar = proyectado − caja   (= vendido − cobrado)
//
// `sin_evento` agrupa filas con evento_id null/vacío (o pagos cuya solicitud no se
// resuelve). `totales.caja_total_empresa` = suma de caja de todos + sin_evento, y
// reconcilia con el gran total de caja de admin-saldos (mismas fuentes, sin filtrar
// por cuenta).
//
// Body JSON: {} (sin parámetros). Respuesta:
//   { ok, generado_at,
//     eventos:{ "<baseSlug>": {cobrado,ingresos,vendido,gastos,caja,proyectado,falta_por_cobrar} },
//     sin_evento:{...mismos campos...},
//     totales:{ caja_total_empresa, proyectado_total, falta_total } }
//
// Seguridad: verifyAdminAuth(['maestro_roshi','bulma','milk']) + corsCheck.
// service_role SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas, sin SQL.
//
// [UTIL-SOLO-ROSHI, 9-nov-2026] Palabra de Memo: «ni milk ni bulma ven
// utilidad». La UTILIDAD y sus piezas (ganancia, inversión, bodega, en mano,
// deuda a proveedores) se PROYECTAN en el servidor por rol: bulma y milk
// reciben la cuenta operativa (cobrado · facturado · pendiente · viajeros ·
// gastos) SIN esos campos y con `utilidad_oculta:true`, y la pantalla no pinta
// el hueco. Esconder la card en el navegador no basta (COB-MIG-1): el dato no
// viaja. Milk ENTRA a la puerta (antes recibía 403 y su Resumen caía al
// cálculo Portal-puro, que hoy son puros ceros — un cero es una afirmación).
// El director (DIRECTOR-1, solo lectura de todo) sí la ve, por LECTURAS_DIRECTOR.
//
// El read+stitch vive en `_lib/utilidad-evento` (fuente única, también usado por
// admin-liquidacion y admin-ventas-resumen); aquí solo se envuelve con auth y la
// misma respuesta de siempre.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { calcularUtilidadPorEvento } = require('./_lib/utilidad-evento');
// [AUD-1c] La cuenta de los dos mundos, de la fuente única.
const { cuentasDeTodos } = require('./_lib/cuenta-evento');
// [EPOCA-1] El Resumen es pantalla OPERATIVA: pide el corte de época (palabra
// de Memo 12-oct: «solo deja la info de calle 24 en adelante»). El contador
// público NO lo pide — ese presume la historia completa a propósito.
const { EPOCA_INICIO } = require('./_lib/epoca');

// [UTIL-SOLO-ROSHI] Quién VE la utilidad. El director pasa por LECTURAS_DIRECTOR
// (verify-admin) y es solo-lectura de todo el dinero, así que la ve.
const ROLES_UTILIDAD = ['maestro_roshi', 'director'];
// La DEUDA a proveedores NO es utilidad (es «lo que debo», va al lado y jamás
// resta — E5-2) y la orden de Memo no la tocó: la siguen viendo los mismos de
// antes (roshi · bulma) más el director. Milk entra a la puerta pero no la ve,
// igual que antes, cuando ni siquiera entraba.
const ROLES_DEUDA = ['maestro_roshi', 'bulma', 'director'];
// Las piezas de la fórmula UTIL-C y lo que las acompaña. Son los NOMBRES que
// `_lib/cuenta-evento` publica (leídos de su `return`, no recordados): se quitan
// del total Y de cada evento. Lo operativo (ventas · facturado · pendiente ·
// gastos · viajeros · por_cobrar · a_favor · sin_contrato) se queda.
const CAMPOS_UTILIDAD = [
  'ganancia', 'ganancia_empresa',
  'inversion_boletos', 'inversion_parcial', 'inversion_zonas_sin_costo',
  'en_mano', 'bodega', 'bodega_boletos', 'bodega_valor', 'bodega_costo',
  'merma_boletos', 'merma_costo',
];
// Y las dos del bloque Portal-puro que también son «cuánto queda»: caja y
// proyectado (por evento y de empresa).
const CAMPOS_CAJA_PURA = ['caja', 'proyectado', 'caja_total_empresa', 'proyectado_total'];

function proyectarSinUtilidad(cuenta, r, veDeuda) {
  const quitar = (obj, campos) => { if (obj && typeof obj === 'object') campos.forEach((k) => { delete obj[k]; }); return obj; };
  if (cuenta && typeof cuenta === 'object') {
    const campos = veDeuda ? CAMPOS_UTILIDAD : CAMPOS_UTILIDAD.concat(['deuda_proveedores']);
    quitar(cuenta.totales, campos);
    Object.keys(cuenta.eventos || {}).forEach((s) => quitar(cuenta.eventos[s], campos));
    cuenta.utilidad_oculta = true;
  }
  if (r && typeof r === 'object') {
    quitar(r.totales, CAMPOS_CAJA_PURA);
    quitar(r.sin_evento, CAMPOS_CAJA_PURA);
    Object.keys(r.eventos || {}).forEach((s) => quitar(r.eventos[s], CAMPOS_CAJA_PURA));
  }
}

exports.handler = async (event) => {
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
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma', 'milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  const veUtilidad = ROLES_UTILIDAD.includes(String((auth.user || {}).rol || ''));

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) { body = {}; }

  try {
    const r = await calcularUtilidadPorEvento({ portalUrl: env.PORTAL_SB_URL, portalService: env.PORTAL_SB_SERVICE });
    if (r.error) return { statusCode: 502, headers, body: JSON.stringify({ error: r.error, detail: r.detail }) };

    // [AUD-1c] LA CUENTA DE LOS DOS MUNDOS, ADITIVA. Todo lo de arriba se
    // devuelve IGUAL —la caja sigue siendo la caja, y la tabla "Utilidad por
    // evento" que la consume es AUD-1d, no ésta—; lo que se suma es `cuenta`,
    // que trae ventas/gastos/ganancia/viajeros de los DOS libros y la bodega.
    //
    // LOS PRECIOS LOS INYECTA EL NAVEGADOR (decisión de Jane): el front ya carga
    // el catálogo de index.html, y darle al servidor una fuente propia sería una
    // divergencia más esperando nacer. Sin precios, la bodega de ese evento se
    // queda en null — no en cero.
    //
    // Fails-soft a propósito: si esta parte truena, la respuesta sigue trayendo
    // la caja de siempre y el Resumen no se queda en blanco.
    let cuenta = null, cuentaError = null;
    try {
      const envKH = readEnvKH();
      if (envKH.error) {
        cuentaError = envKH.error;
      } else {
        const c = await cuentasDeTodos({
          portalUrl: env.PORTAL_SB_URL, portalService: env.PORTAL_SB_SERVICE,
          khUrl: envKH.KH_SB_URL, khService: envKH.KH_SB_SERVICE,
          rol: (auth.user || {}).rol,
          preciosPorEvento: leerPrecios(body),
          // [MER-1] Y qué eventos YA PASARON, por la MISMA razón que los precios:
          // la fecha vive en el catálogo de index.html y el servidor no lo tiene.
          // Un reloj de este lado sería una segunda definición de "ya pasó".
          eventosPasados: leerPasados(body),
          epocaDesde: EPOCA_INICIO, // [EPOCA-1]
        });
        if (c.error) cuentaError = c.error; else cuenta = c;
      }
    } catch (e) { cuentaError = e.message; }

    // [UTIL-SOLO-ROSHI] La proyección por rol va AL FINAL, sobre la respuesta
    // armada: quitar antes dejaría a `cuentasDeTodos` sumando sobre campos
    // ausentes. Y se quita DESPUÉS de calcular, no se deja de calcular — así
    // la cuenta operativa que sí viaja es exactamente la misma que ve roshi.
    if (!veUtilidad) proyectarSinUtilidad(cuenta, r, ROLES_DEUDA.includes(String((auth.user || {}).rol || '')));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        generado_at: new Date().toISOString(),
        eventos: r.eventos,
        sin_evento: r.sin_evento,
        totales: r.totales,
        cuenta,
        cuenta_error: cuentaError,
        utilidad_oculta: !veUtilidad,
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error calculando utilidad por evento', detail: e.message }) };
  }
};

// ----- helpers -----

// Los precios que manda el navegador: { "<slug>": { "<zona>": <precio> } }.
// Se sanea aquí porque viene del cliente: solo números finitos y positivos.
function leerPrecios(body) {
  const p = body && body.precios_por_evento;
  if (!p || typeof p !== 'object') return null;
  const out = {};
  Object.keys(p).slice(0, 200).forEach((slug) => {
    if (!/^[A-Za-z0-9_.#-]{1,80}$/.test(slug)) return;
    const zonas = p[slug];
    if (!zonas || typeof zonas !== 'object') return;
    const z = {};
    Object.keys(zonas).slice(0, 100).forEach((k) => {
      const v = Number(zonas[k]);
      if (Number.isFinite(v) && v > 0) z[String(k).slice(0, 120)] = v;
    });
    if (Object.keys(z).length) out[slug] = z;
  });
  return Object.keys(out).length ? out : null;
}

// [MER-1] Los slugs de eventos ya ocurridos que manda el navegador. Se sanea con
// el MISMO patrón que los precios (viene del cliente): la misma expresión de
// slug y un tope de cuántos se aceptan.
function leerPasados(body) {
  const p = body && body.eventos_pasados;
  if (!Array.isArray(p)) return null;
  const out = p.slice(0, 400)
    .map((s) => String(s || '').trim())
    .filter((s) => /^[A-Za-z0-9_.#-]{1,80}$/.test(s));
  return out.length ? out : null;
}

function readEnvKH() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) return { error: 'Faltan env vars KH' };
  return { KH_SB_URL, KH_SB_SERVICE };
}

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}

// [UTIL-SOLO-ROSHI] Para el careo: la lista de roles y los campos que se
// proyectan, leídos de aquí y no recordados.
exports.ROLES_UTILIDAD = ROLES_UTILIDAD;
exports.ROLES_DEUDA = ROLES_DEUDA;
exports.CAMPOS_UTILIDAD = CAMPOS_UTILIDAD;
exports.CAMPOS_CAJA_PURA = CAMPOS_CAJA_PURA;
exports.proyectarSinUtilidad = proyectarSinUtilidad;
