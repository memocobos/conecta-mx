// netlify/functions/waitlist-notify.js
//
// 2 modos:
//
//  (1) AUTO (cron diario): lee el catálogo con _lib/catalogo-index y compara
//      cada evento contra eventos_estado_snapshot. Si el snapshot dice
//      'proximamente' y el actual es '' (vacío = a la venta), dispara emails a
//      todos los registros notificado=false de ese evento. Finalmente
//      actualiza el snapshot con los estados actuales.
//      [GR-8] Un evento que el snapshot NO conocía se SIEMBRA sin avisar: no
//      es una transición, es la primera vez que lo vemos.
//
//  (2) FORCE (botón "Notificar a todos" en kamehouse):
//      ?force=true&evento_id=X — manda emails a la lista de espera de ese
//      evento sin importar el snapshot, y marca el evento como activo.
//
// Configurado como cron diario en netlify.toml a las 14:00 UTC (8 AM CDMX).

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');
// [GR-8] La única fuente del catálogo. Ver la nota donde vivía extractEventos.
const { fetchCatalogo } = require('./_lib/catalogo-index');

const SB_URL      = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY      = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const RESEND_KEY  = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM        = process.env.RESEND_FROM_ROL || "Conecta Reynosa <admin@conectareynosa.mx>";
const SITE        = process.env.URL || "https://conectareynosa.mx";

function ok(b)  { return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }; }
function bad(c,m){ return { statusCode: c, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok:false, error:m }) }; }

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`SB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) { console.warn("[waitlist-notify] RESEND_API_KEY no configurado, skip:", to); return false; }
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) { console.error("[waitlist-notify] Resend error:", res.status, await res.text()); return false; }
  return true;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
  }[c]));
}

// [GR-8] Aquí vivía extractEventos(): un extractor de regex PROPIO de esta
// función, que leía el array EV del HTML. Se eliminó entero. Su patrón
// /\{[^{}]*id:...[^{}]*\}/ no admitía llaves anidadas, y casi todo evento trae
// zonas:[{...}] o flashPromo:{...}: veía 18 de 94 eventos y CERO de los 54 que
// están a la venta, así que la transición que dispara los avisos —proximamente
// a la venta— era inalcanzable y la lista de espera no avisaba nunca.
// Ahora el catálogo sale de _lib/catalogo-index (fetchCatalogo), la MISMA
// fuente que ya usan bodega, contratos, cobranza y transporte: una sola
// autoridad y cero copias del parser.

function emailTemplate({ nombre, evento_nombre, fecha, venue, link, promo }) {
  const dudasUrl = "https://wa.me/528119771072";
  const firstName = (nombre || "").split(" ")[0] || nombre;
  // Bloque amarillo de código de descuento (opcional).
  // Se inserta entre la "EVENT CARD" y el botón CTA cuando el admin lo activó
  // en el modal de Kamehouse antes de mandar el correo.
  const promoBlock = promo && promo.codigo ? `
      <tr><td style="padding:18px 26px 0 26px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#e8ff4c;border-radius:8px">
          <tr><td style="padding:20px;text-align:center">
            <p style="color:#000;font-size:13px;margin:0 0 8px 0;font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-family:Arial,sans-serif">🎁 Código de descuento exclusivo</p>
            <p style="color:#000;font-size:28px;font-weight:900;letter-spacing:4px;margin:0 0 8px 0;font-family:Arial Black,Arial,sans-serif">${escapeHtml(promo.codigo)}</p>
            <p style="color:#000;font-size:13px;margin:0;font-weight:600">${promo.descuento}% de descuento · Aplícalo al cotizar en el sitio</p>
            <p style="color:rgba(0,0,0,.65);font-size:11px;margin:8px 0 0 0;font-weight:700;letter-spacing:.08em;text-transform:uppercase">⏱ Válido por ${promo.horas} ${promo.horas === 1 ? 'hora' : 'horas'}</p>
          </td></tr>
        </table>
      </td></tr>` : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>¡Ya está disponible!</title></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#ffffff;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:#0a0a0a;border:1px solid rgba(255,255,255,.1)">

      <!-- HEADER -->
      <tr><td style="background:#000;border-bottom:4px solid #e8ff4c;padding:0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="background:#ff283b;padding:14px 18px;width:1%;white-space:nowrap"><span style="color:#000;font-weight:900;font-size:14px;letter-spacing:.04em;text-transform:uppercase;font-family:Arial,sans-serif">Conecta</span> <span style="color:#fff;font-style:italic;font-weight:900;font-size:16px">MX</span></td>
            <td style="padding:14px 18px;text-align:right;color:#e8ff4c;font-weight:900;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Lista de espera</td>
          </tr>
        </table>
      </td></tr>

      <!-- HERO -->
      <tr><td style="padding:36px 26px 8px 26px">
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:12px">🔔 Te avisamos</div>
        <h1 style="font-family:Arial Black,Arial,sans-serif;font-size:48px;line-height:.9;letter-spacing:-.01em;color:#e8ff4c;text-transform:uppercase;margin:0 0 18px 0">¡YA ESTÁ AQUÍ!</h1>
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,.85);margin:0 0 22px 0">Hola <strong style="color:#e8ff4c">${escapeHtml(firstName)}</strong>, te anunciamos que <strong style="color:#fff">${escapeHtml(evento_nombre)}</strong> ya está disponible para reservar.</p>
      </td></tr>

      <!-- EVENT CARD -->
      <tr><td style="padding:0 26px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000;border:1px solid rgba(255,255,255,.18);border-left:6px solid #e8ff4c">
          <tr><td style="padding:22px 22px 18px 22px">
            <div style="font-family:Arial Black,Arial,sans-serif;font-size:22px;color:#ffffff;line-height:1.15;letter-spacing:-.01em;margin-bottom:12px">${escapeHtml(evento_nombre)}</div>
            ${fecha ? `<div style="font-size:13px;color:rgba(255,255,255,.7);font-weight:600;margin-bottom:6px">📅 ${escapeHtml(fecha)}</div>` : ""}
            ${venue ? `<div style="font-size:13px;color:rgba(255,255,255,.7);font-weight:600">📍 ${escapeHtml(venue)}</div>` : ""}
          </td></tr>
        </table>
      </td></tr>

      ${promoBlock}

      <!-- BUTTON -->
      <tr><td style="padding:24px 26px 8px 26px">
        <a href="${link}" style="display:block;width:100%;background:#e8ff4c;color:#000;padding:18px 20px;text-align:center;font-weight:900;font-size:15px;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;box-sizing:border-box">→ Ver precios y reservar</a>
      </td></tr>

      <!-- HELP -->
      <tr><td style="padding:24px 26px 14px 26px">
        <div style="border-top:1px solid rgba(255,255,255,.1);padding-top:16px;font-size:12px;color:rgba(255,255,255,.55);line-height:1.6">
          ¿Dudas? Manda WhatsApp al <a href="${dudasUrl}" style="color:#e8ff4c;text-decoration:none;font-weight:700">81 1977 1072</a>.
        </div>
      </td></tr>

      <!-- NO-REPLY -->
      <tr><td style="padding:0 26px 18px 26px">
        <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:14px;font-size:11px;color:rgba(255,255,255,.42);text-align:center;line-height:1.55;font-family:Arial,sans-serif">
          ⚠ Este correo no puede ser contestado.<br>Si necesitas ayuda, contáctanos por <a href="${dudasUrl}" style="color:#e8ff4c;text-decoration:none;font-weight:700">WhatsApp</a> o <a href="https://m.me/conectareynosa" style="color:#e8ff4c;text-decoration:none;font-weight:700">Messenger</a>.
        </div>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#000;padding:18px 26px;border-top:1px solid rgba(255,255,255,.1);text-align:center">
        <a href="https://instagram.com/conectarey" style="color:rgba(255,255,255,.55);text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 8px">Instagram</a>
        <a href="https://facebook.com/conectareynosa" style="color:rgba(255,255,255,.55);text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 8px">Facebook</a>
        <a href="${dudasUrl}" style="color:rgba(255,255,255,.55);text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 8px">WhatsApp</a>
        <div style="font-size:10px;color:rgba(255,255,255,.32);letter-spacing:.18em;margin-top:10px;text-transform:uppercase">Conecta Reynosa · conectareynosa.mx</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

async function notifyEvento({ id, a, f, v, promo }) {
  const link = `${SITE}/${encodeURIComponent(id)}`;
  // Pide solo registros pendientes.
  const rows = await sb(`eventos_waitlist?evento_id=eq.${encodeURIComponent(id)}&notificado=eq.false&select=id,nombre,email`);
  if (!rows.length) return { sent: 0, total: 0 };

  let sent = 0;
  for (const r of rows) {
    const subject = `¡Ya está disponible ${a}!`;
    const html = emailTemplate({ nombre: r.nombre, evento_nombre: a, fecha: f, venue: v, link, promo });
    const okSend = await sendEmail(r.email, subject, html);
    if (!okSend) continue;
    sent++;
    try {
      await sb(`eventos_waitlist?id=eq.${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notificado: true, notificado_at: new Date().toISOString() }),
      });
    } catch (e) { console.warn("[waitlist-notify] no se pudo marcar notificado:", r.id, e.message); }
  }
  return { sent, total: rows.length };
}

async function upsertSnapshot(rows) {
  if (!rows.length) return;
  await sb(`eventos_estado_snapshot`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows.map(e => ({ evento_id: e.id, estado: e.st, updated_at: new Date().toISOString() }))),
  });
}

exports.handler = async function (event) {
  if (!SB_KEY) return bad(500, "SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado");

  const qs = event.queryStringParameters || {};
  const force = qs.force === "true";
  const forceId = qs.evento_id;

  // Código de descuento opcional (force mode). El admin lo configura desde el
  // modal de Kamehouse → Lista de espera → Notificar. Si llegan los 3 campos,
  // el email incluye el bloque amarillo destacado; si no, va el correo normal.
  const codigo = (qs.codigo || "").trim().toUpperCase().slice(0, 24);
  const descuento = parseInt(qs.descuento, 10);
  const horas = parseInt(qs.horas, 10);
  const promo = (codigo && /^[A-Z0-9_-]{2,24}$/.test(codigo)
                 && Number.isFinite(descuento) && descuento > 0 && descuento < 100
                 && Number.isFinite(horas) && horas > 0 && horas <= 168)
    ? { codigo, descuento, horas } : null;

  // ── FORCE MODE: notificar a una lista específica desde kamehouse ──
  if (force && forceId) {
    // Candado: el modo force dispara emails masivos desde kamehouse, así que
    // exige admin. El cron AUTO entra por el camino de abajo (sin querystring,
    // sin Authorization) y NO pasa por aquí — este guard no lo afecta.
    const __origin = corsCheck(event);
    if (!__origin) return bad(403, "Origen no permitido");
    const auth = await verifyAdminAuthLive(event, ['maestro_roshi','bulma','milk']);
    if (!auth.valid) return bad(auth.status, auth.error);

    // Necesitamos el nombre/fecha/venue. Los traemos del primer registro
    // de la waitlist (evento_nombre quedó guardado al subscribirse).
    let row;
    try {
      const rs = await sb(`eventos_waitlist?evento_id=eq.${encodeURIComponent(forceId)}&select=evento_nombre&limit=1`);
      row = rs && rs[0];
    } catch (e) { return bad(500, "SB error: " + e.message); }
    if (!row) return ok({ ok: true, sent: 0, total: 0, note: "Lista vacía" });

    const summary = await notifyEvento({ id: forceId, a: row.evento_nombre, f: "", v: "", promo });
    // Marca el evento como activo en snapshot para que el cron no vuelva a disparar.
    try {
      await sb(`eventos_estado_snapshot`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{ evento_id: forceId, estado: "", updated_at: new Date().toISOString() }]),
      });
    } catch {}
    return ok({ ok: true, mode: "force", evento_id: forceId, ...summary });
  }

  // ── AUTO MODE (cron): scrape index.html y detecta transiciones ──
  // [GR-8] El catálogo sale de _lib/catalogo-index — la MISMA autoridad que ya
  // usan bodega, contratos, cobranza y transporte. Antes esta función tenía su
  // propio extractor de regex y veía 18 de 94 eventos: su patrón
  // /\{[^{}]*id:'…'[^{}]*\}/ prohíbe llaves anidadas, y casi todo evento trae
  // zonas:[{…}] o flashPromo:{…}. Resultado medido: de los 54 eventos A LA
  // VENTA no veía NINGUNO, y como la transición que dispara es
  // "proximamente → a la venta", la lista de espera no podía avisar jamás.
  const catalogo = await fetchCatalogo();
  if (!catalogo) return bad(502, "No se pudo leer el catálogo");
  const eventos = Object.keys(catalogo).map(id => ({
    id,
    st: catalogo[id].st || "",
    a:  catalogo[id].nombre || id,
    f:  catalogo[id].fecha  || "",
    v:  catalogo[id].venue  || "",
  }));
  if (!eventos.length) return bad(500, "El catálogo vino vacío");
  console.log(`[waitlist-notify] eventos del catálogo: ${eventos.length}`);

  let snapshot = [];
  try { snapshot = await sb(`eventos_estado_snapshot?select=evento_id,estado`); }
  catch (e) { console.error("[waitlist-notify] snapshot fetch:", e.message); }
  const prev = {};
  for (const s of snapshot) prev[s.evento_id] = s.estado;

  // ═══ LA SIEMBRA ══════════════════════════════════════════════════════════
  // El snapshot se escribió durante meses con la lista CIEGA de 18 eventos, así
  // que los ~76 que entran hoy son desconocidos para él. Un evento desconocido
  // NO es una transición: lleva a saber cuánto a la venta, y avisarle hoy a su
  // lista de espera sería mandar "¡ya está disponible!" por algo que abrió hace
  // meses — a toda la lista, de golpe.
  //
  // Regla: solo se compara contra un estado que el snapshot YA conocía. Lo
  // desconocido se SIEMBRA callado (lo escribe upsertSnapshot al final, como
  // siempre) y queda listo para comparar en la siguiente corrida.
  //
  // Es por evento, no por corrida: un evento nuevo del catálogo se siembra sin
  // ruido sin bloquear la transición real de otro que sí venía observado.
  let sembrados = 0;
  let totalSent = 0, totalNotif = 0, eventosDisparados = 0;
  for (const ev of eventos) {
    const conocido = Object.prototype.hasOwnProperty.call(prev, ev.id);
    if (!conocido) { sembrados++; continue; }   // primera vez que lo vemos → solo se siembra
    const before = prev[ev.id];
    // Transición proximamente -> a la venta (st vacío).
    if (before === "proximamente" && ev.st === "") {
      eventosDisparados++;
      try {
        const r = await notifyEvento(ev);
        totalSent += r.sent; totalNotif += r.total;
        console.log(`[waitlist-notify] ${ev.id}: ${r.sent}/${r.total} enviados`);
      } catch (e) { console.error(`[waitlist-notify] ${ev.id} falló:`, e.message); }
    }
  }
  if (sembrados) console.log(`[waitlist-notify] sembrados sin avisar: ${sembrados}`);

  // Actualiza snapshot con los estados actuales (insert + update).
  try { await upsertSnapshot(eventos); }
  catch (e) { console.error("[waitlist-notify] upsert snapshot:", e.message); }

  return ok({ ok: true, mode: "auto", eventos: eventos.length, sembrados,
    disparados: eventosDisparados, encolados: totalNotif, enviados: totalSent });
};
