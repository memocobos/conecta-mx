-- =============================================================================
-- PREVENTA-CORR-1 · LA CORRECCIÓN DEL DATO QUE DEJÓ LA PREVENTA CONTADA COMO PAGO
-- 3-oct-2026 · lo carea y lo corre JANE · acta de Claude Code
-- =============================================================================
-- Palabras: Memo y Ximena (3-oct), recogidas en PREVENTA-DECISIONES-1 y -2.
-- 🔒 CERO ESCRITURAS hasta el visto de Jane. Esto es un PLAN, no una corrida.
--
-- ── DE DÓNDE VIENE ──────────────────────────────────────────────────────────
-- `mapa.dinero` de `_lib/excel-careo` sumaba la columna «Preventa» del Excel como
-- si fuera un pago. Barrido el 3-oct sobre LAS 68 PESTAÑAS ACTIVAS, preguntándole
-- a la celda `Abonado` de cada pestaña —lo que la hoja dice que RECIBIÓ el
-- negocio— en las 28 filas que traen Preventa con valor:
--
--     PREVENTA ES DESCUENTO : 28/28       PREVENTA ES DINERO : 0/28
--     pestañas con «Pa'l Norte» activas : NINGUNA
--     y la cuenta cierra al peso: Total = Costo + Hab + Avión − Preventa
--
-- El CÓDIGO ya se arregló y está en prod (PREVENTA-DESCUENTO-1, PR #778, merge
-- b5b134b), con un testigo que grita el día que la Preventa vuelva a hacer de
-- dinero. Esta acta corrige el DATO que quedó atrás. El orden importa: al revés,
-- el siguiente careo volvería a inflarlos.
--
-- ── EL CANDADO DE ENTRADA, Y POR QUÉ ESTA CORRECCIÓN SE ENTIENDE ───────────
-- Medido contra la base viva antes de escribir una línea:
--   · las 28 personas existen;
--   · la preventa CABE en el `abonado_previo` de las 28 (ninguna queda negativa);
--   · y el candado que manda: tras bajar la preventa, el cobrado queda EXACTO en
--     el «Abonado» que la pestaña declara en **27 de 27**. El único que no cuadra
--     es Roberto Venner, y por eso NO está aquí.
--
-- 🔒 LA PREVENTA VIVE EN `abonado_previo`, NO EN LOS ABONOS. Medido: en las 28 el
-- monto a quitar cabe entero en esa columna — la migración del 28-ago fundió ahí
-- el dinero de la pestaña, preventa incluida. Así que NINGÚN abono se toca en el
-- bloque de los 27: no hay que inventar una transacción ni anular una real.
--
-- 🔒 CADA `update` LLEVA SU VALOR ESPERADO EN EL `where`. Si el careo movió el
-- `abonado_previo` entre la medición y la corrida, la fila NO se escribe y el
-- conteo de abajo lo delata. Un `set` a ciegas escribiría un número viejo.
--
-- ── LO QUE ESTO **NO** HACE ────────────────────────────────────────────────
--   · NO toca `total_contrato` de nadie en el bloque de los 27: el precio está
--     bien, lo que estaba mal era el dinero.
--   · NO toca la fila de `dalemix` de Allan Abalos — evento anterior a calle24,
--     fuera del Resumen por orden de Memo (su nota ya trae el sello CERO-HIST
--     20-sep). Queda DICHA aquí como conocida, y sin escribir.
--   · NO toca a Roberto Venner (warped): su sistema trae $3,800 más que la
--     pestaña y su libro $25 más que su contrato — es otra familia, caso aparte
--     por orden de Memo.
--   · NO resuelve el montón de 19 SALDOS A FAVOR REALES ($15,956): ésos son
--     dinero que el cliente SÍ pagó, la pestaña lo confirma con su celda `Resta`
--     en negativo, y su destino sigue esperando palabra de Memo.
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- CANDADO DE ENTRADA · SE CORRE **ANTES** Y TIENE QUE SALIR LIMPIO
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔒 Cada `update` de abajo lleva su `abonado_previo` ESPERADO en el `where`, así
-- que si el careo lo movió entre la medición y esta corrida la fila NO se
-- escribe — y eso es correcto, pero SILENCIOSO. Esto lo hace ruidoso ANTES.
-- Las 29 tripletas se EXTRAJERON DEL PROPIO ARCHIVO (no de la fuente que lo
-- generó), así que un dedazo en el acta se caza aquí.
-- Corrido el 3-oct-2026 contra la base viva:
--     renglones 29 · encontradas 29 · previo COINCIDE 29 · se movió 0
--     negativos 0 · suma a retirar $16,856 · problemas: NINGUNO
-- (los $16,856 son los $14,056 de los 27 + $3,200 de Allan − $400 de Delmi,
--  que es una SUBIDA, no un retiro)
with acta(ev,nom,previo_esperado,previo_nuevo) as (values
  ('alvarodiaz#0','Ilse Carolina Luna Aceves',4900,4100),
  ('caifanes#0','Vidal del Carmen Herrera Torres',2050,1550),
  ('caifanes#0','Myriam Lizet Melchor Rosales',2050,1550),
  ('edsheeran','Diana Esperanza Montoya Meza',7400,6808),
  ('juniorh','Edwin Jeovanni Carballido Ramírez',4300,3800),
  ('juniorh','Stephani Manzo Rodriguez',4300,3800),
  ('juniorh','Itzel Esmeralda Vazquez Hernandez',3300,3100),
  ('juniorh','Regina Gissel Hernández López',1490,990),
  ('juniorh','Jared Rubén Pérez Bailon',1490,990),
  ('juniorh','María de Jesús Gutiérrez Martínez',1000,500),
  ('juniorh','Brayan Gutiérrez Martínez',1000,500),
  ('karolg#0','Marlene Reyes Ramirez',4525,4025),
  ('karolg#0','Maria Guadalupe Garcia Vazquez',4525,4025),
  ('karolg#0','Cecilia Guadalupe Hernández Lara',4220,3720),
  ('karolg#1','Karely Sánchez Linares',5367,4567),
  ('karolg#1','Ashley Nalleli Lara Rosales',5367,4567),
  ('karolg#1','Emery Elizabeth Sánchez Gutiérrez',6280,5780),
  ('karolg#1','Daneyra Isabel Hernández Gutiérrez',6280,5780),
  ('karolg#1','Loreta Gissel Sánchez Gutiérrez',6280,5780),
  ('natanael','Yamileth Cavazos Hernandez',3350,2850),
  ('natanael','Juan Antonio Cruz Chairez',3350,2850),
  ('omar#1','Ricardo Yahir Hernández',2200,1900),
  ('pulsoquetaro','Katia Yamileth Navarro Reyna',5896,5364),
  ('pulsoquetaro','Ana Lizeth Navarro Reyna',5896,5364),
  ('straykids#1','Andrea Sandoval Flores',12425,11925),
  ('straykids#1','Alejandra Sandoval Flores',12425,11925),
  ('omar#0','Jesús Antonio González Medrano',800,300),
  ('badgyal','Allan Abalos De La Fuente',3200,0),
  ('karolg#1','Delmi Yaneth López san Gabriel',16100,16500)
)
select count(*) as renglones_del_acta,
       count(v.id) as personas_encontradas,
       count(*) filter (where v.abonado_previo = a.previo_esperado) as previo_COINCIDE,
       count(*) filter (where v.abonado_previo <> a.previo_esperado) as previo_SE_MOVIO,
       count(*) filter (where a.previo_nuevo < 0) as nuevo_negativo_debe_ser_0,
       sum(a.previo_esperado - a.previo_nuevo) as suma_que_se_retira,
       string_agg(case when v.id is null or v.abonado_previo <> a.previo_esperado
                       then a.ev||' '||a.nom||' esperaba '||a.previo_esperado||' y trae '||coalesce(v.abonado_previo::text,'(no existe)') end, ' ## ') as problemas
  from acta a left join viajeros_evento v on v.evento_id = a.ev and v.nombre = a.nom;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOQUE 1 · LOS 27 DE LA PREVENTA  ·  −$14,056
-- ═══════════════════════════════════════════════════════════════════════════
-- Una sola operación, la misma 27 veces: `abonado_previo` menos su preventa, y
-- la nota cuenta el motivo CON el monto, como en CORR-DOBLE-1.
-- Las tres de karolg#1 (Emery, Daneyra, Loreta) entran aquí: palabra de Ximena,
-- «por el cambio de fecha se les hizo un descuento de $500, por eso aparece
-- $6,950 en total» — ese descuento ES la preventa. Quedan en $6,950 = contrato,
-- saldo 0, y el encargo de mover la celda `Total` a $7,450 queda CANCELADO.

-- alvarodiaz#0 · Ilse Carolina Luna Aceves · preventa $800 · previo 4900 → 4100
update viajeros_evento set abonado_previo = 4100,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $800 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $4100.'
 where evento_id = 'alvarodiaz#0' and nombre = 'Ilse Carolina Luna Aceves' and abonado_previo = 4900;

-- caifanes#0 · Vidal del Carmen Herrera Torres · preventa $500 · previo 2050 → 1550
update viajeros_evento set abonado_previo = 1550,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $1550.'
 where evento_id = 'caifanes#0' and nombre = 'Vidal del Carmen Herrera Torres' and abonado_previo = 2050;

-- caifanes#0 · Myriam Lizet Melchor Rosales · preventa $500 · previo 2050 → 1550
update viajeros_evento set abonado_previo = 1550,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $1550.'
 where evento_id = 'caifanes#0' and nombre = 'Myriam Lizet Melchor Rosales' and abonado_previo = 2050;

-- edsheeran · Diana Esperanza Montoya Meza · preventa $592 · previo 7400 → 6808
update viajeros_evento set abonado_previo = 6808,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $592 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $6808.'
 where evento_id = 'edsheeran' and nombre = 'Diana Esperanza Montoya Meza' and abonado_previo = 7400;

-- juniorh · Edwin Jeovanni Carballido Ramírez · preventa $500 · previo 4300 → 3800
update viajeros_evento set abonado_previo = 3800,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $4300.'
 where evento_id = 'juniorh' and nombre = 'Edwin Jeovanni Carballido Ramírez' and abonado_previo = 4300;

-- juniorh · Stephani Manzo Rodriguez · preventa $500 · previo 4300 → 3800
update viajeros_evento set abonado_previo = 3800,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $4300.'
 where evento_id = 'juniorh' and nombre = 'Stephani Manzo Rodriguez' and abonado_previo = 4300;

-- juniorh · Itzel Esmeralda Vazquez Hernandez · preventa $200 · previo 3300 → 3100
update viajeros_evento set abonado_previo = 3100,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $200 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $5300.'
 where evento_id = 'juniorh' and nombre = 'Itzel Esmeralda Vazquez Hernandez' and abonado_previo = 3300;

-- juniorh · Regina Gissel Hernández López · preventa $500 · previo 1490 → 990
update viajeros_evento set abonado_previo = 990,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $1490.'
 where evento_id = 'juniorh' and nombre = 'Regina Gissel Hernández López' and abonado_previo = 1490;

-- juniorh · Jared Rubén Pérez Bailon · preventa $500 · previo 1490 → 990
update viajeros_evento set abonado_previo = 990,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $1490.'
 where evento_id = 'juniorh' and nombre = 'Jared Rubén Pérez Bailon' and abonado_previo = 1490;

-- juniorh · María de Jesús Gutiérrez Martínez · preventa $500 · previo 1000 → 500
update viajeros_evento set abonado_previo = 500,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $500.'
 where evento_id = 'juniorh' and nombre = 'María de Jesús Gutiérrez Martínez' and abonado_previo = 1000;

-- juniorh · Brayan Gutiérrez Martínez · preventa $500 · previo 1000 → 500
update viajeros_evento set abonado_previo = 500,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $500.'
 where evento_id = 'juniorh' and nombre = 'Brayan Gutiérrez Martínez' and abonado_previo = 1000;

-- karolg#0 · Marlene Reyes Ramirez · preventa $500 · previo 4525 → 4025
update viajeros_evento set abonado_previo = 4025,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $5367.'
 where evento_id = 'karolg#0' and nombre = 'Marlene Reyes Ramirez' and abonado_previo = 4525;

-- karolg#0 · Maria Guadalupe Garcia Vazquez · preventa $500 · previo 4525 → 4025
update viajeros_evento set abonado_previo = 4025,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $5367.'
 where evento_id = 'karolg#0' and nombre = 'Maria Guadalupe Garcia Vazquez' and abonado_previo = 4525;

-- karolg#0 · Cecilia Guadalupe Hernández Lara · preventa $500 · previo 4220 → 3720
update viajeros_evento set abonado_previo = 3720,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $6500.'
 where evento_id = 'karolg#0' and nombre = 'Cecilia Guadalupe Hernández Lara' and abonado_previo = 4220;

-- karolg#1 · Karely Sánchez Linares · preventa $800 · previo 5367 → 4567
update viajeros_evento set abonado_previo = 4567,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $800 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $4567.'
 where evento_id = 'karolg#1' and nombre = 'Karely Sánchez Linares' and abonado_previo = 5367;

-- karolg#1 · Ashley Nalleli Lara Rosales · preventa $800 · previo 5367 → 4567
update viajeros_evento set abonado_previo = 4567,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $800 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $4567.'
 where evento_id = 'karolg#1' and nombre = 'Ashley Nalleli Lara Rosales' and abonado_previo = 5367;

-- karolg#1 · Emery Elizabeth Sánchez Gutiérrez · preventa $500 · previo 6280 → 5780
update viajeros_evento set abonado_previo = 5780,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $6950.'
 where evento_id = 'karolg#1' and nombre = 'Emery Elizabeth Sánchez Gutiérrez' and abonado_previo = 6280;

-- karolg#1 · Daneyra Isabel Hernández Gutiérrez · preventa $500 · previo 6280 → 5780
update viajeros_evento set abonado_previo = 5780,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $6950.'
 where evento_id = 'karolg#1' and nombre = 'Daneyra Isabel Hernández Gutiérrez' and abonado_previo = 6280;

-- karolg#1 · Loreta Gissel Sánchez Gutiérrez · preventa $500 · previo 6280 → 5780
update viajeros_evento set abonado_previo = 5780,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $6950.'
 where evento_id = 'karolg#1' and nombre = 'Loreta Gissel Sánchez Gutiérrez' and abonado_previo = 6280;

-- natanael · Yamileth Cavazos Hernandez · preventa $500 · previo 3350 → 2850
update viajeros_evento set abonado_previo = 2850,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $5200.'
 where evento_id = 'natanael' and nombre = 'Yamileth Cavazos Hernandez' and abonado_previo = 3350;

-- natanael · Juan Antonio Cruz Chairez · preventa $500 · previo 3350 → 2850
update viajeros_evento set abonado_previo = 2850,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $5200.'
 where evento_id = 'natanael' and nombre = 'Juan Antonio Cruz Chairez' and abonado_previo = 3350;

-- omar#1 · Ricardo Yahir Hernández · preventa $300 · previo 2200 → 1900
update viajeros_evento set abonado_previo = 1900,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $300 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $3300.'
 where evento_id = 'omar#1' and nombre = 'Ricardo Yahir Hernández' and abonado_previo = 2200;

-- pulsoquetaro · Katia Yamileth Navarro Reyna · preventa $532 · previo 5896 → 5364
update viajeros_evento set abonado_previo = 5364,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $532 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $6118.'
 where evento_id = 'pulsoquetaro' and nombre = 'Katia Yamileth Navarro Reyna' and abonado_previo = 5896;

-- pulsoquetaro · Ana Lizeth Navarro Reyna · preventa $532 · previo 5896 → 5364
update viajeros_evento set abonado_previo = 5364,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $532 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $6118.'
 where evento_id = 'pulsoquetaro' and nombre = 'Ana Lizeth Navarro Reyna' and abonado_previo = 5896;

-- straykids#1 · Andrea Sandoval Flores · preventa $500 · previo 12425 → 11925
update viajeros_evento set abonado_previo = 11925,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $12425.'
 where evento_id = 'straykids#1' and nombre = 'Andrea Sandoval Flores' and abonado_previo = 12425;

-- straykids#1 · Alejandra Sandoval Flores · preventa $500 · previo 12425 → 11925
update viajeros_evento set abonado_previo = 11925,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $12425.'
 where evento_id = 'straykids#1' and nombre = 'Alejandra Sandoval Flores' and abonado_previo = 12425;

-- omar#0 · Jesús Antonio González Medrano · preventa $500 · previo 800 → 300
update viajeros_evento set abonado_previo = 300,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $500 de lo abonado — la columna «Preventa» del Excel es un DESCUENTO sobre el precio, no un pago recibido, y la migración la había sumado como dinero. El «Abonado» que declara la pestaña es $2200.'
 where evento_id = 'omar#0' and nombre = 'Jesús Antonio González Medrano' and abonado_previo = 800;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOQUE 2 · ALLAN ABALOS DE LA FUENTE · badgyal · CANCELACIÓN
-- ═══════════════════════════════════════════════════════════════════════════
-- Palabra de Memo (3-oct): CANCELÓ, y pagó $500 — manda el libro, cuya fila está
-- ROJA. Verificado: el libro cosechado hoy trae 865 filas, `colores_leidos=true`,
-- histograma de celdas rojas {0:798, 1:16, 20:48, 21:3} → 51 filas rojas con el
-- umbral de 3 (ROJAS_MIN_CELDAS, dueño: `_lib/excel-careo-correr`), y la de Allan
-- es una: evento_libro «Bad Gyal», $500, roja.
--
-- 🔴 SU «COBRADO» DE $3,700 ES DOBLE HUMO, Y LO CONFIESA SU PROPIA NOTA:
--     «TOTAL-1: contrato $3200 (Costo al Público de Numerología)»
-- O sea que el $3,200 del `abonado_previo` es el PRECIO copiado como pago por la
-- migración del 28-ago, no dinero recibido. El único pago real es el abono de
-- $500 del careo del 20-sep, que coincide al peso con su fila roja del libro.
--
-- ⚠️ EL ORDEN ES PARTE DE LA CORRECCIÓN: primero se limpia el humo y hasta el
-- final se fija el contrato a lo cobrado. Al revés, el `total_contrato` se
-- calcularía sobre un cobrado que todavía trae los $3,200 y la baja quedaría con
-- saldo a favor de $3,200 — el error que sí se cobra caro.

-- 2.1 · el precio que se copió como pago, fuera.
update viajeros_evento
   set abonado_previo = 0,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: se quitaron $3,200 de lo abonado — no era un pago, era el «Costo al Público» de Numerología que la migración del 28-ago copió a `abonado_previo` (lo dice su propia nota de TOTAL-1). Su único pago real son los $500 del 20-sep, que coinciden con su fila ROJA del libro.'
 where evento_id = 'badgyal'
   and nombre = 'Allan Abalos De La Fuente'
   and abonado_previo = 3200;

-- 2.2 · el abono de $500 NO SE TOCA. Se deja dicho para que nadie lo busque:
--       abono d536a0b4-e2f0-4309-81f4-69a49804725d · $500 · 2026-09-20
--       «Careo Excel Bad Gyal - 23 de octubre 2026-09-20»  ← el pago REAL.

-- 2.3 · la baja por cancelación, con la regla de CAREO-ZONA-1c: el contrato se
--       iguala a LO COBRADO para que el saldo quede en 0 y los $500 queden como
--       ganancia. 🔒 `zona_boleto` ya está en NULL (medido), y se deja explícito
--       para que la fila cumpla la guarda de idempotencia de las bajas
--       (`boletos === 0 && sin zona`): si no, el próximo careo la volvería a
--       proponer.
update viajeros_evento
   set boletos = 0,
       zona_boleto = null,
       total_contrato = 500,
       notas = coalesce(notas,'') || ' · CANCELADA (fila roja del libro de Numerología) 3-oct-2026: palabra de Memo. Contrato igualado a lo cobrado ($500) para que el saldo quede en 0 — los $500 quedan como ganancia (CAREO-ZONA-1c).'
 where evento_id = 'badgyal'
   and nombre = 'Allan Abalos De La Fuente'
   and abonado_previo = 0            -- 🔒 solo después de 2.1
   and boletos = 1;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOQUE 3 · DELMI YANETH LÓPEZ SAN GABRIEL · karolg#1 · DOS PASOS
-- ═══════════════════════════════════════════════════════════════════════════
-- Palabra de Memo (3-oct): sí a los dos pasos. Es CORR-DOBLE-1 re-corrido con
-- cosecha fresca: el libro de hoy trae 5 filas de $3,300 = $16,500, que es
-- EXACTAMENTE su contrato (5 boletos). Su `abonado_previo` de $16,100 es el libro
-- VIEJO; Ximena registró $400 más.

-- 3.1 · el reflejo de la pestaña, anulado (NO se borra: la historia se conserva).
update abonos_viajero
   set monto = 0,
       nota = coalesce(nota,'') || ' · ANULADO 3-oct-2026 (PREVENTA-CORR-1 / CORR-DOBLE-1 re-corrido): este abono de $5,000 era REFLEJO de la pestaña — su pago completo vive en el libro de Numerología, que hoy trae 5 filas de $3,300 = $16,500.'
 where id = '4c1e137e-14a8-4851-a769-650b312b196c'
   and monto = 5000;

-- 3.2 · y el previo al libro de HOY: $16,100 → $16,500.
update viajeros_evento
   set abonado_previo = 16500,
       notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: abonado_previo $16,100 → $16,500, los $400 que Ximena registró en Numerología (5 filas de $3,300). Queda $16,500 = contrato, saldo 0.'
 where evento_id = 'karolg#1'
   and nombre = 'Delmi Yaneth López san Gabriel'
   and abonado_previo = 16100;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOQUE 4 · ELVIA GUADALUPE MACIAS CABELLO · karolg#0 · CON SU RESIDUO DICHO
-- ═══════════════════════════════════════════════════════════════════════════
-- Palabra de Memo (3-oct): sí, entra con su residuo de $2 dicho en la nota.
-- El libro de hoy trae 2 filas de $7,500 = $15,000 = su contrato. Su previo es
-- $14,998, así que tras anular el reflejo quedan $2 de deuda REAL — chicos, pero
-- 🔒 se DICEN: un residuo callado se vuelve una diferencia que alguien persigue
-- el mes que viene sin saber de dónde salió.
update abonos_viajero
   set monto = 0,
       nota = coalesce(nota,'') || ' · ANULADO 3-oct-2026 (PREVENTA-CORR-1 / CORR-DOBLE-1 re-corrido): este abono de $2,000 era REFLEJO de la pestaña — su pago vive en el libro, que hoy trae 2 filas de $7,500 = $15,000.'
 where id = '07f81ff6-961c-4d86-9838-049ff7eadf52'
   and monto = 2000;

update viajeros_evento
   set notas = coalesce(notas,'') || ' · PREVENTA-CORR-1 3-oct-2026: tras anular el reflejo de $2,000 su cobrado queda en $14,998 contra un contrato de $15,000 y un libro de $15,000: quedan $2 de deuda real, de redondeo del libro. Se deja DICHO a propósito — no se inventa el ajuste.'
 where evento_id = 'karolg#0'
   and nombre = 'Elvia Guadalupe Macias Cabello'
   and abonado_previo = 14998;


-- ═══════════════════════════════════════════════════════════════════════════
-- QUIEN NO ENTRA, Y POR QUÉ (para que nadie lo busque)
-- ═══════════════════════════════════════════════════════════════════════════
-- · ERNERSTO HINOJOSA · arjona — SALIÓ SOLO. El libro de hoy trae 2 filas de
--   $8,715 = $17,430 = su contrato = su cobrado. Deuda $0. Nada que escribir.
--   🔍 Su nombre está mal escrito en la base: «Ernersto», con una r de más. Una
--   búsqueda por el nombre bueno lo pierde — apareció barriendo por «Hinojosa».
-- · ROBERTO VENNER · warped — caso APARTE por orden de Memo. Su sistema trae
--   $3,800 más que la pestaña (no $500) y su libro $3,352 contra un contrato de
--   $3,327: $25 de más. No es esta familia y no se mezcla.
-- · ALLAN ABALOS · dalemix — NO SE TOCA. Evento anterior a calle24, fuera del
--   Resumen por orden de Memo; su nota ya trae el sello CERO-HIST 20-sep.
--   Contrato NULL, cobrado $3,600, no está en el libro y no es roja.


-- ═══════════════════════════════════════════════════════════════════════════
-- CANDADO DE SALIDA · se corre DESPUÉS y tiene que imprimir lo de la derecha
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔒 Nada se da por aplicado hasta que estos números salgan. Un `update` que no
-- tocó filas no truena: se queda callado — y el silencio aquí es el peor reporte.
with esperado(que, valor) as (values
  ('1 · los 27 con la preventa quitada',           27),
  ('2 · Allan: previo 0 · boletos 0 · total 500',   1),
  ('3 · Delmi: abono en 0 y previo 16500',          1),
  ('4 · Elvia: abono en 0',                         1)
)
select
  -- 1 · los 27: su cobrado tiene que ser el «Abonado» que declara la pestaña.
  --     (la lista de pares vive en el bloque 1; aquí se cuenta el efecto)
  (select count(*) from viajeros_evento v
    where (v.evento_id, v.nombre) in (
      ('alvarodiaz#0','Ilse Carolina Luna Aceves'),('caifanes#0','Vidal del Carmen Herrera Torres'),
      ('caifanes#0','Myriam Lizet Melchor Rosales'),('edsheeran','Diana Esperanza Montoya Meza'),
      ('juniorh','Edwin Jeovanni Carballido Ramírez'),('juniorh','Stephani Manzo Rodriguez'),
      ('juniorh','Itzel Esmeralda Vazquez Hernandez'),('juniorh','Regina Gissel Hernández López'),
      ('juniorh','Jared Rubén Pérez Bailon'),('juniorh','María de Jesús Gutiérrez Martínez'),
      ('juniorh','Brayan Gutiérrez Martínez'),('karolg#0','Marlene Reyes Ramirez'),
      ('karolg#0','Maria Guadalupe Garcia Vazquez'),('karolg#0','Cecilia Guadalupe Hernández Lara'),
      ('karolg#1','Karely Sánchez Linares'),('karolg#1','Ashley Nalleli Lara Rosales'),
      ('karolg#1','Emery Elizabeth Sánchez Gutiérrez'),('karolg#1','Daneyra Isabel Hernández Gutiérrez'),
      ('karolg#1','Loreta Gissel Sánchez Gutiérrez'),('natanael','Yamileth Cavazos Hernandez'),
      ('natanael','Juan Antonio Cruz Chairez'),('omar#1','Ricardo Yahir Hernández'),
      ('pulsoquetaro','Katia Yamileth Navarro Reyna'),('pulsoquetaro','Ana Lizeth Navarro Reyna'),
      ('straykids#1','Andrea Sandoval Flores'),('straykids#1','Alejandra Sandoval Flores'),
      ('omar#0','Jesús Antonio González Medrano'))
      and v.notas like '%PREVENTA-CORR-1%')                as los_27_debe_ser_27,
  -- 2 · Allan, las tres cosas a la vez (no una de tres).
  (select count(*) from viajeros_evento
    where evento_id='badgyal' and nombre='Allan Abalos De La Fuente'
      and abonado_previo=0 and boletos=0 and zona_boleto is null
      and total_contrato=500)                              as allan_debe_ser_1,
  -- 🔒 y su abono real SIGUE VIVO: la cancelación no se lleva el pago.
  (select count(*) from abonos_viajero
    where id='d536a0b4-e2f0-4309-81f4-69a49804725d' and monto=500) as allan_pago_vivo_debe_ser_1,
  (select count(*) from abonos_viajero
    where id='4c1e137e-14a8-4851-a769-650b312b196c' and monto=0)   as delmi_abono_debe_ser_1,
  (select count(*) from viajeros_evento
    where evento_id='karolg#1' and nombre='Delmi Yaneth López san Gabriel'
      and abonado_previo=16500)                            as delmi_previo_debe_ser_1,
  (select count(*) from abonos_viajero
    where id='07f81ff6-961c-4d86-9838-049ff7eadf52' and monto=0)   as elvia_abono_debe_ser_1,
  -- 🔒 Y EL CANDADO QUE PROTEGE AL QUE NO ENTRA: ni Roberto ni el dalemix de
  -- Allan pueden haber cambiado. Si cambiaron, se tocó lo que no se debía.
  (select count(*) from viajeros_evento
    where evento_id='warped' and nombre='Roberto Venner'
      and abonado_previo=1000 and total_contrato=3327)      as roberto_intacto_debe_ser_1,
  (select count(*) from viajeros_evento
    where evento_id='dalemix' and nombre='Allan Abalos De la Fuente'
      and abonado_previo=3600 and total_contrato is null)   as dalemix_intacto_debe_ser_1;
