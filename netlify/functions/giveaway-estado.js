// giveaway-estado.js — el estado del sorteo, PÚBLICO y de solo lectura.
//
// La pantalla del sorteo dejó de ser privada: cualquiera entra y ve lo que
// está pasando. Esta function es lo único que necesita para eso.
//
// 🔒 LO QUE NUNCA SALE DE AQUÍ: teléfonos y correos. La respuesta se sirve a
// cualquiera que pida la URL, así que el `select` es una whitelist explícita y
// `ganador_whatsapp` NO está en ella. El teléfono del ganador viaja SOLO por
// giveaway-sortear, que sí exige token.

const G = require('./_lib/giveaway');

// Columnas que SÍ pueden viajar a cualquiera. Whitelist, no lista negra: si
// mañana alguien agrega una columna sensible a la tabla, esto no la filtra
// porque no la nombra.
const COLS_PUBLICAS = 'id,intento,resultado,ganador_nombre,total_participantes,creado_at';

exports.handler = async (event) => {
  const origin = G.corsCheck(event);
  const headers = G.cabeceras(origin, 'GET, OPTIONS');

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return G.json(405, headers, { ok: false, error: 'Método no permitido' });
  if (origin === null) return G.json(403, headers, { ok: false, error: 'Origen no permitido' });

  const falta = G.faltaEnv();
  if (falta) return G.json(500, headers, { ok: false, error: falta });

  const slugQ = encodeURIComponent(G.SLUG);
  let registros = [], sorteos = [];
  try {
    const [rr, rs] = await Promise.all([
      fetch(`${G.SB_URL}/rest/v1/giveaway_registros?slug=eq.${slugQ}&select=id`, { headers: G.sbHeaders() }),
      fetch(`${G.SB_URL}/rest/v1/giveaway_sorteos?slug=eq.${slugQ}&select=${COLS_PUBLICAS}&order=intento.asc`,
        { headers: G.sbHeaders() }),
    ]);
    if (rr.ok) registros = await rr.json().catch(() => []);
    if (rs.ok) sorteos = await rs.json().catch(() => []);
  } catch (e) {
    console.error('[giveaway-estado]', e.message);
    return G.json(502, headers, { ok: false, error: 'No se pudo leer el estado' });
  }

  const giros = (Array.isArray(sorteos) ? sorteos : []).map(s => ({
    id: s.id,
    intento: s.intento,
    resultado: s.resultado,
    nombre: s.ganador_nombre,
    total_participantes: s.total_participantes,
    creado_at: s.creado_at,
  }));

  // El último giro es el de intento más alto, no "el último de la lista": el
  // orden lo pone la base y prefiero no depender de él para algo que se ve en
  // cámara.
  const ultimo = giros.length
    ? giros.reduce((a, b) => (Number(b.intento) > Number(a.intento) ? b : a))
    : null;

  return G.json(200, headers, {
    ok: true,
    total: Array.isArray(registros) ? registros.length : 0,
    // `ahora` viaja para que la página no dependa del reloj del visitante:
    // el contador de 10 minutos y el rótulo de "repetición" se calculan contra
    // ESTE instante, no contra el del celular de quien mira.
    ahora: new Date().toISOString(),
    registro_cerrado: G.registroCerrado(),
    sorteo: G.SORTEO,
    ultimo,
    giros,
  });
};
