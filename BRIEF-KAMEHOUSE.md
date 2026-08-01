# BRIEF · Radiografía + plan de KAMEHOUSE (serie KH)
> Sesión Cowork (Jane), 27-jul-2026. NO se commitea.
> Fuente: kamehouse.html (2,947) + kamehouse.js (19,256) + kamehouse.css (2,272),
> mapa de permisos por rol (PERMISOS_TABS, 19 pantallas), login visto en vivo.
> Contexto de calendario: re-onboarding del equipo ESTA SEMANA + encendido viernes.
> Por eso TODA la serie es presentación pura: cero lógica, cero backend, cero SQL.

## RADIOGRAFÍA
### Lo fuerte (no tocar)
- El login ya es digno (card limpia, marca, degradado sobrio).
- Los módulos NUEVOS (contratos, Torre v2, vendedores, saludo de cine, radio,
  kardex) son consistentes entre sí y con buen nivel.
- Ya existe infraestructura móvil: bottombar (D2), tools-sheet, drawer.
- El saludo de cine + check-in de ánimo ya le da alma a la entrada.
- Seguridad/escapado auditados (Capas 1-5; los 208 escapes de CAP5-1).

### Lo flaco (medido)
1. DERIVA VISUAL ACUMULADA: 29 tamaños distintos de border-radius (el sitio
   y el Portal ya viven con 6) · 93 colores hex distintos en el CSS · tokens
   de la casa casi ausentes. Es el clásico "cada módulo de su papá".
2. MOVIMIENTO: 58 transiciones y 15 keyframes pero solo 3 reduced-motion;
   sin el idioma PF-1 (tap feedback, entradas suaves) que ya hablan sitio
   y Portal.
3. ERAS MEZCLADAS: Guerreros Z y los paneles viejos se ven de otra época
   junto a Torre v2/contratos. Justo GZ es la cara que verá el equipo
   re-integrado esta semana.
4. DENSIDAD SIN JERARQUÍA en las mesas de trabajo (Pagos, Por Evento,
   Capsule): tablas llenas de datos con poco ritmo visual — funcionales
   pero cansadas para 8 horas de uso.
5. (Anotado, NO de esta serie: esferas es un iframe de 1.1MB con app propia;
   los 523 innerHTML son el estilo del proyecto, no un defecto.)

## PLAN — serie KH (4 tuercas, todas CSS/presentación en kamehouse.css + clases)
### KH-1 · CIMIENTOS (la que habilita todo)
- Tokens de la casa en kamehouse.css: --r-card/--r-btn/--r-chip/--r-sm +
  sombras, bloque byte-igual al del index (patrón PF-5/PP-4). Los 29 radius
  absorbidos; excepciones deliberadas documentadas.
- Paleta núcleo a variables: los ~10 colores estructurales (fondos, bordes,
  tintas) a var(); los 93 hex de acentos de módulo se quedan pero anotados.
- reduced-motion global patrón PF-1 (acortar, no anular).
- Tap feedback global (:active en botones/cards) + focus-visible.
### KH-2 · GUERREROS Z (la cara del equipo, semana de re-onboarding)
- Tarjetas de equipo con la familia visual: avatar prominente, chips de
  estado existentes (🚪/💤/cumple) armonizados, jerarquía nombre→rol→datos.
- Perfil propio: misma familia. El flujo de invitar: pulido visual only.
### KH-3 · LAS MESAS DE MEMO (Resumen · Pagos · Por Evento · Portal)
- Resumen: métricas con jerarquía (la cifra grande protagonista), cards
  con tokens, el resumen matutino con aire.
- Pagos/Por Evento/Solicitudes: filas con ritmo (zebra sutil u hover),
  estados con chips consistentes, encabezados pegajosos si no los hay.
- El paso de separo T4 y buscadores: armonizar, no rediseñar.
### KH-4 · TORRE + COTIZAR + CAPSULE + REMATES MÓVILES
- Torre (Karin) y Cotizar/Vender (vendedores): familia visual completa.
- Bottombar/tools-sheet: tap states, transiciones suaves.
- Barrido final de radios/colores fuera de sistema (patrón "barrer, no lista").

## REGLAS DE LA SERIE
- kamehouse.css y clases; el JS solo si un chip/clase lo exige (cosmético).
- El CSS/JS de KameHouse vive en sus archivos, no inline (regla de la casa).
- Textos, flujos, permisos y candados INTACTOS. Los arneses de T4/T7/CAP*
  deben seguir verdes.
- Arnés por tuerca: conteo de radios/colores, contraste medido (alpha
  compuesto), capturas por pantalla y rol (fixtures, como T4), regresión.
- Capturas SIEMPRE en móvil también: el equipo usa el Palacio desde el cel.

## Orden: KH-1 → KH-2 → KH-3 → KH-4.
KH-1+KH-2 idealmente ANTES del re-onboarding (el equipo aprende la cara nueva
una sola vez). KH-3/KH-4 pueden cruzar la semana sin riesgo (CSS puro).
