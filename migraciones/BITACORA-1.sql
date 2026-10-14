-- =============================================================================
-- BITACORA-1 (13-oct-2026) · La bitácora de invitaciones nunca había asentado nada.
-- La tabla REAL `invitaciones_portal` nació de MIG-1D-invitaciones.sql (nombre,
-- viajero_ids uuid[], enviada_por — todos NOT NULL). El acta posterior
-- ACTA-MIG-1D-II.sql traía OTRA forma (portal_cliente_id, enviado_por) con
-- `create table if not exists`, así que nunca corrió de verdad — y el código
-- escribía con la forma del acta: el correo salía y el asiento fallaba SIEMPRE.
-- Lo cazó Memo al aprobar a Lizeth («marcó un error justo al final»).
--   · el código ya escribe la forma real (filaBitacora en _lib/invitacion-portal);
--   · aquí se le ponen los dos candados que el acta prometía: UNIQUE por
--     (evento, correo) y correo en minúsculas (0 filas al correr: no choca).
--   · y se asientan a mano los 2 correos reales que YA salieron (Juventino y
--     Lizeth, 13-oct), con su email_id de Resend, para que nadie los re-invite.
-- =============================================================================
alter table public.invitaciones_portal
  add constraint invitaciones_portal_correo_minus check (correo = lower(correo));
create unique index if not exists invitaciones_portal_evento_correo_uq
  on public.invitaciones_portal (evento_id, correo);
-- (los dos asientos manuales se hicieron con su viajero_id y email_id reales)
