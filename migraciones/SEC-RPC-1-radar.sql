-- ═══════════════════════════════════════════════════════════════════════════
-- SEC-RPC-1 · las ocho `radar_*` quedan detrás del candado
-- Base: KameHouse (npgnhsmwpcipxgvfxrho).  La corre Jane.
--
-- HALLAZGO DEL BARRIDO DE UB-4, y es mío: las ocho funciones que construí en la
-- serie RAD (#616-#623) están EJECUTABLES POR `anon`. Un `create function` en
-- `public` nace ejecutable por PUBLIC, y en Supabase eso las expone en
-- `/rest/v1/rpc/<nombre>` a cualquiera con la anon key — que vive en el
-- `index.html` y es pública por diseño.
--
-- QUÉ SE FILTRA, MEDIDO SOBRE LA SALIDA REAL DE LAS SIETE QUE DEVUELVEN DATOS:
--   · cero correos, cero teléfonos, cero campos de dinero, cero campos de PII;
--   · lo que sí: el TABLERO DEL NEGOCIO — visitas por día, eventos más vistos
--     con sus sesiones, el embudo completo y las lecturas de Giru.
-- O sea: no es una fuga de datos personales, es la inteligencia del negocio
-- legible por cualquiera. No urge como un incendio, pero no debe quedarse.
--
-- Ninguna la llama el navegador: se piden desde funciones de Netlify con la
-- service key (`admin-radar.js` llama a cinco, `radar-alertas.js` a
-- `radar_ventana`). Cerrarlas no rompe nada — y si rompiera algo, ese algo
-- estaba pidiéndolas sin credencial.
--
-- ⏳ Y DOS QUE NADIE LLAMA, anotadas sin urgencia: `radar_rol_metrics` y
-- `radar_pagos_metrics` no aparecen en ningún archivo del repo. Se cierran
-- igual —cerrar lo que nadie usa es gratis— pero conviene decidir aparte si
-- se podan: una función viva sin llamadores es deuda que parece feature.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f' and p.proname like 'radar\_%'
  loop
    execute format('revoke execute on function %s from public', f.firma);
    execute format('revoke execute on function %s from anon', f.firma);
    execute format('revoke execute on function %s from authenticated', f.firma);
    execute format('grant  execute on function %s to service_role', f.firma);
    n := n + 1;
  end loop;
  raise notice 'SEC-RPC-1 · % funciones radar_* cerradas', n;
end $$;

-- ═══ HUMO ═══════════════════════════════════════════════════════════════════
-- 🔒 EL BARRIDO SE HACE CONTRA `pg_proc`, no contra una lista escrita a mano:
-- una función nueva que alguien cree mañana aparecería aquí sola. Una lista al
-- lado de la realidad envejece; preguntarle al catálogo, no.
do $$
declare abiertas int; cerradas int;
begin
  select count(*) into abiertas from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if abiertas > 0 then
    raise exception 'FALLA: quedan % funciones ejecutables por anon', abiertas;
  end if;
  select count(*) into cerradas from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f' and p.proname like 'radar\_%'
     and has_function_privilege('service_role', p.oid, 'EXECUTE');
  if cerradas < 8 then
    raise exception 'FALLA: solo % radar_* quedaron alcanzables por service_role (esperaba 8)', cerradas;
  end if;
  raise notice 'HUMO OK · 0 funciones abiertas a anon en todo el esquema · las 8 radar_* siguen vivas para service_role';
end $$;
