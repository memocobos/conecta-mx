-- ═══ MEDIA-GUARD-1 · los dos marcadores que faltan ═══════════════════════════
-- Contexto: el publish ahora se REHÚSA si se llevaría un medio que el index vivo
-- tiene y la ficha no menciona (mapa, staticImg, lineup). La salida explícita es
-- que la ficha DIGA que el medio va fuera, para que la intención quede escrita
-- donde vive el dato.
--
-- Ese marcador ya existe para el mapa (`mapa_null`, columna vieja) y NO existe
-- para los otros dos. Sin estas columnas, un evento al que se le limpie la
-- portada o el lineup quedaría rehusado sin puerta de salida.
--
-- Medido antes de pedirlo: en 80 commits de index.html se perdieron 11 medios y
-- los 11 fueron `mapa`. O sea que estas dos columnas son PREVENCIÓN, no
-- reparación: hoy no hay un solo evento que las necesite.

alter table esferas_eventos
  add column if not exists static_img_null boolean not null default false,
  add column if not exists lineup_null     boolean not null default false;

comment on column esferas_eventos.static_img_null is
  'La portada va FUERA a propósito. Sin esto, vaciar `foto` dispara MEDIA-GUARD.';
comment on column esferas_eventos.lineup_null is
  'El lineup va FUERA a propósito. Sin esto, vaciar `lineup` dispara MEDIA-GUARD.';

-- ── humo ─────────────────────────────────────────────────────────────────────
-- Las dos existen, son booleanas y nacen en false: ninguna ficha cambia de
-- comportamiento por correr esto.
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_name = 'esferas_eventos'
     and column_name in ('static_img_null', 'lineup_null')
     and data_type = 'boolean' and column_default = 'false';
  if n <> 2 then raise exception 'MEDIA-GUARD-1: se esperaban 2 columnas booleanas en false, hay %', n; end if;

  select count(*) into n from esferas_eventos where static_img_null or lineup_null;
  if n <> 0 then raise exception 'MEDIA-GUARD-1: alguna ficha nació marcada (%), y debían nacer todas en false', n; end if;

  raise notice 'MEDIA-GUARD-1 OK · 2 columnas, 0 fichas marcadas';
end $$;
