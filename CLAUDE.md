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
> - **melanie está borrada por completo**, bases y frente.

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
- STAY: Sin transporte — Solo en MTY = PLUS - sep
- CHEAP: Solo boleto — separo siempre $1,000
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

- ✅ **CERRADO en esta época (jul-ago 2026), no volver a abrirlo:** el dinero del
  Palacio (**FIN-1**, #473-#476) · la cuenta por evento en una sola fuente
  (**AUD-1**, #477-#482) · la merma (**MER-1**, #483) · los saldos con migrados
  (**SAL-1**, #484) · el candado de Posponer (**SEG-1**, #488) y las 4
  herramientas con candado (**SEG-2**, #487) · la sesión vencida que manda al
  login (**SES-1**, #489) · la lista de espera que avisa al publicar (**WL-1**,
  #490) · el catálogo de agosto y la contraofensiva 2x1 (**CAT-1/2/2b/3/3c**,
  #485, #486, #491, #492). Cada una tiene su arnés y su reporte en la PR.
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
- **melanie: BORRADA POR COMPLETO** (19-ago-2026). El evento `HADES: THE
  SACRIFICE` ya no existe en ningún lado — las dos bases las vació Jane
  (respaldos en `bkp_mel_*`, incluido el giveaway) y el frente público salió en
  **MEL-FRENTE-1** (#508): tarjeta del EV, códigos `HADES`/`MELANIE`, banner del
  sorteo con su script, la línea de `mapas.js` y el archivo `mapas/melanie.jpg`.
  El diseño llevaba dos asientos de ajuste para sostener los saldos, **pero YA NO
  EXISTEN**: Memo pidió "todo a ceros, nada de rastro" y Jane los retiró después
  de crearlos.
  **La verdad de hoy: el libro del Portal está VACÍO — 0 gastos, 0 ingresos y
  saldos en $0 en las tres cuentas, A PROPÓSITO.** La plataforma arranca en
  blanco el 1-sep. Si Memo quiere que "cuánto tengo" diga su banco real,
  **capturará un ingreso de "saldo inicial" por cuenta al arrancar** — no es un
  dato que falte, es el primer asiento de la época nueva.
  ⚠️ **La nota de "la caja de melanie es −$10,781, sellado" YA NO APLICA y se
  retira**: no hay caja de melanie que defender. Si alguien la cita, está
  citando una época anterior.
  Dos cosas que dejó aprendidas y valen para el próximo borrado de evento:
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
- **Wizard de comisiones CHEAP (F5a)**: falta que Memo capture las primeras.
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
- ⏸️ **MÓDULO DE VENDEDORES: EN PAUSA** (**VEN-PAUSA-1**, #507, 19-ago-2026).
  Decisión de Memo: **se replantea después, no se borra**. Pantallas, los 6
  endpoints, el candado rodante de 3 meses y los datos siguen donde estaban; lo
  único que cambia es que nadie puede llegar. Al pausarlo había **cero usuarios
  con rol `vendedor`**, así que nadie quedó fuera.
  - El interruptor es **`MODULOS_PAUSADOS`**, y vive en DOS runtimes que no
    pueden importarse entre sí: `kamehouse.js` (cliente) y
    `_lib/modulos-pausados.js` (servidor, 503 en los 6 endpoints). El arnés los
    **carea**; si divergen, truena.
  - ⚠️ **La pausa es un VETO que se SUMA a `_puedeVerTab`, jamás una resta de
    `PERMISOS_TABS`.** Restar los tabs los sacaría de `TABS_CON_PERMISO` y
    `showPage` dejaría de filtrarlos: el módulo "pausado" quedaría ABIERTO a
    cualquiera. Es el hoyo de E5-4 con otra cara.
  - Apagados también el cron `ventas-limite-cron` (comentado en `netlify.toml`)
    y el bloque de vendedores inactivos de `radar-alertas`: los dos **mandan
    correo**, y un cron vivo sobre un módulo pausado avisa de algo que nadie
    puede atender.
  - 🔌 **Revive en 3 ediciones**: vaciar los dos Sets y descomentar el cron.
  - ⚰️ **Muere con la pausa** el pendiente "capturar las primeras comisiones
    CHEAP" (wizard F5a). No se re-propone mientras el módulo siga pausado.
  - La vieja nota del **caché de 5 min** del candado de vendedores queda sin
    efecto mientras dure la pausa (no hay a quién reactivar).
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
- **Nunca `gh pr merge`.** Flujo: `pull main` → `merge --no-ff` → `push`.
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
- **NINGUNA PANTALLA CALCULA SU PROPIA CUENTA DE EVENTO.** La cuenta vive en
  `_lib/cuenta-evento` (ventas de los dos mundos − gastos = ganancia, con bodega
  y deuda aparte) y las pantallas la PIDEN. **Cada `reduce` sobre pagos que
  aparezca en una pantalla es la fórmula número doce esperando a divergir**: la
  auditoría AUD-1 encontró ONCE fórmulas distintas de "cuánto dinero hay", y diez
  leían un solo libro. No se notaba porque cada pantalla era coherente consigo
  misma; se notó cuando Memo miró dos a la vez y una decía $0 y la otra $136,391.
  Una cuenta que se calcula donde se pinta no es un atajo: es una fuente nueva.
  El corolario incómodo: **un cero es una afirmación**. "Cobrado $0" con $136,391
  cobrados no es un dato que falta, es un dato falso — y "Utilidad −$147,172", que
  restaba los gastos de un mundo a las ventas de otro, no tenía media cuenta:
  tenía dos mitades que no se corresponden.
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
