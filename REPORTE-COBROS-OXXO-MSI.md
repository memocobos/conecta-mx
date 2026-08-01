# 💳 REPORTE — Cobro en OXXO/tiendas y Meses Sin Intereses (23-jul-2026)

> Investigación de los pendientes #7 y #8 de la lista maestra. Hecha por la sesión Cowork con búsqueda web.
> ⚠️ Las comisiones cambian y algunas requieren cotización — antes de firmar con cualquiera, confirmar tarifas directamente. Archivo personal de Memo — NO se commitea.

## LA IDEA EN UNA LÍNEA
Un "agregador de pagos" te da DOS superpoderes con una sola alta: (1) **fichas con código de barras** que tu cliente paga en efectivo en OXXO/tiendas y el sistema se entera SOLO (adiós comprobante por WhatsApp y validación manual de Bulma para esos pagos); (2) **meses sin intereses** con tarjeta de crédito — tú recibes el dinero (menos comisión) y el banco del cliente se lo difiere a él.

## 🏪 OPCIÓN EFECTIVO (ficha con código de barras)

| Proveedor | Comisión aprox. por pago en efectivo | Red de tiendas | Nota |
|---|---|---|---|
| **Stripe** | ~3.6% + $3 MXN | OXXO | La mejor API para integrar con tu Portal |
| **Mercado Pago** | ~3.79% + $4 (liquida en 3 días) | OXXO y más | La más fácil de dar de alta, casi sin requisitos |
| **Conekta** (de BBVA) | ~3.9% + IVA (hay planes) | OXXO | Mexicana, del grupo de TU banco (BBVA) |
| **Openpay/Paynet** (BBVA) | ~2.9%–3.79% + $2.50–4 | 7-Eleven, farmacias, etc. (no OXXO directo) | La más barata en % pero sin OXXO |

**Qué significa en tus números:** un abono de $800 pagado en OXXO te costaría ~$32–35. A cambio: cero validación manual, cero comprobantes perdidos, y clientes SIN banco pueden pagar. (Ojo: OXXO además le cobra al CLIENTE ~$12–17 en caja por el servicio — eso lo paga él, no tú.)

## 💳 MESES SIN INTERESES (el costo lo absorbe el comercio)

| Meses | Costo extra aprox. para ti (sobre el monto) |
|---|---|
| 3 MSI | ~4–5% |
| 6 MSI | ~7–9% |
| 12 MSI | ~15–19% |
| 18–24 MSI | hasta ~22% |

- **Stripe:** 5% a 22.5% extra según los meses (3 a 24), configurable por venta.
- **Mercado Pago:** 3 a 24 meses; a 12 MSI el costo efectivo ronda el 19%.
- La realidad de tu negocio: en un paquete de $6,500, dar 12 MSI te cuesta ~$1,100 de margen. **La práctica estándar:** limitar a 3–6 MSI (costo 4–9%, absorbible) o manejar "precio de contado vs precio a meses" para trasladar el costo.

## 🔌 CÓMO ENCAJARÍA EN TU SISTEMA (cuando decidas)
1. Nueva opción en el plan de pagos del portal: "pagar este abono en OXXO" → el sistema genera la ficha (API del proveedor) con el monto exacto de la cuota.
2. El cliente paga en la tienda → el proveedor avisa por webhook → una function marca la cuota pagada (reusa `admin-marcar-pago`/auditoría) — TODO automático.
3. MSI: botón "pagar con tarjeta a meses" para liquidaciones — mismo webhook.
4. Tu conciliación no cambia: el dinero llega a tu banco en 1–3 días y cada pago queda amarrado a su cuota.

## 🎯 MI RECOMENDACIÓN
- **Si lo que quieres es probar rápido y sin código:** Mercado Pago (alta en un día, links de pago manuales mientras tanto).
- **Si lo que quieres es integrarlo BIEN al portal (mi voto):** **Stripe** — OXXO al mejor precio con OXXO real (3.6%+$3), MSI configurable, y la API más limpia para tus Netlify functions. Conekta como plan B fuerte por ser BBVA (tu banco — conciliación más natural).
- **MSI: arrancar solo con 3 y 6 meses** — el 12 MSI se come demasiado margen salvo que ajustes precio.
- Alta requerida en cualquiera: RFC, identificación, cuenta bancaria, y datos del negocio. Sin costo de apertura ni mensualidad en los tres primeros.

## FUENTES
- Stripe MSI: stripe.com/mx/payment-method/meses-sin-intereses · Stripe OXXO: stripe.com/mx/payment-method/oxxo
- Comisiones Mercado Pago 2026: atempora.studio/blog/comisiones-mercado-pago-2026 · mercadopago.com.mx (Link de Pago / MSI)
- Comparativas: atempora.studio/blog/stripe-vs-mercado-pago-vs-conekta · appaguitos.com/comparativa/conekta-vs-openpay · finantres.com/pasarela-de-pago-oxxo · conekta.com/pricing · netpay.mx/oxxo-pay
