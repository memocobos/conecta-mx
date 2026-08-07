// =============================================================================
// _lib/cuenta-evento.js — LA CUENTA DE UN EVENTO. Fuente única.
//
// [AUD-1a] Memo: "me siguen saliendo zonas donde no estamos contando el dinero…
// todo KameHouse debe estar conectado". La auditoría encontró ONCE fórmulas
// distintas de "cuánto dinero hay", diez de ellas leyendo un solo libro. Éste es
// el lugar donde vive la única.
//
// LA ARITMÉTICA ES LA DE FIN-1c, subida del navegador al servidor para que
// también la puedan usar las funciones:
//
//   VENTAS   = cobrado del Portal  +  abonado de los migrados de KH
//   GASTOS   = la tabla `gastos` del evento (desde FIN-1b trae boletos/hotel/bus)
//   GANANCIA = VENTAS − GASTOS
//   BODEGA   = lo que ya se pagó y sigue en forma de boleto
//   DEUDA A PROVEEDORES = compras + servicios − abonos  → INFORMATIVA, jamás
//                         dentro de la ganancia: es lo que FALTA por gastar, y
//                         meterla contaría dos veces lo mismo el día que se pague.
//
// LO QUE ESTE LIB **NO** PUEDE SABER, y por eso no lo inventa:
//   El PRECIO DE VENTA de una zona vive SOLO en el catálogo de `index.html`.
//   Se verificó: `eventos_meta` (slug, nombre, fecha, fecha_fin, tipo, dias,
//   updated_at) NO lo guarda, y la tabla legacy `eventos` no tiene a melanie.
//   Así que la bodega devuelve SIEMPRE su cuenta de boletos, y el
//   `valor_estimado` solo si el llamador INYECTA los precios. Sin precios va
//   `null`, que no es lo mismo que cero.
//
// EL GATE DE ROL ES EL DE VJ-3, y se respeta aquí: un rol sin permiso NO recibe
// el dinero migrado, y lo que recibe es `null`, NO cero. Un cero diría "no hay",
// y lo que pasa es "no te toca verlo". Con `ventas_kh` en null, `ventas` y
// `ganancia` también son null: una suma con un sumando desconocido no se puede
// afirmar.
//
// `_lib/utilidad-evento` NO se sustituye: sigue siendo la CAJA (el dinero que
// pasó por las cuentas del Portal), que es una pregunta legítima y distinta de
// la ganancia. Lo que cambia es que deja de ser la única.
//
// Uso:
//   cuentaDeEvento({ portalUrl, portalService, khUrl, khService, evento_id,
//                    rol, preciosPorZona?, fetchImpl? })
//     → { evento_id, ventas_portal, ventas_kh, ventas, gastos, ganancia,
//         bodega:{ boletos, valor_estimado, sin_precio, zonas_sin_precio },
//         deuda_proveedores, viajeros_portal, viajeros_kh, viajeros,
//         por_cobrar, a_favor, ve_migrados }
//     | { error, detail }
//
//   cuentasDeTodos({ portalUrl, portalService, khUrl, khService, rol, fetchImpl? })
//     → { eventos: { "<slug>": {…sin bodega…} }, totales: {…} } | { error, detail }
//     (sin bodega: la bodega pide una consulta de stock POR evento, y este otro
//      camino existe justo para los tableros que miran TODOS los eventos.)
// =============================================================================

const { cargarDisponibilidad, desgloseZona } = require('./disponibilidad');

// Los mismos roles que VJ-3 usa para dejar ver el dinero de un migrado.
const ROLES_DINERO_MIGRADO = ['maestro_roshi', 'bulma', 'milk'];
// Solicitudes que cuentan como venta viva (cancelado fuera) — igual que el resto.
const ESTADOS_CUENTAN = ['pendiente', 'en_pagos', 'pagado'];

const baseSlug = (evId) => (evId == null ? '' : String(evId).split('#')[0].trim());
const puedeVerMigrados = (rol) => ROLES_DINERO_MIGRADO.includes(String(rol || ''));
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// Lector con fail-closed: sin datos NO se devuelve media cuenta.
function hacerLeer(_fetch, url, key) {
  const headers = { apikey: key, Authorization: 'Bearer ' + key };
  return async function leer(tabla, query) {
    try {
      const r = await _fetch(`${url}/rest/v1/${tabla}?${query}`, { headers });
      if (!r.ok) return { error: `rechazó la consulta de ${tabla}`, detail: await r.text() };
      const data = await r.json();
      return { data: Array.isArray(data) ? data : [] };
    } catch (e) {
      return { error: `error consultando ${tabla}`, detail: e.message };
    }
  };
}

// ── PURO: el saldo de un migrado. Copia EXACTA de la regla de oro de VJ-3
//    (_vj3Saldo). Se re-escribe aquí y no se importa porque aquélla vive en el
//    navegador; el arnés CAREA las dos para que no puedan divergir.
//      resta = total_contrato − abonado_previo − suma(abonos)
//    y NUNCA se recalcula de paquete+habitación+vuelo.
function saldoMigrado(v, abonosDelViajero) {
  if (!v || v.total_contrato == null) return null;   // fila sin dinero: no suma
  const total = n(v.total_contrato);
  const previo = n(v.abonado_previo);
  const extra = (abonosDelViajero || []).reduce((s, a) => s + n(a.monto), 0);
  const abonado = previo + extra;
  return { total, abonado, resta: total - abonado };
}

// ── PURO: la bodega en dinero. Sin precio de una zona, sus boletos se cuentan
//    pero NO se valoran: un cero diría "no vale nada".
function bodegaDeZonas(zonas, preciosPorZona) {
  const out = { boletos: 0, valor_estimado: 0, sin_precio: 0, zonas_sin_precio: [] };
  let algunConPrecio = false;
  (zonas || []).forEach((z) => {
    const disp = Number(z && z.disponibles);
    if (!Number.isFinite(disp) || disp <= 0) return;
    out.boletos += disp;
    const p = Number((preciosPorZona || {})[String(z.zona).trim()]);
    if (Number.isFinite(p) && p > 0) { out.valor_estimado += disp * p; algunConPrecio = true; }
    else { out.sin_precio += disp; out.zonas_sin_precio.push(String(z.zona)); }
  });
  // Sin UN SOLO precio conocido, el valor no es cero: es desconocido.
  if (!algunConPrecio) out.valor_estimado = null;
  return out;
}

// ── PURO: arma la cuenta con los números ya reunidos. Aquí vive la regla del
//    gate: sin permiso, lo migrado es null y lo que dependa de él, también.
function armarCuenta({ evento_id, ventasPortal, facturadoPortal, viajerosPortal, gastos, kh, deuda, bodega, veMigrados }) {
  const ventas_kh = veMigrados ? kh.cobrado : null;
  // [AUD-1b] FACTURADO ≠ VENTAS. Facturado es lo contratado; ventas es lo
  // cobrado. La ganancia se calcula sobre lo COBRADO —dinero que existe—, no
  // sobre promesas.
  const factPortal = n(facturadoPortal);
  const facturado_kh = veMigrados ? kh.vendido : null;
  const facturado = (facturado_kh == null) ? null : factPortal + facturado_kh;
  const viajeros_kh = veMigrados ? kh.filas : null;
  const ventas = (ventas_kh == null) ? null : ventasPortal + ventas_kh;
  const ganancia = (ventas == null) ? null : ventas - gastos;
  return {
    evento_id,
    ve_migrados: veMigrados,
    ventas_portal: ventasPortal,
    ventas_kh,
    ventas,
    facturado_portal: factPortal,
    facturado_kh,
    facturado,
    // Pendiente = facturado − cobrado. Puede salir NEGATIVO (hay saldos a favor
    // reales): quien lo pinte tiene que decir el signo con palabras, no con un
    // menos (patrón CAP-FIX-2d).
    pendiente: (facturado == null || ventas == null) ? null : facturado - ventas,
    gastos,
    ganancia,
    bodega,
    deuda_proveedores: deuda,
    viajeros_portal: viajerosPortal,
    viajeros_kh,
    viajeros: (viajeros_kh == null) ? null : viajerosPortal + viajeros_kh,
    // El "por cobrar" del mundo migrado es un NETO de obligaciones opuestas
    // (lección de VJ-3): se devuelven LAS DOS MITADES, no una resta que
    // escondería una de ellas.
    por_cobrar: veMigrados ? kh.deben : null,
    a_favor: veMigrados ? kh.aFavor : null,
    sin_contrato: veMigrados ? kh.sinContrato : null,
  };
}

// ── Reúne el mundo migrado de un evento (o de todos si evento_id es null).
async function mundoKH(leerKH, evento_id) {
  const filtroV = evento_id
    ? `evento_id=eq.${encodeURIComponent(evento_id)}&`
    : '';
  const rv = await leerKH('viajeros_evento', `${filtroV}select=id,evento_id,total_contrato,abonado_previo&limit=20000`);
  if (rv.error) return rv;
  const ra = await leerKH('abonos_viajero', 'select=viajero_id,monto&limit=20000');
  if (ra.error) return ra;

  const abonosPorViajero = {};
  ra.data.forEach((a) => {
    const k = a && a.viajero_id;
    if (!k) return;
    (abonosPorViajero[k] = abonosPorViajero[k] || []).push(a);
  });

  const porEvento = {};
  rv.data.forEach((v) => {
    const slug = baseSlug(v.evento_id);
    if (!slug) return;
    const e = porEvento[slug] = porEvento[slug] || { filas: 0, conContrato: 0, sinContrato: 0, vendido: 0, cobrado: 0, deben: 0, aFavor: 0, debenMenosAFavor: 0 };
    e.filas++;
    const s = saldoMigrado(v, abonosPorViajero[v.id]);
    if (!s) { e.sinContrato++; return; }
    e.conContrato++;
    e.vendido += s.total;
    e.cobrado += s.abonado;
    if (s.resta > 0) e.deben += s.resta; else e.aFavor += -s.resta;
  });
  Object.keys(porEvento).forEach((k) => { porEvento[k].debenMenosAFavor = porEvento[k].deben - porEvento[k].aFavor; });
  return { data: porEvento };
}

const KH_VACIO = { filas: 0, conContrato: 0, sinContrato: 0, vendido: 0, cobrado: 0, deben: 0, aFavor: 0, debenMenosAFavor: 0 };

// ── Reúne el mundo Portal (cobrado por evento + viajeros por evento + gastos).
async function mundoPortal(leerP) {
  // [AUD-1b] `precio_total` = lo FACTURADO (contratado), que no es lo mismo que
  // lo cobrado. La pantalla de Ventas enseña las dos, y confundirlas haría que
  // "Pendiente" saliera siempre en cero.
  const rs = await leerP('solicitudes_tour', `estado=in.(${ESTADOS_CUENTAN.join(',')})&select=id,evento_id,num_personas,precio_total&limit=20000`);
  if (rs.error) return rs;
  const rp = await leerP('pagos', 'estado=eq.pagado&select=solicitud_id,monto,monto_pagado&limit=20000');
  if (rp.error) return rp;
  const rg = await leerP('gastos', 'select=evento_id,monto&limit=20000');
  if (rg.error) return rg;

  const evPorSolicitud = {}; const viajeros = {}; const facturado = {};
  rs.data.forEach((s) => {
    const slug = baseSlug(s.evento_id);
    evPorSolicitud[s.id] = slug;
    if (!slug) return;
    const num = parseInt(s.num_personas, 10);
    viajeros[slug] = (viajeros[slug] || 0) + (Number.isInteger(num) && num > 0 ? num : 0);
    facturado[slug] = (facturado[slug] || 0) + n(s.precio_total);
  });
  const cobrado = {};
  rp.data.forEach((p) => {
    const slug = evPorSolicitud[p.solicitud_id];
    if (!slug) return;
    // COALESCE(monto_pagado, monto) — el mismo criterio que la caja.
    cobrado[slug] = (cobrado[slug] || 0) + n(p.monto_pagado == null ? p.monto : p.monto_pagado);
  });
  const gastos = {};
  // [AUD-1d] Los gastos "General" (sin evento) NO pertenecen a ningún evento,
  // pero SON dinero que salió: se devuelven aparte para que la tabla los pueda
  // enseñar en su renglón, en vez de que desaparezcan al cambiar de fuente.
  let gastosSinEvento = 0;
  rg.data.forEach((g) => {
    const slug = baseSlug(g.evento_id);
    if (!slug) { gastosSinEvento += n(g.monto); return; }
    gastos[slug] = (gastos[slug] || 0) + n(g.monto);
  });
  return { data: { cobrado, viajeros, gastos, facturado, gastosSinEvento } };
}

// ── Deuda a proveedores por evento: compras + servicios − abonos (KH).
async function deudaProveedores(leerKH, evento_id) {
  const f = evento_id ? `evento_id=eq.${encodeURIComponent(evento_id)}&` : '';
  const [rc, rs, ra] = await Promise.all([
    leerKH('compras', `${f}select=evento_id,cantidad,costo_unitario&limit=20000`),
    leerKH('servicios_proveedor', `${f}select=evento_id,monto&limit=20000`),
    leerKH('abonos', `${f}select=evento_id,monto&limit=20000`),
  ]);
  if (rc.error) return rc;
  if (rs.error) return rs;
  if (ra.error) return ra;
  const out = {};
  const suma = (slug, v) => { if (!slug) return; out[slug] = (out[slug] || 0) + v; };
  rc.data.forEach((c) => suma(baseSlug(c.evento_id), (parseInt(c.cantidad, 10) || 0) * n(c.costo_unitario)));
  rs.data.forEach((s) => suma(baseSlug(s.evento_id), n(s.monto)));
  ra.data.forEach((a) => suma(baseSlug(a.evento_id), -n(a.monto)));
  return { data: out };
}

// ═══════════════════════════════════════════════════════════════════════════
// LA CUENTA DE UN EVENTO — con bodega.
// ═══════════════════════════════════════════════════════════════════════════
async function cuentaDeEvento(opts) {
  const o = opts || {};
  const _fetch = o.fetchImpl || fetch;
  const evento_id = baseSlug(o.evento_id);
  if (!evento_id) return { error: 'evento_id requerido' };
  const leerP = hacerLeer(_fetch, o.portalUrl, o.portalService);
  const leerKH = hacerLeer(_fetch, o.khUrl, o.khService);
  const veMigrados = puedeVerMigrados(o.rol);

  const [p, k, d] = await Promise.all([
    mundoPortal(leerP),
    veMigrados ? mundoKH(leerKH, evento_id) : Promise.resolve({ data: {} }),
    deudaProveedores(leerKH, evento_id),
  ]);
  if (p.error) return p;
  if (k.error) return k;
  if (d.error) return d;

  // La bodega necesita el stock: se usa el MISMO lib que el semáforo del
  // Palacio, para que no haya dos ideas de "disponible".
  let bodega = { boletos: 0, valor_estimado: null, sin_precio: 0, zonas_sin_precio: [] };
  const disp = await cargarDisponibilidad({
    khUrl: o.khUrl, khKey: o.khService,
    portalUrl: o.portalUrl, portalKey: o.portalService,
    evento_id, fetchImpl: o.fetchImpl,
  });
  if (!disp.error) {
    const zonas = [...new Set([
      ...Object.keys(disp.stockPorZona || {}),
      ...Object.keys(disp.ajustesPorZona || {}),
    ])].map((z) => desgloseZona(disp, z));
    bodega = bodegaDeZonas(zonas, o.preciosPorZona);
  } else {
    // Sin stock NO se afirma una bodega vacía.
    bodega = { boletos: null, valor_estimado: null, sin_precio: 0, zonas_sin_precio: [] };
  }

  return armarCuenta({
    evento_id,
    ventasPortal: n((p.data.cobrado || {})[evento_id]),
    facturadoPortal: n((p.data.facturado || {})[evento_id]),
    viajerosPortal: n((p.data.viajeros || {})[evento_id]),
    gastos: n((p.data.gastos || {})[evento_id]),
    kh: (k.data || {})[evento_id] || KH_VACIO,
    deuda: n((d.data || {})[evento_id]),
    bodega,
    veMigrados,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TODOS LOS EVENTOS — sin bodega (pide una consulta de stock por evento, y
// esto existe para los tableros que miran el conjunto).
// ═══════════════════════════════════════════════════════════════════════════
async function cuentasDeTodos(opts) {
  const o = opts || {};
  const _fetch = o.fetchImpl || fetch;
  const leerP = hacerLeer(_fetch, o.portalUrl, o.portalService);
  const leerKH = hacerLeer(_fetch, o.khUrl, o.khService);
  const veMigrados = puedeVerMigrados(o.rol);

  const [p, k, d] = await Promise.all([
    mundoPortal(leerP),
    veMigrados ? mundoKH(leerKH, null) : Promise.resolve({ data: {} }),
    deudaProveedores(leerKH, null),
  ]);
  if (p.error) return p;
  if (k.error) return k;
  if (d.error) return d;

  const slugs = [...new Set([
    ...Object.keys(p.data.cobrado || {}),
    ...Object.keys(p.data.facturado || {}),
    ...Object.keys(p.data.viajeros || {}),
    ...Object.keys(p.data.gastos || {}),
    ...Object.keys(k.data || {}),
    ...Object.keys(d.data || {}),
  ])].filter(Boolean).sort();

  const eventos = {};
  slugs.forEach((slug) => {
    eventos[slug] = armarCuenta({
      evento_id: slug,
      ventasPortal: n((p.data.cobrado || {})[slug]),
      facturadoPortal: n((p.data.facturado || {})[slug]),
      viajerosPortal: n((p.data.viajeros || {})[slug]),
      gastos: n((p.data.gastos || {})[slug]),
      kh: (k.data || {})[slug] || KH_VACIO,
      deuda: n((d.data || {})[slug]),
      bodega: { boletos: null, valor_estimado: null, sin_precio: 0, zonas_sin_precio: [] },
      veMigrados,
    });
  });

  // [AUD-1c] LA BODEGA, solo para los eventos cuyos PRECIOS mandó el llamador.
  //
  // El catálogo vive en index.html y el servidor no lo tiene (verificado en
  // AUD-1a). Decisión de Jane: los precios se INYECTAN desde el navegador, que
  // ya carga ese catálogo — una fuente más sería una divergencia más esperando
  // nacer. Sin precios de un evento, su bodega no se calcula: el conteo de
  // boletos se queda en null, que NO es cero.
  //
  // Se consulta el stock SOLO de los eventos con precios: la bodega cuesta una
  // consulta por evento, y hacerla de todos convertiría este camino —el de los
  // tableros— en el más caro de los dos.
  const precios = o.preciosPorEvento || null;
  if (precios) {
    const conPrecio = Object.keys(precios).filter((s) => eventos[s]);
    for (const slug of conPrecio) {
      const disp = await cargarDisponibilidad({
        khUrl: o.khUrl, khKey: o.khService,
        portalUrl: o.portalUrl, portalKey: o.portalService,
        evento_id: slug, fetchImpl: o.fetchImpl,
      });
      if (disp.error) continue;   // sin stock, la bodega de ESE evento sigue en null
      const zonas = [...new Set([
        ...Object.keys(disp.stockPorZona || {}),
        ...Object.keys(disp.ajustesPorZona || {}),
      ])].map((z) => desgloseZona(disp, z));
      eventos[slug].bodega = bodegaDeZonas(zonas, precios[slug]);
    }
  }

  // Los agregados de empresa, definidos UNA vez (antes vivían en tres lugares).
  const tot = { ventas: 0, gastos: 0, ganancia: 0, viajeros: 0, eventos_con_movimiento: slugs.length, desconocido: false };
  slugs.forEach((s) => {
    const e = eventos[s];
    if (e.ventas == null) { tot.desconocido = true; return; }
    tot.ventas += e.ventas; tot.gastos += e.gastos; tot.viajeros += e.viajeros;
  });
  tot.ganancia = tot.desconocido ? null : tot.ventas - tot.gastos;
  if (tot.desconocido) { tot.ventas = null; tot.viajeros = null; }
  // [AUD-1c] La bodega de la empresa: solo suma lo que SE PUDO valorar. Si
  // ningún evento trajo precios, el valor es null (desconocido), no 0.
  let boletos = 0, valor = 0, algo = false, algoValor = false;
  slugs.forEach((s) => {
    const b = eventos[s].bodega || {};
    if (b.boletos != null) { boletos += b.boletos; algo = true; }
    if (b.valor_estimado != null) { valor += b.valor_estimado; algoValor = true; }
  });
  tot.bodega_boletos = algo ? boletos : null;
  tot.bodega_valor = algoValor ? valor : null;
  // Facturado de empresa, para la tarjeta del Resumen.
  let fact = 0, factOk = true;
  slugs.forEach((s) => { const f = eventos[s].facturado; if (f == null) factOk = false; else fact += f; });
  tot.facturado = factOk ? fact : null;
  tot.pendiente = (tot.facturado == null || tot.ventas == null) ? null : tot.facturado - tot.ventas;
  // Los gastos "General" (sin evento) NO están en ningún evento: se dan aparte
  // para que quien quiera el total de la empresa los sume a sabiendas.
  return {
    eventos,
    // [AUD-1d] El dinero que no cuelga de ningún evento. Hoy solo hay gastos:
    // un ingreso o un pago sin evento no existe en estas tablas.
    sin_evento: { gastos: n(p.data.gastosSinEvento) },
    totales: tot,
    ve_migrados: veMigrados,
  };
}

module.exports = {
  cuentaDeEvento,
  cuentasDeTodos,
  // exportados para el arnés (puros, sin BD):
  saldoMigrado,
  bodegaDeZonas,
  armarCuenta,
  ROLES_DINERO_MIGRADO,
  baseSlug,
};
