#!/usr/bin/env node
// =============================================================================
// mide:excel-ag-pantalla — LA SECCIÓN SE PINTA Y EL BOTÓN MANDA LO QUE ENSEÑÓ
// =============================================================================
// 🔴 ESTE CAREO EXISTE PORQUE FALTÓ: construí `ag_cerrar`/`ag_abrir` en el plan y
// NINGÚN módulo de UI los pintaba. Lo cazó Jane contra el árbol mergeado, y mi
// «vista previa real» había salido de un SCRIPT, no de la pantalla de Memo.
// 🔒 Es *probar el camino, no la función*, y el camino es LA PANTALLA. Así que
// aquí se renderiza con la FUNCIÓN REAL de la UI (`_excelAgHtml`) y se mide el
// HTML que sale, no lo que yo creo que sale.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let v = 0, r = 0;
const af = (c, m) => { let ok = false, ex = '';
  try { ok = !!(typeof c === 'function' ? c() : c); } catch (e) { ok = false; ex = ' [' + e.message + ']'; }
  if (ok) v++; else { r++; console.log('  ❌ ' + (typeof m === 'function' ? m() : m) + ex); } };

// ── Se carga el MÓDULO REAL de la UI en un `vm`, con los ayudantes que usa ───
// 🔒 No se re-implementa `_excelAgHtml`: se EJECUTA la del archivo. Copiarla aquí
// sería medir mi copia — el defecto de las dos listas que todavía no divergen.
const FUENTE = fs.readFileSync(path.join(RAIZ, 'kamehouse-eventos.js'), 'utf8');
const ctx = { document: { getElementById: () => null }, window: {}, showToast: () => {},
              console: { log: () => {} } };
vm.createContext(ctx);
vm.runInContext(FUENTE, ctx, { filename: 'kamehouse-eventos.js' });
const _excelAgHtml = ctx._excelAgHtml;

console.log('\n═══ mide:excel-ag-pantalla ═══════════════════════════════════');

console.log('\n[A] la función existe y está cableada en el panel');
af(() => typeof _excelAgHtml === 'function', '🔴 `_excelAgHtml` no existe en el módulo de UI');
// 🔒 Y ALGUIEN LA LLAMA. Una función de UI sin llamador es la guarda inalcanzable:
// exactamente el defecto que esta tuerca viene a arreglar.
af(() => (FUENTE.match(/\$\{_excelAgHtml\(/g) || []).length === 1,
   '🔴 nadie la llama desde el panel: un pintor sin llamador no pinta nada');
af(() => /_excelAplicarPreviaHtml/.test(FUENTE.slice(0, FUENTE.indexOf('${_excelAgHtml('))),
   'no se llama desde dentro de la vista previa del aplicar');

const CERRAR = [{ zona: 'Perfil', zona_excel: 'Perfil', ag: true, pedido: 2, restan: 0, motivo: 'el pedido de 2 se agotó (Restan 0)' }];
const ABRIR  = [{ zona: 'Oro', zona_excel: 'Oro', ag: false, pedido: 5, restan: 3, motivo: 'quedan 3 de un pedido de 5' }];
const plan = (extra) => Object.assign({ ag_estado: 'no_pedido', ag_cerrar: [], ag_abrir: [],
  ag_avisos: { sobrevendidas: [], vendo_sin_pedido: [], sin_ficha: [], sin_ficha_sobrevendidas: 0, prox_saltadas: [] } }, extra || {});

console.log('\n[B] 🔒 los CUATRO estados, cuatro letreros');
{
  af(() => _excelAgHtml(plan({ ag_estado: 'apagada' })) === '',
     'con la palomita APAGADA la sección se pinta: no es un hueco, es que nadie la prendió');
  const il = _excelAgHtml(plan({ ag_estado: 'ilegible', ag_motivo: 'no se pudo leer el catálogo' }));
  af(() => /alert-error/.test(il) && /no se pudo leer el cat/.test(il),
     '🔴 «prendida pero ilegible» no se dice: un vacío sin razón se lee como «nada que cambiar»');
  af(() => /no es porque no hubiera nada que cambiar/.test(il), 'el letrero de ilegible no lo aclara');
  const np = _excelAgHtml(plan({ ag_cerrar: CERRAR }));
  af(() => /NO la incluye en el bot/.test(np),
     '🔴 con estado `no_pedido` la pantalla no avisa de que el botón grande no la manda');
}

console.log('\n[C] 🔒 CERRADAS Y REACTIVADAS: botones SEPARADOS');
{
  const h = _excelAgHtml(plan({ ag_cerrar: CERRAR, ag_abrir: ABRIR }));
  const alcances = [...h.matchAll(/data-alcance="([^"]*)"/g)]
    .map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')));
  console.log('    botones: ' + alcances.length + '  ·  alcances: ' + JSON.stringify(alcances));
  af(() => alcances.length === 2, '🔴 hay ' + alcances.length + ' botón(es): cerrar y reactivar deben tener el SUYO');
  // 🔒 LO QUE SE ENSEÑA ES LO QUE SE MANDA: las claves de cada botón son las zonas
  // que ESE renglón pintó, ni una más.
  af(() => alcances.every((a) => a.solo === 'disponibilidad'),
     '🔴 un botón no acota a `disponibilidad`: mandaría el plan global');
  af(() => JSON.stringify(alcances[0].claves) === '["Perfil"]',
     'el botón de cerrar no manda exactamente la zona pintada: ' + JSON.stringify(alcances[0].claves));
  af(() => JSON.stringify(alcances[1].claves) === '["Oro"]',
     'el botón de reactivar no manda exactamente su zona: ' + JSON.stringify(alcances[1].claves));
  // 🔴 Y NUNCA LOS DOS EN UN BOTÓN: aceptar un cierre no puede deshacer una
  // decisión de Memo (él agota zonas a propósito).
  af(() => !alcances.some((a) => a.claves.length === 2),
     '🔴 UN SOLO BOTÓN manda cierre Y reactivación: aplicar uno desharía la decisión del otro');
  af(() => /NO la apliques/.test(h), 'la reactivación no avisa de que pudo ser a propósito');
  // Cada renglón enseña sus números y el de/a.
  af(() => /pedido 2 · restan 0/.test(h), 'el renglón de cerrar no enseña pedido/restan');
  af(() => /a la venta → AGOTADA/.test(h), 'el renglón de cerrar no enseña el de/a');
  af(() => /AGOTADA → a la venta/.test(h), 'el renglón de reactivar no enseña el de/a');
  // 🔒 CONTROL POSITIVO: sin propuesta NO hay botón. Si lo hubiera, el botón no
  // saldría de lo pintado.
  const vacio = _excelAgHtml(plan({ ag_cerrar: [], ag_abrir: [] }));
  af(() => !/data-alcance/.test(vacio),
     '🔴 CONTROL POSITIVO: sin nada que proponer SIGUE habiendo botón — no sale de lo pintado');
  af(() => (vacio.match(/— ninguna/g) || []).length === 2, 'sin propuesta no dice «ninguna» en los dos montones');
}

console.log('\n[D] 🔴 los AVISOS se pintan y NO tienen botón');
{
  const h = _excelAgHtml(plan({ ag_cerrar: CERRAR, ag_avisos: {
    sobrevendidas: [{ zona: 'Platino', zona_ficha: 'Platino', aviso: 'SOBREVENDIDA -7', pedido: 5, restan: -7, pestana: 'Ricardo Arjona - 5 de diciembre' },
                    { zona: 'VIP', zona_ficha: 'VIP', aviso: 'SOBREVENDIDA -1', pedido: 6, restan: -1, prox: true, pestana: 'X' }],
    vendo_sin_pedido: [{ zona: 'Oro', zona_ficha: 'Oro', pedido: 0, restan: -2, motivo: 'Pedido 0: se compra conforme se vende' }],
    sin_ficha: [{ zona: 'Club Seat', pedido: 25, restan: -4, sobrevendida: true },
                { zona: 'Otra', pedido: 3, restan: 1, sobrevendida: false }],
    sin_ficha_sobrevendidas: 1, prox_saltadas: [{ zona: 'Plata', zona_ficha: 'Plata', pedido: 10, restan: 0 }] } }));
  af(() => /SOBREVENDIDA -7/.test(h), '🔴 la sobrevendida no GRITA su número');
  af(() => /Ricardo Arjona - 5 de diciembre/.test(h), '🔴 la sobrevendida no nombra la PESTAÑA que hay que revisar');
  af(() => /NO se arregla cerrando la zona/.test(h), 'no se dice que cerrar no lo arregla');
  af(() => /en PRÓXIMAMENTE, no se cierra/.test(h), 'una sobrevendida `prox` no dice que no se cierra');
  af(() => /Pedido 0<\/b> la palomita jamás cierra/.test(h) || /Pedido 0.*jamás cierra/.test(h),
     'no se dice que con Pedido 0 jamás se cierra la venta');
  af(() => /1 de éstas están SOBREVENDIDAS y van primero/.test(h),
     'el listado sin_ficha no dice cuántas están sobrevendidas');
  af(() => h.indexOf('Club Seat') < h.indexOf('Otra'), '🔴 la sobrevendida sin ficha no va ARRIBA');
  // 🔒 Y NINGÚN AVISO TRAE BOTÓN: no escriben nada.
  const alc = [...h.matchAll(/data-alcance="([^"]*)"/g)]
    .map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')));
  af(() => alc.length === 1 && JSON.stringify(alc[0].claves) === '["Perfil"]',
     '🔴 un AVISO trae botón: los avisos no escriben nada. Alcances: ' + JSON.stringify(alc));
  // Y el letrero de publicar.
  af(() => /no se ve en el sitio hasta que publiques/.test(h),
     'no se avisa de que el cierre no se ve hasta publicar');
}

console.log('\n[E] 🔒 el botón GRANDE no promete la disponibilidad');
{
  // Con el opt-in, el clic global manda `ag_estado:'no_pedido'`. Si el botón la
  // prometiera, el letrero no correspondería a lo que hace.
  const i = FUENTE.indexOf('id="excel-aplicar-ok"');
  const trozo = FUENTE.slice(i, i + 900);
  af(() => i > 0, 'no se encontró el botón grande');
  af(() => !/zona\(s\) de disponibilidad|disponibilidad/.test(trozo.split('</button>')[0]),
     '🔴 el botón GRANDE promete la disponibilidad y el opt-in NO la manda: letrero que no corresponde');
}

console.log('\n' + (r === 0
  ? (v === 0 ? '⚠️  NADA MEDIDO · esto NO es un verde' : '✅ VERDE · ' + v + ' en verde, 0 en rojo')
  : '🔴 ROJO · ' + v + ' en verde, ' + r + ' en rojo'));
process.exit(r === 0 && v > 0 ? 0 : 1);
