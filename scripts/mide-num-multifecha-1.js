#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-num-multifecha-1.js — NUM-MULTIFECHA-1 · el libro y las multifechas
//
// Medido el 28-sep-2026 sobre el careo REAL de producción: el bloque «Coronca
// Capital» del libro trae sus tres filas con la FECHA VACÍA y el DÍA en la
// columna de ZONA («Viernes», «Domingo»×2). La llave (nombre, fecha) las
// mandaba las tres al mapeo «sin fecha» → coronacapital#0: los $1,000 del
// Domingo se fugaban al careo del viernes y le faltaban al del domingo — los
// dos careos mentían EN SILENCIO (uno de más, uno de menos).
//
// El arreglo: cuando la fecha está vacía, la ZONA puede desambiguar — con su
// siembra en `numerologia_eventos` (fecha_libro='Viernes' → #0, etc.) y el
// orden de la herencia rotulada de NUBE-4: lo específico gana, el «sin fecha →
// primera función» del acta del 19-sep queda como respaldo.
//
// 🔒 LOS DOS LADOS SON COMMITS. El fixture tiene LA FORMA del bloque real
// (leída de la respuesta del handler en producción, no inventada).
// 🔒 Control positivo: BASE reproduce la fuga con la MISMA siembra.
//
// Se corre:  npm run mide:num-multifecha-1
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0, completo = false;
const fallos = [];
function af(c, e) {
  let v = false;
  try { v = (typeof c === 'function') ? !!c() : !!c; }
  catch (x) { v = false; e = e + '  [EXCEPCIÓN: ' + x.message + ']'; }
  if (v) ok++; else { mal++; fallos.push(e); console.log('   ✗ ' + e); }
}
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  console.log((mal ? '❌ ROJO · ' : '✅ VERDE · ') + ok + ' en verde, ' + mal + ' en rojo');
  fallos.slice(0, 16).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' netlify/functions | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '6ca49aa';        // el merge de DISPO-NORM-1
const HEAD_SHA = process.env.HEAD_SHA || 'HEAD';

// ── EL FIXTURE: LA FORMA DEL BLOQUE REAL ────────────────────────────────────
// Leída de `numerologia.personas` del careo de coronacapital#0 en producción
// (28-sep): nombre «Rock 9», fecha VACÍA, el día en `zona`, un boleto por fila.
const LIBRO_CORONA = [
  { nombre: 'Rock 9', clave: 'rock 9', abonado: 800,  boletos: 1, evento_libro: 'Coronca Capital', fecha_libro: '', zona: 'Viernes', costo_publico: 1690 },
  { nombre: 'Rock 9', clave: 'rock 9', abonado: 500,  boletos: 1, evento_libro: 'Coronca Capital', fecha_libro: '', zona: 'Domingo', costo_publico: 1690 },
  { nombre: 'Rock 9', clave: 'rock 9', abonado: 500,  boletos: 1, evento_libro: 'Coronca Capital', fecha_libro: '', zona: 'Domingo', costo_publico: 1690 },
];
// La siembra de esta tuerca: los días como `fecha_libro`, MÁS el respaldo ∅
// que ya existía (el «sin fecha → primera función» del acta).
const SIEMBRA = [
  { nombre_libro: 'Coronca Capital', fecha_libro: null,      evento_id: 'coronacapital#0', activa: true },
  { nombre_libro: 'Coronca Capital', fecha_libro: 'Viernes', evento_id: 'coronacapital#0', activa: true },
  { nombre_libro: 'Coronca Capital', fecha_libro: 'Sabado',  evento_id: 'coronacapital#1', activa: true },
  { nombre_libro: 'Coronca Capital', fecha_libro: 'Domingo', evento_id: 'coronacapital#2', activa: true },
];
// Un evento NORMAL: fecha vacía, zona de verdad, respaldo ∅ — no debe moverse.
const LIBRO_NORMAL = [
  { nombre: 'Juan Normal', clave: 'juan normal', abonado: 300, boletos: 1, evento_libro: 'Junior H', fecha_libro: '', zona: 'General', costo_publico: 4300 },
];
const SIEMBRA_NORMAL = [{ nombre_libro: 'Junior H', fecha_libro: null, evento_id: 'juniorh', activa: true }];

const suma = (ps) => ps.reduce((s, p) => s + p.abonado, 0);

(async function main() {
  process.on('exit', marcador);
  const b = sacar(BASE, 'nm-base'), h = sacar(HEAD_SHA, 'nm-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }
  const NB = require(path.join(b.dir, 'netlify/functions/_lib/numerologia.js'));
  const NH = require(path.join(h.dir, 'netlify/functions/_lib/numerologia.js'));

  // ── [B] EL CONTROL POSITIVO: BASE FUGA ──────────────────────────────────
  console.log('[B] BASE · la fuga que esta tuerca cierra');
  {
    const v = NB.mapearLibro(LIBRO_CORONA, SIEMBRA, 'coronacapital#0');
    af(v.personas.length === 3 && suma(v.personas) === 1800,
       'BASE mandaba LAS TRES filas a #0 (el Domingo fugado al viernes): ' + v.personas.length + ' · $' + suma(v.personas));
    const v2 = NB.mapearLibro(LIBRO_CORONA, SIEMBRA, 'coronacapital#2');
    af(v2.personas.length === 0, 'y al domingo (#2) no le llegaba NADA — aun con la siembra puesta');
  }

  // ── [H] HEAD · cada día a su función ────────────────────────────────────
  console.log('[H] HEAD · la zona desambigua cuando la fecha calla');
  {
    const v0 = NH.mapearLibro(LIBRO_CORONA, SIEMBRA, 'coronacapital#0');
    af(v0.personas.length === 1 && suma(v0.personas) === 800 && v0.personas[0].zona === 'Viernes',
       '#0 recibe SOLO el Viernes ($800): ' + JSON.stringify(v0.personas.map((p) => p.zona + ':' + p.abonado)));
    const v2 = NH.mapearLibro(LIBRO_CORONA, SIEMBRA, 'coronacapital#2');
    af(v2.personas.length === 2 && suma(v2.personas) === 1000,
       '#2 recibe SUS dos Domingos ($1,000): ' + JSON.stringify(v2.personas.map((p) => p.zona + ':' + p.abonado)));
    const v1 = NH.mapearLibro(LIBRO_CORONA, SIEMBRA, 'coronacapital#1');
    af(v1.personas.length === 0 && v1.sinMapeo.length === 0,
       'el sábado sin filas no inventa nada');
    af(v0.sinMapeo.length === 0 && v2.sinMapeo.length === 0, 'y nadie quedó sin mapeo: las tres filas tienen casa');
  }

  // ── [N] HEAD · el evento normal NO se mueve ─────────────────────────────
  console.log('[N] HEAD · zona de verdad ≠ día');
  {
    const vh = NH.mapearLibro(LIBRO_NORMAL, SIEMBRA_NORMAL, 'juniorh');
    const vb = NB.mapearLibro(LIBRO_NORMAL, SIEMBRA_NORMAL, 'juniorh');
    af(vh.personas.length === 1 && vh.personas[0].abonado === 300,
       'la fila con zona «General» sigue cayendo al respaldo ∅ (nadie siembra «Junior H||General»)');
    af(JSON.stringify(vh.personas) === JSON.stringify(vb.personas), 'idéntico a BASE: el evento normal no cambió un byte');
  }

  // ── [F] HEAD · la fecha ESCRITA sigue mandando ──────────────────────────
  console.log('[F] HEAD · lo específico gana, en el orden dicho');
  {
    // Fila CON fecha: ni la zona ni el respaldo ∅ la tocan — si su (nombre,
    // fecha) no está sembrado, queda SIN MAPEO nombrada, no adivinada.
    const conFecha = [{ nombre: 'X', clave: 'x', abonado: 100, boletos: 1, evento_libro: 'Coronca Capital', fecha_libro: '21 de noviembre', zona: 'Domingo' }];
    const vf = NH.mapearLibro(conFecha, SIEMBRA, 'coronacapital#2');
    af(vf.personas.length === 0 && vf.sinMapeo.length === 1 && vf.sinMapeo[0].fecha_libro === '21 de noviembre',
       'una fecha escrita sin siembra NO cae a la zona ni al ∅: queda nombrada en sinMapeo');
    // Fila sin fecha y sin zona → el respaldo ∅ (primera función), como siempre.
    const sinNada = [{ nombre: 'Y', clave: 'y', abonado: 50, boletos: 1, evento_libro: 'Coronca Capital', fecha_libro: '', zona: '' }];
    const vn = NH.mapearLibro(sinNada, SIEMBRA, 'coronacapital#0');
    af(vn.personas.length === 1, 'sin fecha ni zona sembrable → primera función (el respaldo del acta)');
  }

  // ── [I] LO QUE NO SE TOCÓ, careado byte a byte ──────────────────────────
  console.log('[I] fundir y parsear, intactos');
  {
    af(String(NB.fundirNumerologia) === String(NH.fundirNumerologia), 'fundirNumerologia es byte a byte el de BASE');
    af(String(NB.parsearLibro) === String(NH.parsearLibro), 'parsearLibro es byte a byte el de BASE');
    af(NB.PESTANA_LIBRO === NH.PESTANA_LIBRO, 'la pestaña del libro sigue siendo la misma');
  }

  completo = true;
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN DEL ARNÉS: ' + e.stack); process.exit(1); });
