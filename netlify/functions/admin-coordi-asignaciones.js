// =============================================================================
// admin-coordi-asignaciones.js — Acceso server-side a `eventos_coordi` y
// `viajeros_evento` (KH) con service_role + verifyAdminAuth.
//
// Cierra la exposición anon: kamehouse.html ya NO lee/escribe estas 2 tablas con
// la anon key. Mismo patrón que admin-tours / admin-rooming / admin-eventos.
// PR-D de la cadena de hardening RLS.
//
//  - `eventos_coordi`  = asignación de un coordi a un evento (slug). status
//                        pendiente|aceptado|declinado. evento_id es SLUG (no uuid).
//  - `viajeros_evento` = staff/cliente registrado a un evento (KH). PII: nombre,
//                        correo, celular, num_emergencia, emergencia_nombre.
//                        (El tab Viajeros del panel y el alta manual viven en el
//                        proyecto PORTAL — solicitudes_tour — NO aquí.)
//
// Body JSON: { accion, ... }
//   eventos_coordi:
//     - 'listar'    { coordi_id?, evento_id?, status? } → { ok, asignaciones:[...] }
//          Lectura del panel (GZ/perfil/ranking/CC/Montaña). Cualquier logueado.
//     - 'crear'     { evento_id, coordi_id, indicaciones? } → { ok, asignacion }
//          Solo admin (maestro_roshi/bulma).
//     - 'eliminar'  { id } → { ok }                         · Solo admin.
//     - 'responder' { id, decision:'aceptar'|'declinar', motivo? } → { ok, asignacion }
//          ANTI-ESCALACIÓN: la asignación debe ser del jwtUserId (salvo admin).
//          Cierra el hueco del UUID enumerable del email-link.
//   viajeros_evento:
//     - 'viajero_upsert_staff' { asig_id } → { ok, viajero }
//          Registra al coordi aceptante como viajero (staff). Idempotente.
//          La identidad (nombre/correo/...) sale de `usuarios` server-side, NUNCA
//          del cliente (anti-spoofing). Owner-coordi del asig o admin.
//     - 'viajero_listar'   { evento_id } → { ok, viajeros:[...] }  (whitelist PII)
//          admin, o coordi CON asignación a ese evento.
//     - 'viajero_eliminar' { id } → { ok }                  · Solo admin.
//
// Seguridad: Authorization Bearer <JWT> (verifyAdminAuth) + corsCheck. Whitelist
// de columnas. UUID/slug validados. service_role NUNCA viaja al navegador.
//
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[A-Za-z0-9_#.\-]+$/; // evento_id (slug del EV, p.ej. 'karolg#2')
const ROLES_ADMIN = ['maestro_roshi', 'bulma'];

// Acciones válidas → roles permitidos (null = cualquier rol logueado; la
// anti-escalación fina se hace en código por coordi_id===jwt).
const ACCIONES = {
  listar: null,
  crear: ROLES_ADMIN,
  eliminar: ROLES_ADMIN,
  responder: null,
  viajero_upsert_staff: null,
  viajero_listar: null,
  viajero_eliminar: ROLES_ADMIN,
};

// Columnas que viajan al navegador al leer `eventos_coordi`.
const EC_COLS = 'id,evento_id,coordi_id,indicaciones,status,motivo_declinacion';

// Whitelist ESTRICTA de `viajeros_evento` (PII) — solo lo que la descarga usa.
const VE_READ_COLS = 'id,evento_id,nombre,correo,celular,talla_playera,num_emergencia,emergencia_nombre,tipo_paquete,zona_boleto,notas,tipo_viajero,usuario_id,created_at';

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

  const auth = verifyAdminAuth(event, ACCIONES[accion] || undefined);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const jwtUserId = auth.user && (auth.user.id || auth.user.sub);
  const jwtRol = auth.user && auth.user.rol;
  if (!jwtUserId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JWT sin id de usuario' }) };
  }
  const esAdmin = ROLES_ADMIN.includes(jwtRol);

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const baseEC = `${env.KH_SB_URL}/rest/v1/eventos_coordi`;
  const baseVE = `${env.KH_SB_URL}/rest/v1/viajeros_evento`;
  const baseUsuarios = `${env.KH_SB_URL}/rest/v1/usuarios`;

  try {
    // ── eventos_coordi: listar ───────────────────────────────────────────
    if (accion === 'listar') {
      const sp = new URLSearchParams();
      sp.set('select', EC_COLS);
      if (has(body, 'coordi_id')) {
        const cid = String(body.coordi_id || '').trim();
        if (!UUID_RE.test(cid)) return bad(headers, 'coordi_id inválido');
        sp.append('coordi_id', `eq.${cid}`);
      }
      if (has(body, 'evento_id')) {
        const ev = String(body.evento_id || '').trim();
        if (!ev || !SLUG_RE.test(ev) || ev.length > 120) return bad(headers, 'evento_id inválido');
        sp.append('evento_id', `eq.${ev}`);
      }
      if (has(body, 'status')) {
        const st = String(body.status || '').trim();
        // admite 'aceptado' | 'pendiente' | 'declinado' (lista simple)
        if (!/^[a-z_,]+$/.test(st) || st.length > 60) return bad(headers, 'status inválido');
        sp.append('status', st.includes(',') ? `in.(${st})` : `eq.${st}`);
      }
      sp.set('limit', '2000');
      const r = await fetch(`${baseEC}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const asignaciones = await r.json();
      return ok(headers, { asignaciones });
    }

    // ── eventos_coordi: crear (admin) ────────────────────────────────────
    if (accion === 'crear') {
      const evento_id = String(body.evento_id || '').trim();
      const coordi_id = String(body.coordi_id || '').trim();
      if (!evento_id || !SLUG_RE.test(evento_id) || evento_id.length > 120) return bad(headers, 'evento_id inválido');
      if (!UUID_RE.test(coordi_id)) return bad(headers, 'coordi_id inválido');
      const fila = {
        evento_id,
        coordi_id,
        indicaciones: cleanText(body.indicaciones, 2000),
        status: 'pendiente',
      };
      const r = await fetch(baseEC, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'insert');
      const rows = await r.json();
      return ok(headers, { asignacion: rows[0] || null });
    }

    // ── eventos_coordi: eliminar (admin) ─────────────────────────────────
    if (accion === 'eliminar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const r = await fetch(`${baseEC}?id=eq.${id}`, {
        method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) return upstream(headers, await r.text(), 'delete');
      return ok(headers, {});
    }

    // ── eventos_coordi: responder (aceptar/declinar) — ANTI-ESCALACIÓN ────
    if (accion === 'responder') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const decision = String(body.decision || '').trim();
      if (decision !== 'aceptar' && decision !== 'declinar') return bad(headers, 'decision inválida');

      const asig = await getAsig(baseEC, sbHeaders, id);
      if (!asig) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Asignación no encontrada' }) };
      // El coordi solo responde SU propia asignación; admins pasan.
      if (!esAdmin && asig.coordi_id !== jwtUserId) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes responder una asignación de otra persona' }) };
      }

      const patch = decision === 'aceptar'
        ? { status: 'aceptado' }
        : { status: 'declinado', motivo_declinacion: cleanText(body.motivo, 1000) };
      const r = await fetch(`${baseEC}?id=eq.${id}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'update');
      // Devolvemos identidad del asig para que el front arme la alerta a Memo
      // sin un GET extra (preserva el shape del flujo de declinar).
      return ok(headers, { asignacion: { id, evento_id: asig.evento_id, coordi_id: asig.coordi_id, status: patch.status } });
    }

    // ── viajeros_evento: upsert staff (idempotente, identidad server-side) ─
    if (accion === 'viajero_upsert_staff') {
      const asigId = String(body.asig_id || '').trim();
      if (!UUID_RE.test(asigId)) return bad(headers, 'asig_id inválido');

      const asig = await getAsig(baseEC, sbHeaders, asigId);
      if (!asig || !asig.evento_id || !asig.coordi_id) return ok(headers, { viajero: null }); // best-effort
      if (!esAdmin && asig.coordi_id !== jwtUserId) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes registrar viajero de otra asignación' }) };
      }

      // Identidad SIEMPRE de `usuarios` (anti-spoofing), nunca del cliente.
      const ur = await fetch(
        `${baseUsuarios}?id=eq.${asig.coordi_id}&select=id,nombre,celular,correo,talla_playera,num_emergencia,nombre_emergencia,rol&limit=1`,
        { headers: sbHeaders });
      if (!ur.ok) return upstream(headers, await ur.text(), 'consulta');
      const u = (await ur.json())[0];
      if (!u) return ok(headers, { viajero: null });

      // Idempotencia por (evento_id, correo).
      if (u.correo) {
        const ex = await fetch(
          `${baseVE}?evento_id=eq.${encodeURIComponent(asig.evento_id)}&correo=eq.${encodeURIComponent(u.correo)}&select=id&limit=1`,
          { headers: sbHeaders });
        if (ex.ok) {
          const exRows = await ex.json();
          if (exRows.length) return ok(headers, { viajero: exRows[0] });
        }
      }

      const baseRow = {
        evento_id: asig.evento_id,
        nombre: u.nombre,
        celular: u.celular || null,
        correo: u.correo || null,
        talla_playera: u.talla_playera || null,
        num_emergencia: u.num_emergencia || null,
        emergencia_nombre: u.nombre_emergencia || null,
        tipo_paquete: 'PLUS',
        notas: `[STAFF:${u.rol || 'staff'}] Asignación automática por aceptar tour`,
      };

      // Intenta con tipo_viajero/usuario_id; si la migración de columnas no está
      // en prod, reintenta sin esos campos (mismo fallback que el front 9801).
      let ins = await fetch(baseVE, {
        method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ ...baseRow, tipo_viajero: u.rol || 'staff', usuario_id: u.id }),
      });
      if (!ins.ok) {
        const detail = await ins.text();
        if (/tipo_viajero|usuario_id|schema cache|column/i.test(detail)) {
          ins = await fetch(baseVE, {
            method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' },
            body: JSON.stringify(baseRow),
          });
          if (!ins.ok) return upstream(headers, await ins.text(), 'insert');
        } else {
          return upstream(headers, detail, 'insert');
        }
      }
      const insRows = await ins.json();
      return ok(headers, { viajero: insRows[0] || null });
    }

    // ── viajeros_evento: listar (descarga) — admin o coordi del evento ────
    if (accion === 'viajero_listar') {
      const evento_id = String(body.evento_id || '').trim();
      if (!evento_id || !SLUG_RE.test(evento_id) || evento_id.length > 120) return bad(headers, 'evento_id inválido');

      if (!esAdmin) {
        // El coordi debe tener una asignación a ese evento.
        const cr = await fetch(
          `${baseEC}?coordi_id=eq.${jwtUserId}&evento_id=eq.${encodeURIComponent(evento_id)}&select=id&limit=1`,
          { headers: sbHeaders });
        if (!cr.ok) return upstream(headers, await cr.text(), 'consulta');
        if (!(await cr.json()).length) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'No tienes asignación a este evento' }) };
        }
      }

      const sp = new URLSearchParams();
      sp.set('select', VE_READ_COLS);
      sp.append('evento_id', `eq.${evento_id}`);
      sp.set('order', 'nombre.asc');
      sp.set('limit', '2000');
      const r = await fetch(`${baseVE}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const viajeros = await r.json();
      return ok(headers, { viajeros });
    }

    // ── viajeros_evento: eliminar (admin) ────────────────────────────────
    if (accion === 'viajero_eliminar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const r = await fetch(`${baseVE}?id=eq.${id}`, {
        method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) return upstream(headers, await r.text(), 'delete');
      return ok(headers, {});
    }

    return bad(headers, 'accion inválida');
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-coordi-asignaciones', detail: e.message }) };
  }
};

// ----- helpers -----

function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== ''; }

function cleanText(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

async function getAsig(baseEC, sbHeaders, id) {
  const r = await fetch(`${baseEC}?id=eq.${id}&select=id,evento_id,coordi_id,status&limit=1`, { headers: sbHeaders });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
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
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}
