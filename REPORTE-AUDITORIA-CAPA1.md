# 🔬 AUDITORÍA POR CAPAS — Capa 1: Librerías fuente-única (_lib/)

> Archivo personal de Memo — NO se commitea. Iniciada 25-jul-2026 por la sesión Cowork.
> Metodología: lectura línea por línea de cada librería, buscando bugs de dinero,
> huecos de seguridad, y desviaciones de las reglas de la casa. "Sin prisa" — se
> avanza por sesiones. Veredictos: ✅ sólida · ⚠️ hallazgo menor · 🔴 corregir.

## Avance: 6 de 12 librerías (1,984 líneas totales en la capa)

### ✅ verify-admin.js (el portero de TODO lo admin) — SÓLIDA
- Firma HS256 con comparación a prueba de ataques de tiempo (timingSafeEqual + chequeo de longitud).
- Regex de orígenes ANCLADA (rechaza `evil--conectareynosa.netlify.app.attacker.com`).
- Expiración validada; secreto ausente → 500 ruidoso; roles por lista blanca.
- ⚠️ Endurecimientos opcionales (no explotables hoy, para una tuerca futura):
  1. Exigir `exp` siempre (hoy un token SIN exp jamás expira — solo forjable con el secreto, pero cinturón y tirantes).
  2. Rechazar explícitamente `alg` ≠ HS256 en el header (hoy se ignora — la firma manda, pero mejor decirlo).

### ✅ cuenta-deposito.js (la cuenta bancaria correcta en correos) — SÓLIDA
- Fuente única real: delega la regla a cuentaParaPaquete (cero duplicación).
- Fail-safe ejemplar: sin certeza → NO pinta caja (jamás una cuenta equivocada).
- Todo el contenido escapado contra inyección HTML.
- ⚠️ Nota de higiene: el número de WhatsApp está quemado aquí (528119771072) — sumarlo a la "nota permanente" de datos que viven en varios lugares.

### ✅ utilidad-evento.js (la CAJA REAL — el número de Memo) — SÓLIDA
- Fail-closed estricto: si CUALQUIER fuente falla → error 502, jamás utilidades a medias.
- Multifecha suma en el slug base correctamente.
- Detalle fino BIEN resuelto: pagos cobrados de solicitudes canceladas se re-mapean a su evento (la caja cuadra con admin-saldos).
- COALESCE correcto: monto_pagado=0 cuenta como 0 (explícito), null → monto.
- ⚠️ Notas menores: (1) límites de 10k/20k filas — suficiente por años al ritmo actual (~150 clientes/mes), paginar cuando el negocio sea 10×; (2) falta_por_cobrar puede salir negativa si hay cobrado de canceladas sin vendido activo — refleja la realidad, no es bug, pero explica algún número "raro" futuro.

### ✅ disponibilidad.js (el candado anti-sobreventa) — SÓLIDA (auditada a fondo el 24-25 jul en las revisiones B2/B3)
- Regla de conteo pura y testeable; conservadora ante datos corruptos (mejor no vender que sobrevender).
- Fail-loud si no puede calcular. RIDE fuera. Cancelado libera.

### ✅ correo-guard.js (el interruptor de modo prueba) — SÓLIDA (revisada el 25-jul para el checklist de encendido)
- Modo real es el DEFAULT absoluto: olvidar la variable jamás desvía correos reales.
- Solo desvía con CORREOS_MODO='prueba' exacto. Sin dependencias.

### ✅ precio-zona.js (copia servidor de la regla de precio) — revisada parcialmente en #344
- Guard de grupo grande (N>4→compartida) espejo de las otras 2 copias; blindada por el arnés de equivalencia (15,156 combos / 0 diffs). Pendiente: lectura línea por línea completa en la próxima sesión de auditoría.

## Segunda tanda (25-jul tarde, con 3 auditoras en paralelo) — CAPA 1 COMPLETA 12/12

### ✅ vendedor-activo.js — SÓLIDA (matemática de calendario correcta, fail-open deliberado, cero escrituras). ⚠️ PREGUNTA A MEMO: la regla real es "3 meses desde registro con CERO ventas en la vida = baja; UNA venta (aunque sea cancelada) te hace inmortal" — ¿es lo deseado o prefiere inactividad rodante?
### ✅ perfil-giveaway.js — SÓLIDA (fail-safe ejemplar, sin inyección). Nota: garantizar correo lowercase al escribir clientes (verificado: los datos actuales están limpios).
### ⚠️ catalogo-index.js — HALLAZGO MENOR: no siembra HOTEL_MTY/HOTEL_CDM al parsear (raíz del hueco de hotel en precio-zona); constantes bancarias duplicadas (hoy idénticas al index, verificado carácter por carácter — falta test de paridad); cuentaParaPaquete sin trim (typo → BBVA silencioso).
### 🔴 precio-zona.js — CORREGIR: (1) transporte_cost del caller acepta NEGATIVOS (bug de dinero); (2) hotel solo busca en ev.hotel — falta cascada override→multifecha→global (ventas sin costo de hotel o bloqueadas); (3) no respeta z.ag/prox ni st agotado ni fecha pasada; (4) separo puede sellarse en $0 sin queja; (5) frontera de 15 días diverge entre copias (±1 día de dinero); (6) fecha_idx sin validar rango.
### 🔴 portal-lugares.js — CORREGIR: read-then-write SIN manejo de carrera 23505 (índice único confirmado en BD → doble click de admin = error falso); reparto de centavos no suma el total; sin tope de N.
### 🔴 contratos-viajeros.js — CORREGIR: el `status===409` genérico traga errores FK como "ya existía" (viajero sin contrato en silencio); HUECO LEGAL: acompañantes nacen tipo 'adulto' y firmar NO re-evalúa — un menor firmaría texto de adulto (verificado en contrato-viajero-firmar). BD verificada ✓: token gen_random_bytes(24) fuerte, RLS cerrado a anon.
### 🔴 esferas-compile.js — CORREGIR (el editor de eventos): (1) `</script>` en un nombre ROMPE el sitio y PASA la validación (inyección); (2) patrones `$` corrompen texto en silencio; (3) re-publicar PIERDE campos manuales (ride/rideOnly/cheapOnly/diaFirst/waChannel) y FUERZA banco:BANCO_DEFAULT (¡cuenta equivocada!); (4) update fallido en silencio con validación verde; (5) precio "2,700" con coma → zona disponible a $0.

## Tuercas de corrección: AUD-1 (#349 esferas) · AUD-2 (#350 precio/catálogo, equivalencia 17,280 combos) · AUD-3 (#351 lugares/contratos + sync de menores en portal-lugar-actualizar) — CONSTRUIDAS, REVISADAS Y APROBADAS 25-jul, en merge. Con esto, TODOS los hallazgos rojos de la Capa 1 quedan corregidos. Pendiente de decisión de Memo: regla de vendedor-activo (cero-ventas-en-la-vida vs rodante).

## Capas futuras
- Capa 2: funciones de autenticación y sesión (auth-login, registro-invitado, reset-password, admin-usuarios).
- Capa 3: funciones de dinero (pagos, liquidación, comisiones, reembolsos, abonos).
- Capa 4: crons.
- Capa 5: frontales (kamehouse.js por módulos, portal.html, index.html).
