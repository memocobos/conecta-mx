// contrato-obtener.js
// Devuelve datos de un contrato por token. Si está firmado, incluye URLs firmadas
// (signed URLs, 1h) de los archivos INE para que admin/creadora puedan verlos.
// No expone IP ni metadatos sensibles más allá de lo necesario para renderizar.

const SB_URL = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const BUCKET = "ine-creadores";
const SIGNED_TTL = 3600; // 1 hora

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function bad(status, msg) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify({ ok: false, error: msg }) };
}

async function signUrl(path) {
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${encodeURI(path)}`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: SIGNED_TTL }),
    });
    if (!r.ok) {
      console.error("[contrato-obtener] sign error:", r.status, await r.text());
      return null;
    }
    const j = await r.json();
    if (!j || !j.signedURL) return null;
    return `${SB_URL}/storage/v1${j.signedURL}`;
  } catch (e) {
    console.error("[contrato-obtener] sign exception:", e.message);
    return null;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (event.httpMethod !== "GET") return bad(405, "Método no permitido");
  if (!SB_KEY) return bad(500, "SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado");

  const token = String((event.queryStringParameters && event.queryStringParameters.t) || "").trim();
  if (!/^[a-f0-9]{20,80}$/.test(token)) return bad(400, "Token inválido");

  let row;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/contratos_creadores?token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!r.ok) {
      console.error("[contrato-obtener] SB error:", r.status, await r.text());
      return bad(500, "Error consultando contrato");
    }
    const rows = await r.json();
    row = rows[0];
  } catch (e) {
    console.error("[contrato-obtener] Exception:", e.message);
    return bad(500, "Error interno");
  }

  if (!row) return bad(404, "Contrato no encontrado");

  // Firmar URLs del INE si está firmado y existen los paths.
  let ine_urls = null;
  if (row.estado === "firmado" && row.ine && (row.ine.frente || row.ine.reverso)) {
    const [frenteUrl, reversoUrl] = await Promise.all([
      row.ine.frente ? signUrl(row.ine.frente) : null,
      row.ine.reverso ? signUrl(row.ine.reverso) : null,
    ]);
    ine_urls = { frente: frenteUrl, reverso: reversoUrl, expiresIn: SIGNED_TTL };
  }

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({
      ok: true,
      contrato: {
        id: row.id,
        token: row.token,
        creador_nombre: row.creador_nombre,
        creador_email: row.creador_email,
        evento_nombre: row.evento_nombre,
        evento_fecha: row.evento_fecha,
        contrato_fecha: row.contrato_fecha,
        ofrecimiento: row.ofrecimiento,
        expectativas: row.expectativas,
        // VÍA B (F5): plantilla + datos jsonb + vigencia. Aditivo — para 'creadora'
        // (default) plantilla viene 'creadora' y datos/vigencia null: la página los
        // ignora y renderiza idéntico a siempre.
        plantilla: row.plantilla || 'creadora',
        datos: row.datos || null,
        vigencia_inicio: row.vigencia_inicio || null,
        vigencia_fin: row.vigencia_fin || null,
        estado: row.estado,
        firma_data: row.estado === "firmado" ? row.firma_data : null,
        firmado_at: row.firmado_at,
        enviado_at: row.enviado_at,
        ine_urls,
      },
    }),
  };
};
