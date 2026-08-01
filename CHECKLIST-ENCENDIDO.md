# 🔥 CHECKLIST DE ENCENDIDO — Correos reales (viernes ~1-ago-2026)

> Archivo personal de Memo — NO se commitea. Escrito 24-jul, actualizado 29-jul
> por la sesión Cowork (post-C2). El interruptor: variable `CORREOS_MODO` en
> Netlify. Hoy vale `prueba` (todo correo se desvía a admin@conectareynosa.mx
> con etiqueta [PRUEBA→…]). El encendido es cambiarla a `real` + redeploy.
> Nota post-C2: el estreno del PORTAL es OTRO tren con su propio checklist
> (CHECKLIST-ESTRENO-PORTAL.md) y va después: stock → Stripe live → RESERVA_PORTAL.

## ✅ BLOQUEANTE RESUELTO (29-jul) — el switch ya no está bloqueado
- [x] **CORREO ÚNICO — mergeado (PR #406, merge e5cbbee) y publicado.**
      Una aceptación ahora dispara UN solo correo:
      "🎫 Tu lugar quedó apartado — {evento}", con el plan de pagos y el botón
      "Firmar mi contrato" en la misma historia. Arnés 33/33 CONTANDO llamadas
      a Resend (una aceptación = 1 exacta, antes 2).
      El recordatorio de firma NO se tocó: sigue en contratos-alerta-cron con su
      propia plantilla ("📜 Falta tu firma"), byte-idéntico, y es el de quien
      pierde su link.
      **Falta la única verificación que no es de código: al primer aceptar real,
      confirmar en el buzón de calibración que llegó UNO y no dos.**

## Qué se prende DE GOLPE (los emisores, agrupados — C2 sumó los suyos)
- **Contratos**: invitaciones/reenvíos de firma, alertas pre-viaje de sin-firmar (7/3/2/1 días), radar de vigencias.
- **Portal cobranza**: recordatorio amable de abono (días 9 y 24), "tu abono vence HOY" (diario), morosidad escalada (días 17 y 2), confirmaciones de solicitud (cliente + admin).
- **Ventas/recordatorios**: ventas expiradas, recordatorios de /rol, waitlist ("ya hay lugares"), recordatorio "tu evento es pronto" a coordis.
- **Bodega/Torre**: correos de salidas/faltantes.
- **Radar del Dragón**: anomalías 2×día.
- **B4 (YA en prod)**: aviso de apartado vencido (ventana 48h desde C2-1).
- **NUEVOS de C2 (ya en prod)**: "🎫 Tu plan de pagos" + "📜 Firma tu contrato"
  al aceptar (→ serán UNO con la tuerca bloqueante) · confirmaciones ligadas a
  pagos Stripe. Los correos de cobranza enlazan `pagos.html#bbva`/`#heybanco`
  (candado de ancla de PG-1).
- Excepción sellada: `radio-vigilante` manda directo, SIN pasar por el guard.

## VÍSPERA (jueves 31-jul) — 20 minutos
1. [ ] Revisar el buzón de calibración (admin@conectareynosa.mx): ojear los [PRUEBA→…] de la semana. Pregunta clave por cada tipo: ¿este correo, tal cual, se lo mandarías a un cliente real? (diseño, montos, ortografía, remitente).
2. [ ] Confirmar con la sesión Cowork la lista de DESTINATARIOS que recibirían algo el primer día (quién tiene abonos abiertos, contratos sin firmar, etc.) — que no haya sorpresas de "¿por qué me llegó esto?".
3. [ ] Verificar que NO queden datos de prueba nuevos en las bases — la limpieza C2-6 del 29-jul dejó el Portal VIRGEN (0 solicitudes/0 sesiones/0 webhooks, Palacio en $0); solo confirmar que siga así.
3b. [ ] **Env vars en Netlify, revisada rápida**: `CORREOS_MODO=prueba` (hasta el switch) · `CORREOS_PRUEBA_DESTINO=admin@conectareynosa.mx` · `RESEND_KEY` **y** `RESEND_API_KEY` (el código usa AMBOS nombres) · los 3 `RESEND_FROM_*` · `ADMIN_EMAIL` · las 5 canónicas de Supabase · y las que NO SE TOCAN el viernes: `PAGOS_STRIPE_MODO=test`, `REEMBOLSOS_MODO` apagado, `RESERVA_PORTAL` apagado. Si alguna `SUPABASE_*` a secas reapareció: borrarla.
4. [ ] Decidir si los casos históricos (viajeros viejos sin contrato/en Excel) deben recibir algo o quedan fuera (hoy: fuera, porque no están en el Portal — confirmar que así se quede).
5. [ ] Avisarle al equipo activo (si ya re-firmó alguien) que el sistema empieza a escribir solo.

## EL DÍA (viernes 1-ago, idealmente ANTES de las 7:00 AM MX) — 10 minutos
> ¿Por qué antes de las 7? La primera ola de crons corre 7:00–9:00 AM MX. Prendiendo antes, TODO el día 1 es consistente (nada mitad prueba, mitad real).
1. [ ] En Netlify → conectareynosa.mx → Environment variables: cambiar `CORREOS_MODO` de `prueba` a `real` (la sesión Cowork puede hacerlo contigo).
2. [ ] Disparar un redeploy (Deploys → Trigger deploy) — sin esto las functions siguen leyendo el valor viejo.
3. [ ] Prueba de humo: mandar UNA acción que emita correo (p. ej. reenviar un contrato a un correo tuyo) y confirmar que llega SIN etiqueta [PRUEBA→…] y al destinatario real.
4. [ ] NO borrar `CORREOS_PRUEBA_DESTINO` — se queda por si hay que volver a prueba.

## VIGILANCIA (viernes durante el día) — la sesión Cowork acompaña
1. [ ] 8:00–9:00 AM: revisar logs de la ola de crons (contratos-alerta, vence-hoy, recordatorios, radar) — `fallidos=0` en todos.
2. [ ] Confirmar en Resend (o logs) que los envíos salieron a destinatarios reales correctos.
3. [ ] Cualquier correo raro que reporte un cliente → capturar pantalla y avisar a la sesión.

## MARCHA ATRÁS (si algo sale mal) — 2 minutos
1. [ ] `CORREOS_MODO` = `prueba` otra vez + redeploy → todo vuelve al buzón de calibración al instante. Sin drama: el sistema está diseñado para esto.

## DESPUÉS DEL ENCENDIDO
1. [ ] El blast de Memo (anuncio al público) — SOLO cuando el día 1 haya corrido limpio.
2. [ ] Siguiente estación del tren: re-onboarding del equipo (los primeros 5 + Ximena/Milk) ya con correos reales de contratos.
3. [ ] **T4 en vivo**: la primera solicitud real ES el estreno de T4 — verla pasar completa antes de confiarle un grupo grande.
4. [ ] Con ~1 semana estable: arranca el tren del PORTAL (CHECKLIST-ESTRENO-PORTAL.md) — stock real → ST-4 Stripe live (primer pago chico de Memo + reembolso de prueba) → RESERVA_PORTAL al final.
