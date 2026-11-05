-- ═══════════════════════════════════════════════════════════════════════════
-- PLAN-FIJO-1 · El rol de pagos FIJO desde la fecha de separo (4-nov-2026)
-- Palabra de Memo: «el calendario debe de quedar fijo siguiendo las reglas
-- establecidas a partir de la fecha de separo … esas fechas de pago serán las
-- que siempre verá en el portal». Caso: Sahid (FR 11-ene) pasó de 4 pagos de
-- $975 a 3 de $1,300 de un día para otro porque el plan se recalculaba desde hoy.
--
-- · fecha_separo: el día del separo (NULL = sin plan fijo; los migrados del Excel
--   lo capturan Bulma/Milk en Capsule — decisión de Memo).
-- · plan_pagos: el plan CONGELADO que arma `_lib/plan-fijo` (ventanas + cuotas).
-- · El trigger re-reparte SOLO las cuotas que aún no empiezan cuando cambia el
--   total o el paquete (decisión de Memo: mismas fechas, nuevo monto). Vive en la
--   base para que NINGÚN escritor de total_contrato se lo salte. Espejo JS:
--   `rerepartir` de _lib/plan-fijo (careado en mide:plan-fijo-1).
--
-- CORRIDA: 4-nov-2026 vía MCP.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.viajeros_evento
  add column if not exists fecha_separo date,
  add column if not exists plan_pagos jsonb;

alter table public.viajeros_evento drop constraint if exists viajeros_plan_pagos_objeto;
alter table public.viajeros_evento add constraint viajeros_plan_pagos_objeto
  check (plan_pagos is null or (jsonb_typeof(plan_pagos) = 'object' and jsonb_typeof(plan_pagos->'cuotas') = 'array'));

create or replace function public.plan_pagos_resplit() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  hoy text := to_char((now() at time zone 'America/Matamoros')::date, 'YYYY-MM-DD');
  sep numeric; deuda numeric; sum_kept numeric := 0; n_max int; resto numeric;
  kept jsonb := '[]'::jsonb; fut jsonb := '[]'::jsonb; nuevas jsonb := '[]'::jsonb;
  c jsonb; v jsonb; k int; q numeric; acc numeric := 0; i int := 0; m numeric; todas jsonb;
begin
  if NEW.plan_pagos is null then return NEW; end if;
  -- Si la misma escritura trae un plan nuevo (fijar/rehacer), ése manda.
  if NEW.plan_pagos is distinct from OLD.plan_pagos then return NEW; end if;
  if NEW.total_contrato is not distinct from OLD.total_contrato
     and NEW.tipo_paquete is not distinct from OLD.tipo_paquete then return NEW; end if;

  sep := coalesce((NEW.plan_pagos->>'separo_monto')::numeric, 0);
  deuda := greatest(0, coalesce(NEW.total_contrato, 0) - sep);
  n_max := case when lower(coalesce(NEW.tipo_paquete, '')) = 'cheap' then 4 else 10 end;

  for c in select * from jsonb_array_elements(coalesce(NEW.plan_pagos->'cuotas', '[]'::jsonb)) loop
    if (c->>'ini') <= hoy and coalesce((c->>'liq')::boolean, false) = false
       and coalesce((c->>'monto')::numeric, 0) > 0 then
      kept := kept || jsonb_build_array(c);
      sum_kept := sum_kept + coalesce((c->>'monto')::numeric, 0);
    end if;
  end loop;
  for v in select * from jsonb_array_elements(coalesce(NEW.plan_pagos->'ventanas', '[]'::jsonb)) loop
    if (v->>'ini') > hoy and jsonb_array_length(fut) < greatest(0, n_max - jsonb_array_length(kept)) then
      fut := fut || jsonb_build_array(v);
    end if;
  end loop;

  resto := greatest(0, round(deuda - sum_kept, 2));
  k := jsonb_array_length(fut);
  if k > 0 then
    q := ceil(resto / k);
    for v in select * from jsonb_array_elements(fut) loop
      i := i + 1;
      if i = k then m := round(resto - acc, 2); else m := least(q, greatest(0, resto - acc)); end if;
      acc := acc + m;
      nuevas := nuevas || jsonb_build_array(jsonb_build_object('lbl', v->'lbl', 'ini', v->'ini', 'fin', v->'fin', 'monto', m));
    end loop;
  elsif resto > 0 then
    nuevas := jsonb_build_array(jsonb_build_object('lbl', 'Antes del evento', 'ini', hoy,
      'fin', coalesce(NEW.plan_pagos->>'evento_ds', hoy), 'monto', resto, 'liq', true));
  end if;

  select coalesce(jsonb_agg(x.e || jsonb_build_object('n', x.ord) order by x.ord), '[]'::jsonb)
    into todas from jsonb_array_elements(kept || nuevas) with ordinality as x(e, ord);

  NEW.plan_pagos := NEW.plan_pagos
    || jsonb_build_object('cuotas', todas, 'total_base', NEW.total_contrato,
         'ajustes', coalesce(NEW.plan_pagos->'ajustes', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'at', now(), 'total_de', OLD.total_contrato, 'total_a', NEW.total_contrato,
           'paquete_de', OLD.tipo_paquete, 'paquete_a', NEW.tipo_paquete, 'hoy', hoy)));
  return NEW;
end $$;

revoke all on function public.plan_pagos_resplit() from public, anon, authenticated;

drop trigger if exists viajeros_plan_pagos_resplit on public.viajeros_evento;
create trigger viajeros_plan_pagos_resplit
  before update of total_contrato, tipo_paquete on public.viajeros_evento
  for each row execute function public.plan_pagos_resplit();
