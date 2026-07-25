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
// Milk (auxiliar): ve, aprueba y gestiona reportes como Bulma, pero NO los ELIMINA.
const ROLES_ADMIN_MILK = ['maestro_roshi', 'bulma', 'milk'];
const ROLES_READ  = ['maestro_roshi', 'bulma', 'mister_popo', 'coordinador', 'milk'];
const ROLES_MOD   = ['maestro_roshi', 'bulma', 'mister_popo', 'milk']; // aprobar_popo / rechazar / marcar_kits

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
    aprobar_final: ROLES_ADMIN_MILK,
    rechazar: ROLES_MOD,
    marcar_kits_recibidos: ROLES_MOD,
    eliminar: ROLES_ADMIN,          // eliminar reporte = destructivo → milk NO
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
      // 🗼 TORRE v2 F4a — CANDADO DE COMPARACIÓN (D2): si el (evento, coordi)
      // tiene salidas AUTORIZADAS, el reporte debe cuadrar contra lo llevado
      // ANTES de seguir la cadena: sacada == llevado por pieza, retornables
      // devueltos COMPLETOS SIEMPRE (D3), y nada sacado sin salida autorizada.
      // No cuadra → 409 con el detalle (la cadena se detiene y se revisa; la
      // comparación JAMÁS aplica strikes — eso sigue siendo del cron). Sin
      // salidas (legacy pre-v2) → aprueba byte-igual a hoy. La resolución de
      // faltantes cobrados llega en F4b — aquí un faltante simplemente no cuadra.
      const rep = await leerReporte(id);
      if (!rep) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Reporte no encontrado' }) };
      const salidas = await salidasAutorizadasDe(rep.evento_id, rep.coordi_id);
      if (salidas.length) {
        const diferencias = compararSalidaVsReporte(salidas, rep.kits_detalle);
        if (diferencias.length) {
          // 🗼 F4b — FALTANTES COBRADOS (regla D-1): las diferencias por piezas
          // que NO regresan son COBRABLES al costo de reposición. Errores de
          // captura (declaró de más, sobrante>sacado, pieza sin salida) NO son
          // cobrables: se corrige el reporte, 409 duro siempre.
          const noCobrables = diferencias.filter(d =>
            d.tipo === 'sin_salida_autorizada' ||
            d.tipo === 'sobrante_mayor_que_sacado' ||
            (d.tipo === 'declarado_vs_llevado' && d.declarado > d.llevado));
          const cobrable = noCobrables.length === 0;

          if (!body.cobrar_faltantes || !cobrable) {
            // Estimación del cobro para el confirm del cuidador (best-effort:
            // sin costos, el confirm sale sin monto — jamás bloquea el 409).
            let faltantes_estimados, faltantes_monto_estimado;
            if (cobrable) {
              try {
                const est = await valuarFaltantes(salidas, rep.kits_detalle);
                faltantes_estimados = est.faltantes;
                faltantes_monto_estimado = est.monto;
              } catch (e) { /* sin estimación */ }
            }
            return {
              statusCode: 409, headers,
              body: JSON.stringify({
                error: 'La salida de bodega y el reporte no cuadran — revisa antes de aprobar',
                diferencias, cobrable,
                ...(faltantes_estimados ? { faltantes_estimados, faltantes_monto_estimado } : {}),
              }),
            };
          }

          // "Aprobar con faltantes cobrados": valúa al costo de reposición,
          // deja el REGISTRO en la salida (faltantes + monto) y destranca la
          // cadena. El reloj de 15 días lo sella aprobar_final de Memo (D-1c).
          const { faltantes, monto } = await valuarFaltantes(salidas, rep.kits_detalle);
          if (!faltantes.length) {
            return { statusCode: 409, headers, body: JSON.stringify({ error: 'No hay faltantes que cobrar — corrige el reporte', diferencias, cobrable }) };
          }
          const reg = await fetch(`${env.KH_SB_URL}/rest/v1/salidas_bodega?id=eq.${encodeURIComponent(String(salidas[0].id))}`, {
            method: 'PATCH',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ faltantes, faltantes_monto: monto }),
          });
          if (!reg.ok) {
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo registrar el cobro de faltantes — no se aprobó', detail: await reg.text() }) };
          }
          const okRes = await patchStatus(id, { status: 'aprobado_popo' });
          if (okRes.statusCode !== 200) return okRes;
          return { statusCode: 200, headers, body: JSON.stringify({ ok: true, cobrado: true, faltantes, faltantes_monto: monto }) };
        }
      }
      return await patchStatus(id, { status: 'aprobado_popo' });
    }

    // ── aprobar_final (admin) ─────────────────────────────────────────────────
    if (accion === 'aprobar_final') {
      const id = validId(body.id);
      if (!id) return badId();
      const res = await patchStatus(id, { status: 'aprobado_memo', fecha_aprobado: new Date().toISOString() });
      if (res.statusCode !== 200) return res;
      // 🗼 F4a: avisa al cliente si este reporte viene de una salida v2 — en ese
      // caso el stock YA se descontó al dar salida y el descuento legacy del
      // front NO debe correr (doble descuento). Best-effort: si no se puede
      // determinar → false (comportamiento de hoy).
      let salida_v2 = false;
      let faltantes_vence = null;
      try {
        const rep = await leerReporte(id);
        if (rep) {
          const sals = await salidasAutorizadasDe(rep.evento_id, rep.coordi_id);
          salida_v2 = sals.length > 0;
          // 🗼 F4b (D-1c): la autorización final de Memo ARRANCA el reloj — 15
          // días naturales para liquidar faltantes. Solo se sella una vez
          // (vence null) y solo donde hay cobro registrado. Best-effort: si
          // falla, el cron simplemente no verá vence y no habrá strike (jamás
          // un strike con reloj mal sellado).
          const conCobro = sals.filter(s => Number(s.faltantes_monto) > 0 && !s.faltantes_vence);
          if (conCobro.length) {
            const hoyMX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
            faltantes_vence = _masDiasISO(hoyMX, 15);
            for (const s of conCobro) {
              await fetch(`${env.KH_SB_URL}/rest/v1/salidas_bodega?id=eq.${encodeURIComponent(String(s.id))}&faltantes_vence=is.null`, {
                method: 'PATCH',
                headers: { ...sbHeaders, Prefer: 'return=minimal' },
                body: JSON.stringify({ faltantes_vence }),
              });
            }
          }
        }
      } catch (e) { salida_v2 = salida_v2 || false; }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, salida_v2, ...(faltantes_vence ? { faltantes_vence } : {}) }) };
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
      const res = await patchStatus(id, { kits_detalle: body.kits_detalle, updated_at: new Date().toISOString() });
      if (res.statusCode !== 200) return res;

      // 🗼 TORRE v2 F4a — STOCK DE REGRESO (D2/D3): al palomear recibido, las
      // devoluciones declaradas (sobrantes de consumibles + retornables) SUMAN
      // de regreso a kits_inventario (read-then-write, jamás on_conflict) y la
      // salida se CIERRA (estado→cerrada + reporte_id + cerrada_en).
      // IDEMPOTENCIA DURA: el cierre es un PATCH CONDICIONADO a
      // estado=eq.autorizada — solo el primer palomeo gana; re-palomear
      // encuentra la salida cerrada y JAMÁS re-suma. Legacy sin salida →
      // byte-igual a hoy (solo el PATCH del kits_detalle de arriba).
      let regreso;
      try {
        regreso = await sumarRegresoYCerrar(id, body.kits_detalle);
      } catch (e) {
        regreso = { error: 'No se pudo procesar el regreso de stock: ' + e.message };
      }
      // Si algo del regreso falló, se reporta FUERTE (ajuste manual en la
      // Torre) pero el palomeo de recibido queda — el cron de strikes depende
      // del flag `recibido` ya guardado.
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...(regreso || {}) }) };
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

  // ── 🗼 TORRE v2 F4a: helpers del cruce salida ↔ reporte ──────────────────
  async function leerReporte(id) {
    const r = await fetch(`${base}?id=eq.${id}&select=id,evento_id,coordi_id,kits_detalle,status&limit=1`, { headers: sbHeaders });
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return (rows && rows[0]) || null;
  }

  // Salidas AUTORIZADAS del (evento, coordi) — el puente entre bodega y reporte.
  async function salidasAutorizadasDe(eventoId, coordiId) {
    if (!eventoId || !coordiId) return [];
    const r = await fetch(
      `${env.KH_SB_URL}/rest/v1/salidas_bodega?evento_id=eq.${encodeURIComponent(String(eventoId))}` +
      `&solicitante_id=eq.${encodeURIComponent(String(coordiId))}&estado=eq.autorizada` +
      `&select=id,detalle,estado,faltantes_monto,faltantes_vence&limit=100`,
      { headers: sbHeaders }
    );
    if (!r.ok) throw new Error('salidas_bodega no respondió');
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  }

  // 🗼 F4b: valúa los faltantes AL COSTO DE REPOSICIÓN (kits_inventario.
  // costo_unitario — sensible, pero esto es server-side service_role y al
  // registro solo viaja el desglose del cobro). Lanza si los costos no se
  // pueden leer (el caller decide: estimación best-effort o 502 en el cobro).
  async function valuarFaltantes(salidas, kitsDetalle) {
    const faltantesBase = calcularFaltantes(salidas, kitsDetalle);
    if (!faltantesBase.length) return { faltantes: [], monto: 0 };
    const ids = faltantesBase.map(f => encodeURIComponent(String(f.pieza_id))).join(',');
    const r = await fetch(`${env.KH_SB_URL}/rest/v1/kits_inventario?id=in.(${ids})&select=id,costo_unitario`, { headers: sbHeaders });
    if (!r.ok) throw new Error('no se pudieron leer los costos de reposición');
    const costoPor = {};
    ((await r.json().catch(() => [])) || []).forEach(k => { costoPor[String(k.id)] = Number(k.costo_unitario) || 0; });
    let monto = 0;
    const faltantes = faltantesBase.map(f => {
      const costo_unit = costoPor[String(f.pieza_id)] || 0;
      const importe = Math.round(costo_unit * f.cantidad * 100) / 100;
      monto += importe;
      return { ...f, costo_unit, importe };
    });
    return { faltantes, monto: Math.round(monto * 100) / 100 };
  }

  // Devoluciones declaradas SUMAN al stock y las salidas se CIERRAN. El cierre
  // condicionado (estado=eq.autorizada) es el gate: re-palomear jamás re-suma.
  async function sumarRegresoYCerrar(reporteId, kitsDetalle) {
    const rep = await leerReporte(reporteId);
    if (!rep) return {};
    const salidas = await salidasAutorizadasDe(rep.evento_id, rep.coordi_id);
    if (!salidas.length) return {}; // legacy sin salida → byte-igual a hoy
    const baseSalidas = `${env.KH_SB_URL}/rest/v1/salidas_bodega`;
    const baseKits = `${env.KH_SB_URL}/rest/v1/kits_inventario`;

    // 1) CERRAR condicionado — solo lo que ESTA llamada cierra cuenta para sumar.
    const cerradas = [];
    for (const s of salidas) {
      const r = await fetch(`${baseSalidas}?id=eq.${encodeURIComponent(String(s.id))}&estado=eq.autorizada`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ estado: 'cerrada', reporte_id: reporteId, cerrada_en: new Date().toISOString() }),
      });
      if (r.ok) {
        const rows = await r.json().catch(() => []);
        if (Array.isArray(rows) && rows.length) cerradas.push(s);
      }
    }
    if (!cerradas.length) return { regreso: 'ya_cerrado' }; // re-palomeo

    // 2) SUMAR devoluciones declaradas (sobrante clampado a lo llevado; los
    //    retornables ya pasaron el candado de popo = vienen completos).
    const llevado = {};
    cerradas.forEach(s => (Array.isArray(s.detalle) ? s.detalle : []).forEach(d => {
      const k = String(d.pieza_id);
      if (!llevado[k]) llevado[k] = { pieza: d.pieza, cantidad: 0 };
      llevado[k].cantidad += Number(d.cantidad) || 0;
    }));
    const kits = parseKitsDetalle(kitsDetalle);
    const stock_sumado = [];
    const regreso_errores = [];
    for (const [pid, l] of Object.entries(llevado)) {
      const fila = kits.find(k => String(k.pieza_id || '') === pid);
      const declarado = fila ? Number(fila.cantidad_sobrante) || 0 : 0;
      const devuelto = Math.min(Math.max(declarado, 0), l.cantidad);
      if (!devuelto) continue;
      try {
        const g = await fetch(`${baseKits}?id=eq.${encodeURIComponent(pid)}&select=id,cantidad&limit=1`, { headers: sbHeaders });
        const [p] = g.ok ? ((await g.json().catch(() => [])) || []) : [];
        if (!p) { regreso_errores.push({ pieza: l.pieza, devuelto, error: 'pieza no encontrada' }); continue; }
        const pR = await fetch(`${baseKits}?id=eq.${encodeURIComponent(pid)}`, {
          method: 'PATCH',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ cantidad: (Number(p.cantidad) || 0) + devuelto }),
        });
        if (!pR.ok) { regreso_errores.push({ pieza: l.pieza, devuelto, error: 'no se pudo sumar' }); continue; }
        stock_sumado.push({ pieza: l.pieza, devuelto });
      } catch (e) { regreso_errores.push({ pieza: l.pieza, devuelto, error: e.message }); }
    }
    return {
      salidas_cerradas: cerradas.length,
      stock_sumado,
      ...(regreso_errores.length ? { regreso_errores } : {}),
    };
  }
};

// ── 🗼 TORRE v2 F4a: comparación PURA salida ↔ reporte (D2/D3) ───────────────
function parseKitsDetalle(kd) {
  try {
    const v = typeof kd === 'string' ? JSON.parse(kd) : kd;
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

// llevado (salidas autorizadas) vs declarado (cantidad_sacada) vs devuelto
// (cantidad_sobrante). Retornables: devueltos COMPLETOS SIEMPRE (D3). Devuelve
// la lista de diferencias ([] = cuadra).
function compararSalidaVsReporte(salidas, kitsDetalle) {
  const llevado = {};
  (salidas || []).forEach(s => (Array.isArray(s.detalle) ? s.detalle : []).forEach(d => {
    const k = String(d.pieza_id);
    if (!llevado[k]) llevado[k] = { pieza: d.pieza, cantidad: 0, retornable: false };
    llevado[k].cantidad += Number(d.cantidad) || 0;
    if (d.retornable) llevado[k].retornable = true;
  }));
  const declarado = {};
  parseKitsDetalle(kitsDetalle).forEach(k => {
    const kk = String(k.pieza_id || '');
    if (!kk) return;
    declarado[kk] = {
      sacada: Number(k.cantidad_sacada) || 0,
      sobrante: Number(k.cantidad_sobrante) || 0,
      nombre: k.pieza_nombre || k.nombre || kk,
    };
  });
  const dif = [];
  for (const [pid, l] of Object.entries(llevado)) {
    const d = declarado[pid] || { sacada: 0, sobrante: 0, nombre: l.pieza };
    if (d.sacada !== l.cantidad) {
      dif.push({ pieza: l.pieza, tipo: 'declarado_vs_llevado', llevado: l.cantidad, declarado: d.sacada });
    }
    if (l.retornable && d.sobrante !== l.cantidad) {
      dif.push({ pieza: l.pieza, tipo: 'retornable_incompleto', llevado: l.cantidad, devuelto: d.sobrante });
    }
    if (!l.retornable && d.sobrante > d.sacada) {
      dif.push({ pieza: l.pieza, tipo: 'sobrante_mayor_que_sacado', sacado: d.sacada, sobrante: d.sobrante });
    }
  }
  for (const [pid, d] of Object.entries(declarado)) {
    if (d.sacada > 0 && !llevado[pid]) {
      dif.push({ pieza: d.nombre, tipo: 'sin_salida_autorizada', declarado: d.sacada });
    }
  }
  return dif;
}

// 🗼 F4b: qué piezas NO van a regresar (se cobran). Retornables: llevado −
// devuelto (regresan SIEMPRE completas o se cobran). Consumibles: llevado −
// sacada declarada (lo que "no sabe dónde quedó"); lo usado legítimo NO se
// cobra. Solo cantidades > 0.
function calcularFaltantes(salidas, kitsDetalle) {
  const llevado = {};
  (salidas || []).forEach(s => (Array.isArray(s.detalle) ? s.detalle : []).forEach(d => {
    const k = String(d.pieza_id);
    if (!llevado[k]) llevado[k] = { pieza: d.pieza, cantidad: 0, retornable: false };
    llevado[k].cantidad += Number(d.cantidad) || 0;
    if (d.retornable) llevado[k].retornable = true;
  }));
  const decl = {};
  parseKitsDetalle(kitsDetalle).forEach(k => {
    const kk = String(k.pieza_id || '');
    if (kk) decl[kk] = { sacada: Number(k.cantidad_sacada) || 0, sobrante: Number(k.cantidad_sobrante) || 0 };
  });
  const out = [];
  for (const [pid, l] of Object.entries(llevado)) {
    const d = decl[pid] || { sacada: 0, sobrante: 0 };
    const falta = l.retornable
      ? l.cantidad - Math.min(d.sobrante, l.cantidad)
      : Math.max(0, l.cantidad - d.sacada);
    if (falta > 0) out.push({ pieza_id: pid, pieza: l.pieza, cantidad: falta, retornable: l.retornable });
  }
  return out;
}

// 'YYYY-MM-DD' + N días naturales.
function _masDiasISO(iso, dias) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Helpers puros exportados para el arnés (patrón de la casa).
exports._compararSalidaVsReporte = compararSalidaVsReporte;
exports._calcularFaltantes = calcularFaltantes;
exports._masDiasISO = _masDiasISO;

// ----- helpers -----

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
