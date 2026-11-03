#!/usr/bin/env node
// mide:correo-puntos-1 — el correo con puntos raros se rechaza al reservar y se
// NOMBRA en la bandeja (caso Mia, «miaa..galvarado002@gmail.com», 3-nov-2026).
// Sin ancla: carga del árbol de trabajo. Mide el DUEÑO (_lib/correo-forma), su
// ESPEJO del index careado caso por caso, y el cableo de los 3 lectores.
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
let ok = 0, mal = 0;
const af = (c, m) => { try { if (c()) { ok++; console.log('  ✓', m); } else { mal++; console.log('  ✗', m); } } catch (e) { mal++; console.log('  ✗', m, '—', e.message); } };
const F = require(path.join(RAIZ, 'netlify/functions/_lib/correo-forma'));
console.log('[D] el dueño');
const MALOS = ['miaa..galvarado002@gmail.com', '.a@gmail.com', 'a.@gmail.com', 'a@.gmail.com', 'a@gmail..com', 'a@gmail.con', 'a b@x.com', 'ab@gmail', 'a@@b.com'];
const BUENOS = ['miaa.galvarado002@gmail.com', 'juan_perez@hotmail.com', 'x.y.z@yahoo.com.mx', 'A.B@Gmail.COM'];
MALOS.forEach((c) => af(() => F.problemaCorreo(c) && !F.esCorreoUsable(c), `rechaza «${c}» — ${F.problemaCorreo(c)}`));
BUENOS.forEach((c) => af(() => !F.problemaCorreo(c) && F.esCorreoUsable(c), `acepta «${c}»`));
af(() => /dos puntos seguidos/.test(F.problemaCorreo('miaa..galvarado002@gmail.com')), 'el caso de Mia dice el porqué en palabras');
console.log('[E] el espejo del index');
const ix = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const i = ix.indexOf('function _reqCorreoProblema'), j = ix.indexOf('\nfunction _reqEnviar');
af(() => i > 0 && j > i, 'el index declara _reqCorreoProblema');
const espejo = new Function(ix.slice(i, j) + ';return _reqCorreoProblema')();
const todos = MALOS.concat(BUENOS, ['', '  ok@x.io ', 'a@b.c', 'a@b.CM', 'a@b.comm']);
af(() => todos.every((c) => espejo(c) === F.problemaCorreo(c)), `espejo = dueño en ${todos.length} casos`);
const env = ix.slice(j, ix.indexOf('\n}', j + 5));
af(() => /_reqCorreoProblema\(correo\)/.test(env) && /_reqCorreoProblema\(acomp\[ai\]\.correo\)/.test(env), '_reqEnviar lo pregunta para titular y acompañantes');
console.log('[S] el servidor y la bandeja');
const rc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/requisicion-crear.js'), 'utf8');
af(() => (rc.match(/problemaCorreo\(/g) || []).length >= 4, 'requisicion-crear rechaza con el dueño (titular + acompañantes)');
const ar = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js'), 'utf8');
af(() => /correo_problema/.test(ar) && /problemaCorreo/.test(ar), 'la bandeja recibe correo_problema del dueño');
const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
af(() => /r\.correo_problema/.test(kh) && /no le llega la confirmación ni el contrato/.test(kh), 'la tarjeta pinta el aviso rojo');
console.log(`\n${mal ? '🔴 ROJO' : '✅ VERDE'} · ${ok} en verde · ${mal} en rojo`);
process.exit(mal ? 1 : 0);
