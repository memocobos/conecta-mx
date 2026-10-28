-- =============================================================================
-- MUDANZA-FRIDA-1 · 28-oct-2026 · Su Corona pasa de Vie (#0) a Vie+Sáb (#3)
-- =============================================================================
-- PALABRA DE MEMO (28-oct, firmada en chat): «Son 2 días (Vie+Sáb)».
--
-- EL CASO: Frida Xamel Peralta Rodriguez pidió por el Portal que le revisáramos
-- su «Corona Capital (Vie + Sáb · 2 días)» porque no lo veía. Su fila vive en
-- `coronacapital#0` (Vie 20 nov, 1 día).
--
-- POR QUÉ SU FECHA ERA DUDOSA DESDE EL DÍA UNO — lo dice su propia nota, escrita
-- por la migración del Excel del 28-ago:
--     «⚠ fecha (viernes) por texto de zona»
-- La fecha NUNCA salió del Excel: la ADIVINÓ la migración por cómo estaba
-- escrita la zona. Lo que sí salió del Excel es su total, $5,985, sellado
-- «Total de pestaña (careo 2026-09-20)».
--
-- Y el precio apunta al mismo lado: el catálogo cobra $3,900 por 1 día y $6,300
-- por los 2 días. $6,300 − 5% = $5,985 EXACTO. No es prueba por sí solo —por eso
-- se pidió la palabra de Memo— pero coincide con lo que ella dice.
--
-- 🔒 EL DINERO NO SE TOCA. Ni un peso: total $5,985, previo $1,528 y sus 2
--    abonos ($336 del 28-sep, $337 del 5-oct) viajan solos porque `abonos_viajero`
--    llavea por `viajero_id`, no por evento. Es el precedente MUDANZA-KAROLG-1.
--
-- 🔒 MEDIDO ANTES DE ESCRIBIR, para que la mudanza no arrastre nada:
--    · `habitacion_id` = NULL → no está en ningún cuarto, no hay rooming que soltar
--    · `grupo_viaje`   = NULL → no viaja acompañada, no hay grupo que partir
--    · la zona «General» EXISTE en la ficha de #3, con esa ortografía exacta
--    · #3 está marcada AGOTADA en la ficha → mover su fila ahí NO abre ninguna venta
--
-- ⚠️ LO QUE ESTO DEJA DICHO Y NO RESUELVE: al salir del viernes, su lugar de ese
--    día deja de contarse en `coronacapital#0` (los viajeros bajan de 8 a 7). Ella
--    sigue ocupando un lugar del viernes Y uno del sábado — el sitio vende
--    combinaciones (#3, #4, #5) pero los boletos se compran por día, y esa costura
--    no la cierra nadie hoy. Es UN boleto, y queda nombrado aquí en vez de
--    taparse subiendo un `vendidos_fuera` que el careo recalcula solo.
-- =============================================================================

-- ── [1] CANDADO DE ENTRADA: que el mundo siga como cuando se midió ──────────
-- Si algo de esto no cuadra, la migración NO debe correrse: léase primero.
select
  id, evento_id, zona_boleto, total_contrato, abonado_previo,
  habitacion_id, grupo_viaje,
  (select count(*) from abonos_viajero a where a.viajero_id = v.id) as abonos,
  (select coalesce(sum(a.monto), 0) from abonos_viajero a where a.viajero_id = v.id) as suma_abonos
from viajeros_evento v
where v.id = 'cba9ecf5-9db7-4db6-94ed-87fc3b418208';
-- ESPERADO: coronacapital#0 · General · 5985 · 1528 · NULL · NULL · 2 · 673.00

-- ── [2] LA MUDANZA ──────────────────────────────────────────────────────────
-- 🔒 VALOR ESPERADO EN EL WHERE: si la fila ya se movió, o si alguien le cambió
--    la zona mientras tanto, esto escribe CERO filas en vez de pisar un cambio
--    ajeno. Devuelve la fila para poder leer el resultado.
-- 🔒 La nota se ANEXA, jamás se pisa: la procedencia del Excel y el sello del
--    careo son el acta de cómo llegó este dato aquí.
update viajeros_evento
   set evento_id = 'coronacapital#3',
       notas = left(coalesce(notas || ' · ', '') ||
         'MUDANZA-FRIDA-1 28-oct-2026: movida de coronacapital#0 (Vie 20 nov, 1 día) a ' ||
         'coronacapital#3 (Vie + Sáb, 2 días) por palabra de Memo — ella pidió revisión en el ' ||
         'Portal diciendo que compró 2 días. Su fecha original la ADIVINÓ la migración del ' ||
         '28-ago («fecha por texto de zona»), nunca salió del Excel. Dinero INTACTO: total ' ||
         '$5,985 (de la pestaña), previo $1,528 y sus 2 abonos viajan con la fila. ' ||
         'Ojo: su lugar del viernes deja de contarse en #0.', 4000)
 where id = 'cba9ecf5-9db7-4db6-94ed-87fc3b418208'
   and evento_id = 'coronacapital#0'
   and total_contrato = 5985
returning id, evento_id, zona_boleto, total_contrato, abonado_previo;
-- ESPERADO: 1 fila · coronacapital#3 · General · 5985 · 1528

-- ── [3] CANDADO DE SALIDA: el dinero no se movió y los abonos la siguieron ──
select
  v.evento_id,
  v.total_contrato, v.abonado_previo,
  (select count(*) from abonos_viajero a where a.viajero_id = v.id) as abonos,
  (select coalesce(sum(a.monto), 0) from abonos_viajero a where a.viajero_id = v.id) as suma_abonos,
  v.notas like '%MUDANZA-FRIDA-1%' as rastro_puesto,
  v.notas like '%fecha (viernes) por texto de zona%' as acta_vieja_intacta
from viajeros_evento v
where v.id = 'cba9ecf5-9db7-4db6-94ed-87fc3b418208';
-- ESPERADO: coronacapital#3 · 5985 · 1528 · 2 · 673.00 · true · true

-- ── [4] Y QUE NADIE MÁS SE HAYA MOVIDO ──────────────────────────────────────
select evento_id, count(*) filas, sum(boletos) boletos
from viajeros_evento
where evento_id like 'coronacapital%' and tipo_viajero = 'cliente'
group by evento_id order by evento_id;
-- ESPERADO: #0 baja de 8 a 7 · #3 aparece con 1 · #1 y #5 sin moverse
