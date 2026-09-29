-- ═══════════════════════════════════════════════════════════════════════════
-- NUM-MULTIFECHA-1 · siembra de numerologia_eventos (28-sep-2026, Jane)
-- ═══════════════════════════════════════════════════════════════════════════
-- Medido antes de sembrar (careo real de producción, 28-sep):
--   · el bloque «Coronca Capital» trae 3 filas con fecha VACÍA y el día en la
--     columna de ZONA (Viernes $800 · Domingo $500 · Domingo $500);
--   · sin_mapeo con dinero de eventos VIVOS post-corte: «Alfredo olivas» ∅
--     (2f, $7,200) · «Iron Maiden» ∅ (5f, $0, apartados) · «Grupo frontera» ∅
--     (2f, $600 — el 16-dic; el 17-dic ya estaba sembrado);
--   · «Caifanes» tiene DOS filas a #0 (∅ y «11 de Diciembre») y NINGUNA a #1:
--     hoy no hay filas del 12-dic, se siembra la casa para cuando lleguen.
--
-- Las filas de DÍA (Viernes/Sabado/Domingo) son INERTES hasta que el código de
-- NUM-MULTIFECHA-1 despliegue (la llave vieja solo mira la fecha); el respaldo
-- ∅ → #0 se CONSERVA: es el «sin fecha → primera función» del acta del 19-sep.
--
-- Lo que NO se siembra, a propósito (fila sin mapeo no se adivina):
--   · «EDC 2026» ∅ (4f, $12,800) — el nombre dice el evento PASADO (feb-2026,
--     pre-corte); si son ventas de edc27, LA PALABRA ES DE MEMO;
--   · «Cristian Nodal» (2f, $20,200) — SIN ficha en el catálogo;
--   · «Fan Fest Firme» (1f, $500) — fanfest-firme es rideOnly (jun-26, pasado);
--   · Rosalia/Kenia Os/Milo J/Enhypen/Lorde/Zayn/J Balvin/Kali uchis/BTS/
--     Harry/paco Amoroso/Melanie/Dale Mixx — todos ANTERIORES al corte de
--     calle24 (3-sep-2026): el corte vive en la siembra, no en un if.
-- ═══════════════════════════════════════════════════════════════════════════
begin;
do $$
declare k int; n int := 0;
begin
  -- candado: ninguna de las llaves que se van a sembrar existe ya
  select count(*) into k from numerologia_eventos
   where (nombre_libro, coalesce(fecha_libro,'')) in
     (('Coronca Capital','Viernes'),('Coronca Capital','Sabado'),('Coronca Capital','Domingo'),
      ('Alfredo olivas',''),('Iron Maiden',''),('Grupo frontera',''),('Caifanes','12 de Diciembre'));
  if k <> 0 then raise exception 'ya hay % de estas llaves sembradas — revisar antes de repetir', k; end if;

  insert into numerologia_eventos (nombre_libro, fecha_libro, evento_id, activa, notas) values
    ('Coronca Capital','Viernes','coronacapital#0', true, 'NUM-MULTIFECHA-1 28-sep: el día vive en la col. zona del libro'),
    ('Coronca Capital','Sabado', 'coronacapital#1', true, 'NUM-MULTIFECHA-1 28-sep: el día vive en la col. zona del libro'),
    ('Coronca Capital','Domingo','coronacapital#2', true, 'NUM-MULTIFECHA-1 28-sep: el día vive en la col. zona del libro'),
    ('Alfredo olivas', null,     'alfredito',       true, 'NUM-MULTIFECHA-1 28-sep: sin fecha → única función'),
    ('Iron Maiden',    null,     'ironmaiden',      true, 'NUM-MULTIFECHA-1 28-sep: sin fecha → única función'),
    ('Grupo frontera', null,     'frontera#0',      true, 'NUM-MULTIFECHA-1 28-sep: sin fecha → primera función (16-dic); el 17-dic ya existía'),
    ('Caifanes','12 de Diciembre','caifanes#1',     true, 'NUM-MULTIFECHA-1 28-sep: casa para el 12-dic (hoy sin filas)');
  get diagnostics n = row_count;
  if n <> 7 then raise exception 'se esperaban 7 filas, entraron %', n; end if;
  raise notice 'OK: 7 mapeos sembrados';
end $$;
commit;
