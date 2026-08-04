// giveaway-registro.js — alta pública en el giveaway. PÚBLICA (sin JWT): la
// credencial no existe; lo que protege es la validación, el cierre por fecha y
// el límite por IP.
//
// El navegador NUNCA escribe a Supabase: escribe esta función con service_role.

const G = require('./_lib/giveaway');

// Máximo de altas por IP en una hora. No es antifraude —una IP compartida son
// muchas personas— es un freno al script que llena la tabla en un minuto.
const MAX_POR_IP_HORA = 5;
const HORA_MS = 3600 * 1000;

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

exports.handler = async (event) => {
  const origin = G.corsCheck(event);
  const headers = G.cabeceras(origin, 'POST, OPTIONS');

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return G.json(405, headers, { ok: false, error: 'Método no permitido' });
  if (!origin) return G.json(403, headers, { ok: false, error: 'Origen no permitido' });

  const falta = G.faltaEnv();
  if (falta) return G.json(500, headers, { ok: false, error: falta });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return G.json(400, headers, { ok: false, error: 'No entendimos los datos, vuelve a intentar' }); }

  // ── Validaciones, EN ESTE ORDEN y con el mensaje que la persona necesita ──
  if (body.acepto !== true) {
    return G.json(400, headers, { ok: false, error: 'Necesitas aceptar las bases para participar' });
  }

  const nombre = String(body.nombre || '').trim().replace(/\s+/g, ' ');
  if (nombre.length < 3) {
    return G.json(400, headers, { ok: false, error: 'Escribe tu nombre completo' });
  }

  // WhatsApp: se quita TODO lo que no sea dígito y deben quedar exactamente 10.
  // Se guarda la versión normalizada — es la que sostiene el índice único, así
  // que "81 1234 5678" y "8112345678" tienen que ser la MISMA fila.
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '');
  if (whatsapp.length !== 10) {
    return G.json(400, headers, { ok: false, error: 'El WhatsApp va a 10 dígitos, sin lada de país' });
  }

  const correo = String(body.correo || '').trim().toLowerCase();
  if (!CORREO_RE.test(correo) || correo.length > 160) {
    return G.json(400, headers, { ok: false, error: 'Revisa tu correo, algo no cuadra' });
  }

  // Cierre por fecha. Va DESPUÉS de las validaciones de forma para que quien
  // llegue tarde con datos malos sepa que llegó tarde, no que su correo falla.
  if (G.registroCerrado()) {
    return G.json(410, headers, { ok: false, error: 'El registro ya cerró' });
  }

  const ip = G.ipDe(event);
  const ua = String((event.headers && event.headers['user-agent']) || '').slice(0, 400);
  const base = `${G.SB_URL}/rest/v1/giveaway_registros`;

  // ── Límite por IP ────────────────────────────────────────────────────────
  try {
    const desde = new Date(Date.now() - HORA_MS).toISOString();
    const r = await fetch(
      `${base}?ip=eq.${encodeURIComponent(ip)}&creado_at=gte.${encodeURIComponent(desde)}&select=id`,
      { headers: Object.assign({}, G.sbHeaders(), { Prefer: 'count=exact' }) }
    );
    if (r.ok) {
      const filas = await r.json().catch(() => []);
      if (Array.isArray(filas) && filas.length >= MAX_POR_IP_HORA) {
        return G.json(429, headers, { ok: false, error: 'Demasiados registros desde aquí. Inténtalo en un rato.' });
      }
    }
    // Si la consulta falla NO se bloquea: el límite es un freno, no un candado.
    // Perder un registro real por una consulta caída sería peor que el abuso.
  } catch (e) {
    console.warn('[giveaway-registro] no se pudo verificar el límite por IP:', e.message);
  }

  // ── INSERT DIRECTO. Jamás on_conflict/upsert: con índice único revienta
  //    con 42P10. El 23505 NO es un error: es el candado (slug, whatsapp)
  //    funcionando, y se traduce a un mensaje que la persona entiende.
  let r;
  try {
    r = await fetch(base, {
      method: 'POST',
      headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }),
      body: JSON.stringify({
        slug: G.SLUG, nombre, whatsapp, correo, ip, user_agent: ua,
      }),
    });
  } catch (e) {
    console.error('[giveaway-registro] red:', e.message);
    return G.json(502, headers, { ok: false, error: 'No pudimos guardar tu registro, vuelve a intentar' });
  }

  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    if (r.status === 409 || /23505/.test(detalle)) {
      return G.json(409, headers, { ok: false, error: 'Ese WhatsApp ya está registrado' });
    }
    console.error('[giveaway-registro] Supabase', r.status, detalle.slice(0, 300));
    return G.json(502, headers, { ok: false, error: 'No pudimos guardar tu registro, vuelve a intentar' });
  }

  // Posición = cuántos van registrados. Se cuenta DESPUÉS del insert, así que
  // el número que ve la persona ya la incluye a ella.
  let posicion = null;
  try {
    const c = await fetch(`${base}?slug=eq.${encodeURIComponent(G.SLUG)}&select=id`, { headers: G.sbHeaders() });
    if (c.ok) {
      const todos = await c.json().catch(() => []);
      if (Array.isArray(todos)) posicion = todos.length;
    }
  } catch (e) { /* el registro YA quedó: sin número, pero guardado */ }

  return G.json(200, headers, { ok: true, posicion });
};
