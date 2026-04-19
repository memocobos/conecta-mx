exports.handler = async (event) => {
  const TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE = process.env.AIRTABLE_BASE || "app7B0djOaUn9T30m";

  if (!TOKEN) return { statusCode: 500, body: JSON.stringify({ error: "Token no configurado" }) };

  const { tabla, params = "", method = "GET", body, id } = JSON.parse(event.body || "{}");
  if (!tabla) return { statusCode: 400, body: JSON.stringify({ error: "Falta tabla" }) };

  // Si viene id, se agrega al path (para PATCH, DELETE, GET por id)
  const path = id ? `/${encodeURIComponent(tabla)}/${id}` : `/${encodeURIComponent(tabla)}${params}`;
  const url = `https://api.airtable.com/v0/${BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: method !== "GET" && method !== "DELETE" ? body : undefined,
  });

  const data = await res.json();
  return {
    statusCode: res.status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(data),
  };
};
