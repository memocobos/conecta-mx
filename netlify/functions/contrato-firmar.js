// contrato-firmar.js
// Registra la firma de la creadora y sube el INE (frente + reverso) al bucket
// privado `ine-creadores`. Actualiza el estado del contrato a 'firmado' y manda
// notificaciones a admin@conectareynosa.mx y a la creadora.

const SB_URL = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM = process.env.RESEND_FROM_CONTRATOS
  || process.env.RESEND_FROM_ROL
  || "Conecta Reynosa <admin@conectareynosa.mx>";
const SITE = process.env.URL || "https://conectareynosa.mx";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@conectareynosa.mx";
const BUCKET = "ine-creadores";
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB por archivo

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

// Acepta data URL `data:image/<sub>;base64,XYZ` con cualquier subtipo image/*
// (jpeg, png, webp, heic, heif, gif, etc.). Devuelve {bytes, mime, ext} o null.
function parseImageData(dataStr) {
  if (!dataStr || typeof dataStr !== "string") return { error: "empty" };
  const m = dataStr.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) {
    // Diagnóstico útil sin volcar el data URL completo al log.
    const head = dataStr.slice(0, 50);
    return { error: `data URL inválido (prefijo: "${head}…")` };
  }
  const mime = m[1].toLowerCase();
  const b64 = m[2].replace(/\s+/g, "");
  let bytes;
  try { bytes = Buffer.from(b64, "base64"); } catch (e) { return { error: "base64 corrupta" }; }
  if (!bytes.length) return { error: "bytes vacíos tras decodificar" };
  if (bytes.length > MAX_BYTES) return { tooBig: true, size: bytes.length };
  const ext =
    mime === "image/png"  ? "png"  :
    mime === "image/webp" ? "webp" :
    mime === "image/gif"  ? "gif"  :
    mime === "image/heic" ? "heic" :
    mime === "image/heif" ? "heif" :
    "jpg";
  return { bytes, mime, ext };
}

async function uploadObject(path, bytes, contentType) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Storage ${r.status}: ${text}`);
  }
  return path;
}

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) {
    console.warn("[contrato-firmar] RESEND_KEY no configurado, skip:", to);
    return false;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!r.ok) {
    console.error("[contrato-firmar] Resend error:", r.status, await r.text());
    return false;
  }
  return true;
}

function confirmacionEmail({ creador_nombre, evento_nombre, link }) {
  const firstName = (creador_nombre || "").split(" ")[0];
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contrato firmado</title></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#0a0a0a;border:1px solid rgba(255,255,255,.1)">
      <tr><td style="background:#000;border-bottom:4px solid #e8ff4c;padding:0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="background:#ff283b;padding:14px 18px;width:1%;white-space:nowrap"><span style="color:#000;font-weight:900;font-size:14px;letter-spacing:.04em;text-transform:uppercase">Conecta</span> <span style="color:#fff;font-style:italic;font-weight:900;font-size:16px">MX</span></td>
          <td style="padding:14px 18px;text-align:right;color:#e8ff4c;font-weight:900;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Reynosa</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px 26px 6px 26px">
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:10px">✓ Contrato firmado</div>
        <h1 style="font-family:Arial Black,Arial,sans-serif;font-size:36px;line-height:.95;letter-spacing:-.01em;color:#e8ff4c;text-transform:uppercase;margin:0 0 14px 0">¡Listo, ${escapeHtml(firstName)}!</h1>
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,.85);margin:0 0 14px 0">Recibimos tu firma y tu INE. Ya estás oficialmente colaborando con nosotros para <strong style="color:#e8ff4c">${escapeHtml(evento_nombre)}</strong>.</p>
        <p style="font-size:14px;line-height:1.55;color:rgba(255,255,255,.7);margin:0 0 24px 0">Guarda este link para consultar o imprimir tu contrato firmado cuando quieras:</p>
      </td></tr>
      <tr><td style="padding:8px 26px 28px 26px">
        <a href="${link}" style="display:block;width:100%;background:#e8ff4c;color:#000;padding:18px 20px;text-align:center;font-weight:900;font-size:16px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;box-sizing:border-box">Ver mi contrato firmado</a>
        <div style="margin-top:14px;font-size:11px;color:rgba(255,255,255,.45);text-align:center">Para guardarlo como PDF: abre el link, presiona Ctrl/Cmd+P y elige "Guardar como PDF".</div>
      </td></tr>
      <tr><td style="background:#000;padding:18px 26px;border-top:1px solid rgba(255,255,255,.1);text-align:center">
        <div style="font-size:10px;color:rgba(255,255,255,.32);letter-spacing:.18em;text-transform:uppercase">Conecta Reynosa · conectareynosa.mx</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function adminEmail({ creador_nombre, creador_email, evento_nombre, link }) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#fafafa;padding:20px;color:#222">
<h2 style="margin:0 0 12px 0">📝 Contrato firmado</h2>
<p><strong>${escapeHtml(creador_nombre)}</strong> (${escapeHtml(creador_email)}) firmó su contrato para <strong>${escapeHtml(evento_nombre)}</strong>.</p>
<p><a href="${link}" style="display:inline-block;background:#000;color:#e8ff4c;padding:10px 16px;text-decoration:none;font-weight:700">Ver contrato firmado →</a></p>
<p style="font-size:12px;color:#888">Revisa la firma + INE en la pestaña Contratos de Kamehouse.</p>
</body></html>`;
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (event.httpMethod !== "POST") return bad(405, "Método no permitido");
  if (!SB_KEY) return bad(500, "SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado");

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return bad(400, "JSON inválido"); }

  const token = String(data.token || "").trim().toLowerCase();
  if (!/^[a-f0-9]{20,80}$/.test(token)) {
    return bad(400, `Token inválido (recibido ${token.length} chars: "${token.slice(0,16)}…")`);
  }

  const firma = String(data.firma_data || "").trim();
  if (!firma.startsWith("data:image/")) {
    return bad(400, `Firma inválida (prefijo: "${firma.slice(0,30)}…")`);
  }

  const frente = parseImageData(data.ine_frente);
  const reverso = parseImageData(data.ine_reverso);
  if (frente.error) return bad(400, `INE frente: ${frente.error}`);
  if (reverso.error) return bad(400, `INE reverso: ${reverso.error}`);
  if (frente.tooBig) return bad(413, `INE frente excede 6 MB (${Math.round(frente.size/1024/1024*10)/10} MB)`);
  if (reverso.tooBig) return bad(413, `INE reverso excede 6 MB (${Math.round(reverso.size/1024/1024*10)/10} MB)`);

  // Verificar que el contrato exista y esté pendiente.
  let contrato;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/contratos_creadores?token=eq.${encodeURIComponent(token)}&select=*&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!r.ok) return bad(500, "Error consultando contrato");
    const rows = await r.json();
    contrato = rows[0];
  } catch (e) {
    console.error("[contrato-firmar] SB lookup error:", e.message);
    return bad(500, "Error interno");
  }
  if (!contrato) return bad(404, "Contrato no encontrado");
  if (contrato.estado === "firmado") return bad(409, "El contrato ya fue firmado");

  // Subir INE frente + reverso. Path: <token>/frente.<ext>, <token>/reverso.<ext>.
  const frentePath = `${token}/frente.${frente.ext}`;
  const reversoPath = `${token}/reverso.${reverso.ext}`;
  try {
    await uploadObject(frentePath, frente.bytes, frente.mime);
    await uploadObject(reversoPath, reverso.bytes, reverso.mime);
  } catch (e) {
    console.error("[contrato-firmar] Upload error:", e.message);
    return bad(500, "Error subiendo INE");
  }

  // IP de la creadora (Netlify expone x-nf-client-connection-ip).
  const ip = event.headers["x-nf-client-connection-ip"]
    || event.headers["client-ip"]
    || (event.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || null;

  // Actualizar registro.
  try {
    const r = await fetch(`${SB_URL}/rest/v1/contratos_creadores?id=eq.${contrato.id}`, {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        firma_data: firma,
        ine: { frente: frentePath, reverso: reversoPath },
        estado: "firmado",
        firmado_at: new Date().toISOString(),
        ip_firma: ip,
      }),
    });
    if (!r.ok) {
      console.error("[contrato-firmar] PATCH error:", r.status, await r.text());
      return bad(500, "Error guardando firma");
    }
  } catch (e) {
    console.error("[contrato-firmar] PATCH exception:", e.message);
    return bad(500, "Error interno");
  }

  // Auto-asignación: si existe un usuario con rol='cc' y correo igual al del
  // contrato, intentar crear la fila en eventos_coordi (mismo flujo que la
  // asignación manual desde Capsule Corp). Si falla en cualquier paso, se
  // loguea pero no rompe la firma — la asignación es opcional.
  let asignacion = null;
  try {
    asignacion = await _autoAsignarEvento(contrato);
  } catch (e) {
    console.error("[contrato-firmar] Auto-asign falló:", e.message);
  }

  // Emails best-effort (no rompen el endpoint si fallan).
  const link = `${SITE}/contrato?t=${token}`;
  try {
    await sendEmail(
      contrato.creador_email,
      `Tu contrato firmado · ${contrato.evento_nombre}`,
      confirmacionEmail({ creador_nombre: contrato.creador_nombre, evento_nombre: contrato.evento_nombre, link })
    );
  } catch (e) { console.error("[contrato-firmar] Email creadora:", e.message); }
  try {
    await sendEmail(
      ADMIN_EMAIL,
      `[Firmado] ${contrato.creador_nombre} - ${contrato.evento_nombre}`,
      adminEmail({ creador_nombre: contrato.creador_nombre, creador_email: contrato.creador_email, evento_nombre: contrato.evento_nombre, link })
    );
  } catch (e) { console.error("[contrato-firmar] Email admin:", e.message); }

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ ok: true, asignacion }),
  };
};

// ─── Auto-asignación de evento ────────────────────────────────────────
// Busca el usuario rol='cc' por correo y, si encuentra evento por fecha/nombre,
// inserta la asignación en eventos_coordi con status='aceptado'. Idempotente:
// si ya existe (coordi_id, evento_id) lo devuelve sin duplicar.
async function _autoAsignarEvento(contrato) {
  // 1. Buscar usuario rol='cc' con el correo del contrato.
  const userResp = await fetch(
    `${SB_URL}/rest/v1/usuarios?correo=eq.${encodeURIComponent(contrato.creador_email)}&rol=eq.cc&select=id,nombre&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!userResp.ok) {
    console.warn("[auto-asign] lookup usuario falló:", userResp.status);
    return { skipped: true, reason: "lookup_user_error" };
  }
  const users = await userResp.json();
  const user = users[0];
  if (!user) {
    console.log("[auto-asign] no hay usuario rol='cc' con correo", contrato.creador_email);
    return { skipped: true, reason: "no_cc_profile" };
  }

  // 2. Buscar evento_id. Prioridad: misma fecha; si hay varios, matchear por
  //    similitud de nombre con contrato.evento_nombre.
  const evResp = await fetch(
    `${SB_URL}/rest/v1/eventos?fecha=eq.${encodeURIComponent(contrato.evento_fecha)}&select=id,nombre,artista&limit=20`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!evResp.ok) {
    console.warn("[auto-asign] lookup eventos falló:", evResp.status);
    return { skipped: true, reason: "lookup_evento_error" };
  }
  const candidatos = await evResp.json();
  if (!candidatos.length) {
    console.log("[auto-asign] sin eventos en fecha", contrato.evento_fecha);
    return { skipped: true, reason: "no_evento_en_fecha" };
  }

  const target = String(contrato.evento_nombre || "").toLowerCase();
  let evento = null;
  if (candidatos.length === 1) {
    evento = candidatos[0];
  } else {
    // Match por substring nombre o artista.
    evento = candidatos.find(e => {
      const n = (e.nombre || "").toLowerCase();
      const a = (e.artista || "").toLowerCase();
      return target.includes(n) || n.includes(target) || (a && target.includes(a));
    }) || candidatos[0]; // fallback: el primero en esa fecha
  }

  // 3. Idempotencia: ¿ya existe la asignación?
  const dupResp = await fetch(
    `${SB_URL}/rest/v1/eventos_coordi?coordi_id=eq.${user.id}&evento_id=eq.${evento.id}&select=id,status&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  const dupes = dupResp.ok ? await dupResp.json() : [];
  if (dupes.length) {
    console.log("[auto-asign] ya existe asignación id=", dupes[0].id);
    return { id: dupes[0].id, evento_id: evento.id, coordi_id: user.id, existing: true };
  }

  // 4. Insertar. `asignado_en` y created defaults los pone PostgreSQL.
  const indicaciones = Array.isArray(contrato.expectativas)
    ? contrato.expectativas.join("\n")
    : String(contrato.expectativas || "");
  const insResp = await fetch(`${SB_URL}/rest/v1/eventos_coordi`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      coordi_id: user.id,
      evento_id: evento.id,
      indicaciones,
      status: "aceptado", // ya firmó el contrato, asume aceptación
    }),
  });
  if (!insResp.ok) {
    const err = await insResp.text();
    console.error("[auto-asign] insert falló:", insResp.status, err);
    return { skipped: true, reason: "insert_error" };
  }
  const [created] = await insResp.json();
  console.log("[auto-asign] asignación creada id=", created.id, "para user", user.nombre, "evento", evento.nombre);
  return { id: created.id, evento_id: evento.id, coordi_id: user.id, created: true };
}
