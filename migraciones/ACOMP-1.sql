-- =============================================================================
-- ACOMP-1.sql — ACTA (13-oct-2026, Jane). YA CORRIÓ contra la base viva de KH.
--
-- Palabra de Memo: «que Karina llene los datos [de sus acompañantes] al momento
-- de poner el correo; les llega invitación al Portal; si mete el mismo correo
-- para todos, toda la info le llega a ella, pero si quiere puede cambiar el
-- correo para que le llegue a otra persona».
--
-- La requisición guarda a los acompañantes como arreglo [{nombre, correo}],
-- uno por persona ADEMÁS del titular (largo = num_personas − 1). NULL = la
-- requisición nació antes de ACOMP-1 (o es de 1 persona): al aprobar se crea
-- UN viajero con N boletos, como siempre.
-- =============================================================================

alter table requisiciones add column if not exists acompanantes jsonb;
alter table requisiciones drop constraint if exists requisiciones_acompanantes_check;
alter table requisiciones add constraint requisiciones_acompanantes_check
  check (acompanantes is null or jsonb_typeof(acompanantes) = 'array');
