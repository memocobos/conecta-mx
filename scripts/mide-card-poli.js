#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-card-poli.js — CARD-POLI-1 · LAS POLÍTICAS, CON BOTÓN Y POR TEMAS
//
// Se entra POR EL CAMINO DEL CLIENTE —la url del evento— en 390×844.
//
// 🔒 LOS DOS LADOS SON COMMITS.
//     BASE = 6b1c789  las seis tecleadas al fondo del card
//     HEAD = d3ca76c  las ocho por temas, detrás de su botón
//
// 🔒 LO QUE HACE ESPECIAL A ESTE CAREO: no solo mira que el texto esté. Carea
// el LETRERO contra el HECHO —las dos políticas de morosidad contra lo que
// `portal-morosidad-diario` le dice de verdad al cliente— y carea la lista
// del index contra la SEGUNDA lista, la de `pagos.html`, nombrando lo que no
// coincide. Un letrero que promete lo que el sistema no hace es la clase de
// defecto que esta tuerca vino a cerrar, no a estrenar.
//
// Se corre:  npm run mide:card-poli
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
  fallos.slice(0, 14).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '6b1c789';
const HEAD_SHA = process.env.HEAD_SHA || 'd3ca76c';
const EVENTO = 'frontera';   // un evento vivo cualquiera: las políticas no dependen del evento

// LOS SEIS TEXTOS VIGENTES, copiados del BASE letra por letra. Son palabra de
// Memo y esta tuerca solo los MUEVE: si alguno cambiara una coma al pasar a
// datos, el careo lo dice.
// El renglón de la cancelación oficial va APARTE: es el único cuyo texto esta
// tuerca cambia, y el cambio es de UNA pieza — el pronombre «ese cargo» por su
// antecedente nombrado. Se guarda el ORIGINAL y la sustitución se aplica en la
// aserción, así se prueba que no se colaron otras palabras.
const CANCELA_BASE = 'Si el evento se cancela oficialmente te devolvemos todo lo que pagaste del viaje — separo y abonos completos — pero no ese cargo, porque nunca fue nuestro.';
const CANCELA_HEAD = CANCELA_BASE.replace('pero no ese cargo', 'pero no el cargo de tarjeta u OXXO');
const SEIS = [
  'Sin reembolsos por cancelación del cliente o incumplimiento de pagos',
  'No se puede cambiar de paquete ni de tour una vez reservado',
  'Lugares transferibles a otra persona sin costo hasta 6 días antes del evento. Del día 5 en adelante aplica un cargo por servicio de $350.',
  'El cargo por pagar con tarjeta u OXXO no es reembolsable. Cuando pagas en línea se suma 4% con débito u OXXO y 5% con crédito: ese cobro es de la empresa que procesa el pago, no de Conecta, y no regresa en ningún caso.',
  'Error en depósito genera cargo de $350',
];

function servidor(raiz) {
  return http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (/\.netlify\/functions\//.test(u)) {
      q.on('data', () => {});
      return q.on('end', () => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{"ok":true}'); });
    }
    const f = path.join(raiz, decodeURIComponent(u).replace(/^\//, '') || 'index.html');
    fs.readFile(f, (e, b) => {
      // `/<slug>` es una url REAL del cliente; producción la resuelve al index.
      if (e) {
        return fs.readFile(path.join(raiz, 'index.html'), (e2, b2) => {
          if (e2) { r.writeHead(404); return r.end('no'); }
          r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(b2);
        });
      }
      const tipo = /\.js$/.test(f) ? 'text/javascript'
        : /\.css$/.test(f) ? 'text/css'
        : /\.jpe?g$/.test(f) ? 'image/jpeg'
        : /\.png$/.test(f) ? 'image/png'
        : /\.webp$/.test(f) ? 'image/webp' : 'text/html; charset=utf-8';
      r.writeHead(200, { 'Content-Type': tipo }); r.end(b);
    });
  });
}

const MIRA = `(function(sel){
  var e = document.querySelector(sel);
  if (!e) return { hay:false };
  var cs = getComputedStyle(e), r = e.getBoundingClientRect();
  var fijo = cs.position === 'fixed';
  var ve = !e.hidden && (fijo || e.offsetParent !== null)
        && cs.display !== 'none' && cs.visibility !== 'hidden'
        && Number(cs.opacity) >= .05 && r.width > 0 && r.height > 0;
  return { hay:true, ve:ve, x:Math.round(r.x), y:Math.round(r.y),
           w:Math.round(r.width), h:Math.round(r.height), txt:(e.innerText||'').trim() };
})`;

// El onboarding tapa el card 300 ms después: se cierra igual que lo cierra una
// persona, o el clic al botón se queda interceptado 30 segundos.
async function abrirEvento(page, base, id) {
  await page.goto(base + '/' + id, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const ve = await page.evaluate(() => {
    const e = document.getElementById('onboard-bg');
    return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
  });
  if (ve) {
    await page.evaluate(() => { if (typeof skipOnboarding === 'function') skipOnboarding(); });
    await page.waitForTimeout(250);
  }
}

(async () => {
  const b = sacar(BASE, 'poli-base'), h = sacar(HEAD_SHA, 'poli-head');
  console.log('CAREO CARD-POLI-1 · las políticas, por la url del cliente\n');
  console.log('  BASE ' + b.sha.slice(0, 7) + '  ·  HEAD ' + h.sha.slice(0, 7) + '\n');
  const sb = servidor(b.dir), sh = servidor(h.dir);
  await new Promise((ok) => sb.listen(0, ok));
  await new Promise((ok) => sh.listen(0, ok));
  const uB = 'http://127.0.0.1:' + sb.address().port;
  const uH = 'http://127.0.0.1:' + sh.address().port;
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e.message)));

  try {
    // ── [1] EL CARD YA NO LAS LLEVA DENTRO, PERO SÍ EL BOTÓN ──────────────
    console.log('[1] el card y su botón');
    await abrirEvento(page, uH, EVENTO);
    const card = await page.evaluate(MIRA + '("#d-pol-card")');
    console.log('    card: ve=' + card.ve + ' y=' + card.y + ' h=' + card.h);
    af(card.hay && card.ve, 'el card de políticas no SE VE: ' + JSON.stringify(card));
    const btn = await page.evaluate(MIRA + '("#d-pol-btn")');
    af(btn.hay && btn.ve, 'el botón «Políticas» no se ve: ' + JSON.stringify(btn));
    af(/POL[IÍ]TICAS/i.test(btn.txt || ''), 'el botón no dice «Políticas», dice ' + JSON.stringify(btn.txt));
    af(btn.x >= 0 && (btn.x + btn.w) <= 390, 'el botón se sale del ancho del teléfono: x=' + btn.x + ' w=' + btn.w);
    // Las seis dejaron de estar EN el card: es el «salen del fondo» del encargo.
    const enCard = await page.evaluate(() => {
      const c = document.getElementById('d-pol-card');
      return c ? c.querySelectorAll('.pol-row').length : -1;
    });
    console.log('    renglones .pol-row DENTRO del card: ' + enCard);
    af(enCard === 0, 'el card todavía lleva ' + enCard + ' renglón(es) adentro: no salieron del fondo');
    // Y el card es CORTO: era lo que ocupaba el fondo entero.
    af(card.h > 0 && card.h < 220, 'el card de políticas mide ' + card.h + 'px: ya no debería ser un muro de texto');
    // El modal nace cerrado.
    af(!(await page.evaluate(MIRA + '("#pol-modal-bg")')).ve, 'el modal de políticas se abre solo');

    // ── [2] LAS OCHO, POR TEMAS, Y LAS SEIS LETRA POR LETRA ───────────────
    console.log('\n[2] las ocho por temas');
    await page.click('#d-pol-btn');
    await page.waitForTimeout(250);
    const modal = await page.evaluate(MIRA + '("#pol-modal-bg")');
    af(modal.ve, 'el modal no se abrió al apretar el botón');
    const d = await page.evaluate(() => {
      const box = document.getElementById('pol-modal-body');
      return {
        // ⚠️ `textContent`, NO `innerText`: innerText devuelve el texto TAL
        // COMO SE PINTA, y `.pol-row` lleva `text-transform:uppercase`, así
        // que comparar los textos de Memo contra innerText los encuentra
        // todos en MAYÚSCULAS y falla en los seis. Mi instrumento, no el
        // código. El texto que se carea letra por letra es el del DATO; para
        // «lo que el cliente lee» el case no cambia el hecho.
        txt: box ? (box.textContent || '') : '',
        pintado: box ? (box.innerText || '') : '',
        html: box ? box.innerHTML : '',
        filas: box ? box.querySelectorAll('.pol-row').length : -1,
        temas: box ? [...box.querySelectorAll('.pol-tema')].map((e) => e.innerText.trim()) : [],
      };
    });
    console.log('    políticas: ' + d.filas + ' · temas: ' + JSON.stringify(d.temas));
    // NUEVE renglones para OCHO políticas: la 8 de Memo se publica en DOS
    // renglones —el umbral de 2 y el de 3—, que es lo que el sistema hace de
    // verdad. Mi primera aserción decía 8 y la aritmética era mía.
    af(d.filas === 9, 'el modal trae ' + d.filas + ' renglones y deben ser 9: las 6 vigentes + la del CHEAP '
       + '+ los DOS umbrales de morosidad (la política 8 sale en dos renglones)');
    af(d.temas.length >= 4, 'los temas son ' + d.temas.length + ': el encargo pedía vista ESTRUCTURADA por temas');
    // 🔒 LAS SEIS SON PALABRA DE MEMO Y ESTA TUERCA SOLO LAS MUEVE: se exige
    // cada una LETRA POR LETRA. Mover un texto es la manera más fácil de
    // reescribirlo sin querer.
    SEIS.forEach((t, i) => af(d.txt.indexOf(t) >= 0,
      'la política vigente #' + (i + 1) + ' no aparece IGUAL en el modal: ' + JSON.stringify(t.slice(0, 60))));
    // ── 🔴 EL ANTECEDENTE HUÉRFANO (lo vio Jane) ──────────────────────────
    // «pero no ESE cargo» perdió su antecedente AL AGRUPAR: en la lista plana
    // el cargo de tarjeta estaba dos renglones arriba, y al repartir por temas
    // se fue a otra caja. El defecto lo introdujo esta tuerca.
    // 🔒 Se prueba que el ÚNICO cambio al texto de Memo es la sustitución del
    // pronombre: se toma el original, se aplica esa sola pieza y se exige
    // igualdad. Cualquier otra palabra que se colara pondría esto en rojo.
    af(d.txt.indexOf(CANCELA_HEAD) >= 0,
       'el renglón de la cancelación oficial no es el original con SOLO el antecedente nombrado. '
       + 'Se esperaba: ' + JSON.stringify(CANCELA_HEAD.slice(-70)));
    af(d.txt.indexOf('pero no ese cargo') < 0,
       '🔴 el renglón sigue diciendo «pero no ESE cargo» y su antecedente vive en OTRO grupo: '
       + 'el pronombre no apunta a nada para quien lee la vista por temas');
    af(/cargo de tarjeta u OXXO/.test(d.txt),
       'el renglón no nombra el cargo de tarjeta u OXXO en su propio sitio');
    // Y el antecedente sigue existiendo en su grupo: nombrarlo aquí no lo
    // duplica ni lo sustituye.
    af((d.txt.match(/cargo por pagar con tarjeta u OXXO no es reembolsable/g) || []).length === 1,
       'la política del cargo de tarjeta se perdió o se duplicó al nombrar el antecedente');
    // 🔒 Y EL CAREO CONTRA BASE: el original SÍ decía «ese cargo». Sin esto, la
    // aserción de arriba no distingue «lo arreglé» de «nunca estuvo».
    af(/pero no ese cargo/.test(fs.readFileSync(path.join(b.dir, 'index.html'), 'utf8')),
       'la premisa del ANTES no se sostiene: BASE no decía «pero no ese cargo», así que no había '
       + 'antecedente huérfano que arreglar');
    // La séptima, copiada del brief.
    af(/Los boletos del paquete\s+CHEAP\s+se entregan en la\s+semana previa\s+al evento\./.test(d.txt.replace(/\s+/g, ' ')),
       'falta la política 7 (los boletos CHEAP se entregan en la semana previa) o cambió de palabras');
    af(/<b>CHEAP<\/b>/.test(d.html), 'la política 7 no resalta CHEAP: el markup de la lista no se está pintando');
    // Y el CLIENTE las lee en mayúsculas, que es el estilo de la casa: se
    // comprueba que el estilo sigue aplicándose, porque es parte del letrero.
    af(/SIN REEMBOLSOS/.test(d.pintado), 'las políticas dejaron de pintarse en mayúsculas: cambió su estilo');
    // Y el fondo del card ya no las tiene: el único sitio donde se leen es el modal.
    const fuera = await page.evaluate(() => document.querySelectorAll('#d-pol-card .pol-row').length);
    af(fuera === 0, 'las políticas se pintan en DOS sitios a la vez');

    // ── [3] 🔴 EL LETRERO CONTRA EL HECHO ─────────────────────────────────
    // La política 8 es la razón de ser de este bloque. El brief pedía «2+
    // pagos no registrados = baja automática» y el sistema NO hace eso; Memo
    // eligió que el texto se ajuste al hecho. Aquí se comprueba contra la
    // FUENTE del cron, no contra mi memoria de lo que dice.
    console.log('\n[3] el letrero contra el hecho (portal-morosidad-diario)');
    const cron = fs.readFileSync(path.join(h.dir, 'netlify/functions/portal-morosidad-diario.js'), 'utf8');
    // Premisa: el cron sigue siendo el que avisa y sigue sin dar de baja. Si
    // esto cambia, las dos políticas de abajo hay que reescribirlas.
    af(/Solo NOTIFICA/.test(cron) && /no da de baja ni congela nada/.test(cron),
       '⚠️ PREMISA CADUCADA: `portal-morosidad-diario` ya no dice que solo notifica. Si ahora da de baja, '
       + 'las políticas 8 y 9 del card hay que reescribirlas — el letrero se quedó viejo');
    af(/nivel 2 \(2 vencidas\)/.test(cron) && /nivel 3 \(3\+ vencidas\)/.test(cron),
       '⚠️ PREMISA CADUCADA: los niveles del cron ya no son 2 y 3+: el umbral del card miente');
    // Las frases que CARGAN el peso, tomadas del cron y exigidas en el card.
    [
      ['congelado y en riesgo de baja', 'el nivel 2'],
      ['en proceso de baja', 'el nivel 3'],
      ['el lugar se libera', 'la consecuencia de la baja'],
      ['los abonos no son reembolsables', 'lo que pasa con el dinero'],
    ].forEach(([frase, quien]) => {
      af(cron.indexOf(frase) >= 0, 'la frase ' + JSON.stringify(frase) + ' ya no está en el cron (' + quien
         + '): el careo estaba comparando contra un texto que cambió');
      af(d.txt.indexOf(frase) >= 0, '🔴 el card NO dice ' + JSON.stringify(frase)
         + ', que es lo que el correo de cobranza SÍ le dice al cliente (' + quien + ')');
    });
    // Los umbrales, que son el corazón del desacuerdo con el brief.
    af(/Con 2 quincenas vencidas/.test(d.txt), 'el card no nombra el umbral de 2');
    af(/Con 3 o m[aá]s/.test(d.txt), 'el card no nombra el umbral de 3, que es donde el sistema sí habla de baja');
    // 🔒 Y LO QUE EL CARD **NO** DEBE DECIR: la promesa que el sistema no cumple.
    af(!/autom[aá]ticamente/i.test(d.txt),
       '🔴 el card promete una baja AUTOMÁTICA y no existe ninguna: el único escritor de la baja es '
       + '`admin-lugar-baja`, con un solo llamador humano. Es el letrero que esta tuerca vino a evitar');
    af(!/no registrados/i.test(d.txt),
       'el card habla de «pagos no registrados» y el sistema cuenta quincenas VENCIDAS: son dos cosas, '
       + 'y «no registrado» se lee como «pagué y no lo reportaron»');
    // ⚠️ EL SUSTANTIVO DIFIERE A PROPÓSITO, y queda dicho para que nadie
    // «arregle» un lado solo: el correo le dice «pagos pendientes» y el card
    // «quincenas vencidas». El HECHO es el mismo (pagos en estado `vencido`).
    af(/2 pagos pendientes/.test(cron),
       'el correo ya no dice «2 pagos pendientes»: si cambió de sustantivo, decidir si el card lo sigue');

    // ── [4] LA SEGUNDA LISTA · pagos.html, careada y NOMBRADA ─────────────
    // 🔒 «Dos listas iguales» no existe: solo «dos listas que todavía no
    // divergen» — y éstas YA divergieron antes de esta tuerca.
    console.log('\n[4] la segunda lista · pagos.html');
    const pagosH = fs.readFileSync(path.join(h.dir, 'pagos.html'), 'utf8');
    const pagosB = fs.readFileSync(path.join(b.dir, 'pagos.html'), 'utf8');
    const crypto = require('crypto');
    const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
    console.log('    pagos.html  BASE ' + sha(pagosB) + '  HEAD ' + sha(pagosH));
    af(sha(pagosB) === sha(pagosH),
       '🔴 esta tuerca TOCÓ pagos.html: su candado («las políticas nunca se pliegan») es de Memo y el '
       + 'encargo dice que no se toca');
    // El candado, comprobado por su presencia y no por confianza.
    af(/nunca se pliegan|no se pliegan|politicas-siempre|pol-siempre/i.test(pagosH) || /SECCIÓN 3: Políticas/.test(pagosH),
       'no encuentro la sección de políticas de pagos.html: el careo no puede afirmar que sigue en pie');
    // LA DIVERGENCIA VIEJA, clavada como testigo: si alguien la cierra, este
    // renglón se pone rojo y manda a leer esto en vez de pasar en silencio.
    const tienePagos = /incumplimiento de pagos, o cambios de fecha|incumplimiento de pagos o cambios de fecha/.test(pagosH.replace(/\s+/g, ' '));
    af(tienePagos,
       'TESTIGO CADUCADO (buena noticia): pagos.html ya no dice «o cambios de fecha». Esa era la divergencia '
       + 'vieja entre las dos listas; si se cerró, actualiza este testigo y carea las listas de nuevo');
    af(!/o cambios de fecha/.test(d.txt),
       'el card estrenó «o cambios de fecha»: si las dos listas se van a unificar, que sea una decisión '
       + 'de Memo y no un contagio de este careo');
    // Y las dos nuevas NO están en pagos.html: es un hecho medido, no un olvido
    // escondido — el encargo acotó pagos.html a «no toques el candado».
    af(!/quincenas vencidas/.test(pagosH),
       'pagos.html ya trae las políticas de morosidad: entonces las dos listas se pueden unificar y '
       + 'esta aserción sobra');
    console.log('    ⚠️ las 2 nuevas viven SOLO en el card: unificar las listas es decisión de Memo');

    // ── [5] SE CIERRA, Y NO TIRA ERRORES ──────────────────────────────────
    console.log('\n[5] se cierra y se reabre');
    await page.click('#pol-modal-bg', { position: { x: 5, y: 5 } });
    await page.waitForTimeout(200);
    af(!(await page.evaluate(MIRA + '("#pol-modal-bg")')).ve, 'el modal no se cerró al clic de afuera');
    await page.click('#d-pol-btn');
    await page.waitForTimeout(250);
    af((await page.evaluate(MIRA + '("#pol-modal-bg")')).ve, 'el modal no se reabre');
    // El itinerario sigue funcionando al lado (los dos modales son vecinos).
    await page.evaluate(() => cerrarPoliticas());
    await page.waitForTimeout(150);
    await page.click('#d-itin-btn');
    await page.waitForTimeout(250);
    af((await page.evaluate(MIRA + '("#itin-modal-bg")')).ve,
       'el itinerario dejó de abrirse: los dos modales se están estorbando');
    af(!(await page.evaluate(MIRA + '("#pol-modal-bg")')).ve, 'los dos modales se abren a la vez');
    af(errores.length === 0, 'la página tiró ' + errores.length + ' error(es) de JS: ' + errores.slice(0, 3).join(' · '));

    // ── [6] CONTROL POSITIVO · en BASE era lo contrario ───────────────────
    console.log('\n[6] CONTROL POSITIVO · el mismo camino en BASE');
    await abrirEvento(page, uB, EVENTO);
    const enBase = await page.evaluate(() => ({
      filas: document.querySelectorAll('.pol-row').length,
      boton: !!document.getElementById('d-pol-btn'),
      modal: !!document.getElementById('pol-modal-bg'),
      temas: document.querySelectorAll('.pol-tema').length,
    }));
    console.log('    BASE: ' + JSON.stringify(enBase));
    af(enBase.filas === 6, 'en BASE las políticas no son 6 renglones a la vista (' + enBase.filas
       + '): la premisa del ANTES no se sostiene y [1] no prueba nada');
    af(!enBase.boton, 'BASE ya tiene el botón de políticas');
    af(!enBase.modal, 'BASE ya tiene el modal de políticas');
    af(enBase.temas === 0, 'BASE ya agrupa por temas');
  } catch (e) {
    console.log('   ✗ EXCEPCIÓN en el navegador: ' + e.message);
    rojo++; fallos.push('EXCEPCIÓN: ' + e.message);
  } finally {
    await nav.close(); sb.close(); sh.close();
  }

  completo = true;
  marcador();
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); marcador(); process.exit(1); });
