# Conecta Reynosa — Contexto Completo para Claude Code

> ## 🎯 EL RUMBO (30-ago-2026): KameHouse sólido, rápido y con flujo
>
> **El arranque del 1-sep YA NO manda.** Se retiró como vara de medir: dejó de
> ser la fecha contra la que se decide qué entra y qué no. Lo que manda ahora es
> que **KameHouse sea sólido, rápido y con flujo** — que aguante el uso diario y
> que dos personas puedan trabajar en él a la vez sin pisarse.
>
> Tres cosas que fija esta orden:
> - **El Excel sigue en paralelo**, con **careo diario** contra el sistema hasta
>   la paridad. No se apaga por decreto: se apaga cuando los números coincidan.
> - **Las sucursales quedan CONGELADAS** hasta nueva orden. La replicación a las
>   23 no es el objetivo de hoy; sigue siendo el destino, y por eso lo sencillo
>   se sigue prefiriendo — pero ya no se construye *para* ellas.
> - **La prioridad es el sistema, no la fecha.** Solidez, velocidad y flujo de
>   trabajo por encima de cualquier módulo nuevo.
>
> Y dos decisiones anteriores que **no se re-litigan** (siguen firmes):
> - **El cobro en línea va por Mercado Pago con 3D Secure obligatorio.**
>   Stripe está DESCARTADO (ver el bloque 💳 más abajo).
> - **melanie: las bases siguen en $0; la TARJETA volvió al index** como evento
>   pasado agotado (MEL-REGRESA-1, 28-ago). El sorteo NO vuelve.
>
> ⚰️ *Lo que decía este bloque antes —«todo se mide contra el 1-sep, lo que no
> sirva para esa fecha es ruido»— queda superado. Se deja dicho para que nadie
> lo reviva leyendo un commit viejo.*

## El Negocio
- Nombre: Conecta Reynosa (sucursal de la franquicia Conecta MX)
- CEO: Memo Cobos (hcgcobos@gmail.com)
- Modelo: Agencia de viajes a conciertos desde Reynosa, Tamaulipas
- Web: conectareynosa.mx (Netlify + GitHub: memocobos/conecta-mx)
- WhatsApp reservas: 528119771072
- WhatsApp vuelos: 528132321405

## Stack Técnico
- Frontend: HTML/CSS/JS puro en index.html
- Imágenes portadas: imgs.js (STATIC_IMGS)
- Mapas de venues: mapas.js (MAPAS)
- Lineups: lineups.js (LINEUPS)
- Deploy: GitHub → Netlify automático
- Ayuda contextual: ⚰️ **el FAB «?» y sus hints MURIERON** (medido en CARD-GUIA-1: el index borra sus llaves con el comentario «sistema de ayuda ya eliminado»). Lo que hay: el popup **«¿Cómo reservar tu lugar?»** una vez por evento, y **la guía por paso del cotizador** en `#d-placeholder` (CARD-GUIA-1). Sin chatbot.
- Analytics: Google Analytics G-7JKGFQQQ7W
- Dominio: conectareynosa.mx (GoDaddy → Netlify DNS)

## Reglas de Negocio — Paquetes
- PLUS: Todo incluido (transporte + hotel + boleto + kit)
- RIDE: Sin boleto — MTY $2,700 / CDMX $2,900
- STAY: Sin transporte — Solo en MTY = **PLUS − $500 FIJOS** 🔒 firmado por Memo
  el **25-ago-2026**. Es 500 SIEMPRE, en cualquier evento, **sin importar el
  separo**. La regla vieja era `PLUS − sep` y por eso Omar Courtz (sep 300)
  salía solo $300 abajo: se le cobraba de más. **El separo es cuánto adelantas,
  no cuánto te descuentan.** Vive con nombre (`STAY_DESCUENTO`) en los CUATRO
  runtimes: `index.html` · `_lib/precio-zona.js` · `portal.html` · `rol.html`.
  Tocar uno obliga a tocar los cuatro + el arnés de equivalencia.
- CHEAP: Solo boleto — **el separo lo decide Memo POR EVENTO (`sepCheap`), igual
  que en todos los paquetes.** La regla vieja del $1,000 fijo **murió el
  28-ago-2026** (REGLA-SEP-1). En código el $1,000 queda **solo como RESPALDO**
  para cuando un evento no trae `sepCheap`: la constante `SEPARO_CHEAP_DEFAULT`.
  **No se toca.**
  Está DECLARADA en **cuatro runtimes que no pueden importarse entre sí** —
  `index.html` · `kamehouse.js` · `rol.html` · `_lib/precio-zona.js` (que la
  exporta)—, las cuatro en `1000`, y el arnés las carea. La LEEN `index.html`,
  `rol.html` (en dos sitios) y `_lib/precio-zona.js`; `kamehouse.js` la declara
  como gemela con nombre pero **no la usa**, a propósito, para que el careo la
  vea. ⚠️ **`portal.html` NO la tiene**: solo la nombra en un comentario, como
  el patrón del que copió `STAY_DESCUENTO`.
  La forma es la misma en todos: `ev.sepCheap !== undefined ? ev.sepCheap :
  SEPARO_CHEAP_DEFAULT` — así un `sepCheap: 0` **sí vale cero** y no cae al
  respaldo.
- Eventos CDMX: NO tienen paquete STAY
- sep = costo del transporte
- Hotel costos son POR PERSONA (hotelPP:true)
- 15 días antes del evento: separo PLUS = 50% del total
- Autobús CDMX: $2,500 si faltan +15 días / Cotiza por WA si ≤15 días
- Vuelos: siempre cotizar al 81 3232 1405

## Reglas Hotel
- MTY: Compartida $0 / Doble $650pp / Triple $250pp / Individual $1,960
- CDMX: Compartida $0 / Doble $725pp / Triple $250pp / Individual $2,175
- Eventos 2 noches (Emblema, Warped): costos x2
- hotelPP:true = costos por persona
- hotelOverride:true = usar ev.hotel directo sin fallback global

## Estructura Eventos (array EV)
- id, a, f, ds, v, st, cdmx, sep, ride, zonas, cheapZonas, hotel, mapa, lineup, staticImg
- st: '' | 'ultimos' | 'agotado' | 'proceso' | 'pronto' | 'por-confirmar'
- rideOnly, cheapOnly, diaFirst, hotelPP, hotelOverride, waChannel, _past
- 🔒 **Esta lista NO es la fuente: la fuente es `CAMPOS_DEL_COMPILADOR` en
  `_lib/esferas-compile.js`.** Una lista de campos escrita a mano al lado de la
  de verdad envejece sola — ésta ya se había quedado corta. Si hace falta saber
  qué campos existen, se leen de ahí.
- 🔒 **El `index.html` sigue siendo la FUENTE COMPILADA** — lo que el sitio lee.
  Lo que cambió es quién lo escribe: desde ESF-CIERRE, **los 102 eventos se
  gobiernan desde Esferas** y el index se genera. Editarlo a mano sigue siendo
  posible y sigue siendo la salida de emergencia, pero ya no es el camino.

## Flujo Cliente Actual
1. Ve post en redes → contacta WhatsApp/Messenger
2. Recibe info (copy paste) → hace separo
3. Manda comprobante a Messenger → da datos
4. Recibe link grupo WhatsApp del evento

## Fase 2 — Portal Clientes (EN CONSTRUCCIÓN)
- Stack: Supabase (KH npgnhsmwpcipxgvfxrho + Portal muvvrstnkxsxfpkhbntq) + Netlify Functions + vanilla HTML/JS
- ~150 clientes activos mensuales
- Excel actual: 58 pestañas, 1 por evento

## Branding
- Colores: Negro #000000 / Blanco #ffffff / Azul #0000cd / Rojo #ff283b / Amarillo #e8ff4c / Verde #88ea4e
- Tipografías: Kaneda Gothic / Montserrat Bold / Montserrat Medium
- Manual: Manual_De_Marca.pdf en el repo

## Pendientes
_Última revisión: 17-ago-2026. El encendido ya ocurrió (ver abajo) y las
series FIN-1, AUD-1, MER-1, SAL-1, KMS, CAT-1/2/3 y las de agosto
(SEG-1/2, SES-1, WL-1) están en producción — 148 merges desde el 25-jul._

### ✅ El encendido YA OCURRIÓ (jul-ago 2026)
_Esta sección era una lista de pendientes en rojo. Se conserva como acta —
borrarla dejaría el libro sin explicar por qué el sistema pasó a mandar correo
de verdad—, pero **ya no manda a nadie a hacer nada**._

- **`CORREOS_MODO` está en `'real'` desde el 31-jul-2026 19:06 UTC** (leído del
  panel de Netlify el 17-ago, no recordado; contexto `all`, con scope
  `functions`). Todo el correo automático —cobranza, contratos, vendedores,
  posposiciones, lista de espera— **llega al cliente**. `_lib/correo-guard`
  sólo desvía si el valor es exactamente `'prueba'`, y **el modo real es el
  default absoluto**: olvidar la variable NO desvía nada.
  ⚠️ Corolario que sigue vivo: cualquier tuerca que mande correo **manda de
  verdad desde el primer merge**. No hay red debajo.
  Excepción a propósito, sin cambios: el vigilante de radio manda sus
  emergencias directo, sin pasar por `aplicarModoPrueba`.
- **Re-onboarding: hecho.** Medido en la base el 17-ago: **14 usuarios activos,
  0 inactivos**, los 14 con invitación usada y perfil completo; 13 se crearon en
  agosto y 12 entraron al Palacio en agosto. El camino que se siguió —reactivar
  en Guerreros Z → rol → contratos → firmas → activo— queda documentado por si
  entra alguien más.
- **Env vars de Netlify**: revisadas. El único interruptor que sigue en modo de
  pruebas es **`PAGOS_STRIPE_MODO='test'`** — y ya no va a salir de ahí: ver el
  cobro en línea, abajo.
- **Blast de arranque de contratos**: lo manda Memo, no un cron. Sigue siendo
  suyo, y sigue sin automatizarse a propósito.

### 💳 EL COBRO EN LÍNEA: Mercado Pago. Stripe está DESCARTADO

**Decisión de Memo, 19-ago-2026.** El cobro en línea de la plataforma va por
**Mercado Pago**, con **3D Secure OBLIGATORIO** — no opcional, no "si el emisor
lo pide": obligatorio, porque es lo que mueve la responsabilidad del contracargo
al banco emisor y en este negocio el contracargo se cobra de una caja que ya
está comprometida con proveedores.

**Stripe queda descartado.** La serie **C2** (#391-#405, 14 tuercas) construyó el
pago directo al solicitar sobre Stripe y **se queda como está, sin retomar**: no
se re-propone, no se "rescata" y no se migra pieza por pieza. Lo que sobrevive de
C2 es la forma —el cliente paga al solicitar, no después— no el proveedor.

**Lo que sigue vivo y hay que podar cuando toque la tuerca del cobro:**
`PAGOS_STRIPE_MODO='test'` y las llaves `sk_test`/`pk_test` en Netlify. **No se
podan antes**: mientras el módulo nuevo no exista, quitarlas solo deja huecos.
Se podan EN la tuerca que traiga Mercado Pago, no en una limpieza suelta.

**Corolario que cuesta caro olvidar:** cualquier diseño de cobro que aparezca de
aquí en adelante se dibuja contra Mercado Pago + 3DS. Un diseño que asuma Stripe
está caduco antes de escribirse.

### 🟡 Vivos

- 🏆💰 **EL PADRÓN POST-CORRECCIÓN, RE-MEDIDO CON CORRIDA (3-oct-2026).** PREVENTA-CORR-1
  **aplicada por Jane**, y los 8 conteos del candado de salida **los volví a correr yo**
  —no los di por buenos—: `los_27=27 · allan=1 · allan_pago_vivo=1 · delmi_abono=1 ·
  delmi_previo=1 · elvia_abono=1 · roberto_intacto=1 · dalemix_intacto=1`. Y la marca
  `PREVENTA-CORR-1` aparece en **30 viajeros** = 27 + Allan + Delmi + Elvia. Cuadra.

  **EL CENSO OFICIAL:**

  ```
  PADRÓN  ·  102 personas  ·  $74,952  ·  24 eventos
  ```

  🔒 **CON EL FILTRO COMPLETO, QUE ES LA MITAD DEL NÚMERO** (la ley ya escrita de la
  auditoría de los 141): `cobrado > contrato` **Y** `contrato > 0` **Y** no es baja
  (`boletos=0 ∧ zona NULL`). El control, re-corrido hoy, sigue diciendo lo mismo y por
  eso se conserva: **sin el `contrato > 0` salen 1,243 personas y $5,872,195**, porque
  **1,141 traen contrato en CERO o NULL** — y un contrato en cero no es un sobrepago, es
  un contrato **sin capturar**. El filtro infla o desinfla el problema 58 veces.

  ⚠️ **Y LAS 2 BAJAS QUE EL FILTRO EXCLUYE, NOMBRADAS para que no sean un hueco mudo**
  (suman **$6,550** que NO están en los $74,952): *Julian Abisay Hernández Rivera*
  (natanael, $1,850) y *Paula hernandez* (soyluna, $4,700).

  ✅ **De los 30 que toqué, CERO siguen sobrepagados.** Medido con la consulta, no
  supuesto. **Roberto Venner SÍ está dentro de los 102** ($973) y es correcto: su caso
  quedó aparte por orden de Memo y no se corrigió.

  🔴🔒 **LO QUE NO ATRIBUYO, Y ES LA PARTE IMPORTANTE DE ESTE RENGLÓN.** Contra el
  **114 · $141,522** del 2-oct la caída es de **−12 personas y −$66,570**. De eso,
  **mis correcciones explican 14 personas y $13,090** (los 11 del montón A, Allan $500,
  Delmi $4,600, Elvia $1,998). El resto —**$53,480**— **no lo autoricé ni lo escribí**, y
  decir que «bajó el padrón gracias a la corrección» sería colgarme una medalla ajena.
  Lo busqué: el careo del 3-oct solo tocó el `total_contrato` de **9** viajeros, así que
  tampoco lo explica. **Queda como pregunta abierta, no como logro.**

  🔒 **Y LA LEY QUE SALE DE AQUÍ: EL PADRÓN ES UNA FOTO, NO UN SALDO.** Dos fotos tomadas
  con un día de diferencia —con un careo diario corriendo y tres tuercas aplicadas en
  medio— **no atribuyen causa**. Y la cuenta lo delata al revés: si solo hubieran salido
  mis 14, serían 100, y son **102** → **2 personas ENTRARON** al padrón en ese día. Si se
  quiere atribución, es su propia medición.

  **Los 8 eventos que más traen hoy:** straykids#1 $13,200 (1) · tini $12,308 (6) ·
  neighbourhood $7,951 (10) · hilary $6,800 (2) · straykids#0 $6,303 (5) ·
  enjambre $4,954 (8) · edenmunoz $4,560 (2) · natanael $3,600 (1).

  ⏳ **Sigue en blanco:** los **19 saldos a favor REALES ($15,956)** — `anticipo` /
  `devolver a quien lo pida` / `otra`. Ésos son dinero que el cliente SÍ pagó y la
  pestaña lo confirma con su celda `Resta` en negativo, 19 de 19. **Están DENTRO de los
  102**, así que el padrón no baja a su número final hasta que se decidan.

- 💰⏳ **PREVENTA-CORR-1 · LA CORRECCIÓN DEL DATO, EN ESPERA DEL CAREO DE JANE (3-oct-2026).**
  El código ya está en prod ([PREVENTA-DESCUENTO-1](#), merge `b5b134b`). Esta acta
  —`migraciones/PREVENTA-CORR-1-datos.sql`— corrige el dato que quedó atrás.
  🔒 **CERO ESCRITURAS hasta el visto de Jane.** 33 `update`, repartidos así:

  | bloque | quién | qué |
  |---|---|---|
  | 1 | **27 personas** | `abonado_previo −= preventa` · **−$14,056** |
  | 2 | **Allan Abalos** · badgyal | previo $3,200 → 0 · baja por cancelación · contrato = $500 |
  | 3 | **Delmi Yaneth** · karolg#1 | anular los $5,000 de reflejo **y** previo $16,100 → $16,500 |
  | 4 | **Elvia Guadalupe** · karolg#0 | anular los $2,000 · con sus **$2 de residuo DICHOS** |

  🔒 **CADA `update` LLEVA SU VALOR ESPERADO EN EL `where`.** Si el careo movió el
  `abonado_previo` entre la medición y la corrida, la fila **no se escribe** — pero eso
  es silencioso, y por eso el acta trae un **candado de ENTRADA ejecutable** que lo hace
  ruidoso antes. Corrido contra la base viva: **29 renglones · 29 encontradas · previo
  COINCIDE 29 · se movió 0 · negativos 0 · problemas NINGUNO.**
  🔒 Y las 29 tripletas se **extraen del propio archivo**, no de la fuente que lo generó:
  un dedazo en el acta se caza ahí. Igual la lista del candado de SALIDA, que escribí a
  mano y **careé contra los `update` generados: 27 y 27, sin sobrantes ni faltantes.**

  🔴 **UN DEFECTO DE FORMA QUE HABRÍA PARTIDO LA MIGRACIÓN A MEDIA CORRIDA:** tres notas
  traían un **`;` dentro del texto de la cadena**. Postgres lo tolera, pero cualquier
  runner que parta las sentencias por `;` habría cortado el `update` justo antes de su
  `where` — o sea un `update` SIN `where` sobre `abonos_viajero`. Lo cazó mi propia sonda
  en seco al no encontrarle el `where` a una sentencia. Cambiados por `—`.

  **ALLAN ABALOS · el doble humo, confesado por su propia nota.** Palabra de Memo (3-oct):
  canceló y pagó $500 — manda el libro, cuya fila está **ROJA**. Verificado con cosecha
  fresca: 865 filas, `colores_leidos=true`, histograma `{0:798, 1:16, 20:48, 21:3}` →
  **51 filas rojas** con el umbral de 3, y la de Allan es una (`evento_libro «Bad Gyal»`,
  $500). Su «cobrado» de $3,700 era humo: su nota dice literalmente
  **«TOTAL-1: contrato $3200 (Costo al Público de Numerología)»** — el precio copiado
  como pago por la migración del 28-ago. ⚠️ **El ORDEN es parte de la corrección:** primero
  se limpia el humo y hasta el final se fija el contrato a lo cobrado; al revés, la baja
  quedaría con **$3,200 de saldo A FAVOR del cliente**.

  🔴🔒 **Y UN CONFLICTO QUE LEVANTÉ ANTES DE ESCRIBIR: la palabra de hoy choca con una
  regla firmada del 1-oct.** El código tiene, **antes** del `if (p.roja)`:
  `if (p.libro_rojo && pestanas.length) → AVISO, no baja`, con su razón escrita —
  *«la fila roja cancela esa compra, no a la persona»*. Allan está VIVO en la pestaña de
  badgyal con $3,200, así que por código sale como **aviso**, no como baja. Memo resolvió
  a favor de la baja **para este caso**, con el dato de la nota enfrente. ⏳ Queda
  nombrado: **la regla del 1-oct sigue viva para los demás** y nadie la cambió.

  ⚰️ **ERNERSTO HINOJOSA salió solo**: el libro de hoy trae 2 filas de $8,715 = $17,430 =
  su contrato = su cobrado. Deuda $0, nada que escribir.
  🔍 **Su nombre está mal escrito en la base: «Ernersto», con una r de más.** Una búsqueda
  por el nombre bueno lo pierde — apareció **barriendo por «Hinojosa»**, que es *buscar el
  hecho y no la palabra* otra vez.

  🔒 **LO QUE NO SE TOCA, dicho en el acta para que nadie lo busque:** la fila de
  **`dalemix`** de Allan (evento anterior a calle24, sello `CERO-HIST 20-sep`), y
  **Roberto Venner** (su sistema trae **$3,800** más que la pestaña y su libro **$25** más
  que su contrato: otra familia). El candado de salida **afirma que los dos quedaron
  INTACTOS** — proteger al que no entra es parte de la corrección.

  ⏳ **SIGUE EN BLANCO, y no frena nada:** el montón de **19 SALDOS A FAVOR REALES
  ($15,956)** — `anticipo` / `devolver a quien lo pida` / `otra`. Ésos son dinero que el
  cliente SÍ pagó: la pestaña lo confirma con su celda `Resta` en negativo, 19 de 19.

- 🔴🔒 **PREVENTA-DESCUENTO-1 · EL DESCUENTO QUE SE CONTABA COMO PAGO (3-oct-2026).**
  `mapa.dinero` de `_lib/excel-careo` incluía la columna **«Preventa»**, con esta razón
  escrita: *«en Pa'l Norte la preventa hace de separo»*. Barrido sobre **las 68 pestañas
  activas**, preguntándole a la celda `Abonado` de cada pestaña —que es lo que la hoja
  dice que RECIBIÓ el negocio— en las **28 filas** que traen Preventa con valor:

  ```
  PREVENTA ES DESCUENTO : 28/28       PREVENTA ES DINERO : 0/28
  pestañas con «Pa'l Norte» activas : NINGUNA
  y la cuenta cierra al peso: Total = Costo + Hab + Avión − Preventa
  ```

  🔒 **Es *dos caminos, una columna*:** la misma celda significaba dinero en un camino y
  descuento en otro, y la lista de dinero solo podía servir a uno. Hoy el dato dice que
  **no hay un solo caso del primero.**

  **El daño medido contra la base:** el negocio creía tener **$14,556 que nunca recibió**,
  y a **16 personas** les hacía ver la deuda **más chica de lo que es** (deuda de los 28:
  se veía **$15,821**, es **$30,377**).

  🔴 **Y UNA FRASE MÍA QUE ERA FALSA, CORREGIDA POR JANE.** Dije que la nota de las tres
  de karolg#1 *«escribió lo que la columna no hizo»*. **Falso:** la columna SÍ decía
  $7,450 el 2-oct (Jane lo verificó post-mudanza) y **el careo del 3-oct la deshizo** —
  la cola de la nota trae su sello, `Total de pestaña (careo 2026-10-03)`. No era una
  escritura que faltó: era **una corrección firmada que el careo DESHIZO.**

  🔒 **PERO SON DOS MECANISMOS, Y ESTA TUERCA SOLO ARREGLA UNO.** Medido en el código:
  - el **dinero** (`cobrado`) se inflaba por `mapa.dinero` + preventa → **esto se arregla aquí**;
  - el **precio** (`total_contrato`) lo re-escribe el montón `totales_contrato`, que lee
    **`mapa.total`, la celda «Total»** — y esta tuerca **NO la toca**.

  O sea que **sacar la preventa de `mapa.dinero` NO protege el contrato de las tres.** Lo
  que lo protege es que la celda `Total` de la pestaña diga **$7,450** (encargo que Memo
  ya le dio a Ximena). El careo lo AFIRMA en su bloque `[D]` para que nadie lo crea
  arreglado. ⏳ Y queda nombrado como tuerca propia: **el careo puede deshacer una
  corrección firmada y hoy nada se lo impide** — `totalesContrato` no tiene guarda.

  **EL TESTIGO, por orden de Memo:** «un testigo para el día que Pa'l Norte reviva con
  pestaña: ese día la regla se re-decide con datos, no revive sola». Vive en
  `parsearPestana` y viaja a la pantalla por el detalle de pestañas. 🔒 **Tres estados sin
  aplastar:** `descuento` · `dinero` (🔴 grita, con NOMBRES, y pide re-decidir) · `no se
  puede decir` (sin celda `Abonado`). Y **calla cuando todo es descuento**: un letrero
  permanente de «todo bien» se vuelve invisible a la semana. Pero **el hueco SÍ se pinta**:
  callarlo lo volvería un verde — la misma ley del cero falso.

  🔒 **El testigo AVISA, no decide:** el careo afirma que aun gritando, el abonado sigue
  SIN la preventa.

  **Careo:** `npm run mide:preventa-descuento-1` — **34 aserciones, en los dos sentidos**
  que pidió Memo: la preventa no suma (**BASE sumaba 5500 donde HEAD suma 5300, que es lo
  que la pestaña declara**) y el separo + los pagos **siguen** sumando, con el separo SIN
  NOMBRE —que vive por POSICIÓN— verificado aparte.

  🔒 **Y la medición que manda, contra el Excel real:** tras el arreglo, **el abonado
  coincide con el `Abonado` que la pestaña declara en 28 de 28.**

  🔒 **SEGURIDAD, medida antes de mergear:** con el código nuevo los 28 caen al montón
  `negativas`, que **«nunca se aplica, se NOMBRA»** — y `ejecutarPlan` tiene **CERO**
  referencias a `plan.negativas`. La corrección del dato sigue siendo un acto deliberado.

  🔴 **Tres arneses vecinos se cayeron, y era el instrumento, no el código:**
  `_excelTestigoPreventaHtml is not defined` en `cuadre-aplicar` (**dos** sitios) y
  `cuadre-numerologia`. Misma forma que EXCEL-AG-2: extraen funciones de UI **aisladas** y
  en el navegador viven juntas. **El tercer sitio lo encontré buscando EL HECHO
  (`new Function(`) y no la palabra** — parchar dos y reportar habría sido *arreglar un
  sitio sin barrer la familia* dentro del propio instrumento. Y va **la de verdad, no un
  doble**: un testigo falso daría verde con el aviso roto.

  ⏳ **ESPERANDO PALABRA DE MEMO (dos decisiones que llegaron en blanco):**
  1. las **tres de karolg#1** — `[$7,450 con $500 de saldo cada una / $6,950 a cero]`;
  2. el **montón de 19 saldos a favor ($15,956)** — `[anticipo / devolver a quien lo pida / otra]`.

  ⏳ **Y después del código:** vista previa de la corrección del dato (7 fantasma + 16 de
  deuda chica + el caso C aparte), con nombres y montos, **y el careo de Jane antes de
  aplicar.** El padrón se re-mide con corrida. **Roberto Venner** queda aparte: su sistema
  trae **$3,800** más que la pestaña, no $500 — no es este defecto.

- 🔴🔒 **AG-CERO-FALSO-1 · EL CERO QUE SALÍA POR CONSTRUCCIÓN (3-oct-2026).** Jane
  verificó la sección de EXCEL-AG-2 en navegador contra producción, **por el botón**, y
  la pantalla se pintaba **con un CERO FALSO**: «ZONAS A CERRAR · 0 — ninguna», sin
  botón, con la palomita prendida y el Excel proponiendo cerrar «Perfil».

  **LA CAUSA, leída en el camino real.** `admin-excel-aplicar` arma la vista previa con
  `planear(careo, { solo:null, claves:null })`, y mi opt-in de seguridad
  (`o.disponibilidad === true || solo === 'disponibilidad'`) dejaba la disponibilidad
  **sin calcular**. O sea que **el 0 no salía del Excel: salía por construcción.** Mi
  propio bloque `[SEG]` lo demostraba desde el día que lo escribí — `{}` → `ag_cerrar 0`.

  🔒 **EL ARREGLO DE SEGURIDAD ESTABA BIEN PARA APLICAR Y MAL PARA ENSEÑAR.** Palabra de
  Jane, y es la ley: **enseñar no es aplicar — calcular los montones para la pantalla no
  escribe nada.** Así que ahora son DOS CAMPOS, y la separación es **estructural, no una
  convención de llamada**:

  | campo | quién lo usa | cuándo se llena |
  |---|---|---|
  | `ag_propuesta` | **la pantalla**, para enseñar | SIEMPRE que el bloque se pudo leer |
  | `ag_cerrar` / `ag_abrir` | **`ejecutarPlan`**, para escribir | solo con opt-in explícito, acotado por `claves` |

  El clic global sigue sin poder escribir en la ficha —el hueco que cazó Jane el 2-oct— y
  la vista previa ya enseña. `ag_propuesta` va **sin** el filtro de `claves` a propósito:
  es la foto completa de lo que el Excel propone, y la vista previa es donde se ve entera.

  🔒 **Y UN HUECO NO SE DICE «0 · NINGUNA».** Si `ag_propuesta` viene en `null`, la
  sección dice **que no se calculó**, con su razón. «Ninguna» es una **afirmación sobre
  el Excel**, y en ese caso no se midió nada. `null` y `{cerrar:[],abrir:[]}` no se
  aplastan: *un cero es una afirmación*, y **un cero falso es justo lo que los cuatro
  estados existían para impedir** — y aun así se colaba por este campo.

  🔴 **MI COMENTARIO PROMETÍA LO QUE EL CÓDIGO NO HACÍA.** En `_excelAgHtml` estaba
  escrito «si el estado es `no_pedido` hay propuesta pero ESTA petición no la pidió: **se
  enseña igual (para eso es la vista previa)**» — y el código pintaba de `ag_cerrar`, que
  en toda vista previa viene vacío. Es *un candado prometido en un comentario*, otra vez.

  🔴 **Y LA MITAD DEL MÉTODO: MI «VERIFICACIÓN EN NAVEGADOR» RENDERIZÓ CON DATOS A MANO.**
  Por eso el hueco pasó: medí **la promesa del comentario**, no el camino. La corrección
  de Jane es ley y ya vive en el careo: **el careo de la pantalla entra por el botón real**
  (Comparar → Aplicar el careo…), con el handler de verdad, y la respuesta se le da a la
  pantalla de verdad.

  **Careo:** `npm run mide:excel-ag-pantalla` — **60 aserciones**, con la sección `[F]`
  nueva que recorre **handler real → vista previa → pantalla → segundo clic → ficha**:
  - 🔒 **control positivo:** el MISMO camino en `9e166d3` **reproduce el cero falso de
    Jane** (`ag_cerrar=0`, 0 botones, «— ninguna»);
  - la vista previa **no escribe nada** (0 escrituras) y trae `ag_cerrar` **vacío**;
  - la pantalla enseña «Perfil · pedido 2 · restan 0» y **un** botón con
    `{solo:'disponibilidad', claves:['Perfil']}`;
  - 🔒 el **clic global con `confirmar`** sigue sin meter `ag` al plan y sin tocar la ficha;
  - **la otra mitad de la puerta:** el segundo clic —con el alcance **sacado del botón que
    la pantalla pintó**— escribe UN PATCH, cierra solo «Perfil», deja «Oro» byte a byte,
    y el resultado pide `requiere_publicar`.

  🔴 **Tres rojos del arnés fueron MÍOS, y los tres valen de lección:** (1) limpiaba la
  caché de `require` **después** de parchar al guardia, así que me borraba el parche — *el
  orden es parte del arreglo*; (2) el fixture de la ficha copió el literal del index
  (`n:'Pista'`, comillas simples) cuando **la columna de `esferas_eventos` habla JSON
  estricto** (`"n":"Perfil"`, y el escritor pone `"ag":1`) — **las dos formas existen de
  verdad y no son la misma**; (3) afirmé `requiere_publicar` **en el cuerpo del PATCH**
  cuando vive en el **resultado** que lee la pantalla.

  ⏳ **PENDIENTE DE JANE:** la verificación en navegador contra producción, con captura,
  por el botón — y después el cierre de «Perfil» que aplica Memo.

- 🔴🔒 **COSECHA-REDIRECT-1 · EL POST QUE VOLVÍA GET (3-oct-2026).** Jane intentó
  verificar la sección de EXCEL-AG-2 en navegador contra producción y **la cosecha por
  evento de trueno nunca llegó a contestar**: tres corridas del botón «Comparar con
  Excel» dieron **504 · 504 · y a la tercera el cuerpo del `doGet` del `.gs`** —
  «Este script solo contesta por POST y con token · [SIN_TOKEN]». La pantalla no
  alcanzó a pintarse, así que **la verificación de la pantalla sigue sin el visto de Jane**.

  **LO MEDIDO, no supuesto.** 21 cosechas contra producción (catálogo · trueno ×6 ·
  una tanda de 10 en paralelo, que es la condición que midió CAREO-RETRY-1): **las 21
  salieron OK** y la cadena real es **SIEMPRE**

  ```
  POST  script.google.com/macros/s/<id>/exec       → 302
  GET   script.googleusercontent.com/macros/echo   → 200
  ```

  O sea: **el despliegue NO se movió y el token sirve.** Lo que falló fue la
  redirección, a esa hora, del lado de Google — y la prueba la dio la segunda ronda de
  medición, ya con el lib nuevo: **8/8 buenas pero con dos cosechas en 5,769 y 5,912 ms**
  cuando en la primera ronda el techo era 2,264 ms. **Google está lento HOY**, y el
  careo de un evento vive dentro de los 10 s de Netlify.

  🔒 **ESE CAMBIO DE MÉTODO ES DEL ESTÁNDAR, NO UN DEFECTO.** Un 301/302/303 sobre un
  POST se sigue con **GET y sin cuerpo**; el `echo` sirve el resultado que el POST ya
  ejecutó. La mordida es otra: **si el `Location` apunta OTRA VEZ al `/exec`, ese GET ya
  no recoge nada — EJECUTA `doGet`**, que contesta SIN_TOKEN.

  🔒 **Y DE AHÍ SALE EL HECHO QUE MANDA: `SIN_TOKEN` NO ES UNA FALLA DE CONFIGURACIÓN,
  ES UN ACCIDENTE DE RED.** Medido sobre los tres caminos de `cosechar`: todos mandan
  token, sin env var sale `SIN_CONFIG` **y ni se le pega**, y un token equivocado sale
  `TOKEN_INVALIDO`. No hay un camino nuestro que produzca `SIN_TOKEN`.

  **LA DIFERENCIA ENTRE LOS DOS CAMINOS, que es lo que Jane pidió nombrar:** el careo
  **global** tiene escalera de reintentos (`khExcelRecorrer`, CAREO-RETRY-1) y el
  **por-evento** (`excelCarear`) **no tenía ninguna** — un solo fetch, sin reloj. El
  mismo mal rato de Google se ve verde en uno y rojo en el otro.

  **LO QUE ENTRA, en el ÚNICO dueño que comparten los dos caminos (`_lib/cosecha-excel`):**
  1. **La cadena se camina a mano** para no degradar el método donde importa: al `echo`
     con GET (es lo correcto y es lo medido), y **si el destino es la MISMA puerta, se
     vuelve a POSTEAR con el cuerpo**. Nunca se le hace GET a lo que ejecuta `doGet`.
  2. **Un reloj**, porque la otra cara del mismo mal rato es el 504: el fetch no tenía
     ninguno, así que un Google colgado se comía los 10 s enteros de Netlify y el admin
     recibía **un 504 pelón, sin una palabra de qué pasó**.
  3. **UN reintento** para las tres caras transitorias (`SIN_TOKEN`, `NO_ES_JSON`,
     `SIN_RESPUESTA`), con presupuesto. 🔒 Reintentar es seguro **y no es suposición**:
     `doPost` del `.gs` **solo LEE** (`getValues`/`getBackgrounds`), no tiene una sola
     escritura. Dos cosechas son dos fotos, nunca dos efectos.

  🔴 **`SIN_TOKEN` FALTABA EN `_KH_CAREO_TRANSITORIOS`, Y ERA UNO DE LOS DOS CÓDIGOS
  MEDIDOS.** El acta de CAREO-RETRY-1 dice, del 28-sep, «29 cosechas contestaron una
  PÁGINA **o SOLO POST**» — y «solo POST» **ES** el SIN_TOKEN del `doGet`. La lista se
  escribió al lado de esa prosa y se quedó con uno de los dos. Así que el código que más
  se repitió en aquel incidente era justo **el único que no se reintentaba**. Es
  *la lista a mano al lado de la realidad*, y esta vez la lista estaba al lado de **mi
  propia acta**.

  🔴 **Y UNA REGRESIÓN MÍA, CAZADA EN VIVO Y DOS VECES.** El reloj nació partido en
  rebanadas fijas de 4.5 s por intento («el doble de la peor cosecha medida»). La
  **primera** corrida del lib nuevo contra el Google real lo tumbó: el arranque en frío
  pasó de 4.5 s, el intento 1 abortó, al reintento le quedaron 2,690 ms y abortó
  también — **7,506 ms para fallar algo que sin reloj habría contestado bien**. Un
  candado que convierte una llamada **lenta-pero-buena** en un fallo es peor que el 504
  que vino a curar. Curado: **el reloj de un intento es el presupuesto que QUEDA**, el
  reparto es asimétrico a propósito (el primer intento se lleva todo; solo hay reintento
  si el fallo dejó tiempo, que es justo la forma del transitorio). La segunda ronda en
  vivo lo confirmó: **8/8 con dos cosechas de 5.8–5.9 s que la rebanada habría matado.**

  **Careo:** `npm run mide:cosecha-redirect-1` — **59 aserciones**, con control positivo
  en cada sección: **BASE falla con el código Y el mensaje exactos que Jane vio en
  pantalla**, BASE se cuelga sin tope, BASE no reintenta, y BASE no traía `SIN_TOKEN` en
  la lista. Incluye el control de **mi** regresión (una cosecha de 5 s tiene que salir
  bien) y el candado de que **la lista del navegador CONTIENE la del servidor** — si no,
  el servidor daría por recuperable un código que muere en el botón.

  🔴 **El rojo del arnés era mío, otra vez:** mi Google falso no seguía los redirects, así
  que BASE moría de «no es JSON» en vez de su defecto — **el control positivo medía mi
  doble**. El falso ahora obedece `init.redirect` como el fetch de verdad.

  ⏳ **PENDIENTE DE JANE:** la verificación de la sección de EXCEL-AG-2 **en navegador
  contra producción, con captura**, por el botón, ya con esto desplegado — y después el
  cierre de «Perfil» que aplica Memo.

- 🔎 **EXCEL-AG-1 · FASE 1 (SOLO LECTURA) ENTREGADA (2-oct-2026).** La pregunta era
  si el cosechador sirve el bloque «Disponibilidad» (Pedido/Restan). **Sí: 71 de 71
  filas activas**, cero sin bloque, cero errores de cosecha. **Ninguna palomita
  prendida** — el reporte lo ve Memo antes de que se prenda alguna.

  🔴 **EL «123» NO EXISTÍÓ: ERA UNA CIFRA HEREDADA, Y LA SOLTÉ YO.** Lo rastreó
  Jane: nació en **mi propio mensaje del 1-oct** y de ahí lo repetimos todos — yo
  incluido, varias veces— sin que nadie la midiera. Medido: `excel_pestanas` tiene
  **115 filas · 71 activas · 44 inactivas · 112 pestañas distintas**. **El universo del
  barrido son las 71 activas.** Queda escrito con su origen para que nadie vaya a
  buscar las 52 que faltan. Hermana de *la lista a mano al lado de la realidad*, con
  cara nueva: **una cifra que yo inventé y que volvió como dato de encargo.**

  🔴🔒 **EL CONTROL POSITIVO ESTRUCTURAL, Y ES LA LEY DEL ANCLA CON CARA NUEVA: EL
  LITERAL TAMPOCO ES ANCLA SI HAY DOS IGUALES EN LA MISMA FILA.** Medido en arjona:
  `Pedido` aparece **DOS veces en la fila 0** — col 3 (boletos) y **col 9, que es el
  `Pedido` de TALLAS** (XS 1 · S 10 · M 19 · L 12 · XL 0 · XXL 4). O sea que ni
  «la columna llamada Pedido» sirve: **el ancla es su POSICIÓN RELATIVA a
  «Disponibilidad»**. Leer la otra columna convertiría **camisetas en lugares**.
  ✅ Aprobado por Jane así.

  🔒 **Y EL BLOQUE SÍ CAMBIA DE SITIO**: 70 pestañas lo traen en `col 1` y **una en
  `col 2`**. Anclar por índice fijo habría leído mal esa — la lección de CUADRE-6
  («Avón - Bus» en la 19 y en la 20), cobrada otra vez.

  **LA CLASIFICACIÓN, 438 zonas en las 71 filas activas:**

      Restan > 0  (vendiendo)          143
      Restan = 0  (el Excel la AGOTA)  255
      Restan < 0  (SOBREVENDIDA)        40   ← la regla NO nombra este estado
      Pedido = 0  (no pedí)            192
      Pedido vacío (sin capturar)         0

  ⚠️ **DOS UNIVERSOS, Y NO SON EL MISMO NÚMERO** (la ley de ZONA-NORM-1): sobre las
  **438** zonas del Excel hay **295** con `Restan ≤ 0`; sobre las **262 que SÍ existen
  en la ficha**, son **142**. Las dos cuentas son correctas — lo que no se puede es
  reportar una como si contestara la otra.

  🔴 **LOS CHOQUES, que son el motivo de la tuerca** (sobre las 262 gobernables):
  **46 «EXCEL agota · index VENDE»** (se vende lo que no hay) y **13 «EXCEL tiene ·
  index AGOTADA»** (no se vende lo que sí hay). Y los 46 se parten **exactamente por
  la regla de Memo**, medido sin sembrar nada:
  - **(a) 21 zonas** con `Pedido 0` y `Restan < 0` — *«no pedí y vendo igual»*: es
    **el caso de arjona (4) y juniorh (2)** que Memo nombró, **y salieron solos en la
    lista**, con titodoble (5) a la cabeza. 🔴 Si la palomita se prende sin distinguir
    este caso, **le apaga la venta a lo que SÍ está vendiendo.**
  - **(b) 25 zonas** con `Pedido > 0` y `Restan ≤ 0` — *«pedí N y se acabaron»*: el que
    la regla SÍ quiere cerrar.

  ⚠️ **176 DE LAS 438 ZONAS DEL EXCEL NO EXISTEN EN LA FICHA (40%)** y por lo tanto
  **no se pueden gobernar**: karolcdmx#1 (12), y con 7 cada uno dimitri, flowfest#0,
  intocable, ironmaiden, juniorh, karolg#2, romeo, sleeping, warped.

  🔴 **Y UNA CORRECCIÓN A MI PROPIO REPORTE: dije «una pestaña = una fecha» y para
  coronacapital es FALSO** — UNA pestaña sirve a **CUATRO** evento-fecha. El mecanismo
  que las parte es **`excel_pestanas.regla_zona`**, que es el **TERCER argumento de
  `parsearPestana`** y yo estaba pasando en `null`. Por eso mi primer barrido fueron
  68 y no 71.
  - ✅ **Pero mi preocupación estructural NO se sostuvo, y eso también se mide:** creí
    que la palomita por evento-fecha no podría mapear a un bloque compartido, y
    **sí mapea** — cada `regla_zona` casa con **exactamente 1 zona**:
    `#0 General Viernes` (ped 19, restan 8) · `#1 General Sabado` (19, **−3**) ·
    `#2 General Domingo` (19, 15) · `#5 General` (17, **0**). Sin ambigüedad.

  ⏳ **TRES PREGUNTAS QUE LA REGLA FIRMADA NO CUBRE, entregadas con la fase 1 y sin
  contestar por mí:**
  1. **`Restan` NEGATIVO existe: 40 zonas.** La regla dice *«cuando Restan llega a 0,
     esa zona se agota y listo»* — pero **−7 no es 0**. ¿Agota igual, o es
     «sobrevendida» y necesita su propio aviso? (arjona trae un −7; titodoble un −9.)
  2. **Las 176 no gobernables**: hasta que esas zonas existan en la ficha, la palomita
     no puede abrirlas ni cerrarlas.
  3. **El caso (a)**: hace falta una marca por evento-fecha de *«vendo sin pedido»*,
     o la palomita de arjona apaga 4 zonas vivas.

- 🏆🔴 **LA AUDITORÍA DE LOS 141, APLICADA: CORR-DOBLE-1 y CORR-CONTRATO-1
  CERRADAS CON VISTO DE JANE (2-oct-2026).** Padrón: **141 → 114 personas**, el «de
  más» **$214,233 → $141,522**. Cada tuerca con vista previa primero, cero escrituras
  sin palabra de Memo, y Jane re-midiendo contra la base antes del visto.

  **CORR-DOBLE-1 · 34 personas · −$71,286 exactos.** La forma la firmó Memo:
  **ANULAR** el abono duplicado (monto a $0) con el motivo y su monto **ANEXADOS** a
  la nota. La fila no se borra: su fecha, su nota original y lo que tenía quedan
  escritos. Ejemplo real: *«Careo Excel Karol G - 6 de noviembre 2026-09-20 · ANULADO
  2-oct-2026: duplicado de CUADRE-FUENTE-1, este abono de $2,000 era reflejo de la
  pestaña; el pago completo vive en el libro ($11,000)»*.
  - 🔴 **EL ALTER QUE NO ESPERABA: el CHECK era `monto > 0`, así que el $0 TAMBIÉN
    estaba prohibido**, no solo el negativo. La forma aprobada no se podía ejecutar.
    Acta en `migraciones/CORR-DOBLE-1-ALTER.sql`, corrida y verificada por Jane:
    `monto >= 0` — **el cero pasa y el negativo sigue dando 23514**.
  - 🔒 **SE ABRIÓ AL CERO Y NO AL NEGATIVO, Y LA RAZÓN ES EL CLIENTE:**
    `portal-mi-plan-migrado` **LISTA** los abonos en su pantalla (`{monto, fecha}`) y
    **NO manda la nota**. Con un contra-asiento negativo, 34 clientes verían
    «−$2,000» sin una palabra que lo explique.
  - 🔒 **Y LA MEDICIÓN QUE ELIGIÓ LA FORMA: el duplicado NO vive en
    `abonado_previo`.** En **33 de 34** el monto a retirar es EXACTAMENTE la suma de
    los abonos de esa persona, y en el 34º (Demian) es UNA fila identificable de
    $2,000 del 20-sep. No hubo que inventar una transacción: ya existía la que sobraba.
  - ⏸️ **CINCO RETENIDOS, y el freno es el hallazgo**: Allan Abalos, Delmi Yaneth,
    Roberto Venner, Ernersto Hinojosa y Elvia Guadalupe quedarían **DEBIENDO** si se
    aplicara la regla, porque **el libro trae MENOS que su propio contrato**. La
    premisa —«Numerología lleva los pagos COMPLETOS»— **no se cumple en los cinco**.
    Es *aplicar una conclusión fuera del dominio de su premisa*, lo mismo que la
    opción B ya corrigió una vez con los PLUS. Su arreglo es **completar Numerología**
    (le faltan **$3,143** en total), no tocar la base: la lista con nombres y montos
    se le pasó a Ximena. Cuando el libro esté completo, se re-corre y entran solos.

  **CORR-CONTRATO-1 · 19 personas · Δ +$57,020** (los 18 por pestaña **+$50,020**, más
  Arian **+$7,000**). Mueve el **CONTRATO** y jamás el abonado — el abonado es lo que
  la persona PAGÓ y moverlo falsearía un hecho. Resultado: **0 debiendo**, 16 en saldo
  cero, y **3 con saldo a favor dichos con su monto** (Veronica $100 · Jose Luis
  galindo $219 · Ashley Rubi $6).
  - 🔴 **UN NÚMERO MÍO, MAL, CORREGIDO ANTES DE QUE SE CAREARA: dije «+$43,906» y
    era $50,020.** Lo dije como «aprox», me lo devolvieron como cifra exacta y lo
    cacé al imprimir el candado de salida. Es la ley de siempre: **los números del
    reporte los imprime la medición, no yo.**
  - 🔒 **RE-MEDIR CONTRA LA BASE DE AHORA NO FUE CEREMONIA: la vista previa vieja
    YA ERA UN FIXTURE GRABADO.** CORR-DOBLE-1 había movido el cobrado de 7 personas y
    Ximena estuvo editando pestañas — la cosecha de hoy cambió **dos** totales
    (Veronica $15,900→$15,800 · Jose Luis galindo $11,700→$11,481). Con los viejos,
    esos dos habrían quedado con otro saldo.
  - 🔴 **Y MI CLASIFICACIÓN ERA DEMASIADO GENEROSA:** de los 50 que llamé «contrato
    corto», la pestaña dice que **solo 21 lo son**. **26 tienen el contrato YA igual al
    total de la pestaña** — su excedente es otra cosa— y 3 no traen total. Mi regla
    miró «el cobrado casa con la pestaña y supera al contrato» y **nunca preguntó si
    el contrato ya era el de la pestaña**. Los 26 se re-trían como montón propio.
  - ⚠️ **ARIAN ENTRÓ POR UN CAMINO PROPIO Y ESO QUEDA EN SU NOTA**: su total salió del
    **`costo_publico` del LIBRO** (2 filas × $4,000, una por boleto) porque el total de
    su pestaña dice $2,000 = **los dos separos**, que es REFLEJO y no precio. **Memo lo
    autorizó PARA ESE CASO y dejó dicho que NO es regla nueva**: si alguna vez se
    quiere «total de pestaña = solo separos → manda el libro», se mide primero cuántos
    casos existen y se trae como tuerca propia con su careo. 🔒 **Las reglas de dinero
    no nacen dentro de una corrección** — y la advertencia vive DENTRO de la nota de
    Arian, no solo en el chat, para que nadie la lea como precedente.

  ✅ **MUDANZA-KAROLG-1 (2-oct): tres viajeras del 6-nov al 7-nov, sin tocar su dinero.**
  No era cancelación —siguen viajando— así que la regla de «saldo 0 del cancelado» NO
  aplicó. Se **movió la fila** (`evento_id`), los **6 abonos viajaron solos** (llavean
  por `viajero_id`), y el contrato subió a **$7,450** por el camino A.
  - 🔒 **CUATRO FUENTES INDEPENDIENTES dijeron $7,450**: el plan de `/rol` de Emery
    del 16-may (**$1,000 + 10×$645, `cuadra: true`**), las dos pestañas, y el desglose
    pago por pago del Excel (**Separo 500 + Preventa 500 + 620 + 645×8 + 670**). La
    única que decía $6,950 era el contrato — y su propia nota lo confesaba:
    *«TOTAL-1: contrato derivado del catálogo (se afina contra la pestaña)»*. Se derivó
    y **nunca se afinó**. Quedó **$25 por cabeza** de saldo real.
  - 🔴 **EL RIESGO QUE TENÍA RELOJ**: las tres estaban en LAS DOS pestañas con el
    mismo $7,450. Si el careo del 7 corría antes, les daba ALTA en `#1` con su fila de
    `#0` viva: **$22,350 de dinero fantasma entre eventos**. Cerrado.
  - ⚠️ **Y UNA INFERENCIA INVÁLIDA QUE CASI REPITO**: iba a usar `updated_at` de
    `stock_ajustes` para decir que el `«-»=3` era anterior a la mudanza — y el careo
    **nunca mueve esa columna** (yo mismo corregí eso en CHATARRA-SELLO-1). Se midió
    por el dato: las tres caen en `personas`, no en chatarra, y `esChatarra()` dice
    **false** para los tres nombres. **El `«-»=3` no son ellas.**
  - 🔴⏳ **TUERCA PROPIA NOMBRADA, sin tocar: la chatarra cambió de ZONA.** La base
    guarda `karolg#0 «-»=3` y la pestaña produce hoy `«Poniente Baja»=3`. El próximo
    careo escribiría la nueva y dejaría la vieja **huérfana** → 3 boletos contados dos
    veces. Familia de CHATARRA-RESIDUO-1.
  - ⚠️ **Los 7 recordatorios viven en la llave PADRE `karolg`** (pre-multifecha): mi
    «cero» era cierto para `#0`/`#1` y ciego para el padre. **Un barrido por las llaves
    hijas no ve lo que vive en el padre** — ROL-HIST-PADRE en otra tabla.

- 🏆🔴 **LA AUDITORÍA DE LOS 141 SOBREPAGADOS: CERRADA (2-oct-2026).** Era el
  punto 3 de CUADRE-FUENTE-1 y llevaba días **bloqueada por llaves**; Memo pasó
  `NUMEROLOGIA_SCRIPT_URL` y `NUMEROLOGIA_SCRIPT_TOKEN` y se pudo hacer como la orden
  exigía: **reconstruyendo la fuente desde la COSECHA REAL**, no desde la nota ni desde
  inferencias de la base. **Cero escrituras.**

  🔒 **LA POBLACIóN SE REPRODUJO AL PESO ANTES DE CLASIFICAR NADA: 141 personas ·
  $214,233 · 28 eventos**, exacto contra lo que reportaba CUADRE-FUENTE-1. Y el camino
  para volver a sacarla queda dicho, porque **el filtro es la mitad del número**:
  `cobrado > contrato` **Y `contrato > 0`** **Y no es baja** (`boletos=0 ∧ zona NULL`).
  ⚠️ Sin el `contrato > 0` salen **1,282 personas y $6,007,926** — porque **1,140
  tienen contrato en CERO**, y un contrato en cero no es un sobrepago: es un contrato
  **sin capturar**. Esa es la ley de *un cero es una afirmación* aplicada al revés, y
  confundirlas infla el problema 28 veces.

  **LA CLASIFICACIÓN (suma exacta a los $214,233 — candado de cardinalidad):**

      DOBLE_CONTEO      39 personas   $122,536   57% del dinero
      CONTRATO_CORTO    50 personas   $ 88,518
      REDONDEO          48 personas   $  1,644   promedio $34
      SIN_EXPLICAR       4 personas   $  1,535   nombradas, no adivinadas
      ─────────────────────────────────────────
      TOTAL            141 personas   $214,233

  Presencia en las fuentes: **libro 51 · pestaña 138 · LAS DOS 48 · NINGUNA 0.**
  - **DOBLE CONTEO — 38 CHEAP + 1 PLUS, en 13 eventos** (arjona, badgyal, enjambre,
    karolg#0, karolg#1, louist, morat#0, morat#1, neighbourhood, straykids#0,
    straykids#1, tini, warped). Es **exactamente** lo que Memo describió: el libro trae
    el dinero y encima se sumó el de la pestaña, que es **reflejo**. El único PLUS es
    la cara de la opción B — ahí manda la pestaña y la fila del libro es anomalía.
  - **CONTRATO CORTO**: el dinero casa con UNA fuente y el contrato va materialmente
    abajo. El caso extremo son contratos que traen **solo el separo** ($1,000) contra
    cobros de $8,000-$14,000.
  - **REDONDEO**: 48 personas por $1,644 **en total**. No es deuda de nadie y no se
    persigue.

  🔴🔒 **DOS DEFECTOS MÍOS QUE CAZÓ EL CANDADO DEL INSTRUMENTO, y el primero habría
  invertido el reporte entero:**
  1. **`en la pestaña: 0` de 141.** Le pasé a `parsearPestana` el **mapa de columnas**
     de `mapearColumnas` cuando espera un objeto con **`.fila`** (el ÍNDICE de la fila
     del encabezado): `filas[undefined]` daba cabecera vacía, todos los índices en
     −1 y **CERO personas en las 28 pestañas**. Con ese brazo muerto el reporte decía
     **DOBLE_CONTEO = 0** y mandaba 82 personas a «sin explicar». **El encabezado lo
     DA la cosecha (`r.encabezado`), como hace el runner real** — el hecho viene del
     lado que yo no controlo. Hoy el careo **se detiene** si alguna pestaña parsea en
     vacío: *antes de creerle una AUSENCIA a un instrumento, que conteste algo que sí
     existe*.
  2. **Mi regla de doble conteo era demasiado estrecha**: exigía que el libro fuera
     ≈ el contrato **o** que la pestaña fuera ≈ el separo, y así dejó **SIETE** casos
     en «sin explicar» cuyo `cobrado` era **`libro + pestaña` exacto al peso**. La
     esencia del doble conteo es **LA SUMA**; que el monto sea el separo es
     descripción, no prueba. Generalizada: 33 → **39** personas, $107,548 → $122,536.
  - ⚠️ Y un tercer error de orden, menos grave pero que habría dado un montón
    inservible: mi primera versión mandaba a CONTRATO_CORTO diferencias de **$2**.
    Cierto de letra, falso de uso. **El orden de las reglas es parte de la
    clasificación**: doble conteo primero (es estructural a cualquier monto), redondeo
    después, contrato corto solo cuando es material.

  ⚠️ **LOS 4 SIN EXPLICAR, nombrados y NO adivinados:** **Rock 9** (la agencia — su
  estado es el esperado y *se deja en paz*, Memo ya lo explicó varias veces) y **tres
  personas de karolg#0 con los MISMOS números** (pestaña $7,450 · total $6,950 ·
  cobrado $7,425: $25 de diferencia). Al ser idénticos los tres, es **un patrón de
  captura, no tres errores independientes**.

  🔒 **EL DETALLE CON NOMBRES NO SE VERSIONA, Y ES A PROPÓSITO.** El reporte por
  persona son datos financieros de 141 clientes y **este repo se publica en
  conectareynosa.mx**: lo versionado queda descargable. El acta lleva **agregados y
  método**; la lista nominal se entregó en el reporte y vive fuera del repo. Es la
  misma ley del `git add -A`, aplicada a un entregable en vez de a un descuido.

  ⏳ **LO QUE SIGUE PENDIENTE Y NO LO DECIDO YO:** qué se hace con cada montón. El
  doble conteo **no se corrige restando** a ciegas —*jamás se resta dinero*— y el
  contrato corto se arregla moviendo el **contrato**, no el abonado. Son escrituras al
  dinero de gente y piden palabra de Memo montón por montón.

  🔴⏳ **Y UNA PREGUNTA QUE ESTAS LLAVES VUELVEN URGENTE, dicha sin afirmarla:
  ¿están `NUMEROLOGIA_SCRIPT_URL` y `NUMEROLOGIA_SCRIPT_TOKEN` en NETLIFY?** Hoy solo
  las tengo en mi `.env` local. `_lib/cosecha-excel` las lee de `process.env`, así que
  **si no están arriba, el careo diario nunca ha leído el libro** y la regla que Memo
  firmó en CUADRE-FUENTE-1 —«el libro manda el dinero del CHEAP»— estaría **inerte en
  producción**: la hermana exacta de *la guarda inalcanzable*. **No pude medirlo** (el
  lector de Netlify que tengo no devuelve variables de entorno) y **no lo adivino**; se
  comprueba en el panel. Si faltan, se ponen con esos dos nombres exactos.

- 🏆 **ZONA-EXCEL-MANDA-1 COMPLETA — FASE 1 Y 2 EN PROD (2-oct-2026, merge 4d90a24): la FICHA
  obedece la ortografía del Excel.** Regla firmada de Memo, citada: *«NO cambio el
  Excel: tú cámbialo en el index. Si dice 1er Nivel regútalo a Primer Nivel
  (arjona), y así con todos.»* Y la precisión de Jane: **la firma es de LA CLASE**
  —toda zona cuya ficha difiera de cómo la escribe el Excel—, no de los cuatro
  nombres que traía mi lista. `npm run mide:zona-excel-manda-1` (**66**), acta en
  `migraciones/ZONA-EXCEL-MANDA-1.sql`. **6 renombres de ficha · 20 sitios de JSON
  · 7 pares (pestaña,zona)**, más uno ya aplicado.

  🔒 **EL LOTE NO SALIÓ DE UNA LISTA: SALIÓ DE CAREAR LA FICHA CONTRA LA COSECHA.**
  Se cosecharon las **4 pestañas reales** (fuente `pestanas`, columna «Boleto» por su
  LITERAL en la fila 10, jamás por índice) y el lote se DERIVÓ de lo que el Excel
  escribe. Es la única forma que sobrevive: mi lista escrita a mano se quedó corta
  **dos veces en el mismo encargo** — caifanes#1 lo corrigió Memo, y los dos
  renombres que faltaban los midió Jane.

  🔴🔒 **EL PELIGRO CENTRAL, MEDIDO ANTES DE COBRARLO: «Perfil» ES PREFIJO DE
  «Perfil B/C/D».** En la ficha de caifanes el token exacto `"n":"Perfil"` aparece
  **6** veces y el prefijo `"n":"Perfil` aparece **24** — un replace a ciegas habría
  corrompido **18 nombres de zona** («Perfil B» → «Perfiles B»), en las zonas que el
  cliente VE y por las que PAGA. **EL ANCLA ES LA COMILLA DE CIERRE.** El careo lo
  vuelve candado con su **control positivo**: se exige que el replace por prefijo
  SÍ corrompa, porque sin esa mitad «no corrompió nada» no distingue «el ancla es
  buena» de «no medí».

  🔴 **TRES HALLAZGOS QUE CAMBIARON LA FORMA DEL TRABAJO, ninguno en mi camino
  aprobado** — que hablaba de «4 fichas, 4 sitios, 4 tablas»:
  - 🔒 **CAIFANES ES *UNA* FICHA QUE SIRVE A *DOS* PESTAÑAS.** `caifanes#0` y
    `caifanes#1` **no tienen fila** en `esferas_eventos`: la ficha es la del **PADRE**
    `caifanes`, y sus zonas viven en **SEIS** sitios —`zonas`, `cheap_zonas` y, dentro
    de `multifecha`, las `zonas` **y** `cheapZonas` de **cada una de las dos fechas**—.
    Por eso un renombre cura DOS pares con UNA edición, y por eso son **20 sitios**.
  - **arjona «2do Nivel» → «Segundo Nivel» YA ESTABA HECHO** (0 ocurrencias del token
    viejo) y sus 2 viajeros ya estaban capturados así. Es el séptimo par, con cero
    trabajo — y la ficha estaba **inconsistente consigo misma**: «1er» + «Segundo» +
    «3er». Queda nombrado porque Memo lo nombró; no es un olvido.
  - **La base guarda zonas en MÁS tablas que mi lista**: `precios_historial`,
    `excel_pestanas.regla_zona`, `main_eventos_uso`, `rol_eventos_uso`. Medidas:
    `precios_historial` da **CERO** filas para los tres eventos —**incluida la llave
    PADRE**, que es justo la trampa de ROL-HIST-PADRE— y `regla_zona` está en NULL.
    Un cero es una afirmación: estos eventos nunca registraron un cambio de precio,
    así que no hay historial que arrastrar.
  - ⚰️ **TELEMETRÍA NO SE MIGRA** (orden de Memo): `main_eventos_uso` (478 filas) y
    `rol_eventos_uso` (26) conservan el nombre viejo A PROPÓSITO — son el registro de
    lo que la gente vio ENTONCES, y reescribirlo falsearía el pasado.

  🔒 **EL ORDEN ES FICHA → PUBLICAR → DATOS, Y LA RAZÓN ESTÁ MEDIDA:** la puerta de
  zonas (`_lib/zona-ficha`) toma su universo de `catalogo-index`, o sea del **index
  SERVIDO**, NO de `esferas_eventos`. De ahí las dos mitades:
  - cambiar la ficha es **invisible para el cliente** — verificado contando lectores:
    los de `esferas_eventos` son Esferas, el compilador y el contador público (que
    mira `fecha_inicio`); **ningún camino de precio ni de venta la lee**;
  - pero **hasta que no se PUBLIQUE, cada venta nueva sigue escribiendo la ortografía
    VIEJA** y crea un huérfano nuevo. Migrar los datos antes del publish sería
    trabajar para volver a trabajar.

  🔴🔒 **LEY NUEVA, y nació de una regresión falsa que estuve a punto de reportar:
  UN PAR DE RENOMBRE VIVE EN SU FICHA, JAMÁS EN UNA LISTA GLOBAL.** Pregunté
  «¿quedan nombres viejos?» con los pares de los TRES eventos en una sola lista y me
  contestó que **trueno tenía 4 viejas vivas**. Mentira: `Perfil` es el nombre
  **NUEVO** de trueno y a la vez el **VIEJO** de caifanes, y `Perfil D` es viejo en
  caifanes y **legítimo** en trueno (ahí no se renombra, porque el Excel de trueno no
  lo escribe). **La misma cadena significa cosas opuestas según la ficha.** Y no es
  solo un error de consulta: un renombre GLOBAL sobre estas tablas le cambiaría el
  nombre a zonas sanas de otro evento. Bloque `[G]`, con el cruce IMPRESO.
  Hermana de *dos caminos, una columna*.

  **LOS DOS CANDADOS QUE PIDIÓ JANE, dentro:**
  - `[D]` **CARDINALIDAD DEL LOTE**: el barrido pestaña-vs-ficha no deja un par sin
    cubrir, y **lo DICE** si aparece uno — jamás pasa en vacío. Con control positivo:
    sin el lote tienen que quedar **7** huérfanos.
  - `[C]` **COLISIONES POST-RENOMBRE re-corridas con el lote puesto**, preguntándole
    al **dueño** (`_lib/normalizar-zona`) en vez de repetir la forma, y con control
    positivo sembrado. Jane lo pidió por nombre: en trueno conviven «Perfil»,
    «Perfil B» y «Beyond», y ninguna pareja normalizada colisiona.

  ⚠️ **DOS ROJOS Y LOS DOS ERAN MÍOS** (la ley de siempre): conté **8** pares y son
  **7**, y **6** huérfanos donde el barrido dijo **7**. Las dos veces tenía razón el
  dato, y la causa era la misma: caifanes#0 y caifanes#1 son dos pares curados por
  **un** renombre de ficha.

  ⚠️ **ESTE CAREO NO TIENE ANCLA, y es a propósito** (dicho, no supuesto): cero
  `git archive`, cero `HEAD_SHA`. Sus fixtures de ficha son **fotos fechadas** sobre
  las que **RECOMPUTA** el renombre, y `normalizar-zona` lo lee del **árbol de
  trabajo** — que es la forma correcta para un guardia de colisiones: anclado a un
  commit dejaría de cazar una regresión del normalizador, que es justo lo que tiene
  que cazar. Si algún día se le pone ancla, va **con su BASE a la vez**.

  ✅ **FASE 2 APLICADA (2-oct, inmediatamente después del publish de Memo): los 30
  renglones.** `compras` **6** · `viajeros_evento` **23** · `rol_recordatorios` **1**.

  🔒 **EL 26 DE JANE Y EL 30 MÍO CUADRAN SIN RESIDUO, Y SON PREGUNTAS DISTINTAS**
  — la ley de ZONA-NORM-1, otra vez, y esta vez sin hoyo que buscar:
  - **30 = los renglones ESCRITOS**, en tres tablas (6 + 23 + 1). Es la cifra del acta.
  - **26 = el estado del universo de VIAJEROS**: las 23 movidas + las 2 de «Segundo
    Nivel» que ya estaban + Cristyan. Su consulta no incluía `compras` ni
    `rol_recordatorios`.
  - Y el puente entre las dos: **31 filas tienen hoy un nombre nuevo, pero solo 30 se
    movieron** — la 31 es Cristyan, que ya era «Beyond».
  Los dos barridos son correctos; lo que no se puede es reportar uno como si
  contestara el otro.
  Releídos par por par **en su ficha**: **CERO** ocurrencias de cualquier nombre viejo
  en las tres tablas. 🔒 `stock_ajustes` **no se tocó** — sus filas YA traían la
  ortografía nueva porque el careo canoniza desde la pestaña, y **ÉSA ERA LA DERIVA**:
  el ajuste restaba de una llave que la ficha no tenía. El renombre las **curó sin
  tocarlas**. Igual `precios_historial` (cero filas) y la telemetría (478 + 26 filas,
  **no se migra** por orden de Memo: es el registro de lo que la gente vio ENTONCES).

  ⚠️ **LA VENTANA SE ABRIÓ DE VERDAD Y SE CERRÓ EN MINUTOS, y conviene que quede
  escrito porque fue suerte de calendario, no diseño.** Memo publicó **tres veces** en
  una hora (17:36 · 17:43 · y la tercera ya con la ficha cambiada). Las dos primeras
  cayeron **antes** del cambio de ficha, así que el index salió con los nombres viejos
  y todo quedó consistente; **la tercera se llevó los seis renombres** y ahí la FASE 2
  corrió enseguida. Entre ese publish y la FASE 2, las 5 zonas que siguen vendiendo
  mostraron su conteo de vendidos en cero. **La lección operativa: una tuerca que
  necesita un publish ajeno en medio no se puede planear con un «luego»** — o se hace
  con el publish coordinado, o se asume la ventana y se dice.

  ✅ **CAREO DE CIERRE CORRIDO (no prometido), contra las DOS puntas reales — el Excel
  cosechado y el index SERVIDO: 22 en verde, 0 en rojo.**
  - 🔒 **El montón `fuera` en CERO para las 4 pestañas** (20 zonas de Excel miradas:
    arjona 8 · caifanes#0 3 · caifanes#1 5 · trueno 4), con candado de cardinalidad: con
    menos de 18 zonas el barrido se declara incapaz en vez de pasar en vacío.
  - Las **6 nuevas PRESENTES** en el index servido y las **6 viejas AUSENTES**, zona por
    zona — medido sobre el universo que la puerta consulta de verdad (`catalogo-index`),
    no sobre `esferas_eventos`.
  - 🔒 **El peligro del prefijo, comprobado EN VIVO**: `Perfil B`, `Perfil C`,
    `General de Pie` y el `Perfil B` de trueno **siguen ahí**. Si el replace se hubiera
    hecho por prefijo, estas aserciones caerían.
  - 🔒 **Y la viajera huérfana, CURADA SOLA**: Cristyan Sureyma (trueno, zona
    «Beyond», 1 boleto, **alta del 28-ago-2026**) llevaba cinco semanas con una zona que
    la ficha no tenía. El renombre **no tocó su renglón** y hoy su zona existe
    (`zona_en_ficha: true`). Era el caso que Jane pidió por nombre.

  ⏳ **ESPERA PALABRA DE MEMO: caifanes «Perfil B» y «Perfil C» NO se renombraron.**
  El Excel **no las escribe** (las dos van `ag:1`, agotadas), así que no hay dato que
  diga si serían «Perfiles B»/«Perfiles C», y renombrarlas sería **inventar lo que el
  Excel va a escribir** — la casa ya tiene la regla: *la puerta abre lo que no se
  vende, jamás lo que NO SE SABE*. El corchete de la palabra llegó **vacío** en el
  encargo («[plural — la palabra de Memo]», con un condicional detrás), así que se
  tomó la rama segura y reversible. Si Memo dice que «y así con TODOS» las incluye,
  son **2 renombres más (12 sitios)** en esta misma forma. Mientras no, el candado de
  cardinalidad queda **de guardia**: las caza el día que alguien venda ahí.

- 🏆🔴 **LA EMERGENCIA DEL SORTEO DE KAROL G, CERRADA EN TRES CAPAS
  (2-oct-2026). Durante TODO el show no salió ni una foto y la tarjeta final
  mostraba a OTRA PERSONA.** Ganó **Lucero Vargas Bermúdez** (folio 144,
  `karolg-bbva-2026`, intento 2, `acepto`) y la pantalla pintaba la cara de
  **Carolina (folio 97)** bajo el nombre de Lucero. Tres defectos distintos, cada
  uno con su hotfix: **6aa5d42** (la página PIDE las fotos) · **b17ac8f** (la
  ronda final del re-giro, más el arranque en frío de las fotos) · **6db1fc6**
  («los dos»). Suite del sorteo **1,575 en verde**:
  `mide:sorteo-rondas` **1294** · `sorteo-maquina` 147 · `ganador-b` 53 ·
  `ganador-quieto` 65 · `sorteo-fotos-1` 16. **Cero SQL, cero escrituras.**

  🔴🔒 **LA LEY GRANDE, Y ME LA COBRÓ MEMO CON LA PANTALLA ENFRENTE:
  VERIFICAR LA RESPUESTA DEL ENDPOINT NO ES VERIFICAR LO QUE PINTA EL NAVEGADOR.**
  Reporté «arreglado» dos veces sobre la respuesta de `giveaway-estado`, y las dos
  veces Memo abrió `/sorteo` en incógnito y seguía roto. Sus palabras: *«Tu
  verificación fue sobre la respuesta de giveaway-estado, no sobre lo que pinta el
  navegador. Mide en un navegador REAL (Playwright) contra producción, no el
  preview … y hasta entonces no me digas que está.»* Es la hermana de **probar el
  camino, no la función**, un piso más arriba: el servidor puede contestar
  perfecto y la página pintar otra cosa. **Para una tuerca que se VE, el
  instrumento es el navegador contra PRODUCCIÓN.**

  **1 · LAS FOTOS: `sorteo.html` NUNCA PEDÍA `?fotos=1`.** La firma por lotes, el
  bucket y el `service_role` **siempre estuvieron bien** (159/159 paths casan con
  objetos reales, cero huérfanos). El careo estaba VERDE porque medía el
  **SERVIDOR** con la bandera escrita a mano y **nadie afirmaba que la PÁGINA la
  mandara**. `mide:sorteo-fotos-1` entra hoy **por el constructor de URL de la
  página** (rebana `refrescar` de `sorteo.html` y lo corre en un `vm`), con control
  positivo: BASE arma `?rodillos=1`, HEAD `?rodillos=1&fotos=1`.
  - Las fotos se piden **al dibujar el mosaico y se cachean por su vigencia**
    (firma 1800 s, re-pedido a los **1500 s** — por dentro—, reintento 30 s):
    jamás en cada latido, que es cada 4 s durante 82 s.
  - 🔒 **Y SI LA FIRMA FALLA, SE GRITA Y SE DEGRADA A INICIALES SIN ROMPER
    NADA.** Había **DOS tragadas silenciosas** (`rs.ok ? … : []` y un `catch`
    pelado) más **el éxito vacío** (paths pedidos, cero urls devueltas, que se
    leía igual que «no hacía falta»). `console.error` pasó de **1 a 7**.
  - ⚠️ **El arranque en frío**: `tocaPedirFotos` se rehusaba con `estado` aún
    nulo, así que la primera pintada —la que el público ve— salía sin fotos.

  **2 · LA RONDA FINAL DE UN RE-GIRO PROYECTABA AL GANADOR DEL GIRO HEREDADO.**
  Medido en la base por Memo: el intento 2 tiene `registro_id` de Lucero,
  `resultado: acepto`, **`rondas` en NULL** y `origen_sorteo_id` del intento 1 —
  **el dato estaba bien; la proyección no**. `proyectarRondas` recibe hoy el
  `ganadorId` y **la ronda final es SIEMPRE el ganador del giro ACTUAL**, con la
  aserción «para todo re-giro, `rondas[último] == registro_id`». Si el ganador no
  está en el `orden` heredado se arma su ficha con lo que se sabe y sale
  **`ganador_incoherente: true`**, que `giveaway-estado` **GRITA** — un ganador que
  no aparece en su propio padrón no se arregla en silencio.

  **3 · EL GATEO DE «LOS DOS» TRATABA AL GANADOR COMO PERDEDOR — y éste era el
  que pintaba la cara equivocada.** Decía `const ganadorId = String((orden[0]||{}).id)`
  y en un re-giro `orden[0]` es el ganador HEREDADO (Carolina, 97): Lucero caía en
  `perdedores` y el gateo la **apagaba**. La rejilla final se quedaba con 97 y 104
  y la página marcaba «la única viva».

      VIEJA → dos: [97,104] · final folio 97
      NUEVA → dos: [97,144] · final folio 144

  🔴🔒 **ARREGLÉ UN SITIO Y NO BARRÍ LA FAMILIA, Y ESO COSTÓ UN «YA ESTÁ»
  FALSO.** «Quién ganó» se suponía de `orden[0]` en **DOS** lugares; arreglé la
  ronda final (capa 2), reporté y el otro seguía ahí. Hoy el hecho entra **UNA**
  vez y lo usan los dos. **La señal era la propia página, gritándolo, y no la
  leí:** `[sorteo] la ficha del folio 144 no está en la rejilla (hay 2, vivas 1:
  97,104). Se marca la única viva.` — el `console.error` de GANADOR-QUIETO-2
  nombró el defecto exacto y había que mirar la consola, no el diff.
  - ⚠️ **Y el bit guardado `primero` lo EMPEORABA**: se calculó para el giro
    ORIGINAL, donde el ganador de hoy era perdedor, así que **nombraba a Lucero**.
    El `find` sobre `perdedores` ya la protege con el `ganadorId` correcto, y queda
    ESCRITO que el bit es de otro giro. (Hermana de *ausencia en llave nacida a
    media historia*: un bit guardado conserva la verdad **del día que se guardó**.)
  - 🔒 **LA INVARIANTE QUE FALTABA**, y su ausencia es la razón de que la capa 2
    se reportara como completa: **«los dos» CONTIENEN al ganador**. Con su control
    positivo —sin el hecho lo EXCLUYEN— y el fixture real (orden heredado cuyo
    `[0]` es el folio 97 y `primero` nombrando al ganador). 1289 → **1294**.

  ✅ **VERIFICADO EN NAVEGADOR REAL CONTRA PRODUCCIÓN, con captura** (420×980, el
  botón **REAL** `#repetir` —se destapa `#panel` solo en ese navegador porque sin
  token mide 0×0— y los 82 s esperados): mosaico con **8 de 8 fotos** antes de
  girar; a t=50 s las tres finalistas eran Carolina / otra / **Lucero**; y la
  tarjeta final con `src` de **`a3c0afd1…`** (Lucero) y **no** `7c859c46…`
  (Carolina), placa «Lucero Vargas Bermudez · Reynosa · Folio #144».
  🔒 **La identidad se mide por el UUID EN CUALQUIER PARTE de la url**: leí los
  últimos 44 caracteres creyendo que eran la ruta y **son el token de la firma** —
  reportaba «otra» en falso.
  - **El punto 3 de Memo, contestado: NO era caché del CDN.** El HTML servido
    traía el código nuevo (`tocaPedirFotos`, `arranqueFrio`) con
    `cache-control: public, max-age=0, must-revalidate`. ⚠️ Y casi reporté un
    «desplegado» falso: `grep -c "fotos=1"` daba 1 **por un comentario
    preexistente** — el ancla tiene que ser única del código nuevo.
  - 🔒 **El testigo del deploy fue la respuesta PÚBLICA**, no el panel de Netlify:
    producción reproducía el defecto en su propio JSON (`dos: [97,104]` con la
    ronda final ya en `[144]`), así que se espera a que `dos` traiga **144**.

  ⚠️ **ANCLAS, dicho y no supuesto:** `mide:sorteo-fotos-1` se queda en
  **b17ac8f** porque su sujeto (`sorteo.html`) es **byte a byte el mismo** en el
  merge (sha1 `0f955d45c7b3` en los dos) — comprobado, no asumido. Y
  `mide:sorteo-rondas`, que es quien mide el lib que SÍ se movió, **no tiene
  ancla**: carga del árbol de trabajo, así que mide lo que acabas de escribir y
  en cambio no puede traer control positivo por commit.

  ⏳ **PENDIENTE, bloqueado por llave:** el **PNG vertical de la story de
  Lucero** que Memo pidió para hoy necesita bajar su foto del bucket privado con
  `PORTAL_SUPABASE_SERVICE_KEY`, y **Memo se negó expresamente a pasarla** (*«No
  te paso la service key: el camino es arreglar y desplegar»*). Queda NOMBRADO,
  sin sustituirse por nada. Y la aserción del careo **contra el bucket real**
  sigue igual: nombrada como pendiente de llave, **no escrita en verde**.

  ⚠️ **`mide:giveaway-karolg` trae 10 ROJOS PREEXISTENTES y no son de aquí**:
  los diez dicen «El registro ya cerró» porque su `CIERRE` es
  `2026-10-01T20:00:00-05:00` y hoy es el 2-oct. Es la familia del **fixture
  vencido** de NUBE4-ARNES-1 — fechas tecleadas careadas contra el reloj real.
  Es su propia chiquita.

- 🏆 **CAREO-ZONA-1 EN PROD (30-sep-2026, merge 12fef09, re-ancla 654342c): el
  careo diario aprende ZONAS, FILAS PARTIDAS y FILAS ROJAS.**
  `npm run mide:careo-zona-1` (**54**, anclado al merge), construida por CC y
  verificada con corrida propia antes del merge (los 6 vecinos en verde).
  - La zona de la fila VIAJA: canonizada por `_lib/zona-ficha`, desconocida se
    nombra sin escribirse. Boletos = filas con zona real; «-» no es un boleto.
  - **CHEAP con boletos en 2+ zonas se PARTE en filas** (el dinero entero en la
    principal). Un PLUS repartido sigue siendo aviso. Precedente: Diana Loredo.
  - 🔒 **FILA ROJA = CANCELACIÓN (regla firmada de Memo, 30-sep)**: baja con
    `boletos=0, zona NULL`, **el abonado NO se toca** (Diana Marlene y Nohemi
    conservan sus $5,500). ⚠️ **HAY DOS «BAJAS» Y JAMÁS SE CABLEAN**: la del
    careo («no vino en la pestaña») sigue SIN puerta; la del plan es SOLO
    `p.roja`. Vigilado en mide:cuadre-aplicar.
  - ✅ **DESPLEGADO Y CALIBRADO (1-oct).** Los dos `.gs` ya están arriba y el
    umbral (r−g/r−b con techo, **3 celdas = fila**) se midió contra las rojas
    REALES: **cazó exacto las 2 de Karol 7-nov y las 13 de Álvaro 3-oct**, y el
    barrido global aplicó **116 bajas, 0 errores**. El careo sigue devolviendo el
    histograma por pestaña para poder moverlo con datos si hace falta.
    ⚠️ Si `rojas` llegara null (un `.gs` viejo), nadie sale como baja y el careo
    lo DICE (`colores_leidos:false`) — el fail-soft sigue dicho, nunca mudo.
  - ✅ **Beyond de alvarodiaz#0: CERRADO (medido 1-oct, post-merge de 1b/1c).**
    Tras las 13 bajas rojas: 46 compradas − 33 de viajeros − 2 de la casa =
    **11 libres = el Restan 11 del Excel, exacto**. La propuesta vieja de
    «fuera 1→14» murió sola: esas filas eran los cancelados, no boletos de la
    casa. Y la disponibilidad servida ya no lo marca ni agotado ni en pocas.
- 🏆 **CAREO-ZONA-1b (1-oct-2026): la idempotencia de las bajas y el rojo del
  LIBRO.** `npm run mide:careo-zona-1` **EXTENDIDO a 79** (no arnés nuevo), con
  **DOS bases**: `ae1ea3a` para el control positivo de la 1 y `BASE_1B=12fef09`
  para el de la 1b — el árbol viejo no sirve de control para la chiquita porque
  no propone bajas EN ABSOLUTO, así que «no la re-propone» saldría verde en vacío.
  - 🔴🔒 **LA GUARDA DE IDEMPOTENCIA ERA INALCANZABLE, y la razón no es la
    que yo escribí primero.** No fue la carrera del reintento de CAREO-RETRY-1: es
    que `leerBase` sube un `boletos: 0` a **1** (su respaldo contra el null, que
    es CORRECTO para la sincronía), así que `boletos === 0` no podía ser cierto
    jamás. Una normalización deliberada de más arriba dejó muerta la guarda de
    otro lector. El respaldo NO se tocó: se añadió `boletos_crudo` al lado.
    Reproducido en el control positivo: `12fef09` escribe **2 PATCH** en la
    segunda pasada; con 1b escribe **0**.
  - Segundo candado independiente: el PATCH de la baja va condicionado
    (`or=(boletos.neq.0,zona_boleto.not.is.null)` — el `or=` porque un NOT contra
    NULL traga filas). La red falsa del arnés RESPETA ese filtro, o pasaría en vacío.
  - 🔒 **El caso fino:** pestaña VIVA + libro ROJO = **AVISO** con su motivo y su
    monto, NO baja — la fila roja cancela esa compra CHEAP, no a la persona.
    Quien SOLO vive en el libro y viene roja sí baja completa, y la nota dice de
    qué hoja vino (`origen_rojo`), porque «cancelada» a secas manda a buscar en
    la equivocada.
  - El umbral sigue teniendo **UN** dueño (`ROJAS_MIN_CELDAS`): el parser del
    libro solo ARRASTRA la marca, porque `numerologia.js` no puede pedirle la
    constante a quien ya lo requiere (sería un require circular).
  - Y un letrero que sobrevivía a su causa: el error de `admin-excel-aplicar`
    decía «las BAJAS no se aplican nunca» cuando la 1 ya las aplica.
  - ⚠️ **CUATRO ROJOS DEL ARNÉS, los cuatro míos** y vale la pena el renglón: el
    arnés estaba anclado a `12fef09` y midió el árbol SIN 1b toda la corrida; el
    fixture del libro inventó rótulos («Anticipo» en vez de `Separo`) y las 3
    filas caían a `fueraDeBloque`; le puso a `fecha_libro` la fecha de la COMPRA
    cuando es la de la **función**; y le colgó el libro rojo a **Monserrat**, que
    ya era la fixture de la MEZCLA — un papel nuevo encima de una fixture vieja
    la calla.
- 🏆 **CAREO-RED-1 (1-oct-2026): el fetch que TRUENA entra a la misma escalera.**
  Deuda anotada de CAREO-RETRY-1, pagada. Un `fetch` que revienta (red caída,
  «Failed to fetch», DNS, CORS raro) **no es un status**: es una excepción, y se
  escapaba del bucle de `khExcelRecorrer` tirando el recorrido ENTERO.
  `mide:careo-retry-1` **33** (eran 20), re-anclado al merge.
  - 🔒 **UNA SOLA ESCALERA**, y el arnés lo afirma comparando la secuencia letra
    por letra con la del 504: las dos dan `[[0,10],[0,5],[0,2]]`. Dos escaleras
    serían dos listas que todavía no divergen, y la de la red decidiría cuándo se
    abandona un recorrido de 100+ eventos.
  - ⚠️ **EL ORDEN DEL `if` ES PARTE DEL ARREGLO**: `revento` se pregunta PRIMERO y
    corta el `||`, porque con el fetch reventado `r` es null y un `!r.ok` sería un
    TypeError — el recorrido moriría por el arreglo en vez de por la red.
  - Al cortar se dice DE QUÉ murió (el error original) y DÓNDE quedó: «el servidor
    siguió fallando» con la red caída manda a revisar Google cuando es el wifi.
  - ✅ **El segundo sitio se VERIFICÓ y no se tocó**: el `catch` del reintento en
    serie vive DENTRO del `for (intento...)`, así que un reventón consume intento y
    el error original se conserva. Se le puso aserción para que siga siendo cierto.
  - El guión del `khAdminFetch` falso aprendió a **REVENTAR**: sin eso el arnés no
    podía ni expresar el defecto — un guión que solo sabe devolver status mide la
    mitad del mundo.
- 🏆 **CHATARRA-SELLO-1 (1-oct-2026): el careo SELLA la chatarra que verifica,
  aunque el conteo no cambie.** `npm run mide:chatarra-sello-1` **27**.
  Escritura de **NOTA**, jamás de boletos. Cero SQL.
  - 🔴 **EL HUECO**: el careo solo escribía cuando el conteo CAMBIABA, así que
    «la pestaña sigue diciendo 2» y «nadie ha vuelto a mirar» se veían EXACTAMENTE
    igual. Medido contra la base viva: **98 ajustes con chatarra en 59 eventos, 89
    con fecha anterior a CAREO-ZONA-1 (264 boletos, 57 eventos)** y ninguna forma
    de saber cuáles seguían siendo verdad. Familia de «un cero es una afirmación».
  - 🔒 **SE ANEXA, JAMÁS SE PISA**: la nota original es la PROCEDENCIA (de qué careo
    salió el conteo, o las notas de migración de Jane con el nombre de quien compró
    por fuera). ⚠️ Pero el sello **se REEMPLAZA, no se apila**: un sello por corrida
    haría una nota que crece sin fin — esta casa ya pagó eso con las bajas.
  - 🔒 **NO SE SELLA**: un ajuste en CERO (no dice nada), uno cuyo conteo CAMBIA
    (ésa ya queda con nota nueva), ni nada si el careo no leyó pestaña — un sello
    sobre una cosecha que no ocurrió sería **una mentira firmada con fecha**.
  - 🔴🔒 **LA PREGUNTA DE `updated_at`, CONTESTADA MIDIENDO** (Jane la levantó):
    `stock_ajustes` **NO TIENE TRIGGER** (cero triggers no-internos en la base) y su
    `default now()` solo aplica al INSERT. Así que un PATCH que no nombra
    `updated_at` **no la mueve**: sellar NO cambia el significado de esa columna.
    Su único lector es `_lib/disponibilidad`, que la lleva a la pantalla como
    metadato de la casilla del Palacio — **nadie DECIDE con ella** (ningún orden,
    ninguna comparación).
    - ⚠️ Y de paso quedó medido un **desnivel que ya existía**: `admin-compras` y
      `admin-coordi-asignaciones` **sí** ponen `updated_at` a mano en sus PATCH y el
      **CAREO nunca lo hizo**. O sea que esa columna hoy significa «cuándo lo tocó un
      HUMANO», no «cuándo cambió el conteo». Este sello no lo empeora ni lo arregla.
    - 🔴 **CORRECCIÓN A MI PROPIO REPORTE de CUADRE-STOCK-1**: inferí que «Balcón no
      se tocó el 1-oct porque su `updated_at` es del 23-sep». **Esa inferencia NO
      ERA VÁLIDA** — el careo nunca mueve esa columna. La conclusión se sostiene por
      el otro argumento, que no depende de ella: los cuatro viajeros existen desde
      AGOSTO, tres semanas antes del careo del 22-sep.
  - ⚠️ **LA GUARDA DE IDEMPOTENCIA DE `mide:cuadre-aplicar`, ACTUALIZADA A SU
    INTENCIÓN.** Decía «el 2º clic escribe CERO veces» y el sello la puso en rojo con
    razón: el segundo clic sella lo que el primero acabó de cuadrar. Medido, los dos
    únicos escritos son `{nota:…}` y `vendidos_fuera` queda idéntico. Ahora se mira
    **QUÉ** escribe, columna por columna: ninguna de dinero/boletos, y cualquier
    escritura que no sea un sello de solo-nota tumba el careo. **Es más estricta que
    contar**: con el «cero», una escritura futura que SÍ moviera algo se habría
    podido «arreglar» subiendo el número.
  - 🔒 **Y UN DATO DE ANCLAS QUE CONVIENE NO CONFUNDIR**: `mide:chatarra-sello-1`
    quedó anclado al merge **3e6d068** (BASE `d549183`, donde el montón `sellos` no
    existía). Pero **`mide:cuadre-aplicar` NO ESTÁ ANCLADO A COMMITS** — cero
    `git archive`, cero `HEAD_SHA`, cero `BASE`: carga de `RAIZ`, o sea del ÁRBOL DE
    TRABAJO. Dos consecuencias que no son la misma cosa:
    - ✅ **no hay ancla que mover** cuando otra tuerca le cambia el sujeto, y no
      sufre la trampa del commit: mide lo que acabas de escribir;
    - ⚠️ **no puede traer control positivo por commit**, porque no tiene BASE contra
      la que exigir que el defecto existía. Sus candados son positivos por
      construcción (sembrar el caso y verlo caer).
    🔒 Si algún día se le pone ancla, hay que darle **BASE a la vez**: una ancla de
    HEAD sin BASE es un arnés que mide el pasado sin poder compararlo con nada.
    (Queda escrito también DENTRO del arnés, no solo aquí.)
- 🏆 **PLAN-CASE-1 (1-oct-2026): el plan migrado deja de ser ciego a las
  MAYÚSCULAS.** `portal-mi-plan-migrado` casaba con `correo=eq.<JWT en minúsculas>` y
  el `eq` de PostgREST distingue mayúsculas: **285 filas · 244 personas** veían un plan
  VACÍO o INCOMPLETO. `npm run mide:plan-case-1` **18**. Cero SQL, cero escrituras.
  - 🔒 **QUIEN DESAMBIGUA ES EL LECTOR, NO LOS DATOS** (la forma de ROL-HIST-PADRE).
    CERO UPDATEs a `viajeros_evento`: 285 filas de datos de gente no se tocan para
    arreglar un lector — y el crudo del correo es justo el dato que delata el
    problema (la ley de `boletos_crudo`).
  - **LA IMPLEMENTACIÓN, ELEGIDA CON MEDICIONES CONTRA LA BASE VIVA:** `ilike` sin
    comodín para ESTRECHAR + comparación `lower()` en el handler como AUTORIDAD.
    - `correo` **NO TIENE ÍNDICE** (los únicos son `evento_id` y la pk), así que el
      `eq` de hoy YA era un Seq Scan. El plan de los dos es **idéntico**:
      cost `0.00..187.85`, buffers `hit=156` en los dos. No se pierde índice alguno.
    - 2,550 filas / 1,512 kB; el `~~*` cuesta ~1.4 ms más. Y el `ilike` encontró
      **2 filas donde el `eq` encontraba 1** sobre datos reales.
    - La alternativa —traer por otro filtro y comparar aquí— **no tiene otro filtro**:
      el cliente solo sabe su correo. Sería traerse las 2,550 filas por visita: el
      mismo barrido en la base más cientos de KB por la red. Estrictamente peor.
  - 🔴🔒 **EL COMODÍN ESCONDIDO, Y POR QUÉ FILTRAR DESPUÉS BASTA.** En ILIKE `_` casa
    CUALQUIER carácter: **94 filas / 73 personas tienen `_` en su correo** (medido), así
    que `maria_lopez@x` como patrón casaría `mariaXlopez@x`. Hoy **0 de los 73** pescan
    filas ajenas — pero eso es SUERTE, no diseño. El candado: el patrón solo puede
    **SOBRE**-pescar (un comodín casa más, nunca menos), así que el filtro exacto del
    handler es COMPLETO. **Esa asimetría es la razón de que el diseño sea seguro**: si
    el `ilike` pudiera sub-pescar, filtrar después no bastaría.
    - ⚠️ Y los comodines **NO se escapan a propósito**: un escape mal interpretado por
      PostgREST haría SUB-pescar, que es el defecto que vinimos a arreglar.
  - 🔴 **EL BARRIDO DE COLISIONES que Jane pidió — no salió cero, y el detalle importa:**
    - 1,284 correos únicos. **122** los comparten personas con primer nombre distinto
      (un buzón, varios viajeros: estructural en este negocio).
    - **120 de esos 122 YA están expuestos hoy**: los dos nombres conviven dentro de la
      misma ortografía, así que el `eq` ya los devuelve juntos.
    - El arreglo une **2** grupos nuevos, y los dos se miraron uno por uno:
      `victorgael2929` es la **MISMA persona** («victor» en calle24 vs «víctor» en
      alvarodiaz#0 — un acento): el arreglo la cura, ve sus dos viajes en vez de uno.
      `kelinygm` son **dos personas** («keliyn» y «andrea», las dos en arjona) con un
      correo común — se verían entre sí, **igual que los 120 de hoy**.
    - 🔒 Conclusión dicha, no escondida: el arreglo **no introduce** la exposición de
      buzón compartido — ya existía en 120 grupos—; la extiende a 2. Si Memo quiere
      cerrar ESO, es otra tuerca y no la decide un lector.
  - `saldoMigrado` sigue siendo el dueño del dinero: careo **byte a byte** de que
    `_lib/cuenta-evento` no se movió. ⚠️ Y hay un efecto que conviene ver: en BASE el
    caso de «todo en mayúsculas» salía VACÍO, así que esa aritmética **nunca corría
    para él**. El arreglo no solo lo hace visible — hace que su dinero se CUENTE.
  - ⚰️ **`ojo_plan_vacio` de MIG-1d-ii RETIRADO, no silenciado**: arreglado el lector,
    esas filas dejaron de ser invisibles y el aviso mentiría — mandaría a arreglar a
    mano 244 filas sanas y frenaría el primer envío por nada. Queda **siempre vacío**,
    se conserva el CONTEO como dato (sirve para re-medir el padrón) y su bloque del
    arnés se convirtió en **TESTIGO**: exige que el casamiento insensible siga vivo.
    El día que alguien revierta el lector, el testigo cae y el aviso tiene que volver.
  - 🔒 **EL ANCLA NO ES SOLO ASUNTO DE SU PROPIA TUERCA**: PLAN-CASE-1 cambió el
    SUJETO de `mide:mig-1d-ii`, así que ese arnés se re-ancló TAMBIÉN. Con el ancla
    vieja seguía midiendo un árbol que ya nadie corre, y su rojo hablaba del pasado.
- 🔨⏳ **MIG-1d-ii EN MAIN (1-oct-2026): el botón que INVITA al Portal, por evento.
  🔴🔒 ESTAR MERGEADA **NO MANDA NADA**** — el código vive en main y no ha salido ni
  un correo. El primer envío real sigue detrás de **CUATRO LLAVES**, y ninguna es mía:
  1. **el visto de Memo al render REAL del seco** (no a un ejemplo: el que salga de
     correr `enviar` en seco sobre el evento que él elija);
  2. **el SQL de Jane** para `invitaciones_portal` (`ACTA-MIG-1D-II.sql`) — sin la
     tabla el botón se rinde con 502 a propósito;
  3. ✅ **PLAN-CASE-1 — HECHA** (1-oct, su acta arriba): el lector del Portal ya no es
     ciego a las mayúsculas. Esta llave queda ABIERTA.
  4. **Memo elige el evento, y CHICO.**
  `admin-portal-invitar` + `_lib/invitacion-portal` + `ACTA-MIG-1D-II.sql`.
  `npm run mide:mig-1d-ii` **48**, anclado al merge **557e14c** (BASE `09ac540`,
  donde el botón no existía). Diff ADITIVO: +942 líneas, ni una borrada.
  - 🔴🔒 **`CORREOS_MODO` ESTÁ EN 'real': el primer clic escribe a gente de verdad.**
    Tres puertas, las tres de Memo: **el `seco` es el DEFAULT** (para mandar hace
    falta `seco:false` **Y** `confirmar:true` — dos gestos; el peor caso de un
    olvido es ver el render otra vez) · **exige `evento_id`, no existe «invitar a
    todos»** (dalemix metería ~156 de golpe) · **tope de 60 por clic**, y el rechazo
    dice cuántos son.
  - 🔒 **EL ARNÉS CORRE CON `CORREOS_MODO='real'` A PROPÓSITO**, que es como está
    producción. Ponerlo en `'prueba'` habría medido un mundo que no existe: el cero
    de envíos tiene que salir del SECO, no de un desvío — «no mandó» y «mandó a
    otro buzón» son cosas distintas. Y el contador de envíos tiene **control
    positivo**: se manda de verdad contra la red falsa y se exige que los VEA,
    porque un contador ciego da cero siempre y su cero no probaría nada.
  - 🔒 **SIN BITÁCORA NO SE INVITA A NADIE** (502, no «0 enviados, ok»): «no sé a
    quién ya invité» no es «a nadie», y la diferencia son correos repetidos que no
    se deshacen. La tabla `invitaciones_portal` **la crea Jane** — el SQL está en
    `ACTA-MIG-1D-II.sql` y el mensaje de error manda ahí. Su UNIQUE va sobre
    `(evento_id, correo)` NOT NULL, con CHECK de minúsculas, y el acta incluye
    cómo comprobar que los candados **muerden**, no solo que existen.
  - 🔒 La bitácora se asienta **DESPUÉS** del envío, una por una. Asentar antes
    dejaría a alguien marcado como invitado sin haber recibido nada, y la
    idempotencia le cerraría la puerta para siempre en silencio. Si el asiento
    falla se REPORTA: el correo ya salió y el próximo clic se lo mandaría otra vez.
  - El render se **DERIVA** del catálogo (PROMO-DERIVA) y el arnés lo comprueba
    MOVIENDO el catálogo: si el render no se mueve, el texto estaba tecleado. Sin
    catálogo **no se manda** — un «tu viaje» sin decir a qué se lee como spam.
  - 🔴🔒 **EL HOYO QUE SALIÓ DE LEER EL CUARTO PASO** (y que mi primera aserción
    se perdió por ASUMIR el mecanismo): `portal-mi-plan-migrado` no busca por
    `portal_cliente_id` — busca `viajeros_evento?correo=eq.<correo del JWT en
    minúsculas>`, y **el `eq` de PostgREST es SENSIBLE A MAYÚSCULAS**. Una fila
    guardada como «Laura@Correo.com» es INVISIBLE para su propia dueña: se
    registra, el Portal la enlaza (`clientes.correo` sí está en minúsculas, lo
    normalizó el puente) y su plan sale **VACÍO** — con nuestro correo diciendo
    «ya puedes ver tu plan».
    - La invitación **no lo arregla** (sería un UPDATE a datos de gente) pero **no
      lo calla**: sale el montón `ojo_plan_vacio` en la vista previa, con el id de
      cada fila invisible. Y distingue DOS frases porque son dos cosas: «TODAS sus
      filas → plan VACÍO» vs «alguna → vería su viaje INCOMPLETO».
      ⚠️ Con el censo de Jane encima, ese montón **no es informativo: es el FRENO**.
      La vista previa del evento que Memo elija va a traerlo lleno, y eso es la señal
      de parar — no un detalle que se lee y se sigue de largo.
    - 🔴🔒 **MEDIDO POR EL VERIFICADOR CONTRA LA BASE VIVA DE KH (1-oct): 285 FILAS
      con el correo en mayúsculas · 244 PERSONAS DISTINTAS — ~1 de cada 5 de las que
      tienen correo.** ⚠️ **ATRIBUCIÓN CORREGIDA** (cierre del 1-oct): aquí decía
      «medido por Jane» y no fue Jane — lo midió el VERIFICADOR. El número no cambia;
      el autor sí, y eso importa: una firma equivocada vuelve un dato intocable por
      una razón falsa, y al siguiente que lo dispute lo manda a discutir con quien
      no lo midió. Yo no lo pude medir cuando lo escribí (creía no tener llaves) y
      lo dejé como hipótesis razonada; **lo reproduje después, en PLAN-CASE-1, con
      mi propia consulta: 285 / 244 exactos**. No es un caso raro: es la
      quinta parte del padrón, y por eso es una LLAVE del primer envío (PLAN-CASE-1)
      y no una nota al pie. Invitar antes de arreglarlo le mandaría a ~244 personas
      un correo que dice «ya puedes ver tu plan» hacia una pantalla en blanco.
      Para re-contarlo cuando se arregle:
      `select count(*) from viajeros_evento where correo is not null and correo <> lower(correo);`
    - ⚠️ Y el TAMAÑO cambia la forma del arreglo, así que queda dicho sin decidirlo:
      con 244 personas, «que un humano arregle la fila» ya no es un camino. PLAN-CASE-1
      tendrá que elegir entre **normalizar las filas de una vez** (UPDATE a datos de
      gente) o **volver la búsqueda insensible a mayúsculas donde se lee**. 🔒 **No lo
      elijo yo**: toca datos de clientes y el camino del dinero.
    - 🔒 Y el corolario: el crudo del correo VIAJA al lado de la llave, porque la
      llave normalizada borra el único dato que delata el problema — la misma
      forma que `boletos_crudo` en el careo.
- 🏆 **CONCILIA-1 FASE 1 (1-oct-2026): el careo CAJA ↔ CONTRATOS, con nombres y
  SIN escribir un peso.** `_lib/concilia` + `admin-concilia` (`reporte` y
  `radar`, roles del dinero) + el renglón del Radar. `npm run mide:concilia-1`
  **71**, anclado al merge **24c9d42** (BASE `5e1c501`). Diff 100% ADITIVO:
  7 archivos, +1,154 líneas, ni una borrada. Cero SQL, cero escrituras.
  - 🔒 **NO ESCRIBE, Y SE MIDE EN VEZ DE PROMETERSE**: ningún `method:` en la lib
    ni en el handler, la red falsa del arnés TRUENA ante cualquier verbo que no
    sea GET, y una acción `aplicar` se rechaza en el despacho. Una guarda
    prometida en un comentario y nunca medida es la familia que ya se pagó.
  - 🔒 **AUD-1 donde de verdad muerde**: el saldo de una persona se le PREGUNTA a
    `saldoMigrado`; aquí no se suma un abono. Y el fixture **SEPARA las dos
    implementaciones**: Laura lleva $5,000 de previo + $1,200 del periodo + $800
    de hace 40 días = **$7,000**, y un reduce del periodo daría $6,200. Con el
    fixture fácil los dos números coinciden y el verde no dice nada.
  - ⚠️ **Lo que SÍ se calcula aquí, rotulado**: el TAMAÑO del montón que el reporte
    enseña. No es un saldo — no afirma nada sobre el negocio, es la suma de los
    renglones que van a salir nombrados. Esa distinción va escrita en el código.
  - 🔒 **UN CERO ES UNA AFIRMACIÓN**: con un lado caído → **502**,
    `se_pudo_carear:false`, `diferencia: null` (NO cero) y el motivo diciendo CUÁL
    lado. Un 200 con ceros habría callado al renglón del Radar —que es lo que hace
    cuando todo cuadra— y el descuadre real quedaría invisible el día que la base
    tose.
  - 🔒 **EL FAIL-SOFT DEL RENGLÓN ES AL REVÉS QUE EL DE LA NUBE**, y la diferencia
    es el punto: la nube ilegible se calla (no es su dueño y no cuesta dinero
    hoy); el DINERO ilegible **habla**, porque callarse se vería idéntico a «todo
    cuadra». El 403 sí se calla: es permiso, no descuadre (ley de ses-1).
  - Cuatro candados de mordidas viejas: el casamiento guarda una **COLA** por
    llave (dos personas pueden pagar lo mismo el mismo día; un `Map` por llave no
    única descarta en silencio — aquí INVENTARÍA un descuadre) · `monto_pagado`
    manda sobre `monto` (un parcial leído como completo acusa a la caja de un
    faltante falso) · el periodo se valida ANTES de consultar («2026-13-45» sale
    como la CADENA "Invalid Date", truthy) · el mes del Radar se calcula en
    `America/Matamoros` (el 30 a las 11 pm un `toISOString()` pide el mes que viene).
  - Dos montones que **NO son descuadres** y se cuentan aparte: abono sin viajero y
    movimiento de caja sin cliente. Tirarlos sería un descuadre invisible;
    sumarlos inflaría la diferencia con un hueco de datos.
  - ⏳ **PENDIENTE DICHO: la columna `fuente` de `abonos_viajero` NO EXISTE.** La
    fuente se DERIVA de la nota y viaja rotulada (`fuente_derivada:true`).
    Formalizarla es **SQL de Jane** más un cambio de ESCRITURA en el careo, y esta
    fase no escribe. Mientras no exista, lo que no casa no se adivina: `manual` si
    hay nota, `sin-nota` si no — un montón «manual» que en realidad es «no supe»
    mandaría a buscar a quien no capturó nada.
  - 🔴 **Y una FIRMA INVENTADA cazada por su propia aserción**: escribí `_radEsc`
    siete veces y esa función no existe — el renglón habría tronado al primer
    descuadre, en la pantalla del dinero. Va `_escNotif` (el que sí existe) y el
    arnés AFIRMA que todo ayudante que el renglón invoca existe de verdad.
- 🔴🔒 **EL ARNÉS MIDE EL COMMIT, NO TU ÁRBOL — y ya tiene GUARDIÁN.** Los arneses
  archivan con `git archive`, así que miden el **commit**: un cambio sin commitear
  sale ROJO contra código correcto, y el rojo se lee como defecto del código.
  **Se pagó CUATRO veces en la sesión del 1-oct** (CAREO-ZONA-1b, 1c, CAREO-RED-1
  y CONCILIA-1). `mide:concilia-1` trae el remedio: si los archivos que lee están
  sucios y se mide el HEAD actual, **la corrida se DETIENE nombrando los
  archivos**. Vale copiarlo a los demás arneses.
  - ⚠️ **Vigila los archivos QUE SE ARCHIVAN, no el script del arnés.** Es a
    propósito y es la distinción entera: el arnés corre **del árbol de trabajo**,
    así que su propia suciedad no invalida nada; lo que se mide viene del commit.
    Un guardián que también se quejara del script bloquearía cada iteración
    legítima y lo apagaría alguien al tercer intento.
  - Hermano: **el éxito vacío también habla.** Con cero aserciones el marcador
    imprimía «✅ VERDE · 0 en verde», que se lee igual que una corrida sana y es lo
    contrario. Ahora dice «NADA MEDIDO · esto NO es un verde».
- 🔴⏳ **`mide:color-tema` está ROJO (14/1) y NO es de nadie de hoy**: ya lo estaba
  en `5e1c501`. Su rojo es una queja **del propio instrumento** — «ningún elemento
  SORDA depende del tema: el control no prueba nada»—, o sea un control positivo
  que no controla. No se tocó aquí: es su propia chiquita.
- 🏆 **NUBE4-ARNES-1 (1-oct-2026): `mide:nube-4` vuelve a medir.** Estaba en
  «10 verde, 7 rojo» y de hecho se CAÍA (`TypeError` leyendo `.precio` de null);
  hoy **73 en verde, 0 en rojo**. 100% del arnés: el diff es UN archivo y
  `_lib/nube.js` quedó byte a byte igual. Re-anclado al merge.
  - 🔴 **LA CAUSA ERA UNA FOTO VENCIDA** (`vigente_hasta` 28-sep / 23-sep /
    **30-sep**, y la de `edc27` murió el día anterior: por eso asomó justo ese
    día). **NUNCA dijo que la función NUBE-4 estuviera rota — dijo que su arnés
    dejó de medir.** Son dos afirmaciones distintas y conviene no mezclarlas.
  - 🔴 **Y HABÍA UNA PISTA A LA VISTA: `AHORA` estaba DECLARADO Y SIN USAR.** La
    intención de fijar el reloj se escribió y nunca se cableó; una constante
    muerta es una promesa que nadie cumplió.
  - 🔴 **SEGUNDA BOMBA, desarmada al pasar**: el `vigente_hasta` del bloque de
    captura iba tecleado al **5-oct**. Pasaba por cuatro días de suerte; el 6-oct
    todo ese bloque se habría vuelto 400 «ya pasó», con la guarda de NUBE-1
    cazando al fixture en vez de al defecto.
  - ✅ **El arnés deja de CAERSE**: `af` ya atrapaba la excepción de la CONDICIÓN,
    pero el **mensaje** se armaba ANTES de llamarla, así que un `JSON.stringify`
    de algo nulo reventó fuera del try y dejó `[C]`, `[G]` y `[R]` sin medir. Hoy
    el mensaje también puede ser función y las lecturas en cadena van por
    `ver()`/`seg()`, que nunca lanzan.
  - ✅ **Los TRES estados de `regiaEl`, cada uno con su fila y por su NOMBRE.** La
    aserción vieja decía `estado !== 'vigente'` — y eso lo cumplen TRES estados
    distintos: un «no es A» no distingue entre B, C y D. `g2` muere AYER a
    propósito para que `vencida` tenga su fila.
  - 🔒 **CONTROL DEL INSTRUMENTO `[Z]`:** unas fechas relativas pueden ARREGLAR la
    medición o **TAPARLA** — si el padrón se mueve siempre con el reloj, un arnés
    que ya no mira la vigencia sale verde para siempre, y ese es el peor verde de
    todos. Así que se re-corre con el padrón **40 días atrás** y se EXIGE que la
    respuesta cambie. Más una aserción de que el padrón quedó RESTAURADO: sin
    ella el `finally` podría no servir de nada y nadie se enteraría.
  - ⚠️ **El verde que reporté al mergear NUBE-4 no se pudo reproducir**: hoy sale
    rojo contra los DOS lados de su propio merge. O no estaba verde entonces, o
    lo verifiqué de una forma que no volvió a reproducir. **No sé cuál de las dos
    y no lo adivino** — queda dicho así.
- 🏆 **CAREO-ZONA-1c (1-oct-2026): la baja deja SALDO 0.** Regla de Memo: el
  dinero de un cancelado es ganancia, no se reembolsa. La baja escribe
  `total_contrato = lo cobrado` en el MISMO PATCH que `boletos=0` y la zona.
  `mide:careo-zona-1` **87**, bloque `[1C]` con su control positivo.
  - 🔒 **ES `v.abonado` (previo + Σ abonos), NO `v.abonado_previo`.** El fixture
    los SEPARA a propósito: Diana Marlene lleva $5,500 de previo más un abono de
    $1,200 → cobrado **$6,700**, distinto de 5500 y de su contrato viejo 9200.
    Con `abonos_viajero` vacío —como estaba— la aserción pasaba IGUAL con la
    implementación equivocada: un fixture donde dos cantidades coinciden no
    distingue dos implementaciones.
  - Sin `|| null`: un cobrado de $0 es un NÚMERO (contrato a cero), no un hueco.
  - ⚠️ **Una aserción vieja metía «el dinero» en un solo saco** y prohíbe hoy lo
    correcto: `total_contrato` SÍ se mueve, `abonado`/`abonado_previo` NO. Se
    actualizó a la verdad nueva y la mitad que seguía siendo cierta quedó con
    dientes — no se silenció.
  - La nota cuenta las DOS escrituras («total $9,200 → $6,700 · saldo 0») y el
    reporte lleva `total_de`/`total_a`: una nota que menciona media escritura
    esconde la otra mitad, y un número pelado no se audita.

- 🏆 **CUATRO TUERCAS DEL 28-SEP EN MAIN LOCAL — ⏳ PENDIENTE `git push` DE MEMO**
  (el sandbox no tiene credenciales de GitHub; hasta el push, el sitio servido
  NO las trae). Las siembras de base SÍ ya viven. Merges: 6ca49aa · ee4c0ef ·
  e7a7494 · cd4fc96, cada careo re-anclado a su merge.
  - **DISPO-NORM-1** (`mide:dispo-norm-1`, 35✅) — LA PUERTA de zonas, firmada
    por Memo (opción A): compras, vendidos-fuera y altas de viajeros validan la
    zona contra la FICHA — desconocida se RECHAZA nombrando las de la ficha,
    mal escrita se guarda con la ortografía canónica y SE DICE, catálogo
    ilegible pasa tal cual Y CONFIESA. `_lib/zona-ficha` es el dueño (universo
    = zonas + cheapZonas + multifecha; 875 zonas, 0 colisiones, vigilante
    vivo). El montón `fuera` de `planear` empareja NORMALIZADO y la chatarra se
    canoniza en `correrCareo`: el mismo 28-sep el careo había propuesto
    DESHACER la alineación de esa mañana (crear «GENERAL», matar «General»).
    Holgura dicha: una llave vieja que YA existe en stock_ajustes («-»,
    «Seccion C») se puede seguir EDITANDO; lo que no puede es NACER otra.
  - **NUM-MULTIFECHA-1** (`mide:num-multifecha-1`, 13✅ + SQL con acta en
    `migraciones/NUM-MULTIFECHA-1.sql`, corrido por Jane) — medido en el bloque
    real de Corona: el libro pone el DÍA en la columna de ZONA con la fecha
    vacía, y la llave (nombre,fecha) fugaba los $1,000 del Domingo al careo del
    viernes. `mapearLibro` aprende el orden de herencia rotulada: fecha escrita
    > zona sembrada > ∅ (primera función). 7 mapeos sembrados (Corona
    Vie/Sab/Dom → #0/#1/#2 — inertes hasta el deploy—, alfredito, ironmaiden,
    frontera#0, caifanes#1). Ya cayeron EN VIVO por los ∅: +$7,200 Lizbeth
    (alfredito) y +$600 Itzamar (frontera#0), aplicados.
    ✅ **Las tres palabras de Memo llegaron (28-sep):**
    · «**EDC 2026**» del libro ES el evento pasado (feb-2026, pre-corte) — se
      queda SIN mapear; lo de edc27 vive bajo «EDC 2027 - 19,20,21 de febrero».
    · «**Cristian Nodal**» fue venta suelta de boletos, NUNCA hubo tour — sin
      ficha y sin mapeo A PROPÓSITO; sus $20,200 son del montón sin-mapeo que
      se nombra y no se toca.
    · «**Pablo**» y «**Toño**» de ironmaiden: boletos vendidos AL COSTO — ya
      están de alta (General A, 1 boleto c/u) con nota de total pendiente.
      ⏳ Falta el NÚMERO del costo para su `total_contrato` (ironmaiden no
      tiene compras cargadas todavía, así que el costo no se puede leer de
      ningún lado — lo dice Memo o entra al cargar el pedido en Kamisama).
  - **ITIN-NOBUS-1** (`mide:itin-nobus-1`, ⏳ primera corrida Playwright EN LA
    MAC: al sandbox le faltan libs de Chromium y no hay root; el acta interina
    vive en el propio script) — un CDMX `noBus` ya NO recibe la plantilla del
    transporte que no vende: vaiven decía «Central de Autobuses» y «Viaje en
    bus» contra su propia nota de «llega por tu cuenta». Tercer estado de
    CARD-ITIN-1 hasta tener itinerario propio (que gana arriba y reabre el
    card). ⚠️ Consecuencia medida y dicha: **coronacapital también** — su
    plantilla mentía igual. Verificado: BASE vivo en producción (la mentira,
    por la URL del cliente) + HEAD a nivel función; knotfest/emmanuel/propios
    byte a byte intactos.
  - **CAREO-RETRY-1** (`mide:careo-retry-1`, 20✅) — el bucle del careo global
    vivía DOS veces (Eventos y Resumen); hoy delegan en `khExcelRecorrer`
    (kamehouse.js), que ante un 5xx ENCOGE la tanda (10→5→2) reintentando el
    MISMO desde, y al final reintenta EN SERIE los errores transitorios de
    cosecha (NO_ES_JSON/SIN_RESPUESTA) por la puerta de un evento — SIN_MAPEO
    no se reintenta. Medido el 28-sep: 29/71 cosechas rebotadas por Google, 7
    tandas en 504, y las 29 recuperadas en serie. La idempotencia del
    reintento con confirmar la AFIRMA el careo (diferencia 0 → cero abonos).

- 🏆🔴 **ZONA-NORM-1 EN PROD (28-sep-2026, #775): el casamiento de zonas aprende
  acentos y mayúsculas.** Medido por Jane (25-sep): siete eventos tenían la
  misma zona escrita distinto. El stock casa por **cadena EXACTA**, así que esas
  filas restaban de una llave que NO EXISTE.
  `npm run mide:zona-norm-1` (**35**), cero SQL, y los **7 careos** que tocan
  estos libs en verde (boletos 15 · cuadre-total 151 · cuadre-6 46 ·
  cuadre-aplicar 108 · numerología 84 · cuadre-todo 59 · stock-vivo 22).

  **`_lib/normalizar-zona` es el dueño** (minúsculas + sin diacríticos **por su
  rango NFD** + espacios colapsados) y le preguntan: `disponiblesPorEvento` (las
  tres pasadas, vía `meter`), la búsqueda de zona de `resolverPrecioVenta` y el
  agrupado de boletos-por-zona de CUADRE-5. Y **`normalizarNombre` del careo
  PIDE la forma** en vez de repetirla: eran la misma escrita dos veces.
  🔴 **Y SU LECTOR, que es la mitad que no se puede olvidar:** el Map lo llavea
  lo CAPTURADO y `_disp` del aviso lo busca con la ortografía de la FICHA.
  **Normalizar un solo lado dejaría TODAS las zonas sin pedido** — el hoyo al
  revés y más grande.
  🔒 **Solo el CASAMIENTO**: lo guardado y lo pintado no se tocan. La ficha
  sigue siendo la ortografía canónica y el aviso dice SU nombre, con su aserción.

  **El precio, medido ANTES de cobrarlo:** si una ficha tuviera dos zonas
  DISTINTAS que normalizadas coincidan, esto las fundiría. Barrido del catálogo
  servido: **265 listas, 2 302 zonas, CERO colisiones**. 🔒 Con su **control
  positivo** —se le siembra el par «Vip»/«VIP» y el buscador lo caza, porque sin
  esa mitad «no hay colisiones» sería una ausencia sin instrumento— y
  **vigilante VIVO contra el árbol de trabajo**, porque es un hecho del catálogo
  que cambia con cualquier publicación y anclado a un commit nunca podría avisar.
  ⚠️ Y **no funde lo que SÍ es distinto**: «General» ≠ «General Viernes»,
  «Sección C» ≠ «Sección D», «VIP» ≠ «VIP Plus». Sin ese par, un normalizador
  que borrara de más pasaría todo lo demás. Y la zona inventada **sigue
  rehusándose**: normalizar no puede volverse «casar con lo que sea».

  🔴🔒 **LA LEY GRANDE DE ESTA TUERCA ES DE MEDICIÓN, Y ME LA COBRÓ JANE: DOS
  BARRIDOS CORRECTOS PUEDEN CONTESTAR PREGUNTAS DISTINTAS, Y REPORTAR UNO COMO
  SI FUERA EL OTRO MANDA A BUSCAR HOYOS QUE NO EXISTEN.**
  Yo conté «5 grupos en 4 eventos» de drift vivo. Ella no lo reprodujo, y
  exigió que reprodujera o lo retirara. **Reproduje: la consulta da los mismos 5
  grupos contra la base viva, tres días después.** Pero mi consulta agrupa por
  (evento, zona normalizada) sobre **lo CAPTURADO** — **capturado contra
  capturado** — y la de ella compara **capturado contra la FICHA**. Los dos son
  correctos; lo que estaba mal era presentar el mío como si contestara el suyo.
  **Medido renglón por renglón, la forma es SIEMPRE la misma en los cinco:**
  `compras` y `viajeros_evento` casan con la ficha **byte a byte**, y la
  ortografía desalineada vive **SOLO en `stock_ajustes`**.

  🔴 **Y ESO CAMBIÓ EL SÍNTOMA, que es lo que de verdad importaba.** Mi fixture
  puso la ortografía rara en `compras` y la buena en `viajeros` —**al revés de
  la realidad**— y demostraba una «sobreventa» que en producción NO ocurre: **el
  resultado correcto por la razón equivocada**, otra vez. La forma real, con los
  números de `ultramexico` (compras «General» 20 · viajeros «General» 2 ·
  ajustes «**GENERAL**» 2):

      BASE: [["General",18],["GENERAL",-2]]   ← la llave FANTASMA
      HEAD: [["general",16]]                    ← 20 − 2 − 2

  O sea que **BASE contaba de MÁS, no de menos**: el `vendidos_fuera` se perdía
  en una llave que nadie consulta y la zona parecía tener **18** cuando tenía
  **16**. Y con la verdad en cero, **el aviso se queda CALLADO** sobre una zona
  agotada — ése es el dinero.
  ⚠️ **Corolario del método:** la fuente del drift es `stock_ajustes`, no las
  pestañas de compras. Un censo de «zonas desalineadas» tiene que decir **contra
  qué** las compara, o los dos barridos parecen contradecirse cuando no lo están.

  ⏳ **DOS HALLAZGOS DE JANE, ANOTADOS Y AJENOS A ESTA TUERCA:** «**Zona
  Doritos**» en alfredito era una PALABRA de más (no un acento) y **ella ya la
  corrigió en la base** — el normalizador no la habría casado, y **no debe**. Y
  «**Sección C**» de `hilary` está **vendida y comprada sin existir en la ficha**:
  es un hoyo de FICHA y **espera palabra de Memo**.
  ⏳ **Y `_lib/disponibilidad`** (el `stockPorZona` del endpoint público, el chip
  «¡Últimos 3!» del index) **también casa por cadena exacta** y NO estaba en el
  encargo: es tuerca propia, con su propia medición de qué ve el cliente.


- 🏆🔴 **CUADRE-6 EN PROD (25-sep-2026, #774): el careo aprende la columna
  «Avión - Bus» y la exclusión de CDMX ENCOGE.** Regla de Memo (24-sep):
  «hay una columna de vuelos en el Excel con el costo; intentemos cuadrar con
  eso». `npm run mide:cuadre-6` (**46**) · `mide:cuadre-total` (**151**, eran
  150), **cero SQL**, y la fase sigue **SOLO LEYENDO**.

  **La columna, medida por Jane sobre 4 pestañas de CDMX servidas por el
  cosechador real:** el literal es **«Avión - Bus»**, vive en la **fila 10** y la
  columna **VARÍA** — **19** en EDC/Corona, **20** en Bruno/Knotfest. Se busca
  **por el literal, jamás por índice**, igual que `Total` desde CUADRE-1a. Se
  captura **por persona, sumando entre las filas del grupo**, con el mismo
  candado del hueco que el total — **una celda vacía no es un vuelo de cero** —
  y **fuera de `mapa.dinero`**, donde viven las columnas que se suman para el
  abonado.
  ⚠️ **No confundir con el bloque de costos del evento** (fila 4, col ~30:
  «Vuelos/Kits/Boletos/Van/Hotel…»): ése es el gasto TOTAL del evento.

  🔒 **LA MEDICIÓN QUE HIZO SEGURA LA SUMA, y sin ella habría sido doble
  conteo:** el dueño (`resolverPrecioVenta`) **NO mete el transporte** en el
  total de un evento de CDMX — medido sobre `edc27`: PLUS total **9100** =
  `zonaP` 9100 con **`transportCost: 0`**. O sea que el vuelo **COMPLETA** el
  total en vez de duplicarlo. Eso es justo lo que CUADRE-5 no podía saber.

  🔴 **UN CASO QUE EL ENCARGO NO ACOTABA: el RIDE.** Es «con transporte—
  tal como dice la regla— pero **su total del sistema YA ES ese transporte**
  (`edc27` RIDE: total **2900** con **`zonaP: 0`**). Sumarle el vuelo contaría
  el transporte **DOS VECES**. Así que el vuelo completa **solo cuando el total
  del dueño va sobre un BOLETO**, y eso **se le pregunta a su desglose**
  (`zonaP > 0`) — **no se adivina por el nombre del paquete**. El renglón entra
  al montón (trae su vuelo) y el **runner** se rehúsa a componerlo *diciendo por
  qué*: mejor que dejarlo en el montón de diferencias.

  🔴 **Y UN HUECO PRE-EXISTENTE QUE ESE CASO DESTAPÓ: un motivo sin su
  ausencia NO SE VE.** La pantalla pinta el motivo de un renglón pendiente
  **solo si `sistema_total` es `null`**; cuando la base trae `total_contrato =
  0` —que también es «pendiente»— el cero se quedaba y el renglón decía
  **«$0 de la base»**, tragándose la explicación. **Ya mordía a CUADRE-5** en su
  caso de «N boletos en M zonas». Hoy los **tres** caminos que dejan motivo
  ponen `sistema_total = null`: **un cero es una afirmación, y aquí la verdad es
  una AUSENCIA.**

  **La regla encoge, y no de más.** CDMX + paquete con transporte + `$0`:
  **entra** si trae vuelo > 0 · **fuera** si el vuelo viene en `$0` TECLEADO ·
  **fuera** si la celda está vacía — y los dos «fuera» con **motivos
  distintos**. ⚠️ En un paquete con avión, «cero» no se distingue de «no
  capturado» ni de «todavía no compra vuelo»: **eso solo lo afirma quien
  captura**. El total se rotula **«del catálogo vivo + vuelo de pestaña $X»**,
  con las dos patas viajando por separado para que nadie tenga que restar.

  **El careo:** control positivo del INSTRUMENTO con los **tres montos reales de
  Knotfest** ($4,900 · $3,385 · $2,500) — si encuentra cero, el problema es el
  arnés · la columna probada en **los DOS moldes** (19 y 20), porque si los dos
  dieran el mismo número un índice fijo pasaría · `fuera_otro` sigue en **0** y
  las clases **PARTEN** el montón · la puerta `para_careo` sigue con **dos**
  clientes (los otros cinco llamadores cotizan VENTA) · **cero escrituras con
  control positivo** · y anclado a dos commits.
  🔒 **LA SUMA NO SE RE-IMPLEMENTA EN EL ARNÉS:** le pregunta al dueño **por
  separado**, lee el vuelo de la **celda SERVIDA** por su literal, y carea las
  dos patas contra lo que el runner imprimió. Si el arnés repitiera la cuenta
  del runner, los dos podrían estar igual de equivocados.

  ⚠️ **TRES ROJOS MÍOS, LOS TRES DEL INSTRUMENTO.** (1) **La base de mentira
  INVENTÓ NOMBRES**: sembré `excel_mapeos` con `activo` y el runner consulta
  **`excel_pestanas`** con **`activa`** — `SIN_MAPEO`, el arnés se cayó y
  reportó **7 rojos que no eran del código**. (2) **Leí de memoria la forma de
  la respuesta**: el handler **esparce** los montones al tope (`...r`), no bajo
  `montones`, y de las personas devuelve **solo el conteo** — 28 rojos con el
  código sano. (3) **Mi fixture dejó el Total VACÍO** en la segunda fila del
  grupo, y eso vuelve `total: null` a la persona ENTERA, así que `carear` la
  saltaba y nunca llegaba al montón.
  ⏳ **Y el careo de CUADRE-5 se actualizó a la verdad nueva:** su testigo
  mutaba `fuera_cdmx` y el chip ya no lo pinta de una pieza, así que el testigo
  **se movió** a los dos contadores nuevos con su razón escrita. El contador
  viejo sobrevive como su **SUMA**, para que nada se quede mudo. **No se
  silenció.**


- 🏆 **ITIN-ARRIBA-1 EN PROD (25-sep-2026, #773): el itinerario se muda ARRIBA
  del paso 1.** Orden de Memo: **el cliente antoja el viaje primero y cotiza
  después**. `npm run mide:itin-arriba-1` (**34**), cero SQL, **una mudanza**.
  Políticas no se toca: sigue al fondo, empujándose conforme el wizard crece.
  🔒 **SE MUDÓ EL BLOQUE, NO SE RE-ESCRIBIÓ**, y el careo lo carea por **sha1**
  (`6a1a0ddf57de` en los dos lados) más la aserción de que aparece **una sola
  vez** — una mudanza mal hecha lo deja duplicado y el segundo, oculto, no
  estorba hasta que estorba.
  🔒 **«ARRIBA» SE MIDE EN PÍXELES, NO EN EL MARKUP** (el ALTO no es el DÓNDE):
  390px itin@543→388 contra viaj@388→535, y lo mismo en 1350px. El markup puede
  estar bien y el CSS ponerlo abajo igual. El **orden del DOM** se lo contesta el
  navegador (`compareDocumentPosition`), no un `indexOf` sobre el archivo.
  🔒 **La secuencia de la guía se AFIRMA, no se supone:** CARD-GUIA-1 recorre
  `[data-guia]` en orden de DOCUMENTO y el card del itinerario no lleva ese
  atributo — careada byte a byte contra BASE, con candado de cardinalidad. Y el
  **tercer estado** (bahidora, sin plantilla) sigue apagado en los dos lados.
  ⚠️ `mide:card-itin` **no asumía la posición vieja** — medido: mide por id y por
  cadena de visibilidad, y `compareDocumentPosition`/`previousElementSibling`/
  `.top` aparecen **0 veces**. No se cambió nada ahí, y queda dicho.

- 🏆🔴 **CALLEJON-CDMX-1 EN PROD (25-sep-2026, #772): la pre-selección YA
  confirmaba sola — un renglón que corría después la deshacía.** Firmado por
  Memo: «arréglenlo». `npm run mide:callejon-cdmx-1` (**35**), cero SQL,
  **un renglón que se mueve de sitio**.

  **Medido por la puerta del cliente en 390×844, y el PAR decidió el arreglo:**
  en `edc27` (CDMX) tras elegir zona el transporte seguía **oculto** y el total
  salía **vacío**; en `frontera` (MTY) el mismo flujo daba **$8,300**. O sea que
  `selH` ya quedaba puesto y el flujo se cerraba solo — lo roto era otra cosa.

  **La causa:** `buildHotelButtons` pre-marca «Compartida» con un **clic de
  verdad**, así que `selHotel` corre y en CDMX **MUESTRA** el paso del
  transporte; un renglón más abajo `selPaquete` se lo volvía a esconder.
  🔴 **Fuera de CDMX la rama `else` de `selHotel` TAMBIÉN lo esconde, así que
  ese renglón era un no-op: el defecto vivía en el único camino donde no lo
  era.** Por eso nadie lo había visto en Monterrey.
  🔒 **Y la rama de al lado ya tenía el orden bueno:** el camino `diaFirst` de
  **esta misma función** esconde el transporte ANTES del `if(hasHotel)`. El
  arreglo es la **simetría de la función consigo misma** — y la rama que estaba
  bien es la que **0 de 117 eventos alcanzan**.
  🔒 **No se quitó la pre-marca**: el otro arreglo posible (nacer sin marcar)
  le habría **cobrado un clic a todo el país** para arreglar un orden de líneas.
  Y ese default **cabe en DEFAULTS-1**: no es atribución —es la opción de `e:0`,
  la más barata, no puede inflar la cotización— y va **ANUNCIADO**.
  ⚰️ **La frase `data-guia-confirma` de CARD-GUIA se RETIRÓ** del card del hotel:
  existía por este callejón y hoy mentiría. 🔒 El lector se queda como
  **MECANISMO y no como promesa**, y la diferencia es que el careo **le siembra
  el atributo** y exige que la frase salga.

  🔴 **TRES ROJOS MÍOS, LOS TRES DEL INSTRUMENTO — y el tercero es una cara
  NUEVA de una ley vieja.** (1) `'// Normal flow'` como ancla casa **primero**
  con el comentario de `selFecha`: **un prefijo no es un ancla**, hoy corta por
  balance de llaves. (2) Sembré el atributo en una página recién abierta, donde
  el paso está **sin contestar**, así que esa rama nunca corría. (3) 🔒 **LA
  ASERCIÓN QUE SE CAZA SOLA, PERO DE UNA POSICIÓN, NO DE UNA AUSENCIA:** el
  `buildHotelButtons()` que el careo encontraba *antes* del `display='none'`
  vivía **dentro del comentario que explica el arreglo**. El comentario que dice
  dónde estaba algo lo NOMBRA, y lo nombra antes. **Los comentarios fuera antes
  de medir posiciones**, no solo antes de asertar ausencias.

- 🏆🔴 **FEST-SEP-1 EN PROD (25-sep-2026, #768): el separo del festival tiene UN
  dueño.** Regla firmada de Memo (23-sep): «yo elijo el separo», igual que en
  todos los eventos. `npm run mide:fest-sep-1` (**45**), cero SQL, y **cero
  bytes publicados cambian hoy** — las 4 fichas con objeto `festival`
  (bahidora, edc27, palnorte, vivelatino) traen `sep=500` y **CERO paquetes**,
  careadas byte a byte.

  `generarObjFestival` concatenaba **`sepSeg` sin declararlo** → `ReferenceError`
  antes de emitir un byte. 🔴 **Y dos líneas antes tenía un `sepN` con default
  500 que NADIE leía: el fósil de la regla que ESF-E1g derogó** («antes caía a
  500 cuando faltaba, y eso no era un default: era una AFIRMACIÓN»). Las **dos
  caras del mismo hueco**: la regla buena sin llamador y la vieja sin lector.
  Hoy `sepSeg(esfera)` es dueño top-level y los dos caminos le preguntan.

  🔴 **LA TERCERA CARA DEL ANCLA, y es la lección grande:** el encargo decía
  que el **testigo** de `mide:card-itin` se pondría rojo con el arreglo.
  **Medido: no se pone.** Ese careo lee el árbol de `HEAD_SHA`, así que con el
  arreglo ya commiteado siguió en **69 verdes** imprimiendo «sepSeg is not
  defined». **Un testigo anclado a un commit no puede atestiguar un arreglo
  posterior**: se habría quedado verde para siempre afirmando un defecto que ya
  no existe, y **el verde caducado no avisa**. Se relevó A MANO — *un testigo de
  un defecto AJENO se re-ancla EN la tuerca que lo arregla*. 69 → **71**.
  ⚠️ **Y la ausencia no se consigue dejando de nombrar la llave:** mi ficha base
  traía `sep: 500`, así que el caso «ausente» se escribía omitiéndolo del
  `extra`… y `Object.assign` lo reintroducía: salía `,sep:500` **rotulado
  «ausente»**. Dos rojos, los dos míos.
  ⚠️ **Verificado por Jane y cerrado:** el caso `sep=vacío → sep:0` de la matriz
  **no puede ocurrir en producción** — `esferas_eventos.sep` es `integer`, una
  cadena vacía no cabe. Se queda en el careo como caso teórico de la simetría.

- 🔴🔒 **LEY DEL MERGE, en su forma final (pagada tres veces esta semana): el
  choque de `scripts` del `package.json` se resuelve por UNIÓN SIN REPETIR, y la
  llave se saca con REGEX de la cadena entrecomillada — NO con `split(':')`.**
  Las tres caras:
  - **Conservar los dos lados deja la primera línea SIN COMA.** Eso sí revienta,
    pero **no avisa** hasta que alguien corre npm.
  - **En una PR APILADA, concatenar duplica llaves**: la rama de arriba ya trae
    los renglones de la de abajo. `mide:nube-4` quedó **dos veces** en la #771 —
    JSON válido (la última gana), npm funciona, **cero errores**: una trampa
    latente que el siguiente merge lee como intencional.
  - 🔴 **Y el separador vive DENTRO del dato:** estas llaves llevan dos puntos
    (`"mide:nube-4"`), así que partir por `:` las colapsa **todas** en `"mide` y
    sobrevive una sola. Mi resolvedor se lo comió todo y lo cazó el `node -e`
    que exige las llaves esperadas. **Todo resolvedor de este choque termina en
    dos comprobaciones: que el JSON PARSEA y que hay CERO llaves duplicadas en
    el texto crudo** — la segunda no la ve `JSON.parse`.


- 🏆🔴 **DESDE-PAQ-1 EN PROD (24-sep-2026, #769): el «desde» de cada paquete tiene
  UN dueño — y eran CINCO sitios, uno muerto.** Reporte de Memo con capturas:
  la tarjeta pintaba PLUS «desde $4,100» y CHEAP «desde $5,200» —el todo
  incluido más barato que el boleto solo— cuando el CHEAP real de 1 día son
  **$2,400**. `npm run mide:desde-paq-1` (**41**), cero SQL.

  **La causa: universos distintos.** El PLUS recorría la lista global MÁS las de
  cada fecha; el CHEAP leía **solo la global**, que en edc27 trae el precio de
  los 3 días. `desdeDelPaquete(ev, paquete)` es hoy el dueño: global + todas las
  fechas, filtrando `ag` **y `prox`** igual para los dos. PLUS entra por `minP`
  (su puerta, 5 llamadores), CHEAP y RIDE preguntan, y **STAY se sirve de la
  respuesta de PLUS** porque vende el MISMO boleto sin transporte — más fuerte
  que darle un universo gemelo. El hotel NO entra: depende de cuánta gente
  viaja, que es estado de la pantalla.
  ⚠️ **`prox` se filtraba solo en el PLUS**: una zona CHEAP con precio aún sin
  publicar podía ganar el mínimo y anunciar un número que nadie puede comprar.

  🔴 **EL ENCARGO DECÍA «DOS CAMINOS» Y ERAN CINCO, uno MUERTO.**
  `getPaquetes(ev)` tenía **CERO llamadores**, leía solo `ev.zonas` sin `prox`, y
  su `priceLabel` del CHEAP pintaba **el mínimo del PLUS** — el defecto de esta
  tuerca escrito a mano. **Unificar ahí no habría cambiado un píxel y se habría
  reportado como arreglo**: la trampa de «dos objetos con el mismo papel». Se
  podó, y es la lección de FEST-SEP-1 otra vez: **una regla vieja SIN LECTOR es
  la mitad del hoyo**.
  🔴 **Y el otro «camino» es INALCANZABLE: `diaFirst` lo traen 0 de 117
  eventos.** Se dejó intacto —cambiar lo que no se puede medir es peor— con un
  **vigilante VIVO** contra el árbol de TRABAJO, no contra el archivado: mide un
  hecho del catálogo de hoy, y puesto contra un commit nunca podría avisar.

  🔴 **EL ROJO QUE CASI MERGEO:** mi primer dueño se comió la cola de
  RIDE-VIVO-1 —un `rideOnly` sin zonas SÍ tiene precio— y **`bts` y `straykids`
  caían de $2,900 a $0 en la tarjeta del catálogo**, porque `minP` es quien la
  pinta. Lo cazó el barrido, no leer el diff.

  🔒 **LAS COMPUERTAS QUE DECIDEN SI EL NÚMERO SE PINTA VAN COPIADAS DEL ORDEN
  REAL.** Sin ellas el barrido mide *fórmulas*: salían **cuatro** violaciones de
  la invariante y dos eran de `fanfest-*`, que son `rideOnly` y **no pintan
  ninguno** de los dos números. Con las compuertas puestas, **en BASE hay
  exactamente 1 evento violando con la ficha abierta, y es el de Memo** (`harry`
  también violaba, pero está agotado y su ficha no abre). Se mueve el CHEAP en
  DOS eventos (edc27 5200→2400 · harry 5000→2600) y el PLUS en NINGUNO.
  ⚠️ **Y un rojo del arnés:** leía los `pp-*` recién abierta la ficha y dio
  **cuatro rojos sobre código sano, BASE incluido** — `updatePkgCards` solo la
  llama `selViajeros`, así que hasta que el cliente elige cuántos viajan los
  cuatro letreros dicen «—». Es ROL-MONTO-MUDO: **saltarse un paso del wizard
  mide una pantalla que ningún cliente ve.**
  ⚠️ **Y la condición de merge de Jane, que vale para todo careo de clic: el
  overlay del onboarding se abre 300 ms después con `z-index:9999`, y mi clic le
  GANABA LA CARRERA en mi máquina** — verde por suerte aquí, `TimeoutError` en
  la de ella. Se cierra como lo cierra el cliente (`skipOnboarding`) y **se
  espera a que el overlay DEJE DE TAPAR, por condición y no por reloj**. Más la
  aserción de que **el onboarding siga saliendo**: si deja de salir, el careo
  seguiría verde sin él y ese popup es de Memo.

- 🏆🔴 **NUBE-4 + NUBE-5 EN PROD (24-sep-2026, #770 y #771): la cotización de
  transporte es POR EVENTO, con horarios, y cada ficha de CDMX pinta su card.**
  `npm run mide:nube-4` (**68**) · `mide:nube-5` (**35**). **SQL corrido por Jane
  con acta** (`migraciones/NUBE-4.sql`).

  **La forma del dato:** `evento_id text NULL` —y **NULL significa «GENERAL CDMX
  (todos)»**, no un hueco— más `horarios text` (aerolínea, hora de salida y
  regreso). **Los horarios viajan CON la cotización, así que su historial sale
  GRATIS**: cada captura es una fila nueva y la fila lleva los suyos.
  Medido antes del acta: **1 trigger (UPDATE+DELETE, no INSERT)** y **0 filas** —
  nadie había capturado, así que el ALTER no tuvo que decidir qué eran las filas
  viejas. Y `text` sin FK: el catálogo público no vive en la base, es el `var
  EV` del index y ahí la llave es el **slug**.

  🔒 **LA RESOLUCIÓN ES HERENCIA ROTULADA (la forma de ROL-HIST-PADRE):** la
  cotización DEL EVENTO manda → sin ella la GENERAL → sin ninguna, WhatsApp; y
  **`heredado:true` VIAJA**, porque un precio general presentado como el del
  evento es un dato bueno con la etiqueta equivocada. **Lo específico gana
  AUNQUE la general sea MÁS NUEVA** — el padrón del careo lo pone al revés a
  propósito. Y `heredado` **solo puede ser true cuando se preguntó por un
  evento**: en la consulta general no hay de quién heredar.

  🔴 **UN DEFECTO MÍO DE FORMA:** hice `regiaEl` **recursiva sobre sí misma** y
  la llamada interna le pasaba el evento en un **quinto argumento que nadie
  lee** — `eventoId` quedaba en null y **las filas propias del evento nunca se
  habrían consultado**. Hoy hay núcleo (`_regiaEnLlave`) y cascada (`regiaEl`)
  separados: **un dueño con dos trabajos se confunde consigo mismo.**

  🔒 **EL CANDADO BYTE-A-BYTE DE NUBE-3, RE-FORMADO — y Jane firmó que ésta es
  la forma correcta.** Ese careo exigía que `_lib/nube.js` fuera idéntico al de
  BASE, porque «la forma fácil de romper *pregúntale al dueño* es cambiarle la
  respuesta al dueño». **Aquí el dueño cambió DE VERDAD, con todos sus
  bebedores en la MISMA tuerca**, así que el candado no puede ser la igualdad:
  es **el arnés que se actualiza a la verdad nueva, no se re-ancla al pasado**.
  Hoy exige que **nadie resuelva la herencia por su cuenta** (ni arme su propio
  `evento_id=is.null`, ni DECIDA el `heredado`, ni el navegador resuelva) y que
  **la cascada se escriba en un sitio por pregunta**.
  ⚠️ **No se puso rojo solo** (está anclado a su par de commits, la lección de
  FEST-SEP-1): se anotó a mano, y Jane dio por bueno que eso era lo honesto.

  **La pluma: UN selector, TRES voces** (el patrón de FLUJO-UX-4) — el mismo
  control filtra lo que se lista, manda sobre lo que se guarda y atribuye la
  consulta. Tres selectores habrían sido tres listas del mismo dato, y peor: **se
  podría estar mirando el precio de un evento y capturando el de otro.**
  🔒 **Nace vacío (DEFAULTS-1) y el guardado lo exige, porque es una
  ATRIBUCIÓN. Y son TRES valores, no dos:** `''` es «todavía no elegí» y
  `__general__` es «**elegí** la general» — aplastarlos haría que no elegir se
  guardara como cotización general, que rige para todos.
  🔒 **La lista de eventos se DERIVA** (los CDMX vivos que usan el paso del
  transporte, por la regla de `isCDMX` + `nubeVueloIncluido`): hoy **18**. `noBus`
  SÍ entra —sigue usando el paso, con avión solamente—; el que ya incluye el
  vuelo no, o se le vendería dos veces. Y si el catálogo no se puede leer **se
  DICE (502)**: una lista vacía se leería como «no hay eventos de CDMX».
  🔒 **El evento se valida en la PUERTA:** un slug mal escrito crearía una fila
  huérfana que no rige para nadie con la pantalla diciendo «ya coticé».

  **La Nube se mudó al listado principal, junto a Esferas.** Sin estrenar
  permiso, medido: `PERMISOS_TABS` **byte a byte el de BASE** y el barrido del
  menú **deriva** de `[id^="page-"]` filtrando por `nav-<id>`.
  🔴 **El Radar llamaba a `showHerramienta('nube')`** y su «Ir a resolver →»
  habría llevado a una **pantalla en blanco**: la ley de «quitar del menú no es
  quitar un botón».
  ⚠️ **Consecuencia medida y dicha: a bulma y milk se les apaga el desplegable
  de Herramientas**, porque su visibilidad también se deriva y la Nube era la
  única que tenían. Es correcto — ya no es una herramienta.

  **NUBE-5, el card «Cómo llegar»** en la ficha de cada evento de CDMX: los dos
  modos con su precio vigente, sus **horarios**, y **«tarifa general CDMX»**
  cuando es heredada (el cliente no necesita la palabra «heredado»: necesita
  saber que no es una tarifa negociada para su fecha).
  🔴 **Y AHÍ SALIÓ EL DEFECTO GORDO: el estado era GLOBAL.** `window.__nube`
  era un solo cajón, así que abrir `edc27` y luego `knotfest` en la misma visita
  **le pintaba al segundo el precio del primero**. Es el bug de `cheapBtn`
  (NOCHEAP-1) y de `rideBtn` (CAT-AGOT-1) —los globales que la pantalla reusa—
  **ahora con un PRECIO, que es peor: un letrero mal heredado se ve; un precio de
  otro evento se paga.** Hoy está llaveado por slug, y el repintado comprueba que
  el cliente siga en ese evento antes de pintar.
  **Los candados de NUBE-2, todos:** la vigencia se re-verifica **donde se
  pinta** (el CDN puede servir una respuesta de hasta UNA HORA) · **fail-soft por
  modo** —sin precio ese modo ofrece el WhatsApp y no inventa— · la frontera de
  los 15 días **también aquí** (pintar un precio que el cotizador se rehúsa a
  vender sería el card contradiciendo al embudo) · función DECLARADA por la ley
  del hoisting · y **si ningún modo tiene precio, el card se esconde**.
  **El cotizador NO se tocó:** `calcular()` (20 011 bytes) y `selTransporteBtn()`
  careados **byte a byte**, cortados por balance de llaves.
  **El renglón del Radar aprendió la cobertura:** cuántos eventos vivos se quedan
  sin precio propio ni heredado, por modo y **con NOMBRES** — «3 eventos» manda a
  buscar, «edc27, knotfest y flowfest» se resuelve — y **se calla cuando no hay
  nada que decir**. La pregunta se le hace al dueño evento por evento,
  **memoizando el LECTOR**: cachear una lectura no es re-implementar una regla.

  🔴 **LEY NUEVA DEL MERGE, pagada en la #771: en una PR APILADA el
  `package.json` no se resuelve «conservando los dos lados» — se conserva la
  **UNIÓN SIN REPETIR**.** La rama de arriba ya trae los renglones de la de
  abajo, así que concatenar dejó `mide:nube-4` **dos veces**: JSON válido (la
  última gana), npm funciona, **cero errores** — una trampa latente que el
  siguiente merge lee como intencional. Y la otra cara ya conocida: conservar los
  dos lados deja la primera línea **sin coma**, y eso sí revienta, pero tampoco
  avisa hasta que alguien corre npm.

  ⚠️ **`vigia:color` sigue 🔴 y NO se le movió la base:** hoy da js **1026** ·
  html **202** contra la base `cd251cc` de 888/187. Medido por archivo:
  `kamehouse-nube.js` tiene **29 aciertos, 28 `var(--x)` y CERO literales**, o sea
  que lo que crece es **el sistema de temas funcionando**, no deuda — y
  `vigia:color-literal`, **que es el medidor de la serie COLOR**, sigue 🟢 **sin
  crecimiento**. Mover la base habría bendecido los 71 sin triar de otros.


- 🏆🔴 **SERIE NUBE VOLADORA COMPLETA EN PROD (23-sep-2026, #762 · #763 · #764):
  el transporte a CDMX se cotiza cada lunes y el sitio lo BEBE.** El `2500`
  tecleado del bus murió y el avión pasó de link de WhatsApp a paquete
  **vendible**. `npm run mide:nube-1` (**91**) · `nube-2` (**47**) · `nube-3`
  (**46**). **SQL corrido por Jane ANTES del merge** — el endpoint jamás pisó
  producción sin su tabla, porque su fail-soft («no hay precio») se ve
  EXACTAMENTE igual que «nadie cotizó esta semana»: el hueco se habría
  escondido detrás de su propia red.

  **La forma del dato:** `nube_cotizaciones` es **INSERT-ONLY con trigger** (el
  molde de `giveaway_rondas_inmutables`) y **la tabla ES el historial**: una
  captura nueva es una fila nueva, jamás un UPDATE — y el trigger prohíbe
  también el DELETE. RLS deny-all. ⚠️ **El acta dice el número que la base
  contesta:** `pg_trigger` cuenta **1**, no 2 — es UN trigger con DOS eventos
  (update y delete) y **no cubre INSERT**, porque la tabla es insert-only, no
  read-only. Un acta que no reproduce lo que la consulta contesta manda a
  buscar un hueco que no existe.

  🔒 **`_lib/nube` ES EL DUEÑO de dos preguntas** —«cuál rige ahora» y «cuál
  regía el día X»— y ninguna se re-implementa: «qué precio rige» contestado en
  dos sitios acaba contestándose distinto, y aquí el que pregunta es el que
  resuelve una disputa de dinero. Sus funciones **reciben el instante** en vez
  de llamar a `Date.now()`, justo para poder medirse en la frontera de una
  vigencia.

  🔒 **LA CICATRIZ DE OMAR COURTZ, CERRADA POR DELANTE.** `regiaEl` distingue
  TRES estados —vigente ese día · vencida ese día · **ANTERIOR AL NACIMIENTO**—
  y el nacimiento es la **vigencia más antigua**, no la fila más vieja por
  `creado_en`: alguien puede capturar hoy una vigencia que arrancó la semana
  pasada, y leerlo mal dejaría ese día «antes de nacer». La pantalla lo ROTULA
  con palabras: «no es que no cambiara de precio — es que no había ninguno».

  🔴 **TRES DEFECTOS QUE CAZÓ EL CAREO, ninguno visible leyendo:**
  - **La CACHÉ podía vender lo vencido.** El navegador confiaba en que el
    endpoint filtra, y la respuesta va por CDN con **`stale-while-revalidate=3600`**:
    puede llegar **hasta una hora vieja**. Una cotización que vence el domingo
    23:59 llegaría como vigente el lunes a las 00:30 **desde nuestra propia
    caché** y se venderÍa. 🔒 **Quien pinta el precio es el último que puede
    comprobarlo, así que lo comprueba** — y el filtro de la fuente se queda:
    son dos candados sobre el mismo hecho y ninguno sobra, porque el de la
    fuente no ve el reloj del cliente ni la edad de la caché.
  - **`vigentes()` se tragaba el error**: un 5xx salía como «no hay cotización»
    con `ok:true`, borrando la diferencia entre «no hay fila» y «NO PUDE LEER».
    Hoy sube, y el endpoint contesta `ok:false` con `no-store`.
  - **`capturado_por` leía campos inventados** (`nombre || email`) cuando el
    payload de `verify-admin` trae **`correo`**: habría caído al uuid EN
    SILENCIO, justo en el campo que existe para saber quién capturó.

  🔴 **EL HUSO SE DERIVA, NO SE TECLEA — y la cadencia SEMANAL es la que lo
  obliga.** `ESF_FLASH_TZ` es un `-05:00` a mano, y medido: el domingo
  **1-nov-2026** Reynosa ya va en **−06:00**, así que la cotización capturada el
  lunes 26-oct habría vencido **UNA HORA ANTES** de lo que dice la pantalla, y
  así todos los domingos del invierno. La hora de pared se resuelve
  **preguntándole al huso**: se prueban los dos y se queda el que REPRODUCE la
  pared pedida.

  🔴 **Y EL `cur.id==='arre'` CABLEADO SE FUE.** Un id a mano es un letrero que
  se pudre: el día que entre otro evento con vuelo incluido, el sitio le
  **vende el vuelo DOS VECES** (una en el paquete y otra en el transporte).
  Hoy la regla se DERIVA del «qué incluye» y —medido sobre los 116 eventos—
  devuelve **exactamente `['arre']`, evento por evento**: no cambia nada hoy y
  cierra el hoyo de mañana.

  **Lo demás que vive en prod:** la frontera de los **15 días aplica a los DOS
  modos** (bus al 8119771072, avión al 8132321405) · **fail-soft POR MODO** —bus
  vigente con avión vencido vende el bus— · la pantalla de Bulma y Milk como
  **herramienta** (no se estrenó tab ni permiso) con DEFAULTS-1 y su excepción
  escrita (el modo nace vacío porque es una ATRIBUCIÓN; la vigencia trae default
  porque es una FORMA y va **anunciada**) · y el **renglón del Radar** que se
  deriva, **se calla cuando los dos modos están vigentes** —un aviso permanente
  se vuelve parte del mueble y deja de avisar— y dice la CONSECUENCIA.
  🔒 Ese renglón vive **fuera** de la lista de alertas: ésas son filas
  GUARDADAS con su id y su «vista», y darle un id falso habría sido peor que no
  tenerlo.

  🔒 **LEY NUEVA, Y ES LA MÁS FINA DE LA SERIE: LA FORMA FÁCIL DE ROMPER
  «PREGÚNTALE AL DUEÑO» NO ES RE-IMPLEMENTAR LA PREGUNTA — ES CAMBIARLE LA
  RESPUESTA AL DUEÑO** para que encaje con la pantalla nueva. Eso deja a la
  pantalla contenta y a quien ya bebía del mismo lib contestando otra cosa. El
  careo de NUBE-3 lo vuelve candado: exige que **`_lib/nube.js` sea BYTE A BYTE
  el de BASE**. Vale para cualquier tuerca que «le pregunte» a un lib existente.

  🔒 **Y DOS COSAS DEL MÉTODO que se pagaron en esta serie:**
  - **El reloj se congela DENTRO del navegador**, y no basta `Date.now`: el
    sitio hace `new Date()`. Va un proxy que sigue siendo `Date` para todo lo
    demás (`parse`, `UTC`, los constructores con argumentos).
  - **No siempre existe UN instante donde todos los casos sean reales.** Medido:
    los eventos de CDMX con `noBus` son de octubre y noviembre, y los que quedan
    a ≤15 días caen en diciembre — cuando uno está cerca, el otro ya pasó. El
    careo usa **dos relojes**, cada uno con su razón escrita y **su premisa
    afirmada**. (Mi primera versión eligió el evento «de cerca» a ojo y estaba a
    **191 días**.)
  ⚠️ Y un recordatorio caro: **el «antes» de una Δ tiene que ser el estado que
  aísla el término que se mide.** Leí el total antes de elegir cualquier
  transporte y valía **0** —`calcular()` se sale temprano—, así que la Δ era el
  total ENTERO. El «antes» bueno es «Sin transporte».
  ⚠️ Y **una aserción que no puede fallar no es una aserción**: puse un
  `af(true, 'ancla')` que además inflaba la cuenta de verdes. El control de la
  vencida se mide **en par**, exigiendo que los dos brazos difieran.

  ⏳ **ANOTADO SIN HACER, con palabra de Memo pendiente:** ahora que la nube
  vive, la exclusión «CDMX con transporte» de **CUADRE-5** podría **encogerse**
  —el index ya sabe el vuelo—. Es tuerca propia y no se cuela.

- 🏆🔴 **NOCHEAP-1 EN PROD (23-sep-2026, #765): la bandera que no apagaba nada — el
  index aprende `noCheap` y OCULTA el paquete.** Decisión de Memo con los
  botones RENDERIZADOS delante. `npm run mide:nocheap-1` (**25**), cero SQL.
  **TRES LETREROS PARA TRES HECHOS:** OCULTO = «este evento no vende CHEAP» ·
  «No disponible» = sí vende, pero no hay lugares · «PRÓXIMAMENTE» = va a haber.

  **Medido:** la casilla «Sin CHEAP» de Esferas escribe `no_cheap`, el
  compilador emite `noCheap:true` y el index **NO LO LEÍA EN NINGUNA PARTE** —
  cero lecturas; las dos apariciones del archivo eran DATO. Familia de la
  guarda inalcanzable: un interruptor que se prende y no apaga nada.
  🔴 **Y no era inocuo.** `humbecdmx` está VIVO con la bandera puesta y se veía
  «No disponible» **POR ACCIDENTE**: lo salvaba no tener `cheapZonas`. Sembrando
  la variante peligrosa —bandera puesta CON precios— el botón salía **«DESDE
  $3,200» y CLICKABLE**: el sitio vendía justo lo que la casilla dice no vender.

  🔴 **DOS TRAMPAS QUE CAZÓ MEDIR, NO LEER:**
  1. **`cheapSoon` GANA, y va antes.** `coronacapital` trae **las dos**
     banderas —el camino de FESTIVAL emite `noCheap:true,cheapSoon:true` juntas
     (L964) y el de CONCIERTO solo `noCheap` (L1214)— y con el orden al revés mi
     cambio le **escondía su «PRÓXIMAMENTE»**. «Va a haber» es más específico que
     «no vendemos»: **gana la que dice más**, y el careo lo carea byte a byte
     contra BASE para que esta tuerca solo toque lo que estaba roto.
  2. **La VISIBILIDAD también se reenciende.** Los botones son GLOBALES y la
     pantalla se reusa entre eventos: sin esa línea, el primer evento sin CHEAP
     se lo borraba a **todos** los siguientes, en la misma visita y sin aviso —
     el bug que ese bloque ya documentaba para `disabled` (cheapOnly apagando
     RIDE para los 5 eventos siguientes), con otra propiedad.
  ⚠️ Y el botón se esconde **Y se apaga**: solo con `display:none` quedaba
  invisible pero HABILITADO, un estado a medias.
  ⚠️ `noCheap` + `cheapOnly` dejaría al cliente **sin ningún paquete**, así que
  gana `cheapOnly`. Hoy ningún evento trae las dos, y el careo avisa si pasa.
  ⏳ **La asimetría del compilador NO se arregló** y queda clavada como testigo:
  deja de importar en cuanto el index obedece la bandera. Uniformarla es tuerca
  propia.

- 🏆 **NUM-BUS-1 EN PROD (23-sep-2026, #766): el bus cotiza al 8132321405, no al de reservas.**
  Regla firmada de Memo (23-sep). `npm run mide:num-bus-1` (**27**), cero SQL,
  **cambia exactamente un número**. ⚠️ **No lo introdujo NUBE-2: lo HEREDÓ** —
  esa línea traía el de reservas desde antes de que la nube existiera, y queda
  dicho para que nadie lea el `git blame` y culpe a la tuerca equivocada. El del
  avión ya estaba bien, así que ahora **los dos hermanos cotizan por el mismo
  número**.
  🔒 **EL CENSO ES EL CONTROL QUE ESTA CLASE DE TUERCA NECESITA MÁS QUE EL
  CAMBIO:** un barrido de números arregla uno y **se lleva cinco por el
  camino**. Se cuentan los **74 `wa.me`** del árbol por archivo y por número y
  se exige la cuenta exacta — `index.html` reservas 9→8 · viajes 2→3 · total
  48=48 · los otros 17 archivos **idénticos**—, más el candado por renglón (se
  mueven DOS) y ocho páginas careadas enlace por enlace.
  ⚠️ **Los `wa.me/52`+dígitos de `sorteo.html` y `kamehouse.js` NO son nuestros
  números**: abren el chat **del cliente** (el teléfono del ganador, el de un
  viajero). Contarlos habría vuelto el control ruido.
  ✅ **EL DUDOSO DEJÓ DE SER DUDOSO — RADIO-ETIQ-1 en prod (25-sep-2026, #767).**
  `radio/index.html` tenía etiqueta «Cotizar por WhatsApp» y mensaje «info de
  los tours»: la etiqueta apuntaba a viajes y el mensaje a reservas, así que se
  dejó en reservas y el careo lo dejó **clavado** esperando palabra. La palabra
  llegó (Memo, 23-sep): **la etiqueta cambia a «Cotiza tu evento», el número SE
  QUEDA en reservas (8119771072) y el mensaje como está.** Un solo texto
  visible se mueve; el `href` no.
  🔒 **Y el renglón clavado se ACTUALIZÓ a la verdad nueva con la firma en el
  comentario, en vez de silenciarse** — 29 verdes (eran 27), con tres candados
  nuevos: el número sigue en reservas, la etiqueta dice lo que dice, y el
  mensaje no se tocó. **La frontera entre «cotizar» y «reservar» era su palabra,
  no un grep** — y por eso el careo podía esperarla sin inventarla.

- 🏆🔴 **SERIE CARDS COMPLETA EN PROD (23-sep-2026, #759 · #760 · #761): el card
  del cotizador acompaña, gobierna su itinerario y dice sus políticas.**
  `npm run mide:card-itin` (**69**) · `mide:card-poli` (**53**) ·
  `mide:card-guia` (**29**). Material firmado de Memo en
  `CARDS-ITINERARIOS-POLITICAS-BRIEF.md`; **los textos se copiaron, no se
  parafrasearon**.
  ⏳ **PIDE SQL, y no es opcional: `migraciones/CARD-ITIN-1.sql` va ANTES de que
  nadie publique desde Esferas** — el candado se rehúsa (409) nombrando a
  `pulsoquetaro` y `tecatecomuna`. 🔒 El texto **no se re-teclea: se MUEVE**
  desde `extras -> promoModal -> desc`, que es la única forma de garantizar que
  el itinerario de hoy es byte por byte el de mañana.

  🔴 **TRES PREMISAS DEL ENCARGO NO SOBREVIVIERON A LA MEDICIÓN, y las tres
  cambiaron el trabajo.** Es la forma de LAND-2, otra vez:
  - **«Sin bandera cdmx → plantilla Monterrey» habría MENTIDO.** `ciudad` no es
    un campo de dos valores: tiene **CINCO** (MTY 82 · CDMX 31 · null 2 ·
    Morelos 1 · Saltillo 1) y **CONTRADICE al venue en tres filas** —
    `tecatecomuna` (Puebla) y `pulsoquetaro` (Querétaro) están marcados «MTY», y
    `bahidora2027` (Las Estacas, Morelos) también. **Cinco eventos no son ni
    Monterrey ni CDMX.** Así que la clase se deriva del **VENUE** y hay un
    **TERCER ESTADO: sin plantilla** — el card no pinta nada y la ficha lo pide
    en naranja. Antes que un letrero que miente, ninguno.
  - **«2+ pagos no registrados = baja automática» NO ES LO QUE PASA.** Medido:
    (1) no hay nada automático — el único escritor de `estado:'baja'` es
    `admin-lugar-baja` y su único llamador es un humano en el Palacio
    (`kamehouse.js:7211`); ningún cron, y el de *strikes* es de reportes del
    staff, no de pagos; (2) el umbral de la BAJA es **3**, no 2 —
    `portal-morosidad-diario` manda «congelado y en riesgo de baja» a las 2 y
    «en proceso de baja» a las 3+, y su encabezado dice **«Solo NOTIFICA — no da
    de baja ni congela nada (eso lo hace un humano)»**; (3) cuenta quincenas
    **VENCIDAS**, no «no registrados», que se lee como «pagué y no lo
    reportaron». **Con la medición enfrente Memo eligió que el texto se ajuste
    al hecho**, palabra por palabra igual que los correos. 🔒 El careo lo vigila
    contra la FUENTE del cron **en los dos sentidos**: si el cron deja de decir
    «Solo NOTIFICA» o le cambian los niveles, avisa de que el letrero se quedó
    viejo.
  - **«Montados sobre los hints del FAB»: EL FAB NO EXISTE.** El único flotante
    es el de WhatsApp, y el propio index **borra** las llaves `wiz-hint-visto`,
    `hints-vistos` y `help-fab-shown` con el comentario «sistema de ayuda ya
    eliminado». ⚰️ **La línea de este libro que promete «FAB "?" flotante +
    hints sutiles por paso» quedó VIEJA.** La guía se montó donde **ya había un
    letrero que estaba MUDO**: `#d-placeholder` decía «Elige tus opciones para
    ver tu cotización» —lo mismo para los cinco pasos— en las **nueve** veces
    que se enciende. Es ROL-MONTO-MUDO-1 en el cotizador.

  🔴 **LA LEY GRANDE DE LA SERIE: EN `index.html` UN `var` DE NIVEL SUPERIOR
  LEÍDO POR CÓDIGO QUE ESTÁ ARRIBA VALE `undefined`.** Los `<script>` inline se
  ejecutan **mientras la página se parsea**, y el deep-link de un evento
  —`/<slug>`, **la url que se comparte**— llama a `showDetail()` desde ahí
  mismo. Mordió dos veces y casi una tercera:
  · `var ITIN_MTY` → `itinerarioDe()` devolvía `undefined` y **entrar por la url
    dejaba el card ESCONDIDO mientras entrar por un clic lo mostraba**: el mismo
    evento, dos caras, según la puerta. Hoy las plantillas son **funciones**.
  · `var GUIA_ARRANQUE` → habría pintado literalmente **«undefined»** en el
    cotizador, **y sin tirar error**: invisible en la consola.
  · `var GUIA` → habría tirado `Cannot read properties of undefined`.
  🔒 **La señal:** si algo se ve al entrar por un clic y **no** se ve al entrar
  por la url, sospecha del **orden de parseo** antes que del CSS. Y lo cazó el
  careo por **entrar por donde entra el cliente**: un careo que llamara
  `showDetail()` a mano **sale VERDE** — comprobado.

  🔴 **DOS DEFECTOS AJENOS, MEDIDOS Y ANOTADOS SIN ARREGLAR** (los dos piden
  palabra de Memo):
  - **`generarObjFestival` NO PUEDE CORRER**: referencia `sepSeg`, que no existe
    en su ámbito → `ReferenceError` antes de emitir nada. Viene de `115c147` y
    se comprobó contra `main`: **no es de esta serie**. Nunca se notó porque la
    rama es alcanzable y **nadie la ha alcanzado**: de **117 fichas, 4 traen
    objeto `festival` y CERO traen `paquetes`**, y el emisor solo entra ahí
    cuando hay paquetes. Familia de la guarda inalcanzable: un emisor entero que
    truena la primera vez que alguien lo use. **Arreglarlo pide decidir qué
    separo emite un festival.** El careo deja un **testigo** que exige que
    truene con ESE mensaje: el día que se arregle, se pone rojo y manda a leer
    la nota.
  - **UN CALLEJÓN EN CDMX**: tras elegir la zona, la habitación viene
    **PRE-MARCADA** («Compartida»), el paso del transporte está **oculto** y la
    cotización **no aparece** — el cliente tiene que **apretar la opción que ya
    estaba marcada** para que el flujo siga. No se arregló (un paso
    preseleccionado que aun así exige el clic es tuerca propia); **sí se le quitó
    el silencio**: la frase de confirmación vive en la propia card
    (`data-guia-confirma`).

  🔒 **CUATRO LEYES NUEVAS, cada una pagada:**
  1. **AGRUPAR UN TEXTO ROMPE SUS REFERENCIAS INTERNAS.** «pero no **ESE**
     cargo» perdió su antecedente al repartir las políticas por temas: el cargo
     de tarjeta quedó en otra caja y el pronombre apuntaba a nada. **Lo vio Jane
     LEYENDO; ningún careo mío lo habría cazado.** Al repartir una lista en
     temas hay que **barrer los pronombres**. Y el arreglo se prueba por
     construcción: el careo toma el original, aplica **esa sola sustitución** y
     exige igualdad — ninguna otra palabra puede colarse en el texto de Memo.
  2. **EL ORDEN DE LOS PASOS LO DICE EL DOCUMENTO, NO UNA LISTA.** Escribir el
     letrero en cada REVELADO daba el paso equivocado: `selPaquete` abre la zona
     **y** la habitación en la misma pasada, así que ganaba el **último** y
     pedía la habitación cuando faltaba la zona. Hoy cada paso lleva su llave en
     `data-guia` y se recorre **en orden de documento** —el orden en que el
     cliente lee—, nombrando el primero **a la vista y sin contestar**; y
     «contestado» **se le pregunta al sitio** (`.active`).
  3. **`innerText` DEVUELVE EL TEXTO TAL COMO SE PINTA.** `.pol-row` lleva
     `text-transform:uppercase`, así que carear los seis textos de Memo contra
     `innerText` los encontraba **en MAYÚSCULAS** y fallaba los seis. El careo
     letra por letra va contra **`textContent`**; el `innerText` se queda para
     comprobar que el estilo sigue vivo, que también es parte del letrero.
  4. 🔴 **A UNA PR APILADA SE LE CAMBIA LA BASE A `main` ANTES DE MERGEARLA.**
     #760 quedó **CLOSED y no MERGED** aunque su código **sí entró** (`e79dbd8`,
     verificado con `merge-base --is-ancestor`): su base era `card-itin-1`, que
     ya estaba dentro de main pero cuya **rama nunca se movió**, así que GitHub
     no vio el merge contra su base — y re-apuntarla después se **rehúsa**
     («There are no new commits between base branch 'main' and head branch»).
     Con la #761 se hizo al revés —base a `main` **antes** del merge— y quedó
     **MERGED**. Es la hermana de «el push que miente»: el registro miente
     mientras el código está dentro.

  ⚠️ **Y una publicación de 77 eventos de Memo cayó en medio del merge de
  #759.** El `index.html` se auto-fusionó y se careó lo que importaba **byte a
  byte**: las dos fichas migradas traen su itinerario **idéntico** (sha1 igual
  al de la rama), ya **no** traen `promoModal`, `dalemix` conserva su promo y
  los tres eventos del careo mantuvieron su venue y su estado. Los tres careos
  corren en verde sobre el árbol final.

- 🏆🔴 **CUADRE-5 EN PROD (23-sep-2026, #758): el «$0» tecleado deja de ser
  diferencia donde el index SÍ puede saber el total.** Regla firmada por Memo
  (22-sep) y **acotada por su propio ojo**: el total del sistema —derivado del
  catálogo— es el bueno **por decreto**, pero **solo** en eventos **NO-CDMX** o
  en paquete **CHEAP en cualquier lado**. `npm run mide:cuadre-total` (**150**,
  eran 71), **cero SQL**, la fase sigue **SOLO LEYENDO**.

  **Lo que queda FUERA, y no es olvido:** los `$0` de **CDMX en paquetes con
  transporte** (el autobús son $2,500 pero el avión se cotiza a mano, así que
  el index no sabe el vuelo) y los **exactos de libreta** (ahí un `$0` enfrente
  es un cambio real). El chip dice **la regla y su fecha**, derivadas de la
  respuesta; el careo **reporta el conteo por clase** para que Memo vea el
  tamaño de cada montón. Las tres clases **parten** los `$0` tecleados, y viaja
  un cuarto contador (`fuera_otro`) que **debe ser siempre 0**: si algún día no
  lo es, hay una clase de `$0` que nadie nombró.
  ⚠️ **El montón cubierto NO trae botón de «aplicar»**, y eso es capacidad que
  se va: aplicarlo escribiría el `$0` encima de un total bueno.

  🔴 **EL CASO QUE EL ENCARGO NOMBRABA ERA INALCANZABLE.** La orden decía «si
  algún renglón de la regla trae el total del sistema en NULL/0, se pisa con el
  precio vivo del catálogo». Puesta detrás de la guarda de tolerancia, eso **no
  podía ocurrir jamás**: un `$0` tecleado contra un total en NULL o en 0 da
  diferencia **cero**, así que la tolerancia lo saltaba y el montón solo habría
  podido traer los que ya tenían total. Hoy la regla se pregunta **antes** de la
  tolerancia.
  🔒 **LEY: cuando un encargo enumera casos, cada caso nombrado es una aserción
  pendiente** — se siembra en el careo y se ve llegar. Y al meter una regla
  nueva en un camino que ya tiene guardas, la pregunta es **qué guarda corre
  antes**: una regla detrás de una guarda que la excluye se lee igual que una
  regla que funciona. Es la tercera cara de la **guarda inalcanzable**.

  🔴 **LA PUERTA `para_careo` ABRE CUATRO CANDADOS, NO DOS, Y SE DECIDIÓ
  CONTANDO.** El total pendiente se pisa pidiéndoselo al **dueño de la
  aritmética** (`resolverPrecioVenta`), no leyendo `ev.zonas` por nuestra cuenta
  —eso habría sido la segunda fórmula de «cuánto cuesta un paquete»—. Los
  candados de venta de AUD-2 se disparan justo en los eventos que se cuadran,
  así que la puerta apaga los cuatro que dicen «esto no se puede **COMPRAR**»:
  el `st` no vendible, la fecha pasada, la zona `ag` y la zona `prox`.
  **Medido sobre el catálogo del 23-sep: 957 de las 1,667 zonas están marcadas
  agotadas y 666 de ésas TRAEN PRECIO**; en los **40 eventos agotados o
  pasados** —los que de verdad se cuadran— son **364 de 468**. Con solo los dos
  candados del evento abiertos, el careo se habría quedado sin pisar el total en
  la mayoría de los renglones reales, y el «sin total» habría parecido un dato
  que falta en vez de un candado de venta.
  🔒 **LA REGLA QUE LOS SEPARA: la puerta abre lo que NO SE VENDE, jamás lo que
  NO SE SABE.** Siguen en pie, y tienen que seguir: `p > 0`, la zona que no
  existe en el catálogo, el paquete inválido y el `fecha_idx` fuera de rango.
  La puerta es **opt-in** y el careo **cuenta quién la pasa**: dos archivos, su
  dueño y `excel-careo-correr`. Los otros **cinco** llamadores de
  `resolverPrecioVenta` (separo de Mercado Pago ×2, alta del Portal, /rol,
  cortesías) cotizan venta de verdad y no deben pasarla nunca.

  🔴 **EL HALLAZGO DE JANE: EL TOTAL ES DEL GRUPO, NO DE UNA PERSONA.** La
  pestaña lleva **UNA FILA POR BOLETO** y los totales se **SUMAN**, así que
  pisar con el precio de una persona pintaba **1/N del total real** rotulado
  «del catálogo vivo» — peor que dejarlo vacío. Hoy el **mapa de boletos por
  zona de BOLETOS-1 viaja con el renglón** y solo se pisa cuando **todos** los
  boletos son de **una misma zona**; el renglón dice cuántos («del catálogo vivo
  · 4 boletos»), porque un número cuatro veces mayor sin esa palabra se lee como
  un error de la cuenta. Con los boletos **repartidos** se queda **pendiente con
  su motivo** («2 boletos en 2 zonas — se confirma a ojo»): cada zona tiene su
  precio y repartirlos sin fila que lo diga sería inventar.
  ⚠️ **Y una cara fina que salió al sembrarla:** zona **única** pero que **no
  contiene todos los boletos** (una fila sin zona). Un `zonas.length === 1` a
  secas lo habría pisado dando por hecho que el que falta es de esa zona — no se
  sabe, así que tampoco se pisa («3 boletos y 2 con zona»).
  🔒 **Y EL TOTAL DEL GRUPO SE LE PIDE AL DUEÑO** (`num_personas: filas` y su
  `total`), **no se multiplica**: medido, los cuatro casos de hoy dan lineal,
  pero eso es un **hecho de hoy** —el hotel por persona cambia con el tipo de
  cuarto— y `unit × filas` habría sido mi aritmética al lado de la suya. **El
  arnés tampoco multiplica**: carea contra lo que contesta el dueño preguntado
  por separado, porque si el arnés repite la cuenta del runner los dos pueden
  estar igual de equivocados.

  **EL CAREO, por el handler REAL:** el **catálogo es el REAL** (el `index.html`
  del repo servido por la red falsa), así que `esCDMX` y los precios salen de la
  misma fuente que el sitio — un EV inventado habría clasificado los renglones
  con **mi** criterio. Las clases se miden con **eventos reales** (youngmiko de
  Monterrey, soad del Palacio) y **la premisa se afirma antes de contar**: si
  `cdmx` no sale del catálogo, las clases se vuelven una sola.
  🔒 **CONTROL POSITIVO QUE NO PUEDE CADUCAR:** el mismo caso con el catálogo
  **ILEGIBLE**. Las clases cambian (6 → 5 en regla, 0 → 1 por CDMX) y el PLUS
  derivado **vuelve** al montón de diferencias. No depende de ningún pasado,
  solo de apagarle la fuente al careo.
  🔒 **LA PANTALLA SE PRUEBA MUTANDO EL DATO**, no buscando la palabra: se le
  cambia la fecha y los tres conteos a un testigo y se exige que los diga. Un
  `grep` del literal **se caza solo** —el propio comentario contiene la fecha—.
  🔒 **Y LA VENTA SE CAREA EN UN EVENTO QUE SÍ ESTÁ VENDIENDO** (`payasonicos`,
  29-nov): la zona agotada **se rehúsa** sin la puerta y **cotiza** con ella; la
  zona que no existe se rehúsa por los dos caminos. Con **candado de
  cardinalidad** — y en la primera corrida **se puso rojo** y cazó que el
  bloque estaba midiendo en vacío (el escenario anterior había dejado la red
  falsa sin servir el catálogo).
  ⚠️ **El módulo `catalogo-index` cachea el EV 10 minutos**, así que el careo
  **tira el require cache** en cada escenario: sin eso, el primero que sirviera
  el catálogo se lo **regalaría** a los que miden el fail-soft de «catálogo
  ilegible», y el orden de las corridas decidiría el resultado.

  ⚠️ **`vigia:color` sigue 🔴 y NO se le movió la base**: de sus +84, **71 son
  anteriores a esta tuerca y siguen sin triar**; los **13 nuevos son de la
  pantalla de CUADRE-5 y los 13 son `var(--token)`, cero literales** — medidos
  archivo contra archivo entre `9cd5543` y el merge. `vigia:color-literal`, que
  es **el medidor de la serie COLOR**, está 🟢 sin crecimiento. Mover la base
  habría bendecido los 71 de otro.

- 🏆🔴 **VIGIA-ROL-VIVO-1 EN PROD (23-sep-2026, #757): el vigía de `/rol` revive
  como GUARDIA PERMANENTE.** `HEAD_URL=<preview> npm run vigia:rol-vivo`
  (el nombre viejo `vigia:rol-hist-padre` sigue como **alias**). Cero SQL, y no
  toca el sitio: solo el vigía.

  🔒 **LA LEY QUE LO MATÓ, Y VALE PARA CUALQUIER ARNÉS: un careo BASE↔HEAD
  donde BASE es «producción» tiene fecha de caducidad EL DÍA DE SU PROPIO
  MERGE.** Con dos commits el par se congela; con un **sitio vivo**, el «antes»
  se va en cuanto la tuerca sale. Este exigía que BASE estuviera **roto** —el
  bloque [B] pedía `sin_historial:true` en las 92 huérfanas y el [C] que
  cotizara «el precio de HOY»— y el [A] quitaba `LLAVES_NUEVAS` **de un solo
  lado**. Con ROL-HIST-PADRE-1 (#732) en producción, eso daba **348 rojos que
  no eran del código**.
  ⚠️ **Y NO SE MEDIO-ARREGLÓ:** arreglar solo el [A] era una línea y lo habría
  puesto **en verde** dejando el [B] estructuralmente muerto — un verde
  engañoso sobre un arnés que ya no mide nada.

  **La forma nueva:** los dos sitios tienen que contestar **IGUAL**, sin lado
  roto. **[I]** valida el instrumento con un testigo conocido y **se detiene**
  si falla · **[S]** control positivo por **sabotaje LOCAL** · **[V]** igualdad
  viva de las **344** llaves del universo, byte a byte, **con todas las
  claves**, diciendo **en qué** difieren · **[L]** la **línea base**: los dos
  testigos de Jane, exigidos en los dos sitios, que **solo se mueve cuando un
  cambio de precio se APRUEBA**. Más el **contrato de la forma**: una clave que
  falte en producción o sobre en el candidato es rojo con esas palabras.
  🔒 **El control positivo nuevo NO PUEDE CADUCAR** porque no depende de ningún
  pasado: muta una respuesta real de hoy y exige que el comparador la cace. El
  anterior era «BASE está roto», o sea un pasado — y por eso se murió.
  🔒 **Y [V] afirma su premisa antes de contar:** los dos lados tienen que
  contestar `200` con `ok:true`, porque **un 500 en los dos da cuerpos
  «iguales» y eso es un apagón, no una igualdad**.

  🔴 **EN SU PRIMERA GUARDIA EL SABOTAJE CAZÓ UN DEFECTO DEL PROPIO
  COMPARADOR**, que llevaba ahí desde que el vigía se escribió:
  `JSON.stringify(o, Object.keys(o).sort())` — **un ARRAY como segundo
  argumento no ORDENA: es una LISTA BLANCA de claves, y se aplica a TODOS los
  niveles.** Como solo listaba el nivel 1, todo lo anidado se serializaba
  **vacío**: `{ok:true, al_abrir:{precio:3400}}` → `{"al_abrir":{},"ok":true}`.
  O sea que el «byte a byte» **nunca comparó un precio**, ni una hora, ni
  `cerrada`, ni `aplicable`: **habría dado 344 de 344 idénticas con producción
  cotizando $9,999.** Hoy hay serialización **profunda** y un **sabotaje
  anidado permanente** entre sus controles.
  **Corolario:** si se quiere orden estable se ordena el OBJETO y se serializa
  **sin replacer**; el replacer-array es para filtrar, no para ordenar. Y todo
  comparador de objetos lleva su sabotaje **anidado** entre sus controles.

  **Primera guardia:** 1 046 aserciones · 344 de 344 idénticas · cinco
  sabotajes cazados · los dos testigos en pie.


- 🏆 **GANADOR-PODA-1 EN PROD (23-sep-2026, #756): la tarjeta del ganador se
  simplifica.** Cuatro cambios firmados por Memo. `npm run mide:ganador-b`
  (**53**, eran 78), cero SQL.

  🔒 **LA PODA SE DECIDIÓ CONTANDO, no suponiendo** —y por eso NO se podó la
  mitad de lo que parecía sobrar:
  · la function **`deezer` tiene DIEZ llamadores** (index ×2, portal ×6,
    esferas ×2), así que **no se toca**: solo se fue la llamada de `/sorteo`;
  · **`ultimo.artista` tenía UN lector** (`pintarMuestra`) → se podó el campo,
    su derivación, `EVENTO_CATALOGO` y la proyección `artista` del catálogo;
  · **`karol-g.jpg` sigue viva en `/giveaway`** (og:image y la foto del hero):
    la orden era la tarjeta y la story, **no el registro**;
  · `#ic-play`/`#ic-pausa` eran solo de la muestra (los de index y portal son
    `.rcp-ic-play`, del radio).

  **Lo que entró:** fuera la muestra de 30 s con toda su cadena · fuera la
  imagen de la tarjeta y de la story (queda el fondo de marca con su
  degradado) · los tres botones a **dos columnas** («Aceptó» a lo ancho, los
  dos descartes compartiendo renglón: son la excepción, no la regla) · la
  story en **JPEG al 92 %**, de **2 231 KB a ~100 KB** — se puede porque sin
  foto de fondo el lienzo tiene fondo propio y opaco.

  🔴 **Y EL VERDE ERA SUERTE. Lo cazó Jane:** su corrida dio **y=871** donde la
  mía dio **y=835 con el MISMO commit**, porque la ALTURA del bloque depende de
  **a quién le tocó ganar** (lo que mide el nombre, la ciudad, el @ y el texto
  del premio). Es la lección de «el rojo que dependía del ganador», ahora en
  píxeles.
  🔴 **Y al medirlo salió una segunda causa que ninguno había visto:** su
  `contacto` medía **76** y el mío **34** — eso no depende del ganador, depende
  de **si cargan las tipografías de Google**. Con la de respaldo, más ancha,
  los botones envuelven. **Una altura que depende de un CDN no se puede hacer
  caber**, así que hoy el contacto va en **un renglón fijo** (el @ se recorta
  en pantalla y viaja completo en `title`, `aria-label` y `href`).

  🔒 **HOY EL CAREO MIDE EL PEOR CASO DEL PADRÓN REAL**, no el que le toque:
  nombre **37** con partícula, ciudad **18** que dice «Reynosa» —para que el
  premio sea el PLUS, 93 caracteres—, @ de **17**. Los máximos se leyeron de la
  base **como longitudes, nunca como datos de nadie** (101 filas). El ganador
  se **fuerza** intercambiándolo con `orden[0]`, así la escalera sigue siendo
  prefijos; y **las tipografías se bloquean**, que quita la dependencia de la
  red y además es el peor caso real. Tres corridas dan **y=824 exacto**.
  🔒 **Candado de la premisa:** se exige nombre ≥37, premio ≥90, @ ≥17 y **cero
  tipografías cargadas**. Sin eso, un rojo futuro se «arregla» acortando el
  nombre de prueba — y cazó algo al primer intento: un escenario anterior
  restauraba el @ al literal viejo y le quitaba el peor caso al que medía.

  ⚠️ **EL APRETADO VIVE EN `body.gano`**, no en las reglas generales: tocando
  `.panel` o `.reloj` a secas se habrían apretado también la pantalla de
  espera, la del re-giro y la de la repetición, que no tienen ese problema.

  🔴 **Y LA LEY DEL ANCLA, EN SUS TRES CARAS** —las tres pagadas en esta
  tuerca—: con un careo de árboles archivados **(1) medir exige commitear**
  (una corrida midió el commit anterior y dio números idénticos, que se leen
  como «el cambio no sirvió»), **(2) commitear exige RE-ANCLAR** (el ancla de
  fábrica se quedó en el commit previo al apretón y `npm run mide:ganador-b` a
  secas daba y=905: **le costó dos corridas rojas a Jane**), y (3) un arnés
  cuya tuerca siguiente retiró lo que medía **se actualiza a la verdad nueva**,
  con cada retiro razonado — nunca en silencio.
  **La señal:** si con `HEAD_SHA=<sha>` a mano sale verde y a secas sale rojo,
  **el ancla está vieja; no es el código.**

  ⚰️ **Retirados con su razón escrita:** el escenario de la imagen (hoy
  exigiría deshacer la decisión de Memo, y su par desapareció porque BASE
  tampoco la pedía) y los cuatro de la muestra —el control positivo de uno de
  ellos **caducó al volverse cierto en los dos lados**—. En su lugar quedan dos
  **guardias vivas**: `/sorteo` no pide esa imagen ni le pide nada a `deezer`.
  Y la story se exige **JPEG por extensión Y por bytes**: un PNG con nombre
  `.jpg` reventaría el peso otra vez sin que se notara.


- 🏆🔴 **GANADOR-QUIETO-2 EN PROD (22-sep-2026, #755): la quietud del ganador se
  decide por el HECHO, no por encontrar una ficha.** Jane reprodujo el temblor
  en el ensayo REAL con el código de #753 **servido**.
  `npm run mide:ganador-quieto` (**65**, eran 44), cero SQL.

  **El dato:** a la revelación, `body.gano` puesto, la placa encendida y los
  letreros BIEN —«Ganador», «1 de 24 · al azar»—, y la ficha ganadora con
  `mos vive finalista`: **sin `.gana`, sin `data-quieta`**, con `tiembla`
  corriendo y `--amp:9.0px` **congelado** en su valor máximo.
  Esos letreros se escriben en **UN SOLO SITIO**, así que el callback de `tRev`
  sí corrió y lo único que se saltó fue `if (eg) { quietar(eg); … }`:
  **`fichaDe(folioG)` devolvió null.**

  🔒 **LA LEY, Y ES MÁS GRANDE QUE ESTA PANTALLA: una promesa no puede depender
  de encontrar un nodo.** El hecho es «hay ganador revelado» y de ese hecho se
  sigue que **nada tiembla**. Colgarlo de un `querySelector` que puede fallar
  por cualquier razón —y falló por una que **todavía no se sabe**— es la misma
  forma de la guarda inalcanzable: **#753 movió el candado y lo dejó colgando
  del mismo hilo.** Y como el temblor es una animación `infinite`, no alcanzar
  ese `if` UNA vez lo deja puesto **para siempre**.
  `cerrarShow(folioG)` vive en el punto único que todos los caminos comparten:
  (1) **calla TODA la rejilla** + `pararTemblor()`, sin buscar a nadie — ésa es
  la promesa; (2) marca por folio — eso es cosmética; (3) si el folio no está,
  usa la única VIVA (por construcción de la escalera es la ganadora) **y lo
  GRITA por consola**.

  ⚠️ **UN PUNTO CIEGO DEL PROPIO CAREO, y es la misma lección otra vez:**
  `vigilarQuietud` buscaba **solo** `.mos.gana` — la clase que el árbol roto NO
  pone—, así que en BASE2 daba **«0 de 0 muestras»**: un cero sobre el conjunto
  vacío, que no es una medición. Hoy cae a la ficha viva y hay **candado de
  cardinalidad en los dos brazos**. Pasó de 0/0 a **24/24**.

  **El careo usa DOS BASES**: `f816e5b` para el huérfano de #753 y **`3ac566e`
  para ésta** —el main que ya trae #753 y sigue temblando—; contra el BASE viejo
  no se habría distinguido un arreglo del otro. El escenario D reproduce la
  captura **determinista**: página ABIERTA, el giro llega **por latido** y como
  **repetición**, y el servidor dice un folio que **no está en la rejilla**.
  🔒 Y la **premisa** se afirma en los dos lados: los letreros se pintan igual.
  Eso es lo que hacía este defecto tan difícil de ver.

  ⏳ **ABIERTO: por qué `fichaDe(folioG)` devolvió null en el ensayo real.** Se
  descartaron **con datos** el ancho de escritorio (1350 idéntico a 390), otro
  nodo de la cadena (tras revelar no corre **ninguna** animación), «Aceptó»,
  «Ver de nuevo», el redoble sostenido con su latido de 800 ms, y la repetición
  por latido. Ninguno lo reproduce solo. **El arreglo ya no depende de esa
  causa**, pero no se sabe — y la trampa está armada: el `console.error` dice
  cuántas fichas había y con qué folios. Si sale en un ensayo, **se guarda ese
  texto**: cierra el caso.


- 🏆 **ROL-MONTO-MUDO-1 EN PROD (22-sep-2026, #754): el paso 4 de `/rol` dice
  qué le falta, en vez de quedarse mudo.** Reporte real de **Ximena, con
  captura**: dos clientes no podían capturar el monto del separo — veían el
  título, **ningún campo** y el botón muerto, sin una palabra.
  `npm run mide:rol-mudo` (**44**), cero SQL.

  **La causa:** `#sep-monto-wrap` nace oculto y `recomputeDefaultSepMonto` lo
  volvía a esconder cada vez que `computeDefaultSep()` daba null. *Un cero es
  una afirmación, y un paso mudo también.*

  🔴 **LA FECHA ES LA RAÍZ, Y EL ORDEN DEL LETRERO NO ES COSMÉTICO.** Medido:
  sin fecha, `pedirPrecioVigente` se sale sin pedir nada y
  `precioZonaVigente()` devuelve null — o sea que en el caso de Ximena faltan
  **los dos**, fecha y precio. Nombrar el precio primero diría «vuelve al paso
  2», que es **la causa equivocada**, y mandaría al cliente a buscar donde no
  está. El precio nulo es **consecuencia** de la fecha vacía: solo se nombra
  cuando la fecha ya está y el precio sigue sin resolverse.
  ⚠️ **La fecha vacía sin default está BIEN** y no se re-litiga (ROL-HIST-2):
  lo roto era el silencio.

  🔒 **EL CASO DEL PRECIO NO SE RE-EXPLICA EN EL PASO 4**: el paso 2 ya dice por
  qué (buscando, error, zona cerrada, varios precios ese día, sin historial) en
  `pintarPrecioHist`. Repetirlo sería la segunda lista que todavía no ha
  divergido. El paso 4 lo **nombra** y manda para allá.

  **DOS HECHOS DE MÓVIL que decidieron el diseño** —y ahí están los clientes:
  (a) `@media(max-width:600px)` pone los pasos `.locked` **y los `.done`** en
  `display:none`, así que se ve **un paso a la vez**; (b) `#sep-date-wrap` nace
  oculto y **solo aparece al elegir la zona** — y en CHEAP esa misma acción
  dispara `setStep(4)`, que manda el paso 3 a `display:none` y **se lleva el
  campo que acababa de aparecer**. El cliente nunca vio la fecha.
  **Por eso el paso 4 SIGUE desbloqueándose sin fecha** (decisión mía, que Memo
  dejó abierta): bloquearlo lo haría **desaparecer** del teléfono, el letrero
  hace falta igual porque el precio puede faltar solo, y un paso bloqueado es
  igual de mudo que uno vacío.

  🔴 **LEY NUEVA, y salió de un defecto de mi propio arreglo: SE VUELVE CON EL
  DATO QUE FUE A BUSCAR, NO CON LA LISTA VACÍA.** El «camino de regreso» del
  aviso tiene que mover el paso (en móvil el destino está oculto si no), y como
  el `change` de la fecha es **el único de los cuatro sitios que no llama a
  `setStep(4)`**, eso atrapaba al cliente en el paso 3. La primera versión
  esperaba a que **no faltara nada** para volver — y eso lo atrapaba en el caso
  del precio: llenaba la fecha, el precio seguía sin resolver, el paso 4 se
  quedaba cerrado e invisible, y el aviso que le habría dicho «la razón está en
  el paso 2» se pintaba en un paso que no se ve. **Lo cazó el careo, no una
  lectura.**

  **El careo entra POR LA PUERTA DEL CLIENTE y en 390×844**: onboarding →
  nombre → «+ tour» → evento → CHEAP → zona. No se fabrica el `state`; y
  saltarse el onboarding dejaba el paso 2 bloqueado —invisible en móvil—, así
  que el botón del paquete no existía para el clic: el arnés se caía midiendo
  una pantalla que ningún cliente ve. 🔒 **«Existe» no es «se ve»**: cada pieza
  por su cadena completa (`display`, `visibility`, `opacity`, `offsetParent` y
  su caja), y el veredicto de BASE se toma del **texto que el cliente LEE**
  (`innerText` del paso 4), no de la ausencia de mi propio `div`.

- 🔴⏳ **`vigia:rol-hist-padre` CADUCÓ ENTERO — tuerca propia, sin resolver
  (22-sep-2026).** Sale con **348 rojos y ninguno es del código**:
  - su bloque **[A]** quita `LLAVES_NUEVAS` (`heredado`, `llave_usada`,
    `filas_historial_padre`, `padre_error`) **solo del lado de HEAD**, porque
    cuando se escribió no existían en producción. **Hoy sí existen** —
    ROL-HIST-PADRE-1 (#732) se mergeó—, así que las **252 comparaciones
    difieren por construcción**;
  - y su bloque **[B]** exige que **BASE esté roto** (`sin_historial: true`)
    como control positivo: producción ya trae la rampa, así que ese control
    **no puede pasar nunca más**.

  🔒 **LA LEY: un careo BASE↔HEAD donde BASE es «producción» caduca el día de
  su propio merge.** Con dos commits el par se congela; con un SITIO VIVO, el
  «antes» desaparece en cuanto la tuerca sale.
  🔴 **Y NO SE MEDIO-ARREGLA:** arreglar solo [A] era una línea y lo habría
  puesto **en verde** dejando [B] estructuralmente muerto — un verde engañoso
  sobre un arnés que ya no mide nada. Se revirtió a propósito.
  **Mientras tanto, lo que sí se puede afirmar se mide directo:** la respuesta
  de `precios-vigentes` es **idéntica byte a byte** entre producción y el
  preview (5 de 5 casos, 17 llaves), que es el hecho que ese vigía existía para
  proteger.
  ⏳ **La decisión pendiente es de Memo:** revivirlo como **vigilante vivo**
  (producción y preview tienen que contestar IGUAL, y [B] se retira con su
  razón escrita) o como careo anclado a **dos commits servidos**. Son dos
  arneses distintos.


- 🏆🔴 **GANADOR-QUIETO-1 EN PROD (22-sep-2026, #753): la ganadora se queda
  quieta, y el letrero deja de decir «ronda 4 de 5».** Dos defectos que Memo vio
  en el ensayo, con captura. `npm run mide:ganador-quieto` (**44**), cero SQL.

  🔴 **LA RAÍZ: EL DUEÑO DE UN RELOJ NO ES LA FUNCIÓN QUE LO CREA.** El
  `setInterval` del temblor vivía en un `var` local de `finalSinGiro`, así que
  su `limpiar()` solo podía matar **el suyo** — y `SHOW = showDe(u)` se
  reemplaza cuando **cambia el id del giro**, sin pasar nunca por `null`, así
  que la guarda `if (!SHOW)` del reloj anterior **no se cumplía jamás**. El
  temblor es de UN show: hoy muere cuando el show se reemplaza.
  ⚠️ Y ponerlo a morir al arrancar el final —la primera versión del arreglo—
  llegaba **63 segundos tarde**: el careo lo cazó porque mide el huérfano
  DURANTE la presentación del show siguiente, no solo al final.

  🔴 **Y UNA ANIMACIÓN `infinite` CONVIERTE UN INSTANTE EN UN ESTADO
  PERMANENTE.** Un solo tic tardío del huérfano le pega `.mos-tiembla` a la
  ganadora **para siempre**: matar el reloj después ya no la quita. La ventana
  de la carrera es de **~150 ms en 82 s**, y de ahí que el defecto pareciera
  intermitente y que una muestra un segundo más tarde no lo viera.
  🔒 **Corolario:** la quietud se hace un **HECHO DE LA FICHA**
  (`data-quieta`, y `temblar` se rehúsa), no la ausencia de un reloj.

  🔒 **Y NO SE BUSCA UN NODO POR LA CLASE QUE SE LE VA A QUITAR.** El envoltorio
  se buscaba con `querySelector('.mos-tiembla')` y al callar la ficha se le
  quitaba ESA clase: el div seguía ahí pero ya no se encontraba, así que la
  llamada siguiente construía **otro envoltorio con el anterior adentro**. Hoy
  la clase estructural (`mos-env`) nunca se quita y `.mos-tiembla` es solo el
  interruptor de la animación.

  **El letrero** (decisión de Memo): `mos-de` dice **«1 de N · al azar»** en la
  pantalla del ganador, cerrando el arco que abrió «24 de N · al azar». La N es
  derivada de `de_cuantos`; sin dato **se vacía** antes que mentir con la ronda
  anterior.

  🔒 **CÓMO SE MIDIÓ, que es la mitad de la lección:** se **instrumenta
  `setInterval`** en el navegador y se **cuentan los relojes vivos** en vez de
  inferirlos del síntoma —eso destapó el caso después de dos hipótesis fallidas—;
  la quietud se mide **SOSTENIDA** (24-28 muestras en 3.6-4.2 s, todas tienen
  que coincidir) sobre el **envoltorio de adentro**, porque `.mos` no se mueve
  nunca y medirlo pasaría en vacío; y se espera a que acabe la animación de
  entrada preguntándole al navegador **por su nombre**, porque esperar «a que no
  haya ninguna» se cuelga en BASE, donde `tiembla` es infinita.
  ⚠️ **El primer careo pasó en VERDE midiendo un camino que se limpia solo**
  (el giro nuevo cerca de SU revelación dispara también el `esperarDato` del
  viejo, que mata al huérfano). El **control positivo en rojo** impidió reportar
  un arreglo «verificado» que no verificaba nada. La reproducción determinista
  salió de que los dos shows **no comparten su `cuando`**: con 40 participantes
  la revelación cae en el ms 76 000 y con 5 en el 20 500 — caso real del ensayo,
  **borrar, sembrar menos, girar**.


- 🏆 **GIVEAWAY FASE 2 COMPLETA EN PROD (22-sep-2026, #751 y #752): el sorteo
  de Karol G se corre por RONDAS y la tarjeta del ganador está vestida.**
  `npm run mide:sorteo-rondas` (**1 280**) · `mide:sorteo-maquina` (**147**) ·
  `mide:ganador-b` (**78**). SQL `migraciones/SORTEO-RONDAS-1.sql` **ya corrido
  y verificado contra la base**: 4 columnas, los 4 CHECKs, el índice único
  `(slug,intento)`, la FK y el trigger que hace `rondas` inmutable.

  **La mecánica:** el servidor revuelve el padrón UNA vez con azar de `crypto`
  y las rondas son **PREFIJOS** de esa lista (24→12→6→3→1), así que
  `P(ganar)=1/N`, cada ronda es subconjunto de la anterior y el ganador está en
  todas — **gratis, sin comprobarlo a mano**. El navegador solo REVELA, gateado
  por el reloj del servidor: el show dura **82 s** y el ganador viaja en el
  **segundo 74**.

  🔒 **NINGUNA RESPUESTA PÚBLICA EXPONE EL ORDEN DE LA REVOLTURA.** Las rondas
  viajan ordenadas por FOLIO, que ya es público. `orden` se guarda en orden de
  revoltura porque es lo que hace que las rondas sean prefijos; publicarlo tal
  cual sería publicar al ganador desde el segundo cero.

  🔴 **Y LA LECCIÓN GRANDE DE LA SERIE: un desempate «imparcial» entre
  perdedores puede DELATAR la posición del ganador.** El final apaga a uno de
  los 3 finalistas, y la primera versión elegía «el de folio más alto de los
  dos perdedores» — razonado así en el código: *el folio ya es público y los dos
  pierden igual*. Las dos frases son ciertas y la conclusión es falsa, porque el
  mosaico va ordenado por folio: ese desempate es una **función de la posición
  del ganador**. Medido sobre 2 000 corridas: la posición 0 **nunca** caía (0 de
  2 000), la 1 el 35.3 % y la 2 el 64.8 % — así que si caía la del medio, el
  ganador era la de la derecha **con certeza, cinco segundos antes**. Hoy el que
  cae sale de un **bit de azar propio, guardado** con la escalera (`primero`):
  guardado y no calculado al vuelo, porque dos personas en dos teléfonos tienen
  que ver apagarse la MISMA tarjeta. Remedido: 33.0 / 33.4 / 33.6 %.
  **La pregunta no es «¿este dato es público?» sino «¿de qué es FUNCIÓN?».**

  **Lo demás que vive en prod:** tres botones con token (aceptó / no contestó /
  no cumple las bases, con motivo de lista cerrada que **nunca** sale en
  público: los dos descartes se ven igual, «Se vuelve a girar») · `acepto`
  irreversible y un sorteo con ganador confirmado **CERRADO en el servidor**
  (409 y cero filas, y el botón desaparece de la pantalla) · modo **ensayo**
  blindado en los dos sentidos, con avatares generados · el consuelo exige un
  ganador con `acepto` o se rehúsa diciendo por qué · la ciudad en cada ficha
  del mosaico · el marco de campeón · el contacto del ganador con token · la
  muestra de 30 s de Deezer con botón propio · y el **story PNG 1080×1920**.

  🔒 **EL ARTISTA SE DERIVA DEL CATÁLOGO**, no se teclea:
  `catalogo[EVENTO_CATALOGO].artista` (de `e.img`, el campo con el que el sitio
  le busca la foto). Escribirlo habría sido la TERCERA copia del nombre en
  `/sorteo`. ⚠️ Y **`nombre` no sirve**: es el titular del evento («Karol G en
  Monterrey») y buscar eso en Deezer no encuentra nada.
  ⚠️ Se pide **solo con el ganador ya revelado**: `giveaway-estado` es ruta
  caliente (la página late cada 4 s durante 82 s) y traer el catálogo en cada
  latido sería pagar una lectura de más 20 veces por espectador. Fail-soft duro:
  sin artista, la pieza de música **no se pinta**.

  🔒 **EL REPRODUCTOR OFICIAL INCRUSTADO NO CABE EN EL CSP** —`frame-src 'self'
  https://*.supabase.co`—, así que va un `<audio>` **nuestro** con botón de
  play: `*.dzcdn.net` ya está en `media-src` y la url la pide nuestra function
  `deezer`. ⚠️ Esas urls están **FIRMADAS y caducan en 15-30 min**: se piden al
  armar la tarjeta, nunca al cargar la página.

  🔒 **LA FOTO DEL STORY ENTRA COMO DATA-URI POR `foto_datauri`**, y no es
  capricho: el bucket es privado, la única forma de pintarla en un `<img>` es
  una url FIRMADA, y una imagen de otro origen **CONTAMINA el canvas** —
  `toBlob` truena con SecurityError y no hay archivo. Esa function le
  **pregunta** el content-type al almacén en vez de adivinarlo por la extensión
  (los avatares del ensayo son SVG con nombre `.png`: adivinando, la story
  saldría con la cara en blanco).

  🔒 **`karol-g.jpg` NO SE PIDE DURANTE EL SHOW.** Son 373 KB / 2048×2048 y
  viste `.mosaico-caja` desde una regla colgada de `body.gano`, así que el
  navegador solo la descarga cuando aplica; el precargado explícito va **al
  arrancar el final** (segundo 63), donde hay red ociosa. Antes competiría con
  las fotos firmadas del padrón. Medido: **0 peticiones antes del final**.
  ⚠️ Y viste el MUEBLE, **no** `.mos.gana`: la foto del ganador llena su
  tarjeta (una imagen detrás no se vería) y colgar un nodo del mosaico lo pone
  donde `pintarMosaico` reescribe con `innerHTML` — la ley de `.hs-media`.

  🔴 **El `52` del WhatsApp no es decorativo:** `giveaway-registro` guarda el
  número a **diez dígitos exactos** («sin lada de país», lo dice su propio
  error), así que un `wa.me/<10 dígitos>` abre un chat con **nadie**. Si el dato
  no tiene esa forma, el botón **no se pinta**.

  ⚠️ **Lo que NO cabe sin scroll, medido y dicho:** el bloque que pidió Memo
  —foto → nombre → ciudad → premio → reloj— cabe en **y=12..669 de 844**. Las
  herramientas de admin que van debajo suman **315 px** (tel 47 · contacto 34 ·
  **botones 206** · repetir 28) y **sí piden desplazarse**. Los 206 px son los
  tres botones apilados: caben en dos columnas el día que Memo lo pida.
  ⚠️ El PNG de la story pesa **2.28 MB**; en JPEG al 92 % serían ~300 KB.
  Se entregó en PNG porque es lo que pidió.

  🔴 **CUATRO ERRORES DE MEDICIÓN PROPIOS que vale más recordar que la tuerca:**
  (a) la aserción del bloque del ganador medía **el ALTO de la unión** —«769 px
  caben en 844», verde— y nunca **DÓNDE caía**: el reloj vivía 155 px bajo el
  pliegue; (b) su ayudante de visibilidad preguntaba `offsetParent !== null`, y
  **una placa en `opacity:0` contesta que sí**, así que contó como visible una
  placa vacía e invisible; (c) la aserción del temblor medía `.mos`, y el
  temblor es un `transform` sobre el **envoltorio de adentro** — `.mos` no se
  mueve nunca, así que habría pasado en vacío también en plena vibración;
  (d) una aserción buscaba el nombre del ganador como CADENA y el padrón de
  prueba trae «Ana»: cuando el sorteo le tocaba a Ana su nombre corto **era** el
  completo, así que el rojo dependía **de a quién le tocara ganar** — y las
  veces que pasaba, pasaba en verde sin avisar.


- 🏆 **VIAJEROS-CONTADOR-1 EN PROD (21-sep-2026, #750): la portada presume los
  viajeros reales.** «**2,468** viajeros y contando», con el desglose por año
  debajo (**2026: 2,281 · 2027: 187**) como registro permanente. Endpoint
  público `viajeros-contador`, `npm run mide:viajeros-contador` (69 aserciones),
  **cero SQL**.
  🔒 **EL CRITERIO NO SE GEMELEA: SE LE PREGUNTA AL RESUMEN.** El endpoint llama
  a **`cuentasDeTodos` de `_lib/cuenta-evento`** y lee `totales.viajeros` — la
  MISMA función que pinta el número del Palacio. Un `count(*)` propio habría
  sido la **fórmula número trece** (AUD-1 encontró once maneras de decir «cuánto
  dinero hay», todas coherentes consigo mismas hasta que alguien miró dos a la
  vez), y encima a la vista de los clientes.
  Medido antes de construir: **2468 en 742 ms, 88 eventos**, y la suma de los
  por-evento da el mismo 2468. **El Portal aporta 0**, así que HOY el número son
  en la práctica las filas de `viajeros_evento` — pero eso es un hecho de hoy,
  no la regla.
  **El año sale en CASCADA**: `esferas_eventos.fecha_inicio` → el `ds` del
  catálogo servido → `ANIO_A_MANO`. 🔒 El paso 2 existe para no teclear fechas
  que el sistema ya sabe: **melanie se resuelve sola** (no tiene fila en
  esferas, pero su `ds` dice 2026-08-06), así que de los dos «a mano» del
  encargo quedó uno.
  ⚠️ **`palnorte` → 2026 ES UNA DECISIÓN FIRMADA DE MEMO, no una inferencia**, y
  la evidencia apuntaba al otro lado: su ficha existe pero con `fecha_inicio`
  NULL y su `ds` vacío; el evento se llama **«Tecate Pa´l Norte 2027»**, va en
  `proximamente`, y sus **232 viajeros se dieron de alta en AGOSTO DE 2026** —
  después de que pasara la edición 2026. Se le enseñaron los dos desgloses y
  eligió 2026. **Para cambiarlo hace falta su palabra otra vez**, y el día que
  Pa´l Norte tenga fecha en su ficha esa entrada SOBRA.
  🔒 **NO ES KANEDA, es `--font-display`** (Barlow Condensed 900). El sitio solo
  carga Barlow Condensed + Montserrat: pedir Kaneda cae a Montserrat **en
  silencio**. El encargo la pedía por nombre.
  🔒 **Fail-soft DURO**: cualquier tropiezo —red, 5xx, JSON raro, total que no
  es número— **BORRA** la pieza del DOM. No la esconde: la borra.
  🔒 El count-up es **render por evento, una vez por carga**: NO cae bajo la
  regla de SCROLL-2, y por eso puede tocar `textContent`. En `tabular-nums`
  para que el renglón no baile.
  ⚠️ **Caché de CDN obligatorio** (`s-maxage=600`): esta respuesta la pide la
  portada, que se lleva el tráfico del negocio entero.
  ⚠️ **DOS LECCIONES DE MEDICIÓN, las dos rojos míos**: (a) en Playwright manda
  la **ÚLTIMA** ruta registrada, y puse la específica primero — el contador
  recibía un `{ok:true}` sin `total` y parecía defecto del código; (b) medir
  «se ve» y «no se desborda» **no es medir DÓNDE**: en escritorio la pieza caía
  al fondo, debajo de los CTA y medio fuera del pliegue, porque no tenía área en
  la rejilla del hero — en móvil no se notaba. Hoy el careo exige el **orden
  visual** en los dos anchos.
  ⚰️ Se quitó el renglón «Nos han acompañado» (Memo + Jane): hablaba en PASADO
  mientras la pieza dice «y contando». **Ninguna aserción lo exigía**, así que
  no se jubiló nada — se AGREGÓ el candado que faltaba, porque una decisión que
  vive solo en un comentario es un candado prometido.

- 🔴 **DOS ROJOS ANOTADOS COMO TUERCAS PROPIAS (21-sep-2026, orden de Memo:
  «no los toques hoy»).** Los dos están en pie en `main` y **ninguno lo trajo
  una rama de esta sesión** — se midieron contra `origin/main` antes de decirlo.

  **1 · `mide:tira-agotados` → 142 verdes · 1 ROJO en `[12a]`.**
  `✗ ningún agotado de la ventana está en el top: no se puede probar que el
  chip se retire`. 🔒 **Anclar el careo NO lo arregla** — se probó: ANCLAR-CAREOS-1
  (#749) le fijó el `HEAD` a `d39ba61` y el rojo siguió igual. **El caso no
  depende del árbol, depende del RELOJ**: `univ` se arma con
  `!esPasado(e)`, que mira HOY. El que cumplía el caso era **Young Miko
  (19-sep)** —estaba en `TOP_REAL` *y* en la ventana—; pasado el 19 sale del
  universo, y la ventana de hoy (neighbourhood 23-sep · straykids 25-sep ·
  ironmaiden 2-oct) no tiene a nadie del top.
  ⚠️ **El arnés está haciendo lo correcto**: se niega a pasar en vacío y lo
  dice (ver *el éxito vacío también habla*). Arreglarlo pide **congelar el
  reloj** dentro del careo, que es tuerca propia — y entonces habrá que decidir
  si `TOP_REAL` (hoy una foto tecleada) se congela con él.

  **2 · `npm run vigia:color` → 🔴 «EL COLOR EN LÍNEA CRECIÓ».**
  `js 959` contra la base `cd251cc` de 888; el HTML **no se movió** (187 = 187).
  Medido en un worktree aparte sobre `origin/main`: **da exactamente lo mismo**,
  así que es anterior a esta sesión. Los **+71 en `.js`** vienen de después del
  4-sep y nadie los ha triado.
  ⚠️ **No confundir con `vigia:color-literal`**, que está 🟢 y es **el medidor
  de la serie COLOR** (ver el bloque de COLOR-0/COLOR-1: convertir hex→token no
  mueve el número de `vigia:color`). Antes de mover la base con `--rebase` hay
  que **mirar los 71** y ver cuántos son deuda de verdad.

- 🏆 **GIVEAWAY-KG-1 FASE 1 EN PROD (21-sep-2026, #747): el giveaway de Karol G
  abre registro.** `/giveaway` y `/sorteo` repuntados de Natanael a **Karol G**
  (7-nov-2026, Estadio BBVA), slug `karolg-bbva-2026`. Candado de las tres redes
  (buena fe: el follow NO se verifica por API), campo de Instagram, **foto del
  participante en bucket PRIVADO** `giveaway-fotos` (sube por function, jamás
  llaves en el cliente), cuadrícula de revisión para celular, aviso de fotos
  pendientes antes del giro (avisa, **no bloquea**), botón de huérfanas (6 h) y
  premio doble por ciudad. `npm run mide:giveaway-karolg`, **177 aserciones**.
  🔒 **La mecánica del giro NO se tocó: es Fase 2.**
  **CIERRE `2026-10-01T20:00-05:00` · SORTEO `2026-10-01T21:00-05:00`.**
  🔴 **Lo que se cazó midiendo, y ninguna lectura habría visto:**
  - **El cron estaba FUERA de su propia ventana** (`55 16 * * *`, heredado de
    melanie): el recordatorio **no habría salido nunca**, sin error ni log. Hoy
    el careo carea el `schedule` contra la ventana y truena si se separan.
  - **Las fechas vivían en TRES runtimes y solo se movió uno.** Las CUATRO
    copias del navegador se quedaron en el 13-sep de Natanael, así que
    `ahora >= CIERRE` era cierto y la página anunciaba **«EL REGISTRO CERRÓ» el
    día que abría el registro**.
  - **El correo del recordatorio venía de MELANIE**: anunciaba «las 12:00 PM»
    para un sorteo de las 9 PM. **Sobrevivió DOS giveaways** mintiendo, porque
    solo se renderiza el día del sorteo dentro de una ventana de 40 minutos.
  - **/sorteo seguía entero en la época anterior**: título, dos fechas, el
    bloque de rescate completo (artista, venue y el `?text=` del WhatsApp) y el
    link del nav.
  🔒 **LOS LETREROS SE DERIVAN, NO SE SUSTITUYEN** — sustituir es lo que se
  pudrió dos veces (melanie → Natanael → Karol G). Hoy salen de `SORTEO_TS`, de
  `G.SORTEO` y del catálogo, y **si no se pueden derivar NO SE MANDA NADA**. Lo
  único tecleado que queda es el nombre del artista en el rescate de /sorteo.
  🔒 **SON DOS CORREOS, NO TRES: no existe correo al ganador.** Se le habla por
  WhatsApp y el reloj de 10 minutos de /sorteo es la puerta. Medido contando
  llamadas a Resend en las 7 functions del giveaway, y el careo lo fija.
  🔒 **El barrido de restos va sobre lo SERVIDO, no por grep** (careo `[9]`):
  el texto que la gente VE + title/og/href, **incluidos los bloques ocultos**
  —el rescate está oculto en 4 de los 5 estados y era justo el sucio—, con
  control positivo en los dos caminos de lectura. Y al `<script>` se le quitan
  los **comentarios**, no el script entero: un `var x = 'Natanael'` sí debe caer.
  ⏳ **`CODIGO = 'KAROL'` del consuelo espera su fila**: tiene que existir en
  `promos_codigos` **y publicarse desde Baba**. Mientras no esté, el handler se
  rehúsa con 409 — no puede mandar nada roto.
  ⚠️ **`mide:tira-agotados` trae 1 rojo PRE-EXISTENTE** (`[12a]`, premisa
  caducada de LAND-2) y su `HEAD` sigue **sin anclar**: no se tocó aquí a
  propósito, es tuerca propia.

- ✅ **SERIE LAND-2 CERRADA (19-sep-2026, #737/#738/#739): la portada dejó de
  mentir.** Tres tuercas, `npm run mide:tira-agotados` (**150 aserciones, el
  primer careo VERSIONADO del hero**), cero SQL. Ninguna tocó `heroALaVenta` ni
  la tarjeta grande.
  - **LAND-2** (#737) — la tira del hero deja de filtrar «a la venta»: su
    universo son los **próximos por fecha**, agotados incluidos, con sello
    AGOTADO. El problema medido: la portada decía «Próximo evento: Natanael
    Cano, 2 oct» mientras Young Miko (19 sep), The Neighbourhood (23 sep) y
    Stray Kids (25 sep) ocurrían antes y no salían en ningún lado.
  - **LAND-2b** (#738) — **los agotados próximos le ganan el lugar al top.**
    🔴 #737 quedó servido y **en vivo no cambió nada**: el universo se abrió
    pero el ORDEN quedó igual, y el top contesta siempre con vendibles. El
    orden pasa a ser **ventana de agotados `[hoy … la fecha de la tarjeta
    grande, inclusive]` → top → respaldo por fecha**.
  - **LAND-2c** (#739) — las tres decisiones de Memo: sin chip #N para quien
    entró por la ventana, sello **PRÓXIMAMENTE** con su propia puerta, y el año
    en la fecha cuando no es el año en curso.
  - 🔒 **El veredicto de la tira NO se copia: se pregunta a `_evVeredicto`**, la
    misma función que decide la clase `.agotado` de la tarjeta del catálogo.
    `heroALaVenta` (de LAND-1) sí es una copia a mano; el careo la vigila
    evento por evento contra la tarjeta RENDERIZADA.
  - 🔒 **El candado hero↔catálogo de LAND-1 no existía**: vivía como comentario
    y su arnés nunca se versionó. Nació en #737, versionado.
  - ⚠️ **Lo que costó la lección**: el careo de #737 midió que el camino del top
    FUNCIONA pero nunca exigió que por ahí **salieran** los agotados. El
    «antes/después» de esa PR era el respaldo, que producción no toma. Desde
    #738 el careo sirve el top REAL (`event-clicks`) y exige el resultado en
    ese camino, no la maquinaria.
  - ⚠️ **Un control positivo caduca cuando su pasado se vuelve presente**: al
    mover el BASE del careo tres veces (e6633b1 → #737 → #738), las aserciones
    «BASE no hace X» se volvieron falsas **por construcción**. Se retiran con su
    razón ESCRITA en el código, nunca en silencio.

- ✅ **ÉPOCA DE AGOSTO CERRADA (26-28 ago 2026, #603-#630): cinco series, todas
  en producción, cada una con su arnés anclado a dos commits y su careo doble
  de la casa.**
  - **HER-UX-1** (#603-#613 + FIX #614 y FIX-2 #615) — las Herramientas, 11
    tuercas y 310 aserciones. Los tres síntomas del uso real eran **la misma
    forma**: una lista escrita a mano al lado de la realidad que describe.
  - **RAD-UX-1** (#616-#623) — el Radar del Dragón, 8 tuercas y 165 aserciones.
    **SIETE aritméticas de calendario en una sola pantalla.** Más
    **RAD-FIX-CAMINO** (#625) y **RAD-GIRU-R4-FIX** (#626).
  - **TZ-UNIF-1** (#624) — los 14 `America/Cancun` unificados a
    **`America/Matamoros`**. Los instantes guardados NO se tocaron: cambia solo
    cómo se pintan. Quedan **64 usos de `America/Monterrey` en 36 archivos**, anotados
    sin urgencia y **sin triar**: Monterrey es una ciudad real del negocio
    (Arena Monterrey), así que algunos serán correctos y otros el mismo error
    de suponer el reloj de Reynosa. Son tuerca propia **con su medición**, no
    un cambio de contrabando. (El número que la memoria traía —19— era falso:
    medido el 28-ago dan 64.)
  - **CREA-1** (#627-#629) — las cortesías, de contrato a kit. 183 aserciones,
    **cero SQL**.
  - **MEL-REGRESA-1** (#630) — la tarjeta de melanie vuelve como pasado.

- 🎟 **CORTESÍAS (CREA-1, 28-ago-2026): el camino manual de Jane, hecho botón.**
  Un **🎟 Cortesía** en cada contrato **firmado** del panel de Contratos
  (`cortesia_asignar`, en `admin-coordi-asignaciones`).
  - **La PLANTILLA del contrato decide el paquete**, tabla explícita y **sin
    default**: `creadora`→CHEAP · `coordinador` y `auxiliar_admin`→PLUS. Una
    plantilla que no esté en la tabla se **rechaza** y ni siquiera pinta el
    botón. Y con el paquete cambia **la lista de zonas**: `cheapZonas` vs
    `zonas` — no son la misma.
  - 🔒 **NINGÚN GASTO SE CAPTURA POR UNA CORTESÍA.** La inversión en boletos ya
    pesa completa en la utilidad desde el día uno (**UTIL-C**). El boleto ya
    está comprado: la cortesía solo lo saca del inventario. Capturar un gasto
    aquí lo contaría **dos veces**. El aviso va **a la vista en el panel**.
  - 🔒 **La talla se pide en el contrato** (CREA-1a) y **su procedencia viaja
    con el dato**: `talla_origen` distingue `'contrato'` de
    `'capturada_al_asignar'`. El predicado es **`datos->>'talla'`, NO el objeto
    `datos`**: hoy 26 de 26 firmados traen `datos` y **ninguno** trae talla.
  - 🔒 **`stock_ajustes` SUMA** (UNIQUE en `evento_id,zona`), así que el segundo
    clic duplicaría boletos: la cortesía queda **sellada en `datos.cortesia`**
    del contrato y no vuelve a tocar nada. Cero SQL — `datos` ya era jsonb.
  - 🔒 **El candado del doble descuento** (CREA-1c): una fila de
    `viajeros_evento` puede descontar stock **por su cuenta** si
    `consumeBoleto(paquete, tipo)` lo dice — solo `cliente` y **`tipo_viajero`
    en NULL** lo hacen. Como la cortesía suma a `vendidos_fuera`, una fila que
    además descontara restaría **el mismo boleto dos veces**. Se le **pregunta
    a `consumeBoleto`** (su dueño) y el PATCH **sella el tipo**.
  - **Si la persona ya viaja, el botón COMPLETA, no inserta** (el caso Victor:
    `viajero_upsert_staff` ya le había creado la fila al aceptar el tour).
  - ⚠️ **NO se aprieta para `calle24`.** Day y Victor ya están hechos a mano y
    sus filas no casan con el contrato (Day sin correo, con apodo): insertaría
    un duplicado y sumaría boletos de más. De ahí en adelante, el botón.

- ✅ **CERRADO en esta época (jul-ago 2026), no volver a abrirlo:** el dinero del
  Palacio (**FIN-1**, #473-#476) · la cuenta por evento en una sola fuente
  (**AUD-1**, #477-#482) · la merma (**MER-1**, #483) · los saldos con migrados
  (**SAL-1**, #484) · el candado de Posponer (**SEG-1**, #488) y las 4
  herramientas con candado (**SEG-2**, #487) · la sesión vencida que manda al
  login (**SES-1**, #489) · la lista de espera que avisa al publicar (**WL-1**,
  #490) · el catálogo de agosto y la contraofensiva 2x1 (**CAT-1/2/2b/3/3c**,
  #485, #486, #491, #492). Cada una tiene su arnés y su reporte en la PR.
- ✅ **ÉPOCA ESF CERRADA (26-ago-2026, #571-#590) — el catálogo COMPLETO se
  gobierna desde Esferas: 102 de 102.** Empezó en 27. Careado sobre el árbol
  publicado: **0 con brecha, 102 reproducen su objeto, 102 parsean, y el juez
  semántico sigue vivo** (se le siembra un cambio y lo caza en 20 de 20
  probados). 60 vivos · 42 pasados.
  **Los pasados entran como ARCHIVO**: sin pasar el juez —cerrar brechas de
  eventos muertos no paga— y **vetados para publicar EN EL SERVIDOR**, en los dos
  caminos que compilan. Su ficha está incompleta a propósito y el index sigue
  siendo su fuente de verdad; la lista lo dice con un sello y una frase, no con
  un botón apagado.
  ⚠️ **No re-excavar** "qué campos faltan por gobernar": no falta ninguno. Si un
  evento nuevo no es gobernable, es un campo NUEVO en el catálogo, no una brecha
  vieja — y el diagnóstico del importador lo dice por su nombre.

- 🔒 **LAS DOS REGLAS QUE DEJÓ LA ÉPOCA ESF.** Las dos nacieron de un bug real y
  las dos se comprueban con un careo, no con buena voluntad:

  **1. Lo que el compilador EMITE va en `CAMPOS_DEL_COMPILADOR`.** Ese `Set` le
  dice a `fusionarConViejo` qué administra el compilador. Una llave que se emite
  pero no se declara queda **en tierra de nadie: se escribe y NO SE PUEDE
  BORRAR**, porque el fusionador la re-inserta desde el objeto viejo. Mordió dos
  veces —`noStay` en E1e y las tres banderas de #580, vivas en straykids y
  wwemexico— y una tercera casi: un comentario al final de la línea se comió
  `'lineup','multifecha'` del Set.
  **El careo es el BARRIDO DE DOS RAMAS**: generar un objeto con todo encendido
  —por las **dos** ramas del emisor, porque `rideOnly` gana sobre `cheapOnly` y
  una sola pasada no las saca las dos— y comparar sus llaves de nivel 1 contra el
  Set. ⚠️ **El Set se EVALÚA, no se lee con regex**: un regex sobre el texto
  crudo cuenta lo comentado como declarado, y por eso el arnés dijo "no falta
  ninguna" mientras dos faltaban.

  **2. Los vencimientos se teclean en REYNOSA (−05:00) y se guardan como
  INSTANTE.** Reynosa sigue el horario de EE.UU., **no el de Monterrey**.
  Careado contra un `expiresTs` real: el COMPA de `arre`, `1778427681035`, son
  las **10:41:21 del 10-may en Reynosa**; en Monterrey serían otro instante, una
  hora después. Guardar el instante —y no un texto con huso— quita la pregunta:
  no hay literal que escribir mal. Los `-06:00` que quedan en el catálogo son de
  mayo y son **legacy**.
  ⚠️ **La pantalla pinta en Reynosa, no en la hora del navegador**, y los
  milisegundos se conservan si el reloj de pared no cambió: un `input type=time`
  solo llega al segundo, así que sin ese candado editar cualquier otro campo le
  movía el vencimiento a un evento que nadie tocó.

- **El Palacio (KameHouse) ya está en el sistema visual de la casa**: serie KH
  completa en prod (KH-1 cimientos · KH-2 Guerreros Z · KH-3 las mesas ·
  KH-4 barrido). Lo que **NO se toca** y no hay que re-litigar: los 7 temas
  personales (74 de los ~93 acentos de color son suyos) y la tipografía
  (Rajdhani/Zen Dots viven en todo el Palacio, no solo en GZ).
- **Fase 2 (Portal Clientes)**: en construcción sobre Supabase. La **serie PP
  (el portal con vida) ya cerró completa** en prod: footer + radio (#379),
  fotos de artistas en el wizard (#380), dashboard con hero/countdown/
  celebración (#381), familia visual (#382) y el pool de 140 saludos (#383).
- **`pagos.html` ya es "a prueba de error"** (PG-1, en prod): el selector de
  paquete pliega la cuenta que no toca. Tres candados que NO se pueden romper —
  sin JS se ven las dos cuentas, con `localStorage` bloqueado sigue
  funcionando, y `pagos.html#bbva` / `#heybanco` abren esa cuenta aunque esté
  plegada (los correos de cobranza enlazan así). Las políticas nunca se pliegan.
- **Fase C del Portal — la barra de % de pagos**: hoy el dashboard NO baja los
  montos pagados, así que la barra no existe **a propósito** (inferirla sería
  inventar una cifra de dinero). Entra cuando la Fase C amplíe los datos de
  pagos. No re-proponerla antes.
- **melanie: ÉPOCA NUEVA — la tarjeta volvió al index** (**MEL-REGRESA-1**,
  28-ago-2026, orden de Memo). Revierte UNA parte de MEL-FRENTE-1 (#508): la
  tarjeta jamás debió salir de la vitrina. Vive otra vez en el EV como **evento
  pasado agotado** (`st:'agotado'`, 6-ago-2026), con sus 15 zonas y sus precios
  históricos, y el mapa restaurado (`mapas.js` + `mapas/melanie.jpg`).
  **LO QUE NO REVIVIÓ, y no revive:** el sorteo, el banner del giveaway, los
  códigos `HADES` y `MELANIE`, y el `flashPromo` — murió con el sorteo.
  Tres podas medidas al recuperarla: sin `flashPromo`, **sin `pagos`** (ESF-E0 lo
  mató del catálogo entero: 0 de 105 lo llevan) y **sin `added`** (la sacaría en
  el filtro *Nuevos*, que mira los últimos 30 días).
  🔒 **El libro del Portal sigue VACÍO a propósito** — 0 gastos, 0 ingresos y
  saldos en $0 en las tres cuentas. El libro arranca en blanco a propósito (el 1-sep dejó de ser la vara; el hecho no cambia). Si
  Memo quiere que "cuánto tengo" diga su banco real, **capturará un ingreso de
  "saldo inicial" por cuenta al arrancar**: no es un dato que falte, es el primer
  asiento de la época nueva. La nota de "la caja de melanie es −$10,781" **NO
  APLICA**: quien la cite está citando una época anterior.
  **Los 22 viajeros del Excel ya viven en `viajeros_evento`**, incluida la
  ganadora del giveaway (anotada como tal).
  ⚠️ **melanie NO tiene fila en `esferas_eventos`** (104 filas, ninguna suya), así
  que **no sale en la lista de Esferas** — la lista lee solo la tabla, sin mezclar
  con el index; no es un error, simplemente no aparece. **Medido: sobrevive una
  publicación completa, byte a byte** — `compilarEV` es un UPSERT que nunca borra.
  Si se quiere gobernarla desde Esferas, se siembra con *Traer del catálogo*.
  ⚠️ **El módulo del sorteo sigue entero en el árbol** y MEL-FRENTE-1 nunca lo
  tocó: `giveaway.html`, `sorteo.html` y 7 funciones. ⚰️ **Lo que decía aquí —que
  `giveaway-consuelo.js` trae `CODIGO='MELANIE'` y enlaza a `/melanie`— CADUCÓ:**
  GIVEAWAY-NATA-1 (6-sep) lo repuntó a NATA y CONSUELO-VERDAD-1 (14-sep) le quitó
  las últimas dos mentiras. **Ese correo ya NO está muerto: espera el botón de
  Memo** (ver el bloque de CONSUELO-VERDAD-1 abajo).
  Dos cosas que dejó aprendidas el borrado y valen para el próximo:
  **las 15 tablas satélite llavean por SLUG** (el uuid solo vive en `eventos`), y
  **`compilarEV` es un UPSERT que nunca borra** — un evento ausente de
  `esferas_eventos` NO se puede despublicar publicando.
- 💜 **CONSUELO-VERDAD-1 · EL CORREO DE CONSOLACIÓN YA NO MIENTE, en prod
  (#736, 14-sep-2026). Ni un correo disparado todavía: espera el botón de Memo.**
  La plantilla de `giveaway-consuelo.js` traía DOS textos tecleados heredados de
  melanie —ciertos el 5-ago, falsos para NATA—: la vigencia decía que el código
  moría ese mismo día a las 8 PM (vale hasta el **domingo 20-sep 11:59 PM**) y el
  cierre decía que el concierto era «mañana» (natanael es el **2-oct**). Es el
  mismo error del «30% de descuento» de GIVEAWAY-NATA-1, en otras dos líneas.
  **Doctrina PROMO-DERIVA aplicada a las fechas:** la vigencia sale de
  `expires_at` de la fila viva de `promos_codigos` pintada en `America/Matamoros`
  y la fecha del evento del `ds` del catálogo (`_lib/catalogo-index`). Sin dato
  legible **no se manda nada** — y `seco:true` pasa por las mismas guardas y
  ENSEÑA las dos líneas derivadas, para verlas antes del botón.
  🔴 **La guarda muerta que tronaba el handler:** quedaba un lector de la
  constante `MUERE` que GIVEAWAY-NATA-1 borró. **El botón contestaba
  ReferenceError antes de hacer nada** — nadie lo había apretado desde entonces.
  Es la hermana de la guarda inalcanzable: aquí el hueco no era una rama que no
  se alcanza, es un LECTOR sin su dato.
  🔒 **LA TERCERA MENTIRA, y es LEY nueva: la FILA VIVA no es lo que el cliente
  ve.** El index no lee `promos_codigos`: lleva su COPIA en `var PROMOS`, y esa
  copia solo se refresca cuando alguien **publica los códigos desde Baba**.
  Medido el 14-sep: la fila de NATA vencía el 20-sep y **el index en producción
  la traía vencida desde el 1-sep** (la fila la editó `jane-giveaway-nata` el
  7-sep y nadie publicó). El correo habría mandado a ~88 personas a un **«Código
  expirado»**. Hoy el handler lee el `PROMOS` **del index SERVIDO** y exige que
  honre el código AHORA **y que venza en el MISMO instante que la fila**; si no,
  409 diciendo «publica los códigos desde Baba». Hermana de
  `flash_promo` era una COPIA: **todo letrero que viva en el index es una copia
  con fecha de caducidad propia.**
  **El careo** (`npm run mide:consuelo-verdad`, 50 aserciones): los DOS lados son
  commits, entra por el **handler REAL** con `fetch` doble, la promo entra por
  `_promoViva` real con la **fila real** y el index vencido sale de **BASE**
  (anclarlo a HEAD hizo caducar el caso en cuanto se publicaron los códigos: **el
  verde también caduca**). Las aserciones de ausencia se hacen sobre **el HTML
  IMPRESO**, no sobre el fuente. 🔒 **Ni un correo**: Resend se cuenta en el
  doble y la red real tiene que dar 0, con **control positivo** (la corrida buena
  cuenta exactamente 2 envíos: si el contador no ve envíos, sus ceros no dicen
  nada) y **cuatro sabotajes** con sha1 comprobado, los cuatro en rojo.
  ⚠️ **Dos errores del careo que valen más que la tuerca:** (a) el caso «catálogo
  sin fecha» salía VERDE por la razón equivocada —se rehusaba la guarda del sitio
  y la caché de 10 min de `fetchCatalogo` tapaba el resto—; lo destapó un
  sabotaje, y hoy corre PRIMERO y con el reloj 20 min atrás para no envenenar la
  caché de los demás; (b) la sonda que le quitaba `ds` a natanael rompía el EV
  entero, así que el 409 salía por «catálogo ilegible». **Las dos son la misma
  forma: el resultado correcto por la razón falsa.**
  ⏳ **Para apretar el botón:** códigos publicados (✅ ya quedaron en la
  publicación de Esferas del 14-sep: el index trae `startTs` del 14 y el mismo
  vencimiento que la fila) · ensayo `seco:true` y leer `validez`/`evento` ·
  **visto de Memo al render** · botón.
- 🌉 **MIG-1d-i · EL PUENTE AL PORTAL, en prod (7-sep-2026). Ni un correo.**
  🔴 **Lo que lo destrabó fue una medición, no una idea:** el Portal estaba
  **vacío** —`clientes` 1, `solicitudes_tour` 0, `pagos` 0, `lugares` 0— mientras
  KameHouse tiene **2,447 viajeros migrados** (1,318 con correo). Y
  `portal-reclamar-cuenta` solo enlaza a quien se registra si encuentra una fila
  de `clientes` con SU correo. Mandar la invitación de 1d antes del puente habría
  llevado a ~1,900 personas a un portal que no las reconoce.
  **Lo que hace:** `admin-portal-puente` (POST `{evento_id, accion}`) agrupa a los
  viajeros **por correo**, da de alta el walk-in en `clientes` del Portal y
  escribe `portal_cliente_id` en **todas** las filas de esa persona. Con **vista
  previa obligatoria** que enseña NOMBRES y motivos antes de escribir.
  🔒 **CERO ESCRITURAS DE DINERO, y es regla:** `admin-saldos` suma los `pagos`
  en estado `'pagado'` como entradas de caja, y el dinero migrado YA está contado
  por `saldoMigrado` en `_lib/cuenta-evento`. Copiarlo al Portal lo contaría dos
  veces. El plan lo SIRVE `portal-mi-plan-migrado`, **leyendo** KameHouse y
  usando **la misma `saldoMigrado`** — no una fórmula nueva.
  🔒 **`viajeros_evento.usuario_id` NO es el enlace al Portal: es el del STAFF**
  (el único valor puesto apunta a `usuarios`, Victor coordinador). El diseño de
  MIG-1 decía que ahí iría la invitación; reusarla habría metido dos significados
  en una columna. El enlace nuevo es `portal_cliente_id` (SQL de Jane, con la
  bitácora `invitaciones_portal` y **RLS deny-all**: no tiene lector de navegador).
  **Las dos trampas, resueltas LEYENDO la base y no suponiendo:**
  `numero_cliente` lo asigna el trigger `clientes_before_insert` con
  `nextval('numero_cliente_seq')` cuando llega null —así que el puente lo
  **omite**—, y ese mismo trigger baja el correo a minúsculas, que es la llave
  del dedup (`clientes.correo` es **UNIQUE**). Y `clientes.talla_playera` tiene un
  **CHECK de XS…XXL** mientras la de `viajeros_evento` es texto libre: se
  normaliza o va **null**, porque una talla rara haría que la base rechace **esa
  fila sola** y el puente perdería a esa persona en silencio.
  **El careo** (`npm run mide:puente-portal`, 21 aserciones): entra por el
  **handler REAL**, simula un salto más adentro (el `fetch` a PostgREST) con una
  base falsa que respeta filtros, guarda estado, usa los nombres reales y modela
  el trigger. 🔒 **Mide EL HECHO de que no toca dinero** —cuenta las filas de
  `solicitudes_tour` y `pagos` antes y después y exige Δ 0—, **no un grep**. Con
  **control positivo**: un handler saboteado que sí escribe un pago pone el careo
  en rojo (Δ 1). Si el contador no puede ponerse rojo, su cero no dice nada.
  ⏳ **Falta MIG-1d-ii** (el botón que invita) y, antes del PRIMER envío real,
  **el render del correo pasa por visto de Jane y Memo** — como el consuelo.
  ⏳ **El primer evento real lo elige Memo, y chico.** El puente inserta en una
  base que hoy tiene 1 fila; `dalemix` metería ~156 clientes de golpe.
  ⚠️ **Y una duplicación que conviene saber:** la sub-pestaña **Viajeros de
  Capsule Corp** (`admin-viajeros-evento`) NO lee `viajeros_evento`: lee las
  `solicitudes_tour` del Portal, que son 0. KameHouse tiene **dos listas de
  viajeros** que no se ven entre sí.
- **Respaldos del NAS** (UGREEN): sesión pendiente. Radio Conecta vive ahí.
- **Cobros OXXO / MSI**: pendiente, y **ahora depende de Mercado Pago** — se
  replantea con el módulo de cobro nuevo, no sobre Stripe. ⚠️ El libro remitía
  a `REPORTE-COBROS-OXXO-MSI.md`, que **NO existe en el repo** (es de los `.md`
  sueltos sin commitear): un puntero a un archivo que nadie puede abrir vale
  menos que decir dónde está la decisión.
- ✅ **Hojas de impresión a nivel raíz: PODADAS** (IMPRESION-PODA-1, 4-sep-2026).
  **Eran CINCO, no cuatro**: las 4 de una línea y el bloque multilínea de la
  cotización (empieza con `@page`, por eso el grep viejo no lo veía). Quitaban
  la rejilla gris de TODAS las tablas y —lo que nadie había medido— **le pisaban
  a la app su `font-family:'Montserrat'`**: medido, BASE «Arial» → HEAD
  «Montserrat». Prescindibles porque `_printVentana` abre `window.open('','_blank')`
  **sin cargar kamehouse.css** y escribe su propio `<style>`.
- **El COLOR en línea del Palacio** (medido y congelado por KH-4, SIN RESOLVER —
  la deuda sigue, pagarla es otra tuerca). Y **49 `<th>` con su propio `color`
  que NINGUNA hoja de estilo alcanza**: la misma trampa de los `border-radius`.
  ✅ **El vigilante VOLVIÓ** (COLOR-VIGIA-1, 4-sep-2026): `npm run vigia:color`.
  🔴 **La autopsia de por qué el de KH-4 nunca cazó nada importa más que el
  arreglo: NO EXISTÍA.** `CAREO-*` está en `.gitignore`, ningún arnés se versionó
  jamás (`git log --diff-filter=A -- 'CAREO*'` sale vacío), no hay CI ni scripts
  de npm. Vivía como archivo ignorado en UNA máquina.
  🔒 **LEY: un vigilante que vive en un archivo ignorado no es un vigilante, es
  una nota.** Si tiene que sobrevivir a la sesión que lo escribió, va
  VERSIONADO — por eso éste vive en `scripts/`.
  ✅ **COLOR-0 (el mapa) y COLOR-1 (la primera fase) EN PROD, 7-sep-2026.**
  🔒 **EL VEREDICTO DE COLOR-0, que achica la serie a su tamaño real:** de las
  **1,075**, solo **194** escriben un color a mano. **811 ya son `var(--x)`** —y
  ésos NO son deuda: son el sistema de temas funcionando, porque `--ts` y sus
  hermanas **las sobreescriben los 7 temas personales**—, 68 son color semántico
  calculado y 2 son `inherit`. De los 194, **43 viven en documentos firmables,
  listas impresas y correos**, que NO cargan `kamehouse.css`: ahí el color en
  línea es **obligatorio**. **Convertibles de verdad: 151, el 14 %.** Y **CERO**
  vienen de la base: `usuarios.tema_acento` nunca llega a un `style=` en línea,
  cambia una CLASE de tema. Los dos vetos —temas y tipografía— **no se cruzan con
  el inventario**. Mapa en `DISENO-COLOR-0-mapa.md`.
  🔴 **EL MEDIDOR DE LA SERIE NO ES `vigia:color`, y descubrirlo costó una fase.**
  Ese vigía cuenta declaraciones `color:` dentro de un `style=`, y
  **`color:var(--red)` sigue siendo una**: convertir hex→token **no mueve ese
  número ni un punto** (medido: 187 → 187 tras 8 conversiones). El medidor es
  **`npm run vigia:color-literal`** — solo los escritos A MANO. COLOR-1 lo bajó
  de **194 → 186**, y `kamehouse.html` de **14 → 6**.
  **COLOR-1 · el cascarón:** de sus 14, **8 convertidas**, **3 marcadas con su
  razón EN EL CÓDIGO** (2 son tinta negra sobre un acento claro —no existe token
  «tinta sobre acento» y `var(--bg)` las rompería en `tema-america`— y 1 es la
  vista previa del contrato, papel blanco) y **3 escaladas**: `#04210f`,
  `#ffb020` y `#ffb47a` **no tienen token**, y COLOR-1 no inventa paleta.
  🔒 **DOS HALLAZGOS QUE VALEN PARA LAS FASES QUE SIGUEN:**
  - **La unidad de conversión es el PAR `color`+`background`, no la declaración.**
    Un `color:var(--text)` con un `background:#000` a mano se vuelve ILEGIBLE en
    `tema-america` (`--bg:#FAFAFA`, `--text:#2D2D3A`). El vigía solo mira `color:`
    — ve media pareja. Los tres inputs de la lista de espera se convirtieron **de
    a dos**.
  - **En `tema-america` hay reglas `!important` sobre `.btn` e `input` que YA le
    ganaban al hex en línea.** La deuda ahí no está ausente: está **TAPADA**, y se
    destapa el día que alguien quite un `!important`. En 4 de los 8 elementos el
    tema ya llegaba por esa vía.
  **El careo:** `npm run mide:color-tema` — color COMPUTADO elemento por
  elemento, BASE contra HEAD, en los dos temas; exige que el color **SEA** el
  token (resolviendo la variable en la página, no pareciéndose) y controla en los
  dos sentidos. 17 aserciones verdes. ⚠️ Se puso rojo **cuatro veces y las cuatro
  eran expectativas mías**: «todas las de BASE son sordas al tema» (falso: los
  `!important`), «todas las de HEAD lo siguen» (falso: ningún tema toca `--red`,
  y que los errores no se muevan es una PROPIEDAD), un ancla por prefijo de texto
  que agarró el `div` ANCESTRO, y dar por hecho que solo el token puede mover un
  color.
  ⏳ **Anotadas aparte, NO se cuelan en las fases:** (a) `esferas_eventos.color`
  está lleno en 111 de 111 filas y `eventos.color` en 16 de 16, y **no encontré
  ningún render que los pinte**; (b) los `const map = {…}` con hex por estado
  viven **fuera** de la ventana del vigía, así que el 1,075 es una ventana, no la
  casa.
  ⚠️ Los números viejos (827/158, y el 965/196 que circulaba) **no se pueden
  reproducir** con ninguna definición escribible: la base se remidió hoy y son
  **888 en los .js** (la serie MONO repartió `kamehouse.js` en 18 módulos) y
  **187 en el HTML**, contando `color:` dentro de `style=` en línea.
- ✅ **La barrita de progreso de `funciona.html`: LA DEUDA YA ESTABA PAGADA**
  (medido en FUNCIONA-BARRA-1, 7-sep-2026). **No anima `width`**: usa
  `transform:scaleX()` con `transform-origin:left center` y
  `transition:transform .1s`, y el JS escribe `bar.style.transform`. Se convirtió
  en **`03d1179`** («T7: funciona.html — los 5 hallazgos del hook») y este
  pendiente se quedó viejo.
  🔒 **Verificado EN LA PÁGINA REAL, no en el archivo** (la lección del `th` del
  Palacio): `#progress` existe, su `transform-origin` computa `0px 1.5px` —
  izquierda—, la transición es de `transform`, y al hacer scroll el transform
  pasa de `matrix(0,…)` a `matrix(0.32,…)` mientras el `width` **no se mueve**.
  ✅ **El `pulseDot` de `funciona.html`: SELLADO CON NÚMERO** (PULSEDOT-MIDE-1,
  7-sep-2026). Anima `box-shadow` en `infinite` sobre `.ftr-mini-dot` — la misma
  forma que las cinco del index— y **ya no se sella por parecido: se midió**.
  - **Método, el de SCROLL-2:** viewport 390×844, CPU frenada **4×**, scroll de
    2.600 px, 5 repeticiones por brazo (~1.560 fotogramas cada uno).
  - **Con la animación VIVA y APAGADA, los dos brazos dan lo mismo:** mediana
    **8.3 ms**, p95 **9.3-9.4 ms**, **0 fotogramas >32 ms**. **Δ = 0.0 ms (0 %)**.
  - 🔒 **El instrumento se validó con un CONTROL POSITIVO** (una animación cara
    de verdad inyectada en la página): mediana **39 ms**, p95 **72.7 ms**, **233
    fotogramas >32 ms**. El arnés SÍ ve un costo cuando lo hay — así que el cero
    de arriba es una medición, no un punto ciego.
  - ⚠️ **Y algo que el parecido escondía: durante el scroll el punto NUNCA SE
    VE.** Vive en `y=7.773` de una página de `7.810 px`: a la vista en **0 de 21**
    posiciones del scroll de 2.600 px. Por eso se midió un segundo escenario
    —**el pie quieto y a la vista**, el único estado donde de verdad se pinta— y
    ahí también da Δ 0. Medir solo el scroll habría dado «no cuesta» por la razón
    equivocada.
  - **Es UN elemento de 6 px**, no 31 pastillas: convertirlo pediría un
    pseudo-elemento para replicar el halo, a cambio de nada medible. Misma
    sentencia que las cinco: **se queda como está.**
  - **Límite honesto del método:** la mediana está cuantizada al vsync (~8.3 ms),
    así que un costo por debajo de ese grano no se vería. Es el mismo límite que
    tuvo SCROLL-2 (8.4 / 9.4 / 0), y por eso existe el control positivo.
  - 🔒 **Para re-litigarlo hay que volver a MEDIR** — y ahora el instrumento
    existe y está versionado: `npm run mide:animacion`, parametrizable con
    `PAGINA` y `SELECTOR` para poder remedir también las cinco del index.
- **Puente index→Portal**: Fase A en prod pero DETRÁS DE INTERRUPTOR
  (`RESERVA_PORTAL` / `?portal=1`). Falta decidir **su** encendido — que es
  otro, no el del correo: ése ya ocurrió.
- **Contrato de cuidador de bodega**: borrador esperando a Memo.
- ⚰️ ~~Wizard de comisiones CHEAP (F5a)~~: **murió con el borrado de vendedores** (ver abajo). No se re-propone.
- ⚰️ **PRs #53 (ranking DC2d) y #215 (cancelar-despublica): ABANDONADAS** por
  Memo el 5-ago-2026. Siguen abiertas en GitHub, y eso NO significa pendiente:
  no se mergean, no se retoman y no se re-proponen. Se dejan anotadas justamente
  para que nadie las "rescate" creyendo que se olvidaron.
- **Doc `kamehouse.md`**: bloqueado por permisos de macOS/TCC.
- ✅ **`ventas-resumen`: RETIRADO** (VENTAS-RETIRO-1, 3-sep-2026). El panel, su
  módulo `khVentas` y el endpoint `admin-ventas-resumen` ya se los había
  llevado **VEN-BORRA-1**; lo que quedaba eran **restos con dientes**: dos
  atajos a `showPage('ventas')` —que revienta contra un `null` y deja la app en
  blanco— y, sobre todo, la casilla de **Montaña Pai que OFRECÍA conceder
  'ventas'** como permiso extra (`_puedeVerTab` suma `tabs_extra`). Medido: 14
  usuarios, **0 con `permisos_extra`** — la trampa estaba armada y sin disparar.
  ⚠️ La columna **«Ventas» del Resumen NO es esto**: es un dato de la tabla
  (facturado · ventas · gastos · ganancia) y se queda.

### ⚪ Anotados sin urgencia (decisiones ya tomadas)
- 🔒 **SELLADO (SCROLL-2, 23-ago-2026): las 5 animaciones infinitas que pintan
  por frame en el index SE QUEDAN COMO ESTÁN.** Violan la letra de la regla de
  la casa ("solo `transform` y `opacity` en lo que anima por frame") y aun así
  no se convierten, **porque se midió y no cuestan**:
  - `cmxSlide` en `.nav` (background-position) · `pulse-red` y `pulse-yellow`
    en **31 `.ev-tag`** (box-shadow, una por tarjeta del catálogo) ·
    `pulseDotMain` en `.ftr-v2-dot` · `rcpPulse` en el punto de la radio.
  - **La medición:** scroll de 2.600px con la CPU frenada **4×**, viewport
    390×844. Mediana **8.4ms** por fotograma, p95 **9.4ms**, **0 fotogramas
    >32ms**. Con las cinco APAGADAS: mediana 8.3ms, p95 9.6ms, 0 largos —
    **mejora del 1%**, dentro del ruido.
  - **Por qué se sella y no se convierte:** la regla existe por el costo de
    reflow/repintado POR FRAME; aquí ese costo no aparece. Convertirlas a
    `transform`/`opacity` pediría cambiar el markup de las 31 pastillas del
    semáforo (un halo con box-shadow no se replica con transform sin meter un
    pseudo-elemento extra) para no ganar nada medible. Es cumplir la letra y
    perder el espíritu, como las 3 barras con radio ya selladas.
  - **Para re-litigarlo hay que volver a MEDIR, no volver a opinar** — y con
    números de un teléfono de verdad, no de Chromium con la CPU frenada, que es
    lo único que hubo aquí.
- **19 reglas del sitio siguen bajo el 4.5:1 de AA y NO son el token `--muted`**
  (ése ya subió a .46 en T6): blanco sobre botones de marca ~1.98:1, `.ftr-copy`
  a `.25` = 2.08:1, la familia `.3/.35/.4` de `pagos.html`, y `.cca` en
  `#0000cd` sobre negro = 1.88:1. Son **decisiones estéticas de Memo, no bugs**.
  El bloque [F] del arnés de T6 las imprime con su ratio en cada corrida.
- ⚰️ **MÓDULO DE VENDEDORES: BORRADO POR COMPLETO** (**VEN-BORRA-1**,
  #539-#542 + el SQL de Jane, 23/24-ago-2026). Decisión de Memo: *"todo todo,
  después lo intentamos de nuevo"*.
  ⚠️ **Esta entrada REEMPLAZA a la de VEN-PAUSA-1 (#507), que decía "en pausa,
  se replantea después, NO se borra".** Aquello duró cuatro días y ya no aplica:
  si alguien la cita, está citando una época anterior. El interruptor
  `MODULOS_PAUSADOS` y su careo de dos runtimes **ya no tienen a quién pausar**.
  - **Fuera del código:** los 7 endpoints (incluido `admin-liquidacion`, que la
    pausa nunca vio), las pantallas, el wizard del Palacio (que bajó a 2 pasos),
    el cron `ventas-limite-cron` y el bloque de vendedores inactivos de
    `radar-alertas`.
  - **Fuera de la base** (verificado en `information_schema` el 24-ago, no
    reportado): `comisiones_zona` y `comisiones_liquidadas` ya no existen; las 4
    columnas de vendedor están fuera de las tablas vivas; `usuarios_rol_check`
    quedó en `maestro_roshi · bulma · mister_popo · coordinador · cc · milk`,
    **sin `vendedor`**. Respaldos en `bkp_ven_*`. Había 0 usuarios con ese rol.
  - ⚠️ **`stock_ajustes.vendidos_fuera` NO es de vendedores** y se queda: es el
    contador de ventas sin registro. Casi se va en la barrida.
  - 🏆 **RASTRO CERO EN LAS DOS BASES.** Quedaba `pagos.registrado_por_vendedor`
    en el **Portal** —fuera de la lista de 1d, que era de KH—; Jane la verificó
    (0 valores) y la soltó. Careo final del 24-ago leído de
    `information_schema`: **ninguna** columna ni tabla viva con rastro de
    vendedor en KH **ni** en el Portal, respaldos `bkp_ven_*` en pie, y
    `usuarios_rol_check` sin `vendedor`.
  - **La lección, y costó cinco días verla:** al borrar un módulo hay que barrer
    sus columnas contra TODO el repo **y contra las DOS bases**. El diseño de 1d
    listó las de KameHouse y la del Portal sobrevivió a la vista de todos —
    vacía y sin lectores, pero ahí. **El inventario de un borrado se hace por
    base, no por módulo.**
  - ⚰️ Muere con él el pendiente "capturar las primeras comisiones CHEAP"
    (wizard F5a). No se re-propone.
- **Resumen al admin de `contratos-alerta-cron`**: se queda SIN bitácora a
  propósito (correo interno). El arnés assertea ese comportamiento: si alguien
  lo cubre, la prueba truena y hay que actualizarla.
- **ALTER `lugar_id` en `avisos_cobranza`**: descartado por ahora. La referencia
  vive en `pago_id` (uuid libre sin FK) con `tipo` en la llave.
- **`--ink-mute` del Portal en 2.67:1**: viene de antes de PP-4, es decisión
  estética. Por eso `.dash-frase` usa `rgba(255,255,255,.72)` a pelo (≈10:1) —
  pasarla al token le TIRARÍA el contraste.
- **El bucket `HOY` del pool de saludos** (PP-2b): las 10 frases de "¡es hoy!"
  solo salen cuando el viaje más cercano es hoy o mañana, aunque el brief las
  marcaba como `[PRE]`. **Aprobado por Memo**, no re-litigar.
- **Cumpleaños 29-feb** en `cumple_hoy`: renglón futuro.
- Los `.md` sueltos de la raíz (borradores, checklists, reportes de auditoría)
  siguen SIN commitear a propósito.

### ⚠️ Reglas que cuestan caro olvidar
- 🔒 **FILA ROJA = CANCELACIÓN, EN LOS DOS EXCELES** (palabra de Memo, 1-oct):
  en las pestañas de Conecta 2026 Y en el libro de Numerología. El careo ya lo
  aplica en pestañas (barrido del 1-oct: 116 bajas, 0 errores; umbral 3 celdas
  calibrado contra Karol 7-nov y Álvaro 3-oct, exacto). El abonado NUNCA se
  toca en una baja. ✅ **Las dos chiquitas de `CAREO-ZONA-1B-BRIEF.md` quedaron
  (CAREO-ZONA-1b):** el rojo del LIBRO ya cancela y una baja aplicada ya NO se
  re-propone. ⚠️ Los `.gs` desplegados
  el 1-oct: pestañas es proyecto SUELTO (lleva `SPREADSHEET_ID` tecleado —
  el repo lo trae vacío, al re-desplegar hay que reponerlo del historial del
  proyecto), Numerología es ATADO (vacío correcto).
  🔒 **EL DINERO DE UN CANCELADO ES GANANCIA (regla de Memo, 1-oct): NO se
  reembolsa.** La fuente del monto: CHEAP manda **Numerología**; PLUS/STAY/RIDE
  manda **la pestaña de Conecta 2026**.
  🔴🔒 **ESTA REGLA ERA CIERTA A MEDIAS Y ESO COSTÓ $214,233** (corregida por
  CUADRE-FUENTE-1, 1-oct). Decía que «los abonos CHEAP los escribe el careo del
  libro y los demás el de pestañas» — y **no decía qué pasa cuando la MISMA
  persona trae dinero en las DOS**. Ahí vivía el doble conteo. **Palabra de Memo
  (1-oct-2026), citada:**
  > «Numerología es SOLO venta CHEAP y lleva los pagos COMPLETOS. La pestaña de
  > Conecta 2026 lleva los pagos de PLUS/STAY/RIDE. El CHEAP en la pestaña aparece
  > a veces sin saldo o solo con el separo — ese separo es REFLEJO, NO es dinero
  > adicional.»

  **La regla completa, como queda:**
  - **CHEAP** en las **DOS** fuentes → el abonado lo manda **EL LIBRO, SOLO**. El
    dinero de la pestaña (separo incluido) **no se suma**. Varias filas del libro SÍ
    suman entre sí: dos compras CHEAP son dos ventas, no un reflejo.
  - 🔒✅ **Y LA REGLA ESTÁ ACOTADA A CHEAP — palabra de Memo (opción B, 1-oct-2026),
    citada:**
    > «La regla “el libro manda el dinero” se limita a CHEAP. Para una persona cuyo
    > paquete en la base NO es CHEAP, el dinero sigue mandando la pestaña aunque
    > aparezca en el libro — esa fila del libro es anomalía, NO fuente: sale en el
    > aviso (a) con sus montos y no suma ni resta un peso.»

    Esto cierra la pregunta que yo dejé abierta: sin acotar, a un PLUS con $5,000 en
    la pestaña y $3,000 en el libro se le quitaban $5,000 **que la pestaña SÍ posee
    por esta misma regla**. Aplicar una conclusión fuera del dominio de su premisa
    —el libro es venta CHEAP— era el defecto.
    - **El orden del respaldo cuando no se sabe el paquete**, dicho: manda la **BASE**
      (es el padrón), luego la **PESTAÑA**, y si ninguna lo sabe se trata como
      **CHEAP** — la única forma de estar en el libro es haber comprado un boleto
      CHEAP. 🔒 El respaldo **nunca inventa un no-CHEAP**, y eso es el lado seguro:
      equivocarse hacia «es CHEAP» deja el dinero en el libro y **se ve** en el careo;
      equivocarse hacia «no es CHEAP» lo deja sumado, que es lo invisible que costó
      $214,233.
  - solo en la **pestaña** → como siempre. Solo en el **libro** → como siempre
    (CUADRE-2c). Fila **roja** del libro → exactamente como CAREO-ZONA-1b.
  - 🔒 **El TOTAL, la zona y los boletos siguen siendo de la pestaña**: «el libro
    jamás pisa a la pestaña» no cambió. Lo único que cambió es **de quién es el
    dinero**.
  - ⚠️ **Y POR ESO ALGUNAS FILAS QUE «CUADRABAN» AHORA SUENAN.** El careo cuadraba
    con su propio error: el sistema traía el doble conteo escrito y el careo volvía
    a sumar lo mismo, así que se daba la razón a sí mismo. Ahora suenan como
    **negativas** — que **no se aplican jamás** («jamás se resta dinero»): salen al
    montón donde un humano las mira. Eso **es la detección**, no una regresión.
  - **Tres avisos nuevos, que NOMBRAN y no adivinan** (viven en `correrCareo`,
    porque preguntan por el paquete de la BASE que la fusión no conoce):
    (a) `libro_no_cheap` — en el libro con paquete NO-CHEAP en la base;
    (b) `pestana_sobre_separo` — **CHEAP** en las dos y la pestaña traía más que el
        separo, **con los DOS montos**: un dinero que deja de contarse no se calla.
        ⚠️ **RETIRADO del caso no-CHEAP** (y no en silencio): a un no-CHEAP ya no se
        le deja de contar nada, así que avisar ahí diría que se perdió un dinero que
        no se perdió y mandaría a buscar un agujero que no existe. Su puerta es la
        HUELLA que la fusión deja (`abonado_pestana`), no una segunda regla copiada;
    (c) `cheap_sin_libro` — CHEAP con dinero solo en la pestaña: su pago no tiene
        dueño que lo respalde, hay que completar el libro, no inventar la fila.
  - ✅ **LA PREGUNTA DEL PLUS-EN-LIBRO QUEDÓ CERRADA** por la opción B de arriba: su
    abonado es **el de la pestaña, intacto**, y sale **solo en (a)** con el monto del
    libro que se está ignorando. Ese aviso es el **ÚNICO sitio** donde ese dinero
    aparece — bajo la regla acotada no mueve un peso, así que sin la cifra nadie
    podría ir a buscarlo.
  - ⚠️ **UN FIXTURE VIEJO ERA INCONSISTENTE CON LA REGLA Y SE NOTÓ AL ESCRIBIRLA**:
    el candado de boletos de `mide:cuadre-numerologia` tenía a «Camila Dos» como
    **PLUS** en las dos fuentes. Con la acotación, las filas del libro de un PLUS ya
    no inflan `filas`, así que ese candado habría pasado VERDE **por no poder
    ocurrir** — letra muerta. Camila es CHEAP (que es lo que de verdad sería) y el
    candado vuelve a guardar donde el riesgo vive.
  🔒 **ANCLAS**: `mide:cuadre-fuente-1` quedó anclado al merge **2f65547** (BASE
  `55b5ee6`, donde la regla no existía). ⚠️ **`mide:cuadre-numerologia` NO ESTÁ
  ANCLADO** — como `mide:cuadre-aplicar`, carga de `RAIZ` (el árbol de trabajo), así
  que no hay ancla que mover aunque esta tuerca le cambió el sujeto: no sufre la
  trampa del commit, y en cambio no puede traer control positivo por commit porque
  no tiene BASE. Queda dicho dentro de los dos arneses, no solo aquí.
  ⏳ **LA AUDITORÍA DE LOS 141 SIGUE PENDIENTE Y ESTÁ BLOQUEADA POR LLAVES**: clasificar
  cada sobrepagado en doble conteo / contrato corto / legítimo exige la COSECHA real
  (la fuente se reconstruye de la cosecha, **no de la nota** — los abonos existentes
  dicen «Careo Excel…» aunque su dinero viniera del libro). Las llaves del cosechador
  **no están en este entorno** (`.env` trae una sola línea, `AIRTABLE_TOKEN`, del
  13-abr). 🔒 **No se sustituye con inferencias desde la base** — orden expresa.
  Recalculado el 1-oct sobre los 116 bajados: `total_contrato = lo abonado`
  (saldo 0, nada por cobrar ni devolver) — **$123,874 quedan como ganancia**,
  con nota por persona. ✅ **El careo de bajas nuevas YA lo hace (CAREO-ZONA-1c):**
  la baja escribe `total_contrato = abonado_previo + Σ abonos` en el mismo PATCH.
  ⚠️ ES LO **COBRADO**, no el `abonado_previo` a secas — con el previo pelado,
  quien traiga abonos encima se queda con saldo, y sería saldo A FAVOR del
  cliente. El abonado NUNCA se toca: el contrato es lo que se DEBE y moverlo no
  da ni quita un peso; el abonado es lo que el cliente PAGÓ.
- 🔴🔒 **UNA FECHA TECLEADA SOLO ES UNA BOMBA CUANDO ALGO LA COMPARA CONTRA EL
  RELOJ REAL** (medido el 1-oct en los cuatro arneses de la Nube). Las fechas de
  un fixture van **RELATIVAS a hoy** — o se le **INYECTA el reloj** al código que
  las lee. Lo que NO se puede es teclear las fechas y preguntarle «¿qué rige
  AHORA?»: esa mezcla mata, y mató a `mide:nube-4`.
  - `mide-nube-4` tenía fechas fijas y preguntaba por el AHORA → se podrió.
  - `mide-nube-3` tiene **8 vigencias tecleadas y NO se va a podrir**, porque
    inyecta su propio `ahora`: es un mundo cerrado. ⚠️ **Avisar de nube-3 habría
    sido mandar a buscar un hoyo que no existe** — el barrido por la CADENA
    «fecha tecleada» la acusa; el barrido por el HECHO la absuelve.
  - `mide-nube-5` nació con fechas relativas: la receta **no faltaba en el repo**,
    se ignoró en un solo sitio.
  - 🔒 Y el corolario del instrumento: al volver relativas las fechas, hay que
    exigir que el arnés **SÍ note el reloj** (correrlo con todo vencido y ver que
    la respuesta cambia). Si no, las fechas relativas taparon la medición.
- 🔒 **«ROCK 9» ES UNA AGENCIA — es el NOMBRE del comprador, no un código ni un
  error. NO SE VUELVE A PREGUNTAR (Memo ya lo explicó varias veces, 30-sep).**
  Le separa boletos CHEAP del Corona y sus pagos viven en Numerología; sus
  filas en viajeros_evento (coronacapital#0 y #2) están BIEN y su historial ya
  se reparó. Si el careo la nombra en negativas o avisos de Corona, es el
  estado esperado de una agencia con boletos repartidos entre el libro y la
  pestaña: **se deja en paz.**
- ⚠️ **El Excel de arjona escribe «Segundo Nivel»; la ficha dice «2do Nivel».**
  Son LA MISMA (palabra de Memo, 30-sep) pero la puerta no adivina palabra↔
  numeral, así que cada persona nueva de esa zona se atorará en el careo hasta
  que las chicas escriban «2do Nivel» en la columna Boleto. Giovanna y
  Samantha entraron a mano con la zona buena.
- ⚠️ **Natanael Cano SE POSPUSO al 27-Nov-2026** (aviso de Memo, 29-sep). La
  pestaña nueva es «Natanael Cano - 27 de Noviembre» y el mapeo de
  excel_pestanas ya apunta ahí (acta 30-sep).
- 🔒 **EL CAREO NO CAPTURA PEDIDOS/COMPRAS.** Escribe abonos, totales, boletos
  por persona, chatarra→vendidos_fuera y altas — el inventario (compras con
  costo) NUNCA: es el paso 6 del plan (stock real en Kamisama), tuerca propia
  con proveedor obligatorio por DEFAULTS-1.
- 🔒 **No cuelgues NADA de `.hs-media` (ni de la portada de una tarjeta).**
  `showInitials()` —el fallback de la foto del artista, **asíncrono**— hace
  `imgEl.parentElement.innerHTML = ...` y **reescribe la portada entera** cuando
  la API no contesta. El sello AGOTADO vivía ahí y se iba con ella: medido, la
  tira quedaba con «AGOTADO» en Stray Kids y sin él en Young Miko y The
  Neighbourhood, según a quién le fallara la foto y cuándo — **un evento
  agotado se anunciaba como disponible por una carrera de red.** Lo que debe
  sobrevivir cuelga del **hermano** (`.hs-item`), no del interior. La pregunta
  no es «¿quién escribe aquí ahora?» sino **«¿quién puede reescribir esto
  alguna vez?»**.
- 🔒 **Un AGOTADO no abre la ficha, y un PRÓXIMAMENTE tampoco.** Medido:
  `showDetail()` sobre un agotado abre el **cotizador completo** —viajeros, los
  4 paquetes, «elige tus opciones para ver tu cotización»— sin una sola zona
  libre detrás y sin decir AGOTADO. El catálogo cierra esa puerta a propósito
  (`if(!isPast&&!isAg)` le quita el onclick). Las puertas buenas, medidas en la
  tarjeta real: **agotado → WhatsApp** (lo que el catálogo ya hace con
  `proceso`/`solo-viaje`), **próximamente → `abrirWaitlistModal(ev)`** (el
  AVÍSAME; recibe el EVENTO, no el id).
  ⚠️ Asimetría del catálogo, por si muerde: `st:'proximamente'` abre el AVÍSAME,
  pero `st:'pronto'` —**rotulado igual**, «Próximamente»— cae en `showDetail`.
  En la tira los dos van al AVÍSAME. Hoy hay **0 eventos en `pronto`**.
- 🔒 **Hay TRES `fechaCorta` distintas con el mismo nombre.** La del **hero**
  (`index.html`, dentro de la IIFE de LAND-1, firma `fechaCorta(ds)`, **un solo
  llamador**: la tira) — es la que dice el año desde #739. La del **banner de
  noticias** (`index.html`, otra IIFE, firma `fechaCorta(ev)`, usa `MESES3`). Y
  la de **`rol.html`**. Antes de tocar «la» fechaCorta, barre las tres.
- 🚌 **Para dejar un evento vendiendo SOLO VIAJE: agota sus zonas Y prende
  `rideOnly`.** Las dos cosas, no una. Agotar las zonas a secas hace que el
  auto-semáforo marque la tarjeta AGOTADO y la cierre —aunque el RIDE siga a la
  venta—, porque solo cuenta zonas de boleto. Con `rideOnly` prendido la
  tarjeta dice **«Solo viaje»**, muestra el precio del RIDE y abre el flujo
  directo (RIDE-VIVO-1). Es lo que Memo hizo por instinto en straykids.
  **El estado se apaga solo** cuando el viaje de verdad se acaba: en multifecha,
  cuando TODAS las fechas tienen `rideAgotado`. Y ojo: `st:solo-viaje` es
  OTRA cosa —manda a WhatsApp y cierra la venta—; de él solo se hereda la
  etiqueta.
- 🔒 **Los medios se cargan EN LA FICHA, jamás a mano al index.** `mapa`,
  `staticImg` y `lineup` están en `CAMPOS_DEL_COMPILADOR`: si la ficha no los
  trae, el siguiente publish los **borra**, porque «no lo emitió» se lee como
  «dejó de tenerlo». Medido el 29-ago sobre 80 commits: **once mapas
  desaparecidos, diez de ellos en eventos EN VENTA**, el último ese mismo día.
  Desde MEDIA-GUARD el publish **se rehúsa** (409) nombrando los eventos, en vez
  de borrarlos en silencio. Para quitar un medio a propósito, la ficha tiene que
  decirlo (`mapa_null` y sus hermanos), no basta con vaciarlo.
- 🔒 **LA FILA VIVA NO ES LO QUE EL CLIENTE VE.** `promos_codigos` gobierna, pero
  el sitio lee su COPIA (`var PROMOS` del index), y esa copia solo se refresca
  **publicando los códigos desde Baba**. Una promo vigente en la tabla puede
  contestar «Código expirado» en el checkout — pasó con NATA: fila hasta el
  20-sep, index vencido el 1-sep, siete días sin publicar. Cualquier cosa que
  ANUNCIE un código (un correo, un letrero, un blast) tiene que carearse contra
  el index SERVIDO antes de salir, no contra la fila. (CONSUELO-VERDAD-1.)
- **Nunca `gh pr merge`.** Flujo: `pull main` → `merge --no-ff` → `push`. **Verificar el
  push contra el ref TRAÍDO DE VUELTA (`fetch` + `rev-parse origin/main`), no
  contra su propia salida — y solo entonces borrar la rama.**
  ⚠️ **`package.json` CHOCA SIEMPRE entre dos ramas paralelas, y no es un
  problema: es la forma del archivo.** Cada tuerca con careo nuevo agrega su
  renglón al final de `scripts`, así que dos ramas que nacieron el mismo día
  conflictan ahí sin falta. Pasó DOS veces el 23-sep. Se resuelve igual todas
  las veces —**se conservan LOS DOS**— y se verifica que el JSON parsea y que
  las dos entradas están, porque un `package.json` roto no da error hasta que
  alguien corre npm.
- 🔒 **El reloj de Reynosa es `America/Matamoros`, NO Cancún ni Monterrey.**
  Reynosa **sí** cambia con EE.UU. (8-mar → 1-nov); la que dejó de cambiar es
  Monterrey (decreto de 2022). Son **133 días al año** de diferencia con Cancún,
  invisibles en verano. Unificado en #624.
- 🔒 **EL HISTORIAL DE PRECIOS GRABÓ CAMBIOS, NO NACIMIENTOS — y en una llave
  con índice eso se confunde con «nunca existió».** `precios_historial` solo
  anota cuando un precio CAMBIA, así que la regla de la casa «ausencia = nunca
  cambió» es cierta… para una llave que existió siempre. Para una llave con
  índice (`omar#0`, una fecha de multifecha) **nacida a media historia**, su
  ausencia antes del nacimiento no dice «nunca cambió»: dice **«yo todavía no
  existía»** — y desde la tabla las dos se ven exactamente igual.
  **Lo que costó:** el 28-ago-2026 las fechas de `omar` ya existían pero SIN
  `cheapZonas` propias, y el sitio cotizaba el CHEAP del 6-Nov **heredándolo del
  evento**. /rol preguntaba por `omar#0`, no encontraba nada, caía al respaldo
  del catálogo y contestaba **EL PRECIO DE HOY** rotulado *«esta zona nunca ha
  cambiado de precio»* — el día que esa zona cambió dos veces (3400 al abrir ·
  3800 a las 12:50 · 4350 a las 16:07). Y su cara peor: una zona **CERRADA** ese
  día se cotizaba en $3,700 con una fila nacida al día siguiente.
  **Quien desambigua es el padre** (ROL-HIST-PADRE-1, #732): si la llave propia
  no puede hablar de esa fecha (`sin_historial` o `anterior_al_historial`), se
  pregunta al evento — que es **de donde el sitio heredaba** — y ANTES del
  catálogo, que sigue siendo el último recurso. `heredado:true` viaja en la
  respuesta y /rol lo ROTULA: un precio del evento presentado como precio de la
  fecha es un dato bueno con la etiqueta equivocada.
  ⚠️ La rampa de herencia **ya existía a medias**: el endpoint heredaba
  `cheapZonas` del evento para el respaldo del catálogo y nunca para buscar el
  historial. **Una regla aplicada a un solo lado de la costura es la forma en que
  esta clase de hueco se esconde.**
  ⚠️ El programa del backfill **no está en el repo** (sembró las 591 filas y no
  se versionó), así que por qué una zona dejó fila al nacer y su vecina no **no
  se puede leer, solo suponer**. La rampa no depende de esa respuesta.
  **Vigilante:** `npm run vigia:rol-hist-padre` (pide `HEAD_URL`) — 447
  aserciones contra los DOS sitios servidos, con control positivo en los dos
  sentidos.
- **Todo careo de pantalla-a-servidor invoca el handler REAL** y simula un salto
  más adentro. **Un mock de ruta salta al portero**: tres tuercas llegaron
  ROTAS a producción con el careo en verde (RAD-FIX-CAMINO, #625). Y una acción
  nueva **va en `ACCIONES` o no existe** para el despacho.
- 🔒 **COPIAR EL ESCENARIO DE UNA MEDICIÓN VIEJA PUEDE DAR EL RESULTADO BUENO POR
  LA RAZÓN MALA. Se mide DONDE EL EFECTO OCURRE, no donde se midió la vez
  pasada.** PULSEDOT-MIDE-1 repitió el escenario de SCROLL-2 —scroll de 2.600 px,
  CPU 4×, 390×844— sobre `funciona.html` y dio Δ 0: la animación no cuesta. La
  sentencia era correcta y **la razón era falsa**: el punto vive en `y=7.773` de
  una página de `7.810`, así que durante ese scroll **está a la vista en 0 de 21
  posiciones**. Una animación fuera de pantalla no cuesta porque **no se pinta**;
  el escenario heredado estaba midiendo la nada y contestando que sí.
  Lo que salvó la medición fue añadir un segundo escenario —**el elemento quieto
  y A LA VISTA**, el único estado donde de verdad se pinta— y que ahí también
  diera 0. **Antes de reusar un escenario, preguntar qué condición hacía que
  midiera algo, y comprobar que esa condición se cumple aquí.** Es la hermana de
  «fuera de pantalla no es limpia» y de «probar el camino, no la función».
  Y el compañero obligatorio: **el CONTROL POSITIVO**. Un Δ 0 sin una animación
  cara inyectada que el arnés SÍ vea (aquí: +370 %) no distingue «no cuesta» de
  «no mido». `npm run mide:animacion` (con `PAGINA` y `SELECTOR`).
- **Un arnés que se CAE no reporta**: deja las secciones de abajo sin ejercitar
  y esconde qué candado habría cazado el fallo. La aserción atrapa la excepción
  y la cuenta como rojo **con nombre**.
- **Una sonda de sabotaje comprueba que MUTÓ** (sha1 antes/después) antes de
  creerse el resultado: un `replace` cuyo ancla no existe no cambia un byte y se
  lee como «el candado no muerde».
- **No buscar la PALABRA: buscar el hecho.** Una aserción de ausencia por `grep`
  se caza sola —el comentario que explica por qué X no está CONTIENE X—, y ya
  van cuatro. Si se puede medir el hecho (qué tablas tocó el handler), el grep
  sobra.
- **El código de salida de un pipe es el del ÚLTIMO comando**: `git push | tail`
  SIEMPRE sale en éxito, aunque el push haya sido rechazado. Verificar el push
  leyendo el resultado real (o con `set -o pipefail`), y **JAMÁS borrar la rama
  antes de confirmar el push**. Ya costó dos PRs que quedaron CLOSED en vez de
  MERGED (#388 y #395): el código sí llegó a main, pero el registro miente.
- **Jamás `on_conflict` / `merge-duplicates`.** INSERT directo; un 23505 es
  idempotencia, pero hay que CONFIRMAR la causa, no adivinarla.
- **`NULL` en una llave de unicidad no une nada** (`NULL != NULL`). Revisar el
  `COALESCE` del índice real antes de confiar en un candado.
- **La regla de precios vive en 3 copias**: `calcular()` en index.html,
  `_lib/precio-zona` y `_vtaCalc` en kamehouse.js. Tocar las 3 + correr el arnés
  de equivalencia.
- **LA ÚNICA DEUDA DEL NEGOCIO ES LA DE BOLETOS A CRÉDITO**, y su fórmula es
  `compras − abonos`. **NO lleva un término de servicios**, y si lees
  `deudaProveedores` en `_lib/cuenta-evento` y sientes que falta: no falta, se
  quitó a propósito (KMS-SIMP-4, decisión de Memo, coherente con FIN-1 desde el
  origen). **Un servicio —transporte, sonido— se paga al momento, así que es un
  GASTO** y se captura donde se capturan los gastos. Sumarlo a la deuda mezclaba
  "lo que ya pagué" con "lo que debo" y hacía que un gasto se viera como pasivo.
  La sección "Servicios y deudas que no son boletos" y las acciones
  `servicios_listar` / `servicio_crear` **ya no existen**; la tabla
  `servicios_proveedor` quedó vacía y sin escritor.
- 🔒 **LA FÓRMULA DE LA UTILIDAD, SELLADA (serie UTIL-C, #550-#554, 24-ago-2026):**

      utilidad del evento    = COBRADO − INVERSIÓN TOTAL EN BOLETOS − GASTOS (sin categoría `Boletos`)
      utilidad de la empresa = Σ utilidades por evento − GASTOS SIN EVENTO

  Careo firmado con `calle24` real: `23,600 − 52,320 − 0 = −28,720`.
  **Por qué:** los boletos NO tienen devolución — desde que se compran son de
  Memo, se vendan o no, así que la inversión entera pesa desde el día uno en vez
  de prorratearse. Y el primer término es lo **cobrado**, no lo vendido: un
  contrato firmado no le paga a un proveedor.
  ⚠️ **Corolario que hay que decir en voz alta antes de que alguien lo reporte
  como bug: un evento recién cargado NACE MUY EN ROJO y se endereza cobrando.**
  Eso no es un error de la cuenta, es la forma real del negocio.
  **Han existido TRES fórmulas y las tres dan números distintos** con las mismas
  filas, así que no se confunden por accidente — pero las pantallas viejas y los
  reportes guardados hablan de las anteriores:
  (A) FIN-1 `cobrado − gastos` = $23,600, que era **caja** ·
  (B) UTIL-B `vendido − costo de lo VENDIDO − gastos` = $20,678 ·
  **(C) UTIL-C = −$28,720, la de hoy.**
  De la serie B **sobrevive**: la exclusión de la categoría `Boletos` de los
  gastos, el proveedor obligatorio en gastos de esa categoría, el gasto de
  boletos como fila de caja (los saldos SÍ lo restan) y el "en mano". Su regla de
  MARGEN está **superada**.
  Dos nombres que no se pueden mezclar: `totales.ganancia` es la **suma de los
  eventos** (tiene que serlo: es el renglón "Total" de una tabla por evento) y
  `totales.ganancia_empresa` es esa suma **menos los generales**.
  **La bodega es INFORMACIÓN, no un contrapeso.** Nació como disculpa del rojo
  (AUD-1c); bajo C ese rojo es la verdad, así que no tiene nada que defender.
  Sumarla a la utilidad es doble conteo: su costo ya está dentro de la inversión.
  **La cuenta bancaria es OBLIGATORIA solo en gastos SIN evento** (en el alta Y
  en la edición, desde la MISMA función de `_lib/cuentas-dinero`). En gastos de
  evento sigue opcional a propósito.
- **NINGUNA PANTALLA CALCULA SU PROPIA CUENTA DE EVENTO.** La cuenta vive en
  `_lib/cuenta-evento` y las pantallas la PIDEN. **Cada `reduce` sobre pagos que
  aparezca en una pantalla es la fórmula número doce esperando a divergir**: la
  auditoría AUD-1 encontró ONCE fórmulas distintas de "cuánto dinero hay", y diez
  leían un solo libro. No se notaba porque cada pantalla era coherente consigo
  misma; se notó cuando Memo miró dos a la vez y una decía $0 y la otra $136,391.
  Una cuenta que se calcula donde se pinta no es un atajo: es una fuente nueva.
  El corolario incómodo: **un cero es una afirmación**. "Cobrado $0" con $136,391
  cobrados no es un dato que falta, es un dato falso — y "Utilidad −$147,172", que
  restaba los gastos de un mundo a las ventas de otro, no tenía media cuenta:
  tenía dos mitades que no se corresponden.
  ⚠️ **Y esto NO se arregló de una vez: UTIL-C encontró CINCO divergencias más,
  todas DORMIDAS** —ningún dato de hoy las despertaba, así que ningún careo por
  ejecución las veía; se cazaron **leyendo los dos códigos**. La inversión
  calculada por dos caminos que diferían $32,500 con una `zona` vacía · la tabla
  del Resumen restando los gastos generales mientras el panel de arriba no · el
  CSV restándolos por su cuenta después de que la tabla dejó de hacerlo (**nadie
  carea un CSV contra la pantalla de la que salió**) · el semáforo ignorando lo
  vendido-sin-cobrar · y la pantalla del evento rotulando **"Ganancia $23,600"**
  sobre `ventas − gastos` cuando la verdad era −$28,720: **$52,320 de error en la
  palabra más importante del sistema**. Se arregló RENOMBRANDO ("En caja"), que
  es más barato que calcular y aquí además era lo veraz.
  Y dos ceros que afirmaban de más: `_audUtilidadPintar` pintaba **$0 en verde
  con el rótulo "Utilidad"** ante un `null`, y el respaldo del Resumen calculaba
  `facturado − totalGastos` (habría dicho **+$46,700**). Los dos dicen "sin dato".
- **TODO CATÁLOGO VIVE EN UNA SOLA FUENTE — y "dos listas iguales" no existe, solo
  "dos listas que todavía no divergen".** El de categorías de gasto estaba en dos
  `<select>` del HTML y **ya había divergido en producción**: el del filtro no
  tenía `Combustible` ni `Comida Staff`, así que un gasto capturado con esas
  categorías **no se podía filtrar**, sin error ni aviso. Hoy vive en
  `_lib/categorias-gasto`, el servidor RECHAZA lo que no esté ahí (en el alta **y
  en la edición**: editar no puede ser la puerta trasera del alta) y el navegador
  llena sus selects con lo que el servidor manda. Y la validación es **sensible a
  mayúsculas a propósito**: aceptar `boletos` junto a `Boletos` vuelve a partir el
  mismo concepto en dos.
  **Segundo caso, UTIL-C-3:** el catálogo de CUENTAS bancarias estaba en **6
  declaraciones**. Hoy los cuatro escritores (gastos e ingresos, alta y edición)
  lo piden a `_lib/cuentas-dinero`. ⚠️ **`admin-saldos` y `admin-reembolsos`
  conservan su lista de TRES a propósito y NO se unifican sin volver a medir:**
  para ellas son **las cubetas que se pintan**, no los valores que se aceptan.
  Un gasto con cuenta `Otro` **sí entra** en su `caja_total` (por el acumulador
  `otrosTotal`); lo que no tiene es cubeta propia. **No se pierde dinero, se
  pierde el renglón.** Ya se midió: la nota vive en el encabezado del lib.
- **UN SELECTOR DE DATO NACE VACÍO, Y EL GUARDADO LO EXIGE.** Si un `<select>`
  representa una ELECCIÓN —a quién, de qué caja, de qué tipo, con qué permisos—
  su primera opción es `— elige … —` y el botón de guardar no deja pasar sin
  ella. **Un default silencioso no ahorra un clic: INVENTA un dato**, y lo
  inventa con la respuesta que impuso el ORDEN DE LAS OPCIONES, no una persona.
  **El costo real, ya pagado:** `admin-proveedores` lista con `order=nombre.asc`,
  así que el primer proveedor del catálogo es **Hotel**. El selector de la tabla
  de tanda no tenía opción vacía, y **3 compras de `calle24` nacieron a nombre de
  Hotel siendo de Matriz** — con la deuda a proveedores apuntando al que no era.
  Jane tuvo que corregir el dato en la base (KMS-SIMP-5, #556).
  Dos corolarios que costaron encontrarse:
  - ⚠️ **El candado del guardado YA EXISTÍA y era INALCANZABLE**: `if (!prov)
    return _kmtError(…)` no podía dispararse nunca, porque `prov` siempre traía
    al primero. Es la hermana de la rama `force` bajo un `schedule` de WL-2 —
    **una guarda que no puede fallar se lee como protección y no protege nada**.
    Al poner la opción vacía, revisar si ya hay una guarda dormida esperándola.
  - ⚠️ **El servidor NO era el hoyo, y no podía serlo**: `admin-compras` valida
    que el `proveedor_id` sea UUID y que exista. Lo que recibía era un id
    **válido pero equivocado**, y eso ningún servidor lo distingue. Hay datos
    que solo puede afirmar quien captura.
  **Un default SÍ está bien en dos casos, y solo en dos** (DEFAULTS-1, #557):
  (a) es una **FORMA**, no una atribución — no le imputa dinero a un tercero, no
  cambia si un gasto entra en la utilidad, no reparte permisos (`gasto-metodo` e
  `ingreso-metodo` en «Transferencia» se quedan por esto); o (b) está
  **ANUNCIADO** en la etiqueta (`ev-banco` dice literalmente "BBVA (Default)" —
  el problema nunca fue que hubiera un valor, sino que nadie supiera que lo
  había). Las dos razones están escritas EN el código para que nadie los
  "arregle" por simetría; re-litigarlas pide medir capturas reales, no simetría.
  Los que sí murieron por la regla: `kmt-prov` (Hotel) · `gasto-categoria`
  (Transporte — **y la categoría decide si el gasto entra en la utilidad**, ver
  la fórmula UTIL-C) · `ingreso-categoria` (Vuelo) · `inv-rol` (**Bulma**, el de
  casi-máximos permisos: invitar sin mirar repartía privilegios que nadie
  eligió).
  **Y el barrido se hace en la PÁGINA, no con grep**: los 44 `<select>` del
  Palacio se midieron abriendo cada pantalla y leyendo qué queda elegido al
  nacer. Hoy no queda ninguno de dato con default silencioso.
  ⏳ Anotado sin urgencia: `admin-ingreso-crear/editar` **no validan la categoría
  contra ningún catálogo** (solo la recortan a 60), así que ahí el navegador es
  la ÚNICA guarda. El catálogo de ingresos vive en el markup y no tiene lib.
- **El CSS/JS de KameHouse vive en `kamehouse.css/js/recibos.js`**, no inline en
  el HTML.
- **Los arneses miden lo de una tuerca ENTRE DOS COMMITS**, no contra el árbol de
  trabajo: si no, la aserción caduca al mergear y la siguiente tuerca revienta
  aserciones ajenas. El padre correcto es el merge anterior, no el commit donde
  nació la rama.
- **Un arnés que truena porque la tuerca siguiente retiró lo que medía NO es un
  bug: es el arnés podrido.** Se actualiza a la verdad nueva, no se silencia ni
  se deja tronando (le pasó al bloque [F] de PP-2 cuando PP-2b quitó
  `_saludoDelDia`). Y al comparar una función entre dos commits, cortar la
  rebanada en "la siguiente declaración" es frágil: si la tuerca metió código en
  medio, la comparación falla sin que la función haya cambiado. Cortar por
  **balance de llaves**.
- **La base de mentira miente de un modo que la de verdad no puede.** Un mock
  que no comparte reglas de FILTRO y de ESTADO con la base real no simplifica:
  falsifica, y hacia el lado peligroso — hace que funciones sanas parezcan
  rotas. Once veces en un solo inventario de correos. Las cuatro formas:
  (1) **ignora los filtros al leer** — devolver la tabla entera a `?id=eq.X`
  hace que quien pide una fila reciba la primera (`admin-lugar-baja` pidió el
  lugar 2, recibió el 1 y contestó "la baja del titular es la cancelación");
  (2) **escribe de más** — si el PATCH solo entiende `id=eq.` y la función
  filtra por `lugar_id`, la escritura cae sobre todas las filas. **Lectura y
  escritura comparten el MISMO filtro, o no comparten nada**;
  (3) **no tiene estado** — muchas funciones escriben y luego RELEEN para
  decidir; con filas inmutables la rama que manda el correo no se alcanza
  jamás; (4) **inventa nombres** — `stock` por `cantidad`, `fecha_limite` por
  `fecha_esperada`, `unidades_transporte` por `transporte_unidades`, `accion`
  por `tipo_accion`. Y los **valores centinela cuentan como nombre**:
  `monto_pagado: 0` donde el código espera `null` cambia el resultado
  (`(p.monto_pagado == null) ? monto : monto_pagado` cuenta cero en vez de la
  cuota entera). Antes de declarar que una función "no manda correo", el
  fixture se carea contra el código que lo consume: nombres de tabla, de
  columna, valores válidos y centinelas **leídos, no recordados**.
- **Los montos se leen del HTML impreso, no de las variables propias.** Un
  careo que compara el fixture consigo mismo siempre cuadra. Para verificar
  dinero en un correo: extraer los montos del HTML que salió y compararlos
  contra la suma de las filas de la tabla, centavo por centavo. Ese careo del
  total caza lo que el caso de una sola persona no ve — si un dedup se comiera
  a alguien entero, los montos individuales cuadrarían y el total no (así se
  cazó GR-11: $7,650 impresos contra $8,500 en la tabla). Con candado: ambos
  lados > 0, para que el careo no pase sobre arreglos vacíos.
- **Un render que no se regeneró no prueba nada.** Antes de creerle a un
  archivo de salida, mirar su hora: si es de antes del cambio, está midiendo el
  pasado. Y si hay dos renderizadores, verificar cuál corrió — el de la tanda 1
  y el corregido tienen fixtures distintos.
- **Un arnés de tuerca YA MERGEADA debe leer sus archivos DEL COMMIT DE SU
  MERGE, no del árbol vivo.** Si lee el árbol, la siguiente tuerca de la serie
  lo revienta sin tener la culpa. Pasó con 4 arneses de golpe en KH-4.
- **El estilo EN LÍNEA le gana a cualquier hoja.** Antes de dar por buena una
  regla nueva, verificar en la página REAL que aplica: en aislamiento puede
  funcionar y en producción estar muerta (le pasó al `th` del Palacio).
- **Un selector puede no existir.** `.bottombar` nunca existió (es
  `.kh-bottombar`): las reglas fueron letra muerta hasta que un barrido las
  cazó. Si una regla nueva no cambia nada medible, sospechar del selector.
- **"Existe" no es "se ve".** Preguntar por el elemento en el DOM deja pasar
  todo lo que está en `display:none`. El reloj del paso de pago llevaba una
  aserción en verde mientras el cliente no veía nada. Medir `display`,
  `visibility`, `offsetParent` y el alto real.
- **"Solo `transform` y `opacity`" aplica a lo que anima POR FRAME.** Lo que se
  pinta una vez por evento —una barra que se llena al cambiar de paso, un acento
  que crece al pasar el mouse, un relleno que se dibuja al renderizar— se SELLA
  con su análisis escrito, no se convierte. La regla existe por el reflow por
  frame; donde ese costo no ocurre, convertir es cumplir la letra y perder el
  espíritu — y a veces pide cambiar el markup para no ganar nada. Selladas así:
  las 3 barras con radio (portal ×2, rol) y los hovers de faq. Si alguna se
  volviera de animación continua, la sentencia cambia.
- **UN ARNÉS TIENE DOS LADOS, Y LOS DOS TIENEN QUE SER COMMITS.** Anclar solo el
  "antes" no sirve de nada: el "después" leído del ÁRBOL VIVO convierte a
  cualquier tuerca posterior en culpable. Es la mitad que faltaba de "los arneses
  miden entre dos commits", y casi ninguno la cumplía — 11 de 13 leían `main` o
  el árbol de un lado. `kh4` acusaba a KH-4 de un color en línea que puso el chip
  de C2-5 con permiso; `t1` habría culpado a T1 de cualquier edición posterior de
  contrato-crear.js. **Y si un arnés vigila MÁS DE UN RANGO, cada rango lleva su
  propia ancla**: `pf5` usaba una sola constante para su rango y para una guarda
  cruzada sobre PG-1 — al corregir uno se rompía el otro.
  Corolario: la vigilancia VIVA (un contador que no debe crecer nunca) es OTRA
  cosa y va en su propio bloque, contra el árbol de hoy y con su línea base
  movida cuando se aprueba un aumento — si no, re-acusa un permiso viejo en cada
  corrida.
- **Un arnés cuyo resultado cambia por merges AJENOS no mide su tuerca: mide el
  árbol. EL VERDE TAMBIÉN CADUCA, y un verde caducado no avisa.** En el barrido
  de A6b, `pf2` (37/39) y `pf3` (23/24) se pusieron en VERDE solos porque otras
  tuercas movieron index.html y pagos.html. Siguen igual de podridos que cuando
  estaban en rojo — solo que ahora no se nota. Se anclan a su commit de merge
  aunque estén pasando.
- **Un arnés podrido tiene dos caras, y la peligrosa no es la que grita.** Unos
  simplemente CADUCARON (miden un pasado que ya no existe: molestan). Otros
  PIDEN QUE SE REVIERTA UNA DECISIÓN aprobada — `t2` exigía "fecha ambigua nunca
  asigna" después de que T2b lo cambió a propósito, y `pf3-navegador` pide el
  glow rojo que A3 quitó con permiso. Si alguien "arregla" esos haciendo que
  pasen, deshace la tuerca sin enterarse. Al triar, separar las dos clases.
- **Cuando hay DOS objetos con el mismo papel, "el primero que aparece" no es
  un criterio: es una moneda al aire.** `index.html` tiene dos constructores de
  chips de zona —`renderZonas` y `buildZonaButtons`— y el arnés agarró el
  primero del archivo: resultó ser el que NO LLAMA NADIE, así que midió una
  función muerta y reportó que el bug no existía. Anclar por NOMBRE y exigir que
  ALGUIEN LA LLAME (conteo de llamadas). Es la hermana de "probar el camino, no
  la función": aquí se probó una función que no está en ningún camino.
- **CUANDO EL ARNÉS Y EL CÓDIGO TIENEN EL MISMO AUTOR, EL ARNÉS HEREDA LAS
  CREENCIAS QUE PRODUJERON EL BUG.** No es un testigo independiente: si creo que
  el campo se llama `habitacion`, lo creo en los DOS archivos, y el verde solo
  prueba que soy consistente conmigo mismo. VJ-5 se mergeó en verde y llegó a
  producción INSERVIBLE por dos creencias mías que el arnés compartía: llamaba
  `abrirModalHabitacion()` a mano cuando el botón que la abre llevaba meses
  `disabled` (cero llamadores), y su mock contestaba `{habitacion:{…}}` cuando
  el endpoint devuelve `hab` — así que `habId` habría salido `null` SIEMPRE y el
  migrado se habría quedado sin cuarto en silencio, sin error ni toast. Lo cazó
  Memo usando la pantalla **59 minutos después del merge** (VJ-5 entró a las
  00:56 del 6-ago; el arreglo se escribió a la 01:55 — fechas leídas de `git
  log`, no recordadas, que es justo de lo que trata esta regla). El arnés no
  aguantó ni una hora de uso real. Es la raíz común de "probar el camino,
  no la función" y de "la base de mentira inventa nombres", y el remedio es
  mecánico: **los hechos se toman del lado que yo no controlo en ese momento**.
  Los nombres de campo se LEEN del código de la otra punta (el arnés de CAP-FIX-1
  extrae con regex el campo de la respuesta de `admin-rooming` y assertea que el
  front lea ÉSE); las claves del fixture se carean contra la función que las
  produce (`persona()` de admin-transporte), no contra lo que recuerdo del
  payload; y se entra por el botón, contando llamadores — si son 1, ese 1 es la
  declaración y NADIE lo usa.
- **`offsetParent` es `null` POR DEFINICIÓN en `position:fixed`.** Preguntárselo
  a un modal abierto contesta "invisible" sobre algo que se ve perfecto: en
  CAP-FIX-1 dio un rojo falso sobre un `.modal-overlay` desplegado. Para lo
  fijo, medir la caja real del hijo (`getBoundingClientRect`) y `elementFromPoint`
  en su centro, y validar el instrumento cerrándolo: si cerrado no dice que no,
  la medición no sirve. Es la contracara de "existe no es se ve".
- **Un careo solo ve lo que el universo EJERCITA.** Para las divergencias
  DORMIDAS —las que ningún dato de hoy alcanza— hay que LEER los dos códigos,
  no correrlos. Tres textos de motivo estuvieron divergentes durante dos careos
  de 9,498 combos que dieron 0 diffs. El candado es estático: todo lo que dice
  el ESPEJO tiene que existir en la FUENTE.
- **Antes de creerle una AUSENCIA a un instrumento, hazlo contestar algo que
  SEPAS que existe.** Un instrumento roto no truena: CONTESTA, y su respuesta
  favorita es la ausencia — cero hallazgos, cero halos, todo roto — que es
  justo la que menos verificamos porque parece que no hay nada que verificar.
  Cuatro en un día: `2>/dev/null` sobre un detector que escribe a stderr ("0
  hallazgos" en 546) · `([\d.]+)px` sobre CSS que permite el cero sin unidad
  ("G2=0" con 13 halos) · `timeout` que no existe en macOS ("52 arneses
  podridos" con 38 en verde) · y un fixture clasificado con mi criterio en vez
  del del código. Los cuatro dieron respuestas limpias y creíbles.
  **La versión práctica:** correr el mismo instrumento contra un caso conocido
  —un commit viejo, un precio calculado a mano, una fila que sabes que está—
  ANTES de creerle el resultado. Es el candado de cardinalidad aplicado a la
  herramienta, no a la aserción.
- **Un arnés se compara contra el universo DE HOY, no contra la expectativa
  congelada del día que se firmó.** El de equivalencia decía 5,565 diffs y los
  precios estaban sanos: comparaba combos que hoy son `ok:false` (zona agotada
  3,123 · evento agotado 2,157 · fecha pasada 789 · próximamente 78) contra
  números, y `undefined` contra número siempre difiere. Su "15,156 combos / 0
  diffs = ley" se firmó sobre un catálogo que ya no existe. Receta: comparar las
  copias ENTRE SÍ sobre el universo vivo · casos conocidos a mano como
  validación del instrumento antes de cada corrida · candado de cardinalidad
  sobre los `ok:true` (si un día da 0, es el instrumento) · anclado a commits.
- **Probar TU idea del dato en vez del dato que el código mira.** El fixture se
  clasifica con la CONDICIÓN EXACTA del código, copiada, no parafraseada. Un
  arnés que clasifica con criterio propio puede dar VERDE midiendo el caso
  equivocado: en A2 clasifiqué "eventos sin foto" con `SI[staticImg] || img` y el
  código evalúa otra cosa — el bloque contra el padre pasó comparando dos eventos
  que AMBOS tenían foto, y me hizo afirmar un bug que no existía (0 de 94 eventos
  alcanzan esa rama). Es la hermana fina de "probar el camino, no la función".
- **En Playwright manda la ÚLTIMA ruta registrada: la específica va AL FINAL.**
  Si la genérica (`**/.netlify/**`) se registra después, se come al mock y el
  arnés mide una mentira. Y **todo mock exige conteo de llamadas**: un
  `fetch=0` no es resultado, es que nunca se ejecutó. Tres mordidas: E2, ST-2
  y el diagnóstico del rebote mudo, donde casi manda a cazar un candado
  inexistente.
- **"Existe" no es "se ve".** Preguntar por el elemento en el DOM deja pasar
  todo lo que está en `display:none`. El reloj del paso de pago llevaba una
  aserción en verde mientras el cliente no veía nada. Medir `display`,
  `visibility`, `offsetParent` y el alto real.
- **Una aserción que puede pasar con el conjunto vacío no es una aserción.**
  Candado de cardinalidad siempre; y al medir algo (contraste, peso) validar el
  instrumento antes de creerle el resultado.
- **`toISOString()` NUNCA es "hoy" en México.** Da la fecha de Greenwich: pasadas
  las 6 de la tarde de acá, ya es el día siguiente allá. Y en esta casa se
  trabaja de noche. Tres mordidas: `_cobHoyISO` (la cobranza), el `fmtFecha` del
  correo de aceptación (`new Date('2026-08-16')` es medianoche UTC = día 15 en
  MX) y la fecha del formulario de contratos, que salía **fechada mañana en un
  documento firmable**. El helper de la casa es `_mxFechaStr()` /
  `toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' })`.
- **Anclar una función por nombre EXIGE el paréntesis.** `indexOf('async
  function gzReactivar')` se comió a `gzReactivarVendedor`, que vive antes en el
  archivo: el arnés midió otra función con nombre parecido y dio verde. Y la
  misma mordida disfrazada en el otro lado: `/gzReactivar|.../.test(padre)`
  afirmaba que el padre ya tenía la función nueva porque contenía el prefijo.
  Es la hermana de `renderZonas` vs `buildZonaButtons`: **un prefijo no es un
  ancla.** Al corregirlo, dejar un candado que assertee que el parecido SIGUE
  ahí, para que nadie lo "limpie" sin entender por qué existe.
- **CUANDO UN ARNÉS SE PONE ROJO, SOSPECHAR PRIMERO DE MI EXPECTATIVA.** En
  UTIL-C hubo **cinco rojos y los cinco eran míos**, con el código sano: un
  umbral inventado (exigir conservar el 90% de un archivo que es 19% comentario;
  el control bueno es "no perdió NINGUNA de las 915 declaraciones") · un caso
  cuya premisa no se alcanzaba (pedir $30,000 sobre un techo de $27,300, y leer
  como fallo la respuesta correcta) · un fixture que no era el dato real (la
  bodega de `calle24` en $0 cuando son $48,050) · un índice equivocado (buscar el
  tercer renglón en el segundo) · y **un número recordado en vez de computado**
  (reporté 7 copias de un catálogo; eran 6). Más un **falso negativo**: un
  andamio que servía 4 archivos elegidos a mano en vez del árbol del commit, así
  que la página no se pintaba y el arnés acusó a código sano. Recetas: los
  umbrales se **miden**; antes de creerle a un caso se assertea que **su premisa
  se alcanza**; los números del reporte los **imprime el arnés**; y el andamio
  sale entero con `git archive <commit>`.
- **Un arnés que lee comentarios no mide código.** La prueba de "ya no se filtra
  `activos:true`" la tumbó MI PROPIO comentario, que decía «SIN `activos:true`»
  explicando el cambio. Antes de asertar sobre texto del archivo, quitar
  comentarios (`/\*…\*/` y `//…`). Vale también al revés: un literal que
  sobrevive solo dentro de un comentario NO es código vivo.
- **`git check-ignore` MIENTE sobre archivos ya versionados.** A un archivo
  trackeado le contesta "no ignorado" aunque el patrón lo cace; hay que pasarle
  `--no-index` para preguntarle por el patrón de verdad. Casi deja pasar un
  `/*.jpg` que se comía `kamehouse.jpg`. Otra vez el instrumento contestando la
  ausencia cómoda.
- **NUNCA `git add -A` en este repo.** La raíz es un cajón privado (briefs,
  borradores de contratos, `PENDIENTES-MEMO.md`, fotos) y **el repo se publica
  en conectareynosa.mx**: lo versionado queda descargable. Un `add -A` se llevó
  63 archivos privados a una rama; lo atajó la revisión, no una herramienta. Hoy
  hay `.gitignore` para el cajón, pero **los archivos se nombran uno por uno** y
  `git diff main..rama --stat` se lee ANTES de abrir la PR. Las imágenes se
  ignoran solo en la RAÍZ (`/*.jpg`): `mapas/`, `imgs/`, `lineups/` y
  `kamehouse.jpg` son del sitio, y un `*.jpg` a secas dejaría de versionar la
  siguiente foto legítima **sin avisar**.
- **"VISIBLE" EN EL DOM ES UNA CADENA, NO UNA PROPIEDAD.** `display` del propio
  elemento, `offsetParent` (toda la cadena de ancestros) y el contenido de un
  `<iframe>` son TRES PREGUNTAS DISTINTAS, y contestar la fácil por la correcta
  **inventa hallazgos**. En un solo recorrido: un botón dentro de un dropdown
  oculto se declaró visible (**7 fugas de permisos que no existían**), un
  `loading-state` en una sub-pestaña cerrada se declaró colgado (**9 spinners
  falsos**), y dos páginas-iframe se declararon en blanco. **De 49 "hallazgos",
  36 eran del instrumento.** Es la hermana mayor de "existe" no es "se ve" —
  pero al revés: aquí el instrumento decía **"se ve"** de lo que nadie ve.
  Corolario del mismo recorrido: **abrir una pantalla por la puerta equivocada
  la deja a medio armar.** `showPage('recibos')` no carga su iframe; el usuario
  entra por `showHerramienta('recibos')`, que sí. Medí la pantalla por una
  puerta que ningún humano usa y reporté rota una pantalla sana — y estuvo a
  punto de construirse un arreglo para un problema inexistente. Antes de
  reportar una pantalla vacía: **abrirla como la abre la gente.**
- **Anclar a la FUNCIÓN no es anclar a la RAMA.** Una función que atiende dos
  casos con un ternario tiene DOS textos adentro, y una aserción sobre el
  cuerpo entero encuentra el del otro. `renderDocViaB` pinta coordinador Y
  giveaway: afirmé "el contrato de coordinador imprime el evento" midiendo el
  bloque de la función… y lo que encontré era la rama del **giveaway**. La rama
  del coordinador lleva otra cosa. **Costó pedirle a Memo un campo que el
  documento nunca usó, y el arnés se quedó VERDE afirmándolo.** Es la prima de
  "dos objetos con el mismo papel": ahí eran dos funciones y agarré la muerta,
  aquí es una función con dos caras y agarré la ajena. Al medir texto de una
  plantilla, **cortar la rama** (el trozo entre el `?` y el `:`) o —mejor—
  **ejecutar el render** y mirar la salida, que es la única que no tiene ramas.
- **Copiar un patrón exige leer la plantilla de DESTINO.** El paquete de EQ-4
  rellenaba `evento_nombre` con un texto neutro, copiando lo que `_ctrFormData`
  hace con el contrato laboral. Pero el laboral puede: su plantilla no imprime
  esa fila. La de **coordinador SÍ la imprime** (`renderDocViaB`), así que el
  relleno habría acabado dentro de un **documento firmado**. El patrón era
  correcto; el destino, otro.
- **Llaves de Supabase**: `SUPABASE_URL_KAMEHOUSE`/`SUPABASE_SERVICE_KEY_KAMEHOUSE`
  y `PORTAL_SUPABASE_URL`/`ANON`/`SERVICE`. Las `SUPABASE_*` a secas están
  BORRADAS y podadas del código — no revivirlas ni agregar fallbacks.
- **`eventos`/`resumen_eventos` del Palacio llavean por UUID, no por slug.**
- `mundial_*`/`quiniela_*`/`amigos_*` = web desechable del Mundial. NO tocar.

## Datos Bancarios
- BBVA Bancomer / Tarjeta: 4152 3139 7573 0487
- CLABE: 012822004639334319
- Titular: Guillermo Alexander Cobos Vizcarra
