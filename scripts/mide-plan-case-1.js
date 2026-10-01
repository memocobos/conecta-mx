#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-plan-case-1.js — PLAN-CASE-1 · el plan migrado deja de ser ciego a
//                        las mayúsculas
//
// Orden de Memo/Jane (1-oct-2026). El hoyo que MIG-1d-ii midió y no arregló.
//
// 🔒 LOS DOS LADOS SON COMMITS · se entra por el HANDLER REAL y se simula un
//    salto más adentro (el JWT de Supabase y PostgREST).
//
// 🔴 EL FIXTURE SEPARA LAS IMPLEMENTACIONES, que es el punto entero: con el `eq`
//    pelado los dos casos fallan DISTINTO (vacío vs incompleto) y con el arreglo
//    los dos ven su plan COMPLETO. Un fixture donde los dos dieran igual no
//    distinguiría una implementación de la otra.
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let verde = 0, rojo = 0, completo = false;
const fallos = [];
function af(cond, msg) {
  let ok = false, extra = '';
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; }
  catch (e) { ok = false; extra = '  [EXCEPCIÓN: ' + e.message + ']'; }
  if (ok) { verde++; return; }
  let t; try { t = (typeof msg === 'function') ? msg() : msg; }
  catch (e) { t = '(el mensaje también reventó: ' + e.message + ')'; }
  rojo++; fallos.push(t + extra); console.log('   ✗ ' + t + extra);
}
function ver(fn) { try { const v = fn(); return v === undefined ? 'undefined' : JSON.stringify(v); } catch (e) { return '«no se pudo leer: ' + e.message + '»'; } }
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  if (verde + rojo === 0) { console.log('⚠️  NADA MEDIDO · cero aserciones corrieron: esto NO es un verde'); return; }
  console.log((rojo ? '❌ ROJO · ' : '✅ VERDE · ') + verde + ' en verde, ' + rojo + ' en rojo');
  fallos.slice(0, 20).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '0619600';   // el merge de MIG-1d-ii: ahí el `eq` era ciego
const HEAD_SHA = process.env.HEAD_SHA || 'HEAD';
const MEDIDOS = ['netlify/functions/portal-mi-plan-migrado.js'];
function avisarSiSucio() {
  let sucio = '';
  try { sucio = execSync('git status --porcelain -- ' + MEDIDOS.join(' '), { cwd: RAIZ, encoding: 'utf8' }).trim(); } catch (_) { return; }
  if (!sucio) return;
  let mismo = false;
  try {
    mismo = execSync('git rev-parse ' + HEAD_SHA, { cwd: RAIZ, encoding: 'utf8' }).trim()
         === execSync('git rev-parse HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim();
  } catch (_) { mismo = false; }
  if (!mismo) return;
  console.log('\n⚠️  EL ARNÉS MIDE EL COMMIT, NO TU ÁRBOL DE TRABAJO.');
  sucio.split('\n').forEach((l) => console.log('     ' + l));
  console.log('   Committea y vuelve a correr.\n');
  process.exit(2);
}

// ── EL PADRÓN FALSO · copiado de la FORMA de la base viva ───────────────────
// Los dos casos que Jane pidió separados, más los candados del comodín.
const KH_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const VIAJEROS = [
  // 🔴 CASO A — TODAS sus filas en mayúsculas. Con `eq` su plan sale VACÍO.
  { id: 'a1', evento_id: 'arjona', nombre: 'Todo Mayus Perez', correo: 'TodoMayus@Correo.com',
    tipo_paquete: 'PLUS', zona_boleto: 'VIP A', total_contrato: 9200, abonado_previo: 4000 },
  { id: 'a2', evento_id: 'calle24', nombre: 'Todo Mayus Perez', correo: 'TODOMAYUS@correo.com',
    tipo_paquete: 'CHEAP', zona_boleto: 'General', total_contrato: 3000, abonado_previo: 500 },
  // 🔴 CASO B — MEZCLA. Con `eq` su plan sale INCOMPLETO (ve 1 de 2).
  //    Es el caso REAL de la base: «victor» (calle24) y «víctor» (alvarodiaz#0),
  //    el mismo humano con un acento de diferencia.
  { id: 'b1', evento_id: 'calle24', nombre: 'Victor Gael', correo: 'victorgael@correo.com',
    tipo_paquete: 'PLUS', zona_boleto: 'Platino', total_contrato: 8000, abonado_previo: 2000 },
  { id: 'b2', evento_id: 'alvarodiaz#0', nombre: 'Víctor Gael', correo: 'Victorgael@correo.com',
    tipo_paquete: 'CHEAP', zona_boleto: 'Beyond', total_contrato: 2500, abonado_previo: 2500 },
  // ⚠️ EL COMODÍN: 94 filas / 73 personas de la base tienen `_` en su correo.
  //    `maria_lopez` como PATRÓN de ilike casaría `mariaXlopez` — y aquí está el
  //    vecino que lo probaría. Los dos existen a propósito.
  { id: 'c1', evento_id: 'arjona', nombre: 'Maria Lopez', correo: 'maria_lopez@correo.com',
    tipo_paquete: 'PLUS', zona_boleto: 'VIP A', total_contrato: 9000, abonado_previo: 1000 },
  { id: 'c2', evento_id: 'arjona', nombre: 'Maria Equis Lopez', correo: 'mariaXlopez@correo.com',
    tipo_paquete: 'PLUS', zona_boleto: 'VIP B', total_contrato: 7000, abonado_previo: 3000 },
  // Y un vecino cualquiera, para que el barrido no sea trivial.
  { id: 'd1', evento_id: 'arjona', nombre: 'Ajeno Total', correo: 'ajeno@correo.com',
    tipo_paquete: 'CHEAP', zona_boleto: 'General', total_contrato: 3000, abonado_previo: 0 },
];
const ABONOS = [
  { viajero_id: 'a1', monto: 1000, fecha: '2026-09-01' },
  { viajero_id: 'b2', monto: 500, fecha: '2026-09-02' },
];

let PEDIDOS = [], ESCRITURAS = [];
function armarRed() {
  PEDIDOS = []; ESCRITURAS = [];
  global.fetch = async (url, opts) => {
    const u = String(url), met = (opts && opts.method) || 'GET';
    // El salto de adentro del JWT: Supabase /auth/v1/user.
    if (/\/auth\/v1\/user/.test(u)) {
      const tok = ((opts && opts.headers && (opts.headers.Authorization || opts.headers.authorization)) || '').replace('Bearer ', '');
      return { ok: true, status: 200, json: async () => ({ id: 'u-' + tok, email: tok, email_confirmed_at: '2026-01-01T00:00:00Z' }) };
    }
    if (!u.startsWith(KH_URL)) throw new Error('la red falsa no conoce ese destino: ' + u);
    if (met !== 'GET') { ESCRITURAS.push({ met, url: u }); return { ok: true, status: 201, json: async () => [], text: async () => '' }; }
    const uu = new URL(u);
    const tabla = uu.pathname.replace('/rest/v1/', '');
    PEDIDOS.push({ tabla, qs: uu.search });
    let filas = (tabla === 'viajeros_evento' ? VIAJEROS : tabla === 'abonos_viajero' ? ABONOS : null);
    if (filas === null) throw new Error('la red falsa no conoce esa tabla: ' + tabla);
    filas = filas.slice();
    for (const [campo, expr] of uu.searchParams.entries()) {
      if (['select', 'limit', 'order'].includes(campo)) continue;
      let m;
      if ((m = /^eq\.(.*)$/.exec(expr))) { filas = filas.filter((f) => String(f[campo]) === m[1]); continue; }
      if ((m = /^ilike\.(.*)$/.exec(expr))) {
        // 🔒 LA RED FALSA IMITA ILIKE **DE VERDAD**, con sus comodines: `%` cualquier
        // cadena y `_` cualquier carácter. Una red falsa que tratara `ilike` como una
        // igualdad floja dejaría pasar el defecto del comodín y el careo lo bendeciría.
        const pat = '^' + m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$';
        const re = new RegExp(pat, 'i');
        filas = filas.filter((f) => re.test(String(f[campo] == null ? '' : f[campo]))); continue;
      }
      if ((m = /^in\.\((.*)\)$/.exec(expr))) {
        const vals = m[1].split(',').map((v) => decodeURIComponent(v).replace(/^"|"$/g, ''));
        filas = filas.filter((f) => vals.includes(String(f[campo]))); continue;
      }
      throw new Error('la red falsa no entiende el filtro: ' + campo + '=' + expr);
    }
    return { ok: true, status: 200, json: async () => filas, text: async () => '' };
  };
}
function limpiar(dir) {
  for (const f of ['portal-mi-plan-migrado.js', '_lib/cuenta-evento.js']) {
    try { delete require.cache[require.resolve(path.join(dir, 'netlify/functions', f))]; } catch (_) {}
  }
  process.env.SUPABASE_URL_KAMEHOUSE = KH_URL;
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  process.env.PORTAL_SUPABASE_URL = KH_URL;
  process.env.PORTAL_SUPABASE_ANON_KEY = 'anon';
}

(async function main() {
  process.on('exit', marcador);
  avisarSiSucio();
  const b = sacar(BASE, 'pc-base'), h = sacar(HEAD_SHA, 'pc-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }

  // Entra por el handler REAL, con el correo del cliente como su JWT.
  const plan = async (correoJwt, dir) => {
    const d0 = dir || h.dir;
    armarRed(); limpiar(d0);
    const mod = require(path.join(d0, 'netlify/functions/portal-mi-plan-migrado.js'));
    const res = await mod.handler({
      httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + correoJwt },
      body: '{}',
    });
    return { res, d: JSON.parse(res.body || '{}'), pedidos: PEDIDOS.slice(), escrituras: ESCRITURAS.slice() };
  };
  const eventos = (r) => ((r.d.tours || []).map((t) => t.evento_id).sort());

  // ── [A] EL CASO VACÍO · todas sus filas en mayúsculas ─────────────────
  console.log('[A] todas sus filas en MAYÚSCULAS');
  const A = await plan('todomayus@correo.com');
  console.log('    HEAD → ' + ver(() => eventos(A)));
  af(A.res.statusCode === 200 && (A.d.tours || []).length === 2,
     () => '🔴 su plan no trae sus DOS viajes: con el `eq` sensible salía VACÍO, y el Portal le decía «no '
     + 'tienes nada» a alguien que pagó. Salió ' + ver(() => eventos(A)));
  af(JSON.stringify(eventos(A)) === JSON.stringify(['arjona', 'calle24']),
     () => 'no son arjona y calle24: ' + ver(() => eventos(A)));

  // ── [B] EL CASO INCOMPLETO · mezcla ───────────────────────────────────
  // El caso REAL de la base: «victor» y «víctor», el mismo humano.
  console.log('\n[B] MEZCLA de ortografías (el caso real de la base)');
  const B = await plan('victorgael@correo.com');
  console.log('    HEAD → ' + ver(() => eventos(B)));
  af((B.d.tours || []).length === 2,
     () => '🔴 ve su viaje INCOMPLETO: con el `eq` veía 1 de 2 y no tenía forma de saber que faltaba el otro. '
     + 'Salió ' + ver(() => eventos(B)));
  af(JSON.stringify(eventos(B)) === JSON.stringify(['alvarodiaz#0', 'calle24']),
     () => 'no son sus dos eventos: ' + ver(() => eventos(B)));

  // ── [+] CONTROL POSITIVO · BASE FALLA con el MISMO fixture ────────────
  // 🔴 Sin esto, los dos verdes de arriba no dicen nada: podrían estar pasando
  // porque el fixture no ejercita el hoyo.
  console.log('\n[+] control positivo · BASE con el MISMO fixture');
  const Ab = await plan('todomayus@correo.com', b.dir);
  const Bb = await plan('victorgael@correo.com', b.dir);
  console.log('    BASE caso A → ' + ver(() => eventos(Ab)) + '   ·   caso B → ' + ver(() => eventos(Bb)));
  af((Ab.d.tours || []).length === 0,
     () => '🔴 CONTROL POSITIVO: en BASE el caso A tenía que salir con el plan VACÍO. Si ya veía sus viajes, '
     + 'el fixture no ejercita el hoyo y los verdes de arriba no prueban nada. Salió ' + ver(() => eventos(Ab)));
  af((Bb.d.tours || []).length === 1,
     () => '🔴 CONTROL POSITIVO: en BASE el caso B tenía que ver UNO de sus dos viajes (plan incompleto). '
     + 'Salió ' + ver(() => eventos(Bb)));
  // 🔒 Y FALLAN **DISTINTO**: vacío vs incompleto. Es lo que hace que el fixture
  // distinga una implementación de otra en vez de solo «fallar».
  af((Ab.d.tours || []).length !== (Bb.d.tours || []).length,
     'los dos casos de BASE fallan IGUAL: entonces el fixture no separa «plan vacío» de «plan incompleto», '
     + 'que son los dos modos distintos en que el hoyo muerde');

  // ── [¬] EL COMODÍN NO PESCA AJENOS ───────────────────────────────────
  // 🔴 94 filas / 73 personas de la base viva tienen `_` en su correo. En ILIKE,
  // `_` casa CUALQUIER carácter: `maria_lopez` como patrón casaría `mariaXlopez`.
  // Hoy, por suerte, ninguno de los 73 pesca ajenas — pero la corrección NO puede
  // depender de que los datos sigan con suerte, así que aquí el vecino existe.
  console.log('\n[¬] el comodín `_` no se lleva al vecino');
  const C = await plan('maria_lopez@correo.com');
  console.log('    maria_lopez → ' + ver(() => (C.d.tours || []).map((t) => t.zona))
    + '   (el vecino mariaXlopez tiene zona VIP B)');
  af((C.d.tours || []).length === 1,
     () => '🔴 EL COMODÍN SE LLEVÓ AL VECINO: `maria_lopez` como patrón de ILIKE casa `mariaXlopez`, y esa '
     + 'persona vería el plan de OTRA. El `ilike` solo puede ESTRECHAR; la autoridad tiene que ser el filtro '
     + '`lower()` del handler. Salió ' + ver(() => (C.d.tours || []).map((t) => t.zona)));
  af((C.d.tours || [])[0] && (C.d.tours || [])[0].zona === 'VIP A',
     () => 'el tour que ve no es el SUYO: ' + ver(() => (C.d.tours || []).map((t) => t.zona)));
  // Y el de al lado ve el suyo, no el de ella: la asimetría en los dos sentidos.
  const C2 = await plan('mariaxlopez@correo.com');
  af((C2.d.tours || []).length === 1 && C2.d.tours[0].zona === 'VIP B',
     () => 'el vecino no ve su propio plan: ' + ver(() => (C2.d.tours || []).map((t) => t.zona)));

  // ── [$] LA ARITMÉTICA NO SE MOVIÓ · `saldoMigrado` sigue siendo el dueño ──
  console.log('\n[$] el dinero lo sigue contestando `saldoMigrado`');
  const mismo = fs.readFileSync(path.join(b.dir, 'netlify/functions/_lib/cuenta-evento.js'), 'utf8')
             === fs.readFileSync(path.join(h.dir, 'netlify/functions/_lib/cuenta-evento.js'), 'utf8');
  console.log('    cuenta-evento.js byte a byte igual que BASE: ' + mismo);
  af(mismo,
     '🔴 `_lib/cuenta-evento` CAMBIÓ. Esta tuerca toca el CASAMIENTO, jamás la cuenta: si la aritmética del '
     + 'dinero se movió aquí, se movió sin que nadie lo pidiera');
  {
    // Y la cuenta se le PIDE al dueño, con el dato que el handler sirvió.
    const { saldoMigrado } = require(path.join(h.dir, 'netlify/functions/_lib/cuenta-evento.js'));
    const esperado = saldoMigrado(VIAJEROS.find((v) => v.id === 'a1'), ABONOS.filter((a) => a.viajero_id === 'a1'));
    const servido = (A.d.tours || []).find((t) => t.evento_id === 'arjona');
    console.log('    dueño dice ' + ver(() => esperado) + ' · el handler sirvió '
      + ver(() => servido && { total: servido.total, abonado: servido.abonado, resta: servido.resta }));
    af(servido && servido.abonado === esperado.abonado && servido.resta === esperado.resta && servido.total === esperado.total,
       () => '🔴 el dinero servido no es el del dueño: ' + ver(() => ({ dueno: esperado, servido })));
    // 🔒 Y el caso A antes NO SE PODÍA MEDIR: en BASE su plan salía vacío, así que
    // esta aritmética nunca llegaba a correr para él. El arreglo no solo lo hace
    // visible — hace que su dinero se CUENTE.
    af(esperado.abonado === 5000,
       () => 'el abonado de a1 tenía que ser 4,000 de previo + 1,000 de abono: ' + ver(() => esperado.abonado));
  }

  // ── [0] CERO ESCRITURAS · ni un UPDATE a los datos de la gente ────────
  console.log('\n[0] cero escrituras');
  const todas = [...A.escrituras, ...B.escrituras, ...C.escrituras];
  console.log('    escrituras en todas las corridas: ' + todas.length);
  af(todas.length === 0,
     () => '🔴 ESCRIBIÓ: 285 filas de datos de gente NO se tocan para arreglar un lector, y el crudo del correo '
     + 'es justo el dato que delata el problema. ' + ver(() => todas));
  const srcH = fs.readFileSync(path.join(h.dir, 'netlify/functions/portal-mi-plan-migrado.js'), 'utf8');
  af(!/method\s*:\s*'(POST|PATCH|DELETE|PUT)'/.test(srcH),
     'el handler nombra un método de escritura: este lector solo lee');
  // 🔒 Y EL CRUDO DEL CORREO VIAJA en el select, porque es con lo que se compara.
  af(/select=[^&]*\bcorreo\b/.test(srcH),
     'el `select` ya no trae `correo`: sin el crudo, el filtro `lower()` del handler no tiene qué comparar — '
     + 'la ley de `boletos_crudo`');

  // ── [=] EL ESTRECHAMIENTO ES UN SUPERCONJUNTO ─────────────────────────
  // La razón por la que filtrar DESPUÉS basta: el patrón solo puede sobre-pescar.
  console.log('\n[=] el `ilike` estrecha, no excluye');
  const pedidoV = (A.pedidos || []).find((p) => p.tabla === 'viajeros_evento');
  console.log('    filtro que viajó: ' + ver(() => pedidoV && decodeURIComponent(pedidoV.qs).slice(0, 60)));
  af(pedidoV && /correo=ilike\./.test(pedidoV.qs),
     () => 'el handler no estrecha por `ilike`: ' + ver(() => pedidoV && pedidoV.qs));
  af(pedidoV && !/correo=eq\./.test(pedidoV.qs),
     'el handler sigue mandando un `eq` sensible: es el defecto que esta tuerca cierra');

  completo = true;
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN DEL ARNÉS: ' + e.stack); process.exit(1); });
