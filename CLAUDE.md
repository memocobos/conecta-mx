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
_Última revisión: 27-jul-2026 (serie PP cerrada)._

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
- **Capturar la primera noticia del banner** (N1, en prod): el banner azul del
  index ya lo escribe Memo en *Esferas del Dragón → Noticias del banner*, pero
  está VACÍO, así que la marquesina sigue mostrando el lema estático. Nada que
  configurar: `GITHUB_TOKEN` ya existe.
- **Fase 2 (Portal Clientes)**: en construcción sobre Supabase. La **serie PP
  (el portal con vida) ya cerró completa** en prod: footer + radio (#379),
  fotos de artistas en el wizard (#380), dashboard con hero/countdown/
  celebración (#381), familia visual (#382) y el pool de 140 saludos (#383).
- **Fase C del Portal — la barra de % de pagos**: hoy el dashboard NO baja los
  montos pagados, así que la barra no existe **a propósito** (inferirla sería
  inventar una cifra de dinero). Entra cuando la Fase C amplíe los datos de
  pagos. No re-proponerla antes.
- **Respaldos del NAS** (UGREEN): sesión pendiente. Radio Conecta vive ahí.
- **Cobros OXXO / MSI**: ver `REPORTE-COBROS-OXXO-MSI.md`.
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
- **Una aserción que puede pasar con el conjunto vacío no es una aserción.**
  Candado de cardinalidad siempre; y al medir algo (contraste, peso) validar el
  instrumento antes de creerle el resultado.
- **Llaves de Supabase**: `SUPABASE_URL_KAMEHOUSE`/`SUPABASE_SERVICE_KEY_KAMEHOUSE`
  y `PORTAL_SUPABASE_URL`/`ANON`/`SERVICE`. Las `SUPABASE_*` a secas están
  BORRADAS y podadas del código — no revivirlas ni agregar fallbacks.
- **`eventos`/`resumen_eventos` del Palacio llavean por UUID, no por slug.**
- `mundial_*`/`quiniela_*`/`amigos_*` = web desechable del Mundial. NO tocar.

## Datos Bancarios
- BBVA Bancomer / Tarjeta: 4152 3139 7573 0487
- CLABE: 012822004639334319
- Titular: Guillermo Alexander Cobos Vizcarra
