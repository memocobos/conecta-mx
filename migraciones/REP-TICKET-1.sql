-- =============================================================================
-- REP-TICKET-1 · Bucket PRIVADO para los tickets de gastos de los reportes
-- post-evento de coordinadores (25-oct-2026). YA CORRIDA vía MCP el 25-oct.
--
-- Reporte de Memo: «los coordinadores me reportan que a la hora de enviar sus
-- reportes no tienen cómo subir los tickets de los gastos».
--
-- El ticket es OPCIONAL por gasto (palabra de Memo, 25-oct). La foto sube por
-- la function admin-reportes (acción ticket_subir, service_role) a
--   reportes-tickets/<coordi_id>/<timestamp>-<rand>.<ext>
-- y se ve con URL FIRMADA (acción ticket_ver). El path viaja DENTRO de
-- gastos_detalle (jsonb que ya existe) como `ticket_path` — CERO columnas
-- nuevas. 🔒 Bucket PRIVADO: un ticket puede traer datos de la tarjeta del
-- coordi; solo se sirve firmado y el coordinador solo puede firmar paths bajo
-- su propio id (candado en el servidor).
--
-- Sin policies de storage a propósito: las dos acciones van con service_role
-- (bypass RLS) y NADIE más tiene camino al bucket (ni anon ni authenticated).
-- La regla del GRANT (30-oct) es de TABLAS nuevas en public; un bucket privado
-- sin policies ya niega todo lo que no sea service_role.
-- =============================================================================

insert into storage.buckets (id, name, public)
select 'reportes-tickets', 'reportes-tickets', false
where not exists (select 1 from storage.buckets where id = 'reportes-tickets');

-- Verificación (corrida: public = false):
select id, name, public from storage.buckets where id = 'reportes-tickets';
