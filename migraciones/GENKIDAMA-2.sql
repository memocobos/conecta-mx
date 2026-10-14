-- =============================================================================
-- GENKIDAMA-2 (13-oct-2026) · El mensaje libre.
-- Palabra de Memo: «¿no me diste opción de poner texto? … si quiero seguir con
-- la campaña del Pa'l Norte … mandárselos a todos y poner mi propia promo».
--   · tipo 'libre': asunto y mensaje los escribe Memo (el slogan es el título).
--   · `mensaje`: el cuerpo, texto plano (se escapa al pintar; los saltos de
--     línea son párrafos). Solo lo usa 'libre'.
--   · `excluir_blast`: la audiencia deja fuera a quien YA recibió el blast de
--     la preventa (preventa_blast enviado) — para no mandarle dos veces lo mismo.
-- 0 campañas existían al correr esto (medido): el CHECK nuevo no choca con nada.
-- =============================================================================
alter table public.genkidama_campanas drop constraint if exists genkidama_campanas_tipo_check;
alter table public.genkidama_campanas add constraint genkidama_campanas_tipo_check
  check (tipo in ('promocion','descuento','codigo','ultimos','libre'));
alter table public.genkidama_campanas add column if not exists mensaje text
  check (mensaje is null or length(mensaje) between 10 and 2000);
alter table public.genkidama_campanas add column if not exists excluir_blast boolean not null default false;
