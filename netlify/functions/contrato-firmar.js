// contrato-firmar.js
// Registra la firma de la creadora y sube el INE (frente + reverso) al bucket
// privado `ine-creadores`. Actualiza el estado del contrato a 'firmado' y manda
// notificaciones a admin@conectareynosa.mx y a la creadora.

const { aplicarModoPrueba } = require('./_lib/correo-guard');
const { consultarPerfilGiveaway, fusionarPerfilGiveaway } = require('./_lib/perfil-giveaway');

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

// VIGENCIA CONFIGURABLE: 'YYYY-MM-DD' + N meses, recortando el día al último
// del mes destino (31-ago + 6 → 28-feb; 29-feb + 12 → 28-feb en año no
// bisiesto). Generaliza el _masUnAnio original (que era el caso meses=12).
function _masMeses(iso, meses) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const n = Math.round(Number(meses)) || 12;
  const totalM = (m - 1) + n;               // mes destino, base 0
  const y2 = y + Math.floor(totalM / 12);
  const m2 = (totalM % 12) + 1;             // base 1
  const ultimoDia = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
  const dd = Math.min(d, ultimoDia);
  return `${y2}-${String(m2).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
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
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
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

  // VÍA B: CAPTURA AL FIRMAR de la plantilla 'creadora' (decisión de Memo:
  // "no más por tenerlas"). fecha de nacimiento + contacto de emergencia son
  // OBLIGATORIOS para firmar — se validan ANTES de subir el INE (mismo patrón:
  // 400 accionable). Solo aplica a firmas NUEVAS de 'creadora'; los contratos
  // ya firmados no se tocan (el 409 de arriba lo garantiza) y las otras
  // plantillas ignoran datos_firma del cliente (coordinador jala del perfil KH
  // server-side; giveaway es tuerca aparte).
  const esCreadora = !contrato.plantilla || contrato.plantilla === "creadora";
  const esTeam = contrato.plantilla === "creadora_team";
  let datosFirma = null;
  if (esCreadora) {
    const df = (data.datos_firma && typeof data.datos_firma === "object") ? data.datos_firma : {};
    const fnac = String(df.fecha_nacimiento || "").trim();
    const em = (df.emergencia && typeof df.emergencia === "object") ? df.emergencia : {};
    const emNom = String(em.nombre || "").trim().slice(0, 120);
    const emTel = String(em.telefono || "").trim().slice(0, 30);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fnac)) return bad(400, "Falta tu fecha de nacimiento");
    if (!emNom) return bad(400, "Falta el nombre de tu contacto de emergencia");
    if (!emTel) return bad(400, "Falta el teléfono de tu contacto de emergencia");
    datosFirma = { fecha_nacimiento: fnac, emergencia: { nombre: emNom, telefono: emTel } };
  }

  // CREADORA_TEAM: captura al firmar = datos del PROEMIO (si no vienen ya en
  // datos, capturados a mano o del perfil) + ANEXO C (Declaración Discreta)
  // OBLIGATORIO. Todo se valida ANTES de subir el INE y se CONGELA en datos.
  // El Anexo C es CONFIDENCIAL: se guarda aquí y solo lo sirve admin-contratos
  // (contrato-obtener lo PODA de la respuesta pública).
  if (esTeam) {
    const df = (data.datos_firma && typeof data.datos_firma === "object") ? data.datos_firma : {};
    const ya = (contrato.datos && typeof contrato.datos === "object") ? contrato.datos : {};
    const t = (v, max) => String(v || "").trim().slice(0, max);
    const origen = ya.origen || t(df.origen, 120);
    const domicilio = ya.domicilio || t(df.domicilio, 200);
    const ciudad_estado = ya.ciudad_estado || t(df.ciudad_estado, 120);
    if (!origen) return bad(400, "Falta tu lugar de origen");
    if (!domicilio) return bad(400, "Falta tu domicilio");
    if (!ciudad_estado) return bad(400, "Falta tu ciudad y estado");
    const ax = (df.anexo_c && typeof df.anexo_c === "object") ? df.anexo_c : {};
    const cuentas = t(ax.cuentas_previas, 10);
    const estado_actual = t(ax.estado_actual, 20);
    const material = t(ax.material_previo, 10);
    const intencion = t(ax.intencion, 20);
    if (!["no", "si"].includes(cuentas)) return bad(400, "Anexo C: responde si has tenido cuentas de contenido adulto");
    const plataformas = t(ax.plataformas, 300);
    if (cuentas === "si" && !plataformas) return bad(400, "Anexo C: especifica plataforma y estatus");
    if (!["nunca", "baja", "vigente_sin_uso", "vigente_en_uso"].includes(estado_actual)) return bad(400, "Anexo C: indica el estado actual");
    if (!["no", "si"].includes(material)) return bad(400, "Anexo C: responde si existe material previo");
    const material_desc = t(ax.material_desc, 500);
    if (material === "si" && !material_desc) return bad(400, "Anexo C: describe de forma general el material previo");
    if (!["no_reactivar", "acuerdo"].includes(intencion)) return bad(400, "Anexo C: indica tu intención futura");
    const intencion_det = t(ax.intencion_det, 300);
    if (intencion === "acuerdo" && !intencion_det) return bad(400, "Anexo C: detalla el acuerdo especial requerido");
    datosFirma = {
      origen, domicilio, ciudad_estado,
      anexo_c: {
        cuentas_previas: cuentas,
        plataformas: cuentas === "si" ? plataformas : null,
        estado_actual,
        material_previo: material,
        material_desc: material === "si" ? material_desc : null,
        intencion,
        intencion_det: intencion === "acuerdo" ? intencion_det : null,
      },
    };
  }

  // 🎁 TUERCA C: candado de PERFIL DEL PORTAL para GIVEAWAY — el candado REAL
  // es este (la UI solo lo pinta amable). La llave es el CORREO del contrato
  // (debe ser el real del ganador). Se valida ANTES de subir el INE:
  //   · sin cuenta en el Portal → 409 accionable (crea tu cuenta con este correo)
  //   · cuenta sin fnac/emergencia → 400 accionable (completa tu perfil)
  //   · perfil completo → snapshot congelado en datos al firmar (manual gana)
  //   · Portal caído ('no_verificado') → la firma PROCEDE con líneas en blanco
  //     como el giveaway de hoy + datos.perfil_no_verificado:true para que Memo
  //     lo vea en admin. Jamás dejar a un ganador atorado por un 502 ajeno.
  const esGiveaway = contrato.plantilla === "giveaway";
  let datosGiveaway = null;
  if (esGiveaway) {
    const chk = await consultarPerfilGiveaway(contrato.creador_email);
    if (chk.estado === "sin_cuenta") {
      return bad(409, `Para firmar tu contrato, crea primero tu cuenta en el Portal Conecta con este mismo correo (${contrato.creador_email}) y vuelve a abrir este link.`);
    }
    if (chk.estado === "incompleto") {
      return bad(400, "Completa tu perfil en el Portal Conecta (fecha de nacimiento y contacto de emergencia) y vuelve a abrir este link.");
    }
    if (chk.estado === "completo") {
      datosGiveaway = fusionarPerfilGiveaway(contrato.datos, chk.perfil);
    } else { // 'no_verificado'
      datosGiveaway = { ...(contrato.datos || {}), perfil_no_verificado: true };
    }
  }

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

  // VÍA B (F5): al firmar un 'coordinador' se sella la vigencia de 1 año
  // (inicio = hoy en hora MX, fin = +1 año). Las otras plantillas NO tocan
  // vigencia (queda null). 'en-CA' → 'YYYY-MM-DD'.
  const patch = {
    firma_data: firma,
    ine: { frente: frentePath, reverso: reversoPath },
    estado: "firmado",
    firmado_at: new Date().toISOString(),
    ip_firma: ip,
  };
  if (contrato.plantilla === "coordinador" || esTeam) {
    // VIGENCIA CONFIGURABLE: fin = inicio + vigencia_meses. Legacy retrocompatible:
    // coordinador con vigencia_meses null → 12 (idéntico al _masUnAnio de siempre);
    // team null → 3. Lo YA FIRMADO nunca pasa por aquí (409 arriba) — su vigencia
    // sellada no se recalcula.
    const hoyMX = new Date().toLocaleDateString("en-CA", { timeZone: "America/Monterrey" });
    const meses = Math.round(Number(contrato.vigencia_meses)) || (esTeam ? 3 : 12);
    patch.vigencia_inicio = hoyMX;
    patch.vigencia_fin = _masMeses(hoyMX, meses);
    // VÍA B: CONGELAR el perfil KH en datos jsonb AL FIRMAR (snapshot, como
    // todo lo sellado). Best-effort: correo que no casa o perfil incompleto →
    // datos como estaban (líneas en blanco), la firma jamás se rompe. Lo ya
    // presente en datos (capturado a mano) SIEMPRE gana sobre el perfil.
    try {
      const congelado = await _perfilCoordinadorEnDatos(contrato.datos, contrato.creador_email);
      if (congelado) patch.datos = congelado;
    } catch (e) {
      console.warn("[contrato-firmar] snapshot perfil coordinador falló (best-effort):", e.message);
    }
  }
  // Captura de la creadora / team → congelada en datos jsonb SOBRE lo que ya
  // haya (incluido el snapshot del perfil de arriba; lo capturado gana).
  if (datosFirma) patch.datos = { ...(contrato.datos || {}), ...(patch.datos || {}), ...datosFirma };
  // 🎁 Giveaway: snapshot del perfil del Portal (o la marca de no-verificado).
  if (esGiveaway && datosGiveaway) patch.datos = datosGiveaway;

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
      body: JSON.stringify(patch),
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

  // [T2] Creadora EXTERNA que toma el viaje → a las listas del evento. Mismo
  // trato fail-soft que la auto-asignación: si algo truena se loguea y la firma
  // sigue su curso. Solo 'creadora'; las demás plantillas ignoran el flag.
  let creadoraViaje = null;
  if (esCreadora && contrato.datos && contrato.datos.toma_viaje === true) {
    try {
      // `contrato.datos` es el de ANTES de firmar; la emergencia que la
      // creadora acaba de capturar vive en patch.datos. Se pasa el efectivo.
      creadoraViaje = await _asignarViajeroDeContrato(contrato, patch.datos || contrato.datos, {
        tipo: "creadora_externa",
        etiqueta: "creadora-viaje",
        notas: "Creadora externa que toma el viaje (contrato firmado)",
      });
    } catch (e) {
      console.error("[contrato-firmar] Creadora externa al evento falló:", e.message);
    }
  }

  // [T3] GANADOR DE GIVEAWAY cuyo premio incluye el viaje
  // (datos.premio_incluye_viaje) → a las listas del evento, con los datos del
  // perfil del Portal que la firma acaba de congelar. Mismo trato fail-soft.
  //
  // Si el perfil venía NO verificado se mete igual con lo que haya y se avisa en
  // `notas`: es mejor que Memo lo vea en la lista con un pendiente que que no
  // aparezca. Los correos y el candado de la firma no cambian.
  //
  // Lo que esto NO hace, a propósito: no crea solicitud ni plan de pagos en el
  // Portal. Un lugar de $0 inventado ensuciaría caja y Ventas y podría despertar
  // cobranza. El ganador entra a las listas OPERATIVAS, no al mundo del dinero.
  let ganadorViaje = null;
  if (esGiveaway) {
    const dEfec = patch.datos || contrato.datos || {};
    if (dEfec.premio_incluye_viaje === true) {
      const sinVerificar = dEfec.perfil_no_verificado === true;
      try {
        ganadorViaje = await _asignarViajeroDeContrato(contrato, dEfec, {
          tipo: "ganador_giveaway",
          etiqueta: "ganador-giveaway",
          notas: sinVerificar
            ? "Ganador de giveaway (premio con viaje) — PERFIL DEL PORTAL SIN VERIFICAR: faltan datos por confirmar"
            : "Ganador de giveaway (premio con viaje)",
        });
      } catch (e) {
        console.error("[contrato-firmar] Ganador de giveaway al evento falló:", e.message);
      }
    }
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

// Helper puro exportado para el arnés (patrón admin-lugar-traspasar).
exports._masMeses = _masMeses;

// ─── Snapshot del perfil KH del coordinador ───────────────────────────
// Fusiona usuarios(correo) → {fecha_nacimiento, emergencia:{nombre,telefono}}
// sobre `datos` SIN pisar lo existente. Devuelve el objeto fusionado o null si
// no hay nada que congelar (correo sin perfil / perfil vacío). Misma fusión que
// contrato-obtener — aquí queda SELLADA en la fila al firmar.
async function _perfilCoordinadorEnDatos(datos, correo) {
  const mail = String(correo || "").trim();
  if (!mail) return null;
  const r = await fetch(
    `${SB_URL}/rest/v1/usuarios?correo=eq.${encodeURIComponent(mail)}&select=fecha_nacimiento,nombre_emergencia,num_emergencia&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!r.ok) return null;
  const [perfil] = await r.json();
  if (!perfil) return null;
  const d = { ...(datos || {}) };
  const em = (d.emergencia && typeof d.emergencia === "object") ? { ...d.emergencia } : {};
  let sumo = false;
  if (!d.fecha_nacimiento && perfil.fecha_nacimiento) { d.fecha_nacimiento = perfil.fecha_nacimiento; sumo = true; }
  if (!em.nombre && perfil.nombre_emergencia) { em.nombre = perfil.nombre_emergencia; sumo = true; }
  if (!em.telefono && perfil.num_emergencia) { em.telefono = perfil.num_emergencia; sumo = true; }
  if (Object.keys(em).length) d.emergencia = em;
  return sumo ? d : null;
}

// ─── Auto-asignación de evento ────────────────────────────────────────
// Busca el usuario rol='cc' por correo y, si encuentra evento por fecha/nombre,
// inserta la asignación en eventos_coordi con status='aceptado'. Idempotente:
// si ya existe (coordi_id, evento_id) lo devuelve sin duplicar.
// [T2] Resolución contrato → SLUG del evento, compartida por la asignación de
// coordinadores (eventos_coordi) y por la de creadoras externas
// (viajeros_evento). Devuelve {slug,nombre} o {skipped,reason}.
//
// Llavea por eventos_meta.fecha y NO adivina: si dos eventos caen el mismo día
// se sale con 'evento_ambiguo'. Devuelve SIEMPRE el slug BASE, sin '#idx' — el
// sufijo de multifecha vive en el mundo Portal (solicitudes_tour), mientras que
// las tablas de KH (viajeros_evento, eventos_coordi) llavean por slug base.
async function _resolverEventoPorFecha(fecha, etiqueta) {
  const r = await fetch(
    `${SB_URL}/rest/v1/eventos_meta?fecha=eq.${encodeURIComponent(fecha)}&select=slug,nombre`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!r.ok) {
    console.warn(`[${etiqueta}] lookup eventos_meta falló:`, r.status);
    return { skipped: true, reason: "lookup_evento_error" };
  }
  const candidatos = await r.json();
  if (!candidatos.length) {
    console.log(`[${etiqueta}] sin eventos_meta en fecha`, fecha);
    return { skipped: true, reason: "no_evento_en_fecha" };
  }
  if (candidatos.length > 1) {
    console.warn(`[${etiqueta}] varias filas en eventos_meta para fecha`, fecha, "→ no autoasigno (ambiguo)");
    return { skipped: true, reason: "evento_ambiguo" };
  }
  return { slug: candidatos[0].slug, nombre: candidatos[0].nombre || candidatos[0].slug };
}

// [T2 · T3] Mete a alguien de un CONTRATO a las listas del evento como PASAJERO
// en viajeros_evento. La usan dos flujos y por eso está parametrizada: la
// creadora externa que toma el viaje (T2, tipo 'creadora_externa') y el ganador
// de un giveaway cuyo premio incluye el viaje (T3, tipo 'ganador_giveaway').
// Una sola función = una sola idempotencia, una sola normalización de correo y
// una sola resolución de evento; no pueden desviarse entre sí.
//
// Por qué viajeros_evento y NO eventos_coordi: coordi_id es NOT NULL con FK a
// usuarios, así que una fila ahí obligaría a crearle cuenta de login — y todos
// los consumidores de esa tabla (mis-grupos, strikes, deliverables,
// recordatorios) asumen un usuario con sesión. Además el propio transporte ya
// separa los dos mundos: viajeros_evento son PASAJEROS, y de eventos_coordi
// salen los "PERSONAJES" que por definición "nunca cuentan como pasajeros".
// Una creadora que toma el viaje es una pasajera.
//
// IDEMPOTENTE por (evento_id, correo) leyendo ANTES de escribir — nada de
// on_conflict. La llave es más amplia que solo las filas 'creadora_externa' a
// propósito: si ya está en la lista por cualquier vía (p.ej. el upsert de staff
// cuando además es 'cc'), meterla otra vez la duplicaría en pantalla.
async function _asignarViajeroDeContrato(contrato, datosEfectivos, cfg) {
  const { tipo, etiqueta, notas } = cfg;
  // [T2 · remate] Normalizado a minúsculas: el candado de idempotencia compara
  // con eq. (sensible a mayúsculas), así que dos contratos del MISMO correo
  // escrito distinto la duplicarían en la lista. `contrato-crear` ya lo baja a
  // minúsculas al crear, esto es el cinturón. Una sola variable → cubre la
  // búsqueda y el insert de un jalón.
  const correo = String(contrato.creador_email || "").trim().toLowerCase();
  if (!correo) {
    console.log(`[${etiqueta}] contrato sin correo → no asigno`);
    return { skipped: true, reason: "sin_correo" };
  }

  const ev = await _resolverEventoPorFecha(contrato.evento_fecha, etiqueta);
  if (ev.skipped) return ev;
  const slug = ev.slug;

  // Idempotencia: ¿ya está en la lista de este evento?
  const dupResp = await fetch(
    `${SB_URL}/rest/v1/viajeros_evento?evento_id=eq.${encodeURIComponent(slug)}&correo=eq.${encodeURIComponent(correo)}&select=id,tipo_viajero&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!dupResp.ok) {
    console.warn(`[${etiqueta}] lookup duplicado falló:`, dupResp.status);
    return { skipped: true, reason: "lookup_dup_error" };
  }
  const dupes = await dupResp.json();
  if (dupes.length) {
    console.log(`[${etiqueta}] ya está en la lista id=`, dupes[0].id, "tipo=", dupes[0].tipo_viajero);
    return { id: dupes[0].id, evento_id: slug, existing: true };
  }

  // Los datos salen del contrato y del snapshot que la firma congela en datos
  // (fecha de nacimiento y contacto de emergencia). Ninguno de los dos flujos
  // pide celular, y la columna lo permite nulo.
  const d = (datosEfectivos && typeof datosEfectivos === "object") ? datosEfectivos : {};
  const em = (d.emergencia && typeof d.emergencia === "object") ? d.emergencia : {};
  const insResp = await fetch(`${SB_URL}/rest/v1/viajeros_evento`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      evento_id: slug,
      nombre: contrato.creador_nombre,
      correo,
      celular: null,
      emergencia_nombre: em.nombre || null,
      num_emergencia: em.telefono || null,
      tipo_viajero: tipo,
      notas,
    }),
  });
  if (!insResp.ok) {
    const err = await insResp.text();
    console.error(`[${etiqueta}] insert falló:`, insResp.status, err);
    return { skipped: true, reason: "insert_error" };
  }
  const [creado] = await insResp.json();
  console.log(`[${etiqueta}] agregado a la lista id=`, creado.id, "evento=", slug, "nombre=", contrato.creador_nombre);
  return { id: creado.id, evento_id: slug, created: true };
}

async function _autoAsignarEvento(contrato) {
  // 1. Buscar usuario rol='cc' con el correo del contrato (con todos los
  //    campos que vamos a necesitar para auto-poblar viajeros_evento).
  const userResp = await fetch(
    `${SB_URL}/rest/v1/usuarios?correo=eq.${encodeURIComponent(contrato.creador_email)}&rol=eq.cc&select=id,nombre,correo,celular,talla_playera,num_emergencia,nombre_emergencia,rol&limit=1`,
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

  // 2. Resolver el SLUG del evento. [T2] La resolución vive en
  //    _resolverEventoPorFecha para que la asignación de coordis y la de
  //    creadoras externas usen EXACTAMENTE la misma y no puedan desviarse.
  const ev = await _resolverEventoPorFecha(contrato.evento_fecha, "auto-asign");
  if (ev.skipped) return ev;
  const slug = ev.slug;
  const eventoNombre = ev.nombre;

  // 3. Idempotencia: ¿ya existe la asignación? (por slug)
  const dupResp = await fetch(
    `${SB_URL}/rest/v1/eventos_coordi?coordi_id=eq.${user.id}&evento_id=eq.${encodeURIComponent(slug)}&select=id,status&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  const dupes = dupResp.ok ? await dupResp.json() : [];

  let asigId, asigCreated = false;
  if (dupes.length) {
    asigId = dupes[0].id;
    console.log("[auto-asign] ya existe asignación id=", asigId);
  } else {
    // 4. Insertar asignación (evento_id = slug).
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
        evento_id: slug,
        indicaciones,
        status: "aceptado",
      }),
    });
    if (!insResp.ok) {
      const err = await insResp.text();
      console.error("[auto-asign] insert asignación falló:", insResp.status, err);
      return { skipped: true, reason: "insert_error" };
    }
    const [created] = await insResp.json();
    asigId = created.id;
    asigCreated = true;
    console.log("[auto-asign] asignación creada id=", asigId, "user=", user.nombre, "evento=", eventoNombre, "slug=", slug);
  }

  // 5. Auto-agregar como viajero del evento (idempotente). Best-effort: si
  //    falla no rompe la asignación. viajeros_evento.evento_id también es slug.
  let viajero = null;
  try {
    viajero = await _upsertViajeroStaffServer(slug, user);
  } catch (e) {
    console.warn("[auto-asign] upsert viajero falló:", e.message);
  }

  return {
    id: asigId,
    evento_id: slug,
    coordi_id: user.id,
    [asigCreated ? "created" : "existing"]: true,
    viajero,
  };
}

// Inserta o devuelve viajero staff existente para (evento_id, correo).
// Idempotente. Llamado tras crear la asignación en eventos_coordi.
// Si la migración tipo_viajero/usuario_id no se ha aplicado en prod, reintenta
// el INSERT sin esos campos y deja un marker [STAFF:<rol>] en `notas` para que
// el cliente detecte la fila como staff vía _esStaff().
async function _upsertViajeroStaffServer(eventoId, user) {
  // Idempotencia por correo (siempre existe en viajeros_evento).
  if (user.correo) {
    const dupResp = await fetch(
      `${SB_URL}/rest/v1/viajeros_evento?evento_id=eq.${eventoId}&correo=eq.${encodeURIComponent(user.correo)}&select=id&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (dupResp.ok) {
      const dupes = await dupResp.json();
      if (dupes.length) {
        console.log("[viajero-staff] ya existe id=", dupes[0].id);
        return { id: dupes[0].id, existing: true };
      }
    }
  }

  const baseBody = {
    evento_id: eventoId,
    nombre: user.nombre,
    celular: user.celular || null,
    correo: user.correo || null,
    talla_playera: user.talla_playera || null,
    num_emergencia: user.num_emergencia || null,
    emergencia_nombre: user.nombre_emergencia || null,
    tipo_paquete: "PLUS",
    notas: `[STAFF:${user.rol || "cc"}] Asignación automática por firmar contrato`,
  };

  const _post = async (body) => fetch(`${SB_URL}/rest/v1/viajeros_evento`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });

  let insResp = await _post({ ...baseBody, tipo_viajero: user.rol || "cc", usuario_id: user.id });
  if (!insResp.ok) {
    const err = await insResp.text();
    if (/tipo_viajero|usuario_id|schema cache/i.test(err)) {
      console.warn("[viajero-staff] migración pendiente, reintento sin tipo_viajero/usuario_id");
      insResp = await _post(baseBody);
    }
    if (!insResp.ok) {
      const err2 = await insResp.text();
      console.error("[viajero-staff] insert falló:", insResp.status, err2);
      return { skipped: true };
    }
  }
  const [created] = await insResp.json();
  console.log("[viajero-staff] viajero creado id=", created.id);
  return { id: created.id, created: true };
}
