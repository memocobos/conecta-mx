-- =============================================================================
-- MP-1c · La bitácora de idempotencia del webhook de Mercado Pago
-- Base: PORTAL (muvvrstnkxsxfpkhbntq).  LA EJECUTA JANE.
--
-- POR QUÉ LA LLAVE ES payment_id Y NO EL id DE LA NOTIFICACIÓN:
-- MP manda VARIAS notificaciones por el MISMO pago conforme cambia de estado
-- (created → pending → approved), y cada una trae un `id` distinto. Si la
-- idempotencia colgara de ese id, cada notificación se vería como nueva y el
-- pago se marcaría más de una vez. El pago es uno solo: `payment_id` es lo
-- único estable.
--
-- El índice único es lo que CONFIRMA la idempotencia cuando dos notificaciones
-- entran a la vez: el 23505 no es un error, es la carrera resuelta. Por eso
-- lleva NOMBRE — el webhook comprueba que el 23505 vino de ESTE índice y no de
-- otra restricción cualquiera, que sería un error de verdad disfrazado.
-- =============================================================================

create table if not exists public.mp_webhook_eventos (
  id            uuid primary key default gen_random_uuid(),
  payment_id    text        not null,
  notif_id      text,                 -- el id de la notificación, solo para rastro
  tipo          text,                 -- 'payment', etc.
  accion        text,                 -- 'payment.created' / 'payment.updated'
  estado_mp     text,                 -- approved | pending | rejected | …
  solicitud_id  uuid,                 -- external_reference, YA careado contra el GET
  monto         numeric(12,2),        -- ⚠️ EN PESOS: MP no usa centavos
  resultado     text        not null,  -- aplicado | ignorado | error
  detalle       text,
  procesado_en  timestamptz not null default now()
);

-- LA llave de la idempotencia. Con nombre, para poder confirmarlo desde el código.
create unique index if not exists mp_webhook_evento_uq
  on public.mp_webhook_eventos (payment_id);

create index if not exists mp_webhook_eventos_solicitud_idx
  on public.mp_webhook_eventos (solicitud_id);

-- RLS ENCENDIDO **SIN POLÍTICAS**, a propósito: eso ES el candado. En Postgres,
-- una tabla con RLS activo y cero políticas no deja pasar a nadie — salvo a
-- service_role, que lo salta por definición. O sea: solo el webhook escribe y
-- nadie más lee, sin necesidad de escribir una sola política.
--
-- Mismo trato que stripe_webhook_eventos y stripe_checkout_sesiones, verificado
-- en la base el 20-ago-2026: las dos con relrowsecurity = true y 0 políticas.
alter table public.mp_webhook_eventos enable row level security;

-- Columna en solicitudes_tour para el rastro del pago de MP, espejo de
-- separo_session_id. `separo_aplicado_pago_id` NO se toca: sigue siendo NULL
-- hasta que Memo acepte, y ese null es el candado anti-doble-aplicación.
alter table public.solicitudes_tour
  add column if not exists separo_mp_payment_id text;
