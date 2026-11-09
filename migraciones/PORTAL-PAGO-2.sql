-- ═══════════════════════════════════════════════════════════════════════════
-- PORTAL-PAGO-2 · PAGAR DESDE EL PORTAL: desglose del comprobante + link de
-- Mercado Pago por cuota (9-nov-2026, base KameHouse)
-- Palabra de Memo: «construye lo del desglose … y también da opción de pagar
-- desde el portal con mercado pago y transferencia, etc».
--
-- QUÉ TOCA: `cambios_viajero` (la bandeja de lo que el cliente pide desde el
-- Portal). Una fila tipo 'pago' hoy nace SOLO con comprobante (foto). Desde hoy
-- puede nacer también con un LINK de Mercado Pago (sin foto) y puede traer el
-- DESGLOSE que el cliente declara («de estos $1,300: $650 a Jose y $650 a
-- Jonathan»). 🔒 Sigue siendo un AVISO: nada aquí escribe dinero — el abono lo
-- captura Bulma/Milk con el comprobante (o la marca del webhook) enfrente.
--
--   · desglose jsonb      — [{viajero_id, monto}] declarado por el cliente.
--                           Es TEXTO estructurado: la bandeja lo PRELLENA y el
--                           humano lo puede corregir antes de capturar.
--   · mp_preference_id · mp_init_point · mp_monto_cobrar · mp_neto — el link
--                           que el Portal generó para ESTA cuota (neto = lo que
--                           el cliente quiere abonar; cobrar = neto + comisión).
--   · mp_pago_id · mp_monto · mp_pagado_at — la MARCA del webhook al caer el
--                           pago aprobado (valor esperado mp_pago_id IS NULL:
--                           un 2º pago no pisa al primero).
--   · `mp_pagos.cambio_id` — la bitácora del dinero real apunta al cambio que
--                           lo pidió (como `requisicion_id` en MP-LINK-1).
--
-- El CHECK `cambios_viajero_pago_foto` («un pago sin comprobante no existe»)
-- se RE-CREA: un pago existe con foto O con link de MP. Sin ninguna de las dos
-- sigue rebotando.
-- GRANT: las dos tablas ya existen con su GRANT a service_role (PORTAL-EDIT-1,
-- MP-1); las columnas nuevas lo heredan. Cero policies nuevas (RLS deny-all).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cambios_viajero
  add column if not exists desglose         jsonb,
  add column if not exists mp_preference_id text,
  add column if not exists mp_init_point    text,
  add column if not exists mp_monto_cobrar  numeric,
  add column if not exists mp_neto          numeric,
  add column if not exists mp_pago_id       text,
  add column if not exists mp_monto         numeric,
  add column if not exists mp_pagado_at     timestamptz;

alter table public.cambios_viajero
  drop constraint if exists cambios_viajero_desglose_forma;
alter table public.cambios_viajero
  add constraint cambios_viajero_desglose_forma
  check (desglose is null or jsonb_typeof(desglose) = 'array');

alter table public.cambios_viajero
  drop constraint if exists cambios_viajero_pago_foto;
alter table public.cambios_viajero
  add constraint cambios_viajero_pago_foto
  check (tipo <> 'pago' or foto_path is not null or mp_preference_id is not null);

alter table public.mp_pagos
  add column if not exists cambio_id uuid;
create index if not exists idx_mp_pagos_cambio on public.mp_pagos (cambio_id) where cambio_id is not null;

-- CANDADOS MORDIDOS (corridos tras el acta, cada uno en su propia transacción
-- que se revierte):
--   insert cambios_viajero tipo 'pago' SIN foto NI mp_preference_id → 23514 ✓
--   insert cambios_viajero tipo 'pago' con mp_preference_id y sin foto → entra ✓
--   update desglose = '{"a":1}'::jsonb (objeto, no arreglo)           → 23514 ✓
-- REGISTRO: corrida el 9-nov-2026.
