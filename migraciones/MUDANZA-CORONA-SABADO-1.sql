-- =============================================================================
-- MUDANZA-CORONA-SABADO-1 (30-oct-2026) · LOS 6 DEL PASE ERAN DEL SÁBADO
-- Palabra de Memo, citada: «Daniel, Magnolia y Rogelio son sábados · Ilse
-- Janeth en el Excel tiene pagado $3,457, es sábado · Reynaldo tiene $3,590 en
-- el Excel, es sábado · Alexis tiene $9,500 pero son $3,900 del sábado paquete
-- y $5,600 de los vuelos, y ya está completo y pagado».
-- Cierra la pregunta de CAREO-DUP-FECHA-1 (los «7 de Corona»; Frida ya estaba
-- resuelta por MUDANZA-FRIDA-1): MANDA EL EXCEL — compraron el día suelto.
--
-- ⚠️ ESTA ACTA ES REGISTRO: YA CORRIÓ el 30-oct-2026. Cada fila llevó VALOR
-- ESPERADO (evento_id='coronacapital#5' + total_contrato exacto medido);
-- re-correrla escribe CERO filas. 6/6 movidas.
--
-- Candados de ENTRADA (corridos antes): habitacion_id NULL y grupo_viaje NULL
-- en las 6 (nada que soltar) · zona «General» existe en la ficha del sábado
-- (multifecha ord=2) con esa ortografía · totales al peso con la medición.
-- 🔒 EL DINERO NO SE TOCÓ: abonado_previo fuera del SET; abonos_viajero llavea
-- por viajero_id (viajaron solos) — careado en query fresca: Alexis 2·$1,440 ·
-- Ilse 1·$295 · Reynaldo 1·$310, idénticos antes y después.
--
-- Totales: Daniel/Magnolia/Rogelio $3,900 (sin cambio, ya era el precio de 1
-- día) · Ilse $8,145→$3,900 · Reynaldo $8,145→$3,900 · Alexis $13,745→$9,500
-- ($3,900 sábado + $5,600 vuelos — palabra de Memo, en la nota).
--
-- Careo de SALIDA (fresco): #5 16→10 · #1 16→22 · abonos intactos. Y el
-- inventario del sábado quedó 19−22 = −3 — EXACTO el «Restan −3» que el
-- propio Excel declara (EXCEL-AG-1): la sobreventa conocida ya se ve en el
-- sistema y el candado automático cierra la zona. El pase queda 17−10 = 7
-- libres. ⚠️ Diferencias de PAGADO Excel-vs-base (Ilse $3,457 vs $3,161 ·
-- Reynaldo $3,590 vs $3,280 · Alexis «completo» vs $8,780 de $9,500) NO se
-- tocaron aquí: el careo de #1 las nombra ahora que están en su padrón, y
-- Bulma/Milk capturan — nada automático decide dinero.
-- =============================================================================
update viajeros_evento v set
  evento_id = 'coronacapital#1',
  total_contrato = d.total_nuevo,
  notas = coalesce(v.notas,'') || ' · [MUDANZA 30-oct-2026] pase 3 días (#5) → sábado (#1), palabra de Memo: manda el Excel (General Sabado)' ||
    case when d.total_nuevo <> d.total_esperado then '; total $' || d.total_esperado || ' → $' || d.total_nuevo else '' end
from (values
  ('fb4c822b-4422-4cd5-87d8-eecdf9ef7a3c'::uuid, 13745::numeric, 9500::numeric),
  ('95a07b05-7fd7-453b-9435-7c78dcc484e5'::uuid, 3900, 3900),
  ('0c1a7bdd-eb69-4e36-b2d1-bb6aa3df858f'::uuid, 8145, 3900),
  ('7e179359-1cb0-45e8-9a27-c1bfc7ea0e1c'::uuid, 3900, 3900),
  ('da4ac3dd-da69-4efc-b5c4-e2e4d2dbd6a6'::uuid, 8145, 3900),
  ('0f607644-c07b-4136-9a35-50a8d8faeb7e'::uuid, 3900, 3900)
) d(id, total_esperado, total_nuevo)
where v.id = d.id
  and v.evento_id = 'coronacapital#5'
  and v.total_contrato = d.total_esperado;

-- Careo de salida (query fresca):
select evento_id, count(*) from viajeros_evento where evento_id like 'coronacapital%' group by 1 order by 1;
-- Esperado: #0 8 · #1 22 · #2 1 · #3 1 · #5 10 (+1 en la llave padre, preexistente).
