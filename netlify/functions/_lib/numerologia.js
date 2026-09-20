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
const { normalizarNombre } = require('./excel-careo');

const PESTANA_LIBRO = 'Boletos';

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
//   · si la persona está en las dos, su total es el de la pestaña, intacto;
//   · si vive SOLO en el libro, su total es `null` — NO cero. Es el mismo hueco
//     de CUADRE-1a: la ausencia no es un cero, y con `total:null` la persona no
//     entra al montón de totales ni puede darse de alta con un contrato
//     inventado (1b la salta con motivo).
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
      zona: '', paquete: '', talla: '',
      // El hueco manda: solo en el libro = no sabemos su total.
      total: null,
      boletos_numerologia: Number(n.boletos || 0),
      pestanas: [], fuentes: ['numerologia'],
    });
  }
  return [...out.values()];
}

module.exports = { mapearLibro, fundirNumerologia, llave, PESTANA_LIBRO };
