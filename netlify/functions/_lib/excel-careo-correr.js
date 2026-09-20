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
  sp.set('select', 'id,nombre,notas,tipo_viajero,zona_boleto,tipo_paquete,abonado_previo,total_contrato');
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
        if (!ya.paquete && per.paquete) ya.paquete = per.paquete;
        if (!ya.talla && per.talla) ya.talla = per.talla;
        ya.pestanas.push(m.pestana);
      } else {
        personas.set(per.clave, { ...per, pestanas: [m.pestana] });
      }
    }
  }

  // 3. El lado del sistema.
  const base = await leerBase(eventoId, sb);
  if (base.error) return { error: { status: 502, mensaje: base.error } };

  // 4. Los montones.
  const montones = carear([...personas.values()], base.viajeros);
  return { ok: true, pestanas: detallePestanas, personas: [...personas.values()],
           viajeros: base.viajeros, montones };
}

module.exports = { correrCareo, leerBase, SB_URL };
