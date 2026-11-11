// =============================================================================
// _lib/correo-preventa-costos.js — [PREVENTA-AUTO-1] «¡Ya hay paquetes!» a los
// de la PREVENTA A CIEGAS de un evento cuando sale a la venta. (10-nov-2026)
//
// Palabra de Memo: «una vez que tengamos los costos le debe de llegar un correo
// con ya hay paquetes». Un botón en la bandeja de Requisiciones, por evento:
//   · SECO por default (enseña a quién y el correo tal cual; cero envíos)
//   · mandar exige confirmar:true
//   · candado: el evento tiene que VENDER paquetes reales en el catálogo servido
//     (si sigue en modo preventa, no hay qué elegir → 409)
//   · bitácora `portal_recordatorios` (campaña `preventa-costos-<slug>`, UNIQUE
//     campaña+correo): nadie lo recibe dos veces; se asienta DESPUÉS del envío.
// El texto NO trae precios: los precios viven en el Portal (lista − $300).
// =============================================================================
const { aplicarModoPrueba } = require('./correo-guard');
const { PREVENTA_DESCUENTO } = require('./opciones-paquete');

const FROM = 'Conecta Reynosa <admin@conectareynosa.mx>';
const PORTAL = 'https://conectareynosa.mx/portal';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function campanaDe(slug) { return 'preventa-costos-' + String(slug || '').split('#')[0]; }

function renderPreventaCostos({ nombre, correo, evento, fecha }) {
  const primer = (String(nombre || '').trim().split(/\s+/)[0]) || 'Hola';
  const subject = `¡Ya hay paquetes para ${evento}! Elige el tuyo`;
  const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000000;color:#ffffff">
        <div style="background:#e8ff4c;color:#000000;padding:18px 22px;border-bottom:4px solid #ff283b">
          <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#000000">Conecta Reynosa · Preventa a ciegas</div>
          <div style="font-size:24px;font-weight:900;margin-top:4px;color:#000000">${esc(primer)}, ¡ya hay paquetes para ${esc(evento)}!</div>
        </div>
        <div style="padding:22px;font-size:15px;line-height:1.6;color:#ffffff">
          <p style="margin:0 0 14px;color:#ffffff">Gracias por confiar en nosotros desde la preventa. Ya salieron los costos${fecha ? ' (' + esc(fecha) + ')' : ''} y puedes elegir tu paquete, tu zona y tu habitación.</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 18px">
            <tr><td style="padding:10px 12px;border:1px solid #333333;color:#ffffff;font-size:14px">🎁 <b style="color:#e8ff4c">$${PREVENTA_DESCUENTO} de descuento</b> sobre el precio de lista de cualquier paquete y zona.</td></tr>
            <tr><td style="padding:10px 12px;border:1px solid #333333;color:#ffffff;font-size:14px">💳 Tus <b style="color:#e8ff4c">$300 de separo</b> ya cuentan como pago.</td></tr>
            <tr><td style="padding:10px 12px;border:1px solid #333333;color:#ffffff;font-size:14px">⚡ Eliges en tu Portal y tu paquete queda <b>confirmado al instante</b>.</td></tr>
          </table>
          <p style="margin:0 0 20px;color:#ffffff">Las zonas se van llenando: entre más pronto elijas, más opciones tienes.</p>
          <p style="margin:0 0 12px;text-align:center"><a href="${PORTAL}" style="display:inline-block;background:#e8ff4c;color:#000000;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:8px;font-size:15px">Elegir mi paquete →</a></p>
          <p style="margin:18px 0 0;font-size:13px;color:#b3b3b3">Entra (o regístrate si es tu primera vez) con este mismo correo: <span style="color:#e8ff4c">${esc(correo)}</span>. ¿Dudas? Escríbenos por WhatsApp al 81 1977 1072.</p>
        </div>
      </div>`;
  return { to: correo, subject, html };
}

async function enviarUno({ r, RESEND_KEY }) {
  const mp = aplicarModoPrueba({ to: [r.to], subject: r.subject });
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: mp.to, subject: mp.subject, html: r.html }) });
  if (!resp.ok) return { ok: false, aviso: 'Resend rechazó (' + resp.status + ')' };
  const j = await resp.json().catch(() => ({}));
  return { ok: true, id: j.id || null };
}

module.exports = { renderPreventaCostos, campanaDe, enviarUno };
