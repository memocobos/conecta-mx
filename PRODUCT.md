# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El producto tiene **dos caras legítimas que pesan por igual** en las decisiones de diseño:

- **El viajero / cliente** — persona que viaja desde Reynosa (y la región) a conciertos y festivales. En su teléfono: descubre eventos, cotiza un paquete, aparta con un separo, manda comprobante, gestiona su plan de pagos, firma su contrato de viajero y consulta su viaje en el Portal. Contexto móvil, muchas veces bajo prisa (boletos que se agotan) y con conocimiento técnico bajo.
- **Memo Cobos (CEO) y el equipo interno** — operan todo el negocio desde Kamehouse. Roles internos con permisos distintos: `maestro_roshi` (Memo/dirección), `bulma` (admin/cobranza), `mister_popo` (visible como "Maestro Karin", inventario/bodega/reportes), `coordinador` (opera los tours), `cc` (creador/creadora de contenido), `vendedor`. ~150 clientes activos al mes; antes el negocio corría sobre un Excel de 58 pestañas (una por evento).

## Product Purpose

Conecta Reynosa es una agencia de viajes a conciertos y festivales (sucursal de la franquicia Conecta MX), con un ecosistema digital propio que cubre **todo el ciclo del negocio de punta a punta**: catálogo público y cotizador → apartado y plan de pagos → Portal del cliente → contratos digitales → operación interna (ventas de vendedores, cobranza, coordinadores, bodega/inventario, reportes post-evento) → comunidad (radio propia, creadores, giveaways).

Éxito = que un cliente pueda cotizar, apartar, pagar y firmar sin fricción desde el teléfono, **y** que Memo y su equipo corran el negocio completo desde una sola herramienta interna, con candados que protegen el dinero y el inventario.

## Positioning

**Una agencia chica de Reynosa que corre el 100% de su operación sobre software hecho a la medida.** El mecanismo diferenciador no es un eslogan sino la infraestructura: venta → pago → coordinación → bodega → contratos → radio, todo integrado, con roles, candados calculados en vivo (permiso previo, congelamiento, sellado de precios), comparaciones automáticas y cadenas de aprobación. Un competidor del mismo tamaño podría igualar el servicio de viaje, pero no esta plataforma operativa propia construida a lo largo del tiempo.

## Operating Context

- **Stack:** HTML/CSS/JS vanilla (sin build step) desplegado en Netlify desde GitHub (`memocobos/conecta-mx`), con 132 Netlify Functions como backend y **dos proyectos Supabase**: KameHouse/KH (`npgnhsmwpcipxgvfxrho`, operación interna) y Portal (`muvvrstnkxsxfpkhbntq`, clientes). El puente entre mundos suele ser por correo (llave de match) o por slug del evento.
- **Superficies (todas web):**
  - `index.html` — sitio público: catálogo de eventos (array `EV`), cotizador de paquetes, lista de espera, mini-reproductor de radio.
  - `portal.html` — Portal del cliente que ya compró (gestión de viaje, pagos, contratos, datos).
  - `kamehouse.html` — herramienta interna de operación (la más grande): ventas, cobranza, eventos, gastos/ingresos, inventario (Torre de Karin), reportes, contratos, Guerreros Z (equipo), Palacio (liquidaciones/reembolsos), Radar del Dragón (alertas), Kaio-sama (admin de radio).
  - `contrato.html` / `contrato-viajero.html` — firma de contratos (canvas + INE), optimizada para móvil.
  - `rol.html` — cotizador ROL (transitorio; desaparece cuando el Portal lo reemplace — no invertir esfuerzo ahí).
  - `radio/` — reproductor público de Radio Conecta.
  - Páginas de apoyo: `faq.html`, `funciona.html`, `kit.html`, `pagos.html`, `diseno.html`, `recibos_v6.html`.
- **Nomenclatura interna (tema Dragon Ball), es parte real del producto:** Kamehouse (admin), Maestro Roshi / Bulma / Maestro Karin (roles), Guerreros Z (equipo), Torre de Karin (bodega), Palacio (finanzas), Kaio-sama (radio), Radar del Dragón (alertas), Nube Voladora (transporte).
- **Reglas de negocio factuales:** paquetes PLUS (todo incluido) / RIDE (sin boleto) / STAY (sin transporte, solo MTY) / CHEAP (solo boleto, separo $1,000). `sep` = costo del transporte. Bancos por regla: CHEAP→Banamex, resto→banco del evento||BBVA (fuente única `_lib/cuenta-deposito`). Contacto: WhatsApp reservas 52 811 977 1072, vuelos 52 813 232 1405.
- **Operativo vivo:** el switch `CORREOS_MODO` mantiene los correos salientes en modo 'prueba' (buzón de calibración) hasta su encendido planeado (~1-ago-2026); las emergencias de infraestructura son la excepción.

## Capabilities and Constraints

- **Ciclo del cliente:** catálogo/cotizador público → apartado (separo) → plan de pagos (generado por `getQuincenas`) → Portal → contrato de viajero (uno por lugar) → recordatorios pre-viaje.
- **Contratos (vía B, tabla `contratos_creadores` en KH):** 4 plantillas — `creadora`, `coordinador` (12 cláusulas + anexo de custodia opcional para cuidador de bodega), `giveaway`, `creadora_team` (18 cláusulas + Anexo C confidencial). Vigencia configurable 3/6/9/12 meses; auto-llenado desde 3 perfiles distintos; firma digital = canvas + INE.
- **Módulo Vendedores (F1→F6, en producción):** venta como `solicitud_tour` del Portal con precio sellado del catálogo (candado), separo = ganancia de Memo, economía CHEAP (matriz+comisión) y liquidación 30% al cierre, candado de inactividad calculado en vivo.
- **Torre de Karin v2 (bodega, en producción):** inventario con piezas retornables, salidas con permiso previo del cuidador (el stock baja solo al autorizar), comparación automática al regresar, cobro de faltantes al costo de reposición con congelamiento, sistema de strikes.
- **Radio Conecta:** reproductor público + admin Kaio-sama (control AzuraCast, editor de metadata/portadas en NAS, estadísticas, avisos, vigilante).
- **Constraint arquitectónico:** sin build step; todo es HTML/JS servido directo. Los cambios se prueban con arneses de integración (Node + mocks) y se validan byte-igual contra `main` para no regresar.
- **Idioma:** producto 100% en español (México).

## Brand Commitments

- **Nombre:** Conecta Reynosa (sucursal de Conecta MX). CEO: Memo Cobos (hcgcobos@gmail.com).
- **Colores confirmados (en código):** Negro `#000000` · Blanco `#ffffff` · Azul `#0000cd` · Rojo `#ff283b` · Amarillo `#e8ff4c` · Verde `#88ea4e`.
- **Tipografías en uso:** Kaneda Gothic, Montserrat (Bold/Medium) en el sitio público; Rajdhani, Zen Dots, Barlow Condensed, JetBrains Mono en Kamehouse.
- **Manual de marca:** referenciado en el repo (`Manual_De_Marca.pdf` según CLAUDE.md) — confirmar ruta antes de tratarlo como binding.
- **Personalidad:** enérgica, juvenil, de comunidad; el interno adopta un universo Dragon Ball consistente (ver Operating Context). WhatsApp conserva sus emojis por decisión de Memo; en la UI interna la regla de iconos es sprite SVG (no emojis de color).

## Evidence on Hand

- **Textos legales oficiales** (fuentes canónicas, byte-idénticas): `contrato-viajero-v3.1-TEXTO-OFICIAL.md`, `contratos-viaB-v3.1-TEXTO-OFICIAL.md`, `contrato-team-v1-TEXTO-OFICIAL.md`, `contrato-anexo-cuidador-v1-TEXTO-OFICIAL.md`.
- **Catálogo real de eventos** con imágenes de portada en `imgs/` (webp/jpg por artista) — eventos reales con fechas, venues, zonas y precios en el array `EV` de `index.html`.
- **Analytics:** Google Analytics `G-7JKGFQQQ7W` + Facebook pixel ya instalados.
- **Datos bancarios reales** para depósitos (BBVA/CLABE del titular Guillermo Alexander Cobos Vizcarra) — sensibles.
- **Ausencias que el trabajo futuro NO debe fabricar:** no hay testimonios, reseñas, benchmarks, ni conteos de clientes más allá del ~150 activos/mes confirmado; no inventar cuentas, precios ni claims de deployment que no estén en el código.

## Product Principles

1. **Dos mundos, un solo producto.** La cara pública (persuadir al viajero) y la herramienta interna (operar el negocio) merecen el mismo cuidado; ninguna es "la de a de veras".
2. **El dinero y el inventario se protegen con candados, no con confianza.** Precios sellados, permisos previos, congelamientos, cadenas de aprobación y comparaciones automáticas son parte del producto, no burocracia.
3. **El teléfono es el escenario del cliente.** Cotizar, apartar, pagar y firmar tienen que sentirse nativos en móvil, con fricción mínima y lenguaje claro.
4. **Nada se rompe sin querer.** Cambios aditivos, verificados byte-igual contra lo vivo; los flujos existentes se preservan salvo decisión explícita.
5. **El universo de marca es coherente y propio.** La nomenclatura Dragon Ball internamente y la voz enérgica hacia afuera son activos, no decoración.

## Accessibility & Inclusion

- Producto en **español mexicano**; toda copy, error y correo en ese idioma.
- **Móvil primero** para las superficies del cliente (firma con foto de INE, cotizador, Portal): la mayoría opera desde el teléfono.
- Sin estándar de accesibilidad formal establecido aún — pendiente de decisión de Memo si se requiere uno específico.
