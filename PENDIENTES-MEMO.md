# 📋 PENDIENTES — Lista maestra de Memo (act. 24-jul-2026 tarde)

> Archivo personal de Memo — NO se commitea al repo (scratch, como sitemap.xml).

## 📌 Para el manual / para saber (de la jornada del 25-jul)
- Tras REACTIVAR a un vendedor puede tardar hasta 5 min en poder vender (caché). No es falla.
- NO existe "olvidé mi contraseña": solo Memo o Bulma resetean.
- Desactivar a alguien lo saca en ≤1 min (antes eran 8 h). Reactivar NO limpia la marca de sesiones: la persona vuelve a entrar con su contraseña normal.
- Regla operativa: **jamás "Run now"** en un cron desde Netlify si no es necesario (los de cobranza y contratos ya tienen bitácora; los internos aún pueden duplicar).
- Renglones del log que valen oro cuando el equipo vuelva: `clienteDuplicados`, `clienteSinBitacora`, `[vendedor-activo]` warns.

## 🏰 CIERRE 28-jul — KAMEHOUSE COMPLETO (fin del rediseño del ecosistema)
- **Serie KH cerrada (#385-#389)** + PG-1 (#384) + E1 (#386): cimientos con tokens (266 elementos, 7 temas personales respetados) · Guerreros Z con familia visual (clip-path fuera, avatares redondos, cascada) · las mesas con jerarquía (cifra 4×, zebra, sticky) · Torre/Cotizar/bottombar (fix de reglas muertas .kh-bottombar) + barrido final: CERO radios fuera de sistema.
- pagos.html a prueba de error (selector de paquete, candado de ancla para correos de cobranza).
- Casilla "Próx." por zona en Esferas (la tubería completa reparada — el campo se moría en 3 fronteras).
- Natanael Cano EN VENTA + primera noticia del banner de Memo EN PROD.
- Nota de registro: PR #388 (KH-3) figura CLOSED en GitHub pero su merge 2387df6 SÍ está en main (push rechazado por carrera, rama borrada antes de tiempo — lección aprendida).
- ANOTADOS para tuercas futuras (medidos y congelados con aserción): estilos de color en línea del Palacio (827 JS + 158 HTML + 49 th que ninguna hoja alcanza) · barrita de progreso de funciona.html a transform:scaleX (micro) · decisión de tipografía del Palacio (Rajdhani/Zen Dots).
- SIGUIENTE: semana operativa — re-onboarding de los 6 + CHECKLIST-ENCENDIDO + apagar CORREOS_MODO el viernes.

## 🏆 CIERRE 27-jul — PORTAL COMPLETO
- **Serie PP cerrada y en prod (#379-#383)**: footer con redes + Radio Conecta · fotos de artistas en el wizard (con caché y carga perezosa) · dashboard con vida (hero countdown, "faltan N pagos" exacto, celebración al liquidar) · familia visual (tokens, reduced-motion, escritorio vestido, carga con marca) · pool de 140 saludos con buckets inteligentes ([PRE]/[SIN]/HOY/neutras).
- Decisiones selladas (en CLAUDE.md, no re-litigar): barra de % de pagos = Fase C a propósito · bucket HOY como está.
- Micro-tuerca candidata anotada: la barrita de progreso de scroll de funciona.html anima width (código de abril) → pasarla a transform:scaleX, un renglón. Sin prisa.
- El Portal está listo para el encendido. Sigue lo operativo: CORREOS_MODO viernes, re-onboarding de los 6, env vars, y la PRIMERA NOTICIA del banner (sigue vacío — la marquesina muestra el lema hasta que Memo capture en Esferas → Noticias del banner).

## 🌙 CIERRE 26-jul (noche) — estado al irse a dormir
- 18 PRs mergeadas en 2 días (#361–#378): sitio público COMPLETO (pulido, redondeo, fotos reales en funciona/kit/faq, oficina en footers, token AA, banner manual, permisos esferas). Última: PF-6a-bis (#378) — confirmar si CC ya la mergeó.
- MAÑANA: diagnóstico profundo del PORTAL (lectura de código + Chrome) con calma → plan por tuercas → PF-Portal.
- Memo tiene 2 estrenos personales pendientes: ver /funciona con el hero nuevo · capturar su primera noticia en Esferas → Noticias del banner (el banner sigue en lema estático hasta entonces).
- No perder: T2b (fechas ambiguas) · arneses podridos (5) · .toLowerCase() staff · estrenar T4/chips en vivo · 19 reglas sub-AA anotadas (estética, decisión Memo) · encendido correos viernes ~1-ago · re-onboarding equipo esta semana.

## 🎨 Serie de diseño + contratos (26-jul)
- [x] PF-1..PF-4 + T1 MERGEADAS 26-jul (#361-#365): pulido fino · punch + wizard móvil + barra de total · sistema de redondeo/sombras · remates + redes (IG→conectarey, Threads fuera) + marquesina viva · exclusividad dura de coordinador (sellada server-side, contratos viejos byte-idénticos; 0 coordis legacy en la base — todos firmarán el texto duro).
- [x] **T2** MERGEADA (#366) — "¿toma el viaje?" externas → viajeros_evento con chip en transporte.
- [x] **T3** MERGEADA (#367) — "¿premio incluye viaje?" giveaway → listas (helper compartido con T2). Ganador entra solo con perfil completo o Portal caído (con nota); sin cuenta/incompleto la firma ya cortaba antes.
- [ ] **T4** — separo al aceptar solicitud (PR #368 EN MERGE): fila por lugar con casilla, N llamadas a admin-marcar-pago, resultado honesto por lugar. ⚠️ Estrenar en vivo con la 1ª solicitud real antes de confiarle un grupo grande.
- [ ] **B1** — bugfix 1 línea: kamehouse.css:1929 pinta el ícono campana como texto en el preview de card Próximamente (CC la debe, recordada 26-jul).
- [ ] **T2b** — resolver evento por nombre además de fecha: 15 fechas ambiguas en eventos_meta (5-dic tiene 3); ahí hoy no se auto-asigna nadie (coordis, externas, ganadores).
- [ ] **PF-5** — portar tokens de redondeo a kit/funciona/faq/pagos (27 hallazgos anotados del barrido PF-4).
- [ ] **PF-Portal** — pasada de diseño impecable al Portal.
- [ ] **Mantenimiento de arneses podridos** (todos rotos pre-tuercas, comprobado en main): harness-contrato-team y harness-contratos-perfiles crashean · harness-contrato-auxiliar 28/32 · harness-buscadores y harness-kamehouse-v2 crashean · + 5 fallas viejas del arnés de equivalencia del scratchpad. Sesión aparte.
- [ ] **.toLowerCase() en _upsertViajeroStaffServer** — 2 líneas, teórico hoy (0/18 correos con mayúsculas).
- Chip del primer contrato real del re-onboarding: revisarlo en vivo en transporte (nota CC).
- Nota tabla de permisos por rol entregada a Memo 26-jul (PERMISOS_TABS/GZ_TABS_PERMITIDAS) — pendiente que dicte ajustes si quiere.

## 🏢 PROYECTO FRANQUICIA-EN-CAJA (anotado 26-jul — arranca DESPUÉS de 3 meses de KameHouse estable)
> Criterio de Memo: el sistema debe operar ~3 meses sin errores en Reynosa antes de llegar con alguien más. O sea: encendido viernes → medir estabilidad ago-oct → si todo verde, arrancar ~nov 2026.
- **Qué es**: replicar el sistema completo a todas las sucursales de Conecta MX. NO es de cero — ~90% del código sirve tal cual.
- **Plan técnico (3-4 tuercas grandes cuando toque)**:
  1. Des-reynosación: sacar lo hardcodeado a UN archivo de config por sucursal (censo 26-jul: "reynosa" en 64 archivos, dominio en 58, WA en 15, banco en 3, GA en 2).
  2. Exportar el esquema de las 2 bases Supabase como receta repetible (hoy vive solo en el proyecto).
  3. Repo plantilla "corazón" + instancias por sucursal (org GitHub central); mejoras del corazón se jalan con merge.
  4. Manual de alta de sucursal (~1 día por sucursal con la receta).
- **Arquitectura de control**: GitHub/Netlify/Supabase centrales (Memo admin de nacimiento, sin pedir credenciales) · cada sucursal con SUS 2 proyectos Supabase (dinero/datos aislados) · banco y Stripe SIEMPRE del dueño de cada sucursal (jamás centralizar lana ajena; soporte vía rol limitado de Stripe).
- **Modelo de precio (marco de referencia, sesión propia cuando toque)**: NO vender — licenciar. Alta por sucursal $20-40k MXN + renta $2,500-6,000 MXN/mes (ancla: hace la chamba de un auxiliar de $8-12k/mes; costo operativo ~$500-1k/mes por sucursal va dentro). Valor de reposición si lo cotizaran de cero: $400-800k MXN. Contrato: el sistema es DE Conecta MX en licencia, la sucursal lo usa, nunca lo posee.
- Rol operativo: Memo + sesión Cowork + Claude Code = "sistemas" de toda la red, mismo flujo de tuercas de hoy.

## 🔥 Lo próximo
- [x] **Checklist de encendido** — ACTUALIZADO 29-jul post-C2 (CHECKLIST-ENCENDIDO.md): bloqueante nuevo = tuerca del correo único ANTES del switch · env vars con revisada rápida · emisores de C2 sumados · censo de destinatarios día-1 HECHO (2 contratos de creadoras pendientes de firma: Marietta/Soy Luna 21-jul y Eva/Melanie 28-jul · waitlist 349 filas/327 correos, 0 notificados, solo dispara al pasar un evento de próximamente→activo — Bad Bunny 211, Julión 108).
- [ ] **ENCENDIDO** — viernes ~1-ago: apagar CORREOS_MODO=prueba (prende todo de golpe: alertas de contratos, cajitas de cuenta, ventas expiradas, reembolsos, radar completo, correos de bodega). Después: el blast de Memo.
- [x] **Respaldo diario en NAS** — ✅ COMPLETO Y OPERANDO 25-jul 15:04 ("Respaldo COMPLETO ✓" con los 4 tesoros): carpeta respaldos-conecta + proyecto Docker "respaldos" (6º del NAS UGREEN "MeCo", junto a tunnel/radio/navidrome/editor/beets). Respalda cada noche 2AM: DB KameHouse ✓ + repo completo ✓ + config NAS/código del editor ✓ + retención 14 días. PENDIENTE: dump del Portal (propagación de contraseña — reintenta solo cada 30 min). LEEME.md en la carpeta explica restauración. Futuro: copia fuera de casa de la biblioteca de música.
- [x] **CUENTA STRIPE ACTIVA** (25-jul): hcgcobos@gmail.com, agencia de viajes, cargo "CONECTAREYNOSA.MX", payout semanal lunes→BBVA, 2FA passkey. Falta: aprobación de depósitos (1-3 días). Fase C lista para construirse.

## Estrenos personales de Memo (todo listo, solo usar)
- [ ] Re-onboarding de los primeros 5: Alan (rol Maestro Karin + anexo cuidador), Axel, Reginna, Laura (coordinadores con vigencia), Sofía (bulma, dos contratos).
- [ ] Ximena → milk con sus dos contratos (la opción Milk ya está en el menú de invitar tras #338).
- [ ] Capturar comisiones CHEAP en el wizard del Palacio.
- [ ] Contratos del team: Grecia y Valerie.

## 🌉 PUENTE index→portal→kamehouse (EN CONSTRUCCIÓN — adelantado por decisión de Memo 24-jul, todo tras interruptor)
- [x] **Fase A — tuerca 1 EN PROD** (#340, dormida tras interruptor): botón del index → portal con cotización precargada, login Google, degradación amable. Probar con conectareynosa.mx/?portal=1. PROBADA EN VIVO por Memo 24-jul: flujo aprobado ("el camino está bien"). Nota: el "saltar por ahora" del comprobante es correcto por ahora — en Fase B se le pone reloj y en Fase C se vuelve menú de pago. Encendido (false→true) cuando el puente esté completo.
- [ ] **Fase B — Stock con reloj**: B1 SQL ✓ · B2 EN PROD ✓ (#341: candado anti-sobreventa server-side, reloj 15 min que se detiene con comprobante, semáforo del wizard agotado/quedan-N, RIDE fuera). B3 ✓ (#342: semáforo en el Palacio + casilla vendidos_fuera, roshi/bulma) — FASE B COMPLETA. Despertar stock por evento: compras en Palacio + vendidos_fuera + listo. DATOS EN CERO por decisión de Memo (compras de Paco borradas) — el candado despierta por evento cuando se capturen compras reales + su vendidos_fuera. B4 ✓ (#343: aviso "apartado vencido" 8:30 AM, solo notifica, bitácora hold_avisado_at) — FASE B AL 100%. Nota CC: eventos multifecha con inventario → confirmar llaveo por #idx. Regla de oro: con stock encendido, TODA venta pasa por el sistema.
- [ ] **Fase C — Pagos automáticos (Stripe)**: CONSTRUIDA Y PROBADA en modo test — series ST (ST-1 cimientos, ST-2 menú, ST-3a webhook tolerante) + C2 completa (C2-1 holds, C2-2 separo checkout, C2-3 cola+sello+reembolso, C2-4 menú 4→6 tarjetas, **C2-5 pruebas end-to-end CERRADA 29-jul**: 14 tuercas en prod, casos verdes incl. rechazo, OXXO completo con ficha 1 día, aceptación que sella con $300-no-$312, terquedad 200 ya_aplicado, chip PAGADA ✓ visto nacer en vivo). DECISIONES SELLADAS: 4 tarjetas separadas débito/crédito con SU total · MSI ≥50% del tour TAMBIÉN en separo (#404) · reloj siempre visible · ficha OXXO 1 día · UN solo correo al aceptar (plan+firma juntos; tuerca pendiente de orden). **C2-6 LIMPIEZA CORRIDA 29-jul** (Palacio de vuelta a $0 verificado en vivo; solo queda el fixture Rosalía — paso 2 del SQL, esperando palabra de Memo; hallazgo de revisión: el orden de FKs del script original mordía en pagos.lugar_id→lugares, corregido por Cowork al correr) · CHECKLIST-ESTRENO-PORTAL.md escrito y aprobado + checklist de estreno (correo único · rastro persistente de envíos · chip OXXO sin hold opción (a) con límite 48h · **cargar stock real — desactiva de raíz los huecos** · OXXO test confirma solo en 3.5-4.5 min, no prometer minutos al cliente) + **ST-4 encendido** (llaves live que pega Memo, webhook live, primer pago real chico).
- [ ] **Fase D — Carrito multi-tour + index a 9 viajeros**: index-9 ✓ (#344 aprobada y en merge: 1-9 personas público, N>4→compartida en las 3 copias, arnés 15,156 combos / 0 diffs — los grupos grandes ya se autocotizan). Carrito: después de Fase C.
- [x] **Trámite Stripe de Memo** — HECHO: cuenta activa y verificada 28-jul (acct_1TxAt9…, cargo "CONECTAREYNOSA.MX", payout semanal lunes→BBVA). Llaves TEST en Netlify; las LIVE las pega Memo en ST-4.
- [ ] **Transición dinero eventos actuales**: al marcar el gasto de boletos, registrar UN ingreso resumen "ventas pre-portal <evento>" para cuadrar caja real (sin migrar viajeros).
- [ ] Purgar cuentas de login huérfanas del Portal (las de los clientes de prueba borrados — inofensivas mientras tanto).

## Backlog tranquilo
- [ ] Auditoría completa línea por línea (kamehouse + portal, por capas, sin prisa).
- [x] Menudencias Netlify HECHAS 24-jul: borradas 6 vars (3 huérfanas + 3 "a secas" que apuntaban a Cuarto Piso — quedan 15, todas con dueño) · imágenes a dieta en PR (icono kamehouse 720K→50K, 5 kits + edsheeran a webp, 3 mapas huérfanos a la basura; ~4.6MB→0.6MB) · llaves canónicas de Supabase documentadas en netlify.toml (misma PR).
- [x] Poda de fallbacks Supabase HECHA 25-jul (#345): 131 referencias a secas → 0 en 46 archivos, canónicas intactas, cero cambio de comportamiento.
- [x] 🏆 **AUDITORÍA COMPLETA — LAS 5 CAPAS (25-jul)**: Capa 1 _lib · Capa 2 auth/sesión (+probada en vivo 7/7) · Capa 3 dinero · Capa 4 crons · Capa 5 pantallas. 13 tuercas mergeadas hoy, 667 pruebas en 12 arneses, todo en verde. Reportes: REPORTE-AUDITORIA-CAPA1..5.md. Pendientes chicos anotados: ALTER de `nivel` en avisos_cobranza (esperando visto bueno) · contratos-alerta-cron como candidato de bitácora · 29-feb en cumple_hoy · regla de vendedor-activo (decisión de Memo).
- [ ] (histórico) Capa 1 detalle: **COMPLETA Y CORREGIDA 25-jul** (12/12 librerías auditadas; hallazgos rojos exterminados en #349/#350/#351: inyección </script>, fusión de re-publicación, banco preservado, candados de venta, carrera de lugares, 409 honesto, sync de menores; equivalencia 17,280 combos/0 diffs; barrido 92/92 eventos). Nota operativa: 25 eventos viejos ahora rechazan venta con motivo claro (13 agotados, 10 fecha pasada, 2 zona agotada) — correcto. SIGUEN: Capa 2 (auth/sesión), Capa 3 (dinero), Capa 4 (crons), Capa 5 (frontales) — receta probada: auditoras en paralelo + tuercas de corrección mismo día.
- [x] Regla de vendedores DECIDIDA 25-jul: **RODANTE** (3 meses desde la ÚLTIMA venta) + **PUERTA CERRADA** (bloqueado NO se auto-desbloquea vendiendo; solo Memo lo reactiva con invitación/botón, y eso reinicia el reloj). En #358. Ojo operativo: tras reactivar, hasta 5 min de caché antes de que pueda vender. Chip en GZ con 2 estados: 🚪 acceso pausado (ya bloqueado) vs 💤 sin ventas en 3 meses (aviso anticipado — ahí aún alcanzas a reactivarlo).
- [ ] Revisar BORRADOR-MANUAL-OPERACION.md (~470 líneas, 5 dudas marcadas [DUDA]) — para antes del re-onboarding del equipo.
- [x] Panel "Ventas" — RESUELTO 25-jul: NO es duplicado de "Por Evento" (Ventas=mapa financiero de todos los eventos; Por Evento=lupa de uno con sus viajeros). Se quedan los dos.
- [x] Música fuera-de-casa — DECIDIDO 25-jul por Memo: todo vive en el NAS, sin copia externa ("para eso compré el NAS, me cansé de discos externos").
- [x] Torre opcionales — LOS 3 EN PRODUCCIÓN 25-jul (#346/#347/#348): kardex por pieza · recordatorio 48h de retornables (cron 9AM, calibración hasta el viernes) · chip "trae prestado" en GZ. TORRE DE KARIN COMPLETA.
- [ ] Manual de operación de KameHouse para el equipo (otra sesión).
- [ ] Nota permanente: datos bancarios viven en 3 lugares (index, catalogo-index, pagos.html) — si cambia la cuenta, tocar los 3.

## ✅ Hecho esta semana (resumen)
- Contratos completo (viajeros + vía B + auxiliar_admin de abogados) · Machote 100% · Vendedores F1→F6 · Torre v2 · MILK completo + reset de equipo · Buscadores · Alertas clickeables · Caja real (bug utilidad-$0 cazado) + poda de 6 tablas muertas · Velocidad V1+V2 · Resumen matutino.
- 24-jul: hotfix TDZ + hotfix visual (secuelas V2, lección grabada) · **Saludo v2 de cine** (200 frases con créditos, todos los roles, check-in de ánimo admins) · **Radio en KameHouse** · fix Milk en invitaciones + candado de jerarquía (#338) · **limpieza total de datos de prueba** (Portal en ceros, bitácoras KH en cero, lo real intacto) · **1ª observación del cron: debut limpio** (contratos 8:02 sin errores, recordatorio de abonos 8:06 mandó 1 [PRUEBA]).
