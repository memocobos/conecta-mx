// =============================================================================
// _lib/radio-cartelera — EL DUEÑO de la parrilla de Radio Conecta (RADIO-V2a)
// =============================================================================
// Contesta UNA pregunta en dos tiempos: «¿qué programa está al aire AHORA y
// cuál sigue?» — dado el padrón de programas y UN INSTANTE. Las funciones
// RECIBEN el instante en vez de llamar a Date.now(): es lo que deja medirlas
// en la frontera de un cambio de horario (la ley de la Nube Voladora).
//
// 🔒 EL HUSO SE DERIVA, NO SE TECLEA. Las horas de la parrilla van en hora de
// REYNOSA (America/Matamoros, que SÍ cambia con EE.UU.): el instante se
// traduce a pared de Reynosa con Intl, jamás con un «-05:00» a mano — ese
// atajo ya costó una cotización que vencía una hora antes todo el invierno.
//
// 🔒 LO ESPECÍFICO GANA, ROTULADO (la forma de ROL-HIST-PADRE/NUBE-4): si un
// ESPECIAL (fecha puntual) y un SEMANAL cubren el mismo instante, al aire está
// el especial — y la respuesta lo dice con `tipo`, no en silencio.
// =============================================================================
'use strict';

const TZ = 'America/Matamoros';
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// El instante → la pared de Reynosa: { fecha:'YYYY-MM-DD', dow:0-6, min:0-1439 }.
// dow por NOMBRE del día (formatToParts), no restando husos a mano.
function paredReynosa(ahoraMs) {
  const d = new Date(ahoraMs);
  const fecha = d.toLocaleDateString('en-CA', { timeZone: TZ });
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const dia = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[dia];
  const [h, m] = hm.split(':').map(Number);
  return { fecha, dow, min: h * 60 + m };
}

const _min = (t) => { const [h, m] = String(t || '').slice(0, 5).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const _fechaMas = (fechaISO, dias) => new Date(Date.parse(fechaISO + 'T12:00:00Z') + dias * 864e5).toISOString().slice(0, 10);
const _dowDe = (fechaISO) => new Date(Date.parse(fechaISO + 'T12:00:00Z')).getUTCDay();

// Un programa VIVO de la parrilla (activo y sin archivar).
const _vivo = (p) => p && p.activo !== false && p.archivado !== true;
// ¿Este programa aplica a ESA fecha (con su dow)? Especial por fecha exacta;
// semanal por día de la semana.
const _aplicaA = (p, fechaISO, dow) => (p.fecha != null ? String(p.fecha).slice(0, 10) === fechaISO : Number(p.dia_semana) === dow);

function _proyecta(p, fechaISO) {
  return { id: p.id, nombre: p.nombre, descripcion: p.descripcion || null, conductor: p.conductor || null,
    color: p.color || null, tipo: p.fecha != null ? 'especial' : 'semanal',
    dia_semana: p.fecha != null ? null : Number(p.dia_semana),
    fecha: fechaISO, dia_nombre: DIAS[_dowDe(fechaISO)],
    hora_inicio: String(p.hora_inicio).slice(0, 5), hora_fin: String(p.hora_fin).slice(0, 5) };
}

// alAireYSiguiente(programas, ahoraMs) → { al_aire, siguiente }
//   al_aire:   el programa cubriendo el instante (especial GANA al semanal) o null.
//   siguiente: el próximo arranque dentro de 7 días: { ...programa, empieza_en_min } o null.
function alAireYSiguiente(programas, ahoraMs) {
  const vivos = (programas || []).filter(_vivo);
  const hoy = paredReynosa(ahoraMs);

  const cubriendo = vivos.filter((p) => _aplicaA(p, hoy.fecha, hoy.dow) && _min(p.hora_inicio) <= hoy.min && hoy.min < _min(p.hora_fin));
  // Lo específico gana: especial > semanal; a igualdad, el que empezó más tarde
  // (el más «cercano» al instante) — determinista, no el orden de la tabla.
  cubriendo.sort((a, b) => ((b.fecha != null) - (a.fecha != null)) || (_min(b.hora_inicio) - _min(a.hora_inicio)));
  const alAire = cubriendo.length ? _proyecta(cubriendo[0], hoy.fecha) : null;

  let sig = null;
  for (let off = 0; off <= 7 && !sig; off++) {
    const f = _fechaMas(hoy.fecha, off), dow = _dowDe(f);
    const delDia = vivos.filter((p) => _aplicaA(p, f, dow) && (off > 0 || _min(p.hora_inicio) > hoy.min))
      .sort((a, b) => (_min(a.hora_inicio) - _min(b.hora_inicio)) || ((b.fecha != null) - (a.fecha != null)));
    if (delDia.length) {
      sig = _proyecta(delDia[0], f);
      sig.empieza_en_min = off * 1440 + _min(delDia[0].hora_inicio) - hoy.min;
    }
  }
  return { al_aire: alAire, siguiente: sig };
}

// La parrilla para pintar: semanales ordenados (día, hora) + especiales de los
// próximos `diasEspeciales` días (hoy incluido), cada uno proyectado a su fecha.
function parrilla(programas, ahoraMs, diasEspeciales) {
  const vivos = (programas || []).filter(_vivo);
  const hoy = paredReynosa(ahoraMs);
  const tope = _fechaMas(hoy.fecha, diasEspeciales == null ? 14 : diasEspeciales);
  const semanales = vivos.filter((p) => p.fecha == null)
    .sort((a, b) => (Number(a.dia_semana) - Number(b.dia_semana)) || (_min(a.hora_inicio) - _min(b.hora_inicio)))
    .map((p) => { const o = _proyecta(p, hoy.fecha); o.fecha = null; o.dia_nombre = DIAS[Number(p.dia_semana)]; o.dia_semana = Number(p.dia_semana); return o; });
  const especiales = vivos.filter((p) => p.fecha != null && String(p.fecha).slice(0, 10) >= hoy.fecha && String(p.fecha).slice(0, 10) <= tope)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || (_min(a.hora_inicio) - _min(b.hora_inicio)))
    .map((p) => _proyecta(p, String(p.fecha).slice(0, 10)));
  return { semanales, especiales };
}

module.exports = { alAireYSiguiente, parrilla, paredReynosa, DIAS, TZ };
