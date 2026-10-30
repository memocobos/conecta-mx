#!/usr/bin/env node
// =============================================================================
// mide:fecha-correo-1 — [FECHA-CORREO-1] los correos de un multifecha dicen
// SOLO la fecha del #N, no las fechas de TODOS los días. (30-oct-2026)
//
// Palabra de Memo, citada: «al rechazar un evento, en el correo dice cuando y
// por ejemplo en eventos como fuerza regida que son 4 fechas le salen las 4
// pero solo debería de salir la fecha del día que le estamos rechazando …
// para que no sea confuso».
//
// ⚠️ SIN ANCLA DE COMMIT a propósito: carga del ÁRBOL DE TRABAJO (la forma de
// mide:cuadre-aplicar). No sufre la trampa del commit; a cambio sus controles
// positivos son POR CONSTRUCCIÓN (la expresión vieja `ev.f` se evalúa al lado
// y se exige que traiga las 4 fechas), no por BASE.
//
// Mide TRES pisos:
//   [A] el DUEÑO (_lib/fecha-evento) contra el CATÁLOGO REAL del árbol —
//       fuerzaregida (4 fechas), corona (combos multidía), un evento simple,
//       y el candado de PN27: palnorte#0 JAMÁS fuga el «mar 2027» que su
//       f_texto esconde.
//   [B] los TRES renders puros, ejecutados de verdad con el ev REAL:
//       renderRechazo · renderConfirmacion · renderInvitacion — el HTML trae
//       la fecha del #N y NO las cuatro. Y el camino VIEJO (sin evento_id)
//       sigue dando ev.f: la compat con llamadores viejos también se afirma.
//   [C] los TRES emisores que resuelven la fecha en el LLAMADOR, por el HECHO:
//       avisarCambioRechazado · avisarPaquete · avisarAjuste corren con red
//       falsa (index REAL servido + viajero en fuerzaregida#1 + Resend
//       capturado) y el HTML QUE SALIÓ trae «12 ene 2027», no las 4.
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let V = 0, R = 0;
const rojos = [];
function af(cond, nombre) {
  let ok = false;
  try { ok = typeof cond === 'function' ? cond() : cond; } catch (e) { nombre += ' — EXCEPCIÓN: ' + (e && e.message); }
  if (ok) { V++; console.log('  ✅ ' + nombre); } else { R++; rojos.push(nombre); console.log('  🔴 ' + nombre); }
}

// ── EL CATÁLOGO REAL DEL ÁRBOL (el EV de index.html con SUS constantes) ─────
const INDEX_HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
function evReal() {
  const consts = (INDEX_HTML.match(/var (BANCO_|HOTEL_|SEPARO_)[^;]+;/g) || []).join('\n');
  const i = INDEX_HTML.indexOf('var EV=');
  const j = INDEX_HTML.indexOf('];', i);
  if (i < 0 || j < 0) throw new Error('no encontré var EV en index.html');
  let EV;
  // eslint-disable-next-line no-eval
  eval(consts + '\nEV=' + INDEX_HTML.slice(i + 7, j + 1));
  return EV;
}

const { fechaDeEventoId, fmtDs } = require(path.join(RAIZ, 'netlify/functions/_lib/fecha-evento.js'));

console.log('\n══ [A] EL DUEÑO contra el catálogo REAL ══');
const EV = evReal();
const fr = EV.find((e) => e.id === 'fuerzaregida');
const cc = EV.find((e) => e.id === 'coronacapital');
const pn = EV.find((e) => e.id === 'palnorte');
af(!!fr && !!cc, 'premisa: fuerzaregida y coronacapital viven en el catálogo del árbol');
af(Array.isArray(fr.dsList) && fr.dsList.length === 4, 'premisa: FR trae 4 fechas (si un día cambia, este careo se re-escribe con su razón)');

// El control por construcción: la expresión VIEJA traía las 4 fechas.
af(/15/.test(String(fr.f)) && /16/.test(String(fr.f)), 'control: la expresión vieja (ev.f) SÍ decía las 4 fechas de FR — el defecto existía');

af(fechaDeEventoId(fr, 'fuerzaregida#1') === '12 ene 2027', 'FR#1 → «12 ene 2027» exacto');
af(fechaDeEventoId(fr, 'fuerzaregida#2') === '15 ene 2027', 'FR#2 → «15 ene 2027»');
af(fechaDeEventoId(fr, 'fuerzaregida#3') === '16 ene 2027', 'FR#3 → «16 ene 2027»');
af(() => { const s = fechaDeEventoId(fr, 'fuerzaregida#1'); return !/15|16/.test(s) && !/11,/.test(s); }, 'FR#1 NO menciona las otras fechas');
af(fechaDeEventoId(fr, 'fuerzaregida') === String(fr.f).trim(), 'sin #N → el f del evento, como siempre');
af(fechaDeEventoId(fr, 'fuerzaregida#9') === '', 'un #N que la ficha NO tiene → SIN fecha (ley de PLAN-PAGOS-1), jamás las 4');
// Corona: un pase multidía conserva su etiqueta — el ds pelado se leería como 1 día.
af(() => { const s = fechaDeEventoId(cc, 'coronacapital#3'); return /Vie \+ S[áa]b/.test(s) && /20 nov 2026/.test(s); }, 'corona#3 (Vie+Sáb) → etiqueta del pase + desde el 20 nov 2026');
af(fechaDeEventoId(cc, 'coronacapital#1') === '21 nov 2026', 'corona#1 (día suelto) → «21 nov 2026» pelado (el lbl de 1 día no estorba)');
// Un evento SIMPLE con #0 heredado: ev.f tal cual.
const simple = EV.find((e) => e && !Array.isArray(e.multifecha) && !Array.isArray(e.dsList) && String(e.f || '').trim() && e.ds);
af(!!simple, 'premisa: hay un evento simple con f y ds en el catálogo');
af(simple && fechaDeEventoId(simple, simple.id + '#0') === String(simple.f).trim(), `evento simple (${simple && simple.id}) con #0 → su f de siempre`);
// 🔒 EL CANDADO DE PN27: la fecha TAPADA no se fuga ni con #0.
if (pn) {
  af(String(pn.f).trim().toLowerCase().indexOf('confirmar') >= 0 || !/mar 2027/.test(fechaDeEventoId(pn, 'palnorte#0')),
    'palnorte#0 NO fuga «mar 2027»: f_texto manda en un evento de una fecha');
  af(fechaDeEventoId(pn, 'palnorte#0') === String(pn.f).trim(), 'palnorte#0 → exactamente su f público (el override honrado)');
} else {
  af(true, 'palnorte ya no está en el catálogo — el candado de la fuga queda sin sujeto (dicho, no escondido)');
}
af(fmtDs('2027-01-12') === '12 ene 2027' && fmtDs('basura') === '' && fmtDs(null) === '', 'fmtDs: parse textual, basura → vacío');
af(fechaDeEventoId(null, 'x#1') === '', 'sin ev → vacío, jamás truena');

console.log('\n══ [B] LOS TRES RENDERS PUROS, ejecutados de verdad ══');
const LIB = (f) => require(path.join(RAIZ, 'netlify/functions/_lib', f));
const sinOtras = (html) => !/15 y 16/.test(html) && !/11, 12/.test(html) && !/15 ene/.test(html) && !/16 ene/.test(html);

// renderRechazo (el correo que Memo vio)
{
  const { renderRechazo } = LIB('correo-rechazo.js');
  const r = renderRechazo({ correo: 'x@y.com', nombre: 'Ana López', folio: 'R-TEST1', evento_id: 'fuerzaregida#1', evento_nombre: 'Fuerza Regida', ev: fr, paquete: 'plus', zona: 'Oro', personas: 1, pago: null, motivo_texto: 'Esa zona ya se agotó.' });
  af(!r.error, 'renderRechazo con FR#1 renderiza (' + (r.error || 'ok') + ')');
  af(r.html && /12 ene 2027/.test(r.html), 'rechazo FR#1: el HTML dice «12 ene 2027»');
  af(r.html && sinOtras(r.html), 'rechazo FR#1: el HTML NO dice las otras fechas');
}
// renderConfirmacion (aprobar la requisición / capturar pago)
{
  const { renderConfirmacion } = LIB('correo-confirmacion.js');
  const r = renderConfirmacion({ tipo: 'reserva', correo: 'x@y.com', ev: fr, evento_id: 'fuerzaregida#1', nombres: ['Ana López'], recibido: 300, total: 5500, resta: 5200, portal: null, grupo: null });
  af(!r.error, 'renderConfirmacion con FR#1 renderiza (' + (r.error || 'ok') + ')');
  af(r.html && /12 ene 2027/.test(r.html), 'confirmación FR#1: «12 ene 2027»');
  af(r.html && sinOtras(r.html), 'confirmación FR#1: sin las otras fechas');
  // Compat: el llamador VIEJO (sin evento_id) sigue con ev.f — y de paso es el
  // control de que la aserción de arriba distingue algo.
  const r2 = renderConfirmacion({ tipo: 'reserva', correo: 'x@y.com', ev: fr, nombres: ['Ana'], recibido: 300, total: 5500, resta: 5200, portal: null, grupo: null });
  af(r2.html && /15 y 16/.test(r2.html), 'compat: sin evento_id la confirmación sigue diciendo el f completo (llamador viejo)');
}
// renderInvitacion (el botón que invita al Portal)
{
  const { renderInvitacion } = LIB('invitacion-portal.js');
  const r = renderInvitacion({ nombre: 'Ana López', correo: 'x@y.com', ev: fr, evento_id: 'fuerzaregida#1' });
  af(!r.error, 'renderInvitacion con FR#1 renderiza (' + (r.error || 'ok') + ')');
  af(r.html && /12 ene 2027/.test(r.html), 'invitación FR#1: «12 ene 2027»');
  af(r.html && sinOtras(r.html), 'invitación FR#1: sin las otras fechas');
  const r2 = renderInvitacion({ nombre: 'Ana', correo: 'x@y.com', ev: fr });
  af(r2.html && /15 y 16/.test(r2.html), 'compat: sin evento_id la invitación sigue con el f completo');
}

console.log('\n══ [C] LOS TRES EMISORES, por el HECHO (red falsa + Resend capturado) ══');
// Red falsa mínima: el index REAL servido, el viajero en fuerzaregida#1, sus
// abonos, y Resend capturando el body. Cualquier otra URL truena con nombre.
const ENVIADOS = [];
const VIAJERO = { id: 'v-1', nombre: 'Ana López', correo: 'x@y.com', evento_id: 'fuerzaregida#1', tipo_paquete: 'plus', zona_boleto: 'Oro', total_contrato: 5500, abonado_previo: 300 };
const resp = (status, body) => ({ ok: status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
global.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('/index.html')) return resp(200, INDEX_HTML);
  if (u.includes('api.resend.com')) { ENVIADOS.push(JSON.parse(init.body)); return resp(200, { id: 'em_test' }); }
  if (u.includes('viajeros_evento')) return resp(200, [VIAJERO]);
  if (u.includes('abonos_viajero')) return resp(200, [{ monto: 300 }]);
  throw new Error('la red falsa no entiende: ' + u);
};
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_falsa';
const CORREOS_MODO_ANTES = process.env.CORREOS_MODO;
process.env.CORREOS_MODO = 'prueba'; // 🔒 doble red: la de verdad está stubbeada, y aun así el guard desvía

// catalogo-index cachea 10 min: carga fresca para que beba de ESTA red falsa.
for (const k of Object.keys(require.cache)) if (k.includes('netlify/functions')) delete require.cache[k];

(async () => {
  // avisarCambioRechazado (hotel/zona/fecha/pago)
  {
    const { avisarCambioRechazado } = LIB('correo-cambio.js');
    const out = await avisarCambioRechazado({ cambio: { id: 'c1', viajero_id: 'v-1', evento_id: 'fuerzaregida#1', correo: 'x@y.com', nombre: 'Ana López', tipo: 'zona', detalle: 'quiero Platino', estado: 'rechazada', respuesta: 'Platino está agotada.' }, KH_URL: 'https://kh.fake', KH_KEY: 'k' });
    af(out.ok === true, 'avisarCambioRechazado salió (aviso: ' + (out.aviso || '—') + ')');
    const m = ENVIADOS[ENVIADOS.length - 1];
    af(m && /12 ene 2027/.test(m.html), 'cambio rechazado FR#1: el HTML ENVIADO dice «12 ene 2027»');
    af(m && sinOtras(m.html), 'cambio rechazado FR#1: sin las otras fechas');
  }
  // avisarPaquete — la fecha SOLO vive en la rama ATENDIDA («Ya aplicamos tu
  // elección … (fecha)»); la rechazada no la pinta, medido en renderPaquete.
  {
    const { avisarPaquete } = LIB('correo-paquete.js');
    const out = await avisarPaquete({ cambio: { id: 'c2', viajero_id: 'v-1', evento_id: 'fuerzaregida#1', correo: 'x@y.com', nombre: 'Ana López', tipo: 'paquete', paquete_pedido: 'plus', zona_pedida: 'Oro', estado: 'atendida', respuesta: '' }, KH_URL: 'https://kh.fake', KH_KEY: 'k' });
    af(out.ok === true, 'avisarPaquete (atendida) salió (aviso: ' + (out.aviso || '—') + ')');
    const m = ENVIADOS[ENVIADOS.length - 1];
    af(m && /12 ene 2027/.test(m.html), 'paquete confirmado FR#1: «12 ene 2027» en el HTML enviado');
    af(m && sinOtras(m.html), 'paquete confirmado FR#1: sin las otras fechas');
  }
  // avisarAjuste (la edición de un viaje, con aviso)
  {
    const { avisarAjuste } = LIB('correo-ajuste.js');
    const out = await avisarAjuste({ v: VIAJERO, cambios: ['total: $5,500 → $5,200'], modo: 'ajuste', KH_URL: 'https://kh.fake', KH_KEY: 'k' });
    af(out.ok === true, 'avisarAjuste salió (aviso: ' + (out.aviso || '—') + ')');
    const m = ENVIADOS[ENVIADOS.length - 1];
    af(m && /12 ene 2027/.test(m.html), 'ajuste FR#1: «12 ene 2027» en el HTML enviado');
    af(m && sinOtras(m.html), 'ajuste FR#1: sin las otras fechas');
  }
  // Control del contador: si Resend no vio NADA, los «sinOtras» pasaron en vacío.
  af(ENVIADOS.length === 3, 'control del instrumento: Resend capturó exactamente 3 envíos (vio ' + ENVIADOS.length + ')');
  const DESTINO_PRUEBA = process.env.CORREOS_PRUEBA_DESTINO || 'reynosa@conectamexico.mx';
  af(ENVIADOS.every((m) => Array.isArray(m.to) && m.to[0] === DESTINO_PRUEBA), 'y los 3 iban DESVIADOS al buzón de prueba (el guard vivo encima de la red falsa)');

  if (CORREOS_MODO_ANTES === undefined) delete process.env.CORREOS_MODO; else process.env.CORREOS_MODO = CORREOS_MODO_ANTES;

  console.log('\n══ RESULTADO ══');
  if (R === 0 && V > 0) console.log(`✅ VERDE · ${V} en verde`);
  else if (V === 0) console.log('⚠️ NADA MEDIDO · esto NO es un verde');
  else { console.log(`🔴 ROJO · ${V} verde · ${R} rojo`); rojos.forEach((n) => console.log('   · ' + n)); }
  process.exit(R === 0 && V > 0 ? 0 : 1);
})().catch((e) => { console.error('🔴 EL ARNÉS SE CAYÓ:', e); process.exit(1); });
