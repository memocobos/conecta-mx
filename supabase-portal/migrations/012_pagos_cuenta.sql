-- ============================================================================
-- 012_pagos_cuenta.sql
-- Agrega la columna `cuenta` a la tabla pagos del portal (S1 — visor de saldos).
--
-- `cuenta` = A QUÉ cuenta ENTRÓ el dinero ('BBVA' | 'Banamex' | 'Efectivo' |
-- 'Otro'). Es DISTINTO de `metodo`, que es CÓMO pagó el cliente. Va POR PAGO:
-- pagos distintos de la misma solicitud pueden entrar a cuentas distintas.
--
-- Default de negocio (lo aplica el front, editable a mano):
--   paquete PLUS/RIDE/STAY → BBVA ; CHEAP → Banamex.
--
-- No obligatoria (queda null si Bulma no la elige, se corrige después).
-- Idempotente y SIN backfill — empezamos las tablas de cero.
-- ============================================================================

alter table public.pagos add column if not exists cuenta text;
                                       -- 'BBVA' | 'Banamex' | 'Efectivo' | 'Otro'

-- Recargar el cache de esquema de PostgREST para que la API exponga la columna.
notify pgrst, 'reload schema';
