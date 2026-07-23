// netlify/functions/check-strikes-diario.js
// Esta función es disparada por el schedule en netlify.toml
// Corre todos los días a las 00:00 UTC (6 PM hora CDMX)

const { aplicarModoPrueba } = require('./_lib/correo-guard');

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
            || process.env.SUPABASE_SERVICE_KEY
            || process.env.SUPABASE_SERVICE_ROLE_KEY;
const MEMO_EMAIL = "reynosa@conectamexico.mx";
const HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...HEADERS, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`SB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function enviarCorreo(to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return;
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Kamehouse <kamehouse@conectareynosa.mx>", to, subject, html }),
  }).catch((e) => console.error("Email:", e.message));
}

// ── Helpers de cálculo de deadline ─────────────────────────────────────
// Reglas (2026-05-28):
//   - "Último día del evento" = ev.fecha_fin || ev.fecha
//   - Contador empieza 00:00 MX del día SIGUIENTE al último día (1 día de gracia)
//   - Strike reporte    = inicio_contador + 48h
//   - Strike devolución = inicio_contador + 5 días
//   - México = UTC-6 sin DST desde 2022, por eso el offset literal.
function _ultimoDiaEvento(ev) {
  return ev && (ev.fecha_fin || ev.fecha);
}
function _inicioContadorMX(ev) {
  const ultimo = _ultimoDiaEvento(ev);
  if (!ultimo) return null;
  const d = new Date(ultimo + 'T00:00:00-06:00');
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
function _deadlineReporte(ev) {
  const start = _inicioContadorMX(ev);
  return start ? new Date(start.getTime() + 48 * 60 * 60 * 1000) : null;
}
function _deadlineDevolucion(ev) {
  const start = _inicioContadorMX(ev);
  return start ? new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000) : null;
}
// Excluir creadoras (cc) y admins — solo Guerreros Z reciben strikes automáticos.
function _debeAplicarStrike(usuario) {
  if (!usuario || !usuario.rol) return false;
  if (usuario.rol === 'cc') return false;
  if (['maestro_roshi', 'bulma'].includes(usuario.rol)) return false;
  return true;
}

// ── Guardia retroactiva ────────────────────────────────────────────────
// Apenas estamos configurando el sistema por slug y NO hay datos reales.
// Para que el cron NO dispare strikes retroactivos de eventos viejos, solo
// evaluamos eventos cuyo último día (fecha_fin || fecha) sea POSTERIOR a esta
// fecha de corte. Ajusta FECHA_CORTE_STRIKES (YYYY-MM-DD) cuando el sistema ya
// esté en operación real. Comparación lexicográfica (fechas ISO ordenan bien).
const FECHA_CORTE_STRIKES = '2026-07-01'; // [sec-strikes] FECHA_CORTE movida a 1-jul-2026 (gracia junio post-reset)
function _antesDelCorte(ev) {
  const ult = _ultimoDiaEvento(ev);
  return !ult || ult < FECHA_CORTE_STRIKES;
}

// ── Dedup helpers ───────────────────────────────────────────────────
// strikes_log.evento_id se agregó en migración 2026-05-28 para hacer el
// dedup robusto. Antes el dedup buscaba ev.id en el texto del motivo
// y nunca matcheaba.
//
// _insertStrikeLog: intenta INSERT con evento_id, si la columna no
// existe todavía (migración no corrida), retry sin evento_id.
//
// _yaExisteStrikeReporte: busca strike previo por evento_id (exacto) +
// fallback por motivo.ilike.*nombre*. Si la columna no existe, hace
// fallback total a solo-nombre.
async function _insertStrikeLog(coordiId, accion, motivo, eventoId) {
  const baseRow = {
    coordi_id: coordiId,
    accion,
    motivo,
    por_quien: null,
    created_at: new Date().toISOString(),
  };
  const tryRow = eventoId ? { ...baseRow, evento_id: eventoId } : baseRow;
  let r = await fetch(`${SB_URL}/rest/v1/strikes_log`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(tryRow),
  }).catch(() => null);
  if (r && r.ok) return;
  if (!eventoId) return; // no había evento_id, ya falló por otra razón
  // Retry sin evento_id por si la columna no existe todavía
  await fetch(`${SB_URL}/rest/v1/strikes_log`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(baseRow),
  }).catch(() => {});
}

async function _yaExisteStrikeReporte(coordiId, ev) {
  // 1) Intento OR (evento_id exacto OR motivo por nombre)
  const orFilter = `or=(evento_id.eq.${encodeURIComponent(ev.id)},motivo.ilike.*${encodeURIComponent(ev.nombre)}*)`;
  let r = await fetch(
    `${SB_URL}/rest/v1/strikes_log?coordi_id=eq.${coordiId}&accion=eq.strike_reporte_no_enviado&${orFilter}&select=id&limit=1`,
    { headers: HEADERS }
  ).catch(() => null);
  if (r && r.ok) {
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  }
  // 2) Fallback solo-por-nombre (cuando la columna evento_id aún no existe)
  r = await fetch(
    `${SB_URL}/rest/v1/strikes_log?coordi_id=eq.${coordiId}&accion=eq.strike_reporte_no_enviado&motivo=ilike.*${encodeURIComponent(ev.nombre)}*&select=id&limit=1`,
    { headers: HEADERS }
  ).catch(() => null);
  if (r && r.ok) {
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  }
  // Ambos fallaron: por seguridad asumimos que NO existe previo (mejor
  // duplicar 1 strike que perderlo si el coordi realmente no entregó).
  return false;
}

async function aplicarStrike(usuarioId, motivo, tipo, eventoId = null) {
  const rows = await sb(`usuarios?id=eq.${usuarioId}&select=nombre,strikes,correo,correo_notif`).catch(() => []);
  const u = rows && rows[0];
  if (!u) return;
  const nuevos = (u.strikes || 0) + 1;
  await sb(`usuarios?id=eq.${usuarioId}`, { method: "PATCH", body: JSON.stringify({ strikes: nuevos }) });
  await _insertStrikeLog(usuarioId, tipo, motivo, eventoId);
  if (nuevos >= 3) {
    await sb(`usuarios?id=eq.${usuarioId}`, { method: "PATCH", body: JSON.stringify({ activo: false }) });
  }
  const email = u.correo_notif || u.correo;
  if (email) {
    await enviarCorreo(email, `⚠️ Strike automático — Kamehouse`,
      `<div style="font-family:Arial,sans-serif;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px;max-width:520px;margin:0 auto">
        <h2 style="color:#FF6B00">Strike automático</h2>
        <p>Hola <strong>${u.nombre}</strong>,</p>
        <p><strong>Motivo:</strong> ${motivo}</p>
        <p><strong>Strikes:</strong> ${nuevos}/3</p>
        ${nuevos >= 2 ? '<p style="color:#FFB703">⚠️ Al llegar a 3 tu cuenta será suspendida.</p>' : ""}
        ${nuevos >= 3 ? '<p style="color:#FF4444">🚫 Cuenta suspendida.</p>' : ""}
        <p style="color:#888;font-size:12px">Conecta Reynosa</p>
      </div>`
    );
  }
  await sb("sistema_alertas", { method: "POST", body: JSON.stringify({ tipo: "strike_auto", mensaje: `${u.nombre} → ${motivo} (${nuevos}/3)`, leida: false, created_at: new Date().toISOString() }) }).catch(() => {});
  await enviarCorreo(MEMO_EMAIL, `⚠️ Strike auto: ${u.nombre} (${nuevos}/3)`,
    `<div style="font-family:Arial,sans-serif;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px;max-width:520px;margin:0 auto">
      <h2 style="color:#FF6B00">Strike automático</h2>
      <p><strong>${u.nombre}</strong> — ${motivo}</p>
      <p>Strikes: <strong>${nuevos}/3</strong></p>
      ${nuevos >= 3 ? '<p style="color:#FF4444"><strong>Cuenta suspendida automáticamente</strong></p>' : ""}
    </div>`
  );
}

exports.handler = async function(event) {
  console.log("[check-strikes] Iniciando:", new Date().toISOString());
  if (!SB_KEY || !SB_URL) {
    console.error('[check-strikes] Falta SUPABASE_SERVICE_KEY_KAMEHOUSE o URL');
    return { statusCode: 500, body: 'Config faltante' };
  }

  // dry_run (?dry_run=1 o body {dry_run:true}): NO escribe (ni strikes, ni
  // deudas, ni flags); solo cuenta lo que HARÍA. Para probar sin efectos.
  let dryRun = (event && event.queryStringParameters && event.queryStringParameters.dry_run === '1');
  if (!dryRun && event && event.body) {
    try { dryRun = JSON.parse(event.body).dry_run === true; } catch { /* body no-JSON */ }
  }

  const ahora = new Date();
  let sr = 0, sd = 0;

  try {
    // 1) STRIKE POR REPORTE NO LLENADO — deadline = fin_evento + 1día + 48h
    // Fechas e identidad del evento desde eventos_meta (por SLUG). Antes leía la
    // tabla `eventos` (UUID); tras la unificación TODO casa por slug. Traemos
    // eventos cuya fecha de inicio (`fecha`) ya pasó hace ≥2 días; el filtro
    // fino se hace en JS con _deadlineReporte.
    const margenISO = new Date(ahora.getTime() - 2 * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];
    const eventosRaw = await sb(
      `eventos_meta?fecha=lte.${margenISO}&select=slug,nombre,fecha,fecha_fin`
    ).catch(() => []);
    // Normaliza: el resto del cron usa ev.id como identidad del evento (= slug).
    const eventosVencidos = (eventosRaw || []).map(e => ({ ...e, id: e.slug }));

    for (const ev of eventosVencidos) {
      try {
        if (_antesDelCorte(ev)) continue;          // guardia retroactiva
        const deadline = _deadlineReporte(ev);
        if (!deadline || ahora < deadline) continue; // todavía no vence

        const asigs = await sb(
          `eventos_coordi?evento_id=eq.${encodeURIComponent(ev.id)}&status=eq.aceptado&select=coordi_id`
        ).catch(() => []);
        if (!asigs.length) continue;

        const coordiIds = asigs.map(a => a.coordi_id).filter(Boolean);
        if (!coordiIds.length) continue;
        const usuarios = await sb(
          `usuarios?id=in.(${coordiIds.join(",")})&select=id,nombre,rol`
        ).catch(() => []);
        const uMap = Object.fromEntries(usuarios.map(u => [u.id, u]));

        for (const a of asigs) {
          const u = uMap[a.coordi_id];
          if (!_debeAplicarStrike(u)) continue;
          const rep = await sb(
            `reportes_evento?evento_id=eq.${encodeURIComponent(ev.id)}&coordi_id=eq.${a.coordi_id}&status=in.(enviado,aprobado_popo,aprobado_memo)&select=id&limit=1`
          ).catch(() => []);
          if (rep && rep.length > 0) continue;
          // Dedup robusto por evento_id (slug) con fallback por nombre
          if (await _yaExisteStrikeReporte(a.coordi_id, ev)) continue;
          if (!dryRun) {
            await aplicarStrike(
              a.coordi_id,
              `Reporte no enviado en 48hrs — ${ev.nombre}`,
              "strike_reporte_no_enviado",
              ev.id
            );
          }
          sr++;
        }
      } catch (e) {
        console.error(`[check-strikes] evento ${ev && ev.id}:`, e.message);
      }
    }

    // 2) STRIKE Y DEUDA POR SOBRANTE NO DEVUELTO — deadline = fin_evento + 6 días
    // (1 día de gracia + 5 días para devolver). Solo aplica si el reporte ya
    // fue aprobado_memo (necesitamos kits_detalle con sobrantes).
    const aprobados = await sb(
      `reportes_evento?status=eq.aprobado_memo&strike_devolucion_aplicado=eq.false&select=id,coordi_id,evento_id,kits_detalle,fecha_aprobado`
    ).catch(() => []);

    for (const r of aprobados) {
      try {
        const kits = typeof r.kits_detalle === "string"
          ? JSON.parse(r.kits_detalle) : (r.kits_detalle || []);
        const sobrantes = kits.filter(k => (k.cantidad_sobrante || 0) > 0 && !k.recibido);
        if (!sobrantes.length) continue;

        const usuariosRow = await sb(`usuarios?id=eq.${r.coordi_id}&select=id,nombre,rol`).catch(() => []);
        const u = usuariosRow && usuariosRow[0];
        if (!_debeAplicarStrike(u)) continue;

        // Fechas del evento desde eventos_meta, por slug (= reportes_evento.evento_id).
        const evRows = await sb(`eventos_meta?slug=eq.${encodeURIComponent(r.evento_id)}&select=slug,fecha,fecha_fin`).catch(() => []);
        const evRow = evRows && evRows[0];
        if (!evRow) continue;
        const ev = { ...evRow, id: evRow.slug };
        if (_antesDelCorte(ev)) continue;          // guardia retroactiva
        const deadline = _deadlineDevolucion(ev);
        if (!deadline || ahora < deadline) continue; // todavía no vence

        if (!dryRun) {
          // Dedup de devolución funciona vía strike_devolucion_aplicado flag
          // en reportes_evento (PATCH al final del bloque). evento_id (slug) se
          // pasa por higiene de datos.
          await aplicarStrike(r.coordi_id, "Kits sobrantes no regresados en 5 días", "strike_devolucion_pendiente", r.evento_id);

          for (const k of sobrantes) {
            const piezas = await sb(`kits_inventario?id=eq.${k.pieza_id}&select=pieza,costo_unitario`).catch(() => []);
            const pieza = piezas && piezas[0];
            if (!pieza) continue;
            const monto = (k.cantidad_sobrante || 0) * (pieza.costo_unitario || 0);
            await sb("deudas_coordi", { method: "POST", body: JSON.stringify({ coordi_id: r.coordi_id, evento_id: r.evento_id, reporte_id: r.id, tipo: "kit_perdido", concepto: `${k.cantidad_sobrante} ${pieza.pieza} no regresados`, monto, notas: "Plazo 5 días vencido", created_at: new Date().toISOString() }) }).catch(() => {});
          }

          await sb(`reportes_evento?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ strike_devolucion_aplicado: true }) });
        }
        sd++;
      } catch (e) {
        console.error(`[check-strikes] reporte ${r && r.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error("[check-strikes] Error:", e.message);
  }

  // 3) 🗼 TORRE v2 F4b — STRIKE POR FALTANTES DE BODEGA NO PAGADOS.
  // ÚNICA extensión permitida al cron: MISMO molde (aplicarStrike +
  // _debeAplicarStrike + guardia FECHA_CORTE), dedup PROPIO
  // (salidas_bodega.strike_faltante_aplicado). Los bloques 1 y 2 NI SE ROZAN.
  // Regla D-1: 15 días naturales desde la autorización final de Memo
  // (faltantes_vence, sellado por admin-reportes); vencido sin pagar → strike.
  // El CONGELAMIENTO no es de este cron: se calcula EN VIVO en admin-salidas.
  let sf = 0;
  try {
    const hoyMX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
    const vencidas = await sb(
      `salidas_bodega?faltantes_monto=gt.0&faltantes_pagado_at=is.null` +
      `&strike_faltante_aplicado=eq.false&faltantes_vence=lt.${hoyMX}` +
      `&select=id,solicitante_id,evento_id,faltantes_monto,faltantes_vence`
    ).catch(() => []);

    for (const sal of vencidas) {
      try {
        // Guardia retroactiva: mismo espíritu que _antesDelCorte — un
        // vencimiento anterior a la fecha de corte jamás genera strike.
        if (String(sal.faltantes_vence || '').slice(0, 10) < FECHA_CORTE_STRIKES) continue;

        const usuariosRow = await sb(`usuarios?id=eq.${sal.solicitante_id}&select=id,nombre,rol`).catch(() => []);
        const u = usuariosRow && usuariosRow[0];
        if (!_debeAplicarStrike(u)) continue;

        if (!dryRun) {
          const monto = Math.round((Number(sal.faltantes_monto) || 0) * 100) / 100;
          await aplicarStrike(
            sal.solicitante_id,
            `Faltantes de bodega no pagados en 15 días ($${monto.toLocaleString('es-MX')} — ${sal.evento_id})`,
            "strike_faltante_bodega",
            sal.evento_id
          );
          // Dedup propio: el flag vive en la salida, jamás se toca dos veces.
          await sb(`salidas_bodega?id=eq.${sal.id}`, { method: "PATCH", body: JSON.stringify({ strike_faltante_aplicado: true }) });
        }
        sf++;
      } catch (e) {
        console.error(`[check-strikes] salida ${sal && sal.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error("[check-strikes] Error faltantes:", e.message);
  }

  console.log(`[check-strikes] Fin${dryRun ? ' (DRY RUN)' : ''}. Strikes reporte:${sr} devolución:${sd} faltantes:${sf}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, dry_run: dryRun, sr, sd, sf }) };
};
