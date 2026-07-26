// =============================================================================
// admin-cancelar-evento  (Cancelar evento — Fase 1)
//
// Cancela un evento. Registra la cancelación (bitácora KH `eventos_cancelaciones`),
// calcula el reembolso de cada cliente NO cancelado (suma de lo que pagó), crea su
// fila en `reembolsos` (KH) y da de baja sus solicitudes en el Portal.
//
// NO despublica el evento ni avisa a clientes (eso lo controla el admin / fases
// siguientes). Cruza KH + Portal. Calcula TODO antes de escribir.
//
// Body JSON: { slug, motivo? }
//
// Seguridad/molde de admin-posponer-evento: corsCheck + verifyAdminAuth(['maestro_roshi']).
//
// Env vars:
//   - KH:     SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE  (bitácora + reembolsos)
//   - Portal: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY        (solicitudes/pagos/clientes)
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const slug = (body && typeof body.slug === 'string') ? body.slug.trim().toLowerCase() : '';
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El slug es requerido' }) };

  const motivo = (body && typeof body.motivo === 'string' && body.motivo.trim()) ? body.motivo.trim() : null;
  const actor = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';

  const khHeaders     = { apikey: env.KH_KEY,     Authorization: `Bearer ${env.KH_KEY}`,     'Content-Type': 'application/json' };
  const portalHeaders = { apikey: env.PORTAL_KEY, Authorization: `Bearer ${env.PORTAL_KEY}`, 'Content-Type': 'application/json' };

  // Inserta la fila de bitácora. Devuelve { error } o {} (ok). Aborta el flujo si falla.
  async function registrarCancelacion(nombre, solicitudesBaja, reembolsosCreados, montoTotal) {
    const r = await fetch(`${env.KH_URL}/rest/v1/eventos_cancelaciones`, {
      method: 'POST',
      headers: { ...khHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        evento_slug: slug,
        evento_nombre: nombre,
        motivo,
        actor,
        solicitudes_baja: solicitudesBaja,
        reembolsos_creados: reembolsosCreados,
        monto_total: montoTotal,
      }),
    });
    if (!r.ok) return { error: await r.text() };
    const j = await r.json();
    return { id: Array.isArray(j) ? (j[0] && j[0].id) : undefined };
  }

  try {
    // 1. KH: el evento debe existir.
    const evRes = await fetch(
      `${env.KH_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}&select=slug,nombre&limit=1`,
      { headers: khHeaders }
    );
    if (!evRes.ok) {
      const detail = await evRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta del evento', detail }) };
    }
    const evRows = await evRes.json();
    const ev = Array.isArray(evRows) ? evRows[0] : null;
    if (!ev) return { statusCode: 404, headers, body: JSON.stringify({ error: `No existe un evento con slug '${slug}'` }) };
    const nombre = ev.nombre;

    // 2. Idempotencia: no cancelar dos veces.
    const cancRes = await fetch(
      `${env.KH_URL}/rest/v1/eventos_cancelaciones?evento_slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`,
      { headers: khHeaders }
    );
    if (!cancRes.ok) {
      const detail = await cancRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta de cancelaciones', detail }) };
    }
    const cancRows = await cancRes.json();
    if (Array.isArray(cancRows) && cancRows.length) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este evento ya fue cancelado' }) };
    }

    // 3. Portal: solicitudes ACTIVAS (no canceladas).
    const solRes = await fetch(
      `${env.PORTAL_URL}/rest/v1/solicitudes_tour?evento_id=eq.${encodeURIComponent(slug)}&estado=neq.cancelado&select=id,cliente_id`,
      { headers: portalHeaders }
    );
    if (!solRes.ok) {
      const detail = await solRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Portal rechazó la consulta de solicitudes', detail }) };
    }
    const solRowsRaw = await solRes.json();
    const seen = new Set();
    const solicitudes = [];
    for (const s of (Array.isArray(solRowsRaw) ? solRowsRaw : [])) {
      if (!s || !s.id || seen.has(s.id)) continue;
      seen.add(s.id);
      solicitudes.push({ id: s.id, cliente_id: s.cliente_id });
    }

    // Sin solicitudes activas: igual se registra la cancelación (con totales en 0).
    if (!solicitudes.length) {
      const reg = await registrarCancelacion(nombre, 0, 0, 0);
      if (reg.error) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se registró la cancelación', detail: reg.error }) };
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, evento_nombre: nombre, solicitudes_baja: 0, reembolsos_creados: 0, monto_total: 0, bajas_ok: 0, bajas_fallidas: 0 }) };
    }

    // 4. Portal: datos de los clientes (dedup de cliente_id).
    const clienteIds = [...new Set(solicitudes.map(s => s.cliente_id).filter(Boolean))];
    const clientesMap = {};
    if (clienteIds.length) {
      const cliRes = await fetch(
        `${env.PORTAL_URL}/rest/v1/clientes?id=in.(${clienteIds.join(',')})&select=id,nombre_completo,correo`,
        { headers: portalHeaders }
      );
      if (!cliRes.ok) {
        const detail = await cliRes.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Portal rechazó la consulta de clientes', detail }) };
      }
      const cliRows = await cliRes.json();
      for (const c of (Array.isArray(cliRows) ? cliRows : [])) if (c && c.id) clientesMap[c.id] = c;
    }

    // 5. Por solicitud: monto pagado = suma de COALESCE(monto_pagado, monto) de pagos 'pagado'.
    const montos = await Promise.all(solicitudes.map(async (sol) => {
      const r = await fetch(
        `${env.PORTAL_URL}/rest/v1/pagos?solicitud_id=eq.${encodeURIComponent(sol.id)}&estado=eq.pagado&select=monto,monto_pagado`,
        { headers: portalHeaders }
      );
      if (!r.ok) throw new Error('Portal rechazó la consulta de pagos: ' + await r.text());
      const arr = await r.json();
      let sum = 0;
      for (const p of (Array.isArray(arr) ? arr : [])) {
        const real = (p.monto_pagado == null) ? Number(p.monto || 0) : Number(p.monto_pagado || 0);
        if (Number.isFinite(real)) sum += real;
      }
      return { id: sol.id, monto: sum };
    }));
    const montoPorSolicitud = {};
    for (const m of montos) montoPorSolicitud[m.id] = m.monto;

    // Armar las filas de reembolso (solo monto>0) y el total.
    let montoTotal = 0;
    const reembolsoRows = [];
    for (const sol of solicitudes) {
      const monto = montoPorSolicitud[sol.id] || 0;
      montoTotal += monto;
      if (monto > 0) {
        const cli = clientesMap[sol.cliente_id] || {};
        reembolsoRows.push({
          evento_slug: slug,
          evento_nombre: nombre,
          solicitud_id: sol.id,
          cliente_id: sol.cliente_id,
          cliente_nombre: cli.nombre_completo || null,
          cliente_correo: cli.correo || null,
          monto,
          estado: 'pendiente',
        });
      }
    }

    // 6. KH: registrar la cancelación (si falla, ABORTA — no damos de baja nada).
    const reg = await registrarCancelacion(nombre, solicitudes.length, reembolsoRows.length, montoTotal);
    if (reg.error) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se registró la cancelación', detail: reg.error }) };

    // 7. KH: crear los reembolsos (insert en lote ATÓMICO). BLOQUEANTE: si falla,
    //    rollback de la bitácora y abortar — no damos de baja nada (reintentable).
    if (reembolsoRows.length) {
      const rRes = await fetch(`${env.KH_URL}/rest/v1/reembolsos`, {
        method: 'POST',
        headers: { ...khHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(reembolsoRows),
      }).catch(() => null);
      if (!rRes || !rRes.ok) {
        const detail = rRes ? await rRes.text() : 'fetch falló';
        await fetch(`${env.KH_URL}/rest/v1/eventos_cancelaciones?id=eq.${encodeURIComponent(reg.id)}`, {
          method: 'DELETE', headers: khHeaders,
        }).catch(() => {});
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se registraron los reembolsos; no se canceló nada, reintenta', detail }) };
      }
    }

    // 8. Portal: dar de baja las solicitudes (DESPUÉS de calcular/registrar reembolsos).
    const bajas = await Promise.allSettled(solicitudes.map((sol) =>
      fetch(`${env.PORTAL_URL}/rest/v1/solicitudes_tour?id=eq.${encodeURIComponent(sol.id)}`, {
        method: 'PATCH',
        headers: { ...portalHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ estado: 'cancelado' }),
      })
    ));
    let bajasOk = 0, bajasFallidas = 0;
    for (const b of bajas) {
      if (b.status === 'fulfilled' && b.value && b.value.ok) bajasOk++;
      else bajasFallidas++;
    }

    // 9. Listo. NO despublica ni avisa (fases siguientes).
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        evento_nombre: nombre,
        solicitudes_baja: solicitudes.length,
        reembolsos_creados: reembolsoRows.length,
        monto_total: montoTotal,
        bajas_ok: bajasOk,
        bajas_fallidas: bajasFallidas,
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error cancelando el evento', detail: e.message }) };
  }
};

// ----- helpers -----

function readEnv() {
  const KH_URL     = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY     = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const PORTAL_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!KH_URL || !KH_KEY || !PORTAL_URL || !PORTAL_KEY) {
    return { error: 'Faltan env vars (KH + Portal Supabase)' };
  }
  return { KH_URL, KH_KEY, PORTAL_URL, PORTAL_KEY };
}
