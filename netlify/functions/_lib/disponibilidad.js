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

// ── [C2-1] DURACIONES POR MÉTODO ─────────────────────────────────────────────
// El reloj NO se duplica: sigue viviendo en `hold_expira_at`, que es un instante
// absoluto. Lo único que cambia por método es CUÁNTOS minutos se suman al
// crearlo, así que esto es una tabla de minutos, no un mecanismo nuevo.
//
// Tarjeta y transferencia: 15 min (el de siempre, HOLD_MINUTOS).
// OXXO: 24 h — la ficha de Stripe vive un día y el lugar tiene que aguantarle.
// [C2-8] Cuánto se anuncia una ficha de OXXO que no tiene hold detrás. Es el
// límite del ANUNCIO, no de la ficha: la ficha la mata Stripe.
const OXXO_SIN_HOLD_MS = 48 * 60 * 60 * 1000;

const HOLD_MINUTOS_POR_METODO = {
  tarjeta:       HOLD_MINUTOS,
  transferencia: HOLD_MINUTOS,
  oxxo:          24 * 60,
};

// Minutos de hold para un método. Un método desconocido o ausente cae al de
// siempre: conservador, nunca regala tiempo que nadie pidió.
function holdMinutos(metodo) {
  const m = String(metodo || '').toLowerCase();
  return HOLD_MINUTOS_POR_METODO[m] || HOLD_MINUTOS;
}

// ── [C2-1] LA ETIQUETA DE LA COLA, DERIVADA ──────────────────────────────────
// Los cinco "estados" del brief NO son estados: son ETIQUETAS. `estado` se
// queda en 'pendiente' y esto las deriva al leer, igual que claseFila deriva si
// la fila consume cupo. Meterlas en `estado` habría roto claseFila, la
// reconciliación del núcleo auditado y el cron.
//
// Devuelve { etiqueta, vence_en_ms, vigente } donde etiqueta es una de:
//   'separo_pagado'   — Stripe confirmó (separo_pagado_at). Manda sobre todo.
//   'con_comprobante' — subió su comprobante: el lugar ya está respaldado.
//   'oxxo_pendiente'  — ficha emitida, esperando el pago, con reloj vivo.
//   'separado'        — reloj corriendo (tarjeta/transferencia).
//   'vencida'         — se le acabó el tiempo y no pagó ni comprobó.
//   'sin_hold'        — flujo viejo o fila sin reloj (conservador: no vence).
//   'cerrada'         — cancelado / en_pagos / pagado: ya no es cola.
//
// El ORDEN importa: pagado gana a comprobante, y comprobante gana al reloj —
// un lugar respaldado no "vence" aunque el reloj haya pasado (misma regla que
// ya usaba claseFila para no soltar un lugar que el cliente sí pagó).
function etiquetaHold(row, nowMs) {
  const ahora = Number.isFinite(nowMs) ? nowMs : Date.now();
  const nada = { etiqueta: 'cerrada', vence_en_ms: null, vigente: false };
  if (!row) return nada;
  if (row.estado !== 'pendiente') return nada;

  if (row.separo_pagado_at) return { etiqueta: 'separo_pagado', vence_en_ms: null, vigente: true };

  const comp = row.comprobante_separo_url;
  if (comp != null && String(comp).trim() !== '') {
    return { etiqueta: 'con_comprobante', vence_en_ms: null, vigente: true };
  }

  const h = row.hold_expira_at;
  const sinHold = (h == null || String(h).trim() === '' || !Number.isFinite(Date.parse(h)));
  if (sinHold) {
    // [C2-8] FICHA DE OXXO SIN CANDADO REAL.
    //
    // Donde el evento no tiene stock cargado no nace hold, y una ficha de OXXO
    // emitida y sin pagar quedaba INVISIBLE: la cola no la mencionaba y el
    // cliente existía igual, con su voucher en la mano.
    //
    // SIN RELOJ a propósito: la vida de la ficha vive en Stripe y de este lado
    // no se baja. Un contador aquí sería inventado — el mismo criterio del monto
    // que la caja verde del modal no enseña porque no lo tiene.
    //
    // LÍMITE DE 48 h sobre created_at: sin él, una ficha muerta se anunciaría
    // como pendiente para siempre y el aviso pasaría de informar a estorbar.
    // 48 y no 24 porque el voucher puede sobrevivir al hold (día natural de
    // Stripe); pasado eso, ya no hay nada que esperar.
    const esOxxo = String(row.metodo_separo || '').toLowerCase() === 'oxxo';
    if (esOxxo) {
      const nac = Date.parse(row.created_at || '');
      if (Number.isFinite(nac) && (ahora - nac) < OXXO_SIN_HOLD_MS) {
        return { etiqueta: 'oxxo_pendiente', vence_en_ms: null, vigente: true };
      }
    }
    return { etiqueta: 'sin_hold', vence_en_ms: null, vigente: true };
  }
  const t = Date.parse(h);

  const resta = t - ahora;
  if (resta <= 0) return { etiqueta: 'vencida', vence_en_ms: 0, vigente: false };
  const esOxxo = String(row.metodo_separo || '').toLowerCase() === 'oxxo';
  return { etiqueta: esOxxo ? 'oxxo_pendiente' : 'separado', vence_en_ms: resta, vigente: true };
}

// PURO: ¿esta fila de `solicitudes_tour` consume cupo AHORA? (regla FASE B).
// nowMs = Date.now() del momento de evaluación (se inyecta para testeo).
// PURO: clasifica una fila para el DESGLOSE del semáforo (FASE B t3):
//   'segura'    → cuenta y NO depende del reloj: en_pagos, pagado, o pendiente
//                 con comprobante / con hold NULL (fila vieja o lugar respaldado).
//   'apartada'  → cuenta pero con reloj CORRIENDO: pendiente con hold vigente.
//   'no-cuenta' → no consume cupo: cancelado, RIDE, o pendiente con hold VENCIDO.
// filaCuenta = (clase !== 'no-cuenta'), así los llamadores de siempre no cambian.
function claseFila(row, nowMs) {
  if (!row) return 'no-cuenta';
  const estado = row.estado;
  if (estado === 'cancelado') return 'no-cuenta';
  // RIDE no consume boleto: queda fuera del control de stock.
  if (String(row.paquete || '').toUpperCase() === 'RIDE') return 'no-cuenta';
  if (estado === 'en_pagos' || estado === 'pagado') return 'segura';
  if (estado === 'pendiente') {
    const comp = row.comprobante_separo_url;
    if (comp != null && String(comp).trim() !== '') return 'segura'; // lugar ya respaldado
    const h = row.hold_expira_at;
    if (h == null || String(h).trim() === '') return 'segura';       // fila vieja sin reloj → conservador
    const t = Date.parse(h);
    if (!Number.isFinite(t)) return 'segura';                        // fecha corrupta → conservador
    return t > nowMs ? 'apartada' : 'no-cuenta';                     // vigente=apartada; vencido no cuenta
  }
  return 'no-cuenta';
}
function filaCuenta(row, nowMs) { return claseFila(row, nowMs) !== 'no-cuenta'; }

// IO: consulta KH (compras + stock_ajustes) y Portal (solicitudes_tour), read-only.
// Devuelve { gestionado, stockPorZona, vendidosPorZona, ajustesPorZona } o { error }
// si CUALQUIERA falla (un parcial podría sub-reportar agotado → sobreventa → abortar).
async function cargarDisponibilidad({ khUrl, khKey, portalUrl, portalKey, evento_id, now, fetchImpl }) {
  // [AUD-1a] `fetchImpl` opcional, MISMO patrón que _lib/utilidad-evento: sin él
  // este lib no se puede ejercitar desde un arnés sin red, y la alternativa
  // —que cuenta-evento duplicara la consulta de stock— sería justo lo que esta
  // serie vino a eliminar. Sin el parámetro, se comporta EXACTAMENTE igual.
  const _fetch = fetchImpl || fetch;
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const khHeaders = { apikey: khKey, Authorization: 'Bearer ' + khKey };
  const portalHeaders = { apikey: portalKey, Authorization: 'Bearer ' + portalKey };

  // [MER-1] `costo_unitario` viaja con la cantidad porque la MERMA de un evento
  // pasado se mide en COSTO, no en precio de venta: lo que quedó sin vender ya
  // se pagó, y ese dinero es el que se perdió. Se lee de la MISMA fila que ya se
  // leía —una consulta, una fuente— en vez de que cuenta-evento abriera la suya.
  const cp = new URLSearchParams();
  cp.set('select', 'zona,cantidad,costo_unitario');
  cp.append('evento_id', `eq.${evento_id}`);
  cp.set('limit', '10000');

  const ap = new URLSearchParams();
  ap.set('select', 'zona,vendidos_fuera,nota,updated_por,updated_at');
  ap.append('evento_id', `eq.${evento_id}`);
  ap.set('limit', '10000');

  const vp = new URLSearchParams();
  vp.set('select', 'zona,num_personas,estado,paquete,comprobante_separo_url,hold_expira_at');
  vp.append('evento_id', `eq.${evento_id}`);
  vp.append('estado', `in.(${ESTADOS_CUENTAN.join(',')})`);
  vp.set('limit', '10000');

  const [cRes, aRes, vRes] = await Promise.all([
    _fetch(`${khUrl}/rest/v1/compras?${cp.toString()}`, { headers: khHeaders }),
    _fetch(`${khUrl}/rest/v1/stock_ajustes?${ap.toString()}`, { headers: khHeaders }),
    _fetch(`${portalUrl}/rest/v1/solicitudes_tour?${vp.toString()}`, { headers: portalHeaders }),
  ]);
  if (!cRes.ok || !aRes.ok || !vRes.ok) return { error: 'no se pudo calcular la disponibilidad' };

  const compras = await cRes.json();
  const ajustes = await aRes.json();
  const ventas = await vRes.json();

  const stockPorZona = {};
  // [MER-1] Lo invertido por zona y CUÁNTOS boletos respaldan ese número. Las dos
  // cifras van juntas porque el costo unitario honesto es un PROMEDIO PONDERADO
  // (una zona puede tener dos compras a precios distintos), y una fila sin
  // `costo_unitario` NO puede entrar al promedio: contarla como 0 diría que esos
  // boletos fueron gratis. Por eso `conCostoPorZona` cuenta solo las que sí lo
  // traen, y si ninguna lo trae el costo queda en null — que no es cero.
  const inversionPorZona = {};
  const conCostoPorZona = {};
  (Array.isArray(compras) ? compras : []).forEach((c) => {
    const z = (c && c.zona != null) ? String(c.zona).trim() : '';
    if (!z) return;
    const cant = parseInt(c.cantidad, 10) || 0;
    stockPorZona[z] = (stockPorZona[z] || 0) + cant;
    const cu = Number(c.costo_unitario);
    if (Number.isFinite(cu) && cu > 0 && cant > 0) {
      inversionPorZona[z] = (inversionPorZona[z] || 0) + cant * cu;
      conCostoPorZona[z] = (conCostoPorZona[z] || 0) + cant;
    }
  });

  // vendidos_fuera (KH stock_ajustes): ventas registradas fuera del sistema.
  // ajustesMetaPorZona lleva nota/updated_por/updated_at para la casilla del Palacio.
  const ajustesPorZona = {};
  const ajustesMetaPorZona = {};
  (Array.isArray(ajustes) ? ajustes : []).forEach((a) => {
    const z = (a && a.zona != null) ? String(a.zona).trim() : '';
    if (!z) return;
    ajustesPorZona[z] = (ajustesPorZona[z] || 0) + (parseInt(a.vendidos_fuera, 10) || 0);
    ajustesMetaPorZona[z] = { nota: a.nota || null, updated_por: a.updated_por || null, updated_at: a.updated_at || null };
  });

  // Desglose FASE B t3: seguras (sin reloj) y apartadas (reloj vigente). El total
  // vendido = seguras + apartadas, idéntico a lo que contaban los llamadores previos.
  const segurasPorZona = {};
  const apartadasPorZona = {};
  (Array.isArray(ventas) ? ventas : []).forEach((s) => {
    const clase = claseFila(s, nowMs); // 'segura' | 'apartada' | 'no-cuenta'
    if (clase === 'no-cuenta') return;
    const z = (s && s.zona != null) ? String(s.zona).trim() : '';
    if (!z) return;
    const n = parseInt(s.num_personas, 10);
    if (!Number.isInteger(n) || n <= 0) return;
    if (clase === 'apartada') apartadasPorZona[z] = (apartadasPorZona[z] || 0) + n;
    else segurasPorZona[z] = (segurasPorZona[z] || 0) + n;
  });

  const vendidosPorZona = {};
  Object.keys(stockPorZona).concat(Object.keys(segurasPorZona), Object.keys(apartadasPorZona))
    .forEach((z) => { vendidosPorZona[z] = (segurasPorZona[z] || 0) + (apartadasPorZona[z] || 0); });

  return {
    gestionado: Array.isArray(compras) && compras.length > 0,
    stockPorZona, vendidosPorZona, ajustesPorZona,
    segurasPorZona, apartadasPorZona, ajustesMetaPorZona,
    inversionPorZona, conCostoPorZona,   // [MER-1]
  };
}

// PURO: película completa de una zona para el semáforo del Palacio. Devuelve los
// números crudos (endpoint ADMIN, no público) + un estado de color:
//   verde (sobra) · amarillo (≤5) · rojo (0) · negativo (sobreventa → que grite).
function desgloseZona(disp, zona) {
  const z = String(zona || '').trim();
  const compradas = (disp.stockPorZona && disp.stockPorZona[z]) || 0;
  const fuera = (disp.ajustesPorZona && disp.ajustesPorZona[z]) || 0;
  const seguras = (disp.segurasPorZona && disp.segurasPorZona[z]) || 0;
  const apartadas = (disp.apartadasPorZona && disp.apartadasPorZona[z]) || 0;
  const disponibles = compradas - fuera - seguras - apartadas;
  let estado;
  if (disponibles < 0) estado = 'negativo';
  else if (disponibles === 0) estado = 'rojo';
  else if (disponibles <= 5) estado = 'amarillo';
  else estado = 'verde';
  const meta = (disp.ajustesMetaPorZona && disp.ajustesMetaPorZona[z]) || null;
  // [MER-1] Lo que COSTÓ esta zona, por si hay que valorar lo que no se vendió.
  // `costo_unit` es null cuando ninguna compra trajo costo: sin él, quien pinte
  // la merma tiene que decir que no la sabe, no pintar un cero.
  const inv = (disp.inversionPorZona && disp.inversionPorZona[z]) || 0;
  const conCosto = (disp.conCostoPorZona && disp.conCostoPorZona[z]) || 0;
  const costo_unit = conCosto > 0 ? inv / conCosto : null;
  return { zona: z, compradas, fuera, seguras, apartadas, disponibles, estado, ajuste: meta, inversion: inv, costo_unit };
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

module.exports = {
  cargarDisponibilidad, evaluarZona, desgloseZona, filaCuenta, claseFila, ESTADOS_CUENTAN,
  HOLD_MINUTOS, HOLD_MINUTOS_POR_METODO, holdMinutos, etiquetaHold,
};
