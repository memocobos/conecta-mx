// giveaway-lista.js — la lista de participantes para la pantalla del sorteo.
// PRIVADA: x-admin-token contra GIVEAWAY_ADMIN_TOKEN.
//
// 🔒 DEVUELVE NOMBRES Y NADA MÁS. Ni teléfonos ni correos: esta lista se pinta
// en un carrusel que sale EN CÁMARA durante la transmisión. El teléfono del
// ganador viaja solo por giveaway-sortear, y allá se enseña tapado.

const G = require('./_lib/giveaway');

exports.handler = async (event) => {
  const origin = G.corsCheck(event);
  const headers = G.cabeceras(origin, 'GET, OPTIONS');

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return G.json(405, headers, { ok: false, error: 'Método no permitido' });
  // `=== null` y no `!origin`: corsCheck devuelve '' cuando NO vino el header
  // (petición del mismo sitio, legítima) y null cuando el origen es AJENO.
  // Con `!origin` las dos caían en el mismo 403 y el arreglo de _lib no servía
  // de nada — medido: el cambio en la librería solo, no movió una sola línea
  // del resultado.
  if (origin === null) return G.json(403, headers, { ok: false, error: 'Origen no permitido' });
  if (!G.tokenAdminValido(event)) return G.json(401, headers, { ok: false, error: 'Token inválido' });

  const falta = G.faltaEnv();
  if (falta) return G.json(500, headers, { ok: false, error: falta });

  try {
    const r = await fetch(
      `${G.SB_URL}/rest/v1/giveaway_registros?slug=eq.${encodeURIComponent(G.SLUG)}` +
      // [SORTEO-ADMIN-1] Los eliminados NO salen en el carrusel: si esta lista se
      // proyecta en cámara, enseñar a alguien que ya no concursa es peor que un
      // dato de más — es una promesa falsa delante de todos.
      `&eliminado_at=is.null&select=id,nombre&order=creado_at.asc`,
      { headers: G.sbHeaders() }
    );
    if (!r.ok) {
      const d = await r.text().catch(() => '');
      console.error('[giveaway-lista] Supabase', r.status, d.slice(0, 200));
      return G.json(502, headers, { ok: false, error: 'No se pudo leer la lista' });
    }
    const filas = await r.json().catch(() => []);
    const participantes = (Array.isArray(filas) ? filas : []).map(f => ({ id: f.id, nombre: f.nombre }));
    return G.json(200, headers, { ok: true, total: participantes.length, participantes });
  } catch (e) {
    console.error('[giveaway-lista]', e.message);
    return G.json(502, headers, { ok: false, error: 'No se pudo leer la lista' });
  }
};
