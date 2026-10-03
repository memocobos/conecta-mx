#!/usr/bin/env node
// =============================================================================
// mide:consuelo-paq-1 — LA LÍNEA DE PAQUETES Y LAS FECHAS SE DERIVAN
// =============================================================================
// 🔴 EL DEFECTO, cazado al renderizar el correo antes de mandarlo (Memo lo pidió
// ver): la plantilla decía TECLEADO «Aplica en PLUS, STAY y CHEAP (no aplica en
// RIDE)» y el KAROL real trae `excludePkg:['ride','stay','cheap']` — o sea SOLO
// PLUS. Memo mismo lo había dicho: «solo PLUS». 157 personas habrían intentado el
// código en STAY o CHEAP y el checkout se lo rechaza.
//
// 🔒 ES LA TERCERA CARA DEL MISMO DEFECTO QUE CONSUELO-VERDAD-1 YA ARREGLÓ DOS
// VECES: un texto escrito al lado del dato que describe. Se derivaron la vigencia
// y la fecha del evento; esta línea no. La prueba de que era un fósil: ese texto
// describe exactamente a `LOOP`, que sí trae `excludePkg:['ride']` a secas.
//
// Y la segunda mitad: `karolg` es MULTIFECHA (6, 7 y 8 de noviembre) y el correo
// anunciaba solo `ds`, la PRIMERA — justo la que no era el premio del sorteo.
// Palabra de Memo (2-oct): van las tres.
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const C = require(path.join(RAIZ, 'netlify/functions/giveaway-consuelo.js'));
const FUENTE = fs.readFileSync(path.join(RAIZ, 'netlify/functions/giveaway-consuelo.js'), 'utf8');
// 🔒 SIN COMENTARIOS. La aserción de ausencia se caza sola: el comentario que
// explica por qué el texto viejo se fue LO CONTIENE, y arriba está dos veces.
const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let v = 0, r = 0;
const af = (c, m) => { let ok = false, ex = '';
  try { ok = !!(typeof c === 'function' ? c() : c); } catch (e) { ok = false; ex = ' [' + e.message + ']'; }
  if (ok) v++; else { r++; console.log('  ❌ ' + (typeof m === 'function' ? m() : m) + ex); } };
const lanza = (fn, frag) => { try { fn(); return false; }
  catch (e) { return !frag || e.message.indexOf(frag) >= 0; } };

const S = (ex) => ({ amount: 500, desc: '$500 de descuento', onlyEvent: 'karolg', excludePkg: ex });
const PROMO = { codigo: 'KAROL', texto: '$500 de descuento', expira: '2026-11-01 04:59:00+00' };
const EV3 = { nombre: 'Karol G en Monterrey', ds: '2026-11-06',
              dsList: ['2026-11-06', '2026-11-07', '2026-11-08'] };

console.log('\n═══ mide:consuelo-paq-1 ═══════════════════════════════════════');

console.log('\n[A] el texto tecleado ya NO está en el código vivo');
af(() => !/Aplica en <strong>PLUS<\/strong>/.test(CODIGO),
   '🔴 la línea tecleada de paquetes sigue en el código');
af(() => /lineaPaquetes\(/.test(CODIGO), 'nadie llama a `lineaPaquetes`');
af(() => /escapeHtml\(lineaPaq\)/.test(CODIGO), 'la plantilla no pinta la línea derivada');
// Y el candado de que SÍ seguía ahí antes: el comentario lo conserva a propósito.
// ⚠️ El comentario lo conserva en PLANO, no con el `<strong>` del HTML — que es
// como lo lee un humano. Mi primera aserción buscaba la forma HTML y salió roja
// contra un comentario que sí estaba: el rojo era mío, no del código.
af(() => /Aplica en PLUS, STAY y CHEAP \(no aplica en RIDE\)/.test(FUENTE),
   'el comentario dejó de conservar el texto viejo: sin él nadie sabrá qué decía');
// 🔒 Y LA PRUEBA DE QUE ERA UN FÓSIL DE OTRA PROMO: con `excludePkg:['ride']`
// —la forma de `LOOP`— la línea derivada sale TEXTUAL igual a la que estaba
// tecleada. O sea que el texto era correcto… para un código que no es éste.
af(() => C._lineaPaquetes(C._paquetesPermitidos(S(['ride'])))
         === 'Aplica en PLUS, STAY y CHEAP (no aplica en RIDE).',
   'la línea derivada con [ride] ya no reproduce el texto viejo: revisa si cambió el formato');

console.log('\n[B] 🔒 LA LÍNEA SE DERIVA — con su CONTROL POSITIVO');
{
  const soloPlus = C._lineaPaquetes(C._paquetesPermitidos(S(['ride', 'stay', 'cheap'])));
  const comoLoop = C._lineaPaquetes(C._paquetesPermitidos(S(['ride'])));
  console.log('    excludePkg [ride,stay,cheap] → «' + soloPlus + '»');
  console.log('    excludePkg [ride]            → «' + comoLoop + '»');
  af(() => soloPlus === 'Aplica solo en PLUS.', 'KAROL tenía que dar «Aplica solo en PLUS.», dio «' + soloPlus + '»');
  // 🔒 CONTROL POSITIVO: si la línea NO cambia al mover `excludePkg`, estaba tecleada.
  af(() => comoLoop !== soloPlus,
     '🔴 CONTROL POSITIVO: la línea NO cambió al mover `excludePkg` — sigue tecleada');
  af(() => /STAY/.test(comoLoop) && /CHEAP/.test(comoLoop) && /RIDE/.test(comoLoop),
     'con `excludePkg:[ride]` tenía que nombrar STAY y CHEAP como permitidos y RIDE fuera: «' + comoLoop + '»');
  af(() => C._lineaPaquetes(C._paquetesPermitidos(S([]))) === 'Aplica en cualquier paquete.',
     'sin exclusiones tenía que decir «cualquier paquete»');
  af(() => C._lineaPaquetes(C._paquetesPermitidos(S(['ride', 'cheap']))) === 'Aplica en PLUS y STAY (no aplica en CHEAP ni RIDE).',
     'dos y dos: dio «' + C._lineaPaquetes(C._paquetesPermitidos(S(['ride', 'cheap']))) + '»');
  // Mayúsculas/espacios del sitio no deben colarse como paquete válido.
  af(() => C._paquetesPermitidos(S([' RIDE ', 'Stay', 'cheap'])).join() === 'PLUS',
     'la comparación no normaliza: ' + C._paquetesPermitidos(S([' RIDE ', 'Stay', 'cheap'])).join());
}

console.log('\n[C] 🔒 SI NO SE PUEDE LEER, NO SE MANDA');
af(() => lanza(() => C._paquetesPermitidos(null), 'promo del sitio'),
   '🔴 sin la promo del sitio NO truena: inventaría la línea');
af(() => lanza(() => C._paquetesPermitidos(S('ride,stay')), 'no es una lista'),
   '🔴 un `excludePkg` que no es lista NO truena: un «aplica en todos» por defecto es la mentira que vinimos a quitar');
af(() => lanza(() => C._paquetesPermitidos(S(['ride', 'stay', 'cheap', 'plus'])), 'NINGÚN paquete'),
   '🔴 con los cuatro excluidos NO truena: anunciaría un descuento que no sirve para nada');
// ⚠️ Y el ausente SÍ es legible: es la semántica del propio index («no excluyo nada»).
af(() => C._paquetesPermitidos({ amount: 500 }).length === 4,
   'un `excludePkg` AUSENTE tenía que valer «no excluye nada», no truena');

// ═══ [C2] 🔴 EL ORDEN DE LAS GUARDAS — y esta aserción nació de un rojo mío ══
// Puse la guarda del SITIO antes que la del ARTISTA y el caso «evento sin nombre»
// de `mide:giveaway-karolg` empezó a tronar diciendo «no se pudo leer la promo del
// sitio». Las dos se rehúsan a mandar — pero **mandan a buscar a sitios
// distintos**, y un motivo equivocado cuesta el tiempo de quien lo lee.
// Misma ley que el `revento` de CAREO-RED-1: el orden del `if` es parte del arreglo.
console.log('\n[C2] cada guarda reporta SU causa, no la del vecino');
{
  // Sin nombre Y sin sitio: tiene que hablar del NOMBRE (lo del evento va primero).
  let e1 = null;
  try { C._correoHtml('X', 'x', PROMO, { ds: '2026-11-06' }); } catch (e) { e1 = e; }
  af(() => !!e1, 'sin nombre no truena');
  af(() => e1 && /nombre/.test(e1.message),
     '🔴 sin nombre trona por la razón equivocada: «' + (e1 && e1.message) + '»');
  af(() => e1 && !/sitio/.test(e1.message),
     '🔴 el motivo habla del SITIO cuando lo que falta es el NOMBRE');
  // Con nombre pero sin sitio: AHORA sí tiene que hablar del sitio.
  let e2 = null;
  try { C._correoHtml('X', 'x', PROMO, EV3); } catch (e) { e2 = e; }
  af(() => !!e2 && /sitio/.test(e2.message),
     '🔴 con el evento completo y sin sitio no trona por el sitio: «' + (e2 && e2.message) + '»');
  // Y con las dos cosas: NO truena.
  af(() => { C._correoHtml('X', 'x', PROMO, EV3, S(['ride'])); return true; },
     'con evento y sitio completos el render NO debería tronar');
}

console.log('\n[D] las TRES fechas, derivadas de dsList');
{
  const tres = C._fechaEventos(EV3);
  console.log('    dsList de 3 → «' + tres + '»');
  af(() => tres === '6, 7 y 8 de noviembre', 'las tres fechas dieron «' + tres + '»');
  // 🔒 CONTROL POSITIVO: sin dsList cae a la singular, con día de la semana.
  const una = C._fechaEventos({ ds: '2026-11-06' });
  af(() => una === 'viernes 6 de noviembre', 'sin dsList tenía que dar la singular: «' + una + '»');
  af(() => tres !== una, '🔴 CONTROL POSITIVO: plural y singular dan lo MISMO — dsList no se está leyendo');
  // Dos fechas → «y», sin coma.
  af(() => C._fechaEventos({ ds: '2026-11-06', dsList: ['2026-11-06', '2026-11-07'] }) === '6 y 7 de noviembre',
     'dos fechas: ' + C._fechaEventos({ ds: '2026-11-06', dsList: ['2026-11-06', '2026-11-07'] }));
  // ⚠️ CRUZANDO DE MES cada día lleva el suyo: «31, 1 de noviembre» mentiría.
  const cruza = C._fechaEventos({ ds: '2026-10-31', dsList: ['2026-10-31', '2026-11-01'] });
  console.log('    cruzando de mes → «' + cruza + '»');
  af(() => cruza === '31 de octubre y 1 de noviembre', 'cruzando de mes dio «' + cruza + '»');
  // La fecha imposible se rechaza en la puerta, igual que la singular.
  af(() => lanza(() => C._fechaEventos({ dsList: ['2026-13-45', '2026-11-07'] })),
     '🔴 una fecha imposible en dsList no truena: se acomodaría sola a otro día');
  af(() => lanza(() => C._fechaEventos({ dsList: ['', '2026-11-07'] })),
     '🔴 una fecha vacía en dsList no truena');
}

console.log('\n[E] el correo IMPRESO lleva lo derivado (no el fuente: lo pintado)');
{
  const h = C._correoHtml('Ana Sofía', 'https://conectareynosa.mx/#karolg', PROMO, EV3, S(['ride', 'stay', 'cheap']));
  af(() => h.indexOf('Aplica solo en PLUS.') >= 0, '🔴 el HTML no trae la línea derivada');
  af(() => h.indexOf('6, 7 y 8 de noviembre') >= 0, '🔴 el HTML no trae las tres fechas');
  af(() => h.indexOf('en tu paquete PLUS') >= 0, '🔴 el HTML no trae «en tu paquete PLUS» (el copy de Memo)');
  af(() => h.indexOf('STAY') === -1 && h.indexOf('CHEAP') === -1,
     '🔴 el HTML MENCIONA STAY o CHEAP con un código que no aplica ahí');
  af(() => h.indexOf('Válido hasta el sábado 31 de octubre') >= 0, 'se movió la línea de vigencia');
  af(() => h.indexOf('$500 de descuento con código KAROL') === -1,
     'sigue el `desc_texto` viejo: «KAROL» saldría dos veces en la frase');
  // 🔒 «en tu paquete X» SOLO con uno. Con dos no se puede nombrar sin elegir
  // por el cliente, y elegir por él es el defecto de los defaults silenciosos.
  const h2 = C._correoHtml('Ana', 'x', PROMO, EV3, S(['ride']));
  af(() => h2.indexOf('en tu paquete') === -1,
     '🔴 con TRES paquetes permitidos el correo nombra uno: está eligiendo por el cliente');
  af(() => h2.indexOf('Aplica en PLUS, STAY y CHEAP') >= 0, 'la línea de tres no salió: ' + /Aplica[^<]*/.exec(h2));
}

console.log('\n' + (r === 0
  ? (v === 0 ? '⚠️  NADA MEDIDO · esto NO es un verde' : '✅ VERDE · ' + v + ' en verde, 0 en rojo')
  : '🔴 ROJO · ' + v + ' en verde, ' + r + ' en rojo'));
process.exit(r === 0 && v > 0 ? 0 : 1);
