# CHECKLIST · ESTRENO DEL PORTAL DE CLIENTES

> C2-6 · 29-jul-2026. Para que Memo lo recorra tache por tache.
> **Regla del brief que manda sobre todas: nada se estrena a medias.**
> No se commitea (como sus hermanos de la raíz).

---

## 0 · EL ORDEN. Qué se prende primero y por qué

Son **cuatro pasos** —un dato y tres interruptores— y el orden importa, porque cada uno hace visible al siguiente. Prenderlos juntos deja sin saber cuál falló.

| # | interruptor | qué prende | por qué va en ese lugar |
|---|---|---|---|
| 1 | **Stock real** | el candado anti-sobreventa | No es interruptor de software: es dato. Sin él, el reloj es promesa y la cola se queda muda. Todo lo demás se prueba mejor con esto puesto. |
| 2 | `CORREOS_MODO` → real | los correos le llegan al cliente | Viernes ~1-ago. Estrena de golpe cobranza, contratos y vendedores — no solo el portal. **Antes de esto, el cliente no se entera de nada.** |
| 3 | `PAGOS_STRIPE_MODO` → live | el dinero de verdad (ST-4) | Después de los correos: un cobro real sin correo de confirmación es la peor combinación posible. |
| 4 | `RESERVA_PORTAL` | la puerta desde el index | **Al final.** Es lo único que trae desconocidos. Hasta aquí, todo se probó con gente de casa. |

**La razón de fondo:** cada paso agranda el público. Stock → nadie nuevo. Correos → los clientes que ya están. Stripe live → su dinero. `RESERVA_PORTAL` → el que llegó del index. Si algo truena, truena con el público más chico posible.

---

## 1 · PRERREQUISITOS (antes de prender nada)

- [ ] **Cargar stock real** (compras + `vendidos_fuera`) de **cada evento que estrene el portal**.
      Regla de oro de Fase B: **con stock encendido, TODA venta pasa por el sistema** — incluidas las de WhatsApp. Un evento a medio capturar sobrevende.
      *Desactiva de raíz los dos huecos que encontramos: el reloj que era promesa y el chip que se quedaba mudo.*
- [ ] **Política de reembolso visible** — una línea en las políticas del sitio y del portal. Prerrequisito del brief; hoy el flujo de reembolso existe (`REEMBOLSOS_MODO`, apagado) y la política no está escrita.
- [ ] **Revisar env vars en Netlify** (Production context) antes del primer disparo real.
- [ ] **Purgar los datos de prueba de Stripe — LO HACE MEMO, en el Dashboard.**
      Es el ÚNICO residuo de pruebas que queda en todo el universo: el Portal
      quedó virgen en C2-6 y KameHouse se verificó limpio en el paso 3 (sin
      borrar nada — las filas que había eran reales).
      **El paso exacto:** Dashboard de Stripe → menú de la cuenta (arriba a la
      derecha) → **Developers** → **Delete test data**. Pide teclear el nombre de
      la cuenta para confirmar. Borra sesiones, PaymentIntents, clientes y
      eventos del cajón de prueba; **no toca nada de `live`**.
      **Cuándo:** antes de ST-4, junto con el cambio a llaves live.
- [x] **Limpieza del Portal COMPLETA** — `SQL-C2-6-LIMPIEZA.sql` pasos 1 y 2, 29-jul-2026. Portal **virgen**: 0 solicitudes de prueba · 0 sesiones · 0 webhooks. Resumen del Palacio verificado a ojo: **Caja $0 · BBVA $0 · Por cobrar $0 · 0 viajeros**.
- [ ] Borrar a mano los 2 correos de calibración (opcional, cosmético).

## 2 · DECISIONES QUE FALTAN (casillas de decisión, no de trabajo)

- [ ] **Chip "OXXO PENDIENTE" sin hold real** — una ficha emitida y sin pagar hoy es **invisible** en la bandeja cuando el evento no tiene stock.
      **(a)** Chip sin reloj cuando `metodo_separo='oxxo'` + sin pago + sin hold, y que **deje de mostrarse a las 48 h** del `created_at` (el dato que la bandeja sí tiene). Sin reloj a propósito: la vida de la ficha vive en Stripe y esta pantalla no la baja.
      **(b)** Dejarlo mudo: a las ~24 h la ficha muere sola.
      *Recomendación: (a) — pero si el prerrequisito de stock se cumple, el caso deja de existir.*
- [ ] **Los dos correos al aceptar** — decisión ya sellada: **uno solo** (plan + firma como una sola historia), conservando el reenvío del link de firma como correo suelto para quien lo pierda.
      **Falta que Memo ordene construirla.** Es tuerca previa al estreno: hoy el cliente recibiría dos correos en el mismo minuto, de dos remitentes distintos, y eso se lee como error.

## 3 · ST-4 · EL ENCENDIDO DE STRIPE

- [ ] Purga de datos test en el Dashboard **(ver §1)**.
- [ ] **Llaves LIVE en Netlify** (Production context) — las pega Memo: `STRIPE_SECRET_KEY` (`sk_live_…`).
      *Solo esa: **no hay llave publicable en juego**. Verificado — ni `portal.html` ni `kamehouse.js` ni las funciones cargan `js.stripe.com` ni usan `pk_…`. Todo el cobro es server-side con Checkout hospedado: el navegador solo recibe una URL de Stripe. Si algún día se agrega Stripe Elements, ahí sí entra `STRIPE_PUBLISHABLE_KEY` a este renglón.*
- [ ] **Webhook endpoint LIVE** creado en el Dashboard, apuntando a `/.netlify/functions/stripe-webhook`, con su `STRIPE_WEBHOOK_SECRET` **de live** (el de test NO sirve).
- [ ] `PAGOS_STRIPE_MODO` → `live`.
      *Candado ya construido: si la llave y el modo no concuerdan (`sk_test_` con modo live o al revés), el código **se detiene antes de llamar a nadie**. Es una red, no un permiso.*
- [ ] **Primer pago real chico de validación** — de Memo, de su propia tarjeta, monto mínimo. Verificar: sesión `pagada`, webhook `aplicado`, `separo_pagado_at`, correo recibido.
- [ ] **Reembolsarse ese pago** desde el Dashboard y confirmar que nada se rompe.
- [ ] **Monitoreo la primera semana**: revisar `stripe_webhook_eventos` a diario. Un `ignorado` inesperado o un hueco en la numeración es la señal temprana.

## 4 · LO QUE HAY QUE SABER ANTES DE PROMETER

- **OXXO tarda.** En test, Stripe confirmó solo entre **3.5 y 4.5 minutos** — y no es reloj fijo. En vivo depende de la tienda y puede ser horas.
  **La promesa al cliente es "te avisamos en cuanto nos confirmen". Nunca minutos.**
- **La ficha de OXXO puede vivir más que el apartado.** Está en el piso de Stripe (1 día natural, muere 23:59 del día siguiente), pero un voucher emitido de madrugada dura hasta ~48 h contra un hold de 24 h. Un pago tardío **no cobra por un lugar que no existe**: cae en la rama manual (Memo contacta al cliente).
- **El cargo de la pasarela no es dinero del viaje.** Al separo de $300 por OXXO se le cobran $312; **al plan se le aplican $300**. Los $12 son de Stripe. Si algún día ves $312 en una cuota, es bug.

## 5 · ANOTADOS PARA DESPUÉS DEL ESTRENO

- **`viajeros_evento.evento_id` es TEXTO LIBRE, sin FK.** El grafo completo de
  KameHouse lo confirmó en el paso 3: ninguna integridad referencial protege esa
  columna, y es donde vive la trampa uuid-vs-slug que ya mordió dos veces
  (rooming y liquidaciones). No es de hoy, pero es **una mina sin bandera** y
  merece su tuerca algún día.

- **`d-hero-bg` sin `onerror` — rama dormida.** Hoy los 94 eventos del catálogo
  tienen `staticImg` o `img`, así que la rama del hero sin foto NUNCA se ejecuta
  y el fondo nunca queda vacío (medido, 30-jul-2026). **Condición de despertar:
  si algún día se captura un evento SIN `staticImg` y SIN `img`, esa rama corre y
  el fondo se queda con el `src` del evento anterior, sin `onerror` que lo
  esconda.** El arreglo ya está diseñado (esconder-mientras-no-haya + limpiar el
  `src` + `onerror`); no se metió al código porque no se podía probar.

- **El envío de correos no deja rastro persistente.** Hoy funciona; el día que falle, nadie se entera — el único registro vive en la respuesta HTTP, que se tira al cerrar la pantalla. Candidato a tuerca post-estreno.
- **`async_payment_failed` / `expired` de OXXO** se registran como `ignorado` y dejan la sesión en `pendiente` para siempre. No cobra de más ni estorba; deja basura.
- **`REEMBOLSOS_MODO` sigue apagado** y su correo es una plantilla provisional: el texto lo escribe Memo.
- **La barra de % de pagos** del dashboard entra cuando Fase C amplíe los datos. Hoy no existe **a propósito**.

---

## Lo que ya está probado punta a punta (no hay que re-probarlo)

Caso 1 tarjeta · caso 11 rechazo · caso 2 OXXO completo (ficha → confirmación async) · caso 5 abandono (2 métodos) · la aceptación que sella (plan + separo aplicado + actor `stripe:separo:…` + correos desviados) · doble aceptación sin gemelos · el chip naciendo y cambiando en vivo.

**Lo que NO se ha probado nunca: un pago LIVE.** Por eso el §3 pide uno chico, de Memo, antes de abrir la puerta.
