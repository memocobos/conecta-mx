-- REEMBOLSO-AVISO-1 (2-nov-2026) — séptimo motivo de rechazo: «💸 Pidió su reembolso»
-- Palabra de Memo: no hubo la zona, se le ofreció cambio por WhatsApp, no quiso
-- y pidió su dinero → correo de disculpa + «en menos de 24 horas recibirás tu
-- reembolso» + otras fechas/zonas. La lista vive en _lib/correo-rechazo; el
-- CHECK la repite y mide:rechazo-1 [M] carea las dos (lee ESTA acta).
-- Registro: YA CORRIÓ (2-nov-2026).

alter table public.requisiciones
  drop constraint if exists requisiciones_motivo_clave_check;

alter table public.requisiciones
  add constraint requisiciones_motivo_clave_check
  check (motivo_clave is null or motivo_clave in
    ('zona_agotada','fecha_agotada','comprobante','datos','whatsapp','otro','reembolso'));
