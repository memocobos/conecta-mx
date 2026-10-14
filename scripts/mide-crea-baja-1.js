#!/usr/bin/env node
// mide:crea-baja-1 — dar de baja la colaboración de una creadora (14-oct).
// Handler REAL (`contrato_cancelar`), base falsa con filtros + valor esperado,
// Resend falso que cuenta envíos. Cero DELETEs.
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.RESEND_API_KEY = 're_falso';
process.env.CORREOS_MODO = 'real';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };
const C1 = 'cccccccc-0000-4000-8000-000000000001', C2 = 'cccccccc-0000-4000-8000-000000000002', C3 = 'cccccccc-0000-4000-8000-000000000003';
let DB, ESC = 0, MAILS = [];
const base = () => ({
  contratos_creadores: [
    { id: C1, creador_nombre: 'Ximena Lozano Rangel', creador_email: 'xim@x.mx', plantilla: 'creadora', estado: 'firmado', evento_nombre: 'Enjambre', evento_fecha: '2026-10-16', firmado_at: '2026-09-29T21:53:20Z', expectativas: ['2 reels en colaboración'], ofrecimiento: ['2 boletos Beyond Oro'], datos: { talla: 'M', cortesia: { evento_id: 'enjambre', zona: 'Beyond Oro', boletos: 2, acompanante: 'Antonio Esparza' } } },
    { id: C2, creador_nombre: 'Coordi', creador_email: 'c@x.mx', plantilla: 'coordinador', estado: 'firmado', datos: {} },
    { id: C3, creador_nombre: 'Sin Cortesía', creador_email: 's@x.mx', plantilla: 'creadora', estado: 'firmado', evento_nombre: 'X', evento_fecha: '2026-10-20', datos: {} },
  ],
  viajeros_evento: [
    { id: 'v1', evento_id: 'enjambre', nombre: 'Ximena Lozano Rangel', tipo_viajero: 'creadora', zona_boleto: 'Beyond Oro', boletos: 1, grupo_viaje: 'g1', notas: 'Cortesía' },
    { id: 'v2', evento_id: 'enjambre', nombre: 'Antonio Esparza', tipo_viajero: 'creadora', zona_boleto: 'Beyond Oro', boletos: 1, grupo_viaje: 'g1', notas: null },
    { id: 'v3', evento_id: 'enjambre', nombre: 'Cliente', tipo_viajero: 'cliente', zona_boleto: 'Beyond Oro', boletos: 1 },
  ],
});
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
const casa = (row, k, v) => {
  const val = row[k] == null ? null : String(row[k]);
  if (v.startsWith('eq.')) return val === decodeURIComponent(v.slice(3));
  throw new Error('filtro no modelado ' + k + '=' + v);
};
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase();
  if (String(url).startsWith('https://api.resend.com')) { MAILS.push(JSON.parse(init.body)); return resp(200, { id: 'em_' + MAILS.length }); }
  const u = new URL(url); const t = u.pathname.replace('/rest/v1/', ''); const T = DB[t]; if (!T) throw new Error('tabla ' + t);
  if (m === 'DELETE') throw new Error('DELETE prohibido');
  const sel = (r) => { for (const [k, v] of u.searchParams.entries()) { if (['select', 'order', 'limit'].includes(k)) continue; if (!casa(r, k, v)) return false; } return true; };
  if (m === 'GET') return resp(200, JSON.parse(JSON.stringify(T.filter(sel))));
  ESC++; const b = JSON.parse(init.body);
  if (m === 'PATCH') { const fs = T.filter(sel); fs.forEach((r) => Object.assign(r, b)); return resp(200, fs); }
  throw new Error('método ' + m);
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const pedir = async (b, rol = 'maestro_roshi') => { const tok = jwtSign({ id: 'aaaaaaaa-0000-4000-8000-0000000000aa', rol, correo: 'memo@x.mx' }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(Object.assign({ accion: 'contrato_cancelar' }, b)) }); return { s: r.statusCode, j: JSON.parse(r.body) }; };
const ctr = (id) => DB.contratos_creadores.find((c) => c.id === id);
(async () => {
  console.log('══ mide:crea-baja-1 ══');
  DB = base();
  let r = await pedir({ contrato_id: C1, motivo: 'No entregaste el contenido previo' });
  af(r.s === 200 && r.j.seco === true && ESC === 0 && MAILS.length === 0, `[A] sin confirmar = seco: 0 escrituras, 0 correos (${r.s}, ${ESC}, ${MAILS.length})`);
  af(r.j.plan && r.j.plan.cortesia_baja.length === 2 && /sin efecto/.test(r.j.plan.correo.html) && /No entregaste/.test(r.j.plan.correo.html), '[A2] el seco enseña las 2 bajas y el correo con «sin efecto» y el motivo');
  af(!r.j.plan.cortesia_baja.some((v) => v.nombre === 'Cliente'), '[A3] un cliente del mismo evento NO entra');
  r = await pedir({ contrato_id: C1, motivo: 'abc' });
  af(r.s === 400, `[B] motivo de menos de 5 → 400 (${r.s})`);
  r = await pedir({ contrato_id: C1, motivo: 'No entregaste el contenido previo', confirmar: true });
  af(r.s === 200 && ctr(C1).estado === 'cancelado' && ctr(C1).datos.cancelacion && ctr(C1).datos.cancelacion.email_id === 'em_1', `[C1] confirmado: contrato cancelado con motivo y email_id (${r.s})`);
  af(DB.viajeros_evento.filter((v) => v.id !== 'v3').every((v) => v.boletos === 0 && v.zona_boleto === null && /BAJA/.test(v.notas)), '[C2] ella y su acompañante de baja, con nota');
  af(DB.viajeros_evento.find((v) => v.id === 'v3').boletos === 1, '[C3] el cliente intacto');
  af(MAILS.length === 1 && MAILS[0].to === 'xim@x.mx' && /Cancelación/.test(MAILS[0].subject), '[C4] UN correo a la creadora');
  af(ctr(C1).datos.cortesia && ctr(C1).datos.talla === 'M', '[C5] los datos previos del contrato se conservan');
  ESC = 0; r = await pedir({ contrato_id: C1, motivo: 'No entregaste el contenido previo', confirmar: true });
  af(r.s === 200 && MAILS.length === 1 && r.j.correo.ya === true, `[D] 2º clic: no se manda otro correo (${MAILS.length})`);
  r = await pedir({ contrato_id: C2, motivo: 'motivo largo', confirmar: true });
  af(r.s === 400 && ctr(C2).estado === 'firmado', `[E] contrato de coordinador → 400 y no se toca (${r.s})`);
  r = await pedir({ contrato_id: C3, motivo: 'No entregaste nada', confirmar: true });
  af(r.s === 200 && ctr(C3).estado === 'cancelado' && r.j.bajas.length === 0, '[F] sin cortesía: se cancela sin tocar viajeros');
  r = await pedir({ contrato_id: C1, motivo: 'x x x x x' }, 'bulma');
  af(r.s === 403, `[G] bulma no puede (${r.s})`);
  console.log(`\n${R ? '🔴' : '🟢'} ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(2); });
