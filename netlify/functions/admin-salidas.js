// =============================================================================
// admin-salidas.js — TORRE DE KARIN v2 F2: motor de SALIDAS con permiso previo
//
// Regla de Memo (D1): el que viaja levanta su REPORTE DE SALIDA por evento
// ANTES del viaje → correo a TODOS los cuidadores (rol mister_popo) con lo
// solicitado + link a KH → el cuidador corrobora y DA SALIDA → hasta entonces
// el stock baja en automático y el material sale. FYI a Maestro Roshi en el
// momento (quién salió, con qué y cuánto) + confirmación al solicitante.
//
// Tabla `salidas_bodega` (KH; SQL ya corrido): evento_id (slug), solicitante_id
// (usuarios.id), solicitante_rol, detalle jsonb (snapshot congelado al
// solicitar: [{pieza_id,pieza,cantidad,retornable}]), notas, estado
// (solicitada/autorizada/rechazada/cancelada/cerrada), creado_en,
// autorizada_en/por, cerrada_en, reporte_id (lo llena F4a al cerrar el ciclo).
//
// Acciones (molde ACCIONES de la casa):
//   · 'crear'      { evento_id, detalle:[{pieza_id,cantidad}], notas? }
//        Roles que viajan (D-4: VENDEDOR FUERA): coordinador, cc, mister_popo,
//        maestro_roshi, bulma. Valida piezas contra kits_inventario y CONGELA
//        el snapshot (pieza/retornable del inventario, jamás del cliente).
//        Valida stock disponible (fail-fast; dar_salida re-valida con autoridad).
//        NO TOCA STOCK. Correo a los cuidadores best-effort (correo_enviado).
//   · 'listar'     { estado?, evento_id?, limit? } — cuidador/admins ven todo;
//        coordinador/cc SOLO lo suyo (forzado server-side, patrón admin-reportes).
//   · 'dar_salida' { id } — SOLO cuidador/admins. Re-valida stock pieza por
//        pieza (insuficiente → 409 con detalle, sin descontar NADA), DESCUENTA
//        read-then-write (jamás on_conflict), marca autorizada UNA SOLA VEZ
//        (re-dar → 409). Si el marcado falla tras descontar → ROLLBACK del
//        stock (patrón admin-reembolsos). Correos best-effort ESTRICTO: FYI a
//        Roshi + confirmación al solicitante; un correo caído JAMÁS revierte
//        la salida (se reporta correo_fyi/correo_solicitante en la respuesta).
//   · 'rechazar'   { id, motivo? } — cuidador/admins, solo en 'solicitada'.
//        El motivo viaja en el correo al solicitante (no se persiste).
//   · 'cancelar'   { id } — el solicitante dueño (o admins), solo 'solicitada'.
//        D-2: una salida enviada NO se edita — se cancela y se crea otra.
//
// Encaje: strikes y cadena de aprobación de reportes NI SE TOCAN (eso es F4).
// El congelamiento por faltantes vencidos llega en F4b (candado en 'crear').
//
// Env (KH + Resend): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE,
//   JWT_SECRET, RESEND_KEY (|| RESEND_API_KEY, opcional — best-effort).
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');
// F4b: cuenta de LA EMPRESA para pagar faltantes (verdad única de #289 —
// paquete 'plus' → ev.banco || BBVA default). Best-effort: sin catálogo → null.
const { resolverCuentaDeCatalogo } = require('./_lib/cuenta-deposito');
let fetchCatalogo = null;
try { ({ fetchCatalogo } = require('./_lib/catalogo-index')); } catch (_) { fetchCatalogo = null; }

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const EVENTO_RE = /^[A-Za-z0-9_.#-]+$/;
const MAX_ITEMS = 40;
const ADMIN_EMAIL = 'admin@conectareynosa.mx';
const SITE = process.env.URL || 'https://conectareynosa.mx';

// D-4: vendedores FUERA de salidas de bodega.
const ROLES_VIAJAN = ['coordinador', 'cc', 'mister_popo', 'maestro_roshi', 'bulma', 'milk'];
const ROLES_CUIDADOR = ['mister_popo', 'maestro_roshi', 'bulma', 'milk'];
const ROLES_VE_TODO = ROLES_CUIDADOR;

const ACCIONES = {
  crear: ROLES_VIAJAN,
  listar: ROLES_VIAJAN,
  dar_salida: ROLES_CUIDADOR,
  rechazar: ROLES_CUIDADOR,
  cancelar: ROLES_VIAJAN,
  faltantes_pagado: ['maestro_roshi'], // F4b: "marcar pagado" — SOLO Memo descongela
};

const COLS = 'id,evento_id,solicitante_id,solicitante_rol,detalle,notas,estado,creado_en,autorizada_en,autorizada_por,cerrada_en,reporte_id,faltantes,faltantes_monto,faltantes_vence,faltantes_pagado_at,faltantes_pagado_por';

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
  const rol = auth.user.rol;
  const uid = String(auth.user.id || '');
  const veTodo = ROLES_VE_TODO.includes(rol);

  const env = readEnv();
  if (env.error) return json(500, { error: env.error });
  const kh = { apikey: env.KH_KEY, Authorization: 'Bearer ' + env.KH_KEY, 'Content-Type': 'application/json' };
  const baseSalidas = `${env.KH_URL}/rest/v1/salidas_bodega`;
  const baseKits = `${env.KH_URL}/rest/v1/kits_inventario`;
  const enc = encodeURIComponent;

  try {
    // ── crear (permiso previo — NO toca stock) ─────────────────────────────
    if (accion === 'crear') {
      const evento_id = String(body.evento_id || '').trim();
      if (!evento_id || evento_id.length > 120 || !EVENTO_RE.test(evento_id)) return json(400, { error: 'evento_id inválido' });
      const notas = (body.notas != null && String(body.notas).trim() !== '') ? String(body.notas).trim().slice(0, 1000) : null;

      // 🗼 F4b — CONGELAMIENTO calculado EN VIVO (estilo F6 vendedores, cero
      // crons escribiendo estados): faltantes VENCIDOS sin pagar → la puerta
      // de nuevas salidas se cierra hasta que Memo marque pagado. Best-effort
      // estricto: si la consulta falla, NO se congela (jamás dejar fuera a
      // alguien por un error de red). Los admins no se congelan a sí mismos.
      if (rol === 'coordinador' || rol === 'cc' || rol === 'mister_popo') {
        const cong = await congeladoPorFaltantes(env, kh, uid);
        if (cong) {
          return json(403, {
            error: `Tienes faltantes de bodega vencidos sin liquidar (${_fmtMXN(cong.monto)}, vencieron el ${cong.vence}) — paga el monto y pide a Conecta que te reactive`,
            codigo: 'bodega_congelada', faltantes_monto: cong.monto, faltantes_vence: cong.vence,
          });
        }
      }

      const items = Array.isArray(body.detalle) ? body.detalle : [];
      if (!items.length) return json(400, { error: 'Agrega al menos una pieza' });
      if (items.length > MAX_ITEMS) return json(400, { error: `Máximo ${MAX_ITEMS} piezas por salida` });
      const porPieza = {};
      for (const it of items) {
        const pid = String((it && it.pieza_id) || '').trim();
        const cant = Number(it && it.cantidad);
        if (!UUID_RE.test(pid)) return json(400, { error: 'pieza_id inválido' });
        if (!Number.isInteger(cant) || cant < 1) return json(400, { error: 'cantidad debe ser entero >= 1' });
        porPieza[pid] = (porPieza[pid] || 0) + cant; // dedup: misma pieza suma
      }

      // Snapshot CONGELADO desde el inventario (pieza/retornable jamás del cliente).
      const ids = Object.keys(porPieza);
      const kR = await fetch(`${baseKits}?id=in.(${ids.map(enc).join(',')})&select=id,pieza,cantidad,retornable`, { headers: kh });
      if (!kR.ok) return json(502, { error: 'KH rechazó la consulta de inventario', detail: await kR.text() });
      const piezas = (await kR.json().catch(() => [])) || [];
      const porId = {};
      piezas.forEach(p => { porId[String(p.id)] = p; });
      const detalle = [];
      const sinStock = [];
      for (const pid of ids) {
        const p = porId[pid];
        if (!p) return json(400, { error: 'Una pieza ya no existe en el inventario — refresca y vuelve a intentar' });
        const cant = porPieza[pid];
        if (cant > (Number(p.cantidad) || 0)) sinStock.push({ pieza: p.pieza, solicitado: cant, disponible: Number(p.cantidad) || 0 });
        detalle.push({ pieza_id: pid, pieza: p.pieza, cantidad: cant, retornable: !!p.retornable });
      }
      // Fail-fast de stock (dar_salida re-valida con autoridad al autorizar).
      if (sinStock.length) return json(400, { error: 'Stock insuficiente', sin_stock: sinStock });

      const iR = await fetch(baseSalidas, {
        method: 'POST',
        headers: { ...kh, Prefer: 'return=representation' },
        body: JSON.stringify({ evento_id, solicitante_id: uid, solicitante_rol: rol, detalle, notas }),
      });
      if (!iR.ok) return json(502, { error: 'No se pudo crear la salida', detail: await iR.text() });
      const [salida] = (await iR.json().catch(() => [])) || [];

      // Correo a TODOS los cuidadores (D-3) — best-effort, jamás bloquea.
      let correo_enviado = false;
      try {
        correo_enviado = await correoCuidadores(env, kh, auth.user, evento_id, detalle, notas);
      } catch (e) { console.warn('[admin-salidas] correo cuidadores falló (best-effort):', e.message); }

      return json(200, { ok: true, salida, correo_enviado });
    }

    // ── listar (viajero SOLO lo suyo) ──────────────────────────────────────
    if (accion === 'listar') {
      const sp = new URLSearchParams();
      sp.set('select', COLS);
      sp.set('order', 'creado_en.desc');
      let limit = parseInt(body.limit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) limit = 200;
      sp.set('limit', String(limit));
      if (typeof body.estado === 'string' && ['solicitada', 'autorizada', 'rechazada', 'cancelada', 'cerrada'].includes(body.estado.trim())) {
        sp.append('estado', `eq.${body.estado.trim()}`);
      }
      if (typeof body.evento_id === 'string' && body.evento_id.trim() && EVENTO_RE.test(body.evento_id.trim())) {
        sp.append('evento_id', `eq.${body.evento_id.trim()}`);
      }
      // Anti-escalación: coordinador/cc SOLO ven sus propias salidas.
      if (!veTodo) sp.append('solicitante_id', `eq.${uid}`);
      const r = await fetch(`${baseSalidas}?${sp.toString()}`, { headers: kh });
      if (!r.ok) return json(502, { error: 'KH rechazó la consulta', detail: await r.text() });
      const salidas = await r.json();
      // 🗼 F4b: si hay faltantes SIN pagar, la respuesta trae la cuenta de LA
      // EMPRESA para liquidarlos (verdad única #289: 'plus' → banco del evento
      // || BBVA). Best-effort: sin catálogo → sin cuenta (jamás una equivocada).
      let cuenta_empresa;
      try {
        const pend = (Array.isArray(salidas) ? salidas : []).find(x => Number(x.faltantes_monto) > 0 && !x.faltantes_pagado_at);
        if (pend && fetchCatalogo) {
          const cat = await fetchCatalogo();
          cuenta_empresa = resolverCuentaDeCatalogo(cat, pend.evento_id, 'plus') || undefined;
        }
      } catch (e) { cuenta_empresa = undefined; }
      return json(200, { ok: true, salidas, ve_todo: veTodo, ...(cuenta_empresa ? { cuenta_empresa } : {}) });
    }

    // ── dar_salida (el permiso: descuenta stock UNA SOLA VEZ) ──────────────
    if (accion === 'dar_salida') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return json(400, { error: 'id inválido' });
      const salida = await leerSalida(baseSalidas, kh, id);
      if (!salida) return json(404, { error: 'Salida no encontrada' });
      if (salida.estado !== 'solicitada') return json(409, { error: `La salida ya está ${salida.estado} — dar salida solo aplica una vez` });

      const detalle = Array.isArray(salida.detalle) ? salida.detalle : [];
      if (!detalle.length) return json(409, { error: 'La salida no tiene piezas' });

      // Re-validación con autoridad: stock ACTUAL pieza por pieza.
      const ids = detalle.map(d => String(d.pieza_id));
      const kR = await fetch(`${baseKits}?id=in.(${ids.map(enc).join(',')})&select=id,pieza,cantidad`, { headers: kh });
      if (!kR.ok) return json(502, { error: 'KH rechazó la consulta de inventario', detail: await kR.text() });
      const piezas = (await kR.json().catch(() => [])) || [];
      const porId = {};
      piezas.forEach(p => { porId[String(p.id)] = p; });
      const sinStock = [];
      for (const d of detalle) {
        const p = porId[String(d.pieza_id)];
        const disp = p ? (Number(p.cantidad) || 0) : 0;
        if (!p || d.cantidad > disp) sinStock.push({ pieza: d.pieza, solicitado: d.cantidad, disponible: disp });
      }
      if (sinStock.length) return json(409, { error: 'Stock insuficiente para dar salida', sin_stock: sinStock });

      // DESCUENTO read-then-write por pieza (jamás on_conflict). Si una falla,
      // ROLLBACK de las ya descontadas (best-effort) y 502.
      const descontadas = [];
      for (const d of detalle) {
        const p = porId[String(d.pieza_id)];
        const nueva = (Number(p.cantidad) || 0) - d.cantidad;
        const pR = await fetch(`${baseKits}?id=eq.${enc(String(d.pieza_id))}`, {
          method: 'PATCH',
          headers: { ...kh, Prefer: 'return=minimal' },
          body: JSON.stringify({ cantidad: nueva }),
        });
        if (!pR.ok) {
          await rollbackStock(baseKits, kh, descontadas);
          return json(502, { error: `No se pudo descontar "${d.pieza}" — no se descontó nada`, detail: await pR.text() });
        }
        descontadas.push({ pieza_id: String(d.pieza_id), antes: Number(p.cantidad) || 0 });
      }

      // Marcar autorizada. Si falla, ROLLBACK del stock completo.
      const ahora = new Date().toISOString();
      const quien = auth.user.correo || rol;
      const mR = await fetch(`${baseSalidas}?id=eq.${enc(id)}&estado=eq.solicitada`, {
        method: 'PATCH',
        headers: { ...kh, Prefer: 'return=representation' },
        body: JSON.stringify({ estado: 'autorizada', autorizada_en: ahora, autorizada_por: quien }),
      });
      const marcadas = mR.ok ? ((await mR.json().catch(() => [])) || []) : [];
      if (!mR.ok || !marcadas.length) {
        // No se marcó (error o carrera: alguien más la movió) → stock de vuelta.
        await rollbackStock(baseKits, kh, descontadas);
        return json(mR.ok ? 409 : 502, { error: 'No se pudo autorizar la salida — el stock NO quedó descontado', detail: mR.ok ? 'la salida cambió de estado' : await mR.text() });
      }

      // Correos best-effort ESTRICTO: el stock ya se movió, nada se revierte.
      let correo_fyi = false, correo_solicitante = false;
      try { correo_fyi = await correoFyiRoshi(env, salida, auth.user); } catch (e) { console.warn('[admin-salidas] FYI falló:', e.message); }
      try { correo_solicitante = await correoSolicitante(env, kh, salida, 'autorizada', null); } catch (e) { console.warn('[admin-salidas] confirmación falló:', e.message); }

      return json(200, { ok: true, correo_fyi, correo_solicitante });
    }

    // ── rechazar (cuidador, con motivo por correo) ─────────────────────────
    if (accion === 'rechazar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return json(400, { error: 'id inválido' });
      const motivo = (body.motivo != null && String(body.motivo).trim() !== '') ? String(body.motivo).trim().slice(0, 500) : null;
      const salida = await leerSalida(baseSalidas, kh, id);
      if (!salida) return json(404, { error: 'Salida no encontrada' });
      if (salida.estado !== 'solicitada') return json(409, { error: `La salida ya está ${salida.estado}` });
      const pR = await fetch(`${baseSalidas}?id=eq.${enc(id)}&estado=eq.solicitada`, {
        method: 'PATCH',
        headers: { ...kh, Prefer: 'return=minimal' },
        body: JSON.stringify({ estado: 'rechazada' }),
      });
      if (!pR.ok) return json(502, { error: 'No se pudo rechazar', detail: await pR.text() });
      let correo_solicitante = false;
      try { correo_solicitante = await correoSolicitante(env, kh, salida, 'rechazada', motivo); } catch (e) { /* best-effort */ }
      return json(200, { ok: true, correo_solicitante });
    }

    // ── cancelar (el dueño, solo 'solicitada' — D-2: sin edición) ──────────
    if (accion === 'cancelar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return json(400, { error: 'id inválido' });
      const salida = await leerSalida(baseSalidas, kh, id);
      if (!salida) return json(404, { error: 'Salida no encontrada' });
      if (!veTodo && String(salida.solicitante_id) !== uid) return json(403, { error: 'Esta salida no es tuya' });
      if (salida.estado !== 'solicitada') return json(409, { error: `La salida ya está ${salida.estado} — solo se cancela lo solicitado` });
      const pR = await fetch(`${baseSalidas}?id=eq.${enc(id)}&estado=eq.solicitada`, {
        method: 'PATCH',
        headers: { ...kh, Prefer: 'return=minimal' },
        body: JSON.stringify({ estado: 'cancelada' }),
      });
      if (!pR.ok) return json(502, { error: 'No se pudo cancelar', detail: await pR.text() });
      return json(200, { ok: true });
    }

    // ── faltantes_pagado (SOLO Memo): "marcar pagado" descongela ───────────
    if (accion === 'faltantes_pagado') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return json(400, { error: 'id inválido' });
      const salida = await leerSalida(baseSalidas, kh, id);
      if (!salida) return json(404, { error: 'Salida no encontrada' });
      if (!(Number(salida.faltantes_monto) > 0)) return json(400, { error: 'Esta salida no tiene faltantes cobrados' });
      if (salida.faltantes_pagado_at) return json(409, { error: 'Estos faltantes ya están marcados como pagados' });
      const ahora = new Date().toISOString();
      const pR = await fetch(`${baseSalidas}?id=eq.${enc(id)}&faltantes_pagado_at=is.null`, {
        method: 'PATCH',
        headers: { ...kh, Prefer: 'return=representation' },
        body: JSON.stringify({ faltantes_pagado_at: ahora, faltantes_pagado_por: auth.user.correo || rol }),
      });
      const marcadas = pR.ok ? ((await pR.json().catch(() => [])) || []) : [];
      if (!pR.ok || !marcadas.length) return json(pR.ok ? 409 : 502, { error: 'No se pudo marcar pagado', detail: pR.ok ? 'ya estaba pagado' : await pR.text() });
      return json(200, { ok: true, faltantes_pagado_at: ahora });
    }

    return json(400, { error: 'accion inválida' });
  } catch (e) {
    return json(502, { error: 'Error en admin-salidas', detail: e.message });
  }
};

// F4b: ¿el solicitante tiene faltantes VENCIDOS sin pagar? → {monto, vence} o
// null. Best-effort: cualquier error → null (NO congela).
async function congeladoPorFaltantes(env, kh, uid) {
  try {
    const hoyMX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
    const r = await fetch(
      `${env.KH_URL}/rest/v1/salidas_bodega?solicitante_id=eq.${encodeURIComponent(uid)}` +
      `&faltantes_monto=gt.0&faltantes_pagado_at=is.null&faltantes_vence=lt.${hoyMX}` +
      `&select=faltantes_monto,faltantes_vence&limit=1`,
      { headers: kh }
    );
    if (!r.ok) return null;
    const [row] = (await r.json().catch(() => [])) || [];
    return row ? { monto: Number(row.faltantes_monto) || 0, vence: String(row.faltantes_vence || '').slice(0, 10) } : null;
  } catch (e) { return null; }
}

function _fmtMXN(n) {
  return '$' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('es-MX');
}

// ----- helpers -----

async function leerSalida(baseSalidas, kh, id) {
  const r = await fetch(`${baseSalidas}?id=eq.${encodeURIComponent(id)}&select=${COLS}&limit=1`, { headers: kh });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return (rows && rows[0]) || null;
}

// Rollback best-effort del stock descontado (restaura `antes`).
async function rollbackStock(baseKits, kh, descontadas) {
  for (const d of descontadas) {
    try {
      await fetch(`${baseKits}?id=eq.${encodeURIComponent(d.pieza_id)}`, {
        method: 'PATCH',
        headers: { ...kh, Prefer: 'return=minimal' },
        body: JSON.stringify({ cantidad: d.antes }),
      });
    } catch (e) { console.error('[admin-salidas] rollback falló para', d.pieza_id, e.message); }
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function tablaPiezas(detalle) {
  const filas = (detalle || []).map(d => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:13px;color:#fff">${escapeHtml(d.pieza)}${d.retornable ? ' <span style="font-size:10px;color:#7cc4ff;font-weight:700">(retornable — regresa siempre)</span>' : ''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:13px;color:#e8ff4c;font-weight:700;text-align:right">${Number(d.cantidad) || 0}</td>
    </tr>`).join('');
  return `<table style="border-collapse:collapse;width:100%">
    <tr>
      <th style="text-align:left;padding:6px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);border-bottom:2px solid rgba(255,255,255,.25)">Pieza</th>
      <th style="text-align:right;padding:6px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);border-bottom:2px solid rgba(255,255,255,.25)">Cantidad</th>
    </tr>${filas}</table>`;
}

function moldeCorreo(titulo, cuerpoHtml) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;background:#0a0a0a;color:#fff;padding:0">
  <div style="background:#e8ff4c;color:#000;padding:18px;border-bottom:4px solid #ff283b">
    <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Torre de Karin · Bodega</div>
    <div style="font-size:20px;font-weight:900;margin-top:4px">${titulo}</div>
  </div>
  <div style="padding:22px">${cuerpoHtml}</div>
</div>`;
}

async function enviarCorreo(env, to, subject, html) {
  if (!env.RESEND_KEY || !to || (Array.isArray(to) && !to.length)) return false;
  const __mp = aplicarModoPrueba({ to: Array.isArray(to) ? to : [to], subject });
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Torre de Karin <admin@conectareynosa.mx>', to: __mp.to, subject: __mp.subject, html }),
  });
  return r.ok;
}

// Correos de los cuidadores: TODOS los usuarios rol mister_popo (D-3).
async function correosCuidadores(env, kh) {
  const r = await fetch(`${env.KH_URL}/rest/v1/usuarios?rol=eq.mister_popo&select=correo,correo_notif&limit=50`, { headers: kh });
  if (!r.ok) return [];
  const rows = (await r.json().catch(() => [])) || [];
  return [...new Set(rows.map(u => String(u.correo_notif || u.correo || '').trim().toLowerCase()).filter(c => c.includes('@')))];
}

async function correoCuidadores(env, kh, solicitante, evento_id, detalle, notas) {
  const to = await correosCuidadores(env, kh);
  if (!to.length) return false;
  const html = moldeCorreo('Salida de bodega solicitada', `
    <p style="font-size:14px;line-height:1.6;color:#fff;margin:0 0 14px 0">
      <b>${escapeHtml(solicitante.correo || solicitante.rol)}</b> solicita material para
      <b style="color:#e8ff4c">${escapeHtml(evento_id)}</b>. Corrobora y da salida — el stock
      NO baja hasta que tú lo autorices.
    </p>
    ${tablaPiezas(detalle)}
    ${notas ? `<p style="margin-top:14px;font-size:13px;color:rgba(255,255,255,.7)"><b>Notas:</b> ${escapeHtml(notas)}</p>` : ''}
    <p style="margin-top:18px;font-size:12px;color:rgba(255,255,255,.7)">
      Autoriza en <a href="${SITE}/kamehouse" style="color:#e8ff4c;text-decoration:none;font-weight:700">Kamehouse → Torre de Karin</a>.
    </p>`);
  return enviarCorreo(env, to, `Salida de bodega solicitada · ${evento_id}`, html);
}

// FYI a Maestro Roshi al DAR salida: quién salió, con qué y cuánto (D1).
async function correoFyiRoshi(env, salida, cuidador) {
  const html = moldeCorreo('Salida de bodega autorizada', `
    <p style="font-size:14px;line-height:1.6;color:#fff;margin:0 0 14px 0">
      <b>${escapeHtml(cuidador.correo || cuidador.rol)}</b> dio salida al material de
      <b style="color:#e8ff4c">${escapeHtml(salida.evento_id)}</b> solicitado por
      <b>${escapeHtml(salida.solicitante_rol || '')}</b>. El stock ya quedó descontado.
    </p>
    ${tablaPiezas(salida.detalle)}`);
  return enviarCorreo(env, [ADMIN_EMAIL], `[Bodega] Salida autorizada · ${salida.evento_id}`, html);
}

// Confirmación (autorizada) o aviso (rechazada, con motivo) al solicitante.
async function correoSolicitante(env, kh, salida, resultado, motivo) {
  const r = await fetch(`${env.KH_URL}/rest/v1/usuarios?id=eq.${encodeURIComponent(String(salida.solicitante_id))}&select=correo,correo_notif&limit=1`, { headers: kh });
  if (!r.ok) return false;
  const [u] = (await r.json().catch(() => [])) || [];
  const to = String((u && (u.correo_notif || u.correo)) || '').trim().toLowerCase();
  if (!to.includes('@')) return false;
  const ok = resultado === 'autorizada';
  const html = moldeCorreo(ok ? 'Tu salida de bodega fue autorizada' : 'Tu salida de bodega fue rechazada', `
    <p style="font-size:14px;line-height:1.6;color:#fff;margin:0 0 14px 0">
      ${ok
        ? `El cuidador dio salida a tu material de <b style="color:#e8ff4c">${escapeHtml(salida.evento_id)}</b>. Pasa a la Torre de Karin a recogerlo. Las piezas retornables regresan SIEMPRE.`
        : `Tu solicitud de material para <b style="color:#e8ff4c">${escapeHtml(salida.evento_id)}</b> fue rechazada${motivo ? `: <b>${escapeHtml(motivo)}</b>` : ''}. Si hace falta, levanta una nueva salida.`}
    </p>
    ${tablaPiezas(salida.detalle)}`);
  return enviarCorreo(env, [to], ok ? `Salida autorizada · ${salida.evento_id}` : `Salida rechazada · ${salida.evento_id}`, html);
}

function readEnv() {
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_URL || !KH_KEY) return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY || '';
  return { KH_URL, KH_KEY, RESEND_KEY };
}
