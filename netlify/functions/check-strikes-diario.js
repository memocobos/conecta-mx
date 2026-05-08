// netlify/functions/check-strikes-diario.js
// Corre todos los días a las 6 PM hora CDMX (00:00 UTC del día siguiente)
// Aplica strikes automáticos por:
//   1) Reporte no llenado en 48 horas después del evento
//   2) Sobrante no regresado en 5 días después de aprobar

import { schedule } from "@netlify/functions";

const SB_URL = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZ25oc213cGNpcHhndmZ4cmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEwNTMsImV4cCI6MjA5Mjg3NzA1M30.08Fp0YaIkD1okEWB8ao3HoPpdaq6rFi2kzAYGZ72jQg";
const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
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
  if (!RESEND_KEY || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Kamehouse <kamehouse@conectareynosa.mx>",
        to,
        subject,
        html,
      }),
    });
  } catch (e) {
    console.error("Email error:", e.message);
  }
}

async function aplicarStrike(usuarioId, motivo, tipo) {
  const [u] = await sb(`usuarios?id=eq.${usuarioId}&select=nombre,strikes,correo,correo_notif`);
  if (!u) return;
  const nuevos = (u.strikes || 0) + 1;
  await sb(`usuarios?id=eq.${usuarioId}`, {
    method: "PATCH",
    body: JSON.stringify({ strikes: nuevos }),
  });
  await sb(`strikes_log`, {
    method: "POST",
    body: JSON.stringify({
      coordi_id: usuarioId,
      accion: tipo,
      motivo,
      por_quien: null,
      created_at: new Date().toISOString(),
    }),
  }).catch(() => {});

  // Suspender si llegó a 3
  if (nuevos >= 3) {
    await sb(`usuarios?id=eq.${usuarioId}`, {
      method: "PATCH",
      body: JSON.stringify({ activo: false }),
    });
  }

  // Email al coordi
  const email = u.correo_notif || u.correo;
  if (email) {
    await enviarCorreo(
      email,
      `⚠️ Strike automático — Kamehouse`,
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px">
        <h2 style="color:#FF6B00">Strike automático aplicado</h2>
        <p>Hola <strong>${u.nombre}</strong>,</p>
        <p><strong>Motivo:</strong> ${motivo}</p>
        <p><strong>Strikes acumulados:</strong> ${nuevos}/3</p>
        ${nuevos >= 2 ? `<p style="color:#FFB703"><strong>⚠️ Advertencia:</strong> Al llegar a 3 strikes tu cuenta será suspendida.</p>` : ""}
        ${nuevos >= 3 ? `<p style="color:#FF4444"><strong>🚫 Tu cuenta ha sido suspendida.</strong></p>` : ""}
        <p style="color:#888899;font-size:12px;margin-top:32px">Conecta Reynosa · conectareynosa.mx</p>
      </div>`
    );
  }

  // Alerta y email a Memo
  await sb(`sistema_alertas`, {
    method: "POST",
    body: JSON.stringify({
      tipo: "strike_auto",
      mensaje: `${u.nombre} → ${motivo} (strikes: ${nuevos})`,
      leida: false,
      created_at: new Date().toISOString(),
    }),
  }).catch(() => {});

  await enviarCorreo(
    MEMO_EMAIL,
    `⚠️ Strike automático: ${u.nombre} (${nuevos}/3)`,
    `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px">
      <h2 style="color:#FF6B00">Strike automático aplicado</h2>
      <p><strong>${u.nombre}</strong> — ${motivo}</p>
      <p>Strikes: <strong>${nuevos}/3</strong></p>
      ${nuevos >= 3 ? '<p style="color:#FF4444"><strong>Cuenta suspendida automáticamente</strong></p>' : ""}
    </div>`
  );
}

const handler = async () => {
  console.log("[check-strikes] Iniciando revisión:", new Date().toISOString());

  const ahora = new Date();
  let strikes_reporte = 0;
  let strikes_devolucion = 0;

  // ─── 1) STRIKE POR REPORTE NO LLENADO EN 48 HRS ─────────────────
  // Buscar eventos que ya pasaron hace más de 48 hrs
  const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
  const fechaLimite = hace48h.toISOString().split("T")[0];

  // Obtener todos los eventos con fecha <= hace 48 horas
  const eventosVencidos = await sb(
    `eventos?fecha=lte.${fechaLimite}&select=id,nombre,fecha`
  );

  for (const ev of eventosVencidos || []) {
    // Coordis asignados que aceptaron
    const asigs = await sb(
      `eventos_coordi?evento_id=eq.${ev.id}&status=eq.aceptado&select=coordi_id`
    );

    for (const a of asigs || []) {
      // ¿Tiene reporte enviado/aprobado?
      const reportes = await sb(
        `reportes_evento?evento_id=eq.${ev.id}&coordi_id=eq.${a.coordi_id}&status=in.(enviado,aprobado_popo,aprobado_memo)&select=id,strike_reporte_aplicado`
      );

      // Si no hay reporte enviado y no se ha aplicado strike por esto antes
      if (!reportes || reportes.length === 0) {
        // Verificar si ya tenemos un strike aplicado por este evento (en strikes_log)
        const strikePrev = await sb(
          `strikes_log?coordi_id=eq.${a.coordi_id}&accion=eq.strike_reporte_no_enviado&motivo=ilike.*${ev.id}*&select=id&limit=1`
        );
        if (!strikePrev || strikePrev.length === 0) {
          await aplicarStrike(
            a.coordi_id,
            `Reporte no enviado en 48hrs — Evento: ${ev.nombre} (${ev.id})`,
            "strike_reporte_no_enviado"
          );
          strikes_reporte++;
        }
      }
    }
  }

  // ─── 2) STRIKE Y DEUDA POR SOBRANTE NO REGRESADO EN 5 DÍAS ─────
  // Reportes aprobados hace más de 5 días con kits sobrantes no recibidos
  const hace5d = new Date(ahora.getTime() - 5 * 24 * 60 * 60 * 1000);
  const fechaLimite5d = hace5d.toISOString();

  const reportesAprobados = await sb(
    `reportes_evento?status=eq.aprobado_memo&strike_devolucion_aplicado=eq.false&fecha_aprobado=lte.${fechaLimite5d}&select=id,coordi_id,evento_id,kits_detalle,fecha_aprobado`
  );

  for (const r of reportesAprobados || []) {
    const kits =
      typeof r.kits_detalle === "string"
        ? JSON.parse(r.kits_detalle)
        : r.kits_detalle || [];
    const sobrantesNoRecibidos = kits.filter(
      (k) => (k.cantidad_sobrante || 0) > 0 && !k.recibido
    );

    if (sobrantesNoRecibidos.length === 0) continue;

    // Aplicar strike
    await aplicarStrike(
      r.coordi_id,
      `Kits sobrantes no regresados a bodega en 5 días`,
      "strike_devolucion_pendiente"
    );

    // Calcular deuda por kits no devueltos
    for (const k of sobrantesNoRecibidos) {
      const piezas = await sb(
        `kits_inventario?id=eq.${k.pieza_id}&select=pieza,costo_unitario`
      );
      const pieza = piezas?.[0];
      if (!pieza) continue;
      const monto = (k.cantidad_sobrante || 0) * (pieza.costo_unitario || 0);
      await sb(`deudas_coordi`, {
        method: "POST",
        body: JSON.stringify({
          coordi_id: r.coordi_id,
          evento_id: r.evento_id,
          reporte_id: r.id,
          tipo: "kit_perdido",
          concepto: `${k.cantidad_sobrante} ${pieza.pieza} no regresados`,
          monto,
          notas: `Plazo de 5 días vencido — strike auto aplicado`,
          created_at: new Date().toISOString(),
        }),
      }).catch(() => {});
    }

    // Marcar reporte para no aplicar strike de nuevo
    await sb(`reportes_evento?id=eq.${r.id}`, {
      method: "PATCH",
      body: JSON.stringify({ strike_devolucion_aplicado: true }),
    });

    strikes_devolucion++;
  }

  console.log(
    `[check-strikes] Completado. Strikes reporte: ${strikes_reporte}, Strikes devolución: ${strikes_devolucion}`
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      timestamp: ahora.toISOString(),
      strikes_reporte,
      strikes_devolucion,
    }),
  };
};

// Cron: todos los días a las 00:00 UTC = 6 PM hora CDMX (UTC-6)
export const config = {
  schedule: "0 0 * * *",
};

export { handler };
