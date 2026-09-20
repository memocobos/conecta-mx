#!/usr/bin/env node
// =============================================================================
// scripts/mide-cuadre-aplicar.js — EL CAREO DE CUADRE-1b (el botón APLICAR)
// =============================================================================
// CUADRE-1a solo leía. Ésta ESCRIBE, así que el careo mide ESCRITURAS, no
// intenciones: la red falsa anota cada POST y cada PATCH con su tabla, su
// filtro y su cuerpo, y las aserciones son Δ contados — filas antes y después.
// Nada se afirma por grep.
//
// Entra por el HANDLER REAL de `admin-excel-aplicar` y simula UN SALTO MÁS
// ADENTRO: el `fetch`. El mismo falso atiende al Apps Script del Excel y a
// PostgREST, así que corren de verdad la cosecha, el protocolo de careo, el
// planificador y —para las altas— el handler REAL de `viajero_migrar`.
//
// 🔒 LOS TRES CANDADOS DE MEMO, MEDIDOS COMO HECHO:
//   · las diferencias NEGATIVAS jamás se aplican (el sistema va adelante del
//     Excel a propósito: trae los pagos de Numerología que las chicas no ven);
//   · los `excel_total = 0` y los totales EXACTOS de la libreta no entran al
//     clic global — cada uno pide su propio botón;
//   · BAJAS y AMBIGUOS, jamás, ni global ni individual.
// Cada uno con su Δ 0 exigido, y con control positivo para que ese 0 valga.
//
// LA RED FALSA RESPETA EL MISMO FILTRO AL LEER Y AL ESCRIBIR. Si un PATCH solo
// entendiera `id=eq.` mientras el handler filtra por otra cosa, la escritura
// caería sobre todas las filas y el careo no lo vería.
// =============================================================================

const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

// La cabecera REAL de «Young Miko- 19 de Septiembre», medida el 20-sep.
const CAB = ['No.','Nombre','Paquete','Boleto','Separo','1','2','3','4','5','6','7','8','9','10',
  'Preventa','Costo','Habitación','Pago Hab','Avión - Bus','Codigo','Total','Abonado','Resta','TALLA',
  'CORREO','CELULAR','EMERGENCIA','HABITACION COMPARTIDA CON','','','','','Luneta','$0','','Stay',''];
const PESTANA = 'Young Miko- 19 de Septiembre';
const EVENTO = 'youngmiko';

function filaExcel(v) {
  const f = new Array(CAB.length).fill('');
  for (const [c, x] of Object.entries(v)) {
    const i = CAB.indexOf(c);
    if (i < 0) throw new Error('columna que la cabecera real no tiene: ' + c);
    f[i] = x;
  }
  return f;
}
const conPreludio = (filas) => [...Array.from({ length: 10 }, () => ['', '']), CAB, ...filas];

// ── LA RED FALSA ─────────────────────────────────────────────────────────────
function redFalsa(base, saboteado) {
  const tablas = JSON.parse(JSON.stringify(base));
  const escrituras = [], lecturas = [];
  const SB = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
  let seq = 0;

  // El MISMO filtro para leer y para escribir. Si un día no entiende un filtro,
  // TRUENA — devolver "todas" sería escribir de más en silencio.
  const filtrar = (filas, qs) => {
    let out = filas;
    for (const [campo, expr] of qs.entries()) {
      if (['select', 'limit', 'order', 'or'].includes(campo)) continue;
      let m;
      if ((m = /^eq\.(.*)$/.exec(expr))) { out = out.filter((f) => String(f[campo]) === decodeURIComponent(m[1])); continue; }
      if ((m = /^is\.(.*)$/.exec(expr))) { const v = m[1] === 'true' ? true : m[1] === 'false' ? false : null; out = out.filter((f) => f[campo] === v); continue; }
      if ((m = /^in\.\((.*)\)$/.exec(expr))) {
        const vals = m[1].split(',').map((v) => decodeURIComponent(v).replace(/^"|"$/g, ''));
        out = out.filter((f) => vals.includes(String(f[campo]))); continue;
      }
      throw new Error('la red falsa no entiende el filtro: ' + campo + '=' + expr);
    }
    return out;
  };
  const proyectar = (filas, qs) => {
    const sel = qs.get('select');
    if (!sel || sel === '*') return filas;
    const cols = sel.split(',').map((c) => c.trim()).filter(Boolean);
    return filas.map((f) => Object.fromEntries(cols.filter((c) => c in f).map((c) => [c, f[c]])));
  };

  const fetchFalso = async (url, opts) => {
    const met = (opts && opts.method) || 'GET';
    if (String(url).startsWith('https://script.test')) {
      const c = JSON.parse(opts.body);
      if (!c.pestana) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, pestanas: [PESTANA] }) };
      const filas = tablas.__excel[c.pestana];
      if (!filas) return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, codigo: 'SIN_PESTANA', error: 'no existe' }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, filas, pestanas: [PESTANA] }) };
    }
    if (!String(url).startsWith(SB)) throw new Error('destino desconocido: ' + url);
    const u = new URL(url);
    const tabla = u.pathname.replace('/rest/v1/', '');
    tablas[tabla] = tablas[tabla] || [];

    if (met === 'GET') {
      lecturas.push(tabla);
      return { ok: true, status: 200, json: async () => proyectar(filtrar(tablas[tabla], u.searchParams), u.searchParams),
               text: async () => '' };
    }
    if (met === 'POST') {
      const cuerpo = JSON.parse(opts.body);
      const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
      const puestas = filas.map((f) => {
        const fila = { id: 'nuevo-' + (++seq), ...f };
        tablas[tabla].push(fila);
        escrituras.push({ tabla, op: 'INSERT', fila });
        return fila;
      });
      if (saboteado === 'escribe-de-mas') {
        tablas['abonos_viajero'] = tablas['abonos_viajero'] || [];
        const x = { id: 'saboteado', viajero_id: 'v-a', monto: 1 };
        tablas['abonos_viajero'].push(x);
        escrituras.push({ tabla: 'abonos_viajero', op: 'INSERT', fila: x });
      }
      return { ok: true, status: 201, json: async () => puestas, text: async () => '' };
    }
    if (met === 'PATCH') {
      const parche = JSON.parse(opts.body);
      const tocadas = filtrar(tablas[tabla], u.searchParams);
      tocadas.forEach((f) => { Object.assign(f, parche); escrituras.push({ tabla, op: 'PATCH', fila: f, parche, filtro: u.search }); });
      return { ok: true, status: 200, json: async () => tocadas, text: async () => '' };
    }
    throw new Error('método no modelado: ' + met);
  };
  return { tablas, escrituras, lecturas, fetchFalso };
}

// ── LA SEMILLA ───────────────────────────────────────────────────────────────
// Once casos, uno por regla. Los montos y los encabezados salen de filas reales.
const SEMILLA = () => ({
  __excel: {
    [PESTANA]: conPreludio([
      // [A] PAGO POSITIVO: Excel 6,480 vs sistema 5,980 → abono de $500.
      filaExcel({ 'Nombre': 'David Lara', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Separo': '$500', '1': '$5,980', 'Total': '$5,950', 'TALLA': 'M' }),
      // [B] PAGO NEGATIVO: Excel 3,000 vs sistema 5,000 (trae Numerología) → JAMÁS.
      filaExcel({ 'Nombre': 'Valeria Colin', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Separo': '$500', '1': '$2,500', 'Total': '$5,950', 'TALLA': 'S' }),
      // [C] TOTAL DERIVADO con excel_total > 0 → UPDATE en el clic global.
      filaExcel({ 'Nombre': 'Ana Ruiz', 'Paquete': 'PLUS', 'Boleto': 'Zona GNP', 'Separo': '$500', '1': '$6,500', 'Total': '$7,850', 'TALLA': 'L' }),
      // [D] TOTAL DERIVADO con excel_total = 0 → FUERA del clic global.
      filaExcel({ 'Nombre': 'Tino Gil', 'Paquete': 'PLUS', 'Boleto': 'Zona GNP', 'Separo': '$500', '1': '$900', 'Total': '$0', 'TALLA': 'L' }),
      // [E] TOTAL EXACTO de la libreta (notas sin «derivado») → FUERA del global.
      filaExcel({ 'Nombre': 'Rosa Vela', 'Paquete': 'PLUS', 'Boleto': 'Zona GNP', 'Separo': '$500', '1': '$1,500', 'Total': '$6,000', 'TALLA': 'M' }),
      // [F] NUEVO con dinero → alta por el camino de `viajero_migrar`.
      filaExcel({ 'Nombre': 'Nadia Soto', 'Paquete': 'CHEAP', 'Boleto': 'Poniente Baja', 'Separo': '$1,000', '1': '$500', 'Total': '$3,200', 'TALLA': 'S' }),
      // [G] APARTADO sin un peso y sin fila en el sistema → alta con $0.
      filaExcel({ 'Nombre': 'Hugo Paz', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Total': '$5,950', 'TALLA': 'XL' }),
      // [J] NUEVO SIN ZONA: `viajero_migrar` la exige → se salta CON MOTIVO.
      filaExcel({ 'Nombre': 'Ines Mota', 'Paquete': 'PLUS', 'Boleto': '', '1': '$700', 'Total': '$4,000' }),
      // [L] EL PLACEHOLDER DE RIDE. Copiado LETRA POR LETRA de las filas 38-42
      //     reales de «Young Miko- 19 de Septiembre» (medidas el 20-sep): cinco
      //     con Nombre «matamoros»/«matomoros», paquete RIDE, Boleto «-» y todo
      //     en $0. NO son personas: son los lugares de recogida apartados.
      filaExcel({ 'Nombre': 'matamoros', 'Paquete': 'RIDE', 'Boleto': '-', 'Costo': '0', 'Pago Hab': '$0', 'Total': '$0', 'TALLA': '-' }),
      // [M] APARTADO de verdad, con zona buena, pero la pestaña dice $0 de total.
      filaExcel({ 'Nombre': 'Ervin Huerta', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Total': '$0', 'TALLA': 'M' }),
      // [K] CUADRA en todo → no genera nada.
      filaExcel({ 'Nombre': 'Cris Mora', 'Paquete': 'PLUS', 'Boleto': 'Cancha General', 'Separo': '$500', '1': '$5,450', 'Total': '$5,950', 'TALLA': 'M' }),
      // [I] AMBIGUO: dos viajeros con ese nombre en el sistema → JAMÁS.
      filaExcel({ 'Nombre': 'Jorge Rivera', 'Paquete': 'PLUS', 'Boleto': 'Zona GNP', 'Separo': '$500', '1': '$9,000', 'Total': '$9,700' }),
    ]),
  },
  excel_pestanas: [{ evento_id: EVENTO, pestana: PESTANA, regla_zona: null, activa: true, notas: null }],
  eventos_meta: [{ slug: EVENTO }],
  stock_ajustes: [],
  abonos_viajero: [],
  viajeros_evento: [
    { id: 'v-a', evento_id: EVENTO, nombre: 'David Lara',   tipo_viajero: 'cliente', abonado_previo: 5980, total_contrato: 5950, notas: 'Migrado Excel 28-ago (Jane)', zona_boleto: 'Cancha General', tipo_paquete: 'plus' },
    { id: 'v-b', evento_id: EVENTO, nombre: 'Valeria Colin', tipo_viajero: 'cliente', abonado_previo: 5000, total_contrato: 5950, notas: 'Migrado Excel 28-ago (Jane) · Numerología 19-sep: +$2,000', zona_boleto: 'Cancha General', tipo_paquete: 'plus' },
    { id: 'v-c', evento_id: EVENTO, nombre: 'Ana Ruiz',     tipo_viajero: 'cliente', abonado_previo: 7000, total_contrato: 7200, notas: 'TOTAL-1: contrato derivado del catálogo (se afina contra la pestaña)', zona_boleto: 'Zona GNP', tipo_paquete: 'plus' },
    { id: 'v-d', evento_id: EVENTO, nombre: 'Tino Gil',     tipo_viajero: 'cliente', abonado_previo: 1400, total_contrato: 3900, notas: 'TOTAL-1: contrato derivado del catálogo (se afina contra la pestaña)', zona_boleto: 'Zona GNP', tipo_paquete: 'plus' },
    { id: 'v-e', evento_id: EVENTO, nombre: 'Rosa Vela',    tipo_viajero: 'cliente', abonado_previo: 2000, total_contrato: 4200, notas: 'Migrado Excel 28-ago (Jane)', zona_boleto: 'Zona GNP', tipo_paquete: 'plus' },
    { id: 'v-k', evento_id: EVENTO, nombre: 'Cris Mora',    tipo_viajero: 'cliente', abonado_previo: 5950, total_contrato: 5950, notas: 'Migrado Excel 28-ago (Jane)', zona_boleto: 'Cancha General', tipo_paquete: 'plus' },
    // [H] BAJA: está en el sistema y ya no en el Excel. JAMÁS se toca.
    { id: 'v-h', evento_id: EVENTO, nombre: 'Zulema Fría',  tipo_viajero: 'cliente', abonado_previo: 3000, total_contrato: 5950, notas: 'Migrado Excel 28-ago (Jane)', zona_boleto: 'Cancha General', tipo_paquete: 'plus' },
    // [I] los dos homónimos
    { id: 'v-i1', evento_id: EVENTO, nombre: 'Jorge Rivera', tipo_viajero: 'cliente', abonado_previo: 1000, total_contrato: 9700, notas: 'Migrado Excel', zona_boleto: 'Zona GNP', tipo_paquete: 'plus' },
    { id: 'v-i2', evento_id: EVENTO, nombre: 'Jorge Rivera', tipo_viajero: 'cliente', abonado_previo: 2000, total_contrato: 9700, notas: 'Migrado Excel', zona_boleto: 'Zona GNP', tipo_paquete: 'plus' },
  ],
});

async function correr(cuerpo, base, saboteado) {
  const red = redFalsa(base || SEMILLA(), saboteado);
  process.env.EXCEL_SCRIPT_URL = 'https://script.test/exec';
  process.env.EXCEL_SCRIPT_TOKEN = 't';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  process.env.SUPABASE_URL_KAMEHOUSE = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
  global.fetch = red.fetchFalso;

  let llamadasAuth = 0;
  const va = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    verifyAdminAuthLive: async () => { llamadasAuth++; return { valid: true, user: { id: 'u1', rol: 'bulma', nombre: 'Bulma' } }; },
  } };
  for (const f of ['admin-excel-aplicar.js', 'admin-excel-careo.js', 'admin-coordi-asignaciones.js',
                   '_lib/excel-careo.js', '_lib/cosecha-excel.js', '_lib/excel-careo-correr.js', '_lib/excel-aplicar.js']) {
    try { delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', f))]; } catch (_) {}
  }
  let mod;
  try { mod = require(path.join(RAIZ, 'netlify/functions/admin-excel-aplicar.js')); }
  catch (e) { return { falta: e.message, red, llamadasAuth, d: {}, res: { statusCode: 0 }, escrituras: red.escrituras, lecturas: red.lecturas, tablas: red.tablas }; }
  const res = await mod.handler({
    httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
    body: JSON.stringify({ evento_id: EVENTO, ...cuerpo }),
  });
  let d = {};
  try { d = JSON.parse(res.body); } catch (_) {}
  return { res, d, red, llamadasAuth, escrituras: red.escrituras, lecturas: red.lecturas, tablas: red.tablas };
}

const cuenta = (t, tabla) => (t[tabla] || []).length;
const HOY_MX = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Matamoros',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

(async () => {
  console.log('CAREO CUADRE-1b · el botón APLICAR, por el handler REAL\n');

  // ── [1] VISTA PREVIA: dice QUÉ va a hacer y NO ESCRIBE ────────────────────
  console.log('[1] vista previa');
  const p = await correr({});
  if (p.falta) { af(false, 'no existe `admin-excel-aplicar`: ' + p.falta); }
  else {
    af(p.res.statusCode === 200, 'la vista previa contestó ' + p.res.statusCode + ': ' + JSON.stringify(p.d).slice(0, 200));
    af(p.llamadasAuth >= 1, 'el handler no llamó al portero');
    af(p.escrituras.length === 0, 'LA VISTA PREVIA ESCRIBIÓ ' + p.escrituras.length + ' vez(ces): ' + JSON.stringify(p.escrituras).slice(0, 200));
    const v = p.d.plan || {};
    console.log('    abonos=' + (v.abonos || []).length + ' totales=' + (v.totales || []).length
      + ' altas=' + (v.altas || []).length + ' saltados=' + (v.saltados || []).length);
    (v.abonos || []).forEach((x) => console.log('      abono · ' + x.nombre + ' $' + x.monto));
    (v.totales || []).forEach((x) => console.log('      total · ' + x.nombre + ' ' + x.sistema_total + '→' + x.excel_total));
    (v.altas || []).forEach((x) => console.log('      alta  · ' + x.nombre + ' abonado=' + x.abonado_previo + ' total=' + x.total_contrato));
    (v.saltados || []).forEach((x) => console.log('      salta · ' + x.nombre + ' — ' + x.motivo));
    af((v.abonos || []).length === 1, 'la vista previa promete ' + (v.abonos || []).length + ' abono(s), se esperaba 1 (solo David)');
    af((v.totales || []).length === 1, 'promete ' + (v.totales || []).length + ' total(es), se esperaba 1 (solo Ana: derivada y > 0)');
    af((v.altas || []).length === 3, 'promete ' + (v.altas || []).length + ' alta(s), se esperaban 3 (Nadia nueva + Hugo y Ervin apartados; «matamoros» NO es persona)');
    af((v.abonos || []).every((x) => x.nombre && x.monto > 0), 'la vista previa trae montos sin nombre: un número pelón no se confirma');
    af((v.saltados || []).some((x) => /Ines/.test(x.nombre) && /zona/i.test(x.motivo)),
       'Ines no trae zona y `viajero_migrar` la exige: tiene que saltarse CON MOTIVO, no desaparecer');
  }

  // ── [1b] EL GUION NO ES UNA ZONA, Y UN TOTAL $0 NO ES UN CONTRATO ────────
  console.log('\n[1b] las dos trampas que destapó la previa contra producción');
  if (!p.falta) {
    const v = p.d.plan || {};
    const alta = (n) => (v.altas || []).find((x) => new RegExp(n, 'i').test(x.nombre));
    const salto = (n) => (v.saltados || []).find((x) => new RegExp(n, 'i').test(x.nombre));
    // 🔒 «-» EN Boleto ES «nada», NO una zona. Con el guion pasando por zona
    // buena, las cinco filas placeholder de RIDE de Young Miko se habrían dado
    // de alta como CINCO PERSONAS en producción.
    af(!alta('matamoros'), 'SE IBA A DAR DE ALTA al placeholder «matamoros»: no es una persona, son los lugares de recogida');
    af(salto('matamoros') && /zona/i.test(salto('matamoros').motivo),
       'el placeholder no se salta con motivo de zona: un «-» en Boleto es «nada», no una zona');
    // 🔒 Un apartado CON zona buena y total $0 SÍ entra —«si está en el Excel,
    // VA»— pero su cero no se presenta como verdad: nace con la marca de total
    // pendiente, que es lo que TOTAL-1 dejó en las 128 filas de esa clase.
    const erv = alta('Ervin');
    af(!!erv, 'Ervin tiene zona buena: «si está en el Excel, VA» — no puede saltarse');
    af(erv && erv.total_pendiente === true,
       'el alta con total $0 no se marca como pendiente: un «$0» tecleado es una fórmula sin llenar, no un contrato de cero pesos');
    console.log('    matamoros → ' + (salto('matamoros') ? 'saltado ✓' : 'SE COLÓ ✗')
      + ' · Ervin ($0) → ' + (erv ? 'alta con pendiente=' + erv.total_pendiente : 'no entra'));
  }

  // ── [2] APLICAR: Δ contados, exactos a lo prometido ───────────────────────
  console.log('\n[2] aplicar');
  const a = await correr({ confirmar: true });
  if (!a.falta) {
    const t = a.tablas;
    console.log('    abonos_viajero: 0 → ' + cuenta(t, 'abonos_viajero') + '   viajeros_evento: 9 → ' + cuenta(t, 'viajeros_evento'));
    af(cuenta(t, 'abonos_viajero') === 1, 'se escribieron ' + cuenta(t, 'abonos_viajero') + ' abono(s), se esperaba 1');
    af(cuenta(t, 'viajeros_evento') === 12, 'viajeros_evento quedó en ' + cuenta(t, 'viajeros_evento') + ', se esperaban 12 (9 + 3 altas)');
    // CARDINALIDAD: si la corrida buena no escribe, los Δ 0 de abajo no dicen nada.
    af(a.escrituras.length > 0, 'la corrida buena no escribió NADA: los Δ 0 de los candados no valdrían nada');
    const ab = (t.abonos_viajero || [])[0] || {};
    console.log('    el abono: ' + JSON.stringify(ab));
    af(ab.viajero_id === 'v-a', 'el abono no es de David (v-a) sino de ' + ab.viajero_id);
    af(ab.monto === 500, 'el abono es de ' + ab.monto + ' y la diferencia era 500');
    af(ab.fecha === HOY_MX, 'la fecha del abono es ' + ab.fecha + ' y hoy en Reynosa es ' + HOY_MX + ' (jamás toISOString)');
    af(/Careo Excel/.test(String(ab.nota)) && String(ab.nota).includes(PESTANA),
       'la nota del abono no nombra el careo y la pestaña: ' + JSON.stringify(ab.nota));
    // 🔒 `capturado_por` SALE DEL TOKEN, jamás del cliente — el mismo
    // anti-spoofing que `abono_crear`: quien registró el dinero no se puede
    // inventar. (La primera versión de esta aserción era una TAUTOLOGÍA que
    // pasaba con cualquier valor; la cazó un sabotaje.)
    af(ab.capturado_por === 'Bulma',
       'capturado_por = ' + JSON.stringify(ab.capturado_por) + ', el token dice «Bulma»');
    af(!('on_conflict' in ab), 'llegó on_conflict a la fila');
    const patches = a.escrituras.filter((e) => e.op === 'PATCH');
    console.log('    PATCHes: ' + patches.length + ' → ' + patches.map((x) => x.fila.nombre + ':' + x.fila.total_contrato).join(', '));
    af(patches.length === 1, 'se hicieron ' + patches.length + ' PATCH(es), se esperaba 1 (solo Ana)');
    af(patches.every((x) => /id=eq\./.test(x.filtro)), 'un PATCH salió sin filtrar por id: escribiría de más');
  }

  // El cliente NO puede suplantar a quien captura.
  const sup = await correr({ confirmar: true, capturado_por: 'EL INTRUSO' });
  if (!sup.falta) {
    const abSup = (sup.tablas.abonos_viajero || [])[0] || {};
    console.log('    con `capturado_por` mandado por el cliente → quedó ' + JSON.stringify(abSup.capturado_por));
    af(abSup.capturado_por === 'Bulma',
       'EL CLIENTE SUPLANTÓ a quien captura: quedó ' + JSON.stringify(abSup.capturado_por));
  }

  // ── [3] 🔒 LAS DIFERENCIAS NEGATIVAS: JAMÁS ───────────────────────────────
  console.log('\n[3] la diferencia NEGATIVA (el sistema va adelante: Numerología)');
  if (!a.falta) {
    const val = (a.tablas.viajeros_evento || []).find((v) => v.id === 'v-b');
    const abonosVal = (a.tablas.abonos_viajero || []).filter((x) => x.viajero_id === 'v-b');
    console.log('    Valeria: abonado_previo ' + val.abonado_previo + ' · abonos escritos ' + abonosVal.length);
    af(abonosVal.length === 0, 'SE APLICÓ UNA DIFERENCIA NEGATIVA: le escribieron ' + abonosVal.length + ' abono(s) a Valeria');
    af(val.abonado_previo === 5000, 'le movieron el abonado_previo a Valeria: ' + val.abonado_previo + ' (está CONGELADO, VJ-3)');
    const neg = (a.d.resultado || a.d.plan || {}).negativas || (a.d.plan || {}).negativas;
    af(Array.isArray(neg) && neg.some((x) => /Valeria/.test(x.nombre)),
       'la negativa no se REPORTA aparte: callarla la vuelve invisible');
    af(Array.isArray(neg) && neg.some((x) => x.numerologia === true),
       'la pantalla no puede decir que esa fila trae la marca de Numerología');
  }

  // ── [4] 🔒 `excel_total = 0` Y LOS EXACTOS: fuera del clic global ─────────
  console.log('\n[4] los totales que el clic global NO toca');
  if (!a.falta) {
    const tino = (a.tablas.viajeros_evento || []).find((v) => v.id === 'v-d');
    const rosa = (a.tablas.viajeros_evento || []).find((v) => v.id === 'v-e');
    console.log('    Tino (excel_total $0): total_contrato ' + tino.total_contrato + ' (era 3900)');
    console.log('    Rosa (exacta de libreta): total_contrato ' + rosa.total_contrato + ' (era 4200)');
    af(tino.total_contrato === 3900, 'EL CLIC GLOBAL PUSO EN CERO un total bueno: Tino quedó en ' + tino.total_contrato);
    af(rosa.total_contrato === 4200, 'el clic global tocó un total EXACTO de la libreta: Rosa quedó en ' + rosa.total_contrato);
    const ana = (a.tablas.viajeros_evento || []).find((v) => v.id === 'v-c');
    af(ana.total_contrato === 7850, 'el derivado de Ana no se aplicó: quedó en ' + ana.total_contrato + ', se esperaba 7850');
    af(/Total de pestaña/.test(String(ana.notas)), 'el total aplicado no dejó nota: ' + JSON.stringify(String(ana.notas).slice(-60)));
    af(/derivado del catálogo/.test(String(ana.notas)), 'la nota vieja se PISÓ en vez de anexarse');
  }

  // ── [5] 🔒 BAJAS Y AMBIGUOS: JAMÁS ────────────────────────────────────────
  console.log('\n[5] bajas y ambiguos');
  if (!a.falta) {
    const zul = (a.tablas.viajeros_evento || []).find((v) => v.id === 'v-h');
    af(!!zul, 'BORRARON A LA BAJA: Zulema ya no está en la tabla');
    af(zul && zul.abonado_previo === 3000 && zul.total_contrato === 5950 && !/careo/i.test(String(zul.notas)),
       'tocaron a la baja: ' + JSON.stringify(zul));
    const tocados = new Set(a.escrituras.filter((e) => e.op === 'PATCH').map((e) => e.fila.id));
    af(!tocados.has('v-i1') && !tocados.has('v-i2'), 'tocaron a un AMBIGUO: elegir cuál de los dos es inventar el dato');
    const abonosAmb = (a.tablas.abonos_viajero || []).filter((x) => ['v-i1', 'v-i2'].includes(x.viajero_id));
    af(abonosAmb.length === 0, 'le escribieron dinero a un homónimo');
  }

  // ── [6] LAS ALTAS, POR LA PUERTA BUENA ────────────────────────────────────
  console.log('\n[6] las altas');
  if (!a.falta) {
    const nadia = (a.tablas.viajeros_evento || []).find((v) => v.nombre === 'Nadia Soto');
    const hugo = (a.tablas.viajeros_evento || []).find((v) => v.nombre === 'Hugo Paz');
    af(!!nadia, 'no se dio de alta a Nadia (nueva en el Excel)');
    af(!!hugo, 'no se dio de alta a Hugo (apartado sin un peso: «si está en el Excel, VA»)');
    if (nadia) {
      console.log('    Nadia: abonado_previo=' + nadia.abonado_previo + ' total=' + nadia.total_contrato + ' paquete=' + nadia.tipo_paquete + ' zona=' + nadia.zona_boleto);
      af(nadia.abonado_previo === 1500, 'Nadia: abonado_previo=' + nadia.abonado_previo + ', el Excel dice 1500 (separo 1000 + pago 500)');
      af(nadia.total_contrato === 3200, 'Nadia: total_contrato=' + nadia.total_contrato + ', la pestaña dice 3200');
      af(nadia.tipo_paquete === 'cheap', 'Nadia: el paquete quedó ' + nadia.tipo_paquete + ' y la pestaña dice CHEAP');
      af(nadia.tipo_viajero === 'cliente', 'el alta no marcó tipo_viajero=cliente: consumeBoleto no la contaría');
      af(/careo/i.test(String(nadia.notas || '')), 'el alta no dejó nota de origen');
    }
    if (hugo) {
      console.log('    Hugo:  abonado_previo=' + hugo.abonado_previo + ' total=' + hugo.total_contrato);
      af(hugo.abonado_previo === 0, 'Hugo es un apartado: abonado_previo debe ser 0 y es ' + hugo.abonado_previo);
      af(!/total pendiente/i.test(String(hugo.notas || '')),
         'a Hugo, que trae total de verdad ($5,950), le pusieron la marca de total pendiente');
    }
    // 🔒 LA MARCA, EN LA FILA ESCRITA — no en el plan. Que el planificador diga
    // `total_pendiente:true` no sirve de nada si la nota no llega a la base:
    // es ahí donde el careo de mañana la va a leer para volver a levantarla.
    const ervin = (a.tablas.viajeros_evento || []).find((v) => /Ervin/.test(v.nombre));
    af(!!ervin, 'no se dio de alta a Ervin (apartado con zona buena y total $0)');
    if (ervin) {
      console.log('    Ervin: total=' + ervin.total_contrato + ' notas=«…' + String(ervin.notas || '').slice(-46) + '»');
      af(/total pendiente/i.test(String(ervin.notas || '')),
         'la fila de Ervin nació con total $0 y SIN la marca de pendiente: el careo de mañana la daría por saldada');
      af(/\$0/.test(String(ervin.notas || '')), 'la nota no dice que el $0 salió de la pestaña');
    }
    // 🔒 POR EL MISMO CAMINO QUE LA ALTA MANUAL: si el alta pasó por
    // `viajero_migrar`, el handler de asignaciones tuvo que consultar
    // `eventos_meta` — su candado de «el evento existe». Es el HECHO de haber
    // entrado por esa puerta, no un grep de que el código la nombra.
    // 🔒 EL HECHO, NO LA PALABRA. `via:'viajero_migrar'` es una cadena que este
    // mismo código escribe: creerle sería creerme a mí. Lo que SÍ es un hecho
    // es que `viajero_migrar` —y NADIE más en este camino— consulta
    // `eventos_meta` para comprobar que el evento existe. Si las altas
    // hubieran salido por un INSERT propio, esa lectura no aparecería.
    const vecesMeta = a.lecturas.filter((t) => t === 'eventos_meta').length;
    console.log('    lecturas de `eventos_meta` (el candado de viajero_migrar): ' + vecesMeta + ' · altas: 3');
    af(vecesMeta === 3, 'las altas NO pasaron por `viajero_migrar`: su candado de «el evento existe» se consultó '
       + vecesMeta + ' vez(ces) y hubo 3 altas. Un INSERT propio aquí sería una segunda puerta que envejece sola.');
    // Y el aviso del doble descuento de MIG-1b tiene que viajar: es lo que
    // impide que el mismo boleto se reste dos veces.
    af((a.d.resultado.altas || []).every((x) => 'aviso_doble_descuento' in x),
       'el alta no trae el aviso de doble descuento de MIG-1b');
  }

  // ── [7] DOBLE CLIC: la segunda pasada no escribe ──────────────────────────
  console.log('\n[7] segundo clic (idempotencia por RE-CAREO, no por UNIQUE)');
  if (!a.falta) {
    // Se re-aplica SOBRE LA MISMA BASE ya tocada: el careo fresco ya no ve
    // esas diferencias, así que no hay nada que escribir.
    const red2 = redFalsa(a.tablas, null);
    process.env.EXCEL_SCRIPT_URL = 'https://script.test/exec';
    global.fetch = red2.fetchFalso;
    for (const f of ['admin-excel-aplicar.js', 'admin-excel-careo.js', 'admin-coordi-asignaciones.js',
                     '_lib/excel-careo.js', '_lib/cosecha-excel.js', '_lib/excel-careo-correr.js', '_lib/excel-aplicar.js']) {
      try { delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', f))]; } catch (_) {}
    }
    const mod2 = require(path.join(RAIZ, 'netlify/functions/admin-excel-aplicar.js'));
    await mod2.handler({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify({ evento_id: EVENTO, confirmar: true }) });
    console.log('    escrituras del 1er clic: ' + a.escrituras.length + ' · del 2º: ' + red2.escrituras.length);
    af(red2.escrituras.length === 0, 'el SEGUNDO clic escribió ' + red2.escrituras.length + ' vez(ces): '
       + JSON.stringify(red2.escrituras.map((e) => e.tabla + ':' + e.op)));
  }

  // ── [8] EL BOTÓN DE RENGLÓN: el exacto y el $0, uno por uno ───────────────
  console.log('\n[8] el botón de renglón (lo que el clic global no toca)');
  const uno = await correr({ confirmar: true, solo: 'totales', claves: ['rosa vela'] });
  if (!uno.falta) {
    const rosa = (uno.tablas.viajeros_evento || []).find((v) => v.id === 'v-e');
    const ana = (uno.tablas.viajeros_evento || []).find((v) => v.id === 'v-c');
    console.log('    Rosa (elegida a mano): ' + rosa.total_contrato + ' · Ana (no elegida): ' + ana.total_contrato);
    af(rosa.total_contrato === 6000, 'el botón de renglón no aplicó el exacto de Rosa: quedó en ' + rosa.total_contrato);
    af(ana.total_contrato === 7200, 'el botón de renglón tocó a Ana, que NO se eligió: quedó en ' + ana.total_contrato);
    af(cuenta(uno.tablas, 'abonos_viajero') === 0, 'pedí solo `totales` y escribió abonos');
  }

  // ── [9] 🔒 NI BAJAS NI AMBIGUOS TAMPOCO POR RENGLÓN ───────────────────────
  console.log('\n[9] el renglón no es la puerta trasera');
  const baja = await correr({ confirmar: true, solo: 'bajas', claves: ['zulema fria'] });
  const amb = await correr({ confirmar: true, solo: 'totales', claves: ['jorge rivera'] });
  if (!baja.falta) {
    console.log('    pedir `bajas` → ' + baja.res.statusCode + ' [' + (baja.d.codigo || '') + '] · escrituras ' + baja.escrituras.length);
    af(baja.escrituras.length === 0, 'pedir bajas por renglón ESCRIBIÓ: ' + JSON.stringify(baja.escrituras.map((e) => e.tabla)));
    // 🔒 Y SE REHÚSA CON NOMBRE. No basta con que no escriba: si el montón
    // entrara a la lista blanca, el plan saldría vacío y la pantalla diría
    // «listo, nada que hacer» sobre una orden que NUNCA debe tener puerta.
    // Callar y rehusar se ven igual desde el lado del que no escribió.
    af(baja.res.statusCode === 400, 'pedir bajas contestó ' + baja.res.statusCode + ', se esperaba 400');
    af(baja.d.codigo === 'MONTON_NO_APLICABLE', 'pedir bajas no trae el código del rehúse: ' + JSON.stringify(baja.d.codigo));
    af(/firma/i.test(String(baja.d.error || '')), 'el rehúse no dice POR QUÉ una baja espera firma');
    const zul = (baja.tablas.viajeros_evento || []).find((v) => v.id === 'v-h');
    af(zul && zul.abonado_previo === 3000, 'tocaron a la baja por la puerta del renglón');
  }
  if (!amb.falta) {
    af(amb.escrituras.length === 0, 'aplicar un AMBIGUO por renglón escribió: ' + JSON.stringify(amb.escrituras.map((e) => e.tabla)));
  }

  // ── [10] CONTROL POSITIVO en los dos sentidos ─────────────────────────────
  console.log('\n[10] CONTROL POSITIVO del contador de escrituras');
  const sab = await correr({ confirmar: true }, null, 'escribe-de-mas');
  if (!sab.falta) {
    const extra = (sab.tablas.abonos_viajero || []).filter((x) => x.id === 'saboteado').length;
    console.log('    red saboteada que escribe de más → filas extra vistas: ' + extra);
    af(extra > 0, 'el contador NO ve una escritura metida a propósito: sus Δ 0 no valen nada');
  }

  // ── [11] DOS PESTAÑAS, UNA PERSONA: los totales se FUNDEN ─────────────────
  // El caso Pa'l Norte / ARRE / Warped. CUADRE-1a sumaba `abonado` y `filas` al
  // fundir dos pestañas y se quedaba con el `total` de la PRIMERA — el de la
  // segunda se tiraba en silencio. Allá reportaba de menos; aquí ESCRIBIRÍA un
  // total corto. Nunca lo sembré en 1a, y por eso el hueco sobrevivió.
  console.log('\n[11] dos pestañas del mismo evento');
  const PEST2 = 'Young Miko- 19 de Septiembre (2)';
  const dos = SEMILLA();
  dos.__excel[PEST2] = conPreludio([
    filaExcel({ 'Nombre': 'Ana Ruiz', 'Paquete': 'PLUS', 'Boleto': 'Zona GNP', 'Separo': '$500', '1': '$500', 'Total': '$2,150' }),
  ]);
  dos.excel_pestanas.push({ evento_id: EVENTO, pestana: PEST2, regla_zona: null, activa: true, notas: null });
  const d2 = await correr({}, dos);
  if (!d2.falta) {
    const ana = ((d2.d.plan || {}).totales || []).find((x) => /Ana/.test(x.nombre));
    console.log('    Ana en DOS pestañas ($7,850 + $2,150): excel_total = ' + (ana ? ana.excel_total : 'no está en el plan'));
    af(ana && ana.excel_total === 10000,
       'al fundir dos pestañas el total quedó en ' + (ana ? ana.excel_total : 'ninguno')
       + ' y debe ser 10000 ($7,850 + $2,150): el de la segunda pestaña se está tirando');
    // Y el hueco manda también aquí: si a UNA de las dos le falta el total, la
    // persona sale null, no con la suma coja.
    const cojo = SEMILLA();
    cojo.__excel[PEST2] = conPreludio([
      filaExcel({ 'Nombre': 'Ana Ruiz', 'Paquete': 'PLUS', 'Boleto': 'Zona GNP', 'Separo': '$500', '1': '$500', 'Total': '' }),
    ]);
    cojo.excel_pestanas.push({ evento_id: EVENTO, pestana: PEST2, regla_zona: null, activa: true, notas: null });
    const d3 = await correr({}, cojo);
    const ana3 = ((d3.d.plan || {}).totales || []).find((x) => /Ana/.test(x.nombre));
    console.log('    con la 2ª pestaña SIN total: Ana ' + (ana3 ? 'entró con ' + ana3.excel_total : 'NO entra al plan ✓'));
    af(!ana3, 'con una pestaña sin total, Ana entró al plan con una suma COJA ('
       + (ana3 ? ana3.excel_total : '') + '): a una suma a la que le falta un sumando no se le escribe dinero');
  }

  // ── [12] LA PANTALLA, RENDERIZADA DE VERDAD ───────────────────────────────
  // `node --check` solo dice que parsea. Aquí se EJECUTA la vista previa con la
  // salida REAL del handler y se mira el HTML — lo único que Bulma va a ver.
  console.log('\n[12] la pantalla');
  const fuente = require('fs').readFileSync(path.join(RAIZ, 'kamehouse-eventos.js'), 'utf8');
  const recortar = (n) => {
    const i = fuente.indexOf('function ' + n + '(');
    if (i < 0) throw new Error('no encontré ' + n + ' en kamehouse-eventos.js');
    let j = fuente.indexOf('{', i), prof = 0;
    for (let k = j; k < fuente.length; k++) {
      if (fuente[k] === '{') prof++;
      else if (fuente[k] === '}' && --prof === 0) return fuente.slice(i, k + 1);
    }
    throw new Error('llaves desbalanceadas en ' + n);
  };
  const previa = new Function(recortar('_evtEsc') + '\n' + recortar('_evtMxn') + '\n'
    + recortar('_excelAplicarPreviaHtml') + '\nreturn _excelAplicarPreviaHtml;')();
  const html = previa(p.d);
  af(/todavía NO se ha escrito nada/i.test(html), 'la vista previa no avisa de que aún no escribió nada');
  af(html.includes('David Lara') && html.includes('$500'), 'la vista previa no enseña el abono con NOMBRE y MONTO');
  af(html.includes('Nadia Soto') && html.includes('Hugo Paz'), 'la vista previa no enseña las altas por nombre');
  af(html.includes('Valeria Colin') && /Numerolog/.test(html),
     'la vista previa no enseña la negativa con su marca de Numerología: un descuadre mudo no se entiende');
  af(/Ines Mota/.test(html) && /sin zona/.test(html), 'la vista previa no enseña a Ines con su motivo');
  af(/BAJAS y los AMBIGUOS no se aplican nunca/.test(html), 'la pantalla no dice que las bajas no se aplican');
  // ASERCIÓN DE AUSENCIA SOBRE EL HTML IMPRESO, no por grep del fuente:
  // Zulema (la baja) no puede aparecer en ninguna lista de la vista previa.
  af(!html.includes('Zulema'), 'LA BAJA aparece en la vista previa del aplicar');
  af(!html.includes('Jorge Rivera'), 'EL AMBIGUO aparece en la vista previa del aplicar');
  // Y EL BOTÓN DE RENGLÓN, en el otro render (el panel del careo). Tiene que
  // salir EXACTAMENTE donde el clic global no llega —el «$0» tecleado y el
  // exacto de la libreta— y NO donde sí llega: un botón de más ahí invita a
  // aplicar a mano lo que ya se aplicó en bola.
  const pintarCareo = new Function(recortar('_evtEsc') + '\n' + recortar('_evtMxn') + '\n'
    + recortar('_excelCareoHtml') + '\nreturn _excelCareoHtml;')();
  const redC = redFalsa(SEMILLA(), null);
  global.fetch = redC.fetchFalso;
  for (const f of ['admin-excel-careo.js', '_lib/excel-careo-correr.js', '_lib/excel-careo.js', '_lib/cosecha-excel.js']) {
    try { delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', f))]; } catch (_) {}
  }
  const careoMod = require(path.join(RAIZ, 'netlify/functions/admin-excel-careo.js'));
  const rc = await careoMod.handler({ httpMethod: 'POST',
    headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
    body: JSON.stringify({ evento_id: EVENTO }) });
  const dc = JSON.parse(rc.body);
  const htmlCareo = pintarCareo(dc);
  const botones = [...htmlCareo.matchAll(/data-aplicar-uno="([^"]+)"/g)].map((m) => m[1]).sort();
  console.log('    botones de renglón: ' + JSON.stringify(botones));
  af(botones.length === 2, 'salieron ' + botones.length + ' botones de renglón, se esperaban 2 (Tino $0 y Rosa exacta)');
  af(botones.includes('Tino Gil'), 'falta el botón de renglón del «$0» tecleado (Tino)');
  af(botones.includes('Rosa Vela'), 'falta el botón de renglón del exacto de libreta (Rosa)');
  af(!botones.includes('Ana Ruiz'), 'Ana es derivada con monto: el clic global ya la aplica, no lleva botón propio');
  console.log('    vista previa: ' + html.length + ' bytes · sin la baja ✓ · sin el ambiguo ✓');

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); process.exit(1); });
