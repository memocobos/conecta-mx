-- REQ-CODIGO-1 (12-nov-2026) — YA CORRIDA. El código de descuento viaja con la
-- requisición: requisicion-crear lo valida contra el PROMOS del index servido,
-- cuenta usos en el servidor y guarda el total YA con descuento.
alter table public.requisiciones
  add column if not exists codigo text,
  add column if not exists descuento numeric(12,2),
  add column if not exists total_lista numeric(12,2);
alter table public.requisiciones drop constraint if exists requisiciones_descuento_ok;
alter table public.requisiciones add constraint requisiciones_descuento_ok
  check ((codigo is null and descuento is null) or (codigo is not null and codigo = upper(codigo) and descuento is not null and descuento >= 0));
create index if not exists requisiciones_codigo_idx on public.requisiciones (codigo) where codigo is not null;
grant select, insert, update, delete on public.requisiciones to service_role;
