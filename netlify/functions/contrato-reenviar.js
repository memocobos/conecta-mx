// contrato-reenviar.js
// Re-envía el email de invitación a la creadora para un contrato existente
// que sigue en estado 'pendiente'. Usa el mismo template y `from:` que
// contrato-crear.js para mantener consistencia.

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const SB_URL = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM = process.env.RESEND_FROM_CONTRATOS
  || process.env.RESEND_FROM_ROL
  || "Conecta Reynosa <admin@conectareynosa.mx>";
const SITE = process.env.URL || "https://conectareynosa.mx";

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

// [HER-1e] La fecha límite, escrita como la lee una persona: "miércoles 2 de
// septiembre". Se ancla a MEDIODÍA en −05:00 (Reynosa) para que ningún huso la
// corra de día: `new Date('2026-09-02')` a secas es medianoche UTC, que en
// México todavía es el 1.
//
// ⚠️ ESTA MISMA REGLA VIVE TAMBIÉN EN EL NAVEGADOR, para la vista previa del
// paso 1. Son dos runtimes y no hay forma de compartir la función, así que el
// arnés las CAREA letra por letra sobre un abanico de fechas. Lo que NO se hace
// es dejar que el cliente mande el texto ya armado: eso sería meter texto de
// fuera en un correo.
function _limiteTexto(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  try {
    return new Date(iso + 'T12:00:00-05:00').toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Cancun',
    });
  } catch (_) { return ''; }
}

function invitationEmail({ creador_nombre, evento_nombre, evento_fecha, link, fecha_limite }) {
  const firstName = (creador_nombre || "").split(" ")[0];
  const fechaTxt = evento_fecha
    ? new Date(evento_fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
    : "";
  // [HER-1e] Los dos párrafos que Memo aprobó, palabra por palabra. Solo salen
  // si vino una fecha: sin ella el correo es el de siempre.
  //
  // 🔒 DICE "DAMOS DE BAJA", NO "SE CANCELA AUTOMÁTICAMENTE". Cancelar sigue
  // siendo manual de Memo, y el correo no promete un automatismo que no existe.
  // La última línea abre la puerta de salida: sin ella, la única respuesta
  // posible al aviso es el silencio.
  const limiteTxt = _limiteTexto(fecha_limite);
  const bloqueLimite = limiteTxt ? `
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,.85);margin:0 0 14px 0"><strong style="color:#ffb020">Para poder apartarte el lugar necesitamos tu firma antes del ${escapeHtml(limiteTxt)}.</strong> Si para esa fecha no está firmado, damos de baja la colaboración y liberamos el lugar.</p>
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,.85);margin:0 0 14px 0">¿Ya no puedes? Contéstanos este correo y lo vemos.</p>` : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tu contrato Conecta Reynosa</title></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#0a0a0a;border:1px solid rgba(255,255,255,.1)">
      <tr><td style="background:#000;border-bottom:4px solid #ff283b;padding:0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="background:#ff283b;padding:14px 18px;width:1%;white-space:nowrap"><span style="color:#000;font-weight:900;font-size:14px;letter-spacing:.04em;text-transform:uppercase">Conecta</span> <span style="color:#fff;font-style:italic;font-weight:900;font-size:16px">MX</span></td>
          <td style="padding:14px 18px;text-align:right;color:#e8ff4c;font-weight:900;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Reynosa · Recordatorio</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px 26px 6px 26px">
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:10px">📝 Te re-enviamos tu contrato</div>
        <h1 style="font-family:Arial Black,Arial,sans-serif;font-size:36px;line-height:.95;letter-spacing:-.01em;color:#e8ff4c;text-transform:uppercase;margin:0 0 14px 0">Hola, ${escapeHtml(firstName)}</h1>
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,.85);margin:0 0 14px 0">Notamos que aún no has firmado tu contrato de colaboración para <strong style="color:#e8ff4c">${escapeHtml(evento_nombre)}</strong>${fechaTxt ? ` (${escapeHtml(fechaTxt)})` : ""}. Te volvemos a mandar el link por si se te traspapeló.</p>${bloqueLimite}
      </td></tr>
      <tr><td style="padding:8px 26px 28px 26px">
        <a href="${link}" style="display:block;width:100%;background:#e8ff4c;color:#000;padding:18px 20px;text-align:center;font-weight:900;font-size:16px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;box-sizing:border-box">→ Ver y firmar contrato</a>
        <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:14px;text-align:center;word-break:break-all">${escapeHtml(link)}</div>
      </td></tr>
      <tr><td style="background:#000;padding:18px 26px;border-top:1px solid rgba(255,255,255,.1);text-align:center">
        <div style="font-size:10px;color:rgba(255,255,255,.32);letter-spacing:.18em;text-transform:uppercase">Conecta Reynosa · conectareynosa.mx</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

// Se expone SOLO para el arnés: es la mitad servidor del careo del texto.
exports._limiteTexto = _limiteTexto;
exports._invitationEmail = invitationEmail;

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
  const __auth = await verifyAdminAuthLive(event, ['maestro_roshi','bulma','oolong','milk']);
  if (!__auth.valid) return bad(__auth.status, __auth.error);
  if (!SB_KEY) return bad(500, "SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado");
  if (!RESEND_KEY) return bad(500, "RESEND_API_KEY no configurado");

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return bad(400, "JSON inválido"); }

  const token = String(data.token || "").trim();
  if (!/^[a-f0-9]{20,80}$/.test(token)) return bad(400, "Token inválido");

  // [HER-1e] La fecha límite es OPCIONAL: sin ella el correo es el de siempre.
  // Con ella se valida EN LA PUERTA — una fecha imposible no se acomoda, se
  // rechaza, y el mensaje nombra el dedazo.
  const fecha_limite = String(data.fecha_limite || "").trim();
  if (fecha_limite) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_limite)) {
      return bad(422, "La fecha límite debe venir como AAAA-MM-DD; llegó: " + fecha_limite);
    }
    const hoyMx = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cancun' });
    if (fecha_limite < hoyMx) {
      return bad(422, "La fecha límite ya pasó (" + fecha_limite + ", hoy es " + hoyMx + "): un plazo vencido no es un plazo.");
    }
    if (!_limiteTexto(fecha_limite)) return bad(422, "No pude leer la fecha límite: " + fecha_limite);
  }

  let row;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/contratos_creadores?token=eq.${encodeURIComponent(token)}&select=*&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!r.ok) return bad(500, "Error consultando contrato");
    const rows = await r.json();
    row = rows[0];
  } catch (e) {
    console.error("[contrato-reenviar] SB error:", e.message);
    return bad(500, "Error interno");
  }
  if (!row) return bad(404, "Contrato no encontrado");
  if (row.estado === "firmado") return bad(409, "El contrato ya está firmado");

  const link = `${SITE}/contrato?t=${token}`;
  try {
    const __mp = aplicarModoPrueba({ to: row.creador_email, subject: `Recordatorio: tu contrato de colaboración con Conecta Reynosa - ${row.evento_nombre}` });
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: __mp.to,
        subject: __mp.subject,
        html: invitationEmail({
          creador_nombre: row.creador_nombre,
          evento_nombre: row.evento_nombre,
          evento_fecha: row.evento_fecha,
          link,
          fecha_limite,
        }),
      }),
    });
    if (!r.ok) {
      console.error("[contrato-reenviar] Resend error:", r.status, await r.text());
      return bad(500, "Error enviando email");
    }
  } catch (e) {
    console.error("[contrato-reenviar] Email exception:", e.message);
    return bad(500, "Error interno enviando email");
  }

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, to: row.creador_email }) };
};
