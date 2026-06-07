-- ============================================================================
-- 009_walkin.sql
-- Fase 2a — Alta de clientes "walk-in" (de WhatsApp, SIN cuenta de portal).
--
-- Afloja lo MÍNIMO para permitir filas sin login, sin romper datos existentes:
-- las filas que ya tienen valores los conservan; solo se PERMITEN NULL a futuro.
-- Un walk-in lo da de alta un admin (Bulma) desde Capsule Corp → "+ Viajero",
-- vía la función admin-crear-viajero (service_role).
--
-- Seguridad / RLS (NO se cambia nada de RLS aquí):
--   Las filas walk-in tienen auth_user_id NULL. Las policies del portal son del
--   tipo `auth_user_id = auth.uid()`, que NUNCA matchea NULL → un cliente logueado
--   jamás ve filas walk-in. Solo el service_role (admin) las ve. Justo lo deseado.
--
--   El trigger clientes_before_insert hace `new.correo := lower(new.correo)`:
--   con correo NULL, lower(NULL) = NULL, sin error. numero_cliente se sigue
--   autoasignando desde la secuencia. correo conserva su índice UNIQUE: en
--   Postgres múltiples NULL son distintos, así que varios walk-ins sin correo
--   conviven sin chocar.
--
--   nombre_completo y celular SIGUEN NOT NULL (Bulma siempre los captura).
-- ============================================================================

-- clientes: permitir cliente sin login ni perfil completo.
alter table public.clientes        alter column auth_user_id drop not null;
alter table public.clientes        alter column correo drop not null;
alter table public.clientes        alter column fecha_nacimiento drop not null;
alter table public.clientes        alter column talla_playera drop not null;
alter table public.clientes        alter column contacto_emergencia_nombre drop not null;
alter table public.clientes        alter column contacto_emergencia_telefono drop not null;

-- Marca de origen: true = lo creó un admin (walk-in), false = registro normal del portal.
alter table public.clientes        add column if not exists creado_por_admin boolean not null default false;

-- solicitudes_tour y pagos: permitir filas sin auth_user_id (walk-in).
alter table public.solicitudes_tour alter column auth_user_id drop not null;
alter table public.pagos            alter column auth_user_id drop not null;
