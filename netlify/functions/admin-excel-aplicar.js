// =============================================================================
// admin-excel-aplicar — EL BOTÓN QUE APLICA EL CAREO (CUADRE-1b)
// =============================================================================
// Body: { evento_id, confirmar?:true, solo?:'abonos'|'totales'|'altas', claves?:[] }
// → sin `confirmar`: { ok, plan:{abonos,totales,altas,negativas,saltados} }
// → con `confirmar`: { ok, plan, resultado:{abonos,totales,altas,errores} }
//
// Es lo que Jane hacía a mano con SQL cada noche. Roles maestro_roshi y bulma,
// mismo molde que el careo.
//
// ═══ LA REGLA DE ORO: EL SERVIDOR RECALCULA ═══════════════════════════════
// El navegador manda `evento_id` y QUÉ aplicar. NUNCA montos. Aquí se corre el
// careo COMPLETO otra vez —cosecha fresca del Excel, base fresca— y se escribe
// sobre ESE resultado. Un JSON viejo del cliente diciendo «págale $5,000 a
// Fulano» es la mentira perfecta: llega firmada por un admin de verdad y no
// hay forma de distinguirla de la buena.
//
// 🔒 Y DE AHÍ SALE LA IDEMPOTENCIA, que NO es un candado de UNIQUE: tras la
// primera pasada el careo fresco ya no encuentra esas diferencias, así que el
// segundo clic no tiene nada que escribir. Aplicar dos veces es inofensivo
// porque la pregunta se vuelve a hacer, no porque la base rechace la repetida.
//
// ⚠️ EL PRESUPUESTO DE TIEMPO ES REAL. Medido el 20-sep contra producción: la
// cosecha del Apps Script tarda ~2 s (7 s en frío) y Netlify corta a los 10.
// Por eso los abonos van en UN SOLO INSERT de arreglo y los totales en PATCHes
// en paralelo por tandas — no por elegancia, por el reloj.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { correrCareo, SB_URL } = require('./_lib/excel-careo-correr');
const { planear, hoyReynosa, MONTONES_APLICABLES } = require('./_lib/excel-aplicar');

const TANDA = 8;   // cuántos PATCH en paralelo. Ni uno por uno (lento), ni 300 de golpe.

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin', 'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const eventoId = (typeof body.evento_id === 'string') ? body.evento_id.trim() : '';
  if (!eventoId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta evento_id' }) };

  // 🔒 LA LISTA BLANCA, ANTES DE TOCAR NADA. `solo:'bajas'` y `solo:'ambiguos'`
  // se rehúsan aquí: no es que no encuentren filas, es que NO TIENEN PUERTA.
  // Una baja es una persona y sigue pidiendo firma; elegir entre dos homónimos
  // es inventar el dato que falta.
  const solo = body.solo == null ? null : String(body.solo);
  if (solo && !MONTONES_APLICABLES.includes(solo)) {
    return { statusCode: 400, headers, body: JSON.stringify({
      error: `«${solo}» no se aplica desde aquí. Se puede: ${MONTONES_APLICABLES.join(', ')}.`
           + ' Las BAJAS y los AMBIGUOS no se aplican nunca: una baja es una persona y espera firma,'
           + ' y elegir entre dos homónimos sería inventar el dato que falta.',
      codigo: 'MONTON_NO_APLICABLE' }) };
  }
  const claves = Array.isArray(body.claves) ? body.claves.map(String).slice(0, 2000) : null;

  // ── EL CAREO, FRESCO ──────────────────────────────────────────────────────
  const careo = await correrCareo(eventoId);
  if (careo.error) {
    const e = careo.error;
    return { statusCode: e.status || 502, headers, body: JSON.stringify({
      error: e.mensaje, codigo: e.codigo, detail: e.detail, pestana: e.pestana, pestanas: e.pestanas }) };
  }

  const plan = planear(careo, { solo, claves });
  const pestanaNombre = (careo.pestanas || []).map((p) => p.pestana).join(' + ');

  // ── VISTA PREVIA OBLIGATORIA ──────────────────────────────────────────────
  // Sin `confirmar`, NO SE ESCRIBE NADA. El patrón del puente al Portal: se
  // enseñan NOMBRES y MONTOS y un segundo clic confirma. Un número pelón no se
  // confirma.
  if (body.confirmar !== true) {
    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true, evento_id: eventoId, pestanas: pestanaNombre, confirmado: false, plan,
      resumen: { abonos: plan.abonos.length, monto_abonos: plan.abonos.reduce((a, x) => a + x.monto, 0),
                 totales: plan.totales.length, altas: plan.altas.length,
                 negativas: plan.negativas.length, saltados: plan.saltados.length } }) };
  }

  const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const sb = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
  const hoy = hoyReynosa();
  // `capturado_por` sale del TOKEN, nunca del cliente — el mismo anti-spoofing
  // que `abono_crear`: quien registró el dinero no se puede inventar.
  const quien = (auth.user && (auth.user.nombre || auth.user.username || auth.user.correo)) || (auth.user && auth.user.id) || 'careo';
  const resultado = { abonos: [], totales: [], altas: [], errores: [] };

  // ── 1. LOS ABONOS, EN UN SOLO INSERT ──────────────────────────────────────
  // Un arreglo en un POST: una sola ida y vuelta para todos. Sin `on_conflict`
  // (regla de la casa) — la idempotencia la da el re-careo, no la base.
  if (plan.abonos.length) {
    const filas = plan.abonos.map((x) => ({
      viajero_id: x.viajero_id, monto: x.monto, fecha: hoy, capturado_por: quien,
      nota: `Careo Excel ${(x.pestanas && x.pestanas[0]) || pestanaNombre} ${hoy}`,
    }));
    const r = await fetch(`${SB_URL}/rest/v1/abonos_viajero`, {
      method: 'POST', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify(filas),
    });
    if (!r.ok) resultado.errores.push({ paso: 'abonos', detalle: (await r.text()).slice(0, 300) });
    else {
      const puestas = await r.json().catch(() => []);
      resultado.abonos = plan.abonos.map((x, i) => ({ nombre: x.nombre, viajero_id: x.viajero_id,
        monto: x.monto, abono_id: (puestas[i] || {}).id || null }));
    }
  }

  // ── 2. LOS TOTALES, UN PATCH POR FILA ─────────────────────────────────────
  // No hay bulk update con valores distintos que no sea un upsert, y el upsert
  // está prohibido en esta casa. Se paralelizan por tandas para caber en el
  // reloj de Netlify.
  //
  // 🔒 LA NOTA SE ANEXA, NO PISA. La nota vieja dice de dónde salió el total
  // derivado; borrarla dejaría la fila sin su historia justo cuando cambia.
  for (let i = 0; i < plan.totales.length; i += TANDA) {
    const tanda = plan.totales.slice(i, i + TANDA);
    await Promise.all(tanda.map(async (x) => {
      const notas = `${x.notas_previas || ''} · Total de pestaña (careo ${hoy})`.replace(/^ · /, '').slice(0, 1000);
      const r = await fetch(`${SB_URL}/rest/v1/viajeros_evento?id=eq.${encodeURIComponent(x.viajero_id)}`, {
        method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' },
        // ⚠️ SOLO estas dos columnas. `abonado_previo` está CONGELADO (VJ-3) y
        // no se menciona siquiera: lo que no se nombra no se puede pisar.
        body: JSON.stringify({ total_contrato: x.excel_total, notas }),
      });
      if (!r.ok) { resultado.errores.push({ paso: 'total', nombre: x.nombre, detalle: (await r.text()).slice(0, 200) }); return; }
      const filas = await r.json().catch(() => []);
      resultado.totales.push({ nombre: x.nombre, viajero_id: x.viajero_id,
        de: x.sistema_total, a: x.excel_total, tocadas: filas.length });
    }));
  }

  // ── 3. LAS ALTAS, POR LA PUERTA DE SIEMPRE ────────────────────────────────
  // 🔒 NO HAY INSERT NUEVO AQUÍ. Se invoca el handler REAL de
  // `admin-coordi-asignaciones` con la acción `viajero_migrar` —la misma que
  // usa el alta a mano del panel—, con el token del admin que apretó el botón.
  // Así el alta hereda TODO: su lista de roles, sus validaciones campo por
  // campo, el candado de que el evento exista, el sello `tipo_viajero:'cliente'`
  // del que depende `consumeBoleto`, y el aviso del doble descuento de MIG-1b.
  // Copiar el INSERT habría sido una segunda puerta que envejece sola.
  if (plan.altas.length) {
    const asign = require('./admin-coordi-asignaciones');
    for (const x of plan.altas) {
      const ev2 = {
        httpMethod: 'POST',
        headers: { origin: __origin, authorization: (event.headers && (event.headers.authorization || event.headers.Authorization)) || '' },
        body: JSON.stringify({
          accion: 'viajero_migrar', evento_id: eventoId, nombre: x.nombre,
          tipo_paquete: x.tipo_paquete, zona_boleto: x.zona_boleto,
          total_contrato: x.total_contrato, abonado_previo: x.abonado_previo,
          talla_playera: x.talla_playera || '',
          notas: `Alta por careo Excel ${(x.pestanas && x.pestanas[0]) || pestanaNombre} ${hoy}`
               + (x.origen === 'apartado' ? ' · apartado sin abonar (si está en el Excel, va)' : '')
               // La marca que hace que el careo de mañana la vuelva a levantar:
               // nació con el $0 de la pestaña, que no es un contrato de cero.
               + (x.total_pendiente ? ' · ⚠ total pendiente (la pestaña decía $0)' : ''),
        }),
      };
      const r2 = await asign.handler(ev2);
      let c2 = {}; try { c2 = JSON.parse(r2.body); } catch (_) {}
      if (r2.statusCode !== 200 || !c2.viajero) {
        resultado.errores.push({ paso: 'alta', nombre: x.nombre, status: r2.statusCode, detalle: String(c2.error || '').slice(0, 200) });
        continue;
      }
      resultado.altas.push({ nombre: x.nombre, viajero_id: c2.viajero.id, origen: x.origen,
        via: 'viajero_migrar', aviso_doble_descuento: c2.aviso_doble_descuento || null });
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify({
    ok: true, evento_id: eventoId, pestanas: pestanaNombre, confirmado: true, plan, resultado,
    resumen: { abonos: resultado.abonos.length, monto_abonos: resultado.abonos.reduce((a, x) => a + x.monto, 0),
               totales: resultado.totales.length, altas: resultado.altas.length,
               negativas: plan.negativas.length, saltados: plan.saltados.length,
               errores: resultado.errores.length } }) };
};
