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
//   COBRADO  = cobrado del Portal  +  abonado de los migrados de KH
//   GASTOS   = la tabla `gastos` del evento SIN la categoría `Boletos`
//   GANANCIA = COBRADO − INVERSIÓN EN BOLETOS − GASTOS
//   INVERSIÓN EN BOLETOS = TODOS los boletos comprados del evento
//              (`compras`), vendidos o no, pagados o no.
//   BODEGA   = lo que ya se pagó y sigue en forma de boleto
//              [MER-1] …y que en un evento YA PASADO deja de ser bodega y pasa a
//              ser MERMA: los mismos boletos, medidos en COSTO HUNDIDO en vez de
//              en precio de venta. La ganancia NO cambia de fórmula (el costo ya
//              está en `gastos` desde FIN-1b); cambia lo que la bodega DICE.
//   DEUDA A PROVEEDORES = compras − abonos  → INFORMATIVA, jamás
//                         dentro de la ganancia: es lo que FALTA por gastar, y
//                         meterla contaría dos veces lo mismo el día que se pague.
//
// ⚠️ [UTIL-C] LA FÓRMULA CAMBIÓ DOS VECES EN AGOSTO Y ÉSTA ES LA FIRMADA. Vale
// la pena dejar las tres escritas, porque las pantallas viejas y los reportes
// guardados hablan de las anteriores y hay que poder reconocerlas:
//   (A) FIN-1  · cobrado − gastos                       → era CAJA, no utilidad.
//   (B) UTIL-B · vendido − costo de lo VENDIDO − gastos → margen contable.
//   (C) UTIL-C · COBRADO − INVERSIÓN TOTAL − gastos     → la de hoy.
// Con las cifras reales de `calle24` las tres dan números distintos —$23,600,
// $20,678 y −$28,720— así que no hay forma de confundirlas por accidente.
//
// POR QUÉ (C), en las palabras de la decisión: **los boletos no tienen
// devolución**. En el momento en que se compran son de Memo, se vendan o no, así
// que la inversión entera pesa desde el día uno y no se va prorrateando conforme
// se venden. Y el primer término es lo COBRADO, no lo vendido, porque un
// contrato firmado no paga a un proveedor. La consecuencia incómoda es que un
// evento recién cargado nace MUY en rojo y se va enderezando conforme cobra —
// eso no es un error de la cuenta, es la forma real del negocio, y es justo lo
// que la fórmula (B) escondía.
//
// COROLARIO: la BODEGA deja de ser un activo que compensa. Su costo ya está
// dentro de la inversión, así que restarlo otra vez —o sumarlo como "lo que
// vale lo que me queda"— contaría lo mismo dos veces. La bodega queda como
// INFORMACIÓN ("me quedan N boletos por vender"), igual que la deuda.
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
//                    rol, preciosPorZona?, pasado?, fetchImpl? })
//     → { evento_id, ventas_portal, ventas_kh, ventas, en_mano, facturado,
//         inversion_boletos, inversion_parcial, inversion_zonas_sin_costo,
//         gastos, ganancia,
//         bodega:{ boletos, valor_estimado, sin_precio, zonas_sin_precio,
//                  costo_hundido, sin_costo, zonas_sin_costo, pasado },
//         deuda_proveedores, viajeros_portal, viajeros_kh, viajeros,
//         por_cobrar, a_favor, ve_migrados }
//     | { error, detail }
//
//   cuentasDeTodos({ portalUrl, portalService, khUrl, khService, rol,
//                    preciosPorEvento?, eventosPasados?, fetchImpl? })
//     → { eventos: { "<slug>": {…sin bodega…} }, totales: {…} } | { error, detail }
//     (sin bodega: la bodega pide una consulta de stock POR evento, y este otro
//      camino existe justo para los tableros que miran TODOS los eventos.)
// =============================================================================

// [UTIL-C] `claseFila` y `consumeBoleto` los importó UTIL-B-1 para costear lo
// vendido POR ZONA. Bajo C la inversión no mira lo vendido, así que se podan
// aquí y no en una limpieza suelta: un import que nadie usa hace creer que esta
// lib clasifica viajeros, y no los clasifica.
const { cargarDisponibilidad, desgloseZona } = require('./disponibilidad');
// [SAL-1] La regla paquete→cuenta NO se replica aquí: se consume la única que hay.
const { cuentaParaPaquete } = require('./catalogo-index');

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
//
// [MER-1] Y con DOS cifras, no una, porque los mismos boletos valen cosas
// distintas según si el evento ya pasó:
//   valor_estimado = disponibles × PRECIO DE VENTA  → lo que se podría cobrar
//   costo_hundido  = disponibles × COSTO UNITARIO   → lo que ya se pagó por ellos
// Mientras el evento no llega, la cifra que importa es la primera (esperanza).
// Cuando el evento pasó, la primera es una mentira —nadie va a comprar un boleto
// de un concierto que ya ocurrió— y la única verdadera es la segunda: ese dinero
// se perdió. `pasado` NO se decide aquí: se recibe. Este lib no sabe qué día es
// hoy y no debe saberlo (ver la nota de `cuentasDeTodos`).
function bodegaDeZonas(zonas, preciosPorZona, pasado) {
  const out = {
    boletos: 0, valor_estimado: 0, sin_precio: 0, zonas_sin_precio: [],
    costo_hundido: 0, sin_costo: 0, zonas_sin_costo: [], pasado: !!pasado,
  };
  let algunConPrecio = false;
  let algunConCosto = false;
  (zonas || []).forEach((z) => {
    const disp = Number(z && z.disponibles);
    if (!Number.isFinite(disp) || disp <= 0) return;
    out.boletos += disp;
    const p = Number((preciosPorZona || {})[String(z.zona).trim()]);
    if (Number.isFinite(p) && p > 0) { out.valor_estimado += disp * p; algunConPrecio = true; }
    else { out.sin_precio += disp; out.zonas_sin_precio.push(String(z.zona)); }
    // El costo viene del MISMO desglose de zona (_lib/disponibilidad lo deriva de
    // las compras que ya leía). Sin costo, esos boletos se cuentan pero no se
    // valoran — mismo criterio que el precio.
    const c = Number(z && z.costo_unit);
    if (Number.isFinite(c) && c > 0) { out.costo_hundido += disp * c; algunConCosto = true; }
    else { out.sin_costo += disp; out.zonas_sin_costo.push(String(z.zona)); }
  });
  // Sin UN SOLO precio conocido, el valor no es cero: es desconocido.
  if (!algunConPrecio) out.valor_estimado = null;
  if (!algunConCosto) out.costo_hundido = null;
  return out;
}

// [MER-1] La bodega que NO se pudo calcular. Vivía escrita a mano en tres sitios
// y ahora son cinco campos: una sola declaración, para que agregar un campo no
// deje a un llamador con la forma vieja.
function bodegaDesconocida(pasado) {
  return {
    boletos: null, valor_estimado: null, sin_precio: 0, zonas_sin_precio: [],
    costo_hundido: null, sin_costo: 0, zonas_sin_costo: [], pasado: !!pasado,
  };
}

// ── PURO: arma la cuenta con los números ya reunidos. Aquí vive la regla del
//    gate: sin permiso, lo migrado es null y lo que dependa de él, también.
function armarCuenta({ evento_id, ventasPortal, facturadoPortal, viajerosPortal, gastos, kh, deuda, bodega, inversion, veMigrados }) {
  const ventas_kh = veMigrados ? kh.cobrado : null;
  // [AUD-1b · reescrita por UTIL-B] FACTURADO ≠ VENTAS, y las DOS se usan, cada
  // una para lo suyo:
  //   · `ventas` = lo COBRADO. Es la CAJA: dinero que existe. Sigue publicándose
  //     y es lo que la tarjeta enseña como "en mano".
  //   · `facturado` = lo CONTRATADO. Es lo VENDIDO, y desde UTIL-B es la base de
  //     la utilidad.
  //
  // ⚠️ AQUÍ DECÍA LO CONTRARIO —"la ganancia se calcula sobre lo COBRADO, no
  // sobre promesas"— y era cierto bajo la fórmula A. Memo firmó el cambio a B:
  // un boleto vendido carga su costo desde que se vende, así que su venta tiene
  // que contarse en el mismo momento. La consecuencia hay que decirla en voz
  // alta: LA UTILIDAD PUEDE SER POSITIVA SIN UN PESO EN LA CUENTA. Por eso la
  // caja no se retira, se subordina — y la pantalla enseña las dos.
  const factPortal = n(facturadoPortal);
  const facturado_kh = veMigrados ? kh.vendido : null;
  const facturado = (facturado_kh == null) ? null : factPortal + facturado_kh;
  const viajeros_kh = veMigrados ? kh.filas : null;
  const ventas = (ventas_kh == null) ? null : ventasPortal + ventas_kh;
  // [UTIL-B] LA CAJA sigue existiendo con el nombre de siempre (`ventas`), y
  // además se publica con su nombre honesto para quien pinte la tarjeta.
  const en_mano = ventas;

  // ═══ LA FÓRMULA C ═══════════════════════════════════════════════════════
  //   UTILIDAD = COBRADO − INVERSIÓN TOTAL EN BOLETOS − GASTOS
  //
  // ⚠️ COBRADO, no facturado. UTIL-B usó el facturado (base de margen) y Memo
  // firmó volver al dinero que EXISTE: la utilidad vuelve a hablar de plata en
  // la mano, y lo que falta por cobrar se dice aparte, en los escenarios.
  //
  // ⚠️ INVERSIÓN **TOTAL**, no el costo de lo vendido: los boletos no tienen
  // devolución, así que el compromiso entero pesa desde el día uno.
  //
  // `gastos` ya viene SIN los pagos de boletos (se excluyen por categoría en
  // `mundoPortal`, desde UTIL-B-1, y ESA EXCLUSIÓN SE QUEDA): un pago a la
  // matriz es la inversión pagándose, no un gasto nuevo. Sin excluirlo, el
  // mismo dinero restaría dos veces — una por inversión y otra por gasto.
  //
  // Es null si falta cualquiera de sus partes — una suma con un sumando
  // desconocido no se puede afirmar.
  const c = inversion || inversionDesconocida();
  const ganancia = (ventas == null || c.total == null) ? null : ventas - c.total - gastos;
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
    // [UTIL-C] Las piezas de la fórmula, publicadas para que la pantalla pueda
    // EXPLICAR el número en vez de solo enseñarlo — y para que el panel de
    // escenarios no tenga que recalcular ninguna por su cuenta.
    inversion_boletos: c.total,
    inversion_parcial: c.parcial,
    inversion_zonas_sin_costo: c.zonas_sin_costo,
    en_mano,
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

// ═══════════════════════════════════════════════════════════════════════════
// [SAL-1] DE QUÉ CUENTA BANCARIA ES CADA PESO MIGRADO
//
// Memo: "el dinero de los migrados entró así — PLUS/RIDE/STAY a BBVA · CHEAP a
// Banamex". La regla YA EXISTE y no hace falta escribirla otra vez: vive en
// `cuentaParaPaquete` de `_lib/catalogo-index` desde Gancho 2, es la misma que
// usan los correos de cobranza y los contratos, y dice algo un poco más fino que
// la frase de Memo:
//
//     cheap              → Banamex SIEMPRE
//     plus / ride / stay → ev.banco || BBVA      ← el banco DEL EVENTO
//
// La diferencia importa: hay cuatro eventos con `banco:BANCO_HEY` (acdc, harry,
// hilary, soad) donde el PLUS va a Banamex. Escribir "PLUS→BBVA" aquí habría
// creado la segunda copia de la regla —y estaría mal en esos cuatro—.
//
// LA CUENTA SE IDENTIFICA POR SU CLABE, NO POR SU NOMBRE. El catálogo dice
// "BBVA Bancomer" y las cubetas de `admin-saldos` se llaman "BBVA": comparar
// nombres habría mandado todo el PLUS a "sin clasificar" sin avisar. La CLABE es
// la identidad de la cuenta; el nombre es una etiqueta que alguien escribió.
// Una CLABE que no esté en esta tabla NO se adivina: cae en `sin_clasificar`, que
// es visible. El día que Memo abra una tercera cuenta, se nota en vez de aterrizar
// en la cubeta equivocada.
const CLABE_A_CUENTA = {
  '012822004639334319': 'BBVA',      // BANCO_DEFAULT
  '002580702305539377': 'Banamex',   // BANCO_HEY
};

// PURO: mete `monto` en la cubeta que le toca, o en `sinCuenta` con su motivo.
// JAMÁS reparte a ciegas — cada peso que no se pudo clasificar queda contado y
// rotulado, porque un peso mal asignado es peor que un peso sin asignar.
function acumularEnCuenta(acc, slug, tipoPaquete, monto, catalogo) {
  acc.porCuenta = acc.porCuenta || {};
  const sinClasificar = (motivo) => {
    acc.sinCuenta.monto += monto;
    acc.sinCuenta.filas++;
    if (motivo && !acc.sinCuenta.motivos.includes(motivo)) acc.sinCuenta.motivos.push(motivo);
  };
  const ce = catalogo[slug];
  // Un evento que no está en el catálogo NO se resuelve por omisión: sin `ev`,
  // `cuentaParaPaquete` devolvería el banco por defecto, que sería una suposición.
  if (!ce) return sinClasificar(`el evento "${slug}" no está en el catálogo`);
  let c = null;
  try { c = cuentaParaPaquete(ce, tipoPaquete); }
  catch (e) {
    // FAIL-LOUD de AUD-2: paquete desconocido (incluye null, vacío y basura).
    return sinClasificar(`paquete sin reconocer: "${tipoPaquete == null ? 'sin capturar' : tipoPaquete}"`);
  }
  const bucket = c && CLABE_A_CUENTA[String(c.clabe || '').replace(/\s/g, '')];
  if (!bucket) return sinClasificar(`cuenta fuera de las conocidas: "${(c && c.nombre) || '—'}"`);
  acc.porCuenta[bucket] = (acc.porCuenta[bucket] || 0) + monto;
}

// ── Reúne el mundo migrado de un evento (o de todos si evento_id es null).
//
// [SAL-1] …y de paso lo REPARTE POR CUENTA BANCARIA, cuando el llamador manda el
// catálogo. Va aquí y no en una función nueva a propósito: el reparto tiene que
// sumar EXACTAMENTE lo mismo que `cobrado`, y la única manera de garantizarlo es
// que salga de la misma pasada sobre las mismas filas con el mismo
// `saldoMigrado`. Dos lecturas serían dos oportunidades de divergir.
async function mundoKH(leerKH, evento_id, catalogo) {
  const filtroV = evento_id
    ? `evento_id=eq.${encodeURIComponent(evento_id)}&`
    : '';
  // [SAL-1] `tipo_paquete` viaja en la MISMA fila que ya se leía. Se llama así
  // —leído del `information_schema`, no recordado—: NO es `paquete`.
  const rv = await leerKH('viajeros_evento', `${filtroV}select=id,evento_id,total_contrato,abonado_previo,tipo_paquete&limit=20000`);
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
    const e = porEvento[slug] = porEvento[slug] || {
      filas: 0, conContrato: 0, sinContrato: 0, vendido: 0, cobrado: 0, deben: 0, aFavor: 0, debenMenosAFavor: 0,
      porCuenta: null, sinCuenta: { monto: 0, filas: 0, motivos: [] },
    };
    e.filas++;
    const s = saldoMigrado(v, abonosPorViajero[v.id]);
    if (!s) { e.sinContrato++; return; }
    e.conContrato++;
    e.vendido += s.total;
    e.cobrado += s.abonado;
    if (s.resta > 0) e.deben += s.resta; else e.aFavor += -s.resta;
    if (catalogo) acumularEnCuenta(e, slug, v.tipo_paquete, s.abonado, catalogo);
  });
  Object.keys(porEvento).forEach((k) => { porEvento[k].debenMenosAFavor = porEvento[k].deben - porEvento[k].aFavor; });
  return { data: porEvento };
}

const KH_VACIO = { filas: 0, conContrato: 0, sinContrato: 0, vendido: 0, cobrado: 0, deben: 0, aFavor: 0, debenMenosAFavor: 0, porCuenta: null, sinCuenta: { monto: 0, filas: 0, motivos: [] } };

// ── Reúne el mundo Portal (cobrado por evento + viajeros por evento + gastos).
async function mundoPortal(leerP) {
  // [AUD-1b] `precio_total` = lo FACTURADO (contratado), que no es lo mismo que
  // lo cobrado. La pantalla de Ventas enseña las dos, y confundirlas haría que
  // "Pendiente" saliera siempre en cero.
  // [UTIL-C] Vuelve a su forma original: las columnas extra las pidió UTIL-B
  // para costear por zona, y bajo C la inversión no depende de lo vendido. Un
  // `select` que trae lo que nadie lee se lee como si alguien lo leyera.
  const rs = await leerP('solicitudes_tour', `estado=in.(${ESTADOS_CUENTAN.join(',')})&select=id,evento_id,num_personas,precio_total&limit=20000`);
  if (rs.error) return rs;
  const rp = await leerP('pagos', 'estado=eq.pagado&select=solicitud_id,monto,monto_pagado&limit=20000');
  if (rp.error) return rp;
  // [UTIL-B] `categoria` viaja para poder excluir los pagos de BOLETOS. Una
  // columna más en la MISMA consulta, no una fuente nueva.
  const rg = await leerP('gastos', 'select=evento_id,monto,categoria&limit=20000');
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
  // [UTIL-B] ⚠️ LOS PAGOS DE BOLETOS NO SON GASTO PARA LA UTILIDAD.
  //
  // Bajo la fórmula B el costo de un boleto entra por "costo de lo vendido", en
  // el momento en que se vende. Si además contara como gasto, el mismo dinero
  // restaría DOS VECES. Se excluye por CATEGORÍA y no por proveedor: el mismo
  // proveedor puede venderte boletos Y un servicio — el proveedor dice a quién
  // le pagas, la categoría dice QUÉ le pagas, y la fórmula necesita lo segundo.
  //
  // Se excluye en la SUMA, no en la consulta: la fila sigue existiendo y se
  // sigue viendo en la lista de Gastos. Esto también repara lo histórico sin
  // tocar un solo dato, y es auto-reparador: si alguien vuelve a capturar un
  // gasto de boletos por otra puerta, tampoco contará dos veces.
  let gastosBoletos = 0;
  rg.data.forEach((g) => {
    const slug = baseSlug(g.evento_id);
    if (esGastoDeBoletos(g)) { gastosBoletos += n(g.monto); return; }
    if (!slug) { gastosSinEvento += n(g.monto); return; }
    gastos[slug] = (gastos[slug] || 0) + n(g.monto);
  });
  return { data: { cobrado, viajeros, gastos, facturado, gastosSinEvento, gastosBoletos } };
}

// [UTIL-B] La señal de que un gasto es un pago de BOLETOS. Vive en UNA función
// porque la usan la suma de gastos y el arnés — y porque el día que cambie, hay
// un solo sitio donde cambiarla. `'Boletos'` es el valor EXACTO del catálogo de
// `_lib/categorias-gasto`, que es sensible a mayúsculas a propósito.
// ═══════════════════════════════════════════════════════════════════════════
// [UTIL-C] LA INVERSIÓN TOTAL EN BOLETOS
//
//   utilidad del evento = COBRADO − INVERSIÓN TOTAL EN BOLETOS − GASTOS
//
// ⚠️ INVERSIÓN **TOTAL**, no "costo de lo vendido". Es el compromiso COMPLETO
// del evento: lo comprado, pagado o no. La razón es de negocio y la firmó Memo:
// **los boletos no tienen devolución**. En cuanto se compran son de Memo sí o
// sí, así que la utilidad tiene que cargarlos enteros desde el primer día — y
// no ir descubriéndolos conforme se venden.
//
// Consecuencia que hay que decir: un evento arranca en ROJO por el monto de su
// pedido, y ese rojo es correcto — todavía no ha recuperado lo que puso.
//
// ⚠️ AQUÍ VIVIÓ `costoDeLoVendido` (UTIL-B), que cargaba SOLO lo vendido. Era
// contabilidad de margen; C es contabilidad de compromiso. Se retira porque
// publicar un número que la fórmula ya no usa es dejarlo esperando a que
// alguien lo lea como si mandara.
function inversionDesconocida() {
  return { total: null, parcial: false, zonas_sin_costo: [] };
}

// Del desglose por zona que `cuentaDeEvento` YA calculó para la bodega: cero
// consultas nuevas. `z.inversion` es cantidad × costo_unitario, sumado por
// `_lib/disponibilidad` desde MER-1 — y una compra SIN costo no entra, así que
// se dice `parcial` en vez de fingir que fue gratis.
function inversionTotalDeZonas(zonas) {
  const out = { total: 0, parcial: false, zonas_sin_costo: [] };
  (Array.isArray(zonas) ? zonas : []).forEach((z) => {
    if (!z) return;
    out.total += Number(z.inversion) || 0;
    // Compradas sin costo: la inversión queda incompleta y hay que decirlo.
    if ((Number(z.compradas) || 0) > 0 && !(Number(z.costo_unit) > 0)) {
      out.parcial = true;
      if (z.zona && !out.zonas_sin_costo.includes(z.zona)) out.zonas_sin_costo.push(z.zona);
    }
  });
  return out;
}

// Y para TODOS los eventos, en UNA lectura de `compras`. Bajo C ya no hacen
// falta las ventas por zona —la inversión no depende de lo vendido—, así que
// esta pasada es más simple que la de UTIL-B y los `select` que se habían
// ensanchado para aquello vuelven a su forma original.
async function inversionDeTodos(leerKH) {
  const rc = await leerKH('compras', 'select=evento_id,cantidad,costo_unitario&limit=20000');
  if (rc.error) return rc;
  const out = {};
  rc.data.forEach((c) => {
    const ev = baseSlug(c.evento_id);
    if (!ev) return;
    const cant = parseInt(c.cantidad, 10) || 0;
    const cu = Number(c.costo_unitario);
    out[ev] = out[ev] || { total: 0, parcial: false, zonas_sin_costo: [] };
    if (Number.isFinite(cu) && cu > 0 && cant > 0) out[ev].total += cant * cu;
    else if (cant > 0) out[ev].parcial = true;
  });
  return { data: out };
}

const CATEGORIA_BOLETOS = 'Boletos';
function esGastoDeBoletos(g) {
  return !!g && String(g.categoria || '').trim() === CATEGORIA_BOLETOS;
}

// ── Deuda a proveedores por evento: COMPRAS − ABONOS (KH).
//
// ⚠️ [KMS-SIMP-4] AQUÍ HABÍA UN TERCER TÉRMINO, `servicios_proveedor`, Y NO
// DEBE VOLVER. Decisión de Memo, coherente con FIN-1 desde el origen: un
// servicio (transporte, sonido) SE PAGA AL MOMENTO, así que es un GASTO y se
// captura donde se capturan los gastos. La ÚNICA deuda del negocio es la de
// BOLETOS a crédito. Sumar servicios aquí mezclaba "lo que ya pagué" con "lo
// que debo", y hacía que un gasto se viera como pasivo.
//
// Si alguien lee esta función y piensa "falta el término de servicios": no
// falta, se quitó a propósito. La tabla quedó vacía (0 filas al retirarlo) y
// su alta ya no existe en ningún lado.
async function deudaProveedores(leerKH, evento_id) {
  const f = evento_id ? `evento_id=eq.${encodeURIComponent(evento_id)}&` : '';
  const [rc, ra] = await Promise.all([
    leerKH('compras', `${f}select=evento_id,cantidad,costo_unitario&limit=20000`),
    leerKH('abonos', `${f}select=evento_id,monto&limit=20000`),
  ]);
  if (rc.error) return rc;
  if (ra.error) return ra;
  const out = {};
  const suma = (slug, v) => { if (!slug) return; out[slug] = (out[slug] || 0) + v; };
  rc.data.forEach((c) => suma(baseSlug(c.evento_id), (parseInt(c.cantidad, 10) || 0) * n(c.costo_unitario)));
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
  let bodega = bodegaDesconocida(o.pasado);
  const disp = await cargarDisponibilidad({
    khUrl: o.khUrl, khKey: o.khService,
    portalUrl: o.portalUrl, portalKey: o.portalService,
    evento_id, fetchImpl: o.fetchImpl,
  });
  let inversion = inversionDesconocida();
  if (!disp.error) {
    const zonas = [...new Set([
      ...Object.keys(disp.stockPorZona || {}),
      ...Object.keys(disp.ajustesPorZona || {}),
    ])].map((z) => desgloseZona(disp, z));
    bodega = bodegaDeZonas(zonas, o.preciosPorZona, o.pasado);
    // [UTIL-C] La inversión sale de las MISMAS zonas que la bodega: cero
    // consultas nuevas. Sin stock se queda la desconocida de arriba — que NO es
    // cero: un cero diría "esos boletos fueron gratis".
    inversion = inversionTotalDeZonas(zonas);
  }
  // Sin stock NO se afirma una bodega vacía: se queda la desconocida de arriba.

  return armarCuenta({
    inversion,
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

  // [UTIL-C] La inversión total de TODOS, en UNA lectura de `compras`. Más
  // simple que la de UTIL-B: la inversión no depende de lo vendido, así que no
  // hacen falta las ventas por zona.
  const inv = await inversionDeTodos(leerKH);
  if (inv.error) return inv;

  const slugs = [...new Set([
    ...Object.keys(p.data.cobrado || {}),
    ...Object.keys(p.data.facturado || {}),
    ...Object.keys(p.data.viajeros || {}),
    ...Object.keys(p.data.gastos || {}),
    ...Object.keys(k.data || {}),
    ...Object.keys(d.data || {}),
  ])].filter(Boolean).sort();

  // [MER-1] QUÉ EVENTOS YA PASARON — se RECIBE, no se calcula.
  //
  // Este lib no pregunta qué día es hoy, y es a propósito: la fecha de un evento
  // vive en el catálogo de `index.html` (el mismo que ya inyecta los precios, y
  // por la misma razón — el servidor no lo tiene), así que si aquí naciera un
  // reloj habría DOS definiciones de "ya pasó": la del navegador y la de acá. Una
  // divergencia más esperando nacer, y encima con zona horaria de por medio, que
  // en esta casa es donde se cae todo (`toISOString` nunca es hoy en México).
  // El navegador clasifica con el helper de la casa y manda la lista; aquí solo
  // se marca. Sin lista, NINGÚN evento es pasado y todo se comporta como antes.
  const pasados = new Set((Array.isArray(o.eventosPasados) ? o.eventosPasados : []).map(baseSlug).filter(Boolean));

  const eventos = {};
  slugs.forEach((slug) => {
    eventos[slug] = armarCuenta({
      evento_id: slug,
      ventasPortal: n((p.data.cobrado || {})[slug]),
      facturadoPortal: n((p.data.facturado || {})[slug]),
      viajerosPortal: n((p.data.viajeros || {})[slug]),
      gastos: n((p.data.gastos || {})[slug]),
      inversion: (inv.data || {})[slug] || { total: 0, parcial: false, zonas_sin_costo: [] },
      kh: (k.data || {})[slug] || KH_VACIO,
      deuda: n((d.data || {})[slug]),
      bodega: bodegaDesconocida(pasados.has(slug)),
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
      eventos[slug].bodega = bodegaDeZonas(zonas, precios[slug], pasados.has(slug));
    }
  }

  // Los agregados de empresa, definidos UNA vez (antes vivían en tres lugares).
  const tot = { ventas: 0, gastos: 0, ganancia: 0, viajeros: 0, eventos_con_movimiento: slugs.length, desconocido: false,
                // [UTIL-C] El TOTAL suma las mismas tres piezas que cada renglón.
                facturado: 0, inversion_boletos: 0, en_mano: 0, inversion_parcial: false };
  // [E5-1/E5-2] La deuda a proveedores de TODA la empresa. Se suma aquí, donde
  // viven los datos, por la misma razón que la caja total: si la sumara la
  // pantalla sería la fórmula número doce, y encima una que nadie más podría
  // reusar. Va en su propio acumulador y NO toca `ganancia` — la deuda es
  // INFORMATIVA (así está dicho arriba, en la cabecera de esta lib) y restarla
  // convertiría "lo que debo" en "lo que gané de menos", que son dos cosas
  // distintas y una de ellas es falsa.
  tot.deuda_proveedores = 0;
  slugs.forEach((s) => { tot.deuda_proveedores += n(eventos[s].deuda_proveedores); });
  slugs.forEach((s) => {
    const e = eventos[s];
    if (e.ventas == null) { tot.desconocido = true; return; }
    tot.ventas += e.ventas; tot.gastos += e.gastos; tot.viajeros += e.viajeros;
    // [UTIL-C] El TOTAL se suma de las MISMAS piezas que el renglón, no de una
    // resta aparte: sumar `ganancia` por evento y sumar sus partes tienen que
    // dar lo mismo, y la única forma de garantizarlo es no tener dos caminos.
    tot.facturado += n(e.facturado);
    tot.inversion_boletos += n(e.inversion_boletos);
    tot.en_mano += n(e.en_mano);
    if (e.inversion_parcial) tot.inversion_parcial = true;
  });
  // [UTIL-C] La utilidad de la empresa es la MISMA fórmula que la del evento —
  // COBRADO − INVERSIÓN − GASTOS — sumada sobre sus partes. Ojo con la pieza
  // que cambió: bajo UTIL-B el primer término era lo FACTURADO (lo vendido,
  // cobrado o no); hoy es lo que está EN MANO. `facturado` sigue publicándose
  // porque las pantallas lo pintan aparte, pero ya no entra en la resta.
  tot.ganancia = tot.desconocido ? null : tot.en_mano - tot.inversion_boletos - tot.gastos;
  if (tot.desconocido) { tot.ventas = null; tot.viajeros = null; tot.facturado = null; tot.inversion_boletos = null; tot.en_mano = null; }
  // [AUD-1c] La bodega de la empresa: solo suma lo que SE PUDO valorar. Si
  // ningún evento trajo precios, el valor es null (desconocido), no 0.
  //
  // [MER-1] Y en DOS montones que no se mezclan. Sumar los boletos de un evento
  // que ya pasó a los de uno que viene sería volver a decir la mentira que esta
  // tuerca vino a quitar, solo que a nivel empresa: el total diría "esto se
  // puede vender" incluyendo lo que ya no se puede vender nunca.
  //   bodega_* → SOLO eventos por venir. Es esperanza y se puede realizar.
  //   merma_*  → SOLO eventos pasados. Es costo hundido y ya se perdió.
  let boletos = 0, valor = 0, algo = false, algoValor = false;
  // [UTIL-B-3] Y lo que COSTARON los vendibles. Bajo la fórmula B, el costo de un
  // boleto NO vendido todavía no entró a la utilidad — es inventario. Sin esta
  // cifra, el "si se vende todo" sumaría el precio de venta sin restar su costo,
  // y prometería una ganancia que no existe.
  let bCosto = 0, bAlgoCosto = false;
  let mBoletos = 0, mCosto = 0, mAlgo = false, mAlgoCosto = false;
  slugs.forEach((s) => {
    const b = eventos[s].bodega || {};
    if (b.pasado) {
      if (b.boletos != null) { mBoletos += b.boletos; mAlgo = true; }
      if (b.costo_hundido != null) { mCosto += b.costo_hundido; mAlgoCosto = true; }
      return;
    }
    if (b.boletos != null) { boletos += b.boletos; algo = true; }
    if (b.valor_estimado != null) { valor += b.valor_estimado; algoValor = true; }
    if (b.costo_hundido != null) { bCosto += b.costo_hundido; bAlgoCosto = true; }
  });
  tot.bodega_boletos = algo ? boletos : null;
  tot.bodega_valor = algoValor ? valor : null;
  tot.bodega_costo = bAlgoCosto ? bCosto : null;   // [UTIL-B-3]
  tot.merma_boletos = mAlgo ? mBoletos : null;
  tot.merma_costo = mAlgoCosto ? mCosto : null;
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

// ═══════════════════════════════════════════════════════════════════════════
// [SAL-1] EL DINERO MIGRADO, REPARTIDO POR CUENTA BANCARIA — para `admin-saldos`.
//
// Saldos preguntaba solo al Portal, y con melanie eso significaba puras SALIDAS:
// BBVA pintaba −$147,172 (los gastos del evento) sin una sola entrada, porque el
// dinero de los migrados entró por fuera del Portal. No era un error de cálculo:
// era media pregunta.
//
// ESTO NO ES UN DOBLE CONTEO CON `cuentasDeTodos`. Son dos cortes del MISMO
// dinero, no dos sumas encadenadas: aquélla contesta "¿cuánto ganó este evento?"
// y ésta "¿cuánto debería haber en esta cuenta?". Ninguna alimenta a la otra. Lo
// que sí sería doble conteo es que un migrado se capturara ADEMÁS como `pago` del
// Portal — por eso este camino lee SOLO `viajeros_evento`/`abonos_viajero`, nunca
// la tabla `pagos`, y el arnés vigila que ningún pago del Portal caiga sobre un
// viajero migrado.
//
// Pasa por el MISMO `mundoKH` que usa la ganancia: una lectura, un `saldoMigrado`,
// y por construcción la suma de las cubetas es el mismo `cobrado`.
//
//   migradosPorCuenta({ khUrl, khService, catalogo, rol, fetchImpl? })
//     → { por_cuenta: { BBVA: n, Banamex: n }, total, sin_clasificar: { monto,
//         filas, motivos }, por_evento: { "<slug>": {…} }, ve_migrados }
//     | { error, detail }
async function migradosPorCuenta(opts) {
  const o = opts || {};
  const _fetch = o.fetchImpl || fetch;
  // El MISMO gate de VJ-3: sin permiso no se ve el dinero migrado, y lo que se
  // devuelve es `null` (no te toca verlo), no cero (no hay).
  if (!puedeVerMigrados(o.rol)) {
    return { por_cuenta: null, total: null, sin_clasificar: null, por_evento: null, ve_migrados: false };
  }
  if (!o.catalogo) return { error: 'sin catálogo no se puede saber a qué cuenta entró cada paquete' };
  const leerKH = hacerLeer(_fetch, o.khUrl, o.khService);
  const k = await mundoKH(leerKH, null, o.catalogo);
  if (k.error) return k;

  const por_cuenta = {};
  const sin_clasificar = { monto: 0, filas: 0, motivos: [] };
  let total = 0;
  Object.keys(k.data).forEach((slug) => {
    const e = k.data[slug];
    Object.keys(e.porCuenta || {}).forEach((c) => {
      por_cuenta[c] = (por_cuenta[c] || 0) + e.porCuenta[c];
      total += e.porCuenta[c];
    });
    sin_clasificar.monto += e.sinCuenta.monto;
    sin_clasificar.filas += e.sinCuenta.filas;
    e.sinCuenta.motivos.forEach((m) => { if (!sin_clasificar.motivos.includes(m)) sin_clasificar.motivos.push(m); });
    total += e.sinCuenta.monto;
  });
  return { por_cuenta, total, sin_clasificar, por_evento: k.data, ve_migrados: true };
}

module.exports = {
  cuentaDeEvento,
  cuentasDeTodos,
  migradosPorCuenta,
  // exportados para el arnés (puros, sin BD):
  saldoMigrado,
  bodegaDeZonas,
  bodegaDesconocida,
  armarCuenta,
  acumularEnCuenta,          // [SAL-1] puro
  // [UTIL-C] Se exportan para que el arnés ejercite la regla REAL, no una copia.
  inversionTotalDeZonas, inversionDesconocida, esGastoDeBoletos, CATEGORIA_BOLETOS,
  CLABE_A_CUENTA,
  ROLES_DINERO_MIGRADO,
  baseSlug,
};
