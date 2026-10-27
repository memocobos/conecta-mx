-- CONTRATO-CLIENTE-1 (27-oct-2026) · el contrato del cliente, por viajero.
-- Palabra de Memo: «el contrato es ya de una vez … ya es FUNDAMENTAL» + texto
-- con punto final el mismo día. Nace en los tres caminos (requisición
-- aprobada, alta manual, elegir paquete de una preventa) y se firma por link.
--
-- 🔒 viajero_id SIN FK a propósito: un contrato firmado es un DOCUMENTO y no
--    puede desaparecer porque se archive o se borre la fila del viajero
--    (PRUEBA-ARCHIVO-1 borra filas vivas). La foto de lo que se firmó vive en
--    `datos` (jsonb): nombre, evento, paquete, zona, total, pagado, incluye.
-- 🔒 Un solo contrato VIVO por viajero (índice único parcial); anular deja el
--    renglón como acta y permite nacer otro.
-- 🔒 RLS deny-all + GRANT solo a service_role (regla del 30-oct).

create table if not exists public.contratos_cliente (
  id uuid primary key default gen_random_uuid(),
  viajero_id uuid not null,
  evento_id text not null,
  token text not null unique check (token ~ '^[a-f0-9]{48}$'),
  estado text not null default 'pendiente' check (estado in ('pendiente','firmado','anulado')),
  version_texto text not null,
  datos jsonb not null,
  correo text check (correo is null or correo = lower(correo)),
  enviado_at timestamptz,
  envios integer not null default 0,
  firmado_at timestamptz,
  firmante_nombre text,
  firmante_rol text check (firmante_rol is null or firmante_rol in ('titular','madre','padre','tutor')),
  firma_ip text,
  firma_ua text,
  creado_por text,
  anulado_motivo text,
  created_at timestamptz not null default now(),
  check (estado <> 'firmado' or (firmado_at is not null and firmante_nombre is not null and firmante_rol is not null))
);

create unique index if not exists contratos_cliente_vivo_por_viajero
  on public.contratos_cliente (viajero_id) where estado <> 'anulado';
create index if not exists contratos_cliente_evento on public.contratos_cliente (evento_id);

alter table public.contratos_cliente enable row level security;
grant select, insert, update, delete on public.contratos_cliente to service_role;
-- anon/authenticated heredaban privilegio por default (RLS sin políticas ya lo
-- bloqueaba): se revoca explícito para que el acta diga la verdad.
revoke all on public.contratos_cliente from anon, authenticated;
-- Candados mordidos al correr (27-oct): token mal formado, «firmado» sin firma
-- y correo con mayúsculas rebotaron 3 de 3 con check_violation.
