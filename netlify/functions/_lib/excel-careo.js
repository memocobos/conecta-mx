// =============================================================================
// _lib/excel-careo.js — el protocolo del careo Excel↔KameHouse (EXCEL-BOTÓN-1b)
// =============================================================================
// Todo lo que sabe interpretar una pestaña vive AQUÍ, en funciones puras, para
// que un arnés pueda carearlo contra filas reales. Ni el Apps Script ni la
// pantalla interpretan nada: uno trae la rejilla, la otra pinta el resultado.
//
// EL PROTOCOLO NO ES MÍO. Sale de los tres careos que Jane corrió a mano contra
// el Excel de verdad, y se hereda tal cual — inventarle mejoras a un protocolo
// probado contra 2,223 viajeros es cambiar lo que funciona por lo que me parece.
// =============================================================================

// ── nombres ─────────────────────────────────────────────────────────────────
// minúsculas · sin acentos · espacios colapsados. Es la llave del careo: dos
// filas con el mismo nombre normalizado son LA MISMA PERSONA.
function normalizarNombre(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // los acentos, por su rango: escribirlos literales los deja a merced del editor
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// La chatarra: filas que no son viajeros sino reventa o control interno. Se
// mira sobre el nombre YA normalizado, porque en el Excel viene de todas las
// formas («Vendido Memo», «VENDIDO», «Coordi Sofía»).
// [EXCEL-CAREO-FIX-1] CUATRO ENTRADAS NUEVAS, salidas del barrido completo del
// 31-ago: son las ÚNICAS cuatro filas que el careo reportaba como «nuevos» en
// las 58 pestañas, y ninguna es una persona. Ruido puro en la pantalla de Bulma.
//
//   · 'creadora'      → «Marietta Barrera creadora»
//   · 'tours reynosa' → la agencia, no un viajero
//   · 'cambio por oro'→ control interno
//   · 'coodinador'    → EL TYPO, y necesita entrada propia: `coodinador` NO
//                       contiene `coordi` (le falta la r), así que la entrada
//                       que ya existía no lo alcanzaba. Medido, no supuesto.
//
// Todas se miran por `includes` sobre el nombre YA normalizado — la misma
// apuesta que ya corría 'coordi', que muerde «Ana Coordinadora». Queda dicho el
// costo: un nombre que CONTENGA una de estas cadenas se descartaría. Las tres
// nuevas de varias palabras casi no tienen con qué chocar; la de una palabra
// ('creadora') es la que corre el riesgo real, y el precio de no ponerla es
// meter a una creadora como viajera.
const CHATARRA = ['vendido', 'coordinador', 'coordi', 'coodinador', 'hubb',
                  'viagogo', 'creadora', 'tours reynosa', 'cambio por oro'];
function esChatarra(nombre) {
  const n = normalizarNombre(nombre);
  if (!n) return true;                       // una fila sin nombre no es nadie
  return CHATARRA.some((p) => n.includes(p));
}

// ── dinero ──────────────────────────────────────────────────────────────────
// El Apps Script manda lo que el humano VE: «$1,243.00», «1243», «$ 1,000», ''.
// Todo lo que no sea un número se lee como cero, nunca como NaN: un NaN se
// propaga a la suma y convierte un abonado real en «no es un número».
function leerDinero(celda) {
  const s = String(celda == null ? '' : celda).replace(/[^0-9.\-]/g, '');
  if (!s || s === '-' || s === '.') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// ── el mapa de columnas ─────────────────────────────────────────────────────
// ⚠️ EL SEPARO NO TIENE ENCABEZADO. Va en la columna vacía JUSTO DESPUÉS de
// «Boleto», y ése fue el hoyo que hizo que un careo entero «encontrara» restas
// parejas que no existían (29-ago). Se busca por POSICIÓN, no por nombre,
// porque nombre no tiene.
//
// Los pagos se encabezan «1», «2», … «10». Y algunas pestañas traen además
// «Separo» o «Preventa» CON nombre — en Pa'l Norte la preventa hace de separo.
// Se suman todas las que se encuentren, y el mapa viaja en la respuesta: si una
// pestaña tiene el mapa raro, se ve, en vez de dar un número mal en silencio.
function mapearColumnas(filaEncabezado) {
  const celdas = (filaEncabezado || []).map((x) => String(x == null ? '' : x).trim());
  const norm = celdas.map((x) => normalizarNombre(x));
  const idx = (nombre) => norm.indexOf(normalizarNombre(nombre));

  const nombre = idx('Nombre');
  const boleto = idx('Boleto');
  const mapa = {
    nombre,
    paquete: idx('Paquete'),
    boleto,
    // la vacía justo después de Boleto
    separoSinNombre: (boleto >= 0 && celdas[boleto + 1] === '') ? boleto + 1 : -1,
    separoNombrado: idx('Separo'),
    preventa: idx('Preventa'),
    talla: idx('Talla'),
    correo: idx('Correo'),
    celular: idx('Celular'),
    codigo: idx('Codigo'),
    // [CUADRE-1a] LA COLUMNA DEL TOTAL DE CONTRATO. El encabezado se MIDIÓ
    // contra el Apps Script de producción el 20-sep-2026, en ocho pestañas
    // reales: las ocho lo escriben «Total», y es el total REAL por persona —
    // trae el hotel adentro (Young Miko: Costo 5300 + Pago Hab 650 = Total
    // $5,950), que es justo lo que al derivado del catálogo le falta.
    //
    // Se busca POR ENCABEZADO y no por posición porque LA POSICIÓN NO ES
    // ESTABLE, también medido: va en la 21 en siete de las ocho y en la 22 en
    // «Bruno Mars - 4 de diciembre», que trae una columna vacía de más antes de
    // «Preventa». Contar celdas habría leído «Abonado» como si fuera el total.
    //
    // ⚠️ NO ENTRA A `mapa.dinero`. Ahí viven las columnas que se SUMAN para el
    // abonado; meter el total ahí inflaría el abonado de todo el mundo y el
    // montón de pagos se volvería basura. El total es otra cuenta.
    total: idx('Total'),
    // [CUADRE-6] LA COLUMNA DEL VUELO. Regla de Memo (24-sep-2026): «hay una
    // columna de vuelos en el Excel con el costo; intentemos cuadrar con eso».
    //
    // El encabezado literal es **«Avión - Bus»** y la columna **VARÍA**: medido
    // por Jane el 25-sep sobre 4 pestañas de CDMX servidas por el cosechador
    // real, va en la **19** (EDC, Corona) y en la **20** (Bruno, Knotfest). Se
    // busca POR EL LITERAL DEL ENCABEZADO, jamás por índice fijo — la misma
    // razón por la que `Total` se busca así desde CUADRE-1a: contar celdas
    // habría leído «Código» en las pestañas con una vacía de más.
    //
    // ⚠️ NO CONFUNDIR con el bloque de costos del evento (fila 4, col ~30:
    // «Vuelos/Kits/Boletos/Van/Hotel…»): ése es el gasto TOTAL del evento y no
    // es de esta tuerca. Aquí el valor es POR PERSONA.
    //
    // ⚠️ Y NO ENTRA A `mapa.dinero`, por lo mismo que `total`: ahí viven las
    // columnas que se SUMAN para el abonado, y meter el vuelo inflaría el
    // abonado de todo el mundo. El vuelo es otra cuenta.
    avionBus: idx('Avión - Bus'),
    pagos: [],
  };
  for (let i = 0; i < celdas.length; i++) {
    if (/^([1-9]|10)$/.test(celdas[i])) mapa.pagos.push(i);
  }
  // Las columnas de dinero, en un solo lugar para que la suma y el reporte
  // hablen de lo mismo.
  mapa.dinero = [mapa.separoSinNombre, mapa.separoNombrado, mapa.preventa, ...mapa.pagos]
    .filter((i) => i >= 0);
  return mapa;
}

// ── la pestaña, leída ───────────────────────────────────────────────────────
// filas crudas + dónde está el encabezado → una persona por nombre, con su
// dinero SUMADO. Dos filas del mismo nombre son la misma persona comprando dos
// boletos: se suman, no se pisan ni se duplican.
//
// `reglaZona`: cuando una pestaña se reparte entre varios eventos (Corona
// Capital), solo entran las filas cuya zona sea EXACTAMENTE ese texto. Exacto y
// no «contiene», porque «General» se tragaría a «General Viernes» y los tres
// eventos acabarían con las mismas personas.
function parsearPestana(filas, encabezado, reglaZona) {
  const cabecera = (filas || [])[encabezado ? encabezado.fila : 0] || [];
  const mapa = mapearColumnas(cabecera);
  const out = new Map();
  const descartes = { chatarra: 0, sinNombre: 0, otraZona: 0 };
  // [BOLETOS-1 adenda] LA CHATARRA TAMBIÉN CONSUME BOLETO.
  //
  // «Vendido Alex», una creadora, un coordinador: NO son viajeros —por eso se
  // descartan del careo de DINERO, y eso no cambia— pero ocupan un lugar, y su
  // casa en el sistema ya existe: `stock_ajustes.vendidos_fuera`.
  //
  // Medido sobre la pestaña real de Soy Luna: 8 boletos de chatarra (VIP 2,
  // Platino 1, Balcón 2, Megacable 2, Plata 1) que el sistema no veía —
  // `stock_ajustes` de soyluna estaba VACÍO—. La cuenta completa del Excel es
  // `restan = pedido − boletos de clientes − chatarra de esa zona`.
  //
  // 🔒 VIAJA APARTE, JAMÁS FUNDIDA CON LAS PERSONAS. Si entrara al montón de
  // gente, «Vendido Alex» se daría de alta como viajero.
  const chatarraPorZona = {};
  const desde = (encabezado ? encabezado.fila : 0) + 1;

  for (let i = desde; i < (filas || []).length; i++) {
    const f = filas[i] || [];
    const nombreCrudo = mapa.nombre >= 0 ? String(f[mapa.nombre] == null ? '' : f[mapa.nombre]).trim() : '';
    if (!nombreCrudo) { descartes.sinNombre++; continue; }
    if (esChatarra(nombreCrudo)) {
      descartes.chatarra++;
      // Se cuenta por zona. Sin zona no se le puede descontar a ninguna, y
      // repartirla sería inventar: se descarta y ya.
      //
      // ⚠️ Y RESPETA LA REGLA DE ZONA. La guarda de chatarra corre ANTES que el
      // filtro de `reglaZona` —porque un nombre de chatarra no es nadie, venga
      // de donde venga—, así que aquí hay que volver a preguntarlo: en una
      // pestaña repartida entre varios eventos (Corona Capital) la chatarra de
      // OTRA zona no es de este evento, y contarla le restaría stock ajeno.
      const zc = mapa.boleto >= 0 ? String(f[mapa.boleto] == null ? '' : f[mapa.boleto]).trim() : '';
      if (zc && (!reglaZona || normalizarNombre(zc) === normalizarNombre(reglaZona))) {
        chatarraPorZona[zc] = (chatarraPorZona[zc] || 0) + 1;
      }
      continue;
    }

    const zona = mapa.boleto >= 0 ? String(f[mapa.boleto] == null ? '' : f[mapa.boleto]).trim() : '';
    if (reglaZona && normalizarNombre(zona) !== normalizarNombre(reglaZona)) { descartes.otraZona++; continue; }

    const abonado = mapa.dinero.reduce((a, c) => a + leerDinero(f[c]), 0);
    // [CUADRE-1a] EL TOTAL DE LA FILA, Y EL HUECO DICHO APARTE.
    //
    // 🔒 UNA CELDA VACÍA NO ES UN TOTAL DE CERO. `leerDinero` contesta 0 tanto
    // para '' como para '$0', y aquí esos dos son cosas distintas: «$0» es un
    // contrato de cero pesos (143 filas reales de Karol G lo traen así) y ''
    // es «no sé». Medido el 20-sep: 13 de 403 filas-persona no traen total
    // legible, y la pestaña «Calle 24 - 3 de Sep» no lo trae en NINGUNA de sus
    // 12 — leerlas como cero llenaría el montón con doce diferencias que no
    // existen. Así que el hueco se mira en la celda CRUDA, antes de `leerDinero`.
    const celdaTot = mapa.total >= 0 ? f[mapa.total] : null;
    const totalLegible = mapa.total >= 0 && /[0-9]/.test(String(celdaTot == null ? '' : celdaTot));
    const totalFila = totalLegible ? leerDinero(celdaTot) : 0;
    // [CUADRE-6] EL VUELO DE LA FILA, con el MISMO candado del hueco que el
    // total: una celda VACÍA no es un vuelo de cero. `leerDinero` contesta 0
    // para '' y para '$0', y aquí esos dos son cosas distintas — un `$0`
    // TECLEADO en un paquete con avión no se sabe si es «no capturado» o
    // «todavía no compra vuelo», y eso solo lo afirma quien captura. Los dos
    // casos se quedan FUERA del montón, pero por razones distintas y dichas.
    const celdaVue = mapa.avionBus >= 0 ? f[mapa.avionBus] : null;
    const vueloLegible = mapa.avionBus >= 0 && /[0-9]/.test(String(celdaVue == null ? '' : celdaVue));
    const vueloFila = vueloLegible ? leerDinero(celdaVue) : 0;
    const clave = normalizarNombre(nombreCrudo);
    const ya = out.get(clave);
    if (ya) {
      // MISMA PERSONA, otra compra: se suma el dinero y se cuentan las filas.
      ya.abonado += abonado;
      ya.filas += 1;
      // [BOLETOS-1] CUÁNTOS BOLETOS Y EN QUÉ ZONAS. La pestaña lleva UNA FILA
      // POR BOLETO, así que `filas` ya era el conteo — lo que faltaba era saber
      // DÓNDE, porque la persona solo guardaba la PRIMERA zona. Sin este mapa
      // no se puede distinguir «4 boletos de la misma zona» —que se sincroniza
      // solo— de «boletos repartidos», que hay que preguntar: repartirlos entre
      // zonas sin fila sería inventar, y ya mordió con Angel.
      if (zona) ya.zonas[zona] = (ya.zonas[zona] || 0) + 1;
      // Dos boletos de la misma persona: los totales se SUMAN, igual que el
      // abonado. Pero si a UNA de las filas le falta el total, la suma de las
      // otras es un número que MIENTE por defecto — se marca incompleta y la
      // persona acaba con `total: null`, que es la verdad: no se sabe.
      ya.total += totalFila;
      if (!totalLegible) ya.totalIncompleto = true;
      // El vuelo se SUMA entre las filas del grupo, igual que el abonado y el
      // total: la pestaña lleva una fila por boleto y el valor es POR PERSONA,
      // así que un grupo de 4 que voló trae cuatro montos que son su vuelo.
      ya.vuelo += vueloFila;
      if (!vueloLegible) ya.vueloIncompleto = true;
      if (!ya.zona && zona) ya.zona = zona;
      if (!ya.talla && mapa.talla >= 0) ya.talla = String(f[mapa.talla] == null ? '' : f[mapa.talla]).trim();
    } else {
      out.set(clave, {
        nombre: nombreCrudo, clave, abonado, filas: 1, zona,
        // ⚠️ `zona` (la primera) SE QUEDA: hay consumidores que la leen y
        // cambiarla sería otra tuerca. `zonas` se AÑADE al lado.
        zonas: zona ? { [zona]: 1 } : {},
        total: totalFila, totalIncompleto: !totalLegible,
        vuelo: vueloFila, vueloIncompleto: !vueloLegible,
        paquete: mapa.paquete >= 0 ? String(f[mapa.paquete] == null ? '' : f[mapa.paquete]).trim() : '',
        // [EXCEL-CAREO-FIX-1] La talla no se usa para decidir nada: viaja como
        // EVIDENCIA, para poder cuadrar el montón de apartados contra las 141
        // filas que Jane contó a mano («zona real + $0 + sin talla»).
        talla: mapa.talla >= 0 ? String(f[mapa.talla] == null ? '' : f[mapa.talla]).trim() : '',
      });
    }
  }
  // El hueco se resuelve al final, una sola vez: quien traiga aunque sea una
  // fila sin total legible sale con `total: null` — ausencia, no cero.
  const personas = [...out.values()].map((p) => {
    const { totalIncompleto, vueloIncompleto, ...resto } = p;
    return { ...resto, total: totalIncompleto ? null : p.total,
             // `null` = no se sabe (columna ausente o celda vacía en alguna de
             // sus filas). `0` = el cero TECLEADO. Dos cosas distintas.
             vuelo: vueloIncompleto ? null : p.vuelo };
  });
  return { personas, mapa, descartes, chatarraPorZona };
}

// ── el careo ────────────────────────────────────────────────────────────────
// SEIS montones, por nombre normalizado. `base` son los viajeros del sistema,
// ya con su abonado sumado.
//
// La tolerancia es de UN PESO, la misma que usa la reconciliación del dinero en
// el Portal: un centavo de redondeo no es una diferencia de pagos.
const TOLERANCIA_MXN = 1;

// [EXCEL-CAREO-FIX-1] LA BASE YA NO SE COLAPSA POR NOMBRE.
//
// Antes: `new Map(viajeros.map(v => [norm(v.nombre), v]))`. Un Map con la misma
// llave se queda con el ÚLTIMO, así que dos viajeros DISTINTOS que se llaman
// igual entraban como uno y el otro DEJABA DE EXISTIR para el careo: no salía
// como igual, ni como baja, ni como nuevo. Medido: con dos «Jorge Rivera» en el
// sistema, el careo reportaba pagos sobre uno y el otro desaparecía — con su
// deuda dentro. Es la misma familia que la convención del Excel («dos filas
// iguales son la misma persona»), pero al revés y silenciosa: allá SUMA de más,
// aquí PIERDE de menos.
//
// Ahora la base se llavea a LISTA. Un nombre con más de un viajero no se
// resuelve solo: el careo lo DICE en su propio montón y no lo mete a ninguno de
// los otros. Adivinar cuál de los dos es sería inventar el dato que falta.
function agruparBase(viajerosBase) {
  const m = new Map();
  for (const v of (viajerosBase || [])) {
    const k = normalizarNombre(v.nombre);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  }
  return m;
}

// [CUADRE-1a] ¿El total del sistema es un DERIVADO del catálogo o un exacto de
// la libreta? TOTAL-1 etiquetó en `notas` cada fila que derivó — las dos formas
// que dejó («TOTAL-1: contrato derivado del catálogo…» y «sin paquete, derivado
// como PLUS del catálogo») comparten la palabra, así que la palabra es la llave.
function esDerivado(notas) {
  return normalizarNombre(notas).includes('derivado');
}

// ── [CUADRE-5] LA REGLA DEL $0 TECLEADO ────────────────────────────────────
// Regla firmada por Memo el 22-sep-2026, y ACOTADA por su propio ojo.
//
// Un `$0` TECLEADO en la pestaña deja de marcarse como diferencia —el total del
// sistema, derivado del catálogo, es el bueno POR DECRETO— pero SOLO cuando el
// index puede saber el total COMPLETO:
//
//   · eventos NO-CDMX (el paquete se arma con lo que el catálogo ya sabe), o
//   · paquete CHEAP en cualquier lado (es solo el boleto).
//
// ⚠️ LOS $0 DE EVENTOS CDMX EN PAQUETES CON TRANSPORTE QUEDAN FUERA, y no es un
// olvido: el autobús son $2,500 pero el AVIÓN se cotiza a mano, así que el
// index NO SABE el vuelo y su total estaría incompleto. Esos siguen pidiendo
// ojo humano. La acotación es de Memo, no mía.
//
// ⚠️ Y LOS «EXACTOS DE LIBRETA» TAMPOCO ENTRAN: el decreto dice que el bueno es
// el total DERIVADO del catálogo. Si alguien capturó el contrato real a mano,
// un $0 enfrente es un cambio que hay que mirar, no ruido que tapar.
//
// 🔒 `excel_total === 0` es el $0 TECLEADO. El `null` —la columna que no existe
// o la celda vacía— ya se salta antes y NUNCA fue una diferencia: son dos cosas
// distintas y confundirlas taparía el hueco además del cero.
const CUADRE5_FECHA = '22-sep-2026';
// ── [CUADRE-6] LA EXCLUSIÓN DE CDMX ENCOGE ─────────────────────────────────
// Regla de Memo (24-sep-2026). La acotación de CUADRE-5 decía que los `$0` de
// CDMX en paquetes con transporte se quedan fuera **porque el index no sabe el
// vuelo**. Ahora la pestaña SÍ lo dice: la columna «Avión - Bus» trae el monto
// por persona. Así que la exclusión encoge — deja de aplicar a quien trae su
// vuelo capturado, y **sigue aplicando a quien no**.
//
// 🔒 LA MEDICIÓN QUE LO HACE SEGURO: el dueño (`resolverPrecioVenta`) NO mete
// el transporte en el total de un evento de CDMX — medido el 25-sep sobre
// `edc27`: PLUS total 9100 = `zonaP` 9100 con **`transportCost: 0`**. O sea que
// el vuelo COMPLETA el total en vez de duplicarlo. Sin esa medición, sumar el
// vuelo habría sido contar el transporte dos veces.
//
// 🔴 Y UN CASO QUE EL ENCARGO NO ACOTA, medido: el **RIDE** de CDMX es un
// paquete «con transporte» cuyo total del sistema **YA ES** ese transporte
// (`edc27` RIDE: total 2900 con **`zonaP: 0`**). Sumarle el vuelo contaría el
// transporte DOS VECES. Por eso el vuelo solo completa cuando el total del
// dueño está armado sobre un BOLETO, y eso **se le pregunta a su respuesta**
// (`desglose.zonaP > 0`) en el runner — aquí no se adivina por el nombre del
// paquete.
//
// ⚠️ UN `$0` DE VUELO NO ABRE LA PUERTA, y tampoco una celda vacía: en un
// paquete con avión, «cero» no se distingue de «no capturado» ni de «todavía
// no compra vuelo», y eso solo lo afirma quien captura. Los dos se quedan
// fuera, con motivos DISTINTOS para que el conteo diga cuál es cada montón.
const CUADRE6_FECHA = '24-sep-2026';
function reglaCeroTecleado(fila, cdmx) {
  if (Number(fila.excel_total) !== 0) return { aplica: false, motivo: null };
  if (!fila.derivado) return { aplica: false, motivo: 'libreta' };
  const paq = String(fila.paquete || '').trim().toLowerCase();
  if (cdmx && paq !== 'cheap') {
    const v = Number(fila.vuelo);
    if (fila.vuelo == null) return { aplica: false, motivo: 'cdmx_sin_vuelo' };
    if (!(Number.isFinite(v) && v > 0)) return { aplica: false, motivo: 'cdmx_vuelo_cero' };
    // Entra POR EL VUELO, y se dice: el runner tiene que sumarlo y la pantalla
    // tiene que rotularlo. Sin esta marca, el runner tendría que volver a
    // preguntarse si este renglón es de CDMX — la segunda opinión sobre la
    // misma regla.
    return { aplica: true, motivo: null, clase: 'cdmx_con_vuelo', vuelo: v };
  }
  return { aplica: true, motivo: null, clase: 'catalogo' };
}

function carear(personasExcel, viajerosBase, opciones) {
  // `cdmx` lo sabe quien conoce el evento (el runner, contra el catálogo). Si
  // no llega, se asume CDMX: es el lado CONSERVADOR — deja los $0 en el montón
  // de diferencias en vez de taparlos con una regla que quizá no aplica.
  const cdmx = !opciones || opciones.cdmx == null ? true : !!opciones.cdmx;
  const enBase = agruparBase(viajerosBase);
  const enExcel = new Map((personasExcel || []).map((p) => [p.clave, p]));

  const nuevos = [], pagos = [], iguales = [], apartados = [], ambiguos = [];
  for (const p of enExcel.values()) {
    const mismos = enBase.get(p.clave) || [];

    // AMBIGUO: el nombre trae más de un viajero en el sistema. No se decide.
    if (mismos.length > 1) {
      ambiguos.push({ nombre: p.nombre, excel: p.abonado, filas: p.filas,
        viajeros: mismos.map((v) => ({ viajero_id: v.id, abonado: Number(v.abonado || 0) })) });
      continue;
    }
    const v = mismos[0];

    // APARTADO: el Excel no le registra UN PESO, y el sistema tampoco (o ni
    // siquiera lo tiene).
    //
    // 🔒 LA REGLA, FIRMADA POR MEMO: SI ESTÁ EN EL EXCEL, VA. La clase «zona
    // real + $0 + sin talla» no es ruido ni un apartado a medias: es GENTE, y
    // Memo la dio de alta —144 personas— por esa regla. Que no haya abonado un
    // peso todavía no la hace menos viajera; el Excel es el padrón, y este
    // montón NO es una sala de espera ni una puerta que haya que aprobar.
    //
    // Entonces ¿por qué separarlas? Porque revueltas se pierden dos veces: en
    // «nuevos» se confunden con altas que sí pagaron, y —peor— una vez dadas de
    // alta con $0 caen en «iguales», donde dos ceros cuadran y el renglón deja
    // de leerse aunque la persona deba. El montón existe para que SIGAN
    // VIÉNDOSE, que es lo contrario de filtrarlas.
    //
    // La llave del montón es EL DINERO EN CERO, no la regla compuesta «zona
    // real + $0 + sin talla» con que se descubrió la clase: quien no pagó pero
    // sí puso talla es exactamente igual de moroso, y una regla de tres partes
    // lo dejaría fuera en silencio. `zona` y `talla` viajan como evidencia para
    // poder cuadrar el conteo contra las 141 filas que se contaron a mano.
    if (p.abonado === 0 && (!v || Math.abs(Number(v.abonado || 0)) <= TOLERANCIA_MXN)) {
      apartados.push({ nombre: p.nombre, zona: p.zona, paquete: p.paquete,
        talla: p.talla || '', filas: p.filas,
        en_sistema: !!v, viajero_id: v ? v.id : null });
      continue;
    }

    if (!v) { nuevos.push({ nombre: p.nombre, abonado: p.abonado, zona: p.zona, paquete: p.paquete, filas: p.filas }); continue; }
    const dif = Math.round((p.abonado - Number(v.abonado || 0)) * 100) / 100;
    if (Math.abs(dif) > TOLERANCIA_MXN) {
      // [CUADRE-2a] `fuentes` se AÑADE, no sustituye nada: las llaves que los
      // consumidores ya leen (`excel`, `base`, `diferencia`) siguen tal cual.
      // Sin ella, una suma pestaña+libro no cuadra con NINGUNA de las dos hojas
      // por separado y manda a buscar el error donde no está.
      pagos.push({ nombre: p.nombre, viajero_id: v.id, excel: p.abonado,
        base: Number(v.abonado || 0), diferencia: dif, fuentes: p.fuentes || ['pestana'] });
    } else {
      iguales.push({ nombre: p.nombre, viajero_id: v.id, abonado: p.abonado });
    }
  }
  // BAJA: está en el sistema y ya no en el Excel. NO SE BORRA NADA — se nombra
  // y espera firma. Marcar es otra tuerca, y tiene que serlo.
  //
  // [EXCEL-CAREO-FIX-1] Se recorre la LISTA de viajeros, no las llaves del
  // agrupado: si dos homónimos se dieron de baja, son DOS bajas. Antes el Map
  // colapsado reportaba una sola y la otra persona se iba sin que nadie la
  // nombrara.
  const bajas = [];
  for (const v of (viajerosBase || [])) {
    if (!enExcel.has(normalizarNombre(v.nombre))) {
      bajas.push({ nombre: v.nombre, viajero_id: v.id, abonado: Number(v.abonado || 0) });
    }
  }
  // ── [CUADRE-1a] EL SÉPTIMO MONTÓN: LOS TOTALES DE CONTRATO ────────────────
  // Va en PASADA APARTE, no dentro del `for` de arriba, y es a propósito: el
  // bucle de los seis hace `continue` en ambiguos y en apartados, así que
  // colgarse de él habría dejado fuera justo a los apartados — que son los que
  // TOTAL-1 dejó con «⚠ total pendiente» esperando que el careo los cure. Un
  // montón que habla de OTRA cuenta (lo que la persona DEBE, no lo que ha
  // pagado) no tiene por qué heredar los saltos de la primera.
  //
  // 🔒 Y así los seis de antes quedan intactos: esta pasada no empuja a ninguno
  // ni le estrena llaves a sus renglones.
  //
  // Quién NO entra, y por qué:
  //   · `total: null` — la pestaña no trae la columna, o la celda vino vacía.
  //     Un hueco NO es una diferencia de dinero.
  //   · el que no está en el sistema — ya sale en `nuevos`; no hay contra qué
  //     restar.
  //   · el ambiguo — dos viajeros con ese nombre; elegir uno sería inventar.
  //
  // `derivado` sale de las notas de TOTAL-1 («contrato derivado del catálogo»):
  // una diferencia sobre un derivado es ESPERADA —el derivado es un piso, sin
  // hotel ni upgrades, y la pestaña gana—; sobre un exacto de la libreta es un
  // cambio real que hay que mirar. Es la señal que separa el ruido del hallazgo.
  const totalesContrato = [];
  // [CUADRE-5] Los dos montones nuevos: los $0 que la regla cubre, y la CUENTA
  // de los que se quedan fuera y por qué. 🔒 El conteo viaja en la respuesta
  // —no en un log— porque el encargo es que Memo VEA el tamaño de cada montón.
  const ceroRegla = [];
  const ceroFuera = {};
  for (const p of enExcel.values()) {
    if (p.total == null) continue;
    const mismos = enBase.get(p.clave) || [];
    if (mismos.length !== 1) continue;
    const v = mismos[0];
    // Un `total_contrato` NULL en la base no es cero: es «todavía no se sabe».
    // Se dice como null y se resta como cero, que es lo que la pantalla ya hace
    // con esas filas (cuenta-evento solo suma las que traen total). Así la fila
    // pendiente SALE en el montón en vez de quedarse invisible otro mes.
    const sis = (v.total_contrato == null || v.total_contrato === '') ? null : Number(v.total_contrato);
    const dif = Math.round((p.total - (sis == null ? 0 : sis)) * 100) / 100;
    const fila = {
      nombre: p.nombre, viajero_id: v.id, excel_total: p.total, sistema_total: sis,
      diferencia: dif, derivado: esDerivado(v.notas), filas: p.filas,
      zona: p.zona, paquete: p.paquete,
      // [CUADRE-6] El vuelo del GRUPO (sumado entre sus filas). `null` = no se
      // sabe; `0` = el cero tecleado.
      vuelo: p.vuelo == null ? null : Number(p.vuelo),
    };
    // [CUADRE-5] El $0 tecleado que cae en la regla sale del montón de
    // diferencias y va al suyo. NO se borra: Memo tiene que poder ver cuántos
    // son y quiénes. Un renglón que desaparece es un renglón que nadie revisa.
    //
    // 🔒 LA REGLA SE PREGUNTA **ANTES** DE LA TOLERANCIA, Y NO ES UN DETALLE DE
    // ORDEN: un «$0» tecleado contra un total del sistema en NULL o en 0 da
    // diferencia CERO, así que la tolerancia lo saltaría — y el caso que Memo
    // nombró por su nombre, «si algún renglón de la regla trae el total del
    // sistema en NULL/0, se pisa con el precio vivo del catálogo», NO PODRÍA
    // OCURRIR JAMÁS. Sería una guarda inalcanzable, la forma que esta casa ya
    // pagó tres veces. Detrás de la tolerancia el montón solo habría podido
    // traer los `origen:'base'`.
    const r = reglaCeroTecleado(fila, cdmx);
    // Los tres conteos PARTEN el total de los $0 tecleados (de personas con un
    // solo homónimo en el sistema): en la regla, fuera por CDMX, fuera por
    // libreta. Se cuentan aquí arriba —antes de la tolerancia— para que las
    // tres clases sumen; `totales_contrato_en_cero`, que la pantalla ya
    // pintaba, es OTRO número: el subconjunto de los que además DIFIEREN.
    if (Number(fila.excel_total) === 0 && !r.aplica) {
      ceroFuera[r.motivo || 'otro'] = (ceroFuera[r.motivo || 'otro'] || 0) + 1;
    }
    if (r.aplica) {
      // ⚠️ SIN `diferencia`, y a propósito: el runner está por PISAR
      // `sistema_total` con el precio vivo, así que la resta de aquí quedaría
      // vieja — y un número que nadie recalculó al lado de uno que sí es la
      // manera de que alguien lea el equivocado.
      const enRegla = Object.assign({}, fila, {
        // `sistema_total` puede venir NULL o 0: el runner lo pisa con el precio
        // vivo del catálogo por paquete+zona, y dice de dónde salió.
        sistema_total_origen: (sis == null || sis === 0) ? 'pendiente' : 'base',
        // [CUADRE-5 · hallazgo de Jane] EL MAPA DE BOLETOS POR ZONA VIAJA CON
        // EL RENGLÓN. La pestaña lleva UNA FILA POR BOLETO y los totales se
        // SUMAN, así que un renglón con `filas > 1` necesita el total del
        // GRUPO, no el de una persona — y para pedirlo hay que saber si los
        // boletos son todos de la misma zona. Sin el mapa, el runner tendría
        // que repartirlos, que es justo lo que no se puede inventar.
        zonas: Object.assign({}, p.zonas || {}),
        // [CUADRE-6] POR QUÉ ENTRÓ, dicho por la regla y no re-derivado: el
        // runner suma el vuelo solo en `cdmx_con_vuelo`, y la pantalla rotula.
        clase: r.clase || 'catalogo',
      });
      delete enRegla.diferencia;
      ceroRegla.push(enRegla);
      continue;
    }
    if (Math.abs(dif) <= TOLERANCIA_MXN) continue;
    totalesContrato.push(fila);
  }

  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  return { nuevos: nuevos.sort(porNombre), pagos: pagos.sort(porNombre),
           bajas: bajas.sort(porNombre), iguales: iguales.sort(porNombre),
           apartados: apartados.sort(porNombre), ambiguos: ambiguos.sort(porNombre),
           totales_contrato: totalesContrato.sort(porNombre),
           // [CUADRE-5]
           totales_cero_regla: ceroRegla.sort(porNombre),
           cuadre5: {
             fecha: CUADRE5_FECHA,
             cdmx,
             en_regla: ceroRegla.length,
             // [CUADRE-6] LA CLASE NUEVA, CON SU NOMBRE. Los `$0` de CDMX que
             // ahora ENTRAN por su vuelo se cuentan aparte de los que entran
             // por el catálogo: son dos maneras distintas de armar el total y
             // un montón sin nombre es un montón que nadie revisa.
             cuadre6_fecha: CUADRE6_FECHA,
             en_regla_cdmx_con_vuelo: ceroRegla.filter((x) => x.clase === 'cdmx_con_vuelo').length,
             en_regla_catalogo: ceroRegla.filter((x) => x.clase !== 'cdmx_con_vuelo').length,
             // Y los dos motivos de CDMX, separados: «no trae vuelo» y «trae
             // vuelo en $0» son hechos distintos de quien captura.
             fuera_cdmx_sin_vuelo: ceroFuera.cdmx_sin_vuelo || 0,
             fuera_cdmx_vuelo_cero: ceroFuera.cdmx_vuelo_cero || 0,
             // ⚰️ El nombre viejo se queda, sumando los dos, para que la
             // pantalla que ya lo pintaba no se quede muda mientras alguien la
             // actualiza. Un contador que desaparece es un renglón en blanco.
             fuera_cdmx: (ceroFuera.cdmx_sin_vuelo || 0) + (ceroFuera.cdmx_vuelo_cero || 0) + (ceroFuera.cdmx || 0),
             fuera_libreta: ceroFuera.libreta || 0,
             // Tiene que ser SIEMPRE 0: `reglaCeroTecleado` solo puede decir
             // «libreta» o «cdmx» cuando se rehúsa. Viaja de todos modos —en
             // vez de dejar el `|| 'otro'` como un default calladito— porque si
             // algún día no es cero significa que hay una clase de $0 que nadie
             // nombró, y un montón sin nombre es un montón que nadie revisa.
             fuera_otro: ceroFuera.otro || 0,
           } };
}

module.exports = { normalizarNombre, esChatarra, leerDinero, mapearColumnas,
                   parsearPestana, carear, agruparBase, esDerivado,
                   reglaCeroTecleado, CUADRE5_FECHA,
                   CHATARRA, TOLERANCIA_MXN };
