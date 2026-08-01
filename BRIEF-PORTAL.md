# BRIEF · Radiografía + plan del PORTAL (serie PP)
> Sesión Cowork (Jane), 27-jul-2026. NO se commitea. Fuente: lectura completa de
> portal.html (4,309 líneas) + functions portal-* + paseo en Chrome (perfil gate visto).

## RADIOGRAFÍA — lo que está FUERTE (no tocar)
- Esqueleto sano: 5 vistas (auth → perfil → dashboard → wizard 5 pasos → tour),
  gate de perfil, acordeón de tours, countdown por card, subida de comprobante
  con soporte HEIC/iOS, puzzle de cuartos del titular, invitación de acompañantes.
- Cards del dashboard SÍ tienen foto (estática o Deezer con fondo blur) — patrón
  _artStaticUrl/_artDeezerUrl ya resuelto y cacheado.
- Escapado limpio (auditado Capa 5), estados de error y vacíos existen, aria/roles
  presentes, paleta de marca correcta.

## LO FLACO (los 4 frentes de Memo)
1. FOTOS: el paso 1 del wizard ("Elige tu evento") es PURO TEXTO — cajita de día
   + nombre + venue. Es EL momento de deseo del cliente y no hay ni una foto de
   artista, teniendo los helpers de arte ya escritos en el mismo archivo.
   Estados vacíos también secos ("Sin tours próximos" sin invitación visual).
2. INTERACCIÓN: dashboard funcional pero frío. Sin countdown protagonista del
   próximo viaje, sin barra visual de progreso de pagos ("vas al 60%"), sin
   celebración al liquidar, saludo genérico. Solo 24 transiciones y 3
   reduced-motion — el portal no heredó el pulido PF-1/PF-2 del index.
3. REDES + RADIO: solo Instagram y TikTok (2 links en dashboard). NO hay
   Facebook, NO canal de WhatsApp, NO Radio Conecta, NO footer.
4. FAMILIA VISUAL: 7 tamaños de border-radius propios (no usa los tokens
   PF-3); en escritorio el shell de 480px flota en un mar negro sin vestir;
   pantalla de carga genérica (spinner + texto).

## PLAN — serie PP (una tuerca = una PR, reglas de la casa)

### PP-1 · FOTOS DE ARTISTAS EN EL WIZARD (la que más vende)
- Paso 1: cada evento de la lista con su foto de artista (thumbnail izquierdo
  o card con foto de fondo y velo) usando _artStaticUrl → STATIC_IMGS y el
  upgrade Deezer asíncrono que ya existe para el dashboard. Fallback elegante
  sin foto (cajita de fecha actual). Buscador intacto.
- Paso 2 (paquete): header con la foto del evento elegido (fondo con velo) —
  que el cliente "vea" a dónde va mientras elige.
- Estados vacíos del dashboard: "Sin tours próximos" → invitación con mini
  collage/foto + CTA al catálogo (index).
- Cuidados: lazy, peso, sin bloquear la lista si Deezer no responde (patrón
  is-loading existente), escapado igual de estricto.

### PP-2 · DASHBOARD CON VIDA (interacción del cliente)
- Hero del próximo viaje: foto grande del artista + countdown protagonista
  (días : horas : min como el index) + "faltan N pagos".
- Barra de progreso de pagos en cada tour card (pagado vs total, con el
  count-up de la casa al abrirse).
- Saludo con nombre real y detalle humano (p.ej. "Falta poco, {nombre}").
- Celebración una-sola-vez al quedar liquidado un tour (confetti sobrio de
  marca / badge "LIQUIDADO" animado; respeta reduced-motion).
- Micro-feedback PF-1/PF-2: tap en cards/botones, transiciones entre vistas.

### PP-3 · REDES + RADIO CONECTA (chiquita y sabrosa)
- Footer del portal (todas las vistas): IG conectarey · TikTok · Facebook ·
  Canal de WhatsApp · teléfono/WA de reservas · dirección de la oficina
  (línea T5) · "Radio Conecta".
- Mini-player de Radio Conecta: el pill/player del index adaptado al shell
  del portal (mismo stream, mismo patrón de carga perezosa del player).
  Cliente esperando su tour = cliente escuchando tu radio.
- Los links de dashboard existentes se conservan/armonizan.

### PP-4 · FAMILIA VISUAL COMPLETA
- Tokens PF-3 (--r-card/--r-btn/--r-chip/--r-sm + sombras) portados; los 7
  valores sueltos absorbidos.
- reduced-motion global patrón PF-1 (acortar, no anular).
- Escritorio vestido: fondo sutil detrás del shell (foto de tour velada al
  ~8-12% o textura de marca), sin tocar el ancho del shell.
- Pantalla de carga con marca (logo + pulso) en vez de spinner genérico.

## AUDITORÍA LIGERA — hallazgos (ninguno rojo)
- Seguridad: sin hallazgos nuevos; escapado y RLS ya auditados (Capas 1-5).
  El gate de perfil funciona. No se detectó superficie nueva.
- El paso 1 del wizard pinta hasta 60 eventos de golpe — con fotos habrá que
  virtualizar o paginar suave (nota para PP-1, no es problema hoy).
- Nota operativa: la base del Portal sigue vacía; PP-* no cambia lógica de
  negocio, solo presentación e interacción. Cero riesgo al encendido.

## Orden sugerido: PP-3 (rápida, estrena radio) → PP-1 → PP-2 → PP-4.
   Alternativa de impacto: PP-1 primero si Memo prefiere vender antes que sonar.
