#!/usr/bin/env node
/* mide-ctr-recuerda-1 — CTR-RECUERDA-1 (27-oct-2026)
 * La pestaña Clientes de Contratos ve los contratos de los VIAJEROS
 * (contratos_cliente) y les recuerda firmar. Por el handler REAL
 * (admin-coordi-asignaciones) y el cron REAL, con red falsa que respeta filtros:
 *   [P] puro: motivoNoRecordar (firmado, evento pasado, nunca enviado, horas,
 *       cadencia, tope) y dsDeViajero (multifecha slug#N).
 *   [L] lista: trae todos con su motivo; catálogo caído = lista igual + lo dice.
 *   [S] recordar en SECO (default): enseña a quién y el correo tal cual, CERO
 *       correos y CERO escrituras — también apagado; [] = ejemplo para aprobar.
 *   [A] apagado: mandar de verdad → 409, cero correos.
 *   [E] encendido: sin confirmar 400; con confirmar sale UN correo por
 *       dirección con asunto de RECORDATORIO, se sella; el 2º clic no repite.
 *   [C] cron: apagado (los dos interruptores) no lee nada; encendido solo le
 *       toca a quien cumple cadencia/tope/evento futuro.
 * ⚠️ SIN ANCLA (árbol de trabajo). */
'use strict';
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.RESEND_API_KEY = 're_falsa';
process.env.CORREOS_MODO = 'real';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} const t = typeof m === 'function' ? m() : m; if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const DIA = 864e5;
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
const dia = (d) => new Date(Date.parse(hoy + 'T12:00:00Z') + d * DIA).toISOString().slice(0, 10);
const haceH = (h) => new Date(Date.now() - h * 36e5).toISOString();

const INDEX = `<script>var EV=[{id:'futuro',a:'Evento Futuro',f:'${dia(40)}',ds:'${dia(40)}',v:'Arena',st:'',inc:['Boleto zona elegida','Kit Conecta'],sep:500,zonas:[{n:'Oro',p:5000}],cheapZonas:[{n:'Oro',p:3000}],hotel:[]},`
  + `{id:'pasado',a:'Evento Pasado',f:'${dia(-5)}',ds:'${dia(-5)}',v:'Arena',st:'',inc:['Boleto'],sep:500,zonas:[{n:'Oro',p:5000}],hotel:[]},`
  + `{id:'multi',a:'Evento Multi',f:'2027',ds:'${dia(-10)}',v:'Arena',st:'',inc:['Boleto'],sep:500,zonas:[{n:'Oro',p:5000}],hotel:[],multifecha:[{lbl:'A',ds:'${dia(-10)}',zonas:[{n:'Oro',p:5000}]},{lbl:'B',ds:'${dia(20)}',zonas:[{n:'Oro',p:5000}]}]}];</script>`;

let DB, RESEND, CATALOGO_CAIDO = false;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
const dec = (u) => decodeURIComponent(u);
const inIds = (q, campo) => { const m = q.match(new RegExp(campo + '=in\\.\\(([^)]*)\\)')); return m ? m[1].split(',').map((x) => x.replace(/"/g, '')) : null; };
const eq = (q, campo) => { const m = q.match(new RegExp('[?&]' + campo + '=eq\\.([^&]*)')); return m ? m[1] : null; };
// La proyección `alias:datos->>campo` se respeta como PostgREST: si la red falsa
// no la aplicara, la lista saldría sin nombre y el arnés no lo vería.
const proyectar = (u, f) => {
  const sel = (u.match(/[?&]select=([^&]*)/) || [])[1];
  if (!sel) return f;
  return f.map((c) => {
    const o = {};
    sel.split(',').forEach((s) => {
      const m = s.match(/^(\w+):datos->>(\w+)$/);
      if (m) o[m[1]] = c.datos && c.datos[m[2]] != null ? String(c.datos[m[2]]) : null;
      else o[s] = c[s];
    });
    return o;
  });
};
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = dec(String(url));
  if (u.includes('api.resend.com')) { RESEND.push(JSON.parse(init.body)); return resp(200, { id: 'em_' + RESEND.length }); }
  if (u.includes('/index.html') || /conectareynosa\.mx\/?($|\?)/.test(u)) return CATALOGO_CAIDO ? resp(500, 'caído') : resp(200, INDEX);
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'maestro_roshi' }]);
  if (u.includes('/rest/v1/viajeros_evento')) { const ids = inIds(u, 'id'); return resp(200, DB.v.filter((x) => !ids || ids.includes(x.id))); }
  if (u.includes('/rest/v1/abonos_viajero')) return resp(200, []);
  if (u.includes('/rest/v1/contratos_cliente')) {
    DB.lecturas++;
    if (m === 'POST') { DB.escrituras.push(['POST', init.body]); return resp(400, { message: 'el arnés no espera altas' }); }
    if (m === 'DELETE') throw new Error('DELETE prohibido');
    let f = DB.c.slice();
    const ids = inIds(u, 'viajero_id'); if (ids) f = f.filter((c) => ids.includes(c.viajero_id));
    if (/estado=neq\.anulado/.test(u)) f = f.filter((c) => c.estado !== 'anulado');
    const est = eq(u, 'estado'); if (est) f = f.filter((c) => c.estado === est);
    const id = eq(u, 'id'); if (id) f = f.filter((c) => c.id === id);
    if (/correo=not\.is\.null/.test(u)) f = f.filter((c) => c.correo);
    if (m === 'PATCH') { const b = JSON.parse(init.body); DB.escrituras.push(['PATCH', b]); f.forEach((c) => Object.assign(c, b)); return resp(200, f); }
    return resp(200, proyectar(u, f));
  }
  return resp(200, []);
};
const v = (n, ev, nombre, correo) => ({ id: U(n), evento_id: ev, nombre, correo, tipo_paquete: 'plus', tipo_viajero: 'cliente', zona_boleto: 'Oro', boletos: 1, total_contrato: 5000, abonado_previo: 500 });
const c = (n, vid, ev, estado, envios, enviadoH, correo, nombre) => ({ id: U(100 + n), viajero_id: U(vid), evento_id: ev, estado, envios, enviado_at: enviadoH == null ? null : haceH(enviadoH), correo, token: 'a'.repeat(48), datos: { nombre, evento: ev, total: 5000, paquete_txt: 'PLUS' } });
const semilla = () => ({ escrituras: [], lecturas: 0,
  v: [v(1, 'futuro', 'Ana Uno', 'ana@x.mx'), v(2, 'futuro', 'Beto Dos', 'ana@x.mx'), v(3, 'futuro', 'Caro Tres', 'caro@x.mx'), v(4, 'pasado', 'Dani Cuatro', 'dani@x.mx'), v(5, 'futuro', 'Eli Cinco', 'eli@x.mx'), v(6, 'futuro', 'Fer Seis', 'fer@x.mx'), v(7, 'multi#1', 'Gabo Siete', 'gabo@x.mx')],
  c: [
    c(1, 1, 'futuro', 'pendiente', 1, 100, 'ana@x.mx', 'Ana Uno'),     // le toca (manual y auto)
    c(2, 2, 'futuro', 'pendiente', 1, 100, 'ana@x.mx', 'Beto Dos'),    // misma dirección que Ana
    c(3, 3, 'futuro', 'pendiente', 1, 5, 'caro@x.mx', 'Caro Tres'),    // avisada hace 5 h → no
    c(4, 4, 'pasado', 'pendiente', 1, 100, 'dani@x.mx', 'Dani Cuatro'), // evento pasado → no
    c(5, 5, 'futuro', 'firmado', 1, 100, 'eli@x.mx', 'Eli Cinco'),      // ya firmó → no
    c(6, 6, 'futuro', 'pendiente', 5, 100, 'fer@x.mx', 'Fer Seis'),     // tope: manual sí, auto no
    c(7, 7, 'multi#1', 'pendiente', 1, 100, 'gabo@x.mx', 'Gabo Siete'), // su fecha (#1) es futura aunque el evento padre ya pasó
  ] });
const cargar = (vivo, auto) => {
  if (vivo) process.env.CONTRATO_CLIENTE_ARNES = '1'; else delete process.env.CONTRATO_CLIENTE_ARNES;
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  const CC = require(path.join(RAIZ, 'netlify/functions/_lib/contrato-cliente.js'));
  if (auto !== undefined) {
    // El cron tiene su propio interruptor tecleado en el lib: el arnés lo
    // prende por dentro del módulo cargado, sin tocar el archivo.
    CC.RECORDATORIO_AUTO_VIVO = auto;
  }
  return CC;
};
const llamarAdmin = async (b) => {
  const HA = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const jw = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'memo@x.mx', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
  const r = await HA({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify(b) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};

(async () => {
  console.log('══ mide:ctr-recuerda-1 ══\n[P] puro');
  let CC = cargar(false);
  const ahora = Date.now();
  const P = (o, ds, modo) => CC.motivoNoRecordar(Object.assign({ estado: 'pendiente', envios: 1, enviado_at: haceH(100) }, o), ds, ahora, modo);
  af(P({}, dia(10), 'manual') === null && P({}, dia(10), 'auto') === null, 'pendiente, avisado hace 4 días, evento futuro → le toca (los dos modos)');
  af(/ya firmó/.test(P({ estado: 'firmado' }, dia(10), 'manual')), 'firmado → no');
  af(/ya pasó/.test(P({}, dia(-1), 'manual')), 'evento de ayer → no');
  af(P({}, hoy, 'manual') === null, 'evento HOY → todavía sí (el día cuenta como por venir)');
  af(/Enviar/.test(P({ envios: 0, enviado_at: null }, dia(10), 'manual')), 'nunca enviado → no es recordatorio, manda a «Enviar»');
  af(/hace 5 h/.test(P({ enviado_at: haceH(5) }, dia(10), 'manual')) && P({ enviado_at: haceH(21) }, dia(10), 'manual') === null, 'manual: freno de 20 h (5 h no · 21 h sí)');
  af(/menos de 3 días/.test(P({ enviado_at: haceH(50) }, dia(10), 'auto')), 'auto: cada 3 días (50 h no)');
  af(/tope/.test(P({ envios: 5 }, dia(10), 'auto')) && P({ envios: 5 }, dia(10), 'manual') === null, 'tope de 5 frena al cron pero NO al botón (quien aprieta decide)');
  const evM = { ds: dia(-10), multifecha: [{ ds: dia(-10) }, { ds: dia(20) }] };
  af(CC.dsDeViajero(evM, 'multi#1') === dia(20) && CC.dsDeViajero(evM, 'multi') === dia(-10) && CC.dsDeViajero(null, 'x') === null, 'la fecha es la de SU fecha (slug#N), no la del evento padre');
  af(CC.RECORDATORIO_AUTO_VIVO === false && CC.CONTRATO_CLIENTE_VIVO === false, 'los DOS interruptores nacen APAGADOS en el archivo');

  console.log('\n[L] la lista');
  DB = semilla(); RESEND = []; CC = cargar(false);
  let r = await llamarAdmin({ accion: 'contrato_cliente_lista' });
  const porN = (n) => (r.j.contratos || []).find((x) => x.viajero_id === U(n)) || {};
  af(r.s === 200 && r.j.contratos.length === 7 && r.j.vivo === false && r.j.catalogo_ok === true, () => 'trae los 7, dice apagado y catálogo leído — ' + r.s + ' ' + JSON.stringify(r.j).slice(0, 120));
  af(porN(1).nombre === 'Ana Uno' && porN(1).ds === dia(40) && porN(1).no_recordar === null, 'cada fila trae su nombre (de datos), su fecha y si le toca');
  af(/hace 5 h/.test(porN(3).no_recordar) && /ya pasó/.test(porN(4).no_recordar) && /ya firmó/.test(porN(5).no_recordar), 'los que no: con su motivo en palabras');
  af(porN(6).no_recordar === null && /tope/.test(porN(6).no_recordar_auto), 'Fer: el botón sí puede, el cron no (tope)');
  af(porN(7).ds === dia(20) && porN(7).no_recordar === null, 'Gabo (multi#1): su fecha futura manda, aunque el padre ya pasó');
  af(DB.escrituras.length === 0 && RESEND.length === 0, 'la lista solo LEE');
  CATALOGO_CAIDO = true; for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  r = await llamarAdmin({ accion: 'contrato_cliente_lista' });
  af(r.s === 200 && r.j.contratos.length === 7 && r.j.catalogo_ok === false, 'catálogo caído → la lista sale IGUAL y lo dice (catalogo_ok:false)');
  CATALOGO_CAIDO = false;

  console.log('\n[S] recordar en SECO (apagado)');
  DB = semilla(); RESEND = []; CC = cargar(false);
  r = await llamarAdmin({ accion: 'contrato_cliente_recordar', viajero_ids: [U(1), U(2), U(3), U(4), U(5)] });
  af(r.s === 200 && r.j.seco === true && r.j.apagado === true, 'sin decir nada es SECO, y avisa que está apagado');
  af(r.j.a_quien.map((x) => x.nombre).sort().join(',') === 'Ana Uno,Beto Dos', 'le llegaría a Ana y Beto');
  af(r.j.saltados.length === 3 && r.j.saltados.every((x) => x.motivo), 'Caro, Dani y Eli fuera, cada uno con su motivo');
  af(/Recordatorio/.test(r.j.render.subject) && /sigue sin firmar/.test(r.j.render.html) && /conectareynosa\.mx\/portal/.test(r.j.render.html), 'el correo es el de RECORDATORIO y lleva al Portal');
  af(RESEND.length === 0 && DB.escrituras.length === 0, 'en seco: CERO correos y CERO escrituras');
  r = await llamarAdmin({ accion: 'contrato_cliente_recordar', viajero_ids: [] });
  af(r.s === 200 && r.j.ejemplo === true && /Recordatorio/.test(r.j.render.subject), 'con [] enseña el correo de EJEMPLO (para aprobar el texto antes de encender)');
  r = await llamarAdmin({ accion: 'contrato_cliente_recordar', viajero_ids: Array.from({ length: 61 }, (_, i) => U(500 + i)) });
  af(r.s === 400, '61 de golpe → 400 (tope 60 por clic)');

  console.log('\n[A] apagado: mandar de verdad');
  r = await llamarAdmin({ accion: 'contrato_cliente_recordar', viajero_ids: [U(1)], seco: false, confirmar: true });
  af(r.s === 409 && r.j.apagado && RESEND.length === 0 && DB.escrituras.length === 0, 'apagado → 409, cero correos, cero escrituras');

  console.log('\n[E] encendido');
  DB = semilla(); RESEND = []; CC = cargar(true);
  r = await llamarAdmin({ accion: 'contrato_cliente_recordar', viajero_ids: [U(1), U(2)], seco: false });
  af(r.s === 400 && RESEND.length === 0, 'sin confirmar:true → 400, nada sale');
  r = await llamarAdmin({ accion: 'contrato_cliente_recordar', viajero_ids: [U(1), U(2), U(3)], seco: false, confirmar: true });
  af(r.s === 200 && RESEND.length === 1 && RESEND[0].to[0] === 'ana@x.mx', () => 'UN correo para la dirección de Ana y Beto (control positivo: el contador ve envíos) — ' + RESEND.length);
  af(RESEND.length === 1 && /Recordatorio/.test(RESEND[0].subject) && /Ana Uno/.test(RESEND[0].html) && /Beto Dos/.test(RESEND[0].html), 'asunto de recordatorio y nombra a los dos');
  af(DB.c[0].envios === 2 && DB.c[1].envios === 2 && DB.c[2].envios === 1, 'se sellan los dos avisados (envíos 1→2); Caro no se toca');
  r = await llamarAdmin({ accion: 'contrato_cliente_recordar', viajero_ids: [U(1), U(2)], seco: false, confirmar: true });
  af(RESEND.length === 1 && r.j.nada === true, '2º clic al momento: el freno de horas lo frena, no sale otro correo');

  console.log('\n[C] el cron');
  DB = semilla(); RESEND = []; CC = cargar(false, true);
  let H = require(path.join(RAIZ, 'netlify/functions/contratos-cliente-recordatorio.js')).handler;
  let j = JSON.parse((await H()).body);
  af(j.apagado === true && DB.lecturas === 0 && RESEND.length === 0, 'contrato apagado → el cron ni lee');
  DB = semilla(); CC = cargar(true, false);
  H = require(path.join(RAIZ, 'netlify/functions/contratos-cliente-recordatorio.js')).handler;
  j = JSON.parse((await H()).body);
  af(j.apagado === true && DB.lecturas === 0, 'contrato encendido pero recordatorio automático apagado → tampoco lee');
  DB = semilla(); RESEND = []; CC = cargar(true, true);
  H = require(path.join(RAIZ, 'netlify/functions/contratos-cliente-recordatorio.js')).handler;
  j = JSON.parse((await H()).body);
  const a = RESEND.map((x) => x.to[0]).sort().join(',');
  af(j.ok && a === 'ana@x.mx,gabo@x.mx', () => 'encendidos: le llega a Ana/Beto (un correo) y a Gabo; no a Caro (5 h), Dani (pasó), Eli (firmó), Fer (tope) — ' + a);
  af(DB.c[5].envios === 5 && DB.c[3].envios === 1, 'Fer y Dani quedan intactos');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('💥 el arnés se cayó: ' + e.stack); process.exit(1); });
