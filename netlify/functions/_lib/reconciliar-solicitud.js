// =============================================================================
// _lib/reconciliar-solicitud.js — UNA reconciliación, no cuatro (CONC-4a)
// =============================================================================
// Esto no es código nuevo: es el bloque que CONC-2 arregló en `_lib/marcar-pago`,
// MOVIDO a donde se pueda usar una vez. Vivía en CUATRO copias —el embudo,
// `admin-aplicar-pago-grupo`, `admin-lugar-baja` y `admin-lugar-traspasar`— con
// el MISMO sha1 del núcleo del dinero (935668ef sobre 373 caracteres
// normalizados). CONC-2 arregló una. Las otras tres seguían con el defecto.
//
// ⚠️ Y el comentario del propio embudo decía «las 3 idénticas». Eran cuatro. Una
// lista a mano al lado de la realidad: por eso el careo de las copias se hace
// por sha1 del bloque, no leyendo.
//
// ── Qué hace, y qué NO ──────────────────────────────────────────────────────
// Hace: leer las cuotas, decidir el estado, escribirlo con su guarda en la URL,
// y una pasada de verificación. Devuelve QUÉ cambió.
// NO hace: el correo. Los cuatro llaman al cliente con textos distintos y desde
// contextos distintos —uno relee la solicitud, otro trae el cliente aparte—, así
// que el correo se queda en cada quien. Extraer de más habría cambiado
// comportamiento, y esto es un movimiento, no un cambio.
//
// ── Por qué la decisión NO mira el estado anterior ──────────────────────────
// Porque esa lectura envejece. El defecto medido: A marca la última cuota, B
// revierte otra, y B se calla porque su `estadoPrevio` decía 'en_pagos' cuando A
// ya la había puesto en 'pagado'. Quedaba una solicitud LIQUIDADA con una cuota
// viva, sin un solo error a la vista. Las dos guardas son las de siempre,
// palabra por palabra — lo único que cambió es CUÁNDO se leen:
//     promover  ⇔ `estadoPrevio !== 'pagado'`  →  &estado=neq.pagado
//     degradar  ⇔ `estadoPrevio === 'pagado'`  →  &estado=eq.pagado
//
// ❓ PREGUNTA ABIERTA PARA MEMO (Jane, 30-ago): `&estado=neq.pagado` alcanza a
// CUALQUIER estado que no sea 'pagado', `'cancelado'` incluido. Es decir: marcar
// una cuota de una solicitud CANCELADA la pondría en 'pagado'. Es regla de
// dinero ANTERIOR a toda la serie —BASE hacía exactamente lo mismo— y se
// preserva a propósito: un refactor promete que el sistema es EL MISMO, no que
// es bueno. La pregunta con nombre es de Memo: ¿debe poder? El instinto de Jane
// dice que no y que ahí hay un bug de negocio dormido. NO SE TOCA HASTA LA FIRMA.
// =============================================================================

const { noAlcanzo, PREFER_VER_FILAS } = require('./candado-optimista');

const TOLERANCIA_MXN = 1; // absorbe redondeos de centavos en el reparto del plan

// [F5] Sobre CUOTAS VIVAS (estado !== 'cancelado'). Tras una baja de lugar (#239)
// sus cuotas no pagadas quedan 'cancelado'; se EXCLUYEN para que el grupo pueda
// liquidar lo de los lugares vivos. Sin bajas, las vivas ≡ el plan completo
// (Σ vivas ≈ precio_total, misma tolerancia de $1 por centavos).
function decidirEstado(cuotas) {
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
}

const CONDICION_DESTINO = { pagado: '&estado=neq.pagado', en_pagos: '&estado=eq.pagado' };

// reconciliarSolicitud({ sbUrl, sbHeaders, solicitudId, cuotas? })
//   → { ok: true,  cambio: 'pagado' | 'en_pagos' | null }
//   → { ok: false, error: '<qué falló>' }
// `cambio` es null cuando no hizo falta escribir (la solicitud ya estaba como
// debía, o está en un estado ajeno como 'cancelado' que ninguna guarda alcanza).
// `cuotas` es opcional: si el llamador ya las tiene, se ahorra la lectura — pero
// la pasada de verificación SIEMPRE relee, que es su razón de existir.
async function reconciliarSolicitud({ sbUrl, sbHeaders, solicitudId, cuotas }) {
  const urlCuotas = `${sbUrl}/rest/v1/pagos?solicitud_id=eq.${solicitudId}&select=estado,monto,monto_pagado`;

  let todos = cuotas;
  if (!Array.isArray(todos)) {
    const r = await fetch(urlCuotas, { headers: sbHeaders });
    if (!r.ok) return { ok: false, error: 'consulta de pagos: ' + await r.text() };
    todos = await r.json().catch(() => null);
    if (!Array.isArray(todos)) return { ok: false, error: 'consulta de pagos: respuesta ilegible' };
  }

  const escribir = async (destino) => {
    const r = await fetch(`${sbUrl}/rest/v1/solicitudes_tour?id=eq.${solicitudId}${CONDICION_DESTINO[destino]}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: PREFER_VER_FILAS },
      body: JSON.stringify({ estado: destino }),
    });
    if (!r.ok) return { ok: false, error: 'reconciliación del estado: ' + await r.text() };
    return { ok: true, aterrizo: !noAlcanzo(await r.json().catch(() => null)) };
  };

  const destino = decidirEstado(todos);
  let cambio = null;
  const esc = await escribir(destino);
  if (!esc.ok) return esc;
  if (esc.aterrizo) cambio = destino;

  // PASADA DE VERIFICACIÓN. Cierra el hueco que la condición de estado sola no
  // puede cerrar: la lectura de cuotas puede ser anterior a la escritura de otro,
  // y entonces la decisión nace vieja. Esta relectura ocurre DESPUÉS de nuestra
  // propia escritura, así que ve todo lo que aterrizó antes. Es UNA sola pasada,
  // a propósito, y su límite se dice en voz alta: un escritor que aterrice
  // después de esta relectura queda para SU propia reconciliación, que corre
  // después de la suya.
  const verifR = await fetch(urlCuotas, { headers: sbHeaders });
  if (verifR.ok) {
    const ahora = await verifR.json().catch(() => null);
    if (Array.isArray(ahora) && ahora.length) {
      const destino2 = decidirEstado(ahora);
      if (destino2 !== destino) {
        const esc2 = await escribir(destino2);
        if (!esc2.ok) return esc2;
        if (esc2.aterrizo) cambio = destino2;
      }
    }
  }

  return { ok: true, cambio };
}

module.exports = { reconciliarSolicitud, decidirEstado, CONDICION_DESTINO, TOLERANCIA_MXN };
