#!/usr/bin/env node
// [SIN-SOLO-BOLETO-1 · 19-oct-2026] Careo: el index NO dice «solo boleto» en nada
// que el cliente pueda ver. Palabra de Memo: «JAMAS DEBE DE VOLVER A SALIR EN EL INDEX».
//
// Lee el ÁRBOL DE TRABAJO a propósito (es un vigilante vivo, no un careo entre
// commits: tiene que cazar la regresión que alguien acaba de escribir). Su control
// positivo NO depende de un commit: se le siembra la frase y se exige que la cace,
// y se exige que un comentario con la frase NO cuente.
const fs = require('fs');
const path = require('path');
const { apariciones } = require('../netlify/functions/_lib/sin-solo-boleto');
const { compilarEV } = require('../netlify/functions/_lib/esferas-compile');

let ok = 0, ko = 0;
const af = (c, m) => { if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

console.log('[A] el index de hoy');
const hoy = apariciones(idx);
af(hoy.length === 0, 'cero apariciones visibles' + (hoy.length ? ': ' + JSON.stringify(hoy.slice(0, 5)) : ''));
af(/class="pkg-tag pkg-tag-cheap"><\/span>/.test(idx), 'la etiqueta del CHEAP existe y va VACÍA (la preventa la sigue usando)');
af(/\.pkg-tag:empty\{display:none\}/.test(idx), 'una etiqueta vacía no se pinta (.pkg-tag:empty)');

console.log('[B] control positivo del instrumento');
af(apariciones('<span class="pkg-tag">Solo boleto</span>').length === 1, 'caza la etiqueta en HTML');
af(apariciones("x={cheap:'CHEAP — Solo boleto'}").length === 1, 'caza la cadena de JS');
af(apariciones("inc:['Solo boletos','Kit']").length === 1, 'caza el plural en un «incluye»');
af(apariciones('// solo boleto, explicado en un comentario').length === 0, 'un comentario // NO cuenta');
af(apariciones('/* solo boleto */ a{b:c}').length === 0, 'un comentario /* */ NO cuenta');
af(apariciones("u='https://x.com/a'; t='Solo boleto'").length === 1, 'un https:// no se come la línea');

console.log('[C] el publish de Esferas lo rehúsa');
const src = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'esferas-publicar.js'), 'utf8');
af(/require\('\.\/_lib\/sin-solo-boleto'\)/.test(src), 'esferas-publicar pide al dueño');
af(/sinSoloBoleto\(contenidoNuevo\)/.test(src) && /statusCode: 409/.test(src.slice(src.indexOf('SIN-SOLO-BOLETO-1'))), 'y rehúsa con 409 si el index compilado lo trae');
try {
  // Una ficha que lo meta en su «incluye» tiene que salir en el index compilado
  // (y por lo tanto el candado la ve). Si el compilador cambiara de forma y esto
  // truena, el careo lo dice en vez de pasar en vacío.
  const r = compilarEV({ esferas: [], indexHtml: idx });
  af(typeof r.contenidoNuevo === 'string' && apariciones(r.contenidoNuevo).length === 0, 'compilar sin fichas nuevas deja el index limpio');
} catch (e) { af(false, 'compilarEV respondió: ' + e.message); }

console.log((ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
process.exit(ko ? 1 : 0);
