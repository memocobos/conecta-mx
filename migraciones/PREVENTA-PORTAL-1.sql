-- PREVENTA-PORTAL-1 (27-oct-2026) · los de la preventa ELIGEN su paquete desde
-- el Portal. Palabra de Memo: «que ahí mismo en un wizard puedan solicitar su
-- zona y llegue la requisición a KameHouse y así acepten y se haga todo».
-- Opciones firmadas: wizard en el Portal · solo eligen (sus $300 ya cuentan).
--
-- La solicitud reusa `cambios_viajero` (PORTAL-EDIT-1): ya cae a la bandeja,
-- ya tiene su RLS deny-all y su GRANT. Se agrega:
--   · tipo 'paquete'
--   · paquete_pedido / zona_pedida / hotel_pedido / precio_lista — lo que eligió,
--     ESTRUCTURADO (no solo en el texto) para que «Aplicar» no lo re-teclee.
--   · un tipo 'paquete' SIN paquete_pedido no puede nacer.
-- Sin datos que migrar: la tabla tenía 0 filas (medido 27-oct).

alter table public.cambios_viajero drop constraint if exists cambios_viajero_tipo_check;
alter table public.cambios_viajero add constraint cambios_viajero_tipo_check
  check (tipo = any (array['hotel','zona','fecha','otro','paquete']));

alter table public.cambios_viajero
  add column if not exists paquete_pedido text,
  add column if not exists zona_pedida text,
  add column if not exists hotel_pedido text,
  add column if not exists precio_lista numeric;

alter table public.cambios_viajero drop constraint if exists cambios_viajero_paquete_check;
alter table public.cambios_viajero add constraint cambios_viajero_paquete_check check (
  tipo <> 'paquete' or (paquete_pedido is not null and paquete_pedido in ('plus','stay','ride','cheap'))
);
-- 🔴 La primera versión decía solo `paquete_pedido in (...)` y NO MORDÍA: con
-- NULL el IN da NULL y un CHECK con NULL pasa. Medido con un insert de prueba
-- (dentro de un bloque que se revierte); corregido con el `is not null`.
-- Candados mordidos el 27-oct: CHECK (paquete NULL rebota) · índice único
-- (2ª elección pendiente rebota). La tabla quedó en 0 filas.

-- Una sola elección PENDIENTE por viajero (la carrera del doble clic).
create unique index if not exists cambios_viajero_paquete_pend_uq
  on public.cambios_viajero (viajero_id) where tipo = 'paquete' and estado = 'pendiente';

grant select, insert, update, delete on public.cambios_viajero to service_role;
