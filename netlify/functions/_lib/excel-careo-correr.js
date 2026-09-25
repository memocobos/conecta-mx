// =============================================================================
// _lib/excel-careo-correr.js — CORRER el careo completo, en un solo lugar
// =============================================================================
// [CUADRE-1b] Extraído del handler de `admin-excel-careo` sin cambiarle la
// forma: la pantalla lo pide para MIRAR y el botón de aplicar lo pide para
// ESCRIBIR, y los dos tienen que estar viendo exactamente lo mismo.
//
// 🔒 POR QUÉ VIVE AQUÍ Y NO COPIADO EN EL SEGUNDO HANDLER: dos tuberías de
// careo no serían "dos listas iguales", serían "dos listas que todavía no
// divergen" — y la que diverge acabaría ESCRIBIENDO dinero con un criterio
// distinto al que la pantalla enseñó. Es la regla de la casa aplicada al caso
// en que costaría más caro.
//
// Devuelve { error:{codigo,mensaje,status,extra} } o { ok, pestanas, personas,
// viajeros, montones }. NO arma respuestas HTTP: de eso se encarga quien llama.
// =============================================================================

const { cosechar } = require('./cosecha-excel');
const { parsearPestana, carear } = require('./excel-careo');
const { mapearLibro, fundirNumerologia, parsearLibro, PESTANA_LIBRO } = require('./numerologia');
// [CUADRE-5] El catálogo, para saber si el evento es de CDMX y para el precio
// vivo por paquete+zona. Los dos salen del MISMO dueño que usa el index.
const { fetchEventosRaw } = require('./catalogo-index');
const { esCDMX, resolverPrecioVenta } = require('./precio-zona');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';

// El lado del sistema: los viajeros del evento con su abonado ya sumado.
//
// ⚠️ EL FILTRO DE `notas` VA EN DOS MITADES. `notas=not.ilike.*ya no aparece*`
// se traga las filas con `notas` NULL sin ruido: en Postgres `NULL not ilike x`
// es NULL, y NULL no pasa un filtro. Mordió a Jane en SQL el 30-ago y la gemela
// de PostgREST es exacta. Se dicen las dos: o es NULL, o no casa.
//
// ⚠️ Y `tipo_viajero`: cuentan los que son `null` o 'cliente'. Los demás
// (coordinador, creadora…) no son viajeros que el Excel liste.
async function leerBase(eventoId, sb) {
  const enc = encodeURIComponent;
  const sp = new URLSearchParams();
  // [CUADRE-1a] `total_contrato` para el séptimo montón. `notas` YA venía —la
  // usa el filtro de «ya no aparece»— y además dice si el total es un DERIVADO
  // de TOTAL-1 o un exacto de la libreta.
  // [BOLETOS-1] `boletos` para poder carear la CARDINALIDAD: la pestaña lleva
  // una fila por boleto y el sistema una por persona.
  sp.set('select', 'id,nombre,notas,tipo_viajero,zona_boleto,tipo_paquete,abonado_previo,total_contrato,boletos');
  sp.append('evento_id', 'eq.' + eventoId);
  sp.set('limit', '5000');
  // Un solo `or=` en la URL. DOS `or=` en la misma consulta se combinan de una
  // forma que no pude comprobar desde aquí, y un filtro que quizá no se aplica
  // es peor que ninguno: dejaría entrar coordinadores como si fueran viajeros y
  // el careo los reportaría como BAJAS. Lo que no puedo verificar no viaja.
  const url = `${SB_URL}/rest/v1/viajeros_evento?${sp.toString()}`
            + `&or=(tipo_viajero.is.null,tipo_viajero.eq.cliente)`;
  const r = await fetch(url, { headers: sb });
  if (!r.ok) return { error: 'No pude leer los viajeros: ' + await r.text() };
  const todas = await r.json().catch(() => null);
  if (!Array.isArray(todas)) return { error: 'La lista de viajeros no vino como lista' };
  // El segundo filtro, aquí, donde se puede probar. Y con las DOS mitades
  // dichas: `(notas || '')` es el `coalesce` que impide que una fila con notas
  // NULL desaparezca. Aquí es al revés y hay que decirlo igual: sin el `|| ''`,
  // `null.toLowerCase()` truena.
  const filas = todas.filter((v) => !String(v.notas || '').toLowerCase().includes('ya no aparece'));
  if (!filas.length) return { viajeros: [] };

  // Los abonos, en una sola consulta para todos.
  const ids = filas.map((v) => v.id);
  const ab = await fetch(`${SB_URL}/rest/v1/abonos_viajero?viajero_id=in.(${ids.map(enc).join(',')})&select=viajero_id,monto&limit=20000`, { headers: sb });
  const abonos = ab.ok ? (await ab.json().catch(() => [])) : [];
  const suma = new Map();
  for (const a of (Array.isArray(abonos) ? abonos : [])) {
    suma.set(a.viajero_id, (suma.get(a.viajero_id) || 0) + Number(a.monto || 0));
  }
  // 🔒 LA REGLA DE ORO DEL SALDO DE UN MIGRADO (VJ-3): lo abonado es
  // `abonado_previo + Σ abonos_viajero`. NO se recalcula de otra cosa: el
  // `abonado_previo` vino del Excel y está CONGELADO.
  return { viajeros: filas.map((v) => ({
    id: v.id, nombre: v.nombre, zona: v.zona_boleto, paquete: v.tipo_paquete,
    abonado: Number(v.abonado_previo || 0) + (suma.get(v.id) || 0),
    abonado_previo: Number(v.abonado_previo || 0),
    // [CUADRE-1a] Se pasan CRUDOS. El `total_contrato` NULL viaja como null y
    // no como 0 — `carear` necesita distinguir «el contrato es de cero pesos»
    // de «todavía no se sabe cuánto».
    total_contrato: v.total_contrato == null ? null : Number(v.total_contrato),
    notas: v.notas || '',
    // NOT NULL DEFAULT 1 en la base; el respaldo se escribe igual porque un
    // null aquí haría que la sincronía «corrigiera» filas que ya estaban bien.
    boletos: (parseInt(v.boletos, 10) > 0) ? parseInt(v.boletos, 10) : 1,
  })) };
}

// correrCareo(eventoId) → { error } | { ok:true, pestanas, personas, viajeros, montones }
async function correrCareo(eventoId) {
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const sb = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

  // 1. ¿Qué pestañas son de este evento? Puede haber varias (Pa'l Norte), y una
  //    puede traer regla de zona (Corona Capital).
  const mr = await fetch(`${SB_URL}/rest/v1/excel_pestanas?evento_id=eq.${encodeURIComponent(eventoId)}&activa=is.true&select=pestana,regla_zona,notas`, { headers: sb });
  if (!mr.ok) return { error: { status: 502, mensaje: 'No pude leer el mapeo de pestañas', detail: await mr.text() } };
  const mapeos = await mr.json().catch(() => []);
  if (!Array.isArray(mapeos) || !mapeos.length) {
    // 404 y con nombre: es algo que el admin puede obrar (sembrar el mapeo),
    // no un error del sistema.
    return { error: { status: 404, codigo: 'SIN_MAPEO', evento_id: eventoId,
      mensaje: `No hay ninguna pestaña mapeada a "${eventoId}". Se siembra en excel_pestanas.` } };
  }

  // 2. Cosechar cada pestaña y leerla con el protocolo.
  const personas = new Map();
  const detallePestanas = [];
  // [BOLETOS-1 adenda] La chatarra por zona, fundida entre pestañas del mismo
  // evento igual que la gente. Viaja APARTE: no es nadie, pero ocupa boleto.
  const chatarraPorZona = {};
  for (const m of mapeos) {
    const c = await cosechar({ pestana: m.pestana });
    if (!c.ok) {
      // Un fallo de UNA pestaña no se promedia con las demás: se dice cuál y se
      // para. Un careo a medias es peor que ninguno — daría BAJAS falsas de
      // toda la gente de la pestaña que no se pudo leer.
      return { error: { status: 502, codigo: c.codigo, pestana: m.pestana, pestanas: c.pestanas,
        mensaje: `No pude cosechar la pestaña "${m.pestana}": ${c.mensaje}` } };
    }
    const p = parsearPestana(c.filas, c.encabezado, m.regla_zona);
    for (const zc in (p.chatarraPorZona || {})) {
      chatarraPorZona[zc] = (chatarraPorZona[zc] || 0) + p.chatarraPorZona[zc];
    }
    detallePestanas.push({ pestana: m.pestana, regla_zona: m.regla_zona || null,
                           personas: p.personas.length, descartes: p.descartes,
                           mapa: p.mapa, notas: m.notas || null });
    // Dos pestañas del mismo evento (Pa'l Norte) se FUNDEN por nombre, con el
    // dinero sumado — la misma regla que dos filas dentro de una pestaña.
    for (const per of p.personas) {
      const ya = personas.get(per.clave);
      if (ya) {
        ya.abonado += per.abonado;
        ya.filas += per.filas;
        // 🔴 [CUADRE-1b] EL TOTAL TAMBIÉN SE FUNDE, y en 1a NO se fundía: la
        // fusión sumaba `abonado` y `filas` y se quedaba con el `total` de la
        // PRIMERA pestaña, tirando el de la segunda en silencio. En 1a eso
        // reportaba de menos; aquí ESCRIBIRÍA un total corto. Y el hueco manda:
        // si a cualquiera de las dos le falta el total, la persona queda en
        // null — una suma a la que le falta un sumando es un número que miente.
        ya.total = (ya.total == null || per.total == null) ? null : ya.total + per.total;
        if (!ya.zona && per.zona) ya.zona = per.zona;
        // [BOLETOS-1] El mapa de zonas también se funde: Pa'l Norte reparte a
        // la misma persona entre dos pestañas del mismo evento.
        ya.zonas = ya.zonas || {};
        for (const zz in (per.zonas || {})) ya.zonas[zz] = (ya.zonas[zz] || 0) + per.zonas[zz];
        if (!ya.paquete && per.paquete) ya.paquete = per.paquete;
        if (!ya.talla && per.talla) ya.talla = per.talla;
        ya.pestanas.push(m.pestana);
      } else {
        personas.set(per.clave, { ...per, pestanas: [m.pestana] });
      }
    }
  }

  // ── 2.5 [CUADRE-2a] LA TERCERA FUENTE ────────────────────────────────────
  // El lado-Excel deja de ser «la pestaña» y pasa a ser «la pestaña + el libro
  // de Memo». Mientras no exista, el careo sigue exactamente como estaba: la
  // ausencia de una fuente NO es un error del careo, y decir cuál falta es más
  // útil que tronar.
  const numerologia = await traerNumerologia(eventoId, sb);
  let personasLado = [...personas.values()];
  if (numerologia.personas && numerologia.personas.length) {
    personasLado = fundirNumerologia(personasLado, numerologia.personas);
  } else {
    // Sin tercera fuente, todos vienen de la pestaña — y se dice, para que la
    // pantalla no tenga que adivinar la procedencia por ausencia.
    personasLado = personasLado.map((p) => ({ ...p, fuentes: ['pestana'] }));
  }

  // [BOLETOS-1 adenda] Lo que el sistema cree que se vendió FUERA. Es la casa
  // que la chatarra ya tenía —`stock_ajustes.vendidos_fuera`— y hasta hoy la
  // llenaba una persona a mano. Medido el 20-sep: solo 4 filas en toda la
  // tabla, y las 2 de un evento vivo (calle24) coinciden AL BOLETO con la
  // chatarra de su pestaña. Las dos fuentes decían lo mismo; ahora una sola lo
  // dice sola.
  const ar = await fetch(`${SB_URL}/rest/v1/stock_ajustes?evento_id=eq.${encodeURIComponent(eventoId)}&select=id,zona,vendidos_fuera&limit=2000`, { headers: sb });
  const ajustes = ar.ok ? (await ar.json().catch(() => [])) : [];

  // 3. El lado del sistema.
  const base = await leerBase(eventoId, sb);
  if (base.error) return { error: { status: 502, mensaje: base.error } };

  // ── [CUADRE-5] ¿EL EVENTO ES DE CDMX? ────────────────────────────────────
  // La regla del $0 tecleado depende de si el index puede saber el total
  // completo, y eso depende del venue: en CDMX el avión se cotiza a mano.
  // 🔒 Se le PREGUNTA a `esCDMX` del lib de precios —la misma prueba que el
  // index y el Portal—, no se mira el nombre del evento.
  // 🔒 FAIL-SOFT CONSERVADOR: si el catálogo no se puede leer, `cdmx` va en
  // `null` y `carear` asume CDMX, o sea que NO tapa ningún $0. Ante la duda, la
  // diferencia se sigue viendo.
  let cdmx = null, catalogoError = null;
  try {
    const crudos = await fetchEventosRaw();
    const slug = String(eventoId).split('#')[0];
    const e = Array.isArray(crudos) ? crudos.find((x) => x && x.id === slug) : null;
    if (e) cdmx = esCDMX(e);
    else catalogoError = `"${slug}" no está en el catálogo`;
  } catch (err) { catalogoError = err.message; }

  // 4. Los montones.
  const montones = carear(personasLado, base.viajeros, { cdmx });

  // ── [CUADRE-5] EL TOTAL PENDIENTE SE PISA CON EL PRECIO VIVO ─────────────
  // Los renglones que cayeron en la regla y traen el total del sistema en NULL
  // o en 0 se rellenan con el precio del catálogo por PAQUETE + ZONA.
  //
  // 🔒 SE LE PIDE AL DUEÑO DE LA ARITMÉTICA (`resolverPrecioVenta`), con la
  // puerta `para_careo`. Leer `ev.zonas` aquí habría sido la segunda fórmula de
  // «cuánto cuesta un paquete», y esta casa ya pagó once de ésas.
  // ⚠️ La puerta hace falta porque los dos candados de venta de AUD-2 —el `st`
  // no vendible y «la fecha ya pasó»— se disparan justo en los eventos que se
  // cuadran: medido, `resolverPrecioVenta` rehusaba los cuatro casos probados.
  // 🔒 Y FAIL-SOFT: si no se puede resolver, el renglón se queda `pendiente`
  // con su motivo. Nunca se inventa un número.
  // 🔴 EL CONTEO DE BOLETOS NO ES OPCIONAL (hallazgo de Jane, 23-sep). La
  // pestaña lleva UNA FILA POR BOLETO y el total de la persona es la SUMA de
  // sus filas, así que pisar con el precio de UNA persona pintaría 1/N del
  // total real — rotulado «del catálogo vivo», que es peor que dejarlo vacío.
  // 🔒 Y EL TOTAL DEL GRUPO SE LE PIDE AL DUEÑO (`num_personas: filas` y su
  // `total`), NO se multiplica aquí: medido hoy los cuatro casos dan lineal,
  // pero eso es un hecho de hoy —el hotel por persona cambia con el tipo de
  // cuarto— y `unit × filas` sería mi propia aritmética al lado de la suya.
  // ⚠️ SOLO SE PISA SI TODOS LOS BOLETOS SON DE UNA MISMA ZONA y están todos
  // contados ahí. Con boletos repartidos —o con filas sin zona— el renglón se
  // queda PENDIENTE diciendo por qué: repartirlos entre zonas sin fila que lo
  // diga sería inventar, y ya mordió con Angel.
  for (const fila of (montones.totales_cero_regla || [])) {
    if (fila.sistema_total_origen !== 'pendiente') continue;
    const filas = Math.max(1, Number(fila.filas) || 1);
    const porZona = fila.zonas || {};
    const zonas = Object.keys(porZona);
    const zonaUnica = zonas.length === 1 ? zonas[0] : null;
    const enLaZona = zonaUnica ? Number(porZona[zonaUnica]) || 0 : 0;
    if (filas > 1 && !(zonaUnica && enLaZona === filas)) {
      fila.sistema_total_motivo = zonas.length > 1
        ? `${filas} boletos en ${zonas.length} zonas — se confirma a ojo`
        : `${filas} boletos y ${enLaZona} con zona — se confirma a ojo`;
      // 🔴 [CUADRE-6] UN MOTIVO SIN SU AUSENCIA NO SE VE, y es un hueco
      // PRE-EXISTENTE que destapó el caso del RIDE. La pantalla pinta el motivo
      // **solo si `sistema_total` es null**; cuando la base trae
      // `total_contrato = 0` —que también es «pendiente»— el cero se quedaba y
      // el renglón decía «$0 de la base», tragándose la explicación. Un cero es
      // una afirmación; aquí la verdad es una AUSENCIA.
      fila.sistema_total = null;
      continue;
    }
    try {
      const r = await resolverPrecioVenta({
        evento_id: eventoId, paquete: fila.paquete, zona: fila.zona,
        num_personas: filas, para_careo: true,
      });
      if (r && r.ok && Number.isFinite(Number(r.total))) {
        // ── [CUADRE-6] EL VUELO DE LA PESTAÑA COMPLETA EL TOTAL ──────────────
        // Solo en los renglónes que la REGLA marcó `cdmx_con_vuelo` — la marca
        // la pone `reglaCeroTecleado`, aquí no se vuelve a preguntar si el
        // evento es de CDMX: eso sería la segunda opinión sobre la misma regla.
        //
        // 🔒 Y SE LE PREGUNTA A LA RESPUESTA DEL DUEÑO SI SU TOTAL VA SOBRE UN
        // BOLETO. Medido el 25-sep sobre `edc27`: PLUS trae `zonaP 9100` con
        // `transportCost 0` — el total NO incluye el transporte, así que el
        // vuelo lo COMPLETA. Pero **RIDE trae `zonaP 0` y su total (2900) YA ES
        // el transporte terrestre**: sumarle el vuelo contaría el transporte
        // DOS VECES. El paquete no se adivina por su nombre — se lee del
        // desglose que el dueño devuelve.
        const base = Number(r.total);
        const zonaP = Number(r.desglose && r.desglose.zonaP);
        const vuelo = Number(fila.vuelo);
        if (fila.clase === 'cdmx_con_vuelo') {
          if (!(Number.isFinite(zonaP) && zonaP > 0)) {
            // El total del dueño ES el transporte (RIDE): el renglón se queda
            // pendiente diciendo por qué, en vez de pintar un número doble.
            fila.sistema_total_motivo = 'el total del sistema YA es el transporte '
              + '(paquete sin boleto): sumarle el vuelo lo contaría dos veces — se confirma a ojo';
            fila.sistema_total = null;      // el motivo se ve porque el total es una AUSENCIA
            continue;
          }
          fila.sistema_total = Math.round((base + vuelo) * 100) / 100;
          fila.sistema_total_origen = 'catalogo_mas_vuelo';
          // El rótulo lo arma la pantalla con estos dos datos; aquí viajan por
          // separado para que nadie tenga que re-restar para saber cuánto era
          // el vuelo.
          fila.sistema_total_vuelo = vuelo;
          fila.sistema_total_catalogo = base;
        } else {
          fila.sistema_total = base;
          fila.sistema_total_origen = 'catalogo';
        }
        // Cuántos boletos entraron en ese número. La pantalla LO DICE: un total
        // cuatro veces más grande sin decir que son cuatro boletos se lee como
        // un error de la cuenta.
        fila.sistema_total_boletos = filas;
      } else {
        fila.sistema_total_motivo = (r && r.motivo) || 'el catálogo no dio precio';
        fila.sistema_total = null;
      }
    } catch (err) { fila.sistema_total_motivo = err.message; fila.sistema_total = null; }
  }
  if (catalogoError && montones.cuadre5) montones.cuadre5.catalogo_error = catalogoError;

  return { ok: true, pestanas: detallePestanas, personas: personasLado,
           viajeros: base.viajeros, montones, numerologia,
           chatarraPorZona, ajustes: Array.isArray(ajustes) ? ajustes : [] };
}

// ── traerNumerologia ────────────────────────────────────────────────────────
// Devuelve SIEMPRE un objeto que se puede pintar, nunca una excepción:
//   { configurada:false, motivo }                    — no hay despliegue todavía
//   { configurada:true, parser_pendiente:true, … }   — hay hoja, falta CUADRE-2b
//   { configurada:true, personas, sin_mapeo, … }     — cuando 2b exista
//   { configurada:true, error }                      — la hoja contestó mal
//
// 🔒 NINGUNO DE ESOS ESTADOS TUMBA EL CAREO. Un careo que se cae por una fuente
// que falta deja a Bulma sin la herramienta entera por algo que ni siquiera es
// suyo; y un careo que se cae en silencio sería peor. Se dice el estado y se
// sigue con lo que hay.
async function traerNumerologia(eventoId, sb) {
  // ⏱ EL ORDEN IMPORTA, Y LO IMPUSO EL RELOJ. Primero se preguntan los mapeos
  // (~150 ms) y solo después se cosecha el libro (~2.1 s MEDIDOS contra
  // producción). Al revés —que es como nació— el careo de CUALQUIER evento
  // pagaba esos 2.1 s aunque no tuviera ni un mapeo sembrado: natanael pasó de
  // ~3 s a 5.3-6.0 s en caliente y 10.4 s EN FRÍO, por encima del corte de 10 s
  // de Netlify. Y es el MISMO libro para los 107 eventos.
  //
  // 🔒 No traer lo que no se puede usar no es un atajo: sin un mapeo sembrado
  // para este evento, NINGUNA fila del libro podría carearse aquí — la única
  // salida sería inventarle evento a alguien, que es justo lo que la tuerca
  // prohíbe. Así que el trabajo no se ahorra: es que no lo había.
  const mr = await fetch(`${SB_URL}/rest/v1/numerologia_eventos?activa=is.true&select=nombre_libro,fecha_libro,evento_id,activa&limit=5000`, { headers: sb });
  const mapeos = mr.ok ? (await mr.json().catch(() => [])) : [];
  const lista = Array.isArray(mapeos) ? mapeos : [];
  const deEste = lista.filter((m) => m.evento_id === eventoId);
  if (!deEste.length) {
    return { configurada: true, sin_siembra: true, personas: [], sin_mapeo: [],
      mapeos: lista.length,
      motivo: lista.length
        ? `A «${eventoId}» no le han sembrado ningún mapeo en numerologia_eventos, así que el libro de Memo no se leyó (son ~2 s por careo). Hay ${lista.length} mapeo(s) sembrado(s) para otros eventos.`
        : 'Todavía no se ha sembrado numerologia_eventos, así que el libro de Memo no se leyó. La tabla y su siembra las corre Jane; sin ella ninguna fila del libro podría carearse sin inventarle evento a alguien.' };
  }

  const c = await cosechar({ pestana: PESTANA_LIBRO, fuente: 'numerologia' });
  if (!c.ok && c.codigo === 'SIN_CONFIG') {
    return { configurada: false, motivo: c.mensaje, personas: [], sin_mapeo: [] };
  }
  if (!c.ok) {
    return { configurada: true, personas: [], sin_mapeo: [],
      error: { codigo: c.codigo, mensaje: c.mensaje, pista: c.pista } };
  }

  // El libro, leído con su propio parser (medido de la rejilla real el 20-sep).
  const libro = parsearLibro(c.filas);
  const m = mapearLibro(libro.personas, lista, eventoId);
  return { configurada: true,
    personas: m.personas, sin_mapeo: m.sinMapeo,
    filas_libro: Array.isArray(c.filas) ? c.filas.length : 0,
    bloques: libro.bloques.length, personas_libro: libro.personas.length,
    descartes: libro.descartes, mapeos: lista.length };
}

module.exports = { correrCareo, leerBase, SB_URL };
