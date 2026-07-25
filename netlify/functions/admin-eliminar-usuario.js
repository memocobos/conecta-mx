// =============================================================================
// admin-eliminar-usuario.js
//
// HARD-DELETE de un usuario en Kamehouse con service_role + CANDADO de
// dependientes. La baja LÓGICA (activo=false, reversible) es la acción primaria
// y vive en admin-usuarios.js (accion 'actualizar' { activo:false }) — aquí NO se
// duplica. Este endpoint solo borra FÍSICAMENTE usuarios 100% limpios.
//
// Auth:
//   - JWT Bearer del admin logueado (rol = maestro_roshi únicamente).
//   - CORS check (mismo whitelist que otras admin functions).
//   - Anti-self-delete + no se puede borrar maestro_roshi/bulma (rol protegido).
//
// CANDADO: antes del DELETE cuenta dependientes (service_role) en TODAS las
// tablas que cuelgan del usuario. Si hay CUALQUIERA → 409 'tiene_dependientes'
// con el detalle, y NO borra (sugiere desactivar). Nunca borra en cascada — no
// perdemos historial; solo permite borrar usuarios sin rastro.
//   eventos_coordi.coordi_id · viajeros_evento.correo · reportes_evento.coordi_id
//   deudas_coordi.coordi_id (+pendientes pagado=false) · strikes_log.coordi_id
//   tours_pasados.usuario_id · notificaciones.usuario_id
// (No incluye `ventas`: no existe tabla; vendedor_id solo vive en el cotizador
//  en memoria, no se persiste.)
//
// Body JSON: { userId: <uuid> }
// =============================================================================

const { verifyAdminAuth, corsCheck, corsHeaders } = require('./_lib/verify-admin');

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonRes(event, status, payload) {
  return { statusCode: status, headers: corsHeaders(event), body: JSON.stringify(payload) };
}
function badRequest(event, status, error) {
  return jsonRes(event, status, { ok: false, error });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return badRequest(event, 405, 'Método no permitido');
  }
  if (!corsCheck(event)) {
    return badRequest(event, 403, 'Origen no permitido');
  }
  if (!SB_URL || !SB_KEY) {
    return badRequest(event, 500, 'Supabase no configurado');
  }

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) {
    return badRequest(event, auth.status || 401, auth.error);
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return badRequest(event, 400, 'JSON inválido'); }

  const userId = String(body.userId || '').trim();
  if (!userId || !UUID_RE.test(userId)) {
    return badRequest(event, 400, 'userId inválido (no es UUID)');
  }
  if (userId === auth.user.id || userId === auth.user.sub) {
    return badRequest(event, 400, 'No puedes eliminarte a ti mismo');
  }

  const sbHeaders = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

  // 1) Lookup del target: rol (protección) + correo (clave de viajeros).
  let target;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(userId)}&select=rol,nombre,correo&limit=1`,
      { headers: sbHeaders });
    if (r.ok) target = (await r.json())[0];
  } catch (e) { /* lookup falló — se valida abajo */ }

  if (!target) {
    return badRequest(event, 404, 'Usuario no encontrado');
  }
  if (['maestro_roshi', 'bulma'].includes(target.rol)) {
    return badRequest(event, 403, `No se puede eliminar a ${target.nombre} (rol protegido)`);
  }

  // 2) CANDADO — contar dependientes (fail-closed: si algún conteo falla, NO borra).
  let detalle;
  try {
    detalle = await contarDependientes(sbHeaders, userId, target.correo);
  } catch (e) {
    console.error('[admin-eliminar-usuario] conteo de dependientes falló:', e.message);
    return badRequest(event, 502, 'No se pudo verificar dependientes: ' + e.message);
  }

  const total = detalle.asignaciones + detalle.viajeros + detalle.reportes
    + detalle.deudas + detalle.strikes + detalle.tours + detalle.notificaciones;

  if (total > 0) {
    return jsonRes(event, 409, {
      ok: false,
      motivo: 'tiene_dependientes',
      detalle,
      sugerencia: 'Desactiva al usuario en vez de eliminarlo (conserva su historial).',
    });
  }

  // 3) Usuario 100% limpio → DELETE físico.
  try {
    const r = await fetch(`${SB_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[admin-eliminar-usuario] DELETE failed', r.status, txt);
      return badRequest(event, 502, 'Error eliminando: ' + txt.slice(0, 200));
    }
    return jsonRes(event, 200, { ok: true });
  } catch (e) {
    console.error('[admin-eliminar-usuario] network error', e.message);
    return badRequest(event, 502, 'Error de red: ' + e.message);
  }
};

// ----- helpers -----

// Cuenta filas dependientes por tabla. Usa PostgREST count=exact (Content-Range)
// con limit=1 para no traer datos. Lanza si alguna consulta falla (fail-closed).
async function contarDependientes(sbHeaders, userId, correo) {
  const uid = encodeURIComponent(userId);
  const queries = {
    asignaciones:   `eventos_coordi?coordi_id=eq.${uid}&select=id`,
    reportes:       `reportes_evento?coordi_id=eq.${uid}&select=id`,
    deudas:         `deudas_coordi?coordi_id=eq.${uid}&select=id`,
    deudas_pendientes: `deudas_coordi?coordi_id=eq.${uid}&pagado=eq.false&select=id`,
    strikes:        `strikes_log?coordi_id=eq.${uid}&select=id`,
    tours:          `tours_pasados?usuario_id=eq.${uid}&select=id`,
    notificaciones: `notificaciones?usuario_id=eq.${uid}&select=id`,
  };
  // viajeros_evento por correo (robusto: usuario_id puede no existir en prod).
  if (correo) {
    queries.viajeros = `viajeros_evento?correo=eq.${encodeURIComponent(correo)}&select=id`;
  }

  const keys = Object.keys(queries);
  const counts = await Promise.all(keys.map((k) => contar(sbHeaders, queries[k])));
  const out = {};
  keys.forEach((k, i) => { out[k] = counts[i]; });
  if (!('viajeros' in out)) out.viajeros = 0;
  return out;
}

async function contar(sbHeaders, pathQuery) {
  const r = await fetch(`${SB_URL}/rest/v1/${pathQuery}&limit=1`, {
    headers: { ...sbHeaders, Prefer: 'count=exact' },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`${pathQuery.split('?')[0]} ${r.status} ${txt.slice(0, 120)}`);
  }
  // Content-Range: '0-0/<total>'  (o '*/<total>')
  const cr = r.headers.get('content-range') || '';
  const n = parseInt(cr.split('/')[1], 10);
  return Number.isFinite(n) ? n : 0;
}
