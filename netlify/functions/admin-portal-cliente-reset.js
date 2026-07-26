// =============================================================================
// admin-portal-cliente-reset  (herramienta admin — PORTAL, ESCRITURA destructiva)
//
// Resetea o ELIMINA un cliente del Portal para que pueda iniciar desde cero.
// Reusa el puente KH→Portal existente (PORTAL_SUPABASE_URL + _SERVICE_KEY); el
// service_role del Portal vive SOLO aquí. Molde: admin-ingreso-eliminar.js.
//
// Body JSON: { cliente_id, modo, confirmacion }
//   - modo 'reset' (roles maestro_roshi/bulma): borra tours+pagos+comprobantes+
//     avatar; CONSERVA la fila `clientes` (avatar_url=null) y el usuario de auth.
//   - modo 'total' (SOLO maestro_roshi): además borra el usuario de auth del Portal
//     (Admin API). El ON DELETE CASCADE arrastra clientes→solicitudes_tour→pagos.
//
// CONFIRMACIÓN server-side: `confirmacion` debe coincidir con el nombre_completo
// EXACTO del cliente o con su numero_cliente (la función re-lee el cliente).
//
// Orden: 1) Storage (avatar + comprobantes) 2) filas (DELETE solicitudes en reset
// / DELETE auth user en total). Fail-soft en Storage (404 no rompe); errores de
// filas se reportan.
//
// Seguridad: verifyAdminAuthLive + corsCheck. service_role NUNCA sale al navegador.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ROLES_ADMIN = ['maestro_roshi', 'bulma'];

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

  // Mínimo: admin logueado. El gate fino por modo se aplica abajo.
  const auth = await verifyAdminAuthLive(event, ROLES_ADMIN);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  const rol = auth.user && auth.user.rol;
  const ejecutor = (auth.user && (auth.user.correo || auth.user.id)) || 'desconocido';

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const clienteId = (typeof body.cliente_id === 'string') ? body.cliente_id.trim() : '';
  const modo = body.modo;
  const confirmacion = (typeof body.confirmacion === 'string') ? body.confirmacion.trim() : '';

  if (!UUID_RE.test(clienteId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'cliente_id inválido' }) };
  }
  if (modo !== 'reset' && modo !== 'total') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'modo inválido (reset|total)' }) };
  }
  // CANDADO por rol: borrar la cuenta de auth solo el dueño.
  if (modo === 'total' && rol !== 'maestro_roshi') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo Maestro Roshi puede eliminar la cuenta (modo total)' }) };
  }

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const REST = `${env.PORTAL_SB_URL}/rest/v1`;

  try {
    // 1) Re-leer el cliente (fuente de verdad para la confirmación + auth_user_id).
    const cr = await fetch(`${REST}/clientes?id=eq.${clienteId}&select=id,auth_user_id,nombre_completo,numero_cliente&limit=1`, { headers: sbHeaders });
    if (!cr.ok) return upstream(headers, await cr.text(), 'consulta cliente');
    const cliente = (await cr.json())[0];
    if (!cliente) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cliente no encontrado' }) };

    // 2) Confirmación obligatoria server-side (nombre exacto o numero_cliente).
    const okConf = confirmacion.length > 0 && (
      confirmacion === String(cliente.nombre_completo || '').trim() ||
      confirmacion === String(cliente.numero_cliente || '')
    );
    if (!okConf) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Confirmación inválida: escribe el nombre exacto o el número de cliente' }) };
    }

    const authUid = cliente.auth_user_id;

    // 3) Juntar las solicitudes del cliente + paths de comprobante.
    const sr = await fetch(`${REST}/solicitudes_tour?cliente_id=eq.${clienteId}&select=id,comprobante_separo_url`, { headers: sbHeaders });
    if (!sr.ok) return upstream(headers, await sr.text(), 'consulta solicitudes');
    const solicitudes = await sr.json();
    const comprobantePaths = solicitudes.map(s => s.comprobante_separo_url).filter(Boolean);

    // 4) Borrar Storage (fail-soft: 404/ausente no rompe).
    let storageBorrado = 0;
    if (authUid) storageBorrado += await borrarObjeto(env, sbHeaders, 'avatars', `${authUid}/avatar.jpg`);
    for (const p of comprobantePaths) {
      storageBorrado += await borrarObjeto(env, sbHeaders, 'comprobantes', p);
    }

    // 5) Borrado de filas según modo.
    let authUserBorrado = false;
    if (modo === 'reset') {
      const dr = await fetch(`${REST}/solicitudes_tour?cliente_id=eq.${clienteId}`, {
        method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!dr.ok) return upstream(headers, await dr.text(), 'borrado de solicitudes');
      // Conservar la fila clientes; limpiar avatar_url.
      const ur = await fetch(`${REST}/clientes?id=eq.${clienteId}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ avatar_url: null }),
      });
      if (!ur.ok) return upstream(headers, await ur.text(), 'limpieza de avatar_url');
    } else { // total
      if (authUid) {
        const ar = await fetch(`${env.PORTAL_SB_URL}/auth/v1/admin/users/${authUid}`, {
          method: 'DELETE',
          headers: { apikey: env.PORTAL_SB_SERVICE, Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE },
        });
        // 404 = usuario ya borrado → idempotente, OK.
        if (!ar.ok && ar.status !== 404) return upstream(headers, await ar.text(), 'borrado de cuenta auth');
        authUserBorrado = ar.ok;
      } else {
        // Sin auth_user_id (raro): borra la fila clientes directo (cascade a solicitudes/pagos).
        const dc = await fetch(`${REST}/clientes?id=eq.${clienteId}`, {
          method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
        });
        if (!dc.ok) return upstream(headers, await dc.text(), 'borrado de cliente');
      }
    }

    const resumen = {
      ok: true,
      modo,
      cliente: { id: clienteId, nombre: cliente.nombre_completo, numero: cliente.numero_cliente },
      solicitudes_borradas: solicitudes.length,
      comprobantes_borrados: comprobantePaths.length,
      storage_objetos_borrados: storageBorrado,
      auth_user_borrado: authUserBorrado,
      ejecutor,
    };
    console.log('[portal-cliente-reset]', JSON.stringify({
      ejecutor, rol, modo, cliente_id: clienteId, numero: cliente.numero_cliente,
      solicitudes: solicitudes.length, auth_user_borrado: authUserBorrado,
    }));
    return { statusCode: 200, headers, body: JSON.stringify(resumen) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en el reseteo de cliente', detail: e.message }) };
  }
};

// ----- helpers -----

// Borra un objeto del Storage del Portal. Devuelve 1 si borró, 0 si no existía/falló.
async function borrarObjeto(env, sbHeaders, bucket, path) {
  try {
    const enc = String(path).split('/').map(encodeURIComponent).join('/');
    const r = await fetch(`${env.PORTAL_SB_URL}/storage/v1/object/${bucket}/${enc}`, {
      method: 'DELETE',
      headers: { apikey: env.PORTAL_SB_SERVICE, Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE },
    });
    return r.ok ? 1 : 0;
  } catch (e) { return 0; }
}

function upstream(headers, detail, op) {
  return { statusCode: 502, headers, body: JSON.stringify({ error: `Portal rechazó: ${op}`, detail: String(detail).slice(0, 300) }) };
}

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
