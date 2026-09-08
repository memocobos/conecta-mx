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
const { llaveCorreo, esCorreoUsable, tallaNormalizada } = require('./_lib/correo-forma');

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
  const hPT = { apikey: PT_KEY, Authorization: 'Bearer ' + PT_KEY, 'Content-Type': 'application/json' };

  try {
    // 1. Los viajeros de ESE evento.
    const vUrl = `${KH_URL}/rest/v1/viajeros_evento?evento_id=eq.${encodeURIComponent(evento_id)}`
      + '&select=id,nombre,correo,celular,talla_playera,emergencia_nombre,num_emergencia,portal_cliente_id&limit=2000';
    const vR = await fetch(vUrl, { headers: hKH });
    if (!vR.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No pude leer los viajeros', detail: await vR.text() }) };
    const viajeros = await vR.json();
    if (!Array.isArray(viajeros)) return { statusCode: 502, headers, body: JSON.stringify({ error: 'Los viajeros no vinieron como lista' }) };

    // 2. Agrupados POR CORREO, no por fila. Una persona con dos filas es UNA
    //    cuenta — y las DOS filas se marcan. La lección del consuelo.
    const grupos = new Map();
    const saltados = [];
    for (const v of viajeros) {
      const k = llaveCorreo(v.correo);
      if (!k) { saltados.push({ nombre: v.nombre, motivo: 'sin correo en su fila' }); continue; }
      if (!esCorreoUsable(v.correo)) { saltados.push({ nombre: v.nombre, correo: v.correo, motivo: 'el correo no tiene forma de correo' }); continue; }
      if (!grupos.has(k)) grupos.set(k, { correo: k, nombre: v.nombre, filas: [] });
      grupos.get(k).filas.push(v);
    }

    // 3. Quién ya existe en el Portal. Se pregunta por los correos EN JUEGO, no
    //    se trae la tabla entera: traerla y filtrar aquí sería la segunda fuente.
    const correos = [...grupos.keys()];
    const yaEnPortal = new Map();
    for (let i = 0; i < correos.length; i += 100) {
      const lote = correos.slice(i, i + 100);
      const inList = lote.map((c) => '"' + c.replace(/"/g, '\\"') + '"').join(',');
      const cR = await fetch(`${PT_URL}/rest/v1/clientes?correo=in.(${encodeURIComponent(inList)})&select=id,correo,auth_user_id&limit=200`, { headers: hPT });
      if (!cR.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No pude leer los clientes del Portal', detail: await cR.text() }) };
      (await cR.json()).forEach((c) => yaEnPortal.set(llaveCorreo(c.correo), c));
    }

    // 4. La lista, con nombres y motivo. Esto es lo que Memo confirma.
    const nuevos = [], yaTenian = [], yaPuenteados = [];
    for (const g of grupos.values()) {
      const cli = yaEnPortal.get(g.correo);
      const yaMarcado = g.filas.every((f) => f.portal_cliente_id);
      const fila = { nombre: g.nombre, correo: g.correo, filas: g.filas.length, cliente_id: cli ? cli.id : null };
      if (cli && yaMarcado) yaPuenteados.push({ ...fila, motivo: 'ya tiene cuenta y ya está enlazado' });
      else if (cli) yaTenian.push({ ...fila, motivo: cli.auth_user_id ? 'ya tiene cuenta del Portal' : 'ya existe como walk-in' });
      else nuevos.push(fila);
    }

    const resumen = {
      evento_id,
      viajeros: viajeros.length,
      personas: grupos.size,
      reciben_cuenta_nueva: nuevos.length,
      ya_existian_en_portal: yaTenian.length,
      ya_puenteados: yaPuenteados.length,
      saltados: saltados.length,
    };

    if (accion === 'vista_previa') {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, accion, resumen, nuevos, ya_existian: yaTenian, ya_puenteados: yaPuenteados, saltados }) };
    }

    // 5. EJECUTAR. Alta en el Portal + enlace en KameHouse. Nada más.
    const creados = [], errores = [];
    for (const g of nuevos) {
      const filas = grupos.get(g.correo).filas;
      const base = filas.find((f) => f.celular) || filas[0];
      // `numero_cliente` NO se manda: lo asigna el trigger
      // `clientes_before_insert` con nextval('numero_cliente_seq') cuando llega
      // null. Calcularlo aquí sería una segunda fuente para una llave UNIQUE.
      const nuevo = {
        correo: g.correo,
        nombre_completo: g.nombre,
        celular: base.celular || null,
        talla_playera: tallaNormalizada(base.talla_playera),   // o null: el CHECK de la base solo acepta XS…XXL
        contacto_emergencia_nombre: base.emergencia_nombre || null,
        contacto_emergencia_telefono: base.num_emergencia || null,
        creado_por_admin: true,
      };
      const iR = await fetch(`${PT_URL}/rest/v1/clientes`, {
        method: 'POST', headers: { ...hPT, Prefer: 'return=representation' }, body: JSON.stringify(nuevo),
      });
      if (!iR.ok) { errores.push({ correo: g.correo, paso: 'alta en el Portal', detail: await iR.text() }); continue; }
      const fila = (await iR.json())[0];
      creados.push({ correo: g.correo, cliente_id: fila.id, numero_cliente: fila.numero_cliente });
      yaEnPortal.set(g.correo, fila);
    }

    // 6. El enlace, en TODAS las filas de esa persona.
    let filasEnlazadas = 0;
    for (const g of grupos.values()) {
      const cli = yaEnPortal.get(g.correo);
      if (!cli) continue;
      const pendientes = g.filas.filter((f) => f.portal_cliente_id !== cli.id);
      if (!pendientes.length) continue;
      const ids = pendientes.map((f) => '"' + f.id + '"').join(',');
      const uR = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=in.(${encodeURIComponent(ids)})`, {
        method: 'PATCH', headers: hKH, body: JSON.stringify({ portal_cliente_id: cli.id }),
      });
      if (!uR.ok) { errores.push({ correo: g.correo, paso: 'enlace en KameHouse', detail: await uR.text() }); continue; }
      filasEnlazadas += pendientes.length;
    }

    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true, accion, resumen: { ...resumen, cuentas_creadas: creados.length, filas_enlazadas: filasEnlazadas, errores: errores.length },
      creados, errores, saltados,
    }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en el puente', detail: e.message }) };
  }
};
