#!/usr/bin/env node
// =============================================================================
// scripts/mide-cuadre-numerologia.js — EL CAREO DE CUADRE-2a (la tercera fuente)
// =============================================================================
// Memo cobra CHEAP directo y los anota en SU Excel «Numerología», pestaña
// «Boletos» — un LIBRO CORRIDO (todas las ventas en una pestaña), distinto al
// Excel de las chicas (una pestaña por evento). El 19-sep Jane aplicó a mano
// +$1,081,021 de ahí, y desde entonces el careo reporta esas ~159 filas como
// NEGATIVAS esperadas: el sistema sabe dinero que la pestaña no ve.
//
// ⚠️ ESTA ES LA MITAD 2a: TODO MENOS EL PARSER DEL LIBRO (orden de Memo,
// 20-sep). El parser necesita los ENCABEZADOS REALES de «Boletos» y hoy no se
// pueden medir — el Apps Script de Numerología no está desplegado y el acta del
// 19-sep salió de un PDF transcrito a mano, no de una rejilla. Inventar esos
// encabezados Y su fixture daría un verde que solo prueba que soy consistente
// conmigo mismo. Así que aquí se carea:
//   · el MAPEO y la FUSIÓN como funciones puras, alimentadas con personas YA
//     parseadas — su forma es el CONTRATO que CUADRE-2b tendrá que cumplir;
//   · el camino del handler en los dos estados que SÍ existen hoy: sin
//     configurar, y con el parser todavía sin medir.
// =============================================================================

const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

let N;
try { N = require(path.join(RAIZ, 'netlify/functions/_lib/numerologia.js')); }
catch (e) { N = null; }

// La cabecera REAL de las chicas, para el lado que SÍ se puede medir.
const CAB = ['No.','Nombre','Paquete','Boleto','Separo','1','2','3','4','5','6','7','8','9','10',
  'Preventa','Costo','Habitación','Pago Hab','Avión - Bus','Codigo','Total','Abonado','Resta','TALLA',
  'CORREO','CELULAR','EMERGENCIA','HABITACION COMPARTIDA CON','','','','','Luneta','$0','','Stay',''];
const PESTANA = 'Karol G - 6 de noviembre';
const EVENTO = 'karolg#0';
function filaExcel(v) {
  const f = new Array(CAB.length).fill('');
  for (const [c, x] of Object.entries(v)) { const i = CAB.indexOf(c); if (i < 0) throw new Error('columna inexistente: ' + c); f[i] = x; }
  return f;
}
const conPreludio = (filas) => [...Array.from({ length: 10 }, () => ['', '']), CAB, ...filas];

// ── EL CONTRATO DEL PARSER DE 2b ─────────────────────────────────────────────
// Una persona del libro, ya parseada. CUADRE-2b tendrá que producir ESTA forma
// a partir de los encabezados reales; todo lo de abajo se carea contra ella.
//   { nombre, abonado, boletos, evento_libro, fecha_libro }
// ⚠️ NO trae `total`: el libro corrido NO lleva total de contrato. Eso no es un
// olvido del fixture, es una propiedad de la fuente, y de ahí sale la regla de
// que el total venga SIEMPRE de la pestaña de las chicas.
const LIBRO = () => ([
  // [a] la MISMA persona que en la pestaña: su dinero se SUMA.
  { nombre: 'Esmeralda Estefania Hernandez Lopez', abonado: 2000, boletos: 1, evento_libro: 'Karol G', fecha_libro: '' },
  // vive SOLO en el libro → alta candidata, pero SIN total (el libro no lo trae).
  { nombre: 'José Santos', abonado: 19000, boletos: 7, evento_libro: 'Karol G', fecha_libro: '' },
  // [b] fila de OTRA fecha del mismo artista: mapea a karolg#1, no a éste.
  { nombre: 'Nancy Ruiz', abonado: 5000, boletos: 2, evento_libro: 'Karol G', fecha_libro: '7 de noviembre' },
  // [b] SIN MAPEO: el libro trae eventos viejos que la siembra no mapea.
  { nombre: 'Feid Fan', abonado: 3000, boletos: 1, evento_libro: 'Feid', fecha_libro: '' },
  { nombre: 'Otro Viejo', abonado: 1200, boletos: 1, evento_libro: 'Travis Scott', fecha_libro: '2024' },
]);

// La siembra de `numerologia_eventos`, con el molde de `excel_pestanas`.
// Sale del mapeo REAL que Jane dejó escrito en el acta del 19-sep:
// «sin fecha → primera función; 7 de noviembre → #1».
const MAPEOS = () => ([
  { nombre_libro: 'Karol G', fecha_libro: null, evento_id: 'karolg#0', activa: true },
  { nombre_libro: 'Karol G', fecha_libro: '7 de noviembre', evento_id: 'karolg#1', activa: true },
  { nombre_libro: 'Morat', fecha_libro: '2 de diciembre', evento_id: 'morat#0', activa: true },
  // una fila APAGADA: no debe mapear nada.
  { nombre_libro: 'Feid', fecha_libro: null, evento_id: 'feid', activa: false },
]);

(async () => {
  console.log('CAREO CUADRE-2a · la tercera fuente (todo menos el parser)\n');
  if (!N) { af(false, 'no existe `_lib/numerologia.js`'); }

  // ── [1] EL MAPEO LIBRO → SLUG, EN TABLA Y NO EN CÓDIGO ────────────────────
  console.log('[1] el mapeo, leído de la tabla');
  if (N) {
    const m = N.mapearLibro(LIBRO(), MAPEOS(), EVENTO);
    console.log('    de este evento: ' + m.personas.map((p) => p.nombre).join(', '));
    console.log('    sin mapeo: ' + m.sinMapeo.map((x) => `${x.evento_libro}${x.fecha_libro ? ' / ' + x.fecha_libro : ''} ×${x.filas}`).join(' · '));
    af(m.personas.length === 2, 'mapeó ' + m.personas.length + ' persona(s) a ' + EVENTO + ', se esperaban 2 (Esmeralda y José, los «sin fecha»)');
    af(m.personas.some((p) => /Esmeralda/.test(p.nombre)) && m.personas.some((p) => /José/.test(p.nombre)),
       'no mapeó a quien toca: ' + JSON.stringify(m.personas.map((p) => p.nombre)));
    // 🔒 La fecha DESAMBIGUA: «7 de noviembre» es karolg#1, no #0.
    af(!m.personas.some((p) => /Nancy/.test(p.nombre)),
       'Nancy es de «7 de noviembre» (karolg#1) y se coló en ' + EVENTO + ': la fecha del libro desambigua la función');
    // 🔒 SIN MAPEO NO SE INVENTA: se cuenta y se nombra.
    af(m.sinMapeo.length === 2, 'los sin mapeo son ' + m.sinMapeo.length + ', se esperaban 2 (Feid apagado + Travis sin sembrar)');
    af(m.sinMapeo.some((x) => /Feid/.test(x.evento_libro)),
       'la fila APAGADA (activa:false) no cayó en sin-mapeo: una siembra apagada no mapea');
    af(m.sinMapeo.every((x) => !x.evento_id), 'un renglón sin mapeo trae evento_id: eso es inventarlo');
    // 🔒 EL CORTE DE calle24 LO IMPONE LA SIEMBRA, NO UN `if` CON FECHA. Y se
    // mide como HECHO, no por grep del fuente: se siembra un evento VIEJO —de
    // los que Memo dejó fuera a propósito— y se exige que SÍ mapee. Si hubiera
    // una fecha de corte escrita en el código, este renglón no aparecería.
    // (La primera versión de esta aserción buscaba «new Date» en el texto de la
    // función: la palabra, no el hecho — y un comentario que explicara la regla
    // la habría tumbado sola.)
    const conViejo = MAPEOS().map((m) => (m.nombre_libro === 'Feid' ? { ...m, activa: true } : m));
    const mv = N.mapearLibro(LIBRO(), conViejo, 'feid');
    af(mv.personas.length === 1 && /Feid Fan/.test(mv.personas[0].nombre),
       'un evento VIEJO sembrado a propósito no mapeó: hay un corte de fecha escrito en el código, '
       + 'y el corte tiene que vivir en la siembra de numerologia_eventos');
  }

  // ── [2] LA FUSIÓN: el dinero se SUMA, la procedencia viaja ────────────────
  console.log('\n[2] la fusión de las dos fuentes del lado-Excel');
  if (N) {
    const dePestana = [
      { nombre: 'Esmeralda Estefania Hernandez Lopez', clave: 'esmeralda estefania hernandez lopez', abonado: 1000, total: 4500, filas: 1, zona: 'Poniente Baja', paquete: 'CHEAP', talla: '-', pestanas: [PESTANA] },
      { nombre: 'Solo Pestaña', clave: 'solo pestana', abonado: 700, total: 3000, filas: 1, zona: 'VIP A', paquete: 'PLUS', talla: 'M', pestanas: [PESTANA] },
    ];
    const delLibro = N.mapearLibro(LIBRO(), MAPEOS(), EVENTO).personas;
    const f = N.fundirNumerologia(dePestana, delLibro);
    const por = (re) => f.find((p) => re.test(p.nombre));
    f.forEach((p) => console.log(`    ${p.nombre.slice(0, 34).padEnd(34)} abonado=${p.abonado} total=${JSON.stringify(p.total)} fuentes=${JSON.stringify(p.fuentes)}`));
    // [a] LAS DOS FUENTES: 1,000 de la pestaña + 2,000 del libro = 3,000.
    const esm = por(/Esmeralda/);
    af(esm && esm.abonado === 3000, 'Esmeralda: abonado ' + (esm && esm.abonado) + ', se esperaban 3000 (1,000 pestaña + 2,000 libro)');
    af(esm && esm.total === 4500, 'Esmeralda: el total salió ' + (esm && esm.total) + ' y debe venir de LA PESTAÑA (4500): el libro no lleva total');
    af(esm && Array.isArray(esm.fuentes) && esm.fuentes.includes('pestana') && esm.fuentes.includes('numerologia'),
       'Esmeralda no carga sus DOS procedencias: ' + JSON.stringify(esm && esm.fuentes));
    // Quien vive SOLO en el libro entra, pero SIN total — el hueco manda.
    const jose = por(/José/);
    af(!!jose, 'quien vive SOLO en el libro no entró al lado-Excel');
    af(jose && jose.total === null,
       'José vive solo en el libro y su total salió ' + JSON.stringify(jose && jose.total)
       + ': el libro NO lleva total de contrato, así que es null — no cero');
    af(jose && jose.fuentes.length === 1 && jose.fuentes[0] === 'numerologia', 'José no declara su única procedencia');
    // Quien vive solo en la pestaña no se toca.
    const solo = por(/Solo Pestaña/);
    af(solo && solo.abonado === 700 && solo.total === 3000, 'a quien solo está en la pestaña le movieron el dinero');
    af(solo && solo.fuentes.length === 1 && solo.fuentes[0] === 'pestana', 'la persona de una sola fuente no lo declara');
    // CARDINALIDAD: si la fusión devolviera vacío, todo lo de arriba pasaría en hueco.
    af(f.length === 3, 'la fusión devolvió ' + f.length + ' persona(s), se esperaban 3');
  }

  // ── [1b] EL PARSER DEL LIBRO, MEDIDO DE LA REJILLA REAL ───────────────────
  // Las tres cabeceras y las filas de abajo están copiadas LETRA POR LETRA de
  // la pestaña «Boletos» real, cosechada el 20-sep-2026 (824 filas, 47 bloques,
  // 489 personas). El libro NO es una tabla: es una PILA DE BLOQUES, uno por
  // evento, cada uno con su propio título y su propio encabezado repetido.
  console.log('\n[1b] el parser del libro (rejilla real)');
  try { if (N) {
    // La cabecera ESTÁNDAR (×36 de 47 bloques).
    const CAB_STD = ['Nombre','Fecha','Tipo de Boleto','Vendedor','Costo Proveedor','Costo al Publico',
      'Separo','Pago 1','Pago 2','Pago 3','Pago 4','Pago 5','Pago 6','Pago 7','Total','Resta','Ganancia','Pagado','Correo','Entregado'];
    // La variante con CÓDIGO en la columna 1 (×10). Leer la [1] por POSICIÓN
    // metería un código donde va una fecha.
    const CAB_COD = CAB_STD.map((c, i) => (i === 1 ? 'Codigo' : c));
    // El PRIMER bloque real, que NO tiene «Nombre» y usa «Talla Pa'l Norte».
    const CAB_RARA = ['', "Talla Pa'l Norte", ' ', 'Vendedor', 'Costo Proveedor', 'Costo al Publico',
      'Separo','Pago 1','Pago 2','Pago 3','Pago 4','Pago 5','Pago 6','Pago 7','Total','Resta','Ganancia','Pagado','Correo','Entregado'];
    const fila = (cab, v) => { const f = new Array(cab.length).fill('');
      for (const [c, x] of Object.entries(v)) { const i = cab.indexOf(c); if (i < 0) throw new Error('columna inexistente: ' + c); f[i] = x; } return f; };

    const LIBRO_CRUDO = [
      [''],
      CAB_RARA,                                        // bloque irregular, sin nombres
      fila(CAB_RARA, { "Talla Pa'l Norte": 'M', 'Separo': '$800', 'Pago 1': '$2,000', 'Total': '$2,800' }),
      [''],
      ['Karol G'],                                     // ← el título: UNA celda en col 0
      CAB_STD,
      fila(CAB_STD, { 'Nombre': 'Esmeralda Estefania Hernandez Lopez', 'Tipo de Boleto': 'Poniente Baja',
        'Costo al Publico': '$4,500', 'Separo': '$1,000', 'Pago 1': '$1,000', 'Total': '$2,000' }),
      fila(CAB_STD, { 'Nombre': 'Nancy Ruiz', 'Fecha': '7 de Noviembre', 'Tipo de Boleto': 'VIP A',
        'Costo al Publico': '$8,000', 'Separo': '$1,000', 'Pago 1': '$4,000', 'Total': '$5,000' }),
      // Basura REAL en la columna de fecha: son notas de envío, no fechas.
      fila(CAB_STD, { 'Nombre': 'Rosa Envio', 'Fecha': 'se envio a reynosa', 'Tipo de Boleto': 'VIP A',
        'Costo al Publico': '$8,000', 'Separo': '$500', 'Total': '$500' }),
      [''],
      ['The Neighbourhood'],
      CAB_COD,                                         // ← aquí la [1] es CÓDIGO
      fila(CAB_COD, { 'Nombre': 'Ana Codigo', 'Codigo': 'jfe22d', 'Tipo de Boleto': 'Perfiles A',
        'Costo al Publico': '$5,100', 'Separo': '$500', 'Pago 1': '$600', 'Total': '$1,100' }),
      [''],
      ['Feid'],
      CAB_STD,
      fila(CAB_STD, { 'Nombre': 'Feid Fan', 'Tipo de Boleto': 'General', 'Separo': '$3,000', 'Total': '$3,000' }),
      // «Costo al Publico» = $0 EXPLÍCITO. Medido: 6 filas reales lo traen así.
      // Un cero tecleado es un NÚMERO, no un hueco — la misma distinción que
      // sostiene todo CUADRE-1a, en la otra hoja.
      fila(CAB_STD, { 'Nombre': 'Cero Tecleado', 'Tipo de Boleto': 'General',
        'Costo al Publico': '$0', 'Separo': '$700', 'Total': '$700' }),
    ];

    const r = N.parsearLibro(LIBRO_CRUDO);
    r.personas.forEach((p) => console.log(`    ${p.nombre.slice(0,32).padEnd(32)} ${JSON.stringify(p.evento_libro).padEnd(22)} fecha=${JSON.stringify(p.fecha_libro).padEnd(20)} abonado=${p.abonado} costo=${JSON.stringify(p.costo_publico)}`));
    console.log('    bloques: ' + r.bloques.map((b) => `${b.titulo}×${b.personas}`).join(' · '));

    af(r.personas.length === 6, 'el parser sacó ' + r.personas.length + ' persona(s), se esperaban 6');
    // 🔒 EL BLOQUE IRREGULAR NO DA PERSONAS: sus filas no traen nombre.
    af(!r.personas.some((p) => !p.nombre), 'salió una persona sin nombre del bloque irregular');
    // 🔒 EL TÍTULO DEL BLOQUE ES EL EVENTO — y es una fila de UNA celda, no una columna.
    const esm = r.personas.find((p) => /Esmeralda/.test(p.nombre));
    af(esm && esm.evento_libro === 'Karol G', 'el evento no sale del TÍTULO del bloque: ' + JSON.stringify(esm && esm.evento_libro));
    af(esm && esm.fecha_libro === '', 'Esmeralda no trae fecha y salió ' + JSON.stringify(esm && esm.fecha_libro));
    // 🔒 EL DINERO SE SUMA (separo + pagos), como en la pestaña — no se le cree
    // a la columna «Total» del libro. Medido: coinciden en 99%, y los 5 que no
    // difieren por redondeo.
    af(esm && esm.abonado === 2000, 'Esmeralda: abonado ' + (esm && esm.abonado) + ', se esperaban 2000 (separo 1,000 + pago 1,000)');
    const nan = r.personas.find((p) => /Nancy/.test(p.nombre));
    af(nan && nan.abonado === 5000, 'Nancy: abonado ' + (nan && nan.abonado) + ', se esperaban 5000');
    // 🔒 LA FECHA DESAMBIGUA, y se lee POR ENCABEZADO.
    af(nan && nan.fecha_libro === '7 de Noviembre', 'Nancy: fecha ' + JSON.stringify(nan && nan.fecha_libro));
    // 🔒 LA COLUMNA [1] NO SIEMPRE ES FECHA: en 10 de los 47 bloques es CÓDIGO.
    // Leerla por posición metería «jfe22d» donde va una fecha, y ese par
    // (evento, «jfe22d») no mapearía con nada — la persona desaparecería del
    // careo sin que nadie la nombrara.
    const anaC = r.personas.find((p) => /Ana Codigo/.test(p.nombre));
    af(anaC && anaC.fecha_libro === '',
       'el bloque de CÓDIGO metió «' + (anaC && anaC.fecha_libro) + '» como fecha: la [1] se lee por ENCABEZADO, no por posición');
    af(anaC && anaC.codigo === 'jfe22d', 'el código del bloque no viaja: ' + JSON.stringify(anaC && anaC.codigo));
    // 🔒 EL «Costo al Publico» EXISTE en el libro — y se mide, no se supone.
    af(esm && esm.costo_publico === 4500, 'el libro SÍ trae «Costo al Publico» y no se leyó: ' + JSON.stringify(esm && esm.costo_publico));
    const cero = r.personas.find((p) => /Cero Tecleado/.test(p.nombre));
    af(cero && cero.costo_publico === 0,
       'un «Costo al Publico» de $0 TECLEADO salió ' + JSON.stringify(cero && cero.costo_publico)
       + ' y debe ser 0: un cero escrito es un número, no un hueco — leerlo como ausencia borra la diferencia '
       + 'entre «no sé cuánto cuesta» y «cuesta cero»');
    const feid = r.personas.find((p) => /Feid/.test(p.nombre));
    af(feid && feid.costo_publico === null,
       'sin «Costo al Publico» legible tiene que ser null, no cero (10.6% de las filas reales): ' + JSON.stringify(feid && feid.costo_publico));
    // La basura de la columna de fecha NO se limpia ni se inventa: viaja tal
    // cual y acabará en `sin_mapeo`, que es donde se ve.
    const env = r.personas.find((p) => /Rosa Envio/.test(p.nombre));
    af(env && env.fecha_libro === 'se envio a reynosa',
       'la nota de envío en la columna de fecha se tocó: ' + JSON.stringify(env && env.fecha_libro));
    af(r.bloques.length === 4, 'contó ' + r.bloques.length + ' bloque(s), se esperaban 4 (el irregular + 3 con título)');

    // 🔒 LA COLUMNA 0 ES EL NOMBRE AUNQUE EL ENCABEZADO NO LA ROTULE.
    // Medido en la rejilla real: los bloques «Rosalia» y «Humbe» traen el
    // encabezado SIN la celda «Nombre» —empieza en [1]«Codigo»— y aun así sus
    // filas llevan el nombre en la [0]. Con `nombre: -1`, ONCE PERSONAS REALES
    // se caían al montón de «sin nombre» y desaparecían del careo con su dinero
    // dentro. El corte de qué evento cuenta lo decide LA SIEMBRA; perderlos al
    // parsear sería un corte accidental, que es el peor de todos.
    const CAB_SIN_ROTULO = ['', 'Codigo', 'Tipo de Boleto', 'Vendedor', 'Costo Proveedor', 'Costo al Publico',
      'Separo','Pago 1','Pago 2','Pago 3','Pago 4','Pago 5','Pago 6','Pago 7','Total','Resta','Ganancia','Pagado','Correo','Entregado'];
    const fr = (v) => { const f = new Array(CAB_SIN_ROTULO.length).fill('');
      f[0] = v.nombre || ''; f[1] = v.codigo || ''; f[5] = v.costo || ''; f[6] = v.separo || ''; f[7] = v.pago || ''; return f; };
    const r2 = N.parsearLibro([
      ['Rosalia'], CAB_SIN_ROTULO,
      // Los nombres vienen con COMILLAS PEGADAS en la hoja real
      // («Jose iram urbina"», «"Ivan Delgado"»). Sin quitarlas, la llave del
      // careo sería `"ivan delgado"` y NUNCA casaría con el `ivan delgado` de
      // la pestaña: la persona saldría como NUEVA y se le daría de alta un
      // duplicado con su dinero.
      fr({ nombre: '"Ivan Delgado"', costo: '$2,600', separo: '$1,000', pago: '$400' }),
      fr({ nombre: 'Jose iram urbina"', costo: '$5,800', separo: '$1,000', pago: '$1,200' }),
    ]);
    console.log('    bloque sin rótulo → ' + r2.personas.map((x) => `${JSON.stringify(x.nombre)}→${JSON.stringify(x.clave)}`).join(' · '));
    af(r2.personas.length === 2, 'el bloque sin rótulo de «Nombre» dio ' + r2.personas.length
       + ' persona(s) y sus filas SÍ traen nombre en la [0]: se están perdiendo con su dinero dentro');
    af(r2.personas.some((x) => x.clave === 'ivan delgado'),
       'la comilla se quedó en la llave: ' + JSON.stringify(r2.personas.map((x) => x.clave))
       + ' — con ella la persona nunca casa con la pestaña y se le daría de alta un duplicado');
    af(r2.personas.some((x) => x.clave === 'jose iram urbina'), 'la comilla del final tampoco se quitó');
    af(r2.personas.every((x) => x.abonado > 0), 'el dinero del bloque sin rótulo no se leyó');
  } } catch (e) { af(false, 'la sección del parser se CAYÓ: ' + e.message); }

  // ── [2b] (a) EL PUNTO ENTERO: la negativa esperada se vuelve CERO ─────────
  // Es la razón de ser de la tuerca. El 19-sep Jane aplicó el libro a mano, así
  // que el sistema quedó con $3,000 mientras la pestaña solo ve $1,000: hoy el
  // careo canta una NEGATIVA de −$2,000 y hay que explicarla con una nota. Con
  // el libro dentro, el lado-Excel suma 1,000 + 2,000 = 3,000 y la diferencia
  // es CERO — la fila deja de sonar porque CUADRA, no porque se la silencie.
  console.log('\n[2b] la negativa esperada, contra un sistema YA aplicado');
  if (N) {
    const { carear } = require(path.join(RAIZ, 'netlify/functions/_lib/excel-careo.js'));
    const dePestana = [{ nombre: 'Esmeralda Estefania Hernandez Lopez', clave: 'esmeralda estefania hernandez lopez',
      abonado: 1000, total: 4500, filas: 1, zona: 'Poniente Baja', paquete: 'CHEAP', talla: '-', pestanas: [PESTANA] }];
    // El sistema, tras la aplicación del 19-sep.
    const sistema = [{ id: 'v-1', nombre: 'Esmeralda Estefania Hernandez Lopez', abonado: 3000,
      abonado_previo: 3000, total_contrato: 4500, notas: 'Migrado Excel · Numerología 19-sep: +$2,000' }];

    // ANTES (solo la pestaña): la negativa que hoy suena.
    const sinLibro = carear(dePestana.map((p) => ({ ...p, fuentes: ['pestana'] })), sistema);
    const neg = (sinLibro.pagos || [])[0];
    console.log('    sin el libro → ' + (neg ? `${neg.nombre}: ${neg.diferencia}` : 'sin diferencia'));
    // CONTROL POSITIVO del caso: si SIN el libro no sonara, el cero de abajo no
    // probaría nada — estaría cuadrando algo que ya cuadraba.
    af(neg && neg.diferencia === -2000,
       'sin el libro la fila NO canta la negativa esperada (' + (neg ? neg.diferencia : 'ninguna')
       + '): sin ese ruido, el cero de con-libro no demostraría nada');

    // DESPUÉS (pestaña + libro): cuadra.
    const delLibro = N.mapearLibro(LIBRO(), MAPEOS(), EVENTO).personas;
    const conLibro = carear(N.fundirNumerologia(dePestana, delLibro), sistema);
    const sigueSonando = (conLibro.pagos || []).find((x) => /Esmeralda/.test(x.nombre));
    console.log('    con el libro → ' + (sigueSonando ? `sigue sonando: ${sigueSonando.diferencia}` : 'CUADRA (0 diferencias) ✓'));
    af(!sigueSonando, 'con el libro dentro la fila SIGUE sonando (' + (sigueSonando ? sigueSonando.diferencia : '')
       + '): el descuadre esperado tenía que volverse cuadre');
    af((conLibro.iguales || []).some((x) => /Esmeralda/.test(x.nombre)),
       'la fila no cayó en `iguales`: cuadrar es aparecer como igual, no desaparecer del careo');
    // 🔒 Y NO SE SILENCIÓ: el dinero del sistema no se tocó para lograrlo.
    af(sistema[0].abonado === 3000 && sistema[0].abonado_previo === 3000,
       'el careo movió el dinero del sistema para hacerlo cuadrar');
  }

  // ── [3] (c) SIN CONFIGURAR: el careo de dos fuentes sigue VERDE ────────────
  // La ausencia de config NO es un error del careo. La tuerca mergea ANTES del
  // despliegue, así que éste es el estado REAL de hoy en producción.
  console.log('\n[3] sin NUMEROLOGIA_SCRIPT_URL (el estado de hoy)');
  const { cosechar, leerEnv, FUENTES } = require(path.join(RAIZ, 'netlify/functions/_lib/cosecha-excel.js'));
  delete process.env.NUMEROLOGIA_SCRIPT_URL; delete process.env.NUMEROLOGIA_SCRIPT_TOKEN;
  const env = leerEnv('numerologia');
  console.log('    leerEnv(numerologia) → ' + (env.error ? env.error.codigo : 'configurada'));
  af(env.error && env.error.codigo === 'SIN_CONFIG', 'sin las vars, la fuente debe dar SIN_CONFIG y dio ' + JSON.stringify(env.error));
  af(env.error && /NUMEROLOGIA_SCRIPT_URL/.test(env.error.mensaje),
     'el mensaje no nombra la var de ESTA fuente: mandaría a arreglar lo que no está roto');
  af(env.error && /segunda vez/i.test(env.error.mensaje), 'el mensaje no dice cómo se pone (segundo despliegue del mismo .gs)');
  // 🔒 Y LAS DE SIEMPRE SIGUEN SIENDO LAS DE SIEMPRE: el refactor no puede
  // haberle cambiado la puerta a la fuente que YA funciona en producción.
  process.env.EXCEL_SCRIPT_URL = 'https://script.test/exec'; process.env.EXCEL_SCRIPT_TOKEN = 't';
  const env2 = leerEnv();
  af(!env2.error && env2.url === 'https://script.test/exec', 'la fuente por DEFECTO dejó de leer EXCEL_SCRIPT_URL: ' + JSON.stringify(env2));
  af(FUENTES.numerologia.url === 'NUMEROLOGIA_SCRIPT_URL' && FUENTES.pestanas.url === 'EXCEL_SCRIPT_URL',
     'los nombres de las env vars no son los acordados');
  const cos = await cosechar({ pestana: 'Boletos', fuente: 'numerologia' });
  console.log('    cosechar(Boletos, numerologia) → ' + cos.codigo + ' · fuente=' + cos.fuente);
  af(cos.ok === false && cos.codigo === 'SIN_CONFIG', 'cosechar la fuente sin configurar no dio SIN_CONFIG');
  af(cos.fuente === 'numerologia', 'el fallo no dice de QUÉ fuente vino: ' + JSON.stringify(cos.fuente));

  // ── [4] EL CAREO COMPLETO SIGUE VERDE SIN LA TERCERA FUENTE ───────────────
  console.log('\n[4] el careo entero, con la tercera fuente ausente');
  let d = {};
  try {
  const red = redFalsa();
  global.fetch = red.fetchFalso;
  const va = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    verifyAdminAuthLive: async () => ({ valid: true, user: { id: 'u1', rol: 'bulma', nombre: 'Bulma' } }) } };
  for (const f of ['admin-excel-careo.js', '_lib/excel-careo-correr.js', '_lib/excel-careo.js',
                   '_lib/cosecha-excel.js', '_lib/numerologia.js']) {
    try { delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', f))]; } catch (_) {}
  }
  const mod = require(path.join(RAIZ, 'netlify/functions/admin-excel-careo.js'));
  const res = await mod.handler({ httpMethod: 'POST',
    headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
    body: JSON.stringify({ evento_id: EVENTO }) });
  d = JSON.parse(res.body);
  console.log('    → ' + res.statusCode + ' · numerologia: ' + JSON.stringify(d.numerologia));
  af(res.statusCode === 200 && d.ok === true,
     'EL CAREO SE CAYÓ por no tener la tercera fuente: ' + res.statusCode + ' ' + JSON.stringify(d).slice(0, 200));
  af(d.numerologia && d.numerologia.configurada === false,
     'la respuesta no dice que la tercera fuente no está configurada: ' + JSON.stringify(d.numerologia));
  af(d.numerologia && /NUMEROLOGIA_SCRIPT_URL/.test(String(d.numerologia.motivo || '')),
     'el motivo no nombra la var que falta');
  af(Array.isArray(d.pagos) && Array.isArray(d.totales_contrato),
     'los montones de 1a/1b se perdieron al meter la tercera fuente');
  af((d.pagos || []).length > 0, 'el careo de DOS fuentes dejó de encontrar diferencias: pasaría en hueco');

  // 🔒 `fuentes` EN EL RENGLÓN REAL, tomado del careo — no armado a mano.
  // La primera versión de la prueba de pantalla fabricaba `pagos` con
  // `fuentes` escrito por mí, así que un sabotaje que le quitaba la llave al
  // careo pasaba VERDE: la sonda se estaba preguntando a sí misma.
  const unPago = (d.pagos || [])[0] || {};
  console.log('    un pago real: ' + JSON.stringify(unPago));
  af(Array.isArray(unPago.fuentes) && unPago.fuentes.includes('pestana'),
     'el renglón de pagos del careo REAL no carga `fuentes`: ' + JSON.stringify(unPago)
     + ' — sin ella la pantalla no puede decir de dónde vino el dinero');
  } catch (e) {
    // CON NOMBRE y en rojo: una caída aquí dejaría [5] sin ejercitar.
    af(false, 'la sección del careo completo se CAYÓ: ' + e.message);
  }

  // ── [4b] EL CAREO CON LA TERCERA FUENTE DENTRO, POR EL HANDLER ───────────
  // Ahora que el parser existe, el camino completo se puede ejercitar: Apps
  // Script → parser → mapeo → fusión → montones. Es el caso (b) de la tuerca y
  // el remate del (a), medidos de punta a punta y no por partes.
  console.log('\n[4b] el careo entero CON la tercera fuente');
  let d2 = {};
  try {
    const red2 = redFalsa({ conNumerologia: true });
    global.fetch = red2.fetchFalso;
    for (const f of ['admin-excel-careo.js', '_lib/excel-careo-correr.js', '_lib/excel-careo.js',
                     '_lib/cosecha-excel.js', '_lib/numerologia.js']) {
      try { delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', f))]; } catch (_) {}
    }
    process.env.NUMEROLOGIA_SCRIPT_URL = 'https://numero.test/exec';
    process.env.NUMEROLOGIA_SCRIPT_TOKEN = 't';
    const mod2 = require(path.join(RAIZ, 'netlify/functions/admin-excel-careo.js'));
    const r2 = await mod2.handler({ httpMethod: 'POST',
      headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify({ evento_id: EVENTO }) });
    d2 = JSON.parse(r2.body);
    const n = d2.numerologia || {};
    console.log('    numerologia: configurada=' + n.configurada + ' · personas=' + (n.personas || []).length
      + ' · sin_mapeo=' + (n.sin_mapeo || []).length + ' · bloques=' + n.bloques);
    af(r2.statusCode === 200 && d2.ok, 'el careo con la tercera fuente no dio 200: ' + JSON.stringify(d2).slice(0, 200));
    af(n.configurada === true, 'con las vars puestas, la fuente sigue diciéndose no configurada');

    // (a) DE PUNTA A PUNTA: la negativa esperada se volvió CERO.
    const sigue = (d2.pagos || []).find((x) => /Esmeralda/.test(x.nombre));
    console.log('    Esmeralda: ' + (sigue ? `sigue sonando ${sigue.diferencia}` : 'CUADRA ✓')
      + ' · fuentes=' + JSON.stringify(((d2.iguales || []).find((x) => /Esmeralda/.test(x.nombre)) || {}).nombre ? 'iguales' : '?'));
    af(!sigue, 'por el handler, la fila SIGUE sonando: ' + (sigue ? sigue.diferencia : ''));

    // (b) 🔒 UNA FILA DEL LIBRO SIN MAPEO NO PRODUCE NI NUEVO NI PAGO.
    const sm = n.sin_mapeo || [];
    console.log('    sin mapeo: ' + sm.map((x) => `${x.evento_libro}×${x.filas} ($${x.abonado})`).join(' · '));
    af(sm.length > 0, 'el fixture siembra filas sin mapeo y no salió ninguna: el caso pasaría en hueco');
    af(!(d2.nuevos || []).some((x) => /Feid Fan|Viejo/.test(x.nombre)),
       'una fila del libro SIN MAPEO se coló como ALTA: eso es inventarle evento a alguien');
    af(!(d2.pagos || []).some((x) => /Feid Fan|Viejo/.test(x.nombre)),
       'una fila del libro SIN MAPEO se coló como PAGO');
    af(sm.some((x) => /Feid/.test(x.evento_libro)) && sm.every((x) => x.filas > 0 && x.abonado > 0),
       'el renglón informativo no trae el conteo y el dinero: sin ellos no se puede obrar');

    // Quien vive SOLO en el libro y SÍ mapea entra como NUEVO — con su dinero.
    const jose = (d2.nuevos || []).find((x) => /José/.test(x.nombre));
    af(!!jose, 'quien vive solo en el libro y SÍ mapea no salió como nuevo');
    af(jose && jose.abonado === 19000, 'José: abonado ' + (jose && jose.abonado) + ', el libro dice 19000');
  } catch (e) {
    af(false, 'la sección del careo CON tercera fuente se CAYÓ: ' + e.message);
  }

  // ── [4c] EL RELOJ: no se trae el libro si no hay nada que mapear ──────────
  // ⏱ MEDIDO CONTRA PRODUCCIÓN: la cosecha del libro cuesta ~2.1 s en CADA
  // careo, y es EL MISMO libro para los 107 eventos. Con él, natanael pasó de
  // ~3 s a 5.3-6.0 s en caliente y 10.4 s EN FRÍO — por encima del corte de
  // Netlify. Así que primero se preguntan los mapeos (~150 ms) y el libro solo
  // se cosecha si este evento TIENE algo sembrado. Hoy, con la tabla sin
  // sembrar, el careo cuesta exactamente lo que costaba ayer.
  console.log('\n[4c] el reloj: sin siembra para este evento, no se toca el libro');
  try {
    const red3 = redFalsa({ conNumerologia: true, sinSiembra: true });
    global.fetch = red3.fetchFalso;
    for (const f of ['admin-excel-careo.js', '_lib/excel-careo-correr.js', '_lib/excel-careo.js',
                     '_lib/cosecha-excel.js', '_lib/numerologia.js']) {
      try { delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', f))]; } catch (_) {}
    }
    const mod3 = require(path.join(RAIZ, 'netlify/functions/admin-excel-careo.js'));
    const r3 = await mod3.handler({ httpMethod: 'POST',
      headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify({ evento_id: EVENTO }) });
    const d3 = JSON.parse(r3.body), n3 = d3.numerologia || {};
    console.log('    libro cosechado: ' + red3.cosechasLibro + ' vez(ces) · numerologia: ' + JSON.stringify(n3).slice(0, 120));
    af(r3.statusCode === 200 && d3.ok, 'el careo sin siembra no dio 200');
    af(red3.cosechasLibro === 0,
       'se cosechó el libro ' + red3.cosechasLibro + ' vez(ces) sin tener NADA sembrado para este evento: '
       + 'son ~2.1 s regalados en cada careo de cada evento, y el reloj de Netlify corta a los 10');
    af(n3.sin_siembra === true, 'no se dice que a este evento no le han sembrado mapeo: ' + JSON.stringify(n3));
    af(/numerologia_eventos/.test(String(n3.motivo || '')), 'el motivo no dice DÓNDE se siembra');
    // CONTROL POSITIVO: con siembra, el libro SÍ se cosecha.
    const red4 = redFalsa({ conNumerologia: true });
    global.fetch = red4.fetchFalso;
    for (const f of ['admin-excel-careo.js', '_lib/excel-careo-correr.js', '_lib/excel-careo.js',
                     '_lib/cosecha-excel.js', '_lib/numerologia.js']) {
      try { delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', f))]; } catch (_) {}
    }
    await require(path.join(RAIZ, 'netlify/functions/admin-excel-careo.js')).handler({ httpMethod: 'POST',
      headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify({ evento_id: EVENTO }) });
    console.log('    CONTROL POSITIVO (con siembra): libro cosechado ' + red4.cosechasLibro + ' vez(ces)');
    af(red4.cosechasLibro === 1, 'CON siembra el libro no se cosechó: el cero de arriba no probaría nada');
  } catch (e) { af(false, 'la sección del reloj se CAYÓ: ' + e.message); }

  // ── [5] LA PANTALLA, RENDERIZADA DE VERDAD ────────────────────────────────
  console.log('\n[5] la pantalla');
  const fuente = require('fs').readFileSync(path.join(RAIZ, 'kamehouse-eventos.js'), 'utf8');
  const corte = (n) => {
    const m = new RegExp('(?:async\\s+)?function\\s+' + n + '\\s*\\(').exec(fuente);
    if (!m) throw new Error('no encontré ' + n);
    let prof = 0;
    for (let k = fuente.indexOf('{', m.index); k < fuente.length; k++) {
      if (fuente[k] === '{') prof++;
      else if (fuente[k] === '}' && --prof === 0) return fuente.slice(m.index, k + 1);
    }
    throw new Error('llaves desbalanceadas en ' + n);
  };
  const pintar = new Function(corte('_evtEsc') + '\n' + corte('_evtMxn') + '\n'
    + corte('_excelFuenteNumerologia') + '\n' + corte('_excelChipFuentes') + '\n'
    + corte('_excelCareoHtml') + '\nreturn _excelCareoHtml;')();

  // (c) SIN CONFIGURAR: la pantalla lo DICE. Un careo que se ve igual de verde
  // con la tercera fuente dentro que fuera es la ceguera que costó $1,081,021
  // invisibles durante siete días.
  const h1 = pintar(d);
  af(/todav[ií]a NO entra a este careo/i.test(h1), 'la pantalla no avisa de que la tercera fuente no entra');
  af(/NUMEROLOGIA_SCRIPT_URL/.test(h1), 'la pantalla no dice qué falta para conectarla');
  af(!/data-chip="fuentes"/.test(h1), 'sin tercera fuente no puede haber chip de doble procedencia');

  // Y con la fuente DENTRO: el chip sale solo donde hay DOS fuentes.
  const dDos = JSON.parse(JSON.stringify(d));
  dDos.numerologia = { configurada: true, personas: [{ nombre: 'X' }],
    sin_mapeo: [{ evento_libro: 'Feid', fecha_libro: '', filas: 12, abonado: 30000 }] };
  // El pago de DOS fuentes se construye a partir del renglón REAL del careo
  // —copiando su forma, no inventándola— y solo se le añade la segunda fuente.
  const base0 = (d.pagos || [])[0];
  dDos.pagos = [
    { ...base0, nombre: 'Con Dos', fuentes: [...(base0.fuentes || []), 'numerologia'] },
    { ...base0, nombre: 'Solo Una' },
  ];
  dDos.totales = { ...d.totales, pagos: 2 };
  const h2 = pintar(dDos);
  const chips = (h2.match(/data-chip="fuentes"/g) || []).length;
  console.log('    chip «pestaña + numerología» ×' + chips + ' (de 2 pagos, solo 1 trae dos fuentes)');
  af(chips === 1, 'el chip de procedencia sale ' + chips + ' vez(ces) y debe salir 1: solo donde la fila trae LAS DOS');
  af(/Numerolog[ií]a DENTRO del careo/.test(h2), 'con la fuente dentro, la pantalla no lo dice');
  af(/sin mapear a ning[úu]n evento/.test(h2) && /Feid/.test(h2),
     'el montón informativo de SIN MAPEO no se pinta: callarlo lo vuelve invisible, que es lo contrario de contarlo');
  af(/numerologia_eventos/.test(h2), 'la pantalla no dice DÓNDE se arregla un sin-mapeo');

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\\n', e.stack); process.exit(1); });

// ── la red falsa (solo lo que [4] necesita) ─────────────────────────────────
function redFalsa(opts) {
  const SB = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
  const tablas = {
    excel_pestanas: [{ evento_id: EVENTO, pestana: PESTANA, regla_zona: null, activa: true, notas: null }],
    numerologia_eventos: (opts && opts.sinSiembra) ? [] : MAPEOS(),
    viajeros_evento: [
      { id: 'v-1', evento_id: EVENTO, nombre: 'Esmeralda Estefania Hernandez Lopez', tipo_viajero: 'cliente',
        abonado_previo: 3000, total_contrato: 4500, notas: 'Migrado Excel · Numerología 19-sep: +$2,000', zona_boleto: 'Poniente Baja', tipo_paquete: 'cheap' },
    ],
    abonos_viajero: [],
  };
  const excel = { [PESTANA]: conPreludio([
    filaExcel({ 'Nombre': 'Esmeralda Estefania Hernandez Lopez', 'Paquete': 'CHEAP', 'Boleto': 'Poniente Baja', 'Separo': '$1,000', 'Total': '$4,500', 'TALLA': '-' }),
  ]) };
  const cuenta = { libro: 0 };
  const filtrar = (filas, qs) => {
    let out = filas;
    for (const [campo, expr] of qs.entries()) {
      if (['select', 'limit', 'order', 'or'].includes(campo)) continue;
      let m;
      if ((m = /^eq\.(.*)$/.exec(expr))) { out = out.filter((f) => String(f[campo]) === decodeURIComponent(m[1])); continue; }
      if ((m = /^is\.(.*)$/.exec(expr))) { const v = m[1] === 'true' ? true : m[1] === 'false' ? false : null; out = out.filter((f) => f[campo] === v); continue; }
      if ((m = /^in\.\((.*)\)$/.exec(expr))) { const vs = m[1].split(',').map((v) => decodeURIComponent(v).replace(/^"|"$/g, '')); out = out.filter((f) => vs.includes(String(f[campo]))); continue; }
      throw new Error('filtro no modelado: ' + campo + '=' + expr);
    }
    return out;
  };
  const LIBRO_CRUDO = [
    ['Karol G'],
    ['Nombre','Fecha','Tipo de Boleto','Vendedor','Costo Proveedor','Costo al Publico','Separo','Pago 1','Total','Resta'],
    ['Esmeralda Estefania Hernandez Lopez','','Poniente Baja','Memo','','$4,500','$1,000','$1,000','$2,000',''],
    ['José Santos','','Poniente Baja','Memo','','$19,000','$10,000','$9,000','$19,000',''],
    ['Nancy Ruiz','7 de noviembre','VIP A','Memo','','$8,000','$5,000','','$5,000',''],
    [''],
    ['Feid'],
    ['Nombre','Fecha','Tipo de Boleto','Vendedor','Costo Proveedor','Costo al Publico','Separo','Pago 1','Total','Resta'],
    ['Feid Fan','','General','Memo','','$3,000','$3,000','','$3,000',''],
  ];
  const fetchFalso = async (url, opts) => {
    if (String(url).startsWith('https://numero.test')) {
      const c = JSON.parse(opts.body);
      if (c.pestana === 'Boletos') cuenta.libro++;
      if (c.pestana !== 'Boletos') return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, codigo: 'SIN_PESTANA', error: 'no existe' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, filas: LIBRO_CRUDO, pestanas: ['Boletos'] }) };
    }
    if (String(url).startsWith('https://script.test')) {
      const c = JSON.parse(opts.body);
      const filas = excel[c.pestana];
      if (!c.pestana) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, pestanas: Object.keys(excel) }) };
      if (!filas) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, codigo: 'SIN_PESTANA', error: 'no existe' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, filas, pestanas: Object.keys(excel) }) };
    }
    if (!String(url).startsWith(SB)) throw new Error('destino desconocido: ' + url);
    const u = new URL(url);
    const tabla = u.pathname.replace('/rest/v1/', '');
    if (((opts && opts.method) || 'GET') !== 'GET') throw new Error('EL CAREO ESCRIBIÓ: ' + opts.method + ' a ' + tabla);
    return { ok: true, status: 200, json: async () => filtrar(tablas[tabla] || [], u.searchParams), text: async () => '' };
  };
  return { tablas, fetchFalso, get cosechasLibro() { return cuenta.libro; } };
}
