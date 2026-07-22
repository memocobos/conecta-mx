// =============================================================================
// admin-comisiones-zona.js  (VENDEDORES F5a — comisiones CHEAP por zona)
//
// Tabla `comisiones_zona` (KH, Palacio). Memo (maestro_roshi) fija por evento+zona:
//   costo_matriz (a mano, prefill = última compra de esa zona) + comision (monto
//   fijo). El COSTO DEL VENDEDOR CHEAP = costo_matriz + comision. La comisión ES el
//   separo (ganancia de Memo, se cobra primero).
//
// 🔒 PRIVACIDAD DURA: el vendedor NUNCA ve el desglose matriz/comisión ni el margen
// de Memo. La acción 'costo_vendedor' devuelve SOLO el costo final + stock.
//
// Acciones:
//   · 'listar'         {evento_id} → maestro_roshi. Zonas del evento con
//       {zona, costo_matriz, comision, costo_vendedor, sugerencia_matriz, configurada}.
//   · 'guardar'        {evento_id, zona, costo_matriz, comision} → maestro_roshi.
//       READ-THEN-WRITE (JAMÁS on_conflict): PATCH si existe, INSERT si no; 23505 →
//       reintenta el PATCH (lección 42P10 del transporte).
//   · 'costo_vendedor' {evento_id} → vendedor+admin. SOLO zonas con comisión
//       asignada → {zona, costo, stock, agotada}. Sin desglose.
//
// Env: SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE (comisiones_zona + compras),
//      PORTAL_SUPABASE_URL/SERVICE_KEY (solo 'costo_vendedor', para el stock).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { cargarDisponibilidad, evaluarZona } = require('./_lib/disponibilidad');

const ROLES_PALACIO = ['maestro_roshi'];
const ROLES_VENTA = ['vendedor', 'maestro_roshi', 'bulma'];
const ACCIONES = { listar: ROLES_PALACIO, guardar: ROLES_PALACIO, costo_vendedor: ROLES_VENTA };
const EVENTO_RE = /^[A-Za-z0-9_.#-]+$/;
const ZONA_MAX = 120;

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (s, b) => ({ statusCode: s, headers, body: JSON.stringify(b) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!__origin) return json(403, { error: 'Origen no permitido' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  const accion = body.accion;
  if (!(accion in ACCIONES)) return json(400, { error: 'accion inválida' });

  const auth = verifyAdminAuth(event, ACCIONES[accion]);
  if (!auth.valid) return json(auth.status, { error: auth.error });

  const env = readEnv();
  if (env.error) return json(500, { error: env.error });

  const kh = { apikey: env.KH_SB_SERVICE, Authorization: 'Bearer ' + env.KH_SB_SERVICE, 'Content-Type': 'application/json' };
  const baseCom = `${env.KH_SB_URL}/rest/v1/comisiones_zona`;
  const baseCompras = `${env.KH_SB_URL}/rest/v1/compras`;
  const enc = encodeURIComponent;

  const evento_id = String(body.evento_id || '').trim();
  if (!evento_id || !EVENTO_RE.test(evento_id) || evento_id.length > 120) return json(400, { error: 'evento_id inválido' });

  try {
    // ── listar (Memo): comisiones + prefill de la última compra ────────────
    if (accion === 'listar') {
      const [comR, compR] = await Promise.all([
        fetch(`${baseCom}?evento_id=eq.${enc(evento_id)}&select=zona,costo_matriz,comision&order=zona.asc`, { headers: kh }),
        fetch(`${baseCompras}?evento_id=eq.${enc(evento_id)}&select=zona,costo_unitario,fecha&order=fecha.asc`, { headers: kh }),
      ]);
      if (!comR.ok) return json(502, { error: 'KH rechazó comisiones', detail: await comR.text() });
      const comisiones = await comR.json().catch(() => []);
      const compras = comR.ok && compR.ok ? await compR.json().catch(() => []) : [];
      // última compra por zona (mayor fecha) → sugerencia de matriz.
      const sug = {};
      (Array.isArray(compras) ? compras : []).forEach(c => {
        const z = String((c && c.zona) || '').trim(); if (!z) return;
        sug[z] = Number(c.costo_unitario) || 0; // orden asc → la última gana
      });
      const comByZona = {};
      (Array.isArray(comisiones) ? comisiones : []).forEach(c => { comByZona[String(c.zona).trim()] = c; });
      const zonas = [...new Set([...Object.keys(comByZona), ...Object.keys(sug)])].sort();
      const out = zonas.map(z => {
        const c = comByZona[z];
        const matriz = c ? Number(c.costo_matriz) || 0 : null;
        const comision = c ? Number(c.comision) || 0 : 0;
        return {
          zona: z,
          configurada: !!c,
          costo_matriz: matriz,
          comision: comision,
          costo_vendedor: c ? (matriz + comision) : null,
          sugerencia_matriz: (sug[z] != null) ? sug[z] : null,
        };
      });
      return json(200, { ok: true, zonas: out });
    }

    // ── guardar (Memo): READ-THEN-WRITE, jamás on_conflict ─────────────────
    if (accion === 'guardar') {
      const zona = String(body.zona || '').trim();
      if (!zona || zona.length > ZONA_MAX) return json(400, { error: 'zona requerida' });
      const costo_matriz = Math.round(Number(body.costo_matriz));
      const comision = Math.round(Number(body.comision));
      if (!Number.isFinite(costo_matriz) || costo_matriz < 0) return json(400, { error: 'costo_matriz inválido' });
      if (!Number.isFinite(comision) || comision < 0) return json(400, { error: 'comision inválida' });

      const patchBody = JSON.stringify({ costo_matriz, comision, actualizado_por: auth.user.correo || auth.user.rol || 'admin', actualizado_at: new Date().toISOString() });
      const doPatch = () => fetch(`${baseCom}?evento_id=eq.${enc(evento_id)}&zona=eq.${enc(zona)}`, { method: 'PATCH', headers: { ...kh, Prefer: 'return=representation' }, body: patchBody });

      // 1) ¿existe?
      const exR = await fetch(`${baseCom}?evento_id=eq.${enc(evento_id)}&zona=eq.${enc(zona)}&select=id&limit=1`, { headers: kh });
      const existe = exR.ok && ((await exR.json().catch(() => [])) || []).length > 0;
      if (existe) {
        const pR = await doPatch();
        if (!pR.ok) return json(502, { error: 'No se pudo actualizar la comisión', detail: await pR.text() });
        const arr = await pR.json().catch(() => []);
        return json(200, { ok: true, comision: Array.isArray(arr) ? arr[0] : arr });
      }
      // 2) INSERT DIRECTO. Si 23505 (carrera) → ya existía, reintenta el PATCH.
      const insR = await fetch(baseCom, {
        method: 'POST', headers: { ...kh, Prefer: 'return=representation' },
        body: JSON.stringify({ evento_id, zona, costo_matriz, comision, actualizado_por: auth.user.correo || auth.user.rol || 'admin' }),
      });
      if (insR.ok) { const arr = await insR.json().catch(() => []); return json(200, { ok: true, comision: Array.isArray(arr) ? arr[0] : arr }); }
      const detail = await insR.text();
      if (insR.status === 409 || detail.includes('23505')) {
        const pR = await doPatch();
        if (pR.ok) { const arr = await pR.json().catch(() => []); return json(200, { ok: true, comision: Array.isArray(arr) ? arr[0] : arr }); }
        return json(502, { error: 'Carrera al guardar la comisión', detail: await pR.text() });
      }
      return json(502, { error: 'No se pudo guardar la comisión', detail });
    }

    // ── costo_vendedor (vendedor+admin): SOLO costo final + stock ──────────
    if (accion === 'costo_vendedor') {
      const comR = await fetch(`${baseCom}?evento_id=eq.${enc(evento_id)}&select=zona,costo_matriz,comision`, { headers: kh });
      if (!comR.ok) return json(502, { error: 'KH rechazó comisiones', detail: await comR.text() });
      const comisiones = await comR.json().catch(() => []);
      if (!Array.isArray(comisiones) || !comisiones.length) return json(200, { ok: true, zonas: [] });

      // Stock por zona (best-effort). Si no se puede calcular, se omite (no bloquea).
      let disp = null;
      if (env.PORTAL_SB_URL && env.PORTAL_SB_SERVICE) {
        try {
          disp = await cargarDisponibilidad({ khUrl: env.KH_SB_URL, khKey: env.KH_SB_SERVICE, portalUrl: env.PORTAL_SB_URL, portalKey: env.PORTAL_SB_SERVICE, evento_id });
          if (disp && disp.error) disp = null;
        } catch (_) { disp = null; }
      }
      const out = comisiones.map(c => {
        const zona = String(c.zona).trim();
        const costo = (Number(c.costo_matriz) || 0) + (Number(c.comision) || 0);  // SOLO el final; sin desglose
        let stock = null, agotada = false;
        if (disp) { const ev = evaluarZona(disp, zona, 1); if (ev.gestionada) { stock = ev.restante; agotada = ev.agotada; } }
        return { zona, costo, stock, agotada };
      });
      return json(200, { ok: true, zonas: out });
    }

    return json(400, { error: 'accion inválida' });
  } catch (e) {
    return json(502, { error: 'Error en admin-comisiones-zona', detail: e.message });
  }
};

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KH_SB_URL || !KH_SB_SERVICE) return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  return { KH_SB_URL, KH_SB_SERVICE, PORTAL_SB_URL: process.env.PORTAL_SUPABASE_URL, PORTAL_SB_SERVICE: process.env.PORTAL_SUPABASE_SERVICE_KEY };
}
