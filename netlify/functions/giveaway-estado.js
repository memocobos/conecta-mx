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
// `registro_id` se SELECCIONA pero NO se devuelve: sirve solo para calcular el
// folio del ganador aquí adentro. La proyección de abajo lo deja fuera.
const COLS_PUBLICAS = 'id,intento,resultado,ganador_nombre,total_participantes,creado_at,registro_id';

// ── Los rodillos de la tragamonedas ────────────────────────────────────────
// La pantalla necesita nombres y apellidos REALES para que los rodillos giren
// con gente de verdad. Pero el padrón NO se publica: se devuelven las dos
// listas POR SEPARADO y cada una ORDENADA ALFABÉTICAMENTE, lo que rompe la
// correspondencia entre nombre y apellido.
//
// O sea: se ve que "Ana" y "Martínez" están inscritos, pero no que Ana
// Martínez exista. El único nombre completo que sale es el del ganador, que ya
// era público (`ganador_nombre`).
//
// El orden alfabético hace el trabajo de un shuffle SIN aleatoriedad: nada de
// Math.random en este archivo, para que el candado de "el navegador no escoge"
// siga siendo trivial de auditar.
function partirNombre(completo) {
  const partes = String(completo || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return null;
  if (partes.length === 1) return { nombre: partes[0], apellido: '' };
  return { nombre: partes[0], apellido: partes.slice(1).join(' ') };
}

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
      // `nombre` entra al select para poder alimentar los rodillos. Ni
      // `whatsapp` ni `correo` se nombran: la whitelist sigue siendo explícita.
      // El orden de registro define el FOLIO (el 1º en inscribirse es el #1).
      fetch(`${G.SB_URL}/rest/v1/giveaway_registros?slug=eq.${slugQ}`
        + `&select=id,nombre&order=creado_at.asc`, { headers: G.sbHeaders() }),
      fetch(`${G.SB_URL}/rest/v1/giveaway_sorteos?slug=eq.${slugQ}&select=${COLS_PUBLICAS}&order=intento.asc`,
        { headers: G.sbHeaders() }),
    ]);
    if (rr.ok) registros = await rr.json().catch(() => []);
    if (rs.ok) sorteos = await rs.json().catch(() => []);
  } catch (e) {
    console.error('[giveaway-estado]', e.message);
    return G.json(502, headers, { ok: false, error: 'No se pudo leer el estado' });
  }

  // El folio es la POSICIÓN en el orden de registro: el primero en inscribirse
  // es el #1. Se calcula aquí y se sirve ya resuelto; el id del registro nunca
  // sale.
  const filas = Array.isArray(registros) ? registros : [];
  const folioPorId = {};
  filas.forEach((r, i) => { if (r && r.id) folioPorId[String(r.id)] = i + 1; });

  const giros = (Array.isArray(sorteos) ? sorteos : []).map(s => ({
    id: s.id,
    intento: s.intento,
    resultado: s.resultado,
    nombre: s.ganador_nombre,
    // El folio del ganador, para que el tercer rodillo frene en un número de
    // verdad y no en uno decorativo.
    folio: folioPorId[String(s.registro_id)] || null,
    total_participantes: s.total_participantes,
    creado_at: s.creado_at,
  }));

  // Las dos listas de los rodillos, cada una ordenada por su cuenta: quien lea
  // la respuesta ve los nombres y los apellidos inscritos, pero no puede
  // reconstruir quién es quién.
  const partidos = filas.map(r => partirNombre(r && r.nombre)).filter(Boolean);
  const nombresRodillo   = [...new Set(partidos.map(p => p.nombre).filter(Boolean))].sort();
  const apellidosRodillo = [...new Set(partidos.map(p => p.apellido).filter(Boolean))].sort();

  // El último giro es el de intento más alto, no "el último de la lista": el
  // orden lo pone la base y prefiero no depender de él para algo que se ve en
  // cámara.
  const ultimo = giros.length
    ? giros.reduce((a, b) => (Number(b.intento) > Number(a.intento) ? b : a))
    : null;

  return G.json(200, headers, {
    ok: true,
    total: filas.length,
    // Para los rodillos. Listas SEPARADAS y ordenadas: nunca el padrón.
    rodillos: { nombres: nombresRodillo, apellidos: apellidosRodillo, folios: filas.length },
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
