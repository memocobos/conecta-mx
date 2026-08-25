// =============================================================================
// esferas-importar — [ESF-E2] SEMBRAR Esferas desde el `index.html`.
//
// Dos acciones, y la primera NO escribe nada:
//   'diagnostico' → { gobernables:[{slug,byteIgual}], con_brecha:[{slug,brechas}] }
//   'sembrar'     → inserta en `esferas_eventos` los gobernables que falten
//
// ⚠️ SOLO SE SIEMBRA LO QUE PASA EL JUEZ. Un evento entra a Esferas únicamente
// si el compilador reproduce sus VALORES; si perdiera uno solo, se queda a mano
// y aparece en la lista de brechas con el detalle de qué se iba a perder.
// Importar sin ese candado sería sobrescribir eventos buenos con versiones
// degradadas, y el careo demostró que eso pasaba de verdad: `vip` en 131 zonas,
// `ride` en 68 eventos, la multifecha de 8 conciertos.
//
// ⚠️ SEMBRAR NO PUBLICA. Las filas nacen con `publicado:false`: el importador
// pone el dato en la mesa, y el botón de publicar sigue siendo de Memo.
//
// ⚠️ NO SE PISA LO QUE YA EXISTE. Un slug que ya está en `esferas_eventos` se
// SALTA, no se actualiza: si Memo ya lo editó ahí, su versión es la buena — el
// index es lo que se está migrando, no al revés.
//
// Env: SUPABASE_URL_KAMEHOUSE / SUPABASE_SERVICE_KEY_KAMEHOUSE, GITHUB_TOKEN.
// Seguridad: corsCheck + verifyAdminAuthLive(['maestro_roshi']) — los mismos que
// el dry-run de publicación, porque escribe el catálogo.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { diagnosticar, esPasadoFila } = require('./_lib/esferas-import');
const { todayMx } = require('./_lib/esferas-compile');

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'memocobos/conecta-mx';
const FILE = 'index.html';

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ ok: false, error: auth.error }) };

  if (!SB_URL || !SB_KEY) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Faltan llaves de KameHouse' }) };
  if (!GITHUB_TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'GITHUB_TOKEN no configurado' }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) { /* queda {} */ }
  const accion = String(body.accion || 'diagnostico');
  // [ESF-LISTA-1] Los pasados NO se traen por default: un evento que ya ocurrió
  // no se gobierna, se recuerda — y 42 de los 102 del catálogo son pasados, así
  // que traerlos ensucia la lista sin que nadie los vaya a tocar. La casilla
  // existe por si algún día se quieren para historia.
  const incluirPasados = body.incluir_pasados === true;
  if (accion !== 'diagnostico' && accion !== 'sembrar') {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'acción inválida' }) };
  }

  const sb = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  try {
    // 1 · El index de VERDAD, del repo. No una copia local ni un caché: lo que
    //     se está migrando es lo que está publicado.
    const fileRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!fileRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'No pude leer index.html de GitHub', detail: await fileRes.text() }) };
    }
    const file = await fileRes.json();
    const indexHtml = Buffer.from(file.content || '', 'base64').toString('utf8');

    // 2 · El juez.
    const dg = diagnosticar({ indexHtml });
    if (dg.error) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: dg.error }) };

    // 3 · Qué slugs ya viven en Esferas. `limit` explícito: el default de 1000
    //     de PostgREST trunca en silencio, y un slug que no llegue se leería
    //     como "no existe" y se insertaría duplicado.
    const yaRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?select=slug&limit=20000`, { headers: sb });
    if (!yaRes.ok) return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'No pude leer esferas_eventos', detail: await yaRes.text() }) };
    const ya = new Set((await yaRes.json()).map((r) => r.slug));

    const dia = todayMx();
    const nuevosTodos = dg.gobernables.filter((g) => !ya.has(g.slug));
    const pasadosOmitidos = incluirPasados ? [] : nuevosTodos.filter((g) => esPasadoFila(g.fila, dia));
    const nuevos = incluirPasados ? nuevosTodos : nuevosTodos.filter((g) => !esPasadoFila(g.fila, dia));
    const resumen = {
      total: dg.total,
      gobernables: dg.gobernables.length,
      byte_identicos: dg.gobernables.filter((g) => g.byteIgual).length,
      solo_orden: dg.gobernables.filter((g) => !g.byteIgual).length,
      ya_en_esferas: dg.gobernables.length - nuevos.length,
      por_sembrar: nuevos.length,
      // Se dice SIEMPRE lo que se dejó fuera, aunque sea 0. Un tope silencioso
      // se lee como "los trajo todos" cuando no lo hizo.
      pasados_omitidos: pasadosOmitidos.length,
      incluye_pasados: incluirPasados,
      con_brecha: dg.conBrecha.length,
    };

    if (accion === 'diagnostico') {
      return { statusCode: 200, headers, body: JSON.stringify({
        ok: true, resumen,
        gobernables: dg.gobernables.map((g) => ({
          slug: g.slug, byte_igual: g.byteIgual, ya_esta: ya.has(g.slug),
          pasado: esPasadoFila(g.fila, dia),
        })),
        // La lista de brechas VIVA: por evento, qué se perdería. Se recorta a 6
        // por evento para que el cuerpo no explote; el conteo va completo.
        con_brecha: dg.conBrecha.map((b) => ({
          slug: b.slug, motivo: b.motivo || null, cuantas: b.brechas.length,
          brechas: b.brechas.slice(0, 6).map((x) => ({ campo: x.campo, que: x.que })),
        })),
      }) };
    }

    // 4 · Sembrar. INSERT directo, sin `on_conflict` (regla de la casa), y solo
    //     los que faltan: lo que ya está en Esferas no se toca.
    const insertados = [], fallidos = [];
    for (const g of nuevos) {
      const fila = Object.assign({}, g.fila, { publicado: false });
      // `created_at` lo pone la base si no lo sabemos; mandar null lo rompería
      // (es NOT NULL con default).
      if (!fila.created_at) delete fila.created_at;
      const r = await fetch(`${SB_URL}/rest/v1/esferas_eventos`, {
        method: 'POST',
        headers: Object.assign({}, sb, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(fila),
      });
      if (r.ok) insertados.push(g.slug);
      else fallidos.push({ slug: g.slug, detail: (await r.text()).slice(0, 200) });
    }
    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true, resumen, insertados, fallidos,
      // Se dice SIEMPRE, aunque no haya fallidos: un import que solo cuenta
      // éxitos se lee como completo cuando no lo es.
      nota: `${insertados.length} sembrados sin publicar · ${fallidos.length} fallidos · ` +
        `${dg.conBrecha.length} se quedan a mano` +
        (pasadosOmitidos.length ? ` · ${pasadosOmitidos.length} pasados no se trajeron` : ''),
    }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
