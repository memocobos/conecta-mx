// netlify/functions/marcar-vencidos-diario.js
// Job diario (cron en netlify.toml) — marca como 'vencido' los pagos del PORTAL
// que siguen en 'pendiente' y cuya fecha_esperada ya pasó, EXCLUYENDO los de
// tours cancelados. El enum ya incluye 'vencido', no hay cambio de esquema.
//
// Hasta ahora "atrasado" era solo visual (se calculaba al vuelo); estado='vencido'
// nunca se persistía. Esto lo automatiza y respalda en la BD.
//
// Idempotente: al flippear pendiente→vencido, una segunda corrida el mismo día ya
// no los re-selecciona (filtro estado=eq.pendiente). Un vencido que luego se paga
// pasa a 'pagado' vía admin-marcar-pago; si se revierte, vuelve a 'pendiente' y el
// cron lo re-marca.
//
// Conexión directa al Supabase del PORTAL con service_role (mismo estilo que
// check-strikes-diario). Reusa PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY —
// sin env vars nuevas. No manda correo (sin ruido).

const SB_URL = process.env.PORTAL_SUPABASE_URL;
const SB_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
const HEADERS = {
  apikey: SB_KEY,
  Authorization: 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
};

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...HEADERS, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`SB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// PATCH en lotes para no exceder el largo de la URL con id=in.(...) gigante.
async function marcarLote(ids) {
  const LOTE = 100;
  for (let i = 0; i < ids.length; i += LOTE) {
    const chunk = ids.slice(i, i + LOTE);
    await sb(`pagos?id=in.(${chunk.join(',')})`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ estado: 'vencido' }),
    });
  }
}

exports.handler = async function () {
  console.log('[marcar-vencidos] Iniciando:', new Date().toISOString());
  if (!SB_URL || !SB_KEY) {
    console.error('[marcar-vencidos] Faltan PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY');
    return { statusCode: 500, body: 'Config faltante' };
  }

  // HOY en zona México (YYYY-MM-DD). en-CA da formato ISO directo.
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

  // Paso 1: pagos pendientes cuya fecha ya pasó (con su solicitud_id).
  const candidatos = await sb(
    `pagos?estado=eq.pendiente&fecha_esperada=lt.${hoy}&select=id,solicitud_id`
  );
  if (!candidatos.length) {
    console.log(`[marcar-vencidos] Fin. marcados:0 fecha:${hoy}`);
    return { statusCode: 200, body: JSON.stringify({ marcados: 0, fecha: hoy }) };
  }

  // Paso 2: de esos tours, cuáles están cancelados (para excluirlos).
  const solIds = [...new Set(candidatos.map(p => p.solicitud_id).filter(Boolean))];
  const cancelados = solIds.length
    ? await sb(`solicitudes_tour?id=in.(${solIds.join(',')})&estado=eq.cancelado&select=id`)
    : [];
  const setCancelados = new Set(cancelados.map(s => s.id));

  // Paso 3: marcar los que NO son de un tour cancelado.
  const ids = candidatos
    .filter(p => !setCancelados.has(p.solicitud_id))
    .map(p => p.id);

  if (ids.length) await marcarLote(ids);

  console.log(`[marcar-vencidos] Fin. marcados:${ids.length} fecha:${hoy} (candidatos:${candidatos.length}, tours cancelados excluidos:${setCancelados.size})`);
  return { statusCode: 200, body: JSON.stringify({ marcados: ids.length, fecha: hoy }) };
};
