// netlify/functions/recordatorio-eventos-diario.js
// (U3 / DC2c-B — recordatorio "tu evento es pronto" para coordis)
//
// Cron diario disparado por el schedule en netlify.toml. BAJO RIESGO: solo
// notifica (campanita in-app + correo). NUNCA aplica strikes ni toca finanzas.
//
// Lee eventos_meta (tabla espejo por SLUG, U1) y avisa a los coordis que
// ACEPTARON cada evento que cae dentro de la ventana [hoy+1, hoy+DIAS_ANTES].
//
// El cron INSERTA notificaciones directo con service_role (no por la función
// notificaciones.js, que exige JWT). Dedup por (usuario, tipo='recordatorio',
// ref=<slug>) para no repetir el aviso.
//
// dry_run (?dry_run=1 o body {dry_run:true}): NO inserta NI manda correos;
// solo arma y devuelve la lista de avisos que MANDARÍA.

const { aplicarModoPrueba } = require('./_lib/correo-guard');

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

// Días antes del evento (por su `fecha` de inicio) en que se avisa.
const DIAS_ANTES = 3;

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...HEADERS, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`SB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function enviarCorreo(to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return;
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Kamehouse <kamehouse@conectareynosa.mx>", to, subject, html }),
  }).catch((e) => console.error("Email:", e.message));
}

// ── Helpers de fecha (México = UTC-6 sin DST) ──────────────────────────
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Medianoche (00:00) del día de HOY en hora México, expresada como objeto Date.
function _hoyMX() {
  const mx = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return new Date(Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), mx.getUTCDate()));
}

// Suma N días a un Date base y lo devuelve como string YYYY-MM-DD.
function _fechaStr(base, addDays) {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString().split("T")[0];
}

// "2026-06-12" → "12 de junio". Parseo por partes para evitar líos de zona.
function _fechaBonita(s) {
  if (typeof s !== "string") return "";
  const parts = s.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return s;
  const [, mo, da] = parts;
  return `${da} de ${MESES[mo - 1] || ""}`.trim();
}

function _correoHTML(nombre, evento, fechaBonita) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px">
    <h2 style="color:#FF6B00">Tu evento es pronto</h2>
    <p>Hola <strong>${nombre}</strong>,</p>
    <p>El evento <strong>${evento}</strong> es el <strong>${fechaBonita}</strong>.</p>
    <p>Entra al Kamehouse y revisa tu perfil para ver tu grupo y descargar las listas.</p>
    <p style="margin-top:16px">No olvides pasar a <strong>Torre de Karin</strong> a recoger los kits antes del evento.</p>
    <p style="color:#888899;font-size:12px;margin-top:32px">Conecta Reynosa · conectareynosa.mx</p>
  </div>`;
}

exports.handler = async function (event) {
  console.log("[recordatorio-eventos] Iniciando:", new Date().toISOString());
  if (!SB_KEY || !SB_URL) {
    console.error("[recordatorio-eventos] Falta SUPABASE_SERVICE_KEY_KAMEHOUSE o URL");
    return { statusCode: 500, body: "Config faltante" };
  }

  // dry_run por query string (?dry_run=1) o por body ({dry_run:true}).
  let dryRun = (event && event.queryStringParameters && event.queryStringParameters.dry_run === "1");
  if (!dryRun && event && event.body) {
    try { dryRun = JSON.parse(event.body).dry_run === true; } catch { /* body no-JSON */ }
  }

  const hoy = _hoyMX();
  const desde = _fechaStr(hoy, 1);              // hoy + 1
  const hasta = _fechaStr(hoy, DIAS_ANTES);     // hoy + DIAS_ANTES (inclusive)

  // a) Eventos cuya `fecha` (inicio) cae dentro de la ventana.
  const eventos = await sb(
    `eventos_meta?fecha=gte.${desde}&fecha=lte.${hasta}&select=slug,nombre,fecha`
  ).catch((e) => { console.error("[recordatorio-eventos] eventos_meta:", e.message); return []; });

  const avisos = [];     // lo que MANDARÍA (tras dedup)
  let enviados = 0;

  for (const ev of eventos) {
    if (!ev || !ev.slug) continue;
    const slug = ev.slug;

    // b) Coordis que ACEPTARON el evento (por slug).
    const asigs = await sb(
      `eventos_coordi?evento_id=eq.${encodeURIComponent(slug)}&status=eq.aceptado&select=coordi_id`
    ).catch(() => []);
    const coordiIds = (asigs || []).map((a) => a.coordi_id).filter(Boolean);
    if (!coordiIds.length) continue;

    // c) Usuarios activos.
    const usuarios = await sb(
      `usuarios?id=in.(${coordiIds.join(",")})&select=id,nombre,correo,correo_notif,rol,activo`
    ).catch(() => []);
    const activos = (usuarios || []).filter((u) => u && u.activo !== false);

    const fechaBonita = _fechaBonita(ev.fecha);

    for (const u of activos) {
      // Fails-soft por coordi: un error en uno no aborta a los demás.
      try {
        // d) DEDUP por (usuario, tipo='recordatorio', ref=slug).
        const previo = await sb(
          `notificaciones?usuario_id=eq.${u.id}&tipo=eq.recordatorio&ref=eq.${encodeURIComponent(slug)}&select=id&limit=1`
        ).catch(() => []);
        if (previo && previo.length > 0) continue; // ya se avisó

        avisos.push({ coordi_id: u.id, nombre: u.nombre, slug, evento: ev.nombre, fecha: ev.fecha });
        if (dryRun) continue; // dry_run: NO inserta NI manda correo

        // e) INSERT notificación in-app + correo.
        await sb("notificaciones", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            usuario_id: u.id,
            tipo: "recordatorio",
            titulo: "Tu evento es pronto",
            mensaje: `${ev.nombre} es el ${fechaBonita}. Revisa tu perfil para ver tu grupo y descargar listas.`,
            link: null,
            leida: false,
            ref: slug,
            created_at: new Date().toISOString(),
          }),
        });

        const email = u.correo_notif || u.correo;
        if (email) {
          await enviarCorreo(
            email,
            `Recordatorio: ${ev.nombre} es pronto`,
            _correoHTML(u.nombre, ev.nombre, fechaBonita)
          );
        }
        enviados++;
      } catch (e) {
        console.error(`[recordatorio-eventos] coordi ${u.id} / ${slug}:`, e.message);
      }
    }
  }

  if (dryRun) {
    console.log(`[recordatorio-eventos] DRY RUN. Avisos que mandaría: ${avisos.length}`);
    return { statusCode: 200, body: JSON.stringify({ dry_run: true, avisos }) };
  }

  console.log(`[recordatorio-eventos] Fin. Enviados: ${enviados}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, enviados }) };
};
