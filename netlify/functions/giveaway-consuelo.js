// giveaway-consuelo.js — [MEL-1] El correo de consolación del sorteo de Melanie.
// Un correo corto a los registrados que NO ganaron, con el código MELANIE (30%
// de descuento, muere hoy a las 8:00 PM de Reynosa).
//
// PRIVADA (x-admin-token), como giveaway-sortear: esto le escribe a 88 personas
// reales. Un endpoint abierto sería un botón de spam con el membrete de la casa.
// No es cron: lo dispara Memo cuando Jane da el visto al render.
//
// [GVW-1] IDEMPOTENTE: `consuelo_at` marca a quien ya recibió. Correr dos veces
// NO duplica. Mismo patrón que giveaway-recordatorio, con una diferencia que
// importa (ver DEDUP abajo).
//
// DEDUP POR CORREO — 89 filas, 88 personas. Medido en el padrón real: una
// persona se registró DOS VECES con el mismo correo y el mismo nombre. Mandar
// por FILA le habría dado dos correos de "no ganaste" a la misma persona. Se
// manda una vez por correo distinto, y al marcar se marcan TODAS las filas de
// ese correo — si solo se marcara la fila enviada, la otra quedaría suelta y el
// reintento se la mandaría de nuevo, que es exactamente lo que la marca evita.

const G = require('./_lib/giveaway');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM = process.env.RESEND_FROM_CONTRATOS
  || process.env.RESEND_FROM_ROL
  || 'Conecta Reynosa <admin@conectareynosa.mx>';
const SITE = process.env.URL || 'https://conectareynosa.mx';

const CODIGO = 'MELANIE';
// El mismo instante que PROMOS['MELANIE'] en index.html. Reynosa es zona
// fronteriza (America/Matamoros, UTC-5 en agosto), NO Monterrey (UTC-6): el
// offset va explícito para que el correo y el cotizador mueran a la misma hora.
const MUERE = '2026-08-05T20:00:00-05:00';

const ASUNTO = 'No ganaste el sorteo… pero te tenemos algo 💜';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function correoHtml(nombre, link) {
  const primero = String(nombre || '').trim().split(/\s+/)[0] || 'Hola';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(ASUNTO)}</title></head>
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
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:10px">No salió tu nombre</div>
        <h1 style="font-family:Arial Black,Arial,sans-serif;font-size:32px;line-height:1.05;color:#e8ff4c;text-transform:uppercase;margin:0 0 16px 0">${escapeHtml(primero)}, no te vamos a dejar con las ganas</h1>
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,.85);margin:0 0 16px 0">Sabemos que duele no haber ganado el boleto para Melanie Martinez… pero te tenemos algo: usa el código <strong style="color:#e8ff4c">${CODIGO}</strong> y llévate el <strong style="color:#e8ff4c">30% de descuento</strong> en el paquete que más te guste.</p>
        <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,.85);margin:0 0 20px 0">Aplica en <strong>PLUS</strong>, <strong>STAY</strong> y <strong>CHEAP</strong> (no aplica en RIDE).</p>
      </td></tr>
      <tr><td style="padding:0 26px 20px 26px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000;border:1px dashed #e8ff4c">
          <tr><td style="padding:18px 20px;text-align:center">
            <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:8px">Tu código</div>
            <div style="font-family:Arial Black,Arial,sans-serif;font-size:30px;letter-spacing:.14em;color:#e8ff4c">${CODIGO}</div>
            <div style="font-size:13px;color:#ff283b;font-weight:700;margin-top:10px">Válido solo HOY hasta las 8:00 PM</div>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 26px 10px 26px">
        <a href="${link}" style="display:block;width:100%;background:#e8ff4c;color:#000;padding:18px 20px;text-align:center;font-weight:900;font-size:16px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;box-sizing:border-box">Usar mi 30% de descuento</a>
      </td></tr>
      <tr><td style="padding:6px 26px 28px 26px">
        <p style="font-size:14px;line-height:1.55;color:rgba(255,255,255,.7);margin:0;text-align:center">El concierto es <strong style="color:#fff">mañana</strong> — todavía alcanzas. 🖤</p>
      </td></tr>
      <tr><td style="background:#000;padding:18px 26px;border-top:1px solid rgba(255,255,255,.1);text-align:center">
        <div style="font-size:10px;color:rgba(255,255,255,.32);letter-spacing:.18em;text-transform:uppercase">Conecta Reynosa · conectareynosa.mx</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

async function enviar(to, subject, html) {
  if (!RESEND_KEY) { console.warn('[giveaway-consuelo] sin RESEND_KEY, no se manda a', to); return false; }
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!r.ok) { console.error('[giveaway-consuelo] Resend', r.status, await r.text().catch(() => '')); return false; }
  return true;
}

exports.handler = async (event) => {
  const origin = G.corsCheck(event);
  if (origin === null) return G.json(403, {}, { ok: false, error: 'origen no permitido' });
  const headers = G.cabeceras(origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return G.json(405, headers, { ok: false, error: 'método no permitido' });
  if (!G.tokenAdminValido(event)) return G.json(401, headers, { ok: false, error: 'Token inválido' });

  const falta = G.faltaEnv();
  if (falta) { console.error('[giveaway-consuelo]', falta); return G.json(500, headers, { ok: false, error: falta }); }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { /* {} */ }
  // `seco:true` = ensayo. Mide a quién le tocaría y NO manda ni marca nada.
  const seco = body.seco === true;

  // El código ya vencido no se anuncia: sería mandar 88 correos a una promoción
  // muerta. Se puede forzar con `aunqueVencido` para una prueba.
  if (Date.now() > Date.parse(MUERE) && body.aunqueVencido !== true) {
    return G.json(409, headers, { ok: false, error: 'el código ya venció; no se manda nada' });
  }

  // ── El ganador, para excluirlo. ────────────────────────────────────────────
  // Con ASERCIÓN: si no se puede identificar, se ABORTA. Un fallo silencioso
  // aquí le manda "no ganaste" AL QUE SÍ GANÓ.
  let ganadorId = null;
  try {
    const r = await fetch(
      `${G.SB_URL}/rest/v1/giveaway_sorteos?slug=eq.${encodeURIComponent(G.SLUG)}`
      + `&registro_id=not.is.null&select=registro_id,intento&order=intento.desc&limit=1`,
      { headers: G.sbHeaders() }
    );
    if (!r.ok) throw new Error('lectura sorteos ' + r.status);
    const filas = await r.json().catch(() => []);
    ganadorId = (filas[0] || {}).registro_id || null;
  } catch (e) {
    console.error('[giveaway-consuelo] no se pudo leer el sorteo:', e.message);
    return G.json(502, headers, { ok: false, error: 'no se pudo leer el sorteo' });
  }
  if (!ganadorId) {
    // Nunca "por si acaso mandamos a todos": mejor no mandar nada.
    return G.json(409, headers, { ok: false, error: 'sin ganador identificado; no se manda nada' });
  }

  // ── El padrón pendiente. ───────────────────────────────────────────────────
  let filas = [];
  try {
    const r = await fetch(
      `${G.SB_URL}/rest/v1/giveaway_registros?slug=eq.${encodeURIComponent(G.SLUG)}`
      + `&consuelo_at=is.null&select=id,nombre,correo`,
      { headers: G.sbHeaders() }
    );
    if (!r.ok) throw new Error('lectura ' + r.status);
    filas = await r.json().catch(() => []);
  } catch (e) {
    console.error('[giveaway-consuelo] no se pudo leer el padrón:', e.message);
    return G.json(502, headers, { ok: false, error: 'lectura fallida' });
  }
  if (!Array.isArray(filas)) filas = [];

  // ── Agrupar por correo (una persona, un envío). ────────────────────────────
  const porCorreo = new Map();
  let excluidoGanador = 0, sinCorreo = 0;
  for (const f of filas) {
    if (f && f.id === ganadorId) { excluidoGanador++; continue; }   // el ganador NO recibe
    const correo = String((f && f.correo) || '').trim().toLowerCase();
    if (!correo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) { sinCorreo++; continue; }
    if (!porCorreo.has(correo)) porCorreo.set(correo, { nombre: f.nombre, ids: [] });
    porCorreo.get(correo).ids.push(f.id);
  }

  const destinatarios = [...porCorreo.entries()];
  if (seco) {
    return G.json(200, headers, {
      ok: true, ensayo: true,
      pendientes_filas: filas.length,
      excluido_ganador: excluidoGanador,
      sin_correo: sinCorreo,
      destinatarios: destinatarios.length,
      filas_a_marcar: destinatarios.reduce((a, [, v]) => a + v.ids.length, 0),
    });
  }

  const link = SITE + '/melanie';
  let enviados = 0, fallidos = 0, sinMarcar = 0, filasMarcadas = 0;

  // Uno por uno y en serie: un buzón malo no puede tumbar al resto.
  for (const [correo, info] of destinatarios) {
    const ok = await enviar(correo, ASUNTO, correoHtml(info.nombre, link));
    if (!ok) { fallidos++; continue; }
    enviados++;

    // [GVW-1] Marcar INMEDIATAMENTE después del envío, no en lote al final: si
    // la corrida se muere a la mitad, los que ya recibieron quedan marcados y
    // el reintento arranca donde se quedó. Se marcan TODAS las filas de este
    // correo (ver DEDUP arriba).
    const sello = new Date().toISOString();
    for (const id of info.ids) {
      try {
        const p = await fetch(
          `${G.SB_URL}/rest/v1/giveaway_registros?id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH',
            headers: { ...G.sbHeaders(), Prefer: 'return=minimal' },
            body: JSON.stringify({ consuelo_at: sello }) }
        );
        if (!p.ok) throw new Error('PATCH ' + p.status);
        filasMarcadas++;
      } catch (e) {
        sinMarcar++;
        console.error(`[giveaway-consuelo] ENVIADO PERO SIN MARCAR id=${id}: ${e.message}`);
      }
    }
  }

  console.log(`[giveaway-consuelo] destinatarios ${destinatarios.length} · enviados ${enviados}`
    + ` · fallidos ${fallidos} · sin correo ${sinCorreo} · ganador excluido ${excluidoGanador}`
    + ` · filas marcadas ${filasMarcadas} · sin marcar ${sinMarcar}`);

  return G.json(200, headers, { ok: true,
    destinatarios: destinatarios.length, enviados, fallidos,
    sin_correo: sinCorreo, excluido_ganador: excluidoGanador,
    filas_marcadas: filasMarcadas, sin_marcar: sinMarcar });
};
