#!/usr/bin/env node
// [CTR-TABS-1 · 21-oct-2026] Palabra de Memo: contratos de coordis, creadoras y
// clientes cada quien en su pestaña, con sus propias alertas, y ordenados por
// la fecha del evento que sirven (el de hoy hasta arriba).
// Vigilante vivo del árbol de trabajo (como mide:nav-min-1). Las funciones de
// reparto y de orden se EVALÚAN con vm y se corren con fixtures — no se leen
// con regex: un regex sobre el texto cuenta lo comentado como vivo.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
const srv = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-creadoras.js'), 'utf8');

let ok = 0, ko = 0;
const af = (c, m) => { try { c = typeof c === 'function' ? c() : c; } catch (e) { c = false; m += ' · EXCEPCIÓN: ' + e.message; } if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

// Rebanar una función top-level por balance de llaves (la ley de la casa).
function fn(nombre) {
  const i = js.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error(nombre + ' no existe');
  let d = 0, j = js.indexOf('{', i);
  for (let k = j; k < js.length; k++) {
    if (js[k] === '{') d++;
    if (js[k] === '}') { d--; if (!d) return js.slice(i, k + 1); }
  }
  throw new Error('llaves sin balance en ' + nombre);
}

console.log('[A] el reparto por plantilla (_ctrTabDe, evaluado y corrido)');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fn('_ctrTabDe') + '\n' + fn('_ctrOrdenUso'), ctx);
af(ctx._ctrTabDe({ plantilla: 'creadora' }) === 'creadoras' && ctx._ctrTabDe({ plantilla: 'creadora_team' }) === 'creadoras', 'creadora y creadora_team → Creadoras');
af(ctx._ctrTabDe({ plantilla: 'coordinador' }) === 'coordis' && ctx._ctrTabDe({ plantilla: 'auxiliar_admin' }) === 'coordis', 'coordinador y auxiliar_admin → Coordis');
af(ctx._ctrTabDe({ plantilla: 'giveaway' }) === 'clientes', 'giveaway → Clientes (la ganadora es clienta)');
af(ctx._ctrTabDe({ plantilla: 'cliente_viaje' }) === 'clientes', 'una plantilla NUEVA cae a Clientes, no a ninguna (visible > invisible)');
af(ctx._ctrTabDe({}) === 'creadoras', 'sin plantilla hereda el default histórico (creadora)');

console.log('\n[B] el orden de uso (_ctrOrdenUso, corrido con fixtures relativos a HOY)');
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
const dia = (n) => { const d = new Date(Date.parse(hoy + 'T12:00:00Z') + n * 864e5); return d.toISOString().slice(0, 10); };
const soyluna = { evento_fecha: hoy, evento_nombre: 'HOY' };
const en10 = { evento_fecha: dia(10) };
const en3 = { evento_fecha: dia(3) };
const ayer = { evento_fecha: dia(-1) };
const hace30 = { evento_fecha: dia(-30) };
const sinFecha = { evento_fecha: null, enviado_at: new Date().toISOString() };
const orden = [hace30, en10, sinFecha, soyluna, ayer, en3].sort(ctx._ctrOrdenUso);
af(orden[0] === soyluna, 'el evento de HOY queda hasta arriba (el caso Soy Luna)');
af(orden[1] === en3 && orden[2] === en10, 'los próximos van por cercanía (3 días antes que 10)');
af(orden[3] === sinFecha, 'los sin fecha van después de los próximos');
af(orden[4] === ayer && orden[5] === hace30, 'los pasados al final, el más reciente primero');

console.log('\n[C] la lista corta por pestaña y ORDENA (leído del pintor vivo)');
const pintor = fn('_ctrPintarLista').replace(/\/\/[^\n]*/g, '');
af(/_ctrTabDe\(c\) === _ctrTab/.test(pintor), 'la pestaña corta PRIMERO (filtro por _ctrTabDe)');
af(/\.sort\(_ctrOrdenUso\)/.test(pintor), 'y los visibles se ordenan con _ctrOrdenUso');
af(/delTab\.forEach\(\(c\) => \{ cuenta\[_ctrClase\(c\)\]\+\+; \}\)/.test(pintor), 'los chips cuentan DENTRO de la pestaña');
af(/ctrt-creadoras/.test(pintor) && /ctrt-coordis/.test(pintor) && /ctrt-clientes/.test(pintor), 'cada pestaña dice cuántos tiene');
af(/CONTRATO-CLIENTE-1/.test(pintor) && /fases reales/.test(pintor), 'la pestaña Clientes vacía dice POR QUÉ (decisión B, no un hueco)');

console.log('\n[D] las alertas son DE SU PESTAÑA');
const alerta = fn('_ctrAlertaPintar').replace(/\/\/[^\n]*/g, '');
af(/_ctrTabDe\(c\) === _ctrTab/.test(alerta), 'la tarjeta de alertas solo mira los contratos de la pestaña abierta');
af(/_ctrTab === 'coordis'/.test(alerta) && /_ctrDiasVigencia/.test(alerta), 'Coordis: vigencias vencidas o por vencer (mismo umbral del chip)');
af(/_ctrTab === 'creadoras'/.test(alerta) && /_ctrMaterial/.test(alerta), 'Creadoras: el material vencido');
af(/_ctrMaterial\.error/.test(alerta) && /no se pudo revisar/.test(alerta), 'si el material no se pudo leer, se DICE (el cero falso no se calla)');
af(/ctrEntAbrir\(/.test(alerta), 'y cada renglón de material lleva su «ver entregables»');
af(/el\.style\.display = 'none'/.test(alerta), 'sin nada que apurar, la tarjeta desaparece (no es decoración)');

console.log('\n[E] el HTML trae las tres pestañas');
af(/id="ctrt-creadoras"[^>]*class[^>]*active|class="kh-subnav-btn active" id="ctrt-creadoras"/.test(html.replace(/\n/g, ' ')), 'Creadoras nace activa (= _ctrTab default)');
af(/id="ctrt-coordis"/.test(html) && /id="ctrt-clientes"/.test(html), 'Coordis y Clientes existen');
af(/ctrTabSet\('creadoras'/.test(html) && /ctrTabSet\('coordis'/.test(html) && /ctrTabSet\('clientes'/.test(html), 'las tres llaman a ctrTabSet');
af(/let _ctrTab = 'creadoras'/.test(js), 'y el estado JS arranca en la misma pestaña que el HTML marca activa');

console.log('\n[F] el servidor: material_vencido es LECTURA y respeta la regla de los 3 días');
af(/material_vencido: LEEN/.test(srv), 'registrada en ACCIONES con roles de lectura (roshi/bulma/milk)');
const mv = srv.slice(srv.indexOf("accion === 'material_vencido'"), srv.indexOf("accion === 'entregables_listar'"));
af(mv.length > 100, 'el bloque del handler existe');
af(/estado=eq\.pendiente/.test(mv) && /fecha_limite=lt\./.test(mv), 'pide SOLO pendientes con fecha ya pasada');
af(/plantilla=in\.\(creadora,creadora_team\)/.test(mv) && /estado=eq\.firmado/.test(mv), 'de contratos de creadora FIRMADOS');
af(/<= 3/.test(mv), 'con la regla de los 3 días del cajón «pasado» (el reel posterior)');
af(!/await send\(/.test(mv), 'y CERO escrituras: el bloque no llama a send()');

console.log('\n[G] control positivo del instrumento');
af(ctx._ctrTabDe({ plantilla: 'coordinador' }) !== 'creadoras', 'el reparto distingue (un coordi no es creadora)');
af([en10, soyluna].sort(ctx._ctrOrdenUso)[0] === soyluna, 'el orden distingue (hoy le gana a +10 días)');

console.log('\n' + (ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
process.exit(ko ? 1 : 0);
