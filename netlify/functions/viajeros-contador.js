// =============================================================================
// viajeros-contador — el acumulado histórico de viajeros, para la PORTADA
// =============================================================================
// GET público, sin auth. Responde { ok, total, por_anio: { "2026": N, ... } }.
// Decisión de Memo (20-sep-2026): el index presume los viajeros reales como
// prueba social, con el desglose por año debajo como registro permanente.
//
// ═══ 🔒 EL CRITERIO NO SE GEMELEA: SE LE PREGUNTA AL RESUMEN ════════════════
// El número que Memo bendijo es el que pinta el Resumen, y ése sale de
// `cuentasDeTodos` de `_lib/cuenta-evento`. Aquí se llama A ESA MISMA FUNCIÓN y
// se lee `totales.viajeros` — no se escribe un `select count(*)` propio.
//
// Escribir la cuenta aquí habría sido la fórmula NÚMERO TRECE: la auditoría
// AUD-1 encontró ONCE maneras distintas de decir "cuánto dinero hay", y todas
// eran coherentes consigo mismas hasta que alguien miró dos a la vez. Una
// portada que diga 2,468 mientras el Palacio dice otra cosa es exactamente esa
// enfermedad, y encima a la vista de los clientes.
//
// Medido el 21-sep-2026 contra producción: `totales.viajeros` = 2468, en 742 ms,
// repartido en 88 eventos, y la suma de los por-evento da el mismo 2468.
// El Portal aporta 0 (su tabla de solicitudes está vacía), así que hoy el número
// es en la práctica las filas de `viajeros_evento` — pero eso es un HECHO DE HOY,
// no la regla: la regla es lo que diga la lib, y si mañana el Portal empieza a
// sumar, este contador lo sigue sin tocarse.
//
// ⚠️ `rol` NO es una credencial aquí: es el interruptor con el que la lib decide
// si incluye el mundo migrado (`veMigrados`). Este endpoint no autentica a nadie
// ni recibe el rol de fuera — lo fija en el código, usa su propia llave de
// servicio y publica ÚNICAMENTE dos números. El dinero que la lib calcula de
// paso NO SALE: la respuesta se arma campo por campo, nunca con un spread.
//
// ═══ EL AÑO DE UN VIAJERO ES EL AÑO DE SU EVENTO ════════════════════════════
// Y se busca en cascada, del dato más gobernado al menos:
//   1. `esferas_eventos.fecha_inicio` — la ficha, que es donde vive la fecha.
//   2. el `ds` del catálogo servido — para los que no tienen ficha (melanie no
//      tiene fila en esferas: son 22 viajeros, y su ds dice 2026-08-06).
//   3. `ANIO_A_MANO` — los que no tienen NINGUNA de las dos.
//
// 🔒 El paso 2 existe para no teclear fechas que el sistema ya sabe. melanie se
// resuelve sola por ahí: el encargo la daba por "a mano" y no hace falta.
// =============================================================================

const { cuentasDeTodos } = require('./_lib/cuenta-evento.js');
const { fetchCatalogo } = require('./_lib/catalogo-index.js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// [VIAJEROS-CONTADOR-1] CACHÉ DE CDN, OBLIGATORIO. Esta respuesta la pide la
// PORTADA, que se lleva el tráfico del negocio entero, y el número no necesita
// frescura de segundos: cambia cuando Memo aprieta «Actualizar» en KameHouse.
// Con 10 minutos, cada Actualizar se refleja solo y ninguna visita extra pega a
// la base. `stale-while-revalidate` para que el refresco no le cueste la espera
// a quien caiga justo en el vencimiento.
const CACHE = 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600';

// 🔒 LOS QUE NO TIENEN FECHA EN NINGUNA FUENTE, Y POR QUÉ.
//
// `palnorte` → 2026, POR DECISIÓN DE MEMO (21-sep-2026), tomada con la medición
// delante. Lo que la base dice es que NO tiene fecha: su fila de esferas existe
// pero `fecha_inicio` es null, y su `ds` del catálogo está vacío porque el
// evento va en `proximamente` con «Por confirmar».
//
// ⚠️ Y lo que se midió apuntaba al otro lado, así que queda escrito para que
// nadie lo lea como un descuido: el evento se llama «Tecate Pa´l Norte 2027» y
// sus 232 viajeros se dieron de alta en AGOSTO DE 2026 —después de que pasara
// la edición 2026—. Se le enseñó a Memo con los dos desgloses y eligió 2026.
// Es una decisión firmada, no una inferencia: para cambiarla hace falta su
// palabra otra vez. En cuanto Pa´l Norte tenga fecha en su ficha, esta entrada
// SOBRA y el paso 1 lo resuelve solo — conviene borrarla ese día.
const ANIO_A_MANO = { palnorte: '2026' };

const baseSlug = (s) => (s == null ? '' : String(s).split('#')[0].trim());
const anioDe = (f) => {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(f || ''));
  return m ? m[1] : null;
};

function jsonRes(code, obj, extra) {
  return {
    statusCode: code,
    headers: { ...CORS, 'Content-Type': 'application/json', ...(extra || {}) },
    body: JSON.stringify(obj),
  };
}

// Las fechas de las fichas, en UNA consulta. Best-effort: si esferas no
// contesta, la cascada cae al catálogo y el total no se mueve.
async function fechasDeEsferas(url, key) {
  try {
    const r = await fetch(`${url}/rest/v1/esferas_eventos?select=slug,fecha_inicio&limit=2000`,
      { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    if (!r.ok) return {};
    const filas = await r.json().catch(() => []);
    const out = {};
    for (const f of (Array.isArray(filas) ? filas : [])) {
      if (f && f.slug && f.fecha_inicio) out[baseSlug(f.slug)] = f.fecha_inicio;
    }
    return out;
  } catch (_) { return {}; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return jsonRes(405, { ok: false, error: 'Method not allowed' });

  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const P_URL = process.env.PORTAL_SUPABASE_URL;
  const P_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!KH_URL || !KH_KEY || !P_URL || !P_KEY) {
    return jsonRes(500, { ok: false, error: 'faltan llaves de Supabase' });
  }

  try {
    const [cuenta, fechas, catalogo] = await Promise.all([
      cuentasDeTodos({
        khUrl: KH_URL, khService: KH_KEY, portalUrl: P_URL, portalService: P_KEY,
        // Fijo en el código, nunca de fuera. Ver la nota de arriba.
        rol: 'maestro_roshi',
      }),
      fechasDeEsferas(KH_URL, KH_KEY),
      fetchCatalogo().catch(() => null),
    ]);

    if (cuenta && cuenta.error) return jsonRes(502, { ok: false, error: 'no se pudo leer la cuenta' });

    const total = cuenta && cuenta.totales ? cuenta.totales.viajeros : null;
    // 🔒 `totales.viajeros` es null cuando la lib no pudo clasificar algo
    // (`tot.desconocido`). Un null NO se convierte en 0: la portada prefiere no
    // pintar nada antes que presumir un número que no es. Mismo criterio que
    // «un cero es una afirmación» de AUD-1.
    if (!Number.isFinite(Number(total))) {
      return jsonRes(503, { ok: false, error: 'el total no se pudo determinar' });
    }

    const eventos = (cuenta && cuenta.eventos) || {};
    const por_anio = {};
    const sin_anio = [];
    for (const slug of Object.keys(eventos)) {
      const n = Number(eventos[slug] && eventos[slug].viajeros);
      if (!Number.isFinite(n) || n <= 0) continue;
      const ev = catalogo && catalogo[slug];
      const anio = anioDe(fechas[slug])                    // 1 · la ficha
        || anioDe(ev && ev.ds)                             // 2 · el catálogo
        || ANIO_A_MANO[slug]                               // 3 · a mano, firmado
        || null;
      if (!anio) { sin_anio.push({ slug, viajeros: n }); continue; }
      por_anio[anio] = (por_anio[anio] || 0) + n;
    }

    // 🔒 CANDADO DE CUADRE, EN EL SERVIDOR. Si el desglose no suma el total, el
    // desglose MIENTE y sale con su aviso en vez de fingir. No se corrige solo
    // metiendo el sobrante en un año: eso sería inventar historia.
    const sumaAnios = Object.values(por_anio).reduce((a, b) => a + b, 0);
    const descuadre = Number(total) - sumaAnios;

    return jsonRes(200, {
      ok: true,
      total: Number(total),
      por_anio,
      // Lo que no se pudo fechar. Hoy va vacío; si mañana entra un evento sin
      // ficha ni `ds`, la portada lo sabrá en vez de perderlo en silencio.
      sin_anio: sin_anio.length ? sin_anio : undefined,
      descuadre: descuadre === 0 ? undefined : descuadre,
    }, { 'Cache-Control': CACHE });
  } catch (e) {
    console.error('[viajeros-contador]', (e && e.message) || e);
    return jsonRes(502, { ok: false, error: 'no se pudo contar' });
  }
};
