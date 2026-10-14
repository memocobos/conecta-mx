#!/usr/bin/env node
// mide:crea-seg-1 — el seguimiento de creadoras (14-oct): entregables con fecha,
// correos (calendario / recibido / recordatorios / vencido), ranking y redes.
// Handlers REALES (admin-creadoras y el cron), base falsa con filtros + valor
// esperado, Resend falso que CUENTA. Cero DELETEs.
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.RESEND_API_KEY = 're_falso';
process.env.CORREOS_MODO = 'real';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };
const L = require(path.join(RAIZ, 'netlify/functions/_lib/creadoras.js'));
const hoy = L.hoyMx();
const dia = (n) => { const d = new Date(hoy + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const C1 = 'cccccccc-0000-4000-8000-000000000001', C2 = 'cccccccc-0000-4000-8000-000000000002', C3 = 'cccccccc-0000-4000-8000-000000000003';
let DB, MAILS = [], SEQ = 0;
const base = () => ({
  contratos_creadores: [
    { id: C1, token: 'tok1', creador_nombre: 'Ana Creadora', creador_email: 'ana@x.mx', plantilla: 'creadora', estado: 'firmado', evento_nombre: 'Enjambre', evento_fecha: dia(10),
      expectativas: ['2 reels en colaboración: uno previo al evento y otro posterior mostrando tu experiencia.', '4 a 5 historias durante el evento.', '1 carrusel posterior agradeciendo.'], datos: { talla: 'M' } },
    { id: C2, token: 'tok2', creador_nombre: 'Ximena', creador_email: 'xim@x.mx', plantilla: 'creadora', estado: 'cancelado', evento_nombre: 'Enjambre', evento_fecha: dia(10), datos: {} },
    { id: C3, token: 'tok3', creador_nombre: 'Ana Creadora', creador_email: 'ana@x.mx', plantilla: 'creadora', estado: 'firmado', evento_nombre: 'Pasado', evento_fecha: dia(-20), datos: {} },
  ],
  entregables_creadora: [
    { id: 'eeeeeeee-0000-4000-8000-000000000001', contrato_id: C3, orden: 0, descripcion: 'Reel previo', fase: 'previo', fecha_limite: dia(-27), estado: 'entregado', entregado_at: dia(-28) + 'T18:00:00Z', avisos: {} },
    { id: 'eeeeeeee-0000-4000-8000-000000000002', contrato_id: C3, orden: 1, descripcion: 'Carrusel', fase: 'posterior', fecha_limite: dia(-17), estado: 'entregado', entregado_at: dia(-17) + 'T18:00:00Z', avisos: {} },
  ],
});
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
const casa = (row, k, v) => {
  const val = row[k] == null ? null : String(row[k]);
  if (v === 'not.is.null') return val !== null;
  if (v.startsWith('eq.')) return val === decodeURIComponent(v.slice(3));
  if (v.startsWith('neq.')) return val !== null && val !== decodeURIComponent(v.slice(4));
  if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(val);
  if (v.startsWith('gte.')) return val !== null && val >= v.slice(4);
  throw new Error('filtro no modelado ' + k + '=' + v);
};
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase();
  if (String(url).startsWith('https://api.resend.com')) { MAILS.push(JSON.parse(init.body)); return resp(200, { id: 'em_' + MAILS.length }); }
  const u = new URL(url); const t = u.pathname.replace('/rest/v1/', ''); const T = DB[t]; if (!T) throw new Error('tabla ' + t);
  if (m === 'DELETE') throw new Error('DELETE prohibido');
  const sel = (r) => { for (const [k, v] of u.searchParams.entries()) { if (['select', 'order', 'limit'].includes(k)) continue; if (!casa(r, k, v)) return false; } return true; };
  if (m === 'GET') return resp(200, JSON.parse(JSON.stringify(T.filter(sel))));
  const b = JSON.parse(init.body);
  if (m === 'POST') { const f = Object.assign({ id: require('crypto').randomUUID(), estado: 'pendiente', avisos: {}, created_at: new Date().toISOString() }, b); T.push(f); return resp(201, [f]); }
  if (m === 'PATCH') { const fs = T.filter(sel); fs.forEach((r) => Object.assign(r, b)); return resp(200, JSON.parse(JSON.stringify(fs))); }
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-creadoras.js'));
const CRON = require(path.join(RAIZ, 'netlify/functions/creadoras-entregables-diario.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const pedir = async (b, rol = 'maestro_roshi') => { const tok = jwtSign({ id: 'aaaaaaaa-0000-4000-8000-0000000000aa', rol, correo: 'memo@x.mx' }, process.env.JWT_SECRET, 3600);
  const r = await H.handler({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(b) }); return { s: r.statusCode, j: JSON.parse(r.body) }; };
const ents = (cid) => DB.entregables_creadora.filter((e) => e.contrato_id === cid);
(async () => {
  console.log('══ mide:crea-seg-1 ══');
  DB = base();
  let r = await pedir({ accion: 'entregables_listar', contrato_id: C1 });
  const sug = r.j.sugeridos || [];
  af(r.s === 200 && sug.length === 4, `[A1] sugeridos desde la 2.2: el renglón previo+posterior se parte en dos (${sug.length})`);
  // [CREA-SEG-7] plazos de Memo (14-oct): reel posterior = el 3er día contando el
  // del evento (evento+2) · durante = hasta las 12:00 del día siguiente.
  af(sug[0].fase === 'previo' && sug[1].fase === 'posterior' && sug[1].fecha_limite === dia(12) && sug[2].fase === 'evento' && sug[2].fecha_limite === dia(11) && sug[2].hora_limite === '12:00', '[A2] fases y fechas sugeridas (reel posterior = evento+2, durante = evento+1 a las 12:00)');
  af(ents(C1).length === 0, '[A3] listar no guarda nada');
  const items = sug.map((s, i) => ({ ...s, fecha_limite: s.fase === 'previo' ? dia(3) : s.fecha_limite }));
  MAILS = [];
  r = await pedir({ accion: 'entregables_guardar', contrato_id: C1, items, avisar: true });
  af(r.s === 200 && ents(C1).length === 4 && MAILS.length === 1 && /fechas de entrega/i.test(MAILS[0].subject), `[B1] guardar con avisar: 4 entregables + correo «calendario» (${r.s}, ${MAILS.length})`);
  af(/Faltan/.test(MAILS[0].html) && MAILS[0].html.includes('/contrato?t=tok1'), '[B2] el correo trae la cuenta regresiva y el link de su colaboración');
  const keep = r.j.entregables.slice(0, 3).map((e) => ({ id: e.id, descripcion: e.descripcion, fase: e.fase, fecha_limite: e.fecha_limite }));
  r = await pedir({ accion: 'entregables_guardar', contrato_id: C1, items: keep });
  af(r.s === 200 && ents(C1).length === 4 && ents(C1).filter((e) => e.estado === 'descartado').length === 1, '[B3] el que ya no viene queda DESCARTADO, sin borrar');
  r = await pedir({ accion: 'entregables_guardar', contrato_id: C2, items: keep });
  af(r.s === 409, `[B4] colaboración cancelada no admite entregables (${r.s})`);
  // marcar
  const e0 = ents(C1).find((e) => e.fase === 'previo');
  MAILS = [];
  r = await pedir({ accion: 'entregable_marcar', id: e0.id, estado: 'entregado' });
  af(r.s === 200 && e0.estado === 'entregado' && e0.entregado_at && MAILS.length === 1 && /Recibimos/.test(MAILS[0].subject), `[C1] marcar entregado: estado + correo «recibido» (${MAILS.length})`);
  af(/Te falta/.test(MAILS[0].html), '[C2] el correo dice lo que falta');
  r = await pedir({ accion: 'entregable_marcar', id: e0.id, estado: 'entregado' });
  af(r.j.ya === true && MAILS.length === 1, '[C3] 2º clic: nada, ni otro correo');
  r = await pedir({ accion: 'entregable_marcar', id: e0.id, estado: 'pendiente' });
  r = await pedir({ accion: 'entregable_marcar', id: e0.id, estado: 'entregado' });
  af(MAILS.length === 1, '[C4] desmarcar y volver a marcar NO repite el correo «recibido»');
  r = await pedir({ accion: 'entregable_marcar', id: e0.id, estado: 'entregado' }, 'bulma');
  af(r.s === 403, `[C5] bulma no marca (${r.s})`);
  // redes
  r = await pedir({ accion: 'redes_guardar', contrato_id: C1, instagram: 'https://www.instagram.com/ana.crea/', tiktok: '@anatk', celular: '899 123 4567' });
  af(r.s === 200 && DB.contratos_creadores[0].datos.instagram === 'ana.crea' && DB.contratos_creadores[0].datos.tiktok === 'anatk' && DB.contratos_creadores[0].datos.celular === '8991234567' && DB.contratos_creadores[0].datos.talla === 'M', '[D1] redes normalizadas y el resto de datos intacto');
  r = await pedir({ accion: 'redes_guardar', contrato_id: C1, celular: '123' });
  af(r.s === 400, '[D2] celular que no es de 10 dígitos → 400');
  // cron: previo vence en 3 días? e0 entregado. agregamos uno que vence en 3 y uno vencido
  DB.entregables_creadora.push({ id: 'e-r3', contrato_id: C1, orden: 9, descripcion: '2 historias', fase: 'previo', fecha_limite: dia(3), estado: 'pendiente', avisos: {} });
  DB.entregables_creadora.push({ id: 'e-ven', contrato_id: C1, orden: 10, descripcion: 'Historia vieja', fase: 'previo', fecha_limite: dia(-1), estado: 'pendiente', avisos: {} });
  DB.entregables_creadora.push({ id: 'e-can', contrato_id: C2, orden: 0, descripcion: 'Nada', fase: 'previo', fecha_limite: dia(1), estado: 'pendiente', avisos: {} });
  MAILS = [];
  let cr = JSON.parse((await CRON({ queryStringParameters: { seco: '1' } })).body);
  af(cr.seco && MAILS.length === 0 && cr.plan.length === 2, `[E1] cron seco: 2 correos planeados (r3 + vencido), 0 enviados, la cancelada fuera (${cr.plan && cr.plan.length})`);
  cr = JSON.parse((await CRON({})).body);
  af(MAILS.length === 2 && MAILS.some((m) => /En 3 días/.test(m.subject)) && MAILS.some((m) => /Venció/.test(m.subject)), `[E2] cron real: recordatorio de 3 días + vencido (${MAILS.length})`);
  af(DB.entregables_creadora.find((e) => e.id === 'e-r3').avisos.r3 && DB.entregables_creadora.find((e) => e.id === 'e-ven').avisos.vencido, '[E3] la bitácora queda en cada entregable');
  cr = JSON.parse((await CRON({})).body);
  af(MAILS.length === 2, '[E4] 2ª corrida el mismo día: no repite');
  // ranking
  r = await pedir({ accion: 'ranking' }, 'bulma');
  const ana = (r.j.creadoras || []).find((c) => c.correo === 'ana@x.mx');
  const xim = (r.j.creadoras || []).find((c) => c.correo === 'xim@x.mx');
  af(r.s === 200 && ana && ana.colaboraciones === 2 && ana.cumplidas === 1, `[F1] Ana: 2 colaboraciones, 1 cumplida (${ana && ana.colaboraciones}/${ana && ana.cumplidas})`);
  af(xim && xim.bajas === 1 && xim.puntos < 0, `[F2] Ximena (dada de baja) en NEGATIVO (${xim && xim.puntos})`);
  af(r.j.creadoras[0].correo === 'ana@x.mx', '[F3] ordenado por puntos');
  const evC = L.evaluarContrato({ estado: 'firmado', evento_fecha: dia(-5) }, [{ estado: 'entregado', fecha_limite: dia(-8), entregado_at: dia(-6) + 'T18:00:00Z' }], hoy);
  af(evC.tarde === 1 && evC.puntos === L.PUNTOS.tarde + L.PUNTOS.cumplida, '[F4] entregado después de su fecha cuenta TARDE');
  // [CREA-SEG-6] aviso a vigentes: seco por default, una vez por contrato
  DB.contratos_creadores.push({ id: 'cccccccc-0000-4000-8000-000000000004', token: 'tok4', creador_nombre: 'Pendiente P', creador_email: 'p@x.mx', plantilla: 'creadora', estado: 'pendiente', evento_nombre: 'Futuro', evento_fecha: dia(30), datos: {} });
  DB.entregables_creadora.push({ id: 'eeeeeeee-0000-4000-8000-000000000009', contrato_id: 'cccccccc-0000-4000-8000-000000000004', orden: 0, descripcion: 'Reel previo', fase: 'previo', fecha_limite: dia(23), estado: 'pendiente', avisos: {} });
  MAILS = [];
  r = await pedir({ accion: 'aviso_vigentes' });
  af(r.s === 200 && r.j.seco && MAILS.length === 0 && r.j.a_mandar === 1 && r.j.vigentes.length === 2 && r.j.vigentes.find((v) => v.estado === 'firmado').ya_enviado && r.j.muestra, `[G1] aviso seco: la firmada que ya recibió su calendario se salta, solo la pendiente; la cancelada fuera, 0 correos (${r.j.a_mandar})`);
  r = await pedir({ accion: 'aviso_vigentes', confirmar: true });
  af(MAILS.length === 1 && /Firma tu contrato/.test(MAILS[0].subject), `[G2] confirmado: 1 correo y a la pendiente le pide firmar (${MAILS.length})`);
  r = await pedir({ accion: 'aviso_vigentes', confirmar: true });
  af(MAILS.length === 1, '[G4] 2ª vez no repite');
  r = await pedir({ accion: 'aviso_vigentes', confirmar: true, forzar: true });
  af(MAILS.length === 3 && !MAILS.slice(1).some((m) => /Completa tu Instagram/.test(m.html)), '[G5] con forzar le llega otra vez a las dos; la firmada YA tiene redes: no se le piden');
  // contrato-redes (público por token)
  const RED = require(path.join(RAIZ, 'netlify/functions/contrato-redes.js')).handler;
  DB.contratos_creadores[0].token = 'a'.repeat(40);
  let rr = await RED({ httpMethod: 'POST', body: JSON.stringify({ token: 'a'.repeat(40), instagram: '@ana.ig', celular: '8991112233' }) });
  af(rr.statusCode === 200 && DB.contratos_creadores[0].datos.instagram === 'ana.ig' && DB.contratos_creadores[0].datos.talla === 'M', `[H1] la creadora guarda sus redes por su link (${rr.statusCode})`);
  DB.contratos_creadores[3].token = 'b'.repeat(40);
  rr = await RED({ httpMethod: 'POST', body: JSON.stringify({ token: 'b'.repeat(40), instagram: 'x', celular: '8991112233' }) });
  af(rr.statusCode === 409, `[H2] una pendiente no (sus datos van al firmar) (${rr.statusCode})`);
  rr = await RED({ httpMethod: 'POST', body: JSON.stringify({ token: 'a'.repeat(40), instagram: 'x', celular: '12' }) });
  af(rr.statusCode === 400, '[H3] WhatsApp inválido → 400');
  console.log(`\n${R ? '🔴' : '🟢'} ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(2); });
