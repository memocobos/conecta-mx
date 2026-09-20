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
// [CUADRE-1b] La tubería del careo vive en su propio lib: la pantalla la pide
// para MIRAR y `admin-excel-aplicar` la pide para ESCRIBIR. Dos copias no
// serían «dos listas iguales», serían «dos listas que todavía no divergen» — y
// la que divergiera acabaría escribiendo dinero con otro criterio.
const { correrCareo } = require('./_lib/excel-careo-correr');

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

  const careo = await correrCareo(eventoId);
  if (careo.error) {
    const e = careo.error;
    return { statusCode: e.status || 502, headers, body: JSON.stringify({
      error: e.mensaje, codigo: e.codigo, detail: e.detail,
      pestana: e.pestana, pestanas: e.pestanas, evento_id: e.evento_id }) };
  }
  const detallePestanas = careo.pestanas;
  const personas = careo.personas;
  const base = { viajeros: careo.viajeros };
  const r = careo.montones;
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
    excel: { personas: personas.length },
    base: { viajeros: base.viajeros.length },
    ...r,
    totales: { nuevos: r.nuevos.length, pagos: r.pagos.length, bajas: r.bajas.length,
               iguales: r.iguales.length, apartados: r.apartados.length, ambiguos: r.ambiguos.length,
               // [CUADRE-1a] El conteo del séptimo montón vive AQUÍ ADENTRO, con
               // los otros seis. ⚠️ `d.totales` NO es un montón: es este objeto
               // de conteos, y la pantalla lo lee como `const t = d.totales`.
               // Por eso el montón nuevo se llama `totales_contrato` y no
               // `totales` — bautizarlo así habría dejado a los seis de antes
               // sin sus cuentas, en silencio.
               totales_contrato: r.totales_contrato.length,
               totales_contrato_derivados: r.totales_contrato.filter((x) => x.derivado).length,
               // ⚠️ MEDIDO EL 20-SEP SOBRE 10 EVENTOS REALES: 20 de los 78
               // renglones del montón (26 %) traen `excel_total` en CERO
               // EXPLÍCITO — un «$0» tecleado en la celda Total, casi siempre
               // una fórmula que todavía no se llenó. NO se filtran, porque
               // «$0» es un número y filtrarlo sería inventar una regla que
               // Memo no dio; se CUENTAN, para que se vean como la clase que
               // son y no como 20 diferencias sueltas.
               // 🔒 Y queda dicho para CUADRE-1b: APLICAR uno de éstos pondría
               // en cero un total bueno. La fase que escriba tiene que
               // decidirlo a propósito, no heredarlo de aquí.
               totales_contrato_en_cero: r.totales_contrato.filter((x) => x.excel_total === 0).length,
               apartados_zona_sin_talla: zonaSinTalla.length,
               apartados_filas: r.apartados.reduce((a, x) => a + (x.filas || 0), 0) },
  }) };
};
