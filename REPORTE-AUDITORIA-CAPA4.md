# ⏰ AUDITORÍA POR CAPAS — Capa 4: LOS CRONS (los vigilantes automáticos)

> Archivo personal de Memo — NO se commitea. Auditada el 25-jul-2026 (noche) por la sesión Cowork.
> Urgencia de calendario: estos 15 empiezan a escribirle a clientes REALES el viernes ~1-ago.

## VEREDICTO: 🟢 SÓLIDOS — con 1 hallazgo a decidir y 2 avisos operativos para el encendido

## Censo de los 15 vigilantes (horarios en hora de México)
| Cron | Cuándo | Qué hace |
|---|---|---|
| check-strikes-diario | 6:00 PM | vigila strikes y faltantes de bodega |
| marcar-vencidos-diario | 2:00 AM | **muta**: pasa pagos vencidos a 'vencido' (sin correo) |
| eventos-meta-sync-cron | 7:00 AM | **muta**: sincroniza proyección de eventos (sin correo) |
| portal-recordatorios-diario | 8:00 AM días 9 y 24 | recordatorio amable de abono |
| vence-hoy-diario | 8:00 AM | "tu abono vence hoy" |
| portal-morosidad-diario | 8:00 AM días 17 y 2 | morosidad escalada (3 niveles) |
| contratos-alerta-cron | 8:00 AM | contratos sin firmar (7/3/2/1 días antes) |
| rol-recordatorios | 8:00 AM | recordatorios de /rol |
| waitlist-notify | 8:00 AM | avisa cuando se abre un evento |
| ventas-limite-cron | 8:00 AM | ventas expiradas de vendedores |
| radar-alertas | 8:00 AM y 8:00 PM | anomalías del negocio |
| apartados-vencidos-diario | 8:30 AM | apartados de stock vencidos |
| bodega-retornables-48h | 9:00 AM | hieleras/bocinas sin regresar a 48h del evento |
| recordatorio-eventos-diario | 9:00 AM | "tu evento es pronto" a coordis |
| radio-vigilante | cada 10 min | vigila que la radio siga sonando |

## ✅ LO QUE SALIÓ BIEN (lo importante para el viernes)
1. **Los 12 crons que mandan correo pasan TODOS por el guardia de modo prueba.** Cero olvidados: el interruptor del viernes los apaga/enciende a todos juntos. Verificado uno por uno.
2. **La regla sagrada se respeta**: de 15, solo 2 mutan estados de negocio y son las excepciones conocidas y documentadas (`marcar-vencidos-diario` marca pagos vencidos; `eventos-meta-sync-cron` sincroniza la proyección de eventos). Los demás solo notifican o escriben su propia bitácora de aviso.
3. **`marcar-vencidos-diario` auditado a fondo** (es el que alimenta la morosidad): marca vencido **al día siguiente** de la fecha esperada (no el mismo día — correcto), excluye tours cancelados y cuotas canceladas, procesa en lotes de 100, es idempotente y no manda ruido.
4. **Envíos separados por destinatario** en los crons nuevos: un correo que rebota no tumba el resto del lote.

## 🟡 HALLAZGO: 7 crons sin "marca de ya avisé"
Solo 3 llevan marca de idempotencia (`waitlist-notify`, `apartados-vencidos-diario`, `bodega-retornables-48h`).
Los otros 7 —incluidos **los 3 de cobranza**— dependen de que su día/ventana solo ocurra una vez.
**Consecuencia real:** si un cron corre dos veces el mismo día, el cliente recibe el correo **duplicado**.
El escenario más probable no es un fallo técnico: es **darle "Run now" en Netlify para probar**.
- Riesgo con datos actuales: mínimo (1 solicitud).
- Riesgo con 150 clientes activos: un doble disparo = 150 correos repetidos y llamadas al WhatsApp.
- **Opciones**: (a) agregar marca de idempotencia a los 3 de cobranza (tuerca CAP4-1, ~1 tuerca mediana);
  (b) dejarlo y adoptar la regla operativa "jamás Run now en un cron de cobranza".

## ⚠️ AVISOS OPERATIVOS PARA EL ENCENDIDO (viernes)
**1. Hay una solicitud REAL en el Portal: la tuya.** Al probar el puente con `?portal=1` creaste una
solicitud de verdad — **Bad Gyal, 23 oct 2026, a nombre de Guillermo Cobos / hcgcobos@gmail.com**, con plan de
5 pagos y el **separo de $300 ya marcado como VENCIDO** (su fecha era el 24-jul).
Qué pasaría con los correos encendidos:
- Viernes 1-ago: **nada** (ese día no toca recordatorio ni morosidad, y ningún pago vence ese día).
- Domingo 2-ago: **`portal-morosidad-diario` te mandaría a TI un correo de morosidad** por el separo vencido.
- 16-ago: te avisaría que vence tu abono de $1,125.
**Decisión sugerida**: borrar esa solicitud de prueba antes del viernes (o marcarla cancelada) para
que el estreno sea 100% limpio. Si prefieres dejarla, sirve como conejillo real — pero solo te escribe a ti.

**2. Los eventos de tu catálogo NO generan correos por sí solos.** Los crons de cobranza y contratos leen
del Portal, y el Portal está prácticamente vacío. El encendido del viernes será **silencioso** — su valor real
es estar listos para cuando las solicitudes empiecen a entrar.

## Notas menores (sin acción)
- `marcar-vencidos-diario` usa zona horaria 'America/Mexico_City' y el resto del sistema 'America/Monterrey'.
  Mismo huso (ambos UTC-6 desde 2022), cero diferencia funcional; unificar por higiene algún día.
