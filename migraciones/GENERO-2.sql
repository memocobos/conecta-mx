-- GENERO-2 (3-nov-2026) · el género se PREGUNTA al registrarse y se VE en Capsule.
-- Pedido de Bulma vía Memo: «tener la información del género en las cards de
-- Capsule Corp … y de una vez preguntárselo a los viajeros a la hora de su
-- registro». GENERO-1 ya creó viajeros_evento.genero (CHECK H/M). Aquí nacen las
-- dos puertas de entrada:
--   · KH  requisiciones.genero  (el titular; los acompañantes van dentro del jsonb
--         `acompanantes`, que ya tiene su CHECK de arreglo).
--   · PORTAL clientes.genero    (el perfil del registro). La tabla ya trae sus
--         GRANTs de tabla; una columna nueva los hereda.
-- Sin DEFAULT a propósito: NULL = «todavía no lo dijo», que es la verdad de las
-- filas que ya existen.

-- ═══ KH (npgnhsmwpcipxgvfxrho) ═══
alter table public.requisiciones add column if not exists genero text;
alter table public.requisiciones drop constraint if exists requisiciones_genero_check;
alter table public.requisiciones add constraint requisiciones_genero_check
  check (genero is null or genero in ('H','M'));

-- ═══ PORTAL (muvvrstnkxsxfpkhbntq) ═══
alter table public.clientes add column if not exists genero text;
alter table public.clientes drop constraint if exists clientes_genero_check;
alter table public.clientes add constraint clientes_genero_check
  check (genero is null or genero in ('H','M'));

-- Candado mordido (las dos bases): un valor fuera de la lista rebota con 23514.
--   update public.requisiciones set genero='X' where false;  -- (probado con insert real en la corrida)
