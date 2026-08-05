# Conecta Reynosa — Contexto Completo para Claude Code

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
_Última revisión: 28-jul-2026 (series PP, PG, E1 y KH cerradas)._

### 🔴 La semana que entra — el encendido
- **Apagar `CORREOS_MODO='prueba'` en Netlify.** Mientras siga en 'prueba', TODO
  el correo automático (cobranza, contratos, vendedores) llega al buzón de
  calibración y NO al cliente. Es el interruptor que estrena todo junto.
  Excepción a propósito: el vigilante de radio manda sus emergencias directo,
  sin pasar por `aplicarModoPrueba`.
- **Re-onboarding de 6 personas** (primeros 5: Alan, Axel, Reginna, Laura,
  Sofía). Camino: reactivar en Guerreros Z → rol → contratos → firmas → activo.
- **Revisar env vars en Netlify** antes del primer disparo real.
- **Blast de arranque de contratos**: lo manda Memo, no un cron.

### 🟡 Vivos
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
- **Respaldos del NAS** (UGREEN): sesión pendiente. Radio Conecta vive ahí.
- **Cobros OXXO / MSI**: ver `REPORTE-COBROS-OXXO-MSI.md`.
- **El COLOR en línea del Palacio** (medido y congelado por KH-4, sin resolver):
  827 estilos con `color:` en `kamehouse.js` y 158 en el HTML, y **49 `<th>`
  con su propio `color` que NINGUNA hoja de estilo alcanza**. Es la misma
  trampa de los `border-radius` en otra propiedad. Merece su propia tuerca con
  su propia medición; el arnés de KH-4 assertea que no crezca.
- **La barrita de progreso de `funciona.html`** anima `width` (contra la regla
  de la casa: solo `transform`/`opacity`). Es de abril; tuerca micro cuando Memo
  la quiera.
- **Puente index→Portal**: Fase A en prod pero DETRÁS DE INTERRUPTOR
  (`RESERVA_PORTAL` / `?portal=1`). Falta decidir el encendido.
- **Contrato de cuidador de bodega**: borrador esperando a Memo.
- **Wizard de comisiones CHEAP (F5a)**: falta que Memo capture las primeras.
- **PRs viejas ABIERTAS sin aprobar**: #53 (ranking DC2d, jun) y #215
  (cancelar-despublica, 1-jul). NO mergear sin revisión explícita de Memo.
- **Doc `kamehouse.md`**: bloqueado por permisos de macOS/TCC.
- Retirar el panel `ventas-resumen` cuando ya no se use.

### ⚪ Anotados sin urgencia (decisiones ya tomadas)
- **19 reglas del sitio siguen bajo el 4.5:1 de AA y NO son el token `--muted`**
  (ése ya subió a .46 en T6): blanco sobre botones de marca ~1.98:1, `.ftr-copy`
  a `.25` = 2.08:1, la familia `.3/.35/.4` de `pagos.html`, y `.cca` en
  `#0000cd` sobre negro = 1.88:1. Son **decisiones estéticas de Memo, no bugs**.
  El bloque [F] del arnés de T6 las imprime con su ratio en cada corrida.
- **Caché de 5 min del candado de vendedores**: tras reactivar a alguien puede
  tardar hasta 5 min en poder vender. No es bug — va al manual.
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
