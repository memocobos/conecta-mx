-- ============================================================================
-- 005_storage.sql
-- Bucket de Storage para comprobantes de separo + policies.
--
-- Layout de rutas dentro del bucket:
--   comprobantes/{auth_user_id}/{solicitud_id}_{timestamp}.{ext}
--
-- El cliente solo puede subir/leer archivos dentro de su propia carpeta
-- (la que coincide con su auth.uid()). service_role tiene acceso total.
--
-- Si esta migración falla por permisos (típico en proyectos con DB owner
-- restringido), NO improvises: el bucket y las policies se pueden crear
-- desde el dashboard de Supabase Storage. Anota qué falló y reporta.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,                                    -- no público; se accede vía signed URLs o auth
  5 * 1024 * 1024,                          -- 5 MB por archivo (matchea validación del frontend)
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Policies en storage.objects
--    El path se almacena en la columna `name`. La función storage.foldername(name)
--    descompone "uuid/file.jpg" en {"uuid","file.jpg"}, así que [1] es la carpeta raíz.
--    Compararla contra auth.uid() es el patrón estándar de Supabase.
-- ---------------------------------------------------------------------------

drop policy if exists "comprobantes_cliente_insert" on storage.objects;
create policy "comprobantes_cliente_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "comprobantes_cliente_select" on storage.objects;
create policy "comprobantes_cliente_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "comprobantes_cliente_update" on storage.objects;
create policy "comprobantes_cliente_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Sin policy de DELETE para el cliente — solo service_role borra.

drop policy if exists "comprobantes_service_role_all" on storage.objects;
create policy "comprobantes_service_role_all"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'comprobantes')
  with check (bucket_id = 'comprobantes');
