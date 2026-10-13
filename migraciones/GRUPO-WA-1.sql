-- =============================================================================
-- GRUPO-WA-1 (13-oct-2026) · El link del grupo de WhatsApp de cada evento.
-- Palabra de Memo: «ponemos el link en alguna parte y ellos lo ven en su
-- correo y en el portal». Opción elegida: correo + Portal, solo hacia adelante.
--
-- 🔒 PRIVADO: vive en KameHouse con RLS deny-all, NO en esferas_eventos ni en
-- el index. El index es público (y el repo también): un link de grupo ahí
-- dejaría entrar a cualquiera. Solo lo leen las functions con service_role:
-- el correo de confirmación y el plan del Portal (al dueño verificado).
-- Llave = evento_id tal como vive en viajeros_evento (slug o slug#N); el
-- lector cae al slug base si la fecha no tiene uno propio.
-- =============================================================================
create table if not exists public.grupos_whatsapp (
  evento_id   text primary key,
  link        text not null check (link ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$'),
  actualizado_por text,
  updated_at  timestamptz not null default now()
);
alter table public.grupos_whatsapp enable row level security;
-- deny-all: sin políticas. Solo service_role.
