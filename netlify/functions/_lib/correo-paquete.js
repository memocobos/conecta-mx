// =============================================================================
// _lib/correo-paquete.js — [PREVENTA-PORTAL-2] la respuesta a «Elegir mi
// paquete» llega por CORREO (y el Portal la pinta). (27-oct-2026)
//
// Palabra de Memo: «el equipo te confirma por WhatsApp… debería ser por correo
// y en el portal». Cuando Bulma/Milk CIERRAN la solicitud tipo 'paquete' en la
// bandeja, sale UN correo:
//   · atendida  → «Tu paquete quedó confirmado»: paquete, zona, total, pagado y
//                 lo que falta (contados por `saldoMigrado`, el dueño del
//                 dinero — aquí no se suma un abono), + botón al Portal; si el
//                 contrato está vivo, el mismo correo dice que ahí se firma (el
//                 contrato NO manda un segundo correo: la bandeja lo pide sin
//                 correo, un aviso por decisión).
//   · rechazada → «No pudimos aplicar tu elección»: el MOTIVO que escribió el
//                 equipo + «elige otra opción en tu Portal».
// 🔒 JAMÁS lanza: el correo es consecuencia de la decisión, nunca su condición.
// =============================================================================
const { aplicarModoPrueba } = require('./correo-guard');
const { CONTRATO_CLIENTE_VIVO } = require('./contrato-cliente');

const FROM = 'Conecta Reynosa <admin@conectareynosa.mx>';
const PORTAL = 'https://conectareynosa.mx/portal';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mxn = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
const PAQ = { plus: 'PLUS · Todo incluido', stay: 'STAY · Sin transporte', ride: 'RIDE · Sin boleto', cheap: 'CHEAP · Solo boleto' };

function renderPaquete({ estado, nombre, correo, evento, fecha, paquete, zona, hotel, cuenta, motivo, contratoVivo }) {
  const primer = (String(nombre || '').trim().split(/\s+/)[0]) || 'Hola';
  const ok = estado === 'atendida';
  const subject = ok ? `Tu paquete quedó confirmado · ${evento}` : `Sobre tu elección de paquete · ${evento}`;
  const celda = 'padding:8px 10px;border-bottom:1px solid #333333;color:#ffffff;font-size:14px';
  const fila = (a, b) => `<tr><td style="${celda};color:#b3b3b3">${esc(a)}</td><td style="${celda};text-align:right"><b style="color:#ffffff">${b}</b></td></tr>`;
  const cuerpo = ok
    ? `<p style="margin:0 0 14px;color:#ffffff">Ya aplicamos tu elección para <b style="color:#e8ff4c">${esc(evento)}</b>${fecha ? ' (' + esc(fecha) + ')' : ''}. Tus $300 de la preventa ya cuentan como pago.</p>
       <table style="width:100%;border-collapse:collapse;margin:0 0 18px">
         ${fila('Paquete', esc(PAQ[paquete] || String(paquete || '').toUpperCase()))}
         ${zona ? fila('Zona', esc(zona)) : ''}
         ${hotel ? fila('Habitación', esc(hotel)) : ''}
         ${cuenta ? fila('Total', mxn(cuenta.total)) + fila('Pagado', mxn(cuenta.abonado)) + fila('Te falta', mxn(Math.max(0, cuenta.resta))) : ''}
       </table>
       <p style="margin:0 0 20px;color:#ffffff">En tu <b>Portal</b> ves tu plan y tus pagos${contratoVivo ? ', y ahí mismo <b>firmas tu contrato de viaje</b> (vas a necesitar la fecha de nacimiento del viajero y la INE de quien firma)' : ''}.</p>`
    : `<p style="margin:0 0 14px;color:#ffffff">Revisamos tu elección para <b style="color:#e8ff4c">${esc(evento)}</b> y no la pudimos aplicar:</p>
       <p style="margin:0 0 16px;padding:12px 14px;border-left:4px solid #ff283b;background:#1a1a1a;color:#ffffff">${esc(motivo || 'sin motivo')}</p>
       <p style="margin:0 0 20px;color:#ffffff">Entra a tu <b>Portal</b> y elige otra opción; tu lugar y tus $300 de la preventa siguen intactos.</p>`;
  const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000000;color:#ffffff">
        <div style="background:#e8ff4c;color:#000000;padding:18px 22px;border-bottom:4px solid #ff283b">
          <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#000000">Conecta Reynosa · ${esc(evento)}</div>
          <div style="font-size:24px;font-weight:900;margin-top:4px;color:#000000">${esc(primer)}, ${ok ? '¡tu paquete quedó confirmado!' : 'necesitamos que elijas otra opción'}</div>
        </div>
        <div style="padding:22px;font-size:15px;line-height:1.6;color:#ffffff">
          ${cuerpo}
          <p style="margin:0 0 12px;text-align:center"><a href="${PORTAL}" style="display:inline-block;background:#e8ff4c;color:#000000;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:8px;font-size:15px">${ok ? 'Ver mi plan en el Portal →' : 'Elegir otra opción →'}</a></p>
          <p style="margin:18px 0 0;font-size:13px;color:#b3b3b3">Entra con este mismo correo (<span style="color:#e8ff4c">${esc(correo)}</span>).</p>
        </div>
      </div>`;
  return { to: correo, subject, html };
}

// cambio: la fila de cambios_viajero ya cerrada (tipo 'paquete').
async function avisarPaquete({ cambio, KH_URL, KH_KEY }) {
  const out = { ok: false, enviado: null, aviso: null };
  try {
    if (!cambio || cambio.tipo !== 'paquete') return Object.assign(out, { aviso: 'no es una elección de paquete' });
    const correo = String(cambio.correo || '').trim().toLowerCase();
    if (!correo) return Object.assign(out, { aviso: 'sin correo' });
    const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
    let v = null, cuenta = null;
    const vR = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=eq.${cambio.viajero_id}&select=id,nombre,evento_id,tipo_paquete,zona_boleto,total_contrato,abonado_previo&limit=1`, { headers: h });
    if (vR.ok) v = (await vR.json())[0] || null;
    if (cambio.estado === 'atendida') {
      // El correo de «confirmado» dice el dinero real: si no se puede leer, no se manda.
      if (!v) return Object.assign(out, { aviso: 'no pude leer al viajero: no se mandó el correo' });
      const aR = await fetch(`${KH_URL}/rest/v1/abonos_viajero?viajero_id=eq.${v.id}&select=monto&limit=1000`, { headers: h });
      if (!aR.ok) return Object.assign(out, { aviso: 'no pude leer sus pagos: no se mandó el correo' });
      const { saldoMigrado } = require('./cuenta-evento');
      cuenta = saldoMigrado(v, await aR.json());
    }
    const { fetchEventosRaw } = require('./catalogo-index');
    const EV = await fetchEventosRaw();
    const ev = Array.isArray(EV) ? EV.find((e) => e && e.id === String(cambio.evento_id).split('#')[0]) : null;
    if (!ev) return Object.assign(out, { aviso: 'no pude leer el catálogo: no se mandó el correo' });
    const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
    if (!RESEND_KEY) return Object.assign(out, { aviso: 'falta RESEND_API_KEY: avísale por WhatsApp' });
    const r = renderPaquete({
      estado: cambio.estado, nombre: (v && v.nombre) || cambio.nombre, correo,
      // [FECHA-CORREO-1] la fecha de SU #N — en un multifecha el `f` global
      // trae TODAS las fechas y confunde (palabra de Memo, 30-oct).
      evento: ev.a || ev.id, fecha: require('./fecha-evento').fechaDeEventoId(ev, (v && v.evento_id) || cambio.evento_id),
      paquete: (v && v.tipo_paquete) || cambio.paquete_pedido, zona: (v && v.zona_boleto) || cambio.zona_pedida,
      hotel: cambio.hotel_pedido, cuenta, motivo: cambio.respuesta, contratoVivo: CONTRATO_CLIENTE_VIVO,
    });
    const mp = aplicarModoPrueba({ to: [r.to], subject: r.subject });
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: mp.to, subject: mp.subject, html: r.html }) });
    if (!resp.ok) return Object.assign(out, { aviso: 'Resend rechazó el correo (' + resp.status + ')' });
    return Object.assign(out, { ok: true, enviado: correo });
  } catch (e) {
    return Object.assign(out, { aviso: 'el correo no salió: ' + (e && e.message) });
  }
}

module.exports = { avisarPaquete, renderPaquete };
