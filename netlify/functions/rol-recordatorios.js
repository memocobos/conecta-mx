// netlify/functions/rol-recordatorios.js
// Cron diario: 14:00 UTC = 8:00 AM hora México (CST / CDT)
// Para cada suscripción activa en rol_recordatorios, si HOY coincide con la fecha
// de algún pago en su array `pagos`, manda un email vía Resend.

const SB_URL      = process.env.SUPABASE_URL;
const SB_KEY      = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY  = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Conecta MX <kamehouse@conectareynosa.mx>";
const SITE        = process.env.URL || "https://conectareynosa.mx";

const MX_TZ = "America/Monterrey";

function fmtMoney(n) {
  return "$" + Math.round(Number(n) || 0).toLocaleString("es-MX");
}
function todayMx() {
  // YYYY-MM-DD en huso horario CDMX/Monterrey
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: MX_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  return f.format(new Date());
}
function slug(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function fmtFechaCorta(ymdStr) {
  const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const [y, m, d] = String(ymdStr).split("-");
  return `${d} ${MESES[parseInt(m,10)-1] || ""} ${y.slice(2)}`;
}

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:        SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`SB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) {
    console.warn("[rol-recordatorios] RESEND_API_KEY no configurado, skip:", to);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  if (!res.ok) {
    console.error("[rol-recordatorios] Resend error:", res.status, await res.text());
    return false;
  }
  return true;
}

function buildPlanUrl(sub) {
  const u = encodeURIComponent(slug(sub.nombre || "tu"));
  const tour = [
    sub.evento_id,
    sub.paquete,
    slug(sub.zona),
    sub.separo_fecha,
  ].join("-");
  return `${SITE}/rol?u=${u}&tours=${encodeURIComponent(tour)}`;
}

function emailTemplate({ sub, pago, totalPagos }) {
  const planUrl = buildPlanUrl(sub);
  const pagosUrl = `${SITE}/pagos`;
  const pkgName = ({plus:"PLUS · Todo incluido",ride:"RIDE · Sin boleto",stay:"STAY · Sin transporte",cheap:"CHEAP · Solo boleto"})[sub.paquete] || sub.paquete.toUpperCase();
  const num = (pago.num != null ? pago.num : 0) + 1; // humano: 1-based
  const dudasUrl = "https://wa.me/528119771072";
  // Inline-style HTML compatible con la mayoría de clientes de email
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tu pago de hoy</title></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#ffffff;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:#0a0a0a;border:1px solid rgba(255,255,255,.1)">

      <!-- HEADER -->
      <tr><td style="background:#000;border-bottom:4px solid #ff283b;padding:0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="background:#ff283b;padding:14px 18px;width:1%;white-space:nowrap"><span style="color:#000;font-weight:900;font-size:14px;letter-spacing:.04em;text-transform:uppercase;font-family:Arial,sans-serif">Conecta</span> <span style="color:#fff;font-style:italic;font-weight:900;font-size:16px">MX</span></td>
            <td style="padding:14px 18px;text-align:right;color:#e8ff4c;font-weight:900;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Mi Plan</td>
          </tr>
        </table>
      </td></tr>

      <!-- BODY -->
      <tr><td style="padding:32px 26px 8px 26px">
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:10px">📧 Recordatorio · Tu pago de hoy</div>
        <h1 style="font-family:Arial Black,Arial,sans-serif;font-size:42px;line-height:.9;letter-spacing:-.01em;color:#e8ff4c;text-transform:uppercase;margin:0 0 14px 0">¡Hola, ${escapeHtml(sub.nombre.split(" ")[0])}!</h1>
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,.85);margin:0 0 22px 0">Hoy toca tu pago de <strong style="color:#e8ff4c">${escapeHtml(sub.evento_nombre)}</strong>. Aquí están los detalles:</p>
      </td></tr>

      <!-- PAYMENT CARD -->
      <tr><td style="padding:0 26px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000;border:1px solid rgba(255,255,255,.18);border-left:6px solid #e8ff4c">
          <tr><td style="padding:22px 22px 18px 22px">
            <div style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,.5);letter-spacing:.18em;text-transform:uppercase;margin-bottom:6px">Pago ${num} de ${totalPagos}</div>
            <div style="font-family:Arial Black,Arial,sans-serif;font-size:52px;color:#e8ff4c;line-height:1;letter-spacing:-.01em;margin-bottom:10px">${fmtMoney(pago.amount)}</div>
            <div style="font-size:13px;color:rgba(255,255,255,.75);font-weight:600">${escapeHtml(pago.label || "Pago")} · vence hoy ${fmtFechaCorta(pago.date)}</div>
          </td></tr>
          <tr><td style="padding:0 22px 18px 22px;border-top:1px solid rgba(255,255,255,.1)">
            <div style="font-size:11px;color:rgba(255,255,255,.5);padding-top:12px;line-height:1.7;letter-spacing:.04em">
              <span style="color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.14em;font-size:9px">PAQUETE</span><br><span style="color:#fff;font-weight:700">${escapeHtml(pkgName)}</span><br>
              <span style="color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.14em;font-size:9px;display:inline-block;margin-top:8px">ZONA</span><br><span style="color:#fff;font-weight:700">${escapeHtml(sub.zona)}</span>
            </div>
          </td></tr>
        </table>
      </td></tr>

      <!-- BUTTONS -->
      <tr><td style="padding:24px 26px 8px 26px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding-bottom:8px"><a href="${planUrl}" style="display:block;width:100%;background:#e8ff4c;color:#000;padding:16px 20px;text-align:center;font-weight:900;font-size:15px;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;box-sizing:border-box">→ Ver mi plan completo</a></td></tr>
          <tr><td><a href="${pagosUrl}" style="display:block;width:100%;background:#0000cd;color:#ffffff;padding:16px 20px;text-align:center;font-weight:900;font-size:15px;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;box-sizing:border-box">💳 Datos bancarios</a></td></tr>
        </table>
      </td></tr>

      <!-- HELP TEXT -->
      <tr><td style="padding:18px 26px 26px 26px">
        <div style="border-top:1px solid rgba(255,255,255,.1);padding-top:16px;font-size:12px;color:rgba(255,255,255,.55);line-height:1.6">
          ¿Dudas? Manda WhatsApp al <a href="${dudasUrl}" style="color:#e8ff4c;text-decoration:none;font-weight:700">81 1977 1072</a>.<br>
          Si ya pagaste, ignora este correo — el cargo puede tardar unos minutos en reflejar.<br>
          ¿No quieres más recordatorios? Responde STOP a este correo.
        </div>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#000;padding:18px 26px;border-top:1px solid rgba(255,255,255,.1);text-align:center">
        <a href="https://instagram.com/conectareynosa" style="color:rgba(255,255,255,.55);text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 8px">Instagram</a>
        <a href="https://facebook.com/conectareynosa" style="color:rgba(255,255,255,.55);text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 8px">Facebook</a>
        <a href="${dudasUrl}" style="color:rgba(255,255,255,.55);text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 8px">WhatsApp</a>
        <div style="font-size:10px;color:rgba(255,255,255,.32);letter-spacing:.18em;margin-top:10px;text-transform:uppercase">Conecta Reynosa · conectareynosa.mx</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
  }[c]));
}

exports.handler = async function () {
  console.log("[rol-recordatorios] Iniciando:", new Date().toISOString());

  if (!SB_URL || !SB_KEY) {
    console.error("[rol-recordatorios] Supabase no configurado");
    return { statusCode: 500, body: "Missing Supabase config" };
  }

  const today = todayMx(); // YYYY-MM-DD en huso México
  console.log("[rol-recordatorios] Fecha de hoy (MX):", today);

  let subs = [];
  try {
    subs = await sb(`rol_recordatorios?active=eq.true&select=*`);
  } catch (e) {
    console.error("[rol-recordatorios] SB fetch error:", e.message);
    return { statusCode: 500, body: "Supabase fetch failed" };
  }

  let totalSent = 0, totalDue = 0, totalErrors = 0;

  for (const sub of subs) {
    const pagos = Array.isArray(sub.pagos) ? sub.pagos : [];
    // Saltar separo (k='sep') porque ya se pagó al apartar; solo recordamos pagos futuros (k='pq*' o 'liq')
    const due = pagos.find(p => p && p.date === today && p.k !== "sep");
    if (!due) continue;
    totalDue++;

    const subject = `Hola ${(sub.nombre || "").split(" ")[0]}, hoy es tu pago de ${sub.evento_nombre}`;
    const html = emailTemplate({ sub, pago: due, totalPagos: pagos.length });

    const ok = await sendEmail(sub.email, subject, html);
    if (ok) {
      totalSent++;
      // Sello del último envío (best-effort, no rompe si falla)
      try {
        await sb(`rol_recordatorios?id=eq.${sub.id}`, {
          method: "PATCH",
          body: JSON.stringify({ last_sent_at: new Date().toISOString() }),
        });
      } catch {}
    } else {
      totalErrors++;
    }
  }

  const summary = { ok: true, today, total: subs.length, due: totalDue, sent: totalSent, errors: totalErrors };
  console.log("[rol-recordatorios] Resumen:", summary);
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(summary),
  };
};
