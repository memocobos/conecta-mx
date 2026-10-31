// =============================================================================
// _lib/correo-ajuste.js — [VIAJERO-EDITA-1 / VIAJERO-MUDAR-1] (28-oct-2026)
//
// El aviso al cliente cuando el equipo CORRIGE su viaje o lo MUEVE de fecha.
//
// Palabra de Memo (28-oct), citada: la casilla de aviso **nace APAGADA**. La
// mayoría de las correcciones son dedazos internos que no vale la pena
// anunciar —y hoy hay 1,303 filas sin total: prender el aviso por default
// mandaría mil correos el día que se completen—; cuando sí importa (el total
// le subió, su viaje cambió de día) Bulma prende la casilla y sale ESTO.
//
// 🔒 LO QUE CAMBIÓ SE DICE CON PALABRAS, Y LAS PALABRAS LAS DA EL EDITOR.
// Este lib no decide qué cambió ni lo vuelve a calcular: recibe la lista de
// cambios que el PATCH acabó de escribir. Un correo que recalculara por su
// cuenta podría contar una historia distinta de la que quedó en la base.
//
// 🔒 EL DINERO SE LE PREGUNTA A `saldoMigrado` (el dueño). Si no se puede leer,
// NO SE MANDA: un correo que dice «tu total ahora es X» sin poder decir cuánto
// lleva pagado y cuánto le falta deja al cliente peor que el silencio.
//
// 🔒 JAMÁS LANZA Y JAMÁS TUMBA LA EDICIÓN. El cambio ya está escrito en la base
// cuando esto corre; el correo es su consecuencia, nunca su condición. Si
// Resend se cae, la pantalla lo DICE y ofrece el WhatsApp — y no se sella nada
// (la lección de RECHAZO-AVISO-1: sellar sin mandar deja a alguien marcado
// como avisado).
// =============================================================================
const { aplicarModoPrueba } = require('./correo-guard');

const FROM = 'Conecta Reynosa <admin@conectareynosa.mx>';
const PORTAL = 'https://conectareynosa.mx/portal';
const WA = '528119771072';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mxn = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');

// `modo`: 'ajuste' (se corrigió algo de su viaje) · 'mudanza' (cambió de fecha).
// [ZONA-AVISO-1] `zona` = { de, a, totalCambio } cuando el ajuste MOVIÓ su zona
// (palabra de Memo, 30-oct: «establécelo para siempre que se corrija una zona …
// en preventas o ventas calientes nos funciona mucho»). Las dos zonas las da el
// editor (lo que el PATCH escribió), no se recalculan aquí.
function renderAjuste({ modo, nombre, correo, evento, fecha, fechaAntes, cambios, cuenta, nota, zona }) {
  const primer = (String(nombre || '').trim().split(/\s+/)[0]) || 'Hola';
  const esMudanza = modo === 'mudanza';
  const esZona = !esMudanza && zona && zona.a;
  const subject = esMudanza
    ? `Tu viaje cambió de fecha · ${evento}`
    : (esZona ? `Tu lugar cambió de zona · ${evento}` : `Actualizamos tu viaje · ${evento}`);
  const celda = 'padding:8px 10px;border-bottom:1px solid #333333;color:#ffffff;font-size:14px';
  const fila = (a, b) => `<tr><td style="${celda};color:#b3b3b3">${esc(a)}</td><td style="${celda};text-align:right"><b style="color:#ffffff">${b}</b></td></tr>`;
  // Los cambios, TAL CUAL los escribió el editor. Es la misma frase que quedó
  // ANEXADA en sus notas: lo que el cliente lee y lo que el equipo ve coinciden.
  // En el aviso de zona, la zona se dice en su propio recuadro: la frase cruda
  // «zona «X» → «Y»» no se repite en la lista.
  const lista = (Array.isArray(cambios) ? cambios : []).filter(Boolean)
    .filter((c) => !(esZona && /^zona «/.test(c)));
  const bloqueCambios = lista.length
    ? `<ul style="margin:0 0 18px;padding-left:20px;color:#ffffff">${lista.map((c) => `<li style="margin:0 0 6px">${esc(c)}</li>`).join('')}</ul>`
    : '';
  const encabezado = esMudanza
    ? `<p style="margin:0 0 14px;color:#ffffff">Tu lugar en <b style="color:#e8ff4c">${esc(evento)}</b> se movió${fechaAntes ? ' de <b>' + esc(fechaAntes) + '</b>' : ''}${fecha ? ' a <b style="color:#e8ff4c">' + esc(fecha) + '</b>' : ''}. <b>Tu dinero se fue contigo completo</b>: no se perdió ningún pago.</p>`
    : esZona
      ? `<p style="margin:0 0 14px;color:#ffffff">Hicimos un ajuste en tu lugar para <b style="color:#e8ff4c">${esc(evento)}</b>${fecha ? ' (' + esc(fecha) + ')' : ''}. Tu boleto ahora es en otra zona:</p>
         <table style="width:100%;border-collapse:collapse;margin:0 0 16px"><tr>
           ${zona.de ? `<td style="padding:14px;background:#1a1a1a;border:1px solid #333333;text-align:center;color:#b3b3b3;font-size:13px">Antes<br><span style="font-size:18px;color:#b3b3b3;text-decoration:line-through">${esc(zona.de)}</span></td>
           <td style="padding:0 8px;text-align:center;color:#e8ff4c;font-size:22px">→</td>` : ''}
           <td style="padding:14px;background:#1a1a1a;border:2px solid #e8ff4c;text-align:center;color:#ffffff;font-size:13px">Ahora<br><b style="font-size:20px;color:#e8ff4c">${esc(zona.a)}</b></td>
         </tr></table>
         ${zona.totalCambio ? '' : '<p style="margin:0 0 14px;color:#ffffff"><b>Tu paquete y tu precio siguen igual</b>: no tienes que pagar nada extra y tus pagos siguen contando completos.</p>'}
         ${lista.length ? '<p style="margin:0 0 8px;color:#ffffff">También cambió:</p>' : ''}`
      : `<p style="margin:0 0 14px;color:#ffffff">Actualizamos los datos de tu viaje a <b style="color:#e8ff4c">${esc(evento)}</b>${fecha ? ' (' + esc(fecha) + ')' : ''}. Esto es lo que cambió:</p>`;
  const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000000;color:#ffffff">
        <div style="background:#e8ff4c;color:#000000;padding:18px 22px;border-bottom:4px solid #ff283b">
          <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#000000">Conecta Reynosa · ${esc(evento)}</div>
          <div style="font-size:24px;font-weight:900;margin-top:4px;color:#000000">${esc(primer)}, ${esMudanza ? 'tu viaje cambió de fecha' : (esZona ? 'tu lugar cambió de zona' : 'actualizamos tu viaje')}</div>
        </div>
        <div style="padding:22px;font-size:15px;line-height:1.6;color:#ffffff">
          ${encabezado}
          ${bloqueCambios}
          ${nota ? `<p style="margin:0 0 16px;padding:12px 14px;border-left:4px solid #e8ff4c;background:#1a1a1a;color:#ffffff">${esc(nota)}</p>` : ''}
          <table style="width:100%;border-collapse:collapse;margin:0 0 18px">
            ${fila('Total de tu viaje', mxn(cuenta.total))}
            ${fila('Lo que llevas pagado', mxn(cuenta.abonado))}
            ${fila('Te falta', mxn(Math.max(0, cuenta.resta)))}
          </table>
          <p style="margin:0 0 20px;color:#ffffff">En tu <b>Portal</b> ves tu plan de pagos al día, con las fechas de cada quincena.</p>
          <p style="margin:0 0 12px;text-align:center"><a href="${PORTAL}" style="display:inline-block;background:#e8ff4c;color:#000000;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:8px;font-size:15px">Ver mi plan en el Portal →</a></p>
          <p style="margin:18px 0 0;font-size:13px;color:#b3b3b3">Entra con este mismo correo (<span style="color:#e8ff4c">${esc(correo)}</span>). Si algo no cuadra, escríbenos al <a href="https://wa.me/${WA}" style="color:#e8ff4c">81 1977 1072</a> y lo revisamos.</p>
        </div>
      </div>`;
  return { to: correo, subject, html };
}

// Lo llaman `viajero_editar_full` y `viajero_mudar_fecha` DESPUÉS de escribir.
//   v        : la fila de viajeros_evento YA actualizada (la que devolvió el PATCH)
//   cambios  : las frases que el editor acabó de anexar a sus notas
//   modo     : 'ajuste' | 'mudanza'
//   fechaAntes: solo en mudanza — el texto de la fecha de donde venía
async function avisarAjuste({ v, cambios, modo, fechaAntes, nota, zona, KH_URL, KH_KEY }) {
  const out = { ok: false, enviado: null, aviso: null };
  try {
    if (!v) return Object.assign(out, { aviso: 'sin viajero' });
    const correo = String(v.correo || '').trim().toLowerCase();
    // Sin correo no hay a quién: se DICE, para que la pantalla ofrezca WhatsApp.
    if (!correo) return Object.assign(out, { aviso: 'ese viajero no tiene correo: avísale por WhatsApp' });
    const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
    // El dinero, por su dueño. Sin poder leerlo NO se manda (ver cabecera).
    const aR = await fetch(`${KH_URL}/rest/v1/abonos_viajero?viajero_id=eq.${v.id}&select=monto&limit=1000`, { headers: h });
    if (!aR.ok) return Object.assign(out, { aviso: 'no pude leer sus pagos: no se mandó el correo' });
    const { saldoMigrado } = require('./cuenta-evento');
    const cuenta = saldoMigrado(v, await aR.json());
    if (!cuenta) return Object.assign(out, { aviso: 'no pude contar su dinero: no se mandó el correo' });
    // El nombre del evento y su fecha se DERIVAN del catálogo servido. Sin
    // catálogo sale igual con el slug: el aviso de un cambio de dinero no se
    // calla por no poder adornar el encabezado — pero en una MUDANZA la fecha
    // ES el cambio, así que ahí sí se detiene.
    let evNombre = String(v.evento_id || '').split('#')[0], evFecha = '';
    try {
      const { fetchEventosRaw } = require('./catalogo-index');
      const EV = await fetchEventosRaw();
      const ev = Array.isArray(EV) ? EV.find((e) => e && e.id === String(v.evento_id).split('#')[0]) : null;
      // [FECHA-CORREO-1] la fecha de SU #N (en mudanza, la del DESTINO — que es
      // justo el cambio), no el `f` global con todas las fechas del multifecha.
      if (ev) { evNombre = ev.a || ev.id; evFecha = require('./fecha-evento').fechaDeEventoId(ev, v.evento_id); }
    } catch (_) { /* fail-soft: queda el slug */ }
    if (modo === 'mudanza' && !evFecha && !fechaAntes) {
      return Object.assign(out, { aviso: 'no pude leer las fechas del catálogo: no se mandó el correo de la mudanza' });
    }
    const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
    if (!RESEND_KEY) return Object.assign(out, { aviso: 'falta RESEND_API_KEY: avísale por WhatsApp' });
    const r = renderAjuste({
      modo, nombre: v.nombre, correo, evento: evNombre, fecha: evFecha, fechaAntes,
      cambios, cuenta, nota, zona,
    });
    const mp = aplicarModoPrueba({ to: [r.to], subject: r.subject });
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: mp.to, subject: mp.subject, html: r.html }),
    });
    if (!resp.ok) return Object.assign(out, { aviso: 'Resend rechazó el correo (' + resp.status + '): avísale por WhatsApp' });
    let email_id = null;
    try { email_id = (await resp.json()).id || null; } catch (_) { /* el id es cortesía */ }
    return Object.assign(out, { ok: true, enviado: correo, email_id });
  } catch (e) {
    return Object.assign(out, { aviso: 'el correo no salió: ' + (e && e.message) });
  }
}

module.exports = { avisarAjuste, renderAjuste };
