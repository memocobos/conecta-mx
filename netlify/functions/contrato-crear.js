// contrato-crear.js
// Crea un contrato de colaboración con un creador de contenido.
// Genera token único, persiste en Supabase (proyecto kamehouse) y manda email
// a la creadora con el link para firmar: https://conectareynosa.mx/contrato?t=TOKEN.

const crypto = require("crypto");
const { aplicarModoPrueba } = require('./_lib/correo-guard');
const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const SB_URL = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM = process.env.RESEND_FROM_CONTRATOS
  || process.env.RESEND_FROM_ROL
  || "Conecta Reynosa <admin@conectareynosa.mx>";
const SITE = process.env.URL || "https://conectareynosa.mx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bad(status, msg) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify({ ok: false, error: msg }) };
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function normList(arr) {
  if (!Array.isArray(arr)) return null;
  const out = arr.map(s => String(s || "").trim()).filter(Boolean);
  return out.length ? out : null;
}

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) {
    console.warn("[contrato-crear] RESEND_KEY no configurado, no se manda email a:", to);
    return false;
  }
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!r.ok) {
    console.error("[contrato-crear] Resend error:", r.status, await r.text());
    return false;
  }
  return true;
}

function invitationEmail({ creador_nombre, evento_nombre, evento_fecha, link }) {
  const firstName = (creador_nombre || "").split(" ")[0];
  const fechaTxt = evento_fecha
    ? new Date(evento_fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
    : "";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tu contrato Conecta Reynosa</title></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#0a0a0a;border:1px solid rgba(255,255,255,.1)">
      <tr><td style="background:#000;border-bottom:4px solid #ff283b;padding:0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="background:#ff283b;padding:14px 18px;width:1%;white-space:nowrap"><span style="color:#000;font-weight:900;font-size:14px;letter-spacing:.04em;text-transform:uppercase;font-family:Arial,sans-serif">Conecta</span> <span style="color:#fff;font-style:italic;font-weight:900;font-size:16px">MX</span></td>
          <td style="padding:14px 18px;text-align:right;color:#e8ff4c;font-weight:900;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Reynosa</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px 26px 6px 26px">
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:10px">📝 Contrato de colaboración</div>
        <h1 style="font-family:Arial Black,Arial,sans-serif;font-size:36px;line-height:.95;letter-spacing:-.01em;color:#e8ff4c;text-transform:uppercase;margin:0 0 14px 0">¡Hola, ${escapeHtml(firstName)}!</h1>
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,.85);margin:0 0 14px 0">Te mandamos tu contrato de colaboración con <strong style="color:#e8ff4c">Conecta Reynosa</strong> para el evento <strong style="color:#e8ff4c">${escapeHtml(evento_nombre)}</strong>${fechaTxt ? ` (${escapeHtml(fechaTxt)})` : ""}.</p>
        <p style="font-size:14px;line-height:1.55;color:rgba(255,255,255,.7);margin:0 0 24px 0">Necesitamos que lo revises, firmes con tu dedo desde el celular y subas una foto de tu INE (frente y reverso). Toma menos de 2 minutos.</p>
      </td></tr>
      <tr><td style="padding:8px 26px 28px 26px">
        <a href="${link}" style="display:block;width:100%;background:#e8ff4c;color:#000;padding:18px 20px;text-align:center;font-weight:900;font-size:16px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;box-sizing:border-box">→ Ver y firmar contrato</a>
        <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:14px;text-align:center;word-break:break-all">${escapeHtml(link)}</div>
      </td></tr>
      <tr><td style="padding:14px 26px 18px 26px">
        <div style="border-top:1px solid rgba(255,255,255,.1);padding-top:16px;font-size:12px;color:rgba(255,255,255,.55);line-height:1.6">
          ¿Dudas? Manda WhatsApp al <a href="https://wa.me/528119771072" style="color:#e8ff4c;text-decoration:none;font-weight:700">81 1977 1072</a>.
        </div>
      </td></tr>
      <tr><td style="background:#000;padding:18px 26px;border-top:1px solid rgba(255,255,255,.1);text-align:center">
        <div style="font-size:10px;color:rgba(255,255,255,.32);letter-spacing:.18em;text-transform:uppercase">Conecta Reynosa · conectareynosa.mx</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

exports.handler = async function (event) {
  // ─── Origin + Admin auth (Stop the Bleed) ───
  const __origin = corsCheck(event);
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': __origin || 'null',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Vary': 'Origin',
      },
      body: '',
    };
  }
  if (event.httpMethod !== "POST") return bad(405, "Método no permitido");
  if (!__origin) return bad(403, "Origen no permitido");
  const __auth = verifyAdminAuth(event, ['maestro_roshi','bulma','oolong']);
  if (!__auth.valid) return bad(__auth.status, __auth.error);
  if (!SB_KEY) return bad(500, "SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado");

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return bad(400, "JSON inválido"); }

  // VÍA B (F5): plantilla decide qué se pide. Default 'creadora' = comportamiento
  // idéntico al de siempre (ofrecimiento/expectativas obligatorios).
  const PLANTILLAS = ["creadora", "coordinador", "giveaway", "creadora_team"];
  const plantilla = PLANTILLAS.includes(String(data.plantilla || "").trim())
    ? String(data.plantilla).trim()
    : "creadora";

  // VIGENCIA CONFIGURABLE (coordinador + creadora_team): Memo elige 3/6/9/12
  // meses al crear. Default: coordinador 12 (retrocompatible), team 3 (periodo
  // de prueba). Otras plantillas no llevan vigencia (null).
  const VIGENCIAS = [3, 6, 9, 12];
  let vigencia_meses = null;
  if (plantilla === "coordinador" || plantilla === "creadora_team") {
    if (data.vigencia_meses !== undefined && data.vigencia_meses !== null && data.vigencia_meses !== "") {
      const v = Math.round(Number(data.vigencia_meses));
      if (!VIGENCIAS.includes(v)) return bad(400, "Vigencia inválida (3, 6, 9 o 12 meses)");
      vigencia_meses = v;
    } else {
      vigencia_meses = plantilla === "coordinador" ? 12 : 3;
    }
  }

  const creador_nombre = String(data.creador_nombre || "").trim();
  const creador_email = String(data.creador_email || "").trim().toLowerCase();
  const evento_nombre = String(data.evento_nombre || "").trim();
  const evento_fecha = String(data.evento_fecha || "").trim();
  const contrato_fecha = String(data.contrato_fecha || "").trim();
  const ofrecimiento = normList(data.ofrecimiento);
  const expectativas = normList(data.expectativas);

  if (creador_nombre.length < 2) return bad(400, "Nombre inválido");
  if (!EMAIL_RE.test(creador_email)) return bad(400, "Email inválido");
  if (evento_nombre.length < 2) return bad(400, "Evento inválido");
  if (!ISO_DATE_RE.test(evento_fecha)) return bad(400, "Fecha del evento inválida (YYYY-MM-DD)");
  if (contrato_fecha && !ISO_DATE_RE.test(contrato_fecha)) return bad(400, "Fecha del contrato inválida");

  // ofrecimiento/expectativas SOLO son obligatorios para 'creadora' (intercambio
  // de contenido). Coordinador y giveaway no los usan.
  let datos = null;
  if (plantilla === "creadora") {
    if (!ofrecimiento) return bad(400, "Falta lista de ofrecimiento");
    if (!expectativas) return bad(400, "Faltan expectativas del creador");
  } else if (plantilla === "giveaway") {
    // Giveaway pide: desglose del premio (texto) + valor del premio (MXN).
    const desglose_premio = String((data.datos && data.datos.desglose_premio) || "").trim();
    const valor_premio = Math.round(Number((data.datos && data.datos.valor_premio) || 0));
    if (desglose_premio.length < 3) return bad(400, "Falta el desglose del premio");
    if (!Number.isFinite(valor_premio) || valor_premio <= 0) return bad(400, "Valor del premio inválido");
    datos = { desglose_premio, valor_premio };
  } else if (plantilla === "coordinador") {
    // 🗼 ANEXO DE CUSTODIA (Torre de Karin): flag OPCIONAL en datos jsonb. Un
    // solo contrato, una sola firma — el anexo se rinde en el contrato si el
    // flag está. Solo se guarda cuando viene true (ausencia = coordinador de
    // hoy, byte-igual).
    if (data.datos && data.datos.cuidador_bodega === true) {
      datos = { cuidador_bodega: true };
    }
  }

  const token = crypto.randomBytes(20).toString("hex");

  const row = {
    token,
    creador_nombre,
    creador_email,
    evento_nombre,
    evento_fecha,
    contrato_fecha: contrato_fecha || new Date().toISOString().slice(0, 10),
    // Non-creadora no manda listas: se guardan vacías (no rompen NOT NULL ni el render).
    ofrecimiento: plantilla === "creadora" ? ofrecimiento : [],
    expectativas: plantilla === "creadora" ? expectativas : [],
    estado: "pendiente",
    plantilla,
    datos,
    vigencia_meses,
  };

  let created;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/contratos_creadores`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      console.error("[contrato-crear] SB error:", r.status, await r.text());
      return bad(500, "Error guardando contrato");
    }
    const arr = await r.json();
    created = arr[0];
  } catch (e) {
    console.error("[contrato-crear] Exception:", e.message);
    return bad(500, "Error interno");
  }

  const link = `${SITE}/contrato?t=${token}`;
  let emailSent = false;
  try {
    emailSent = await sendEmail(
      creador_email,
      `Tu contrato de colaboración con Conecta Reynosa - ${evento_nombre}`,
      invitationEmail({ creador_nombre, evento_nombre, evento_fecha, link })
    );
  } catch (e) {
    console.error("[contrato-crear] Email error:", e.message);
  }

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ ok: true, id: created.id, token, link, emailSent }),
  };
};
