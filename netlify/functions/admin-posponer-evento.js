// =============================================================================
// admin-posponer-evento  (Módulo Posponer — Fase 1: bitácora + cambio de fecha)
//
// Primer ladrillo del módulo Posponer. Lee la fecha actual del evento en
// esferas_eventos, registra el movimiento en eventos_posposiciones (tabla KH,
// deny-all → solo service_role) y cambia esferas_eventos.fecha_inicio.
//
// NO republica (eso lo hace el admin desde Esferas) y NO toca pagos ni clientes
// todavía (fases siguientes).
//
// Body JSON: { slug, fecha_nueva, motivo? }
//   - slug requerido. fecha_nueva requerida, formato YYYY-MM-DD. motivo opcional.
//
// Seguridad/molde calcado de esferas-actualizar:
//   - corsCheck + verifyAdminAuth(['maestro_roshi'])
//   - service_role (bypass RLS) para leer/escribir esferas_eventos y la bitácora.
//
// Env vars: SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET (lo lee verifyAdminAuthLive).
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

// Portal (solicitudes/pagos) — mismo patrón que admin-cancelar-evento.
const PORTAL_URL = process.env.PORTAL_SUPABASE_URL;
const PORTAL_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;

// Resend (aviso a viajeros — Fase 2b). Si falta NO se trona la posposición.
const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;

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
      `${SB_URL}/rest/v1/esferas_eventos?slug=eq.${encodeURIComponent(slug)}&select=slug,nombre,fecha_inicio&limit=1`,
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
      body: JSON.stringify({ fecha_inicio: fechaNueva }),
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
    //    fallo aquí NO revierte la posposición (ya quedó) — solo se reporta.
    const pagosInfo = { pagos_recorridos: 0, pagos_fallidos: 0, delta_dias: deltaDias };
    // Solicitudes no canceladas del evento; se consultan aquí (2a) y se reusan
    // en el bloque de correos (2b). null = todavía no se consultaron.
    let solicitudRows = null;

    if (deltaDias !== 0) {
      try {
        const portalHeaders = { apikey: PORTAL_KEY, Authorization: `Bearer ${PORTAL_KEY}`, 'Content-Type': 'application/json' };

        // a. Solicitudes NO canceladas del evento (cliente_id para el aviso 2b).
        const solRes = await fetch(
          `${PORTAL_URL}/rest/v1/solicitudes_tour?evento_id=eq.${encodeURIComponent(slug)}&estado=neq.cancelado&select=id,cliente_id`,
          { headers: portalHeaders }
        );
        if (!solRes.ok) throw new Error('solicitudes: ' + await solRes.text());
        const solRows = await solRes.json();
        solicitudRows = Array.isArray(solRows) ? solRows : [];
        const solicitudIds = [...new Set(solicitudRows.map(s => s && s.id).filter(Boolean))];

        if (solicitudIds.length) {
          // b. Pagos pendientes (estado ≠ 'pagado') con fecha esperada.
          const pagRes = await fetch(
            `${PORTAL_URL}/rest/v1/pagos?solicitud_id=in.(${solicitudIds.join(',')})&estado=neq.pagado&fecha_esperada=not.is.null&select=id,fecha_esperada`,
            { headers: portalHeaders }
          );
          if (!pagRes.ok) throw new Error('pagos: ' + await pagRes.text());
          const pagos = await pagRes.json();
          const lista = Array.isArray(pagos) ? pagos : [];

          // c+d. Recorrer cada fecha_esperada el delta y guardar (allSettled).
          const patches = await Promise.allSettled(lista.map((p) => {
            const base = String(p.fecha_esperada).slice(0, 10);
            const nuevaFecha = new Date(Date.parse(base + 'T00:00:00Z') + deltaDias * MS_DIA).toISOString().slice(0, 10);
            return fetch(`${PORTAL_URL}/rest/v1/pagos?id=eq.${encodeURIComponent(p.id)}`, {
              method: 'PATCH',
              headers: { ...portalHeaders, Prefer: 'return=minimal' },
              body: JSON.stringify({ fecha_esperada: nuevaFecha }),
            });
          }));
          for (const r of patches) {
            if (r.status === 'fulfilled' && r.value && r.value.ok) pagosInfo.pagos_recorridos++;
            else pagosInfo.pagos_fallidos++;
          }
        }
      } catch (e) {
        // El bloque de pagos truena completo: la posposición sigue siendo exitosa.
        pagosInfo.pagos_error = true;
        pagosInfo.pagos_error_detail = e.message;
      }
    }

    // 6. Avisar por correo a los viajeros (Fase 2b). AUTOMÁTICO y best-effort:
    //    un fallo aquí NO revierte la posposición ni el recorrido de pagos.
    const correosInfo = { correos_enviados: 0, correos_fallidos: 0 };
    if (!RESEND_KEY) {
      correosInfo.correos_error = 'Resend no configurado';
    } else {
      try {
        const portalHeaders = { apikey: PORTAL_KEY, Authorization: `Bearer ${PORTAL_KEY}`, 'Content-Type': 'application/json' };

        // a. Solicitudes no canceladas: reusar las de la 2a; si no se consultaron
        //    (deltaDias === 0), consultarlas aquí.
        if (solicitudRows === null) {
          const solRes2 = await fetch(
            `${PORTAL_URL}/rest/v1/solicitudes_tour?evento_id=eq.${encodeURIComponent(slug)}&estado=neq.cancelado&select=id,cliente_id`,
            { headers: portalHeaders }
          );
          if (!solRes2.ok) throw new Error('solicitudes: ' + await solRes2.text());
          const solRows2 = await solRes2.json();
          solicitudRows = Array.isArray(solRows2) ? solRows2 : [];
        }

        const clienteIds = [...new Set(solicitudRows.map(s => s && s.cliente_id).filter(Boolean))];
        if (clienteIds.length) {
          // b. Datos de los clientes (Portal, service_role).
          const cliRes = await fetch(
            `${PORTAL_URL}/rest/v1/clientes?id=in.(${clienteIds.join(',')})&select=id,nombre_completo,correo`,
            { headers: portalHeaders }
          );
          if (!cliRes.ok) throw new Error('clientes: ' + await cliRes.text());
          const cliRows = await cliRes.json();

          // c. Dedup por correo (trim/lower, exigir '@').
          const vistos = new Set();
          const destinatarios = [];
          for (const c of (Array.isArray(cliRows) ? cliRows : [])) {
            const correo = (c && typeof c.correo === 'string') ? c.correo.trim().toLowerCase() : '';
            if (!correo || !correo.includes('@') || vistos.has(correo)) continue;
            vistos.add(correo);
            destinatarios.push({ correo, nombre: c.nombre_completo });
          }

          // d. Enviar con Resend (allSettled; escapeHtml en todo dato del HTML).
          const subject = `📅 Cambio de fecha: ${ev.nombre}`;
          const resultados = await Promise.allSettled(destinatarios.map(d => {
            const html = posponerHtml(d.nombre, ev.nombre, fechaAnterior, fechaNueva, pagosInfo.pagos_recorridos > 0);
            const __mp = aplicarModoPrueba({ to: [d.correo], subject });
            return fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: 'Conecta Reynosa <admin@conectareynosa.mx>', to: __mp.to, subject: __mp.subject, html }),
            });
          }));
          for (const r of resultados) {
            if (r.status === 'fulfilled' && r.value && r.value.ok) correosInfo.correos_enviados++;
            else correosInfo.correos_fallidos++;
          }
        }
      } catch (e) {
        // El bloque de correos truena completo: la posposición sigue siendo exitosa.
        correosInfo.correos_error = e.message;
      }
    }

    // 7. Listo. El evento NO se republica aquí (lo hace el admin desde Esferas).
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        evento_nombre: ev.nombre,
        fecha_anterior: fechaAnterior,
        fecha_nueva: fechaNueva,
        recordatorio: 'Republica el evento desde Esferas para que el sitio muestre la nueva fecha',
        ...pagosInfo,
        ...correosInfo,
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

// "2026-04-20" → "20 de abril de 2026". Si no parsea, devuelve el original.
// Copiado TAL CUAL de admin-avisar-posposicion (revisado y aprobado): ancla a
// mediodía y huso explícito. Sin el mediodía, un runtime en huso negativo
// correría la fecha un día; sin el timeZone, la correría el servidor.
function fmtFecha(ds) {
  if (!ds) return '';
  const s = String(ds).slice(0, 10);
  const d = new Date(s + 'T12:00:00');
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Monterrey' });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Correo de aviso de cambio de fecha (molde de admin-avisar-cancelacion).
function posponerHtml(nombre, eventoNombre, fechaAnterior, fechaNueva, pagosRecorridos) {
  const nom = escapeHtml(nombre || 'viajero');
  const ev = escapeHtml(eventoNombre);
  const fa = escapeHtml(fmtFecha(fechaAnterior));
  const fn = escapeHtml(fmtFecha(fechaNueva));
  const pagosLinea = pagosRecorridos
    ? `<p style="margin:0 0 14px 0">Tus fechas de pago pendientes se recorrieron los mismos días; las verás actualizadas en tu portal.</p>`
    : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span>
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0">Hola <strong>${nom}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">
      <p style="margin:0 0 14px 0">Tu evento <b style="color:#e8ff4c">${ev}</b> cambió de fecha: antes <b>${fa}</b> &rarr; ahora <b>${fn}</b>.</p>
      <p style="margin:0 0 14px 0">Tu lugar y todo lo que ya pagaste siguen asegurados; tu paquete queda igual, solo cambia la fecha.</p>
      ${pagosLinea}
      <p style="margin:0">Cualquier duda, respóndenos por WhatsApp.</p>
    </div>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Conecta Reynosa</p>
  </div>
</body></html>`;
}
