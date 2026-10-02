#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-sorteo-fotos-1.js — HOTFIX-SORTEO-FOTOS · la página PIDE las fotos
//
// 🔴 POR QUÉ EXISTE, y es el punto entero: `mide-sorteo-rondas` ya afirmaba
// «con ?fotos=1 salen las firmadas» — probó EL SERVIDOR con la bandera puesta
// a mano. Nadie afirmó que LA PÁGINA la mandara, y no la mandaba: el show de
// Karol G corrió completo sin una sola foto, con el careo en verde.
// Es «probar el camino, no la función» en su forma más pura.
//
// 🔒 ASÍ QUE ESTE ARNÉS ENTRA POR EL **CONSTRUCTOR DE URL DE LA PÁGINA**: se
// rebana `refrescar` de sorteo.html y se corre de verdad; el `api` falso APUNTA
// la URL y corta. Lo que se afirma es la cadena que la página construye.
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let verde = 0, rojo = 0, completo = false;
const fallos = [];
function af(cond, msg) {
  let ok = false, extra = '';
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; }
  catch (e) { ok = false; extra = '  [EXCEPCIÓN: ' + e.message + ']'; }
  if (ok) { verde++; return; }
  let t; try { t = (typeof msg === 'function') ? msg() : msg; }
  catch (e) { t = '(el mensaje también reventó: ' + e.message + ')'; }
  rojo++; fallos.push(t + extra); console.log('   ✗ ' + t + extra);
}
function ver(fn) { try { const v = fn(); return v === undefined ? 'undefined' : JSON.stringify(v); } catch (e) { return '«no se pudo leer: ' + e.message + '»'; } }
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  if (verde + rojo === 0) { console.log('⚠️  NADA MEDIDO · cero aserciones corrieron: esto NO es un verde'); return; }
  console.log((rojo ? '❌ ROJO · ' : '✅ VERDE · ') + verde + ' en verde, ' + rojo + ' en rojo');
  fallos.slice(0, 20).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '7b6410e';   // el main con el defecto vivo
const HEAD_SHA = process.env.HEAD_SHA || 'b17ac8f';   // el commit del MERGE
const MEDIDOS = ['sorteo.html', 'netlify/functions/giveaway-estado.js'];
function avisarSiSucio() {
  let sucio = '';
  try { sucio = execSync('git status --porcelain -- ' + MEDIDOS.join(' '), { cwd: RAIZ, encoding: 'utf8' }).trim(); } catch (_) { return; }
  if (!sucio) return;
  let mismo = false;
  try {
    mismo = execSync('git rev-parse ' + HEAD_SHA, { cwd: RAIZ, encoding: 'utf8' }).trim()
         === execSync('git rev-parse HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim();
  } catch (_) { mismo = false; }
  if (!mismo) return;
  console.log('\n⚠️  EL ARNÉS MIDE EL COMMIT, NO TU ÁRBOL DE TRABAJO.');
  sucio.split('\n').forEach((l) => console.log('     ' + l));
  console.log('   Committea y vuelve a correr.\n');
  process.exit(2);
}
// Rebana una función del archivo. El `function` va en el ancla; el `async` se
// re-mira hacia atrás (trampa que ya costó una vez).
function funcionDe(src, nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return null;
}
// Las declaraciones `var X = …;` de un nombre dado, tal como las escribe la página.
function varsDe(src, nombres) {
  const out = [];
  for (const n of nombres) {
    const re = new RegExp('var\\s+' + n + '\\s*=\\s*[^;]+;', 'g');
    const m = src.match(re);
    if (m) out.push(m[0]);
  }
  return out.join('\n');
}

const CORTE = '__corte_del_arnes__';

// Monta el constructor REAL de la página y devuelve la URL que construye.
function urlQueConstruye(src, mundo) {
  const refrescar = funcionDe(src, 'refrescar');
  if (!refrescar) return { error: 'no pude rebanar `refrescar` de sorteo.html' };
  const tocaRod = funcionDe(src, 'tocaPedirRodillos') || 'function tocaPedirRodillos(){return false;}';
  const tocaFot = funcionDe(src, 'tocaPedirFotos') || 'function tocaPedirFotos(){return false;}';
  const trajo  = funcionDe(src, 'trajoFotos') || 'function trajoFotos(){return false;}';
  const vars = varsDe(src, ['RODILLOS_CADA_MS', 'rodillosAl', 'FOTOS_VIGENCIA_MS',
                            'FOTOS_CADA_MS', 'FOTOS_REINTENTO_MS']);
  const pedidas = [];
  const ctx = vm.createContext({
    // El mundo de la página, controlado por el escenario.
    girando: !!mundo.girando, estado: mundo.estado || null, SHOW: mundo.SHOW || null,
    fotosAl: mundo.fotosAl || 0, fotosPedidoAl: mundo.fotosPedidoAl || 0,
    desfaseMs: 0, Date, JSON, Math, String, Number, Object, Array, Promise, Error,
    console: { error: (...a) => pedidas.push({ gritó: a.join(' ') }), log: () => {}, warn: () => {} },
    // 🔒 El `api` falso APUNTA la URL y CORTA: lo único que se mide es la cadena
    // que la página construyó. Lo que `refrescar` haga después no hace falta.
    api: (u) => { pedidas.push({ url: u }); throw new Error(CORTE); },
  });
  try { vm.runInContext(vars + '\n' + tocaRod + '\n' + tocaFot + '\n' + trajo + '\n' + refrescar, ctx); }
  catch (e) { return { error: 'el montaje falló: ' + e.message }; }
  try { vm.runInContext('refrescar()', ctx); }
  catch (e) { if (!String(e.message).includes(CORTE)) return { error: 'refrescar reventó: ' + e.message }; }
  return { url: (pedidas.find((x) => x.url) || {}).url || null, gritos: pedidas.filter((x) => x.gritó) };
}

(async function main() {
  process.on('exit', marcador);
  avisarSiSucio();
  const b = sacar(BASE, 'sf-base'), h = sacar(HEAD_SHA, 'sf-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }
  const srcH = fs.readFileSync(path.join(h.dir, 'sorteo.html'), 'utf8');
  const srcB = fs.readFileSync(path.join(b.dir, 'sorteo.html'), 'utf8');
  // Un giro vivo: es lo que destraba el mosaico (y lo que el servidor exige).
  const CON_GIRO = { estado: { ok: true, ultimo: { intento: 2, rondas: [] } } };

  // ── [U] LA PÁGINA PIDE `fotos=1` ──────────────────────────────────────
  console.log('[U] la URL que construye la página');
  const r = urlQueConstruye(srcH, CON_GIRO);
  console.log('    con giro → ' + ver(() => r.url));
  af(!r.error, () => 'el arnés no pudo montar el constructor: ' + r.error);
  af(r.url && /[?&]fotos=1\b/.test(r.url),
     () => '🔴 LA PÁGINA NO PIDE LAS FOTOS. Es el defecto exacto del show de Karol G: el servidor hace '
     + '`if (!quiereFotos) return {}`, así que no firma nada y las tarjetas caen a iniciales sin un solo '
     + 'error. Salió ' + ver(() => r.url));
  af(r.url && /^giveaway-estado\?/.test(r.url), () => 'la URL ya no es de `giveaway-estado`: ' + ver(() => r.url));

  // ── [+] CONTROL POSITIVO · BASE no la pide ────────────────────────────
  // 🔴 Sin esto el verde de arriba no dice nada: podría estar pasando porque el
  // escenario no ejercita el camino.
  console.log('\n[+] control positivo · BASE');
  const rB = urlQueConstruye(srcB, CON_GIRO);
  console.log('    BASE con giro → ' + ver(() => rB.url));
  af(rB.url && !/fotos=1/.test(rB.url),
     () => 'CONTROL POSITIVO: en BASE la página NO podía pedir `fotos=1` — es el defecto que este hotfix '
     + 'cierra. Si ya la pedía, el verde de arriba no prueba nada. Salió ' + ver(() => rB.url));
  af(rB.url !== r.url, 'BASE y HEAD construyen la MISMA URL: entonces este arnés no separa nada');

  // ── [N] NO SE PIDE CUANDO NO TOCA ─────────────────────────────────────
  // 🔒 El servidor no firma antes del giro (regla de privacidad) y girando no se
  // consulta nada. Pedirlo ahí serían viajes en vacío — y 24 firmas por visitante
  // cada 4 s es justo lo que el servidor advierte que no se haga.
  console.log('\n[N] cuándo NO se piden');
  // 🔴 EL ARRANQUE EN FRÍO, que la primera versión de este hotfix falló: en la
  // PRIMERA consulta `estado` es null y NO se pedían fotos; llegaban 4 s después, y
  // «Repetir» (que pone `girando`) bloquea toda petición durante los 82 s del show.
  // Quien cargaba y repetía en esos 4 segundos veía el show entero sin fotos.
  const frio = urlQueConstruye(srcH, { estado: null });
  console.log('    arranque en frío (estado=null) → ' + ver(() => frio.url));
  af(/fotos=1/.test(frio.url || ''),
     () => '🔴 en la PRIMERA consulta no se piden las fotos. Es gratis pedirlas — sin giro el servidor '
     + 'devuelve {} por su regla de privacidad— y no pedirlas deja 4 segundos en los que «Repetir» corre el '
     + 'show COMPLETO sin caras. «No sé» no es «no hay». Salió ' + ver(() => frio.url));
  const sinGiro = urlQueConstruye(srcH, { estado: { ok: true } });
  const girando = urlQueConstruye(srcH, { ...CON_GIRO, girando: true });
  console.log('    sin giro → ' + ver(() => sinGiro.url) + '   ·   girando → ' + ver(() => girando.url));
  af(sinGiro.url !== null && !/fotos=1/.test(sinGiro.url || ''),
     () => 'ANTES del giro se piden fotos: el servidor no firma nada ahí, así que es un viaje en vacío. '
     + ver(() => sinGiro.url));
  af(!/fotos=1/.test(girando.url || ''),
     () => 'GIRANDO se piden fotos: el giro no puede quedarse esperando una consulta. ' + ver(() => girando.url));

  // ── [C] LA CACHÉ · dentro de la vigencia no se vuelve a pedir ─────────
  // 🔒 Y se renueva ANTES de caducar: el servidor firma con `expiresIn: 1800`, así
  // que refrescar justo a los 1800 s dejaría imágenes rotas en cámara.
  console.log('\n[C] la caché, por dentro de la vigencia');
  const recien = urlQueConstruye(srcH, { ...CON_GIRO, fotosAl: Date.now() - 60000 });
  const vieja  = urlQueConstruye(srcH, { ...CON_GIRO, fotosAl: Date.now() - 1600000 });
  console.log('    firmadas hace 1 min → ' + ver(() => recien.url));
  console.log('    firmadas hace 26 min → ' + ver(() => vieja.url));
  af(!/fotos=1/.test(recien.url || ''),
     () => 'con firmas de hace 1 minuto volvió a pedirlas: serían 24 firmas por visitante cada 4 s, que es '
     + 'lo que el servidor advierte. ' + ver(() => recien.url));
  af(/fotos=1/.test(vieja.url || ''),
     () => 'con firmas de hace 26 minutos NO las renovó: la vigencia es de 30, y llegar al minuto 30 deja '
     + 'imágenes rotas en cámara. ' + ver(() => vieja.url));
  // El margen, afirmado sobre las constantes de la página.
  const num = (n) => { const m = srcH.match(new RegExp('var\\s+' + n + '\\s*=\\s*(\\d+)')); return m ? Number(m[1]) : null; };
  console.log('    vigencia=' + num('FOTOS_VIGENCIA_MS') + ' · cada=' + num('FOTOS_CADA_MS')
    + ' · reintento=' + num('FOTOS_REINTENTO_MS'));
  af(num('FOTOS_CADA_MS') && num('FOTOS_VIGENCIA_MS') && num('FOTOS_CADA_MS') < num('FOTOS_VIGENCIA_MS'),
     'la cadencia de refresco NO es menor que la vigencia: así una URL caduca en pantalla');

  // ── [!] SI NO LLEGARON, GRITA Y REINTENTA ────────────────────────────
  console.log('\n[!] el fallback deja de ser silencioso');
  af(/console\.error/.test(funcionDe(srcH, 'refrescar') || ''),
     '🔴 la página no GRITA cuando pide fotos y no llegan: el show entero pasó sin fotos porque nadie se '
     + 'enteró de que faltaban');
  af(/trajoFotos/.test(funcionDe(srcH, 'refrescar') || ''),
     'el reloj de la caché no mira si las fotos LLEGARON: marcar «ya las tengo» tras un fallo dejaría la '
     + 'pantalla 25 minutos sin fotos y sin reintentar');
  const srvH = fs.readFileSync(path.join(h.dir, 'netlify/functions/giveaway-estado.js'), 'utf8');
  const srvB = fs.readFileSync(path.join(b.dir, 'netlify/functions/giveaway-estado.js'), 'utf8');
  const gritos = (s) => (s.match(/console\.error/g) || []).length;
  console.log('    console.error en giveaway-estado: BASE ' + gritos(srvB) + ' → HEAD ' + gritos(srvH));
  af(gritos(srvH) > gritos(srvB),
     'el servidor no grita más que antes: los dos sitios que se tragaban el fallo (`rs.ok ? … : []` y el '
     + '`catch`) tienen que decirlo');
  af(/NINGUNA sali/.test(srvH),
     'falta el grito del ÉXITO VACÍO: se pidieron rutas y no salió ninguna URL es un caso distinto de que '
     + 'la llamada falle, y se ve igual si nadie lo dice');
  // 🔒 Y SIGUE DEGRADANDO: el catch no re-lanza, la transmisión no se rompe.
  af(!/throw/.test((funcionDe(srvH, 'firmarDe') || '')),
     'el servidor ahora LANZA al fallar la firma: degradar a iniciales era lo correcto — lo que faltaba era '
     + 'decirlo, no romper la transmisión');

  // ── [⏳] LA ASERCIÓN CONTRA EL BUCKET REAL · PENDIENTE DE LLAVE ────────
  // 🔒 Se deja NOMBRADA, no silenciada: sin `PORTAL_SUPABASE_SERVICE_KEY` en el
  // entorno no se puede firmar un path de prueba contra el bucket real, y una
  // aserción que no puede correr NO se escribe en verde (sería el hueco de
  // cobertura disfrazado de renglón bueno).
  console.log('\n[⏳] contra el bucket REAL · pendiente de llave');
  const hayLlave = !!(process.env.PORTAL_SUPABASE_SERVICE_KEY || process.env.PORTAL_SUPABASE_SERVICE);
  console.log('    PORTAL_SUPABASE_SERVICE_KEY en el entorno: ' + hayLlave);
  if (!hayLlave) {
    console.log('    ⏳ NO MEDIDO (y no cuenta como verde): falta la llave del Portal. Con ella, esta');
    console.log('       sección firma un path de prueba contra giveaway-fotos y exige http 200 + image/*.');
  } else {
    af(false, 'la llave YA está: esta sección tiene que escribirse de verdad en vez de seguir pendiente');
  }

  completo = true;
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN DEL ARNÉS: ' + e.stack); process.exit(1); });
