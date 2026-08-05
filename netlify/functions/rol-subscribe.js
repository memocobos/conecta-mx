// netlify/functions/rol-subscribe.js
// Recibe POST desde /rol con datos del plan y guarda la suscripción en Supabase.
// Llamado desde rol.html cuando el cliente activa los recordatorios por email.
// Después del INSERT exitoso envía un email de bienvenida instantáneo vía Resend.

const { aplicarModoPrueba } = require('./_lib/correo-guard');

// Migrado al proyecto KameHouse (npgnhsmwpcipxgvfxrho): rol_recordatorios ya
// vive ahi con firma identica y datos migrados. Env KAMEHOUSE primero.
const SB_URL       = process.env.SUPABASE_URL_KAMEHOUSE;
const SB_KEY       = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const RESEND_KEY   = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM  = process.env.RESEND_FROM_ROL || "Conecta Reynosa <admin@conectareynosa.mx>";
const SITE         = process.env.URL || "https://conectareynosa.mx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESES_ABR = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const PKG_LABELS = {
  plus:  "PLUS · Todo incluido",
  ride:  "RIDE · Sin boleto",
  stay:  "STAY · Sin transporte",
  cheap: "CHEAP · Solo boleto",
};

function bad(status, msg) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: false, error: msg }),
  };
}
function fmtMoney(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("es-MX"); }
function fmtFechaCorta(ymdStr) {
  const parts = String(ymdStr || "").split("-");
  if (parts.length !== 3) return ymdStr || "";
  const [y, m, d] = parts;
  return `${d} ${MESES_ABR[parseInt(m, 10) - 1] || ""} ${y.slice(2)}`;
}
function slug(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function buildPlanUrl(row) {
  const u = encodeURIComponent(slug(row.nombre || "tu"));
  const tour = [row.evento_id, row.paquete, slug(row.zona), row.separo_fecha].join("-");
  return `${SITE}/rol?u=${u}&tours=${encodeURIComponent(tour)}`;
}
async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) {
    console.warn("[rol-subscribe] RESEND_API_KEY no configurado, skip welcome:", to);
    return false;
  }
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    console.error("[rol-subscribe] Resend error:", res.status, await res.text());
    return false;
  }
  return true;
}

function welcomeEmail(row) {
  const firstName = (row.nombre || "").split(" ")[0];
  const planUrl   = buildPlanUrl(row);
  const pagosUrl  = `${SITE}/pagos`;
  const waUrl     = "https://wa.me/528119771072";
  const pkgLabel  = PKG_LABELS[row.paquete] || (row.paquete || "").toUpperCase();
  // Tabla completa: prepend el separo (que se pagó al apartar) + los pagos futuros del array
  const allRows = [
    { label: "Separo (al apartar)", date: row.separo_fecha, amount: row.separo_monto, sep: true },
    ...(row.pagos || []).map(p => ({ label: p.label, date: p.date, amount: p.amount, sep: false })),
  ];
  const totalPagos = (row.pagos || []).length;

  const rowsHtml = allRows.map(r => {
    const bg = r.sep ? "#fffae6" : "#0a0a0a";
    const color = r.sep ? "#000" : "#fff";
    const border = r.sep ? "1px solid #e8ff4c" : "1px solid rgba(255,255,255,.08)";
    return `<tr>
      <td style="padding:11px 14px;background:${bg};color:${color};font-size:13px;font-weight:700;border-bottom:${border};font-family:Arial,sans-serif">${escapeHtml(r.label)}</td>
      <td style="padding:11px 14px;background:${bg};color:${color};font-size:13px;border-bottom:${border};font-family:Arial,sans-serif">${escapeHtml(fmtFechaCorta(r.date))}</td>
      <td style="padding:11px 14px;background:${bg};color:${r.sep ? "#000" : "#e8ff4c"};font-size:14px;font-weight:900;text-align:right;border-bottom:${border};font-family:Arial,sans-serif">${fmtMoney(r.amount)}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tu plan de pagos</title></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#ffffff;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#0a0a0a;border:1px solid rgba(255,255,255,.1)">

      <!-- HEADER -->
      <tr><td style="background:#000;border-bottom:4px solid #ff283b;padding:0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="background:#ff283b;padding:14px 18px;width:1%;white-space:nowrap"><span style="color:#000;font-weight:900;font-size:14px;letter-spacing:.04em;text-transform:uppercase;font-family:Arial,sans-serif">Conecta</span> <span style="color:#fff;font-style:italic;font-weight:900;font-size:16px">MX</span></td>
            <td style="padding:14px 18px;text-align:right;color:#e8ff4c;font-weight:900;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Mi Plan</td>
          </tr>
        </table>
      </td></tr>

      <!-- INTRO -->
      <tr><td style="padding:32px 26px 4px 26px">
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:10px">✓ Recordatorios activados</div>
        <h1 style="font-family:Arial Black,Arial,sans-serif;font-size:40px;line-height:.9;letter-spacing:-.01em;color:#e8ff4c;text-transform:uppercase;margin:0 0 14px 0">¡Hola, ${escapeHtml(firstName)}!</h1>
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,.85);margin:0 0 8px 0">Activaste los recordatorios automáticos para <strong style="color:#e8ff4c">${escapeHtml(row.evento_nombre)}</strong>.</p>
        <p style="font-size:14px;line-height:1.55;color:rgba(255,255,255,.7);margin:0 0 24px 0">Recibirás un email el día de cada pago con el monto y el link a tu plan. ${totalPagos > 0 ? `Quedan <strong style="color:#e8ff4c">${totalPagos} pago${totalPagos === 1 ? "" : "s"}</strong> por delante.` : "Tu plan está completo."}</p>
      </td></tr>

      <!-- PLAN SUMMARY -->
      <tr><td style="padding:0 26px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000;border:1px solid rgba(255,255,255,.18);border-left:6px solid #e8ff4c">
          <tr><td style="padding:18px 20px 8px 20px">
            <div style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,.5);letter-spacing:.18em;text-transform:uppercase;margin-bottom:4px">Tu plan</div>
            <div style="font-family:Arial Black,Arial,sans-serif;font-size:24px;color:#fff;line-height:1.1;letter-spacing:-.005em;margin-bottom:14px">${escapeHtml(row.evento_nombre)}</div>
          </td></tr>
          <tr><td style="padding:0 20px 18px 20px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="padding:6px 0;width:35%;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.45);font-family:Arial,sans-serif">Paquete</td>
                <td style="padding:6px 0;font-size:13px;color:#fff;font-weight:700;font-family:Arial,sans-serif">${escapeHtml(pkgLabel)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.45);font-family:Arial,sans-serif">Zona</td>
                <td style="padding:6px 0;font-size:13px;color:#fff;font-weight:700;font-family:Arial,sans-serif">${escapeHtml(row.zona)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.45);font-family:Arial,sans-serif">Total</td>
                <td style="padding:6px 0;font-family:Arial Black,Arial,sans-serif;font-size:20px;color:#e8ff4c;font-weight:900;letter-spacing:-.005em">${fmtMoney(row.precio)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.45);font-family:Arial,sans-serif">Separo</td>
                <td style="padding:6px 0;font-size:13px;color:#fff;font-weight:700;font-family:Arial,sans-serif">${fmtMoney(row.separo_monto)} · ${escapeHtml(fmtFechaCorta(row.separo_fecha))}</td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <!-- PAYMENTS TABLE -->
      <tr><td style="padding:24px 26px 8px 26px">
        <div style="font-family:Arial Black,Arial,sans-serif;font-size:16px;letter-spacing:.08em;text-transform:uppercase;color:#fff;margin-bottom:10px">Calendario de pagos</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid rgba(255,255,255,.12)">
          <tr style="background:#000">
            <th style="padding:9px 14px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);text-align:left;font-weight:700;border-bottom:2px solid rgba(255,255,255,.18)">Concepto</th>
            <th style="padding:9px 14px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);text-align:left;font-weight:700;border-bottom:2px solid rgba(255,255,255,.18)">Fecha</th>
            <th style="padding:9px 14px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);text-align:right;font-weight:700;border-bottom:2px solid rgba(255,255,255,.18)">Monto</th>
          </tr>
          ${rowsHtml}
        </table>
      </td></tr>

      <!-- BUTTONS -->
      <tr><td style="padding:24px 26px 8px 26px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding-bottom:8px"><a href="${planUrl}" style="display:block;width:100%;background:#e8ff4c;color:#000;padding:16px 20px;text-align:center;font-weight:900;font-size:15px;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;box-sizing:border-box">→ Ver mi plan completo</a></td></tr>
          <tr><td><a href="${pagosUrl}" style="display:block;width:100%;background:#0000cd;color:#ffffff;padding:16px 20px;text-align:center;font-weight:900;font-size:15px;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;box-sizing:border-box">💳 Ver datos bancarios</a></td></tr>
        </table>
      </td></tr>

      <!-- HELP -->
      <tr><td style="padding:18px 26px 14px 26px">
        <div style="border-top:1px solid rgba(255,255,255,.1);padding-top:16px;font-size:12px;color:rgba(255,255,255,.55);line-height:1.6">
          ¿Dudas? Manda WhatsApp al <a href="${waUrl}" style="color:#e8ff4c;text-decoration:none;font-weight:700">81 1977 1072</a>.<br>
          Tus marcas de pagos pagados se guardan en el navegador donde abriste tu plan.<br>
          <span style="color:rgba(255,255,255,.4)">Si no querés recibir más emails, responde con <strong>CANCELAR</strong> y te quitamos.</span>
        </div>
      </td></tr>

      <!-- NO-REPLY NOTICE -->
      <tr><td style="padding:0 26px 18px 26px">
        <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:14px;font-size:11px;color:rgba(255,255,255,.42);text-align:center;line-height:1.55;font-family:Arial,sans-serif">
          ⚠ Este correo no puede ser contestado.<br>Si necesitas ayuda, contáctanos por <a href="${waUrl}" style="color:#e8ff4c;text-decoration:none;font-weight:700">WhatsApp</a> o <a href="https://m.me/conectareynosa" style="color:#e8ff4c;text-decoration:none;font-weight:700">Messenger</a>.
        </div>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#000;padding:18px 26px;border-top:1px solid rgba(255,255,255,.1);text-align:center">
        <a href="https://instagram.com/conectarey" style="color:rgba(255,255,255,.55);text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 8px">Instagram</a>
        <a href="https://facebook.com/conectareynosa" style="color:rgba(255,255,255,.55);text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 8px">Facebook</a>
        <a href="${waUrl}" style="color:rgba(255,255,255,.55);text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 8px">WhatsApp</a>
        <div style="font-size:10px;color:rgba(255,255,255,.32);letter-spacing:.18em;margin-top:10px;text-transform:uppercase">Conecta Reynosa · conectareynosa.mx</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  }
  if (event.httpMethod !== "POST") return bad(405, "Método no permitido");
  if (!SB_URL || !SB_KEY) return bad(500, "Supabase no configurado en el servidor");

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return bad(400, "JSON inválido"); }

  const email = String(data.email || "").trim().toLowerCase();
  const nombre = String(data.nombre || "").trim();
  if (!EMAIL_RE.test(email))   return bad(400, "Email inválido");
  if (!nombre || nombre.length < 2) return bad(400, "Nombre inválido");
  if (!data.evento_id || !data.paquete || !data.zona) return bad(400, "Faltan datos del plan");
  if (!Array.isArray(data.pagos) || !data.pagos.length) return bad(400, "No hay pagos en el plan");
  if (!data.separo_fecha || !/^\d{4}-\d{2}-\d{2}$/.test(data.separo_fecha)) return bad(400, "Fecha de separo inválida");

  // Normaliza pagos: solo lo necesario para el cron
  const pagos = data.pagos
    .filter(p => p && p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number(p.amount) > 0)
    .map((p, i) => ({
      k:      String(p.k || "p"+i),
      label:  String(p.label || "Pago "+i),
      date:   p.date,
      amount: Math.round(Number(p.amount) || 0),
      num:    Number(p.num != null ? p.num : i),
    }));

  if (!pagos.length) return bad(400, "Ningún pago válido");

  // ═══════════════════════════════════════════════════════════════════════
  // [GR-10] EL PRECIO SALE DEL SERVIDOR, NO DEL NAVEGADOR.
  //
  // Antes: `precio: Math.round(Number(data.precio) || 0)`. Sin compuerta y con
  // un `|| 0` que convierte cualquier ausencia en cero silencioso. Si el
  // cliente lo omitía, al CLIENTE le llegaba su plan de pagos con el precio
  // del viaje en $0.
  //
  // Y ese cero es peor que un `undefined`: un undefined se ve roto y nadie se
  // lo cree; un $0 se ve como oferta.
  //
  // Se deriva con _lib/precio-zona —la misma autoridad de GR-5 y GR-8b— usando
  // evento_id/paquete/zona, que las cinco compuertas de arriba ya validaron.
  //
  // num_personas: 1 y sin hotel_nombre: /rol cotiza POR PERSONA en habitación
  // compartida. Medido contra el catálogo: el precio por persona es invariante
  // al número de viajeros (x1, x2 y x4 dan lo mismo); lo único que lo mueve es
  // un cuarto privado.
  //
  // ⚠️ LÍMITE CONOCIDO: el payload de /rol NO manda la habitación, así que el
  // servidor no puede ver el suplemento de un cuarto privado. Si el cliente
  // manda un precio MAYOR al derivado, se conserva el suyo y se grita en la
  // bitácora: sellar el más bajo cobraría de menos, que es el riesgo opuesto al
  // que GR-5 vino a cerrar. Si el suyo es MENOR o falta, manda el derivado.
  let _precioSellado = { estado: "no_evaluado" };
  const _precioCliente = (data.precio != null && data.precio !== "")
    ? Math.round(Number(data.precio)) : null;

  let _rp = null;
  try { ({ resolverPrecioVenta: _rp } = require("./_lib/precio-zona")); } catch (_) { _rp = null; }

  let precioFinal = null;
  if (_rp) {
    let r = null;
    try {
      r = await _rp({ evento_id: String(data.evento_id), paquete: String(data.paquete).toLowerCase(),
        zona: String(data.zona), num_personas: 1, hotel_nombre: undefined, transporte_cost: 0 });
    } catch (e) { r = null; }

    if (r && r.ok && Number(r.total) > 0) {
      const derivado = Math.round(Number(r.total));
      if (_precioCliente != null && _precioCliente > derivado) {
        precioFinal = _precioCliente;
        _precioSellado = { estado: "cliente_mayor", derivado, cliente: _precioCliente };
        console.warn("[GR-10] el cliente manda MÁS que el derivado (¿cuarto privado?): "
          + JSON.stringify(_precioSellado));
      } else {
        precioFinal = derivado;
        _precioSellado = (_precioCliente === derivado)
          ? { estado: "coincide", precio: derivado }
          : { estado: "sellado_por_servidor", derivado, cliente: _precioCliente };
      }
    } else {
      // No se pudo resolver. Hay que separar DOS causas que resolverPrecioVenta
      // devuelve igual ({ok:false}) y que NO son la misma:
      //
      //   · el catálogo NO SE PUDO LEER (Netlify caído) → falla de red, y se
      //     degrada abajo con lo que mandó el cliente.
      //   · el catálogo SÍ se leyó y la combinación no está → el plan apunta a
      //     algo que no se vende, y eso sí se rechaza.
      //
      // La sonda es la misma de GR-8b: fetchCatalogo() devuelve null solo
      // cuando no pudo leer. Es best-effort y cacheada, así que no cuesta.
      let _catLegible = false;
      try {
        const { fetchCatalogo } = require("./_lib/catalogo-index");
        _catLegible = !!(await fetchCatalogo());
      } catch (_) { _catLegible = false; }

      if (_catLegible) {
        return bad(400, `No pudimos calcular el precio de "${String(data.zona)}" para ese evento. `
          + `Refresca la página y vuelve a generar tu plan.`);
      }
      // catálogo ilegible → cae al fail-soft de abajo
    }
  }

  if (precioFinal == null) {
    // Catálogo ILEGIBLE (o sin la lib): fail-soft como GR-8b, pero NUNCA a cero.
    if (_precioCliente == null || !(_precioCliente > 0)) {
      return bad(503, "No pudimos confirmar el precio en este momento. Intenta de nuevo en un minuto.");
    }
    precioFinal = _precioCliente;
    _precioSellado = { estado: "catalogo_ilegible", cliente: _precioCliente };
    console.warn("[GR-10] catálogo ilegible, se usa el precio del cliente:", _precioCliente);
  }

  const row = {
    email,
    nombre,
    evento_id:     String(data.evento_id).slice(0, 60),
    evento_nombre: String(data.evento_nombre || data.evento_id).slice(0, 200),
    paquete:       String(data.paquete).slice(0, 30),
    zona:          String(data.zona).slice(0, 120),
    // [GR-10] Ya no es `Number(data.precio) || 0`: viene resuelto arriba y
    // nunca puede ser cero — si no se pudo resolver, la petición ya se rechazó.
    precio:        precioFinal,
    separo_fecha:  data.separo_fecha,
    separo_monto:  Math.round(Number(data.separo_monto) || 0),
    pagos,
    active:        true,
  };

  let createdId = null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rol_recordatorios`, {
      method: "POST",
      headers: {
        apikey:        SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer:        "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[rol-subscribe] SB error:", res.status, err);
      return bad(500, "Error guardando la suscripción");
    }
    const [created] = await res.json();
    createdId = created && created.id;
  } catch (e) {
    console.error("[rol-subscribe] Exception:", e.message);
    return bad(500, "Error interno");
  }

  // Email de bienvenida instantáneo — best-effort, no rompe el endpoint si falla
  let welcomeSent = false;
  try {
    const subject = `¡Hola ${(nombre || "").split(" ")[0]}, aquí está tu plan de pagos de ${row.evento_nombre}`;
    const html = welcomeEmail(row);
    welcomeSent = await sendEmail(email, subject, html);
  } catch (e) {
    console.error("[rol-subscribe] Welcome email error:", e.message);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, id: createdId, pagos: pagos.length, welcomeSent }),
  };
};
