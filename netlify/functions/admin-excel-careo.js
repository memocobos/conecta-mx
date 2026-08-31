// =============================================================================
// admin-excel-careo — los seis montones (EXCEL-BOTÓN-1b · EXCEL-CAREO-FIX-1)
// =============================================================================
// Body: { evento_id: 'straykids#0' }
// → { ok, evento_id, pestanas:[...], excel:{personas,descartes,mapa}, base:{n},
//     nuevos:[], pagos:[], bajas:[], iguales:[], apartados:[], ambiguos:[] }
//
// FASE 1: SOLO LEE Y COMPARA. No escribe una sola fila, ni marca las bajas.
// Aplicar es tuerca aparte, y tiene que serlo — una baja es una persona.
//
// Junta tres cosas que viven en tres lugares:
//   · qué pestañas son de este evento  → `excel_pestanas` (KameHouse)
//   · las filas del Excel              → el Apps Script, vía _lib/cosecha-excel
//   · los viajeros del sistema         → `viajeros_evento` + `abonos_viajero`
//
// Seguridad: mismo molde que admin-excel-cosechar. Roles maestro_roshi y bulma.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { cosechar } = require('./_lib/cosecha-excel');
const { parsearPestana, carear, normalizarNombre } = require('./_lib/excel-careo');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

// El lado del sistema: los viajeros del evento con su abonado ya sumado.
//
// ⚠️ EL FILTRO DE `notas` VA EN DOS MITADES. `notas=not.ilike.*ya no aparece*`
// se traga las filas con `notas` NULL sin ruido: en Postgres `NULL not ilike x`
// es NULL, y NULL no pasa un filtro. Mordió a Jane en SQL el 30-ago y la gemela
// de PostgREST es exacta. Se dicen las dos: o es NULL, o no casa.
//
// ⚠️ Y `tipo_viajero`: cuentan los que son `null` o 'cliente'. Los demás
// (coordinador, creadora…) no son viajeros que el Excel liste.
async function leerBase(eventoId) {
  const sb = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  const enc = encodeURIComponent;
  const sp = new URLSearchParams();
  sp.set('select', 'id,nombre,notas,tipo_viajero,zona_boleto,tipo_paquete,abonado_previo');
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
  // NULL desaparezca — en SQL y en PostgREST, `NULL not ilike x` es NULL y la
  // fila se va sin ruido. Aquí es al revés y hay que decirlo igual: sin el
  // `|| ''`, `null.toLowerCase()` truena.
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
  })) };
}

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin', 'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }
  const eventoId = (typeof body.evento_id === 'string') ? body.evento_id.trim() : '';
  if (!eventoId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta evento_id' }) };

  const sb = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

  // 1. ¿Qué pestañas son de este evento? Puede haber varias (Pa'l Norte), y una
  //    puede traer regla de zona (Corona Capital).
  const mr = await fetch(`${SB_URL}/rest/v1/excel_pestanas?evento_id=eq.${encodeURIComponent(eventoId)}&activa=is.true&select=pestana,regla_zona,notas`, { headers: sb });
  if (!mr.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No pude leer el mapeo de pestañas', detail: await mr.text() }) };
  const mapeos = await mr.json().catch(() => []);
  if (!Array.isArray(mapeos) || !mapeos.length) {
    // 404 y con nombre: es algo que el admin puede obrar (sembrar el mapeo),
    // no un error del sistema.
    return { statusCode: 404, headers, body: JSON.stringify({
      error: `No hay ninguna pestaña mapeada a "${eventoId}". Se siembra en excel_pestanas.`,
      codigo: 'SIN_MAPEO', evento_id: eventoId }) };
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
      return { statusCode: 502, headers, body: JSON.stringify({
        error: `No pude cosechar la pestaña "${m.pestana}": ${c.mensaje}`,
        codigo: c.codigo, pestana: m.pestana, pestanas: c.pestanas }) };
    }
    const p = parsearPestana(c.filas, c.encabezado, m.regla_zona);
    detallePestanas.push({ pestana: m.pestana, regla_zona: m.regla_zona || null,
                           personas: p.personas.length, descartes: p.descartes,
                           mapa: p.mapa, notas: m.notas || null });
    // Dos pestañas del mismo evento (Pa'l Norte) se FUNDEN por nombre, con el
    // dinero sumado — la misma regla que dos filas dentro de una pestaña.
    for (const per of p.personas) {
      const ya = personas.get(per.clave);
      if (ya) { ya.abonado += per.abonado; ya.filas += per.filas; }
      else personas.set(per.clave, { ...per });
    }
  }

  // 3. El lado del sistema.
  const base = await leerBase(eventoId);
  if (base.error) return { statusCode: 502, headers, body: JSON.stringify({ error: base.error }) };

  // 4. Los seis montones.
  const r = carear([...personas.values()], base.viajeros);
  // [EXCEL-CAREO-FIX-1] EL CUADRE CONTRA EL CONTEO A MANO. La clase se
  // descubrió como «zona real + $0 + sin talla» (141 filas contadas a mano el
  // 31-ago), pero el montón se llavea SOLO por el dinero en cero: quien no pagó
  // pero sí puso talla debe igual. Este número dice cuántos apartados cumplen
  // además las otras dos condiciones, para poder carear un conteo contra el
  // otro en vez de suponer que hablan de lo mismo.
  const zonaSinTalla = r.apartados.filter((a) => a.zona && !a.talla);
  return { statusCode: 200, headers, body: JSON.stringify({
    ok: true, evento_id: eventoId,
    pestanas: detallePestanas,
    excel: { personas: personas.size },
    base: { viajeros: base.viajeros.length },
    ...r,
    totales: { nuevos: r.nuevos.length, pagos: r.pagos.length, bajas: r.bajas.length,
               iguales: r.iguales.length, apartados: r.apartados.length, ambiguos: r.ambiguos.length,
               apartados_zona_sin_talla: zonaSinTalla.length,
               apartados_filas: r.apartados.reduce((a, x) => a + (x.filas || 0), 0) },
  }) };
};
