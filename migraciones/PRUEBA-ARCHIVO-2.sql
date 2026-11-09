-- ═══════════════════════════════════════════════════════════════════════════
-- PRUEBA-ARCHIVO-2 · las tablas de «🗑 Era prueba» alcanzan a las vivas
-- 9-nov-2026 · YA CORRIDA en KH (npgnhsmwpcipxgvfxrho)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- LO QUE PASÓ. Al archivar la requisición de prueba del encendido de Mercado
-- Pago (R-69B6B), el botón contestó «No se pudo copiar al archivo — no se quitó
-- nada». `archivar_prueba` (admin-requisiciones) copia la fila ENTERA
-- (select=*) a `pruebas_archivo_*` ANTES de borrar, y PostgREST rechaza un
-- INSERT con una columna que la tabla destino no tiene.
--
-- MEDIDO: las tres tablas de archivo nacieron el 13-oct (PRUEBA-ARCHIVO-1) y
-- desde entonces las vivas ganaron columnas que nadie copió al archivo:
--   requisiciones   → 12 (motivo_clave, aviso_at, aviso_email_id, correccion,
--                         genero, comprobante_md5 y las 6 mp_* de MP-LINK-1)
--   viajeros_evento → 11 (emergencia_parentesco, sin_boleto, fecha_nacimiento,
--                         portal_revisado_at/_por, hotel_tipo, genero,
--                         indicaciones, fecha_separo, plan_pagos, vuelo)
--   abonos_viajero  →  1 (mp_pago_id)
-- El último archivo que funcionó es del 14-oct. La PRIMERA columna nueva
-- (motivo_clave, RECHAZO-AVISO-1, 28-oct) ya lo rompió: el botón llevaba
-- ~12 días muerto para CUALQUIER requisición, no solo las de MP. Nadie lo vio
-- porque no hubo pruebas que archivar en esas semanas.
--
-- 🔒 LA LECCIÓN ES LA DE SIEMPRE — una lista a mano al lado de la realidad:
-- una tabla-espejo creada copiando columnas envejece con cada acta que toca a
-- la viva. Por eso las columnas que faltan NO se teclean aquí: se DERIVAN del
-- catálogo, y el bloque se puede re-correr en cualquier fecha (idempotente:
-- con 0 faltantes no hace nada). El archivo NO lleva CHECKs ni NOT NULL a
-- propósito: es una foto de lo que hubo, no una tabla que valide.
--
-- ⚠️ Lo que esto NO cierra: la próxima columna nueva en una viva vuelve a
-- romper el botón hasta que alguien re-corra este bloque. El careo
-- `mide:prueba-archivo-1` no lo ve (red falsa). Tuerca propia: que
-- `archivar_prueba` proyecte solo las columnas que el archivo conoce, o un
-- vigilante que compare los dos catálogos.
-- ───────────────────────────────────────────────────────────────────────────

do $$
declare par record; col record;
begin
  for par in select * from (values
      ('requisiciones','pruebas_archivo_requisiciones'),
      ('viajeros_evento','pruebas_archivo_viajeros'),
      ('abonos_viajero','pruebas_archivo_abonos')) v(viva, archivo)
  loop
    for col in
      select a.attname, format_type(a.atttypid, a.atttypmod) tipo
      from pg_attribute a
      where a.attrelid = ('public.'||par.viva)::regclass and a.attnum > 0 and not a.attisdropped
        and not exists (select 1 from pg_attribute b
                        where b.attrelid = ('public.'||par.archivo)::regclass
                          and b.attnum > 0 and not b.attisdropped and b.attname = a.attname)
    loop
      execute format('alter table public.%I add column %I %s', par.archivo, col.attname, col.tipo);
      raise notice '% += % %', par.archivo, col.attname, col.tipo;
    end loop;
  end loop;
end $$;

-- CAREO DE SALIDA (corrido 9-nov: 0 · 0 · 0)
select v.viva, v.archivo, count(a.attname) faltan
from (values ('requisiciones','pruebas_archivo_requisiciones'),
             ('viajeros_evento','pruebas_archivo_viajeros'),
             ('abonos_viajero','pruebas_archivo_abonos')) v(viva,archivo)
left join pg_attribute a on a.attrelid=('public.'||v.viva)::regclass and a.attnum>0 and not a.attisdropped
  and not exists (select 1 from pg_attribute b where b.attrelid=('public.'||v.archivo)::regclass
                  and b.attnum>0 and not b.attisdropped and b.attname=a.attname)
group by 1,2;

-- REGISTRO: tras correrlo, desde la sesión de Memo en KameHouse se archivaron
-- las DOS pruebas del encendido de MP (motivo «prueba del encendido de MP
-- 9-nov»): R-69B6B (pagada, op. MP 188607140172, $319) y R-YDQA2 (link
-- generado, nunca pagada). Careo: 0 vivas · 2 archivadas con sus mp_* · 0
-- viajeros nacidos. 🔒 `mp_pagos` NO se toca: la fila 188607140172 se queda —
-- es la bitácora del dinero real que cayó en la cuenta de MP (reembolsable
-- desde la app de Memo), y su idempotencia la necesita si MP re-avisa.
