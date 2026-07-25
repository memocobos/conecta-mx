// =============================================================================
// portal-lugar-actualizar  (Acompañantes F1-t3 — ESCRITURA del titular)
//
// La llama el TITULAR con su PROPIO JWT del portal para capturar los datos de un
// acompañante (un "lugar" de su solicitud): nombre, correo y fecha de nacimiento.
// SOLO esos 3 campos son escribibles desde aquí; cualquier otro campo del body se
// IGNORA (cliente_id/estado/precio/paquete/zona/tipo_habitacion NO se tocan nunca).
//
// Candados (todos server-side con service_role):
//   - JWT válido → user.id (sin JWT/ inválido → 401).
//   - El lugar existe (404) y está 'activo' (409 si baja/traspasado).
//   - La solicitud del lugar es del usuario (auth_user_id === user.id, 403) y NO
//     está cancelada (409).
//
// Seguridad (mismo patrón que portal-reclamar-cuenta): valida el JWT con
// GET /auth/v1/user (apikey ANON), y escribe con service_role.
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY,
//                       PORTAL_SUPABASE_SERVICE_KEY. (Sin env vars nuevas.)
// =============================================================================

// AUD-3: re-evalúa el tipo del contrato (adulto/menor) cuando llega la fecha real.
const { sincronizarTipoContrato } = require('./_lib/contratos-viajeros');

const UUID_RE = /^[0-9a-f-]{36}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const SB_ANON    = process.env.PORTAL_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_ANON || !SB_SERVICE) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars (PORTAL_SUPABASE_*)' }) };
  }

  // ---- 1. Validar el JWT del titular ----
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Falta Authorization Bearer' }) };
  }

  let user;
  try {
    const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + jwt },
    });
    if (!userResp.ok) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT inválido o expirado' }) };
    }
    user = await userResp.json();
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo validar el JWT', detail: e.message }) };
  }
  if (!user || !user.id) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'JWT sin usuario' }) };
  }

  // ---- 2. Body: SOLO lugar_id + los 3 campos escribibles ----
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const lugarId = body && typeof body.lugar_id === 'string' ? body.lugar_id.trim() : '';
  if (!UUID_RE.test(lugarId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'lugar_id inválido' }) };
  }

  // Saneo de los 3 campos escribibles (aplicar solo los que vengan).
  const patch = {};

  if (body.nombre != null) {
    const nombre = String(body.nombre).trim();
    if (nombre.length < 1 || nombre.length > 120) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'nombre inválido (1 a 120 caracteres)' }) };
    }
    patch.nombre = nombre;
  }

  if (body.correo != null && String(body.correo).trim() !== '') {
    const correo = String(body.correo).trim().toLowerCase();
    if (!correo.includes('@') || correo.length > 200) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'correo inválido' }) };
    }
    patch.correo = correo;
  }

  if (body.fecha_nacimiento != null && String(body.fecha_nacimiento).trim() !== '') {
    const fnac = String(body.fecha_nacimiento).trim();
    const err = validarFechaNac(fnac);
    if (err) return { statusCode: 400, headers, body: JSON.stringify({ error: err }) };
    patch.fecha_nacimiento = fnac;
  }

  if (Object.keys(patch).length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nada para actualizar' }) };
  }

  const sbHeaders = {
    apikey: SB_SERVICE,
    Authorization: 'Bearer ' + SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // ---- 3. El lugar existe y está 'activo' ----
    const lugR = await fetch(
      `${SB_URL}/rest/v1/lugares?id=eq.${encodeURIComponent(lugarId)}&select=solicitud_id,estado&limit=1`,
      { headers: sbHeaders }
    );
    if (!lugR.ok) {
      const detail = await lugR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta del lugar', detail }) };
    }
    const lugArr = await lugR.json();
    const lugar = Array.isArray(lugArr) ? lugArr[0] : null;
    if (!lugar) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lugar no encontrado' }) };
    }
    if (lugar.estado !== 'activo') {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este lugar ya no se puede editar' }) };
    }

    // ---- 4. La solicitud es del usuario y no está cancelada ----
    const solR = await fetch(
      `${SB_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(lugar.solicitud_id)}&select=auth_user_id,estado&limit=1`,
      { headers: sbHeaders }
    );
    if (!solR.ok) {
      const detail = await solR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de la solicitud', detail }) };
    }
    const solArr = await solR.json();
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    if (!solicitud) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
    }
    if (solicitud.auth_user_id !== user.id) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Este lugar no es tuyo' }) };
    }
    if (solicitud.estado === 'cancelado') {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este tour fue cancelado' }) };
    }

    // ---- 5. PATCH del lugar (solo los campos saneados) ----
    patch.updated_at = new Date().toISOString();
    const upR = await fetch(`${SB_URL}/rest/v1/lugares?id=eq.${encodeURIComponent(lugarId)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!upR.ok) {
      const detail = await upR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo actualizar el lugar', detail }) };
    }
    const upArr = await upR.json();
    const actualizado = Array.isArray(upArr) ? upArr[0] : null;

    // 🔒 AUD-3 — HUECO LEGAL DE MENORES. Este endpoint es el ÚNICO punto donde un
    // lugar recibe su fecha de nacimiento real (los acompañantes nacen sin ella y
    // su contrato se crea como 'adulto'). Si la fecha revela que es MENOR, el
    // contrato PENDIENTE se corrige aquí; uno ya firmado NO se toca y se marca
    // para revisión manual. Best-effort: nunca tumba la actualización del lugar.
    let contrato_tipo;
    if (patch.fecha_nacimiento) {
      const sync = await sincronizarTipoContrato({
        portalUrl: SB_URL, portalHeaders: sbHeaders,
        lugarId, fechaNacimiento: patch.fecha_nacimiento,
      });
      if (sync && (sync.cambiado || sync.revision_manual)) contrato_tipo = sync;
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, lugar: actualizado, ...(contrato_tipo ? { contrato_tipo } : {}) }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error actualizando el lugar', detail: e.message }) };
  }
};

// ----- helpers -----

// null si es válida; string de error si no. Formato YYYY-MM-DD, fecha real, año
// 1900..hoy, y no futura.
function validarFechaNac(fnac) {
  if (!FECHA_RE.test(fnac)) return 'fecha_nacimiento inválida (YYYY-MM-DD)';
  const d = new Date(fnac + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fnac) {
    return 'fecha_nacimiento inválida';
  }
  const year = parseInt(fnac.slice(0, 4), 10);
  const hoyISO = new Date().toISOString().slice(0, 10);
  if (year < 1900) return 'fecha_nacimiento inválida (año fuera de rango)';
  if (fnac > hoyISO) return 'fecha_nacimiento no puede ser futura';
  return null;
}
