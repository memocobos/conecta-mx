-- ═══════════════════════════════════════════════════════════════════════════
-- NUBE-4 · la cotización de transporte, POR EVENTO (y con horarios)
-- ═══════════════════════════════════════════════════════════════════════════
-- Orden de Memo (24-sep-2026). Dos columnas nuevas en `nube_cotizaciones`:
--
--   evento_id  text NULL  →  NULL significa «GENERAL CDMX (todos)».
--                            No es un hueco: es el valor que tiene sentido.
--   horarios   text       →  texto libre: aerolínea, hora de salida y de
--                            regreso. Viaja CON la cotización, así que el
--                            historial de horarios sale GRATIS: cada captura
--                            es una fila nueva y la fila lleva sus horarios.
--
-- 🔒 POR QUÉ `text` Y NO UNA FK A `esferas_eventos`. El catálogo público NO
-- vive en la base: es el array `var EV` de index.html, y ahí la llave es el
-- SLUG. `eventos`/`esferas_eventos` llavean por uuid y slug respectivamente, y
-- ya mordió dos veces confundirlos. La cotización habla del evento que el
-- CLIENTE ve, así que guarda el slug del catálogo servido, sin FK — y la lista
-- que ofrece la pluma se DERIVA de ese mismo catálogo.
--
-- 🔒 EL ALTER NO VIOLA EL TRIGGER INSERT-ONLY. `nube_cotizaciones_inmutables_trg`
-- es un trigger de FILA sobre UPDATE y DELETE; un `ALTER TABLE` es DDL y no
-- dispara triggers de fila. Verificado antes de escribir esto:
--   pg_trigger → 1 trigger, eventos «UPDATE DELETE» (NO cubre INSERT, porque la
--   tabla es insert-only, no read-only).
--
-- ⚠️ Y LA TABLA ESTÁ VACÍA: `select count(*)` → 0 filas el 24-sep-2026. Así que
-- este ALTER no tiene que decidir qué eran las filas viejas —no hay ninguna— y
-- no hace falta backfill. Nadie ha capturado una cotización todavía.
--
-- Las columnas nacen NULL-ables a propósito: `evento_id` porque NULL ES el caso
-- general, y `horarios` porque una cotización sin horarios sigue siendo un
-- precio válido (el card los omite en vez de inventarlos).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.nube_cotizaciones add column if not exists evento_id text null;
alter table public.nube_cotizaciones add column if not exists horarios  text null;

comment on column public.nube_cotizaciones.evento_id is
  'Slug del evento del catálogo (index.html var EV). NULL = cotización GENERAL de CDMX, que rige para los eventos sin cotización propia. Sin FK: el catálogo no vive en la base.';
comment on column public.nube_cotizaciones.horarios is
  'Texto libre: aerolínea/línea, hora de salida y de regreso. Viaja con la cotización, así que su historial es el de la tabla.';

-- La consulta del dueño filtra SIEMPRE por (modo, evento_id) y ordena por
-- vigencia, así que el índice sigue esa forma. Sin él, cada resolución del card
-- de un evento hace un scan de la tabla entera.
create index if not exists nube_cotizaciones_modo_evento_vig_idx
  on public.nube_cotizaciones (modo, evento_id, vigente_desde desc, creado_en desc);
