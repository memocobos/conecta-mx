// =============================================================================
// admin-radar.js — Acceso server-side al Radar del Dragón (KH)
//
// Cierra la exposición a anon de las tablas de tracking/analítica. kamehouse.html
// ya NO lee con anon ni llama el RPC con anon: todo pasa por aquí con service_role
// + verifyAdminAuth. Mismo patrón que admin-tours/admin-kits.
//
// ⚠️ radar_metricas (y radar_main/rol/pagos_metrics) son SECURITY INVOKER → respetan
// RLS. Llamarlos con service_role BYPASSA RLS, así que siguen funcionando tras cerrar
// las tablas a anon. Esta función SOLO reenvía la respuesta del RPC TAL CUAL (no
// recalcula KPIs/embudo).
//
// Body JSON: { accion, ... }   (Rol: maestro_roshi — el Radar es solo de él)
//   - 'metricas' { rango } → reenvía radar_metricas(p_rango) tal cual (KPIs/embudo/tops).
//   - 'fetch' { table, select?, since, until? } → lectura paginada (Range + Content-Range,
//        created_at gte since [lt until], order created_at.desc) → { ok, rows:[...] }.
//        table ∈ main_eventos_uso | pagos_eventos_uso | rol_eventos_uso | eventos_waitlist.
//   - 'alertas_listar'      → radar_alertas select=* order created_at.desc limit 200.
//   - 'alertas_no_vistas'   → radar_alertas vista=false select=id limit 200 (badge).
//   - 'alerta_vista' { id } → PATCH radar_alertas vista=true por id.
//   - 'alertas_vista_todas' → PATCH radar_alertas vista=true donde vista=false.
//
// Seguridad: verifyAdminAuth (maestro_roshi) + corsCheck. service_role para la query.
//   El tracking público (main-track/rol-track/pagos-track) usa service_role aparte y
//   NO se rompe con el cierre. NUNCA se expone la service key.
//
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const ROLES_RADAR = ['maestro_roshi']; // PERMISOS_TABS: el Radar es solo de maestro_roshi.

const RADAR_TABLES = ['main_eventos_uso', 'pagos_eventos_uso', 'rol_eventos_uso', 'eventos_waitlist'];
const SELECT_RE = /^[a-zA-Z0-9_,]+$/;            // lista de columnas PostgREST
const ISO_RE = /^\d{4}-\d{2}-\d{2}[T0-9:.Z+\-]*$/; // timestamptz ISO (since/until)
const RANGO_RE = /^[a-z0-9_]{1,20}$/;            // p_rango del RPC
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ACCIONES = {
  metricas: ROLES_RADAR,
  main_metrics: ROLES_RADAR,
  fetch: ROLES_RADAR,
  alertas_listar: ROLES_RADAR,
  alertas_no_vistas: ROLES_RADAR,
  alerta_vista: ROLES_RADAR,
  alertas_vista_todas: ROLES_RADAR,
};

const PAGE_SIZE = 5000;
const MAX_ROWS = 100000;

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
  const restBase = `${env.KH_SB_URL}/rest/v1`;

  try {
    // ── metricas (RPC passthrough — NO recalcula nada) ───────────────────────
    if (accion === 'metricas') {
      const rango = String(body.rango || '').trim();
      if (!RANGO_RE.test(rango)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'rango inválido' }) };
      }
      // INVOKER + service_role = bypassa RLS → funciona aunque las tablas estén cerradas.
      const r = await fetch(`${restBase}/rpc/radar_metricas`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ p_rango: rango }),
      });
      const text = await r.text();
      if (!r.ok) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el RPC', detail: text }) };
      }
      // Reenvía la respuesta del RPC TAL CUAL dentro de { ok, metricas }.
      let metricas;
      try { metricas = JSON.parse(text); } catch { metricas = text; }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, metricas }) };
    }

    // ── main_metrics (RPC radar_main_metrics con ventana explícita — comparativas) ──
    if (accion === 'main_metrics') {
      const since = String(body.since || '').trim();
      if (!ISO_RE.test(since)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'since inválido (ISO)' }) };
      }
      let pUntil = null;
      if (body.until != null && body.until !== '') {
        const until = String(body.until).trim();
        if (!ISO_RE.test(until)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'until inválido (ISO)' }) };
        }
        pUntil = until;
      }
      const r = await fetch(`${restBase}/rpc/radar_main_metrics`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ p_since: since, p_until: pUntil }),
      });
      const text = await r.text();
      if (!r.ok) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el RPC', detail: text }) };
      }
      let metricas;
      try { metricas = JSON.parse(text); } catch { metricas = text; }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, metricas }) };
    }

    // ── fetch (lectura paginada idéntica a _radarFetch) ──────────────────────
    if (accion === 'fetch') {
      const table = String(body.table || '').trim();
      if (RADAR_TABLES.indexOf(table) < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'table no permitida' }) };
      }
      const select = (body.select == null || body.select === '') ? '*' : String(body.select).trim();
      if (select !== '*' && !SELECT_RE.test(select)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'select inválido' }) };
      }
      const since = String(body.since || '').trim();
      if (!ISO_RE.test(since)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'since inválido (ISO)' }) };
      }
      let until = '';
      if (body.until != null && body.until !== '') {
        until = String(body.until).trim();
        if (!ISO_RE.test(until)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'until inválido (ISO)' }) };
        }
      }

      let qs = `select=${encodeURIComponent(select)}`;
      qs += `&created_at=gte.${encodeURIComponent(since)}`;
      if (until) qs += `&created_at=lt.${encodeURIComponent(until)}`;
      qs += '&order=created_at.desc';
      const url = `${restBase}/${table}?${qs}`;

      const all = [];
      let off = 0;
      while (off < MAX_ROWS) {
        const resp = await fetch(url, {
          headers: { ...sbHeaders, 'Range-Unit': 'items', Range: off + '-' + (off + PAGE_SIZE - 1), Prefer: 'count=exact' },
        });
        if (!resp.ok) {
          if (resp.status === 416) break; // offset fuera del total → fin
          if (off === 0 && all.length === 0) {
            const detail = await resp.text();
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
          }
          break;
        }
        const rows = await resp.json();
        if (!Array.isArray(rows) || rows.length === 0) break;
        all.push(...rows);
        const cr = resp.headers.get('content-range') || '';
        const total = parseInt((cr.split('/')[1] || '0'), 10);
        if (Number.isFinite(total) && total > 0 && all.length >= total) break;
        off += rows.length;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, rows: all }) };
    }

    // ── alertas_listar ───────────────────────────────────────────────────────
    if (accion === 'alertas_listar') {
      const r = await fetch(`${restBase}/radar_alertas?select=*&order=created_at.desc&limit=200`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, rows: await r.json() }) };
    }

    // ── alertas_no_vistas (badge) ──────────────────────────────────────────────
    if (accion === 'alertas_no_vistas') {
      const r = await fetch(`${restBase}/radar_alertas?vista=eq.false&select=id&limit=200`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, rows: await r.json() }) };
    }

    // ── alerta_vista (marcar una leída) ────────────────────────────────────────
    if (accion === 'alerta_vista') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id) && !/^\d+$/.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const r = await fetch(`${restBase}/radar_alertas?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ vista: true }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── alertas_vista_todas ────────────────────────────────────────────────────
    if (accion === 'alertas_vista_todas') {
      const r = await fetch(`${restBase}/radar_alertas?vista=eq.false`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ vista: true }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-radar', detail: e.message }) };
  }
};

// ----- helpers -----

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
