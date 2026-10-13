// =============================================================================
// esferas-cancelar — CANCELAR EVENTO, el botón (CANCEL-UI-1, 12-oct-2026).
//
// Palabra de Memo: «ajusta todo para que sea a un solo botón y haga todo
// cancelar evento, y que después confirme realmente deseas cancelar evento».
// Nació de CANCEL-1 (titodoble + natanael), donde estos pasos fueron SQL de
// Jane; hoy son apretables.
//
// LO QUE HACE (en este orden, y el orden es parte del diseño):
//   1. ARCHIVA la ficha (`archivado=true, publicado=false`). Va PRIMERO porque
//      el publish lee TODAS las esferas y solo respeta `archivado`
//      (ESF-ARCHIVO-1): despublicar sin archivar deja la re-inserción armada.
//   2. Apaga las PESTAÑAS del careo (`excel_pestanas.activa=false`) con nota
//      ANEXADA — el careo deja de cosechar un evento muerto; los reembolsos
//      van por Yamcha, no por careo.
//   3. Apaga los RECORDATORIOS de pago de /rol (`rol_recordatorios.active=false`)
//      — un cliente de evento cancelado no puede recibir «te toca pagar».
//   4. ARCHIVA los códigos de promo EXCLUSIVOS del evento (`promos_codigos`,
//      only_events = exactamente [slug]). Un código multi-evento NO se toca:
//      se AVISA con nombre — apagárselo a otro evento es decisión humana.
//      ⚠️ La copia `var PROMOS` del index NO se refresca aquí: queda huérfana
//      e INERTE (sin evento en el EV no hay dónde teclear el código) y se
//      limpia en el próximo publish de códigos desde Baba. El reporte lo dice.
//
// LO QUE NO HACE, a propósito:
//   - NO quita el evento del index: eso es `esferas-despublicar` (el PUT a
//     GitHub con validación de ambos parsers ya existe y está probado en
//     prod). El navegador lo llama DESPUÉS de esta function — y si ese paso
//     falla, el peor caso es «archivado pero visible», que el mismo botón
//     completa al reintentar. Al revés («visible → invisible pero
//     re-insertable») sería el estado peligroso.
//   - NO toca viajeros, abonos ni compras: el dinero de la gente queda entero
//     y el evento sigue en el Resumen con sus reembolsos pendientes.
//   - CERO DELETEs. Todo es PATCH con el valor esperado en el filtro, así que
//     el segundo clic escribe CERO filas (idempotente por construcción).
//
// CANDADO: exige `confirmar: true` en el body — el confirm() del navegador es
// cortesía; el candado vive AQUÍ (esconder el botón no basta, COB-MIG-1).
//
// Seguridad: corsCheck + verifyAdminAuthLive(['maestro_roshi']).
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const sbHeaders = (extra) => Object.assign({
  apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json',
}, extra || {});

// ¿Esta llave pertenece al evento? Exacta o hija multifecha (slug#N).
// El `like slug*` de la consulta solo ESTRECHA (sobre-pesca por diseño);
// la AUTORIDAD es esta función — un prefijo no es un ancla (natanael ≠
// natanaelcano2), la forma de PLAN-CASE-1.
function esDelEvento(eventoId, slug) {
  const v = String(eventoId || '');
  return v === slug || v.startsWith(slug + '#');
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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ ok: false, error: auth.error }) };
  if (!SB_KEY) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };

  let reqBody;
  try { reqBody = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON inválido' }) }; }

  const slug = (reqBody && typeof reqBody.slug === 'string') ? reqBody.slug.trim().toLowerCase() : '';
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'El slug es requerido' }) };

  // 🔒 EL CANDADO DE LA CONFIRMACIÓN, EN EL SERVIDOR. Sin él, CERO escrituras.
  if (reqBody.confirmar !== true) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Cancelar un evento exige confirmar:true — nada se escribió.' }) };
  }

  try {
    // SALVAGUARDA: solo eventos gestionados por Esferas (como despublicar).
    const chk = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}&select=slug,archivado,publicado`, { headers: sbHeaders() });
    if (!chk.ok) return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Supabase rechazó la query', detail: await chk.text() }) };
    const fichas = await chk.json();
    if (!Array.isArray(fichas) || fichas.length === 0) {
      return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: `'${slug}' no gestionado por Esferas` }) };
    }

    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
    const reporte = { ok: true, slug, archivado: 0, pestanas: [], recordatorios: 0, promos_archivadas: [], promos_aviso: [], avisos: [] };

    // ── 1 · ARCHIVAR LA FICHA (cierra la re-inserción ANTES de todo) ────────
    const rA = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}&archivado=eq.false`, {
      method: 'PATCH',
      headers: sbHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ archivado: true, publicado: false }),
    });
    if (!rA.ok) return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'No pude archivar la ficha — me detengo sin tocar nada más.', detail: await rA.text() }) };
    reporte.archivado = ((await rA.json()) || []).length; // 0 = ya estaba archivada (idempotente, se dice)

    // ── 2 · PESTAÑAS DEL CAREO (slug y sus hijas slug#N) ────────────────────
    // GET estrecha con like; la autoridad es esDelEvento. PATCH por id con
    // activa=eq.true para que el segundo clic no escriba. La nota se ANEXA
    // (leída fila por fila), jamás se pisa.
    const gP = await fetch(`${SB_URL}/rest/v1/excel_pestanas?select=id,evento_id,notas&activa=eq.true&evento_id=like.${encodeURIComponent(slug)}*`, { headers: sbHeaders() });
    const pestanas = gP.ok ? ((await gP.json()) || []).filter((p) => esDelEvento(p.evento_id, slug)) : null;
    if (pestanas === null) {
      reporte.avisos.push('No pude leer excel_pestanas: las pestañas del careo quedaron SIN apagar — apágalas a mano.');
    } else {
      for (const p of pestanas) {
        const nota = ((p.notas || '') + ` — CANCELADO ${hoy}: evento cancelado desde Esferas, el careo deja de cosechar esta pestaña. Los reembolsos van por Yamcha.`).trim();
        const rP = await fetch(`${SB_URL}/rest/v1/excel_pestanas?id=eq.${encodeURIComponent(p.id)}&activa=eq.true`, {
          method: 'PATCH', headers: sbHeaders({ Prefer: 'return=representation' }),
          body: JSON.stringify({ activa: false, notas: nota }),
        });
        if (rP.ok && ((await rP.json()) || []).length) reporte.pestanas.push(p.evento_id);
        else reporte.avisos.push(`La pestaña de ${p.evento_id} no se pudo apagar — revísala a mano.`);
      }
    }

    // ── 3 · RECORDATORIOS DE /rol (slug y sus hijas; la llave PADRE incluida) ─
    const gR = await fetch(`${SB_URL}/rest/v1/rol_recordatorios?select=id,evento_id&active=eq.true&evento_id=like.${encodeURIComponent(slug)}*`, { headers: sbHeaders() });
    const recs = gR.ok ? ((await gR.json()) || []).filter((r) => esDelEvento(r.evento_id, slug)) : null;
    if (recs === null) {
      reporte.avisos.push('No pude leer rol_recordatorios: pueden quedar recordatorios de pago VIVOS de un evento cancelado — apágalos a mano.');
    } else if (recs.length) {
      const ids = recs.map((r) => r.id).join(',');
      const rR = await fetch(`${SB_URL}/rest/v1/rol_recordatorios?id=in.(${ids})&active=eq.true`, {
        method: 'PATCH', headers: sbHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({ active: false }),
      });
      if (rR.ok) reporte.recordatorios = ((await rR.json()) || []).length;
      else reporte.avisos.push('Los recordatorios de /rol no se pudieron apagar — revísalos a mano.');
    }

    // ── 4 · PROMOS EXCLUSIVAS DEL EVENTO ────────────────────────────────────
    const gC = await fetch(`${SB_URL}/rest/v1/promos_codigos?select=codigo,only_events&archivado=eq.false&only_events=cs.{${encodeURIComponent(slug)}}`, { headers: sbHeaders() });
    const codigos = gC.ok ? ((await gC.json()) || []) : null;
    if (codigos === null) {
      reporte.avisos.push('No pude leer promos_codigos: si el evento tenía código, archívalo a mano en Baba.');
    } else {
      for (const c of codigos) {
        const oe = Array.isArray(c.only_events) ? c.only_events : [];
        if (oe.length === 1 && oe[0] === slug) {
          const rC = await fetch(`${SB_URL}/rest/v1/promos_codigos?codigo=eq.${encodeURIComponent(c.codigo)}&archivado=eq.false`, {
            method: 'PATCH', headers: sbHeaders({ Prefer: 'return=representation' }),
            body: JSON.stringify({ archivado: true }),
          });
          if (rC.ok && ((await rC.json()) || []).length) reporte.promos_archivadas.push(c.codigo);
          else reporte.avisos.push(`El código ${c.codigo} no se pudo archivar — hazlo en Baba.`);
        } else {
          // Multi-evento: apagárselo a los demás es decisión humana, no de un botón.
          reporte.promos_aviso.push(`${c.codigo} también aplica a [${oe.filter((e) => e !== slug).join(', ')}] — NO se archivó; decídelo en Baba.`);
        }
      }
      if (reporte.promos_archivadas.length) {
        reporte.avisos.push('La copia de códigos del index queda huérfana e inerte; se limpia en el próximo publish de códigos desde Baba.');
      }
    }

    // El navegador sigue con esferas-despublicar (el PUT a GitHub validado).
    reporte.siguiente = 'despublicar';
    return { statusCode: 200, headers, body: JSON.stringify(reporte) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
