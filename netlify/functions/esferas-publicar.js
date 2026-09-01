// =============================================================================
// esferas-publicar
//
// Esferas del Dragón, Pieza 2b — la ESCRITURA real al index.
//
// Reusa el compilador compartido (_lib/esferas-compile.js) y, SOLO si la
// validación de AMBOS parsers pasa, hace PUT del index.html al repo (patrón
// github-publish). Si la validación falla → 422 y NO escribe (candado duro).
//
// [WL-1] Al publicar en main, los eventos que quedan A LA VENTA avisan a su
// lista de espera de inmediato (núcleo compartido `_lib/waitlist-core`), con los
// datos de Supabase — NO del catálogo desplegado, que en este instante sigue
// siendo el viejo. Best-effort: si el aviso falla, la publicación ya quedó.
//
// Body opcional: { branch?: string }  (default 'main'). Con un branch != 'main'
// se puede verificar sin tocar main (si la rama no existe, se crea desde main).
//
// Seguridad: corsCheck + verifyAdminAuth(['maestro_roshi']).
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, GITHUB_TOKEN, JWT_SECRET
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { compilarEV, fechaDisplayDeEsfera, extraerEV } = require('./_lib/esferas-compile');
const { zonasDelObjeto, filasDelPublish, _llave } = require('./_lib/precios-vigentes');
const { zonasAForzar, aplicarAgotados, disponiblesPorEvento } = require('./_lib/agotado-derivado');
const { consumeBoleto } = require('./_lib/paquete-viaje');
const { derivarLetreros } = require('./_lib/letrero-derivado');
// [WL-1] El aviso a la lista de espera es del núcleo compartido: el mismo
// correo, el mismo ritmo y el mismo marcado que usan el cron y el botón.
const { notificarEvento, upsertSnapshot, esALaVenta, PRESUPUESTO_PUBLICAR_MS } = require('./_lib/waitlist-core');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'memocobos/conecta-mx';
const FILE = 'index.html';

const ghHeaders = () => ({ Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' });

// Asegura que una rama de prueba exista, creándola desde main si falta. NUNCA
// toca main. Devuelve {created:bool}.
async function ensureBranch(branch) {
  const ref = await fetch(`https://api.github.com/repos/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: ghHeaders() });
  if (ref.ok) return { created: false };
  if (ref.status !== 404) {
    const d = await ref.text();
    throw new Error('No se pudo verificar la rama ' + branch + ': ' + d);
  }
  // Crear refs/heads/<branch> apuntando al HEAD de main.
  const mainRef = await fetch(`https://api.github.com/repos/${REPO}/git/ref/heads/main`, { headers: ghHeaders() });
  const mainData = await mainRef.json();
  if (!mainRef.ok || !mainData.object || !mainData.object.sha) {
    throw new Error('No se pudo leer main para crear la rama de prueba');
  }
  const create = await fetch(`https://api.github.com/repos/${REPO}/git/refs`, {
    method: 'POST',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainData.object.sha }),
  });
  if (!create.ok) {
    const d = await create.text();
    throw new Error('No se pudo crear la rama de prueba ' + branch + ': ' + d);
  }
  return { created: true };
}

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

  if (!SB_KEY) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };
  if (!GITHUB_TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'GITHUB_TOKEN no configurado' }) };

  let reqBody;
  try { reqBody = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON inválido' }) }; }

  const branch = (reqBody && typeof reqBody.branch === 'string' && reqBody.branch.trim())
    ? reqBody.branch.trim()
    : 'main';

  try {
    // 1. Leer TODAS las Esferas (service_role).
    const sbRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?select=*`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!sbRes.ok) {
      const detail = await sbRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Supabase rechazó la query', detail }) };
    }
    const todas = await sbRes.json();
    // ═══ [ESF-ARCHIVO-1] EL VETO DE PUBLICAR ═══════════════════════════════
    // Un evento ARCHIVADO es un registro, no una fuente de verdad. Entró a
    // Esferas SIN pasar el juez —cerrar brechas de eventos muertos no paga— así
    // que su fila está incompleta a propósito, y compilarla DEGRADARÍA su
    // entrada del index.
    //
    // Lo que se degradaría, medido: no las promos (`fusionarConViejo` conserva
    // los campos de primer nivel que el compilador no conoce), sino lo que vive
    // DENTRO de un campo gobernado — `zonas[].requiereViajeros`,
    // `hotel[].k/pp/desc`, `multifecha[].noches/music/hotel`— y cualquier campo
    // gobernado cuyo valor en Esferas difiera del index.
    //
    // El veto vive EN EL SERVIDOR. Esconder el botón no basta: un endpoint
    // abierto detrás de una UI muda es la trampa de COB-MIG-1 al revés.
    const archivados = todas.filter((e) => e && e.archivado === true).map((e) => e.slug);
    const esferasCrudas = todas.filter((e) => !(e && e.archivado === true));

    // [BABA-UX-2] EL LETRERO SE DERIVA AQUÍ, no se cree lo guardado. El
    // `flash_promo` de la ficha es solo la MARCA de qué código es el letrero de
    // este evento; sus números salen de la fila viva de `promos_codigos`. Antes
    // era una copia escrita al encenderlo que nunca se re-sincronizaba, y el
    // sitio podía prometerle al cliente una cifra que el cajero no iba a dar.
    let avisosLetrero = [];
    let esferas = esferasCrudas;
    try {
      const cr = await fetch(`${SB_URL}/rest/v1/promos_codigos?select=*`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      if (!cr.ok) throw new Error(await cr.text());
      const codigos = await cr.json();
      if (!Array.isArray(codigos)) throw new Error('la lista de códigos no vino como lista');
      const d = derivarLetreros(esferasCrudas, codigos);
      esferas = d.esferas; avisosLetrero = d.avisos;
    } catch (e) {
      // 🔒 SI NO SE PUEDEN LEER LOS CÓDIGOS, NO SE PUBLICA. Seguir con la copia
      // vieja sería exactamente el defecto que esta tuerca viene a matar, y
      // encima disfrazado de éxito.
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false,
        error: 'No pude leer los códigos de Baba para derivar los letreros; no se publicó nada.',
        detail: String(e && e.message || e) }) };
    }


    // ═══ [AG-STOCK-1] EL AGOTADO SE DERIVA DEL STOCK ═══════════════════════
    // Caso real (calle24, 31-ago): nueve zonas agotadas A MANO en PLUS y su
    // lista CHEAP entera «a la venta» — el cliente compró boletos de zonas sin
    // inventario. La zona física es UNA y las listas son DOS; el agotado tiene
    // que valer para las dos.
    //
    // TRES CONSULTAS PARA TODO EL LOTE, no tres por evento: un publish compila
    // los ~100 eventos, y pedirle a `_lib/disponibilidad` uno por uno serían
    // trescientas. La REGLA es la misma que la de ese lib —compras −
    // vendidos_fuera − viajeros que consumen— y quién consume se le sigue
    // preguntando a `consumeBoleto`, su dueño, en vez de copiarla.
    //
    // 🔒 UN EVENTO SIN COMPRAS CAPTURADAS NO SE TOCA. Su stock todavía no vive
    // en el Palacio, así que derivar ahí no sería medir sino inventar un cero.
    // Se REPORTA por nombre, como los letreros no emitidos: una omisión callada
    // se lee como «los revisó todos».
    let agotado = { eventos: [], cerradas: 0, sin_stock: [] };
    try {
      const q = (tabla, sel) => fetch(`${SB_URL}/rest/v1/${tabla}?select=${sel}&limit=20000`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }).then((r) => {
          if (!r.ok) throw new Error(tabla + ': ' + r.status);
          return r.json();
        });
      const [compras, ajustes, viajeros] = await Promise.all([
        q('compras', 'evento_id,zona,cantidad'),
        q('stock_ajustes', 'evento_id,zona,vendidos_fuera'),
        q('viajeros_evento', 'evento_id,zona_boleto,tipo_paquete,tipo_viajero'),
      ]);
      const stock = disponiblesPorEvento({ compras, ajustes, viajeros, consumeBoleto });

      esferas = esferas.map((e) => {
        if (!e || !e.slug) return e;
        if (!stock.has(e.slug)) { agotado.sin_stock.push(e.slug); return e; }
        // Las listas de la ficha son texto JSON: se leen, se les aplica y se
        // vuelven a escribir. Si alguna no parsea, ESE evento se deja intacto y
        // se dice — mejor no derivar que derivar sobre una lectura a medias.
        let obj;
        try {
          obj = {
            zonas: e.zonas ? JSON.parse(e.zonas) : null,
            cheapZonas: e.cheap_zonas ? JSON.parse(e.cheap_zonas) : null,
            multifecha: e.multifecha ? JSON.parse(e.multifecha) : null,
          };
        } catch (_) { agotado.sin_stock.push(e.slug + ' (ficha ilegible)'); return e; }

        const { forzar } = zonasAForzar({ obj, gestionado: true, disponibles: stock.get(e.slug) });
        const { obj: nuevo, cambiadas } = aplicarAgotados(obj, forzar);
        if (!cambiadas.length) return e;
        agotado.eventos.push({ slug: e.slug, zonas: cambiadas });
        agotado.cerradas += cambiadas.length;
        const out = Object.assign({}, e);
        if (nuevo.zonas) out.zonas = JSON.stringify(nuevo.zonas);
        if (nuevo.cheapZonas) out.cheap_zonas = JSON.stringify(nuevo.cheapZonas);
        if (nuevo.multifecha) out.multifecha = JSON.stringify(nuevo.multifecha);
        return out;
      });
    } catch (e) {
      // 🔒 SI NO SE PUEDE LEER EL STOCK, NO SE DERIVA — pero SE PUBLICA, con el
      // aviso. Rehusar el publish entero por esto dejaría a Memo sin poder
      // corregir nada; seguir en silencio sería peor que no derivar.
      agotado.error = String((e && e.message) || e);
      console.error('[esferas-publicar] agotado derivado:', agotado.error);
    }

    // 2. Si es rama de prueba, asegurar que exista (sin tocar main).
    if (branch !== 'main') {
      await ensureBranch(branch);
    }

    // 3. GET index.html CON el sha (?ref=<branch> si no es main).
    const getUrl = `https://api.github.com/repos/${REPO}/contents/${FILE}` +
      (branch !== 'main' ? `?ref=${encodeURIComponent(branch)}` : '');
    const fileRes = await fetch(getUrl, { headers: ghHeaders() });
    const fileData = await fileRes.json();
    if (!fileRes.ok || !fileData.content) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'GitHub no devolvió el archivo', detail: fileData && fileData.message }) };
    }
    const sha = fileData.sha;
    const content = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf8');

    // 4. Compilar + validar (lógica compartida; UPSERT: inserta nuevos, reemplaza
    //    existentes en su lugar).
    const { contenidoNuevo, aInsertar, aActualizar, validacion, sin_cambios, medios_en_riesgo } = compilarEV({ esferas, indexHtml: content });

    // 5. CANDADO DURO: sin validación perfecta de AMBOS parsers, NO se escribe.
    //    No se omite por ningún flag.
    if (validacion.kamehouse_ok !== true || validacion.portal_ok !== true || validacion.error) {
      return {
        statusCode: 422,
        headers,
        body: JSON.stringify({ ok: false, error: 'Validación falló — no se escribió nada', validacion }),
      };
    }

    // 5-bis. [MEDIA-GUARD] CANDADO DE MEDIOS: si este publish se llevaría un
    //        mapa, una portada o un lineup que el index vivo SÍ tiene y la
    //        ficha no menciona, se REHÚSA con los nombres.
    //
    //        Se rehúsa, no se avisa. Estas pérdidas ya venían con aviso —el
    //        diff de cada publish las mostró un mes— y nadie las vio: un aviso
    //        ignorable se ignora, el que se rehúsa educa. La salida es escribir
    //        la intención donde vive el dato: cargar el medio EN LA FICHA, o
    //        marcarlo apagado ahí mismo (`mapa_null` y sus hermanos).
    if (Array.isArray(medios_en_riesgo) && medios_en_riesgo.length) {
      const porEvento = {};
      for (const m of medios_en_riesgo) {
        (porEvento[m.slug] = porEvento[m.slug] || []).push(m.campo);
      }
      const nombres = Object.keys(porEvento)
        .map((s) => s + ' (' + porEvento[s].join(', ') + ')').join(' · ');
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Este publish borraría medios que el sitio SÍ tiene y la ficha no: ' + nombres +
            '. No se escribió nada. Cárgalos en la ficha del evento, o si de verdad van fuera, márcalo en la ficha.',
          medios_en_riesgo,
        }),
      };
    }

    // Nada cambió (ni insertar ni actualizar con diferencia real): no hace PUT
    // (evita commit redundante).
    if (sin_cambios) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, branch, sin_cambios: true, publicados: [], commit: null, validacion, archivados, avisos_letrero: avisosLetrero, agotado }),
      };
    }

    // 6. PUT del contenido compilado. publicados = insertados + actualizados.
    const slugs = aInsertar.map(x => x.slug).concat(aActualizar.map(x => x.slug));
    const encoded = Buffer.from(contenidoNuevo, 'utf8').toString('base64');
    const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
      method: 'PUT',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Esferas: publica ${slugs.length} evento(s): ${slugs.join(', ')}`,
        content: encoded,
        sha,
        branch,
      }),
    });
    const putData = await putRes.json();
    if (!putRes.ok || !putData.commit) {
      // sha desactualizado u otro error de GitHub → error claro, sin fingir éxito.
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ ok: false, error: (putData && putData.message) || 'PUT a GitHub falló', validacion }),
      };
    }
    const commit = putData.commit.sha.slice(0, 7);

    // 6-bis. [ROL-HIST-1] EL HISTORIAL DE PRECIOS.
    //
    // Va DESPUÉS del PUT y solo si el PUT salió: el historial anota lo que se
    // publicó, no lo que se intentó. Cubre LOS DOS CAMINOS que compilan —
    // `aInsertar` (el evento entra al index) y `aActualizar` (se reemplaza en su
    // lugar)—, porque los dos escriben precios que un cliente va a ver.
    //
    // Las zonas se leen del EV COMPILADO y del EV VIEJO con el MISMO parser que
    // usa el compilador, no de los objetos serializados: comparar textos sería
    // un tercer criterio al lado de los dos que ya existen.
    //
    // Best-effort en el sentido de que un tropiezo NO deshace el commit — pero
    // NO callado: lo que falle sale en la respuesta. Un hueco en el historial
    // que nadie sabe que existe es peor que uno anunciado, porque el día que
    // /rol conteste «sin historial» nadie va a saber si es que nunca cambió o
    // que este publish no lo anotó.
    //
    // 🔒 SOLO EN `main`. Una publicación a rama de prueba compila precios que
    // NADIE VE: el sitio sirve `main`. Escribirlos al historial los volvería
    // «precios que el cliente vio ese día» —que es literalmente lo que /rol le
    // va a cobrar a alguien— por haber probado algo. El PATCH de `publicado` y
    // el aviso a la lista de espera ya estaban compuertados igual; a este se me
    // fue, y la consecuencia es peor que las otras dos: ésas no inventan dinero.
    let historial = { filas: 0, zonas_miradas: 0 };
    if (branch !== 'main') historial.omitido = 'rama de prueba: no se escribe historial';
    else try {
      const evViejo = extraerEV(content);
      const evNuevo = extraerEV(contenidoNuevo);
      const porId = (arr) => new Map((arr || []).filter((e) => e && e.id).map((e) => [e.id, e]));
      const viejoPorId = porId(evViejo);
      const nuevoPorId = porId(evNuevo);

      const nuevas = [], previas = new Map();
      for (const slug of slugs) {
        const objNuevo = nuevoPorId.get(slug);
        if (!objNuevo) continue;                       // no debería, pero no se inventa
        nuevas.push(...zonasDelObjeto(objNuevo, slug));
        const objViejo = viejoPorId.get(slug);
        if (objViejo) {
          for (const z of zonasDelObjeto(objViejo, slug)) previas.set(_llave(z), z.precio);
        }
      }
      historial.zonas_miradas = nuevas.length;

      if (nuevas.length) {
        // La ÚLTIMA fila de cada zona tocada. Se pide acotado a los eventos de
        // este publish: traerse el historial entero para comparar en memoria
        // crecería con la tabla y no con el trabajo.
        const ids = [...new Set(nuevas.map((z) => z.evento_id))];
        const inVal = '(' + ids.map((x) => '"' + String(x).replace(/"/g, '') + '"') + ')';
        const hr = await fetch(`${SB_URL}/rest/v1/precios_historial?select=evento_id,ambito,zona,precio,vigente_desde` +
          `&evento_id=in.${encodeURIComponent(inVal)}&order=vigente_desde.asc&limit=5000`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        });
        if (!hr.ok) throw new Error('no pude leer el historial: ' + await hr.text());
        const filasHist = await hr.json();
        if (!Array.isArray(filasHist)) throw new Error('el historial no vino como lista');
        const ultimas = new Map();
        for (const f of filasHist) ultimas.set(_llave(f), f);   // asc → la última gana

        const ahora = new Date();
        const aInsertarHist = filasDelPublish({
          nuevas, ultimas, previas,
          ahoraISO: ahora.toISOString(),
          // ⚠️ LA LÍNEA BASE NO AFIRMA CUÁNDO EMPEZÓ EL PRECIO VIEJO — eso no se
          // sabe, y el historial no tiene dónde decir «no sé». Lo único que se
          // afirma es que ese precio seguía puesto hasta este publish, así que
          // se pone UN SEGUNDO antes del cambio: lo mínimo que la ordena antes
          // sin inventar una fecha de inicio.
          //
          // Va con `fuente:'publish'`, IGUAL que el cambio, y no con un valor
          // propio: la tabla tiene `CHECK (fuente IN ('backfill-git','publish'))`
          // y cualquier otra cosa la rechaza fila por fila. O sea que la línea
          // base y el cambio observado NO se distinguen por su fuente — se
          // distinguen por el orden y por ese segundo. Recuperar la distinción
          // cuesta un ALTER de una línea; mientras no exista, no se emite un
          // valor que la tabla no acepta.
          //
          // Quien la LEA no se confunde igualmente: una consulta de una fecha
          // anterior contesta ese precio CON la bandera `anterior_al_historial`,
          // que es exactamente «esto es lo más viejo que sabemos», no «esto
          // regía ese día».
          vigenteDesdeBase: new Date(ahora.getTime() - 1000).toISOString(),
        });

        if (aInsertarHist.length) {
          const ins = await fetch(`${SB_URL}/rest/v1/precios_historial`, {
            method: 'POST',
            headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
                       'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify(aInsertarHist),
          });
          if (!ins.ok) throw new Error('no pude escribir el historial: ' + await ins.text());
        }
        historial.filas = aInsertarHist.length;
      }
    } catch (e) {
      historial.error = String(e && e.message || e);
      console.error('[esferas-publicar] historial de precios:', historial.error);
    }

    // 7. PATCH best-effort publicado=true SOLO en main. Si falla, NO error: el
    //    commit ya quedó. En ramas de prueba NO se marca publicado.
    if (branch === 'main') {
      try {
        const inVal = '(' + slugs.map(s => `"${s}"`).join(',') + ')';
        await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=in.${encodeURIComponent(inVal)}`, {
          method: 'PATCH',
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ publicado: true }),
        });
      } catch (_) { /* el commit ya quedó; el marcado es secundario */ }
    }

    // 8. [WL-1] EL AVISO A LA LISTA DE ESPERA. Publicar es un acto deliberado
    //    del dueño: si el evento queda A LA VENTA, su lista se entera AHORA y no
    //    mañana a las 8. Vale también para el que NACE a la venta — decisión de
    //    Memo: la siembra callada de GR-8 protege de lo que el vigilante
    //    DESCUBRE solo, no de lo que el dueño publica a propósito.
    //
    //    Los datos salen de la fila de Supabase que se acaba de compilar, NO del
    //    catálogo desplegado: el index del sitio todavía es el viejo (el deploy
    //    va detrás de este commit), así que preguntarle diría "no existe" o
    //    daría el estado anterior. La fecha se pide a la MISMA función que la
    //    compila (fechaDisplayDeEsfera), para que el correo diga lo que el sitio.
    //
    //    Best-effort y con presupuesto corto: el admin está esperando esta
    //    respuesta. Lo que no alcance a salir se queda pendiente y lo sana el
    //    cron — nadie recibe dos veces (`notificado` se marca fila por fila).
    let aviso = null;
    if (branch === 'main') {
      aviso = { eventos: 0, enviados: 0, restantes: 0 };
      try {
        const porSlug = new Map((esferas || []).map(e => [e.slug, e]));
        const finAviso = Date.now() + PRESUPUESTO_PUBLICAR_MS;
        for (const slug of slugs) {
          const esfera = porSlug.get(slug);
          if (!esfera || !esALaVenta(esfera.status)) continue;   // 'proximamente', agotado, etc. → nada
          const queda = finAviso - Date.now();
          if (queda <= 0) break;
          const r = await notificarEvento({
            evento_id: slug,
            nombre: esfera.nombre || slug,
            fecha: fechaDisplayDeEsfera(esfera),
            venue: esfera.venue || '',
            presupuestoMs: queda,
          });
          if (r.total > 0) aviso.eventos++;
          aviso.enviados += r.enviados;
          aviso.restantes += r.restantes;
          // Sella el snapshot en el estado publicado: el cron no debe ver una
          // transición por algo que este endpoint ya avisó.
          try { await upsertSnapshot([{ id: slug, st: esfera.status || '' }]); } catch (_) {}
        }
      } catch (e) {
        // El evento YA se publicó; un tropiezo del aviso no lo deshace. Queda
        // pendiente en la lista y el cron lo sana.
        aviso.error = e.message;
        console.error('[esferas-publicar] aviso a lista de espera:', e.message);
      }
    }

    return {
      statusCode: 200,
      headers,
      // [ESF-ARCHIVO-1] Se dice SIEMPRE, aunque sea 0: un veto callado se lee
      // como "los publicó todos" cuando no lo hizo.
      // [BABA-UX-2] Los letreros que NO se emitieron van EN LA RESPUESTA, con su
      // motivo y su slug. Un letrero que desaparece en silencio es la misma
      // familia que un medio perdido: se dice, aunque la publicación salga bien.
      body: JSON.stringify({ ok: true, branch, publicados: slugs, commit, validacion, aviso, archivados, avisos_letrero: avisosLetrero, historial, agotado }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
