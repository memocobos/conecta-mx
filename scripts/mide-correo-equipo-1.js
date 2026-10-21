#!/usr/bin/env node
/* =============================================================================
 * mide-correo-equipo-1 — EL CORREO AL EQUIPO (21-oct-2026).
 * Handler REAL + red falsa que CUENTA los envíos a Resend (con control
 * positivo: el contador tiene que VER los envíos de la corrida buena, o sus
 * ceros no dicen nada — la ley de MIG-1d-ii). CORREOS_MODO queda en 'real' a
 * propósito: el cero del seco tiene que salir del SECO, no de un desvío.
 * ⚠️ SIN ANCLA (árbol de trabajo). ========================================== */
'use strict';
const path = require('path');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
const af = (ok, msg) => { try { ok = typeof ok === 'function' ? ok() : ok; } catch (e) { ok = false; msg += ' · EXC: ' + e.message; } if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } };

process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
process.env.JWT_SECRET = 'secreto-del-arnes';
process.env.RESEND_API_KEY = 're_falsa_del_arnes';
process.env.CORREOS_MODO = 'real';

const EQUIPO = [
  { nombre: 'Coordi Uno', correo: 'uno@x.test', rol: 'coordinador', activo: true },
  { nombre: 'Allan', correo: 'popo@x.test', rol: 'mister_popo', activo: true },
  { nombre: 'Sin Correo', correo: null, rol: 'coordinador', activo: true },
];
function redNueva() {
  const st = { resend: [], escrituras: 0 };
  st.fetch = async (url, init) => {
    const U = String(url); const met = ((init || {}).method || 'GET').toUpperCase();
    const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
    if (U.includes('api.resend.com')) { st.resend.push(JSON.parse(init.body)); return resp(200, { id: 'em_' + st.resend.length }); }
    if (U.includes('/rest/v1/usuarios') && met === 'GET') {
      const m = U.match(/rol=in\.\(([^)]*)\)/); const roles = m ? decodeURIComponent(m[1]).split(',') : [];
      return resp(200, EQUIPO.filter((u) => u.activo && roles.includes(u.rol)));
    }
    if (U.includes('sesion')) throw new Error('sesion-viva apagada (fail-open)');
    if (met !== 'GET') { st.escrituras++; }
    return resp(200, []);
  };
  return st;
}
function H() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return { h: require(path.join(RAIZ, 'netlify/functions/admin-correo-equipo.js')).handler, jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign };
}
const ev = (body, tok) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });

(async function main() {
  console.log('══ mide:correo-equipo-1 ══\n');
  let red = redNueva(); global.fetch = red.fetch;
  let { h, jwtSign } = H();
  const roshi = jwtSign({ id: 'u-memo', rol: 'maestro_roshi', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
  const bulma = jwtSign({ id: 'u-b', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const CUERPO = { asunto: 'Registra tus tours del ranking', mensaje: 'Hola equipo.\n\nMetan sus tours en su perfil.' };

  console.log('[A] el seco es el DEFAULT y no manda nada');
  let r = await h(ev(CUERPO, roshi)); let b = JSON.parse(r.body);
  af(r.statusCode === 200 && b.seco === true, 'sin banderas → seco');
  af(b.a_mandar === 2 && Array.isArray(b.audiencia), 'la audiencia son los 2 CON correo (el sin-correo queda fuera)');
  af(/Registra tus tours/.test(b.html_muestra) && /Metan sus tours/.test(b.html_muestra), 'el render de muestra trae asunto y mensaje');
  af(red.resend.length === 0, 'CERO llamadas a Resend en seco');
  r = await h(ev({ ...CUERPO, confirmar: true }, roshi)); b = JSON.parse(r.body);
  af(b.seco === true && red.resend.length === 0, 'confirmar SOLO tampoco manda (hacen falta los DOS gestos)');

  console.log('\n[B] con los dos gestos SÍ manda — y el contador LO VE (control positivo)');
  red = redNueva(); global.fetch = red.fetch; ({ h } = H());
  r = await h(ev({ ...CUERPO, seco: false, confirmar: true }, roshi)); b = JSON.parse(r.body);
  af(r.statusCode === 200 && b.enviados === 2 && !(b.errores || []).length, 'manda a los 2 y lo dice');
  af(red.resend.length === 2, 'Resend recibió exactamente 2 (el contador no es ciego)');
  af(red.resend.every((x) => /admin@conectareynosa\.mx|Conecta/.test(String(x.from))), 'con el FROM del sistema');
  af(red.resend.every((x) => !/<script|Markdown/.test(x.html || '')) && /color:#111111/.test(red.resend[0].html), 'el HTML lleva su color por bloque (ley de CONFIRMA-1)');
  af(red.escrituras === 0, 'cero escrituras a la base: este correo no tiene bitácora A PROPÓSITO (interno)');

  console.log('\n[C] las puertas');
  red = redNueva(); global.fetch = red.fetch; ({ h } = H());
  r = await h(ev(CUERPO, bulma));
  af(r.statusCode === 403, 'bulma no puede: es la voz de Memo (solo maestro_roshi)');
  r = await h(ev({ ...CUERPO, roles: ['cliente'] }, roshi));
  af(r.statusCode === 400 && /Roles desconocidos/.test(JSON.parse(r.body).error), 'rol fuera de la lista cerrada → 400 que lo nombra');
  r = await h(ev({ asunto: 'ab', mensaje: 'corto bueno aquí' }, roshi));
  af(r.statusCode === 400, 'asunto corto → 400');
  r = await h(ev({ ...CUERPO, roles: ['milk'] }, roshi)); b = JSON.parse(r.body);
  af(r.statusCode === 409 && /VACÍA/.test(b.error || ''), 'audiencia vacía → 409 dicho, no un «0 enviados, ok»');
  af(red.resend.length === 0, 'y nada salió en todo [C]');

  console.log('\n' + (R ? '🔴 ROJO' : (V ? '✅ VERDE' : 'NADA MEDIDO')) + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('🔴 el arnés se cayó: ' + (e && e.stack || e)); process.exit(1); });
