// =============================================================================
// _lib/audio-magia — EL DUEÑO del «¿qué audio es esto?» por sus BYTES
// [KAIO-V3b] Nació en admin-radio-cabina (soundboard) y se mudó aquí cuando la
// Biblioteca aprendió a SUBIR canciones: dos copias de la misma magia serían
// dos listas que todavía no divergen. Jamás se decide por el NOMBRE del
// archivo — los SVG con nombre .png ya mordieron (story del sorteo).
//   MP3: tag ID3 ("ID3") o frame sync 0xFFEx · WAV: RIFF…WAVE · OGG: OggS
// =============================================================================
'use strict';

function tipoAudio(buf) {
  if (buf.length > 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf.length > 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WAVE') return { mime: 'audio/wav', ext: 'wav' };
  if (buf.length > 4 && buf.slice(0, 4).toString('ascii') === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  return null;
}

module.exports = { tipoAudio };
