#!/usr/bin/env node
// =============================================================================
// mide:cc-cards-1 — el resumen que pinta las tarjetas de Capsule (13-oct).
// Handler REAL (`capsule_resumen`), base falsa con filtros. SOLO LEE.
// =============================================================================
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };
const U1 = 'aaaaaaaa-0000-4000-8000-000000000001', U2 = 'aaaaaaaa-0000-4000-8000-000000000002', U3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const DB = {
  viajeros_evento: [
    { evento_id: 'soyluna', tipo_viajero: 'cliente', tipo_paquete: 'PLUS', zona_boleto: 'VIP', boletos: 1 },
    { evento_id: 'soyluna', tipo_viajero: null, tipo_paquete: 'CHEAP', zona_boleto: 'VIP', boletos: 2 },
    { evento_id: 'soyluna', tipo_viajero: 'cliente', tipo_paquete: 'PLUS', zona_boleto: null, boletos: 0 },   // baja
    { evento_id: 'soyluna', tipo_viajero: 'coordinador', tipo_paquete: 'PLUS', zona_boleto: 'Platino', boletos: 1, usuario_id: U1 },
    { evento_id: 'soyluna', tipo_viajero: 'creadora', tipo_paquete: 'CHEAP', zona_boleto: 'VIP', boletos: 1 },
    { evento_id: 'omar#0', tipo_viajero: 'cliente', tipo_paquete: 'RIDE', zona_boleto: null, boletos: 1 },
    { evento_id: 'karolg', tipo_viajero: 'coordinador', tipo_paquete: 'PLUS', zona_boleto: 'Oro', boletos: 1, usuario_id: U2, talla_playera: 'XL' },
  ],
  eventos_coordi: [
    { evento_id: 'soyluna', coordi_id: U1, status: 'aceptado' },
    { evento_id: 'soyluna', coordi_id: U2, status: 'pendiente' },
    { evento_id: 'soyluna', coordi_id: U3, status: 'declinado' },
    { evento_id: 'karolg', coordi_id: U2, status: 'aceptado' },
  ],
  usuarios: [{ id: U1, nombre: 'Renata Itzel', rol: 'coordinador', correo: 'renata', correo_notif: 'renata@correo.mx', celular: '8991234567', talla_playera: 'M', nombre_emergencia: 'Mamá Itzel', num_emergencia: '8997654321', parentesco_emergencia: 'Mamá' },
    { id: U2, nombre: 'Reginna V', rol: 'coordinador', correo: 'reginna@x.mx' }, { id: U3, nombre: 'Declinó', rol: 'coordinador' }],
  contratos_creadores: [
    { id: 'c1', creador_nombre: 'Marietta', creador_email: 'm@x', estado: 'firmado', evento_nombre: 'Soy Luna', evento_fecha: '2026-10-21', plantilla: 'creadora', datos: { celular: '8112223344', instagram: '@marietta', talla: 'S', acompanante: { nombre: 'Otra', talla: 'L' }, emergencia: { nombre: 'Papá', telefono: '8110001111' }, cortesia: { evento_id: 'soyluna', zona: 'VIP', boletos: 2, acompanante: 'Alanna', acompanante_talla: 'M', talla: 'XS' } } },
    { id: 'c2', creador_nombre: 'Day', creador_email: 'd@x', estado: 'firmado', evento_nombre: 'Alfredo Olivas', evento_fecha: '2026-10-15', plantilla: 'creadora', datos: { talla: 'L', acompanante: { nombre: 'Dilan', talla: 'XL' } } },
    { id: 'c3', creador_nombre: 'Day', creador_email: 'd@x', estado: 'pendiente', evento_nombre: 'Alfredo Olivas', evento_fecha: '2026-10-15', plantilla: 'creadora', datos: {} },
  ],
};
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
global.fetch = async (url, init) => {
  if (((init || {}).method || 'GET').toUpperCase() !== 'GET') throw new Error('ESCRITURA en un endpoint que solo lee');
  const u = new URL(url); const t = u.pathname.replace('/rest/v1/', ''); const T = DB[t]; if (!T) throw new Error('tabla ' + t);
  return resp(200, T.filter((r) => { for (const [k, v] of u.searchParams.entries()) { if (['select', 'order', 'limit'].includes(k)) continue;
    if (v.startsWith('eq.')) { if (String(r[k]) !== v.slice(3)) return false; continue; } throw new Error('filtro ' + k); } return true; }));
};
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const pedir = (rol) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jwtSign({ id: 'u', rol, correo: 'x@x.mx' }, process.env.JWT_SECRET, 3600) }, body: JSON.stringify({ accion: 'capsule_resumen' }) });
(async () => {
  console.log('══ mide:cc-cards-1 ══');
  const r = await pedir('bulma'); const j = JSON.parse(r.body); const sl = (j.tours || {}).soyluna || {};
  af(r.statusCode === 200, `[0] 200 (${r.statusCode}) ${r.statusCode !== 200 ? r.body : ''}`);
  af(sl.viajeros === 3, `[A1] viajeros = clientes con sus boletos (1+2), sin bajas ni staff (${sl.viajeros})`);
  af(sl.por_paquete && sl.por_paquete.PLUS === 1 && sl.por_paquete.CHEAP === 2, `[A2] por paquete ${JSON.stringify(sl.por_paquete)}`);
  const ren = (sl.equipo || []).find((p) => p.nombre === 'Renata Itzel'); const reg = (sl.equipo || []).find((p) => p.nombre === 'Reginna V');
  af(ren && ren.boleto === 'Platino' && ren.status === 'aceptado', '[B1] coordi aceptada con su boleto');
  af(reg && reg.status === 'pendiente' && reg.boleto === null, '[B2] coordi pendiente, sin boleto');
  af(!(sl.equipo || []).some((p) => p.nombre === 'Declinó'), '[B3] la que declinó no sale');
  af(((j.tours || {}).karolg || {}).equipo[0].base === true, '[B4] asignación al evento base marcada base (la tarjeta la reparte a sus fechas)');
  af((sl.creadoras || []).length === 1 && sl.creadoras[0].acompanante === 'Alanna' && sl.creadoras[0].cortesia.zona === 'VIP', '[C1] creadora con cortesía cuelga de SU tour, con acompañante');
  const day = (j.creadoras_por_fecha || []).filter((c) => c.nombre === 'Day');
  af(day.length === 1 && day[0].firmado === true && day[0].acompanante === 'Dilan', `[C2] creadora firmada sin cortesía va por fecha, UNA vez (gana la firmada) (${day.length})`);
  af(((j.tours || {})['omar#0'] || {}).viajeros === 1, '[D] la fecha de un multifecha se cuenta en su llave');
  // [CC-EQUIPO-DATOS-1] la ficha de cada quien viaja con la tarjeta
  af(ren && ren.celular === '8991234567' && ren.correo === 'renata@correo.mx' && ren.talla === 'M', '[F1] coordi trae celular, correo de avisos (gana a correo de login) y talla');
  af(ren && ren.emergencia && ren.emergencia.nombre === 'Mamá Itzel' && ren.emergencia.parentesco === 'Mamá', '[F2] coordi trae su contacto de emergencia');
  const regK = ((j.tours || {}).karolg || {}).equipo[0];
  af(regK.talla === 'XL' && regK.correo === 'reginna@x.mx' && regK.celular === null && regK.emergencia === null, '[F3] sin talla en su perfil cae a la de su fila de staff; lo que falta va null');
  const mar = (sl.creadoras || [])[0] || {};
  af(mar.talla === 'XS' && mar.acompanante === 'Alanna' && mar.acompanante_talla === 'M', '[F4] creadora: la CORTESÍA manda sobre el contrato (talla y acompañante)');
  af(mar.celular === '8112223344' && mar.correo === 'm@x' && mar.instagram === '@marietta' && mar.emergencia && mar.emergencia.telefono === '8110001111', '[F5] creadora trae celular, correo, redes y emergencia');
  af(day[0] && day[0].talla === 'L' && day[0].acompanante_talla === 'XL', '[F6] sin cortesía, talla y acompañante salen del contrato');
  // [G] el pintor REAL de la tarjeta
  const fs = require('fs'); const vm = require('vm');
  const js = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const fn = (n) => { const i = js.indexOf('function ' + n + '('); if (i < 0) throw new Error('no está ' + n); let k = js.indexOf('{', i), d = 0; for (; k < js.length; k++) { if (js[k] === '{') d++; else if (js[k] === '}' && --d === 0) break; } return js.slice(i, k + 1); };
  const sb = { String, Number, Object, Array, JSON, Math };
  vm.createContext(sb);
  vm.runInContext(['_esfEsc', '_cobDigits', '_waDigits10', '_ccDatosEquipoHtml', '_ccTarjetaRes'].map(fn).join('\n'), sb);
  const html = sb._ccTarjetaRes({ _res: { viajeros: 3, por_paquete: {}, equipo: sl.equipo, creadoras: sl.creadoras } }, false);
  af(/<details class="cc-eq-datos" onclick="event.stopPropagation\(\)"/.test(html), '[G1] plegado y sin abrir el evento al desplegar');
  af(html.includes('Datos del equipo (3)'), '[G2] el rótulo cuenta coordis + creadoras (2+1)');
  af(html.includes('wa.me/528991234567') && html.includes('mailto:renata@correo.mx') && html.includes('Mamá Itzel (Mamá)'), '[G3] celular → WhatsApp, correo → mailto, emergencia con parentesco');
  af(html.includes('VIP × 2') && html.includes('Alanna · 👕 M') && html.includes('IG @marietta'), '[G4] creadora: cortesía zona × boletos, acompañante con su talla, redes');
  af((html.match(/sin dato/g) || []).length >= 3, '[G5] lo que falta se DICE «sin dato» (Reginna: celular, talla, emergencia)');
  af(sb._ccDatosEquipoHtml({ equipo: [], creadoras: [] }) === '', '[G6] sin equipo ni creadoras no pinta nada');
  // [CC-EQUIPO-DATOS-1b] dentro del evento (pestaña Equipo) va ABIERTO; en la tarjeta, plegado
  const abierto = sb._ccDatosEquipoHtml({ equipo: sl.equipo, creadoras: sl.creadoras }, true);
  af(/<details class="cc-eq-datos"[^>]* open/.test(abierto) && !/<details class="cc-eq-datos"[^>]* open/.test(html), '[G7] abierto en Equipo, plegado en la tarjeta');
  af(!/<(input|select|textarea|button)\b/.test(abierto), '[G8] solo lectura: el bloque no trae ningún control para editar');
  af(/_ccDatosEquipoHtml\(ev\._res, true\) \+ htmlAsigs/.test(js) && /_ccDatosEquipoHtml\(ev\._res, true\) \+ htmlCreas/.test(js), '[G9] la pestaña Equipo lo pinta en sus DOS caminos (con y sin coordis)');
  const rc = await pedir('coordinador');
  af(rc.statusCode === 403, `[E] un coordi no lo ve (${rc.statusCode})`);
  console.log(`\n${R ? '🔴' : '🟢'} ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(2); });
