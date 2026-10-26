// =============================================================================
// admin-mas-alla.js — EL MÁS ALLÁ: las solicitudes de eventos agotados (KH)
// =============================================================================
// [MAS-ALLA-1 · 26-oct-2026] La pantalla EL MÁS ALLÁ (la Lista de espera
// renombrada) gana una vista de SOLICITUDES DE AGOTADOS: lo que la gente pidió
// por el wizard cuando el evento ya no vende (tabla `mas_alla_solicitudes`,
// acta migraciones/MAS-ALLA-1.sql). Aquí se lista y se marca el seguimiento.
//
// Roles: maestro_roshi · bulma · milk (firmado por Memo 26-oct — la misma
// gente de la bandeja de requisiciones).
//
// Body JSON: { accion, ... }
//   'listar'  → { ok, solicitudes:[...], catalogo_ok }
//       Cada solicitud va ENRIQUECIDA con el catálogo servido (_lib/
//       catalogo-index, el dueño): ev_nombre, ev_fecha (display humano),
//       ev_ds (YYYY-MM-DD para ordenar por cercanía), ev_venue.
//       🔒 Catálogo caído = fail-soft DICHO (`catalogo_ok:false`): las
//       solicitudes salen igual, sin fecha — esconder demanda por una lectura
//       caída sería un cero falso.
//   'marcar'  { id, estado: pendiente|vendido|no_vendido, nota? } → { ok, solicitud }
//       Seguimiento REVERSIBLE de contenido, no dinero: por eso no pide
//       `confirmar` (no hay DELETE aquí; nada se borra jamás). El PATCH viaja
//       CON su filtro id=eq. y sella atendido_por (correo del JWT) +
//       atendido_at; volver a 'pendiente' los limpia.
//
// 🔒 CERO DELETEs en este archivo: una solicitud no se borra, se marca.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { fetchCatalogo } = require('./_lib/catalogo-index');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ROLES = ['maestro_roshi', 'bulma', 'milk'];
const ACCIONES = ['listar', 'marcar'];
const ESTADOS = ['pendiente', 'vendido', 'no_vendido'];

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

const COLS = 'id,evento_id,evento_nombre,nombre,celular,correo,cantidad,paquetes,zonas,estado,nota,atendido_por,atendido_at,created_at';

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const accion = String(body.accion || '');
  if (!ACCIONES.includes(accion)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Acción no reconocida. Se puede: ${ACCIONES.join(', ')}.`, codigo: 'ACCION_DESCONOCIDA' }) };
  }

  const auth = await verifyAdminAuthLive(event, ROLES);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };
  if (!SB_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado' }) };

  const sbH = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
  const base = `${SB_URL}/rest/v1/mas_alla_solicitudes`;

  try {
    // ── listar ──────────────────────────────────────────────────────────────
    if (accion === 'listar') {
      const r = await fetch(`${base}?select=${COLS}&order=created_at.desc&limit=2000`, { headers: sbH });
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 300);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      const filas = await r.json();

      // El catálogo SERVIDO enriquece: fecha para ordenar por cercanía y el
      // nombre bueno del evento. Caído → se DICE, no se esconde demanda.
      let cat = null;
      try { cat = await fetchCatalogo(); } catch (_) { cat = null; }
      const solicitudes = (Array.isArray(filas) ? filas : []).map((s) => {
        const ev = (cat && s.evento_id && cat[s.evento_id]) || null;
        return {
          ...s,
          ev_nombre: ev ? (ev.nombre || s.evento_nombre || s.evento_id) : (s.evento_nombre || s.evento_id),
          ev_fecha: ev ? (ev.fecha || null) : null,
          ev_ds: ev ? (ev.ds || null) : null,
          ev_venue: ev ? (ev.venue || null) : null,
        };
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, solicitudes, catalogo_ok: !!cat }) };
    }

    // ── marcar ──────────────────────────────────────────────────────────────
    if (accion === 'marcar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      const estado = String(body.estado || '');
      if (!ESTADOS.includes(estado)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `estado inválido — se puede: ${ESTADOS.join(', ')}` }) };
      }
      const quien = (auth.user && (auth.user.correo || auth.user.email)) || (auth.user && (auth.user.id || auth.user.sub)) || 'admin';
      const patch = {
        estado,
        atendido_por: estado === 'pendiente' ? null : String(quien).slice(0, 120),
        atendido_at: estado === 'pendiente' ? null : new Date().toISOString(),
      };
      if (Object.prototype.hasOwnProperty.call(body, 'nota')) {
        patch.nota = String(body.nota || '').trim().slice(0, 300) || null;
      }
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbH, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 300);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el marcado', detail }) };
      }
      const rows = await r.json();
      if (!rows || !rows[0]) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitud no encontrada' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, solicitud: rows[0] }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-mas-alla', detail: e.message }) };
  }
};
