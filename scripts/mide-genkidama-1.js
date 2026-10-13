#!/usr/bin/env node
/* =============================================================================
 * mide-genkidama-1 — el concentrado de correos y las campañas por tandas.
 * Entra por el handler REAL (admin-genkidama y admin-preventa-blast) con una red
 * falsa que respeta filtros (eq · in · is.null · not.is.null · gte · like) y
 * guarda estado, un index SERVIDO sintético (EV + PROMOS controlados) y Resend
 * contado. ⚠️ SIN ANCLA (árbol de trabajo).
 * ========================================================================== */
'use strict';
const path = require('path');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
function af(ok, msg) { try { ok = typeof ok === 'function' ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } }
Object.assign(process.env, { SUPABASE_URL_KAMEHOUSE: 'https://kh.falso.test', SUPABASE_SERVICE_KEY_KAMEHOUSE: 'svc', PORTAL_SUPABASE_URL: 'https://pt.falso.test',
  PORTAL_SUPABASE_SERVICE_KEY: 'pt', RESEND_API_KEY: 're_falsa', JWT_SECRET: 'secreto', CORREOS_MODO: 'real', URL: 'https://sitio.falso.test' });

const DIA = 24 * 3600e3;
function indexHtml(o) {
  o = o || {};
  const fut = '2027-01-20';
  const EV = [
    { id: 'frontera', a: 'Grupo Frontera', f: '16 y 17 dic 2026', ds: '2026-12-16', v: 'Arena Monterrey', st: '', multifecha: [{ lbl: '16 de Diciembre', ds: '2026-12-16' }, { lbl: '17 de Diciembre', ds: '2026-12-17' }] },
    { id: 'karolg', a: 'Karol G', f: '7 nov 2026', ds: '2026-11-07', v: 'Estadio BBVA', st: o.karolSt || '' },
    { id: 'agotadito', a: 'Agotadito', f: '1 dic 2026', ds: '2026-12-01', st: 'agotado' },
    { id: 'pasado', a: 'Ya pasó', f: '1 ene 2026', ds: '2026-01-01', st: '' },
  ];
  if (o.conPreventa) EV.push({ id: 'palnorte', a: 'Tecate Pa´l Norte 2027', f: 'Por confirmar', st: '', cheapOnly: true, cheapZonas: [{ n: 'Preventa a ciegas', p: 300 }] });
  const ahora = Date.now();
  const PROMOS = {
    TOURS: { amount: 500, expiresTs: o.toursVence || ahora + 10 * DIA, onlyEvents: ['frontera', 'otro'], excludePkg: ['cheap'], desc: '$500 de descuento' },
    KAROL: { amount: 700, expiresTs: ahora + 10 * DIA, onlyEvent: 'karolg' },
    VIEJO: { amount: 500, expiresTs: ahora - DIA },
  };
  return `<html><script>var EV=${JSON.stringify(EV)};\nvar PROMOS=${JSON.stringify(PROMOS)};</script></html>`.replace(fut, fut);
}

function red(o) {
  o = o || {};
  const hoyIso = new Date(Date.now() - 60e3).toISOString();
  const st = {
    kh: {
      genkidama_contactos: (o.contactos || []).slice(), genkidama_campanas: [], genkidama_envios: (o.envios || []).slice(),
      genkidama_config: [{ id: 1, limite_diario: o.limite != null ? o.limite : 300 }],
      preventa_blast: (o.blast || []).slice(),
      usuarios: [{ correo: 'Staff@Conecta.mx' }],
      viajeros_evento: [
        { correo: 'Ana@Correo.com', nombre: 'Ana Uno', evento_id: 'karolg#1' },
        { correo: 'beto@correo.com', nombre: 'Beto', evento_id: 'palnorte2026' },
        { correo: 'staff@conecta.mx', nombre: 'Staff', evento_id: 'karolg' },
        { correo: 'sin-arroba', nombre: 'Malo', evento_id: 'x' },
      ],
      eventos_waitlist: [{ email: 'ana@correo.com', nombre: 'Ana WL' }, { email: 'carla@correo.com', nombre: 'Carla' }],
      requisiciones: [{ correo: 'dani@correo.com', nombre: 'Dani' }],
    },
    pt: { clientes: [{ correo: 'eva@correo.com', nombre_completo: 'Eva' }], giveaway_registros: [{ correo: 'CARLA@correo.com', nombre: 'Carla G' }, { correo: 'fer@correo.com', nombre: 'Fer' }], bkp_mel_giveaway_registros: [{ correo: 'gil@correo.com', nombre: 'Gil' }] },
    correos: [], log: [], index: o.index || indexHtml(o.indexOpts), hoyIso,
  };
  let seq = 1;
  const resp = (s, b, extra) => ({ ok: s < 300, status: s, headers: { get: (k) => (extra || {})[k.toLowerCase()] || null }, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)) });
  const casa = (row, sp) => { for (const [k, v] of sp) {
      if (['select', 'limit', 'order', 'prefer'].includes(k)) continue;
      const val = row[k];
      if (v === 'is.null') { if (val != null) return false; continue; }
      if (v === 'not.is.null') { if (val == null) return false; continue; }
      if (v.startsWith('eq.')) { if (String(val) !== v.slice(3)) return false; continue; }
      if (v.startsWith('gte.')) { if (!(val && val >= v.slice(4))) return false; continue; }
      if (v.startsWith('like.')) { if (!String(val || '').startsWith(v.slice(5).replace(/\*$/, ''))) return false; continue; }
      if (v.startsWith('in.(')) { if (!v.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(val))) return false; continue; }
    } return true; };
  st.fetch = async (url, init) => {
    init = init || {}; const m = (init.method || 'GET').toUpperCase(); url = String(url); st.log.push(m + ' ' + url);
    if (m === 'DELETE') throw new Error('DELETE prohibido');
    if (url.startsWith('https://sitio.falso.test/index.html')) return resp(200, st.index);
    if (url === 'https://api.resend.com/emails') { st.correos.push(JSON.parse(init.body)); return resp(200, { id: 'em' + st.correos.length }); }
    if (url.includes('/rest/v1/usuarios') && url.includes('sesion')) throw new Error('fail-open');
    const u = new URL(url); const base = u.hostname.startsWith('kh') ? st.kh : u.hostname.startsWith('pt') ? st.pt : null;
    const tabla = u.pathname.replace('/rest/v1/', '');
    if (!base || !(tabla in base)) {
      if (u.hostname.startsWith('kh') && tabla === 'usuarios') return resp(200, st.kh.usuarios);
      throw new Error('URL no contemplada ' + m + ' ' + url);
    }
    const sp = [...u.searchParams.entries()].map(([k, v]) => [k, decodeURIComponent(v)]);
    let filas = base[tabla].filter((r) => casa(r, sp));
    if (m === 'GET') {
      const ord = u.searchParams.get('order');
      if (ord && ord.startsWith('prioridad')) filas = filas.slice().sort((a, b) => (a.prioridad || 9) - (b.prioridad || 9));
      const cr = '0-0/' + filas.length;
      return resp(200, filas.map((r) => Object.assign({}, r)), { 'content-range': cr });
    }
    if (m === 'POST') {
      const b = JSON.parse(init.body); const rows = (Array.isArray(b) ? b : [b]).map((x) => Object.assign({ id: 'aaaaaaaa-0000-4000-8000-' + String(seq++).padStart(12, '0'), creado_at: new Date().toISOString() }, x));
      if (tabla === 'genkidama_contactos') for (const r0 of rows) if (base[tabla].some((x) => x.correo === r0.correo)) return resp(409, { code: '23505' });
      rows.forEach((x) => base[tabla].push(x)); return resp(201, rows);
    }
    if (m === 'PATCH') { const c = JSON.parse(init.body); filas.forEach((r) => Object.assign(r, c)); return resp(200, filas); }
    throw new Error('método ' + m);
  };
  return st;
}
function fresco() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions')) delete require.cache[k]; });
  return { gk: require(path.join(RAIZ, 'netlify/functions/admin-genkidama.js')).handler, blast: require(path.join(RAIZ, 'netlify/functions/admin-preventa-blast.js')).handler,
    jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign, G: require(path.join(RAIZ, 'netlify/functions/_lib/genkidama.js')) };
}
const ev = (b, t) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + t }, body: JSON.stringify(b) });
const P = (r) => JSON.parse(r.body);

(async () => {
  console.log('══ mide:genkidama-1 · el concentrado y sus campañas ══');
  let st = red(); global.fetch = st.fetch; let H = fresco();
  const tok = H.jwtSign({ id: 'u-memo', rol: 'maestro_roshi', correo: 'memo@x.mx' }, process.env.JWT_SECRET, 3600);
  const tokB = H.jwtSign({ id: 'u-b', rol: 'bulma', correo: 'b@x.mx' }, process.env.JWT_SECRET, 3600);

  console.log('[A] el día de Reynosa');
  af(H.G.inicioDiaReynosa(new Date('2026-10-14T03:00:00Z')) === '2026-10-13T05:00:00.000Z', '[A1] a las 10 pm del 13-oct (UTC 03:00 del 14) el día empezó el 13 a medianoche Reynosa (−05)');
  af(H.G.inicioDiaReynosa(new Date('2026-12-14T03:00:00Z')) === '2026-12-13T06:00:00.000Z', '[A2] en invierno el corte se mueve solo (−06), sin teclear el huso');

  console.log('[B] sembrar: todos los correos, sin repetidos');
  let r = await H.gk(ev({ accion: 'sembrar' }, tok));
  af(r.statusCode === 400 && st.kh.genkidama_contactos.length === 0, '[B1] sin confirmar:true no se siembra nada');
  r = await H.gk(ev({ accion: 'sembrar', confirmar: true }, tok)); let j = P(r);
  const cs = st.kh.genkidama_contactos.map((c) => c.correo).sort();
  af(r.statusCode === 200 && JSON.stringify(cs) === JSON.stringify(['ana@correo.com', 'beto@correo.com', 'carla@correo.com', 'dani@correo.com', 'eva@correo.com', 'fer@correo.com', 'gil@correo.com']),
    `[B2] 7 únicos de 5 fuentes y 2 bases: Ana (viajera+waitlist) y Carla (waitlist+giveaway, en MAYÚSCULAS) cuentan una vez (${cs.join(',')})`);
  af(!cs.includes('staff@conecta.mx') && !cs.includes('sin-arroba'), '[B3] el staff y los correos inválidos no entran');
  const ana = st.kh.genkidama_contactos.find((c) => c.correo === 'ana@correo.com');
  af(ana.fuente === 'viajeros' && ana.prioridad === 1, '[B4] quien ya viajó entra con prioridad 1 (fuente viajeros, aunque también esté en la lista de espera)');
  r = await H.gk(ev({ accion: 'sembrar', confirmar: true }, tok)); j = P(r);
  af(r.statusCode === 200 && j.insertados === 0 && st.kh.genkidama_contactos.length === 7, '[B5] la segunda siembra no duplica nada (idempotente)');

  console.log('[C] el ensayo y la promesa del sitio');
  const base = { tipo: 'descuento', evento_id: 'frontera', codigo: 'TOURS', slogan: 'Recibe un descuento de $500' };
  r = await H.gk(ev(Object.assign({ accion: 'seco' }, base), tok)); j = P(r);
  af(r.statusCode === 200 && /TOURS/.test(j.html) && /Recibe un descuento de \$500/.test(j.html) && /conectareynosa\.mx\/frontera/.test(j.html) && /BAJA/.test(j.html), `[C1] el ensayo arma el correo con código, slogan, link al tour y línea de BAJA (${r.statusCode} ${(j.error || '').slice(0, 80)})`);
  af(/No aplica en paquete CHEAP/.test(j.html) && /Válido hasta el/.test(j.html), '[C2] la vigencia y las exclusiones salen del PROMOS servido, no se teclean');
  af(j.audiencia === 7, `[C3] la audiencia es el concentrado vivo (${j.audiencia})`);
  af(st.kh.genkidama_campanas.length === 0 && st.correos.length === 0, '[C4] el ensayo no escribe ni manda nada');
  const casos = [
    [{ evento_id: 'agotadito', tipo: 'promocion', codigo: '' }, /agotado/, '[C5] un tour agotado no se promueve'],
    [{ evento_id: 'pasado', tipo: 'promocion', codigo: '' }, /pasó/, '[C6] un tour que ya pasó no se promueve'],
    [{ codigo: 'NOEXISTE' }, /no conoce el código/, '[C7] un código que el sitio no conoce se rehúsa (manda a publicar en Baba)'],
    [{ codigo: 'VIEJO' }, /venció/, '[C8] un código vencido en el sitio se rehúsa'],
    [{ codigo: 'KAROL', slogan: 'Recibe un descuento de $700' }, /no aplica en Grupo Frontera/, '[C9] un código que no aplica a ese tour se rehúsa (el cliente lo vería rechazado)'],
    [{ evento_id: 'karolg', codigo: 'KAROL', slogan: 'Recibe un descuento de $500' }, /promete \$500 pero el código KAROL da \$700/, '[C10] el slogan no puede prometer otro monto que el del código'],
    [{ codigo: '' }, /necesita un código/, '[C11] Descuento sin código no se arma'],
  ];
  for (const [mod, re, msg] of casos) { r = await H.gk(ev(Object.assign({ accion: 'seco' }, base, mod), tok)); j = P(r); af(r.statusCode === 409 && re.test(j.error || ''), msg + ` (${(j.error || '').slice(0, 90)})`); }
  r = await H.gk(ev({ accion: 'seco', tipo: 'ultimos', evento_id: 'karolg', slogan: 'Solo quedan 10 lugares en Platino' }, tok)); j = P(r);
  af(r.statusCode === 200 && j.audiencia === 6 && j.excluidos_ya_van === 1 && /Últimos lugares para Karol G/.test(j.asunto), `[C12] «Últimos lugares» de Karol G deja fuera a Ana, que YA va (karolg#1) — ${j.audiencia} de 7`);
  r = await H.gk(ev(Object.assign({ accion: 'seco' }, base, { fecha_idx: 1 }), tok)); j = P(r);
  af(r.statusCode === 200 && /17 de Diciembre/.test(j.html), '[C13] la fecha elegida en el wizard es la que dice el correo');

  console.log('[D] crear: la campaña y su fila');
  r = await H.gk(ev(Object.assign({ accion: 'crear' }, base), tok));
  af(r.statusCode === 400 && st.kh.genkidama_campanas.length === 0, '[D1] crear pide confirmar:true');
  r = await H.gk(ev(Object.assign({ accion: 'crear', confirmar: true }, base), tok)); j = P(r);
  const cid = j.campana && j.campana.id;
  af(r.statusCode === 200 && st.kh.genkidama_envios.length === 7 && st.correos.length === 0, '[D2] crear congela la audiencia (7 en fila) y NO manda nada');

  console.log('[E] enviar: la energía manda');
  st.kh.genkidama_config[0].limite_diario = 3;
  st.kh.preventa_blast.push({ id: 'pb1', correo: 'carla@correo.com', enviado_at: new Date(Date.now() - 3600e3).toISOString() });
  r = await H.gk(ev({ accion: 'enviar', campana_id: cid, tope: 25 }, tok));
  af(r.statusCode === 400 && st.correos.length === 0, '[E1] enviar pide confirmar:true');
  r = await H.gk(ev({ accion: 'enviar', campana_id: cid, tope: 25, confirmar: true }, tok)); j = P(r);
  const dest = st.correos.map((c) => [].concat(c.to).join()).join(',');
  af(r.statusCode === 200 && st.correos.length === 2, `[E2] límite 3 con 1 ya enviado hoy por el blast → solo salen 2 (${st.correos.length}: ${dest})`);
  af(st.correos[0] && [].concat(st.correos[0].to).join() === 'ana@correo.com', '[E3] primero los que ya viajaron (prioridad 1)');
  af(!/carla@correo\.com/.test(dest), '[E4] Carla ya recibió el blast hoy: no recibe un segundo correo el mismo día');
  af(st.kh.genkidama_envios.filter((e) => e.enviado_at).length === 2, '[E5] la bitácora asienta exactamente los enviados');
  r = await H.gk(ev({ accion: 'enviar', campana_id: cid, tope: 25, confirmar: true }, tok)); j = P(r);
  af(r.statusCode === 429 && st.correos.length === 2 && /Sin energía/.test(j.error), '[E6] sin energía: 429 y CERO correos');
  st.kh.genkidama_config[0].limite_diario = 300;
  st.kh.genkidama_contactos.find((c) => c.correo === 'dani@correo.com').baja_at = new Date().toISOString();
  r = await H.gk(ev({ accion: 'enviar', campana_id: cid, tope: 25, confirmar: true }, tok)); j = P(r);
  const dest2 = st.correos.slice(2).map((c) => [].concat(c.to).join());
  af(!dest2.includes('dani@correo.com') && j.saltados_baja === 1, '[E7] quien pidió BAJA a media campaña ya no recibe nada');
  af(!dest2.includes('ana@correo.com') && !dest2.includes([].concat(st.correos[1].to).join()), '[E8] nadie recibe la misma campaña dos veces');
  af(j.restantes === 1 && j.saltados_hoy === 1, `[E9] Carla queda pendiente para mañana, no se pierde (restantes ${j.restantes})`);
  st.index = indexHtml({ toursVence: Date.now() - 1000 });
  const antes = st.correos.length;
  r = await H.gk(ev({ accion: 'enviar', campana_id: cid, tope: 25, confirmar: true }, tok)); j = P(r);
  af(r.statusCode === 409 && st.correos.length === antes && /ya no honra/i.test(j.error), '[E10] si el código vence a media campaña, la siguiente tanda se rehúsa (409, cero correos)');

  console.log('[F] la energía es una sola para todo el dominio');
  st = red({ limite: 1, indexOpts: { conPreventa: true }, blast: [{ id: 'pb9', campana: 'pn27', correo: 'w@w.com', nombre: 'W', caliente: true, enviado_at: null, error: null }], envios: [{ id: 'x1', campana_id: 'c', correo: 'z@z.com', enviado_at: new Date(Date.now() - 600e3).toISOString() }] }); global.fetch = st.fetch; H = fresco();
  r = await H.blast(ev({ accion: 'enviar', confirmar: true, tope: 5 }, tok)); j = P(r);
  af(r.statusCode === 429 && st.correos.length === 0, `[F1] el blast de PN27 también se detiene cuando Genkidama ya gastó la energía (${r.statusCode} ${(j.error || '').slice(0, 60)})`);
  st.kh.genkidama_config[0].limite_diario = 5;
  r = await H.blast(ev({ accion: 'enviar', confirmar: true, tope: 5 }, tok)); j = P(r);
  af(r.statusCode === 200 && st.correos.length === 1, `[F2] control positivo: con energía, el mismo blast SÍ manda (${r.statusCode} · ${st.correos.length}) — el 429 de F1 fue la energía, no otra cosa`);

  console.log('[G] puertas y bajas');
  r = await H.gk(ev({ accion: 'estado' }, tokB));
  af(r.statusCode === 403, '[G1] solo maestro_roshi (Bulma recibe 403)');
  r = await H.gk(ev({ accion: 'bajas', correos: 'Nuevo@X.com, otro@x.com', confirmar: true }, tok));
  af(r.statusCode === 200 && st.kh.genkidama_contactos.filter((c) => c.baja_at).length === 2, '[G2] una baja de alguien que no estaba nace dada de baja (ninguna siembra la revive)');
  r = await H.gk(ev({ accion: 'energia', limite: 450, confirmar: true }, tok)); j = P(r);
  af(r.statusCode === 200 && st.kh.genkidama_config[0].limite_diario === 450 && j.energia.limite === 450, '[G3] Memo fija la energía diaria');
  r = await H.gk(ev({ accion: 'estado' }, tok)); j = P(r);
  const ids = j.wizard ? j.wizard.eventos.map((e) => e.id) : [];
  af(r.statusCode === 200 && ids.includes('karolg') && ids.includes('frontera') && !ids.includes('agotadito') && !ids.includes('pasado') && ids.indexOf('karolg') < ids.indexOf('frontera') && j.wizard.codigos.map((c) => c.codigo).join() === 'TOURS,KAROL',
    `[G4] el wizard solo ofrece tours a la venta y códigos vivos (${j.wizard && j.wizard.eventos.map((e) => e.id)} · ${j.wizard && j.wizard.codigos.map((c) => c.codigo)})`);
  af(!st.log.some((l) => l.startsWith('DELETE')), '[G5] cero DELETEs');
  console.log(`\n${R === 0 ? (V ? '✅ VERDE' : 'NADA MEDIDO') : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + e.stack); process.exit(1); });
