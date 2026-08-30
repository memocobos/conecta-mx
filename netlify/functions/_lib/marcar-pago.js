// =============================================================================
// _lib/marcar-pago.js — EL CORAZÓN del marcado de cuotas (Fase C · ST-1)
//
// Este archivo NO es código nuevo: es el núcleo de admin-marcar-pago MOVIDO tal
// cual, para que exista UNA SOLA ruta al dinero. Lo llaman dos:
//   · admin-marcar-pago  → con su auth de siempre (maestro_roshi/bulma/milk)
//   · stripe-webhook     → con actor 'stripe:evt_...' (no hay admin humano)
//
// Hace, en este orden y sin cambios respecto de lo auditado:
//   1. UPDATE del pago (return=representation).
//   1b. Bitácora BEST-EFFORT en pagos_auditoria (su fallo nunca rompe nada).
//   2-3. Reconciliación del estado de la solicitud sobre CUOTAS VIVAS, con
//        tolerancia de $1, respetando el candado F5b de ventas de vendedor.
//   4. Correo de liquidación por correo-guard (fail-soft).
//
// LA EXTRACCIÓN ES UN MOVIMIENTO, NO UN CAMBIO. Lo único que se parametrizó es
// el ACTOR: antes salía de `auth.user`, que el webhook no tiene. El arnés de T4
// corre antes y después para probar que el comportamiento no se movió.
//
// ── [CONC-2] Lo que SÍ cambió después, y por qué ────────────────────────────
// Este embudo lo comparten TRES escritores (admin, cliente y el webhook, que
// nunca ve una pantalla) y escribía dos veces a ciegas. Dos cosas nuevas:
//
//   · el UPDATE del pago exige la VERSIÓN que el que escribe leyó (`updated_at`,
//     movido por trigger — ver migraciones/CONC-2-pagos-updated-at.sql). Si la
//     cuota cambió desde entonces: 409, y no se escribe nada.
//   · la reconciliación del estado de la solicitud dejó de decidir sobre una
//     lectura que envejece. La guarda viaja en la URL y hay una pasada de
//     verificación después de escribir. El defecto que cierra estaba medido: una
//     solicitud quedaba 'pagado' con una cuota viva, en silencio.
//     [CONC-4a] Ese arreglo YA NO VIVE AQUÍ: se movió a
//     `_lib/reconciliar-solicitud`, porque el mismo bloque existía en cuatro
//     copias y sólo ésta estaba arreglada. Aquí queda el correo.
//
// Las SEIS escrituras DE CONJUNTO sobre `pagos` quedan fuera a propósito: una
// versión por fila no cabe en un PATCH que toca veinte. Están nombradas una por
// una en el acta —la sexta es el cron de vencidos, que se escondía detrás de un
// ayudante que antepone `rest/v1/`—. No las completes por simetría.
// =============================================================================

const { aplicarModoPrueba } = require('./correo-guard');
const { condicionVersion, respuestaChoque, PREFER_VER_FILAS } = require('./candado-optimista');
const { reconciliarSolicitud, TOLERANCIA_MXN } = require('./reconciliar-solicitud');

// [CONC-2] `version` es OBLIGATORIA de nombrar, aunque valga null. Un candado
// que se puede olvidar es un candado que se olvida: si un caller no dice nada,
// esto revienta con nombre en vez de escribir a ciegas en silencio. Para
// escribir sin versión hay que DECIRLO —`version: null, motivoSinVersion: '…'`—
// y entonces el motivo queda en la respuesta, a la vista.
function exigirContratoDeVersion({ version, motivoSinVersion }) {
  if (version === undefined) {
    return 'aplicarNucleo: falta `version` (manda el updated_at leído, o `version: null` + `motivoSinVersion`)';
  }
  if (version === null && !motivoSinVersion) {
    return 'aplicarNucleo: `version: null` exige `motivoSinVersion` — di por qué se escribe sin candado';
  }
  return null;
}

// aplicarNucleo({ env, headers, pagoId, accion, patch, actorEtiqueta,
//                 version, motivoSinVersion })
//   → el MISMO objeto { statusCode, headers, body } que devolvía el handler,
//     más un 409 nuevo cuando la versión ya no coincide.
// `actorEtiqueta` es quién queda en la bitácora: el correo/rol del admin, o
// 'stripe:evt_...' cuando lo dispara un webhook.
async function aplicarNucleo({ env, headers, pagoId, accion, patch, actorEtiqueta, version, motivoSinVersion }) {
  const faltaContrato = exigirContratoDeVersion({ version, motivoSinVersion });
  if (faltaContrato) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: faltaContrato }) };
  }
  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // 1. UPDATE del pago. return=representation nos da la fila (incl. solicitud_id).
    // [CONC-2] Con `version`, el UPDATE lleva la condición: se escribe SOLO si la
    // cuota sigue como se leyó. El caso que impide es el de Memo: dos personas con
    // el plan de pagos abierto y la segunda pisando lo de la primera sin enterarse.
    // La versión la mueve un TRIGGER (migraciones/CONC-2-pagos-updated-at.sql), no
    // los endpoints: cuatro de nueve la escribían a mano y cinco no, y un candado
    // que solo a veces se mueve deja pasar justo a los que se olvidaron.
    const pagoUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?id=eq.${pagoId}`
                  + (version === null ? '' : condicionVersion(version));
    const upR = await fetch(pagoUrl, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: PREFER_VER_FILAS },
      body: JSON.stringify(patch),
    });
    if (!upR.ok) {
      const detail = await upR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la actualización del pago', detail }) };
    }
    const upArr = await upR.json();
    const pago = Array.isArray(upArr) ? upArr[0] : null;
    if (!pago) {
      // Sin condición, cero filas solo puede ser «no existe». Con condición hay
      // dos motivos y NO se pueden confundir: decirle «no encontrado» a quien fue
      // ganado por otro admin lo manda a buscar un pago que sí está.
      if (version !== null) {
        const vivoR = await fetch(`${env.PORTAL_SB_URL}/rest/v1/pagos?id=eq.${pagoId}&select=id&limit=1`, { headers: sbHeaders });
        const vivo = vivoR.ok ? (await vivoR.json().catch(() => []))[0] : null;
        if (vivo) return respuestaChoque(headers, 'esta cuota');
      }
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Pago no encontrado' }) };
    }

    // 2. Leer TODOS los pagos de la solicitud para reconciliar su estado.
    const solicitudId = pago.solicitud_id;

    // 1b. Auditoría BEST-EFFORT del acto HUMANO (pagar/revertir) en pagos_auditoria.
    // Toma los valores del `pago` YA actualizado (estado real aplicado). Su fallo
    // NUNCA rompe la operación. El vencido automático del cron NO pasa por aquí.
    try {
      const actor = actorEtiqueta;
      await fetch(`${env.PORTAL_SB_URL}/rest/v1/pagos_auditoria`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          pago_id:      pago.id,
          solicitud_id: pago.solicitud_id,
          accion:       accion === 'pagar' ? 'pagado' : 'revertido',
          actor,
          monto_pagado: pago.monto_pagado ?? null,
          metodo:       pago.metodo ?? null,
          cuenta:       pago.cuenta ?? null,
        }),
      });
    } catch (e) {
      console.error('[marcar-pago] auditoría falló (no crítica):', e.message);
    }

    const allUrl = `${env.PORTAL_SB_URL}/rest/v1/pagos?solicitud_id=eq.${solicitudId}&select=estado,monto,monto_pagado`;
    const allR = await fetch(allUrl, { headers: sbHeaders });
    if (!allR.ok) {
      const detail = await allR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de pagos', detail }) };
    }
    const todos = await allR.json();

    // 3. Leer el estado actual de la solicitud y reconciliar si hace falta.
    const solUrl = `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}&select=id,estado,precio_total,evento_nombre,clientes(nombre_completo,correo)`;
    const solR = await fetch(solUrl, { headers: sbHeaders });
    if (!solR.ok) {
      const detail = await solR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta de solicitud', detail }) };
    }
    const solArr = await solR.json();
    const solicitud = Array.isArray(solArr) ? solArr[0] : null;
    const estadoPrevio = solicitud ? solicitud.estado : null;
    let estadoSolicitud = estadoPrevio;

    // [VEN-BORRA-1e] Aquí había una rama para las ventas de VENDEDOR: su ciclo de
    // estado no lo manejaba la cobranza del cliente. Sin ese módulo, todas las
    // solicitudes son de cliente y el camino es el de siempre — que es el que
    // esta rama dejaba intacto. Se retira TAMBIÉN porque leía
    // `solicitudes_tour.vendedor_id`, la columna que VEN-BORRA-1d suelta: dejarla
    // habría hecho fallar el `select` entero de PostgREST, y con él marcar un pago.

    // [CONC-4a] La reconciliación se MOVIÓ a `_lib/reconciliar-solicitud`: este
    // bloque vivía aquí en cuatro copias con el mismo sha1 y CONC-2 solo arregló
    // ésta. El comportamiento no se movió con él — el arnés lo carea en los
    // cuatro caminos. Lo que se queda aquí es el correo, que cada llamador
    // escribe distinto.
    const rec = await reconciliarSolicitud({
      sbUrl: env.PORTAL_SB_URL, sbHeaders, solicitudId, cuotas: todos,
    });
    if (!rec.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Pago actualizado, pero falló la reconciliación del estado de la solicitud', detail: rec.error }) };
    }
    const nuevoEstadoSol = rec.cambio;

    if (nuevoEstadoSol) {
      estadoSolicitud = nuevoEstadoSol;

      // Felicitación al CLIENTE cuando el tour queda LIQUIDADO (solo 'pagado').
      // Fail-soft: cualquier fallo del correo se loggea y NO afecta la respuesta
      // (el pago ya quedó bien marcado). La degradación a 'en_pagos' no manda nada.
      // [CONC-2] Va DESPUÉS de la pasada de verificación: felicitar y degradar en
      // el mismo request sería mandarle al cliente un «ya terminaste» que la
      // siguiente línea desmiente.
      if (nuevoEstadoSol === 'pagado') {
        try {
          const cli = Array.isArray(solicitud.clientes)
            ? (solicitud.clientes[0] || {})
            : (solicitud.clientes || {});
          const correo = cli.correo && String(cli.correo).trim();
          if (correo) {
            const nombre = String(cli.nombre_completo || 'cliente').trim().split(/\s+/)[0] || 'cliente';
            const evento = solicitud.evento_nombre || solicitudId || 'tu evento';
            const asunto = `🎉 ¡Listo! Tu viaje a ${evento} está pagado`;
            const cuerpo = `<p style="margin:0 0 14px 0">¡Felicidades! Terminaste de pagar tu viaje a <strong>${escapeHtml(evento)}</strong>. Tu lugar está <strong>100% asegurado</strong>.</p>
        <p style="margin:0">Pronto te compartiremos los detalles finales. ¡Nos vemos pronto!</p>`;
            await enviarCorreo(correo, asunto, wrapHtml(nombre, cuerpo));
          }
        } catch (e) {
          console.error('[marcar-pago] correo liquidado falló (no crítico):', e.message);
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        pago,
        solicitud_id: solicitudId,
        solicitud_estado: estadoSolicitud,
        solicitud_estado_cambio: nuevoEstadoSol,
      }),
    };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error marcando el pago', detail: e.message }) };
  }
}

module.exports = { aplicarNucleo, TOLERANCIA_MXN };

// ----- helpers (movidos junto con el núcleo que los usa) -----

// Fecha de hoy en zona horaria de México (America/Monterrey), formato YYYY-MM-DD.
// en-CA produce el formato ISO de fecha directamente.
function hoyMx() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Monterrey',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}

// ----- correo (mismo patrón/estilo que portal-morosidad-diario.js) -----

// Remitente de cara al CLIENTE (no el de Kamehouse, que es interno del equipo).
const FROM = process.env.RESEND_FROM_COBRANZA || 'Conecta Reynosa <admin@conectareynosa.mx>';

// Envío fail-soft: devuelve true si se despachó, false si faltó key/destinatario
// o el fetch falló. NUNCA lanza (el .catch absorbe).
async function enviarCorreo(to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return false;
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  }).catch((e) => { console.error('[marcar-pago] Email:', e.message); return null; });
  return !!(r && r.ok);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Envoltura HTML simple (saludo + párrafo + cierre), estilo Conecta Reynosa.
function wrapHtml(nombre, cuerpoHtml) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span>
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">${cuerpoHtml}</div>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Equipo Conecta Reynosa</p>
  </div>
</body></html>`;
}
