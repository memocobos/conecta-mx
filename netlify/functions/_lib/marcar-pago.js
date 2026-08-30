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
//
// Las SEIS escrituras DE CONJUNTO sobre `pagos` quedan fuera a propósito: una
// versión por fila no cabe en un PATCH que toca veinte. Están nombradas una por
// una en el acta —la sexta es el cron de vencidos, que se escondía detrás de un
// ayudante que antepone `rest/v1/`—. No las completes por simetría.
// =============================================================================

const { aplicarModoPrueba } = require('./correo-guard');
const { condicionVersion, noAlcanzo, respuestaChoque, PREFER_VER_FILAS } = require('./candado-optimista');

const TOLERANCIA_MXN = 1; // absorbe redondeos de centavos en el reparto del plan

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

    // [F5] Reconciliación sobre CUOTAS VIVAS (estado !== 'cancelado'). Tras una baja
    // de lugar (#239) sus cuotas no pagadas quedan 'cancelado'; se EXCLUYEN para que
    // el grupo pueda liquidar lo de los lugares vivos. Sin bajas, las vivas ≡ el plan
    // completo (Σ vivas ≈ precio_total, misma tolerancia de $1 por centavos).
    // MISMA transformación en admin-aplicar-pago-grupo y admin-lugar-baja (las 3 idénticas).
    // [CONC-2] La decisión sale SOLO de las cuotas. Antes miraba también
    // `estadoPrevio` —la lectura de arriba— y ahí estaba el defecto: esa lectura
    // envejece mientras otro escritor cambia la misma fila. El caso medido: A marca
    // la última cuota, B revierte otra, y B se calla porque su `estadoPrevio` decía
    // 'en_pagos' cuando A ya la había puesto en 'pagado'. Quedaba una solicitud
    // LIQUIDADA con una cuota viva, sin un solo error a la vista.
    const decidir = (cuotas) => {
      // [F5] Sobre CUOTAS VIVAS (estado !== 'cancelado'). Tras una baja de lugar
      // (#239) sus cuotas no pagadas quedan 'cancelado'; se EXCLUYEN para que el
      // grupo pueda liquidar lo de los lugares vivos.
      const vivas = (Array.isArray(cuotas) ? cuotas : []).filter(p => p && p.estado !== 'cancelado');
      // Dinero REAL cobrado de las VIVAS pagadas = COALESCE(monto_pagado, monto). Lo
      // pagado de un lugar dado de baja es historia contable (se retuvo) pero NO
      // cuenta aquí — simetría con excluirlo del esperado.
      const sumaReal = vivas.reduce((acc, p) => {
        if (p.estado !== 'pagado') return acc;
        const real = (p.monto_pagado == null) ? Number(p.monto || 0) : Number(p.monto_pagado || 0);
        return acc + (Number.isFinite(real) ? real : 0);
      }, 0);
      // Esperado = Σ monto de las VIVAS (ya no precio_total: tras una baja, lo
      // esperado es lo de los lugares vivos).
      const esperado = vivas.reduce((acc, p) => acc + (Number(p.monto || 0) || 0), 0);
      const dineroCuadra = sumaReal >= (esperado - TOLERANCIA_MXN);
      // 'pagado' exige AMBAS: todas las cuotas VIVAS con palomita Y que el dinero
      // real cuadre contra lo esperado (tol $1).
      const todosPagados = vivas.length > 0 && vivas.every(p => p.estado === 'pagado');
      return (todosPagados && dineroCuadra) ? 'pagado' : 'en_pagos';
    };

    // La guarda que ANTES vivía en JS ahora viaja en la URL, y por eso ya no puede
    // envejecer: la evalúa Postgres en el instante de escribir.
    //   promover  ⇔ `estadoPrevio !== 'pagado'`  →  &estado=neq.pagado
    //   degradar  ⇔ `estadoPrevio === 'pagado'`  →  &estado=eq.pagado
    // Las dos condiciones son las de siempre, palabra por palabra. Lo único que
    // cambió es CUÁNDO se leen. Si no alcanzan a nadie, la solicitud ya estaba como
    // queríamos (o en un estado ajeno, p.ej. 'cancelado') y no se escribe: mismo
    // comportamiento que el `if (nuevoEstadoSol)` de antes.
    const CONDICION_DESTINO = { pagado: '&estado=neq.pagado', en_pagos: '&estado=eq.pagado' };
    const escribirEstado = async (destino) => {
      const r = await fetch(
        `${env.PORTAL_SB_URL}/rest/v1/solicitudes_tour?id=eq.${solicitudId}${CONDICION_DESTINO[destino]}`, {
          method: 'PATCH',
          headers: { ...sbHeaders, Prefer: PREFER_VER_FILAS },
          body: JSON.stringify({ estado: destino }),
        });
      if (!r.ok) return { ok: false, detail: await r.text() };
      return { ok: true, aterrizo: !noAlcanzo(await r.json().catch(() => null)) };
    };

    const destino = decidir(todos);
    let nuevoEstadoSol = null;
    let esc = await escribirEstado(destino);
    if (!esc.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Pago actualizado, pero falló la reconciliación del estado de la solicitud', detail: esc.detail }) };
    }
    if (esc.aterrizo) nuevoEstadoSol = destino;

    // [CONC-2] PASADA DE VERIFICACIÓN. Cierra el hueco que la condición de estado
    // sola no puede cerrar: la lectura de cuotas de arriba puede ser anterior a la
    // escritura de otro, y entonces la decisión nace vieja. Esta relectura ocurre
    // DESPUÉS de nuestra propia escritura, así que ve todo lo que aterrizó antes.
    // Es UNA sola pasada, a propósito: no es un reintento en bucle, y su límite se
    // dice en voz alta — un escritor que aterrice después de esta relectura queda
    // para SU propia reconciliación, que corre después de la suya.
    const verifR = await fetch(allUrl, { headers: sbHeaders });
    if (verifR.ok) {
      const todosAhora = await verifR.json().catch(() => null);
      if (Array.isArray(todosAhora) && todosAhora.length) {
        const destino2 = decidir(todosAhora);
        if (destino2 !== destino) {
          const esc2 = await escribirEstado(destino2);
          if (!esc2.ok) {
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'Pago actualizado, pero falló la reconciliación del estado de la solicitud', detail: esc2.detail }) };
          }
          if (esc2.aterrizo) nuevoEstadoSol = destino2;
        }
      }
    }

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
