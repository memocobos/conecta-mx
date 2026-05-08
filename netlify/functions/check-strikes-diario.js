// netlify/functions/check-strikes-diario.js
// Scheduled: todos los días a las 00:00 UTC (6 PM hora CDMX)

const { schedule } = require("@netlify/functions");

const SB_URL = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZ25oc213cGNpcHhndmZ4cmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEwNTMsImV4cCI6MjA5Mjg3NzA1M30.08Fp0YaIkD1okEWB8ao3HoPpdaq6rFi2kzAYGZ72jQg";
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
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Kamehouse <kamehouse@conectareynosa.mx>", to, subject, html }),
  }).catch((e) => console.error("Email:", e.message));
}

async function aplicarStrike(usuarioId, motivo, tipo) {
  const rows = await sb(`usuarios?id=eq.${usuarioId}&select=nombre,strikes,correo,correo_notif`).catch(() => []);
  const u = rows && rows[0];
  if (!u) return;
  const nuevos = (u.strikes || 0) + 1;
  await sb(`usuarios?id=eq.${usuarioId}`, { method: "PATCH", body: JSON.stringify({ strikes: nuevos }) });
  await sb("strikes_log", { method: "POST", body: JSON.stringify({ coordi_id: usuarioId, accion: tipo, motivo, por_quien: null, created_at: new Date().toISOString() }) }).catch(() => {});
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
        ${nuevos >= 2 ? '<p style="color:#FFB703">⚠️ Advertencia: al llegar a 3 tu cuenta será suspendida.</p>' : ""}
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

const handler = schedule("0 0 * * *", async () => {
  console.log("[check-strikes] Iniciando:", new Date().toISOString());
  const ahora = new Date();
  let sr = 0, sd = 0;

  // 1) STRIKE POR REPORTE NO LLENADO EN 48 HRS
  const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
  const fechaLimite = hace48h.toISOString().split("T")[0];
  const eventosVencidos = await sb(`eventos?fecha=lte.${fechaLimite}&select=id,nombre,fecha`).catch(() => []);

  for (const ev of eventosVencidos) {
    const asigs = await sb(`eventos_coordi?evento_id=eq.${ev.id}&status=eq.aceptado&select=coordi_id`).catch(() => []);
    for (const a of asigs) {
      const rep = await sb(`reportes_evento?evento_id=eq.${ev.id}&coordi_id=eq.${a.coordi_id}&status=in.(enviado,aprobado_popo,aprobado_memo)&select=id&limit=1`).catch(() => []);
      if (!rep || rep.length === 0) {
        const prev = await sb(`strikes_log?coordi_id=eq.${a.coordi_id}&accion=eq.strike_reporte_no_enviado&motivo=ilike.*${ev.id}*&select=id&limit=1`).catch(() => []);
        if (!prev || prev.length === 0) {
          await aplicarStrike(a.coordi_id, `Reporte no enviado en 48hrs — ${ev.nombre} (${ev.id})`, "strike_reporte_no_enviado");
          sr++;
        }
      }
    }
  }

  // 2) STRIKE Y DEUDA POR SOBRANTE NO DEVUELTO EN 5 DÍAS
  const hace5d = new Date(ahora.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const aprobados = await sb(`reportes_evento?status=eq.aprobado_memo&strike_devolucion_aplicado=eq.false&fecha_aprobado=lte.${hace5d}&select=id,coordi_id,evento_id,kits_detalle,fecha_aprobado`).catch(() => []);

  for (const r of aprobados) {
    const kits = typeof r.kits_detalle === "string" ? JSON.parse(r.kits_detalle) : (r.kits_detalle || []);
    const sobrantes = kits.filter((k) => (k.cantidad_sobrante || 0) > 0 && !k.recibido);
    if (!sobrantes.length) continue;

    await aplicarStrike(r.coordi_id, "Kits sobrantes no regresados a bodega en 5 días", "strike_devolucion_pendiente");

    for (const k of sobrantes) {
      const piezas = await sb(`kits_inventario?id=eq.${k.pieza_id}&select=pieza,costo_unitario`).catch(() => []);
      const pieza = piezas && piezas[0];
      if (!pieza) continue;
      const monto = (k.cantidad_sobrante || 0) * (pieza.costo_unitario || 0);
      await sb("deudas_coordi", { method: "POST", body: JSON.stringify({ coordi_id: r.coordi_id, evento_id: r.evento_id, reporte_id: r.id, tipo: "kit_perdido", concepto: `${k.cantidad_sobrante} ${pieza.pieza} no regresados`, monto, notas: "Plazo 5 días vencido", created_at: new Date().toISOString() }) }).catch(() => {});
    }

    await sb(`reportes_evento?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ strike_devolucion_aplicado: true }) });
    sd++;
  }

  console.log(`[check-strikes] Fin. sr:${sr} sd:${sd}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, sr, sd }) };
});

module.exports = { handler };
