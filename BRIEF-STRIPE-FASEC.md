# BRIEF · FASE C — Pagos con Stripe (serie ST)
> Sesión Cowork (Jane), 28-jul-2026. NO se commitea.
> Diseño APROBADO por Memo (24-25 jul) + cuenta Stripe verificada 28-jul
> (acct_1TxAt9Db2nKgxn8l, payout semanal lunes → BBVA, cargo "CONECTAREYNOSA.MX").
> Estrategia de Memo: construir TODO en modo test ahora; encender después con
> solo cambiar llaves.

## EL DISEÑO DE NEGOCIO (sellado, no re-litigar)
- Menú estilo Viva Aerobus con TOTAL claro por opción:
  · Transferencia — $X sin cargo (flujo actual, sigue existiendo SIEMPRE)
  · OXXO — $X + ~4% servicio
  · Débito — $X + ~4%
  · Crédito 1 exhibición o 3 MSI — +~5% · 6 MSI — +~8%
  Cada opción muestra SU total. El cargo por servicio lo paga el cliente
  (la utilidad de Memo intacta).
- SOLO PLUS/RIDE/STAY (payout a CLABE BBVA — cuenta fiscalizada).
  CHEAP queda en transferencia/depósito Banamex como hoy: SIN opciones Stripe,
  rechazado también del lado del servidor.
- Configurables: qué pagos aceptan tarjeta (p.ej. solo separo+liquidación) y
  quién absorbe el cargo (interruptor para promos).
- Los % de servicio viven en UN lugar configurable (no regados).

## ARQUITECTURA (reglas de la casa aplican TODAS)
- Stripe Checkout (página alojada por Stripe): cero manejo de tarjetas propio,
  OXXO y MSI nativos, moneda MXN.
- El TOTAL se calcula SIEMPRE en el servidor (el cliente jamás manda montos).
- Webhook con verificación de firma + IDEMPOTENCIA por event_id (leer antes
  de escribir, nada de on_conflict; 23505 = idempotencia CONFIRMADA).
- Al confirmarse un pago: se marca la cuota por la MAQUINARIA AUDITADA
  (reconciliación con tolerancia $1, bitácora pagos_auditoria, exclusión de
  bajas). Correo de felicitación pasa por correo-guard (respeta CORREOS_MODO).
- TODO tras interruptor PAGOS_STRIPE_MODO ('off' → dormido total).
- Llaves: STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET (test primero, live al
  encender). LAS PEGA MEMO EN NETLIFY — nunca viajan por chat ni por CC.
- SQL: CC diseña y REPORTA la migración; la corre la sesión Cowork (regla).

## SERIE ST
### ST-1 · CIMIENTOS BACKEND (modo test, sin UI)
- Tabla(s) Portal: registro de sesiones de checkout + eventos de webhook
  (event_id ÚNICO para idempotencia, liga a pago_id/solicitud, montos,
  método, cargo_servicio, estado). CC propone el esquema y lo reporta ANTES.
- _lib de Stripe (cliente + verificación de firma + cálculo de totales por
  método desde los % configurables).
- function stripe-checkout-crear: JWT del portal del titular → valida que la
  cuota exista, sea suya, no esté pagada, paquete elegible (no CHEAP) →
  crea Checkout Session con metadata {pago_id, solicitud_id} → devuelve URL.
- function stripe-webhook: firma verificada → idempotencia → marcar cuota
  por la vía auditada → bitácora. Fail-soft: un webhook repetido o tardío
  jamás duplica ni rompe.
- Arnés: totales por método exactos (tabla de casos) · CHEAP rechazado ·
  cuota ajena/pagada rechazada · webhook duplicado = 1 solo efecto · firma
  inválida = 400 sin efectos · todo con Stripe simulado + el real en test.

### ST-2 · EL MENÚ (UI del Portal, tras interruptor)
- El paso "Sube tu comprobante" del wizard + la vista de pagos del tour
  ganan el menú: Transferencia (flujo actual) + las opciones Stripe con su
  total cada una. Diseño de la casa (tokens, contraste AA medido).
- pagos.html: sección Stripe aparece solo con el interruptor encendido
  (PG-1 ya dejó el esqueleto listo).

### ST-3 · PRUEBAS END-TO-END (modo test)
- Flujo completo con tarjetas de prueba de Stripe + OXXO de prueba: pagar
  separo → webhook → cuota marcada → bitácora → correo (a buzón de prueba).
- Reintentos, abandono de checkout, pago tardío, doble click.

### ST-4 · ENCENDIDO (cuando Memo diga)
- Memo crea el webhook endpoint live y pega llaves live en Netlify.
- Interruptor on. Primer pago real chico de validación. Monitoreo primera
  semana en el radar.

## PASOS DE MEMO (con guía, cuando toque)
1. Dashboard Stripe → Desarrolladores → claves de API (modo TEST) → copiar
   las dos llaves test → pegarlas en Netlify (STRIPE_SECRET_KEY,
   STRIPE_PUBLISHABLE_KEY como test por ahora).
2. Cuando ST-1 esté lista: crear el webhook endpoint (la URL exacta la dará
   la tuerca) y pegar su secret en Netlify.
3. En el encendido (ST-4): repetir 1-2 con las llaves LIVE.
