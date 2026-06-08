// =============================================================================
// admin-reportes.js — Acceso server-side a la tabla `reportes_evento` (KH)
//
// Cierra la exposición a anon: kamehouse.html ya NO lee/escribe `reportes_evento`
// directo con la anon key. Todo pasa por aquí con service_role + verifyAdminAuth.
// Mismo patrón que admin-usuarios.js / admin-contratos.js.
//
// evento_id es TEXT (slug, p.ej. 'karolg'), NO uuid (unificación Fase A/C).
// La columna de estado es `status` (no `estado`).
//
// Body JSON: { accion, ... }
//   LECTURA
//   - 'listar' { estado?, evento_id?, coordi_id?, limit? }
//        Roles: maestro_roshi, bulma, mister_popo, coordinador.
//        ⚠️ Anti-escalación: si el JWT es coordinador, coordi_id se FUERZA a su
//           propio id (ve SOLO sus reportes). `estado` acepta lista separada por
//           comas → in.(...). Whitelist de columnas (resuelve el viejo select=*).
//        → { ok, reportes:[...] }
//   ESCRITURA DEL COORDI (rol coordinador, SOLO su propio reporte)
//   - 'guardar_mio' { id?, evento_id, status, kits_detalle, gastos_detalle,
//        dinero_recibido, total_gastado, diferencia, cuenta_bancaria_coordi, notas }
//        coordi_id se FUERZA al del JWT. status SOLO 'borrador'|'enviado'.
//        Con id → verifica que el reporte sea suyo (403 si no) y PATCH.
//        Sin id → upsert on_conflict(evento_id,coordi_id). → { ok, id }
//   - 'enviar_mio' { id }  → status='enviado' de SU reporte (verifica propiedad).
//   MODERACIÓN (admin / mister_popo según la cadena de aprobación)
//   - 'aprobar_popo'  { id } → status='aprobado_popo'. Roles: mister_popo + admin.
//   - 'aprobar_final' { id } → status='aprobado_memo' + fecha_aprobado. Roles: admin.
//   - 'rechazar'      { id, motivo } → status='rechazado'. Roles: mister_popo + admin.
//   - 'marcar_kits_recibidos' { id, kits_detalle } → PATCH kits_detalle + updated_at.
//        Roles: mister_popo + admin.
//   - 'eliminar' { id } → DELETE. Roles: maestro_roshi, bulma.
//
// Seguridad:
//   - Authorization: Bearer <JWT> (verifyAdminAuth) + corsCheck.
//   - SELECT con whitelist explícita COLS. Único campo PII es cuenta_bancaria_coordi
//     (CLABE del coordi) — se INCLUYE porque el panel admin la necesita para depositar;
//     ya solo llega a roles autorizados (antes era anon-público).
//   - El coordi NUNCA puede tocar reportes de otro ni cambiar el estado de aprobación.
//   - check-strikes-diario.js (cron) usa service_role aparte; este endpoint no lo toca.
//
// Env vars (reusa las de KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE,
//   JWT_SECRET (lo lee verifyAdminAuth).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[a-zA-Z0-9_-]{1,80}$/;

const ROLES_ADMIN = ['maestro_roshi', 'bulma'];
const ROLES_READ  = ['maestro_roshi', 'bulma', 'mister_popo', 'coordinador'];
const ROLES_MOD   = ['maestro_roshi', 'bulma', 'mister_popo']; // aprobar_popo / rechazar / marcar_kits

const ESTADOS_VALIDOS = ['borrador', 'enviado', 'rechazado', 'aprobado_popo', 'aprobado_memo'];
const COORDI_STATUS   = ['borrador', 'enviado']; // lo único que el coordi puede setear

// Whitelist de columnas que SÍ viajan al navegador. strike_devolucion_aplicado
// (solo lo usa el cron) queda fuera. cuenta_bancaria_coordi se incluye a propósito
// (el panel admin lo necesita; ver cabecera).
const COLS = [
  'id', 'evento_id', 'coordi_id', 'status', 'dinero_recibido', 'total_gastado',
  'diferencia', 'cuenta_bancaria_coordi', 'kits_detalle', 'gastos_detalle',
  'notas', 'rechazo_motivo', 'fecha_aprobado', 'created_at', 'updated_at',
].join(',');

// Campos que el COORDI puede setear en SU propio reporte (anti-escalación: NO
// incluye coordi_id —se fuerza—, ni fecha_aprobado, ni rechazo_motivo arbitrario).
const COORDI_FIELDS = [
  'evento_id', 'kits_detalle', 'gastos_detalle', 'dinero_recibido',
  'total_gastado', 'diferencia', 'cuenta_bancaria_coordi', 'notas',
];

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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const accion = body.accion;

  // Roles permitidos por acción.
  const rolesPorAccion = {
    listar: ROLES_READ,
    guardar_mio: ['coordinador'],
    enviar_mio: ['coordinador'],
    aprobar_popo: ROLES_MOD,
    aprobar_final: ROLES_ADMIN,
    rechazar: ROLES_MOD,
    marcar_kits_recibidos: ROLES_MOD,
    eliminar: ROLES_ADMIN,
  };
  const rolesPermitidos = rolesPorAccion[accion];
  if (!rolesPermitidos) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  }

  const auth = verifyAdminAuth(event, rolesPermitidos);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const jwtUserId = auth.user && (auth.user.id || auth.user.sub);
  const jwtRol = auth.user && auth.user.rol;
  if (!jwtUserId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JWT sin id de usuario' }) };
  }

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const base = `${env.KH_SB_URL}/rest/v1/reportes_evento`;

  // Helper: lee el coordi_id real de un reporte por id (para anti-escalación).
  async function fetchReporteOwner(id) {
    const r = await fetch(`${base}?id=eq.${id}&select=coordi_id,status&limit=1`, { headers: sbHeaders });
    if (!r.ok) return { error: 'KH rechazó la consulta', detail: await r.text() };
    const rows = await r.json();
    return { row: rows[0] || null };
  }

  try {
    // ── listar ──────────────────────────────────────────────────────────────
    if (accion === 'listar') {
      const sp = new URLSearchParams();
      sp.set('select', COLS);

      // estado: acepta string simple o lista 'a,b,c' → in.(...).
      if (typeof body.estado === 'string' && body.estado.trim()) {
        const estados = body.estado.split(',').map(s => s.trim()).filter(Boolean);
        const validos = estados.filter(s => ESTADOS_VALIDOS.includes(s));
        if (validos.length === 1) sp.append('status', `eq.${validos[0]}`);
        else if (validos.length > 1) sp.append('status', `in.(${validos.join(',')})`);
      }

      if (typeof body.evento_id === 'string' && body.evento_id.trim()) {
        const slug = body.evento_id.trim();
        if (!SLUG_RE.test(slug)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
        }
        sp.append('evento_id', `eq.${slug}`);
      }

      // Anti-escalación: el coordi SOLO ve sus reportes (ignora coordi_id del body).
      if (jwtRol === 'coordinador') {
        sp.append('coordi_id', `eq.${jwtUserId}`);
      } else if (typeof body.coordi_id === 'string' && body.coordi_id.trim()) {
        const cid = body.coordi_id.trim();
        if (!UUID_RE.test(cid)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'coordi_id inválido' }) };
        }
        sp.append('coordi_id', `eq.${cid}`);
      }

      let limit = parseInt(body.limit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) limit = 100;
      sp.set('limit', String(limit));
      sp.set('order', 'created_at.desc');

      const r = await fetch(`${base}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      const reportes = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, reportes }) };
    }

    // ── guardar_mio (coordi crea/edita SU reporte) ────────────────────────────
    if (accion === 'guardar_mio') {
      const status = String(body.status || '').trim();
      if (!COORDI_STATUS.includes(status)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "status inválido (solo 'borrador' o 'enviado')" }) };
      }
      const evento_id = (body.evento_id == null || body.evento_id === '') ? null : String(body.evento_id).trim();
      if (evento_id !== null && !SLUG_RE.test(evento_id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
      }
      if (status === 'enviado' && !evento_id) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta evento para enviar' }) };
      }

      // Construir fila con whitelist; coordi_id SIEMPRE el del JWT.
      const fila = { coordi_id: jwtUserId, status, evento_id };
      for (const k of COORDI_FIELDS) {
        if (k === 'evento_id') continue; // ya manejado
        if (Object.prototype.hasOwnProperty.call(body, k)) fila[k] = body[k];
      }
      // Validación numérica suave.
      for (const k of ['dinero_recibido', 'total_gastado', 'diferencia']) {
        if (fila[k] != null) {
          const n = Number(fila[k]);
          if (!Number.isFinite(n)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: `${k} inválido` }) };
          }
          fila[k] = n;
        }
      }
      // Al enviar, limpiar motivo de rechazo viejo. El coordi nunca setea rechazo_motivo.
      if (status === 'enviado') fila.rechazo_motivo = null;

      const id = String(body.id || '').trim();
      if (id) {
        if (!UUID_RE.test(id)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
        }
        // Anti-escalación: el reporte debe ser del propio coordi.
        const owner = await fetchReporteOwner(id);
        if (owner.error) return { statusCode: 502, headers, body: JSON.stringify({ error: owner.error, detail: owner.detail }) };
        if (!owner.row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Reporte no encontrado' }) };
        if (owner.row.coordi_id !== jwtUserId) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes editar el reporte de otro coordi' }) };
        }
        const r = await fetch(`${base}?id=eq.${id}`, {
          method: 'PATCH',
          headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify(fila),
        });
        if (!r.ok) {
          const detail = await r.text();
          return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
        }
        const rows = await r.json();
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: (rows[0] && rows[0].id) || id }) };
      }

      // Sin id → upsert on_conflict(evento_id,coordi_id) (la fila es del propio coordi).
      const r = await fetch(`${base}?on_conflict=evento_id,coordi_id`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el upsert', detail }) };
      }
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: (rows[0] && rows[0].id) || null }) };
    }

    // ── enviar_mio (coordi envía SU reporte) ──────────────────────────────────
    if (accion === 'enviar_mio') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const owner = await fetchReporteOwner(id);
      if (owner.error) return { statusCode: 502, headers, body: JSON.stringify({ error: owner.error, detail: owner.detail }) };
      if (!owner.row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Reporte no encontrado' }) };
      if (owner.row.coordi_id !== jwtUserId) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes enviar el reporte de otro coordi' }) };
      }
      return await patchStatus(id, { status: 'enviado', rechazo_motivo: null });
    }

    // ── aprobar_popo (mister_popo / admin) ────────────────────────────────────
    if (accion === 'aprobar_popo') {
      const id = validId(body.id);
      if (!id) return badId();
      return await patchStatus(id, { status: 'aprobado_popo' });
    }

    // ── aprobar_final (admin) ─────────────────────────────────────────────────
    if (accion === 'aprobar_final') {
      const id = validId(body.id);
      if (!id) return badId();
      return await patchStatus(id, { status: 'aprobado_memo', fecha_aprobado: new Date().toISOString() });
    }

    // ── rechazar (mister_popo / admin) ────────────────────────────────────────
    if (accion === 'rechazar') {
      const id = validId(body.id);
      if (!id) return badId();
      const motivo = String(body.motivo || '').trim().slice(0, 500);
      if (!motivo) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'motivo requerido' }) };
      }
      return await patchStatus(id, { status: 'rechazado', rechazo_motivo: motivo });
    }

    // ── marcar_kits_recibidos (mister_popo / admin) ───────────────────────────
    if (accion === 'marcar_kits_recibidos') {
      const id = validId(body.id);
      if (!id) return badId();
      if (body.kits_detalle == null) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'kits_detalle requerido' }) };
      }
      return await patchStatus(id, { kits_detalle: body.kits_detalle, updated_at: new Date().toISOString() });
    }

    // ── eliminar (admin) ──────────────────────────────────────────────────────
    if (accion === 'eliminar') {
      const id = validId(body.id);
      if (!id) return badId();
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el delete', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-reportes', detail: e.message }) };
  }

  // ----- helpers de cierre (capturan headers/base/sbHeaders) -----
  function validId(x) { const id = String(x || '').trim(); return UUID_RE.test(id) ? id : null; }
  function badId() { return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) }; }
  async function patchStatus(id, patch) {
    const r = await fetch(`${base}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
