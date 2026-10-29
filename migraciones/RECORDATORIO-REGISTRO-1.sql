-- =============================================================================
-- RECORDATORIO-REGISTRO-1 (29-oct-2026) — bitácora de recordatorios del Portal
-- Base: KAMEHOUSE (npgnhsmwpcipxgvfxrho) · corrida vía MCP el 29-oct-2026
-- =============================================================================
-- Palabra de Memo: «Sí: seco → mi visto → enviar» — el recordatorio de registro
-- a los aprobados por requisición que nunca hicieron su cuenta del Portal.
--
-- 🔒 POR QUÉ NO SE REUSA `invitaciones_portal`: su UNIQUE(evento_id, correo) ya
-- tiene asentada a la mayoría (el correo único de CONFIRMA-1 asienta al aprobar)
-- y ese candado es CORRECTO para la invitación — un recordatorio es OTRO envío,
-- con su propia idempotencia. Meterlo ahí exigiría o borrar asientos (jamás) o
-- un evento_id sintético (dos significados en una columna, la lección de
-- usuario_id). Tabla propia, forma de `genkidama_envios`: UNIQUE(campana,
-- correo) — una persona recibe UN recordatorio por campaña; una campaña nueva
-- (p. ej. 'registro-2026-12') es una decisión nueva de Memo.
--
-- 🔒 RLS deny-all + GRANT service_role (regla de la casa desde el 30-oct-2026):
-- la tocan solo las Netlify Functions / Jane con la llave del servidor.
-- =============================================================================

create table public.portal_recordatorios (
  id uuid primary key default gen_random_uuid(),
  campana text not null,
  correo text not null,
  nombre text,
  evento_id text,
  email_id text,
  enviado_por text not null default 'sistema',
  enviado_en timestamptz not null default now(),
  constraint portal_recordatorios_correo_minusculas check (correo = lower(correo)),
  constraint portal_recordatorios_unico unique (campana, correo)
);

alter table public.portal_recordatorios enable row level security;
-- deny-all: cero policies a propósito — solo service_role tiene camino.
grant select, insert, update, delete on public.portal_recordatorios to service_role;

-- =============================================================================
-- CANDADOS (corridos el 29-oct-2026, los tres MORDIERON):
-- 1. insert con correo en MAYÚSCULAS → rebota 23514 (CHECK minúsculas) ✓
-- 2. insert duplicado (misma campana+correo) → rebota 23505 (UNIQUE) ✓
-- 3. select con rol anon → 0 filas / permission denied (RLS deny-all) ✓
-- Las filas de prueba de los candados se borraron (delete por campana de
-- prueba '__candado__') — cero basura.
-- =============================================================================
