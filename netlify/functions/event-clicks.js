// =============================================================================
// event-clicks.js — "LOS MÁS BUSCADOS" del index
//
// [CAT-4] La lista dejó de ser "los más clickeados de toda la vida" y pasó a
// ser "los más clickeados de los ÚLTIMOS 14 DÍAS".
//
// Por qué: el top-10 ordenaba por el acumulado histórico (karolg 4,173 ·
// juniorh 2,313 …), así que estaba PETRIFICADO — un evento nuevo jamás
// alcanzaba a los viejos, y un evento pasado seguía arriba sin un solo click
// en semanas. El contador sí vive: hay decenas de eventos con clicks en 48 h.
// Lo que no vivía era el ranking.
//
// La base la puso Jane (KH): `event_clicks_diario` (event_id, dia, clicks,
// event_name; PK evento+día, `dia` en hora de Monterrey) y la RPC
// `increment_event_click_v2`, que alimenta el acumulado de siempre Y la cubeta
// del día en una sola llamada — sin duplicar la receta del acumulado.
//
//   POST → increment_event_click_v2  (los dos contadores suben juntos)
//   GET  → top 10 por suma de la cubeta diaria en la ventana de 14 días
//
// LA AGREGACIÓN VIVE AQUÍ, no en el cliente: PostgREST no agrupa solo, y esto
// es servidor — la fuente única del ranking. El index solo pinta lo que llega.
//
// ARRANQUE EN FRÍO: la cubeta nace vacía. Mientras la ventana traiga menos de
// 10 eventos, los lugares que faltan se rellenan con el acumulado de siempre
// (sin repetir a los que ya salieron). La sección NUNCA queda en blanco, y en
// ~2 semanas la ventana manda sola. El día del estreno la lista se ve idéntica
// a la de hoy: eso es lo correcto, no un fallo.
//
// Contrato de respuesta INTACTO — `{ top: [{event_id, event_name, clicks, …}] }`.
// `index.html` (refreshTop10 y las badges #1..#10) no se toca.
// =============================================================================

// Migrado al proyecto KameHouse (npgnhsmwpcipxgvfxrho): event_clicks y las RPC
// increment_event_click* viven ahi. Patron de la casa: llaves canonicas
// KAMEHOUSE (sin fallbacks).
const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
const KH_SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const TOP_N = 10;
const DIAS_VENTANA = 14;          // 14 cubetas CONTANDO hoy → hoy-13 .. hoy

// Tope explícito de filas. NO es decorativo: la cubeta guarda una fila por
// evento y por día, así que 107 eventos × 14 días = 1,498 filas — por encima
// del default de 1000 de PostgREST. Sin este límite la suma saldría TRUNCADA y
// en silencio, y un top-10 mal calculado no se le nota a nadie. Si alguna vez
// se toca este techo, abajo se grita en el log en vez de devolver un ranking
// cojo con cara de correcto.
const LIMITE_FILAS = 5000;

function jsonRes(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

// Hoy en hora de México, 'YYYY-MM-DD'. Vía Intl, SIN aritmética de offset —
// mismo patrón que admin-conexiones/marcar-pago. Tiene que ser la misma zona
// que usa la RPC para escribir `dia` (America/Monterrey), o la ventana se
// correría un día contra la cubeta que lee.
function hoyMX() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

// Resta días a una fecha 'YYYY-MM-DD'. Aritmética de CALENDARIO sobre la fecha
// ya resuelta a hora MX (medianoche UTC), no sobre un instante: así el horario
// de verano no puede moverla.
function restarDias(iso, dias) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - dias * 86400000).toISOString().slice(0, 10);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  if (!KH_SB_URL || !KH_SB_KEY) {
    console.error('Missing SUPABASE_URL_KAMEHOUSE or SUPABASE_SERVICE_KEY_KAMEHOUSE env vars');
    return jsonRes(500, { error: 'Server not configured' });
  }

  const headers = {
    apikey: KH_SB_KEY,
    Authorization: `Bearer ${KH_SB_KEY}`,
    'Content-Type': 'application/json'
  };

  // El acumulado de siempre: es el relleno del arranque en frío y la red de la
  // degradación. Se pide de más (no 10) porque hay que descartar a los que la
  // ventana ya colocó antes de quedarse con los que faltan.
  async function traerAcumulado() {
    const url = `${KH_SB_URL}/rest/v1/event_clicks`
      + `?select=event_id,event_name,clicks,updated_at&order=clicks.desc&limit=${TOP_N + 15}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('event_clicks: ' + await res.text());
    return await res.json();
  }

  try {
    if (event.httpMethod === 'POST') {
      const { eventId, eventName } = JSON.parse(event.body || '{}');
      if (!eventId) return jsonRes(400, { error: 'Missing eventId' });

      // [CAT-4] v2: sube el acumulado Y la cubeta del día. Mismo payload.
      const rpcRes = await fetch(`${KH_SB_URL}/rest/v1/rpc/increment_event_click_v2`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_event_id: eventId, p_event_name: eventName || eventId })
      });

      if (!rpcRes.ok) {
        const details = await rpcRes.text();
        console.error('Supabase RPC error:', details);
        return jsonRes(500, { error: 'RPC failed', details });
      }

      return jsonRes(200, { success: true });
    }

    if (event.httpMethod === 'GET') {
      const hoy = hoyMX();
      const desde = restarDias(hoy, DIAS_VENTANA - 1);

      // ── La ventana ──────────────────────────────────────────────────────────
      // Solo cota INFERIOR, a propósito. Una cota superior en `hoy` parece más
      // limpia, pero esta function y Postgres son relojes distintos: a las
      // 23:59 de Monterrey un segundo de desfase dejaría FUERA la cubeta de hoy
      // —la más caliente— por parecer del futuro. Que se colara una fila futura
      // (que la RPC no puede escribir) es un mal muchísimo menor.
      let ventana = null;
      try {
        const url = `${KH_SB_URL}/rest/v1/event_clicks_diario`
          + `?select=event_id,event_name,clicks&dia=gte.${desde}&limit=${LIMITE_FILAS}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error('event_clicks_diario: ' + await res.text());
        const filas = await res.json();

        if (filas.length >= LIMITE_FILAS) {
          console.error(`[event-clicks] TRUNCAMIENTO: la ventana devolvió ${filas.length} filas `
            + `= el tope de ${LIMITE_FILAS}. El top-10 está calculado sobre datos INCOMPLETOS. `
            + `Subir LIMITE_FILAS o agregar en la base.`);
        }

        // Suma por evento. `event_name` puede venir null en algunas filas
        // (la RPC lo hace coalesce), así que gana el primero que traiga nombre.
        const porEvento = new Map();
        for (const f of filas) {
          const acc = porEvento.get(f.event_id) || { event_id: f.event_id, event_name: null, clicks: 0 };
          acc.clicks += f.clicks || 0;
          if (!acc.event_name && f.event_name) acc.event_name = f.event_name;
          porEvento.set(f.event_id, acc);
        }

        ventana = [...porEvento.values()]
          // Desempate por event_id: sin él, dos eventos empatados se
          // intercambian el #4 y el #5 entre refrescos y las badges bailan.
          .sort((a, b) => b.clicks - a.clicks || a.event_id.localeCompare(b.event_id))
          .slice(0, TOP_N)
          .map(r => ({ ...r, fuente: 'ventana' }));
      } catch (e) {
        // Degradación: la ventana se cayó, pero la sección NO se queda en
        // blanco ni devuelve 500. Cae al comportamiento de siempre, gritando.
        console.error('[event-clicks] la ventana de 14 días falló, degradando al acumulado:', e.message);
        ventana = null;
      }

      // ── El relleno del arranque en frío ─────────────────────────────────────
      // `ventana === null` es la degradación (10 de acumulado); una ventana
      // corta es el arranque en frío (los que falten, de acumulado).
      const top = ventana || [];
      if (top.length < TOP_N) {
        const yaEstan = new Set(top.map(r => r.event_id));
        const acumulado = await traerAcumulado();
        for (const r of acumulado) {
          if (top.length >= TOP_N) break;
          if (yaEstan.has(r.event_id)) continue;     // nadie sale dos veces
          top.push({ ...r, fuente: 'acumulado' });
        }
      }

      // `fuente` es ADITIVO: rotula que las filas de relleno traen el acumulado
      // de toda la vida y las de ventana la suma de 14 días. El mismo nombre
      // `clicks` con dos significados es la clase de campo que un día alguien
      // pinta mal; rotulado desde que la mezcla nace, eso no puede pasar
      // callado. `index.html` lo ignora y sigue leyendo solo `event_id`.
      return jsonRes(200, { top });
    }

    return jsonRes(405, { error: 'Method Not Allowed' });
  } catch (err) {
    console.error('event-clicks handler error:', err);
    return jsonRes(500, { error: err.message });
  }
};
