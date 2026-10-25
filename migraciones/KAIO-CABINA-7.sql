-- ============================================================================
-- KAIO-CABINA-7 · VOLUMEN POR SAMPLER (25-oct-2026) — YA CORRIDA en KH
-- Pedido de Memo: «los samplers sí creo que debería tener control de ellos».
-- El volumen vive EN LA FILA (no en localStorage): se ajusta una vez y vale
-- en cualquier computadora desde la que se transmita.
-- La tabla radio_samplers ya trae su GRANT a service_role (acta
-- KAIO-CABINA-1.sql); una columna nueva hereda el grant de TABLA — no hace
-- falta otro. RLS deny-all sigue igual.
-- ============================================================================

alter table public.radio_samplers
  add column if not exists volumen numeric not null default 1;

-- 0 = mudo · 1 = tal cual · 2 = al doble. Más de 2 distorsiona el master.
do $$ begin
  alter table public.radio_samplers
    add constraint radio_samplers_volumen_check check (volumen >= 0 and volumen <= 2);
exception when duplicate_object then null; end $$;

-- ── VERIFICACIÓN (corrida el 25-oct, no prometida) ──────────────────────────
-- 1) La columna existe con default 1:
--    select column_name, data_type, column_default from information_schema.columns
--     where table_name = 'radio_samplers' and column_name = 'volumen';
--    → [{"column_name":"volumen","data_type":"numeric","column_default":"1"}]
-- 2) El CHECK MUERDE (probado con un insert a volumen=3 dentro de un do-block:
--    rebotó con check_violation y quedaron 0 filas de prueba).
