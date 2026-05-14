// contrato-actualizar.js
// Edita un contrato existente (solo en estado 'pendiente'). El token no cambia,
// así que el link enviado a la creadora sigue siendo válido y muestra los datos
// actualizados al abrirlo.

const SB_URL = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(status, msg) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify({ ok: false, error: msg }) };
}

function normList(arr) {
  if (!Array.isArray(arr)) return null;
  const out = arr.map(s => String(s || "").trim()).filter(Boolean);
  return out.length ? out : null;
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (event.httpMethod !== "POST") return bad(405, "Método no permitido");
  if (!SB_KEY) return bad(500, "SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado");

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return bad(400, "JSON inválido"); }

  const token = String(data.token || "").trim();
  if (!/^[a-f0-9]{20,80}$/.test(token)) return bad(400, "Token inválido");

  // Cargar contrato actual para validar estado.
  let actual;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/contratos_creadores?token=eq.${encodeURIComponent(token)}&select=id,estado&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!r.ok) return bad(500, "Error consultando contrato");
    const rows = await r.json();
    actual = rows[0];
  } catch (e) {
    console.error("[contrato-actualizar] SB lookup:", e.message);
    return bad(500, "Error interno");
  }
  if (!actual) return bad(404, "Contrato no encontrado");
  if (actual.estado === "firmado") return bad(409, "No se puede editar un contrato ya firmado");

  // Construir patch solo con campos provistos y válidos.
  const patch = {};

  if (data.creador_nombre !== undefined) {
    const v = String(data.creador_nombre || "").trim();
    if (v.length < 2) return bad(400, "Nombre de creadora inválido");
    patch.creador_nombre = v;
  }
  if (data.creador_email !== undefined) {
    const v = String(data.creador_email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(v)) return bad(400, "Email inválido");
    patch.creador_email = v;
  }
  if (data.evento_nombre !== undefined) {
    const v = String(data.evento_nombre || "").trim();
    if (v.length < 2) return bad(400, "Evento inválido");
    patch.evento_nombre = v;
  }
  if (data.evento_fecha !== undefined) {
    const v = String(data.evento_fecha || "").trim();
    if (!ISO_DATE_RE.test(v)) return bad(400, "Fecha del evento inválida (YYYY-MM-DD)");
    patch.evento_fecha = v;
  }
  if (data.contrato_fecha !== undefined) {
    const v = String(data.contrato_fecha || "").trim();
    if (!ISO_DATE_RE.test(v)) return bad(400, "Fecha del contrato inválida");
    patch.contrato_fecha = v;
  }
  if (data.ofrecimiento !== undefined) {
    const v = normList(data.ofrecimiento);
    if (!v) return bad(400, "Lista de ofrecimiento vacía");
    patch.ofrecimiento = v;
  }
  if (data.expectativas !== undefined) {
    const v = normList(data.expectativas);
    if (!v) return bad(400, "Lista de expectativas vacía");
    patch.expectativas = v;
  }

  if (!Object.keys(patch).length) return bad(400, "Nada que actualizar");

  let updated;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/contratos_creadores?id=eq.${actual.id}`, {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      console.error("[contrato-actualizar] PATCH error:", r.status, await r.text());
      return bad(500, "Error guardando cambios");
    }
    const arr = await r.json();
    updated = arr[0];
  } catch (e) {
    console.error("[contrato-actualizar] Exception:", e.message);
    return bad(500, "Error interno");
  }

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ ok: true, id: updated.id, fields: Object.keys(patch) }),
  };
};
