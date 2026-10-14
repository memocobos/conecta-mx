-- =============================================================================
-- GRUPO-VIAJE-1 (13-oct-2026) · «Estas personas viajan juntas».
-- Palabra de Memo: «en kamehouse de alguna manera indicarle a bulma y milk que
-- esas viajeras viajan juntas y así con todos los casos».
--
-- Una llave de grupo por fila de `viajeros_evento`. Las filas que comparten
-- `grupo_viaje` viajan juntas. NULL = viaja solo (o nadie lo ha dicho).
--   · La llenan: aprobar una requisición con acompañantes (ACOMP-1), el titular
--     que reparte sus lugares desde el Portal (ACOMP-2) y Bulma/Milk a mano.
--   · Es un uuid suelto, sin FK: el grupo no es una fila, es una etiqueta.
--   · Nada se borra: separar a alguien de su grupo es ponerle NULL.
-- =============================================================================
alter table public.viajeros_evento add column if not exists grupo_viaje uuid;
create index if not exists viajeros_evento_grupo_viaje_idx
  on public.viajeros_evento (grupo_viaje) where grupo_viaje is not null;
