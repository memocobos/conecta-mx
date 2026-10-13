-- =============================================================================
-- PORTAL-EDIT-1.sql — ACTA (13-oct-2026, Jane). YA CORRIÓ contra la base viva de KH.
--
-- Palabra de Memo: el cliente entra al Portal, termina de llenar los datos de sus
-- acompañantes, edita los suyos, y si quiere cambiar hotel/zona lo pide desde ahí;
-- lo editado llega a la lista de viajeros del evento en KameHouse.
-- Reparto firmado (13-oct): DATOS → directo a viajeros_evento (no mueven dinero);
-- HOTEL/ZONA/FECHA → SOLICITUD que cae a la bandeja de Bulma/Milk (mueven precio).
-- =============================================================================

-- Sello de «el cliente tocó sus datos desde el Portal» (la lista lo puede pintar).
alter table viajeros_evento add column if not exists editado_portal_at timestamptz;

-- Las solicitudes de cambio. RLS deny-all (cero políticas): solo las funciones
-- con service_role la leen/escriben. Jamás se borra: se cierra con estado.
create table if not exists cambios_viajero (
  id uuid primary key default gen_random_uuid(),
  viajero_id uuid not null references viajeros_evento(id),
  evento_id text not null,
  correo text not null check (correo = lower(correo)),
  nombre text,
  tipo text not null check (tipo in ('hotel','zona','fecha','otro')),
  detalle text not null check (char_length(detalle) between 3 and 600),
  estado text not null default 'pendiente' check (estado in ('pendiente','atendida','rechazada')),
  respuesta text,
  atendida_por text,
  atendida_at timestamptz,
  creado_en timestamptz not null default now()
);
alter table cambios_viajero enable row level security;
create index if not exists cambios_viajero_estado_idx on cambios_viajero(estado, creado_en desc);
