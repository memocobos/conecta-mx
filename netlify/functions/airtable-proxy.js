exports.handler = async (event) => {
  const TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE = process.env.AIRTABLE_BASE || "app7B0djOaUn9T30m";

  // Dominios permitidos
  const ALLOWED_ORIGINS = [
    "https://conectareynosa.mx",
    "https://www.conectareynosa.mx",
    "http://localhost:3000",
    "http://localhost:8888",  // Netlify dev local
    "http://localhost:8080",
    "https://claude.ai",      // Claude en el browser
    "app://obsidian.md",      // Apps de escritorio
  ];

  const origin = event.headers?.origin || event.headers?.referer || "";
  const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o))
    || !origin  // Permite requests sin origin (Claude Code, scripts, curl)
    || origin.includes("netlify.app"); // previews de Netlify

  if (!isAllowed) {
    return {
      statusCode: 403,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Origen no permitido: " + origin }),
    };
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Preflight OPTIONS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (!TOKEN) return {
    statusCode: 500,
    headers: corsHeaders,
    body: JSON.stringify({ error: "Token no configurado" })
  };

  const { tabla, params = "", method = "GET", body, id } = JSON.parse(event.body || "{}");
  if (!tabla) return {
    statusCode: 400,
    headers: corsHeaders,
    body: JSON.stringify({ error: "Falta tabla" })
  };

  // Construir URL
  let url;
  if (id && (method === "GET" || method === "PATCH" || method === "DELETE")) {
    url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(tabla)}/${id}`;
  } else {
    url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(tabla)}${params}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: method !== "GET" && method !== "DELETE" ? body : undefined,
  });

  const data = await res.json();
  return {
    statusCode: res.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
};
