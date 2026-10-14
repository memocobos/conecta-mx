-- =============================================================================
-- CREA-SEG-1 (14-oct-2026) · LOS ENTREGABLES DE CADA CREADORA, CON FECHA
-- Palabra de Memo: «un checklist del contenido que han entregado y que les
-- llegue un correo … un contador de tiempo que ellas puedan ver rumbo a su
-- evento, fechas límite … yo soy el que marca los entregables».
--
-- Una fila por entregable de un contrato de creadora. La fecha límite la pone
-- Memo POR CONTRATO (no hay regla global). El estado lo cambia solo Memo desde
-- KameHouse; la creadora lo VE en su link de contrato («Mi colaboración»).
-- `avisos` es la bitácora de correos de ESA fila ({"r3":ts,"r1":ts,"vencido":ts,
-- "recibido":ts}) para que el cron jamás repita uno.
-- 🔒 RLS deny-all: solo se lee/escribe con service_role desde las functions.
-- 🔒 Sin DELETE desde el código: quitar un entregable es estado 'descartado'.
-- =============================================================================
create table if not exists public.entregables_creadora (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid not null references public.contratos_creadores(id),
  orden         int  not null default 0,
  descripcion   text not null check (char_length(descripcion) between 3 and 400),
  fase          text not null check (fase in ('previo','evento','posterior')),
  fecha_limite  date,
  estado        text not null default 'pendiente' check (estado in ('pendiente','entregado','descartado')),
  entregado_at  timestamptz,
  link          text check (link is null or char_length(link) <= 500),
  notas         text check (notas is null or char_length(notas) <= 600),
  avisos        jsonb not null default '{}'::jsonb,
  creado_por    text,
  created_at    timestamptz not null default now()
);
create index if not exists entregables_creadora_contrato_idx on public.entregables_creadora(contrato_id);
alter table public.entregables_creadora enable row level security;
-- (sin políticas = deny-all para anon/authenticated)

-- =============================================================================
-- CREA-SEG-6 (14-oct-2026) · SEMBRADO DE LAS 16 CREADORAS VIGENTES (YA CORRIÓ)
-- Regla de Memo: reel previo = evento − 7 · 2 historias previas = evento − 3 ·
-- historias durante = día del evento · reel(es) posterior(es) y carrusel =
-- evento + 3 (cláusula 4.4). Las que ya no alcanzaban lo previo (Day/Alfredito
-- 15-oct y Marietta/Soy Luna 21-oct) van SOLO con durante y después.
-- Resultado: 16 contratos · 76 entregables · 28 previos. creado_por='jane-crea-seg-6'.
-- =============================================================================

-- =============================================================================
-- CREA-SEG-7 (14-oct-2026) · LOS PLAZOS CORREGIDOS POR MEMO (YA CORRIÓ)
-- Palabra de Memo: «las 4/5 historias tienen que ser durante el evento o máximo
-- al día siguiente antes de medio día … el post de fotos es al día siguiente
-- del evento … el reel está bien 3 días, en el tercero lo tienen que entregar,
-- 4 es mucho».
--   historias durante = evento + 1 a las 12:00 (columna nueva hora_limite)
--   carrusel / post de fotos = evento + 1
--   reel posterior = evento + 2 (el TERCER día contando el del evento)
-- Solo filas 'pendiente' sembradas por jane-crea-seg-6, con valor esperado en
-- el WHERE. Resultado: 16 + 16 + 16.
-- =============================================================================
alter table public.entregables_creadora add column if not exists hora_limite text
  check (hora_limite is null or hora_limite ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
-- update … set fecha_limite = ev+1, hora_limite='12:00' where fase='evento' and fecha_limite=ev
-- update … set fecha_limite = ev+1 where descripcion ilike '1 carrusel%' and fecha_limite=ev+3
-- update … set fecha_limite = ev+2 where descripcion ilike '%reel%' and fase='posterior' and fecha_limite=ev+3
