// giveaway-sortear.js — el giro y su resolución. PRIVADA (x-admin-token).
//
// ═══════════════════════════════════════════════════════════════════════════
// EL GANADOR LO ELIGE EL SERVIDOR. SIEMPRE.
//
// La página del sorteo solo ANIMA hacia un nombre que ya vino decidido de acá.
// Es lo único que hace el sorteo defendible: si el navegador escogiera, quien
// tiene la consola abierta escoge. Y como el renglón se INSERTA antes de
// contestar, el giro queda registrado aunque a Memo se le caiga el internet a
// media transmisión — no se puede girar hasta que salga alguien conveniente.
// ═══════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const G = require('./_lib/giveaway');

// Azar de crypto, no Math.random(): en un sorteo con premio, el generador
// tiene que ser el bueno aunque nadie lo vaya a auditar.
function alAzar(n) {
  if (n <= 0) return -1;
  const limite = Math.floor(0xFFFFFFFF / n) * n;   // sin sesgo por módulo
  let x;
  do { x = crypto.randomBytes(4).readUInt32BE(0); } while (x >= limite);
  return x % n;
}

exports.handler = async (event) => {
  const origin = G.corsCheck(event);
  const headers = G.cabeceras(origin, 'POST, OPTIONS');

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return G.json(405, headers, { ok: false, error: 'Método no permitido' });
  if (!origin) return G.json(403, headers, { ok: false, error: 'Origen no permitido' });
  if (!G.tokenAdminValido(event)) return G.json(401, headers, { ok: false, error: 'Token inválido' });

  const falta = G.faltaEnv();
  if (falta) return G.json(500, headers, { ok: false, error: falta });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return G.json(400, headers, { ok: false, error: 'JSON inválido' }); }

  const regBase = `${G.SB_URL}/rest/v1/giveaway_registros`;
  const sorBase = `${G.SB_URL}/rest/v1/giveaway_sorteos`;
  const slugQ = encodeURIComponent(G.SLUG);

  // ── GIRAR ────────────────────────────────────────────────────────────────
  if (body.accion === 'girar') {
    let registros = [], sorteos = [];
    try {
      const [rr, rs] = await Promise.all([
        fetch(`${regBase}?slug=eq.${slugQ}&select=id,nombre,whatsapp`, { headers: G.sbHeaders() }),
        fetch(`${sorBase}?slug=eq.${slugQ}&select=registro_id,resultado,intento`, { headers: G.sbHeaders() }),
      ]);
      if (!rr.ok) throw new Error('registros ' + rr.status);
      registros = await rr.json().catch(() => []);
      sorteos = rs.ok ? (await rs.json().catch(() => [])) : [];
    } catch (e) {
      console.error('[giveaway-sortear] lectura:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo leer el padrón' });
    }

    const total = Array.isArray(registros) ? registros.length : 0;
    if (!total) return G.json(409, headers, { ok: false, error: 'Todavía no hay participantes' });

    // Quedan fuera SOLO los que ya salieron y NO contestaron. Los 'pendiente'
    // también se excluyen: hay un giro vivo sin resolver, y volver a sacar a la
    // misma persona mientras se le marca sería absurdo.
    const quemados = new Set(
      (Array.isArray(sorteos) ? sorteos : [])
        .filter(s => s && (s.resultado === 'no_contesto' || s.resultado === 'pendiente'))
        .map(s => s.registro_id)
    );
    const elegibles = registros.filter(r => r && !quemados.has(r.id));
    if (!elegibles.length) {
      return G.json(409, headers, { ok: false, error: 'Ya se giró a todos los participantes' });
    }

    const ganador = elegibles[alAzar(elegibles.length)];
    const intento = (Array.isArray(sorteos) ? sorteos.length : 0) + 1;

    // Insert directo (sin on_conflict: aquí no hay índice único que provocarlo).
    let creado = null;
    try {
      const r = await fetch(sorBase, {
        method: 'POST',
        headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }),
        body: JSON.stringify({
          slug: G.SLUG,
          registro_id: ganador.id,
          ganador_nombre: ganador.nombre,
          ganador_whatsapp: ganador.whatsapp,
          intento,
          resultado: 'pendiente',
          total_participantes: total,
        }),
      });
      if (!r.ok) throw new Error('insert ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
      const filas = await r.json().catch(() => []);
      creado = Array.isArray(filas) ? filas[0] : null;
    } catch (e) {
      console.error('[giveaway-sortear] insert:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo registrar el giro' });
    }

    return G.json(200, headers, {
      ok: true,
      sorteo_id: creado && creado.id,
      nombre: ganador.nombre,
      whatsapp: ganador.whatsapp,
      intento,
      total_participantes: total,
    });
  }

  // ── RESOLVER ─────────────────────────────────────────────────────────────
  if (body.accion === 'resolver') {
    const id = String(body.sorteo_id || '').trim();
    const resultado = String(body.resultado || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return G.json(400, headers, { ok: false, error: 'sorteo_id inválido' });
    }
    if (resultado !== 'acepto' && resultado !== 'no_contesto') {
      return G.json(400, headers, { ok: false, error: "resultado debe ser 'acepto' o 'no_contesto'" });
    }
    try {
      const r = await fetch(`${sorBase}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }),
        body: JSON.stringify({ resultado }),
      });
      if (!r.ok) throw new Error('patch ' + r.status);
      const filas = await r.json().catch(() => []);
      if (!Array.isArray(filas) || !filas.length) {
        return G.json(404, headers, { ok: false, error: 'Ese giro no existe' });
      }
      return G.json(200, headers, { ok: true, resultado });
    } catch (e) {
      console.error('[giveaway-sortear] resolver:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo guardar el resultado' });
    }
  }

  return G.json(400, headers, { ok: false, error: "accion debe ser 'girar' o 'resolver'" });
};
