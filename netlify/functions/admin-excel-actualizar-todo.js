// =============================================================================
// admin-excel-actualizar-todo — UN CLIC, TODOS LOS EVENTOS (CUADRE-3)
// =============================================================================
// Body: { desde?:0, tanda?:10, confirmar?:false }
// → { ok, total, desde, siguiente, hecho, eventos:[{evento_id, plan, resultado?,
//     error?}], acumulado }
//
// Es lo que Jane corrió a mano por el endpoint el 20-sep (63 eventos, 117
// abonos, $168K, 0 errores), hecho botón. Roles maestro_roshi y bulma.
//
// ═══ EL PATRÓN LO ELIGIÓ EL RELOJ, MEDIDO, NO UNA IDEA ═════════════════════
// Medido contra producción el 20-sep:
//   · 106 eventos con pestaña activa;
//   · ~4.7 s por evento EN SERIE → ~496 s el recorrido. Netlify corta a los 10:
//     no caben ni dos eventos por invocación.
//   · PERO el tiempo lo manda el evento MÁS LENTO, no la cantidad: 2 careos en
//     paralelo tardan 5.4 s, 6 tardan 5.2 s y 12 tardan 4.6 s. El Apps Script
//     no estranguló ni una vez.
//   → TANDAS DE 10 EN PARALELO, con continuación por `desde`: ~11 llamadas de
//     ~5 s, ~60 s el recorrido completo. Sin background function y sin tabla de
//     trabajos — el navegador solo lleva la cuenta de POR DÓNDE VA.
//
// 🔒 Y LA REGLA DE ORO DE 1b, INTACTA: lo único que sube del navegador es un
// ÍNDICE. Jamás montos. Cada tanda corre el careo COMPLETO de sus eventos y
// escribe sobre ESE resultado; la vista previa que el navegador va acumulando
// es para MIRAR y no se le devuelve al servidor. Un JSON viejo diciendo
// «págale $5,000 a Fulano» llegaría firmado por un admin de verdad.
//
// 🔒 LAS TRES REGLAS DE MEMO NO SE REPITEN AQUÍ, y es a propósito: las decide
// `planear` y este handler no toma NINGUNA decisión de dinero. Copiarlas sería
// una segunda copia esperando a divergir. Lo que el global comparte con el
// botón de un evento es literalmente la misma función.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { correrCareo, SB_URL } = require('./_lib/excel-careo-correr');
const { planear, ejecutarPlan } = require('./_lib/excel-aplicar');

const TANDA_DEF = 10;
const TANDA_MAX = 16;

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

  const desde = Math.max(0, parseInt(body.desde, 10) || 0);
  const tanda = Math.min(TANDA_MAX, Math.max(1, parseInt(body.tanda, 10) || TANDA_DEF));
  const confirmar = body.confirmar === true;

  const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const sb = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

  // ── LA LISTA DE EVENTOS ───────────────────────────────────────────────────
  // ⚠️ EL ORDEN TIENE QUE SER ESTABLE ENTRE LLAMADAS. La continuación es un
  // ÍNDICE, así que si la lista se reordenara entre dos tandas, un evento se
  // saltaría y otro se repetiría —y el que se salta no se actualiza sin que
  // nadie lo note—. Se ordena por `evento_id` en el servidor, no se confía en
  // el orden que devuelva la base.
  const r = await fetch(`${SB_URL}/rest/v1/excel_pestanas?activa=is.true&select=evento_id&limit=2000`, { headers: sb });
  if (!r.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No pude leer el mapeo de pestañas', detail: (await r.text()).slice(0, 300) }) };
  const filas = await r.json().catch(() => []);
  const todos = [...new Set((Array.isArray(filas) ? filas : []).map((x) => x.evento_id).filter(Boolean))].sort();
  const lote = todos.slice(desde, desde + tanda);
  const siguiente = desde + lote.length;
  const hecho = siguiente >= todos.length;

  // ── [CUADRE-4] LOS NOMBRES BONITOS, EN UNA SOLA CONSULTA ─────────────────
  // El Resumen enseña «Bruno Mars - The Romantic Tour», jamás `brunomars#0`:
  // un slug en la pantalla del uso diario es lenguaje de la base, no del
  // negocio. Medido el 20-sep: `eventos_meta` cubre los 63 slugs activos
  // (63/63) y es la que lleva el nombre del TOUR — esferas trae el corto
  // («Bruno Mars»), y difieren en 33 de los 63.
  //
  // ⚠️ SU `slug` VA SIN EL `#N`: la tabla dice `brunomars` y el careo habla de
  // `brunomars#0`. Se busca primero la llave entera y luego la base, no al
  // revés — si algún día existiera una fila con el `#N`, ésa es la específica.
  //
  // 🔒 UNA consulta para toda la tanda, no una por renglón. Con 967 abonos eso
  // habría sido la tuerca que rompe el botón: la peor tanda ya mide 8.6 s de
  // los 10 que da Netlify.
  const bases = [...new Set(lote.flatMap((e) => [e, e.split('#')[0]]))];
  let nombres = new Map();
  try {
    const nr = await fetch(`${SB_URL}/rest/v1/eventos_meta?slug=in.(${bases.map(encodeURIComponent).join(',')})&select=slug,nombre`, { headers: sb });
    if (nr.ok) {
      const filasN = await nr.json().catch(() => []);
      nombres = new Map((Array.isArray(filasN) ? filasN : []).map((x) => [x.slug, x.nombre]));
    }
  } catch (_) { /* fails-soft: sin nombre bonito se cae al slug, no se cae el botón */ }
  const nombreDe = (ev) => nombres.get(ev) || nombres.get(ev.split('#')[0]) || null;

  const quien = (auth.user && (auth.user.nombre || auth.user.username || auth.user.correo)) || (auth.user && auth.user.id) || 'careo';
  const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';

  // ── LA TANDA, EN PARALELO ─────────────────────────────────────────────────
  // 🔒 UN EVENTO QUE TRUENA NO TUMBA LA CORRIDA, Y NO SE ESCONDE. Si un Excel
  // mal desplegado detuviera el recorrido, Memo se quedaría sin actualizar los
  // otros 105; y si el fallo se tragara en silencio, creería que ya cuadró
  // todo. Cada evento sale con su plan O con su error, y el error trae su
  // CÓDIGO — «no hay pestaña» y «Google contestó una página» se arreglan en
  // lugares distintos.
  const eventos = await Promise.all(lote.map(async (eventoId) => {
    try {
      const careo = await correrCareo(eventoId);
      if (careo.error) {
        return { evento_id: eventoId, nombre_evento: nombreDe(eventoId), error: { codigo: careo.error.codigo || 'ERROR', mensaje: careo.error.mensaje } };
      }
      const plan = planear(careo, {});
      const pestanaNombre = (careo.pestanas || []).map((p) => p.pestana).join(' + ');
      const base = { evento_id: eventoId, nombre_evento: nombreDe(eventoId), pestanas: pestanaNombre, plan,
        // [CUADRE-4] LAS BAJAS VIAJAN COMO AVISO, NO COMO PLAN. No están en
        // `planear` a propósito —JAMÁS se aplican: una baja es una persona y
        // espera firma—, pero el Resumen tiene que poder NOMBRARLAS. Callarlas
        // las volvería invisibles justo en la pantalla del uso diario.
        // Solo nombre y saldo: lo que hace falta para reconocer a quién.
        bajas: (careo.montones.bajas || []).map((b) => ({ nombre: b.nombre, abonado: b.abonado })),
        numerologia: careo.numerologia ? { configurada: careo.numerologia.configurada,
          sin_siembra: !!careo.numerologia.sin_siembra, personas: (careo.numerologia.personas || []).length } : null };
      if (!confirmar) return base;
      const resultado = await ejecutarPlan({ plan, eventoId, pestanaNombre, quien,
        origin: __origin, authHeader, SB_URL });
      return { ...base, resultado };
    } catch (e) {
      // Ni una excepción suelta: una que escapara tumbaría el `Promise.all` y
      // con él la tanda entera, incluidos los eventos que sí salieron bien.
      return { evento_id: eventoId, nombre_evento: nombreDe(eventoId), error: { codigo: 'EXCEPCION', mensaje: String((e && e.message) || e).slice(0, 300) } };
    }
  }));

  // El acumulado DE ESTA TANDA. El total del recorrido lo suma el navegador
  // —es lo único que tiene sentido que sume él: son números para MIRAR.
  const suma = (f) => eventos.reduce((a, e) => a + f(e), 0);
  const acumulado = {
    eventos: eventos.length,
    con_error: suma((e) => (e.error ? 1 : 0)),
    abonos: suma((e) => ((e.plan && e.plan.abonos) || []).length),
    monto_abonos: suma((e) => ((e.plan && e.plan.abonos) || []).reduce((a, x) => a + x.monto, 0)),
    totales: suma((e) => ((e.plan && e.plan.totales) || []).length),
    altas: suma((e) => ((e.plan && e.plan.altas) || []).length),
    negativas: suma((e) => ((e.plan && e.plan.negativas) || []).length),
    saltados: suma((e) => ((e.plan && e.plan.saltados) || []).length),
    escritos: confirmar ? {
      abonos: suma((e) => ((e.resultado && e.resultado.abonos) || []).length),
      totales: suma((e) => ((e.resultado && e.resultado.totales) || []).length),
      altas: suma((e) => ((e.resultado && e.resultado.altas) || []).length),
      errores: suma((e) => ((e.resultado && e.resultado.errores) || []).length),
    } : null,
  };

  return { statusCode: 200, headers, body: JSON.stringify({
    ok: true, confirmado: confirmar, total: todos.length, desde, siguiente, hecho,
    tanda: lote.length, eventos, acumulado }) };
};
