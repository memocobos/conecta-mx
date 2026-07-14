// =============================================================================
// admin-invitar-walkin   (Fase 2b — invitación por correo, ADMIN)
//
// La llama un admin (Bulma) desde Kamehouse → Capsule Corp → Viajeros para
// invitar por correo a un walk-in (cliente sin cuenta de portal). El correo le
// dice que ya puede ver su plan de pagos en línea y lo manda a registrarse en
// /portal con ESE MISMO correo. El enlace real lo hace portal-reclamar-cuenta
// cuando el cliente se registra con correo verificado.
//
// Body { cliente_id }.
//
// Seguridad: corsCheck + verifyAdminAuth(['maestro_roshi','bulma']). service_role
// solo aquí. Valida que el cliente tenga correo y que auth_user_id sea NULL (si
// ya tiene cuenta, no se invita).
//
// Variables de entorno: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY,
//                       RESEND_KEY (o RESEND_API_KEY). JWT_SECRET (verifyAdmin).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const PORTAL_URL = 'https://conectareynosa.mx/portal';

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

  const auth = verifyAdminAuth(event, ['maestro_roshi','bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const SB_URL     = process.env.PORTAL_SUPABASE_URL;
  const SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!SB_URL || !SB_SERVICE || !RESEND_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan env vars (PORTAL_SUPABASE_*, RESEND_KEY)' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const clienteId = body.cliente_id;
  if (!clienteId || !/^[0-9a-f-]{36}$/i.test(clienteId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'cliente_id inválido' }) };
  }

  const sbHeaders = {
    apikey: SB_SERVICE,
    Authorization: 'Bearer ' + SB_SERVICE,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Traer el cliente.
    const cUrl = `${SB_URL}/rest/v1/clientes?id=eq.${clienteId}&select=id,nombre_completo,correo,auth_user_id,creado_por_admin&limit=1`;
    const cR = await fetch(cUrl, { headers: sbHeaders });
    if (!cR.ok) {
      const detail = await cR.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Supabase rechazó la consulta del cliente', detail }) };
    }
    const cArr = await cR.json();
    const cliente = Array.isArray(cArr) ? cArr[0] : null;
    if (!cliente) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Cliente no encontrado' }) };
    }
    if (!cliente.correo) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'El cliente no tiene correo — captúralo antes de invitarlo' }) };
    }
    if (cliente.auth_user_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Este cliente ya tiene cuenta del portal — no hace falta invitarlo' }) };
    }
    // Backstop: aunque un correo malo ya esté guardado, NO mandamos al vacío.
    // Si el formato es inválido o el TLD es claramente erróneo (.con/.cm/...),
    // cortamos antes de Resend (que aceptaría el envío y rebotaría en silencio).
    if (!correoFormatoValido(cliente.correo) || tldClaramenteMalo(cliente.correo)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'El correo del cliente parece inválido (¿quisiste .com?). Corrígelo antes de invitar.' }) };
    }

    // 2. Armar y enviar el correo (Resend, desde admin@conectareynosa.mx).
    const primerNombre = String(cliente.nombre_completo || '').trim().split(/\s+/)[0] || 'Hola';
    const subject = 'Tu plan de pagos de Conecta ya está en línea';
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff">
        <div style="background:#e8ff4c;color:#000;padding:18px 22px;border-bottom:4px solid #ff283b">
          <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Conecta Reynosa · Portal</div>
          <div style="font-size:22px;font-weight:900;margin-top:4px">¡${escapeHtml(primerNombre)}, ya puedes ver tu plan!</div>
        </div>
        <div style="padding:24px 22px;background:#0a0a0a;font-size:15px;line-height:1.6;color:rgba(255,255,255,.9)">
          <p style="margin:0 0 14px">Tu lugar ya está registrado y tu <b style="color:#e8ff4c">plan de pagos</b> está listo para que lo consultes en línea cuando quieras.</p>
          <p style="margin:0 0 20px">Entra al portal y regístrate con <b>este mismo correo</b> (<span style="color:#e8ff4c">${escapeHtml(cliente.correo)}</span>) para ver tu tour y tus abonos:</p>
          <p style="margin:0 0 24px;text-align:center">
            <a href="${PORTAL_URL}" style="display:inline-block;background:#e8ff4c;color:#000;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px">Ver mi plan de pagos →</a>
          </p>
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,.55)">Importante: usa exactamente <b>${escapeHtml(cliente.correo)}</b> al registrarte; así reconocemos tu información automáticamente. Si tienes dudas, escríbenos por WhatsApp.</p>
        </div>
      </div>
    `;

    const __mp = aplicarModoPrueba({ to: [cliente.correo], subject });
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Conecta Reynosa <admin@conectareynosa.mx>',
        to: __mp.to,
        subject: __mp.subject,
        html,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: 'Resend rechazó el envío', detail: data }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, email_id: data.id, to: cliente.correo }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error invitando al portal', detail: e.message }) };
  }
};

// ----- helpers -----

// Formato básico: algo@algo.tld con TLD de 2+ letras, sin espacios.
function correoFormatoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(correo == null ? '' : correo).trim());
}

// TLD claramente mal escrito (típico de ".com" mal tecleado). Atrapa el caso que
// pasó: "gmail.con" tiene formato válido pero el correo no existe.
const _TLD_MALOS = ['con', 'cm', 'comm', 'ocm'];
function tldClaramenteMalo(correo) {
  const c = String(correo == null ? '' : correo).trim().toLowerCase();
  const dot = c.lastIndexOf('.');
  if (dot < 0) return false;
  return _TLD_MALOS.includes(c.slice(dot + 1));
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
