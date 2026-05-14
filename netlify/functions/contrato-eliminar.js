// contrato-eliminar.js
// Elimina un contrato y, si tiene INE subido, borra ambos archivos del bucket
// privado `ine-creadores` antes de borrar el registro. Idempotente: si el INE
// ya no existe en Storage el borrado del row sigue adelante.

const SB_URL = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const BUCKET = "ine-creadores";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bad(status, msg) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify({ ok: false, error: msg }) };
}

async function deleteObject(path) {
  if (!path) return { ok: true, skipped: true };
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
      method: "DELETE",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!r.ok && r.status !== 404) {
      const text = await r.text();
      console.warn("[contrato-eliminar] Storage delete:", r.status, text);
      return { ok: false, status: r.status, error: text };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[contrato-eliminar] Storage delete exception:", e.message);
    return { ok: false, error: e.message };
  }
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

  // Cargar el contrato para conocer su id y los paths del INE (si hay).
  let row;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/contratos_creadores?token=eq.${encodeURIComponent(token)}&select=id,ine&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!r.ok) return bad(500, "Error consultando contrato");
    const rows = await r.json();
    row = rows[0];
  } catch (e) {
    console.error("[contrato-eliminar] SB lookup:", e.message);
    return bad(500, "Error interno");
  }
  if (!row) return bad(404, "Contrato no encontrado");

  // Borrar Storage primero (best-effort, no rompe el flujo).
  const storageResults = { frente: null, reverso: null };
  if (row.ine) {
    storageResults.frente = await deleteObject(row.ine.frente);
    storageResults.reverso = await deleteObject(row.ine.reverso);
  }

  // Borrar el row.
  try {
    const r = await fetch(`${SB_URL}/rest/v1/contratos_creadores?id=eq.${row.id}`, {
      method: "DELETE",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!r.ok) {
      console.error("[contrato-eliminar] DELETE error:", r.status, await r.text());
      return bad(500, "Error eliminando contrato");
    }
  } catch (e) {
    console.error("[contrato-eliminar] DELETE exception:", e.message);
    return bad(500, "Error interno");
  }

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ ok: true, storage: storageResults }),
  };
};
