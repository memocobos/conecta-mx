#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-chatarra-sello-1.js — CHATARRA-SELLO-1 · «verificada el ⟨fecha⟩»
//
// Autorizada por Memo/Jane (1-oct-2026). El careo estampa el sello en la nota
// del ajuste AUNQUE EL CONTEO NO CAMBIE, porque hoy «la pestaña sigue diciendo
// 2» y «nadie ha vuelto a mirar» se ven exactamente igual: 89 ajustes / 264
// boletos / 57 eventos con fecha anterior a CAREO-ZONA-1 y ninguna forma de
// saber cuáles siguen siendo verdad.
//
// 🔒 ESCRITURA DE **NOTA**, JAMÁS DE BOLETOS. Los dos controles que Jane pidió:
//    · POSITIVO: el sello AVANZA cuando el día cambia (y no se apila).
//    · NEGATIVO: `vendidos_fuera` no se mueve ni un bit entre corridas, y se
//      mide el VALOR del cuerpo del PATCH — no se promete en un comentario.
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
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
const BASE = process.env.BASE || 'd549183';   // el merge de PLAN-CASE-1
const HEAD_SHA = process.env.HEAD_SHA || '3e6d068';   // el commit del MERGE
// El guardián del árbol sucio, copiado de mide:concilia-1 (ahí vive su razón).
const MEDIDOS = ['netlify/functions/_lib/excel-aplicar.js'];
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

// ── EL MUNDO · copiado de la FORMA de soyluna en la base viva ───────────────
const SB = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
const AYER = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });

function mundo(notaBalcon) {
  return {
    montones: { pagos: [], totales_contrato: [] },
    personas: [], viajeros: [],
    // 🔒 La cosecha SÍ ocurrió: sin esto el sello no se pone (un sello sobre una
    // cosecha que no pasó sería una mentira firmada con fecha).
    pestanas: [{ pestana: 'Soy Luna - 21 de Octubre' }],
    ajustes: [
      // Cuadra: la pestaña cuenta 2 y la base tiene 2 → ES el caso del sello.
      { id: 'aj-balcon', zona: 'Balcón', vendidos_fuera: 2, nota: notaBalcon },
      // Cuadra y su nota es de JANE (migración), no del careo: se anexa a la suya.
      { id: 'aj-noche', zona: 'Doritos', vendidos_fuera: 3,
        nota: 'Migrado Excel 28-ago (Jane): 3 boletos vendidos por fuera al costo (Eduardo Ramirez) — sin tour, sin ganancia (dicho por Memo)' },
      // Cuadra con CERO: sellar un cero no dice nada útil.
      { id: 'aj-cero', zona: 'Butaca', vendidos_fuera: 0, nota: null },
      // NO cuadra: va al montón `fuera`, no al de sellos.
      { id: 'aj-cambia', zona: 'VIP', vendidos_fuera: 2, nota: 'Chatarra contada del careo Excel 2026-09-22' },
    ],
    chatarraPorZona: { 'Balcón': 2, 'Doritos': 3, 'VIP': 5 },
  };
}

let ESCRITURAS = [];
function armarRed(baseAjustes) {
  ESCRITURAS = [];
  global.fetch = async (url, opts) => {
    const u = String(url), met = (opts && opts.method) || 'GET';
    if (!u.startsWith(SB)) throw new Error('la red falsa no conoce ese destino: ' + u);
    const tabla = new URL(u).pathname.replace('/rest/v1/', '');
    const cuerpo = (() => { try { return JSON.parse((opts && opts.body) || '{}'); } catch (_) { return null; } })();
    if (met === 'GET') return { ok: true, status: 200, json: async () => [], text: async () => '' };
    ESCRITURAS.push({ met, tabla, url: u, cuerpo });
    // 🔒 LA RED FALSA DEVUELVE LA FILA **COMO QUEDARÍA**, aplicando el cuerpo a
    // la fila guardada. Una red que devolviera el cuerpo tal cual no podría
    // delatar un sello que moviera el conteo — y eso es justo lo que hay que medir.
    const m = /id=eq\.([^&]+)/.exec(u);
    const id = m ? decodeURIComponent(m[1]) : null;
    const fila = (baseAjustes || []).find((a) => a.id === id);
    const vuelta = fila ? { ...fila, ...(cuerpo || {}) } : (cuerpo || {});
    return { ok: true, status: 200, json: async () => [vuelta], text: async () => '' };
  };
}

(async function main() {
  process.on('exit', marcador);
  avisarSiSucio();
  const b = sacar(BASE, 'cs-base'), h = sacar(HEAD_SHA, 'cs-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7));
  console.log('hoy en Reynosa: ' + HOY + '   ·   ayer: ' + AYER + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }
  const apH = require(path.join(h.dir, 'netlify/functions/_lib/excel-aplicar.js'));
  const apB = require(path.join(b.dir, 'netlify/functions/_lib/excel-aplicar.js'));

  // ── [I] EL INSTRUMENTO ────────────────────────────────────────────────
  console.log('[I] el instrumento');
  af(typeof apH.sellarNota === 'function', 'el dueño no exporta `sellarNota`: el arnés mediría una copia');
  af(Array.isArray(apH.MONTONES_APLICABLES ? apH.MONTONES_APLICABLES : null)
     || /'sellos'/.test(fs.readFileSync(path.join(h.dir, 'netlify/functions/_lib/excel-aplicar.js'), 'utf8')),
     'el montón `sellos` no está en MONTONES_APLICABLES: no se podría aplicar');

  // ── [S] EL SELLO SE PROPONE DONDE EL CAREO SE CALLABA ─────────────────
  console.log('\n[S] el sello, donde antes había silencio');
  const pH = apH.planear(mundo('Chatarra contada del careo Excel 2026-09-22'), {});
  const sell = (pH.sellos || []);
  console.log('    sellos: ' + ver(() => sell.map((x) => x.zona)) + '   ·   fuera: ' + ver(() => (pH.fuera || []).map((x) => x.zona)));
  af(sell.length === 2, () => 'tenían que sellarse DOS (Balcón y Doritos, las que cuadran con chatarra>0): ' + ver(() => sell.map((x) => x.zona)));
  af(sell.some((x) => x.zona === 'Balcón') && sell.some((x) => x.zona === 'Doritos'),
     () => 'no son Balcón y Doritos: ' + ver(() => sell.map((x) => x.zona)));
  // 🔒 El cero NO se sella y la que CAMBIA tampoco (ésa ya queda con nota nueva).
  af(!sell.some((x) => x.zona === 'Butaca'), 'se selló un ajuste en CERO: sellar un cero no dice nada útil');
  af(!sell.some((x) => x.zona === 'VIP') && (pH.fuera || []).some((x) => x.zona === 'VIP'),
     () => 'la zona que CAMBIA se selló en vez de ir a `fuera`: ' + ver(() => ({ sellos: sell.map((x) => x.zona), fuera: (pH.fuera || []).map((x) => x.zona) })));

  // ── [P] SE ANEXA, JAMÁS SE PISA ───────────────────────────────────────
  console.log('\n[P] la procedencia sobrevive');
  const bal = sell.find((x) => x.zona === 'Balcón');
  const noche = sell.find((x) => x.zona === 'Doritos');
  console.log('    Balcón  → ' + ver(() => bal.nota));
  console.log('    Doritos → ' + ver(() => noche.nota.slice(0, 72) + '…'));
  af(bal && /Chatarra contada del careo Excel 2026-09-22/.test(bal.nota),
     () => '🔴 la nota ORIGINAL se perdió: la procedencia es un DATO (de qué careo salió este conteo). ' + ver(() => bal && bal.nota));
  af(bal && new RegExp('verificada ' + HOY + '$').test(bal.nota),
     () => 'el sello no quedó al final con la fecha de HOY en Reynosa: ' + ver(() => bal && bal.nota));
  // 🔒 Y la nota de JANE también sobrevive entera, con su nombre dentro.
  af(noche && /Eduardo Ramirez/.test(noche.nota) && /dicho por Memo/.test(noche.nota)
     && new RegExp('verificada ' + HOY + '$').test(noche.nota),
     () => '🔴 se pisó una nota de MIGRACIÓN: lleva el nombre de quien compró por fuera y la palabra de Memo. '
     + ver(() => noche && noche.nota));

  // ── [+] CONTROL POSITIVO · EL SELLO AVANZA cuando cambia el día ───────
  // ⚠️ Y la forma importa: dentro del MISMO día no debe re-escribir (sería una
  // escritura que no cambia nada), y de un día a otro SÍ avanza. Se miden las
  // dos, porque «avanza siempre» y «avanza cuando toca» no son lo mismo.
  console.log('\n[+] control positivo · el sello avanza, y no se apila');
  const pYa = apH.planear(mundo('Chatarra contada del careo Excel 2026-09-22 · verificada ' + HOY), {});
  console.log('    2da corrida el MISMO día → sellos: ' + ver(() => (pYa.sellos || []).map((x) => x.zona)));
  // ⚠️ ESTA ASERCIÓN DECÍA «CERO SELLOS» Y ERA MI FIXTURE EL EQUIVOCADO: `mundo()`
  // solo parametriza la nota de **Balcón**, así que Doritos sigue SIN sellar y el
  // careo —con razón— propone sellarla. Corregida a lo que de verdad hay que
  // exigir, que además es MÁS estricto: la decisión es **por fila**, no global.
  // Balcón (ya sellada hoy) NO vuelve; Doritos (sin sellar) SÍ. Con el «cero»
  // original, un código que dejara de sellar a TODOS habría pasado en verde.
  af(!(pYa.sellos || []).some((x) => x.zona === 'Balcón'),
     () => 'la ya sellada HOY volvió a proponerse: sería una escritura que no cambia nada, ruido en el libro '
     + 'de la base y un renglón falso en el reporte. ' + ver(() => (pYa.sellos || []).map((x) => x.zona)));
  af((pYa.sellos || []).some((x) => x.zona === 'Doritos'),
     () => 'la que NO estaba sellada dejó de proponerse: el sello se decide por FILA, y saltarse las demás '
     + 'porque una ya estaba al día dejaría 264 boletos sin sello para siempre. ' + ver(() => (pYa.sellos || []).map((x) => x.zona)));
  const pAyer = apH.planear(mundo('Chatarra contada del careo Excel 2026-09-22 · verificada ' + AYER), {});
  const avanzado = (pAyer.sellos || []).find((x) => x.zona === 'Balcón');
  console.log('    sellada AYER → ' + ver(() => avanzado && avanzado.nota));
  af(avanzado && new RegExp('verificada ' + HOY + '$').test(avanzado.nota),
     () => '🔴 CONTROL POSITIVO: con el sello de AYER el careo tenía que AVANZARLO a hoy. Si no avanza, el '
     + 'sello no sirve para nada: volvería a ser indistinguible «sigue siendo verdad» de «nadie lo revisó». '
     + ver(() => avanzado && avanzado.nota));
  // 🔒 NO SE APILA: un sello por corrida haría una nota que crece sin fin — esta
  // casa ya pagó eso con las bajas (18 filas con la nota dos veces).
  af(avanzado && (avanzado.nota.match(/verificada/g) || []).length === 1,
     () => '🔴 el sello se APILÓ: la nota crecería sin fin, corrida tras corrida. ' + ver(() => avanzado && avanzado.nota));
  af(avanzado && !avanzado.nota.includes(AYER),
     () => 'el sello viejo no se recortó: ' + ver(() => avanzado && avanzado.nota));
  // Y el sellador puro, interrogado directo (es el dueño de la regla).
  af(apH.sellarNota(null, '2026-10-01') === 'verificada 2026-10-01',
     () => 'una nota vacía no se sella limpia: ' + ver(() => apH.sellarNota(null, '2026-10-01')));
  af(apH.sellarNota('x · verificada 2026-09-01', '2026-10-01') === 'x · verificada 2026-10-01',
     () => 'el sellador no reemplaza el sello viejo: ' + ver(() => apH.sellarNota('x · verificada 2026-09-01', '2026-10-01')));

  // ── [−] CONTROL NEGATIVO · LOS BOLETOS NO SE MUEVEN NI UN BIT ─────────
  // 🔒 Se mide el VALOR del cuerpo del PATCH, no se promete en un comentario:
  // una guarda prometida y no medida es la familia que esta casa ya pagó.
  console.log('\n[−] control negativo · el sello no toca boletos');
  const mundoAyer = mundo('Chatarra contada del careo Excel 2026-09-22 · verificada ' + AYER);
  armarRed(mundoAyer.ajustes);
  const plan2 = apH.planear(mundoAyer, { solo: 'sellos' });
  // ⚠️ `ejecutarPlan` arma `sb` del ENTORNO, no lo recibe — leído de su firma, no
  // supuesto (estuve a punto de inventarle un parámetro `sb` que no existe).
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  const res = await apH.ejecutarPlan({ plan: plan2, eventoId: 'soyluna', quien: 'bulma@x',
    SB_URL: SB, pestanaNombre: 'Soy Luna - 21 de Octubre' });
  const patches = ESCRITURAS.filter((e) => e.tabla === 'stock_ajustes');
  console.log('    PATCH de sello ×' + patches.length + ' · cuerpos: ' + ver(() => patches.map((p) => Object.keys(p.cuerpo))));
  af(patches.length === 2, () => 'no se escribieron los DOS sellos: ' + ver(() => patches.length));
  af(patches.every((p) => JSON.stringify(Object.keys(p.cuerpo).sort()) === '["nota"]'),
     () => '🔴 el cuerpo del PATCH lleva algo MÁS que `nota`. Sellar jamás puede mover un boleto, y un '
     + '`updated_at` ahí cambiaría el significado de esa columna para quien la lea. Salió '
     + ver(() => patches.map((p) => Object.keys(p.cuerpo))));
  af(patches.every((p) => !('vendidos_fuera' in p.cuerpo)),
     'el PATCH del sello nombra `vendidos_fuera`: eso es mover boletos');
  af(patches.every((p) => !('updated_at' in p.cuerpo)),
     'el PATCH del sello nombra `updated_at`: `stock_ajustes` no tiene trigger, así que al NO nombrarla no '
     + 'se mueve — nombrarla cambiaría lo que esa columna significa para la casilla del Palacio');
  af(patches.every((p) => p.met === 'PATCH'),
     () => 'el sello no va por PATCH: un POST duplicaría la fila (UNIQUE en evento_id,zona)');
  // Y el VALOR, careado contra lo que la base devolvió: el conteo IDÉNTICO.
  console.log('    conteos reportados: ' + ver(() => (res.sellos || []).map((x) => x.zona + '=' + x.vendidos_fuera)));
  af((res.sellos || []).length === 2 && (res.errores || []).length === 0,
     () => 'el resultado no reporta los dos sellos sin errores: ' + ver(() => ({ sellos: res.sellos, errores: res.errores })));
  af((res.sellos || []).every((x) => {
       const orig = mundoAyer.ajustes.find((a) => a.zona === x.zona);
       return Number(x.vendidos_fuera) === Number(orig.vendidos_fuera);
     }),
     () => '🔴 CONTROL NEGATIVO: un conteo se movió entre el antes y el después. ' + ver(() => res.sellos));
  // 🔒 Y SI LA BASE DEVOLVIERA UN CONTEO DISTINTO, el careo lo DICE. Se siembra.
  {
    armarRed(mundoAyer.ajustes.map((a) => (a.id === 'aj-balcon' ? { ...a, vendidos_fuera: 99 } : a)));
    const r2 = await apH.ejecutarPlan({ plan: plan2, eventoId: 'soyluna', quien: 'bulma@x',
      SB_URL: SB, pestanaNombre: 'X' });
    const grito = (r2.errores || []).find((e) => e.paso === 'sellos' && /MOVI/.test(e.detalle || ''));
    console.log('    con la base devolviendo 99 → ' + (grito ? 'lo DICE' : '❌ se lo tragó'));
    af(!!grito,
       '🔴 si la base devuelve un conteo distinto al sellar, el careo tiene que GRITARLO. Un sello que mueve '
       + 'boletos en silencio es el peor defecto posible aquí, porque va firmado con fecha.');
    af(!(r2.sellos || []).some((x) => x.zona === 'Balcón'),
       'la fila cuyo conteo se movió se reportó como sellada igual');
  }

  // ── [B] CONTROL POSITIVO · en BASE el careo se CALLABA ────────────────
  console.log('\n[B] control positivo · BASE');
  const pB = apB.planear(mundo('Chatarra contada del careo Excel 2026-09-22'), {});
  console.log('    BASE → sellos: ' + ver(() => pB.sellos) + '   fuera: ' + ver(() => (pB.fuera || []).map((x) => x.zona)));
  af(pB.sellos === undefined || (pB.sellos || []).length === 0,
     () => 'CONTROL POSITIVO: en BASE no podía existir el montón `sellos` — si ya sellaba, esta tuerca no lo '
     + 'agrega y los verdes de arriba no dicen nada. Salió ' + ver(() => pB.sellos));
  // 🔒 Y BASE sí proponía el cambio de VIP: así se sabe que lo que falta es el
  // sello y no que el fixture no ejercita el careo de chatarra.
  af((pB.fuera || []).some((x) => x.zona === 'VIP'),
     'PREMISA: BASE tenía que proponer el cambio de VIP. Si no, el fixture no ejercita la chatarra y el '
     + 'control de arriba pasa en vacío');

  completo = true;
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN DEL ARNÉS: ' + e.stack); process.exit(1); });
