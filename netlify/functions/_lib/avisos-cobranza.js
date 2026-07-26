// =============================================================================
// _lib/avisos-cobranza.js — ⏰ CAP4-1: bitácora "ya le avisé hoy"
//
// EL HUECO: de los 10 crons notificadores solo 3 llevaban marca de aviso. Los
// TRES de cobranza no, así que un doble disparo el mismo día —un reintento de
// Netlify o un "Run now" manual, que es el escenario probable— manda el correo
// DUPLICADO a cada cliente. Con ~150 clientes activos, 150 correos repetidos.
//
// Tabla `avisos_cobranza` (Portal; SQL ya corrido):
//   id uuid PK · tipo text · pago_id uuid · solicitud_id uuid · cliente_correo
//   text · dia date · nivel int · enviado_at timestamptz
//   UNIQUE INDEX avisos_cobranza_uq (tipo, pago_id, dia, COALESCE(nivel,0))
//
// PATRÓN (el de la casa): INSERT DIRECTO, JAMÁS on_conflict. Si choca con
// 23505/409 significa que ese aviso YA salió hoy → se salta sin mandar correo.
// La marca se pone ANTES de enviar: entre "mandar dos veces" y "marcar de más",
// lo segundo es recuperable — y si el envío falla, la marca se BORRA.
//
// POR QUÉ BORRAR Y NO MARCAR 'fallido': una fila marcada como fallida seguiría
// OCUPANDO ese cupo, así que el siguiente intento chocaría igual y el cliente se
// quedaría sin su aviso. Borrar libera el cupo y el reintento sale limpio. El
// riesgo al revés (borrar una marca cuyo correo sí salió, porque la API reportó
// error) es un duplicado ocasional — mucho mejor que un cliente que nunca se
// entera de que debe.
//
// FAIL-OPEN: si la tabla no existe o la consulta falla, se manda el correo
// igual + console.warn. Mejor un duplicado que un cliente sin aviso.
//
// 🔢 CAP4-2 — EL NIVEL ENTRA EN LA LLAVE. Antes el UNIQUE era (tipo,pago_id,dia)
// y un cliente que SUBÍA de nivel el mismo día (le marcan otra cuota vencida y
// pasa de nivel 1 a 2 entre dos corridas) se quedaba sin el aviso más grave: el
// segundo correo se veía como duplicado. Con COALESCE(nivel,0) en la llave:
//   · mismo nivel dos veces el mismo día → sigue siendo duplicado (no se manda);
//   · nivel 1 y luego nivel 2 el mismo día → son cupos distintos, SÍ se manda;
//   · 'recordatorio' y 'vence_hoy' no llevan nivel → siempre NULL → COALESCE lo
//     vuelve 0, una constante, así que su protección diaria queda IDÉNTICA.
//
// El COALESCE es indispensable: en SQL NULL != NULL, así que un UNIQUE con
// `nivel` a secas dejaría pasar TODOS los duplicados de esos dos tipos.
// =============================================================================

const TIPOS = ['recordatorio', 'vence_hoy', 'morosidad'];

// Intenta APARTAR el aviso. Devuelve:
//   { enviar:true }                    → cupo apartado, manda el correo
//   { enviar:false, duplicado:true }   → ya se avisó hoy, salta
//   { enviar:true, sinBitacora:true }  → no se pudo registrar; manda igual
async function apartarAviso({ portalUrl, portalHeaders, tipo, pagoId, solicitudId, correo, dia, nivel }) {
  if (!TIPOS.includes(tipo)) {
    console.warn('[avisos-cobranza] tipo desconocido:', tipo, '— se manda sin bitácora');
    return { enviar: true, sinBitacora: true };
  }
  if (!pagoId || !dia) {
    console.warn('[avisos-cobranza] falta pago_id o dia — se manda sin bitácora');
    return { enviar: true, sinBitacora: true };
  }
  try {
    const r = await fetch(`${portalUrl}/rest/v1/avisos_cobranza`, {
      method: 'POST',
      headers: { ...portalHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        tipo,
        pago_id: pagoId,
        solicitud_id: solicitudId || null,
        cliente_correo: correo || null,
        dia,
        nivel: (nivel == null ? null : Number(nivel)),
        enviado_at: new Date().toISOString(),
      }),
    });
    if (r.ok) return { enviar: true };

    const detail = await r.text().catch(() => '');
    // OJO: se busca la VIOLACIÓN DE UNICIDAD, no el nombre de la tabla. Poner
    // `avisos_cobranza` en este regex hacía que CUALQUIER error que mencione la
    // tabla —"relation avisos_cobranza does not exist", por ejemplo— se
    // disfrazara de duplicado y se tragara el correo. Mismo error que el 409
    // genérico de contratos-viajeros (AUD-3): confirmar la causa, no adivinarla.
    // `avisos_cobranza_uq` es el nombre del ÍNDICE, no el de la tabla: un
    // "relation avisos_cobranza does not exist" NO lo matchea (le falta _uq).
    if (/23505|duplicate key|avisos_cobranza_uq/i.test(detail)) {
      return { enviar: false, duplicado: true };
    }
    console.warn(`[avisos-cobranza] FAIL-OPEN: la bitácora respondió ${r.status} — se manda el correo igual`);
    return { enviar: true, sinBitacora: true };
  } catch (e) {
    console.warn('[avisos-cobranza] FAIL-OPEN: excepción —', e.message, '— se manda el correo igual');
    return { enviar: true, sinBitacora: true };
  }
}

// Libera el cupo cuando el correo NO salió, para que el siguiente intento pueda
// reenviar. Best-effort: si falla, se loguea (el peor caso es un aviso perdido
// hasta mañana, no un error visible).
async function liberarAviso({ portalUrl, portalHeaders, tipo, pagoId, dia, nivel }) {
  if (!pagoId || !dia) return;
  try {
    // ⚠️ CAP4-2: el filtro DEBE incluir el nivel. Sin él, si el correo de
    // nivel 2 falla, este DELETE se llevaría también la marca del nivel 1 que
    // YA se mandó bien — y ese aviso saldría duplicado en la siguiente corrida.
    // Se borra EXACTAMENTE el cupo que se apartó, ni uno más.
    const filtroNivel = (nivel == null || !Number.isFinite(Number(nivel)))
      ? '&nivel=is.null'
      : `&nivel=eq.${Number(nivel)}`;
    const r = await fetch(
      `${portalUrl}/rest/v1/avisos_cobranza?tipo=eq.${encodeURIComponent(tipo)}`
      + `&pago_id=eq.${encodeURIComponent(pagoId)}&dia=eq.${encodeURIComponent(dia)}`
      + filtroNivel,
      { method: 'DELETE', headers: portalHeaders }
    );
    if (!r.ok) console.warn('[avisos-cobranza] no se pudo liberar la marca', tipo, pagoId, r.status);
  } catch (e) {
    console.warn('[avisos-cobranza] excepción liberando la marca:', e.message);
  }
}

module.exports = { apartarAviso, liberarAviso, TIPOS };
