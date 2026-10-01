#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-careo-retry-1.js — CAREO-RETRY-1 · el botón aguanta a un Google lento
//
// Medido el 28-sep en una corrida real de 71 eventos: 29 cosechas rebotadas
// por Google («una PÁGINA», «solo POST») y 7 tandas en 504 — y los 29 se
// recuperaron reintentando EN SERIE. El botón, en cambio, tronaba a la
// primera: 29 rojos de nada.
//
// Lo que esta tuerca mete, y este careo mide:
//   · UN dueño (`khExcelRecorrer` en kamehouse.js) — el bucle vivía dos veces;
//   · la tanda se ENCOGE ante un 5xx (10→5→2) reintentando el MISMO desde;
//   · los errores TRANSITORIOS de cosecha se reintentan uno a uno al final;
//   · un 4xx real NO se reintenta; SIN_MAPEO tampoco.
//
// 🔒 El dueño se EXTRAE del kamehouse.js del commit (por balance de llaves) y
//    se ejecuta con un khAdminFetch falso que GUARDA cada petición: las
//    aserciones son sobre la SECUENCIA {desde,tanda} real, no sobre el texto.
// 🔒 Control positivo: el bucle de BASE truena al primer 504.
//
// Se corre:  npm run mide:careo-retry-1
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const vm = require('vm');
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
  fallos.slice(0, 16).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' kamehouse.js kamehouse-eventos.js kamehouse-resumen.js | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
// 🔒 Re-anclado tras mergear (la ley del ancla).
const BASE = process.env.BASE || 'e7a7494';        // el merge de ITIN-NOBUS-1
const HEAD_SHA = process.env.HEAD_SHA || 'cd4fc96'; // el merge de esta tuerca
// 🔒 [CAREO-RED-1] UNA SEGUNDA BASE, por lo mismo que en careo-zona-1b: el
// BASE de arriba es ANTERIOR a `khExcelRecorrer` — ahí la función no existe, así
// que no puede servir de control para una tuerca que la cambia. El control de
// esta chiquita necesita el árbol que SÍ la tiene y TODAVÍA no atrapa la
// excepción: el último main antes de CAREO-RED-1.
const BASE_RED = process.env.BASE_RED || 'af63cb0';

// Corta una función por NOMBRE CON PARÉNTESIS y balance de llaves.
function funcionDe(src, nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  // ⚠️ EL `async` VA ADELANTE del ancla y el indexOf se lo comía: la rebanada
  // salía como función SIN async y el vm tronaba en el primer await. El
  // prefijo se re-mira hacia atrás en vez de suponerse.
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return null;
}
// Arma un contexto con el dueño extraído + un khAdminFetch falso que sigue un
// GUION: cada entrada dice qué contestar; se guarda cada petición tal cual.
function armar(fnSrc, extras, guion) {
  const peticiones = [];
  let g = 0;
  const ctx = vm.createContext({
    JSON, Math, Promise, Error, Array, Object, String, Number,
    setTimeout: (f) => f(),                 // sin esperas reales en el arnés
    khAdminFetch: async (url, opts) => {
      const cuerpo = JSON.parse((opts && opts.body) || '{}');
      peticiones.push({ url: String(url).replace(/^.*functions\//, ''), ...cuerpo });
      const paso = guion[Math.min(g++, guion.length - 1)];
      const r = typeof paso === 'function' ? paso(cuerpo) : paso;
      // 🔒 [CAREO-RED-1] UN PASO PUEDE **REVENTAR**, no solo contestar mal. Sin
      // esto el arnés no podía ni expresar el defecto: un `fetch` que lanza no
      // tiene `status`, y un guión que solo sabe devolver status mide únicamente
      // la mitad del mundo. ⚠️ La petición se APUNTA ANTES de lanzar: lo que se
      // quiere afirmar es que el intento se hizo con el MISMO `desde`.
      if (r && r.revienta) throw new Error(r.revienta);
      return { ok: r.status === 200, status: r.status, json: async () => (r.d || {}) };
    },
  });
  vm.runInContext((extras || '') + '\n' + fnSrc, ctx);
  return { ctx, peticiones };
}
const t200 = (d) => ({ status: 200, d: { ok: true, ...d } });

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'cr-base'), h = sacar(HEAD_SHA, 'cr-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }
  const khH = fs.readFileSync(path.join(h.dir, 'kamehouse.js'), 'utf8');
  const evH = fs.readFileSync(path.join(h.dir, 'kamehouse-eventos.js'), 'utf8');
  const reH = fs.readFileSync(path.join(h.dir, 'kamehouse-resumen.js'), 'utf8');
  const khB = fs.readFileSync(path.join(b.dir, 'kamehouse.js'), 'utf8');
  const evB = fs.readFileSync(path.join(b.dir, 'kamehouse-eventos.js'), 'utf8');
  const fnH = funcionDe(khH, 'khExcelRecorrer');
  const esperar = 'function _khEsperar(){return Promise.resolve();}\nconst _KH_CAREO_TRANSITORIOS=' +
    (khH.match(/_KH_CAREO_TRANSITORIOS\s*=\s*(\[[^\]]*\])/) || [, "['NO_ES_JSON','SIN_RESPUESTA']"])[1] + ';';

  // ── [D] UN SOLO DUEÑO, y los dos módulos le piden ───────────────────────
  console.log('[D] el dueño único');
  af(!!fnH, 'khExcelRecorrer existe en kamehouse.js');
  af(!funcionDe(khB, 'khExcelRecorrer'), 'y en BASE no existía');
  const cuenta = (s) => (s.match(/admin-excel-actualizar-todo/g) || []).length;
  af(cuenta(evH) === 0 && cuenta(reH) === 0, 'los módulos ya NO llevan su propio bucle (0 fetch del endpoint en cada uno)');
  af(cuenta(khH) === 1, 'el endpoint se pide en UN solo sitio del dueño');
  af(/khExcelRecorrer\(confirmar, alAvanzar\)/.test(evH) && /khExcelRecorrer\(confirmar, alAvanzar\)/.test(reH),
     'los dos nombres viejos DELEGAN (sus llamadores no se enteraron)');
  af(cuenta(evB) === 1, 'BASE-eventos sí llevaba el suyo — el gemelo que esta tuerca funde');

  // ── [F] EL CAMINO FELIZ, intacto ────────────────────────────────────────
  console.log('[F] dos tandas limpias');
  {
    const { ctx, peticiones } = armar(fnH, esperar, [
      t200({ eventos: [{ evento_id: 'a', plan: {} }], total: 2, hecho: false, siguiente: 10 }),
      t200({ eventos: [{ evento_id: 'b', plan: {} }], total: 2, hecho: true, siguiente: 20 }),
    ]);
    const avances = [];
    const r = await vm.runInContext('khExcelRecorrer', ctx)(false, (n, t) => avances.push(n + '/' + t));
    af(r.eventos.length === 2 && r.total === 2, 'dos tandas → dos eventos, sin perder ni duplicar');
    af(JSON.stringify(peticiones.map((p) => [p.desde, p.tanda])) === '[[0,10],[10,10]]',
       'la secuencia {desde,tanda} es la de siempre: ' + JSON.stringify(peticiones.map((p) => [p.desde, p.tanda])));
    af(avances.length >= 2, 'la barra avanzó');
  }

  // ── [T] EL 5xx ENCOGE LA TANDA, mismo desde ─────────────────────────────
  console.log('[T] la tanda se encoge ante el 504');
  {
    const { ctx, peticiones } = armar(fnH, esperar, [
      { status: 504, d: {} },
      { status: 504, d: {} },
      t200({ eventos: [{ evento_id: 'a', plan: {} }], total: 1, hecho: true, siguiente: 2 }),
    ]);
    const r = await vm.runInContext('khExcelRecorrer', ctx)(false, null);
    af(r.eventos.length === 1, 'el recorrido TERMINA a pesar de dos 504');
    af(JSON.stringify(peticiones.map((p) => [p.desde, p.tanda])) === '[[0,10],[0,5],[0,2]]',
       '10 → 5 → 2, siempre el MISMO desde (nada se salta): ' + JSON.stringify(peticiones.map((p) => [p.desde, p.tanda])));
  }

  // ── [X] EL 4xx REAL NO SE REINTENTA ─────────────────────────────────────
  console.log('[X] un 400 es un 400');
  {
    const { ctx, peticiones } = armar(fnH, esperar, [{ status: 400, d: { error: 'algo real' } }]);
    let e = null;
    try { await vm.runInContext('khExcelRecorrer', ctx)(false, null); } catch (x) { e = x; }
    af(e && /algo real/.test(e.message) && peticiones.length === 1, 'truena a la primera, con el texto del servidor');
  }

  // ── [R] LOS TRANSITORIOS SE REINTENTAN; SIN_MAPEO NO ────────────────────
  console.log('[R] el reintento en serie, selectivo');
  {
    const { ctx, peticiones } = armar(fnH, esperar, [
      t200({ eventos: [
        { evento_id: 'bueno', plan: { abonos: [] } },
        { evento_id: 'google', nombre: 'G', error: { codigo: 'NO_ES_JSON', mensaje: 'una página' } },
        { evento_id: 'huerfano', error: { codigo: 'SIN_MAPEO', mensaje: 'sin pestaña' } },
      ], total: 3, hecho: true, siguiente: 3 }),
      // el reintento del transitorio, por la puerta de UN evento:
      t200({ plan: { abonos: [{ nombre: 'Ana', monto: 100 }] } }),
    ]);
    const r = await vm.runInContext('khExcelRecorrer', ctx)(false, null);
    const retry = peticiones.filter((p) => /admin-excel-aplicar/.test(p.url));
    af(retry.length === 1 && retry[0].evento_id === 'google' && retry[0].confirmar === undefined,
       'SOLO el transitorio se reintenta, por admin-excel-aplicar y sin confirmar: ' + JSON.stringify(retry));
    const g = r.eventos.find((x) => x.evento_id === 'google');
    af(g && !g.error && g.plan && g.reintentado === true, 'el reintentado REEMPLAZA su error por su plan, rotulado');
    const hu = r.eventos.find((x) => x.evento_id === 'huerfano');
    af(hu && hu.error && hu.error.codigo === 'SIN_MAPEO', 'el SIN_MAPEO se queda dicho — reintentarlo sería ruido');
  }

  // ── [C] CON confirmar, EL REINTENTO TAMBIÉN CONFIRMA ────────────────────
  console.log('[C] el confirmar viaja al reintento');
  {
    const { ctx, peticiones } = armar(fnH, esperar, [
      t200({ eventos: [{ evento_id: 'g2', error: { codigo: 'SIN_RESPUESTA', mensaje: 'x' } }], total: 1, hecho: true, siguiente: 1 }),
      t200({ plan: { abonos: [] }, resultado: { abonos: [], errores: [] } }),
    ]);
    const r = await vm.runInContext('khExcelRecorrer', ctx)(true, null);
    const retry = peticiones.find((p) => /admin-excel-aplicar/.test(p.url));
    af(retry && retry.confirmar === true, 'confirmar:true viaja: el reintento ESCRIBE por la misma puerta');
    af(r.eventos[0].resultado && !r.eventos[0].error, 'y su resultado entra a la cuenta');
  }

  // ── [I] LA IDEMPOTENCIA DEL REINTENTO, AFIRMADA ─────────────────────────
  // «La idempotencia la da el re-careo»: un abono YA aplicado deja la
  // diferencia en cero y `planear` no lo vuelve a proponer. Se le pregunta al
  // dueño REAL de la aritmética (excel-aplicar del commit), no a una copia.
  console.log('[I] re-aplicar no duplica (el re-careo la da)');
  {
    const ap = require(path.join(RAIZ, 'netlify/functions/_lib/excel-aplicar.js'));
    const careo = { montones: { pagos: [{ nombre: 'Ana', viajero_id: 'v1', excel: 500, base: 500, diferencia: 0 }], totales_contrato: [] },
                    personas: [], viajeros: [{ id: 'v1', nombre: 'Ana' }], chatarraPorZona: {}, ajustes: [] };
    const p = ap.planear(careo, {});
    af(p.abonos.length === 0, 'diferencia 0 → cero abonos nuevos: el segundo confirmar no puede duplicar');
  }

  // ══ [CAREO-RED-1] EL FETCH QUE REVIENTA ════════════════════════
  // ── [E] LA EXCEPCIÓN ENTRA A LA MISMA ESCALERA ───────────────────
  console.log('[E] el fetch revienta dos veces y el recorrido TERMINA');
  {
    const { ctx, peticiones } = armar(fnH, esperar, [
      { revienta: 'Failed to fetch' },
      { revienta: 'Failed to fetch' },
      t200({ eventos: [{ evento_id: 'a', plan: {} }], total: 1, hecho: true, siguiente: 2 }),
    ]);
    const r = await vm.runInContext('khExcelRecorrer', ctx)(false, null);
    const sec = JSON.stringify(peticiones.map((p) => [p.desde, p.tanda]));
    console.log('    {desde,tanda}: ' + sec);
    af(r.eventos.length === 1, 'el recorrido TERMINA a pesar de dos reventones de red');
    // 🔒 LA MISMA SECUENCIA QUE EL 504, literalmente — es lo que significa
    // «misma escalera». Si fuera otra, habría dos escaleras.
    af(sec === '[[0,10],[0,5],[0,2]]',
       '10 → 5 → 2 con el MISMO desde, igual que ante un 504: ' + sec);
  }

  // ── [E2] SI NO PARA, CORTA — Y DICE QUE FUE LA RED Y DÓNDE QUEDÓ ──────
  console.log('[E2] red muerta: corta diciendo de qué murió y dónde');
  {
    // Primero una tanda buena, para que `desde` y `total` NO sean los de
    // arranque: un mensaje que dice «desde el evento 0» cuando siempre diría 0
    // no prueba que diga dónde quedó.
    const { ctx, peticiones } = armar(fnH, esperar, [
      t200({ eventos: [{ evento_id: 'a', plan: {} }], total: 57, hecho: false, siguiente: 10 }),
      { revienta: 'NetworkError: DNS' },
    ]);
    let e = null;
    try { await vm.runInContext('khExcelRecorrer', ctx)(false, null); } catch (x) { e = x; }
    console.log('    mensaje: ' + (e && e.message));
    af(!!e, 'con la red muerta para siempre el recorrido tiene que CORTAR, no girar en vacío');
    af(e && /desde el evento 10 de 57/.test(e.message),
       '🔴 el corte no dice DÓNDE quedó (desde el evento 10 de 57), que es con lo que se retoma: '
       + JSON.stringify(e && e.message));
    af(e && /red/i.test(e.message) && /DNS/.test(e.message),
       '🔴 el corte no dice que fue LA RED ni trae el error original: «el servidor siguió fallando» '
       + 'manda a revisar Google cuando el problema es el wifi. Salió ' + JSON.stringify(e && e.message));
    // Y la escalera se agotó de verdad: 1 buena + 6 reventones, nunca infinito.
    const sec = peticiones.map((p) => [p.desde, p.tanda]);
    console.log('    intentos: ' + JSON.stringify(sec));
    af(sec.length === 7 && sec.slice(1).every((x) => x[0] === 10),
       'la escalera no se agotó como ante un 5xx (1 buena + 6 intentos, todos con el MISMO desde 10): '
       + JSON.stringify(sec));
  }

  // ── [E3] EL REINTENTO EN SERIE: su catch YA contaba el intento ────────
  // ⚠️ El brief pedía VERIFICAR que la cuenta de intentos no se saltara la
  // excepción. Se verificó y **ya estaba bien**: el `catch` vive DENTRO del
  // `for (intento...)`, así que un reventón consume intento y el error original
  // se conserva. No se tocó nada; se le pone aserción para que siga siendo cierto.
  console.log('[E3] el reintento en serie aguanta el reventón (2 intentos, error intacto)');
  {
    const { ctx, peticiones } = armar(fnH, esperar, [
      t200({ eventos: [{ evento_id: 'google', nombre: 'G', error: { codigo: 'NO_ES_JSON', mensaje: 'una página' } }],
             total: 1, hecho: true, siguiente: 1 }),
      { revienta: 'Failed to fetch' },
      { revienta: 'Failed to fetch' },
    ]);
    const r = await vm.runInContext('khExcelRecorrer', ctx)(false, null);
    const retry = peticiones.filter((p) => /admin-excel-aplicar/.test(p.url));
    console.log('    intentos del reintento: ' + retry.length);
    af(retry.length === 2,
       'el reventón del reintento en serie tiene que CONSUMIR intento (2 y para), no saltarse la cuenta '
       + 'ni insistir sin fin. Salió ' + retry.length);
    const g = r.eventos.find((x) => x.evento_id === 'google');
    af(g && g.error && g.error.codigo === 'NO_ES_JSON',
       'el error ORIGINAL se conserva cuando el reintento no pudo: ' + JSON.stringify(g && g.error));
    af(g && g.reintentado !== true, 'y no se rótula como reintentado algo que no se logró');
  }

  // ── [ER] CONTROL POSITIVO DE CAREO-RED-1 · el árbol que SÍ tiene al dueño ─
  // 🔒 El BASE de [B] no sirve: ahí `khExcelRecorrer` no existe. Este entra por
  // `BASE_RED`, el último main antes de esta chiquita.
  console.log('[ER] control positivo · BASE_RED ' + BASE_RED);
  {
    const br = sacar(BASE_RED, 'cr-base-red');
    const khBR = fs.readFileSync(path.join(br.dir, 'kamehouse.js'), 'utf8');
    const fnBR = funcionDe(khBR, 'khExcelRecorrer');
    af(!!fnBR, 'PREMISA: BASE_RED tiene que TRAER khExcelRecorrer, o no es el árbol que creo');
    // Que SÍ aguanta un 504 — así se sabe que lo que falla es el reventón y no el árbol.
    {
      const { ctx } = armar(fnBR, esperar, [
        { status: 504, d: {} },
        t200({ eventos: [{ evento_id: 'a', plan: {} }], total: 1, hecho: true, siguiente: 2 }),
      ]);
      let e = null;
      try { await vm.runInContext('khExcelRecorrer', ctx)(false, null); } catch (x) { e = x; }
      af(!e, 'PREMISA: BASE_RED ya aguantaba el 504 (si tronara, el control de abajo no probaría nada)');
    }
    const { ctx, peticiones } = armar(fnBR, esperar, [
      { revienta: 'Failed to fetch' },
      t200({ eventos: [{ evento_id: 'a', plan: {} }], total: 1, hecho: true, siguiente: 2 }),
    ]);
    let e = null;
    try { await vm.runInContext('khExcelRecorrer', ctx)(false, null); } catch (x) { e = x; }
    console.log('    BASE_RED ante el reventón: ' + (e ? 'se escapa (' + e.message + ')' : 'lo aguanta'));
    af(!!e && /Failed to fetch/.test(e.message),
       'CONTROL POSITIVO: en BASE_RED la excepción tenía que ESCAPARSE del bucle y tirar el recorrido '
       + 'entero — es el defecto que esta chiquita cierra. Si ahí ya lo aguantaba, el verde de [E] no dice nada.');
    af(peticiones.length === 1,
       'y se escapaba al PRIMER reventón, sin usar la escalera: ' + peticiones.length + ' intento(s)');
  }

  // ── [B] EL CONTROL POSITIVO: BASE TRONABA ───────────────────────────────
  console.log('[B] BASE al primer 504');
  {
    const fnB = funcionDe(evB, '_excelTodoRecorrer');
    af(!!fnB, 'el bucle viejo de BASE se encontró');
    const { ctx } = armar(fnB, '', [{ status: 504, d: {} }]);
    let e = null;
    try { await vm.runInContext('_excelTodoRecorrer', ctx)(false, null); } catch (x) { e = x; }
    af(!!e, 'BASE tronaba al PRIMER 504 — los 29 rojos de nada que Memo habría visto');
  }

  completo = true;
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN DEL ARNÉS: ' + e.stack); process.exit(1); });
