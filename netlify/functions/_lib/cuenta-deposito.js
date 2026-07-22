// =============================================================================
// _lib/cuenta-deposito  (Gancho 2 del machote — cuenta bancaria correcta por paquete)
//
// FUENTE ÚNICA de la regla: cuentaParaPaquete() de _lib/catalogo-index (cheap→
// Banamex SIEMPRE; ride/plus/stay→ev.banco||BBVA, con los bancos reales sembrados).
// Aquí NO se replica la regla: solo se resuelve el slug del catálogo y se pinta la
// caja del correo. Best-effort estricto: sin catálogo o sin evento → null / sin
// caja, JAMÁS una cuenta equivocada.
// =============================================================================

const { cuentaParaPaquete } = require('./catalogo-index');

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Dado un catálogo YA cargado (fetchCatalogo), el evento_id de la solicitud (slug
// o slug#idx → se usa el slug base) y su paquete, devuelve la cuenta
// { nombre, clabe, tarjeta, titular } o null si no se puede resolver con certeza.
function resolverCuentaDeCatalogo(catalogo, evento_id, paquete) {
  if (!catalogo) return null;
  const slug = String(evento_id || '').split('#')[0];
  const ce = catalogo[slug];
  if (!ce) return null;
  const c = cuentaParaPaquete(ce, paquete);
  // Exigimos al menos CLABE o tarjeta reales para no pintar una caja vacía.
  return (c && (c.clabe || c.tarjeta)) ? c : null;
}

// Caja "💳 Cuenta para tu depósito" para los correos de cobranza (tema oscuro,
// estilo de los crons). Incluye la línea de comprobante por WhatsApp. Devuelve ''
// si no hay cuenta (así el correo sale idéntico a hoy).
function cajaCuentaHtml(cuenta) {
  if (!cuenta) return '';
  const fila = (lbl, val) => `<tr>
      <td style="padding:3px 12px 3px 0;font-size:12px;color:rgba(255,255,255,.55);white-space:nowrap;vertical-align:top">${lbl}</td>
      <td style="padding:3px 0;font-size:14px;color:#fff;font-weight:700">${_esc(val)}</td>
    </tr>`;
  return `
  <div style="margin:20px 0;padding:16px 18px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(255,255,255,.03)">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#e8ff4c;font-weight:800;margin-bottom:12px">💳 Cuenta para tu depósito</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      ${cuenta.nombre  ? fila('Banco',   cuenta.nombre)  : ''}
      ${cuenta.tarjeta ? fila('Tarjeta', cuenta.tarjeta) : ''}
      ${cuenta.clabe   ? fila('CLABE',   cuenta.clabe)   : ''}
      ${cuenta.titular ? fila('Titular', cuenta.titular) : ''}
    </table>
    <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:12px;line-height:1.5">Deposita a <b>esta</b> cuenta (es la de tu paquete) y manda tu comprobante por <a href="https://wa.me/528119771072" style="color:#e8ff4c;text-decoration:none;font-weight:700">WhatsApp</a>.</div>
  </div>`;
}

module.exports = { resolverCuentaDeCatalogo, cajaCuentaHtml };
