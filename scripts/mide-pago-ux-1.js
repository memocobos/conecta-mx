#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * mide-pago-ux-1 — PAGO-UX-1 · el paso de pago en dos caminos (9-nov-2026)
 *
 * Palabra de Memo (con capturas): «el botón de reservar lugar debería ser más
 * grande y quitar la cuenta porque en el siguiente paso la vas a poner de
 * nuevo · no entiendo lo del link ¿no debería salir automático? · no entiendo
 * bien el proceso de pago con mercado pago». Sus respuestas: quitar la cuenta
 * del cotizador y agrandar el botón · paso 2 en DOS caminos, transferencia
 * primero.
 *
 * Lo que mide:
 *  [A] el cotizador YA NO enseña la tarjeta «Datos de pago» — por el HECHO:
 *      se ejecuta actualizarBankInfo() real con un $$ falso y se mira qué
 *      display escribió; y el botón #r-wa tiene su regla grande.
 *  [B] el paso 2 del modal (WEB-UX-3) tiene los DOS caminos y el chip de
 *      link_pago se esconde: validaPago/elegirCamino REALES corren en vm con
 *      un DOM mínimo por id.
 *  [C] la lección de hoy, clavada: el separo del título se lee ANTES de mover
 *      `.pago-separo` a p1 (medido en navegador: p1 aún no está en el
 *      documento y getElementById no lo encuentra → el título salía sin monto).
 *  [D] los textos del camino MP ya no prometen que alguien «manda» el link, y
 *      la pantalla de éxito con link dice «falta tu pago», no «recibimos».
 *
 * ⚠️ SIN ANCLA a propósito: carga del ÁRBOL DE TRABAJO (como mide:req-b1).
 * Controles positivos por construcción (se sabotea en memoria y se ve caer).
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

let V = 0, R = 0;
function af(cond, msg) {
  let ok = false;
  try { ok = !!cond; } catch (e) { ok = false; msg = msg + ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}
function funcionDe(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return null;
}
// Quita comentarios // y /* */ de un trozo de JS (para medir código, no prosa).
function sinComentarios(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"])\/\/[^\n]*/g, '$1'); }

console.log('══ mide-pago-ux-1 · el paso de pago en dos caminos ══');

// ── [A] EL COTIZADOR ───────────────────────────────────────────────────────
console.log('\n[A] cotizador: sin tarjeta de cuenta, botón grande');
{
  const fn = funcionDe(HTML, 'actualizarBankInfo');
  af(!!fn, 'actualizarBankInfo se rebana del index');
  const escritos = {};
  const ctx = {
    getBanco: () => ({ nombre: 'BBVA', tarjeta: '4152', clabe: '0128', titular: 'G' }),
    $$: (id) => { escritos[id] = escritos[id] || { style: {}, innerHTML: '' }; return escritos[id]; },
  };
  vm.createContext(ctx);
  vm.runInContext(fn + '\nactualizarBankInfo();', ctx);
  af(escritos['d-bank-card'] && escritos['d-bank-card'].style.display === 'none', 'actualizarBankInfo() deja #d-bank-card en display:none (por el HECHO, no por grep)');
  af(escritos['d-bank'] && /4152/.test(escritos['d-bank'].innerHTML), 'el contenido de #d-bank se sigue pintando (nadie que lo lea se queda sin dato)');
  // Control positivo: la versión vieja escribía 'block'.
  const viejo = fn.replace("style.display='none'", "style.display='block'");
  af(viejo !== fn, 'control: el sabotaje mutó el texto');
  const e2 = {}; const c2 = { getBanco: ctx.getBanco, $$: (id) => { e2[id] = e2[id] || { style: {}, innerHTML: '' }; return e2[id]; } };
  vm.createContext(c2); vm.runInContext(viejo + '\nactualizarBankInfo();', c2);
  af(e2['d-bank-card'].style.display === 'block', 'control positivo: con el código viejo la tarjeta SÍ se enseña (el careo distingue)');
  af(/id="d-bank-card" style="display:none"/.test(HTML), 'la tarjeta nace display:none en el HTML');

  const regla = HTML.match(/#r-wa\.wa-btn\{([^}]*)\}/);
  af(!!regla, 'existe la regla #r-wa.wa-btn');
  const fs_ = regla && regla[1].match(/font-size:(\d+)px/), pad = regla && regla[1].match(/padding:(\d+)px/);
  af(fs_ && +fs_[1] >= 17, 'el botón va en ≥17px de letra (' + (fs_ && fs_[1]) + 'px; el .wa-btn genérico sigue en 14)');
  af(pad && +pad[1] >= 22, 'el botón va con ≥22px de alto de padding (' + (pad && pad[1]) + 'px; el genérico sigue en 18)');
  af(/\.wa-btn\{background:#25D366;color:#fff;font-family:'Montserrat',sans-serif;font-size:14px/.test(HTML), 'el .wa-btn genérico NO se tocó (la regla es solo de #r-wa)');
}

// ── [B] EL PASO 2 EN DOS CAMINOS ───────────────────────────────────────────
console.log('\n[B] el modal: dos caminos, chip de link escondido, validación por camino');
const s0 = HTML.indexOf('<script id="web-ux-3-js">'), s1 = HTML.indexOf('</script>', s0);
const WX3 = HTML.slice(s0 + '<script id="web-ux-3-js">'.length, s1);
af(WX3.length > 2000, 'el bloque WEB-UX-3 se rebana (' + WX3.length + ' bytes)');
{
  const code = sinComentarios(WX3);
  af(code.includes('wx3-cam-b') && code.includes('wx3-cam-a'), 'p2 trae los dos caminos (wx3-cam-b transferencia · wx3-cam-a Mercado Pago)');
  // El orden se mide en el MARKUP de p2 (id="…"), no en la primera mención del
  // archivo: elegirCamino nombra wx3-cam-a antes y eso no es el orden visual.
  af(code.indexOf('id="wx3-cam-b"') > 0 && code.indexOf('id="wx3-cam-b"') < code.indexOf('id="wx3-cam-a"'), 'TRANSFERENCIA va PRIMERO en el markup del paso 2 (palabra de Memo)');
  af(/data-forma="link_pago"\]'\);\s*if\(chipLink\)chipLink\.style\.display='none'/.test(code), 'el chip link_pago se esconde en el paso 2 (lo elige el camino A)');
  af(code.includes("subB.appendChild(bank)"), 'la cuenta bancaria vive DENTRO del camino de transferencia, no suelta en el paso');
  af(code.includes("subA.appendChild(linkMsg)"), 'la explicación de Mercado Pago vive dentro del camino A');

  // Ejecutar validaPago y elegirCamino REALES con un DOM mínimo por id.
  const fValida = (() => { const i = code.indexOf('function validaPago('); let d = 0; for (let k = code.indexOf('{', i); k < code.length; k++) { if (code[k] === '{') d++; else if (code[k] === '}') { d--; if (!d) return code.slice(i, k + 1); } } })();
  const fCamino = (() => { const i = code.indexOf('function elegirCamino('); let d = 0; for (let k = code.indexOf('{', i); k < code.length; k++) { if (code[k] === '{') d++; else if (code[k] === '}') { d--; if (!d) return code.slice(i, k + 1); } } })();
  af(!!fValida && !!fCamino, 'validaPago y elegirCamino se rebanan del bloque');
  const nodos = {};
  const nodo = (id) => nodos[id] || (nodos[id] = { textContent: '', style: {}, _c: new Set(), classList: { toggle(c, f) { f ? nodos[id]._c.add(c) : nodos[id]._c.delete(c); }, contains(c) { return nodos[id]._c.has(c); } } });
  ['wx3-err-2', 'wx3-cam-a', 'wx3-cam-b', 'wx3-sub-a', 'wx3-sub-b', 'req-file-wrap'].forEach(nodo);
  const llamadas = [];
  const ctx = {
    document: { getElementById: (id) => nodos[id] || null },
    window: { _reqEstado: { forma: null, archivo: null }, _reqForma: (f) => { llamadas.push(f); ctx.window._reqEstado.forma = f; } },
    trackMainEvent: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext('var camino=null; function $(id){return document.getElementById(id);}\n' + fValida + '\n' + fCamino +
    '\nvar API={valida:validaPago, camino:elegirCamino, get c(){return camino;}};', ctx);
  const API = ctx.API;
  af(API.valida() === false && nodos['wx3-err-2'].textContent === 'Elige cómo quieres pagar', 'sin camino: «Elige cómo quieres pagar» y no avanza');
  API.camino('b');
  af(nodos['wx3-sub-b'].style.display === 'block' && nodos['wx3-sub-a'].style.display === 'none' && nodos['wx3-cam-b']._c.has('on'), 'camino B: se abre su bloque (cuenta + chips + comprobante) y se cierra el de MP');
  af(nodos['req-file-wrap'].style.display === 'block', 'camino B enseña el cuadro del comprobante DESDE que se elige, no solo tras tocar un chip');
  af(API.valida() === false && /transferencia, depósito u OXXO/.test(nodos['wx3-err-2'].textContent), 'camino B sin chip: pide la forma (transferencia/depósito/OXXO)');
  ctx.window._reqEstado.forma = 'transferencia';
  af(API.valida() === false && /comprobante/.test(nodos['wx3-err-2'].textContent), 'camino B con chip y sin foto: pide el comprobante');
  ctx.window._reqEstado.archivo = { name: 'x.jpg' };
  af(API.valida() === true && nodos['wx3-err-2'].textContent === '', 'camino B completo: avanza');
  API.camino('a');
  af(llamadas[llamadas.length - 1] === 'link_pago' && ctx.window._reqEstado.forma === 'link_pago', 'camino A elige link_pago por _reqForma (el dueño de la forma), sin chip');
  af(nodos['wx3-sub-a'].style.display === 'block' && nodos['wx3-sub-b'].style.display === 'none' && nodos['wx3-cam-a']._c.has('on') && !nodos['wx3-cam-b']._c.has('on'), 'camino A: se abre su bloque y se cierra el de transferencia');
  ctx.window._reqEstado.archivo = null;
  af(API.valida() === true, 'camino A no exige comprobante (el pago cae por Mercado Pago)');
  API.camino('b');
  af(llamadas[llamadas.length - 1] === null && ctx.window._reqEstado.forma === null, 'volver a B desde A DESMARCA link_pago (_reqForma(null)): no viaja una forma del otro camino');
}

// ── [C] LA LECCIÓN DE HOY: el separo se lee ANTES de mover el nodo ─────────
console.log('\n[C] el monto del título se lee antes de que .pago-separo salga del documento');
{
  const code = sinComentarios(WX3);
  const iLee = code.indexOf("txt('pago-monto')"), iMueve = code.indexOf('p1.appendChild(separo)');
  af(iLee > 0 && iMueve > 0, 'existen la lectura del separo y la mudanza de .pago-separo a p1');
  af(iLee < iMueve, 'txt(\'pago-monto\') corre ANTES de p1.appendChild(separo) — después, p1 aún no está en el documento y el monto sale vacío (medido en navegador)');
  af(/tu separo'\+\(sepTxt\?' de '\+sepTxt:''\)/.test(code), 'el título dice «¿Cómo quieres pagar tu separo de $X?» con el monto derivado del modal');
  af(!/Haz tu transferencia, depósito u OXXO a esta cuenta/.test(code), 'murió el subtítulo viejo que daba la cuenta por default a todos');
}

// ── [D] LOS TEXTOS ──────────────────────────────────────────────────────────
console.log('\n[D] los textos del camino MP dicen lo que pasa');
{
  const pintar = sinComentarios(funcionDe(HTML, '_reqPintar') || '');
  af(pintar.length > 0, '_reqPintar se rebana');
  af(!/te lo mandamos por WhatsApp/.test(pintar) && !/Quiero link de pago/.test(pintar), 'ya no dice «te lo mandamos» ni «Quiero link de pago» (sonaba a solicitud a una persona)');
  af(/Al enviar tus datos te aparece aquí mismo el botón/.test(pintar), 'el aviso dice que el botón de pagar aparece al enviar — el link nace solo');
  af(/\['link_pago','Pagar en línea \(Mercado Pago\)'\]/.test(pintar), 'el chip (respaldo sin pasos) dice «Pagar en línea (Mercado Pago)»');
  const enviar = sinComentarios(funcionDe(HTML, '_reqEnviar') || '');
  // [REQ-EXITO-1 · 9-nov] ACTUALIZADA a la verdad nueva, con su razón: la
  // pantalla sin link decía «¡Recibimos tu reservación!» y hoy dice «¡Tu
  // reservación fue enviada!» (palabra de Memo: pendiente, correo <24 h,
  // acceso al Portal — nada de WhatsApp). La aserción vieja habría exigido
  // revertir su decisión.
  af(/¡Ya casi! Solo falta tu pago/.test(enviar) && /¡Tu reservación fue enviada!/.test(enviar), 'la pantalla de éxito distingue: con link «¡Ya casi! Solo falta tu pago», sin link «¡Tu reservación fue enviada!»');
  // El éxito se rebana por su marcador (req-seccion → innerHTML) y se mide
  // SOBRE ESE TROZO, no sobre toda la función: _reqEnviar también arma el
  // mensaje de error de red, que legítimamente manda a Messenger.
  const iEx = enviar.indexOf("getElementById('req-seccion')");
  const exito = iEx >= 0 ? enviar.slice(iEx, enviar.indexOf("'</div>';", iEx) + 9) : '';
  af(exito.length > 200, 'la pantalla de éxito se rebana (' + exito.length + ' chars)');
  af(!/WhatsApp/.test(exito), 'la pantalla de éxito NO menciona WhatsApp en ninguno de los dos caminos (nadie va a escribir por ahí)');
  af(/pendiente de revisión/.test(exito), 'sin link dice que la reservación está «pendiente de revisión»');
  af((exito.match(/en menos de (<b[^>]*>)?24 horas/gi) || []).length === 2, 'los DOS caminos prometen «en menos de 24 horas» (con y sin link)');
  af((exito.match(/recibirás en tu correo tu confirmación y tu acceso al Portal/g) || []).length === 2, 'los DOS caminos dicen que la confirmación y el acceso al Portal llegan por CORREO');
  // Control por construcción: el trozo SÍ sabe ver un WhatsApp si lo hubiera.
  af(/WhatsApp/.test(exito.replace('Guarda tu folio', 'WhatsApp')), 'control: el detector de WhatsApp ve uno sembrado');
  af(/r\.j\.pago&&r\.j\.pago\.url\?'¡Ya casi!/.test(enviar), 'y la elige por el HECHO de que vino el link (pago.url), no por la forma elegida');
  af(/id="req-mp-btn" style="[^"]*font-size:15px/.test(enviar), 'el botón «Pagar en Mercado Pago» creció (15px)');
}

console.log('\n══ RESULTADO ══');
console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
if (!V) console.log('NADA MEDIDO · esto NO es un verde');
process.exit(R ? 1 : 0);
