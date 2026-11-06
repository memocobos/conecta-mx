#!/usr/bin/env node
// =============================================================================
// mide-vj-contacto-1.js — [VJ-CONTACTO-1 · 5-nov-2026]
// Palabra de Memo: «en el botón de corregir en Capsule quiero tener la
// información de corregir también a los contactos de emergencia etc».
//   [A] viajero_editar por el handler REAL: parentesco y fecha de nacimiento
//       entran; correo por el dueño (problemaCorreo, minúsculas); celular y
//       emergencia a dígitos; talla de la lista; emergencia ≠ su celular;
//       el correo que cambia deja rastro ANEXADO; un campo ajeno rebota.
//   [B] la pantalla: el ✏️ Corregir pinta la sección de contacto con sus
//       valores y solo manda lo que CAMBIÓ.
// SIN ANCLA a propósito (árbol de trabajo).
// =============================================================================
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.CORREOS_MODO = 'real';
process.env.CONTRATO_CLIENTE_APAGAR_ARNES = '1';

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {}
  const t = typeof m === 'function' ? (() => { try { return m(); } catch (e) { return '(msg) ' + e.message; } })() : m;
  if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
let DB; const ESCR = [];
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = decodeURIComponent(String(url));
  const id = (u.match(/[?&]id=eq\.([^&]*)/) || [])[1];
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'bulma' }]);
  if (u.includes('/rest/v1/viajeros_evento')) {
    const filas = DB.filter((x) => !id || x.id === id);
    if (m === 'PATCH') { ESCR.push(JSON.parse(init.body)); filas.forEach((x) => Object.assign(x, JSON.parse(init.body))); }
    return resp(200, filas.map((x) => Object.assign({}, x)));
  }
  return resp(200, []);
};
const llamar = async (b) => {
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const jw = jwtSign({ id: 'u-bulma', rol: 'bulma', correo: 'bulma@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify(b) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};
const semilla = () => { DB = [{ id: U(1), nombre: 'Jenny G', correo: 'viejo@gmail.com', celular: '8991112233', num_emergencia: null, emergencia_nombre: null, emergencia_parentesco: null, fecha_nacimiento: null, talla_playera: null, notas: 'Migración' }]; ESCR.length = 0; };

(async () => {
  console.log('[A] viajero_editar (handler real)');
  semilla();
  const a = await llamar({ accion: 'viajero_editar', id: U(1), campos: { emergencia_nombre: 'Rosa Pérez', emergencia_parentesco: 'Mamá', num_emergencia: '899 444-5566', fecha_nacimiento: '1998-04-12', talla_playera: 'm' } });
  const f = DB[0];
  af(a.s === 200 && f.emergencia_parentesco === 'Mamá' && f.fecha_nacimiento === '1998-04-12', () => 'parentesco y nacimiento se guardan: ' + a.s + ' ' + (a.j.error || ''));
  af(f.num_emergencia === '8994445566' && f.talla_playera === 'M', () => 'número a dígitos y talla normalizada: ' + f.num_emergencia + ' ' + f.talla_playera);
  af(!/CONTACTO/.test(f.notas || ''), 'sin cambio de correo no se anexa rastro');
  const b = await llamar({ accion: 'viajero_editar', id: U(1), campos: { correo: 'GCJenny187@Gmail.com' } });
  af(b.s === 200 && DB[0].correo === 'gcjenny187@gmail.com', 'el correo se guarda en minúsculas');
  af(/^Migración · \[CONTACTO \d{4}-\d{2}-\d{2}\] correo «viejo@gmail\.com» → «gcjenny187@gmail\.com» · Bulma$/.test(DB[0].notas), () => 'el correo viejo queda ANEXADO en notas: ' + DB[0].notas);
  const n0 = ESCR.length;
  const c1 = await llamar({ accion: 'viajero_editar', id: U(1), campos: { correo: 'jenny..g@gmail.com' } });
  af(c1.s === 400 && /dos puntos/.test(c1.j.error || ''), () => 'correo raro rebota CON el porqué: ' + c1.j.error);
  const c2 = await llamar({ accion: 'viajero_editar', id: U(1), campos: { correo: 'jenny@gmail.con' } });
  af(c2.s === 400 && /\.com/.test(c2.j.error || ''), 'el «.con» rebota');
  const c3 = await llamar({ accion: 'viajero_editar', id: U(1), campos: { num_emergencia: '8991112233' } });
  af(c3.s === 400 && /OTRA persona/.test(c3.j.error || ''), 'emergencia igual a su celular rebota');
  const c4 = await llamar({ accion: 'viajero_editar', id: U(1), campos: { celular: '123' } });
  af(c4.s === 400, 'celular corto rebota');
  const c5 = await llamar({ accion: 'viajero_editar', id: U(1), campos: { fecha_nacimiento: '2026-02-30' } });
  af(c5.s === 400 && /no existe/.test(c5.j.error || ''), 'un día que no existe rebota');
  const c6 = await llamar({ accion: 'viajero_editar', id: U(1), campos: { fecha_nacimiento: '2099-01-01' } });
  af(c6.s === 400, 'una fecha futura rebota');
  const c7 = await llamar({ accion: 'viajero_editar', id: U(1), campos: { talla_playera: 'Mediana' } });
  af(c7.s === 400 && /XS/.test(c7.j.error || ''), 'talla fuera de la lista rebota diciendo la lista');
  const c8 = await llamar({ accion: 'viajero_editar', id: U(1), campos: { total_contrato: 1 } });
  af(c8.s === 400 && /no editable/.test(c8.j.error || ''), 'el dinero NO entra por esta puerta');
  af(ESCR.length === n0, () => 'los rebotes no escribieron nada: ' + (ESCR.length - n0));
  const d = await llamar({ accion: 'viajero_editar', id: U(1), campos: { emergencia_parentesco: '' } });
  af(d.s === 200 && DB[0].emergencia_parentesco === null, 'vacío = quitarlo (NULL)');

  console.log('[B] la pantalla');
  const kj = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const i0 = kj.indexOf('const VJ_CONTACTO = ['), i1 = kj.indexOf('// [ZONA-SELECT-1] La zona se ELIGE');
  const els = {};
  const ctx = { _esfEsc: (x) => String(x == null ? '' : x).replace(/</g, '&lt;').replace(/"/g, '&quot;'), document: { getElementById: (k) => els[k] || null } };
  vm.createContext(ctx); vm.runInContext(kj.slice(i0, i1) + '\n;this.VJ_CONTACTO=VJ_CONTACTO;', ctx);
  const v = { id: U(1), correo: 'a@b.mx', celular: '8991112233', talla_playera: 'Grande', fecha_nacimiento: '1998-04-12T00:00:00', emergencia_nombre: 'Rosa', emergencia_parentesco: 'Mamá', num_emergencia: '8994445566' };
  const html = vm.runInContext('_vjContactoHtml', ctx)(v, U(1));
  af(['correo', 'celular', 'talla_playera', 'fecha_nacimiento', 'emergencia_nombre', 'emergencia_parentesco', 'num_emergencia'].every((k) => html.includes(`vjx-c-${k}-${U(1)}`)), 'pinta los 7 campos de contacto');
  af(/value="Rosa"/.test(html) && /value="Mamá"/.test(html) && /value="1998-04-12"/.test(html), 'prellenados con lo que ya tiene (fecha recortada a AAAA-MM-DD)');
  af(/<option value="Grande" selected>/.test(html), 'una talla vieja fuera de la lista no se pierde al abrir');
  ctx.VJ_CONTACTO.forEach((c) => { els[`vjx-c-${c.k}-${U(1)}`] = { value: c.k === 'fecha_nacimiento' ? '1998-04-12' : String(v[c.k]) }; });
  els[`vjx-c-emergencia_parentesco-${U(1)}`].value = 'Papá';
  const cam = vm.runInContext('_vjContactoCambios', ctx)(U(1), v);
  af(JSON.stringify(cam) === JSON.stringify({ emergencia_parentesco: 'Papá' }), () => 'solo viaja lo que CAMBIÓ: ' + JSON.stringify(cam));
  const g0 = kj.indexOf('async function _vjEditarGuardar'), g1 = kj.indexOf('// ═══ [VIAJERO-MUDAR-1]');
  const g = kj.slice(g0, g1);
  af(/_vjContactoCambios\(id, vRow\)/.test(g) && /khViajeros\.editar\(id, contacto\)/.test(g) && /no cambiaste nada/.test(g), 'guardar manda el contacto por su propia puerta y tolera «no cambiaste nada» del viaje');
  af(/\$\{_vjContactoHtml\(v, e\)\}/.test(kj.slice(kj.indexOf('function _vjEditarAbrir'), i0)), 'la sección vive DENTRO del ✏️ Corregir');

  console.log('\n' + (V === 0 ? 'NADA MEDIDO · esto NO es un verde' : (R ? '🔴 ROJO' : '✅ VERDE')) + ' · ' + V + ' en verde, ' + R + ' en rojo');
  process.exit(R || !V ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(2); });
