// =============================================================================
// admin-waitlist-notify.js — LA PUERTA MANUAL de la lista de espera (WL-2)
//
// El botón "Notificar ahora" de Kamehouse → Lista de espera entra POR AQUÍ.
//
// Por qué existe esta función y no un `?force=true` en `waitlist-notify`:
// esa otra es una función PROGRAMADA (netlify.toml la corre a las 14:00 UTC), y
// Netlify BLOQUEA su invocación HTTP antes de que el handler corra. Su rama
// force nació el 15-may-2026 en el MISMO commit que le puso el `schedule`
// (2396a2f): el candado y la puerta llegaron juntos, así que esa rama jamás fue
// alcanzable en producción — el botón devolvía 403 de plataforma, no del código.
// WL-2 retiró esa rama muerta y la puerta vive aquí, en una función NORMAL.
//
// Regla de WL-1, intacta: el correo, el ritmo, el presupuesto y el marcado
// viven en `_lib/waitlist-core`. Aquí NO se copia ni una línea de plantilla —
// solo se decide a QUIÉN toca avisarle y se llama al mismo núcleo que usan el
// cron (waitlist-notify auto) y el publicar (esferas-publicar).
//
// Body JSON: { evento_id, codigo?, descuento?, horas? }   — familia admin-*.
//   - evento_id: slug del evento (obligatorio).
//   - codigo/descuento/horas: código de descuento opcional. Si llegan los TRES
//     y son válidos, el correo incluye el bloque amarillo; si no, va el normal.
//
// Seguridad: corsCheck + verifyAdminAuthLive con los mismos roles que exigía la
// rama force y que ya exige admin-waitlist: maestro_roshi, bulma, milk.
//
// ⚠️ Esta puerta manda correo DE VERDAD (CORREOS_MODO real, sin red debajo),
//    pero SOLO cuando alguien pica el botón. Los arneses se corren con el núcleo
//    mockeado — nunca contra Resend.
//
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const {
  sb, notificarEvento, upsertSnapshot, PRESUPUESTO_CRON_MS,
} = require('./_lib/waitlist-core');

// Espejo del gate de la pantalla de Waitlist (admin-waitlist.js) y de los roles
// que exigía la rama force retirada. Se leyeron de ahí, no se inventaron.
const ROLES_ADMIN = ['maestro_roshi', 'bulma', 'milk'];
const SLUG_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const CODIGO_RE = /^[A-Z0-9_-]{2,24}$/;

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const bad = (c, m) => ({ statusCode: c, headers, body: JSON.stringify({ ok: false, error: m }) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return bad(405, 'Method not allowed');
  if (!__origin) return bad(403, 'Origen no permitido');

  const auth = await verifyAdminAuthLive(event, ROLES_ADMIN);
  if (!auth.valid) return bad(auth.status, auth.error);

  if (!process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE) {
    return bad(500, 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado');
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return bad(400, 'JSON inválido'); }

  const eventoId = String(body.evento_id || '').trim();
  if (!SLUG_RE.test(eventoId)) return bad(400, 'evento_id inválido');

  // Mismas reglas de validación que traía la rama force: si algo no cuadra, el
  // correo sale SIN promo en vez de salir con un bloque a medias.
  const codigo = String(body.codigo || '').trim().toUpperCase().slice(0, 24);
  const descuento = parseInt(body.descuento, 10);
  const horas = parseInt(body.horas, 10);
  const promo = (CODIGO_RE.test(codigo)
                 && Number.isFinite(descuento) && descuento > 0 && descuento < 100
                 && Number.isFinite(horas) && horas > 0 && horas <= 168)
    ? { codigo, descuento, horas } : null;

  // El nombre del evento sale del primer registro de la lista (evento_nombre
  // quedó guardado al subscribirse). Sin lista no hay a quién avisarle.
  let row;
  try {
    const rs = await sb(`eventos_waitlist?evento_id=eq.${encodeURIComponent(eventoId)}&select=evento_nombre&limit=1`);
    row = rs && rs[0];
  } catch (e) { return bad(502, 'SB error: ' + e.message); }
  if (!row) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sent: 0, total: 0, note: 'Lista vacía' }) };

  const r = await notificarEvento({
    evento_id: eventoId, nombre: row.evento_nombre, fecha: '', venue: '', promo,
    presupuestoMs: PRESUPUESTO_CRON_MS,
  });

  // Sella el evento en el snapshot para que el cron no vuelva a dispararlo.
  try {
    // [GR-9] Mismo patrón de la casa que upsertSnapshot: sin merge-duplicates.
    await upsertSnapshot([{ id: eventoId, st: '' }]);
  } catch {}

  // `sent`/`total` conservan su nombre viejo: los lee el modal de Kamehouse.
  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      ok: true, mode: 'force', evento_id: eventoId,
      sent: r.enviados, total: r.total, fallidos: r.fallidos, restantes: r.restantes,
    }),
  };
};
