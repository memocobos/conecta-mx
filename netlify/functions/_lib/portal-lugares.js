// =============================================================================
// _lib/portal-lugares.js — modelo "lugar" del Portal (tabla `lugares`).
//
// Un "lugar" = un asiento/cupo de una solicitud. Al aprobar una solicitud se
// crean N lugares (N = num_personas): el #1 es el titular (cliente_id de la
// solicitud); los demás nacen vacíos para que el titular los personalice luego
// (nombre/correo/fecha_nacimiento). paquete/zona/tipo_habitacion se copian como
// defaults; el precio se reparte parejo.
//
// ensureLugares es IDEMPOTENTE (si la solicitud ya tiene lugares, no toca nada) y
// NO atrapa sus propios errores: el caller decide (best-effort) y reporta.
//
// Uso desde las dos rutas de aprobación (admin-solicitud-update-estado y
// admin-crear-viajero) para no duplicar lógica.
// =============================================================================

// { portalUrl, portalHeaders, solicitud:{ id, cliente_id, num_personas, paquete,
//   zona, tipo_habitacion, precio_total } } → { creados, ya_existian? }
async function ensureLugares({ portalUrl, portalHeaders, solicitud }) {
  const solId = solicitud && solicitud.id;
  if (!solId) throw new Error('ensureLugares: solicitud.id requerido');

  // Idempotencia: si ya hay lugares para esta solicitud, no crear de nuevo.
  const checkUrl = `${portalUrl}/rest/v1/lugares?solicitud_id=eq.${encodeURIComponent(solId)}&select=id&limit=1`;
  const checkR = await fetch(checkUrl, { headers: portalHeaders });
  if (!checkR.ok) throw new Error('lugares check: ' + await checkR.text());
  const existentes = await checkR.json();
  if (Array.isArray(existentes) && existentes.length > 0) {
    return { creados: 0, ya_existian: true };
  }

  const N = Math.max(1, parseInt(solicitud.num_personas, 10) || 1);
  const precioTotal = Number(solicitud.precio_total);
  const precioUnit = (Number.isFinite(precioTotal) && precioTotal > 0)
    ? Math.round((precioTotal / N) * 100) / 100
    : null;

  const rows = [];
  for (let i = 1; i <= N; i++) {
    rows.push({
      solicitud_id:    solId,
      numero:          i,
      cliente_id:      i === 1 ? (solicitud.cliente_id || null) : null, // #1 = titular
      paquete:         solicitud.paquete != null ? solicitud.paquete : null,
      zona:            solicitud.zona != null ? solicitud.zona : null,
      tipo_habitacion: solicitud.tipo_habitacion != null ? solicitud.tipo_habitacion : null,
      precio:          precioUnit,
      estado:          'activo',
    });
  }

  const insR = await fetch(`${portalUrl}/rest/v1/lugares`, {
    method: 'POST',
    headers: { ...portalHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!insR.ok) throw new Error('lugares insert: ' + await insR.text());
  return { creados: N };
}

module.exports = { ensureLugares };
