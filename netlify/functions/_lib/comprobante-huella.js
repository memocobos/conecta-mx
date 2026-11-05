// _lib/comprobante-huella.js — [COMPROBANTE-DUP-1] (5-nov-2026)
// Un comprobante que YA está registrado no vuelve a entrar desde el Portal ni
// desde el formulario de reservación. Palabra de Memo: «es para evitar estafas».
// Caso que lo destapó: Erik Rivera Cruz subió desde su Portal el MISMO archivo
// de su separo de $300 (byte a byte).
//
// La huella es el md5 de los bytes. Quien decide «ya está registrado» es la
// función de la base `comprobante_duplicado` (acta migraciones/COMPROBANTE-DUP-1.sql):
// solo cuenta un comprobante REFERENCIADO por algo vivo — requisición no
// rechazada, solicitud de pago no rechazada o abono con monto > 0. Un huérfano
// (subida cuyo INSERT falló) y una requisición rechazada que se vuelve a mandar
// con su mismo pago (el flujo de RECHAZO-AVISO-1) NO se bloquean.
//
// 🔒 Fail-OPEN, dicho: si la base no contesta, el comprobante entra igual y
// se registra en el log — de todos modos lo revisa una persona antes de que
// cuente un peso. Equivocarse hacia «bloqueo» le cerraría la puerta a un pago
// real por una lectura caída.
// 🔒 El mensaje al cliente es GENÉRICO: jamás dice de quién es el otro registro.
const crypto = require('crypto');

function huella(buf) {
  if (!buf || !buf.length) return null;
  return crypto.createHash('md5').update(buf).digest('hex');
}

async function buscarDuplicado({ url, headers, md5 }) {
  if (!md5 || !/^[0-9a-f]{32}$/.test(md5)) return { ok: true, duplicado: null };
  try {
    const r = await fetch(`${url}/rest/v1/rpc/comprobante_duplicado`, {
      method: 'POST',
      headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_md5: md5 }),
    });
    if (!r.ok) return { ok: false, error: 'HTTP ' + r.status, duplicado: null };
    const rows = await r.json().catch(() => null);
    if (!Array.isArray(rows)) return { ok: false, error: 'respuesta rara', duplicado: null };
    return { ok: true, duplicado: rows.length ? rows[0] : null, coincidencias: rows.length };
  } catch (e) {
    return { ok: false, error: e.message, duplicado: null };
  }
}

const MSG_PORTAL = 'Este comprobante ya lo tenemos registrado. Sube el comprobante de tu pago NUEVO. Si crees que es un error, escríbenos por WhatsApp al 81 1977 1072.';
const MSG_RESERVA = 'Este comprobante ya lo tenemos registrado. Si ya mandaste esta reservación, está en revisión y no hace falta mandarla otra vez. Si es un pago nuevo, sube su comprobante. ¿Dudas? Escríbenos por WhatsApp al 81 1977 1072.';

module.exports = { huella, buscarDuplicado, MSG_PORTAL, MSG_RESERVA };
