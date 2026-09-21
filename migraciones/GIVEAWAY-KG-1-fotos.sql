-- GIVEAWAY-KG-1 · las tres columnas del registro con foto · 21-sep-2026
--
-- ⚠️ ESTE ARCHIVO NO LO CORRIÓ CLAUDE. Lo corre quien Memo decida, y ANTES de
-- mergear la PR: el registro nuevo escribe estas tres columnas, así que sin
-- ellas el INSERT falla. (La función lo dice con un mensaje claro en vez de un
-- 502 mudo — ver `giveaway-registro.js`, el caso 42703.)
--
-- Base: PORTAL (muvvrstnkxsxfpkhbntq), tabla public.giveaway_registros.
-- Las tres son NULLABLES a propósito: las ~600 filas de melanie y Natanael que
-- ya están NO tienen foto ni Instagram, y ponerles NOT NULL exigiría inventarles
-- un valor. Lo obligatorio es para el REGISTRO NUEVO, y eso lo impone la
-- función, no la columna.

alter table public.giveaway_registros
  add column if not exists instagram    text,
  add column if not exists foto_path    text,
  add column if not exists foto_estado  text not null default 'pendiente';

-- El estado solo puede ser uno de tres. Sin esta restricción, un typo en el
-- admin («invalidado» por «invalidada») dejaría a alguien DENTRO del sorteo
-- creyendo que quedó fuera: la consulta del giro excluye por el valor exacto.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'giveaway_registros_foto_estado_chk'
  ) then
    alter table public.giveaway_registros
      add constraint giveaway_registros_foto_estado_chk
      check (foto_estado in ('pendiente', 'aprobada', 'invalidada'));
  end if;
end $$;

-- El índice que usa la cuadrícula de revisión y la consulta del giro.
create index if not exists giveaway_registros_slug_foto_estado_idx
  on public.giveaway_registros (slug, foto_estado);

comment on column public.giveaway_registros.instagram is
  'Usuario de Instagram SIN @. PRIVADO: no sale por ninguna puerta pública '
  '(giveaway-estado, giveaway-lista, los rodillos). Solo el admin con token.';
comment on column public.giveaway_registros.foto_path is
  'Ruta dentro del bucket PRIVADO giveaway-fotos. Nunca es una URL pública: '
  'el admin la ve con URL firmada de corta duración.';
comment on column public.giveaway_registros.foto_estado is
  'pendiente | aprobada | invalidada. Una invalidada queda FUERA del sorteo '
  '(la excluye la consulta que alimenta el giro, no un filtro en el navegador).';
