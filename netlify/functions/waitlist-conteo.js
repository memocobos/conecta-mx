// netlify/functions/waitlist-conteo.js
//
// [HER-1h-E] CUÁNTA GENTE ESPERA CADA EVENTO. Nada más.
//
// 🔒 SOLO CONTEOS. Ni un nombre, ni un correo, ni una fecha de registro. Este
// endpoint es PÚBLICO —lo consume `diseno.html`, que no tiene sesión— y la
// regla de la casa es que los 400 correos de la lista de espera no salen de
// KameHouse. Un conteo agregado de un evento público no dice nada de nadie;
// una lista sí. Por eso la proyección es `evento_id` y se cuenta AQUÍ.
//
// 🔒 Y NUNCA SE TECLEA A MANO. El cartel enseña este número o no enseña
// ninguno: un "ya somos 300" escrito a ojo es una cifra inventada en una pieza
// publicada. Postura firmada por Jane.
//
// Público pero con ORIGEN restringido, igual que `waitlist-subscribe`: la
// whitelist de verify-admin cubre conectareynosa.mx, www y los previews.
//
// Env: SUPABASE_SERVICE_KEY_KAMEHOUSE.

const { corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

exports.handler = async function (event) {
  // `corsCheck` devuelve TRES cosas: '' (misma-origen, sin header), el origen
  // (permitido) o null (prohibido). Ver el contrato en `_lib/verify-admin`.
  const __origin = corsCheck(event);
  const H = {
    // Solo hay eco cuando hay un origen real que hacerle eco. En misma-origen
    // el navegador ni siquiera mira esta cabecera.
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
    // Un conteo de hace un minuto sirve; uno de hace una hora ya no.
    'Cache-Control': 'public, max-age=60',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  // 🔒 `=== null`, NO `!__origin`. Éste era el bug: `diseno.html` pide el conteo
  // con un GET mismo-origen, y el navegador NO manda `Origin` en un GET
  // mismo-origen — así que `!__origin` rechazaba a la única página que lo usa.
  // Reproducido en producción: GET → 403, POST al MISMO endpoint → 405 con el
  // origen de vuelta. Cambiando solo el método pasaba la guarda.
  if (__origin === null) return { statusCode: 403, headers: H, body: JSON.stringify({ ok: false, error: 'Origen no permitido' }) };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: H, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }
  if (!SB_KEY) return { statusCode: 500, headers: H, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };

  try {
    // 🔒 LA PROYECCIÓN ES EL CANDADO: solo `evento_id` y `notificado` salen de
    // la base. Ni siquiera llegan a este proceso el nombre ni el correo, así
    // que no hay forma de que se escapen por un descuido de serialización.
    //
    // `limit` explícito: el default de 1000 de PostgREST trunca EN SILENCIO, y
    // un conteo truncado es un número más chico que la verdad — justo el error
    // que nadie nota. Con 438 filas hoy sobra, pero el candado es por el día
    // que no sobre.
    const r = await fetch(
      `${SB_URL}/rest/v1/eventos_waitlist?select=evento_id,notificado&limit=50000`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!r.ok) {
      return { statusCode: 502, headers: H, body: JSON.stringify({ ok: false, error: 'Supabase rechazó la consulta' }) };
    }
    const filas = await r.json();
    if (!Array.isArray(filas)) {
      return { statusCode: 502, headers: H, body: JSON.stringify({ ok: false, error: 'Respuesta inesperada' }) };
    }
    const conteos = {};
    for (const f of filas) {
      const id = String((f && f.evento_id) || '').trim();
      if (!id) continue;
      if (!conteos[id]) conteos[id] = { total: 0, esperando: 0 };
      conteos[id].total++;
      if (!f.notificado) conteos[id].esperando++;
    }
    return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, conteos, filas: filas.length }) };
  } catch (e) {
    return { statusCode: 502, headers: H, body: JSON.stringify({ ok: false, error: 'Error consultando la lista' }) };
  }
};
