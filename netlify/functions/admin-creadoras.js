// =============================================================================
// admin-creadoras.js — [CREA-SEG] el seguimiento de las creadoras de contenido.
// Palabra de Memo (14-oct): checklist de lo entregado (lo marca ÉL), correos a
// la creadora, fechas límite por contrato, ranking con puntos automáticos y
// sus redes/celular a la mano.
//
// Body JSON { accion, ... }:
//   - 'entregables_listar' { contrato_id } → { entregables, sugeridos? }
//        Si el contrato aún no tiene entregables, `sugeridos` los propone a
//        partir de la cláusula 2.2 (expectativas) — no se guarda nada.
//   - 'entregables_guardar' { contrato_id, items:[{id?,descripcion,fase,fecha_limite,orden}], avisar? }
//        Inserta los nuevos, actualiza los existentes; los que ya no vienen
//        pasan a 'descartado' (sin DELETE). avisar:true → correo «calendario».
//   - 'entregable_marcar' { id, estado:'entregado'|'pendiente', link?, avisar? }
//        avisar (default true al marcar entregado) → correo «recibido».
//   - 'redes_guardar' { contrato_id, instagram?, tiktok?, celular? }
//   - 'ranking' {} → { creadoras:[…] } puntos automáticos (_lib/creadoras).
// Roles: escribir = maestro_roshi (lo marca Memo). Leer = maestro_roshi/bulma/milk.
// =============================================================================
const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const L = require('./_lib/creadoras');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEEN = ['maestro_roshi', 'bulma', 'milk'];
const ESCRIBE = ['maestro_roshi'];
const ACCIONES = {
  entregables_listar: LEEN, ranking: LEEN,
  entregables_guardar: ESCRIBE, entregable_marcar: ESCRIBE, redes_guardar: ESCRIBE,
  aviso_vigentes: ESCRIBE,
};
const PLANTILLAS = ['creadora', 'creadora_team'];

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = { 'Access-Control-Allow-Origin': __origin || 'null', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' };
  const res = (s, o) => ({ statusCode: s, headers, body: JSON.stringify(o) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  if (!__origin) return res(403, { error: 'Origen no permitido' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return res(400, { error: 'JSON inválido' }); }
  const accion = body.accion;
  if (!(accion in ACCIONES)) return res(400, { error: 'accion inválida' });
  const auth = await verifyAdminAuthLive(event, ACCIONES[accion]);
  if (!auth.valid) return res(auth.status, { error: auth.error });
  const quien = (auth.user && (auth.user.correo || auth.user.id)) || 'admin';

  const URL_ = process.env.SUPABASE_URL_KAMEHOUSE, KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!URL_ || !KEY) return res(500, { error: 'Faltan env vars KH' });
  const sb = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const T_C = `${URL_}/rest/v1/contratos_creadores`, T_E = `${URL_}/rest/v1/entregables_creadora`;
  const get = async (u) => { const r = await fetch(u, { headers: sb }); if (!r.ok) throw new Error(await r.text()); return r.json(); };
  const send = async (u, method, b) => {
    const r = await fetch(u, { method, headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify(b) });
    if (!r.ok) throw new Error(await r.text()); return r.json();
  };
  const contrato = async (id) => (await get(`${T_C}?id=eq.${id}&select=id,token,creador_nombre,creador_email,plantilla,estado,evento_nombre,evento_fecha,expectativas,datos,firmado_at&limit=1`))[0];
  const entregables = async (cid) => get(`${T_E}?contrato_id=eq.${cid}&select=*&order=orden.asc,created_at.asc`);

  try {
    if (accion === 'entregables_listar') {
      const cid = String(body.contrato_id || ''); if (!UUID_RE.test(cid)) return res(400, { error: 'contrato_id inválido' });
      const c = await contrato(cid); if (!c) return res(404, { error: 'Ese contrato no existe' });
      const items = await entregables(cid);
      const out = { ok: true, contrato: { id: c.id, nombre: c.creador_nombre, correo: c.creador_email, evento: c.evento_nombre, fecha: c.evento_fecha, estado: c.estado, redes: pickRedes(c.datos) }, entregables: items };
      if (!items.length) {
        // Sugeridos desde la cláusula 2.2. Un renglón que menciona «previo» Y
        // «posterior» (p. ej. «2 reels: uno previo … y otro posterior») se parte
        // en dos: son dos entregas con dos fechas distintas.
        const sug = [];
        (Array.isArray(c.expectativas) ? c.expectativas : []).forEach((x) => {
          const t = String(x || '').trim(); if (!t) return;
          if (/previo/i.test(t) && /posterior/i.test(t)) {
            sug.push({ descripcion: 'Reel previo al evento — ' + t, fase: 'previo' });
            sug.push({ descripcion: 'Reel posterior al evento — ' + t, fase: 'posterior' });
          } else sug.push({ descripcion: t, fase: L.faseSugerida(t) });
        });
        sug.forEach((s) => { s.fecha_limite = s.fase === 'evento' ? (c.evento_fecha || null) : s.fase === 'posterior' && c.evento_fecha ? sumarDias(c.evento_fecha, 3) : null; });
        out.sugeridos = sug;
      }
      return res(200, out);
    }

    if (accion === 'entregables_guardar') {
      const cid = String(body.contrato_id || ''); if (!UUID_RE.test(cid)) return res(400, { error: 'contrato_id inválido' });
      const c = await contrato(cid); if (!c) return res(404, { error: 'Ese contrato no existe' });
      if (!PLANTILLAS.includes(c.plantilla)) return res(400, { error: 'Solo contratos de creadoras' });
      if (c.estado === 'cancelado') return res(409, { error: 'La colaboración está cancelada' });
      const items = Array.isArray(body.items) ? body.items : null;
      if (!items || items.length > 30) return res(400, { error: 'items inválidos' });
      const limpios = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        const d = String(it.descripcion || '').trim().slice(0, 400);
        if (d.length < 3) return res(400, { error: `El entregable ${i + 1} no tiene descripción` });
        if (!['previo', 'evento', 'posterior'].includes(it.fase)) return res(400, { error: `El entregable ${i + 1} no tiene fase` });
        const f = it.fecha_limite ? String(it.fecha_limite) : null;
        if (f && !FECHA_RE.test(f)) return res(400, { error: `Fecha inválida en el entregable ${i + 1}` });
        limpios.push({ id: UUID_RE.test(String(it.id || '')) ? it.id : null, descripcion: d, fase: it.fase, fecha_limite: f, orden: i });
      }
      const actuales = await entregables(cid);
      const ids = new Set(limpios.filter((x) => x.id).map((x) => x.id));
      for (const x of limpios) {
        if (x.id) {
          if (!actuales.some((a) => a.id === x.id)) return res(400, { error: 'Un entregable no es de este contrato' });
          await send(`${T_E}?id=eq.${x.id}&contrato_id=eq.${cid}`, 'PATCH', { descripcion: x.descripcion, fase: x.fase, fecha_limite: x.fecha_limite, orden: x.orden, ...(actuales.find((a) => a.id === x.id).estado === 'descartado' ? { estado: 'pendiente' } : {}) });
        } else {
          await send(T_E, 'POST', { contrato_id: cid, descripcion: x.descripcion, fase: x.fase, fecha_limite: x.fecha_limite, orden: x.orden, creado_por: quien });
        }
      }
      for (const a of actuales) {
        if (!ids.has(a.id) && a.estado !== 'descartado') await send(`${T_E}?id=eq.${a.id}`, 'PATCH', { estado: 'descartado' });
      }
      const nuevos = await entregables(cid);
      let correo = null;
      if (body.avisar === true && c.estado === 'firmado') {
        const m = L.correoCreadora('calendario', c, nuevos);
        correo = await L.enviarCorreo(c.creador_email, m.asunto, m.html);
        if (correo.enviado) await anotarDatos(T_C, sb, c, { calendario_email_at: new Date().toISOString(), calendario_email_id: correo.email_id });
      }
      return res(200, { ok: true, entregables: nuevos, correo });
    }

    if (accion === 'entregable_marcar') {
      const id = String(body.id || ''); if (!UUID_RE.test(id)) return res(400, { error: 'id inválido' });
      const estado = body.estado; if (!['entregado', 'pendiente'].includes(estado)) return res(400, { error: 'estado inválido' });
      const e = (await get(`${T_E}?id=eq.${id}&select=*&limit=1`))[0]; if (!e) return res(404, { error: 'Ese entregable no existe' });
      const c = await contrato(e.contrato_id);
      if (e.estado === estado) return res(200, { ok: true, ya: true, entregable: e });
      const link = body.link ? String(body.link).trim().slice(0, 500) : (estado === 'entregado' ? e.link : e.link);
      const patch = estado === 'entregado' ? { estado, entregado_at: new Date().toISOString(), link: link || null } : { estado, entregado_at: null };
      // Valor esperado: dos clics no escriben dos veces.
      const out = await send(`${T_E}?id=eq.${id}&estado=eq.${e.estado}`, 'PATCH', patch);
      if (!out.length) return res(409, { error: 'Cambió mientras tanto; recarga' });
      let correo = null;
      const avisar = body.avisar !== false;
      if (estado === 'entregado' && avisar && c && c.estado === 'firmado' && !(e.avisos && e.avisos.recibido)) {
        const todos = await entregables(c.id);
        const m = L.correoCreadora('recibido', c, todos, { entregable: out[0] });
        correo = await L.enviarCorreo(c.creador_email, m.asunto, m.html);
        if (correo.enviado) await send(`${T_E}?id=eq.${id}`, 'PATCH', { avisos: { ...(e.avisos || {}), recibido: new Date().toISOString() } });
      }
      return res(200, { ok: true, entregable: out[0], correo });
    }

    if (accion === 'redes_guardar') {
      const cid = String(body.contrato_id || ''); if (!UUID_RE.test(cid)) return res(400, { error: 'contrato_id inválido' });
      const c = await contrato(cid); if (!c) return res(404, { error: 'Ese contrato no existe' });
      const r = normRedes(body);
      if (r.error) return res(400, { error: r.error });
      await anotarDatos(T_C, sb, c, r.redes);
      return res(200, { ok: true, redes: r.redes });
    }

    // ── [CREA-SEG-6] AVISO A TODAS LAS CREADORAS VIGENTES ──────────────────
    // Les manda su calendario (el mismo correo «calendario»: a las pendientes
    // les pide firmar, a las firmadas sin redes que las completen). Solo a
    // contratos de creadora firmados/pendientes con evento por venir y con
    // entregables. 🔒 Seco por DEFAULT (enseña la lista y un correo de
    // muestra); con confirmar:true manda. Una vez por contrato: quien ya lo
    // recibió se salta salvo `forzar:true`.
    if (accion === 'aviso_vigentes') {
      const hoy = L.hoyMx();
      const cs = await get(`${T_C}?plantilla=in.(creadora,creadora_team)&estado=in.(firmado,pendiente)&evento_fecha=gte.${hoy}&select=id,token,creador_nombre,creador_email,plantilla,estado,evento_nombre,evento_fecha,expectativas,datos&order=evento_fecha.asc&limit=500`);
      const ids = cs.map((c) => c.id);
      const es = ids.length ? await get(`${T_E}?contrato_id=in.(${ids.join(',')})&estado=neq.descartado&select=*&order=orden.asc&limit=5000`) : [];
      const lista = cs.map((c) => {
        const d = (c.datos && typeof c.datos === 'object') ? c.datos : {};
        const items = es.filter((e) => e.contrato_id === c.id);
        return { c, items, fila: { id: c.id, nombre: c.creador_nombre, correo: c.creador_email, evento: c.evento_nombre, fecha: c.evento_fecha, estado: c.estado,
          entregables: items.length, falta_redes: c.estado === 'firmado' && (!d.instagram || !d.celular), ya_enviado: !!d.calendario_email_at } };
      });
      const forzar = body.forzar === true;
      const aMandar = lista.filter((x) => x.items.length && x.c.creador_email && (forzar || !x.fila.ya_enviado));
      if (body.confirmar !== true) {
        const muestra = aMandar[0] ? L.correoCreadora('calendario', aMandar[0].c, aMandar[0].items) : null;
        return res(200, { ok: true, seco: true, vigentes: lista.map((x) => x.fila), a_mandar: aMandar.length, muestra });
      }
      const hechos = [];
      for (const x of aMandar) {
        const m = L.correoCreadora('calendario', x.c, x.items);
        const r = await L.enviarCorreo(x.c.creador_email, m.asunto, m.html);
        if (r.enviado) await anotarDatos(T_C, sb, x.c, { calendario_email_at: new Date().toISOString(), calendario_email_id: r.email_id });
        hechos.push({ nombre: x.c.creador_nombre, evento: x.c.evento_nombre, enviado: r.enviado, error: r.error || null });
      }
      return res(200, { ok: true, hechos });
    }

    if (accion === 'ranking') {
      const cs = await get(`${T_C}?plantilla=in.(creadora,creadora_team)&estado=in.(firmado,cancelado)&select=id,creador_nombre,creador_email,plantilla,estado,evento_nombre,evento_fecha,datos&limit=2000`);
      const ids = cs.map((c) => c.id);
      let es = [];
      if (ids.length) es = await get(`${T_E}?contrato_id=in.(${ids.join(',')})&select=contrato_id,estado,fecha_limite,entregado_at&limit=10000`);
      const hoy = L.hoyMx();
      const por = new Map();
      cs.forEach((c) => {
        const k = String(c.creador_email || c.creador_nombre).toLowerCase().trim();
        if (!por.has(k)) por.set(k, { nombre: c.creador_nombre, correo: c.creador_email, colaboraciones: 0, cumplidas: 0, bajas: 0, a_tiempo: 0, tarde: 0, vencidos: 0, puntos: 0, ultima: null, eventos: [], redes: null });
        const p = por.get(k);
        const ev = L.evaluarContrato(c, es.filter((e) => e.contrato_id === c.id), hoy);
        p.colaboraciones++; if (ev.cumplida) p.cumplidas++; if (ev.baja) p.bajas++;
        p.a_tiempo += ev.a_tiempo; p.tarde += ev.tarde; p.vencidos += ev.vencido; p.puntos += ev.puntos;
        if (!p.ultima || (c.evento_fecha || '') > p.ultima) { p.ultima = c.evento_fecha || p.ultima; p.nombre = c.creador_nombre; }
        p.eventos.push({ evento: c.evento_nombre, fecha: c.evento_fecha, estado: c.estado, puntos: ev.puntos });
        const rd = pickRedes(c.datos); if (rd && (rd.instagram || rd.tiktok || rd.celular)) p.redes = rd;
      });
      const lista = [...por.values()].sort((a, b) => b.puntos - a.puntos || b.colaboraciones - a.colaboraciones);
      return res(200, { ok: true, creadoras: lista, puntos: L.PUNTOS });
    }
  } catch (e) {
    return res(502, { error: 'KH rechazó la operación', detail: String(e.message || e).slice(0, 300) });
  }
  return res(400, { error: 'accion inválida' });
};

function sumarDias(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function pickRedes(d) {
  d = (d && typeof d === 'object') ? d : {};
  return { instagram: d.instagram || null, tiktok: d.tiktok || null, celular: d.celular || null };
}
// @usuario sin «@» ni URL; celular a 10 dígitos.
function normRedes(b) {
  const h = (v) => { const t = String(v || '').trim().replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\/@?/i, '').replace(/^@/, '').replace(/[/?#].*$/, ''); return t ? t.slice(0, 60) : null; };
  const redes = {};
  if ('instagram' in b) redes.instagram = h(b.instagram);
  if ('tiktok' in b) redes.tiktok = h(b.tiktok);
  if ('celular' in b) {
    const c = String(b.celular || '').replace(/\D/g, '');
    if (c && c.length !== 10) return { error: 'El celular va a 10 dígitos' };
    redes.celular = c || null;
  }
  return { redes };
}
async function anotarDatos(T_C, sb, c, extra) {
  const r = await fetch(`${T_C}?id=eq.${c.id}&select=datos&limit=1`, { headers: sb });
  const d = r.ok ? (((await r.json())[0] || {}).datos || {}) : {};
  await fetch(`${T_C}?id=eq.${c.id}`, { method: 'PATCH', headers: sb, body: JSON.stringify({ datos: { ...d, ...extra } }) });
}
module.exports.normRedes = normRedes;
