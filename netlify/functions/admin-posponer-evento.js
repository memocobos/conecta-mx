// =============================================================================
// admin-posponer-evento  (Módulo Posponer — Fase 1: bitácora + cambio de fecha)
//
// Primer ladrillo del módulo Posponer. Lee la fecha actual del evento en
// esferas_eventos, registra el movimiento en eventos_posposiciones (tabla KH,
// deny-all → solo service_role) y cambia esferas_eventos.fecha_inicio.
//
// NO republica: eso lo hace el admin desde Esferas.
//
// SEG-1 (opción A) · Este endpoint NO manda correo. El aviso al cliente se
// dispara a mano desde Esferas con admin-avisar-posposicion, ya republicado el
// evento: un correo que sale solo no se puede detener. Y gana `preview:true`,
// que contesta a cuántos clientes y cuántas cuotas afecta SIN escribir nada.
//
// Body JSON: { slug, fecha_nueva, motivo?, preview? }
//   - slug requerido. fecha_nueva requerida, formato YYYY-MM-DD. motivo opcional.
//   - preview:true → sólo cuenta y contesta; corta antes de la primera escritura.
//
// Seguridad/molde calcado de esferas-actualizar:
//   - corsCheck + verifyAdminAuth(['maestro_roshi'])
//   - service_role (bypass RLS) para leer/escribir esferas_eventos y la bitácora.
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET (lo lee verifyAdminAuthLive).
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
// [POSPONER-TEXTO-1] La MISMA función que decide el letrero al publicar. No se
// copia el formato: se le pregunta a quien manda, o el día que el formato cambie
// tendríamos dos.
const { fechaDisplayDeEsfera } = require('./_lib/esferas-compile');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

// Portal (solicitudes/pagos) — mismo patrón que admin-cancelar-evento.
const PORTAL_URL = process.env.PORTAL_SUPABASE_URL;
const PORTAL_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 86400000;

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
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  if (!SB_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };
  if (!PORTAL_URL || !PORTAL_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Portal Supabase no configurado (PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY)' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const slug = (body && typeof body.slug === 'string') ? body.slug.trim().toLowerCase() : '';
  if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: 'El slug es requerido' }) };

  const fechaNueva = (body && typeof body.fecha_nueva === 'string') ? body.fecha_nueva.trim() : '';
  if (!fechaNueva) return { statusCode: 400, headers, body: JSON.stringify({ error: 'La fecha nueva es requerida' }) };
  if (!FECHA_RE.test(fechaNueva)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'fecha_nueva debe tener formato YYYY-MM-DD' }) };
  }

  const motivo = (body && typeof body.motivo === 'string' && body.motivo.trim()) ? body.motivo.trim() : null;
  const actor = (auth.user && (auth.user.correo || auth.user.rol)) || 'admin';

  const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  try {
    // 1. Leer el evento y su fecha actual.
    const evRes = await fetch(
      `${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}&select=slug,nombre,fecha_inicio,fecha_fin,fechas_extra,multifecha,f_texto&limit=1`,
      { headers: sbHeaders }
    );
    if (!evRes.ok) {
      const detail = await evRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la query', detail }) };
    }
    const evRows = await evRes.json();
    const ev = Array.isArray(evRows) ? evRows[0] : null;
    if (!ev) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: `No existe un evento con slug '${slug}'` }) };
    }

    // 2. Validar que la fecha realmente cambie.
    const fechaAnterior = ev.fecha_inicio;
    if (fechaNueva === fechaAnterior) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'La fecha nueva es igual a la actual' }) };
    }

    const deltaDias = Math.round(
      (Date.parse(fechaNueva + 'T00:00:00Z') - Date.parse(String(fechaAnterior).slice(0, 10) + 'T00:00:00Z')) / MS_DIA
    );

    // ─────────────────────────────────────────────────────────────────────
    // [POSPONER-TEXTO-1] EL LETRERO DE LA FECHA
    //
    // `f_texto` es un OVERRIDE que le gana a todo en `fechaDisplayDeEsfera`: si
    // está puesto, el compilador lo devuelve tal cual. Por eso posponer cambiaba
    // `fecha_inicio` y la card seguía anunciando la fecha muerta — y republicar
    // NO podía arreglarlo, porque el publish re-emitía fielmente el texto viejo.
    // Pasó dos veces de verdad (anuelaa el 2-sep, scorpions el 3-sep) y las dos
    // las curó Jane a mano.
    //
    // MEDIDO EN LA BASE antes de escribir esto (3-sep, 104 fichas con fecha):
    //   · 78 con `f_texto` NULL     → el compilador deriva. Posponer YA les servía.
    //   · 16 con el texto = la fecha → los que muerde el bug. Aquí se arreglan.
    //   · 10 con texto A MANO        → 7 multifecha + 3 con fechas extra. NO se tocan.
    //
    // 🔒 LA PREGUNTA NO ES «¿parece una fecha?» sino «¿es EXACTAMENTE lo que este
    // evento mostraría sin el override?». Se le pregunta a la función del
    // compilador con el override apagado: si coinciden, el texto no aportaba nada
    // y se puede rehacer. Si difieren, alguien escribió algo que ninguna regla
    // genera y ESO NO SE PISA.
    const _fTextoViejo = (typeof ev.f_texto === 'string') ? ev.f_texto.trim() : '';
    // Un evento de VARIAS fechas no se resuelve moviendo `fecha_inicio`: sus
    // `fechas_extra` se quedarían en su sitio y el letrero mezclaría dos épocas.
    // El endpoint NO las mueve —medido: no las menciona— así que aquí tampoco se
    // finge que sí. Se avisa y se deja intacto.
    const _tieneVariasFechas = !!(
      (ev.fechas_extra && String(ev.fechas_extra).trim() && !['[]', 'null'].includes(String(ev.fechas_extra).trim())) ||
      ev.fecha_fin ||
      (ev.multifecha && String(ev.multifecha).trim())
    );
    const _sinOverride = (fecha) => fechaDisplayDeEsfera({ ...ev, f_texto: null, fecha_inicio: fecha });
    const _derivadoViejo = _sinOverride(fechaAnterior);
    const _derivadoNuevo = _sinOverride(fechaNueva);

    let fTextoNuevo = null;           // lo que se va a escribir, si algo
    let fTextoAccion, fTextoAviso = null;
    if (!_fTextoViejo) {
      fTextoAccion = 'no_hacia_falta';
    } else if (_tieneVariasFechas) {
      fTextoAccion = 'respetado_multifecha';
      fTextoAviso = `Este evento tiene varias fechas y su letrero dice "${_fTextoViejo}". Posponer solo movió la fecha de inicio: revisa el letrero y las fechas extra a mano en Esferas.`;
    } else if (_fTextoViejo === _derivadoViejo) {
      fTextoNuevo = _derivadoNuevo;
      fTextoAccion = 'actualizado';
    } else {
      fTextoAccion = 'respetado_custom';
      fTextoAviso = `El letrero de este evento dice "${_fTextoViejo}", que no es su fecha: se dejó como estaba. Si hay que cambiarlo, se edita en Esferas.`;
    }

    // 2b. SEG-1 · Modo preview: enseñar qué va a pasar y NO escribir nada.
    //     Aditivo — nadie mandaba `preview` antes, así que ningún contrato se
    //     rompe. Corta ANTES del INSERT de la bitácora, que es la primera
    //     escritura del camino.
    if (body.preview === true) {
      const portalHeaders = { apikey: PORTAL_KEY, Authorization: `Bearer ${PORTAL_KEY}`, 'Content-Type': 'application/json' };
      const u = await leerUniverso(slug, portalHeaders);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          preview: true,
          evento_nombre: ev.nombre,
          fecha_anterior: fechaAnterior,
          fecha_nueva: fechaNueva,
          delta_dias: deltaDias,
          clientes: u.destinatarios.length,
          cuotas: u.pagosPendientes.length,
          // [POSPONER-TEXTO-1] Se dice ANTES de apretar, no después.
          f_texto_accion: fTextoAccion,
          f_texto_anterior: _fTextoViejo || null,
          f_texto_nuevo: fTextoNuevo,
          f_texto_aviso: fTextoAviso,
        }),
      };
    }

    // 3. Registrar la posposición ANTES de cambiar la fecha (la bitácora manda;
    //    si no se registra, no movemos nada).
    const insRes = await fetch(`${SB_URL}/rest/v1/eventos_posposiciones`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        evento_slug: slug,
        evento_nombre: ev.nombre,
        fecha_anterior: fechaAnterior,
        fecha_nueva: fechaNueva,
        motivo,
        actor,
      }),
    });
    if (!insRes.ok) {
      const detail = await insRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se registró la posposición', detail }) };
    }
    const insRows = await insRes.json().catch(() => []);
    const bitacoraId = Array.isArray(insRows) ? (insRows[0] && insRows[0].id) : (insRows && insRows.id);

    // 4. Cambiar la fecha del evento. Si falla, deshacer la bitácora (best-effort).
    const patchRes = await fetch(`${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      // [POSPONER-TEXTO-1] El letrero viaja en el MISMO PATCH que la fecha: dos
      // escrituras podrían dejar la fecha nueva con el texto viejo si la segunda
      // falla, que es exactamente el estado del que venimos.
      body: JSON.stringify(fTextoNuevo ? { fecha_inicio: fechaNueva, f_texto: fTextoNuevo } : { fecha_inicio: fechaNueva }),
    });
    if (!patchRes.ok) {
      const detail = await patchRes.text();
      if (bitacoraId != null) {
        await fetch(`${SB_URL}/rest/v1/eventos_posposiciones?id=eq.${encodeURIComponent(bitacoraId)}`, {
          method: 'DELETE',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
        }).catch(() => {});
      }
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo cambiar la fecha', detail }) };
    }

    // 5. Recorrer las fechas de pago PENDIENTES el mismo número de días que se
    //    movió el evento (Opción A). Las pagadas NO se tocan. Best-effort: un
    //    fallo aquí NO revierte la posposición (ya quedó) — pero SÍ se guarda
    //    QUIÉN falló, para que el reintento mueva sólo a ésos y nadie se mueva
    //    dos veces (SEG-1).
    const pagosInfo = { pagos_recorridos: 0, pagos_fallidos: 0, delta_dias: deltaDias };
    let universo = null;
    const fallidosIds = [];

    try {
      const portalHeaders = { apikey: PORTAL_KEY, Authorization: `Bearer ${PORTAL_KEY}`, 'Content-Type': 'application/json' };
      // El MISMO universo que enseñó el preview (fuente única).
      universo = await leerUniverso(slug, portalHeaders);

      if (deltaDias !== 0 && universo.pagosPendientes.length) {
        const patches = await Promise.allSettled(universo.pagosPendientes.map((p) => {
          const base = String(p.fecha_esperada).slice(0, 10);
          const nuevaFecha = new Date(Date.parse(base + 'T00:00:00Z') + deltaDias * MS_DIA).toISOString().slice(0, 10);
          return fetch(`${PORTAL_URL}/rest/v1/pagos?id=eq.${encodeURIComponent(p.id)}`, {
            method: 'PATCH',
            headers: { ...portalHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ fecha_esperada: nuevaFecha }),
          });
        }));
        patches.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value && r.value.ok) pagosInfo.pagos_recorridos++;
          else { pagosInfo.pagos_fallidos++; fallidosIds.push(universo.pagosPendientes[i].id); }
        });
      }
    } catch (e) {
      // El bloque de pagos truena completo: la posposición sigue siendo exitosa.
      pagosInfo.pagos_error = true;
      pagosInfo.pagos_error_detail = e.message;
    }

    // 5b. Sellar la bitácora. `pagos_recalculados` se pone SIEMPRE que el
    //     recorrido llegó a correr: es el candado que impide que ↻ Recalcular
    //     vuelva a mover lo que ya se movió. Si el bloque tronó entero
    //     (pagos_error) NO se marca — ahí nada se movió y el reintento
    //     completo sigue siendo el correcto.
    if (!pagosInfo.pagos_error && bitacoraId != null) {
      await fetch(`${SB_URL}/rest/v1/eventos_posposiciones?id=eq.${encodeURIComponent(bitacoraId)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          pagos_recalculados: new Date().toISOString(),
          pagos_fallidos_ids: fallidosIds,
        }),
      }).catch(() => {});
    }

    // 6. SEG-1 (opción A) · Aquí NO sale ningún correo. Se devuelve CUÁNTOS
    //    clientes habría que avisar para que Esferas lo OFREZCA después del
    //    éxito; el envío lo dispara admin-avisar-posposicion a mano, ya
    //    republicado el evento. Un correo que sale solo no se puede detener.
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        evento_nombre: ev.nombre,
        fecha_anterior: fechaAnterior,
        fecha_nueva: fechaNueva,
        // [POSPONER-TEXTO-1] El recordatorio ya existía y la pantalla YA lo pintaba
        // (medido en kamehouse-esferas.js): el «no funcionó» de las dos veces NO
        // fue por no saber del publish —Memo sí republicó— sino porque el publish
        // re-emitía el letrero viejo. Se conserva, y se le añade el paso concreto.
        recordatorio: fTextoAccion === 'actualizado'
          ? `Fecha y letrero actualizados ("${_derivadoViejo}" → "${fTextoNuevo}"). Falta UN paso: dale Publicar en Esferas para que salga al sitio.`
          : 'Fecha cambiada. Falta UN paso: dale Publicar en Esferas para que salga al sitio.',
        f_texto_accion: fTextoAccion,
        f_texto_anterior: _fTextoViejo || null,
        f_texto_nuevo: fTextoNuevo,
        f_texto_aviso: fTextoAviso,
        clientes: universo ? universo.destinatarios.length : null,
        ...pagosInfo,
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error escribiendo a Supabase', detail: e.message }) };
  }
};

// ----- helpers -----

// SEG-1 · El universo de la posposición: los mismos clientes y las mismas
// cuotas que se van a tocar. Fuente ÚNICA — el preview y la escritura llaman a
// ESTA función, para que el número que se enseña y el que se escribe no puedan
// divergir. (Los dos caminos del módulo filtran distinto: aquí, el que MUEVE.)
async function leerUniverso(slug, portalHeaders) {
  const solRes = await fetch(
    `${PORTAL_URL}/rest/v1/solicitudes_tour?evento_id=eq.${encodeURIComponent(slug)}&estado=neq.cancelado&select=id,cliente_id`,
    { headers: portalHeaders }
  );
  if (!solRes.ok) throw new Error('solicitudes: ' + await solRes.text());
  const solRows = await solRes.json();
  const solicitudRows = Array.isArray(solRows) ? solRows : [];
  const solicitudIds = [...new Set(solicitudRows.map(s => s && s.id).filter(Boolean))];
  const clienteIds   = [...new Set(solicitudRows.map(s => s && s.cliente_id).filter(Boolean))];

  // Cuotas movibles: pendientes (todo lo no pagado) con fecha esperada.
  let pagosPendientes = [];
  if (solicitudIds.length) {
    const pagRes = await fetch(
      `${PORTAL_URL}/rest/v1/pagos?solicitud_id=in.(${solicitudIds.join(',')})&estado=neq.pagado&fecha_esperada=not.is.null&select=id,fecha_esperada`,
      { headers: portalHeaders }
    );
    if (!pagRes.ok) throw new Error('pagos: ' + await pagRes.text());
    const pagos = await pagRes.json();
    pagosPendientes = Array.isArray(pagos) ? pagos : [];
  }

  // Destinatarios: MISMO dedup que usa el aviso (trim/lower, exigir '@').
  const destinatarios = [];
  if (clienteIds.length) {
    const cliRes = await fetch(
      `${PORTAL_URL}/rest/v1/clientes?id=in.(${clienteIds.join(',')})&select=id,nombre_completo,correo`,
      { headers: portalHeaders }
    );
    if (!cliRes.ok) throw new Error('clientes: ' + await cliRes.text());
    const cliRows = await cliRes.json();
    const vistos = new Set();
    for (const c of (Array.isArray(cliRows) ? cliRows : [])) {
      const correo = (c && typeof c.correo === 'string') ? c.correo.trim().toLowerCase() : '';
      if (!correo || !correo.includes('@') || vistos.has(correo)) continue;
      vistos.add(correo);
      destinatarios.push({ correo, nombre: c.nombre_completo });
    }
  }
  return { solicitudRows, solicitudIds, clienteIds, destinatarios, pagosPendientes };
}
