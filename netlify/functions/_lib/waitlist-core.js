// =============================================================================
// _lib/waitlist-core.js — el NÚCLEO de la lista de espera (WL-1)
//
// Tres puertas mandan el mismo correo y ninguna debe tener su propia copia de
// nada: el CRON (waitlist-notify auto), el BOTÓN de Kamehouse (force) y, desde
// WL-1, el PUBLICAR de Esferas. Aquí viven el correo, el envío con ritmo, el
// marcado de la lista y el snapshot; las tres puertas sólo deciden A QUIÉN y
// CUÁNDO, nunca CÓMO.
//
// Lo que este núcleo garantiza y las puertas NO tienen que repetir:
//
//   · NADIE RECIBE DOS VECES. `eventos_waitlist.notificado` se marca fila por
//     fila, en cuanto sale su correo. Es el candado de verdad: aunque dos
//     puertas coincidan sobre el mismo evento, la segunda ya no encuentra a
//     quién mandarle. El snapshot es el candado de arriba (evita que el cron
//     ni siquiera lo intente), pero el que protege al cliente es éste.
//
//   · RITMO ANTI-429. Resend tumba las ráfagas. Se manda de uno en uno con una
//     pausa entre correos, y un 429 no se pierde: se espera más y se reintenta
//     una vez. Un correo que se cae NO marca la fila, así que vuelve a estar
//     pendiente para la siguiente corrida.
//
//   · PRESUPUESTO DE TIEMPO. Una function no vive para siempre: con la lista
//     larga, se manda lo que cabe y se CORTA limpio. Lo que quedó pendiente no
//     se pierde ni se duplica — sigue con notificado=false y el cron lo sana.
//     Por eso el corte es una salida normal, no un error.
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, RESEND_API_KEY|RESEND_KEY,
//           RESEND_FROM_ROL, URL. (El desvío de correo lo aplica correo-guard.)
// =============================================================================

const { aplicarModoPrueba } = require('./correo-guard');

const SB_URL     = "https://npgnhsmwpcipxgvfxrho.supabase.co";
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM       = process.env.RESEND_FROM_ROL || "Conecta Reynosa <admin@conectareynosa.mx>";
const SITE       = process.env.URL || "https://conectareynosa.mx";

// Ritmo: Resend acepta ~2 correos por segundo. 550 ms deja margen sin arrastrar
// la corrida. Tras un 429 se espera 4 veces eso antes del único reintento.
const PAUSA_MS = 550;
const ESPERA_429_MS = PAUSA_MS * 4;
// Cuánto tiempo se permite mandar en una sola pasada. El publicar tiene prisa
// (el admin está esperando la respuesta) y el cron puede tomarse más.
const PRESUPUESTO_PUBLICAR_MS = 6000;
const PRESUPUESTO_CRON_MS     = 20000;

// El ÚNICO significado de "a la venta" en todo el módulo: el estado vacío, la
// misma condición que el cron viene usando para la transición. Vive aquí para
// que publicar y cron no puedan tener ideas distintas de lo mismo.
const A_LA_VENTA = '';
const esALaVenta = (estado) => (estado == null ? '' : String(estado)) === A_LA_VENTA;

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

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
  // [GR-9] Un ÉXITO puede venir con el cuerpo vacío. `Prefer: return=minimal`
  // hace que PostgREST conteste 201 Created SIN cuerpo, y res.json() sobre una
  // cadena vacía revienta con "Unexpected end of JSON input". El escritor del
  // snapshot lo llamaba así: la escritura aterrizaba bien y el log gritaba
  // ERROR encima del éxito. Un ayudante que grita sobre lo que salió bien es
  // peor que uno callado — manda a buscar un problema que no existe y tapa los
  // de verdad.
  //
  // No se traga cualquier basura: vacío → null; cuerpo con algo que no es JSON
  // → se lanza CON el cuerpo recortado, para no cambiar un error ruidoso por
  // uno mudo.
  if (res.status === 204) return null;
  const texto = (await res.text()).trim();
  if (!texto) return null;
  try { return JSON.parse(texto); }
  catch (e) { throw new Error(`SB ${res.status}: respuesta no-JSON: ${texto.slice(0, 120)}`); }
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
  }[c]));
}

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

async function upsertSnapshot(rows) {
  if (!rows.length) return { insertadas: 0, actualizadas: 0, sin_cambio: 0 };

  let previos = [];
  try { previos = await sb(`eventos_estado_snapshot?select=evento_id,estado`) || []; }
  catch (e) {
    // Sin la foto previa no se puede comparar, y escribir a ciegas volvería a
    // pisar los updated_at de todos. Se avisa y no se escribe.
    console.error("[waitlist-notify] no se pudo leer el snapshot previo:", e.message);
    throw e;
  }
  const antes = new Map(previos.map(r => [r.evento_id, r.estado == null ? "" : r.estado]));

  const ahora = new Date().toISOString();
  const nuevas = rows.filter(e => !antes.has(e.id));
  const cambiadas = rows.filter(e => antes.has(e.id) && antes.get(e.id) !== (e.st || ""));

  if (nuevas.length) {
    await sb(`eventos_estado_snapshot`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(nuevas.map(e => ({ evento_id: e.id, estado: e.st || "", updated_at: ahora }))),
    });
  }
  for (const e of cambiadas) {
    await sb(`eventos_estado_snapshot?evento_id=eq.${encodeURIComponent(e.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ estado: e.st || "", updated_at: ahora }),
    });
  }
  return { insertadas: nuevas.length, actualizadas: cambiadas.length,
           sin_cambio: rows.length - nuevas.length - cambiadas.length };
}

// Manda UN correo. Devuelve { ok, status } — el status importa: un 429 no es un
// fallo cualquiera, es "vas muy rápido", y se reintenta una sola vez.
async function enviarCorreo(to, subject, html) {
  if (!RESEND_KEY) { console.warn("[waitlist-core] RESEND no configurado, skip:", to); return { ok: false, status: 0 }; }
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const pegar = () => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });

  let res = await pegar();
  if (res.status === 429) {
    // Único reintento, con la espera larga. Si vuelve a caer, la fila se queda
    // pendiente y la sana la siguiente corrida: mejor tarde que doble.
    await dormir(ESPERA_429_MS);
    res = await pegar();
  }
  if (!res.ok) { console.error("[waitlist-core] Resend:", res.status, await res.text().catch(() => '')); return { ok: false, status: res.status }; }
  return { ok: true, status: res.status };
}

// Avisa a los PENDIENTES de un evento, con ritmo y con reloj.
//
// `datos` trae lo que se imprime en el correo. Ojo con de dónde sale: al
// publicar NO puede salir del catálogo desplegado (ese index todavía es el
// viejo — el deploy va detrás del commit), sale de la fila de Supabase que se
// acaba de compilar. El cron sí lee el catálogo, porque para él ya es el
// vigente. Es la misma función; cambia quién le pasa los datos.
//
// Devuelve { enviados, fallidos, total, restantes, corte }. `restantes > 0` no
// es un error: es trabajo que el cron va a terminar.
async function notificarEvento({ evento_id, nombre, fecha, venue, promo, presupuestoMs = PRESUPUESTO_CRON_MS, pausaMs = PAUSA_MS }) {
  const filas = await sb(`eventos_waitlist?evento_id=eq.${encodeURIComponent(evento_id)}&notificado=eq.false&select=id,nombre,email`);
  const lista = Array.isArray(filas) ? filas : [];
  if (!lista.length) return { enviados: 0, fallidos: 0, total: 0, restantes: 0, corte: false };

  const link = `${SITE}/${encodeURIComponent(evento_id)}`;
  const subject = `¡Ya está disponible ${nombre}!`;
  const t0 = Date.now();
  let enviados = 0, fallidos = 0, i = 0;

  for (; i < lista.length; i++) {
    if (Date.now() - t0 > presupuestoMs) break;          // corte limpio, sin perder a nadie
    if (i > 0) await dormir(pausaMs);                    // el ritmo va ENTRE correos
    const r = lista[i];
    const html = emailTemplate({ nombre: r.nombre, evento_nombre: nombre, fecha, venue, link, promo });
    const env = await enviarCorreo(r.email, subject, html);
    if (!env.ok) { fallidos++; continue; }               // sin marcar: sigue pendiente
    enviados++;
    try {
      await sb(`eventos_waitlist?id=eq.${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notificado: true, notificado_at: new Date().toISOString() }),
      });
    } catch (e) {
      // El correo YA salió. Si la marca falla, esa persona podría recibir un
      // segundo correo en la siguiente corrida — feo, pero infinitamente mejor
      // que no avisarle nunca. Queda gritado en el log.
      console.error("[waitlist-core] correo enviado pero NO se marcó notificado:", r.id, e.message);
    }
  }

  return { enviados, fallidos, total: lista.length, restantes: lista.length - i, corte: i < lista.length };
}

// Los HUÉRFANOS: filas que siguen pendientes de un evento al que YA se le avisó
// alguna vez. Se reconoce por la propia lista, sin columna nueva: si un evento
// tiene al menos una fila notificada, es que su aviso ya salió, y lo que quedó
// en false es cola —un corte por presupuesto, un 429 terco, alguien que se
// suscribió tarde—, no una lista virgen.
//
// Esto NO toca la siembra callada de GR-8: un evento que el vigilante descubrió
// solo y nunca avisó tiene CERO filas notificadas, así que jamás entra aquí. La
// protección sigue exactamente donde estaba.
async function eventosHuerfanos() {
  const filas = await sb(`eventos_waitlist?select=evento_id,evento_nombre,notificado`);
  const lista = Array.isArray(filas) ? filas : [];
  const conAviso = new Set(), conPendiente = new Map();
  for (const f of lista) {
    if (!f || !f.evento_id) continue;
    if (f.notificado === true) conAviso.add(f.evento_id);
    else if (!conPendiente.has(f.evento_id)) conPendiente.set(f.evento_id, f.evento_nombre || f.evento_id);
  }
  const out = [];
  for (const [evento_id, evento_nombre] of conPendiente) {
    if (conAviso.has(evento_id)) out.push({ evento_id, evento_nombre });
  }
  return out;
}

module.exports = {
  sb, escapeHtml, emailTemplate, upsertSnapshot,
  enviarCorreo, notificarEvento, eventosHuerfanos,
  esALaVenta, A_LA_VENTA,
  PAUSA_MS, ESPERA_429_MS, PRESUPUESTO_PUBLICAR_MS, PRESUPUESTO_CRON_MS,
};
