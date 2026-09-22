#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-rol-monto-mudo.js — ROL-MONTO-MUDO-1 · EL PASO 4 DICE QUÉ LE FALTA
//
// Reporte real de Ximena: dos clientes no podían capturar el monto del separo.
// Se entra POR EL CAMINO DEL CLIENTE —evento → paquete → zona, SIN fecha— en un
// viewport de celular, que es donde están, y se reproduce su captura.
//
// 🔒 LOS DOS LADOS SON COMMITS: cada árbol se saca con `git archive` a su
// directorio y SE SIRVE de ahí, así que el careo no caduca al mergear.
//     BASE = 7cf0021  el main mudo
//     HEAD = 0de8bec  el letrero derivado
//
// 🔒 «EXISTE» NO ES «SE VE»: cada pieza se mide por su CADENA de visibilidad
// —`display`, `visibility`, `opacity`, `offsetParent` y su caja—, no por estar
// en el DOM. En móvil `@media(max-width:600px)` esconde los pasos `.locked` y
// `.done`, así que preguntar al DOM aquí miente por diseño.
//
// Se corre:  npm run mide:rol-mudo
// ══════════════════════════════════════════════════════════════════════════
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const RAIZ = path.join(__dirname, '..');

let verde = 0, rojo = 0, completo = false;
const fallos = [];
function af(cond, msg) {
  let ok = false;
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; }
  catch (e) { ok = false; msg = msg + '  [EXCEPCIÓN: ' + e.message + ']'; }
  if (ok) verde++; else { rojo++; fallos.push(msg); console.log('   ✗ ' + msg); }
}
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  console.log((rojo ? '❌ ROJO · ' : '✅ VERDE · ') + verde + ' en verde, ' + rojo + ' en rojo');
  fallos.slice(0, 12).forEach((f) => console.log('  · ' + f));
}

function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '7cf0021';
// 🔒 HEAD ANCLADO A UN COMMIT FIJO, no a `HEAD`: con `HEAD` el careo mediría
// siempre el árbol de hoy y dentro de tres tuercas le estaría culpando a ésta
// lo que otros cambien. `a7660f3` es el commit cuyo árbol trae el letrero
// derivado y la regla del regreso.
//   · careo CONGELADO (el default): reproducible, no caduca.
//   · vigilante VIVO: `HEAD_SHA=HEAD npm run mide:rol-mudo`, que remide el
//     árbol de hoy contra el MISMO BASE.
const HEAD_SHA = process.env.HEAD_SHA || 'a7660f3';

// ── La respuesta de `precios-vigentes`, conmutable ───────────────────────
// 🔒 Son formas REALES de la function, no inventos: un precio aplicable (el
// caso bueno) y DOS precios ese día (el caso en que nadie ha elegido y el
// precio se queda en null con la fecha ya puesta).
const PRECIOS = {
  uno:  { ok: true, al_abrir: { precio: 3400, cerrada: false, aplicable: true }, cambios: [],
          sin_historial: false, anterior_al_historial: false, heredado: false },
  dos:  { ok: true, al_abrir: { precio: 3400, cerrada: false, aplicable: true },
          cambios: [{ precio: 3800, cerrada: false, aplicable: true, hora: '12:50' }],
          sin_historial: false, anterior_al_historial: false, heredado: false },
};
let PRECIO = 'uno';
const PEDIDOS = [];

function servidor(raiz) {
  return http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (/precios-vigentes/.test(u)) {
      let cuerpo = '';
      q.on('data', (c) => { cuerpo += c; });
      return q.on('end', () => {
        try { PEDIDOS.push(JSON.parse(cuerpo || '{}')); } catch (_) { PEDIDOS.push({}); }
        r.writeHead(200, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify(PRECIOS[PRECIO]));
      });
    }
    if (/\.netlify\/functions\//.test(u)) {
      let cuerpo = '';
      q.on('data', () => {});
      return q.on('end', () => {
        r.writeHead(200, { 'Content-Type': 'application/json' });
        r.end('{"ok":true}');
      });
    }
    const f = path.join(raiz, decodeURIComponent(u).replace(/^\//, '') || 'rol.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); return r.end('no'); }
      const tipo = /\.js$/.test(f) ? 'text/javascript'
        : /\.css$/.test(f) ? 'text/css'
        : /\.jpe?g$/.test(f) ? 'image/jpeg'
        : /\.webp$/.test(f) ? 'image/webp' : 'text/html; charset=utf-8';
      r.writeHead(200, { 'Content-Type': tipo }); r.end(b);
    });
  });
}

// 🔒 LA CADENA DE VISIBILIDAD, no el DOM.
const MIRA = `(function(){
  function ve(e){
    if(!e) return false;
    if(e.hidden) return false;
    if(e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return false;
    var cs = getComputedStyle(e);
    if(cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < .05) return false;
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  var s4 = document.getElementById('step4');
  var wrap = document.getElementById('sep-monto-wrap');
  var inp = document.getElementById('sep-monto');
  var falta = document.getElementById('sep-falta');
  var txt = document.getElementById('sep-falta-txt');
  var bt = document.getElementById('sep-falta-ir');
  return {
    paso4: { existe: !!s4, ve: ve(s4),
             locked: !!(s4 && s4.classList.contains('locked')),
             done: !!(s4 && s4.classList.contains('done')) },
    input: { existe: !!inp, ve: ve(inp), valor: inp ? inp.value : null, wrapVe: ve(wrap) },
    aviso: { existe: !!falta, ve: ve(falta),
             txt: txt ? (txt.textContent || '').trim() : null,
             bt: bt ? (bt.textContent || '').trim() : null, btVe: ve(bt) },
    // 🔒 TODO el texto que el cliente LEE en el paso 4, para poder afirmar que
    // hoy no hay NINGUNA palabra que explique nada.
    leible: s4 ? (s4.innerText || '').replace(/\\s+/g, ' ').trim() : null,
    btnCalc: (function(){ var b = document.getElementById('btn-calc');
      return { ve: ve(b), disabled: !!(b && b.disabled) }; })(),
    ancho: innerWidth,
  };
})()`;

// ── El camino del CLIENTE, como lo hace él ───────────────────────────────
// 🔒 No se fabrica el `state` a mano: se CLICA. Armar el estado desde afuera da
// el resultado correcto por la razón equivocada — ya mordió en esta casa.
async function caminoCliente(pg, conFecha) {
  // 🔒 SE ENTRA POR LA PUERTA DEL CLIENTE, no fabricando el estado: la página
  // nace en ONBOARDING (pide el nombre) y de ahí va al HOME, y solo «+ tour»
  // abre el wizard. Saltarse esto dejaba el paso 2 BLOQUEADO —y en móvil los
  // pasos bloqueados van `display:none`—, así que el botón del paquete no
  // existía para el clic: el arnés se caía midiendo una pantalla que ningún
  // cliente ve.
  // ⚠️ NO con un selector de tres: Playwright espera a que el PRIMERO sea
  // visible, y en la segunda página el onboarding ya está oculto (el nombre
  // quedó en `localStorage` del contexto). Se espera a que CUALQUIERA de las
  // tres vistas esté a la vista.
  await pg.waitForFunction(() => ['onboarding', 'home', 'wizard-shell'].some((id) => {
    const e = document.getElementById(id);
    return !!e && getComputedStyle(e).display !== 'none';
  }), null, { timeout: 25000 });
  const enOnboarding = await pg.evaluate(() => {
    const o = document.getElementById('onboarding');
    return !!o && getComputedStyle(o).display !== 'none';
  });
  if (enOnboarding) {
    await pg.fill('#name-in', 'Ximena');
    await pg.click('#btn-name');
    await pg.waitForTimeout(400);
  }
  const enHome = await pg.evaluate(() => {
    const h = document.getElementById('home');
    return !!h && getComputedStyle(h).display !== 'none';
  });
  if (enHome) {
    await pg.click('#btn-add-tour');
    await pg.waitForTimeout(400);
  }
  await pg.waitForFunction(
    () => document.querySelectorAll('#ev-list .ev-item').length > 0, null, { timeout: 25000 });
  const n = await pg.evaluate(() => document.querySelectorAll('#ev-list .ev-item').length);
  // Se prueba evento por evento hasta dar con uno que tenga CHEAP con zonas:
  // el CHEAP es el camino más corto (sin habitación ni transporte) y es el que
  // abre el paso 4 en cuanto se elige la zona.
  for (let i = 0; i < n; i++) {
    await pg.evaluate((k) => document.querySelectorAll('#ev-list .ev-item')[k].click(), i);
    await pg.waitForTimeout(220);
    const cheapOk = await pg.evaluate(() => {
      const b = document.querySelector('#pkg-grid .pkg[data-p="cheap"]');
      return !!b && !b.disabled;
    });
    if (!cheapOk) continue;
    await pg.click('#pkg-grid .pkg[data-p="cheap"]');
    await pg.waitForTimeout(220);
    const zonas = await pg.evaluate(() =>
      [].slice.call(document.querySelectorAll('#zona-select option'))
        .filter((o) => o.value).map((o) => o.value));
    if (!zonas.length) continue;
    await pg.selectOption('#zona-select', zonas[0]);
    await pg.waitForTimeout(260);
    await pg.evaluate(() => {
      const s = document.getElementById('zona-select');
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await pg.waitForTimeout(900);
    // 🔴 LA FECHA VA DESPUÉS DE LA ZONA, Y NO ES UN DETALLE DEL ARNÉS:
    // `#sep-date-wrap` nace `display:none` y solo aparece al elegir la zona.
    // O sea que el cliente no puede poner la fecha antes — y en CHEAP, elegir
    // la zona dispara `setStep(4)`, que en móvil manda el paso 3 a
    // `display:none` y se lleva el campo que acababa de aparecer. Ponerla
    // antes reventaba el arnés («element is not visible») y era el arnés
    // diciendo la verdad sobre la pantalla.
    if (conFecha) {
      const veFecha = await pg.evaluate(() => {
        const w = document.getElementById('sep-date-wrap');
        return !!w && getComputedStyle(w).display !== 'none' && w.offsetParent !== null;
      });
      if (!veFecha) {
        // 🔒 SE VUELVE POR LA PUERTA QUE LE OFRECE LA PANTALLA, apretando el
        // botón del aviso — no llamando a `setStep` desde afuera. Eso último
        // dejaba la página en el paso 3 y ponía el careo en rojo por su propio
        // atajo (y de paso destapó que el regreso automático debía dispararse
        // con el dato que se fue a buscar, no con «ya no falta nada»).
        await pg.click('#sep-falta-ir');
        await pg.waitForTimeout(700);
      }
      await pg.fill('#sep-date', '2026-09-20');
      await pg.dispatchEvent('#sep-date', 'change');
      await pg.waitForTimeout(1500);
    }
    return { evento: i, zona: zonas[0] };
  }
  return null;
}

(async () => {
  console.log('\n── LOS DOS LADOS, LOS DOS COMMITS ──');
  let base = null, head = null;
  try { base = sacar(BASE, 'rm-base'); } catch (e) { console.error(e.message); }
  try { head = sacar(HEAD_SHA, 'rm-head'); } catch (e) { console.error(e.message); }
  af(!!base && !!head, '🔴 no se pudieron extraer los dos árboles');
  if (!base || !head) { marcador(); process.exit(1); }
  console.log('   BASE = ' + base.sha.slice(0, 9) + '  (el main mudo)');
  console.log('   HEAD = ' + head.sha.slice(0, 9));
  af(base.sha !== head.sha, '🔴 BASE y HEAD son el MISMO commit');

  const sB = servidor(base.dir), sH = servidor(head.dir);
  await new Promise((ok) => sB.listen(0, '127.0.0.1', ok));
  await new Promise((ok) => sH.listen(0, '127.0.0.1', ok));
  const pB = sB.address().port, pH = sH.address().port;
  const nav = await chromium.launch();
  // 📱 EL VIEWPORT DE UN CELULAR, que es donde está el cliente de Ximena — y
  // donde `@media(max-width:600px)` cambia qué pasos se ven.
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });

  // ── A · LA CAPTURA DE XIMENA: zona elegida, SIN fecha ───────────────────
  for (const [etiqueta, puerto, esHead] of [['HEAD', pH, true], ['BASE', pB, false]]) {
    console.log('\n── A · ' + etiqueta + ' · evento → CHEAP → zona, SIN fecha ──');
    PRECIO = 'uno'; PEDIDOS.length = 0;
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://127.0.0.1:' + puerto + '/rol.html', { waitUntil: 'load' });
    const rec = await caminoCliente(pg, false);
    af(!!rec, '🔴 ' + etiqueta + ': no se pudo recorrer el camino del cliente (evento/CHEAP/zona)');
    if (rec) {
      const v = await pg.evaluate(MIRA);
      console.log('   ancho ' + v.ancho + 'px · paso 4: ve=' + v.paso4.ve
        + ' locked=' + v.paso4.locked + ' · input ve=' + v.input.ve
        + ' · botón disabled=' + v.btnCalc.disabled);
      console.log('   lo que el cliente LEE en el paso 4: «' + v.leible + '»');
      // La captura, igual en los dos lados: paso 4 A LA VISTA, sin campo y con
      // el botón muerto. Es la premisa del caso.
      af(v.paso4.ve && !v.paso4.locked,
         '🔴 ' + etiqueta + ': el paso 4 no está a la vista y activo; la captura de Ximena'
         + ' es con el paso 4 abierto: ' + JSON.stringify(v.paso4));
      af(!v.input.ve,
         '🔴 ' + etiqueta + ': el campo del monto SÍ se ve, así que este no es el caso'
         + ' que reportó Ximena');
      af(v.btnCalc.ve && v.btnCalc.disabled,
         '🔴 ' + etiqueta + ': el botón no está muerto: ' + JSON.stringify(v.btnCalc));
      // 🔒 Y sin fecha el precio TAMBIÉN es null: por eso el orden del letrero
      // importa. Se comprueba que a la function no se le pidió nada.
      af(PEDIDOS.length === 0,
         '🔒 sin fecha no se le pide precio a la function (por eso el precio es null'
         + ' por consecuencia): pidió ' + PEDIDOS.length);

      if (esHead) {
        af(v.aviso.ve, '🔴 HEAD: el paso 4 sigue MUDO — no se ve el aviso de lo que falta');
        console.log('   el aviso dice: «' + v.aviso.txt + '» · botón «' + v.aviso.bt + '»');
        // 🔴 LA CAUSA REAL DE ESTE CASO ES LA FECHA, no el precio.
        af(/fecha del separo/i.test(v.aviso.txt || ''),
           '🔴 HEAD: el aviso no nombra la FECHA DEL SEPARO: «' + v.aviso.txt + '»');
        af(/paso 3/i.test(v.aviso.txt || ''),
           '🔴 HEAD: el aviso no dice DÓNDE está (paso 3): «' + v.aviso.txt + '»');
        af(/comprobante/i.test(v.aviso.txt || ''),
           'y dice cuál fecha es (la del comprobante)');
        // 🔒 Y NO nombra el precio, aunque también sea null: sería la causa
        // equivocada y mandaría al cliente al paso 2 a buscar lo que no está.
        af(!/precio/i.test(v.aviso.txt || ''),
           '🔴 HEAD: el aviso nombra el PRECIO, que aquí es CONSECUENCIA de la fecha'
           + ' vacía: mandaría al cliente al paso equivocado. Dijo: «' + v.aviso.txt + '»');
        af(v.aviso.btVe && /paso 3/i.test(v.aviso.bt || ''),
           '🔴 HEAD: falta el camino de regreso al paso 3: «' + v.aviso.bt + '»');
        // EL CAMINO DE REGRESO, apretado de verdad.
        await pg.click('#sep-falta-ir');
        await pg.waitForTimeout(700);
        const tras = await pg.evaluate(() => {
          const s3 = document.getElementById('step3'), d = document.getElementById('sep-date');
          const cs = s3 ? getComputedStyle(s3) : null;
          return { s3ve: !!s3 && cs.display !== 'none' && s3.offsetParent !== null,
                   foco: document.activeElement ? document.activeElement.id : null,
                   s4locked: !!document.getElementById('step4').classList.contains('locked') };
        });
        console.log('   tras el regreso: paso 3 visible=' + tras.s3ve
          + ' · foco en «' + tras.foco + '» · paso 4 locked=' + tras.s4locked);
        af(tras.s3ve,
           '🔴 HEAD: el regreso llevó a un paso 3 que NO SE VE — en móvil los pasos'
           + ' `.done` van display:none, así que un scroll a secas no sirve');
        af(tras.foco === 'sep-date', 'y el foco queda en la fecha, dio ' + tras.foco);
        // 🔒 Y NO SE QUEDA ATRAPADO: al llenar la fecha, el paso 4 se reabre.
        PRECIO = 'uno';
        await pg.fill('#sep-date', '2026-09-20');
        await pg.dispatchEvent('#sep-date', 'change');
        await pg.waitForTimeout(1400);
        const vuelto = await pg.evaluate(MIRA);
        console.log('   al llenar la fecha: paso 4 locked=' + vuelto.paso4.locked
          + ' · input ve=' + vuelto.input.ve + ' valor=' + vuelto.input.valor
          + ' · aviso ve=' + vuelto.aviso.ve);
        af(!vuelto.paso4.locked,
           '🔴 HEAD: el cliente quedó ATRAPADO en el paso 3: al llenar la fecha el paso 4'
           + ' siguió bloqueado');
        af(vuelto.input.ve, '🔴 HEAD: al llenar la fecha el campo del monto no apareció');
        af(!vuelto.aviso.ve, 'y el aviso se va cuando ya no falta nada');
      } else {
        // 🔒 CONTROL POSITIVO: en BASE no hay NI UNA PALABRA. No se mide «no
        // existe el div» —eso sería medir mi propio markup— sino que el texto
        // que el cliente LEE no explica nada.
        af(!v.aviso.existe || !v.aviso.ve,
           '🔒 CONTROL POSITIVO: en BASE ya había un aviso visible, así que el careo'
           + ' no está midiendo la tuerca');
        af(!/fecha del separo/i.test(v.leible || ''),
           '🔒 CONTROL POSITIVO: en BASE el paso 4 ya nombraba la fecha del separo: «'
           + v.leible + '»');
        af(!/falta/i.test(v.leible || ''),
           '🔒 CONTROL POSITIVO: en BASE el paso 4 ya decía que faltaba algo: «'
           + v.leible + '»');
        console.log('   (BASE queda MUDO, que es el defecto reportado)');
      }
    }
    af(errs.length === 0, etiqueta + ': errores de página: ' + JSON.stringify(errs.slice(0, 2)));
    await pg.close();
  }

  // ── B · EL OTRO CASO: fecha puesta y precio sin resolver ────────────────
  // 🔒 NO ES EL MISMO LETRERO, y se mide aparte: aquí la fecha SÍ está, así que
  // la causa es el precio — y el paso 4 no debe repetir la explicación, que ya
  // vive en el paso 2 (`pintarPrecioHist`).
  console.log('\n── B · con fecha, pero con DOS precios ese día ──');
  PRECIO = 'dos'; PEDIDOS.length = 0;
  let pg2 = await ctx.newPage();
  const errs2 = []; pg2.on('pageerror', (e) => errs2.push(e.message));
  await pg2.goto('http://127.0.0.1:' + pH + '/rol.html', { waitUntil: 'load' });
  const rec2 = await caminoCliente(pg2, true);
  af(!!rec2, '🔴 no se pudo recorrer el camino con fecha');
  if (rec2) {
    await pg2.waitForTimeout(900);
    const v2 = await pg2.evaluate(MIRA);
    console.log('   el aviso dice: «' + v2.aviso.txt + '» · botón «' + v2.aviso.bt + '»');
    af(PEDIDOS.length >= 1,
       '🔒 PREMISA: con fecha SÍ se le pide el precio a la function, pidió ' + PEDIDOS.length);
    af(!v2.input.ve,
       '🔒 PREMISA: con dos precios sin elegir, el monto sigue sin poderse calcular');
    af(v2.aviso.ve, '🔴 con el precio sin resolver el paso 4 se queda mudo');
    af(/precio/i.test(v2.aviso.txt || ''),
       '🔴 el aviso no nombra el PRECIO, que es la causa de ESTE caso: «' + v2.aviso.txt + '»');
    af(!/fecha del separo/i.test(v2.aviso.txt || ''),
       '🔴 el aviso sigue culpando a la fecha, que aquí YA ESTÁ: «' + v2.aviso.txt + '»');
    af(/paso 2/i.test(v2.aviso.txt || '') && /paso 2/i.test(v2.aviso.bt || ''),
       '🔴 el aviso no manda al paso 2, donde vive la razón: «' + v2.aviso.txt + '»');
    // 🔒 Y NO RE-EXPLICA: los textos del precio viven en `pintarPrecioHist`.
    af(!/dos precios|2 precios|cerrada|sin historial|buscando/i.test(v2.aviso.txt || ''),
       '🔴 el paso 4 está RE-EXPLICANDO el caso del precio, que ya explica el paso 2: «'
       + v2.aviso.txt + '»');
  }
  af(errs2.length === 0, 'errores en B: ' + JSON.stringify(errs2.slice(0, 2)));
  await pg2.close();

  // ── C · CONTROL POSITIVO: con los cuatro datos, el campo y NINGÚN aviso ─
  console.log('\n── C · con los cuatro datos: el campo con su default y nada de avisos ──');
  PRECIO = 'uno'; PEDIDOS.length = 0;
  let pg3 = await ctx.newPage();
  const errs3 = []; pg3.on('pageerror', (e) => errs3.push(e.message));
  await pg3.goto('http://127.0.0.1:' + pH + '/rol.html', { waitUntil: 'load' });
  const rec3 = await caminoCliente(pg3, true);
  af(!!rec3, '🔴 no se pudo recorrer el camino completo');
  if (rec3) {
    await pg3.waitForTimeout(1000);
    const v3 = await pg3.evaluate(MIRA);
    console.log('   input ve=' + v3.input.ve + ' valor=' + v3.input.valor
      + ' · aviso ve=' + v3.aviso.ve + ' · botón disabled=' + v3.btnCalc.disabled);
    af(v3.input.ve, '🔴 con los cuatro datos el campo del monto no se ve');
    af(v3.input.valor && Number(v3.input.valor) > 0,
       '🔴 el campo no trae su default: «' + v3.input.valor + '»');
    af(!v3.aviso.ve, '🔴 con todo puesto sigue saliendo un aviso: «' + v3.aviso.txt + '»');
    af(!/falta/i.test(v3.leible || ''),
       '🔴 el paso 4 dice que falta algo con todo puesto: «' + v3.leible + '»');
    af(!v3.btnCalc.disabled, 'y el botón de generar el plan ya vive');
  }
  af(errs3.length === 0, 'errores en C: ' + JSON.stringify(errs3.slice(0, 2)));
  await pg3.close();

  await ctx.close(); await nav.close();
  sB.close(); sH.close();
  completo = true;
  marcador();
  process.exit(rojo ? 1 : 0);
})().catch((e) => {
  console.error('\nARNÉS CAÍDO:', e.message, '\n', e.stack);
  marcador();
  process.exit(1);
});
