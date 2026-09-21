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
      if (!ya.zona && zona) ya.zona = zona;
      if (!ya.talla && mapa.talla >= 0) ya.talla = String(f[mapa.talla] == null ? '' : f[mapa.talla]).trim();
    } else {
      out.set(clave, {
        nombre: nombreCrudo, clave, abonado, filas: 1, zona,
        // ⚠️ `zona` (la primera) SE QUEDA: hay consumidores que la leen y
        // cambiarla sería otra tuerca. `zonas` se AÑADE al lado.
        zonas: zona ? { [zona]: 1 } : {},
        total: totalFila, totalIncompleto: !totalLegible,
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
    const { totalIncompleto, ...resto } = p;
    return { ...resto, total: totalIncompleto ? null : p.total };
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

function carear(personasExcel, viajerosBase) {
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
    if (Math.abs(dif) <= TOLERANCIA_MXN) continue;
    totalesContrato.push({
      nombre: p.nombre, viajero_id: v.id, excel_total: p.total, sistema_total: sis,
      diferencia: dif, derivado: esDerivado(v.notas), filas: p.filas,
      zona: p.zona, paquete: p.paquete,
    });
  }

  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  return { nuevos: nuevos.sort(porNombre), pagos: pagos.sort(porNombre),
           bajas: bajas.sort(porNombre), iguales: iguales.sort(porNombre),
           apartados: apartados.sort(porNombre), ambiguos: ambiguos.sort(porNombre),
           totales_contrato: totalesContrato.sort(porNombre) };
}

module.exports = { normalizarNombre, esChatarra, leerDinero, mapearColumnas,
                   parsearPestana, carear, agruparBase, esDerivado,
                   CHATARRA, TOLERANCIA_MXN };
