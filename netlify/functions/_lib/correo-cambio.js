// =============================================================================
// _lib/correo-cambio.js — [CAMBIO-RECHAZO-1] el «no procede» de un cambio le
// LLEGA al cliente por correo. (30-oct-2026)
//
// Pregunta de Memo que lo parió: «¿qué pasa cuando un viajero quiere cambiar de
// lugar y yo le digo que no? ¿recibe un correo con el rechazo o algo?» — medido:
// NO recibía nada. El motivo que teclea Bulma/Milk al cerrar con «No procede»
// se guardaba en `cambios_viajero.respuesta` y ahí moría: ni correo, ni Portal.
// La misma forma que RECHAZO-AVISO-1 ya curó en requisiciones, en otra bandeja.
//
// Cubre los tipos que NO son 'paquete' (ése ya tiene su dueño, correo-paquete):
//   · hotel / zona / fecha / otro  → «Sobre tu solicitud de cambio»
//   · pago (comprobante del Portal) → «Sobre tu comprobante de pago»
// El MOTIVO viaja TAL CUAL lo tecleó el equipo — la bandeja lo dice antes del
// clic. Y el correo dice la verdad tranquilizadora: su lugar sigue como estaba.
//
// 🔒 JAMÁS lanza: el correo es consecuencia del cierre, nunca su condición.
// 🔒 Fail-soft CON el catálogo (la forma de RECHAZO-AVISO-1, no la de
//    CONSUELO-VERDAD): este correo no promete códigos ni montos derivados — sin
//    catálogo sale igual, con el nombre del evento que la fila ya trae.
// 🔒 El dinero NO se menciona en cifras: al rechazar nadie teclea montos, y un
//    número equivocado en un correo de dinero se cobra caro (ley de la casa).
// =============================================================================
const { aplicarModoPrueba } = require('./correo-guard');

const FROM = 'Conecta Reynosa <admin@conectareynosa.mx>';
const PORTAL = 'https://conectareynosa.mx/portal';
const WA_RESERVAS = 'https://wa.me/528119771072';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// (estado, tipo, nombre, correo, evento, fecha, motivo) → {to, subject, html}
// PURA: el que la llama decide si se manda. Cada celda lleva SU color — los
// clientes de correo no heredan el color del div (lección de CONFIRMA-1).
function renderCambio({ tipo, nombre, correo, evento, fecha, motivo }) {
  const primer = (String(nombre || '').trim().split(/\s+/)[0]) || 'Hola';
  const esPago = tipo === 'pago';
  const subject = (esPago ? 'Sobre tu comprobante de pago' : 'Sobre tu solicitud de cambio') + (evento ? ' · ' + evento : '');
  const quePidio = esPago ? 'Revisamos el comprobante que subiste' : 'Revisamos el cambio que nos pediste';
  const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000000;color:#ffffff">
        <div style="background:#e8ff4c;color:#000000;padding:18px 22px;border-bottom:4px solid #ff283b">
          <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#000000">Conecta Reynosa${evento ? ' · ' + esc(evento) : ''}</div>
          <div style="font-size:24px;font-weight:900;margin-top:4px;color:#000000">${esc(primer)}, ${esPago ? 'sobre tu comprobante' : 'sobre tu cambio'}</div>
        </div>
        <div style="padding:22px;font-size:15px;line-height:1.6;color:#ffffff">
          <p style="margin:0 0 14px;color:#ffffff">${quePidio}${evento ? ' para <b style="color:#e8ff4c">' + esc(evento) + '</b>' : ''}${fecha ? ' (' + esc(fecha) + ')' : ''} y esta vez no se pudo:</p>
          <p style="margin:0 0 16px;padding:12px 14px;border-left:4px solid #ff283b;background:#1a1a1a;color:#ffffff">${esc(motivo || 'sin motivo')}</p>
          <p style="margin:0 0 20px;color:#ffffff">${esPago
            ? 'Tu lugar y tus pagos ya registrados <b>siguen igual que antes</b>. Si tienes el comprobante correcto, súbelo de nuevo desde tu Portal o mándanoslo por WhatsApp.'
            : 'Tu lugar <b>sigue tal como estaba</b> — no se movió nada. Si quieres, escríbenos por WhatsApp y buscamos otra opción juntos.'}</p>
          <p style="margin:0 0 12px;text-align:center"><a href="${PORTAL}" style="display:inline-block;background:#e8ff4c;color:#000000;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:8px;font-size:15px">Ver mi viaje en el Portal →</a></p>
          <p style="margin:0 0 12px;text-align:center"><a href="${WA_RESERVAS}" style="color:#25d366;font-weight:700;text-decoration:none;font-size:14px">💬 Hablar por WhatsApp</a></p>
          <p style="margin:18px 0 0;font-size:13px;color:#b3b3b3">Entra con este mismo correo (<span style="color:#e8ff4c">${esc(correo)}</span>).</p>
        </div>
      </div>`;
  return { to: correo, subject, html };
}

// cambio: la fila de cambios_viajero YA CERRADA como 'rechazada' (tipo ≠ paquete).
// Devuelve { ok, enviado, aviso } — la MISMA forma que avisarPaquete, para que
// la bandeja los pinte con el mismo _reqCorreoTxt sin segunda lista.
async function avisarCambioRechazado({ cambio, KH_URL, KH_KEY }) {
  const out = { ok: false, enviado: null, aviso: null };
  try {
    if (!cambio || cambio.estado !== 'rechazada') return Object.assign(out, { aviso: 'solo se avisa lo rechazado' });
    if (cambio.tipo === 'paquete') return Object.assign(out, { aviso: 'el paquete tiene su propio correo' });
    const correo = String(cambio.correo || '').trim().toLowerCase();
    if (!correo) return Object.assign(out, { aviso: 'sin correo: avísale por WhatsApp' });
    // El nombre del viajero, si se puede; si no, el de la fila. Jamás frena.
    const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
    let v = null;
    try {
      const vR = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=eq.${cambio.viajero_id}&select=id,nombre,evento_id&limit=1`, { headers: h });
      if (vR.ok) v = (await vR.json())[0] || null;
    } catch (e) { /* fail-soft: el correo sale con lo que la fila trae */ }
    // El evento: catálogo si se deja leer, y si no, el slug pelado NO se enseña
    // (un «tu tour» vago es mejor que «fuerzaregida#1» crudo — ley CAPSULE-WA-1).
    let evNombre = '', evFecha = '';
    try {
      const { fetchEventosRaw } = require('./catalogo-index');
      const EV = await fetchEventosRaw();
      const idCompleto = String((v && v.evento_id) || cambio.evento_id || '');
      const ev = Array.isArray(EV) ? EV.find((e) => e && e.id === idCompleto.split('#')[0]) : null;
      if (ev) {
        evNombre = ev.a || ev.id;
        // [FECHA-CORREO-1] la fecha de SU #N, no el `f` global con todas las
        // fechas del multifecha — el dueño decide (y '' si el #N no resuelve).
        const { fechaDeEventoId } = require('./fecha-evento');
        evFecha = fechaDeEventoId(ev, idCompleto);
      }
    } catch (e) { /* fail-soft con el catálogo: sale sin nombre ni fecha */ }
    const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
    if (!RESEND_KEY) return Object.assign(out, { aviso: 'falta RESEND_API_KEY: avísale por WhatsApp' });
    const r = renderCambio({
      tipo: cambio.tipo, nombre: (v && v.nombre) || cambio.nombre, correo,
      evento: evNombre, fecha: evFecha, motivo: cambio.respuesta,
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

module.exports = { avisarCambioRechazado, renderCambio };
