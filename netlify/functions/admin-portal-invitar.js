// =============================================================================
// admin-portal-invitar  (MIG-1d-ii — EL BOTÓN QUE INVITA AL PORTAL, por evento)
// =============================================================================
// Lo último que resta de la serie MIG. El puente (`admin-portal-puente`) ya les
// dio CUENTA; esto les manda la invitación.
//
// POST { evento_id, accion: 'vista_previa' | 'enviar', seco?, confirmar?, reenviar? }
//
// 🔴🔒 CORREOS_MODO ESTÁ EN 'real' DESDE EL 31-JUL: **EL PRIMER CLIC MANDA
// CORREOS DE VERDAD.** No hay red debajo. De ahí las tres puertas, y las tres
// son de Memo:
//
//   1. `seco` ES EL DEFAULT. Para mandar hace falta DECIR `seco:false` **y**
//      `confirmar:true`: dos gestos explícitos. Es el revés de un default
//      silencioso — aquí lo PELIGROSO es lo que hay que teclear. Olvidar una
//      bandera no puede mandar 156 correos; el peor caso de un olvido es ver el
//      render otra vez.
//   2. EXIGE `evento_id`. **No existe «invitar a todos»** y no es una omisión:
//      `dalemix` metería ~156 de golpe. Si algún día alguien la quiere, la
//      escribe a propósito y la firma Memo.
//   3. LA VISTA PREVIA ENSEÑA EL RENDER COMPLETO. El primer envío real no sale
//      sin el visto de Jane y Memo al HTML, como el consuelo.
//
// 🔒 IDEMPOTENCIA EN LA BITÁCORA, NO EN LA INTENCIÓN. Cada envío se asienta en
// `invitaciones_portal`; un correo ya invitado se SALTA, y para repetirlo hay que
// pedir `reenviar:true`. ⚠️ Si la bitácora NO SE PUEDE LEER, esto se RINDE con
// un 502: invitar creyendo que nadie fue invitado es exactamente cómo se manda
// un correo repetido a 156 personas. «No sé a quién ya invité» no es «a nadie».
//
// 🔒 CERO ESCRITURAS DE DINERO, igual que el puente. Lo único que escribe es la
// bitácora. El dinero del migrado ya tiene su camino (`saldoMigrado` sobre
// KameHouse) y el plan lo sirve `portal-mi-plan-migrado`, leyendo.
//
// ⏳ LA TABLA `invitaciones_portal` LA CREA JANE (ver ACTA-MIG-1D-II.sql).
// Mientras no exista, esto NO invita a nadie y lo DICE con el SQL en la mano —
// no se salta la bitácora «porque no está»: eso convertiría el candado de
// idempotencia en un adorno el día más peligroso.
//
// Seguridad: corsCheck + verifyAdminAuthLive(['maestro_roshi','bulma','milk']).
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { llaveCorreo } = require('./_lib/correo-forma');
const { aQuienInvitar, renderInvitacion } = require('./_lib/invitacion-portal');
const { fetchEventosRaw } = require('./_lib/catalogo-index');

const ACCIONES = new Set(['vista_previa', 'enviar']);
const ROLES = ['maestro_roshi', 'bulma', 'milk'];
const FROM = 'Conecta Reynosa <admin@conectareynosa.mx>';
// El tope por clic. No es una opinión: es el freno de «el primer evento real lo
// elige Memo, y CHICO». Un evento con más que esto se rechaza DICIENDO cuántos
// son, para que la decisión de partirlo sea de un humano y no un accidente.
const TOPE_POR_CLIC = 60;

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  // `corsCheck` devuelve TRES cosas: el origen, `''` si es MISMO-ORIGEN (el
  // navegador no manda `Origin`) y `null` si se rechaza. Se compara contra
  // `null` — preguntar por falsy trataría al mismo-origen como intruso, que es
  // el 403 de `/diseno` que esta casa ya pagó. (El puente lo hace así.)
  if (__origin === null) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ROLES);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
  if (!KH_URL || !KH_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars (SUPABASE_*_KAMEHOUSE)' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const evento_id = String(body.evento_id || '').trim();
  const accion = String(body.accion || '').trim();
  if (!evento_id) {
    return { statusCode: 400, headers, body: JSON.stringify({
      error: 'Falta evento_id. Este botón invita a UN evento a propósito: no existe «invitar a todos» '
           + '(dalemix metería ~156 correos de golpe).', codigo: 'FALTA_EVENTO' }) };
  }
  if (!ACCIONES.has(accion)) {
    return { statusCode: 400, headers, body: JSON.stringify({
      error: "accion debe ser 'vista_previa' o 'enviar'", recibido: accion, codigo: 'ACCION_DESCONOCIDA' }) };
  }
  // 🔒 EL SECO ES EL DEFAULT: solo un `seco:false` EXPLÍCITO apunta a mandar.
  const seco = body.seco === false ? false : true;
  const confirmado = body.confirmar === true;
  const reenviar = body.reenviar === true;

  const hKH = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY, 'Content-Type': 'application/json' };

  try {
    // ── 1. Los viajeros del evento ────────────────────────────────────────
    const vUrl = `${KH_URL}/rest/v1/viajeros_evento?evento_id=eq.${encodeURIComponent(evento_id)}`
      + '&select=id,nombre,correo,portal_cliente_id&limit=2000';
    const vR = await fetch(vUrl, { headers: hKH });
    if (!vR.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No pude leer los viajeros', detail: (await vR.text()).slice(0, 300) }) };
    const viajeros = await vR.json();
    if (!Array.isArray(viajeros)) return { statusCode: 502, headers, body: JSON.stringify({ error: 'Los viajeros no vinieron como lista' }) };

    // ── 2. LA BITÁCORA. Si no se puede leer, se RINDE. ────────────────────
    const bUrl = `${KH_URL}/rest/v1/invitaciones_portal?evento_id=eq.${encodeURIComponent(evento_id)}`
      + '&select=correo,enviado_en,enviado_por,email_id&limit=5000';
    const bR = await fetch(bUrl, { headers: hKH });
    if (!bR.ok) {
      const detail = (await bR.text()).slice(0, 300);
      // El 404/42P01 de una tabla que no existe tiene su propio mensaje: manda a
      // correr el SQL, no a buscar un defecto.
      const noExiste = /does not exist|42P01|Could not find the table/i.test(detail);
      return { statusCode: 502, headers, body: JSON.stringify({
        error: noExiste
          ? 'La bitácora `invitaciones_portal` todavía NO EXISTE: el SQL está en ACTA-MIG-1D-II.sql y lo corre Jane. '
            + 'Sin ella este botón no invita a nadie — saltársela convertiría la idempotencia en un adorno el día '
            + 'más peligroso, y un correo repetido a 156 personas no se deshace.'
          : 'No pude leer la bitácora de invitaciones',
        codigo: noExiste ? 'SIN_BITACORA' : 'BITACORA_ILEGIBLE', detail }) };
    }
    const bitacora = await bR.json();
    const yaInvitados = new Set((Array.isArray(bitacora) ? bitacora : []).map((x) => llaveCorreo(x.correo)).filter(Boolean));

    // ── 3. El catálogo, de donde se DERIVA el correo ──────────────────────
    let ev = null, catalogoError = null;
    try {
      const EV = await fetchEventosRaw();
      const slug = evento_id.split('#')[0];
      ev = (Array.isArray(EV) ? EV : []).find((e) => e && e.id === slug) || null;
      if (!ev) catalogoError = `El evento «${slug}» no está en el catálogo del sitio.`;
    } catch (e) { catalogoError = 'No se pudo leer el catálogo: ' + e.message; }

    // ── 4. QUIÉN ─────────────────────────────────────────────────────────
    const quien = aQuienInvitar(viajeros, reenviar ? new Set() : yaInvitados);
    if (quien.error) return { statusCode: 502, headers, body: JSON.stringify({ error: quien.error, codigo: 'SIN_BITACORA' }) };

    // ── 5. EL RENDER, que es lo que Memo y Jane ven antes del primer envío ─
    const muestraPara = quien.invitar[0] || { nombre: 'Nombre Ejemplo', correo: 'ejemplo@correo.com' };
    const render = renderInvitacion({ nombre: muestraPara.nombre, correo: muestraPara.correo, ev });

    const resumen = {
      evento_id,
      modo_correos: process.env.CORREOS_MODO === 'prueba' ? 'prueba' : 'real',
      viajeros: viajeros.length,
      personas: quien.personas,
      recibirian: quien.invitar.length,
      ya_invitados: quien.ya_invitados.length,
      saltados: quien.saltados.length,
      ojo_plan_vacio: (quien.ojo_plan_vacio || []).length,
      reenviar,
    };

    const comun = {
      ok: true, accion, seco, resumen,
      invitar: quien.invitar, ya_invitados: quien.ya_invitados, saltados: quien.saltados,
      // 🔴 EL MONTÓN QUE HAY QUE MIRAR ANTES DEL PRIMER ENVÍO REAL: gente cuya
      // fila guarda el correo con MAYÚSCULAS. `portal-mi-plan-migrado` la busca con
      // un `eq` exacto en minúsculas, así que su plan saldría vacío — y el correo
      // que acabamos de mandarle dice «ya puedes ver tu plan».
      ojo_plan_vacio: quien.ojo_plan_vacio,
      // El render viaja SIEMPRE, también en la vista previa: es el objeto del
      // visto de Memo. Si no se pudo armar, se dice con su motivo.
      render: render.error ? null : { subject: render.subject, html: render.html, muestra_de: muestraPara.correo },
      render_error: render.error || null,
      catalogo_error: catalogoError,
    };

    if (accion === 'vista_previa') {
      return { statusCode: 200, headers, body: JSON.stringify(comun) };
    }

    // ── 6. ENVIAR ────────────────────────────────────────────────────────
    // La CORRIDA SECA: se arma todo, se cuenta todo y NO SE MANDA NADA.
    if (seco) {
      return { statusCode: 200, headers, body: JSON.stringify({
        ...comun,
        enviados: 0, errores: [], asentados: 0,
        aviso: 'CORRIDA SECA: no se mandó ningún correo y no se asentó nada. Para mandar de verdad hace falta '
             + '`seco:false` Y `confirmar:true` — y CORREOS_MODO está en '
             + (process.env.CORREOS_MODO === 'prueba' ? 'prueba' : 'REAL, así que el primer clic le escribe a gente de verdad') + '.',
      }) };
    }
    if (!confirmado) {
      return { statusCode: 400, headers, body: JSON.stringify({
        error: 'Para mandar de verdad falta `confirmar:true`. Son dos gestos a propósito: CORREOS_MODO está en '
             + 'real y no hay red debajo.', codigo: 'FALTA_CONFIRMAR', resumen }) };
    }
    if (render.error) {
      return { statusCode: 400, headers, body: JSON.stringify({
        error: 'No se puede invitar sin render: ' + render.error, codigo: 'SIN_RENDER', catalogo_error: catalogoError }) };
    }
    if (!RESEND_KEY) {
      // 🔒 NO se contesta «0 enviados, ok»: eso se leería como «no había a quién».
      return { statusCode: 500, headers, body: JSON.stringify({
        error: 'Falta RESEND_API_KEY: no se mandó nada. Un «0 enviados» con la llave ausente se leería como '
             + '«no había a quién invitar».', codigo: 'SIN_RESEND' }) };
    }
    if (quien.invitar.length > TOPE_POR_CLIC) {
      return { statusCode: 400, headers, body: JSON.stringify({
        error: `Son ${quien.invitar.length} personas y el tope por clic es ${TOPE_POR_CLIC}. El primer evento real `
             + 'va CHICO por orden de Memo: parte la lista o elige otro evento. Que un clic mande 156 correos no '
             + 'puede ser un accidente.', codigo: 'DEMASIADOS', recibirian: quien.invitar.length }) };
    }

    const enviados = [], errores = [];
    for (const p of quien.invitar) {
      const r = renderInvitacion({ nombre: p.nombre, correo: p.correo, ev });
      if (r.error) { errores.push({ correo: p.correo, paso: 'render', detail: r.error }); continue; }
      // ⚠️ El desvío de modo prueba se aplica JUSTO antes del body, sobre el
      // destinatario ya resuelto — como en todos los emisores de la casa.
      const { aplicarModoPrueba } = require('./_lib/correo-guard');
      const mp = aplicarModoPrueba({ to: [r.to], subject: r.subject });
      let resp;
      try {
        resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: mp.to, subject: mp.subject, html: r.html }),
        });
      } catch (e) { errores.push({ correo: p.correo, paso: 'resend', detail: e.message }); continue; }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { errores.push({ correo: p.correo, paso: 'resend', status: resp.status, detail: data }); continue; }
      // 🔒 LA BITÁCORA SE ASIENTA **DESPUÉS** DEL ENVÍO, UNA POR UNA. Asentar
      // antes dejaría a alguien marcado como invitado sin haber recibido nada —
      // y el candado de idempotencia le cerraría la puerta para siempre, en
      // silencio. Si el asiento falla, se REPORTA: el correo ya salió y eso no
      // se deshace, así que el humano tiene que saber que la bitácora quedó
      // corta o el próximo clic se lo manda otra vez.
      const aR = await fetch(`${KH_URL}/rest/v1/invitaciones_portal`, {
        method: 'POST', headers: { ...hKH, Prefer: 'return=representation' },
        body: JSON.stringify({ evento_id, correo: p.correo, portal_cliente_id: p.portal_cliente_id,
                               enviado_por: (auth.user || {}).correo || null, email_id: data.id || null }),
      });
      const asentado = aR.ok;
      if (!asentado) errores.push({ correo: p.correo, paso: 'bitacora', detail: (await aR.text()).slice(0, 200),
        aviso: 'EL CORREO YA SALIÓ pero no quedó asentado: el próximo clic se lo mandaría otra vez' });
      enviados.push({ correo: p.correo, nombre: p.nombre, email_id: data.id || null, asentado });
    }

    return { statusCode: 200, headers, body: JSON.stringify({
      ...comun, seco: false,
      enviados: enviados.length, detalle_enviados: enviados,
      asentados: enviados.filter((x) => x.asentado).length,
      errores,
    }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error invitando al Portal', detail: e.message }) };
  }
};
