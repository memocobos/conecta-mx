// =============================================================================
// admin-reembolsos.js — Panel de Reembolsos (Cancelar evento — Fase 3a, backend).
//
// Acceso server-side a la tabla `reembolsos` (KH) con service_role +
// verifyAdminAuth. Lista los reembolsos (todos o por evento), guarda los datos
// bancarios que respondió el cliente, y marca/desmarca un reembolso como
// transferido. Solo de maestro_roshi. NO toca el Palacio (eso es la 3c).
//
// Molde calcado de admin-compras.js (ACCIONES por acción).
//
// Body JSON: { accion, ... }
//   - 'listar' { slug? } → { ok, reembolsos:[...], totales:{...} }
//   - 'guardar_datos' { id, datos_bancarios?, notas? } → { ok }
//   - 'marcar_transferido' { id, cuenta } → { ok, correo_enviado }
//   - 'desmarcar' { id } → { ok }
//
// Correo "Tu reembolso fue enviado" (marcar_transferido): al marcar, se manda
// un correo automático al cliente con el monto y la vía de devolución (SOLO la
// terminación de la cuenta — JAMÁS la cuenta completa). Best-effort estricto:
// si Resend falla, el marcado NO se revierte (el dinero ya se movió); se
// reporta correo_enviado:false en la respuesta. `desmarcar` no manda nada.
// Si Bulma re-marca tras desmarcar, el correo se RE-ENVÍA (comportamiento
// natural del flujo; la rama idempotente {ya:true} no manda).
//
// Columnas (ya existen en .sql): id, evento_slug, evento_nombre, cliente_nombre,
//   cliente_correo, monto, estado, datos_bancarios, notas, creado_en, transferido_en.
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const ROLES_PALACIO = ['maestro_roshi']; // el Palacio es solo de maestro_roshi

const ACCIONES = {
  listar: ROLES_PALACIO,
  guardar_datos: ROLES_PALACIO,
  marcar_transferido: ROLES_PALACIO,
  desmarcar: ROLES_PALACIO,
};

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[A-Za-z0-9_.#-]+$/;
const REEMBOLSO_COLS = 'id,evento_slug,evento_nombre,cliente_nombre,cliente_correo,monto,estado,datos_bancarios,notas,creado_en,transferido_en,cuenta,gasto_id';
const DATOS_MAX = 1000;
const NOTAS_MAX = 1000;
// Cuentas válidas a las que se imputa la salida del reembolso (caja del Palacio).
const CUENTAS = ['BBVA', 'Banamex', 'Efectivo'];

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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const accion = body.accion;
  if (!(accion in ACCIONES)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  }

  const auth = verifyAdminAuth(event, ACCIONES[accion]);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const portalHeaders = {
    apikey: env.PORTAL_SB_SERVICE,
    Authorization: 'Bearer ' + env.PORTAL_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const base = `${env.KH_SB_URL}/rest/v1/reembolsos`;
  const baseGastos = `${env.PORTAL_SB_URL}/rest/v1/gastos`;

  try {
    // ── listar (todos o por evento) ──────────────────────────────────────
    if (accion === 'listar') {
      const sp = new URLSearchParams();
      sp.set('select', REEMBOLSO_COLS);
      sp.set('order', 'creado_en.desc');
      sp.set('limit', '5000');
      if (body.slug != null && body.slug !== '') {
        const slug = String(body.slug).trim().toLowerCase();
        if (!SLUG_RE.test(slug) || slug.length > 120) return bad(headers, 'slug inválido');
        sp.set('evento_slug', `eq.${slug}`);
      }
      const r = await fetch(`${base}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const reembolsos = await r.json();
      const lista = Array.isArray(reembolsos) ? reembolsos : [];

      const totales = { pendiente_monto: 0, transferido_monto: 0, pendiente_n: 0, transferido_n: 0 };
      for (const x of lista) {
        const monto = Number(x.monto) || 0;
        if (x.estado === 'pendiente') { totales.pendiente_monto += monto; totales.pendiente_n++; }
        else if (x.estado === 'transferido') { totales.transferido_monto += monto; totales.transferido_n++; }
      }
      return ok(headers, { reembolsos: lista, totales });
    }

    // ── guardar_datos (datos bancarios / notas que respondió el cliente) ──
    if (accion === 'guardar_datos') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const patch = {};
      if ('datos_bancarios' in body) patch.datos_bancarios = cleanText(body.datos_bancarios, DATOS_MAX);
      if ('notas' in body) patch.notas = cleanText(body.notas, NOTAS_MAX);
      if (!Object.keys(patch).length) return bad(headers, 'Nada que guardar (datos_bancarios o notas)');
      return await patchReembolso(headers, sbHeaders, base, id, patch);
    }

    // ── marcar_transferido (registra la SALIDA en gastos del Portal) ─────
    if (accion === 'marcar_transferido') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const cuenta = String(body.cuenta || '').trim();
      if (!CUENTAS.includes(cuenta)) return bad(headers, 'cuenta inválida');

      // Leer el reembolso.
      const rGet = await fetch(`${base}?id=eq.${id}&select=evento_slug,evento_nombre,cliente_nombre,cliente_correo,monto,estado,gasto_id,datos_bancarios&limit=1`, { headers: sbHeaders });
      if (!rGet.ok) return upstream(headers, await rGet.text(), 'consulta');
      const rows = await rGet.json();
      const rb = Array.isArray(rows) ? rows[0] : null;
      if (!rb) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Reembolso no encontrado' }) };

      // Idempotencia: ya transferido / ya con gasto → no crear otro.
      if (rb.estado === 'transferido' || rb.gasto_id != null) {
        return ok(headers, { ya: true });
      }

      // Crear la salida en gastos (Portal). Si falla, NO marcamos (queda pendiente).
      const gRes = await fetch(baseGastos, {
        method: 'POST',
        headers: { ...portalHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({
          evento_id: rb.evento_slug,
          concepto: `Reembolso a ${rb.cliente_nombre || 'cliente'}`,
          monto: Number(rb.monto) || 0,
          cuenta,
          categoria: 'Reembolso',
          fecha: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!gRes.ok) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo registrar la salida del reembolso', detail: await gRes.text() }) };
      }
      const gJson = await gRes.json();
      const gastoId = Array.isArray(gJson) ? (gJson[0] && gJson[0].id) : (gJson && gJson.id);

      // Marcar el reembolso. Si falla, ROLLBACK del gasto recién creado.
      const pRes = await fetch(`${base}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ estado: 'transferido', transferido_en: new Date().toISOString(), cuenta, gasto_id: gastoId }),
      });
      if (!pRes.ok) {
        if (gastoId != null) {
          await fetch(`${baseGastos}?id=eq.${encodeURIComponent(gastoId)}`, { method: 'DELETE', headers: portalHeaders }).catch(() => {});
        }
        return upstream(headers, await pRes.text(), 'update');
      }

      // Correo "Tu reembolso fue enviado" al cliente. Best-effort ESTRICTO:
      // el transferido ya quedó marcado y el gasto registrado; un fallo aquí
      // solo se reporta (correo_enviado:false), nunca revierte.
      const correo_enviado = await enviarCorreoTransferido(env, rb).catch(() => false);
      return ok(headers, { correo_enviado });
    }

    // ── desmarcar (vuelve a pendiente, borra la salida de gastos) ─────────
    if (accion === 'desmarcar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');

      const rGet = await fetch(`${base}?id=eq.${id}&select=gasto_id&limit=1`, { headers: sbHeaders });
      if (!rGet.ok) return upstream(headers, await rGet.text(), 'consulta');
      const rows = await rGet.json();
      const rb = Array.isArray(rows) ? rows[0] : null;
      if (!rb) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Reembolso no encontrado' }) };

      // Revertir la salida en gastos (si la hay). Un DELETE de un id inexistente
      // devuelve ok, así que esto solo frena ante errores reales.
      if (rb.gasto_id != null) {
        const dRes = await fetch(`${baseGastos}?id=eq.${encodeURIComponent(rb.gasto_id)}`, { method: 'DELETE', headers: portalHeaders });
        if (!dRes.ok) {
          return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo revertir la salida; el reembolso sigue transferido', detail: await dRes.text() }) };
        }
      }

      return await patchReembolso(headers, sbHeaders, base, id, { estado: 'pendiente', transferido_en: null, cuenta: null, gasto_id: null });
    }

    return bad(headers, 'accion inválida');
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-reembolsos', detail: e.message }) };
  }
};

// ----- helpers -----

// Manda el correo de confirmación de transferencia al cliente. Devuelve
// true/false (nunca lanza hacia el caller de marcar_transferido).
async function enviarCorreoTransferido(env, rb) {
  if (!env.RESEND_KEY) return false;
  const correo = (rb && typeof rb.cliente_correo === 'string') ? rb.cliente_correo.trim().toLowerCase() : '';
  if (!correo || !correo.includes('@')) return false;
  const subject = 'Tu reembolso fue enviado';
  const html = correoTransferidoHtml(rb.cliente_nombre, rb.evento_nombre || rb.evento_slug, rb.monto, rb.datos_bancarios);
  const __mp = aplicarModoPrueba({ to: [correo], subject });
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Conecta Reynosa <admin@conectareynosa.mx>', to: __mp.to, subject: __mp.subject, html }),
  });
  return resp.ok;
}

// Vía de devolución para el correo: SOLO la terminación de la cuenta (últimos
// 4 dígitos del número más largo en datos_bancarios) — JAMÁS la cuenta
// completa. Si no hay dígitos suficientes, frase genérica.
function viaDevolucion(datosBancarios) {
  const s = String(datosBancarios == null ? '' : datosBancarios);
  // Runs de dígitos que pueden venir agrupados con espacios o guiones.
  const runs = s.match(/(?:\d[\s-]?){7,}\d/g) || [];
  let cuenta = '';
  for (const run of runs) {
    const digits = run.replace(/\D/g, '');
    if (digits.length > cuenta.length) cuenta = digits;
  }
  const banco = detectarBanco(s);
  if (cuenta.length >= 8) {
    return `tu cuenta${banco ? ' ' + banco : ''} con terminación ${cuenta.slice(-4)}`;
  }
  return `la cuenta${banco ? ' ' + banco : ''} que nos proporcionaste`;
}

const BANCOS = ['BBVA', 'Banamex', 'Banorte', 'Santander', 'HSBC', 'Scotiabank', 'Banco Azteca', 'BanCoppel', 'Inbursa', 'Banregio', 'Afirme', 'Spin', 'Nu', 'Klar', 'Hey Banco', 'STP', 'Mercado Pago'];
function detectarBanco(s) {
  const low = String(s || '').toLowerCase();
  for (const b of BANCOS) { if (low.includes(b.toLowerCase())) return b; }
  return '';
}

function correoTransferidoHtml(nombre, eventoNombre, monto, datosBancarios) {
  const ev = escapeHtml(eventoNombre);
  const nom = escapeHtml(nombre || 'viajero');
  const mxn = escapeHtml(fmtMXN(monto));
  const via = escapeHtml(viaDevolucion(datosBancarios));
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:18px">
      <span style="color:#ff283b;font-weight:900">Conecta</span> <span style="font-style:italic;font-weight:900">MX</span>
    </div>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0">Hola <strong>${nom}</strong>,</p>
    <div style="font-size:15px;line-height:1.65;color:rgba(255,255,255,.88)">
      <p style="margin:0 0 14px 0"><b style="color:#88ea4e">Tu reembolso fue enviado.</b> Ya transferimos <b>${mxn}</b> por la cancelación de <b style="color:#e8ff4c">${ev}</b> a ${via}.</p>
      <p style="margin:0 0 14px 0">Dependiendo de tu banco, puede tardar unas horas en reflejarse. Si en 24 horas no lo ves, responde a este correo y lo revisamos.</p>
      <p style="margin:0">Gracias por tu paciencia y por viajar con nosotros. Esperamos verte pronto en el siguiente evento.</p>
    </div>
    <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.55);margin:28px 0 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">— Equipo Conecta Reynosa</p>
  </div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// número → "$1,234.00" (es-MX).
function fmtMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n) || 0);
}

async function patchReembolso(headers, sbHeaders, base, id, patch) {
  const r = await fetch(`${base}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) return upstream(headers, await r.text(), 'update');
  return ok(headers, {});
}

function cleanText(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}
function ok(headers, extra) {
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...(extra || {}) }) };
}
function bad(headers, error) {
  return { statusCode: 400, headers, body: JSON.stringify({ error }) };
}
function upstream(headers, detail, op) {
  return { statusCode: 502, headers, body: JSON.stringify({ error: `KH rechazó el ${op}`, detail }) };
}
function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) {
    return { error: 'Faltan env vars Portal (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  }
  // RESEND_KEY es OPCIONAL: sin ella, marcar_transferido opera igual pero
  // reporta correo_enviado:false (best-effort — el correo nunca bloquea).
  const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY || '';
  return { KH_SB_URL, KH_SB_SERVICE, PORTAL_SB_URL, PORTAL_SB_SERVICE, RESEND_KEY };
}
