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

-- =============================================================================
-- GZ-INICIO-3 (14-oct-2026) · LA PLANTILLA DE CADA QUIEN (YA CORRIÓ)
-- Palabra de Memo: «una opción de poder usar diferentes template en su
-- Kamehouse o que puedan personalizarlo». Las 7 plantillas de kamehouse.css
-- (antes amarradas al NOMBRE de una persona) + el Clásico, elegibles por todos.
-- NULL = nunca eligió (sigue la regla vieja por nombre + su color acento).
-- =============================================================================
alter table public.usuarios add column if not exists tema_plantilla text
  check (tema_plantilla is null or tema_plantilla in ('clasico','tema-ximena','tema-america','tema-reginna','tema-luis','tema-laura','tema-brittany','tema-axel'));

-- GZ-PLANTILLA-2 (14-oct-2026) · 11 temas de colección (YA CORRIÓ). Paletas
-- originales en kamehouse.css; el CHECK crece con sus ids.
alter table public.usuarios drop constraint if exists usuarios_tema_plantilla_check;
alter table public.usuarios add constraint usuarios_tema_plantilla_check check (tema_plantilla is null or tema_plantilla in ('clasico','tema-ximena','tema-america','tema-reginna','tema-luis','tema-laura','tema-brittany','tema-axel','tema-ki','tema-mutante','tema-lunar','tema-campeon','tema-tiempo','tema-flamenca','tema-disco','tema-bohemia','tema-verano','tema-laboratorio','tema-codigo'));
