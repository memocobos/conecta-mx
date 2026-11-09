#!/usr/bin/env node
/* mide-cob-wa-1 — COB-WA-1 (9-nov-2026)
 * El 💬 de cobro en el panel 🗓 Plan de Capsule, y «qué le toca hoy» con UN dueño.
 *   [A] PF.tocaHoy (el dueño): atrasado + próxima topado a la resta · solo
 *       atrasado · null fuera de `calendario` · null en cero · pesos enteros.
 *   [B] Los dos bebedores viejos (portal-viajero._saldoPortal y
 *       portal-mi-plan-migrado) ya NO arman la suma por su cuenta: le preguntan
 *       al dueño. Y plan_viajero manda `toca` del mismo dueño.
 *   [C] La pantalla REAL en vm: _vjCobroTexto / _vjCobroHref / el texto del plan.
 *       Con `toca` dice ese monto y su fecha; sin `toca` cae a la resta y lo
 *       DICE; liquidado → nada; el link solo con 10 dígitos MX; el texto del
 *       plan manda al Portal.
 *   [S] Sabotaje al tope de la resta en el dueño (sha1 careado) → rojo.
 * ⚠️ SIN ANCLA (árbol de trabajo). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (e) { ok = false; } if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function rebana(txt, ancla) {
  const i = txt.indexOf(ancla);
  if (i < 0) throw new Error('ancla no encontrada: ' + ancla);
  let d = 0, k = txt.indexOf('{', i), s = false, sc = '', esc = false;
  for (; k < txt.length; k++) {
    const c = txt[k];
    if (esc) { esc = false; continue; }
    if (s) { if (c === '\\') { esc = true; continue; } if (c === sc) s = false; continue; }
    if (c === '"' || c === "'" || c === '`') { s = true; sc = c; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (!d) { k++; break; } }
  }
  return txt.slice(i, k);
}

const PF_PATH = path.join(RAIZ, 'netlify/functions/_lib/plan-fijo.js');
function dueno() { delete require.cache[require.resolve(PF_PATH)]; return require(PF_PATH); }

function bloqueA(PF, etiqueta) {
  console.log('\n[A] el dueño tocaHoy' + (etiqueta ? ' ' + etiqueta : ''));
  const plan = { estado: 'calendario', atrasado: 300, proxima: { n: 2, lbl: '9–16 nov', hasta: '2026-11-16', monto: 975 } };
  const t = PF.tocaHoy(plan, 5600);
  af(t && t.monto === 1275, 'atrasado 300 + próxima 975 = 1,275 (resta 5,600 no topa)');
  af(t && t.atrasado === 300 && t.hasta === '2026-11-16' && t.proxima_lbl === '9–16 nov', 'viaja el atrasado, la fecha límite y el rótulo de la cuota');
  af(t && t.etiqueta === 'Atrasado + 9–16 nov', 'etiqueta «Atrasado + <cuota>»');
  const t2 = PF.tocaHoy(plan, 800);
  af(t2 && t2.monto === 800, 'TOPADO a la resta: con resta 800 toca 800 (no 1,275)');
  const t3 = PF.tocaHoy({ estado: 'calendario', atrasado: 450, proxima: null }, 2000);
  af(t3 && t3.monto === 450 && t3.etiqueta === 'Pagos atrasados' && t3.hasta === null, 'solo atrasado, sin próxima: 450 · «Pagos atrasados» · sin fecha');
  af(PF.tocaHoy({ estado: 'sin_plan_fijo' }, 2000) === null, 'fuera de calendario → null (quien pregunta decide su respaldo)');
  af(PF.tocaHoy({ estado: 'calendario', atrasado: 0, proxima: null }, 2000) === null, 'calendario sin nada que cobrar → null');
  af(PF.tocaHoy(plan, 0) === null && PF.tocaHoy(null, 500) === null, 'resta 0 o sin plan → null');
  const t4 = PF.tocaHoy({ estado: 'calendario', atrasado: 100.4, proxima: { n: 1, lbl: 'x', monto: 200.6 } }, 9999);
  af(t4 && t4.monto === 301 && Number.isInteger(t4.monto), 'pesos ENTEROS (100.4 + 200.6 → 100 + 201 = 301)');
}

(async () => {
  const PF = dueno();
  af(typeof PF.tocaHoy === 'function', 'plan-fijo exporta tocaHoy');
  bloqueA(PF);

  console.log('\n[B] los bebedores le preguntan al dueño (cero sumas propias)');
  {
    const PV = sinComentarios(fs.readFileSync(path.join(RAIZ, 'netlify/functions/portal-viajero.js'), 'utf8'));
    const PM = sinComentarios(fs.readFileSync(path.join(RAIZ, 'netlify/functions/portal-mi-plan-migrado.js'), 'utf8'));
    const AC = sinComentarios(fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8'));
    af(/PF\.tocaHoy\(/.test(PV), 'portal-viajero pregunta PF.tocaHoy');
    af(!/plan\.atrasado/.test(PV), 'portal-viajero ya NO lee plan.atrasado por su cuenta');
    af(/PF\.tocaHoy\(/.test(PM), 'portal-mi-plan-migrado pregunta PF.tocaHoy');
    af(!/plan\.atrasado\)\s*\|\|\s*0\)\s*\+/.test(PM), 'portal-mi-plan-migrado ya NO suma atrasado + próxima a mano');
    af(/toca:\s*PF\.tocaHoy\(plan,/.test(AC), 'plan_viajero manda `toca` del mismo dueño');
    const copias = [PV, PM, AC].filter((s) => /atrasado\)\s*\|\|\s*0\)\s*\+\s*\(/.test(s)).length;
    af(copias === 0, 'la suma «atrasado + próxima» no vive escrita en ningún bebedor (' + copias + ')');
  }

  console.log('\n[C] la pantalla REAL en vm');
  {
    const KH = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
    const sb = { console, window: {}, navigator: {}, showToast: () => {} };
    sb.window = sb;
    vm.createContext(sb);
    const piezas = [
      rebana(KH, 'function _cobDigits(s) {'),   // el dueño de «solo dígitos» que _waDigits10 pide
      rebana(KH, 'function _waDigits10(s) {'),
      rebana(KH, 'function _vjPlanFecha(ds) {'),
      rebana(KH, 'function _vjPlanCuotas(d) {'),
      rebana(KH, 'function _vjPlanTitulo(d) {'),
      rebana(KH, 'function _vjPlanTexto(d) {'),
      rebana(KH, 'function _vjCobroTexto(d) {'),
      rebana(KH, 'function _vjCobroHref(d) {'),
    ];
    // Los dueños que la pantalla usa y aquí no hacen falta enteros.
    vm.runInContext([
      'const _VJPLAN_ESTADO = ' + rebana(KH, 'const _VJPLAN_ESTADO = ').replace(/^const _VJPLAN_ESTADO = /, '') + ';',
      KH.slice(KH.indexOf('const _COB_PORTAL_URL'), KH.indexOf('\n', KH.indexOf('const _COB_PORTAL_URL'))),
      "function _spFmtMxn(n){ return '$' + Number(n||0).toLocaleString('es-MX'); }",
      "function khPaqueteTexto(v){ return String((v && v.tipo_paquete) || '').toUpperCase(); }",
    ].concat(piezas).join('\n'), sb);

    const base = {
      viajero: { id: 'v1', nombre: 'Sahid Solis Leos', evento_id: 'fuerzaregida#0', paquete: 'stay', zona: 'Cancha VIP', celular: '8991234567' },
      evento: { nombre: 'Fuerza Regida', fecha: '11 ene 2027', venue: 'Estadio BBVA' },
      total: 4200, abonado: 300, resta: 3900, abonado_previo: 0, abonos: [],
      plan: { estado: 'calendario', atrasado: 0, cuotas: [], proxima: { n: 1, lbl: '9–16 nov', hasta: '2026-11-16', monto: 975 } },
      toca: { monto: 975, atrasado: 0, etiqueta: '9–16 nov', hasta: '2026-11-16', proxima_lbl: '9–16 nov' },
      banco: null,
    };
    const txt = vm.runInContext('_vjCobroTexto', sb)(base);
    af(txt && txt.includes('$975') && txt.includes('Fuerza Regida') && txt.includes('16 nov 2026'), 'con toca: dice $975, el evento y la fecha límite');
    af(txt && txt.includes('www.conectareynosa.mx/portal'), 'manda al Portal');
    af(txt && /Mercado Pago/.test(txt) && /comprobante/.test(txt), 'nombra los dos caminos (comprobante · en línea)');
    af(txt && !/anterior que quedó pendiente/.test(txt), 'sin atrasado no inventa un «pago anterior»');
    const conAtr = Object.assign({}, base, { toca: { monto: 1275, atrasado: 300, hasta: '2026-11-16', etiqueta: 'Atrasado + 9–16 nov' } });
    const t2 = vm.runInContext('_vjCobroTexto', sb)(conAtr);
    af(t2 && t2.includes('$1,275') && t2.includes('Incluye $300'), 'con atrasado: $1,275 e «Incluye $300 de un pago anterior»');
    const sinToca = Object.assign({}, base, { toca: null, plan: { estado: 'sin_plan_fijo', cuotas: [] } });
    const t3 = vm.runInContext('_vjCobroTexto', sb)(sinToca);
    af(t3 && t3.includes('$3,900') && /lo que te falta/.test(t3), 'sin toca (sin rol fijo): cae a la RESTA y lo DICE');
    af(vm.runInContext('_vjCobroTexto', sb)(Object.assign({}, base, { resta: 0, plan: { estado: 'liquidado', cuotas: [] }, toca: null })) === null, 'liquidado → sin cobro');
    af(vm.runInContext('_vjCobroTexto', sb)(Object.assign({}, base, { plan: { estado: 'sin_total', cuotas: [] }, toca: null, total: null, resta: null })) === null, 'sin total → sin cobro (no se cobra un número que no existe)');
    const href = vm.runInContext('_vjCobroHref', sb)(base);
    af(href && href.startsWith('https://wa.me/528991234567?text=') && decodeURIComponent(href.split('text=')[1]).includes('$975'), 'link wa.me/52 + 10 dígitos con el texto adentro');
    af(vm.runInContext('_vjCobroHref', sb)(Object.assign({}, base, { viajero: Object.assign({}, base.viajero, { celular: '19565551234' }) })) === null, '11 dígitos (EE.UU.) → sin link (no se adivina un número)');
    af(vm.runInContext('_vjCobroHref', sb)(Object.assign({}, base, { viajero: Object.assign({}, base.viajero, { celular: null }) })) === null, 'sin celular → sin link (queda copiar)');
    const plan = vm.runInContext('_vjPlanTexto', sb)(base);
    af(plan && plan.includes('www.conectareynosa.mx/portal') && /paga en línea/.test(plan), 'el texto del plan también manda al Portal (subir comprobante o pagar en línea)');
    // El panel pinta el botón con el monto que toca y DELEGA en los dueños.
    const panel = rebana(KH, 'async function _vjPlanVer(id, nombre) {');
    af(panel.includes('_vjCobroTexto(d)') && panel.includes('_vjCobroHref(d)'), 'el panel 🗓 Plan arma el botón con _vjCobroTexto/_vjCobroHref');
    af(panel.includes('vj-cobro-wa'), 'y lo pinta con su clase (link verde o copiar)');
  }

  console.log('\n[S] sabotaje: el dueño deja de topar a la resta');
  {
    const orig = fs.readFileSync(PF_PATH, 'utf8');
    const bak = PF_PATH + '.bak-cob';
    fs.copyFileSync(PF_PATH, bak);
    const sab = orig.replace('const monto = Math.min(r, atrasado + prox);', 'const monto = atrasado + prox;');
    af(sha1(sab) !== sha1(orig), 'la sonda MUTÓ el archivo (sha1 ' + sha1(orig) + ' → ' + sha1(sab) + ')');
    fs.writeFileSync(PF_PATH, sab);
    let rojosSab = 0;
    try {
      const PFs = dueno();
      const t2 = PFs.tocaHoy({ estado: 'calendario', atrasado: 300, proxima: { n: 2, lbl: 'x', monto: 975 } }, 800);
      rojosSab = (t2 && t2.monto === 800) ? 0 : 1;
    } finally {
      fs.copyFileSync(bak, PF_PATH); fs.unlinkSync(bak);
    }
    af(rojosSab === 1, 'saboteado, el tope cae y la aserción se pone ROJA (cobraría 1,275 a quien debe 800)');
    af(sha1(fs.readFileSync(PF_PATH, 'utf8')) === sha1(orig), 'restaurado byte a byte (' + sha1(orig) + ')');
    dueno();
  }

  console.log('\n' + (R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();
