#!/usr/bin/env node
// =============================================================================
// scripts/mide-puente-portal.js — EL CAREO DE MIG-1d-i
// =============================================================================
// Entra por el HANDLER REAL de `admin-portal-puente` y simula UN SALTO MÁS
// ADENTRO: el `fetch` contra PostgREST. La base de mentira respeta los MISMOS
// filtros (`eq.`, `in.`), guarda ESTADO (lo que se inserta se vuelve a leer) y
// usa los NOMBRES reales de columna — las tres formas en que un mock miente.
// Además modela el trigger `clientes_before_insert`: asigna `numero_cliente`
// desde una secuencia y baja el correo a minúsculas, como la base de verdad.
//
// 🔒 EL CANDADO DE MEMO: el careo mide EL HECHO de que el puente no toca dinero
// — cuenta las filas de `solicitudes_tour` y `pagos` ANTES y DESPUÉS y exige
// delta CERO. No es un grep de que el código no las nombra: la base falsa
// registra CUALQUIER escritura, a cualquier tabla, y si el handler tocara una
// se vería aquí. Con su CONTROL POSITIVO: un handler saboteado que sí escribe
// un pago tiene que poner el careo en ROJO.
// =============================================================================

const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

// ── LA BASE DE MENTIRA ───────────────────────────────────────────────────────
function baseFalsa(semilla) {
  const tablas = JSON.parse(JSON.stringify(semilla));
  const escrituras = [];
  let seq = 100;
  const KH = 'https://kh.test', PT = 'https://pt.test';

  const filtrar = (filas, qs) => {
    let out = filas;
    for (const [campo, expr] of qs.entries()) {
      if (['select', 'limit', 'order'].includes(campo)) continue;
      const m = /^eq\.(.*)$/.exec(expr);
      if (m) { out = out.filter((f) => String(f[campo]) === m[1]); continue; }
      const mi = /^in\.\((.*)\)$/.exec(expr);
      if (mi) {
        const vals = mi[1].split(',').map((v) => v.replace(/^"|"$/g, '').replace(/\\"/g, '"'));
        out = out.filter((f) => vals.includes(String(f[campo])));
        continue;
      }
      throw new Error('la base falsa no entiende el filtro: ' + campo + '=' + expr);
    }
    return out;
  };

  const fetchFalso = async (url, opts) => {
    const u = new URL(url);
    const cual = url.startsWith(KH) ? 'kh' : 'pt';
    const tabla = u.pathname.replace('/rest/v1/', '');
    const clave = cual + ':' + tabla;
    tablas[clave] = tablas[clave] || [];
    const met = (opts && opts.method) || 'GET';

    if (met === 'GET') {
      return { ok: true, status: 200, json: async () => filtrar(tablas[clave], u.searchParams), text: async () => '' };
    }
    if (met === 'POST') {
      const body = JSON.parse(opts.body);
      const filas = Array.isArray(body) ? body : [body];
      const puestas = filas.map((f) => {
        const fila = { id: 'id-' + (seq + 1), ...f };
        // El trigger de verdad: numero_cliente por secuencia cuando llega null,
        // y el correo a minúsculas.
        if (clave === 'pt:clientes') {
          if (fila.numero_cliente == null) fila.numero_cliente = ++seq;
          if (fila.correo) fila.correo = String(fila.correo).toLowerCase();
        }
        tablas[clave].push(fila);
        escrituras.push({ tabla: clave, op: 'INSERT', fila });
        return fila;
      });
      return { ok: true, status: 201, json: async () => puestas, text: async () => '' };
    }
    if (met === 'PATCH') {
      const parche = JSON.parse(opts.body);
      const tocadas = filtrar(tablas[clave], u.searchParams);
      tocadas.forEach((f) => { Object.assign(f, parche); escrituras.push({ tabla: clave, op: 'PATCH', fila: f }); });
      return { ok: true, status: 200, json: async () => tocadas, text: async () => '' };
    }
    throw new Error('método no modelado: ' + met);
  };
  return { tablas, escrituras, fetchFalso, KH, PT };
}

// ── LA SEMILLA: casos que el puente tiene que distinguir ─────────────────────
const SEMILLA = () => ({
  'kh:viajeros_evento': [
    { id: 'v1', evento_id: 'omar#0', nombre: 'Ana Ruiz',  correo: 'ANA@Correo.com', celular: '899', talla_playera: 'm',       emergencia_nombre: 'Luz', num_emergencia: '111', portal_cliente_id: null },
    { id: 'v2', evento_id: 'omar#0', nombre: 'Ana Ruiz',  correo: 'ana@correo.com', celular: null,  talla_playera: 'M',       emergencia_nombre: null,  num_emergencia: null,  portal_cliente_id: null },
    { id: 'v3', evento_id: 'omar#0', nombre: 'Beto Paz',  correo: null,             celular: '899', talla_playera: 'XL',      emergencia_nombre: null,  num_emergencia: null,  portal_cliente_id: null },
    { id: 'v4', evento_id: 'omar#0', nombre: 'Cris Mora', correo: 'cris@gmail.con', celular: '899', talla_playera: 'L',       emergencia_nombre: null,  num_emergencia: null,  portal_cliente_id: null },
    { id: 'v5', evento_id: 'omar#0', nombre: 'Dani Sol',  correo: 'dani@correo.com',celular: '899', talla_playera: 'Mediana', emergencia_nombre: null,  num_emergencia: null,  portal_cliente_id: null },
    { id: 'v6', evento_id: 'otro',   nombre: 'NO TOCAR',  correo: 'zzz@correo.com', celular: null,  talla_playera: 'S',       emergencia_nombre: null,  num_emergencia: null,  portal_cliente_id: null },
  ],
  'pt:clientes': [
    { id: 'c-eva', correo: 'dani@correo.com', nombre_completo: 'Dani Sol', auth_user_id: null, numero_cliente: 7 },
  ],
  'pt:solicitudes_tour': [],
  'pt:pagos': [],
});

async function correr(accion, base, saboteado) {
  delete require.cache[require.resolve(path.join(RAIZ, 'netlify/functions/admin-portal-puente.js'))];
  process.env.SUPABASE_URL_KAMEHOUSE = base.KH;
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  process.env.PORTAL_SUPABASE_URL = base.PT;
  process.env.PORTAL_SUPABASE_SERVICE_KEY = 'k';
  global.fetch = base.fetchFalso;

  // El PORTERO se ejercita, no se salta: se le pone un doble a la lib de auth
  // UN SALTO MÁS ADENTRO del handler, y se comprueba que el handler la llama.
  let llamadasAuth = 0;
  const va = require.resolve(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    verifyAdminAuthLive: async () => { llamadasAuth++; return { valid: true, user: { id: 'u1', nombre: 'Bulma' } }; },
  } };

  let mod = require(path.join(RAIZ, 'netlify/functions/admin-portal-puente.js'));
  if (saboteado) {
    const orig = base.fetchFalso;
    base.fetchFalso = async (url, opts) => {
      const r = await orig(url, opts);
      if (String(url).includes('/clientes') && opts && opts.method === 'POST') {
        await orig(base.PT + '/rest/v1/pagos', { method: 'POST', body: JSON.stringify({ monto: 1, estado: 'pagado' }) });
      }
      return r;
    };
    global.fetch = base.fetchFalso;
  }
  const res = await mod.handler({
    httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
    body: JSON.stringify({ evento_id: 'omar#0', accion }),
  });
  return { res, cuerpo: JSON.parse(res.body), llamadasAuth };
}

const cuenta = (b, t) => (b.tablas[t] || []).length;

(async () => {
  console.log('CAREO MIG-1d-i · el puente, por el handler REAL\n');

  // ── [1] VISTA PREVIA — nombres y motivos, antes de escribir nada ───────────
  let b = baseFalsa(SEMILLA());
  let { cuerpo: prev, llamadasAuth } = await correr('vista_previa', b);
  console.log('[1] vista previa');
  af(llamadasAuth === 1, 'el handler no llamó al portero (verifyAdminAuthLive)');
  af(b.escrituras.length === 0, 'la VISTA PREVIA escribió ' + b.escrituras.length + ' veces — debe ser 0');
  console.log('    escrituras durante la vista previa: ' + b.escrituras.length + ' (debe ser 0)');
  console.log('    ' + JSON.stringify(prev.resumen));
  af(prev.resumen.viajeros === 5, 'no filtró por evento: trajo ' + prev.resumen.viajeros + ' (el de otro evento se coló)');
  // 5 filas del evento → 2 PERSONAS con correo usable: Ana (dos filas, una sola
  // persona) y Dani. Beto no trae correo y Cris lo trae mal escrito: ésos se
  // saltan, no son personas de esta lista. (Aquí puse 3 la primera vez y el
  // careo se puso rojo: la aritmética era mía, no del código.)
  af(prev.resumen.personas === 2, 'personas=' + prev.resumen.personas + ', se esperaban 2 (Ana dedup + Dani)');
  af(prev.resumen.reciben_cuenta_nueva === 1, 'cuentas nuevas=' + prev.resumen.reciben_cuenta_nueva + ', se esperaba 1 (Ana)');
  af(prev.resumen.ya_existian_en_portal === 1, 'ya existían=' + prev.resumen.ya_existian_en_portal + ', se esperaba 1 (Dani)');
  af(prev.saltados.length === 2, 'saltados=' + prev.saltados.length + ', se esperaban 2');
  console.log('    se saltan CON NOMBRE Y MOTIVO:');
  prev.saltados.forEach((s) => console.log('      · ' + s.nombre + ' — ' + s.motivo));
  af(prev.saltados.some((s) => s.motivo.includes('sin correo')), 'falta el motivo «sin correo»');
  af(prev.saltados.some((s) => s.motivo.includes('forma de correo')), 'falta el motivo del correo mal escrito (gmail.con)');
  af(prev.nuevos.every((n) => n.nombre), 'la lista de nuevos no trae nombres — un número pelón no se confirma');

  // ── [2] EJECUTAR — y EL HECHO de que no toca dinero ───────────────────────
  b = baseFalsa(SEMILLA());
  const antes = { sol: cuenta(b, 'pt:solicitudes_tour'), pag: cuenta(b, 'pt:pagos') };
  const { cuerpo: eje } = await correr('ejecutar', b);
  const despues = { sol: cuenta(b, 'pt:solicitudes_tour'), pag: cuenta(b, 'pt:pagos') };
  console.log('\n[2] ejecutar');
  console.log('    ' + JSON.stringify(eje.resumen));
  console.log('    solicitudes_tour  antes ' + antes.sol + '  después ' + despues.sol + '   Δ ' + (despues.sol - antes.sol));
  console.log('    pagos             antes ' + antes.pag + '  después ' + despues.pag + '   Δ ' + (despues.pag - antes.pag));
  af(despues.sol - antes.sol === 0, 'EL PUENTE TOCÓ solicitudes_tour: Δ ' + (despues.sol - antes.sol));
  af(despues.pag - antes.pag === 0, 'EL PUENTE TOCÓ pagos: Δ ' + (despues.pag - antes.pag));
  const tablasTocadas = [...new Set(b.escrituras.map((e) => e.tabla))];
  console.log('    tablas escritas: ' + tablasTocadas.join(', '));
  af(tablasTocadas.every((t) => t === 'pt:clientes' || t === 'kh:viajeros_evento'),
     'escribió en una tabla que no le toca: ' + tablasTocadas.join(', '));

  // ── [3] DEDUP, TALLA Y numero_cliente ─────────────────────────────────────
  console.log('\n[3] las trampas');
  const nuevosCli = b.escrituras.filter((e) => e.tabla === 'pt:clientes' && e.op === 'INSERT');
  af(nuevosCli.length === 1, 'se crearon ' + nuevosCli.length + ' clientes; Ana tiene DOS filas y debe dar UNA cuenta');
  const ana = nuevosCli[0];
  console.log('    Ana: 2 filas → ' + nuevosCli.length + ' cuenta · numero_cliente ' + ana.fila.numero_cliente);
  const filasAna = b.tablas['kh:viajeros_evento'].filter((v) => ['v1', 'v2'].includes(v.id));
  af(filasAna.every((f) => f.portal_cliente_id === ana.fila.id), 'no se marcaron TODAS las filas de Ana');
  console.log('    sus 2 filas marcadas: ' + filasAna.filter((f) => f.portal_cliente_id).length + '/2');
  af(ana.fila.talla_playera === 'M', 'la talla «m» debió normalizarse a M y llegó ' + ana.fila.talla_playera);
  console.log('    talla «m» → ' + ana.fila.talla_playera);
  // numero_cliente: el handler NO lo manda; lo pone la base.
  const mandoNumero = Object.prototype.hasOwnProperty.call(
    JSON.parse(JSON.stringify(ana.fila)), 'numero_cliente');
  af(mandoNumero && typeof ana.fila.numero_cliente === 'number', 'numero_cliente no quedó asignado');
  const filaDani = b.tablas['kh:viajeros_evento'].find((v) => v.id === 'v5');
  af(filaDani.portal_cliente_id === 'c-eva', 'a Dani no se le enlazó su cuenta YA EXISTENTE (se duplicó o se ignoró)');
  console.log('    Dani (ya existía): enlazada a ' + filaDani.portal_cliente_id + ', sin crear cuenta nueva');
  const otro = b.tablas['kh:viajeros_evento'].find((v) => v.id === 'v6');
  af(otro.portal_cliente_id === null, 'tocó al viajero de OTRO evento');

  // ── [4] SEGUNDO CLIC: no repite ───────────────────────────────────────────
  const escrituras1 = b.escrituras.length;
  const b2 = { ...b, escrituras: [] };
  b2.fetchFalso = b.fetchFalso; b2.tablas = b.tablas;
  await correr('ejecutar', b2);
  console.log('\n[4] segundo clic');
  console.log('    escrituras del 1er clic: ' + escrituras1 + '  ·  del 2º: ' + b2.escrituras.length);
  af(b2.escrituras.filter((e) => e.tabla === 'pt:clientes').length === 0, 'el segundo clic creó cuentas otra vez');

  // ── [5] CONTROL POSITIVO del medidor de dinero ────────────────────────────
  // Si el contador no puede ponerse rojo, su cero no dice nada.
  const b3 = baseFalsa(SEMILLA());
  const antes3 = cuenta(b3, 'pt:pagos');
  await correr('ejecutar', b3, true);   // saboteado: escribe un pago
  const despues3 = cuenta(b3, 'pt:pagos');
  console.log('\n[5] CONTROL POSITIVO (handler saboteado que SÍ escribe un pago)');
  console.log('    pagos antes ' + antes3 + '  después ' + despues3 + '   Δ ' + (despues3 - antes3));
  af(despues3 - antes3 > 0, 'el contador NO vio un pago escrito a propósito: el Δ 0 de arriba no vale nada');

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); process.exit(1); });
