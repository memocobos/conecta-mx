-- COMPROBANTE-DUP-1 (5-nov-2026) · un comprobante que YA está registrado no
-- vuelve a entrar desde el Portal ni desde el formulario de reservación.
-- Palabra de Memo: «claro hazlo, es para evitar estafas». Caso que lo destapó:
-- Erik Rivera Cruz (FR 12-ene) subió desde su Portal el MISMO archivo de su
-- separo de $300 del 31-oct (116,549 bytes, eTag c9503ebd… idéntico).
--
-- La huella es el md5 de los bytes. Dos fuentes, a propósito:
--   · las columnas nuevas (el servidor las llena con SU md5 al subir), y
--   · el eTag de storage.objects (md5 en subidas de un solo PUT), que cubre
--     todo lo que ya existía — incluidas las fotos que el equipo sube en Capsule.
-- 🔒 Solo cuenta como «ya registrado» un objeto REFERENCIADO por una
-- requisición, una solicitud de pago o un abono: un huérfano (subida cuyo
-- INSERT falló, p. ej. el reintento de REQ-LENTO-1) NO bloquea el reintento.
-- 🔒 La función no devuelve datos de otra persona: solo dónde vive el
-- duplicado (para el log); el cliente recibe un mensaje genérico.

alter table public.requisiciones   add column if not exists comprobante_md5 text;
alter table public.cambios_viajero add column if not exists foto_md5 text;
alter table public.requisiciones   drop constraint if exists requisiciones_comprobante_md5_forma;
alter table public.requisiciones   add constraint requisiciones_comprobante_md5_forma check (comprobante_md5 is null or comprobante_md5 ~ '^[0-9a-f]{32}$');
alter table public.cambios_viajero drop constraint if exists cambios_viajero_foto_md5_forma;
alter table public.cambios_viajero add constraint cambios_viajero_foto_md5_forma check (foto_md5 is null or foto_md5 ~ '^[0-9a-f]{32}$');
create index if not exists requisiciones_comprobante_md5_idx on public.requisiciones (comprobante_md5) where comprobante_md5 is not null;
create index if not exists cambios_viajero_foto_md5_idx on public.cambios_viajero (foto_md5) where foto_md5 is not null;

-- 🔒 COMPROBANTE-DUP-1b (mismo día, MEDIDO antes de encender): lo RECHAZADO no
-- cuenta. Barrido del bucket: 9 requisiciones rechazadas por «zona agotada» se
-- re-mandaron con el MISMO comprobante y se aprobaron — es el flujo correcto
-- de RECHAZO-AVISO-1 («tu pago queda a tu favor, elige otra zona»). Bloquearlas
-- rompería esa puerta. Tampoco cuentan los abonos anulados en $0.
create or replace function public.comprobante_duplicado(p_md5 text)
returns table (origen text, ref text, creado timestamptz)
language sql stable security definer
set search_path = public, storage
as $$
  with o as (
    select name from storage.objects
    where bucket_id = 'abonos-viajeros'
      and replace(coalesce(metadata->>'eTag',''), '"', '') = p_md5
  )
  select * from (
    select 'requisicion'::text, r.folio, r.creado_en from public.requisiciones r
      where r.estado <> 'rechazada'
        and (r.comprobante_md5 = p_md5 or r.comprobante_path in (select name from o))
    union all
    select 'pago_portal', c.estado, c.creado_en from public.cambios_viajero c
      where c.tipo = 'pago' and c.estado <> 'rechazada'
        and (c.foto_md5 = p_md5 or c.foto_path in (select name from o))
    union all
    select 'abono', a.fecha::text, a.created_at from public.abonos_viajero a
      where a.monto > 0 and a.foto_path in (select name from o)
  ) x
  where p_md5 ~ '^[0-9a-f]{32}$'
  limit 5
$$;

revoke all on function public.comprobante_duplicado(text) from public, anon, authenticated;
grant execute on function public.comprobante_duplicado(text) to service_role;
