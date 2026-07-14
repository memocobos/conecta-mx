// =============================================================================
// _lib/correo-guard  —  Switch de MODO PRUEBA para el correo saliente
//
// Interruptor por variable de entorno que DESVÍA todo correo saliente a un buzón
// de prueba, para poder cargar datos y probar flujos sin escribirle a gente real.
// Se aplica en TODOS los emisores (call sites de api.resend.com/emails), JUSTO
// antes de construir el body del fetch, sobre el destinatario ya resuelto.
//
// Uso:  const { to, subject } = aplicarModoPrueba({ to, subject });
//
// MODO REAL ES EL DEFAULT ABSOLUTO: solo desvía si CORREOS_MODO === 'prueba'.
// Cualquier otro valor (o la variable ausente) → devuelve to/subject SIN CAMBIOS,
// para que OLVIDAR la variable nunca desvíe correos reales.
//
// No toca el FROM ni el contenido (html). Sin dependencias.
//
// Variables de entorno:
//   CORREOS_MODO             = 'prueba' para desviar; cualquier otra cosa = real.
//   CORREOS_PRUEBA_DESTINO   = buzón de prueba (default reynosa@conectamexico.mx).
// =============================================================================

const DESTINO_DEFAULT = 'reynosa@conectamexico.mx';

// Devuelve { to, subject } — desviados al buzón de prueba si el modo está activo,
// o EXACTAMENTE los recibidos en modo real. `to` acepta string o array.
function aplicarModoPrueba({ to, subject } = {}) {
  if (process.env.CORREOS_MODO !== 'prueba') {
    return { to, subject }; // modo real (default): sin cambios
  }
  const destino = process.env.CORREOS_PRUEBA_DESTINO || DESTINO_DEFAULT;
  const originales = (Array.isArray(to) ? to : [to])
    .filter(x => x != null && String(x).trim() !== '')
    .map(x => String(x).trim())
    .join(', ');
  return {
    to: [destino],
    subject: '[PRUEBA→' + originales + '] ' + String(subject == null ? '' : subject),
  };
}

module.exports = { aplicarModoPrueba };
