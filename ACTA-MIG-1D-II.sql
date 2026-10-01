-- =============================================================================
-- ACTA-MIG-1D-II.sql — la bitácora de invitaciones al Portal
-- Base: KameHouse (npgnhsmwpcipxgvfxrho).  La corre JANE.
-- =============================================================================
-- Por qué existe: sin bitácora, «a quién ya invité» no tiene respuesta, y la
-- única forma de saberlo sería mirar los correos enviados. El botón de MIG-1d-ii
-- se RINDE con un 502 mientras esta tabla no exista — a propósito: saltársela
-- convertiría el candado de idempotencia en un adorno el día más peligroso, y un
-- correo repetido a 156 personas no se deshace.
--
-- 🔒 LA LLAVE ES (evento_id, correo) EN MINÚSCULAS, no el viajero_id. Una
-- persona puede tener DOS filas en viajeros_evento para el mismo evento (pasa, y
-- el puente ya lo trata así) y recibe UNA invitación: llavear por fila mandaría
-- dos correos iguales el mismo día, que es la lección del consuelo.
--
-- 🔒 Y EL UNIQUE VA SOBRE COLUMNAS NOT NULL. Un UNIQUE nullable no sirve de
-- candado: en Postgres `NULL != NULL`, así que dos filas con correo NULL pasan
-- las dos. Esta casa ya lo pagó.

create table if not exists public.invitaciones_portal (
  id                 uuid primary key default gen_random_uuid(),
  evento_id          text        not null,
  correo             text        not null,
  portal_cliente_id  uuid,
  enviado_en         timestamptz not null default now(),
  enviado_por        text,
  email_id           text,
  constraint invitaciones_portal_correo_min check (correo = lower(correo)),
  constraint invitaciones_portal_unica unique (evento_id, correo)
);

comment on table public.invitaciones_portal is
  'MIG-1d-ii: a quién YA se le mandó la invitación al Portal. La llave es (evento_id, correo) en minúsculas, no el viajero: una persona con dos filas recibe UNA invitación.';

-- El índice de lectura del botón: pregunta por evento y nada más.
create index if not exists invitaciones_portal_evento_idx
  on public.invitaciones_portal (evento_id);

-- RLS: nadie llega aquí con anon. El botón usa service_role, y el service_role
-- se salta RLS — así que con RLS prendida y CERO policies la tabla queda cerrada
-- para todo lo demás, que es exactamente lo que se quiere.
alter table public.invitaciones_portal enable row level security;

-- =============================================================================
-- CÓMO COMPROBAR QUE QUEDÓ (y que el candado MUERDE, no solo que existe):
--
--   -- 1. existe y está vacía
--   select count(*) from public.invitaciones_portal;              -- 0
--
--   -- 2. el UNIQUE muerde (la segunda TIENE que fallar)
--   insert into public.invitaciones_portal (evento_id, correo) values ('prueba','a@b.com');
--   insert into public.invitaciones_portal (evento_id, correo) values ('prueba','a@b.com');
--   -- ↑ error esperado: duplicate key value violates unique constraint
--
--   -- 3. el CHECK de minúsculas muerde
--   insert into public.invitaciones_portal (evento_id, correo) values ('prueba','A@B.com');
--   -- ↑ error esperado: violates check constraint "invitaciones_portal_correo_min"
--
--   -- 4. limpiar la prueba
--   delete from public.invitaciones_portal where evento_id = 'prueba';
--
-- ⚠️ Los pasos 2 y 3 no son adorno: un candado que existe y no muerde se lee
-- como protección y deja el camino abierto.
-- =============================================================================
