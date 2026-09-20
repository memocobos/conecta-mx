// =============================================================================
// _lib/numerologia.js — LA TERCERA FUENTE (CUADRE-2a)
// =============================================================================
// Memo vende boletos CHEAP directo y anota los pagos en SU Excel «Numerología»,
// pestaña «Boletos». Es un LIBRO CORRIDO —todas las ventas en UNA pestaña, con
// columnas de evento y fecha— y no se parece a las pestañas de las chicas, que
// son una por evento.
//
// El careo llevaba siete días en verde comparando dos espejos a los que les
// faltaba LO MISMO. El 19-sep Jane aplicó +$1,081,021 de este libro a mano, y
// desde entonces esas ~159 filas salen como diferencias NEGATIVAS esperadas: el
// sistema sabe dinero que la pestaña no ve. Esta fuente existe para que esas
// negativas se vuelvan ceros.
//
// ⚠️ 2a NO TRAE EL PARSER DEL LIBRO. Escribirlo pide los ENCABEZADOS REALES de
// «Boletos», y hoy no se pueden medir: el Apps Script de Numerología no está
// desplegado y el acta del 19-sep salió de un PDF transcrito a mano, no de una
// rejilla. Inventar esos encabezados Y el fixture que los prueba daría un verde
// que solo demuestra que soy consistente conmigo mismo — el modo de fallo que
// esta casa lleva nombrado desde VJ-5. Lo que SÍ está aquí es todo lo que
// cuelga del parser, careado contra el CONTRATO que 2b tendrá que cumplir.
//
// ── EL CONTRATO DE 2b ───────────────────────────────────────────────────────
// `parsearLibro` tendrá que devolver personas con esta forma:
//     { nombre, abonado, boletos, evento_libro, fecha_libro }
// 🔒 Y NO `total`: el libro corrido NO lleva total de contrato. No es un hueco
// del contrato, es una propiedad de la fuente — y de ahí sale la regla de que
// el total venga SIEMPRE de la pestaña de las chicas.
// =============================================================================

// ── LO QUE ESTE CÓDIGO LE PIDE A LA TABLA ───────────────────────────────────
// La tabla y su siembra las corre JANE (tiene el mapeo del 19-sep). La tuerca
// solo LEE. Se deja escrita aquí la forma EXACTA que se lee, para que la DDL y
// el lector no se desencuentren — un nombre de columna distinto no truena:
// devuelve cero mapeos, y cero mapeos se lee como «nada que carear», que es la
// peor mentira posible en esta herramienta.
//
//   create table numerologia_eventos (
//     id           uuid primary key default gen_random_uuid(),
//     nombre_libro text not null,          -- como lo escribe el libro: «Karol G»
//     fecha_libro  text,                   -- «7 de noviembre», o NULL = sin fecha
//     evento_id    text not null,          -- el slug del Palacio: «karolg#1»
//     activa       boolean not null default true,
//     notas        text
//   );
//
// ⚠️ `fecha_libro` NULLABLE y la llave es el PAR (nombre_libro, fecha_libro).
// Si se le pone un UNIQUE, ojo con la trampa de la casa: en Postgres
// `NULL != NULL`, así que un UNIQUE nullable a secas deja pasar TODOS los
// duplicados de «sin fecha» sin decir nada. El índice va sobre
// `coalesce(fecha_libro,'')`.
//
// Y el select que se hace es: `activa=is.true` +
// `select=nombre_libro,fecha_libro,evento_id,activa`.
const { normalizarNombre, leerDinero, esChatarra } = require('./excel-careo');

const PESTANA_LIBRO = 'Boletos';

// ── EL PARSER DEL LIBRO CORRIDO ─────────────────────────────────────────────
// 🔒 MEDIDO DE LA REJILLA REAL el 20-sep-2026, no supuesto: 824 filas, 55
// bloques, 454 personas con nombre, $1,829,538 abonados. Y la forma no se
// parece en nada a lo que
// cualquiera habría dibujado de memoria — de ahí que la casa mida primero.
//
// EL LIBRO NO ES UNA TABLA: ES UNA PILA DE BLOQUES, uno por evento.
//
//     ['Sleeping with Sirens']                          ← TÍTULO: una fila con
//     ['Nombre','Fecha','Tipo de Boleto','Vendedor',…]     UNA sola celda llena
//     ['Angel Gabriel Villela Sierra','','General',…]    ← las personas
//     ['']                                              ← y otra vez
//
// LAS TRES TRAMPAS MEDIDAS, cada una con lo que habría costado:
//
//  1. ⚠️ LA COLUMNA [1] NO SIEMPRE ES «Fecha»: en 10 de los 47 bloques es
//     «Codigo» (EDC, The Neighbourhood, J Balvin, Milo J, Zayn, Kali Uchis,
//     Kenia Os, Lorde, Warped). Leerla por posición metería «jfe22d» donde va
//     una fecha; ese par (evento, «jfe22d») no mapearía con nada y la persona
//     DESAPARECERÍA del careo sin que nadie la nombrara. Se lee por ENCABEZADO,
//     y el encabezado se relee EN CADA BLOQUE.
//
//  2. ⚠️ «Total» EN EL LIBRO NO ES EL TOTAL DE CONTRATO: es lo PAGADO. Es el
//     nombre exactamente al revés que en las pestañas de las chicas, donde
//     «Total» sí es el contrato. Medido con la aritmética: separo $800 + pagos
//     $0 → «Total» $800 y «Resta» $4,500 sobre un «Costo al Publico» de $5,300.
//     Confundirlos habría leído un abonado como un contrato en 489 filas.
//     El contrato es «Costo al Publico» — la misma columna que TOTAL-1 tecleó
//     a mano como «la libreta».
//
//  3. ⚠️ OCHO BLOQUES NO ROTULAN «Nombre». El primero usa «Talla Pa'l Norte» en
//     la [1] y sus filas vienen de verdad sin nombre (155 descartes medidos);
//     pero «Rosalia» y «Humbe» SÍ traen el nombre en la [0] con el encabezado
//     empezando en [1]«Codigo». Por eso un bloque no se reconoce por la celda
//     «Nombre» sino por traer «Costo al Publico» Y «Separo», y la [0] es el
//     nombre por RESPALDO. Sin las dos cosas se perdían ONCE PERSONAS REALES y
//     $55,400 con ellas.
//
//  4. ⚠️ LOS NOMBRES TRAEN COMILLAS PEGADAS («"Ivan Delgado"», «Jose iram
//     urbina"»). La llave saldría `"ivan delgado"` y no casaría NUNCA con la
//     pestaña: la persona se reportaría como nueva y el aplicar le daría de
//     alta un duplicado con su dinero.
//
// Y el dinero se SUMA (separo + Pago 1…7) en vez de creerle a la columna
// «Total» del libro — la misma regla que `parsearPestana`. Medido: coinciden en
// el 99%, y las 5 filas que no difieren por $2 de redondeo.
const CELDAS_DE_BLOQUE = ['costo al publico', 'separo'];

function _txt(x) { return String(x == null ? '' : x).trim(); }

// 🔒 LAS COMILLAS PEGADAS AL NOMBRE. Medido en la hoja real: el libro trae
// «"Ivan Delgado"» y «Jose iram urbina"». `normalizarNombre` no las quita —y
// NO se le tocan: es el protocolo probado contra 2,223 viajeros—, así que la
// llave saldría `"ivan delgado"` y JAMÁS casaría con el `ivan delgado` de la
// pestaña: la persona se reportaría como NUEVA y el aplicar le daría de alta un
// duplicado con su dinero. Se limpia AQUÍ, que es donde vive la rareza.
function _limpiarNombre(s) {
  return _txt(s).replace(/^["'\s]+|["'\s]+$/g, '');
}

// ¿Esta fila es el encabezado de un bloque? Se pregunta por DOS celdas que
// ningún renglón de persona lleva, no por la primera columna.
function esEncabezadoDeBloque(fila) {
  const norm = (fila || []).map((x) => normalizarNombre(_txt(x)));
  return CELDAS_DE_BLOQUE.every((c) => norm.includes(c));
}

function mapearColumnasLibro(cabecera) {
  const norm = (cabecera || []).map((x) => normalizarNombre(_txt(x)));
  const idx = (n) => norm.indexOf(normalizarNombre(n));
  const mapa = {
    // 🔒 LA COLUMNA 0 ES EL NOMBRE AUNQUE EL ENCABEZADO NO LA ROTULE. Medido en
    // la rejilla real: los bloques «Rosalia» y «Humbe» traen el encabezado sin
    // la celda «Nombre» —arranca en [1]«Codigo»— y sus filas SÍ llevan el
    // nombre en la [0]. Con `-1` se caían al montón de «sin nombre» ONCE
    // PERSONAS REALES, con su dinero dentro. El corte de qué evento cuenta lo
    // decide LA SIEMBRA; perder gente al parsear sería un corte accidental, que
    // es el peor de todos porque nadie lo firmó.
    //
    // El respaldo es seguro: en el bloque irregular de Pa'l Norte la [0] viene
    // VACÍA en sus ~198 filas, así que caen igual por «sin nombre».
    nombre: idx('Nombre') >= 0 ? idx('Nombre') : 0,
    fecha: idx('Fecha'), codigo: idx('Codigo'),
    zona: idx('Tipo de Boleto'), vendedor: idx('Vendedor'),
    costoPublico: idx('Costo al Publico'), separo: idx('Separo'),
    total: idx('Total'), pagos: [],
  };
  for (let i = 0; i < norm.length; i++) if (/^pago \d+$/.test(norm[i])) mapa.pagos.push(i);
  // Lo que SUMA al abonado, en un solo lugar. ⚠️ `total` y `costoPublico` NO
  // entran: uno es el resultado de esta misma suma y el otro es el contrato.
  mapa.dinero = [mapa.separo, ...mapa.pagos].filter((i) => i >= 0);
  return mapa;
}

// parsearLibro(filas) → { personas, bloques, descartes }
// Cada persona cumple el contrato que consume `mapearLibro`:
//   { nombre, clave, abonado, boletos, evento_libro, fecha_libro, zona,
//     codigo, costo_publico }
function parsearLibro(filas) {
  const personas = [], bloques = [];
  const descartes = { chatarra: 0, sinNombre: 0, fueraDeBloque: 0 };
  let mapa = null, tituloPendiente = '', bloqueActual = null;

  for (const cruda of (filas || [])) {
    const f = cruda || [];
    const llenas = f.filter((x) => _txt(x) !== '').length;
    if (!llenas) continue;

    if (esEncabezadoDeBloque(f)) {
      mapa = mapearColumnasLibro(f);
      bloqueActual = { titulo: tituloPendiente || '(sin título)', personas: 0,
                       tiene_nombre: normalizarNombre(_txt((f || [])[0])) === 'nombre', tiene_fecha: mapa.fecha >= 0 };
      bloques.push(bloqueActual);
      tituloPendiente = '';
      continue;
    }
    // El TÍTULO del evento: una fila con UNA sola celda llena. No es una
    // columna — es un renglón suelto, y por eso el evento no se puede leer de
    // la fila de la persona.
    if (llenas === 1) { tituloPendiente = _txt(f[0]) || _txt(f.find((x) => _txt(x))); continue; }

    if (!mapa) { descartes.fueraDeBloque++; continue; }
    const nombre = mapa.nombre >= 0 ? _limpiarNombre(f[mapa.nombre]) : '';
    if (!nombre) { descartes.sinNombre++; continue; }
    if (esChatarra(nombre)) { descartes.chatarra++; continue; }

    const costo = mapa.costoPublico >= 0 ? f[mapa.costoPublico] : null;
    // El mismo hueco de CUADRE-1a, en la otra hoja: una celda sin dígitos es
    // «no sé», no un cero. Medido sobre las 454: NINGUNA se queda sin contrato
    // legible, y 6 traen $0 exacto — que es un número, no un hueco. (El «10.6%»
    // que puse aquí primero era mío: contaba el $0 como ausente y dividía entre
    // un total que incluía las filas de título. Los números se computan.)
    const costoLegible = /[0-9]/.test(_txt(costo));

    personas.push({
      nombre, clave: normalizarNombre(nombre),
      abonado: mapa.dinero.reduce((a, c) => a + leerDinero(f[c]), 0),
      boletos: 1,
      evento_libro: bloqueActual ? bloqueActual.titulo : '',
      // Solo si el bloque TIENE columna de fecha. En los 10 de «Codigo» esto
      // queda vacío, que es lo correcto: esa gente no trae fecha, no trae
      // «jfe22d» como fecha.
      fecha_libro: mapa.fecha >= 0 ? _txt(f[mapa.fecha]) : '',
      codigo: mapa.codigo >= 0 ? _txt(f[mapa.codigo]) : '',
      zona: mapa.zona >= 0 ? _txt(f[mapa.zona]) : '',
      // ⚠️ El contrato del libro. Se LEE y viaja como evidencia; quién manda
      // entre éste y el de la pestaña lo decide `fundirNumerologia`.
      costo_publico: costoLegible ? leerDinero(costo) : null,
    });
    if (bloqueActual) bloqueActual.personas++;
  }
  return { personas, bloques, descartes };
}

// ── EL MAPEO LIBRO → SLUG ───────────────────────────────────────────────────
// 🔒 VIVE EN LA TABLA `numerologia_eventos`, NO EN CÓDIGO — el molde de
// `excel_pestanas`. El libro dice «Karol G» y «7 de noviembre»; el sistema dice
// `karolg#1`. Esa traducción es un DATO que Memo y Jane curan, no una constante
// que envejece en un archivo: el 19-sep hubo que mapear a mano «2/3 de
// diciembre» → morat#0/#1, «16/17 noviembre» → monlaferte#0/#1, «Rock 9
// Domingo» → coronacapital#2… y mañana habrá otra.
//
// 🔒 Y EL CORTE TAMBIÉN VIVE EN LA SIEMBRA. La regla de Memo —solo de calle24
// (3-sep-2026) en adelante— NO se escribe como un `if` con fecha aquí: se
// impone sembrando únicamente lo que cuenta. Un corte en código habría que
// moverlo cada temporada, y peor: escondería en una condición lo que hoy se
// puede leer en una tabla.
//
// 🔒 FILA SIN MAPEO NO SE CAREA NI SE INVENTA. El libro trae toda la temporada
// 2024-2025 (Feid, Travis, Peso Pluma, Shakira…) y eventos sin ficha. Adivinar
// a qué evento van sería inventar dinero de alguien. Se CUENTAN y se NOMBRAN en
// su propio montón para que se vean, que es lo contrario de filtrarlas.
//
// La llave es el PAR (nombre_libro, fecha_libro) y se compara normalizada: el
// acta del 19-sep dejó dicho que «sin fecha → primera función» y «7 de
// noviembre → #1», así que la fecha no es decoración, DESAMBIGUA la función.
// Vacío y NULL son lo mismo aquí a propósito — en la tabla `fecha_libro` es
// nullable y en el libro una celda vacía es lo mismo que no haberla escrito.
function llave(nombre, fecha) {
  return normalizarNombre(nombre) + '||' + normalizarNombre(fecha == null ? '' : fecha);
}

// mapearLibro(personasLibro, mapeos, eventoId) → { personas, sinMapeo }
//   · `personas` — las del libro que mapean a ESTE evento.
//   · `sinMapeo` — agrupadas por (evento_libro, fecha_libro), con su conteo y
//     su dinero, para poder enseñarlas sin tocarlas.
function mapearLibro(personasLibro, mapeos, eventoId) {
  const porLlave = new Map();
  for (const m of (mapeos || [])) {
    // Una siembra APAGADA no mapea. `activa` es el interruptor que deja
    // retirar un mapeo malo sin borrar la fila y perder su historia.
    if (m.activa === false) continue;
    porLlave.set(llave(m.nombre_libro, m.fecha_libro), m.evento_id);
  }
  const personas = [], sinMapeoMap = new Map();
  for (const p of (personasLibro || [])) {
    const destino = porLlave.get(llave(p.evento_libro, p.fecha_libro));
    if (!destino) {
      const k = llave(p.evento_libro, p.fecha_libro);
      const ya = sinMapeoMap.get(k);
      if (ya) { ya.filas += 1; ya.abonado += Number(p.abonado || 0); }
      else {
        sinMapeoMap.set(k, { evento_libro: p.evento_libro || '', fecha_libro: p.fecha_libro || '',
          filas: 1, abonado: Number(p.abonado || 0) });
      }
      continue;
    }
    if (destino !== eventoId) continue;      // es de otra función del mismo artista
    personas.push({ ...p, clave: normalizarNombre(p.nombre), evento_id: destino });
  }
  return { personas, sinMapeo: [...sinMapeoMap.values()] };
}

// ── LA FUSIÓN ───────────────────────────────────────────────────────────────
// El lado-Excel deja de ser «la pestaña» y pasa a ser «la pestaña + el libro».
// El dinero se SUMA por nombre normalizado — la misma regla que dos pestañas de
// Pa'l Norte, y la misma que dos filas dentro de una pestaña.
//
// 🔒 EL TOTAL VIENE SOLO DE LA PESTAÑA. El libro no lo lleva, así que:
//   · si la persona está en las DOS, su total es el de la pestaña, INTACTO —
//     🔒 el libro jamás pisa a la pestaña, y desde CUADRE-2c eso tiene dientes:
//     antes se cumplía solo porque el libro no traía total, hoy SÍ lo trae y
//     aun así pierde;
//   · si vive SOLO en el libro, su total es su «Costo al Publico» (CUADRE-2c,
//     decisión de Memo del 20-sep). Si el libro tampoco lo sabe, `null` — NO
//     cero: el mismo hueco de CUADRE-1a, y con él 1b la salta con motivo en vez
//     de darla de alta con un contrato inventado.
//
// Y cada persona carga su PROCEDENCIA. No es adorno: cuando una fila trae las
// dos fuentes, la pantalla puede decir de dónde salió el dinero en vez de
// enseñar una suma que no cuadra con ninguna de las dos hojas por separado.
function fundirNumerologia(personasPestana, personasLibro) {
  const out = new Map();
  for (const p of (personasPestana || [])) {
    out.set(p.clave, { ...p, fuentes: ['pestana'] });
  }
  for (const n of (personasLibro || [])) {
    const ya = out.get(n.clave);
    if (ya) {
      ya.abonado += Number(n.abonado || 0);
      ya.filas = (ya.filas || 0) + 1;
      ya.boletos_numerologia = (ya.boletos_numerologia || 0) + Number(n.boletos || 0);
      if (!ya.fuentes.includes('numerologia')) ya.fuentes.push('numerologia');
      // ⚠️ `total` NO se toca: el libro no lo trae y pisarlo con nada lo perdería.
      continue;
    }
    out.set(n.clave, {
      nombre: n.nombre, clave: n.clave, abonado: Number(n.abonado || 0), filas: 1,
      // [CUADRE-2c] LA ZONA Y EL PAQUETE SALEN DEL LIBRO. «Tipo de Boleto» es
      // la zona, y el paquete es CHEAP porque esto ES la venta directa de Memo
      // —boleto solo, sin viaje—. Sin estos dos, CUADRE-1b los salta: su alta
      // pasa por `viajero_migrar`, que exige los dos.
      zona: n.zona || '', paquete: 'cheap', talla: '',
      // 🔒 [CUADRE-2c] EL «Costo al Publico» DEL LIBRO ES SU CONTRATO.
      // Decisión de Memo, firmada el 20-sep. CUADRE-2 nació con `total: null`
      // aquí porque su diseño decía que el libro no llevaba contrato — y MEDIR
      // la rejilla lo desmintió: sí lo lleva, en la misma columna que TOTAL-1
      // tecleó a mano como «la libreta». Con ella, las ~39 personas que solo
      // existen en Numerología pueden darse de alta en vez de saltarse.
      //
      // Y el hueco SIGUE mandando cuando el libro tampoco sabe: un
      // `costo_publico` null es «no sé», no cero, y esa persona sigue sin
      // poder darse de alta — que es lo correcto.
      total: (n.costo_publico == null) ? null : Number(n.costo_publico),
      boletos_numerologia: Number(n.boletos || 0),
      pestanas: [], fuentes: ['numerologia'],
    });
  }
  return [...out.values()];
}

module.exports = { mapearLibro, fundirNumerologia, llave, PESTANA_LIBRO,
                   parsearLibro, mapearColumnasLibro, esEncabezadoDeBloque };
