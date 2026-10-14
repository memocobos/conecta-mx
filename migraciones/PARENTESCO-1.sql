-- PARENTESCO-1 (13-oct-2026) · el parentesco del contacto de emergencia llega a la lista del coordi.
-- Palabra de Memo: el coordi ve «nombre y número de emergencia, parentesco».
-- El Portal ya lo pedía en el PERFIL del cliente (clientes.contacto_emergencia_relacion, base del Portal)
-- pero no llegaba a viajeros_evento (KH), que es la lista que se baja. YA CORRIÓ (Jane, 13-oct).
alter table public.viajeros_evento add column if not exists emergencia_parentesco text;
alter table public.viajeros_evento add constraint viajeros_evento_emergencia_parentesco_len
  check (emergencia_parentesco is null or char_length(emergencia_parentesco) between 2 and 40);
