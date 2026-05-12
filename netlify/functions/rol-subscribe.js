// netlify/functions/rol-subscribe.js
// Recibe POST desde /rol con datos del plan y guarda la suscripción en Supabase.
// Llamado desde rol.html cuando el cliente activa los recordatorios por email.

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bad(status, msg) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: false, error: msg }),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  }
  if (event.httpMethod !== "POST") return bad(405, "Método no permitido");
  if (!SB_URL || !SB_KEY) return bad(500, "Supabase no configurado en el servidor");

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return bad(400, "JSON inválido"); }

  const email = String(data.email || "").trim().toLowerCase();
  const nombre = String(data.nombre || "").trim();
  if (!EMAIL_RE.test(email))   return bad(400, "Email inválido");
  if (!nombre || nombre.length < 2) return bad(400, "Nombre inválido");
  if (!data.evento_id || !data.paquete || !data.zona) return bad(400, "Faltan datos del plan");
  if (!Array.isArray(data.pagos) || !data.pagos.length) return bad(400, "No hay pagos en el plan");
  if (!data.separo_fecha || !/^\d{4}-\d{2}-\d{2}$/.test(data.separo_fecha)) return bad(400, "Fecha de separo inválida");

  // Normaliza pagos: solo lo necesario para el cron
  const pagos = data.pagos
    .filter(p => p && p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number(p.amount) > 0)
    .map((p, i) => ({
      k:      String(p.k || "p"+i),
      label:  String(p.label || "Pago "+i),
      date:   p.date,
      amount: Math.round(Number(p.amount) || 0),
      num:    Number(p.num != null ? p.num : i),
    }));

  if (!pagos.length) return bad(400, "Ningún pago válido");

  const row = {
    email,
    nombre,
    evento_id:     String(data.evento_id).slice(0, 60),
    evento_nombre: String(data.evento_nombre || data.evento_id).slice(0, 200),
    paquete:       String(data.paquete).slice(0, 30),
    zona:          String(data.zona).slice(0, 120),
    precio:        Math.round(Number(data.precio) || 0),
    separo_fecha:  data.separo_fecha,
    separo_monto:  Math.round(Number(data.separo_monto) || 0),
    pagos,
    active:        true,
  };

  try {
    const res = await fetch(`${SB_URL}/rest/v1/rol_recordatorios`, {
      method: "POST",
      headers: {
        apikey:        SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer:        "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[rol-subscribe] SB error:", res.status, err);
      return bad(500, "Error guardando la suscripción");
    }
    const [created] = await res.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, id: created && created.id, pagos: pagos.length }),
    };
  } catch (e) {
    console.error("[rol-subscribe] Exception:", e.message);
    return bad(500, "Error interno");
  }
};
