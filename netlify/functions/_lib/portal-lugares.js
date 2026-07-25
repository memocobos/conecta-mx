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

const MAX_LUGARES = 60;

// 🔒 AUD-3 — reparto exacto: los primeros N−1 redondeados a 2 decimales y el
// último = total − suma de los demás. Devuelve [p1..pN] (o [null…] sin precio).
// La suma SIEMPRE es igual al total, al centavo.
function repartirCentavos(total, N) {
  if (total == null) return new Array(N).fill(null);
  const cent = Math.round(Number(total) * 100);
  const unit = Math.round(cent / N);
  const out = [];
  let acumulado = 0;
  for (let i = 1; i < N; i++) { out.push(unit / 100); acumulado += unit; }
  out.push((cent - acumulado) / 100);
  return out;
}

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
  // 🔒 AUD-3: tope sano. Un num_personas absurdo (dedo pegado, dato corrupto)
  // insertaría miles de filas de golpe.
  if (N > MAX_LUGARES) {
    throw new Error(`ensureLugares: num_personas fuera de rango (${N} > ${MAX_LUGARES})`);
  }

  // 🔒 AUD-3 — REPARTO DE CENTAVOS EXACTO. Antes cada lugar llevaba
  // round(total/N) y la suma no cuadraba con el total: $1,000 entre 3 daba
  // 333.33×3 = 999.99. Ahora los primeros N−1 van redondeados y el ÚLTIMO
  // absorbe la diferencia, así la suma de los lugares == precio_total al centavo.
  const precioTotal = Number(solicitud.precio_total);
  const hayPrecio = Number.isFinite(precioTotal) && precioTotal > 0;
  const precios = repartirCentavos(hayPrecio ? precioTotal : null, N);

  // El lugar #1 nace con el nombre/correo del TITULAR (cosmético: el modal no
  // debe mostrar "Por registrar" para quien ya está conectado). Usamos lo que ya
  // traiga la solicitud; si no viene, UN GET a clientes por el cliente_id (solo
  // para el lugar 1). Best-effort: si el GET falla, el lugar 1 nace sin nombre
  // (como antes). Los lugares 2+ siguen naciendo vacíos.
  let titularNombre = (solicitud.nombre_completo != null && String(solicitud.nombre_completo).trim() !== '')
    ? String(solicitud.nombre_completo).trim() : null;
  // AUD-3: normalizado a minúsculas (el correo del lugar se compara contra el
  // del JWT al aceptar una invitación, y el candado del giveaway cruza por
  // correo exacto). `clientes.correo` ya lo garantiza por trigger; aquí se cubre
  // el caso en que venga de la solicitud.
  let titularCorreo = (solicitud.correo != null && String(solicitud.correo).trim() !== '')
    ? String(solicitud.correo).trim().toLowerCase() : null;
  if ((!titularNombre || !titularCorreo) && solicitud.cliente_id) {
    try {
      const cliR = await fetch(
        `${portalUrl}/rest/v1/clientes?id=eq.${encodeURIComponent(solicitud.cliente_id)}&select=nombre_completo,correo&limit=1`,
        { headers: portalHeaders }
      );
      if (cliR.ok) {
        const cliArr = await cliR.json();
        const cli = Array.isArray(cliArr) ? cliArr[0] : null;
        if (cli) {
          if (!titularNombre && cli.nombre_completo != null && String(cli.nombre_completo).trim() !== '') titularNombre = String(cli.nombre_completo).trim();
          if (!titularCorreo && cli.correo != null && String(cli.correo).trim() !== '') titularCorreo = String(cli.correo).trim().toLowerCase();
        }
      }
    } catch (_e) { /* best-effort: el lugar 1 nace sin nombre, como antes */ }
  }

  const rows = [];
  for (let i = 1; i <= N; i++) {
    rows.push({
      solicitud_id:    solId,
      numero:          i,
      cliente_id:      i === 1 ? (solicitud.cliente_id || null) : null, // #1 = titular
      nombre:          i === 1 ? (titularNombre || null) : null,        // #1 hereda el nombre del titular; 2+ vacíos
      correo:          i === 1 ? (titularCorreo || null) : null,
      paquete:         solicitud.paquete != null ? solicitud.paquete : null,
      zona:            solicitud.zona != null ? solicitud.zona : null,
      tipo_habitacion: solicitud.tipo_habitacion != null ? solicitud.tipo_habitacion : null,
      precio:          precios[i - 1],
      estado:          'activo',
    });
  }

  const insR = await fetch(`${portalUrl}/rest/v1/lugares`, {
    method: 'POST',
    headers: { ...portalHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!insR.ok) {
    const detail = await insR.text().catch(() => '');
    // 🔒 AUD-3 — CARRERA. El chequeo de idempotencia y el INSERT no son atómicos:
    // dos aprobaciones simultáneas pasaban el check y la segunda reventaba. Con el
    // índice único lugares(solicitud_id,numero) en la base, ese choque es la señal
    // de que OTRO proceso ya los creó → es éxito idempotente, no error. Mismo
    // patrón que ya usa contratos-viajeros. Solo se trata así si el detalle
    // CONFIRMA la violación de unicidad; cualquier otro error sigue lanzando.
    if (/23505|duplicate key|lugares_solicitud_id_numero/i.test(detail)) {
      return { creados: 0, ya_existian: true, carrera: true };
    }
    throw new Error('lugares insert: ' + detail);
  }
  return { creados: N };
}

module.exports = { ensureLugares, _repartirCentavos: repartirCentavos, MAX_LUGARES };
