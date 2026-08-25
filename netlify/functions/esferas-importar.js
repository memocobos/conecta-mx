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
  // [ESF-ARCHIVO-1] Los pasados tienen su PROPIA PUERTA: `archivar`. Ya no hay
  // casilla "incluir pasados" en `sembrar`, y es a propósito — esa casilla los
  // metía como filas NORMALES, publicables, que es justo lo que el veto de
  // archivo existe para impedir. Dos caminos para el mismo evento, uno de ellos
  // capaz de degradarle su entrada del index, no es una opción: es un hoyo.
  //
  //   sembrar   → gobernables VIVOS, pasan el juez, publicables
  //   archivar  → PASADOS, sin juez, `archivado:true`, NO publicables
  const modoArchivo = (accion === 'archivar');
  // [SIEMBRA-DIAG] Lo que la PANTALLA prometió, tal como lo vio quien apretó.
  // El diagnóstico y la siembra son DOS llamadas distintas, y entre una y otra
  // el mundo cambia: un deploy, una publicación de Memo, otra pestaña sembrando.
  // Pasó de verdad el 25-ago: el botón decía "Traer los 10", ESF-LISTA-1 se
  // desplegó en medio, y la siembra —correctamente— metió 8. Nadie mintió; nadie
  // reconcilió. Con esta lista el servidor puede decir QUIÉN faltó y POR QUÉ.
  const esperados = Array.isArray(body.esperados)
    ? body.esperados.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
    : null;
  if (accion !== 'diagnostico' && accion !== 'sembrar' && accion !== 'archivar') {
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
    // En modo archivo el universo es OTRO: TODOS los pasados del catálogo —
    // gobernables o no— que aún no estén en Esferas.
    const todosLosObjetos = dg.gobernables.concat(dg.conBrecha.filter((b) => b.fila));
    const nuevosTodos = modoArchivo
      ? todosLosObjetos.filter((g) => !ya.has(g.slug) && esPasadoFila(g.fila, dia))
      : dg.gobernables.filter((g) => !ya.has(g.slug));
    const pasadosOmitidos = modoArchivo ? [] : nuevosTodos.filter((g) => esPasadoFila(g.fila, dia));
    const nuevos = modoArchivo ? nuevosTodos : nuevosTodos.filter((g) => !esPasadoFila(g.fila, dia));
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
      modo_archivo: modoArchivo,
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
      // [ESF-ARCHIVO-1] `archivado` viaja con la fila, no se deduce después: es
      // una DECISIÓN ("esto es un registro"), no una propiedad calculable — la
      // fecha se edita y el veredicto del juez cambia cada vez que el compilador
      // aprende algo.
      const fila = Object.assign({}, g.fila, { publicado: false, archivado: modoArchivo });
      // `created_at` lo pone la base si no lo sabemos; mandar null lo rompería
      // (es NOT NULL con default).
      if (!fila.created_at) delete fila.created_at;
      // [SIEMBRA-DIAG] try/catch POR FILA. Antes, si `fetch` tronaba en la
      // fila 5 —red, DNS, timeout— el catch de afuera devolvía un 500 pelón y
      // las 4 que YA estaban en la base no se mencionaban en ninguna parte: la
      // pantalla decía error y quien apretaba creía que no había pasado nada.
      // Una tanda que se cae a la mitad tiene que decir por dónde se cayó.
      try {
        const r = await fetch(`${SB_URL}/rest/v1/esferas_eventos`, {
          method: 'POST',
          headers: Object.assign({}, sb, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify(fila),
        });
        if (r.ok) insertados.push(g.slug);
        else fallidos.push({ slug: g.slug, detail: (await r.text()).slice(0, 200) });
      } catch (err) {
        fallidos.push({ slug: g.slug, detail: 'no pude escribir: ' + (err && err.message) });
      }
    }
    // [SIEMBRA-DIAG] La reconciliación. No basta con contar los que entraron:
    // hay que carear contra lo que la pantalla prometió y NOMBRAR a los que no
    // llegaron, con su razón. Un número que baja sin explicación se lee como un
    // fallo del sistema cuando casi siempre es una regla haciendo su trabajo.
    const entraron = new Set(insertados);
    const noTraidos = (esperados || []).filter((sl) => !entraron.has(sl)).map((sl) => {
      const f = fallidos.find((x) => x.slug === sl);
      if (f) return { slug: sl, motivo: 'el insert falló', detail: f.detail };
      if (ya.has(sl)) return { slug: sl, motivo: 'ya estaba en Esferas — no se pisa' };
      const g = dg.gobernables.find((x) => x.slug === sl);
      if (g && !modoArchivo && esPasadoFila(g.fila, dia)) {
        return { slug: sl, motivo: 'ya pasó, y los pasados no se traen — enciende «incluir pasados» si lo quieres' };
      }
      if (dg.conBrecha.some((b) => b.slug === sl)) {
        return { slug: sl, motivo: 'dejó de ser gobernable: el catálogo cambió desde que miraste' };
      }
      return { slug: sl, motivo: 'ya no aparece en el catálogo' };
    });

    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true, resumen, insertados, fallidos,
      // Se manda SIEMPRE que el cliente haya dicho qué esperaba, aunque esté
      // vacía: "no faltó ninguno" es una afirmación que vale la pena leer.
      esperados: esperados ? esperados.length : null,
      no_traidos: esperados ? noTraidos : null,
      // Se dice SIEMPRE, aunque no haya fallidos: un import que solo cuenta
      // éxitos se lee como completo cuando no lo es.
      nota: `${insertados.length} sembrados sin publicar · ${fallidos.length} fallidos · ` +
        `${dg.conBrecha.length} se quedan a mano` +
        (pasadosOmitidos.length ? ` · ${pasadosOmitidos.length} pasados no se trajeron` : '') +
        (modoArchivo ? ' · como ARCHIVO: sin juez y bloqueados para publicar' : ''),
    }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
