-- ═══════════════════════════════════════════════════════════════════════════
-- SEP-300-1 · EL SEPARO ES $300 EN TODOS LOS TOURS VIVOS (9-nov-2026)
-- Palabra de Memo, citada: «todos los tours baja su separo a $300 no importa
-- cual sea 2026 o 2027 y abre cdmx 2027».
--
-- QUÉ TOCA: `esferas_eventos.sep` (separo PLUS/STAY), `sep_cheap` y `sep_ride`
-- de los eventos VIVOS (no archivados, fecha_inicio hoy o después, o sin fecha
-- = «por confirmar»). Los PASADOS no se tocan: su separo es historia.
--
-- MEDIDO ANTES (base + index servido, 56 vivos en los dos — coinciden):
--   sep ≠ 300: 29 · sep_cheap ≠ 300: 31 · sep_ride ≠ 300: 2 (caifanes 500 ·
--   scorpions 500) · multifecha sin `sep` propio en ninguna entrada · ninguna
--   zona viva con `sepEspecial` · ningún vivo con `sepZonas`.
--   Antes (slug sep/sep_cheap/sep_ride):
--   siddharta 500/300/∅ · karolcdmx 500/1000/∅ · mexicojamaica 300/500/∅ ·
--   coronacapital 800/∅/∅ · julion 500/500/∅ · trueno 300/500/∅ ·
--   mariajose 200/200/∅ · flowfest 500/500/∅ · payasonicos 500/500/∅ ·
--   brunomars 1000/100/∅ · arjona 800/500/∅ · edenmunoz 500/1000/∅ ·
--   knotfest 800/500/∅ · caifanes 300/500/500 · edsheeran 800/500/∅ ·
--   babymetal 800/500/∅ · prevail 200/200/∅ · bahidora 500/500/∅ ·
--   juniorh 500/800/∅ · edc27 500/500/∅ · anagabriel 200/200/∅ ·
--   nortex 200/200/∅ · anuelaa 300/1000/∅ · louist 1000/1000/∅ ·
--   niall 500/500/∅ · txt 500/500/∅ · dialibre 200/200/∅ ·
--   scorpions 300/500/500 · ozzfest 500/500/∅ · badbunny ∅/∅/∅ ·
--   jisoo 500/500/∅ · luismiguel 500/500/∅ · muse 500/500/∅ · sabrina 500/500/∅
--   ⚠️ SEIS SUBEN en vez de bajar (estaban abajo de $300): mariajose, prevail,
--   anagabriel, nortex, dialibre (200) y el CHEAP de brunomars (100). Palabra
--   «no importa cuál sea» → van a 300 igual; se le dice a Memo con nombre.
--
-- 🔒 `sep_cheap` solo se escribe donde YA tenía valor (coronacapital y
-- badbunny siguen en NULL: el compilador no emite sepCheap sin cheapZonas y un
-- número en una columna que nadie leía sería un dato inventado). `sep_ride`
-- igual: solo caifanes y scorpions lo traen distinto. `sep` NULL (badbunny,
-- próximamente sin ficha) SÍ pasa a 300: es la palabra de Memo para TODOS.
--
-- 🔒 El index servido se EDITÓ A MANO en la misma tuerca (los mismos 34
-- eventos, mismo número) para que el push lo lleve sin esperar publish; el
-- próximo publish de Esferas lo reproduce byte a byte desde esta ficha.
--
-- VALOR ESPERADO: el WHERE exige que la fila siga siendo vivo Y traiga algún
-- separo distinto de 300 — una fila ya corregida no se re-escribe. Esperado:
-- 34 filas. Re-correr escribe 0.
-- ═══════════════════════════════════════════════════════════════════════════

update esferas_eventos
set sep = 300,
    sep_cheap = case when sep_cheap is not null then 300 else sep_cheap end,
    sep_ride  = case when sep_ride is not null and sep_ride::text <> '' then 300 else sep_ride end
where coalesce(archivado, false) = false
  and (fecha_inicio is null or fecha_inicio >= date '2026-11-09')
  and (sep is distinct from 300
       or (sep_cheap is not null and sep_cheap <> 300)
       or (sep_ride is not null and sep_ride::text <> '' and sep_ride::numeric <> 300));

-- Careo de salida (query FRESCA, no el snapshot del CTE):
--   select count(*) filter (where sep is distinct from 300) sep_mal,
--          count(*) filter (where sep_cheap is not null and sep_cheap <> 300) cheap_mal,
--          count(*) filter (where sep_ride is not null and sep_ride::text<>'' and sep_ride::numeric<>300) ride_mal
--   from esferas_eventos
--   where coalesce(archivado,false)=false and (fecha_inicio is null or fecha_inicio >= date '2026-11-09');
--   → 0 · 0 · 0
-- REGISTRO: corrido el 9-nov-2026 → 34 filas; careo de salida 0·0·0.
