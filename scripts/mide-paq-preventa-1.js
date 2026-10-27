#!/usr/bin/env node
/* mide-paq-preventa-1 — PAQ-PREVENTA-1 (27-oct-2026)
 * Palabra de Memo: «los de nsqk dicen paquete cheap pero no son cheap, son
 * preventa a ciegas». La ETIQUETA cambia; el dato `cheap` NO (careado aquí que
 * el helper no escribe nada: es una función pura de pintado).
 * ⚠️ SIN ANCLA (árbol de trabajo). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };
const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
const i = kh.indexOf('const KH_PREVENTA_EVENTOS'), j = kh.indexOf('function loadPage(name)');
const ctx = {}; vm.createContext(ctx); vm.runInContext(kh.slice(i, j) + ';this.f=khPaqueteTexto;', ctx);
const f = ctx.f;
console.log('══ mide:paq-preventa-1 ══');
af(f({ tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', evento_id: 'nsqkmty' }) === 'PREVENTA A CIEGAS', 'nsqkmty CHEAP con zona preventa → PREVENTA A CIEGAS');
af(f({ tipo_paquete: 'CHEAP', zona_boleto: 'Preventa a ciegas', evento_id: 'palnorte' }) === 'PREVENTA A CIEGAS', 'palnorte «CHEAP» en mayúsculas también');
af(f({ tipo_paquete: 'cheap', zona_boleto: null, evento_id: 'palnorte' }) === 'PREVENTA A CIEGAS', 'palnorte CHEAP sin zona (traspaso/acompañante) → PREVENTA');
af(f({ tipo_paquete: 'cheap', zona_boleto: 'VIP', evento_id: 'karolg#0' }) === 'CHEAP', 'control: un CHEAP normal sigue diciendo CHEAP');
af(f({ tipo_paquete: 'plus', zona_boleto: 'Preventa a ciegas', evento_id: 'nsqkmty' }) === 'PLUS', 'control: un PLUS (fases reales) NO se rotula preventa');
af(f({ tipo_paquete: 'ride', evento_id: 'juniorh' }) === 'RIDE', 'control: RIDE intacto');
af(f({}) === '' && f(null) === '', 'sin paquete → vacío (no inventa)');
const usos = ['kamehouse-capsule.js', 'kamehouse-gz.js', 'kamehouse-requisiciones.js', 'kamehouse.js']
  .reduce((n, a) => n + (fs.readFileSync(path.join(RAIZ, a), 'utf8').match(/khPaqueteTexto\(/g) || []).length, 0);
af(usos >= 8, 'las pantallas le preguntan al helper (' + usos + ' llamadas, ≥8)');
console.log('\n══ RESULTADO ══');
if (V === 0) { console.log('⚠️ NADA MEDIDO'); process.exit(1); }
console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
process.exit(R ? 1 : 0);
