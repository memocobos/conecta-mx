#!/usr/bin/env node
// =============================================================================
// mide-rooming-auto-1.js — [ROOMING-AUTO-1 + GENERO-1] (30-oct-2026)
//
// ⚠️ SIN ANCLA DE COMMIT, A PROPÓSITO (como mide:req-b1): carga del ÁRBOL DE
// TRABAJO — mide lo que acabas de escribir y no sufre la trampa del commit; a
// cambio no puede traer control positivo por commit. Sus controles positivos
// son POR CONSTRUCCIÓN (casos sembrados que deben caer) y POR SABOTAJE (se
// corre aparte, con sha1 careado).
//
// Mide:
//  [A] el dueño puro (_lib/rooming-auto): tipo desde columna/nota, «con X»,
//      género sugerido, bajas, y el ARMADOR con las reglas firmadas de Memo.
//  [B] el handler REAL admin-rooming · armar_propuesta con red falsa que
//      respeta filtros — y CERO escrituras, con control positivo del contador.
//  [C] genero_guardar: escribe SOLO la columna genero, lista cerrada, tope.
//  [D] las capacidades son LAS MISMAS en el lib, admin-rooming y el front.
//  [E] viajero_editar_full (handler REAL de admin-coordi) aprende `genero`:
//      H/M guarda, inválido rebota, vacío lo quita.
//  [F] la pantalla REAL: _vjEditarAbrir pinta el select de género y
//      _vjEditarGuardar lo manda; el panel del armador existe y aplica por los
//      escritores de siempre (khRooming.crear + khViajeros.habitacion).
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
const af = (cond, msg) => {
  let ok = false;
  try { ok = typeof cond === 'function' ? cond() : cond; } catch (e) { msg += ` (excepción: ${e.message})`; }
  if (ok) { V++; console.log('  ✓', msg); } else { R++; console.log('  ✗', msg); }
};

// ───────────────────────────── [A] EL DUEÑO PURO ────────────────────────────
console.log('\n[A] _lib/rooming-auto — el dueño puro');
const RA = require(path.join(RAIZ, 'netlify/functions/_lib/rooming-auto.js'));

// tipo desde columna / nota / nada
af(RA.tipoCuartoDe({ hotel_tipo: 'Compartida' }).tipo === 'cuadruple', 'columna Compartida → cuadruple');
af(RA.tipoCuartoDe({ hotel_tipo: 'Compartida' }).origen === 'columna', '…con origen columna');
af(RA.tipoCuartoDe({ hotel_tipo: 'Doble', notas: 'Hab Triple' }).tipo === 'doble', 'la COLUMNA gana a la nota');
af(RA.tipoCuartoDe({ notas: 'Migrado · Hab Cuadruple · con X' }).tipo === 'cuadruple', 'nota «Hab Cuadruple» → cuadruple');
af(RA.tipoCuartoDe({ notas: 'Hab Doble - comparte' }).tipo === 'doble', 'nota «Hab Doble»');
af(RA.tipoCuartoDe({ notas: '· Hab Individual ·' }).tipo === 'individual', 'nota «Hab Individual»');
af(RA.tipoCuartoDe({ notas: 'ya había sumado como dinero' }).tipo === null, 'un «había» NO es «Hab » (el falso del padrón real)');
af(RA.tipoCuartoDe({ notas: 'sin nada' }).tipo === null, 'sin dato → null, no se adivina');

// con quién
af(RA.conQuienDe('… · Hab Cuadruple · con Leila Rodríguez · Excel 30-ago: +$500') === 'Leila Rodríguez', '«· con Leila Rodríguez ·» se extrae limpio');
af(RA.conQuienDe('Hab Triple · con Isis') === 'Isis', 'con nombre al final');
af(RA.conQuienDe('Migrado · Hab Doble · Excel') === null, 'sin «con» → null');
af(RA.conQuienDe('· con el careo de salida') === null, '«con el careo» no es una persona');

// género sugerido — SOLO propone
af(RA.generoSugerido('María Fernanda López') === 'M', 'María → M (con acento)');
af(RA.generoSugerido('jose luis garcia') === 'H', 'jose → H');
af(RA.generoSugerido('Yamirootz (venta)') === null, 'nombre raro → null, jamás se inventa');
af(RA.generoSugerido('Guadalupe Torres') === null, 'ambiguo (Guadalupe) → null, el lado conservador');

// bajas
af(RA.esBaja({ tipo_paquete: 'PLUS', boletos: 0, zona_boleto: null }) === true, 'PLUS boletos 0 sin zona = baja');
af(RA.esBaja({ tipo_paquete: 'ride', boletos: 0, zona_boleto: null }) === false, 'RIDE boletos 0 sin zona NO es baja (su forma normal)');
af(RA.esBaja({ tipo_paquete: 'PLUS', boletos: 2, zona_boleto: 'Oro' }) === false, 'PLUS vivo no es baja');

// ── el ARMADOR, con un fixture que ejercita CADA regla firmada ──
const mk = (id, nombre, extra) => Object.assign({ id, nombre, tipo_paquete: 'PLUS', boletos: 1, zona_boleto: 'Oro', hotel_tipo: null, genero: null, grupo_viaje: null, habitacion_id: null, notas: null }, extra || {});
const fixture = [
  // grupo de 2 (grupo_viaje) en Doble → cuarto directo
  mk('g1a', 'Ana Dupla', { grupo_viaje: 'G1', hotel_tipo: 'Doble' }),
  mk('g1b', 'Karla Dupla', { grupo_viaje: 'G1', hotel_tipo: 'Doble' }),
  // grupo de 5 en Compartida → PREGUNTA (más grande que el cuarto)
  ...[1, 2, 3, 4, 5].map((i) => mk('g5' + i, `Maria Grande${i}`, { grupo_viaje: 'G5', hotel_tipo: 'Compartida' })),
  // pareja H-M de 2 en Compartida → excepción firmada (juntos, cuarto con hueco)
  mk('pjA', 'Carlos Pareja', { grupo_viaje: 'GP', hotel_tipo: 'Compartida', genero: 'H' }),
  mk('pjB', 'Daniela Pareja', { grupo_viaje: 'GP', hotel_tipo: 'Compartida', genero: 'M' }),
  // «con X» por NOTA (sin grupo_viaje): las dos deben quedar JUNTAS
  mk('n1', 'Sofia Nota', { notas: 'Hab Cuadruple · con Erika Notada', genero: 'M' }),
  mk('n2', 'Erika Notada', { notas: 'Hab Cuadruple', genero: 'M' }),
  // «con X» irresoluble → pregunta
  mk('n3', 'Paola Huerfana', { notas: 'Hab Cuadruple · con Persona Inexistente', genero: 'M' }),
  // sueltas Compartida: 3 M (una por sugerencia) + 2 H → cuartos SIN mezclar
  mk('s1', 'Lucia Suelta', { notas: 'Hab Cuadruple', genero: 'M' }),
  mk('s2', 'Monica Suelta', { notas: 'Hab Cuadruple' }),           // género por SUGERENCIA
  mk('s3', 'Victor Suelto', { notas: 'Hab Cuadruple', genero: 'H' }),
  mk('s4', 'Hector Suelto', { notas: 'Hab Cuadruple', genero: 'H' }),
  // sin género ni sugerencia en Compartida → pendiente + pregunta
  mk('x1', 'Yamirootz (venta)', { notas: 'Hab Cuadruple' }),
  // individual → cuarto de 1
  mk('i1', 'Regina Sola', { hotel_tipo: 'Individual' }),
  // suelto en Doble sin pareja → va a bolsa y NO se mezcla de género
  mk('d1', 'Rosa SueltaDoble', { hotel_tipo: 'Doble', genero: 'M' }),
  // fuera: baja, no duerme, ya asignado
  mk('b1', 'Baja Total', { boletos: 0, zona_boleto: null }),
  mk('c1', 'Cheap Nochedurmiente', { tipo_paquete: 'CHEAP' }),
  mk('y1', 'Ya Asignada', { hotel_tipo: 'Compartida', genero: 'M' }),
];
const prop = RA.armarPropuesta({ viajeros: fixture, ocupadosNombres: new Set(['Ya Asignada']) });
const cuartoDe = (nombre) => prop.cuartos.find((c) => (c.ocupantes || []).some((o) => o.nombre === nombre));
const nombresDe = (c) => (c ? c.ocupantes.map((o) => o.nombre) : []);

af(prop.cuartos.length > 0 && prop.preguntas.length > 0, `cardinalidad: ${prop.cuartos.length} cuartos y ${prop.preguntas.length} preguntas (no pasa en vacío)`);
const cDupla = cuartoDe('Ana Dupla');
af(cDupla && cDupla.tipo === 'doble' && nombresDe(cDupla).includes('Karla Dupla'), 'grupo de 2 en Doble → cuarto directo, JUNTAS');
af(!cuartoDe('Maria Grande1'), 'grupo de 5 en Compartida NO se parte solo…');
af(prop.preguntas.some((q) => q.includes('Maria Grande1') && q.includes('repártelos')), '…sale como PREGUNTA (regla firmada)');
const cPareja = cuartoDe('Carlos Pareja');
af(cPareja && nombresDe(cPareja).includes('Daniela Pareja'), 'pareja H-M en Compartida va JUNTA (excepción firmada)');
af(cPareja && cPareja.ocupantes.length === 2, '…y su cuarto queda con hueco (nadie se les mete solo)');
af(prop.preguntas.some((q) => q.includes('Carlos Pareja') && q.includes('complétalo')), '…con la pregunta de completarlo a criterio');
const cNota = cuartoDe('Sofia Nota');
af(cNota && nombresDe(cNota).includes('Erika Notada'), 'el «· con X» de la NOTA las junta (resuelto con parecido)');
af(prop.preguntas.some((q) => q.includes('Paola Huerfana') && q.includes('nadie del evento casa')), 'un «con X» irresoluble es pregunta, no grupo inventado');
// géneros jamás mezclados entre DESCONOCIDOS
for (const c of prop.cuartos.filter((x) => !x.pendiente && x.etiqueta !== 'pareja/grupo mixto — excepción firmada' && x.etiqueta !== 'grupo completo')) {
  const gs = [...new Set(c.ocupantes.map((o) => o.genero).filter(Boolean))];
  if (gs.length > 1) { af(false, `cuarto ${c.tipo} «${c.etiqueta}» MEZCLA géneros: ${nombresDe(c).join('·')}`); }
}
af(true, 'ningún cuarto de desconocidos mezcla géneros (barrido completo)');
af((cuartoDe('Monica Suelta') || {}).ocupantes?.some((o) => o.nombre === 'Monica Suelta' && o.genero === 'M' && o.genero_origen === 'sugerido'), 'el género SUGERIDO viaja rotulado «sugerido», jamás como dato');
const cSinG = cuartoDe('Yamirootz (venta)');
af(cSinG && cSinG.pendiente === true, 'sin género → cuarto PENDIENTE (no se crea así)');
af(prop.preguntas.some((q) => q.includes('Sin género')), '…y con su pregunta');
const cInd = cuartoDe('Regina Sola');
af(cInd && cInd.tipo === 'individual' && cInd.ocupantes.length === 1, 'Individual → cuarto de 1');
const cRosa = cuartoDe('Rosa SueltaDoble');
af(cRosa && cRosa.tipo === 'doble' && cRosa.ocupantes.length === 1, 'suelta en Doble sin pareja → su cuarto con lugar libre (no se le mete un H)');
af(prop.fuera.some((f) => f.nombre === 'Baja Total' && /baja/.test(f.motivo)), 'la BAJA queda fuera con su motivo');
af(prop.fuera.some((f) => f.nombre === 'Cheap Nochedurmiente' && /no duerme/.test(f.motivo)), 'CHEAP no duerme → fuera, dicho');
af(prop.fuera.some((f) => f.nombre === 'Ya Asignada' && /ya tiene cuarto/.test(f.motivo)), 'quien ya tiene cuarto no se re-propone');
// control positivo por construcción: si el armador mezclara, el fixture lo vería
af(!nombresDe(cuartoDe('Victor Suelto')).some((n) => ['Lucia Suelta', 'Monica Suelta', 'Sofia Nota'].includes(n)), 'control: los H sueltos NO caen con las M');
// un bloque jamás se parte
const cBloque = cuartoDe('Sofia Nota');
af(cBloque && nombresDe(cBloque).filter((n) => ['Sofia Nota', 'Erika Notada'].includes(n)).length === 2, 'el bloque de la nota quedó ENTERO en un cuarto');

// ───────────────── [D] capacidades: UN dato en tres sitios ──────────────────
console.log('\n[D] capacidades iguales en lib · admin-rooming · front');
const srvSrc = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-rooming.js'), 'utf8');
const frontSrc = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
const capSrv = srvSrc.match(/CAPACIDAD_HAB = \{([^}]+)\}/);
af(capSrv && /individual:\s*1/.test(capSrv[1]) && /cuadruple:\s*4/.test(capSrv[1]), 'admin-rooming: individual 1 · cuadruple 4');
af(RA.CAPACIDAD.individual === 1 && RA.CAPACIDAD.doble === 2 && RA.CAPACIDAD.triple === 3 && RA.CAPACIDAD.cuadruple === 4, 'lib: 1/2/3/4');
const capFront = frontSrc.match(/CAPACIDAD_HAB\s*=\s*\{([^}]+)\}/);
af(capFront && /cuadruple:\s*4/.test(capFront[1]), 'front: cuadruple 4');
af(RA.HOTEL_A_CUARTO.compartida === 'cuadruple', 'Compartida (hotel_tipo) ↔ cuadruple (cuarto)');

// ─────────── [B]+[C] el handler REAL admin-rooming con red falsa ────────────
console.log('\n[B] armar_propuesta por el handler REAL (cero escrituras)');
(async () => {
  // stub de verify-admin ANTES de requerir el handler
  const vaPath = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[vaPath] = { id: vaPath, filename: vaPath, loaded: true, exports: {
    verifyAdminAuthLive: async () => ({ valid: true, user: { id: 'u-bulma', rol: 'bulma', nombre: 'Bulma' } }),
    verifyAdminAuth: async () => ({ valid: true, user: { id: 'u-bulma', rol: 'bulma', nombre: 'Bulma' } }),
    corsCheck: () => 'https://conectareynosa.mx',
  } };
  process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.fake';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'sk-fake';

  // La red falsa: estado + FILTROS respetados (la ley de la casa). Escrituras contadas FUERA.
  const DB = {
    viajeros: [
      { id: '11111111-1111-4111-8111-111111111111', nombre: 'Laura Real', tipo_paquete: 'PLUS', boletos: 1, zona_boleto: 'Oro', hotel_tipo: 'Compartida', genero: null, grupo_viaje: null, habitacion_id: null, notas: null },
      { id: '22222222-2222-4222-8222-222222222222', nombre: 'Pedro Real', tipo_paquete: 'PLUS', boletos: 1, zona_boleto: 'Oro', hotel_tipo: null, genero: 'H', grupo_viaje: null, habitacion_id: null, notas: 'Hab Doble' },
      { id: '33333333-3333-4333-8333-333333333333', nombre: 'Asignada Ya', tipo_paquete: 'PLUS', boletos: 1, zona_boleto: 'Oro', hotel_tipo: 'Doble', genero: 'M', grupo_viaje: null, habitacion_id: null, notas: null },
    ],
    habs: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ocupantes: JSON.stringify(['Asignada Ya']) }],
  };
  const escrituras = [];
  global.fetch = async (url, init) => {
    const u = String(url); const method = (init && init.method) || 'GET';
    if (method !== 'GET') {
      escrituras.push({ u, method, body: init && init.body });
      // PATCH a viajeros_evento?id=eq.<id> (genero_guardar)
      const m = u.match(/viajeros_evento\?id=eq\.([0-9a-f-]+)/);
      if (m && method === 'PATCH') {
        const fila = DB.viajeros.find((v) => v.id === m[1]);
        if (fila) Object.assign(fila, JSON.parse(init.body));
        return { ok: true, status: 204, text: async () => '', json: async () => [] };
      }
      return { ok: true, status: 201, text: async () => '', json: async () => [{}] };
    }
    if (u.includes('/viajeros_evento?')) {
      const m = u.match(/evento_id=eq\.([^&]+)/);
      const ev = m ? decodeURIComponent(m[1]) : null;
      if (!ev) throw new Error('la red falsa no entiende: ' + u);
      return { ok: true, status: 200, json: async () => DB.viajeros, text: async () => '' };
    }
    if (u.includes('/rooming_habitaciones?')) {
      return { ok: true, status: 200, json: async () => DB.habs, text: async () => '' };
    }
    throw new Error('la red falsa no entiende: ' + u);
  };

  const handler = require(path.join(RAIZ, 'netlify/functions/admin-rooming.js')).handler;
  const call = (body) => handler({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx' }, body: JSON.stringify(body) });

  const r1 = await call({ accion: 'armar_propuesta', evento_id: 'omar#1' });
  const j1 = JSON.parse(r1.body);
  af(r1.statusCode === 200 && j1.ok === true, 'armar_propuesta contesta 200 ok');
  af(Array.isArray(j1.cuartos) && j1.cuartos.length >= 1, `…con cuartos (${(j1.cuartos || []).length})`);
  af((j1.fuera || []).some((f) => f.nombre === 'Asignada Ya' && /ya tiene cuarto/.test(f.motivo)), '…y la que YA vive en un cuarto existente queda fuera (ocupados leídos de la tabla real)');
  af(escrituras.length === 0, 'CERO escrituras en la propuesta (medido por el hecho)');
  // control positivo del contador: una escritura inyectada SE VE
  await global.fetch('https://kh.fake/rest/v1/control', { method: 'POST', body: '{}' });
  af(escrituras.length === 1, 'control positivo: el contador SÍ ve una escritura inyectada');
  escrituras.length = 0;

  console.log('\n[C] genero_guardar');
  const idL = '11111111-1111-4111-8111-111111111111';
  const r2 = await call({ accion: 'genero_guardar', cambios: [{ id: idL, genero: 'm' }] });
  const j2 = JSON.parse(r2.body);
  af(r2.statusCode === 200 && j2.guardados === 1, 'guarda 1 (y normaliza m→M)');
  af(DB.viajeros[0].genero === 'M', '…la fila quedó en M');
  af(escrituras.length === 1 && escrituras[0].body === JSON.stringify({ genero: 'M' }), 'el PATCH escribe SOLO {genero} — ninguna otra columna');
  const r3 = await call({ accion: 'genero_guardar', cambios: [{ id: idL, genero: 'X' }] });
  const j3 = JSON.parse(r3.body);
  af((j3.errores || []).length === 1 && j3.guardados === 0, 'género inventado rebota con nombre');
  const r4 = await call({ accion: 'genero_guardar', cambios: Array.from({ length: 201 }, () => ({ id: idL, genero: 'H' })) });
  af(r4.statusCode === 400, 'tope: 201 cambios rebotan');
  const r5 = await call({ accion: 'genero_guardar', cambios: [{ id: idL, genero: '' }] });
  af(JSON.parse(r5.body).guardados === 1 && DB.viajeros[0].genero === null, 'vacío QUITA el género (null)');

  // ───────── [E] viajero_editar_full (handler real de admin-coordi) ─────────
  console.log('\n[E] viajero_editar_full aprende genero (handler REAL)');
  process.env.PORTAL_SUPABASE_URL = ''; process.env.PORTAL_SUPABASE_SERVICE = '';
  const vFila = { id: '44444444-4444-4444-8444-444444444444', evento_id: 'omar#1', nombre: 'Edith Prueba', correo: null, tipo_paquete: 'PLUS', zona_boleto: 'Oro', boletos: 1, total_contrato: 1000, abonado_previo: 0, hotel_tipo: 'Doble', genero: null, notas: '', portal_revisado_at: null };
  const escriturasE = [];
  global.fetch = async (url, init) => {
    const u = String(url); const method = (init && init.method) || 'GET';
    if (u.includes('/viajeros_evento?') && method === 'GET') {
      return { ok: true, status: 200, json: async () => (u.includes(`id=eq.${vFila.id}`) ? [vFila] : []), text: async () => '' };
    }
    if (u.includes('/viajeros_evento?') && method === 'PATCH') {
      escriturasE.push({ u, body: init.body });
      // respeta el VALOR ESPERADO del filtro (genero=is.null etc.)
      if (u.includes('genero=is.null') && vFila.genero !== null) return { ok: true, status: 200, json: async () => [], text: async () => '', headers: { get: () => '0' } };
      Object.assign(vFila, JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => [vFila], text: async () => '', headers: { get: () => '1' } };
    }
    throw new Error('red falsa [E] no entiende: ' + method + ' ' + u);
  };
  delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'))];
  const hC = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
  const callC = (body) => hC({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx' }, body: JSON.stringify(body) });
  const e1 = await callC({ accion: 'viajero_editar_full', id: vFila.id, campos: { genero: 'M' } });
  const je1 = JSON.parse(e1.body);
  af(e1.statusCode === 200 && (je1.cambios || []).some((c) => /género/.test(c)), 'genero M guarda y el cambio se NOMBRA');
  af(vFila.genero === 'M', '…la fila quedó en M');
  const e2 = await callC({ accion: 'viajero_editar_full', id: vFila.id, campos: { genero: 'Z' } });
  af(e2.statusCode === 400 && /género inválido/.test(JSON.parse(e2.body).error || ''), 'genero inventado rebota');
  const e3 = await callC({ accion: 'viajero_editar_full', id: vFila.id, campos: { genero: '' } });
  af(e3.statusCode === 200 && vFila.genero === null, 'vacío lo QUITA');

  // ─────────────── [F] la pantalla REAL (vm + DOM falso) ────────────────────
  console.log('\n[F] la pantalla: select de género en ✏️ y el panel del armador');
  const kh = frontSrc;
  // 1) _vjEditarAbrir pinta vjx-g y _vjEditarGuardar lo manda
  const corta = (src, decl) => {
    const i = src.indexOf(decl);
    if (i < 0) return null;
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    return null;
  };
  const fAbrir = corta(kh, 'function _vjEditarAbrir'); // NO es async (mi primer rojo fue mi expectativa)
  const fGuardar = corta(kh, 'async function _vjEditarGuardar');
  af(!!fAbrir && !!fGuardar, 'las dos funciones del editor se rebanaron (por balance de llaves)');
  // ejecutar _vjEditarGuardar real con DOM falso y khViajeros interceptado
  let payloadEnviado = null;
  const nodos = {};
  const nodo = (val) => ({ value: val, textContent: '', innerHTML: '', checked: false, disabled: false });
  const id44 = 'v-1';
  for (const [k, val] of Object.entries({ n: 'Edith', p: 'plus', z: 'Oro', b: '1', h: 'Doble', g: 'M', t: '1000', a: '0' })) nodos[`vjx-${k}-${id44}`] = nodo(val);
  nodos[`vjx-e-${id44}`] = nodo(''); nodos[`vjx-s-${id44}`] = nodo(''); nodos[`vjx-b2-${id44}`] = nodo('');
  const ctx = {
    document: { getElementById: (x) => nodos[x] || null, querySelectorAll: () => [] },
    khViajeros: { editarFull: async (id, campos) => { payloadEnviado = campos; return { ok: true, cambios: ['género — → M'] }; } },
    showToast: () => {}, _vj2Cargar: async () => {}, _esfEsc: (s) => String(s == null ? '' : s), Number, String, console,
  };
  vm.createContext(ctx);
  vm.runInContext(fGuardar, ctx);
  await vm.runInContext(`_vjEditarGuardar('${id44}')`, ctx);
  af(payloadEnviado && payloadEnviado.genero === 'M', '_vjEditarGuardar REAL manda genero en campos');
  af(/vjx-g-\$\{e\}/.test(fAbrir) && /GÉNERO/.test(fAbrir), '_vjEditarAbrir pinta el select GÉNERO');
  // 2) el panel del armador: existe, aplica por los escritores de siempre
  const fAplicar = corta(kh, 'async function roomingAutoAplicar');
  af(!!fAplicar && /khRooming\.crear\(/.test(fAplicar) && /khViajeros\.habitacion\(/.test(fAplicar), 'roomingAutoAplicar reusa khRooming.crear + khViajeros.habitacion (cero escritor nuevo)');
  af(/generoGuardar/.test(fAplicar), '…y guarda los géneros CONFIRMADOS');
  af(/c\.pendiente/.test(fAplicar) || /!c\.pendiente/.test(fAplicar), '…y los cuartos PENDIENTES (sin género) no se crean');
  const html = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(/roomingAutoArmar\(\)/.test(html), 'el botón ⚡ Armar automático vive en el HTML');
  af(/armar\(eventoId\).*armar_propuesta/.test(kh.replace(/\n/g, ' ')), 'khRooming.armar pide armar_propuesta');

  console.log(`\n${R ? '🔴' : '✅'} ${V} en verde · ${R} en rojo`);
  if (!V) console.log('NADA MEDIDO · esto NO es un verde');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(1); });
