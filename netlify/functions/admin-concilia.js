// =============================================================================
// admin-concilia — CONCILIA-1 fase 1: el reporte caja ↔ contratos (SOLO LEE)
// =============================================================================
// POST { accion } · roles maestro_roshi | bulma | milk (los mismos del dinero).
//   'reporte' { desde, hasta } → el careo del periodo, con NOMBRES.
//   'radar'                    → el mismo careo del mes corriente, recortado a
//                                lo que el renglón del Radar necesita.
//
// 🔒 NO ESCRIBE UN PESO, y no es una promesa: aquí NO HAY ninguna acción que
// escriba. Aplicar correcciones es la fase 2, renglón por renglón y con
// confirmación. El careo afirma que ni este archivo ni su lib contienen un
// método distinto de GET — una guarda prometida en un comentario y no medida es
// la familia que esta casa ya pagó.
//
// 🔒 UNA ACCIÓN NUEVA VA EN `ACCIONES` O NO EXISTE (ley de RAD-FIX-CAMINO):
// tres tuercas llegaron ROTAS a producción con su careo en verde porque el
// despacho no las conocía.
//
// 🔒 EL PERIODO VIENE DEL CLIENTE Y SE VALIDA EN LA PUERTA. Una fecha basura se
// acomoda sola —«2026-13-45» sale como la cadena "Invalid Date", que es truthy
// y pasa los candados—, así que `diaValido` exige la forma Y que el día exista.
//
// 🔒 EL MES DE `radar` SE CALCULA EN **REYNOSA**, no en Greenwich. Pasadas las
// 6 de la tarde de acá ya es el día siguiente en UTC, y en esta casa se trabaja
// de noche: el 30 a las 11 pm, un `toISOString()` habría pedido el mes que
// viene y el renglón habría salido vacío. Y Reynosa es `America/Matamoros`, NO
// Cancún: Reynosa sí cambia de horario con EE.UU.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { conciliar } = require('./_lib/concilia');

const ACCIONES = ['reporte', 'radar'];
const ROLES = ['maestro_roshi', 'bulma', 'milk'];

function readEnvKH() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE / SUPABASE_SERVICE_KEY_KAMEHOUSE)' };
  return { KH_SB_URL, KH_SB_SERVICE };
}
function readEnvPortal() {
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) return { error: 'Faltan env vars del Portal (PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY)' };
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}

// El mes corriente en Reynosa, con sus dos puntas inclusivas.
function mesEnReynosa() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });  // YYYY-MM-DD
  const [a, m] = hoy.split('-');
  // El último día del mes: el día 0 del mes SIGUIENTE. Se arma en UTC a mediodía
  // para que ningún huso lo corra de mes.
  const fin = new Date(Date.UTC(Number(a), Number(m), 0, 12, 0, 0));
  return { desde: `${a}-${m}-01`, hasta: fin.toISOString().slice(0, 10), hoy };
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

  const auth = await verifyAdminAuthLive(event, ROLES);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) { body = {}; }
  const accion = String(body.accion || '');
  if (!ACCIONES.includes(accion)) {
    return { statusCode: 400, headers, body: JSON.stringify({
      error: `Acción no reconocida. Se puede: ${ACCIONES.join(', ')}.`,
      codigo: 'ACCION_DESCONOCIDA' }) };
  }

  const envKH = readEnvKH();
  if (envKH.error) return { statusCode: 500, headers, body: JSON.stringify({ error: envKH.error }) };
  const envP = readEnvPortal();
  if (envP.error) return { statusCode: 500, headers, body: JSON.stringify({ error: envP.error }) };

  const mes = mesEnReynosa();
  const desde = accion === 'radar' ? mes.desde : String(body.desde || '');
  const hasta = accion === 'radar' ? mes.hasta : String(body.hasta || '');

  const r = await conciliar({
    khUrl: envKH.KH_SB_URL, khService: envKH.KH_SB_SERVICE,
    portalUrl: envP.PORTAL_SB_URL, portalService: envP.PORTAL_SB_SERVICE,
    desde, hasta,
  });
  if (r.error) return { statusCode: 400, headers, body: JSON.stringify({ error: r.error, codigo: 'PERIODO_INVALIDO' }) };

  // 🔒 UN LADO CAÍDO ES UN 502, NO UN 200 CON CEROS. La pantalla tiene que
  // poder distinguir «no hay diferencia» de «no pude mirar»: si contestara 200,
  // el renglón del Radar se callaría —que es lo que hace cuando todo cuadra— y
  // un descuadre real quedaría invisible justo el día que la base tose.
  if (!r.se_pudo_carear) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, ...r }) };
  }

  if (accion === 'radar') {
    // El renglón solo necesita el TAMAÑO y un par de nombres para que el aviso
    // diga algo concreto. La lista entera se pide con `reporte`.
    const t = r.totales;
    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true, periodo: r.periodo, hoy: mes.hoy, solo_lectura: true,
      cuadra: r.cuadra, diferencia: r.diferencia, totales: t,
      muestra_contratos: (r.solo_contratos || []).slice(0, 3)
        .map((x) => ({ nombre: x.nombre, monto: x.monto, fecha: x.fecha, evento_id: x.evento_id })),
      muestra_caja: (r.solo_caja || []).slice(0, 3)
        .map((x) => ({ nombre: x.nombre, monto: x.monto, fecha: x.fecha, cuenta: x.cuenta })),
    }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...r }) };
};
