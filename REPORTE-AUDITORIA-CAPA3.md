# 💰 AUDITORÍA POR CAPAS — Capa 3: EL DINERO

> Archivo personal de Memo — NO se commitea. Auditada el 25-jul-2026 (noche) por la sesión Cowork.
> Alcance: las 29 functions que tocan dinero, priorizando las 7 que ESCRIBEN (las que muestran,
> si fallan, se ven feo; las que escriben, cuestan pesos).

## VEREDICTO GENERAL: 🟢 EL DINERO ESTÁ BIEN CUIDADO
Cero bugs que pierdan, dupliquen o inventen dinero. Un hallazgo real (topes de cordura) y dos notas.

---

## ✅ admin-marcar-pago (la que declara "ya pagó") — SÓLIDA
Valida método, cuenta, fecha y monto; deja bitácora en `pagos_auditoria` de quién marcó qué (best-effort);
reconcilia el estado con tolerancia de $1 por centavos; **excluye cuotas de lugares dados de baja**;
NO auto-cierra ventas de vendedores (esas las cierra el módulo Vendedores); correo de felicitación fail-soft.
Revertir deja el pago exactamente como estaba.
- ⚠️ **HALLAZGO (ver abajo)**: `monto_pagado` no tiene tope superior.
- ⚠️ Nota: no es atómico. Si el PATCH del pago funciona pero la reconciliación falla, devuelve 502 con el
  pago YA marcado — la UI puede creer que todo falló y reintentar. No corrompe nada (es UPDATE, no INSERT),
  pero conviene que el mensaje diga "el pago sí quedó, falló el recalculo".

## ✅ admin-liquidacion (el 30% de vendedores) — SÓLIDA
Fórmula documentada y con núcleo puro testeable. Guardas ejemplares: **no liquida con caja ≤ 0**,
bloquea doble liquidación (409, incluso en carrera → 23505), **congela el snapshot** del cálculo,
comisión negativa → 0, CHEAP fuera del numerador pero dentro del denominador (correcto por el separo),
multifecha agregada por slug base, escritura solo roshi, `mis_comisiones` solo las propias.

## ✅ admin-generar-plan-pagos — SÓLIDA
El reparto por lugar **cuadra los centavos en la última cuota** (`precio − acumulado`): la suma es exacta,
nunca se pierde ni se inventa un peso. Candado anti-plan-en-$0.

## ✅ admin-aplicar-pago-grupo (una transferencia → varias cuotas) — SÓLIDA
Diseño de dos tiempos: el sistema PROPONE (cascada por fecha y lugar, sin escribir) y el humano CONFIRMA.
Al aplicar: **todo o nada** — verifica que todos los pagos existan, **pertenezcan a esa solicitud** y no
estén ya pagados; si algo falla, 409 y no aplica ninguno. Tope de 100 pagos por operación.

## ✅ admin-lugar-traspasar (el cargo de $350) — SÓLIDA
Regla parametrizada y clara: gratis a 6+ días, $350 dentro de los últimos 5 (el día 5 exacto ya cobra).
Casilla manual solo cuando el sistema no puede calcular los días.

## ✅ admin-reembolsos — SÓLIDA
Todas sus acciones son roshi-only (el Palacio es tuyo).

## ✅ admin-venta-abono (abonos de vendedores) — SÓLIDA
**Es la única que ya trae tope de cordura** (`MONTO_MAX = 1,000,000`) — el patrón correcto que falta en las otras.

---

## 🟡 EL HALLAZGO: topes de cordura inconsistentes
`admin-gasto-crear`, `admin-ingreso-crear` y el `monto_pagado` de `admin-marcar-pago` validan
`Number.isFinite && >= 0` pero **no tienen tope superior**. Un dedazo (escribir 1180000 en vez de 1180,
o pegar un número con ceros de más) entra sin una sola queja.

**Por qué importa más de lo que parece — la cadena:**
`gasto con dedazo → caja real distorsionada → admin-liquidacion calcula el 30% sobre un número falso → comisiones mal pagadas`.
Y en el otro sentido: un `monto_pagado` inflado hace que la reconciliación crea que el cliente ya cuadró
y marque su tour como 'pagado' antes de tiempo.

No es un hueco de seguridad (solo admins escriben) — es protección contra el error humano de las 2 AM.

---

## Tuerca sugerida: CAP3-1 (topes de cordura)
Aplicar el patrón que ya existe en venta-abono a los otros 3 puntos, con umbral configurable y mensaje claro
("¿$1,180,000? Revisa el monto — si es correcto, captúralo en dos partidas"). Barato, quirúrgico, y protege
la cadena caja→comisiones.

## Ideas para el futuro (NO urgentes, anotadas)
- Mensaje de error más honesto en marcar-pago cuando el pago sí quedó pero falló el recálculo.
- Un "cierre de caja" mensual congelado (foto de la caja al día 1) daría un ancla contra descuadres históricos.
