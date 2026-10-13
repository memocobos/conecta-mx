// =============================================================================
// admin-portal-puente  (MIG-1d-i — EL PUENTE, sin un solo correo)
// =============================================================================
// Le da CUENTA en el Portal a los viajeros migrados de UN evento. No manda
// correo, no crea solicitudes y NO TOCA DINERO. La invitación es MIG-1d-ii.
//
// POST { evento_id, accion: 'vista_previa' | 'ejecutar' }
//
// POR QUÉ HACE FALTA: `portal-reclamar-cuenta` solo enlaza a quien se registra
// si encuentra en el Portal una fila de `clientes` con SU MISMO correo y
// `auth_user_id` nulo. Los 2,447 migrados no tienen ninguna. Sin este puente, la
// invitación de 1d-ii mandaría a la gente a un portal que no los reconoce.
//
// 🔒 CERO ESCRITURAS DE DINERO, y es una regla, no un descuido. El dinero del
// viajero migrado YA tiene camino: `_lib/cuenta-evento` lo calcula con
// `saldoMigrado(v, abonos)` sobre `viajeros_evento` + `abonos_viajero` de
// KameHouse. Escribirlo TAMBIÉN como `solicitudes_tour`/`pagos` del Portal lo
// contaría dos veces — una en la cuenta del evento y otra en `admin-saldos`,
// que suma los `pagos` en estado 'pagado' como entradas de caja. Los dos mundos
// del dinero no se cruzan. El plan lo SIRVE `portal-mi-plan-migrado`, leyendo.
//
// VISTA PREVIA PRIMERO, con NOMBRES: quién recibe cuenta y quién se salta y por
// qué. Un número pelón no se puede confirmar.
//
// Seguridad: corsCheck + verifyAdminAuthLive(['maestro_roshi','bulma','milk']).
// Env: SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE,
//      PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { puentearViajeros } = require('./_lib/puente-portal');

const ACCIONES = new Set(['vista_previa', 'ejecutar']);

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  // `corsCheck` devuelve TRES cosas, no dos: el origen si está permitido, `''`
  // si es MISMO-ORIGEN (el navegador no manda `Origin`) y `null` si se rechaza.
  // Preguntar por falsy trataría al mismo-origen como intruso — ya pasó con el
  // 403 de `/diseno`. Se compara contra `null`.
  if (__origin === null) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma', 'milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const PT_URL = process.env.PORTAL_SUPABASE_URL;
  const PT_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!KH_URL || !KH_KEY || !PT_URL || !PT_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars (SUPABASE_*_KAMEHOUSE, PORTAL_SUPABASE_*)' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const evento_id = String(body.evento_id || '').trim();
  const accion = String(body.accion || '').trim();
  if (!evento_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta evento_id' }) };
  // Sin default: `ejecutar` escribe en dos bases. Un default aquí convertiría un
  // clic de mirar en un clic de escribir.
  if (!ACCIONES.has(accion)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "accion debe ser 'vista_previa' o 'ejecutar'", recibido: accion }) };
  }

  const hKH = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY, 'Content-Type': 'application/json' };

  try {
    // 1. Los viajeros de ESE evento.
    const vUrl = `${KH_URL}/rest/v1/viajeros_evento?evento_id=eq.${encodeURIComponent(evento_id)}`
      + '&select=id,nombre,correo,celular,talla_playera,emergencia_nombre,num_emergencia,portal_cliente_id&limit=2000';
    const vR = await fetch(vUrl, { headers: hKH });
    if (!vR.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No pude leer los viajeros', detail: await vR.text() }) };
    const viajeros = await vR.json();
    if (!Array.isArray(viajeros)) return { statusCode: 502, headers, body: JSON.stringify({ error: 'Los viajeros no vinieron como lista' }) };

    // 2-5. EL PUENTE vive en _lib/puente-portal (ACOMP-1): el mismo código
    //      que usa la bandeja de requisiciones al aprobar.
    const out = await puentearViajeros({ evento_id, viajeros, KH_URL, KH_KEY, PT_URL, PT_KEY, ejecutar: accion === 'ejecutar' });
    if (out.error) return { statusCode: 502, headers, body: JSON.stringify({ error: out.error, detail: out.detail }) };
    if (accion === 'vista_previa') {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, accion, resumen: out.resumen, nuevos: out.nuevos, ya_existian: out.yaTenian, ya_puenteados: out.yaPuenteados, saltados: out.saltados }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true, accion, resumen: out.resumen, creados: out.creados, errores: out.errores, saltados: out.saltados,
    }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en el puente', detail: e.message }) };
  }
};
