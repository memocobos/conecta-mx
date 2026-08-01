# BRIEF · FASE C2 — Pago directo al solicitar (el flujo Ticketmaster de Conecta)
> Sesión Cowork (Jane), 28-jul-2026. NO se commitea.
> DECISIÓN DE MEMO (sellada): el modelo "solicita → espera aceptación → paga" NO
> convence. El cliente paga DIRECTO al hacer su solicitud. Pruebas end-to-end
> hasta que TODO esté construido (ST-3 pausada; su maquinaria se reusa entera).
> PRINCIPIO REY: sencillez para Reynosa — la tecnología no es el fuerte del
> cliente. Botones grandes, español llano, cero jerga, el reloj siempre visible.

## EL FLUJO (sellado por Memo)
1. SOLICITUD CONTRA STOCK: el cliente arma su solicitud (wizard actual) y al
   confirmarla su lugar queda SEPARADO con reloj visible:
   · Tarjeta débito/crédito · transferencia · depósito directo → 10-15 min
   · OXXO / autoservicios → 24 horas
   Donde el evento tenga stock encendido (Fase B), el candado es real; donde
   no, el reloj es la promesa de UX (mismo componente).
2. PAGA AHÍ MISMO, según método:
   · Tarjeta/débito → Stripe Checkout inmediato (separo + cargo servicio).
   · OXXO → su ficha/voucher con vigencia 24 h (Stripe, confirmación async).
   · Transferencia/depósito → datos bancarios + subir comprobante dentro de
     su ventana (flujo actual de comprobante).
3. LA COLA DEL PALACIO LLEGA ETIQUETADA:
   · "PAGADA ✓" — Stripe confirmó solo (webhook), con datos del cliente.
   · "CON COMPROBANTE" — transferencia, Memo revisa banco.
   · "OXXO PENDIENTE" — voucher emitido, esperando pago (hasta 24 h).
   Si algo no cuadra, Memo contacta directo al cliente desde la solicitud.
4. LA ACEPTACIÓN DE MEMO ES EL SELLO: genera el plan de pagos, APLICA el
   separo ya pagado a la cuota 1 (por la vía auditada, actor stripe), manda
   el correo "🎫 Tu boleto está separado + tu plan de pagos" y el portal del
   cliente se actualiza. Rechazo (raro, con stock ya no hay sobreventa) →
   reembolso Stripe / devolución manual — política visible.
5. CUOTAS SIGUIENTES: el menú ST-2 ya construido (post-aceptación), igual.

## LO QUE YA EXISTE Y SE REUSA (no reconstruir)
- ST-1: checkout server-side, webhook firmado + idempotente + tolerante a
  carga flaca, núcleo auditado de marcado, candados llave/modo/interruptor.
- ST-2: menú con totales del servidor (sirve para cuotas post-aceptación y
  como base visual del paso de pago del wizard).
- Fase B: candado anti-sobreventa server-side + reloj de 15 min que se
  detiene con comprobante + semáforo + aviso de apartados vencidos (B4).
- T4: el paso de separo al aceptar (se ADAPTA: si el separo ya vino pagado
  por Stripe, el paso lo dice y no pregunta).

## SERIE C2 (una fase = una tuerca = una PR; SQL siempre reportado antes)
### C2-1 · CIMIENTOS DEL HOLD + SQL
- Estados de solicitud/hold: separado_con_reloj (vencimiento por método),
  separo_pagado (Stripe confirmó), con_comprobante, oxxo_pendiente, vencida.
- SQL: columnas/estados nuevos en solicitudes_tour (o tabla de holds) —
  CC diseña y REPORTA; Cowork corre. Reusar el reloj de Fase B, no duplicarlo.
- Cron/limpieza de holds vencidos (patrón B4: avisa/libera, bitácora).
### C2-2 · CHECKOUT DE SEPARO PRE-ACEPTACIÓN
- Variante de stripe-checkout-crear: cobra el SEPARO de una solicitud
  (monto server-side desde el evento; metadata solicitud_id, sin pago_id).
- OXXO con vigencia 24 h alineada al hold. Webhook: separo_pagado + datos.
- El separo pagado queda "en espera de aplicarse" hasta la aceptación.
### C2-3 · LA COLA ETIQUETADA + ACEPTACIÓN QUE SELLA
- Solicitudes Portal en el Palacio: etiquetas PAGADA ✓ / CON COMPROBANTE /
  OXXO PENDIENTE / reloj restante. T4 adaptado (separo ya pagado → informa).
- Aceptar: genera plan + aplica separo a cuota 1 (vía auditada) + correo
  "boleto separado + plan" (pasa por correo-guard) + portal actualizado.
- Rechazar con pago: flujo de reembolso Stripe (roshi-only, bitácora).
### C2-4 · EL PASO DE PAGO DEL WIZARD (la cara sencilla)
- Al confirmar solicitud: "¿Cómo quieres pagar tu apartado?" — 3 tarjetas
  GRANDES: 💳 Tarjeta (pago ya) · 🏪 OXXO (24 h para pagar) · 🏦
  Transferencia (sube tu comprobante). Totales del servidor. Reloj visible
  SIEMPRE ("Tu lugar está separado por 14:59").
- Español llano probado: cero "checkout", cero "session". Textos que un
  cliente de Reynosa lee una vez y entiende.
### C2-5 · PRUEBAS END-TO-END DE TODO (la ST-3 ampliada) — ✅ CERRADA 29-jul
- VERDES: caso 1 (pago débito completo, DB verificada) · caso 5 (abandono,
  gratis con las sesiones de Memo) · caso 11 (rechazo + reintento + mensaje de
  vuelta VISIBLE) · caso 2 OXXO completo (ficha "1 día" en pantalla ×2;
  confirma SOLO en test a los 3.5–4.5 min — no prometer minutos) · aceptación
  que sella ($300 aplicados NO $312 · actor stripe:separo · correos [PRUEBA→
  a CORREOS_PRUEBA_DESTINO=admin@conectareynosa.mx) · terquedad (200
  ya_aplicado, sin gemelos) · chip PAGADA ✓ nacido en vivo · idle 50s (#403).
- 4 hallazgos de Cowork en navegador, todos corregidos EN PROD: gate mudo
  (#398), vuelta sin aviso (#400+#401), MSI invisibles (#404), chip huérfano
  (#405). Familia: código correcto que nadie llamaba. Lección en CLAUDE.md.
- Fixture vivo: solicitud Rosalía (7bfc589b…) pagada-sin-aceptar — NO borrar
  hasta el final de C2-6.
### C2-6 · Limpieza de datos de prueba + checklist de estreno del portal.
- Limpieza: 8 solicitudes · 7 sesiones Stripe · 5 eventos webhook · 1 bitácora
  · 2 correos calibración. Todo test.
- Checklist de estreno, apuntes ya decididos/anotados: UN solo correo al
  aceptar (plan+firma; reenvío de firma se queda suelto) · envío de correo sin
  rastro persistente (debilidad anotada) · chip OXXO sin hold: opción (a) con
  límite 48h de created_at, SIN reloj (la vida de la ficha vive en Stripe) —
  el arreglo DE RAÍZ es cargar stock real (prerrequisito ya sellado) · OXXO
  test no es reloj fijo (3m30s y 4m25s medidos).

## PRERREQUISITO OPERATIVO (de Memo, cuando toque estrenar)
- Capturar stock real (compras + vendidos_fuera) de los eventos que estrenen
  el portal — el candado despierta por evento (regla de oro de Fase B: con
  stock encendido, TODA venta pasa por el sistema).
- Política de reembolso visible (línea en políticas del sitio/portal).

## CALENDARIO
- La serie C2 se construye AHORA (decisión Memo). El estreno público del
  portal (RESERVA_PORTAL on) espera a C2-5 en verde + encendido de correos
  estable. Nada se estrena a medias.
