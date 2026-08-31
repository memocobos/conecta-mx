// =============================================================================
// precios-vigentes — el precio que regía el día del separo (ROL-HIST-1)
// =============================================================================
// Body: { evento_id: 'omar#1', ambito: 'zonas'|'cheapZonas', zona: 'Platino B',
//         fecha: '2026-08-27' }   ← la fecha, EN REYNOSA (America/Matamoros)
//
// → { ok, evento_id, ambito, zona, fecha,
//     al_abrir: { precio, cerrada, aplicable, vigente_desde },
//     cambios: [ { precio, cerrada, aplicable, hora, vigente_desde } ],
//     sin_historial, anterior_al_historial, dia }
//
// SOLO LEE. No escribe una fila; quien escribe es el gancho de esferas-publicar.
//
// EL PORTERO ES EL DE /rol, y hay que decir lo que eso significa: /rol es una
// página PÚBLICA sin login, y sus dos endpoints (`rol-track`, `rol-subscribe`)
// no piden credencial. Este endpoint copia ese molde por instrucción explícita.
// ⚠️ Consecuencia, dicha para que sea una decisión y no un descuido: cualquiera
// con la URL puede leer el historial de precios de un evento. Los precios
// VIGENTES ya son públicos (viven en el index del sitio); lo que este endpoint
// añade es CUÁNDO cambiaron. Si eso no se quiere público, el cambio es pedirle
// el mismo `verifyAdminAuthLive` que usan los endpoints del Palacio.
//
// UN DÍA PUEDE TENER VARIOS PRECIOS y este endpoint NO elige: devuelve el que
// regía al abrir el día y cada cambio de ese día con su hora. Toda la aritmética
// del calendario vive en `_lib/precios-vigentes`, en funciones puras.
// =============================================================================

const { resolverVigentes, TZ } = require('./_lib/precios-vigentes');
const { fetchEventosRaw } = require('./_lib/catalogo-index');

const AMBITOS = new Set(['zonas', 'cheapZonas']);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!SB_URL || !SB_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false,
      error: 'env vars no configuradas',
      hint: 'Define SUPABASE_URL_KAMEHOUSE y SUPABASE_SERVICE_KEY_KAMEHOUSE en Netlify.' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON inválido' }) }; }

  const evento_id = String(body.evento_id || '').trim();
  const ambito = String(body.ambito || '').trim();
  const zona = String(body.zona || '').trim();
  const fecha = String(body.fecha || '').trim();

  // Los cuatro se exigen. Ninguno tiene default: un default aquí inventaría de
  // qué evento, de qué lista o de qué día se está hablando — y el resultado es
  // un PRECIO que alguien va a cobrar.
  const faltan = [];
  if (!evento_id) faltan.push('evento_id');
  if (!ambito) faltan.push('ambito');
  if (!zona) faltan.push('zona');
  if (!fecha) faltan.push('fecha');
  if (faltan.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Faltan campos: ' + faltan.join(', ') }) };
  }
  if (!AMBITOS.has(ambito)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false,
      error: "ambito desconocido: se espera 'zonas' o 'cheapZonas'", recibido: ambito }) };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'fecha inválida: se espera AAAA-MM-DD' }) };
  }

  try {
    // 1. El historial de ESA zona. Se filtra en el servidor por las tres llaves:
    //    traer el historial entero y filtrar aquí sería la segunda fuente.
    const sp = new URLSearchParams();
    sp.set('select', 'precio,vigente_desde,fuente');
    sp.append('evento_id', 'eq.' + evento_id);
    sp.append('ambito', 'eq.' + ambito);
    sp.append('zona', 'eq.' + zona);
    sp.set('order', 'vigente_desde.asc');
    sp.set('limit', '500');
    const r = await fetch(SB_URL + '/rest/v1/precios_historial?' + sp.toString(), {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
    });
    if (!r.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false,
        error: 'No pude leer el historial', detail: await r.text() }) };
    }
    const filas = await r.json();
    if (!Array.isArray(filas)) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'El historial no vino como lista' }) };
    }

    const res = resolverVigentes(filas, fecha, TZ);
    if (res.error) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: res.error }) };

    // 2. SIN HISTORIAL → la regla de la casa: ausencia = NUNCA CAMBIÓ, así que
    //    el precio de hoy es el que regía ese día. Se dice con su bandera para
    //    que la pantalla lo rotule «precio único» en vez de fingir una fecha.
    //    Si el catálogo tampoco lo sabe, se contesta que no se sabe — no un 0,
    //    que aquí significa «zona cerrada» y sería una mentira con forma de dato.
    let precio_catalogo = null;
    let catalogo_error = null;
    if (res.sin_historial) {
      try {
        // `fetchEventosRaw`, NO `fetchEV`: la segunda existe en el módulo pero
        // NO se exporta. Importarla daba `undefined`, llamarla tronaba, y el
        // `catch` de abajo se tragaba el fallo dejando `al_abrir:null` — o sea,
        // «no sé el precio» disfrazado de respuesta buena. Por eso el error
        // ahora VIAJA en la respuesta en vez de morir en el catch.
        const ev = await fetchEventosRaw();
        const base = evento_id.split('#')[0];
        const idx = evento_id.includes('#') ? Number(evento_id.split('#')[1]) : null;
        const e = (ev || []).find((x) => x && x.id === base);
        let lista = null;
        if (e) {
          lista = (idx != null && Array.isArray(e.multifecha) && e.multifecha[idx])
            ? e.multifecha[idx][ambito]
            : e[ambito];
          // La rampa del catálogo: una fecha sin `cheapZonas` propias hereda las
          // del evento, y el sitio cotiza con ésas. Si aquí no se sigue la misma
          // herencia, /rol diría «no sé» sobre un precio que el sitio SÍ publica.
          if (!Array.isArray(lista) && idx != null && ambito === 'cheapZonas') lista = e.cheapZonas;
        }
        const z = (Array.isArray(lista) ? lista : []).find((x) => x && String(x.n) === zona);
        if (z && Number(z.p) > 0) precio_catalogo = Number(z.p);
      } catch (e) { catalogo_error = String(e && e.message || e); }
      if (precio_catalogo == null && !catalogo_error) catalogo_error = 'el catálogo no trae esa zona';
    }

    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true, evento_id, ambito, zona, fecha, tz: TZ,
      sin_historial: !!res.sin_historial,
      anterior_al_historial: !!res.anterior_al_historial,
      al_abrir: res.sin_historial
        ? (precio_catalogo != null
            ? { precio: precio_catalogo, cerrada: false, aplicable: true, vigente_desde: null, fuente: 'catalogo' }
            : null)
        : res.al_abrir,
      cambios: res.cambios || [],
      dia: res.dia || null,
      filas_historial: filas.length,
      // Un respaldo que no pudo contestar se DICE. Un `al_abrir:null` callado se
      // lee como «no cambió nunca y no vale nada», que son dos mentiras.
      catalogo_error,
    }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
