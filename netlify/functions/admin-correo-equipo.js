// =============================================================================
// admin-correo-equipo  [CORREO-EQUIPO-1 · 21-oct-2026]
//
// Palabra de Memo: «mándalo desde el correo del sistema». Un correo INTERNO al
// equipo (Guerreros Z), escrito por Memo, enviado por Resend con el FROM de la
// casa. Nació para el aviso «registren sus tours del ranking» y queda como
// herramienta reusable.
//
// POST { asunto, mensaje, roles?, seco?, confirmar? }
//   · asunto 5-120 · mensaje 10-4000 en TEXTO PLANO (se escapa; línea en
//     blanco = párrafo) — la forma del tipo `libre` de GENKIDAMA-2.
//   · roles: a quién va, de una LISTA CERRADA; default coordinador+mister_popo.
//   · SECO ES EL DEFAULT (la puerta de MIG-1d-ii): devuelve la audiencia con
//     nombres y el HTML de muestra, cero envíos. Para mandar hacen falta DOS
//     gestos: seco:false Y confirmar:true. CORREOS_MODO está en 'real'.
//   · Tope 60 por llamada (el equipo son ~20; un número mayor es un error).
//
// 🔒 SOLO maestro_roshi: es la voz de Memo.
// 🔒 SIN bitácora A PROPÓSITO (correo interno, el precedente de
//    contratos-alerta-cron): no hay idempotencia que proteger — si se manda
//    dos veces, el equipo recibe dos avisos, no se duplica dinero.
// 🔒 El envío va por L.enviarCorreo (_lib/creadoras): el MISMO FROM, el mismo
//    correo-guard. Cero fórmulas nuevas de envío.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const L = require('./_lib/creadoras');

const ROLES_VALIDOS = ['coordinador', 'mister_popo', 'bulma', 'milk', 'cc'];
const TOPE = 60;

function render(asunto, mensaje) {
  // Texto plano → párrafos. Cada celda/bloque lleva SU color (la ley de
  // CONFIRMA-1: los clientes de correo no heredan el color del contenedor).
  const parrafos = String(mensaje).split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 14px;color:#111111;font-size:14px;line-height:1.6">${L.esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff">
    <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#666666;margin-bottom:6px"><b style="color:#ff283b">Conecta</b> Reynosa · equipo</div>
    <h2 style="margin:0 0 16px;color:#111111;font-size:19px">${L.esc(asunto)}</h2>
    ${parrafos}
    <p style="margin:18px 0 0;color:#888888;font-size:11px">Correo interno del equipo Conecta Reynosa.</p>
  </div>`;
}

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = { 'Access-Control-Allow-Origin': __origin || 'null', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' };
  const res = (s, o) => ({ statusCode: s, headers, body: JSON.stringify(o) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  if (!__origin) return res(403, { error: 'Origen no permitido' });

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi']);
  if (!auth.valid) return res(auth.status, { error: auth.error });

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return res(400, { error: 'JSON inválido' }); }

  const asunto = String(body.asunto || '').trim();
  const mensaje = String(body.mensaje || '').trim();
  if (asunto.length < 5 || asunto.length > 120) return res(400, { error: 'El asunto va de 5 a 120 caracteres' });
  if (mensaje.length < 10 || mensaje.length > 4000) return res(400, { error: 'El mensaje va de 10 a 4,000 caracteres (texto plano)' });

  const roles = Array.isArray(body.roles) && body.roles.length ? body.roles.map(String) : ['coordinador', 'mister_popo'];
  const malos = roles.filter((r) => !ROLES_VALIDOS.includes(r));
  if (malos.length) return res(400, { error: 'Roles desconocidos: ' + malos.join(', ') + '. Válidos: ' + ROLES_VALIDOS.join(', ') });

  const URL_ = process.env.SUPABASE_URL_KAMEHOUSE, KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!URL_ || !KEY) return res(500, { error: 'Faltan env vars KH' });
  const r = await fetch(`${URL_}/rest/v1/usuarios?activo=eq.true&rol=in.(${roles.join(',')})&select=nombre,correo,rol&order=nombre.asc&limit=200`,
    { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
  if (!r.ok) return res(502, { error: 'No se pudo leer el equipo', detail: (await r.text()).slice(0, 200) });
  const audiencia = (await r.json()).filter((u) => u.correo && /@/.test(u.correo));
  if (!audiencia.length) return res(409, { error: 'La audiencia salió VACÍA para esos roles — nada que mandar' });
  if (audiencia.length > TOPE) return res(400, { error: `Son ${audiencia.length} y el tope es ${TOPE}` });

  const html = render(asunto, mensaje);

  // SECO por default: enseña a quién iría y el render, sin mandar nada.
  if (body.seco !== false || body.confirmar !== true) {
    return res(200, { ok: true, seco: true, a_mandar: audiencia.length, audiencia, html_muestra: html,
      nota: 'Para MANDAR: seco:false Y confirmar:true (dos gestos). CORREOS_MODO está en real.' });
  }

  const enviados = [], errores = [];
  for (const u of audiencia) {
    const out = await L.enviarCorreo(u.correo, asunto, html);
    if (out.enviado) enviados.push({ correo: u.correo, email_id: out.email_id });
    else errores.push({ correo: u.correo, error: out.error });
  }
  return res(200, { ok: true, seco: false, enviados: enviados.length, errores, total: audiencia.length });
};
