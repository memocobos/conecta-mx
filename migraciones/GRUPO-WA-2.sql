-- =============================================================================
-- GRUPO-WA-2 (9-nov-2026) · DOS grupos de WhatsApp por evento: el de los
-- paquetes CHEAP y el de PLUS / STAY / RIDE.
-- Palabra de Memo: «los paquetes cheap los ponemos en un grupo de whatsapp y
-- los paquetes PLUS, Stay y ride en otro grupo … opción en el capsule que pueda
-- poner los dos links para que cada quien se vaya a su grupo de tour».
--
-- · `link`       = el grupo del VIAJE (PLUS / STAY / RIDE). Era NOT NULL; hoy
--                  puede ir vacío mientras el otro exista.
-- · `link_cheap` = el grupo de los CHEAP (solo boleto). Nuevo, mismo CHECK.
-- · Candado: una fila sin NINGÚN link no existe (la casa no borra filas: un
--   link equivocado se REEMPLAZA pegando el bueno).
-- · El dueño de «a quién le toca cuál» es `_lib/grupo-whatsapp.linkPara`:
--   CHEAP → link_cheap, los demás → link; si el evento solo trae UNO capturado,
--   ese es el grupo de todos (exactamente lo que pasaba antes de esta acta).
-- · GRANT: la tabla nació el 13-oct (antes del corte de permisos del 30-oct) y
--   service_role YA lo tiene (leído de role_table_grants); se repite aquí por
--   la regla de la casa, es idempotente.
-- =============================================================================
alter table public.grupos_whatsapp
  add column if not exists link_cheap text
    check (link_cheap ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$');

alter table public.grupos_whatsapp alter column link drop not null;

alter table public.grupos_whatsapp
  drop constraint if exists grupos_whatsapp_algun_link;
alter table public.grupos_whatsapp
  add constraint grupos_whatsapp_algun_link
    check (link is not null or link_cheap is not null);

grant select, insert, update, delete on public.grupos_whatsapp to service_role;

-- Careo de salida (los dos candados muerden):
--   insert into grupos_whatsapp(evento_id) values ('__prueba__');          → 23514 (ningún link)
--   insert into grupos_whatsapp(evento_id, link_cheap) values ('__prueba__','https://evil.com/x'); → 23514
-- Registro: CORRIDA el 9-nov-2026 vía MCP (apply_migration grupo_wa_2); los dos
-- inserts de prueba rebotaron con 23514 y la tabla quedó con las 12 filas vivas.
