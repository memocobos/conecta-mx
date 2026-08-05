// giveaway-recordatorio.js — cron. Un correo corto a los registrados que NO
// han sido avisados, CINCO minutos antes del sorteo, con la liga a /sorteo.
// [GVW-1] IDEMPOTENTE: `recordatorio_at` marca a quien ya recibió. Correr dos
// veces dentro de la ventana NO duplica.
//
// EL CRON CORRE DIARIO Y LA FUNCIÓN DECIDE. Netlify agenda en UTC y no entiende
// "solo el 5 de agosto", así que la guarda de fecha vive aquí: cualquier otro
// día se sale sin mandar nada y lo dice en el log. Es el patrón del resto de
// los crons de la casa.
//
// 11:55 AM de Reynosa = 16:55 UTC (America/Matamoros trae horario de verano en
// agosto). El cron va a las 16:55 UTC y se permite una ventana, porque Netlify
// no dispara al segundo exacto.

const G = require('./_lib/giveaway');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM = process.env.RESEND_FROM_CONTRATOS
  || process.env.RESEND_FROM_ROL
  || 'Conecta Reynosa <admin@conectareynosa.mx>';
const SITE = process.env.URL || 'https://conectareynosa.mx';

// El día del sorteo, en fecha pura. Sale del mismo SORTEO de _lib para que no
// haya dos fechas que mantener.
const DIA_SORTEO = String(G.SORTEO).slice(0, 10);   // '2026-08-05'
// Ventana desde que abre el disparo hasta la hora del sorteo: si Netlify se
// retrasa, el correo sigue teniendo sentido. Pasada la hora del giro, no.
const ABRE_MS = Date.parse(G.SORTEO) - 30 * 60 * 1000;   // 30 min antes
const CIERRA_MS = Date.parse(G.SORTEO);

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function correoHtml(nombre, link) {
  const primero = String(nombre || '').trim().split(/\s+/)[0] || 'Hola';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>El sorteo es en 5 minutos</title></head>
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
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:10px">Falta poco</div>
        <h1 style="font-family:Arial Black,Arial,sans-serif;font-size:34px;line-height:1;color:#e8ff4c;text-transform:uppercase;margin:0 0 14px 0">${escapeHtml(primero)}, el sorteo es a las 12</h1>
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,.85);margin:0 0 14px 0">Giramos <strong style="color:#e8ff4c">en 5 minutos</strong>, a las 12:00 PM hora de Reynosa (11:00 AM en Monterrey). Se ve en vivo desde esta página:</p>
        <p style="font-size:14px;line-height:1.55;color:rgba(255,255,255,.7);margin:0 0 24px 0">Si sales, tienes <strong>10 minutos</strong> para contestar tu WhatsApp. Tenlo a la mano.</p>
      </td></tr>
      <tr><td style="padding:8px 26px 28px 26px">
        <a href="${link}" style="display:block;width:100%;background:#e8ff4c;color:#000;padding:18px 20px;text-align:center;font-weight:900;font-size:16px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;box-sizing:border-box">Ver el sorteo en vivo</a>
      </td></tr>
      <tr><td style="background:#000;padding:18px 26px;border-top:1px solid rgba(255,255,255,.1);text-align:center">
        <div style="font-size:10px;color:rgba(255,255,255,.32);letter-spacing:.18em;text-transform:uppercase">Conecta Reynosa · conectareynosa.mx</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

async function enviar(to, subject, html) {
  if (!RESEND_KEY) { console.warn('[giveaway-recordatorio] sin RESEND_KEY, no se manda a', to); return false; }
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!r.ok) { console.error('[giveaway-recordatorio] Resend', r.status, await r.text().catch(() => '')); return false; }
  return true;
}

exports.handler = async () => {
  const ahora = Date.now();
  const hoyReynosa = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });

  if (hoyReynosa !== DIA_SORTEO) {
    console.log('[giveaway-recordatorio] hoy es', hoyReynosa, '— el sorteo es el', DIA_SORTEO, ': no se manda nada');
    return { statusCode: 200, body: JSON.stringify({ ok: true, saltado: 'otro día' }) };
  }
  if (ahora < ABRE_MS || ahora >= CIERRA_MS) {
    console.log('[giveaway-recordatorio] fuera de la ventana previa al sorteo: no se manda nada');
    return { statusCode: 200, body: JSON.stringify({ ok: true, saltado: 'fuera de ventana' }) };
  }

  const falta = G.faltaEnv();
  if (falta) { console.error('[giveaway-recordatorio]', falta); return { statusCode: 500, body: falta }; }

  // [GVW-1] Solo los que NO han sido avisados. `recordatorio_at` es la marca de
  // idempotencia: mientras esté en NULL, esa persona no ha recibido el correo.
  // Sin este filtro, una segunda corrida dentro de la ventana de 30 minutos le
  // mandaba el recordatorio OTRA VEZ a todo el padrón — medido: 90 correos para
  // 45 personas. Y no era hipotético: el botón "Run now" del panel de Netlify
  // dispara la función a mano, y la ventana dura media hora.
  let filas = [];
  try {
    const r = await fetch(
      `${G.SB_URL}/rest/v1/giveaway_registros?slug=eq.${encodeURIComponent(G.SLUG)}`
      + `&recordatorio_at=is.null&select=id,nombre,correo`,
      { headers: G.sbHeaders() }
    );
    if (!r.ok) throw new Error('lectura ' + r.status);
    filas = await r.json().catch(() => []);
  } catch (e) {
    console.error('[giveaway-recordatorio] no se pudo leer el padrón:', e.message);
    return { statusCode: 502, body: 'lectura fallida' };
  }

  const link = SITE + '/sorteo';
  let enviados = 0, fallidos = 0, sinCorreo = 0, sinMarcar = 0;
  // Uno por uno y en serie: un buzón malo no puede tumbar al resto, y un
  // padrón de cientos no debe abrir cientos de conexiones a la vez.
  for (const f of (Array.isArray(filas) ? filas : [])) {
    const correo = String((f && f.correo) || '').trim();
    // [GVW-1] Sin correo: NO se marca —no recibió nada— pero tampoco traba el
    // reintento, porque el select de arriba lo va a volver a traer y este
    // `continue` lo va a volver a saltar. Se cuenta, no se toca.
    if (!correo) { sinCorreo++; continue; }

    const ok = await enviar(correo, 'El sorteo es en 5 minutos — Conecta Reynosa', correoHtml(f.nombre, link));
    if (!ok) { fallidos++; continue; }
    enviados++;

    // [GVW-1] Se marca AQUÍ, fila por fila, inmediatamente después del envío —
    // no en lote al final. Si la corrida se muere a la mitad (timeout de la
    // lambda, deploy encima, lo que sea), los que ya recibieron quedan
    // marcados y el reintento arranca justo donde se quedó. Un lote al final
    // perdería la marca de TODOS los ya enviados y el reintento duplicaría.
    try {
      const p = await fetch(
        `${G.SB_URL}/rest/v1/giveaway_registros?id=eq.${encodeURIComponent(f.id)}`,
        { method: 'PATCH',
          headers: { ...G.sbHeaders(), Prefer: 'return=minimal' },
          body: JSON.stringify({ recordatorio_at: new Date().toISOString() }) }
      );
      if (!p.ok) throw new Error('PATCH ' + p.status);
    } catch (e) {
      // El correo YA salió y la marca no. Esta persona es la única que puede
      // recibir doble si alguien vuelve a correr. Se grita con su id para
      // poder marcarla a mano.
      sinMarcar++;
      console.error(`[giveaway-recordatorio] ENVIADO PERO SIN MARCAR id=${f && f.id}: ${e.message}`);
    }
  }

  console.log(`[giveaway-recordatorio] pendientes ${filas.length} · enviados ${enviados}`
    + ` · fallidos ${fallidos} · sin correo ${sinCorreo} · sin marcar ${sinMarcar}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, enviados, fallidos,
    sin_correo: sinCorreo, sin_marcar: sinMarcar }) };
};
