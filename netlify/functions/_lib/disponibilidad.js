// =============================================================================
// _lib/disponibilidad  —  Stock (KH `compras`) − vendidos (Portal `solicitudes_tour`)
// por zona. Misma lógica que la function pública disponibilidad-evento (Palacio de
// Kamisama, capa 2), extraída para reusarla server-side (VENDEDORES F2).
//
// Conservador para no SOBREVENDER: cuentan pendiente + en_pagos + pagado (solo
// cancelado libera). Una zona está GESTIONADA si tiene compras registradas; solo
// esas se controlan por inventario. `restante = stock − vendidos`.
// =============================================================================

const ESTADOS_CUENTAN = ['pendiente', 'en_pagos', 'pagado'];

// IO: consulta ambos proyectos (read-only). Devuelve { gestionado, stockPorZona,
// vendidosPorZona } o { error } si CUALQUIERA falla (parcial podría sub-reportar
// agotado → sobreventa; mejor abortar).
async function cargarDisponibilidad({ khUrl, khKey, portalUrl, portalKey, evento_id }) {
  const khHeaders = { apikey: khKey, Authorization: 'Bearer ' + khKey };
  const portalHeaders = { apikey: portalKey, Authorization: 'Bearer ' + portalKey };

  const cp = new URLSearchParams();
  cp.set('select', 'zona,cantidad');
  cp.append('evento_id', `eq.${evento_id}`);
  cp.set('limit', '10000');

  const vp = new URLSearchParams();
  vp.set('select', 'zona,num_personas,estado');
  vp.append('evento_id', `eq.${evento_id}`);
  vp.append('estado', `in.(${ESTADOS_CUENTAN.join(',')})`);
  vp.set('limit', '10000');

  const [cRes, vRes] = await Promise.all([
    fetch(`${khUrl}/rest/v1/compras?${cp.toString()}`, { headers: khHeaders }),
    fetch(`${portalUrl}/rest/v1/solicitudes_tour?${vp.toString()}`, { headers: portalHeaders }),
  ]);
  if (!cRes.ok || !vRes.ok) return { error: 'no se pudo calcular la disponibilidad' };

  const compras = await cRes.json();
  const ventas = await vRes.json();

  const stockPorZona = {};
  (Array.isArray(compras) ? compras : []).forEach((c) => {
    const z = (c && c.zona != null) ? String(c.zona).trim() : '';
    if (!z) return;
    stockPorZona[z] = (stockPorZona[z] || 0) + (parseInt(c.cantidad, 10) || 0);
  });

  const vendidosPorZona = {};
  (Array.isArray(ventas) ? ventas : []).forEach((s) => {
    const z = (s && s.zona != null) ? String(s.zona).trim() : '';
    if (!z) return;
    const n = parseInt(s.num_personas, 10);
    if (!Number.isInteger(n) || n <= 0) return;
    vendidosPorZona[z] = (vendidosPorZona[z] || 0) + n;
  });

  return { gestionado: Array.isArray(compras) && compras.length > 0, stockPorZona, vendidosPorZona };
}

// PURO: evalúa una zona para un cupo `num`. Si la zona NO está gestionada (sin
// compras), el Palacio no la controla → se puede vender (sinCupo=false). Si está
// gestionada: restante=stock−vendidos; agotada = restante<=0; sinCupo = no alcanza
// para `num` (incluye el caso agotada). Anti-sobreventa.
function evaluarZona(disp, zona, num) {
  const z = String(zona || '').trim();
  const stock = disp && disp.stockPorZona ? disp.stockPorZona : {};
  const gestionada = Object.prototype.hasOwnProperty.call(stock, z);
  if (!gestionada) return { gestionada: false, restante: null, agotada: false, sinCupo: false };
  const vend = (disp.vendidosPorZona && disp.vendidosPorZona[z]) || 0;
  const restante = (stock[z] || 0) - vend;
  const n = Math.max(1, parseInt(num, 10) || 1);
  return { gestionada: true, restante, agotada: restante <= 0, sinCupo: restante < n };
}

module.exports = { cargarDisponibilidad, evaluarZona, ESTADOS_CUENTAN };
