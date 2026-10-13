-- =============================================================================
-- PN27-BLAST.sql — ACTA · la bitácora del blast de preventa Pa'l Norte 2027
-- (14-oct-2026, Jane). La tabla y las siembras YA CORRIERON contra la base
-- viva de KH ese día — esto es el acta reproducible, no un pendiente.
--
-- La regla que la tabla existe para cumplir (MIG-1d-ii): SIN BITÁCORA NO SE
-- MANDA NADA — «no sé a quién ya le mandé» no es «a nadie», y la diferencia
-- son correos repetidos que no se deshacen. El UNIQUE (campana, correo) es el
-- candado; el CHECK de minúsculas evita la ceguera de mayúsculas (PLAN-CASE-1).
-- =============================================================================

create table if not exists preventa_blast (
  id uuid primary key default gen_random_uuid(),
  campana text not null default 'pn27',
  correo text not null check (correo = lower(correo)),
  nombre text,
  fuente text not null,          -- viajeros-pn26 | viajeros | waitlist | giveaway | melanie
  caliente boolean not null default false,
  enviado_at timestamptz,        -- se asienta DESPUÉS del envío, fila por fila
  resend_status int,
  error text,
  creado_at timestamptz not null default now(),
  unique (campana, correo)
);
alter table preventa_blast enable row level security;  -- deny-all: sin lector de navegador

-- ─── LAS SIEMBRAS QUE CORRIERON (14-oct-2026), con sus números ───────────────
-- Exclusiones en TODAS: staff (usuarios.correo) y la waitlist de palnorte
-- (sus ~79 correos reciben el aviso AUTOMÁTICO del publish — WL-1 vive en
-- esferas-publicar — y mandarles el blast además sería correo doble el mismo
-- día). Dedup por NOT EXISTS: jamás on_conflict (regla de la casa).
--
--   1. 'viajeros-pn26' (caliente=true) · viajeros de palnorte2026%  →  99
--   2. 'viajeros'                      · el resto de viajeros       → 1,157
--   3. 'waitlist'                      · waitlist de otros eventos  →   421
--   4. 'giveaway' + 'melanie' las siembra la ACCIÓN sembrar_giveaway de
--      admin-preventa-blast (viven en la base del PORTAL y la function tiene
--      las dos llaves; cruzarlas por SQL pediría copiar datos entre bases).
--      Re-corrible e idempotente por el dedup en memoria + UNIQUE.
--
-- Re-conteo en cualquier momento:
--   select fuente, caliente,
--          count(*) filter (where enviado_at is not null) as enviados,
--          count(*) filter (where enviado_at is null and error is null) as pendientes,
--          count(*) filter (where error is not null) as errores
--   from preventa_blast where campana='pn27' group by 1,2 order by 1;
-- =============================================================================
