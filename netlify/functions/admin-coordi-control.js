// =============================================================================
// admin-coordi-control.js — Acceso server-side a deudas_coordi + strikes_log +
// sistema_alertas (KH). Cierra la exposición anon del panel (Montaña/accountability).
// Todo con service_role + verifyAdminAuth. Mismo patrón que admin-tours/admin-kits.
//
// Body JSON: { accion, ... }   (rolesPorAccion — 403 fuera de rol, 400 si no existe)
//   DEUDAS (maestro_roshi + bulma):
//     - 'deudas_listar' { pagado?:bool, limit? } → filas (whitelist; incluye monto).
//     - 'deudas_marcar_pagada' { id } → pagado=true, fecha_pago=now.
//     - 'deudas_eliminar' { id } → delete.
//   STRIKES (maestro_roshi solo):
//     - 'strike_crear' { coordi_id, accion, motivo?, evento_id? }
//         accion ∈ asignado|quitado|strike_manual. por_quien se FUERZA al jwt
//         (anti-spoofing). Devuelve { ok }.
//   SISTEMA_ALERTAS (maestro_roshi, SOLO lectura — las escrituras ya van por
//   sistema-alertas-write.js):
//     - 'sistema_alertas_listar' { } → order created_at.desc limit 50 (whitelist).
//
// Seguridad: verifyAdminAuth por acción + corsCheck. service_role. Whitelist por
// tabla (deudas_coordi protege monto; strikes whitelista la escritura). NUNCA se
// expone la service key.
//
// Backends que tocan estas tablas con service_role (NO se rompen al cerrar):
//   check-strikes-diario.js (deudas_coordi, strikes_log, sistema_alertas),
//   sistema-alertas-write.js (sistema_alertas INSERT/UPDATE).
//
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[a-zA-Z0-9_-]{1,80}$/;

const ROLES_DEUDAS = ['maestro_roshi', 'bulma', 'milk'];
const ROLES_MAESTRO = ['maestro_roshi'];
const STRIKE_ACCIONES = ['asignado', 'quitado', 'strike_manual'];

const ACCIONES = {
  deudas_listar: ROLES_DEUDAS,
  deudas_marcar_pagada: ROLES_DEUDAS,
  deudas_eliminar: ROLES_DEUDAS,
  strike_crear: ROLES_MAESTRO,
  sistema_alertas_listar: ROLES_MAESTRO,
};

const DEUDA_COLS = 'id,coordi_id,evento_id,tipo,concepto,monto,pagado,fecha_pago,reporte_id,notas,created_at';
const ALERTA_COLS = 'id,tipo,mensaje,leida,created_at';

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

  const auth = await verifyAdminAuthLive(event, ACCIONES[accion]);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const jwtUserId = auth.user && (auth.user.id || auth.user.sub);

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const restBase = `${env.KH_SB_URL}/rest/v1`;

  try {
    // ── deudas_listar ─────────────────────────────────────────────────────────
    if (accion === 'deudas_listar') {
      const sp = new URLSearchParams();
      sp.set('select', DEUDA_COLS);
      if (body.pagado === true) sp.append('pagado', 'eq.true');
      else if (body.pagado === false) sp.append('pagado', 'eq.false');
      let limit = parseInt(body.limit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) limit = 200;
      sp.set('limit', String(limit));
      sp.set('order', 'created_at.desc');
      const r = await fetch(`${restBase}/deudas_coordi?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, deudas: await r.json() }) };
    }

    // ── deudas_marcar_pagada ──────────────────────────────────────────────────
    if (accion === 'deudas_marcar_pagada') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      const r = await fetch(`${restBase}/deudas_coordi?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ pagado: true, fecha_pago: new Date().toISOString() }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── deudas_eliminar ───────────────────────────────────────────────────────
    if (accion === 'deudas_eliminar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      const r = await fetch(`${restBase}/deudas_coordi?id=eq.${id}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el delete', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── strike_crear (por_quien forzado al jwt) ────────────────────────────────
    if (accion === 'strike_crear') {
      const coordiId = String(body.coordi_id || '').trim();
      if (!UUID_RE.test(coordiId)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'coordi_id inválido' }) };
      // `tipo_accion` (NO `accion`, que es el dispatch) = valor del strike.
      const acc = String(body.tipo_accion || '').trim();
      if (STRIKE_ACCIONES.indexOf(acc) < 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion de strike inválida' }) };
      const fila = {
        coordi_id: coordiId,
        accion: acc,
        motivo: (body.motivo == null || body.motivo === '') ? null : String(body.motivo).slice(0, 500),
        por_quien: jwtUserId,                       // anti-spoofing: NUNCA del cliente
        created_at: new Date().toISOString(),
      };
      if (typeof body.evento_id === 'string' && body.evento_id.trim()) {
        const ev = body.evento_id.trim();
        if (!SLUG_RE.test(ev)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
        fila.evento_id = ev;
      }

      // El strike MANUAL aplica igual que el automático (aplicarStrike del cron):
      // PATCH contador ANTES del log, luego suspensión, luego correo. Sin guard de
      // fecha (es deliberado y aplica de inmediato).

      // 2. Leer el usuario.
      const uR = await fetch(`${restBase}/usuarios?id=eq.${coordiId}&select=nombre,strikes,correo,correo_notif`, { headers: sbHeaders });
      if (!uR.ok) {
        const detail = await uR.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta del coordi', detail }) };
      }
      const uArr = await uR.json();
      const u = Array.isArray(uArr) ? uArr[0] : null;
      if (!u) return { statusCode: 404, headers, body: JSON.stringify({ error: 'coordi no encontrado' }) };

      // 3. Incrementar el contador ANTES del log (así un reintento no duplica el log).
      const nuevos = (u.strikes || 0) + 1;
      const incR = await fetch(`${restBase}/usuarios?id=eq.${coordiId}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ strikes: nuevos }),
      });
      if (!incR.ok) {
        const detail = await incR.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el incremento de strikes', detail }) };
      }

      // 4. Insertar la fila en strikes_log.
      const r = await fetch(`${restBase}/strikes_log`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el insert', detail }) };
      }

      // 5. Suspensión al llegar a 3 (si falla, loggea pero no abortes: el strike
      //    y el contador ya quedaron aplicados).
      if (nuevos >= 3) {
        const susR = await fetch(`${restBase}/usuarios?id=eq.${coordiId}`, {
          method: 'PATCH',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ activo: false }),
        }).catch(() => null);
        if (!susR || !susR.ok) console.error('[coordi-control] suspensión a 3 falló (no crítica):', coordiId);
      }

      // 6. Correo al coordi, BEST-EFFORT (su fallo no afecta el return).
      try {
        const email = u.correo_notif || u.correo;
        if (email) {
          await enviarCorreo(email, '⚠️ Strike — Kamehouse',
            `<div style="font-family:Arial,sans-serif;background:#0a0a0f;color:#f0f0f5;padding:32px;border-radius:12px;max-width:520px;margin:0 auto">
              <h2 style="color:#FF6B00">Strike</h2>
              <p>Hola <strong>${u.nombre}</strong>,</p>
              <p><strong>Motivo:</strong> ${fila.motivo || 'No especificado'}</p>
              <p><strong>Strikes:</strong> ${nuevos}/3</p>
              ${nuevos >= 2 ? '<p style="color:#FFB703">⚠️ Al llegar a 3 tu cuenta será suspendida.</p>' : ''}
              ${nuevos >= 3 ? '<p style="color:#FF4444">🚫 Cuenta suspendida.</p>' : ''}
              <p style="color:#888;font-size:12px">Conecta Reynosa</p>
            </div>`);
        }
      } catch (e) {
        console.error('[coordi-control] correo de strike falló (no crítico):', e.message);
      }

      // 7. Listo.
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, strikes: nuevos, suspendido: nuevos >= 3 }) };
    }

    // ── sistema_alertas_listar (solo lectura) ──────────────────────────────────
    if (accion === 'sistema_alertas_listar') {
      const r = await fetch(`${restBase}/sistema_alertas?select=${ALERTA_COLS}&order=created_at.desc&limit=50`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alertas: await r.json() }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-coordi-control', detail: e.message }) };
  }
};

// ----- helpers -----

// Remitente INTERNO del equipo (no el de cliente): correcto para un strike al
// staff. Copia del patrón de check-strikes-diario.js; .catch loggea (best-effort).
async function enviarCorreo(to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return;
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Kamehouse <kamehouse@conectareynosa.mx>', to, subject, html }),
  }).catch((e) => console.error('[coordi-control] Email:', e.message));
}

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
