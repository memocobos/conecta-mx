// =============================================================================
// _lib/imagen-magia.js — [REP-TICKET-1 · 25-oct-2026] EL DUEÑO de «¿qué imagen
// es este archivo?» por sus BYTES. La extensión del cliente es una opinión.
//
// Nació LOCAL en requisicion-crear (el comprobante de la requisición, REQ-B1) y
// se mudó aquí cuando los tickets de gastos de los reportes (admin-reportes) se
// volvieron el segundo lector — dos copias serían dos listas que todavía no
// divergen (la misma mudanza que _lib/audio-magia en KAIO-V3b).
//
// Devuelve { mime, ext } o null si los bytes no son de ningún tipo conocido.
// `pdf: true` incluye %PDF- (el comprobante de requisición lo acepta; un ticket
// de gasto es foto y NO lo pide).
// =============================================================================
'use strict';

function tipoImagen(buf, opts) {
  const pdf = !!(opts && opts.pdf);
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (pdf && buf.slice(0, 5).toString('ascii') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

module.exports = { tipoImagen };
