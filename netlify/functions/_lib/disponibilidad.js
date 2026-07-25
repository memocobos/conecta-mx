// =============================================================================
// _lib/disponibilidad  —  Stock (KH `compras`) − vendidos_fuera (KH `stock_ajustes`)
// − vendidos que cuentan (Portal `solicitudes_tour`) por zona.
//
// Fuente única de verdad de la disponibilidad (la usan disponibilidad-evento,
// VENDEDORES F2 y el candado del Portal). `restante = stock − vendidos_fuera − vendidos`.
//
// FASE B (stock con reloj, 15 min) — regla de conteo de una fila `pendiente`:
//   cuenta SOLO si  comprobante subido  Ó  hold vigente (hold_expira_at > now)
//   Ó  hold NULL (conservador para filas viejas sin reloj).
//   `en_pagos` y `pagado` cuentan siempre; `cancelado` libera (no cuenta).
//   RIDE queda FUERA del control (no consume boleto) → nunca cuenta.
// Una zona está GESTIONADA si tiene compras registradas (igual que hoy); solo
// esas se controlan por inventario. Conservador para no SOBREVENDER: ante datos
// que no se pueden calcular, el caller debe fallar-ruidoso (mejor no vender).
// =============================================================================

const ESTADOS_CUENTAN = ['pendiente', 'en_pagos', 'pagado']; // cancelado excluido en el query

const HOLD_MINUTOS = 15; // reloj del apartado (una sola fuente de verdad)

// PURO: ¿esta fila de `solicitudes_tour` consume cupo AHORA? (regla FASE B).
// nowMs = Date.now() del momento de evaluación (se inyecta para testeo).
function filaCuenta(row, nowMs) {
  if (!row) return false;
  const estado = row.estado;
  if (estado === 'cancelado') return false;
  // RIDE no consume boleto: queda fuera del control de stock.
  if (String(row.paquete || '').toUpperCase() === 'RIDE') return false;
  if (estado === 'en_pagos' || estado === 'pagado') return true;
  if (estado === 'pendiente') {
    const comp = row.comprobante_separo_url;
    if (comp != null && String(comp).trim() !== '') return true; // lugar ya respaldado
    const h = row.hold_expira_at;
    if (h == null || String(h).trim() === '') return true;       // fila vieja sin reloj → conservador
    const t = Date.parse(h);
    if (!Number.isFinite(t)) return true;                        // fecha corrupta → conservador
    return t > nowMs;                                            // hold vigente cuenta; vencido NO
  }
  return false;
}

// IO: consulta KH (compras + stock_ajustes) y Portal (solicitudes_tour), read-only.
// Devuelve { gestionado, stockPorZona, vendidosPorZona, ajustesPorZona } o { error }
// si CUALQUIERA falla (un parcial podría sub-reportar agotado → sobreventa → abortar).
async function cargarDisponibilidad({ khUrl, khKey, portalUrl, portalKey, evento_id, now }) {
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const khHeaders = { apikey: khKey, Authorization: 'Bearer ' + khKey };
  const portalHeaders = { apikey: portalKey, Authorization: 'Bearer ' + portalKey };

  const cp = new URLSearchParams();
  cp.set('select', 'zona,cantidad');
  cp.append('evento_id', `eq.${evento_id}`);
  cp.set('limit', '10000');

  const ap = new URLSearchParams();
  ap.set('select', 'zona,vendidos_fuera');
  ap.append('evento_id', `eq.${evento_id}`);
  ap.set('limit', '10000');

  const vp = new URLSearchParams();
  vp.set('select', 'zona,num_personas,estado,paquete,comprobante_separo_url,hold_expira_at');
  vp.append('evento_id', `eq.${evento_id}`);
  vp.append('estado', `in.(${ESTADOS_CUENTAN.join(',')})`);
  vp.set('limit', '10000');

  const [cRes, aRes, vRes] = await Promise.all([
    fetch(`${khUrl}/rest/v1/compras?${cp.toString()}`, { headers: khHeaders }),
    fetch(`${khUrl}/rest/v1/stock_ajustes?${ap.toString()}`, { headers: khHeaders }),
    fetch(`${portalUrl}/rest/v1/solicitudes_tour?${vp.toString()}`, { headers: portalHeaders }),
  ]);
  if (!cRes.ok || !aRes.ok || !vRes.ok) return { error: 'no se pudo calcular la disponibilidad' };

  const compras = await cRes.json();
  const ajustes = await aRes.json();
  const ventas = await vRes.json();

  const stockPorZona = {};
  (Array.isArray(compras) ? compras : []).forEach((c) => {
    const z = (c && c.zona != null) ? String(c.zona).trim() : '';
    if (!z) return;
    stockPorZona[z] = (stockPorZona[z] || 0) + (parseInt(c.cantidad, 10) || 0);
  });

  // vendidos_fuera (KH stock_ajustes): ventas registradas fuera del sistema.
  const ajustesPorZona = {};
  (Array.isArray(ajustes) ? ajustes : []).forEach((a) => {
    const z = (a && a.zona != null) ? String(a.zona).trim() : '';
    if (!z) return;
    ajustesPorZona[z] = (ajustesPorZona[z] || 0) + (parseInt(a.vendidos_fuera, 10) || 0);
  });

  const vendidosPorZona = {};
  (Array.isArray(ventas) ? ventas : []).forEach((s) => {
    if (!filaCuenta(s, nowMs)) return; // regla FASE B (comprobante/hold/estado/RIDE)
    const z = (s && s.zona != null) ? String(s.zona).trim() : '';
    if (!z) return;
    const n = parseInt(s.num_personas, 10);
    if (!Number.isInteger(n) || n <= 0) return;
    vendidosPorZona[z] = (vendidosPorZona[z] || 0) + n;
  });

  return {
    gestionado: Array.isArray(compras) && compras.length > 0,
    stockPorZona, vendidosPorZona, ajustesPorZona,
  };
}

// PURO: evalúa una zona para un cupo `num`. Si la zona NO está gestionada (sin
// compras), el Palacio no la controla → se puede vender (sinCupo=false). Si está
// gestionada: restante = stock − vendidos_fuera − vendidos; agotada = restante<=0;
// sinCupo = no alcanza para `num` (incluye el caso agotada). Anti-sobreventa.
function evaluarZona(disp, zona, num) {
  const z = String(zona || '').trim();
  const stock = disp && disp.stockPorZona ? disp.stockPorZona : {};
  const gestionada = Object.prototype.hasOwnProperty.call(stock, z);
  if (!gestionada) return { gestionada: false, restante: null, agotada: false, sinCupo: false };
  const vend = (disp.vendidosPorZona && disp.vendidosPorZona[z]) || 0;
  const fuera = (disp.ajustesPorZona && disp.ajustesPorZona[z]) || 0;
  const restante = (stock[z] || 0) - fuera - vend;
  const n = Math.max(1, parseInt(num, 10) || 1);
  return { gestionada: true, restante, agotada: restante <= 0, sinCupo: restante < n };
}

module.exports = { cargarDisponibilidad, evaluarZona, filaCuenta, ESTADOS_CUENTAN, HOLD_MINUTOS };
