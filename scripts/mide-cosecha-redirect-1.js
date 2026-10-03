#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-cosecha-redirect-1.js — COSECHA-REDIRECT-1 · el POST que volvía GET
//
// Lo que Jane vio el 3-oct pidiendo trueno por evento: 504 · 504 · y a la
// tercera el cuerpo del `doGet` del .gs, «Este script solo contesta por POST y
// con token · [SIN_TOKEN]».
//
// MEDIDO el 3-oct contra producción, 21 cosechas (catálogo · trueno ×6 · tanda
// de 10 en paralelo): la cadena real es SIEMPRE
//     POST /exec → 302 → GET googleusercontent/echo → 200   (1.7–2.3 s)
// y las 21 salieron OK. O sea: el despliegue NO se movió y el token sirve. Lo
// que falló fue la redirección, y ésa es la única forma de ver SIN_TOKEN.
//
// Lo que esta tuerca mete, y este careo mide:
//   · la cadena se camina A MANO: al `echo` con GET, a la MISMA puerta con POST;
//   · un reloj por intento (Google colgado ya no se come los 10 s de Netlify);
//   · UN reintento para las tres caras transitorias, con presupuesto;
//   · SIN_TOKEN entra a `_KH_CAREO_TRANSITORIOS` — faltaba, y era uno de los dos
//     códigos que el acta del 28-sep nombra.
//
// 🔒 CONTROL POSITIVO EN CADA SECCIÓN: el BASE se extrae del commit y se le
//    exige FALLAR donde HEAD acierta. Sin eso, «HEAD arregla X» no se midió.
// 🔒 El fetch falso de este arnés devuelve `headers`; el de los OTROS arneses
//    no. La sección [C] exige que esa forma siga sirviendo, porque romperla
//    habría tirado todos los careos que ya corren.
//
// Se corre:  npm run mide:cosecha-redirect-1
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0, completo = false;
const fallos = [];
function af(c, e) {
  let v = false;
  try { v = (typeof c === 'function') ? !!c() : !!c; }
  catch (x) { v = false; e = e + '  [EXCEPCIÓN: ' + x.message + ']'; }
  if (v) ok++; else { mal++; fallos.push(e); console.log('   ✗ ' + e); }
}
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  console.log((mal ? '❌ ROJO · ' : '✅ VERDE · ') + ok + ' en verde, ' + mal + ' en rojo');
  fallos.slice(0, 20).forEach((f) => console.log('  · ' + f));
}
// 🔒 El BASE es el main anterior a esta tuerca: el merge de la pantalla de
// EXCEL-AG-2. Se re-ancla al mergear (la ley del ancla).
const BASE = process.env.BASE || '7e1c0ed';

function sacar(ref) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cosred-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' netlify/functions/_lib/cosecha-excel.js kamehouse.js | tar -x -C ' + dir,
           { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}

const EXEC = 'https://script.google.com/macros/s/AKfycbTOKEN/exec';
const ECHO = 'https://script.googleusercontent.com/macros/echo?user_content_key=abc';

// Una respuesta como la que da undici: con `headers.get`.
function resp(status, texto, loc) {
  return { ok: status >= 200 && status < 300, status,
           headers: { get: (k) => (String(k).toLowerCase() === 'location' ? (loc || null) : null) },
           text: async () => texto };
}
// Y una SIN encabezados: la forma que usan los fetch falsos de los otros arneses.
function respPelada(texto) { return { ok: true, status: 200, text: async () => texto }; }

// 🔴 UN GOOGLE FALSO QUE OBEDECE `init.redirect`, porque la primera versión de
// este arnés no lo hacía y los tres rojos eran MÍOS: el BASE usa
// `redirect:'follow'`, así que con un doble que no sigue nada el BASE moría de
// «no es JSON» y no de su defecto. El control positivo habría medido mi doble.
//   · con 'manual'  → entrega el 302 tal cual (HEAD camina la cadena);
//   · sin 'manual'  → lo SIGUE, degradando POST→GET y tirando el cuerpo, que es
//                     la regla del estándar y lo que se midió 21 de 21 veces.
function googleFalso(puerta, registro) {
  return async function _fetch(url, init) {
    const manual = !!(init && init.redirect === 'manual');
    let u = url, metodo = (init && init.method) || 'GET', cuerpo = (init && init.body) || null;
    for (let salto = 0; salto < 8; salto++) {
      if (registro) registro.push({ url: u, metodo, cuerpo });
      const r = await puerta(u, metodo, cuerpo, init);
      const loc = (r && r.headers && r.headers.get) ? r.headers.get('location') : null;
      if (!(r.status >= 300 && r.status < 400 && loc)) return r;
      if (manual) return r;
      u = new URL(loc, u).toString();
      if (r.status !== 307 && r.status !== 308) { metodo = 'GET'; cuerpo = null; }
    }
    throw new Error('el Google falso giró 8 veces');
  };
}

const BUENA = JSON.stringify({ ok: true, pestana: 'P', filas: [['Nombre', 'Separo']], pestanas: ['P'] });
const SIN_TOKEN = JSON.stringify({ ok: false, codigo: 'SIN_TOKEN', error: 'Este script solo contesta por POST y con token.' });

function cargar(dir) {
  const p = path.join(dir, 'netlify/functions/_lib/cosecha-excel.js');
  delete require.cache[require.resolve(p)];
  return require(p);
}

// El entorno que `leerEnv` necesita, puesto a mano (nunca se lee el .env real).
function conEnv(fn) {
  const a = process.env.EXCEL_SCRIPT_URL, b = process.env.EXCEL_SCRIPT_TOKEN;
  process.env.EXCEL_SCRIPT_URL = EXEC; process.env.EXCEL_SCRIPT_TOKEN = 'tok-secreto';
  try { return fn(); } finally {
    if (a === undefined) delete process.env.EXCEL_SCRIPT_URL; else process.env.EXCEL_SCRIPT_URL = a;
    if (b === undefined) delete process.env.EXCEL_SCRIPT_TOKEN; else process.env.EXCEL_SCRIPT_TOKEN = b;
  }
}

(async () => {
  const base = sacar(BASE);
  const H = cargar(RAIZ), B = cargar(base.dir);
  console.log('\n═══ COSECHA-REDIRECT-1 · el POST que volvía GET ═══');
  console.log('    BASE ' + base.sha.slice(0, 7) + '  ·  HEAD = árbol de trabajo\n');

  // ── [A] LA CADENA SANA · la que se midió 21 de 21 veces ───────────────────
  console.log('  [A] la cadena real: POST /exec → 302 → GET echo → 200');
  for (const [etq, lib] of [['HEAD', H], ['BASE', B]]) {
    const vistos = [];
    const falso = googleFalso(async (url, metodo) => {
      if (url === EXEC && metodo === 'POST') return resp(302, '', ECHO);
      if (url.startsWith('https://script.googleusercontent.com')) return resp(200, BUENA);
      return resp(200, SIN_TOKEN);               // un GET al /exec es `doGet`
    }, vistos);
    const r = await conEnv(() => lib.cosechar({ pestana: 'P' }, falso));
    af(r.ok === true, '[A] ' + etq + ' cosecha bien la cadena sana (codigo=' + r.codigo + ')');
    af(vistos.length === 2, '[A] ' + etq + ' da los DOS saltos medidos: ' + vistos.length);
    af(vistos[0].metodo === 'POST' && vistos[0].url === EXEC, '[A] ' + etq + ' sale con POST a /exec');
    af(/tok-secreto/.test(String(vistos[0].cuerpo || '')), '[A] ' + etq + ' el cuerpo lleva el token');
    af(vistos[1].metodo === 'GET' && vistos[1].url.startsWith('https://script.googleusercontent.com'),
       '[A] ' + etq + ' va al echo con GET — es lo correcto y es lo medido');
    if (etq === 'HEAD') af(r.intentos === 1, '[A] HEAD dice que fue de primera (intentos=1): ' + r.intentos);
  }

  // ── [B] 🔒 CONTROL POSITIVO · el Location que vuelve al /exec ─────────────
  console.log('\n  [B] 🔒 la mordida: el 302 apunta OTRA VEZ al /exec');
  for (const [etq, lib] of [['HEAD', H], ['BASE', B]]) {
    const vistos = [];
    let visitas = 0;
    const falso = googleFalso(async (url, metodo) => {
      const esPuerta = url.indexOf('/exec') !== -1;
      // La puerta: al PRIMER POST le contesta un 302 que vuelve a ELLA MISMA.
      if (esPuerta && metodo === 'POST' && ++visitas === 1) return resp(302, '', EXEC + '?eso=1');
      if (esPuerta && metodo === 'POST') return resp(200, BUENA);
      return resp(200, SIN_TOKEN);               // 🔒 un GET aquí ES `doGet`
    }, vistos);
    const r = await conEnv(() => lib.cosechar({ pestana: 'P' }, falso));
    if (etq === 'BASE') {
      // 🔒 EL CONTROL: sin esto, «HEAD lo arregla» no se midió.
      af(r.ok === false && r.codigo === 'SIN_TOKEN',
         '[B] 🔒 BASE SÍ falla, y falla con el código de Jane: ' + r.codigo + ' (ok=' + r.ok + ')');
      af(/solo contesta por POST/.test(String(r.mensaje || '')),
         '[B] 🔒 BASE trae el mensaje EXACTO que Jane vio en pantalla');
      af(vistos.length === 2 && vistos[1].metodo === 'GET' && vistos[1].url.indexOf('/exec') !== -1,
         '[B] 🔒 y se ve POR QUÉ: BASE le hace GET al /exec — ' + JSON.stringify(vistos.map((v) => v.metodo)));
    } else {
      af(r.ok === true, '[B] HEAD sí cosecha (ok=' + r.ok + ' codigo=' + r.codigo + ')');
      af(vistos.length === 2 && vistos[1].metodo === 'POST',
         '[B] HEAD vuelve a la misma puerta con POST, no con GET: ' + JSON.stringify(vistos.map((v) => v.metodo)));
      af(/tok-secreto/.test(String(vistos[1].cuerpo || '')), '[B] y el re-POST lleva el cuerpo con token');
      af(vistos.every((v) => v.metodo !== 'GET' || v.url.indexOf('/exec') === -1),
         '[B] 🔒 HEAD JAMÁS le hace GET al /exec (que es lo que ejecuta doGet)');
      af(r.intentos === 1, '[B] 🔒 y lo arregló SIN reintentar (intentos=' + r.intentos + '): la cura es la cadena, no la insistencia');
    }
  }

  // ── [C] la respuesta SIN headers · la forma de los OTROS arneses ──────────
  console.log('\n  [C] una respuesta sin `headers` sigue sirviendo (los demás careos)');
  {
    const falso = async () => respPelada(BUENA);
    const r = await conEnv(() => H.cosechar({ pestana: 'P' }, falso));
    af(r.ok === true, '[C] HEAD la trata como FINAL en vez de tronar: ok=' + r.ok + ' codigo=' + r.codigo);
  }

  // ── [D] lo que NO se reintenta, porque insistir no lo arregla ─────────────
  console.log('\n  [D] TOKEN_INVALIDO y PESTANA_NO_EXISTE: UN solo intento');
  for (const caso of [
    { cod: 'TOKEN_INVALIDO', cuerpo: { ok: false, codigo: 'TOKEN_INVALIDO', error: 'Token incorrecto' } },
    { cod: 'PESTANA_NO_EXISTE', cuerpo: { ok: false, codigo: 'PESTANA_NO_EXISTE', error: 'no existe', pestanas: ['A'] } },
  ]) {
    let n = 0;
    const falso = async () => { n++; return resp(200, JSON.stringify(caso.cuerpo)); };
    const r = await conEnv(() => H.cosechar({ pestana: 'P' }, falso));
    af(r.codigo === caso.cod, '[D] ' + caso.cod + ' sale con su código: ' + r.codigo);
    af(n === 1, '[D] ' + caso.cod + ' NO se reintenta (peticiones=' + n + ')');
    af(r.intentos === 1, '[D] ' + caso.cod + ' lo dice: intentos=' + r.intentos);
    af(!/Se reintentó/.test(String(r.mensaje || '')), '[D] ' + caso.cod + ' el mensaje no presume reintentos');
  }
  {
    // SIN_ENCABEZADO tampoco: se arregla en la hoja, no insistiendo.
    let n = 0;
    const falso = async () => { n++; return resp(200, JSON.stringify({ ok: true, filas: [['Zona', 'Precio']], pestanas: ['P'] })); };
    const r = await conEnv(() => H.cosechar({ pestana: 'P' }, falso));
    af(r.codigo === 'SIN_ENCABEZADO' && n === 1, '[D] SIN_ENCABEZADO: un intento y su código (' + r.codigo + ', n=' + n + ')');
  }

  // ── [E] lo que SÍ se reintenta, y gana en el segundo ─────────────────────
  console.log('\n  [E] SIN_TOKEN se reintenta y se recupera · 🔒 BASE no reintenta');
  for (const [etq, lib] of [['HEAD', H], ['BASE', B]]) {
    let n = 0;
    const falso = async (url, init) => {
      // Solo la PRIMERA petición POST a la puerta cuenta como intento.
      if ((init.method || 'GET') === 'POST') n++;
      return resp(200, n === 1 ? SIN_TOKEN : BUENA);
    };
    const t0 = Date.now();
    const r = await conEnv(() => lib.cosechar({ pestana: 'P' }, falso));
    const ms = Date.now() - t0;
    if (etq === 'BASE') {
      af(r.ok === false && n === 1, '[E] 🔒 BASE se rinde al primer SIN_TOKEN (ok=' + r.ok + ', intentos reales=' + n + ')');
    } else {
      af(r.ok === true, '[E] HEAD se recupera: ok=' + r.ok);
      af(n === 2, '[E] HEAD hizo exactamente DOS intentos: ' + n);
      af(r.intentos === 2, '[E] y el resultado lo DICE (intentos=' + r.intentos + ') — un éxito reintentado no se ve igual');
      af(ms >= H.MS_PAUSA, '[E] hubo pausa de verdad entre los dos: ' + ms + 'ms ≥ ' + H.MS_PAUSA);
    }
  }
  {
    // La tercera cara: NO_ES_JSON (la PÁGINA) también se reintenta.
    let n = 0;
    const falso = async (url, init) => { if ((init.method || 'GET') === 'POST') n++; return resp(200, n === 1 ? '<!doctype html><html><head>' : BUENA); };
    const r = await conEnv(() => H.cosechar({ pestana: 'P' }, falso));
    af(r.ok === true && n === 2, '[E] NO_ES_JSON (la PÁGINA) también se recupera: ok=' + r.ok + ' n=' + n);
  }
  {
    // Y si NO se recupera, se dice que se insistió.
    let n = 0;
    const falso = async (url, init) => { if ((init.method || 'GET') === 'POST') n++; return resp(200, SIN_TOKEN); };
    const r = await conEnv(() => H.cosechar({ pestana: 'P' }, falso));
    af(r.ok === false && n === H.INTENTOS_MAX, '[E] dos intentos y no más: n=' + n + ' (tope=' + H.INTENTOS_MAX + ')');
    af(/Se reintentó 2 veces/.test(String(r.mensaje || '')), '[E] el mensaje dice que se insistió: «' + String(r.mensaje || '').slice(-60) + '»');
  }

  // ── [F] 🔒 EL 504 · un Google colgado ya no se come los 10 s de Netlify ──
  console.log('\n  [F] 🔒 Google colgado: HEAD corta con su reloj · BASE no corta');
  {
    const colgado = async (url, init) => new Promise((res, rej) => {
      if (init && init.signal) {
        if (init.signal.aborted) { const e = new Error('abortado'); e.name = 'AbortError'; return rej(e); }
        init.signal.addEventListener('abort', () => { const e = new Error('abortado'); e.name = 'AbortError'; rej(e); });
      }
      // Sin señal NO se resuelve nunca: es exactamente el 504 de Netlify.
    });
    const t0 = Date.now();
    const r = await conEnv(() => H.cosechar({ pestana: 'P' }, colgado));
    const ms = Date.now() - t0;
    af(r.ok === false && r.codigo === 'SIN_RESPUESTA', '[F] HEAD devuelve SIN_RESPUESTA en vez de colgarse: ' + r.codigo);
    af(/colgado o saturado/.test(String(r.mensaje || '')), '[F] y el mensaje NO manda a revisar el despliegue: «' + String(r.mensaje || '').slice(0, 70) + '»');
    af(ms <= H.MS_PRESUPUESTO + 600, '[F] 🔒 todo cupo en el presupuesto (' + ms + 'ms ≤ ' + H.MS_PRESUPUESTO + '+600)');
    af(H.MS_PRESUPUESTO + 600 < 10000, '[F] 🔒 y el presupuesto cabe en los 10 s de Netlify: ' + H.MS_PRESUPUESTO);

    // 🔒 EL CONTROL: BASE no tiene reloj, así que NO contesta. Se corre con un
    // tope para que el arnés no se cuelgue — y se afirma que el tope ganó.
    const carrera = await Promise.race([
      conEnv(() => B.cosechar({ pestana: 'P' }, colgado)).then(() => 'BASE contestó'),
      new Promise((res) => setTimeout(() => res('BASE SIGUE COLGADO'), H.MS_PRESUPUESTO + 900)),
    ]);
    af(carrera === 'BASE SIGUE COLGADO',
       '[F] 🔒 BASE se cuelga sin tope — así se comía los 10 s y daba el 504 pelón: ' + carrera);
  }

  // ── [G] la cadena que gira en redondo no gira para siempre ───────────────
  console.log('\n  [G] /exec → /exec para siempre: se corta diciéndolo');
  {
    let n = 0;
    const falso = async () => { n++; return resp(302, '', EXEC + '?v=' + n); };
    const r = await conEnv(() => H.cosechar({ pestana: 'P' }, falso));
    af(r.ok === false, '[G] no devuelve éxito: ok=' + r.ok);
    af(/giraba en redondo/.test(String(r.mensaje || '')), '[G] y lo DICE: «' + String(r.mensaje || '').slice(0, 60) + '»');
    af(n <= H.MAX_SALTOS * H.INTENTOS_MAX, '[G] 🔒 acotado (' + n + ' ≤ ' + (H.MAX_SALTOS * H.INTENTOS_MAX) + '): no gira en vacío');
  }

  // ── [H] la lista de transitorios del navegador ────────────────────────────
  console.log('\n  [H] `_KH_CAREO_TRANSITORIOS` en kamehouse.js');
  {
    const lista = (src) => {
      const m = src.match(/_KH_CAREO_TRANSITORIOS\s*=\s*\[([^\]]*)\]/);
      return m ? m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean) : null;
    };
    const lH = lista(fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8'));
    const lB = lista(fs.readFileSync(path.join(base.dir, 'kamehouse.js'), 'utf8'));
    af(lH && lH.includes('SIN_TOKEN'), '[H] HEAD reintenta SIN_TOKEN: [' + (lH || []).join(', ') + ']');
    af(lB && !lB.includes('SIN_TOKEN'), '[H] 🔒 BASE NO lo reintentaba: [' + (lB || []).join(', ') + ']');
    af(lH && lH.includes('NO_ES_JSON') && lH.includes('SIN_RESPUESTA'), '[H] y los dos de antes siguen');
    af(lH && !lH.includes('TOKEN_INVALIDO') && !lH.includes('SIN_CONFIG'),
       '[H] 🔒 pero NO se cuela lo que se arregla desplegando');
    // 🔒 Las dos listas son UNA sola verdad: la del navegador no puede reintentar
    // menos que la del servidor, o el código que el servidor da por recuperable
    // moriría en el botón.
    af(lH && H.TRANSITORIOS.every((c) => lH.includes(c)),
       '[H] 🔒 la lista del navegador CONTIENE la del servidor: [' + H.TRANSITORIOS.join(', ') + ']');
  }

  // ── [I] el invariante que vuelve transitorio al SIN_TOKEN ─────────────────
  console.log('\n  [I] 🔒 ningún camino de `cosechar` manda un cuerpo sin token');
  {
    const cuerpos = [];
    const falso = async (url, init) => { if (init.body != null) cuerpos.push(init.body); return resp(200, BUENA); };
    for (const p of ['', 'P', 'Boletos']) await conEnv(() => H.cosechar({ pestana: p }, falso));
    af(cuerpos.length === 3, '[I] se midieron los 3 caminos (catálogo, pestaña, libro): ' + cuerpos.length);
    af(cuerpos.every((c) => { try { return !!JSON.parse(c).token; } catch (e) { return false; } }),
       '[I] 🔒 TODOS llevan token → el SIN_TOKEN del script NO puede ser nuestra configuración');
    // Y sin env var NO se llega a pegarle: sale SIN_CONFIG, otro código.
    const g = process.env.EXCEL_SCRIPT_TOKEN; delete process.env.EXCEL_SCRIPT_TOKEN;
    process.env.EXCEL_SCRIPT_URL = EXEC;
    let n = 0;
    const r = await H.cosechar({ pestana: 'P' }, async () => { n++; return resp(200, BUENA); });
    if (g === undefined) delete process.env.EXCEL_SCRIPT_TOKEN; else process.env.EXCEL_SCRIPT_TOKEN = g;
    af(r.codigo === 'SIN_CONFIG' && n === 0,
       '[I] 🔒 sin token en Netlify sale SIN_CONFIG y NI SE PEGA (codigo=' + r.codigo + ', peticiones=' + n + ')');
  }

  // ── [J] las constantes son medidas, no inventadas ─────────────────────────
  console.log('\n  [J] las constantes, contra lo medido el 3-oct (1,560–2,264 ms · un frío >4.5 s)');
  af(H.MS_MINIMO_OTRO >= 1560, '[J] no se reintenta con menos de lo que tarda la cosecha más rápida: ' + H.MS_MINIMO_OTRO);
  af(H.MS_PRESUPUESTO + 2000 <= 10000, '[J] el presupuesto deja ≥2 s para base y cuentas: ' + H.MS_PRESUPUESTO);
  af(H.MS_POR_INTENTO === undefined,
     '[J] 🔴 ya NO hay rebanada fija por intento: la partió el arranque en frío que midió >4.5 s');
  // 🔴 CONTROL DE LA REGRESIÓN QUE YO INTRODUJE: una cosecha LENTA pero buena
  // —5 s, por debajo del presupuesto— tiene que SALIR BIEN. Con la rebanada de
  // 4.5 s esto fallaba, y fallaba inventando un «Google colgado».
  {
    let n = 0;
    const lento = async (url, init) => {
      n++;
      return new Promise((res, rej) => {
        const t = setTimeout(() => res(resp(200, BUENA)), 5000);
        if (init && init.signal) init.signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('abortado'); e.name = 'AbortError'; rej(e); });
      });
    };
    const t0 = Date.now();
    const r = await conEnv(() => H.cosechar({ pestana: 'P' }, lento));
    af(r.ok === true, '[J] 🔴 una cosecha de 5 s (lenta, no colgada) SÍ sale bien: ok=' + r.ok + ' codigo=' + r.codigo);
    af(n === 1, '[J] y con UN intento, sin quemar el presupuesto en reintentos: ' + n);
    af(Date.now() - t0 < H.MS_PRESUPUESTO + 400, '[J] dentro del presupuesto: ' + (Date.now() - t0) + 'ms');
  }

  completo = true;
  marcador();
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.log('\n💥 ' + e.stack); marcador(); process.exit(1); });
