#!/usr/bin/env node
/* =============================================================================
 * mide-emma-1 — EMMA KAIOSAMA · el correo del sistema (21-oct-2026).
 * Supersede a mide-correo-equipo-1 (CORREO-EQUIPO-1 murió sin estrenarse: la
 * misma tuerca creció a las tres audiencias y se renombró Shenron).
 * Handler REAL + red falsa que CUENTA los envíos a Resend (control positivo:
 * el contador tiene que VER los envíos — la ley de MIG-1d-ii). CORREOS_MODO
 * queda en 'real' a propósito. ⚠️ SIN ANCLA (árbol de trabajo). ============= */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
const af = (ok, msg) => { try { ok = typeof ok === 'function' ? ok() : ok; } catch (e) { ok = false; msg += ' · EXC: ' + e.message; } if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); } };

process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
process.env.JWT_SECRET = 'secreto-del-arnes';
process.env.RESEND_API_KEY = 're_falsa_del_arnes';
process.env.CORREOS_MODO = 'real';

const hoyMx = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
const dia = (n) => new Date(Date.parse(hoyMx() + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

const USUARIOS = [
  { nombre: 'Coordi Uno', correo: 'uno@x.test', rol: 'coordinador', activo: true },
  { nombre: 'Allan', correo: 'popo@x.test', rol: 'mister_popo', activo: true },
  { nombre: 'Sin Correo', correo: null, rol: 'coordinador', activo: true },
];
const CONTRATOS = [
  { creador_nombre: 'Crea Viva', creador_email: 'viva@x.test', evento_fecha: dia(10) },      // vigente
  { creador_nombre: 'Crea Pasada', creador_email: 'pasada@x.test', evento_fecha: dia(-20) }, // su evento pasó
  { creador_nombre: 'Crea Team', creador_email: 'team@x.test', evento_fecha: null },         // sin fecha = viva
];
// 35 viajeros del evento (para probar las TANDAS de 30) + ruido que NO entra.
const VIAJEROS = [];
for (let i = 1; i <= 35; i++) VIAJEROS.push({ evento_id: i % 2 ? 'bruno' : 'bruno#1', nombre: 'V' + i, correo: 'v' + String(i).padStart(2, '0') + '@x.test', tipo_viajero: null, boletos: 1 });
VIAJEROS.push({ evento_id: 'bruno', nombre: 'Dup', correo: 'V01@X.TEST', tipo_viajero: null, boletos: 1 });          // duplicado (mayúsculas)
VIAJEROS.push({ evento_id: 'bruno', nombre: 'Staff', correo: 'staff@x.test', tipo_viajero: 'coordinador', boletos: 1 }); // staff fuera
VIAJEROS.push({ evento_id: 'bruno', nombre: 'Baja', correo: 'baja@x.test', tipo_viajero: null, boletos: 0 });            // baja fuera
VIAJEROS.push({ evento_id: 'brunomars2', nombre: 'Ajeno', correo: 'ajeno@x.test', tipo_viajero: null, boletos: 1 });     // el candado del prefijo

function redNueva() {
  const st = { resend: [], escrituras: 0 };
  st.fetch = async (url, init) => {
    const U = String(url); const met = ((init || {}).method || 'GET').toUpperCase();
    const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
    if (U.includes('api.resend.com')) { st.resend.push(JSON.parse(init.body)); return resp(200, { id: 'em_' + st.resend.length }); }
    if (U.includes('/rest/v1/usuarios') && met === 'GET') {
      const m = U.match(/rol=in\.\(([^)]*)\)/); const roles = m ? decodeURIComponent(m[1]).split(',') : [];
      return resp(200, USUARIOS.filter((u) => u.activo && roles.includes(u.rol)));
    }
    if (U.includes('/rest/v1/contratos_creadores') && met === 'GET') return resp(200, CONTRATOS.map((c) => ({ ...c })));
    if (U.includes('/rest/v1/viajeros_evento') && met === 'GET') {
      // Respeta el filtro REAL: eq o el or=(eq,like slug#*) — como PostgREST.
      const dec = decodeURIComponent(U);
      let casa;
      const or = dec.match(/or=\(evento_id\.eq\.([^,]+),evento_id\.like\.([^)]+)\)/);
      if (or) { const eq = or[1], like = or[2].replace(/\*/g, ''); casa = (v) => v.evento_id === eq || v.evento_id.startsWith(like); }
      else { const m = dec.match(/evento_id=eq\.([^&]+)/); casa = (v) => v.evento_id === (m && m[1]); }
      return resp(200, VIAJEROS.filter(casa));
    }
    if (U.includes('sesion')) throw new Error('sesion-viva apagada (fail-open)');
    if (met !== 'GET') st.escrituras++;
    return resp(200, []);
  };
  return st;
}
function H() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return { h: require(path.join(RAIZ, 'netlify/functions/admin-emma.js')).handler, jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign };
}
const ev = (body, tok) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });
const CUERPO = { asunto: 'Registra tus tours del ranking', mensaje: 'Hola equipo.\n\nMetan sus tours en su perfil.' };

(async function main() {
  console.log('══ mide:emma-1 · Emma Kaiosama ══\n');
  let red = redNueva(); global.fetch = red.fetch;
  let { h, jwtSign } = H();
  const roshi = jwtSign({ id: 'u-memo', rol: 'maestro_roshi', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
  const bulma = jwtSign({ id: 'u-b', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);

  console.log('[A] el seco es el DEFAULT y la audiencia nace sin default');
  let r = await h(ev(CUERPO, roshi)); let b = JSON.parse(r.body);
  af(r.statusCode === 400 && /audiencia/.test(b.error || ''), 'sin audiencia → 400 que lo pide (DEFAULTS-1: elegir a quién es una atribución)');
  r = await h(ev({ ...CUERPO, audiencia: 'equipo' }, roshi)); b = JSON.parse(r.body);
  af(r.statusCode === 200 && b.seco === true && b.total === 2, 'equipo en seco: 2 con correo (el sin-correo fuera), cero envíos');
  af(red.resend.length === 0, 'CERO llamadas a Resend en seco');
  r = await h(ev({ ...CUERPO, audiencia: 'equipo', confirmar: true }, roshi)); b = JSON.parse(r.body);
  af(b.seco === true && red.resend.length === 0, 'confirmar SOLO tampoco manda (dos gestos)');

  console.log('\n[B] las tres audiencias se DERIVAN');
  r = await h(ev({ ...CUERPO, audiencia: 'creadoras' }, roshi)); b = JSON.parse(r.body);
  af(b.total === 2 && b.audiencia.every((x) => x.correo !== 'pasada@x.test'), 'creadoras: las vigentes (la pasada hace 20 días queda fuera; la team sin fecha entra)');
  r = await h(ev({ ...CUERPO, audiencia: 'evento', evento_id: 'bruno' }, roshi)); b = JSON.parse(r.body);
  af(b.total === 35, 'evento: 35 viajeros — dedup por correo (36→35), sin staff, sin bajas, y brunomars2 NO entra (un prefijo no es un ancla)');
  af(b.tanda === 20, 'y avisa que el envío va por tandas de 20 (con el freno de 150 ms, 30 rozaba los 10 s de Netlify)');

  console.log('\n[C] enviar: tandas de 20 con desde/siguiente');
  red = redNueva(); global.fetch = red.fetch; ({ h } = H());
  r = await h(ev({ ...CUERPO, audiencia: 'evento', evento_id: 'bruno', seco: false, confirmar: true, desde: 0 }, roshi)); b = JSON.parse(r.body);
  af(b.enviados === 20 && b.siguiente === 20 && b.total === 35, 'tanda 1: manda 20 y dice siguiente=20');
  r = await h(ev({ ...CUERPO, audiencia: 'evento', evento_id: 'bruno', seco: false, confirmar: true, desde: 20 }, roshi)); b = JSON.parse(r.body);
  af(b.enviados === 15 && b.siguiente === null, 'tanda 2: manda los 15 que faltan y cierra (siguiente null)');
  af(red.resend.length === 35, 'Resend recibió EXACTAMENTE 35 (el contador no es ciego)');
  const correos = red.resend.map((x) => String(x.to));
  af(new Set(correos).size === 35 && !correos.includes('ajeno@x.test') && !correos.includes('staff@x.test') && !correos.includes('baja@x.test'), 'sin repetidos y sin colados (ajeno/staff/baja)');
  af(red.resend.every((x) => /Conecta/.test(String(x.from))) && /color:#111111/.test(red.resend[0].html), 'FROM del sistema y color por bloque (ley CONFIRMA-1)');
  af(red.escrituras === 0, 'cero escrituras a la base: sin bitácora A PROPÓSITO (dicho en el encabezado)');

  console.log('\n[C2] el freno de Resend (EMMA-1c, cobrado en el primer envío real: 6 de 20 en 429)');
  red = redNueva(); global.fetch = red.fetch; ({ h } = H());
  // El Resend falso rebota la PRIMERA llamada de cada correo con el error real
  // y acepta el reintento: sin el retry, los 2 saldrían como errores.
  const vistos = new Set();
  const fetchBase = red.fetch;
  global.fetch = async (url, init) => {
    if (String(url).includes('api.resend.com')) {
      const to = JSON.parse(init.body).to;
      if (!vistos.has(to)) { vistos.add(to); return { ok: false, status: 429, json: async () => ({ message: 'Too many requests. You can only make 10 requests per second.' }), text: async () => 'rate' }; }
    }
    return fetchBase(url, init);
  };
  ({ h } = H());
  r = await h(ev({ ...CUERPO, audiencia: 'equipo', seco: false, confirmar: true, desde: 0 }, roshi)); b = JSON.parse(r.body);
  af(b.enviados === 2 && !(b.errores || []).length, 'el 429 se reintenta UNA vez y los 2 salen (antes eran errores)');
  af(red.resend.length === 2, 'y el contador ve los 2 entregados');
  // `solo` estrecha la audiencia derivada (el botón «reintentar fallidos»)
  red = redNueva(); global.fetch = red.fetch; ({ h } = H());
  r = await h(ev({ ...CUERPO, audiencia: 'equipo', solo: ['popo@x.test', 'colado@x.test'] }, roshi)); b = JSON.parse(r.body);
  af(b.total === 1 && b.audiencia[0].correo === 'popo@x.test', 'solo ESTRECHA: queda popo, y el colado que la derivación no trajo NO entra');

  console.log('\n[D] las puertas');
  red = redNueva(); global.fetch = red.fetch; ({ h } = H());
  r = await h(ev({ ...CUERPO, audiencia: 'equipo' }, bulma));
  af(r.statusCode === 403, 'bulma no puede: la pluma es de Memo (solo maestro_roshi)');
  r = await h(ev({ ...CUERPO, audiencia: 'equipo', roles: ['cliente'] }, roshi));
  af(r.statusCode === 400 && /Roles desconocidos/.test(JSON.parse(r.body).error), 'rol fuera de la lista cerrada → 400 que lo nombra');
  r = await h(ev({ ...CUERPO, audiencia: 'evento', evento_id: 'x; drop' }, roshi));
  af(r.statusCode === 400, 'evento_id inválido → 400');
  r = await h(ev({ asunto: 'ab', mensaje: 'mensaje bueno aquí', audiencia: 'equipo' }, roshi));
  af(r.statusCode === 400, 'asunto corto → 400');
  r = await h(ev({ ...CUERPO, audiencia: 'evento', evento_id: 'nadie' }, roshi));
  af(r.statusCode === 409 && /VACÍA/.test(JSON.parse(r.body).error || ''), 'audiencia vacía → 409 dicho, no «0 enviados, ok»');
  af(red.resend.length === 0, 'y nada salió en todo [D]');

  console.log('\n[E] la pantalla (estática) y el cableado');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  const ui = fs.readFileSync(path.join(RAIZ, 'kamehouse-emma.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  const kj = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  af(/id="nav-emma"/.test(html) && /id="page-emma"/.test(html) && /kamehouse-emma\.js/.test(html), 'nav + página + script en el HTML');
  af(/<option value="">— elige la audiencia —<\/option>/.test(html), 'el selector de audiencia NACE VACÍO (DEFAULTS-1)');
  af(/'emma'\]/.test(kj) && /name === 'emma'/.test(kj), 'PERMISOS_TABS (solo roshi) + carga en showHerramienta (una puerta)');
  af(/emVistaPrevia/.test(ui) && /confirm\(/.test(ui) && /seco: false, confirmar: true/.test(ui), 'la pantalla enseña la vista previa primero y manda solo tras confirm con los dos gestos');
  af(/_emFreno/.test(ui) && /j\.siguiente/.test(ui), 'tandas con botón de detener, avanzando por el siguiente del servidor');
  af(/emReintentarFallidos/.test(ui) && /solo: _emFallidos/.test(ui), 'y el botón «reintentar fallidos» manda con `solo` (jamás re-manda a los que ya recibieron)');
  // [EMMA-1b] La vista previa VACÍA que cazó Memo: _emEsc no escapa comillas y
  // el correo trae style="…" — interpolarlo en srcdoc="…" rompía el atributo.
  af(/prev\.srcdoc = j\.html_muestra/.test(ui), 'el HTML de la vista previa entra por PROPIEDAD (srcdoc asignado, no interpolado)');
  af(!/srcdoc="\$\{/.test(ui), 'y NINGÚN srcdoc se interpola en un atributo (la trampa de las comillas)');
  af(/GENKIDAMA/i.test(ui) || /Genkidama/.test(html.slice(html.indexOf('page-emma'))), 'y la pantalla manda las campañas masivas a Genkidama (Emma no la reemplaza)');
  af(!fs.existsSync(path.join(RAIZ, 'netlify/functions/admin-correo-equipo.js')), 'admin-correo-equipo murió sin estrenarse: UN solo dueño del correo interno');
  af(!fs.existsSync(path.join(RAIZ, 'kamehouse-shenron.js')) && !fs.existsSync(path.join(RAIZ, 'netlify/functions/admin-shenron.js')), 'Shenron murió sin estrenarse (renombrado a Emma el mismo día)');
  // Botones SIN nombres temáticos (palabra de Memo): se mide el TEXTO que el
  // botón pinta, con los comentarios fuera (la ley del arnés que lee comentarios).
  const pagEmma = html.slice(html.indexOf('id="page-emma"'), html.indexOf('LISTA DE ESPERA'));
  af(/>Vista previa<\/button>/.test(pagEmma), 'el botón dice «Vista previa», sin tema');
  af(!/[Ii]nvocar|[Dd]eseo|Shenron/.test(pagEmma), 'y la página no trae nombres temáticos en sus textos');
  af(/Enviar a \$\{j\.total\}/.test(ui) && !/Conceder|Invocar|deseo/.test(ui.replace(/\/\*[^]*?\*\//g, '')), 'los botones de la pantalla dicen Enviar/Detener, sin tema');

  console.log('\n' + (R ? '🔴 ROJO' : (V ? '✅ VERDE' : 'NADA MEDIDO')) + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('🔴 el arnés se cayó: ' + (e && e.stack || e)); process.exit(1); });
