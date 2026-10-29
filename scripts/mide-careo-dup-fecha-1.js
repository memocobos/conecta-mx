#!/usr/bin/env node
// =============================================================================
// mide:careo-dup-fecha-1 — [CAREO-DUP-FECHA-1] (29-oct-2026)
//
// EL DEFECTO, MEDIDO EN PRODUCCIÓN ANTES DE ESCRIBIR UNA LÍNEA (vista previa
// del handler real, cero escrituras): el careo de `coronacapital#0` proponía
// como ALTA NUEVA a Frida —que vive en `#3`— y el de `#1` a SEIS personas que
// viven en `#5`. Nueve altas, SIETE duplicados: $35,345 de contrato y $28,396
// de abonado previo que habrían nacido de la nada, más 7 boletos restados dos
// veces del inventario.
//
// LA CAUSA: `leerBase` filtra `evento_id=eq.<esta fecha>` —correcto, es el
// padrón de ESA fecha— y la pestaña de Corona es COMPARTIDA entre #0/#1/#2/#5.
// Quien tiene «General Sabado» en su columna Boleto pero está capturado en el
// pase de 3 días no aparece en el padrón de #1, así que el careo lo da por
// nuevo. El Excel dice que compró el sábado y la base dice que compró los tres
// días: dos verdades sobre la misma persona, y el careo se creía la única que ve.
//
// ⚠️ SIN ANCLA DE COMMIT, a propósito, como `mide:cuadre-aplicar`: carga de
// `RAIZ`, o sea del ÁRBOL DE TRABAJO. Dos consecuencias y son distintas:
//   ✅ no sufre la trampa del commit (mide lo que acabas de escribir) y no hay
//      ancla que mover cuando otra tuerca le cambie el sujeto;
//   ⚠️ NO puede traer control positivo por commit, porque no tiene BASE contra
//      la que exigir que el defecto existía. Sus controles son POSITIVOS POR
//      CONSTRUCCIÓN: se siembra el caso y se le quita la pieza nueva a mano.
// =============================================================================
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { try { if (c) ok++; else { mal++; fallos.push(e); } } catch (err) { mal++; fallos.push(e + ' [EXCEPCIÓN: ' + err.message + ']'); } };

// ── El Excel de mentira ──────────────────────────────────────────────────────
const CAB = ['No.', 'Nombre', 'Paquete', 'Boleto', 'Separo', '1', '2', '3', 'Total', 'TALLA'];
const PESTANA = 'Corona Capital 2026 20,21 y 22 de nov';
const EVENTO = 'coronacapital#1';          // el sábado: la fecha que se carea
const OTRA   = 'coronacapital#5';          // el pase de 3 días: donde SÍ viven
function filaExcel(vals) {
  const f = CAB.map(() => '');
  for (const [k, v] of Object.entries(vals)) { const i = CAB.indexOf(k); if (i >= 0) f[i] = v; }
  return f;
}
const conPreludio = (filas) => [...Array.from({ length: 10 }, () => ['', '']), CAB, ...filas];

// ── LA RED FALSA ─────────────────────────────────────────────────────────────
// 🔒 El MISMO filtro para leer y para escribir, y TRUENA ante uno que no
// entienda: devolver «todas» sería leer y escribir de más en silencio — y aquí
// el filtro nuevo (`like.slug*`) es justo el de las hermanas, así que un fake
// permisivo habría hecho pasar el candado sin medirlo.
function redFalsa(base, opts) {
  const o = opts || {};
  const tablas = JSON.parse(JSON.stringify(base));
  const escrituras = [], lecturas = [];
  const SB = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
  let seq = 0;

  const filtrar = (filas, qs) => {
    let out = filas;
    for (const [campo, expr] of qs.entries()) {
      if (['select', 'limit', 'order', 'or'].includes(campo)) continue;
      let m;
      if ((m = /^eq\.(.*)$/.exec(expr))) { out = out.filter((f) => String(f[campo]) === decodeURIComponent(m[1])); continue; }
      if ((m = /^neq\.(.*)$/.exec(expr))) { out = out.filter((f) => f[campo] != null && String(f[campo]) !== decodeURIComponent(m[1])); continue; }
      if (expr === 'not.is.null') { out = out.filter((f) => f[campo] != null); continue; }
      if ((m = /^is\.(.*)$/.exec(expr))) { const v = m[1] === 'true' ? true : m[1] === 'false' ? false : null; out = out.filter((f) => f[campo] === v); continue; }
      // [CAREO-DUP-FECHA-1] `like.slug*` como lo hace PostgREST: el `*` es el
      // comodín. 🔒 Se modela SOBRE-pescando igual que el real —`coronacapital2`
      // casa con `like.coronacapital*`— porque ésa es justo la razón de que la
      // autoridad sea `esDelEvento` y no el filtro. Un fake que ya filtrara
      // «bien» escondería el defecto que `esDelEvento` existe para cerrar.
      if ((m = /^like\.(.*)$/.exec(expr))) {
        const pat = decodeURIComponent(m[1]).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        const re = new RegExp('^' + pat + '$');
        out = out.filter((f) => re.test(String(f[campo] == null ? '' : f[campo]))); continue;
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

  const fetchFalso = async (url, opts2) => {
    const met = (opts2 && opts2.method) || 'GET';
    if (String(url).startsWith('https://script.test')) {
      const c = JSON.parse(opts2.body);
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
      lecturas.push({ tabla, qs: u.search });
      // El escenario «no se pueden leer las hermanas»: SOLO esa lectura falla.
      // 🔒 Se distingue por el filtro `like.` — si se tumbara `viajeros_evento`
      // entero, el careo moriría antes y mediríamos otra cosa.
      if (o.hermanasCaidas && tabla === 'viajeros_evento' && /like\./.test(u.search)) {
        return { ok: false, status: 500, json: async () => null, text: async () => 'boom' };
      }
      return { ok: true, status: 200, json: async () => proyectar(filtrar(tablas[tabla], u.searchParams), u.searchParams), text: async () => '' };
    }
    if (met === 'POST') {
      const cuerpo = JSON.parse(opts2.body);
      const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
      const puestas = filas.map((f) => {
        const fila = { id: 'nuevo-' + (++seq), ...f };
        tablas[tabla].push(fila);
        escrituras.push({ tabla, op: 'INSERT', fila });
        return fila;
      });
      return { ok: true, status: 201, json: async () => puestas, text: async () => '' };
    }
    if (met === 'PATCH') {
      const parche = JSON.parse(opts2.body);
      const tocadas = filtrar(tablas[tabla], u.searchParams);
      tocadas.forEach((f) => { Object.assign(f, parche); escrituras.push({ tabla, op: 'PATCH', fila: f, parche, filtro: u.search }); });
      return { ok: true, status: 200, json: async () => tocadas, text: async () => '' };
    }
    if (met === 'DELETE') throw new Error('DELETE: el careo no borra NUNCA');
    throw new Error('método no modelado: ' + met);
  };
  return { tablas, escrituras, lecturas, fetchFalso };
}

// ── LA SEMILLA ───────────────────────────────────────────────────────────────
// Reproduce la forma REAL de Corona: UNA pestaña compartida, partida por
// `regla_zona`, y gente capturada en OTRA fecha de la que su Boleto indica.
const SEMILLA = () => ({
  __excel: {
    [PESTANA]: conPreludio([
      // [1] EL DUPLICADO. Su Boleto dice «General Sabado» (= la regla de #1)
      //     pero ella vive en #5. Los montos DIFIEREN a propósito entre las dos
      //     fuentes — un fixture donde coincidieran no distinguiría «leí la
      //     hermana» de «leí la pestaña».
      filaExcel({ 'Nombre': 'Magnolia Janeth Hernandez Garcia', 'Paquete': 'PLUS',
                  'Boleto': 'General Sabado', 'Separo': '$500', '1': '$2,956', 'Total': '$3,990', 'TALLA': 'M' }),
      // [2] EL ALTA LEGÍTIMA: no existe en NINGUNA fecha del evento.
      filaExcel({ 'Nombre': 'Brian Eliud Gutierrez', 'Paquete': 'PLUS',
                  'Boleto': 'General Sabado', 'Separo': '$500', '1': '$3,400', 'Total': '$3,900', 'TALLA': 'L' }),
      // [3] Alguien que SÍ vive en ESTA fecha y cuadra: no genera nada. Está
      //     para que el montón de altas no sea el único camino ejercitado.
      filaExcel({ 'Nombre': 'Ilse Quieta', 'Paquete': 'PLUS',
                  'Boleto': 'General Sabado', 'Separo': '$500', '1': '$3,490', 'Total': '$3,990', 'TALLA': 'S' }),
    ]),
  },
  excel_pestanas: [{ evento_id: EVENTO, pestana: PESTANA, regla_zona: 'General Sabado', activa: true, notas: null }],
  eventos_meta: [{ slug: 'coronacapital' }],
  stock_ajustes: [],
  abonos_viajero: [],
  viajeros_evento: [
    // En ESTA fecha (#1): solo Ilse, y cuadrada.
    { id: 'v-ilse', evento_id: EVENTO, nombre: 'Ilse Quieta', tipo_viajero: 'cliente',
      abonado_previo: 3990, total_contrato: 3990, notas: 'Migrado Excel', zona_boleto: 'General', tipo_paquete: 'plus', boletos: 1 },
    // En la OTRA fecha (#5): Magnolia. El careo de #1 la daba por nueva.
    { id: 'v-magnolia', evento_id: OTRA, nombre: 'Magnolia Janeth Hernandez Garcia', tipo_viajero: 'cliente',
      abonado_previo: 2865, total_contrato: 3900, notas: 'Migrado Excel', zona_boleto: 'General', tipo_paquete: 'PLUS', boletos: 1 },
    // 🔒 UN PREFIJO NO ES UN ANCLA (la ley de CANCEL-UI-1, que sembró
    // `brunomars2` junto a `bruno`): este evento NO es Corona, y su homónimo
    // NO puede contar como hermana. El `like.coronacapital*` SÍ lo pesca —así
    // está modelado el fake, igual que el PostgREST real—, así que lo único
    // que lo deja fuera es `esDelEvento`.
    { id: 'v-ajeno', evento_id: 'coronacapital2#0', nombre: 'Brian Eliud Gutierrez', tipo_viajero: 'cliente',
      abonado_previo: 999, total_contrato: 999, notas: 'otro evento', zona_boleto: 'General', tipo_paquete: 'plus', boletos: 1 },
  ],
});

async function correr(cuerpo, base, opts) {
  const red = redFalsa(base || SEMILLA(), opts);
  process.env.EXCEL_SCRIPT_URL = 'https://script.test/exec';
  process.env.EXCEL_SCRIPT_TOKEN = 't';
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  process.env.SUPABASE_URL_KAMEHOUSE = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
  global.fetch = red.fetchFalso;

  const va = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    verifyAdminAuthLive: async () => ({ valid: true, user: { id: 'u1', rol: 'bulma', nombre: 'Bulma' } }),
  } };
  for (const f of ['admin-excel-aplicar.js', '_lib/excel-careo.js', '_lib/cosecha-excel.js',
                   '_lib/excel-careo-correr.js', '_lib/excel-aplicar.js', '_lib/misma-persona.js']) {
    try { delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions', f))]; } catch (_) {}
  }
  let mod;
  try { mod = require(path.join(RAIZ, 'netlify/functions/admin-excel-aplicar.js')); }
  catch (e) { return { falta: e.message, red, d: {}, res: { statusCode: 0 }, escrituras: red.escrituras, lecturas: red.lecturas, tablas: red.tablas }; }
  const res = await mod.handler({
    httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
    body: JSON.stringify({ evento_id: EVENTO, ...cuerpo }),
  });
  let d = {};
  try { d = JSON.parse(res.body); } catch (_) {}
  return { res, d, red, escrituras: red.escrituras, lecturas: red.lecturas, tablas: red.tablas };
}

(async () => {
  console.log('── mide:careo-dup-fecha-1 ' + '─'.repeat(46));

  // ═══ [M] LA MUDANZA: el lib contesta IGUAL que el cuerpo que vivía en el
  // handler. 🔒 No es ceremonia: la forma fácil de romper «pregúntale al dueño»
  // es cambiarle la respuesta al dueño (NUBE-3), y aquí el dueño original
  // —CREA-3, el candado del duplicado de las cortesías— sigue bebiendo de esto.
  {
    const { parecido, tokens, esDelEvento, slugBase } = require(path.join(RAIZ, 'netlify/functions/_lib/misma-persona.js'));
    // El cuerpo VIEJO, copiado tal cual estaba en admin-coordi-asignaciones.
    const _tokViejo = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length >= 3);
    const _parecidoViejo = (a, b) => {
      const ta = _tokViejo(a), tb = new Set(_tokViejo(b));
      if (!ta.length || !tb.has(ta[0])) return false;
      return ta.length === 1 || ta.slice(1).some((t) => tb.has(t));
    };
    const PARES = [
      ['Magnolia Janeth Hernandez Garcia', 'Magnolia Janeth Hernandez Garcia'],
      ['Frida Xamel Peralta Rodriguez', 'Frida Xamel Peralta Rodriguez'],
      ['Daniel Isaí Hernández Aradillas.', 'Daniel Isai Hernandez Aradillas'],
      ['Marietta', 'Marietta Barrera'],
      ['Brian Eliud Gutierrez', 'Magnolia Janeth Hernandez Garcia'],
      ['Jose Luis Garcia', 'Jose Antonio Perez'],      // mismo primer token, nada más
      ['Ana', 'Ana Ruiz'],
      ['', 'Ana Ruiz'],
      ['de la Cruz', 'la Cruz de'],                     // partículas <3: no deben casar solas
      ['Ernersto Hinojosa', 'Ernesto Hinojosa'],        // el dedazo real de la base
    ];
    let difer = 0;
    for (const [a, b] of PARES) if (parecido(a, b) !== _parecidoViejo(a, b)) difer++;
    af(PARES.length >= 10, '🔒 CARDINALIDAD: el careo de la mudanza mide al menos 10 pares (midió ' + PARES.length + ')');
    af(difer === 0, '[M] la MUDANZA no cambió la respuesta: ' + difer + ' de ' + PARES.length + ' pares difieren del cuerpo viejo');
    // Y que de verdad DISCRIMINA — si dijera siempre lo mismo, el careo de
    // arriba pasaría con una función constante.
    af(parecido('Magnolia Janeth Hernandez Garcia', 'Magnolia Janeth Hernandez Garcia') === true, '[M] casa a la misma persona');
    af(parecido('Brian Eliud Gutierrez', 'Magnolia Janeth Hernandez Garcia') === false, '[M] NO casa a dos personas distintas');
    af(parecido('Jose Luis Garcia', 'Jose Antonio Perez') === false, '[M] el primer token SOLO no basta');
    af(parecido('Marietta', 'Marietta Barrera') === true, '[M] un nombre de un token casa con el primero (caso Marietta, CREA-3)');
    af(tokens('de la Cruz').length === 1, '[M] las partículas de <3 letras quedan fuera (tokens: ' + JSON.stringify(tokens('de la Cruz')) + ')');
    // esDelEvento: la ley del prefijo
    af(esDelEvento('coronacapital#3', 'coronacapital') === true, '[M] esDelEvento acepta la hija multifecha');
    af(esDelEvento('coronacapital', 'coronacapital') === true, '[M] esDelEvento acepta la llave exacta');
    af(esDelEvento('coronacapital2#0', 'coronacapital') === false, '🔒 [M] UN PREFIJO NO ES UN ANCLA: coronacapital2 NO es coronacapital');
    af(slugBase('coronacapital#3') === 'coronacapital', '[M] slugBase corta en el #');
    // Y el dueño ORIGINAL sigue pidiéndolo, no declarándolo (si no, son dos listas)
    const fuenteCoordi = require('fs').readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');
    af(/require\('\.\/_lib\/misma-persona'\)/.test(fuenteCoordi), '[M] admin-coordi-asignaciones PIDE el lib');
    const sinComentarios = fuenteCoordi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    af(!/const _tok *=/.test(sinComentarios), '[M] y ya NO declara su propio _tok (cero gemelas)');
  }

  // ═══ [D] EL CANDADO: el duplicado NO se propone; el alta legítima SÍ ═══════
  {
    const r = await correr({});
    af(!r.falta, '[D] el handler corre' + (r.falta ? ': ' + r.falta : ''));
    const plan = r.d.plan || {};
    const altas = (plan.altas || []).map((a) => a.nombre);
    const dups  = plan.dup_otra_fecha || [];

    af(r.d.confirmado === false, '[D] vista previa: confirmado=false');
    af(r.escrituras.length === 0, '🔒 [D] la vista previa NO escribe nada (escribió ' + r.escrituras.length + ')');

    af(altas.length === 1, '[D] propone UNA sola alta (propuso ' + altas.length + ': ' + JSON.stringify(altas) + ')');
    af(altas.includes('Brian Eliud Gutierrez'), '[D] la que SÍ es nueva se propone');
    af(!altas.some((n) => /Magnolia/.test(n)), '🔒 [D] la que ya vive en #5 NO se propone como alta');

    af(dups.length === 1, '[D] el montón dup_otra_fecha trae UNO (trae ' + dups.length + ')');
    const d0 = dups[0] || {};
    af(/Magnolia/.test(d0.nombre || ''), '[D] y es Magnolia (es «' + d0.nombre + '»)');
    af((d0.en_sistema || []).length === 1, '[D] con UNA fila en el sistema (trae ' + (d0.en_sistema || []).length + ')');
    const s0 = (d0.en_sistema || [])[0] || {};
    af(s0.evento_id === OTRA, '🔒 [D] DICE dónde vive: ' + s0.evento_id + ' (esperado ' + OTRA + ')');
    af(s0.viajero_id === 'v-magnolia', '[D] con su id, para poder abrirla');
    // 🔒 LOS MONTOS DE LAS DOS FUENTES, y que NO coincidan es el punto: ese
    // desacuerdo es el dato que un humano tiene que mirar. Un montón que solo
    // dijera «ya existe» no diría qué está en disputa.
    af(s0.total_contrato === 3900 && s0.abonado_previo === 2865,
       '🔒 [D] trae lo que dice LA BASE (tot ' + s0.total_contrato + ' · prev ' + s0.abonado_previo + ')');
    af(d0.excel && d0.excel.total === 3990,
       '🔒 [D] y lo que dice EL EXCEL (tot ' + (d0.excel && d0.excel.total) + ') — difieren, que es la gracia');
    af(d0.excel && d0.excel.total !== s0.total_contrato,
       '🔒 [D] el fixture SEPARA las dos fuentes: si coincidieran, el careo no distinguiría de dónde leyó');

    // El prefijo ajeno no contaminó: Brian vive en `coronacapital2#0` y aun así
    // se propone, porque ése NO es este evento.
    af(altas.includes('Brian Eliud Gutierrez'),
       '🔒 [D] el homónimo de coronacapital2#0 NO frenó el alta (esDelEvento manda sobre el like)');
    af(!dups.some((x) => /Brian/.test(x.nombre || '')), '🔒 [D] y NO salió como duplicado');

    // El resumen lo CUENTA: un montón sin conteo no se ve en la pantalla.
    af((r.d.resumen || {}).dup_otra_fecha === 1, '[D] el resumen lo cuenta (dice ' + (r.d.resumen || {}).dup_otra_fecha + ')');
    af((r.d.resumen || {}).hermanas_ilegibles === false, '[D] y dice que las hermanas SÍ se leyeron');

    // Ilse cuadra y no genera nada: el camino normal sigue vivo.
    af(!altas.some((n) => /Ilse/.test(n)), '[D] quien ya vive en ESTA fecha no sale como alta');
  }

  // ═══ [C] CONTROL POSITIVO POR CONSTRUCCIÓN: sin hermanas, el defecto vuelve ═
  // 🔒 Esto es lo que hace que el verde de [D] signifique algo. Se le quita al
  // careo la pieza nueva —las hermanas— y se exige que proponga LAS DOS altas,
  // o sea que reproduzca el defecto medido en producción.
  {
    const parchado = SEMILLA();
    // La hermana sale del padrón: es el mundo de antes de esta tuerca.
    parchado.viajeros_evento = parchado.viajeros_evento.filter((v) => v.id !== 'v-magnolia');
    const r = await correr({}, parchado);
    const altas = ((r.d.plan || {}).altas || []).map((a) => a.nombre);
    af(altas.length === 2, '🔒 [C] CONTROL POSITIVO: sin la fila de #5 se proponen LAS DOS (' + altas.length + ')');
    af(altas.some((n) => /Magnolia/.test(n)), '🔒 [C] y Magnolia es una de ellas — el defecto reproducido');
    af(((r.d.plan || {}).dup_otra_fecha || []).length === 0, '[C] y el montón de duplicados queda vacío');
  }

  // ═══ [N] HERMANAS ILEGIBLES: no se propone NADA, y se DICE ════════════════
  // ⚠️ El lado seguro, medido: equivocarse hacia «no propongo» cuesta capturar
  // un alta a mano; hacia «propongo» mete dinero inventado. Y un `altas: []`
  // sin razón se leería como «el Excel no trae gente nueva» — el cero falso.
  {
    const r = await correr({}, SEMILLA(), { hermanasCaidas: true });
    const plan = r.d.plan || {};
    af(!r.falta && r.res.statusCode === 200, '[N] con las hermanas caídas el careo NO truena (status ' + r.res.statusCode + ')');
    af((plan.altas || []).length === 0, '🔒 [N] NO propone ni una alta a ciegas (propuso ' + (plan.altas || []).length + ')');
    af(plan.hermanas_ilegibles === true, '🔒 [N] y lo DICE: hermanas_ilegibles=true');
    af(typeof plan.hermanas_motivo === 'string' && plan.hermanas_motivo.length > 10,
       '[N] con su motivo en palabras («' + String(plan.hermanas_motivo).slice(0, 60) + '…»)');
    const sal = (plan.saltados || []).filter((s) => s.montón === 'altas');
    af(sal.length === 2, '[N] y las dos quedan en saltados CON NOMBRE (' + sal.length + ')');
    af(sal.every((s) => /no sé si ya viaja/.test(s.motivo || '')), '[N] con el motivo que manda a mirar, no un error genérico');
    af((r.d.resumen || {}).hermanas_ilegibles === true, '[N] el resumen también lo dice');
  }

  // ═══ [E] EL MONTÓN NO SE APLICA NUNCA — medido por el HECHO ════════════════
  // 🔒 No por grep: se CONFIRMA el plan y se mira qué tablas se tocaron. Si
  // algún día alguien cablea `plan.dup_otra_fecha` a una escritura, aquí cae.
  {
    const r = await correr({ confirmar: true });
    af(!r.falta && r.d.confirmado === true, '[E] el clic con confirmar corre (confirmado=' + r.d.confirmado + ')');
    const nuevos = r.escrituras.filter((e) => e.tabla === 'viajeros_evento' && e.op === 'INSERT');
    af(nuevos.length === 1, '🔒 [E] nace UNA sola fila de viajero (nacieron ' + nuevos.length + ')');
    af(nuevos.length === 1 && /Brian/.test(nuevos[0].fila.nombre || ''),
       '🔒 [E] y es la legítima, no Magnolia (nació «' + (nuevos[0] && nuevos[0].fila.nombre) + '»)');
    const magnolia = r.escrituras.filter((e) => JSON.stringify(e).includes('Magnolia'));
    af(magnolia.length === 0, '🔒 [E] CERO escrituras mencionan a Magnolia (hubo ' + magnolia.length + ')');
    // El dinero de la hermana quedó intacto, byte a byte.
    const vm = (r.tablas.viajeros_evento || []).find((v) => v.id === 'v-magnolia');
    af(vm && Number(vm.total_contrato) === 3900 && Number(vm.abonado_previo) === 2865,
       '🔒 [E] su fila de #5 quedó INTACTA (tot ' + (vm && vm.total_contrato) + ' · prev ' + (vm && vm.abonado_previo) + ')');
    af((r.tablas.viajeros_evento || []).filter((v) => /Magnolia/.test(v.nombre || '')).length === 1,
       '🔒 [E] y sigue existiendo UNA sola Magnolia en toda la base');
    // El resumen del clic confirmado TAMBIÉN lo cuenta (sale del plan, no del
    // resultado: nadie obra este montón, así que «lo aplicado» sería 0 siempre
    // y el aviso desaparecería justo donde se mira).
    af((r.d.resumen || {}).dup_otra_fecha === 1, '[E] el resumen del confirmado lo sigue contando');
  }

  // ═══ [X] CARDINALIDAD DEL INSTRUMENTO ─────────────────────────────────────
  // Antes de creerle una AUSENCIA a un instrumento, que conteste algo que SÍ
  // existe: si la red falsa no leyó las hermanas, todos los ceros de arriba
  // serían ceros por falta de datos.
  {
    const r = await correr({});
    const conLike = r.lecturas.filter((l) => l.tabla === 'viajeros_evento' && /like\./.test(l.qs));
    af(conLike.length >= 1, '🔒 [X] el careo SÍ pidió las hermanas con like (pidió ' + conLike.length + ' vez/veces)');
    af(Array.isArray((r.d.plan || {}).dup_otra_fecha), '[X] el plan trae el montón como lista');
    af((r.lecturas || []).length > 3, '[X] y la red falsa sirvió lecturas de verdad (' + r.lecturas.length + ')');
  }

  console.log('─'.repeat(70));
  if (mal) { console.log('🔴 ROJO · ' + ok + ' en verde, ' + mal + ' en rojo'); fallos.forEach((f) => console.log('   ✗ ' + f)); }
  else if (!ok) console.log('⚠️ NADA MEDIDO · esto NO es un verde');
  else console.log('✅ VERDE · ' + ok + ' aserciones en verde, 0 en rojo');
  process.exit(mal ? 1 : 0);
})();
