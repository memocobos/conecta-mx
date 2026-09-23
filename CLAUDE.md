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
- Ayuda contextual: FAB "?" flotante + modal mínimo + hints sutiles por paso (sin chatbot)
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
