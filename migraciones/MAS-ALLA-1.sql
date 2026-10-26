-- =============================================================================
-- MAS-ALLA-1.sql — EL MÁS ALLÁ: solicitudes de eventos AGOTADOS (26-oct-2026)
-- Base: KAMEHOUSE (npgnhsmwpcipxgvfxrho) · YA CORRIDA vía MCP el 26-oct-2026
-- =============================================================================
-- Orden de Memo (26-oct): «cuando un evento se agote... si alguien entra con el
-- link directo del evento les aparecerá un wizard donde podrán hacer una
-- solicitud con Nombre, correo, celular, cantidad de boletos y/o paquetes
-- interesados y/o zonas interesadas, y esto lo quiero ver en otra pantalla
-- dentro de más allá». Firmado el mismo día: el wizard abre en LAS TRES puertas
-- (link directo + tarjeta del catálogo + tira del hero) y lo atienden
-- maestro_roshi + bulma + milk.
--
-- La tabla es de SEGUIMIENTO DE DEMANDA, no de dinero: una solicitud no crea
-- viajero ni abono — el dinero sigue entrando por el camino manual de siempre
-- (requisición / captura de Bulma y Milk). «vendido» aquí es un marcador de
-- quién ya se atendió, no un asiento.
--
-- 🔒 RLS deny-all + GRANT service_role (regla del 30-oct): la escriben solo las
-- Netlify Functions (mas-alla-solicitar el INSERT público validado,
-- admin-mas-alla la lectura y el marcado). Sin policies a propósito.
-- 🔒 SIN UNIQUE por (evento, celular) a propósito: una persona puede volver a
-- pedir semanas después con otras zonas — el anti-spam es el tope de 3
-- PENDIENTES por celular que vive en el endpoint, no un candado de unicidad
-- que confundiría «ya pediste una vez en la vida» con «no spamees».

create table if not exists public.mas_alla_solicitudes (
  id             uuid primary key default gen_random_uuid(),
  evento_id      text not null,
  evento_nombre  text,
  nombre         text not null check (char_length(nombre) between 2 and 100),
  celular        text not null check (celular ~ '^[0-9]{10}$'),
  correo         text check (correo is null or correo = lower(correo)),
  cantidad       int  not null default 1 check (cantidad between 1 and 20),
  -- Arrays JSON de strings cortos, validados por el endpoint. jsonb y no
  -- columnas: lo que se pide varía por evento (paquetes que vende, zonas de la
  -- ficha) y aquí es texto de interés, no llaves de inventario.
  paquetes       jsonb,
  zonas          jsonb,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'vendido', 'no_vendido')),
  nota           text,
  atendido_por   text,
  atendido_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- Los lectores reales: la pantalla lista por estado y por evento, y el tope
-- del endpoint cuenta pendientes por celular.
create index if not exists mas_alla_sol_evento_idx  on public.mas_alla_solicitudes (evento_id);
create index if not exists mas_alla_sol_estado_idx  on public.mas_alla_solicitudes (estado);
create index if not exists mas_alla_sol_celular_idx on public.mas_alla_solicitudes (celular);

alter table public.mas_alla_solicitudes enable row level security;
-- Deny-all: cero policies a propósito — solo service_role tiene camino.

grant select, insert, update, delete on public.mas_alla_solicitudes to service_role;

-- ── Verificación (correr tras el create) ────────────────────────────────────
-- select relrowsecurity from pg_class where relname = 'mas_alla_solicitudes';  -- true
-- select count(*) from pg_policies where tablename = 'mas_alla_solicitudes';   -- 0
-- insert con celular '123' debe rebotar por el CHECK; estado 'x' también.
