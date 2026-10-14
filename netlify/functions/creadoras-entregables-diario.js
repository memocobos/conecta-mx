// =============================================================================
// creadoras-entregables-diario.js — [CREA-SEG-4] los recordatorios a creadoras.
// Corre cada mañana (netlify.toml). Para cada contrato FIRMADO con entregables
// pendientes y fecha límite:
//   · faltan 3 días  → «recordatorio» (una vez: avisos.r3)
//   · falta 1 día    → «recordatorio» (una vez: avisos.r1)
//   · ya venció (1+ días después) → «vencido» (una vez: avisos.vencido)
// UN correo por contrato y por tipo (si dos entregables vencen el mismo día,
// van en el mismo correo). La bitácora se escribe DESPUÉS de enviar: si Resend
// falla, mañana se reintenta. Solo notifica; no cambia estados.
// `?seco=1` (o body {seco:true}) enseña lo que mandaría sin mandar nada.
// =============================================================================
const L = require('./_lib/creadoras');

exports.handler = async (event) => {
  const URL_ = process.env.SUPABASE_URL_KAMEHOUSE, KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!URL_ || !KEY) return { statusCode: 500, body: 'Faltan env vars KH' };
  const sb = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  let seco = false;
  try { seco = (event && event.queryStringParameters && event.queryStringParameters.seco === '1') || JSON.parse((event && event.body) || '{}').seco === true; } catch (_) {}
  const hoy = L.hoyMx();
  const get = async (u) => { const r = await fetch(u, { headers: sb }); if (!r.ok) throw new Error(await r.text()); return r.json(); };

  const pend = await get(`${URL_}/rest/v1/entregables_creadora?estado=eq.pendiente&fecha_limite=not.is.null&select=*&limit=5000`);
  const porC = new Map();
  pend.forEach((e) => { if (!porC.has(e.contrato_id)) porC.set(e.contrato_id, []); porC.get(e.contrato_id).push(e); });
  const ids = [...porC.keys()];
  const contratos = ids.length ? await get(`${URL_}/rest/v1/contratos_creadores?id=in.(${ids.join(',')})&estado=eq.firmado&select=id,token,creador_nombre,creador_email,evento_nombre,evento_fecha,expectativas&limit=2000`) : [];
  const plan = [];
  for (const c of contratos) {
    const items = porC.get(c.id) || [];
    const grupos = { r3: [], r1: [], vencido: [] };
    items.forEach((e) => {
      const d = L.diasEntre(hoy, e.fecha_limite);
      const av = e.avisos || {};
      if (d === 3 && !av.r3) grupos.r3.push(e);
      else if (d === 1 && !av.r1) grupos.r1.push(e);
      else if (d != null && d < 0 && !av.vencido) grupos.vencido.push(e);
    });
    for (const k of ['r3', 'r1', 'vencido']) {
      if (!grupos[k].length) continue;
      const m = k === 'vencido' ? L.correoCreadora('vencido', c, [], { pendientes: grupos[k], hoy })
        : L.correoCreadora('recordatorio', c, [], { dias: k === 'r3' ? 3 : 1, pendientes: grupos[k], hoy });
      plan.push({ contrato_id: c.id, para: c.creador_email, tipo: k, asunto: m.asunto, entregables: grupos[k].map((e) => e.id), html: m.html });
    }
  }
  if (seco) return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, seco: true, hoy, plan: plan.map(({ html, ...p }) => p) }) };

  const hechos = [];
  for (const p of plan) {
    const r = await L.enviarCorreo(p.para, p.asunto, p.html);
    if (r.enviado) {
      for (const id of p.entregables) {
        const e = pend.find((x) => x.id === id);
        await fetch(`${URL_}/rest/v1/entregables_creadora?id=eq.${id}`, { method: 'PATCH', headers: sb, body: JSON.stringify({ avisos: { ...((e && e.avisos) || {}), [p.tipo]: new Date().toISOString() } }) });
      }
    }
    hechos.push({ contrato_id: p.contrato_id, tipo: p.tipo, enviado: r.enviado, error: r.error || null });
  }
  console.log('[creadoras-entregables-diario]', hoy, JSON.stringify(hechos));
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, hoy, hechos }) };
};
