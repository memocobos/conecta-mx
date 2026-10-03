#!/usr/bin/env node
// =============================================================================
// mide:consuelo-boton — EL CORREO DE CONSUELO TIENE CÓMO DISPARARSE
// =============================================================================
// Pedido de Memo (2-oct-2026): quería mandar HOY el consuelo a los registrados de
// karolg y «en /sorteo con token NO aparece ningún botón de consuelo».
//
// 🔴 MEDIDO: el botón NO se perdió al rehacer el panel — NUNCA EXISTIÓ. Cero
// llamadores de `giveaway-consuelo` en el árbol, cero crons en netlify.toml, y las
// dos menciones de «consuelo» en sorteo.html eran PROSA. Los 88 de melanie salieron
// por una llamada a mano. Buscar un botón que nunca estuvo manda a revisar PRs sanas.
//
// 🔴🔒 Y LA GUARDA QUE JUSTIFICA ESTE CAREO MÁS QUE EL BOTÓN: `giveaway-consuelo`
// NO SABE DE ENSAYO. No lee `modo`, no usa `slugDe` ni `esEnsayo`, y consulta
// SIEMPRE `G.SLUG` — el slug real. Un clic desde el modo ensayo mandaría los correos
// DE VERDAD al padrón real. Es lo que advierte el comentario de `api()` sobre el
// `modo`, ahora con Resend del otro lado.
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const SORTEO = fs.readFileSync(path.join(RAIZ, 'sorteo.html'), 'utf8');
const FN = fs.readFileSync(path.join(RAIZ, 'netlify/functions/giveaway-consuelo.js'), 'utf8');
// Sin comentarios, para no cazarme a mí mismo con la prosa que explica el candado.
const sinCom = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const FN_CODIGO = sinCom(FN);

let v = 0, r = 0;
const af = (c, m) => { let ok = false; try { ok = !!c(); } catch (e) { ok = false; }
  if (ok) v++; else { r++; console.log('  ❌ ' + m); } };

console.log('\n═══ mide:consuelo-boton ═══════════════════════════════════════');

console.log('\n[A] el botón existe y tiene su puerta');
af(() => /id="consuelo"/.test(SORTEO), 'no existe el bloque #consuelo');
af(() => /id="cons-seco"/.test(SORTEO), 'no existe el botón del seco');
af(() => /id="cons-mandar"/.test(SORTEO), 'no existe el botón de mandar');
// Nace oculto en el MARKUP, no solo por JS: sin JS no se ofrece.
af(() => /<div class="story" id="consuelo" hidden>/.test(SORTEO),
   '🔴 #consuelo no nace `hidden` en el markup: con el JS caído se ofrecería un botón que manda correos');
af(() => /id="cons-mandar" hidden/.test(SORTEO),
   '🔴 «Mandar» no nace oculto: sin seco previo no puede estar a la vista');
// Se cuelga de la MISMA puerta que el story (token Y acepto), no de una copia.
af(() => /caja\.hidden = !storyPuede\(\);[\s\S]{0,200}pintarConsuelo/.test(SORTEO)
      || /function pintarConsuelo\(\)[\s\S]{0,300}storyPuede\(\)/.test(SORTEO),
   '🔴 #consuelo no usa `storyPuede()`: su puerta sería una SEGUNDA lista que todavía no divergió');
af(() => /pintarConsuelo\(\);/.test(SORTEO), 'nadie llama a pintarConsuelo()');

console.log('\n[B] 🔒 SIN SECO NO SE MANDA — el número del aviso es MEDIDO');
af(() => /consVisto\s*=\s*null/.test(SORTEO), 'no existe el estado `consVisto` del último seco');
af(() => /if \(!consVisto \|\| !consVisto\.destinatarios\)/.test(SORTEO),
   '🔴 el botón de mandar no exige un seco previo: el número del confirm sería inventado');
af(() => /window\.confirm\(/.test(SORTEO.slice(SORTEO.indexOf('cons-mandar'))),
   '🔴 mandar no pide confirmación');
af(() => /consVisto\.destinatarios/.test(SORTEO) && /'¿Mandar ' \+ n \+ ' correos/.test(SORTEO),
   'el confirm no dice el NÚMERO que salió del seco');

console.log('\n[C] 🔴 LA GUARDA DEL ENSAYO, por los DOS lados');
// Lado 1: la function NO sabe de ensayo. Si algún día aprende, este careo cae
// y manda a RELAJAR la guarda — no a borrarla a ciegas.
af(() => !/\bslugDe\b/.test(FN_CODIGO), '🔴 `giveaway-consuelo` ya usa `slugDe`: aprendió de ensayo → RELEE la guarda del botón');
af(() => !/\besEnsayo\b/.test(FN_CODIGO), '🔴 `giveaway-consuelo` ya usa `esEnsayo` → RELEE la guarda del botón');
af(() => /G\.SLUG/.test(FN_CODIGO), 'premisa: la function consulta `G.SLUG` (el slug real)');
// Lado 2: el botón SE REHÚSA en ensayo, y lo DICE.
af(() => /function consEnsayo\(\)/.test(SORTEO), 'no existe la guarda `consEnsayo()`');
af(() => /if \(MODO !== 'ensayo'\) return false;/.test(SORTEO),
   '🔴 la guarda no mira `MODO`: un clic en ensayo mandaría correos reales');
af(() => /if \(consEnsayo\(\)\) return;/g.test(SORTEO)
      && (SORTEO.match(/if \(consEnsayo\(\)\) return;/g) || []).length === 2,
   '🔴 la guarda del ensayo no está en LOS DOS botones: ' + ((SORTEO.match(/if \(consEnsayo\(\)\) return;/g) || []).length) + ' de 2');
af(() => /mandaría correos de verdad/.test(SORTEO), 'la guarda no explica POR QUÉ se rehúsa');

console.log('\n[D] 🔒 EL HANDLER NO TIENE PUERTA `confirmar` — y eso se AFIRMA');
// No es un defecto que se arregle aquí: es la razón de que la segunda puerta viva
// en el botón. Si alguien le pone `confirmar` a la function, este careo cae y manda
// a mirar si la del botón sigue haciendo falta.
af(() => !/confirmar/.test(FN_CODIGO),
   '⚠️ `giveaway-consuelo` ahora SÍ tiene `confirmar`: la segunda puerta del botón puede simplificarse — decídelo, no lo borres a ciegas');
af(() => /seco === true/.test(FN_CODIGO), 'premisa: el seco es `body.seco === true`');
af(() => /seco: seco/.test(SORTEO) || /JSON\.stringify\(\{ seco: seco \}\)/.test(SORTEO),
   'el botón no manda `seco` en el cuerpo');

console.log('\n[E] 🔒 `sin_marcar` SE DICE, y de primero');
// «Recibió el correo y no quedó marcado» es la única falla que un segundo clic
// REPITE. Callarla sería el defecto.
af(() => /sin_marcar/.test(SORTEO), '🔴 el botón no lee `sin_marcar` de la respuesta');
af(() => /RECIBIERON Y NO QUEDARON MARCADAS/.test(SORTEO),
   '🔴 `sin_marcar` no se dice con sus palabras: un número pelado no avisa de que un reintento lo repetiría');
af(() => /j\.sin_marcar \?/.test(SORTEO), 'no se antepone cuando no es cero');
// Y el error del servidor se enseña TAL CUAL (la voz la manda el servidor).
af(() => /\(j && j\.error\)/.test(SORTEO), 'el botón no enseña el error del servidor tal cual');

console.log('\n' + (r === 0
  ? (v === 0 ? '⚠️  NADA MEDIDO · esto NO es un verde' : '✅ VERDE · ' + v + ' en verde, 0 en rojo')
  : '🔴 ROJO · ' + v + ' en verde, ' + r + ' en rojo'));
process.exit(r === 0 && v > 0 ? 0 : 1);
