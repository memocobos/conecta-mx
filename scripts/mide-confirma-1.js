#!/usr/bin/env node
/* =============================================================================
 * mide-confirma-1 — EL CORREO ÚNICO en la captura MANUAL de pagos.
 * Entra por el handler REAL (admin-coordi-asignaciones · abono_crear) con una
 * red falsa que respeta filtros (eq/in/ilike) y guarda estado, el catálogo
 * REAL (index.html del árbol) y Resend contado. La bandeja (tipo 'reserva')
 * la mide mide:acomp-1 [C]. ⚠️ SIN ANCLA (árbol de trabajo).
 * ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
function af(ok, msg) { try { ok = typeof ok === 'function' ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } }
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.PORTAL_SUPABASE_URL = 'https://pt.falso.test';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'pt';
process.env.RESEND_API_KEY = 're_falsa';
process.env.JWT_SECRET = 'secreto';
process.env.CORREOS_MODO = 'real';
const INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const VP = 'aaaaaaaa-0000-4000-8000-000000000001', VO = 'aaaaaaaa-0000-4000-8000-000000000002', VS = 'aaaaaaaa-0000-4000-8000-000000000003';
function red(o) {
  o = o || {};
  const st = {
    viajeros: [
      { id: VP, evento_id: 'palnorte', nombre: 'Luis Pérez', correo: 'Luis@Prueba.mx', celular: '8991112233', total_contrato: 300, abonado_previo: 0, portal_cliente_id: null },
      { id: VO, evento_id: 'karolg#1', nombre: 'Otra Persona', correo: 'otra@x.mx', celular: '8990000000', total_contrato: 7450, abonado_previo: 1000 },
      { id: VS, evento_id: 'palnorte', nombre: 'Sin Correo', correo: null, total_contrato: 300, abonado_previo: 0 },
    ],
    abonos: [], clientes: [], invitaciones: (o.invitaciones || []).slice(), grupos: (o.grupos || []).slice(), correos: [], log: [],
  };
  let seq = 1;
  const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)) });
  const casa = (row, url) => { for (const [k, v0] of new URL(url).searchParams) { const v = decodeURIComponent(v0);
      if (['select', 'limit', 'order'].includes(k)) continue;
      if (v.startsWith('eq.') && String(row[k]) !== v.slice(3)) return false;
      if (v.startsWith('ilike.') && String(row[k] || '').toLowerCase() !== v.slice(6).toLowerCase()) return false;
      if (v.startsWith('in.(') && !v.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(row[k]))) return false; }
    return true; };
  st.fetch = async (url, init) => {
    init = init || {}; const m = (init.method || 'GET').toUpperCase(); url = String(url); st.log.push(m + ' ' + url);
    if (m === 'DELETE') throw new Error('DELETE prohibido');
    if (url.includes('/index.html') || /conectareynosa\.mx\/?(\?|$)/.test(url)) return resp(200, INDEX);
    if (url === 'https://api.resend.com/emails') { st.correos.push(JSON.parse(init.body)); return resp(200, { id: 'em' + st.correos.length }); }
    if (url.includes('/rest/v1/usuarios') || url.includes('sesion')) throw new Error('fail-open');
    const T = url.includes('pt.falso.test/rest/v1/clientes') ? 'clientes' : url.includes('/viajeros_evento') ? 'viajeros'
      : url.includes('/abonos_viajero') ? 'abonos' : url.includes('/invitaciones_portal') ? 'invitaciones' : url.includes('/grupos_whatsapp') ? 'grupos' : null;
    if (!T) throw new Error('URL no contemplada ' + m + ' ' + url);
    if (T === 'clientes' && m === 'GET') {
      const v = decodeURIComponent(new URL(url).searchParams.get('correo') || ''); const lista = (v.match(/^in\.\((.*)\)$/) || [, ''])[1].split(',').map((x) => x.replace(/"/g, ''));
      return resp(200, st.clientes.filter((c) => lista.includes(c.correo)));
    }
    if (m === 'GET') return resp(200, st[T].filter((r) => casa(r, url)).map((r) => Object.assign({}, r)));
    if (m === 'POST') { const b = JSON.parse(init.body); const rows = (Array.isArray(b) ? b : [b]).map((x) => Object.assign({ id: 'bbbbbbbb-0000-4000-8000-' + String(seq++).padStart(12, '0') }, x)); rows.forEach((x) => st[T].push(x)); return resp(201, rows); }
    if (m === 'PATCH') { const c = JSON.parse(init.body); const rows = st[T].filter((r) => casa(r, url)); rows.forEach((r) => Object.assign(r, c)); return resp(200, rows); }
    throw new Error('método ' + m);
  };
  return st;
}
function fresco() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions')) delete require.cache[k]; });
  return { h: require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler,
           jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
           lib: require(path.join(RAIZ, 'netlify/functions/_lib/correo-confirmacion.js')) };
}
const ev = (b, t) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + t }, body: JSON.stringify(b) });

(async () => {
  console.log('══ mide:confirma-1 · el correo único en la captura manual ══');
  let st = red(); global.fetch = st.fetch; let H = fresco();
  const tok = H.jwtSign({ id: 'u-milk', rol: 'milk', nombre: 'Milk', correo: 'milk@x.mx' }, process.env.JWT_SECRET, 3600);
  console.log('[A] primer pago de un viajero de palnorte');
  let r = await H.h(ev({ accion: 'abono_crear', viajero_id: VP, monto: 300 }, tok)); let j = JSON.parse(r.body);
  af(r.statusCode === 200 && st.abonos.length === 1 && st.abonos[0].monto === 300, `[A1] el abono queda registrado (${r.statusCode} ${r.body.slice(0, 120)})`);
  af(st.correos.length === 1 && st.correos[0].to.join() === 'luis@prueba.mx', '[A2] UN correo, al correo del viajero en minúsculas');
  const c = st.correos[0] || {};
  af(/^Recibimos tu pago · /.test(c.subject || ''), `[A3] asunto «Recibimos tu pago · …» (${c.subject})`);
  af(/\$300/.test(c.html || '') && /\$0 · ¡pagado!/.test(c.html || ''), '[A4] dice lo recibido y que quedó pagado (saldo por saldoMigrado: 300−300)');
  af(/Regístrate/.test(c.html || '') && st.invitaciones.length === 1 && st.invitaciones[0].correo === 'luis@prueba.mx', '[A5] trae la invitación al Portal y la ASIENTA en la bitácora después del envío');
  af(st.clientes.length === 1 && st.viajeros[0].portal_cliente_id, '[A6] el puente le crea su cuenta del Portal y enlaza al viajero');
  af(j.correo && j.correo.ok && j.correo.invitados.length === 1, '[A7] la respuesta le dice a la pantalla qué pasó con el correo');
  af(!/2027-03|26 de marzo/i.test(c.html || '') && /Por confirmar/.test(c.html || ''), '[A8] Pa\'l Norte sale con «Por confirmar», sin la fecha');

  console.log('[B] segundo pago: ya invitado');
  r = await H.h(ev({ accion: 'abono_crear', viajero_id: VP, monto: 100 }, tok));
  const c2 = st.correos[1] || {};
  af(st.correos.length === 2 && !/Regístrate/.test(c2.html || '') && /Ver mi plan en el Portal/.test(c2.html || '') && st.invitaciones.length === 1,
    '[B1] el segundo correo NO re-invita: «Ver mi plan en el Portal», bitácora intacta');

  console.log('[C] los que NO mandan');
  const antes = st.correos.length;
  r = await H.h(ev({ accion: 'abono_crear', viajero_id: VO, monto: 500 }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.correo === null && st.correos.length === antes, '[C1] evento fuera de EVENTOS_CORREO (karolg) → abono sí, correo NO (null)');
  r = await H.h(ev({ accion: 'abono_crear', viajero_id: VP, monto: 50, avisar: false }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.correo === null && st.correos.length === antes, '[C2] avisar:false → abono sí, correo NO');
  r = await H.h(ev({ accion: 'abono_crear', viajero_id: VS, monto: 300 }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && st.correos.length === antes && j.correo && j.correo.sin_correo.length === 1, '[C3] viajero sin correo → abono sí, correo no, y lo nombra (sin_correo)');

  console.log('[D] el correo jamás tumba el dinero');
  st = red(); global.fetch = async (u, i) => { if (String(u) === 'https://api.resend.com/emails') throw new Error('Resend caído'); return st.fetch(u, i); };
  H = fresco();
  r = await H.h(ev({ accion: 'abono_crear', viajero_id: VP, monto: 300 }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && st.abonos.length === 1 && j.correo && j.correo.ok === false && st.invitaciones.length === 0,
    '[D1] Resend caído → el abono QUEDA, el correo dice que falló, y NO se asienta invitación');

  console.log('[E] la lib');
  af(H.lib.EVENTOS_CORREO.length === 1 && H.lib.EVENTOS_CORREO[0] === 'palnorte', '[E1] eventos con correo: solo palnorte (palabra de Memo)');
  const rr = H.lib.renderConfirmacion({ tipo: 'reserva', correo: 'a@b.mx', ev: null, nombres: ['A'], recibido: 1 });
  af(!!rr.error, '[E2] sin catálogo no hay correo (no se manda «tu viaje» sin decir cuál)');
  af(!st.log.some((l) => l.startsWith('DELETE')), '[E3] cero DELETEs');
  console.log('[G] GRUPO-WA-1 · el link del grupo de WhatsApp');
  const GL = 'https://chat.whatsapp.com/AbCdEfGhIj1234567890xy';
  const gw = require(path.join(RAIZ, 'netlify/functions/_lib/grupo-whatsapp.js'));
  af(gw.normalizarLink(' ' + GL + '?mode=ems_copy_t ') === GL && gw.normalizarLink('chat.whatsapp.com/AbCdEfGhIj1234567890xy') === GL,
    '[G1] normaliza lo que la gente pega (espacios, ?mode=…, sin https)');
  af(gw.normalizarLink('https://evil.com/AbCdEfGhIj1234567890xy') === null && gw.normalizarLink('https://wa.me/528119771072') === null,
    '[G2] rechaza lo que no es un grupo de WhatsApp');
  // Captura por el handler REAL
  st = red(); global.fetch = st.fetch; H = fresco();
  r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link: 'https://evil.com/x' }, tok));
  af(r.statusCode === 400 && st.grupos.length === 0, '[G3] un link que no es de grupo se rechaza y no se guarda');
  r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link: GL + '?mode=x' }, tok)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && st.grupos.length === 1 && st.grupos[0].link === GL && j.link === GL && j.propio === GL, `[G4] se guarda normalizado (${r.statusCode} ${r.body.slice(0, 100)})`);
  const GL2 = 'https://chat.whatsapp.com/ZzZzZzZzZz0987654321ab';
  r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link: GL2 }, tok));
  af(st.grupos.length === 1 && st.grupos[0].link === GL2, '[G5] pegar otro lo REEMPLAZA (una fila por evento, sin duplicar)');
  r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link: '' }, tok));
  af(r.statusCode === 400 && st.grupos.length === 1, '[G6] vacío no borra nada (la casa no borra filas)');
  r = await H.h(ev({ accion: 'grupo_wa_ver', evento_id: 'palnorte#1' }, tok)); j = JSON.parse(r.body);
  af(j.link === GL2 && j.heredado === true && j.propio === null, '[G7] una fecha (palnorte#1) sin link propio HEREDA el del evento, rotulado');
  const tokCoordi = H.jwtSign({ id: 'u-c', rol: 'coordinador', correo: 'c@x.mx' }, process.env.JWT_SECRET, 3600);
  r = await H.h(ev({ accion: 'grupo_wa_guardar', evento_id: 'palnorte', link: GL }, tokCoordi));
  af(r.statusCode === 403 && st.grupos[0].link === GL2, '[G8] un coordinador no puede cambiarlo (solo Memo/Bulma/Milk)');
  // El correo con y sin link
  st = red({ grupos: [{ evento_id: 'palnorte', link: GL }] }); global.fetch = st.fetch; H = fresco();
  await H.h(ev({ accion: 'abono_crear', viajero_id: VP, monto: 300 }, tok));
  const cg = st.correos[0] || {};
  af(cg.html && cg.html.includes('href="' + GL + '"') && /Entrar al grupo de WhatsApp/.test(cg.html), '[G9] con link: el correo trae el botón al grupo');
  st = red(); global.fetch = st.fetch; H = fresco();
  await H.h(ev({ accion: 'abono_crear', viajero_id: VP, monto: 300 }, tok));
  af(st.correos.length === 1 && !/chat\.whatsapp\.com/.test(st.correos[0].html), '[G10] sin link: el correo NO trae el bloque (no se inventa)');
  af(!/chat\.whatsapp\.com/.test(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8')), '[G11] el index público NO contiene ningún link de grupo');
  af(!st.log.some((l) => l.startsWith('DELETE')), '[G12] cero DELETEs');

  console.log(`\n${R === 0 ? (V ? '✅ VERDE' : 'NADA MEDIDO') : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + e.stack); process.exit(1); });
