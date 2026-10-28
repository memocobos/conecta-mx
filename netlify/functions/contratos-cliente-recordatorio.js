// =============================================================================
// contratos-cliente-recordatorio — CTR-RECUERDA-1 (27-oct-2026)
// =============================================================================
// El cron que le recuerda al CLIENTE que su contrato sigue sin firmar.
// Palabra de Memo: «los que faltan por firmar para estarles recordando cada
// cierto tiempo» → «así ármalo».
//
// 🔒 DOBLE INTERRUPTOR, los dos en _lib/contrato-cliente y los dos APAGADOS:
//    CONTRATO_CLIENTE_VIVO (el contrato entero) y RECORDATORIO_AUTO_VIVO (este
//    cron). Con cualquiera apagado contesta {apagado:true} y no lee ni escribe.
// 🔒 «¿Le toca?» NO se decide aquí: lo contesta motivoNoRecordar (modo 'auto':
//    cada RECORDATORIO_CADA_DIAS días, tope RECORDATORIO_TOPE avisos, nunca
//    después del evento). El botón de KameHouse pregunta al MISMO dueño.
// 🔒 Un correo por DIRECCIÓN (emitirContratos agrupa) y el sello va DESPUÉS
//    del envío; tope 60 viajeros por corrida — lo que no cupo sale mañana.
// =============================================================================

const CC = require('./_lib/contrato-cliente');

const TOPE_CORRIDA = 60;

exports.handler = async () => {
  const json = (o) => ({ statusCode: 200, body: JSON.stringify(o) });
  if (!CC.CONTRATO_CLIENTE_VIVO || !CC.RECORDATORIO_AUTO_VIVO) {
    return json({ ok: true, apagado: true, contrato_vivo: CC.CONTRATO_CLIENTE_VIVO, auto_vivo: CC.RECORDATORIO_AUTO_VIVO });
  }
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_URL || !KH_KEY) return json({ ok: false, error: 'faltan llaves de KameHouse' });
  const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  try {
    const r = await fetch(`${KH_URL}/rest/v1/contratos_cliente?estado=eq.pendiente&correo=not.is.null&select=id,viajero_id,evento_id,estado,correo,envios,enviado_at&order=enviado_at.asc.nullsfirst&limit=2000`, { headers: h });
    if (!r.ok) return json({ ok: false, error: 'no pude leer contratos_cliente (' + r.status + ')' });
    const filas = await r.json();
    // Sin catálogo no se sabe si el evento ya pasó: NO se manda nada (recordarle
    // a alguien que firme un viaje que ya ocurrió es peor que esperar a mañana).
    const EV = await require('./_lib/catalogo-index').fetchEventosRaw();
    if (!Array.isArray(EV)) return json({ ok: false, error: 'catálogo ilegible: hoy no sale ningún recordatorio' });
    const ahora = Date.now();
    const tocan = [], motivos = {};
    for (const c of filas) {
      const ev = EV.find((e) => e && e.id === String(c.evento_id || '').split('#')[0]);
      const mot = CC.motivoNoRecordar(c, CC.dsDeViajero(ev, c.evento_id), ahora, 'auto');
      if (mot) { motivos[mot] = (motivos[mot] || 0) + 1; continue; }
      tocan.push(c.viajero_id);
      if (tocan.length >= TOPE_CORRIDA) break;
    }
    if (!tocan.length) return json({ ok: true, enviados: 0, motivos });
    const res = await CC.emitirContratos({ viajeroIds: tocan, reenviar: true, recordatorio: true, creado_por: 'cron-recordatorio', KH_URL, KH_KEY });
    return json({ ok: res.ok, enviados: res.enviados.length, errores: res.errores, motivos });
  } catch (e) {
    return json({ ok: false, error: e.message });
  }
};
