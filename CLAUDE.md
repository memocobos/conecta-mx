# Conecta Reynosa — Contexto Completo para Claude Code

> ## 🎯 EL RUMBO: la plataforma arranca el 1 de SEPTIEMBRE de 2026
>
> Con los **eventos de septiembre**. Todo lo que se haga de aquí al 1-sep se
> mide contra esa fecha: lo que no sirva para que la plataforma abra ese día es
> ruido, y lo que la ponga en riesgo no entra aunque esté bien hecho.
>
> Tres cosas que ya quedaron decididas rumbo a ese arranque, y que **no se
> re-litigan**:
> - **El cobro en línea va por Mercado Pago con 3D Secure obligatorio.**
>   Stripe está DESCARTADO (ver el bloque 💳 más abajo).
> - **El módulo de vendedores va en PAUSA**, no en el arranque (**VEN-PAUSA-1**).
> - **melanie: las bases siguen en $0; la TARJETA volvió al index** como evento
>   pasado agotado (MEL-REGRESA-1, 28-ago). El sorteo NO vuelve.

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
  saldos en $0 en las tres cuentas. La plataforma arranca en blanco el 1-sep. Si
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
  tocó: `giveaway.html`, `sorteo.html` y 7 funciones, de las cuales
  `giveaway-consuelo.js` todavía trae `CODIGO='MELANIE'` y un enlace a `/melanie`.
  **Nadie la llama y no existe esa ruta**, así que está muerto — pero está.
  Limpiarlo es decisión aparte, sin firma.
  Dos cosas que dejó aprendidas el borrado y valen para el próximo:
  **las 15 tablas satélite llavean por SLUG** (el uuid solo vive en `eventos`), y
  **`compilarEV` es un UPSERT que nunca borra** — un evento ausente de
  `esferas_eventos` NO se puede despublicar publicando.
- **Respaldos del NAS** (UGREEN): sesión pendiente. Radio Conecta vive ahí.
- **Cobros OXXO / MSI**: pendiente, y **ahora depende de Mercado Pago** — se
  replantea con el módulo de cobro nuevo, no sobre Stripe. ⚠️ El libro remitía
  a `REPORTE-COBROS-OXXO-MSI.md`, que **NO existe en el repo** (es de los `.md`
  sueltos sin commitear): un puntero a un archivo que nadie puede abrir vale
  menos que decir dónde está la decisión.
- **El COLOR en línea del Palacio** (medido y congelado por KH-4, sin resolver):
  827 estilos con `color:` en `kamehouse.js` y 158 en el HTML, y **49 `<th>`
  con su propio `color` que NINGUNA hoja de estilo alcanza**. Es la misma
  trampa de los `border-radius` en otra propiedad. Merece su propia tuerca con
  su propia medición; el arnés de KH-4 assertea que no crezca.
- **La barrita de progreso de `funciona.html`** anima `width` (contra la regla
  de la casa: solo `transform`/`opacity`). Es de abril; tuerca micro cuando Memo
  la quiera.
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
- Retirar el panel `ventas-resumen` cuando ya no se use.

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
- 🔒 **Los medios se cargan EN LA FICHA, jamás a mano al index.** `mapa`,
  `staticImg` y `lineup` están en `CAMPOS_DEL_COMPILADOR`: si la ficha no los
  trae, el siguiente publish los **borra**, porque «no lo emitió» se lee como
  «dejó de tenerlo». Medido el 29-ago sobre 80 commits: **once mapas
  desaparecidos, diez de ellos en eventos EN VENTA**, el último ese mismo día.
  Desde MEDIA-GUARD el publish **se rehúsa** (409) nombrando los eventos, en vez
  de borrarlos en silencio. Para quitar un medio a propósito, la ficha tiene que
  decirlo (`mapa_null` y sus hermanos), no basta con vaciarlo.
- **Nunca `gh pr merge`.** Flujo: `pull main` → `merge --no-ff` → `push`. **Verificar el
  push contra el ref TRAÍDO DE VUELTA (`fetch` + `rev-parse origin/main`), no
  contra su propia salida — y solo entonces borrar la rama.**
- 🔒 **El reloj de Reynosa es `America/Matamoros`, NO Cancún ni Monterrey.**
  Reynosa **sí** cambia con EE.UU. (8-mar → 1-nov); la que dejó de cambiar es
  Monterrey (decreto de 2022). Son **133 días al año** de diferencia con Cancún,
  invisibles en verano. Unificado en #624.
- **Todo careo de pantalla-a-servidor invoca el handler REAL** y simula un salto
  más adentro. **Un mock de ruta salta al portero**: tres tuercas llegaron
  ROTAS a producción con el careo en verde (RAD-FIX-CAMINO, #625). Y una acción
  nueva **va en `ACCIONES` o no existe** para el despacho.
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
