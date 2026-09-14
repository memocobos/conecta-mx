#!/usr/bin/env node
// =============================================================================
// scripts/mide-consuelo-verdad.js — EL CAREO DE CONSUELO-VERDAD-1
// =============================================================================
// El correo de consolación del sorteo decía, heredado de melanie, que el código
// moría ese mismo día a las ocho y que el concierto era al día siguiente. La
// tuerca deriva las dos líneas: la vigencia de `expires_at` de la fila de NATA y
// la fecha del evento del catálogo.
//
// Lo que mide, y DE DÓNDE:
//   · Los DOS lados son commits (`git archive`): BASE (el main de antes) y HEAD.
//   · El render se lee del HTML que imprime `_correoHtml` — la función expuesta,
//     no una copia — y del HTML que el HANDLER REAL le entrega al enviador.
//   · La promo entra por `_promoViva` real, con la FILA REAL de NATA (leída de
//     KameHouse el 14-sep-2026, ver FILA_NATA) servida un salto más adentro.
//   · La fecha del evento sale del `index.html` DEL COMMIT, parseado por
//     `_lib/catalogo-index` real.
//   · 🔒 EL SITIO TIENE QUE HONRAR EL CÓDIGO. El index del commit trae NATA
//     vencida el 1-sep (nadie publicó los códigos tras editar la fila): el
//     handler tiene que REHUSARSE con ese index. La corrida buena usa el index
//     que dejaría «publicar códigos» — generado por `compilarPROMOS` REAL con la
//     fila real, no editado a mano.
//   · 🔒 NI UN CORREO: `fetch` global es un doble. Resend se CUENTA y nunca sale;
//     cualquier otro host no previsto se cuenta como «red real» y tiene que dar 0.
//     El contador tiene CONTROL POSITIVO: la corrida buena tiene que contar
//     exactamente los destinatarios que el padrón falso produce.
//   · Las aserciones de ausencia se hacen sobre el HTML IMPRESO, no sobre el
//     fuente: el comentario que explica la muerte no puede cazarse solo.
//
// Uso: node scripts/mide-consuelo-verdad.js   (BASE=<sha> HEAD=<sha> opcionales)
// =============================================================================

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const sh = (c) => execSync(c, { cwd: RAIZ, encoding: 'utf8' }).trim();
const BASE = sh(`git rev-parse ${process.env.BASE || '81f69c2'}`);
const HEAD = sh(`git rev-parse ${process.env.HEAD || 'HEAD'}`);

let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

// La fila REAL, tal como la devolvió `select * from promos_codigos` de KameHouse
// el 14-sep-2026 (actualizado_en 2026-09-07 00:23 por jane-giveaway-nata). Es una
// FOTO: si la fila cambia, este careo no lo ve — lo que sí ve, en producción, es
// la guarda del handler, que la lee viva y la carea contra el index servido.
const FILA_NATA = {
  codigo: 'NATA', monto: '500.00', pct: null, pct_cheap: null,
  desc_texto: '$500 de descuento con código NATA', custom_msg: null, hide_amount: false,
  only_events: ['natanael'], all_events: false, only_zones: null, exclude_zones: null,
  exclude_pkg: ['ride', 'stay', 'cheap'],
  starts_at: '2026-09-14T14:00:00+00:00', expires_at: '2026-09-21T04:59:59+00:00',
  max_usos: 9999, single_use: false, segundo_pax: null, exact_personas: null, archivado: false,
};

function extraer(sha) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consuelo-' + sha.slice(0, 7) + '-'));
  execSync(`git archive ${sha} netlify index.html | tar -x -C ${dir}`, { cwd: RAIZ });
  return dir;
}

// ── EL DOBLE DE LA RED ───────────────────────────────────────────────────────
const PT = 'https://pt.test', KH = 'https://kh.test', SITIO = 'https://sitio.test';
Object.assign(process.env, {
  PORTAL_SUPABASE_URL: PT, PORTAL_SUPABASE_SERVICE_KEY: 'pt-falsa',
  SUPABASE_URL_KAMEHOUSE: KH, SUPABASE_SERVICE_KEY_KAMEHOUSE: 'kh-falsa',
  RESEND_API_KEY: 're_falsa', GIVEAWAY_ADMIN_TOKEN: 'token-careo', URL: SITIO,
});
delete process.env.CORREOS_MODO;
delete process.env.DEPLOY_PRIME_URL;

function red({ indexHtml, fila }) {
  const t = { resend: [], patch: 0, real: [] };
  const registros = [
    { id: 'g1', nombre: 'Gana Dora', correo: 'gana@x.mx' },     // el ganador: NO recibe
    { id: 'a1', nombre: 'Ana Pérez', correo: 'ana@x.mx' },
    { id: 'a2', nombre: 'Ana Pérez', correo: 'ANA@x.mx ' },      // la misma persona, dos filas
    { id: 'b1', nombre: 'Beto Ruiz', correo: 'beto@x.mx' },
    { id: 'c1', nombre: 'Sin Correo', correo: '' },
  ];
  const resp = (status, cuerpo) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => cuerpo, text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
  });
  t.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u === 'https://api.resend.com/emails') {
      t.resend.push(JSON.parse(opts.body));
      return resp(200, { id: 'doble-' + t.resend.length });
    }
    if (u.startsWith(KH + '/rest/v1/promos_codigos')) return resp(200, fila ? [fila] : []);
    if (u.startsWith(PT + '/rest/v1/giveaway_sorteos')) return resp(200, [{ registro_id: 'g1', intento: 1 }]);
    if (u.startsWith(PT + '/rest/v1/giveaway_registros')) {
      if ((opts.method || 'GET') === 'PATCH') { t.patch++; return resp(204, ''); }
      return resp(200, registros);
    }
    if (u === SITIO + '/index.html') return indexHtml == null ? resp(404, 'no') : resp(200, indexHtml);
    t.real.push(u);
    throw new Error('red real bloqueada por el careo: ' + u);
  };
  return t;
}

const evento = (cuerpo) => ({
  httpMethod: 'POST', headers: { 'x-admin-token': 'token-careo' }, body: JSON.stringify(cuerpo || {}),
});
const AHORA = Date.parse('2026-09-15T18:00:00Z');   // dentro de la vigencia de NATA
const VENCIDO = Date.parse('2026-09-22T12:00:00Z');
const dateNow = Date.now;

async function correr(handler, t, cuerpo, ahora) {
  globalThis.fetch = t.fetch;
  Date.now = () => ahora;
  try { return { res: await handler(evento(cuerpo)) }; }
  catch (e) { return { error: e }; }
  finally { Date.now = dateNow; }
}

const DEBE = [/domingo 20/, /2 de octubre/];
const NO_DEBE = [/HOY hasta las 8:00/i, /mañana/i];
function careaHtml(html, rotulo) {
  af(typeof html === 'string' && html.length > 1000, `${rotulo}: el HTML no se imprimió (cardinalidad)`);
  for (const re of DEBE) af(re.test(html), `${rotulo}: falta ${re}`);
  for (const re of NO_DEBE) af(!re.test(html), `${rotulo}: todavía dice ${re}`);
  af(html.includes(FILA_NATA.desc_texto), `${rotulo}: no trae el desc_texto de la fila`);
}

(async () => {
  const dirBase = extraer(BASE), dirHead = extraer(HEAD);
  const indexHead = fs.readFileSync(path.join(dirHead, 'index.html'), 'utf8');
  const C = require(path.join(dirHead, 'netlify/functions/giveaway-consuelo.js'));
  const CB = require(path.join(dirBase, 'netlify/functions/giveaway-consuelo.js'));
  const catLib = require(path.join(dirHead, 'netlify/functions/_lib/catalogo-index.js'));
  const promLib = require(path.join(dirHead, 'netlify/functions/_lib/promos-compile.js'));
  const comp = promLib.compilarPROMOS({ codigos: [FILA_NATA], indexHtml: indexHead });
  const indexPublicado = comp.contenidoNuevo;   // lo que dejaría «publicar códigos» desde Baba
  const link = SITIO + '/#natanael';

  // ── [0] El catálogo del commit y el index que dejaría «publicar códigos» ────
  const EV = catLib._parseEV(indexHead);
  const nat = EV.find((e) => e && e.id === 'natanael');
  af(!!nat, '[0] natanael no está en el catálogo del commit');
  af(nat && nat.ds === '2026-10-02', `[0] el catálogo no dice 2026-10-02 (dice ${nat && nat.ds})`);
  const promosHead = promLib.evaluarPROMOS(indexHead);
  const promosPub = promLib.evaluarPROMOS(indexPublicado);
  const tsSitio = promosHead && promosHead.NATA && promosHead.NATA.expiresTs;
  af(promosPub && promosPub.NATA && promosPub.NATA.expiresTs === Date.parse(FILA_NATA.expires_at)
    && comp.aActualizar.length === 1 && comp.aInsertar.length === 0,
    '[0] el index publicado por el compilador real no quedó con el vencimiento de la fila');

  // ── [1] _correoHtml real, con la fila real pasada por _promoViva real ──────
  const t1 = red({ indexHtml: indexHead, fila: FILA_NATA });
  globalThis.fetch = t1.fetch;
  const promo = await C._promoViva('NATA', AHORA);
  af(!promo.error && promo.expira === FILA_NATA.expires_at, '[1] _promoViva no devolvió la fila viva: ' + JSON.stringify(promo));
  const html1 = C._correoHtml('Ana Pérez', link, promo, { ds: nat && nat.ds });
  careaHtml(html1, '[1] _correoHtml HEAD');
  af(/Válido hasta el domingo 20 de septiembre</.test(html1), '[1] la línea de vigencia no es exactamente «Válido hasta el domingo 20 de septiembre»');
  af(/El concierto es el <strong[^>]*>viernes 2 de octubre<\/strong>/.test(html1), '[1] la línea del cierre no dice «el viernes 2 de octubre»');
  // Sin dato no hay correo: el render se rehúsa en vez de imprimir un hueco.
  let t1a = null; try { C._correoHtml('X', link, { ...promo, expira: null }, { ds: '2026-10-02' }); } catch (e) { t1a = e; }
  af(!!t1a, '[1] sin expires_at el render imprimió algo en vez de rehusarse');
  let t1b = null; try { C._correoHtml('X', link, promo, { ds: '2026-13-45' }); } catch (e) { t1b = e; }
  af(!!t1b, '[1] con una fecha imposible el render imprimió algo en vez de rehusarse');

  // ── [2] CONTROL POSITIVO: BASE sí mentía ───────────────────────────────────
  const htmlBase = CB._correoHtml('Ana Pérez', link, 'NATA', FILA_NATA.desc_texto);
  af(/HOY hasta las 8:00/.test(htmlBase), '[2] BASE no traía la vigencia de melanie: el careo de ausencia no prueba nada');
  af(/mañana/.test(htmlBase), '[2] BASE no traía «mañana»: el careo de ausencia no prueba nada');
  af(!/domingo 20/.test(htmlBase) && !/2 de octubre/.test(htmlBase), '[2] BASE ya traía las fechas buenas: el careo de presencia no prueba nada');

  // ── [3] HANDLER REAL (HEAD): los caminos que NO mandan ─────────────────────
  const t3d = red({ indexHtml: indexHead, fila: FILA_NATA });        // EL SITIO DE HOY: NATA vencida en PROMOS
  const r3d = await correr(C.handler, t3d, {}, AHORA);
  af(r3d.res && r3d.res.statusCode === 409 && /el sitio dice que NATA ya venció/.test(r3d.res.body),
    '[3d] con el index de hoy el handler no se rehusó por el sitio: ' + JSON.stringify(r3d.res || String(r3d.error)));
  af(t3d.resend.length === 0 && t3d.patch === 0, '[3d] con el index de hoy se mandó/marcó');

  const idxOtroTs = promLib.compilarPROMOS({ codigos: [{ ...FILA_NATA, expires_at: '2026-09-25T04:59:59+00:00' }], indexHtml: indexHead }).contenidoNuevo;
  const t3e = red({ indexHtml: idxOtroTs, fila: FILA_NATA });        // sitio vigente pero con OTRO vencimiento
  const r3e = await correr(C.handler, t3e, {}, AHORA);
  af(r3e.res && r3e.res.statusCode === 409 && /no vencen igual/.test(r3e.res.body),
    '[3e] sitio y fila con distinto vencimiento y el handler no se rehusó: ' + JSON.stringify(r3e.res || String(r3e.error)));
  af(t3e.resend.length === 0 && t3e.patch === 0, '[3e] sitio y fila distintos y se mandó/marcó');

  const t3a = red({ indexHtml: null, fila: FILA_NATA });            // catálogo ilegible (va primero: sin caché)
  const r3a = await correr(C.handler, t3a, {}, AHORA);
  af(r3a.res && r3a.res.statusCode === 409 && /index/.test(r3a.res.body), '[3a] catálogo ilegible no dio 409 con su razón: ' + JSON.stringify(r3a.res || String(r3a.error)));
  af(t3a.resend.length === 0 && t3a.patch === 0, '[3a] catálogo ilegible y aun así se mandó/marcó');

  const t3b = red({ indexHtml: indexPublicado, fila: FILA_NATA });       // promo vencida
  const r3b = await correr(C.handler, t3b, {}, VENCIDO);
  af(r3b.res && r3b.res.statusCode === 409 && /ya venció/.test(r3b.res.body), '[3b] promo vencida no dio 409: ' + JSON.stringify(r3b.res || String(r3b.error)));
  af(t3b.resend.length === 0 && t3b.patch === 0, '[3b] promo vencida y aun así se mandó/marcó');

  const t3c = red({ indexHtml: indexPublicado, fila: FILA_NATA });       // ensayo
  const r3c = await correr(C.handler, t3c, { seco: true }, AHORA);
  const b3c = r3c.res ? JSON.parse(r3c.res.body) : {};
  af(r3c.res && r3c.res.statusCode === 200 && b3c.ensayo === true && b3c.destinatarios === 2, '[3c] el ensayo no contó 2 destinatarios: ' + JSON.stringify(b3c));
  af(b3c.validez === 'Válido hasta el domingo 20 de septiembre' && /viernes 2 de octubre/.test(b3c.evento || ''), '[3c] el ensayo no enseña las dos líneas derivadas: ' + JSON.stringify(b3c));
  af(t3c.resend.length === 0 && t3c.patch === 0, '[3c] el ensayo mandó o marcó');

  // ── [4] HANDLER REAL (HEAD): la corrida buena, al doble — CONTROL POSITIVO ─
  const t4 = red({ indexHtml: indexPublicado, fila: FILA_NATA });
  const r4 = await correr(C.handler, t4, {}, AHORA);
  const b4 = r4.res ? JSON.parse(r4.res.body) : {};
  af(r4.res && r4.res.statusCode === 200 && b4.enviados === 2, '[4] la corrida buena no dio 200 con 2 enviados: ' + JSON.stringify(b4 || String(r4.error)));
  af(t4.resend.length === 2, `[4] el contador del enviador vio ${t4.resend.length}, no 2 (si no ve los envíos, sus ceros no dicen nada)`);
  af(t4.patch === 3, `[4] se marcaron ${t4.patch} filas, no 3 (Ana x2 + Beto)`);
  const para = t4.resend.map((m) => String(m.to)).sort();
  af(JSON.stringify(para) === JSON.stringify(['ana@x.mx', 'beto@x.mx']), '[4] destinatarios equivocados: ' + para);
  t4.resend.forEach((m, i) => careaHtml(m.html, `[4] correo #${i + 1} entregado al enviador`));

  // ── [5] BASE: el handler viejo ni siquiera llegaba al enviador ─────────────
  const t5 = red({ indexHtml: indexHead, fila: FILA_NATA });
  const r5 = await correr(CB.handler, t5, {}, AHORA);
  af(r5.error instanceof ReferenceError && /MUERE/.test(r5.error.message), '[5] BASE no tronaba con ReferenceError de MUERE: ' + (r5.error ? r5.error.message : JSON.stringify(r5.res)));
  af(t5.resend.length === 0, '[5] BASE llegó a mandar');

  // ── 🔒 La red real, en todo el careo ───────────────────────────────────────
  const todas = [t1, t3d, t3e, t3a, t3b, t3c, t4, t5];
  const real = todas.reduce((a, t) => a.concat(t.real), []);
  af(real.length === 0, '[red] se intentó salir a la red real: ' + real.join(', '));
  const totalResend = todas.reduce((a, t) => a + t.resend.length, 0);

  console.log(`BASE ${BASE.slice(0, 7)} · HEAD ${HEAD.slice(0, 7)}`);
  console.log('Línea de vigencia HEAD :', (html1.match(/Válido hasta[^<]*/) || [''])[0]);
  console.log('Línea de cierre HEAD   :', (html1.match(/El concierto es[^🖤]*/) || [''])[0].replace(/<[^>]+>/g, ''));
  console.log('NATA en el index del commit vence:', tsSitio ? new Date(tsSitio).toISOString() : '—', '· en la fila:', FILA_NATA.expires_at);
  console.log('Handler HEAD con el index de hoy →', r3d.res && r3d.res.statusCode, r3d.res && JSON.parse(r3d.res.body).error);
  console.log(`Envíos al DOBLE: ${totalResend} (todos en [4], el control positivo) · red real: ${real.length}`);
  console.log(`\n${ok} verdes · ${mal} rojos`);
  for (const f of fallos) console.log('  ❌ ' + f);
  fs.writeFileSync(path.join(os.tmpdir(), 'consuelo-render-head.html'), html1);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('❌ EL CAREO SE CAYÓ:', e); process.exit(2); });
