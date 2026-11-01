-- =============================================================================
-- REQ-CORRIGE-1 (1-nov-2026): «Corregir y aprobar» en la bandeja.
-- Palabra de Memo: cuando no hay lugar en la zona/fecha que pidió el cliente,
-- Bulma/Milk lo hablan por WhatsApp y corrigen AHÍ MISMO (fecha · paquete ·
-- zona · habitación) al aprobar — sin que el cliente vuelva a meter la
-- solicitud. Le llega el correo de siempre con el aviso del cambio.
--
-- La requisición CONSERVA lo que el cliente pidió (evento_id/paquete/zona/
-- hotel no se pisan: son el acta de su pedido). Lo corregido vive aquí:
--   correccion = { antes:{evento_id,paquete,zona,hotel,total},
--                  despues:{evento_id,paquete,zona,hotel,total},
--                  motivo, por, at }
-- Tabla existente (RLS deny-all + grant service_role ya vigentes): sin GRANT nuevo.
-- =============================================================================
alter table public.requisiciones add column if not exists correccion jsonb;
alter table public.requisiciones drop constraint if exists requisiciones_correccion_objeto;
alter table public.requisiciones add constraint requisiciones_correccion_objeto
  check (correccion is null or jsonb_typeof(correccion) = 'object');
