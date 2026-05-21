// contrato-debug-log.js
// Endpoint público de telemetría para el flujo de subida de INE en contrato.html.
// Se invoca cuando el decoder chain falla por completo (HEIC sin createImageBitmap)
// o cuando la cascada agresiva no logra bajar el payload. Persistimos en la tabla
// contratos_errores del Supabase de kamehouse para poder dimensionar cuántas
// creadoras tropiezan y de qué tipo.
//
// No requiere auth. El token del contrato sirve de trazabilidad — cualquiera con
// un token válido podría spamear, así que rate-limit por token: max 5 logs/hora.

const SB_URL = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const TABLE = "contratos_errores";
const RATE_LIMIT_PER_TOKEN_PER_HOUR = 5;

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ERROR_TYPES = new Set([
  "heic_decode_failed",
  "decoder_chain_failed",
  "cascade_exhausted",
]);

function bad(status, msg) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify({ ok: false, error: msg }) };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (event.httpMethod !== "POST") return bad(405, "Método no permitido");
  if (!SB_KEY) return bad(500, "SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado");

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return bad(400, "JSON inválido"); }

  const token = String(data.token || "").trim().toLowerCase();
  if (!/^[a-f0-9]{20,80}$/.test(token)) return bad(400, "token inválido");

  const errorType = String(data.error_type || "").trim();
  if (!ALLOWED_ERROR_TYPES.has(errorType)) return bad(400, "error_type inválido");

  // Cap defensivo de tamaño — telemetría no debería pesar mucho.
  const userAgent = String(data.user_agent || "").slice(0, 500);
  const fileInfo = data.file_info && typeof data.file_info === "object" ? data.file_info : {};
  const decoderPath = Array.isArray(data.decoder_path)
    ? data.decoder_path.slice(0, 20).map(s => String(s).slice(0, 200))
    : [];

  // Rate limit por token: contar registros de la última hora.
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const countResp = await fetch(
      `${SB_URL}/rest/v1/${TABLE}?token=eq.${encodeURIComponent(token)}&created_at=gte.${encodeURIComponent(since)}&select=id`,
      {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          Prefer: "count=exact",
          "Range-Unit": "items",
          Range: "0-0",
        },
      }
    );
    if (countResp.ok) {
      const cr = countResp.headers.get("content-range") || "";
      const total = parseInt(cr.split("/")[1] || "0", 10);
      if (Number.isFinite(total) && total >= RATE_LIMIT_PER_TOKEN_PER_HOUR) {
        return { statusCode: 429, headers: HEADERS, body: JSON.stringify({ ok: false, error: "rate_limit" }) };
      }
    }
  } catch (e) {
    console.warn("[contrato-debug-log] rate-limit check falló (no bloquea):", e.message);
  }

  // Insertar registro.
  try {
    const ip = event.headers["x-nf-client-connection-ip"]
      || event.headers["client-ip"]
      || (event.headers["x-forwarded-for"] || "").split(",")[0].trim()
      || null;

    const insResp = await fetch(`${SB_URL}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        token,
        error_type: errorType,
        user_agent: userAgent,
        file_info: fileInfo,
        decoder_path: decoderPath,
        ip,
      }),
    });
    if (!insResp.ok) {
      const txt = await insResp.text();
      console.error("[contrato-debug-log] insert falló:", insResp.status, txt);
      return bad(500, "no se pudo registrar");
    }
  } catch (e) {
    console.error("[contrato-debug-log] insert exception:", e.message);
    return bad(500, "error interno");
  }

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
};
