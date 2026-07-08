// =============================================================================
// admin-posponer-evento  (Módulo Posponer — Fase 1: bitácora + cambio de fecha)
//
// Primer ladrillo del módulo Posponer. Lee la fecha actual del evento en
// esferas_eventos, registra el movimiento en eventos_posposiciones (tabla KH,
// deny-all → solo service_role) y cambia esferas_eventos.fecha_inicio.
//
// NO republica (eso lo hace el admin desde Esferas) y NO toca pagos ni clientes
// todavía (fases siguientes).
//
// Body JSON: { slug, fecha_nueva, motivo? }
//   - slug requerido. fecha_nueva requerida, formato YYYY-MM-DD. motivo opcional.
//
// Seguridad/molde calcado de esferas-actualizar:
//   - corsCheck + verifyAdminAuth(['maestro_roshi'])
//   - service_role (bypass RLS) para leer/escribir esferas_eventos y la bitácora.
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET (lo lee verifyAdminAuth).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

// Portal (solicitudes/pagos) — mismo patrón que admin-cancelar-evento.
const PORTAL_URL = process.env.PORTAL_SUPABASE_URL;
const PORTAL_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 86400000;

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

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  if (!SB_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };
  if (!PORTAL_URL || !PORTAL_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Portal Supabase no configurado (PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY)' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const slug = (body && typeof body.slug === 'string') ? body.slug.trim().toLowerCase() : '';
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El slug es requerido' }) };

  const fechaNueva = (body && typeof body.fecha_nueva === 'string') ? body.fecha_nueva.trim() : '';
  if (!fechaNueva) return { statusCode: 400, headers, body: JSON.stringify({ error: 'La fecha nueva es requerida' }) };
  if (!FECHA_RE.test(fechaNueva)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'fecha_nueva debe tener formato YYYY-MM-DD' }) };
  }

  const motivo = (body && typeof body.motivo === 'string' && body.motivo.trim()) ? body.motivo.trim() : null;
  const actor = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';

  const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  try {
    // 1. Leer el evento y su fecha actual.
    const evRes = await fetch(
      `${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}&select=slug,nombre,fecha_inicio&limit=1`,
      { headers: sbHeaders }
    );
    if (!evRes.ok) {
      const detail = await evRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la query', detail }) };
    }
    const evRows = await evRes.json();
    const ev = Array.isArray(evRows) ? evRows[0] : null;
    if (!ev) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: `No existe un evento con slug '${slug}'` }) };
    }

    // 2. Validar que la fecha realmente cambie.
    const fechaAnterior = ev.fecha_inicio;
    if (fechaNueva === fechaAnterior) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'La fecha nueva es igual a la actual' }) };
    }

    // 3. Registrar la posposición ANTES de cambiar la fecha (la bitácora manda;
    //    si no se registra, no movemos nada).
    const insRes = await fetch(`${SB_URL}/rest/v1/eventos_posposiciones`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        evento_slug: slug,
        evento_nombre: ev.nombre,
        fecha_anterior: fechaAnterior,
        fecha_nueva: fechaNueva,
        motivo,
        actor,
      }),
    });
    if (!insRes.ok) {
      const detail = await insRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se registró la posposición', detail }) };
    }
    const insRows = await insRes.json().catch(() => []);
    const bitacoraId = Array.isArray(insRows) ? (insRows[0] && insRows[0].id) : (insRows && insRows.id);

    // 4. Cambiar la fecha del evento. Si falla, deshacer la bitácora (best-effort).
    const patchRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ fecha_inicio: fechaNueva }),
    });
    if (!patchRes.ok) {
      const detail = await patchRes.text();
      if (bitacoraId != null) {
        await fetch(`${SB_URL}/rest/v1/eventos_posposiciones?id=eq.${encodeURIComponent(bitacoraId)}`, {
          method: 'DELETE',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
        }).catch(() => {});
      }
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo cambiar la fecha', detail }) };
    }

    // 5. Recorrer las fechas de pago PENDIENTES el mismo número de días que se
    //    movió el evento (Opción A). Las pagadas NO se tocan. Best-effort: un
    //    fallo aquí NO revierte la posposición (ya quedó) — solo se reporta.
    const deltaDias = Math.round(
      (Date.parse(fechaNueva + 'T00:00:00Z') - Date.parse(String(fechaAnterior).slice(0, 10) + 'T00:00:00Z')) / MS_DIA
    );
    const pagosInfo = { pagos_recorridos: 0, pagos_fallidos: 0, delta_dias: deltaDias };

    if (deltaDias !== 0) {
      try {
        const portalHeaders = { apikey: PORTAL_KEY, Authorization: `Bearer ${PORTAL_KEY}`, 'Content-Type': 'application/json' };

        // a. Solicitudes NO canceladas del evento.
        const solRes = await fetch(
          `${PORTAL_URL}/rest/v1/solicitudes_tour?evento_id=eq.${encodeURIComponent(slug)}&estado=neq.cancelado&select=id`,
          { headers: portalHeaders }
        );
        if (!solRes.ok) throw new Error('solicitudes: ' + await solRes.text());
        const solRows = await solRes.json();
        const solicitudIds = [...new Set((Array.isArray(solRows) ? solRows : []).map(s => s && s.id).filter(Boolean))];

        if (solicitudIds.length) {
          // b. Pagos pendientes (estado ≠ 'pagado') con fecha esperada.
          const pagRes = await fetch(
            `${PORTAL_URL}/rest/v1/pagos?solicitud_id=in.(${solicitudIds.join(',')})&estado=neq.pagado&fecha_esperada=not.is.null&select=id,fecha_esperada`,
            { headers: portalHeaders }
          );
          if (!pagRes.ok) throw new Error('pagos: ' + await pagRes.text());
          const pagos = await pagRes.json();
          const lista = Array.isArray(pagos) ? pagos : [];

          // c+d. Recorrer cada fecha_esperada el delta y guardar (allSettled).
          const patches = await Promise.allSettled(lista.map((p) => {
            const base = String(p.fecha_esperada).slice(0, 10);
            const nuevaFecha = new Date(Date.parse(base + 'T00:00:00Z') + deltaDias * MS_DIA).toISOString().slice(0, 10);
            return fetch(`${PORTAL_URL}/rest/v1/pagos?id=eq.${encodeURIComponent(p.id)}`, {
              method: 'PATCH',
              headers: { ...portalHeaders, Prefer: 'return=minimal' },
              body: JSON.stringify({ fecha_esperada: nuevaFecha }),
            });
          }));
          for (const r of patches) {
            if (r.status === 'fulfilled' && r.value && r.value.ok) pagosInfo.pagos_recorridos++;
            else pagosInfo.pagos_fallidos++;
          }
        }
      } catch (e) {
        // El bloque de pagos truena completo: la posposición sigue siendo exitosa.
        pagosInfo.pagos_error = true;
        pagosInfo.pagos_error_detail = e.message;
      }
    }

    // 6. Listo. El evento NO se republica aquí (lo hace el admin desde Esferas).
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        evento_nombre: ev.nombre,
        fecha_anterior: fechaAnterior,
        fecha_nueva: fechaNueva,
        recordatorio: 'Republica el evento desde Esferas para que el sitio muestre la nueva fecha',
        ...pagosInfo,
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error escribiendo a Supabase', detail: e.message }) };
  }
};
