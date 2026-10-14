-- =============================================================================
-- GZ-PLATAFORMA-1 · KARIN-GZ-1 (14-oct-2026) · LA PLATAFORMA DEL GUERRERO Z
-- y LA DEVOLUCIÓN DE PRÉSTAMOS DE LA TORRE (YA CORRIÓ).
-- Palabra de Memo: «que el coordi diga que ya lo regresó y mister popo ponga
-- aceptar la devolución para que se vuelva a cargar en el sistema» · «bocinas,
-- hieleras y otros se deben marcar como préstamos».
-- =============================================================================
-- La devolución vive en la SALIDA (no en el reporte: el coordi puede regresar
-- el préstamo antes de mandar su reporte). Recibir NO suma stock: el stock
-- regresa por UN solo camino (sumarRegresoYCerrar de admin-reportes), en la
-- aprobación final de Memo o, si ya la había, al confirmar Popo.
alter table public.salidas_bodega add column if not exists devolucion_avisada_at timestamptz;
alter table public.salidas_bodega add column if not exists devolucion_recibida_at timestamptz;
alter table public.salidas_bodega add column if not exists devolucion_recibida_por text;

-- Bocina y Hielera pasan a PRÉSTAMO (retornable). Valor esperado en el WHERE.
-- Resultado: 2 filas (Bocina 3, Hielera 3).
update kits_inventario set retornable = true where pieza in ('Bocina','Hielera') and retornable = false;

-- Nota: una columna reportes_evento.devolucion_avisada_at nació y se quitó el
-- mismo día (la devolución se movió a la salida); quedó sin datos.
