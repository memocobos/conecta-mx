-- SORTEO-RONDAS-1 · la escalera del sorteo y sus tres resultados · 21-sep-2026
--
-- ⚠️ ESTE ARCHIVO NO LO CORRIÓ CLAUDE. Lo corre Memo (o quien él diga) y
-- ANTES de mergear la PR: el giro nuevo escribe `rondas`, y `resultado` puede
-- valer 'no_cumple', así que sin esto el INSERT y el PATCH fallan.
--
-- Base: PORTAL (muvvrstnkxsxfpkhbntq), tabla public.giveaway_sorteos.
-- Idempotente: se puede correr dos veces y da lo mismo.
--
-- 🔴 UNA PIEZA NO ES PURAMENTE ADITIVA, y va dicha en voz alta en vez de
-- colada: el CHECK de `resultado` hay que ENSANCHARLO para admitir 'no_cumple'.
-- Memo pidió que no quedara ni un instante sin candado, y la forma de
-- garantizarlo NO es `begin/commit` (que depende de que quien lo corra los
-- respete) sino UN SOLO `ALTER TABLE` con las dos acciones: una sentencia, un
-- solo lock, atómica por definición. Ver el bloque de abajo.

-- ═══ VALIDADO SIN CORRERLO (21-sep-2026) ═══════════════════════════════════
-- No se supuso que esto fuera Postgres válido: se probó contra TABLAS
-- TEMPORALES del Portal (mueren con la sesión, no tocan giveaway_sorteos) con
-- diez inserts, cinco que deben pasar y cinco que deben rebotar. Los diez
-- dieron lo esperado:
--
--   PASA   · primer giro: pendiente, sin escalon ni motivo
--   PASA   · re-giro: pendiente en escalon 3
--   PASA   · no_cumple + no_sigue
--   PASA   · no_cumple + «otro: cuenta privada»
--   PASA   · escalon 0 (el resto del padron)
--   REBOTA · no_cumple SIN motivo
--   REBOTA · el typo «no_sige»
--   REBOTA · «otro» pelado, sin texto
--   REBOTA · escalon 7 inventado
--   REBOTA · un resultado inventado
--
-- Y el ALTER atómico del CHECK se aplicó DOS VECES sin tronar: es idempotente.
-- Lo que esto NO prueba es el trigger ni el índice único sobre la tabla real:
-- eso se ve al correrlo.

-- ═══ LAS CUATRO COLUMNAS ════════════════════════════════════════════════════
-- Todas NULLABLES a propósito: las dos filas de Natanael que ya están en la
-- tabla no tienen escalera ni escalón, y el PRIMER giro de cualquier cadena
-- tampoco. Lo obligatorio lo imponen la function y el CHECK cruzado de abajo,
-- no la columna — es el mismo cuidado de GIVEAWAY-KG-1-fotos.sql.
alter table public.giveaway_sorteos
  add column if not exists rondas            jsonb,
  add column if not exists escalon           int,
  add column if not exists origen_sorteo_id  uuid,
  add column if not exists descarte_motivo   text;

-- ═══ 🔴 EL CHECK QUE SE ENSANCHA — EN UNA SOLA SENTENCIA ════════════════════
-- Tres botones son tres hechos distintos:
--   acepto       · contestó y se queda el premio
--   no_contesto  · no dio señales en 10 minutos
--   no_cumple    · SÍ contestó, pero no cumple las bases (base 4: el follow)
--
-- Meter el tercero dentro de 'no_contesto' grabaría la etiqueta equivocada
-- sobre un hecho real —alguien que sí contestó marcado como que no— y ése es
-- el defecto de `metodo_separo` en SEP-ETIQUETA-1a.
--
-- 🔒 `drop` y `add` van en la MISMA sentencia: Postgres la aplica como una
-- unidad, así que no existe un instante en el que la tabla acepte cualquier
-- cadena en `resultado`. Correrlo dos veces vuelve a dejar exactamente el
-- mismo candado.
alter table public.giveaway_sorteos
  drop constraint if exists giveaway_sorteos_resultado_chk,
  add  constraint giveaway_sorteos_resultado_chk
       check (resultado in ('pendiente', 'acepto', 'no_contesto', 'no_cumple'));

-- ═══ DE QUÉ GIRO HEREDA LA ESCALERA UN RE-GIRO ══════════════════════════════
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'giveaway_sorteos_origen_fkey') then
    alter table public.giveaway_sorteos
      add constraint giveaway_sorteos_origen_fkey
      foreign key (origen_sorteo_id) references public.giveaway_sorteos(id) on delete set null;
  end if;
end $$;

-- ═══ EL ESCALÓN DEL QUE SALIÓ EL POZO. 0 = «el resto del padrón vivo» ═══════
-- El `is null` NO es adorno: el primer giro de una cadena no sale de ningún
-- escalón, y sin él su INSERT fallaría.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'giveaway_sorteos_escalon_chk') then
    alter table public.giveaway_sorteos
      add constraint giveaway_sorteos_escalon_chk
      check (escalon is null or escalon in (0, 3, 6, 12, 24));
  end if;
end $$;

-- ═══ 🔒 UN DESCARTE POR BASES SIN MOTIVO NO PUEDE EXISTIR ═══════════════════
-- El motivo nace VACÍO en la pantalla (un default escribiría en el acta un
-- motivo que nadie eligió — lo que hizo `kmt-prov` mandando tres compras a
-- «Hotel»), así que el candado tiene que estar también aquí: si el botón se
-- resuelve sin motivo, la base se rehúsa.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'giveaway_sorteos_descarte_chk') then
    alter table public.giveaway_sorteos
      add constraint giveaway_sorteos_descarte_chk
      check (resultado <> 'no_cumple' or descarte_motivo is not null);
  end if;
end $$;

-- ═══ LA LISTA BLANCA DEL MOTIVO, AQUÍ **Y** EN LA FUNCTION ══════════════════
-- Un typo que no truena es un dato que nadie puede leer después: 'no_sige' se
-- vería igual de verde, y el día que alguien filtre por 'no_sigue' esa fila no
-- aparecería. Es la misma razón por la que `foto_estado` tiene su CHECK.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'giveaway_sorteos_descarte_lista_chk') then
    alter table public.giveaway_sorteos
      add constraint giveaway_sorteos_descarte_lista_chk
      check (descarte_motivo is null
             or descarte_motivo = 'no_sigue'
             or descarte_motivo like 'otro: %');
  end if;
end $$;

-- ═══ 🔴 EL ÚNICO QUE CIERRA UNA CARRERA QUE HOY ESTÁ ABIERTA ════════════════
-- `intento` se calcula como «número de filas + 1». Dos clics casi juntos
-- darían DOS filas con el mismo intento, y la cadena quedaría AMBIGUA — y de
-- la cadena se DERIVA el motivo de cada re-giro y quién hereda la escalera.
--
-- Un 23505 aquí es el caso ESPERADO: la function contesta «ya se está girando,
-- espera un segundo». Nada de on_conflict (revienta 42P10 con únicos).
create unique index if not exists giveaway_sorteos_slug_intento_uniq
  on public.giveaway_sorteos (slug, intento);

-- ═══ 🔒 LA INMUTABILIDAD DE LA ESCALERA, CON CANDADO EN LA BASE ═════════════
-- Ningún camino del código hace PATCH con `rondas`, y el careo lo afirma
-- midiendo los PATCH de verdad. Pero eso es disciplina de código: esto es el
-- único candado que no depende de que nadie se equivoque nunca. Una escalera
-- que se puede reescribir DESPUÉS del giro no es un sorteo, es un borrador.
--
-- (Si Memo lo prefiere fuera, es borrar este bloque entero: el resto no
--  depende de él.)
create or replace function public.giveaway_rondas_inmutables()
returns trigger language plpgsql as $$
begin
  if old.rondas is not null and new.rondas is distinct from old.rondas then
    raise exception 'giveaway_sorteos.rondas es INMUTABLE despues del giro (sorteo %)', old.id;
  end if;
  return new;
end $$;

drop trigger if exists giveaway_rondas_inmutables_trg on public.giveaway_sorteos;
create trigger giveaway_rondas_inmutables_trg
  before update on public.giveaway_sorteos
  for each row execute function public.giveaway_rondas_inmutables();

-- ═══ DÓNDE VIVE LA VERDAD, Y QUÉ NO SALE EN PÚBLICO ════════════════════════
comment on column public.giveaway_sorteos.rondas is
  'La escalera COMPLETA del giro, escrita en el MISMO INSERT que lo crea e '
  'INMUTABLE (trigger). {v, escalones, orden} donde `orden` son los del primer '
  'escalon EN ORDEN DE REVOLTURA: orden[0] ES EL GANADOR. Por eso NINGUNA '
  'respuesta publica expone este orden — la proyeccion re-ordena por folio.';
comment on column public.giveaway_sorteos.escalon is
  'De que escalon salio el pozo de un re-giro: 3|6|12|24, o 0 para «el resto '
  'del padron vivo». NULL en el primer giro de una cadena.';
comment on column public.giveaway_sorteos.origen_sorteo_id is
  'El giro cuya escalera hereda este re-giro (el que tiene `rondas`). NULL en '
  'el primer giro. El MOTIVO del re-giro no se guarda: se DERIVA del resultado '
  'del intento anterior, que el unico de (slug,intento) vuelve inequivoco.';
comment on column public.giveaway_sorteos.descarte_motivo is
  'Solo con resultado=no_cumple: «no_sigue» o «otro: <texto>». PRIVADO: no sale '
  'por ninguna puerta publica — alla los dos descartes se ven igual '
  '(«se_regira»), porque la API no puede afirmar en publico que alguien «no '
  'contesto» cuando si contesto. Solo `estado_admin`, que exige token.';
