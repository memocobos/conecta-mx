#!/usr/bin/env node
/* =============================================================================
 * mide-epoca-1 — EL CORTE DE ÉPOCA (12-oct-2026, palabra de Memo: «solo deja
 * la info de calle 24 en adelante»).
 *
 * Mide el LIB real (cuentasDeTodos de _lib/cuenta-evento) con red falsa que
 * respeta la forma de hacerLeer, en los TRES estados: sin corte (todo como
 * siempre — el contador público depende de esto), con corte (el viejo fuera,
 * el nuevo dentro, excluidos CONTADOS), y con esferas CAÍDA (NO se filtra y se
 * CONFIESA — esconder eventos vivos por una lectura caída sería un cero falso).
 * Más los hechos de fuente en los tres lectores (sin comentarios).
 *
 * ⚠️ SIN ANCLA a propósito (carga del árbol, como mide:cuadre-aplicar): mide
 * lo que acabas de escribir; sus controles son por construcción.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXC: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}
function sinComentarios(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }

const { cuentasDeTodos } = require(path.join(RAIZ, 'netlify/functions/_lib/cuenta-evento.js'));
const { EPOCA_INICIO, esEpocaNueva } = require(path.join(RAIZ, 'netlify/functions/_lib/epoca.js'));

function redFalsa(opts) {
  opts = opts || {};
  return async function f(url) {
    const u = String(url);
    const json = (x) => ({ ok: true, status: 200, json: async () => x, text: async () => JSON.stringify(x) });
    if (u.includes('esferas_eventos')) {
      if (opts.esferasCaida) return { ok: false, status: 500, json: async () => ({}), text: async () => 'apagada a propósito' };
      return json([{ slug: 'viejoevt', fecha_inicio: '2026-08-01' }, { slug: 'calle24', fecha_inicio: '2026-09-03' }]);
    }
    if (u.includes('viajeros_evento')) {
      return json([
        { id: 'v1', evento_id: 'viejoevt', nombre: 'Viejo', total_contrato: 1000, abonado_previo: 1000, boletos: 1, zona_boleto: 'A' },
        { id: 'v2', evento_id: 'calle24', nombre: 'Nuevo', total_contrato: 2000, abonado_previo: 500, boletos: 1, zona_boleto: 'B' },
      ]);
    }
    return json([]); // portal, abonos, compras, gastos… vacíos: no estorban
  };
}
const base = { portalUrl: 'https://p.test', portalService: 'k', khUrl: 'https://kh.test', khService: 'k', rol: 'maestro_roshi' };

(async () => {
  console.log('══ mide:epoca-1 ══\n[A] el lib, por los tres estados');
  // A1 · SIN corte: byte-funcional como siempre (de esto depende el contador de la portada)
  let r = await cuentasDeTodos({ ...base, fetchImpl: redFalsa() });
  af(r && r.eventos && r.eventos.viejoevt && r.eventos.calle24, '[A1] sin epocaDesde: el viejo y el nuevo PRESENTES (contador intacto)');
  af(r.epoca === null || r.epoca === undefined, '[A2] sin epocaDesde: sin rótulo de época');
  const viajerosTodos = r.totales && r.totales.viajeros;

  // A3 · CON corte
  r = await cuentasDeTodos({ ...base, fetchImpl: redFalsa(), epocaDesde: EPOCA_INICIO });
  af(r && r.eventos && !r.eventos.viejoevt && r.eventos.calle24, '[A3] con corte: viejoevt FUERA · calle24 DENTRO');
  af(r.epoca && r.epoca.aplicada === true && r.epoca.eventos_excluidos === 1, '[A4] los excluidos se CUENTAN (1) y el corte se rotula');
  af(r.totales && r.totales.viajeros < viajerosTodos, '[A5] los totales son de la época (viajeros bajan)');

  // A6 · esferas CAÍDA: no se filtra y se confiesa
  r = await cuentasDeTodos({ ...base, fetchImpl: redFalsa({ esferasCaida: true }), epocaDesde: EPOCA_INICIO });
  af(r && r.eventos && r.eventos.viejoevt && r.eventos.calle24, '[A6] 🔒 esferas caída: NO se filtra (nada se esconde por una lectura caída)');
  af(r.epoca && r.epoca.aplicada === false && r.epoca.error, '[A7] …y se CONFIESA (aplicada:false con error)');

  console.log('\n[B] el puro y los hechos de fuente');
  af(esEpocaNueva('2026-09-03') === true && esEpocaNueva('2026-09-02') === false && esEpocaNueva(null) === false && esEpocaNueva(undefined) === false, '[B1] esEpocaNueva: el corte es inclusive y sin fecha = vieja');
  const ue = sinComentarios(fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-utilidad-evento.js'), 'utf8'));
  af(ue.includes('epocaDesde: EPOCA_INICIO') && ue.includes("require('./_lib/epoca')"), '[B2] el Resumen (admin-utilidad-evento) PIDE el corte');
  const vc = sinComentarios(fs.readFileSync(path.join(RAIZ, 'netlify/functions/viajeros-contador.js'), 'utf8'));
  af(!vc.includes('epocaDesde'), '[B3] 🔒 el contador público NO pide el corte (cuenta la historia completa)');
  af(vc.includes('palnorte2026') && !/ANIO_A_MANO\s*=\s*\{[^}]*\bpalnorte\s*:/.test(vc), '[B4] ANIO_A_MANO sigue a los 232 en su slug nuevo (palnorte2026)');
  const co = sinComentarios(fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8'));
  af(co.includes('esEpocaNueva(') && co.includes('epoca_aviso'), '[B5] la cobranza (deudores_migrados) filtra por época y lo reporta');

  console.log(`\n${R === 0 ? '✅ VERDE' : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  if (V === 0) { console.log('NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('EL ARNÉS SE CAYÓ (eso no es un reporte):', e); process.exit(1); });
