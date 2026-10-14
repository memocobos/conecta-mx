// =============================================================================
// contrato-redes.js — [CREA-SEG-6] la creadora completa sus redes y WhatsApp
// desde su página de colaboración (link con token, sin cuenta).
// POST { token, instagram, tiktok?, celular } → { ok, redes }
// 🔒 Solo toca esos tres campos de `datos`, solo en contratos de creadora
// FIRMADOS (las pendientes los dan al firmar). Lo demás del contrato no se mueve.
// =============================================================================
const { normRedes } = require('./admin-creadoras');
const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const bad = (s, e) => ({ statusCode: s, headers: HEADERS, body: JSON.stringify({ ok: false, error: e }) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return bad(405, 'Método no permitido');
  const KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KEY) return bad(500, 'Configuración incompleta');
  let b; try { b = JSON.parse(event.body || '{}'); } catch { return bad(400, 'JSON inválido'); }
  const token = String(b.token || '').trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return bad(400, 'Link inválido');
  const sb = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const r = await fetch(`${SB_URL}/rest/v1/contratos_creadores?token=eq.${encodeURIComponent(token)}&select=id,plantilla,estado,datos&limit=1`, { headers: sb });
  if (!r.ok) return bad(500, 'Error consultando');
  const c = (await r.json())[0];
  if (!c) return bad(404, 'Contrato no encontrado');
  if (!['creadora', 'creadora_team'].includes(c.plantilla || 'creadora') || c.estado !== 'firmado') return bad(409, 'Este contrato no admite este cambio');
  const n = normRedes({ instagram: b.instagram, tiktok: b.tiktok, celular: b.celular });
  if (n.error) return bad(400, n.error);
  if (!n.redes.instagram) return bad(400, 'Falta tu usuario de Instagram');
  if (!n.redes.celular) return bad(400, 'Falta tu WhatsApp (10 dígitos)');
  const datos = { ...((c.datos && typeof c.datos === 'object') ? c.datos : {}), ...n.redes, redes_origen: 'creadora', redes_at: new Date().toISOString() };
  const p = await fetch(`${SB_URL}/rest/v1/contratos_creadores?id=eq.${c.id}`, { method: 'PATCH', headers: sb, body: JSON.stringify({ datos }) });
  if (!p.ok) return bad(500, 'No se pudo guardar');
  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, redes: n.redes }) };
};
