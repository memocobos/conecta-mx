-- =============================================================================
-- ZONA-EXCEL-MANDA-1 · LA ORTOGRAFÍA DEL EXCEL MANDA EN LA FICHA
-- 2-oct-2026 · acta de Claude Code · careo: npm run mide:zona-excel-manda-1 (60✅)
-- =============================================================================
-- Regla firmada de Memo (2-oct-2026), citada:
--   «NO cambio el Excel: tú cámbialo en el index. Si dice 1er Nivel regúlalo a
--    Primer Nivel (arjona), y así con todos … Ajústate para poder leerlo y de
--    paso cambia el index.»
-- Y la precisión de Jane: la firma es de LA CLASE —toda zona cuya ficha difiera
-- de cómo la escribe el Excel—, no de los cuatro nombres que traía mi lista.
--
-- ⚠️ EL LOTE NO SALE DE UNA LISTA: SALE DE CAREAR LA FICHA CONTRA LA COSECHA.
-- Las 4 pestañas se cosecharon de verdad (fuente `pestanas`, columna «Boleto»
-- por su LITERAL en la fila 10, jamás por índice) y esto es lo que el Excel
-- escribe hoy:
--   arjona      : Diamante 29 · Oro 8 · Plata 10 · Platino 7 · Primer Nivel 8
--                 · Segundo Nivel 2 · Tercer Nivel 2 · VIP 1
--   caifanes#0  : «-» 19 · Beyond Oro 2 · Perfiles 7 · Platino 9
--   caifanes#1  : «-» 12 · Beyond Oro 6 · Beyond VIP 6 · «N/A» 3 · Perfiles 5
--                 · Perfiles D 6 · Platino 6
--   trueno      : «-» 42 · Beyond 1 · Perfil 2 · Perfil B 2 · Platino 2
--
-- 🔴🔒 EL PELIGRO CENTRAL, MEDIDO: «Perfil» ES PREFIJO DE «Perfil B/C/D».
-- En la ficha de caifanes el token exacto `"n":"Perfil"` aparece 6 veces y el
-- prefijo `"n":"Perfil` aparece 24 — un replace a ciegas habría corrompido
-- **18 nombres de zona** («Perfil B» → «Perfiles B»), en las zonas que el
-- cliente ve y por las que paga. EL ANCLA ES LA COMILLA DE CIERRE.
-- Por eso TODO replace de aquí abajo va sobre el token completo `"n":"<zona>"`.
--
-- 🔒 CAIFANES ES **UNA** FICHA QUE SIRVE A **DOS** PESTAÑAS. `caifanes#0` y
-- `caifanes#1` NO tienen fila en `esferas_eventos`: la ficha es la del PADRE
-- `caifanes`, y sus zonas viven en SEIS sitios —`zonas`, `cheap_zonas` y, dentro
-- de `multifecha`, las `zonas` y `cheapZonas` de CADA UNA de las dos fechas—.
-- Mi camino aprobado hablaba de 4 fichas con 4 sitios; son 3 fichas y 20 sitios.
--
-- EL LOTE (6 renombres de ficha · 20 sitios de JSON · 7 pares pestaña-zona):
--   arjona   «1er Nivel»      → «Primer Nivel»    2 sitios
--   arjona   «3er Nivel»      → «Tercer Nivel»    2 sitios
--   caifanes «Perfil»         → «Perfiles»        6 sitios  (cura #0 Y #1)
--   caifanes «Perfil D»       → «Perfiles D»      6 sitios  (cura #1)
--   trueno   «Perfil A»       → «Perfil»          2 sitios
--   trueno   «Beyond General» → «Beyond»          2 sitios
--
-- ⚠️ EL SÉPTIMO PAR YA ESTABA HECHO: arjona «2do Nivel» → «Segundo Nivel». La
-- ficha YA dice «Segundo Nivel» (0 ocurrencias del token viejo) y sus 2 viajeros
-- ya están capturados así. Queda nombrado porque Memo lo nombró; no es un olvido.
--
-- ⏳ LO QUE **NO** SE RENOMBRA, Y ESPERA PALABRA DE MEMO: caifanes «Perfil B» y
-- «Perfil C». El Excel **no las escribe** (las dos van `ag:1`, agotadas), así que
-- no hay dato que diga si serían «Perfiles B»/«Perfiles C». Renombrarlas sería
-- INVENTAR lo que el Excel va a escribir, y la casa ya tiene la regla: la puerta
-- abre lo que no se vende, jamás lo que NO SE SABE. Si Memo dice que «y así con
-- TODOS» las incluye, son 2 renombres más (12 sitios) en esta misma forma.
-- Mientras no, el candado de cardinalidad del careo las caza el día que alguien
-- venda ahí: el barrido pestaña-vs-ficha lo DICE, no pasa en vacío.
--
-- 🔒 EL ORDEN ES FICHA → PUBLICAR → DATOS, y la razón está MEDIDA: la puerta de
-- zonas (`_lib/zona-ficha`) lee el universo de `catalogo-index`, o sea del
-- **index SERVIDO**, NO de `esferas_eventos`. Así que:
--   · cambiar la ficha es INVISIBLE para el cliente (verificado: ningún camino de
--     precio ni de venta lee esa tabla; sus lectores son Esferas, el compilador y
--     el contador público, que mira `fecha_inicio`);
--   · pero hasta que no se PUBLIQUE, cada venta nueva sigue escribiendo la
--     ortografía VIEJA y crea un huérfano nuevo. Migrar los datos ANTES del
--     publish sería trabajar para volver a trabajar.
-- ⚠️ VENTANA DICHA, no escondida: entre el publish y la FASE 2 las 5 zonas que
-- siguen VENDIENDO (todas menos caifanes «Perfil D», que está agotada) muestran
-- su conteo de vendidos en cero, porque el index ya dice el nombre nuevo y los
-- renglones todavía el viejo. La FASE 2 va inmediatamente después del publish.
--
-- CERO triggers en las 6 tablas tocadas (medido en `pg_trigger`), así que nada
-- se dispara solo y ningún `updated_at` se mueve por su cuenta.

begin;

-- ── FASE 1 · LA FICHA ───────────────────────────────────────────────────────
-- arjona: 2 sitios × 2 renombres = 4 escrituras
update esferas_eventos set
  zonas       = replace(replace(zonas,       '"n":"1er Nivel"', '"n":"Primer Nivel"'), '"n":"3er Nivel"', '"n":"Tercer Nivel"'),
  cheap_zonas = replace(replace(cheap_zonas, '"n":"1er Nivel"', '"n":"Primer Nivel"'), '"n":"3er Nivel"', '"n":"Tercer Nivel"')
where slug = 'arjona';

-- caifanes (PADRE de #0 y #1): 3 columnas × 2 renombres; `multifecha` lleva 4
update esferas_eventos set
  zonas       = replace(replace(zonas,       '"n":"Perfil D"', '"n":"Perfiles D"'), '"n":"Perfil"', '"n":"Perfiles"'),
  cheap_zonas = replace(replace(cheap_zonas, '"n":"Perfil D"', '"n":"Perfiles D"'), '"n":"Perfil"', '"n":"Perfiles"'),
  multifecha  = replace(replace(multifecha,  '"n":"Perfil D"', '"n":"Perfiles D"'), '"n":"Perfil"', '"n":"Perfiles"')
where slug = 'caifanes';

-- trueno: 2 sitios × 2 renombres = 4 escrituras
update esferas_eventos set
  zonas       = replace(replace(zonas,       '"n":"Perfil A"', '"n":"Perfil"'), '"n":"Beyond General"', '"n":"Beyond"'),
  cheap_zonas = replace(replace(cheap_zonas, '"n":"Perfil A"', '"n":"Perfil"'), '"n":"Beyond General"', '"n":"Beyond"')
where slug = 'trueno';

commit;

-- ── CÓMO SE COMPRUEBA LA FASE 1 (debe dar CERO viejas y las nuevas completas) ─
-- select slug,
--   (length(t)-length(replace(t,'"n":"1er Nivel"','')))/15      as v_1er,
--   (length(t)-length(replace(t,'"n":"Perfil"','')))/12         as v_perfil_solo,
--   (length(t)-length(replace(t,'"n":"Primer Nivel"','')))/18   as n_primer,
--   (length(t)-length(replace(t,'"n":"Perfiles"','')))/14       as n_perfiles
-- from (select slug, zonas||cheap_zonas||coalesce(multifecha,'') as t
--         from esferas_eventos where slug in ('arjona','caifanes','trueno')) x;

-- ── FASE 2 · LOS DATOS (va DESPUÉS del publish, no antes) ───────────────────
-- 30 renglones: compras 6 · viajeros_evento 23 · rol_recordatorios 1
-- 🔒 `stock_ajustes` NO SE TOCA: sus filas YA traen la ortografía nueva
-- («Primer Nivel», «Perfiles», «Perfiles D», «Perfil») porque el careo canoniza
-- desde la pestaña. ESA ERA LA DERIVA: el ajuste restaba de una llave que la
-- ficha no tenía. El renombre de la ficha las CURA sin tocarlas.
-- 🔒 `precios_historial` tampoco: CERO filas para arjona*, caifanes*, trueno*
-- (medido, incluida la llave PADRE). Un cero es una afirmación: estos eventos
-- nunca registraron un cambio de precio, así que no hay historial que arrastrar
-- y /rol seguirá cayendo a su respaldo del catálogo, igual que hoy.
-- ⚰️ TELEMETRÍA NO SE MIGRA (orden de Memo): `main_eventos_uso` (478 filas) y
-- `rol_eventos_uso` (26) conservan el nombre viejo A PROPÓSITO — son el registro
-- de lo que la gente vio ENTONCES, y reescribirlo falsearía el pasado.
--
-- begin;
-- update compras set zona = 'Primer Nivel' where evento_id='arjona'     and zona='1er Nivel';
-- update compras set zona = 'Perfiles'     where evento_id='caifanes#0' and zona='Perfil';
-- update compras set zona = 'Perfiles'     where evento_id='caifanes#1' and zona='Perfil';
-- update compras set zona = 'Perfiles D'   where evento_id='caifanes#1' and zona='Perfil D';
-- update compras set zona = 'Perfil'       where evento_id='trueno'     and zona='Perfil A';
-- update compras set zona = 'Beyond'       where evento_id='trueno'     and zona='Beyond General';
-- update viajeros_evento set zona_boleto='Primer Nivel' where evento_id='arjona'     and zona_boleto='1er Nivel';
-- update viajeros_evento set zona_boleto='Tercer Nivel' where evento_id='arjona'     and zona_boleto='3er Nivel';
-- update viajeros_evento set zona_boleto='Perfiles'     where evento_id='caifanes#0' and zona_boleto='Perfil';
-- update viajeros_evento set zona_boleto='Perfiles'     where evento_id='caifanes#1' and zona_boleto='Perfil';
-- update viajeros_evento set zona_boleto='Perfiles D'   where evento_id='caifanes#1' and zona_boleto='Perfil D';
-- update viajeros_evento set zona_boleto='Perfil'       where evento_id='trueno'     and zona_boleto='Perfil A';
-- update rol_recordatorios set zona='Perfil' where evento_id='trueno' and zona='Perfil A';
-- commit;
--
-- 🔒 Y CADA RENGLÓN SE RELEE DESPUÉS DEL UPDATE (no se confía en el conteo del
-- propio UPDATE): el censo de la FASE 2 se vuelve a correr y tiene que dar CERO
-- en toda zona vieja y los totales exactos en las nuevas.
