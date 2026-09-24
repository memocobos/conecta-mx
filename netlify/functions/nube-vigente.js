// =============================================================================
// nube-vigente — la cotización de transporte a CDMX que rige AHORA (NUBE-1)
// =============================================================================
// GET público, sin auth. Responde:
//   { ok:true, bus:{precio,vigente_hasta}|null, avion:{precio,vigente_hasta}|null }
//
// 🔒 EL INDEX NO LLEVA COPIA. El `2500` tecleado del bus era una copia con fecha
// de caducidad propia —la enfermedad de `flash_promo` y de `var PROMOS`—, y el
// avión no tenía precio ninguno. Aquí el sitio lo PIDE, así que la verdad vive
// en un solo lugar: la tabla que Bulma y Milk llenan cada lunes.
//
// 🔒 SOLO FILAS VIGENTES, y por eso la respuesta puede traer `null`. Una
// cotización vencida NO ES UN PRECIO: quien pregunta cae a su camino de siempre
// (WhatsApp). Pintar un precio vencido es la mentira de NATA con dinero
// enfrente, y aquí se rehúsa en la fuente en vez de confiar en el que pinta.
//
// 🔒 FAIL-SOFT DURO, CAMPO POR CAMPO. Cualquier tropiezo —red, 5xx, JSON raro,
// falta de llaves— contesta `ok:false` con los dos modos en `null`. El sitio
// entiende eso como «no hay precio» y se comporta EXACTAMENTE como hoy. NUNCA
// se devuelve un 502 seco: un error de este endpoint no puede ser un error de
// la página del cliente.
//
// ⚠️ CACHÉ DE CDN OBLIGATORIO, como `viajeros-contador`: esta respuesta la pide
// la ficha de cada evento de CDMX, que es tráfico del negocio. Con 10 minutos
// de `s-maxage`, una captura nueva se ve sola y ninguna visita extra pega a la
// base.
// =============================================================================

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const { vigentes } = require('./_lib/nube');

// Mismo perfil que viajeros-contador: 60 s en el navegador, 10 min en el CDN y
// una hora de `stale-while-revalidate` para que el refresco no le cueste la
// espera a quien caiga justo en el vencimiento.
const CACHE = 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600';

function res(status, cuerpo, extra) {
  return {
    statusCode: status,
    headers: Object.assign({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',   // GET público de solo lectura
    }, extra || {}),
    body: JSON.stringify(cuerpo),
  };
}

// El lector de PostgREST. El lib no arma URLs de Supabase ni elige llaves: la
// puerta a la base es de quien tiene la llave.
function lector() {
  return async (qs) => {
    const r = await fetch(SB_URL + '/rest/v1/' + qs, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
    });
    if (!r.ok) throw new Error('SB ' + r.status);
    return r.json();
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return res(204, {});
  if (event.httpMethod !== 'GET') return res(405, { ok: false, error: 'Method not allowed' });
  // Sin llaves no se inventa nada: se dice que no hay precio.
  if (!SB_URL || !SB_KEY) {
    console.error('[nube-vigente] faltan las llaves de KameHouse');
    return res(200, { ok: false, bus: null, avion: null }, { 'Cache-Control': 'no-store' });
  }
  try {
    // [NUBE-4] `?evento=<slug>` pide la cotización DE ESE EVENTO, con herencia:
    // la propia manda, si no la GENERAL, y `heredado:true` viaja para que el
    // card lo ROTULE. Sin el parámetro se contesta la general, que es lo que
    // pedía NUBE-1 — así el llamador viejo sigue teniendo sentido.
    //
    // ⚠️ LA CACHÉ DEL CDN LLAVEA POR URL COMPLETA, query incluida, así que cada
    // evento tiene su propia entrada y ninguno puede servirle el precio de otro.
    // Eso hay que decirlo porque es lo que hace seguro dejar el mismo `s-maxage`.
    const q = (event.queryStringParameters || {});
    const evento = (typeof q.evento === 'string' && q.evento.trim()) ? q.evento.trim().slice(0, 120) : null;
    const v = await vigentes(lector(), Date.now(), evento);
    return res(200, {
      ok: true,
      evento: evento,
      bus: v.bus || null,
      avion: v.avion || null,
    }, { 'Cache-Control': CACHE });
  } catch (e) {
    console.error('[nube-vigente]', (e && e.message) || e);
    // 🔒 200 con los dos en null, NO un 5xx: el cliente tiene que poder seguir
    // cotizando su viaje aunque esta pieza esté caída. Y `no-store`, para que
    // el CDN no congele diez minutos de «no hay precio» por un tropiezo.
    return res(200, { ok: false, bus: null, avion: null }, { 'Cache-Control': 'no-store' });
  }
};
