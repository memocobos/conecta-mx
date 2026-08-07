// =============================================================================
// admin-gasto-crear  (G1 — pestaña Gastos sobre el PORTAL, ESCRITURA)
//
// Inserta un gasto en public.gastos del PORTAL. Reemplaza el viejo db.post a
// gastos_generales (Supabase de KH). El cliente NUNCA escribe gastos; todo pasa
// por esta función con service_role.
//
// Body JSON: { concepto, monto, fecha, categoria, metodo_pago, evento_id, notas }
//   - Obligatorios: concepto, monto (>= 0), fecha.
//   - evento_id: base o base#idx del EV; vacío/ausente = General (null).
//   - registrado_por se toma del JWT (correo del admin), NO del body.
//
// Seguridad: verifyAdminAuth(['maestro_roshi','bulma']) + corsCheck.
// service_role SOLO aquí. Reusa PORTAL_SUPABASE_* — sin env vars nuevas.
//
// [FIN-1a] UNA CAPTURA, DOS LIBROS
// -----------------------------------------------------------------------------
// Si el gasto va dirigido a un proveedor (`proveedor_id`) y se pide abonar
// (`abonar`, default true), este mismo guardado ABONA su deuda en KH. Un
// movimiento de dinero real = un registro para el usuario.
//
// LOS DOS MUNDOS NO COMPARTEN TRANSACCIÓN (KH y Portal son dos bases). El orden
// de escritura NO es un detalle: define qué mentira es posible.
//
//   1) ABONO en KH        ← primero
//   2) GASTO en Portal, con abono_id YA dentro del mismo INSERT
//   3) si (2) falla → se BORRA el abono de (1) (compensación)
//   4) si la compensación también falla → 502 diciendo el id exacto del abono
//      que quedó vivo, para borrarlo a mano. Nunca un "no se pudo" mudo.
//
// POR QUÉ ESE ORDEN. El estado PROHIBIDO es "un gasto que DICE que abonó sin su
// abono existiendo": con este orden es INALCANZABLE, porque el abono existe
// antes de que la fila del gasto exista. El estado tolerado es el inverso —un
// abono sin gasto—, que solo dura entre (1) y (2), se compensa en (3), y si todo
// falla queda VISIBLE en el Palacio con su nota "desde gasto: …".
//
// PERMISOS: adjuntar proveedor es de maestro_roshi. `abonos` es del Palacio
// (admin-abonos = solo maestro_roshi) y esta función la usan también bulma y
// milk: dejarlas abonar por la puerta de atrás ensancharía un permiso sin
// decirlo. Sin proveedor, bulma y milk capturan gastos igual que siempre.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { validarMonto } = require('./_lib/monto-limites');
// [AUD-1g] El catálogo de categorías vive en UN solo lugar.
const { esValida: esValidaCategoria, errorCategoria } = require('./_lib/categorias-gasto');

const CUENTAS = ['BBVA', 'Banamex', 'Efectivo', 'Otro'];
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma', 'milk']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  // ── Validación ───────────────────────────────────────────────────────────
  const concepto = (typeof body.concepto === 'string') ? body.concepto.trim() : '';
  const fecha    = (typeof body.fecha === 'string') ? body.fecha.trim() : '';
  const monto    = Number(body.monto);

  if (!concepto)                       return { statusCode: 400, headers, body: JSON.stringify({ error: 'El concepto es obligatorio' }) };
  // 💰 CAP3-1: tope de cordura (un dedazo de 3 ceros distorsiona la caja real
  // y de ahí las comisiones del 30%).
  const _vm = validarMonto(monto);
  if (!_vm.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: _vm.error }) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'La fecha es obligatoria (YYYY-MM-DD)' }) };

  const eventoId = (typeof body.evento_id === 'string' && body.evento_id.trim()) ? body.evento_id.trim() : null;
  if (eventoId && (eventoId.length > 80 || !/^[A-Za-z0-9_.#\-]+$/.test(eventoId))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
  }
  const categoria  = (typeof body.categoria === 'string' && body.categoria.trim()) ? body.categoria.trim().slice(0, 60) : null;
  // [AUD-1g] El catálogo manda: una categoría fuera de él se rechaza aquí, no
  // se guarda "a ver qué pasa". Es lo que dejó pasar `hotel` en la migración.
  if (!esValidaCategoria(categoria)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: errorCategoria(categoria) }) };
  }
  const metodoPago = (typeof body.metodo_pago === 'string' && body.metodo_pago.trim()) ? body.metodo_pago.trim().slice(0, 60) : null;

  // Cuenta de la que salió el gasto (para el futuro visor de saldos). Opcional,
  // pero si viene debe ser uno de los 4 valores permitidos.
  const cuenta = (typeof body.cuenta === 'string' && body.cuenta.trim()) ? body.cuenta.trim() : null;
  if (cuenta && !CUENTAS.includes(cuenta)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'cuenta inválida' }) };
  }
  const notas      = (typeof body.notas === 'string' && body.notas.trim()) ? body.notas.trim().slice(0, 1000) : null;

  const registradoPor = (auth.user && (auth.user.correo || auth.user.rol)) || null;

  // [FIN-1a] El proveedor al que va dirigido el gasto, si va a alguno.
  const proveedorId = (typeof body.proveedor_id === 'string' && body.proveedor_id.trim()) ? body.proveedor_id.trim() : null;
  if (proveedorId && !UUID_RE.test(proveedorId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'proveedor_id inválido' }) };
  }
  if (proveedorId && (auth.user || {}).rol !== 'maestro_roshi') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo maestro_roshi puede dirigir un gasto a un proveedor' }) };
  }
  // La casilla viene MARCADA por default (decisión de Memo, firmada en FIN-1).
  const abonar = proveedorId ? (body.abonar !== false) : false;
  // Un abono sin evento no se puede colgar de ninguna deuda: la deuda es POR evento.
  if (abonar && !eventoId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Para abonar a un proveedor, el gasto tiene que ser de un evento' }) };
  }
  const envKH = readEnvKH();
  if (abonar && envKH.error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: envKH.error }) };
  }

  const sbHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // ── (1) EL ABONO EN KH, PRIMERO ────────────────────────────────────────────
  // Ver la cabecera: primero el abono para que "gasto que dice que abonó sin
  // abono" sea un estado inalcanzable.
  let abonoId = null;
  if (abonar) {
    const khHeaders = {
      apikey: envKH.KH_SB_SERVICE,
      Authorization: 'Bearer ' + envKH.KH_SB_SERVICE,
      'Content-Type': 'application/json',
    };
    try {
      // El proveedor tiene que existir: la FK truena con un mensaje que no le
      // dice nada a Memo (mismo criterio que PRV-2).
      const rp = await fetch(`${envKH.KH_SB_URL}/rest/v1/proveedores?id=eq.${proveedorId}&select=id&limit=1`, { headers: khHeaders });
      if (!rp.ok) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo verificar el proveedor', detail: await rp.text() }) };
      }
      const filas = await rp.json();
      if (!Array.isArray(filas) || !filas.length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'El proveedor no existe' }) };
      }
      const ra = await fetch(`${envKH.KH_SB_URL}/rest/v1/abonos`, {
        method: 'POST',
        headers: { ...khHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({
          evento_id: eventoId,
          proveedor_id: proveedorId,
          monto,
          fecha,
          // La nota la genera el sistema: un abono huérfano tiene que poder
          // reconocerse a simple vista en el Palacio.
          nota: `desde gasto: ${concepto}`.slice(0, 500),
        }),
      });
      if (!ra.ok) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo abonar al proveedor; el gasto NO se registró', detail: await ra.text() }) };
      }
      const arows = await ra.json();
      abonoId = (Array.isArray(arows) ? arows[0] : arows || {}).id || null;
      if (!abonoId) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'El abono se creó sin id; el gasto NO se registró' }) };
      }
    } catch (e) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error abonando al proveedor; el gasto NO se registró', detail: e.message }) };
    }
  }

  // ── (2) EL GASTO EN PORTAL, con su abono_id DENTRO del mismo insert ────────
  try {
    const r = await fetch(`${env.PORTAL_SB_URL}/rest/v1/gastos`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({
        evento_id: eventoId,
        concepto,
        monto,
        categoria,
        cuenta,
        metodo_pago: metodoPago,
        fecha,
        notas,
        registrado_por: registradoPor,
        proveedor_id: proveedorId,
        abono_id: abonoId,
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      // ── (3) COMPENSACIÓN: el abono no puede quedarse solo ──────────────────
      const comp = await _borrarAbono(envKH, abonoId);
      return { statusCode: 502, headers, body: JSON.stringify(comp.ok
        ? { error: 'Supabase rechazó el insert del gasto. No quedó nada a medias: el abono se revirtió.', detail }
        : _errorAMedias(abonoId, detail)) };
    }
    const inserted = await r.json();
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, gasto: Array.isArray(inserted) ? inserted[0] : inserted, abono_id: abonoId }) };
  } catch (e) {
    const comp = await _borrarAbono(envKH, abonoId);
    return { statusCode: 502, headers, body: JSON.stringify(comp.ok
      ? { error: 'Error registrando el gasto. No quedó nada a medias: el abono se revirtió.', detail: e.message }
      : _errorAMedias(abonoId, e.message)) };
  }
};

// Borra un abono de KH. `null` = no había nada que borrar (éxito trivial).
async function _borrarAbono(envKH, abonoId) {
  if (!abonoId) return { ok: true };
  try {
    const r = await fetch(`${envKH.KH_SB_URL}/rest/v1/abonos?id=eq.${abonoId}`, {
      method: 'DELETE',
      headers: {
        apikey: envKH.KH_SB_SERVICE,
        Authorization: 'Bearer ' + envKH.KH_SB_SERVICE,
        Prefer: 'return=minimal',
      },
    });
    return { ok: r.ok };
  } catch (_) { return { ok: false }; }
}

// El peor caso: el gasto no entró y el abono tampoco se pudo revertir. NO se
// devuelve un "no se pudo" mudo — se dice el id exacto de lo que quedó vivo.
function _errorAMedias(abonoId, detail) {
  return {
    error: 'El gasto NO se registró, pero el abono al proveedor SÍ quedó y no se pudo revertir. '
         + `Bórralo a mano en el Palacio (abono ${abonoId}) antes de reintentar.`,
    abono_huerfano: abonoId,
    detail,
  };
}

// ----- helpers -----

// [FIN-1a] KH solo hace falta cuando el gasto abona. Se lee aparte para que un
// gasto normal siga funcionando aunque las env de KH no estén.
function readEnvKH() {
  const KH_SB_URL     = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}

function readEnv() {
  const PORTAL_SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}
